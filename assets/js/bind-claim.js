// bind-claim.js
// Transaction ràng buộc 1-mã-1-máy + watcher mã

(function () {
  window.TNGON = window.TNGON || {};
  const cfg = TNGON.bindCfg;
  const ls = TNGON.ls;

  function codesRef(code) {
    return firebase.database().ref(cfg.paths.codes + '/' + code);
  }
  function deviceRef(deviceId) {
    return firebase.database().ref(cfg.paths.devices + '/' + deviceId);
  }

  async function claimCode(code) {
    const deviceId = TNGON.ensureDeviceId();
    const ref = codesRef(code);

    const result = await ref.transaction(cur => {
      if (!cur) return cur;                          // không tồn tại -> fail (no commit)
      if (cur.enabled === false) return;             // tắt -> fail
      if (cur.boundDeviceId && cur.boundDeviceId !== deviceId) return; // đã gắn máy khác -> fail
      return {
        ...cur,
        boundDeviceId: deviceId,
        boundAt: firebase.database.ServerValue.TIMESTAMP
      };
    });

    if (!result.committed) throw new Error('Mã không khả dụng hoặc đã được dùng ở thiết bị khác.');

    // cập nhật devices
    await deviceRef(deviceId).update({
      code: code,
      lastSeen: firebase.database.ServerValue.TIMESTAMP,
    });
    ls.set(cfg.lsKeys.deviceCode, code);
  }

  // Gác code: nếu mã bị xóa/tắt/đổi máy → đưa về gate
  let unwatch = null;
  function watchCode(code) {
    if (unwatch) { unwatch(); unwatch = null; }
    const ref = codesRef(code);
    const cb = ref.on('value', snap => {
      const v = snap.val();
      if (!v || v.enabled === false || (v.boundDeviceId && v.boundDeviceId !== TNGON.ensureDeviceId())) {
        // xóa local
        ls.del(cfg.lsKeys.deviceCode);
        ls.del(cfg.lsKeys.tableId); ls.del(cfg.lsKeys.tableUrl);
        ls.del(cfg.lsKeys.appState);
        // hiện gate
        TNGON.showCodeGate(v ? (v.enabled === false ? 'Mã đã bị tắt.' : 'Mã đang dùng ở thiết bị khác.') : 'Mã đã bị xóa.');
      }
    });
    unwatch = () => ref.off('value', cb);
  }

  window.TNGON.claimCode = claimCode;
  window.TNGON.watchCode = watchCode;
})();
