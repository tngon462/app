<!-- assets/js/admin-devices.js (SAFE BOOT v5) -->
<script>
(function(){
  'use strict';

  // ========= Helpers =========
  const $ = (sel,root=document)=>root.querySelector(sel);
  const h = (html)=>{ const d=document.createElement('div'); d.innerHTML=html.trim(); return d.firstElementChild; };
  const tsAgo=(ts)=>{ if(!ts) return '—'; const s=Math.floor((Date.now()-ts)/1000); if(s<60) return s+'s'; const m=Math.floor(s/60); if(m<60) return m+'m'; const h=Math.floor(m/60); if(h<24) return h+'h'; return Math.floor(h/24)+'d'; };
  const mask=(id,reveal)=> reveal? id : (id? (String(id).slice(0,4)+'…'):'—');

  function ensureSectionScaffold(){
    // Nếu trang đã có khối “Thiết bị & Mã” (bản mới), chỉ lấy refs.
    let wrap = $('#tngon-admin-devices');
    if (!wrap){
      // Tự tạo 1 block “Thiết bị & Mã” cuối trang — không phá layout cũ
      wrap = h(`
        <section id="tngon-admin-devices" class="p-4 md:p-6">
          <h2 class="text-2xl font-bold text-gray-800 mb-4">Thiết bị & Mã</h2>

          <div id="devError" class="hidden mb-3 p-3 rounded-lg bg-red-50 text-red-700 text-sm"></div>

          <div class="grid md:grid-cols-2 gap-4">
            <!-- Codes -->
            <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <div class="flex items-center justify-between mb-2">
                <h3 class="font-semibold text-gray-800">Danh sách mã</h3>
              </div>
              <div id="codes-queue-wrap" class="mb-3 hidden">
                <div class="text-xs text-gray-500 mb-1">Hàng đợi (chưa sử dụng): <span id="codes-queue-count">0</span></div>
                <div id="codes-queue" class="flex flex-wrap gap-2"></div>
              </div>
              <div class="flex items-start gap-2 mb-3">
                <textarea id="codes-import" class="flex-1 border rounded-md p-2 text-sm" rows="3" placeholder="Dán mỗi dòng 1 mã…"></textarea>
                <button id="btn-import-codes" class="px-3 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700">Thêm mã</button>
              </div>
              <div class="overflow-auto">
                <table class="min-w-full text-sm">
                  <thead class="text-xs text-gray-500">
                    <tr>
                      <th class="px-2 py-1 text-left">Code</th>
                      <th class="px-2 py-1 text-left">Trạng thái</th>
                      <th class="px-2 py-1 text-left">Thiết bị</th>
                      <th class="px-2 py-1 text-left">Gắn lúc</th>
                      <th class="px-2 py-1 text-left">Hành động</th>
                    </tr>
                  </thead>
                  <tbody id="codes-tbody"></tbody>
                </table>
              </div>
            </div>

            <!-- Devices -->
            <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <div class="flex items-center justify-between mb-2">
                <h3 class="font-semibold text-gray-800">Thiết bị</h3>
              </div>
              <div class="overflow-auto">
                <table class="min-w-full text-sm">
                  <thead class="text-xs text-gray-500">
                    <tr>
                      <th class="px-2 py-1 text-left">Device ID</th>
                      <th class="px-2 py-1 text-left">Tên máy</th>
                      <th class="px-2 py-1 text-left">Mã</th>
                      <th class="px-2 py-1 text-left">Bàn</th>
                      <th class="px-2 py-1 text-left">Online</th>
                      <th class="px-2 py-1 text-left">Hành động</th>
                    </tr>
                  </thead>
                  <tbody id="devices-tbody"></tbody>
                </table>
              </div>
            </div>
          </div>
        </section>
      `);
      document.body.appendChild(wrap);
    }
    // Trả về refs
    return {
      elError: $('#devError', wrap),
      tbCodes: $('#codes-tbody', wrap),
      tbDevs:  $('#devices-tbody', wrap),
      qWrap:   $('#codes-queue-wrap', wrap),
      qList:   $('#codes-queue', wrap),
      qCount:  $('#codes-queue-count', wrap),
      btnImport: $('#btn-import-codes', wrap),
      taImport:  $('#codes-import', wrap),
      section:  wrap
    };
  }

  // ========= Firebase guard + auth =========
  async function ensureFirebaseReady(){
    if (!window.firebase || !firebase.apps?.length) throw new Error('Firebase chưa init ở admin.html');
    // cần anonymous auth để write
    if (firebase.auth().currentUser) return;
    await firebase.auth().signInAnonymously();
    await new Promise(res=>{
      const un=firebase.auth().onAuthStateChanged(u=>{ if(u){ un(); res(); }});
    });
  }

  // ========= Main =========
  (async function boot(){
    const ui = ensureSectionScaffold();
    const showErr = (m)=>{ ui.elError.textContent = m||''; ui.elError.classList.toggle('hidden', !m); };

    try{
      await ensureFirebaseReady();
    }catch(e){
      showErr('Không đăng nhập Firebase: '+(e?.message||e));
      return;
    }

    const db = firebase.database();
    let codesCache = {};
    let devsCache  = {};

    // ===== Hàng đợi mã =====
    function renderQueue(){
      const list = Object.entries(codesCache)
        .filter(([,v])=> v && v.enabled!==false && !v.boundDeviceId)
        .map(([k])=>k).sort((a,b)=>a.localeCompare(b));
      ui.qList.innerHTML = '';
      list.forEach(code=>{
        const pill = h(`<span class="px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs">${code}</span>`);
        ui.qList.appendChild(pill);
      });
      ui.qWrap.classList.toggle('hidden', list.length===0);
      if (ui.qCount) ui.qCount.textContent = list.length;
    }

    // ===== Codes table =====
    function renderCodes(){
      ui.tbCodes.innerHTML = '';
      const entries = Object.entries(codesCache).sort(([a],[b])=> a.localeCompare(b));
      entries.forEach(([code, v])=>{
        const enabled = (v && v.enabled!==false);
        const tr = h(`
          <tr class="border-b">
            <td class="px-2 py-1 font-mono">${code}</td>
            <td class="px-2 py-1">
              <span class="inline-flex items-center gap-1 text-xs ${enabled?'text-emerald-700':'text-gray-500'}">
                <span class="w-2 h-2 rounded-full ${enabled?'bg-emerald-500':'bg-gray-400'}"></span>
                ${enabled?'Đang bật':'Đang tắt'}
              </span>
            </td>
            <td class="px-2 py-1 text-xs break-all">${v?.boundDeviceId || '—'}</td>
            <td class="px-2 py-1 text-xs">${v?.boundAt ? new Date(v.boundAt).toLocaleString() : '—'}</td>
            <td class="px-2 py-1">
              <div class="flex flex-wrap gap-2">
                <button class="px-2 py-1 text-xs rounded bg-gray-800 text-white hover:bg-black" data-act="toggle">${enabled?'Tắt':'Bật'}</button>
                <button class="px-2 py-1 text-xs rounded bg-red-600 text-white hover:bg-red-700" data-act="delete">Xoá</button>
              </div>
            </td>
          </tr>
        `);
        tr.querySelector('[data-act="toggle"]').addEventListener('click', async ()=>{
          try{
            const newVal = !enabled;
            const updates = {};
            updates[`codes/${code}/enabled`] = newVal;
            if (!newVal && v?.boundDeviceId){
              // tắt -> trả về hàng đợi + OUT máy
              updates[`codes/${code}/boundDeviceId`] = null;
              updates[`codes/${code}/boundAt`]       = null;
            }
            await db.ref().update(updates);
            if (!newVal && v?.boundDeviceId){
              await db.ref(`devices/${v.boundDeviceId}/commands/unbindAt`).set(firebase.database.ServerValue.TIMESTAMP);
              await db.ref(`devices/${v.boundDeviceId}`).update({ code:null, table:null });
            }
          }catch(e){ showErr('Đổi trạng thái mã thất bại: '+(e?.message||e)); }
        });
        tr.querySelector('[data-act="delete"]').addEventListener('click', async ()=>{
          if (!confirm(`Xoá mã "${code}"? Nếu đang dùng, máy sẽ OUT.`)) return;
          try{
            if (v?.boundDeviceId){
              await db.ref(`devices/${v.boundDeviceId}/commands/unbindAt`).set(firebase.database.ServerValue.TIMESTAMP);
              await db.ref(`devices/${v.boundDeviceId}`).update({ code:null, table:null });
            }
            await db.ref(`codes/${code}`).remove();
          }catch(e){ showErr('Xoá mã thất bại: '+(e?.message||e)); }
        });
        ui.tbCodes.appendChild(tr);
      });
      renderQueue();
    }

    // ===== Devices table =====
    function openTablePicker(onPick){
      const wrap = h(`
        <div class="fixed inset-0 bg-black/50 z-[7000] flex items-center justify-center p-4">
          <div class="bg-white rounded-xl shadow-lg w-full max-w-md p-4">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-lg font-semibold">Chọn số bàn</h3>
              <button id="tp-close" class="px-2 py-1 text-sm rounded bg-gray-100 hover:bg-gray-200">Đóng</button>
            </div>
            <div id="tp-grid" class="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-[60vh] overflow-auto"></div>
          </div>
        </div>
      `);
      document.body.appendChild(wrap);
      const grid = $('#tp-grid', wrap);
      for(let i=1;i<=15;i++){
        const b=h(`<button class="px-3 py-3 rounded-lg border text-sm hover:bg-blue-50">${i}</button>`);
        b.addEventListener('click', ()=>{ try{ onPick(String(i)); } finally{ wrap.remove(); } });
        grid.appendChild(b);
      }
      $('#tp-close', wrap).addEventListener('click', ()=> wrap.remove());
    }

    function renderDevices(){
      ui.tbDevs.innerHTML = '';
      const entries = Object.entries(devsCache).sort((a,b)=>(b[1]?.lastSeen||0)-(a[1]?.lastSeen||0));
      entries.forEach(([id, v])=>{
        const code = v?.code || '';
        const table= v?.table|| '';
        const stage= v?.stage|| '';
        const name = v?.name || '';
        const last = v?.lastSeen || 0;
        let reveal = false;

        const tr = h(`
          <tr class="border-b">
            <td class="px-2 py-1 text-xs"><button class="text-blue-700 underline" data-act="rid">${mask(id,false)}</button></td>
            <td class="px-2 py-1">
              <div class="flex items-center gap-2">
                <span class="text-sm">${name || '<em class="text-gray-400">—</em>'}</span>
                <button class="px-2 py-0.5 text-xs rounded bg-gray-100 hover:bg-gray-200" data-act="rename">✎</button>
              </div>
            </td>
            <td class="px-2 py-1 font-mono">${code || '—'}</td>
            <td class="px-2 py-1">${stage==='pos'&&table?('+'+table):(stage==='start'&&table?table:(stage==='select'?'—':(table||'—')))}</td>
            <td class="px-2 py-1 text-xs">${last?tsAgo(last):'—'}</td>
            <td class="px-2 py-1">
              <div class="flex flex-wrap gap-2">
                <button class="px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700" data-act="reload">Làm mới</button>
                <button class="px-2 py-1 text-xs rounded bg-emerald-600 text-white hover:bg-emerald-700" data-act="settable">Đổi số bàn</button>
                <button class="px-2 py-1 text-xs rounded bg-amber-600 text-white hover:bg-amber-700" data-act="unbind" ${code?'':'disabled'}>Gỡ liên kết</button>
                <button class="px-2 py-1 text-xs rounded ${code?'bg-gray-300 text-gray-500 cursor-not-allowed':'bg-red-600 text-white hover:bg-red-700'}" data-act="del" ${code?'disabled':''}>Xoá device</button>
              </div>
            </td>
          </tr>
        `);

        tr.querySelector('[data-act="rid"]').addEventListener('click', ()=>{
          reveal = !reveal;
          tr.querySelector('[data-act="rid"]').textContent = mask(id, reveal);
        });

        tr.querySelector('[data-act="rename"]').addEventListener('click', async ()=>{
          const nv = prompt('Đặt tên máy (để trống để xoá):', name||'');
          if (nv===null) return;
          try{
            const clean = String(nv).trim();
            await db.ref(`devices/${id}/name`).set(clean || null);
          }catch(e){ showErr('Đổi tên máy lỗi: '+(e?.message||e)); }
        });

        tr.querySelector('[data-act="reload"]').addEventListener('click', async ()=>{
          try{
            await db.ref(`devices/${id}/commands/reloadAt`).set(firebase.database.ServerValue.TIMESTAMP);
          }catch(e){ showErr('Gửi lệnh tải lại lỗi: '+(e?.message||e)); }
        });

        tr.querySelector('[data-act="settable"]').addEventListener('click', ()=>{
          openTablePicker(async (picked)=>{
            try{
              await db.ref(`devices/${id}/commands/setTable`).set({ value:picked, at:firebase.database.ServerValue.TIMESTAMP });
              await db.ref(`devices/${id}/table`).set(picked);
            }catch(e){ showErr('Gửi lệnh đổi bàn lỗi: '+(e?.message||e)); }
          });
        });

        tr.querySelector('[data-act="unbind"]').addEventListener('click', async ()=>{
          if (!code) return;
          const confirmCode = prompt(`Nhập lại mã đang gắn để gỡ liên kết (đang gắn: ${code}):`);
          if (confirmCode===null) return;
          if ((confirmCode||'').trim().toUpperCase() !== String(code).toUpperCase()){
            alert('Sai mã xác nhận. Không gỡ liên kết.');
            return;
          }
          try{
            const updates = {};
            updates[`codes/${code}/boundDeviceId`] = null;
            updates[`codes/${code}/boundAt`]       = null;
            await db.ref().update(updates);
            await db.ref(`devices/${id}/commands/unbindAt`).set(firebase.database.ServerValue.TIMESTAMP);
            await db.ref(`devices/${id}`).update({ code:null, table:null });
          }catch(e){ showErr('Gỡ liên kết thất bại: '+(e?.message||e)); }
        });

        tr.querySelector('[data-act="del"]').addEventListener('click', async ()=>{
          if (code) return;
          if (!confirm('Xoá thiết bị này khỏi danh sách?')) return;
          try{
            await db.ref(`devices/${id}`).remove();
          }catch(e){ showErr('Xoá thiết bị lỗi: '+(e?.message||e)); }
        });

        ui.tbDevs.appendChild(tr);
      });
    }

    // ===== Import codes =====
    if (ui.btnImport && ui.taImport){
      ui.btnImport.addEventListener('click', async ()=>{
        const raw = (ui.taImport.value||'').trim();
        if (!raw) return alert('Dán danh sách mã (mỗi dòng 1 mã).');
        const lines = raw.split(/\r?\n/).map(s=>s.trim().toUpperCase()).filter(Boolean);
        if (!lines.length) return alert('Không có mã hợp lệ.');
        try{
          const now = firebase.database.ServerValue.TIMESTAMP;
          const updates = {};
          lines.forEach(code=>{
            updates[`codes/${code}`] = { enabled:true, boundDeviceId:null, boundAt:null, createdAt: now };
          });
          await db.ref().update(updates);
          ui.taImport.value = '';
          alert(`Đã thêm ${lines.length} mã.`);
        }catch(e){ showErr('Thêm mã lỗi: '+(e?.message||e)); }
      });
    }

    // ===== Live subscribe =====
    db.ref('codes').on('value', s=>{ codesCache=s.val()||{}; renderCodes(); }, e=> showErr('Lỗi tải mã: '+(e?.message||e)));
    db.ref('devices').on('value', s=>{ devsCache=s.val()||{}; renderDevices(); }, e=> showErr('Lỗi tải thiết bị: '+(e?.message||e)));
  })();
})();
</script>
