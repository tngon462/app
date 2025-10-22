(function(){
  'use strict';

  // badge nhỏ dưới góc để biết đã ping OK
  function badge(text, ok){
    let el = document.getElementById('probe-badge');
    if(!el){
      el = document.createElement('div');
      el.id = 'probe-badge';
      el.style.cssText = 'position:fixed;right:8px;bottom:8px;z-index:9999;padding:6px 10px;border-radius:8px;font:12px system-ui;color:#fff;background:#ef4444;opacity:.9';
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.style.background = ok ? '#10b981' : '#ef4444';
  }

  function uuidv4(){return'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0,v=c==='x'?r:(r&0x3|0x8);return v.toString(16);});}
  let deviceId = null;
  try{ deviceId = localStorage.getItem('deviceId') || (localStorage.setItem('deviceId', uuidv4()), localStorage.getItem('deviceId')); }
  catch(_){ deviceId = 'unknown-'+Math.random().toString(16).slice(2); }

  if (!window.firebase){ console.error('[probe] firebase undefined'); badge('Firebase undefined', false); return; }
  if (!firebase.apps.length){ console.error('[probe] No app init'); badge('No app init', false); return; }

  async function ensureAuth(){
    if (firebase.auth().currentUser) return;
    await firebase.auth().signInAnonymously();
    await new Promise(r=>{ const un = firebase.auth().onAuthStateChanged(()=>{ un(); r(); }); });
  }

  function get(k, d=null){ try{ return localStorage.getItem(k) || d; }catch(_){ return d; } }

  async function heartbeat(){
    const db = firebase.database();
    const payload = {
      code:  get('deviceCode'),
      table: get('tableId'),
      stage: get('appState') || 'select',
      inPOS: (get('appState')==='pos'),
      lastSeen: firebase.database.ServerValue.TIMESTAMP,
    };
    await db.ref('devices/'+deviceId).update(payload);
    console.log('[probe] wrote devices/'+deviceId, payload);
    badge('Probe OK', true);
  }

  (async function boot(){
    try{
      console.log('[probe] deviceId =', deviceId, ' dbURL=', firebase.apps[0]?.options?.databaseURL);
      await ensureAuth();
      await heartbeat();
      setInterval(()=> heartbeat().catch(console.warn), 20000);
      document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) heartbeat().catch(console.warn); });
      window.addEventListener('storage', (e)=>{ if(['appState','tableId','deviceCode'].includes(e.key||'')) heartbeat().catch(console.warn); });
    }catch(e){
      console.error('[probe] boot error', e); badge('Probe error', false);
    }
  })();
})();
