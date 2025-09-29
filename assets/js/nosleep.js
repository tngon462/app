async function enableNoSleep() {
  // Nếu có Wake Lock API
  if ('wakeLock' in navigator) {
    try {
      window.wakeLock = await navigator.wakeLock.request("screen");
      console.log("✅ Wake Lock enabled");
      // Tự động renew khi bị mất (ví dụ đổi tab)
      document.addEventListener("visibilitychange", async () => {
        if (document.visibilityState === "visible") {
          try {
            window.wakeLock = await navigator.wakeLock.request("screen");
          } catch (err) {
            console.error("WakeLock renew error:", err);
          }
        }
      });
      return;
    } catch (err) {
      console.warn("Wake Lock API lỗi, fallback video:", err);
    }
  }

  // Nếu không hỗ trợ → phát video hack
  const video = document.createElement("video");
  video.src = "./assets/video/test.mp4"; // file nhỏ 300x400
  video.loop = true;
  video.muted = true;
  video.playsInline = true;
  video.style.display = "none";
  document.body.appendChild(video);

  video.play().then(() => {
    console.log("✅ Video NoSleep chạy để giữ màn hình sáng");
  }).catch((err) => {
    console.warn("Không play được video NoSleep:", err);
  });
}

// Bật NoSleep ngay khi load
document.addEventListener("DOMContentLoaded", enableNoSleep);