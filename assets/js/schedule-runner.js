//11 assets/js/schedule-runner.js
(function(){
  'use strict';
  const log  = (...a)=>console.log('[schedule]', ...a);
  const warn = (...a)=>console.warn('[schedule]', ...a);

  // ===== Helpers =====
  const LS = {
    get(k, d=null){ try{ return JSON.parse(localStorage.getItem(k)) ?? d; }catch{ return d; } },
    set(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch{} },
    getStr(k, d=''){ try{ return localStorage.getItem(k) ?? d; }catch{ return d; } }
  };

  // Manual override schema (ưu tiên số 1)
  // localStorage.manualScreen = { value: "on"|"off", until: unix_ms }
  function getManualOverride(){
    const obj = LS.get('manualScreen', null);
    if (!obj) return null;
    const now = Date.now();
    if (typeof obj.until === 'number' && obj.until < now){
      // đã hết hạn -> gỡ
      try{ localStorage.removeItem('manualScreen'); }catch{}
      return null;
    }
    return obj; // {value, until}
  }

  // Cho phép iPad tự đặt override trong X phút (VD: khi nhân viên "bật tay")
  // Gọi: window.setManualScreen('on', 120)  // 120 phút
  window.setManualScreen = function(value='on', minutes=120){
    const until = Date.now() + Math.max(1, minutes)*60*1000;
    LS.set('manualScreen', { value: value === 'off' ? 'off' : 'on', until });
    log('manual override set:', value, 'until', new Date(until).toLocaleString());
  };

  // Blackout API (overlay màn đen) – dùng file blackout.js đã có
  function setBlackout(on){
    try {
      const el = document.getElementById('screen-overlay');
      if (!el) return;
      el.style.display = on ? 'block' : 'none';
    } catch {}
  }

  // Lấy giờ-phút hiện tại theo timezone IANA (không cần lib ngoài)
  function nowHMInTZ(tz){
    // Trả về {h, m, dow} theo tz
    const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour12:false,
      weekday: 'short', hour: '2-digit', minute:'2-digit'
    });
    // "Wed, 09, 30" -> lấy từ parts
    const parts = fmt.formatToParts(new Date());
    const get = (t)=> (parts.find(p=>p.type===t)||{}).value;
    const w = (parts.find(p=>p.type==='weekday')||{}).value || 'Sun';
    const h = Number(get('hour')||'0');
    const m = Number(get('minute')||'0');

    // Map: Sun=0 ... Sat=6
    const map = {Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6};
    const dow = map[w] ?? 0;
    return { h, m, dow };
  }

  function toMinutes(hhmm){
    if (!hhmm || typeof hhmm!=='string') return null;
    const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const h = Math.min(23, Math.max(0, parseInt(m[1],10)));
    const mm= Math.min(59, Math.max(0, parseInt(m[2],10)));
    return h*60 + mm;
  }

  // Chỉ bắn action khi vượt “rìa” (edge), tránh cưỡng chế liên tục
  let lastApplied = null; // 'on' | 'off' | null

  function applyDesired(desired){
    if (desired !== 'on' && desired !== 'off') return;
    if (lastApplied === desired) return; // không làm lại

    // Áp blackout LOCAL, không ghi DB
    setBlackout(desired === 'off');
    lastApplied = desired;
    log('applied by schedule =>', desired);
  }

  // ===== Core logic =====
  async function boot(){
    // Cần tableId – iPad chưa chọn bàn thì không chạy
    const table = LS.getStr('tableId', '').trim();
    if (!table) { warn('no tableId -> skip schedule'); return; }

    if (!window.firebase || !firebase.apps?.length){
      warn('Firebase not ready -> schedule skip');
      return;
    }
    // Anonymous auth (nếu chưa)
    if (!firebase.auth().currentUser) {
      await firebase.auth().signInAnonymously().catch(()=>{});
      await new Promise(r=>{
        const un = firebase.auth().onAuthStateChanged(u=>{ if(u){ un(); r(); }});
      });
    }
    const db = firebase.database();

    // Subscribe các nguồn điều khiển:
    // 1) Lịch chung: control/schedule
    // 2) Per-table override: control/tables/<table>/override {screen:'on'|'off', until}
    // 3) Per-table screen “tay”: control/tables/<table>/screen ('on'|'off') – ưu tiên hơn lịch
    let schedule = null;
    let tableOverride = null;
    let tableScreen = null;

    function recompute(){
      // Ưu tiên 1: manual override local (iPad)
      const localOverride = getManualOverride();
      if (localOverride && (localOverride.value==='on' || localOverride.value==='off')){
        applyDesired(localOverride.value);
        return;
      }

      // Ưu tiên 2: override từ Admin cho bàn (Firebase)
      if (tableOverride && typeof tableOverride==='object'){
        const until = Number(tableOverride.until||0);
        if (!until || until > Date.now()){
          const v = String(tableOverride.screen||'').toLowerCase();
          if (v==='on' || v==='off'){ applyDesired(v); return; }
        }
      }

      // Ưu tiên 3: per-table screen tay ('on'|'off') – nếu có, coi như trạng thái mong muốn hiện tại
      if (tableScreen){
        const v = String(tableScreen).toLowerCase();
        if (v==='on' || v==='off'){ applyDesired(v); return; }
      }

      // Cuối cùng: theo lịch chung
      if (!schedule || schedule.enabled === false){ /* không bật lịch */ return; }
      const tz   = schedule.tz || schedule.timezone || 'Asia/Tokyo';
      const week = schedule.week || schedule.days || {};
      const today = nowHMInTZ(tz);
      const pairs = week[String(today.dow)] || [];

      if (!Array.isArray(pairs) || !pairs.length) return;

      const nowMin = today.h*60 + today.m;
      // Nếu có nhiều cặp, ta tìm trong đó xem hiện tại nằm trong khoảng nào
      let desired = null; // 'on'|'off'
      for (const p of pairs){
        const onMin  = toMinutes(p.on);
        const offMin = toMinutes(p.off);
        if (onMin==null || offMin==null) continue;

        // Hỗ trợ cả case off < on (qua đêm)
        if (onMin <= offMin){
          if (nowMin >= onMin && nowMin < offMin) desired = 'on';
        } else {
          // qua ngày: [on..24h) ∪ [0..off)
          if (nowMin >= onMin || nowMin < offMin) desired = 'on';
        }
      }
      if (!desired) desired = 'off';

      applyDesired(desired);
    }

    // Lắng nghe các path
    db.ref('control/schedule').on('value', s=>{ schedule = s.val()||null; recompute(); });
    db.ref(`control/tables/${table}/override`).on('value', s=>{ tableOverride = s.val()||null; recompute(); });
    db.ref(`control/tables/${table}/screen`).on('value', s=>{
      const v = s.val();
      // cho phép null/undefined nghĩa là "không cưỡng chế tay"
      tableScreen = (v===undefined || v===null) ? null : v;
      recompute();
    });

    // Tick mỗi 30s để bắt kịp rìa thời gian (không cưỡng chế liên tục)
    setInterval(()=> recompute(), 30000);

    log('runner ready for table', table);
  }

  if (document.readyState==='loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
