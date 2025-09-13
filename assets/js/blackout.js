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

// Init Firebase
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const overlay = document.getElementById("screen-overlay");
function setOverlay(show) {
  overlay.style.display = show ? "block" : "none";
}

let globalState = "on";
let localState = "on";

// Reset về màn bắt đầu
function resetToStart() {
  document.getElementById("pos-container").classList.add("hidden");
  document.getElementById("pos-frame").src = "about:blank";
  document.getElementById("start-screen").classList.remove("hidden");
}

firebase.auth().signInAnonymously()
  .then(() => {
    const db = firebase.database();

    // Lắng nghe toàn quán
    db.ref("control/screen").on("value", snap => {
      globalState = (snap.val() || "on").toLowerCase();
      updateOverlay();
    });

    function updateOverlay() {
      if (globalState === "off" || localState === "off") {
        setOverlay(true);
      } else {
        setOverlay(false);
      }
    }

    function initPerTableListener() {
      const tableId = window.tableId || localStorage.getItem("tableId");
      if (!tableId) return;

      // Điều khiển riêng
      db.ref(`control/tables/${tableId}/screen`).on("value", snap => {
        localState = (snap.val() || "on").toLowerCase();
        updateOverlay();
      });

      // Tín hiệu làm mới
      db.ref(`signals/${tableId}`).on("value", snap => {
        if (!snap.exists()) return;
        const val = snap.val();
        if (val.status === "expired") {
          resetToStart();
        }
      });
    }

    // Ngay sau login
    initPerTableListener();

    // Khi chọn bàn sau đó
    window.addEventListener("tableSelected", () => {
      initPerTableListener();
    });
  })
  .catch(() => {
    setOverlay(false); // fallback
  });