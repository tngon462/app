// assets/js/home-listener.js
(function(){
  'use strict';
  const log = (...a)=> console.log('[home-listener]', ...a);

  function getDeviceId(){
    try {
      return localStorage.getItem('deviceId');
    } catch { return null; }
  }
  function gotoStartSafe(){
    try { localStorage.setItem('appState','start'); } catch {}
    if (typeof window.gotoStart === 'function') window.gotoStart();
    else location.reload();
  }

  function boot(){
    if (!window.firebase || !firebase.apps?.length) return;
    const db = firebase.database();
    const id = getDeviceId();
    if (!id) return;

    db.ref(`devices/${id}/commands/homeAt`).on('value', s=>{
      if (!s.exists()) return;
      log('Home command received → gotoStart()');
      gotoStartSafe();
      // dọn cờ để lần sau nhận tiếp
      setTimeout(()=> db.ref(`devices/${id}/commands/homeAt`).remove().catch(()=>{}), 500);
    });

    log('Listening homeAt for', id);
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
