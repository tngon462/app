document.addEventListener("DOMContentLoaded", async () => {
  try {
    // Load danh sách link bàn từ links.json
    const res = await fetch("./links.json");
    const links = await res.json();

    const container = document.getElementById("table-container");

    // Tạo nút cho từng bàn
    Object.keys(links).forEach((key) => {
      const btn = document.createElement("button");
      btn.textContent = "Bàn " + key;
      btn.className =
        "px-6 py-3 m-2 rounded-lg bg-blue-500 text-white font-bold hover:bg-blue-600 w-32 h-20 text-2xl flex items-center justify-center shadow";

      btn.addEventListener("click", () => {
        // Ẩn màn chọn bàn, hiện màn start
        document.getElementById("select-table").classList.add("hidden");
        document.getElementById("start-screen").classList.remove("hidden");
        document.getElementById("selected-table").textContent = key;

        // Lưu số bàn cho blackout.js
        window.tableId = key;
        localStorage.setItem("tableId", key);

        // Lưu link để dùng khi bắt đầu gọi món
        document
          .getElementById("start-order")
          .setAttribute("data-url", links[key]);
      });

      container.appendChild(btn);
    });

    // Xử lý nút bắt đầu gọi món
    const startBtn = document.getElementById("start-order");
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
});
