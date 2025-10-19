// assets/js/admin-devices.js
// Quản lý MÃ iPad + danh sách thiết bị (devices)
// YÊU CẦU: firebase đã init & auth ẩn danh xong ở admin.html

(function () {
  const elCodesTbody   = document.getElementById('codes-tbody');
  const elDevicesTbody = document.getElementById('devices-tbody');
  const elBtnBroadcast = document.getElementById('btn-broadcast-reload');
  const elBtnImport    = document.getElementById('btn-import-codes');
  const elCodesImport  = document.getElementById('codes-import');
  const elDevError     = document.getElementById('devError');

  if (!window.firebase || !firebase.apps.length) {
    console.warn('[admin-devices] Firebase chưa sẵn sàng. Đảm bảo admin.html đã init trước.');
    return;
  }

  const db = firebase.database();

  const tsAgo = (ts) => {
    if (!ts) return '-';
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return s + 's';
    const m = Math.floor(s / 60);
    if (m < 60) return m + 'm';
    const h = Math.floor(m / 60);
    if (h < 24) return h + 'h';
    return Math.floor(h / 24) + 'd';
  };
  const showDevError = (msg) => {
    if (!elDevError) return;
    elDevError.textContent = msg || '';
    elDevError.classList.toggle('hidden', !msg);
  };

  // ===== Broadcast reload toàn bộ
  if (elBtnBroadcast) {
    elBtnBroadcast.addEventListener('click', async () => {
      try {
        await db.ref('broadcast').update({ reloadAt: firebase.database.ServerValue.TIMESTAMP });
        showDevError('');
        alert('Đã gửi lệnh reload toàn bộ');
      } catch (e) {
        showDevError('Gửi broadcast thất bại: ' + (e?.message || e));
      }
    });
  }

  // ===== Import danh sách mã
  if (elBtnImport && elCodesImport) {
    elBtnImport.addEventListener('click', async () => {
      const raw = (elCodesImport.value || '').trim();
      if (!raw) return alert('Dán danh sách mã (mỗi dòng 1 mã)');
      const lines = raw.split(/\r?\n/).map(s => s.trim().toUpperCase()).filter(Boolean);
      if (!lines.length) return alert('Không có mã hợp lệ');

      const updates = {};
      const now = firebase.database.ServerValue.TIMESTAMP;
      for (const code of lines) {
        updates['codes/' + code] = { enabled: true, boundDeviceId: null, createdAt: now, boundAt: null };
      }
      try {
        await db.ref().update(updates);
        elCodesImport.value = '';
        alert('Đã thêm ' + lines.length + ' mã');
      } catch (e) {
        alert('Thêm mã lỗi: ' + (e?.message || e));
      }
    });
  }

  // ===== Render bảng Codes (live)
  function renderCodes(data) {
    if (!elCodesTbody) return;
    elCodesTbody.innerHTML = '';
    const entries = Object.entries(data).sort((a, b) => a[0].localeCompare(b[0]));

    for (const [code, obj] of entries) {
      const tr = document.createElement('tr');
      tr.className = 'border-b';
      tr.innerHTML = `
        <td class="px-2 py-1 font-mono text-sm">${code}</td>
        <td class="px-2 py-1">${obj.enabled ? '<span class="text-green-700">ON</span>' : '<span class="text-gray-400">OFF</span>'}</td>
        <td class="px-2 py-1">${obj.boundDeviceId ? `<span class="text-blue-700">${obj.boundDeviceId}</span>` : '-'}</td>
        <td class="px-2 py-1">${obj.boundAt ? tsAgo(obj.boundAt) : '-'}</td>
        <td class="px-2 py-1">
          <div class="flex items-center gap-2">
            <button class="px-3 py-1.5 text-xs rounded-md bg-blue-600 text-white hover:bg-blue-700" data-act="toggle">${obj.enabled ? 'Tắt' : 'Bật'}</button>
            <button class="px-3 py-1.5 text-xs rounded-md bg-blue-600 text-white hover:bg-blue-700" data-act="unbind" ${obj.boundDeviceId ? '' : 'disabled'}>Gỡ liên kết</button>
            <button class="px-3 py-1.5 text-xs rounded-md bg-blue-600 text-white hover:bg-blue-700" data-act="delete">Xóa mã</button>
          </div>
        </td>
      `;

      tr.querySelector('[data-act="toggle"]').addEventListener('click', () => {
        db.ref('codes/' + code).update({ enabled: !obj.enabled });
      });
      tr.querySelector('[data-act="unbind"]').addEventListener('click', () => {
        db.ref('codes/' + code).transaction(v => (v ? { ...v, boundDeviceId: null, boundAt: null } : v));
      });
      tr.querySelector('[data-act="delete"]').addEventListener('click', async () => {
        if (confirm('Xóa mã ' + code + '?')) await db.ref('codes/' + code).remove();
      });

      elCodesTbody.appendChild(tr);
    }
  }

  db.ref('codes').on(
    'value',
    snap => renderCodes(snap.val() || {}),
    err => showDevError('Lỗi tải mã: ' + (err?.message || err))
  );

  // ===== Render bảng Devices (live)
  function renderDevices(data) {
    if (!elDevicesTbody) return;
    elDevicesTbody.innerHTML = '';
    const entries = Object.entries(data).sort((a, b) => (b[1].lastSeen || 0) - (a[1].lastSeen || 0));

    for (const [id, obj] of entries) {
      const tr = document.createElement('tr');
      tr.className = 'border-b';
      tr.innerHTML = `
        <td class="px-2 py-1 font-mono text-xs">${id}</td>
        <td class="px-2 py-1">${obj.code || '-'}</td>
        <td class="px-2 py-1">${obj.table || '-'}</td>
        <td class="px-2 py-1">${obj.lastSeen ? tsAgo(obj.lastSeen) : '-'}</td>
        <td class="px-2 py-1">
          <!-- ✅ Hai nút xếp thẳng hàng, style giống nút "Làm mới" -->
          <div class="flex items-center gap-2">
            <button class="px-3 py-1.5 text-xs rounded-md bg-blue-600 text-white hover:bg-blue-700" data-act="reload">Làm mới</button>
            <button class="px-3 py-1.5 text-xs rounded-md bg-blue-600 text-white hover:bg-blue-700" data-act="settable">Đổi số bàn</button>
          </div>
        </td>
      `;

      tr.querySelector('[data-act="reload"]').addEventListener('click', () => {
        db.ref('devices/' + id + '/commands').update({ reloadAt: firebase.database.ServerValue.TIMESTAMP });
      });

      tr.querySelector('[data-act="settable"]').addEventListener('click', () => {
        const v = prompt('Nhập số bàn mới (ví dụ: T-12)');
        if (!v) return;
        db.ref('devices/' + id + '/commands/setTable').set({ value: v, at: firebase.database.ServerValue.TIMESTAMP });
        db.ref('devices/' + id).update({ table: v }); // để admin thấy ngay
      });

      elDevicesTbody.appendChild(tr);
    }
  }

  db.ref('devices').on(
    'value',
    snap => renderDevices(snap.val() || {}),
    err => showDevError('Lỗi tải thiết bị: ' + (err?.message || err))
  );
})();
