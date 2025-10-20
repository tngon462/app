// assets/js/device-bind.js
// T-NGON iPad device-bind (chuẩn)
// - Gate xuất hiện ngay nếu chưa có mã
// - Lắng nghe lệnh admin từ đầu (kể cả chưa bind)
// - 1 mã <-> 1 máy bằng transaction
// - Đồng bộ /devices/<deviceId> định kỳ
// - Phối hợp mềm với redirect-core (gotoSelect/gotoStart/gotoPos, getLinkForTable)

(function(){
  'use strict';

  // ===== Helpers =====
  const LS = window.localStorage;
  const $  = (id)=> document.getElementById(id);

  function uuidv4(){
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c=>{
      const r = Math.random()*16|0, v = (c==='x')?r:(r&0x3|0x8);
      return v.toString(16);
    });
  }

  // Optional hooks từ redirect-core (nếu có)
  const gotoSelect = window.gotoSelect || function(){};
  const gotoStart  = window.gotoStart  || function(){};
  const gotoPos    = window.gotoPos    || function(){};
  const getLinkForTable = window.getLinkForTable || function(t){ return null; };

  // Danh tính thiết bị
  let deviceId = LS.getItem('deviceId');
  if (!deviceId){ deviceId = uuidv4(); LS.setItem('deviceId', deviceId); }
  console.log('[bind] deviceId =', deviceId);

  // Guard Firebase
  if (!window.firebase || !firebase.apps?.length){
    console.error('[bind] Firebase chưa sẵn sàng. Hãy load firebase-app/auth/database + firebase.js trước file này.');
    return;
  }
  const db = firebase.database();

  // ===== Auth ẩn danh =====
  async function ensureAuth(){
    if (firebase.auth().currentUser) return firebase.auth().currentUser;
    await firebase.auth().signInAnonymously();
    await new Promise(res=>{
      const un = firebase.auth().onAuthStateChanged(u=>{ if(u){ un(); res(); }});
    });
    return firebase.auth().currentUser;
  }

  // ===== State helpers =====
  function appState(){ return LS.getItem('appState') || 'select'; }
  function tableId(){  return LS.getItem('tableId') || null; }
  function tableUrl(){ return LS.getItem('tableUrl') || null; }
  function setTableLocal(id, url){
    if (id) LS.setItem('tableId', String(id)); else LS.removeItem('tableId');
    if (url) LS.setItem('tableUrl', url); else LS.removeItem('tableUrl');
    // Cho các script phụ biết bàn hiện tại (nếu có dùng)
    if (id) window.tableId = String(id); else delete window.tableId;
  }

  // ===== Gate (nhập mã) =====
  function showGate(message){
    let wrap = $('code-gate');
    if (!wrap){
      wrap = document.createElement('div');
      wrap.id = 'code-gate';
      wrap.style.cssText = 'position:fixed;inset:0;background:#fff;z-index:6000;';
      wrap.innerHTML = `
        <div class="w-full h-full flex items-center justify-center p-6">
          <div class="w-full max-w-sm bg-white border border-gray-200 rounded-2xl shadow p-6">
            <h1 class="text-2xl font-extrabold text-gray-900 mb-4 text-center">Nhập mã iPad</h1>
            <p class="text-sm text-gray-500 mb-4 text-center">Nhập mã do admin cấp.</p>
            <input id="code-input" type="text" maxlength="20" placeholder="VD: TEST, 12, A1B2"
                   class="w-full border rounded-lg px-4 py-3 text-center tracking-widest font-mono text-lg" />
            <div id="code-error" class="text-red-600 text-sm mt-2 h-5 text-center"></div>
            <button id="code-submit"
              class="mt-4 w-full rounded-xl bg-blue-600 text-white font-bold py-3 hover:bg-blue-700">XÁC NHẬN</button>
          </div>
        </div>`;
      document.body.appendChild(wrap);

      const btn = $('code-submit');
      const input = $('code-input');
      const err = $('code-error');

      function busy(b){ btn.disabled=b; btn.textContent = b?'Đang kiểm tra…':'XÁC NHẬN'; }

      async function submit(){
        const code = (input.value||'').trim().toUpperCase();
        err.textContent = '';
        if (!code){ err.textContent = 'Vui lòng nhập mã.'; return; }
        busy(true);
        try{
          await ensureAuth();
          // Transaction claim
          await claimCode(code);
          // Gỡ Gate
          wrap.remove();
          // Về Start (không xoá bàn cũ nếu có)
          gotoStart();
          // Đập nhịp admin thấy ngay
          heartbeat().catch(()=>{});
        }catch(e){
          console.warn('[bind] submit error:', e);
          err.textContent = e?.message || 'Không dùng được mã này.';
        }finally{
          busy(false);
        }
      }
      btn.addEventListener('click', submit);
      input.addEventListener('keydown', e=>{ if(e.key==='Enter') submit(); });
      setTimeout(()=> input.focus(), 60);
      if (message){ err.textContent = message; }
    }else if (message){
      const err = $('code-error'); if (err) err.textContent = message;
    }
  }

  // ===== Claim code: 1 mã <-> 1 máy =====
  async function claimCode(code){
    const ref = db.ref('codes/'+code);
    const res = await ref.transaction(cur=>{
      if (!cur) return cur;                    // không tồn tại -> fail
      if (cur.enabled === false) return;       // tắt -> fail
      if (cur.boundDeviceId && cur.boundDeviceId !== deviceId) return; // đang ở máy khác -> fail
      return {
        ...cur,
        boundDeviceId: deviceId,
        boundAt: firebase.database.ServerValue.TIMESTAMP
      };
    });
    if (!res.committed) throw new Error('Mã không khả dụng hoặc đã dùng ở thiết bị khác.');

    // Lưu device info
    await db.ref('devices/'+deviceId).update({
      code: code,
      lastSeen: firebase.database.ServerValue.TIMESTAMP
    });
    LS.setItem('deviceCode', code);
  }

  // ===== Heartbeat về /devices/<deviceId> =====
  async function heartbeat(){
    try{
      await ensureAuth();
      await db.ref('devices/'+deviceId).update({
        code: LS.getItem('deviceCode') || null,
        table: tableId(),
        stage: appState(),                  // 'select' | 'start' | 'pos'
        inPOS: appState()==='pos',
        lastSeen: firebase.database.ServerValue.TIMESTAMP
      });
    }catch(e){
      console.warn('[bind] heartbeat error:', e?.message||e);
    }
  }
  setInterval(()=> heartbeat(), 20000);
  document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) heartbeat(); });

  // ===== Presence sớm để Admin thấy node devices ngay cả trước khi bind =====
  async function startPassivePresence(){
    try{
      await ensureAuth();
      await db.ref('devices/'+deviceId).update({
        // KHÔNG set code ở đây khi chưa bind
        table: tableId(),
        stage: appState(),
        inPOS: appState()==='pos',
        lastSeen: firebase.database.ServerValue.TIMESTAMP
      });
    }catch(e){
      console.warn('[bind] passive presence error:', e?.message||e);
    }
  }

  // ===== Nghe lệnh admin (nghe ngay từ boot) =====
  function startCommandListener(){
    if (window.__tngon_cmd_listening) return; // tránh gắn 2 lần
    window.__tngon_cmd_listening = true;

    const cmdRef = db.ref('devices/'+deviceId+'/commands');
    cmdRef.on('value', (snap)=>{
      const c = snap.val() || {};

      // 1) Reload
      if (c.reloadAt){
        try{ LS.setItem('forceStartAfterReload','1'); }catch(_){}
        location.reload();
        return;
      }

      // 2) Set table (không reload)
      if (c.setTable && c.setTable.value){
        const t = String(c.setTable.value);
        const url = getLinkForTable(t) || tableUrl() || '';
        setTableLocal(t, url);
        // cho redirect-core biết (nếu nó lắng nghe)
        window.dispatchEvent(new CustomEvent('tngon:tableChanged', { detail:{ table:t, url } }));
        // về Start
        gotoStart();
        // cập nhật nhanh cho admin
        db.ref('devices/'+deviceId).update({ table: t || null }).catch(()=>{});
        // dọn lệnh
        cmdRef.child('setTable').remove().catch(()=>{});
      }

      // 3) Unbind
      if (c.unbindAt){
        const code = LS.getItem('deviceCode');
        LS.removeItem('deviceCode');
        setTableLocal(null, null);
        LS.removeItem('appState');
        db.ref('devices/'+deviceId).update({ code:null, table:null, stage:'select', inPOS:false }).catch(()=>{});
        // Mở gate ngay (không reload)
        showGate('Mã đã bị thu hồi. Vui lòng nhập mã khác.');
      }
    });

    // Broadcast reload toàn quán
    db.ref('broadcast/reloadAt').on('value', s=>{
      if (s.val()){
        try{ LS.setItem('forceStartAfterReload','1'); }catch(_){}
        location.reload();
      }
    });
  }

  // ===== BOOT =====
  document.addEventListener('DOMContentLoaded', async ()=>{
    // Phím tắt: ?forceGate=1 -> ép xoá code
    const u = new URL(location.href);
    if (u.searchParams.get('forceGate')==='1'){
      LS.removeItem('deviceCode'); LS.removeItem('tableId'); LS.removeItem('tableUrl'); LS.removeItem('appState');
    }

    const code = LS.getItem('deviceCode');

    // Luôn lắng nghe lệnh & hiện presence sớm (song song) — nhưng Gate phải hiện ngay nếu chưa có mã
    try{ ensureAuth().then(()=>{ startPassivePresence(); startCommandListener(); }); }catch(_){}

    if (!code){
      // Hiện gate ngay
      showGate();
      return;
    }

    // Đã có mã: xác minh lại + theo dõi
    try{
      await ensureAuth();
      const snap = await db.ref('codes/'+code).once('value');
      const v = snap.val();
      if (!v) throw new Error('Mã không tồn tại.');
      if (v.enabled === false) throw new Error('Mã đã bị tắt.');
      if (v.boundDeviceId && v.boundDeviceId !== deviceId) throw new Error('Mã đang ở thiết bị khác.');

      // Lắng nghe lệnh (nếu auth promise ở trên chưa xong)
      startCommandListener();

      // Nếu vừa reload do Admin, quay về Start
      if (LS.getItem('forceStartAfterReload')==='1'){
        LS.removeItem('forceStartAfterReload');
        gotoStart();
      }

      // Đập nhịp để Admin thấy
      heartbeat().catch(()=>{});
    }catch(e){
      console.warn('[bind] boot verify error:', e?.message||e);
      LS.removeItem('deviceCode');
      showGate(e?.message || 'Vui lòng nhập mã.');
    }

    // Khi redirect-core đổi state/bàn -> ghi lại để admin thấy
    window.addEventListener('storage', (ev)=>{
      if (ev.key==='appState' || ev.key==='tableId') heartbeat().catch(()=>{});
    });
  });

})();
