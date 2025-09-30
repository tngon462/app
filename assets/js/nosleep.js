// NoSleep đơn giản (chỉ bật wakeLock nếu có)
let wakeLock = null;

async function requestWakeLock() {
  try {
    if ("wakeLock" in navigator) {
      wakeLock = await navigator.wakeLock.request("screen");
    }
  } catch (err) {
    console.warn("WakeLock fail:", err);
  }
}

document.addEventListener("visibilitychange", () => {
  if (wakeLock !== null && document.visibilityState === "visible") {
    requestWakeLock();
  }
});

requestWakeLock();
