/**
 * assets/js/redirect-core.js (CLEAN SAFE + AUTO-FIT)
 * - Giữ 3 màn: #select-table, #start-screen, #pos-container
 * - Auto-fit grid: tự đổi số cột theo màn hình (PC/iPad/Phone)
 * - Nút bàn: "Bàn X" + tự co giãn kích thước
 * - Load links.json từ GitHub raw (repo QR/main) + fallback local + fallback LS cache + fallback 1..N
 * - Không loop / không override bừa
 * - Expose:
 *    window.gotoSelect(keepState?)
 *    window.gotoStart(tableId)
 *    window.gotoPos(url)
 *    window.getLinkForTable(tableId)
 *    window.applyLinksMap(mapOrObj, source)
 *    window.setPosLink(url, source)    // listener LIVE gọi vào đây
 *    window.getCurrentTable()
 */

(function () {
  "use strict";

  // ---------------------------
  // DOM
  // ---------------------------
  const $ = (id) => document.getElementById(id);

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

  // GitHub RAW links.json
  const REMOTE_URL = () =>
    `https://raw.githubusercontent.com/tngon462/QR/main/links.json?cb=${Date.now()}`;

  // Local fallback: đặt links.json cùng thư mục redirect.html (hoặc tùy layout của sếp)
  const LOCAL_URL = () => `./links.json?cb=${Date.now()}`;

  // Refresh interval (dự phòng)
  const REFRESH_MS = 60_000;

  // Chỉ nhận link order.atpos.net (lọc rác)
  const ACCEPT_URL = /^https?:\/\/order\.atpos\.net\//i;

  // ---------------------------
  // LocalStorage keys
  // ---------------------------
  const LS = {
    tableId: "tableId",
    posLink: "posLink",
    appState: "appState", // select | start | pos
    linksCache: "linksCache",
    linksCacheAt: "linksCacheAt",
    linksCacheHash: "linksCacheHash",
  };

  function setLS(k, v) {
    try {
      if (v === null || v === undefined || v === "") localStorage.removeItem(k);
      else localStorage.setItem(k, String(v));
    } catch (_) {}
  }
  function getLS(k, d = null) {
    try {
      const v = localStorage.getItem(k);
      return v === null ? d : v;
    } catch (_) {
      return d;
    }
  }

  // ---------------------------
  // State in-memory
  // ---------------------------
  const state = {
    tableId: null,
    posLink: null,
    linksMap: null, // { "1": "https://order.atpos.net/...", ... }
    linksHash: null,
  };

  // ---------------------------
  // Helpers
  // ---------------------------
  function safeText(el, text) {
    if (!el) return;
    el.textContent = text == null ? "" : String(text);
  }

  function showScreen(which) {
    // which: "select" | "start" | "pos"
    if (elSelect) elSelect.classList.toggle("hidden", which !== "select");
    if (elStart) elStart.classList.toggle("hidden", which !== "start");
    if (elPos) elPos.classList.toggle("hidden", which !== "pos");
  }

  function stableHashFromMap(map) {
    // hash đơn giản: stringify theo keys sort
    try {
      const keys = Object.keys(map || {}).sort((a, b) => {
        const na = Number(a), nb = Number(b);
        const aNum = Number.isFinite(na), bNum = Number.isFinite(nb);
        if (aNum && bNum) return na - nb;
        return String(a).localeCompare(String(b));
      });
      const obj = {};
      for (const k of keys) obj[k] = map[k];
      return JSON.stringify(obj);
    } catch (_) {
      return null;
    }
  }

  function normalizeLinksMap(data) {
    // hỗ trợ 2 shape:
    // 1) { updated_at, links: { "1": "...", ... } }
    // 2) { "1": "...", ... }
    const raw = data && data.links && typeof data.links === "object" ? data.links : data;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

    const out = {};
    for (const [k, v] of Object.entries(raw)) {
      const key = String(k).trim();
      const val = typeof v === "string" ? v.trim() : "";
      if (!key || !val) continue;
      if (!ACCEPT_URL.test(val)) continue;
      out[key] = val;
    }
    return Object.keys(out).length ? out : null;
  }

  async function fetchJson(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return await res.json();
  }

  // ---------------------------
  // AUTO-FIT GRID (100%)
  // ---------------------------
  function setAutoFitGrid() {
    if (!elTableBox) return;

    const w = Math.max(320, window.innerWidth || 0);

    // min ô theo màn hình
    let minCell = 160;   // phone
    if (w >= 768) minCell = 220;   // iPad
    if (w >= 1024) minCell = 260;  // PC

    // ép container nhìn giống ảnh, không kéo quá rộng
    elTableBox.style.width = "min(1200px, 96vw)";
    elTableBox.style.marginLeft = "auto";
    elTableBox.style.marginRight = "auto";

    // auto-fit
    elTableBox.style.display = "grid";
    elTableBox.style.gridTemplateColumns = `repeat(auto-fit, minmax(${minCell}px, 1fr))`;
    elTableBox.style.alignItems = "stretch";
    elTableBox.style.justifyItems = "stretch";

    // gap ưu tiên giống ảnh (nếu HTML đã có gap thì vẫn ok)
    // Nếu sếp muốn giữ đúng HTML thì comment 2 dòng dưới.
    elTableBox.style.gap = "24px";
    elTableBox.style.paddingLeft = "16px";
    elTableBox.style.paddingRight = "16px";
  }

  // ---------------------------
  // Render buttons (UI giống ảnh)
  // ---------------------------
  function makeTableButton(label) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = `Bàn ${String(label)}`;

    btn.className = [
      "w-full",
      "rounded-2xl",
      "bg-blue-600",
      "text-white",
      "font-extrabold",
      "shadow-lg",
      "hover:bg-blue-700",
      "active:scale-[0.99]",
      "transition",
      "select-none",
      "flex",
      "items-center",
      "justify-center",
      "px-4",
      // chiều cao tự co giãn: phone ~90px, tablet ~120px, pc ~150px
      "min-h-[clamp(90px,12vh,150px)]",
      // chữ tự co giãn
      "text-[clamp(18px,2.2vw,34px)]",
    ].join(" ");

    btn.addEventListener("click", () => window.gotoStart(String(label)));
    return btn;
  }

  function renderTablesFromKeys(keys) {
    if (!elTableBox) return;
    setAutoFitGrid();
    elTableBox.innerHTML = "";
    for (const k of keys) elTableBox.appendChild(makeTableButton(k));
  }

  function renderTablesFallback(n = DEFAULT_TABLE_COUNT) {
    const keys = [];
    for (let i = 1; i <= n; i++) keys.push(String(i));
    renderTablesFromKeys(keys);
  }

  function renderTablesFromMap(map) {
    const keys = Object.keys(map || {});
    if (!keys.length) return renderTablesFallback(DEFAULT_TABLE_COUNT);

    // sort numeric if possible
    keys.sort((a, b) => {
      const na = Number(a), nb = Number(b);
      const aNum = Number.isFinite(na), bNum = Number.isFinite(nb);
      if (aNum && bNum) return na - nb;
      return String(a).localeCompare(String(b));
    });

    renderTablesFromKeys(keys);
  }

  // ---------------------------
  // Public APIs: navigation
  // ---------------------------
  window.gotoSelect = function (keepState = false) {
    if (!keepState) setLS(LS.appState, "select");
    showScreen("select");
  };

  window.gotoStart = function (tableId) {
    const id = String(tableId || "").trim();
    if (!id) return;

    state.tableId = id;
    setLS(LS.tableId, id);
    setLS(LS.appState, "start");

    safeText(elSelectedTable, id);
    showScreen("start");
  };

  window.gotoPos = function (url) {
    const u = String(url || "").trim();
    if (!u) return;

    state.posLink = u;
    setLS(LS.posLink, u);
    setLS(LS.appState, "pos");

    showScreen("pos");

    if (iframe && iframe.src !== u) {
      iframe.src = u;
    }
  };

  // ---------------------------
  // Public APIs: links
  // ---------------------------
  window.getLinkForTable = function (tableId) {
    const id = String(tableId || "").trim();
    if (!id) return null;
    const map = state.linksMap;
    if (!map) return null;
    return map[id] || null;
  };

  window.getCurrentTable = function () {
    return state.tableId || getLS(LS.tableId, null);
  };

  // Listener LIVE gọi vào đây: set link ngay (không cần đợi links.json)
  window.setPosLink = function (url, source = "LIVE") {
    const u = String(url || "").trim();
    if (!u) return;

    const cur = state.posLink || getLS(LS.posLink, "");
    if (cur === u) return;

    console.log("[redirect-core] setPosLink from", source, u);

    setLS(LS.posLink, u);
    window.gotoPos(u);
  };

  // applyLinksMap: dùng cho listener live / module khác bơm map mới
  window.applyLinksMap = function (mapOrObj, source = "unknown") {
    const norm = normalizeLinksMap(mapOrObj);
    if (!norm) {
      console.warn("[redirect-core] applyLinksMap: invalid/empty, ignore. source=", source);
      return false;
    }

    const newHash = stableHashFromMap(norm);
    if (newHash && state.linksHash === newHash) {
      return true;
    }

    state.linksMap = norm;
    state.linksHash = newHash;

    try {
      setLS(LS.linksCache, JSON.stringify({ links: norm }));
      setLS(LS.linksCacheAt, Date.now());
      if (newHash) setLS(LS.linksCacheHash, newHash);
    } catch (_) {}

    const curState = getLS(LS.appState, "select");
    if (curState === "select") renderTablesFromMap(norm);

    console.log("[redirect-core] applyLinksMap OK from", source, "count=", Object.keys(norm).length);
    return true;
  };

  // ---------------------------
  // Load links.json with fallback (NO LOOP)
  // ---------------------------
  let isLoading = false;

  async function loadLinksOnce() {
    if (isLoading) return null;
    isLoading = true;

    try {
      // 1) remote
      try {
        const data = await fetchJson(REMOTE_URL());
        const map = normalizeLinksMap(data);
        if (!map) throw new Error("remote invalid/empty links.json");
        window.applyLinksMap(map, "QR_REMOTE");
        return map;
      } catch (e1) {
        console.warn("[redirect-core] remote fail -> try local", e1);
      }

      // 2) local
      try {
        const data2 = await fetchJson(LOCAL_URL());
        const map2 = normalizeLinksMap(data2);
        if (!map2) throw new Error("local invalid/empty links.json");
        window.applyLinksMap(map2, "LOCAL");
        return map2;
      } catch (e2) {
        console.warn("[redirect-core] local fail -> try LS cache", e2);
      }

      // 3) LS cache
      try {
        const cached = getLS(LS.linksCache, "");
        if (cached) {
          const obj = JSON.parse(cached);
          const map3 = normalizeLinksMap(obj);
          if (map3) {
            window.applyLinksMap(map3, "LS_CACHE");
            return map3;
          }
        }
      } catch (_) {}

      // 4) fallback
      state.linksMap = null;
      state.linksHash = null;
      return null;
    } finally {
      isLoading = false;
    }
  }

  // ---------------------------
  // START button
  // ---------------------------
  if (btnStart) {
    btnStart.addEventListener("click", () => {
      const tableId = getLS(LS.tableId, "");
      if (!tableId) return;

      // ưu tiên: posLink đã được LIVE set (localStorage)
      const livePos = getLS(LS.posLink, "");
      if (livePos) {
        window.gotoPos(livePos);
        return;
      }

      // fallback: lấy từ linksMap
      const url = window.getLinkForTable(tableId);
      if (url) window.gotoPos(url);
      else console.warn("[redirect-core] No link for table", tableId);
    });
  }

  // ---------------------------
  // BOOT
  // ---------------------------
  let _resizeTimer = null;
  function onResize() {
    if (_resizeTimer) clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(() => {
      setAutoFitGrid();
    }, 120);
  }

  async function boot() {
    console.log("[redirect-core] boot...");

    setAutoFitGrid();
    window.addEventListener("resize", onResize, { passive: true });

    // 1) load links (nếu fail vẫn render fallback)
    const map = await loadLinksOnce();
    if (map) renderTablesFromMap(map);
    else renderTablesFallback(DEFAULT_TABLE_COUNT);

    // 2) restore state
    const appState = getLS(LS.appState, "select");
    const tableId = getLS(LS.tableId, "");
    const posLink = getLS(LS.posLink, "");

    if (appState === "pos" && posLink) {
      window.gotoPos(posLink);
    } else if (appState === "start" && tableId) {
      window.gotoStart(tableId);
    } else {
      window.gotoSelect(true);
    }

    // 3) periodic refresh (chỉ apply nếu khác hash)
    setInterval(() => {
      loadLinksOnce().catch(() => {});
    }, REFRESH_MS);

    console.log("[redirect-core] boot OK");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
