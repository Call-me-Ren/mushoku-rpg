/**
 * AudioManager — HTML5 Audio BGM system
 * Dùng <audio controls> hiện ra cho user bấm play trực tiếp.
 * Preset tracks từ bensound.com (free, CORS ok).
 */
window.AudioManager = {
  player: null,

  // Links MP3 từ bensound.com — free to use, không bị CORS
  PRESETS: {
    'adventure': 'https://www.bensound.com/bensound-music/bensound-adventure.mp3',
    'tavern':    'https://www.bensound.com/bensound-music/bensound-acousticbreeze.mp3',
    'combat':    'https://www.bensound.com/bensound-music/bensound-epic.mp3',
    'acoustic':  'https://www.bensound.com/bensound-music/bensound-romantic.mp3',
  },

  init() {
    this.player = document.getElementById('bgm-player');
    if (!this.player) return;

    // Restore volume
    const savedVol = parseFloat(localStorage.getItem('bgm_volume') || '0.3');
    this.player.volume = savedVol;

    // Track volume changes from the native audio control
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
      // Load track based on current selection (don't autoplay — let user press play)
      this._applySelect(select.value);

      select.addEventListener('change', (e) => {
        localStorage.setItem('bgm_choice', e.target.value);
        this._applySelect(e.target.value);
      });
    }

    // Custom link play button
    const playBtn = document.getElementById('bgm-play-btn');
    const linkInput = document.getElementById('bgm-link');
    if (playBtn && linkInput) {
      const savedCustom = localStorage.getItem('bgm_custom_url') || '';
      if (savedCustom) linkInput.value = savedCustom;

      playBtn.addEventListener('click', () => {
        const url = linkInput.value.trim();
        if (!url) {
          if (window.UI) UI.showToast('Nhập link MP3 trước!', 'warning');
          return;
        }
        localStorage.setItem('bgm_custom_url', url);
        this._setSource(url);
        this.player.play().catch(() => {
          if (window.UI) UI.showToast('Không load được link. Hãy dùng link MP3 trực tiếp (đuôi .mp3)', 'error');
        });
      });
    }
  },

  _applySelect(val) {
    const customContainer = document.getElementById('custom-bgm-container');
    if (!customContainer) return;

    if (val === 'custom') {
      customContainer.style.display = 'flex';
      this._setSource('');
    } else if (!val) {
      customContainer.style.display = 'none';
      this._setSource('');
      if (this.player) this.player.pause();
    } else {
      customContainer.style.display = 'none';
      const url = this.PRESETS[val];
      if (url) this._setSource(url);
      // Thử autoplay sau khi user đã tương tác với trang
      if (this.player && url) {
        this.player.play().catch(() => {
          // Browser blocked autoplay — user sẽ thấy nút play trong <audio controls>
        });
      }
    }
  },

  _setSource(url) {
    if (!this.player) return;
    if (this.player.src !== url) {
      this.player.src = url;
      if (url) this.player.load();
    }
  },
};
