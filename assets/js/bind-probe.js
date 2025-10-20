<script>
// assets/js/bind-probe.js
(function(){
  'use strict';

  // === tiny UI badge để biết có ping thành công chưa
  function badge(text, ok){
    let el = document.getElementById('probe-badge');
    if(!el){
      el = document.createElement('div');
      el.id = 'probe-badge';
      el.style.cssText = 'position:fixed;right:8px;bottom:8px;z-index:9999;padding:6px 10px;border-radius:8px;font:12px/1.2 system-ui, sans-serif;color:#fff;background:#ef4444;opacity:.9';
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.style.background = ok ? '#10b981' : '#ef4444';
  }

  // === deviceId cố định (localStorage)
  function uuidv4(){
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c=>{
      const r=Math.random()*16|0, v=c==='x'?r:(r&0x3|0x8); return v.toString(16);
    });
  }
  let deviceId = null;
  try{
    deviceId = localStorage.getItem('deviceId') || (localStorage.setItem('deviceId', uuidv4()), localStorage.getItem('deviceId'));
  }catch(_){ deviceId = 'unknown-device'; }
  const DEFAULT_NAME = 'iPad ' + deviceId.slice(0,4).toUpperCase();

  // === cần firebase đã init từ firebase.js
  if (!window.firebase){
    console.error('[probe] window.firebase = undefined');
    badge('Firebase = undefined', false);
    return;
  }

  function logEnv(){
    try{
      const app = firebase.apps[0];
      const opts = app?.options || {};
      console.log('[probe] app options:', opts);
      console.log('[probe] databaseURL:', opts.databaseURL);
    }catch(e){
      console.warn('[probe] cannot read app options:', e);
    }
  }

  async function ensureAuth(){
    if (firebase.auth().currentUser) return;
    await firebase.auth().signInAnonymously();
    await new Promise(r=>{
      const un = firebase.auth().onAuthStateChanged(()=>{ un(); r(); });
    });
  }

  async function ensureNameOnce(db){
    const nameRef = db.ref('devices/'+deviceId+'/name');
    const snap = await nameRef.once('value');
    if (!snap.exists() || !snap.val()){
      await nameRef.set(DEFAULT_NAME);
    }
  }

  function getStage(){
    try { return localStorage.getItem('appState') || 'select'; } catch(_) { return 'select'; }
  }
  function getTable(){
    try { return localStorage.getItem('tableId') || null; } catch(_) { return null; }
  }
  function getCode(){
    try { return localStorage.getItem('deviceCode') || null; } catch(_) { return null; }
  }

  async function heartbeat(){
    const db = firebase.database();
    await ensureNameOnce(db);

    const payload = {
      code: getCode(),
      table: getTable(),
      stage: getStage(),                 // 'select'|'start'|'pos'
      inPOS: getStage()==='pos',
      lastSeen: firebase.database.ServerValue.TIMESTAMP,
    };
    await db.ref('devices/'+deviceId).update(payload);
    console.log('[probe] wrote /devices/'+deviceId, payload);
    badge('Probe: OK', true);
  }

  (async function boot(){
    try{
      console.log('[probe] deviceId =', deviceId);
      logEnv();
      if (!firebase.apps.length){
        console.error('[probe] No firebase app initialized yet!');
        badge('No app init', false);
        return;
      }
      await ensureAuth();
      console.log('[probe] auth =', firebase.auth().currentUser?.uid || '(anon)');
      await heartbeat();
      setInterval(()=> heartbeat().catch(e=>console.warn('[probe] heartbeat fail', e)), 20000);
      document.addEventListener('visibilitychange', ()=> { if(!document.hidden) heartbeat().catch(()=>{}); });
      window.addEventListener('storage', (e)=> {
        if (['appState','tableId','tableUrl','deviceCode'].includes(e.key||'')) heartbeat().catch(()=>{});
      });
    }catch(e){
      console.error('[probe] boot error:', e);
      badge('Probe error', false);
    }
  })();

})();
</script>
