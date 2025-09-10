// ===== Firebase config =====
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

const overlay = document.getElementById("screen-overlay");

// ===== Helper: show/hide overlay =====
function setOverlay(show) {
  overlay.style.display = show ? "block" : "none";
}

// ===== Lắng nghe trạng thái màn hình =====
firebase.auth().signInAnonymously()
  .then(() => {
    const db = firebase.database();
    const refGlobal = db.ref("control/screen");

    let globalState = "on";
    let localState = "on";

    // Lắng nghe toàn quán
    refGlobal.on("value", snap => {
      globalState = (snap.val() || "on").toLowerCase();
      updateOverlay();
    });

    // Lắng nghe theo bàn (khi đã biết bàn)
    function listenPerTable(tableId) {
      const refLocal = db.ref(`control/tables/${tableId}/screen`);
      refLocal.on("value", snap => {
        localState = (snap.val() || "on").toLowerCase();
        updateOverlay();
      });
    }

    // Hàm cập nhật overlay
    function updateOverlay() {
      if (globalState === "off" || localState === "off") {
        setOverlay(true);
      } else {
        setOverlay(false);
      }
    }

    // Khi chọn bàn thì redirect.js có set #selected-table
    const observer = new MutationObserver(() => {
      const tableSpan = document.getElementById("selected-table");
      if (tableSpan && tableSpan.textContent) {
        const tableId = tableSpan.textContent.trim();
        if (tableId) {
          listenPerTable(tableId);
          observer.disconnect(); // chỉ cần chạy 1 lần khi đã biết bàn
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  })
  .catch(err => console.error("Firebase auth error:", err));