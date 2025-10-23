// assets/js/admin-schedule.js
// assets/js/admin-scheduler.js
(function(){
'use strict';

  // ===== Helpers =====
  const $ = (sel, root=document)=> root.querySelector(sel);
  const $$= (sel, root=document)=> Array.from(root.querySelectorAll(sel));
  const pad2 = (n)=> (n<10? '0'+n : ''+n);
  const todayDowIndex = ()=> { // 0..6 (Mon..Sun)
    const js = new Date().getDay(); // 0..6 (Sun..Sat)
    return (js+6)%7; // Mon=0 .. Sun=6
  };
  const DOW_KEYS = ['mon','tue','wed','thu','fri','sat','sun'];
  const DOW_LABELS= ['Thứ 2','Thứ 3','Thứ 4','Thứ 5','Thứ 6','Thứ 7','CN'];

  // ===== Config =====
  const TABLE_COUNT = 15;
  const SCHEDULE_PATH = 'control/schedule';   // control/schedule/mon..sun
  const REF_SCREEN    = 'control/screen';     // 'on' | 'off'
  const REF_TABLES    = 'control/tables';     // .../{i}/screen

  // ===== UI bootstrap =====
  function ensureTabAndView(){
    // Tìm thanh tabs hiện có:
    const tabBar = document.getElementById('tabDevices')?.parentElement;
    let btnTab = document.getElementById('tabSchedule');
    if (!btnTab && tabBar){
      btnTab = document.createElement('button');
      btnTab.id = 'tabSchedule';
      btnTab.className = 'px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200';
      btnTab.textContent = 'Hẹn giờ';
      tabBar.appendChild(btnTab);

      // Bật routing nếu app đang dùng buttons để show/hide view:
      const vSchedule = document.createElement('section');
      vSchedule.id = 'viewSchedule';
      vSchedule.className = 'p-4 md:p-6 hidden';
      vSchedule.innerHTML = `
        <h2 class="text-2xl font-bold text-gray-800 mb-4">Hẹn giờ tắt/bật màn hình</h2>
        <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4 md:p-5">
          <div class="flex flex-wrap items-center gap-2 mb-4">
            <button id="schSave" class="px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700">Lưu tất cả</button>
            <button id="schApplyNow" class="px-3 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-700">Áp dụng ngay</button>
            <label class="inline-flex items-center gap-2 ml-auto text-sm">
              <input id="schAuto" type="checkbox" class="w-4 h-4">
              <span>Tự động áp dụng theo giờ (mỗi 30s)</span>
            </label>
          </div>
  // ====== Helpers ======
  const $  = (sel, root=document)=> root.querySelector(sel);
  const $$ = (sel, root=document)=> Array.from(root.querySelectorAll(sel));
  const log= (...a)=> console.log('[scheduler]', ...a);
  const warn=(...a)=> console.warn('[scheduler]', ...a);

          <div class="overflow-auto">
            <table class="min-w-[720px] w-full text-sm">
              <thead class="bg-gray-50 text-gray-600">
                <tr>
                  <th class="px-2 py-2 text-left">Thứ</th>
                  <th class="px-2 py-2 text-left">Bật lúc</th>
                  <th class="px-2 py-2 text-left">Tắt lúc</th>
                  <th class="px-2 py-2 text-left">Bật lịch (ngày)</th>
                </tr>
              </thead>
              <tbody id="schBody"></tbody>
            </table>
          </div>
  const DAYS_VI = ['Chủ nhật','Thứ 2','Thứ 3','Thứ 4','Thứ 5','Thứ 6','Thứ 7']; // 0..6 (Sun..Sat)
  const SHORT_EN= ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

          <p class="text-xs text-gray-500 mt-3">
            * Lịch sẽ ghi vào <code>control/schedule/</code>. Đến giờ, hệ thống sẽ set
            <code>control/screen</code> và toàn bộ <code>control/tables/*/screen</code> tương ứng.
          </p>
          <div id="schMsg" class="mt-3 hidden p-3 rounded bg-amber-50 text-amber-700 text-sm"></div>
        </div>
      `;
      // chèn sau viewDevices:
      const anchor = document.getElementById('viewDevices');
      if (anchor && anchor.parentNode){
        anchor.parentNode.insertBefore(vSchedule, anchor.nextSibling);
      } else {
        document.body.appendChild(vSchedule);
      }
  // ====== State ======
  let db = null;
  let schedRef = null;   // control/schedule
  let screenRef = null;  // control/screen
  let schedule = null;   // cache lịch từ DB
  let ticking = false;   // chặn tick trùng
  let tickerId = null;

  // ====== Ensure Firebase ready (ẩn danh) ======
  async function ensureDB(){
    if (!window.firebase || !firebase.apps?.length){
      throw new Error('Firebase chưa init – đặt <script src="...firebase-*.js"> và initializeApp trước file admin-scheduler.js');
    }
    if (!firebase.auth().currentUser){
      await firebase.auth().signInAnonymously();
      await new Promise(res=>{
        const un=firebase.auth().onAuthStateChanged(u=>{ if(u){ un(); res(); }});
      });
    }
    db = firebase.database();
    schedRef = db.ref('control/schedule');
    screenRef= db.ref('control/screen');
  }

  // ====== Time helpers with timezone ======
  function nowInTZ(tz){
    const d = new Date();
    const wd = new Intl.DateTimeFormat('en-US',{ timeZone: tz, weekday:'short' }).format(d);
    const dayIdx = SHORT_EN.indexOf(wd); // 0..6
    const parts = new Intl.DateTimeFormat('en-GB',{
      timeZone: tz, hour12:false, hour:'2-digit', minute:'2-digit'
    }).formatToParts(d);
    const hh = Number(parts.find(p=>p.type==='hour').value);
    const mm = Number(parts.find(p=>p.type==='minute').value);
    return { day: dayIdx, minutes: hh*60 + mm, hh, mm };
  }
  function hhmmToMinutes(hhmm){
    if (!hhmm) return null;
    const [h,m] = String(hhmm).split(':').map(Number);
    if (Number.isFinite(h) && Number.isFinite(m)) return h*60+m;
    return null;
  }
  function isOnAt(minutesNow, onM, offM){
    if (onM==null || offM==null) return false;
    if (onM===offM) return false;
    if (onM < offM){
      // bình thường trong ngày
      return onM <= minutesNow && minutesNow < offM;
    } else {
      // khoảng qua đêm: ON từ on->23:59 và 00:00->off
      return (minutesNow >= onM) || (minutesNow < offM);
    }
  }

  function computeDesiredState(s){
    const tz = s?.timezone || 'Asia/Tokyo';
    const enabled = !!s?.enabled;
    if (!enabled) return 'on'; // tắt hẹn giờ -> luôn bật màn hình

    const { day, minutes } = nowInTZ(tz);
    const dayCfg = s?.days?.[day];
    if (!dayCfg || !dayCfg.enabled) return 'on';

    const onM  = hhmmToMinutes(dayCfg.on);
    const offM = hhmmToMinutes(dayCfg.off);
    return isOnAt(minutes, onM, offM) ? 'on' : 'off';
  }

  // ====== UI inject: add a new tab + view ======
  function injectTab(){
    const tabBar = document.getElementById('tabAds')?.parentElement;
    const main   = document.querySelector('main') || document.body;
    if (!tabBar || !main) { warn('Không tìm thấy thanh tabs hoặc main'); return; }

    // Add button
    if (!document.getElementById('tabSched')){
      const btn = document.createElement('button');
      btn.id = 'tabSched';
      btn.className = 'px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200';
      btn.textContent = 'Hẹn giờ';
      tabBar.appendChild(btn);

      // Hook chuyển tab (nối với router có sẵn):
      // Hook switching
const tDevices = document.getElementById('tabDevices');
const tCodes   = document.getElementById('tabCodes');
const tAds     = document.getElementById('tabAds');
      const vDevices = document.getElementById('viewDevices');
      const vCodes   = document.getElementById('viewCodes');
      const vAds     = document.getElementById('viewAds');

      const activate = (btn)=>{
        [tDevices,tCodes,tAds,btnTab].forEach(b=>{
      btn.addEventListener('click', ()=>{
        [tDevices,tCodes,tAds,btn].forEach(b=>{
if (!b) return;
b.classList.toggle('bg-blue-600', b===btn);
b.classList.toggle('text-white', b===btn);
b.classList.toggle('bg-gray-100', b!==btn);
});
      };
      const show = (which)=>{
        if (vDevices) vDevices.classList.toggle('hidden', which!=='devices');
        if (vCodes)   vCodes  .classList.toggle('hidden', which!=='codes');
        if (vAds)     vAds    .classList.toggle('hidden', which!=='ads');
        document.getElementById('viewSchedule')?.classList.toggle('hidden', which!=='schedule');
      };
        // show view
        document.getElementById('viewDevices')?.classList.add('hidden');
        document.getElementById('viewCodes')?.classList.add('hidden');
        document.getElementById('viewAds')?.classList.add('hidden');
        document.getElementById('viewSched')?.classList.remove('hidden');
      });

      btnTab.addEventListener('click', ()=>{ activate(btnTab); show('schedule'); });
      // Khi đổi tab khác, ẩn viewSched
      [document.getElementById('tabDevices'),
       document.getElementById('tabCodes'),
       document.getElementById('tabAds')].forEach(b=>{
        b?.addEventListener('click', ()=>{
          document.getElementById('viewSched')?.classList.add('hidden');
        });
      });
}

    return {
      tableBody: document.getElementById('schBody'),
      msgBox:    document.getElementById('schMsg'),
      btnSave:   document.getElementById('schSave'),
      btnApply:  document.getElementById('schApplyNow'),
      autoChk:   document.getElementById('schAuto'),
    };
  }
    // Add view (if not exists)
    if (!document.getElementById('viewSched')){
      const sec = document.createElement('section');
      sec.id = 'viewSched';
      sec.className = 'p-4 md:p-6 hidden';
      sec.innerHTML = `
        <h2 class="text-2xl font-bold text-gray-800 mb-4">Hẹn giờ tắt/bật màn hình</h2>

  function showMsg(box, text){
    if (!box) return;
    if (!text){ box.classList.add('hidden'); box.textContent=''; return; }
    box.textContent = text; box.classList.remove('hidden');
  }
        <div class="max-w-4xl space-y-4">
          <div class="bg-white border border-gray-200 rounded-xl p-4">
            <div class="flex flex-wrap items-center gap-3">
              <label class="flex items-center gap-2">
                <input id="sch-enabled" type="checkbox" class="w-4 h-4">
                <span class="font-semibold">Bật chế độ hẹn giờ</span>
              </label>

  // ===== Firebase =====
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
              <div class="flex items-center gap-2">
                <span class="text-sm text-gray-600">Múi giờ</span>
                <select id="sch-tz" class="px-2 py-1 border rounded">
                  <option value="Asia/Tokyo">Asia/Tokyo (JP)</option>
                  <option value="Asia/Ho_Chi_Minh">Asia/Ho_Chi_Minh (VN)</option>
                  <option value="Asia/Bangkok">Asia/Bangkok (TH)</option>
                  <option value="Asia/Seoul">Asia/Seoul (KR)</option>
                  <option value="Asia/Shanghai">Asia/Shanghai (CN)</option>
                  <option value="UTC">UTC</option>
                </select>
              </div>

              <div class="text-sm text-gray-500" id="sch-now">—</div>

              <button id="sch-save" class="ml-auto px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700">
                Lưu cấu hình
              </button>
            </div>
          </div>

          <div class="bg-white border border-gray-200 rounded-xl p-4">
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" id="sch-days"></div>
          </div>

  // ===== Render rows =====
  function renderRows(tbody, data){
    if (!tbody) return;
    tbody.innerHTML = '';
    for (let i=0;i<7;i++){
      const k = DOW_KEYS[i];
      const row = data?.[k] || {};
      const on  = typeof row.on  === 'string' ? row.on  : '07:30';
      const off = typeof row.off === 'string' ? row.off : '22:30';
      const en  = row.enabled!==false;

      const tr = document.createElement('tr');
      tr.className = 'border-b last:border-0';
      tr.innerHTML = `
        <td class="px-2 py-2 font-medium">${DOW_LABELS[i]}</td>
        <td class="px-2 py-2"><input type="time" value="${on}"  data-k="${k}" data-field="on"  class="border rounded px-2 py-1"></td>
        <td class="px-2 py-2"><input type="time" value="${off}" data-k="${k}" data-field="off" class="border rounded px-2 py-1"></td>
        <td class="px-2 py-2">
          <label class="inline-flex items-center gap-2">
            <input type="checkbox" ${en?'checked':''} data-k="${k}" data-field="enabled">
            <span class="text-sm">Bật</span>
          </label>
        </td>
          <div id="sch-status" class="text-sm text-gray-600"></div>
        </div>
     `;
      tbody.appendChild(tr);
      const after = document.getElementById('viewAds') || document.getElementById('viewCodes') || document.getElementById('viewDevices');
      if (after && after.parentNode){
        after.parentNode.insertBefore(sec, after.nextSibling);
      }else{
        document.body.appendChild(sec);
      }
    }

    // build day cards
    const daysWrap = document.getElementById('sch-days');
    if (daysWrap && !daysWrap.childElementCount){
      for (let d=0; d<7; d++){
        const col = document.createElement('div');
        col.className = 'border rounded-lg p-3';
        col.innerHTML = `
          <div class="flex items-center justify-between mb-2">
            <div class="font-semibold">${DAYS_VI[d]}</div>
            <label class="flex items-center gap-2 text-sm">
              <input type="checkbox" id="d${d}-en" class="w-4 h-4">
              <span>Bật</span>
            </label>
          </div>
          <div class="flex items-center gap-2">
            <label class="text-sm">Bật lúc</label>
            <input type="time" id="d${d}-on" class="px-2 py-1 border rounded flex-1">
          </div>
          <div class="flex items-center gap-2 mt-2">
            <label class="text-sm">Tắt lúc</label>
            <input type="time" id="d${d}-off" class="px-2 py-1 border rounded flex-1">
          </div>
          <div class="text-xs text-gray-500 mt-2">Nếu “Bật lúc” &gt; “Tắt lúc” sẽ hiểu là khoảng qua đêm.</div>
        `;
        daysWrap.appendChild(col);
      }
}
}

  function collectRows(tbody){
    const data = {};
    for (let i=0;i<7;i++){
      const k = DOW_KEYS[i];
      const onInput  = tbody.querySelector(`input[type="time"][data-k="${k}"][data-field="on"]`);
      const offInput = tbody.querySelector(`input[type="time"][data-k="${k}"][data-field="off"]`);
      const enInput  = tbody.querySelector(`input[type="checkbox"][data-k="${k}"][data-field="enabled"]`);
      data[k] = {
        on:  onInput?.value || '07:30',
        off: offInput?.value || '22:30',
        enabled: !!enInput?.checked
      };
  // ====== Render & bind ======
  function paintNowBadge(){
    const tz = $('#sch-tz')?.value || 'Asia/Tokyo';
    const n = nowInTZ(tz);
    const hh = String(n.hh).padStart(2,'0');
    const mm = String(n.mm).padStart(2,'0');
    $('#sch-now').textContent = `Bây giờ (${tz}): ${DAYS_VI[n.day]}, ${hh}:${mm}`;
  }

  function fillFormFromSchedule(s){
    $('#sch-enabled').checked = !!s?.enabled;
    $('#sch-tz').value = s?.timezone || 'Asia/Tokyo';
    for (let d=0; d<7; d++){
      const row = s?.days?.[d] || { enabled:false, on:'09:00', off:'22:00' };
      $(`#d${d}-en`).checked  = !!row.enabled;
      $(`#d${d}-on`).value    = row.on  || '09:00';
      $(`#d${d}-off`).value   = row.off || '22:00';
}
    return data;
    paintNowBadge();
    paintStatusPreview();
}

  // ===== Apply logic =====
  async function setAll(db, val){ // 'on' | 'off'
    await db.ref(REF_SCREEN).set(val);
    const updates = {};
    for (let i=1;i<=TABLE_COUNT;i++){
      updates[`${REF_TABLES}/${i}/screen`] = val;
  function readFormToSchedule(){
    const cfg = {
      enabled : $('#sch-enabled').checked,
      timezone: $('#sch-tz').value || 'Asia/Tokyo',
      days    : {}
    };
    for (let d=0; d<7; d++){
      cfg.days[d] = {
        enabled: $(`#d${d}-en`).checked,
        on : $(`#d${d}-on`).value || '',
        off: $(`#d${d}-off`).value || ''
      };
}
    await db.ref().update(updates);
    return cfg;
}

  function timeToMinutes(hhmm){
    const [h,m] = (hhmm||'').split(':').map(x=>parseInt(x,10));
    if (!isFinite(h)||!isFinite(m)) return null;
    return h*60+m;
  function paintStatusPreview(){
    const s = readFormToSchedule();
    const desired = computeDesiredState(s);
    $('#sch-status').textContent =
      s.enabled
        ? `Theo lịch hôm nay: màn hình sẽ ${desired==='on'?'BẬT':'TẮT'}.`
        : 'Hẹn giờ đang tắt: màn hình luôn BẬT.';
}

  // Khi nhấn "Áp dụng ngay": xét lịch hôm nay, nếu giờ hiện tại >= off -> off; else nếu >= on -> on.
  // Nếu on/off trùng nhau coi như vô hiệu.
  async function applyNow(db, data){
    const i = todayDowIndex();
    const k = DOW_KEYS[i];
    const row = data?.[k];
    if (!row || row.enabled===false) return;

    const now = new Date();
    const cur = now.getHours()*60 + now.getMinutes();
    const onM  = timeToMinutes(row.on);
    const offM = timeToMinutes(row.off);
    if (onM==null || offM==null || onM===offM) return;

    // Giả định lịch trong ngày, không qua đêm:
    if (cur >= offM){ await setAll(db, 'off'); return; }
    if (cur >= onM){ await setAll(db, 'on');  return; }
    // Chưa tới giờ on: để nguyên
  async function saveSchedule(){
    try{
      const cfg = readFormToSchedule();
      // đảm bảo có nút control/screen khởi tạo
      const snap = await screenRef.get();
      if (!snap.exists()) await screenRef.set('on');

      await schedRef.set({
        ...cfg,
        updatedAt: firebase.database.ServerValue.TIMESTAMP
      });
      alert('Đã lưu lịch.');
    }catch(e){
      alert('Lưu lịch lỗi: '+(e?.message||e));
    }
}

  // Tự động áp dụng: chỉ bắn lệnh đúng phút chuyển (hạn chế ghi lặp)
  let autoTimer = null;
  let lastFiredKey = ''; // "YYYYMMDD-HH:MM"
  function startAuto(db, data, msgBox){
    stopAuto();
    autoTimer = setInterval(async ()=>{
      try{
        const now = new Date();
        const i = todayDowIndex();
        const k = DOW_KEYS[i];
        const row = data?.[k];
        if (!row || row.enabled===false) return;

        const curStr = pad2(now.getHours()) + ':' + pad2(now.getMinutes());
        const key = now.getFullYear()+pad2(now.getMonth()+1)+pad2(now.getDate())+'-'+curStr;
        if (key === lastFiredKey) return;

        if (curStr === row.on){
          await setAll(db, 'on');
          lastFiredKey = key;
          showMsg(msgBox, `Đã bật toàn bộ lúc ${curStr} (${DOW_LABELS[i]}).`);
        } else if (curStr === row.off){
          await setAll(db, 'off');
          lastFiredKey = key;
          showMsg(msgBox, `Đã tắt toàn bộ lúc ${curStr} (${DOW_LABELS[i]}).`);
        }
      }catch(e){
        console.error('[schedule] auto apply error:', e);
  // ====== Scheduler tick (đánh giá mỗi phút) ======
  async function tickOnce(){
    if (ticking) return;
    ticking = true;
    try{
      const s = schedule;
      if (!s) return;
      const desired = computeDesiredState(s);

      const curSnap = await screenRef.get();
      const current = (curSnap.exists()? String(curSnap.val()).toLowerCase() : 'on');
      if (current !== desired){
        await screenRef.set(desired);
        log('Applied screen=', desired);
}
    }, 30*1000); // 30s
    }catch(e){
      warn('tick error:', e?.message||e);
    }finally{
      ticking = false;
    }
}
  function stopAuto(){
    if (autoTimer){ clearInterval(autoTimer); autoTimer=null; }

  function startTicker(){
    if (tickerId) clearInterval(tickerId);
    // chạy ngay + lặp mỗi 30s để cập nhật kịp phút mới
    tickOnce();
    tickerId = setInterval(tickOnce, 30000);
}

  // ===== Boot =====
  // ====== Boot ======
document.addEventListener('DOMContentLoaded', async ()=>{
try{
      const ui = ensureTabAndView();
      const db = await ensureDB();

      // Load schedule
      db.ref(SCHEDULE_PATH).on('value', snap=>{
        const data = snap.val() || {};
        renderRows(ui.tableBody, data);
      });
      await ensureDB();
      injectTab();

      // Save all
      ui.btnSave?.addEventListener('click', async ()=>{
        try{
          const data = collectRows(ui.tableBody);
          await db.ref(SCHEDULE_PATH).set(data);
          showMsg(ui.msgBox, 'Đã lưu lịch hẹn giờ.');
          setTimeout(()=> showMsg(ui.msgBox, ''), 2000);
        }catch(e){
          showMsg(ui.msgBox, 'Lỗi lưu: '+(e?.message||e));
        }
      });
      // Bind events
      $('#sch-tz')?.addEventListener('change', ()=>{ paintNowBadge(); paintStatusPreview(); });
      $('#sch-enabled')?.addEventListener('change', paintStatusPreview);
      for (let d=0; d<7; d++){
        $(`#d${d}-en`)?.addEventListener('change', paintStatusPreview);
        $(`#d${d}-on`)?.addEventListener('input', paintStatusPreview);
        $(`#d${d}-off`)?.addEventListener('input', paintStatusPreview);
      }
      $('#sch-save')?.addEventListener('click', saveSchedule);

      // Apply now
      ui.btnApply?.addEventListener('click', async ()=>{
        try{
          const data = collectRows(ui.tableBody);
          await applyNow(db, data);
          showMsg(ui.msgBox, 'Đã áp dụng theo lịch hôm nay.');
          setTimeout(()=> showMsg(ui.msgBox, ''), 2000);
        }catch(e){
          showMsg(ui.msgBox, 'Lỗi áp dụng: '+(e?.message||e));
        }
      });
      // Subscribe schedule from DB
      schedRef.on('value', (snap)=>{
        schedule = snap.val() || {
          enabled:true,
          timezone:'Asia/Tokyo',
          days:{
            0:{enabled:false,on:'09:00',off:'22:00'},
            1:{enabled:true, on:'09:00',off:'22:00'},
            2:{enabled:true, on:'09:00',off:'22:00'},
            3:{enabled:true, on:'09:00',off:'22:00'},
            4:{enabled:true, on:'09:00',off:'22:00'},
            5:{enabled:true, on:'09:00',off:'22:00'},
            6:{enabled:true, on:'09:00',off:'22:00'}
          }
        };
        fillFormFromSchedule(schedule);
      }, (err)=> warn('schedule subscribe error:', err?.message||err));

      // Auto apply toggle
      ui.autoChk?.addEventListener('change', async ()=>{
        const data = collectRows(ui.tableBody);
        if (ui.autoChk.checked) startAuto(db, data, ui.msgBox);
        else stopAuto();
      });
      // Bắt đầu tick áp lịch
      startTicker();

      // Nếu muốn mặc định bật auto khi mở trang (tùy chọn):
      // ui.autoChk.checked = true;
      // const dataInit = collectRows(ui.tableBody);
      // startAuto(db, dataInit, ui.msgBox);
      // Đồng bộ badge “Bây giờ” mỗi 20s
      setInterval(paintNowBadge, 20000);

      log('Scheduler ready.');
}catch(e){
      console.error('[schedule] boot error:', e);
      alert('Lỗi khởi chạy tab Hẹn giờ: '+(e?.message||e));
      console.error(e);
      alert('Lỗi khởi chạy Hẹn giờ: '+(e?.message||e));
}
});
})();
