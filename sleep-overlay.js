<script>
(() => {
  const SleepOverlay = {
    cfg: {
      idleMs: 60000,                  // 60s không thao tác => tự bật overlay
      reShowMsAfterExit: 60000,       // 60s sau khi thoát tạm thời => bật lại
      blackImageSrc: './assets/black.jpg'
    },
    state: {
      idleTimer: null,
      reShowTimer: null,
      isVisible: false,
      installed: false
    },

    init(userCfg = {}) {
      if (this.state.installed) return;
      Object.assign(this.cfg, userCfg);

      // Tạo overlay
      const overlay = document.createElement('div');
      overlay.id = 'sleepOverlay';

      const img = document.createElement('img');
      img.alt = '';
      img.src = this.cfg.blackImageSrc;

      const hotCorner = document.createElement('div');
      hotCorner.className = 'hot-corner';

      overlay.appendChild(img);
      overlay.appendChild(hotCorner);
      document.body.appendChild(overlay);

      // Chặn cuộn/zoom khi overlay mở
      overlay.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
      overlay.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });

      // Bấm vào góc “hot” để ẩn overlay tạm thời 60s
      hotCorner.addEventListener('pointerdown', () => {
        if (!this.state.isVisible) return;
        this.hide();                        // ẩn ngay
        this._scheduleReShow();             // 60s sau hiện lại
      });

      // Nếu người dùng đụng vào overlay ngoài hot-corner thì không làm gì
      // (mục tiêu: che đen tuyệt đối)

      // Lắng nghe thao tác để reset idle
      const resetter = this.resetIdle.bind(this);
      ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'].forEach(ev =>
        window.addEventListener(ev, resetter, { passive: true })
      );

      // Tab ẩn/hiện
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          // Khi chuyển nền, tránh bật overlay gây khó chịu
          this._clearIdle();
        } else {
          this.resetIdle(); // quay lại trang => đếm lại
        }
      });

      // Khởi động đếm idle
      this.resetIdle();
      this.state.installed = true;

      // Public API (tùy sếp gọi thủ công nếu cần)
      window.SleepOverlay = {
        show: this.show.bind(this),
        hide: this.hide.bind(this),
        resetIdle: this.resetIdle.bind(this),
        config: this.cfg
      };
    },

    show() {
      if (this.state.isVisible) return;
      this._clearIdle();
      const el = document.getElementById('sleepOverlay');
      if (el) {
        el.style.display = 'flex';
        this.state.isVisible = true;
        // Khi đã đen màn, không set reShowTimer ở đây
        // Chỉ khi user cố “thoát tạm” (tap hot-corner) mới set
      }
    },

    hide() {
      if (!this.state.isVisible) return;
      const el = document.getElementById('sleepOverlay');
      if (el) {
        el.style.display = 'none';
        this.state.isVisible = false;
      }
      // Sau khi hide thủ công (tap hot-corner), slideshow/menu hoạt động bình thường
    },

    resetIdle() {
      // Nếu overlay đang hiện và người dùng chạm lung tung bên ngoài hot corner, vẫn giữ đen
      if (this.state.isVisible) return;

      this._clearIdle();
      this.state.idleTimer = setTimeout(() => {
        // Hết hạn không thao tác => bật overlay
        this.show();
      }, this.cfg.idleMs);
    },

    _scheduleReShow() {
      this._clearReShow();
      this.state.reShowTimer = setTimeout(() => {
        this.show();
      }, this.cfg.reShowMsAfterExit);
    },

    _clearIdle() {
      if (this.state.idleTimer) {
        clearTimeout(this.state.idleTimer);
        this.state.idleTimer = null;
      }
    },

    _clearReShow() {
      if (this.state.reShowTimer) {
        clearTimeout(this.state.reShowTimer);
        this.state.reShowTimer = null;
      }
    }
  };

  // Tự động init khi DOM sẵn sàng – không phá code cũ
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => SleepOverlay.init());
  } else {
    SleepOverlay.init();
  }
})();
</script>
