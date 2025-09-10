const tableContainer = document.getElementById("table-container");
const selectTableDiv = document.getElementById("select-table");
const startScreen = document.getElementById("start-screen");
const selectedTableSpan = document.getElementById("selected-table");
const startOrderBtn = document.getElementById("start-order");
const posContainer = document.getElementById("pos-container");
const posFrame = document.getElementById("pos-frame");
const backBtn = document.getElementById("back-btn");

const linksUrl = "links.json";

let currentTable = null;
let currentLink = null;

async function loadTables() {
  try {
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
        currentLink = link;

        // Sang màn start
        selectTableDiv.classList.add("hidden");
        startScreen.classList.remove("hidden");
        selectedTableSpan.textContent = key;
      };

      tableContainer.appendChild(btn);
    });
  } catch (err) {
    tableContainer.innerHTML =
      "<p style='color:red'>Lỗi tải links.json: " + err + "</p>";
    console.error("Lỗi load JSON:", err);
  }
}

// Sự kiện "Bắt đầu gọi món"
startOrderBtn.onclick = () => {
  if (currentLink) {
    startScreen.classList.add("hidden");
    posContainer.classList.remove("hidden");
    posFrame.src = currentLink;
  }
};

// Nút ẩn để quay lại bước 1
backBtn.onclick = () => {
  posFrame.src = ""; // clear iframe
  posContainer.classList.add("hidden");
  startScreen.classList.add("hidden");
  selectTableDiv.classList.remove("hidden");
  currentTable = null;
  currentLink = null;
};

document.addEventListener("DOMContentLoaded", loadTables);
