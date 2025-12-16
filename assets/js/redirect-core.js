/**
 * assets/js/redirect-core.js (FINAL SAFE + AUTO-FIT + ANTI-OLD-LINK)
 * - Giữ 3 màn: #select-table, #start-screen, #pos-container
 * - Auto-fit grid
 * - Load links.json: GitHub raw (QR/main) + local + LS cache + fallback 1..N
 *
 * FIX trọng tâm:
 *  1) KHÔNG chặn theo thời gian (không block 1.5s/2.5s nữa) => tránh màn START bị trắng khi thao tác thủ công
 *  2) Chặn "link cũ" bằng allowlist:
 *      - gotoPos(url) chỉ được phép nếu url === LIVE mới nhất của bàn hiện tại
 *      - hoặc chưa có LIVE thì fallback bằng link từ links.json
 *      - mọi url khác => reject + console.trace để biết script nào gọi
 *  3) Đổi bàn / Home: luôn clear posLink + reset iframe
 *  4) Admin đổi bàn: nghe event 'tngon:tableChanged' => gotoStart()
 *  5) Không còn mất số bàn: luôn sync #selected-table từ tableId
 *  6) Reload thủ công: nếu có bàn => về START
 *
 * Expose:
 *   window.gotoSelect(keepState?)
 *   window.gotoStart(tableId)
 *   window.gotoPos(url, meta?)
 *   window.getLinkForTable(tableId)
 *   window.applyLinksMap(mapOrObj, source)
 *   window.setPosLink(url, source, tableId?)
 *   window.getCurrentTable()
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

  const REMOTE_URL = () =>
    `https://raw.githubusercontent.com/tngon462/QR/main/links.json?cb=${Date.now()}`;

  const LOCAL_URL = () => `./links.json?cb=${Date.now()}`;

  const REFRESH_MS = 60_000;

  const ACCEPT_URL = /^https?:\/\/order\.atpos\.net\//i;

  // Nếu sếp muốn strict hơn: LIVE quá cũ thì không tin (ms)
  const LIVE_TTL_MS = 10 * 60 * 1000; // 10 phút

  // ---------------------------
  // LocalStorage keys
  // ---------------------------
  const LS = {
    tableId: "tableId",
    appState: "appState", // select | start | pos

    // legacy/global (giữ tương thích)
    posLink: "posLink",

    // per-table LIVE
    liveUrlPrefix: "posLiveUrl:",
    liveAtPrefix: "posLiveAt:",

    linksCache: "linksCache",
    linksCacheAt: "linksCacheAt",
    linksCacheHash: "linksCacheHash",
  };

  const keyLiveUrl = (t) => LS.liveUrlPrefix + String(t);
  const keyLiveAt = (t) => LS.liveAtPrefix + String(t);

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
  // State (memory)
  // ---------------------------
  const state = {
    tableId: null,
    posLink: null,
    linksMap: null,
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
    if (elSelect) elSelect.classList.toggle("hidden", which !== "select");
    if (elStart) elStart.classList.toggle("hidden", which !== "start");
    if (elPos) elPos.classList.toggle("hidden", which !== "pos");
  }

  function reportStageSafe(stage, by) {
    try {
      if (typeof window.reportStage === "function") window.reportStage(stage, by);
    } catch (_) {}
  }

  function resetIframe() {
    try {
      if (iframe) iframe.src = "about:blank";
    } catch (_) {}
  }

  function clearPosLink(reason) {
    const t = state.tableId || getLS(LS.tableId, "");
    state.posLink = null;

    // clear legacy/global
    setLS(LS.posLink, null);

    // clear per-table live (rất quan trọng: đổi bàn không được dính live cũ)
    if (t) {
      setLS(keyLiveUrl(t), null);
      setLS(keyLiveAt(t), null);
    }

    resetIframe();
    if (reason) console.log("[redirect-core] clearPosLink:", reason);
  }

  function stableHashFromMap(map) {
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

  function now() {
    return Date.now();
  }

  function getCurrentTableId() {
    return state.tableId || getLS(LS.tableId, null);
  }

  function getLiveForTable(t) {
    if (!t) return { url: "", at: 0 };
    const url = getLS(keyLiveUrl(t), "") || "";
    const at = Number(getLS(keyLiveAt(t), "0")) || 0;
    return { url, at };
  }

  function isLiveFresh(at) {
    if (!at) return false;
    return now() - at <= LIVE_TTL_MS;
  }

  function isAllowedPosUrlForCurrentTable(u) {
    const t = getCurrentTableId();
    if (!t) return { ok: false, why: "no-table" };

    const { url: liveUrl, at: liveAt } = getLiveForTable(t);
    const mapUrl = window.getLinkForTable(t) || "";

    // ưu tiên tuyệt đối LIVE mới nhất (nếu có)
    if (liveUrl) {
      if (u === liveUrl) return { ok: true, why: "match-live" };
      return {
        ok: false,
        why: "stale-not-live",
        table: t,
        want: liveUrl,
        wantAt: liveAt,
        got: u,
      };
    }

    // chưa có LIVE -> cho phép fallback map
    if (mapUrl && u === mapUrl) return { ok: true, why: "match-map" };

    return {
      ok: false,
      why: "no-live-and-not-map",
      table: t,
      want: mapUrl || "(none)",
      got: u,
    };
  }

  // ---------------------------
  // AUTO-FIT GRID
  // ---------------------------
  function setAutoFitGrid() {
    if (!elTableBox) return;

    const w = Math.max(320, window.innerWidth || 0);
    let minCell = 160;
    if (w >= 768) minCell = 220;
    if (w >= 1024) minCell = 260;

    elTableBox.style.width = "min(1200px, 96vw)";
    elTableBox.style.marginLeft = "auto";
    elTableBox.style.marginRight = "auto";

    elTableBox.style.display = "grid";
    elTableBox.style.gridTemplateColumns = `repeat(auto-fit, minmax(${minCell}px, 1fr))`;
    elTableBox.style.alignItems = "stretch";
    elTableBox.style.justifyItems = "stretch";

    elTableBox.style.gap = "24px";
    elTableBox.style.paddingLeft = "16px";
    elTableBox.style.paddingRight = "16px";
  }

  // ---------------------------
  // Render tables
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
      "min-h-[clamp(90px,12vh,150px)]",
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

    keys.sort((a, b) => {
      const na = Number(a), nb = Number(b);
      const aNum = Number.isFinite(na), bNum = Number.isFinite(nb);
      if (aNum && bNum) return na - nb;
      return String(a).localeCompare(String(b));
    });

    renderTablesFromKeys(keys);
  }

  // ---------------------------
  // Navigation APIs
  // ---------------------------
  window.gotoSelect = function (keepState = false) {
    if (!keepState) {
      setLS(LS.appState, "select");
      clearPosLink("gotoSelect");
    }
    showScreen("select");
    reportStageSafe("select", "gotoSelect");
  };

  window.gotoStart = function (tableId) {
    const id = String(tableId || "").trim();
    if (!id) return;

    state.tableId = id;
    setLS(LS.tableId, id);
    setLS(LS.appState, "start");

    // đổi bàn => clear LIVE/posLink cũ + reset iframe
    clearPosLink("gotoStart(" + id + ")");

    // luôn hiện số bàn
    safeText(elSelectedTable, id);

    showScreen("start");
    reportStageSafe("start", "gotoStart");
  };

  // meta: {by:'manual'|'auto'|'unknown', source:'xxx'}
  window.gotoPos = function (url, meta = null) {
    const u = String(url || "").trim();
    if (!u) return;

    const check = isAllowedPosUrlForCurrentTable(u);
    if (!check.ok) {
      console.warn("[redirect-core] REJECT gotoPos (blocked old/wrong link)", check, meta);
      try {
        console.groupCollapsed("%c[TRACE] rejected gotoPos caller", "color:#ff4d4f;font-weight:bold");
        console.trace();
        console.groupEnd();
      } catch (_) {}
      return;
    }

    state.posLink = u;
    setLS(LS.posLink, u);
    setLS(LS.appState, "pos");

    const curTable = getCurrentTableId();
    if (curTable) safeText(elSelectedTable, curTable);

    showScreen("pos");
    reportStageSafe("pos", "gotoPos");

    if (iframe) {
      try { iframe.src = "about:blank"; } catch (_) {}
      setTimeout(() => {
        try { iframe.src = u; } catch (_) {}
      }, 30);
    }
  };

  // ---------------------------
  // Links APIs
  // ---------------------------
  window.getLinkForTable = function (tableId) {
    const id = String(tableId || "").trim();
    if (!id) return null;
    const map = state.linksMap;
    if (!map) return null;
    return map[id] || null;
  };

  window.getCurrentTable = function () {
    return getCurrentTableId();
  };

  // LIVE listener gọi: set link ngay (theo bàn)
  window.setPosLink = function (url, source = "LIVE", tableId = null) {
    const u = String(url || "").trim();
    if (!u) return;

    const t = String(tableId || getCurrentTableId() || "").trim();
    console.log("[redirect-core] setPosLink from", source, "table=", t || "(unknown)", u);

    // legacy/global (giữ tương thích)
    setLS(LS.posLink, u);

    // per-table live
    if (t) {
      setLS(keyLiveUrl(t), u);
      setLS(keyLiveAt(t), String(now()));
    }
  };

  window.applyLinksMap = function (mapOrObj, source = "unknown") {
    const norm = normalizeLinksMap(mapOrObj);
    if (!norm) {
      console.warn("[redirect-core] applyLinksMap: invalid/empty, ignore. source=", source);
      return false;
    }

    const newHash = stableHashFromMap(norm);
    if (newHash && state.linksHash === newHash) return true;

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
  // Load links.json (NO LOOP)
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
      const tableId = getCurrentTableId();
      if (!tableId) return;

      // ưu tiên: LIVE mới nhất của bàn
      const { url: liveUrl, at: liveAt } = getLiveForTable(tableId);
      if (liveUrl && isLiveFresh(liveAt)) {
        window.gotoPos(liveUrl, { by: "manual", source: "btnStart", why: "liveFresh" });
        return;
      }
      if (liveUrl) {
        // có live nhưng hơi cũ vẫn cho (tùy sếp). Nếu sếp muốn strict, đổi thành return;
        window.gotoPos(liveUrl, { by: "manual", source: "btnStart", why: "liveOldButUse" });
        return;
      }

      // fallback: links.json
      const url = window.getLinkForTable(tableId);
      if (url) window.gotoPos(url, { by: "manual", source: "btnStart", why: "mapFallback" });
      else console.warn("[redirect-core] No link for table", tableId);
    });
  }

  // ---------------------------
  // ADMIN: đổi bàn từ admin -> ăn ngay
  // ---------------------------
  window.addEventListener("tngon:tableChanged", (e) => {
    try {
      const t = String(
        (e && e.detail && (e.detail.value || e.detail.table)) || getLS(LS.tableId, "")
      ).trim();
      if (t) window.gotoStart(t);
    } catch (_) {}
  });

  // ---------------------------
  // BOOT
  // ---------------------------
  let _resizeTimer = null;
  function onResize() {
    if (_resizeTimer) clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(setAutoFitGrid, 120);
  }

  async function boot() {
    console.log("[redirect-core] boot...");

    setAutoFitGrid();
    window.addEventListener("resize", onResize, { passive: true });

    const map = await loadLinksOnce();
    if (map) renderTablesFromMap(map);
    else renderTablesFallback(DEFAULT_TABLE_COUNT);

    const tableId = getLS(LS.tableId, "");
    if (tableId) safeText(elSelectedTable, tableId);

    // Reload thủ công => luôn về START nếu đã có bàn
    if (tableId) {
      window.gotoStart(tableId);
    } else {
      window.gotoSelect(true);
    }

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
