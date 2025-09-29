let noSleepVideo = null;

function startNoSleep() {
  // Nếu trình duyệt hỗ trợ Wake Lock API
  if ('wakeLock' in navigator) {
    navigator.wakeLock.request("screen").then(lock => {
      window.wakeLock = lock;
      console.log("✅ WakeLock enabled");
    }).catch(err => {
      console.warn("WakeLock error:", err);
    });
  } else {
    // Fallback dùng video hack
    if (!noSleepVideo) {
      noSleepVideo = document.createElement("video");
      noSleepVideo.src = "./assets/video/test.mp4"; // file video nhỏ
      noSleepVideo.loop = true;
      noSleepVideo.muted = true;
      noSleepVideo.playsInline = true;
      noSleepVideo.style.display = "none";
      document.body.appendChild(noSleepVideo);
    }
    noSleepVideo.play().then(() => {
      console.log("▶ Video NoSleep chạy");
    }).catch(err => {
      console.warn("Không play được video NoSleep:", err);
    });
  }
}

function stopNoSleep() {
  if (window.wakeLock) {
    try { window.wakeLock.release(); } catch(_) {}
    window.wakeLock = null;
    console.log("❌ WakeLock released");
  }
  if (noSleepVideo) {
    noSleepVideo.pause();
    console.log("⏸ Video NoSleep paused");
  }
}

// Tự động bật NoSleep khi load
document.addEventListener("DOMContentLoaded", startNoSleep);

// Cho blackout.js gọi
window.NoSleepControl = { start: startNoSleep, stop: stopNoSleep };