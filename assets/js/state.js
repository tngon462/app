// state.js

// 1) Phát hiện resume (sleep -> sáng lại) và buộc reload với cờ session
window.addEventListener("pageshow", (e) => {
  if (e.persisted) {
    // Trang được resume từ bối cảnh đóng băng
    sessionStorage.setItem("resumeReload", "1");
    location.reload();
  }
});

document.addEventListener("DOMContentLoaded", () => {
  const resumed = sessionStorage.getItem("resumeReload") === "1";
  // Cờ chỉ dùng 1 lần cho lần load này
  sessionStorage.removeItem("resumeReload");

  const selectTable = document.getElementById("select-table");
  const startScreen = document.getElementById("start-screen");
  const posContainer = document.getElementById("pos-container");
  const posFrame = document.getElementById("pos-frame");
  const selectedTable = document.getElementById("selected-table");
  const startBtn = document.getElementById("start-order");

  const tableId = localStorage.getItem("tableId");
  const tableUrl = localStorage.getItem("tableUrl");
  const appState = localStorage.getItem("appState"); // "start" | "pos"

  if (resumed && tableId && tableUrl) {
    // ✅ CHỈ khôi phục khi là resume sau sleep
    window.tableId = tableId; // cho blackout.js

    if (appState === "start") {
      selectTable.classList.add("hidden");
      startScreen.classList.remove("hidden");
      selectedTable.textContent = tableId;
      startBtn.setAttribute("data-url", tableUrl);
      // pos ẩn + clear src
      posContainer.classList.add("hidden");
      posFrame.src = "about:blank";
    } else if (appState === "pos") {
      selectTable.classList.add("hidden");
      startScreen.classList.add("hidden");
      posContainer.classList.remove("hidden");
      posFrame.src = tableUrl;
    } else {
      // Nếu appState rỗng -> rơi về chọn bàn
      selectTable.classList.remove("hidden");
      startScreen.classList.add("hidden");
      posContainer.classList.add("hidden");
      posFrame.src = "about:blank";
    }
  } else {
    // ❌ Reload/mở app thủ công → luôn về màn CHỌN BÀN
    selectTable.classList.remove("hidden");
    startScreen.classList.add("hidden");
    posContainer.classList.add("hidden");
    posFrame.src = "about:blank";

    // Xoá trạng thái cũ để lần sau không tự nhảy
    localStorage.removeItem("tableId");
    localStorage.removeItem("tableUrl");
    localStorage.removeItem("appState");
    delete window.tableId;
  }
});
