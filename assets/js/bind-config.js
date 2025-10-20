// bind-config.js
// Hằng số + key lưu trữ + path DB cho phía iPad

(function () {
  window.TNGON = window.TNGON || {};

  TNGON.bindCfg = {
    // localStorage keys
    lsKeys: {
      deviceId: 'deviceId',
      deviceCode: 'deviceCode',
      appState: 'appState',      // 'select' | 'start' | 'pos' (do redirect-core.js ghi)
      tableId: 'tableId',
      tableUrl: 'tableUrl',
      forceStartAfterReload: 'forceStartAfterReload',
      handledReloadAt: 'handledReloadAt',
      handledBroadcastAt: 'handledBroadcastAt',
      handledUnbindAt: 'handledUnbindAt',        // ✅ NEW: chặn unbindAt lặp
    },
    // db paths
    paths: {
      codes: 'codes',
      devices: 'devices',
      broadcast: 'broadcast/reloadAt',
    },
    // timings
    heartbeatMs: 20000,
  };
})();
