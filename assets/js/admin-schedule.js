// ========== T-NGON | Admin Schedule (UI đơn giản) ==========
// Làm việc với runner trên iPad qua node: control/schedule
// - Save: ghi {enabled, ranges[], tz, savedAt}
// - Apply: tính "on/off" hiện tại và ghi các node control/screen + control/tables/*/screen
//   (để hiệu lực ngay cả khi admin đóng tab)

(function(){
  'use strict';

  // ---- Helpers ----
  const $ = (sel, root=document)=> root.querySelector(sel);
  const $$= (sel, root=document)=> Array.from(root.querySelectorAll(sel));
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Ho_Chi_Minh';

  function hmToMinutes(hm){ // "22:30" -> 22*60+30
    const m = /^(\d{1,2}):(\d{2})$/.exec(hm||'');
    if (!m) return null;
    const h = +m[1], mm= +m[2];
    if (h>23||mm>59) return null;
    return h*60+mm;
  }
  function minutesNow(tzStr){
    const now = new Date();
    // Dùng local time của trình duyệt admin; runner trên iPad cũng dùng local time,
    // vì vậy cứ đồng nhất theo local máy (đã ổn trong thực tế).
    return now.getHours()*60 + now.getMinutes();
  }
  function todayDow(){ // 0..6 (CN..T7)
    return new Date().getDay();
  }

  function makePreset(type){
    // trả về ranges[]
    if (type==='allweek'){
      return [{days:[0,1,2,3,4,5,6], off:"22:30", on:"08:00"}];
    }
    if (type==='weekday'){
      return [
        {days:[1,2,3,4,5], off:"22:30", on:"08:00"},
        {days:[0,6],       off:"23:30", on:"09:00"}
      ];
    }
    if (type==='none'){
      return [];
    }
    return [{days:[0,1,2,3,4,5,6], off:"22:30", on:"08:00"}];
  }

  // ---- Firebase (đã có firebase ở admin.html) ----
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

  // ---- Mount UI vào section "Hẹn giờ" có sẵn ----
  document.addEventListener('DOMContentLoaded', async ()=>{
    const sec = document.getElementById('viewSchedule');
    if (!sec) return;

    const elEnabled = $('#sch-enabled', sec);
    const elTextarea= $('#sch-ranges',  sec);
    const btnSave   = $('#sch-save',    sec);
    const btnApply  = $('#sch-apply',   sec);
    const chk30s    = $('#sch-30s',     sec);

    // Thêm builder đơn giản ngay dưới textarea (dựng bằng JS để khỏi sửa HTML)
    const helper = document.createElement('div');
    helper.className = 'mt-3 space-y-2';
    helper.innerHTML = `
      <div class="flex flex-wrap gap-2">
        <button type="button" id="preset-allweek"  class="px-2 py-1 rounded border">Mẫu: Cả tuần 22:30→08:00</button>
        <button type="button" id="preset-weekday"  class="px-2 py-1 rounded border">Mẫu: Ngày thường/ Cuối tuần</button>
        <button type="button" id="preset-none"     class="px-2 py-1 rounded border">Xóa hết lịch</button>
      </div>
      <div class="p-2 rounded border bg-white">
        <div class="font-semibold mb-2">Biểu mẫu nhanh</div>
        <div class="flex flex-wrap items-center gap-2 text-sm">
          <label>Ngày áp dụng:</label>
          <label><input type="checkbox" class="dchk" value="0"> CN</label>
          <label><input type="checkbox" class="dchk" value="1"> T2</label>
          <label><input type="checkbox" class="dchk" value="2"> T3</label>
          <label><input type="checkbox" class="dchk" value="3"> T4</label>
          <label><input type="checkbox" class="dchk" value="4"> T5</label>
          <label><input type="checkbox" class="dchk" value="5"> T6</label>
          <label><input type="checkbox" class="dchk" value="6"> T7</label>
          <span class="mx-2">• Tắt lúc</span>
          <input id="f-off" type="time" value="22:30" class="border rounded px-1 py-0.5">
          <span class="mx-2">• Mở lúc</span>
          <input id="f-on"  type="time" value="08:00" class="border rounded px-1 py-0.5">
          <button type="button" id="btn-add-range" class="ml-2 px-2 py-1 rounded bg-gray-800 text-white">Thêm vào danh sách</button>
        </div>
        <div class="text-xs text-gray-500 mt-1">Danh sách cuối cùng vẫn nằm trong ô JSON bên trên – bạn có thể chỉnh tay nếu cần.</div>
      </div>
      <div id="sch-preview" class="text-sm text-gray-700"></div>
    `;
    elTextarea.after(helper);

    // Presets
    helper.querySelector('#preset-allweek').addEventListener('click', ()=> putRanges(makePreset('allweek')));
    helper.querySelector('#preset-weekday').addEventListener('click',()=> putRanges(makePreset('weekday')));
    helper.querySelector('#preset-none').addEventListener('click',   ()=> putRanges(makePreset('none')));

    // Thêm 1 range từ form nhỏ
    helper.querySelector('#btn-add-range').addEventListener('click', ()=>{
      const off = $('#f-off',helper).value.trim();
      const on  = $('#f-on', helper).value.trim();
      const days = $$('.dchk', helper).filter(x=>x.checked).map(x=> +x.value);
      if (!days.length) return alert('Chọn ít nhất 1 ngày.');
      if (hmToMinutes(off)==null || hmToMinutes(on)==null) return alert('Giờ không hợp lệ.');
      const cur = getRanges();
      cur.push({days, off, on});
      putRanges(cur);
    });

    // Preview trạng thái nếu áp dụng ngay
    function refreshPreview(){
      const nowMin = minutesNow(tz);
      const dow    = todayDow();
      const state  = computeState({enabled: elEnabled.checked, ranges: getRanges()}, dow, nowMin);
      $('#sch-preview').textContent =
        `Bây giờ: ${state==='off'?'ĐANG TẮT (blackout)':'ĐANG MỞ'} • Sẽ ghi vào control/screen="${state}".`;
    }

    // JSON <-> ranges helpers
    function getRanges(){
      try{
        const v = JSON.parse(elTextarea.value||'[]');
        if (Array.isArray(v)) return v;
        if (Array.isArray(v.ranges)) return v.ranges;
        return [];
      }catch(_){ return []; }
    }
    function putRanges(arr){
      elTextarea.value = JSON.stringify(arr, null, 2);
      refreshPreview();
    }

    function computeState(cfg, dow, nowMin){
      if (!cfg || !cfg.enabled) return 'on';
      const rules = Array.isArray(cfg.ranges)? cfg.ranges : [];
      // Nếu khớp nhiều rule trong 1 ngày, chỉ cần một rule bao "qua đêm" là đủ: off từ off->23:59, tiếp on->...
      let shouldOff = false;
      for (const r of rules){
        const days = (r.days||[]).map(Number);
        if (!days.includes(dow)) continue;
        const offM = hmToMinutes(r.off);
        const onM  = hmToMinutes(r.on);
        if (offM==null || onM==null) continue;

        if (offM < onM){
          // Tắt trong cùng ngày: [off, on)
          if (nowMin >= offM && nowMin < onM) shouldOff = true;
        } else {
          // Qua đêm: [off, 24h) U [0, on)
          if (nowMin >= offM || nowMin < onM) shouldOff = true;
        }
      }
      return shouldOff ? 'off' : 'on';
    }

    // Load cấu hình hiện có
    let db = null;
    try{
      db = await ensureDB();
      const snap = await db.ref('control/schedule').get();
      const v = snap.exists()? snap.val() : null;
      const enabled = !!(v && v.enabled!==false);
      const ranges  = v && Array.isArray(v.ranges) ? v.ranges : makePreset('allweek');
      elEnabled.checked = enabled;
      putRanges(ranges);
    }catch(e){
      console.error('[schedule] load error:', e);
      // fill preset mặc định cho dễ
      elEnabled.checked = true;
      putRanges(makePreset('allweek'));
    }

    // Lưu cấu hình
    btnSave.addEventListener('click', async ()=>{
      try{
        const ranges = getRanges();
        // validate đơn giản
        for (const r of ranges){
          if (!Array.isArray(r.days) || r.days.some(d=> d<0||d>6)) throw new Error('days không hợp lệ');
          if (hmToMinutes(r.off)==null || hmToMinutes(r.on)==null) throw new Error('Giờ off/on không hợp lệ');
        }
        await db.ref('control/schedule').set({
          enabled: !!elEnabled.checked,
          ranges, tz,
          savedAt: firebase.database.ServerValue.TIMESTAMP
        });
        alert('Đã lưu cấu hình hẹn giờ.');
        refreshPreview();
      }catch(e){
        alert('Lưu lỗi: '+(e?.message||e));
      }
    });

    // Áp dụng ngay (ghi control/screen + control/tables/*/screen)
    btnApply.addEventListener('click', async ()=>{
      try{
        const cfg = { enabled: !!elEnabled.checked, ranges: getRanges() };
        const state = computeState(cfg, todayDow(), minutesNow(tz)); // 'on'|'off'
        // Ghi schedule (để iPad runner dùng sau này)
        await db.ref('control/schedule').set({
          enabled: cfg.enabled, ranges: cfg.ranges, tz,
          savedAt: firebase.database.ServerValue.TIMESTAMP,
          applyNowAt: firebase.database.ServerValue.TIMESTAMP
        });
        // Đẩy hiệu lực ngay (khỏi chờ runner tick): global + từng bàn (nếu đã có control/tables)
        await db.ref('control/screen').set(state);
        const tblSnap = await db.ref('control/tables').get().catch(()=>null);
        if (tblSnap && tblSnap.exists()){
          const up = {};
          Object.keys(tblSnap.val()||{}).forEach(k=> up[`control/tables/${k}/screen`] = state);
          if (Object.keys(up).length) await db.ref().update(up);
        }
        if ($('#sch-30s').checked){
          // Tùy chọn “áp dụng 30s”: đặt lại về 'on' sau 30s (chạy khi tab admin còn mở)
          setTimeout(async ()=>{
            try{
              await db.ref('control/screen').set('on');
            }catch(_){}
          }, 30000);
        }
        alert(`Đã áp dụng ngay: ${state==='off'?'TẮT (blackout)':'MỞ màn hình'}.`);
      }catch(e){
        alert('Áp dụng lỗi: '+(e?.message||e));
      }
    });

    // Cập nhật preview khi người dùng chỉnh JSON tay
    elTextarea.addEventListener('input', refreshPreview);
    elEnabled.addEventListener('change', refreshPreview);
    refreshPreview();
  })();
})();
