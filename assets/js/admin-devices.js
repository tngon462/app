// assets/js/admin-devices.js (UI-first, no-logic-change)
// - ĐẨY "Thiết bị (iPad)" LÊN TRÊN, nút to hơn ~2x
// - Sắp xếp theo số bàn: pos:+N > start:N > select:— ; cùng bàn thì ưu tiên lastSeen
// - Giữ nguyên toàn bộ logic đọc/ghi Firebase như bản ổn định trước
// - Có hàng đợi mã (available), toggle ID 4 ký tự, đặt tên máy, xác nhận gỡ liên kết bằng mã, xóa device khi không còn mã

(function(){
  'use strict';

  // ===== Helpers =====
  const $id  = (id)=> document.getElementById(id);
  const log  = (...a)=> console.log('[admin-devices]', ...a);
  const warn = (...a)=> console.warn('[admin-devices]', ...a);

  let db = null;

  // ===== DOM refs (khớp nhiều ID để không phá bản cũ) =====
  let elCodesBody, elDevBody, elBtnReloadAll, elCodesInput, elBtnAddCodes, elDevError;
  let elQueueWrap, elQueueList, elQueueCount;

  function bindDomRefs(){
    // Codes tbody
    elCodesBody    = $id('codesBody') || $id('codes-tbody') || $id('codes_tbody');
    // Devices tbody
    elDevBody      = $id('devBody')   || $id('devices-tbody') || $id('devices_tbody');
    // Buttons
    elBtnReloadAll = $id('btnReloadAll') || $id('btn-broadcast-reload');
    elCodesInput   = $id('codesInput')   || $id('codes-import');
    elBtnAddCodes  = $id('btnAddCodes')  || $id('btn-import-codes');
    // Error
    elDevError     = $id('devError') || $id('devicesError') || $id('codesError');
    // Queue
    elQueueWrap    = $id('codesQueueWrap');
    elQueueList    = $id('codesQueue');
    elQueueCount   = $id('codesQueueCount');

    if (!elCodesBody) warn('Không thấy tbody Codes (codesBody/codes-tbody).');
    if (!elDevBody)   warn('Không thấy tbody Devices (devBody/devices-tbody).');
  }

  const showDevError = (msg)=>{
    if (!elDevError) { if (msg) warn('ERROR:', msg); return; }
    elDevError.textContent = msg||'';
    elDevError.classList.toggle('hidden', !msg);
  };

  // ===== Firebase guard =====
  async function ensureFirebaseReady(){
    if (!window.firebase || !firebase.apps?.length){
      throw new Error('Firebase chưa init. Hãy đảm bảo admin.html đã init trước.');
    }
    db = firebase.database();
    if (!firebase.auth().currentUser){
      await firebase.auth().signInAnonymously();
      await new Promise(res=>{
        const un = firebase.auth().onAuthStateChanged(u=>{ if(u){ un(); res(); }});
      });
    }
    log('Auth OK');
  }

  // ===== links.json để chọn bàn =====
  let LINKS_MAP = null;
  async function loadLinks(){
    try{
      const res = await fetch('./links.json?cb='+Date.now(), { cache:'no-store' });
      if (!res.ok) throw new Error('HTTP '+res.status);
      const data = await res.json();
      LINKS_MAP = data.links || data;
      if (!LINKS_MAP || typeof LINKS_MAP !== 'object') throw new Error('links.json invalid');
      log('links.json:', Object.keys(LINKS_MAP).length, 'entries');
    }catch(e){
      LINKS_MAP = null;
      warn('Không tải được links.json (SetTable vẫn gửi số bàn, client tự xử lý URL).');
    }
  }

  function openTablePicker(onPick){
    const keys = LINKS_MAP ? Object.keys(LINKS_MAP).sort((a,b)=>Number(a)-Number(b)) : Array.from({length:15},(_,i)=>String(i+1));
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

    const grid = wrap.querySelector('#tp-grid');
    keys.forEach(k=>{
      const btn = document.createElement('button');
      btn.className = 'px-4 py-3 rounded-xl border text-base font-semibold hover:bg-blue-50';
      btn.textContent = 'Bàn ' + k;
      btn.addEventListener('click', ()=>{ try{ onPick(k); }finally{ document.body.removeChild(wrap); } });
      grid.appendChild(btn);
    });
    wrap.querySelector('#tp-close').addEventListener('click', ()=> document.body.removeChild(wrap));
  }

  // ===== Queue box (auto build nếu thiếu) =====
  function ensureQueueBox(){
    if (elQueueWrap && elQueueList) return;
    if (!elCodesBody) return;
    const tableElm = elCodesBody.closest('table') || elCodesBody.parentElement;
    const anchor   = tableElm || elCodesBody;
    const box = document.createElement('div');
    box.id = 'codesQueueWrap';
    box.className = 'mb-3 p-3 rounded-lg border border-emerald-200 bg-emerald-50';
    box.innerHTML = `
      <div class="flex items-center justify-between mb-2">
        <div class="font-semibold text-emerald-800">
          Hàng đợi mã khả dụng <span id="codesQueueCount" class="text-emerald-600">(0)</span>
        </div>
        <button id="btnCopyQueue" class="px-3 py-1.5 text-xs rounded bg-emerald-600 text-white hover:bg-emerald-700">Copy tất cả</button>
      </div>
      <div id="codesQueue" class="flex flex-wrap gap-2 text-sm"></div>`;
    anchor.parentNode.insertBefore(box, anchor);
    elQueueWrap  = $id('codesQueueWrap');
    elQueueList  = $id('codesQueue');
    elQueueCount = $id('codesQueueCount');
    $id('btnCopyQueue')?.addEventListener('click', ()=>{
      const items = Array.from(elQueueList.querySelectorAll('[data-code]')).map(x=>x.dataset.code);
      if (!items.length) return alert('Không có mã nào trong hàng đợi.');
      navigator.clipboard.writeText(items.join('\n')).then(()=> alert('Đã copy danh sách mã khả dụng.'));
    });
  }

  function renderQueueFromCodes(allCodes){
    if (!elCodesBody) return;
    ensureQueueBox();
    if (!elQueueWrap || !elQueueList) return;
    const avail = Object
      .entries(allCodes||{})
      .filter(([_,v])=> v && v.enabled!==false && !v.boundDeviceId)
      .map(([k])=>k)
      .sort((a,b)=> a.localeCompare(b));
    elQueueList.innerHTML = '';
    const frag = document.createDocumentFragment();
    avail.forEach(code=>{
      const pill = document.createElement('span');
      pill.className = 'px-2 py-1 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-300';
      pill.textContent = code;
      pill.dataset.code = code;
      frag.appendChild(pill);
    });
    elQueueList.appendChild(frag);
    if (elQueueCount) elQueueCount.textContent = `(${avail.length})`;
    elQueueWrap.classList.toggle('hidden', avail.length===0);
  }

  // ===== CODES =====
  function renderCodes(codes){
    if (!elCodesBody) return;
    elCodesBody.innerHTML = '';
    renderQueueFromCodes(codes);

    const entries = Object.entries(codes||{}).sort(([a],[b])=> a.localeCompare(b));
    const frag = document.createDocumentFragment();

    entries.forEach(([code, data])=>{
      const enabled = (data && data.enabled !== false);
      const boundId = data?.boundDeviceId || null;

      const tr = document.createElement('tr');
      tr.className = 'border-b last:border-0';
      tr.innerHTML = `
        <td class="px-2 py-2 font-mono text-sm">${code}</td>
        <td class="px-2 py-2">
          <span class="inline-flex items-center gap-2 text-xs ${enabled?'text-emerald-700':'text-red-600'}">
            <span class="w-2 h-2 rounded-full ${enabled?'bg-emerald-500':'bg-red-500'}"></span>
            ${enabled?'ON':'OFF'}
          </span>
        </td>
        <td class="px-2 py-2 text-xs break-all">${boundId ? boundId : '—'}</td>
        <td class="px-2 py-2">
          <div class="flex flex-wrap gap-2">
            <button class="px-3 py-2 text-xs rounded bg-gray-800 text-white hover:bg-black" data-act="toggle">${enabled?'Tắt mã':'Bật mã'}</button>
            <button class="px-3 py-2 text-xs rounded bg-red-600 text-white hover:bg-red-700" data-act="delete">Xóa mã</button>
          </div>
        </td>`;

      tr.querySelector('[data-act="toggle"]').addEventListener('click', async ()=>{
        try{
          const next = !enabled;
          await db.ref('codes/'+code+'/enabled').set(next);
          if (boundId && next===false){
            await db.ref(`devices/${boundId}/commands/unbindAt`).set(firebase.database.ServerValue.TIMESTAMP);
          }
        }catch(e){ showDevError('Đổi trạng thái mã lỗi: '+(e?.message||e)); }
      });

      tr.querySelector('[data-act="delete"]').addEventListener('click', async ()=>{
        if (!confirm(`Xóa mã ${code}?`)) return;
        try{
          if (boundId){
            await db.ref(`devices/${boundId}/commands/unbindAt`).set(firebase.database.ServerValue.TIMESTAMP);
          }
          await db.ref('codes/'+code).remove();
        }catch(e){ showDevError('Xóa mã lỗi: '+(e?.message||e)); }
      });

      frag.appendChild(tr);
    });

    elCodesBody.appendChild(frag);
  }

  async function addCodesFromTextarea(){
    const raw = (elCodesInput?.value||'').trim();
    if (!raw) return alert('Dán danh sách mã (mỗi dòng 1 mã)');
    const lines = raw.split(/\r?\n/).map(s=>s.trim().toUpperCase()).filter(Boolean);
    if (!lines.length) return alert('Không có mã hợp lệ');

    const updates = {};
    const now = firebase.database.ServerValue.TIMESTAMP;
    for (const code of lines){
      updates['codes/'+code] = { enabled:true, boundDeviceId:null, boundAt:null, createdAt: now };
    }
    try{
      await db.ref().update(updates);
      elCodesInput.value = '';
      alert('Đã thêm '+lines.length+' mã');
    }catch(e){ showDevError('Thêm mã lỗi: '+(e?.message||e)); }
  }

  // ===== DEVICES =====
  const maskId = (id)=> (!id ? '—' : (id.length<=4 ? id : id.slice(0,4)+'…'));

  function tableSortKey(d){
    // Ưu tiên: pos:+N > start:N > select:— ; key nhỏ hơn -> lên trước
    const stage = d?.stage || 'select';
    const t     = d?.table;
    const n     = t ? Number(t) : NaN;

    if (stage === 'pos'   && !Number.isNaN(n)) return [0, n]; // +N
    if (stage === 'start' && !Number.isNaN(n)) return [1, n]; //  N
    return [2, Number.POSITIVE_INFINITY];                     //  —
  }

  function renderDevices(devices){
    if (!elDevBody) return;

    // ĐẨY KHỐI THIẾT BỊ LÊN ĐẦU (nếu bố cục cũ khác, ta không phá – chỉ cố gắng)
    const devicesSection = elDevBody.closest('section') || elDevBody.closest('div');
    if (devicesSection && devicesSection.parentNode.firstElementChild !== devicesSection){
      try{ devicesSection.parentNode.insertBefore(devicesSection, devicesSection.parentNode.firstElementChild); }catch(_){}
    }

    elDevBody.innerHTML = '';

    const entries = Object.entries(devices||{});
    // Sắp xếp theo số bàn ưu tiên như quy ước
    entries.sort((a,b)=>{
      const ka = tableSortKey(a[1]);
      const kb = tableSortKey(b[1]);
      if (ka[0] !== kb[0]) return ka[0] - kb[0];
      if (ka[1] !== kb[1]) return ka[1] - kb[1];
      // cùng bàn/stage -> lastSeen desc
      return (b[1]?.lastSeen||0) - (a[1]?.lastSeen||0);
    });

    const frag = document.createDocumentFragment();

    entries.forEach(([id, data])=>{
      const code   = data?.code  || '';
      const name   = data?.name  || '';
      const stage  = data?.stage || 'select';
      const table  = data?.table || '';

      let tableDisp = '—';
      if (stage === 'select') tableDisp = '—';
      else if (stage === 'start') tableDisp = table || '—';
      else if (stage === 'pos') tableDisp = table ? ('+'+table) : '+?';

      const canDeleteDevice = !code;
      const idMasked = maskId(id);

      const tr = document.createElement('tr');
      tr.className = 'border-b last:border-0';
      tr.innerHTML = `
        <td class="px-2 py-3 text-xs">
          <div class="flex items-center gap-2">
            <span class="font-mono" data-role="devId" data-full="${id}">${idMasked}</span>
            <button class="px-3 py-1 text-[11px] rounded border hover:bg-gray-50" data-act="toggleId">Hiện</button>
          </div>
          <div class="text-[11px] text-gray-500 mt-1">
            Tên: <span data-role="devName">${name || '(chưa đặt)'}</span>
            <button class="ml-1 px-3 py-1 text-[11px] rounded border hover:bg-gray-50" data-act="setName">Đặt tên</button>
          </div>
        </td>
        <td class="px-2 py-3 font-mono">${code || '—'}</td>
        <td class="px-2 py-3">${tableDisp}</td>
        <td class="px-2 py-3">
          <div class="flex flex-wrap gap-2">
            <button class="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700"    data-act="reload">Làm mới</button>
            <button class="px-4 py-2 text-sm rounded bg-emerald-600 text-white hover:bg-emerald-700" data-act="settable">Đổi số bàn</button>
            <button class="px-4 py-2 text-sm rounded bg-amber-600 text-white hover:bg-amber-700"  data-act="unbind" ${code?'':'disabled'}>Gỡ liên kết</button>
            <button class="px-4 py-2 text-sm rounded ${canDeleteDevice?'bg-gray-200 hover:bg-gray-300':'bg-gray-100 opacity-50 cursor-not-allowed'}" data-act="delDevice" ${canDeleteDevice?'':'disabled'}>Xoá device</button>
          </div>
        </td>`;

      tr.querySelector('[data-act="toggleId"]').addEventListener('click', ()=>{
        const el = tr.querySelector('[data-role="devId"]');
        const btn= tr.querySelector('[data-act="toggleId"]');
        if (!el || !btn) return;
        if (el.textContent === idMasked) { el.textContent = id; btn.textContent = 'Ẩn'; }
        else { el.textContent = idMasked; btn.textContent = 'Hiện'; }
      });

      tr.querySelector('[data-act="setName"]').addEventListener('click', async ()=>{
        const v = prompt('Nhập tên máy (để trống để xoá):', name || '');
        if (v === null) return;
        try{
          const newName = String(v).trim();
          if (newName) await db.ref(`devices/${id}/name`).set(newName);
          else await db.ref(`devices/${id}/name`).remove();
        }catch(e){ showDevError('Đặt tên lỗi: '+(e?.message||e)); }
      });

      tr.querySelector('[data-act="reload"]').addEventListener('click', async ()=>{
        try{
          await db.ref(`devices/${id}/commands/reloadAt`).set(firebase.database.ServerValue.TIMESTAMP);
        }catch(e){ showDevError('Gửi reload lỗi: '+(e?.message||e)); }
      });

      tr.querySelector('[data-act="settable"]').addEventListener('click', ()=>{
        openTablePicker(async (tableLabel)=>{
          try{
            await db.ref(`devices/${id}/commands/setTable`).set({ value: tableLabel, at: firebase.database.ServerValue.TIMESTAMP });
            await db.ref(`devices/${id}`).update({ table: tableLabel, stage:'start' });
          }catch(e){ showDevError('Đổi số bàn lỗi: '+(e?.message||e)); }
        });
      });

      tr.querySelector('[data-act="unbind"]').addEventListener('click', async ()=>{
        if (!code) return alert('Thiết bị chưa gắn mã.');
        const verify = prompt(`Nhập lại MÃ đang gắn để gỡ liên kết (mã hiện tại: ${code}):`);
        if (verify === null) return;
        if (String(verify).trim().toUpperCase() !== String(code).toUpperCase()){
          alert('Mã xác nhận không khớp. Hủy thao tác.');
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
        }catch(e){ showDevError('Gỡ liên kết lỗi: '+(e?.message||e)); }
      });

      tr.querySelector('[data-act="delDevice"]').addEventListener('click', async ()=>{
        if (code) return;
        if (!confirm('Xoá thiết bị khỏi danh sách? (Chỉ xoá node devices, không ảnh hưởng codes)')) return;
        try{ await db.ref(`devices/${id}`).remove(); }
        catch(e){ showDevError('Xoá device lỗi: '+(e?.message||e)); }
      });

      frag.appendChild(tr);
    });

    elDevBody.appendChild(frag);
  }

  // ===== Boot wiring =====
  document.addEventListener('DOMContentLoaded', async ()=>{
    try{
      bindDomRefs();
      await ensureFirebaseReady();
      await loadLinks();

      // Subscriptions
      db.ref('codes').on('value',
        s=> renderCodes(s.val()||{}),
        e=> showDevError('Lỗi tải mã: '+(e?.message||e))
      );
      db.ref('devices').on('value',
        s=> renderDevices(s.val()||{}),
        e=> showDevError('Lỗi tải thiết bị: '+(e?.message||e))
      );

      // Buttons
      elBtnAddCodes?.addEventListener('click', addCodesFromTextarea);
      elBtnReloadAll?.addEventListener('click', async ()=>{
        try{
          await db.ref('broadcast/reloadAt').set(firebase.database.ServerValue.TIMESTAMP);
        }catch(e){ showDevError('Reload toàn bộ lỗi: '+(e?.message||e)); }
      });

      log('UI ready.');
    }catch(e){
      console.error(e);
      showDevError('Lỗi khởi chạy: '+(e?.message||e));
    }
  });
})();
