// screen-state.js — report stage + blackout cho Admin (SAFE)
(function () {
  'use strict';
  const log = (...a) => console.log('[tngon][screen]', ...a);
  const warn = (...a) => console.warn('[tngon][screen]', ...a);

  if (!window.firebase) { warn('firebase not ready'); return; }

  const db = firebase.database();
  const LS = localStorage;
  const deviceId = LS.getItem('deviceId') || '';
  const getTableId = () => LS.getItem('tableId') || null;

  // state cache
  let curStage = (window.__stageState || 'select');   // select|start|pos
  let curBlack = (window.__blackState || 'on');       // on|off

  function writeStatus(by){
    const tbl = getTableId();
    const payload = {
      table: tbl,
      stage: curStage,
      blackout: curBlack,
      by: by || 'unknown',
      at: firebase.database.ServerValue.TIMESTAMP
    };

    // 1) devices/<id> (heartbeat + admin hay dùng)
    if (deviceId) {
      db.ref('devices/' + deviceId).update({
        table: tbl,
        stage: curStage,
        blackout: curBlack,
        lastSeen: firebase.database.ServerValue.TIMESTAMP
      }).catch(()=>{});
    }

    // 2) status/devices/<id> (dashboard status)
    if (deviceId) {
      db.ref('status/devices/' + deviceId).set(payload).catch(()=>{});
    }

    // 3) status/tables/<table> (dashboard theo bàn)
    if (tbl) {
      db.ref('status/tables/' + String(tbl)).set(payload).catch(()=>{});
    }

    log('reported =>', payload);
  }

  // EXPOSE: redirect-core gọi để set STAGE
  window.reportStage = function(stage, by){
    const st = String(stage || '').toLowerCase();
    if (!st) return;
    if (st === curStage) return;
    curStage = st;
    window.__stageState = curStage;
    writeStatus(by || 'core');
  };

  // EXPOSE: blackout gọi để set BLACKOUT
  window.reportBlackout = function(state, by){
    const st = String(state || '').toLowerCase();
    if (!st) return;
    if (st === curBlack) return;
    curBlack = st;
    window.__blackState = curBlack;
    writeStatus(by || 'blackout');
  };

  // Hook blackout.on/off (SAFE: chỉ hook 1 lần)
  function wireBlackoutOnce(){
    const bo = window.blackout;
    if (!bo || bo.__tngonHooked) return;
    bo.__tngonHooked = true;

    const origOn  = bo.on  ? bo.on.bind(bo)  : null;
    const origOff = bo.off ? bo.off.bind(bo) : null;

    if (origOn){
      bo.on = function(by){
        try { window.reportBlackout('off', by||'schedule'); } catch {}
        return origOn(by);
      };
    }
    if (origOff){
      bo.off = function(by){
        try { window.reportBlackout('on', by||'schedule'); } catch {}
        return origOff(by);
      };
    }

    log('hooked blackout.on/off (safe)');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireBlackoutOnce, { once: true });
  } else {
    wireBlackoutOnce();
  }

  // Khi đổi bàn: ghi lại trạng thái hiện tại sang “table mới”
  window.addEventListener('tngon:tableChanged', ()=>{
    writeStatus('table-change');
  });

  // Boot: ghi 1 phát cho admin thấy device online
  setTimeout(()=> writeStatus('boot'), 300);

})();
