// assets/js/admin-devices.js
// Quản lý MÃ iPad + danh sách thiết bị (devices)
// YÊU CẦU: admin.html đã load firebase compat SDK và init config, rồi signInAnonymously()
// UI giữ nguyên theo bản v2: các phần tử có id: 
//  - codes-tbody, devices-tbody, btn-broadcast-reload, btn-import-codes, codes-import, devError
//  - codes-queue-wrap, codes-queue, modal-root

(function(){
  'use strict';

  // ====== UI refs ======
  const elCodesTbody    = document.getElementById('codes-tbody');
  const elDevicesTbody  = document.getElementById('devices-tbody');
  const elBtnBroadcast  = document.getElementById('btn-broadcast-reload');
  const elBtnImport     = document.getElementById('btn-import-codes');
  const elCodesImport   = document.getElementById('codes-import');
  const elDevError      = document.getElementById('devError');
  const elQueueWrap     = document.getElementById('codes-queue-wrap');
  const elQueueList     = document.getElementById('codes-queue');
  const elModalRoot     = document.getElementById('modal-root');

  // ====== Utils ======
  const showDevError = (msg)=>{ if(!elDevError) return; elDevError.textContent = msg||''; elDevError.classList.toggle('hidden', !msg); };
  const tsAgo = (ts)=>{ if(!ts) return '-'; const s=Math.floor((Date.now()-ts)/1000);
    if(s<60) return s+'s'; const m=s/60|0; if(m<60) return m+'m'; const h=m/60|0; if(h<24) return h+'h'; return (h/24|0)+'d'; };

  // ====== Firebase guards ======
  if (!window.firebase || !firebase.apps.length){
    console.warn('[admin-devices] Firebase chưa sẵn sàng. Đảm bảo admin.html đã init và signInAnonymously().');
    return;
  }
  const db = firebase.database();

  async function ensureAuth(){
    if (firebase.auth().currentUser) return;
    await firebase.auth().signInAnonymously();
    await new Promise(res=>{ const un=firebase.auth().onAuthStateChanged(u=>{ if(u){un();res();} }); });
  }

  // ====== Popup chọn bàn ======
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
      btn.textContent= String(i);
      btn.addEventListener('click', ()=>{ try{ onPick(String(i)); }finally{ root.removeChild(wrap); } });
      grid.appendChild(btn);
    }
    wrap.querySelector('#tp-close').addEventListener('click', ()=> root.removeChild(wrap));
  }

  // ====== Render Codes ======
  function renderCodes(codes){
    if (!elCodesTbody) return;
    elCodesTbody.innerHTML = '';

    const entries = Object.entries(codes||{}).sort(([a],[b])=> a.localeCompare(b));

    // Hàng đợi (mã bật & chưa gắn)
    if (elQueueWrap && elQueueList){
      const avail = entries.filter(([_,o])=> o && o.enabled!==false && !o.boundDeviceId).map(([k])=>k);
      elQueueList.innerHTML = '';
      avail.forEach(code=>{
        const pill=document.createElement('span');
        pill.className='px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs';
        pill.textContent=code;
        elQueueList.appendChild(pill);
      });
      elQueueWrap.classList.toggle('hidden', avail.length===0);
      const cnt=document.getElementById('codes-queue-count'); if (cnt) cnt.textContent = String(avail.length);
    }

    for (const [code, obj] of entries){
      const tr = document.createElement('tr');
      tr.className = 'border-b last:border-0';

      const enabled = obj?.enabled !== false;
      const boundId = obj?.boundDeviceId || null;

      tr.innerHTML = `
        <td class="px-2 py-1 font-mono text-sm">${code}</td>
        <td class="px-2 py-1">${enabled?'<span class="text-green-700">ON</span>':'<span class="text-gray-400">OFF</span>'}</td>
        <td class="px-2 py-1 text-xs break-all">${boundId? `<span class="text-blue-700">${boundId}</span>`:'-'}</td>
        <td class="px-2 py-1 text-xs">${obj?.boundAt? tsAgo(obj.boundAt): '-'}</td>
        <td class="px-2 py-1">
          <div class="flex flex-wrap gap-2">
            <button class="px-2 py-1 text-xs rounded bg-gray-800 text-white hover:bg-black" data-act="toggle">${enabled?'Tắt':'Bật'}</button>
            <button class="px-2 py-1 text-xs rounded bg-red-600 text-white hover:bg-red-700" data-act="delete">Xóa</button>
          </div>
        </td>
      `;

      // Toggle enable
      tr.querySelector('[data-act="toggle"]').addEventListener('click', async ()=>{
        showDevError('');
        try{
          await ensureAuth();
          // Nếu tắt mã và đang có thiết bị gắn -> gỡ liên kết & đẩy gate
          if (enabled && boundId){
            await db.ref(`devices/${boundId}/commands/unbindAt`).set(firebase.database.ServerValue.TIMESTAMP);
            await db.ref(`devices/${boundId}`).update({ code:null, table:null });
          }
          await db.ref('codes/'+code+'/enabled').set(!enabled);
          if (!enabled===false){ /* noop */ }
          // Nếu bật lại: không tự bind
        }catch(e){ showDevError('Đổi trạng thái mã lỗi: '+(e?.message||e)); }
      });

      // Delete code
      tr.querySelector('[data-act="delete"]').addEventListener('click', async ()=>{
        showDevError('');
        if (!confirm(`Xóa mã ${code}?`)) return;
        try{
          await ensureAuth();
          // Nếu đang gắn trên thiết bị -> gửi unbind trước
          if (boundId){
            await db.ref(`devices/${boundId}/commands/unbindAt`).set(firebase.database.ServerValue.TIMESTAMP);
            await db.ref(`devices/${boundId}`).update({ code:null, table:null });
          }
          await db.ref('codes/'+code).remove();
        }catch(e){ showDevError('Xóa mã lỗi: '+(e?.message||e)); }
      });

      elCodesTbody.appendChild(tr);
    }
  }

  // ====== Render Devices ======
  const TABLE_COUNT = 15;

  function maskDeviceId(id, reveal){ if (!id) return '-'; return reveal? id : (id.slice(0,4)+'••••…'); }

  function renderDevices(devs){
    if (!elDevicesTbody) return;
    elDevicesTbody.innerHTML = '';
    const entries = Object.entries(devs||{}).sort((a,b)=>(b[1]?.lastSeen||0)-(a[1]?.lastSeen||0));

    for (const [id, obj] of entries){
      const code   = obj?.code || '';
      const name   = obj?.name || '';
      const table  = obj?.table || '';
      const stage  = (obj?.stage || 'select').toString();
      const inPOS  = !!obj?.inPOS;
      const last   = obj?.lastSeen || 0;

      const tableDisplay = !table ? '-' : (inPOS ? ('+'+table) : table);

      const tr = document.createElement('tr');
      tr.className = 'border-b last:border-0';
      tr.innerHTML = `
        <td class="px-2 py-1 text-xs break-all">
          <span class="font-mono" data-idmask>${maskDeviceId(id,false)}</span>
          <button class="ml-1 text-xs text-blue-600 underline" data-act="reveal">hiện</button>
        </td>
        <td class="px-2 py-1">
          <input type="text" class="px-2 py-1 border rounded text-sm w-40" value="${name}" placeholder="Tên máy…" data-field="name">
        </td>
        <td class="px-2 py-1 font-mono">${code || '—'}</td>
        <td class="px-2 py-1">${tableDisplay}</td>
        <td class="px-2 py-1 text-xs">${last? tsAgo(last) : '-'}</td>
        <td class="px-2 py-1">
          <div class="flex flex-wrap gap-2">
            <button class="px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700" data-act="reload">Làm mới</button>
            <button class="px-2 py-1 text-xs rounded bg-emerald-600 text-white hover:bg-emerald-700" data-act="settable">Đổi số bàn</button>
            <button class="px-2 py-1 text-xs rounded bg-amber-600 text-white hover:bg-amber-700" data-act="unbind" ${code?'':'disabled'}>Gỡ liên kết</button>
            <button class="px-2 py-1 text-xs rounded bg-gray-500 text-white hover:bg-gray-600" data-act="delete" ${code?'disabled':''}>Xóa thiết bị</button>
          </div>
        </td>
      `;

      // reveal full id
      tr.querySelector('[data-act="reveal"]').addEventListener('click', ()=>{
        const span = tr.querySelector('[data-idmask]');
        const cur = span.textContent.includes('••••');
        span.textContent = maskDeviceId(id, cur); // toggle
      });

      // save name on blur
      tr.querySelector('[data-field="name"]').addEventListener('change', async (e)=>{
        try{
          await ensureAuth();
          await db.ref('devices/'+id+'/name').set((e.target.value||'').trim() || null);
        }catch(err){ showDevError('Lưu tên máy lỗi: '+(err?.message||err)); }
      });

      // reload → commands.reloadAt
      tr.querySelector('[data-act="reload"]').addEventListener('click', async ()=>{
        showDevError('');
        try{
          await ensureAuth();
          await db.ref(`devices/${id}/commands/reloadAt`).set(firebase.database.ServerValue.TIMESTAMP);
        }catch(e){ showDevError('Gửi reload lỗi: '+(e?.message||e)); }
      });

      // set table → picker
      tr.querySelector('[data-act="settable"]').addEventListener('click', ()=>{
        openTablePicker(TABLE_COUNT, async (tableLabel)=>{
          showDevError('');
          try{
            await ensureAuth();
            await db.ref(`devices/${id}/commands/setTable`).set({ value: tableLabel, at: firebase.database.ServerValue.TIMESTAMP });
            await db.ref(`devices/${id}/table`).set(tableLabel); // cập nhật nhanh để nhìn thấy
          }catch(e){ showDevError('Đổi số bàn lỗi: '+(e?.message||e)); }
        });
      });

      // unbind (yêu cầu gõ lại code hiện tại)
      tr.querySelector('[data-act="unbind"]').addEventListener('click', async ()=>{
        showDevError('');
        if (!code) return;
        const verify = prompt(`Nhập lại mã đang gắn để gỡ liên kết (máy: ${maskDeviceId(id,true)}):`);
        if (verify===null) return;
        if (verify.trim().toUpperCase() !== code.toUpperCase()){
          alert('Sai mã. Không gỡ liên kết.');
          return;
        }
        try{
          await ensureAuth();
          // gỡ liên kết mã
          await db.ref('codes/'+code).transaction(v=>{
            if (!v) return v;
            if (v.boundDeviceId === id) return { ...v, boundDeviceId:null, boundAt:null };
            return v;
          });
          // gửi lệnh xuống máy
          await db.ref(`devices/${id}/commands/unbindAt`).set(firebase.database.ServerValue.TIMESTAMP);
          // dọn hiển thị
          await db.ref(`devices/${id}`).update({ code:null, table:null });
        }catch(e){ showDevError('Gỡ liên kết lỗi: '+(e?.message||e)); }
      });

      // xóa thiết bị (chỉ khi không có code)
      tr.querySelector('[data-act="delete"]').addEventListener('click', async ()=>{
        showDevError('');
        if (code){ alert('Thiết bị đang gắn mã, không thể xóa.'); return; }
        if (!confirm(`Xóa thiết bị ${maskDeviceId(id,true)} khỏi danh sách?`)) return;
        try{
          await ensureAuth();
          await db.ref('devices/'+id).remove();
        }catch(e){ showDevError('Xóa thiết bị lỗi: '+(e?.message||e)); }
      });

      elDevicesTbody.appendChild(tr);
    }
  }

  // ====== Import codes ======
  async function importCodesFromTextarea(){
    showDevError('');
    const raw = (elCodesImport?.value||'').trim();
    if (!raw) return alert('Dán danh sách mã (mỗi dòng 1 mã)');
    const lines = raw.split(/\r?\n/).map(s=>s.trim().toUpperCase()).filter(Boolean);
    if (!lines.length) return alert('Không có mã hợp lệ');

    const now = firebase.database.ServerValue.TIMESTAMP;
    const updates = {};
    for (const code of lines){
      updates['codes/'+code] = { enabled:true, createdAt: now, boundDeviceId:null, boundAt:null };
    }
    try{
      await ensureAuth();
      await db.ref().update(updates);
      elCodesImport.value = '';
      alert('Đã thêm '+lines.length+' mã');
    }catch(e){ showDevError('Nhập mã thất bại: '+(e?.message||e)); }
  }

  // ====== Broadcast reload ======
  async function sendBroadcastReload(){
    showDevError('');
    try{
      await ensureAuth();
      await db.ref('broadcast/reloadAt').set(firebase.database.ServerValue.TIMESTAMP);
      alert('Đã gửi reload toàn bộ.');
    }catch(e){ showDevError('Broadcast lỗi: '+(e?.message||e)); }
  }

  // ====== Wire & subscribe ======
  (async function boot(){
    try{
      await ensureAuth();

      // subscribe codes
      db.ref('codes').on('value', snap=>{
        try{ renderCodes(snap.val()||{}); }
        catch(e){ showDevError('Render codes lỗi: '+(e?.message||e)); }
      }, e=> showDevError('Lỗi tải mã: '+(e?.message||e)));

      // subscribe devices
      db.ref('devices').on('value', snap=>{
        try{ renderDevices(snap.val()||{}); }
        catch(e){ showDevError('Render devices lỗi: '+(e?.message||e)); }
      }, e=> showDevError('Lỗi tải thiết bị: '+(e?.message||e)));

      elBtnImport?.addEventListener('click', importCodesFromTextarea);
      elBtnBroadcast?.addEventListener('click', sendBroadcastReload);
    }catch(e){
      showDevError('Lỗi khởi chạy: '+(e?.message||e));
    }
  })();

})();
