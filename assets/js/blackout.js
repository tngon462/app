// assets/js/blackout.js (code-based screen control)
// Ưu tiên: global control/screen -> per-code control/codes/{CODE}/screen
(function(){
  'use strict';

  const LS = localStorage;
  let db = null;

  // ===== Overlay đen =====
  let overlay = null;
  function ensureOverlay(){
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'tn-blackout';
    overlay.style.cssText = `
      position:fixed; inset:0; z-index:9999;
      background:#000; opacity:1; display:none;
      touch-action:none;`;
    document.body.appendChild(overlay);
    return overlay;
  }
  function showBlack(){ ensureOverlay().style.display = 'block'; }
  function hideBlack(){ ensureOverlay().style.display = 'none'; }

  // ===== Firebase guard =====
  function getDb(){
    if (!window.firebase || !firebase.apps?.length) return null;
    return firebase.database();
  }

  // ===== Subscribe logic =====
  let unSubGlobal = null;
  let unSubCode   = null;
  let currentCode = null;
  let globalState = 'on';   // 'on' | 'off'
  let codeState   = null;   // 'on' | 'off' | null

  function apply(){
    // Nếu global off hoặc code off => đen
    const off = (String(globalState||'on') === 'off') || (String(codeState||'on') === 'off');
    if (off) showBlack(); else hideBlack();
  }

  function subGlobal(){
    if (!db) return;
    const ref = db.ref('control/screen');
    const cb = ref.on('value', s=>{
      globalState = s.exists() ? String(s.val()||'on') : 'on';
      apply();
    });
    unSubGlobal = ()=> ref.off('value', cb);
  }

  function subCode(code){
    if (unSubCode) { try{ unSubCode(); }catch(_){} unSubCode=null; }
    codeState = null;
    if (!db || !code) { apply(); return; }
    const ref = db.ref('control/codes/'+code+'/screen');
    const cb = ref.on('value', s=>{
      codeState = s.exists() ? String(s.val()||'on') : null; // null = không đặt riêng theo mã
      apply();
    });
    unSubCode = ()=> ref.off('value', cb);
  }

  function readCurrentCode(){
    return LS.getItem('deviceCode') || null;
  }

  // Khi đổi code (unbind/bind) từ device-bind → re-sub
  window.addEventListener('storage', (e)=>{
    if (e.key === 'deviceCode'){
      const newCode = readCurrentCode();
      if (newCode !== currentCode){
        currentCode = newCode;
        subCode(currentCode);
      }
    }
  });

  // ===== Boot =====
  document.addEventListener('DOMContentLoaded', ()=>{
    db = getDb();
    if (!db){ console.warn('[blackout] Firebase chưa sẵn sàng'); return; }

    // Global
    subGlobal();

    // Per-code
    currentCode = readCurrentCode();
    subCode(currentCode);
    apply(); // initial
  });
})();
