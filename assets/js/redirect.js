document.addEventListener("DOMContentLoaded", async () => {
  try {
    // Load links.json
    const res = await fetch("./links.json");
    const data = await res.json();
    const links = data.links || data;

    const container = document.getElementById("table-container");
    const startScreen = document.getElementById("start-screen");
    const selectTable = document.getElementById("select-table");
    const posContainer = document.getElementById("pos-container");
    const posFrame = document.getElementById("pos-frame");

    const startBtn = document.getElementById("start-order");
    const selectedTable = document.getElementById("selected-table");

    // Secret buttons
    const btnStart = document.getElementById("back-btn-start");
    const btnSelect = document.getElementById("back-btn-select");

    // Popup
    const popup = document.getElementById("password-popup");
    const passwordInput = document.getElementById("password-input");
    const passwordOk = document.getElementById("password-ok");
    const passwordCancel = document.getElementById("password-cancel");
    const passwordError = document.getElementById("password-error");

    // ===== Utils =====
    function updateSecretButtons(screen) {
      if (screen === "select") {
        btnStart.style.display = "none";
        btnSelect.style.display = "none";
      } else {
        btnStart.style.display = "block";
        btnSelect.style.display = "block";
      }
    }

    function goToSelectTable() {
      posContainer.classList.add("hidden");
      startScreen.classList.add("hidden");
      selectTable.classList.remove("hidden");
      updateSecretButtons("select");
    }

    function goToStartScreen(tableId) {
      selectTable.classList.add("hidden");
      posContainer.classList.add("hidden");
      startScreen.classList.remove("hidden");
      selectedTable.textContent = tableId;
      updateSecretButtons("start");
    }

    function goToPos(url) {
      startScreen.classList.add("hidden");
      posContainer.classList.remove("hidden");
      posFrame.src = url;
      updateSecretButtons("pos");
    }

    // ===== Render nút chọn bàn =====
    Object.keys(links).forEach((key) => {
      const btn = document.createElement("button");
      btn.textContent = "Bàn " + key;

      btn.className =
        "px-6 py-3 m-3 rounded-lg bg-blue-500 text-white font-bold " +
        "hover:bg-blue-700 w-32 h-20 text-xl shadow";

      btn.addEventListener("click", () => {
        goToStartScreen(key);
        startBtn.setAttribute("data-url", links[key]);
        localStorage.setItem("tableId", key);
      });

      container.appendChild(btn);
    });

    // ===== Nút bắt đầu gọi món =====
    startBtn.addEventListener("click", (e) => {
      const url = e.target.getAttribute("data-url");
      if (!url) return;
      goToPos(url);
    });

    // ===== Secret buttons =====
    function setupSecretButton(el, action) {
      let clicks = [];
      el.addEventListener("click", () => {
        const now = Date.now();
        clicks = clicks.filter((t) => now - t < 3000);
        clicks.push(now);
        if (clicks.length >= 10) {
          clicks = [];
          action();
        }
      });
    }

    // Trái → về màn bắt đầu
    setupSecretButton(btnStart, () => {
      goToStartScreen(localStorage.getItem("tableId") || "?");
    });

    // Phải → yêu cầu mật khẩu, đúng thì về màn chọn bàn
    setupSecretButton(btnSelect, () => {
      popup.classList.remove("hidden");
      passwordInput.value = "";
      passwordError.classList.add("hidden");
      passwordInput.focus();
    });

    passwordOk.addEventListener("click", () => {
      if (passwordInput.value === "6868") {
        popup.classList.add("hidden");
        goToSelectTable();
      } else {
        passwordError.classList.remove("hidden");
      }
    });
    passwordCancel.addEventListener("click", () => {
      popup.classList.add("hidden");
    });

    // ===== Khởi tạo =====
    goToSelectTable();
  } catch (err) {
    console.error("Lỗi khi load links.json:", err);
  }
});
