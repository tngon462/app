// assets/js/schedule-runner.js
// T-NGON | Edge-triggered blackout runner (only fire once at boundaries)

(function(){
  'use strict';
  const log = (...a)=> console.log('[schedule]', ...a);
  const LS  = window.localStorage;

  // ---- Guards ----
  if (!window.firebase || !firebase.apps?.length){
    console.error('[schedule] Firebase chưa init.');
    return;
  }
  const db = firebase.database();

  // ---- Helpers ----
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

  // Tính trạng thái theo lịch: 'off' (tắt màn) hoặc 'on' (mở màn)
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

  // ---- Fire máy tắt/mở (tùy app đang dùng API nào) ----
  function applyBlackout(state){
    if (state === 'off'){
      if (window.blackoutOn) window.blackoutOn();
      else if (window.blackout?.on) window.blackout.on();
    } else {
      if (window.blackoutOff) window.blackoutOff();
      else if (window.blackout?.off) window.blackout.off();
    }
    log('applied by schedule =>', state);
  }

  // ---- Edge-trigger logic (chỉ bắn 1 lần tại biên) ----
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
      // Đọc snapshot cấu hình mới nhất (đọc cache của listener)
      const cur = cfg;
      // Không bật lịch => không làm gì, reset marker để lần sau có biên sẽ bắn
      if (!cur || !cur.enabled){
        return;
      }

      const nowKey = minuteKey();
      const schedState = stateBySchedule(cur); // 'on' | 'off'

      // Nếu vừa "áp dụng ngay" (applyNowAt) và chưa xử lý lần này → bắn 1 lần rồi đánh dấu
      const applyNowAt = Number(cur.applyNowAt||0);
      if (applyNowAt && applyNowAt > lastApplyNow){
        applyBlackout(schedState);
        setEdge(schedState, nowKey); // coi như đã đứng tại biên hiện hành
        lastApplyNow = applyNowAt;
        try{ LS.setItem('sch:lastApplyNow', String(lastApplyNow)); }catch(_){}
        return;
      }

      // Edge-trigger: chỉ khi trạng thái theo lịch đổi so với biên đã lưu
      if (schedState !== lastEdgeState && lastEdgeKey !== nowKey){
        // Vừa bước vào khoảng mới -> bắn đúng 1 lần
        applyBlackout(schedState);
        setEdge(schedState, nowKey);
        return;
      }

      // Còn lại: im lặng, KHÔNG cưỡng ép lại (tôn trọng thao tác thủ công)
    }catch(e){
      console.warn('[schedule] tick error:', e?.message||e);
    }
  }

  // ---- Subscribe cấu hình ----
  db.ref('control/schedule').on('value', s=>{
    cfg = s.val() || null;
    log('config updated', cfg);
    // Không tự bắn khi chỉ đổi config; runner sẽ bắn ở lần tick khi tới biên,
    // trừ khi admin set applyNowAt (đã xử lý ở trên).
  });

  // ---- Start ticking: mỗi 60s, và khi tab quay lại foreground ----
  tick();
  setInterval(tick, 60000);
  document.addEventListener('visibilitychange', ()=>{ if (!document.hidden) tick(); });

  log('runner ready (edge-triggered)');
})();
