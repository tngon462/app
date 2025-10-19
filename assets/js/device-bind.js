// ===============================================
// device-bind.js v8h (DEBUG & AUTO-CREATE CODE)
// - Log banner khi file load (để chắc chắn script đang chạy)
// - Nếu mã chưa tồn tại -> tự tạo {enabled:true} rồi bind vào máy này
// - Tắt reload/unbind từ admin khi debug để tránh bị đẩy ra
// ===============================================
(function () {
  // --- DEBUG banner ngay khi file nạp ---
  console.log('%c[bind] device-bind.js v8h loaded', 'background:#0ea5e9;color:#fff;padding:2px 6px;border-radius:4px');

  const LS = window.localStorage;
  const $  = (id) => document.getElementById(id);

  // ===== DEBUG flags =====
  const DEBUG = true;
  const DISABLE_COMMANDS_RELOAD  = true;  // tắt reloadAt từ admin khi debug
  const DISABLE_COMMANDS_UNBIND  = true;  // tắt unbindAt khi debug
  const DISABLE_BROADCAST_RELOAD = true;  // tắt broadcast reload khi debug
  const ALLOW_CREATE_CODE_IF_ABSENT = true; // ✅ tự tạo mã nếu chưa tồn tại

  function log(...a){ if (DEBUG) console.log('[bind]', ...a); }
  function warn(...a){ if (DEBUG) console.warn('[bind]', ...a); }
  function errl(...a){ if (DEBUG) console.error('[bind]', ...a); }

  // ---------- Overlay ----------
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
      <div class="w-full max-w-sm bg-white border border-gray-200 rounded-2xl shadow p-6">
        <h1 class="text-2xl font-extrabold text-gray-900 mb-2 text-center">Nhập mã iPad</h1>
        <p class="text-xs text-gray-500 mb-3 text-center">Debug v8h — auto-create code if missing</p>
        <div class="text-xs text-gray-600 mb-2"><b>Device ID:</b> <span id="dbg-dev"></span></div>
        <input id="code-input" type="text" maxlength="20" placeholder="VD: A1B2C3"
               class="w-full border rounded-lg px-4 py-3 text-center tracking-widest font-mono text-lg"
               inputmode="latin" autocomplete="one-time-code" />
        <div id="code-error" class="text-red-600 text-sm mt-2 min-h-[20px]"></div>
        <button id="code-submit"
          class="mt-3 w-full rounded-xl bg-blue-600 text-white font-bold py-3 hover:bg-blue-700 transition">
          XÁC NHẬN
        </button>
      </div>
    `;
    document.body.appendChild(ov);

    const input=$('code-input'), btn=$('code-submit'), err=$('code-error');
    const dbg = $('dbg-dev'); if (dbg) dbg.textContent = LS.getItem('deviceId') || '(chưa có)';

    function setBusy(b){ btn.disabled=b; btn.textContent=b?'Đang kiểm tra…':'XÁC NHẬN'; }
    async function submit(){
      err.textContent='';
      const raw=(input.value||'').trim().toUpperCase();
      if(!raw){ err.textContent='Vui lòng nhập mã.'; return; }
      setBusy(true);
      try{
        await bindCodeToDevice(raw);
        hideOverlay();
        enterAppOnce();
      }catch(e){
        err.textContent = (e && e.message) ? e.message : 'Không dùng được mã này.';
        errl('Bind error:', e);
      }finally{ setBusy(false); }
    }
    btn.addEventListener('click', submit);
    input.addEventListener('keydown', e=>{ if(e.key==='Enter') submit(); });
    setTimeout(()=> input?.focus(), 0);
    return ov;
  }
  function showOverlay(message){
    if (entered) { warn('skip overlay after entered:', message); return; }
    const ov = ensureOverlay();
    ov.style.display = 'flex';
    if (message) { const err = $('code-error'); if (err) err.textContent = message; }
  }
  function hideOverlay(){
    const ov = $('code-overlay');
    if (ov) ov.style.display = 'none';
  }

  // ---------- Helpers ----------
  function setTableText(t){ const el=$('selected-table'); if(el) el.textContent = t||''; }
  function show(id){ const el=$(id); if(el) el.classList.remove('hidden'); }
  function hide(id){ const el=$(id); if(el) el.classList.add('hidden'); }
  function uuidv4(){ return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c=>{ const r=Math.random()*16|0, v=c==='x'?r:(r&0x3|0x8); return v.toString(16); }); }

  let deviceId = LS.getItem('deviceId');
  if (!deviceId) { deviceId = uuidv4(); LS.setItem('deviceId', deviceId); }
  log('deviceId =', deviceId);

  // ---------- Firebase safe init ----------
  function assertFirebaseReady() {
    if (typeof firebase === 'undefined') throw new Error('Không tải được Firebase SDK.');
    if (firebase.apps && firebase.apps.length) return;
    if (typeof window.firebaseConfig === 'undefined') {
      try { if (typeof firebaseConfig !== 'undefined') window.firebaseConfig = firebaseConfig; } catch(_) {}
    }
    if (typeof window.firebaseConfig === 'undefined') throw new Error('Thiếu cấu hình Firebase (firebaseConfig).');
    firebase.initializeApp(window.firebaseConfig);
    log('Firebase initialized with', window.firebaseConfig?.databaseURL);
  }

  async function getCodeStatus(code){
    assertFirebaseReady();
    const ref = firebase.database().ref('codes/'+code);
    const snap = await ref.once('value');
    if (!snap.exists()) return { exists:false, enabled:false, boundDeviceId:null, ref };
    const v = snap.val() || {};
    return { exists:true, enabled: v.enabled !== false, boundDeviceId: v.boundDeviceId || null, ref };
  }

  async function bindCodeToDevice(code){
    assertFirebaseReady();
    await firebase.auth().signInAnonymously().catch((e)=>{ throw new Error('Auth lỗi: '+(e?.message||e)); });

    log('Try bind code:', code, 'on device:', deviceId);
    let { exists, enabled, boundDeviceId, ref } = await getCodeStatus(code);
    log('Code status BEFORE:', {exists, enabled, boundDeviceId});

    // Nếu chưa tồn tại mà cho phép auto-create
    if (!exists && ALLOW_CREATE_CODE_IF_ABSENT) {
      log('Code not exists -> AUTO CREATE');
      await ref.set({
        enabled: true,
        createdAt: firebase.database.ServerValue.TIMESTAMP
      });
      exists = true; enabled = true; boundDeviceId = null;
    }

    if (!exists)         throw new Error('Mã không tồn tại. Hãy thêm mã trong Admin > Danh sách MÃ.');
    if (!enabled)        throw new Error('Mã đã bị tắt.');

    if (boundDeviceId && boundDeviceId !== deviceId) {
      throw new Error(`Mã đang gắn với thiết bị khác: ${boundDeviceId}. Hãy "Thu hồi" trong Admin rồi thử lại.`);
    }

    // Transaction set (tránh race)
    await ref.transaction(data=>{
      if (!data) return;                     // không commit: race xóa
      if (data.enabled === false) return;    // không commit
      if (!data.boundDeviceId || data.boundDeviceId === deviceId) {
        return { ...data, boundDeviceId: deviceId, boundAt: firebase.database.ServerValue.TIMESTAMP };
      }
      return;                                // không commit: race chiếm
    }, (error, committed)=>{
      if (error) throw error;
      if (!committed) throw new Error('Không thể giữ mã do bị máy khác chiếm cùng lúc. Thử lại.');
    });

    await firebase.database().ref('devices/'+deviceId).update({
      code,
      lastSeen: firebase.database.ServerValue.TIMESTAMP,
      info: { ua: navigator.userAgent }
    });

    LS.setItem('deviceCode', code);
    LS.setItem('boundProof', `${code}::${deviceId}`);
    log('Bind OK -> saved deviceCode, boundProof');
  }

  function startHeartbeat(){
    setInterval(()=>{
      try{
        assertFirebaseReady();
        firebase.database().ref('devices/'+deviceId).update({ lastSeen: firebase.database.ServerValue.TIMESTAMP });
      }catch(e){ errl('heartbeat:', e); }
    }, 30*1000);
  }

  function listenCommands(){
    assertFirebaseReady();
    const cmdRef = firebase.database().ref('devices/'+deviceId+'/commands');
    cmdRef.on('value', s=>{
      const c=s.val()||{};
      if (c.reloadAt)  warn('commands.reloadAt seen:', c.reloadAt, DISABLE_COMMANDS_RELOAD ? '(IGNORED)' : '');
      if (c.unbindAt)  warn('commands.unbindAt seen:', c.unbindAt, DISABLE_COMMANDS_UNBIND ? '(IGNORED)' : '');
      if (c.setTable && c.setTable.value){
        const t = c.setTable.value;
        warn('commands.setTable:', t);
        LS.setItem('tableNumber', t);
        show('start-screen'); hide('select-table'); hide('pos-container');
        setTableText(t);
        try { cmdRef.child('setTable').remove(); } catch(_) {}
        firebase.database().ref('devices/'+deviceId).update({ table: t });
      }
      if (!DISABLE_COMMANDS_RELOAD && c.reloadAt) {
        try { cmdRef.child('reloadAt').remove(); } catch(_) {}
        setTimeout(()=> location.reload(true), 50);
      }
      if (!DISABLE_COMMANDS_UNBIND && c.unbindAt) {
        try { LS.removeItem('deviceCode'); LS.removeItem('tableNumber'); LS.removeItem('boundProof'); } finally {
          setTimeout(()=> location.reload(true), 50);
        }
      }
    });

    const bRef = firebase.database().ref('broadcast/reloadAt');
    bRef.on('value', s=>{
      const ts = s.val();
      if (ts) warn('broadcast.reloadAt seen:', ts, DISABLE_BROADCAST_RELOAD ? '(IGNORED)' : '');
      if (!DISABLE_BROADCAST_RELOAD && ts) {
        setTimeout(()=> location.reload(true), 50);
      }
    });
  }

  // ---------- Enter app (once) ----------
  let entered = false;
  function enterAppOnce(){
    if (entered) return;
    entered = true;
    hideOverlay();
    show('select-table'); hide('start-screen'); hide('pos-container');
    setTableText(LS.getItem('tableNumber') || '');
    try {
      assertFirebaseReady();
      startHeartbeat();
      listenCommands(); // vẫn lắng nghe, nhưng reload/unbind đang tắt
    } catch (e) {
      errl('init after enter:', e);
    }
  }

  // ---------- Boot ----------
  window.addEventListener('error', (e)=>{
    if (!entered) showOverlay((e && e.message) ? e.message : 'Lỗi không xác định.');
    else errl('runtime after enter:', e?.message || e);
  });

  document.addEventListener('DOMContentLoaded', async ()=>{
    try{
      showOverlay();
      setTableText(LS.getItem('tableNumber') || '');

      assertFirebaseReady();
      await firebase.auth().signInAnonymously().catch((e)=>{ throw new Error('Auth lỗi: '+(e?.message||e)); });

      const code = LS.getItem('deviceCode');
      log('Boot with deviceCode =', code, 'deviceId =', deviceId);
      if (!code) return; // chờ nhập mã

      const stSnap = await getCodeStatus(code);
      log('Boot check code status:', { exists: stSnap.exists, enabled: stSnap.enabled, boundDeviceId: stSnap.boundDeviceId });

      if (!stSnap.exists)              throw new Error('Mã không tồn tại.');
      if (!stSnap.enabled)             throw new Error('Mã đã bị tắt.');
      if (stSnap.boundDeviceId && stSnap.boundDeviceId !== deviceId) {
        LS.removeItem('deviceCode');
        throw new Error(`Mã đang gắn với thiết bị khác: ${stSnap.boundDeviceId}. Hãy "Thu hồi" trong Admin.`);
      }

      enterAppOnce();
    }catch(e){
      showOverlay((e && e.message) ? e.message : 'Lỗi khởi động.');
    }
  });
})();
