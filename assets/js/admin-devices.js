// assets/js/admin-devices.js vFINAL
(function(){
  const nav=document.querySelector('aside nav');
  const content=document.querySelector('main.content');
  if(nav&&!document.getElementById('navDevices')){
    const a=document.createElement('a');
    a.id='navDevices'; a.href='#devices'; a.className='nav-link'; a.textContent='Thiết bị';
    nav.appendChild(a);
  }
  if(content&&!document.getElementById('viewDevices')){
    const s=document.createElement('section');
    s.id='viewDevices'; s.className='p-4 md:p-6 hidden';
    s.innerHTML=`
      <h2 class="text-2xl font-bold mb-4">Thiết bị</h2>
      <div class="flex gap-2 mb-4">
        <button id="btnReloadAll" class="bg-blue-600 text-white px-3 py-2 rounded">Reload toàn bộ</button>
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div class="bg-white border rounded-xl p-4">
          <h3 class="font-semibold mb-2">Mã</h3>
          <textarea id="codesInput" rows="3" class="border p-2 w-full mb-2" placeholder="Mỗi dòng 1 mã"></textarea>
          <button id="btnAddCodes" class="bg-gray-800 text-white px-3 py-2 rounded mb-3">Thêm mã</button>
          <div class="overflow-auto max-h-96 border rounded"><table class="min-w-full text-sm">
            <thead class="bg-gray-100"><tr><th>Mã</th><th>Trạng thái</th><th>Thiết bị</th><th></th></tr></thead>
            <tbody id="codesBody"></tbody></table></div>
        </div>
        <div class="bg-white border rounded-xl p-4">
          <h3 class="font-semibold mb-2">Thiết bị iPad</h3>
          <div class="overflow-auto max-h-96 border rounded"><table class="min-w-full text-sm">
            <thead class="bg-gray-100"><tr><th>ID</th><th>Mã</th><th>Bàn</th><th></th></tr></thead>
            <tbody id="devBody"></tbody></table></div>
        </div>
      </div>`;
    content.appendChild(s);
  }

  const db=firebase.database();
  const codesBody=document.getElementById('codesBody');
  const devBody=document.getElementById('devBody');

  // render codes
  db.ref('codes').on('value',s=>{
    const data=s.val()||{}; codesBody.innerHTML='';
    Object.entries(data).forEach(([code,v])=>{
      const tr=document.createElement('tr'); tr.className='border-b';
      const on=v.enabled!==false;
      tr.innerHTML=`
        <td>${code}</td>
        <td>${on?'✅':'❌'}</td>
        <td class="text-xs">${v.boundDeviceId||'-'}</td>
        <td>
          <button data-act="toggle" class="bg-gray-700 text-white text-xs px-2 py-1 rounded">${on?'Tắt':'Bật'}</button>
          <button data-act="del" class="bg-red-600 text-white text-xs px-2 py-1 rounded">Xóa</button>
        </td>`;
      tr.querySelector('[data-act="toggle"]').onclick=()=> db.ref('codes/'+code+'/enabled').set(!on);
      tr.querySelector('[data-act="del"]').onclick=()=> db.ref('codes/'+code).remove();
      codesBody.appendChild(tr);
    });
  });

  // render devices
  db.ref('devices').on('value',s=>{
    const data=s.val()||{}; devBody.innerHTML='';
    Object.entries(data).forEach(([id,v])=>{
      const tr=document.createElement('tr'); tr.className='border-b';
      const t=v.stage==='select'?'—':(v.stage==='pos'?('+'+(v.table||'?')):(v.table||'-'));
      tr.innerHTML=`
        <td class="text-xs">${id}</td>
        <td>${v.code||'-'}</td>
        <td>${t}</td>
        <td>
          <button class="bg-blue-600 text-white text-xs px-2 py-1 rounded" data-act="reload">Làm mới</button>
          <button class="bg-green-600 text-white text-xs px-2 py-1 rounded" data-act="set">Đổi bàn</button>
          <button class="bg-amber-600 text-white text-xs px-2 py-1 rounded" data-act="unbind" ${v.code?'':'disabled'}>Gỡ</button>
        </td>`;
      tr.querySelector('[data-act="reload"]').onclick=()=> db.ref('devices/'+id+'/commands/reloadAt').set(firebase.database.ServerValue.TIMESTAMP);
      tr.querySelector('[data-act="set"]').onclick=()=>{
        const n=prompt('Nhập số bàn mới:'); if(!n) return;
        db.ref('devices/'+id+'/commands/setTable').set({value:String(n),at:firebase.database.ServerValue.TIMESTAMP});
        db.ref('devices/'+id+'/table').set(String(n));
      };
      tr.querySelector('[data-act="unbind"]').onclick=async()=>{
        if(!confirm('Gỡ thiết bị này?'))return;
        const code=v.code;
        if(code) await db.ref('codes/'+code).transaction(c=>{if(c&&c.boundDeviceId===id)return{...c,boundDeviceId:null,boundAt:null};return c;});
        db.ref('devices/'+id+'/commands/unbindAt').set(firebase.database.ServerValue.TIMESTAMP);
        db.ref('devices/'+id).update({table:null});
      };
      devBody.appendChild(tr);
    });
  });

  // add codes
  document.getElementById('btnAddCodes').onclick=async()=>{
    const raw=document.getElementById('codesInput').value.trim();
    if(!raw)return alert('Dán danh sách mã');
    const lines=raw.split(/\r?\n/).map(s=>s.trim().toUpperCase()).filter(Boolean);
    const upd={}; lines.forEach(c=>upd['codes/'+c] = {enabled:true});
    await db.ref().update(upd); alert('Đã thêm '+lines.length+' mã'); document.getElementById('codesInput').value='';
  };

  document.getElementById('btnReloadAll').onclick=()=> db.ref('broadcast/reloadAt').set(firebase.database.ServerValue.TIMESTAMP);
})();
