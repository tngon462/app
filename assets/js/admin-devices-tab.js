(function(){
  'use strict';

  const view = document.getElementById('viewDevices');
  if (!view) { console.warn('[devices-tab] missing #viewDevices'); return; }

  const $ = (sel, root=document)=> root.querySelector(sel);
  const maskId = (id)=> (!id ? '—' : (id.length<=4 ? id : id.slice(0,4)+'…'));

  // ---------- Firebase guard ----------
  async function ensureDB(){
    if (!window.firebase || !firebase.apps?.length) {
      throw new Error('Firebase chưa khởi tạo trước admin-devices-tab.js');
    }
    if (!firebase.auth().currentUser){
      await firebase.auth().signInAnonymously();
      await new Promise(res=>{
        const un = firebase.auth().onAuthStateChanged(u=>{ if(u){ un(); res(); }});
      });
    }
    return firebase.database();
  }

  // ---------- Toolbar (Reload + Toggle toàn bộ) ----------
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

  // ---------- Render bảng thiết bị (nếu có #devBody) ----------
  function renderDevicesTable(devs){
    const body = document.getElementById('devBody');
    if (!body) return; // không có bảng -> nhường UI khác lo
    body.innerHTML = '';

    const entries = Object.entries(devs||{}).sort((a,b)=>(b[1]?.lastSeen||0)-(a[1]?.lastSeen||0));
    for (const [id, d] of entries){
      const code  = d?.code || '';
      const stage = d?.stage || 'select';
      const table = d?.table || '';
      let tableDisp = '—';
      if (stage==='start') tableDisp = table || '—';
      else if (stage==='pos') tableDisp = table ? ('+'+table) : '+?';

      const tr = document.createElement('tr');
      tr.className = 'border-b last:border-0';
      tr.innerHTML = `
        <td class="px-2 py-1 text-xs">
          <span class="font-mono" title="${id}">${maskId(id)}</span>
        </td>
        <td class="px-2 py-1 font-mono">${code || '—'}</td>
        <td class="px-2 py-1">${tableDisp}</td>
        <td class="px-2 py-1">
          <div class="flex flex-wrap gap-2">
            <button class="px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700"   data-act="reload">Làm mới</button>
            <button class="px-2 py-1 text-xs rounded bg-amber-600 text-white hover:bg-amber-700" data-act="unbind" ${code?'':'disabled'}>Gỡ liên kết</button>
          </div>
        </td>
      `;
      // hành động cơ bản: reload + unbind (giữ nguyên quy ước cũ)
      tr.querySelector('[data-act="reload"]').addEventListener('click', async ()=>{
        try{
          await firebase.database().ref(`devices/${id}/commands/reloadAt`)
            .set(firebase.database.ServerValue.TIMESTAMP);
        }catch(e){ alert('Gửi reload lỗi: '+(e?.message||e)); }
      });
      tr.querySelector('[data-act="unbind"]')?.addEventListener('click', async ()=>{
        if (!code) return;
        const v = prompt(`Nhập lại MÃ đang gắn để gỡ (mã hiện tại: ${code}):`);
        if (v===null) return;
        if (String(v).trim().toUpperCase() !== String(code).toUpperCase()){
          alert('Mã xác nhận không khớp. Hủy.'); return;
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

      body.appendChild(tr);
    }
  }

  // ---------- Z-index patch cho popup chọn bàn (nếu dùng ở file khác) ----------
  (function(){
    const style = document.createElement('style');
    style.textContent = `.tp-modal, #tp-modal, .tngon-modal { z-index: 9000 !important; }`;
    document.head.appendChild(style);
  })();

  // ---------- Boot ----------
  document.addEventListener('DOMContentLoaded', async ()=>{
    try{
      const db = await ensureDB();

      // Toolbar + wiring
      const bar = ensureToolbar();
      const btnReloadAll = $('#btnReloadAll_top', bar);
      const btnToggleAll = $('#btnToggleAll', bar);
      const refScreen = db.ref('control/screen');

      // sync nút toggle theo trạng thái hiện tại
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
        const isOn = (s.exists() ? String(s.val()).toLowerCase() : 'on') === 'on';
        paintToggle(isOn);
      });

      btnReloadAll.addEventListener('click', async ()=>{
        try{
          await db.ref('broadcast/reloadAt').set(firebase.database.ServerValue.TIMESTAMP);
        }catch(e){ alert('Reload toàn bộ lỗi: '+(e?.message||e)); }
      });

      btnToggleAll.addEventListener('click', async ()=>{
        const snap = await refScreen.get();
        const currentlyOn = (snap.exists()? String(snap.val()).toLowerCase() : 'on') === 'on';
        try{
          if (currentlyOn){
            await refScreen.set('off');
          }else{
            await refScreen.set('on');
            const updates = {};
            for (let i=1;i<=15;i++) updates[`control/tables/${i}/screen`] = 'on';
            await db.ref().update(updates);
          }
        }catch(e){ alert('Ghi trạng thái toàn bộ lỗi: '+(e?.message||e)); }
      });

      // Subscribe devices để đổ vào bảng nếu có #devBody
      db.ref('devices').on('value',
        s=> renderDevicesTable(s.val()||{}),
        e=> alert('Lỗi tải thiết bị: '+(e?.message||e))
      );

      console.log('[devices-tab] Ready + subscribed devices.');
    }catch(e){
      console.error(e);
      alert('Lỗi khởi chạy tab Thiết bị: ' + (e?.message||e));
    }
  });
})();
