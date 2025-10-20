// assets/js/admin-devices.js vFINAL 2025-10
(function(){
  if(!window.firebase || !firebase.apps?.length){ console.error('Firebase not ready'); return; }
  const db=firebase.database();
  const fmt=(t)=>t?new Date(t).toLocaleString():'—';

  // Elements
  const codesBody=document.getElementById('codesBody');
  const devBody=document.getElementById('devBody');
  const inpCodes=document.getElementById('codesInput');
  const btnAdd=document.getElementById('btnAddCodes');
  const btnReloadAll=document.getElementById('btnReloadAll');
  const devError=document.getElementById('devError');

  function showErr(m){ devError.textContent=m||''; devError.classList.toggle('hidden',!m); }

  // ===== Codes =====
  db.ref('codes').on('value',snap=>{
    const data=snap.val()||{}; codesBody.innerHTML='';
    Object.entries(data).forEach(([code,v])=>{
      const tr=document.createElement('tr'); tr.className='border-b';
      const on=v.enabled!==false;
      tr.innerHTML=`
        <td class="px-2 py-1 font-mono">${code}</td>
        <td>${on?'✅':'❌'}</td>
        <td class="text-xs">${v.boundDeviceId||'-'}</td>
        <td>
          <button data-act="toggle" class="bg-gray-700 text-white text-xs px-2 py-1 rounded">${on?'Tắt':'Bật'}</button>
          <button data-act="del" class="bg-red-600 text-white text-xs px-2 py-1 rounded">Xóa</button>
        </td>`;
      tr.querySelector('[data-act="toggle"]').onclick=async()=>{
        try{
          await db.ref('codes/'+code+'/enabled').set(!on);
          if(on && v.boundDeviceId)
            db.ref('devices/'+v.boundDeviceId+'/commands/unbindAt').set(firebase.database.ServerValue.TIMESTAMP);
        }catch(e){ showErr('Lỗi toggle mã: '+e.message); }
      };
      tr.querySelector('[data-act="del"]').onclick=async()=>{
        if(!confirm('Xóa mã '+code+'?'))return;
        try{
          if(v.boundDeviceId)
            await db.ref('devices/'+v.boundDeviceId+'/commands/unbindAt').set(firebase.database.ServerValue.TIMESTAMP);
          await db.ref('codes/'+code).remove();
        }catch(e){ showErr('Xóa mã lỗi: '+e.message); }
      };
      codesBody.appendChild(tr);
    });
  });

  btnAdd.onclick=async()=>{
    const raw=(inpCodes.value||'').trim();
    if(!raw)return alert('Nhập mã'); 
    const lines=raw.split(/\r?\n/).map(s=>s.trim().toUpperCase()).filter(Boolean);
    const updates={}; lines.forEach(c=>{updates['codes/'+c]={enabled:true};});
    await db.ref().update(updates);
    inpCodes.value='';
    alert('Đã thêm '+lines.length+' mã');
  };

  // ===== Devices =====
  db.ref('devices').on('value',snap=>{
    const data=snap.val()||{}; devBody.innerHTML='';
    Object.entries(data).forEach(([id,v])=>{
      const t=v.stage==='select'?'—':(v.stage==='pos'?('+'+(v.table||'?')):(v.table||'-'));
      const tr=document.createElement('tr'); tr.className='border-b';
      tr.innerHTML=`
        <td class="text-xs break-all">${id}</td>
        <td>${v.code||'-'}</td>
        <td>${t}</td>
        <td>
          <button data-act="reload" class="bg-blue-600 text-white text-xs px-2 py-1 rounded">Làm mới</button>
          <button data-act="set" class="bg-green-600 text-white text-xs px-2 py-1 rounded">Đổi bàn</button>
          <button data-act="unbind" class="bg-amber-600 text-white text-xs px-2 py-1 rounded" ${v.code?'':'disabled'}>Gỡ</button>
        </td>`;
      tr.querySelector('[data-act="reload"]').onclick=()=>{
        db.ref('devices/'+id+'/commands/reloadAt').set(firebase.database.ServerValue.TIMESTAMP);
      };
      tr.querySelector('[data-act="set"]').onclick=()=>{
        const n=prompt('Nhập số bàn mới:'); if(!n)return;
        db.ref('devices/'+id+'/commands/setTable').set({value:String(n),at:firebase.database.ServerValue.TIMESTAMP});
        db.ref('devices/'+id+'/table').set(String(n));
      };
      tr.querySelector('[data-act="unbind"]').onclick=async()=>{
        if(!confirm('Gỡ liên kết thiết bị này?'))return;
        const code=v.code;
        if(code)
          await db.ref('codes/'+code).transaction(c=>{if(c&&c.boundDeviceId===id)return{...c,boundDeviceId:null,boundAt:null};return c;});
        db.ref('devices/'+id+'/commands/unbindAt').set(firebase.database.ServerValue.TIMESTAMP);
        db.ref('devices/'+id).update({table:null});
      };
      devBody.appendChild(tr);
    });
  });

  btnReloadAll.onclick=()=>{
    db.ref('broadcast/reloadAt').set(firebase.database.ServerValue.TIMESTAMP);
  };
})();
