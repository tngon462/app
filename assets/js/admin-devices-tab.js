(function(){
  'use strict';

  // 22---------- helpers ----------
  const $  = (sel, root=document)=> root.querySelector(sel);
  const $$ = (sel, root=document)=> Array.from(root.querySelectorAll(sel));
  const log  = (...a)=> console.log('[devices-tab]', ...a);
  const warn = (...a)=> console.warn('[devices-tab]', ...a);
  const mask = (id)=> (!id ? '—' : (id.length<=4 ? id : id.slice(0,4)+'…'));

  const view = document.getElementById('viewDevices');
  if (!view) { warn('Không thấy #viewDevices'); return; }

  // ---------- Firebase + auth ẩn danh ----------
  async function ensureDB(){
    if (!window.firebase || !firebase.apps?.length) throw new Error('Firebase chưa init trước file này');
    if (!firebase.auth().currentUser){
      await firebase.auth().signInAnonymously();
      await new Promise(res=>{
        const un=firebase.auth().onAuthStateChanged(u=>{ if(u){ un(); res(); }});
      });
    }
    return firebase.database();
  }

  // ---------- links.json để chọn bàn ----------
  let LINKS_MAP = null;
  async function loadLinks(){
    try{
      const res = await fetch('./links.json?cb='+Date.now(), { cache:'no-store' });
      const data = await res.json();
      LINKS_MAP = data.links || data;
    }catch(e){
      LINKS_MAP = null;
      warn('Không tải được links.json, vẫn gửi số bàn được.');
    }
  }
  function openTablePicker(onPick){
    const keys = LINKS_MAP ? Object.keys(LINKS_MAP).sort((a,b)=>Number(a)-Number(b))
                           : Array.from({length:15},(_,i)=> String(i+1));
    const wrap = document.createElement('div');
    wrap.className = 'fixed inset-0 z-[9000] bg-black/50 flex items-center justify-center p-4';
    wrap.innerHTML = `
      <div class="bg-white rounded-xl shadow-lg w-full max-w-xl p-4">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-lg font-semibold">Chọn bàn</h3>
          <button id="tp-close" class="px-2 py-1 text-sm rounded border hover:bg-gray-50">Đóng</button>
        </div>
        <div id="tp-grid" class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 max-h-[70vh] overflow-auto"></div>
      </div>`;
    document.body.appendChild(wrap);
    const grid = wrap.querySelector('#tp-grid');
    keys.forEach(k=>{
      const b=document.createElement('button');
      b.className='px-3 py-3 rounded-lg border text-sm font-semibold hover:bg-blue-50';
      b.textContent='Bàn '+k;
      b.addEventListener('click', ()=>{ try{ onPick(k); } finally { document.body.removeChild(wrap);} });
      grid.appendChild(b);
    });
    wrap.querySelector('#tp-close').addEventListener('click', ()=> document.body.removeChild(wrap));
  }

  // ---------- Toolbar trên cùng ----------
  function ensureToolbar(db){
    let bar = $('#devices-toolbar', view);
    if (bar) return;

    bar = document.createElement('div');
    bar.id='devices-toolbar';
    bar.className='flex flex-wrap items-center gap-2 mb-4';
    bar.innerHTML = `
      <button id="btnReloadAll" class="px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700">Reload toàn bộ</button>
      <button id="btnToggleAll" class="px-3 py-2 rounded bg-gray-800 text-white hover:bg-black">Tắt toàn bộ</button>
      <span class="text-xs text-gray-500">• Tác động toàn bộ iPad</span>
    `;
    view.insertAdjacentElement('afterbegin', bar);

    const refScreen = db.ref('control/screen');
    const paint = (isOn)=>{
      const btn = $('#btnToggleAll', bar);
      if (isOn){
        btn.textContent='Tắt toàn bộ';
        btn.className='px-3 py-2 rounded bg-gray-800 text-white hover:bg-black';
      } else {
        btn.textContent='Bật toàn bộ';
        btn.className='px-3 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-700';
      }
    };
    refScreen.on('value', s=>{
      const isOn = (s.exists()? String(s.val()).toLowerCase() : 'on')==='on';
      paint(isOn);
    });

    $('#btnReloadAll', bar).addEventListener('click', async ()=>{
      try{ await db.ref('broadcast/reloadAt').set(firebase.database.ServerValue.TIMESTAMP); }
      catch(e){ alert('Reload toàn bộ lỗi: '+(e?.message||e)); }
    });
    $('#btnToggleAll', bar).addEventListener('click', async ()=>{
      const snap = await refScreen.get();
      const on = (snap.exists()? String(snap.val()).toLowerCase() : 'on')==='on';
      try{
        if (on){
          await refScreen.set('off');
        } else {
          await refScreen.set('on');
          const updates={}; for(let i=1;i<=15;i++) updates[`control/tables/${i}/screen`]='on';
          await db.ref().update(updates);
        }
      }catch(e){ alert('Ghi trạng thái toàn bộ lỗi: '+(e?.message||e)); }
    });
  }

  // ---------- containers để render ----------
  function pickContainers(){
    let tbody = document.getElementById('devBody') || document.getElementById('devices-tbody') || document.getElementById('devices_tbody');
    let grid  = document.getElementById('devicesGrid') || document.getElementById('devices-cards');
    if (!tbody && !grid){
      grid = document.createElement('div');
      grid.id='devicesGrid';
      grid.className='grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3';
      const anchor = $('#viewDevices h3')?.parentNode === view ? $('#viewDevices h3') : null;
      if (anchor) view.insertBefore(grid, anchor.nextSibling);
      else view.appendChild(grid);
      warn('Không thấy tbody → dùng lưới devicesGrid.');
    }
    return { tbody, grid };
  }

  // ---------- Popup hành động ----------
  function openActionPopup(db, id, data){
    const code  = data?.code  || '';
    const name  = data?.name  || '';
    const stage = data?.stage || 'select';
    const table = data?.table || '';

    const wrap = document.createElement('div');
    wrap.className = 'fixed inset-0 z-[9500] bg-black/50 flex items-center justify-center p-4';
    wrap.innerHTML = `
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5">
        <div class="flex items-center justify-between mb-3">
          <div class="font-semibold">Thiết bị ${mask(id)}</div>
          <button id="devact-close" class="px-2 py-1 text-sm rounded border hover:bg-gray-50">Đóng</button>
        </div>

        <div class="text-sm text-gray-600 mb-3">
          <div>ID đầy đủ: <span class="font-mono break-all">${id}</span></div>
          <div>Tên hiện tại: <strong>${name || '(chưa đặt)'}</strong> <button id="act-rename" class="ml-1 px-2 py-0.5 text-xs rounded border hover:bg-gray-50">Đổi tên</button></div>
          <div>Mã đang gắn: <span class="font-mono">${code || '—'}</span></div>
          <div>Bàn: <strong>${stage==='pos' ? ('+'+(table||'?')) : (stage==='start'? (table||'—') : '—')}</strong></div>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <button id="act-reload"  class="px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700">Làm mới</button>
          <button id="act-settbl" class="px-3 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-700">Đổi bàn</button>
          <button id="act-unbind" class="px-3 py-2 rounded bg-amber-600 text-white hover:bg-amber-700" ${code?'':'disabled'}>Gỡ mã</button>
          <button id="act-delete" class="px-3 py-2 rounded ${code?'bg-gray-100 opacity-50 cursor-not-allowed':'bg-red-600 text-white hover:bg-red-700'}" ${code?'disabled':''}>Xoá device</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    $('#devact-close', wrap).addEventListener('click', ()=> document.body.removeChild(wrap));

    // Đổi tên
    $('#act-rename', wrap).addEventListener('click', async ()=>{
      const v = prompt('Nhập tên máy (để trống để xoá):', name || '');
      if (v === null) return;
      try{
        const newName = String(v).trim();
        if (newName) await db.ref(`devices/${id}/name`).set(newName);
        else await db.ref(`devices/${id}/name`).remove();
        document.body.removeChild(wrap);
      }catch(e){ alert('Đặt tên lỗi: '+(e?.message||e)); }
    });

    // Làm mới
    $('#act-reload', wrap).addEventListener('click', async ()=>{
      try{
        await db.ref(`devices/${id}/commands/reloadAt`).set(firebase.database.ServerValue.TIMESTAMP);
        document.body.removeChild(wrap);
      }catch(e){ alert('Gửi reload lỗi: '+(e?.message||e)); }
    });

    // Đổi bàn
    $('#act-settbl', wrap).addEventListener('click', ()=>{
      openTablePicker(async (label)=>{
        try{
          await db.ref(`devices/${id}/commands/setTable`).set({ value: label, at: firebase.database.ServerValue.TIMESTAMP });
          await db.ref(`devices/${id}`).update({ table: label, stage: 'start' });
          document.body.removeChild(wrap);
        }catch(e){ alert('Đổi bàn lỗi: '+(e?.message||e)); }
      });
    });

    // Gỡ mã
    $('#act-unbind', wrap)?.addEventListener('click', async ()=>{
      if (!code) return;
      const verify = prompt(`Nhập lại MÃ đang gắn để gỡ (mã hiện tại: ${code}):`);
      if (verify === null) return;
      if (String(verify).trim().toUpperCase() !== String(code).toUpperCase()){
        alert('Mã xác nhận không khớp.'); return;
      }
      try{
        await db.ref('codes/'+code).transaction(cur=>{
          if (!cur) return cur;
          if (cur.boundDeviceId === id) return { ...cur, boundDeviceId:null, boundAt:null };
          return cur;
        });
        await db.ref(`devices/${id}/commands/unbindAt`).set(firebase.database.ServerValue.TIMESTAMP);
        await db.ref(`devices/${id}`).update({ code:null, table:null, stage:'select' });
        document.body.removeChild(wrap);
      }catch(e){ alert('Gỡ liên kết lỗi: '+(e?.message||e)); }
    });

    // Xoá device (chỉ khi không gắn mã)
    $('#act-delete', wrap).addEventListener('click', async ()=>{
      if (code) return; // đã bị disabled từ UI rồi
      if (!confirm('Xoá thiết bị khỏi danh sách?')) return;
      try{
        await db.ref(`devices/${id}`).remove();
        document.body.removeChild(wrap);
      }catch(e){ alert('Xoá device lỗi: '+(e?.message||e)); }
    });
  }

  // ---------- render bảng ----------
  function renderTable(tbody, db, devices){
    if (!tbody) return;
    tbody.innerHTML='';
    const list = Object.entries(devices||{}).sort((a,b)=> (b[1]?.lastSeen||0) - (a[1]?.lastSeen||0));
    if (!list.length){
      const tr=document.createElement('tr');
      tr.innerHTML=`<td colspan="4" class="px-2 py-3 text-center text-sm text-gray-500">Chưa có thiết bị nào.</td>`;
      tbody.appendChild(tr);
      return;
    }
    for (const [id,d] of list){
      const code=d?.code||''; const name=d?.name||''; const stage=d?.stage||'select'; const table=d?.table||'';
      let tableDisp='—'; if(stage==='start') tableDisp=table||'—'; else if(stage==='pos') tableDisp=table?('+'+table):'+?';
      const tr=document.createElement('tr');
      tr.className='border-b last:border-0 cursor-pointer hover:bg-gray-50';
      tr.innerHTML=`
        <td class="px-2 py-1 text-xs">
          <div class="flex items-center gap-2"><span class="font-mono" title="${id}">${mask(id)}</span>${name?`<span class="text-[11px] text-gray-500">(${name})</span>`:''}</div>
        </td>
        <td class="px-2 py-1 font-mono">${code||'—'}</td>
        <td class="px-2 py-1">${tableDisp}</td>
        <td class="px-2 py-1 text-right"><span class="text-xs text-gray-400">Nhấn để mở thao tác</span></td>
      `;
      tr.addEventListener('click', ()=> openActionPopup(db, id, d));
      tbody.appendChild(tr);
    }
  }

  // ---------- render lưới widget ----------
  function renderGrid(grid, db, devices){
    if (!grid) return;
    grid.innerHTML='';
    const list = Object.entries(devices||{}).sort((a,b)=> (b[1]?.lastSeen||0) - (a[1]?.lastSeen||0));
    if (!list.length){
      const p=document.createElement('div');
      p.className='text-center text-sm text-gray-500 py-3';
      p.textContent='Chưa có thiết bị nào.';
      grid.appendChild(p);
      return;
    }
    for (const [id,d] of list){
      const code=d?.code||''; const name=d?.name||''; const stage=d?.stage||'select'; const table=d?.table||'';
      let tableDisp='—'; if(stage==='start') tableDisp=table||'—'; else if(stage==='pos') tableDisp=table?('+'+table):'+?';
      const card=document.createElement('button');
      card.type='button';
      card.className='text-left rounded-xl border border-emerald-200 bg-emerald-50 p-3 shadow-sm hover:shadow cursor-pointer';
      card.innerHTML=`
        <div class="text-sm font-semibold">Thiết bị ${mask(id)} ${name?`<span class="text-gray-500 font-normal">(${name})</span>`:''}</div>
        <div class="text-xs text-gray-700 mt-1">Trạng thái bàn: ${tableDisp}</div>
        <div class="text-xs text-gray-700">Mã: ${code || '—'}</div>
        <div class="mt-1 text-[11px] text-gray-400">Nhấn để mở thao tác…</div>
      `;
      card.addEventListener('click', ()=> openActionPopup(db, id, d));
      grid.appendChild(card);
    }
  }

  // ---------- boot ----------
  document.addEventListener('DOMContentLoaded', async ()=>{
    try{
      const db = await ensureDB();
      await loadLinks();
      ensureToolbar(db);

      const { tbody, grid } = pickContainers();
      log('Containers:', { hasTbody: !!tbody, hasGrid: !!grid });

      db.ref('devices').on('value', s=>{
        const v = s.val() || {};
        if (tbody) renderTable(tbody, db, v);
        if (grid)  renderGrid(grid, db, v);
      }, e=> alert('Lỗi subscribe devices: '+(e?.message||e)));

      log('Ready.');
    }catch(e){
      console.error(e);
      alert('Lỗi khởi chạy tab Thiết bị: '+(e?.message||e));
    }
  });
})();
