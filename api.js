// api.js — Клиент для связи с бэкендом Digit

class GameAPI {
  constructor() { 
    // Твой актуальный адрес сервера на Railway
    this.baseURL = "https://math-game-production-f196.up.railway.app"; 
  }

  // --- УНИВЕРСАЛЬНЫЙ МЕТОД ЗАПРОСА (С защитой Telegram) ---
  async request(endpoint, options = {}) {
    // Достаем подпись телеграма, чтобы сервер знал, что мы не читеры
    const initData = window.Telegram?.WebApp?.initData || "";
    
    const headers = {
      "Content-Type": "application/json",
      "X-Telegram-Init-Data": initData,
      ...(options.headers || {})
    };

    const config = { ...options, headers };
    const response = await fetch(`${this.baseURL}${endpoint}`, config);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const error = new Error(errorData.error || `HTTP ${response.status}`);
      error.status = response.status;
      error.reason = errorData.reason;
      
      // 👇 ВАЖНО: Прокидываем все данные ошибки (включая actionUrl для Телеграма) 👇
      Object.assign(error, errorData);
      
      throw error;
    }

    return response.json();
  }

  // ==========================================
  // 🎮 ИГРОВОЙ ЦИКЛ (Старт и Финиш)
  // ==========================================

  // Вызывается перед стартом: списывает 1 ⚡ и дает ID сессии
  async sessionStart() {
    return this.request("/api/session/start", { method: "POST" });
  }

  // Вызывается когда время вышло: отправляет очки и получает билеты 🎟️
  async sessionFinish(sessionId, finalScore) {
    return this.request("/api/session/finish", {
      method: "POST",
      body: JSON.stringify({ 
        session_id: sessionId, 
        score: finalScore 
      })
    });
  }

  // ==========================================
  // 🏆 ЛИДЕРБОРД И ПРОФИЛЬ
  // ==========================================

  // Получить Топ-100 игроков
  async getLeaderboard(offset = 0, limit = 100) {
    return this.request(`/api/leaderboard?offset=${offset}&limit=${limit}`);
  }

  // Получить свою статистику (Билеты, Энергия, Ранг)
  async getMyStats() {
    return this.request(`/api/user/me/stats`);
  }

  // Получить историю своих игр (с пагинацией)
  async getMyHistory(offset = 0) {
    return this.request(`/api/user/me/history?offset=${offset}`);
  }

  // ==========================================
  // 🎯 МИССИИ
  // ==========================================
  
  // Получить список миссий
  async getMissions() {
    return this.request(`/api/user/me/missions`);
  }

  // Забрать награду за миссию
  async claimMission(dbId) {
    return this.request(`/api/user/me/missions/claim`, {
      method: "POST",
      body: JSON.stringify({ dbId })
    });
  }

  // ==========================================
  // 🗓️ ЕЖЕДНЕВНЫЙ ВХОД (DAILY CHECK-IN)
  // ==========================================
  
  async getCheckinStatus() {
    return this.request(`/api/user/checkin/status`);
  }

  async claimDaily() {
    return this.request(`/api/user/checkin/claim`, { method: "POST" });
  }
}

// Делаем API глобальным, чтобы game.js мог к нему обращаться
window.API = new GameAPI();
