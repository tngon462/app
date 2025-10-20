// assets/js/blackout.js
// Điều khiển “màn đen” theo GLOBAL + THEO BÀN (tableId hiện tại của iPad)
// Ưu tiên: control/screen == 'off'  || control/tables/{tableId}/screen == 'off'  => phủ đen

(function(){
  'use strict';

  const LS = localStorage;

  // ===== Overlay đen =====
  let overlay = null;
  function ensureOverlay(){
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'tn-blackout';
    overlay.style.cssText = `
      position:fixed; inset:0; z-index:9999;
      background:#000; opacity:1; display:none; touch-action:none;`;
    document.body.appendChild(overlay);
    return overlay;
  }
  function showBlack(){ ensureOverlay().style.display = 'block'; }
  function hideBlack(){ ensureOverlay().style.display = 'none'; }

  // ===== Firebase guard =====
  function getDb(){
    if (!window.firebase || !firebase.apps?.length) return null;
    return firebase.database();
  }
  let db = null;

  // ===== Trạng thái hiện tại =====
  let globalState = 'on';     // 'on' | 'off'
  let tableState  = null;     // 'on' | 'off' | null (null = chưa đặt riêng)
  let currentTableId = null;

  function apply(){
    const off = (String(globalState||'on') === 'off') || (String(tableState||'on') === 'off');
    if (off) showBlack(); else hideBlack();
  }

  // ===== Subscribe GLOBAL =====
  let unSubGlobal = null;
  function subGlobal(){
    if (!db) return;
    if (unSubGlobal) { try{ unSubGlobal(); }catch(_){}
      unSubGlobal = null;
    }
    const ref = db.ref('control/screen');
    const cb = ref.on('value', s=>{
      globalState = s.exists() ? String(s.val()||'on') : 'on';
      apply();
    });
    unSubGlobal = ()=> ref.off('value', cb);
  }

  // ===== Subscribe THEO BÀN =====
  let unSubTable = null;
  function readTableId(){
    // redirect-core.js / device-bind đã lưu tableId vào localStorage
    const t = LS.getItem('tableId');
    return t && String(t).trim() ? String(t).trim() : null;
  }
  function subTable(tableId){
    if (unSubTable){ try{ unSubTable(); }catch(_){}
      unSubTable = null;
    }
    tableState = null; // reset
    if (!db || !tableId){ apply(); return; }

    const ref = db.ref('control/tables/'+tableId+'/screen');
    const cb = ref.on('value', s=>{
      tableState = s.exists() ? String(s.val()||'on') : null;
      apply();
    });
    unSubTable = ()=> ref.off('value', cb);
  }

  // ===== Theo dõi đổi bàn =====
  function resubIfTableChanged(){
    const t = readTableId();
    if (t !== currentTableId){
      currentTableId = t;
      subTable(currentTableId);
    }
  }

  // Nghe thay đổi localStorage từ cùng tab/app
  window.addEventListener('storage', (e)=>{
    if (e.key === 'tableId' || e.key === 'appState'){
      resubIfTableChanged();
    }
  });

  // Một số code phía client có phát sự kiện tuỳ chỉnh khi admin “Đổi số bàn”
  // (bind-commands.js có thể dispatch 'tngon:tableChanged'), nghe luôn cho chắc:
  window.addEventListener('tngon:tableChanged', ()=>{
    resubIfTableChanged();
  });

  // ===== Boot =====
  document.addEventListener('DOMContentLoaded', ()=>{
    db = getDb();
    if (!db){ console.warn('[blackout] Firebase chưa sẵn sàng'); return; }

    // Global
    subGlobal();

    // Theo bàn hiện tại (nếu chưa chọn bàn -> chỉ theo global)
    currentTableId = readTableId();
    subTable(currentTableId);

    apply();
  });
})();
