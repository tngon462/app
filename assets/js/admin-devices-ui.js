// assets/js/admin-devices-ui.js
// UI-ONLY patch cho tab Thiết bị:
// - Đẩy block Thiết bị lên đầu trang (trước phần mã/khác)
// - Phóng to nút thao tác của Thiết bị (≈2x)
// - Sắp xếp hàng thiết bị theo số bàn (table), thiết bị chưa có bàn để cuối
// Không đổi logic đọc/ghi Firebase; chỉ thao tác DOM/CSS.

(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  // ===== 1) CSS phóng to nút – chỉ áp dụng trong bảng Thiết bị
  function injectStyles() {
    const css = `
      /* Khung tổng thể của bảng thiết bị: tự co giãn nút */
      #devices-table, #devices_tbody, #devBody, #devices-tbody {
        --btn-scale: 1.9; /* ~2x */
      }
      /* Chỉ phóng to nút thao tác của thiết bị */
      .tngon-dev-actions [data-act],
      tr .tngon-dev-btn {
        font-size: calc(0.75rem * var(--btn-scale));
        line-height: 1.15;
        padding: calc(0.375rem * var(--btn-scale)) calc(0.5rem * var(--btn-scale));
        border-radius: calc(0.375rem * var(--btn-scale));
      }

      /* Giãn dòng cao hơn cho row thiết bị để dễ bấm */
      tr.tngon-dev-row > td { padding-top: .6rem; padding-bottom: .6rem; }

      /* Giới hạn chiều rộng cột ID cho gọn */
      .tngon-dev-id { max-width: 280px; }
      .tngon-dev-id .font-mono { word-break: break-all; }
    `;
    const el = document.createElement('style');
    el.setAttribute('data-tngon-ui', 'devices');
    el.textContent = css;
    document.head.appendChild(el);
  }

  // ===== 2) Đưa block "Thiết bị" lên đầu (trước các phần khác)
  function moveDevicesBlockUp() {
    // tìm tbody thiết bị
    const devBody =
      $('#devBody') || $('#devices-tbody') || $('#devices_tbody');
    if (!devBody) return;

    // block “bảng thiết bị” là table gần nhất bao quanh tbody
    const devTable = devBody.closest('table') || devBody.parentElement;
    if (!devTable) return;

    // section/card bao quanh bảng (ưu tiên container to nhất hợp lý)
    let devSection = devTable.closest('section') || devTable.closest('.card') || devTable;

    // chèn devSection lên đầu vùng content/main
    const main =
      document.querySelector('main.content') ||
      document.querySelector('main') ||
      document.body;

    if (main && devSection && devSection.parentElement !== main) {
      // nếu section đang ở nơi khác, clone & move (đảm bảo không mất event)
      main.insertBefore(devSection, main.firstChild);
    } else if (main && devSection) {
      // đã nằm trong main: đảm bảo nó là phần tử đầu
      if (main.firstElementChild !== devSection) {
        main.insertBefore(devSection, main.firstElementChild);
      }
    }

    // Thêm class hook cho các nút trong bảng thiết bị
    devBody.classList.add('tngon-dev-actions-root');
  }

  // ===== 3) Sắp xếp theo số bàn (chỉ UI)
  function parseTableNumberFromCell(td) {
    if (!td) return Number.POSITIVE_INFINITY;
    let txt = (td.textContent || '').trim();
    // màn POS hiển thị dạng "+12" -> bỏ dấu +
    if (txt.startsWith('+')) txt = txt.slice(1);
    // dấu "—" hoặc rỗng => coi như vô hạn
    const n = parseInt(txt, 10);
    return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
  }

  function sortDeviceRowsByTable() {
    const devBody =
      $('#devBody') || $('#devices-tbody') || $('#devices_tbody');
    if (!devBody) return;

    const rows = Array.from(devBody.querySelectorAll('tr'));
    if (!rows.length) return;

    // tìm cột "bàn" (ở code hiện tại cột bàn là TD thứ 3: [ID/Tên], [Code], [Bàn], [Actions])
    // an toàn hơn: lấy theo text header nếu có, còn không fallback index=2
    let tableColIndex = 2;

    // clone rows & sort
    const sorted = rows
      .map((tr) => {
        const tds = tr.children;
        const tdTable = tds[tableColIndex];
        const key = parseTableNumberFromCell(tdTable);
        return { tr, key };
      })
      .sort((a, b) => a.key - b.key)
      .map((x) => x.tr);

    // replace order
    sorted.forEach((tr) => devBody.appendChild(tr));
  }

  // Quan sát thay đổi của tbody để sort lại mỗi khi admin-devices.js render xong
  let mo = null;
  function attachSortObserver() {
    const devBody =
      $('#devBody') || $('#devices-tbody') || $('#devices_tbody');
    if (!devBody) return;

    // sort ngay lần đầu
    sortDeviceRowsByTable();

    // mỗi khi nội dung thay đổi -> sort lại
    mo?.disconnect?.();
    mo = new MutationObserver(() => {
      // debounce nhẹ cho batch changes
      clearTimeout(attachSortObserver._t);
      attachSortObserver._t = setTimeout(sortDeviceRowsByTable, 30);
    });
    mo.observe(devBody, { childList: true, subtree: false });
  }

  // ===== 4) Thêm class vào các nút hiện có (để áp CSS phóng to)
  function decorateButtons() {
    const devBody =
      $('#devBody') || $('#devices-tbody') || $('#devices_tbody');
    if (!devBody) return;

    // Gắn class cho cell action & nút
    Array.from(devBody.querySelectorAll('tr')).forEach((tr) => {
      tr.classList.add('tngon-dev-row');

      // cell cuối là actions
      const actionsTd = tr.lastElementChild;
      if (actionsTd) actionsTd.classList.add('tngon-dev-actions');

      // gắn class chung cho các button có data-act
      actionsTd?.querySelectorAll('[data-act]').forEach((btn) => {
        btn.classList.add('tngon-dev-btn');
      });

      // cột ID – thêm class để CSS gọn gàng
      const idTd = tr.querySelector('td:first-child');
      if (idTd) idTd.classList.add('tngon-dev-id');
    });
  }

  // Quan sát để auto-decorate sau mỗi lần bảng render lại
  let mo2 = null;
  function attachDecorObserver() {
    const devBody =
      $('#devBody') || $('#devices-tbody') || $('#devices_tbody');
    if (!devBody) return;

    // decorate ngay
    decorateButtons();

    mo2?.disconnect?.();
    mo2 = new MutationObserver(() => {
      // mỗi lần render lại -> decorate lại
      clearTimeout(attachDecorObserver._t);
      attachDecorObserver._t = setTimeout(decorateButtons, 10);
    });
    mo2.observe(devBody, { childList: true, subtree: true });
  }

  // ===== Boot
  document.addEventListener('DOMContentLoaded', () => {
    injectStyles();
    moveDevicesBlockUp();
    attachDecorObserver();
    attachSortObserver();
  });
})();
