window.AudioManager = {
  ytPlayer: null,
  isApiReady: false,
  currentVid: null,
  volume: parseFloat(localStorage.getItem('bgm_volume') || '0.2'),
  
  init() {
    const select = document.getElementById('bgm-select');
    const volSlider = document.getElementById('bgm-volume');
    const customContainer = document.getElementById('custom-bgm-container');
    const customLink = document.getElementById('bgm-link');
    const playBtn = document.getElementById('bgm-play-btn');

    if (volSlider) {
      volSlider.value = this.volume;
      volSlider.addEventListener('input', (e) => {
        this.volume = parseFloat(e.target.value);
        localStorage.setItem('bgm_volume', this.volume);
        this._updateVolume();
      });
    }

    if (select) {
      const savedBgm = localStorage.getItem('bgm_choice');
      if (savedBgm) {
        select.value = savedBgm;
      }
      
      this._handleSelectChange(select.value);

      select.addEventListener('change', (e) => {
        localStorage.setItem('bgm_choice', e.target.value);
        this._handleSelectChange(e.target.value);
      });
    }

    if (playBtn && customLink) {
      playBtn.addEventListener('click', () => {
        this.playCustom(customLink.value);
      });
    }
    
    // Check if API is already loaded
    if (window.YT && window.YT.Player) {
      this._initYTPlayer();
    }
  },

  _initYTPlayer() {
    if (this.ytPlayer) return; // Already initialized
    this.isApiReady = true;
    this.ytPlayer = new YT.Player('yt-player', {
      height: '1',
      width: '1',
      playerVars: {
        autoplay: 1,
        loop: 1,
        controls: 0,
        showinfo: 0,
        autohide: 1,
        modestbranding: 1,
        origin: window.location.origin
      },
      events: {
        onReady: (e) => {
          this._updateVolume();
          if (this.currentVid) {
            this.ytPlayer.loadVideoById(this.currentVid);
          }
        },
        onStateChange: (e) => {
          if (e.data === YT.PlayerState.ENDED) {
            this.ytPlayer.playVideo();
          }
        },
        onError: (e) => {
          console.error("YouTube Player Error:", e.data);
          if (window.UI) UI.showToast('Không thể phát bài hát này (có thể do bản quyền).', 'error');
        }
      }
    });
  },

  _handleSelectChange(val) {
    const customContainer = document.getElementById('custom-bgm-container');
    if (!customContainer) return;
    
    if (val === 'custom') {
      customContainer.style.display = 'flex';
      this.stop();
    } else if (val === '') {
      customContainer.style.display = 'none';
      this.stop();
    } else {
      customContainer.style.display = 'none';
      this.playCustom(val);
    }
  },

  playCustom(link) {
    if (!link) return;
    
    let vidId = '';
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = link.match(regExp);
    if (match && match[2].length === 11) {
      vidId = match[2];
    } else if (link.length === 11) {
      vidId = link; // User pasted ID
    }

    if (vidId) {
      this.currentVid = vidId;
      if (this.isApiReady && this.ytPlayer && this.ytPlayer.loadVideoById) {
        this.ytPlayer.loadVideoById(vidId);
        this._updateVolume();
      }
    } else {
      if (window.UI) UI.showToast('Link Youtube không hợp lệ.', 'error');
    }
  },

  stop() {
    this.currentVid = null;
    if (this.isApiReady && this.ytPlayer && this.ytPlayer.stopVideo) {
      this.ytPlayer.stopVideo();
    }
  },

  _updateVolume() {
    if (this.isApiReady && this.ytPlayer && this.ytPlayer.setVolume) {
      this.ytPlayer.setVolume(this.volume * 100);
    }
  }
};

// Global callback for YouTube API
window.onYouTubeIframeAPIReady = function() {
  if (window.AudioManager) {
    window.AudioManager._initYTPlayer();
  }
};
