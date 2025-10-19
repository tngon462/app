// ===============================
//  device-bind.js
//  Gắn mã iPad, nhận lệnh từ admin (reload, đổi số bàn, ĐẨY RA)
// ===============================

if (!firebase.apps.length) {
  // Lấy cấu hình từ /assets/js/firebase.js (đã load trước file này)
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

async function bindCodeToDevice(code) {
  const codeRef = firebase.database().ref('codes/' + code);
  await codeRef.transaction(data => {
    if (!data) return null; // mã không tồn tại
    if (data.enabled === false) return; // mã bị tắt
    if (!data.boundDeviceId || data.boundDeviceId === deviceId) {
      return { ...data, boundDeviceId: deviceId, boundAt: firebase.database.ServerValue.TIMESTAMP };
    }
    return; // đã gắn máy khác
  }, (error, committed) => {
    if (error) throw error;
    if (!committed) throw new Error('Mã không khả dụng hoặc đã được sử dụng.');
  });

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

    // Heartbeat
    setInterval(() => {
      firebase.database().ref('devices/' + deviceId).update({
        lastSeen: firebase.database.ServerValue.TIMESTAMP
      });
    }, 30 * 1000);

    // Lắng nghe lệnh riêng cho máy này
    const cmdRef = firebase.database().ref('devices/' + deviceId + '/commands');
    cmdRef.on('value', s => {
      const c = s.val() || {};

      // Reload
      if (c.reloadAt) {
        location.reload(true);
      }

      // Đổi số bàn
      if (c.setTable && c.setTable.value) {
        const newTable = c.setTable.value;
        LS.setItem('tableNumber', newTable);
        const el = document.getElementById('selected-table');
        if (el) el.textContent = newTable;
        cmdRef.child('setTable').remove();
      }

      // ✅ ĐẨY RA (UNBIND)
      if (c.unbindAt) {
        try {
          // Xóa nội bộ & reload để yêu cầu nhập mã lại
          LS.removeItem('deviceCode');
          LS.removeItem('tableNumber');
        } finally {
          alert('Thiết bị của bạn đã bị admin đẩy ra. Vui lòng nhập mã lại.');
          location.reload(true);
        }
      }
    });

    // Broadcast reload toàn bộ
    firebase.database().ref('broadcast/reloadAt').on('value', s => {
      if (s.val()) location.reload(true);
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

// Hiển thị số bàn lúc vào trang
document.addEventListener('DOMContentLoaded', () => {
  const t = LS.getItem('tableNumber') || '';
  const el = document.getElementById('selected-table');
  if (el) el.textContent = t;
});
