// /assets/js/qrback-listener.js
(function () {
  'use strict';
  const log  = (...a)=> console.log('[qrback]', ...a);
  const warn = (...a)=> console.warn('[qrback]', ...a);

  const getLS = (k, d=null)=>{ try{ const v=localStorage.getItem(k); return v ?? d; }catch(_){ return d; } };
  const setLS = (k, v)=>{ try{ localStorage.setItem(k, v); }catch(_){} };

  if (!window.firebase || !firebase.apps?.length){
    return warn('Firebase chưa init -> bỏ qua QRback listener.');
  }
  const db = firebase.database();

  const deviceId = getLS('deviceId') || '';
  log('QRback listener ready.', { deviceId });

  let currentTable = null;
  let lastGoodTable = getLS('tableId') || null;
  let offFns = [];
  let attachTimer = null;

  // ===== anti-spam gotoStart =====
  let lastGotoStartAt = 0;
  const GOTO_START_COOLDOWN = 2000; // 2s

  function canGotoStart(){
    const now = Date.now();
    if (now - lastGotoStartAt < GOTO_START_COOLDOWN) return false;
    lastGotoStartAt = now;
    return true;
  }

  function offAll(){
    offFns.forEach(fn => { try{ fn(); }catch(_){} });
    offFns = [];
  }

  function triggerGotoStart(reason){
    const appState = getLS('appState');
    if (appState === 'start') return; // đã ở start → bỏ
    if (!canGotoStart()) return;

    log('triggerGotoStart', reason);
    try { setLS('appState', 'start'); } catch {}

    if (typeof window.gotoStart === 'function'){
      window.gotoStart(getLS('tableId') || lastGoodTable || currentTable);
    }
  }

  function _attachForTable(table){
    if (!table) return;
    if (table === currentTable) return;

    offAll();
    currentTable = table;
    lastGoodTable = table;
    setLS('tableId', table);

    log('device table =', table);

    // ===== 1) signals/<table> =====
    let sigReady = false;
    let sigLastStr = null;

    const refSig = db.ref('signals/'+table);
    const onSig = refSig.on('value', s=>{
      const v = s.val();
      if (!v) return;

      const curStr = JSON.stringify(v);
      if (!sigReady){
        sigReady = true;
        sigLastStr = curStr;
        return;
      }
      if (curStr === sigLastStr) return;
      sigLastStr = curStr;

      if (String(v.status||'').toLowerCase() === 'expired'){
        triggerGotoStart({ from:'signals', v });
      }
    });
    offFns.push(()=> refSig.off('value', onSig));

    // ===== 2) control/tables/<table>/qrbackAt =====
    let ctrlReady = false;
    let ctrlLast = null;

    const refCtrl = db.ref(`control/tables/${table}/qrbackAt`);
    const onCtrl = refCtrl.on('value', s=>{
      if (!s.exists()) return;
      const cur = s.val();

      if (!ctrlReady){
        ctrlReady = true;
        ctrlLast = cur;
        return;
      }
      if (cur === ctrlLast) return;
      ctrlLast = cur;

      triggerGotoStart({ from:'control', ts: cur });
    });
    offFns.push(()=> refCtrl.off('value', onCtrl));

    // ❌ BỎ broadcast/qrbackAt HOÀN TOÀN
    log('listen signals/'+table);
    log('listen control/tables/'+table+'/qrbackAt');
  }

  function attachForTableDebounced(table){
    if (!table) return;
    if (attachTimer) clearTimeout(attachTimer);
    attachTimer = setTimeout(()=> _attachForTable(table), 300);
  }

  // boot
  if (lastGoodTable) _attachForTable(lastGoodTable);

  window.addEventListener('storage', (e)=>{
    if (e.key === 'tableId'){
      const t = e.newValue || null;
      if (t) attachForTableDebounced(String(t));
    }
  });

  if (deviceId){
    const ref = db.ref('devices/'+deviceId+'/table');
    const cb = ref.on('value', s=>{
      const t = s.exists() && s.val() != null ? String(s.val()) : null;
      if (t){
        if (t !== getLS('tableId')) setLS('tableId', t);
        attachForTableDebounced(t);
      }
    });
    offFns.push(()=> ref.off('value', cb));
  }

  log('QRback listener active.');
})();
