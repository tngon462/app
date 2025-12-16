/**
 * assets/js/redirect-core.js (FINAL — LIVE-FIRST + SAFE START)
 * - 3 màn: #select-table, #start-screen, #pos-container
 * - PRIMARY: Firebase links_live/{updated_at, links}
 * - FALLBACK: links.json local -> GitHub raw -> render 1..N
 *
 * ✅ FIX CHÍNH:
 * - gotoStart() CHỈ đổi màn hình, KHÔNG reset iframe.src
 * - CHỈ reset iframe.src khi ĐỔI BÀN (user chọn bàn / admin đổi bàn / gotoSelect(false))
 * - Start Order luôn resolve LIVE trước rồi mới dùng tableUrl
 *
 * Yêu cầu: Firebase đã init (compat) trước khi load file này.
 */

(function () {
  'use strict';

  const LS = localStorage;
  const $ = (id) => document.getElementById(id);

  // ---- DOM
  const elSelect = $('select-table');
  const elStart = $('start-screen');
  const elPos = $('pos-container');
  const iframe = $('pos-frame');
  const btnStart = $('start-order');
  const elTable = $('selected-table');
  const tableWrap = $('table-container');

  function hide(el) {
    if (!el) return;
    el.classList.add('hidden');
    if (el === elPos) el.style.display = 'none';
  }
  function show(el) {
    if (!el) return;
    el.classList.remove('hidden');
    if (el === elPos) el.style.display = '';
  }

  // ---- LS keys
  const LS_STATE = 'appState'; // 'select' | 'start' | 'pos'
  const LS_TID = 'tableId';
  const LS_TURL = 'tableUrl';

  // ---- State helpers
  function setState(s) { try { LS.setItem(LS_STATE, s); } catch (_) {} }
  function getState() { try { return LS.getItem(LS_STATE) || 'select'; } catch (_) { return 'select'; } }

  function setTable(id, url) {
    try {
      if (id != null) LS.setItem(LS_TID, String(id));
      // url null/undefined => remove to avoid stale
      if (url == null) LS.removeItem(LS_TURL);
      else LS.setItem(LS_TURL, String(url));
    } catch (_) { }
    window.tableId = String(id || '');
  }

  function getTable() {
    try {
      return { id: LS.getItem(LS_TID), url: LS.getItem(LS_TURL) };
    } catch (_) {
      return { id: null, url: null };
    }
  }

  function clearTable() {
    try { LS.removeItem(LS_TID); LS.removeItem(LS_TURL); } catch (_) {}
    try { delete window.tableId; } catch (_) {}
  }

  function clearIframeIfAny() {
    try {
      if (iframe && (iframe.src || '').trim() !== 'about:blank') iframe.src = 'about:blank';
    } catch (_) { }
  }

  // =========================
  // NAV / SCREEN
  // =========================

  // gotoSelect(keepTable=true)
  // - keepTable=false: clear bàn + clear iframe
  function gotoSelect(keepTable = true) {
    hide(elPos);
    hide(elStart);
    show(elSelect);

    if (!keepTable) {
      clearIframeIfAny();
      clearTable();
    }
    setState('select');
  }

  // gotoStart(tableId?)
  // ✅ KHÔNG reset iframe.src ở đây
  function gotoStart(tableId) {
    // nếu truyền bàn => set theo LIVE trước
    if (tableId != null && String(tableId).trim() !== '') {
      const tid = String(tableId).trim();
      const liveUrl = window.getLinkForTable?.(tid) || null;
      setTable(tid, liveUrl || null);
    }

    const { id } = getTable();
    if (!id) { gotoSelect(true); return; }

    if (elTable) elTable.textContent = String(id).replace('+', '');
    hide(elPos);
    hide(elSelect);
    show(elStart);
    setState('start');
  }

  // gotoPos(url?)
  function gotoPos(url) {
    const t = getTable();
    const liveUrl = t?.id ? (window.getLinkForTable?.(t.id) || null) : null;
    const finalUrl = url || liveUrl || t.url;

    if (!finalUrl) {
      alert('Chưa có link POS của bàn này.');
      gotoSelect(false);
      return;
    }

    // sync lại tableUrl
    setTable(t.id, finalUrl);

    if (iframe) iframe.src = finalUrl;
    hide(elSelect);
    hide(elStart);
    show(elPos);
    setState('pos');
  }

  // expose
  window.gotoSelect = gotoSelect;
  window.gotoStart = gotoStart;
  window.gotoPos = gotoPos;

  // =========================
  // LINKS SOURCE (LIVE FIRST)
  // =========================

  let LINKS_MAP = null;
  let LIVE_UPDATED_AT = 0;
  const LIVE_STALE_SECONDS = 120;

  const LS_LIVE_CACHE = 'linksLiveCache'; // {updated_at, links}
  const LS_LIVE_CACHE_AT = 'linksLiveCacheAt';

  function nowSec() { return Math.floor(Date.now() / 1000); }

  function setLinksMap(map, source) {
    if (!map || typeof map !== 'object' || Array.isArray(map)) return false;
    LINKS_MAP = map;
    window.LINKS_MAP = map;
    console.log('[redirect-core] ✅ setLinksMap from', source, '| tables:', Object.keys(map).length);
    return true;
  }

  window.getLinkForTable = function (t) {
    if (!LINKS_MAP) return null;
    const key = String(t);
    return (key in LINKS_MAP) ? LINKS_MAP[key] : null;
  };

  function renderTablesFromMap(map) {
    if (!tableWrap) return;
    tableWrap.innerHTML = '';
    tableWrap.classList.add('place-items-center', 'justify-center');

    Object.keys(map).sort((a, b) => Number(a) - Number(b)).forEach(key => {
      const url = map[key];

      const btn = document.createElement('button');
      btn.className =
        'flex items-center justify-center rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold shadow px-4 py-3 sm:px-6 sm:py-4 w-28 h-20 sm:w-40 sm:h-28 text-sm sm:text-lg';

      btn.textContent = 'Bàn ' + key;

      btn.addEventListener('click', () => {
        // ✅ đổi bàn => clear iframe để khỏi dính session cũ
        clearIframeIfAny();
        setTable(key, url || null);
        if (elTable) elTable.textContent = key;
        gotoStart();
      });

      tableWrap.appendChild(btn);
    });
  }

  function renderTablesFallback(count = 15) {
    if (!tableWrap) return;
    tableWrap.innerHTML = '';
    tableWrap.classList.add('place-items-center', 'justify-center');

    for (let i = 1; i <= count; i++) {
      const key = String(i);
      const btn = document.createElement('button');
      btn.className =
        'flex items-center justify-center rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold shadow px-4 py-3 sm:px-6 sm:py-4 w-28 h-20 sm:w-40 sm:h-28 text-sm sm:text-lg';
      btn.textContent = 'Bàn ' + key;

      btn.addEventListener('click', () => {
        clearIframeIfAny(); // ✅ đổi bàn
        const url = window.getLinkForTable ? window.getLinkForTable(key) : null;
        setTable(key, url || null);
        if (elTable) elTable.textContent = key;
        gotoStart();
      });

      tableWrap.appendChild(btn);
    }
  }

  async function loadLinksJsonFallback() {
    const localUrl = './links.json?cb=' + Date.now();
    const remoteUrl = 'https://raw.githubusercontent.com/tngon462/QR/main/links.json?cb=' + Date.now();

    async function fetchJson(url) {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      return data?.links || data;
    }

    try {
      console.warn('[redirect-core] ⚠️ LIVE stale/off → dùng fallback links.json (local)');
      const map1 = await fetchJson(localUrl);
      if (setLinksMap(map1, 'links.json local')) return map1;
    } catch (e1) {
      console.warn('[redirect-core] local links.json fail:', e1?.message || e1);
    }

    try {
      console.warn('[redirect-core] ⚠️ local fail → thử GitHub raw links.json');
      const map2 = await fetchJson(remoteUrl);
      if (setLinksMap(map2, 'links.json GitHub')) return map2;
    } catch (e2) {
      console.warn('[redirect-core] GitHub links.json fail:', e2?.message || e2);
    }

    return null;
  }

  function isLiveFresh() {
    if (!LIVE_UPDATED_AT) return false;
    return (nowSec() - LIVE_UPDATED_AT) <= LIVE_STALE_SECONDS;
  }

  function tryRestoreLiveCache() {
    try {
      const raw = LS.getItem(LS_LIVE_CACHE);
      if (!raw) return false;
      const obj = JSON.parse(raw);
      const links = obj?.links;
      const ua = Number(obj?.updated_at || 0);
      if (!links || typeof links !== 'object') return false;

      LIVE_UPDATED_AT = ua || 0;
      const ok = setLinksMap(links, 'LS cache');
      if (ok) console.log('[redirect-core] 🔁 restored links from LS cache', { updated_at: ua });
      return ok;
    } catch (_) {
      return false;
    }
  }

  async function startLiveListener() {
    if (!window.firebase || !firebase.apps?.length) {
      console.warn('[redirect-core] Firebase chưa init → bỏ live, chỉ fallback links.json');
      return;
    }

    // nếu rule cần auth: sign-in anonymous
    try {
      if (firebase.auth && !firebase.auth().currentUser) {
        await firebase.auth().signInAnonymously().catch(() => { });
        await new Promise(res => {
          const un = firebase.auth().onAuthStateChanged(u => { if (u) { un(); res(); } });
          setTimeout(res, 1500);
        });
      }
    } catch (_) { }

    const db = firebase.database();
    const ref = db.ref('links_live');

    ref.on('value', async (snap) => {
      const data = snap.val();
      const links = data?.links;
      const ua = Number(data?.updated_at || 0);

      if (links && typeof links === 'object') {
        LIVE_UPDATED_AT = ua || nowSec();
        setLinksMap(links, 'firebase links_live');

        try {
          LS.setItem(LS_LIVE_CACHE, JSON.stringify({ updated_at: LIVE_UPDATED_AT, links }));
          LS.setItem(LS_LIVE_CACHE_AT, String(nowSec()));
        } catch (_) { }

        // nếu đang SELECT: render lại grid theo live
        if (getState() === 'select') {
          renderTablesFromMap(links);
        }

        // nếu đang POS: bàn hiện tại có link mới → reload iframe
        const t = getTable();
        if (t?.id) {
          const newUrl = String(links[String(t.id)] || '');
          if (newUrl && newUrl !== String(t.url || '')) {
            console.log('[redirect-core] 🔄 url đổi theo live:', t.id, newUrl);
            setTable(t.id, newUrl);

            if (getState() === 'pos' && iframe) {
              iframe.src = newUrl;
            }
          }
        }
      }
    }, async (err) => {
      console.warn('[redirect-core] live listener error:', err?.message || err);
      await loadLinksJsonFallback();
    });

    // watchdog: live stale → fallback (không phá listener)
    setInterval(async () => {
      if (!isLiveFresh()) {
        await loadLinksJsonFallback();
      }
    }, 15000);
  }

  // =========================
  // START ORDER (LIVE FIRST)
  // =========================
  if (btnStart) {
    btnStart.addEventListener('click', () => {
      const t = getTable();
      const liveUrl = t?.id ? (window.getLinkForTable?.(t.id) || null) : null;
      const finalUrl = liveUrl || t.url;

      if (!finalUrl) {
        alert('Chưa có link POS của bàn này.');
        gotoSelect(false);
        return;
      }

      setTable(t.id, finalUrl);
      gotoPos(finalUrl);
    });
  }

  // =========================
  // ADMIN đổi bàn từ xa
  // =========================
  window.addEventListener('tngon:tableChanged', (ev) => {
    const { table, url } = ev.detail || {};
    if (!table) return;

    // ✅ đổi bàn => clear iframe (cắt session cũ)
    clearIframeIfAny();

    const nextUrl = url ?? window.getLinkForTable?.(table) ?? null;
    setTable(table, nextUrl);

    if (elTable) elTable.textContent = String(table).replace('+', '');
    gotoStart(table);
  });

  // =========================
  // BOOT
  // =========================
  (async function boot() {
    const restored = tryRestoreLiveCache();
    if (LINKS_MAP) renderTablesFromMap(LINKS_MAP);

    await startLiveListener();

    if (!restored && !LINKS_MAP) {
      const map = await loadLinksJsonFallback();
      if (map) renderTablesFromMap(map);
      else renderTablesFallback(15);
    }

    // restore UI state
    const state = getState();
    const { id, url } = getTable();

    // ưu tiên liveUrl nếu có
    const liveUrl = id ? window.getLinkForTable?.(id) : null;
    const finalUrl = liveUrl || url || null;
    if (id && finalUrl) setTable(id, finalUrl);

    if (state === 'pos' && finalUrl) {
      gotoPos(finalUrl);
    } else if (state === 'start' && id) {
      if (elTable) elTable.textContent = String(id).replace('+', '');
      gotoStart();
    } else {
      gotoSelect(false);
    }
  })();

})();
