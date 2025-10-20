// assets/js/device-bind.js vFINAL
(function(){
  'use strict';
  const LS = localStorage;
  const $ = (id)=>document.getElementById(id);
  const gotoSelect = window.gotoSelect || (()=>{});
  const gotoStart  = window.gotoStart  || (()=>{});
  const gotoPos    = window.gotoPos    || (()=>{});

  function uuid(){return'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0,v=c==='x'?r:(r&0x3|0x8);return v.toString(16);});}
  let deviceId = LS.getItem('deviceId') || uuid(); LS.setItem('deviceId',deviceId);

  const db = firebase.database();

  // ===== GATE =====
  function showGate(msg){
    if($('code-gate')){ const e=$('code-error'); if(e&&msg)e.textContent=msg; return; }
    const w=document.createElement('div');
    w.id='code-gate';
    w.style='position:fixed;inset:0;z-index:9999;background:#fff;';
    w.innerHTML=`
    <div class="w-full h-full flex items-center justify-center p-6">
      <div class="max-w-sm w-full bg-white border rounded-2xl shadow p-6">
        <h1 class="text-2xl font-bold mb-4 text-center">Nhập mã iPad</h1>
        <input id="code-input" class="w-full border rounded px-4 py-3 text-center font-mono text-lg" placeholder="VD: A1B2C3" />
        <div id="code-error" class="text-center text-red-600 text-sm mt-2 h-5"></div>
        <button id="code-submit" class="mt-4 w-full py-3 bg-blue-600 text-white rounded-xl font-bold">XÁC NHẬN</button>
      </div>
    </div>`;
    document.body.appendChild(w);
    const input=$('code-input'),btn=$('code-submit'),err=$('code-error');
    btn.onclick=async ()=>{
      const code=(input.value||'').trim().toUpperCase();
      if(!code){ err.textContent='Nhập mã'; return; }
      try{ await claim(code); w.remove(); enterApp(); }
      catch(e){ err.textContent=e?.message||'Mã không khả dụng'; }
    };
    input.addEventListener('keydown',e=>{if(e.key==='Enter')btn.click();});
    setTimeout(()=>input.focus(),50);
  }

  // ===== CLAIM =====
  async function claim(code){
    const ref=db.ref('codes/'+code);
    const res=await ref.transaction(cur=>{
      if(!cur) return cur;
      if(cur.enabled===false) return;
      if(cur.boundDeviceId && cur.boundDeviceId!==deviceId) return;
      return {...cur,boundDeviceId:deviceId,boundAt:firebase.database.ServerValue.TIMESTAMP};
    });
    if(!res.committed) throw new Error('Mã đã dùng hoặc không tồn tại');
    await db.ref('devices/'+deviceId).update({code,lastSeen:firebase.database.ServerValue.TIMESTAMP});
    LS.setItem('deviceCode',code);
    watchCode(code);
  }

  async function beat(){
    const code=LS.getItem('deviceCode')||null;
    const stage=LS.getItem('appState')||'select';
    const table=LS.getItem('tableId')||null;
    await db.ref('devices/'+deviceId).update({
      code,table,stage,inPOS:stage==='pos',
      lastSeen:firebase.database.ServerValue.TIMESTAMP
    });
  }

  function listenCmd(){
    const ref=db.ref('devices/'+deviceId+'/commands');
    ref.on('value',s=>{
      const c=s.val()||{};
      if(c.reloadAt){ LS.setItem('forceStartAfterReload','1'); location.reload(); return; }
      if(c.setTable&&c.setTable.value){
        const t=String(c.setTable.value);
        LS.setItem('tableId',t);
        gotoStart();
        db.ref('devices/'+deviceId).update({table:t});
        ref.child('setTable').remove();
      }
      if(c.unbindAt){
        LS.clear(); LS.setItem('deviceId',deviceId);
        showGate('Mã đã bị thu hồi.');
      }
    });
  }

  function watchCode(code){
    const ref=db.ref('codes/'+code);
    ref.on('value',s=>{
      const v=s.val(); if(!v||v.enabled===false||v.boundDeviceId!==deviceId){
        LS.clear(); LS.setItem('deviceId',deviceId);
        showGate('Mã bị tắt hoặc chuyển máy khác.');
      }
    });
  }

  function enterApp(){
    if(LS.getItem('forceStartAfterReload')==='1'){ LS.removeItem('forceStartAfterReload'); gotoStart(); }
    listenCmd(); beat();
  }

  document.addEventListener('DOMContentLoaded',async()=>{
    const code=LS.getItem('deviceCode');
    if(!code){ showGate(); return; }
    const v=(await db.ref('codes/'+code).once('value')).val();
    if(!v||v.enabled===false||v.boundDeviceId&&v.boundDeviceId!==deviceId){
      LS.clear(); LS.setItem('deviceId',deviceId); showGate(); return;
    }
    watchCode(code); enterApp();
    setInterval(()=>beat(),20000);
  });
})();
