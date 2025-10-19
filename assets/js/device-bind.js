// assets/js/device-bind.js
// T-NGON device bind (client iPad)
// - 1 mã <-> 1 máy (transaction ràng buộc)
// - Nhận lệnh admin: setTable (-> Start Order), reload (-> Start Order), unbind (-> Gate)
// - Đồng bộ trạng thái về /devices/<deviceId>
// - Không thay đổi UI hiện có (redirect-core.js vẫn điều hướng như cũ)

(function(){
  'use strict';

  // ===== Helpers =====
  const LS = window.localStorage;
  const $  = (id) => document.getElementById(id);

  const WAIT = (ms)=> new Promise(r=> setTimeout(r, ms));
  function uuidv4(){
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c=>{
      const r = Math.random()*16|0, v=(c==='x')?r:(r&0x3|0x8); return v.toString(16);
    });
  }

  // Bắt buộc tồn tại 2 hàm từ redirect-core: gotoSelect/gotoStart (giữ nguyên file cũ của sếp)
  const gotoSelect = window.gotoSelect || function(){ location.reload(); };
  const gotoStart  = window.gotoStart  || function(){};
  const gotoPos    = window.gotoPos    || function(url){};

  // ===== Device identity =====
  let deviceId = LS.getItem('deviceId');
  if (!deviceId){ deviceId = uuidv4(); LS.setItem('deviceId', deviceId); }

  // ===== Firebase init guard =====
  if (!window.firebase || !firebase.apps?.length) {
    console.error('[bind] Firebase chưa sẵn sàng. Đảm bảo firebase.js đã load & init trước device-bind.js');
  }

  const db = firebase.database();

  // ===== Links map (để đổi bàn không reload) =====
  let linksMap = null;
  async function loadLinks(){
    try{
      const url = './links.json' + (/\?/.test('./links.json')?'&':'?') + 'cb=' + Date.now();
      const res = await fetch(url, { cache:'no-store' });
      if (!res.ok) throw new Error('HTTP '+res.status);
      const data = await res.json();
      linksMap = data.links || data;
      if (!linksMap || typeof linksMap !== 'object') throw new Error('links.json invalid');
    }catch(e){
      console.warn('[bind] Không tải được links.json, chức năng setTable vẫn hoạt động nếu redirect-core đã set sẵn url.');
      linksMap = null;
    }
  }

  // ===== Gate (nhập mã) đơn giản — không có nút Hủy =====
  function showCodeGate(message){
    if ($('code-gate')) {
      const e = $('code-error');
      if (e && message) e.textContent = message;
      return;
    }
    const wrap = document.createElement('div');
    wrap.id = 'code-gate';
    wrap.style.cssText = 'position:fixed;inset:0;z-index:6000;background:#fff;';
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
        // ok → gỡ gate và tiếp tục
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

  // ===== Transaction ràng buộc mã <-> thiết bị (1-1) =====
  async function claimCode(code){
    const ref = db.ref('codes/'+code);
    // Transaction: chỉ commit khi mã tồn tại, enabled==true và (chưa bound hoặc bound chính thiết bị này)
    const result = await ref.transaction(cur=>{
      if (!cur) return cur;                    // mã không tồn tại → không commit
      if (cur.enabled === false) return;       // tắt → fail
      if (cur.boundDeviceId && cur.boundDeviceId !== deviceId) return; // đang dùng máy khác → fail
      // ok → bind về thiết bị hiện tại
      return {
        ...cur,
        boundDeviceId: deviceId,
        boundAt: firebase.database.ServerValue.TIMESTAMP
      };
    });
    if (!result.committed) throw new Error('Mã không khả dụng hoặc đã được dùng ở thiết bị khác.');
    // Lưu devices side
    await db.ref('devices/'+deviceId).update({
      code: code,
      lastSeen: firebase.database.ServerValue.TIMESTAMP,
    });
    LS.setItem('deviceCode', code);
  }

  // ===== Đồng bộ name/table/stage về admin =====
  function getAppState(){
    return LS.getItem('appState') || 'select'; // redirect-core.js đặt 'select' | 'start' | 'pos'
  }
  function getCurrentTable(){
    return {
      id:  LS.getItem('tableId')  || '',
      url: LS.getItem('tableUrl') || ''
    };
  }
  async function heartbeat(){
    const code = LS.getItem('deviceCode') || null;
    const state = getAppState();              // 'select' | 'start' | 'pos'
    const {id:tableId} = getCurrentTable();
    // inPOS cho admin hiển thị +<bàn>
    const inPOS = (state === 'pos');
    await db.ref('devices/'+deviceId).update({
      code: code || null,
      table: tableId || null,
      stage: state,
      inPOS: inPOS,
      lastSeen: firebase.database.ServerValue.TIMESTAMP,
      // name: (giữ nguyên — admin chỉnh và lưu)
    });
  }

  // ===== Nhận lệnh từ admin =====
  function listenCommands(){
    const cmdRef = db.ref('devices/'+deviceId+'/commands');
    cmdRef.on('value', (snap)=>{
      const c = snap.val() || {};

      // 1) reloadAt → reload trang và sau reload quay về Start Order
      if (c.reloadAt) {
        try{
          LS.setItem('forceStartAfterReload', '1');
        }catch(_){}
        // không xoá lệnh để tránh miss; admin chỉ set timestamp tăng dần
        location.reload();
        return;
      }

      // 2) setTable.value → chỉ đổi số bàn & link, KHÔNG reload, đưa về Start Order
      if (c.setTable && c.setTable.value){
        const table = String(c.setTable.value);
        // lấy url tương ứng
        let url = '';
        const map = linksMap;
        if (map && table in map) url = map[table];
        // nếu chưa có map hoặc không tìm thấy, giữ nguyên url cũ (redirect-core vẫn có thể dùng tableUrl cũ)
        // cập nhật localStorage để redirect-core dùng đúng
        if (table) LS.setItem('tableId', table); else LS.removeItem('tableId');
        if (url)   LS.setItem('tableUrl', url); else LS.removeItem('tableUrl');

        // đẩy về màn Start Order (giữ UI cũ)
        try{ gotoStart(); }catch(_){}

        // cập nhật nhanh cho admin
        db.ref('devices/'+deviceId).update({ table: table || null });

        // dọn lệnh setTable (để lần sau có thể set cùng bàn vẫn chạy)
        cmdRef.child('setTable').remove().catch(()=>{});
      }

      // 3) unbindAt → xóa mã local, xóa bàn, về gate
      if (c.unbindAt){
        try{
          const code = LS.getItem('deviceCode');
          LS.removeItem('deviceCode');
          LS.removeItem('tableId'); LS.removeItem('tableUrl');
          LS.removeItem('appState');
          // dọn một số flag
          LS.removeItem('forceStartAfterReload');
          // dọn devices view cho gọn
          db.ref('devices/'+deviceId).update({ code:null, table:null, stage:'select', inPOS:false });
        }catch(_){}
        // không reload → hiện gate ngay (tránh vòng lặp)
        showCodeGate('Mã đã bị thu hồi. Vui lòng nhập mã khác.');
      }
    });

    // Broadcast reload toàn quán
    db.ref('broadcast/reloadAt').on('value', s=>{
      if (s.val()) {
        try{ LS.setItem('forceStartAfterReload', '1'); }catch(_){}
        location.reload();
      }
    });
  }

  // ===== Theo dõi mã: nếu bị tắt/xoá/đổi sang máy khác → về gate =====
  let codeWatcherOff = null;
  function watchCode(code){
    if (codeWatcherOff) { codeWatcherOff(); codeWatcherOff = null; }
    const ref = db.ref('codes/'+code);
    const cb = ref.on('value', (snap)=>{
      const v = snap.val();
      if (!v) {
        // mã bị xoá
        LS.removeItem('deviceCode');
        LS.removeItem('tableId'); LS.removeItem('tableUrl'); LS.removeItem('appState');
        showCodeGate('Mã đã bị xóa. Vui lòng nhập mã khác.');
        return;
      }
      if (v.enabled === false){
        LS.removeItem('deviceCode');
        LS.removeItem('tableId'); LS.removeItem('tableUrl'); LS.removeItem('appState');
        showCodeGate('Mã đã bị tắt. Vui lòng nhập mã khác.');
        return;
      }
      if (v.boundDeviceId && v.boundDeviceId !== deviceId){
        LS.removeItem('deviceCode');
        LS.removeItem('tableId'); LS.removeItem('tableUrl'); LS.removeItem('appState');
        showCodeGate('Mã đã được sử dụng ở thiết bị khác.');
        return;
      }
    });
    codeWatcherOff = ()=> ref.off('value', cb);
  }

  // ===== Sau khi bind xong → vào app bình thường =====
  function afterBindEnter(){
    // Nếu vừa reload vì admin reloadAt → quay lại Start Order
    if (LS.getItem('forceStartAfterReload') === '1'){
      LS.removeItem('forceStartAfterReload');
      // nếu chưa có bàn → vẫn sẽ về màn chọn bàn theo redirect-core
      try{ gotoStart(); }catch(_){}
    }
    // cập nhật ngay
    heartbeat().catch(()=>{});
    // bắt đầu nhận lệnh
    listenCommands();
  }

  // ===== Boot =====
  document.addEventListener('DOMContentLoaded', async ()=>{
    console.log('[bind] boot deviceId=', deviceId, ' deviceCode=', LS.getItem('deviceCode')||'(none)');
    // tải links để setTable có url mới (nếu cần)
    await loadLinks().catch(()=>{});

    // Ẩn UI app khi chưa có mã (để an toàn, dùng CSS gate của sếp cũng được)
    // Ở đây không động tới UI cũ — chỉ thêm gate riêng khi cần.

    const code = LS.getItem('deviceCode');
    if (!code){
      showCodeGate();
    }else{
      // Xác nhận lại tính hợp lệ + (re)bind nếu cần
      try{
        const ref = db.ref('codes/'+code);
        const snap = await ref.once('value');
        const v = snap.val();
        if (!v) throw new Error('Mã không tồn tại.');
        if (v.enabled === false) throw new Error('Mã đã bị tắt.');
        if (v.boundDeviceId && v.boundDeviceId !== deviceId) throw new Error('Mã đã gắn thiết bị khác.');

        // nếu chưa bound → bind
        if (!v.boundDeviceId){
          await ref.transaction(cur=>{
            if (!cur) return cur;
            if (cur.enabled === false) return;
            if (cur.boundDeviceId && cur.boundDeviceId !== deviceId) return;
            return {
              ...cur,
              boundDeviceId: deviceId,
              boundAt: firebase.database.ServerValue.TIMESTAMP
            };
          }, async (err, committed)=>{
            if (err) throw err;
            if (!committed) throw new Error('Mã không khả dụng.');
            await db.ref('devices/'+deviceId).update({
              code: code,
              lastSeen: firebase.database.ServerValue.TIMESTAMP,
            });
          });
        }

        // bắt đầu theo dõi mã
        watchCode(code);
        // vào app
        afterBindEnter();
      }catch(e){
        console.warn('[bind] Code invalid at boot:', e?.message||e);
        LS.removeItem('deviceCode');
        showCodeGate(e?.message || 'Vui lòng nhập mã.');
      }
    }

    // Heartbeat định kỳ
    setInterval(()=> heartbeat().catch(()=>{}), 20000);
    document.addEventListener('visibilitychange', ()=> {
      if (!document.hidden) heartbeat().catch(()=>{});
    });

    // Phụ trợ: khi redirect-core đổi state, lần sau heartbeat sẽ ghi stage mới
    window.addEventListener('storage', (e)=>{
      if (e.key === 'appState' || e.key === 'tableId') {
        heartbeat().catch(()=>{});
      }
    });
  });
})();