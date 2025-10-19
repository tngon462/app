// ===============================================
// admin-devices.js v3.1
// - Event delegation cho nút trong bảng -> không lỗi sau re-render
// - Reload / SetTable / Unbind chạy chắc chắn
// - Hiển thị bàn '-' khi app đang ở màn chọn bàn
// ===============================================
(function(){
  // UI refs (khớp admin.html)
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
  function showTable(val){
    if (!val) return '-';
    const s = String(val).trim();
    return s ? s : '-';
  }
  function log(){ try{ console.log('[admin-devices]', ...arguments); }catch(_){} }

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
    log('Firebase ready', window.firebaseConfig?.databaseURL);
  }

  // ---- CODES ----
  let lastCodes = {};
  function renderCodes(codes){
    lastCodes = codes || {};
    const entries = Object.entries(lastCodes).sort(([a],[b])=> a.localeCompare(b));
    let html = '';
    for (const [code, data] of entries){
      const enabled = (data && data.enabled !== false);
      const boundId = data?.boundDeviceId || '';
      html += `
        <tr class="border-b last:border-0" data-code="${code}">
          <td class="px-2 py-1 font-mono">${code}</td>
          <td class="px-2 py-1">
            <span class="inline-flex items-center gap-1 text-xs ${enabled?'text-emerald-700':'text-red-600'}">
              <span class="w-2 h-2 rounded-full ${enabled?'bg-emerald-500':'bg-red-500'}"></span>
              ${enabled?'Đang bật':'Đang tắt'}
            </span>
          </td>
          <td class="px-2 py-1 text-xs break-all">${boundId || '—'}</td>
          <td class="px-2 py-1 text-xs">${data?.boundAt? formatTime(data.boundAt) : '—'}</td>
          <td class="px-2 py-1">
            <div class="flex flex-wrap gap-2">
              <button class="px-2 py-1 text-xs rounded bg-gray-800 text-white hover:bg-black" data-action="code-toggle">${enabled?'Tắt':'Bật'}</button>
              <button class="px-2 py-1 text-xs rounded bg-amber-600 text-white hover:bg-amber-700" data-action="code-revoke">Thu hồi</button>
              <button class="px-2 py-1 text-xs rounded bg-red-600 text-white hover:bg-red-700" data-action="code-delete">Xoá</button>
            </div>
          </td>
        </tr>`;
    }
    codesBody.innerHTML = html || '';
  }

  // Delegation: CODES
  codesBody.addEventListener('click', async (ev)=>{
    const btn = ev.target.closest('button[data-action]');
    if (!btn) return;
    const tr = btn.closest('tr[data-code]');
    if (!tr) return;
    const code = tr.getAttribute('data-code');
    const data = lastCodes[code] || {};
    const action = btn.getAttribute('data-action');
    log('codes click', action, code);

    try{
      if (action === 'code-toggle') {
        const enabled = !(data && data.enabled !== false);
        await db.ref('codes/'+code+'/enabled').set(enabled);
      }
      if (action === 'code-revoke') {
        // Xoá bound ở code
        const updates = {};
        updates['codes/'+code+'/boundDeviceId'] = null;
        updates['codes/'+code+'/boundAt']       = null;
        await db.ref().update(updates);
        // Nếu đang gắn: gửi unbindAt
        const current = data?.boundDeviceId;
        if (current) {
          await db.ref(`devices/${current}/commands/unbindAt`).set(firebase.database.ServerValue.TIMESTAMP);
        }
      }
      if (action === 'code-delete') {
        await db.ref('codes/'+code).remove();
      }
    }catch(e){
      showDevError('Thao tác mã lỗi: '+(e?.message||e));
    }
  });

  async function importCodesFromTextarea(){
    showDevError('');
    const raw = (txtImport.value||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
    if (raw.length===0){ showDevError('Chưa có mã nào trong ô nhập.'); return; }
    const updates = {};
    for (const code of raw){
      updates['codes/'+code+'/enabled']   = true;
      updates['codes/'+code+'/createdAt'] = firebase.database.ServerValue.TIMESTAMP;
    }
    try{
      await db.ref().update(updates);
      txtImport.value = '';
    }catch(e){ showDevError('Nhập mã thất bại: '+(e?.message||e)); }
  }

  // ---- DEVICES ----
  let lastDevices = {};
  function renderDevices(devices){
    lastDevices = devices || {};
    const entries = Object.entries(lastDevices).sort(([a],[b])=> a.localeCompare(b));
    let html = '';
    for (const [id, data] of entries){
      const code  = data?.code || '';
      const table = showTable(data?.table);
      const last  = data?.lastSeen || 0;

      html += `
        <tr class="border-b last:border-0" data-id="${id}" data-code="${code}">
          <td class="px-2 py-1 text-xs break-all">${id}</td>
          <td class="px-2 py-1 font-mono">${code || '—'}</td>
          <td class="px-2 py-1">${table}</td>
          <td class="px-2 py-1 text-xs">${last? formatTime(last) : '—'}</td>
          <td class="px-2 py-1">
            <div class="flex flex-wrap gap-2">
              <button class="px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700" data-action="dev-reload">Làm mới</button>
              <button class="px-2 py-1 text-xs rounded bg-emerald-600 text-white hover:bg-emerald-700" data-action="dev-settable">Đổi số bàn</button>
              <button class="px-2 py-1 text-xs rounded bg-amber-600 text-white hover:bg-amber-700" data-action="dev-unbind">Gỡ liên kết</button>
            </div>
          </td>
        </tr>`;
    }
    devicesBody.innerHTML = html || '';
  }

  // Delegation: DEVICES
  devicesBody.addEventListener('click', async (ev)=>{
    const btn = ev.target.closest('button[data-action]');
    if (!btn) return;
    const tr = btn.closest('tr[data-id]');
    if (!tr) return;
    const id    = tr.getAttribute('data-id');
    const code  = tr.getAttribute('data-code') || '';
    const act   = btn.getAttribute('data-action');
    log('devices click', act, id, code);

    try{
      if (act === 'dev-reload') {
        await db.ref(`devices/${id}/commands/reloadAt`).set(firebase.database.ServerValue.TIMESTAMP);
      }
      if (act === 'dev-settable') {
        const cur = lastDevices?.[id]?.table;
        let t = prompt('Nhập số bàn mới (ví dụ: 5 hoặc T05):', (cur && cur !== '-') ? cur : '');
        if (t===null) return;
        t = String(t).trim();
        if (!t) return;

        await db.ref(`devices/${id}/commands/setTable`).set({
          value: t, at: firebase.database.ServerValue.TIMESTAMP
        });
        // cập nhật nhanh cảm giác (client cũng sẽ tự báo)
        await db.ref(`devices/${id}/table`).set(t);
      }
      if (act === 'dev-unbind') {
        if (code) {
          const updates = {};
          updates[`codes/${code}/boundDeviceId`] = null;
          updates[`codes/${code}/boundAt`]       = null;
          await db.ref().update(updates);
        }
        await db.ref(`devices/${id}/commands/unbindAt`).set(firebase.database.ServerValue.TIMESTAMP);
      }
    }catch(e){
      showDevError('Thao tác thiết bị lỗi: '+(e?.message||e));
    }
  });

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

      db.ref('codes').on('value', s=>{
        try{ renderCodes(s.val()); }catch(e){ showDevError('Render codes lỗi: '+(e?.message||e)); }
      }, e=> showDevError('Lỗi tải mã: '+(e?.message||e)));

      db.ref('devices').on('value', s=>{
        try{ renderDevices(s.val()); }catch(e){ showDevError('Render devices lỗi: '+(e?.message||e)); }
      }, e=> showDevError('Lỗi tải thiết bị: '+(e?.message||e)));

      btnImport?.addEventListener('click', importCodesFromTextarea);
      btnBroadcastReload?.addEventListener('click', sendBroadcastReload);

      log('booted');
    }catch(e){
      showDevError('Lỗi khởi chạy: '+(e?.message||e));
    }
  })();
})();
