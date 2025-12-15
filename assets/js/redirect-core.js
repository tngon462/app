/**
 * assets/js/redirect-core.js (SAFE FULL)
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
    appState: "appState",
    linksCache: "linksCache",
  };

  const setState = (k, v) => {
    try {
      v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v);
    } catch {}
  };
  const getState = (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  };

  let LINKS_MAP = null;

  function normalizeLinksMap(data) {
    const map = data?.links || data;
    if (!map || typeof map !== "object") return null;

    const out = {};
    for (const [k, v] of Object.entries(map)) {
      if (typeof v === "string" && /^https?:\/\/order\.atpos\.net/.test(v)) {
        out[String(k)] = v;
      }
    }
    return Object.keys(out).length ? out : null;
  }

  async function fetchJson(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(r.status);
    return r.json();
  }

  async function loadLinks() {
    try {
      const map = normalizeLinksMap(await fetchJson(REMOTE_URL()));
      if (map) return applyLinksMap(map), map;
    } catch {}

    try {
      const map = normalizeLinksMap(await fetchJson(LOCAL_URL()));
      if (map) return applyLinksMap(map), map;
    } catch {}

    const cache = getState(LS.linksCache);
    if (cache) {
      const map = normalizeLinksMap(JSON.parse(cache));
      if (map) return applyLinksMap(map), map;
    }
    return null;
  }

  function applyLinksMap(map) {
    LINKS_MAP = map;
    window.LINKS_MAP = map;
    setState(LS.linksCache, JSON.stringify({ links: map }));
    if ((getState(LS.appState) || "select") === "select") {
      renderTablesFromMap(map);
    }
  }

  window.getLinkForTable = (t) => LINKS_MAP?.[String(t)] || null;
  // ✅ expose current table cho các module khác (probe / pos-link-fix / qrback-listener)
window.getCurrentTable = () => getState(LS.tableId) || null;

  window.gotoSelect = () => {
    setState(LS.appState, "select");
    elSelect?.classList.remove("hidden");
    elStart?.classList.add("hidden");
    elPos?.classList.add("hidden");
    requestAnimationFrame(refreshTableLayout);
  };

  window.gotoStart = (id) => {
  id = String(id || getState(LS.tableId) || "").trim();
if (!id) return;

  setState(LS.tableId, id);

  // ✅ thêm 2 dòng này để tương thích mấy file khác (nếu nó đọc key khác)
  setState("table", id);
  setState("tngon_table", id);

  setState(LS.appState, "start");
  elSelectedTable.textContent = id;
  elSelect.classList.add("hidden");
  elStart.classList.remove("hidden");
  elPos.classList.add("hidden");
};

  window.gotoPos = (url) => {
    setState(LS.posLink, url);
    setState(LS.appState, "pos");
    elSelect.classList.add("hidden");
    elStart.classList.add("hidden");
    elPos.classList.remove("hidden");
    if (iframe.src !== url) iframe.src = url;
  };

  window.setPosLink = (url) => window.gotoPos(url);

  /* ===============================
     RESPONSIVE GRID + AUTO SIZE
     =============================== */
  function ensureGrid() {
    elTableBox.style.display = "grid";
    elTableBox.style.gridTemplateColumns =
      "repeat(auto-fit, minmax(120px, 1fr))";
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

    /* 🔥 AUTO SIZE */
    b.style.height = "clamp(90px, 18vw, 150px)";
    b.style.fontSize = "clamp(16px, 4vw, 22px)";
    b.style.display = "flex";
    b.style.alignItems = "center";
    b.style.justifyContent = "center";
    b.style.width = "100%";

    b.onclick = () => window.gotoStart(id);
    return b;
  }

  function renderTablesFallback(n) {
    elTableBox.innerHTML = "";
    ensureGrid();
    for (let i = 1; i <= n; i++) {
      elTableBox.appendChild(createTableButton(i));
    }
    refreshTableLayout();
  }

  function renderTablesFromMap(map) {
    elTableBox.innerHTML = "";
    ensureGrid();
    Object.keys(map)
      .sort((a, b) => a - b)
      .forEach((k) => elTableBox.appendChild(createTableButton(k)));
    refreshTableLayout();
  }

  function refreshTableLayout() {
    if ((getState(LS.appState) || "select") !== "select") return;
    ensureGrid();
    elTableBox.style.display = "none";
    elTableBox.offsetHeight;
    elTableBox.style.display = "grid";
  }

  window.addEventListener("resize", () =>
    requestAnimationFrame(refreshTableLayout)
  );
  window.addEventListener("orientationchange", () =>
    setTimeout(refreshTableLayout, 80)
  );

  if (btnStart) {
    btnStart.onclick = () => {
      const id = getState(LS.tableId);
      const live = getState(LS.posLink);
      if (live) return window.gotoPos(live);
      const link = window.getLinkForTable(id);
      if (link) window.gotoPos(link);
    };
  }

  (async function boot() {
    const map = await loadLinks();
    map ? renderTablesFromMap(map) : renderTablesFallback(DEFAULT_TABLE_COUNT);

    const state = getState(LS.appState);
    if (state === "pos") window.gotoPos(getState(LS.posLink));
    else if (state === "start") window.gotoStart(getState(LS.tableId));
    else window.gotoSelect();

    setTimeout(refreshTableLayout, 120);
  })();
})();
