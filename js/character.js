// ============================================================
// CHARACTER.JS — Character Creation Flow
// ============================================================

const CharacterCreation = {
  selectedRace: null,
  selectedBackground: null,
  selectedFocus: null,
  selectedMagicElement: null,
  selectedCombatStyle: null,
  extraPoints: { str: 0, int: 0, agi: 0, end: 0, cha: 0 },
  pointsRemaining: 8,

  init() {
    this.renderRaceSelection();
    this.setupPointAllocation();
    this.updateCharacterPreview();
  },

  renderRaceSelection() {
    const container = document.getElementById('race-grid');
    container.innerHTML = '';

    Object.entries(RACES).forEach(([id, race]) => {
      const card = document.createElement('div');
      card.className = 'race-card';
      card.dataset.raceId = id;

      const bonusText = Object.entries(race.bonuses)
        .map(([s, v]) => `${s.toUpperCase()}+${v}`)
        .join(' ');

      card.innerHTML = `
        <div class="race-icon">${this._getRaceIcon(id)}</div>
        <div class="race-name">${race.name}</div>
        <div class="race-bonuses">${bonusText}</div>
        <div class="race-desc">${race.desc}</div>
        ${race.socialPenalty ? '<div class="race-warning">⚠ Bị kỳ thị xã hội</div>' : ''}
      `;
      card.onclick = () => this.selectRace(id);
      container.appendChild(card);
    });

    // We no longer select human by default so the user is forced to choose
  },

  selectRace(id) {
    this.selectedRace = id;
    document.querySelectorAll('.race-card').forEach(c => {
      c.classList.toggle('selected', c.dataset.raceId === id);
    });

    // Update traits display
    const race = RACES[id];
    const traitsEl = document.getElementById('race-traits-preview');
    if (traitsEl) {
      traitsEl.innerHTML = race.traits.map(t => `<li>${t}</li>`).join('');
    }

    this.updateCharacterPreview();
  },

  setupPointAllocation() {
    ['str', 'int', 'agi', 'end', 'cha'].forEach(stat => {
      const plusBtn = document.getElementById(`plus-${stat}`);
      const minusBtn = document.getElementById(`minus-${stat}`);

      if (plusBtn) {
        plusBtn.onclick = () => this.adjustStat(stat, 1);
      }
      if (minusBtn) {
        minusBtn.onclick = () => this.adjustStat(stat, -1);
      }
    });
  },

  adjustStat(stat, delta) {
    const newVal = (this.extraPoints[stat] || 0) + delta;
    const remaining = this.pointsRemaining - delta;

    if (newVal < 0 || remaining < 0 || remaining > 8) return;
    if (newVal > 4) return; // max +4 per stat

    this.extraPoints[stat] = newVal;
    this.pointsRemaining = remaining;

    document.getElementById(`extra-${stat}`).textContent = `+${newVal}`;
    document.getElementById('points-remaining').textContent = this.pointsRemaining;
    this.updateCharacterPreview();
  },

  updateCharacterPreview() {
    if (!this.selectedRace) return;
    const race = RACES[this.selectedRace];

    const base = { str: 5, int: 5, agi: 5, end: 5, cha: 5 };

    // Race bonuses
    if (race.bonuses) {
      for (const [s, v] of Object.entries(race.bonuses)) base[s] += v;
    }
    // Extra points
    for (const [s, v] of Object.entries(this.extraPoints)) base[s] += v;

    // Preview stats
    ['str', 'int', 'agi', 'end', 'cha'].forEach(s => {
      const el = document.getElementById(`preview-${s}`);
      if (el) el.textContent = base[s];
    });

    // Derived values
    const maxHp = 80 + base.end * 8 + (this.selectedBackground === 'local' ? 20 : 0);
    const maxMana = 60 + base.int * 8 + (race.magicBonus || 0);
    const maxStamina = 80 + base.str * 4 + base.agi * 4;

    const previewHp = document.getElementById('preview-hp');
    const previewMana = document.getElementById('preview-mana');
    const previewStamina = document.getElementById('preview-stamina');
    if (previewHp) previewHp.textContent = maxHp;
    if (previewMana) previewMana.textContent = maxMana;
    if (previewStamina) previewStamina.textContent = maxStamina;
  },

  setBackground(bg) {
    this.selectedBackground = bg;
    document.querySelectorAll('.bg-option').forEach(el => {
      el.classList.toggle('selected', el.dataset.bg === bg);
    });
    this.updateCharacterPreview();
  },

  setFocus(focus) {
    this.selectedFocus = focus;
    document.querySelectorAll('.focus-option').forEach(el => {
      el.classList.toggle('selected', el.dataset.focus === focus);
    });

    // Show/hide sub-options
    document.getElementById('magic-sub').style.display = focus === 'magic' ? 'block' : 'none';
    document.getElementById('combat-sub').style.display = focus === 'combat' ? 'block' : 'none';
  },

  setMagicElement(element) {
    this.selectedMagicElement = element;
    document.querySelectorAll('.element-option').forEach(el => {
      el.classList.toggle('selected', el.dataset.element === element);
    });
  },

  setCombatStyle(style) {
    this.selectedCombatStyle = style;
    document.querySelectorAll('.style-option').forEach(el => {
      el.classList.toggle('selected', el.dataset.style === style);
    });
  },

  validate() {
    const name = document.getElementById('char-name-input').value.trim();
    if (!name) { UI.showToast('Hãy nhập tên nhân vật!', 'error'); return false; }
    if (!this.selectedRace) { UI.showToast('Hãy chọn chủng tộc!', 'error'); return false; }
    if (!this.selectedBackground) { UI.showToast('Hãy chọn xuất thân!', 'error'); return false; }
    if (!this.selectedFocus) { UI.showToast('Hãy chọn hướng phát triển!', 'error'); return false; }
    if (this.selectedFocus === 'magic' && !this.selectedMagicElement) { UI.showToast('Hãy chọn hệ phép thuật khởi đầu!', 'error'); return false; }
    if (this.selectedFocus === 'combat' && !this.selectedCombatStyle) { UI.showToast('Hãy chọn phong cách kiếm thuật!', 'error'); return false; }
    return true;
  },

  buildCharacterData() {
    return {
      name: document.getElementById('char-name-input').value.trim(),
      raceId: this.selectedRace,
      background: this.selectedBackground,
      focus: this.selectedFocus,
      magicElement: this.selectedFocus === 'magic' ? this.selectedMagicElement : null,
      combatStyle: this.selectedFocus === 'combat' ? this.selectedCombatStyle : null,
      extraPoints: { ...this.extraPoints },
    };
  },

  _getRaceIcon(id) {
    const icons = {
      human: '👤', beastfolk: '🐾', elf: '🌿', dwarf: '⛏',
      demon: '👁', migurd: '💙', supard: '👁‍🗨'
    };
    return icons[id] || '❓';
  },
};
