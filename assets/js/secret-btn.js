// assets/js/secret-btn.js
(function () {
  const btn = document.getElementById("back-btn-start");
  if (!btn) return;

  let pressTimer = null;
  let visibleTimer = null;
  const HOLD_TIME = 3000; // 4s để mở mật khẩu
  const SHOW_FEEDBACK = 1000; // 1s để hiện nút mờ

  // CSS feedback (mờ)
  const SHOW_STYLE = "rgba(255,255,255,0.2)";
  const HIDE_STYLE = "transparent";

  // === Sự kiện giữ nút ===
  btn.addEventListener("touchstart", startHold, { passive: true });
  btn.addEventListener("mousedown", startHold);
  btn.addEventListener("touchend", cancelHold);
  btn.addEventListener("mouseup", cancelHold);
  btn.addEventListener("mouseleave", cancelHold);

  // === Click nhanh: 5 lần / 3s => về màn bắt đầu ===
  let count = 0, timer = null;
  btn.addEventListener("click", () => {
    if (!timer) {
      timer = setTimeout(() => {
        count = 0;
        timer = null;
      }, 3000);
    }
    count++;
    if (count >= 5) {
      clearTimeout(timer);
      timer = null;
      count = 0;
      goToStart();
    }
  });

  function startHold() {
    // Sau 1s hiện nút mờ
    visibleTimer = setTimeout(() => {
      btn.style.background = SHOW_STYLE;
    }, SHOW_FEEDBACK);

    // Sau 4s hiển thị mật khẩu
    pressTimer = setTimeout(() => {
      btn.style.background = HIDE_STYLE;
      showPasswordPopup();
    }, HOLD_TIME);
  }

  function cancelHold() {
    clearTimeout(pressTimer);
    clearTimeout(visibleTimer);
    btn.style.background = HIDE_STYLE;
  }

  // --- Chức năng: về màn bắt đầu ---
  function goToStart() {
    const posContainer = document.getElementById("pos-container");
    const posFrame = document.getElementById("pos-frame");
    const startScreen = document.getElementById("start-screen");
    if (posContainer) posContainer.classList.add("hidden");
    if (posFrame) posFrame.src = "about:blank";
    if (startScreen) startScreen.classList.remove("hidden");
    localStorage.setItem("appState", "start");
  }

  // --- Chức năng: hiển thị popup mật khẩu ---
  function showPasswordPopup() {
    const popup = document.getElementById("password-popup");
    const input = document.getElementById("password-input");
    const error = document.getElementById("password-error");
    if (!popup || !input) return;

    popup.classList.remove("hidden");
    input.value = "";
    error.classList.add("hidden");
    setTimeout(() => input.focus(), 100);

    document.getElementById("password-ok").onclick = () => {
      if (input.value === "6868") {
        popup.classList.add("hidden");

        // về màn chọn bàn
        document.getElementById("start-screen")?.classList.add("hidden");
        document.getElementById("pos-container")?.classList.add("hidden");
        const frame = document.getElementById("pos-frame");
        if (frame) frame.src = "about:blank";
        document.getElementById("select-table")?.classList.remove("hidden");

        localStorage.removeItem("tableId");
        localStorage.removeItem("tableUrl");
        localStorage.removeItem("appState");
        delete window.tableId;
      } else {
        error.classList.remove("hidden");
      }
    };

    document.getElementById("password-cancel").onclick = () => {
      popup.classList.add("hidden");
    };
  }
})();
