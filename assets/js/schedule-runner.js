// oke men assets/js/schedule-runner.js
// T-NGON | Edge-triggered blackout runner (fire once at boundaries)
// - Dùng local time của iPad
// - Ưu tiên thủ công (không can thiệp khi không có biên mới)
// - Chỉ bắn 1 lần tại mỗi phút biên (minuteKey)

(function(){
  'use strict';
  const NS  = '[tngon] [schedule]';
  const log = (...a)=> console.log(NS, ...a);
  const warn= (...a)=> console.warn(NS, ...a);
  const LS  = window.localStorage;

  // ==== Guards ====
  if (!window.firebase || !firebase.apps?.length){
    console.error(NS, 'Firebase chưa init.');
    return;
  }
  const db = firebase.database();

  // ==== Helpers (local time) ====
  const pad2 = n => (n<10?'0':'')+n;
  const now  = () => new Date(); // local time của thiết bị
  const minuteKey = (d=now()) =>
    d.getFullYear() + pad2(d.getMonth()+1) + pad2(d.getDate()) + pad2(d.getHours()) + pad2(d.getMinutes());

  function hmToMin(hm){
    const m = /^(\d{1,2}):(\d{2})$/.exec(hm||'');
    if (!m) return null;
    const h = +m[1], mm = +m[2];
    if (h>23 || mm>59) return null;
    return h*60 + mm;
  }
  const dowToday = ()=> now().getDay();
  const minNow   = ()=> now().getHours()*60 + now().getMinutes();

  // ==== Tính trạng thái theo lịch ('on' | 'off') ====
  function stateBySchedule(cfg){
    if (!cfg || !cfg.enabled) return 'on';
    const rules = Array.isArray(cfg.ranges) ? cfg.ranges : [];
    const dow = dowToday();
    const mNow = minNow();

    for (const r of rules){
      const days = (r.days||[]).map(Number);
      if (!days.includes(dow)) continue;

      const offM = hmToMin(r.off);
      const onM  = hmToMin(r.on);
      if (offM==null || onM==null) continue;

      if (offM < onM){
        // tắt trong cùng ngày: [off, on)
        if (mNow >= offM && mNow < onM) return 'off';
      } else {
        // tắt qua đêm: [off, 24h) ∪ [0, on)
        if (mNow >= offM || mNow < onM) return 'off';
      }
    }
    return 'on';
  }

  // ==== Gọi blackout ====
  function applyBlackout(state){
    try{
      if (state === 'off') {
        if (window.blackout?.on) window.blackout.on('schedule');
        else if (typeof window.blackoutOn === 'function') window.blackoutOn();
      } else {
        if (window.blackout?.off) window.blackout.off('schedule');
        else if (typeof window.blackoutOff === 'function') window.blackoutOff();
      }
      log('applied =>', state);
    }catch(e){
      warn('apply error:', e?.message||e);
    }
  }

  // ==== State caches (LS) ====
  // lastTickState: trạng thái lần tick trước ('on' | 'off')
  // lastEdgeKey  : minuteKey của lần đã bắn gần nhất (để không bắn lại trong cùng phút)
  // lastApplyNow : timestamp đã xử lý 'Áp dụng ngay'
  let cfg = null;
  let lastTickState = LS.getItem('sch:lastTickState') || null;
  let lastEdgeKey   = LS.getItem('sch:lastEdgeKey')   || '';
  let lastApplyNow  = Number(LS.getItem('sch:lastApplyNow') || 0);

  function setLastTick(state){
    lastTickState = state;
    try{ LS.setItem('sch:lastTickState', state||''); }catch(_){}
  }
  function setEdgeKey(key){
    lastEdgeKey = key || '';
    try{ LS.setItem('sch:lastEdgeKey', lastEdgeKey); }catch(_){}
  }
  function markAppliedNow(ts){
    lastApplyNow = Number(ts)||0;
    try{ LS.setItem('sch:lastApplyNow', String(lastApplyNow)); }catch(_){}
  }

  // ==== Tick (mỗi 15s) ====
  function tick(){
    try{
      if (!cfg || !cfg.enabled) return;

      const nowK = minuteKey();
      const cur  = stateBySchedule(cfg); // 'on' | 'off'

      // 1) Áp dụng ngay → bắn đúng 1 lần
      const applyNowAt = Number(cfg.applyNowAt||0);
      if (applyNowAt && applyNowAt > lastApplyNow){
        log('applyNowAt detected → fire once:', cur);
        applyBlackout(cur);
        setLastTick(cur);
        setEdgeKey(nowK);
        markAppliedNow(applyNowAt);
        return;
      }

      // 2) Edge detect: thay đổi so với tick trước → bắn 1 lần (và không lặp trong cùng phút)
      if (lastTickState == null) {
        // lần đầu: chỉ ghi nhận, không bắn (tôn trọng trạng thái hiện tại)
        setLastTick(cur);
        return;
      }

      if (cur !== lastTickState) {
        // có biên on↔off
        if (lastEdgeKey !== nowK) {
          log('boundary:', lastTickState, '→', cur, 'at', nowK);
          applyBlackout(cur);
          setEdgeKey(nowK);
        } else {
          // đã bắn trong phút này rồi → bỏ qua
        }
      }

      // 3) cập nhật tick state
      setLastTick(cur);

    } catch(e){
      warn('tick error:', e?.message||e);
    }
  }

  // ==== Subscribe cấu hình ====
  db.ref('control/schedule').on('value', s=>{
    cfg = s.val() || null;
    log('config updated', cfg);
  });

  // ==== Start ticking (15s) ====
  tick();                    // chạy sớm 1 lần
  setInterval(tick, 15000);  // 15 giây cho chắc nhịp
  document.addEventListener('visibilitychange', ()=>{ if (!document.hidden) tick(); });

  log('runner ready (edge-triggered, 15s tick)');
})();
