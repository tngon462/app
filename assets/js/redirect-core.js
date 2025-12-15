/**
 * assets/js/redirect-core.js (SAFE FULL - FIXED)
 * - Giữ 3 màn: #select-table, #start-screen, #pos-container
 * - Load links.json từ GitHub raw + fallback local + fallback cache + fallback render 1..N
 * - Responsive grid + auto size nút
 * - Expose:
 *    window.gotoSelect / gotoStart / gotoPos
 *    window.getLinkForTable(tableId)
 *    window.applyLinksMap(map, source)
 *    window.setPosLink(url, source)
 *    window.getCurrentTable()
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

  const LS = {
    tableId: "tableId",
    posLink: "posLink",
    appState: "appState", // 'select'|'start'|'pos'
    linksCache: "linksCache",
  };

  const setState = (k, v) => {
    try {
      v == null ? localStorage.removeItem(k) : localStorage.setItem(k, String(v));
    } catch {}
  };
  const getState = (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  };

  // ===== UI helpers (quan trọng để tránh kẹt display) =====
  function hide(el) {
    if (!el) return;
    el.classList.add("hidden");
    // tránh trường hợp CSS/inline display kẹt
    if (el === elPos) el.style.display = "none";
  }
  function show(el) {
    if (!el) return;
    el.classList.remove("hidden");
    if (el === elPos) el.style.display = "";
  }

  // ===== Links Map =====
  let LINKS_MAP = null;

  function normalizeLinksMap(data) {
    const map = data?.links || data;
    if (!map || typeof map !== "object" || Array.isArray(map)) return null;

    const out = {};
    for (const [k, v] of Object.entries(map)) {
      // giữ selector/logic cũ: chỉ nhận link atpos
      if (typeof v === "string" && /^https?:\/\/order\.atpos\.net/.test(v)) {
        out[String(k)] = v;
      }
    }
    return Object.keys(out).length ? out : null;
  }

  async function fetchJson(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }

  function applyLinksMap(map, source = "unknown") {
    LINKS_MAP = map;
    window.LINKS_MAP = map;
    setState(LS.linksCache, JSON.stringify({ links: map, source, savedAt: Date.now() }));

    // nếu đang ở màn select thì render lại ngay
    if ((getState(LS.appState) || "select") === "select") {
      renderTablesFromMap(map);
    }
  }
  window.applyLinksMap = applyLinksMap;

  async function loadLinks() {
    // 1) remote
    try {
      const map = normalizeLinksMap(await fetchJson(REMOTE_URL()));
      if (map) {
        applyLinksMap(map, "remote");
        return map;
      }
    } catch {}

    // 2) local
    try {
      const map = normalizeLinksMap(await fetchJson(LOCAL_URL()));
      if (map) {
        applyLinksMap(map, "local");
        return map;
      }
    } catch {}

    // 3) cache
    try {
      const cache = getState(LS.linksCache);
      if (cache) {
        const map = normalizeLinksMap(JSON.parse(cache));
        if (map) {
          applyLinksMap(map, "cache");
          return map;
        }
      }
    } catch {}

    return null;
  }

  window.getLinkForTable = (t) => {
    const key = String(t ?? "");
    return LINKS_MAP?.[key] || null;
  };

  window.getCurrentTable = () => getState(LS.tableId) || null;

  // ===== Navigation =====
  window.gotoSelect = (clear = false) => {
    if (clear) {
      setState(LS.tableId, null);
      setState(LS.posLink, null);
      // compatibility keys
      setState("table", null);
      setState("tngon_table", null);
      try {
        delete window.tableId;
      } catch {}
    }

    setState(LS.appState, "select");

    // reset iframe
    if (iframe) iframe.src = "about:blank";

    hide(elPos);
    hide(elStart);
    show(elSelect);

    requestAnimationFrame(refreshTableLayout);
  };

  window.gotoStart = (id) => {
    // ✅ cho phép gọi gotoStart() không truyền id (QRBACK/QRMASTER hay gọi kiểu này)
    id = String(
      id ||
        getState(LS.tableId) ||
        getState("table") ||
        getState("tngon_table") ||
        ""
    ).trim();

    if (!id) return window.gotoSelect(false);

    // lưu table
    setState(LS.tableId, id);
    // compat keys
    setState("table", id);
    setState("tngon_table", id);
    window.tableId = id;

    setState(LS.appState, "start");

    if (elSelectedTable) elSelectedTable.textContent = id;

    // reset iframe khi quay về start (tránh kẹt / about:blank loop)
    if (iframe) iframe.src = "about:blank";

    hide(elPos);
    hide(elSelect);
    show(elStart);
  };

  window.gotoPos = (url) => {
    const id = getState(LS.tableId);
    const finalUrl = url || getState(LS.posLink) || window.getLinkForTable(id);

    if (!finalUrl) {
      alert("Chưa có link POS của bàn này.");
      return window.gotoSelect(false);
    }

    setState(LS.posLink, finalUrl);
    setState(LS.appState, "pos");

    hide(elSelect);
    hide(elStart);
    show(elPos);

    if (iframe && iframe.src !== finalUrl) iframe.src = finalUrl;
  };

  window.setPosLink = (url /*, source */) => window.gotoPos(url);

  // ===== Responsive grid + auto size button =====
  function ensureGrid() {
    if (!elTableBox) return;
    elTableBox.style.display = "grid";
    elTableBox.style.gridTemplateColumns = "repeat(auto-fit, minmax(120px, 1fr))";
    elTableBox.style.gap = "clamp(10px, 2vw, 22px)";
    elTableBox.style.width = "100%";
    elTableBox.style.maxWidth = "min(980px, 100%)";
    elTableBox.style.margin = "0 auto";
    elTableBox.style.padding = "12px";
  }

  function createTableButton(id) {
    const b = document.createElement("button");
    b.textContent = `Bàn ${id}`;
    b.className =
      "bg-blue-600 text-white font-semibold rounded-2xl shadow-sm " +
      "hover:bg-blue-700 active:scale-[0.98] transition";

    // AUTO SIZE
    b.style.height = "clamp(90px, 18vw, 150px)";
    b.style.fontSize = "clamp(16px, 4vw, 22px)";
    b.style.display = "flex";
    b.style.alignItems = "center";
    b.style.justifyContent = "center";
    b.style.width = "100%";

    b.onclick = () => window.gotoStart(String(id));
    return b;
  }

  function renderTablesFallback(n = DEFAULT_TABLE_COUNT) {
    if (!elTableBox) return;
    elTableBox.innerHTML = "";
    ensureGrid();
    for (let i = 1; i <= n; i++) {
      elTableBox.appendChild(createTableButton(i));
    }
    refreshTableLayout();
  }

  function renderTablesFromMap(map) {
    if (!elTableBox) return;
    elTableBox.innerHTML = "";
    ensureGrid();
    Object.keys(map)
      .sort((a, b) => Number(a) - Number(b))
      .forEach((k) => elTableBox.appendChild(createTableButton(k)));
    refreshTableLayout();
  }

  function refreshTableLayout() {
    // chỉ cần refresh khi đang ở select
    if ((getState(LS.appState) || "select") !== "select") return;
    if (!elTableBox) return;

    ensureGrid();

    // trick reflow để grid co giãn chuẩn
    elTableBox.style.display = "none";
    // eslint-disable-next-line no-unused-expressions
    elTableBox.offsetHeight;
    elTableBox.style.display = "grid";
  }

  window.addEventListener("resize", () => requestAnimationFrame(refreshTableLayout));
  window.addEventListener("orientationchange", () => setTimeout(refreshTableLayout, 80));

  // ===== Start button =====
  if (btnStart) {
    btnStart.onclick = () => {
      const live = getState(LS.posLink);
      if (live) return window.gotoPos(live);

      const id = getState(LS.tableId);
      const link = window.getLinkForTable(id);
      if (link) return window.gotoPos(link);

      alert("Chưa có link POS của bàn này.");
      window.gotoSelect(false);
    };
  }

  // ===== Remote table change event (nếu device-bind dùng) =====
  window.addEventListener("tngon:tableChanged", (ev) => {
    const { table, url } = (ev && ev.detail) || {};
    if (!table) return;

    const id = String(table);
    setState(LS.tableId, id);
    setState("table", id);
    setState("tngon_table", id);
    window.tableId = id;

    const finalUrl = url ?? window.getLinkForTable(id) ?? getState(LS.posLink) ?? null;
    if (finalUrl) setState(LS.posLink, finalUrl);

    if (elSelectedTable) elSelectedTable.textContent = id;
    window.gotoStart(id);
  });

  // ===== Boot =====
  (async function boot() {
    // nếu element bị thiếu => khỏi chạy để tránh reload loop
    if (!elSelect || !elStart || !elPos || !elTableBox) {
      console.warn("[redirect-core] Missing required DOM elements. Abort init.");
      return;
    }

    const map = await loadLinks();
    map ? renderTablesFromMap(map) : renderTablesFallback(DEFAULT_TABLE_COUNT);

    const state = getState(LS.appState) || "select";
    if (state === "pos") {
      window.gotoPos(getState(LS.posLink));
    } else if (state === "start") {
      window.gotoStart(getState(LS.tableId));
    } else {
      window.gotoSelect(false);
    }

    setTimeout(refreshTableLayout, 120);
  })();
})();
