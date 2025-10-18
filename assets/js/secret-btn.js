// assets/js/secret-btn.js
// Secret left button only:
// - 5 taps within 3000ms -> go to START screen
// - long press 7000ms -> show password popup; correct "6868" -> go to SELECT screen
// Updated: ensure overlays/popup/disabled states are cleared so START button is clickable.
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

  // Apply visible-but-invisible style (bigger touch area) if not already
  try {
    btn.style.position = 'fixed';
    btn.style.left = btn.style.left || '8px';
    btn.style.bottom = btn.style.bottom || '8px';
    btn.style.width = '96px';
    btn.style.height = '96px';
    btn.style.background = 'transparent';
    btn.style.opacity = '0';
    btn.style.zIndex = '2200';
    btn.style.border = '0';
    btn.style.pointerEvents = 'auto';
    btn.style.borderRadius = '12px';
    btn.setAttribute('aria-hidden', 'true');
  } catch(e){ /* ignore */ }

  // UI element refs (may be null; handle gracefully)
  const startScreen = document.getElementById('start-screen');
  const selectScreen = document.getElementById('select-table');
  const posContainer = document.getElementById('pos-container');
  const posFrame = document.getElementById('pos-frame');
  const popup = document.getElementById('password-popup');
  const input = document.getElementById('password-input');
  const okBtn = document.getElementById('password-ok');
  const cancelBtn = document.getElementById('password-cancel');
  const errorEl = document.getElementById('password-error');
  const overlay = document.getElementById('screen-overlay');

  // Utilities
  function setVisible(el, visible, displayStyle = 'block') {
    if (!el) return;
    // Remove Tailwind's hidden class if present
    el.classList.toggle('hidden', !visible);
    el.style.display = visible ? displayStyle : 'none';
  }
  function enablePointerEvents(el, enable = true) {
    if (!el) return;
    el.style.pointerEvents = enable ? '' : 'none';
  }

  // Ensure start button is active/clickable
  function ensureStartClickable() {
    const startBtn = document.getElementById('start-order');
    if (!startBtn) return;
    startBtn.disabled = false;
    enablePointerEvents(startBtn, true);
    // remove any overlay that might be positioned above
    // also clear potential full-screen transparent divs (defensive)
    const blockers = document.querySelectorAll('.blocking-overlay-temp');
    blockers.forEach(b => {
      try { b.remove(); } catch(e){}
    });
  }

  // Show start screen properly and clear interfering UI
  function showStartScreen() {
    try {
      // hide pos
      if (posContainer) posContainer.style.display = 'none';
      if (posFrame) {
        try { posFrame.src = 'about:blank'; } catch(e){}
      }

      // hide overlay and popup
      if (overlay) overlay.style.display = 'none';
      if (popup) popup.classList.add('hidden');

      // show start, hide select
      setVisible(startScreen, true, 'flex');
      setVisible(selectScreen, false, 'block');

      // set state
      try { localStorage.setItem('appState', 'start'); } catch(e){}

      // ensure start button clickable
      ensureStartClickable();

      console.debug('[secret-btn] goToStart (cleared overlays/popup)');
    } catch (e) {
      console.error('[secret-btn] showStartScreen error', e);
    }
  }

  function goToSelectScreenAfterAuth() {
    try {
      // clear table info
      try {
        localStorage.removeItem('tableId');
        localStorage.removeItem('tableUrl');
        localStorage.setItem('appState', 'select');
      } catch(e){}

      // hide popup
      if (popup) popup.classList.add('hidden');
      if (errorEl) errorEl.classList.add('hidden');

      // show select screen and hide others
      setVisible(startScreen, false, 'flex');
      setVisible(selectScreen, true, 'block');
      if (posContainer) posContainer.style.display = 'none';
      if (posFrame) posFrame.src = 'about:blank';

      // ensure no overlay remains
      if (overlay) overlay.style.display = 'none';

      ensureStartClickable();

      console.debug('[secret-btn] goToSelect (after auth)');
    } catch (e) { console.error(e); }
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
        if (errorEl) errorEl.classList.add('hidden');
        if (input) {
          input.value = '';
          setTimeout(() => { try { input.focus(); } catch(e){} }, 120);
        }
      }
    }, LONGPRESS_MS);
  }
  function clearLongPressTimer() {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
  }

  // Pointer handlers
  const supportsPointer = window.PointerEvent !== undefined;

  function onPointerStart(e) {
    // stop propagation so the underlying UI doesn't get a confusing sequence
    try { e.stopPropagation(); } catch(e){}
    startLongPressTimer();
    if (e.cancelable) e.preventDefault();
  }
  function onPointerEnd(e) {
    try { e.stopPropagation(); } catch(e){}
    clearLongPressTimer();
    if (!longPressTriggered) registerTap();
    if (e.cancelable) e.preventDefault();
  }

  if (supportsPointer) {
    btn.addEventListener('pointerdown', onPointerStart, { passive: false });
    btn.addEventListener('pointerup', onPointerEnd, { passive: false });
    btn.addEventListener('pointercancel', () => { clearLongPressTimer(); }, { passive: false });
    btn.addEventListener('pointerleave', () => { clearLongPressTimer(); }, { passive: false });
  } else {
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

  // Defensive: hide popup when clicking outside
  document.addEventListener('click', function(ev){
    if (!popup || popup.classList.contains('hidden')) return;
    const content = popup.querySelector('div');
    if (content && !content.contains(ev.target)) {
      popup.classList.add('hidden');
    }
  }, { passive: true });

})();