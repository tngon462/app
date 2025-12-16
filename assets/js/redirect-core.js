/**
 * assets/js/redirect-core.js (FINAL - LIVE FIRST)
 * - 3 màn: #select-table, #start-screen, #pos-container
 * - ƯU TIÊN LINK LIVE từ QRMASTER (Firebase listener gọi window.setPosLink)
 * - GitHub links.json chỉ fallback
 * - Không loop / không reload bừa
 * - Expose:
 *    window.gotoSelect(keepState?)
 *    window.gotoStart(tableId?)
 *    window.gotoPos(url?, opts?)
 *    window.getLinkForTable(tableId)
 *    window.applyLinksMap(mapOrObj, source)
 *    window.setPosLink(url, source, tableId)
 *    window.getCurrentTable()
 *    window.getLinksMap()   // merged map: LIVE > JSON
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

  const log  = (...a) => console.log("[tngon][redirect-core]", ...a);
  const warn = (...a) => console.warn("[tngon][redirect-core]", ...a);

  // ---------------------------
  // LS helpers
  // ---------------------------
  const getLS = (k, d = null) => {
    try {
      const v = localStorage.getItem(k);
      return v == null ? d : v;
    } catch {
      return d;
    }
  };
  const setLS = (k, v) => {
    try { localStorage.setItem(k, String(v)); } catch {}
  };
  const delLS = (k) => {
    try { localStorage.removeItem(k); } catch {}
  };

  const LS_KEYS = {
    tableId: "tableId",
    tableUrl: "tableUrl",
    appState: "appState", // select | start | pos
    linksCache: "linksMapCache",
    linksCacheAt: "linksMapCacheAt",
  };

  // ---------------------------
  // URL accept
  // ---------------------------
  const ACCEPT_URL = /^https?:\/\/order\.atpos\.net\//i;

  // ---------------------------
  // In-memory maps
  // ---------------------------
  let LINKS_MAP = Object.create(null); // from GitHub links.json (fallback)
  let LIVE_MAP  = Object.create(null); // from Firebase QRMASTER (source of truth)

  // Per-table local cache key for LIVE url
  const liveKey = (t) => `livePosUrl:${t}`;

  // ---------------------------
  // State helpers
  // ---------------------------
  function getCurrentTable() {
    return String(getLS(LS_KEYS.tableId, "") || "").trim();
  }
  function getAppState() {
    return String(getLS(LS_KEYS.appState, "select") || "select").trim();
  }

  function setStage(stage, by) {
    const st = String(stage || "select").toLowerCase();
    setLS(LS_KEYS.appState, st);
    // report to admin if screen-state.js exists
    if (typeof window.reportStage === "function") {
      window.reportStage(st, by || "core");
    }
  }

  function showOnly(which) {
    // which: select | start | pos
    if (elSelect) elSelect.classList.toggle("hidden", which !== "select");
    if (elStart)  elStart.classList.toggle("hidden", which !== "start");
    if (elPos)    elPos.classList.toggle("hidden", which !== "pos");
  }

  // ---------------------------
  // Link resolution (LIVE FIRST)
  // ---------------------------
  function getLinkForTable(tableId) {
    const t = String(tableId || "").trim();
    if (!t) return "";

    // 1) LIVE in-memory
    if (LIVE_MAP && Object.prototype.hasOwnProperty.call(LIVE_MAP, t) && LIVE_MAP[t]) {
      return String(LIVE_MAP[t] || "").trim();
    }

    // 2) LIVE localStorage per table
    const cachedLive = String(getLS(liveKey(t), "") || "").trim();
    if (cachedLive) return cachedLive;

    // 3) JSON links map (GitHub)
    if (LINKS_MAP && Object.prototype.hasOwnProperty.call(LINKS_MAP, t) && LINKS_MAP[t]) {
      return String(LINKS_MAP[t] || "").trim();
    }

    // 4) last tableUrl (only useful when t === current)
    const cur = getCurrentTable();
    if (cur && cur === t) {
      const last = String(getLS(LS_KEYS.tableUrl, "") || "").trim();
      if (last) return last;
    }

    return "";
  }

  function mergedLinksMap() {
    // merged: LIVE overrides JSON
    const out = Object.create(null);
    try {
      for (const k in LINKS_MAP) out[k] = LINKS_MAP[k];
      for (const k in LIVE_MAP)  out[k] = LIVE_MAP[k];
    } catch {}
    return out;
  }

  // ---------------------------
  // Render table buttons
  // ---------------------------
  function normalizeTableKey(k) {
    // keep string but trim
    return String(k || "").trim();
  }

  function sortTableKeys(keys) {
    // numeric first
    return keys.sort((a, b) => {
      const na = Number(a), nb = Number(b);
      const ia = Number.isFinite(na) && String(na) === a;
      const ib = Number.isFinite(nb) && String(nb) === b;
      if (ia && ib) return na - nb;
      if (ia && !ib) return -1;
      if (!ia && ib) return 1;
      return a.localeCompare(b, "vi");
    });
  }

  function getKnownTables() {
    const keys = new Set();

    // JSON
    if (LINKS_MAP) {
      for (const k in LINKS_MAP) keys.add(normalizeTableKey(k));
    }
    // LIVE
    if (LIVE_MAP) {
      for (const k in LIVE_MAP) keys.add(normalizeTableKey(k));
    }

    // fallback 1..15 if empty
    if (keys.size === 0) {
      for (let i = 1; i <= 15; i++) keys.add(String(i));
    }

    const arr = Array.from(keys).filter(Boolean);
    return sortTableKeys(arr);
  }

  function renderTables() {
    if (!elTableBox) return;

    const tables = getKnownTables();
    elTableBox.innerHTML = "";

    tables.forEach((t) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = t;

      // giữ style tailwind đang dùng (tự co giãn theo grid)
      btn.className =
        "rounded-2xl bg-white shadow-lg border border-gray-200 " +
        "font-extrabold text-gray-900 " +
        "flex items-center justify-center " +
        "aspect-square " +
        "text-[clamp(18px,4.5vw,48px)] " +
        "hover:bg-blue-50 active:scale-[0.98]";

      btn.addEventListener("click", () => {
        gotoStart(t);
      });

      elTableBox.appendChild(btn);
    });

    log("render tables", tables);
  }

  // ---------------------------
  // Public navigation APIs
  // ---------------------------
  function gotoSelect(keepState) {
    showOnly("select");
    if (!keepState) {
      setStage("select", "gotoSelect");
    }
  }

  function gotoStart(tableId) {
    const t = String(tableId || getCurrentTable() || "").trim();

    if (t) {
      const old = getCurrentTable();
      if (old !== t) {
        setLS(LS_KEYS.tableId, t);
        // nếu có link thì cập nhật tableUrl (ưu tiên LIVE)
        const u = getLinkForTable(t);
        if (u) setLS(LS_KEYS.tableUrl, u);
        // báo cho screen-state/admin
        try { window.dispatchEvent(new CustomEvent("tngon:tableChanged", { detail: { from: old, to: t } })); } catch {}
      }
    }

    const cur = getCurrentTable();
    if (elSelectedTable) elSelectedTable.textContent = cur ? cur : "";

    showOnly("start");
    setStage("start", "gotoStart");

    log("gotoStart", cur);
  }

  function gotoPos(url, opts) {
    const curTable = getCurrentTable();
    let u = String(url || "").trim();

    if (!u && curTable) {
      u = getLinkForTable(curTable);
    }

    if (!u) {
      warn("gotoPos: empty url", { curTable, opts });
      // Không có link -> quay về start để tránh màn trắng
      gotoStart(curTable || undefined);
      return;
    }

    if (!ACCEPT_URL.test(u)) {
      warn("gotoPos: blocked non-atpos url", u);
      gotoStart(curTable || undefined);
      return;
    }

    // update last-known url for current table
    if (curTable) setLS(LS_KEYS.tableUrl, u);

    // set iframe src if changed
    try {
      if (iframe && iframe.src !== u) {
        iframe.src = u;
      }
    } catch (e) {
      warn("iframe set src failed", e);
    }

    showOnly("pos");
    setStage("pos", (opts && opts.by) ? String(opts.by) : "gotoPos");

    log("gotoPos", { table: curTable, url: u, opts });
  }

  // ---------------------------
  // Map setters (called by listeners)
  // ---------------------------
  function applyLinksMap(mapOrObj, source) {
    const src = source || "unknown";
    const m = mapOrObj && (mapOrObj.links || mapOrObj);

    if (!m || typeof m !== "object") {
      warn("applyLinksMap: invalid map", { src, mapOrObj });
      return;
    }

    const next = Object.create(null);
    for (const k in m) {
      const t = normalizeTableKey(k);
      const u = String(m[k] || "").trim();
      if (!t || !u) continue;
      // JSON map vẫn chỉ nhận atpos thôi cho sạch
      if (!ACCEPT_URL.test(u)) continue;
      next[t] = u;
    }

    LINKS_MAP = next;

    // cache local
    try {
      setLS(LS_KEYS.linksCache, JSON.stringify(LINKS_MAP));
      setLS(LS_KEYS.linksCacheAt, String(Date.now()));
    } catch {}

    renderTables();
    log("applyLinksMap OK", { src, count: Object.keys(LINKS_MAP).length });
  }

  function setPosLink(url, source, tableId) {
    const src = source || "unknown";
    const t = String(tableId || getCurrentTable() || "").trim();
    const u = String(url || "").trim();

    if (!t || !u) return;
    if (!ACCEPT_URL.test(u)) return warn("setPosLink: ignore non-atpos", { t, u, src });

    // update LIVE map + per-table cache
    LIVE_MAP[t] = u;
    setLS(liveKey(t), u);

    // nếu đúng bàn đang chọn -> cập nhật tableUrl
    const cur = getCurrentTable();
    if (cur && cur === t) {
      setLS(LS_KEYS.tableUrl, u);
    }

    // render lại bảng (để nếu LIVE tạo thêm key thì hiện)
    renderTables();

    log("setPosLink", { table: t, url: u, src });
  }

  // ---------------------------
  // Load links.json from GitHub (fallback only)
  // ---------------------------
  async function fetchWithTimeout(url, ms) {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), ms);
    try {
      const r = await fetch(url, { cache: "no-store", signal: ctrl.signal });
      clearTimeout(to);
      return r;
    } catch (e) {
      clearTimeout(to);
      throw e;
    }
  }

  async function loadLinksJson() {
    // NOTE: đổi đúng repo của sếp nếu khác
    const REMOTES = [
      "https://raw.githubusercontent.com/tngon462/QR/main/links.json",
      "https://raw.githubusercontent.com/tngon462/app/main/links.json",
    ];

    // 1) try remote
    for (const url of REMOTES) {
      try {
        const r = await fetchWithTimeout(url, 4500);
        if (!r.ok) throw new Error("HTTP " + r.status);
        const j = await r.json();
        applyLinksMap(j, "github-raw");
        return;
      } catch (e) {
        warn("remote links.json failed", url, e?.message || e);
      }
    }

    // 2) try local ./links.json
    try {
      const r = await fetchWithTimeout("./links.json", 2500);
      if (r.ok) {
        const j = await r.json();
        applyLinksMap(j, "local-links.json");
        return;
      }
    } catch {}

    // 3) try cache
    try {
      const s = getLS(LS_KEYS.linksCache, "");
      if (s) {
        const j = JSON.parse(s);
        applyLinksMap(j, "ls-cache");
        return;
      }
    } catch {}

    // 4) fallback render 1..N
    renderTables();
    log("loadLinksJson fallback: render 1..15");
  }

  // ---------------------------
  // Hook UI
  // ---------------------------
  function hookUI() {
    if (btnStart) {
      btnStart.addEventListener("click", () => {
        const t = getCurrentTable();
        const u = t ? getLinkForTable(t) : "";
        gotoPos(u, { by: "start-order" });
      });
    }
  }

  // ---------------------------
  // Boot
  // ---------------------------
  function boot() {
    // expose public APIs
    window.gotoSelect = gotoSelect;
    window.gotoStart = gotoStart;
    window.gotoPos = gotoPos;
    window.getLinkForTable = getLinkForTable;
    window.applyLinksMap = applyLinksMap;
    window.setPosLink = setPosLink;
    window.getCurrentTable = getCurrentTable;
    window.getLinksMap = () => mergedLinksMap();

    // Compatibility for bind-commands.js (nếu có TNGON)
    try {
      window.TNGON = window.TNGON || {};
      if (!window.TNGON.gotoStart) window.TNGON.gotoStart = () => gotoStart(getCurrentTable() || undefined);
      if (!window.TNGON.getLinksMap) window.TNGON.getLinksMap = () => mergedLinksMap();
    } catch {}

    hookUI();
    loadLinksJson(); // fallback-only map

    // restore state
    const st = getAppState();
    const t = getCurrentTable();

    if (st === "pos") {
      // nếu reload mà đang pos, cố vào lại link cho đúng bàn
      gotoPos(getLinkForTable(t), { by: "boot-restore" });
    } else if (st === "start") {
      gotoStart(t || undefined);
    } else {
      // default: nếu đã có tableId thì vào start luôn cho nhanh, không bắt chọn lại
      if (t) gotoStart(t);
      else gotoSelect();
    }

    log("boot", { table: t, state: st });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
