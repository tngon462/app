/**
 * assets/js/redirect-core.js (LIVE-FIRST)aaaa
 * - Giữ nguyên 3 màn: #select-table, #start-screen, #pos-container
 * - PRIMARY: nhận link realtime từ Firebase: links_live/{updated_at, links}
 * - FALLBACK: links.json (local) rồi mới tới GitHub raw (tuỳ chọn)
 * - Expose: window.gotoSelect/gotoStart/gotoPos + window.getLinkForTable
 *
 * Yêu cầu: Firebase đã init ở index.html trước khi load file này.
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

  // ✅ nếu url null/undefined -> xóa tableUrl để không dính link cũ
  if (url==null) LS.removeItem(LS_TURL);
  else LS.setItem(LS_TURL, String(url));

  window.tableId = String(id || '');
}
  function getTable(){ return { id:LS.getItem(LS_TID), url:LS.getItem(LS_TURL) }; }
  function clearTable(){
    LS.removeItem(LS_TID); LS.removeItem(LS_TURL); delete window.tableId;
  }

  // ✅ BACKWARD-COMPAT: gotoSelect(keepState?)
// - keepState=true: về Home nhưng giữ bàn
// - keepState=false: về Home và xóa bàn
function gotoSelect(keepState = true){
  hide(elPos); if (iframe) iframe.src = 'about:blank';
  hide(elStart);
  show(elSelect);

  if (!keepState) clearTable();     // 👈 đúng nghĩa keepState
  setState('select');
}

// ✅ BACKWARD-COMPAT: gotoStart(tableId?)
// - nếu truyền tableId: set bàn + set url theo LIVE map trước rồi mới vào Start
function gotoStart(tableId){
  if (tableId != null && String(tableId).trim() !== ''){
    const tid = String(tableId).trim();
    const liveUrl = window.getLinkForTable?.(tid) || null;
    setTable(tid, liveUrl || null);
  }

  const {id} = getTable();
  if (!id){ gotoSelect(true); return; }   // giữ state, không phá

  if (elTable) elTable.textContent = String(id).replace('+','');
  hide(elPos); if (iframe) iframe.src = 'about:blank';
  hide(elSelect);
  show(elStart);
  setState('start');
}
  
 function gotoPos(url){
  const t = getTable();

  // ✅ ưu tiên LIVE map trước (đúng tinh thần LIVE-FIRST)
  const liveUrl = t?.id ? (window.getLinkForTable?.(t.id) || null) : null;

  // url ưu tiên theo thứ tự: url truyền vào -> liveUrl -> tableUrl trong LS
  const finalUrl = url || liveUrl || t.url;

  if (!finalUrl){
    alert('Chưa có link POS của bàn này.');
    gotoSelect(false);
    return;
  }

  // ✅ ghi lại tableUrl chuẩn để không bao giờ dính link cũ nữa
  setTable(t.id, finalUrl);

  if (iframe) iframe.src = finalUrl;
  hide(elSelect); hide(elStart); show(elPos);
  setState('pos');
}

  // Expose
  window.gotoSelect = gotoSelect;
  window.gotoStart  = gotoStart;
  window.gotoPos    = gotoPos;

  // =========================
  // LINKS SOURCE (LIVE FIRST)
  // =========================
  let LINKS_MAP = null;                 // map { "1": "https://...", ... }
  let LIVE_UPDATED_AT = 0;              // unix seconds
  const LIVE_STALE_SECONDS = 120;       // quá 2 phút coi như QRMASTER off / stale

  // cache dự phòng để khỏi trắng màn khi refresh app
  const LS_LIVE_CACHE = 'linksLiveCache';     // JSON string {updated_at, links}
  const LS_LIVE_CACHE_AT = 'linksLiveCacheAt';// unix seconds lưu local

  function nowSec(){ return Math.floor(Date.now()/1000); }

  function setLinksMap(map, source){
    if (!map || typeof map !== 'object' || Array.isArray(map)) return false;
    LINKS_MAP = map;
    window.LINKS_MAP = map;
    console.log('[redirect-core] ✅ setLinksMap from', source, '| tables:', Object.keys(map).length);
    return true;
  }

  window.getLinkForTable = function(t){
    if (!LINKS_MAP) return null;
    const key = String(t);
    return (key in LINKS_MAP) ? LINKS_MAP[key] : null;
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
        // chọn bàn: URL ưu tiên LIVE
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

  // ===== FALLBACK links.json (chỉ dùng khi live stale/off) =====
  async function loadLinksJsonFallback(){
    // 1) local file (trong app) — nhanh nhất khi chạy offline
    const localUrl  = './links.json?cb=' + Date.now();
    // 2) GitHub raw (tuỳ chọn) — nếu sếp vẫn muốn
    const remoteUrl = 'https://raw.githubusercontent.com/tngon462/QR/main/links.json?cb=' + Date.now();

    // helper parse
    async function fetchJson(url){
      const res = await fetch(url, { cache:'no-store' });
      if (!res.ok) throw new Error('HTTP '+res.status);
      const data = await res.json();
      return data?.links || data;
    }

    try{
      console.warn('[redirect-core] ⚠️ LIVE stale/off → dùng fallback links.json (local)');
      const map1 = await fetchJson(localUrl);
      if (setLinksMap(map1, 'links.json local')) return map1;
    }catch(e1){
      console.warn('[redirect-core] local links.json fail:', e1?.message||e1);
    }

    try{
      console.warn('[redirect-core] ⚠️ local fail → thử GitHub raw links.json');
      const map2 = await fetchJson(remoteUrl);
      if (setLinksMap(map2, 'links.json GitHub')) return map2;
    }catch(e2){
      console.warn('[redirect-core] GitHub links.json fail:', e2?.message||e2);
    }

    return null;
  }

  function isLiveFresh(){
    if (!LIVE_UPDATED_AT) return false;
    return (nowSec() - LIVE_UPDATED_AT) <= LIVE_STALE_SECONDS;
  }

  function tryRestoreLiveCache(){
    try{
      const raw = LS.getItem(LS_LIVE_CACHE);
      if (!raw) return false;
      const obj = JSON.parse(raw);
      const links = obj?.links;
      const ua = Number(obj?.updated_at || 0);
      if (!links || typeof links !== 'object') return false;
      LIVE_UPDATED_AT = ua || 0;
      const ok = setLinksMap(links, 'LS cache');
      if (ok) console.log('[redirect-core] 🔁 restored links from LS cache', {updated_at: ua});
      return ok;
    }catch(_){
      return false;
    }
  }

  async function startLiveListener(){
    if (!window.firebase || !firebase.apps?.length){
      console.warn('[redirect-core] Firebase chưa init → bỏ live, chỉ fallback links.json');
      return;
    }

    // Nếu rule cần auth, sign-in ẩn danh (an toàn)
    try{
      if (firebase.auth && !firebase.auth().currentUser){
        await firebase.auth().signInAnonymously().catch(()=>{});
        await new Promise(res=>{
          const un = firebase.auth().onAuthStateChanged(u=>{ if(u){ un(); res(); }});
          setTimeout(res, 1500);
        });
      }
    }catch(_){}

    const db = firebase.database();
    const ref = db.ref('links_live');

    ref.on('value', async (snap)=>{
      const data = snap.val();
      const links = data?.links;
      const ua = Number(data?.updated_at || 0);

      if (links && typeof links === 'object'){
        LIVE_UPDATED_AT = ua || nowSec();
        setLinksMap(links, 'firebase links_live');
        try{
          LS.setItem(LS_LIVE_CACHE, JSON.stringify({ updated_at: LIVE_UPDATED_AT, links }));
          LS.setItem(LS_LIVE_CACHE_AT, String(nowSec()));
        }catch(_){}

        // nếu đang SELECT: render lại grid theo live
        const state = getState();
        if (state === 'select'){
          renderTablesFromMap(links);
        }

        // nếu đang POS: và bàn hiện tại có link mới → reload iframe (mềm)
        const t = getTable();
        if (t?.id){
          const newUrl = String(links[String(t.id)] || '');
          if (newUrl && newUrl !== String(t.url||'')){
            console.log('[redirect-core] 🔄 url đổi theo live:', t.id, newUrl);
            setTable(t.id, newUrl);
            // chỉ reload iframe nếu đang ở POS
            if (getState()==='pos' && iframe){
              iframe.src = newUrl;
            }
          }
        }
      }
    }, async (err)=>{
      console.warn('[redirect-core] live listener error:', err?.message||err);
      // lỗi live -> fallback ngay
      await loadLinksJsonFallback();
    });

    // watchdog: nếu live stale → fallback links.json (không phá live listener)
    setInterval(async ()=>{
      if (!isLiveFresh()){
        await loadLinksJsonFallback();
      }
    }, 15000);
  }

  // START ORDER: luôn lấy link “mới nhất” từ LINKS_MAP (live), nếu thiếu mới dùng tableUrl lưu sẵn
  if (btnStart){
    btnStart.addEventListener('click', ()=>{
      const t = getTable();
      const liveUrl = window.getLinkForTable?.(t.id) || null;
      const finalUrl = liveUrl || t.url;
      if (!finalUrl){
        alert('Chưa có link POS của bàn này.');
        gotoSelect(false);
        return;
      }
      setTable(t.id, finalUrl);
      gotoPos(finalUrl);
    });
  }

  // Admin đổi bàn từ xa (giữ như cũ)
  window.addEventListener('tngon:tableChanged', (ev)=>{
  const { table, url } = ev.detail || {};
  if (!table) return;

  // ✅ Đổi bàn: KHÔNG dùng lại tableUrl cũ
  const nextUrl = url ?? window.getLinkForTable?.(table) ?? null;
  setTable(table, nextUrl);

  if (elTable) elTable.textContent = String(table).replace('+','');
  gotoStart(table); // cho chắc tương thích admin
});

  // Boot
  (async function(){
    // 1) ưu tiên restore cache để không trắng màn lúc mới mở app
    const restored = tryRestoreLiveCache();

    // 2) nếu đã có map (cache) -> render ngay
    if (LINKS_MAP) renderTablesFromMap(LINKS_MAP);

    // 3) bật live listener (sẽ update map ngay khi QRMASTER push)
    await startLiveListener();

    // 4) nếu chưa có gì (không cache, live chưa tới) -> fallback links.json ngay 1 lần
    if (!restored && !LINKS_MAP){
      const map = await loadLinksJsonFallback();
      if (map) renderTablesFromMap(map);
      else renderTablesFallback(15);
    }

    // 5) restore UI state
    const state = getState();
    const {id, url} = getTable();

    // khi vào lại: ưu tiên link live nếu có
    const liveUrl = id ? window.getLinkForTable?.(id) : null;
    const finalUrl = liveUrl || url || null;
    if (id && finalUrl) setTable(id, finalUrl);

    if (state==='pos' && finalUrl){
      gotoPos(finalUrl);
    } else if (state==='start' && id){
      if (elTable) elTable.textContent = String(id).replace('+','');
      gotoStart();
    } else {
      gotoSelect(false);
    }
  })();

})();
