/* T-NGON schedule runner (v4)
   - Singleton (không chạy trùng)
   - Tự tìm tableId qua devices/<deviceId>/table nếu localStorage chưa có
   - Gỡ/gắn listener khi đổi bàn
   - Chống rung khi apply on/off
   - Nguồn áp dụng (độ ưu tiên cao -> thấp):
       1) control/schedule/state           (global on/off – nút "ÁP DỤNG NGAY")
       2) control/schedule/config + local evaluator (tự tính theo múi giờ)
   - Không đụng tới công tắc tay theo bàn (control/tables/<table>/screen)
*/

(function(){
  if (window.__TNGON_SCHEDULE_INIT__) {
    console.log('[tngon] [schedule] already initialized');
    return;
  }
  window.__TNGON_SCHEDULE_INIT__ = true;

  const log  = (...a)=> console.log('[tngon] [schedule]', ...a);
  const warn = (...a)=> console.warn('[tngon] [schedule]', ...a);

  // ==== Helpers =============================================================
  function getLS(k, d=null){ try{ const v=localStorage.getItem(k); return v==null?d:v; }catch(_){ return d; } }
  function setLS(k, v){ try{ localStorage.setItem(k, v); }catch(_){ } }

  // Debounce apply
  let lastApplied = null;
  let applyTimer = null;
  function applyScreen(next /* 'on' | 'off' */, reason='') {
    if (next === lastApplied) return;
    clearTimeout(applyTimer);
    applyTimer = setTimeout(()=>{
      if (next === lastApplied) return;
      lastApplied = next;
      try {
        if (next === 'off') {
          window.blackoutOn?.();
        } else {
          window.blackoutOff?.();
        }
        log(`applied by ${reason} =>`, next);
      } catch(e) {
        warn('applyScreen error:', e?.message||e);
      }
    }, 600);
  }

  // Lấy Date theo timezone (Intl only; không phụ thuộc thư viện ngoài)
  function nowInTZ(tz){
    // Tạo "fake now" theo tz bằng cách parse chuỗi định dạng
    const d = new Date();
    try{
      // lấy các thành phần giờ/phút/weekday trong tz
      const fmt = new Intl.DateTimeFormat('en-GB', {
        timeZone: tz, hour12:false,
        year:'numeric', month:'2-digit', day:'2-digit',
        hour:'2-digit', minute:'2-digit', weekday:'short'
      });
      const parts = fmt.formatToParts(d).reduce((o,p)=> (o[p.type]=p.value, o), {});
      const hh = parseInt(parts.hour,10);
      const mm = parseInt(parts.minute,10);
      const wd = ['sun','mon','tue','wed','thu','fri','sat']; // map weekday
      // Intl weekday dạng 'Mon','Tue'..: chuyển về index
      const w = {'sun':0,'mon':1,'tue':2,'wed':3,'thu':4,'fri':5,'sat':6}[
        String(parts.weekday||'').slice(0,3).toLowerCase()
      ];
      return { hh, mm, w: (w ?? d.getUTCDay()) };
    }catch(_){
      // fallback: dùng local timezone
      return { hh:d.getHours(), mm:d.getMinutes(), w:d.getDay() };
    }
  }

  function parseHM(s){
    // "HH:MM" -> {hh,mm}
    if (!s || typeof s!=='string') return null;
    const m = s.match(/^(\d{1,2}):(\d{2})$/); if (!m) return null;
    let hh = Math.max(0, Math.min(23, parseInt(m[1],10)));
    let mm = Math.max(0, Math.min(59, parseInt(m[2],10)));
    return { hh, mm };
  }

  function inRange(nowHH, nowMM, offHM, onHM){
    // Khoảng tắt (off) -> bật (on). Có thể qua đêm.
    // Trả về true nếu "đang ở khoảng TẮT".
    if (!offHM || !onHM) return false;
    const now = nowHH*60 + nowMM;
    const off = offHM.hh*60 + offHM.mm;
    const on  = onHM.hh*60  + onHM.mm;
    if (off === on) return false; // khoảng rỗng
    if (off < on){
      // cùng ngày: [off, on)
      return now >= off && now < on;
    } else {
      // qua đêm: [off, 1440) U [0, on)
      return (now >= off) || (now < on);
    }
  }

  // ==== Firebase glue =======================================================
  let db = null;
  let deviceId = null;
  let tableId = null;

  let unsubs = [];
  function on(ref, evt, cb){ ref.on(evt, cb); unsubs.push(()=> ref.off(evt, cb)); }
  function resetListeners(){ unsubs.forEach(fn=> { try{ fn(); }catch{} }); unsubs = []; }

  function ensureFirebase(){
    if (!window.firebase || !firebase.apps?.length) return false;
    db = firebase.database();
    return true;
  }

  // ==== Schedule sources ====================================================
  // 1) Global state: control/schedule/state = 'on' | 'off' (ưu tiên cao nhất)
  let globalState = null;

  // 2) Config: control/schedule/config
  // {
  //   enabled: true,
  //   timezone: "Asia/Tokyo",
  //   days: {
  //     "0": [{off:"23:00", on:"07:00"}],   // CN
  //     "1": [...], ... "6": [...]
  //   }
  // }
  let schedConfig = null;

  function evalSchedule(){
    if (!schedConfig || schedConfig.enabled === false) return null;
    const tz = schedConfig.timezone || 'Asia/Tokyo';
    const { hh, mm, w } = nowInTZ(tz);
    const items = (schedConfig.days && schedConfig.days[String(w)]) || [];
    if (!Array.isArray(items) || !items.length) return null;

    // Nếu có nhiều cặp, chỉ cần 1 cặp khớp "đang tắt" là off
    for (const it of items){
      const offHM = parseHM(it?.off);
      const onHM  = parseHM(it?.on);
      if (inRange(hh, mm, offHM, onHM)) return 'off';
    }
    return 'on';
  }

  // Nguồn quyết định:
  function computeEffective(){
    // Ưu tiên global state (nút ÁP DỤNG NGAY)
    if (globalState === 'on' || globalState === 'off') return { val: globalState, reason:'apply-now' };
    // Nếu không có state tức thời, dùng cấu hình lịch
    const v = evalSchedule();
    if (v === 'on' || v === 'off') return { val: v, reason:'schedule' };
    return null;
  }

  // ==== Attach per table ====================================================
  let tickTimer = null;

  function attachForTable(tid){
    resetListeners();
    clearInterval(tickTimer);

    if (!ensureFirebase()){
      warn('Firebase not ready; runner idle');
      return;
    }
    tableId = tid ? String(tid) : null;
    if (tableId) setLS('tableId', tableId);

    log('runner ready for table', tableId || '(none)');

    // 1) Listen global apply-now
    const refState = db.ref('control/schedule/state');
    on(refState, 'value', s=>{
      const v = (s.val() || '').toString().toLowerCase();
      globalState = (v === 'on' || v === 'off') ? v : null;
      const eff = computeEffective();
      if (eff) applyScreen(eff.val, eff.reason);
    });

    // 2) Load config once + subscribe
    const refCfg = db.ref('control/schedule/config');
    on(refCfg, 'value', s=>{
      schedConfig = s.val() || null;
      const eff = computeEffective();
      if (eff) applyScreen(eff.val, eff.reason);
    });

    // 3) Tick 30s để re-evaluate theo đồng hồ (kể cả khi admin đóng)
    tickTimer = setInterval(()=>{
      const eff = computeEffective();
      if (eff) applyScreen(eff.val, eff.reason);
    }, 30 * 1000);
  }

  // ==== Bootstrap ===========================================================
  (async function boot(){
    // Khởi tạo deviceId
    deviceId = getLS('deviceId');
    if (!deviceId){
      // auto-generate như bên app
      const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{
        const r=Math.random()*16|0, v=c==='x'?r:(r&0x3|0x8); return v.toString(16);
      });
      deviceId = uuid;
      setLS('deviceId', deviceId);
    }

    let tid = getLS('tableId', null);

    // Nếu chưa có tableId: fallback đọc từ Firebase devices/<deviceId>/table
    if (!tid && ensureFirebase()){
      const ref = db.ref('devices/'+deviceId+'/table');
      on(ref, 'value', s=>{
        const t = s.val();
        if (t){
          tid = String(t);
          setLS('tableId', tid);
          attachForTable(tid);
        }
      });
    }

    // Nếu đã có tableId trong localStorage thì gắn luôn
    if (tid){
      attachForTable(tid);
    } else {
      // chưa biết bàn vẫn cho chạy tick theo config/global (runner global)
      attachForTable(null);
    }
  })();
})();
