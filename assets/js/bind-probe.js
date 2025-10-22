<!-- /assets/js/bind-probe.js -->
<script>
(function(){
  'use strict';
  const log = (...a)=> console.log('[probe]', ...a);
  const warn= (...a)=> console.warn('[probe]', ...a);

  // tắt badge "Probe OK"
  const SHOW_BADGE = false;
  function badge(text, ok){
    if(!SHOW_BADGE) return;
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

  // Cổng đăng ký: chỉ heartbeat nếu có flag hoặc có mã đã lưu
  const BIND_FLAG_KEY = 'bindFlag';   // '1' khi user đã thử nhập mã
  function isRegistered(){
    try{
      return localStorage.getItem(BIND_FLAG_KEY)==='1' || !!localStorage.getItem('deviceCode');
    }catch(_){ return false; }
  }
  function setRegistered(v){
    try{
      if (v) localStorage.setItem(BIND_FLAG_KEY,'1');
      else   localStorage.removeItem(BIND_FLAG_KEY);
    }catch(_){}
  }

  if (!window.firebase){ console.error('[probe] firebase undefined'); badge('Firebase undefined', false); return; }
  if (!firebase.apps.length){ console.error('[probe] No app init'); badge('No app init', false); return; }

  async function ensureAuth(){
    if (firebase.auth().currentUser) return;
    await firebase.auth().signInAnonymously();
    await new Promise(r=>{ const un = firebase.auth().onAuthStateChanged(()=>{ un(); r(); }); });
  }

  function get(k, d=null){ try{ return localStorage.getItem(k) || d; }catch(_){ return d; } }

  async function heartbeat(){
    if (!isRegistered()) return; // ❗ KHÔNG ghi gì khi chưa có cờ đăng ký
    const db = firebase.database();
    const payload = {
      code:  get('deviceCode') || null,
      table: get('tableId')    || null,
      stage: get('appState')   || 'select',
      inPOS: (get('appState')==='pos'),
      lastSeen: firebase.database.ServerValue.TIMESTAMP,
    };
    await db.ref('devices/'+deviceId).update(payload);
    log('wrote devices/'+deviceId, payload);
    badge('Probe OK', true);
  }

  let hbTimer = null;
  function startHB(){
    if (hbTimer) return;
    hbTimer = setInterval(()=> heartbeat().catch(console.warn), 20000);
    // chạy ngay 1 nhịp nếu đã đăng ký
    heartbeat().catch(console.warn);
  }
  function stopHB(){
    if (hbTimer){ clearInterval(hbTimer); hbTimer=null; }
  }

  (async function boot(){
    try{
      log('deviceId =', deviceId, ' dbURL=', firebase.apps[0]?.options?.databaseURL);
      await ensureAuth();

      // Nếu chưa đăng ký thì chưa start heartbeat
      if (isRegistered()) startHB();

      // Lắng nghe thay đổi localStorage để bật/tắt HB đúng lúc
      window.addEventListener('storage', (e)=>{
        if (!e || !e.key) return;
        if ([BIND_FLAG_KEY,'deviceCode','tableId','appState'].includes(e.key)){
          if (isRegistered()) startHB(); else stopHB();
        }
      });

      // Theo dõi devices/<id>: nếu Admin xoá → tắt cờ và dừng HB (buộc nhập mã lại)
      const db = firebase.database();
      db.ref('devices/'+deviceId).on('value', snap=>{
        if (!snap.exists()){
          // Admin đã xóa
          try{
            localStorage.removeItem('deviceCode');
            localStorage.removeItem('tableId');
            localStorage.removeItem('appState');
            setRegistered(false); // tắt cờ -> không HB nữa
            badge('Removed by admin', false);
          }catch(_){}
          stopHB();
        }else{
          // tồn tại: nếu đã đăng ký thì đảm bảo HB đang chạy
          if (isRegistered()) startHB();
        }
      });

      // Khi quay lại tab, nếu đã đăng ký thì đập 1 nhịp
      document.addEventListener('visibilitychange', ()=>{
        if(!document.hidden && isRegistered()) heartbeat().catch(console.warn);
      });
    }catch(e){
      console.error('[probe] boot error', e); badge('Probe error', false);
    }
  })();
})();
</script>
