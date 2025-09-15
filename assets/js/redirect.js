document.addEventListener("DOMContentLoaded", async () => {
  try {
    // Load links.json
    const res = await fetch("./links.json");
    const data = await res.json();
    const links = data.links || {};

    const container = document.getElementById("table-container");
    const selectTable = document.getElementById("select-table");
    const startScreen = document.getElementById("start-screen");
    const posContainer = document.getElementById("pos-container");
    const posFrame = document.getElementById("pos-frame");

    // Luôn reset về màn chọn bàn khi load
    localStorage.removeItem("tableId");
    window.tableId = null;
    selectTable.classList.remove("hidden");
    startScreen.classList.add("hidden");
    posContainer.classList.add("hidden");
    posFrame.src = "about:blank";

    // Tạo nút cho từng bàn
    Object.keys(links).forEach((key) => {
      const btn = document.createElement("button");
      btn.textContent = "Bàn " + key;

      btn.className =
        "px-6 py-4 rounded-lg bg-blue-500 text-white font-bold hover:bg-blue-600 shadow text-2xl w-32 h-24 flex items-center justify-center";

      btn.addEventListener("click", () => {
        selectTable.classList.add("hidden");
        startScreen.classList.remove("hidden");
        document.getElementById("selected-table").textContent = key;

        // Lưu tableId + link
        localStorage.setItem("tableId", key);
        window.tableId = key;
        document
          .getElementById("start-order")
          .setAttribute("data-url", links[key]);

        // Thông báo cho blackout.js
        window.dispatchEvent(new Event("tableSelected"));
      });

      container.appendChild(btn);
    });

    // Nút bắt đầu gọi món
    const startBtn = document.getElementById("start-order");
    startBtn.addEventListener("click", (e) => {
      const url = e.target.getAttribute("data-url");
      if (!url) return;

      startScreen.classList.add("hidden");
      posContainer.classList.remove("hidden");
      posFrame.src = url;
    });

    // ===== Nút bí mật =====
    const backStartBtn = document.getElementById("back-btn-start");
    const backSelectBtn = document.getElementById("back-btn-select");

    setupSecretButton(backStartBtn, () => {
      posContainer.classList.add("hidden");
      posFrame.src = "about:blank";
      startScreen.classList.remove("hidden");
    });

    setupSecretButton(backSelectBtn, () => {
      showPasswordPopup(() => {
        posContainer.classList.add("hidden");
        posFrame.src = "about:blank";
        startScreen.classList.add("hidden");
        selectTable.classList.remove("hidden");
        localStorage.removeItem("tableId");
        window.tableId = null;
      });
    });

    function setupSecretButton(btn, callback) {
      let clicks = [];
      btn.addEventListener("click", () => {
        const now = Date.now();
        clicks = clicks.filter((t) => now - t < 3000);
        clicks.push(now);
        if (clicks.length >= 10) {
          clicks = [];
          callback();
        }
      });
    }

    // Popup nhập mật mã
    function showPasswordPopup(onSuccess) {
      const popup = document.getElementById("password-popup");
      const input = document.getElementById("password-input");
      const ok = document.getElementById("password-ok");
      const cancel = document.getElementById("password-cancel");
      const error = document.getElementById("password-error");

      popup.classList.remove("hidden");
      input.value = "";
      error.classList.add("hidden");
      input.focus();

      function close() {
        popup.classList.add("hidden");
        ok.removeEventListener("click", okHandler);
        cancel.removeEventListener("click", cancelHandler);
      }

      function okHandler() {
        if (input.value === "6868") {
          close();
          onSuccess();
        } else {
          error.classList.remove("hidden");
        }
      }
      function cancelHandler() {
        close();
      }

      ok.addEventListener("click", okHandler);
      cancel.addEventListener("click", cancelHandler);
    }
  } catch (err) {
    console.error("Lỗi khi load links.json:", err);
  }
});