<!-- Đảm bảo thứ tự trong redirect.html -->
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-database-compat.js"></script>
<script src="./assets/js/firebase.js"></script>
<script src="./assets/js/redirect-core.js"></script>

<!-- PATCHED device-bind.js -->
<script>
(function(){
  'use strict';
  const LS = localStorage, $ = (id)=>document.getElementById(id);
  function uuidv4(){return'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0,v=c==='x'?r:(r&0x3|0x8);return v.toString(16);});}
  let deviceId = LS.getItem('deviceId'); if(!deviceId){ deviceId=uuidv4(); LS.setItem('deviceId', deviceId); }
  console.log('[bind] boot deviceId=', deviceId);

  if(!window.firebase || !firebase.apps?.length){ console.error('[bind] Firebase chưa sẵn sàng'); return; }
  const db = firebase.database();

  async function ensureAuth(){
    if (firebase.auth().currentUser) return;
    await firebase.auth().signInAnonymously().catch(e=>{throw new Error('Auth lỗi: '+(e?.message||e))});
    await new Promise(r=>{ const un=firebase.auth().onAuthStateChanged(u=>{ if(u){un(); r();} }); });
  }

  function showGate(message){
    let wrap = $('code-gate');
    if (!wrap){
      wrap = document.createElement('div');
      wrap.id='code-gate';
      wrap.style.cssText='position:fixed;inset:0;background:#fff;z-index:6000;';
      wrap.innerHTML = `
        <div class="w-full h-full flex items-center justify-center p-6">
          <div class="w-full max-w-sm bg-white border border-gray-200 rounded-2xl shadow p-6">
            <h1 class="text-2xl font-extrabold text-gray-900 mb-4 text-center">Nhập mã iPad</h1>
            <p class="text-sm text-gray-500 mb-4 text-center">Nhập mã do admin cấp.</p>
            <input id="code-input" type="text" maxlength="20" class="w-full border rounded-lg px-4 py-3 text-center font-mono text-lg" placeholder="VD: 44 / TEST"/>
            <div id="code-error" class="text-red-600 text-sm mt-2 h-5 text-center"></div>
            <button id="code-submit" class="mt-4 w-full rounded-xl bg-blue-600 text-white font-bold py-3">XÁC NHẬN</button>
          </div>
        </div>`;
      document.body.appendChild(wrap);

      const btn = $('code-submit'), input=$('code-input'), err=$('code-error');
      function busy(b){ btn.disabled=b; btn.textContent=b?'Đang kiểm tra…':'XÁC NHẬN'; }

      async function onSubmit(){
        const code = (input.value||'').trim().toUpperCase();
        err.textContent=''; if(!code){ err.textContent='Vui lòng nhập mã.'; return; }
        console.log('[bind] submit code=', code);
        busy(true);
        try{
          await ensureAuth();
          const timeout = new Promise((_,rej)=> setTimeout(()=>rej(new Error('Kết nối chậm, thử lại.')), 8000));
          await Promise.race([ claimCode(code), timeout ]);
          console.log('[bind] bind OK, remove gate');
          wrap.remove();
          // khởi động heartbeat ngay để admin thấy
          heartbeat();
          // để UI cũ điều hướng (từ redirect-core)
          window.gotoStart ? window.gotoStart() : null;
        }catch(e){
          console.warn('[bind] submit error:', e);
          err.textContent = e?.message || 'Không dùng được mã này.';
        }finally{ busy(false); }
      }
      btn.addEventListener('click', onSubmit);
      input.addEventListener('keydown', e=>{ if(e.key==='Enter') onSubmit(); });
      setTimeout(()=> input.focus(), 60);
      if (message) err.textContent = message;
    }else if(message){
      const err=$('code-error'); if(err) err.textContent=message;
    }
  }

  async function claimCode(code){
    console.log('[bind] claimCode start', {code, deviceId});
    const ref = db.ref('codes/'+code);
    const res = await ref.transaction(cur=>{
      if (!cur) return cur;
      if (cur.enabled === false) return;
      if (cur.boundDeviceId && cur.boundDeviceId !== deviceId) return;
      return { ...cur, boundDeviceId: deviceId, boundAt: firebase.database.ServerValue.TIMESTAMP };
    });
    console.log('[bind] tx result=', res);
    if (!res.committed) throw new Error('Mã không khả dụng hoặc đã dùng ở thiết bị khác.');
    await db.ref('devices/'+deviceId).update({ code, lastSeen: Date.now() });
    localStorage.setItem('deviceCode', code);
  }

  async function heartbeat(){
    try{
      await ensureAuth();
      const state = localStorage.getItem('appState') || 'select';
      const tableId = localStorage.getItem('tableId') || null;
      await db.ref('devices/'+deviceId).update({
        code: localStorage.getItem('deviceCode') || null,
        stage: state,
        table: tableId,
        inPOS: state==='pos',
        lastSeen: Date.now()
      });
    }catch(e){ console.warn('[bind] heartbeat err', e?.message||e); }
  }
  setInterval(heartbeat, 20000);
  document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) heartbeat(); });

  // Boot
  (async function boot(){
    try{ await ensureAuth(); }catch(e){ console.error(e); showGate('Không kết nối được Firebase.'); return; }
    const code = localStorage.getItem('deviceCode');
    if (!code){ showGate(); return; }

    // xác minh code
    const snap = await db.ref('codes/'+code).once('value'); const v=snap.val();
    if (!v || v.enabled===false || (v.boundDeviceId && v.boundDeviceId !== deviceId)){
      localStorage.removeItem('deviceCode');
      showGate('Mã không hợp lệ hoặc dùng ở thiết bị khác.');
      return;
    }
    // ok – không hiển gate, bắt đầu heartbeat để admin thấy
    heartbeat();
  })();
})();
</script>
