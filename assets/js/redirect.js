/***** DOM refs *****/
const tableContainer = document.getElementById("table-container");
const selectTableDiv  = document.getElementById("select-table");
const startScreen     = document.getElementById("start-screen");
const selectedTableEl = document.getElementById("selected-table");
const startOrderBtn   = document.getElementById("start-order");
const posContainer    = document.getElementById("pos-container");
const posFrame        = document.getElementById("pos-frame");
const backBtn         = document.getElementById("back-btn");
const overlay         = document.getElementById("screen-overlay");

const popup           = document.getElementById("password-popup");
const passwordInput   = document.getElementById("password-input");
const passwordOk      = document.getElementById("password-ok");
const passwordCancel  = document.getElementById("password-cancel");
const passwordError   = document.getElementById("password-error");

/***** Config *****/
const linksUrl = "./links.json";
const secretCode = "6868";
const STORAGE_KEY_TABLE = "TNGON_TABLE";
const STORAGE_KEY_LINK  = "TNGON_TABLE_LINK";
// Tắt tự khôi phục bàn đã lưu
const AUTO_RESUME = false;

/***** State *****/
let currentTable = null;
let currentLink  = null;

// Firebase
let app, db;
let unsubGlobal = null;
let unsubTable  = null;
let unsubSignal = null;
let globalScreen = "on";
let tableScreen  = "on";

/***** Firebase config (giống admin.html) *****/
const firebaseConfig = {
  apiKey: "AIzaSyB4u2G41xdGkgBC0KltleRpcg5Lwru2RIU",
  authDomain: "tngon-b37d6.firebaseapp.com",
  databaseURL: "https://tngon-b37d6-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "tngon-b37d6",
  storageBucket: "tngon-b37d6.firebasestorage.app",
  messagingSenderId: "580319242104",
  appId: "1:580319242104:web:6922e4327bdc8286c30a8d",
  measurementId: "G-LHEH8ZC6SL"
};

/***** UI helpers *****/
function show(el){ el.classList.remove("hidden"); }
function hide(el){ el.classList.add("hidden"); }

/* Màn đen: on nếu global == off hoặc table == off */
function updateOverlay(){
  const off = (String(globalScreen).toLowerCase() === "off") ||
              (String(tableScreen).toLowerCase()  === "off");
  overlay.style.display = off ? "block" : "none";
}

/***** Steps *****/
function gotoSelect(){
  posFrame.src = "";
  hide(posContainer);
  hide(startScreen);
  show(selectTableDiv);

  if (unsubTable)  { unsubTable();  unsubTable = null; }
  if (unsubSignal) { unsubSignal(); unsubSignal = null; }

  currentTable = null;
  currentLink  = null;
  localStorage.removeItem(STORAGE_KEY_TABLE);
  localStorage.removeItem(STORAGE_KEY_LINK);
  tableScreen = "on";
  updateOverlay();
}

function gotoStart(keepTable){
  if (!keepTable) {
    currentTable = localStorage.getItem(STORAGE_KEY_TABLE);
    currentLink  = localStorage.getItem(STORAGE_KEY_LINK);
  }
  if (!currentTable || !currentLink) {
    gotoSelect();
    return;
  }
  selectedTableEl.textContent = currentTable;
  hide(selectTableDiv);
  hide(posContainer);
  show(startScreen);
}

function gotoPOS(){
  if (!currentLink) return;
  hide(selectTableDiv);
  hide(startScreen);
  show(posContainer);
  posFrame.src = currentLink;
}

/***** Build table buttons *****/
async function loadTables(){
  const res = await fetch(linksUrl);
  if (!res.ok) throw new Error("HTTP " + res.status);
  const data = await res.json();

  tableContainer.innerHTML = "";
  Object.entries(data).forEach(([key, link]) => {
    const btn = document.createElement("button");
    btn.textContent = "Bàn " + key;
    btn.className =
      "px-6 py-3 m-4 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-600 w-40 h-28 text-6xl";
    btn.onclick = () => {
      currentTable = key;
      currentLink  = link;
      localStorage.setItem(STORAGE_KEY_TABLE, key);
      localStorage.setItem(STORAGE_KEY_LINK,  link);
      subscribePerTable();
      gotoStart(true);
    };
    tableContainer.appendChild(btn);
  });
}

/***** Nút bí mật: NHẤN 7 LẦN TRONG 2.5S -> hỏi mật mã -> về màn CHỌN BÀN *****/
function bindSecretBack(){
  const REQUIRED_TAPS = 7;
  const WINDOW_MS = 2500; // 2.5s

  let tapCount = 0;
  let timer = null;

  function reset() {
    tapCount = 0;
    if (timer) { clearTimeout(timer); timer = null; }
  }

  function handleTap(e){
    e.preventDefault();
    tapCount += 1;

    if (!timer) {
      timer = setTimeout(() => reset(), WINDOW_MS);
    }

    if (tapCount >= REQUIRED_TAPS) {
      reset();
      show(popup);
      passwordInput.value = "";
      passwordError.classList.add("hidden");
      setTimeout(()=> passwordInput.focus(), 50);
    }
  }

  backBtn.addEventListener("click", handleTap);
}

/***** Firebase wiring *****/
async function initFirebase(){
  app = firebase.initializeApp(firebaseConfig);
  db  = firebase.database();
  try { await firebase.auth().signInAnonymously(); } catch(e){ /* ignore */ }
  await new Promise(r => { const un = firebase.auth().onAuthStateChanged(()=>{ un(); r(); }); });

  // Global screen
  const refGlobal = db.ref("control/screen");
  const onGlobal  = snap => {
    globalScreen = (snap.exists()? snap.val() : "on");
    updateOverlay();
  };
  refGlobal.on("value", onGlobal);
  unsubGlobal = () => refGlobal.off("value", onGlobal);
}

