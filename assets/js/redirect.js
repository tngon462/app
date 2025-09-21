document.addEventListener("DOMContentLoaded", async () => {
  try {
    // ===== Load links.json không cache =====
    const res = await fetch("./links.json?cb=" + Date.now(), {
      cache: "no-store"
    });
    const data = await res.json();
    const links = data.links || {};

    const selectTable = document.getElementById("select-table");
    const startScreen = document.getElementById("start-screen");
    const posContainer = document.getElementById("pos-container");
    const posFrame = document.getElementById("pos-frame");
    const tableContainer = document.getElementById("table-container");

    const selectedTableSpan = document.getElementById("selected-table");
    const startBtn = document.getElementById("start-order");

    // ===== Tạo nút bàn =====
    Object.keys(links).forEach((key) => {
      const btn = document.createElement("button");
      btn.textContent = "Bàn " + key;
      btn.className =
        "px-6 py-4 rounded-lg bg-blue-500 text-white font-bold hover:bg-blue-600 text-xl shadow w-32 h-24 flex items-center justify-center";

      btn.addEventListener("click", () => {
        selectTable.classList.add("hidden");
        startScreen.classList.remove("hidden");
        selectedTableSpan.textContent = key;

        // Lưu tableId để blackout.js biết
        window.tableId = key;
        localStorage.setItem("tableId", key);

        startBtn.setAttribute("data-url", links[key]);
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

      // hiện nút ẩn
      showSecretButtons(true);
    });

    // ===== Popup mật khẩu =====
    const passwordPopup = document.getElementById("password-popup");
    const passwordInput = document.getElementById("password-input");
    const passwordOk = document.getElementById("password-ok");
    const passwordCancel = document.getElementById("password-cancel");
    const passwordError = document.getElementById("password-error");

    function openPasswordPopup(e) {
      passwordPopup.classList.remove("hidden");
      passwordInput.value = "";
      passwordError.classList.add("hidden");

      // ⚡ focus ngay trong sự kiện click cuối cùng
      passwordInput.focus();
    }
    function closePasswordPopup() {
      passwordPopup.classList.add("hidden");
    }

    passwordOk.addEventListener("click", () => {
      if (passwordInput.value === "6868") {
        closePasswordPopup();
        goToSelectTable();
      } else {
        passwordError.classList.remove("hidden");
      }
    });
    passwordCancel.addEventListener("click", closePasswordPopup);

    // ===== Logic quay lại =====
    const backBtnStart = document.getElementById("back-btn-start");
    const backBtnSelect = document.getElementById("back-btn-select");

    function goToStart() {
      posContainer.classList.add("hidden");
      posFrame.src = "about:blank";
      startScreen.classList.remove("hidden");

      showSecretButtons(true);
    }

    function goToSelectTable() {
      posContainer.classList.add("hidden");
      posFrame.src = "about:blank";
      startScreen.classList.add("hidden");
      selectTable.classList.remove("hidden");

      showSecretButtons(false);
    }

    function showSecretButtons(show) {
      if (show) {
        backBtnStart.style.display = "block";
        backBtnSelect.style.display = "block";
      } else {
        backBtnStart.style.display = "none";
        backBtnSelect.style.display = "none";
      }
    }

    // ===== Nhấn nhanh 10 lần trong 3s =====
    function setupSecretButton(btn, callback) {
      let count = 0;
      let timer = null;
      btn.addEventListener("click", (e) => {
        if (!timer) {
          timer = setTimeout(() => {
            count = 0;
            timer = null;
          }, 3000);
        }
        count++;
        if (count >= 10) {
          clearTimeout(timer);
          timer = null;
          count = 0;
          callback(e); // truyền event click cuối
        }
      });
    }

    setupSecretButton(backBtnStart, () => goToStart());
    setupSecretButton(backBtnSelect, (e) => openPasswordPopup(e));

    // khi load trang, chỉ hiển thị màn chọn bàn
    showSecretButtons(false);
  } catch (err) {
    console.error("Lỗi khi load links.json:", err);
  }
});
