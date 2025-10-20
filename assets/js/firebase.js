// assets/js/firebase.js
(function () {
  const firebaseConfig = {
    apiKey: "AIzaSyB4u2G41xdGkgBC0KltleRpcg5Lwru2RIU",
    authDomain: "tngon-b37d6.firebaseapp.com",
    databaseURL: "https://tngon-b37d6-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "tngon-b37d6",
    storageBucket: "tngon-b37d6.firebasestorage.app",
    messagingSenderId: "580319242104",
    appId: "1:580319242104:web:6922e4327bdc8286c30a8d"
  };

  // Init 1 lần
  if (!firebase.apps || !firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }

  // Đăng nhập ẩn danh
  const authP = firebase.auth().currentUser
    ? Promise.resolve(firebase.auth().currentUser)
    : firebase.auth().signInAnonymously().catch((e) => {
        console.warn("[firebase.js] signInAnonymously failed:", e);
      });

  // Xuất db sau khi auth xong + PHÁT SỰ KIỆN firebase-ready
  window.initFirebase = (async () => {
    try { await authP; } catch(_) {}
    const db = firebase.database();
    window.db = db;

    try {
      window.dispatchEvent(new CustomEvent('firebase-ready', { detail: { db } }));
    } catch (_) {}

    return db;
  })();
})();
