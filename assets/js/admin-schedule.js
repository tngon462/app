// assets/js/admin-schedule.js
// Tab Hẹn giờ cho Admin: Lưu cấu hình, Áp dụng ngay (cả quán), 30s tuỳ chọn.

(function(){
  'use strict';
  const db = (window.firebase && firebase.apps?.length) ? firebase.database() : null;
  if (!db) return;

  const $ = (s, r=document)=>r.querySelector(s);

  const elEnabled = $('#sch-enabled');
  const elRanges  = $('#sch-ranges');
  const btnSave   = $('#sch-save');
  const btnApply  = $('#sch-apply');
  const chk30s    = $('#sch-30s');

  async function load(){
    const snap = await db.ref('control/schedule').get();
    const v = snap.val() || { enabled:false, ranges:[] };
    if (elEnabled) elEnabled.checked = !!v.enabled;
    if (elRanges) elRanges.value = JSON.stringify(v.ranges||[], null, 2);
  }

  async function save(){
    let ranges=[];
    try{
      ranges=JSON.parse(elRanges.value||'[]');
      if(!Array.isArray(ranges))throw new Error();
    }catch(_){
      alert('Sai định dạng JSON.\nVD: [{"days":[0,1,2,3,4,5,6],"off":"22:30","on":"08:00"}]');
      return;
    }
    await db.ref('control/schedule').set({
      enabled:!!elEnabled.checked,
      ranges
    });
    alert('Đã lưu cấu hình hẹn giờ.');
  }

  async function applyNow(){
    const sec = chk30s?.checked ? 30 : 5;
    const now = firebase.database.ServerValue.TIMESTAMP;
    const snap = await db.ref('control/tables').get();
    const tables = Object.keys(snap.val()||{});
    if(!tables.length){alert('Chưa có bàn nào trong control/tables');return;}
    const updates={};
    for(const t of tables){
      updates[`control/tables/${t}/applyNowAt`]=now;
      updates[`control/tables/${t}/applyNowFor`]=sec;
    }
    await db.ref().update(updates);
    alert('Đã gửi lệnh Áp dụng ngay.');
  }

  document.addEventListener('DOMContentLoaded',()=>{
    load().catch(()=>{});
    btnSave?.addEventListener('click',()=>save().catch(()=>{}));
    btnApply?.addEventListener('click',()=>applyNow().catch(()=>{}));
  });
})();
