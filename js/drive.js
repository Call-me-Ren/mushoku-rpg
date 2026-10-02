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

  init(retryCount = 0) {
    // Thử lấy token từ sessionStorage trước
    const savedToken = sessionStorage.getItem('rpg_drive_token');
    if (savedToken) {
      this.accessToken = savedToken;
    }

    // Check if Google GIS script is loaded
    if (typeof google === 'undefined' || !google.accounts) {
      if (retryCount < 10) {
        setTimeout(() => this.init(retryCount + 1), 500);
      } else {
        console.warn('[DriveSync] Google GIS không load được. Cloud save bị vô hiệu hóa.');
      }
      return;
    }
    
    this.tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: this.CLIENT_ID,
      scope: this.SCOPES,
      callback: (tokenResponse) => {
        if (tokenResponse && tokenResponse.access_token) {
          this.accessToken = tokenResponse.access_token;
          sessionStorage.setItem('rpg_drive_token', this.accessToken);
          UI.showToast('✅ Đăng nhập Google thành công!', 'success');
          this.checkCloudSave();
        }
      },
    });

    // Nếu đã có token từ session trước, thử lấy file id ngay
    if (this.accessToken) {
      this.checkCloudSave();
    }
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

  async _getOrCreateFolder(folderName, parentId = null) {
    let query = `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed=false`;
    if (parentId) query += ` and '${parentId}' in parents`;
    
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}`, {
      headers: { 'Authorization': `Bearer ${this.accessToken}` }
    });
    const data = await res.json();
    if (data.files && data.files.length > 0) return data.files[0].id;

    // Folder doesn't exist, create it
    const metadata = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentId ? [parentId] : undefined
    };
    
    const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify(metadata)
    });
    const createData = await createRes.json();
    return createData.id;
  },

  async uploadSave() {
    if (!this.accessToken) return;
    UI.setLoading(true);
    
    // Thu thập tất cả 3 slot save
    const allSaves = {};
    for (let i = 0; i < 3; i++) {
      const raw = localStorage.getItem(`rpg_save_${i}`);
      if (raw) {
        try {
          allSaves[`slot_${i}`] = JSON.parse(raw);
        } catch (_) {}
      }
    }
    
    const fileContent = JSON.stringify(allSaves);
    let metadata = {
      name: this.saveFileName,
      mimeType: 'application/json'
    };

    try {
      let url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
      let method = 'POST';
      
      // Nếu file ĐÃ có, update nó (PATCH)
      if (this.fileId) {
        url = `https://www.googleapis.com/upload/drive/v3/files/${this.fileId}?uploadType=multipart`;
        method = 'PATCH';
      } else {
        // Nếu file CHƯA có, tạo thư mục MUSHOKU RPG -> Saves rồi nhét file vào đó
        UI.showToast('Đang tạo cấu trúc thư mục trên Drive...', 'info');
        const mainFolderId = await this._getOrCreateFolder('MUSHOKU RPG');
        const savesFolderId = await this._getOrCreateFolder('Saves', mainFolderId);
        metadata.parents = [savesFolderId];
      }

      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', new Blob([fileContent], { type: 'application/json' }));

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
