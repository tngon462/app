// ===============================================
// device-bind.js v8b (Fail-safe Overlay, Zero Blink)
// - Luôn dựng overlay, không ẩn app gốc (overlay che phủ)
// - Fix kiểm tra Firebase config: chấp nhận window.firebaseConfig hoặc firebaseConfig
// - Admin: reload, setTable (jump Start), unbind (auto reload về gate)
// ===============================================

(function () {
  const LS = window.localStorage;
  const $  = (id) => document.getElementById(id);

  // ---------- Overlay (luôn dựng ngay) ----------
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
        <div id="code-error" class="text-red-600 text-sm mt-2 min-h-[20px]"></div>
        <button id="code-submit"
          class="mt-4 w-full rounded-xl bg-blue-600 text-white font-bold py-3 hover:bg-blue-700 transition">
          XÁC NHẬN
        </button>
      </div>
    `;
    document.body.appendChild(ov);

    const input=$('code-input'), btn=$('code-submit'), err=$('code-error');
    function setBusy(b){ btn.disabled=b; btn.textContent=b?'Đang kiểm tra…':'XÁC NHẬN'; }
    async function submit(){
      err.textContent='';
      const raw=(input.value||'').trim().toUpperCase();
      if(!raw){ err.textContent='Vui lòng nhập mã.'; return; }
      setBusy(true);
      try{
        await bindCodeToDevice(raw);      // ném lỗi nếu sai/đã dùng
        hideOverlay();                    // ẩn overlay
        enterAppOnce();                   // vào app
      }catch(e){
        err.textContent = (e && e.message) ? e.message : 'Không dùng được mã này.';
      }finally{ setBusy(false); }
    }
    btn.addEventListener('click', submit);
    input.addEventListener('keydown', e=>{ if(e.key==='Enter') submit(); });
    setTimeout(()=> input?.focus(), 0);

    return ov;
  }
  function showOverlay(message){
    const ov = ensureOverlay();
    ov.style.display = 'flex';
    if (message) {
      const err = $('code-error'); if (err) err.textContent = message;
    }
  }
  function hideOverlay(){
    const ov = $('code-overlay');
    if (ov) ov.style.display = 'none';
  }

  // ---------- Safe helpers ----------
  function setTableText(t){ const el=$('selected-table'); if(el) el.textContent = t||''; }
  function show(id){ const el=$(id); if(el) el.classList.remove('hidden'); }
  function hide(id){ const el=$(id); if(el) el.classList.add('hidden'); }
  function uuidv4(){
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c=>{
      const r=Math.random()*16|0, v=c==='x'?r:(r&0x3|0x8); return v.toString(16);
    });
  }

  let deviceId = LS.getItem('deviceId');
  if (!deviceId) { deviceId = uuidv4(); LS.setItem('deviceId', deviceId); }

  // ---------- Firebase safe init (ĐÃ SỬA) ----------
  function assertFirebaseReady() {
    if (typeof firebase === 'undefined') throw new Error('Không tải được Firebase SDK.');

    // Nếu đã init rồi thì OK
    if (firebase.apps && firebase.apps.length) return;

    // Nhận config từ window.firebaseConfig HOẶC biến firebaseConfig toàn cục
    if (typeof window.firebaseConfig === 'undefined') {
      try {
        // eslint-disable-next-line no-undef
        if (typeof firebaseConfig !== 'undefined') {
          // gắn tạm lên window để thống nhất
          window.firebaseConfig = firebaseConfig;
        }
      } catch (_) {}
    }
    if (typeof window.firebaseConfig === 'undefined') {
      throw new Error('Thiếu cấu hình Firebase (firebaseConfig).');
    }

    firebase.initializeApp(window.firebaseConfig);
  }

async function bindCodeToDevice(code){
  assertFirebaseReady();
  await firebase.auth().signInAnonymously().catch((e)=>{ throw new Error('Auth lỗi: '+(e?.message||e)); });

  const codeRef = firebase.database().ref('codes/'+code);
  await codeRef.transaction(data=>{
-     if(!data) return null;                 // không tồn tại
-     if(data.enabled===false) return;       // bị tắt
+     if (!data) return;                     // KHÔNG commit (mã không tồn tại)
+     if (data.enabled === false) return;    // KHÔNG commit (mã bị tắt)
      if(!data.boundDeviceId || data.boundDeviceId===deviceId){
        return {...data, boundDeviceId: deviceId, boundAt: firebase.database.ServerValue.TIMESTAMP};
      }
-     return; // đang gắn máy khác
+     return;                                // KHÔNG commit (đang gắn máy khác)
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
      try{
        assertFirebaseReady();
        firebase.database().ref('devices/'+deviceId).update({
          lastSeen: firebase.database.ServerValue.TIMESTAMP
        });
      }catch(_){}
    }, 30*1000);
  }

  function listenCommands(){
    assertFirebaseReady();
    const cmdRef = firebase.database().ref('devices/'+deviceId+'/commands');
    cmdRef.on('value', s=>{
      const c=s.val()||{};

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

  // ---------- Vào app (1 lần) ----------
  let entered = false;
  function enterAppOnce(){
    if (entered) return;
    entered = true;

    hideOverlay(); // đảm bảo ẩn overlay
    show('select-table'); hide('start-screen'); hide('pos-container');
    setTableText(LS.getItem('tableNumber') || '');

    try{
      assertFirebaseReady();
      startHeartbeat();
      listenCommands();
    }catch(e){
      // Nếu lỗi ở đây, vẫn để app hiện + hiện lỗi trên overlay
      showOverlay(e?.message || 'Lỗi khởi tạo lệnh.');
    }
  }

  // ---------- Boot ----------
  window.addEventListener('error', (e)=>{
    // Bắt mọi lỗi runtime -> show overlay với lỗi, tránh trắng màn
    showOverlay((e && e.message) ? e.message : 'Lỗi không xác định.');
  });

  document.addEventListener('DOMContentLoaded', async ()=>{
    try{
      // Luôn dựng overlay trước (tránh nhấp nháy)
      showOverlay();

      setTableText(LS.getItem('tableNumber') || '');

      // Có mã sẵn?
      // (auth trước để tránh chờ lần bind)
      assertFirebaseReady();
      await firebase.auth().signInAnonymously().catch((e)=>{ throw new Error('Auth lỗi: '+(e?.message||e)); });

      const code = LS.getItem('deviceCode');
      if (!code) {
        // Chưa có mã -> chờ người dùng nhập trên overlay
        return;
      }

      const snap = await firebase.database().ref('codes/'+code).once('value');
      const data = snap.val();
      if (!data)                  throw new Error('Mã không tồn tại.');
      if (data.enabled === false) throw new Error('Mã đã bị tắt.');
      if (data.boundDeviceId && data.boundDeviceId !== deviceId) {
        LS.removeItem('deviceCode');
        throw new Error('Mã đã gắn với thiết bị khác.');
      }

      // OK -> vào app
      enterAppOnce();
    }catch(e){
      // Lỗi nào cũng hiển thị trên overlay, không bao giờ trắng
      showOverlay((e && e.message) ? e.message : 'Lỗi khởi động.');
    }
  });
})();
