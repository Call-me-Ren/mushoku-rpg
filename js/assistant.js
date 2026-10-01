// ============================================================
// ASSISTANT.JS — AI Chat Assistant Logic
// ============================================================

const AssistantAI = {
  history: [],
  isOpen: false,

  init() {
    const fab = document.getElementById('assistant-fab');
    const closeBtn = document.getElementById('assistant-close-btn');
    const sendBtn = document.getElementById('assistant-send-btn');
    const input = document.getElementById('assistant-input');

    if (fab) fab.addEventListener('click', () => this.togglePanel());
    if (closeBtn) closeBtn.addEventListener('click', () => this.togglePanel(false));
    
    if (sendBtn) sendBtn.addEventListener('click', () => this.sendMessage());
    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this.sendMessage();
      });
    }
  },

  togglePanel(forceState) {
    const panel = document.getElementById('assistant-panel');
    if (!panel) return;
    
    this.isOpen = forceState !== undefined ? forceState : !this.isOpen;
    if (this.isOpen) {
      panel.classList.add('active');
      document.getElementById('assistant-input').focus();
    } else {
      panel.classList.remove('active');
    }
  },

  addMessageToUI(text, role) {
    const chat = document.getElementById('assistant-chat');
    if (!chat) return;

    const msgDiv = document.createElement('div');
    msgDiv.className = `assistant-msg ${role}-msg`;
    msgDiv.innerHTML = text;
    
    chat.appendChild(msgDiv);
    chat.scrollTop = chat.scrollHeight;
  },

  showLoading(isLoading) {
    const sendBtn = document.getElementById('assistant-send-btn');
    const input = document.getElementById('assistant-input');
    const chat = document.getElementById('assistant-chat');

    if (isLoading) {
      sendBtn.disabled = true;
      input.disabled = true;
      const loading = document.createElement('div');
      loading.id = 'assistant-loading';
      loading.className = 'assistant-msg ai-msg';
      loading.innerHTML = '<span class="loading-dots">Đang suy nghĩ<span>.</span><span>.</span><span>.</span></span>';
      chat.appendChild(loading);
      chat.scrollTop = chat.scrollHeight;
    } else {
      sendBtn.disabled = false;
      input.disabled = false;
      const loading = document.getElementById('assistant-loading');
      if (loading) loading.remove();
      input.focus();
    }
  },

  async sendMessage() {
    const input = document.getElementById('assistant-input');
    const text = input.value.trim();
    if (!text) return;

    const apiKey = GameState.apiKey;
    const model = GameState.modelName;

    if (!apiKey) {
      this.addMessageToUI('⚠️ Vui lòng nhập API Key trong phần Cài đặt trước.', 'ai');
      return;
    }

    // UI Updates
    input.value = '';
    this.addMessageToUI(text, 'user');
    this.history.push({ role: 'user', parts: [{ text }] });
    
    this.showLoading(true);

    // Build context-aware system prompt
    const systemInstruction = `
Bạn là Trợ lý AI Thông Thái, một bách khoa toàn thư tích hợp trong game nhập vai Mushoku Tensei.
Nhiệm vụ của bạn:
- Giải thích luật chơi, chỉ số, ý nghĩa của các lựa chọn.
- Phân tích tình huống hiện tại dựa trên tóm tắt cốt truyện.
- Gợi ý lối chơi, giải thích cơ chế xúc xắc.
- Bạn KHÔNG phải là Quản Trò (DM). Không được quyết định hành động thay người chơi, không tung xúc xắc.
- Trả lời ngắn gọn, thân thiện, dễ hiểu. Format markdown thoải mái.

[THÔNG TIN GAME HIỆN TẠI ĐỂ BẠN THAM KHẢO]
- Tên nhân vật: ${GameState.character?.name || 'Chưa rõ'}
- Nghề/Hướng đi: ${GameState.character?.startingFocus || 'Chưa rõ'}
- Tóm tắt diễn biến: ${GameState.storySummary || 'Chưa có'}
- Lượt thứ: ${GameState.turnCount || 0}
    `;

    const requestBody = {
      system_instruction: { parts: [{ text: systemInstruction }] },
      contents: this.history,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1024,
      }
    };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    try {
      const responseData = await GeminiAPI._fetchWithRetry(url, requestBody);
      
      const replyText = responseData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      
      if (replyText) {
        // Format markdown slightly
        const formatted = replyText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
        this.addMessageToUI(formatted, 'ai');
        this.history.push({ role: 'model', parts: [{ text: replyText }] });
      } else {
        this.addMessageToUI('⚠️ Lỗi: Không nhận được phản hồi từ AI.', 'ai');
        this.history.pop();
      }

    } catch (err) {
      this.addMessageToUI(`⚠️ Lỗi: ${err.message}`, 'ai');
      this.history.pop(); // remove user message so they can try again
    } finally {
      this.showLoading(false);
    }
  }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  AssistantAI.init();
});
