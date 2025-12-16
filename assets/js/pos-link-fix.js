// assets/js/pos-link-fix.js (LIVE-FIRST)
(function(){
  'use strict';
  const log = (...a)=>console.log('[pos-link-fix]', ...a);
  const warn= (...a)=>console.warn('[pos-link-fix]', ...a);

  function lsGet(k, d=''){ try{ return localStorage.getItem(k) ?? d; }catch{ return d; } }
  function lsSet(k, v){ try{ localStorage.setItem(k, v); }catch{} }
  function lsDel(k){ try{ localStorage.removeItem(k); }catch{} }

  function getTable(){ return (lsGet('tableId','')||'').trim(); }
  function getDeviceId(){ return (lsGet('deviceId','')||'').trim(); }

  function clearPosCache(){
    ['posUrl','posLink','lastPosUrl','lastPosHref'].forEach(lsDel);
  }

  async function loadLinksFreshFallback(){
    const res = await fetch('./links.json?cb='+Date.now(), { cache:'no-store' });
    if (!res.ok) throw new Error('links.json fetch failed: '+res.status);
    const data = await res.json();
    return data.links || data;
  }

  async function resolvePosUrl(){
    const table = getTable();
    if (!table) throw new Error('Chưa có tableId');

    // 1) PRIMARY: link từ redirect-core (LIVE MAP)
    const live = (typeof window.getLinkForTable === 'function') ? window.getLinkForTable(table) : null;
    if (live) return String(live);

    // 2) SECONDARY: nếu listener nào đó set posLink
    const cached = lsGet('posLink','');
    if (cached) return String(cached);

    // 3) FALLBACK: links.json
    const links = await loadLinksFreshFallback();
    const url = links[table] || links[String(table)] || '';
    if (!url) throw new Error('Không tìm thấy link cho bàn '+table);
    return String(url);
  }

  function goPos(url){
    if (typeof window.gotoPos === 'function'){
      return window.gotoPos(url);
    }
    const frame = document.getElementById('pos-frame');
    if (frame){ frame.src = url; }
    lsSet('appState','pos');
    const sel = document.getElementById('select-table');
    const start= document.getElementById('start-screen');
    const pos  = document.getElementById('pos-container');
    sel && (sel.classList.add('hidden'));
    start && (start.classList.add('hidden'));
    pos && (pos.classList.remove('hidden'));
  }

  function hookStartButton(){
    const btn = document.getElementById('start-order');
    if (!btn) return;

    btn.addEventListener('click', async (ev)=>{
      ev.stopImmediatePropagation?.();
      ev.preventDefault?.();

      try{
        clearPosCache();
        const url = await resolvePosUrl();
        log('start -> url', url);
        goPos(url);
      }catch(e){
        warn('start failed:', e?.message||e);
        alert('Không lấy được link gọi món cho bàn hiện tại. Vui lòng thử lại.');
      }
      return false;
    }, true);
  }

  function hookLocalStorageTableChange(){
    window.addEventListener('storage', (e)=>{
      if ((e.key||'')==='tableId'){
        log('tableId changed via storage:', e.newValue);
        clearPosCache();
        const l = document.getElementById('selected-table');
        if (l) l.textContent = (e.newValue||'').replace('+','');
      }
    });
  }

  async function hookDBSetTable(){
    if (!window.firebase || !firebase.apps?.length) return;
    if (!firebase.auth().currentUser){
      try{ await firebase.auth().signInAnonymously(); }catch{}
      await new Promise(r=>{
        const un = firebase.auth().onAuthStateChanged(u=>{ if(u){ un(); r(); }});
        setTimeout(r, 1500);
      });
    }
    const deviceId = getDeviceId();
    if (!deviceId) return;

    const db = firebase.database();
    db.ref('devices/'+deviceId+'/commands/setTable').on('value', s=>{
      const v = s.val();
      if (!v || !v.value) return;
      const newTable = String(v.value).trim();
      if (!newTable) return;

      const oldTable = getTable();
      if (newTable !== oldTable){
        log('admin setTable ->', newTable, '(old:', oldTable, ')');
        lsSet('tableId', newTable);
        clearPosCache();
        if (typeof window.gotoStart === 'function') window.gotoStart();
      }
    });
  }

  function wrapGotoStart(){
    if (typeof window.gotoStart !== 'function') return;
    const orig = window.gotoStart;
    window.gotoStart = function(){
      clearPosCache();
      return orig.apply(this, arguments);
    };
  }

  window.setTableAndReset = function(newTable){
    lsSet('tableId', String(newTable));
    clearPosCache();
    if (typeof window.gotoStart === 'function') window.gotoStart();
  };

  function boot(){
    hookStartButton();
    hookLocalStorageTableChange();
    hookDBSetTable();
    wrapGotoStart();
    log('patch ready (live-first)');
  }

  if (document.readyState==='loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
