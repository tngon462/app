class NoSleep {
  constructor() {
    this.video = null;
  }

  enable() {
    if (this.video) return; // đã bật thì thôi

    // Tạo video siêu nhỏ, ẩn
    this.video = document.createElement("video");
    this.video.src = "data:video/mp4;base64,AAAAIGZ0eXBpc29tAAAAAGlzb20yYXZjMQAAAAhmcmVlAAAAH21kYXQ=";
    this.video.muted = true;
    this.video.loop = true;
    this.video.autoplay = true;
    this.video.playsInline = true;
    this.video.style.position = "absolute";
    this.video.style.width = "1px";
    this.video.style.height = "1px";
    this.video.style.opacity = "0";
    this.video.style.pointerEvents = "none";

    document.body.appendChild(this.video);

    const playPromise = this.video.play();
    if (playPromise !== undefined) {
      playPromise.catch(err => {
        console.warn("⚠️ Không autoplay được video NoSleep:", err);
      });
    }
  }

  disable() {
    if (this.video) {
      this.video.pause();
      this.video.remove();
      this.video = null;
    }
  }
}

window.noSleep = new NoSleep();