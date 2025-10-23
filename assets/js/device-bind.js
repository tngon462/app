// assets/js/device-bind.js — full features + fix verify mã
(function(){
  'use strict';

// === Seen markers ===
let seenReloadAt   = Number(localStorage.getItem('cmdSeen:reload'))   || 0;
let seenUnbindAt   = Number(localStorage.getItem('cmdSeen:unbind'))   || 0;
let seenSetTableAt = Number(localStorage.getItem('cmdSeen:setTable')) || 0;
function markSeen(key, ts){
  if (!ts) return;
  if (key==='reload'){ seenReloadAt = ts; localStorage.setItem('cmdSeen:reload', String(ts)); }
  if (key==='unbind'){ seenUnbindAt = ts; localStorage.setItem('cmdSeen:unbind', String(ts)); }
  if (key==='setTable'){ seenSetTableAt = ts; localStorage.setItem('cmdSeen:setTable', String(ts)); }
}

// === Helpers ===
const LS = window.localStorage;
const $  = (id)=> document.getElementById(id);
function uuidv4(){
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c=>{
    const r = Math.random()*16|0, v = (c==='x')?r:(r&0x3|0x8);
    return v.toString(16);
  });
}

const gotoSelect = window.gotoSelect || function(){};
const gotoStart  = window.gotoStart  || function(){};
const gotoPos    = window.gotoPos    || function(){};
const getLinkForTable = window.getLinkForTable || function(t){ return null; };

let deviceId = LS.getItem('deviceId');
if (!deviceId){ deviceId = uuidv4(); LS.setItem('deviceId', deviceId); }
console.log('[bind] deviceId =', deviceId);

// === Firebase guard ===
if (!window.firebase || !firebase.apps?.length){
  console.error('[bind] Firebase chưa sẵn sàng.');
  return;
}
const db = firebase.database();

// === Auth ===
async function ensureAuth(){
  if (firebase.auth().currentUser) return firebase.auth().currentUser;
  await firebase.auth().signInAnonymously();
  await new Promise(res=>{
    const un=firebase.auth().onAuthStateChanged(u=>{ if(u){ un(); res(); }});
  });
  return firebase.auth().currentUser;
}

// === State ===
function appState(){ return LS.getItem('appState') || 'select'; }
function tableId(){  return LS.getItem('tableId') || null; }
function tableUrl(){ return LS.getItem('tableUrl') || null; }
function setTableLocal(id, url){
  if (id) LS.setItem('tableId', String(id)); else LS.removeItem('tableId');
  if (url) LS.setItem('tableUrl', url); else LS.removeItem('tableUrl');
  if (id) window.tableId = String(id); else delete window.tableId;
}

// === Gate nhập mã ===
function showGate(msg){
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
          <input id="code-input" type="text" maxlength="20"
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
      if (!code){ err.textContent='Vui lòng nhập mã.'; return; }
      busy(true);
      try{
        await ensureAuth();
        await claimCode(code);
        wrap.remove();
        gotoStart();
        heartbeat().catch(()=>{});
      }catch(e){
        console.warn('[bind] submit error', e);
        err.textContent = e?.message || 'Mã không hợp lệ.';
      }finally{ busy(false); }
    }
    btn.addEventListener('click', submit);
    input.addEventListener('keydown', e=>{ if(e.key==='Enter') submit(); });
    setTimeout(()=> input.focus(), 100);
    if (msg) err.textContent = msg;
  } else if (msg){
    const err = $('code-error'); if (err) err.textContent = msg;
  }
}

// === Claim code ===
async function claimCode(code){
  const ref = db.ref('codes/'+code);
  const res = await ref.transaction(cur=>{
    if (!cur) return cur;
    if (cur.enabled === false) return;
    if (cur.boundDeviceId && cur.boundDeviceId !== deviceId) return;
    return { ...cur, boundDeviceId: deviceId,
             boundAt: firebase.database.ServerValue.TIMESTAMP };
  });
  if (!res.committed) throw new Error('Mã không khả dụng hoặc đã dùng.');
  await db.ref('devices/'+deviceId).update({
    code, lastSeen: firebase.database.ServerValue.TIMESTAMP
  });
  LS.setItem('deviceCode', code);
}

