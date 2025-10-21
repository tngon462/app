// assets/js/admin-devices-tab.js
// Tab "Thiết bị" (widgets) + shell tab (Thiết bị/Mã)
// - KHÔNG đổi logic backend; chỉ UI mới
// - Widget hiển thị: Tên (đặt thủ công), Trạng thái bàn (— / N / +N), Trạng thái blackout (xanh: ON, xám: OFF)
// - Bấm widget => popup 4 nút: Làm mới / Đổi bàn / Gỡ mã (confirm bằng mã) / Xóa device (khi không còn mã)
// - Sắp xếp theo bàn: +N > N > — ; trong cùng bàn thì lastSeen mới nhất lên trước

(function(){
  'use strict';

  // ===== helpers =====
  const $ = (sel,root=document)=> root.querySelector(sel);
  const $$= (sel,root=document)=> Array.from(root.querySelectorAll(sel));
  const log  = (...a)=> console.log('[admin-devices-tab]', ...a);
  const warn = (...a)=> console.warn('[admin-devices-tab]', ...a);

  let db=null, authReady=false, LINKS_MAP=null;
  const TABLES_MAX_FALLBACK = 15;

  async function ensureFirebase() {
    if (!window.firebase || !firebase.apps?.length) {
      throw new Error('Firebase chưa init — hãy chắc admin.html init trước khi load file này.');
    }
    db = firebase.database();
    if (!firebase.auth().currentUser) {
      await firebase.auth().signInAnonymously();
      await new Promise(r=>{
        const un=firebase.auth().onAuthStateChanged(u=>{ if(u){ un(); r(); }});
      });
    }
    authReady = true;
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
      warn('Không tải được links.json (Đổi bàn vẫn gửi số bàn, client tự xử lý URL).');
    }
  }

  function getMainContent(){
    // ưu tiên khu viewScreen nếu có, nếu không lấy .content
    return document.getElementById('viewScreen')?.parentElement?.parentElement
        || document.querySelector('.content')
        || document.body;
  }

  function ensureTabsShell(){
    let shell = document.getElementById('adminTabs');
    if (shell) return shell;

    const host = getMainContent();
    const section = document.createElement('section');
    section.className = 'p-4 md:p-6';
    section.id = 'adminTabs';

    section.innerHTML = `
      <div class="mb-4 flex items-center gap-2">
        <button id="tab-btn-dev" class="px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold">Thiết bị</button>
        <button id="tab-btn-codes" class="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 font-semibold">Mã</button>
      </div>

      <!-- Panel Devices -->
      <div id="panel-devices" class="space-y-3">
        <div class="flex items-center justify-between">
          <h2 class="text-xl md:text-2xl font-bold">Thiết bị (iPad)</h2>
          <button id="btnReloadAll" class="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700">Reload toàn bộ</button>
        </div>
        <div id="devicesGrid" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3"></div>
        <div id="devError" class="hidden p-3 rounded-lg bg-red-50 text-red-700 text-sm"></div>
      </div>

      <!-- Panel Codes (để file admin-codes-tab.js render) -->
      <div id="panel-codes" class="hidden">
        <div class="mb-3 flex items-center justify-between">
          <h2 class="text-xl md:text-2xl font-bold">Danh sách mã</h2>
          <div class="text-sm text-gray-500">Hàng đợi: <span id="codesQueueCount">(0)</span></div>
        </div>
        <div id="codesQueueWrap" class="mb-3 p-3 rounded-lg border border-emerald-200 bg-emerald-50 hidden">
          <div class="flex items-center justify-between mb-2">
            <div class="font-semibold text-emerald-800">Mã khả dụng</div>
            <button id="btnCopyQueue" class="px-3 py-1.5 text-xs rounded bg-emerald-600 text-white hover:bg-emerald-700">Copy tất cả</button>
          </div>
          <div id="codesQueue" class="flex flex-wrap gap-2 text-sm"></div>
        </div>

        <div class="mb-3">
          <textarea id="codesInput" rows="4" class="w-full border rounded-lg p-3 text-sm" placeholder="Dán danh sách mã (mỗi dòng 1 mã)"></textarea>
          <div class="mt-2"><button id="btnAddCodes" class="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700">Thêm mã</button></div>
        </div>

        <div class="overflow-auto rounded-lg border bg-white">
          <table class="min-w-full text-sm">
            <thead class="bg-gray-50 text-gray-600">
              <tr>
                <th class="px-2 py-2 text-left">Mã</th>
                <th class="px-2 py-2 text-left">Trạng thái</th>
                <th class="px-2 py-2 text-left">Đang gắn</th>
                <th class="px-2 py-2 text-left">Thao tác</th>
              </tr>
            </thead>
            <tbody id="codesBody"></tbody>
          </table>
        </div>

        <div id="codesError" class="hidden p-3 rounded-lg bg-red-50 text-red-700 text-sm mt-3"></div>
      </div>
    `;
    host.prepend(section);

    const btnDev   = $('#tab-btn-dev', section);
    const btnCodes = $('#tab-btn-codes', section);
    const pDev     = $('#panel-devices', section);
    const pCodes   = $('#panel-codes', section);

    function activate(which){
      if (which==='dev'){
        btnDev.className   = 'px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold';
        btnCodes.className = 'px-4 py-2 rounded-lg bg-gray-100 text-gray-700 font-semibold';
        pDev.classList.remove('hidden');
        pCodes.classList.add('hidden');
      }else{
        btnCodes.className = 'px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold';
        btnDev.className   = 'px-4 py-2 rounded-lg bg-gray-100 text-gray-700 font-semibold';
        pCodes.classList.remove('hidden');
        pDev.classList.add('hidden');
      }
    }
    btnDev.addEventListener('click', ()=> activate('dev'));
    btnCodes.addEventListener('click',()=> activate('codes'));

    return section;
  }

  // ===== Table picker =====
  function openTablePicker(onPick){
    const keys = LINKS_MAP ? Object.keys(LINKS_MAP).sort((a,b)=>Number(a)-Number(b))
                           : Array.from({length:TABLES_MAX_FALLBACK},(_,i)=>String(i+1));
    const wrap = document.createElement('div');
    wrap.className = 'fixed inset-0 z-[7000] bg-black/50 flex items-center justify-center p-4';
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
      const btn = document.createElement('button');
      btn.className = 'px-4 py-3 rounded-xl border text-base font-semibold hover:bg-blue-50';
      btn.textContent = 'Bàn ' + k;
      btn.addEventListener('click', ()=>{ try{ onPick(k); } finally { document.body.removeChild(wrap); }});
      grid.appendChild(btn);
    });
    $('#tp-close', wrap).addEventListener('click', ()=> document.body.removeChild(wrap));
  }

  // ===== Devices rendering (widgets) =====
  const gridEl = ()=> document.getElementById('devicesGrid');
  const errEl  = ()=> document.getElementById('devError');
  const showErr= (msg)=>{ const e=errEl(); if(!e) return; e.textContent=msg||''; e.classList.toggle('hidden', !msg); };

  const maskId = (id)=> (!id ? '—' : (id.length<=4 ? id : id.slice(0,4)+'…'));

  function tableSortKey(d){
    const stage = d?.stage || 'select';
    const t     = d?.table;
    const n     = t ? Number(t) : NaN;
    if (stage==='pos'   && !Number.isNaN(n)) return [0,n];
    if (stage==='start' && !Number.isNaN(n)) return [1,n];
    return [2, Number.POSITIVE_INFINITY];
  }

  // cache per-table screen state to color tile
  const screenCache = new Map(); // table(str) -> 'on'|'off'
  function getScreenForTable(t){
    if (!t) return null;
    return screenCache.get(String(t)) || null;
  }

  function widgetColor(screenVal){
    // on-> xanh, off-> xám
    return screenVal === 'off'
      ? 'bg-gray-200 text-gray-700 border-gray-300'
      : 'bg-emerald-50 text-emerald-800 border-emerald-200';
  }

  function renderDevices(devices){
    const grid = gridEl(); if (!grid) return;
    grid.innerHTML = '';

    const entries = Object.entries(devices||{});
    // sort by table/stage
    entries.sort((a,b)=>{
      const ka = tableSortKey(a[1]); const kb = tableSortKey(b[1]);
      if (ka[0]!==kb[0]) return ka[0]-kb[0];
      if (ka[1]!==kb[1]) return ka[1]-kb[1];
      return (b[1]?.lastSeen||0) - (a[1]?.lastSeen||0);
    });

    const frag = document.createDocumentFragment();

    entries.forEach(([id, d])=>{
      const name  = d?.name || 'Thiết bị';
      const code  = d?.code || null;
      const stage = d?.stage || 'select';
      const t     = d?.table || null;

      let tableDisp = '—';
      if (stage==='start') tableDisp = t || '—';
      else if (stage==='pos') tableDisp = t ? ('+'+t) : '+?';

      const screenVal = getScreenForTable(t); // 'on'|'off'|null
      const colorCls  = widgetColor(screenVal);

      const tile = document.createElement('button');
      tile.className = [
        'w-full text-left rounded-2xl border p-4 shadow-sm hover:shadow transition',
        'flex flex-col gap-2',
        colorCls
      ].join(' ');

      tile.innerHTML = `
        <div class="flex items-center justify-between">
          <div class="font-semibold text-base line-clamp-1">${name}</div>
          <span class="text-[11px] font-mono">${maskId(id)}</span>
        </div>
        <div class="text-sm">
          <div>Trạng thái bàn: <span class="font-semibold">${tableDisp}</span></div>
          <div>Blackout: <span class="font-semibold">${screenVal ? (screenVal==='off'?'TẮT':'BẬT') : '—'}</span></div>
          <div>Mã: <span class="font-mono">${code || '—'}</span></div>
        </div>
      `;

      tile.addEventListener('click', ()=> openDeviceActions(id, d));
      frag.appendChild(tile);
    });

    grid.appendChild(frag);
  }

  function openDeviceActions(id, data){
    const code  = data?.code || null;

    const wrap = document.createElement('div');
    wrap.className = 'fixed inset-0 z-[7100] bg-black/50 flex items-center justify-center p-4';
    wrap.innerHTML = `
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-md p-4">
        <div class="flex items-center justify-between mb-3">
          <div class="font-semibold">Thiết bị: <span class="font-mono">${maskId(id)}</span></div>
          <button id="da-close" class="px-3 py-1.5 text-sm rounded bg-gray-100 hover:bg-gray-200">Đóng</button>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <button id="da-reload"   class="px-4 py-3 rounded-xl bg-blue-600 text-white hover:bg-blue-700">Làm mới</button>
          <button id="da-settable" class="px-4 py-3 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700">Đổi bàn</button>
          <button id="da-unbind"   class="px-4 py-3 rounded-xl ${code?'bg-amber-600 hover:bg-amber-700 text-white':'bg-gray-200 text-gray-500 cursor-not-allowed'}" ${code?'':'disabled'}>Gỡ mã</button>
          <button id="da-delete"   class="px-4 py-3 rounded-xl ${code?'bg-gray-200 text-gray-500 cursor-not-allowed':'bg-red-600 text-white hover:bg-red-700'}" ${code?'disabled':''}>Xóa device</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    $('#da-close', wrap).addEventListener('click', ()=> document.body.removeChild(wrap));

    $('#da-reload', wrap).addEventListener('click', async ()=>{
      try{ await db.ref(`devices/${id}/commands/reloadAt`).set(firebase.database.ServerValue.TIMESTAMP); }
      catch(e){ showErr('Gửi reload lỗi: '+(e?.message||e)); }
      finally{ document.body.removeChild(wrap); }
    });

    $('#da-settable', wrap).addEventListener('click', ()=>{
      openTablePicker(async (t)=>{
        try{
          await db.ref(`devices/${id}/commands/setTable`).set({ value: String(t), at: firebase.database.ServerValue.TIMESTAMP });
          await db.ref(`devices/${id}`).update({ table: String(t), stage:'start' });
        }catch(e){ showErr('Đổi số bàn lỗi: '+(e?.message||e)); }
        finally{ document.body.removeChild(wrap); }
      });
    });

    $('#da-unbind', wrap).addEventListener('click', async ()=>{
      if (!code) return;
      const v = prompt(`Nhập lại MÃ đang gắn để gỡ liên kết (mã hiện tại: ${code})`);
      if (v===null) return;
      if (String(v).trim().toUpperCase() !== String(code).toUpperCase()){
        alert('Mã xác nhận không khớp.');
        return;
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
      finally{ document.body.removeChild(wrap); }
    });

    $('#da-delete', wrap).addEventListener('click', async ()=>{
      if (code) return;
      if (!confirm('Xóa thiết bị khỏi danh sách?')) return;
      try{ await db.ref(`devices/${id}`).remove(); }
      catch(e){ showErr('Xóa device lỗi: '+(e?.message||e)); }
      finally{ document.body.removeChild(wrap); }
    });
  }

  // ===== subscribe per-table screen for blackout color =====
  function wireScreenListeners(devices){
    // collect current tables
    const tables = new Set();
    Object.values(devices||{}).forEach(d=>{
      if (d?.table) tables.add(String(d.table));
    });
    // listen each table once
    tables.forEach(t=>{
      if (screenCache.has(t)) return; // we already have a value? still listen to keep updated
      // start listener (even if cached) — but avoid duplicate by marking first
      screenCache.set(t, screenCache.get(t) || null);
      db.ref(`control/tables/${t}/screen`).on('value', s=>{
        const val = (s.val()||'on').toString().toLowerCase();
        screenCache.set(t, val==='off'?'off':'on');
        // re-render devices quickly to update colors
        // (cheap enough; if want debounce can add later)
      });
    });
  }

  // ===== boot =====
  document.addEventListener('DOMContentLoaded', async ()=>{
    try{
      ensureTabsShell();
      await ensureFirebase();
      await loadLinks();

      // reload all button
      $('#btnReloadAll')?.addEventListener('click', async ()=>{
        try{ await db.ref('broadcast/reloadAt').set(firebase.database.ServerValue.TIMESTAMP); }
        catch(e){ showErr('Reload toàn bộ lỗi: '+(e?.message||e)); }
      });

      // subscribe devices
      db.ref('devices').on('value', s=>{
        const devices = s.val() || {};
        wireScreenListeners(devices);
        renderDevices(devices);
      }, e=> showErr('Lỗi tải thiết bị: '+(e?.message||e)));

      log('Devices tab ready.');
    }catch(e){
      console.error(e);
      showErr('Lỗi khởi chạy: '+(e?.message||e));
    }
  });
})();
