// ===============================================
// device-bind.js v7 (Single Overlay, Zero Blink)
// - Không dùng html.gating; chỉ 1 overlay che app đến khi qua mã
// - Admin: reload, setTable (jump Start), unbind (auto reload về gate)
// ===============================================

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
firebase.auth().signInAnonymously().catch(console.error);

const LS = window.localStorage;
const $  = (id) => document.getElementById(id);

function uuidv4(){
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c=>{
    const r = Math.random()*16|0, v = c==='x'?r:(r&0x3|0x8);
    return v.toString(16);
  });
}
let deviceId = LS.getItem('deviceId');
if (!deviceId) { deviceId = uuidv4(); LS.setItem('deviceId', deviceId); }

// ---------- Overlay (chỉ tạo 1 lần) ----------
function ensureOverlay() {
  let ov = $('code-overlay');
  if (ov) return ov;

  ov = document.createElement('div');
  ov.id = 'code-overlay';
  ov.style.cssText = [
    'position:fixed','inset:0','z-index:6000','background:#fff',
    'display:flex','align-items:center','justify-content:center','padding:16px'
  ].join(';');
  ov.innerHTML = `
    <div id="gate-wrapper" class="w-full max-w-sm bg-white border border-gray-200 rounded-2xl shadow p-6">
      <h1 class="text-2xl font-extrabold text-gray-900 mb-4 text-center">Nhập mã iPad</h1>
      <p class="text-sm text-gray-500 mb-4 text-center">Nhập đúng mã để tiếp tục. Không có nút hủy.</p>
      <input id="code-input" type="text" maxlength="20" placeholder="VD: A1B2C3"
             class="w-full border rounded-lg px-4 py-3 text-center tracking-widest font-mono text-lg"
             inputmode="latin" autocomplete="one-time-code" />
      <div id="code-error" class="text-red-600 text-sm mt-2 h-5"></div>
      <button id="code-submit"
        class="mt-4 w-full rounded-xl bg-blue-600 text-white font-bold py-3 hover:bg-blue-700 transition">
        XÁC NHẬN
      </button>
    </div>
  `;
  document.body.appendChild(ov);

  const input = $('code-input');
  const btn   = $('code-submit');
  const errEl = $('code-error');

  function setBusy(b){ btn.disabled = b; btn.textContent = b ? 'Đang kiểm tra…' : 'XÁC NHẬN'; }
  async function submit(){
    const raw = (input.value||'').trim().toUpperCase();
    errEl.textContent = '';
    if (!raw) { errEl.textContent = 'Vui lòng nhập mã.'; return; }
    setBusy(true);
    try {
      await bindCodeToDevice(raw); // ném lỗi nếu sai/đang dùng
      hideOverlay();               // ẩn overlay 1 lần duy nhất
      enterAppOnce();              // vào app
    } catch (e) {
      errEl.textContent = (e && e.message) ? e.message : 'Không dùng được mã này.';
    } finally {
      setBusy(false);
    }
  }
  btn.addEventListener('click', submit);
  input.addEventListener('keydown', (e)=>{ if(e.key==='Enter') submit(); });
  setTimeout(()=> input?.focus(), 60);

  return ov;
}
function showOverlay(message){
  const ov = ensureOverlay();
  ov.style.display = 'flex';
  const errEl = $('code-error');
  if (message && errEl) errEl.textContent = message;
}
function hideOverlay(){
  const ov = $('code-overlay');
  if (ov) ov.style.display = 'none';
}

// ---------- Firebase ops ----------
async function bindCodeToDevice(code){
  const codeRef = firebase.database().ref('codes/'+code);
  await codeRef.transaction(data=>{
    if(!data) return null;                 // không tồn tại
    if(data.enabled===false) return;       // bị tắt
    if(!data.boundDeviceId || data.boundDeviceId===deviceId){
      return {...data, boundDeviceId: deviceId, boundAt: firebase.database.ServerValue.TIMESTAMP};
    }
    return; // đang gắn máy khác
  }, (error, committed)=>{
    if (error) throw error;
    if (!committed) throw new Error('Mã không khả dụng hoặc đã dùng ở thiết bị khác.');
  });

  await firebase.database().ref('devices/'+deviceId).update({
    code,
    lastSeen: firebase.database.ServerValue.TIMESTAMP,
    info: { ua: navigator.userAgent }
  });
  LS.setItem('deviceCode', code);
}

function startHeartbeat(){
  setInterval(()=>{
    firebase.database().ref('devices/'+deviceId).update({
      lastSeen: firebase.database.ServerValue.TIMESTAMP
    });
  }, 30*1000);
}

function listenCommands(){
  const cmdRef = firebase.database().ref('devices/'+deviceId+'/commands');
  cmdRef.on('value', s=>{
    const c = s.val()||{};

    // 1) Reload toàn trang
    if (c.reloadAt) { location.reload(true); return; }

    // 2) Set table -> nhảy Start Order
    if (c.setTable && c.setTable.value) {
      const t = c.setTable.value;
      LS.setItem('tableNumber', t);
      show('start-screen'); hide('select-table'); hide('pos-container');
      setTableText(t);
      const startBtn = $('start-order'); if (startBtn) { try{ startBtn.scrollIntoView({block:'center'}); }catch(_){ } }
      cmdRef.child('setTable').remove();
      firebase.database().ref('devices/'+deviceId).update({ table: t });
    }

    // 3) Unbind -> xoá mã & reload về gate
    if (c.unbindAt) {
      try { LS.removeItem('deviceCode'); LS.removeItem('tableNumber'); }
      finally { location.reload(true); }
    }
  });

  // Broadcast reload toàn bộ
  firebase.database().ref('broadcast/reloadAt').on('value', s=>{
    if (s.val()) location.reload(true);
  });
}

// ---------- Vào app (đảm bảo chỉ 1 lần) ----------
let entered = false;
function enterAppOnce(){
  if (entered) return;
  entered = true;

  // Mặc định về “Chọn bàn”, không đụng gì khác
  show('select-table'); hide('start-screen'); hide('pos-container');
  setTableText(LS.getItem('tableNumber') || '');

  startHeartbeat();
  listenCommands();
}

// ---------- Boot ----------
document.addEventListener('DOMContentLoaded', async ()=>{
  // Ẩn nháy: không đụng UI gốc ngoài 3 dòng sau
  hideOverlay(); // tạo sẵn overlay nhưng ẩn (nếu chưa có sẽ được ensure khi show)
  ['select-table','start-screen','pos-container'].forEach(id=>{ const el=$(id); if(el) el.classList.add('hidden'); });
  setTableText(LS.getItem('tableNumber') || '');

  // Có mã sẵn?
  const code = LS.getItem('deviceCode');
  if (!code) { showOverlay(); return; }

  try {
    const snap = await firebase.database().ref('codes/'+code).once('value');
    const data = snap.val();
    if (!data) throw new Error('Mã không tồn tại.');
    if (data.enabled === false) throw new Error('Mã đã bị tắt.');
    if (data.boundDeviceId && data.boundDeviceId !== deviceId) {
      LS.removeItem('deviceCode');
      throw new Error('Mã đã gắn với thiết bị khác.');
    }
    // OK -> vào app và ẩn overlay
    hideOverlay();
    enterAppOnce();
  } catch (e) {
    showOverlay(e?.message || null);
  }
});
