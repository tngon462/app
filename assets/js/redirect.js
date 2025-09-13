// ====== redirect.js ======

// Danh sách bàn (có thể chỉnh tuỳ quán)
const TABLES = [
  "B01","B02","B03","B04","B05",
  "B06","B07","B08","B09","B10",
  "B11","B12","B13","B14","B15"
];

// URL POS (link menu cho từng bàn)
const POS_BASE_URL = "https://fnb.kiotviet.vn/tngonfnb/pos/#/cashier";

// Các phần tử DOM
const tableContainer   = document.getElementById("table-container");
const selectTableUI    = document.getElementById("select-table");
const startScreenUI    = document.getElementById("start-screen");
const posContainerUI   = document.getElementById("pos-container");
const posFrame         = document.getElementById("pos-frame");
const selectedTableEl  = document.getElementById("selected-table");
const startOrderBtn    = document.getElementById("start-order");

// Trạng thái
let currentTable = null;

// ====== HIỂN THỊ BÀN ======
function renderTables() {
  tableContainer.innerHTML = "";
  TABLES.forEach(tableId => {
    const btn = document.createElement("button");
    btn.textContent = tableId;
    btn.className =
      "px-6 py-4 rounded-xl bg-white border border-blue-300 shadow hover:bg-blue-100 text-xl font-bold";
    btn.addEventListener("click", () => selectTable(tableId));
    tableContainer.appendChild(btn);
  });
}

// ====== CHỌN BÀN ======
function selectTable(tableId) {
  currentTable = tableId;
  selectedTableEl.textContent = tableId;

  // Ẩn màn chọn bàn, hiện màn start
  selectTableUI.classList.add("hidden");
  startScreenUI.classList.remove("hidden");
  posContainerUI.classList.add("hidden");
}

// ====== BẮT ĐẦU GỌI MÓN ======
function startOrder() {
  if (!currentTable) return;

  // Ẩn màn start, hiện iframe POS
  startScreenUI.classList.add("hidden");
  posContainerUI.classList.remove("hidden");

  // Gắn link POS vào iframe
  const url = `${POS_BASE_URL}?table=${currentTable}`;
  posFrame.src = url;

  // Phát sự kiện để nếu cần dùng bên ngoài
  window.tableId = currentTable;
  window.dispatchEvent(
    new CustomEvent("tableSelected", { detail: currentTable })
  );
}

// ====== QUAY LẠI MÀN BẮT ĐẦU ======
function showStart() {
  selectTableUI.classList.add("hidden");
  posContainerUI.classList.add("hidden");
  startScreenUI.classList.remove("hidden");
}

// ====== QUAY LẠI MÀN CHỌN BÀN ======
function showSelect() {
  startScreenUI.classList.add("hidden");
  posContainerUI.classList.add("hidden");
  selectTableUI.classList.remove("hidden");
  currentTable = null;
  posFrame.src = "";
}

// ====== KHỞI TẠO ======
document.addEventListener("DOMContentLoaded", () => {
  renderTables();
  showSelect(); // mặc định hiển thị chọn bàn

  startOrderBtn.addEventListener("click", startOrder);
});

// ====== Gắn ra window để secret-button gọi ======
window.showStart = showStart;
window.showSelect = showSelect;