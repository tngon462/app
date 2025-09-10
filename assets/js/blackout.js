// ===== Firebase config (giống bên Admin) =====
const firebaseConfig = {
  apiKey: "AIzaSyB4u2G41xdGkgBC0KltleRpcg5Lwru2RIU",
  authDomain: "tngon-b37d6.firebaseapp.com",
  databaseURL: "https://tngon-b37d6-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "tngon-b37d6",
  storageBucket: "tngon-b37d6.firebasestorage.app",
  messagingSenderId: "580319242104",
  appId: "1:580319242104:web:6922e4327bdc8286c30a8d"
};

// ===== Debug overlay =====
const debugBox = document.createElement("div");
debugBox.style.position = "fixed";
debugBox.style.bottom = "5px";
debugBox.style.right = "5px";
debugBox.style.background = "rgba(0,0,0,0.7)";
debugBox.style.color = "#0f0";
debugBox.style.fontSize = "12px";
debugBox.style.padding = "4px 6px";
debugBox.style.borderRadius = "4px";
debugBox.style.zIndex = "3000";
debugBox.textContent = "Debug init...";
document.body.appendChild(debugBox);

function logDebug(msg) {
  debugBox.textContent = msg;
  console.log(msg); // vẫn log nếu mở trên PC
}

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
  logDebug("🔄 Reset về màn hình bắt đầu");
  document.getElementById("pos-container").classList.add("hidden");
  document.getElementById("pos-frame").src = "about:blank";
  document.getElementById("start-screen").classList.remove("hidden");
}

firebase.auth().signInAnonymously()
  .then(() => {
    logDebug("✅ Firebase login ok");
    const db = firebase.database();

    // Toàn quán
    db.ref("control/screen").on("value", snap => {
      globalState = (snap.val() || "on").toLowerCase();
      logDebug("🌐 Global=" + globalState);
      updateOverlay();
    });

    function updateOverlay() {
      if (globalState === "off" || localState === "off") {
        setOverlay(true);
        logDebug("⬛ Overlay ON");
      } else {
        setOverlay(false);
        logDebug("⬜ Overlay OFF");
      }
    }

    // Nghe riêng từng bàn
    function listenPerTable(tableId) {
      logDebug("👂 Listen table " + tableId);

      db.ref(`control/tables/${tableId}/screen`).on("value", snap => {
        localState = (snap.val() || "on").toLowerCase();
        logDebug(`🪑 Table ${tableId}=${localState}`);
        updateOverlay();
      });

      db.ref(`signals/${tableId}`).on("value", snap => {
        if (!snap.exists()) return;
        const val = snap.val();
        logDebug(`🪧 Signal ${tableId}=${JSON.stringify(val)}`);
        if (val.status === "expired") {
          resetToStart();
        }
      });
    }

    // Bắt bàn khi chọn
    const observer = new MutationObserver(() => {
      const tableSpan = document.getElementById("selected-table");
      if (tableSpan && tableSpan.textContent) {
        const tableId = tableSpan.textContent.trim();
        if (tableId) {
          listenPerTable(tableId);
          observer.disconnect();
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  })
  .catch(err => logDebug("❌ Firebase auth error: " + err));