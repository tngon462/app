// ===============================================
//  device-bind.js v4b
//  - Gate toàn trang (no cancel), state machine anti-blink
//  - Bật/tắt class `gating` để khóa/mở UI gốc ngay từ đầu
//  - Admin commands: reload, setTable (nhảy Start Order), unbind (auto reload về gate)
// ===============================================

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig); // từ /assets/js/firebase.js
}
firebase.auth().signInAnonymously().catch(console.error);

const LS = window.localStorage;
const $  = (id) => document.getElementById(id);

// ------- State machine -------
const STATE = { INIT: 'INIT', GATE: 'GATE', APP: 'APP' };
let currentState = STATE.INIT;

// ------- Helpers UI -------
const lockUI   = () => document.documentElement.classList.add('gating');
const unlockUI = () => document.documentElement.classList.remove('gating');

function show(id){ const el=$(id); if(el) el.classList.remove('hidden'); }
function hide(id){ const el=$(id); if(el) el.classList.add('hidden'); }
function setTableText(t){ const el=$('selected-table'); if(el) el.textContent = t||''; }

function uuidv4(){return'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0,v=c==='x'?r:(r&0x3|0x8);return v.toString(16);});}
let deviceId = LS.getItem('deviceId') || (LS.setItem('deviceId', uuidv4()), LS.getItem('deviceId'));

// ------- Shields / Gate -------
function ensureBootShield(){
  if ($('boot-shield')) return;
  const el = document.createElement('div');
  el.id = 'boot-shield';
  el.style.cssText = 'position:fixed;inset:0;background:#fff;z-index:5000;display:flex;align-items:center;justify-content:center;padding:16px';
  el.innerHTML = `
    <div class="w-full max-w-sm text-center">
      <h1 class="text-2xl font-extrabold text-gray-900 mb-3">Đang kiểm tra thiết bị…</h1>
      <p class="text-sm text-gray-500">Vui lòng đợi trong giây lát.</p>
      <div class="mt-4 animate-pulse text-gray-400">● ● ●</div>
    </div>`;
  document.body.appendChild(el);
}
function removeBootShield(){ const el=$('boot-shield'); if(el) el.remove(); }

function showCodeGate(message){
  // Khoá UI app tuyệt đối
  lockUI();
  ['select-table','start-screen','pos-container'].forEach(hide);

  if (currentState === STATE.GATE) {
    const e=$('code-error'); if(e&&message) e.textContent=message;
    return;
  }
  currentState = STATE.GATE;

  let gate = $('code-gate');
  if (!gate){
    gate = document.createElement('div');
    gate.id = 'code-gate';
    gate.style.cssText = 'position:fixed;inset:0;background:#fff;z-index:6000;';
    gate.innerHTML = `
      <div class="w-full h-full flex items-center justify-center p-6">
        <div class="w-full max-w-sm bg-white border border-gray-200 rounded-2xl shadow p-6">
          <h1 class="text-2xl font-extrabold text-gray-900 mb-4 text-center">Nhập mã iPad</h1>
          <p class="text-sm text-gray-500 mb-4 text-center">Nhập mã được cấp để tiếp tục.</p>
          <input id="code-input" type="text" maxlength="20" placeholder="VD: A1B2C3"
                 class="w-full border rounded-lg px-4 py-3 text-center tracking-widest font-mono text-lg"
                 inputmode="latin" autocomplete="one-time-code" />
          <div id="code-error" class="text-red-600 text-sm mt-2 h-5"></div>
          <button id="code-submit"
            class="mt-4 w-full rounded-xl bg-blue-600 text-white font-bold py-3 hover:bg-blue-700 transition">
            XÁC NHẬN
          </button>
        </div>
      </div>`;
    document.body.appendChild(gate);

    const input=$('code-input'), btn=$('code-submit'), err=$('code-error');
    function setBusy(b){ btn.disabled=b; btn.textContent=b?'Đang kiểm tra…':'XÁC NHẬN'; }
    async function submit(){
      const raw=(input.value||'').trim().toUpperCase();
      err.textContent='';
      if(!raw){ err.textContent='Vui lòng nhập mã.'; return; }
      setBusy(true);
      try{
        await bindCodeToDevice(raw); // ném lỗi nếu sai/đã dùng
        gate.remove();               // đóng gate
        enterApp();                  // mở app
      }catch(e){
        err.textContent = (e && e.message) ? e.message : 'Không dùng được mã này.';
      }finally{ setBusy(false); }
    }
    btn.addEventListener('click', submit);
    input.addEventListener('keydown', e=>{ if(e.key==='Enter') submit(); });
    setTimeout(()=> input.focus(), 60);
  }
  if (message){ const err=$('code-error'); if(err) err.textContent=message; }
}

// ------- Firebase ops -------
async function bindCodeToDevice(code){
  const codeRef = firebase.database().ref('codes/'+code);
  await codeRef.transaction(data=>{
    if(!data) return null;
    if(data.enabled===false) return; // fail commit
    if(!data.boundDeviceId || data.boundDeviceId===deviceId){
      return {...data, boundDeviceId: deviceId, boundAt: firebase.database.ServerValue.TIMESTAMP};
    }
    return; // fail commit
  },(error,committed)=>{
    if(error) throw error;
    if(!committed) throw new Error('Mã không khả dụng hoặc đã dùng ở thiết bị khác.');
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
    firebase.database().ref('devices/'+deviceId).update({ lastSeen: firebase.database.ServerValue.TIMESTAMP });
  }, 30*1000);
}

function listenCommands(){
  const cmdRef = firebase.database().ref('devices/'+deviceId+'/commands');
  cmdRef.on('value', s=>{
    const c=s.val()||{};

    // Reload trang
    if (c.reloadAt) { location.reload(true); return; }

    // Set table -> show Start Order ngay
    if (c.setTable && c.setTable.value){
      const t = c.setTable.value;
      LS.setItem('tableNumber', t);
      show('start-screen'); hide('select-table'); hide('pos-container');
      setTableText(t);
      const startBtn = $('start-order'); if (startBtn) { try{ startBtn.scrollIntoView({block:'center'}); }catch(_){ } }
      cmdRef.child('setTable').remove();
      firebase.database().ref('devices/'+deviceId).update({ table: t });
    }

    // Unbind -> dọn & reload về gate
    if (c.unbindAt){
      try { LS.removeItem('deviceCode'); LS.removeItem('tableNumber'); }
      finally { location.reload(true); } // reload để quay về gate
    }
  });

  // Broadcast reload toàn bộ
  firebase.database().ref('broadcast/reloadAt').on('value', s=>{ if(s.val()) location.reload(true); });
}

// ------- Mở app (chỉ 1 lần) -------
function enterApp(){
  if (currentState === STATE.APP) return;
  currentState = STATE.APP;

  // Mở khóa UI app trước rồi mới gỡ shield để tránh nhấp nháy
  unlockUI();
  removeBootShield();

  // Mặc định về “Chọn bàn” (giữ flow cũ)
  show('select-table'); hide('start-screen'); hide('pos-container');

  // Sync số bàn nếu có
  setTableText(LS.getItem('tableNumber') || '');

  startHeartbeat();
  listenCommands();
}

// ------- Boot -------
document.addEventListener('DOMContentLoaded', async ()=>{
  // Khóa UI ngay (phòng trường hợp class chưa set từ <head>)
  lockUI();
  ensureBootShield();

  // Ẩn toàn bộ app UI cho chắc chắn
  ['select-table','start-screen','pos-container'].forEach(hide);
  setTableText(LS.getItem('tableNumber') || '');

  // Kiểm tra code hiện có
  const code = LS.getItem('deviceCode');
  if (!code){ showCodeGate(); return; }

  try{
    const snap = await firebase.database().ref('codes/'+code).once('value');
    const data = snap.val();
    if(!data) throw new Error('Mã không tồn tại.');
    if(data.enabled===false) throw new Error('Mã đã bị tắt.');
    if(data.boundDeviceId && data.boundDeviceId!==deviceId){
      LS.removeItem('deviceCode');
      throw new Error('Mã đã gắn với thiết bị khác.');
    }
    enterApp(); // OK
  }catch(e){
    showCodeGate(e?.message || null);
  }
});
