// assets/js/firebase.js
// ========= Firebase init + anonymous auth (compat) =========

// ---- 1) Config của dự án ----
const __firebaseConfig = {
  apiKey: "AIzaSyB4u2G41xdGkgBC0KltleRpcg5Lwru2RIU",
  authDomain: "tngon-b37d6.firebaseapp.com",
  databaseURL: "https://tngon-b37d6-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "tngon-b37d6",
  storageBucket: "tngon-b37d6.firebasestorage.app",
  messagingSenderId: "580319242104",
  appId: "1:580319242104:web:6922e4327bdc8286c30a8d",
  // measurementId không bắt buộc cho RTDB + auth
};

// ---- 2) Khởi tạo app (chỉ 1 lần) ----
(function initFirebaseOnce() {
  if (!window.firebase) {
    console.error("[firebase.js] Firebase SDK chưa được load. Hãy đảm bảo 3 SDK compat nằm TRƯỚC file này:");
    // 1) firebase-app-compat.js
    // 2) firebase-auth-compat.js
    // 3) firebase-database-compat.js
    return;
  }
  if (!firebase.apps || !firebase.apps.length) {
    firebase.initializeApp(__firebaseConfig);
  }
  // Export tiện dùng toàn app
  window.firebaseApp  = firebase.app();
  window.firebaseAuth = firebase.auth();
  window.firebaseDb   = firebase.database();
})();

// ---- 3) Đăng nhập ẩn danh + Promise ready ----
window.firebaseReady = (async function ensureAnonSignIn() {
  // Nếu đã có user -> xong
  if (firebaseAuth.currentUser) return true;

  // Chờ onAuthStateChanged sẵn (nếu auth đang trong tiến trình)
  const waitAuth = new Promise((resolve) => {
    const un = firebaseAuth.onAuthStateChanged((u) => {
      if (u) { un(); resolve(true); }
    });
    // timeout nhẹ để không chờ vô hạn nếu chưa signIn
    setTimeout(() => { try { un(); } catch(_){} resolve(false); }, 800);
  });

  const already = await waitAuth;
  if (already) return true;

  // Nếu chưa vào được -> thử signInAnonymously (tối đa 3 lần)
  const trySignIn = async (retries = 3) => {
    let lastErr = null;
    for (let i = 0; i < retries; i++) {
      try {
        await firebaseAuth.signInAnonymously();
        return true;
      } catch (e) {
        lastErr = e;
        await new Promise(r => setTimeout(r, 500 * (i + 1)));
      }
    }
    throw lastErr || new Error("signInAnonymously failed");
  };

  await trySignIn(3);
  return true;
})();

// ---- 4) Phát sự kiện cho các script khác nghe ----
(async () => {
  try {
    await window.firebaseReady;
    // Thông báo toàn cục: đã sẵn sàng dùng DB/Auth
    window.dispatchEvent(new CustomEvent("firebase-ready", {
      detail: { db: window.firebaseDb, auth: window.firebaseAuth }
    }));
  } catch (_) {
    // fallback: không throw, để app vẫn chạy (nhưng sẽ không có điều khiển từ admin)
  }
})();

// ---- 5) Helper nhỏ (optional): check online RTDB ----
// Có thể dùng chỗ khác nếu muốn hiển thị status
window.firebaseIsConnected = function(callback) {
  // callback(Boolean online)
  try {
    const connRef = window.firebaseDb.ref(".info/connected");
    connRef.on("value", (snap) => {
      callback && callback(!!snap.val());
    });
  } catch (_) {}
};