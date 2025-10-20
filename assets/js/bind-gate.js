// bind-gate.js
// Màn gate nhập mã — không có nút Cancel

(function () {
  window.TNGON = window.TNGON || {};

  function show(message) {
    if (document.getElementById('code-gate')) {
      const e = document.getElementById('code-error');
      if (e && message) e.textContent = message;
      return;
    }
    const wrap = document.createElement('div');
    wrap.id = 'code-gate';
    wrap.style.cssText = 'position:fixed;inset:0;z-index:6000;background:#fff;';
    wrap.innerHTML = `
      <div class="w-full h-full flex items-center justify-center p-6">
        <div class="w-full max-w-sm bg-white border border-gray-200 rounded-2xl shadow p-6">
          <h1 class="text-2xl font-extrabold text-gray-900 mb-4 text-center">Nhập mã iPad</h1>
          <p class="text-sm text-gray-500 mb-4 text-center">Nhập mã được cấp để tiếp tục.</p>
          <input id="code-input" type="text" maxlength="20" placeholder="VD: A1B2C3"
                 class="w-full border rounded-lg px-4 py-3 text-center tracking-widest font-mono text-lg"
                 autocomplete="one-time-code" />
          <div id="code-error" class="text-red-600 text-sm mt-2 h-5 text-center"></div>
          <button id="code-submit"
            class="mt-4 w-full rounded-xl bg-blue-600 text-white font-bold py-3 hover:bg-blue-700 transition">
            XÁC NHẬN
          </button>
        </div>
      </div>`;
    document.body.appendChild(wrap);

    const btn = document.getElementById('code-submit');
    const input = document.getElementById('code-input');
    const err = document.getElementById('code-error');
    if (message) err.textContent = message;

    function setBusy(b) {
      btn.disabled = b;
      btn.textContent = b ? 'Đang kiểm tra…' : 'XÁC NHẬN';
    }

    async function submit() {
      const code = (input.value || '').trim().toUpperCase();
      err.textContent = '';
      if (!code) { err.textContent = 'Vui lòng nhập mã.'; return; }
      setBusy(true);
      try {
        await window.TNGON.claimCode(code);
        hide();
        // tiếp tục vào app
        window.TNGON.afterBindEnter && window.TNGON.afterBindEnter();
      } catch (e) {
        err.textContent = e?.message || 'Mã không hợp lệ.';
      } finally {
        setBusy(false);
      }
    }

    btn.addEventListener('click', submit);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    setTimeout(() => input?.focus(), 80);
  }

  function hide() {
    const el = document.getElementById('code-gate');
    if (el) el.remove();
  }

  TNGON.showCodeGate = show;
  TNGON.hideCodeGate = hide;
})();
