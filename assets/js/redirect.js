// redirect-core.js
document.addEventListener("DOMContentLoaded", async () => {
  try {
    const res = await fetch("./links.json?" + Date.now());
    const data = await res.json();
    const links = data.links;

    const container = document.getElementById("table-container");
    const selectTable = document.getElementById("select-table");
    const startScreen = document.getElementById("start-screen");
    const posContainer = document.getElementById("pos-container");
    const posFrame = document.getElementById("pos-frame");
    const selectedTable = document.getElementById("selected-table");
    const startBtn = document.getElementById("start-order");

    Object.keys(links).forEach((key) => {
      const btn = document.createElement("button");
      btn.textContent = "Bàn " + key;
      btn.className =
        "px-6 py-3 rounded-lg bg-blue-500 text-white font-bold hover:bg-blue-700 w-28 h-20 text-xl shadow";

      btn.addEventListener("click", () => {
        selectTable.classList.add("hidden");
        startScreen.classList.remove("hidden");
        selectedTable.textContent = key;

        startBtn.setAttribute("data-url", links[key]);

        // Lưu & set global cho blackout.js
        localStorage.setItem("tableId", key);
        localStorage.setItem("tableUrl", links[key]);
        localStorage.setItem("appState", "start");
        window.tableId = key;
      });

      container.appendChild(btn);
    });

    // Bắt đầu gọi món
    startBtn.addEventListener("click", (e) => {
      const url = e.target.getAttribute("data-url");
      if (!url) return;

      startScreen.classList.add("hidden");
      posContainer.classList.remove("hidden");
      posFrame.src = url;

      localStorage.setItem("appState", "pos");
    });
  } catch (err) {
    console.error("Lỗi load links.json:", err);
  }
});
