// assets/js/state.js
// Helpers: notch detection, UI helpers (showPOS, hidePOS, showStartKeepTable)
// Put notch detection here so redirect.html and pos iframe reuse it.

(function(){
  'use strict';

  // ----- Notch detection and apply -----
  // Detect safe-area-inset-top via CSS env() and apply .has-notch on body if needed.
  function detectNotchAndApply() {
    try {
      const params = new URLSearchParams(location.search);
      if (params.get('forceNotch') === '1') { document.body.classList.add('has-notch'); return; }
      if (params.get('forceNoNotch') === '1') { document.body.classList.remove('has-notch'); return; }

      const test = document.createElement('div');
      test.style.cssText = 'position:absolute; top:-9999px; padding-top: env(safe-area-inset-top, 0px);';
      document.documentElement.appendChild(test);

      const computed = window.getComputedStyle(test).paddingTop;
      document.documentElement.removeChild(test);

      const px = parseFloat(computed) || 0;
      if (px > 6) { // threshold (px) -> tune if needed
        document.body.classList.add('has-notch');
        console.debug('[state] notch detected: safe-area-inset-top =', px + 'px');
      } else {
        document.body.classList.remove('has-notch');
        console.debug('[state] no notch detected (safe-area-inset-top approx ' + px + 'px)');
      }
    } catch (e) {
      console.warn('[state] notch detection error', e);
    }
  }

  // Run early
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', detectNotchAndApply);
  } else {
    detectNotchAndApply();
  }

  // ----- UI helpers used by redirect.js / secret-btn / blackout -----
  window.showPOS = function(url){
    try {
      const posContainer = document.getElementById('pos-container');
      const posFrame = document.getElementById('pos-frame');
      if (!posContainer || !posFrame) return;
      posFrame.src = url;
      posContainer.classList.add('is-shown');
      posContainer.style.display = 'block';
      posContainer.setAttribute('aria-hidden','false');

      // hide start/select screens
      const startView = document.getElementById('start-screen');
      if (startView) { startView.classList.remove('is-shown'); startView.style.display = 'none'; startView.setAttribute('aria-hidden','true'); }
      const selectView = document.getElementById('select-table');
      if (selectView) selectView.style.display = 'none';
    } catch (e) { console.warn('[state] showPOS error', e); }
  };

  window.hidePOS = function(){
    try {
      const posContainer = document.getElementById('pos-container');
      const posFrame = document.getElementById('pos-frame');
      if (posFrame) posFrame.src = 'about:blank';
      if (posContainer) { posContainer.classList.remove('is-shown'); posContainer.style.display = 'none'; posContainer.setAttribute('aria-hidden','true'); }
      // show select by default
      const selectView = document.getElementById('select-table');
      if (selectView) selectView.style.display = 'flex';
      const startView = document.getElementById('start-screen');
      if (startView) { startView.classList.remove('is-shown'); startView.style.display = 'none'; startView.setAttribute('aria-hidden','true'); }
      localStorage.setItem('appState','select');
      localStorage.removeItem('tableId');
      localStorage.removeItem('tableUrl');
      delete window.tableId;
    } catch (e) { console.warn('[state] hidePOS error', e); }
  };

  window.showStartKeepTable = function(){
    try {
      const startView = document.getElementById('start-screen');
      const posContainer = document.getElementById('pos-container');
      if (startView) { startView.classList.add('is-shown'); startView.style.display = 'flex'; startView.setAttribute('aria-hidden','false'); }
      if (posContainer) { posContainer.classList.remove('is-shown'); posContainer.style.display = 'none'; posContainer.setAttribute('aria-hidden','true'); }
      const selectView = document.getElementById('select-table');
      if (selectView) selectView.style.display = 'none';
    } catch (e) { console.warn('[state] showStartKeepTable error', e); }
  };

  // ---- small utility to restore UI state on load ----
  window.tngon_restore_state = function() {
    try {
      const tableId = localStorage.getItem('tableId');
      const tableUrl = localStorage.getItem('tableUrl');
      const appState = localStorage.getItem('appState');
      if (tableId && tableUrl) {
        window.tableId = tableId;
        if (appState === 'pos') {
          window.showPOS(tableUrl);
        } else {
          window.showStartKeepTable();
          const sel = document.getElementById('selected-table');
          if (sel) sel.textContent = tableId;
          const startBtn = document.getElementById('start-order');
          if (startBtn) startBtn.setAttribute('data-url', tableUrl);
        }
      } else {
        // show select by default
        const selectView = document.getElementById('select-table');
        if (selectView) selectView.style.display = 'flex';
      }
    } catch (e) {
      console.warn('[state] restore_state error', e);
    }
  };

  // auto-restore after DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.tngon_restore_state());
  } else {
    window.tngon_restore_state();
  }

})();
