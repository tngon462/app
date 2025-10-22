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
  let currentTable = null;          // bàn đang gắn listener
  let lastGoodTable = getLS('tableId') || null;  // bàn hợp lệ cuối cùng
  let offFns = [];                  // hàm tháo listener hiện tại
  let attachTimer = null;           // debounce

  function offAll(){
    offFns.forEach(fn => { try{ fn(); }catch(_){} });
    offFns = [];
  }

  function triggerGotoStart(reason){
    log('signals trigger', reason);
    try { localStorage.setItem('appState', 'start'); } catch {}
    if (typeof window.gotoStart === 'function'){
      log('→ gotoStart()');
      window.gotoStart();
    } else {
      log('→ reload fallback');
      location.reload();
    }
  }

  function _attachForTable(table){
    // Gắn thật (không debounce). Chỉ gọi từ attachForTableDebounced.
    if (!table){
      warn('Bỏ qua attach vì table rỗng (giữ nguyên listener cũ).');
      return;
    }
    if (table === currentTable){
      return; // không đổi
    }
    offAll();
    currentTable = table;
    lastGoodTable = table;
    setLS('tableId', table);
    log('device table =', table);

    // 1) signals/<table>
    const refSig = db.ref('signals/'+table);
    const onSig = refSig.on('value', s=>{
      const v = s.val();
      if (!v) return;
      if (String(v.status||'').toLowerCase()==='expired'){
        triggerGotoStart(v);
      }
    }, e=> warn('signals error:', e?.message||e));
    offFns.push(()=> refSig.off('value', onSig));

    // 2) control/tables/<table>/qrbackAt
    const refCtrl = db.ref(`control/tables/${table}/qrbackAt`);
    const onCtrl = refCtrl.on('value', s=>{
      if (s.exists()){
        triggerGotoStart({status:'expired', ts:s.val()});
      }
    }, e=> warn('control/tables error:', e?.message||e));
    offFns.push(()=> refCtrl.off('value', onCtrl));

    // 3) broadcast/qrbackAt
    const refBc = db.ref('broadcast/qrbackAt');
    const onBc = refBc.on('value', s=>{
      if (s.exists()){
        triggerGotoStart({status:'expired', ts:s.val(), global:true});
      }
    }, e=> warn('broadcast error:', e?.message||e));
    offFns.push(()=> refBc.off('value', onBc));

    log('listen signals/'+table);
    log('listen control/tables/'+table+'/qrbackAt');
    log('listen broadcast/qrbackAt');
  }

  function attachForTableDebounced(table){
    // Debounce 400ms để tránh rung khi DB/LS nhấp nháy.
    if (!table){
      // không detach khi nhận null; cứ giữ nguyên currentTable
      return;
    }
    if (attachTimer) clearTimeout(attachTimer);
    attachTimer = setTimeout(()=> _attachForTable(table), 400);
  }

  // ===== nguồn bàn =====
  // A) localStorage ngay khi boot
  if (lastGoodTable){
    _attachForTable(lastGoodTable);
  }

  // B) thay đổi localStorage (khác tab)
  window.addEventListener('storage', (e)=>{
    if (e.key === 'tableId'){
      const t = e.newValue || null;
      if (t) attachForTableDebounced(String(t));
      // nếu t=null: bỏ qua (sticky)
    }
  });

  // C) DB: devices/<id>/table – KHÔNG xóa LS khi DB null
  if (deviceId){
    const ref = db.ref('devices/'+deviceId+'/table');
    const cb = ref.on('value', s=>{
      const t = s.exists() && s.val() != null ? String(s.val()) : null;
      if (t){
        if (t !== getLS('tableId')) setLS('tableId', t);
        attachForTableDebounced(t);
      } else {
        // DB báo null -> coi như nhiễu, giữ lastGoodTable, không tháo listener
        warn('DB table=null (ignore, keep current=', currentTable, ')');
      }
    }, e=> warn('watchDeviceTable error:', e?.message||e));
    offFns.push(()=> ref.off('value', cb));
  }

  log('QRback listener active.');
})();
