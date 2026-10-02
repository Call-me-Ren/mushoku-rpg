// ============================================================
// DRIVE.JS — Google Drive Cloud Save & Sync System
// ============================================================

const DriveSync = {
  CLIENT_ID: '980044734560-qg0t98on7hujgqe763o2h4s2f3lukict.apps.googleusercontent.com',
  SCOPES: 'https://www.googleapis.com/auth/drive.file',
  tokenClient: null,
  accessToken: null,
  saveFileName: 'mushoku_rpg_saves.json',
  fileId: null, // The ID of the save file on Drive

  init() {
    // Check if Google GIS script is loaded
    if (typeof google === 'undefined' || !google.accounts) {
      setTimeout(() => this.init(), 500);
      return;
    }
    
    this.tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: this.CLIENT_ID,
      scope: this.SCOPES,
      callback: (tokenResponse) => {
        if (tokenResponse && tokenResponse.access_token) {
          this.accessToken = tokenResponse.access_token;
          UI.showToast('✅ Đăng nhập Google thành công!', 'success');
          this.checkCloudSave();
        }
      },
    });
  },

  // ---- XÁC THỰC ----
  login() {
    if (!this.tokenClient) {
      UI.showToast('Lỗi: Chưa tải xong thư viện Google.', 'error');
      return;
    }
    this.tokenClient.requestAccessToken({ prompt: 'consent' });
  },

  // ---- ĐỒNG BỘ ----
  async checkCloudSave() {
    if (!this.accessToken) return;
    UI.showToast('Đang kiểm tra Cloud Save...', 'info');
    
    try {
      const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=name='${this.saveFileName}' and trashed=false&spaces=drive`, {
        headers: { 'Authorization': `Bearer ${this.accessToken}` }
      });
      const data = await response.json();
      
      if (data.files && data.files.length > 0) {
        this.fileId = data.files[0].id;
        document.getElementById('cloud-status').innerHTML = `<span style="color:var(--text-gold)">☁️ Đã tìm thấy bản lưu trên Cloud!</span>`;
        document.getElementById('btn-sync-down').style.display = 'inline-block';
        document.getElementById('btn-sync-up').style.display = 'inline-block';
      } else {
        document.getElementById('cloud-status').innerHTML = `<span style="color:#aaa">☁️ Chưa có bản lưu nào trên Cloud.</span>`;
        document.getElementById('btn-sync-down').style.display = 'none';
        document.getElementById('btn-sync-up').style.display = 'inline-block';
      }
      document.getElementById('btn-google-login').style.display = 'none';
    } catch (e) {
      console.error(e);
      UI.showToast('Lỗi khi kiểm tra Cloud Save!', 'error');
    }
  },

  async uploadSave() {
    if (!this.accessToken) return;
    UI.setLoading(true);
    
    // Thu thập tất cả 3 slot save
    const allSaves = {};
    for (let i = 0; i < 3; i++) {
      const slotData = GameState.loadFromSlot(i);
      if (slotData) allSaves[`slot_${i}`] = slotData;
    }
    
    const fileContent = JSON.stringify(allSaves);
    const metadata = {
      name: this.saveFileName,
      mimeType: 'application/json'
    };

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', new Blob([fileContent], { type: 'application/json' }));

    try {
      let url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
      let method = 'POST';
      
      // Nếu file đã có, update nó
      if (this.fileId) {
        url = `https://www.googleapis.com/upload/drive/v3/files/${this.fileId}?uploadType=multipart`;
        method = 'PATCH';
      }

      const res = await fetch(url, {
        method: method,
        headers: { 'Authorization': `Bearer ${this.accessToken}` },
        body: form
      });
      
      const data = await res.json();
      if (data.id) this.fileId = data.id;
      
      UI.setLoading(false);
      UI.showToast('☁️ Đã đồng bộ Save lên Google Drive!', 'success');
      this.checkCloudSave();
    } catch (e) {
      console.error(e);
      UI.setLoading(false);
      UI.showToast('Lỗi khi upload lên Cloud!', 'error');
    }
  },

  async downloadSave() {
    if (!this.accessToken || !this.fileId) return;
    UI.setLoading(true);
    
    try {
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${this.fileId}?alt=media`, {
        headers: { 'Authorization': `Bearer ${this.accessToken}` }
      });
      const allSaves = await res.json();
      
      // Ghi đè vào LocalStorage
      for (let i = 0; i < 3; i++) {
        const slotKey = `slot_${i}`;
        if (allSaves[slotKey]) {
          localStorage.setItem(`rpg_save_${i}`, JSON.stringify(allSaves[slotKey]));
        } else {
          localStorage.removeItem(`rpg_save_${i}`);
        }
      }
      
      UI.setLoading(false);
      UI.showToast('☁️ Đã tải Save từ Google Drive về máy!', 'success');
      UI.showSaveLoad(); // Refresh modal
    } catch (e) {
      console.error(e);
      UI.setLoading(false);
      UI.showToast('Lỗi khi tải từ Cloud!', 'error');
    }
  }
};

window.addEventListener('DOMContentLoaded', () => {
  DriveSync.init();
});
