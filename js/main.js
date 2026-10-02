// ============================================================
// MAIN.JS — App Coordinator & Event Listeners
// ============================================================

const App = {
  pendingDiceRoll: null, // {modifier, context} waiting for player to roll

  async init() {
    GameState.init();
    this.setupEventListeners();
    this.checkExistingSave();
    this.setupAutoSave();
  },

  // ---- AUTO-SAVE khi đóng trang hoặc reload ----
  setupAutoSave() {
    window.addEventListener('beforeunload', (e) => {
      if (GameState.character) {
        GameState.saveToSlot(0);
      }
      // Nếu Quản Trò chưa phản hồi, nhắc nhở người dùng
      if (GeminiAPI.pendingResponse) {
        e.preventDefault();
        e.returnValue = 'Quản Trò đang phản hồi, bạn có chắc chắn muốn rời không?';
        return e.returnValue;
      }
    });
  },

  checkExistingSave() {
    if (sessionStorage.getItem('rpg_auto_load')) {
      sessionStorage.removeItem('rpg_auto_load');
      setTimeout(() => this.continueGame(), 100);
      return;
    }

    // Check if auto-save exists
    const autoSave = GameState.getSaveInfo(0);
    const banner = document.getElementById('continue-banner');
    
    if (banner) {
      if (autoSave) {
        banner.innerHTML = `
          <div class="continue-content">
            <span>Tiếp tục: <strong>${autoSave.name}</strong> (${autoSave.race} Lv.${autoSave.level}) — ${autoSave.location}</span>
            <button id="continue-btn" class="btn-gold">Tiếp tục hành trình</button>
          </div>`;
        banner.classList.remove('hidden');
        document.getElementById('continue-btn').onclick = () => this.continueGame();
      } else {
        banner.classList.add('hidden');
      }
    }
  },

  continueGame() {
    const data = GameState.loadFromSlot(0);
    if (!data) { UI.showToast('Không tìm thấy save!', 'error'); return; }

    // Auto-prompt API key if missing
    const savedKey = localStorage.getItem('rpg_api_key') || '';
    if (!savedKey) {
      setTimeout(() => {
        UI.showToast('Vui lòng nhập Gemini API Key để tiếp tục chơi!', 'warning');
        UI.showSettings();
      }, 500);
    }

    UI.showScreen('game-screen');
    UI.updateCharacterPanel();
    UI.addSystemMessage('🔄 Đã tải lại hành trình của bạn. Tiếp tục...', 'info');

    // Show last chat history
    this.refreshChatHistory();
  },

  refreshChatHistory() {
    const chat = document.getElementById('story-chat');
    chat.innerHTML = ''; // clear current chat

    let recoveredChoices = [];

    if (GameState.chatHistory.length > 0) {
      const lastFew = GameState.chatHistory.slice(-20); // render more history if possible
      lastFew.forEach((msg, idx) => {
        if (msg.role === 'model') {
          try {
            const parsed = JSON.parse(msg.parts[0].text);
            const realIndex = GameState.chatHistory.length - lastFew.length + idx;
            UI.addDMMessage(parsed.narrative || msg.parts[0].text, null, realIndex);

            // Cố gắng khôi phục choices/suggested_actions từ tin nhắn cuối cùng
            if (parsed.choices && parsed.choices.length > 0) {
              recoveredChoices = parsed.choices;
            } else if (parsed.suggested_actions && parsed.suggested_actions.length > 0) {
              recoveredChoices = parsed.suggested_actions;
            }
          } catch (_) {
            const realIndex = GameState.chatHistory.length - lastFew.length + idx;
            UI.addDMMessage(msg.parts[0].text, null, realIndex);
          }
        } else if (msg.role === 'user') {
          const text = msg.parts[0].text;
          if (!text.startsWith('[BẮT ĐẦU') && !text.startsWith('[HÀNH ĐỘNG]') && !text.startsWith('[KẾT QUẢ DICE]')) return;
          
          if (text.startsWith('[HÀNH ĐỘNG]')) {
            const actionText = text.replace('[HÀNH ĐỘNG] ', '').split('\n')[0];
            UI.addPlayerMessage(actionText);
          }
          
          if (text.includes('[KẾT QUẢ DICE]')) {
            const diceMatch = text.match(/\[KẾT QUẢ DICE\] Roll: (\d+) \+ Modifier: ([-0-9]+) = Tổng: (\d+) \(([^)]+)\)/);
            if (diceMatch) {
              const rollResult = {
                roll: parseInt(diceMatch[1]),
                modifier: parseInt(diceMatch[2]),
                total: parseInt(diceMatch[3]),
                interpretation: diceMatch[4]
              };
              UI.addDiceResultMessage(rollResult);
            }
          }
          
          recoveredChoices = []; // Nếu user là người nhắn cuối cùng thì không khôi phục
        }
      });
    }

    // Nếu save cũ không có lastChoices, lấy từ lịch sử chat
    if (!GameState.lastChoices || GameState.lastChoices.length === 0) {
      GameState.lastChoices = GeminiAPI._padChoices(recoveredChoices);
    } else {
      // Luôn đảm bảo đủ 4 dù save mới
      GameState.lastChoices = GeminiAPI._padChoices(GameState.lastChoices);
    }

    // Restore last A/B/C/D choices so player can act without re-rolling
    if (GameState.lastChoices && GameState.lastChoices.length > 0) {
      const restoreWrap = document.createElement('div');
      restoreWrap.className = 'dm-choices';

      const labels = ['A', 'B', 'C', 'D'];
      GameState.lastChoices.forEach((choice, i) => {
        const btn = document.createElement('button');
        btn.className = `choice-btn choice-${labels[i] || i}`;
        btn.dataset.choice = choice;
        btn.innerHTML = `<span class="choice-label">${labels[i] || i}</span><span class="choice-text">${choice.replace(/^[A-D]:\s*/i, '')}</span>`;
        btn.onclick = () => UI._selectChoice(restoreWrap, choice, btn);
        restoreWrap.appendChild(btn);
      });

      chat.appendChild(restoreWrap);
      chat.scrollTop = chat.scrollHeight;

      UI.updateSuggestedActions(GameState.lastChoices);
    } else {
      UI.updateSuggestedActions([]);
    }

    // Khôi phục trạng thái yêu cầu tung xúc xắc nếu có
    if (GameState.pendingDiceRoll) {
      this.pendingDiceRoll = GameState.pendingDiceRoll;
      this._showRollRequired();
    }
  },

  rewindTo(index) {
    if (index < 0 || index >= GameState.chatHistory.length) return;
    
    // Lấy snapshot từ tin nhắn cuối cùng (chính là tin nhắn vừa bị cắt tới)
    const targetMsg = GameState.chatHistory[index];
    if (targetMsg.stateSnapshot) {
      GameState.character = JSON.parse(JSON.stringify(targetMsg.stateSnapshot.character));
      GameState.location = targetMsg.stateSnapshot.location;
      GameState.npcMemory = JSON.parse(JSON.stringify(targetMsg.stateSnapshot.npcMemory));
      GameState.storySummary = targetMsg.stateSnapshot.storySummary;
      GameState.storyNotes = JSON.parse(JSON.stringify(targetMsg.stateSnapshot.storyNotes || []));
      GameState.turnCount = targetMsg.stateSnapshot.turnCount;
      
      UI.updateCharacterPanel();
      UI.updateWorldPanel();
    }
    
    // Cắt bỏ tất cả lịch sử sau tin nhắn này
    GameState.chatHistory = GameState.chatHistory.slice(0, index + 1);
    
    // Khôi phục pending state
    this.pendingDiceRoll = null;
    UI.setLoading(false);
    
    // Mở khóa UI
    const input = document.getElementById('player-input');
    const sendBtn = document.getElementById('send-btn');
    const diceBtn = document.getElementById('roll-dice-btn');
    if (input) { input.disabled = false; input.placeholder = "Mô tả hành động của bạn... (Enter để gửi, Shift+Enter xuống dòng)"; }
    if (sendBtn) sendBtn.disabled = false;
    if (diceBtn) { diceBtn.classList.remove('roll-required'); diceBtn.textContent = '🎲 Dice'; }
    
    // Xóa gợi ý hành động cũ
    GameState.lastChoices = [];
    
    // Render lại lịch sử (nó sẽ tự khôi phục choices từ tin nhắn cuối)
    this.refreshChatHistory();
    
    // Lưu lại trạng thái ngay lập tức
    GameState.saveToSlot(0);
    UI.showToast('⏳ Đã dùng Timestone quay ngược thời gian!', 'info');
  },

  setupEventListeners() {
    // ---- START SCREEN ----
    const startNewBtn = document.getElementById('start-new-btn');
    if (startNewBtn) startNewBtn.onclick = () => this.goToCharacterCreation();

    const loadGameBtn = document.getElementById('load-game-btn');
    if (loadGameBtn) loadGameBtn.onclick = () => UI.showSaveLoad();

    // ---- CHARACTER CREATION ----
    const createCharBtn = document.getElementById('create-char-btn');
    if (createCharBtn) createCharBtn.onclick = () => this.startNewGame();

    const backToStartBtn = document.getElementById('back-to-start-btn');
    if (backToStartBtn) backToStartBtn.onclick = () => UI.showScreen('start-screen');

    // Background options
    document.querySelectorAll('.bg-option').forEach(el => {
      el.onclick = () => CharacterCreation.setBackground(el.dataset.bg);
    });

    // Focus options
    document.querySelectorAll('.focus-option').forEach(el => {
      el.onclick = () => CharacterCreation.setFocus(el.dataset.focus);
    });

    // Magic element options
    document.querySelectorAll('.element-option').forEach(el => {
      el.onclick = () => CharacterCreation.setMagicElement(el.dataset.element);
    });

    // Combat style options
    document.querySelectorAll('.style-option').forEach(el => {
      el.onclick = () => CharacterCreation.setCombatStyle(el.dataset.style);
    });

    // ---- GAME SCREEN ----
    // Send action button
    const sendBtn = document.getElementById('send-btn');
    if (sendBtn) sendBtn.onclick = () => this.handlePlayerAction();

    // Input enter key
    const input = document.getElementById('player-input');
    if (input) {
      input.onkeydown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.handlePlayerAction();
        }
      };
    }

    // Roll dice button (for when DM requests a roll)
    const rollDiceBtn = document.getElementById('roll-dice-btn');
    if (rollDiceBtn) rollDiceBtn.onclick = () => this.triggerDiceRoll();

    // Dice overlay confirm roll
    const rollConfirmBtn = document.getElementById('roll-btn-confirm');
    if (rollConfirmBtn) rollConfirmBtn.onclick = () => DiceSystem.executeRoll();

    // Dice overlay close
    const diceCloseBtn = document.getElementById('dice-close-btn');
    if (diceCloseBtn) diceCloseBtn.onclick = () => DiceSystem.closeDiceOverlay();

    // Dice Toggle Buttons (d20 vs d6)
    document.querySelectorAll('.dice-toggle-btn').forEach(btn => {
      btn.onclick = (e) => {
        // Update active class
        document.querySelectorAll('.dice-toggle-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');

        // Update Dice System state
        const type = e.target.dataset.type;
        DiceSystem._pendingDiceType = type;
        
        // Update visual dice element
        const diceEl = document.getElementById('dice-face');
        if (diceEl) {
          diceEl.className = `dice-${type}`;
          diceEl.textContent = type === 'd6' ? '6' : '20';
        }
      };
    });

    // Header buttons
    document.getElementById('btn-inventory')?.addEventListener('click', () => UI.showInventory());
    document.getElementById('btn-skills')?.addEventListener('click', () => UI.showSkills());
    document.getElementById('btn-save')?.addEventListener('click', () => UI.showSaveLoad());
    document.getElementById('btn-settings')?.addEventListener('click', () => UI.showSettings());

    // Modal close buttons
    document.querySelectorAll('.modal-close').forEach(btn => {
      btn.onclick = () => UI.closeAllModals();
    });

    // Click outside modal to close
    document.querySelectorAll('.modal').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) UI.closeAllModals();
      });
    });

    // Settings save
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    if (saveSettingsBtn) saveSettingsBtn.onclick = () => UI.saveSettings();

    // Action log toggle
    const logToggle = document.getElementById('log-toggle');
    if (logToggle) {
      logToggle.onclick = () => {
        document.getElementById('action-log').classList.toggle('expanded');
      };
    }

    // File import for load
    const importBtn = document.getElementById('import-save-btn');
    if (importBtn) {
      importBtn.onclick = () => {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.json';
        fileInput.onchange = async (e) => {
          try {
            await GameState.importFromFile(e.target.files[0], 1);
            UI.showSaveLoad();
            UI.showToast('Đã nhập file save!');
          } catch (err) {
            UI.showToast('Lỗi nhập file: ' + err.message, 'error');
          }
        };
        fileInput.click();
      };
    }
  },

  goToCharacterCreation() {
    // Check API key first
    const savedKey = localStorage.getItem('rpg_api_key') || '';
    const savedModel = localStorage.getItem('rpg_model') || 'gemini-3.8-flash';

    if (!savedKey) {
      // Show API key prompt inline on start screen
      document.getElementById('api-key-prompt').classList.remove('hidden');
      document.getElementById('api-key-input-start').focus();
      return;
    }

    GameState.apiKey = savedKey;
    GameState.modelName = savedModel;
    UI.showScreen('character-creation');
    CharacterCreation.init();
  },

  saveAPIKeyAndProceed() {
    const key = document.getElementById('api-key-input-start').value.trim();
    const model = document.getElementById('model-select-start').value;
    if (!key) { UI.showToast('Hãy nhập API key!', 'error'); return; }

    GameState.apiKey = key;
    GameState.modelName = model;
    localStorage.setItem('rpg_api_key', key);
    localStorage.setItem('rpg_model', model);

    document.getElementById('api-key-prompt').classList.add('hidden');
    UI.showScreen('character-creation');
    CharacterCreation.init();
  },

  async startNewGame() {
    if (!CharacterCreation.validate()) return;

    const charData = CharacterCreation.buildCharacterData();
    GameState.createCharacter(charData);

    UI.showScreen('game-screen');
    UI.updateCharacterPanel();

    UI.setLoading(true);
    UI.addSystemMessage('⚔ Bắt đầu câu chuyện của bạn...', 'info');

    try {
      const response = await GeminiAPI.startGame();
      UI.setLoading(false);

      UI.addDMMessage(response.narrative, response.choices || response.suggested_actions);
      UI.updateSuggestedActions(response.choices || response.suggested_actions);
      UI.updateCharacterPanel();

      if (response.requires_roll) {
        this.pendingDiceRoll = {
          modifier: response.roll_modifier || 0,
          modifierText: response.roll_modifier_text || '+0',
          context: response.roll_context || 'Tung xúc xắc',
          targetDC: response.roll_target_dc || 15
        };
        this._showRollRequired();
      }

    } catch (e) {
      UI.setLoading(false);
      this._handleDMError(e.message, null, null);
    }
  },

  async handlePlayerAction(directAction) {
    if (this.pendingDiceRoll) {
      UI.showToast('Vui lòng tung xúc xắc trước!');
      return;
    }

    let action;
    if (directAction && typeof directAction === 'string') {
      // Called from choice button — action already shown in chat
      action = directAction;
    } else {
      const input = document.getElementById('player-input');
      action = input.value.trim();
      if (!action) return;
      input.value = '';
      UI.addPlayerMessage(action);
    }

    await this._sendAction(action, null);
  },

  async _sendAction(action, diceResult) {
    UI.setLoading(true);
    this.pendingDiceRoll = null;

    try {
      const response = await GeminiAPI.sendMessage(action, diceResult);
      UI.setLoading(false);

      UI.addDMMessage(response.narrative, response.choices || response.suggested_actions, GameState.chatHistory.length - 1);
      UI.updateSuggestedActions(response.choices || response.suggested_actions);
      UI.updateCharacterPanel();
      UI.appendToLog(action);

      // Check for death
      if (GameState.isDead()) {
        UI.addSystemMessage('💀 Nhân vật của bạn đã chết. Hành trình kết thúc.', 'death');
        document.getElementById('send-btn').disabled = true;
        document.getElementById('player-input').disabled = true;
        return;
      }

      // Check if DM requires a roll
      if (response.requires_roll) {
        const parsed_modifier = DiceSystem.parseModifierFromText(
          response.roll_modifier_text,
          GameState.character
        );
        this.pendingDiceRoll = {
          modifier: response.roll_modifier || parsed_modifier,
          modifierText: response.roll_modifier_text || '+0',
          context: response.roll_context || 'Tung xúc xắc',
          targetDC: response.roll_target_dc || 15
        };
        this._showRollRequired();
      }

    } catch (e) {
      UI.setLoading(false);
      this._handleDMError(e.message, action, diceResult);
    }
  },

  async _sendActionWithRoll(action, diceResult) {
    await this._sendAction(action, diceResult);
  },

  _showRollRequired() {
    const btn = document.getElementById('roll-dice-btn');
    const input = document.getElementById('player-input');
    const sendBtn = document.getElementById('send-btn');
    if (btn) {
      btn.classList.add('roll-required');
      btn.textContent = '🎲 ĐỔ XÚC XẮC!';
      UI.showToast('Quản trò yêu cầu tung xúc xắc!', 'info');
    }
    if (input) {
      input.disabled = true;
      input.placeholder = "Vui lòng tung xúc xắc trước...";
    }
    if (sendBtn) {
      sendBtn.disabled = true;
    }
    // Vô hiệu hoá các nút A/B/C/D hiện tại
    document.querySelectorAll('.choice-btn:not(.selected)').forEach(b => {
      b.disabled = true;
      b.classList.add('faded');
    });
  },

  triggerDiceRoll() {
    if (!this.pendingDiceRoll) {
      // Manual roll without DM request
      DiceSystem.animateRoll(0, 'Roll tự do d20', null, (result) => {
        UI.addDiceResultMessage(result);
      });
      return;
    }
    const { modifier, context, targetDC } = this.pendingDiceRoll;
    DiceSystem.animateRoll(modifier, context, targetDC, async (result) => {
      UI.addDiceResultMessage(result);
      
      this.pendingDiceRoll = null;
      
      const btn = document.getElementById('roll-dice-btn');
      const input = document.getElementById('player-input');
      const sendBtn = document.getElementById('send-btn');
      if (btn) {
        btn.classList.remove('roll-required');
        btn.textContent = '🎲 Dice';
      }
      if (input) {
        input.disabled = false;
        input.placeholder = "Mô tả hành động của bạn... (Enter để gửi, Shift+Enter xuống dòng)";
      }
      if (sendBtn) {
        sendBtn.disabled = false;
      }
      
      await this._sendAction("[Đã đổ xúc xắc theo yêu cầu]", result);
    });
  },

  // ---- XỬ LÝ LỖI QUAN TRÒ + NÚT THỬ LẠI ----
  _lastFailedAction: null,
  _lastFailedDice: null,

  _handleDMError(errMsg, action, diceResult) {
    this._lastFailedAction = action;
    this._lastFailedDice = diceResult;

    // Hiển thị thông báo lỗi kèm nút Thử lại
    const errorHtml = `
      <div style="text-align:center;">
        <div style="color:#ef5350;margin-bottom:10px;">⚠️ Lỗi kết nối Gemini: ${errMsg}</div>
        <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
          <button onclick="App._retryLastAction()" style="background:rgba(201,168,76,0.15);border:1px solid #c9a84c;color:#c9a84c;padding:8px 18px;border-radius:6px;cursor:pointer;font-size:0.85rem;">🔄 Thử lại ngay</button>
          <button onclick="App._retryWithNewModel()" style="background:rgba(21,101,192,0.15);border:1px solid #42a5f5;color:#42a5f5;padding:8px 18px;border-radius:6px;cursor:pointer;font-size:0.85rem;">⚙ Đổi model rồi thử lại</button>
        </div>
      </div>`, 
    errorEl = document.createElement('div');
    errorEl.className = 'chat-message system-message error';
    errorEl.innerHTML = `<div class="message-content">${errorHtml}</div>`;
    document.getElementById('story-chat').appendChild(errorEl);
    errorEl.scrollIntoView({ behavior: 'smooth' });
  },

  async _retryLastAction() {
    const action = this._lastFailedAction;
    const dice  = this._lastFailedDice;
    if (action === null && dice === null) {
      // Lỗi ở startGame
      UI.showToast('Đang thử lại mở đầu câu chuyện...', 'success');
      UI.setLoading(true);
      try {
        const response = await GeminiAPI.startGame();
        UI.setLoading(false);
        UI.addDMMessage(response.narrative);
        UI.updateSuggestedActions(response.suggested_actions);
        UI.updateCharacterPanel();
      } catch (e) {
        UI.setLoading(false);
        this._handleDMError(e.message, null, null);
      }
    } else {
      UI.showToast('Đang thử lại hành động...', 'success');
      await this._sendAction(action, dice);
    }
  },

  async _retryWithNewModel() {
    // Tự động lưu tiến trình hiện tại
    if (GameState.character) GameState.saveToSlot(0);

    // Mở settings modal
    UI.showSettings();
    UI.showToast('Đã lưu tiến trình! Hãy chọn model khác rồi bấm Lưu cài đặt.', 'success');
  },

  _showRollRequired() {
    const rollBtn = document.getElementById('roll-dice-btn');
    if (rollBtn) {
      rollBtn.classList.add('roll-required');
      rollBtn.textContent = `🎲 ROLL! (${this.pendingDiceRoll.modifierText})`;
    }
    UI.addSystemMessage(`🎲 Quản trò yêu cầu roll d20! ${this.pendingDiceRoll.context} (Modifier: ${this.pendingDiceRoll.modifierText})`, 'roll-req');
  },
};

// ---- BOOT ----
window.addEventListener('DOMContentLoaded', () => App.init());
