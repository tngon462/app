// assets/js/admin-devices-tab.js
// Tabs (bên phải): "Thiết bị" / "Up ảnh quảng cáo"
// - Tab Thiết bị: widgets + popup hành động + nút "Reload toàn bộ" + "Tắt toàn bộ"
// - Per-table blackout: BẬT/TẮT ngay trong popup (ghi control/tables/<table>/screen)
// - Sắp xếp theo bàn: +N > N > — ; trong cùng bàn -> lastSeen mới nhất
// - Fix z-index: đóng popup trước khi mở picker, picker z cao hơn => không bị khuất
(function(){
  'use strict';

  // ===== helpers =====
  const $  = (sel,root=document)=> root.querySelector(sel);
  const $$ = (sel,root=document)=> Array.from(root.querySelectorAll(sel));
  const log  = (...a)=> console.log('[admin-devices-tab]', ...a);
  const warn = (...a)=> console.warn('[admin-devices-tab]', ...a);

  let db=null, LINKS_MAP=null;

  async function ensureFirebase() {
    if (!window.firebase || !firebase.apps?.length) {
      throw new Error('Firebase chưa init — cần init trong admin.html trước file này.');
    }
    db = firebase.database();
    if (!firebase.auth().currentUser) {
      await firebase.auth().signInAnonymously();
      await new Promise(r=>{
        const un=firebase.auth().onAuthStateChanged(u=>{ if(u){ un(); r(); }});
      });
    }
  }

  async function loadLinks() {
    try{
      const res = await fetch('./links.json?cb='+Date.now(), { cache:'no-store' });
      if(!res.ok) throw new Error('HTTP '+res.status);
      const data = await res.json();
      LINKS_MAP = data.links || data;
      if (!LINKS_MAP || typeof LINKS_MAP!=='object') throw new Error('links.json invalid');
      log('links.json OK', Object.keys(LINKS_MAP).length, 'entries');
    }catch(e){
      LINKS_MAP = null;
      warn('Không tải được links.json (SetTable vẫn gửi số bàn, client tự xử lý URL).');
    }
  }

  // ===== shell (tabs phải) =====
  function ensureShell() {
    let host = document.querySelector('.content') || document.body;
    let section = document.getElementById('adminTabsRight');
    if (section) return section;

    section = document.createElement('section');
    section.id = 'adminTabsRight';
    section.className = 'p-4 md:p-6';

    section.innerHTML = `
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-xl md:text-2xl font-bold">Quản trị</h2>
        <div class="flex items-center gap-2">
          <button id="tab-btn-dev"   class="px-3 py-2 rounded-lg bg-blue-600 text-white font-semibold">Thiết bị</button>
          <button id="tab-btn-ads"   class="px-3 py-2 rounded-lg bg-gray-100 text-gray-700 font-semibold">Up ảnh quảng cáo</button>
        </div>
      </div>

      <!-- Panel Devices -->
      <div id="panel-devices" class="space-y-3">
        <div class="flex items-center justify-between">
          <div class="text-base md:text-lg font-semibold">Thiết bị (iPad)</div>
          <div class="flex items-center gap-2">
            <button id="btnPowerOffAll" class="px-3 md:px-4 py-2 rounded-lg bg-gray-800 text-white hover:bg-black">Tắt toàn bộ</button>
            <button id="btnReloadAll"  class="px-3 md:px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700">Reload toàn bộ</button>
          </div>
        </div>

        <div id="devicesGrid" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3"></div>
        <div id="devError" class="hidden p-3 rounded-lg bg-red-50 text-red-700 text-sm"></div>
      </div>

      <!-- Panel Ads -->
      <div id="panel-ads" class="hidden">
        <div class="rounded-xl overflow-hidden border bg-white">
          <iframe id="ads-iframe" src="about:blank" referrerpolicy="no-referrer" style="width:100%;height:70vh;border:0;"></iframe>
        </div>
      </div>
    `;
    // Đẩy lên đầu nội dung cho dễ thấy
    host.prepend(section);

    const btnDev = $('#tab-btn-dev', section);
    const btnAds = $('#tab-btn-ads', section);
    const pDev   = $('#panel-devices', section);
    const pAds   = $('#panel-ads', section);

    function activate(which){
      if (which==='dev'){
        btnDev.className = 'px-3 py-2 rounded-lg bg-blue-600 text-white font-semibold';
        btnAds.className = 'px-3 py-2 rounded-lg bg-gray-100 text-gray-700 font-semibold';
        pDev.classList.remove('hidden'); pAds.classList.add('hidden');
      }else{
        btnAds.className = 'px-3 py-2 rounded-lg bg-blue-600 text-white font-semibold';
        btnDev.className = 'px-3 py-2 rounded-lg bg-gray-100 text-gray-700 font-semibold';
        pAds.classList.remove('hidden'); pDev.classList.add('hidden');
        const ifr = $('#ads-iframe'); if (ifr && (!ifr.src || ifr.src==='about:blank')) ifr.src = 'https://pic-flame.vercel.app/';
      }
    }
    btnDev.addEventListener('click', ()=> activate('dev'));
    btnAds.addEventListener('click', ()=> activate('ads'));

    return section;
  }

  // ===== UI utils =====
  const devGrid = ()=> document.getElementById('devicesGrid');
  const errBox  = ()=> document.getElementById('devError');
  const showErr = (m)=>{ const e=errBox(); if(!e) return; e.textContent=m||''; e.classList.toggle('hidden', !m); };

  const maskId = (id)=> (!id ? '—' : (id.length<=4 ? id : id.slice(0,4)+'…'));
  function tableSortKey(d){
    const s=d?.stage||'select', t=d?.table, n=t?Number(t):NaN;
    if (s==='pos'   && !Number.isNaN(n)) return [0,n];
    if (s==='start' && !Number.isNaN(n)) return [1,n];
    return [2, Number.POSITIVE_INFINITY];
  }

  // màu widget theo blackout
  const screenCache = new Map(); // 'table' -> 'on'|'off'
  function widgetColor(screenVal){
    return screenVal==='off'
      ? 'bg-gray-200 text-gray-700 border-gray-300'
      : 'bg-emerald-50 text-emerald-800 border-emerald-200';
  }

  function getScreenForTable(t){ return t? (screenCache.get(String(t))||null) : null; }

  function wireScreenListeners(devices){
    const tables = new Set();
    Object.values(devices||{}).forEach(d=>{ if(d?.table) tables.add(String(d.table)); });
    tables.forEach(t=>{
      if (screenCache.has(t)) return; // đã lắng nghe từ trước
      screenCache.set(t, screenCache.get(t)||null);
      db.ref(`control/tables/${t}/screen`).on('value', s=>{
        const v=(s.val()||'on').toString().toLowerCase();
        screenCache.set(t, v==='off'?'off':'on');
        // re-render nhẹ bằng cách phát sự kiện
        document.dispatchEvent(new CustomEvent('admin:redrawDevices'));
      });
    });
  }

  function renderDevices(devices){
    const grid = devGrid(); if (!grid) return;
    grid.innerHTML = '';

    const entries = Object.entries(devices||{});
    entries.sort((a,b)=>{
      const ka=tableSortKey(a[1]), kb=tableSortKey(b[1]);
      if (ka[0]!==kb[0]) return ka[0]-kb[0];
      if (ka[1]!==kb[1]) return ka[1]-kb[1];
      return (b[1]?.lastSeen||0)-(a[1]?.lastSeen||0);
    });

    const frag=document.createDocumentFragment();
    entries.forEach(([id,d])=>{
      const name=d?.name||'Thiết bị';
      const code=d?.code||null;
      const stage=d?.stage||'select';
      const t=d?.table||null;

      let tableDisp='—';
      if (stage==='start') tableDisp = t || '—';
      else if (stage==='pos') tableDisp = t ? ('+'+t) : '+?';

      const screenVal=getScreenForTable(t);
      const tile=document.createElement('button');
      tile.className=[
        'w-full text-left rounded-2xl border p-4 shadow-sm hover:shadow transition',
        'flex flex-col gap-2',
        widgetColor(screenVal)
      ].join(' ');
      tile.innerHTML=`
        <div class="flex items-center justify-between">
          <div class="font-semibold text-base line-clamp-1">${name}</div>
          <span class="text-[11px] font-mono">${maskId(id)}</span>
        </div>
        <div class="text-sm">
          <div>Trạng thái bàn: <span class="font-semibold">${tableDisp}</span></div>
          <div>Blackout: <span class="font-semibold">${screenVal ? (screenVal==='off'?'TẮT':'BẬT') : '—'}</span></div>
          <div>Mã: <span class="font-mono">${code || '—'}</span></div>
        </div>`;
      tile.addEventListener('click', ()=> openDeviceActions(id, d));
      frag.appendChild(tile);
    });
    grid.appendChild(frag);
  }

  function openDeviceActions(id, data){
    const code=data?.code||null;
    const t   =data?.table||null;

    const wrap=document.createElement('div');
    wrap.className='fixed inset-0 z-[8000] bg-black/50 flex items-center justify-center p-4';
    wrap.innerHTML=`
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-md p-4">
        <div class="flex items-center justify-between mb-3">
          <div class="font-semibold">Thiết bị: <span class="font-mono">${maskId(id)}</span></div>
          <button id="da-close" class="px-3 py-1.5 text-sm rounded bg-gray-100 hover:bg-gray-200">Đóng</button>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <button id="da-reload"   class="px-4 py-3 rounded-xl bg-blue-600 text-white hover:bg-blue-700">Làm mới</button>
          <button id="da-settable" class="px-4 py-3 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700">Đổi bàn</button>

          <button id="da-screen-on"  class="px-4 py-3 rounded-xl ${t?'bg-emerald-600 hover:bg-emerald-700 text-white':'bg-gray-200 text-gray-500 cursor-not-allowed'}" ${t?'':'disabled'}>BẬT màn bàn này</button>
          <button id="da-screen-off" class="px-4 py-3 rounded-xl ${t?'bg-gray-800 hover:bg-black text-white':'bg-gray-200 text-gray-500 cursor-not-allowed'}" ${t?'':'disabled'}>TẮT màn bàn này</button>

          <button id="da-unbind" class="px-4 py-3 rounded-xl ${code?'bg-amber-600 hover:bg-amber-700 text-white':'bg-gray-200 text-gray-500 cursor-not-allowed'}" ${code?'':'disabled'}>Gỡ mã</button>
          <button id="da-delete" class="px-4 py-3 rounded-xl ${code?'bg-gray-200 text-gray-500 cursor-not-allowed':'bg-red-600 text-white hover:bg-red-700'}" ${code?'disabled':''}>Xóa device</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);

    const close = ()=> document.body.removeChild(wrap);
    $('#da-close', wrap).addEventListener('click', close);

    $('#da-reload', wrap).addEventListener('click', async ()=>{
      try{ await db.ref(`devices/${id}/commands/reloadAt`).set(firebase.database.ServerValue.TIMESTAMP); }
      catch(e){ showErr('Gửi reload lỗi: '+(e?.message||e)); }
      finally{ close(); }
    });

    $('#da-settable', wrap).addEventListener('click', ()=>{
      // fix: ĐÓNG POPUP TRƯỚC, rồi mở picker (z-index 9000)
      close();
      openTablePicker(async (tableId)=>{
        try{
          await db.ref(`devices/${id}/commands/setTable`).set({ value:String(tableId), at: firebase.database.ServerValue.TIMESTAMP });
          await db.ref(`devices/${id}`).update({ table:String(tableId), stage:'start' });
        }catch(e){ showErr('Đổi số bàn lỗi: '+(e?.message||e)); }
      });
    });

    $('#da-screen-on', wrap)?.addEventListener('click', async ()=>{
      if (!t) return;
      try{ await db.ref(`control/tables/${t}/screen`).set('on'); }
      catch(e){ showErr('Bật màn hình lỗi: '+(e?.message||e)); }
      finally{ close(); }
    });
    $('#da-screen-off', wrap)?.addEventListener('click', async ()=>{
      if (!t) return;
      try{ await db.ref(`control/tables/${t}/screen`).set('off'); }
      catch(e){ showErr('Tắt màn hình lỗi: '+(e?.message||e)); }
      finally{ close(); }
    });

    $('#da-unbind', wrap).addEventListener('click', async ()=>{
      if (!code) return;
      const v = prompt(`Nhập lại MÃ đang gắn để gỡ liên kết (mã hiện tại: ${code})`);
      if (v===null) return;
      if (String(v).trim().toUpperCase() !== String(code).toUpperCase()){
        alert('Mã xác nhận không khớp.'); return;
      }
      try{
        await db.ref('codes/'+code).transaction(cur=>{
          if (!cur) return cur;
          if (cur.boundDeviceId === id) return { ...cur, boundDeviceId:null, boundAt:null };
          return cur;
        });
        await db.ref(`devices/${id}/commands/unbindAt`).set(firebase.database.ServerValue.TIMESTAMP);
        await db.ref(`devices/${id}`).update({ code:null, table:null, stage:'select' });
      }catch(e){ showErr('Gỡ liên kết lỗi: '+(e?.message||e)); }
      finally{ close(); }
    });

    $('#da-delete', wrap).addEventListener('click', async ()=>{
      if (code) return;
      if (!confirm('Xóa thiết bị khỏi danh sách?')) return;
      try{ await db.ref(`devices/${id}`).remove(); }
      catch(e){ showErr('Xóa device lỗi: '+(e?.message||e)); }
      finally{ close(); }
    });
  }

  function openTablePicker(onPick){
    const keys = LINKS_MAP ? Object.keys(LINKS_MAP).sort((a,b)=>Number(a)-Number(b))
                           : Array.from({length:15},(_,i)=>String(i+1));
    const wrap = document.createElement('div');
    wrap.className = 'fixed inset-0 z-[9000] bg-black/50 flex items-center justify-center p-4';
    wrap.innerHTML = `
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-4">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-xl font-semibold">Chọn bàn</h3>
          <button id="tp-close" class="px-3 py-1.5 text-sm rounded bg-gray-100 hover:bg-gray-200">Đóng</button>
        </div>
        <div id="tp-grid" class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 max-h-[70vh] overflow-auto"></div>
      </div>`;
    document.body.appendChild(wrap);

    const grid = $('#tp-grid', wrap);
    keys.forEach(k=>{
      const btn=document.createElement('button');
      btn.className='px-4 py-3 rounded-xl border text-base font-semibold hover:bg-blue-50';
      btn.textContent='Bàn '+k;
      btn.addEventListener('click', ()=>{ try{ onPick(k); } finally { document.body.removeChild(wrap); }});
      grid.appendChild(btn);
    });
    $('#tp-close', wrap).addEventListener('click', ()=> document.body.removeChild(wrap));
  }

  // ===== boot =====
  document.addEventListener('DOMContentLoaded', async ()=>{
    try{
      ensureShell();
      await ensureFirebase();
      await loadLinks();

      // Nút global
      $('#btnReloadAll')?.addEventListener('click', async ()=>{
        try{ await db.ref('broadcast/reloadAt').set(firebase.database.ServerValue.TIMESTAMP); }
        catch(e){ showErr('Reload toàn bộ lỗi: '+(e?.message||e)); }
      });
      $('#btnPowerOffAll')?.addEventListener('click', async ()=>{
        try{ await db.ref('control/screen').set('off'); }
        catch(e){ showErr('Tắt toàn bộ lỗi: '+(e?.message||e)); }
      });

      // Subscribe devices
      const redraw = ()=> {
        // đọc lại snapshot devices mới nhất
        db.ref('devices').once('value').then(s=> renderDevices(s.val()||{})).catch(()=>{});
      };
      document.addEventListener('admin:redrawDevices', redraw);

      db.ref('devices').on('value', s=>{
        const devices = s.val() || {};
        wireScreenListeners(devices);
        renderDevices(devices);
      }, e=> showErr('Lỗi tải thiết bị: '+(e?.message||e)));

      log('Ready (tabs right).');
    }catch(e){
      console.error(e);
      showErr('Lỗi khởi chạy: '+(e?.message||e));
    }
  });
})();
