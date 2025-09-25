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
    nosleepVideo.src = "data:video/mp4;base64,AAAA..."; 
    // TODO: thay bằng 1 file mp4 siêu ngắn (1s silent) trong /assets/video nếu cần
    document.body.appendChild(nosleepVideo);
    nosleepVideo.play().catch(e => console.log("NoSleep play error:", e));
    console.log("[NoSleep] Wake mode bật");
  }
}

function disableWake() {
  if (nosleepVideo) {
    try {
      nosleepVideo.pause();
      nosleepVideo.remove();
    } catch (e) { console.log(e); }
    nosleepVideo = null;
    console.log("[NoSleep] Sleep mode bật (trở về Auto-Lock hệ thống)");
  }
}

// Lắng nghe lệnh từ admin (giống blackout.js)
function handleNoSleepCommand(cmd) {
  if (cmd === "wake") {
    enableWake();
  } else if (cmd === "sleep") {
    disableWake();
  }
}

// Ví dụ: nếu admin push lệnh qua Firebase/WebSocket
// firebase.database().ref("nosleep").on("value", snap => {
//   handleNoSleepCommand(snap.val());
// });
