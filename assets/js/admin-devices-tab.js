// assets/js/admin-codes-tab.js (fast, incremental)
(function(){
  'use strict';

  // ===== Helpers =====
  const $ = (id)=> document.getElementById(id);
  const CE = (tag, cls, html)=> {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (html!=null) el.innerHTML = html;
    return el;
  };

  const tbody   = $('codesBody') || $('codes-tbody') || $('codes_tbody');
  const input   = $('codesInput') || $('codes-import');
  const errBox  = $('devError') || $('codesError');
  const qWrap   = $('codesQueueWrap');
  const qList   = $('codesQueue');
  const qCount  = $('codesQueueCount');

  function showErr(m){ if(!errBox) return; errBox.textContent=m||''; errBox.classList.toggle('hidden', !m); }

  // ===== Firebase bootstrap (reuse auth) =====
  let db = null;
  async function ensureFirebase(){
    if (!window.firebase || !firebase.apps?.length) throw new Error('Firebase chưa khởi tạo');

    if (!firebase.auth().currentUser){
      // Tránh gọi lặp — nếu một file khác đang login thì đợi
      if (!window.__tngon_auth_promise){
        window.__tngon_auth_promise = (async ()=>{
          try{
            await firebase.auth().signInAnonymously();
            await new Promise(res=>{
              const un = firebase.auth().onAuthStateChanged(u=>{ if(u){ un(); res(); }});
            });
          }finally{
            // giữ lại promise để file khác reuse; không xoá
          }
        })();
      }
      await window.__tngon_auth_promise;
    }
    db = firebase.database();
    return db;
  }

  // ===== State & DOM indexes =====
  const codesMap = new Map();       // code -> {enabled, boundDeviceId,...}
  const rowByCode = new Map();      // code -> <tr>
  const queuePills = new Map();     // code -> <span> (hàng đợi)

  // ===== Queue helpers (available codes only) =====
  function isAvailable(v){ return v && v.enabled!==false && !v.boundDeviceId; }

  function ensureQueueBox(){
    if (!qWrap || !qList) return false;
    return true;
  }

  function upsertQueuePill(code, v){
    if (!ensureQueueBox()) return;
    const inQueue = queuePills.has(code);
    const shouldBe = isAvailable(v);

    if (shouldBe && !inQueue){
      const pill = CE('span','px-2 py-1 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-300');
      pill.textContent = code;
      qList.appendChild(pill);
      queuePills.set(code, pill);
    }else if (!shouldBe && inQueue){
      const pill = queuePills.get(code);
      if (pill?.parentNode) pill.parentNode.removeChild(pill);
      queuePills.delete(code);
    }

    if (qCount) qCount.textContent = `(${queuePills.size})`;
    if (qWrap) qWrap.classList.toggle('hidden', queuePills.size===0);
  }

  // ===== Table row helpers =====
  function renderRowHTML(code, v){
    const enabled = v?.enabled!==false;
    const boundId = v?.boundDeviceId || null;
    return `
      <td class="px-2 py-1 font-mono">${code}</td>
      <td class="px-2 py-1">
        <span class="inline-flex items-center gap-1 text-xs ${enabled?'text-emerald-700':'text-red-600'}">
          <span class="w-2 h-2 rounded-full ${enabled?'bg-emerald-500':'bg-red-500'}"></span>
          ${enabled?'ON':'OFF'}
        </span>
      </td>
      <td class="px-2 py-1 text-xs break-all">${boundId||'—'}</td>
      <td class="px-2 py-1">
        <div class="flex flex-wrap gap-2">
          <button class="px-2 py-1 text-xs rounded bg-gray-800 text-white hover:bg-black" data-act="toggle">
            ${enabled?'Tắt mã':'Bật mã'}
          </button>
          <button class="px-2 py-1 text-xs rounded bg-red-600 text-white hover:bg-red-700" data-act="delete">
            Xóa mã
          </button>
        </div>
      </td>
    `;
  }

  function attachRowHandlers(tr, code, v){
    const enabled = v?.enabled!==false;
    const boundId = v?.boundDeviceId || null;

    tr.querySelector('[data-act="toggle"]')?.addEventListener('click', async ()=>{
      try{
        const next = !enabled;
        await db.ref('codes/'+code+'/enabled').set(next);
        if (boundId && next===false){
          await db.ref(`devices/${boundId}/commands/unbindAt`).set(firebase.database.ServerValue.TIMESTAMP);
        }
      }catch(e){ showErr('Đổi trạng thái mã lỗi: '+(e?.message||e)); }
    });

    tr.querySelector('[data-act="delete"]')?.addEventListener('click', async ()=>{
      if (!confirm(`Xóa mã ${code}?`)) return;
      try{
        if (boundId){
          await db.ref(`devices/${boundId}/commands/unbindAt`).set(firebase.database.ServerValue.TIMESTAMP);
        }
        await db.ref('codes/'+code).remove();
      }catch(e){ showErr('Xóa mã lỗi: '+(e?.message||e)); }
    });
  }

  function upsertRow(code, v){
    if (!tbody) return;

    let tr = rowByCode.get(code);
    if (!tr){
      tr = CE('tr','border-b last:border-0');
      rowByCode.set(code, tr);

      // chèn đúng vị trí alphabet để tránh “nhảy” lớn
      // tìm hàng đầu tiên có code lớn hơn → insertBefore
      const codesSorted = Array.from(rowByCode.keys()).concat(code).sort((a,b)=> a.localeCompare(b));
      const nextCode = codesSorted.find(c=> c>code && rowByCode.has(c));
      if (nextCode){
        tbody.insertBefore(tr, rowByCode.get(nextCode));
      }else{
        tbody.appendChild(tr);
      }
    }
    tr.innerHTML = renderRowHTML(code, v);
    attachRowHandlers(tr, code, v);
  }

  function removeRow(code){
    const tr = rowByCode.get(code);
    if (tr?.parentNode) tr.parentNode.removeChild(tr);
    rowByCode.delete(code);
  }

  // ===== Add codes from textarea =====
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

  // ===== Boot =====
  document.addEventListener('DOMContentLoaded', async ()=>{
    try{
      await ensureFirebase();

      // Skeleton (nếu muốn): hiển thị “Đang tải…” 1 dòng
      if (tbody && !tbody.children.length){
        const sk = CE('tr', null, `<td colspan="4" class="px-2 py-3 text-sm text-gray-500">Đang tải mã…</td>`);
        tbody.appendChild(sk);
      }

      const ref = firebase.database().ref('codes');

      // Tải ban đầu nhanh bằng once('value') nhưng KHÔNG render lại toàn bộ;
      // chỉ dùng để lấp đầy Map & queue, sau đó child_* sẽ lo incremental.
      const snap = await ref.once('value');
      const init = snap.val() || {};
      if (tbody) tbody.innerHTML = ''; // clear skeleton
      Object.entries(init).forEach(([code, v])=>{
        codesMap.set(code, v);
        upsertRow(code, v);
        upsertQueuePill(code, v);
      });

      // Incremental listeners
      ref.on('child_added', (s)=>{
        const code = s.key; const v = s.val();
        if (codesMap.has(code)) return; // đã có từ init
        codesMap.set(code, v);
        upsertRow(code, v);
        upsertQueuePill(code, v);
      });

      ref.on('child_changed', (s)=>{
        const code = s.key; const v = s.val();
        codesMap.set(code, v);
        upsertRow(code, v);
        upsertQueuePill(code, v);
      });

      ref.on('child_removed', (s)=>{
        const code = s.key;
        codesMap.delete(code);
        removeRow(code);
        upsertQueuePill(code, null);
      });

      // Buttons
      $('btnAddCodes')?.addEventListener('click', addCodes);
      $('btnCopyQueue')?.addEventListener('click', ()=>{
        if (!qList) return;
        const items = Array.from(qList.childNodes).map(x=>x.textContent.trim()).filter(Boolean);
        if (!items.length) return alert('Không có mã khả dụng');
        navigator.clipboard.writeText(items.join('\n')).then(()=> alert('Đã copy.'));
      });

    }catch(e){
      console.error(e);
      showErr('Lỗi khởi chạy: '+(e?.message||e));
    }
  });
})();
