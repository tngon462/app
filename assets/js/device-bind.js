// assets/js/device-bind.js (fix submit hang)
// - Đảm bảo auth ẩn danh trước khi dùng DB
// - Timeout & lỗi rõ ràng khi claim code
// - Giữ nguyên các luồng trước đó

(function(){
  'use strict';

  const LS = localStorage;
  const $  = (id)=>document.getElementById(id);

  function uuidv4(){
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c=>{
      const r = Math.random()*16|0, v=(c==='x')?r:(r&0x3|0x8); return v.toString(16);
    });
  }

  let deviceId = LS.getItem('deviceId');
  if(!deviceId){ deviceId = uuidv4(); LS.setItem('deviceId', deviceId); }

  // Bịt UI tới khi bind xong
  document.documentElement.classList.add('gating');

  // Stubs từ redirect-core
  const gotoSelect = window.gotoSelect || function(){};
  const gotoStart  = window.gotoStart  || function(){};
  const gotoPos    = window.gotoPos    || function(){};
  const getLinkForTable = window.getLinkForTable || function(){ return null; };

  // Firebase guard
  if(!window.firebase || !firebase.apps?.length){
    console.error('[bind] Firebase chưa sẵn sàng. Hãy chắc chắn đã load firebase.js trước.');
    return;
  }
  const db = firebase.database();

  // ===== Auth helpers =====
  async function ensureAuth(){
    // đã đăng nhập?
    const user = firebase.auth().currentUser;
    if (user) return user;
    // nếu chưa, đăng nhập ẩn danh
    try{
      await firebase.auth().signInAnonymously();
    }catch(e){
      console.error('[bind] signInAnonymously lỗi:', e);
      throw new Error('Không kết nối được Firebase (auth).');
    }
    // đợi onAuthStateChanged
    await new Promise((res)=> {
      const un = firebase.auth().onAuthStateChanged(u=>{ if(u){ un(); res(); }});
    });
    return firebase.auth().currentUser;
  }

  // ===== State helpers =====
  function appState(){ return LS.getItem('appState') || 'select'; }
  function tableState(){ return { id: LS.getItem('tableId')||'', url: LS.getItem('tableUrl')||'' }; }
  function setTableLocal(id, url){
    if (id==null){ LS.removeItem('tableId'); delete window.tableId; }
    else { LS.setItem('tableId', String(id)); window.tableId = String(id); }
    if (url==null) LS.removeItem('tableUrl'); else LS.setItem('tableUrl', url);
  }

  // ===== Gate UI =====
  function showGate(message){
    if ($('#code-gate')){
      if (message){ const e=$('#code-error'); if(e) e.textContent=message; }
      return;
    }
    const wrap = document.createElement('div');
    wrap.id = 'code-gate';
    wrap.style.cssText = 'position:fixed;inset:0;background:#fff;z-index:6000;';
    wrap.innerHTML = `
      <div class="w-full h-full flex items-center justify-center p-6">
        <div class="w-full max-w-sm bg-white border border-gray-200 rounded-2xl shadow p-6">
          <h1 class="text-2xl font-extrabold text-gray-900 mb-4 text-center">Nhập mã iPad</h1>
          <p class="text-sm text-gray-500 mb-4 text-center">Nhập mã do admin cấp.</p>
          <input id="code-input" type="text" maxlength="20" placeholder="VD: A1B2C3"
                 class="w-full border rounded-lg px-4 py-3 text-center tracking-widest font-mono text-lg"
                 autocomplete="one-time-code" />
          <div id="code-error" class="text-red-600 text-sm mt-2 h-5 text-center"></div>
          <button id="code-submit"
            class="mt-4 w-full rounded-xl bg-blue-600 text-white font-bold py-3 hover:bg-blue-700 transition">
            XÁC NHẬN
          </button>
        </div>
      </div>`;
    document.body.appendChild(wrap);

    const btn = $('#code-submit');
    const input = $('#code-input');
    const err = $('#code-error');

    function setBusy(b){ btn.disabled=b; btn.textContent = b?'Đang kiểm tra…':'XÁC NHẬN'; }

    async function submit(){
      const raw = (input.value||'').trim().toUpperCase();
      err.textContent = '';
      if (!raw){ err.textContent='Vui lòng nhập mã.'; return; }
      setBusy(true);
      console.log('[bind] submit code =', raw);

      try{
        await ensureAuth();

        // timeout 8s cho claim code để không treo im lặng
        const timeout = new Promise((_,rej)=> setTimeout(()=> rej(new Error('Kết nối chậm, thử lại.')), 8000));
        await Promise.race([ claimCode(raw), timeout ]);

        // ok
        wrap.remove();
        startCommandListener();
        document.documentElement.classList.remove('gating');
        // trở về đúng màn cũ hoặc Start
        if (LS.getItem('appState')==='start') gotoStart(); else gotoSelect(false);
      }catch(e){
        console.warn('[bind] submit error:', e);
        err.textContent = e?.message || 'Không dùng được mã này.';
      }finally{
        setBusy(false);
      }
    }
    btn.addEventListener('click', submit);
    input.addEventListener('keydown', e=>{ if(e.key==='Enter') submit(); });
    setTimeout(()=> input.focus(), 60);
    if (message){ err.textContent = message; }
  }

  // ===== 1 code <-> 1 device (transaction) =====
  async function claimCode(code){
    console.log('[bind] claimCode start for', code);
    const ref = db.ref('codes/'+code);
    const res = await ref.transaction(cur=>{
      if (!cur) return cur;                  // không tồn tại -> fail (committed=false)
      if (cur.enabled === false) return;     // tắt -> fail
      if (cur.boundDeviceId && cur.boundDeviceId !== deviceId) return; // đang máy khác -> fail
      return { ...cur, boundDeviceId: deviceId, boundAt: firebase.database.ServerValue.TIMESTAMP };
    });
    console.log('[bind] transaction result:', res);
    if (!res.committed) throw new Error('Mã không khả dụng hoặc đã dùng ở thiết bị khác.');

    await db.ref('devices/'+deviceId).update({
      code: code,
      lastSeen: firebase.database.ServerValue.TIMESTAMP,
    });
    LS.setItem('deviceCode', code);
    console.log('[bind] claimCode OK');
  }

  // ===== Heartbeat =====
  async function heartbeat(){
    try{
      await ensureAuth();
      const code = LS.getItem('deviceCode') || null;
      const state = appState();
      const {id:tableId} = tableState();
      await db.ref('devices/'+deviceId).update({
        code,
        stage: state,
        table: tableId || null,
        inPOS: state === 'pos',
        lastSeen: firebase.database.ServerValue.TIMESTAMP,
      });
    }catch(e){
      console.warn('[bind] heartbeat error:', e?.message||e);
    }
  }

  // ===== Commands =====
  function startCommandListener(){
    const cmdRef = db.ref('devices/'+deviceId+'/commands');
    cmdRef.on('value', (snap)=>{
      const c = snap.val() || {};

      if (c.reloadAt){ location.reload(); return; }

      if (c.setTable && c.setTable.value){
        const t = String(c.setTable.value);
        const url = (window.getLinkForTable && window.getLinkForTable(t)) || null;
        setTableLocal(t, url);
        window.dispatchEvent(new CustomEvent('tngon:tableChanged', { detail:{ table:t, url } }));
        db.ref('devices/'+deviceId).update({ table: t });
        cmdRef.child('setTable').remove().catch(()=>{});
      }

      if (c.unbindAt){
        LS.removeItem('deviceCode');
        setTableLocal(null, null);
        LS.removeItem('appState');
        db.ref('devices/'+deviceId).update({ code:null, table:null, stage:'select', inPOS:false });
        document.documentElement.classList.add('gating');
        showGate('Mã đã bị thu hồi. Vui lòng nhập mã khác.');
      }
    });

    db.ref('broadcast/reloadAt').on('value', s=>{ if (s.val()) location.reload(); });
  }

  // ===== Boot =====
  document.addEventListener('DOMContentLoaded', async ()=>{
    // tùy chọn xoá cache nhanh: ?forceGate=1
    const u = new URL(location.href);
    if (u.searchParams.get('forceGate') === '1'){
      LS.removeItem('deviceCode'); LS.removeItem('tableId'); LS.removeItem('tableUrl'); LS.removeItem('appState');
    }

    // Heartbeat ngay & định kỳ
    heartbeat();
    setInterval(heartbeat, 20000);
    document.addEventListener('visibilitychange', ()=>{ if (!document.hidden) heartbeat(); });

    try{
      await ensureAuth();
    }catch(e){
      console.error('[bind] Auth init error:', e);
      showGate('Không kết nối được Firebase.');
      return;
    }

    const code = LS.getItem('deviceCode');
    if (!code){ showGate(); return; }

    // có code: xác minh lại
    try{
      const snap = await db.ref('codes/'+code).once('value');
      const v = snap.val();
      if (!v) throw new Error('Mã không tồn tại.');
      if (v.enabled === false) throw new Error('Mã đã bị tắt.');
      if (v.boundDeviceId && v.boundDeviceId !== deviceId) throw new Error('Mã dùng ở thiết bị khác.');

      document.documentElement.classList.remove('gating');
      startCommandListener();
    }catch(e){
      console.warn('[bind] boot code invalid:', e?.message||e);
      LS.removeItem('deviceCode');
      document.documentElement.classList.add('gating');
      showGate(e?.message || 'Vui lòng nhập mã.');
    }
  });
})();
