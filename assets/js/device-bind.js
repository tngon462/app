// assets/js/device-bind.js
// v14 — KHÔNG reload khi đổi bàn; reload chỉ khi "Làm mới"
// - Transaction 1-mã-1-máy (ràng buộc: codes/<code>.boundDeviceId === deviceId)
// - Lọc lệnh theo SESSION_TS để tránh dính lệnh cũ (unbind/reload cũ)
// - Đổi bàn: chỉ phát event cho core, không sờ tới deviceCode
// - Gỡ liên kết: xóa local + reload → Gate
(function () {
  const SESSION_TS = Date.now();
  const LS = window.localStorage;
  const $  = (id) => document.getElementById(id);

  function uuidv4(){return'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0,v=c==='x'?r:(r&0x3|0x8);return v.toString(16);});}
  const log = (...a)=>console.log('[bind v14]', ...a);

  // DeviceId (ổn định theo LS)
  let deviceId = LS.getItem('deviceId');
  if (!deviceId){ deviceId = uuidv4(); LS.setItem('deviceId', deviceId); }
  log('deviceId =', deviceId);

  // Firebase init
  if (!firebase.apps.length) {
    if (typeof window.firebaseConfig === 'undefined') {
      console.error('[bind] Thiếu firebaseConfig! Hãy load assets/js/firebase.js trước.');
      return;
    }
    firebase.initializeApp(window.firebaseConfig);
  }
  const db = firebase.database();
  firebase.auth().onAuthStateChanged(u => { if (!u) firebase.auth().signInAnonymously().catch(()=>{}); });

  // UI helpers
  function ensureBootShield(){
    if (document.getElementById('boot-shield')) return;
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
  function removeBootShield(){ const el=document.getElementById('boot-shield'); if(el) el.remove(); }
  function hide(id){ const el=document.getElementById(id); if(el) el.classList.add('hidden'); }
  function show(id){ const el=document.getElementById(id); if(el) el.classList.remove('hidden'); }
  function hideAppUI(){ ['select-table','start-screen','pos-container'].forEach(hide); }
  function setTableText(t){ const el=document.getElementById('selected-table'); if(el) el.textContent=t||''; }
  const n = (x)=> Number.isFinite(+x) ? +x : 0;

  // Thông báo cho core table mới (KHÔNG reload)
  function notifyCoreTable(table){
    const t = String(table||'').trim();
    LS.setItem('tableNumber', t);
    setTableText(t);
    try {
      document.dispatchEvent(new CustomEvent('tngon:external-set-table', { detail: { table: t }}));
    } catch(_) {}
    log('notifyCoreTable ->', t);
  }

  // ===== Gate nhập mã =====
  let gateShown = false;
  function showCodeGate(message){
    if (gateShown) { const e=document.getElementById('code-error'); if(e&&message) e.textContent=message; return; }
    gateShown = true;

    const wrap = document.createElement('div');
    wrap.id = 'code-gate';
    wrap.style.cssText = 'position:fixed;inset:0;background:#fff;z-index:6000;';
    wrap.innerHTML = `
      <div class="w-full h-full flex items-center justify-center p-6">
        <div class="w-full max-w-sm bg-white border border-gray-200 rounded-2xl shadow p-6">
          <h1 class="text-2xl font-extrabold text-gray-900 mb-4 text-center">Nhập mã iPad</h1>
          <p class="text-sm text-gray-500 mb-4 text-center">Nhập mã được cấp để tiếp tục.</p>
          <input id="code-input" type="text" maxlength="20" placeholder="VD: A1B2C3"
                 class="w-full border rounded-lg px-4 py-3 text-center tracking-widest font-mono text-lg"
                 inputmode="latin" autocomplete="one-time-code" />
          <div id="code-error" class="text-red-600 text-sm mt-2 h-5">${message||''}</div>
          <button id="code-submit"
            class="mt-4 w-full rounded-xl bg-blue-600 text-white font-bold py-3 hover:bg-blue-700 transition">XÁC NHẬN</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);

    const input=document.getElementById('code-input'),
          btn=document.getElementById('code-submit'),
          err=document.getElementById('code-error');
    function setBusy(b){ btn.disabled=b; btn.textContent=b?'Đang kiểm tra…':'XÁC NHẬN'; }

    async function submit(){
      const raw=(input.value||'').trim().toUpperCase();
      err.textContent='';
      if(!raw){ err.textContent='Vui lòng nhập mã.'; return; }
      setBusy(true);
      try{
        await claimCodeByTransaction(raw);          // ràng buộc 1-mã-1-máy
        LS.setItem('deviceCode', raw);
        document.getElementById('code-gate')?.remove();
        enterApp();
      }catch(e){
        err.textContent = e?.message || 'Mã không khả dụng hoặc đã dùng ở máy khác.';
      }finally{ setBusy(false); }
    }
    btn.addEventListener('click', submit);
    input.addEventListener('keydown', e=>{ if(e.key==='Enter') submit(); });
    setTimeout(()=> input.focus(), 60);
  }

  // Transaction: chỉ cho phép boundDeviceId null/this device
  async function claimCodeByTransaction(code){
    const ref = db.ref('codes/'+code);
    const res = await ref.transaction((data)=>{
      if (!data) return data;                // không tồn tại → abort
      if (data.enabled === false) return;    // tắt → abort (return undefined)
      const bd = data.boundDeviceId || null;
      if (bd === null || bd === deviceId){
        return { ...data,
          boundDeviceId: deviceId,
          boundAt: firebase.database.ServerValue.TIMESTAMP
        };
      }
      return; // abort
    }, undefined, false);

    if (!res.committed) throw new Error('Mã không khả dụng hoặc đã gắn ở thiết bị khác.');

    // Lưu dấu vết thiết bị
    await db.ref('devices/'+deviceId).update({
      code: code,
      lastSeen: firebase.database.ServerValue.TIMESTAMP,
      info: { ua: navigator.userAgent }
    });
    log('claim OK ->', code);
  }

  function startHeartbeat(){
    setInterval(()=> db.ref('devices/'+deviceId)
      .update({ lastSeen: firebase.database.ServerValue.TIMESTAMP }).catch(()=>{}), 30*1000);
  }

  function listenCommands(){
    const cmdRef = db.ref('devices/'+deviceId+'/commands');

    cmdRef.on('value', (s)=>{
      const c = s.val() || {};

      // “Làm mới” → set cờ rồi reload (trở lại Start)
      const ra = n(c.reloadAt);
      if (ra && ra > SESSION_TS){
        log('commands.reloadAt -> reload to Start');
        try { LS.setItem('startupMode','start'); } catch(_) {}
        cmdRef.child('reloadAt').remove().finally(()=> location.reload(true));
        return;
      }

      // “Đổi bàn” → KHÔNG reload, chỉ đưa về Start với bàn mới
      if (c.setTable && c.setTable.value){
        const at = n(c.setTable.at || c.setTable.ts);
        if (at > SESSION_TS){
          const t = String(c.setTable.value).trim();
          log('commands.setTable ->', t);
          notifyCoreTable(t);
          db.ref('devices/'+deviceId).update({ table: t, lastKnownTable: t }).catch(()=>{});
          cmdRef.child('setTable').remove().catch(()=>{});
          show('start-screen'); hide('select-table'); hide('pos-container');
        }
      }

      // “Gỡ liên kết” → xóa local + reload về Gate
      const ua = n(c.unbindAt);
      if (ua && ua > SESSION_TS){
        log('commands.unbindAt -> gate');
        LS.removeItem('deviceCode');
        LS.removeItem('tableNumber');
        LS.removeItem('startupMode');
        cmdRef.child('unbindAt').remove().finally(()=> location.reload(true));
      }
    });

    // Broadcast reload toàn bộ
    db.ref('broadcast/reloadAt').on('value', s=>{
      const ts = n(s.val());
      if (ts && ts > SESSION_TS){
        log('broadcast.reloadAt -> reload to Start');
        try { LS.setItem('startupMode','start'); } catch(_) {}
        location.reload(true);
      }
    });
  }

  // Vào app
  let entered = false;
  function enterApp(){
    if (entered) return;
    entered = true;

    document.documentElement.classList.remove('gating');
    removeBootShield();

    const wantStart = (LS.getItem('startupMode') === 'start');
    const t = LS.getItem('tableNumber') || '';
    if (t) notifyCoreTable(t);

    if (wantStart && t){
      log('enterApp -> Start (wantStart)');
      show('start-screen'); hide('select-table'); hide('pos-container');
      setTimeout(()=> LS.removeItem('startupMode'), 150);
    } else {
      log('enterApp -> Select');
      show('select-table'); hide('start-screen'); hide('pos-container');
    }

    startHeartbeat();
    listenCommands();
  }

  // Boot
  document.addEventListener('DOMContentLoaded', async ()=>{
    ensureBootShield();
    hideAppUI();

    const saved = (LS.getItem('deviceCode')||'').trim().toUpperCase();
    log('Boot deviceCode =', saved || '(none)');
    if (!saved){ showCodeGate(); return; }

    try{
      const snap = await db.ref('codes/'+saved).once('value');
      const data = snap.val();
      if (!data) throw new Error('Mã không tồn tại.');
      if (data.enabled === false) throw new Error('Mã đã bị tắt.');
      const bd = data.boundDeviceId || null;
      if (bd && bd !== deviceId){
        LS.removeItem('deviceCode');   // làm sạch local sai
        throw new Error('Mã đã gắn với thiết bị khác.');
      }
      if (!bd){
        await claimCodeByTransaction(saved); // bind về this device
      }else{
        await db.ref('devices/'+deviceId).update({ code: saved, lastSeen: firebase.database.ServerValue.TIMESTAMP });
      }
      enterApp();
    }catch(e){
      console.warn('[bind] boot error:', e);
      showCodeGate(e?.message || null);
    }
  });
})();
