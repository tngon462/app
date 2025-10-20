// device-bind.js (bootstrap)
// Khởi chạy bind flow, không đụng UI core của app.

(function(){
  'use strict';
  window.TNGON = window.TNGON || {};
  const cfg = TNGON.bindCfg;
  const ls  = TNGON.ls;

  // Hàm này được bind-gate gọi sau khi claimCode thành công
  TNGON.afterBindEnter = function(){
    // nếu vừa reload bằng lệnh admin → quay lại Start Order
    if (ls.get(cfg.lsKeys.forceStartAfterReload) === '1'){
      ls.del(cfg.lsKeys.forceStartAfterReload);
      // nếu chưa có bàn → redirect-core sẽ tự trả về màn chọn bàn
      TNGON.gotoStart();
    }
    // bắt đầu heartbeat và lắng nghe lệnh
    TNGON.startHeartbeat();
    TNGON.listenAdminCommands();
  };

  document.addEventListener('DOMContentLoaded', async ()=>{
    if (!window.firebase || !firebase.apps?.length){
      console.error('[device-bind] Firebase chưa sẵn sàng. Hãy load firebase.js trước.');
      return;
    }

    const deviceId = TNGON.ensureDeviceId();
    console.log('[device-bind] deviceId =', deviceId, ' code =', ls.get(cfg.lsKeys.deviceCode) || '(none)');

    // load links để setTable lấy đúng URL
    await TNGON.loadLinks().catch(()=>{});

    const code = ls.get(cfg.lsKeys.deviceCode);
    if (!code){
      // chưa có mã → gate
      TNGON.showCodeGate();
    } else {
      // xác thực lại mã, bind nếu cần, rồi vào app
      try{
        const ref  = firebase.database().ref(cfg.paths.codes + '/' + code);
        const snap = await ref.once('value');
        const v    = snap.val();
        if (!v) throw new Error('Mã không tồn tại.');
        if (v.enabled === false) throw new Error('Mã đã bị tắt.');
        if (v.boundDeviceId && v.boundDeviceId !== deviceId) throw new Error('Mã đã gắn thiết bị khác.');

        if (!v.boundDeviceId){
          // (re)bind an toàn
          await ref.transaction(cur=>{
            if (!cur) return cur;
            if (cur.enabled === false) return;
            if (cur.boundDeviceId && cur.boundDeviceId !== deviceId) return;
            return { ...cur, boundDeviceId: deviceId, boundAt: firebase.database.ServerValue.TIMESTAMP };
          }, async (err, committed)=>{
            if (err) throw err;
            if (!committed) throw new Error('Mã không khả dụng.');
            await firebase.database().ref(cfg.paths.devices + '/' + deviceId).update({
              code: code,
              lastSeen: firebase.database.ServerValue.TIMESTAMP,
            });
          });
        }

        // start watcher + heartbeat + commands
        TNGON.watchCode(code);
        TNGON.afterBindEnter();
      }catch(e){
        console.warn('[device-bind] boot code invalid:', e?.message||e);
        ls.del(cfg.lsKeys.deviceCode);
        TNGON.showCodeGate(e?.message || 'Vui lòng nhập mã.');
      }
    }

    // Heartbeat định kỳ + khi đổi state/bàn
    setInterval(()=> TNGON.kickHeartbeat(), 20000);
    window.addEventListener('storage', (e)=>{
      if (e.key === cfg.lsKeys.appState || e.key === cfg.lsKeys.tableId){
        TNGON.kickHeartbeat();
      }
    });
  });
})();
