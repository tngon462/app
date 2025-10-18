// assets/js/redirect-core.js
(function(){
  'use strict';

  const $ = (id) => document.getElementById(id);
  const selSelect = $('select-table');
  const selStart  = $('start-screen');
  const selPos    = $('pos-container');
  const iframe    = $('pos-frame');

  const btnStart  = $('start-order');
  const tableNumEl = $('selected-table');

  const secretBtn = $('back-btn-start');

  const popup     = $('password-popup');
  const passInput = $('password-input');
  const passOk    = $('password-ok');
  const passCancel= $('password-cancel');
  const passErr   = $('password-error');

  function addHidden(el){ el.classList.add('hidden'); if (el===selPos) el.style.display='none'; }
  function removeHidden(el){ el.classList.remove('hidden'); if (el===selPos) el.style.display=''; }

  function cacheBust(url){ return url + (url.includes('?') ? '&' : '?') + 'cb=' + Date.now(); }

  // ====== state ======
  function setState(s){ localStorage.setItem('appState', s); }
  function getState(){ return localStorage.getItem('appState') || 'select'; }

  function setTable(id, url){
    localStorage.setItem('tableId', String(id));
    localStorage.setItem('tableUrl', url);
    // cho blackout.js biết
    window.tableId = String(id);
  }
  function getTable(){
    return {
      id:   localStorage.getItem('tableId'),
      url:  localStorage.getItem('tableUrl')
    };
  }
  function clearAllState(){
    localStorage.removeItem('tableId');
    localStorage.removeItem('tableUrl');
    localStorage.removeItem('appState');
    delete window.tableId;
  }

  // ====== navigation ======
  function gotoSelect(clear=true){
    addHidden(selPos);
    iframe.src = 'about:blank';
    addHidden(selStart);
    removeHidden(selSelect);
    if (clear) clearAllState();
    setState('select');
  }
  function gotoStart(){
    addHidden(selPos);
    iframe.src = 'about:blank';
    const {id} = getTable();
    if (!id) { gotoSelect(true); return; }
    tableNumEl.textContent = id;
    addHidden(selSelect);
    removeHidden(selStart);
    setState('start');
  }
  function gotoPos(url){
    const t = getTable();
    const finalUrl = url || t.url;
    if (!finalUrl) { gotoSelect(true); return; }
    iframe.src = finalUrl;
    addHidden(selSelect);
    addHidden(selStart);
    removeHidden(selPos);
    setState('pos');
  }

  // expose if needed externally
  window.gotoSelect = gotoSelect;
  window.gotoStart  = gotoStart;
  window.gotoPos    = gotoPos;

  // ====== render tables from links.json ======
  async function loadLinks(){
    try{
      const res = await fetch(cacheBust('./links.json'), { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP '+res.status);
      const data = await res.json();
      // hỗ trợ {links:{...}} hoặc map phẳng
      const map = data.links || data;
      if (map && typeof map === 'object' && !Array.isArray(map)) return map;
      throw new Error('links.json invalid shape');
    }catch(e){
      console.error('[redirect-core] loadLinks error:', e);
      return null;
    }
  }

  function renderTables(map){
    const wrap = $('table-container');
    wrap.innerHTML = '';

    // đảm bảo grid căn giữa
    wrap.classList.add('place-items-center','justify-center');

    const keys = Object.keys(map).sort((a,b)=>Number(a)-Number(b));
    keys.forEach((key)=>{
      const btn = document.createElement('button');
      btn.className = [
        'flex items-center justify-center',
        'rounded-lg',
        'bg-blue-600 hover:bg-blue-700',
        'text-white font-bold',
        'shadow',
        'px-4 py-3',
        'sm:px-6 sm:py-4',
        'w-28 h-20 sm:w-40 sm:h-28',
        'text-sm sm:text-lg'
      ].join(' ');
      btn.textContent = 'Bàn ' + key;
      btn.addEventListener('click', ()=>{
        const url = map[key];
        setTable(key, url);
        tableNumEl.textContent = key;
        gotoStart();
      });
      wrap.appendChild(btn);
    });
  }

  // ====== START button ======
  btnStart.addEventListener('click', ()=>{
    const {url} = getTable();
    if (!url) { gotoSelect(true); return; }
    gotoPos(url);
  });

  // ====== secret button: 5 click/3s => START, long press 7s => mật mã => SELECT ======
  (function wireSecret(){
    let pressTimer = null;
    let clickCount = 0;
    let clickTimer = null;

    // Click logic: 5 lần/3s
    secretBtn.addEventListener('click', ()=>{
      if (!clickTimer) {
        clickTimer = setTimeout(()=>{
          clickCount = 0;
          clickTimer = null;
        }, 3000);
      }
      clickCount++;
      if (clickCount >= 5) {
        clearTimeout(clickTimer); clickTimer = null; clickCount = 0;
        gotoStart(); // không xoá bàn
      }
    });

    // Long press 7s => popup mật mã
    const LONG_MS = 4000;
    function startPress(){
      if (pressTimer) return;
      pressTimer = setTimeout(()=>{
        pressTimer = null;
        passErr.classList.add('hidden');
        passInput.value = '';
        // iOS PWA có thể không auto-focus, để user tap
        popup.classList.remove('hidden');

        function close(){ popup.classList.add('hidden'); }
        passCancel.onclick = ()=> close();
        passOk.onclick = ()=>{
          if (passInput.value === '6868') {
            close();
            gotoSelect(true); // xoá sạch
          } else {
            passErr.classList.remove('hidden');
          }
        };
      }, LONG_MS);
    }
    function endPress(){
      if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
    }
    secretBtn.addEventListener('touchstart', startPress, {passive:false});
    secretBtn.addEventListener('mousedown', startPress);
    secretBtn.addEventListener('touchend', endPress);
    secretBtn.addEventListener('mouseup', endPress);
    secretBtn.addEventListener('mouseleave', endPress);
  })();

  // ====== boot ======
  (async function boot(){
    const state = getState();
    const {id, url} = getTable();

    const map = await loadLinks();
    if (map) renderTables(map);

    if (state === 'pos' && url) {
      gotoPos(url);
    } else if (state === 'start' && id) {
      tableNumEl.textContent = id;
      gotoStart();
    } else {
      gotoSelect(false);
    }
  })();

})();