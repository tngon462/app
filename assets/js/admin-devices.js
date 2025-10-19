// assets/js/admin-devices.js
// v2.2 — GIỮ UI như bản bạn gửi, sửa logic đồng bộ với device-bind v14

(function(){
  const elCodesTbody   = document.getElementById('codes-tbody');
  const elDevicesTbody = document.getElementById('devices-tbody');
  const elBtnBroadcast = document.getElementById('btn-broadcast-reload');
  const elBtnImport    = document.getElementById('btn-import-codes');
  const elCodesImport  = document.getElementById('codes-import');
  const elDevError     = document.getElementById('devError');

  const elQueueWrap = document.getElementById('codes-queue-wrap');
  const elQueueList = document.getElementById('codes-queue');
  const elModalRoot = document.getElementById('modal-root');

  if (!window.firebase || !firebase.apps.length) {
    console.warn('[admin-devices] Firebase chưa sẵn sàng.');
    return;
  }
  const db = firebase.database();
  const TABLE_COUNT = 15;
  const ts = ()=> Date.now();
  const tsAgo = (x)=>{ if(!x) return '-'; const s=Math.floor((Date.now()-x)/1000);
    if(s<60) return s+'s'; const m=Math.floor(s/60); if(m<60) return m+'m'; const h=Math.floor(m/60);
    if(h<24) return h+'h'; return Math.floor(h/24)+'d'; };
  const showDevError = (m)=>{ if(!elDevError) return; elDevError.textContent=m||''; elDevError.classList.toggle('hidden', !m); };

  // Broadcast reload toàn bộ
  elBtnBroadcast?.addEventListener('click', async ()=>{
    try{
      await db.ref('broadcast').update({ reloadAt: firebase.database.ServerValue.TIMESTAMP });
      alert('Đã gửi lệnh reload toàn bộ');
    }catch(e){ showDevError('Gửi broadcast thất bại: '+(e?.message||e)); }
  });

  // Import mã (mỗi dòng 1 mã)
  elBtnImport?.addEventListener('click', async ()=>{
    const raw=(elCodesImport?.value||'').trim();
    if(!raw) return alert('Dán danh sách mã (mỗi dòng 1 mã)');
    const lines=raw.split(/\r?\n/).map(s=>s.trim().toUpperCase()).filter(Boolean);
    if(!lines.length) return alert('Không có mã hợp lệ');
    const now=firebase.database.ServerValue.TIMESTAMP;
    const updates={};
    lines.forEach(code=>{
      updates['codes/'+code+'/enabled'] = true;
      updates['codes/'+code+'/createdAt'] = now;
      // giữ nguyên bound nếu có
    });
    try{
      await db.ref().update(updates);
      elCodesImport.value='';
      alert('Đã thêm '+lines.length+' mã');
    }catch(e){ alert('Thêm mã lỗi: '+(e?.message||e)); }
  });

  // ===== Codes table =====
  function renderCodes(data){
    if(!elCodesTbody) return;
    elCodesTbody.innerHTML='';
    const entries = Object.entries(data||{}).sort((a,b)=> a[0].localeCompare(b[0]));

    // Hàng đợi (available)
    if (elQueueWrap && elQueueList){
      const avail = entries.filter(([_,o])=> o && o.enabled===true && !o.boundDeviceId).map(([k,_])=>k);
      elQueueList.innerHTML = '';
      avail.forEach(code=>{
        const pill=document.createElement('span');
        pill.className='px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs';
        pill.textContent=code;
        elQueueList.appendChild(pill);
      });
      elQueueWrap.classList.toggle('hidden', avail.length===0);
      const countEl = document.getElementById('codes-queue-count');
      if (countEl) countEl.textContent = avail.length;
    }

    entries.forEach(([code, obj])=>{
      const tr = document.createElement('tr');
      tr.className = 'border-b';
      const enabled = obj?.enabled !== false;
      const boundId = obj?.boundDeviceId || null;
      tr.innerHTML = `
        <td class="px-2 py-1 font-mono text-sm">${code}</td>
        <td class="px-2 py-1">${enabled? '<span class="text-green-700">ON</span>':'<span class="text-gray-400">OFF</span>'}</td>
        <td class="px-2 py-1 text-xs break-all">${boundId||'-'}</td>
        <td class="px-2 py-1 text-xs">${obj?.boundAt? tsAgo(obj.boundAt):'-'}</td>
        <td class="px-2 py-1">
          <div class="flex items-center gap-2">
            <button class="px-2 py-1 text-xs rounded bg-gray-800 text-white hover:bg-black" data-act="toggle">${enabled?'Tắt':'Bật'}</button>
            <button class="px-2 py-1 text-xs rounded bg-red-600 text-white hover:bg-red-700" data-act="delete">Xóa mã</button>
          </div>
        </td>
      `;

      // Toggle enable
      tr.querySelector('[data-act="toggle"]').addEventListener('click', async ()=>{
        try{
          await db.ref('codes/'+code+'/enabled').set(!enabled);
          // Nếu tắt mã và đang gắn vào 1 device -> đẩy thiết bị đó ra
          if (enabled === true && boundId){
            await db.ref('devices/'+boundId+'/commands/unbindAt').set(firebase.database.ServerValue.TIMESTAMP);
          }
        }catch(e){ showDevError('Đổi trạng thái thất bại: '+(e?.message||e)); }
      });

      // Delete code
      tr.querySelector('[data-act="delete"]').addEventListener('click', async ()=>{
        if(!confirm('Xóa mã '+code+'?')) return;
        try{
          // nếu đang gắn -> đẩy ra trước
          if (boundId){
            await db.ref('devices/'+boundId+'/commands/unbindAt').set(firebase.database.ServerValue.TIMESTAMP);
          }
          await db.ref('codes/'+code).remove();
        }catch(e){ showDevError('Xóa mã thất bại: '+(e?.message||e)); }
      });

      elCodesTbody.appendChild(tr);
    });
  }
  db.ref('codes').on('value', s=> renderCodes(s.val()||{}), e=> showDevError('Lỗi tải mã: '+(e?.message||e)));

  // ===== Devices table =====
  function inlineEditableName(td, id, current){
    td.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'flex items-center gap-2';
    const input = document.createElement('input');
    input.className = 'border rounded px-2 py-1 text-xs w-40';
    input.placeholder = 'Tên máy';
    input.value = current || '';
    const btn = document.createElement('button');
    btn.textContent = 'Lưu';
    btn.className = 'px-2 py-1 text-xs rounded bg-gray-800 text-white hover:bg-black';
    btn.addEventListener('click', async ()=>{
      try{ await db.ref('devices/'+id+'/name').set(input.value.trim()||null); }
      catch(e){ alert('Lưu tên lỗi: '+(e?.message||e)); }
    });
    wrap.appendChild(input); wrap.appendChild(btn); td.appendChild(wrap);
  }

  function renderDevices(data){
    if (!elDevicesTbody) return;
    elDevicesTbody.innerHTML='';
    const entries = Object.entries(data||{}).sort((a,b)=>(b[1].lastSeen||0)-(a[1].lastSeen||0));

    entries.forEach(([id, obj])=>{
      const tr = document.createElement('tr');
      tr.className = 'border-b';
      tr.innerHTML = `
        <td class="px-2 py-1 text-xs break-all">${id}</td>
        <td class="px-2 py-1" data-name></td>
        <td class="px-2 py-1 font-mono">${obj?.code || '-'}</td>
        <td class="px-2 py-1">${obj?.table || '-'}</td>
        <td class="px-2 py-1 text-xs">${obj?.lastSeen? tsAgo(obj.lastSeen):'-'}</td>
        <td class="px-2 py-1">
          <div class="flex items-center gap-2">
            <button class="px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700" data-act="reload">Làm mới</button>
            <button class="px-2 py-1 text-xs rounded bg-emerald-600 text-white hover:bg-emerald-700" data-act="settable">Đổi số bàn</button>
            <button class="px-2 py-1 text-xs rounded bg-amber-600 text-white hover:bg-amber-700" data-act="kick" ${obj?.code?'':'disabled'}>Gỡ liên kết</button>
          </div>
        </td>
      `;
      inlineEditableName(tr.querySelector('[data-name]'), id, obj?.name || '');

      // Làm mới (reload) → client quay lại Start của bàn hiện tại
      tr.querySelector('[data-act="reload"]').addEventListener('click', async ()=>{
        try{
          await db.ref('devices/'+id+'/commands/reloadAt').set(firebase.database.ServerValue.TIMESTAMP);
        }catch(e){ showDevError('Gửi reload thất bại: '+(e?.message||e)); }
      });

      // Đổi số bàn → KHÔNG reload, client tự về Start (đúng bàn)
      tr.querySelector('[data-act="settable"]').addEventListener('click', ()=>{
        openTablePicker(TABLE_COUNT, async (t)=>{
          try{
            await db.ref('devices/'+id+'/commands/setTable')
              .set({ value: t, at: firebase.database.ServerValue.TIMESTAMP });
            await db.ref('devices/'+id).update({ table: t }); // để UI phản ánh ngay
          }catch(e){ showDevError('Đổi số bàn lỗi: '+(e?.message||e)); }
        });
      });

      // Gỡ liên kết (thu hồi mã hiện gắn vào thiết bị này)
      tr.querySelector('[data-act="kick"]').addEventListener('click', async ()=>{
        const code = obj?.code;
        if (!code) return alert('Thiết bị chưa gắn mã.');
        if (!confirm(`Gỡ liên kết và thu hồi mã ${code}?`)) return;
        try{
          // chỉ gỡ nếu mã đang bound đúng thiết bị
          await db.ref('codes/'+code).transaction(v=>{
            if (!v) return v;
            if (v.boundDeviceId === id){
              return { ...v, boundDeviceId: null, boundAt: null };
            }
            return v;
          });
          await db.ref('devices/'+id+'/commands/unbindAt').set(firebase.database.ServerValue.TIMESTAMP);
          await db.ref('devices/'+id).update({ table: null }); // dọn hiển thị
        }catch(e){ showDevError('Gỡ liên kết thất bại: '+(e?.message||e)); }
      });

      elDevicesTbody.appendChild(tr);
    });
  }
  db.ref('devices').on('value', s=> renderDevices(s.val()||{}), e=> showDevError('Lỗi tải thiết bị: '+(e?.message||e)));

  // Modal chọn bàn
  function openTablePicker(count, onPick){
    const root = elModalRoot || document.body;
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
})();
