/**
 * assets/js/redirect-core.js (updated 2025-11-03)
 * - Giữ nguyên 3 màn: #select-table, #start-screen, #pos-container
 * - Load links.json từ GitHub repo tngon462/QR (raw.githubusercontent.com)
 * - Fallback local nếu lỗi mạng
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

async function loadLinks(){
  // 1) ƯU TIÊN: Firebase links_live
  try {
    if (window.firebase && firebase.database) {
      console.log('[redirect-core] 🔥 Ưu tiên lấy links từ Firebase links_live...');
      const snap = await firebase.database().ref('links_live').get();
      const v = snap && snap.val ? snap.val() : null;
      const map = v && v.links ? v.links : null;
      if (map && typeof map === 'object' && !Array.isArray(map) && Object.keys(map).length){
        _applyLinksMap(map, 'firebase:get');
        console.log('[redirect-core] ✅ Loaded links_live:', Object.keys(map).length, 'bàn');
        return map;
      }
    }
  } catch (e) {
    console.warn('[redirect-core] ⚠️ Firebase links_live fail -> fallback GitHub', e);
  }

  // 2) FALLBACK: GitHub links.json
  const remoteUrl = 'https://raw.githubusercontent.com/tngon462/QR/main/links.json?cb=' + Date.now();
  const localUrl  = './links.json?cb=' + Date.now();

  try {
    console.log('[redirect-core] 📡 Đang tải links.json từ repo QR...');
    const res = await fetch(remoteUrl, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const map = data?.links || data;
    if (!map || typeof map !== 'object' || Array.isArray(map)) throw new Error('invalid links.json shape');
    _applyLinksMap(map, 'github');
    console.log('[redirect-core] ✅ Loaded links.json từ QR repo:', Object.keys(map).length, 'bàn');
    return map;
  } catch (e) {
    console.warn('[redirect-core] ⚠️ Không tải được online, thử bản local:', e);
    const res2 = await fetch(localUrl, { cache: 'no-store' });
    const data2 = await res2.json();
    const map2 = data2?.links || data2;
    _applyLinksMap(map2, 'local');
    console.log('[redirect-core] ✅ Loaded links.json local:', Object.keys(map2).length, 'bàn');
    return map2;
  }
}


  // ----- realtime links_live -----
  let _linksLiveSubscribed = false;

  function _isValidLinksMap(map){
    return map && typeof map === 'object' && !Array.isArray(map) && Object.keys(map).length > 0;
  }

  function _applyLinksMap(map, source){
    if (!_isValidLinksMap(map)) return false;

    _applyLinksMap(map, 'github');

    // Nếu đang chọn bàn thì update lại tableUrl theo map mới
    const curId = LS.getItem(LS_TID);
    if (curId && (curId in map)) {
      const newUrl = map[curId];
      const oldUrl = LS.getItem(LS_TURL);
      if (newUrl && newUrl !== oldUrl) {
        LS.setItem(LS_TURL, newUrl);
        console.log('[links-live] 🔁 Update tableUrl bàn', curId, '->', newUrl);

        // Nếu đang ở POS thì reload iframe ngay
        if (getState() === 'pos' && iframe) {
          iframe.src = newUrl;
          console.log('[links-live] ▶️ Reload iframe (pos) theo link mới');
        }
      }
    }

    // Nếu đang ở màn chọn bàn thì re-render (để luôn đúng số bàn)
    if (getState() === 'select') {
      try { renderTablesFromMap(map); } catch(_){}
    }

    console.log('[links-live] ✅ Applied links from', source || 'unknown', '(', Object.keys(map).length, 'bàn )');
    return true;
  }

  function subscribeLinksLive(){
    if (_linksLiveSubscribed) return;
    if (!(window.firebase && firebase.database)) return;

    _linksLiveSubscribed = true;
    console.log('[redirect-core] 👂 Subscribe Firebase links_live realtime...');

    firebase.database().ref('links_live').on('value', (snap)=>{
      try{
        const v = snap && snap.val ? snap.val() : null;
        const map = v && v.links ? v.links : null;
        if (!_isValidLinksMap(map)) return;

        const changed = JSON.stringify(map) !== JSON.stringify(LINKS_MAP);
        if (changed){
          _applyLinksMap(map, 'firebase:onValue');
        }
      }catch(e){
        console.warn('[redirect-core] ⚠️ links_live onValue error', e);
      }
    }, (err)=>{
      console.warn('[redirect-core] ⚠️ links_live subscribe fail', err);
    });
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
    // Realtime: tự cập nhật ngay khi QRMASTER đổi link
    subscribeLinksLive();
    if (map) renderTablesFromMap(map);
    else     renderTablesFallback(15);

    const state = getState();
    const {id, url} = getTable();
    if (state==='pos' && url){ gotoPos(url); }
    else if (state==='start' && id){ if (elTable) elTable.textContent=id; gotoStart(); }
    else { gotoSelect(false); }

    // Cập nhật link mỗi 60 giây (tránh phải reload app)
    // Fallback: thỉnh thoảng refresh lại (phòng trường hợp realtime bị chặn)
    setInterval(() => {
      loadLinks().then(newMap => {
        if (newMap) _applyLinksMap(newMap, 'poll');
      }).catch(()=>{});
    }, 180000);
  })();

})();
