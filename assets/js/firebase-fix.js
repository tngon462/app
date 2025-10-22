// assets/js/firebase-fix.js
// Làm cho anonymous auth diễn ra ĐÚNG 1 lần, đợi xong rồi mới báo "firebase-ready" cho app.
// Kết quả: hết vòng lặp auth, tốc độ vào lần đầu nhanh hẳn.

(function () {
  const READY_FLAG = '__firebaseFixInstalled';
  if (window[READY_FLAG]) return;
  window[READY_FLAG] = true;

  function waitForFirebaseApp() {
    return new Promise((resolve, reject) => {
      if (window.firebase && firebase.apps && firebase.apps.length) return resolve();
      let tries = 0;
      const t = setInterval(() => {
        tries++;
        if (window.firebase && firebase.apps && firebase.apps.length) {
          clearInterval(t);
          resolve();
        } else if (tries > 200) { // ~10s
          clearInterval(t);
          reject(new Error('[firebase-fix] Firebase app chưa init'));
        }
      }, 50);
    });
  }

  // Promise toàn cục: app có thể "await window.firebaseReady" trước khi làm gì với DB
  window.firebaseReady = new Promise(async (resolve, reject) => {
    try {
      await waitForFirebaseApp();

      // Nếu đã có user thì xong luôn
      const auth = firebase.auth();
      if (auth.currentUser) {
        resolve(auth.currentUser);
        document.dispatchEvent(new CustomEvent('firebase-ready', { detail: { user: auth.currentUser } }));
        return;
      }

      let resolved = false;
      const unsub = auth.onAuthStateChanged((user) => {
        if (user && !resolved) {
          resolved = true;
          unsub();
          resolve(user);
          document.dispatchEvent(new CustomEvent('firebase-ready', { detail: { user } }));
        }
      });

      // Chỉ gọi signIn 1 lần duy nhất
      if (!window.__anonAuthStarting) {
        window.__anonAuthStarting = true;
        auth.signInAnonymously().catch((err) => {
          console.warn('[firebase-fix] signInAnonymously error:', err);
          // vẫn đợi onAuthStateChanged nếu sau đó ok
        });
      }

      // Phòng khi callback không bắn (mất mạng tạm thời...)
      setTimeout(() => {
        if (!resolved && auth.currentUser) {
          resolved = true;
          unsub();
          resolve(auth.currentUser);
          document.dispatchEvent(new CustomEvent('firebase-ready', { detail: { user: auth.currentUser } }));
        }
      }, 8000);
    } catch (e) {
      console.error(e);
      reject(e);
    }
  });

  // Helper cho legacy code: onFirebaseReady(cb)
  window.onFirebaseReady = function (cb) {
    if (typeof cb !== 'function') return;
    window.firebaseReady.then((u) => cb(u)).catch(() => cb(null));
  };
})();
