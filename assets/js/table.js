let selectedBan = null;
function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.style.display = "none");
  document.getElementById(id).style.display = "flex";
}
function selectTable(banNumber) {
  selectedBan = banNumber;
  showScreen("start-screen");
}
function startOrder() {
  if (!selectedBan) return alert("Chưa chọn bàn");
  const iframe = document.getElementById("menu-iframe");
  iframe.src = "https://fnb.kiotviet.vn/tngonfnb/pos/#/cashier";
  showScreen("menu-screen");
}
document.addEventListener("DOMContentLoaded", () => {
  showScreen("table-selection-screen");
});