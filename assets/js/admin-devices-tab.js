<!-- assets/js/admin-devices-tab.js (auto-build containers) -->
<script>
(function(){
  'use strict';

  const $ = (sel,root=document)=> root.querySelector(sel);
  const byNum = (a,b)=> (Number(a)||1e9) - (Number(b)||1e9);
  const mask = (s)=> s ? (s.length<=4 ? s : s.slice(0,4)+'…') : '—';
  const modalRoot = ()=> $('#modal-root') || (()=>{ const d=document.createElement('div'); d.id='modal-root'; document.body.appendChild(d); return d; })();

  let db=null;
  async function ensureAuth(){
    if (!window.firebase || !firebase.apps?.length) throw new Error('Firebase chưa khởi tạo');
    db = firebase.database();
    if (!firebase.auth().currentUser){
      await firebase.auth().signInAnonymously();
      await new Promise(res=>{ const un=firebase.auth().onAuthStateChanged(u=>{ if(u){un();res();} }); });
    }
  }

  // ===== links.json =====
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

  // ====== auto build Devices UI if missing ======
  function ensureDevicesUI(){
    const view = $('#viewDevices');
    if (!view) return null;

    // Header actions row
    let hdr = $('#devicesHeaderActions', view);
    if (!hdr){
      hdr = document.createElement('div');
      hdr.id = 'devicesHeaderActions';
      hdr.className = 'flex flex-wrap items-center gap-2 mb-4';
      hdr.innerHTML = `
        <button id="btnReloadAll" class="px-3 py-2 bg-blue-600 text-white rounded">Reload toàn bộ</button>
        <span class="text-xs text-gray-500">• Dùng khi muốn tất cả iPad tải lại ngay</span>
      `;
      // chèn ngay dưới tiêu đề h2
      const h2 = $('h2', view);
      if (h2 && h2.nextSibling) view.insertBefore(hdr, h2.nextSibling);
      else view.appendChild(hdr);
    }

    // Cards grid
    let grid = $('#devCards', view);
    if (!grid){
      grid = document.createElement('div');
      grid.id = 'devCards';
      grid.className = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3';
      // đặt grid lên TRÊN các box cũ (codes/devices table), để tránh đè
      const boxes = view.querySelectorAll('.bg-white.rounded-xl');
      if (boxes.length) view.insertBefore(grid, boxes[0]);
      else view.appendChild(grid);
    }
    return {view, hdr, grid};
  }

  // ====== Global toggle (on/off all) ======
  function mountGlobalPowerToggle(hdr){
    if (!hdr) return;
    // Xoá nút cũ nếu có
    $('#btnPowerOnAll')?.remove();
    $('#btnPowerOffAll')?.remove();
    // Thêm 1 nút toggle
    let btn = $('#btnPowerToggle', hdr);
    if (!btn){
      btn = document.createElement('button');
      btn.id = 'btnPowerToggle';
      btn.className = 'px-3 md:px-4 py-2 rounded-lg text-white';
      btn.style.minWidth = '120px';
      btn.textContent = 'Đang tải…';
      hdr.insertBefore(btn, $('#btnReloadAll'));
    }
    const refScreen = db.ref('control/screen');

    refScreen.on('value', s=>{
      const v = (s.val()||'on').toString().toLowerCase();
      const isOn = v==='on';
      btn.textContent = isOn ? 'Đang BẬT' : 'Đang TẮT';
      btn.classList.toggle('bg-emerald-600', isOn);
      btn.classList.toggle('hover:bg-emerald-700', isOn);
      btn.classList.toggle('bg-gray-800', !isOn);
      btn.classList.toggle('hover:bg-black', !isOn);
    });

    btn.onclick = async ()=>{
      try{
        const cur = ((await refScreen.get()).val()||'on').toString().toLowerCase();
        const next = cur==='on' ? 'off' : 'on';
        await refScreen.set(next);
        if (next==='on'){
          const updates={}; for(let i=1;i<=15;i++) updates[`control/tables/${i}/screen`]='on';
          await db.ref().update(updates);
        }
      }catch(e){ alert('Đổi trạng thái toàn bộ lỗi: '+(e?.message||e)); }
    };

    $('#btnReloadAll')?.addEventListener('click', async ()=>{
      try{
        await db.ref('broadcast/reloadAt').set(firebase.database.ServerValue.TIMESTAMP);
      }catch(e){ alert('Reload toàn bộ lỗi: '+(e?.message||e)); }
    });
  }

  // ====== popup device actions ======
  function openDeviceActions(dev){
    const { id, code, table, name } = dev;
    const root = modalRoot();
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

    root.querySelector('#act-rename').onclick = async ()=>{
      const v = prompt('Nhập tên máy (để trống để xoá):', name||'');
      if (v===null) return;
      const s = String(v).trim();
      try{
        if (s) await db.ref(`devices/${id}/name`).set(s);
        else await db.ref(`devices/${id}/name`).remove();
        root.innerHTML='';
      }catch(e){ alert('Đặt tên lỗi: '+(e?.message||e)); }
    };
    root.querySelector('#act-reload').onclick = async ()=>{
      try{ await db.ref(`devices/${id}/commands/reloadAt`).set(firebase.database.ServerValue.TIMESTAMP); root.innerHTML=''; }
      catch(e){ alert('Gửi reload lỗi: '+(e?.message||e)); }
    };
    root.querySelector('#act-table').onclick = ()=> openTablePicker(async (tb)=>{
      try{
        await db.ref(`devices/${id}/commands/setTable`).set({ value: tb, at: firebase.database.ServerValue.TIMESTAMP });
        await db.ref(`devices/${id}`).update({ table: tb, stage:'start' });
        root.innerHTML='';
      }catch(e){ alert('Đổi số bàn lỗi: '+(e?.message||e)); }
    });
    root.querySelector('#act-toggle').onclick = async ()=>{
      const tb = String(table||'');
      if (!tb){ alert('Thiết bị chưa có bàn.'); return; }
      try{
        const ref = db.ref(`control/tables/${tb}/screen`);
        const cur = ((await ref.get()).val() || 'on').toString().toLowerCase();
        await ref.set(cur==='on'?'off':'on');
        root.innerHTML='';
      }catch(e){ alert('Đổi trạng thái màn hình bàn lỗi: '+(e?.message||e)); }
    };
    root.querySelector('#act-unbind').onclick = async ()=>{
      if (!code) return;
      const confirmCode = prompt(`Nhập lại MÃ đang gắn để gỡ liên kết (mã hiện tại: ${code}):`);
      if (confirmCode===null) return;
      if (String(confirmCode).trim().toUpperCase()!==String(code).toUpperCase()){ alert('Mã xác nhận không khớp.'); return; }
      try{
        await db.ref('codes/'+code).transaction(cur=>{ if(!cur) return cur; if(cur.boundDeviceId===id) return {...cur, boundDeviceId:null, boundAt:null}; return cur; });
        await db.ref(`devices/${id}/commands/unbindAt`).set(firebase.database.ServerValue.TIMESTAMP);
        await db.ref(`devices/${id}`).update({ code:null, table:null, stage:'select' });
        root.innerHTML='';
      }catch(e){ alert('Gỡ liên kết lỗi: '+(e?.message||e)); }
    };
    root.querySelector('#act-delete').onclick = async ()=>{
      if (code) return;
      if (!confirm('Xoá thiết bị khỏi danh sách?')) return;
      try{ await db.ref(`devices/${id}`).remove(); root.innerHTML=''; }
      catch(e){ alert('Xoá device lỗi: '+(e?.message||e)); }
    };
  }

  // ====== render cards ======
  function renderDevices(devices, tableScreens){
    const grid = $('#devCards');
    if (!grid) return;
    const arr = Object.entries(devices||{}).map(([id,v])=>({
      id, code: v?.code||'', name: v?.name||'',
      table: v?.table||'', stage: v?.stage||'select',
      lastSeen: v?.lastSeen||0
    }));
    arr.sort((a,b)=>{
      const ta = Number(a.table)||1e9, tb=Number(b.table)||1e9;
      if (ta!==tb) return ta-tb;
      return (b.lastSeen||0)-(a.lastSeen||0);
    });

    grid.innerHTML='';
    arr.forEach(d=>{
      const t = d.table;
      const scr = (tableScreens && t && tableScreens[t]) || 'on';
      const isOff = String(scr).toLowerCase()==='off';
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'text-left w-full rounded-xl border shadow-sm p-3 transition hover:shadow bg-white';
      card.innerHTML = `
        <div class="flex items-center justify-between">
          <div class="min-w-0">
            <div class="font-semibold text-gray-800">
              <span class="cursor-pointer underline-offset-2 hover:underline" data-role="devId">${mask(d.id)}</span>
              ${d.name?`<span class="text-gray-500">· ${d.name}</span>`:''}
            </div>
            <div class="text-xs text-gray-600 mt-0.5">Mã: <span class="font-mono">${d.code||'—'}</span></div>
            <div class="text-xs text-gray-600">Bàn: ${d.stage==='pos' && d.table ? ('+'+d.table) : (d.table||'—')}</div>
          </div>
          <div class="shrink-0">
            <span class="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs ${isOff?'bg-gray-200 text-gray-700':'bg-emerald-100 text-emerald-700'}">
              <span class="w-2 h-2 rounded-full ${isOff?'bg-gray-500':'bg-emerald-500'}"></span>
              ${isOff?'ĐANG TẮT':'ĐANG BẬT'}
            </span>
          </div>
        </div>`;
      // đổi tên nhanh khi bấm ID
      card.querySelector('[data-role="devId"]').addEventListener('click', (ev)=>{
        ev.stopPropagation();
        const v = prompt('Nhập tên máy (để trống để xoá):', d.name||'');
        if (v===null) return;
        const s = String(v).trim();
        if (s) db.ref(`devices/${d.id}/name`).set(s);
        else db.ref(`devices/${d.id}/name`).remove();
      });
      // mở popup actions khi bấm thẻ
      card.addEventListener('click', ()=> openDeviceActions(d));
      grid.appendChild(card);
    });
  }

  // ====== boot ======
  document.addEventListener('DOMContentLoaded', async ()=>{
    try{
      await ensureAuth();
      await loadLinks();

      const ui = ensureDevicesUI();   // <-- tự tạo UI nếu thiếu
      if (ui) mountGlobalPowerToggle(ui.hdr);

      // subscribe trạng thái bàn + devices
      let tableScreens = {};
      db.ref('control/tables').on('value', s=>{
        const v = s.val()||{}; const map={}; Object.keys(v).forEach(k=> map[k]= (v[k]?.screen||'on'));
        tableScreens = map;
      });
      db.ref('devices').on('value', s=> renderDevices(s.val()||{}, tableScreens));
    }catch(e){
      console.error('[devices-tab] init error:', e);
      alert('Lỗi khởi chạy tab Thiết bị: '+(e?.message||e));
    }
  });
})();
</script>
