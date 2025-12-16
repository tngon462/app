// screen-state.js — FINAL SAFE (stage + blackout sync cho admin)
(function () {
  'use strict';
  const log = (...a) => console.log('[tngon][screen]', ...a);

  if (!window.firebase) return;

  const db = firebase.database();
  const LS = localStorage;
  const deviceId = LS.getItem('deviceId') || '';
  const getTableId = () => LS.getItem('tableId') || null;

  let curStage = LS.getItem('appState') || 'select'; // select|start|pos
  let curBlack = 'on'; // on|off

  function writeStatus(by){
    const tbl = getTableId();
    curStage = LS.getItem('appState') || curStage;

    const payload = {
      table: tbl,
      stage: curStage,
      blackout: curBlack,
      by: by || 'unknown',
      at: firebase.database.ServerValue.TIMESTAMP
    };

    if (deviceId) {
      db.ref('devices/' + deviceId).update({
        table: tbl,
        stage: curStage,
        blackout: curBlack,
        lastSeen: firebase.database.ServerValue.TIMESTAMP
      }).catch(()=>{});

      db.ref('status/devices/' + deviceId).set(payload).catch(()=>{});
    }

    if (tbl) {
      db.ref('status/tables/' + tbl).set(payload).catch(()=>{});
    }

    log('reported =>', payload);
  }

  // redirect-core gọi
  window.reportStage = function(stage, by){
    const st = String(stage || '').toLowerCase();
    if (!st || st === curStage) return;
    curStage = st;
    LS.setItem('appState', curStage);
    writeStatus(by || 'core');
  };

  // blackout gọi
  window.reportBlackout = function(state, by){
    const st = String(state || '').toLowerCase();
    if (!st || st === curBlack) return;
    curBlack = st;
    writeStatus(by || 'blackout');
  };

  // hook blackout 1 lần
  function hookBlackout(){
    const bo = window.blackout;
    if (!bo || bo.__tngonHooked) return;
    bo.__tngonHooked = true;

    const on = bo.on?.bind(bo);
    const off = bo.off?.bind(bo);

    if (on) bo.on = (by)=>{ reportBlackout('off',by); return on(by); };
    if (off) bo.off = (by)=>{ reportBlackout('on',by); return off(by); };
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', hookBlackout, { once:true });
  else hookBlackout();

  window.addEventListener('tngon:tableChanged', ()=> writeStatus('table-change'));
  setTimeout(()=> writeStatus('boot'), 300);
})();
