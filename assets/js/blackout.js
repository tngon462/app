// ===== Firebase config (cùng project với admin) =====
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

// ===== Trạng thái màn hình =====
let globalState = "on";
let localState = "on";

// ===== Reset về màn hình bắt đầu gọi món =====
function resetToStart() {
  const posContainer = document.getElementById("pos-container");
  const posFrame = document.getElementById("pos-frame");
  const startScreen = document.getElementById("start-screen");

  if (posContainer) posContainer.classList.add("hidden");
  if (posFrame) posFrame.src = "about:blank";
  if (startScreen) startScreen.classList.remove("hidden");
}

// ===== Firebase login & lắng nghe =====
firebase.auth().signInAnonymously()
  .then(() => {
    const db = firebase.database();
    const refGlobal = db.ref("control/screen");

    // Lắng nghe toàn quán
    refGlobal.on("value", snap => {
      globalState = (snap.val() || "on").toLowerCase();
      updateOverlay();
    });

    // Hàm cập nhật overlay
    function updateOverlay() {
      if (globalState === "off" || localState === "off") {
        setOverlay(true);
      } else {
        setOverlay(false);
      }
    }

    // Lắng nghe theo bàn (gắn khi đã chọn bàn)
    function listenPerTable(tableId) {
      // Điều khiển bật/tắt màn hình riêng bàn
      const refLocal = db.ref(`control/tables/${tableId}/screen`);
      refLocal.on("value", snap => {
        localState = (snap.val() || "on").toLowerCase();
        updateOverlay();
      });

      // Tín hiệu làm mới
      const refSig = db.ref(`signals/${tableId}`);
      refSig.on("value", snap => {
        if (!snap.exists()) return;
        const val = snap.val();
        if (val.status === "expired") {
          console.log(`Bàn ${tableId}: Nhận tín hiệu refresh`);
          resetToStart();
        }
      });
    }

    // Theo dõi khi người dùng chọn bàn (DOM thay đổi)
    const observer = new MutationObserver(() => {
      const tableSpan = document.getElementById("selected-table");
      if (tableSpan && tableSpan.textContent) {
        const tableId = tableSpan.textContent.trim();
        if (tableId) {
          listenPerTable(tableId);
          observer.disconnect(); // chỉ chạy 1 lần
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  })
  .catch(err => console.error("Firebase auth error:", err));