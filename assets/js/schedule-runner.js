// /assets/js/schedule-runner.js
(function () {
  'use strict';

  const log  = (...a) => console.log('[schedule-runner]', ...a);
  const warn = (...a) => console.warn('[schedule-runner]', ...a);

  // ====== Cấu trúc DB mong đợi (từ admin) ======
  // Global: control/schedule = {
  //   enabled: true,
  //   tz: "Asia/Tokyo",          // hoặc "timezone"
  //   week: {                    // hoặc "days"
  //     "0": [ { on:"09:00", off:"22:00" }, ... ], // CN
  //     "1": [ ... ],                               // Thứ 2
  //     ...
  //     "6": [ ... ]                                // Thứ 7
  //   }
  // }
  // (Tùy chọn) Override theo bàn:
  // control/tables/{table}/schedule = { enabled, tz, week }  // nếu tồn tại thì ưu tiên
  //
  // Gợi ý: nếu admin đang dùng key khác ("days"/"timezone") runner này vẫn tự nhận.

  // ====== Tiện ích thời gian theo IANA ======
  // Chuyển "HH:mm" trong múi giờ tz -> Date (local) lần tiếp theo trong ngày today
  function parseTimeToday(hhmm, tz, ref = new Date()) {
    // Tạo một date ở 00:00 local, nhưng tính phút giây theo tz
    const [H, M] = (hhmm || '00:00').split(':').map(s => parseInt(s, 10) || 0);

    // Lấy YYYY-MM-DD của "bây giờ" theo tz
    const now = new Date(ref);
    // Trích xuất components theo tz bằng Intl
    const dtfDate = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(now).reduce((o, p) => (o[p.type] = p.value, o), {});
    const y = parseInt(dtfDate.year, 10);
    const m = parseInt(dtfDate.month, 10);
    const d = parseInt(dtfDate.day, 10);

    // Tạo string ISO của thời điểm (theo tz) rồi convert về Date local
    // trick: tạo timestamp bằng cách parse như "YYYY-MM-DDTHH:mm:00" trong tz -> epoch bằng cách dùng Date.UTC và offset tz
    // Nhưng JS không cho parse tz trực tiếp, dùng Intl hack:
    // Ta tìm chênh lệch offset tại thời điểm đó.
    const isoLocalLike = `${y.toString().padStart(4,'0')}-${m.toString().padStart(2,'0')}-${d.toString().padStart(2,'0')}T${String(H).padStart(2,'0')}:${String(M).padStart(2,'0')}:00`;

    // Lấy offset phút của tz tại thời điểm đó
    const offsetMin = tzOffsetMinutes(isoLocalLike, tz);
    // epoch ms = Date.UTC - offset*60*1000
    const ms = Date.UTC(y, m-1, d, H, M, 0, 0) - offsetMin * 60 * 1000;
    return new Date(ms);
  }

  // Tính offset phút của tz cho một local-like ISO (YYYY-MM-DDTHH:mm:ss)
  function tzOffsetMinutes(isoLocalLike, tz) {
    // Render thời điểm này ở tz và ở UTC, lấy chênh lệch
    const date = new Date(isoLocalLike + 'Z'); // tạm coi là UTC
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    const partsTZ  = fmt.formatToParts(date).reduce((o,p)=> (o[p.type]=p.value, o), {});
    const partsUTC = new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC', hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).formatToParts(date).reduce((o,p)=> (o[p.type]=p.value, o), {});

    const toSec = (p) => (
      (parseInt(p.hour,10)||0)*3600 + (parseInt(p.minute,10)||0)*60 + (parseInt(p.second,10)||0)
    );
    // Nếu cùng ngày, offset (s) = timeTZ - timeUTC
    // Trường hợp lệch ngày, ta tính tổng giây từ epoch ngày (đơn giản: so sánh Date objects sẽ phức tạp hơn mức cần thiết ở đây)
    const dayTZ  = `${partsTZ.year}-${partsTZ.month}-${partsTZ.day}`;
    const dayUTC = `${partsUTC.year}-${partsUTC.month}-${partsUTC.day}`;
    let delta = toSec(partsTZ) - toSec(partsUTC);
    // nếu khác ngày, cộng/trừ 24h
    if (dayTZ > dayUTC) delta += 24*3600;
    if (dayTZ < dayUTC) delta -= 24*3600;
    return Math.round(delta/60);
  }

  function getWeekKey(date, tz) {
    const day = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(date);
    // Convert Sun..Sat -> 0..6
    const map = { Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6 };
    return map[day] ?? 0;
  }

  // Kiểm tra thời điểm "now" (theo tz) có đang nằm trong bất kỳ khoảng off nào không
  function isOffNow(schedule, tz) {
    const week = schedule.week || schedule.days || {};
    const enabled = schedule.enabled !== false;
    if (!enabled) return { off: false, nextTS: Date.now() + 60*60*1000 };

    const now = new Date();
    const dow = String(getWeekKey(now, tz));
    const pairs = week[dow] || [];

    // chuẩn hóa [{on,off}] và sort theo "on"
    const norm = pairs
      .map(p => ({ on: (p.on||p.start||'00:00'), off: (p.off||p.end||'00:00') }))
      .filter(p => p.on && p.off)
      .sort((a,b)=> a.on.localeCompare(b.on));

    let off = false;
    let nearestTS = Date.now() + 24*60*60*1000; // mặc định 24h nữa
    for (const p of norm) {
      const onD  = parseTimeToday(p.on,  tz, now);
      const offD = parseTimeToday(p.off, tz, now);
      const tNow = now.getTime();
      if (onD.getTime() <= tNow && tNow < offD.getTime()) {
        // đang nằm trong khoảng: OFF
        off = true;
        nearestTS = Math.min(nearestTS, offD.getTime()); // sự kiện tiếp theo là "bật"
      } else if (tNow < onD.getTime()) {
        // chưa tới đợt tắt: sự kiện tiếp theo là "tắt"
        nearestTS = Math.min(nearestTS, onD.getTime());
      }
    }
    return { off, nextTS: nearestTS };
  }

  // ====== Điều khiển overlay schedule (không giành quyền với thứ khác) ======
  const overlay = () => document.getElementById('screen-overlay');

  function setScheduleOverlay(on) {
    const el = overlay();
    if (!el) return;
    // Gắn cờ riêng cho schedule để không “giật” với nguồn khác
    const reasons = new Set((el.dataset.reasons || '').split(',').filter(Boolean));
    if (on) reasons.add('schedule'); else reasons.delete('schedule');
    el.dataset.reasons = Array.from(reasons).join(',');
    el.style.display = reasons.size ? 'block' : 'none';
  }

  // ====== Lấy tableId hiện tại từ localStorage (do device-bind thiết lập) ======
  function getTableId() {
    try { return localStorage.getItem('tableId') || null; } catch { return null; }
  }

  // ====== Tải schedule (ưu tiên theo bàn, fallback global) ======
  async function fetchEffectiveSchedule(db, tableId) {
    // Ưu tiên per-table
    if (tableId) {
      const snap = await db.ref(`control/tables/${tableId}/schedule`).get().catch(()=>null);
      if (snap && snap.exists()) {
        const v = snap.val() || {};
        return v;
      }
    }
    // Fallback global
    const snap2 = await db.ref('control/schedule').get().catch(()=>null);
    return (snap2 && snap2.exists()) ? (snap2.val() || {}) : {};
  }

  // Chọn tz hợp lệ
  function pickTZ(s) {
    const tz = s.tz || s.timezone || 'Asia/Tokyo';
    try { new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date()); return tz; }
    catch { return 'Asia/Tokyo'; }
  }

  // ====== Lập lịch cục bộ ======
  let db = null;
  let unsubscribes = [];
  let timerId = null;

  function clearAllTimers() {
    if (timerId) { clearTimeout(timerId); timerId = null; }
  }
  function clearAllSubs() {
    unsubscribes.forEach(fn => { try{ fn(); }catch{} });
    unsubscribes = [];
  }

  async function computeAndApply() {
    if (!db) return;
    const tableId = getTableId();
    const schedule = await fetchEffectiveSchedule(db, tableId);
    const tz = pickTZ(schedule);

    const { off, nextTS } = isOffNow(schedule, tz);
    setScheduleOverlay(off);
    log(`apply: ${off ? 'OFF (blackout)' : 'ON'} | next check at ${new Date(nextTS).toLocaleString()}`);

    // đặt hẹn tới mốc tiếp theo + backup mỗi 60s
    clearAllTimers();
    const delay = Math.max(5, Math.min(nextTS - Date.now(), 6*60*60*1000)); // không để quá 6h
    timerId = setTimeout(computeAndApply, delay);
    // Backup tick 60s để chống trượt (không reset timerId để tránh chồng chéo)
    setTimeout(() => { try{ computeAndApply(); }catch{} }, 60*1000);
  }

  // ====== Khởi động ======
  async function ensureFirebaseReady() {
    if (!window.firebase || !firebase.apps?.length) throw new Error('Firebase chưa init');
    if (!firebase.auth().currentUser) {
      await firebase.auth().signInAnonymously();
      await new Promise(r => {
        const un = firebase.auth().onAuthStateChanged(u => { if (u) { un(); r(); } });
      });
    }
    return firebase.database();
  }

  async function boot() {
    try {
      db = await ensureFirebaseReady();
      log('runner ready');

      // Lắng nghe thay đổi schedule global
      const refGlobal = db.ref('control/schedule');
      refGlobal.on('value', () => computeAndApply(), e => warn('global schedule listen err', e));
      unsubscribes.push(() => refGlobal.off('value'));

      // Lắng nghe thay đổi tableId (localStorage) bằng storage event (chỉ khi nhiều tab),
      // và heartbeat của app đã có. Ta vẫn cài tick 5s kiểm tra thay đổi tableId.
      let lastTable = getTableId();
      setInterval(() => {
        const cur = getTableId();
        if (cur !== lastTable) {
          lastTable = cur;
          computeAndApply();
        }
      }, 5000);

      // Nếu có per-table schedule: nghe theo bàn hiện tại
      const bindPerTable = () => {
        const t = getTableId();
        if (!t) return;
        const refTbl = db.ref(`control/tables/${t}/schedule`);
        refTbl.on('value', () => computeAndApply(), e => warn('table schedule listen err', e));
        unsubscribes.push(() => refTbl.off('value'));
      };
      bindPerTable();

      // Nghe control/tables/<table>/schedule động khi table thay đổi
      setInterval(() => {
        clearAllSubs();
        const refGlobal2 = db.ref('control/schedule');
        refGlobal2.on('value', () => computeAndApply(), ()=>{});
        unsubscribes.push(() => refGlobal2.off('value'));
        bindPerTable();
      }, 30000);

      // Lần đầu
      computeAndApply();
    } catch (e) {
      warn('boot error', e?.message || e);
    }
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    boot();
  } else {
    document.addEventListener('DOMContentLoaded', boot);
  }
})();
