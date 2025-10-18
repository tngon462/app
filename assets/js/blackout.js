// assets/js/blackout.js
// ===== Điều khiển "màn đen" & làm mới từ Firebase =====
//  - control/screen            : "on" | "off"  (toàn quán)
//  - control/tables/<id>/screen: "on" | "off"  (từng bàn)
//  - signals/<id>              : { status: "expired", ts: <server ts> } -> quay về màn bắt đầu

(function () {
  'use strict';

  // ---- UI refs ----
  const overlayEl = document.getElementById('screen-overlay');
  const posContainer = document.getElementById('pos-container');
  const posFrame = document.getElementById('pos-frame');
  const startScreen = document.getElementById('start-screen');
  const selectTable = document.getElementById('select-table');

  // ---- Trạng thái bộ nhớ ----
  let globalState = 'on';           // toàn quán
  let localState  = 'on';           // theo từng bàn
  let tableId     = null;           // đọc từ localStorage khi có
  let db          = null;           // firebase.database()
  let bound = {                      // giữ reference để gỡ listener khi cần
    global: null,
    perTable: null,
    signal: null
  };

  // ---- Helper: UI overlay ----
  function setOverlayVisible(show) {
    if (!overlayEl) return;
    overlayEl.style.display = show ? 'block' : 'none';

    // Đồng bộ NoSleep video nếu có (tùy nosleep.js của bạn expose các hàm này)
    // window.NoSleepVideo?.pause() / play() là optional, không bắt buộc
    try {
      if (show) {
        if (window.NoSleepVideo && typeof window.NoSleepVideo.pause === 'function') {
          window.NoSleepVideo.pause();
        }
      } else {
        if (window.NoSleepVideo && typeof window.NoSleepVideo.play === 'function') {
          window.NoSleepVideo.play();
        }
      }
    } catch (_) {}
  }

  function updateOverlay() {
    const off = (globalState === 'off') || (localState === 'off');
    setOverlayVisible(off);
  }

  // ---- Helper: reset về màn bắt đầu gọi món (giữ nguyên bàn đã chọn) ----
  function resetToStart() {
    if (posContainer) posContainer.classList.add('hidden');
    if (posFrame) posFrame.src = 'about:blank';
    if (startScreen) startScreen.classList.remove('hidden');
    if (selectTable) selectTable.classList.add('hidden');
    // Lưu state để sau reload tự vào đúng màn
    try { localStorage.setItem('appState', 'start'); } catch (_) {}
  }

  // ---- Gỡ các listener cũ khi đổi bàn / rebind ----
  function detachAll() {
    if (!db) return;
    if (bound.global) { db.ref('control/screen').off('value', bound.global); bound.global = null; }
    if (tableId && bound.perTable) { db.ref(`control/tables/${tableId}/screen`).off('value', bound.perTable); bound.perTable = null; }
    if (tableId && bound.signal) { db.ref(`signals/${tableId}`).off('value', bound.signal); bound.signal = null; }
  }

  // ---- Gắn các listener điều khiển ----
  function attachAll() {
    if (!db) return;

    // 1) Toàn quán
    bound.global = (snap) => {
      const v = (snap && snap.val()) || 'on';
      globalState = String(v).toLowerCase() === 'off' ? 'off' : 'on';
      updateOverlay();
    };
    db.ref('control/screen').on('value', bound.global);

    // 2) Theo bàn (nếu đã biết tableId)
    if (tableId) {
      bound.perTable = (snap) => {
        const v = (snap && snap.val()) || 'on';
        localState = String(v).toLowerCase() === 'off' ? 'off' : 'on';
        updateOverlay();
      };
      db.ref(`control/tables/${tableId}/screen`).on('value', bound.perTable);

      // 3) Tín hiệu "Làm mới" (reset về màn bắt đầu)
      bound.signal = (snap) => {
        if (!snap || !snap.exists()) return;
        const val = snap.val() || {};
        if (val.status === 'expired') {
          // Quay về màn bắt đầu gọi món
          resetToStart();
          // Đánh dấu đã xử lý để tránh lặp (không bắt buộc)
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

  // ---- Khi Firebase sẵn sàng mới gắn listener ----
  function bindAfterReady() {
    // Đọc tableId từ window hoặc localStorage
    try {
      tableId = (window.tableId) || localStorage.getItem('tableId') || null;
    } catch (_) { tableId = null; }

    detachAll();
    attachAll();
    updateOverlay();
  }

  // ---- Theo dõi khi user chọn bàn sau này (localStorage thay đổi ở tab khác) ----
  window.addEventListener('storage', (e) => {
    if (e && e.key === 'tableId') {
      try { tableId = localStorage.getItem('tableId') || null; } catch (_) { tableId = null; }
      bindAfterReady();
    }
  });

  // ---- Lắng nghe sự kiện "firebase-ready" từ assets/js/firebase.js ----
  window.addEventListener('firebase-ready', (ev) => {
    if (ev && ev.detail && ev.detail.db) {
      db = ev.detail.db;
      bindAfterReady();
    }
  });

  // ---- Fallback: nếu firebase.js không phát sự kiện (trường hợp cũ) ----
  // Thử lấy trực tiếp từ window.firebaseDb khi DOM sẵn sàng
  function tryFallbackBind() {
    if (!db && window.firebase && window.firebase.database) {
      try {
        db = window.firebase.database();
        bindAfterReady();
      } catch (_) {}
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryFallbackBind);
  } else {
    tryFallbackBind();
  }

  // ---- Expose một vài API nhỏ để test nhanh qua console (tùy chọn) ----
  window.__blackout = {
    forceOn()  { globalState = 'on';  localState = 'on';  updateOverlay(); },
    forceOff() { globalState = 'off'; localState = 'off'; updateOverlay(); },
    refresh()  { bindAfterReady(); }
  };
})();