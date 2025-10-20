<script>
// assets/js/bind-heartbeat.js
(function(){
  'use strict';

  if (!window.firebase || !firebase.apps?.length) {
    console.error('[heartbeat] Firebase chưa sẵn sàng');
    return;
  }

  // Lấy ra các hằng số do bind-config.js đã set
  const DB = firebase.database();
  const DEVICE_ID = (function(){
    try {
      let id = localStorage.getItem('deviceId');
      if (!id) {
        id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c=>{
          const r = Math.random()*16|0, v=c==='x'?r:(r&0x3|0x8); return v.toString(16);
        });
        localStorage.setItem('deviceId', id);
      }
      return id;
    } catch(_) { return 'unknown-device'; }
  })();

  // Helper lấy state hiện tại từ redirect-core
  function getStage(){
    try { return localStorage.getItem('appState') || 'select'; } catch(_) { return 'select'; }
  }
  function getTable(){
    try {
      return {
        id:  localStorage.getItem('tableId')  || null,
        url: localStorage.getItem('tableUrl') || null,
      };
    } catch(_) { return { id:null, url:null }; }
  }
  function getCode(){
    try { return localStorage.getItem('deviceCode') || null; } catch(_) { return null; }
  }
  function getName(){
    // Cho phép đổi tên máy: admin sửa /devices/<id>/name là được; ở client chỉ set mặc định nếu chưa có
    const cached = localStorage.getItem('deviceName');
    if (cached) return cached;
    const def = 'iPad ' + DEVICE_ID.slice(0,4).toUpperCase();
    localStorage.setItem('deviceName', def);
    return def;
  }

  async function ensureNameOnce(){
    // Nếu /devices/<id>/name chưa có → set mặc định. Không overwrite nếu admin đã đặt.
    const nameRef = DB.ref('devices/'+DEVICE_ID+'/name');
    const snap = await nameRef.once('value');
    if (!snap.exists() || !snap.val()) {
      await nameRef.set(getName());
    }
  }

  async function sendHeartbeat(){
    const stage = getStage();                 // 'select' | 'start' | 'pos'
    const inPOS = (stage === 'pos');
    const tbl = getTable();
    const code = getCode();

    const payload = {
      code: code || null,
      table: tbl.id || null,
      stage,
      inPOS,
      lastSeen: firebase.database.ServerValue.TIMESTAMP,
      // name giữ nguyên; admin có thể sửa trực tiếp từ bảng thiết bị
    };

    // Viết node devices (tạo nếu chưa có)
    await DB.ref('devices/'+DEVICE_ID).update(payload);
  }

  // Ghi ngay khi nạp trang (kể cả chưa nhập mã) để admin thấy “Thiết bị” xuất hiện
  (async function boot(){
    try {
      await ensureNameOnce();
      await sendHeartbeat();
    } catch(e){
      console.warn('[heartbeat] first send failed:', e?.message||e);
    }
  })();

  // Lặp lại mỗi 20s
  setInterval(()=> { sendHeartbeat().catch(()=>{}); }, 20000);

  // Khi quay lại tab / đổi stage / đổi bàn → cập nhật ngay
  document.addEventListener('visibilitychange', ()=> {
    if (!document.hidden) sendHeartbeat().catch(()=>{});
  });
  window.addEventListener('storage', (e)=>{
    if (e.key === 'appState' || e.key === 'tableId' || e.key==='tableUrl' || e.key==='deviceCode') {
      sendHeartbeat().catch(()=>{});
    }
  });
})();
</script>
