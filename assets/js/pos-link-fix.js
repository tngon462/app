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

  function clearPosCache(){
    // dọn mọi khóa có thể giữ URL cũ
    ['posUrl','posLink','lastPosUrl','lastPosHref'].forEach(lsDel);
  }

  async function loadLinksFresh(){
    // luôn cache-bust để không dính SW cache
    const res = await fetch('./links.json?cb='+Date.now(), { cache:'no-store' });
    if (!res.ok) throw new Error('links.json fetch failed: '+res.status);
    const data = await res.json();
    // Có dự án dùng {links:{table:url}} hoặc dùng object { "1": "...", ... }
    return data.links || data;
  }

  async function resolvePosUrl(){
    const table = getTable();
    if (!table) throw new Error('Chưa có tableId');
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

  // 1) Hook nút START ORDER: luôn lấy link MỚI theo bàn hiện tại
  function hookStartButton(){
    const btn = document.getElementById('start-order');
    if (!btn) return;

    // chặn handler cũ ở bubble phase
    btn.addEventListener('click', async (ev)=>{
      // Ưu tiên handler này
      ev.stopImmediatePropagation?.();
      ev.preventDefault?.();

      try{
        clearPosCache(); // xoá link cũ
        const url = await resolvePosUrl();
        log('start -> fresh url', url);
        goPos(url);
      }catch(e){
        warn('start failed:', e?.message||e);
        alert('Không lấy được link gọi món cho bàn hiện tại. Vui lòng thử lại.');
      }
      return false;
    }, true); // capture = true để đè handler trước khi nó chạy
  }

  // 2) Khi tableId thay đổi (do admin SetTable hoặc thao tác khác) => dọn cache
  function hookLocalStorageTableChange(){
    window.addEventListener('storage', (e)=>{
      if ((e.key||'')==='tableId'){
        log('tableId changed via storage:', e.newValue);
        clearPosCache();
        // Ở màn START, nên cập nhật label nếu core không làm
        const l = document.getElementById('selected-table');
        if (l) l.textContent = (e.newValue||'').replace('+','');
      }
    });
  }

  // 3) Nghe lệnh admin setTable trong Realtime DB (nếu có)
  async function hookDBSetTable(){
    if (!window.firebase || !firebase.apps?.length) return;
    // đảm bảo đã đăng nhập ẩn danh
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
        clearPosCache();
        // quay về màn START để buộc chọn START với link mới
        if (typeof window.gotoStart === 'function') window.gotoStart();
        // nếu cần: có thể xóa command sau khi xử lý (tuỳ ý)
        // db.ref('devices/'+deviceId+'/commands/setTable').remove().catch(()=>{});
      }
    });
  }

  // 4) Khi gotoStart() được gọi ở nơi khác → cũng xoá link cũ để chắc chắn
  function wrapGotoStart(){
    if (typeof window.gotoStart !== 'function') return;
    const orig = window.gotoStart;
    window.gotoStart = function(){
      clearPosCache();
      return orig.apply(this, arguments);
    };
  }

  // 5) Khi đổi bàn ngay trong app (nếu có API setTableLocal) → dọn cache
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
    log('patch ready');
  }

  if (document.readyState==='loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
