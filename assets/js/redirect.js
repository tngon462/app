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

/***** State *****/
let currentTable = null;
let currentLink  = null;
let pressTimer   = null;

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

  // Hủy subscribe theo bàn cũ
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
  // Nếu đã có table rồi thì giữ lại, ngược lại đọc từ storage
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
      "px-4 py-2 m-2 rounded-lg bg-green-500 text-white font-bold hover:bg-green-600 w-24 h-16 text-lg";
    btn.onclick = () => {
      currentTable = key;
      currentLink  = link;
      localStorage.setItem(STORAGE_KEY_TABLE, key);
      localStorage.setItem(STORAGE_KEY_LINK,  link);
      subscribePerTable(); // đăng ký lắng nghe cho bàn mới
      gotoStart(true);
    };
    tableContainer.appendChild(btn);
  });
}

/***** Long-press 5s -> yêu cầu mật mã -> quay về màn CHỌN BÀN *****/
function bindSecretBack(){
  const startTimer = () => {
    clearTimeout(pressTimer);
    pressTimer = setTimeout(() => {
      show(popup);
      passwordInput.value = "";
      passwordError.classList.add("hidden");
      // Trễ 50ms để iOS đảm bảo focus
      setTimeout(()=> passwordInput.focus(), 50);
    }, 5000);
  };
  const clearTimer = () => clearTimeout(pressTimer);

  // Hỗ trợ chuột & cảm ứng
  backBtn.addEventListener("mousedown", startTimer);
  backBtn.addEventListener("mouseup", clearTimer);
  backBtn.addEventListener("mouseleave", clearTimer);

  backBtn.addEventListener("touchstart", (e)=>{ e.preventDefault(); startTimer(); }, {passive:false});
  backBtn.addEventListener("touchend",   (e)=>{ e.preventDefault(); clearTimer(); }, {passive:false});
  backBtn.addEventListener("touchcancel",(e)=>{ e.preventDefault(); clearTimer(); }, {passive:false});

  passwordOk.onclick = () => {
    if (passwordInput.value === secretCode) {
      hide(popup);
      gotoSelect();
    } else {
      passwordError.classList.remove("hidden");
    }
  };
  passwordCancel.onclick = () => hide(popup);
}

/***** Firebase wiring *****/
async function initFirebase(){
  app = firebase.initializeApp(firebaseConfig);
  db  = firebase.database();
  // Anonymous
  try { await firebase.auth().signInAnonymously(); }
  catch(e){ /* ignore */ }
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
  // Hủy subscribe cũ
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
      // Quay về màn BẮT ĐẦU (giữ bàn)
      posFrame.src = "";
      gotoStart(true);
      // Tuỳ chọn: clear tín hiệu (nếu muốn)
      // refSig.set(null).catch(()=>{});
    }
  };
  refSig.on("value", onSig);
  unsubSignal = () => refSig.off("value", onSig);
}

/***** Main *****/
document.addEventListener("DOMContentLoaded", async () => {
  try {
    await loadTables();
    bindSecretBack();
    await initFirebase();

    // Nếu đã từng chọn bàn trước đó -> vào ngay màn BẮT ĐẦU
    const savedTable = localStorage.getItem(STORAGE_KEY_TABLE);
    const savedLink  = localStorage.getItem(STORAGE_KEY_LINK);
    if (savedTable && savedLink) {
      currentTable = savedTable;
      currentLink  = savedLink;
      subscribePerTable();
      gotoStart(true);
    }
  } catch (e) {
    // Nếu có lỗi vẫn hiển thị chọn bàn
    console.error(e);
  }
});

/***** Actions *****/
startOrderBtn.onclick = () => {
  if (!currentLink) return;
  gotoPOS();
};
