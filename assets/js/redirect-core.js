// redirect-core.js — FINAL SAFE CORE
/**
 * assets/js/redirect-core.js (SAFE FULL)
 * - Giữ 3 màn: #select-table, #start-screen, #pos-container
 * - Load links.json từ GitHub (repo QR) + fallback local + fallback render 1..N
 * - Không được tạo vòng lặp đệ quy / stack overflow
 * - Expose:
 *    window.gotoSelect / gotoStart / gotoPos
 *    window.getLinkForTable(tableId)
 *    window.applyLinksMap(map, source)
 *    window.setPosLink(url, source)   // listener LIVE gọi vào đây
 *    window.getCurrentTable()
 */

(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const state = {
    tableId: null,
    posLink: null,
  const elSelect = $("select-table");
  const elStart = $("start-screen");
  const elPos = $("pos-container");
  const elTableBox = $("table-container");
  const elSelectedTable = $("selected-table");
  const iframe = $("pos-frame");
  const btnStart = $("start-order");

  // ---------------------------
  // CONFIG
  // ---------------------------
  const DEFAULT_TABLE_COUNT = 15;

  // GitHub RAW URL chuẩn
  // Lưu ý: URL cũ của sếp có lỗi "?cb" thiếu "=" và đường dẫn refs/heads không cần thiết
  const REMOTE_URL = () =>
    `https://raw.githubusercontent.com/tngon462/QR/main/links.json?cb=${Date.now()}`;

  const LOCAL_URL = () => `./links.json?cb=${Date.now()}`;

  // ---------------------------
  // STATE (localStorage)
  // ---------------------------
  const LS = {
    tableId: "tableId",
    posLink: "posLink",
    appState: "appState", // select | start | pos
    linksCache: "linksCache", // optional
    linksCacheAt: "linksCacheAt",
  };

  // ===============================
  // UI NAVIGATION
  // ===============================
  window.gotoSelect = function () {
    $("#select-table")?.classList.remove("hidden");
    $("#start-screen")?.classList.add("hidden");
    $("#pos-container")?.classList.add("hidden");
  function setState(k, v) {
    try {
      if (v === null || v === undefined) localStorage.removeItem(k);
      else localStorage.setItem(k, String(v));
    } catch (e) {}
  }
  function getState(k) {
    try {
      return localStorage.getItem(k);
    } catch (e) {
      return null;
    }
  }

  // ---------------------------
  // LINKS MAP
  // ---------------------------
  let LINKS_MAP = null;

  function normalizeLinksMap(data) {
    // hỗ trợ 2 shape:
    // 1) { updated_at, links: { "1": "...", ... } }
    // 2) { "1": "...", ... }
    const map = data && data.links && typeof data.links === "object" ? data.links : data;

    if (!map || typeof map !== "object" || Array.isArray(map)) return null;

    // lọc sạch: key phải là string/number, value là string url
    const out = {};
    for (const [k, v] of Object.entries(map)) {
      const key = String(k).trim();
      const val = typeof v === "string" ? v.trim() : "";
      if (!key) continue;
      if (!val) continue;
      // chỉ nhận link order.atpos.net để tránh rác
      if (!/^https?:\/\/order\.atpos\.net\//i.test(val)) continue;
      out[key] = val;
    }
    return Object.keys(out).length ? out : null;
  }

  async function fetchJson(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return await res.json();
  }

  // chống loop: loadLinks không được tự gọi applyLinksMap theo kiểu gây recursion
  let _isLoadingLinks = false;

  async function loadLinks() {
    if (_isLoadingLinks) return null;
    _isLoadingLinks = true;

    try {
      console.log("[redirect-core] 📡 Đang tải links.json từ repo QR...");
      const data = await fetchJson(REMOTE_URL());
      const map = normalizeLinksMap(data);
      if (!map) throw new Error("invalid links.json shape/empty");

      applyLinksMap(map, "QR_REPO");
      console.log("[redirect-core] ✅ Loaded links.json từ QR repo:", Object.keys(map).length, "bàn");
      return map;
    } catch (e1) {
      console.warn("[redirect-core] ⚠️ Không tải được online, thử bản local:", e1);

      try {
        const data2 = await fetchJson(LOCAL_URL());
        const map2 = normalizeLinksMap(data2);
        if (!map2) throw new Error("invalid local links.json shape/empty");

        applyLinksMap(map2, "LOCAL");
        console.log("[redirect-core] ✅ Loaded links.json local:", Object.keys(map2).length, "bàn");
        return map2;
      } catch (e2) {
        console.error("[redirect-core] ❌ loadLinks FAILED hoàn toàn:", e2);

        // thử cache trong localStorage (nếu có)
        try {
          const cached = getState(LS.linksCache);
          if (cached) {
            const obj = JSON.parse(cached);
            const map3 = normalizeLinksMap(obj);
            if (map3) {
              applyLinksMap(map3, "LS_CACHE");
              console.log("[redirect-core] ✅ Loaded links from LS cache:", Object.keys(map3).length, "bàn");
              return map3;
            }
          }
        } catch (e3) {}

        LINKS_MAP = null;
        window.LINKS_MAP = null;
        return null;
      }
    } finally {
      _isLoadingLinks = false;
    }
  }

  // Expose cho listener LIVE: apply map mới (không render lại nếu không cần)
  function applyLinksMap(map, source = "unknown") {
    const norm = normalizeLinksMap(map) || null;
    if (!norm) {
      console.warn("[redirect-core] applyLinksMap: map invalid/empty, ignore. source=", source);
      return false;
    }

    LINKS_MAP = norm;
    window.LINKS_MAP = norm;

    // cache lại để dự phòng
    try {
      setState(LS.linksCache, JSON.stringify({ links: norm }));
      setState(LS.linksCacheAt, Date.now());
    } catch (e) {}

    // Nếu đang ở màn chọn bàn: render lại list bàn theo map
    // (để khi QRMASTER tăng/giảm bàn cũng OK)
    const curState = getState(LS.appState) || "select";
    if (curState === "select") {
      renderTablesFromMap(norm);
    }

    console.log("[redirect-core] applyLinksMap OK from", source, "count=", Object.keys(norm).length);
    return true;
  }

  window.applyLinksMap = applyLinksMap;

  window.getLinkForTable = function (t) {
    if (!LINKS_MAP) return null;
    const key = String(t);
    return LINKS_MAP[key] || null;
  };

  // ---------------------------
  // UI NAV
  // ---------------------------
  window.gotoSelect = function (keepState = false) {
    if (!keepState) setState(LS.appState, "select");
    if (elSelect) elSelect.classList.remove("hidden");
    if (elStart) elStart.classList.add("hidden");
    if (elPos) elPos.classList.add("hidden");
  };

  window.gotoStart = function (tableId) {
    state.tableId = tableId;
    $("#selected-table").textContent = tableId;
    $("#select-table")?.classList.add("hidden");
    $("#start-screen")?.classList.remove("hidden");
    const id = String(tableId || getState(LS.tableId) || "").trim();
    if (!id) return;

    setState(LS.tableId, id);
    setState(LS.appState, "start");

    if (elSelectedTable) elSelectedTable.textContent = id;

    if (elSelect) elSelect.classList.add("hidden");
    if (elStart) elStart.classList.remove("hidden");
    if (elPos) elPos.classList.add("hidden");
  };

  window.gotoPos = function (url) {
    if (!url || typeof url !== "string") return;
    state.posLink = url;
    const u = url.trim();
    if (!u) return;

    $("#start-screen")?.classList.add("hidden");
    $("#pos-container")?.classList.remove("hidden");
    setState(LS.posLink, u);
    setState(LS.appState, "pos");

    const iframe = $("#pos-frame");
    if (iframe && iframe.src !== url) {
      iframe.src = url;
    }
  };
    if (elSelect) elSelect.classList.add("hidden");
    if (elStart) elStart.classList.add("hidden");
    if (elPos) elPos.classList.remove("hidden");

  // ===============================
  // API FOR LISTENERS
  // ===============================
  window.setPosLink = function (url, source = "unknown") {
    if (!url || url === state.posLink) return;
    console.log("[redirect-core] setPosLink from", source, url);
    gotoPos(url);
    if (iframe && iframe.src !== u) iframe.src = u;
  };

  window.getCurrentTable = function () {
    return state.tableId;
    return getState(LS.tableId);
  };

  // Listener LIVE gọi vào đây để ép link mới ngay
  window.setPosLink = function (url, source = "LIVE") {
    const u = (url || "").trim();
    if (!u) return;

    console.log("[redirect-core] setPosLink from", source, u);
    // cập nhật posLink trong LS để các module khác đọc được
    setState(LS.posLink, u);

    // nếu đang ở POS hoặc START thì cho nhảy thẳng vào POS luôn
    window.gotoPos(u);
  };

  // ===============================
  // ---------------------------
  // RENDER TABLES
  // ===============================
  function renderTables(count = 15) {
    const box = $("#table-container");
    if (!box) return;
  // ---------------------------
  function renderTablesFallback(n = DEFAULT_TABLE_COUNT) {
    if (!elTableBox) return;
    elTableBox.innerHTML = "";

    box.innerHTML = "";
    for (let i = 1; i <= count; i++) {
    for (let i = 1; i <= n; i++) {
      const btn = document.createElement("button");
      btn.textContent = i;
      btn.className =
        "rounded-xl bg-gray-100 text-gray-900 font-bold h-20 text-2xl hover:bg-blue-500 hover:text-white";
      btn.onclick = () => gotoStart(String(i));
      box.appendChild(btn);
      btn.onclick = () => window.gotoStart(String(i));
      elTableBox.appendChild(btn);
    }
  }

  // ===============================
  function renderTablesFromMap(map) {
    if (!elTableBox) return;
    elTableBox.innerHTML = "";

    const keys = Object.keys(map)
      .map((k) => String(k))
      .sort((a, b) => Number(a) - Number(b)); // nếu key là số

    // nếu map rác / key không phải số → vẫn render theo keys
    for (const k of keys) {
      const btn = document.createElement("button");
      btn.textContent = k;
      btn.className =
        "rounded-xl bg-gray-100 text-gray-900 font-bold h-20 text-2xl hover:bg-blue-500 hover:text-white";
      btn.onclick = () => window.gotoStart(k);
      elTableBox.appendChild(btn);
    }

    if (!keys.length) renderTablesFallback(DEFAULT_TABLE_COUNT);
  }

  // ---------------------------
  // START BUTTON
  // ---------------------------
  if (btnStart) {
    btnStart.addEventListener("click", () => {
      const tableId = getState(LS.tableId);
      if (!tableId) return;

      // ưu tiên: nếu listener LIVE đã set posLink trong LS thì dùng luôn
      const livePos = getState(LS.posLink);
      if (livePos) {
        window.gotoPos(livePos);
        return;
      }

      // fallback: lấy từ LINKS_MAP (links.json)
      const url = window.getLinkForTable(tableId);
      if (url) window.gotoPos(url);
      else console.warn("[redirect-core] No link for table", tableId);
    });
  }

  // ---------------------------
  // BOOT
  // ===============================
  document.addEventListener("DOMContentLoaded", () => {
    renderTables(15); // 🔁 đổi số bàn nếu cần
    gotoSelect();
  // ---------------------------
  (async function boot() {
    console.log("[redirect-core] boot...");

    // 1) Load links.json (nếu fail vẫn render fallback)
    const map = await loadLinks();
    if (map) renderTablesFromMap(map);
    else renderTablesFallback(DEFAULT_TABLE_COUNT);

    // 2) Restore state
    const appState = getState(LS.appState) || "select";
    const tableId = getState(LS.tableId);
    const posLink = getState(LS.posLink);

    if (appState === "pos" && posLink) {
      window.gotoPos(posLink);
    } else if (appState === "start" && tableId) {
      window.gotoStart(tableId);
    } else {
      window.gotoSelect();
    }

    // 3) refresh links.json mỗi 60s (dự phòng)
    setInterval(() => {
      loadLinks().catch(() => {});
    }, 60000);

    console.log("[redirect-core] boot OK");
  });
  })();
})();
