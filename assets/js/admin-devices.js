// ===============================================
// admin-devices.js v1-sync
// - GIỮ NGUYÊN UI như bản v1 của bạn
// - Đồng bộ bàn từ app:
//     • app ở màn "Chọn bàn" -> hiển thị "-"
//     • app đang trong POS/iframe -> hiển thị "+<bàn>"
//     • còn lại -> hiển thị "<bàn>"
// - Reload từng máy -> chỉ gửi reloadAt (client tự về Start Order nếu còn tableNumber)
// - Đổi số bàn -> set commands/setTable + cập nhật nhanh cột "Bàn"
// - Thu hồi / Xoá / Bật-Tắt mã -> giữ nguyên như v1
// ===============================================
(function(){
  // UI refs (giữ nguyên như v1)
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

  // ==== Firebase init (giữ nguyên tinh thần v1) ====
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

  // ---- CODES (UI & thao tác giữ nguyên v1) ----
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

  // Chuẩn hoá hiển thị bàn theo yêu cầu:
  //  - Nếu app ở màn "Chọn bàn": client nên ghi table="-"
  //  - Nếu app đang POS/iframe: ưu tiên cờ stage="pos" | inPOS=true -> hiển thị "+<bàn>"
  //  - Nếu table đã có tiền tố "+" -> giữ nguyên
  function displayTableFromDevice(data){
    // 1) raw có thể là string/number hoặc object { value, stage, inPOS, ... }
    let raw = data?.table;

    if (raw && typeof raw === 'object') {
      const v = (raw.value ?? raw.table ?? '').toString().trim();
      const stage = (raw.stage || raw.view || raw.status || '').toString().toLowerCase();
      const inPOS = (raw.inPOS === true);

      if (stage === 'select') return '-';
      if (stage === 'pos' || inPOS) return v ? ('+' + v) : '+?';
      return v || '—';
    }

    if (raw == null) return '—';
    raw = String(raw).trim();

    if (raw === '' || raw === '-') return '-';
    if (raw.startsWith('+')) return raw;

    const inPosFlag =
      data?.inPOS === true ||
      String(data?.stage||data?.view||data?.status||'').toLowerCase() === 'pos';

    if (inPosFlag) return `+${raw}`;
    return raw;
  }

  function renderDevices(devices){
    devicesBody.innerHTML = '';
    const entries = Object.entries(devices||{}).sort(([a],[b])=> a.localeCompare(b));
    for (const [id, data] of entries){
      const code   = data?.code || '';
      const tableD = displayTableFromDevice(data);
      const last   = data?.lastSeen || 0;

      const tr = document.createElement('tr');
      tr.className = 'border-b last:border-0';
      tr.innerHTML = `
        <td class="px-2 py-1 text-xs break-all">${id}</td>
        <td class="px-2 py-1 font-mono">${code || '—'}</td>
        <td class="px-2 py-1">${tableD}</td>
        <td class="px-2 py-1 text-xs">${last? formatTime(last) : '—'}</td>
        <td class="px-2 py-1">
          <div class="flex flex-wrap gap-2">
            <button class="px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700" data-act="reload">Làm mới</button>
            <button class="px-2 py-1 text-xs rounded bg-emerald-600 text-white hover:bg-emerald-700" data-act="settable">Đổi số bàn</button>
            <button class="px-2 py-1 text-xs rounded bg-amber-600 text-white hover:bg-amber-700" data-act="unbind">Gỡ liên kết</button>
          </div>
        </td>
      `;

      // "Làm mới" (reload): chỉ gửi reloadAt
      tr.querySelector('[data-act="reload"]').addEventListener('click', async ()=>{
        try{
          await db.ref(`devices/${id}/commands/reloadAt`).set(firebase.database.ServerValue.TIMESTAMP);
        }catch(e){ showDevError('Gửi lệnh reload thất bại: '+(e?.message||e)); }
      });

      // "Đổi số bàn": prompt nhanh
      tr.querySelector('[data-act="settable"]').addEventListener('click', async ()=>{
        try{
          // Lấy gợi ý hiện tại (nếu đang là "+8" thì gợi ý "8")
          let current = '';
          if (typeof data?.table === 'object') {
            current = (data.table.value ?? data.table.table ?? '') || '';
          } else if (typeof data?.table === 'string' && data.table.startsWith('+')) {
            current = data.table.replace(/^\+/, '');
          } else {
            current = data?.table || '';
          }

          let t = prompt('Nhập số bàn mới (ví dụ: 5 hoặc T05):', current || '');
          if (t===null) return;
          t = String(t).trim();
          if (!t) return;

          await db.ref(`devices/${id}/commands/setTable`).set({
            value: t, at: firebase.database.ServerValue.TIMESTAMP
          });

          // Cập nhật nhanh cảm giác (client cũng sẽ tự cập nhật lại ngay sau)
          await db.ref(`devices/${id}/table`).set(t);
        }catch(e){ showDevError('Đổi số bàn thất bại: '+(e?.message||e)); }
      });

      // "Gỡ liên kết": xoá bound ở codes + đẩy unbindAt cho thiết bị
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

  // ---- Broadcast reload (toàn bộ) ----
  async function sendBroadcastReload(){
    showDevError('');
    try{
      await db.ref('broadcast/reloadAt').set(firebase.database.ServerValue.TIMESTAMP);
    }catch(e){ showDevError('Reload toàn bộ thất bại: '+(e?.message||e)); }
  }

  // ---- Boot & live subscribe ----
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
    }catch(e){
      showDevError('Lỗi khởi chạy: '+(e?.message||e));
    }
  })();
})();
