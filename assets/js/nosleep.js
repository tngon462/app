// assets/js/nosleep.js

let wakeLock = null;

// Hàm xin giữ màn hình sáng
async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      console.log("✅ Wake Lock đã bật");
      wakeLock.addEventListener("release", () => {
        console.log("⚠️ Wake Lock đã tắt");
      });
    } else {
      console.warn("❌ Trình duyệt không hỗ trợ Wake Lock API");
    }
  } catch (err) {
    console.error("Lỗi Wake Lock:", err);
  }
}

// Khi người dùng chạm/mở lại tab → xin lại Wake Lock
document.addEventListener("visibilitychange", () => {
  if (wakeLock !== null && document.visibilityState === "visible") {
    requestWakeLock();
  }
});

// Gọi ngay khi load trang
requestWakeLock();
