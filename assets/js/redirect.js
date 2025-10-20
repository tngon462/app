<script>
// ... các phần khác giữ nguyên

// GỠ LIÊN KẾT (force unbind an toàn)
async function forceUnbindDevice(db, deviceId, code){
  // 1) clear codes/<code> bằng transaction (chỉ khi đang gắn deviceId này)
  if (code){
    await db.ref('codes/'+code).transaction(v=>{
      if (!v) return v;
      if (v.boundDeviceId === deviceId){
        return { ...v, boundDeviceId: null, boundAt: null };
      }
      return v; // đang gắn máy khác → không đụng
    });
  }
  // 2) gửi lệnh unbindAt xuống máy
  await db.ref('devices/'+deviceId+'/commands/unbindAt').set(firebase.database.ServerValue.TIMESTAMP);
  // 3) dọn hiển thị ở devices (không bắt buộc, giúp UI rõ ràng)
  await db.ref('devices/'+deviceId).update({ code:null, table:null });
}

// Ví dụ gắn vào nút:
btnUnbind.addEventListener('click', async ()=>{
  try{
    await forceUnbindDevice(db, id, obj.code || null);
    alert('Đã gỡ liên kết.');
  }catch(e){ alert('Gỡ liên kết lỗi: '+(e?.message||e)); }
});

// ĐỔI BÀN: set commands/setTable, KHÔNG reload
btnSetTable.addEventListener('click', ()=>{
  openTablePicker(15, async (label)=>{
    try{
      await db.ref('devices/'+id+'/commands/setTable')
        .set({ value: label, at: firebase.database.ServerValue.TIMESTAMP });
      await db.ref('devices/'+id).update({ table: label });
    }catch(e){ alert('Đổi bàn lỗi: '+(e?.message||e)); }
  });
});

// LÀM MỚI: chỉ reload (không thu hồi mã)
btnReload.addEventListener('click', async ()=>{
  try{
    await db.ref('devices/'+id+'/commands/reloadAt')
      .set(firebase.database.ServerValue.TIMESTAMP);
  }catch(e){ alert('Reload lỗi: '+(e?.message||e)); }
});

// ... phần còn lại giữ nguyên
</script>
