let noSleepVideo = null;

function startNoSleep() {
  if ('wakeLock' in navigator) {
    navigator.wakeLock.request("screen").then(lock => {
      window.wakeLock = lock;
    }).catch(err => {
      console.warn("WakeLock error:", err);
    });
  } else {
    if (!noSleepVideo) {
      noSleepVideo = document.createElement("video");
      noSleepVideo.src = "./assets/video/test.mp4";
      noSleepVideo.loop = true;
      noSleepVideo.muted = true;
      noSleepVideo.playsInline = true;
      noSleepVideo.style.display = "none";
      document.body.appendChild(noSleepVideo);
    }
    noSleepVideo.play().catch(() => {});
  }
}

function stopNoSleep() {
  if (window.wakeLock) {
    try { window.wakeLock.release(); } catch(_) {}
    window.wakeLock = null;
  }
  if (noSleepVideo) noSleepVideo.pause();
}

document.addEventListener("DOMContentLoaded", startNoSleep);
window.NoSleepControl = { start: startNoSleep, stop: stopNoSleep };