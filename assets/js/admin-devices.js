<!-- /assets/js/redirect-core.js -->
<script>
(function(){
  'use strict';
  const $ = (id)=>document.getElementById(id);
  const selSelect=$('select-table'), selStart=$('start-screen'), selPos=$('pos-container');
  const iframe=$('pos-frame'), btnStart=$('start-order'), tableNumEl=$('selected-table');
  const secretBtn=$('back-btn-start');

  const cacheBust=(u)=> u+(u.includes('?')?'&':'?')+'cb='+Date.now();

  // ===== State + Table =====
  function setState(s){ localStorage.setItem('appState', s); if (window.__reportStage) try{ window.__reportStage(s);}catch(_){ } }
  function getState(){ return localStorage.getItem('appState')||'select'; }
  function setTable(id,url){
    localStorage.setItem('tableId', String(id));
    localStorage.setItem('tableUrl', url||'');
    window.tableId = String(id);
    if (window.__reportTableChosen) try{ window.__reportTableChosen(String(id), url||''); }catch(_){ }
  }
  function getTable(){ return { id: localStorage.getItem('tableId'), url: localStorage.getItem('tableUrl') }; }
  function clearAllState(){ ['tableId','tableUrl','appState'].forEach(k=>localStorage.removeItem(k)); delete window.tableId; }

  // ===== Navigation =====
  function addHidden(el){ el.classList.add('hidden'); if(el===selPos) el.style.display='none'; }
  function removeHidden(el){ el.classList.remove('hidden'); if(el===selPos) el.style.display=''; }

  function gotoSelect(clear=true){
    addHidden(selPos); iframe.src='about:blank';
    addHidden(selStart); removeHidden(selSelect);
    if (clear) clearAllState();
    setState('select');
  }
  function gotoStart(){
    addHidden(selPos); iframe.src='about:blank';
    const {id}=getTable(); if(!id){ gotoSelect(true); return; }
    tableNumEl.textContent=id;
    addHidden(selSelect); removeHidden(selStart);
    setState('start');
  }
  function gotoPos(url){
    const t=getTable(); const finalUrl=url||t.url;
    if(!finalUrl){ gotoSelect(true); return; }
    iframe.src=finalUrl;
    addHidden(selSelect); addHidden(selStart); removeHidden(selPos);
    setState('pos');
  }

  window.gotoSelect=gotoSelect; window.gotoStart=gotoStart; window.gotoPos=gotoPos;

  // ===== Links loader =====
  let LINKS_MAP=null;
  async function loadLinks(){
    try{
      const res=await fetch(cacheBust('./links.json'), {cache:'no-store'});
      if(!res.ok) throw new Error('HTTP '+res.status);
      const data=await res.json();
      LINKS_MAP = data.links || data;
      if (!LINKS_MAP || Array.isArray(LINKS_MAP)) throw new Error('links.json invalid');
      return LINKS_MAP;
    }catch(e){ console.error('[redirect-core] loadLinks error:', e); LINKS_MAP=null; return null; }
  }

  function renderTables(map){
    const wrap=$('table-container'); wrap.innerHTML='';
    wrap.classList.add('place-items-center','justify-center');
    const keys=Object.keys(map).sort((a,b)=>Number(a)-Number(b));
    keys.forEach(key=>{
      const btn=document.createElement('button');
      btn.className='flex items-center justify-center rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold shadow px-4 py-3 sm:px-6 sm:py-4 w-28 h-20 sm:w-40 sm:h-28 text-sm sm:text-lg';
      btn.textContent='Bàn '+key;
      btn.addEventListener('click', ()=>{
        const url=map[key];
        setTable(key,url);
        gotoStart();
      });
      wrap.appendChild(btn);
    });
  }

  // ===== START button =====
  btnStart.addEventListener('click', ()=>{
    const {url}=getTable();
    if(!url){ gotoSelect(true); return; }
    gotoPos(url);
  });

  // ===== Secret button (giữ như cũ, rút gọn) =====
  (function wireSecret(){
    let pressTimer=null, clickCount=0, clickTimer=null;
    // 5 click / 3s => START
    secretBtn.addEventListener('click', ()=>{
      if(!clickTimer){ clickTimer=setTimeout(()=>{ clickCount=0; clickTimer=null; },3000); }
      clickCount++; if(clickCount>=5){ clearTimeout(clickTimer); clickTimer=null; clickCount=0; gotoStart(); }
    });
  })();

  // ===== Cho admin gọi: setTableById(id) =====
  async function setTableById(id){
    if(!LINKS_MAP) await loadLinks();
    const url = LINKS_MAP?.[String(id)];
    if(!url){ console.warn('[redirect-core] setTableById: không tìm thấy URL cho bàn', id); return false; }
    setTable(String(id), url);
    gotoStart();
    return true;
  }
  window.setTableByIdForAdmin = setTableById; // device-bind sẽ gọi

  // ===== Cho device-bind báo stage =====
  // window.__reportStage(stage) sẽ được gọi ở setState(...)
  // window.__reportTableChosen(id,url) được gọi khi chọn bàn thủ công

  // ===== boot =====
  (async function boot(){
    const map = await loadLinks();
    if(map) renderTables(map);

    const state=getState(); const {id,url}=getTable();
    if (state==='pos' && url) gotoPos(url);
    else if (state==='start' && id){ tableNumEl.textContent=id; gotoStart(); }
    else gotoSelect(false);
  })();
})();
</script>
