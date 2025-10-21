// assets/js/admin-devices-tab.js
(function(){
  'use strict';

  //a1=============== Helpers ===============
  const $  = (sel, root=document)=> root.querySelector(sel);
  const $$ = (sel, root=document)=> Array.from(root.querySelectorAll(sel));
  const log  = (...a)=> console.log('[devices-tab]', ...a);
  const warn = (...a)=> console.warn('[devices-tab]', ...a);
  const mask = (id)=> (!id ? '—' : (id.length<=4 ? id : id.slice(0,4)+'…'));
  const safeRemove = (n)=>{ if (n && n.isConnected && n.parentNode) n.parentNode.removeChild(n); };

  const view = document.getElementById('viewDevices');
  if (!view) { warn('Không thấy #viewDevices'); return; }

  // =============== Firebase + Auth ===============
  async function ensureDB(){
    if (!window.firebase || !firebase.apps?.length) throw new Error('Firebase chưa init');

    if (!firebase.auth().currentUser){
      await firebase.auth().signInAnonymously();
      await new Promise(res=>{
        const un = firebase.auth().onAuthStateChanged(u=>{ if(u){ un(); res(); }});
      });
    }
    return firebase.database();
  }

  // =============== links.json (để chọn bàn) ===============
  let LINKS_MAP = null;
  async function loadLinks(){
    try{
      const res = await fetch('./links.json?cb='+Date.now(), { cache:'no-store' });
      const data = await res.json();
      LINKS_MAP = data.links || data;
      log('links.json entries:', LINKS_MAP ? Object.keys(LINKS_MAP).length : 0);
    }catch(e){
      LINKS_MAP = null;
      warn('Không tải được links.json (fallback số bàn mặc định).');
    }
  }
  function openTablePicker(onPick){
    const keys = LINKS_MAP
      ? Object.keys(LINKS_MAP).sort((a,b)=> Number(a)-Number(b))
      : Array.from({length:15}, (_,i)=> String(i+1));

    const wrap = document.createElement('div');
    wrap.className = 'fixed inset-0 z-[9600] bg-black/50 flex items-center justify-center p-4';
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
      const b = document.createElement('button');
      b.className = 'px-3 py-3 rounded-lg border text-sm font-semibold hover:bg-blue-50';
      b.textContent = 'Bàn ' + k;
      b.addEventListener('click', ()=>{ try{ onPick(k); } finally { safeRemove(wrap); }});
      grid.appendChild(b);
    });
    wrap.querySelector('#tp-close').addEventListener('click', ()=> safeRemove(wrap));
  }

  // =============== Toolbar: Reload toàn bộ + Bật/Tắt toàn bộ ===============
  const tableScreen = {};   // cache on/off từng bàn để tô màu widget
  function ensureToolbar(db){
    let bar = $('#devices-toolbar', view);
    if (bar) return;

    bar = document.createElement('div');
    bar.id = 'devices-toolbar';
    bar.className = 'flex flex-wrap items-center gap-2 mb-4';
    bar.innerHTML = `
      <button id="btnReloadAll" class="px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700">
        Reload toàn bộ
      </button>
      <button id="btnToggleAll" class="px-3 py-2 rounded bg-gray-800 text-white hover:bg-black">
        Tắt toàn bộ
      </button>
      <span class="text-xs text-gray-500">• Tác động toàn bộ iPad</span>
    `;
    // chèn lên đầu viewDevices
    view.insertAdjacentElement('afterbegin', bar);

    const refScreen = db.ref('control/screen');
    const paint = (isOn)=>{
      const btn = $('#btnToggleAll', bar);
      if (isOn){
        btn.textContent = 'Tắt toàn bộ';
        btn.className   = 'px-3 py-2 rounded bg-gray-800 text-white hover:bg-black';
      } else {
        btn.textContent = 'Bật toàn bộ';
        btn.className   = 'px-3 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-700';
      }
    };

    // phản chiếu trạng thái toàn quán lên nút
    refScreen.on('value', s=>{
      const isOn = (s.exists()? String(s.val()).toLowerCase() : 'on') === 'on';
      paint(isOn);
    });

    // Reload toàn bộ
    $('#btnReloadAll', bar).addEventListener('click', async ()=>{
      try{
        await db.ref('broadcast/reloadAt').set(firebase.database.ServerValue.TIMESTAMP);
      }catch(e){ alert('Reload toàn bộ lỗi: '+(e?.message||e)); }
    });

    // Bật/Tắt toàn bộ
    $('#btnToggleAll', bar).addEventListener('click', async ()=>{
      const snap = await refScreen.get();
      const on = (snap.exists()? String(snap.val()).toLowerCase() : 'on') === 'on';
      try{
        const updates = {};
        if (on){
          // Tắt toàn bộ
          await refScreen.set('off');
          for (let i=1;i<=15;i++){
            updates[`control/tables/${i}/screen`] = 'off';
            tableScreen[String(i)] = 'off';
          }
        }else{
          // Bật toàn bộ
          await refScreen.set('on');
          for (let i=1;i<=15;i++){
            updates[`control/tables/${i}/screen`] = 'on';
            tableScreen[String(i)] = 'on';
          }
        }
        await db.ref().update(updates);
        // re-render để đổi màu tất cả widget ngay
        const grid = document.getElementById('devicesGrid');
        if (grid && window.devicesCache) renderGrid(grid, db, window.devicesCache);
      }catch(e){
        alert('Ghi trạng thái toàn bộ lỗi: '+(e?.message||e));
      }
    });
  }

  // =============== Containers (tbody hoặc grid) ===============
  function pickContainers(){
    const tbody = document.getElementById('devBody')
              || document.getElementById('devices-tbody')
              || document.getElementById('devices_tbody');

    let grid  = document.getElementById('devicesGrid')
              || document.getElementById('devices-cards');

    if (!tbody && !grid){
      // fallback: tự tạo lưới ngay bên dưới heading của tab
      grid = document.createElement('div');
      grid.id = 'devicesGrid';
      grid.className = 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3';
      // tìm h3 trong viewDevices để chèn sau nó
      const title = $('#viewDevices h3');
      if (title && title.parentNode === view) view.insertBefore(grid, title.nextSibling);
      else view.appendChild(grid);
      warn('Không thấy tbody → dùng lưới devicesGrid.');
    }
    return { tbody, grid };
  }

  // =============== Popup hành động cho 1 device ===============
  function openActionPopup(db, id, data){
    const code  = data?.code  || '';
    const name  = data?.name  || '';
    const stage = data?.stage || 'select';
    const table = data?.table || '';

    const wrap = document.createElement('div');
    wrap.className = 'fixed inset-0 z-[9700] bg-black/50 flex items-center justify-center p-4';
    wrap.innerHTML = `
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5">
        <div class="flex items-center justify-between mb-3">
          <div class="font-semibold">Thiết bị ${mask(id)}</div>
          <button id="devact-close" class="px-2 py-1 text-sm rounded border hover:bg-gray-50">Đóng</button>
        </div>

        <div class="text-sm text-gray-600 mb-3">
          <div>ID đầy đủ: <span class="font-mono break-all">${id}</span></div>
          <div>Tên hiện tại: <strong>${name || '(chưa đặt)'}</strong>
            <button id="act-rename" class="ml-1 px-2 py-0.5 text-xs rounded border hover:bg-gray-50">Đổi tên</button>
          </div>
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
    $('#devact-close', wrap).addEventListener('click', ()=> safeRemove(wrap));

    // Đổi tên
    $('#act-rename', wrap).addEventListener('click', async ()=>{
      const v = prompt('Nhập tên máy (để trống để xoá):', name || '');
      if (v === null) return;
      try{
        const newName = String(v).trim();
        if (newName) await db.ref(`devices/${id}/name`).set(newName);
        else         await db.ref(`devices/${id}/name`).remove();
        safeRemove(wrap);
      }catch(e){ alert('Đặt tên lỗi: '+(e?.message||e)); }
    });

    // Làm mới
    $('#act-reload', wrap).addEventListener('click', async ()=>{
      try{
        await db.ref(`devices/${id}/commands/reloadAt`).set(firebase.database.ServerValue.TIMESTAMP);
        safeRemove(wrap);
      }catch(e){ alert('Gửi reload lỗi: '+(e?.message||e)); }
    });

    // Đổi bàn
    $('#act-settbl', wrap).addEventListener('click', ()=>{
      openTablePicker(async (label)=>{
        try{
          await db.ref(`devices/${id}/commands/setTable`).set({ value: label, at: firebase.database.ServerValue.TIMESTAMP });
          await db.ref(`devices/${id}`).update({ table: label, stage:'start' });
        }catch(e){ alert('Đổi bàn lỗi: '+(e?.message||e)); }
        safeRemove(wrap);
      });
    });

    // Gỡ mã (yêu cầu nhập lại mã đang gắn)
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
        safeRemove(wrap);
      }catch(e){ alert('Gỡ liên kết lỗi: '+(e?.message||e)); }
    });

    // Xoá device (chỉ khi không có mã gắn)
    $('#act-delete', wrap).addEventListener('click', async ()=>{
      if (code) return;
      if (!confirm('Xoá thiết bị khỏi danh sách?')) return;
      try{ await db.ref(`devices/${id}`).remove(); safeRemove(wrap); }
      catch(e){ alert('Xoá device lỗi: '+(e?.message||e)); }
    });
  }

  // =============== Sắp xếp theo bàn (ổn định UI) ===============
  function sortByTableThenId(entries){
    const toNum = (d)=>{
      const t = (d?.table ?? '').toString();
      const n = parseInt(t, 10);
      return isFinite(n) ? n : 99999; // chưa có bàn -> xuống cuối
    };
    return entries.sort((a,b)=>{
      const ta = toNum(a[1]), tb = toNum(b[1]);
      if (ta!==tb) return ta - tb;
      return a[0].localeCompare(b[0]); // tie-break theo deviceId
    });
  }

  // =============== Trạng thái blackout theo bàn ===============
  let devicesCache = {};  // để re-render khi tableScreen thay đổi
  function tableIsOn(table){
    const v = tableScreen[String(table)];
    return (String(v||'on').toLowerCase() === 'on');
  }

  // =============== Render bảng (nếu có tbody) ===============
  function renderTable(tbody, db, devices){
    if (!tbody) return;
    tbody.innerHTML = '';

    const list = sortByTableThenId(Object.entries(devices||{}));
    if (!list.length){
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="4" class="px-2 py-3 text-center text-sm text-gray-500">Chưa có thiết bị nào.</td>`;
      tbody.appendChild(tr);
      return;
    }

    for (const [id,d] of list){
      const code  = d?.code  || '';
      const name  = d?.name  || '';
      const stage = d?.stage || 'select';
      const table = d?.table || '';

      let tableDisp = '—';
      if (stage==='start') tableDisp = table || '—';
      else if (stage==='pos') tableDisp = table ? ('+'+table) : '+?';

      const tr = document.createElement('tr');
      tr.className = 'border-b last:border-0 cursor-pointer hover:bg-gray-50';
      tr.innerHTML = `
        <td class="px-2 py-1 text-xs">
          <div class="flex items-center gap-2">
            <span class="font-mono" title="${id}">${mask(id)}</span>
            ${name?`<span class="text-[11px] text-gray-500">(${name})</span>`:''}
          </div>
        </td>
        <td class="px-2 py-1 font-mono">${code || '—'}</td>
        <td class="px-2 py-1">${tableDisp}</td>
        <td class="px-2 py-1 text-right"><span class="text-xs text-gray-400">Nhấn để mở thao tác</span></td>
      `;
      tr.addEventListener('click', ()=> openActionPopup(db, id, d));
      tbody.appendChild(tr);
    }
  }

  // =============== Render lưới widget (1 toggle, click card mở popup) ===============
  function renderGrid(grid, db, devices){
    if (!grid) return;
    grid.innerHTML = '';

    const list = sortByTableThenId(Object.entries(devices||{}));
    if (!list.length){
      const p = document.createElement('div');
      p.className = 'text-center text-sm text-gray-500 py-3';
      p.textContent = 'Chưa có thiết bị nào.';
      grid.appendChild(p);
      return;
    }

    for (const [id,d] of list){
      const code   = d?.code  || '';
      const name   = d?.name  || '';
      const stage  = d?.stage || 'select';
      const table  = (d?.table || '') + '';
      const hasTable = !!table && !isNaN(parseInt(table, 10));

      let tableDisp = '—';
      if (stage === 'start') tableDisp = table || '—';
      else if (stage === 'pos') tableDisp = table ? ('+'+table) : '+?';

      const isOn = hasTable ? tableIsOn(table) : true;

      const card = document.createElement('div');
      card.className = isOn
        ? 'rounded-xl border border-emerald-200 bg-emerald-50 p-3 shadow-sm cursor-pointer transition'
        : 'rounded-xl border border-gray-300 bg-gray-100 p-3 shadow-sm cursor-pointer transition';

      card.innerHTML = `
        <div class="flex items-start justify-between gap-2">
          <div>
            <div class="text-sm font-semibold">
              Thiết bị ${mask(id)} ${name ? `<span class="text-gray-500 font-normal">(${name})</span>` : ''}
            </div>
            <div class="text-xs text-gray-700 mt-1">Bàn: ${tableDisp}</div>
            <div class="text-xs text-gray-700">Mã: ${code || '—'}</div>
          </div>

          <div class="flex items-center gap-2 select-none">
            <span data-role="status"
                  class="text-[11px] ${isOn ? 'text-emerald-700' : 'text-gray-500'}">
              ${isOn ? 'Đang bật' : 'Đang tắt'}
            </span>
            <div class="toggle ${hasTable ? '' : 'opacity-50'}">
              <input type="checkbox" id="sw-${id}" ${isOn ? 'checked' : ''} ${hasTable ? '' : 'disabled'}>
              <label for="sw-${id}" aria-label="Bật/Tắt theo bàn"></label>
            </div>
          </div>
        </div>
      `;

      // Click card -> mở popup
      card.addEventListener('click', ()=> openActionPopup(db, id, d));

      // Công tắc: không trigger click card
      const sw = card.querySelector('#sw-' + CSS.escape(id));
      const swLabel = sw ? card.querySelector('label[for="sw-' + CSS.escape(id) + '"]') : null;
      const statusEl = card.querySelector('[data-role="status"]');

      [sw, swLabel].forEach(el=>{
        if (el) el.addEventListener('click', ev=> ev.stopPropagation());
      });

      if (sw){
        sw.addEventListener('change', async ()=>{
          if (!hasTable){ sw.checked = true; return; }
          try{
            await db.ref(`control/tables/${table}/screen`).set(sw.checked ? 'on' : 'off');
          }catch(e){
            alert('Ghi trạng thái bàn lỗi: ' + (e?.message || e));
            sw.checked = !sw.checked; // revert
            return;
          }
          // Tô lại màu + chữ trạng thái
          const on = sw.checked;
          card.className = on
            ? 'rounded-xl border border-emerald-200 bg-emerald-50 p-3 shadow-sm cursor-pointer transition'
            : 'rounded-xl border border-gray-300 bg-gray-100 p-3 shadow-sm cursor-pointer transition';
          if (statusEl){
            statusEl.textContent = on ? 'Đang bật' : 'Đang tắt';
            statusEl.className = 'text-[11px] ' + (on ? 'text-emerald-700' : 'text-gray-500');
          }
        });
      }

      grid.appendChild(card);
    }
  }

  // =============== Boot ===============
  document.addEventListener('DOMContentLoaded', async ()=>{
    try{
      const db = await ensureDB();
      await loadLinks();
      ensureToolbar(db);

      const { tbody, grid } = pickContainers();

      // Lắng nghe devices
      db.ref('devices').on('value', s=>{
        window.devicesCache = devicesCache = s.val() || {};
        if (tbody) renderTable(tbody, db, devicesCache);
        if (grid)  renderGrid(grid, db, devicesCache);
      }, e=> alert('Lỗi subscribe devices: '+(e?.message||e)));

      // Lắng nghe trạng thái blackout từng bàn
      db.ref('control/tables').on('value', s=>{
        const v = s.val() || {};
        Object.keys(v).forEach(k=>{
          // chấp nhận 'on'/'off' hoặc {screen:'on'}
          tableScreen[String(k)] = (v[k]?.screen || v[k]);
        });
        const gridElm = document.getElementById('devicesGrid');
        if (gridElm && devicesCache) renderGrid(gridElm, db, devicesCache);
      }, e=> console.warn('Lỗi subscribe control/tables:', e?.message||e));

      log('Ready.');
    }catch(e){
      console.error(e);
      alert('Lỗi khởi chạy tab Thiết bị: '+(e?.message||e));
    }
  });
})();
