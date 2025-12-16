// screen-state.js — SAFE, KHÔNG PHÁ REDIRECT / QRBACK
(function () {
  'use strict';
  const log = (...a) => console.log('[tngon][screen]', ...a);

  if (!window.firebase) return;

  const db = firebase.database();
  const LS = localStorage;
  const deviceId = LS.getItem('deviceId') || '';

  function getTableId(){ return LS.getItem('tableId') || null; }

  // CHỈ ghi trạng thái — KHÔNG suy đoán logic
  function reportScreen(state, by) {
    const tbl = getTableId();
    const payload = {
      state,
      by: by || 'core',
      at: firebase.database.ServerValue.TIMESTAMP,
      table: tbl
    };

    if (deviceId) {
      // device heartbeat + screen
      db.ref('devices/' + deviceId).update({
        screen: state,
        table: tbl,
        lastSeen: firebase.database.ServerValue.TIMESTAMP
      }).catch(()=>{});

      // admin read
      db.ref('status/devices/' + deviceId).set(payload).catch(()=>{});
    }

    if (tbl) {
      db.ref('status/tables/' + tbl).set(payload).catch(()=>{});
    }

    window.__screenState = state;
    log('reported =>', state, by || '');
  }

  // expose — CHỈ redirect-core / qrback được gọi
  window.reportScreenState = reportScreen;

})();
