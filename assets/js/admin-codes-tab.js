// assets/js/admin-codes-tab.js
(function(){
  'use strict';

  const $ = (id)=> document.getElementById(id);
  const tbody = $('codesBody');
  const input = $('codesInput');
  const errBox= $('devError') || document.getElementById('codesError');

  let db=null;
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

  function ensureQueueBox(){
    if (document.getElementById('codesQueue') && document.getElementById('codesQueueWrap')) return;
  }

  function renderQueue(codes){
    const wrap = document.getElementById('codesQueueWrap');
    const list = document.getElementById('codesQueue');
    const count= document.getElementById('codesQueueCount');
    if (!wrap || !list) return;

    const avail = Object.entries(codes||{})
      .filter(([_,v])=> v && v.enabled!==false && !v.boundDeviceId)
      .map(([k])=>k)
      .sort((a,b)=> a.localeCompare(b));

    list.innerHTML = '';
    avail.forEach(code=>{
      const span = document.createElement('span');
      span.className = 'px-2 py-1 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-300';
      span.textContent = code;
      list.appendChild(span);
    });
    wrap.classList.toggle('hidden', avail.length===0);
    if (count) count.textContent = `(${avail.length})`;
  }

  function renderCodes(codes){
    if (!tbody) return;
    tbody.innerHTML = '';
    renderQueue(codes);

    Object.entries(codes||{}).sort(([a],[b])=> a.localeCompare(b)).forEach(([code,v])=>{
      const enabled = v?.enabled!==false;
      const boundId = v?.boundDeviceId || null;

      const tr = document.createElement('tr');
      tr.className='border-b last:border-0';
      tr.innerHTML = `
        <td class="px-2 py-1 font-mono">${code}</td>
        <td class="px-2 py-1">
          <span class="inline-flex items-center gap-1 text-xs ${enabled?'text-emerald-700':'text-red-600'}">
            <span class="w-2 h-2 rounded-full ${enabled?'bg-emerald-500':'bg-red-500'}"></span>${enabled?'ON':'OFF'}
          </span>
        </td>
        <td class="px-2 py-1 text-xs break-all">${boundId||'—'}</td>
        <td class="px-2 py-1">
          <div class="flex flex-wrap gap-2">
            <button class="px-2 py-1 text-xs rounded bg-gray-800 text-white hover:bg-black" data-act="toggle">${enabled?'Tắt mã':'Bật mã'}</button>
            <button class="px-2 py-1 text-xs rounded bg-red-600 text-white hover:bg-red-700" data-act="delete">Xóa mã</button>
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

      tbody.appendChild(tr);
    });
  }

  async function addCodes(){
    const raw = (input?.value||'').trim();
    if (!raw) return alert('Dán danh sách mã (mỗi dòng 1 mã)');
    const lines = raw.split(/\r?\n/).map(s=>s.trim().toUpperCase()).filter(Boolean);
    if (!lines.length) return alert('Không có mã hợp lệ');

    const updates = {};
    const now = firebase.database.ServerValue.TIMESTAMP;
    for (const code of lines){
      updates['codes/'+code] = { enabled:true, boundDeviceId:null, boundAt:null, createdAt:now };
    }
    try{
      await db.ref().update(updates);
      input.value='';
      alert('Đã thêm '+lines.length+' mã');
    }catch(e){ showErr('Thêm mã lỗi: '+(e?.message||e)); }
  }

  document.addEventListener('DOMContentLoaded', async ()=>{
    try{
      await ensureFirebase();
      db.ref('codes').on('value', s=> renderCodes(s.val()||{}), e=> showErr('Lỗi tải mã: '+(e?.message||e)));
      document.getElementById('btnAddCodes')?.addEventListener('click', addCodes);
      document.getElementById('btnCopyQueue')?.addEventListener('click', ()=>{
        const list = document.getElementById('codesQueue'); if (!list) return;
        const items = Array.from(list.childNodes).map(x=>x.textContent.trim()).filter(Boolean);
        if (!items.length) return alert('Không có mã khả dụng');
        navigator.clipboard.writeText(items.join('\n')).then(()=> alert('Đã copy.'));
      });
    }catch(e){
      console.error(e);
      showErr('Lỗi khởi chạy: '+(e?.message||e));
    }
  });
})();
