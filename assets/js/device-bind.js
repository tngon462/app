// assets/js/device-bind.js
// T-NGON device bind (client iPad)
// - 1 mã <-> 1 máy (transaction ràng buộc)
// - Nhận lệnh admin: setTable (-> Start Order), reload (-> Start Order), unbind (-> Gate)
// - Đồng bộ trạng thái về /devices/<deviceId>
// - Chống reload lặp: debounce theo timestamp (handledReloadAt / handledBroadcastReloadAt)
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
  function toNum(x){ const n = Number(x); return Number.isFinite(n) ? n : 0; }

  // Các hàm từ redirect-core (nếu chưa có thì fallback an toàn)
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
      console.warn('[bind] Không tải được links.json, setTable vẫn chạy nếu redirect-core đã có tableUrl sẵn.', e);
      linksMap = null;
    }
  }

  // ===== Gate (nhập mã) — không có nút Hủy =====
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
        wrap.remove(); // đóng gate
        afterBindEnter(); // vào app
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
    const result = await ref.transaction(cur=>{
      if (!cur) return cur;                    // không tồn tại -> fail
      if (cur.enabled === false) return;       // tắt -> fail
      if (cur.boundDeviceId && cur.boundDeviceId !== deviceId) return; // đã gắn máy khác -> fail
      return {
        ...cur,
        boundDeviceId: deviceId,
        boundAt: firebase.database.ServerValue.TIMESTAMP
      };
    });
    if (!result.committed) throw new Error('Mã không khả dụng hoặc đã được dùng ở thiết bị khác.');

    await db.ref('devices/'+deviceId).update({
      code: code,
      lastSeen: firebase.database.ServerValue.TIMESTAMP
    });
    LS.setItem('deviceCode', code);
    // bắt đầu theo dõi mã (tắt/xoá/chuyển máy)
    watchCode(code);
  }

  // ===== Đồng bộ name/table/stage về admin =====
  function getAppState(){
    return LS.getItem('appState') || 'select'; // 'select' | 'start' | 'pos' do redirect-core đặt
  }
  function getCurrentTable(){
    return {
      id:  LS.getItem('tableId')  || '',
      url: LS.getItem('tableUrl') || ''
    };
  }
  async function heartbeat(){
    const code = LS.getItem('deviceCode') || null;
    const state = getAppState();
    const {id:tableId} = getCurrentTable();
    const inPOS = (state === 'pos');
    await db.ref('devices/'+deviceId).update({
      code: code || null,
      table: tableId || null,
      stage: state,
      inPOS: inPOS,
      lastSeen: firebase.database.ServerValue.TIMESTAMP
    });
  }

  // ===== Nhận lệnh từ admin (debounce reload) =====
  function listenCommands(){
    const cmdRef = db.ref('devices/'+deviceId+'/commands');
    cmdRef.on('value', (snap)=>{
      const c = snap.val() || {};

      // reloadAt: chỉ xử lý nếu timestamp mới hơn cái đã xử lý
      if (c.reloadAt) {
        const ts = toNum(c.reloadAt);
        const done = toNum(LS.getItem('handledReloadAt'));
        if (ts > done) {
          LS.setItem('handledReloadAt', String(ts));
          LS.setItem('forceStartAfterReload', '1'); // sau reload -> vào Start Order
          setTimeout(()=> location.reload(), 30);
          return;
        }
      }

      // setTable: đổi số bàn & link, không reload, đưa tới Start Order
      if (c.setTable && c.setTable.value){
        const table = String(c.setTable.value);
        let url = '';
        if (linksMap && Object.prototype.hasOwnProperty.call(linksMap, table)) {
          url = linksMap[table];
        }
        if (table) LS.setItem('tableId', table);