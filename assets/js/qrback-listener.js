// /assets/js/pos-monitor.js
(function () {
  'use strict';
  const log  = (...a)=> console.log('[pos-monitor]', ...a);

  function goStart(reason) {
    try { localStorage.setItem('appState', 'start'); } catch {}
    if (typeof window.gotoStart === 'function') {
      console.log('[pos-monitor] → gotoStart()', reason);
      window.gotoStart();
    } else {
      console.log('[pos-monitor] → reload fallback', reason);
      location.reload();
    }
  }

  // Bắt mọi lỗi JS bị ném ra ngoài (POS app đang ném lỗi này lên top window)
  window.addEventListener('error', (e) => {
    const msg = String(e?.error?.message || e?.message || '');
    if (msg.includes('scan_again_to_make_your_order')) {
      goStart('pos_error_scan_again');
    }
  });

  // Bắt Promise bị reject chưa bắt
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e?.reason;
    const msg = typeof reason === 'string' ? reason : (reason?.message || '');
    if (String(msg).includes('scan_again_to_make_your_order')) {
      goStart('pos_promise_scan_again');
    }
  });

  // Fallback an toàn: nếu đang ở trạng thái POS quá lâu mà không đổi trang,
  // và có lỗi console tương tự mà vì lý do gì đó không bắt được,
  // tự quay về sau N giây kể từ khi vào POS.
  // (Bạn có thể chỉnh số giây nếu muốn)
  const POS_TIMEOUT_MS = 60_000; // 60s
  let posSince = null;

  // Theo dõi thay đổi state appState trong localStorage
  function handleStateChange(next) {
    if (next === 'pos') posSince = Date.now();
    else posSince = null;
  }
  handleStateChange(localStorage.getItem('appState') || 'select');

  // Ae: bắt thay đổi LS từ chính tab
  const _setItem = localStorage.setItem.bind(localStorage);
  localStorage.setItem = function(k, v) {
    _setItem(k, v);
    if (k === 'appState') handleStateChange(String(v));
  };
  // Ae: bắt thay đổi LS từ tab khác
  window.addEventListener('storage', (e) => {
    if (e.key === 'appState') handleStateChange(String(e.newValue || 'select'));
  });

  setInterval(() => {
    if (posSince && Date.now() - posSince > POS_TIMEOUT_MS) {
      goStart('pos_timeout');
    }
  }, 5000);

  log('POS monitor active.');
})();
