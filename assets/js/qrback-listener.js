
// qrback-listener.js  — NHÚNG SAU KHI firebase.initializeApp(...) ĐÃ CHẠY
(function(){
  'use strict';
  const log = (...a)=> console.log('[qrback]', ...a);
  const warn= (...a)=> console.warn('[qrback]', ...a);

  // Yêu cầu: Firebase SDK + initializeApp đã sẵn sàng
  if (!window.firebase || !firebase.apps?.length) {
    warn('Firebase chưa init — hãy nhúng file này SAU đoạn initializeApp');
    return;
  }
  const db = firebase.database();

  // Lấy deviceId lưu sẵn (device-bind.js đã set)
  const deviceId =
    localStorage.getItem('deviceId') ||
    localStorage.getItem('tn_device_id') ||
    localStorage.getItem('tn_deviceId') || '';

  if (!deviceId) {
    warn('Không tìm thấy deviceId trong localStorage — QRback sẽ không biết bàn nào để kích hoạt');
    return;
  }
  log('ctx', { deviceId });

  // Lấy số bàn (table) của device
  let tableLabel = null;
  db.ref('devices/'+deviceId+'/table').on('value', s=>{
    tableLabel = s.val() || null;
    log('device table =', tableLabel);
  });

  // Ghi tín hiệu giống "Reload từng bàn" để ép V2 trở về màn đầu
  async function triggerGoHome(){
    try{
      if (!tableLabel) { warn('Chưa có bàn cho device — bỏ qua'); return; }
      const now = firebase.database.ServerValue.TIMESTAMP;
      const updates = {};
      // App V2 của bạn đã dùng cái này để reload -> ta tái sử dụng:
      updates['signals/'+tableLabel] = { status:'expired', ts: now };
      // Tuỳ chọn: gài thêm dấu mốc riêng cho device (nếu sau này V2 muốn nghe)
      updates['devices/'+deviceId+'/commands/goHomeAt'] = now;

      await db.ref().update(updates);
      log('đã kích hoạt QRback cho bàn', tableLabel);
    }catch(e){
      console.error('QRback trigger lỗi:', e);
    }
  }

  // Nghe 2 kênh
  // 1) Toàn quán
  db.ref('broadcast/qrbackAt').on('value', s=>{
    const v = s.val();
    if (!v) return;
    log('broadcast qrbackAt =', v);
    triggerGoHome();
  });

  // 2) Riêng bàn
  // Cho phép Python đặt control/tables/<ban>/qrbackAt = now
  function listenPerTable(){
    if (!tableLabel) return;
    db.ref(`control/tables/${tableLabel}/qrbackAt`).on('value', s=>{
      const v = s.val();
      if (!v) return;
      log(`per-table qrbackAt(${tableLabel}) =`, v);
      triggerGoHome();
    });
  }

  // Khi vừa lấy được table lần đầu -> bắt đầu nghe kênh riêng
  (function waitTableThenListen(){
    if (tableLabel) { listenPerTable(); return; }
    const iv = setInterval(()=>{
      if (tableLabel){ clearInterval(iv); listenPerTable(); }
    }, 300);
    setTimeout(()=> clearInterval(iv), 15000);
  })();

  log('QRback listener ready.');
})();

