(function(){
  'use strict';

  // 11====== tiny helpers ======
  const $  = (sel, root=document)=> root.querySelector(sel);
  const log  = (...a)=> console.log('[devices-tab]', ...a);
  const warn = (...a)=> console.warn('[devices-tab]', ...a);
  const err  = (...a)=> console.error('[devices-tab]', ...a);
  const mask = (id)=> (!id ? '—' : (id.length<=4 ? id : id.slice(0,4)+'…'));

  // ====== ensure parent view ======
  const view = document.getElementById('viewDevices');
  if (!view) { warn('Không thấy #viewDevices → dừng.'); return; }

  // ====== Firebase guard & auth anon ======
  async function ensureDB(){
    if (!window.firebase || !firebase.apps?.length) {
      throw new Error('Firebase chưa init trước admin-devices-tab.js');
    }
    if (!firebase.auth().currentUser){
      await firebase.auth().signInAnonymously();
      await new Promise(res=>{
        const un = firebase.auth().onAuthStateChanged(u=>{ if(u){ un(); res(); }});
      });
    }
    return firebase.database();
  }

  // ====== Toolbar: Reload all + toggle all ON/OFF (1 nút) ======
  function ensureToolbar(){
    let bar = $('#devices-toolbar', view);
    if (bar) return bar;

    bar = document.createElement('div');
    bar.id = 'devices-toolbar';
    bar.className = 'flex flex-wrap items-center gap-2 mb-4';

    const btnReloadAll = document.createElement('button');
    btnReloadAll.id = 'btnReloadAll_top';
    btnReloadAll.className = 'px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700';
    btnReloadAll.textContent = 'Reload toàn bộ';

    const btnToggleAll = document.createElement('button');
    btnToggleAll.id = 'btnToggleAll';
    btnToggleAll.className = 'px-3 py-2 rounded bg-gray-800 text-white hover:bg-black';
    btnToggleAll.textContent = 'Tắt toàn bộ';

    const hint = document.createElement('span');
    hint.className = 'text-xs text-gray-500';
    hint.textContent = '• Tác động toàn bộ iPad';

    view.insertAdjacentElement('afterbegin', bar);
    bar.appendChild(btnReloadAll);
    bar.appendChild(btnToggleAll);
    bar.appendChild(hint);
    return bar;
  }

  // ====== Pick container(s) for render ======
  function getContainers(){
    // bảng tbody mới
    let tbody = document.getElementById('devBody');
    // bảng tbody cũ
    if (!tbody) tbody = document.getElementById('devices-tbody') || document.getElementById('devices_tbody');
    // lưới thẻ (nếu không có bảng)
    let grid  = document.getElementById('devicesGrid') || document.getElementById('devices-cards');
    if (!tbody && !grid) {
      // tự tạo lưới nếu không có gì
      grid = document.createElement('div');
      grid.id = 'devicesGrid';
      grid.className = 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3';
      // tìm vị trí nhét: dưới tiêu đề gần nhất trong #viewDevices
      const h3 = $('#viewDevices h3');
      if (h3 && h3.parentNode === view) {
        view.insertBefore(grid, h3.nextSibling);
      } else {
        view.appendChild(grid);
      }
      warn('Không thấy #devBody/#devices-tbody — tạo tạm #devicesGrid.');
    }
    return { tbody, grid };
  }

  // ====== Renderers ======
  function renderTable(tbody, devices){
    if (!tbody) return;
    tbody.innerHTML = '';
    const list = Object.entries(devices||{}).sort((a,b)=>(b[1]?.lastSeen||0)-(a[1]?.lastSeen||0));

    if (!list.length){
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="4" class="px-2 py-3 text-center text-sm text-gray-500">Chưa có thiết bị nào online.</td>`;
      tbody.appendChild(tr);
      return;
    }

    for (const [id, d] of list){
      const code  = d?.code  || '';
      const name  = d?.name  || '';
      const stage = d?.stage || 'select';
      const table = d?.table || '';
      let tableDisp = '—';
      if (stage==='start') tableDisp = table || '—';
      else if (stage==='pos') tableDisp = table ? ('+'+table) : '+?';

      const tr = document.createElement('tr');
      tr.className = 'border-b last:border-0';
      tr.innerHTML = `
        <td class="px-2 py-1 text-xs">
          <div class="flex items-center gap-2">
            <span class="font-mono" title="${id}">${mask(id)}</span>
            ${name ? `<span class="text-[11px] text-gray-500">(${name})</span>` : ''}
          </div>
        </td>
        <td class="px-2 py-1 font-mono">${code || '—'}</td>
        <td class="px-2 py-1">${tableDisp}</td>
        <td class="px-2 py-1">
          <div class="flex flex-wrap gap-2">
            <button class="px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700" data-act="reload">Làm mới</button>
            <button class="px-2 py-1 text-xs rounded bg-amber-600 text-white hover:bg-amber-700" data-act="unbind" ${code?'':'disabled'}>Gỡ liên kết</button>
          </div>
        </td>`;
      // actions
      tr.querySelector('[data-act="reload"]').addEventListener('click', async ()=>{
        try{
          await firebase.database().ref(`devices/${id}/commands/reloadAt`)
            .set(firebase.database.ServerValue.TIMESTAMP);
        }catch(e){ alert('Gửi reload lỗi: '+(e?.message||e)); }
      });
      tr.querySelector('[data-act="unbind"]')?.addEventListener('click', async ()=>{
        if (!code) return;
        const verify = prompt(`Nhập lại MÃ đang gắn để gỡ (mã hiện tại: ${code}):`);
        if (verify===null) return;
        if (String(verify).trim().toUpperCase() !== String(code).toUpperCase()){
          alert('Mã xác nhận không khớp.'); return;
        }
        try{
          await firebase.database().ref('codes/'+code).transaction(cur=>{
            if (!cur) return cur;
            if (cur.boundDeviceId === id) return { ...cur, boundDeviceId:null, boundAt:null };
            return cur;
          });
          await firebase.database().ref(`devices/${id}/commands/unbindAt`)
            .set(firebase.database.ServerValue.TIMESTAMP);
          await firebase.database().ref(`devices/${id}`).update({ code:null, table:null, stage:'select' });
        }catch(e){ alert('Gỡ liên kết lỗi: '+(e?.message||e)); }
      });

      tbody.appendChild(tr);
    }
  }

  function renderGrid(grid, devices){
    if (!grid) return;
    grid.innerHTML = '';
    const list = Object.entries(devices||{}).sort((a,b)=>(b[1]?.lastSeen||0)-(a[1]?.lastSeen||0));

    if (!list.length){
      const p = document.createElement('div');
      p.className = 'text-center text-sm text-gray-500 py-3';
      p.textContent = 'Chưa có thiết bị nào online.';
      grid.appendChild(p);
      return;
    }

    for (const [id, d] of list){
      const code  = d?.code  || '';
      const name  = d?.name  || '';
      const stage = d?.stage || 'select';
      const table = d?.table || '';
      let tableDisp = '—';
      if (stage==='start') tableDisp = table || '—';
      else if (stage==='pos') tableDisp = table ? ('+'+table) : '+?';

      const card = document.createElement('div');
      card.className = 'rounded-xl border border-emerald-200 bg-emerald-50 p-3 shadow-sm';
      card.innerHTML = `
        <div class="text-sm font-semibold">Thiết bị ${mask(id)} ${name?`<span class="text-gray-500 font-normal">(${name})</span>`:''}</div>
        <div class="text-xs text-gray-700 mt-1">Trạng thái bàn: ${tableDisp}</div>
        <div class="text-xs text-gray-700">Mã: ${code || '—'}</div>
        <div class="flex gap-2 mt-2">
          <button class="px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700" data-act="reload">Làm mới</button>
          <button class="px-2 py-1 text-xs rounded bg-amber-600 text-white hover:bg-amber-700" data-act="unbind" ${code?'':'disabled'}>Gỡ liên kết</button>
        </div>`;
      card.querySelector('[data-act="reload"]').addEventListener('click', async ()=>{
        try{
          await firebase.database().ref(`devices/${id}/commands/reloadAt`)
            .set(firebase.database.ServerValue.TIMESTAMP);
        }catch(e){ alert('Gửi reload lỗi: '+(e?.message||e)); }
      });
      card.querySelector('[data-act="unbind"]')?.addEventListener('click', async ()=>{
        if (!code) return;
        const verify = prompt(`Nhập lại MÃ đang gắn để gỡ (mã hiện tại: ${code}):`);
        if (verify===null) return;
        if (String(verify).trim().toUpperCase() !== String(code).toUpperCase()){
          alert('Mã xác nhận không khớp.'); return;
        }
        try{
          await firebase.database().ref('codes/'+code).transaction(cur=>{
            if (!cur) return cur;
            if (cur.boundDeviceId === id) return { ...cur, boundDeviceId:null, boundAt:null };
            return cur;
          });
          await firebase.database().ref(`devices/${id}/commands/unbindAt`)
            .set(firebase.database.ServerValue.TIMESTAMP);
          await firebase.database().ref(`devices/${id}`).update({ code:null, table:null, stage:'select' });
        }catch(e){ alert('Gỡ liên kết lỗi: '+(e?.message||e)); }
      });

      grid.appendChild(card);
    }
  }

  // ====== Boot ======
  document.addEventListener('DOMContentLoaded', async ()=>{
    try{
      const db = await ensureDB();
      const bar = ensureToolbar();

      // Toggle toàn bộ theo /control/screen
      const refScreen = db.ref('control/screen');
      const btnReloadAll = $('#btnReloadAll_top', bar);
      const btnToggleAll = $('#btnToggleAll', bar);

      function paintToggle(isOn){
        if (isOn){
          btnToggleAll.textContent = 'Tắt toàn bộ';
          btnToggleAll.className = 'px-3 py-2 rounded bg-gray-800 text-white hover:bg-black';
        }else{
          btnToggleAll.textContent = 'Bật toàn bộ';
          btnToggleAll.className = 'px-3 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-700';
        }
      }
      refScreen.on('value', s=>{
        const isOn = (s.exists()? String(s.val()).toLowerCase() : 'on') === 'on';
        paintToggle(isOn);
      });

      btnReloadAll.addEventListener('click', async ()=>{
        try{
          await db.ref('broadcast/reloadAt').set(firebase.database.ServerValue.TIMESTAMP);
        }catch(e){ alert('Reload toàn bộ lỗi: '+(e?.message||e)); }
      });
      btnToggleAll.addEventListener('click', async ()=>{
        const snap = await refScreen.get();
        const on = (snap.exists()? String(snap.val()).toLowerCase() : 'on') === 'on';
        try{
          if (on){
            await refScreen.set('off');
          }else{
            await refScreen.set('on');
            const updates={}; for(let i=1;i<=15;i++) updates[`control/tables/${i}/screen`]='on';
            await db.ref().update(updates);
          }
        }catch(e){ alert('Ghi trạng thái toàn bộ lỗi: '+(e?.message||e)); }
      });

      const { tbody, grid } = getContainers();
      log('Containers:', { hasTbody: !!tbody, hasGrid: !!grid });

      db.ref('devices').on('value',
        snap=>{
          const val = snap.val() || {};
          if (tbody) renderTable(tbody, val);
          if (grid)  renderGrid(grid, val);
          if (!tbody && !grid) warn('Không có container để render.');
        },
        e=> alert('Lỗi subscribe devices: '+(e?.message||e))
      );

      log('Ready. Subscribed /devices.');
    }catch(e){
      err(e);
      alert('Lỗi khởi chạy tab Thiết bị: ' + (e?.message||e));
    }
  });
})();
