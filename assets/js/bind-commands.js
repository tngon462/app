// bind-commands.js
// Nhận lệnh admin: reload / setTable / unbind + broadcast reload

(function(){
  window.TNGON = window.TNGON || {};
  const cfg = TNGON.bindCfg;
  const ls  = TNGON.ls;

  function deviceCmdRef(deviceId){
    return firebase.database().ref(cfg.paths.devices + '/' + deviceId + '/commands');
  }

  function applySetTable(table){
    const map = TNGON.getLinksMap && TNGON.getLinksMap();
    let url = '';
    if (map && Object.prototype.hasOwnProperty.call(map, table)) url = map[table] || '';
    // cập nhật localStorage (để redirect-core.js dùng đúng url)
    if (table) ls.set(cfg.lsKeys.tableId, table); else ls.del(cfg.lsKeys.tableId);
    if (url)   ls.set(cfg.lsKeys.tableUrl, url);  else ls.del(cfg.lsKeys.tableUrl);
    // chuyển UI về Start (không reload)
    TNGON.gotoStart();
    // đẩy nhịp để admin thấy ngay
    TNGON.kickHeartbeat && TNGON.kickHeartbeat();
  }

  function listenAdminCommands(){
    const deviceId = TNGON.ensureDeviceId();
    const cmdRef   = deviceCmdRef(deviceId);

    // lệnh riêng cho thiết bị
    cmdRef.on('value', snap=>{
      const c = snap.val() || {};

      // reloadAt: chỉ xử lý nếu timestamp mới
      if (c.reloadAt){
        const last = Number(ls.get(cfg.lsKeys.handledReloadAt) || 0);
        const ts   = Number(c.reloadAt);
        if (ts > last){
          try {
            ls.set(cfg.lsKeys.handledReloadAt, String(ts));
            ls.set(cfg.lsKeys.forceStartAfterReload, '1');
          } catch(_){}
          location.reload();
          return;
        }
      }

      // setTable
      if (c.setTable && c.setTable.value){
        const t = String(c.setTable.value);
        applySetTable(t);
        // dọn lệnh
        cmdRef.child('setTable').remove().catch(()=>{});
      }

      // ✅ unbindAt (CHẶN LẶP THEO TIMESTAMP)
      if (c.unbindAt){
        const last = Number(ls.get(cfg.lsKeys.handledUnbindAt) || 0);
        const ts   = Number(c.unbindAt);
        if (ts > last){
          try {
            ls.set(cfg.lsKeys.handledUnbindAt, String(ts));
          } catch(_){}
          // xóa local → hiện gate
          ls.del(cfg.lsKeys.deviceCode);
          ls.del(cfg.lsKeys.tableId);
          ls.del(cfg.lsKeys.tableUrl);
          ls.del(cfg.lsKeys.appState);
          ls.del(cfg.lsKeys.forceStartAfterReload);
          TNGON.showCodeGate('Mã đã bị thu hồi. Vui lòng nhập mã khác.');
        }
      }
    });

    // broadcast reload
    const broadRef = firebase.database().ref(cfg.paths.broadcast);
    broadRef.on('value', s=>{
      const ts = Number(s.val() || 0);
      if (!ts) return;
      const last = Number(ls.get(cfg.lsKeys.handledBroadcastAt) || 0);
      if (ts > last){
        try {
          ls.set(cfg.lsKeys.handledBroadcastAt, String(ts));
          ls.set(cfg.lsKeys.forceStartAfterReload, '1');
        } catch(_){}
        location.reload();
      }
    });
  }

  window.TNGON.listenAdminCommands = listenAdminCommands;
})();
