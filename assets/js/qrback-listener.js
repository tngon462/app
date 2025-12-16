// /assets/js/qrback-listener.js  (BASELINE by VALUE - KHÔNG DÙNG TS)
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

  function offAll(){
    offFns.forEach(fn => { try{ fn(); }catch(_){} });
    offFns = [];
  }

  function triggerGotoStart(reason){
    log('triggerGotoStart', reason);
    try { localStorage.setItem('appState', 'start'); } catch {}
    if (typeof window.gotoStart === 'function'){
      window.gotoStart(getLS('tableId') || lastGoodTable || currentTable);
    } else {
      location.reload();
    }
  }

  function _attachForTable(table){
    if (!table){
      warn('Bỏ qua attach vì table rỗng.');
      return;
    }
    if (table === currentTable) return;

    offAll();
    currentTable = table;
    lastGoodTable = table;
    setLS('tableId', table);

    log('device table =', table);

    // ===== 1) signals/<table> =====
    // Baseline: bỏ qua lần đầu. Sau đó: nếu status=expired và (value thay đổi) -> gotoStart
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
        return; // baseline snapshot
      }

      if (curStr === sigLastStr) return; // không đổi
      sigLastStr = curStr;

      if (String(v.status||'').toLowerCase() === 'expired'){
        triggerGotoStart({ from:'signals', v });
      }
    }, e=> warn('signals error:', e?.message||e));
    offFns.push(()=> refSig.off('value', onSig));

    // ===== 2) control/tables/<table>/qrbackAt =====
    // Baseline: bỏ qua lần đầu. Sau đó: nếu value đổi -> gotoStart
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

      triggerGotoStart({ from:'control/tables/qrbackAt', ts: cur });
    }, e=> warn('control/tables error:', e?.message||e));
    offFns.push(()=> refCtrl.off('value', onCtrl));

    // ===== 3) broadcast/qrbackAt =====
    let bcReady = false;
    let bcLast = null;

    const refBc = db.ref('broadcast/qrbackAt');
    const onBc = refBc.on('value', s=>{
      if (!s.exists()) return;
      const cur = s.val();

      if (!bcReady){
        bcReady = true;
        bcLast = cur;
        return;
      }
      if (cur === bcLast) return;
      bcLast = cur;

      triggerGotoStart({ from:'broadcast/qrbackAt', ts: cur, global:true });
    }, e=> warn('broadcast error:', e?.message||e));
    offFns.push(()=> refBc.off('value', onBc));

    log('listen signals/'+table);
    log('listen control/tables/'+table+'/qrbackAt');
    log('listen broadcast/qrbackAt');
  }

  function attachForTableDebounced(table){
    if (!table) return;
    if (attachTimer) clearTimeout(attachTimer);
    attachTimer = setTimeout(()=> _attachForTable(table), 400);
  }

  // boot theo LS
  if (lastGoodTable) _attachForTable(lastGoodTable);

  // đổi tableId từ tab khác
  window.addEventListener('storage', (e)=>{
    if (e.key === 'tableId'){
      const t = e.newValue || null;
      if (t) attachForTableDebounced(String(t));
    }
  });

  // theo DB: devices/<id>/table
  if (deviceId){
    const ref = db.ref('devices/'+deviceId+'/table');
    const cb = ref.on('value', s=>{
      const t = s.exists() && s.val() != null ? String(s.val()) : null;
      if (t){
        if (t !== getLS('tableId')) setLS('tableId', t);
        attachForTableDebounced(t);
      } else {
        warn('DB table=null (ignore)');
      }
    }, e=> warn('watchDeviceTable error:', e?.message||e));
    offFns.push(()=> ref.off('value', cb));
  }

  log('QRback listener active.');
})();
