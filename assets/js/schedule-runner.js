<script>
/**
 * T-NGON schedule-runner v5
 * - Ưu tiên THỦ CÔNG (admin tab Thiết bị) > Hẹn giờ > Mặc định
 * - Thủ công được lấy từ: control/tables/<table>/screen = 'on' | 'off' | 'auto'
 * - Thủ công sẽ được GIỮ NGUYÊN cho tới khi lịch hẹn giờ đảo trạng thái (boundary kế tiếp),
 *   lúc đó runner tự bỏ override để trả quyền lại cho lịch.
 * - Nếu admin đặt 'auto' hoặc xoá node → bỏ override ngay.
 * - "Áp dụng ngay" toàn hệ thống (control/schedule/state = 'on'/'off') VẪN là ưu tiên cao nhất.
 *
 * Cấu hình lịch:
 *   control/schedule/config = {
 *     tz: "Asia/Tokyo",   // optional, nếu thiếu dùng Asia/Tokyo
 *     days: {
 *       "0": [ {"off":"22:00","on":"07:00"} ],  // CN
 *       "1": [ {"off":"22:00","on":"07:00"} ],  // Thứ 2
 *       ...
 *       "6": [ {"off":"22:00","on":"07:00"} ]   // Thứ 7
 *     }
 *   }
 *
 * Lưu ý:
 * - Runner tự điều khiển blackout (#screen-overlay). Nếu anh đã có blackout.js thì vẫn OK.
 * - Tick mỗi 30s để theo dõi boundary lịch.
 */

