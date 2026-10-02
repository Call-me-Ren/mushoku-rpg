window.AudioManager = {
  audio: null,
  isPlaying: false,

  PRESETS: {
    'adventure': { url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3',  name: '🌄 Phiêu lưu kỳ ảo' },
    'tavern':    { url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',  name: '🍺 Quán trọ ấm cúng' },
    'combat':    { url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',  name: '⚔️ Chiến đấu kịch tính' },
    'acoustic':  { url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3',  name: '🌙 Tâm tình buổi tối' },
  },

  init() {
    this.audio = new Audio();
    this.audio.loop = true;
    this.audio.volume = parseFloat(localStorage.getItem('bgm_volume') || '0.3');

    // Cập nhật UI khi audio thực sự bắt đầu phát
    this.audio.addEventListener('playing', () => {
      this.isPlaying = true;
      this._updateBtn(true);
      this._setStatus('🎵 Đang phát...');
    });
    this.audio.addEventListener('pause', () => {
      this.isPlaying = false;
      this._updateBtn(false);
      this._setStatus('⏸ Đã dừng');
    });
    this.audio.addEventListener('error', () => {
      this._setStatus('❌ Không tải được nhạc');
      if (window.UI) UI.showToast('Không tải được nhạc. Thử chọn bài khác.', 'error');
    });
    this.audio.addEventListener('waiting', () => this._setStatus('⏳ Đang tải...'));

    // Play/Pause button
    const playBtn = document.getElementById('bgm-play-pause');
    if (playBtn) {
      playBtn.addEventListener('click', () => {
        if (!this.audio.src) {
          if (window.UI) UI.showToast('Chọn một bản nhạc trước!', 'warning');
          return;
        }
        if (this.isPlaying) {
          this.audio.pause();
        } else {
          this.audio.play().catch(() => this._setStatus('❌ Trình duyệt chặn phát'));
        }
      });
    }

    // BGM Volume slider
    const volSlider = document.getElementById('bgm-volume');
    if (volSlider) {
      volSlider.value = this.audio.volume;
      volSlider.addEventListener('input', (e) => {
        this.audio.volume = parseFloat(e.target.value);
        localStorage.setItem('bgm_volume', this.audio.volume);
      });
    }

    // Preset select
    const select = document.getElementById('bgm-select');
    if (select) {
      const saved = localStorage.getItem('bgm_choice') || '';
      if (saved && [...select.options].find(o => o.value === saved)) {
        select.value = saved;
        this._loadPreset(saved);
      }
      select.addEventListener('change', (e) => {
        localStorage.setItem('bgm_choice', e.target.value);
        this._loadPreset(e.target.value);
      });
    }

    // Custom link load button
    const loadBtn = document.getElementById('bgm-load-btn');
    const linkInput = document.getElementById('bgm-link');
    if (loadBtn && linkInput) {
      const savedCustom = localStorage.getItem('bgm_custom_url') || '';
      if (savedCustom) linkInput.value = savedCustom;
      loadBtn.addEventListener('click', () => {
        const url = linkInput.value.trim();
        if (!url) { if (window.UI) UI.showToast('Nhập link MP3 trước!', 'warning'); return; }
        localStorage.setItem('bgm_custom_url', url);
        this._setTrackName('🔗 Link tùy chỉnh');
        this._loadAndPlay(url);
      });
    }
  },

  _loadPreset(val) {
    const customContainer = document.getElementById('custom-bgm-container');
    if (customContainer) customContainer.style.display = (val === 'custom') ? 'flex' : 'none';

    if (val === 'custom') {
      this.audio.pause();
      this._setStatus('Nhập link rồi bấm ▶ Tải & Phát');
      this._setTrackName('🔗 Link tùy chỉnh');
      return;
    }
    if (!val) {
      this.audio.pause();
      this.audio.src = '';
      this._setStatus('— chọn nhạc bên trên —');
      this._setTrackName('Chưa chọn bài nhạc');
      return;
    }
    const preset = this.PRESETS[val];
    if (preset) {
      this._setTrackName(preset.name);
      this._loadAndPlay(preset.url);
    }
  },

  _loadAndPlay(url) {
    this.audio.src = url;
    this.audio.load();
    this._setStatus('⏳ Đang tải...');
    this.audio.play().catch(() => {
      // Autoplay bị chặn — user bấm nút ▶ để phát
      this._setStatus('▶ Bấm nút để phát');
    });
  },

  _updateBtn(playing) {
    const btn = document.getElementById('bgm-play-pause');
    if (btn) btn.textContent = playing ? '⏸' : '▶';
  },

  _setStatus(text) {
    const el = document.getElementById('bgm-status');
    if (el) el.textContent = text;
  },

  _setTrackName(name) {
    const el = document.getElementById('bgm-track-name');
    if (el) el.textContent = name;
  },
};
