// assets/js/redirect-core.js
// v6 — START ORDER luôn resolve URL mới, chỉ set iframe.src (không đổi location)
// - Nếu không có URL hợp lệ cho bàn → không điều hướng, không về Select

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
    // Ưu tiên hàm custom
    if (typeof window.__getPosUrl === 'function'){
      try{
        const u = window.__getPosUrl(id);
        if (u && typeof u === 'string') return u;
      }catch(_){}
    }
    // Dựa vào map
    if (LINKS_MAP && LINKS_MAP[id]) return LINKS_MAP[id];

    // Không có URL hợp lệ → trả rỗng (KHÔNG cố fallback để tránh reload trang)
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
    if (!finalUrl) {
      console.warn('[redirect-core] Không có URL POS cho bàn', t.id);
      // Ở nguyên màn Start, KHÔNG chuyển về Select, KHÔNG reload
      addHidden(selSelect);
      removeHidden(selStart);
      addHidden(selPos); if (iframe) iframe.src = 'about:blank';
      setState('start');
      return;
    }

    if (typeof window.__openPOS === 'function'){
      try { window.__openPOS(t.id, finalUrl); } catch(_) {}
      // vẫn cập nhật state về POS cho thống nhất
      addHidden(selSelect);
      addHidden(selStart);
      removeHidden(selPos);
      setState('pos');
    } else {
      if (iframe) iframe.src = finalUrl;
      addHidden(selSelect);
      addHidden(selStart);
      removeHidden(selPos);
      setState('pos');
    }
  }

  window.gotoSelect = gotoSelect;
  window.gotoStart  = gotoStart;
  window.gotoPos    = gotoPos;

  // ===== Render chọn bàn từ links.json =====
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
        const url = resolveUrlForTable(key);
        setTable(key, url);
        try { document.dispatchEvent(new CustomEvent('tngon:user-selected-table', { detail: { table: String(key) } })); } catch(_){}
        gotoStart();
      });
      wrap.appendChild(btn);
    });
  }

  // ===== START ORDER =====
  btnStart.addEventListener('click', (e)=>{
    e.preventDefault(); // chặn mọi default anchor hành vi (nếu trong HTML đổi thành <a>)
    const { id } = getTable();
    const urlNow = resolveUrlForTable(id);
    if (!id || !urlNow){
      console.warn('[redirect-core] START: thiếu id/url, id=', id, ' url=', urlNow);
      // Ở nguyên màn Start
      gotoStart();
      return;
    }
    setTable(id, urlNow);   // lưu lại url đã resolve mới nhất
    gotoPos(urlNow);        // chỉ set iframe.src
  });

  // ===== Secret button giữ nguyên =====
  (function wireSecret(){
    let pressTimer = null;
    let clickCount = 0;
    let clickTimer = null;

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
  document.addEventListener('tngon:external-set-table', (ev)=>{
    const table = String(ev?.detail?.table || '').trim();
    if (!table) { gotoSelect(true); return; }
    const url = resolveUrlForTable(table);
    setTable(table, url);
    gotoStart(); // KHÔNG tự vào POS
  });

  // ===== Boot =====
  (async function boot(){
    const state = getState();
    const current = getTable();

    LINKS_MAP = await loadLinks();
    if (LINKS_MAP) renderTables(LINKS_MAP);

    const wantStart = localStorage.getItem('startupMode') === 'start';

    if (state === 'pos' && current.id) {
      const freshUrl = resolveUrlForTable(current.id);
      setTable(current.id, freshUrl);
      gotoPos(freshUrl);
    } else if ((state === 'start' || wantStart) && current.id) {
      const freshUrl = resolveUrlForTable(current.id);
      setTable(current.id, freshUrl);
      gotoStart();
      setTimeout(()=> localStorage.removeItem('startupMode'), 200);
    } else {
      gotoSelect(false);
    }
  })();

})();
