/**
 * assets/js/redirect-core.js (CLEAN SAFE)
 * - Giữ 3 màn: #select-table, #start-screen, #pos-container
 * - Render nút bàn vào #table-container (UI giữ nguyên theo HTML/CSS hiện tại)
 * - Load links.json từ GitHub raw (repo QR/main) + fallback local + fallback LS cache + fallback 1..N
 * - Không đệ quy / không loop / không override hàm lung tung
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
  // Render buttons (UI giữ nguyên)
  // ---------------------------
  function makeTableButton(label) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = String(label);

    // Giữ style giống bản trước (không đụng UI)
    // Nếu sếp muốn auto-size mạnh hơn thì chỉnh tại đây, nhưng hiện tại giữ ổn định.
    btn.className =
      "rounded-xl bg-gray-100 text-gray-900 font-bold hover:bg-blue-500 hover:text-white " +
      "h-20 text-2xl";

    btn.addEventListener("click", () => window.gotoStart(String(label)));
    return btn;
  }

  function renderTablesFromKeys(keys) {
    if (!elTableBox) return;
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
    // ưu tiên state, fallback LS
    return state.tableId || getLS(LS.tableId, null);
  };

  // Listener LIVE gọi vào đây: set link ngay (không cần đợi links.json)
  window.setPosLink = function (url, source = "LIVE") {
    const u = String(url || "").trim();
    if (!u) return;

    // tránh spam cùng 1 link
    const cur = state.posLink || getLS(LS.posLink, "");
    if (cur === u) return;

    console.log("[redirect-core] setPosLink from", source, u);

    // lưu + nhảy POS
    setLS(LS.posLink, u);

    // nếu đã chọn bàn rồi hoặc đang ở start/pos thì nhảy luôn
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
      // không đổi -> khỏi render lại
      return true;
    }

    state.linksMap = norm;
    state.linksHash = newHash;

    // cache LS để dự phòng
    try {
      setLS(LS.linksCache, JSON.stringify({ links: norm }));
      setLS(LS.linksCacheAt, Date.now());
      if (newHash) setLS(LS.linksCacheHash, newHash);
    } catch (_) {}

    // chỉ render lại list bàn khi đang ở màn chọn bàn
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
  // START button (giữ logic như HTML)
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
  async function boot() {
    console.log("[redirect-core] boot...");

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
