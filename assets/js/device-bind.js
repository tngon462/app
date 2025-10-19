// ===============================================
// device-bind.js v9b (PROD + anti-unbind loop)
// - Gate overlay trước khi vào app; đã vào app thì KHÔNG gate lại
// - Auto-bind on boot nếu code đang null trong DB
// - Anti-loop cho reloadAt, unbindAt, broadcast.reloadAt (tem localStorage)
// - Subscribe commands trễ 3s để né lệnh cũ
// ===============================================
(function () {
  const LS = window.localStorage;
  const $  = (id) => document.getElementById(id);
  let entered = false;

  // ---------- Overlay ----------
  function ensureOverlay() {
    let ov = document.getElementById('code-overlay');
    if (ov) return ov;
    ov = document.createElement('div');
    ov.id = 'code-overlay';
    ov.style.cssText = 'position:fixed;inset:0;z-index:6000;background:#fff;display:flex;align-items:center;justify-content:center;padding:16px';
    ov.innerHTML = `
      <div class="w-full max-w-sm bg-white border border-gray-200 rounded-2xl shadow p-6">
        <h1 class="text-2xl font-extrabold text-gray-900 mb-4 text-center">Nhập mã iPad</h1>
        <input id="code-input" type="text" maxlength="20" placeholder="VD: A1B2C3"
               class="w-full border rounded-lg px-4 py-3 text-center tracking-widest font-mono text-lg"
               inputmode="latin" autocomplete="one-time-code" />
        <div id="code-error" class="text-red-600 text-sm mt-2 min-h-[20px]"></div>
        <button id="code-submit" class="mt-4 w-full rounded-xl bg-blue-600 text-white font-bold py-3 hover:bg-blue-700 transition">XÁC NHẬN</button>
      </div>`;
    document.body.appendChild(ov);

    const input = document.getElementById('code-input');
    const btn   = document.getElementById('code-submit');
    const err   = document.getElementById('code-error');

    function setBusy(b){ btn.disabled=b; btn.textContent=b?'Đang kiểm tra…':'XÁC NHẬN'; }
    async function submit(){
      err.textContent='';
      const code=(input.value||'').trim().toUpperCase();
      if(!code){ err.textContent='Vui lòng nhập mã.'; return; }
      setBusy(true);
      try{
        await bindCodeToDevice(code);
        hideOverlay();
        enterAppOnce();
      }catch(e){ err.textContent = e?.message || 'Không dùng được mã này.'; }
      finally{ setBusy(false); }
    }
    btn.addEventListener('click', submit);
    input.addEventListener('keydown', e=>{ if(e.key==='Enter') submit(); });
    setTimeout(()=> input?.focus(), 0);
    return ov;
  }
  function showOverlay(msg){ if(entered) return; const ov=ensureOverlay(); ov.style.display='flex'; if(msg){ const e=document.getElementById('code-error'); if(e) e.textContent=msg; } }
  function hideOverlay(){ const ov=document.getElementById('code-overlay'); if(ov) ov.style.display='none'; }

  // ---------- UI helpers ----------
  function setTableText(t){ const el=document.getElementById('selected-table'); if(el) el.textContent=t||''; }
  function show(id){ const el=document.getElementById(id); if(el) el.classList.remove('hidden'); }
  function hide(id){ const el=document.getElementById(id); if(el) el.classList.add('hidden'); }
  function uuidv4(){ return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0,v=c==='x'?r:(r&0x3|0x8);return v.toString(16);}); }

  // ---------- Device ID ----------
  let deviceId = LS.getItem('deviceId');
  if (!deviceId) { deviceId = uuidv4(); LS.setItem('deviceId', deviceId); }

  // ---------- Firebase ----------
  function assertFirebaseReady() {
    if (typeof firebase==='undefined') throw new Error('Không tải được Firebase SDK.');
    if (firebase.apps && firebase.apps.length) return;
    if (typeof window.firebaseConfig==='undefined') {
      try { if (typeof firebaseConfig!=='undefined') window.firebaseConfig=firebaseConfig; } catch(_){}
    }
    if (typeof window.firebaseConfig==='undefined') throw new Error('Thiếu cấu hình Firebase (firebaseConfig).');
    firebase.initializeApp(window.firebaseConfig);
  }
  async function ensureAuth(){ await firebase.auth().signInAnonymously(); }

  async function bindCodeToDevice(code){
    assertFirebaseReady(); await ensureAuth();
    const codeRef = firebase.database().ref('codes/'+code);
    // transaction: commit khi code tồn tại + enabled + (chưa gắn || là mình)
    await codeRef.transaction(data=>{
      if(!data) return;                      // không tồn tại -> không commit
      if(data.enabled===false) return;       // bị tắt -> không commit
      if(!data.boundDeviceId || data.boundDeviceId===deviceId){
        return { ...data, boundDeviceId: deviceId, boundAt: firebase.database.ServerValue.TIMESTAMP };
      }
      return;                                // đang gắn với máy khác -> không commit
    }, (error, committed)=>{
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

  // ---------- Heartbeat ----------
  function startHeartbeat(){
    setInterval(()=> {
      try{
        assertFirebaseReady();
        firebase.database().ref('devices/'+deviceId).update({ lastSeen: firebase.database.ServerValue.TIMESTAMP });
      }catch(_){}
    }, 30_000);
  }

  // ---------- Anti-loop helper ----------
  function shouldHandleOnce(key, ts){
    if(!ts) return false;
    const last = parseInt(LS.getItem(key)||'0',10);
    if(Number(ts) > last){ LS.setItem(key,String(ts)); return true; }
    return false;
  }

  // ---------- Commands (trì hoãn 3s sau khi vào app) ----------
  function listenCommandsDelayed(){ setTimeout(listenCommands, 3000); }
  function listenCommands(){
    const cmdRef = firebase.database().ref('devices/'+deviceId+'/commands');
    cmdRef.on('value', s=>{
      const c=s.val()||{};

      // reloadAt: chỉ 1 lần/timestamp
      if (c.reloadAt && shouldHandleOnce('cmdReloadStamp', c.reloadAt)) {
        try{ cmdRef.child('reloadAt').remove(); }catch(_){}
        setTimeout(()=>location.reload(true), 50);
        return;
      }

      // setTable → nhảy Start Order
      if (c.setTable && c.setTable.value){
        const t=c.setTable.value;
        LS.setItem('tableNumber', t);
        show('start-screen'); hide('select-table'); hide('pos-container');
        setTableText(t);
        try{ cmdRef.child('setTable').remove(); }catch(_){}
        firebase.database().ref('devices/'+deviceId).update({ table: t });
      }

      // unbindAt: chỉ xử lý 1 lần/timestamp
      if (c.unbindAt && shouldHandleOnce('cmdUnbindStamp', c.unbindAt)) {
        try{
          LS.removeItem('deviceCode');
          LS.removeItem('tableNumber');
          // dọn lệnh để khỏi treo
          cmdRef.child('unbindAt').remove();
        }finally{
          setTimeout(()=>location.reload(true), 50);
        }
      }
    });

    // broadcast reload
    const bRef = firebase.database().ref('broadcast/reloadAt');
    bRef.on('value', s=>{
      const ts=s.val();
      if (ts && shouldHandleOnce('broadcastReloadStamp', ts)) {
        setTimeout(()=>location.reload(true), 50);
      }
    });
  }

  // ---------- Enter app ----------
  function enterAppOnce(){
    if (entered) return;
    entered = true;
    hideOverlay();
    show('select-table'); hide('start-screen'); hide('pos-container');
    setTableText(LS.getItem('tableNumber') || '');
    try{
      assertFirebaseReady();
      startHeartbeat();
      listenCommandsDelayed();
    }catch(e){ console.error('[bind] init after enter:', e); }
  }

  // ---------- Boot ----------
  window.addEventListener('error', (e)=>{
    if (!entered) showOverlay(e?.message || 'Lỗi không xác định.');
    else console.error('[bind] runtime after enter:', e?.message || e);
  });

  document.addEventListener('DOMContentLoaded', async ()=>{
    try{
      showOverlay();
      setTableText(LS.getItem('tableNumber') || '');

      assertFirebaseReady();
      await ensureAuth();

      let code = LS.getItem('deviceCode');
      if (!code) return; // chưa có -> chờ nhập trên overlay

      // Kiểm tra code hiện tại
      const snap = await firebase.database().ref('codes/'+code).once('value');
      if (!snap.exists()){
        // mã trong localStorage không còn trong DB → xoá & yêu cầu nhập lại
        LS.removeItem('deviceCode');
        throw new Error('Mã không tồn tại (đã bị xoá). Vui lòng nhập lại.');
      }
      const data = snap.val() || {};
      if (data.enabled === false) throw new Error('Mã đã bị tắt.');
      if (data.boundDeviceId && data.boundDeviceId !== deviceId) {
        LS.removeItem('deviceCode');
        throw new Error('Mã đang gắn với thiết bị khác. Vui lòng nhập mã khác.');
      }

      // Auto-bind nếu đang null
      if (!data.boundDeviceId) {
        await bindCodeToDevice(code);
      }

      enterAppOnce();
    }catch(e){
      showOverlay(e?.message || 'Lỗi khởi động.');
    }
  });
})();
