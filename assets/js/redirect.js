const tableContainer = document.getElementById("table-container");
const linksUrl = "links.json";

async function loadTables() {
  try {
    const res = await fetch(linksUrl);
    if (!res.ok) throw new Error("HTTP " + res.status);

    const data = await res.json();

    // data là object -> duyệt key/value
    tableContainer.innerHTML = "";

    Object.entries(data).forEach(([key, link]) => {
      const btn = document.createElement("button");
      btn.textContent = "Bàn " + key;
      btn.className =
        "px-4 py-2 m-2 rounded-lg bg-red-500 text-white font-bold hover:bg-red-600";

      btn.onclick = () => {
        window.location.href = link;
      };

      tableContainer.appendChild(btn);
    });
  } catch (err) {
    tableContainer.innerHTML =
      "<p style='color:red'>Lỗi tải links.json: " + err + "</p>";
    console.error("Lỗi load JSON:", err);
  }
}

document.addEventListener("DOMContentLoaded", loadTables);
