// ===== Firebase config (cùng với admin) =====
const firebaseConfig = {
  apiKey: "AIzaSyB4u2G41xdGkgBC0KltleRpcg5Lwru2RIU",
  authDomain: "tngon-b37d6.firebaseapp.com",
  databaseURL: "https://tngon-b37d6-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "tngon-b37d6",
  storageBucket: "tngon-b37d6.firebasestorage.app",
  messagingSenderId: "580319242104",
  appId: "1:580319242104:web:6922e4327bdc8286c30a8d"
};

// ===== Init Firebase =====
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

// ===== Overlay element =====
const overlay = document.getElementById("screen-overlay");

// ===== Login ẩn danh + lắng nghe trạng thái màn hình =====
firebase.auth().signInAnonymously()
  .then(() => {
    const db = firebase.database();
    const refScreen = db.ref("control/screen");

    refScreen.on("value", snap => {
      const val = snap.val();
      if (val === "off") {
        overlay.style.display = "block"; // hiện màn đen
      } else {
        overlay.style.display = "none";  // tắt màn đen
      }
    });
  })
  .catch(err => console.error("Firebase auth error:", err));