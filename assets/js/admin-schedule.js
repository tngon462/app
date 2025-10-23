
// ========== bản UI chuẩn T-NGON | Admin Schedule – Visual Builder ==========
(function(){
  'use strict';

  // ---------- tiny helpers ----------
  const $  = (sel, root=document)=> root.querySelector(sel);
  const $$ = (sel, root=document)=> Array.from(root.querySelectorAll(sel));
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Ho_Chi_Minh';

  function hmToMin(hm){
    const m = /^(\d{1,2}):(\d{2})$/.exec(hm||'');
    if (!m) return null;
    const h=+m[1], mm=+m[2]; if (h>23||mm>59) return null;
    return h*60+mm;
  }
  function nowMin(){ const d=new Date(); return d.getHours()*60+d.getMinutes(); }
  function todayDow(){ return new Date().getDay(); } // 0..6

  function computeState(cfg, dow, minutes){
    if (!cfg || !cfg.enabled) return 'on';
    const ranges = Array.isArray(cfg.ranges)? cfg.ranges : [];
    let off=false;
    for (const r of ranges){
      const days = (r.days||[]).map(Number);
      if (!days.includes(dow)) continue;
      const offM=hmToMin(r.off), onM=hmToMin(r.on);
      if (offM==null || onM==null) continue;
      if (offM < onM){ if (minutes>=offM && minutes<onM) off=true; }
      else { if (minutes>=offM || minutes<onM) off=true; }
    }
    return off?'off':'on';
  }

  // ---------- Firebase ----------
  async function ensureDB(){
    if (!window.firebase || !firebase.apps?.length) throw new Error('Firebase chưa init');
    if (!firebase.auth().currentUser){
      await firebase.auth().signInAnonymously();
      await new Promise(res=>{
        const un=firebase.auth().onAuthStateChanged(u=>{ if(u){ un(); res(); }});
      });
    }
    return firebase.database();
  }

  // ---------- UI mount ----------
  document.addEventListener('DOMContentLoaded', async ()=>{
    const sec = document.getElementById('viewSchedule');
    if (!sec) return;

    const elEnabled = $('#sch-enabled', sec);
    const elTextarea= $('#sch-ranges',  sec);   // sẽ ẩn, dùng làm storage JSON
    const btnSave   = $('#sch-save',    sec);
    const btnApply  = $('#sch-apply',   sec);
    const chk30s    = $('#sch-30s',     sec);

    // Ẩn textarea thô, dựng visual builder
    elTextarea.classList.add('hidden');

    const wrap = document.createElement('div');
    wrap.className = 'rounded-xl border bg-white p-3 space-y-3';
    wrap.innerHTML = `
      <div class="flex flex-wrap items-center gap-2 text-sm">
        <div class="font-semibold mr-1">Chọn ngày:</div>
        ${['CN','T2','T3','T4','T5','T6','T7'].map((lb,i)=>`
          <button data-dow="${i}" class="dow-chip px-2 py-1 rounded-full border hover:bg-gray-50">${lb}</button>
        `).join('')}
        <button id="dow-all" class="ml-1 px-2 py-1 rounded border text-xs">Chọn cả tuần</button>
        <button id="dow-wd"  class="px-2 py-1 rounded border text-xs">Ngày thường</button>
        <button id="dow-we"  class="px-2 py-1 rounded border text-xs">Cuối tuần</button>
      </div>

      <div class="flex flex-wrap items-center gap-3">
        <label class="text-sm">Tắt lúc
          <input id="time-off" type="time" value="22:30" class="ml-1 border rounded px-2 py-1">
        </label>
        <label class="text-sm">Mở lúc
          <input id="time-on"  type="time" value="08:00" class="ml-1 border rounded px-2 py-1">
        </label>
        <button id="btn-add" class="px-3 py-2 rounded bg-gray-800 text-white">Thêm vào danh sách</button>
        <div class="text-xs text-gray-500">* Qua đêm tự hiểu (VD: 22:30→08:00)</div>
      </div>

      <div>
        <div class="flex items-center justify-between mb-1">
          <div class="font-semibold">Danh sách khoảng giờ</div>
          <div class="flex gap-2">
            <button id="preset-all" class="px-2 py-1 rounded border text-xs">Mẫu: Cả tuần 22:30→08:00</button>
            <button id="preset-split" class="px-2 py-1 rounded border text-xs">Mẫu: Ngày thường/ Cuối tuần</button>
            <button id="preset-clear" class="px-2 py-1 rounded border text-xs">Xoá hết</button>
          </div>
        </div>
        <div id="range-list" class="grid sm:grid-cols-2 lg:grid-cols-3 gap-2"></div>
      </div>

      <div id="sch-preview" class="text-sm text-gray-700"></div>
    `;
    elTextarea.after(wrap);

    // state trong UI
    let uiDays = new Set();         // set các dow được chọn cho lần thêm
    let ranges = [];                // [{days:[...], off:"22:30", on:"08:00"}, ...]

    // helpers UI
    function paintDays(){
      $$('.dow-chip', wrap).forEach(btn=>{
        const d = +btn.dataset.dow;
        btn.classList.toggle('bg-blue-600', uiDays.has(d));
        btn.classList.toggle('text-white', uiDays.has(d));
        btn.classList.toggle('border-blue-600', uiDays.has(d));
      });
    }
    function putRanges(newRanges){
      ranges = newRanges.slice();
      // sync xuống textarea (để giữ tương thích)
      elTextarea.value = JSON.stringify(ranges, null, 2);
      renderRangeList();
      refreshPreview();
    }
    function getCfg(){ return { enabled: !!elEnabled.checked, ranges }; }

    function dayLabel(ds){
      const map = ['CN','T2','T3','T4','T5','T6','T7'];
      const sorted = ds.slice().sort((a,b)=>a-b);
      return sorted.map(d=>map[d]).join(', ');
    }

    function renderRangeList(){
      const box = $('#range-list', wrap);
      box.innerHTML = '';
      if (!ranges.length){
        box.innerHTML = `<div class="text-sm text-gray-500">Chưa có khoảng giờ nào.</div>`;
        return;
      }
      ranges.forEach((r,idx)=>{
        const card = document.createElement('div');
        card.className = 'border rounded-lg p-2 bg-white';
        card.innerHTML = `
          <div class="text-sm font-medium">${dayLabel(r.days||[])}</div>
          <div class="text-xs text-gray-600 mt-0.5">Tắt: <b>${r.off}</b> • Mở: <b>${r.on}</b></div>
          <div class="mt-2 flex gap-2">
            <button data-act="edit"   data-i="${idx}" class="px-2 py-1 rounded border text-xs">Sửa</button>
            <button data-act="delete" data-i="${idx}" class="px-2 py-1 rounded bg-red-600 text-white text-xs">Xoá</button>
          </div>
        `;
        card.addEventListener('click', (ev)=>{
          const act = ev.target?.dataset?.act;
          const i   = +ev.target?.dataset?.i;
          if (Number.isNaN(i)) return;
          if (act==='delete'){
            const clone = ranges.slice(); clone.splice(i,1); putRanges(clone);
          } else if (act==='edit'){
            const rr = ranges[i];
            // đổ vào form add để sửa nhanh
            uiDays = new Set((rr.days||[]).map(Number));
            $('#time-off',wrap).value = rr.off||'22:30';
            $('#time-on', wrap).value = rr.on ||'08:00';
            paintDays();
            // xoá mục cũ, người dùng bấm "Thêm" sẽ tạo lại
            const clone = ranges.slice(); clone.splice(i,1); putRanges(clone);
          }
        });
        box.appendChild(card);
      });
    }

    function refreshPreview(){
      const st = computeState(getCfg(), todayDow(), nowMin());
      $('#sch-preview',wrap).textContent =
        `Bây giờ: ${st==='off'?'ĐANG TẮT (blackout)':'ĐANG MỞ'} • Nếu "Áp dụng ngay" sẽ ghi: control/screen="${st}".`;
    }

    // events: chọn ngày
    $$('.dow-chip', wrap).forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const d = +btn.dataset.dow;
        if (uiDays.has(d)) uiDays.delete(d); else uiDays.add(d);
        paintDays();
      });
    });
    $('#dow-all', wrap).addEventListener('click', ()=>{
      uiDays = new Set([0,1,2,3,4,5,6]); paintDays();
    });
    $('#dow-wd', wrap).addEventListener('click', ()=>{
      uiDays = new Set([1,2,3,4,5]); paintDays();
    });
    $('#dow-we', wrap).addEventListener('click', ()=>{
      uiDays = new Set([0,6]); paintDays();
    });

    // Thêm range
    $('#btn-add', wrap).addEventListener('click', ()=>{
      const days = Array.from(uiDays.values()).sort((a,b)=>a-b);
      if (!days.length) { alert('Chọn ít nhất 1 ngày.'); return; }
      const off = String($('#time-off',wrap).value||'').trim();
      const on  = String($('#time-on', wrap).value||'').trim();
      if (hmToMin(off)==null || hmToMin(on)==null){ alert('Giờ không hợp lệ.'); return; }
      const next = ranges.slice(); next.push({days, off, on}); putRanges(next);
    });

    // Presets
    function presetAll(){ return [{days:[0,1,2,3,4,5,6], off:'22:30', on:'08:00'}]; }
    function presetSplit(){
      return [
        {days:[1,2,3,4,5], off:'22:30', on:'08:00'},
        {days:[0,6],       off:'23:30', on:'09:00'}
      ];
    }
    $('#preset-all', wrap).addEventListener('click', ()=> putRanges(presetAll()));
    $('#preset-split',wrap).addEventListener('click', ()=> putRanges(presetSplit()));
    $('#preset-clear',wrap).addEventListener('click', ()=> putRanges([]));

    // Load từ Firebase
    let db=null;
    try{
      db = await ensureDB();
      const snap = await db.ref('control/schedule').get();
      const v = snap.exists()? snap.val() : null;
      elEnabled.checked = !!(v && v.enabled!==false);
      const saved = v && Array.isArray(v.ranges) ? v.ranges : presetAll();
      putRanges(saved);
    }catch(e){
      console.warn('[schedule] load error:', e);
      elEnabled.checked = true;
      putRanges(presetAll());
    }

    // Save
    $('#sch-save')?.addEventListener('click', async ()=>{
      try{
        // validate ranges
        for (const r of ranges){
          if (!Array.isArray(r.days) || !r.days.length || r.days.some(d=>d<0||d>6)) throw new Error('Ngày không hợp lệ');
          if (hmToMin(r.off)==null || hmToMin(r.on)==null) throw new Error('Giờ không hợp lệ');
        }
        await db.ref('control/schedule').set({
          enabled: !!elEnabled.checked,
          ranges, tz,
          savedAt: firebase.database.ServerValue.TIMESTAMP
        });
        alert('Đã lưu cấu hình.');
      }catch(e){
        alert('Lưu lỗi: '+(e?.message||e));
      }
    });

    // Apply now
    $('#sch-apply')?.addEventListener('click', async ()=>{
      try{
        const cfg = getCfg();
        const state = computeState(cfg, todayDow(), nowMin()); // 'on'|'off'
        // ghi schedule (runner sẽ dùng) + dấu apply
        await db.ref('control/schedule').set({
          enabled: cfg.enabled, ranges: cfg.ranges, tz,
          savedAt: firebase.database.ServerValue.TIMESTAMP,
          applyNowAt: firebase.database.ServerValue.TIMESTAMP
        });
        // ép hiệu lực ngay (để không cần chờ runner tick)
        await db.ref('control/screen').set(state);
        const tblSnap = await db.ref('control/tables').get().catch(()=>null);
        if (tblSnap && tblSnap.exists()){
          const up = {};
          Object.keys(tblSnap.val()||{}).forEach(k=> up[`control/tables/${k}/screen`] = state);
          if (Object.keys(up).length) await db.ref().update(up);
        }
        if (chk30s?.checked){
          setTimeout(async ()=>{ try{ await db.ref('control/screen').set('on'); }catch(_){}} , 30000);
        }
        alert(`Đã áp dụng ngay: ${state==='off'?'TẮT (blackout)':'MỞ màn hình'}.`);
      }catch(e){
        alert('Áp dụng lỗi: '+(e?.message||e));
      }
    });

    // khi bật/tắt enabled → cập nhật preview
    elEnabled.addEventListener('change', refreshPreview);
    refreshPreview();
  });
})();
