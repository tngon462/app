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
      btn.className =
        "px-6 py-4 rounded-lg bg-blue-500 text-white font-bold hover:bg-blue-600 " +
        "text-2xl shadow w-32 h-24 flex items-center justify-center m-2";

      btn.addEventListener("click", () => {
        document.getElementById("select-table").classList.add("hidden");
        document.getElementById("start-screen").classList.remove("hidden");
        document.getElementById("selected-table").textContent = key;

        // Lưu số bàn cho blackout.js
        window.tableId = key;
        localStorage.setItem("tableId", key);
        window.dispatchEvent(new CustomEvent("tableSelected", { detail: key }));

        // Lưu link
        document
          .getElementById("start-order")
          .setAttribute("data-url", links[key]);
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

    // Nút bí mật → nhấn 7 lần trong 2.5s để quay lại
    const backBtn = document.getElementById("back-btn");
    let clicks = 0;
    let timer = null;
    backBtn.addEventListener("click", () => {
      clicks++;
      if (clicks === 1) {
        timer = setTimeout(() => { clicks = 0; }, 2500);
      }
      if (clicks >= 7) {
        clearTimeout(timer);
        clicks = 0;
        showPasswordPopup();
      }
    });

    // Popup mật mã
    const popup = document.getElementById("password-popup");
    const input = document.getElementById("password-input");
    const okBtn = document.getElementById("password-ok");
    const cancelBtn = document.getElementById("password-cancel");
    const errMsg = document.getElementById("password-error");

    function showPasswordPopup() {
      popup.classList.remove("hidden");
      input.value = "";
      errMsg.classList.add("hidden");
      input.focus();
    }

    okBtn.addEventListener("click", () => {
      if (input.value === "6868") {
        popup.classList.add("hidden");
        document.getElementById("pos-container").classList.add("hidden");
        document.getElementById("pos-frame").src = "about:blank";
        document.getElementById("start-screen").classList.add("hidden");
        document.getElementById("select-table").classList.remove("hidden");
      } else {
        errMsg.classList.remove("hidden");
      }
    });

    cancelBtn.addEventListener("click", () => {
      popup.classList.add("hidden");
    });
  } catch (err) {
    console.error("Lỗi khi load links.json:", err);
  }
});