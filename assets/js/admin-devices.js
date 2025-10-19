// ===============================================
// admin-devices.js v1-sync2
// - GIỮ UI như v1
// - Hiển thị bàn: "-", "<bàn>", hoặc "+<bàn>" khi inPOS/stage=pos
// - Reload: gửi commands/reloadAt (client reload -> nếu có tableNumber tự vào Start Order)
// - SetTable: commands/setTable + cập nhật cột Bàn nhanh
// - Unbind: gửi commands/unbindAt (luôn), nếu biết code thì thu hồi trong /codes
// ===============================================
(function(){
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

  // ---- CODES (UI giữ nguyên) ----
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
        try{ await db.ref('codes/'+code+'/enabled').set(!enabled); }
        catch(e){ showDevError('Đổi trạng thái thất bại: '+(e?.message||e)); }
      });

      tr.querySelector('[data-act="revoke"]').addEventListener('click', async ()=>{
        try{
          // Xoá bind tại codes
          const updates = {};
          updates['codes/'+code+'/boundDeviceId'] = null;
          updates['codes/'+code+'/boundAt'] = null;
          await db.ref().update(updates);
          // Gửi unbind cho thiết bị nếu biết
          if (boundId){
            await db.ref(`devices/${boundId}/commands/unbindAt`).set(firebase.database.ServerValue.TIMESTAMP);
          }
        }catch(e){ showDevError('Thu hồi mã thất bại: '+(e?.message||e)); }
      });

      tr.querySelector('[data-act="delete"]').addEventListener('click', async ()=>{
        try{ await db.ref('codes/'+code).remove(); }
        catch(e){ showDevError('Xoá mã thất bại: '+(e?.message||e)); }
      });

      codesBody.appendChild(tr);
    }
  }

  // ---- Helpers hiển thị bàn (theo yêu cầu) ----
  function displayTableFromDevice(data){
    // Có thể là string/number, hoặc object { value, stage, inPOS, ... }
    let raw = data?.table;

    // Ưu tiên object
    if (raw && typeof raw === 'object') {
      const v = (raw.value ?? raw.table ?? '').toString().trim();
      const stage = (raw.stage || raw.view || raw.status || '').toString().toLowerCase();
      const inPOS = (raw.inPOS === true);

      if (stage === 'select') return '-';
      if (stage === 'pos' || inPOS) {
        const val = v || data?.lastKnownTable || '';
        return val ? ('+' + val) : '+?';
      }
      return v || '—';
    }

    // String/number
    if (raw == null) raw = '';
    raw = String(raw).trim();

    // Nếu client có thêm cờ stage/inPOS ở root
    const stageRoot = String(data?.stage || data?.view || data?.status || '').toLowerCase();
    const inPOSroot = (data?.inPOS === true);

    if (raw === '' || raw === '-') {
      if (stageRoot === 'pos' || inPOSroot) {
        const lk = (data?.lastKnownTable ? String(data.lastKnownTable).trim() : '');
        return lk ? ('+'+lk) : '+?';
      }
      return '-';
    }

    if (raw.startsWith('+')) return raw;
    if (stageRoot === 'pos' || inPOSroot) return `+${raw}`;
    return raw;
  }

  // ---- DEVICES ----
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
        <tr class="border-b last:border-0">
          <td class="px-2 py-1 text-xs break-all">${id}</td>
          <td class="px-2 py-1 font-mono">${code || '—'}</td>
          <td class="px-2 py-1">${tableD}</td>
          <td class="px-2 py-1 text-xs">${last? formatTime(last) : '—'}</td>
          <td class="px-2 py-1">
            <div class="flex flex-wrap gap-2">
              <button class="px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700" data-act="reload" data-id="${id}">Làm mới</button>
              <button class="px-2 py-1 text-xs rounded bg-emerald-600 text-white hover:bg-emerald-700" data-act="settable" data-id="${id}" data-table="${(typeof data?.table==='string' && data.table.startsWith('+'))? data.table.slice(1) : (typeof data?.table==='object'? (data.table.value||'') : (data?.table||''))}">Đổi số bàn</button>
              <button class="px-2 py-1 text-xs rounded bg-amber-600 text-white hover:bg-amber-700" data-act="unbind" data-id="${id}" data-code="${code}">Gỡ liên kết</button>
            </div>
          </td>
        </tr>
      `;
      devicesBody.appendChild(tr.firstElementChild);
    }

    // rebind events mỗi lần render (UI v1)
    devicesBody.querySelectorAll('button[data-act="reload"]').forEach(btn=>{
      btn.onclick = async ()=>{
        const id = btn.getAttribute('data-id');
        try{
          await db.ref(`devices/${id}/commands/reloadAt`).set(firebase.database.ServerValue.TIMESTAMP);
        }catch(e){ showDevError('Gửi lệnh reload thất bại: '+(e?.message||e)); }
      };
    });

    devicesBody.querySelectorAll('button[data-act="settable"]').forEach(btn=>{
      btn.onclick = async ()=>{
        const id = btn.getAttribute('data-id');
        const cur = btn.getAttribute('data-table') || '';
        try{
          let t = prompt('Nhập số bàn mới (ví dụ: 5 hoặc T05):', cur);
          if (t===null) return;
          t = String(t).trim();
          if (!t) return;

          await db.ref(`devices/${id}/commands/setTable`).set({
            value: t, at: firebase.database.ServerValue.TIMESTAMP
          });
          await db.ref(`devices/${id}/table`).set(t); // cảm giác nhanh
        }catch(e){ showDevError('Đổi số bàn thất bại: '+(e?.message||e)); }
      };
    });

    devicesBody.querySelectorAll('button[data-act="unbind"]').forEach(btn=>{
      btn.onclick = async ()=>{
        const id = btn.getAttribute('data-id');
        const code = btn.getAttribute('data-code') || '';
        try{
          // Gửi lệnh unbind tới THIẾT BỊ (luôn làm)
          await db.ref(`devices/${id}/commands/unbindAt`).set(firebase.database.ServerValue.TIMESTAMP);

          // Nếu biết code đang gắn, THU HỒI trong /codes
          if (code) {
            const updates = {};
            updates[`codes/${code}/boundDeviceId`] = null;
            updates[`codes/${code}/boundAt`]       = null;
            await db.ref().update(updates);
          }
        }catch(e){ showDevError('Gỡ liên kết thất bại: '+(e?.message||e)); }
      };
    });
  }

  // ---- Broadcast reload ----
  async function sendBroadcastReload(){
    showDevError('');
    try{
      await db.ref('broadcast/reloadAt').set(firebase.database.ServerValue.TIMESTAMP);
    }catch(e){ showDevError('Reload toàn bộ thất bại: '+(e?.message||e)); }
  }

  // ---- Wire & live ----
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