(function(){
  'use strict';
  const NS = '[tngon][schedule]';

  // ==== DOM helpers ====
  function getOverlay(){
    let el = document.getElementById('screen-overlay');
    if (!el){
      el = document.createElement('div');
      el.id = 'screen-overlay';
      el.style.cssText = 'position:fixed;inset:0;background:#000;display:none;z-index:2000';
      document.body.appendChild(el);
    }
    return el;
  }
  function setOverlay(val){ // 'on' -> show content, 'off' -> blackout
    const ov = getOverlay();
    const showBlack = (String(val).toLowerCase()==='off');
    ov.style.display = showBlack ? 'block' : 'none';
    try { localStorage.setItem('screenApplied', showBlack?'off':'on'); } catch(e){}
    console.log(NS, 'applied =>', (showBlack?'off':'on'));
  }

  // ==== Time helpers (no external libs) ====
  function parseHHMM(s){
    // returns minutes since 00:00
    const m = String(s||'').match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const hh = Math.min(23, Math.max(0, parseInt(m[1],10)));
    const mm = Math.min(59, Math.max(0, parseInt(m[2],10)));
    return hh*60 + mm;
  }
  function getNowInTZ(tz){
    // build a "now" with tz offset using Intl
    try{
      const fmt = new Intl.DateTimeFormat('en-GB', {
        timeZone: tz || 'Asia/Tokyo',
        year:'numeric', month:'2-digit', day:'2-digit',
        hour:'2-digit', minute:'2-digit', second:'2-digit',
        hourCycle:'h23'
      });
      const parts = fmt.formatToParts(new Date());
      const obj = Object.fromEntries(parts.map(p=>[p.type,p.value]));
      // YYYY-MM-DD HH:MM:SS
      const iso = `${obj.year}-${obj.month}-${obj.day}T${obj.hour}:${obj.minute}:${obj.second}`;
      return new Date(iso.replace('T',' ') + 'Z'); // fake but enough for comparisons within day
    }catch(_){
      return new Date();
    }
  }
  function isOffNowByConfig(config){
    // config.days[weekday] = [ {off:'HH:MM',on:'HH:MM'}, ... ]
    // support wrap midnight intervals (off>on)
    const tz = config?.tz || config?.timeZone || 'Asia/Tokyo';
    const now = getNowInTZ(tz);
    const weekday = String((now.getUTCDay()+7)%7); // 0..6
    const today = (config?.days && config.days[weekday]) || [];
    if (!today.length) return { off:false, reason:'no-config' };

    // minutes from 00:00 in tz
    const fmt = new Intl.DateTimeFormat('en-GB',{ timeZone: tz, hour:'2-digit', minute:'2-digit', hourCycle:'h23' });
    const parts = fmt.formatToParts(new Date());
    const curMin = parseInt(parts.find(p=>p.type==='hour').value)*60 + parseInt(parts.find(p=>p.type==='minute').value);

    for (const win of today){
      const offM = parseHHMM(win?.off);
      const onM  = parseHHMM(win?.on);
      if (offM==null || onM==null) continue;

      if (offM < onM){
        // simple range: offM .. onM-1
        if (curMin >= offM && curMin < onM) return { off:true, reason:`schedule(${weekday})` };
      } else if (offM > onM){
        // wrap midnight: offM..1439 OR 0..onM-1
        if (curMin >= offM || curMin < onM) return { off:true, reason:`schedule-wrap(${weekday})` };
      } else {
        // off==on → whole day off
        return { off:true, reason:`schedule-all(${weekday})` };
      }
    }
    return { off:false, reason:'schedule' };
  }

  // ==== Firebase refs / state ====
  let db = null;
  let tableId = null;

  const state = {
    globalState: null,   // 'on' | 'off' | null
    cfg: null,           // schedule config
    tz: 'Asia/Tokyo',    // default
    manual: null,        // last manual from DB: 'on' | 'off' | 'auto' | null
    manualActive: false, // we are honoring manual override until next boundary
    manualVal: null,     // 'on' | 'off'
    lastScheduleVal: null, // 'on' | 'off' (for boundary detection)
    tickTimer: null
  };

  function readLocalManualFlag(){
    try{
      const k = `sch.manual.${tableId}`;
      const raw = localStorage.getItem(k);
      if (!raw) return null;
      return JSON.parse(raw);
    }catch(_){ return null; }
  }
  function writeLocalManualFlag(obj){
    try{
      const k = `sch.manual.${tableId}`;
      if (!obj) localStorage.removeItem(k);
      else localStorage.setItem(k, JSON.stringify(obj));
    }catch(_){}
  }

  async function ensureFirebase(){
    if (!window.firebase || !firebase.apps?.length) throw new Error('Firebase chưa init');
    if (!firebase.auth().currentUser){
      await firebase.auth().signInAnonymously();
      await new Promise(r=>{
        const un = firebase.auth().onAuthStateChanged(u=>{ if(u){ un(); r(); }});
      });
    }
    db = firebase.database();
  }

  function bindTableListeners(){
    // Unbind cũ
    if (!db || !tableId) return;
    const refManual = db.ref(`control/tables/${tableId}/screen`);
    refManual.on('value', s=>{
      const v = (s.exists() ? String(s.val()).toLowerCase() : 'auto');
      state.manual = (v==='on'||v==='off'||v==='auto') ? v : 'auto';

      if (state.manual==='on' || state.manual==='off'){
        // Bật chế độ override cho tới boundary lịch kế tiếp
        state.manualActive = true;
        state.manualVal = state.manual;
        writeLocalManualFlag({ active:true, val: state.manualVal });
        console.log(NS, `manual override = ${state.manualVal} (from control/tables/${tableId}/screen)`);
        applyNow('manual');
      } else {
        // 'auto' → bỏ override ngay
        state.manualActive = false;
        state.manualVal = null;
        writeLocalManualFlag(null);
        console.log(NS, 'manual cleared (auto)');
        applyNow('auto');
      }
    });
  }

  function bindGlobalListeners(){
    if (!db) return;
    db.ref('control/schedule/state').on('value', s=>{
      const v = s.exists() ? String(s.val()).toLowerCase() : null;
      state.globalState = (v==='on'||v==='off') ? v : null;
      applyNow('global');
    });
    db.ref('control/schedule/config').on('value', s=>{
      const v = s.val() || null;
      state.cfg = v;
      if (v?.tz || v?.timeZone) state.tz = v.tz || v.timeZone;
      applyNow('cfg');
    });
    db.ref('control/schedule/tz').on('value', s=>{
      const tz = s.exists()? String(s.val()) : null;
      if (tz) state.tz = tz;
      applyNow('tz');
    });
  }

  function loadPersistedManual(){
    const saved = readLocalManualFlag();
    if (saved && (saved.val==='on' || saved.val==='off')){
      state.manualActive = !!saved.active;
      state.manualVal = saved.val;
    }
  }

  // === Core priority logic ===
  function computeScheduleVal(){
    const cfg = state.cfg || {};
    const withTZ = { ...cfg, tz: (cfg?.tz || cfg?.timeZone || state.tz || 'Asia/Tokyo') };
    const res = isOffNowByConfig(withTZ);
    const want = res.off ? 'off' : 'on';
    return { want, reason: res.reason };
  }

  function applyNow(reason){
    // Priority 0: global immediate apply
    if (state.globalState==='on' || state.globalState==='off'){
      setOverlay(state.globalState);
      console.log(NS, `applied by GLOBAL (${reason}) =>`, state.globalState);
      return;
    }

    // Priority 1: manual override (until next boundary)
    if (state.manualActive && (state.manualVal==='on' || state.manualVal==='off')){
      // detect boundary flip
      const sc = computeScheduleVal();
      if (state.lastScheduleVal == null) state.lastScheduleVal = sc.want;
      // áp dụng manual
      setOverlay(state.manualVal);
      console.log(NS, `applied by MANUAL (${reason}) =>`, state.manualVal);

      // nếu lịch đảo trạng thái so với lần trước → bỏ override
      const nextSc = computeScheduleVal(); // recompute fresh
      if (nextSc.want !== state.lastScheduleVal){
        // boundary crossed → clear manual
        state.manualActive = false;
        state.manualVal = null;
        state.lastScheduleVal = nextSc.want;
        writeLocalManualFlag(null);
        console.log(NS, 'boundary reached → manual override cleared');
      }
      return;
    }

    // Priority 2: schedule
    const sc2 = computeScheduleVal();
    setOverlay(sc2.want);
    if (state.lastScheduleVal == null || state.lastScheduleVal !== sc2.want){
      console.log(NS, `applied by SCHEDULE (${reason}) =>`, sc2.want);
      state.lastScheduleVal = sc2.want;
    }
  }

  function startTicker(){
    if (state.tickTimer) clearInterval(state.tickTimer);
    state.tickTimer = setInterval(()=> applyNow('tick'), 30_000);
  }

  function init(){
    ensureFirebase().then(()=>{
      try{
        tableId = localStorage.getItem('tableId') || null;
      }catch(_){}
      loadPersistedManual();
      bindGlobalListeners();
      bindTableListeners();
      startTicker();
      // tick ngay
      setTimeout(()=> applyNow('boot'), 0);

      // nếu đổi bàn động → rebind
      window.addEventListener('storage', (e)=>{
        if ((e.key||'')==='tableId'){
          tableId = e.newValue || null;
          loadPersistedManual();
          bindTableListeners();
          applyNow('table-changed');
        }
      });

      console.log(NS, 'runner ready for table', tableId);
    }).catch(err=>{
      console.error(NS, 'init error', err);
    });
  }

  // Boot
  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init)
    : init();

})();
</script>
