// assets/js/pos-link-fix.js (WINDOW-CAPTURE + LIVE URL QQQQQQQQ
// Mục tiêu:
// - Chặn click START sớm nhất (window capture) để không bị listener khác override
// - Luôn ưu tiên link LIVE (getLinkForTable) rồi mới fallback tableUrl
// - Gọi gotoPos(url) có truyền url để khỏi dính tableUrl cũ

(function(){
  'use strict';
  const log  = (...a)=>console.log('[pos-link-fix]', ...a);
  const warn = (...a)=>console.warn('[pos-link-fix]', ...a);

  function lsDel(k){ try{ localStorage.removeItem(k); }catch{} }
  function lsGet(k){ try{ return localStorage.getItem(k); }catch{ return null; } }
  function lsSet(k,v){ try{ localStorage.setItem(k, v); }catch{} }

  function clearPosCache(){
    // giữ nguyên logic cũ
    ['posUrl','posLink','lastPosUrl','lastPosHref'].forEach(lsDel);
  }

  function resolveBestUrl(){
    const tid = lsGet('tableId');
    if (!tid) return null;

    // ưu tiên LIVE
    const liveUrl = (typeof window.getLinkForTable === 'function')
      ? (window.getLinkForTable(tid) || null)
      : null;

    // fallback LS tableUrl
    const lsUrl = lsGet('tableUrl');

    return liveUrl || lsUrl || null;
  }

  function handleStartClick(ev){
    // target có thể là span/icon bên trong button -> dùng closest
    const btn = ev.target && ev.target.closest ? ev.target.closest('#start-order') : null;
    if (!btn) return;

    // CHẶN SỚM NHẤT: chặn toàn bộ listeners khác
    ev.preventDefault?.();
    ev.stopPropagation?.();
    ev.stopImmediatePropagation?.();

    try{
      clearPosCache();

      const url = resolveBestUrl();
      if (!url){
        warn('no url resolved (missing tableId / live / tableUrl)');
        alert('Chưa có link POS của bàn này.');
        return false;
      }

      // cập nhật tableUrl cho sạch (để redirect-core / các chỗ khác dùng cũng đúng)
      lsSet('tableUrl', url);

      if (typeof window.gotoPos === 'function'){
        log('start -> gotoPos(url) via redirect-core', { url: url.slice(0, 60) + '...' });
        window.gotoPos(url); // ✅ truyền url cho chắc
        return false;
      }

      warn('gotoPos() not found');
      alert('Thiếu redirect-core (gotoPos).');
    }catch(e){
      warn('start failed:', e?.message||e);
      alert('Không vào được POS. Thử reload lại app.');
    }
    return false;
  }

  function wrapGotoStart(){
    if (typeof window.gotoStart !== 'function') return;
    const orig = window.gotoStart;
    window.gotoStart = function(){
      clearPosCache();
      return orig.apply(this, arguments);
    };
  }

  function boot(){
    // ✅ Gắn ở window capture để chạy trước mọi thứ
    window.addEventListener('click', handleStartClick, true);

    wrapGotoStart();
    log('patch ready (window-capture + live url)');
  }

  if (document.readyState==='loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
