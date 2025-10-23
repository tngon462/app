// assets/js/admin-schedule.js  (clean)
(function(){
  'use strict';

  // ===== Helpers =====
  const $  = (sel, root=document)=> root.querySelector(sel);
  const $$ = (sel, root=document)=> Array.from(root.querySelectorAll(sel));
  const pad2 = (n)=> (n<10? ('0'+n) : String(n));
  const SHORT_EN = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const DOW_VI   = ['Thứ 2','Thứ 3','Thứ 4','Thứ 5','Thứ 6','Thứ 7','CN']; // Mon..Sun
  const TABLE_COUNT = 15;

  // ===== Firebase =====
  let db=null;
  async function ensureDB(){
    if (!window.firebase || !firebase.apps?.length) throw new Error('Firebase chưa init');
    if (!firebase.auth().currentUser){
      await firebase.auth().signInAnonymously();
      await new Promise(res=>{
        const un=firebase.auth().onAuthStateChanged(u=>{ if(u){ un(); res(); }});
      });
    }
    db = firebase.database();
    return db;
  }

  // ===== Time helpers =====
  function nowInTZ(tz){
    const d = new Date();
    const wd = new Intl.DateTimeFormat('en-US',{ timeZone: tz, weekday:'short' }).format(d);
    const dayIdxSun0 = SHORT_EN.indexOf(wd); // 0..6 (Sun..Sat)
    // chuyển về Mon..Sun (0..6)
    const dayIdx = (dayIdxSun0 + 6) % 7;
    const parts = new Intl.DateTimeFormat('en-GB',{ timeZone: tz, hour12:false, hour:'2-digit', minute:'2-digit' })
      .formatToParts(d);
    const hh = Number(parts.find(p=>p.type==='hour').value);
    const mm = Number(parts.find(p=>p.type==='minute').value);
    return { day: dayIdx, minutes: hh*60+mm, hh, mm };
  }
  const hhmmToMinutes = (s)=>{
    if (!s) return null;
    const [h,m] = String(s).split(':').map(Number);
    return (Number.isFinite(h)&&Number.isFinite(m)) ? h*60+m : null;
  };
  function isOnAt(minutesNow, onM, offM){
    if (onM==null || offM==null) return false;
    if (onM===offM) return false;
    if (onM < offM) return onM <= minutesNow && minutesNow < offM;
    // qua đêm
    return (minutesNow >= onM) || (minutesNow < offM);
  }
  function computeDesiredState(s){
    const tz = s?.timezone || 'Asia/Ho_Chi_Minh';
    const enabled = !!s?.enabled;
    if (!enabled) return 'on';
    const { day, minutes } = nowInTZ(tz);
    const dayCfg = s?.days?.[day];
    if (!dayCfg || !dayCfg.enabled) return 'on';
    const onM  = hhmmToMinutes(dayCfg.on);
    const offM = hhmmToMinutes(dayCfg.off);
    return isOnAt(minutes, onM, offM) ? 'on' : 'off';
  }

  // ===== UI inject (Tab + View) =====
  function injectScheduleUI(){
    const tabBar = $('#tabDevices')?.parentElement;
    if (!tabBar) return null;

    // Button tab
    let btn = $('#tabSchedule');
    if (!btn){
      btn = document.createElement('button');
      btn.id = 'tabSchedule';
      btn.className = 'px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200';
      btn.textContent = 'Hẹn giờ';
      tabBar.appendChild(btn);
    }

    // View
    let view = $('#viewSchedule');
    if (!view){
      view = document.createElement('section');
      view.id = 'viewSchedule';
      view.className = 'p-4 md:p-6 hidden';
      view.innerHTML = `
        <h2 class="text-2xl font-bold text-gray-800 mb-4">Hẹn giờ tắt/bật màn hình</h2>
        <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4 md:p-5 space-y-4">
          <div class="flex flex-wrap items-center gap-3">
            <label class="flex items-center gap-2">
              <input id="sch-enabled" type="checkbox" class="w-4 h-4">
              <span class="font-semibold">Bật chế độ hẹn giờ</span>
            </label>
            <div class="flex items-center gap-2">
              <span class="text-sm text-gray-600">Múi giờ</span>
              <select id="sch-tz" class="px-2 py-1 border rounded">
                <option value="Asia/Ho_Chi_Minh">Asia/Ho_Chi_Minh (VN)</option>
                <option value="Asia/Bangkok">Asia/Bangkok (TH)</option>
                <option value="Asia/Tokyo">Asia/Tokyo (JP)</option>
                <option value="Asia/Seoul">Asia/Seoul (KR)</option>
                <option value="Asia/Shanghai">Asia/Shanghai (CN)</option>
                <option value="UTC">UTC</option>
              </select>
            </div>
            <div id="sch-now" class="text-sm text-gray-500">—</div>
            <div class="ml-auto flex items-center gap-2">
              <button id="sch-save" class="px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700">Lưu cấu hình</button>
              <button id="sch-apply" class="px-3 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-700">Áp dụng ngay</button>
              <label class="inline-flex items-center gap-2 text-sm">
                <input id="sch-auto" type="checkbox" class="w-4 h-4">
                <span>Tự động áp dụng mỗi 30s</span>
              </label>
            </div>
          </div>

          <div class="overflow-auto">
            <table class="min-w-[680px] w-full text-sm">
              <thead class="bg-gray-50 text-gray-600">
                <tr>
                  <th class="px-2 py-2 text-left">Thứ</th>
                  <th class="px-2 py-2 text-left">Bật lúc</th>
                  <th class="px-2 py-2 text-left">Tắt lúc</th>
                  <th class="px-2 py-2 text-left">Sử dụng</th>
                </tr>
              </thead>
              <tbody id="sch-body"></tbody>
            </table>
          </div>

          <p class="text-xs text-gray-500">
            * Cấu hình lưu ở <code>control/schedule</code>. Khi đến giờ, hệ thống sẽ set
            <code>control/screen</code> và toàn bộ <code>control/tables/*/screen</code>.
          </p>

          <div id="sch-msg" class="hidden p-3 rounded bg-amber-50 text-amber-700 text-sm"></div>
        </div>
      `;
      // chèn ngay sau viewDevices
      const anchor = $('#viewDevices');
      anchor?.parentNode?.insertBefore(view, anchor.nextSibling);
    }

    // Hook router tab có sẵn
    const tDevices = $('#tabDevices'), tCodes = $('#tabCodes'), tAds = $('#tabAds');
    const vDevices = $('#viewDevices'), vCodes = $('#viewCodes'), vAds = $('#viewAds');

    const show = (which)=>{
      vDevices?.classList.toggle('hidden', which!=='devices');
      vCodes?.classList.toggle('hidden',   which!=='codes');
      vAds?.classList.toggle('hidden',     which!=='ads');
      view.classList.toggle('hidden',      which!=='schedule');
      [tDevices,tCodes,tAds,btn].forEach(b=>{
        if (!b) return;
        b.classList.toggle('bg-blue-600', b===btn && which==='schedule');
        b.classList.toggle('text-white',  b===btn && which==='schedule');
        b.classList.toggle('bg-gray-100', !(b===btn && which==='schedule'));
      });
    };
    btn.addEventListener('click', ()=> show('schedule'));
    tDevices?.addEventListener('click', ()=> show('devices'));
    tCodes?.addEventListener('click',   ()=> show('codes'));
    tAds?.addEventListener('click',     ()=> show('ads'));

    return view;
  }

  // ===== State + DB paths =====
  const REF_SCHEDULE = 'control/schedule';
  const REF_SCREEN   = 'control/screen';
  const REF_TABLES   = 'control/tables';

  let scheduleCache = null;
  let ticker = null;

  function getEls(){
    return {
      body: $('#sch-body'),
      msg:  $('#sch-msg'),
      tz:   $('#sch-tz'),
      enabled: $('#sch-enabled'),
      now:  $('#sch-now'),
      btnSave:  $('#sch-save'),
      btnApply: $('#sch-apply'),
      auto:     $('#sch-auto'),
    };
  }
  const showMsg = (el, t)=>{ if(!el) return; el.textContent=t||''; el.classList.toggle('hidden', !t); };

  function renderDayRow(idx, cfg){
    const tr = document.createElement('tr');
    tr.className = 'border-b last:border-0';
    const label = DOW_VI[idx];
    tr.innerHTML = `
      <td class="px-2 py-2">${label}</td>
      <td class="px-2 py-2"><input type="time" class="sch-on px-2 py-1 border rounded" value="${cfg?.on||'08:00'}"></td>
      <td class="px-2 py-2"><input type="time" class="sch-off px-2 py-1 border rounded" value="${cfg?.off||'22:00'}"></td>
      <td class="px-2 py-2">
        <label class="inline-flex items-center gap-2 text-xs">
          <input type="checkbox" class="sch-use w-4 h-4" ${cfg?.enabled!==false ? 'checked':''}>
          <span>Dùng lịch ngày này</span>
        </label>
      </td>
    `;
    tr.dataset.idx = String(idx);
    return tr;
  }

  function readUI(els){
    const tz = els.tz.value || 'Asia/Ho_Chi_Minh';
    const enabled = !!els.enabled.checked;
    const rows = $$('#sch-body tr');
    const days = {};
    rows.forEach(tr=>{
      const i = Number(tr.dataset.idx);
      const on  = $('.sch-on', tr).value;
      const off = $('.sch-off', tr).value;
      const use = $('.sch-use', tr).checked;
      days[i] = { on, off, enabled: use };
    });
    return { enabled, timezone: tz, days };
  }

  async function writeSchedule(s){
    await db.ref(REF_SCHEDULE).set(s);
  }
  async function setAllScreen(val){
    const updates = { [REF_SCREEN]: val };
    for (let i=1;i<=TABLE_COUNT;i++) updates[`${REF_TABLES}/${i}/screen`] = val;
    await db.ref().update(updates);
  }

  function startTicker(els){
    stopTicker();
    ticker = setInterval(async ()=>{
      try{
        if (!scheduleCache) return;
        els.now.textContent = new Date().toLocaleString('vi-VN',{ timeZone: scheduleCache.timezone||'Asia/Ho_Chi_Minh' });
        const desired = computeDesiredState(scheduleCache);
        await setAllScreen(desired);
      }catch(e){ /* nuốt lỗi để ticker không dừng */ }
    }, 30000);
  }
  function stopTicker(){ if (ticker){ clearInterval(ticker); ticker=null; } }

  document.addEventListener('DOMContentLoaded', async ()=>{
    const view = injectScheduleUI(); // tạo tab + view
    if (!view) return;
    try{
      await ensureDB();

      // build bảng ngày
      const els = getEls();
      els.body.innerHTML = '';
      for (let i=0;i<7;i++) els.body.appendChild(renderDayRow(i, {}));

      // load schedule
      const snap = await db.ref(REF_SCHEDULE).get();
      scheduleCache = snap.exists() ? snap.val() : { enabled:false, timezone:'Asia/Ho_Chi_Minh', days:{} };
      // fill UI
      els.enabled.checked = !!scheduleCache.enabled;
      els.tz.value = scheduleCache.timezone || 'Asia/Ho_Chi_Minh';
      Object.entries(scheduleCache.days||{}).forEach(([k,cfg])=>{
        const tr = $(`#sch-body tr[data-idx="${k}"]`);
        if (!tr) return;
        $('.sch-on', tr).value  = cfg?.on  || '08:00';
        $('.sch-off', tr).value = cfg?.off || '22:00';
        $('.sch-use', tr).checked = cfg?.enabled!==false;
      });
      els.now.textContent = new Date().toLocaleString('vi-VN',{ timeZone: scheduleCache.timezone||'Asia/Ho_Chi_Minh' });

      // events
      els.btnSave.addEventListener('click', async ()=>{
        try{
          const s = readUI(els);
          await writeSchedule(s);
          scheduleCache = s;
          showMsg(els.msg, 'Đã lưu cấu hình.');
        }catch(e){ showMsg(els.msg, 'Lưu lỗi: '+(e?.message||e)); }
        setTimeout(()=> showMsg(els.msg,''), 2000);
      });
      els.btnApply.addEventListener('click', async ()=>{
        try{
          const desired = computeDesiredState(readUI(els));
          await setAllScreen(desired);
          showMsg(els.msg, `Đã áp dụng: ${desired.toUpperCase()}`);
        }catch(e){ showMsg(els.msg, 'Áp dụng lỗi: '+(e?.message||e)); }
        setTimeout(()=> showMsg(els.msg,''), 2000);
      });
      els.auto.addEventListener('change', ()=>{
        if (els.auto.checked) startTicker(els);
        else stopTicker();
      });

    }catch(e){
      console.error('[schedule]', e);
      alert('Khởi chạy Hẹn giờ lỗi: '+(e?.message||e));
    }
  });
})();
