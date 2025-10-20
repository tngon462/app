<!-- ĐẢM BẢO admin.html đã init Firebase & auth ẩn danh trước khi load file này -->
<script>
// assets/js/admin-devices.js v4
// - Tab “Thiết bị”: Làm mới / Đổi bàn / Gỡ liên kết (xác nhận code) / Đổi tên máy / Xoá device (chỉ khi không gắn code)
// - Tab “Mã”: Bật/Tắt mã (tắt thì máy đang dùng OUT về Gate) / Xoá mã (máy đang dùng OUT về Gate)
// - Hàng đợi mã: liệt kê các mã enabled && chưa bound (để quản lý nhanh)
// - Mask DeviceID: chỉ hiện 4 ký tự đầu, click để bật/tắt hiện full
// YÊU CẦU: admin.html đã có các phần tử: #devices-tbody, #codes-tbody, #codes-queue, #codes-queue-wrap
//          và đã gọi firebase.initializeApp(...) + auth ẩn danh OK.

(function(){
  'use strict';

  // ====== UI refs (khớp admin.html cũ) ======
  const elDevError      = document.getElementById('devError') || (()=>{ const d=document.createElement('div'); d.id='devError'; d.className='hidden text-red-600 text-sm'; document.body.appendChild(d); return d; })();
  const elDevicesTbody  = document.getElementById('devices-tbody');
  const elCodesTbody    = document.getElementById('codes-tbody');
  const elQueueWrap     = document.getElementById('codes-queue-wrap');
  const elQueue         = document.getElementById('codes-queue');

  // ====== Helpers ======
  const showErr = (m)=>{ elDevError.textContent = m||''; elDevError.classList.toggle('hidden', !m); };
  const tsAgo = (ts)=>{ if(!ts) return '—'; const s=Math.floor((Date.now()-ts)/1000); if(s<60) return s+'s'; const m=Math.floor(s/60); if(m<60) return m+'m'; const h=Math.floor(m/60); if(h<24) return h+'h'; return Math.floor(h/24)+'d'; };
  const maskId = (id, reveal)=> reveal ? id : (id ? (String(id).slice(0,4) + '…') : '—');

  if (!window.firebase || !firebase.apps.length) {
    console.warn('[admin-devices] Firebase chưa sẵn sàng (chưa init ở admin.html?).');
    return;
  }
  const db = firebase.database();

  // Cache để thao tác chéo
  let currentDevices = {};
  let currentCodes   = {};

  // ====== HÀNG ĐỢI MÃ (enabled && !bound) ======
  function renderQueue(codes){
    if (!elQueueWrap || !elQueue) return;
    const list = Object.entries(codes||{})
      .filter(([,v]) => v && v.enabled !== false && !v.boundDeviceId)
      .map(([k]) => k)
      .sort((a,b)=> a.localeCompare(b));

    elQueue.innerHTML = '';
    list.forEach(code=>{
      const pill = document.createElement('span');
      pill.className = 'px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs';
      pill.textContent = code;
      elQueue.appendChild(pill);
    });
    elQueueWrap.classList.toggle('hidden', list.length===0);
    const countEl = document.getElementById('codes-queue-count');
    if (countEl) countEl.textContent = list.length;
  }

  // ====== MÃ: Bật/Tắt + Xoá ======
  function renderCodes(codes){
    currentCodes = codes || {};
    if (!elCodesTbody) return;
    elCodesTbody.innerHTML = '';

    const entries = Object.entries(currentCodes).sort(([a],[b])=> a.localeCompare(b));
    entries.forEach(([code, data])=>{
      const tr = document.createElement('tr');
      tr.className = 'border-b last:border-0';
      const enabled = (data && data.enabled !== false);
      const boundId = data?.boundDeviceId || null;

      tr.innerHTML = `
        <td class="px-2 py-1 font-mono text-sm">${code}</td>
        <td class="px-2 py-1">
          <span class="inline-flex items-center gap-1 text-xs ${enabled?'text-emerald-700':'text-gray-500'}">
            <span class="w-2 h-2 rounded-full ${enabled?'bg-emerald-500':'bg-gray-400'}"></span>
            ${enabled?'Đang bật':'Đang tắt'}
          </span>
        </td>
        <td class="px-2 py-1 text-xs break-all">${boundId ? boundId : '—'}</td>
        <td class="px-2 py-1 text-xs">${data?.boundAt? new Date(data.boundAt).toLocaleString() : '—'}</td>
        <td class="px-2 py-1">
          <div class="flex flex-wrap gap-2">
            <button class="px-2 py-1 text-xs rounded bg-gray-800 text-white hover:bg-black" data-act="toggle">${enabled?'Tắt':'Bật'}</button>
            <button class="px-2 py-1 text-xs rounded bg-red-600 text-white hover:bg-red-700" data-act="delete">Xoá</button>
          </div>
        </td>
      `;

      // Toggle: nếu tắt mã -> nếu đang có boundDevice -> đẩy OUT về Gate, trả mã về hàng đợi
      tr.querySelector('[data-act="toggle"]').addEventListener('click', async ()=>{
        showErr('');
        try{
          const newVal = !enabled;
          const updates = {};
          updates[`codes/${code}/enabled`] = newVal;
          // Nếu đang tắt (newVal=false) và có máy đang dùng -> unbind
          if (boundId && newVal === false){
            updates[`codes/${code}/boundDeviceId`] = null;
            updates[`codes/${code}/boundAt`]       = null;
          }
          await db.ref().update(updates);

          if (boundId && newVal === false){
            // Gửi lệnh OUT cho máy đang dùng
            await db.ref(`devices/${boundId}/commands/unbindAt`).set(firebase.database.ServerValue.TIMESTAMP);
            // (tuỳ chọn) dọn hiển thị thiết bị
            await db.ref(`devices/${boundId}`).update({ code:null, table:null });
          }
        }catch(e){
          showErr('Đổi trạng thái mã thất bại: ' + (e?.message||e));
        }
      });

      // Delete: xoá mã; nếu đang bound -> OUT máy, trả mã khỏi máy
      tr.querySelector('[data-act="delete"]').addEventListener('click', async ()=>{
        if (!confirm(`Xoá mã "${code}"? Máy đang dùng (nếu có) sẽ bị OUT.`)) return;
        showErr('');
        try{
          if (boundId){
            // OUT máy
            await db.ref(`devices/${boundId}/commands/unbindAt`).set(firebase.database.ServerValue.TIMESTAMP);
            await db.ref(`devices/${boundId}`).update({ code:null, table:null });
          }
          await db.ref(`codes/${code}`).remove();
        }catch(e){
          showErr('Xoá mã thất bại: ' + (e?.message||e));
        }
      });

      elCodesTbody.appendChild(tr);
    });

    renderQueue(currentCodes);
  }

  // ====== Modal chọn bàn ======
  function openTablePicker(count, onPick){
    const root = document.getElementById('modal-root') || document.body;
    const wrap = document.createElement('div');
    wrap.className = 'fixed inset-0 bg-black/50 z-[7000] flex items-center justify-center p-4';
    wrap.innerHTML = `
      <div class="bg-white rounded-xl shadow-lg w-full max-w-md p-4">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-lg font-semibold">Chọn số bàn</h3>
          <button id="tp-close" class="px-2 py-1 text-sm rounded bg-gray-100 hover:bg-gray-200">Đóng</button>
        </div>
        <div id="tp-grid" class="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-[60vh] overflow-auto"></div>
      </div>`;
    root.appendChild(wrap);
    const grid = wrap.querySelector('#tp-grid');
    for(let i=1;i<=count;i++){
      const btn=document.createElement('button');
      btn.className='px-3 py-3 rounded-lg border text-sm hover:bg-blue-50';
      btn.textContent = String(i);
      btn.addEventListener('click', ()=>{ try{ onPick(String(i)); }finally{ root.removeChild(wrap); } });
      grid.appendChild(btn);
    }
    wrap.querySelector('#tp-close').addEventListener('click', ()=> root.removeChild(wrap));
  }

  // ====== THIẾT BỊ: danh sách & hành động ======
  function renderDevices(devices){
    currentDevices = devices || {};
    if (!elDevicesTbody) return;
    elDevicesTbody.innerHTML = '';

    const entries = Object.entries(currentDevices).sort((a,b)=>(b[1]?.lastSeen||0)-(a[1]?.lastSeen||0));
    const TABLE_COUNT = 15;

    entries.forEach(([id, data])=>{
      const code   = data?.code || '';
      const table  = data?.table || '';
      const stage  = data?.stage || '';
      const name   = data?.name || '';
      const last   = data?.lastSeen || 0;

      // Mask on by default
      let revealId = false;
      const tr = document.createElement('tr');
      tr.className = 'border-b last:border-0';
      tr.innerHTML = `
        <td class="px-2 py-1 text-xs">
          <button class="text-blue-700 underline" data-act="toggle-id">${maskId(id,false)}</button>
        </td>
        <td class="px-2 py-1">
          <div class="flex items-center gap-2">
            <span class="text-sm">${name ? name : '<em class="text-gray-400">—</em>'}</span>
            <button class="px-2 py-0.5 text-xs rounded bg-gray-100 hover:bg-gray-200" data-act="rename">✎</button>
          </div>
        </td>
        <td class="px-2 py-1 font-mono">${code || '—'}</td>
        <td class="px-2 py-1">${stage==='pos' && table ? ('+'+table) : (stage==='start' && table ? table : (stage==='select' ? '—' : (table||'—')))}</td>
        <td class="px-2 py-1 text-xs">${last? tsAgo(last) : '—'}</td>
        <td class="px-2 py-1">
          <div class="flex flex-wrap gap-2">
            <button class="px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700" data-act="reload">Làm mới</button>
            <button class="px-2 py-1 text-xs rounded bg-emerald-600 text-white hover:bg-emerald-700" data-act="settable">Đổi số bàn</button>
            <button class="px-2 py-1 text-xs rounded bg-amber-600 text-white hover:bg-amber-700" data-act="unbind" ${code?'':'disabled'}>Gỡ liên kết</button>
            <button class="px-2 py-1 text-xs rounded ${code?'bg-gray-300 text-gray-500 cursor-not-allowed':'bg-red-600 text-white hover:bg-red-700'}" data-act="delete" ${code?'disabled':''}>Xoá device</button>
          </div>
        </td>
      `;

      // Toggle reveal ID
      tr.querySelector('[data-act="toggle-id"]').addEventListener('click', ()=>{
        revealId = !revealId;
        tr.querySelector('[data-act="toggle-id"]').textContent = maskId(id, revealId);
      });

      // Đổi tên máy (lưu vào devices/<id>/name)
      tr.querySelector('[data-act="rename"]').addEventListener('click', async ()=>{
        const v = prompt('Đặt tên máy (để trống để xoá):', name || '');
        if (v===null) return;
        try{
          const clean = String(v).trim();
          await db.ref(`devices/${id}/name`).set(clean || null);
        }catch(e){ showErr('Đổi tên máy lỗi: '+(e?.message||e)); }
      });

      // Làm mới → devices/<id>/commands/reloadAt
      tr.querySelector('[data-act="reload"]').addEventListener('click', async ()=>{
        try{
          await db.ref(`devices/${id}/commands/reloadAt`).set(firebase.database.ServerValue.TIMESTAMP);
        }catch(e){ showErr('Gửi lệnh tải lại lỗi: '+(e?.message||e)); }
      });

      // Đổi số bàn → modal lưới như T-NGON app; gửi setTable; KHÔNG reload
      tr.querySelector('[data-act="settable"]').addEventListener('click', ()=>{
        openTablePicker(TABLE_COUNT, async (picked)=>{
          try{
            await db.ref(`devices/${id}/commands/setTable`).set({ value: picked, at: firebase.database.ServerValue.TIMESTAMP });
            await db.ref(`devices/${id}/table`).set(picked);
          }catch(e){ showErr('Gửi lệnh đổi bàn lỗi: '+(e?.message||e)); }
        });
      });

      // Gỡ liên kết (yêu cầu nhập lại đúng mã đang gắn)
      tr.querySelector('[data-act="unbind"]').addEventListener('click', async ()=>{
        if (!code) return;
        const confirmCode = prompt(`Nhập lại mã đang gắn để gỡ liên kết (đang gắn: ${code}):`);
        if (confirmCode===null) return;
        if ((confirmCode||'').trim().toUpperCase() !== String(code).toUpperCase()){
          alert('Sai mã xác nhận. Không gỡ liên kết.');
          return;
        }
        showErr('');
        try{
          const updates = {};
          updates[`codes/${code}/boundDeviceId`] = null;
          updates[`codes/${code}/boundAt`]       = null;
          await db.ref().update(updates);

          await db.ref(`devices/${id}/commands/unbindAt`).set(firebase.database.ServerValue.TIMESTAMP);
          await db.ref(`devices/${id}`).update({ code:null, table:null });
        }catch(e){ showErr('Gỡ liên kết thất bại: '+(e?.message||e)); }
      });

      // Xoá device (chỉ khi không gắn mã)
      tr.querySelector('[data-act="delete"]').addEventListener('click', async ()=>{
        if (code){ return; }
        if (!confirm('Xoá thiết bị này khỏi danh sách?')) return;
        showErr('');
        try{
          await db.ref(`devices/${id}`).remove();
        }catch(e){ showErr('Xoá thiết bị lỗi: '+(e?.message||e)); }
      });

      elDevicesTbody.appendChild(tr);
    });
  }

  // ====== Live subscribe ======
  db.ref('codes').on('value', s=> { try{ renderCodes(s.val()||{}); }catch(e){ showErr('Render codes lỗi: '+(e?.message||e)); } }, e=> showErr('Lỗi tải mã: '+(e?.message||e)));
  db.ref('devices').on('value', s=> { try{ renderDevices(s.val()||{}); }catch(e){ showErr('Render devices lỗi: '+(e?.message||e)); } }, e=> showErr('Lỗi tải thiết bị: '+(e?.message||e)));

})();
</script>
