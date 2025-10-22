// /assets/js/qrback-listener.js
(function () {
  'use strict';
  const log  = (...a) => console.log('[qrback]', ...a);
  const warn = (...a) => console.warn('[qrback]', ...a);

  async function waitFirebaseReady() {
    return new Promise((resolve, reject) => {
      let tries = 0;
      const iv = setInterval(() => {
        tries++;
        if (window.firebase && firebase.apps?.length) {
          clearInterval(iv);
          resolve();
        }
        if (tries > 200) { clearInterval(iv); reject(new Error('Firebase not ready')); }
      }, 50);
    });
  }

  function goBackToStart() {
    try { localStorage.setItem('appState', 'start'); } catch {}
    if (typeof window.gotoStart === 'function') {
      log('→ gotoStart()');
      window.gotoStart();
    } else {
      log('→ reload fallback');
      location.reload();
    }
  }

  (async function boot() {
    try {
      await waitFirebaseReady();
      const db = firebase.database();

      const deviceId =
        localStorage.getItem('deviceId') ||
        localStorage.getItem('tn_device_id') ||
        localStorage.getItem('tn_deviceId') || '';

      if (!deviceId) {
        warn('Không thấy deviceId trong localStorage.');
        return;
      }
      log('ctx', { deviceId });

      // --- Lấy bàn hiện tại của thiết bị ---
      let table = null;
      db.ref('devices/' + deviceId + '/table').on('value', (s) => {
        table = s.val() || null;
        log('device table =', table);
      });

      // --- Lắng nghe tín hiệu hết hạn từ QRback.py ---
      const watchSignals = () => {
        if (!table) return;
        const path = `signals/${table}`;
        db.ref(path).on('value', (s) => {
          const val = s.val();
          if (!val) return;
          if (val.status === 'expired') {
            log(`[qrback] tín hiệu hết hạn từ ${path}`, val);
            goBackToStart();
          }
        });
        log('[qrback] listening', path);
      };

      const iv = setInterval(() => {
        if (table) {
          clearInterval(iv);
          watchSignals();
        }
      }, 300);

      setTimeout(() => clearInterval(iv), 15000);

      log('QRback listener ready.');
    } catch (e) {
      console.error('[qrback] boot error:', e);
    }
  })();
})();
