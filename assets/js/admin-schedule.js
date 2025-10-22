// assets/js/admin-scheduler.js
(function(){
  'use strict';

  // ====== Helpers ======
  const $  = (sel, root=document)=> root.querySelector(sel);
  const $$ = (sel, root=document)=> Array.from(root.querySelectorAll(sel));
  const log= (...a)=> console.log('[scheduler]', ...a);
  const warn=(...a)=> console.warn('[scheduler]', ...a);

  const DAYS_VI = ['Chủ nhật','Thứ 2','Thứ 3','Thứ 4','Thứ 5','Thứ 6','Thứ 7']; // 0..6 (Sun..Sat)
  const SHORT_EN= ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

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

      // Hook switching
      const tDevices = document.getElementById('tabDevices');
      const tCodes   = document.getElementById('tabCodes');
      const tAds     = document.getElementById('tabAds');

      btn.addEventListener('click', ()=>{
        [tDevices,tCodes,tAds,btn].forEach(b=>{
          if (!b) return;
          b.classList.toggle('bg-blue-600', b===btn);
          b.classList.toggle('text-white', b===btn);
          b.classList.toggle('bg-gray-100', b!==btn);
        });
        // show view
        document.getElementById('viewDevices')?.classList.add('hidden');
        document.getElementById('viewCodes')?.classList.add('hidden');
        document.getElementById('viewAds')?.classList.add('hidden');
        document.getElementById('viewSched')?.classList.remove('hidden');
      });

      // Khi đổi tab khác, ẩn viewSched
      [document.getElementById('tabDevices'),
       document.getElementById('tabCodes'),
       document.getElementById('tabAds')].forEach(b=>{
        b?.addEventListener('click', ()=>{
          document.getElementById('viewSched')?.classList.add('hidden');
        });
      });
    }

    // Add view (if not exists)
    if (!document.getElementById('viewSched')){
      const sec = document.createElement('section');
      sec.id = 'viewSched';
      sec.className = 'p-4 md:p-6 hidden';
      sec.innerHTML = `
        <h2 class="text-2xl font-bold text-gray-800 mb-4">Hẹn giờ tắt/bật màn hình</h2>

        <div class="max-w-4xl space-y-4">
          <div class="bg-white border border-gray-200 rounded-xl p-4">
            <div class="flex flex-wrap items-center gap-3">
              <label class="flex items-center gap-2">
                <input id="sch-enabled" type="checkbox" class="w-4 h-4">
                <span class="font-semibold">Bật chế độ hẹn giờ</span>
              </label>

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

          <div id="sch-status" class="text-sm text-gray-600"></div>
        </div>
      `;
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
    paintNowBadge();
    paintStatusPreview();
  }

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
    return cfg;
  }

  function paintStatusPreview(){
    const s = readFormToSchedule();
    const desired = computeDesiredState(s);
    $('#sch-status').textContent =
      s.enabled
        ? `Theo lịch hôm nay: màn hình sẽ ${desired==='on'?'BẬT':'TẮT'}.`
        : 'Hẹn giờ đang tắt: màn hình luôn BẬT.';
  }

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
    }catch(e){
      warn('tick error:', e?.message||e);
    }finally{
      ticking = false;
    }
  }

  function startTicker(){
    if (tickerId) clearInterval(tickerId);
    // chạy ngay + lặp mỗi 30s để cập nhật kịp phút mới
    tickOnce();
    tickerId = setInterval(tickOnce, 30000);
  }

  // ====== Boot ======
  document.addEventListener('DOMContentLoaded', async ()=>{
    try{
      await ensureDB();
      injectTab();

      // Bind events
      $('#sch-tz')?.addEventListener('change', ()=>{ paintNowBadge(); paintStatusPreview(); });
      $('#sch-enabled')?.addEventListener('change', paintStatusPreview);
      for (let d=0; d<7; d++){
        $(`#d${d}-en`)?.addEventListener('change', paintStatusPreview);
        $(`#d${d}-on`)?.addEventListener('input', paintStatusPreview);
        $(`#d${d}-off`)?.addEventListener('input', paintStatusPreview);
      }
      $('#sch-save')?.addEventListener('click', saveSchedule);

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

      // Bắt đầu tick áp lịch
      startTicker();

      // Đồng bộ badge “Bây giờ” mỗi 20s
      setInterval(paintNowBadge, 20000);

      log('Scheduler ready.');
    }catch(e){
      console.error(e);
      alert('Lỗi khởi chạy Hẹn giờ: '+(e?.message||e));
    }
  });
})();
