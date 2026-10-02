// ============================================================
// GAME.JS — Game State Management
// ============================================================

const GameState = {
  // Settings
  apiKey: '',
  modelName: 'gemini-2.0-flash',

  // Character data
  character: null,

  // World state
  location: 'Không rõ',
  npcMemory: {},

  // Story
  storySummary: '',
  storyNotes: [],
  chatHistory: [],
  turnCount: 0,
  lastChoices: [],   // các lựa chọn A/B/C/D của lượt cuối cùng
  pendingDiceRoll: null,

  // Save slots
  SAVE_VERSION: '1.0',

  // ---- INIT ----
  init() {
    this.apiKey = localStorage.getItem('rpg_api_key') || '';
    this.modelName = localStorage.getItem('rpg_model') || 'gemini-2.0-flash';
  },

  // ---- CHARACTER CREATION ----
  createCharacter(data) {
    const race = RACES[data.raceId];
    const base = { str: 5, int: 5, agi: 5, end: 5, cha: 5 };

    // Apply race bonuses
    if (race.bonuses) {
      for (const [stat, val] of Object.entries(race.bonuses)) {
        base[stat] = (base[stat] || 0) + val;
      }
    }

    // Apply user distributed points
    for (const [stat, val] of Object.entries(data.extraPoints)) {
      base[stat] = (base[stat] || 0) + val;
    }

    // Derive HP/Mana/Stamina from stats
    const maxHp = 80 + base.end * 8 + (data.background === 'local' ? 20 : 0);
    const maxMana = 60 + base.int * 8 + (race.magicBonus || 0);
    const maxStamina = 80 + base.str * 4 + base.agi * 4;

    // Starting equipment based on background and focus
    const startInventory = this._getStartInventory(data.background, data.focus);
    const startSkills = this._getStartSkills(data.focus, data.raceId, data.magicElement);
    const startLocation = this._getStartLocation(data.background, data.raceId);

    this.character = {
      name: data.name,
      race: race.name,
      raceId: data.raceId,
      background: data.background,
      startingFocus: data.focus,
      startingLocation: startLocation,
      magicElement: data.magicElement || null,
      combatStyle: data.combatStyle || null,
      level: 1,
      xp: 0,
      xpToNext: 100,
      hp: maxHp,
      maxHp,
      mana: maxMana,
      maxMana,
      stamina: maxStamina,
      maxStamina,
      gold: data.background === 'isekai' ? 50000 : 120000,
      stats: base,
      inventory: startInventory,
      equipment: {
        weapon: null,
        armor: null,
        accessory: null,
        offhand: null,
      },
      skills: startSkills,
      statusEffects: [],
      raceTraits: race.traits || [],
    };

    this.location = startLocation;
    this.chatHistory = [];
    this.storySummary = '';
    this.storyNotes = [];
    this.npcMemory = {};
    this.turnCount = 0;
    this.lastChoices = [];
    this.pendingDiceRoll = null;
  },

  _getStartInventory(background, focus) {
    const base = [
      { id: 'bread', name: 'Bánh mì khô', desc: 'Lương thực cơ bản. Đủ ăn 1 ngày.', qty: 3, type: 'consumable' },
      { id: 'waterskin', name: 'Bình nước', desc: 'Bình da đựng nước, đã đầy.', qty: 1, type: 'misc' },
    ];

    if (background === 'local') {
      // Tiền tệ được quản lý ở chỉ số Gold trên bảng trạng thái, không cần bỏ vào túi đồ
    }

    if (focus === 'magic') {
      base.push({ id: 'magic_tome_basic', name: 'Sách phép cơ bản', desc: 'Sách giới thiệu nguyên lý phép thuật cơ bản. Rất cũ.', qty: 1, type: 'misc' });
    } else if (focus === 'combat') {
      base.push({ id: 'iron_sword', name: 'Kiếm sắt cũ', desc: 'Kiếm sắt thông thường. Không sắc bén lắm nhưng đáng tin cậy.', qty: 1, type: 'weapon', atk: 8, equipped: false });
      base.push({ id: 'leather_armor', name: 'Áo da cứng', desc: 'Áo giáp da cứng cơ bản. Cung cấp chút bảo vệ.', qty: 1, type: 'armor', def: 5, equipped: false });
    } else if (focus === 'rogue') {
      base.push({ id: 'dagger', name: 'Dao găm', desc: 'Dao găm nhẹ, thích hợp cho tấn công lén.', qty: 1, type: 'weapon', atk: 5, equipped: false });
      base.push({ id: 'lockpick', name: 'Bộ phá khóa', desc: 'Dụng cụ mở khóa cơ bản.', qty: 1, type: 'misc' });
    }

    return base;
  },

  _getStartSkills(focus, raceId, magicElement) {
    const skills = [];
    const race = RACES[raceId];

    // Race innate skills
    if (race.innateSkills) skills.push(...race.innateSkills);

    // Focus skills
    if (focus === 'magic') {
      skills.push(`Phép thuật ${magicElement || 'Đất'} — Sơ cấp`);
      skills.push('Tụng chú cơ bản');
    } else if (focus === 'combat') {
      skills.push('Đấu pháp cơ bản');
      skills.push('Touki — Sơ cấp (bản năng)');
    } else if (focus === 'rogue') {
      skills.push('Ẩn thân cơ bản');
      skills.push('Tấn công bất ngờ');
      skills.push('Đọc tình huống');
    }

    return skills;
  },

  _getStartLocation(background, raceId) {
    if (background === 'isekai') {
      const isekai_locations = [
        'Vùng hoang dã gần Fittoa, Vương quốc Asura',
        'Ngoại ô Roa, Vương quốc Asura',
        'Một cánh đồng hoang sau Sự cố Dịch chuyển',
        'Rừng phía bắc Vương quốc Asura',
      ];
      return isekai_locations[Math.floor(Math.random() * isekai_locations.length)];
    }

    const local_locations = {
      human: 'Thị trấn Roa, Vương quốc Asura',
      elf: 'Rừng phía nam, Vùng Great Forest',
      dwarf: 'Khu mỏ vùng núi, Lục địa Millis',
      beastfolk: 'Làng bộ lạc, Great Forest',
      demon: 'Khu định cư ven đô, Roa',
      migurd: 'Làng Migurd, Lục địa Quỷ',
      supard: 'Khu định cư bí mật của người Supard',
    };

    return local_locations[raceId] || 'Thị trấn nhỏ, Vương quốc Asura';
  },

  // ---- STATE UPDATES ----
  applyStateChanges(changes) {
    if (!this.character) return;
    const c = this.character;

    if (changes.hp_change) {
      c.hp = Math.max(0, Math.min(c.maxHp, c.hp + changes.hp_change));
    }
    if (changes.mana_change) {
      c.mana = Math.max(0, Math.min(c.maxMana, c.mana + changes.mana_change));
    }
    if (changes.stamina_change) {
      c.stamina = Math.max(0, Math.min(c.maxStamina, c.stamina + changes.stamina_change));
    }
    if (changes.xp_change) {
      c.xp += changes.xp_change;
      while (c.xp >= c.xpToNext) {
        c.xp -= c.xpToNext;
        c.level++;
        c.xpToNext = Math.floor(c.xpToNext * 1.5);
        // Level up bonuses
        c.maxHp += 10;
        c.hp = Math.min(c.hp + 10, c.maxHp);
        c.maxMana += 5;
        c.maxStamina += 8;
      }
    }
    if (changes.gold_change) {
      c.gold = Math.max(0, c.gold + changes.gold_change);
    }
    if (changes.items_gained && changes.items_gained.length > 0) {
      c.inventory.push(...changes.items_gained);
    }
    if (changes.items_lost && changes.items_lost.length > 0) {
      changes.items_lost.forEach(lostName => {
        const idx = c.inventory.findIndex(i => i.name === lostName || i.id === lostName);
        if (idx !== -1) c.inventory.splice(idx, 1);
      });
    }
    if (changes.new_location && changes.new_location !== null) {
      this.location = changes.new_location;
    }
    if (changes.status_effects_add && changes.status_effects_add.length > 0) {
      c.statusEffects.push(...changes.status_effects_add.filter(e => !c.statusEffects.includes(e)));
    }
    if (changes.status_effects_remove && changes.status_effects_remove.length > 0) {
      c.statusEffects = c.statusEffects.filter(e => !changes.status_effects_remove.includes(e));
    }
    if (changes.skills_gained && changes.skills_gained.length > 0) {
      changes.skills_gained.forEach(s => { if (!c.skills.includes(s)) c.skills.push(s); });
    }
  },

  updateNPCMemory(updates) {
    if (!updates) return;
    for (const [npc, info] of Object.entries(updates)) {
      this.npcMemory[npc] = { ...(this.npcMemory[npc] || {}), ...info };
    }
  },

  addStoryNote(note) {
    if (note) this.storyNotes.push(note);
    // Summarize every 10 turns
    if (this.storyNotes.length >= 10) {
      const summary = this.storyNotes.join(' | ');
      this.storySummary = this.storySummary
        ? this.storySummary + '\n' + summary
        : summary;
      this.storyNotes = [];
      // Trim chat history to keep last 20 exchanges
      if (this.chatHistory.length > 40) {
        this.chatHistory = this.chatHistory.slice(-40);
      }
    }
  },

  addChatMessage(role, text) {
    this.chatHistory.push({ role, parts: [{ text }] });
  },

  // ---- SAVE / LOAD ----
  saveToSlot(slot) {
    const data = {
      version: this.SAVE_VERSION,
      savedAt: new Date().toISOString(),
      character: this.character,
      location: this.location,
      npcMemory: this.npcMemory,
      storySummary: this.storySummary,
      storyNotes: this.storyNotes,
      chatHistory: this.chatHistory.slice(-30),
      turnCount: this.turnCount,
      lastChoices: this.lastChoices || [],
      pendingDiceRoll: this.pendingDiceRoll || null,
    };
    localStorage.setItem(`rpg_save_${slot}`, JSON.stringify(data));
    return data;
  },

  loadFromSlot(slot) {
    const raw = localStorage.getItem(`rpg_save_${slot}`);
    if (!raw) return false;
    try {
      const data = JSON.parse(raw);
      this.character = data.character;
      this.location = data.location;
      this.npcMemory = data.npcMemory;
      this.storySummary = data.storySummary;
      this.storyNotes = data.storyNotes || [];
      this.chatHistory = data.chatHistory || [];
      this.turnCount = data.turnCount || 0;
      this.lastChoices = data.lastChoices || [];
      this.pendingDiceRoll = data.pendingDiceRoll || null;
      return data;
    } catch (e) {
      console.error('Load failed:', e);
      return false;
    }
  },

  getSaveInfo(slot) {
    const raw = localStorage.getItem(`rpg_save_${slot}`);
    if (!raw) return null;
    try {
      const data = JSON.parse(raw);
      return {
        name: data.character?.name || 'Không rõ',
        race: data.character?.race || '',
        level: data.character?.level || 1,
        location: data.location || '',
        savedAt: data.savedAt,
        turnCount: data.turnCount || 0,
      };
    } catch (e) { return null; }
  },

  exportToFile(slot) {
    const raw = localStorage.getItem(`rpg_save_${slot}`);
    if (!raw) return;
    const blob = new Blob([raw], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mushoku_rpg_save_${slot}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  importFromFile(file, slot) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);
          localStorage.setItem(`rpg_save_${slot}`, JSON.stringify(data));
          resolve(data);
        } catch (err) { reject(err); }
      };
      reader.readAsText(file);
    });
  },

  isDead() {
    return this.character && this.character.hp <= 0;
  }
};

