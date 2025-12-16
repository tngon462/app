// screen-state.js — SAFE FINAL (stage + blackout sync cho admin, KHÔNG phá app)
(function () {
  'use strict';
  try {
    const log = (...a) => console.log('[tngon][screen]', ...a);

    if (!window.firebase || !firebase.database) return;

    const db = firebase.database();
    const LS = localStorage;
    const deviceId = LS.getItem('deviceId') || '';
    const getTableId = () => LS.getItem('tableId') || null;

    let curStage = LS.getItem('appState') || 'select'; // select|start|pos
    let curBlack = (window.__blackState === 'off') ? 'off' : 'on'; // on|off

    function safeSet(k, v){ try{ LS.setItem(k, v); }catch(_){} }

    function writeStatus(by){
      const tbl = getTableId();
      try { curStage = LS.getItem('appState') || curStage; } catch(_) {}

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
        db.ref('status/tables/' + String(tbl)).set(payload).catch(()=>{});
      }

      log('reported =>', payload);
    }

    // redirect-core gọi (stage)
    window.reportStage = function(stage, by){
      const st = String(stage || '').toLowerCase();
      if (!st) return;
      if (st === curStage) return;
      curStage = st;
      safeSet('appState', curStage);
      writeStatus(by || 'core');
    };

    // blackout gọi (blackout)
    window.reportBlackout = function(state, by){
      const st = String(state || '').toLowerCase();
      if (st !== 'on' && st !== 'off') return;
      if (st === curBlack) return;
      curBlack = st;
      window.__blackState = curBlack;
      writeStatus(by || 'blackout');
    };

    // hook blackout 1 lần (KHÔNG dùng optional chaining để khỏi lỗi máy lạ)
    function hookBlackoutOnce(){
      const bo = window.blackout;
      if (!bo || bo.__tngonHooked) return;
      bo.__tngonHooked = true;

      const origOn  = (typeof bo.on  === 'function') ? bo.on.bind(bo)  : null;
      const origOff = (typeof bo.off === 'function') ? bo.off.bind(bo) : null;

      if (origOn){
        bo.on = function(by){
          try { window.reportBlackout('off', by || 'schedule'); } catch(_){}
          return origOn(by);
        };
      }
      if (origOff){
        bo.off = function(by){
          try { window.reportBlackout('on', by || 'schedule'); } catch(_){}
          return origOff(by);
        };
      }

      log('hooked blackout.on/off');
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', hookBlackoutOnce, { once:true });
    } else {
      hookBlackoutOnce();
    }

    // đổi bàn → mirror status ngay để admin thấy đúng
    window.addEventListener('tngon:tableChanged', function(){
      writeStatus('table-change');
    });

    // boot ping
    setTimeout(function(){ writeStatus('boot'); }, 300);

  } catch (e) {
    console.warn('[tngon][screen] SAFE CATCH', e && (e.message || e));
  }
})();
