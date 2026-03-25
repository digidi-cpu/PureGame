// ==========================================
// TELEGRAM INTEGRATION API
// ==========================================

class TelegramIntegration {
  constructor() {
    this.tg = window.Telegram?.WebApp;
    this.isTelegram = !!this.tg;
    this.init();
  }

  init() {
    if (!this.isTelegram) { 
      this.setupBrowserMode(); 
      return; 
    }
    
    try {
      this.tg.ready(); 
      this.tg.expand();
      // Красим хедер телеги в цвет нашего космоса
      this.tg.setHeaderColor?.("#0a0a1a");
      this.tg.setBackgroundColor?.("#0a0a1a");
      
      this.showUserProfile();
    } catch (e) { 
      this.setupBrowserMode(); 
    }
  }

  showUserProfile() {
    const user = this.tg?.initDataUnsafe?.user;
    if (!user) return;

    // Ищем элементы нашего нового профиля
    const profileName = document.querySelector(".p-name");
    const profileAvatarBox = document.querySelector(".p-avatar-box");

    // Ставим имя
    if (profileName) {
      profileName.textContent = user.first_name || user.username || "Astronaut";
    }

    // --- Работа с аватаркой ---
    if (profileAvatarBox) {
      const name = (user.first_name || user.username || "A").trim();
      const fallbackInitial = (name[0] || "A").toUpperCase();
      let url = user.photo_url || "";

      if (url) {
        // Если есть фото, вставляем картинку
        profileAvatarBox.innerHTML = `<img src="${url}" referrerpolicy="no-referrer" style="width: 100%; height: 100%; object-fit: cover; border-radius: 13px;">`;
      } else {
        // Если нет, ставим первую букву имени (как в новом дизайне)
        profileAvatarBox.textContent = fallbackInitial;
      }
    }
  }

  setupBrowserMode() {
    const profileName = document.querySelector(".p-name");
    const profileAvatarBox = document.querySelector(".p-avatar-box");
    
    if (profileName) profileName.textContent = "Space Guest";
    if (profileAvatarBox) profileAvatarBox.textContent = "S"; // S от Space
  }

  getUserId() {
    const tgUser = this.tg?.initDataUnsafe?.user;
    if (tgUser?.id) return `tg_${tgUser.id}`;
    
    let id = localStorage.getItem("digit_user_id");
    if (!id) { 
      id = "guest_" + Math.random().toString(36).slice(2, 12); 
      localStorage.setItem("digit_user_id", id); 
    }
    return id;
  }

  getUsername() {
    const tgUser = this.tg?.initDataUnsafe?.user;
    if (tgUser) return tgUser.username || tgUser.first_name || "Astronaut";
    return "Guest";
  }

  // --- ШИКАРНЫЙ БЛОК С ВИБРАЦИЕЙ ИЗ ПРОШЛОЙ ИГРЫ ---
  vibrate(type = "light") {
    if (this.isTelegram && this.tg.HapticFeedback) {
      switch (type) {
        case "error":   this.tg.HapticFeedback.notificationOccurred("error"); break;
        case "success": this.tg.HapticFeedback.notificationOccurred("success"); break;
        case "light":   this.tg.HapticFeedback.impactOccurred("light"); break;
        case "medium":  this.tg.HapticFeedback.impactOccurred("medium"); break;
        case "heavy":   this.tg.HapticFeedback.impactOccurred("heavy"); break;
        case "rigid":   this.tg.HapticFeedback.impactOccurred("rigid"); break;
        default:        this.tg.HapticFeedback.impactOccurred("light");
      }
    } else if (navigator.vibrate) {
      // Фолбэк для обычного браузера на телефоне
      if (type === "error") navigator.vibrate([50, 30, 50]);
      else if (type === "heavy") navigator.vibrate(40);
      else navigator.vibrate(15);
    }
  }
}

// Создаем глобальный объект, чтобы его было видно во всех файлах
window.TelegramAPI = new TelegramIntegration();
