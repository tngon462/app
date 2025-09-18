document.addEventListener("DOMContentLoaded", async () => {
  try {
    // ===== Load danh sách link bàn từ links.json =====
    const res = await fetch("./links.json");
    const data = await res.json();
    const links = data.links || data;

    const container = document.getElementById("table-container");

    // ===== Tạo nút cho từng bàn =====
    Object.keys(links).forEach((key) => {
      const btn = document.createElement("button");
      btn.textContent = "Bàn " + key;

      btn.className =
        "px-6 py-4 rounded-lg bg-blue-500 text-white font-bold " +
        "hover:bg-blue-600 text-2xl shadow w-32 h-24 flex items-center justify-center";

      btn.addEventListener("click", () => {
        document.getElementById("select-table").classList.add("hidden");
        document.getElementById("start-screen").classList.remove("hidden");
        document.getElementById("selected-table").textContent = key;

        // Lưu để blackout.js dùng
        window.tableId = key;
        localStorage.setItem("tableId", key);

        document
          .getElementById("start-order")
          .setAttribute("data-url", links[key]);
      });

      container.appendChild(btn);
    });

    // ===== Nút bắt đầu gọi món =====
    const startBtn = document.getElementById("start-order");
    startBtn.addEventListener("click", (e) => {
      const url = e.target.getAttribute("data-url");
      if (!url) return;

      document.getElementById("start-screen").classList.add("hidden");
      document.getElementById("pos-container").classList.remove("hidden");
      document.getElementById("pos-frame").src = url;
    });

    // ===== Hàm reset =====
    function resetToStart() {
      document.getElementById("pos-container").classList.add("hidden");
      document.getElementById("pos-frame").src = "about:blank";
      document.getElementById("start-screen").classList.remove("hidden");
    }
    window.resetToStart = resetToStart; // để blackout.js gọi được

    // ===== Popup mật khẩu =====
    function showPasswordPopup() {
      const popup = document.getElementById("password-popup");
      popup.classList.remove("hidden");

      const input = document.getElementById("password-input");
      input.value = "";
      document.getElementById("password-error").classList.add("hidden");

      // ⚡ focus ngay để bật bàn phím
      setTimeout(() => {
        input.focus();
      }, 50);
    }

    function hidePasswordPopup() {
      document.getElementById("password-popup").classList.add("hidden");
    }

    document.getElementById("password-ok").addEventListener("click", () => {
      const val = document.getElementById("password-input").value;
      if (val === "6868") {
        hidePasswordPopup();
        // về màn chọn bàn
        document.getElementById("pos-container").classList.add("hidden");
        document.getElementById("pos-frame").src = "about:blank";
        document.getElementById("start-screen").classList.add("hidden");
        document.getElementById("select-table").classList.remove("hidden");
        localStorage.removeItem("tableId");
      } else {
        document.getElementById("password-error").classList.remove("hidden");
      }
    });

    document
      .getElementById("password-cancel")
      .addEventListener("click", hidePasswordPopup);

    // ===== Nút bí mật (trái: reset start, phải: chọn bàn) =====
    function setupSecretBtn(btnId, action, requirePass = false) {
      const btn = document.getElementById(btnId);
      let count = 0;
      let timer = null;

      btn.addEventListener("click", () => {
        count++;
        if (!timer) {
          timer = setTimeout(() => {
            count = 0;
            timer = null;
          }, 3000); // 3 giây
        }
        if (count >= 10) {
          count = 0;
          clearTimeout(timer);
          timer = null;

          if (requirePass) {
            showPasswordPopup();
          } else {
            action();
          }
        }
      });
    }

    setupSecretBtn("back-btn-start", resetToStart, false);
    setupSecretBtn("back-btn-select", null, true);
  } catch (err) {
    console.error("Lỗi khi load links.json:", err);
  }
});
