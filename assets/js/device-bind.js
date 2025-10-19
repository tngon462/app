// assets/js/device-bind.js
// v12 — transaction 1-mã-1-máy + anti-flicker + phát sự kiện cho core cập nhật START ORDER

(function(){
  const SESSION_TS = Date.now();
  const LS = window.localStorage;
  const $  = (id) => document.getElementById(id);

  function uuidv4(){return'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0,v=c==='x'?r:(r&0x3|0x8);return v.toString(16);});}
  function n(x){ const v = Number(x); return Number.isFinite(v) ? v : 0; }

  let deviceId = LS.getItem('deviceId');
  if (!deviceId){ deviceId = uuidv4(); LS.setItem('deviceId', deviceId); }

  // Firebase
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

  // Thông báo cho core mỗi khi bàn đổi
  function notifyCoreTable(table){
    const t = (table||'').toString().trim();
    LS.setItem('tableNumber', t);
    window.TNGON_SELECTED_TABLE = t;
    setTableText(t);
    try{
      document.dispatchEvent(new CustomEvent('tngon:external-set-table', { detail: { table: t }}));
    }catch(_) {}
  }

  // Gate (nhập mã)
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
        await claimCodeByTransaction(raw);
        LS.setItem('deviceCode', raw);
        const el=document.getElementById('code-gate'); if(el) el.remove();
        enterApp();
      }catch(e){
        err.textContent = e?.message || 'Mã không khả dụng hoặc đã dùng ở máy khác.';
      }finally{ setBusy(false); }
    }
    btn.addEventListener('click', submit);
    input.addEventListener('keydown', e=>{ if(e.key==='Enter') submit(); });
    setTimeout(()=> input.focus(), 60);
  }

  // Transaction claim 1-mã-1-máy
  async function claimCodeByTransaction(code){
    const ref = db.ref('codes/'+code);
    const res = await ref.transaction((data)=>{
      if (!data) return data;
      if (data.enabled === false) return;
      const bound = data.boundDeviceId || null;
      if (bound === null || bound === deviceId){
        return { ...data, boundDeviceId: deviceId, boundAt: firebase.database.ServerValue.TIMESTAMP };
      }
      return; // abort commit
    }, undefined, false);

    if (!res.committed) throw new Error('Mã không khả dụng hoặc đã gắn ở thiết bị khác.');

    await db.ref('devices/'+deviceId).update({
      code,
      lastSeen: firebase.database.ServerValue.TIMESTAMP,
      info: { ua: navigator.userAgent }
    });
  }

  // Heartbeat + Commands
  function startHeartbeat(){
    setInterval(()=> db.ref('devices/'+deviceId)
      .update({ lastSeen: firebase.database.ServerValue.TIMESTAMP }).catch(()=>{}), 30*1000);
  }

  function listenCommands(){
    const cmdRef = db.ref('devices/'+deviceId+'/commands');

    cmdRef.on('value', (s)=>{
      const c = s.val() || {};

      // reloadAt (mới hơn phiên)
      const ra = n(c.reloadAt);
      if (ra && ra > SESSION_TS){
        cmdRef.child('reloadAt').remove().finally(()=> location.reload(true));
        return;
      }

      // setTable (mới hơn phiên)
      if (c.setTable && c.setTable.value){
        const at = n(c.setTable.at || c.setTable.ts);
        if (at > SESSION_TS){
          const t = String(c.setTable.value).trim();
          // Lưu + báo core + đặt cờ để sau reload vào Start
          notifyCoreTable(t);
          LS.setItem('startupMode', 'start');
          // Cho admin thấy ngay
          db.ref('devices/'+deviceId).update({ table: t, lastKnownTable: t }).catch(()=>{});
          // Dọn lệnh
          cmdRef.child('setTable').remove().catch(()=>{});
          // Mở Start screen (không auto vào POS)
          show('start-screen'); hide('select-table'); hide('pos-container');
        }
      }

      // unbindAt (mới hơn phiên)
      const ua = n(c.unbindAt);
      if (ua && ua > SESSION_TS){
        LS.removeItem('deviceCode');
        LS.removeItem('tableNumber');
        LS.removeItem('startupMode');
        cmdRef.child('unbindAt').remove().finally(()=> location.reload(true));
      }
    });

    // broadcast reload
    db.ref('broadcast/reloadAt').on('value', s=>{
      const ts = n(s.val());
      if (ts && ts > SESSION_TS) location.reload(true);
    });
  }

  // Enter app
  let entered = false;
  function enterApp(){
    if (entered) return;
    entered = true;

    document.documentElement.classList.remove('gating');
    removeBootShield();

    const wantStart = (LS.getItem('startupMode') === 'start') && !!LS.getItem('tableNumber');
    const t = LS.getItem('tableNumber') || '';
    notifyCoreTable(t);

    if (wantStart && t){
      show('start-screen'); hide('select-table'); hide('pos-container');
      setTimeout(()=> LS.removeItem('startupMode'), 200);
    }else{
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
    if (!saved){ showCodeGate(); return; }

    try{
      const snap = await db.ref('codes/'+saved).once('value');
      const data = snap.val();
      if (!data) throw new Error('Mã không tồn tại.');
      if (data.enabled === false) throw new Error('Mã đã bị tắt.');
      const bound = data.boundDeviceId || null;
      if (bound && bound !== deviceId){
        LS.removeItem('deviceCode');
        throw new Error('Mã đã gắn với thiết bị khác.');
      }
      if (!bound){
        await claimCodeByTransaction(saved);
      }else{
        await db.ref('devices/'+deviceId).update({ code: saved, lastSeen: firebase.database.ServerValue.TIMESTAMP });
      }
      enterApp();
    }catch(e){
      showCodeGate(e?.message || null);
    }
  });
})();
