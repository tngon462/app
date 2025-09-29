document.addEventListener("DOMContentLoaded", async () => {
  try {
    // ===== Load links.json =====
    const res = await fetch("./links.json?cb=" + Date.now());
    const data = await res.json();
    const links = data.links || {};

    const tableContainer = document.getElementById("table-container");
    const selectTable = document.getElementById("select-table");
    const startScreen = document.getElementById("start-screen");
    const posContainer = document.getElementById("pos-container");
    const posFrame = document.getElementById("pos-frame");
    const selectedTable = document.getElementById("selected-table");
    const startBtn = document.getElementById("start-order");

    // ===== Tạo nút cho từng bàn =====
    Object.keys(links).forEach((key) => {
      const btn = document.createElement("button");
      btn.textContent = "Bàn " + key;
      btn.className =
        "px-6 py-4 rounded-lg bg-blue-500 text-white font-bold hover:bg-blue-600 " +
        "text-xl shadow w-full h-24 flex items-center justify-center";

      btn.addEventListener("click", () => {
        selectTable.classList.add("hidden");
        startScreen.classList.remove("hidden");
        selectedTable.textContent = key;
        startBtn.setAttribute("data-url", links[key]);

        // Lưu trạng thái
        window.tableId = key;
        localStorage.setItem("tableId", key);
        localStorage.setItem("appState", "start");
      });

      tableContainer.appendChild(btn);
    });

    // ===== Nút bắt đầu gọi món =====
    startBtn.addEventListener("click", (e) => {
      const url = e.target.getAttribute("data-url");
      if (!url) return;
      startScreen.classList.add("hidden");
      posContainer.classList.remove("hidden");
      posFrame.src = url;

      localStorage.setItem("appState", "pos");
    });

    // ===== Popup mật khẩu =====
    const popup = document.getElementById("password-popup");
    const pwdInput = document.getElementById("password-input");
    const pwdOk = document.getElementById("password-ok");
    const pwdCancel = document.getElementById("password-cancel");
    const pwdError = document.getElementById("password-error");

    function showPasswordPopup(onSuccess) {
      popup.classList.remove("hidden");
      pwdInput.value = "";
      pwdError.classList.add("hidden");
      setTimeout(() => pwdInput.focus(), 100); // iOS hack

      pwdOk.onclick = () => {
        if (pwdInput.value === "6868") {
          popup.classList.add("hidden");
          onSuccess();
        } else {
          pwdError.classList.remove("hidden");
        }
      };
      pwdCancel.onclick = () => {
        popup.classList.add("hidden");
      };
    }

    // ===== Secret buttons =====
    function setupSecretButton(id, action, requirePwd = false) {
      const btn = document.getElementById(id);
      let clicks = [];
      btn.addEventListener("click", () => {
        const now = Date.now();
        clicks = clicks.filter((t) => now - t < 3000);
        clicks.push(now);

        if (clicks.length >= 10) {
          clicks = [];
          if (requirePwd) showPasswordPopup(action);
          else action();
        }
      });
    }

    // Trái: về màn bắt đầu
    setupSecretButton("back-btn-start", () => {
      posContainer.classList.add("hidden");
      posFrame.src = "about:blank";
      startScreen.classList.remove("hidden");
      localStorage.setItem("appState", "start");
    });

    // Phải: về màn chọn bàn (cần mật khẩu)
    setupSecretButton("back-btn-select", () => {
      posContainer.classList.add("hidden");
      posFrame.src = "about:blank";
      startScreen.classList.add("hidden");
      selectTable.classList.remove("hidden");
      localStorage.removeItem("tableId");
      localStorage.removeItem("appState");
    }, true);

    // ===== Restore state sau khi reload do resume =====
    function restoreState() {
      const resumed = sessionStorage.getItem("resumeReload") === "1";
      sessionStorage.removeItem("resumeReload"); // chỉ dùng 1 lần

      if (!resumed) return; // reload thủ công -> không khôi phục

      const tableId = localStorage.getItem("tableId");
      const state = localStorage.getItem("appState");

      if (!tableId || !links[tableId]) return;

      if (state === "start") {
        selectTable.classList.add("hidden");
        startScreen.classList.remove("hidden");
        selectedTable.textContent = tableId;
        startBtn.setAttribute("data-url", links[tableId]);
      } else if (state === "pos") {
        selectTable.classList.add("hidden");
        startScreen.classList.add("hidden");
        posContainer.classList.remove("hidden");
        posFrame.src = links[tableId];
      }
    }

    restoreState();

    // ===== Bắt sự kiện resume (sleep -> sáng lại) =====
    window.addEventListener("pageshow", (e) => {
      if (e.persisted) {
        sessionStorage.setItem("resumeReload", "1");
        location.reload();
      }
    });

  } catch (err) {
    console.error("Lỗi khi load links.json:", err);
  }
});