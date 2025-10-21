(function(){
  'use strict';

  // ---------- Guard DOM ----------
  const view = document.getElementById('viewDevices');
  if (!view) {
    console.warn('[devices-tab] Không tìm thấy #viewDevices, bỏ qua file này.');
    return;
  }

  // ---------- Tiny helpers ----------
  const $ = (sel, root=document) => root.querySelector(sel);
  const css = (el, obj)=>{ if(!el) return; for (const k in obj) el.style[k] = obj[k]; };

  // ---------- Ensure Firebase ready (không re-init) ----------
  async function ensureAuth(){
    if (!window.firebase || !firebase.apps?.length) {
      throw new Error('Firebase chưa khởi tạo trước admin-devices-tab.js');
    }
    if (!firebase.auth().currentUser) {
      await firebase.auth().signInAnonymously();
      await new Promise(res=>{
        const un = firebase.auth().onAuthStateChanged(u=>{ if (u) { un(); res(); }});
      });
    }
    return firebase.database();
  }

  // ---------- Build toolbar (safe-in) ----------
  function ensureToolbar(){
    // nếu đã có, dùng luôn
    let bar = $('#devices-toolbar', view);
    if (bar) return bar;

    // nếu có hàng nút cũ, đặt toolbar ngay TRONG view để tránh lỗi insertBefore
    bar = document.createElement('div');
    bar.id = 'devices-toolbar';
    bar.className = 'flex flex-wrap items-center gap-2 mb-4';

    // nút Reload toàn bộ
    const btnReloadAll = document.createElement('button');
    btnReloadAll.id = 'btnReloadAll_top';
    btnReloadAll.className = 'px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700';
    btnReloadAll.textContent = 'Reload toàn bộ';

    // nút Toggle toàn bộ (1 nút đổi màu)
    const btnToggleAll = document.createElement('button');
    btnToggleAll.id = 'btnToggleAll';
    btnToggleAll.className = 'px-3 py-2 rounded bg-gray-800 text-white hover:bg-black';
    btnToggleAll.textContent = 'Tắt toàn bộ'; // text sẽ được sync lại theo trạng thái thực

    const hint = document.createElement('span');
    hint.className = 'text-xs text-gray-500';
    hint.textContent = '• Dùng khi muốn thao tác nhanh toàn bộ iPad';

    bar.appendChild(btnReloadAll);
    bar.appendChild(btnToggleAll);
    bar.appendChild(hint);

    // Đặt toolbar ở ngay đầu section viewDevices, không chèn vào trước phần tử “ngoài parent”
    view.insertAdjacentElement('afterbegin', bar);
    return bar;
  }

  // ---------- Wire buttons ----------
  async function wire(db){
    const refScreen = db.ref('control/screen');

    const bar = ensureToolbar();
    const btnReloadAll = $('#btnReloadAll_top', bar);
    const btnToggleAll = $('#btnToggleAll', bar);

    // Đồng bộ trạng thái nút Toggle theo DB
    function paintToggle(isOn){
      if (isOn) {
        // Đang bật -> nút cho phép "Tắt"
        btnToggleAll.textContent = 'Tắt toàn bộ';
        btnToggleAll.className = 'px-3 py-2 rounded bg-gray-800 text-white hover:bg-black';
      } else {
        // Đang tắt -> nút cho phép "Bật"
        btnToggleAll.textContent = 'Bật toàn bộ';
        btnToggleAll.className = 'px-3 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-700';
      }
    }

    refScreen.on('value', (snap)=>{
      const v = snap.exists() ? String(snap.val()).toLowerCase() : 'on';
      paintToggle(v === 'on');
    });

    // Reload toàn bộ
    btnReloadAll.addEventListener('click', async ()=>{
      try {
        await db.ref('broadcast/reloadAt').set(firebase.database.ServerValue.TIMESTAMP);
      } catch (e) {
        alert('Gửi reload toàn bộ lỗi: ' + (e?.message || e));
      }
    });

    // Toggle toàn bộ (1 nút)
    btnToggleAll.addEventListener('click', async ()=>{
      // đọc trạng thái hiện tại để quyết định viết ngược lại
      const snap = await refScreen.get();
      const currentlyOn = (snap.exists() ? String(snap.val()).toLowerCase() : 'on') === 'on';
      try {
        if (currentlyOn) {
          // TẮT toàn bộ
          await refScreen.set('off');
          // (không cần đụng per-table khi tắt)
        } else {
          // BẬT toàn bộ + clear tắt lẻ
          await refScreen.set('on');
          const updates = {};
          for (let i=1; i<=15; i++) updates[`control/tables/${i}/screen`] = 'on';
          await db.ref().update(updates);
        }
      } catch (e) {
        alert('Ghi trạng thái toàn bộ lỗi: ' + (e?.message || e));
      }
    });
  }

  // ---------- Fix modal z-index (để popup chọn bàn không bị ẩn) ----------
  (function injectZIndexPatch(){
    const style = document.createElement('style');
    style.textContent = `
      /* Modal table-picker / popup nào dùng lớp tp-modal thì đẩy rất cao */
      .tp-modal, #tp-modal, .tngon-modal {
        z-index: 9000 !important;
      }
    `;
    document.head.appendChild(style);
  })();

  // ---------- Boot ----------
  document.addEventListener('DOMContentLoaded', async ()=>{
    try {
      const db = await ensureAuth();
      await wire(db);
      console.log('[devices-tab] Ready.');
    } catch (e) {
      console.error(e);
      alert("Lỗi khởi chạy tab Thiết bị: " + (e?.message || e));
    }
  });
})();
