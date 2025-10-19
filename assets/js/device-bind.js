// ===============================================
// device-bind.js v9d2 (PROD)
// - Gate thật (bind OK mới vào)
// - Đồng bộ table về Admin: "-" khi đang ở màn chọn bàn
// - Report ngay khi vào + mỗi 1s
// - Anti-loop reload/unbind/broadcast
// ===============================================
(function () {
  const LS = window.localStorage;
  const $  = (id) => document.getElementById(id);

  let entered = false;

  // ---------- Helpers ----------
  function uuidv4(){ return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0,v=c==='x'?r:(r&0x3|0x8);return v.toString(16);}); }
  function setTableText(t){ const el=$('selected-table'); if(el) el.textContent=t||''; }
  function show(id){ const el=$(id); if(el) el.classList.remove('hidden'); }
  function hide(id){ const el=$(id); if(el) el.classList.add('hidden'); }
  function visible(id){ const el=$(id); return !!(el && !el.classList.contains('hidden')); }
  function log(){ try{ console.log('[bind]', ...arguments); }catch(_){} }

  // ---------- Device ID ----------
  let deviceId = LS.getItem('deviceId');
  if (!deviceId) { deviceId = uuidv4(); LS.setItem('deviceId', deviceId); }
  log('deviceId', deviceId);

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

    // Kiểm tra sơ bộ
    const snap0 = await codeRef.once('value');
    if (!snap0.exists()) throw new Error('Mã không tồn tại. Hãy thêm mã trong Admin.');
    const v0 = snap0.val() || {};
    if (v0.enabled === false) throw new Error('Mã đã bị tắt.');
    if (v0.boundDeviceId && v0.boundDeviceId !== deviceId) {
      throw new Error('Mã đang gắn với thiết bị khác. Hãy “Thu hồi” trong Admin rồi nhập lại.');
    }

    // Transaction chống race
    await codeRef.transaction(data=>{
      if(!data) return;
      if(data.enabled===false) return;
      if(!data.boundDeviceId || data.boundDeviceId===deviceId){
        return { ...data, boundDeviceId: deviceId, boundAt: firebase.database.ServerValue.TIMESTAMP };
      }
      return;
    }, (error, committed)=>{
      if(error) throw error;
      if(!committed) throw new Error('Không thể giữ mã (đã bị máy khác chiếm). Thử lại.');
    });

    await firebase.database().ref('devices/'+deviceId).update({
      code,
      lastSeen: firebase.database.ServerValue.TIMESTAMP,
      info: { ua: navigator.userAgent }
    });

    LS.setItem('deviceCode', code); // chỉ set khi bind OK
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
  function oncePerStamp(key, ts){
    if(!ts) return false;
    const last = parseInt(LS.getItem(key)||'0',10);
    if(Number(ts) > last){ LS.setItem(key,String(ts)); return true; }
    return false;
  }

  // ---------- Reporter: đồng bộ TABLE về Admin ----------
  let lastSentTable;
  function normalizeTable(raw){
    if (!raw) return '-';
    const s = String(raw).trim();
    return s ? s : '-';
  }
  async function sendTable(val){
    try{
      await firebase.database().ref('devices/'+deviceId+'/table').set(val);
      lastSentTable = val;
      log('report table =', val);
    }catch(e){ log('report table error', e); }
  }
  function computeCurrentTable(){
    if (visible('select-table')) {
      // Đang ở màn chọn bàn => xoá local để không nhớ bàn cũ
      if (LS.getItem('tableNumber')) LS.removeItem('tableNumber');
      return '-';
    }
    let t = LS.getItem('tableNumber') || '';
    if (!t && visible('start-screen')) {
      const el = $('selected-table'); t = (el && el.textContent) ? el.textContent.trim() : '';
    }
    return normalizeTable(t);
  }
  function reportTableLoop(){
    // báo ngay khi vào
    const first = computeCurrentTable();
    if (lastSentTable !== first) sendTable(first);
    // sau đó poll 1s
    setInterval(()=>{
      const v = computeCurrentTable();
      if (v !== lastSentTable) sendTable(v);
    }, 1000);
  }

  // ---------- Commands ----------
  function listenCommands(){
    const cmdRef = firebase.database().ref('devices/'+deviceId+'/commands');
    cmdRef.on('value', s=>{
      const c=s.val()||{};

      // reloadAt
      if (c.reloadAt && oncePerStamp('cmdReloadStamp', c.reloadAt)) {
        try{ cmdRef.child('reloadAt').remove(); }catch(_){}
        setTimeout(()=>location.reload(true), 50);
        return;
      }

      // setTable → nhảy Start Order + lưu local + báo ngay
      if (c.setTable && c.setTable.value){
        const t=c.setTable.value;
        LS.setItem('tableNumber', t);
        show('start-screen'); hide('select-table'); hide('pos-container');
        setTableText(t);
        try{ cmdRef.child('setTable').remove(); }catch(_){}
        firebase.database().ref('devices/'+deviceId).update({ table: normalizeTable(t) });
      }

      // unbindAt
      if (c.unbindAt && oncePerStamp('cmdUnbindStamp', c.unbindAt)) {
        try{
          LS.removeItem('deviceCode');
          LS.removeItem('tableNumber');
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
      if (ts && oncePerStamp('broadcastReloadStamp', ts)) {
        setTimeout(()=>location.reload(true), 50);
      }
    });
  }

  // ---------- Overlay (Gate) ----------
  function ensureOverlay() {
    let ov = $('code-overlay');
    if (ov) return ov;
    ov = document.createElement('div');
    ov.id = 'code-overlay';
    ov.style.cssText = 'position:fixed;inset:0;z-index:6000;background:#fff;display:flex;align-items:center;justify-content:center;padding:16px';
    ov.innerHTML = `
      <div class="w-full max-w-sm bg-white border border-gray-200 rounded-2xl shadow p-6">
        <h1 class="text-2xl font-extrabold text-gray-900 mb-3 text-center">Nhập mã iPad</h1>
        <p class="text-xs text-gray-500 mb-2 text-center">Nhập đúng mã để tiếp tục. Không có nút hủy.</p>
        <div class="text-[11px] text-gray-500 mb-2"><b>Device ID:</b> <span id="dbg-dev"></span></div>
        <input id="code-input" type="text" maxlength="20" placeholder="VD: A1B2C3"
               class="w-full border rounded-lg px-4 py-3 text-center tracking-widest font-mono text-lg"
               inputmode="latin" autocomplete="one-time-code" />
        <div id="code-error" class="text-red-600 text-sm mt-2 min-h-[20px]"></div>
        <button id="code-submit" class="mt-4 w-full rounded-xl bg-blue-600 text-white font-bold py-3 hover:bg-blue-700 transition">XÁC NHẬN</button>
      </div>`;
    document.body.appendChild(ov);

    const devSpan = $('dbg-dev'); if (devSpan) devSpan.textContent = deviceId;
    const input = $('code-input');
    const btn   = $('code-submit');
    const err   = $('code-error');

    function setBusy(b){ btn.disabled=b; btn.textContent=b?'Đang kiểm tra…':'XÁC NHẬN'; }
    async function submit(){
      err.textContent='';
      const code=(input.value||'').trim().toUpperCase();
      if(!code){ err.textContent='Vui lòng nhập mã.'; return; }
      setBusy(true);
      try{
        await bindCodeToDevice(code);
        hideOverlay();
        enterAppOnce(); // chỉ vào app khi bind OK
      }catch(e){
        err.textContent = e?.message || 'Không dùng được mã này.';
      }finally{ setBusy(false); }
    }
    btn.addEventListener('click', submit);
    input.addEventListener('keydown', e=>{ if(e.key==='Enter') submit(); });
    setTimeout(()=> input?.focus(), 0);
    return ov;
  }
  function showOverlay(msg){
    if (entered) return;
    const ov=ensureOverlay(); ov.style.display='flex';
    if (msg){ const e=$('code-error'); if(e) e.textContent=msg; }
  }
  function hideOverlay(){ const ov=$('code-overlay'); if(ov) ov.style.display='none'; }

  // ---------- Enter app ----------
  function enterAppOnce(){
    if (entered) return;
    entered = true;

    const t = LS.getItem('tableNumber');
    hideOverlay();
    if (t) {
      show('start-screen'); hide('select-table'); hide('pos-container');
      setTableText(t);
    } else {
      show('select-table'); hide('start-screen'); hide('pos-container');
    }

    try{
      assertFirebaseReady();
      ensureAuth().catch(()=>{});
      startHeartbeat();
      setTimeout(listenCommands, 3000);
      reportTableLoop(); // ⬅️ báo table ngay + mỗi 1s
    }catch(e){ console.error('[bind] init after enter:', e); }
  }

  // ---------- Boot ----------
  window.addEventListener('error', (e)=>{
    if (!entered) showOverlay(e?.message || 'Lỗi không xác định.');
    else console.error('[bind] runtime after enter:', e?.message || e);
  });

  document.addEventListener('DOMContentLoaded', async ()=>{
    try{
      assertFirebaseReady();
      await ensureAuth();

      const saved = LS.getItem('deviceCode');

      if (!saved) {
        showOverlay();
        return;
      }

      // Có deviceCode -> kiểm tra/tự bind nếu cần rồi vào app
      const snap = await firebase.database().ref('codes/'+saved).once('value');
      if (!snap.exists()){
        LS.removeItem('deviceCode');
        showOverlay('Mã đã bị xóa. Vui lòng nhập lại.');
        return;
      }
      const data = snap.val() || {};
      if (data.enabled === false) {
        LS.removeItem('deviceCode');
        showOverlay('Mã đã bị tắt. Vui lòng nhập mã khác.');
        return;
      }
      if (data.boundDeviceId && data.boundDeviceId !== deviceId) {
        LS.removeItem('deviceCode');
        showOverlay('Mã đang gắn với thiết bị khác. Vui lòng nhập mã khác.');
        return;
      }
      if (!data.boundDeviceId) {
        await bindCodeToDevice(saved);
      }

      enterAppOnce();
    }catch(e){
      if (!entered) showOverlay(e?.message || 'Lỗi khởi động.');
      else console.error(e);
    }
  });
})();
