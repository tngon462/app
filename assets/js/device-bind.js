// assets/js/device-bind.js (safe minimal)
// - Bật "màn chắn" tới khi bind xong
// - Gate nhập mã (không Hủy)
// - Heartbeat cả khi chưa bind => admin vẫn thấy thiết bị
// - Nhận lệnh: reloadAt / unbindAt / setTable
(function(){
  'use strict';

  // ===== Helpers =====
  const LS = localStorage;
  const $  = (id)=>document.getElementById(id);
  const q  = (s)=>document.querySelector(s);

  function uuidv4(){
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c=>{
      const r = Math.random()*16|0, v=(c==='x')?r:(r&0x3|0x8); return v.toString(16);
    });
  }
  function now(){ return Date.now(); }

  // ===== IDs =====
  let deviceId = LS.getItem('deviceId');
  if (!deviceId){ deviceId = uuidv4(); LS.setItem('deviceId', deviceId); }

  // ===== Ensure gating class (ẩn UI app tới khi bind) =====
  document.documentElement.classList.add('gating');

  // ===== Stubs từ redirect-core (đã có sẵn bên bạn) =====
  const gotoSelect = window.gotoSelect || function(){};
  const gotoStart  = window.gotoStart  || function(){};
  const gotoPos    = window.gotoPos    || function(u){};
  const getLinkForTable = window.getLinkForTable || function(){ return null; };

  // ===== Firebase guard =====
  if (!window.firebase || !firebase.apps?.length) {
    console.error('[bind] Firebase chưa sẵn sàng. Hãy load firebase.js trước file này.');
    return;
  }
  const db = firebase.database();

  // ===== State helpers =====
  function appState(){ return LS.getItem('appState') || 'select'; }
  function tableState(){
    return { id: LS.getItem('tableId') || '', url: LS.getItem('tableUrl') || '' };
  }
  function setTableLocal(id, url){
    if (id==null) { LS.removeItem('tableId'); delete window.tableId; }
    else { LS.setItem('tableId', String(id)); window.tableId = String(id); }
    if (url==null) LS.removeItem('tableUrl'); else LS.setItem('tableUrl', url);
  }

  // ===== Gate UI =====
  function showGate(message){
    if ($('#code-gate')) {
      if (message) { const e=$('#code-error'); if (e) e.textContent = message; }
      return;
    }
    const wrap = document.createElement('div');
    wrap.id = 'code-gate';
    wrap.style.cssText = 'position:fixed;inset:0;background:#fff;z-index:6000;';
    wrap.innerHTML = `
      <div class="w-full h-full flex items-center justify-center p-6">
        <div class="w-full max-w-sm bg-white border border-gray-200 rounded-2xl shadow p-6">
          <h1 class="text-2xl font-extrabold text-gray-900 mb-4 text-center">Nhập mã iPad</h1>
          <p class="text-sm text-gray-500 mb-4 text-center">Nhập mã do admin cấp.</p>
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

    const btn = $('#code-submit');
    const input = $('#code-input');
    const err = $('#code-error');

    function setBusy(b){ btn.disabled=b; btn.textContent=b?'Đang kiểm tra…':'XÁC NHẬN'; }

    async function submit(){
      const raw = (input.value||'').trim().toUpperCase();
      err.textContent = '';
      if (!raw){ err.textContent='Vui lòng nhập mã.'; return; }
      setBusy(true);
      try{
        await claimCode(raw);
        // Thành công
        wrap.remove();
        startCommandListener();     // lắng nghe lệnh admin
        document.documentElement.classList.remove('gating'); // mở UI
        // trở về đúng màn cũ hoặc Start
        if (LS.getItem('appState')==='start') gotoStart(); else gotoSelect(false);
      }catch(e){
        err.textContent = e?.message || 'Mã không hợp lệ.';
      }finally{ setBusy(false); }
    }
    btn.addEventListener('click', submit);
    input.addEventListener('keydown', e=>{ if(e.key==='Enter') submit(); });
    setTimeout(()=> input.focus(), 60);
    if (message){ err.textContent = message; }
  }

  // ===== Ràng buộc 1-mã-1-máy =====
  async function claimCode(code){
    const ref = db.ref('codes/'+code);
    const res = await ref.transaction(cur=>{
      if (!cur) return cur; // không tồn tại -> fail
      if (cur.enabled === false) return; // tắt -> fail
      if (cur.boundDeviceId && cur.boundDeviceId !== deviceId) return; // đã gắn máy khác
      return { ...cur, boundDeviceId: deviceId, boundAt: firebase.database.ServerValue.TIMESTAMP };
    });
    if (!res.committed) throw new Error('Mã không khả dụng hoặc đã dùng ở thiết bị khác.');

    // lưu devices
    await db.ref('devices/'+deviceId).update({
      code: code,
      lastSeen: firebase.database.ServerValue.TIMESTAMP,
    });
    LS.setItem('deviceCode', code);
  }

  // ===== Heartbeat (kể cả chưa bind) =====
  async function heartbeat(){
    const code = LS.getItem('deviceCode') || null;
    const state = appState();
    const {id:tableId} = tableState();
    await db.ref('devices/'+deviceId).update({
      code: code,
      stage: state,                 // 'select' | 'start' | 'pos'
      table: tableId || null,       // '-', '5', '+5' tuỳ phía admin render
      inPOS: state === 'pos',
      lastSeen: firebase.database.ServerValue.TIMESTAMP,
    });
  }

  // ===== Lắng nghe lệnh admin =====
  function startCommandListener(){
    const cmdRef = db.ref('devices/'+deviceId+'/commands');
    cmdRef.on('value', (snap)=>{
      const c = snap.val() || {};

      if (c.reloadAt){
        // không đụng code/bàn, chỉ reload
        location.reload();
        return;
      }

      if (c.setTable && c.setTable.value){
        const t = String(c.setTable.value);
        // lấy url từ links.json (redirect-core đã load và expose window.getLinkForTable)
        const url = getLinkForTable(t) || null;
        setTableLocal(t, url);
        // thông báo UI core để cập nhật
        window.dispatchEvent(new CustomEvent('tngon:tableChanged', { detail: { table: t, url } }));
        // dọn lệnh
        cmdRef.child('setTable').remove();
        // cập nhật để admin thấy ngay
        db.ref('devices/'+deviceId).update({ table: t });
      }

      if (c.unbindAt){
        // xoá code local & về gate
        LS.removeItem('deviceCode');
        setTableLocal(null, null);
        LS.removeItem('appState');
        // dọn hiển thị trên admin
        db.ref('devices/'+deviceId).update({ code:null, table:null, stage:'select', inPOS:false });
        // bật lại gate
        document.documentElement.classList.add('gating');
        showGate('Mã đã bị thu hồi. Vui lòng nhập mã khác.');
      }
    });

    // broadcast reload
    db.ref('broadcast/reloadAt').on('value', s=>{
      if (s.val()) location.reload();
    });
  }

  // ===== Boot =====
  document.addEventListener('DOMContentLoaded', async ()=>{
    // ép mở gate nếu thêm ?forceGate=1 để xoá cache code cũ nhanh
    const u = new URL(location.href);
    if (u.searchParams.get('forceGate') === '1'){
      LS.removeItem('deviceCode'); LS.removeItem('tableId'); LS.removeItem('tableUrl'); LS.removeItem('appState');
    }

    // Heartbeat ngay & định kỳ (dù đã bind hay chưa)
    heartbeat().catch(()=>{});
    setInterval(()=> heartbeat().catch(()=>{}), 20000);
    document.addEventListener('visibilitychange', ()=>{ if (!document.hidden) heartbeat().catch(()=>{}); });

    const code = LS.getItem('deviceCode');
    if (!code){
      // chưa có code => mở gate và TIẾP TỤC đóng băng UI
      showGate();
      return;
    }

    // Có code: xác thực lại & theo dõi thay đổi
    try{
      const snap = await db.ref('codes/'+code).once('value');
      const v = snap.val();
      if (!v) throw new Error('Mã không tồn tại.');
      if (v.enabled === false) throw new Error('Mã đã bị tắt.');
      if (v.boundDeviceId && v.boundDeviceId !== deviceId) throw new Error('Mã đang dùng ở thiết bị khác.');

      // mở UI, lắng nghe lệnh admin
      document.documentElement.classList.remove('gating');
      startCommandListener();
    }catch(e){
      // code local không còn hợp lệ => xoá & yêu cầu nhập lại
      LS.removeItem('deviceCode');
      document.documentElement.classList.add('gating');
      showGate(e?.message || 'Vui lòng nhập mã.');
    }
  });
})();
