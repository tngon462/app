<!-- assets/js/admin-devices-tab.js -->
<script>
(function(){
  'use strict';

  // ====== helpers ======
  const $ = (id)=> document.getElementById(id);
  const byNum = (a,b)=> (Number(a)||1e9) - (Number(b)||1e9);
  const mask = (s)=> s ? (s.length<=4 ? s : s.slice(0,4)+'…') : '—';
  const modalRoot = ()=> $('#modal-root') || (()=>{ const d=document.createElement('div'); d.id='modal-root'; document.body.appendChild(d); return d; })();

  // ====== firebase guard ======
  let db=null;
  async function ensureAuth(){
    if (!window.firebase || !firebase.apps?.length) throw new Error('Firebase chưa khởi tạo');
    db = firebase.database();
    if (!firebase.auth().currentUser){
      await firebase.auth().signInAnonymously();
      await new Promise(res=>{ const un=firebase.auth().onAuthStateChanged(u=>{ if(u){un();res();} }); });
    }
  }

  // ====== table picker ======
  let LINKS_MAP=null;
  async function loadLinks(){
    try{
      const r = await fetch('./links.json?cb='+Date.now(), {cache:'no-store'});
      const j = await r.json();
      LINKS_MAP = j.links || j;
    }catch{ LINKS_MAP=null; }
  }
  function openTablePicker(onPick){
    const keys = LINKS_MAP ? Object.keys(LINKS_MAP).sort(byNum) : Array.from({length:15},(_,i)=>String(i+1));
    const root = modalRoot();
    root.innerHTML = `
      <div class="fixed inset-0 z-[9000]">
        <div class="absolute inset-0 bg-black/50"></div>
        <div class="absolute inset-0 p-4 flex items-center justify-center">
          <div class="bg-white rounded-xl shadow-xl w-full max-w-xl p-4">
            <div class="flex items-center justify-between mb-3">
              <div class="text-lg font-semibold">Chọn bàn</div>
              <button id="tp-close" class="px-2 py-1 rounded border hover:bg-gray-50">Đóng</button>
            </div>
            <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 max-h-[70vh] overflow-auto">
              ${keys.map(k=>`<button data-k="${k}" class="px-3 py-3 rounded-lg border font-semibold hover:bg-blue-50">Bàn ${k}</button>`).join('')}
            </div>
          </div>
        </div>
      </div>`;
    root.querySelector('#tp-close').onclick = ()=> root.innerHTML='';
    root.querySelectorAll('[data-k]').forEach(b=>{
      b.onclick = ()=>{ try{ onPick(b.dataset.k); }finally{ root.innerHTML=''; } };
    });
  }

  // ====== global power toggle (on/off all) ======
  function mountGlobalPowerToggle(){
    const wrap = document.querySelector('#devicesHeaderActions');
    if (!wrap) return;
    // Ẩn 2 nút cũ (nếu còn)
    $('#btnPowerOnAll')?.classList.add('hidden');
    $('#btnPowerOffAll')?.classList.add('hidden');

    // Tạo 1 nút toggle
    let btn = document.createElement('button');
    btn.id = 'btnPowerToggle';
    btn.className = 'px-3 md:px-4 py-2 rounded-lg text-white';
    btn.textContent = 'Đang tải…';
    btn.style.minWidth = '120px';
    wrap.insertBefore(btn, $('#btnReloadAll'));

    const refScreen = db.ref('control/screen');

    // Subscribe để đổi màu/nhãn
    refScreen.on('value', s=>{
      const v = (s.val()||'on').toString().toLowerCase();
      const isOn = v==='on';
      btn.textContent = isOn ? 'Đang BẬT' : 'Đang TẮT';
      btn.classList.toggle('bg-emerald-600', isOn);
      btn.classList.toggle('hover:bg-emerald-700', isOn);
      btn.classList.toggle('bg-gray-800', !isOn);
      btn.classList.toggle('hover:bg-black', !isOn);
    });

    // Click -> đảo trạng thái toàn quán
    btn.addEventListener('click', async ()=>{
      try{
        const snap = await refScreen.get();
        const cur = (snap.val()||'on').toString().toLowerCase();
        const next = (cur==='on')?'off':'on';
        await refScreen.set(next);

        // nếu bật toàn bộ -> đồng bộ cả các bàn về ON cho gọn
        if (next==='on'){
          const updates={};
          for (let i=1;i<=15;i++) updates[`control/tables/${i}/screen`] = 'on';
          await db.ref().update(updates);
        }
      }catch(e){
        alert('Đổi trạng thái toàn bộ lỗi: '+(e?.message||e));
      }
    });

    // Reload toàn bộ (nút sẵn có)
    $('#btnReloadAll')?.addEventListener('click', async ()=>{
      try{
        await db.ref('broadcast/reloadAt').set(firebase.database.ServerValue.TIMESTAMP);
      }catch(e){ alert('Reload toàn bộ lỗi: '+(e?.message||e)); }
    });
  }

  // ====== popup actions per device ======
  function openDeviceActions(dev){
    const { id, code, table, name } = dev;
    const root = modalRoot();

    // lấy trạng thái blackout theo bàn hiện tại
    const tableKey = String(table||'');
    root.innerHTML = `
      <div class="fixed inset-0 z-[9500]">
        <div class="absolute inset-0 bg-black/50"></div>
        <div class="absolute inset-0 p-4 flex items-end sm:items-center sm:justify-center">
          <div class="bg-white rounded-t-2xl sm:rounded-xl shadow-xl w-full max-w-md p-4">
            <div class="flex items-center justify-between mb-3">
              <div class="font-semibold">Thiết bị ${mask(id)} ${name?`· ${name}`:''}</div>
              <button id="da-close" class="px-2 py-1 rounded border hover:bg-gray-50">Đóng</button>
            </div>

            <div class="space-y-2">
              <button id="act-rename"  class="w-full px-3 py-2 rounded-lg border hover:bg-gray-50 text-left">Đổi tên thiết bị</button>
              <button id="act-reload"  class="w-full px-3 py-2 rounded-lg border hover:bg-gray-50 text-left">Làm mới</button>
              <button id="act-table"   class="w-full px-3 py-2 rounded-lg border hover:bg-gray-50 text-left">Đổi số bàn</button>
              <button id="act-toggle"  class="w-full px-3 py-2 rounded-lg border hover:bg-gray-50 text-left">Bật/Tắt màn hình bàn hiện tại</button>
              <button id="act-unbind"  class="w-full px-3 py-2 rounded-lg border hover:bg-amber-100 text-left"${code?'':' disabled'}>Gỡ liên kết (yêu cầu nhập lại mã)</button>
              <button id="act-delete"  class="w-full px-3 py-2 rounded-lg border hover:bg-red-50 text-left"${code?' disabled':''}>Xoá device (khi không gắn mã)</button>
            </div>
          </div>
        </div>
      </div>`;
    root.querySelector('#da-close').onclick = ()=> root.innerHTML='';

    // Đổi tên
    root.querySelector('#act-rename').onclick = async ()=>{
      const v = prompt('Nhập tên máy (để trống để xoá):', name||'');
      if (v===null) return;
      try{
        const s = String(v).trim();
        if (s) await db.ref(`devices/${id}/name`).set(s);
        else await db.ref(`devices/${id}/name`).remove();
        root.innerHTML='';
      }catch(e){ alert('Đặt tên lỗi: '+(e?.message||e)); }
    };

    // Reload
    root.querySelector('#act-reload').onclick = async ()=>{
      try{
        await db.ref(`devices/${id}/commands/reloadAt`).set(firebase.database.ServerValue.TIMESTAMP);
        root.innerHTML='';
      }catch(e){ alert('Gửi reload lỗi: '+(e?.message||e)); }
    };

    // Đổi bàn (grid nổi TRÊN popup)
    root.querySelector('#act-table').onclick = ()=> openTablePicker(async (tableLabel)=>{
      try{
        await db.ref(`devices/${id}/commands/setTable`).set({ value: tableLabel, at: firebase.database.ServerValue.TIMESTAMP });
        await db.ref(`devices/${id}`).update({ table: tableLabel, stage:'start' });
        root.innerHTML='';
      }catch(e){ alert('Đổi số bàn lỗi: '+(e?.message||e)); }
    });

    // Toggle blackout theo bàn hiện tại
    root.querySelector('#act-toggle').onclick = async ()=>{
      if (!tableKey){ alert('Thiết bị chưa có bàn.'); return; }
      try{
        const ref = db.ref(`control/tables/${tableKey}/screen`);
        const cur = ((await ref.get()).val() || 'on').toString().toLowerCase();
        const next = (cur==='on')?'off':'on';
        await ref.set(next);
        root.innerHTML='';
      }catch(e){ alert('Đổi trạng thái màn hình bàn lỗi: '+(e?.message||e)); }
    };

    // Unbind (xác nhận mã)
    root.querySelector('#act-unbind').onclick = async ()=>{
      if (!code) return;
      const confirmCode = prompt(`Nhập lại MÃ đang gắn để gỡ liên kết (mã hiện tại: ${code}):`);
      if (confirmCode===null) return;
      if (String(confirmCode).trim().toUpperCase()!==String(code).toUpperCase()){
        alert('Mã xác nhận không khớp.'); return;
      }
      try{
        await db.ref('codes/'+code).transaction(cur=>{
          if (!cur) return cur;
          if (cur.boundDeviceId===id) return { ...cur, boundDeviceId:null, boundAt:null };
          return cur;
        });
        await db.ref(`devices/${id}/commands/unbindAt`).set(firebase.database.ServerValue.TIMESTAMP);
        await db.ref(`devices/${id}`).update({ code:null, table:null, stage:'select' });
        root.innerHTML='';
      }catch(e){ alert('Gỡ liên kết lỗi: '+(e?.message||e)); }
    };

    // Xoá device
    root.querySelector('#act-delete').onclick = async ()=>{
      if (code) return;
      if (!confirm('Xoá thiết bị khỏi danh sách?')) return;
      try{ await db.ref(`devices/${id}`).remove(); root.innerHTML=''; }
      catch(e){ alert('Xoá device lỗi: '+(e?.message||e)); }
    };
  }

  // ====== render device widgets ======
  const elCards = $('#devCards');
  function renderDevices(devices, tableScreens){
    if (!elCards) return;
    const arr = Object.entries(devices||{}).map(([id,v])=>({
      id, code: v?.code||'', name: v?.name||'',
      table: v?.table||'', stage: v?.stage||'select',
      lastSeen: v?.lastSeen||0
    }));
    // sort theo số bàn, rồi theo lastSeen mới nhất
    arr.sort((a,b)=>{
      const ta = Number(a.table)||1e9, tb=Number(b.table)||1e9;
      if (ta!==
