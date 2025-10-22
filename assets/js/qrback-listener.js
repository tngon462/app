// qrback-listener-v2.js
(function(){
  'use strict';

  const log  = (...a)=> console.log('[qrback]', ...a);
  const warn = (...a)=> console.warn('[qrback]', ...a);

  // ==== Helpers ====
  function now(){ return Date.now(); }
  function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }
  function getQS(name){ return new URLSearchParams(location.search).get(name); }

  // Tìm deviceId & table theo cách TNgon hay dùng
  function getDeviceId(){
    // thử theo các key thường thấy
    return (
      localStorage.getItem('deviceId') ||
      localStorage.getItem('tngon_deviceId') ||
      localStorage.getItem('installId') ||
      sessionStorage.getItem('deviceId') ||
      'web_' + Math.random().toString(36).slice(2,10)
    );
  }
  function getTable(){
    return (
      localStorage.getItem('table') ||
      localStorage.getItem('tngon_table') ||
      sessionStorage.getItem('table') ||
      getQS('table') || ''   // có thể không có khi chưa set
    );
  }

  // Chờ firebase + auth ẩn danh sẵn sàng
  async function ensureDB(){
    // Chờ SDK nạp xong
    for (let i=0; i<200; i++){
      if (window.firebase && firebase.apps && firebase.apps.length) break;
      await sleep(50);
    }
    if (!window.firebase || !firebase.apps?.length){
      throw new Error('Firebase chưa init (thiếu firebase.initializeApp hoặc thứ tự script sai)');
    }
    // Đăng nhập ẩn danh (nếu chưa)
    if (!firebase.auth().currentUser){
      try{
        await firebase.auth().signInAnonymously();
      }catch(e){
        // Nếu đã bật anonymous trong project thì sẽ ok; nếu chưa bật thì vẫn chạy listener broadcast được (đọc public)
        warn('signInAnonymously lỗi:', e?.message||e);
      }
      await new Promise(res=>{
        const un = firebase.auth().onAuthStateChanged(u=>{ if(u){ un(); res(); }});
      });
    }
    return firebase.database();
  }

  // Điều hướng về màn order — bạn có thể tuỳ biến URL fallback
  function goBackToOrder(){
    // 1) Nếu app core có bắt event thì gửi cả 2 kiểu
    try{ window.postMessage({ type:'qrback' }, '*'); }catch(_){}
    try{ document.dispatchEvent(new CustomEvent('qrback')); }catch(_){}

    // 2) Cho các core v2: set flag định tuyến (nếu dùng router hash)
    try{ localStorage.setItem('tngon_nav', 'order'); }catch(_){}

    // 3) Thử URL do app lưu sẵn
    const saved =
      localStorage.getItem('orderUrl') ||
      sessionStorage.getItem('orderUrl');

    // 4) Fallback thẳng về trang chính có #order (đổi theo app của bạn)
    const dest = saved || './index.html#order';
    location.href = dest;
  }

  // Xác định “mình có phải đối tượng cần back không”
  function matchTarget(payload, ctx){
    // payload có thể là boolean / timestamp / object
    if (payload == null) return false;

    // object chuẩn mình đề xuất:
    // { at: 1712345678901, target: "all" | "device:<id>" | "table:<n>" }
    if (typeof payload === 'object'){
      const t = String(payload.target||'all').toLowerCase();
      if (t === 'all') return true;
      if (t.startsWith('device:')) {
        const id = t.slice(7).trim();
        return id && id === ctx.deviceId;
      }
      if (t.startsWith('table:')) {
        const tb = t.slice(6).trim();
        return tb && tb === ctx.table;
      }
      // nếu không có target, coi như broadcast
      return true;
    }

    // Nếu chỉ là true/timestamp -> coi như broadcast
    return true;
  }

  (async function main(){
    try{
      const db = await ensureDB();
      const deviceId = getDeviceId();
      const table    = getTable();
      const ctx = { deviceId, table };
      log('ctx', ctx);

      // Ghi dấu lần xử lý để tránh bắn nhiều lần
      let lastTs = 0;
      const seenKeys = new Set();

      function handleOnce(key, tsLike){
        const ts = Number(tsLike || now());
        if (seenKeys.has(key)) return;
        if (ts <= lastTs) {
          // đôi khi event value lại lặp cùng timestamp -> bỏ
        }
        lastTs = Math.max(lastTs, ts);
        seenKeys.add(key);
        log('→ QRBACK fired by', key, 'ts=', ts);
        // Acknowledge (không bắt buộc)
        try{
          db.ref(`devices/${deviceId}/signals/backAckAt`).set(firebase.database.ServerValue.TIMESTAMP);
        }catch(_){}
        goBackToOrder();
      }

      // ====== ĐĂNG KÝ CÁC KÊNH NGHE ======
      // 1) Broadcast kiểu timestamp: broadcast/qrbackAt = TIMESTAMP
      db.ref('broadcast/qrbackAt').on('value', s=>{
        if (!s.exists()) return;
        const v = s.val();
        handleOnce('broadcast/qrbackAt', v);
      });

      // 2) Broadcast kiểu object: broadcast/qrback = { at, target }
      db.ref('broadcast/qrback').on('value', s=>{
        if (!s.exists()) return;
        const v = s.val();
        if (!matchTarget(v, ctx)) return;
        handleOnce('broadcast/qrback', v.at || now());
      });

      // 3) Lệnh theo thiết bị: devices/<id>/commands/backAt = TIMESTAMP
      if (deviceId){
        db.ref(`devices/${deviceId}/commands/backAt`).on('value', s=>{
          if (!s.exists()) return;
          const v = s.val();
          handleOnce(`devices/${deviceId}/commands/backAt`, v);
        });
      }

      // 4) Theo số bàn (hai biến thể thường gặp)
      if (table){
        // a) signals/<table>/qrbackAt = TIMESTAMP
        db.ref(`signals/${table}/qrbackAt`).on('value', s=>{
          if (!s.exists()) return;
          const v = s.val();
          handleOnce(`signals/${table}/qrbackAt`, v);
        });
        // b) signals/<table>/qrback = true/false hoặc {at:...}
        db.ref(`signals/${table}/qrback`).on('value', s=>{
          if (!s.exists()) return;
          const v = s.val();
          const ts = (typeof v === 'object' && v && v.at) ? v.at : now();
          handleOnce(`signals/${table}/qrback`, ts);
        });
      }

      log('QRback listener ready.');
    }catch(e){
      warn('QRback init error:', e?.message||e);
    }
  })();
})();
