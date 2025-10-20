// assets/js/device-bind.js vFINAL 2025-10
// Thêm gate nhập mã, đồng bộ bàn, xử lý reload / unbind / setTable
(function(){
  'use strict';
  const LS = localStorage;
  const $  = (id)=>document.getElementById(id);

  const gotoSelect = window.gotoSelect || (()=>{});
  const gotoStart  = window.gotoStart  || (()=>{});
  const gotoPos    = window.gotoPos    || (()=>{});

  function uuid(){
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{
      const r=Math.random()*16|0,v=c==='x'?r:(r&0x3|0x8);
      return v.toString(16);
    });
  }

  let deviceId = LS.getItem('deviceId');
  if (!deviceId){ deviceId = uuid(); LS.setItem('deviceId', deviceId); }

  if (!window.firebase || !firebase.apps?.length) {
    console.error('[bind] Firebase chưa init');
    return;
  }

  const db = firebase.database();

  // ====== Gate nhập mã (lần đầu) ======
  function showGate(message){
    if ($('code-gate')) { const e=$('code-error'); if(e) e.textContent=message||''; return; }
    const wrap = document.createElement('div');
    wrap.id='code-gate';
    wrap.style='position:fixed;inset:0;z-index:9999;background:#fff;';
    wrap.innerHTML=`
      <div class="w-full h-full flex items-center justify-center p-6">
        <div class="w-full max-w-sm bg-white border border-gray-200 rounded-2xl shadow p-6">
          <h1 class="text-2xl font-bold text-gray-900 mb-4 text-center">Nhập mã thiết bị</h1>
          <input id="code-input" class="w-full border rounded px-4 py-3 text-center font-mono text-lg" placeholder="VD: A1B2C3" />
          <div id="code-error" class="text-red-600 text-sm text-center mt-2 h-5"></div>
          <button id="code-submit" class="mt-4 w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700">XÁC NHẬN</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    const input=$('code-input'),btn=$('code-submit'),err=$('code-error');
    btn.onclick=async()=>{
      const code=(input.value||'').trim().toUpperCase();
      if(!code){ err.textContent='Vui lòng nhập mã'; return; }
      try{
        await claimCode(code);
        wrap.remove();
        afterBindEnter();
      }catch(e){ err.textContent=e?.message||'Mã không hợp lệ'; }
    };
    input.addEventListener('keydown',e=>{if(e.key==='Enter')btn.click();});
    setTimeout(()=>input.focus(),50);
    if(message){ const err=$('code-error'); if(err) err.textContent=message; }
  }

  // ====== Transaction: bind 1-mã-1-máy ======
  async function claimCode(code){
    const ref=db.ref('codes/'+code);
    const result=await ref.transaction(cur=>{
      if(!cur) return cur;
      if(cur.enabled===false) return;
      if(cur.boundDeviceId && cur.boundDeviceId!==deviceId) return;
      return {...cur,boundDeviceId:deviceId,boundAt:firebase.database.ServerValue.TIMESTAMP};
    });
    if(!result.committed) throw new Error('Mã không khả dụng hoặc đã dùng ở thiết bị khác.');
    await db.ref('devices/'+deviceId).update({
      code, lastSeen:firebase.database.ServerValue.TIMESTAMP
    });
    LS.setItem('deviceCode',code);
    watchCode(code);
  }

  // ====== Theo dõi mã ======
  function watchCode(code){
    const ref=db.ref('codes/'+code);
    ref.on('value',snap=>{
      const v=snap.val();
      if(!v || v.enabled===false || (v.boundDeviceId && v.boundDeviceId!==deviceId)){
        LS.removeItem('deviceCode');
        LS.removeItem('tableId'); LS.removeItem('tableUrl'); LS.removeItem('appState');
        showGate('Mã bị thu hồi hoặc vô hiệu.');
      }
    });
  }

  // ====== Heartbeat & trạng thái ======
  async function heartbeat(){
    const code=LS.getItem('deviceCode')||null;
    const stage=LS.getItem('appState')||'select';
    const table=LS.getItem('tableId')||null;
    await db.ref('devices/'+deviceId).update({
      code, table, stage, inPOS:(stage==='pos'),
      lastSeen:firebase.database.ServerValue.TIMESTAMP
    });
  }

  // ====== Nhận lệnh admin ======
  function listenCommands(){
    const cmd=db.ref('devices/'+deviceId+'/commands');
    cmd.on('value',s=>{
      const c=s.val()||{};
      if(c.reloadAt){
        LS.setItem('forceStartAfterReload','1');
        location.reload();
        return;
      }
      if(c.setTable && c.setTable.value){
        const t=String(c.setTable.value);
        LS.setItem('tableId',t);
        try{ gotoStart(); }catch(_){}
        db.ref('devices/'+deviceId).update({table:t});
        cmd.child('setTable').remove().catch(()=>{});
      }
      if(c.unbindAt){
        const code=LS.getItem('deviceCode');
        if(code){
          db.ref('codes/'+code+'/boundDeviceId').remove();
          db.ref('codes/'+code+'/boundAt').remove();
        }
        LS.removeItem('deviceCode'); LS.removeItem('tableId');
        LS.removeItem('tableUrl'); LS.removeItem('appState');
        showGate('Mã đã bị thu hồi.');
      }
    });
    db.ref('broadcast/reloadAt').on('value',s=>{
      if(s.val()){ LS.setItem('forceStartAfterReload','1'); location.reload(); }
    });
  }

  // ====== Khởi chạy sau khi bind thành công ======
  function afterBindEnter(){
    if(LS.getItem('forceStartAfterReload')==='1'){
      LS.removeItem('forceStartAfterReload');
      gotoStart();
    }
    listenCommands();
    heartbeat();
  }

  // ====== Boot ======
  document.addEventListener('DOMContentLoaded',async()=>{
    const code=LS.getItem('deviceCode');
    if(!code){ showGate(); return; }
    const snap=await db.ref('codes/'+code).once('value');
    const v=snap.val();
    if(!v || v.enabled===false || (v.boundDeviceId && v.boundDeviceId!==deviceId)){
      LS.removeItem('deviceCode');
      showGate('Mã không hợp lệ.');
      return;
    }
    watchCode(code);
    afterBindEnter();
    setInterval(()=>heartbeat(),20000);
  });
})();
