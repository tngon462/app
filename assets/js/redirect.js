document.addEventListener("DOMContentLoaded", async () => {
  try {
    // Load danh sách link bàn từ links.json
    const res = await fetch("./links.json");
    const links = await res.json();
    const container = document.getElementById("table-container");

    // ===== Tạo nút cho từng bàn =====
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

    // ===== Nút bắt đầu gọi món =====
    const startBtn = document.getElementById("start-order");
    startBtn.addEventListener("click", (e) => {
      const url = e.target.getAttribute("data-url");
      if (!url) return;

      document.getElementById("start-screen").classList.add("hidden");
      document.getElementById("pos-container").classList.remove("hidden");
      document.getElementById("pos-frame").src = url;
    });

    // ===== Nút bí mật bên trái (10 lần/3s → về màn bắt đầu) =====
    const secretLeft = document.getElementById("secret-left");
    let leftClicks = 0;
    let leftTimer = null;

    secretLeft.addEventListener("click", () => {
      leftClicks++;
      if (leftClicks === 1) {
        leftTimer = setTimeout(() => { leftClicks = 0; }, 3000);
      }
      if (leftClicks >= 10) {
        clearTimeout(leftTimer);
        leftClicks = 0;
        // Về màn bắt đầu
        document.getElementById("pos-container").classList.add("hidden");
        document.getElementById("pos-frame").src = "about:blank";
        document.getElementById("start-screen").classList.remove("hidden");
      }
    });

    // ===== Nút bí mật bên phải (10 lần/3s → nhập mật mã → về chọn bàn) =====
    const secretRight = document.getElementById("secret-right");
    let rightClicks = 0;
    let rightTimer = null;

    secretRight.addEventListener("click", () => {
      rightClicks++;
      if (rightClicks === 1) {
        rightTimer = setTimeout(() => { rightClicks = 0; }, 3000);
      }
      if (rightClicks >= 10) {
        clearTimeout(rightTimer);
        rightClicks = 0;
        showPasswordPopup("backToSelect");
      }
    });

    // ===== Popup mật mã =====
    const popup = document.getElementById("password-popup");
    const input = document.getElementById("password-input");
    const okBtn = document.getElementById("password-ok");
    const cancelBtn = document.getElementById("password-cancel");
    const errMsg = document.getElementById("password-error");

    let popupMode = null; // "backToSelect"

    function showPasswordPopup(mode) {
      popupMode = mode;
      popup.classList.remove("hidden");
      input.value = "";
      errMsg.classList.add("hidden");
      input.focus();
    }

    okBtn.addEventListener("click", () => {
      if (input.value === "6868") {
        popup.classList.add("hidden");
        if (popupMode === "backToSelect") {
          document.getElementById("pos-container").classList.add("hidden");
          document.getElementById("pos-frame").src = "about:blank";
          document.getElementById("start-screen").classList.add("hidden");
          document.getElementById("select-table").classList.remove("hidden");
        }
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