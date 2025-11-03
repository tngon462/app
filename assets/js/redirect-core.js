/**
 * assets/js/redirect-core.js (safe fallback)
 * - Giữ nguyên 3 màn: #select-table, #start-screen, #pos-container
 * - Load links.json; nếu lỗi vẫn render fallback 1..15
 * - Expose: window.gotoSelect/gotoStart/gotoPos + window.getLinkForTable
 */
(function(){
  'use strict';

  const LS = localStorage;
  const $  = (id)=> document.getElementById(id);

  const elSelect = $('select-table');
  const elStart  = $('start-screen');
  const elPos    = $('pos-container');
  const iframe   = $('pos-frame');
  const btnStart = $('start-order');
  const elTable  = $('selected-table');

  function hide(el){ if(!el) return; el.classList.add('hidden'); if(el===elPos) el.style.display='none'; }
  function show(el){ if(!el) return; el.classList.remove('hidden'); if(el===elPos) el.style.display=''; }

  const LS_STATE = 'appState'; // 'select' | 'start' | 'pos'
  const LS_TID   = 'tableId';
  const LS_TURL  = 'tableUrl';

  function setState(s){ LS.setItem(LS_STATE, s); }
  function getState(){ return LS.getItem(LS_STATE) || 'select'; }

  function setTable(id, url){
    if (id!=null) LS.setItem(LS_TID, String(id));
    if (url!=null) LS.setItem(LS_TURL, url);
    window.tableId = String(id || '');
  }
  function getTable(){ return { id:LS.getItem(LS_TID), url:LS.getItem(LS_TURL) }; }
  function clearTable(){
    LS.removeItem(LS_TID); LS.removeItem(LS_TURL); delete window.tableId;
  }

  function gotoSelect(clear=false){
    hide(elPos); if (iframe) iframe.src = 'about:blank';
    hide(elStart);
    show(elSelect);
    if (clear) clearTable();
    setState('select');
  }
  function gotoStart(){
    const {id} = getTable();
    if (!id){ gotoSelect(false); return; }
    if (elTable) elTable.textContent = id;
    hide(elPos); if (iframe) iframe.src = 'about:blank';
    hide(elSelect);
    show(elStart);
    setState('start');
  }
  function gotoPos(url){
    const t = getTable();
    const finalUrl = url || t.url;
    if (!finalUrl){ alert('Chưa có link POS của bàn này.'); gotoSelect(false); return; }
    if (iframe) iframe.src = finalUrl;
    hide(elSelect); hide(elStart); show(elPos);
    setState('pos');
  }

  // Expose cho device-bind
  window.gotoSelect = gotoSelect;
  window.gotoStart  = gotoStart;
  window.gotoPos    = gotoPos;

  // ----- links.json -----
  let LINKS_MAP = null;
  function cb(u){ return u + (u.includes('?')?'&':'?') + 'cb=' + Date.now(); }

  async function loadLinks(){
    try{
      const res = await fetch('https://raw.githubusercontent.com/tngon462/QR/refs/heads/main/links.json?cb' + Date.now(), { cache:'no-store' });
      if (!res.ok) throw new Error('HTTP '+res.status);
      const data = await res.json();
      const map = data?.links || data;
      if (!map || typeof map !== 'object' || Array.isArray(map)) throw new Error('invalid links.json shape');
      LINKS_MAP = map;
      window.LINKS_MAP = map;
      console.log('[redirect-core] links.json loaded:', Object.keys(map).length, 'entries');
      return map;
    }catch(e){
      console.error('[redirect-core] loadLinks FAILED:', e);
      LINKS_MAP = null;
      window.LINKS_MAP = null;
      return null;
    }
  }
  window.getLinkForTable = function(t){
    if (!LINKS_MAP) return null;
    return (t in LINKS_MAP) ? LINKS_MAP[t] : null;
  };

  function renderTablesFromMap(map){
    const wrap = $('table-container');
    if (!wrap) return;
    wrap.innerHTML = '';
    wrap.classList.add('place-items-center','justify-center');

    Object.keys(map).sort((a,b)=> Number(a)-Number(b)).forEach(key=>{
      const url = map[key];
      const btn = document.createElement('button');
      btn.className = 'flex items-center justify-center rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold shadow px-4 py-3 sm:px-6 sm:py-4 w-28 h-20 sm:w-40 sm:h-28 text-sm sm:text-lg';
      btn.textContent = 'Bàn ' + key;
      btn.addEventListener('click', ()=>{
        setTable(key, url || null);
        if (elTable) elTable.textContent = key;
        gotoStart();
      });
      wrap.appendChild(btn);
    });
  }

  function renderTablesFallback(count=15){
    const wrap = $('table-container');
    if (!wrap) return;
    wrap.innerHTML = '';
    wrap.classList.add('place-items-center','justify-center');

    for (let i=1;i<=count;i++){
      const key = String(i);
      const btn = document.createElement('button');
      btn.className = 'flex items-center justify-center rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold shadow px-4 py-3 sm:px-6 sm:py-4 w-28 h-20 sm:w-40 sm:h-28 text-sm sm:text-lg';
      btn.textContent = 'Bàn ' + key;
      btn.addEventListener('click', ()=>{
        const url = window.getLinkForTable ? window.getLinkForTable(key) : null;
        setTable(key, url || null);
        if (elTable) elTable.textContent = key;
        gotoStart();
      });
      wrap.appendChild(btn);
    }
  }

  if (btnStart){
    btnStart.addEventListener('click', ()=>{
      const {url} = getTable();
      if (!url){
        alert('Chưa có link POS của bàn này.');
        gotoSelect(false);
        return;
      }
      gotoPos(url);
    });
  }

  // Admin đổi bàn từ xa (device-bind phát event này)
  window.addEventListener('tngon:tableChanged', (ev)=>{
    const { table, url } = ev.detail || {};
    if (!table) return;
    setTable(table, url ?? window.getLinkForTable?.(table) ?? LS.getItem(LS_TURL) ?? null);
    if (elTable) elTable.textContent = table;
    gotoStart();
  });

  // Boot
  (async function(){
    const map = await loadLinks();
    if (map) renderTablesFromMap(map);
    else     renderTablesFallback(15); // vẫn hiện nút chọn bàn để dùng tạm

    const state = getState();
    const {id, url} = getTable();
    if (state==='pos' && url){ gotoPos(url); }
    else if (state==='start' && id){ if (elTable) elTable.textContent=id; gotoStart(); }
    else { gotoSelect(false); }
  })();

})();
