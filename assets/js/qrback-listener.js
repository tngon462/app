// /assets/js/qrback-listener.js
(function () {
  'use strict';
  const log  = (...a) => console.log('[qrback]', ...a);
  const warn = (...a) => console.warn('[qrback]', ...a);

  // --- Đợi Firebase đã init + (nếu có) đã auth ẩn danh xong ---
  async function waitFirebase() {
    if (window.firebaseReady) {
      try { await window.firebaseReady; } catch {}
    }
    return new Promise((res, rej) => {
      let tries = 0;
      const iv = setInterval(() => {
        tries++;
        if (window.firebase && firebase.apps && firebase.apps.length) {
          clearInterval(iv);
          res();
        } else if (tries > 200) { // ~10s
          clearInterval(iv);
          rej(new Error('Firebase chưa init'));
        }
      }, 50);
    });
  }

  // --- Quay về màn chọn bàn + gửi tín hiệu cho POS iframe (nếu có) ---
  function goHomeUI() {
    // Đánh dấu state để bind-probe ghi về 'select'
    try { localStorage.setItem('appState', 'select'); } catch {}
    // Gọi hàm core nếu đã có
    if (typeof window.gotoSelect === 'function') {
      log('gotoSelect()');
      try { window.gotoSelect(); } catch (e) { console.error(e); }
    } else {
      // Dự phòng
      log('reload() fallback');
      location.reload();
    }

    // Thử gửi thông điệp cho iframe POS (nếu nó support)
    try {
      const iframe = document.getElementById('pos-frame');
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({ type: 'TN_GO_HOME' }, '*');
      }
    } catch (e) { /* ignore */ }
  }

  // --- Bắt đầu ---
  (async function boot() {
    try {
      await waitFirebase();
      const db = firebase.database();

      // Lấy deviceId do device-bind.js đã set
      const deviceId =
        localStorage.getItem('deviceId') ||
        localStorage.getItem('tn_device_id') ||
        localStorage.getItem('tn_deviceId') || '';

      if (!deviceId) { warn('Không thấy deviceId trong localStorage.'); return; }
      log('ctx', { deviceId });

      // Theo dõi số bàn hiện tại của device (để lắng nghe kênh riêng)
      let table = null;
      db.ref('devices/' + deviceId + '/table').on('value', s => {
        table = s.val() || null;
        log('device table =', table);
      });

      // Hành động khi có tín hiệu QRback
      function onQrbackSignal(source, payload) {
        log('QRback from', source, payload);
        goHomeUI();
      }

      // 1) Kênh toàn quán
      db.ref('broadcast/qrbackAt').on('value', s => {
        const v = s.val();
        if (!v) return;
        onQrbackSignal('broadcast', v);
      });

      // 2) Kênh riêng theo bàn: chờ có table rồi mới lắng nghe
      function listenPerTableOnce() {
        if (!table) return;
        db.ref(`control/tables/${table}/qrbackAt`).on('value', s => {
          const v = s.val();
          if (!v) return;
          onQrbackSignal(`table:${table}`, v);
        });
      }
      const iv = setInterval(() => {
        if (table) {
          clearInterval(iv);
          listenPerTableOnce();
        }
      }, 300);
      setTimeout(() => clearInterval(iv), 15000);

      log('QRback listener ready.');
    } catch (e) {
      console.error('[qrback] boot error:', e);
    }
  })();
})();
