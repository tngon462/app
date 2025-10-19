// assets/js/admin-devices.js
// Quản lý MÃ iPad + danh sách thiết bị (devices)
// YÊU CẦU: firebase đã init & auth ẩn danh xong ở admin.html
// v2-stable-clean2 – giữ UI bản bạn gửi, fix “Đổi số bàn” -> Start Order đúng bàn

(function () {
  // ====== ELs theo admin.html của bạn ======
  const elCodesTbody   = document.getElementById('codes-tbody');
  const elDevicesTbody = document.getElementById('devices-tbody');
  const elBtnBroadcast = document.getElementById('btn-broadcast-reload');
  const elBtnImport    = document.getElementById('btn-import-codes');
  const elCodesImport  = document.getElementById('codes-import');
  const elDevError     = document.getElementById('devError');

  // (tuỳ chọn) Hàng đợi mã, nếu có trong HTML
  const elQueueWrap  = document.getElementById('codes-queue-wrap');
  const elQueueList  = document.getElementById('codes-queue');
  const elQueueCount = document.getElementById('codes-queue-count');

  // Modal chọn bàn
  const elModalRoot  = document.getElementById('modal-root');

  // ====== Guard Firebase ======
  if (!window.firebase || !firebase.apps.length) {
    console.warn('[admin-devices] Firebase chưa sẵn sàng. Đảm bảo admin.html đã init trước.');
    return;
  }
  const db = firebase.database();
  const TABLE_COUNT = 15; // khớp với tab màn hình

  // ====== Helpers ======
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

  // Hiển thị bàn theo state client
  function displayTableFromDevice(obj) {
    let raw = obj?.table;

    if (raw && typeof raw === 'object') {
      const v = (raw.value ?? raw.table ?? '').toString().trim();
      const stage = (raw.stage || raw.view || raw.status || '').toString().toLowerCase();
      const inPOS = (raw.inPOS === true);

      if (stage === 'select') return '-';
      if (stage === 'pos' || inPOS) {
        const fallback = v || (obj?.lastKnownTable ? String(obj.lastKnownTable).trim() : '');
        return fallback ? ('+' + fallback) : '+?';
      }
      return v || '—';
    }

    if (raw == null) raw = '';
    raw = String(raw).trim();

    const stageRoot = String(obj?.stage || obj?.view || obj?.status || '').toLowerCase();
    const inPOSroot = (obj?.inPOS === true);

    if (raw === '' || raw === '-') {
      if (stageRoot === 'pos' || inPOSroot) {
        const lk = (obj?.lastKnownTable ? String(obj.lastKnownTable).trim() : '');
        return lk ? ('+' + lk) : '+?';
      }
      return '-';
    }

    if (raw.startsWith('+')) return raw;
    if (stageRoot === 'pos' || inPOSroot) return `+${raw}`;
    return raw;
  }

  // Lấy “bàn sạch” (không dấu +, không '-') từ record device
  function currentPlainTable(obj) {
    let t = '';
    const raw = obj?.table;
    if (raw && typeof raw === 'object') {
      t = (raw.value ?? raw.table ?? '').toString().trim();
    } else {
      t = (raw ?? '').toString().trim();
    }
    if (!t || t === '-') t = (obj?.lastKnownTable ? String(obj.lastKnownTable).trim() : '');
    if (t && t.startsWith('+')) t = t.slice(1);
    return t || '';
  }

  // ===== Broadcast reload toàn bộ =====
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

  // ===== Import danh sách mã =====
  if (elBtnImport && elCodesImport) {
    elBtnImport.addEventListener('click', async () => {
      const raw = (elCodesImport.value || '').trim();
      if (!raw) return alert('Dán danh sách mã (mỗi dòng 1 mã)');
      const lines = raw.split(/\r?\n/).map(s => s.trim().toUpperCase()).filter(Boolean);
      if (!lines.length) return alert('Không có mã hợp lệ');

      const updates = {};
      const now = firebase.database.ServerValue.TIMESTAMP;
      for (const code of lines) {
        updates['codes/' + code] = {
          enabled: true,
          boundDeviceId: null,
          createdAt: now,
          boundAt: null
        };
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

  // ===== Render bảng Codes (live) =====
  function renderCodes(data) {
    if (!elCodesTbody) return;
    elCodesTbody.innerHTML = '';

    const entries = Object.entries(data || {}).sort((a, b) => a[0].localeCompare(b[0]));

    // Hàng đợi mã (nếu có container)
    if (elQueueWrap && elQueueList) {
      const avail = entries
        .filter(([_, o]) => o && o.enabled === true && !o.boundDeviceId)
        .map(([k]) => k);
      elQueueList.innerHTML = '';
      avail.forEach(code => {
        const pill = document.createElement('span');
        pill.className = 'px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs';
        pill.textContent = code;
        elQueueList.appendChild(pill);
      });
      elQueueWrap.classList.toggle('hidden', avail.length === 0);
      if (elQueueCount) elQueueCount.textContent = avail.length;
    }

    for (const [code, obj] of entries) {
      const tr = document.createElement('tr');
      tr.className = 'border-b';
      tr.innerHTML = `
        <td class="px-2 py-1 font-mono text-sm">${code}</td>
        <td class="px-2 py-1">${obj.enabled ? '<span class="text-green-700">Đang bật</span>' : '<span class="text-gray-400">Đang tắt</span>'}</td>
        <td class="px-2 py-1">${obj.boundDeviceId ? `<span class="text-blue-700">${obj.boundDeviceId}</span>` : '-'}</td>
        <td class="px-2 py-1">${obj.boundAt ? tsAgo(obj.boundAt) : '-'}</td>
        <td class="px-2 py-1">
          <div class="flex items-center gap-2">
            <button class="px-3 py-1.5 text-xs rounded-md ${obj.enabled ? 'bg-gray-800 hover:bg-black' : 'bg-emerald-600 hover:bg-emerald-700'} text-white" data-act="toggle">${obj.enabled ? 'Tắt' : 'Bật'}</button>
            <button class="px-3 py-1.5 text-xs rounded-md bg-red-600 text-white hover:bg-red-700" data-act="delete">Xóa mã</button>
          </div>
        </td>
      `;

      // Toggle enable: nếu tắt & mã đang dùng -> unbind thiết bị
      tr.querySelector('[data-act="toggle"]').addEventListener('click', async () => {
        const willEnable = !obj.enabled;
        try {
          await db.ref('codes/' + code + '/enabled').set(willEnable);
          if (!willEnable && obj.boundDeviceId) {
            await db.ref('devices/' + obj.boundDeviceId + '/commands').update({
              unbindAt: firebase.database.ServerValue.TIMESTAMP
            });
            await db.ref('codes/' + code).update({ boundDeviceId: null, boundAt: null });
          }
          alert((willEnable ? 'Bật' : 'Tắt') + ' mã ' + code + ' thành công');
        } catch (e) {
          alert('Đổi trạng thái lỗi: ' + (e?.message || e));
        }
      });

      // Delete code: nếu đang dùng -> unbind trước
      tr.querySelector('[data-act="delete"]').addEventListener('click', async () => {
        if (!confirm('Xóa mã ' + code + '?')) return;
        try {
          if (obj.boundDeviceId) {
            await db.ref('devices/' + obj.boundDeviceId + '/commands').update({
              unbindAt: firebase.database.ServerValue.TIMESTAMP
            });
          }
          await db.ref('codes/' + code).remove();
          alert('Đã xóa mã ' + code);
        } catch (e) {
          alert('Xóa mã lỗi: ' + (e?.message || e));
        }
      });

      elCodesTbody.appendChild(tr);
    }
  }

  db.ref('codes').on(
    'value',
    snap => renderCodes(snap.val() || {}),
    err  => showDevError('Lỗi tải mã: ' + (err?.message || err))
  );

  // ===== Modal chọn bàn =====
  function openTablePicker(count, onPick) {
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
    for (let i = 1; i <= count; i++) {
      const btn = document.createElement('button');
      btn.className = 'px-3 py-3 rounded-lg border text-sm hover:bg-blue-50';
      btn.textContent = String(i);
      btn.addEventListener('click', () => { try { onPick(String(i)); } finally { root.removeChild(wrap); } });
      grid.appendChild(btn);
    }
    wrap.querySelector('#tp-close').addEventListener('click', () => root.removeChild(wrap));
  }

  // ===== Render bảng Devices (live) + actions =====
  function displayRow(id, obj) {
    const tableDisp = displayTableFromDevice(obj);
    const plain = currentPlainTable(obj);
    const name = (obj?.name ? String(obj.name) : '');

    const tr = document.createElement('tr');
    tr.className = 'border-b';
    tr.innerHTML = `
      <td class="px-2 py-1 text-xs break-all">
        <div class="font-mono">${id}</div>
        <div class="text-[11px] text-gray-500 mt-0.5">
          <span id="dname-${id}">${name || '—'}</span>
          <button class="ml-1 text-blue-600 hover:underline" data-act="editname">✎ Sửa tên</button>
        </div>
      </td>
      <td class="px-2 py-1 font-mono">${obj.code || '-'}</td>
      <td class="px-2 py-1">${tableDisp}</td>
      <td class="px-2 py-1">${obj.lastSeen ? tsAgo(obj.lastSeen) : '-'}</td>
      <td class="px-2 py-1">
        <div class="flex items-center gap-2">
          <button class="px-3 py-1.5 text-xs rounded-md bg-blue-600 text-white hover:bg-blue-700" data-act="reload">Làm mới</button>
          <button class="px-3 py-1.5 text-xs rounded-md bg-emerald-600 text-white hover:bg-emerald-700" data-act="settable">Đổi số bàn</button>
          <button class="px-3 py-1.5 text-xs rounded-md bg-amber-600 text-white hover:bg-amber-700" data-act="kick" ${obj.code ? '' : 'disabled'}>Gỡ liên kết</button>
        </div>
      </td>
    `;

    // Đổi tên máy
    tr.querySelector('[data-act="editname"]').addEventListener('click', async () => {
      const cur = name || '';
      const v = prompt('Nhập tên máy (để trống để xoá):', cur);
      if (v === null) return;
      const nv = String(v).trim();
      try {
        await db.ref('devices/' + id + '/name').set(nv || null);
      } catch (e) {
        alert('Đổi tên lỗi: ' + (e?.message || e));
      }
    });

    // 1) Làm mới: nếu biết bàn hiện tại, setTable trước rồi reload → Start Order đúng bàn
    tr.querySelector('[data-act="reload"]').addEventListener('click', async () => {
      try {
        if (plain) {
          await db.ref('devices/' + id + '/commands/setTable').set({
            value: plain, at: firebase.database.ServerValue.TIMESTAMP
          });
        }
        await db.ref('devices/' + id + '/commands').update({ reloadAt: firebase.database.ServerValue.TIMESTAMP });
      } catch (e) {
        alert('Gửi lệnh reload thất bại: ' + (e?.message || e));
      }
    });

    // 2) Đổi số bàn: setTable rồi **reload** ngay để tránh giữ state cũ của nút START
    tr.querySelector('[data-act="settable"]').addEventListener('click', () => {
      openTablePicker(TABLE_COUNT, async (tableLabel) => {
        try {
          // Gửi setTable
          await db.ref('devices/' + id + '/commands/setTable').set({
            value: tableLabel,
            at: firebase.database.ServerValue.TIMESTAMP
          });
          // Cập nhật nhanh hiển thị
          await db.ref('devices/' + id).update({ table: tableLabel, lastKnownTable: tableLabel });
          // Quan trọng: reload để Start Order chắc chắn dùng bàn mới
          await db.ref('devices/' + id + '/commands').update({ reloadAt: firebase.database.ServerValue.TIMESTAMP });
        } catch (e) {
          alert('Đổi số bàn lỗi: ' + (e?.message || e));
        }
      });
    });

    // 3) Gỡ liên kết: thu hồi code + đẩy app về màn nhập mã
    tr.querySelector('[data-act="kick"]').addEventListener('click', async () => {
      const code = obj.code;
      if (!code) return alert('Thiết bị chưa gắn mã.');
      if (!confirm(`Gỡ liên kết thiết bị này và thu hồi mã ${code}?`)) return;
      try {
        // Thu hồi code nếu đang gắn đúng thiết bị
        await db.ref('codes/' + code).transaction(v => {
          if (!v) return v;
          if (v.boundDeviceId === id) return { ...v, boundDeviceId: null, boundAt: null };
          return v;
        });
        // Gửi lệnh unbind
        await db.ref('devices/' + id + '/commands').update({ unbindAt: firebase.database.ServerValue.TIMESTAMP });
        // Dọn hiển thị nhanh
        await db.ref('devices/' + id).update({ code: null, table: null });
      } catch (e) {
        alert('Gỡ liên kết thất bại: ' + (e?.message || e));
      }
    });

    return tr;
  }

  function renderDevices(data) {
    if (!elDevicesTbody) return;
    elDevicesTbody.innerHTML = '';
    const entries = Object.entries(data || {}).sort((a, b) => (b[1].lastSeen || 0) - (a[1].lastSeen || 0));
    for (const [id, obj] of entries) {
      elDevicesTbody.appendChild(displayRow(id, obj));
    }
  }

  db.ref('devices').on(
    'value',
    snap => renderDevices(snap.val() || {}),
    err  => showDevError('Lỗi tải thiết bị: ' + (err?.message || err))
  );

})();
