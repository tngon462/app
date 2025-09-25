// nosleep.js
let nosleepVideo = null;

function enableWake() {
  if (!nosleepVideo) {
    nosleepVideo = document.createElement('video');
    nosleepVideo.setAttribute('playsinline', '');
    nosleepVideo.muted = true;
    nosleepVideo.loop = true;
    nosleepVideo.autoplay = true;
    nosleepVideo.style.width = '1px';
    nosleepVideo.style.height = '1px';
    nosleepVideo.style.opacity = '0';
    nosleepVideo.style.position = 'fixed';
    nosleepVideo.style.bottom = '0';
    nosleepVideo.style.left = '0';
    // TODO: thay src = file mp4 silent loop ngắn trong /assets/video/
    nosleepVideo.src = "data:video/mp4;base64,AAAA..."; 
    document.body.appendChild(nosleepVideo);
    nosleepVideo.play().catch(e => console.log("NoSleep play error:", e));
    console.log("[NoSleep] Wake bật");
  }
}

function disableWake() {
  if (nosleepVideo) {
    try {
      nosleepVideo.pause();
      nosleepVideo.remove();
    } catch (e) {}
    nosleepVideo = null;
    console.log("[NoSleep] Sleep bật (theo Auto-Lock hệ thống)");
  }
}

function handleNoSleepCommand(cmd) {
  if (cmd === "blackout_on") {
    disableWake(); // Khi tắt màn hình giả → cho phép sleep
  } else if (cmd === "blackout_off") {
    enableWake();  // Khi mở màn hình lại → giữ sáng
  }
}
