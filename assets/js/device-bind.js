// assets/js/device-bind.js
// v10-transaction-strict: RÀNG BUỘC 1-MÃ-1-MÁY bằng Firebase Realtime Database TRANSACTION
// YÊU CẦU: firebaseConfig đã được load ở assets/js/firebase.js (compat SDK) trước file này.

(function(){
  // ===== Utils =====
  const LS = window.localStorage;
  const $  = (id) => document.getElementById(id);

  function uuidv4(){return'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0,v=c==='x'?r:(r&0x3|0x8);return v.toString(16);});}

  // Lấy/khởi deviceId
  let deviceId = LS.getItem('deviceId');
  if (!deviceId){ deviceId = uuidv4(); LS.setItem('deviceId', deviceId); }
  console.log('[bind] deviceId =', deviceId);

  // ===== Firebase init & auth =====
  if (!firebase.apps.length) {
    // firebaseConfig phải đến từ assets/js/firebase.js
    if (typeof window.firebaseConfig === 'undefined') {
      console.error('[bind] Thiếu firebaseConfig! Đảm bảo đã load assets/js/firebase.js trước.');
      return;
    }
    firebase.initializeApp(window.firebaseConfig);
  }

  const db = firebase.database();

  // Đăng nhập ẩn danh (nếu chưa)
  firebase.auth().onAuthStateChanged((u)=>{
    if (!u) firebase.auth().signInAnonymously().catch(e=>console.error('[bind] anon auth error:', e));
  });

  // ===== Boot Shield / Gate UI =====
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
  function hideAppUI(){ ['select-table','start-screen','pos-container'].forEach(id=>{ const el=$(id); if(el) el.classList.add('hidden'); }); }
  function show(id){ const el=$(id); if(el) el.classList.remove('hidden'); }
  function setTableText(t){ const el=$('selected-table'); if(el) el.textContent = t||''; }

  // Gate (màn nhập mã)
  function showCodeGate(message){
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
          await claimCodeByTransaction(raw); // <-- CHỐT MÃ bằng TRANSACTION
          LS.setItem('deviceCode', raw);
          // Sau khi claim thành công → vào app
          gate.remove();
          enterApp();
        }catch(e){
          err.textContent = e?.message || 'Mã không khả dụng hoặc đã dùng ở máy khác.';
        }finally{ setBusy(false); }
      }
      btn.addEventListener('click', submit);
      input.addEventListener('keydown', (e)=>{ if(e.key==='Enter') submit(); });
      setTimeout(()=> input.focus(), 60);
    }
    if (message){ const err=$('code-error'); if(err) err.textContent = message; }
  }

  // ===== TRANSACTION: claim code 1-mã-1-máy =====
  async function claimCodeByTransaction(code){
    const codeRef = db.ref('codes/'+code);

    // Transaction trên codes/{code}
    const res = await codeRef.transaction((data)=>{
      if (!data) return data;                 // không tồn tại -> abort
      if (data.enabled === false) return;     // tắt -> abort
      const bound = data.boundDeviceId || null;
      if (bound === null || bound === deviceId){
        // Cho phép gắn/giữ nguyên về device này
        return {
          ...data,
          boundDeviceId: deviceId,
          boundAt: firebase.database.ServerValue.TIMESTAMP
        };
      }
      // bound thuộc device khác -> abort
      return; // returning undefined => no-commit
    }, undefined, false);

    if (!res.committed) {
      throw new Error('Mã không khả dụng hoặc đã gắn ở thiết bị khác.');
    }

    // Ghi thông tin device
    await db.ref('devices/'+deviceId).update({
      code,
      lastSeen: firebase.database.ServerValue.TIMESTAMP,
      // Có thể lưu tên máy do admin set sau (devices/{id}/name)
      info: { ua: navigator.userAgent }
    });
  }

  // ===== Heartbeat & command listeners =====
  function startHeartbeat(){
    setInterval(()=>{
      db.ref('devices/'+deviceId).update({ lastSeen: firebase.database.ServerValue.TIMESTAMP })
        .catch(()=>{ /* ignore */ });
    }, 30*1000);
  }

  function listenCommands(){
    const cmdRef = db.ref('devices/'+deviceId+'/commands');

    cmdRef.on('value', (s)=>{
      const c=s.val()||{};

      // 1) reloadAt: reload trang
      if (c.reloadAt){
        // dọn flag để tránh vòng lặp
        cmdRef.child('reloadAt').remove().finally(()=>{
          location.reload(true);
        });
        return;
      }

      // 2) setTable: đưa thẳng tới màn Start Order với bàn đúng
      if (c.setTable && c.setTable.value){
        const t = String(c.setTable.value).trim();
        LS.setItem('tableNumber', t);
        // cập nhật devices cho admin nhìn thấy ngay
        db.ref('devices/'+deviceId).update({ table: t, lastKnownTable: t }).catch(()=>{});
        // chuyển UI sang Start Order
        show('start-screen'); hideAppInner(['select-table','pos-container']);
        setTableText(t);
        // dọn lệnh
        cmdRef.child('setTable').remove();
      }

      // 3) unbindAt: xoá local & reload về gate
      if (c.unbindAt){
        // Gỡ code local
        LS.removeItem('deviceCode');
        LS.removeItem('tableNumber');
        cmdRef.child('unbindAt').remove().finally(()=>{
          location.reload(true);
        });
      }
    });

    // Broadcast reload toàn bộ
    db.ref('broadcast/reloadAt').on('value', s=>{
      if (s.val()){
        location.reload(true);
      }
    });
  }

  function hideAppInner(ids){
    ids.forEach(id=>{ const el=$(id); if(el) el.classList.add('hidden'); });
  }

  // ===== Enter App (sau khi đã có/claim code) =====
  let entered = false;
  function enterApp(){
    if (entered) return;
    entered = true;

    // Bỏ lớp chặn và boot-shield
    document.documentElement.classList.remove('gating');
    removeBootShield();

    // Mặc định hiển thị “Chọn bàn” (giữ flow cũ)
    show('select-table'); hideAppInner(['start-screen','pos-container']);

    // sync số bàn text (nếu có)
    setTableText(LS.getItem('tableNumber') || '');

    startHeartbeat();
    listenCommands();
  }

  // ===== Boot sequence =====
  document.addEventListener('DOMContentLoaded', async ()=>{
    ensureBootShield();
    // Ẩn toàn bộ app UI cho tới khi qua cổng mã
    hideAppUI();

    const savedCode = (LS.getItem('deviceCode')||'').trim().toUpperCase();
    if (!savedCode){
      showCodeGate(); // chưa có code -> yêu cầu nhập
      return;
    }

    try{
      // Kiểm tra tình trạng mã hiện tại
      const snap = await db.ref('codes/'+savedCode).once('value');
      const data = snap.val();
      if (!data) throw new Error('Mã không tồn tại.');
      if (data.enabled === false) throw new Error('Mã đã bị tắt.');

      // Nếu mã đang gắn với máy khác -> xoá local & yêu cầu nhập lại
      const bound = data.boundDeviceId || null;
      if (bound && bound !== deviceId){
        LS.removeItem('deviceCode');
        throw new Error('Mã đã gắn với thiết bị khác.');
      }

      // Nếu chưa bound -> cố gắng claim qua TRANSACTION (tránh đua với máy khác)
      if (!bound){
        await claimCodeByTransaction(savedCode);
      }else{
        // bound đúng về máy này -> cập nhật device node cho chắc
        await db.ref('devices/'+deviceId).update({
          code: savedCode,
          lastSeen: firebase.database.ServerValue.TIMESTAMP
        });
      }

      // OK -> vào app
      enterApp();
    }catch(e){
      console.warn('[bind] Boot check failed:', e?.message||e);
      showCodeGate(e?.message || null);
    }
  });
})();
