// assets/js/schedule-runner.js
// Hẹn giờ tự động bật/tắt blackout cho TNGON app.
// Ưu tiên: applyNow (trong hạn) > manual > schedule.

(function(){
  'use strict';
  const TAG = '[schedule]';
  const TICK_MS = 20000; // 20 giây/lần
  const db = (window.firebase && firebase.apps?.length) ? firebase.database() : null;
  if (!db) return console.warn(TAG, 'Firebase not ready');

  // --- Helpers ---
  function hmToMin(hm){ const m=/^(\d{1,2}):(\d{2})$/.exec(hm||''); if(!m)return null; return +m[1]*60 + +m[2]; }
  function inOffRange(now, off, on){ if(off==null||on==null||off===on)return false; if(off<on)return now>=off&&now<on; return now>=off||now<on; }
  function desiredBySchedule(s,now){ if(!s||s.enabled===false)return null; const r=Array.isArray(s.ranges)?s.ranges:[]; const d=now.getDay(), m=now.getHours()*60+now.getMinutes(); for(const x of r){ if(!(x.days||[0,1,2,3,4,5,6]).includes(d))continue; const off=hmToMin(x.off), on=hmToMin(x.on); if(inOffRange(m,off,on))return 'off'; } return 'on'; }

  async function tick(){
    const t = localStorage.getItem('tableId');
    if (!t) return;
    const [sSnap, tblSnap] = await Promise.all([
      db.ref('control/schedule').get(),
      db.ref('control/tables/'+t).get(),
    ]);
    const sched = sSnap.val()||{}, tbl=tblSnap.val()||{};
    const now = new Date();

    const bySched = desiredBySchedule(sched, now);
    const applyNowAt=+tbl.applyNowAt||0, applyNowFor=+tbl.applyNowFor||0;
    const inApplyNow = applyNowAt && applyNowFor && (Date.now()-applyNowAt < applyNowFor*1000);
    const manual = (tbl.manual==='on'||tbl.manual==='off')?tbl.manual:null;
    let desired=null;
    if(inApplyNow&&bySched) desired=bySched;
    else if(manual) desired=manual;
    else desired=bySched||'on';

    const key='lastApplied:'+t;
    const last=localStorage.getItem(key)||'on';
    if(desired!==last){
      if(typeof window.setBlackout==='function') window.setBlackout(desired==='off');
      localStorage.setItem(key,desired);
      db.ref('control/tables/'+t).update({
        lastApplied:desired,
        lastAppliedAt:firebase.database.ServerValue.TIMESTAMP
      }).catch(()=>{});
      console.log(TAG,'apply =>',desired,{inApplyNow,manual});
    }
  }

  function boot(){
    console.log(TAG,'runner ready');
    tick().catch(()=>{});
    setInterval(()=>tick().catch(()=>{}),TICK_MS);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick().catch(()=>{});});
    document.getElementById('pos-frame')?.addEventListener('load',()=>tick().catch(()=>{}));
    window.addEventListener('tngon:tableChanged',()=>tick().catch(()=>{}));
  }

  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',boot):boot();
})();
