// assets/js/pos-link-fix.js (FORCE IFRAME LOCK)
// Mục tiêu:
// - Chặn click START sớm nhất (window capture)
// - Resolve URL ưu tiên LIVE
// - Gọi gotoPos(url)
// - Sau đó "khóa" iframe 0.6s để không bị script khác overwrite

(function(){
  'use strict';
  const log  = (...a)=>console.log('[pos-link-fix]', ...a);
  const warn = (...a)=>console.warn('[pos-link-fix]', ...a);

  function lsDel(k){ try{ localStorage.removeItem(k); }catch{} }
  function lsGet(k){ try{ return localStorage.getItem(k); }catch{ return null; } }
  function lsSet(k,v){ try{ localStorage.setItem(k, v); }catch{} }

  function clearPosCache(){
    ['posUrl','posLink','lastPosUrl','lastPosHref'].forEach(lsDel);
  }

  function resolveBestUrl(){
    const tid = lsGet('tableId');
    if (!tid) return { tid:null, live:null, ls:null, final:null };

    const liveUrl = (typeof window.getLinkForTable === 'function')
      ? (window.getLinkForTable(tid) || null)
      : null;

    const lsUrl = lsGet('tableUrl') || null;
    const finalUrl = liveUrl || lsUrl || null;
    return { tid, live: liveUrl, ls: lsUrl, final: finalUrl };
  }

  function lockIframeTo(url){
    const iframe = document.getElementById('pos-frame');
    if (!iframe || !url) return;

    // ép nhiều nhịp (0ms, 50ms, 120ms, 250ms, 400ms, 600ms)
    const times = [0, 50, 120, 250, 400, 600];
    times.forEach((t)=> setTimeout(()=>{
      try{
        const cur = (iframe.getAttribute('src') || '').trim();
        if (cur !== url){
          iframe.setAttribute('src', url);
          // log nhẹ thôi, khỏi spam
          // log('lock iframe ->', t, 'ms');
        }
      }catch(_){}
    }, t));
  }

  function handleStartClick(ev){
    const btn = ev.target && ev.target.closest ? ev.target.closest('#start-order') : null;
    if (!btn) return;

    // chặn sớm nhất
    ev.preventDefault?.();
    ev.stopPropagation?.();
    ev.stopImmediatePropagation?.();

    try{
      clearPosCache();

      const { tid, live, ls, final } = resolveBestUrl();
      log('resolve', { tid, liveTail: live ? live.slice(-8) : null, lsTail: ls ? ls.slice(-8) : null });

      if (!final){
        warn('no url resolved');
        alert('Chưa có link POS của bàn này.');
        return false;
      }

      // cập nhật tableUrl chuẩn (để redirect-core dùng cũng đúng)
      lsSet('tableUrl', final);

      if (typeof window.gotoPos === 'function'){
        log('start -> gotoPos(url) via redirect-core', { url: final });
        window.gotoPos(final);

        // ✅ khóa iframe chống overwrite
        lockIframeTo(final);
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
    window.addEventListener('click', handleStartClick, true); // window capture
    wrapGotoStart();
    log('patch ready (force iframe lock)');
  }

  if (document.readyState==='loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
