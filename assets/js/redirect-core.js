// redirect-core.js
document.addEventListener("DOMContentLoaded", async () => {
  try {
    const res = await fetch("./links.json?" + Date.now());
    const data = await res.json();
    const links = data.links;

    const container = document.getElementById("table-container");

    Object.keys(links).forEach((key) => {
      const btn = document.createElement("button");
      btn.textContent = "Bàn " + key;
      btn.className =
        "px-6 py-3 rounded-lg bg-blue-500 text-white font-bold hover:bg-blue-700 w-28 h-20 text-xl shadow";

      btn.addEventListener("click", () => {
        document.getElementById("select-table").classList.add("hidden");
        document.getElementById("start-screen").classList.remove("hidden");
        document.getElementById("selected-table").textContent = key;

        document
          .getElementById("start-order")
          .setAttribute("data-url", links[key]);

        // ✅ lưu lại cho lần reload
        localStorage.setItem("tableId", key);
        localStorage.setItem("tableUrl", links[key]);

        // ✅ set global cho blackout.js
        window.tableId = key;
      });

      container.appendChild(btn);
    });

    const startBtn = document.getElementById("start-order");
    startBtn.addEventListener("click", (e) => {
      const url = e.target.getAttribute("data-url");
      if (!url) return;

      document.getElementById("start-screen").classList.add("hidden");
      document.getElementById("pos-container").classList.remove("hidden");
      document.getElementById("pos-frame").src = url;
    });
  } catch (err) {
    console.error("Lỗi load links.json:", err);
  }
});
