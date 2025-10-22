// /assets/js/qrback-listener.js
(function () {
  'use strict';
  const log  = (...a) => console.log('[qrback]', ...a);
  const warn = (...a) => console.warn('[qrback]', ...a);

  // ——— utils ———
  function lsGet(k, d=null){ try{ const v = localStorage.getItem(k); return (v==null?d:v); }catch{ return d; } }
  function lsSet(k, v){ try{ localStorage.setItem(k, v); }catch{} }

  function goToStart() {
    lsSet('appState', 'start');
    if (typeof window.gotoStart === 'function') {
      log('→ gotoStart()');
      window.gotoStart();
    } else {
      log('→ reload fallback');
      location.reload();
    }
  }

  function once(fn, ms=1000){
    let last = 0;
    return (...args)=>{
      const now = Date.now();
      if (now - last > ms){
        last = now;
        return fn(...args);
      }
    };
  }

  const safeGoStart = once(goToStart, 1000);

  function waitFirebaseReady() {
    return new Promise((resolve, reject) => {
      let n = 0;
      const iv = setInterval(() => {
        n++;
        if (window.firebase && firebase.apps?.length) {
          clearInterval(iv); resolve();
        }
        if (n > 200) { clearInterval(iv); reject(new Error('Firebase not ready')); }
      }, 50);
    });
  }

  // ——— main ———
  (async function boot(){
    try {
      await waitFirebaseReady();
      const db = firebase.database();

      // Lấy deviceId
      const deviceId =
        lsGet('deviceId') ||
        lsGet('tn_device_id') ||
        lsGet('tn_deviceId') || '';
      if (!deviceId){
        warn('Không thấy deviceId trong localStorage. Vẫn tiếp tục, nhưng sẽ chờ DB để lấy table.');
      }
      log('ctx', { deviceId });

      // Lấy table từ localStorage ngay (nếu có) để gắn listener sớm
      let table = (lsGet('tableId') || null);
      if (table) log('table from LS =', table);

      // Subscribe DB để luôn đúng bàn
      db.ref('devices/' + deviceId + '/table').on('value', (s) => {
        const newTable = s.val() || null;
        if (newTable !== table){
          log('device table =', newTable);
          table = newTable;
          attachListenersForTable(table);
        }
      });

      // Nếu chưa có table từ DB mà LS đã có => gắn trước (đến khi DB trả về sẽ tự attach lại)
      if (table) attachListenersForTable(table);

      log('QRback listener ready.');
    } catch (e) {
      console.error('[qrback] boot error:', e);
    }
  })();

  // ——— per-table listeners ———
  let detachFns = [];

  function detachAll(){
    try{ detachFns.forEach(fn=>fn&&fn()); }catch{}
    detachFns = [];
  }

  function attachListenersForTable(table){
    detachAll();
    if (!table){
      warn('Chưa có table => chưa gắn listener.');
      return;
    }
    const db = firebase.database();

    // 1) signals/<table> : {status:"expired", ts}
    const p1 = `signals/${table}`;
    const h1 = db.ref(p1).on('value', async (snap)=>{
      const v = snap.val();
      if (!v) return;
      // chỉ xử lý khi status = "expired"
      if (String(v.status||'').toLowerCase() === 'expired'){
        log('signals trigger', v);
        safeGoStart();
        // clear để lần sau còn kích hoạt
        try {
          await db.ref(p1).update({ consumedAt: firebase.database.ServerValue.TIMESTAMP, status: null });
        } catch(e){ console.warn('[qrback] clear signals failed', e); }
      }
    });
    detachFns.push(()=> db.ref(p1).off('value', h1));
    log('listen', p1);

    // 2) control/tables/<table>/qrbackAt : timestamp => khi tăng thì back
    const p2 = `control/tables/${table}/qrbackAt`;
    const h2 = db.ref(p2).on('value', (snap)=>{
      const ts = Number(snap.val() || 0);
      if (!ts) return;
      const key = `qrbackAt:${table}`;
      const last = Number(lsGet(key, 0));
      if (ts > last){
        lsSet(key, String(ts));
        log('table qrbackAt trigger', ts);
        safeGoStart();
      }
    });
    detachFns.push(()=> db.ref(p2).off('value', h2));
    log('listen', p2);

    // 3) broadcast/qrbackAt : timestamp => áp dụng cho tất cả
    const p3 = `broadcast/qrbackAt`;
    const h3 = db.ref(p3).on('value', (snap)=>{
      const ts = Number(snap.val() || 0);
      if (!ts) return;
      const key = `qrbackAt:broadcast`;
      const last = Number(lsGet(key, 0));
      if (ts > last){
        lsSet(key, String(ts));
        log('broadcast qrbackAt trigger', ts);
        safeGoStart();
      }
    });
    detachFns.push(()=> db.ref(p3).off('value', h3));
    log('listen', p3);
  }
})();
