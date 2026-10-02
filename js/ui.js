// ============================================================
// UI.JS — UI Rendering & Updates
// ============================================================

const UI = {
  // Current pending dice roll from DM
  pendingRoll: null,

  // ---- TEXT TO SPEECH ----
  TTS: {
    _utterance: null,
    _activeBtn: null,
    _speaking: false,
    _rate: parseFloat(localStorage.getItem('tts_rate') || '1'),
    _autoScroll: localStorage.getItem('tts_autoscroll') !== 'false',
    _activeContainer: null,
    _currentHighlight: null,
    _wordSpans: [],

    _getVoice() {
      const voices = window.speechSynthesis.getVoices();
      return (
        voices.find(v => v.lang === 'vi-VN') ||
        voices.find(v => v.lang.startsWith('vi')) ||
        voices[0] || null
      );
    },

    speak(text, btn) {
      window.speechSynthesis.cancel();
      this._cleanup();

      // Toggle off nếu bấm lại cùng nút
      if (this._activeBtn === btn && this._speaking) {
        this._reset();
        return;
      }
      if (this._activeBtn) this._resetBtn(this._activeBtn);

      // Clean text để feed vào utterance (bỏ markdown, HTML)
      const clean = text
        .replace(/<[^>]+>/g, '')
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/#{1,6}\s/g, '')
        .replace(/\n+/g, ' ')
        .trim();

      // Tìm container và wrap từng từ thành <span class="tts-word">
      const msgContent = btn.closest('.message-content');
      this._activeContainer = msgContent;
      this._wordSpans = msgContent ? this._wrapWords(msgContent, clean) : [];

      this._utterance = new SpeechSynthesisUtterance(clean);
      this._utterance.lang = 'vi-VN';
      this._utterance.rate = this._rate;
      this._utterance.pitch = 1.0;
      const voice = this._getVoice();
      if (voice) this._utterance.voice = voice;

      // Highlight từ đang đọc dựa trên charIndex
      this._utterance.onboundary = (e) => {
        if (e.name !== 'word') return;
        if (this._currentHighlight) this._currentHighlight.classList.remove('tts-highlight');
        // Tìm span có charStart <= e.charIndex < charStart + charLen
        const span = this._wordSpans.find(
          s => e.charIndex >= s.charStart && e.charIndex < s.charStart + s.charLen
        );
        if (span?.el) {
          span.el.classList.add('tts-highlight');
          if (this._autoScroll) {
            span.el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
          }
          this._currentHighlight = span.el;
        }
      };

      this._utterance.onstart = () => {
        this._speaking = true;
        this._activeBtn = btn;
        btn.classList.add('tts-playing');
        btn.title = 'Dừng đọc';
        btn.innerHTML = '⏹';
      };
      this._utterance.onend   = () => this._reset();
      this._utterance.onerror = () => this._reset();

      window.speechSynthesis.speak(this._utterance);
    },

    // Wrap từng từ trong container thành <span class="tts-word">
    // Trả về mảng { el, charStart, charLen } dựa trên clean text
    _wrapWords(container, cleanText) {
      // Xây dựng bản đồ charStart của từng từ trong clean text
      const cleanWordMap = [];
      const re = /\S+/g;
      let m;
      while ((m = re.exec(cleanText)) !== null) {
        cleanWordMap.push({ text: m[0], charStart: m.index, charLen: m[0].length });
      }

      // Walk text nodes trong container (bỏ qua nút tts-btn)
      const walker = document.createTreeWalker(
        container, NodeFilter.SHOW_TEXT,
        { acceptNode: (node) => {
          let p = node.parentElement;
          while (p && p !== container) {
            if (p.classList.contains('tts-btn')) return NodeFilter.FILTER_REJECT;
            p = p.parentElement;
          }
          return node.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
        }}
      );
      const textNodes = [];
      let n;
      while ((n = walker.nextNode())) textNodes.push(n);

      // Thay mỗi text node: tách từ → span, khoảng trắng → text node
      const allSpans = [];
      let domWordIdx = 0;
      textNodes.forEach(textNode => {
        const text = textNode.textContent;
        const frag = document.createDocumentFragment();
        const tokenRe = /(\S+)|(\s+)/g;
        let tok;
        while ((tok = tokenRe.exec(text)) !== null) {
          if (tok[2]) {
            // khoảng trắng
            frag.appendChild(document.createTextNode(tok[2]));
          } else {
            // từ
            const span = document.createElement('span');
            span.className = 'tts-word';
            span.textContent = tok[1];
            const meta = cleanWordMap[domWordIdx];
            if (meta) {
              span.dataset.charStart = meta.charStart;
              allSpans.push({ el: span, charStart: meta.charStart, charLen: meta.charLen });
            }
            domWordIdx++;
            frag.appendChild(span);
          }
        }
        textNode.parentNode.replaceChild(frag, textNode);
      });
      return allSpans;
    },

    _unwrapWords(container) {
      container.querySelectorAll('.tts-word').forEach(span => {
        span.replaceWith(document.createTextNode(span.textContent));
      });
      container.normalize();
    },

    _cleanup() {
      if (this._currentHighlight) {
        this._currentHighlight.classList.remove('tts-highlight');
        this._currentHighlight = null;
      }
      if (this._activeContainer) {
        this._unwrapWords(this._activeContainer);
        this._activeContainer = null;
      }
      this._wordSpans = [];
    },

    _reset() {
      this._cleanup();
      this._speaking = false;
      if (this._activeBtn) this._resetBtn(this._activeBtn);
      this._activeBtn = null;
    },

    _resetBtn(btn) {
      btn.classList.remove('tts-playing');
      btn.title = 'Đọc to';
      btn.innerHTML = '🔊';
    },

    setRate(rate) {
      this._rate = rate;
      localStorage.setItem('tts_rate', rate);
      if (this._speaking && this._utterance) {
        // Lưu lại text gốc và btn trước khi cancel làm mất
        const rawText = this._utterance.text;
        const savedBtn = this._activeBtn;
        window.speechSynthesis.cancel();
        this._cleanup();
        setTimeout(() => UI.TTS.speak(rawText, savedBtn), 80);
      }
    },

    initSpeedBar() {
      // Setup rate buttons
      const savedRate = this._rate;
      document.querySelectorAll('.tts-speed-btn[data-rate]').forEach(btn => {
        const r = parseFloat(btn.dataset.rate);
        btn.classList.toggle('active', r === savedRate);
        btn.addEventListener('click', () => {
          document.querySelectorAll('.tts-speed-btn[data-rate]').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          UI.TTS.setRate(r);
        });
      });

      // Setup auto-scroll toggle button
      const scrollBtn = document.getElementById('tts-autoscroll-btn');
      if (scrollBtn) {
        scrollBtn.classList.toggle('active', this._autoScroll);
        scrollBtn.addEventListener('click', () => {
          this._autoScroll = !this._autoScroll;
          localStorage.setItem('tts_autoscroll', this._autoScroll);
          scrollBtn.classList.toggle('active', this._autoScroll);
        });
      }
    },
  },


  // ---- SCREEN TRANSITIONS ----
  showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => {
      s.classList.remove('active');
      s.style.display = 'none';
    });
    const target = document.getElementById(screenId);
    if (target) {
      target.style.display = 'flex';
      target.style.flexDirection = 'column';
      target.classList.add('active');
      target.style.animation = 'fadeIn 0.4s ease forwards';
    }
  },

  // ---- STATUS BARS ----
  updateCharacterPanel() {
    const c = GameState.character;
    if (!c) return;

    document.getElementById('char-name').textContent = c.name;
    document.getElementById('char-race').textContent = c.race;
    document.getElementById('char-level').textContent = `Lv. ${c.level}`;

    // HP
    this._updateBar('hp', c.hp, c.maxHp);
    document.getElementById('hp-text').textContent = `${c.hp} / ${c.maxHp}`;

    // Mana
    this._updateBar('mana', c.mana, c.maxMana);
    document.getElementById('mana-text').textContent = `${c.mana} / ${c.maxMana}`;

    // Stamina
    this._updateBar('stamina', c.stamina, c.maxStamina);
    document.getElementById('stamina-text').textContent = `${c.stamina} / ${c.maxStamina}`;

    // XP
    this._updateBar('xp', c.xp, c.xpToNext);
    document.getElementById('xp-text').textContent = `${c.xp} / ${c.xpToNext} XP`;

    // Stats
    document.getElementById('stat-str').textContent = c.stats.str;
    document.getElementById('stat-int').textContent = c.stats.int;
    document.getElementById('stat-agi').textContent = c.stats.agi;
    document.getElementById('stat-end').textContent = c.stats.end;
    document.getElementById('stat-cha').textContent = c.stats.cha;

    // Gold (Formatted as Vàng, Bạc, Đồng)
    document.getElementById('char-gold').textContent = this._formatMoney(c.gold);
    document.getElementById('char-gold').style.fontSize = '0.75rem'; // Make it fit better
    document.getElementById('char-gold').style.whiteSpace = 'nowrap';

    // Status effects
    const statusEl = document.getElementById('status-effects');
    statusEl.innerHTML = '';
    c.statusEffects.forEach(eff => {
      const badge = document.createElement('span');
      badge.className = 'status-badge';
      badge.textContent = eff;
      statusEl.appendChild(badge);
    });

    // Location
    document.getElementById('world-location').textContent = GameState.location;
    document.getElementById('header-location').textContent = GameState.location;
  },

  _updateBar(type, current, max) {
    const bar = document.getElementById(`${type}-bar`);
    if (!bar) return;
    const pct = Math.max(0, Math.min(100, (current / max) * 100));
    bar.style.width = pct + '%';

    // Color warning for HP
    if (type === 'hp') {
      bar.className = 'bar-fill hp-bar';
      if (pct <= 25) bar.classList.add('critical');
      else if (pct <= 50) bar.classList.add('warning');
    }
  },

  _formatMoney(copper) {
    if (!copper || copper <= 0) return '0 Đồng (Asura)';
    let gold = Math.floor(copper / 1000);
    let silver = Math.floor((copper % 1000) / 100);
    let largeCopper = Math.floor((copper % 100) / 10);
    let c = copper % 10;
    
    let res = [];
    if (gold > 0) res.push(`${gold} Vàng`);
    if (silver > 0) res.push(`${silver} Bạc`);
    if (largeCopper > 0) res.push(`${largeCopper} Đồng Lớn`);
    if (c > 0) res.push(`${c} Đồng`);
    return res.join(' ') + ' (Asura)';
  },

  // ---- STORY/CHAT ----
  addDMMessage(narrative, choices, historyIndex = -1) {
    const chat = document.getElementById('story-chat');
    const msg = document.createElement('div');
    msg.className = 'chat-message dm-message';

    // Parse markdown-like formatting
    const formatted = this._formatNarrative(narrative);

    // TTS button
    const ttsBtn = document.createElement('button');
    ttsBtn.className = 'tts-btn';
    ttsBtn.title = 'Đọc to';
    ttsBtn.innerHTML = '🔊';
    ttsBtn.onclick = () => this.TTS.speak(narrative, ttsBtn);

    // Timestone button
    const timestoneBtn = document.createElement('button');
    timestoneBtn.className = 'timestone-btn';
    timestoneBtn.title = 'Timestone: Quay lại thời điểm này (Hủy các hành động sau đó)';
    timestoneBtn.innerHTML = '⏳';
    if (historyIndex >= 0) {
      timestoneBtn.dataset.index = historyIndex;
      timestoneBtn.onclick = () => {
        if (confirm('Bạn có chắc muốn dùng Timestone để quay lại thời điểm này? Mọi quyết định sau đó sẽ bị xóa bỏ.')) {
          App.rewindTo(historyIndex);
        }
      };
    } else {
      timestoneBtn.style.display = 'none';
    }

    const controls = document.createElement('div');
    controls.className = 'msg-controls';
    controls.appendChild(ttsBtn);
    controls.appendChild(timestoneBtn);

    msg.innerHTML = `<div class="dm-avatar">⚔</div><div class="message-content">${formatted}</div>`;
    msg.querySelector('.message-content').appendChild(controls);

    chat.appendChild(msg);
    msg.style.animation = 'slideInLeft 0.3s ease forwards';

    // Render A/B/C/D choice buttons if provided
    if (choices && choices.length > 0) {
      const choiceWrap = document.createElement('div');
      choiceWrap.className = 'dm-choices';
      const labels = ['A', 'B', 'C', 'D'];
      choices.forEach((choice, i) => {
        const btn = document.createElement('button');
        btn.className = `choice-btn choice-${labels[i] || i}`;
        btn.dataset.choice = choice;
        // Strip the "A: " prefix for display if present
        btn.innerHTML = `<span class="choice-label">${labels[i] || i}</span><span class="choice-text">${choice.replace(/^[A-D]:\s*/i, '')}</span>`;
        btn.onclick = () => this._selectChoice(choiceWrap, choice, btn);
        choiceWrap.appendChild(btn);
      });
      chat.appendChild(choiceWrap);
    }

    this._scrollToBottom();
  },

  // Called when player clicks a choice button
  _selectChoice(choiceWrap, choiceText, clickedBtn) {
    // Disable all buttons in this group
    choiceWrap.querySelectorAll('.choice-btn').forEach(b => {
      b.disabled = true;
      b.classList.remove('selected');
      b.classList.add('faded');
    });
    clickedBtn.classList.remove('faded');
    clickedBtn.classList.add('selected');

    // Strip prefix then show as player message
    const cleanText = choiceText.replace(/^[A-D]:\s*/i, '');
    this.addPlayerMessage(cleanText);

    // Send to DM
    App.handlePlayerAction(cleanText);
  },

  addPlayerMessage(text) {
    const chat = document.getElementById('story-chat');
    const msg = document.createElement('div');
    msg.className = 'chat-message player-message';
    msg.innerHTML = `<div class="message-content"><p>${this._escapeHtml(text)}</p></div><div class="player-avatar">⚡</div>`;
    chat.appendChild(msg);
    msg.style.animation = 'slideInRight 0.3s ease forwards';
    this._scrollToBottom();
  },

  addSystemMessage(text, type = 'info') {
    const chat = document.getElementById('story-chat');
    const msg = document.createElement('div');
    msg.className = `chat-message system-message ${type}`;
    msg.innerHTML = `<div class="message-content"><p>${text}</p></div>`;
    chat.appendChild(msg);
    this._scrollToBottom();
  },

  addDiceResultMessage(result) {
    const chat = document.getElementById('story-chat');
    const msg = document.createElement('div');
    const cls = DiceSystem.getInterpretationClass(result);
    msg.className = `chat-message dice-message ${cls}`;
    msg.innerHTML = `
      <div class="dice-result-inline">
        <span class="dice-icon">🎲</span>
        <span class="dice-natural">d20: <strong>${result.roll}</strong></span>
        <span class="dice-mod">Modifier: ${result.modifier >= 0 ? '+' : ''}${result.modifier}</span>
        <span class="dice-total">Tổng: <strong>${result.total}</strong></span>
        <span class="dice-interp ${cls}">${result.interpretation}</span>
      </div>`;
    chat.appendChild(msg);
    this._scrollToBottom();
  },

  _formatNarrative(text) {
    // Bold
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Italic
    text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
    // Line breaks
    text = text.replace(/\n\n/g, '</p><p>');
    text = text.replace(/\n/g, '<br>');
    return `<p>${text}</p>`;
  },

  _escapeHtml(text) {
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
  },

  _scrollToBottom() {
    const chat = document.getElementById('story-chat');
    if (chat) chat.scrollTop = chat.scrollHeight;
  },

  // ---- SUGGESTED ACTIONS ----
  updateSuggestedActions(actions) {
    // Chức năng đã bị loại bỏ theo yêu cầu của user
    return;
  },

  // ---- LOADING STATE ----
  setLoading(isLoading) {
    const sendBtn = document.getElementById('send-btn');
    const rollBtn = document.getElementById('roll-dice-btn');
    const input = document.getElementById('player-input');

    if (isLoading) {
      sendBtn.disabled = true;
      sendBtn.innerHTML = '<span class="loading-dots">Quản trò đang suy nghĩ</span>';
      if (rollBtn) rollBtn.disabled = true;
      input.disabled = true;

      // Show typing indicator in chat
      const chat = document.getElementById('story-chat');
      const indicator = document.createElement('div');
      indicator.id = 'typing-indicator';
      indicator.className = 'chat-message dm-message typing';
      indicator.innerHTML = '<div class="dm-avatar">⚔</div><div class="message-content"><span class="typing-dots"><span>.</span><span>.</span><span>.</span></span></div>';
      chat.appendChild(indicator);
      this._scrollToBottom();
    } else {
      const hasPendingRoll = typeof App !== 'undefined' && App.pendingDiceRoll;
      sendBtn.disabled = false;
      sendBtn.innerHTML = 'Hành Động <span>↵</span>';
      if (rollBtn) rollBtn.disabled = false;
      
      if (!hasPendingRoll) {
        input.disabled = false;
        input.focus();
      }

      // Remove typing indicator
      const indicator = document.getElementById('typing-indicator');
      if (indicator) indicator.remove();
    }
  },

  // ---- INVENTORY MODAL ----
  showInventory() {
    const c = GameState.character;
    if (!c) return;

    const grid = document.getElementById('inventory-grid');
    grid.innerHTML = '';

    if (c.inventory.length === 0) {
      grid.innerHTML = '<p class="empty-msg">Túi đồ trống.</p>';
    } else {
      c.inventory.forEach((item, idx) => {
        const slot = document.createElement('div');
        slot.className = `inv-slot ${item.type}`;
        slot.innerHTML = `
          <div class="inv-icon">${this._getItemIcon(item.type)}</div>
          <div class="inv-name">${item.name}</div>
          <div class="inv-qty">${item.qty > 1 ? `×${item.qty}` : ''}</div>`;
        slot.title = item.desc || '';
        slot.onclick = () => this._showItemDetail(item, idx);
        grid.appendChild(slot);
      });
    }

    // Equipment slots
    document.getElementById('equip-weapon').textContent = c.equipment.weapon || '—';
    document.getElementById('equip-armor').textContent = c.equipment.armor || '—';
    document.getElementById('equip-accessory').textContent = c.equipment.accessory || '—';
    document.getElementById('equip-offhand').textContent = c.equipment.offhand || '—';

    document.getElementById('inventory-modal').classList.add('active');
  },

  _showItemDetail(item, idx) {
    const detail = document.getElementById('item-detail');
    const c = GameState.character;
    detail.innerHTML = `
      <h3>${item.name}</h3>
      <p class="item-type">${this._getItemTypeName(item.type)}</p>
      <p class="item-desc">${item.desc || 'Không có mô tả.'}</p>
      ${item.atk ? `<p class="item-stat">⚔ Tấn công: +${item.atk}</p>` : ''}
      ${item.def ? `<p class="item-stat">🛡 Phòng thủ: +${item.def}</p>` : ''}
      ${item.type === 'weapon' || item.type === 'armor' ? `
        <button class="equip-btn" onclick="UI._equipItem(${idx})">
          ${c.equipment[item.type] === item.name ? '🔴 Tháo ra' : '🟢 Trang bị'}
        </button>` : ''}
      <button class="equip-btn" style="background: rgba(220, 53, 69, 0.2); border-color: rgba(220, 53, 69, 0.5); color: #ff6b6b; margin-top: 8px;" onclick="UI._dropItem(${idx})">
        🗑 Vứt bỏ
      </button>
    `;
  },

  _equipItem(idx) {
    const c = GameState.character;
    const item = c.inventory[idx];
    if (!item) return;

    const slot = item.type === 'weapon' ? 'weapon' : item.type === 'armor' ? 'armor' : null;
    if (!slot) return;

    if (c.equipment[slot] === item.name) {
      c.equipment[slot] = null;
    } else {
      c.equipment[slot] = item.name;
    }
    this.showInventory();
    this.updateCharacterPanel();
  },

  _dropItem(idx) {
    const c = GameState.character;
    const item = c.inventory[idx];
    if (!item) return;
    
    // Unequip if equipped
    const slot = item.type === 'weapon' ? 'weapon' : item.type === 'armor' ? 'armor' : null;
    if (slot && c.equipment[slot] === item.name) {
      c.equipment[slot] = null;
    }
    
    // Remove from inventory
    c.inventory.splice(idx, 1);
    
    // Clear detail view
    document.getElementById('item-detail').innerHTML = '<p class="empty-msg">Chọn một vật phẩm để xem chi tiết.</p>';
    
    // Refresh UI
    this.showInventory();
    this.updateCharacterPanel();
  },

  _getItemIcon(type) {
    const icons = { weapon: '⚔', armor: '🛡', consumable: '🧪', misc: '📦', magic: '✨' };
    return icons[type] || '📦';
  },

  _getItemTypeName(type) {
    const names = { weapon: 'Vũ khí', armor: 'Giáp', consumable: 'Vật phẩm tiêu hao', misc: 'Đồ linh tinh', magic: 'Phép thuật' };
    return names[type] || 'Không rõ';
  },

  // ---- CHARACTER SHEET MODAL ----
  showCharacterSheet() {
    const c = GameState.character;
    if (!c) return;

    const content = document.getElementById('character-sheet-content');
    if (!content) return;

    const raceName = c.race || 'Chưa rõ';
    const backgroundName = c.background === 'isekai' ? 'Chuyển sinh (Isekai)' : (c.background === 'local' ? 'Người bản địa' : 'Chưa rõ');
    
    let focusName = c.startingFocus;
    if (focusName === 'magic') focusName = 'Pháp sư';
    else if (focusName === 'combat') focusName = 'Kiếm sĩ / Chiến binh';
    else if (focusName === 'rogue') focusName = 'Sát thủ / Đạo tặc';
    
    let magicStyle = c.magicElement ? `(Nguyên tố: ${c.magicElement})` : '';
    let combatStyle = c.combatStyle ? `(Phái: ${c.combatStyle})` : '';

    let html = `
      <div style="margin-bottom: 10px;"><strong>Tên:</strong> <span style="color:var(--gold-bright)">${c.name}</span></div>
      <div style="margin-bottom: 10px;"><strong>Giới tính:</strong> ${c.gender === 'male' ? 'Nam' : 'Nữ'}</div>
      <div style="margin-bottom: 10px;"><strong>Chủng tộc:</strong> ${raceName}</div>
      <div style="margin-bottom: 10px;"><strong>Bối cảnh:</strong> ${backgroundName}</div>
      <div style="margin-bottom: 10px;"><strong>Thiên hướng:</strong> ${focusName} ${magicStyle} ${combatStyle}</div>
      <div style="margin-top: 15px; padding-top: 10px; border-top: 1px solid var(--border-panel);">
        <strong>Đặc điểm chủng tộc:</strong>
        <ul style="margin-top: 5px; padding-left: 20px; color: var(--text-dim);">
          ${c.raceTraits && c.raceTraits.length > 0 ? c.raceTraits.map(t => `<li>${t}</li>`).join('') : '<li>Không có</li>'}
        </ul>
      </div>
    `;

    content.innerHTML = html;
    document.getElementById('character-sheet-modal').classList.add('active');
  },

  // ---- SKILLS MODAL ----
  showSkills() {
    const c = GameState.character;
    if (!c) return;

    const list = document.getElementById('skills-list');
    list.innerHTML = '';

    if (c.skills.length === 0) {
      list.innerHTML = '<p class="empty-msg">Chưa có kỹ năng nào.</p>';
    } else {
      // Group skills
      const magicSkills = c.skills.filter(s => s.toLowerCase().includes('phép'));
      const combatSkills = c.skills.filter(s => s.toLowerCase().includes('đấu') || s.toLowerCase().includes('touki') || s.toLowerCase().includes('kiếm'));
      const otherSkills = c.skills.filter(s => !magicSkills.includes(s) && !combatSkills.includes(s));

      this._renderSkillGroup(list, '⚡ Phép Thuật', magicSkills);
      this._renderSkillGroup(list, '⚔ Chiến Đấu', combatSkills);
      this._renderSkillGroup(list, '🌟 Khác', otherSkills);
    }

    // Race traits
    const traitsEl = document.getElementById('race-traits-list');
    traitsEl.innerHTML = '';
    c.raceTraits.forEach(trait => {
      const li = document.createElement('li');
      li.textContent = trait;
      traitsEl.appendChild(li);
    });

    document.getElementById('skills-modal').classList.add('active');
  },

  _renderSkillGroup(container, title, skills) {
    if (skills.length === 0) return;
    const group = document.createElement('div');
    group.className = 'skill-group';
    group.innerHTML = `<h4>${title}</h4>`;
    skills.forEach(skill => {
      const item = document.createElement('div');
      item.className = 'skill-item';
      item.textContent = skill;
      group.appendChild(item);
    });
    container.appendChild(group);
  },

  // ---- SAVE/LOAD MODAL ----
  showSaveLoad() {
    for (let i = 0; i < 3; i++) {
      const info = GameState.getSaveInfo(i);
      const el = document.getElementById(`save-slot-${i}`);
      if (!el) continue;
      if (info) {
        el.innerHTML = `
          <div class="save-info">
            <strong>${info.name}</strong> — ${info.race} Lv.${info.level}
            <small>${info.location}</small>
            <small>Lượt: ${info.turnCount} • ${new Date(info.savedAt).toLocaleString('vi-VN')}</small>
          </div>
          <div class="save-actions">
            <button onclick="UI._loadSlot(${i})">Tải</button>
            <button onclick="GameState.exportToFile(${i})">Xuất</button>
            <button onclick="document.getElementById('import-file-${i}').click()">Nhập</button>
            <button class="danger-btn" onclick="UI._deleteSlot(${i})">Xóa</button>
            <input type="file" id="import-file-${i}" style="display:none" accept=".json" onchange="UI._importSlot(event, ${i})">
          </div>`;
      } else {
        el.innerHTML = `<span class="empty-slot">Ô trống</span>
          <div style="margin-top:10px; display:flex; gap:10px;">
            <button onclick="UI._saveToSlot(${i})">Lưu vào đây</button>
            <button onclick="document.getElementById('import-file-${i}').click()">Nhập File Save</button>
            <input type="file" id="import-file-${i}" style="display:none" accept=".json" onchange="UI._importSlot(event, ${i})">
          </div>`;
      }
    }
    
    const startScreen = document.getElementById('start-screen');
    if (startScreen && startScreen.classList.contains('active')) {
      if (typeof App.checkExistingSave === 'function') {
        App.checkExistingSave();
      }
    }
    
    document.getElementById('saveload-modal').classList.add('active');
  },

  _saveToSlot(slot) {
    GameState.saveToSlot(slot);
    this.showSaveLoad();
    this.showToast(`Đã lưu vào ô ${slot + 1}!`);
  },

  _loadSlot(slot) {
    if (slot !== 0) {
      const dataStr = localStorage.getItem(`rpg_save_${slot}`);
      if (dataStr) {
        localStorage.setItem('rpg_save_0', dataStr); // Overwrite Autosave
      }
    }
    
    // Tải vào GameState
    const data = GameState.loadFromSlot(0);
    if (data) {
      this.showScreen('game-screen');
      this.updateCharacterPanel();
      if (typeof App.refreshChatHistory === 'function') {
        App.refreshChatHistory();
      }
      this.closeAllModals();
      this.showToast(`Đã tải game từ ô ${slot + 1}!`, 'success');
      
      const savedKey = localStorage.getItem('rpg_api_key') || '';
      if (!savedKey) {
        setTimeout(() => {
          this.showToast('Vui lòng nhập Gemini API Key để tiếp tục chơi!', 'warning');
          this.showSettings();
        }, 500);
      }
    }
  },

  _deleteSlot(slot) {
    localStorage.removeItem(`rpg_save_${slot}`);
    
    // Nếu xóa đúng ô hiện tại đang chơi (Ô 1 - Autosave) thì kick ra ngoài
    if (slot === 0 && document.getElementById('game-screen').classList.contains('active')) {
      this.showScreen('start-screen');
      this.closeAllModals();
      this.showToast('Đã xóa hành trình hiện tại!', 'warning');
    } else {
      this.showSaveLoad();
    }
    
    // Cập nhật lại banner Tiếp Tục ở ngoài sảnh
    if (typeof App.checkExistingSave === 'function') {
      App.checkExistingSave();
    }
  },

  async _importSlot(event, slot) {
    const file = event.target.files[0];
    if (!file) return;
    try {
      await GameState.importFromFile(file, slot);
      this.showToast(`Đã tải file save vào ô ${slot + 1}!`, 'success');
      this.showSaveLoad();
      if (typeof App.checkExistingSave === 'function') {
        App.checkExistingSave();
      }
    } catch (e) {
      this.showToast('Lỗi: File save không hợp lệ!', 'error');
    }
    event.target.value = ''; // Reset input
  },

  // ---- SETTINGS MODAL ----
  showSettings() {
    document.getElementById('settings-api-key').value = GameState.apiKey;
    document.getElementById('settings-model').value = GameState.modelName;
    document.getElementById('settings-modal').classList.add('active');
  },

  saveSettings() {
    const key = document.getElementById('settings-api-key').value.trim();
    const model = document.getElementById('settings-model').value;
    const modelChanged = model !== GameState.modelName;

    // Auto-save tiến trình trước khi đổi settings
    if (GameState.character) {
      GameState.saveToSlot(0);
    }

    GameState.apiKey = key;
    GameState.modelName = model;
    localStorage.setItem('rpg_api_key', key);
    localStorage.setItem('rpg_model', model);
    this.closeAllModals();

    // Nếu model thay đổi và Quản Trò chưa phản hồi → tự động retry
    if (modelChanged && GeminiAPI.pendingResponse === false && App._lastFailedAction !== undefined) {
      this.showToast(`✅ Đã lưu & đổi sang ${model}! Đang thử lại...`, 'success');
      setTimeout(() => App._retryLastAction(), 500);
    } else if (modelChanged) {
      this.showToast(`✅ Đã lưu tiến trình & đổi sang ${model}!`, 'success');
    } else {
      this.showToast('Đã lưu cài đặt!');
    }
  },

  // ---- UTILITIES ----
  closeAllModals() {
    document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
  },

  showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast active ${type}`;
    setTimeout(() => toast.classList.remove('active'), 3000);
  },

  showError(message) {
    this.showToast(message, 'error');
    this.addSystemMessage(`⚠️ ${message}`, 'error');
  },

  // Update action log
  appendToLog(text) {
    const log = document.getElementById('action-log-content');
    if (!log) return;
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.textContent = `[Lượt ${GameState.turnCount}] ${text}`;
    log.appendChild(entry);
    log.scrollTop = log.scrollHeight;
  },
};
