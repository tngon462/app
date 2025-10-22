//qrback-listener.js
<script>
(function(){
  'use strict';
  const log  = (...a)=> console.log('[qrback]', ...a);
  const warn = (...a)=> console.warn('[qrback]', ...a);

  // ===== Guard: phải có firebase và đã init
  function getDB(){
    if (!window.firebase || !firebase.apps?.length){
      warn('Firebase chưa init -> bỏ qua QRBACK listener');
      return null;
    }
    return firebase.database();
  }

  // ===== Xác định deviceId & table hiện tại (nếu có)
  function guessDeviceId(){
    return localStorage.getItem('deviceId')
        || localStorage.getItem('DEVICE_ID')
        || localStorage.getItem('tn_device_id')
        || null;
  }
  function guessTable(){
    const fromLS = localStorage.getItem('table')
               || localStorage.getItem('TABLE')
               || localStorage.getItem('tn_table');
    const fromQS = new URLSearchParams(location.search).get('table')
               || new URLSearchParams(location.search).get('t');
    return (fromQS || fromLS || '').toString().replace('+','').trim() || null;
  }

  // ===== Hành động QR back
  let lastTs = 0; // chống bắn lặp
  function isFresh(ts){ return typeof ts==='number' && (Date.now() - ts < 15000) && ts > lastTs; }

  function doQrBack(){
    try {
      // 1) App SPA có router
      if (window.app?.router?.push) { app.router.push('/order'); return; }
      if (window.router?.push)      { router.push('/order');    return; }

      // 2) Hàm tiện ích nếu có
      if (window.showOrderScreen)   { window.showOrderScreen(); return; }
      if (window.gotoOrder)         { window.gotoOrder();       return; }
      if (window.goOrder)           { window.goOrder();         return; }

      // 3) Phát event để app tự bắt
      const evt = new CustomEvent('qrback', { detail: { at: Date.now() }});
      window.dispatchEvent(evt);

      // 4) Fallback: đổi hash hoặc chuyển trang
      if (location.hash !== '#order') {
        location.hash = '#order';
      } else {
        // nếu vẫn ở đúng màn nhưng app không nghe hashchange -> reload nhẹ
        location.reload();
      }
    } catch(e){
      warn('Lỗi thực thi QRBACK:', e);
    }
  }

  // ===== Subscribe nhiều nhánh để “tương thích ngược”
  function attachListeners(){
    const db = getDB(); if (!db) return;
    const deviceId = guessDeviceId();
    const table    = guessTable();
    log('Attach QRBACK listeners. deviceId=', deviceId, 'table=', table);

    // Helper: generic onValue cho nhánh có timestamp
    const listenTS = (refPath)=>{
      const ref = db.ref(refPath);
      ref.on('value', s=>{
        const v = s.val();
        if (!v) return;
        let ts = null;
        if (typeof v === 'number') ts = v;
        else if (typeof v === 'object' && v.at) ts = Number(v.at);

        if (isFresh(ts)){
          lastTs = ts;
          log('QRBACK nhận tại', refPath, ts);
          doQrBack();
        }
      }, e=> warn('Lỗi subscribe', refPath, e?.message||e));
    };

    // Các nhánh broadcast chung
    listenTS('control/qrbackAt');
    listenTS('control/qrback');

    // Theo device
    if (deviceId){
      listenTS(`devices/${deviceId}/commands/qrbackAt`);
    }

    // Theo bàn
    if (table){
      listenTS(`control/tables/${table}/qrbackAt`);
      listenTS(`signals/${table}/qrbackAt`);
    }

    // Ngoài ra: nếu Python set true/false thay vì timestamp (rất cũ)
    // ta vẫn hỗ trợ đơn giản -> bật là xử lý 1 lần rồi reset về false
    const legacyFlags = [];
    legacyFlags.push(db.ref('control/qrbackFlag'));
    if (deviceId) legacyFlags.push(db.ref(`devices/${deviceId}/commands/qrbackFlag`));
    if (table)    legacyFlags.push(db.ref(`control/tables/${table}/qrbackFlag`));
    legacyFlags.forEach(ref=>{
      ref.on('value', async s=>{
        const v = s.val();
        if (v === true){
          log('QRBACK legacy flag tại', ref.toString());
          doQrBack();
          try { await ref.set(false); } catch{}
        }
      });
    });
  }

  // Khởi chạy khi DOM sẵn sàng (Firebase init thường đã xảy ra trước đó)
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', attachListeners);
  } else {
    attachListeners();
  }
})();
</script>
