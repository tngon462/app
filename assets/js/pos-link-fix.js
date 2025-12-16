// assets/js/pos-link-fix.js (CORE-ONLY START)
// Mục tiêu: START luôn dùng link mà redirect-core đang giữ (ưu tiên LIVE).
(function(){
  'use strict';
  const log  = (...a)=>console.log('[pos-link-fix]', ...a);
  const warn = (...a)=>console.warn('[pos-link-fix]', ...a);

  function lsDel(k){ try{ localStorage.removeItem(k); }catch{} }

  function clearPosCache(){
    ['posUrl','posLink','lastPosUrl','lastPosHref'].forEach(lsDel);
  }

  function hookStartButton(){
    const btn = document.getElementById('start-order');
    if (!btn) return;

    btn.addEventListener('click', (ev)=>{
      ev.stopImmediatePropagation?.();
      ev.preventDefault?.();

      try{
        clearPosCache();

        // QUAN TRỌNG: không resolve url ở đây nữa.
        // Để redirect-core tự lấy link mới nhất (LIVE) từ LINKS_MAP / tableUrl.
        if (typeof window.gotoPos === 'function'){
          log('start -> gotoPos() via redirect-core');
          window.gotoPos();        // gọi không truyền url
          return false;
        }

        warn('gotoPos() not found');
        alert('Thiếu redirect-core (gotoPos).');
      }catch(e){
        warn('start failed:', e?.message||e);
        alert('Không vào được POS. Thử reload lại app.');
      }
      return false;
    }, true);
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
    hookStartButton();
    wrapGotoStart();
    log('patch ready (core-only start)');
  }

  if (document.readyState==='loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
