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
    
    // YouTube API callback
    window.onYouTubeIframeAPIReady = () => {
      this.isApiReady = true;
      this.ytPlayer = new YT.Player('yt-player', {
        height: '0',
        width: '0',
        playerVars: {
          autoplay: 0,
          loop: 1,
          controls: 0,
          showinfo: 0,
          autohide: 1,
          modestbranding: 1
        },
        events: {
          onReady: (e) => {
            this._updateVolume();
            // Start playing if a track was selected before API was ready
            if (this.currentVid) {
              this.ytPlayer.loadVideoById(this.currentVid);
            }
          },
          onStateChange: (e) => {
            // If ended (0), play again for loop
            if (e.data === YT.PlayerState.ENDED) {
              this.ytPlayer.playVideo();
            }
          }
        }
      });
    };
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
