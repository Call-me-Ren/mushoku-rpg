/**
 * AudioManager — HTML5 Audio BGM system
 * Dùng HTML5 <audio> với link MP3 trực tiếp.
 * Preset tracks từ nguồn free (Pixabay CDN - không cần CORS, không bị chặn).
 */
window.AudioManager = {
  audio: null,
  volume: parseFloat(localStorage.getItem('bgm_volume') || '0.2'),
  currentUrl: null,

  // Danh sách nhạc nền miễn phí, trực tiếp (MP3 CDN)
  PRESETS: {
    'adventure': 'https://cdn.pixabay.com/download/audio/2022/03/24/audio_5985524d53.mp3',
    'tavern':    'https://cdn.pixabay.com/download/audio/2022/10/30/audio_b3c7a75f10.mp3',
    'combat':    'https://cdn.pixabay.com/download/audio/2023/03/09/audio_83aa4a7462.mp3',
    'forest':    'https://cdn.pixabay.com/download/audio/2022/11/22/audio_5a31d9e6e5.mp3',
    'mystery':   'https://cdn.pixabay.com/download/audio/2022/10/25/audio_e0b2e73e62.mp3',
  },

  init() {
    // Tạo HTML5 Audio element
    this.audio = new Audio();
    this.audio.loop = true;
    this.audio.volume = this.volume;

    this.audio.addEventListener('error', (e) => {
      console.error('BGM Error:', e);
      if (window.UI) UI.showToast('Không thể phát nhạc. Thử link MP3 trực tiếp khác.', 'error');
    });

    // Volume slider
    const volSlider = document.getElementById('bgm-volume');
    if (volSlider) {
      volSlider.value = this.volume;
      volSlider.addEventListener('input', (e) => {
        this.volume = parseFloat(e.target.value);
        localStorage.setItem('bgm_volume', this.volume);
        if (this.audio) this.audio.volume = this.volume;
      });
    }

    // Preset select
    const select = document.getElementById('bgm-select');
    if (select) {
      const saved = localStorage.getItem('bgm_choice') || '';
      if (saved && [...select.options].find(o => o.value === saved)) {
        select.value = saved;
      }
      this._handleSelectChange(select.value);

      select.addEventListener('change', (e) => {
        localStorage.setItem('bgm_choice', e.target.value);
        this._handleSelectChange(e.target.value);
      });
    }

    // Custom link play button
    const playBtn = document.getElementById('bgm-play-btn');
    const customLink = document.getElementById('bgm-link');
    if (playBtn && customLink) {
      const saved = localStorage.getItem('bgm_custom_url') || '';
      if (saved) customLink.value = saved;

      playBtn.addEventListener('click', () => {
        const url = customLink.value.trim();
        if (!url) return;
        localStorage.setItem('bgm_custom_url', url);
        this.play(url);
      });
    }
  },

  _handleSelectChange(val) {
    const customContainer = document.getElementById('custom-bgm-container');
    if (!customContainer) return;

    if (val === 'custom') {
      customContainer.style.display = 'flex';
      this.stop();
    } else if (val === '' || !val) {
      customContainer.style.display = 'none';
      this.stop();
    } else {
      customContainer.style.display = 'none';
      const url = this.PRESETS[val] || val;
      this.play(url);
    }
  },

  play(url) {
    if (!url || !this.audio) return;
    this.currentUrl = url;
    this.audio.pause();
    this.audio.src = url;
    this.audio.volume = this.volume;
    this.audio.load();

    const playPromise = this.audio.play();
    if (playPromise !== undefined) {
      playPromise.catch(err => {
        console.error('BGM play error:', err);
        if (window.UI) UI.showToast('Trình duyệt chặn tự động phát. Hãy nhấn ▶ một lần để bắt đầu.', 'warning');
      });
    }
  },

  stop() {
    this.currentUrl = null;
    if (this.audio) {
      this.audio.pause();
      this.audio.src = '';
    }
  }
};
