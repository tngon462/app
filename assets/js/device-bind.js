
/**
 * device-bind.js
 * - Gate nhập mã lần đầu
 * - Ràng buộc 1-mã-1-máy qua transaction
 * - Nhận lệnh admin: setTable / reload / unbind
 * - Đồng bộ trạng thái về /devices/<deviceId>
 */
(function(){
  'use strict';
  const LS = localStorage;
  const $  = (id)=> document.getElementById(id);

  // expose của redirect-core
  const gotoSelect = window.gotoSelect || function(){};
  const gotoStart  = window.gotoStart  || function(){};
  const gotoPos    = window.gotoPos    || function(){};

  // deviceId ổn định
  function uuid(){return'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0,v=c==='x'?r:(r&0x3|0x8);return v.toString(16);});}
  let deviceId = LS.getItem('deviceId') || (LS.setItem('deviceId', uuid()), LS.getItem('deviceId'));

  if (!window.firebase || !firebase.apps?.length){
    console.error('[bind] Firebase chưa init.');
  }
  const db = firebase.database();

  // ---- Gate nhập mã (không có nút Hủy) ----
  function showCodeGate(message){
    if ($('code-gate')){
      if (message){ const e=$('code-error'); e && (e.textContent=message); }
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
          <button id="code-submit" class="mt-4 w-full rounded-xl bg-blue-600 text-white font-bold py-3 hover:bg-blue-700 transition">XÁC NHẬN</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);

    const btn = $('code-submit'), input=$('code-input'), err=$('code-error');
    function busy(b){ btn.disabled=b; btn.textContent=b?'Đang kiểm tra…':'XÁC NHẬN'; }
    async function submit(){
      const code = (input.value||'').trim().toUpperCase();
      err.textContent='';
      if (!code){ err.textContent='Vui lòng nhập mã.'; return; }
      busy(true);
      try{
        await claimCode(code);
        wrap.remove();
        startAfterBind();
      }catch(e){
        err.textContent = e?.message || 'Mã không hợp lệ.';
      }finally{ busy(false); }
    }
    btn.addEventListener('click', submit);
    input.addEventListener('keydown', e=>{ if(e.key==='Enter') submit(); });
    setTimeout(()=> input?.focus(), 100);
    if (message) err.textContent = message;
  }

  // ---- Transaction 1-mã-1-máy ----
  async function claimCode(code){
    const ref = db.ref('codes/'+code);
    const { committed, snapshot } = await ref.transaction(cur=>{
      if (!cur) return cur;                // không tồn tại → fail
      if (cur.enabled === false) return;   // bị tắt → fail
      if (cur.boundDeviceId && cur.boundDeviceId !== deviceId) return; // đang gắn máy khác → fail
      return { ...cur, boundDeviceId: deviceId, boundAt: firebase.database.ServerValue.TIMESTAMP };
    });
    if (!committed) throw new Error('Mã không khả dụng hoặc đang dùng ở thiết bị khác.');

    await db.ref('devices/'+deviceId).update({
      code: code,
      lastSeen: firebase.database.ServerValue.TIMESTAMP
    });
    LS.setItem('deviceCode', code);

    // bắt đầu theo dõi mã (để nếu bị tắt/xoá/thu hồi → hiện gate)
    watchCode(code);
  }

  // ---- Heartbeat + trạng thái ----
  function getState(){ return localStorage.getItem('appState') || 'select'; }
  function getTable(){ return { id:LS.getItem('tableId')||'', url:LS.getItem('tableUrl')||'' }; }

  async function heartbeat(){
    const code = LS.getItem('deviceCode') || null;
    const {id} = getTable();
    await db.ref('devices/'+deviceId).update({
      code: code || null,
      table: id || null,
      stage: getState(),                // 'select' | 'start' | 'pos'
      inPOS: getState()==='pos',
      lastSeen: firebase.database.ServerValue.TIMESTAMP
    });
  }

  // ---- Lệnh admin ----
  function dispatchTableChanged(table, url){
    const ev = new CustomEvent('tngon:tableChanged', { detail:{ table, url }});
    window.dispatchEvent(ev);
  }

  function listenCommands(){
    const ref = db.ref('devices/'+deviceId+'/commands');
    ref.on('value', s=>{
      const c = s.val() || {};

      if (c.reloadAt){
        // chỉ reload → redirect-core khôi phục về state, nếu có cờ dưới thì về START
        try{ LS.setItem('forceStartAfterReload','1'); }catch(_){}
        location.reload();
        return;
      }

      if (c.setTable && c.setTable.value){
        const table = String(c.setTable.value);
        const url = window.getLinkForTable ? window.getLinkForTable(table) : null;
        // set local & phát event cho redirect-core
        if (table) LS.setItem('tableId', table); else LS.removeItem('tableId');
        if (url)   LS.setItem('tableUrl', url);   else LS.removeItem('tableUrl');
        dispatchTableChanged(table, url || undefined);
        db.ref('devices/'+deviceId).update({ table: table || null });
        ref.child('setTable').remove().catch(()=>{});
      }

      if (c.unbindAt){
        // hủy local & hiện gate
        stopWatchCode();
        const old = LS.getItem('deviceCode');
        LS.removeItem('deviceCode'); LS.removeItem('tableId'); LS.removeItem('tableUrl'); LS.removeItem('appState'); LS.removeItem('forceStartAfterReload');
        db.ref('devices/'+deviceId).update({ code:null, table:null, stage:'select', inPOS:false });
        showCodeGate('Mã đã bị thu hồi. Vui lòng nhập mã khác.');
      }
    });

    // broadcast reload
    db.ref('broadcast/reloadAt').on('value', s=>{
      if (s.val()){
        try{ LS.setItem('forceStartAfterReload','1'); }catch(_){}
        location.reload();
      }
    });
  }

  // ---- Theo dõi code hiện tại: tắt/xoá/đổi máy → gate ----
  let unwatch = null;
  function stopWatchCode(){ if (unwatch) { unwatch(); unwatch=null; } }
  function watchCode(code){
    stopWatchCode();
    const ref = db.ref('codes/'+code);
    const cb = ref.on('value', snap=>{
      const v = snap.val();
      if (!v){
        LS.removeItem('deviceCode'); LS.removeItem('tableId'); LS.removeItem('tableUrl'); LS.removeItem('appState');
        showCodeGate('Mã đã bị xóa.');
        return;
      }
      if (v.enabled === false){
        LS.removeItem('deviceCode'); LS.removeItem('tableId'); LS.removeItem('tableUrl'); LS.removeItem('appState');
        showCodeGate('Mã đã bị tắt.');
        return;
      }
      if (v.boundDeviceId && v.boundDeviceId !== deviceId){
        LS.removeItem('deviceCode'); LS.removeItem('tableId'); LS.removeItem('tableUrl'); LS.removeItem('appState');
        showCodeGate('Mã đang được dùng ở thiết bị khác.');
        return;
      }
    });
    unwatch = ()=> ref.off('value', cb);
  }

  // ---- Khởi động sau khi bind hợp lệ ----
  function startAfterBind(){
    if (LS.getItem('forceStartAfterReload')==='1'){
      LS.removeItem('forceStartAfterReload');
      // có bàn thì về START, không thì vẫn SELECT
      const {id} = getTable();
      if (id) gotoStart();
    }
    listenCommands();
    heartbeat().catch(()=>{});
  }

  // ---- Boot ----
  document.addEventListener('DOMContentLoaded', async ()=>{
    // nếu đã có code cũ → xác thực lại, nếu ok thì vào luôn
    const code = LS.getItem('deviceCode');
    if (!code){
      showCodeGate();
    }else{
      try{
        const ref = db.ref('codes/'+code);
        const snap = await ref.once('value');
        const v = snap.val();
        if (!v) throw new Error('Mã không tồn tại.');
        if (v.enabled === false) throw new Error('Mã đã bị tắt.');
        if (v.boundDeviceId && v.boundDeviceId !== deviceId) throw new Error('Mã gắn thiết bị khác.');

        // nếu chưa ghi boundDeviceId → tự ràng buộc
        if (!v.boundDeviceId){
          const {committed} = await ref.transaction(cur=>{
            if (!cur) return cur;
            if (cur.enabled === false) return;
            if (cur.boundDeviceId && cur.boundDeviceId !== deviceId) return;
            return { ...cur, boundDeviceId: deviceId, boundAt: firebase.database.ServerValue.TIMESTAMP };
          });
          if (!committed) throw new Error('Không ràng buộc được mã.');
          await db.ref('devices/'+deviceId).update({ code, lastSeen: firebase.database.ServerValue.TIMESTAMP });
        }

        watchCode(code);
        startAfterBind();
      }catch(e){
        LS.removeItem('deviceCode');
        showCodeGate(e?.message || 'Vui lòng nhập mã.');
      }
    }

    // heartbeat định kỳ
    setInterval(()=> heartbeat().catch(()=>{}), 20000);
    document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) heartbeat().catch(()=>{}); });
    window.addEventListener('storage', (e)=>{ if (e.key==='appState' || e.key==='tableId') heartbeat().catch(()=>{}); });
  });
})();

