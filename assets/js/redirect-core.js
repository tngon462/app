// assets/js/redirect-core.js
(function() {
  'use strict';

  // helper: show/hide
  function show(el) { if (!el) return; el.classList.remove('hidden'); el.style.display = el.dataset.display || 'block'; }
  function hide(el) { if (!el) return; el.classList.add('hidden'); el.style.display = 'none'; }

  // load links.json (supports new shape: { updated_at: ..., links: { "1": "url", ... } })
  async function loadLinks() {
    try {
      const r = await fetch('./links.json?cb=' + Date.now(), { cache: 'no-store' });
      const j = await r.json();
      return j.links || j;
    } catch (e) {
      console.error('loadLinks error', e);
      return {};
    }
  }

  // render table buttons
  async function renderTables() {
    const links = await loadLinks();
    const container = document.getElementById('table-container');
    if (!container) return;
    container.innerHTML = '';

    const keys = Object.keys(links).sort((a,b)=> Number(a)-Number(b));
    keys.forEach(key => {
      // khi render mỗi button trong renderTables()
const btn = document.createElement('button');
btn.className = [
  'flex items-center justify-center',
  'rounded-lg',
  'bg-blue-600 hover:bg-blue-700',
  'text-white font-bold',
  'shadow',
  'px-4 py-3',         // padding nhỏ cho mobile
  'sm:px-6 sm:py-4',   // lớn hơn trên sm+
  'w-28 h-20 sm:w-40 sm:h-28', // kích thước responsive
  'text-sm sm:text-lg' // chữ nhỏ trên mobile, lớn trên tablet
].join(' ');
btn.textContent = 'Bàn ' + key;
      btn.dataset.tableId = key;
      btn.dataset.url = links[key];

      btn.addEventListener('click', () => {
        // store selection in localStorage so start handler (or reload) can use it
        try {
          localStorage.setItem('tableId', String(key));
          localStorage.setItem('tableUrl', String(links[key]));
        } catch(e){}
        // show start-screen
        const start = document.getElementById('start-screen');
        const select = document.getElementById('select-table');
        const selElm = document.getElementById('selected-table');
        if (selElm) selElm.textContent = key;
        if (select) hide(select);
        if (start) show(start), start.style.display='flex';
      });

      container.appendChild(btn);
    });
  }

  // START button handler — robust: read url from localStorage OR dataset on button
  function bindStartButton() {
    const startBtn = document.getElementById('start-order');
    const posContainer = document.getElementById('pos-container');
    const posFrame = document.getElementById('pos-frame');

    if (!startBtn) return;
    startBtn.addEventListener('click', () => {
      // get URL: prefer localStorage (selected table), fallback to data-url on button attribute
      const urlFromStorage = localStorage.getItem('tableUrl');
      const urlFromBtn = startBtn.dataset ? startBtn.dataset.url : null;
      const finalUrl = urlFromStorage || urlFromBtn;
      if (!finalUrl) {
        console.warn('no table url found when starting');
        // show select screen to force choose
        const select = document.getElementById('select-table');
        const start = document.getElementById('start-screen');
        if (start) hide(start);
        if (select) show(select);
        return;
      }
      // show iframe
      if (posFrame) posFrame.src = finalUrl;
      if (posContainer) {
        posContainer.style.display = 'block';
      }
      // hide start/select
      const start = document.getElementById('start-screen');
      const select = document.getElementById('select-table');
      if (start) hide(start);
      if (select) hide(select);
      // persist state
      try { localStorage.setItem('appState','pos'); } catch(e){}
    });
  }

  // on load
  document.addEventListener('DOMContentLoaded', async () => {
    await renderTables();
    bindStartButton();

    // If there's a saved state (e.g., pos), restore on load
    try {
      const appState = localStorage.getItem('appState');
      const tableUrl = localStorage.getItem('tableUrl');
      if (appState === 'pos' && tableUrl) {
        // directly restore iframe
        const posFrame = document.getElementById('pos-frame');
        const posContainer = document.getElementById('pos-container');
        if (posFrame) posFrame.src = tableUrl;
        if (posContainer) posContainer.style.display = 'block';
        // hide others
        const start = document.getElementById('start-screen');
        const select = document.getElementById('select-table');
        if (start) hide(start);
        if (select) hide(select);
      } else if (appState === 'start') {
        // show start screen (selected table id if any)
        const start = document.getElementById('start-screen');
        const select = document.getElementById('select-table');
        const tableId = localStorage.getItem('tableId');
        const selElm = document.getElementById('selected-table');
        if (tableId && selElm) selElm.textContent = tableId;
        if (start) show(start), start.style.display='flex';
        if (select) hide(select);
      } else {
        // default: show select
        const select = document.getElementById('select-table');
        const start = document.getElementById('start-screen');
        if (select) show(select);
        if (start) hide(start);
      }
    } catch (e) { console.error('restore state error', e); }
  });

})();