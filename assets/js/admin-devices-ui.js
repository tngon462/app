// assets/js/admin-devices-ui.js
// UI-ONLY cho tab Thiết bị:
// - ĐẨY "Thiết bị (iPad)" lên đầu trang, bất kể render muộn
// - Phóng to nút ≈2x
// - Sắp xếp danh sách theo số bàn (thiết bị chưa có bàn xuống cuối)
// - Không đổi logic đọc/ghi; chỉ thao tác DOM.

(function () {
  'use strict';

  const $ = (sel, root=document) => root.querySelector(sel);

  // ===== 1) CSS phóng to nút và căn hàng =====
  function injectStyles() {
    if ($('style[data-tngon-ui="devices"]')) return;
    const css = `
      [data-tngon-devices-wrapper] .tngon-dev-actions [data-act],
      [data-tngon-devices-wrapper] .tngon-dev-btn {
        font-size: calc(0.75rem * 1.9);
        line-height: 1.15;
        padding: calc(0.375rem * 1.9) calc(0.5rem * 1.9);
        border-radius: calc(0.375rem * 1.9);
      }
      [data-tngon-devices-wrapper] tr.tngon-dev-row > td { padding-top:.6rem; padding-bottom:.6rem; }
      [data-tngon-devices-wrapper] .tngon-dev-id { max-width: 280px; }
      [data-tngon-devices-wrapper] .tngon-dev-id .font-mono { word-break: break-all; }
      [data-tngon-devices-wrapper] .tngon-card {
        background:#fff; border:1px solid #e5e7eb; border-radius:12px; padding:16px; margin-bottom:16px;
      }
      [data-tngon-devices-wrapper] .tngon-title { font-size:1.125rem; font-weight:700; color:#111827; margin-bottom:10px; }
    `;
    const el = document.createElement('style');
    el.setAttribute('data-tngon-ui', 'devices');
    el.textContent = css;
    document.head.appendChild(el);
  }

  // ===== 2) Tìm tbody devices theo nhiều ID
  function findDevBody() {
    return document.getElementById('devBody')
        || document.getElementById('devices-tbody')
        || document.getElementById('devices_tbody');
  }

  // ===== 3) Tạo wrapper ở đầu trang & đưa bảng thiết bị lên
  function ensureDevicesAtTop(devBody) {
    // Main content (đa số admin dùng .content)
    const main = $('main.content') || $('main') || document.body;

    // Nếu đã có wrapper → thôi
    if ($('[data-tngon-devices-wrapper]')) return;

    // Tìm table chứa tbody
    const devTable = devBody.closest('table') || devBody.parentElement;
    if (!devTable) return;

    // Tạo card wrapper ở đầu main
    const wrapper = document.createElement('section');
    wrapper.setAttribute('data-tngon-devices-wrapper', '1');
    wrapper.className = 'tngon-card';
    // Tiêu đề mặc định (không ảnh hưởng logic)
    const title = document.createElement('div');
    title.className = 'tngon-title';
    title.textContent = 'Thiết bị (iPad)';
    wrapper.appendChild(title);

    // Đưa table hiện có vào wrapper (di chuyển node – không mất event listener của các nút)
    wrapper.appendChild(devTable);

    // Chèn wrapper lên đầu main
    main.insertBefore(wrapper, main.firstChild);
  }

  // ===== 4) Sắp xếp theo số bàn (col 3 mặc định: [ID/Tên] [Code] [Bàn] [Actions])
  function parseTable(t) {
    if (!t) return Number.POSITIVE_INFINITY;
    let s = (t.textContent || '').trim();
    if (s.startsWith('+')) s = s.slice(1);
    const n = parseInt(s, 10);
    return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
  }

  function sortDevices() {
    const devBody = findDevBody();
    if (!devBody) return;
    const rows = Array.from(devBody.querySelectorAll('tr'));
    if (!rows.length) return;

    const tableColIndex = 2; // cột bàn
    const sorted = rows
      .map(tr => ({ tr, key: parseTable(tr.children[tableColIndex]) }))
      .sort((a,b)=> a.key - b.key)
      .map(x=>x.tr);

    sorted.forEach(tr => devBody.appendChild(tr));
  }

  // ===== 5) Decorate nút hiện có (để áp style phóng to)
  function decorateButtons() {
    const devBody = findDevBody();
    if (!devBody) return;

    Array.from(devBody.querySelectorAll('tr')).forEach(tr => {
      tr.classList.add('tngon-dev-row');
      const actionsTd = tr.lastElementChild;
      if (actionsTd) actionsTd.classList.add('tngon-dev-actions');
      actionsTd?.querySelectorAll('[data-act]').forEach(btn => {
        btn.classList.add('tngon-dev-btn');
      });

      const idTd = tr.querySelector('td:first-child');
      if (idTd) idTd.classList.add('tngon-dev-id');
    });
  }

  // ===== 6) Quan sát để đảm bảo: khi admin-devices.js render xong → move/sort/decorate
  function attachObserver() {
    const bodyObserver = new MutationObserver(() => {
      const devBody = findDevBody();
      if (!devBody) return;
      ensureDevicesAtTop(devBody);
      decorateButtons();
      sortDevices();
    });
    bodyObserver.observe(document.body, { childList: true, subtree: true });
  }

  // ===== 7) Poll nhẹ phòng khi DOMContentLoaded chạy sớm
  function waitAndRun() {
    injectStyles();
    attachObserver();

    let tries = 0;
    const tick = setInterval(() => {
      tries++;
      const devBody = findDevBody();
      if (devBody) {
        ensureDevicesAtTop(devBody);
        decorateButtons();
        sortDevices();
        clearInterval(tick);
      }
      if (tries > 80) clearInterval(tick); // ~8s là đủ
    }, 100);
  }

  document.addEventListener('DOMContentLoaded', waitAndRun);
})();