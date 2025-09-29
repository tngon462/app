class NoSleepTest {
  constructor() {
    this.video = null;
  }

  enable() {
    if (this.video) return; // đã bật rồi thì thôi

    // Tạo element video test
    this.video = document.createElement("video");
    this.video.src = "./assets/video/test.mp4";
    this.video.width = 300;
    this.video.height = 400;
    this.video.muted = true;
    this.video.loop = true;
    this.video.autoplay = true;
    this.video.playsInline = true;
    this.video.style.position = "fixed";
    this.video.style.bottom = "10px";
    this.video.style.right = "10px";
    this.video.style.zIndex = "9999";
    this.video.style.border = "2px solid red";
    this.video.style.background = "black";

    document.body.appendChild(this.video);

    const playPromise = this.video.play();
    if (playPromise !== undefined) {
      playPromise.then(() => {
        console.log("▶️ NoSleepTest video is playing");
      }).catch(err => {
        console.warn("⚠️ Không autoplay được video:", err);
      });
    }
  }

  disable() {
    if (this.video) {
      this.video.pause();
      this.video.remove();
      this.video = null;
      console.log("⏹ NoSleepTest disabled");
    }
  }
}

// Khởi tạo để có thể gọi từ redirect.html
window.noSleepTest = new NoSleepTest();