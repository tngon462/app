// ===============================================
//  device-bind.js v6 (NO Boot Shield, anti-blink)
//  - Khóa UI bằng html.gating cho đến khi mã hợp lệ
//  - Admin: reload, setTable (jump Start Order), unbind (auto reload về gate)
// ===============================================

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig); // cấu hình từ /assets/js/firebase.js
}
firebase.auth().signInAnonymously().catch(console.error);

const LS = window.localStorage;
const $  = (id) => document.getElementById(id);

// ------- State & helpers -------
let entered = false;                 // chống vào app nhiều lần
const lockUI   = () => document.documentElement.classList.add('gating');
const unlockUI = () => document.documentElement.classList.remove('gating');

function show(id){ const el=$(id); if(el) el.classList.remove('hidden'); }
function hide(id){ const el=$(id); if(el) el.classList.add('hidden'); }
function setTableText(t){ const el=$('selected-table'); if(el) el.textContent = t||''; }
function uuidv4(){return'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0,v=c==='x'?r:(r&0x3|0x8);return v.toString(16);});}

let deviceId = LS.getItem('deviceId');
if (!deviceId) { deviceId = uuidv4(); LS.setItem('deviceId', deviceId); }

// ------- Code Gate (form nhập mã, không có Hủy) -------
function showCodeGate(message){
  lockUI(); // khóa UI app cứng
  ['select-table','start-screen','pos-container'].forEach(hide);

  let gate = $('code-gate');
  if (!gate){
    gate = document.createElement('div');
    gate.id = 'code-gate';
    gate.style.cssText = 'position:fixed;inset:0;background:#fff;z-index:6000;';
    gate.innerHTML = `
      <div class="w-full h-full flex items-center justify-center p-6">
        <div class="w-full max-w-sm bg-white border border-gray-200 rounded-2xl shadow p-6">
          <h1 class="text-2xl font-extrabold text-gray-900 mb-4 text-center">Nhập mã iPad</h1>
          <p class="text-sm text-gray-500 mb-4 text-center">Nhập mã được cấp để tiếp tục. Không có nút Hủy.</p>
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
        await bindCodeToDevice(raw);   // ném lỗi nếu sai/đã dùng
        gate.remove();                 // đóng gate
        enterAppOnce();                // vào app 1 lần
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
    if(!data) return null;                 // mã không tồn tại -> fail
    if(data.enabled===false) return;       // mã bị tắt -> fail
    if(!data.boundDeviceId || data.boundDeviceId===deviceId){
      return {...data, boundDeviceId: deviceId, boundAt: firebase.database.ServerValue.TIMESTAMP};
    }
    return; // đang gắn máy khác -> fail
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

    // 1) Reload toàn trang
    if (c.reloadAt) { location.reload(true); return; }

    // 2) Set table -> nhảy sang Start Order
    if (c.setTable && c.setTable.value){
      const t = c.setTable.value;
      LS.setItem('tableNumber', t);
      show('start-screen'); hide('select-table'); hide('pos-container');
      setTableText(t);
      const startBtn = $('start-order'); if (startBtn) { try{ startBtn.scrollIntoView({block:'center'}); }catch(_){ } }
      cmdRef.child('setTable').remove();
      firebase.database().ref('devices/'+deviceId).update({ table: t });
    }

    // 3) Unbind -> dọn & reload về gate
    if (c.unbindAt){
      try { LS.removeItem('deviceCode'); LS.removeItem('tableNumber'); }
      finally { location.reload(true); }
    }
  });

  // Broadcast reload toàn bộ
  firebase.database().ref('broadcast/reloadAt').on('value', s=>{ if(s.val()) location.reload(true); });
}

// ------- Vào app đúng 1 lần -------
function enterAppOnce(){
  if (entered) return;
  entered = true;

  // Mở khóa UI (gỡ html.gating), rồi hiển thị UI mặc định
  unlockUI();

  // Mặc định về “Chọn bàn”
  show('select-table'); hide('start-screen'); hide('pos-container');

  // Sync số bàn nếu đã có
  setTableText(LS.getItem('tableNumber') || '');

  startHeartbeat();
  listenCommands();
}

// ------- Boot -------
document.addEventListener('DOMContentLoaded', async ()=>{
  // Chắc chắn khóa UI (phòng khi class chưa set từ <head>)
  lockUI();

  // Ẩn toàn bộ UI app
  ['select-table','start-screen','pos-container'].forEach(hide);
  setTableText(LS.getItem('tableNumber') || '');

  // Kiểm tra mã sẵn có
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
    // OK -> vào app
    enterAppOnce();
  }catch(e){
    showCodeGate(e?.message || null);
  }
});
