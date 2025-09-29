document.addEventListener("DOMContentLoaded", async () => {
  try {
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
        window.tableId = key;
        localStorage.setItem("tableId", key);
      });

      tableContainer.appendChild(btn);
    });

    startBtn.addEventListener("click", (e) => {
      const url = e.target.getAttribute("data-url");
      if (!url) return;
      startScreen.classList.add("hidden");
      posContainer.classList.remove("hidden");
      posFrame.src = url;
    });

    // Popup mật mã
    const popup = document.getElementById("password-popup");
    const pwdInput = document.getElementById("password-input");
    const pwdOk = document.getElementById("password-ok");
    const pwdCancel = document.getElementById("password-cancel");
    const pwdError = document.getElementById("password-error");

    function showPasswordPopup(onSuccess) {
      popup.classList.remove("hidden");
      pwdInput.value = "";
      pwdError.classList.add("hidden");
      setTimeout(() => pwdInput.focus(), 100);

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

    setupSecretButton("back-btn-start", () => {
      posContainer.classList.add("hidden");
      posFrame.src = "about:blank";
      startScreen.classList.remove("hidden");
    });

    setupSecretButton("back-btn-select", () => {
      posContainer.classList.add("hidden");
      posFrame.src = "about:blank";
      startScreen.classList.add("hidden");
      selectTable.classList.remove("hidden");
      localStorage.removeItem("tableId");
    }, true);
  } catch (err) {
    console.error("Lỗi khi load links.json:", err);
  }
});