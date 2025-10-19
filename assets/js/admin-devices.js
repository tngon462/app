// assets/js/admin-devices.js v2
// - Hàng đợi mã
// - Popup chọn bàn để Set Table

(function(){
  const elCodesTbody   = document.getElementById('codes-tbody');
  const elDevicesTbody = document.getElementById('devices-tbody');
  const elBtnBroadcast = document.getElementById('btn-broadcast-reload');
  const elBtnImport    = document.getElementById('btn-import-codes');
  const elCodesImport  = document.getElementById('codes-import');
  const elDevError     = document.getElementById('devError');

  // Queue UI containers (add in admin.html)
  const elQueueWrap    = document.getElementById('codes-queue-wrap');
  const elQueueList    = document.getElementById('codes-queue');

  // Modal root (add in admin.html)
  const elModalRoot    = document.getElementById('modal-root');

  if (!window.firebase || !firebase.apps.length) {
    console.warn('[admin-devices] Firebase chưa sẵn sàng.');
    return;
  }
  const db = firebase.database();
  const TABLE_COUNT = 15; // khớp với tab màn hình

  const tsAgo = (ts)=>{ if(!ts) return '-'; const s=Math.floor((Date.now()-ts)/1000);
    if(s<60) return s+'s'; const m=Math.floor(s/60); if(m<60) return m+'m'; const h=Math.floor(m/60);
    if(h<24) return h+'h'; return Math.floor(h/24)+'d'; };
  const showDevError = (msg)=>{ if(!elDevError) return; elDevError.textContent=msg||''; elDevError.classList.toggle('hidden', !msg); };

  // ===== Broadcast reload toàn bộ
  if(elBtnBroadcast){
    elBtnBroadcast.addEventListener('click', async ()=>{
      try {
        await db.ref('broadcast').update({ reloadAt: firebase.database.ServerValue.TIMESTAMP });
        showDevError('');
        alert('Đã gửi lệnh reload toàn bộ');
      } catch(e){ showDevError('Gửi broadcast thất bại: '+(e?.message||e)); }
    });
  }

  // ===== Import codes
  if (elBtnImport && elCodesImport){
    elBtnImport.addEventListener('click', async ()=>{
      const raw=(elCodesImport.value||'').trim();
      if(!raw) return alert('Dán danh sách mã (mỗi dòng 1 mã)');
      const lines=raw.split(/\r?\n/).map(s=>s.trim().toUpperCase()).filter(Boolean);
      if(!lines.length) return alert('Không có mã hợp lệ');

      const updates={}; const now=firebase.database.ServerValue.TIMESTAMP;
      for(const code of lines){
        updates['codes/'+code] = { enabled:true, boundDeviceId:null, createdAt: now, boundAt:null };
      }
      try{
        await db.ref().update(updates);
        elCodesImport.value='';
        alert('Đã thêm '+lines.length+' mã');
      }catch(e){ alert('Thêm mã lỗi: '+(e?.message||e)); }
    });
  }

  // ===== Render bảng Codes (live)
  function renderCodes(data){
    if (!elCodesTbody) return;
    elCodesTbody.innerHTML='';
    const entries=Object.entries(data).sort((a,b)=>a[0].localeCompare(b[0]));
    for(const [code,obj] of entries){
      const tr=document.createElement('tr'); tr.className='border-b';
      tr.innerHTML=`
        <td class="px-2 py-1 font-mono text-sm">${code}</td>
        <td class="px-2 py-1">${obj.enabled?'<span class="text-green-700">ON</span>':'<span class="text-gray-400">OFF</span>'}</td>
        <td class="px-2 py-1">${obj.boundDeviceId?`<span class="text-blue-700">${obj.boundDeviceId}</span>`:'-'}</td>
        <td class="px-2 py-1">${obj.boundAt?tsAgo(obj.boundAt):'-'}</td>
        <td class="px-2 py-1">
          <div class="flex items-center gap-2">
            <button class="px-3 py-1.5 text-xs rounded-md bg-blue-600 text-white hover:bg-blue-700" data-act="toggle">${obj.enabled?'Tắt':'Bật'}</button>
            <button class="px-3 py-1.5 text-xs rounded-md bg-blue-600 text-white hover:bg-blue-700" data-act="unbind" ${obj.boundDeviceId?'':'disabled'}>Gỡ liên kết</button>
            <button class="px-3 py-1.5 text-xs rounded-md bg-blue-600 text-white hover:bg-blue-700" data-act="delete">Xóa mã</button>
          </div>
        </td>`;
      tr.querySelector('[data-act="toggle"]').addEventListener('click', ()=> db.ref('codes/'+code).update({ enabled: !obj.enabled }));
      tr.querySelector('[data-act="unbind"]').addEventListener('click', async ()=>{
        try{
          await db.ref('codes/'+code).transaction(v=> v?{...v, boundDeviceId:null, boundAt:null}:v);
          alert('Đã gỡ liên kết mã '+code);
        }catch(e){ alert('Gỡ liên kết lỗi: '+(e?.message||e)); }
      });
      tr.querySelector('[data-act="delete"]').addEventListener('click', async ()=>{
        if(confirm('Xóa mã '+code+'?')) await db.ref('codes/'+code).remove();
      });
      elCodesTbody.appendChild(tr);
    }

    // ===== HÀNG ĐỢI MÃ (available) =====
    if (elQueueWrap && elQueueList){
      const avail = entries
        .filter(([_,o])=> o && o.enabled===true && !o.boundDeviceId)
        .map(([k,_])=>k);
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
  }
  db.ref('codes').on('value', snap=> renderCodes(snap.val()||{}), err=> showDevError('Lỗi tải mã: '+(err?.message||err)));

  // ===== Render bảng Devices (live) + actions
  function renderDevices(data){
    if (!elDevicesTbody) return;
    elDevicesTbody.innerHTML='';
    const entries=Object.entries(data).sort((a,b)=>(b[1].lastSeen||0)-(a[1].lastSeen||0));

    for(const [id,obj] of entries){
      const tr=document.createElement('tr'); tr.className='border-b';
      tr.innerHTML=`
        <td class="px-2 py-1 font-mono text-xs">${id}</td>
        <td class="px-2 py-1">${obj.code||'-'}</td>
        <td class="px-2 py-1">${obj.table||'-'}</td>
        <td class="px-2 py-1">${obj.lastSeen?tsAgo(obj.lastSeen):'-'}</td>
        <td class="px-2 py-1">
          <div class="flex items-center gap-2">
            <button class="px-3 py-1.5 text-xs rounded-md bg-blue-600 text-white hover:bg-blue-700" data-act="reload">Làm mới</button>
            <button class="px-3 py-1.5 text-xs rounded-md bg-blue-600 text-white hover:bg-blue-700" data-act="settable">Đổi số bàn</button>
            <button class="px-3 py-1.5 text-xs rounded-md bg-blue-600 text-white hover:bg-blue-700" data-act="kick" ${obj.code?'':'disabled'}>Đẩy ra</button>
          </div>
        </td>`;
      // Reload
      tr.querySelector('[data-act="reload"]').addEventListener('click', ()=>{
        db.ref('devices/'+id+'/commands').update({ reloadAt: firebase.database.ServerValue.TIMESTAMP });
      });
      // Đổi số bàn -> modal chọn bàn
      tr.querySelector('[data-act="settable"]').addEventListener('click', ()=>{
        openTablePicker(TABLE_COUNT, async (tableLabel)=>{
          try{
            await db.ref('devices/'+id+'/commands/setTable').set({ value: tableLabel, at: firebase.database.ServerValue.TIMESTAMP });
            await db.ref('devices/'+id).update({ table: tableLabel });
          }catch(e){ alert('Đổi số bàn lỗi: '+(e?.message||e)); }
        });
      });
      // Đẩy ra
      tr.querySelector('[data-act="kick"]').addEventListener('click', async ()=>{
        const code=obj.code;
        if(!code) return alert('Thiết bị chưa gắn mã.');
        if(!confirm(`Đẩy thiết bị này ra và thu hồi mã ${code}?`)) return;
        try{
          await db.ref('codes/'+code).transaction(v=>{
            if(!v) return v;
            if(v.boundDeviceId===id) return {...v, boundDeviceId:null, boundAt:null};
            return v;
          });
          await db.ref('devices/'+id+'/commands').update({ unbindAt: firebase.database.ServerValue.TIMESTAMP });
          await db.ref('devices/'+id).update({ code:null, table:null });
          // Sau khi gỡ -> mã trở thành available => tự xuất hiện ở “Hàng đợi”
        }catch(e){ alert('Đẩy ra thất bại: '+(e?.message||e)); }
      });

      elDevicesTbody.appendChild(tr);
    }
  }
  db.ref('devices').on('value', snap=> renderDevices(snap.val()||{}), err=> showDevError('Lỗi tải thiết bị: '+(err?.message||err)));

  // ===== Modal chọn bàn =====
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
      btn.addEventListener('click', ()=>{ try{ onPick(''+i); }finally{ root.removeChild(wrap); } });
      grid.appendChild(btn);
    }
    wrap.querySelector('#tp-close').addEventListener('click', ()=> root.removeChild(wrap));
  }
})();
