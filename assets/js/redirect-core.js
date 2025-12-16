/**
 * assets/js/redirect-core.js (PATCHED FINAL)
 * - Đổi bàn ăn NGAY, không cần reload
 * - Đồng bộ STAGE cho admin (select / start / pos)
 * - Không phá qrback
 */

(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const elSelect = $("select-table");
  const elStart = $("start-screen");
  const elPos = $("pos-container");
  const elTableBox = $("table-container");
  const elSelectedTable = $("selected-table");
  const iframe = $("pos-frame");
  const btnStart = $("start-order");

  const DEFAULT_TABLE_COUNT = 15;
  const REMOTE_URL = () =>
    `https://raw.githubusercontent.com/tngon462/QR/main/links.json?cb=${Date.now()}`;
  const LOCAL_URL = () => `./links.json?cb=${Date.now()}`;
  const REFRESH_MS = 60_000;
  const ACCEPT_URL = /^https?:\/\/order\.atpos\.net\//i;

  const LS = {
    tableId: "tableId",
    posLink: "posLink",
    appState: "appState",
    linksCache: "linksCache",
    linksCacheHash: "linksCacheHash",
  };

  const state = {
    tableId: null,
    posLink: null,
    linksMap: null,
    linksHash: null,
  };

  const setLS = (k, v) => {
    try {
      if (v == null || v === "") localStorage.removeItem(k);
      else localStorage.setItem(k, String(v));
    } catch {}
  };
  const getLS = (k, d = null) => {
    try {
      const v = localStorage.getItem(k);
      return v === null ? d : v;
    } catch {
      return d;
    }
  };

  // ===== report STAGE cho admin (nếu có screen-state.js)
  function reportStageSafe(stage, by) {
    try {
      if (typeof window.reportStage === "function") {
        window.reportStage(stage, by);
      }
    } catch {}
  }

  function showScreen(which) {
    if (elSelect) elSelect.classList.toggle("hidden", which !== "select");
    if (elStart) elStart.classList.toggle("hidden", which !== "start");
    if (elPos) elPos.classList.toggle("hidden", which !== "pos");
  }

  function resetIframe() {
    try {
      if (iframe) iframe.src = "about:blank";
    } catch {}
  }

  function clearPosLink(reason) {
    state.posLink = null;
    setLS(LS.posLink, null);
    resetIframe();
    if (reason) console.log("[redirect-core] clearPosLink:", reason);
  }

  // ===== NAVIGATION =====
  window.gotoSelect = function (keep = false) {
    if (!keep) {
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

    clearPosLink("gotoStart(" + id + ")");
    if (elSelectedTable) elSelectedTable.textContent = id;

    showScreen("start");
    reportStageSafe("start", "gotoStart");
  };

  window.gotoPos = function (url) {
    const u = String(url || "").trim();
    if (!u) return;

    state.posLink = u;
    setLS(LS.posLink, u);
    setLS(LS.appState, "pos");

    showScreen("pos");
    reportStageSafe("pos", "gotoPos");

    if (iframe) {
      iframe.src = "about:blank";
      setTimeout(() => (iframe.src = u), 30);
    }
  };

  // ===== ADMIN đổi bàn → ăn NGAY
  window.addEventListener("tngon:tableChanged", (e) => {
    const t =
      e?.detail?.value ||
      e?.detail?.table ||
      getLS(LS.tableId, "");
    if (t) window.gotoStart(String(t));
  });

  // ===== LINKS =====
  function normalizeLinksMap(data) {
    const raw =
      data && data.links && typeof data.links === "object"
        ? data.links
        : data;
    if (!raw || typeof raw !== "object") return null;
    const out = {};
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === "string" && ACCEPT_URL.test(v)) out[k] = v;
    }
    return Object.keys(out).length ? out : null;
  }

  window.setPosLink = function (url, source = "LIVE") {
    const u = String(url || "").trim();
    if (!u) return;
    console.log("[redirect-core] setPosLink FORCE", source, u);
    window.gotoPos(u);
  };

  // ===== BOOT =====
  async function boot() {
    const appState = getLS(LS.appState, "select");
    const tableId = getLS(LS.tableId, "");
    const posLink = getLS(LS.posLink, "");

    if (appState === "pos" && posLink) window.gotoPos(posLink);
    else if (appState === "start" && tableId) window.gotoStart(tableId);
    else window.gotoSelect(true);

    console.log("[redirect-core] boot OK");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else boot();
})();
