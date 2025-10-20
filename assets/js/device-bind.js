// assets/js/device-bind.js
// T-NGON device bind (client iPad)
//
// - 1 mã <-> 1 máy (transaction ràng buộc)
// - Nhận lệnh admin:
//     * setTable  -> chỉ đổi bàn & link, đưa về Start (KHÔNG reload)
//     * reloadAt  -> chỉ reload 1 lần khi timestamp MỚI, quay về Start
//     * unbindAt  -> xóa mã & bàn, mở cổng nhập mã (KHÔNG reload)
// - Debounce reload/broadcast bằng last-seen timestamps trong localStorage
// - Không xóa tableId/tableUrl trừ khi unbind

(function(){
  'use strict';

  // ===== Singleton guard (avoid double listeners) =====
  if (window.__tngonBindActive) return;
  window.__tngonBindActive = true;

  const LS = window.localStorage;
  const $  = (id) => document.getElementById(id);

  // Hooks from redirect-core (giữ nguyên file cũ)
  const gotoSelect = window.gotoSelect || function(){};
  const gotoStart  = window.gotoStart  || function(){};
  const gotoPos    = window.gotoPos    || function(){};

  // IDs/keys
  const LS_DEVICE_ID          = 'deviceId';
  const LS_DEVICE_CODE        = 'deviceCode';
  const LS_APP_STATE          = 'appState';     // 'select' | 'start' | 'pos'
  const LS_TABLE_ID           = 'tableId';
  const LS_TABLE_URL          = 'tableUrl';
  const LS_FORCE_START        = 'forceStartAfterReload';
  const LS_LAST_CMD_RELOAD_AT = 'lastCmdReloadAt';
  const LS_LAST_BROADCAST_AT  = 'lastBroadcastReloadAt';

  // Generate a device id if missing
  function uuidv4(){
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c=>{
      const r = Math.random()*16|0, v = (c==='x') ? r : (r&0x3|0x8);
      return v.toString(16);
    });
  }
  let deviceId = LS.getItem(LS_DEVICE_ID);
  if (!deviceId){ deviceId = uuidv4(); LS.setItem(LS_DEVICE_ID, deviceId); }

  // Firebase guard
  if (!window.firebase || !firebase.apps?.length) {
    console.error('[bind] Firebase chưa sẵn sàng. Hãy load firebase.js trước device-bind.js');
    return;
  }
  const db = firebase.database();

  // ===== links.json (để setTable cập nhật URL đúng) =====
  let LINKS_MAP = null;
  async function loadLinks(){
    try{
      const res = await fetch('./links.json?cb='+Date.now(), {cache:'no-store'});
      if (!res.ok) throw new Error('HTTP '+res.status);
      const data = await res.json();
      LINKS_MAP = data.links || data;
      if (!LINKS_MAP || typeof LINKS_MAP !== 'object') throw new Error('links.json invalid');
    }catch(e){
      console.warn('[bind] loadLinks fail:', e?.message||e);
      LINKS_MAP = null;
    }
  }

  // ===== Gate UI (nhập mã) =====
  function showCodeGate(message){
    if ($('code-gate')){
      const e = $('code-error');
      if (e && message) e.textContent = message;
      return;
    }
    const wrap = document.createElement('div');
    wrap.id = 'code-gate';
    wrap.style.cssText = 'position:fixed;inset:0;background:#fff;z-index:6000;';
    wrap.innerHTML = `
      <div class="w-full h-full flex items-center justify-center p-6">
        <div class="w-full max-w-sm bg-white border border-gray-200 rounded-2xl shadow p-6">
          <h1 class="text-2xl font-extrabold text-gray-900 mb-4 text-center">Nhập mã iPad</h1>
          <p class="text-sm text-gray-500 mb-4 text-center">Nhập mã được cấp để tiếp tục.</p>
          <input id="code-input" type="text" maxlength="20" placeholder="VD: A1B2C3"
                 class="w-full border rounded-lg px-4 py-3 text-center tracking-widest font-mono text-lg"
                 autocomplete="one-time-code" />
          <div id="code-error" class="text-red-600 text-sm mt-2 h-5 text-center"></div>
          <button id="code-submit"
            class="mt-4 w-full rounded-xl bg-blue-600 text-white font-bold py-3 hover:bg-blue-700 transition">
            XÁC NHẬN
          </button>
        </div>
      </div>`;
    document.body.appendChild(wrap);

    const btn = $('code-submit');
    const input = $('code-input');
    const err = $('code-error');
    function setBusy(b){ btn.disabled=b; btn.textContent = b?'Đang kiểm tra…':'XÁC NHẬN'; }

    async function submit(){
      const raw = (input.value||'').trim().toUpperCase();
      err.textContent = '';
      if (!raw) { err.textContent = 'Vui lòng nhập mã.'; return; }
      setBusy(true);
      try{
        await claimCode(raw);
        wrap.remove();
        afterBindEnter();
      }catch(e){
        err.textContent = e?.message || 'Mã không hợp lệ.';
      }finally{ setBusy(false); }
    }

    btn.addEventListener('click', submit);
    input.addEventListener('keydown', e=>{ if (e.key==='Enter') submit(); });
    setTimeout(()=> input?.focus(), 60);
    if (message){ err.textContent = message; }
  }

  // ===== Transaction bind mã <-> máy (1-1) =====
  async function claimCode(code){
    const ref = db.ref('codes/'+code);
    const result = await ref.transaction(cur=>{
      if (!cur) return cur;                       // không tồn tại -> fail
      if (cur.enabled === false) return;          // tắt -> fail
      if (cur.boundDeviceId && cur.boundDeviceId !== deviceId) return; // đã gắn máy khác -> fail
      return {
        ...cur,
        boundDeviceId: deviceId,
        boundAt: firebase.database.ServerValue.TIMESTAMP
      };
    });
    if (!result.committed) throw new Error('Mã không khả dụng hoặc đang dùng ở thiết bị khác.');

    await db.ref('devices/'+deviceId).update({
      code: code,
      lastSeen: firebase.database.ServerValue.TIMESTAMP
    });
    LS.setItem(LS_DEVICE_CODE, code);
  }

  // ===== Helpers: state & heartbeat =====
  function getAppState(){ return LS.getItem(LS_APP_STATE) || 'select'; }
  function getTable(){ return { id: LS.getItem(LS_TABLE_ID)||'', url: LS.getItem(LS_TABLE_URL)||'' }; }

  async function heartbeat(){
    const code = LS.getItem(LS_DEVICE_CODE) || null;
    const state = getAppState(); // 'select' | 'start' | 'pos'
    const {id} = getTable();
    const inPOS = (state === 'pos');
    await db.ref('devices/'+deviceId).update({
      code:  code || null,
      table: id   || null,
      stage: state,
      inPOS: inPOS,
      lastSeen: firebase.database.ServerValue.TIMESTAMP
      // name: giữ nguyên để admin sửa tay
    });
  }

  // ===== Debounced reload helpers =====
  function shouldProcessNewTimestamp(lsKey, ts){
    const last = Number(LS.getItem(lsKey) || 0);
    const cur  = Number(ts || 0);
    if (!cur) return false;
    if (cur <= last) return false;
    LS.setItem(lsKey, String(cur));
    return true;
  }

  function reloadToStart(){
    // Không xóa table; chỉ đánh dấu để sau reload quay về Start
    LS.setItem(LS_FORCE_START, '1');
    location.reload();
  }

  // ===== Listen admin commands =====
  function listenCommands(){
    const cmdRef = db.ref('devices/'+deviceId+'/commands');
    cmdRef.on('value', (snap)=>{
      const c = snap.val() || {};

      // reloadAt: chỉ nếu timestamp mới
      if (c.reloadAt && shouldProcessNewTimestamp(LS_LAST_CMD_RELOAD_AT, c.reloadAt)){
        reloadToStart();
        return;
      }

      // setTable: KHÔNG reload — chỉ đổi bàn & link rồi gotoStart
      if (c.setTable && c.setTable.value){
        const table = String(c.setTable.value);
        let url = LS.getItem(LS_TABLE_URL) || '';
        if (LINKS_MAP && LINKS_MAP[table]) url = LINKS_MAP[table];

        if (table) LS.setItem(LS_TABLE_ID, table);
        if (url)   LS.setItem(LS_TABLE_URL, url);

        try{ gotoStart(); }catch(_){}
        db.ref('devices/'+deviceId).update({ table: table || null, stage: 'start' });
        // dọn lệnh để lần sau vẫn chạy
        cmdRef.child('setTable').remove().catch(()=>{});
      }

      // unbindAt: về gate, xóa code & bàn (KHÔNG reload)
      if (c.unbindAt){
        LS.removeItem(LS_DEVICE_CODE);
        LS.removeItem(LS_TABLE_ID);
        LS.removeItem(LS_TABLE_URL);
        LS.removeItem(LS_APP_STATE);
        LS.removeItem(LS_FORCE_START);
        db.ref('devices/'+deviceId).update({ code:null, table:null, stage:'select', inPOS:false });
        showCodeGate('Mã đã bị thu hồi. Vui lòng nhập mã khác.');
      }
    });

    // Broadcast reload toàn quán — cũng debounce
    db.ref('broadcast/reloadAt').on('value', s=>{
      const ts = s.val();
      if (ts && shouldProcessNewTimestamp(LS_LAST_BROADCAST_AT, ts)){
        reloadToStart();
      }
    });
  }

  // ===== Theo dõi code: tắt/xóa/chuyển máy khác => mở gate =====
  let codeWatcherOff = null;
  function watchCode(code){
    if (codeWatcherOff){ codeWatcherOff(); codeWatcherOff = null; }
    const ref = db.ref('codes/'+code);
    const cb = ref.on('value', snap=>{
      const v = snap.val();
      if (!v){
        // xóa mã
        LS.removeItem(LS_DEVICE_CODE);
        showCodeGate('Mã đã bị xóa. Vui lòng nhập mã khác.');
        return;
      }
      if (v.enabled === false){
        LS.removeItem(LS_DEVICE_CODE);
        showCodeGate('Mã đã bị tắt. Vui lòng nhập mã khác.');
        return;
      }
      if (v.boundDeviceId && v.boundDeviceId !== deviceId){
        LS.removeItem(LS_DEVICE_CODE);
        showCodeGate('Mã đã được sử dụng ở thiết bị khác.');
        return;
      }
    });
    codeWatcherOff = ()=> ref.off('value', cb);
  }

  // ===== After bind → vào app & bắt đầu nghe lệnh =====
  function afterBindEnter(){
    // Nếu vừa reload vì reloadAt/broadcast → quay lại Start (nếu có bàn)
    if (LS.getItem(LS_FORCE_START) === '1'){
      LS.removeItem(LS_FORCE_START);
      try{ gotoStart(); }catch(_){}
    }
    heartbeat().catch(()=>{});
    listenCommands();
  }

  // ===== Boot =====
  document.addEventListener('DOMContentLoaded', async ()=>{
    console.log('[bind] boot deviceId=', deviceId, ' deviceCode=', LS.getItem(LS_DEVICE_CODE) || '(none)');

    await loadLinks().catch(()=>{});

    const code = LS.getItem(LS_DEVICE_CODE);
    if (!code){
      showCodeGate();
    }else{
      try{
        const ref  = db.ref('codes/'+code);
        const snap = await ref.once('value');
        const v    = snap.val();
        if (!v) throw new Error('Mã không tồn tại.');
        if (v.enabled === false) throw new Error('Mã đã bị tắt.');
        if (v.boundDeviceId && v.boundDeviceId !== deviceId) throw new Error('Mã đã gắn thiết bị khác.');

        // nếu chưa bound -> bind ngay (idempotent)
        if (!v.boundDeviceId){
          const { committed } = await ref.transaction(cur=>{
            if (!cur) return cur;
            if (cur.enabled === false) return;
            if (cur.boundDeviceId && cur.boundDeviceId !== deviceId) return;
            return {
              ...cur,
              boundDeviceId: deviceId,
              boundAt: firebase.database.ServerValue.TIMESTAMP
            };
          });
          if (!committed) throw new Error('Mã không khả dụng.');
          await db.ref('devices/'+deviceId).update({
            code: code,
            lastSeen: firebase.database.ServerValue.TIMESTAMP
          });
        }

        watchCode(code);
        afterBindEnter();
      }catch(e){
        console.warn('[bind] Code invalid at boot:', e?.message||e);
        LS.removeItem(LS_DEVICE_CODE);
        showCodeGate(e?.message || 'Vui lòng nhập mã.');
      }
    }

    // Heartbeat định kỳ + khi tab active lại
    setInterval(()=> heartbeat().catch(()=>{}), 20000);
    document.addEventListener('visibilitychange', ()=> { if (!document.hidden) heartbeat().catch(()=>{}); });

    // Khi redirect-core đổi state/bàn → cập nhật về admin
    window.addEventListener('storage', (e)=>{
      if (e.key === LS_APP_STATE || e.key === LS_TABLE_ID) {
        heartbeat().catch(()=>{});
      }
    });
  });
})();
