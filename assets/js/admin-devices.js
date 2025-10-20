// assets/js/admin-devices.js
// Quản lý MÃ & Thiết bị (nâng cấp, vẫn giữ UI cũ)
// - Codes: Thêm mã, Bật/Tắt, Xóa (xóa/tắt -> app đang dùng sẽ bị out)
// - Hàng đợi mã: hiển thị mã chưa sử dụng
// - Devices: Reload, Đổi số bàn (popup lưới), Gỡ liên kết (xác nhận đúng mã), Đặt tên máy, Xoá device nếu không gắn mã
// - Hiển thị DeviceID rút gọn (4 ký tự đầu). Nhấn để bật/tắt full.

(function(){
  'use strict';

  // ---- DOM refs (khớp admin.html hiện tại) ----
  const elCodesBody    = document.getElementById('codesBody');
  const elDevBody      = document.getElementById('devBody');
  const elBtnReloadAll = document.getElementById('btnReloadAll');

  const elCodesInput   = document.getElementById('codesInput');
  const elBtnAddCodes  = document.getElementById('btnAddCodes');

  const elDevError     = document.getElementById('devError');

  // ---- Guard firebase ----
  if (!window.firebase || !firebase.apps?.length) {
    console.warn('[admin-devices] Firebase chưa sẵn sàng. Đảm bảo admin.html đã init trước.');
    return;
  }
  const db = firebase.database();

  // ---- Utils ----
  const showDevError = (msg)=>{ if(!elDevError) return; elDevError.textContent = msg||''; elDevError.classList.toggle('hidden', !msg); };
  const tsStr = (ts)=> { try{ return ts? new Date(ts).toLocaleString(): '—'; }catch{ return String(ts||'—'); } };
  const sleep = (ms)=> new Promise(r=>setTimeout(r, ms));

  // ---- Khu "Hàng đợi mã" (tự tạo nếu chưa có) ----
  // Sẽ chèn 1 ô nhỏ phía TRÊN bảng mã hiện tại
  let elQueueWrap = document.getElementById('codesQueueWrap');
  let elQueueList = document.getElementById('codesQueue');
  let elQueueCount = document.getElementById('codesQueueCount');

  (function ensureQueueBox(){
    if (elQueueWrap && elQueueList) return;
    if (!elCodesBody) return; // không có bảng codes để neo
    const tableElm = elCodesBody.closest('table') || elCodesBody.parentElement;
    const anchor = tableElm ? tableElm : elCodesBody;

    const box = document.createElement('div');
    box.id = 'codesQueueWrap';
    box.className = 'mb-3 p-3 rounded-lg border border-emerald-200 bg-emerald-50';
    box.innerHTML = `
      <div class="flex items-center justify-between mb-2">
        <div class="font-semibold text-emerald-800">
          Hàng đợi mã khả dụng <span id="codesQueueCount" class="text-emerald-600">(0)</span>
        </div>
        <button id="btnCopyQueue" class="px-2 py-1 text-xs rounded bg-emerald-600 text-white hover:bg-emerald-700">Copy tất cả</button>
      </div>
      <div id="codesQueue" class="flex flex-wrap gap-2 text-sm"></div>
    `;
    anchor.parentNode.insertBefore(box, anchor);
    elQueueWrap = document.getElementById('codesQueueWrap');
    elQueueList = document.getElementById('codesQueue');
    elQueueCount= document.getElementById('codesQueueCount');

    const btnCopy = document.getElementById('btnCopyQueue');
    btnCopy?.addEventListener('click', ()=>{
      const items = Array.from(elQueueList.querySelectorAll('[data-code]')).map(x=>x.dataset.code);
      if (!items.length) return alert('Không có mã nào trong hàng đợi.');
      navigator.clipboard.writeText(items.join('\n')).then(()=> alert('Đã copy danh sách mã khả dụng.'));
    });
  })();

  // ---- Tải links.json để build lưới bàn ----
  let LINKS_MAP = null;
  async function loadLinks(){
    try{
      const res = await fetch('./links.json?cb=' + Date.now(), { cache:'no-store' });
      if (!res.ok) throw new Error('HTTP '+res.status);
      const data = await res.json();
      LINKS_MAP = data.links || data;
      if (!LINKS_MAP || typeof LINKS_MAP !== 'object') throw new Error('links.json invalid');
    }catch(e){
      console.warn('[admin-devices] loadLinks fail:', e?.message||e);
      LINKS_MAP = null;
    }
  }

  // ---- Popup chọn bàn (giống app) ----
  function openTablePicker(onPick){
    // nếu có links.json → dùng các key; nếu không → fallback 1..15
    const keys = LINKS_MAP ? Object.keys(LINKS_MAP).sort((a,b)=>Number(a)-Number(b)) : Array.from({length:15},(_,i)=>String(i+1));

    const wrap = document.createElement('div');
    wrap.className = 'fixed inset-0 z-[7000] bg-black/50 flex items-center justify-center p-4';
    wrap.innerHTML = `
      <div class="bg-white rounded-xl shadow-lg w-full max-w-xl p-4">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-lg font-semibold">Chọn bàn</h3>
          <button id="tp-close" class="px-2 py-1 text-sm rounded bg-gray-100 hover:bg-gray-200">Đóng</button>
        </div>
        <div id="tp-grid" class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 max-h-[70vh] overflow-auto"></div>
      </div>
    `;
    document.body.appendChild(wrap);

    const grid = wrap.querySelector('#tp-grid');
    keys.forEach(k=>{
      const btn = document.createElement('button');
      btn.className = 'px-3 py-3 rounded-lg border text-sm font-semibold hover:bg-blue-50';
      btn.textContent = 'Bàn ' + k;
      btn.addEventListener('click', ()=>{
        try{ onPick(k); } finally { document.body.removeChild(wrap); }
      });
      grid.appendChild(btn);
    });
    wrap.querySelector('#tp-close').addEventListener('click', ()=> document.body.removeChild(wrap));
  }

  // ===================== CODES =====================
  function renderQueueFromCodes(allCodes){
    if (!elQueueWrap || !elQueueList) return;
    const entries = Object.entries(allCodes||{});
    const avail = entries
      .filter(([_,v])=> v && v.enabled!==false && !v.boundDeviceId)
      .map(([k,_])=>k)
      .sort((a,b)=> a.localeCompare(b));
    elQueueList.innerHTML = '';
    avail.forEach(code=>{
      const pill = document.createElement('span');
      pill.className = 'px-2 py-1 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-300';
      pill.textContent = code;
      pill.dataset.code = code;
      elQueueList.appendChild(pill);
    });
    if (elQueueCount) elQueueCount.textContent = `(${avail.length})`;
    elQueueWrap.classList.toggle('hidden', avail.length===0);
  }

  function renderCodes(codes){
    if (!elCodesBody) return;
    elCodesBody.innerHTML = '';
    renderQueueFromCodes(codes);

    const entries = Object.entries(codes||{}).sort(([a],[b])=> a.localeCompare(b));

    for (const [code, data] of entries){
      const enabled = (data && data.enabled !== false);
      const boundId = data?.boundDeviceId || null;

      const tr = document.createElement('tr');
      tr.className = 'border-b last:border-0';
      tr.innerHTML = `
        <td class="px-2 py-1 font-mono">${code}</td>
        <td class="px-2 py-1">
          <span class="inline-flex items-center gap-1 text-xs ${enabled?'text-emerald-700':'text-red-600'}">
            <span class="w-2 h-2 rounded-full ${enabled?'bg-emerald-500':'bg-red-500'}"></span>
            ${enabled?'ON':'OFF'}
          </span>
        </td>
        <td class="px-2 py-1 text-xs break-all">${boundId ? boundId : '—'}</td>
        <td class="px-2 py-1">
          <div class="flex flex-wrap gap-2">
            <button class="px-2 py-1 text-xs rounded bg-gray-800 text-white hover:bg-black" data-act="toggle">${enabled?'Tắt mã':'Bật mã'}</button>
            <button class="px-2 py-1 text-xs rounded bg-red-600 text-white hover:bg-red-700" data-act="delete">Xóa mã</button>
          </div>
        </td>
      `;

      // Toggle ON/OFF: nếu OFF và đang dùng → đẩy unbind
      tr.querySelector('[data-act="toggle"]').addEventListener('click', async ()=>{
        try{
          const next = !enabled;
          await db.ref('codes/'+code+'/enabled').set(next);
          if (boundId && next===false){
            // đang dùng mà tắt → unbind máy đó
            await db.ref(`devices/${boundId}/commands/unbindAt`).set(firebase.database.ServerValue.TIMESTAMP);
          }
        }catch(e){ showDevError('Đổi trạng thái mã lỗi: '+(e?.message||e)); }
      });

      // Delete: xóa code; nếu đang dùng → unbind máy
      tr.querySelector('[data-act="delete"]').addEventListener('click', async ()=>{
        if (!confirm(`Xóa mã ${code}?`)) return;
        try{
          if (boundId){
            await db.ref(`devices/${boundId}/commands/unbindAt`).set(firebase.database.ServerValue.TIMESTAMP);
          }
          await db.ref('codes/'+code).remove();
        }catch(e){ showDevError('Xóa mã lỗi: '+(e?.message||e)); }
      });

      elCodesBody.appendChild(tr);
    }
  }

  async function addCodesFromTextarea(){
    const raw = (elCodesInput?.value||'').trim();
    if (!raw) return alert('Dán danh sách mã (mỗi dòng 1 mã)');
    const lines = raw.split(/\r?\n/).map(s=>s.trim().toUpperCase()).filter(Boolean);
    if (!lines.length) return alert('Không có mã hợp lệ');

    const updates = {};
    const now = firebase.database.ServerValue.TIMESTAMP;
    for (const code of lines){
      updates['codes/'+code] = {
        enabled: true,
        boundDeviceId: null,
        boundAt: null,
        createdAt: now
      };
    }
    try{
      await db.ref().update(updates);
      elCodesInput.value = '';
      alert('Đã thêm '+lines.length+' mã');
    }catch(e){ showDevError('Thêm mã lỗi: '+(e?.message||e)); }
  }

  // ===================== DEVICES =====================
  function maskId(id){
    if (!id) return '—';
    if (id.length <= 4) return id;
    return id.slice(0,4) + '…';
  }

  function renderDevices(devices){
    if (!elDevBody) return;
    elDevBody.innerHTML = '';
    const entries = Object.entries(devices||{}).sort((a,b)=> (b[1]?.lastSeen||0) - (a[1]?.lastSeen||0));

    for (const [id, data] of entries){
      const code   = data?.code  || '';
      const name   = data?.name  || '';
      const stage  = data?.stage || 'select';
      const table  = data?.table || '';

      // hiển thị bàn theo quy ước: '-' khi select, số khi start, '+số' khi đang trong POS
      let tableDisp = '—';
      if (stage === 'select') tableDisp = '—';
      else if (stage === 'start') tableDisp = table || '—';
      else if (stage === 'pos') tableDisp = table ? ('+'+table) : '+?';

      const canDeleteDevice = !code; // chỉ xoá khi không gắn mã
      const idMasked = maskId(id);

      const tr = document.createElement('tr');
      tr.className = 'border-b last:border-0';
      tr.innerHTML = `
        <td class="px-2 py-1 text-xs">
          <div class="flex items-center gap-2">
            <span class="font-mono" data-role="devId" data-full="${id}">${idMasked}</span>
            <button class="px-2 py-0.5 text-[11px] rounded border hover:bg-gray-50" data-act="toggleId">Hiện</button>
          </div>
          <div class="text-[11px] text-gray-500 mt-1">
            Tên: <span data-role="devName">${name || '(chưa đặt)'}</span>
            <button class="ml-1 px-2 py-0.5 text-[11px] rounded border hover:bg-gray-50" data-act="setName">Đặt tên</button>
          </div>
        </td>
        <td class="px-2 py-1 font-mono">${code || '—'}</td>
        <td class="px-2 py-1">${tableDisp}</td>
        <td class="px-2 py-1">
          <div class="flex flex-wrap gap-2">
            <button class="px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700"   data-act="reload">Làm mới</button>
            <button class="px-2 py-1 text-xs rounded bg-emerald-600 text-white hover:bg-emerald-700" data-act="settable">Đổi số bàn</button>
            <button class="px-2 py-1 text-xs rounded bg-amber-600 text-white hover:bg-amber-700"   data-act="unbind" ${code?'':'disabled'}>Gỡ liên kết</button>
            <button class="px-2 py-1 text-xs rounded ${canDeleteDevice?'bg-gray-200 hover:bg-gray-300':'bg-gray-100 opacity-50 cursor-not-allowed'}" data-act="delDevice" ${canDeleteDevice?'':'disabled'}>Xoá device</button>
          </div>
        </td>
      `;

      // Toggle show/hide full ID
      tr.querySelector('[data-act="toggleId"]').addEventListener('click', ()=>{
        const el = tr.querySelector('[data-role="devId"]');
        if (!el) return;
        if (el.textContent === idMasked) { el.textContent = id; tr.querySelector('[data-act="toggleId"]').textContent = 'Ẩn'; }
        else { el.textContent = idMasked; tr.querySelector('[data-act="toggleId"]').textContent = 'Hiện'; }
      });

      // Đặt tên
      tr.querySelector('[data-act="setName"]').addEventListener('click', async ()=>{
        const current = name || '';
        const v = prompt('Nhập tên máy (để trống để xoá):', current);
        if (v === null) return;
        try{
          const newName = String(v).trim();
          if (newName) await db.ref(`devices/${id}/name`).set(newName);
          else await db.ref(`devices/${id}/name`).remove();
        }catch(e){ showDevError('Đặt tên lỗi: '+(e?.message||e)); }
      });

      // Reload: chỉ gửi reloadAt
      tr.querySelector('[data-act="reload"]').addEventListener('click', async ()=>{
        try{
          await db.ref(`devices/${id}/commands/reloadAt`).set(firebase.database.ServerValue.TIMESTAMP);
        }catch(e){ showDevError('Gửi reload lỗi: '+(e?.message||e)); }
      });

      // Đổi số bàn: popup lưới → gửi setTable
      tr.querySelector('[data-act="settable"]').addEventListener('click', ()=>{
        openTablePicker(async (tableLabel)=>{
          try{
            await db.ref(`devices/${id}/commands/setTable`).set({
              value: tableLabel,
              at: firebase.database.ServerValue.TIMESTAMP
            });
            // cập nhật hiển thị nhanh
            await db.ref(`devices/${id}`).update({ table: tableLabel, stage: 'start' });
          }catch(e){ showDevError('Đổi số bàn lỗi: '+(e?.message||e)); }
        });
      });

      // Gỡ liên kết (có xác nhận code)
      tr.querySelector('[data-act="unbind"]').addEventListener('click', async ()=>{
        if (!code) return alert('Thiết bị chưa gắn mã.');
        const verify = prompt(`Nhập lại MÃ đang gắn để gỡ liên kết (mã hiện tại: ${code}):`);
        if (verify === null) return;
        if (String(verify).trim().toUpperCase() !== String(code).toUpperCase()){
          alert('Mã xác nhận không khớp. Hủy thao tác.');
          return;
        }
        try{
          // nếu codes/<code> đang bound đúng id → gỡ
          await db.ref('codes/'+code).transaction(cur=>{
            if (!cur) return cur;
            if (cur.boundDeviceId === id) {
              return { ...cur, boundDeviceId:null, boundAt:null };
            }
            return cur;
          });
          // đẩy lệnh cho client về gate
          await db.ref(`devices/${id}/commands/unbindAt`).set(firebase.database.ServerValue.TIMESTAMP);
          // dọn hiển thị
          await db.ref(`devices/${id}`).update({ code:null, table:null, stage:'select' });
        }catch(e){ showDevError('Gỡ liên kết lỗi: '+(e?.message||e)); }
      });

      // Xoá device (chỉ khi không gắn mã)
      tr.querySelector('[data-act="delDevice"]').addEventListener('click', async ()=>{
        if (!canDeleteDevice) return;
        if (!confirm('Xoá thiết bị khỏi danh sách? (Chỉ xoá node devices, không ảnh hưởng codes)')) return;
        try{
          await db.ref(`devices/${id}`).remove();
        }catch(e){ showDevError('Xoá device lỗi: '+(e?.message||e)); }
      });

      elDevBody.appendChild(tr);
    }
  }

  // ===================== WIRING =====================
  (async function boot(){
    try{
      await loadLinks();

      // Subscribe codes & devices
      db.ref('codes').on('value', s=> renderCodes(s.val()||{}), e=> showDevError('Lỗi tải mã: '+(e?.message||e)));
      db.ref('devices').on('value', s=> renderDevices(s.val()||{}), e=> showDevError('Lỗi tải thiết bị: '+(e?.message||e)));

      // Buttons
      elBtnAddCodes?.addEventListener('click', addCodesFromTextarea);
      elBtnReloadAll?.addEventListener('click', async ()=>{
        try{
          await db.ref('broadcast/reloadAt').set(firebase.database.ServerValue.TIMESTAMP);
        }catch(e){ showDevError('Reload toàn bộ lỗi: '+(e?.message||e)); }
      });
    }catch(e){
      showDevError('Lỗi khởi chạy: '+(e?.message||e));
    }
  })();
})();
