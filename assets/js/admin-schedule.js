// assets/js/admin-schedule.js
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

      // Hook chuyển tab (nối với router có sẵn):
      const tDevices = document.getElementById('tabDevices');
      const tCodes   = document.getElementById('tabCodes');
      const tAds     = document.getElementById('tabAds');
      const vDevices = document.getElementById('viewDevices');
      const vCodes   = document.getElementById('viewCodes');
      const vAds     = document.getElementById('viewAds');

      const activate = (btn)=>{
        [tDevices,tCodes,tAds,btnTab].forEach(b=>{
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

      btnTab.addEventListener('click', ()=>{ activate(btnTab); show('schedule'); });
    }

    return {
      tableBody: document.getElementById('schBody'),
      msgBox:    document.getElementById('schMsg'),
      btnSave:   document.getElementById('schSave'),
      btnApply:  document.getElementById('schApplyNow'),
      autoChk:   document.getElementById('schAuto'),
    };
  }

  function showMsg(box, text){
    if (!box) return;
    if (!text){ box.classList.add('hidden'); box.textContent=''; return; }
    box.textContent = text; box.classList.remove('hidden');
  }

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
      `;
      tbody.appendChild(tr);
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
    }
    return data;
  }

  // ===== Apply logic =====
  async function setAll(db, val){ // 'on' | 'off'
    await db.ref(REF_SCREEN).set(val);
    const updates = {};
    for (let i=1;i<=TABLE_COUNT;i++){
      updates[`${REF_TABLES}/${i}/screen`] = val;
    }
    await db.ref().update(updates);
  }

  function timeToMinutes(hhmm){
    const [h,m] = (hhmm||'').split(':').map(x=>parseInt(x,10));
    if (!isFinite(h)||!isFinite(m)) return null;
    return h*60+m;
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
      }
    }, 30*1000); // 30s
  }
  function stopAuto(){
    if (autoTimer){ clearInterval(autoTimer); autoTimer=null; }
  }

  // ===== Boot =====
  document.addEventListener('DOMContentLoaded', async ()=>{
    try{
      const ui = ensureTabAndView();
      const db = await ensureDB();

      // Load schedule
      db.ref(SCHEDULE_PATH).on('value', snap=>{
        const data = snap.val() || {};
        renderRows(ui.tableBody, data);
      });

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

      // Auto apply toggle
      ui.autoChk?.addEventListener('change', async ()=>{
        const data = collectRows(ui.tableBody);
        if (ui.autoChk.checked) startAuto(db, data, ui.msgBox);
        else stopAuto();
      });

      // Nếu muốn mặc định bật auto khi mở trang (tùy chọn):
      // ui.autoChk.checked = true;
      // const dataInit = collectRows(ui.tableBody);
      // startAuto(db, dataInit, ui.msgBox);

    }catch(e){
      console.error('[schedule] boot error:', e);
      alert('Lỗi khởi chạy tab Hẹn giờ: '+(e?.message||e));
    }
  });
})();
