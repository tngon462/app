<!-- assets/js/admin-devices.js -->
<script>
(function(){
  'use strict';

  const rootView = document.getElementById('viewDevices');
  if (!rootView) return;

  // ====== Guard Firebase (đã init ở admin.html) ======
  if (!window.firebase || !firebase.apps?.length) {
    rootView.innerHTML = `<div class="text-red-600">Firebase chưa sẵn sàng. Hãy chắc chắn admin.html đã init trước.</div>`;
    return;
  }
  const db = firebase.database();
  const TABLE_COUNT = 15;

  // ====== Helpers ======
  const fmtTime = (ts)=> {
    if (!ts) return '—';
    try { return new Date(ts).toLocaleString(); } catch { return String(ts); }
  };
  const ago = (ts)=>{
    if (!ts) return '—';
    const s = Math.floor((Date.now()-ts)/1000);
    if (s<60) return s+'s';
    const m = Math.floor(s/60);
    if (m<60) return m+'m';
    const h = Math.floor(m/60);
    if (h<24) return h+'h';
    return Math.floor(h/24)+'d';
  };
  const el = (html)=>{
    const d=document.createElement('div');
    d.innerHTML=html.trim();
    return d.firstElementChild;
  };
  const nowTS = ()=> firebase.database.ServerValue.TIMESTAMP;

  // ====== Layout (tự render vào #viewDevices) ======
  rootView.innerHTML = `
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
            <span class="text-xs text-gray-500">Mỗi mã chỉ được 1 máy dùng</span>
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

    <!-- Modal root -->
    <div id="modal-root"></div>
  `;

  const elCodesBody   = document.getElementById('codes-tbody');
  const elDevicesBody = document.getElementById('devices-tbody');
  const elDevError    = document.getElementById('devError');
  const elImportArea  = document.getElementById('codes-import');
  const elBtnImport   = document.getElementById('btn-import-codes');
  const elBtnBcReload = document.getElementById('btn-bc-reload');
  const elQueueWrap   = document.getElementById('codes-queue-wrap');
  const elQueueList   = document.getElementById('codes-queue');
  const elQueueCount  = document.getElementById('codes-queue-count');
  const modalRoot     = document.getElementById('modal-root');

  const showErr = (msg)=>{ elDevError.textContent = msg || ''; elDevError.classList.toggle('hidden', !msg); };

  // ====== Broadcast Reload ======
  elBtnBcReload.addEventListener('click', async ()=>{
    showErr('');
    try{
      await db.ref('broadcast/reloadAt').set(nowTS());
      alert('Đã gửi lệnh reload toàn bộ.');
    }catch(e){ showErr('Gửi broadcast thất bại: ' + (e?.message || e)); }
  });

  // ====== Import Codes ======
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

  // ====== Render Codes ======
  function renderCodes(codes){
    elCodesBody.innerHTML = '';
    const list = Object.entries(codes||{}).sort(([a],[b])=> a.localeCompare(b));

    // hàng đợi
    const avail = [];
    list.forEach(([code, c])=>{
      if (c?.enabled === true && !c?.boundDeviceId) avail.push(code);
    });
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

      // Toggle enable/disable
      row.querySelector('[data-act="toggle"]').addEventListener('click', async ()=>{
        showErr('');
        try{
          await db.ref(`codes/${code}/enabled`).set(!enabled);
          // nếu đang tắt mã và mã này đang gắn đúng 1 device → đẩy unbind
          if (enabled && boundId){
            await db.ref(`devices/${boundId}/commands/unbindAt`).set(nowTS());
          }
        }catch(e){ showErr('Đổi trạng thái mã lỗi: '+(e?.message||e)); }
      });

      // Delete code
      row.querySelector('[data-act="delete"]').addEventListener('click', async ()=>{
        showErr('');
        if (!confirm(`Xoá mã ${code}? iPad đang dùng (nếu có) sẽ bị out.`)) return;
        try{
          // nếu có bound → đẩy unbind trước
          if (boundId){
            await db.ref(`devices/${boundId}/commands/unbindAt`).set(nowTS());
          }
          await db.ref(`codes/${code}`).remove();
        }catch(e){ showErr('Xoá mã lỗi: '+(e?.message||e)); }
      });

      elCodesBody.appendChild(row);
    }
  }

  // ====== Modal chọn bàn ======
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
    const grid = wrap.querySelector('#tp-grid');
    for (let i=1;i<=TABLE_COUNT;i++){
      const b = el(`<button class="px-3 py-3 rounded-lg border text-sm hover:bg-blue-50">${i}</button>`);
      b.addEventListener('click', ()=>{ try{ onPick(String(i)); } finally { wrap.remove(); } });
      grid.appendChild(b);
    }
    wrap.querySelector('#tp-close').addEventListener('click', ()=> wrap.remove());
    (modalRoot || document.body).appendChild(wrap);
  }

  // ====== Render Devices ======
  function renderDevices(devices){
    elDevicesBody.innerHTML = '';
    const list = Object.entries(devices||{}).sort((a,b)=> (b[1]?.lastSeen||0) - (a[1]?.lastSeen||0));

    for (const [id, data] of list){
      const name = data?.name || '';
      const code = data?.code || '';
      const stage = data?.stage || ''; // 'select' | 'start' | 'pos'
      const inPOS = !!data?.inPOS;
      let tableLabel = '—';
      if (stage === 'select') {
        tableLabel = '—';
      } else if (inPOS && data?.table) {
        tableLabel = `+${data.table}`;
      } else if (data?.table) {
        tableLabel = String(data.table);
      }

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
      row.querySelector('input[data-field="name"]').addEventListener('change', async (e)=>{
        try{ await db.ref(`devices/${id}/name`).set(String(e.target.value).trim().slice(0,60)); }
        catch(err){ showErr('Lưu tên máy lỗi: '+(err?.message||err)); }
      });

      // Làm mới: chỉ reload (không unbind, không đụng codes)
      row.querySelector('[data-act="reload"]').addEventListener('click', async ()=>{
        showErr('');
        try{
          await db.ref(`devices/${id}/commands/reloadAt`).set(nowTS());
        }catch(e){ showErr('Gửi reload thất bại: '+(e?.message||e)); }
      });

      // Đổi số bàn: mở picker, gửi setTable (không reload)
      row.querySelector('[data-act="set"]').addEventListener('click', ()=>{
        openTablePicker(async (picked)=>{
          showErr('');
          try{
            await db.ref(`devices/${id}/commands/setTable`).set({ value: picked, at: nowTS() });
            // cập nhật tức thì cho hàng hiển thị (không ép inPOS)
            await db.ref(`devices/${id}/table`).set(picked);
          }catch(e){ showErr('Đổi số bàn lỗi: '+(e?.message||e)); }
        });
      });

      // Gỡ liên kết: thu hồi code + đẩy unbind
      row.querySelector('[data-act="unbind"]').addEventListener('click', async ()=>{
        showErr('');
        if (!code) return;
        if (!confirm(`Gỡ liên kết thiết bị này và giải phóng mã ${code}?`)) return;
        try{
          // chỉ thu hồi nếu codes/<code> đang gắn với đúng device này
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

  // ====== Live subscribe ======
  db.ref('codes').on('value', s=> renderCodes(s.val()||{}), e=> showErr('Lỗi tải mã: '+(e?.message||e)));
  db.ref('devices').on('value', s=> renderDevices(s.val()||{}), e=> showErr('Lỗi tải thiết bị: '+(e?.message||e)));

})();
</script>
