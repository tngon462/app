// state.js
document.addEventListener("DOMContentLoaded", () => {
  const tableId = localStorage.getItem("tableId");
  const tableUrl = localStorage.getItem("tableUrl");

  if (tableId && tableUrl) {
    document.getElementById("select-table").classList.add("hidden");
    document.getElementById("start-screen").classList.remove("hidden");
    document.getElementById("selected-table").textContent = tableId;
    document
      .getElementById("start-order")
      .setAttribute("data-url", tableUrl);

    // ✅ quan trọng: set global cho blackout.js
    window.tableId = tableId;
  }
});
