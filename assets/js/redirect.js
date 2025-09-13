document.addEventListener("DOMContentLoaded", () => {
  const selectTable = document.getElementById("select-table");
  const startScreen = document.getElementById("start-screen");
  const posContainer = document.getElementById("pos-container");
  const posFrame = document.getElementById("pos-frame");
  const selectedTableSpan = document.getElementById("selected-table");
  const startOrderBtn = document.getElementById("start-order");
  const tableContainer = document.getElementById("table-container");

  // Danh sách bàn mẫu (có thể thay bằng dữ liệu động)
  const tableList = ["B01", "B02", "B03", "B04", "B05", "B06"];

  // Tạo nút chọn bàn
  tableList.forEach(id => {
    const btn = document.createElement("button");
    btn.textContent = id;
    btn.className =
      "w-24 h-24 flex items-center justify-center bg-white rounded-xl shadow font-bold text-xl hover:bg-blue-100";
    btn.addEventListener("click", () => {
      handleSelectTable(id);
    });
    tableContainer.appendChild(btn);
  });

  // Hàm xử lý chọn bàn
  function handleSelectTable(id) {
    // Lưu tableId
    window.tableId = id;
    localStorage.setItem("tableId", id);

    // Bắn event để blackout.js lắng nghe
    window.dispatchEvent(new CustomEvent("tableSelected", { detail: id }));

    // Cập nhật UI
    selectedTableSpan.textContent = id;
    selectTable.classList.add("hidden");
    startScreen.classList.remove("hidden");
  }

  // Bắt đầu gọi món
  startOrderBtn.addEventListener("click", () => {
    startScreen.classList.add("hidden");
    posContainer.classList.remove("hidden");

    // Gán link POS (ví dụ: thay bằng link thật)
    const url = "https://fnb.kiotviet.vn/tngonfnb/pos/#/cashier";
    posFrame.src = url;
  });
});