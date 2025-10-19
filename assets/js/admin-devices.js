// ===============================================
// admin-devices.js v2
// - Tab "Thiết bị iPad": quản lý MÃ & Thiết bị
// - Reload toàn bộ / từng máy; Đổi số bàn; Thu hồi mã
// ===============================================
(function(){
  // UI refs (theo admin.html bạn đã gửi)
  const devError  = document.getElementById('devError');
  const codesBody = document.getElementById('codes-tbody');
  const devicesBody = document.getElementById('devices-tbody');
  const txtImport = document.getElementById('codes-import');
  const btnImport = document.getElementById('btn-import-codes');
  const btnBroadcastReload = document.getElementById('btn-broadcast-reload');

  function showDevError(msg){ devError.textContent = msg||''; devError.classList.toggle('hidden', !msg); }
  function formatTime(ts){
    if (!ts) return '—';
    try { const d = new Date(ts); return d.toLocaleString(); } catch(_) { return String(ts); }
  }

  // Firebase
  let db;
  async function initFirebase(){
    if (!firebase.apps.length) {
      if (typeof window.firebaseConfig === 'undefined' && typeof firebaseConfig !== 'undefined') {
        window.firebaseConfig = firebaseConfig;
      }
      firebase.initializeApp(window.firebaseConfig);
    }
    await firebase.auth().signInAnonymously();
    db = firebase.database();
  }

  // ---- CODES ----
  function renderCodes(codes){
    codesBody.innerHTML = '';
    const entries = Object.entries(codes||{}).sort(([a],[b])=> a.localeCompare(b));
    for (const [code, data] of entries){
      const tr = document.createElement('tr');
      tr.className = 'border-b last:border-0';

      const enabled = (data && data.enabled !== false);
      const boundId = data?.boundDeviceId || null;

      tr.innerHTML = `
        <td class="px-2 py-1 font-mono">${code}</td>
        <td class="px-2 py-1">
          <span class="inline-flex items-center gap-1 text-xs ${enabled?'text-emerald-700':'text-red-600'}">
            <span class="w-2 h-2 rounded-full ${enabled?'bg-emerald-500':'bg-red-500'}"></span>
            ${enabled?'Đang bật':'Đang tắt'}
          </span>
        </td>
        <td class="px-2 py-1 text-xs break-all">${boundId ? boundId : '—'}</td>
        <td class="px-2 py-1 text-xs">${data?.boundAt? formatTime(data.boundAt) : '—'}</td>
        <td class="px-2 py-1">
          <div class="flex flex-wrap gap-2">
            <button class="px-2 py-1 text-xs rounded bg-gray-800 text-white hover:bg-black" data-act="toggle">${enabled?'Tắt':'Bật'}</button>
            <button class="px-2 py-1 text-xs rounded bg-amber-600 text-white hover:bg-amber-700" data-act="revoke">Thu hồi</button>
            <button class="px-2 py-1 text-xs rounded bg-red-600 text-white hover:bg-red-700" data-act="delete">Xoá</button>
          </div>
        </td>
      `;

      tr.querySelector('[data-act="toggle"]').addEventListener('click', async ()=>{
        try{
          await db.ref('codes/'+code+'/enabled').set(!enabled);
        }catch(e){ showDevError('Đổi trạng thái thất bại: '+(e?.message||e)); }
      });

      tr.querySelector('[data-act="revoke"]').addEventListener('click', async ()=>{
        try{
          const updates = {};
          updates['codes/'+code+'/boundDeviceId'] = null;
          updates['codes/'+code+'/boundAt'] = null;
          await db.ref().update(updates);

          if (boundId){
            await db.ref(`devices/${boundId}/commands/unbindAt`).set(firebase.database.ServerValue.TIMESTAMP);
          }
        }catch(e){ showDevError('Thu hồi mã thất bại: '+(e?.message||e)); }
      });

      tr.querySelector('[data-act="delete"]').addEventListener('click', async ()=>{
        try{
          await db.ref('codes/'+code).remove();
        }catch(e){ showDevError('Xoá mã thất bại: '+(e?.message||e)); }
      });

      codesBody.appendChild(tr);
    }
  }

  async function importCodesFromTextarea(){
    showDevError('');
    const raw = (txtImport.value||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
    if (raw.length===0){ showDevError('Chưa có mã nào trong ô nhập.'); return; }
    const updates = {};
    for (const code of raw){
      updates['codes/'+code+'/enabled'] = true;
      updates['codes/'+code+'/createdAt'] = firebase.database.ServerValue.TIMESTAMP;
      // giữ nguyên bound nếu đã có
    }
    try{
      await db.ref().update(updates);
      txtImport.value = '';
    }catch(e){ showDevError('Nhập mã thất bại: '+(e?.message||e)); }
  }

  // ---- DEVICES ----
  function renderDevices(devices){
    devicesBody.innerHTML = '';
    const entries = Object.entries(devices||{}).sort(([a],[b])=> a.localeCompare(b));
    for (const [id, data] of entries){
      const code  = data?.code || '';
      const table = data?.table || '';
      const last  = data?.lastSeen || 0;

      const tr = document.createElement('tr');
      tr.className = 'border-b last:border-0';
      tr.innerHTML = `
        <td class="px-2 py-1 text-xs break-all">${id}</td>
        <td class="px-2 py-1 font-mono">${code || '—'}</td>
        <td class="px-2 py-1">${table || '—'}</td>
        <td class="px-2 py-1 text-xs">${last? formatTime(last) : '—'}</td>
        <td class="px-2 py-1">
          <div class="flex flex-wrap gap-2">
            <button class="px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700" data-act="reload">Làm mới</button>
            <button class="px-2 py-1 text-xs rounded bg-emerald-600 text-white hover:bg-emerald-700" data-act="settable">Đổi số bàn</button>
            <button class="px-2 py-1 text-xs rounded bg-amber-600 text-white hover:bg-amber-700" data-act="unbind">Gỡ liên kết</button>
          </div>
        </td>
      `;

      // Làm mới (reload): chỉ gửi reloadAt → client tự vào Start Order nếu đã có tableNumber
      tr.querySelector('[data-act="reload"]').addEventListener('click', async ()=>{
        try{
          await db.ref(`devices/${id}/commands/reloadAt`).set(firebase.database.ServerValue.TIMESTAMP);
        }catch(e){ showDevError('Gửi lệnh reload thất bại: '+(e?.message||e)); }
      });

      // Đổi số bàn: prompt nhanh (có thể thay bằng modal danh sách sau)
      tr.querySelector('[data-act="settable"]').addEventListener('click', async ()=>{
        try{
          let t = prompt('Nhập số bàn mới (ví dụ: 5 hoặc T05):', table || '');
          if (t===null) return;
          t = String(t).trim();
          if (!t) return;

          await db.ref(`devices/${id}/commands/setTable`).set({
            value: t, at: firebase.database.ServerValue.TIMESTAMP
          });

          // (tuỳ chọn) cập nhật cột table cho nhanh cảm giác
          await db.ref(`devices/${id}/table`).set(t);
        }catch(e){ showDevError('Đổi số bàn thất bại: '+(e?.message||e)); }
      });

      // Gỡ liên kết: xoá bound ở codes + đẩy unbindAt cho thiết bị
      tr.querySelector('[data-act="unbind"]').addEventListener('click', async ()=>{
        try{
          if (code) {
            const updates = {};
            updates[`codes/${code}/boundDeviceId`] = null;
            updates[`codes/${code}/boundAt`]       = null;
            await db.ref().update(updates);
          }
          await db.ref(`devices/${id}/commands/unbindAt`).set(firebase.database.ServerValue.TIMESTAMP);
        }catch(e){ showDevError('Gỡ liên kết thất bại: '+(e?.message||e)); }
      });

      devicesBody.appendChild(tr);
    }
  }

  // ---- Broadcast reload ----
  async function sendBroadcastReload(){
    showDevError('');
    try{
      await db.ref('broadcast/reloadAt').set(firebase.database.ServerValue.TIMESTAMP);
    }catch(e){ showDevError('Reload toàn bộ thất bại: '+(e?.message||e)); }
  }

  // ---- Wire events & live subscribe ----
  (async function boot(){
    try{
      await initFirebase();

      // Subscribe codes
      db.ref('codes').on('value', s=>{
        try{ renderCodes(s.val()); }catch(e){ showDevError('Render codes lỗi: '+(e?.message||e)); }
      }, e=> showDevError('Lỗi tải mã: '+(e?.message||e)));

      // Subscribe devices
      db.ref('devices').on('value', s=>{
        try{ renderDevices(s.val()); }catch(e){ showDevError('Render devices lỗi: '+(e?.message||e)); }
      }, e=> showDevError('Lỗi tải thiết bị: '+(e?.message||e)));

      // Handlers
      btnImport?.addEventListener('click', importCodesFromTextarea);
      btnBroadcastReload?.addEventListener('click', sendBroadcastReload);
    }catch(e){
      showDevError('Lỗi khởi chạy: '+(e?.message||e));
    }
  })();
})();
