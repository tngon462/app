// /assets/js/bind-probe.js
(function () {
  'use strict';

  const log = (...a) => console.log('[probe]', ...a);
  const warn = (...a) => console.warn('[probe]', ...a);

  // ====== localStorage helpers ======
  function uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
  function lsGet(k, d = null) {
    try {
      return localStorage.getItem(k) ?? d;
    } catch {
      return d;
    }
  }
  function lsSet(k, v) {
    try {
      localStorage.setItem(k, v);
    } catch {}
  }

  // ====== Firebase init ======
  async function ensureAuth() {
    if (!window.firebase) throw new Error('Firebase chưa load');
    if (!firebase.apps?.length) throw new Error('Firebase App chưa init');
    if (!firebase.auth().currentUser) {
      await firebase.auth().signInAnonymously();
      await new Promise(res => {
        const un = firebase.auth().onAuthStateChanged(u => {
          if (u) {
            un();
            res();
          }
        });
      });
    }
    return firebase.database();
  }

  // ====== Gửi heartbeat lên Firebase ======
  async function heartbeat(db, deviceId) {
    const pay = {
      code: lsGet('deviceCode') || null,
      table: lsGet('tableId') || null,
      stage: lsGet('appState') || 'select',
      inPOS: lsGet('appState') === 'pos',
      lastSeen: firebase.database.ServerValue.TIMESTAMP,
    };
    try {
      await db.ref('devices/' + deviceId).update(pay);
      log('wrote devices/' + deviceId, pay);
    } catch (e) {
      warn('heartbeat error:', e.message || e);
    }
  }

  // ====== Boot main ======
  async function boot() {
    const db = await ensureAuth();

    // deviceId ổn định, nếu chưa có thì tạo
    let deviceId = lsGet('deviceId');
    if (!deviceId) {
      deviceId = uuidv4();
      lsSet('deviceId', deviceId);
    }

    window.__TNGON__ = window.__TNGON__ || {};
    window.__TNGON__.deviceId = deviceId;

    log('deviceId =', deviceId, 'dbURL =', firebase.apps[0]?.options?.databaseURL);

    // Gửi tick ngay khi khởi động
    const tick = () => heartbeat(db, deviceId);
    tick();

    // Định kỳ 20 giây gửi 1 lần
    setInterval(tick, 20000);

    // Khi quay lại tab hoặc localStorage thay đổi thì tick lại
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) tick();
    });
    window.addEventListener('storage', e => {
      if (['appState', 'tableId', 'deviceCode'].includes(e.key || '')) tick();
    });
  }

  // ====== Auto start ======
  document.addEventListener('DOMContentLoaded', () => {
    boot().catch(warn);
  });
})();
