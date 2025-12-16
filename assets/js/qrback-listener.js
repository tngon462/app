// /assets/js/qrback-listener.js
(function () {
  'use strict';
  const log  = (...a)=> console.log('[qrback]', ...a);
  const warn = (...a)=> console.warn('[qrback]', ...a);

  // ===== helpers =====
  const getLS = (k, d=null)=>{ try{ const v=localStorage.getItem(k); return v ?? d; }catch(_){ return d; } };
  const setLS = (k, v)=>{ try{ localStorage.setItem(k, v); }catch(_){} };

  if (!window.firebase || !firebase.apps?.length){
    return warn('Firebase chưa init -> bỏ qua QRback listener.');
  }
  const db = firebase.database();

  const deviceId = getLS('deviceId') || '';
  log('QRback listener ready.', { deviceId });

  // ===== state =====
  let currentTable = null;
  let lastGoodTable = getLS('tableId') || null;
  let offFns = [];
  let attachTimer = null;

  // 🔑 baseline guard
  let signalsBaselineReady = false;
  let ignoreSignalsBeforeTs = 0;

  function offAll(){
    offFns.forEach(fn => { try{ fn(); }catch(_){} });
    offFns = [];
  }

  function triggerGotoStart(reason){
    log('signals trigger', reason);
    try { localStorage.setItem('appState', 'start'); } catch {}
    if (typeof window.gotoStart === 'function'){
      log('→ gotoStart()');
      window.gotoStart(getLS('tableId') || lastGoodTable || currentTable);
    } else {
      log('→ reload fallback');
      location.reload();
    }
  }

  function _attachForTable(table){
    if (!table){
      warn('Bỏ qua attach vì table rỗng.');
      return;
    }
    if (table === currentTable){
      return;
    }

    offAll();

    currentTable = table;
    lastGoodTable = table;
    setLS('tableId', table);

    // 🔑 reset baseline mỗi lần đổi bàn
    signalsBaselineReady = false;
    ignoreSignalsBeforeTs = Date.now();

    log('device table =', table);

    // 1) signals/<table>
    const refSig = db.ref('signals/'+table);
    const onSig = refSig.on('value', s=>{
      const v = s.val();
      if (!v) return;

      // Lấy ts (chấp nhận giây hoặc ms)
      const tsMs =
        typeof v.ts === 'number'
          ? (v.ts < 2e10 ? v.ts * 1000 : v.ts)
          : 0;

      // ✅ Snapshot đầu tiên = baseline → bỏ qua
      if (!signalsBaselineReady){
        signalsBaselineReady = true;
        return;
      }

      // ✅ Bỏ qua expired cũ
      if (tsMs && tsMs <= ignoreSignalsBeforeTs){
        return;
      }

      if (String(v.status||'').toLowerCase()==='expired'){
        triggerGotoStart(v);
      }
    }, e=> warn('signals error:', e?.message||e));
    offFns.push(()=> refSig.off('value', onSig));

    // 2) control/tables/<table>/qrbackAt
    const refCtrl = db.ref(`control/tables/${table}/qrbackAt`);
    const onCtrl = refCtrl.on('value', s=>{
      if (!s.exists()) return;

      const tsMs = typeof s.val() === 'number'
        ? (s.val() < 2e10 ? s.val() * 1000 : s.val())
        : 0;

      if (tsMs && tsMs <= ignoreSignalsBeforeTs) return;

      triggerGotoStart({status:'expired', ts:s.val()});
    }, e=> warn('control/tables error:', e?.message||e));
    offFns.push(()=> refCtrl.off('value', onCtrl));

    // 3) broadcast/qrbackAt
    const refBc = db.ref('broadcast/qrbackAt');
    const onBc = refBc.on('value', s=>{
      if (!s.exists()) return;

      const tsMs = typeof s.val() === 'number'
        ? (s.val() < 2e10 ? s.val() * 1000 : s.val())
        : 0;

      if (tsMs && tsMs <= ignoreSignalsBeforeTs) return;

      triggerGotoStart({status:'expired', ts:s.val(), global:true});
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

  // ===== nguồn bàn =====
  if (lastGoodTable){
    _attachForTable(lastGoodTable);
  }

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
      } else {
        warn('DB table=null (ignore)');
      }
    }, e=> warn('watchDeviceTable error:', e?.message||e));
    offFns.push(()=> ref.off('value', cb));
  }

  log('QRback listener active.');
})();
