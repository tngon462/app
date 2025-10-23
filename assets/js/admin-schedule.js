// assets/js/admin-schedule.js
(function () {
  'use strict';
  const log = (...a) => console.log('[admin-schedule]', ...a);
  const warn = (...a) => console.warn('[admin-schedule]', ...a);

  const DEFAULT_TZ = 'Asia/Tokyo';
  const WEEK_NAMES = ['CN','T2','T3','T4','T5','T6','T7'];

  async function ensureFirebase() {
    if (!window.firebase || !firebase.apps?.length) throw new Error('Firebase chưa khởi tạo');
    if (!firebase.auth().currentUser) {
      await firebase.auth().signInAnonymously();
      await new Promise((res) => {
        const un = firebase.auth().onAuthStateChanged((u) => {
          if (u) { un(); res(); }
        });
      });
    }
    return firebase.database();
  }

  // ====== Giao diện nhỏ trong Admin (tab "Thiết bị") ======
  function buildUI(container, db) {
    container.innerHTML = `
      <div class="mt-6 bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-lg font-semibold text-gray-800">⏰ Hẹn giờ bật/tắt toàn bộ</h3>
          <button id="btnSaveSchedule" class="px-3 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700">
            Lưu thay đổi
          </button>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          <div>
            <label class="block text-sm font-medium text-gray-600 mb-1">Giờ bật (ON)</label>
            <input id="inpOnTime" type="time" class="w-full border rounded-md px-2 py-1" value="09:00" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-600 mb-1">Giờ tắt (OFF)</label>
            <input id="inpOffTime" type="time" class="w-full border rounded-md px-2 py-1" value="22:00" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-600 mb-1">Múi giờ</label>
            <input id="inpTimezone" type="text" class="w-full border rounded-md px-2 py-1" value="${DEFAULT_TZ}" />
            <p class="text-xs text-gray-500 mt-1">VD: Asia/Tokyo, Asia/Ho_Chi_Minh</p>
          </div>
        </div>

        <div class="mb-3">
          <label class="block text-sm font-medium text-gray-600 mb-1">Áp dụng các ngày:</label>
          <div id="daysWrap" class="flex flex-wrap gap-2"></div>
        </div>

        <div class="flex items-center gap-2">
          <input id="chkEnabled" type="checkbox" class="w-4 h-4" checked />
          <label for="chkEnabled" class="text-sm text-gray-700 select-none">Bật lịch hẹn giờ</label>
        </div>
      </div>
    `;

    const daysWrap = container.querySelector('#daysWrap');
    for (let i = 0; i < 7; i++) {
      const btn = document.createElement('button');
      btn.textContent = WEEK_NAMES[i];
      btn.dataset.day = i;
      btn.className = 'px-2 py-1 border rounded-md text-sm bg-emerald-100 border-emerald-300 text-emerald-800';
      btn.addEventListener('click', () => {
        btn.classList.toggle('bg-emerald-100');
        btn.classList.toggle('bg-gray-100');
        btn.classList.toggle('text-emerald-800');
        btn.classList.toggle('text-gray-600');
      });
      daysWrap.appendChild(btn);
    }

    // Nút Lưu
    const btnSave = container.querySelector('#btnSaveSchedule');
    btnSave.addEventListener('click', async () => {
      const enabled = container.querySelector('#chkEnabled').checked;
      const onTime = container.querySelector('#inpOnTime').value || '09:00';
      const offTime = container.querySelector('#inpOffTime').value || '22:00';
      const tz = container.querySelector('#inpTimezone').value || DEFAULT_TZ;

      const days = Array.from(daysWrap.querySelectorAll('button'))
        .filter((b) => b.classList.contains('bg-emerald-100'))
        .map((b) => b.dataset.day);

      const week = {};
      for (const d of days) {
        week[d] = [{ on: onTime, off: offTime }];
      }

      const data = { enabled, tz, week };
      try {
        await db.ref('control/schedule').set(data);
        alert('✅ Đã lưu lịch hẹn giờ!');
      } catch (e) {
        alert('❌ Lỗi lưu lịch: ' + (e?.message || e));
      }
    });
  }

  // ====== Tải lịch hiện có ======
  async function loadCurrent(container, db) {
    const snap = await db.ref('control/schedule').get().catch(() => null);
    if (!snap || !snap.exists()) return;

    const data = snap.val() || {};
    container.querySelector('#chkEnabled').checked = data.enabled !== false;
    container.querySelector('#inpTimezone').value = data.tz || data.timezone || DEFAULT_TZ;

    const week = data.week || data.days || {};
    const firstDay = Object.keys(week)[0];
    const pair = (firstDay && week[firstDay]?.[0]) || { on: '09:00', off: '22:00' };
    container.querySelector('#inpOnTime').value = pair.on || '09:00';
    container.querySelector('#inpOffTime').value = pair.off || '22:00';

    const days = Object.keys(week).map((d) => parseInt(d, 10));
    container.querySelectorAll('#daysWrap button').forEach((btn) => {
      if (days.includes(parseInt(btn.dataset.day, 10))) {
        btn.classList.add('bg-emerald-100', 'border-emerald-300', 'text-emerald-800');
        btn.classList.remove('bg-gray-100', 'text-gray-600');
      } else {
        btn.classList.add('bg-gray-100', 'text-gray-600');
        btn.classList.remove('bg-emerald-100', 'text-emerald-800');
      }
    });
  }

  // ====== Khởi chạy ======
  async function boot() {
    try {
      const db = await ensureFirebase();
      const grid = document.getElementById('viewDevices');
      if (!grid) return;

      const panel = document.createElement('div');
      grid.appendChild(panel);
      buildUI(panel, db);
      await loadCurrent(panel, db);

      log('Schedule UI ready.');
    } catch (e) {
      warn('boot error', e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
