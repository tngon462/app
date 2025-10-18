// assets/js/redirect-core.js
// Core UI + State + Secret button (left only)

(function(){
  'use strict';

  // ====== helpers ======
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

  function show(el){ el.classList.remove('hidden'); }
  function hide(el){ el.classList.add('hidden'); }

  function cacheBust(url){ return url + (url.includes('?') ? '&' : '?') + 'cb=' + Date.now(); }

  // ====== state in localStorage ======
  function setState(s){ localStorage.setItem('appState', s); }
  function getState(){ return localStorage.getItem('appState') || 'select'; }

  function setTable(id, url){
    localStorage.setItem('tableId', String(id));
    localStorage.setItem('tableUrl', url);
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

  // ====== navigation helpers (exposed for blackout/QRback if needed) ======
  function gotoSelect(clear=true){
    hide(selPos);
    iframe.src = 'about:blank';
    hide(selStart);
    show(selSelect);
    if (clear) clearAllState();
    setState('select');
  }
  function gotoStart(){
    hide(selPos);
    iframe.src = 'about:blank';
    const {id} = getTable();
    if (!id) { gotoSelect(true); return; }
    tableNumEl.textContent = id; // hiển thị chỉ số
    hide(selSelect);
    show(selStart);
    setState('start');
  }
  function gotoPos(url){
    if (!url) {
      const t = getTable();
      if (!t.url) { gotoSelect(true); return; }
      url = t.url;
    }
    iframe.src = url;
    hide(selSelect);
    hide(selStart);
    show(selPos);
    setState('pos');
  }

  // expose
  window.gotoSelect = gotoSelect;
  window.gotoStart  = gotoStart;
  window.gotoPos    = gotoPos;

  // ====== render tables from links.json ======
  async function loadLinks(){
    try{
      const res = await fetch(cacheBust('./links.json'), { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP '+res.status);
      const data = await res.json();
      // hỗ trợ 2 định dạng: {links:{...}} hoặc {...}
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
    const keys = Object.keys(map).sort((a,b)=>Number(a)-Number(b));

    keys.forEach((key)=>{
      const btn = document.createElement('button');
      btn.className = [
        'flex items-center justify-center',
        'rounded-lg',
        'bg-blue-600 hover:bg-blue-700',
        'text-white font-bold',
        'shadow',
        'px-4 py-3',           // mobile padding
        'sm:px-6 sm:py-4',     // larger on sm+
        'w-28 h-20 sm:w-40 sm:h-28', // size responsive
        'text-sm sm:text-lg'   // text responsive
      ].join(' ');
      btn.textContent = 'Bàn ' + key;
      btn.addEventListener('click', ()=>{
        const url = map[key];
        setTable(key, url);
        tableNumEl.textContent = key;
        gotoStart(); // sang màn start (không mở POS ngay)
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

  // ====== secret button (LEFT ONLY) ======
  // - 5 click trong 3s => về START (không xóa bàn)
  // - long press 7s => yêu cầu mật mã 6868 => về SELECT (xóa sạch)
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
        // về START
        gotoStart(); // KHÔNG clear table
      }
    });

    // Long press 7s
    const LONG_MS = 7000;
    function startPress(){
      if (pressTimer) return;
      pressTimer = setTimeout(()=>{
        pressTimer = null;
        // mở popup nhập mật khẩu
        passErr.classList.add('hidden');
        passInput.value = '';
        // Một số iOS webapp chặn focus auto — vẫn mở popup và để user tap vào input
        popup.classList.remove('hidden');

        function closePopup(){ popup.classList.add('hidden'); }
        passCancel.onclick = ()=> closePopup();
        passOk.onclick = ()=>{
          if (passInput.value === '6868') {
            closePopup();
            // về SELECT, xóa sạch
            gotoSelect(true);
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
    // 1) Nếu đã có state cũ: khôi phục
    const state = getState();
    const {id, url} = getTable();

    // 2) Tải link để render nút
    const map = await loadLinks();
    if (map) renderTables(map);

    // 3) Khôi phục UI
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