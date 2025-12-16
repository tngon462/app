// /assets/js/links-live-listener.js (FIXED)
// - Không set iframe.src trực tiếp
// - Không tự ý set posLink global để điều hướng
// - Chỉ cập nhật LIVE cache qua redirect-core: setPosLink(url, source, tableId)
// - Nếu đang ở POS thì gọi gotoPos(newLink) để reload đúng link mới (đi qua allowlist)

(function () {
  'use strict';

  const log  = (...a)=>console.log('[links-live]', ...a);
  const warn = (...a)=>console.warn('[links-live]', ...a);

  if (!window.firebase || !firebase.apps?.length) {
    warn('Firebase chưa init -> bỏ qua links-live listener.');
    return;
  }

  const db = firebase.database();

  function getLS(k,d=null){ try{ const v=localStorage.getItem(k); return v ?? d; }catch(_){ return d; } }

  const ACCEPT_URL = /^https?:\/\/order\.atpos\.net\//i;

  function currentTable() {
    // ưu tiên core (nếu có)
    try {
      if (typeof window.getCurrentTable === 'function') {
        const t = window.getCurrentTable();
        if (t) return String(t);
      }
    } catch(_) {}
    return String(getLS('tableId','') || '');
  }

  function currentStage() {
    return String(getLS('appState','') || '');
  }

  function applyLive(tableId, newLink) {
    if (!tableId || !newLink) return;
    if (!ACCEPT_URL.test(newLink)) return;

    // 1) update LIVE cache qua core
    if (typeof window.setPosLink === 'function') {
      window.setPosLink(newLink, 'links-live', tableId);
    } else {
      // fallback (không khuyến khích): vẫn lưu nhưng sẽ mất allowlist
      try { localStorage.setItem('posLiveUrl:' + tableId, newLink); } catch(_) {}
      try { localStorage.setItem('posLiveAt:'  + tableId, String(Date.now())); } catch(_) {}
    }

    log('🔄 LIVE QR bàn', tableId, newLink);

    // 2) nếu đang ở POS -> reload theo core (để about:blank rồi vào link)
    if (currentStage() === 'pos' && typeof window.gotoPos === 'function') {
      window.gotoPos(newLink, { by:'links-live', table: tableId });
    }
  }

  // ========== LISTEN ==========
  // Giữ đúng path như sếp đang dùng: db.ref('links_live').on('value')
  const ref = db.ref('links_live');

  ref.on('value', (snap) => {
    const data = snap.val();
    if (!data || !data.links) return;

    const tableId = currentTable();
    if (!tableId) { log('chưa có tableId -> chờ'); return; }

    const newLink = data.links[String(tableId)];
    if (!newLink) return;

    applyLive(String(tableId), String(newLink));
  });

})();
