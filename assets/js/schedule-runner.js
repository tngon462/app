// assets/js/schedule-runner.js
// T-NGON | Edge-triggered blackout runner (only fire once at boundaries)
// Phối hợp hoàn toàn với blackout.js — ưu tiên thủ công, chỉ bắn 1 lần khi tới giờ

(function(){
  'use strict';
  const log = (...a)=> console.log('[tngon] [schedule]', ...a);
  const LS  = window.localStorage;

  // ==== Guards ====
  if (!window.firebase || !firebase.apps?.length){
    console.error('[tngon] [schedule] Firebase chưa init.');
    return;
  }
  const db = firebase.database();

  // ==== Helpers ====
  const pad2 = n => (n<10?'0':'')+n;
  const nowLocal = () => new Date(); // dùng local time của iPad
  const minuteKey = (d=nowLocal()) =>
    d.getFullYear()+pad2(d.getMonth()+1)+pad2(d.getDate())+pad2(d.getHours())+pad2(d.getMinutes());

  function hmToMin(hm){
    const m = /^(\d{1,2}):(\d{2})$/.exec(hm||'');
    if (!m) return null;
    const h=+m[1], mm=+m[2];
    if (h>23||mm>59) return null;
    return h*60+mm;
  }
  const todayDow = () => nowLocal().getDay();
  const nowMin   = () => nowLocal().getHours()*60 + nowLocal().getMinutes();

  // ==== Tính trạng thái theo lịch: 'off' (tắt màn) hoặc 'on' (mở màn) ====
  function stateBySchedule(cfg){
    if (!cfg || !cfg.enabled) return 'on';
    const rules = Array.isArray(cfg.ranges) ? cfg.ranges : [];
    const dow = todayDow();
    const mNow = nowMin();
    for (const r of rules){
      const days = (r.days||[]).map(Number);
      if (!days.includes(dow)) continue;
      const offM = hmToMin(r.off), onM = hmToMin(r.on);
      if (offM==null || onM==null) continue;

      if (offM < onM){
        // tắt trong cùng ngày: [off, on)
        if (mNow >= offM && mNow < onM) return 'off';
      } else {
        // tắt qua đêm: [off, 24h) U [0, on)
        if (mNow >= offM || mNow < onM) return 'off';
      }
    }
    return 'on';
  }

  // ==== Gọi blackout API (ưu tiên blackout.js, không dùng fallback) ====
  function applyBlackout(state){
    try{
      if (state === 'off'){
        if (window.blackout?.on) window.blackout.on('schedule');
        else if (typeof window.blackoutOn === 'function') window.blackoutOn();
      } else {
        if (window.blackout?.off) window.blackout.off('schedule');
        else if (typeof window.blackoutOff === 'function') window.blackoutOff();
      }
      log('applied by schedule =>', state);
    }catch(e){
      console.warn('[tngon] [schedule] apply error:', e);
    }
  }

  // ==== Edge-trigger logic (chỉ bắn 1 lần tại biên) ====
  let cfg = null;
  let lastEdgeState = LS.getItem('sch:lastEdgeState') || null;   // 'on' | 'off'
  let lastEdgeKey   = LS.getItem('sch:lastEdgeKey')   || '';     // YYYYMMDDHHMM
  let lastApplyNow  = Number(LS.getItem('sch:lastApplyNow')||0); // ts đã xử lý

  function setEdge(state, key){
    lastEdgeState = state;
    lastEdgeKey = key;
    try{
      LS.setItem('sch:lastEdgeState', state||'');
      LS.setItem('sch:lastEdgeKey', key||'');
    }catch(_){}
  }

  async function tick(){
    try{
      const cur = cfg;
      if (!cur || !cur.enabled){
        return; // Không có lịch hoặc đang tắt hẹn giờ
      }

      const nowKey = minuteKey();
      const schedState = stateBySchedule(cur); // 'on' | 'off'

      // Nếu vừa “Áp dụng ngay” → chỉ bắn 1 lần, không lặp
      const applyNowAt = Number(cur.applyNowAt||0);
      if (applyNowAt && applyNowAt > lastApplyNow){
        applyBlackout(schedState);
        setEdge(schedState, nowKey);
        lastApplyNow = applyNowAt;
        try{ LS.setItem('sch:lastApplyNow', String(lastApplyNow)); }catch(_){}
        return;
      }

      // Nếu trạng thái khác trước và chưa xử lý phút này → bắn 1 lần tại biên
      if (schedState !== lastEdgeState && lastEdgeKey !== nowKey){
        applyBlackout(schedState);
        setEdge(schedState, nowKey);
        return;
      }

      // Còn lại: im lặng → tôn trọng thao tác thủ công
    }catch(e){
      console.warn('[tngon] [schedule] tick error:', e?.message||e);
    }
  }

  // ==== Subscribe cấu hình từ Firebase ====
  db.ref('control/schedule').on('value', s=>{
    cfg = s.val() || null;
    log('config updated', cfg);
  });

  // ==== Tick định kỳ mỗi phút ====
  tick();
  setInterval(tick, 60000);
  document.addEventListener('visibilitychange', ()=>{ if (!document.hidden) tick(); });

  log('runner ready (edge-triggered, blackout integrated)');
})();
