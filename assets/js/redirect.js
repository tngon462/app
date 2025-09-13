document.addEventListener("DOMContentLoaded", async () => {
  try {
    // Load danh sách link bàn từ links.json
    const res = await fetch("./links.json");
    const links = await res.json();

    const container = document.getElementById("table-container");

    // Tạo nút cho từng bàn
    Object.keys(links).forEach((key) => {
      const btn = document.createElement("button");
      btn.textContent = "Bàn " + key;

      // Style theo Tailwind
      btn.className =
        "px-6 py-4 rounded-lg bg-blue-500 text-white font-bold hover:bg-blue-600 shadow text-2xl w-32 h-24 flex items-center justify-center";

      // Khi click → sang màn start screen
      btn.addEventListener("click", () => {
        document.getElementById("select-table").classList.add("hidden");
        document.getElementById("start-screen").classList.remove("hidden");
        document.getElementById("selected-table").textContent = key;

        // Lưu link & tableId
        localStorage.setItem("tableId", key);
        window.tableId = key;

        document
          .getElementById("start-order")
          .setAttribute("data-url", links[key]);

        // Phát sự kiện để blackout.js bắt được
        window.dispatchEvent(new Event("tableSelected"));
      });

      container.appendChild(btn);
    });

    // Nút bắt đầu gọi món
    const startBtn = document.getElementById("start-order");
    startBtn.addEventListener("click", (e) => {
      const url = e.target.getAttribute("data-url");
      if (!url) return;

      document.getElementById("start-screen").classList.add("hidden");
      document.getElementById("pos-container").classList.remove("hidden");
      document.getElementById("pos-frame").src = url;
    });

    // ===== Nút bí mật =====
    const backStartBtn = document.getElementById("back-btn-start");
    const backSelectBtn = document.getElementById("back-btn-select");

    // reset về start
    setupSecretButton(backStartBtn, () => {
      document.getElementById("pos-container").classList.add("hidden");
      document.getElementById("pos-frame").src = "about:blank";
      document.getElementById("start-screen").classList.remove("hidden");
    });

    // reset về chọn bàn (cần mật khẩu)
    setupSecretButton(backSelectBtn, () => {
      showPasswordPopup(() => {
        document.getElementById("pos-container").classList.add("hidden");
        document.getElementById("pos-frame").src = "about:blank";
        document.getElementById("start-screen").classList.add("hidden");
        document.getElementById("select-table").classList.remove("hidden");
        localStorage.removeItem("tableId");
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