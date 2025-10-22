// assets/js/admin-home-inject.js
(function () {
  'use strict';
  const log = (...a) => console.log('[admin-home-inject]', ...a);
  const warn = (...a) => console.warn('[admin-home-inject]', ...a);

  // Đợi Firebase sẵn sàng
  function getDB() {
    if (!window.firebase || !firebase.apps?.length) return null;
    try { return firebase.database(); } catch (_) { return null; }
  }

  // Tìm ID thiết bị trong popup (dòng "ID đầy đủ: <span class='font-mono'>...</span>")
  function extractDeviceId(wrap) {
    // Ưu tiên span ở đoạn thông tin chi tiết
    const spans = wrap.querySelectorAll('span.font-mono');
    for (const sp of spans) {
      const t = (sp.textContent || '').trim();
      // ID dạng UUID có dấu gạch và khá dài
      if (t.length > 20 && t.includes('-')) return t;
    }
    return null;
  }

  // Tiêm nút Home vào lưới nút trong popup
  function injectHomeButton(wrap) {
    // Lưới nút là grid 2 cột ngay trong popup
    const grid = wrap.querySelector('.grid.grid-cols-2.gap-2');
    if (!grid) return;

    if (grid.dataset.homeInjected === '1') return; // chống chèn trùng
    const db = getDB();
    if (!db) { warn('Firebase chưa sẵn sàng'); return; }

    const deviceId = extractDeviceId(wrap);
    if (!deviceId) { warn('Không lấy được deviceId từ popup'); return; }

    const btn = document.createElement('button');
    btn.id = 'act-home';
    btn.className = 'px-3 py-2 rounded bg-indigo-600 text-white hover:bg-indigo-700';
    btn.textContent = 'Home';

    btn.addEventListener('click', async () => {
      try {
        await db.ref(`devices/${deviceId}/commands/homeAt`)
          .set(firebase.database.ServerValue.TIMESTAMP);
        // đóng popup
        const overlay = btn.closest('.fixed.inset-0');
        if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
        log('Đã gửi lệnh HOME cho', deviceId);
      } catch (e) {
        alert('Gửi lệnh HOME lỗi: ' + (e?.message || e));
      }
    });

    // Chèn lên đầu grid
    grid.prepend(btn);
    grid.dataset.homeInjected = '1';
    log('Đã chèn nút Home vào popup cho', deviceId);
  }

  // Quan sát DOM: mỗi khi popup action xuất hiện sẽ tự chèn nút
  const obs = new MutationObserver((muts) => {
    for (const m of muts) {
      for (const node of m.addedNodes) {
        if (!(node instanceof Element)) continue;
        // Popup action có lớp overlay: fixed inset-0 z-[9700] ...
        if (node.matches('.fixed.inset-0')) {
          // Có phần tiêu đề "Thiết bị ..." và lưới nút
          const titleOK = !!node.textContent?.includes('Thiết bị');
          const gridOK = !!node.querySelector('.grid.grid-cols-2.gap-2');
          if (titleOK && gridOK) {
            injectHomeButton(node);
          }
        } else {
          // Nếu overlay nằm sâu hơn
          const overlay = node.querySelector?.('.fixed.inset-0');
          if (overlay) {
            const titleOK = !!overlay.textContent?.includes('Thiết bị');
            const gridOK = !!overlay.querySelector('.grid.grid-cols-2.gap-2');
            if (titleOK && gridOK) {
              injectHomeButton(overlay);
            }
          }
        }
      }
    }
  });

  // Bắt đầu quan sát toàn trang
  obs.observe(document.body, { childList: true, subtree: true });
  log('Injector ready.');
})();
