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
});