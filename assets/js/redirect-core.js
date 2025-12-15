// redirect-core.js — FINAL SAFE CORE
(function () {
  const $ = (id) => document.getElementById(id);

  const state = {
    tableId: null,
    posLink: null,
  };

  // ===============================
  // UI NAVIGATION
  // ===============================
  window.gotoSelect = function () {
    $("#select-table")?.classList.remove("hidden");
    $("#start-screen")?.classList.add("hidden");
    $("#pos-container")?.classList.add("hidden");
  };

  window.gotoStart = function (tableId) {
    state.tableId = tableId;
    $("#selected-table").textContent = tableId;
    $("#select-table")?.classList.add("hidden");
    $("#start-screen")?.classList.remove("hidden");
  };

  window.gotoPos = function (url) {
    if (!url || typeof url !== "string") return;
    state.posLink = url;

    $("#start-screen")?.classList.add("hidden");
    $("#pos-container")?.classList.remove("hidden");

    const iframe = $("#pos-frame");
    if (iframe && iframe.src !== url) {
      iframe.src = url;
    }
  };

  // ===============================
  // API FOR LISTENERS
  // ===============================
  window.setPosLink = function (url, source = "unknown") {
    if (!url || url === state.posLink) return;
    console.log("[redirect-core] setPosLink from", source, url);
    gotoPos(url);
  };

  window.getCurrentTable = function () {
    return state.tableId;
  };

  // ===============================
  // RENDER TABLES
  // ===============================
  function renderTables(count = 15) {
    const box = $("#table-container");
    if (!box) return;

    box.innerHTML = "";
    for (let i = 1; i <= count; i++) {
      const btn = document.createElement("button");
      btn.textContent = i;
      btn.className =
        "rounded-xl bg-gray-100 text-gray-900 font-bold h-20 text-2xl hover:bg-blue-500 hover:text-white";
      btn.onclick = () => gotoStart(String(i));
      box.appendChild(btn);
    }
  }

  // ===============================
  // BOOT
  // ===============================
  document.addEventListener("DOMContentLoaded", () => {
    renderTables(15); // 🔁 đổi số bàn nếu cần
    gotoSelect();
    console.log("[redirect-core] boot OK");
  });
})();
