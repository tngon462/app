// ===============================================
//  device-bind.js v4
//  - Gate toàn trang (không Cancel), state machine anti-blink
//  - Admin commands: reload, setTable (đưa tới màn Start Order), unbind (auto reload về gate)
// ===============================================

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig); // firebaseConfig load từ /assets/js/firebase.js
}
firebase.auth().signInAnonymously().catch(console.error);

const LS = window.localStorage;
const $  = (id) => document.getElementById(id);

// ------- State machine -------
const STATE = {
  INIT: 'INIT',
  GATE: 'GATE',
  APP:  'APP',
};
let currentState = STATE.INIT;

// ------- Helpers UI -------
function show(id){ const el=$(id); if(el) el.classList.remove('hidden'); }
function hide(id){ const el=$(id); if(el) el.classList.add('hidden'); }
function setTableText(t){ const el=$('selected-table'); if(el) el.textContent = t||''; }

function uuidv4(){return'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0,v=c==='x'?r:(r&0x3|0x8);return v.toString(16);});}
let deviceId = LS.getItem('deviceId') || (LS.setItem('deviceId', uuidv4()), LS.getItem('deviceId'));

// ------- Shields / Gate -------
function ensureBootShield(){
  if ($('boot-shield')) return;
  const el = document.createElement('div');
  el.id = 'boot-shield';
  el.style.cssText = 'position:fixed;inset:0;background:#fff;z-index:5000;display:flex;align-items:center;justify-content:center;padding:16px';
  el.innerHTML = `
    <div class="w-full max-w-sm text-center">
      <h1 class="text-2xl font-extrabold text-gray-900 mb-3">Đang kiểm tra thiết bị…</h1>
      <p class="text-sm text-gray-500">Vui lòng đợi trong giây lát.</p>
      <div class="mt-4 animate-pulse text-gray-400">● ● ●</div>
    </div>`;
  document.body.appendChild(el);
}
function removeBootShield(){ const
