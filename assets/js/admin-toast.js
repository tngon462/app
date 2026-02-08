// assets/js/admin-toast.js - Toast thông báo & retry helper
(function () {
  "use strict";
  const ROOT = document.getElementById("modal-root") || document.body;

  async function withRetry(fn, maxRetries = 2) {
    let lastErr;
    for (let i = 0; i <= maxRetries; i++) {
      try {
        return await fn();
      } catch (e) {
        lastErr = e;
        if (i < maxRetries) await new Promise((r) => setTimeout(r, 500));
      }
    }
    throw lastErr;
  }

  function toast(msg, type = "info") {
    const el = document.createElement("div");
    const bg = type === "error" ? "bg-red-100 text-red-800 border-red-300" : type === "success" ? "bg-emerald-100 text-emerald-800 border-emerald-300" : "bg-blue-100 text-blue-800 border-blue-300";
    el.className = `fixed bottom-4 right-4 z-[10000] px-4 py-3 rounded-lg border shadow-lg text-sm font-medium ${bg} animate-fade-in`;
    el.textContent = msg;
    ROOT.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  }

  function showError(msg) { toast(msg, "error"); }
  function showSuccess(msg) { toast(msg, "success"); }

  window.adminToast = { toast, showError, showSuccess, withRetry };
})();
