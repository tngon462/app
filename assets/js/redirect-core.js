/**
 * assets/js/redirect-core.js (FINAL SAFE + AUTO-FIT + AD... mất số bàn: luôn sync #selected-table từ tableId
 * - Expose:
 *    window.gotoSelect(keepState?)
 *    window.gotoStart(tableId, keepPosLink?)
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
  // IFRAME GUARD (chặn bị script khác set về link cũ)
  // ---------------------------
  function guardIframeSrc() {
    if (!iframe) return;
    const curState = getLS(LS.appState, "select");
    const wanted = getLS(LS.posLink, "") || state.posLink || "";

    const curSrc = (() => {
      try {
        return iframe.getAttribute("src") || iframe.src || "";
      } catch (_) {
        return "";
      }
    })();

    // Nếu đang ở START/SELECT -> luôn ép about:blank
    if (curState !== "pos") {
      if (curSrc && curSrc !== "about:blank") {
        try {
          iframe.src = "about:blank";
        } catch (_) {}
      }
      return;
    }

    // Nếu đang ở POS -> chỉ cho phép src = wanted (link mới nhất)
    if (wanted && curSrc && curSrc !== wanted) {
      // nếu ai đó set về link cũ -> sửa lại
      try {
        iframe.src = wanted;
      } catch (_) {}
    }
  }

  // theo dõi mọi thay đổi src
  if (iframe) {
    try {
      const mo = new MutationObserver(() => guardIframeSrc());
      mo.observe(iframe, { attributes: true, attributeFilter: ["src"] });
    } catch (_) {}
    setInterval(guardIframeSrc, 800);
  }

  // ---------------------------
  // CONFIG
  // ---------------------------
  const DEFAULT_TABLE_COUNT = 15;

  const REMOTE_URL = () =>
    `https://raw.githubusercontent.com/tngon462/QR/main/links.json?cb=${Date.now()}`;

  const LOCAL_URL = () => `./links.json?cb=${Date.now()}`;

  const REFRESH_MS = 60_000;

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
  // State
  // ---------------------------
  const state = {
    tableId: null,
    posLink: null,
    linksMap: null,
    linksHash: null,
    lastGotoStartAt: 0,
  };

  // ---------------------------
  // Utils
  // ---------------------------
  function safeText(el, txt) {
    if (!el) return;
    el.textContent = String(txt ?? "");
  }

  function showScreen(name) {
    if (!elSelect || !elStart || !elPos) return;
    elSelect.style.display = name === "select" ? "block" : "none";
    elStart.style.display = name === "start" ? "block" : "none";
    elPos.style.display = name === "pos" ? "block" : "none";
    setLS(LS.appState, name);
  }

  function resetIframe() {
    if (!iframe) return;
    try {
      iframe.src = "about:blank";
    } catch (_) {}
  }

  function clearPosLink(reason, clearStored = true) {
    state.posLink = null;
    if (clearStored) setLS(LS.posLink, null);
    resetIframe();
    if (reason) console.log("[redirect-core] clearPosLink:", reason);
  }

  function stableHashFromMap(map) {
    try {
      const keys = Object.keys(map || {}).sort((a, b) => {
        const na = Number(a),
          nb = Number(b);
        const aNum = Number.isFinite(na),
          bNum = Number.isFinite(nb);
        if (aNum && bNum) return na - nb;
        return String(a).localeCompare(String(b));
      });
      let s = "";
      for (const k of keys) s += `${k}=${String(map[k] || "")}|`;
      // hash nhẹ
      let h = 0;
      for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
      return String(h);
    } catch (_) {
      return "";
    }
  }

  function normalizeLinksMap(mapOrObj) {
    if (!mapOrObj) return null;
    let obj = mapOrObj;
    if (typeof mapOrObj === "string") {
      try {
        obj = JSON.parse(mapOrObj);
      } catch (_) {
        return null;
      }
    }
    // hỗ trợ dạng {links:{...}} hoặc {...}
    const links = obj.links && typeof obj.links === "object" ? obj.links : obj;
    if (!links || typeof links !== "object") return null;

    const out = {};
    for (const [k, v] of Object.entries(links)) {
      const kk = String(k).trim();
      const vv = String(v || "").trim();
      if (!kk) continue;
      if (vv && ACCEPT_URL.test(vv)) out[kk] = vv;
    }
    return Object.keys(out).length ? out : null;
  }

  async function fetchJson(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }

  function renderTablesFallback(n) {
    if (!elTableBox) return;
    elTableBox.innerHTML = "";
    for (let i = 1; i <= n; i++) {
      const b = document.createElement("button");
      b.className = "table-btn";
      b.textContent = String(i);
      b.addEventListener("click", () => window.gotoStart(String(i)));
      elTableBox.appendChild(b);
    }
    setAutoFitGrid();
  }

  function renderTablesFromMap(map) {
    if (!elTableBox) return;
    elTableBox.innerHTML = "";
    const keys = Object.keys(map || {}).sort((a, b) => {
      const na = Number(a),
        nb = Number(b);
      const aNum = Number.isFinite(na),
        bNum = Number.isFinite(nb);
      if (aNum && bNum) return na - nb;
      return String(a).localeCompare(String(b));
    });
    for (const k of keys) {
      const b = document.createElement("button");
      b.className = "table-btn";
      b.textContent = String(k);
      b.addEventListener("click", () => window.gotoStart(String(k)));
      elTableBox.appendChild(b);
    }
    setAutoFitGrid();
  }

  // ---------------------------
  // AUTO-FIT GRID (optional)
  // ---------------------------
  let _resizeTimer = null;

  function setAutoFitGrid() {
    if (!elTableBox) return;
    // auto fit theo bề rộng container
    const w = elTableBox.clientWidth || 1;
    let col = 5;
    if (w < 360) col = 3;
    else if (w < 520) col = 4;
    else if (w < 760) col = 5;
    else col = 6;

    elTableBox.style.display = "grid";
    elTableBox.style.gridTemplateColumns = `repeat(${col}, minmax(0, 1fr))`;
    elTableBox.style.gap = "10px";
  }

  function onResize() {
    if (_resizeTimer) clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(setAutoFitGrid, 120);
  }

  // ---------------------------
  // Report (safe no-op if not exist)
  // ---------------------------
  function reportStageSafe(stage, by) {
    try {
      if (window.reportScreenStage) window.reportScreenStage(stage, by);
    } catch (_) {}
  }

  // ---------------------------
  // Core APIs
  // ---------------------------
  window.gotoSelect = function (keepState = false) {
    showScreen("select");
    if (!keepState) {
      state.tableId = null;
      setLS(LS.tableId, null);
      clearPosLink("gotoSelect", true);
      safeText(elSelectedTable, "");
    }
  };

  window.gotoStart = function (tableId, keepPosLink = false) {
    const id = String(tableId || "").trim();
    if (!id) return;

    state.tableId = id;
    setLS(LS.tableId, id);
    setLS(LS.appState, "start");
    state.lastGotoStartAt = Date.now();

    // QUAN TRỌNG: đổi bàn => bỏ hẳn posLink cũ + reset iframe
    // Nhưng: nếu gotoStart được gọi sau khi nhận LINK LIVE -> keepPosLink=true để GIỮ link mới
    clearPosLink("gotoStart(" + id + ")", !keepPosLink);

    // QUAN TRỌNG: luôn hiện số bàn (fix “mất số bàn”)
    safeText(elSelectedTable, id);

    showScreen("start");
    reportStageSafe("start", "gotoStart");
  };

  window.gotoPos = function (url) {
    const u = String(url || "").trim();
    if (!u) return;

    // chặn bounce ngay sau gotoStart (tránh bị script khác đẩy vào link cũ)
    const lastGS = state.lastGotoStartAt || 0;
    if (Date.now() - lastGS < 2500) {
      console.warn("[redirect-core] gotoPos blocked (recent gotoStart)", { u });
      return;
    }

    if (!ACCEPT_URL.test(u)) {
      console.warn("[redirect-core] gotoPos: reject non-order url", u);
      return;
    }

    // luôn ưu tiên link mới nhất (nếu LS đang có khác)
    const latest = getLS(LS.posLink, u) || u;
    const finalUrl = latest;

    state.posLink = finalUrl;
    setLS(LS.posLink, finalUrl);
    setLS(LS.appState, "pos");

    // giữ tableId hiện tại luôn đúng
    const curTable = state.tableId || getLS(LS.tableId, "");
    if (curTable) safeText(elSelectedTable, curTable);

    showScreen("pos");
    reportStageSafe("pos", "gotoPos");

    // set iframe “chắc ăn”
    if (iframe) {
      try {
        iframe.src = "about:blank";
      } catch (_) {}
      setTimeout(() => {
        try {
          iframe.src = finalUrl;
        } catch (_) {}
      }, 30);
    }
  };

  window.getLinkForTable = function (tableId) {
    const id = String(tableId || "").trim();
    if (!id) return "";
    const map = state.linksMap || null;
    const v = map && map[id] ? String(map[id]).trim() : "";
    return v && ACCEPT_URL.test(v) ? v : "";
  };

  window.getCurrentTable = function () {
    return state.tableId || getLS(LS.tableId, null);
  };

  // LIVE listener gọi: set link ngay
  window.setPosLink = function (url, source = "LIVE") {
    const u = String(url || "").trim();
    if (!u) return;

    console.log("[redirect-core] setPosLink from", source, u);

    // lưu link mới (ưu tiên)
    state.posLink = u;
    setLS(LS.posLink, u);

    // ✅ yêu cầu mới: mỗi lần nhận link LIVE -> về màn START (để không kẹt link cũ)
    const tid = state.tableId || getLS(LS.tableId, "");
    if (tid) {
      window.gotoStart(tid, true);
    } else {
      // chưa có bàn -> chỉ lưu, không tự nhảy
      setLS(LS.appState, "select");
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

    // chỉ render list bàn khi đang ở màn chọn bàn
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
        const norm = normalizeLinksMap(data);
        if (norm) {
          window.applyLinksMap(norm, "REMOTE");
          return norm;
        }
      } catch (_) {}

      // 2) local
      try {
        const data = await fetchJson(LOCAL_URL());
        const norm = normalizeLinksMap(data);
        if (norm) {
          window.applyLinksMap(norm, "LOCAL");
          return norm;
        }
      } catch (_) {}

      // 3) cache
      try {
        const cached = getLS(LS.linksCache, "");
        if (cached) {
          const obj = JSON.parse(cached);
          const norm = normalizeLinksMap(obj);
          if (norm) {
            window.applyLinksMap(norm, "CACHE");
            return norm;
          }
        }
      } catch (_) {}

      return null;
    } finally {
      isLoading = false;
    }
  }

  // ---------------------------
  // Start button
  // ---------------------------
  if (btnStart) {
    btnStart.addEventListener("click", () => {
      const tid = state.tableId || getLS(LS.tableId, "");
      if (!tid) return;

      // ưu tiên posLink LIVE (LS) trước
      const live = getLS(LS.posLink, "") || "";
      const fromMap = window.getLinkForTable(tid) || "";
      const url = (live && ACCEPT_URL.test(live) ? live : fromMap) || "";

      if (!url) {
        console.warn("[redirect-core] START: no link for table", tid);
        return;
      }
      window.gotoPos(url);
    });
  }

  // ---------------------------
  // Boot
  // ---------------------------
  async function boot() {
    console.log("[redirect-core] boot...");

    setAutoFitGrid();
    window.addEventListener("resize", onResize, { passive: true });

    // load links rồi render list bàn
    const map = await loadLinksOnce();
    if (map) renderTablesFromMap(map);
    else renderTablesFallback(DEFAULT_TABLE_COUNT);

    // restore state
    const appState = getLS(LS.appState, "select");
    const tableId = getLS(LS.tableId, "");
    const posLink = getLS(LS.posLink, "");

    // luôn sync số bàn ra UI nếu có
    if (tableId) safeText(elSelectedTable, tableId);

    // ✅ yêu cầu mới: reload thủ công luôn về START (không tự nhảy vào POS)
    if (tableId) {
      // giữ posLink để khi bấm START ORDER sẽ dùng link mới nhất
      window.gotoStart(tableId);
    } else {
      window.gotoSelect(true);
    }

    // periodic refresh links
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
