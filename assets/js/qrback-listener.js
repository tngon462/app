// /assets/js/qrback-listener.js
(function () {
  'use strict';
  const log  = (...a)=> console.log('[qrback]', ...a);
  const warn = (...a)=> console.warn('[qrback]', ...a);

  // --- Helpers ---
  function getLS(key, def=null){ try{ const v=localStorage.getItem(key); return v ?? def; }catch(_){ return def; } }
  function setLS(key, val){ try{ localStorage.setItem(key, val); }catch(_){} }

  const deviceId = getLS('deviceId');
  log('QRback listener ready.', { deviceId });

  if (!window.firebase || !firebase.apps?.length){
    return warn('Firebase chưa init -> bỏ qua listener.');
  }
  const db = firebase.database();

  // Tháo/gắn listener theo table
  let currentTable = null;
  let offFns = []; // giữ các hàm off() để tháo listener nhanh

  function offAll() {
    offFns.forEach(fn => { try{ fn(); }catch(_){} });
    offFns = [];
  }

  // Chuẩn hóa trigger → quay về start
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

  // Gắn listener cho 1 table cụ thể
  function attachForTable(table){
    if (!table){
      warn('Chưa có table => chưa gắn listener.');
      return;
    }
    if (table === currentTable){
      return; // không đổi
    }
    // đổi bàn → tháo cũ rồi gắn mới
    offAll();
    currentTable = table;
    log('device table =', table);

    // 1) signals/<table>
    const refSig = db.ref('signals/'+table);
    const onSig = refSig.on('value', s=>{
      const v = s.val();
      if (!v) return;
      // ví dụ: {status:'expired', ts:...}
      // bạn có thể thêm các trạng thái khác nếu cần
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

    // 3) broadcast/qrbackAt (toàn hệ thống)
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

  // --- Nguồn dữ liệu bàn ---
  // A) localStorage: tableId
  function readTableFromLS(){
    return getLS('tableId') || null;
  }

  // B) DB: devices/<deviceId>/table (để tránh lệ thuộc vào thời điểm localStorage được set)
  let offDeviceTable = null;
  function watchDeviceTable(){
    if (!deviceId) return;
    const ref = db.ref('devices/'+deviceId+'/table');
    const cb = ref.on('value', s=>{
      const t = s.val() ? String(s.val()) : null;
      if (t && t !== getLS('tableId')) setLS('tableId', t); // đồng bộ về LS
      attachForTable(t || readTableFromLS());
    }, e=> warn('watchDeviceTable error:', e?.message||e));
    offDeviceTable = ()=> ref.off('value', cb);
  }

  // --- Bootstrap ---
  // 1) gắn theo LS ngay nếu có
  attachForTable(readTableFromLS());

  // 2) nghe thay đổi LS (trong cùng tab: nghe events nội bộ)
  window.addEventListener('storage', (e)=>{
    if (e.key === 'tableId'){
      attachForTable(e.newValue || null);
    }
  });
  // ngoài ra, nếu app tự set localStorage trong cùng tab, hãy gọi lại attachForTable(getLS('tableId'))

  // 3) nghe DB devices/<id>/table để cập nhật chắc chắn
  watchDeviceTable();

  log('QRback listener active.');
})();
