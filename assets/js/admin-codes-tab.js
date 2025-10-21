// assets/js/admin-codes-tab.js
// Tab "Mã": hàng đợi, thêm mã, toggle ON/OFF, xóa mã
// - Không đổi logic backend (tắt/xóa mã -> app đang dùng sẽ out)

(function(){
  'use strict';

  const $  = (sel,root=document)=> root.querySelector(sel);
  const $$ = (sel,root=document)=> Array.from(root.querySelectorAll(sel));
  let db=null;

  async function ensureFirebase(){
    if (!window.firebase || !firebase.apps?.length) {
      throw new Error('Firebase chưa init.');
    }
    db = firebase.database();
    if (!firebase.auth().currentUser){
      await firebase.auth().signInAnonymously();
      await new Promise(r=>{
        const un = firebase.auth().onAuthStateChanged(u=>{ if(u){ un(); r(); }});
      });
    }
  }

  function elCodesBody(){ return document.getElementById('codesBody'); }
  function elErr(){ return document.getElementById('codesError'); }
  function showErr(msg){ const e=elErr(); if(!e) return; e.textContent=msg||''; e.classList.toggle('hidden', !msg); }

  function ensureQueueBox(){
    const wrap = document.getElementById('codesQueueWrap');
    const list = document.getElementById('codesQueue');
    const count= document.getElementById('codesQueueCount');
    const copy = document.getElementById('btnCopyQueue');
    if (copy && list){
      copy.onclick = ()=>{
        const items = Array.from(list.querySelectorAll('[data-code]')).map(x=>x.dataset.code);
        if (!items.length) return alert('Không có mã khả dụng.');
        navigator.clipboard.writeText(items.join('\n')).then(()=> alert('Đã copy.'));
      };
    }
    return {wrap, list, count};
  }

  function renderQueue(codes){
    const {wrap, list, count} = ensureQueueBox();
    if (!wrap || !list) return;
    const avail = Object.entries(codes||{})
      .filter(([_,v])=> v && v.enabled!==false && !v.boundDeviceId)
      .map(([k])=>k).sort((a,b)=> a.localeCompare(b));
    list.innerHTML = '';
    avail.forEach(code=>{
      const pill = document.createElement('span');
      pill.className = 'px-2 py-1 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-300';
      pill.textContent = code;
      pill.dataset.code = code;
      list.appendChild(pill);
    });
    if (count) count.textContent = `(${avail.length})`;
    wrap.classList.toggle('hidden', avail.length===0);
  }

  function renderCodes(codes){
    const tbody = elCodesBody(); if(!tbody) return;
    tbody.innerHTML = '';
    renderQueue(codes);

    const entries = Object.entries(codes||{}).sort(([a],[b])=> a.localeCompare(b));
    const frag = document.createDocumentFragment();

    entries.forEach(([code, data])=>{
      const enabled = (data && data.enabled !== false);
      const boundId = data?.boundDeviceId || null;

      const tr = document.createElement('tr');
      tr.className = 'border-b last:border-0';
      tr.innerHTML = `
        <td class="px-2 py-2 font-mono text-sm">${code}</td>
        <td class="px-2 py-2">
          <span class="inline-flex items-center gap-2 text-xs ${enabled?'text-emerald-700':'text-red-600'}">
            <span class="w-2 h-2 rounded-full ${enabled?'bg-emerald-500':'bg-red-500'}"></span>
            ${enabled?'ON':'OFF'}
          </span>
        </td>
        <td class="px-2 py-2 text-xs break-all">${boundId ? boundId : '—'}</td>
        <td class="px-2 py-2">
          <div class="flex flex-wrap gap-2">
            <button class="px-3 py-2 text-xs rounded bg-gray-800 text-white hover:bg-black" data-act="toggle">${enabled?'Tắt mã':'Bật mã'}</button>
            <button class="px-3 py-2 text-xs rounded bg-red-600 text-white hover:bg-red-700" data-act="delete">Xóa mã</button>
          </div>
        </td>`;

      tr.querySelector('[data-act="toggle"]').addEventListener('click', async ()=>{
        try{
          const next = !enabled;
          await db.ref('codes/'+code+'/enabled').set(next);
          if (boundId && next===false){
            await db.ref(`devices/${boundId}/commands/unbindAt`).set(firebase.database.ServerValue.TIMESTAMP);
          }
        }catch(e){ showErr('Đổi trạng thái mã lỗi: '+(e?.message||e)); }
      });

      tr.querySelector('[data-act="delete"]').addEventListener('click', async ()=>{
        if (!confirm(`Xóa mã ${code}?`)) return;
        try{
          if (boundId){
            await db.ref(`devices/${boundId}/commands/unbindAt`).set(firebase.database.ServerValue.TIMESTAMP);
          }
          await db.ref('codes/'+code).remove();
        }catch(e){ showErr('Xóa mã lỗi: '+(e?.message||e)); }
      });

      frag.appendChild(tr);
    });

    tbody.appendChild(frag);
  }

  function wireAddCodes(){
    const ta  = document.getElementById('codesInput');
    const btn = document.getElementById('btnAddCodes');
    if (!ta || !btn) return;
    btn.addEventListener('click', async ()=>{
      const raw = (ta.value||'').trim();
      if (!raw) return alert('Dán danh sách mã (mỗi dòng 1 mã).');
      const lines = raw.split(/\r?\n/).map(s=>s.trim().toUpperCase()).filter(Boolean);
      if (!lines.length) return alert('Không có mã hợp lệ.');
      const updates = {};
      const now = firebase.database.ServerValue.TIMESTAMP;
      for (const code of lines){
        updates['codes/'+code] = { enabled:true, boundDeviceId:null, boundAt:null, createdAt: now };
      }
      try{
        await db.ref().update(updates);
        ta.value=''; alert('Đã thêm '+lines.length+' mã');
      }catch(e){ showErr('Thêm mã lỗi: '+(e?.message||e)); }
    });
  }

  document.addEventListener('DOMContentLoaded', async ()=>{
    try{
      await ensureFirebase();
      wireAddCodes();

      // subscribe codes
      db.ref('codes').on('value',
        s=> renderCodes(s.val()||{}),
        e=> showErr('Lỗi tải mã: '+(e?.message||e))
      );
    }catch(e){
      console.error(e);
      showErr('Lỗi khởi chạy: '+(e?.message||e));
    }
  });
})();
