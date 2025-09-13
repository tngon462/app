<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <title>T-NGON - Gọi món</title>
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  
  <!-- iOS / PWA meta để full màn -->
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="theme-color" content="#3b82f6" />
  
  <link rel="manifest" href="./redirect.webmanifest" />
  <link rel="icon" href="./icons/icon-192.png" />

  <!-- Tailwind -->
  <script src="https://cdn.tailwindcss.com"></script>

  <style>
    #screen-overlay {
      position: fixed;
      inset: 0;
      background: #000;
      opacity: 1;
      z-index: 2000;
      display: none; /* mặc định ẩn */
    }
  </style>
</head>
<body class="bg-gray-100 min-h-screen flex flex-col items-center justify-center">

  <!-- Bước 1: Chọn bàn -->
  <div id="select-table" class="flex flex-col items-center">
    <h1 class="text-3xl font-bold text-blue-600 mb-6">Vui lòng chọn bàn</h1>
    <div id="table-container"
         class="grid justify-center gap-4
                grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5
                px-4">
    </div>
  </div>

  <!-- Bước 2: Màn bắt đầu -->
  <div id="start-screen" class="hidden flex flex-col items-center justify-center min-h-screen">
    <h2 class="text-6xl font-semibold mb-6">BÀN SỐ <span id="selected-table"></span></h2>
    <button id="start-order"
            class="px-12 py-8 rounded-xl bg-blue-500 text-white font-bold hover:bg-blue-600 text-3xl shadow">
      Bắt đầu gọi món
    </button>
  </div>

  <!-- Bước 3: POS iframe -->
  <div id="pos-container" class="hidden w-full h-screen">
    <iframe id="pos-frame" class="w-full h-full border-0" referrerpolicy="no-referrer"></iframe>
  </div>

  <!-- Popup nhập mật mã -->
  <div id="password-popup" class="hidden fixed inset-0 bg-black/50 flex items-center justify-center z-[1100]">
    <div class="bg-white p-6 rounded-lg shadow-lg text-center">
      <h3 class="text-lg font-semibold mb-4">Nhập mật mã</h3>
      <input id="password-input" type="password" maxlength="4"
             class="border p-2 rounded text-center tracking-widest text-xl"
             placeholder="****" inputmode="numeric" />
      <div class="mt-4 flex justify-center space-x-4">
        <button id="password-ok" class="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600">OK</button>
        <button id="password-cancel" class="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400">Hủy</button>
      </div>
      <p id="password-error" class="text-red-500 mt-2 hidden">Sai mật mã!</p>
    </div>
  </div>

  <!-- Màn đen -->
  <div id="screen-overlay"></div>

  <!-- Nút bí mật trái dưới (ẩn, về màn bắt đầu) -->
  <div id="secret-left"
       class="fixed bottom-5 left-0 w-24 h-24 z-[2000] opacity-0 select-none"
       style="pointer-events: auto;">
  </div>

  <!-- Nút bí mật phải dưới (ẩn, về màn chọn bàn - cần pass) -->
  <div id="secret-right"
       class="fixed bottom-5 right-0 w-24 h-24 z-[2000] opacity-0 select-none"
       style="pointer-events: auto;">
  </div>

  <!-- Logic chính -->
  <script src="./assets/js/redirect.js?v=grid3"></script>

  <!-- Firebase & blackout -->
  <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-database-compat.js"></script>
  <script src="./assets/js/blackout.js?v=5"></script>

  <!-- Script nút bí mật -->
  <script>
    (function() {
      const leftBtn = document.getElementById("secret-left");
      const rightBtn = document.getElementById("secret-right");
      const passPopup = document.getElementById("password-popup");
      const passInput = document.getElementById("password-input");
      const passOk = document.getElementById("password-ok");
      const passCancel = document.getElementById("password-cancel");
      const passError = document.getElementById("password-error");

      let leftClicks = [];
      let rightClicks = [];

      // Hàm reset UI
      function showStart() {
        document.getElementById("pos-container").classList.add("hidden");
        document.getElementById("select-table").classList.add("hidden");
        document.getElementById("start-screen").classList.remove("hidden");
      }

      function showSelect() {
        document.getElementById("pos-container").classList.add("hidden");
        document.getElementById("start-screen").classList.add("hidden");
        document.getElementById("select-table").classList.remove("hidden");
      }

      // Xử lý bấm 10 lần bên trái -> về màn bắt đầu
      leftBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();

        const now = Date.now();
        leftClicks.push(now);
        leftClicks = leftClicks.filter(t => now - t <= 3000);

        if (leftClicks.length >= 10) {
          showStart();
          leftClicks = [];
        }
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

function updateOverlay() {
  if (globalState === "off" || localState === "off") {
    setOverlay(true);
  } else {
    setOverlay(false);
  }
}

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

    // Lắng nghe riêng từng bàn
    function attachTableListeners(tableId) {
      if (!tableId) return;

      // Điều khiển riêng
      db.ref(`control/tables/${tableId}/screen`).on("value", snap => {
        localState = (snap.val() || "on").toLowerCase();
        updateOverlay();
      });

      // Xử lý bấm 10 lần bên phải -> hiện nhập mật mã
      rightBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();

        const now = Date.now();
        rightClicks.push(now);
        rightClicks = rightClicks.filter(t => now - t <= 3000);

        if (rightClicks.length >= 10) {
          // Hiện popup pass
          passPopup.classList.remove("hidden");
          passInput.value = "";
          passError.classList.add("hidden");
          passInput.focus();
          rightClicks = [];
      // Tín hiệu làm mới
      db.ref(`signals/${tableId}`).on("value", snap => {
        if (!snap.exists()) return;
        const val = snap.val();
        if (val.status === "expired") {
          resetToStart();
          db.ref(`signals/${tableId}`).remove(); // clear sau khi dùng
        }
      });
    }

      // Xác nhận pass
      passOk.addEventListener("click", () => {
        if (passInput.value === "6868") {
          passPopup.classList.add("hidden");
          showSelect();
        } else {
          passError.classList.remove("hidden");
        }
      });
    // Khởi tạo nếu có sẵn tableId
    const initTableId = window.tableId || localStorage.getItem("tableId");
    if (initTableId) attachTableListeners(initTableId);

      passCancel.addEventListener("click", () => {
        passPopup.classList.add("hidden");
      });
    })();
  </script>

  <!-- Service Worker -->
  <script>
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw-admin.js', { scope: './' })
        .catch(console.error);
    }
  </script>
</body>
</html>
    // Theo dõi khi tableId thay đổi
    window.addEventListener("tableSelected", (e) => {
      const newId = e.detail;
      if (newId) {
        localStorage.setItem("tableId", newId);
        attachTableListeners(newId);
      }
    });
  })
  .catch(() => {
    setOverlay(false); // fallback nếu login lỗi
  });
