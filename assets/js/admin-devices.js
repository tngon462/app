// assets/js/admin-devices.js
// Tự thêm tab "Thiết bị", tự tạo #viewDevices, subscribe Firebase và render UI.
// Không đụng đến các tab cũ (Screen/Ads). Hoạt động khi admin.html đã init Firebase.

(function(){
  'use strict';

  // ===== Guard Firebase =====
  if (!window.firebase || !firebase.apps?.length) {
    console.warn('[devices] Firebase chưa sẵn sàng. Đảm bảo admin.html đã init trước.');
    return;
  }
  const db = firebase.database();
  const TABLE_COUNT = 15;

  // ===== Helpers =====
  const $id = (s)=> document.getElementById(s);
  const $one = (sel, root=document)=> root.querySelector(sel);
  const el = (html)=>{ const d=document.createElement('div'); d.innerHTML=html.trim(); return d.firstElementChild; };
  const fmtTime = (ts)=>{ if(!ts) return '—'; try{ return new Date(ts).toLocaleString(); }catch{ return String(ts);} };
  const ago = (ts)=>{ if(!ts) return '—'; const s=Math.floor((Date.now()-ts)/1000);
    if(s<60)return s+'s'; const m=Math.floor(s/60); if(m<60) return m+'m'; const h=Math.floor(m/60);
    if(h<24)return h+'h'; return Math.floor(h/24)+'d'; };
  const nowTS = ()=> firebase.database.ServerValue.TIMESTAMP;

  // ===== Ensure tab & view exist =====
  const nav = $one('aside.drawer nav');
  const navScreen  = $id('navScreen');
  const navAds     = $id('navAds');
  let navDevices   = $id('navDevices');

  if (!navDevices && nav) {
    navDevices = el(`<a href="#devices" id="navDevices" class="nav-link">Thiết bị</a>`);
    // chèn sau Ads
    if (navAds && navAds.parentNode === nav) {
      nav.insertBefore(navDevices, navAds.nextSibling);
    } else {
      nav.appendChild(navDevices);
    }
  }

  let viewDevices = $id('viewDevices');
  if (!viewDevices) {
    // chèn section sau #viewAds
    const viewAds = $id('viewAds');
    viewDevices = el(`<section id="viewDevices" class="p-4 md:p-6 hidden"></section>`);
    if (viewAds && viewAds.parentNode) {
      viewAds.parentNode.insertBefore(viewDevices, viewAds.nextSibling);
    } else {
      // fallback
      const main = $one('main.content') || document.body;
      main.appendChild(viewDevices);
    }
  }

  // ===== Router for #devices (chạy sau route cũ) =====
  function activateDevices(){
    const viewScreen = $id('viewScreen');
    const viewAds = $id('viewAds');
    if (viewScreen) viewScreen.classList.add('hidden');
    if (viewAds) viewAds.classList.add('hidden');
    viewDevices.classList.remove('hidden');

    // active nav
    navScreen?.classList.remove('active');
    navAds?.classList.remove('active');
    navDevices?.classList.add('active');

    // đóng drawer nếu mobile
    const drawerMask = $id('drawerMask');
    const drawer = $id('drawer');
    if (window.innerWidth < 768 && drawer && drawerMask){
      drawer.classList.remove('open');
      drawerMask.classList.remove('show');
    }
  }

  function handleHash(){
    if (location.hash === '#devices') {
      // đợi route() cũ của admin chạy xong rồi mới lật lại
      setTimeout(activateDevices, 0);
    }
  }
  window.addEventListener('hashchange', handleHash);
  navDevices?.addEventListener('click', ()=> { location.hash = '#devices'; });

  // Nếu mở thẳng #devices
  handleHash();

  // ===== Build UI skeleton =====
  viewDevices.innerHTML = `
    <div class="max-w-[1200px] mx-auto space-y-6">
      <div class="flex flex-wrap items-center gap-2">
        <button id="btn-bc-reload" class="px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700">Reload toàn bộ</button>
        <span class="text-xs text-gray-500">• Gửi lệnh reload cho tất cả iPad</span>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Codes -->
        <div class="bg-white border border-gray-200 rounded-xl shadow-sm p-4">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-lg font-semibold">Danh sách MÃ</h3>
            <span class="text-xs text-gray-500">Mỗi mã chỉ dùng được 1 máy</span>
          </div>
          <div class="grid gap-2 mb-3">
            <textarea id="codes-import" rows="3" class="w-full p-2 border rounded text-sm" placeholder="Mỗi dòng 1 mã"></textarea>
            <div class="flex items-center gap-2">
              <button id="btn-import-codes" class="px-3 py-2 rounded bg-gray-800 text-white hover:bg-black text-sm">Thêm mã</button>
            </div>
          </div>
          <div class="overflow-auto max-h-[420px] border rounded">
            <table class="min-w-full text-sm">
              <thead class="bg-gray-100 sticky top-0">
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
          <div id="codes-queue-wrap" class="mt-3 hidden">
            <div class="text-xs text-gray-500 mb-1">Hàng đợi mã khả dụng: <span id="codes-queue-count">0</span></div>
            <div id="codes-queue" class="flex flex-wrap gap-2"></div>
          </div>
        </div>

        <!-- Devices -->
        <div class="bg-white border border-gray-200 rounded-xl shadow-sm p-4">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-lg font-semibold">Thiết bị (iPad)</h3>
            <span class="text-xs text-gray-500">Nhấn vào tên máy để sửa</span>
          </div>
          <div class="overflow-auto max-h-[420px] border rounded">
            <table class="min-w-full text-sm">
              <thead class="bg-gray-100 sticky top-0">
                <tr>
                  <th class="px-2 py-1 text-left">Device ID</th>
                  <th class="px-2 py-1 text-left">Tên máy</th>
                  <th class="px-2 py-1 text-left">Mã</th>
                  <th class="px-2 py-1 text-left">Bàn</th>
                  <th class="px-2 py-1 text-left">Last</th>
                  <th class="px-2 py-1 text-left">Thao tác</th>
                </tr>
              </thead>
              <tbody id="devices-tbody"></tbody>
            </table>
          </div>
        </div>
      </div>

      <div id="devError" class="hidden p-3 rounded bg-red-50 text-red-700 text-sm"></div>
    </div>

    <div id="modal-root"></div>
  `;

  const elCodesBody   = $id('codes-tbody');
  const elDevicesBody = $id('devices-tbody');
  const elDevError    = $id('devError');
  const elImportArea  = $id('codes-import');
  const elBtnImport   = $id('btn-import-codes');
  const elBtnBcReload = $id('btn-bc-reload');
  const elQueueWrap   = $id('codes-queue-wrap');
  const elQueueList   = $id('codes-queue');
  const elQueueCount  = $id('codes-queue-count');
  const modalRoot     = $id('modal-root');

  const showErr = (msg)=>{ elDevError.textContent = msg || ''; elDevError.classList.toggle('hidden', !msg); };

  // ===== Broadcast Reload =====
  elBtnBcReload.addEventListener('click', async ()=>{
    showErr('');
    try{
      await db.ref('broadcast/reloadAt').set(nowTS());
      alert('Đã gửi lệnh reload toàn bộ.');
    }catch(e){ showErr('Gửi broadcast thất bại: ' + (e?.message || e)); }
  });

  // ===== Import Codes =====
  elBtnImport.addEventListener('click', async ()=>{
    showErr('');
    const raw = (elImportArea.value||'').trim();
    if (!raw) return alert('Dán danh sách mã (mỗi dòng 1 mã).');
    const lines = raw.split(/\r?\n/).map(s=>s.trim().toUpperCase()).filter(Boolean);
    if (!lines.length) return alert('Không có mã hợp lệ.');

    const updates = {};
    for (const code of lines){
      updates[`codes/${code}`] = {
        enabled: true,
        boundDeviceId: null,
        boundAt: null,
        createdAt: nowTS()
      };
    }
    try{
      await db.ref().update(updates);
      elImportArea.value = '';
      alert(`Đã thêm ${lines.length} mã.`);
    }catch(e){ showErr('Thêm mã lỗi: ' + (e?.message || e)); }
  });

  // ===== Render Codes =====
  function renderCodes(codes){
    elCodesBody.innerHTML = '';
    const list = Object.entries(codes||{}).sort(([a],[b])=> a.localeCompare(b));

    // Hàng đợi
    const avail = list.filter(([_,c])=> c?.enabled===true && !c?.boundDeviceId).map(([k])=>k);
    if (avail.length){
      elQueueWrap.classList.remove('hidden');
      elQueueCount.textContent = String(avail.length);
      elQueueList.innerHTML = '';
      avail.forEach(k=>{
        elQueueList.appendChild(el(`<span class="px-2 py-1 rounded border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs">${k}</span>`));
      });
    }else{
      elQueueWrap.classList.add('hidden');
    }

    for (const [code, data] of list){
      const enabled = data?.enabled !== false;
      const boundId = data?.boundDeviceId || null;
      const row = el(`
        <tr class="border-b last:border-0">
          <td class="px-2 py-1 font-mono">${code}</td>
          <td class="px-2 py-1">
            <span class="inline-flex items-center gap-1 text-xs ${enabled?'text-emerald-700':'text-red-600'}">
              <span class="w-2 h-2 rounded-full ${enabled?'bg-emerald-500':'bg-red-500'}"></span>
              ${enabled?'Đang bật':'Đang tắt'}
            </span>
          </td>
          <td class="px-2 py-1 text-xs break-all">${boundId || '—'}</td>
          <td class="px-2 py-1 text-xs">${data?.boundAt ? fmtTime(data.boundAt) : '—'}</td>
          <td class="px-2 py-1">
            <div class="flex flex-wrap gap-2">
              <button data-act="toggle" class="px-2 py-1 text-xs rounded bg-gray-800 text-white hover:bg-black">${enabled?'Tắt mã':'Bật mã'}</button>
              <button data-act="delete" class="px-2 py-1 text-xs rounded bg-red-600 text-white hover:bg-red-700">Xoá</button>
            </div>
          </td>
        </tr>
      `);

      // Bật/Tắt mã
      row.querySelector('[data-act="toggle"]').addEventListener('click', async ()=>{
        showErr('');
        try{
          await db.ref(`codes/${code}/enabled`).set(!enabled);
          // Nếu đang TẮT mã và mã này có boundId → đẩy unbind cho đúng máy
          if (enabled && boundId){
            await db.ref(`devices/${boundId}/commands/unbindAt`).set(nowTS());
          }
        }catch(e){ showErr('Đổi trạng thái mã lỗi: '+(e?.message||e)); }
      });

      // Xoá mã
      row.querySelector('[data-act="delete"]').addEventListener('click', async ()=>{
        showErr('');
        if (!confirm(`Xoá mã ${code}? iPad đang dùng (nếu có) sẽ bị out.`)) return;
        try{
          if (boundId){
            await db.ref(`devices/${boundId}/commands/unbindAt`).set(nowTS());
          }
          await db.ref(`codes/${code}`).remove();
        }catch(e){ showErr('Xoá mã lỗi: '+(e?.message||e)); }
      });

      elCodesBody.appendChild(row);
    }
  }

  // ===== Modal chọn bàn =====
  function openTablePicker(onPick){
    const wrap = el(`
      <div class="fixed inset-0 z-[7000] bg-black/50 flex items-center justify-center p-4">
        <div class="bg-white rounded-xl shadow-lg w-full max-w-md p-4">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-lg font-semibold">Chọn số bàn</h3>
            <button class="px-2 py-1 text-sm rounded bg-gray-100 hover:bg-gray-200" id="tp-close">Đóng</button>
          </div>
          <div id="tp-grid" class="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-[60vh] overflow-auto"></div>
        </div>
      </div>
    `);
    const grid = $one('#tp-grid', wrap);
    for (let i=1;i<=TABLE_COUNT;i++){
      const b = el(`<button class="px-3 py-3 rounded-lg border text-sm hover:bg-blue-50">${i}</button>`);
      b.addEventListener('click', ()=>{ try{ onPick(String(i)); } finally { wrap.remove(); } });
      grid.appendChild(b);
    }
    $one('#tp-close', wrap).addEventListener('click', ()=> wrap.remove());
    ( $id('modal-root') || document.body ).appendChild(wrap);
  }

  // ===== Render Devices =====
  function renderDevices(devices){
    elDevicesBody.innerHTML = '';
    const list = Object.entries(devices||{}).sort((a,b)=> (b[1]?.lastSeen||0) - (a[1]?.lastSeen||0));

    for (const [id, data] of list){
      const name  = data?.name || '';
      const code  = data?.code || '';
      const stage = data?.stage || ''; // 'select' | 'start' | 'pos'
      const inPOS = !!data?.inPOS;
      let tableLabel = '—';
      if (stage === 'select') tableLabel = '—';
      else if (inPOS && data?.table) tableLabel = `+${data.table}`;
      else if (data?.table) tableLabel = String(data.table);

      const row = el(`
        <tr class="border-b last:border-0">
          <td class="px-2 py-1 text-xs break-all font-mono">${id}</td>
          <td class="px-2 py-1">
            <input data-field="name" class="px-2 py-1 text-sm border rounded w-36" value="${name.replace(/"/g,'&quot;')}" />
          </td>
          <td class="px-2 py-1 font-mono">${code || '—'}</td>
          <td class="px-2 py-1">${tableLabel}</td>
          <td class="px-2 py-1 text-xs">${data?.lastSeen ? ago(data.lastSeen) : '—'}</td>
          <td class="px-2 py-1">
            <div class="flex flex-wrap gap-2">
              <button data-act="reload"  class="px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700">Làm mới</button>
              <button data-act="set"     class="px-2 py-1 text-xs rounded bg-emerald-600 text-white hover:bg-emerald-700">Đổi số bàn</button>
              <button data-act="unbind"  class="px-2 py-1 text-xs rounded bg-amber-600 text-white hover:bg-amber-700" ${code?'':'disabled'}>Gỡ liên kết</button>
            </div>
          </td>
        </tr>
      `);

      // Sửa tên máy
      $one('input[data-field="name"]', row).addEventListener('change', async (e)=>{
        try{ await db.ref(`devices/${id}/name`).set(String(e.target.value).trim().slice(0,60)); }
        catch(err){ showErr('Lưu tên máy lỗi: '+(err?.message||err)); }
      });

      // Làm mới: chỉ reload (không unbind)
      $one('[data-act="reload"]', row).addEventListener('click', async ()=>{
        showErr('');
        try{
          await db.ref(`devices/${id}/commands/reloadAt`).set(nowTS());
        }catch(e){ showErr('Gửi reload thất bại: '+(e?.message||e)); }
      });

      // Đổi số bàn: gửi setTable (không reload)
      $one('[data-act="set"]', row).addEventListener('click', ()=>{
        openTablePicker(async (picked)=>{
          showErr('');
          try{
            await db.ref(`devices/${id}/commands/setTable`).set({ value: picked, at: nowTS() });
            await db.ref(`devices/${id}/table`).set(picked); // phản hồi nhanh UI
          }catch(e){ showErr('Đổi số bàn lỗi: '+(e?.message||e)); }
        });
      });

      // Gỡ liên kết: thu hồi code đúng-device + unbind
      $one('[data-act="unbind"]', row).addEventListener('click', async ()=>{
        showErr('');
        if (!code) return;
        if (!confirm(`Gỡ liên kết thiết bị này và giải phóng mã ${code}?`)) return;
        try{
          await db.ref(`codes/${code}`).transaction(v=>{
            if (!v) return v;
            if (v.boundDeviceId === id) return { ...v, boundDeviceId: null, boundAt: null };
            return v;
          });
          await db.ref(`devices/${id}/commands/unbindAt`).set(nowTS());
          await db.ref(`devices/${id}`).update({ code:null, table:null });
        }catch(e){ showErr('Gỡ liên kết thất bại: '+(e?.message||e)); }
      });

      elDevicesBody.appendChild(row);
    }
  }

  // ===== Live subscribe =====
  db.ref('codes').on('value', s=> renderCodes(s.val()||{}), e=> showErr('Lỗi tải mã: '+(e?.message||e)));
  db.ref('devices').on('value', s=> renderDevices(s.val()||{}), e=> showErr('Lỗi tải thiết bị: '+(e?.message||e)));

})();
