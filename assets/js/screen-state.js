// screen-state.js
// Ghi trạng thái blackout thực tế lên Firebase để Admin luôn thấy đúng

(function () {
  'use strict';
  const log = (...a) => console.log('[tngon][screen]', ...a);

  if (!window.firebase) { console.warn('[tngon][screen] firebase not ready'); return; }

  const db = firebase.database();
  const LS = localStorage;
  const deviceId = LS.getItem('deviceId') || '';
  function getTableId(){ return LS.getItem('tableId') || null; }

  // helper
  function reportScreen(state, by) {
    try {
      const tbl = getTableId();
      const payload = {
        state, by: by || 'unknown',
        at: firebase.database.ServerValue.TIMESTAMP,
        table: tbl || null,
      };
      if (deviceId) {
        db.ref('devices/' + deviceId).update({
          screen: state,
          lastSeen: firebase.database.ServerValue.TIMESTAMP
        }).catch(()=>{});
        db.ref('status/devices/' + deviceId + '/screen').set(payload).catch(()=>{});
      }
      if (tbl) {
        db.ref('status/tables/' + String(tbl) + '/screen').set(payload).catch(()=>{});
      }
      // cache để heartbeat có thể gửi kèm
      try { window.__screenState = state; } catch {}
      log('reported =>', state, by || '');
    } catch (e) {
      console.warn('[tngon][screen] report error', e?.message || e);
    }
  }

  // expose cho các nơi khác gọi trực tiếp
  window.reportScreenState = reportScreen;

  // Nếu có blackout API thì hook vào
  function wireBlackout() {
    const bo = window.blackout;
    if (!bo) return;

    // giữ bản gốc
    if (!bo.__origOn) { bo.__origOn  = bo.on;  }
    if (!bo.__origOff){ bo.__origOff = bo.off; }

    bo.on  = function(by){ try { reportScreen('off', by||'schedule'); } catch {} return bo.__origOn.call(bo); };
    bo.off = function(by){ try { reportScreen('on',  by||'schedule'); } catch {} return bo.__origOff.call(bo); };

    // cũng phát event nếu ai cần nghe
    function emit(st, by){ window.dispatchEvent(new CustomEvent('tngon:blackout-change',{detail:{state:st, by:by||'unknown'}})); }
    const oldOn  = bo.on,  oldOff = bo.off;
    bo.on  = function(by){ const r = oldOn.call(bo, by);  emit('off', by||'schedule'); return r; };
    bo.off = function(by){ const r = oldOff.call(bo, by); emit('on',  by||'schedule'); return r; };

    log('hooked blackout.on/off');
  }

  // Hook sau khi DOM sẵn sàng (đảm bảo blackout.js đã load)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireBlackout, { once: true });
  } else {
    wireBlackout();
  }

  // Lúc đổi bàn thì mirror sang status/tables/* cũng đổi theo lần kế tiếp on/off
  window.addEventListener('tngon:tableChanged', (e)=>{
    const st = (typeof window.__screenState === 'string') ? window.__screenState : 'on';
    // phản ánh lại ngay vào status table mới
    reportScreen(st, 'table-change');
  });

})();
