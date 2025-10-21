// assets/js/admin-devices-tab.js
(function(){
  'use strict';

  const $ = (id)=> document.getElementById(id);
  const modalRoot = $('modal-root');
  const devCards  = $('devCards');
  const errBox    = $('devError');

  let db = null;

  function showErr(m){ if(!errBox) return; errBox.textContent=m||''; errBox.classList.toggle('hidden', !m); }

  async function ensureFirebase(){
    if (!window.firebase || !firebase.apps?.length) throw new Error('Firebase chưa khởi tạo');
    db = firebase.database();
    if (!firebase.auth().currentUser){
      await firebase.auth().signInAnonymously();
      await new Promise(res=>{
        const un = firebase.auth().onAuthStateChanged(u=>{ if(u){ un(); res(); }});
      });
    }
  }

  // ===== links.json cho picker bàn
  let LINKS_MAP = null;
  async function loadLinks(){
    try{
      const res = await fetch('./links.json?cb='+Date.now(), {cache:'no-store'});
      const data = await res.json();
      LINKS_MAP = data.links || data;
      if(!LINKS_MAP || typeof LINKS_MAP !== 'object') LINKS_MAP = null;
    }catch{ LINKS_MAP = null; }
  }
  function openTablePicker(onPick){
    const keys = LINKS_MAP ? Object.keys(LINKS_MAP).sort((a,b)=>Number(a)-Number(b)) : Array.from({length:15},(_,i)=>String(i+1));
    const wrap = document.createElement('div');
    wrap.className = 'fixed inset-0 z-[8000] bg-black/50 flex items-center justify-center p-4';
    wrap.innerHTML = `
      <div class="bg-white rounded-xl shadow-xl w-full max-w-xl p-4">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-lg font-semibold">Chọn bàn</h3>
          <button id="tp-close" class="px-2 py-1 text-sm rounded bg-gray-100 hover:bg-gray-200">Đóng</button>
        </div>
        <div id="tp-grid" class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 max-h-[70vh] overflow-auto"></div>
      </div>`;
    (modalRoot||document.body).appendChild(wrap);
    const grid = wrap.querySelector('#tp-grid');
    keys.forEach(k=>{
      const b=document.createElement('button');
      b.className='px-3 py-3 rounded-lg border text-sm font-semibold hover:bg-blue-50';
      b.textContent='Bàn '+k;
      b.addEventListener('click', ()=>{ try{ onPick(k); }finally{ wrap.remove(); } });
      grid.appendChild(b);
    });
    wrap.querySelector('#tp-close').addEventListener('click', ()=> wrap.remove());
  }

  // ===== Render widget
  const maskId = (id)=> (!id ? '—' : (id.length<=4 ? id : id.slice(0,4)+'…'));

  function cardHtml(did, d){
    const name = d?.name || 'Thiết bị';
    const idMasked = maskId(did);
    const table = d?.table || '-';
    const stage = d?.stage || 'select';
    const code  = d?.code || '';
    const blackout = d?.blackout === 'off' ? 'TẮT' : 'BẬT'; // chỉ label dự phòng, real-time công tắc lấy từ control/tables
    const tableDisp = stage==='pos' ? ('+'+(table||'?')) : (stage==='start' ? (table||'—') : '—');

    return `
      <div class="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
        <div class="flex items-center justify-between gap-2">
          <div class="min-w-0">
            <div class="font-semibold truncate">${name}</div>
            <div class="text-xs text-gray-500">${idMasked}</div>
          </div>
          <button data-act="open" class="px-3 py-1.5 rounded-md bg-white border hover:bg-gray-50 text-sm">Mở</button>
        </div>

        <div class="mt-2 text-sm">
          <div>Trạng thái bàn: <span class="font-semibold">${tableDisp}</span></div>
          <div>Mã: <span class="font-mono">${code||'—'}</span></div>
        </div>

        <div class="mt-3 flex items-center justify-between">
          <div class="text-sm">Blackout:</div>
          <label class="inline-flex items-center gap-2">
            <span class="text-xs text-gray-500" data-role="blkState">…</span>
            <input type="checkbox" data-act="blkToggle" class="w-11 h-6 appearance-none rounded-full bg-gray-300 outline-none relative transition">
          </label>
        </div>
      </div>
    `;
  }

  function attachCardHandlers(card, did, d){
    // Action popup
    card.querySelector('[data-act="open"]').addEventListener('click', ()=>{
      const wrap = document.createElement('div');
      wrap.className = 'fixed inset-0 z-[9000] bg-black/50 flex items-center justify-center p-4';
      wrap.innerHTML = `
        <div class="bg-white rounded-xl shadow-xl w-full max-w-sm p-4">
          <div class="flex items-center justify-between mb-3">
            <div class="font-semibold">Thiết bị: ${maskId(did)}</div>
            <button id="ac-close" class="px-2 py-1 text-sm rounded bg-gray-100 hover:bg-gray-200">Đóng</button>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <button data-ac="reload" class="px-3 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700">Làm mới</button>
            <button data-ac="settable" class="px-3 py-2 rounded-md bg-emerald-600 text-white hover:bg-emerald-700">Đổi bàn</button>
            <button data-ac="unbind" class="px-3 py-2 rounded-md bg-amber-600 text-white hover:bg-amber-700" ${d?.code?'':'disabled'}>Gỡ mã</button>
            <button data-ac="delete" class="px-3 py-2 rounded-md ${d?.code?'bg-gray-200 opacity-60 cursor-not-allowed':'bg-gray-800 text-white hover:bg-black'}" ${d?.code?'disabled':''}>Xoá device</button>
          </div>
        </div>`;
      (modalRoot||document.body).appendChild(wrap);
      wrap.querySelector('#ac-close').addEventListener('click', ()=> wrap.remove());

      // actions
      const ac = (sel)=> wrap.querySelector(`[data-ac="${sel}"]`);
      ac('reload').addEventListener('click', async ()=>{
        try{ await db.ref(`devices/${did}/commands/reloadAt`).set(firebase.database.ServerValue.TIMESTAMP); }
        catch(e){ showErr('Gửi reload lỗi: '+(e?.message||e)); }
        wrap.remove();
      });
      ac('settable').addEventListener('click', ()=>{
        openTablePicker(async (t)=>{
          try{
            await db.ref(`devices/${did}/commands/setTable`).set({ value:t, at: firebase.database.ServerValue.TIMESTAMP });
            await db.ref(`devices/${did}`).update({ table:t, stage:'start' });
          }catch(e){ showErr('Đổi số bàn lỗi: '+(e?.message||e)); }
          wrap.remove();
        });
      });
      ac('unbind').addEventListener('click', async ()=>{
        const code = d?.code;
        if (!code) return;
        const verify = prompt(`Nhập lại MÃ đang gắn để gỡ (mã hiện tại: ${code})`);
        if (verify===null) return;
        if (String(verify).trim().toUpperCase() !== String(code).toUpperCase()) return alert('Mã xác nhận không khớp.');
        try{
          await db.ref('codes/'+code).transaction(cur=>{
            if (!cur) return cur;
            if (cur.boundDeviceId===did) return { ...cur, boundDeviceId:null, boundAt:null };
            return cur;
          });
          await db.ref(`devices/${did}/commands/unbindAt`).set(firebase.database.ServerValue.TIMESTAMP);
          await db.ref(`devices/${did}`).update({ code:null, table:null, stage:'select' });
        }catch(e){ showErr('Gỡ liên kết lỗi: '+(e?.message||e)); }
        wrap.remove();
      });
      ac('delete').addEventListener('click', async ()=>{
        if (d?.code) return;
        if (!confirm('Xoá thiết bị này khỏi danh sách?')) return;
        try{ await db.ref(`devices/${did}`).remove(); }
        catch(e){ showErr('Xoá device lỗi: '+(e?.message||e)); }
        wrap.remove();
      });
    });

    // Blackout toggle theo BÀN hiện tại
    const tgl = card.querySelector('[data-act="blkToggle"]');
    const st  = card.querySelector('[data-role="blkState"]');

    // nếu chưa có bàn → disable công tắc
    if (!d?.table){
      tgl.disabled = true;
      st.textContent = '—';
      return;
    }
    const tb = String(d.table);

    // subscribe trạng thái control/tables/<tb>/screen
    const ref = db.ref(`control/tables/${tb}/screen`);
    ref.on('value', snap=>{
      const v = (snap.val()||'on').toString().toLowerCase();
      const isOn = v==='on';
      tgl.checked = isOn;
      st.textContent = isOn ? 'BẬT' : 'TẮT';
      // style switch
      tgl.style.background = isOn ? '#10b981' : '#d1d5db';
    }, e=>{ st.textContent = 'lỗi'; });

    tgl.addEventListener('change', async ()=>{
      try{
        await ref.set(tgl.checked ? 'on' : 'off');
      }catch(e){
        showErr('Đổi blackout thất bại: '+(e?.message||e));
        // revert
        tgl.checked = !tgl.checked;
      }
    });
  }

  function renderDevices(devices){
    devCards.innerHTML = '';
    const entries = Object.entries(devices||{})
      .sort((a,b)=>{
        const ta = Number(a[1]?.table||0)||0;
        const tb = Number(b[1]?.table||0)||0;
        if (ta && tb) return ta - tb;
        if (ta) return -1;
        if (tb) return 1;
        return (b[1]?.lastSeen||0) - (a[1]?.lastSeen||0);
      });

    entries.forEach(([id,d])=>{
      const wrap = document.createElement('div');
      wrap.innerHTML = cardHtml(id,d);
      const card = wrap.firstElementChild;
      devCards.appendChild(card);
      attachCardHandlers(card, id, d);
    });
  }

  // Header buttons
  function wireHeader(){
    $('#btnPowerOnAll')?.addEventListener('click', async ()=>{
      try{ await db.ref('control/screen').set('on'); }
      catch(e){ showErr('Bật toàn bộ lỗi: '+(e?.message||e)); }
    });
    $('#btnPowerOffAll')?.addEventListener('click', async ()=>{
      try{ await db.ref('control/screen').set('off'); }
      catch(e){ showErr('Tắt toàn bộ lỗi: '+(e?.message||e)); }
    });
    $('#btnReloadAll')?.addEventListener('click', async ()=>{
      try{ await db.ref('broadcast/reloadAt').set(firebase.database.ServerValue.TIMESTAMP); }
      catch(e){ showErr('Reload toàn bộ lỗi: '+(e?.message||e)); }
    });
  }

  document.addEventListener('DOMContentLoaded', async ()=>{
    try{
      await ensureFirebase();
      await loadLinks();
      wireHeader();
      // Subscriptions
      db.ref('devices').on('value',
        s=> renderDevices(s.val()||{}),
        e=> showErr('Lỗi tải thiết bị: '+(e?.message||e))
      );
    }catch(e){
      console.error(e);
      showErr('Lỗi khởi chạy: '+(e?.message||e));
    }
  });
})();
