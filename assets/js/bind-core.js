// bind-core.js
// Helper core: deviceId, links.json, LS helper, proxy goto*

(function () {
  window.TNGON = window.TNGON || {};
  const cfg = TNGON.bindCfg;

  // LS wrapper
  const ls = {
    get: (k) => window.localStorage.getItem(k),
    set: (k, v) => window.localStorage.setItem(k, v),
    del: (k) => window.localStorage.removeItem(k),
  };

  // uuid
  function uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0, v = (c === 'x') ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  function ensureDeviceId() {
    const key = cfg.lsKeys.deviceId;
    let id = ls.get(key);
    if (!id) { id = uuidv4(); ls.set(key, id); }
    return id;
  }

  // links.json
  let linksMap = null;
  async function loadLinks() {
    try {
      const url = './links.json' + (/\?/.test('./links.json') ? '&' : '?') + 'cb=' + Date.now();
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      linksMap = data.links || data;
      if (!linksMap || typeof linksMap !== 'object') throw new Error('links.json invalid');
    } catch (e) {
      console.warn('[bind-core] Không tải được links.json:', e?.message || e);
      linksMap = null;
    }
    return linksMap;
  }
  function getLinksMap() { return linksMap; }

  // proxy goto* (giữ nguyên redirect-core.js)
  const gotoSelect = window.gotoSelect || function () { location.reload(); };
  const gotoStart  = window.gotoStart  || function () {};
  const gotoPos    = window.gotoPos    || function () {};

  window.TNGON.ls = ls;
  window.TNGON.ensureDeviceId = ensureDeviceId;
  window.TNGON.loadLinks = loadLinks;
  window.TNGON.getLinksMap = getLinksMap;
  window.TNGON.gotoSelect = gotoSelect;
  window.TNGON.gotoStart = gotoStart;
  window.TNGON.gotoPos = gotoPos;
})();
