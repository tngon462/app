// assets/js/schedule-runner.js
// T-NGON | Blackout schedule runner (edge-triggered)
// - Local time của iPad
// - Ưu tiên thủ công: chỉ bắn 1 lần tại biên, không “giành quyền” giữa biên
// - Có ensureAuth() để chắc chắn subscribe Firebase
// - Log chi tiết để debug tick

(function(){
  'use strict';

  const NS   = '[tngon] [schedule]';
  const log  = (...a)=> console.log(NS, ...a);
  const warn = (...a)=> console.warn(NS, ...a);
  const LS   = window.localStorage;

  // ===== Guards =====
  if (!window.firebase || !firebase.apps?.length){
    console.error(NS, 'Firebase chưa init. Hãy load firebase-app/auth/database TRƯỚC runner.');
    return;
  }
  const db = firebase.database();

  // ===== Auth ẩn danh (bắt buộc trước khi .on) =====
  async function ensureAuth(){
    try{
      if (firebase.auth().currentUser) return firebase.auth().currentUser;
      await firebase.auth().signInAnonymously();
      await new Promise(res=>{
        const un = firebase.auth().onAuthStateChanged(u=>{ if(u){ un(); res(); }});
      });
      return firebase.auth().currentUser;
    }catch(e){
      console.error(NS, 'ensureAuth error:', e?.message||e);
      throw e;
    }
  }

  // ===== Helpers (local time) =====
  const pad2 = n => (n<10?'0':'')+n;
  const now  = () => new Date();
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
        // tắt cùng ngày: [off, on)
        if (mNow >= offM && mNow < onM) return 'off';
      } else {
        // tắt qua đêm: [off, 24h) ∪ [0, on)
        if (mNow >= offM || mNow < onM) return 'off';
      }
    }
    return 'on';
  }

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

  // ===== Persisted caches =====
  let cfg = null;
  let lastTickState = LS.getItem('sch:lastTickState') || null; // 'on'|'off'|null
  let lastEdgeKey   = LS.getItem('sch:lastEdgeKey')   || '';   // minuteKey
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

  // ===== Tick (15s) =====
  function tick(){
    try{
      const d = now();
      const k = minuteKey(d);
      const tstr = `${d.toTimeString().slice(0,8)} #${k}`;

      if (!cfg){
        log('tick', tstr, 'no config -> idle');
        return;
      }
      if (!cfg.enabled){
        log('tick', tstr, 'enabled=false -> idle');
        return;
      }

      const cur = stateBySchedule(cfg); // 'on' | 'off'
      log('tick', tstr, 'cur=', cur, 'lastTick=', lastTickState, 'edgeKey=', lastEdgeKey);

      // 1) Áp dụng ngay → bắn đúng 1 lần
      const applyNowAt = Number(cfg.applyNowAt||0);
      if (applyNowAt && applyNowAt > lastApplyNow){
        log('applyNowAt detected → fire once:', cur);
        applyBlackout(cur);
        setLastTick(cur);
        setEdgeKey(k);
        markAppliedNow(applyNowAt);
        return;
      }

      // 2) Edge detect
      if (lastTickState == null){
        // lần đầu: ghi nhận, không bắn
        setLastTick(cur);
        return;
      }

      if (cur !== lastTickState){
        if (lastEdgeKey !== k){
          log('boundary:', lastTickState, '→', cur, 'at', k);
          applyBlackout(cur);
          setEdgeKey(k);
        } else {
          // đã bắn trong phút này rồi
        }
      }

      setLastTick(cur);

    }catch(e){
      warn('tick error:', e?.message||e);
    }
  }

  // ===== Public debug helper =====
  window.__schDebug = async function(){
    const snap = await firebase.database().ref('control/schedule').get();
    console.log(NS, '__schDebug cfg =', snap.val());
    const d = now();
    console.log(NS, '__schDebug now =', d.toString(), 'dow=', d.getDay(), 'hm=', pad2(d.getHours())+':'+pad2(d.getMinutes()));
    const cur = stateBySchedule(snap.val());
    console.log(NS, '__schDebug stateBySchedule =', cur);
    console.log(NS, '__schDebug caches:', { lastTickState, lastEdgeKey, lastApplyNow });
  };

  // ===== Boot =====
  (async ()=>{
    try{
      await ensureAuth();

      // Subscribe config
      db.ref('control/schedule').on('value', s=>{
        cfg = s.val() || null;
        log('config updated', cfg);
      });

      log('runner boot');
      tick();                       // chạy ngay 1 lần
      setInterval(tick, 15000);     // 15s tick
      document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) tick(); });

    }catch(e){
      console.error(NS, 'boot error:', e?.message||e);
    }
  })();

})();
