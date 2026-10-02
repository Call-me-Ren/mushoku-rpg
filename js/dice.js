// ============================================================
// DICE.JS — Dice Rolling Logic & Animation
// ============================================================

const DiceSystem = {
  currentPending: null, // pending roll request from DM

  // d20 faces for animation display
  D20_FACES: ['▲', '◆', '●', '■', '★', '◉', '▼', '◈', '◇', '⬡'],

  // Roll a d20 and return result
  rollD20(modifier = 0, targetDC = 15) {
    const roll = Math.floor(Math.random() * 20) + 1;
    const total = roll + modifier;
    const interpretation = this.interpretRoll(roll, total, targetDC);
    return { roll, modifier, total, targetDC, interpretation };
  },

  interpretRoll(naturalRoll, total, targetDC) {
    if (naturalRoll === 1) return '💀 THẤT BẠI CỰC KỲ THẢM';
    if (naturalRoll === 20) return '✨ THÀNH CÔNG XUẤT SẮC';
    
    const diff = total - targetDC;
    if (diff <= -5) return '❌ Thất bại nặng';
    if (diff < 0) return '⚠️ Thất bại / Kém';
    if (diff <= 5) return '✅ Thành công';
    if (diff <= 10) return '💪 Thành công xuất sắc';
    return '⭐ Thành công hoàn hảo';
  },

  // Roll a d6 and return result
  rollD6(modifier = 0) {
    const roll = Math.floor(Math.random() * 6) + 1;
    const total = roll + modifier;
    const interpretation = this.interpretD6Roll(roll, total);
    return { roll, modifier, total, interpretation };
  },

  interpretD6Roll(naturalRoll, total) {
    if (naturalRoll === 1) return '💀 Cực tệ';
    if (naturalRoll === 6) return '✨ Xuất sắc';
    if (total <= 2) return '❌ Kém';
    if (total <= 4) return '⚠️ Tạm được';
    return '✅ Tốt';
  },

  getInterpretationClass(result) {
    if (result.roll === 1) return 'crit-fail';
    if (result.roll === 20) return 'crit-success';
    
    const targetDC = result.targetDC || 15;
    const diff = result.total - targetDC;
    
    if (diff <= -5) return 'fail';
    if (diff < 0) return 'partial';
    if (diff <= 5) return 'success';
    if (diff <= 10) return 'great';
    return 'perfect';
  },

  // Show the dice roll overlay with animation
  animateRoll(modifier, context, targetDC, callback, diceType = 'd20') {
    const overlay = document.getElementById('dice-overlay');
    const diceEl = document.getElementById('dice-face');
    const rollBtn = document.getElementById('roll-btn-confirm');
    const contextEl = document.getElementById('dice-context');
    const modEl = document.getElementById('dice-modifier-display');

    let ctxText = context || 'Tung xúc xắc!';
    if (targetDC) ctxText += ` (Yêu cầu: ${targetDC})`;
    contextEl.textContent = ctxText;
    
    modEl.textContent = modifier >= 0 ? `+${modifier}` : `${modifier}`;

    overlay.classList.add('active');
    overlay.classList.remove('result-shown');
    rollBtn.disabled = false;
    diceEl.className = `dice-${diceType}`;
    document.getElementById('dice-result-area').classList.add('hidden');

    // Store pending state
    this._pendingCallback = callback;
    this._pendingModifier = modifier;
    this._pendingTargetDC = targetDC;
    this._pendingDiceType = diceType;
  },

  executeRoll() {
    const diceEl = document.getElementById('dice-face');
    const rollBtn = document.getElementById('roll-btn-confirm');
    const resultArea = document.getElementById('dice-result-area');
    const fastMode = document.getElementById('fast-dice-checkbox')?.checked;

    rollBtn.disabled = true;

    const isD6 = this._pendingDiceType === 'd6';
    const sides = isD6 ? 6 : 20;

    if (fastMode) {
      this._finishRoll(isD6, sides, diceEl, resultArea, true);
      return;
    }

    diceEl.classList.add('spinning');

    // Animate random numbers during spin
    let spinCount = 0;
    const spinInterval = setInterval(() => {
      diceEl.textContent = Math.floor(Math.random() * sides) + 1;
      spinCount++;
      if (spinCount >= 15) {
        clearInterval(spinInterval);
        diceEl.classList.remove('spinning');
        this._finishRoll(isD6, sides, diceEl, resultArea, false);
      }
    }, 80);
  },

  _finishRoll(isD6, sides, diceEl, resultArea, isFastMode) {
    const targetDC = this._pendingTargetDC || 15;
    const result = isD6 ? this.rollD6(this._pendingModifier || 0) : this.rollD20(this._pendingModifier || 0, targetDC);
    diceEl.textContent = result.roll;

    let cls = this.getInterpretationClass(result);
    if (isD6) {
      if (result.roll === 1) cls = 'crit-fail';
      else if (result.roll === 6) cls = 'crit-success';
      else if (result.total <= 2) cls = 'fail';
      else if (result.total <= 4) cls = 'partial';
      else cls = 'success';
    }

    diceEl.className = `dice-${this._pendingDiceType} result-${cls}`;

    resultArea.classList.remove('hidden');
    document.getElementById('dice-total').textContent = result.total;
    document.getElementById('dice-interpretation').textContent = result.interpretation;
    document.getElementById('dice-interpretation').className = `dice-interpretation ${cls}`;

    // Particle effect for crits
    if ((isD6 && (result.roll === 1 || result.roll === 6)) || (!isD6 && (result.roll === 1 || result.roll === 20))) {
      this._triggerCritEffect(isD6 ? result.roll === 6 : result.roll === 20);
    }

    // Auto-close and callback
    setTimeout(() => {
      document.getElementById('dice-overlay').classList.remove('active');
      if (this._pendingCallback) {
        this._pendingCallback(result);
        this._pendingCallback = null;
      }
    }, isFastMode ? 600 : 2000);
  },

  _triggerCritEffect(isSuccess) {
    const overlay = document.getElementById('dice-overlay');
    const cls = isSuccess ? 'crit-success-flash' : 'crit-fail-flash';
    overlay.classList.add(cls);
    setTimeout(() => overlay.classList.remove(cls), 1000);

    // Create particles
    this._createParticles(isSuccess ? '#ffd700' : '#c62828', isSuccess ? 20 : 15);
  },

  _createParticles(color, count) {
    const container = document.getElementById('dice-particles');
    if (!container) return;
    container.innerHTML = '';
    for (let i = 0; i < count; i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      p.style.cssText = `
        left: ${40 + Math.random() * 20}%;
        top: ${40 + Math.random() * 20}%;
        background: ${color};
        --dx: ${(Math.random() - 0.5) * 200}px;
        --dy: ${(Math.random() - 0.5) * 200}px;
        animation-delay: ${Math.random() * 0.3}s;
      `;
      container.appendChild(p);
    }
    setTimeout(() => { container.innerHTML = ''; }, 1500);
  },

  // Calculate modifier from character stats
  getModifier(statKey) {
    if (!GameState.character) return 0;
    const stat = GameState.character.stats[statKey] || 5;
    return Math.floor((stat - 5) / 2);
  },

  // Parse modifier from DM's modifier text
  parseModifierFromText(modText, character) {
    if (!modText || !character) return 0;
    // Try to extract number like "+2", "-1", "0"
    const match = modText.match(/([+-]?\d+)/);
    if (match) return parseInt(match[1]);
    // Map stat names to values
    const statMap = { str: 'str', int: 'int', agi: 'agi', end: 'end', cha: 'cha' };
    for (const [key, val] of Object.entries(statMap)) {
      if (modText.toLowerCase().includes(key)) {
        return this.getModifier(val);
      }
    }
    return 0;
  },

  closeDiceOverlay() {
    document.getElementById('dice-overlay').classList.remove('active');
    const resultArea = document.getElementById('dice-result-area');
    if (!resultArea || resultArea.classList.contains('hidden')) {
      this._pendingCallback = null;
    }
  },
};
