// ===============================
//  device-bind.js (v2 - Code Gate)
//  - BẮT buộc nhập mã iPad trên màn hình chặn toàn trang (không có nút hủy)
//  - Hợp lệ mới cho vào app
//  - Nhận lệnh admin: reload, đổi số bàn, đẩy ra (unbind)
// ===============================

if (!firebase.apps.length) {
  // Đã load firebaseConfig từ /assets/js/firebase.js trước file này
  firebase.initializeApp(firebaseConfig);
}
firebase.auth().signInAnonymously().catch(console.error);

const LS = window.localStorage;

// ===== UI helpers =====
function hideById(id) { const el = document.getElementById(id); if (el) el.classList.add('hidden'); }
function showById(id) { const el = document.getElementById(id); if (el) el.classList.remove('hidden'); }
function setTableText(t) { const el = document.getElementById('selected-table'); if (el) el.textContent = t || ''; }

function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0; const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

let deviceId = LS.getItem('deviceId');
if (!deviceId) { deviceId = uuidv4(); LS.setItem('deviceId', deviceId); }

// ===== Firebase ops =====
async function bindCodeToDevice(code) {
  const codeRef = firebase.database().ref('codes/' + code);

  await codeRef.transaction(data => {
    if (!data) return null;                // mã không tồn tại
    if (data.enabled === false) return;    // mã bị tắt
    if (!data.boundDeviceId || data.boundDeviceId === deviceId) {
      return { ...data, boundDeviceId: deviceId, boundAt: firebase.database.ServerValue.TIMESTAMP };
    }
    return; // đã gắn với máy khác -> fail (không commit)
  }, (error, committed) => {
    if (error) throw error;
    if (!committed) throw new Error('Mã không khả dụng hoặc đã dùng ở thiết bị khác.');
  });

  const devRef = firebase.database().ref('devices/' + deviceId);
  await devRef.update({
    code,
    lastSeen: firebase.database.ServerValue.TIMESTAMP,
    info: { ua: navigator.userAgent }
  });

  LS.setItem('deviceCode', code);
}

function startHeartbeat() {
  setInterval(() => {
    firebase.database().ref('devices/' + deviceId).update({
      lastSeen: firebase.database.ServerValue.TIMESTAMP
    });
  }, 30 * 1000);
}

function listenCommands() {
  const cmdRef = firebase.database().ref('devices/' + deviceId + '/commands');
  cmdRef.on('value', s => {
    const c = s.val() || {};

    // Reload
    if (c.reloadAt) {
      location.reload(true);
      return;
    }

    // Đổi số bàn
    if (c.setTable && c.setTable.value) {
      const newTable = c.setTable.value;
      LS.setItem('tableNumber', newTable);
      setTableText(newTable);
      cmdRef.child('setTable').remove();
    }

    // ĐẨY RA (UNBIND)
    if (c.unbindAt) {
      try {
        LS.removeItem('deviceCode');
        LS.removeItem('tableNumber');
      } finally {
        alert('Thiết bị đã bị admin đẩy ra. Vui lòng nhập mã lại.');
        location.reload(true);
      }
    }
  });

  // Broadcast reload toàn bộ
  firebase.database().ref('broadcast/reloadAt').on('value', s => {
    if (s.val()) location.reload(true);
  });
}

// ===== Code Gate (full screen, no cancel) =====
function buildCodeGate() {
  // Ẩn các màn app cho chắc chắn (không cho lộ)
  hideById('select-table');
  hideById('start-screen');
  hideById('pos-container');

  // Nếu đã có code hợp lệ trong LS thì không dựng gate
  // (sẽ verify ở bước ensureBoundAndEnter)
  const gate = document.createElement('div');
  gate.id = 'code-gate';
  gate.style.position = 'fixed';
  gate.style.inset = '0';
  gate.style.background = '#fff';
  gate.style.zIndex = '3000';
  gate.innerHTML = `
    <div class="w-full h-full flex items-center justify-center p-6">
      <div class="w-full max-w-sm bg-white border border-gray-200 rounded-2xl shadow p-6">
        <h1 class="text-2xl font-extrabold text-gray-900 mb-4 text-center">Nhập mã iPad</h1>
        <p class="text-sm text-gray-500 mb-4 text-center">Mỗi thiết bị chỉ dùng 1 mã. Nhập mã được cấp để tiếp tục.</p>
        <input id="code-input" type="text" maxlength="16" placeholder="VD: A1B
