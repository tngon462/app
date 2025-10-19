// assets/js/admin-devices.js
// Quản lý MÃ iPad & Thiết bị (không đụng UI cũ) — tự chèn tab “Thiết bị” và view riêng.
// Yêu cầu: firebase đã init & auth ẩn danh trong admin.html (như file sếp đang dùng).

(function(){
  'use strict';

  // ===== Config nhẹ =====
  const TABLE_COUNT = 15;               // số bàn tối đa (khớp tab tắt/bật màn hình)
  const VIEW_ID     = 'viewDevices';    // id section mới
  const NAV_ID      = 'navDevices';     // id nav mới

  // ===== Utils UI =====
  const $  = (id)=> document.getElementById(id);
  const by = (sel,root=document)=> root.querySelector(sel);
  const ce = (tag,cls)=>{ const el=document.createElement(tag); if(cls) el.className=cls; return el; };
  const tsAgo = (ts)=>{
    if (!ts) return '—';
    const s = Math.floor((Date.now()-ts)/1000);
    if (s<60) return s+'s';
    const m = Math.floor(s/60);
    if (m<60) return m+'m';
    const h = Math.floor(m/60);
    if (h<24) return h+'h';
    return Math.floor(h/24)+'d';
  };

  function showDevError(msg){
    const el = $('devError'); if(!el) return;
    el.textContent = msg||''; el.classList.toggle('hidden', !msg);
  }

  // ===== 1) Chèn TAB "Thiết bị" vào sidebar (không phá UI cũ) =====
  function ensureNav(){
    if ($(NAV_ID)) return;
    const drawer = $('drawer');
    const nav = drawer ? drawer.querySelector('nav.p-3.space-y-1') : null;
    if (!nav) return;

    const a = ce('a', 'nav-link');
    a.id = NAV_ID;
    a.href = '#devices';
    a.textContent = 'Thiết bị';
    nav.appendChild(a);

    // đóng drawer khi bấm (mobile)
    const drawerMask = $('drawerMask');
    a.addEventListener('click', ()=>{
      if (window.innerWidth < 768 && drawer && drawerMask) {
        drawer.classList.remove('open'); drawerMask.classList.remove('show');
      }
    });
  }

  // ===== 2) Tạo view Devices (Codes + Devices) =====
  function ensureView(){
    if ($(VIEW_ID)) return;
    const main = document.querySelector('main.content');
    if (!main) return;

    const section = ce('section', 'p-4 md:p-6 hidden');
    section.id = VIEW_ID;
    section.innerHTML = `
      <h2 class="text-2xl font-bold text-gray-800 mb-4">Thiết bị iPad & Mã</h2>

      <!-- Hàng nút nhanh -->
      <div class="flex flex-wrap items-center gap-2 mb-4">
        <button id="btn-broadcast-reload" class="px-3 py-2 bg-blue-600 text-white rounded">Reload toàn bộ</button>
        <span class="text-xs text-gray-500">• Gửi reload đến tất cả thiết bị</span>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Khối Codes -->
        <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4 md:p-5">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-lg font-semibold">Danh sách MÃ</h3>
            <div class="text-xs text-gray-500">
              Hàng đợi: <span id="codes-queue-count">0</span>
            </div>
          </div>

          <!-- Hàng đợi mã -->
          <div id="codes-queue-wrap" class="mb-3 hidden">
            <div id="codes-queue" class="flex flex-wrap gap-2"></div>
          </div>

          <!-- Nhập nhanh mã (tuỳ chọn) -->
          <div class="grid grid-cols-1 gap-2 mb-3">
            <textarea id="codes-import" rows="3" class="w-full p-2 border rounded" placeholder="Dán danh sách mã (mỗi dòng 1 mã)"></textarea>
            <div class="flex items-center gap-2">
              <button id="btn-import-codes" class="px-3 py-2 bg-gray-800 text-white rounded">Thêm mã</button>
              <span class="text-xs text-gray-500">• Mã mới mặc định bật (ON)</span>
            </div>
          </div>

          <div class="overflow-auto max-h-96 border rounded">
            <table class="min-w-full text-sm">
              <thead class="bg-gray-100">
                <tr>
                  <th class="px-2 py-1 text-left">Mã</th>
                  <th class="px-2 py-1 text-left">Trạng thái</th>
                  <th class="px-2 py-1 text-left">Thiết bị</th>
                  <th class="px-2 py-1 text-left">Gắn lúc</th>
                  <th class="px-2 py-1 text-left">Thao tác</th>
                </tr>
              </thead>
              <tbody id="codes-tbody"></tbody>
            </table>
          </div>
        </div>

        <!-- Khối Devices -->
        <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4 md:p-5">
          <h3 class="text-lg font-semibold mb-3">Thiết bị</h3>
          <div class="overflow-auto max-h-96 border rounded">
            <table class="min-w-full text-sm">
              <thead class="bg-gray-100">
                <tr>
                  <th class="px-2 py-1 text-left">Device ID</th>
                  <th class="px-2 py-1 text-left">Tên máy</th>
                  <th class="px-2 py-1 text-left">Mã</th>
                  <th class="px-2 py-1 text-left">Bàn</th>
                  <th class="px-2 py-1 text-left">Last Seen</th>
                  <th class="px-2 py-1 text-left">Thao tác</th>
                </tr>
              </thead>
              <tbody id="devices-tbody"></tbody>
            </table>
          </div>
        </div>
      </div>

      <div id="devError" class="mt-4 hidden p-3 rounded-lg bg-red-50 text-red-700 text-sm"></div>

      <!-- Modal root -->
      <div id="modal-root"></div>
    `;
    main.appendChild(section);
  }

  // ===== 3) Routing mở rộng — không phá route cũ =====
  function extendRouting(){
    function setActiveLocal(){
      const hash = location.hash || '#screen';
      const navScreen  = $('navScreen');
      const navAds     = $('navAds');
      const navDevices = $(NAV_ID);
      const viewScreen = $('viewScreen');
      const viewAds    = $('viewAds');
      const viewDev    = $(VIEW_ID);

      if (!navDevices || !viewDev) return;

      // clear active
      [navScreen, navAds, navDevices].filter(Boolean).forEach(a=> a.classList.remove('active'));
      [viewScreen, viewAds, viewDev].filter(Boolean).forEach(v=> v.classList.add('hidden'));

      if (hash === '#devices') {
        navDevices.classList.add('active');
        viewDev.classList.remove('hidden');
      } else if (hash === '#ads') {
        navAds?.classList.add('active');
        viewAds?.classList.remove('hidden');
      } else {
        navScreen?.classList.add('active');
        viewScreen?.classList.remove('hidden');
      }
    }
    window.addEventListener('hashchange', setActiveLocal);
    setTimeout(setActiveLocal, 0);
  }

  // ===== 4) Firebase wires =====
  async function boot(){
    // Đợi firebase init trong admin.html
    if (!window.firebase) return showDevError('Firebase chưa load.');
    if (!firebase.apps.length) return showDevError('Firebase chưa khởi tạo.');
    const db = firebase.database();

    // UI refs
    const elCodesTbody   = $('codes-tbody');
    const elDevicesTbody = $('devices-tbody');
    const elBtnBroadcast = $('btn-broadcast-reload');
    const elBtnImport    = $('btn-import-codes');
    const elCodesImport  = $('codes-import');
    const elQueueWrap    = $('codes-queue-wrap');
    const elQueueList    = $('codes-queue');
    const elModalRoot    = $('modal-root');

    // ---------- Broadcast reload ----------
    elBtnBroadcast?.addEventListener('click', async ()=>{
      try{
        await db.ref('broadcast/reloadAt').set(firebase.database.ServerValue.TIMESTAMP);
        showDevError('');
        alert('Đã gửi lệnh reload toàn bộ');
      }catch(e){ showDevError('Gửi broadcast thất bại: '+(e?.message||e)); }
    });

    // ---------- Import codes ----------
    elBtnImport?.addEventListener('click', async ()=>{
      const raw=(elCodesImport.value||'').trim();
      if(!raw) return alert('Dán danh sách mã (mỗi dòng 1 mã)');
      const lines = raw.split(/\r?\n/).map(s=>s.trim().toUpperCase()).filter(Boolean);
      if(!lines.length) return alert('Không có mã hợp lệ');
      const now = firebase.database.ServerValue.TIMESTAMP;
      const updates = {};
      for (const code of lines){
        updates['codes/'+code] = {
          enabled: true, boundDeviceId: null, boundAt: null, createdAt: now
        };
      }
      try{
        await db.ref().update(updates);
        elCodesImport.value='';
        alert('Đã thêm '+lines.length+' mã');
      }catch(e){ alert('Thêm mã lỗi: '+(e?.message||e)); }
    });

    // ---------- Render Codes ----------
    function renderCodes(data){
      if(!elCodesTbody) return;
      elCodesTbody.innerHTML='';
      const entries = Object.entries(data||{}).sort((a,b)=> a[0].localeCompare(b[0]));

      // Hàng đợi
      if (elQueueWrap && elQueueList){
        const avail = entries.filter(([_,o])=> o && o.enabled===true && !o.boundDeviceId).map(([k])=>k);
        elQueueList.innerHTML='';
        avail.forEach(code=>{
          const pill=ce('span','px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs');
          pill.textContent=code; elQueueList.appendChild(pill);
        });
        elQueueWrap.classList.toggle('hidden', avail.length===0);
        const countEl = $('codes-queue-count'); if (countEl) countEl.textContent = String(avail.length);
      }

      for (const [code, obj] of entries){
        const tr = ce('tr','border-b');
        const enabled = obj?.enabled !== false;
        const deviceId= obj?.boundDeviceId || null;

        tr.innerHTML = `
          <td class="px-2 py-1 font-mono">${code}</td>
          <td class="px-2 py-1">
            <span class="inline-flex items-center gap-1 text-xs ${enabled?'text-emerald-700':'text-gray-500'}">
              <span class="w-2 h-2 rounded-full ${enabled?'bg-emerald-500':'bg-gray-400'}"></span>
              ${enabled?'Đang bật':'Đang tắt'}
            </span>
          </td>
          <td class="px-2 py-1 text-xs break-all">${deviceId?deviceId:'—'}</td>
          <td class="px-2 py-1 text-xs">${obj?.boundAt? new Date(obj.boundAt).toLocaleString() : '—'}</td>
          <td class="px-2 py-1">
            <div class="flex flex-wrap gap-2">
              <button class="px-2 py-1 text-xs rounded ${enabled?'bg-gray-800 hover:bg-black':'bg-emerald-600 hover:bg-emerald-700'} text-white" data-act="toggle">
                ${enabled?'Tắt mã':'Bật mã'}
              </button>
              <button class="px-2 py-1 text-xs rounded bg-red-600 hover:bg-red-700 text-white" data-act="delete">Xoá mã</button>
            </div>
          </td>
        `;

        // Toggle enable
        by('[data-act="toggle"]', tr).addEventListener('click', async ()=>{
          try{
            // Nếu tắt mã và đang có thiết bị dùng → gửi unbind
            if (enabled && deviceId){
              await db.ref(`devices/${deviceId}/commands/unbindAt`).set(firebase.database.ServerValue.TIMESTAMP);
            }
            await db.ref(`codes/${code}/enabled`).set(!enabled);
          }catch(e){ showDevError('Đổi trạng thái mã lỗi: '+(e?.message||e)); }
        });

        // Delete code
        by('[data-act="delete"]', tr).addEventListener('click', async ()=>{
          if (!confirm(`Xóa mã ${code}?`)) return;
          try{
            if (deviceId){
              await db.ref(`devices/${deviceId}/commands/unbindAt`).set(firebase.database.ServerValue.TIMESTAMP);
            }
            await db.ref(`codes/${code}`).remove();
          }catch(e){ showDevError('Xóa mã lỗi: '+(e?.message||e)); }
        });

        elCodesTbody.appendChild(tr);
      }
    }

    db.ref('codes').on('value',
      snap=> renderCodes(snap.val()||{}),
      err => showDevError('Lỗi tải mã: ' + (err?.message||err))
    );

    // ---------- Modal chọn bàn ----------
    function openTablePicker(onPick){
      const root = $('modal-root') || document.body;
      const wrap = ce('div','fixed inset-0 bg-black/50 z-[7000] flex items-center justify-center p-4');
      wrap.innerHTML = `
        <div class="bg-white rounded-xl shadow-lg w-full max-w-md p-4">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-lg font-semibold">Chọn số bàn</h3>
            <button id="tp-close" class="px-2 py-1 text-sm rounded bg-gray-100 hover:bg-gray-200">Đóng</button>
          </div>
          <div id="tp-grid" class="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-[60vh] overflow-auto"></div>
        </div>`;
      root.appendChild(wrap);

      const grid = by('#tp-grid', wrap);
      for (let i=1;i<=TABLE_COUNT;i++){
        const btn=ce('button','px-3 py-3 rounded-lg border text-sm hover:bg-blue-50');
        btn.textContent=String(i);
        btn.addEventListener('click', ()=>{ try{ onPick(String(i)); } finally{ root.removeChild(wrap); } });
        grid.appendChild(btn);
      }
      by('#tp-close', wrap).addEventListener('click', ()=> root.removeChild(wrap));
    }

    // ---------- Render Devices ----------
    function renderDevices(data){
      if(!elDevicesTbody) return;
      elDevicesTbody.innerHTML='';
      const entries = Object.entries(data||{}).sort((a,b)=> (b[1]?.lastSeen||0) - (a[1]?.lastSeen||0));

      for (const [id, obj] of entries){
        const code  = obj?.code || '';
        const name  = obj?.name || '';
        const table = obj?.table || '';
        const last  = obj?.lastSeen || 0;
        // stage/inPOS hiển thị:
        //  - nếu app đang ở màn chọn bàn → "-"
        //  - nếu app đang ở POS/iframe → "+<table>"
        //  - còn lại: hiển thị table thường
        const stage = obj?.stage || '';      // optional, nếu app có cập nhật
        const inPOS = obj?.inPOS === true;   // optional
        let tableDisplay = table || '—';
        if (stage === 'select') tableDisplay = '—';
        else if (stage === 'pos' || inPOS)   tableDisplay = table ? ('+'+table) : '+?';

        const tr = ce('tr','border-b');
        tr.innerHTML = `
          <td class="px-2 py-1 text-xs break-all">${id}</td>
          <td class="px-2 py-1">
            <input class="w-full px-2 py-1 border rounded text-xs" value="${name.replace(/"/g,'&quot;')}" data-role="name-input" />
          </td>
          <td class="px-2 py-1 font-mono">${code || '—'}</td>
          <td class="px-2 py-1">${tableDisplay}</td>
          <td class="px-2 py-1 text-xs">${last? tsAgo(last) : '—'}</td>
          <td class="px-2 py-1">
            <div class="flex flex-wrap gap-2">
              <button class="px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700" data-act="reload">Làm mới</button>
              <button class="px-2 py-1 text-xs rounded bg-emerald-600 text-white hover:bg-emerald-700" data-act="settable">Đổi số bàn</button>
              <button class="px-2 py-1 text-xs rounded bg-amber-600 text-white hover:bg-amber-700" data-act="kick" ${code?'':'disabled'}>Gỡ liên kết</button>
            </div>
          </td>
        `;

        // Sửa tên máy (blur để lưu)
        by('[data-role="name-input"]', tr).addEventListener('blur', async (e)=>{
          const newName = String(e.target.value||'').trim();
          try{ await db.ref(`devices/${id}/name`).set(newName||null); }
          catch(err){ showDevError('Lưu tên máy lỗi: '+(err?.message||err)); }
        });

        // Reload → app tự reload và (theo device-bind) quay lại Start Order
        by('[data-act="reload"]', tr).addEventListener('click', async ()=>{
          try{
            await db.ref(`devices/${id}/commands/reloadAt`).set(firebase.database.ServerValue.TIMESTAMP);
          }catch(err){ showDevError('Gửi reload lỗi: '+(err?.message||err)); }
        });

        // Đổi số bàn → chỉ đổi số & link, KHÔNG reload
        by('[data-act="settable"]', tr).addEventListener('click', ()=>{
          openTablePicker(async (picked)=>{
            try{
              await db.ref(`devices/${id}/commands/setTable`).set({
                value: picked, at: firebase.database.ServerValue.TIMESTAMP
              });
              // cập nhật nhanh để thấy ngay bên admin
              await db.ref(`devices/${id}/table`).set(picked);
            }catch(err){ showDevError('Đổi số bàn lỗi: '+(err?.message||err)); }
          });
        });

        // Gỡ liên kết (thu hồi mã, đẩy app về gate)
        by('[data-act="kick"]', tr).addEventListener('click', async ()=>{
          if (!code) return alert('Thiết bị chưa gắn mã.');
          if (!confirm(`Gỡ liên kết thiết bị và thu hồi mã ${code}?`)) return;
          try{
            // gỡ trong codes nếu đang bound với đúng device
            await db.ref(`codes/${code}`).transaction(v=>{
              if (!v) return v;
              if (v.boundDeviceId === id) return {...v, boundDeviceId:null, boundAt:null};
              return v;
            });
            // ra lệnh unbind
            await db.ref(`devices/${id}/commands/unbindAt`).set(firebase.database.ServerValue.TIMESTAMP);
            // dọn info hiển thị
            await db.ref(`devices/${id}`).update({ code:null, table:null });
          }catch(err){ showDevError('Gỡ liên kết lỗi: '+(err?.message||err)); }
        });

        elDevicesTbody.appendChild(tr);
      }
    }

    db.ref('devices').on('value',
      snap=> renderDevices(snap.val()||{}),
      err => showDevError('Lỗi tải thiết bị: ' + (err?.message||err))
    );
  }

  // ===== Khởi động: chèn UI + route + bind Firebase =====
  document.addEventListener('DOMContentLoaded', ()=>{
    try{
      ensureNav();
      ensureView();
      extendRouting();
      // Chỉ boot Firebase sau khi page đã init firebase
      setTimeout(boot, 50);
    }catch(e){ showDevError('Lỗi khởi chạy: '+(e?.message||e)); }
  });
})();