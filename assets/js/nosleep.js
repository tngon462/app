// nosleep.js
let nosleepVideo = null;

function enableWake() {
  if (!nosleepVideo) {
    nosleepVideo = document.createElement('video');
    nosleepVideo.setAttribute('playsinline', '');
    nosleepVideo.setAttribute('webkit-playsinline', '');
    nosleepVideo.muted = true;          // tắt tiếng
    nosleepVideo.loop = true;
    nosleepVideo.autoplay = true;
    nosleepVideo.controls = true;       // hiện control để sếp dễ thấy khi test
    nosleepVideo.style.width = '320px'; // hiện rõ
    nosleepVideo.style.height = '180px';
    nosleepVideo.style.position = 'fixed';
    nosleepVideo.style.bottom = '10px';
    nosleepVideo.style.right = '10px';
    nosleepVideo.style.zIndex = '9999';

    // Video thật để test (sếp đặt file test.mp4 trong thư mục assets/video/)
    nosleepVideo.src = "./assets/video/test.mp4";

    document.body.appendChild(nosleepVideo);

    nosleepVideo.play().then(() => {
      console.log("[NoSleep] Wake mode: video đang phát, iPad sẽ KHÔNG sleep");
    }).catch(err => {
      console.log("[NoSleep] Lỗi khi phát video:", err);
    });
  } else {
    console.log("[NoSleep] Wake mode đã bật rồi");
  }
}

function disableWake() {
  if (nosleepVideo) {
    try {
      nosleepVideo.pause();
      nosleepVideo.remove();
      console.log("[NoSleep] Sleep mode: video dừng, iPad sẽ auto-lock theo cài đặt (2 phút)");
    } catch (e) {
      console.log("[NoSleep] Lỗi khi dừng video:", e);
    }
    nosleepVideo = null;
  } else {
    console.log("[NoSleep] Sleep mode đã bật (không có video)");
  }
}

function scheduleNoSleep() {
  const now = new Date();
  const hour = now.getHours();

  if (hour >= 10 && hour < 22) {
    console.log("[NoSleep] Giờ hiện tại:", hour, "→ Bật Wake mode (luôn sáng)");
    enableWake();
  } else {
    console.log("[NoSleep] Giờ hiện tại:", hour, "→ Bật Sleep mode (theo Auto-Lock)");
    disableWake();
  }

  // Kiểm tra lại sau 5 phút
  setTimeout(scheduleNoSleep, 5 * 60 * 1000);
}

document.addEventListener("DOMContentLoaded", () => {
  console.log("[NoSleep] Khởi động nosleep.js (bản test video thật)");
  scheduleNoSleep();
});
