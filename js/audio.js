window.AudioManager = {
  player: null,

  // SoundHelix.com — trang demo audio public, CORS mở hoàn toàn, không bị chặn hotlink
  PRESETS: {
    'adventure': 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3',
    'tavern':    'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
    'combat':    'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    'acoustic':  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3',
  },

  init() {
    this.player = document.getElementById('bgm-player');
    if (!this.player) return;

    // Khôi phục volume đã lưu
    const savedVol = parseFloat(localStorage.getItem('bgm_volume') || '0.3');
    this.player.volume = savedVol;

    // Lưu volume khi user kéo thanh trên audio player
    this.player.addEventListener('volumechange', () => {
      localStorage.setItem('bgm_volume', this.player.volume);
    });

    // Preset select
    const select = document.getElementById('bgm-select');
    if (select) {
      const saved = localStorage.getItem('bgm_choice') || '';
      if (saved && [...select.options].find(o => o.value === saved)) {
        select.value = saved;
      }
      this._applySelect(select.value);
      select.addEventListener('change', (e) => {
        localStorage.setItem('bgm_choice', e.target.value);
        this._applySelect(e.target.value);
      });
    }

    // Custom link
    const playBtn = document.getElementById('bgm-play-btn');
    const linkInput = document.getElementById('bgm-link');
    if (playBtn && linkInput) {
      const savedCustom = localStorage.getItem('bgm_custom_url') || '';
      if (savedCustom) linkInput.value = savedCustom;
      playBtn.addEventListener('click', () => {
        const url = linkInput.value.trim();
        if (!url) { if (window.UI) UI.showToast('Nhập link MP3 trước!', 'warning'); return; }
        localStorage.setItem('bgm_custom_url', url);
        this.player.src = url;
        this.player.load();
        this.player.play().catch(() => {});
      });
    }
  },

  _applySelect(val) {
    const customContainer = document.getElementById('custom-bgm-container');
    if (!customContainer || !this.player) return;

    if (val === 'custom') {
      customContainer.style.display = 'flex';
      this.player.pause();
      this.player.src = '';
    } else if (!val) {
      customContainer.style.display = 'none';
      this.player.pause();
      this.player.src = '';
    } else {
      customContainer.style.display = 'none';
      const url = this.PRESETS[val];
      if (url && this.player.src !== url) {
        this.player.src = url;
        this.player.load();
      }
      this.player.play().catch(() => {
        // Browser blocked autoplay — user bấm ▶ trên thanh player là nghe được
      });
    }
  },
};
