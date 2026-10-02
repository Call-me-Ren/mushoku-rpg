// ============================================================
// API.JS — Gemini API Integration
// ============================================================

const GeminiAPI = {
  BASE_URL: 'https://generativelanguage.googleapis.com/v1beta/models',
  MAX_RETRIES: 3,
  pendingResponse: false,  // true khi đang chờ Quản Trò phản hồi

  // Kiểm tra có phải lỗi tạm thời (server quá tải, rate limit)
  _isRetryable(errMsg) {
    return (
      errMsg.includes('high demand') ||
      errMsg.includes('overloaded') ||
      errMsg.includes('503') ||
      errMsg.includes('429') ||
      errMsg.includes('rate limit') ||
      errMsg.includes('quota') ||
      errMsg.includes('try again later')
    );
  },

  // Retry wrapper với exponential backoff
  async _fetchWithRetry(url, requestBody, attempt = 1) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errText = await response.text();
        let errMsg = `Lỗi API (${response.status})`;
        try {
          const errJson = JSON.parse(errText);
          errMsg = errJson.error?.message || errMsg;
        } catch (_) {}

        // Nếu là lỗi có thể retry và còn lần thử
        if (this._isRetryable(errMsg) && attempt < this.MAX_RETRIES) {
          const delay = attempt * 8000; // 8s, 16s
          UI.showToast(`⏳ Server bận, thử lại sau ${delay/1000}s... (${attempt}/${this.MAX_RETRIES})`, 'error');
          await new Promise(r => setTimeout(r, delay));
          return this._fetchWithRetry(url, requestBody, attempt + 1);
        }
        throw new Error(errMsg);
      }

      return await response.json();
    } catch (e) {
      // Network error – retry
      if (attempt < this.MAX_RETRIES && !(e.message.includes('Lỗi API'))) {
        const delay = attempt * 5000;
        UI.showToast(`🔄 Mất kết nối, thử lại sau ${delay/1000}s...`, 'error');
        await new Promise(r => setTimeout(r, delay));
        return this._fetchWithRetry(url, requestBody, attempt + 1);
      }
      throw e;
    }
  },

  async sendMessage(userMessage, diceResult = null) {
    const apiKey = GameState.apiKey;
    const model = GameState.modelName;

    if (!apiKey) throw new Error('Chưa có API key. Vui lòng nhập API key trong cài đặt.');

    // Build current message (with dice result if present)
    const fullMessage = buildUserMessage(userMessage, diceResult);

    // Add to chat history
    GameState.addChatMessage('user', fullMessage);

    // Build request body
    const systemPrompt = buildSystemPrompt(GameState);
    const requestBody = {
      system_instruction: {
        parts: [{ text: systemPrompt }]
      },
      contents: GameState.chatHistory.map(msg => ({ role: msg.role, parts: msg.parts })),
      generationConfig: {
        temperature: 0.9,
        maxOutputTokens: 2048,
        // responseMimeType only works on some models; fallback handled by _parseResponse
        ...(model.includes('1.5') || model.includes('2.') ? { responseMimeType: 'application/json' } : {}),
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      ],
    };

    const url = `${this.BASE_URL}/${model}:generateContent?key=${apiKey}`;

    let responseData;
    try {
      this.pendingResponse = true;
      responseData = await this._fetchWithRetry(url, requestBody);
    } catch (e) {
      this.pendingResponse = false;
      // Remove the failed user message from history
      GameState.chatHistory.pop();
      throw e;
    }

    // Extract text from response
    const rawText = responseData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!rawText) {
      GameState.chatHistory.pop();
      throw new Error('Gemini không trả về nội dung. Thử lại.');
    }

    // Parse JSON response
    const parsed = this._parseResponse(rawText);

    // Add model response to history
    GameState.addChatMessage('model', rawText);

    // Apply state changes
    if (parsed.state_changes) {
      GameState.applyStateChanges(parsed.state_changes);
    }
    if (parsed.npc_updates) {
      GameState.updateNPCMemory(parsed.npc_updates);
    }
    if (parsed.story_note) {
      GameState.addStoryNote(parsed.story_note);
    }

    GameState.turnCount++;

    // Snapshot the state after applying all changes
    const stateSnapshot = {
      character: JSON.parse(JSON.stringify(GameState.character)),
      location: GameState.location,
      npcMemory: JSON.parse(JSON.stringify(GameState.npcMemory)),
      storySummary: GameState.storySummary,
      storyNotes: JSON.parse(JSON.stringify(GameState.storyNotes)),
      turnCount: GameState.turnCount
    };
    if (GameState.chatHistory.length > 0) {
      GameState.chatHistory[GameState.chatHistory.length - 1].stateSnapshot = stateSnapshot;
    }

    // Mark response received
    this.pendingResponse = false;

    // Normalize: if AI returns 'choices', copy to 'suggested_actions' for UI
    if (parsed.choices && !parsed.suggested_actions) {
      parsed.suggested_actions = parsed.choices;
    }
    if (!parsed.choices && parsed.suggested_actions) {
      parsed.choices = parsed.suggested_actions;
    }

    // Ensure EXACTLY 4 choices labelled A/B/C/D
    parsed.choices = this._padChoices(parsed.choices || parsed.suggested_actions || []);
    parsed.suggested_actions = parsed.choices;

    // Persist last choices so they survive save/load
    GameState.lastChoices = parsed.choices;

    // Auto-save to slot 0
    GameState.saveToSlot(0);

    return parsed;
  },

  // Always return an array of exactly 4 labelled choices
  _padChoices(arr) {
    const labels = ['A', 'B', 'C', 'D'];
    const defaults = [
      'Tiếp tục quan sát tình hình',
      'Hỏi thăm người xung quanh',
      'Thận trọng đợi chờ và theo dõi',
      'Tự động hành động theo bản năng',
    ];
    const result = [];
    for (let i = 0; i < 4; i++) {
      let text = arr[i] || defaults[i];
      // Strip any existing A:/B:/C:/D: prefix then re-add correctly
      text = text.replace(/^[A-D]:\s*/i, '').trim();
      result.push(`${labels[i]}: ${text}`);
    }
    return result;
  },

  _parseResponse(rawText) {
    // Try direct JSON parse
    try {
      return JSON.parse(rawText);
    } catch (_) {}

    // Try extracting JSON from markdown code block
    const match = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) {
      try {
        return JSON.parse(match[1]);
      } catch (_) {}
    }

    // Find first { ... } block
    const start = rawText.indexOf('{');
    const end = rawText.lastIndexOf('}');
    if (start !== -1 && end !== -1) {
      try {
        return JSON.parse(rawText.substring(start, end + 1));
      } catch (_) {}
    }

    // Fallback: treat as plain narrative
    return {
      narrative: rawText,
      requires_roll: false,
      roll_modifier: 0,
      roll_modifier_text: '+0',
      roll_context: '',
      state_changes: {},
      choices: ['A: Tiếp tục quan sát', 'B: Hỏi thăm xung quanh', 'C: Thận trọng đợi đợi', 'D: Tự đị̣nh hướng'],
      npc_updates: {},
      story_note: '',
    };
  },

  // Send opening message to start a new game
  async startGame() {
    const char = GameState.character;
    if (!char) throw new Error('Chưa tạo nhân vật.');

    const openingMsg = buildOpeningMessage(char);
    return await this.sendMessage(openingMsg);
  },

  // Validate API key
  async validateKey(apiKey, model) {
    const url = `${this.BASE_URL}/${model}:generateContent?key=${apiKey}`;
    const body = {
      contents: [{ role: 'user', parts: [{ text: 'Xin chào, phản hồi bằng JSON: {"ok": true}' }] }],
      generationConfig: { maxOutputTokens: 20, responseMimeType: 'application/json' },
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.ok;
  },
};
