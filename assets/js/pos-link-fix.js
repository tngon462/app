// assets/js/pos-link-fix.js
(function(){
  'use strict';
  const log = (...a)=>console.log('[pos-link-fix]', ...a);
  const warn= (...a)=>console.warn('[pos-link-fix]', ...a);

  function lsGet(k, d=''){ try{ return localStorage.getItem(k) ?? d; }catch{ return d; } }
  function lsSet(k, v){ try{ localStorage.setItem(k, v); }catch{} }
  function lsDel(k){ try{ localStorage.removeItem(k); }catch{} }

  function getTable(){ return (lsGet('tableId','')||'').trim(); }
  function getDeviceId(){ return (lsGet('deviceId','')||'').trim(); }

  // NOTE: tableUrl là URL "live" do links-live-listener cập nhật
  function getLiveTableUrl(){
    const u = (lsGet('tableUrl','')||'').trim();
    // chỉ nhận nếu đúng kiểu order link
    if (u.startsWith('https://order.atpos.net/order/public/checking/')) return u;
    return '';
  }

  function clearPosCache(){
    // dọn mọi khóa có thể giữ URL cũ (NHƯNG không xóa tableUrl vì đó là live)
    ['posUrl','posLink','lastPosUrl','lastPosHref'].forEach(lsDel);
  }

  async function loadLinksFresh(){
    // fallback: luôn cache-bust để không dính SW cache
    const res = await fetch('./links.json?cb='+Date.now(), { cache:'no-store' });
    if (!res.ok) throw new Error('links.json fetch failed: '+res.status);
    const data = await res.json();
    return data.links || data;
  }

  async function resolvePosUrlPreferLive(){
    const table = getTable();
    if (!table) throw new Error('Chưa có tableId');

    // 1) ƯU TIÊN: tableUrl từ Firebase (links_live)
    const live = getLiveTableUrl();
    if (live){
      return live;
    }

    // 2) fallback: links.json
    const links = await loadLinksFresh();
    const url = links[table] || links[String(table)] || '';
    if (!url) throw new Error('Không tìm thấy link cho bàn '+table);
    return String(url);
  }

  function goPos(url){
    // ưu tiên API core nếu có
    if (typeof window.gotoPos === 'function'){
      return window.gotoPos(url);
    }
    // fallback: tự gán iframe
    const frame = document.getElementById('pos-frame');
    if (frame){ frame.src = url; }
    // set state để UI chuyển màn
    lsSet('appState','pos');
    const sel = document.getElementById('select-table');
    const start= document.getElementById('start-screen');
    const pos  = document.getElementById('pos-container');
    sel && (sel.classList.add('hidden'));
    start && (start.classList.add('hidden'));
    pos && (pos.classList.remove('hidden'));
  }

  // 1) Hook nút START ORDER: luôn lấy link (ưu tiên live) theo bàn hiện tại
  function hookStartButton(){
    const btn = document.getElementById('start-order');
    if (!btn) return;

    btn.addEventListener('click', async (ev)=>{
      ev.stopImmediatePropagation?.();
      ev.preventDefault?.();

      try{
        clearPosCache();
        const url = await resolvePosUrlPreferLive();
        log('start -> url', url, (getLiveTableUrl() ? '(from LIVE)' : '(from links.json)'));
        goPos(url);
      }catch(e){
        warn('start failed:', e?.message||e);
        alert('Không lấy được link gọi món cho bàn hiện tại. Vui lòng thử lại.');
      }
      return false;
    }, true);
  }

  // 2) Khi tableId đổi (storage event) => dọn cache
  function hookLocalStorageTableChange(){
    window.addEventListener('storage', (e)=>{
      if ((e.key||'')==='tableId'){
        log('tableId changed via storage:', e.newValue);
        clearPosCache();
        const l = document.getElementById('selected-table');
        if (l) l.textContent = (e.newValue||'').replace('+','');
      }
      // nếu tableUrl được cập nhật từ tab khác, và đang ở POS => nhảy luôn
      if ((e.key||'')==='tableUrl'){
        const u = (e.newValue||'').trim();
        if (u.startsWith('https://order.atpos.net/order/public/checking/')){
          const st = (lsGet('appState','')||'').trim();
          const inPOS = (lsGet('inPOS','')||'') === 'true';
          log('tableUrl updated via storage:', u, 'state=', st, 'inPOS=', inPOS);
          if (st === 'pos' || inPOS){
            clearPosCache();
            goPos(u);
          }
        }
      }
    });
  }

  // 3) Nghe lệnh admin setTable trong Realtime DB (nếu có)
  async function hookDBSetTable(){
    if (!window.firebase || !firebase.apps?.length) return;
    if (!firebase.auth().currentUser){
      try{ await firebase.auth().signInAnonymously(); }catch{}
      await new Promise(r=>{
        const un = firebase.auth().onAuthStateChanged(u=>{ if(u){ un(); r(); }});
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
        // đổi bàn thì xóa cache + (quan trọng) xóa tableUrl cũ để chờ live mới
        clearPosCache();
        lsDel('tableUrl');

        if (typeof window.gotoStart === 'function') window.gotoStart();
      }
    });
  }

  // 4) Khi gotoStart() được gọi ở nơi khác → cũng xoá cache
  function wrapGotoStart(){
    if (typeof window.gotoStart !== 'function') return;
    const orig = window.gotoStart;
    window.gotoStart = function(){
      clearPosCache();
      return orig.apply(this, arguments);
    };
  }

  // 5) API tiện dụng
  window.setTableAndReset = function(newTable){
    lsSet('tableId', String(newTable));
    clearPosCache();
    lsDel('tableUrl');
    if (typeof window.gotoStart === 'function') window.gotoStart();
  };

  function boot(){
    hookStartButton();
    hookLocalStorageTableChange();
    hookDBSetTable();
    wrapGotoStart();
    log('patch ready (prefer LIVE tableUrl, fallback links.json)');
  }

  if (document.readyState==='loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
