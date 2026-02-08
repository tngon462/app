// assets/js/secret-btn.js
// Mật khẩu đọc từ Firebase config/secretPassword (fallback "6868" khi offline)
(function () {
  const btn = document.getElementById("back-btn-start");
  if (!btn) return;

  let pressTimer = null;
  let visibleTimer = null;
  const HOLD_TIME = 3000;
  const SHOW_FEEDBACK = 1000;
  const FALLBACK_PASSWORD = "6868"; // chỉ dùng khi không đọc được Firebase

  const SHOW_STYLE = "rgba(255,255,255,0.2)";
  const HIDE_STYLE = "transparent";

  btn.addEventListener("touchstart", startHold, { passive: true });
  btn.addEventListener("mousedown", startHold);
  btn.addEventListener("touchend", cancelHold);
  btn.addEventListener("mouseup", cancelHold);
  btn.addEventListener("mouseleave", cancelHold);

  let count = 0, timer = null;
  btn.addEventListener("click", () => {
    if (!timer) {
      timer = setTimeout(() => { count = 0; timer = null; }, 3000);
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
    visibleTimer = setTimeout(() => { btn.style.background = SHOW_STYLE; }, SHOW_FEEDBACK);
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

  function goToStart() {
    const posContainer = document.getElementById("pos-container");
    const posFrame = document.getElementById("pos-frame");
    const startScreen = document.getElementById("start-screen");
    if (posContainer) posContainer.classList.add("hidden");
    if (posFrame) posFrame.src = "about:blank";
    if (startScreen) startScreen.classList.remove("hidden");
    localStorage.setItem("appState", "start");
  }

  async function getSecretPassword() {
    if (!window.firebase || !firebase.apps?.length) return FALLBACK_PASSWORD;
    try {
      const snap = await firebase.database().ref("config/secretPassword").once("value");
      const val = snap.val();
      return (val && String(val).trim()) ? String(val).trim() : FALLBACK_PASSWORD;
    } catch (_) {
      return FALLBACK_PASSWORD;
    }
  }

  function doGotoSelectTable() {
    document.getElementById("start-screen")?.classList.add("hidden");
    document.getElementById("pos-container")?.classList.add("hidden");
    const frame = document.getElementById("pos-frame");
    if (frame) frame.src = "about:blank";
    document.getElementById("select-table")?.classList.remove("hidden");
    localStorage.removeItem("tableId");
    localStorage.removeItem("tableUrl");
    localStorage.removeItem("appState");
    delete window.tableId;
    if (typeof window.gotoSelect === "function") window.gotoSelect(false);
  }

  async function showPasswordPopup() {
    const popup = document.getElementById("password-popup");
    const input = document.getElementById("password-input");
    const error = document.getElementById("password-error");
    if (!popup || !input) return;

    popup.classList.remove("hidden");
    input.value = "";
    error.classList.add("hidden");
    setTimeout(() => input.focus(), 100);

    const expectedPassword = await getSecretPassword();

    const checkAndProceed = () => {
      if (String(input.value).trim() === expectedPassword) {
        popup.classList.add("hidden");
        doGotoSelectTable();
      } else {
        error.classList.remove("hidden");
      }
    };

    document.getElementById("password-ok").onclick = checkAndProceed;
    document.getElementById("password-cancel").onclick = () => popup.classList.add("hidden");
  }
})();
