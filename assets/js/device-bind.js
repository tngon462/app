// assets/js/device-bind.js
// JS THUẦN (KHÔNG có <script> bên trong)
// - Hiện Gate nhập mã
// - Ràng buộc 1 mã ↔ 1 thiết bị (transaction)
// - Ghi /devices để admin thấy
// - Không reload, không đụng UI của redirect-core

(function(){
  'use strict';

  const LS = localStorage;
  const $  = (id)=>document.getElementById(id);

  function uuidv4(){
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c=>{
      const r = Math.random()*16|0, v=(c==='x')?r:(r&0x3|0x8);
      return v.toString(16);
    });
  }

  let deviceId = LS.getItem('deviceId');
  if (!deviceId){ deviceId = uuidv4(); LS.setItem('deviceId', deviceId); }
  console.log('[bind] boot deviceId =', deviceId);

  // Firebase đã được load ở redirect.html trước file này
  if (!window.firebase || !firebase.apps?.length){
    console.error('[bind] Firebase chưa sẵn sàng. Hãy chắc chắn đã load firebase-app/auth/database & firebase.js trước file này.');
    return;
  }
  const db = firebase.database();

  // ==== Auth ẩn danh ====
  async function ensureAuth(){
    if (firebase.auth().currentUser) return;
    await firebase.auth().signInAnonymously();
    await new Promise(res=>{
      const un = firebase.auth().onAuthStateChanged(u=>{ if(u){ un(); res(); } });
    });
  }

  // ==== GATE (nhập mã) ====
  function showGate(message){
    let wrap = $('code-gate');
    if (!wrap){
      wrap = document.createElement('div');
      wrap.id = 'code-gate';
      wrap.style.cssText = 'position:fixed;inset:0;background:#fff;z-index:6000;';
      wrap.innerHTML = `
        <div class="w-full h-full flex items-center justify-center p-6">
          <div class="w-full max-w-sm bg-white border border-gray-200 rounded-2xl shadow p-6">
            <h1 class="text-2xl font-extrabold text-gray-900 mb-4 text-center">Nhập mã iPad</h1>
            <p class="text-sm text-gray-500 mb-4 text-center">Nhập mã do admin cấp.</p>
            <input id="code-input" type="text" maxlength="20"
                   class="w-full border rounded-lg px-4 py-3 text-center font-mono text-lg"
                   placeholder="VD: TEST / 44" />
            <div id="code-error" class="text-red-600 text-sm mt-2 h-5 text-center"></div>
            <button id="code-submit"
              class="mt-4 w-full rounded-xl bg-blue-600 text-white font-bold py-3 hover:bg-blue-700">
              XÁC NHẬN
            </button>
          </div>
        </div>`;
      document.body.appendChild(wrap);

      const btn  = $('code-submit');
      const input= $('code-input');
      const err  = $('code-error');

      function busy(b){ btn.disabled = b; btn.textContent = b ? 'Đang kiểm tra…' : 'XÁC NHẬN'; }

      async function onSubmit(){
        const code = (input.value||'').trim().toUpperCase();
        err.textContent = '';
        if (!code){ err.textContent = 'Vui lòng nhập mã.'; return; }
        console.log('[bind] submit code =', code);
        busy(true);
        try{
          await ensureAuth();
          // Transaction bind mã ↔ thiết bị
          await claimCode(code);
          // OK → gỡ gate
          wrap.remove();
          // Ghi ngay để admin thấy
          heartbeat();
          // nếu redirect-core có gotoStart thì gọi để về màn Start Order (không reload)
          if (window.gotoStart) window.gotoStart();
        }catch(e){
          console.warn('[bind] submit error:', e);
          err.textContent = e?.message || 'Không dùng được mã này.';
        }finally{
          busy(false);
        }
      }

      btn.addEventListener('click', onSubmit);
      input.addEventListener('keydown', e=>{ if (e.key === 'Enter') onSubmit(); });
      setTimeout(()=> input.focus(), 50);
      if (message){ err.textContent = message; }
    } else if (message){
      const err = $('code-error'); if (err) err.textContent = message;
    }
  }

  // ==== Transaction 1-mã-1-máy ====
  async function claimCode(code){
    const ref = db.ref('codes/'+code);
    const res = await ref.transaction(cur=>{
      if (!cur) return cur;                   // không tồn tại -> fail (committed=false)
      if (cur.enabled === false) return;      // tắt -> fail
      if (cur.boundDeviceId && cur.boundDeviceId !== deviceId) return; // đã gắn máy khác -> fail
      return {
        ...cur,
        boundDeviceId: deviceId,
        boundAt: firebase.database.ServerValue.TIMESTAMP
      };
    });
    if (!res.committed) throw new Error('Mã không khả dụng hoặc đã dùng ở thiết bị khác.');
    // Lưu bên /devices và localStorage
    await db.ref('devices/'+deviceId).update({
      code: code,
      lastSeen: Date.now()
    });
    LS.setItem('deviceCode', code);
  }

  // ==== Heartbeat (để admin thấy thiết bị) ====
  async function heartbeat(){
    try{
      await ensureAuth();
      const state = LS.getItem('appState') || 'select';      // redirect-core đang set
      const table = LS.getItem('tableId')   || null;
      await db.ref('devices/'+deviceId).update({
        code:  LS.getItem('deviceCode') || null,
        stage: state,
        table: table,
        inPOS: state === 'pos',
        lastSeen: Date.now()
      });
    }catch(e){
      console.warn('[bind] heartbeat error:', e?.message||e);
    }
  }
  setInterval(heartbeat, 20000);
  document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) heartbeat(); });

  // ==== Boot ====
  (async function boot(){
    try{
      await ensureAuth();
    }catch(e){
      console.error('[bind] auth error', e);
      showGate('Không kết nối được Firebase.');
      return;
    }

    const code = LS.getItem('deviceCode');
    if (!code){
      showGate();
      return;
    }

    // Xác minh lại code đang có
    try{
      const snap = await db.ref('codes/'+code).once('value');
      const v = snap.val();
      if (!v) throw new Error('Mã không tồn tại.');
      if (v.enabled === false) throw new Error('Mã đã bị tắt.');
      if (v.boundDeviceId && v.boundDeviceId !== deviceId) throw new Error('Mã đang dùng ở thiết bị khác.');
      // OK: không hiện gate, chỉ ghi nhịp để admin thấy
      heartbeat();
    }catch(e){
      console.warn('[bind] code invalid at boot:', e?.message||e);
      LS.removeItem('deviceCode');
      showGate(e?.message || 'Vui lòng nhập mã.');
    }
  })();
})();
