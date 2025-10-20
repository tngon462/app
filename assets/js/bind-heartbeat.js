// bind-heartbeat.js
// Đồng bộ devices/<id> với code/table/stage/inPOS/lastSeen

(function () {
  window.TNGON = window.TNGON || {};
  const cfg = TNGON.bindCfg;
  const ls  = TNGON.ls;

  function deviceRef(deviceId) {
    return firebase.database().ref(cfg.paths.devices + '/' + deviceId);
  }

  function getState()   { return ls.get(cfg.lsKeys.appState) || 'select'; }
  function getTableId() { return ls.get(cfg.lsKeys.tableId) || ''; }

  async function beat() {
    const deviceId = TNGON.ensureDeviceId();
    const code     = ls.get(cfg.lsKeys.deviceCode) || null;
    const state    = getState();                  // 'select' | 'start' | 'pos'
    const tableId  = getTableId();
    const inPOS    = (state === 'pos');

    await deviceRef(deviceId).update({
      code: code,
      table: tableId || null,
      stage: state,
      inPOS,
      lastSeen: firebase.database.ServerValue.TIMESTAMP,
    });
  }

  let timer = null;
  function startHeartbeat() {
    if (timer) return;
    // nhịp đầu
    beat().catch(() => {});
    // định kỳ
    timer = setInterval(() => beat().catch(() => {}), cfg.heartbeatMs);
    // khi quay lại tab
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) beat().catch(() => {});
    });
  }

  function kickHeartbeat() { beat().catch(() => {}); }

  window.TNGON.startHeartbeat = startHeartbeat;
  window.TNGON.kickHeartbeat  = kickHeartbeat;
})();