// === Heartbeat ===
async function heartbeat(){
  try{
    await ensureAuth();
    await db.ref('devices/'+deviceId).update({
      code: LS.getItem('deviceCode') || null,
      table: tableId(),
      stage: appState(),
      inPOS: appState()==='pos',
      lastSeen: firebase.database.ServerValue.TIMESTAMP
    });
  }catch(e){ console.warn('[bind] heartbeat error', e?.message); }
}
setInterval(()=> heartbeat(), 20000);
document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) heartbeat(); });

// === Presence + Command ===
async function startPassivePresence(){
  try{
    await ensureAuth();
    await db.ref('devices/'+deviceId).update({
      table: tableId(),
      stage: appState(),
      inPOS: appState()==='pos',
      lastSeen: firebase.database.ServerValue.TIMESTAMP
    });
  }catch(e){ console.warn('[bind] passive presence error', e?.message); }
}

function startCommandListener(){
  if (window.__tngon_cmd_listening) return;
  window.__tngon_cmd_listening = true;

  const cmdRef = db.ref('devices/'+deviceId+'/commands');
  cmdRef.on('value', (snap)=>{
    const c = snap.val()||{};

    // Reload
    const rTs = Number(c.reloadAt||0);
    if (rTs && rTs>seenReloadAt){
      markSeen('reload',rTs);
      localStorage.setItem('forceStartAfterReload','1');
      location.reload(); return;
    }

    // SetTable
    const s = c.setTable;
    if (s?.value!=null && s?.at!=null && Number(s.at)>seenSetTableAt){
      markSeen('setTable',s.at);
      const t = String(s.value);
      const url = getLinkForTable(t)||tableUrl()||'';
      setTableLocal(t,url);
      window.dispatchEvent(new CustomEvent('tngon:tableChanged',{detail:{table:t,url}}));
      gotoStart();
      db.ref('devices/'+deviceId).update({table:t||null}).catch(()=>{});
      cmdRef.child('setTable').remove().catch(()=>{});
    }

    // Unbind
    const uTs = Number(c.unbindAt||0);
    if (uTs && uTs>seenUnbindAt){
      markSeen('unbind',uTs);
      LS.removeItem('deviceCode');
      setTableLocal(null,null);
      db.ref('devices/'+deviceId).update({code:null,table:null,stage:'select'});
      showGate('Mã đã bị thu hồi.');
    }
  });

  // Broadcast reload
  db.ref('broadcast/reloadAt').on('value', s=>{
    const ts = Number(s.val()||0);
    if (ts && ts>seenReloadAt){
      markSeen('reload',ts);
      localStorage.setItem('forceStartAfterReload','1');
      location.reload();
    }
  });
}

// === BOOT ===
document.addEventListener('DOMContentLoaded', async ()=>{
  const u = new URL(location.href);
  if (u.searchParams.get('forceGate')==='1'){
    LS.removeItem('deviceCode'); LS.removeItem('tableId'); LS.removeItem('tableUrl'); LS.removeItem('appState');
  }

  const code = LS.getItem('deviceCode');
  ensureAuth().then(()=>{ startPassivePresence(); startCommandListener(); });

  if (!code){ showGate(); return; }

  try{
    await ensureAuth();
    const snap = await db.ref('codes/'+code).once('value');
    const v = snap.val();
    if (!v) throw new Error('Mã không tồn tại.');
    if (v.enabled===false) throw new Error('Mã đã bị tắt.');
    if (v.boundDeviceId && v.boundDeviceId!==deviceId) throw new Error('Mã đang dùng ở thiết bị khác.');
    if (LS.getItem('forceStartAfterReload')==='1'){ LS.removeItem('forceStartAfterReload'); gotoStart(); }
    heartbeat().catch(()=>{});
  }catch(e){
    console.warn('[bind] verify error', e?.message);
    LS.removeItem('deviceCode');
    showGate(e?.message||'Mã không hợp lệ.');
  }

  window.addEventListener('storage', (ev)=>{
    if (ev.key==='appState' || ev.key==='tableId') heartbeat().catch(()=>{});
  });
});
})();
