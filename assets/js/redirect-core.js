// assets/js/redirect-core.js
(function(){
  'use strict';

  const $ = (id) => document.getElementById(id);
  const selSelect = $('select-table');
  const selStart  = $('start-screen');
  const selPos    = $('pos-container');
  const iframe    = $('pos-frame');

  const btnStart   = $('start-order');
  const tableNumEl = $('selected-table');

  const secretBtn  = $('back-btn-start');

  const popup      = $('password-popup');
  const passInput  = $('password-input');
  const passOk     = $('password-ok');
  const passCancel = $('password-cancel');
  const passErr    = $('password-error');

  // ===== Helpers =====
  function addHidden(el){ el.classList.add('hidden'); if (el===selPos) el.style.display='none'; }
  function removeHidden(el){ el.classList.remove('hidden'); if (el===selPos) el.style.display=''; }
  function cacheBust(url){ return url + (url.includes('?') ? '&' : '?') + 'cb=' + Date.now(); }

  function setState(s){ localStorage.setItem('appState', s); }
  function getState(){ return localStorage.getItem('appState') || 'select'; }

  function setTable(id, url){
    localStorage.setItem('tableId', String(id || ''));
    localStorage.setItem('tableUrl', url || '');
    // cho blackout.js biết
    window.tableId = String(id || '');
    if (tableNumEl) tableNumEl.textContent = String(id || '');
  }
  function getTable(){
    return {
      id:  localStorage.getItem('tableId') || '',
      url: localStorage.getItem('tableUrl') || ''
    };
  }
  function clearAllState(){
    localStorage.removeItem('tableId');
    localStorage.removeItem('tableUrl');
    localStorage.removeItem('appState');
    delete window.tableId;
  }

  // ===== Links.json =====
  let LINKS_MAP = null;

  async function loadLinks(){
    try{
      const res = await fetch(cacheBust('./links.json'), { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP '+res.status);
      const data = await res.json();
      const map = data?.links && typeof data.links === 'object' ? data.links : data;
      if (map && typeof map === 'object' && !Array.isArray(map)) return map;
      throw new Error('links.json invalid shape');
    }catch(e){
      console.error('[redirect-core] loadLinks error:', e);
      return null;
    }
  }

  function resolveUrlForTable(tableId){
    const id = String(tableId || '');
    if (!id) return '';
    // Nếu có hàm custom, ưu tiên dùng
    if (typeof window.__getPosUrl === 'function'){
      try{
        const u = window.__getPosUrl(id);
        if (u && typeof u === 'string') return u;
      }catch(_){}
    }
    // Nếu có LINKS_MAP, lấy từ map
    if (LINKS_MAP && LINKS_MAP[id]) return LINKS_MAP[id];

    // Fallback: nếu đang có iframe.src, chỉ thay query ?table
    try{
      const base = iframe?.src && iframe.src !== 'about:blank' ? iframe.src : (location.origin + location.pathname);
      const url  = new URL(base, location.origin);
      url.searchParams.set('table', id);
      return url.toString();
    }catch(_){}
    return '';
  }

  // ===== Navigation =====
  function gotoSelect(clear=true){
    addHidden(selPos); if (iframe) iframe.src = 'about:blank';
    addHidden(selStart);
    removeHidden(selSelect);
    if (clear) clearAllState();
    setState('select');
  }
  function gotoStart(){
    addHidden(selPos); if (iframe) iframe.src = 'about:blank';
    const {id} = getTable();
    if (!id) { gotoSelect(true); return; }
    if (tableNumEl) tableNumEl.textContent = id;
    addHidden(selSelect);
    removeHidden(selStart);
    setState('start');
  }
  function gotoPos(url){
    const t = getTable();
    const finalUrl = url || t.url || resolveUrlForTable(t.id);
    if (!finalUrl) { gotoSelect(true); return; }

    // Nếu có hàm custom để mở POS, cho phép override
    if (typeof window.__openPOS === 'function'){
      try { window.__openPOS(t.id, finalUrl); } catch(_) {}
    } else {
      if (iframe) iframe.src = finalUrl;
      addHidden(selSelect);
      addHidden(selStart);
      removeHidden(selPos);
      setState('pos');
    }
  }

  // expose nếu cần dùng ngoài
  window.gotoSelect = gotoSelect;
  window.gotoStart  = gotoStart;
  window.gotoPos    = gotoPos;

  // ===== Render lưới bàn từ links.json =====
  function renderTables(map){
    const wrap = $('table-container');
    if (!wrap) return;
    wrap.innerHTML = '';
    wrap.classList.add('place-items-center','justify-center');

    const keys = Object.keys(map).sort((a,b)=> Number(a)-Number(b));
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
        const url = resolveUrlForTable(key); // luôn tính theo map mới nhất
        setTable(key, url);
        // Báo cho các module khác biết user chọn thủ công
        try { document.dispatchEvent(new CustomEvent('tngon:user-selected-table', { detail: { table: String(key) } })); } catch(_){}
        gotoStart();
      });
      wrap.appendChild(btn);
    });
  }

  // ===== START ORDER =====
  btnStart.addEventListener('click', ()=>{
    const { id } = getTable();
    const urlNow = resolveUrlForTable(id); // luôn resolve lại để tránh “link cũ”
    if (!id || !urlNow){ gotoSelect(true); return; }
    // lưu lại url vừa resolve
    setTable(id, urlNow);
    gotoPos(urlNow);
  });

  // ===== Secret button (giữ nguyên) =====
  (function wireSecret(){
    let pressTimer = null;
    let clickCount = 0;
    let clickTimer = null;

    // 5 click/3s → vào Start (giữ bàn)
    secretBtn.addEventListener('click', ()=>{
      if (!clickTimer) {
        clickTimer = setTimeout(()=>{ clickCount = 0; clickTimer = null; }, 3000);
      }
      clickCount++;
      if (clickCount >= 5) {
        clearTimeout(clickTimer); clickTimer = null; clickCount = 0;
        gotoStart();
      }
    });

    // Long press 4s → popup mật mã → đúng thì về Select (xoá sạch)
    const LONG_MS = 4000;
    function startPress(){
      if (pressTimer) return;
      pressTimer = setTimeout(()=>{
        pressTimer = null;
        if (!popup) return;
        passErr?.classList.add('hidden');
        passInput.value = '';
        popup.classList.remove('hidden');

        function close(){ popup.classList.add('hidden'); }
        passCancel.onclick = ()=> close();
        passOk.onclick = ()=>{
          if (passInput.value === '6868') {
            close();
            gotoSelect(true);
          } else {
            passErr?.classList.remove('hidden');
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

  // ===== Nhận tín hiệu từ device-bind/admin =====
  // Admin đổi số bàn -> device-bind phát event này
  document.addEventListener('tngon:external-set-table', (ev)=>{
    const table = String(ev?.detail?.table || '').trim();
    if (!table) { gotoSelect(true); return; }
    const url = resolveUrlForTable(table);
    setTable(table, url);
    gotoStart(); // KHÔNG tự vào POS — để nhân viên bấm START
  });

  // ===== Boot =====
  (async function boot(){
    const state = getState();
    const current = getTable();

    LINKS_MAP = await loadLinks();
    if (LINKS_MAP) renderTables(LINKS_MAP);

    // Nếu device-bind đặt cờ "vào start ngay"
    const wantStart = localStorage.getItem('startupMode') === 'start';

    if (state === 'pos' && current.url) {
      // Resolve lại URL theo links mới (nếu có)
      const freshUrl = resolveUrlForTable(current.id) || current.url;
      setTable(current.id, freshUrl);
      gotoPos(freshUrl);
    } else if ((state === 'start' || wantStart) && current.id) {
      const freshUrl = resolveUrlForTable(current.id) || current.url;
      setTable(current.id, freshUrl);
      gotoStart();
      // dọn cờ (nếu có)
      setTimeout(()=> localStorage.removeItem('startupMode'), 200);
    } else {
      gotoSelect(false);
    }
  })();

})();
