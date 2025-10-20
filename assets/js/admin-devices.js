// admin-devices.js
// Tab "Thiết bị": MÃ (2 nút Tắt/Bật & Xóa) + Thiết bị (Tên máy editable, Reload, Đổi bàn, Gỡ liên kết)

(function(){
  const db = window.Admin && Admin.db;
  if (!db) return;

  // ====== refs UI (nếu thiếu thì bỏ qua phần đó) ======
  const elCodesTbody    = document.getElementById('codes-tbody');
  const elDevicesTbody  = document.getElementById('devices-tbody');
  const elBtnBroadcast  = document.getElementById('btn-broadcast-reload');
  const elBtnImport     = document.getElementById('btn-import-codes');
  const elCodesImport   = document.getElementById('codes-import');
  const elDevError      = document.getElementById('devError');
  const elModalRoot     = document.getElementById('modal-root') || document.body;

  const TABLE_COUNT = 15;

  function showDevError(msg){ if(!elDevError) return; elDevError.textContent=msg||''; elDevError.classList.toggle('hidden', !msg); }
  const fmtAgo = (ts)=> Admin.fmt.ago(ts);

  // ===== Broadcast reload toàn bộ =====
  elBtnBroadcast?.addEventListener('click', async ()=>{
    try{
      await db.ref('broadcast/reloadAt').set(firebase.database.ServerValue.TIMESTAMP);
      showDevError('');
      alert('Đã gửi lệnh reload toàn bộ');
    }catch(e){ showDevError('Gửi broadcast thất bại: '+(e?.message||e)); }
  });

  // ===== Import mã (mỗi dòng 1 mã) =====
  elBtnImport?.addEventListener('click', async ()=>{
    try{
      const raw  = (elCodesImport?.value||'').trim();
      if (!raw) return alert('Dán danh sách mã (mỗi dòng 1 mã)');
      const lines = raw.split(/\r?\n/).map(s=>s.trim().toUpperCase()).filter(Boolean);
      if (!lines.length) return alert('Không có mã hợp lệ');

      const now = firebase.database.ServerValue.TIMESTAMP;
      const updates = {};
      for (const code of lines){
        updates['codes/'+code] = {
          enabled: true, boundDeviceId: null, createdAt: now, boundAt: null
        };
      }
      await db.ref().update(updates);
      elCodesImport.value = '';
      alert('Đã thêm ' + lines.length + ' mã');
    }catch(e){ alert('Thêm mã lỗi: '+(e?.message||e)); }
  });

  // ====== CODES ======
  function renderCodes(map){
    if (!elCodesTbody) return;
    elCodesTbody.innerHTML = '';
    const entries = Object.entries(map||{}).sort(([a],[b])=> a.localeCompare(b));

    for (const [code, obj] of entries){
      const tr = document.createElement('tr');
      tr.className = 'border-b last:border-0';
      const enabled = obj?.enabled !== false;
      const bound   = obj?.boundDeviceId || null;

      tr.innerHTML = `
        <td class="px-2 py-1 font-mono text-sm">${code}</td>
        <td class="px-2 py-1">
          <span class="inline-flex items-center gap-1 text-xs ${enabled?'text-emerald-700':'text-gray-500'}">
            <span class="w-2 h-2 rounded-full ${enabled?'bg-emerald-500':'bg-gray-400'}"></span>
            ${enabled?'Đang bật':'Đang tắt'}
          </span>
        </td>
        <td class="px-2 py-1 text-xs break-all">${bound? bound : '—'}</td>
        <td class="px-2 py-1 text-xs">${obj?.boundAt? Admin.fmt.ts(obj.boundAt) : '—'}</td>
        <td class="px-2 py-1">
          <div class="flex flex-wrap gap-2">
            <button class="px-2 py-1 text-xs rounded bg-gray-800 text-white hover:bg-black" data-act="toggle">${enabled?'Tắt':'Bật'}</button>
            <button class="px-2 py-1 text-xs rounded bg-red-600 text-white hover:bg-red-700" data-act="delete">Xoá</button>
          </div>
        </td>
      `;

      // Toggle enabled
      tr.querySelector('[data-act="toggle"]').addEventListener('click', async ()=>{
        try{
          // đổi trạng thái
          await db.ref('codes/'+code+'/enabled').set(!enabled);
          // nếu đang tắt → đẩy thiết bị (nếu có) về gate
          if (enabled && bound){
            await db.ref(`devices/${bound}/commands/unbindAt`).set(firebase.database.ServerValue.TIMESTAMP);
          }
        }catch(e){ showDevError('Đổi trạng thái thất bại: '+(e?.message||e)); }
      });

      // Delete code
      tr.querySelector('[data-act="delete"]').addEventListener('click', async ()=>{
        if (!confirm('Xoá mã '+code+'?')) return;
        try{
          // đẩy máy (nếu có)
          if (bound){
            await db.ref(`devices/${bound}/commands/unbindAt`).set(firebase.database.ServerValue.TIMESTAMP);
          }
          await db.ref('codes/'+code).remove();
        }catch(e){ showDevError('Xoá mã thất bại: '+(e?.message||e)); }
      });

      elCodesTbody.appendChild(tr);
    }
  }

  db.ref('codes').on('value', s=>{
    try{ renderCodes(s.val()||{}); }catch(e){ showDevError('Render codes lỗi: '+(e?.message||e)); }
  }, e=> showDevError('Lỗi tải mã: '+(e?.message||e)));

  // ====== DEVICES ======
  function openTablePicker(count, onPick){
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
    elModalRoot.appendChild(wrap);
    const grid = wrap.querySelector('#tp-grid');
    for (let i=1;i<=count;i++){
      const btn = document.createElement('button');
      btn.className = 'px-3 py-3 rounded-lg border text-sm hover:bg-blue-50';
      btn.textContent = String(i);
      btn.addEventListener('click', ()=>{ try{ onPick(String(i)); }finally{ elModalRoot.removeChild(wrap); } });
      grid.appendChild(btn);
    }
    wrap.querySelector('#tp-close').addEventListener('click', ()=> elModalRoot.removeChild(wrap));
  }

  function renderDevices(map){
    if (!elDevicesTbody) return;
    elDevicesTbody.innerHTML = '';
    const entries = Object.entries(map||{}).sort((a,b)=>(b[1].lastSeen||0)-(a[1].lastSeen||0));

    for (const [id, obj] of entries){
      const name  = obj?.name || '';
      const code  = obj?.code || '';
      const table = obj?.table || '';
      const stage = obj?.stage || 'select';
      const inPOS = !!obj?.inPOS;

      const tr = document.createElement('tr');
      tr.className = 'border-b last:border-0';
      tr.innerHTML = `
        <td class="px-2 py-1 font-mono text-xs break-all">${id}</td>
        <td class="px-2 py-1">
          <input type="text" value="${name.replace(/"/g,'&quot;')}" class="px-2 py-1 text-xs border rounded w-36" data-role="dev-name" />
        </td>
        <td class="px-2 py-1 font-mono">${code || '—'}</td>
        <td class="px-2 py-1">${inPOS ? ('+'+(table||'?')) : (table || (stage==='select'? '—' : ''))}</td>
        <td class="px-2 py-1 text-xs">${stage}</td>
        <td class="px-2 py-1 text-xs">${obj?.lastSeen? fmtAgo(obj.lastSeen):'-'}</td>
        <td class="px-2 py-1">
          <div class="flex flex-wrap gap-2">
            <button class="px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700"   data-act="reload">Làm mới</button>
            <button class="px-2 py-1 text-xs rounded bg-emerald-600 text-white hover:bg-emerald-700" data-act="settable">Đổi số bàn</button>
            <button class="px-2 py-1 text-xs rounded bg-amber-600 text-white hover:bg-amber-700"   data-act="unbind" ${code?'':'disabled'}>Gỡ liên kết</button>
          </div>
        </td>
      `;

      // Sửa tên máy
      tr.querySelector('[data-role="dev-name"]').addEventListener('change', async (e)=>{
        try{
          await db.ref('devices/'+id+'/name').set(String(e.target.value||''));
        }catch(_){}
      });

      // Làm mới → client reload & quay về Start Order (client tự xử lý)
      tr.querySelector('[data-act="reload"]').addEventListener('click', async ()=>{
        try{ await db.ref('devices/'+id+'/commands/reloadAt').set(firebase.database.ServerValue.TIMESTAMP); }
        catch(e){ showDevError('Gửi reload thất bại: '+(e?.message||e)); }
      });

      // Đổi số bàn → picker
      tr.querySelector('[data-act="settable"]').addEventListener('click', ()=>{
        openTablePicker(TABLE_COUNT, async (tableLabel)=>{
          try{
            await db.ref('devices/'+id+'/commands/setTable').set({ value: tableLabel, at: firebase.database.ServerValue.TIMESTAMP });
            await db.ref('devices/'+id+'/table').set(tableLabel); // cập nhật UI nhanh
          }catch(e){ showDevError('Đổi số bàn lỗi: '+(e?.message||e)); }
        });
      });

      // Gỡ liên kết (thu hồi code)
      tr.querySelector('[data-act="unbind"]').addEventListener('click', async ()=>{
        if (!code) return alert('Thiết bị chưa gắn mã.');
        if (!confirm(`Thu hồi mã ${code} và đẩy thiết bị về màn nhập mã?`)) return;
        try{
          // gỡ mã nếu đang gắn đúng máy
          await db.ref('codes/'+code).transaction(v=>{
            if (!v) return v;
            if (v.boundDeviceId === id) return { ...v, boundDeviceId: null, boundAt: null };
            return v;
          });
          // đẩy lệnh unbind + dọn hiển thị
          await db.ref('devices/'+id+'/commands/unbindAt').set(firebase.database.ServerValue.TIMESTAMP);
          await db.ref('devices/'+id).update({ code:null, table:null });
        }catch(e){ showDevError('Gỡ liên kết thất bại: '+(e?.message||e)); }
      });

      elDevicesTbody.appendChild(tr);
    }
  }

  db.ref('devices').on('value', s=>{
    try{ renderDevices(s.val()||{}); }catch(e){ showDevError('Render devices lỗi: '+(e?.message||e)); }
  }, e=> showDevError('Lỗi tải thiết bị: '+(e?.message||e)));
})();
