// assets/js/device-bind.js
// v10c-transaction-strict + anti-flicker + startupMode=start
// - TRANSACTION: 1 mã chỉ gắn 1 máy
// - Bỏ qua lệnh admin cũ bằng timestamp SESSION_TS
// - Khi admin setTable/reload → set localStorage.startupMode="start" → sau reload vào thẳng Start Order

(function(){
  const SESSION_TS = Date.now();
  const LS = window.localStorage;
  const $  = (id) => document.getElementById(id);

  function uuidv4(){return'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0,v=c==='x'?r:(r&0x3|0x8);return v.toString(16);});}
  function n(x){ const v=Number(x); return Number.isFinite(v) ? v : 0; }

  let deviceId = LS.getItem('deviceId');
  if (!deviceId){ deviceId = uuidv4(); LS.setItem('deviceId', deviceId); }

  if (!firebase.apps.length) {
    if (typeof window.firebaseConfig === 'undefined') {
      console.error('[bind] Thiếu firebaseConfig! Hãy load assets/js/firebase.js trước.');
      return;
    }
    firebase.initializeApp(window.firebaseConfig);
  }
  const db = firebase.database();

  firebase.auth().onAuthStateChanged((u)=>{
    if (!u) firebase.auth().signInAnonymously().catch(()=>{});
  });

  // ---- UI helpers ----
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
  function hideAppUI(){ ['select-table','start-screen','pos-container'].forEach(hide); }
  function setTableText(t){ const el=$('selected-table'); if(el) el.textContent=t||''; }

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
        const el=$('code-gate'); if(el) el.remove();
        enterApp(); // vào app
      }catch(e){
        err.textContent = e?.message || 'Mã không khả dụng hoặc đã dùng ở máy khác.';
      }finally{ setBusy(false); }
    }
    btn.addEventListener('click', submit);
    input.addEventListener('keydown', e=>{ if(e.key==='Enter') submit(); });
    setTimeout(()=> input.focus(), 60);
  }

  // ---- TRANSACTION claim ----
  async function claimCodeByTransaction(code){
    const codeRef = db.ref('codes/'+code);
    const res = await codeRef.transaction((data)=>{
      if (!data) return data;
      if (data.enabled === false) return;
      const bound = data.boundDeviceId || null;
      if (bound === null || bound === deviceId){
        return { ...data, boundDeviceId: deviceId, boundAt: firebase.database.ServerValue.TIMESTAMP };
      }
      return; // không commit
    }, undefined, false);

    if (!res.committed) throw new Error('Mã không khả dụng hoặc đã gắn ở thiết bị khác.');

    await db.ref('devices/'+deviceId).update({
      code,
      lastSeen: firebase.database.ServerValue.TIMESTAMP,
      info: { ua: navigator.userAgent }
    });
  }

  // ---- Heartbeat & commands (lọc theo timestamp mới) ----
  function startHeartbeat(){
    setInterval(()=> {
      db.ref('devices/'+deviceId).update({ lastSeen: firebase.database.ServerValue.TIMESTAMP }).catch(()=>{});
    }, 30*1000);
  }

  function listenCommands(){
    const cmdRef = db.ref('devices/'+deviceId+'/commands');

    cmdRef.on('value', (s)=>{
      const c = s.val() || {};

      // reloadAt
      const ra = Number(c.reloadAt||0);
      if (ra && ra > SESSION_TS){
        cmdRef.child('reloadAt').remove().finally(()=> location.reload(true));
        return;
      }

      // setTable
      if (c.setTable && c.setTable.value){
        const at = Number(c.setTable.at||c.setTable.ts||0);
        if (at > SESSION_TS){
          const t = String(c.setTable.value).trim();
          LS.setItem('tableNumber', t);
          LS.setItem('startupMode', 'start'); // quan trọng: sau reload vào thẳng Start
          db.ref('devices/'+deviceId).update({ table: t, lastKnownTable: t }).catch(()=>{});
          // nếu không reload, vẫn đưa ngay về Start Order
          show('start-screen'); hide('select-table'); hide('pos-container');
          setTableText(t);
          cmdRef.child('setTable').remove().catch(()=>{});
        }
      }

      // unbindAt
      const ua = Number(c.unbindAt||0);
      if (ua && ua > SESSION_TS){
        LS.removeItem('deviceCode');
        LS.removeItem('tableNumber');
        LS.removeItem('startupMode');
        cmdRef.child('unbindAt').remove().finally(()=> location.reload(true));
      }
    });

    // broadcast reload
    db.ref('broadcast/reloadAt').on('value', s=>{
      const ts = Number(s.val()||0);
      if (ts && ts > SESSION_TS){
        location.reload(true);
      }
    });
  }

  // ---- Enter app (chọn màn hình theo startupMode) ----
  let entered = false;
  function enterApp(){
    if (entered) return;
    entered = true;

    document.documentElement.classList.remove('gating');
    const boot = $('boot-shield'); if (boot) boot.remove();

    const wantStart = (LS.getItem('startupMode') === 'start') && !!LS.getItem('tableNumber');
    if (wantStart){
      const t = LS.getItem('tableNumber');
      show('start-screen'); hide('select-table'); hide('pos-container');
      setTableText(t);
      // xoá cờ sau khi đã vào Start
      setTimeout(()=> LS.removeItem('startupMode'), 300);
    }else{
      // flow cũ
      show('select-table'); hide('start-screen'); hide('pos-container');
      setTableText(LS.getItem('tableNumber') || '');
    }

    startHeartbeat();
    listenCommands();
  }

  // ---- Boot ----
  document.addEventListener('DOMContentLoaded', async ()=>{
    ensureBootShield();
    hideAppUI();

    const savedCode = (LS.getItem('deviceCode')||'').trim().toUpperCase();
    if (!savedCode){
      showCodeGate();
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
        await claimCodeByTransaction(savedCode);
      }else{
        await db.ref('devices/'+deviceId).update({
          code: savedCode,
          lastSeen: firebase.database.ServerValue.TIMESTAMP
        });
      }

      enterApp();
    }catch(e){
      showCodeGate(e?.message || null);
    }
  });

})();