function subscribePerTable(){
  if (unsubTable)  { unsubTable();  unsubTable = null; }
  if (unsubSignal) { unsubSignal(); unsubSignal = null; }

  const t = currentTable;
  if (!t || !db) return;

  // Per-table screen
  const refTable = db.ref(`control/tables/${t}/screen`);
  const onTable  = snap => {
    tableScreen = (snap.exists()? snap.val() : "on");
    updateOverlay();
  };
  refTable.on("value", onTable);
  unsubTable = () => refTable.off("value", onTable);

  // Signals: admin "Làm mới" -> quay về MÀN BẮT ĐẦU (giữ nguyên số bàn)
  const refSig = db.ref(`signals/${t}`);
  const onSig  = snap => {
    const v = snap.val();
    if (!v) return;
    const status = String(v.status || "").toLowerCase();
    if (status === "expired") {
      posFrame.src = "";
      gotoStart(true);
      // refSig.set(null).catch(()=>{}); // tuỳ chọn
    }
  };
  refSig.on("value", onSig);
  unsubSignal = () => refSig.off("value", onSig);
}

/***** Main *****/
document.addEventListener("DOMContentLoaded", async () => {
  try {
    // Luôn xoá bàn đã lưu để không auto-jump
    localStorage.removeItem(STORAGE_KEY_TABLE);
    localStorage.removeItem(STORAGE_KEY_LINK);

    await loadTables();
    bindSecretBack();
    await initFirebase();

    // Không tự resume. Nếu muốn cho phép resume sau này:
    // if (AUTO_RESUME) {
    //   const savedTable = localStorage.getItem(STORAGE_KEY_TABLE);
    //   const savedLink  = localStorage.getItem(STORAGE_KEY_LINK);
    //   if (savedTable && savedLink) {
    //     currentTable = savedTable;
    //     currentLink  = savedLink;
    //     subscribePerTable();
    //     gotoStart(true);
    //   }
    // }
  } catch (e) {
    console.error(e);
  }
});

/***** Actions *****/
startOrderBtn.onclick = () => {
  if (!currentLink) return;
  gotoPOS();
};

// Popup password
passwordOk.onclick = () => {
  if (passwordInput.value === secretCode) {
    hide(popup);
    gotoSelect();
  } else {
    passwordError.classList.remove("hidden");
    // Load danh sách link bàn từ links.json
    const res = await fetch("./links.json");
    const links = await res.json();

    const container = document.getElementById("table-container");

    // Tạo nút cho từng bàn
    Object.keys(links).forEach((key) => {
      const btn = document.createElement("button");
      btn.textContent = "Bàn " + key;

      // --- style trực tiếp ---
      btn.style.backgroundColor = "#3b82f6"; // xanh nước biển (Tailwind blue-500)
      btn.style.color = "#fff";
      btn.style.fontSize = "2rem"; // cỡ chữ to
      btn.style.fontWeight = "bold";
      btn.style.width = "7rem"; // rộng hơn
      btn.style.height = "5rem"; // cao hơn
      btn.style.borderRadius = "0.5rem"; // bo góc
      btn.style.margin = "0.5rem";
      btn.style.display = "flex";
      btn.style.alignItems = "center";
      btn.style.justifyContent = "center";
      btn.style.boxShadow = "0 2px 4px rgba(0,0,0,0.2)";
      btn.style.cursor = "pointer";

      // hover effect (JS)
      btn.addEventListener("mouseenter", () => {
        btn.style.backgroundColor = "#1d4ed8"; // blue-700
      });
      btn.addEventListener("mouseleave", () => {
        btn.style.backgroundColor = "#3b82f6"; // blue-500
      });

      // Khi click → sang màn start screen
      btn.addEventListener("click", () => {
        document.getElementById("select-table").classList.add("hidden");
        document.getElementById("start-screen").classList.remove("hidden");
        document.getElementById("selected-table").textContent = key;

        // Lưu link để dùng khi bắt đầu gọi món
        document
          .getElementById("start-order")
          .setAttribute("data-url", links[key]);
      });

      container.appendChild(btn);
    });

    // Xử lý nút bắt đầu gọi món
    const startBtn = document.getElementById("start-order");
    // Style riêng cho nút bắt đầu
    startBtn.style.backgroundColor = "#3b82f6";
    startBtn.style.color = "#fff";
    startBtn.style.fontSize = "1.5rem";
    startBtn.style.fontWeight = "bold";
    startBtn.style.padding = "1rem 2rem";
    startBtn.style.borderRadius = "0.75rem";
    startBtn.style.boxShadow = "0 2px 6px rgba(0,0,0,0.25)";
    startBtn.style.cursor = "pointer";

    startBtn.addEventListener("mouseenter", () => {
      startBtn.style.backgroundColor = "#1d4ed8";
    });
    startBtn.addEventListener("mouseleave", () => {
      startBtn.style.backgroundColor = "#3b82f6";
    });

    startBtn.addEventListener("click", (e) => {
      const url = e.target.getAttribute("data-url");
      if (!url) return;

      document.getElementById("start-screen").classList.add("hidden");
      document.getElementById("pos-container").classList.remove("hidden");
      document.getElementById("pos-frame").src = url;
    });
  } catch (err) {
    console.error("Lỗi khi load links.json:", err);
  }
};
passwordCancel.onclick = () => hide(popup);
});
