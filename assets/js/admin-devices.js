<!-- /assets/js/device-bind.js -->
<script>
(function(){
  // ===== Helpers =====
  const LS = window.localStorage;
  const $  = (id)=> document.getElementById(id);
  function uuidv4(){return'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0,v=c==='x'?r:(r&0x3|0x8);return v.toString(16);});}
  let deviceId = LS.getItem('deviceId') || (LS.setItem('deviceId', uuidv4()), LS.getItem('deviceId'));

  // ===== Ensure Firebase =====
  if (!firebase.apps.length) firebase.initializeApp(window.firebaseConfig||firebaseConfig);
  firebase.auth().signInAnonymously().catch(console.error);
  const db = firebase.database();

  // ===== Shield lúc khởi động =====
  function ensureBootShield(){
    if ($('boot-shield')) return;
    const el=document.createElement('div');
    el.id='boot-shield';
    el.style.cssText='position:fixed;inset:0;background:#fff;z-index:5000;display:flex;align-items:center;justify-content:center;padding:16px';
    el.innerHTML='<div class="w-full max-w-sm text-center"><h1 class="text-2xl font-extrabold text-gray-900 mb-3">Đang kiểm tra thiết bị…</h1><p class="text-sm text-gray-500">Vui lòng đợi trong giây lát.</p><div class="mt-4 animate-pulse text-gray-400">● ● ●</div></div>';
    document.body.appendChild(el);
  }
  function removeBootShield(){ const el=$('boot-shield'); if(el) el.remove(); }

  // ===== Code Gate UI =====
  function showCodeGate(message){
    // Ẩn toàn bộ app
    ['select-table','start-screen','pos-container'].forEach(id=>{ const el=$(id); if(el) el.classList.add('hidden'); });
    let gate=$('code-gate');
    if(!gate){
      gate=document.createElement('div');
      gate.id='code-gate';
      gate.style.cssText='position:fixed;inset:0;background:#fff;z-index:6000;';
      gate.innerHTML=`
        <div class="w-full h-full flex items-center justify-center p-6">
          <div class="w-full max-w-sm bg-white border border-gray-200 rounded-2xl shadow p-6">
            <h1 class="text-2xl font-extrabold text-gray-900 mb-4 text-center">Nhập mã iPad</h1>
            <p class="text-sm text-gray-500 mb-4 text-center">Nhập mã được cấp để tiếp tục.</p>
            <input id="code-input" type="text" maxlength="20" placeholder="VD: A1B2C3"
              class="w-full border rounded-lg px-4 py-3 text-center tracking-widest font-mono text-lg"
              inputmode="latin" autocomplete="one-time-code" />
            <div id="code-error" class="text-red-600 text-sm mt-2 h-5"></div>
            <button id="code-submit" class="mt-4 w-full rounded-xl bg-blue-600 text-white font-bold py-3 hover:bg-blue-700 transition">XÁC NHẬN</button>
          </div>
        </div>`;
      document.body.appendChild(gate);
      const input=$('code-input'), btn=$('code-submit'), err=$('code-error');
      function setBusy(b){ btn.disabled=b; btn.textContent=b?'Đang kiểm tra…':'XÁC NHẬN'; }
      async function submit(){
        const raw=(input.value||'').trim().toUpperCase();
        err.textContent=''; if(!raw){ err.textContent='Vui lòng nhập mã.'; return; }
        setBusy(true);
        try{
          await bindCodeToDevice(raw);
          gate.remove();
          enterApp(); // vào app (select screen), để admin setTable nếu muốn
        }catch(e){ err.textContent=(e&&e.message)?e.message:'Mã không khả dụng hoặc đã dùng ở thiết bị khác.'; }
        finally{ setBusy(false); }
      }
      btn.addEventListener('click', submit);
      input.addEventListener('keydown', e=>{ if(e.key==='Enter') submit(); });
      setTimeout(()=> input.focus(), 60);
    }
    if (message){ const err=$('code-error'); if(err) err.textContent=message; }
  }

  // ===== Transaction ràng buộc 1-mã-1-máy =====
  async function bindCodeToDevice(code){
    const codeRef=db.ref('codes/'+code);
    await codeRef.transaction(data=>{
      if(!data) return null;                // mã không tồn tại
      if(data.enabled===false) return;      // huỷ commit
      if(!data.boundDeviceId || data.boundDeviceId===deviceId){
        return {...data, boundDeviceId:deviceId, boundAt: firebase.database.ServerValue.TIMESTAMP};
      }
      return; // huỷ commit nếu đã gắn máy khác
    }, async (error, committed)=>{
      if(error) throw error;
      if(!committed) throw new Error('Mã không khả dụng hoặc đã dùng ở thiết bị khác.');
    });
    await db.ref('devices/'+deviceId).update({
      code: code,
      lastSeen: firebase.database.ServerValue.TIMESTAMP,
      info: { ua: navigator.userAgent }
    });
    LS.setItem('deviceCode', code);
  }

  // Heartbeat
  setInterval(()=> db.ref('devices/'+deviceId).update({ lastSeen: firebase.database.ServerValue.TIMESTAMP }), 30000);

  // ===== Nhận lệnh admin =====
  function listenCommands(){
    const cmdRef=db.ref('devices/'+deviceId+'/commands');

    cmdRef.on('value', s=>{
      const c=s.val()||{};

      // 1) setTable từ admin -> không reload
      if (c.setTable && c.setTable.value){
        const t=String(c.setTable.value);
        if (window.setTableByIdForAdmin){
          window.setTableByIdForAdmin(t).then(ok=>{
            if(ok){
              db.ref('devices/'+deviceId).update({ table:{ value:t, stage:'start' }, lastKnownTable:t });
              cmdRef.child('setTable').remove();
            }
          });
        } else {
          // fallback: chỉ lưu số bàn, Start (URL sẽ set khi user bấm Start)
          try{
            localStorage.setItem('tableId', t);
            db.ref('devices/'+deviceId).update({ table:{ value:t, stage:'start' }, lastKnownTable:t });
          }finally{ }
          cmdRef.child('setTable').remove();
        }
      }

      // 2) reloadAt -> về START of current table
      if (c.reloadAt){
        try{ localStorage.setItem('appState','start'); }catch(_){ }
        location.reload();
        return;
      }

      // 3) unbindAt -> xoá code local + table + reload Gate
      if (c.unbindAt){
        try{
          const code=LS.getItem('deviceCode');
          if(code) LS.removeItem('deviceCode');
          LS.removeItem('tableId'); LS.removeItem('tableUrl'); LS.removeItem('appState');
        }finally{ location.reload(); }
        return;
      }
    });

    // Broadcast reload
    db.ref('broadcast/reloadAt').on('value', s=>{ if(s.val()){ try{ localStorage.setItem('appState','start'); }catch(_){ } location.reload(); } });
  }

  // ===== Report từ core -> Firebase (để admin nhìn “- / +8”) =====
  window.__reportStage = function(stage){
    const tId = localStorage.getItem('tableId') || '';
    const inPOS = stage==='pos';
    const payload = tId ? { value:tId, stage, inPOS } : { value:'', stage, inPOS };
    const updates = { table: payload };
    if (tId) updates.lastKnownTable = tId;
    db.ref('devices/'+deviceId).update(updates).catch(()=>{});
  };
  window.__reportTableChosen = function(id,url){
    const payload = { value:String(id), stage:'start', inPOS:false };
    db.ref('devices/'+deviceId).update({ table: payload, lastKnownTable:String(id) }).catch(()=>{});
  };

  // ===== Enter app =====
  function enterApp(){
    removeBootShield();
    if (window.gotoSelect && window.gotoStart){
      // vào flow bình thường: show Select (nếu chưa có bàn) hoặc giữ bàn cũ
      const id = localStorage.getItem('tableId');
      if (id) window.gotoStart(); else window.gotoSelect(false);
    }
    listenCommands();
  }

  // ===== Boot =====
  document.addEventListener('DOMContentLoaded', async ()=>{
    ensureBootShield();

    const code=LS.getItem('deviceCode');
    if(!code){ showCodeGate(); return; }

    try{
      const snap = await db.ref('codes/'+code).once('value');
      const data = snap.val();
      if(!data) throw new Error('Mã không tồn tại.');
      if(data.enabled===false) throw new Error('Mã đã bị tắt.');
      if(data.boundDeviceId && data.boundDeviceId!==deviceId){
        LS.removeItem('deviceCode'); throw new Error('Mã đã gắn với thiết bị khác.');
      }
      enterApp();
    }catch(e){ showCodeGate(e?.message||null); }
  });
})();
</script>
