const tableContainer = document.getElementById("table-container");
const linksUrl = "./links.json";

async function loadTables() {
  try {
    console.log("🔍 Bắt đầu tải:", linksUrl);

    const res = await fetch(linksUrl);
    console.log("📡 Kết quả fetch:", res.status, res.statusText);

    if (!res.ok) throw new Error("HTTP " + res.status);

    const data = await res.json();
    console.log("✅ Dữ liệu JSON nhận được:", data);

    // Reset container
    tableContainer.innerHTML = "";

    // Duyệt object
    Object.entries(data).forEach(([key, link]) => {
      console.log(`➡️ Thêm nút cho bàn ${key}: ${link}`);

      const btn = document.createElement("button");
      btn.textContent = "Bàn " + key;
      btn.className =
        "px-4 py-2 m-2 rounded-lg bg-green-500 text-white font-bold hover:bg-green-600 w-24 h-16 text-lg";

      btn.onclick = () => {
        console.log(`🟢 Click Bàn ${key} → ${link}`);
        alert("Chọn " + key + "\n" + link);
      };

      tableContainer.appendChild(btn);
    });

    console.log("🎉 Hoàn tất load bàn");
  } catch (err) {
    tableContainer.innerHTML =
      "<p style='color:red'>Lỗi tải links.json: " + err + "</p>";
    console.error("❌ Lỗi load JSON:", err);
  }
}

document.addEventListener("DOMContentLoaded", loadTables);
