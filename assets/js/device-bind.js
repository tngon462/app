// ===============================
//  device-bind.js
//  Gắn mã iPad, nhận lệnh từ admin (reload, đổi số bàn)
// ===============================

// Nếu chưa có firebase app thì khởi tạo
if (!firebase.apps.length) {
  // Lấy cấu hình từ file /assets/js/firebase.js
  // (File này sếp đã có sẵn trong dự án QR)
  firebase.initializeApp(firebaseConfig);
}

firebase.auth().signInAnonymously().catch(console.error);

// ===== Helper =====
function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

const LS = window.localStorage;
let deviceId = LS.getItem('deviceId');
if (!deviceId) {
  deviceId = uuidv4();
  LS.setItem('deviceId', deviceId);
}

// ===== Hàm chính =====

async function bindCodeToDevice(code) {
  const codeRef = firebase.database().ref('codes/' + code);

  // Transaction đảm bảo 1 mã chỉ gắn được 1 máy
  await codeRef.transaction(data => {
    if (!data) return null; // mã không tồn tại
    if (data.enabled === false) return; // mã bị tắt
    if (!data.boundDeviceId || data.boundDeviceId === deviceId) {
      return {
        ...data,
        boundDeviceId: deviceId,
        boundAt: firebase.database.ServerValue.TIMESTAMP
      };
    }
    return; // mã đã gắn với máy khác
  }, (error, committed) => {
    if (error) throw error;
    if (!committed) throw new Error('Mã không khả dụng hoặc đã được sử dụng.');
  });

  // Cập nhật thông tin thiết bị
  const devRef = firebase.database().ref('devices/' + deviceId);
  await devRef.update({
    code,
    lastSeen: firebase.database.ServerValue.TIMESTAMP,
    info: { ua: navigator.userAgent }
  });
}

async function promptForCodeOnce() {
  let code = LS.getItem('deviceCode');
  if (code) return code;

  code = (window.prompt('Nhập mã iPad được cấp (VD: A1B2C3)') || '').trim().toUpperCase();
  if (!code) throw new Error('Chưa nhập mã');

  await bindCodeToDevice(code);
  LS.setItem('deviceCode', code);
  return code;
}

async function ensureBound() {
  let code = LS.getItem('deviceCode');

  try {
    if (!code) code = await promptForCodeOnce();

    const snap = await firebase.database().ref('codes/' + code).once('value');
    const data = snap.val();

    if (!data) throw new Error('Mã không tồn tại');
    if (data.boundDeviceId && data.boundDeviceId !== deviceId) {
      LS.removeItem('deviceCode');
      throw new Error('Mã đã gắn cho thiết bị khác, vui lòng nhập mã khác');
    }

    // Heartbeat: cập nhật lastSeen mỗi 30s
    setInterval(() => {
      firebase.database().ref('devices/' + deviceId).update({
        lastSeen: firebase.database.ServerValue.TIMESTAMP
      });
    }, 30 * 1000);

    // Lắng nghe lệnh riêng cho máy này
    const cmdRef = firebase.database().ref('devices/' + deviceId + '/commands');
    cmdRef.on('value', s => {
      const c = s.val() || {};

      // Lệnh reload
      if (c.reloadAt) {
        console.log('Nhận lệnh reload, thực hiện tải lại trang...');
        location.reload(true);
      }

      // Lệnh đổi số bàn
      if (c.setTable && c.setTable.value) {
        const newTable = c.setTable.value;
        LS.setItem('tableNumber', newTable);
        console.log('Đổi số bàn thành:', newTable);

        // Cập nhật hiển thị UI nếu có phần tử #selected-table
        const el = document.getElementById('selected-table');
        if (el) el.textContent = newTable;

        // Xóa lệnh để tránh lặp
        cmdRef.child('setTable').remove();
      }
    });

    // Lắng nghe lệnh broadcast reload (toàn bộ)
    firebase.database().ref('broadcast/reloadAt').on('value', s => {
      if (s.val()) {
        console.log('Nhận lệnh broadcast reload toàn bộ');
        location.reload(true);
      }
    });

  } catch (e) {
    alert(e.message || e);
    LS.removeItem('deviceCode');
    await promptForCodeOnce();
    return ensureBound();
  }
}

// Gọi khi app khởi chạy
ensureBound();

// ===== Tùy chọn hiển thị số bàn khi mở lại app =====
document.addEventListener('DOMContentLoaded', () => {
  const t = LS.getItem('tableNumber') || '';
  const el = document.getElementById('selected-table');
  if (el) el.textContent = t;
});
