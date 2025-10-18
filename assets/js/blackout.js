// assets/js/blackout.js
// Điều khiển màn đen + “làm mới” theo từng bàn qua Firebase
(function () {
  'use strict';

  // UI refs
  const overlayEl    = document.getElementById('screen-overlay');
  const posContainer = document.getElementById('pos-container');
  const posFrame     = document.getElementById('pos-frame');
  const startScreen  = document.getElementById('start-screen');
  const selectTable  = document.getElementById('select-table');

  // State
  let globalState = 'on';
  let localState  = 'on';
  let tableId     = null;
  let db          = null;

  const bound = { global: null, perTable: null, signal: null };

  // Helpers
  function setOverlayVisible(show) {
    if (!overlayEl) return;
    overlayEl.style.display = show ? 'block' : 'none';

    // Đồng bộ video NoSleep nếu bạn có expose
    try {
      if (show) {
        window.NoSleepVideo?.pause?.();
      } else {
        window.NoSleepVideo?.play?.();
      }
    } catch (_) {}
  }
  function updateOverlay() {
    setOverlayVisible(globalState === 'off' || localState === 'off');
  }
  function resetToStart() {
    posContainer?.classList.add('hidden');
    if (posFrame) posFrame.src = 'about:blank';
    startScreen?.classList.remove('hidden');
    selectTable?.classList.add('hidden');
    try { localStorage.setItem('appState', 'start'); } catch (_) {}
  }

  function detachAll() {
    if (!db) return;
    if (bound.global)    { db.ref('control/screen').off('value', bound.global); bound.global = null; }
    if (tableId && bound.perTable) { db.ref(`control/tables/${tableId}/screen`).off('value', bound.perTable); bound.perTable = null; }
    if (tableId && bound.signal)   { db.ref(`signals/${tableId}`).off('value', bound.signal); bound.signal = null; }
  }

  function attachAll() {
    if (!db) return;

    // Toàn quán
    bound.global = (snap) => {
      const v = (snap && snap.val()) || 'on';
      globalState = String(v).toLowerCase() === 'off' ? 'off' : 'on';
      updateOverlay();
    };
    db.ref('control/screen').on('value', bound.global);

    // Theo bàn
    if (tableId) {
      bound.perTable = (snap) => {
        const v = (snap && snap.val()) || 'on';
        localState = String(v).toLowerCase() === 'off' ? 'off' : 'on';
        updateOverlay();
      };
      db.ref(`control/tables/${tableId}/screen`).on('value', bound.perTable);

      // Tín hiệu làm mới
      bound.signal = (snap) => {
        if (!snap || !snap.exists()) return;
        const val = snap.val() || {};
        if (val.status === 'expired') {
          resetToStart();
          try {
            db.ref(`signals/${tableId}`).set({
              status: 'ok',
              ts: firebase.database.ServerValue.TIMESTAMP
            });
          } catch (_) {}
        }
      };
      db.ref(`signals/${tableId}`).on('value', bound.signal);
    }
  }

  function readTableId() {
    try { return window.tableId || localStorage.getItem('tableId') || null; }
    catch (_) { return null; }
  }

  function bindAll() {
    tableId = readTableId();
    detachAll();
    attachAll();
    updateOverlay();
  }

  // Thay đổi tableId (khi chọn bàn ở tab hiện tại)
  window.addEventListener('storage', (e) => {
    if (e && e.key === 'tableId') bindAll();
  });

  // CÁCH 1: chờ initFirebase nếu có
  (async () => {
    if (window.initFirebase) {
      try { db = await window.initFirebase; } catch (_) {}
    }
    // CÁCH 2: fallback nếu event chưa tới
    if (!db && window.firebase && firebase.database) {
      try { db = firebase.database(); } catch (_) {}
    }
    if (db) bindAll();
  })();

  // CÁCH 3: vẫn nghe sự kiện firebase-ready (nếu file khác có phát)
  window.addEventListener('firebase-ready', (ev) => {
    if (ev?.detail?.db) {
      db = ev.detail.db;
      bindAll();
    }
  });

  // Expose nhỏ để test
  window.__blackout = {
    refresh() { bindAll(); },
    forceOn()  { globalState = 'on'; localState = 'on'; updateOverlay(); },
    forceOff() { globalState = 'off'; localState = 'off'; updateOverlay(); },
  };
})();