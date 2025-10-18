// assets/js/secret-btn.js
// Secret left button only:
// - 5 taps within 3000ms -> go to START screen
// - long press 7000ms -> show password popup; correct "6868" -> go to SELECT screen
(function () {
  'use strict';

  const TAPS_REQUIRED = 5;
  const TAPS_WINDOW_MS = 3000;
  const LONGPRESS_MS = 7000;
  const PASSWORD = '6868';

  // remove right button if exists (safety)
  try { const bsel = document.getElementById('back-btn-select'); if (bsel) bsel.remove(); } catch(e){}

  const btn = document.getElementById('back-btn-start');
  if (!btn) {
    console.warn('[secret-btn] #back-btn-start not found');
    return;
  }

  // Style adjustments to ensure it's bigger and clickable but invisible
  try {
    btn.style.position = 'fixed';
    btn.style.left = btn.style.left || '8px';
    btn.style.bottom = btn.style.bottom || '8px';
    btn.style.width = '96px';   // gấp ~2 lần 48px
    btn.style.height = '96px';
    btn.style.background = 'transparent';
    btn.style.opacity = '0';
    btn.style.zIndex = '2200';
    btn.style.border = '0';
    btn.style.pointerEvents = 'auto';
    btn.style.borderRadius = '12px';
    btn.setAttribute('aria-hidden', 'true');
  } catch(e){ /* ignore styling errors */ }

  // UI element refs
  const startScreen = document.getElementById('start-screen');
  const selectScreen = document.getElementById('select-table');
  const posContainer = document.getElementById('pos-container');
  const posFrame = document.getElementById('pos-frame');
  const popup = document.getElementById('password-popup');
  const input = document.getElementById('password-input');
  const okBtn = document.getElementById('password-ok');
  const cancelBtn = document.getElementById('password-cancel');
  const errorEl = document.getElementById('password-error');

  // Helpers: show/hide UI
  function showStartScreen() {
    try {
      if (posContainer) posContainer.style.display = 'none';
      if (posFrame) posFrame.src = 'about:blank';
      if (startScreen) startScreen.style.display = 'flex';
      if (selectScreen) selectScreen.style.display = 'none';
      localStorage.setItem('appState', 'start');
      console.debug('[secret-btn] goToStart');
    } catch(e){ console.error(e); }
  }
  function goToSelectScreenAfterAuth() {
    try {
      // clear table info
      localStorage.removeItem('tableId');
      localStorage.removeItem('tableUrl');
      localStorage.setItem('appState', 'select');
      if (startScreen) startScreen.style.display = 'none';
      if (selectScreen) selectScreen.style.display = 'flex';
      if (posContainer) posContainer.style.display = 'none';
      if (posFrame) posFrame.src = 'about:blank';
      if (popup) popup.classList.add('hidden');
      if (errorEl) errorEl.classList.add('hidden');
      console.debug('[secret-btn] goToSelect (after auth)');
    } catch(e){ console.error(e); }
  }

  // Tap counting logic
  let taps = 0;
  let firstTapTs = 0;
  let tapTimeout = null;

  function resetTapWindow() {
    taps = 0;
    firstTapTs = 0;
    if (tapTimeout) { clearTimeout(tapTimeout); tapTimeout = null; }
  }

  function registerTap() {
    const now = Date.now();
    if (!firstTapTs || (now - firstTapTs) > TAPS_WINDOW_MS) {
      firstTapTs = now;
      taps = 0;
    }
    taps++;
    if (tapTimeout) clearTimeout(tapTimeout);
    tapTimeout = setTimeout(() => resetTapWindow(), TAPS_WINDOW_MS + 50);

    if (taps >= TAPS_REQUIRED) {
      resetTapWindow();
      showStartScreen();
    }
  }

  // Long press logic
  let longPressTimer = null;
  let longPressTriggered = false;

  function startLongPressTimer() {
    longPressTriggered = false;
    if (longPressTimer) clearTimeout(longPressTimer);
    longPressTimer = setTimeout(() => {
      longPressTriggered = true;
      // show password popup
      if (popup) {
        popup.classList.remove('hidden');
        // hide any previous error
        if (errorEl) errorEl.classList.add('hidden');
        if (input) {
          input.value = '';
          // focus to try to open keyboard (may be blocked on some webapps)
          setTimeout(() => { try { input.focus(); } catch(e){} }, 120);
        }
      }
    }, LONGPRESS_MS);
  }
  function clearLongPressTimer() {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
  }

  // Pointer handlers for robust support (mouse + touch)
  // Use pointer events if available
  const supportsPointer = window.PointerEvent !== undefined;

  function onPointerStart(e) {
    e.stopPropagation();
    // on user interaction -> start longpress
    startLongPressTimer();
    // prevent default to avoid selection/pinch or double-tap zoom on some browsers
    if (e.cancelable) e.preventDefault();
  }
  function onPointerEnd(e) {
    e.stopPropagation();
    clearLongPressTimer();
    if (!longPressTriggered) {
      // treat as tap
      registerTap();
    }
    // prevent default
    if (e.cancelable) e.preventDefault();
  }

  if (supportsPointer) {
    btn.addEventListener('pointerdown', onPointerStart, { passive: false });
    btn.addEventListener('pointerup', onPointerEnd, { passive: false });
    btn.addEventListener('pointercancel', () => { clearLongPressTimer(); }, { passive: false });
    // also handle pointerleave (finger moved out)
    btn.addEventListener('pointerleave', () => { clearLongPressTimer(); }, { passive: false });
  } else {
    // fallback to touch + mouse
    btn.addEventListener('touchstart', function(e){ onPointerStart(e); }, { passive: false });
    btn.addEventListener('touchend', function(e){ onPointerEnd(e); }, { passive: false });
    btn.addEventListener('touchcancel', function(){ clearLongPressTimer(); }, { passive: false });
    btn.addEventListener('mousedown', function(e){ onPointerStart(e); }, { passive: false });
    btn.addEventListener('mouseup', function(e){ onPointerEnd(e); }, { passive: false });
    btn.addEventListener('mouseleave', function(){ clearLongPressTimer(); }, { passive: false });
  }

  // Password popup interactions
  if (okBtn) {
    okBtn.addEventListener('click', function(){
      const v = input ? (input.value || '').trim() : '';
      if (v === PASSWORD) {
        goToSelectScreenAfterAuth();
      } else {
        if (errorEl) errorEl.classList.remove('hidden');
      }
    });
  }
  if (cancelBtn) {
    cancelBtn.addEventListener('click', function(){
      if (popup) popup.classList.add('hidden');
      if (errorEl) errorEl.classList.add('hidden');
      if (input) input.value = '';
    });
  }

  // allow Enter key on input (keyboard)
  if (input) {
    input.addEventListener('keydown', function(e){
      if (e.key === 'Enter') {
        e.preventDefault();
        const v = input.value.trim();
        if (v === PASSWORD) goToSelectScreenAfterAuth();
        else if (errorEl) errorEl.classList.remove('hidden');
      }
    });
  }

  // defensive: hide popup when clicking outside (but only when shown)
  document.addEventListener('click', function(ev){
    if (!popup || popup.classList.contains('hidden')) return;
    // if click outside popup content -> close
    const content = popup.querySelector('div');
    if (content && !content.contains(ev.target)) {
      popup.classList.add('hidden');
    }
  }, { passive: true });

})();