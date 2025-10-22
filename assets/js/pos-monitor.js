// /assets/js/pos-monitor.js
(function () {
  'use strict';
  const log = (...a) => console.log('[pos-monitor]', ...a);

  function goBackToStart() {
    try { localStorage.setItem('appState', 'start'); } catch {}
    if (typeof window.gotoStart === 'function') {
      log('→ gotoStart() triggered by POS error');
      window.gotoStart();
    } else {
      log('→ reload fallback');
      location.reload();
    }
  }

  // 1️⃣ Bắt lỗi global (nếu POS iframe throw ra)
  window.addEventListener('error', (e) => {
    const msg = String(e.message || '').toLowerCase();
    if (msg.includes('scan_again_to_make_your_order')) {
      log('Detected expired session (window.error).');
      goBackToStart();
    }
  });

  // 2️⃣ Bắt lỗi console.error (vì POS log qua console)
  const origErr = console.error;
  console.error = function (...args) {
    try {
      const joined = args.map(a => String(a)).join(' ').toLowerCase();
      if (joined.includes('scan_again_to_make_your_order')) {
        log('Detected expired session (console.error).');
        goBackToStart();
      }
    } catch (_) {}
    return origErr.apply(console, args);
  };

  // 3️⃣ Optional: theo dõi iframe nếu reload về trang lỗi (nếu cùng domain)
  const posFrame = document.getElementById('pos-frame');
  if (posFrame) {
    posFrame.addEventListener('load', () => {
      const src = posFrame.src || '';
      if (src.includes('error') || src.includes('scan_again')) {
        log('Detected error page inside POS.');
        goBackToStart();
      }
    });
  }

  log('POS monitor active.');
})();
