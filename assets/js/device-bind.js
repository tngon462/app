// ===============================
//  device-bind.js v3 (Code Gate cứng + màn chắn)
//  - Chặn toàn trang cho tới khi nhập mã iPad hợp lệ
//  - Không có nút hủy; sai mã chỉ hiện lỗi, không cho qua
//  - Admin commands: reload, setTable, unbind
// ===============================

if (!firebase.apps.length) {
  // firebaseConfig được load từ /assets/js/firebase.js trước file này
  firebase.initializeApp(firebaseConfig);
}
firebase.auth().signInAnonymously().catch(console.error);

const LS = window.localStorage;

// ====== UI helpers ======
const $ = (id) => document.getElementById(id);
function setTableText(t) { const el = $('selected-table'); if (el) el.textContent = t || ''; }

// ====== Màn chắn cứng (chặn toàn bộ thao tác) ======
function ensureBootShield() {
  if ($('boot-shield')) return;
  const el = document.createElement('div');
  el.id = 'boot-shield';
  el.style.cssText = [
    'position:fixed','inset:0','background:#fff','z-index:5000',
    'display:flex','align-items:center','justify-content:center','padding:16px'
  ].join(';');
  el.innerHTML = `
    <div class="w-full max-w-sm text-center">
      <h1 class="text-2xl font-extrabold text-gray-900 mb-3">Đang kiểm tra thiết bị…</h1>
      <p class="text-sm text-gray-500">Vui lòng đợi trong giây lát.</p>
      <div class="mt-4 animate-pulse text-gray-400">● ● ●</div>
    </div>`;
  document.body.appendChild(el);
}
function removeBootShield() {
  const el = $('boot-shield'); if (el) el.remove();
}

// ====== Cổng nhập mã (không hủy) ======
function showCodeGate(message) {
  // Ẩn toàn bộ UI app
  ['select-table','start-screen','pos-container'].forEach(id => { const x=$(id); if (x) x.classList.add('hidden'); });

  // Tạo gate nếu chưa có
  let gate = $('code-gate');
  if (!gate) {
    gate = document.createElement('div');
    gate.id = 'code-gate';
    gate.style.cssText = 'position:fixed;inset:0;background:#fff;z-index:6000;';
    gate.innerHTML = `
      <div class="w-full h-full flex items-center justify-center p-6">
        <div class="w-full max-w-sm bg-white border border-gray-200 rounded-2xl shadow p-6">
          <h1 class="text-2xl font-extrabold text-gray-900 mb-4 text-center">Nhập mã iPad</h1>
          <p class="text-sm text-gray-500 mb-4 text-center">Mỗi thiết bị chỉ dùng 1 mã. Nhập mã được cấp để tiếp tục.</p>
          <input id="code-input" type="text" maxlength="20" placeholder="VD: A1B2C3"
                 class="w-full border rounded-lg px-4 py-3 text-center tracking-widest font-mono text-lg"
                 inputmode="latin" autocomplete="one-time-code" />
          <div id="code-error" class="text-red-600 text-sm mt-2 h-5"></div>
          <button id="code-submit"
            class="mt-4 w-full rounded-xl bg-blue-600 text-white font-bold py-3 hover:bg-blue-700 transition">
            XÁC NHẬN
          </button>
          <div class="text-xs text-gray-400 mt-3 text-center">Bạn cần nhập đúng mã để vào ứng dụng.</div>
        </div>
      </div>`;
    document.body.appendChild(gate);

    const input = $('code-input');
    const btn   = $('code-submit');
    const errEl = $('code-error');

    function setBusy(b){ btn.disabled=b; btn.textContent = b ? 'Đang kiểm tra…' : 'XÁC NHẬN'; }

    async function submit(){
      const raw = (input.value||'').trim().toUpperCase();
      errEl.textContent = '';
      if(!raw){ errEl.textContent='Vui lòng nhập mã.'; return; }
      setBusy(true);
      try{
        await bindCodeToDevice(raw); // ném lỗi nếu sai/đang dùng ở máy khác
        // thành công -> gỡ gate và vào app
        gate.remove();
        enterAppAfterBound();
      }catch(e){
        errEl.textContent = (e && e.message) ? e.message : 'Không dùng được mã này.';
      }finally{
        setBusy(false);
      }
    }
    btn.addEventListener('click', submit);
    input.addEventListener('keydown', (e)=>{ if(e.key==='Enter') submit(); });
    setTimeout(()=> input.focus(), 60);
  }

  if (message) {
    const errEl = $('code-error');
    if (errEl) errEl.textContent = message;
  }
}

function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{
    const r=Math.random()*16|0, v=c==='x'?r:(r&0x3|0x8); return v.toString(16);
  });
}

let deviceId = LS.getItem('deviceId');
if (!deviceId) { deviceId = uuidv4(); LS.setItem('deviceId', deviceId); }

// ====== Firebase ops ======
async function bindCodeToDevice(code) {
  const codeRef = firebase.database().ref('codes/' + code);
  await codeRef.transaction(data => {
    if (!data) return null;                // mã không tồn tại
    if (data.enabled === false) return;    // mã bị tắt
    if (!data.boundDeviceId || data.boundDeviceId === deviceId) {
      return { ...data, boundDeviceId: deviceId, boundAt: firebase.database.ServerValue.TIMESTAMP };
    }
    return; // đã gắn máy khác
  }, (error, committed) => {
    if (error) throw error;
    if (!committed) throw new Error('Mã không khả dụng hoặc đã dùng ở thiết bị khác.');
  });

  await firebase.database().ref('devices/' + deviceId).update({
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

    if (c.reloadAt) { location.reload(true); return; }

    if (c.setTable && c.setTable.value) {
      const newTable = c.setTable.value;
      LS.setItem('tableNumber', newTable);
      setTableText(newTable);
      cmdRef.child('setTable').remove();
    }

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

  firebase.database().ref('broadcast/reloadAt').on('value', s => { if (s.val()) location.reload(true); });
}

// ====== Sau khi đã hợp lệ -> mở khóa app ======
function enterAppAfterBound() {
  removeBootShield();
  // Mở lại UI app
  ['select-table'].forEach(id => { const x=$(id); if (x) x.classList.remove('hidden'); });
  // Đồng bộ số bàn
  setTableText(LS.getItem('tableNumber') || '');
  startHeartbeat();
  listenCommands();
}

// ====== Quy trình khởi chạy ======
document.addEventListener('DOMContentLoaded', async () => {
  ensureBootShield();

  // Ẩn toàn bộ UI app cho chắc chắn
  ['select-table','start-screen','pos-container'].forEach(id => { const x=$(id); if (x) x.classList.add('hidden'); });
  setTableText(LS.getItem('tableNumber') || '');

  // Kiểm tra code đang có (nếu có)
  let code = LS.getItem('deviceCode');
  if (!code) { showCodeGate(); return; }

  try {
    const snap = await firebase.database().ref('codes/' + code).once('value');
    const data = snap.val();
    if (!data) throw new Error('Mã không tồn tại.');
    if (data.enabled === false) throw new Error('Mã đã bị tắt.');
    if (data.boundDeviceId && data.boundDeviceId !== deviceId) {
      LS.removeItem('deviceCode');
      throw new Error('Mã đã gắn với thiết bị khác.');
    }
    // OK
    enterAppAfterBound();
  } catch (e) {
    showCodeGate(e?.message || null);
  }
});
