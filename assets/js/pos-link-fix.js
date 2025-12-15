// assets/js/pos-link-fix.js
(function(){
  'use strict';
  const log  = (...a)=>console.log('[tngon] [pos-link-fix]', ...a);
  const warn = (...a)=>console.warn('[tngon] [pos-link-fix]', ...a);

  function lsGet(k, d=''){ try{ return localStorage.getItem(k) ?? d; }catch{ return d; } }
  function lsSet(k, v){ try{ localStorage.setItem(k, v); }catch{} }
  function lsDel(k){ try{ localStorage.removeItem(k); }catch{} }

  function getTable(){ return (lsGet('tableId','')||'').trim(); }

  function clearPosCache(){
    // dọn các khóa có thể giữ URL cũ
    ['posUrl','posLink','lastPosUrl','lastPosHref','tableUrl'].forEach(lsDel);
  }

  // ====== LIVE MAP (Firebase links_live) ======
  function getLiveLinksMap(){
    // links-live-listener.js nên set 1 trong các biến dưới:
    // - window.__LINKS_LIVE_MAP
    // - window.TNGON_LINKS_LIVE.links
    try{
      if (window.__LINKS_LIVE_MAP && typeof window.__LINKS_LIVE_MAP === 'object') return window.__LINKS_LIVE_MAP;
      if (window.TNGON_LINKS_LIVE && window.TNGON_LINKS_LIVE.links && typeof window.TNGON_LINKS_LIVE.links === 'object') {
        return window.TNGON_LINKS_LIVE.links;
      }
    }catch{}
    return null;
  }

  async function loadLinksJsonFresh(){
    // cache-bust để không dính SW cache
    const res = await fetch('./links.json?cb='+Date.now(), { cache:'no-store' });
    if (!res.ok) throw new Error('links.json fetch failed: '+res.status);
    const data = await res.json();
    return data.links || data; // hỗ trợ 2 dạng
  }

  async function resolvePosUrlPreferLive(){
    const table = getTable();
    if (!table) throw new Error('Chưa có tableId');

    // 1) Ưu tiên LIVE
    const live = getLiveLinksMap();
    if (live && (live[table] || live[String(table)])){
      const url = String(live[table] || live[String(table)] || '').trim();
      if (url) return { url, from: 'LIVE' };
    }

    // 2) Fallback GitHub links.json
    const links = await loadLinksJsonFresh();
    const url = String(links[table] || links[String(table)] || '').trim();
    if (!url) throw new Error('Không tìm thấy link cho bàn '+table);
    return { url, from: 'GITHUB' };
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
    sel && sel.classList.add('hidden');
    start && start.classList.add('hidden');
    pos && pos.classList.remove('hidden');
  }

  // Hook nút START ORDER: luôn lấy link MỚI theo bàn hiện tại (ưu tiên LIVE)
  function hookStartButton(){
    const btn = document.getElementById('start-order');
    if (!btn) return;

    btn.addEventListener('click', async (ev)=>{
      ev.stopImmediatePropagation?.();
      ev.preventDefault?.();

      try{
        clearPosCache();
        const { url, from } = await resolvePosUrlPreferLive();
        log(`start -> url ${url} (from ${from})`);
        goPos(url);
      }catch(e){
        warn('start failed:', e?.message||e);
        alert('Không lấy được link gọi món cho bàn hiện tại. Vui lòng thử lại.');
      }
      return false;
    }, true);
  }

  // Khi tableId đổi => dọn cache
  function hookTableChange(){
    window.addEventListener('storage', (e)=>{
      if ((e.key||'') === 'tableId'){
        log('tableId changed:', e.newValue);
        clearPosCache();
        const l = document.getElementById('selected-table');
        if (l) l.textContent = (e.newValue||'').replace('+','');
      }
    });
  }

  // Wrap gotoStart: về start thì xóa cache URL cũ
  function wrapGotoStart(){
    if (typeof window.gotoStart !== 'function') return;
    const orig = window.gotoStart;
    window.gotoStart = function(){
      clearPosCache();
      return orig.apply(this, arguments);
    };
  }

  function boot(){
    hookStartButton();
    hookTableChange();
    wrapGotoStart();
    log('patch ready (prefer links_live)');
  }

  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
