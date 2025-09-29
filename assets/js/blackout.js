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
function setOverlay(show) {
  overlay.style.display = show ? "block" : "none";
}

let globalState = "on";
let localState = "on";

function resetToStart() {
  document.getElementById("pos-container").classList.add("hidden");
  document.getElementById("pos-frame").src = "about:blank";
  document.getElementById("start-screen").classList.remove("hidden");
}

// ===== Firebase login & lắng nghe =====
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
        if (window.NoSleepControl) window.NoSleepControl.stop(); // tắt chống sleep
      } else {
        setOverlay(false);
        if (window.NoSleepControl) window.NoSleepControl.start(); // bật lại chống sleep
      }
    }

    // Nghe riêng từng bàn
    function initPerTableListener() {
      const tableId = window.tableId || localStorage.getItem("tableId");
      if (!tableId) return;

      // Điều khiển riêng từng bàn
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

    // Khi vừa login xong thì lắng nghe ngay nếu đã chọn bàn
    initPerTableListener();

    // Nếu chọn bàn sau đó mới biết tableId → bắt sự kiện lưu
    window.addEventListener("storage", () => initPerTableListener());
  })
  .catch(() => {
    setOverlay(false); // fallback: không chặn nếu login lỗi
  });