// ============================================================
// RACES DATA
// ============================================================
const RACES = {
  human: {
    name: 'Con Người',
    desc: 'Chủng tộc phổ biến và thích nghi nhất. Không có lợi thế bẩm sinh đặc biệt, nhưng vượt trội nhờ học hỏi, tham vọng và số lượng. Dễ hòa nhập xã hội.',
    bonuses: { str: 1, int: 1, agi: 1, end: 1, cha: 1 },
    magicBonus: 0,
    traits: ['Thích nghi nhanh (+10% kinh nghiệm)', 'Không bị kỳ thị chủng tộc'],
    innateSkills: ['Quan sát cơ bản'],
    socialPenalty: false,
  },
  beastfolk: {
    name: 'Thú Nhân',
    desc: 'Người-thú với tai và đuôi động vật. Giác quan siêu việt, nhanh nhẹn và bản năng chiến đấu mạnh. Sống chủ yếu ở Great Forest trong xã hội bộ lạc.',
    bonuses: { str: 2, agi: 3, end: 1 },
    magicBonus: -10,
    traits: ['Khứu giác & thính giác siêu việt', 'Bản năng săn mồi', 'Bị nghi ngờ ở đô thị'],
    innateSkills: ['Giác quan thú nhân (ngửi/nghe tốt hơn)', 'Bản năng sinh tồn'],
    socialPenalty: false,
  },
  elf: {
    name: 'Tiên Tộc',
    desc: 'Chủng tộc sống lâu với tai nhọn. Thiên hướng về phép thuật và tự nhiên. Sống ở rừng phía nam Great Forest và một số rừng ẩn trên Lục địa Trung Tâm.',
    bonuses: { int: 2, agi: 2, cha: 1 },
    magicBonus: 20,
    traits: ['Tuổi thọ cao', 'Thân với thiên nhiên và phép thuật', 'Bị một số nơi xa cách'],
    innateSkills: ['Hòa hợp thiên nhiên', 'Trực giác phép thuật'],
    socialPenalty: false,
  },
  dwarf: {
    name: 'Người Lùn',
    desc: 'Chủng tộc lùn vạm vỡ, bậc thầy thủ công. Sống chủ yếu ở vùng núi. Cực kỳ bền bỉ và giỏi chế tạo, sửa chữa.',
    bonuses: { str: 2, end: 3 },
    magicBonus: -5,
    traits: ['Bền bỉ phi thường', 'Kỹ năng thủ công xuất sắc', 'Kháng độc tốt hơn'],
    innateSkills: ['Thủ công cơ bản', 'Đánh giá chất lượng vũ khí/giáp'],
    socialPenalty: false,
  },
  demon: {
    name: 'Quỷ Tộc',
    desc: 'Chủng tộc cổ đại với vô số sub-race. Năng lực phép thuật mạnh, nhiều khả năng đặc biệt. Chủ yếu ở Lục địa Quỷ. Thường bị kỳ thị ở đất người.',
    bonuses: { int: 3, end: 1, cha: 1 },
    magicBonus: 30,
    traits: ['Thiên hướng phép thuật mạnh', 'Bị kỳ thị và nghi ngờ ở vùng người', 'Khả năng đặc biệt của sub-race'],
    innateSkills: ['Cảm nhận mana', 'Kháng phép thuật nhẹ'],
    socialPenalty: true,
  },
  migurd: {
    name: 'Migurd',
    desc: 'Bộ lạc quỷ tộc nhỏ với tóc xanh và tài năng phép thuật mạnh. Giao tiếp bằng thần giao cách cảm tầm ngắn. Sống hơn 200 năm.',
    bonuses: { int: 3, end: 2 },
    magicBonus: 40,
    traits: ['Thần giao cách cảm tầm ngắn', 'Tuổi thọ >200 năm', 'Bị nhìn với ánh mắt kỳ lạ'],
    innateSkills: ['Thần giao cách cảm (100m)', 'Phép thuật Migurd sơ cấp'],
    socialPenalty: true,
  },
  supard: {
    name: 'Supard',
    desc: 'Chủng tộc chiến binh kiêu hãnh với tóc xanh lá và con mắt thứ ba. Mắt thứ ba cảm nhận ý định và sự hiện diện. Bị sợ hãi và căm ghét sau Chiến tranh Laplace.',
    bonuses: { str: 3, agi: 2, end: 1 },
    magicBonus: 0,
    traits: ['Mắt thứ ba (cảm nhận ý định)', 'Sức mạnh và tốc độ vượt trội', 'BỊ KỲ THỊ NẶNG NỀ ở mọi nơi (ngoại trừ Lục địa Quỷ)'],
    innateSkills: ['Mắt thứ ba — cảm nhận ý định sống', 'Chiến đấu Supard sơ cấp'],
    socialPenalty: true,
  },
};
