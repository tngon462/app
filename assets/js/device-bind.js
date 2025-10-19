// assets/js/device-bind.js
// v10b-transaction-strict + anti-flicker by timestamp
// - RÀNG BUỘC 1-MÃ-1-MÁY bằng TRANSACTION
// - BỎ QUA lệnh admin cũ (stale) bằng so sánh timestamp với SESSION_TS
// - Dọn lệnh sau khi xử lý để không lặp

(function(){
  const SESSION_TS = Date.now(); // mốc phiên hiện tại
  const LS = window.localStorage;
  const $  = (id) => document.getElementById(id);

  function uuidv4(){return'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0,v=c==='x'?r:(r&0x3|0x8);return v.toString(16);});}
  function n(x){ const v=Number(x); return Number.isFinite(v) ? v : 0; }

  let deviceId = LS.getItem('deviceId');
  if (!deviceId){ deviceId = uuidv4(); LS.setItem('deviceId', deviceId); }
  console.log('[bind] v10b deviceId =', deviceId);

  // ===== Firebase =====
  if (!firebase.apps.length) {
    if (typeof window.firebaseConfig === 'undefined') {
      console.error('[bind] Thiếu firebaseConfig! Hãy load assets/js/firebase.js trước.');
      return;
    }
    firebase.initializeApp(window.firebaseConfig);
  }
  const db = firebase.database();

  firebase.auth().onAuthStateChanged((u)=>{
    if (!u) firebase.auth().signInAnonymously().catch(e=>console.error('[bind] anon auth error:', e));
  });

  // ===== Boot shield & Gate =====
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
  function hide(id){ const el=$(id); if(el) el.classList.add('hidden'); }
  function show(id){ const el=$(id); if(el) el.classList.remove('hidden'); }
  function setTableText(t){ const el=$('selected-table'); if(el) el.textContent = t||''; }
  function hideAppUI(){ ['select-table','start-screen','pos-container'].forEach(hide); }
  function hideAppInner(ids){ ids.forEach(hide); }

  let gateShown = false;
  function showCodeGate(message){
    if (gateShown) { const e=$('code-error'); if(e&&message) e.textContent=message; return; }
    gateShown = true;

    const gate = document.createElement('div');
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
          <div id="code-error" class="text-red-600 text-sm mt-2 h-5">${message||''}</div>
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
        await claimCodeByTransaction(raw);
        LS.setItem('deviceCode', raw);
        // vào app
        const el=$('code-gate'); if(el) el.remove();
        enterApp();
      }catch(e){
        err.textContent = e?.message || 'Mã không khả dụng hoặc đã dùng ở máy khác.';
      }finally{ setBusy(false); }
    }
    btn.addEventListener('click', submit);
    input.addEventListener('keydown', (e)=>{ if(e.key==='Enter') submit(); });
    setTimeout(()=> input.focus(), 60);
  }

  // ===== Claim code bằng TRANSACTION (1-mã-1-máy) =====
  async function claimCodeByTransaction(code){
    const codeRef = db.ref('codes/'+code);
    const res = await codeRef.transaction((data)=>{
      if (!data) return data;                 // không tồn tại -> abort
      if (data.enabled === false) return;     // tắt -> abort
      const bound = data.boundDeviceId || null;
      if (bound === null || bound === deviceId){
        return {
          ...data,
          boundDeviceId: deviceId,
          boundAt: firebase.database.ServerValue.TIMESTAMP
        };
      }
      return; // abort commit (đang bị máy khác cầm)
    }, undefined, false);

    if (!res.committed) throw new Error('Mã không khả dụng hoặc đã gắn ở thiết bị khác.');

    await db.ref('devices/'+deviceId).update({
      code,
      lastSeen: firebase.database.ServerValue.TIMESTAMP,
      info: { ua: navigator.userAgent }
    });
  }

  // ===== Heartbeat & commands (ANTI-FLICKER bằng timestamp) =====
  function startHeartbeat(){
    setInterval(()=>{
      db.ref('devices/'+deviceId).update({ lastSeen: firebase.database.ServerValue.TIMESTAMP })
        .catch(()=>{});
    }, 30*1000);
  }

  function listenCommands(){
    const cmdRef = db.ref('devices/'+deviceId+'/commands');

    cmdRef.on('value', (s)=>{
      const c = s.val() || {};

      // reloadAt (chỉ xử lý khi mới hơn phiên)
      const ra = n(c.reloadAt);
      if (ra && ra > SESSION_TS){
        // dọn flag rồi reload
        cmdRef.child('reloadAt').remove().finally(()=> location.reload(true));
        return;
      }

      // setTable
      if (c.setTable && c.setTable.value){
        const at = n(c.setTable.at) || n(c.setTable.ts) || 0;
        if (at > SESSION_TS){
          const t = String(c.setTable.value).trim();
          LS.setItem('tableNumber', t);
          db.ref('devices/'+deviceId).update({ table: t, lastKnownTable: t }).catch(()=>{});
          show('start-screen'); hideAppInner(['select-table','pos-container']);
          setTableText(t);
          cmdRef.child('setTable').remove().catch(()=>{});
        }
      }

      // unbindAt
      const ua = n(c.unbindAt);
      if (ua && ua > SESSION_TS){
        LS.removeItem('deviceCode');
        LS.removeItem('tableNumber');
        cmdRef.child('unbindAt').remove().finally(()=> location.reload(true));
      }
    });

    // broadcast reload (bỏ qua lệnh cũ)
    db.ref('broadcast/reloadAt').on('value', s=>{
      const ts = n(s.val());
      if (ts && ts > SESSION_TS){
        location.reload(true);
      }
    });
  }

  // ===== Enter app (one-shot) =====
  let entered = false;
  function enterApp(){
    if (entered) return;
    entered = true;

    document.documentElement.classList.remove('gating');
    removeBootShield();

    // Hiển thị flow cũ: màn chọn bàn trước
    show('select-table'); hideAppInner(['start-screen','pos-container']);

    setTableText(LS.getItem('tableNumber') || '');

    startHeartbeat();
    listenCommands();
  }

  // ===== Boot =====
  document.addEventListener('DOMContentLoaded', async ()=>{
    ensureBootShield();
    hideAppUI();

    const savedCode = (LS.getItem('deviceCode')||'').trim().toUpperCase();
    if (!savedCode){
      showCodeGate(); // chưa có mã -> gate
      return;
    }

    try{
      const snap = await db.ref('codes/'+savedCode).once('value');
      const data = snap.val();
      if (!data) throw new Error('Mã không tồn tại.');
      if (data.enabled === false) throw new Error('Mã đã bị tắt.');

      const bound = data.boundDeviceId || null;
      if (bound && bound !== deviceId){
        LS.removeItem('deviceCode');
        throw new Error('Mã đã gắn với thiết bị khác.');
      }

      if (!bound){
        await claimCodeByTransaction(savedCode); // chống đua
      } else {
        await db.ref('devices/'+deviceId).update({
          code: savedCode,
          lastSeen: firebase.database.ServerValue.TIMESTAMP
        });
      }

      enterApp();
    }catch(e){
      console.warn('[bind] Boot check failed:', e?.message||e);
      showCodeGate(e?.message || null);
    }
  });

})();
