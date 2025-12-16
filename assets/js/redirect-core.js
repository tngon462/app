/**
 * assets/js/redirect-core.js
 * FULL + SAFE + NO RACE
 *
 * Quy ước:
 *  - redirect-core: QUYỀN DUY NHẤT gotoPos
 *  - links-live: CHỈ set LIVE url
 *  - qrback: CHỈ gotoStart
 */

(function () {
  "use strict";

  /* ===================== DOM ===================== */
  const $ = (id) => document.getElementById(id);

  const elSelect = $("select-table");
  const elStart  = $("start-screen");
  const elPos    = $("pos-container");
  const elBox    = $("table-container");
  const elLabel  = $("selected-table");
  const iframe   = $("pos-frame");
  const btnStart = $("start-order");

  /* ===================== CONFIG ===================== */
  const DEFAULT_TABLE_COUNT = 15;
  const REFRESH_MS = 60_000;

  const REMOTE_URL = () =>
    `https://raw.githubusercontent.com/tngon462/QR/main/links.json?cb=${Date.now()}`;
  const LOCAL_URL = () => `./links.json?cb=${Date.now()}`;

  const ACCEPT_POS = /^https?:\/\/order\.atpos\.net\//i;
  const LIVE_TTL = 10 * 60 * 1000;

  /* ===================== STORAGE ===================== */
  const LS = {
    table: "tableId",
    state: "appState", // select | start | pos
    linksCache: "linksCache",
    liveUrlPrefix: "liveUrl:",
    liveAtPrefix:  "liveAt:",
  };

  const liveKey = (t) => LS.liveUrlPrefix + t;
  const liveAt  = (t) => LS.liveAtPrefix + t;

  const getLS = (k, d = null) => {
    try { return localStorage.getItem(k) ?? d; } catch { return d; }
  };
  const setLS = (k, v) => {
    try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {}
  };

  /* ===================== STATE ===================== */
  const state = {
    tableId: null,
    linksMap: null,
  };

  const now = () => Date.now();

  /* ===================== UI ===================== */
  function show(screen) {
    elSelect?.classList.toggle("hidden", screen !== "select");
    elStart ?.classList.toggle("hidden", screen !== "start");
    elPos   ?.classList.toggle("hidden", screen !== "pos");
  }

  function resetIframe() {
    if (iframe) iframe.src = "about:blank";
  }

  function setAutoFit() {
    if (!elBox) return;
    const w = window.innerWidth || 800;
    const min = w >= 1024 ? 260 : w >= 768 ? 220 : 160;
    elBox.style.display = "grid";
    elBox.style.gridTemplateColumns = `repeat(auto-fit,minmax(${min}px,1fr))`;
    elBox.style.gap = "24px";
  }

  /* ===================== TABLE RENDER ===================== */
  function makeBtn(t) {
    const b = document.createElement("button");
    b.textContent = `Bàn ${t}`;
    b.className =
      "rounded-2xl bg-blue-600 text-white font-extrabold text-2xl py-10 shadow";
    b.onclick = () => window.gotoStart(String(t));
    return b;
  }

  function renderTables(keys) {
    if (!elBox) return;
    elBox.innerHTML = "";
    setAutoFit();
    keys.forEach((k) => elBox.appendChild(makeBtn(k)));
  }

  function renderFallback(n = DEFAULT_TABLE_COUNT) {
    const keys = [];
    for (let i = 1; i <= n; i++) keys.push(String(i));
    renderTables(keys);
  }

  /* ===================== LINKS ===================== */
  function normalizeLinks(data) {
    const raw = data?.links ?? data;
    if (!raw || typeof raw !== "object") return null;

    const out = {};
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === "string" && ACCEPT_POS.test(v)) out[String(k)] = v;
    }
    return Object.keys(out).length ? out : null;
  }

  async function fetchLinks() {
    try {
      const r = await fetch(REMOTE_URL(), { cache: "no-store" });
      const j = await r.json();
      return normalizeLinks(j);
    } catch {}

    try {
      const r = await fetch(LOCAL_URL(), { cache: "no-store" });
      const j = await r.json();
      return normalizeLinks(j);
    } catch {}

    try {
      const c = getLS(LS.linksCache);
      if (c) return normalizeLinks(JSON.parse(c));
    } catch {}

    return null;
  }

  /* ===================== LIVE ===================== */
  function setLive(t, url) {
    setLS(liveKey(t), url);
    setLS(liveAt(t), String(now()));
  }

  function getLive(t) {
    return {
      url: getLS(liveKey(t), ""),
      at: Number(getLS(liveAt(t), "0")) || 0,
    };
  }

  function liveFresh(at) {
    return at && now() - at < LIVE_TTL;
  }

  function allowedPos(url) {
    if (!ACCEPT_POS.test(url)) return false;
    const t = state.tableId;
    if (!t) return false;
    const { url: live } = getLive(t);
    return live && url === live;
  }

  /* ===================== CORE API ===================== */
  window.gotoSelect = function () {
    setLS(LS.state, "select");
    resetIframe();
    show("select");
  };

  window.gotoStart = function (tableId) {
    const t = String(tableId || "").trim();
    if (!t) return;

    state.tableId = t;
    setLS(LS.table, t);
    setLS(LS.state, "start");

    elLabel && (elLabel.textContent = t);
    resetIframe();
    show("start");
  };

  window.gotoPos = function (url, meta) {
    const u = String(url || "").trim();
    if (!allowedPos(u)) {
      console.warn("[redirect-core] REJECT gotoPos", u, meta);
      console.trace();
      return;
    }

    setLS(LS.state, "pos");
    show("pos");
    resetIframe();
    setTimeout(() => iframe && (iframe.src = u), 30);
  };

  window.getLinkForTable = function (t) {
    return state.linksMap?.[String(t)] ?? null;
  };

  /* ===================== START BTN ===================== */
  btnStart?.addEventListener("click", () => {
    const t = state.tableId;
    if (!t) return;
    const { url, at } = getLive(t);
    if (url) window.gotoPos(url, { by: "btnStart", fresh: liveFresh(at) });
  });

  /* ===================== BOOT ===================== */
  async function boot() {
    console.log("[redirect-core] boot");

    const links = await fetchLinks();
    if (links) {
      state.linksMap = links;
      setLS(LS.linksCache, JSON.stringify({ links }));
      renderTables(Object.keys(links));
    } else {
      renderFallback();
    }

    const t = getLS(LS.table);
    if (t) window.gotoStart(t);
    else window.gotoSelect();

    setInterval(async () => {
      const l = await fetchLinks();
      if (l) state.linksMap = l;
    }, REFRESH_MS);
  }

  document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", boot, { once: true })
    : boot();
})();