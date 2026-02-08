// assets/js/admin-auth.js
// Bảo vệ admin: đọc mật khẩu từ Firebase config/adminPassword
(function () {
  "use strict";
  const SESSION_KEY = "tngon_admin_auth";

  function showGate() {
    const overlay = document.getElementById("admin-auth-gate");
    const main = document.getElementById("admin-main");
    if (overlay) overlay.classList.remove("hidden");
    if (main) main.classList.add("hidden");
  }

  function hideGate() {
    const overlay = document.getElementById("admin-auth-gate");
    const main = document.getElementById("admin-main");
    if (overlay) overlay.classList.add("hidden");
    if (main) main.classList.remove("hidden");
  }

  async function checkPassword(inputVal) {
    if (!window.firebase || !firebase.apps?.length) return false;
    try {
      const snap = await firebase.database().ref("config/adminPassword").once("value");
      const expected = snap.val();
      return expected && String(inputVal).trim() === String(expected).trim();
    } catch (_) {
      return false;
    }
  }

  function boot() {
    if (sessionStorage.getItem(SESSION_KEY) === "1") {
      hideGate();
      return;
    }

    const gate = document.getElementById("admin-auth-gate");
    const input = document.getElementById("admin-auth-input");
    const err = document.getElementById("admin-auth-error");
    const btn = document.getElementById("admin-auth-btn");

    if (!gate || !input || !btn) return;
    showGate();

    btn.onclick = async () => {
      if (!input.value.trim()) {
        if (err) { err.textContent = "Vui lòng nhập mật khẩu."; err.classList.remove("hidden"); }
        return;
      }
      btn.disabled = true;
      const ok = await checkPassword(input.value);
      if (ok) {
        sessionStorage.setItem(SESSION_KEY, "1");
        hideGate();
      } else {
        if (err) { err.textContent = "Sai mật khẩu."; err.classList.remove("hidden"); }
      }
      btn.disabled = false;
    };

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") btn.click();
    });
    setTimeout(() => input.focus(), 100);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
