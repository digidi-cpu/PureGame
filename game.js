// game.js — Clean Sandbox with JuiceFX, Freeze, and Flicker Fix

const ENTITY_LIFETIME_MS = 11500;
const ROCKET_SPAWN_MS    = 900;
const PLANET_SPAWN_MS    = 800;
const INPUT_LOCK_MS      = 140;

// Утилиты
function randInt(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
function equalsNum(a, b) { return Math.abs(a - b) < 1e-9; }

// Фоновые звезды
class MinimalSpaceBG {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas?.getContext('2d', { alpha: true });
    this.running = false; this.starField = [];
  }
  init() {
    if (!this.canvas || !this.ctx) return;
    this.resize(); this.buildStars();
    window.addEventListener('resize', () => this.resize());
  }
  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.buildStars();
  }
  buildStars() {
    this.starField = Array.from({ length: 60 }, () => ({
      x: Math.random() * this.canvas.width, y: Math.random() * this.canvas.height,
      sz: Math.random() * 1.5 + 0.5, sp: Math.random() * 10 + 5, alpha: Math.random() * 0.5 + 0.3
    }));
  }
  start() {
    this.running = true; let last = performance.now();
    const loop = (ts) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (ts - last) / 1000); last = ts;
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.fillStyle = '#ffffff';
      for (const s of this.starField) {
        s.y += s.sp * dt; if (s.y > this.canvas.height) { s.y = -5; s.x = Math.random() * this.canvas.width; }
        this.ctx.globalAlpha = s.alpha; this.ctx.beginPath(); this.ctx.arc(s.x, s.y, s.sz, 0, Math.PI * 2); this.ctx.fill();
      }
      this.ctx.globalAlpha = 1; this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }
  pause() { this.running = false; cancelAnimationFrame(this.rafId); }
}

// Эффекты (Взрывы и лазеры)
class JuiceFX {
  constructor() {
    this.canvas = document.getElementById('playCanvas');
    this.ctx = this.canvas?.getContext('2d', { alpha: true });
    this.particles = []; this.lasers = [];
    this.resize(); window.addEventListener('resize', () => this.resize());
  }
  resize() {
    const area = document.getElementById('fullscreenGameArea');
    if (area && this.canvas) { this.width = area.clientWidth; this.height = area.clientHeight; this.canvas.width = this.width; this.canvas.height = this.height; }
  }
  shoot(x1, y1, x2, y2, color = '#ff8c00') { this.lasers.push({ x1, y1, x2, y2, life: 1.0, color }); }
  explode(x, y, color = '#ff3333', amount = 15) {
    for (let i = 0; i < amount; i++) {
      const angle = Math.random() * Math.PI * 2; const speed = Math.random() * 5 + 2;
      this.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 1.0, decay: Math.random() * 0.03 + 0.02, color, size: Math.random() * 3 + 1 });
    }
  }
  update() {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]; p.x += p.vx; p.y += p.vy; p.vx *= 0.95; p.vy *= 0.95; p.life -= p.decay;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
    for (let i = this.lasers.length - 1; i >= 0; i--) {
      const l = this.lasers[i]; l.life -= 0.15; if (l.life <= 0) this.lasers.splice(i, 1);
    }
  }
  trail(x, y, color = '#7df0ff') {
    const offsetX = x + (Math.random() * 30 - 15);
    const offsetY = y + (Math.random() * 30 - 15);
    this.particles.push({ 
      x: offsetX, y: offsetY, 
      vx: (Math.random() - 0.5) * 0.5, vy: (Math.random() - 0.5) * 0.5, 
      life: 1.0, decay: Math.random() * 0.04 + 0.02, color: color, size: Math.random() * 3 + 1.5
    });
  }
  draw() {
    if (!this.ctx) return;
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.ctx.globalCompositeOperation = 'lighter';
    for (const l of this.lasers) {
      this.ctx.beginPath(); this.ctx.moveTo(l.x1, l.y1); this.ctx.lineTo(l.x2, l.y2);
      this.ctx.strokeStyle = l.color; this.ctx.lineWidth = 4 * l.life; this.ctx.lineCap = 'round'; this.ctx.globalAlpha = l.life; this.ctx.stroke();
      this.ctx.beginPath(); this.ctx.moveTo(l.x1, l.y1); this.ctx.lineTo(l.x2, l.y2);
      this.ctx.strokeStyle = '#ffffff'; this.ctx.lineWidth = 1.5 * l.life; this.ctx.stroke();
    }
    for (const p of this.particles) {
      this.ctx.globalAlpha = p.life; this.ctx.fillStyle = p.color;
      this.ctx.beginPath(); this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); this.ctx.fill();
    }
    this.ctx.globalAlpha = 1.0; this.ctx.globalCompositeOperation = 'source-over';
  }
}

// Основной движок
class GameSandbox {
  constructor() {
    this.score = 0; this.timeLeft = 30; this.streak = 0; this.multiplier = 1;
    this.selectedRocket = null; this.freezeUntil = 0; this.isPlaying = false;
    this.isWarmup = false;
    this.magnetUntil = 0;
    
    // Пагинация истории
    this.historyOffset = 0; 
    
    // 👇 УМНОЕ КЭШИРОВАНИЕ 👇
    this.cache = {
      missions: null, missionsTime: 0,
      checkin: null, checkinTime: 0,
      leaderboard: null, leaderboardTime: 0
    };
    
    this.active = new Map(); this.correctAnswers = new Map(); this.idSeq = 0;
    this.lastRAF = 0; this.lastRocketSpawnAt = 0; this.lastPlanetSpawnAt = 0;
    
    this.maxRockets = 12; this.maxPlanets = 15;
    this.columns = 6; this.columnWidth = 0; this.gameSize = { w: 0, h: 0 };
    this.inputLockUntil = 0;

    this.bg = new MinimalSpaceBG('playBgCanvas');
    this.startBg = new MinimalSpaceBG('startBgCanvas'); 
    this.fx = new JuiceFX();
    
    this.bindUI();
    this.startBg.init();
    this.startBg.start();
  }

  // Очистка кэша, чтобы загрузить свежие данные после игры или сбора наград
  invalidateCache() {
    this.cache.missionsTime = 0;
    this.cache.checkinTime = 0;
    this.cache.leaderboardTime = 0;
  }

  bindUI() {
    document.getElementById("startGameBtn").addEventListener("click", () => {
      window.TelegramAPI?.vibrate('medium'); 
      this.startGame();
    });

    document.getElementById("buyEnergyBtn")?.addEventListener("click", () => {
      this.buyEnergy();
    });

    document.getElementById("playAgainBtn").addEventListener("click", () => {
      window.TelegramAPI?.vibrate('medium'); 
      document.getElementById("resultModal").style.display = "none";
      this.startGame();
    });

    document.getElementById("homeBtn")?.addEventListener("click", () => {
      window.TelegramAPI?.vibrate('light'); 
      document.getElementById("resultModal").style.display = "none";
      
      // Прячем экран игры и показываем главное меню
      document.getElementById("gameScreen").classList.remove("active");
      document.getElementById("startScreen").classList.add("active");
      
      // Снова запускаем летящие звезды на фоне меню
      if (this.startBg) this.startBg.start();
      
      // Принудительно открываем вкладку "Play" в меню
      const homeTab = document.querySelector('.nav-btn[data-tab="home"]');
      if (homeTab) homeTab.click();
    });

    const loadMoreBtn = document.getElementById("historyLoadMore");
    if (loadMoreBtn) {
      loadMoreBtn.addEventListener("click", () => {
        window.TelegramAPI?.vibrate('light');
        this.loadMatchHistory(true);
      });
    }

    window.addEventListener("resize", () => this.updateGameSize());
  }

  updateGameSize() {
    const area = document.getElementById("fullscreenGameArea");
    if (area) {
      this.gameSize = { w: area.clientWidth, h: area.clientHeight };
      this.columnWidth = Math.max(56, (this.gameSize.w - 20) / this.columns);
      if (this.fx) this.fx.resize();
    }
  }

  async startGame() {
    const startBtn = document.getElementById("startGameBtn");
    if (startBtn) startBtn.style.opacity = "0.5";

    try {
      const sessionData = await window.API.sessionStart();
      this.currentSessionId = sessionData.session_id; 
      this.equationsPool = sessionData.equations || [];
      
      // 👇 НОВЫЕ ДАННЫЕ ДЛЯ АНТИЧИТА 👇
      this.serverComets = sessionData.comets || [];
      this.sessionLog = [];                         
      this.equationsServed = 0;                     

      document.getElementById("startScreen").classList.remove("active");
      document.getElementById("gameScreen").classList.add("active");

      if (this.startBg) this.startBg.pause();

      requestAnimationFrame(() => {
        requestAnimationFrame((now) => {
          this.score = 0; 
          this.timeLeft = sessionData.duration_sec || 30; 
          this.streak = 0; 
          this.multiplier = 1;
          this.selectedRocket = null; 
          this.freezeUntil = 0; 
          this.isPlaying = true;
          this.activeFreezeType = null;
          
          this.clearGameArea();
          this.updateUI();
          this.updateGameSize();

          this.bg.init();
          this.bg.start();
          this.lastRAF = now;

          this.isWarmup = true;
          const overlay = document.getElementById("warmupOverlay");
          const countdownEl = document.getElementById("warmupCountdown");
          
          overlay.classList.remove("hidden", "hiding");
          countdownEl.textContent = "3";
          countdownEl.classList.add("warmup-tick");
          window.TelegramAPI?.vibrate('light');

          this.lastRocketSpawnAt = now;
          this.lastPlanetSpawnAt = now + 200;
          this.spawnRocket();
          this.startMainLoop();

          const steps = ["3", "2", "1", "START!"];
          let step = 0; 
          
          const tick = () => {
            step++;
            if (step < 3) window.TelegramAPI?.vibrate('light'); 
            else if (step === 3) window.TelegramAPI?.vibrate('heavy'); 
            
            if (step < steps.length) {
              countdownEl.classList.remove("warmup-tick");
              void countdownEl.offsetWidth; 
              countdownEl.textContent = steps[step];
              countdownEl.classList.add("warmup-tick");
              setTimeout(tick, 1000);
            } else {
              overlay.classList.add("hiding");
              setTimeout(() => {
                overlay.classList.add("hidden");
                overlay.classList.remove("hiding");
                this.isWarmup = false;
                
                // 👇 ЗАПУСК СЕКУНДОМЕРА ДЛЯ ЛОГА АНТИЧИТА 👇
                this.gameStartTime = performance.now(); 
                
                this.startTimer();
              }, 500);
            }
          };
          setTimeout(tick, 1000);
        });
      });
} catch (error) {
      console.error("Start Game Error:", error);
      window.TelegramAPI?.vibrate('error');
      
      // 👇 ДОБАВЛЯЕМ ПРОВЕРКУ НА БАН ВОТ СЮДА 👇
      if (error.message === 'banned' || error.error === 'banned') {
        alert("⛔ Your account has been suspended for suspicious activity."); 
      } else if (error.message === 'not_enough_energy' || error.reason === 'not_enough_energy') {
        alert("Not enough energy! Come back tomorrow or buy more."); 
      } else {
        alert("Server error: " + (error.reason || error.message));
      }
      // 👆 =================================== 👆

      document.getElementById("gameScreen").classList.remove("active");
      document.getElementById("startScreen").classList.add("active");
      if (this.startBg) this.startBg.start(); 
    } finally {
      const startBtn = document.getElementById("startGameBtn");
      if (startBtn) startBtn.style.opacity = "1";
    }
  }

  clearGameArea() {
    this.active.forEach(e => e.node?.remove());
    this.active.clear(); this.correctAnswers.clear();
    this.idSeq = 0;
    cancelAnimationFrame(this.rafId); clearInterval(this.timerId);
    const area = document.getElementById("fullscreenGameArea");
    if (area) area.querySelectorAll('.rocket, .planet, .bonus-ice').forEach(n => n.remove());
  }

  logAction(type, answer, eqIndex, questionStr) {
    if (!this.isPlaying || this.isWarmup) return;
    const ms = Math.floor(performance.now() - this.gameStartTime);
    this.sessionLog.push({
      i: eqIndex, 
      q: questionStr, 
      a: answer, 
      t: type, 
      ms: ms
    });
  }

  startTimer() {
    this.timerId = setInterval(() => {
      if (performance.now() < this.freezeUntil) return; 
      this.timeLeft -= 1; this.updateUI();
      if (this.timeLeft <= 0) this.endGame();
    }, 1000);
  }

  updateUI() {
    document.getElementById("timer").textContent = this.timeLeft;
    document.getElementById("score").textContent = this.score;
    document.getElementById("multiplier").textContent = this.multiplier;
  }

  async syncProfile() {
    try {
      const stats = await window.API.getMyStats();
      if (stats && stats.exists) {
        
        this.gameConfig = stats.config || { ticket_cost: 5000, level_step: 500 };
        if (this.gameConfig.season_end_date) {
          window.startSeasonTimer(this.gameConfig.season_end_date);
        }

        const energyCount = document.getElementById("energyCount");
        if (energyCount) energyCount.textContent = `${stats.energy}/3`;

        const ticketCount = document.getElementById("ticketCount");
        if (ticketCount) ticketCount.textContent = stats.tickets;

        const myRankVal = document.querySelector(".my-pos-val");
        if (myRankVal) myRankVal.textContent = `#${stats.rank || 0}`;

        const myPosRight = document.querySelector(".my-pos-right");
        if (myPosRight) myPosRight.innerHTML = `${stats.tickets || 0} <i class="icon-ticket-inline"></i>`;

        const modalEnergy = document.getElementById("modalEnergy");
        if (modalEnergy) modalEnergy.textContent = `${stats.energy}/3`;

        const profileTickets = document.getElementById("profileTickets");
        if (profileTickets) profileTickets.textContent = stats.tickets;

        const profileTotalPointsLarge = document.getElementById("profileTotalPointsLarge");
        if (profileTotalPointsLarge) profileTotalPointsLarge.textContent = (stats.total_score || 0).toLocaleString();

        const profileLevel = document.getElementById("profileLevel");
        if (profileLevel) profileLevel.textContent = `LEVEL ${stats.level || 1}`;

        const mainPageLevel = document.getElementById("mainPageLevel");
        if (mainPageLevel) mainPageLevel.textContent = `LEVEL ${stats.level || 1}`;

        const profileGamesPlayed = document.getElementById("profileGamesPlayed");
        if (profileGamesPlayed) profileGamesPlayed.textContent = (stats.games_played || 0).toLocaleString();

        const profileHighScore = document.getElementById("profileHighScore");
        if (profileHighScore) {
          profileHighScore.textContent = (stats.high_score || 0).toLocaleString();
        }

        const profileName = document.getElementById("profileName");
        if (profileName && window.TelegramAPI && window.TelegramAPI.initDataUnsafe?.user) {
            profileName.textContent = window.TelegramAPI.initDataUnsafe.user.first_name;
        }

        const currentLvl = stats.level || 1;
        const score = stats.total_score || 0;
        const step = this.gameConfig.level_step || 500; 
        
        const lvlCurrentEl = document.getElementById("lvlCurrent");
        const lvlNextEl = document.getElementById("lvlNext");
        const levelProgressFill = document.getElementById("levelProgressFill");
        
        if (lvlCurrentEl) lvlCurrentEl.textContent = currentLvl;
        if (lvlNextEl) lvlNextEl.textContent = currentLvl + 1;

        if (levelProgressFill) {
          const currentLevelStart = (currentLvl - 1) * step;
          const pointsInCurrentLevel = score - currentLevelStart;
          const percent = Math.min(100, Math.max(0, (pointsInCurrentLevel / step) * 100));
          levelProgressFill.style.width = `${percent}%`;
        }

        const buyBtn = document.getElementById("buyEnergyBtn");
        const buyHint = document.getElementById("buyEnergyHint");
        const maxHint = document.getElementById("mainPageMaxHint"); 
        
        const limit = stats.daily_energy_limit || 1;
        const bought = stats.energy_bought_today || 0;
        
        if (maxHint) {
            maxHint.textContent = `Max ${limit} purchase${limit > 1 ? 's' : ''} / day`;
        }

        if (buyHint) {
          buyHint.textContent = `Purchases available today: ${limit - bought} / ${limit}`;
        }
        
        if (bought >= limit) {
          if (buyBtn) { 
              buyBtn.disabled = true; 
              buyBtn.style.opacity = "0.4"; 
              buyBtn.style.cursor = "not-allowed"; 
          }
        } else {
          if (buyBtn) { 
              buyBtn.disabled = false; 
              buyBtn.style.opacity = "1"; 
              buyBtn.style.cursor = "pointer"; 
          }
        }

        this.loadMatchHistory(false);
        this.loadLeaderboard();
        this.loadMissions();
      }
    } catch (e) {
      console.error("Failed to sync profile:", e);
    }
  }

  async buyEnergy() {
    window.TelegramAPI?.vibrate('medium');
    const btn = document.getElementById("buyEnergyBtn");
    if (btn) btn.innerHTML = "WAIT...";

    try {
      const res = await window.API.getEnergyInvoice();

      if (res && res.invoiceLink) {
        if (window.Telegram?.WebApp?.openInvoice) {
          window.Telegram.WebApp.openInvoice(res.invoiceLink, async (status) => {
            
            if (status === 'paid') {
              if (btn) btn.innerHTML = "SYNCING... ⏳";
              
              setTimeout(async () => {
                this.invalidateCache();
                await this.syncProfile(); 
                this.showScorePopup(window.innerWidth/2, window.innerHeight/2, "+3 ⚡");
              }, 2000); 

            } else if (status === 'failed') {
              alert("Payment failed.");
              if (btn) btn.innerHTML = "+3 ⚡ FOR 1 ⭐";
            } else {
              if (btn) btn.innerHTML = "+3 ⚡ FOR 1 ⭐";
            }

          });
        } else {
          alert("Telegram WebApp API is not fully loaded.");
          if (btn) btn.innerHTML = "+3 ⚡ FOR 1 ⭐";
        }
      }
    } catch (e) {
      alert(e.reason || "Failed to generate invoice");
      if (btn) btn.innerHTML = "+3 ⚡ FOR 1 ⭐";
    }
  }

  async loadMatchHistory(isLoadMore = false) {
    const historyList = document.getElementById("historyList");
    const loadMoreBtn = document.getElementById("historyLoadMore");
    if (!historyList) return;

    if (!isLoadMore) {
      this.historyOffset = 0;
      historyList.innerHTML = `<div style="text-align:center; padding:20px; color:rgba(255,255,255,0.5);">Loading data...</div>`;
      if (loadMoreBtn) loadMoreBtn.style.display = "none";
    }

    const data = await window.API.getMyHistory(this.historyOffset);

    if (!isLoadMore) historyList.innerHTML = ""; 

    if (!data || !data.matches || data.matches.length === 0) {
      if (!isLoadMore) {
        historyList.innerHTML = `<div style="text-align: center; color: rgba(255,255,255,0.5); font-size: 0.8rem; padding: 20px;">History is empty</div>`;
      }
      if (loadMoreBtn) loadMoreBtn.style.display = "none";
      return;
    }

    data.matches.forEach(match => {
      const dateObj = new Date(match.started_at || match.created_at || Date.now());
      const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const dateStr = dateObj.toLocaleDateString([], { month: 'short', day: 'numeric' });
      
      const matchScore = (match.final_score || match.reward_pts || 0).toLocaleString();
      const eventTitle = match.title || "Match played";
      
      const ticketsEarned = match.tickets_earned || match.tickets || 0;

      let itemHtml = "";

      if (ticketsEarned > 0) {
        itemHtml = `
          <div class="history-item special-ticket-item" style="display: flex; justify-content: space-between; align-items: center; padding: 12px 10px; border-bottom: 1px solid rgba(255,255,255,0.05); background: linear-gradient(90deg, rgba(255, 215, 0, 0.1) 0%, transparent 100%); border-left: 3px solid #ffd700;">
            <div class="h-left" style="display: flex; flex-direction: column; gap: 4px;">
              <div style="font-weight: 700; font-size: 1rem; color: #ffd700; text-shadow: 0 0 5px rgba(255,215,0,0.3); display: flex; align-items: center; gap: 6px;">
                <i class="icon-ticket-inline"></i> ${eventTitle}
              </div>
              <div style="font-size: 0.75rem; color: rgba(255,255,255,0.6);">
                ${dateStr}, ${timeStr}
              </div>
            </div>
            <div class="h-right" style="text-align: right; display: flex; flex-direction: column; align-items: flex-end;">
              <span style="font-weight: 900; font-size: 1.2rem; color: #ffd700; text-shadow: 0 0 10px rgba(255, 204, 0, 0.4);">
                +${ticketsEarned} <i class="icon-ticket-inline"></i>
              </span>
              ${matchScore !== "0" ? `<span style="font-size: 0.75rem; color: rgba(255,255,255,0.4);">+${matchScore} PTS</span>` : ""}
            </div>
          </div>
        `;
      } else {
        itemHtml = `
          <div class="history-item" style="display: flex; justify-content: space-between; align-items: center; padding: 12px 10px; border-bottom: 1px solid rgba(255,255,255,0.05);">
            <div class="h-left" style="display: flex; flex-direction: column; gap: 4px;">
              <div style="font-weight: 700; font-size: 1rem; color: #fff;">${eventTitle}</div>
              <div style="font-size: 0.75rem; color: rgba(255,255,255,0.4);">
                ${dateStr}, ${timeStr}
              </div>
            </div>
            <div class="h-right" style="text-align: right;">
              <span style="font-weight: 900; font-size: 1.1rem; color: #ffcc00; text-shadow: 0 0 10px rgba(255, 204, 0, 0.2);">+${matchScore}</span>
            </div>
          </div>
        `;
      }

      historyList.insertAdjacentHTML('beforeend', itemHtml);
    });

    this.historyOffset += data.matches.length;

    if (data.matches.length < 10 && loadMoreBtn) {
      loadMoreBtn.style.display = "none";
    } else if (loadMoreBtn) {
      loadMoreBtn.style.display = "block";
    }
  }

  async loadLeaderboard() {
    const list = document.getElementById("leaderboardList"); 
    if (!list) return;

    const now = Date.now();
    let data = this.cache.leaderboard;

    if (!data || now - this.cache.leaderboardTime > 120000) {
      list.innerHTML = `<div style="text-align:center; padding:20px; color:rgba(255,255,255,0.5);">Loading Top 10... 🏆</div>`;
      try {
        data = await window.API.getLeaderboard(0, 10);
        this.cache.leaderboard = data;
        this.cache.leaderboardTime = now;
      } catch (e) {
        console.error("Failed to load leaderboard:", e);
        list.innerHTML = `<div style="text-align:center; padding:20px; color:#ff3333;">Connection error</div>`;
        return;
      }
    }

    list.innerHTML = ""; 
    if (!data || !data.items || data.items.length === 0) {
      list.innerHTML = `<div style="text-align:center; padding:20px; color:rgba(255,255,255,0.5);">Leaderboard is empty yet. Be the first!</div>`;
      return;
    }

    const myId = window.TelegramAPI?.initDataUnsafe?.user?.id ? `tg_${window.TelegramAPI.initDataUnsafe.user.id}` : null;

    data.items.forEach(player => {
      let rankDisplay = `<span style="color: rgba(255,255,255,0.4); font-size: 1.1rem; font-weight: 900; font-family: 'Orbitron', monospace;">#${player.rank}</span>`;
      
      if (player.rank === 1) rankDisplay = `<img src="assets/medal1.svg?v=3" class="lb-medal" alt="1">`;
      if (player.rank === 2) rankDisplay = `<img src="assets/medal2.svg?v=3" class="lb-medal" alt="2">`;
      if (player.rank === 3) rankDisplay = `<img src="assets/medal3.svg?v=3" class="lb-medal" alt="3">`;

      const isMe = myId === player.userId;
      const highlightClass = isMe ? "lb-item-me" : ""; 

      const itemHtml = `
        <div class="lb-item ${highlightClass}" style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: rgba(255,255,255,0.05); margin-bottom: 8px; border-radius: 12px;">
          <div style="display: flex; align-items: center; gap: 15px;">
            <div style="width: 32px; height: 32px; display: flex; justify-content: center; align-items: center;">
              ${rankDisplay}
            </div>
            <div style="font-weight: bold; font-size: 1.1rem;">${player.username}</div>
          </div>
          <div style="text-align: right;">
            <div style="color: #ffd700; font-weight: 900; display: flex; align-items: center; justify-content: flex-end; gap: 4px;">
              ${player.tickets} <i class="icon-ticket-inline"></i>
            </div>
            <div style="font-size: 0.8rem; color: rgba(255,255,255,0.5);">${player.score.toLocaleString()} PTS</div>
          </div>
        </div>
      `;
      list.insertAdjacentHTML('beforeend', itemHtml);
    });
  }

  async loadDailyCheckin() {
    const container = document.querySelector(".missions-list");
    if (!container) return;

    const now = Date.now();
    let data = this.cache.checkin;

    if (!data || now - this.cache.checkinTime > 120000) {
      try {
        data = await window.API.getCheckinStatus();
        this.cache.checkin = data;
        this.cache.checkinTime = now;
      } catch (e) {
        console.error("Checkin load error", e);
        return;
      }
    }

    if (!data || !data.rewards) return;

    let dotsHtml = '<div class="streak-dots">';
    for (let i = 0; i < 7; i++) {
      let dotClass = "streak-dot";
      if (i < data.streak) {
         dotClass += " streak-dot--done"; 
      } else if (i === data.streak && data.canClaim) {
         dotClass += " streak-dot--current"; 
      }
      dotsHtml += `<div class="${dotClass}"></div>`;
    }
    dotsHtml += '</div>';

    const currentRewardPts = data.canClaim 
        ? data.rewards[data.streak % 7] 
        : data.rewards[Math.max(0, data.streak - 1) % 7];

    const cardClass = data.canClaim ? "" : "done";
    const btnHtml = data.canClaim 
        ? `<button id="claimDailyBtn" class="mc-btn mc-btn--claim">CLAIM</button>`
        : `<button class="mc-btn mc-btn--done" disabled>✔</button>`;

    const checkinBlock = `
      <div class="mission-card daily-checkin-card ${cardClass}">
        <div class="mc-icon"><i class="mission-icon-calendar"></i></div>
        <div class="mc-info">
          <div class="mc-title">Daily Check-in</div>
          <div class="mc-reward" style="color: #ffd700;">+${currentRewardPts}</div>
          ${dotsHtml}
        </div>
        ${btnHtml}
      </div>
    `;

    const oldBlock = document.querySelector(".daily-checkin-card");
    if (oldBlock) oldBlock.remove();
    container.insertAdjacentHTML('afterbegin', checkinBlock);

    const claimBtn = document.getElementById("claimDailyBtn");
    if (claimBtn && data.canClaim) {
      claimBtn.addEventListener("click", () => this.claimDailyReward());
    }
  }

  async claimDailyReward() {
    window.TelegramAPI?.vibrate('medium');
    try {
      const res = await window.API.claimDaily();
      if (res && res.success) {
        this.showScorePopup(window.innerWidth/2, window.innerHeight/2, `+${res.reward_pts}`);
        if (res.tickets_earned > 0) {
          setTimeout(() => {
            this.showScorePopup(window.innerWidth/2, window.innerHeight/2 + 50, `+${res.tickets_earned} <i class="icon-ticket-inline"></i>`);
            
            if (typeof window.startWinFlow === 'function') {
                window.startWinFlow();
            }
          }, 600);
        }
        
        this.invalidateCache();
        this.syncProfile(); 
      }
    } catch (e) {
      alert("Daily Claim Error: " + (e.reason || e.message || "Already claimed"));
    }
  }

  // ==========================================
  // МИССИИ (С КЭШИРОВАНИЕМ И ПРОВЕРКОЙ ВКЛАДКИ)
  // ==========================================
  async loadMissions() {
    const missionsList = document.querySelector(".missions-list");
    if (!missionsList) return;

    const now = Date.now();
    let data = this.cache.missions;

    if (!data || now - this.cache.missionsTime > 120000) {
      missionsList.innerHTML = `<div style="text-align:center; padding:20px; color:rgba(255,255,255,0.5);">Loading missions... 🎯</div>`;
      try {
        data = await window.API.getMissions();
        this.cache.missions = data;
        this.cache.missionsTime = now;
      } catch (e) {
        console.error("Missions catch error:", e);
        missionsList.innerHTML = `<div style="text-align:center; padding:20px; color:#ff3333;">Connection error</div>`;
        return;
      }
    }

    if (!data || !data.missions) return;

    missionsList.innerHTML = "";
    
    const activeTabBtn = document.querySelector(".custom-tabs .c-tab.active");
    const filterType = activeTabBtn && activeTabBtn.textContent === "DAILY" ? "daily" : "one_time";

    if (filterType === "daily") {
      this.loadDailyCheckin();
    }

    const filteredMissions = data.missions.filter(m => m.type === filterType);

    if (filteredMissions.length === 0) {
      missionsList.insertAdjacentHTML('beforeend', `<div style="text-align:center; padding:20px; color:rgba(255,255,255,0.5);">No missions available</div>`);
      return;
    }

    filteredMissions.forEach(m => {
      let btnHtml = "";
      let doneClass = m.status === 'claimed' ? 'done' : '';

      if (m.status === 'claimed') {
        btnHtml = `<button class="mc-btn mc-btn--done" disabled>✔</button>`;
      } else if (m.id === 'daily_ad') {
        // 👇 Кнопка WATCH для рекламы 👇
        btnHtml = `<button class="mc-btn mc-btn--claim" style="background: #00f3ff; color: #000;" onclick="window.gameSandbox.watchDailyAd('${m.dbId}')">WATCH</button>`;
      } else if (m.actionUrl) {
        btnHtml = `
          <div style="display: flex; gap: 6px;">
            <button class="mc-btn mc-btn--go" onclick="window.gameSandbox.openMissionLink('${m.actionUrl}')">GO</button>
            <button class="mc-btn mc-btn--claim" style="background: #00f3ff; color: #000;" onclick="window.gameSandbox.claimMission('${m.dbId}')">CHECK</button>
          </div>
        `;
      } else if (m.status === 'claimable') {
        btnHtml = `<button class="mc-btn mc-btn--claim" onclick="window.gameSandbox.claimMission('${m.dbId}')">CLAIM</button>`;
      } else {
        btnHtml = `<div style="font-size: 0.8rem; font-weight: bold; color: rgba(255,255,255,0.5);">${Math.min(m.progress, m.target)} / ${m.target}</div>`;
      }

      let iconContent = m.icon;
      if (m.icon === 'icon_up_gradient') {
          iconContent = '<i class="mission-icon-up"></i>';
      } else if (m.icon === 'coin_pts') {
          iconContent = '<i class="icon-coin-pts-inline"></i>';
      } else if (m.icon === 'assets/gamepad.svg') {
          iconContent = '<i class="mission-icon-gamepad"></i>';
      } else if (m.icon === '🏆' || m.icon === 'assets/trophy.svg') {
          iconContent = '<i class="mission-icon-trophy"></i>';
      } else if (m.icon === '👑' || m.icon === 'assets/winner.svg') {
          iconContent = '<i class="mission-icon-winner"></i>';
      } else if (m.icon === '👨‍💻' || m.icon === 'assets/creator.svg') {
          iconContent = '<i class="mission-icon-creator"></i>';
      } else if (m.icon === '📢' || m.icon === 'assets/speaker.svg') {
          iconContent = '<i class="mission-icon-speaker"></i>';
      } else if (m.icon === 'assets/tv.svg') {
          // 👇 Иконка рекламы 👇
          iconContent = '<i class="mission-icon-ad"></i>';
      } else if (m.icon.endsWith('.svg') || m.icon.endsWith('.png')) {
          iconContent = `<img src="${m.icon}" alt="icon" class="mission-custom-icon">`;
      } else {
          iconContent = `<span class="mission-emoji">${m.icon}</span>`;
      }

      const itemHtml = `
        <div class="mission-card ${doneClass}">
          <div class="mc-icon">${iconContent}</div>
          <div class="mc-info">
            <div class="mc-title">${m.title}</div>
            <div class="mc-reward" style="color: #ffd700;">+${m.reward_pts}</div>
          </div>
          ${btnHtml}
        </div>
      `;
      missionsList.insertAdjacentHTML('beforeend', itemHtml);
    });
  }

  async claimMission(dbId) {
    window.TelegramAPI?.vibrate('medium');
    try {
      const result = await window.API.claimMission(dbId);
      if (result && result.success) {
        this.showScorePopup(window.innerWidth/2, window.innerHeight/2, `+${result.reward_pts} PTS`);
        if (result.tickets_earned > 0) {
          setTimeout(() => {
            this.showScorePopup(window.innerWidth/2, window.innerHeight/2 + 50, `+${result.tickets_earned} <i class="icon-ticket-inline"></i>`);
            
            if (typeof window.startWinFlow === 'function') {
                window.startWinFlow();
            }
          }, 600);
        }
        
        this.invalidateCache();
        this.syncProfile();
      }
    } catch (e) {
      if (e.error === 'not_subscribed') {
         alert("Join the channel first to claim the reward! 🚀");
         if (e.actionUrl) this.openMissionLink(e.actionUrl);
      } else {
         alert("Mission error: " + (e.reason || e.message));
      }
    }
  }

  // ==========================================
  // РЕКЛАМНАЯ МИССИЯ (ADSGRAM)
  // ==========================================
  async watchDailyAd(dbId) {
    if (this._adBusy) return;
    this._adBusy = true;

    window.TelegramAPI?.vibrate('light');

    try {
      // Инициализируем плеер Adsgram
      // ВСТАВЬ СЮДА СВОЙ РЕАЛЬНЫЙ blockId от Adsgram
      const AdController = window.Adsgram?.init({ blockId: "21334" }); 
      
      if (!AdController) {
        this.showScorePopup(window.innerWidth/2, window.innerHeight/2, "AdsGram loading...");
        this._adBusy = false;
        return;
      }

      let rewardHandled = false;

      // Коллбэк УСПЕХА
      const onReward = async () => {
        if (rewardHandled) return;
        rewardHandled = true;

        try {
          const res = await window.API.claimMission(dbId);

          if (res && res.success) {
            window.TelegramAPI?.vibrate('success');
            
            this.showScorePopup(window.innerWidth/2, window.innerHeight/2, `+${res.reward_pts} PTS!`);

            this.invalidateCache(); 
            await this.loadMissions();
            this.syncProfile();
            
          } else {
             this.showScorePopup(window.innerWidth/2, window.innerHeight/2, "Reward claimed");
          }
        } catch (e) {
          console.error("Ad claim error:", e);
          this.showScorePopup(window.innerWidth/2, window.innerHeight/2, "Sync failed");
        }
      };

      // Коллбэк ОШИБКИ
      const onError = () => {
        if (rewardHandled) return;
        this.showScorePopup(window.innerWidth/2, window.innerHeight/2, "Ad unavailable");
      };

      AdController.addEventListener("onReward", onReward);
      AdController.addEventListener("onError", onError);

      // ПОКАЗЫВАЕМ РЕКЛАМУ И ЧИСТИМ СЛУШАТЕЛЕЙ
      try {
        await AdController.show();
      } finally {
        AdController.removeEventListener("onReward", onReward);
        AdController.removeEventListener("onError", onError);
      }

    } catch (e) {
      console.error("AdsGram Error:", e);
      this.showScorePopup(window.innerWidth/2, window.innerHeight/2, "Try later");
    } finally {
      this._adBusy = false;
    }
  }

  openMissionLink(url) {
    window.TelegramAPI?.vibrate('light');
    if (window.Telegram?.WebApp?.openTelegramLink) {
       window.Telegram.WebApp.openTelegramLink(url);
    } else {
       window.open(url, '_blank');
    }
    
    setTimeout(() => {
      this.invalidateCache();
      this.loadMissions();
    }, 3000);
  }
  
  updateAtmosphere() {
    const fs = document.getElementById('gameScreen');
    const timerEl = document.getElementById('timer');
    let bg = '#0a0a1a'; 
    let isFrozen = performance.now() < this.freezeUntil;

    fs.classList.remove('frozen-ice', 'frozen-toxic', 'frozen-solar');

    if (isFrozen && this.activeFreezeType) {
       fs.classList.add(`frozen-${this.activeFreezeType}`); 
       fs.style.border = 'none'; fs.style.boxShadow = 'none';
       timerEl.classList.add('timer-ice');

       if (this.activeFreezeType === 'ice') bg = 'radial-gradient(circle at center, #001f3f 0%, #000a1a 100%)';
       else if (this.activeFreezeType === 'toxic') bg = 'radial-gradient(circle at center, #002b12 0%, #000a04 100%)';
       else if (this.activeFreezeType === 'solar') bg = 'radial-gradient(circle at center, #3d1c00 0%, #1a0800 100%)';

    } else {
       timerEl.classList.remove('timer-ice');
       if (this.streak >= 5) bg = 'radial-gradient(circle at center, #550000 0%, #2a0000 45%, #000000 100%)'; 
       else if (this.streak >= 2) bg = 'radial-gradient(circle at center, #441100 0%, #221100 50%, #000000 100%)'; 
    }
    fs.style.background = bg;
  }

  shakeScreen(type = 'light') {
    const app = document.getElementById('gameScreen'); 
    if (!app) return; 
    const cls = type === 'hard' ? 'shake-h' : 'shake-s';
    app.classList.remove('shake-s', 'shake-h'); 
    void app.offsetWidth; 
    app.classList.add(cls); 
    setTimeout(() => app.classList.remove(cls), 350);
  }

  showScorePopup(x, y, textHtml) {
    const el = document.createElement("div");
    el.style.cssText = `position:fixed;left:${x}px;top:${y}px;transform:translate(-50%,-50%);font-size:1.5em;font-weight:900;color:#ffd700;text-shadow:0 0 10px #ffd700;z-index:2500;pointer-events:none;font-family:'Orbitron',monospace;opacity:0;transition:all 0.6s ease-out; display: flex; align-items: center; gap: 5px;`;
    
    el.innerHTML = textHtml; 
    
    document.body.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = "1"; el.style.transform = `translate(-50%,-70px)`; });
    setTimeout(() => { el.style.opacity = "0"; setTimeout(() => el.remove(), 600); }, 400);
  }

  laneToX(lane, entityWidth) { const w = entityWidth ?? 85; return Math.round(10 + lane * this.columnWidth + (this.columnWidth - w) / 2); }
  isLaneFree(lane, SAFE_Y = 105) { let free = true; this.active.forEach(e => { if (e.lane === lane && e.y < SAFE_Y) free = false; }); return free; }
  pickFreeLane(SAFE_Y = 105) {
    for (let tries = 0; tries < this.columns * 2; tries++) { const l = Math.floor(Math.random() * this.columns); if (this.isLaneFree(l, SAFE_Y)) return l; }
    return null;
  }

  countType(type) { let n = 0; this.active.forEach(e => (n += e.type === type ? 1 : 0)); return n; }

  startMainLoop() {
    const loop = (now) => {
      if (!this.isPlaying) return;
      this.fx.update(); this.fx.draw();

      const isFrozen = now < this.freezeUntil;
      if (!isFrozen) this.activeFreezeType = null;
      const timeFactor = isFrozen ? 0.3 : 1.0; 
      const speedMult = Math.min(1.3, 1 + (this.multiplier - 1) * 0.035);
      const warmupMultiplier = this.isWarmup ? 1.4 : 1.0;

      const dynamicRocketDelay = (ROCKET_SPAWN_MS / speedMult / warmupMultiplier) / timeFactor;
      const dynamicPlanetDelay = (PLANET_SPAWN_MS / speedMult / warmupMultiplier) / timeFactor;

      const dtSec = Math.max(0, Math.min(48, now - this.lastRAF)) / 1000;
      this.lastRAF = now;

      this.updateAtmosphere();

      if (now < this.magnetUntil) this.autoCollectAnswers();

      const entities = Array.from(this.active.values());
      for (const e of entities) {
        if (e.vx !== undefined) e.x += e.vx * dtSec * timeFactor * warmupMultiplier;
        e.y += e.vy * dtSec * timeFactor * warmupMultiplier;

        if (!e.node?.parentNode || e.solved) continue;

        if (e.y >= this.gameSize.h + 140 || e.x > this.gameSize.w + 200 || e.x < -200) { 
          this.removeEntity(e.id); 
          continue; 
        }

        const posX = e.x !== undefined ? e.x : 0; 
        e.node.style.transform = `translate3d(${posX}px, ${e.y}px, 0) scale(${e.scale})`;

        if (e.type === "bonus" && Math.random() > 0.3) {
          let c1 = '#c2f8ff', c2 = '#00f3ff'; 
          if (e.cometType === 'toxic') { c1 = '#dcfce7'; c2 = '#39ff14'; } 
          else if (e.cometType === 'solar') { c1 = '#fef9c3'; c2 = '#ffcc00'; } 
          this.fx.trail(posX + 40, e.y + 40, c1);
          this.fx.trail(posX + 40, e.y + 40, c2);
        }
      }

      if (this.countType("rocket") < this.maxRockets && now - this.lastRocketSpawnAt >= dynamicRocketDelay) { 
        if (this.spawnRocket()) this.lastRocketSpawnAt = now; 
      }
      
      if (this.countType("planet") + this.countType("bonus") < this.maxPlanets && now - this.lastPlanetSpawnAt >= dynamicPlanetDelay) { 
        if (this.spawnPlanet()) this.lastPlanetSpawnAt = now; 
      }

      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  spawnRocket() {
    const id = this.idSeq++; 
    
    let example, answer, eqIndex;
    if (this.equationsPool && this.equationsPool.length > 0) {
      const eq = this.equationsPool.shift(); 
      example = eq.q; answer = eq.a;
      eqIndex = this.equationsServed++; 
    } else {
      const a = randInt(1, 9); const b = randInt(1, 9);
      example = `${a}+${b}`; answer = a + b;
      eqIndex = 999;
    }

    if (this.serverComets) {
      const scheduledComet = this.serverComets.find(c => c.index === eqIndex);
      if (scheduledComet && this.countType("bonus") < 1) {
          this.spawnComet(eqIndex, scheduledComet.type);
      }
    }

    const lane = this.pickFreeLane(); 
    if (lane === null) return false;

    const randomSvg = ROCKET_SVGS[Math.floor(Math.random() * ROCKET_SVGS.length)];
    const el = document.createElement("div"); 
    el.className = "rocket"; el.id = `rocket-${id}`;
    
    const xStart = this.laneToX(lane, 94);
    const yStart = -90;
    const yEnd = this.gameSize.h + 140;
    const vy = ((yEnd - yStart) / (ENTITY_LIFETIME_MS / 1000)) * Math.min(1.3, 1 + (this.multiplier - 1) * 0.035);

    el.style.left = `0px`; 
    el.innerHTML = `${randomSvg}<div class="rocket-text">${example}</div>`;
    el.style.transform = `translate3d(${xStart}px, ${yStart}px, 0) scale(1)`;
    
    el.addEventListener("pointerdown", () => {
      if (this.isWarmup) return;
      const now = performance.now(); 
      if (now < this.inputLockUntil) return; 
      this.inputLockUntil = now + INPUT_LOCK_MS;
      this.selectRocket(id);
    });
    
    document.getElementById("fullscreenGameArea").appendChild(el);
    this.active.set(id, { id, type:"rocket", node: el, answer, lane, x: xStart, y: yStart, vy, scale: 1, solved:false, eqIndex, example });
    this.correctAnswers.set(id, answer);
    return true;
  }

  spawnPlanet() {
    const id = this.idSeq++; 
    const lane = this.pickFreeLane(); 
    if (lane === null) return false;

    let answer, isBomb = false, contentHtml = '';

    const hasMatchingPlanet = (ans) => { 
      for (const e of this.active.values()) { 
        if (e.type === "planet" && e.answer !== undefined && equalsNum(e.answer, ans)) return true; 
      } 
      return false; 
    };
    
    const starvingAnswers = [...this.correctAnswers.values()].filter(a => !hasMatchingPlanet(a));

    const rand = Math.random();

    if (rand < 0.30) { 
      const pool = [...this.correctAnswers.values()];
      if (pool.length > 0) {
          const base = pool[Math.floor(Math.random() * pool.length)];
          const offset = Number.isInteger(base) ? 1 : 0.1; 
          answer = base + (Math.random() < 0.5 ? offset : -offset);
          if (!Number.isInteger(answer)) answer = Math.round(answer * 10) / 10;
      } else {
          answer = randInt(1, 30);
      }
      isBomb = ![...this.correctAnswers.values()].some(v => equalsNum(v, answer)); 
      
    } else {
      if (starvingAnswers.length > 0 && Math.random() < 0.85) {
        answer = starvingAnswers[Math.floor(Math.random() * starvingAnswers.length)];
      } else {
        const pool = [...this.correctAnswers.values()];
        answer = pool.length ? pool[Math.floor(Math.random() * pool.length)] : randInt(1, 30);
      }
    }

    if (isBomb) {
      contentHtml = `<div class="planet-svg-wrap bomb-asteroid">${BOMB_ASTEROID_SVG}</div>`;
    } else {
      const randomPlanetSvg = PLANET_SVGS_WRAPPED[Math.floor(Math.random() * PLANET_SVGS_WRAPPED.length)];
      contentHtml = `<div class="planet-svg-wrap">${randomPlanetSvg}</div><div class="planet-text">${Number.isInteger(answer) ? answer : answer.toFixed(1)}</div>`;
    }

    const el = document.createElement("div"); 
    el.className = "planet"; el.id = `planet-${id}`;
    
    const xStart = this.laneToX(lane, 99);
    const yStart = -90;
    const yEnd = this.gameSize.h + 140;
    const vy = ((yEnd - yStart) / (ENTITY_LIFETIME_MS / 1000)) * Math.min(1.3, 1 + (this.multiplier - 1) * 0.035);
    
    el.style.left = `0px`;
    el.innerHTML = contentHtml;
    el.style.transform = `translate3d(${xStart}px, ${yStart}px, 0) scale(1)`;
    
    el.addEventListener("pointerdown", () => {
      if (this.isWarmup) return;
      const now = performance.now(); 
      if (now < this.inputLockUntil) return; 
      this.inputLockUntil = now + INPUT_LOCK_MS;
      this.tryAnswer(id);
    });
    
    document.getElementById("fullscreenGameArea").appendChild(el);
    this.active.set(id, { id, type: "planet", node: el, answer, isBomb, lane, x: xStart, y: yStart, vy, scale: 1, solved:false });
    return true;
  }

  spawnComet(eqIndex, cometType) {
    const id = this.idSeq++;
    const area = document.getElementById("fullscreenGameArea");
    
    const isFromLeft = Math.random() < 0.5;
    let xStart, yStart, xEnd, yEnd;

    if (isFromLeft) {
      xStart = -100; yStart = randInt(-50, 100); 
      xEnd = this.gameSize.w + 100; yEnd = randInt(this.gameSize.h - 150, this.gameSize.h + 50);
    } else {
      xStart = this.gameSize.w + 100; yStart = randInt(-50, 100); 
      xEnd = -100; yEnd = randInt(this.gameSize.h - 150, this.gameSize.h + 50);
    }

    const angleRad = Math.atan2(yEnd - yStart, xEnd - xStart);
    const angleDeg = (angleRad * (180 / Math.PI)) - 135;

    let svg = FREEZE_SVG;
    if (cometType === 'toxic') svg = COMET_TOXIC_SVG;
    else if (cometType === 'solar') svg = COMET_SOLAR_SVG;
    else if (cometType === 'magnet') svg = MAGNET_SVG;

    const el = document.createElement("div");
    el.className = `planet bonus-${cometType}`;
    el.id = `comet-${id}`;
    el.style.left = `0px`; 
    el.innerHTML = `<div class="bonus-pulse" style="transform: rotate(${angleDeg}deg)">${svg}</div>`;
    
    el.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      if (this.isWarmup) return;
      
      if (cometType === 'magnet') {
        this.logAction('magnet', null, eqIndex, 'MAGNET');
        
        this.magnetUntil = performance.now() + 1000;
        this.showScorePopup(this.gameSize.w/2, this.gameSize.h/2, "🧲 MAGNET!"); 
        this.fadeAndRemove(id); 
      } else {
        this.activateFreeze(id, cometType); 
      }
    });

    area.appendChild(el);

    const duration = 3.5;
    const vx = (xEnd - xStart) / duration;
    const vy = (yEnd - yStart) / duration;
  
    this.active.set(id, { id, type: "bonus", cometType: cometType, node: el, x: xStart, y: yStart, vx, vy, scale: 1, solved: false, eqIndex: eqIndex });
  }

  autoCollectAnswers() {
    const now = performance.now();
    if (!this.lastMagnetShot) this.lastMagnetShot = 0;
    if (now - this.lastMagnetShot < 200) return;

    const rockets = Array.from(this.active.values()).filter(e => e.type === 'rocket' && !e.solved);
    const planets = Array.from(this.active.values()).filter(e => e.type === 'planet' && !e.solved && !e.isBomb);

    if (rockets.length > 0 && planets.length > 0) {
      for (let r of rockets) {
        for (let p of planets) {
          if (r.answer === p.answer) {
            this.selectedRocket = r.id;   
            this.tryAnswer(p.id);         
            this.lastMagnetShot = now;    
            return; 
          }
        }
      }
    }
  }

  activateFreeze(id, type) {
    const e = this.active.get(id);
    if (!e) return;

    this.logAction(type, null, e.eqIndex, `BONUS_${type.toUpperCase()}`);

    const durations = this.gameConfig?.freeze_durations || { ice: 5000, toxic: 3500, solar: 8000 };
    const toxicMult = this.gameConfig?.toxic_multiplier || 2;

    let duration = durations.ice, popupText = "❄️ FROZEN!", explodeColor = '#00f3ff';
    if (type === 'toxic') { 
      duration = durations.toxic; 
      popupText = `🧪 TOXIC x${toxicMult}!`; 
      explodeColor = '#39ff14'; 
    } else if (type === 'solar') { 
      duration = durations.solar; 
      popupText = "☀️ SOLAR SLOW!"; 
      explodeColor = '#ffcc00'; 
    }

    this.fx.explode(e.x + 40, e.y + 40, explodeColor, 30);
    this.fadeAndRemove(id);
    
    this.freezeUntil = performance.now() + duration;
    this.activeFreezeType = type; 
    this.updateAtmosphere();
    this.showScorePopup(this.gameSize.w/2, this.gameSize.h/2, popupText);
  }

  selectRocket(id) {
    window.TelegramAPI?.vibrate('light');
    this.active.forEach(e => { 
      if (e.type === "rocket") { e.scale = 1; e.node.classList.remove("selected"); } 
    });
    const r = this.active.get(id); 
    if (r) { r.scale = 1.08; r.node.classList.add("selected"); this.selectedRocket = id; }
  }

  tryAnswer(planetId) {
    if (this.selectedRocket === null) return;
    const p = this.active.get(planetId); 
    const r = this.active.get(this.selectedRocket);
    if (!p || !r) return;

    this.logAction(p.isBomb ? 'bomb' : 'planet', p.answer, r.eqIndex, r.example);

    if (p.isBomb) { 
      this.applyBomb(planetId); 
      return; 
    }

    if (equalsNum(p.answer, r.answer)) {
      const rX = r.x + r.node.offsetWidth / 2; 
      const rY = r.y + r.node.offsetHeight / 2;
      const pX = p.x + p.node.offsetWidth / 2; 
      const pY = p.y + p.node.offsetHeight / 2;
      
      this.fx.shoot(rX, rY, pX, pY, '#ff8c00'); 
      this.fx.explode(pX, pY, '#ff3333', 20); 
      this.fx.explode(rX, rY, '#ffcc00', 10);
      
      this.applyCorrect(planetId);
    } else {
      this.applyWrong(planetId);
    }
  }

  applyCorrect(planetId) {
    const r = this.active.get(this.selectedRocket); const p = this.active.get(planetId);
    
    const maxMult = this.gameConfig?.max_streak_multiplier || 10;
    this.streak++; 
    this.multiplier = Math.min(maxMult, Math.floor(this.streak / 2) + 1);
    
    let pts = 1 * this.multiplier; 
    
    if (performance.now() < this.freezeUntil && this.activeFreezeType === 'toxic') {
       pts *= (this.gameConfig?.toxic_multiplier || 2);
    }
    
    this.score += pts;
    window.TelegramAPI?.vibrate('light'); 
    
    this.updateAtmosphere(); r.node.classList.add("correct"); p.node.classList.add("correct");
    this.showScorePopup(p.x + 40, p.y + 40, `+${pts}`);
    this.updateUI(); this.fadeAndRemove(this.selectedRocket); this.fadeAndRemove(planetId); this.selectedRocket = null;
  }

  applyWrong(planetId) {
    const r = this.active.get(this.selectedRocket); const p = this.active.get(planetId);
    this.streak = 0; this.multiplier = 1; 

    this.shakeScreen('hard'); 
    window.TelegramAPI?.vibrate('error'); 

    this.updateAtmosphere();
    r.node.classList.add("wrong"); p.node.classList.add("wrong"); this.updateUI();
    setTimeout(() => { r.node.classList.remove("wrong", "selected"); p.node.classList.remove("wrong"); this.selectedRocket = null; }, 200);
  }

  applyBomb(planetId) {
    this.streak = 0; this.multiplier = 1; this.score = Math.max(0, this.score - 5);
    this.shakeScreen('hard'); 
    window.TelegramAPI?.vibrate('heavy'); 

    this.updateAtmosphere(); this.updateUI();
    this.fadeAndRemove(planetId); if (this.selectedRocket !== null) { const r = this.active.get(this.selectedRocket); r.node.classList.remove("selected"); } this.selectedRocket = null;
  }

  fadeAndRemove(id) {
    const e = this.active.get(id); if (!e) return;
    e.solved = true; e.node.style.transition = "opacity 0.2s"; e.node.style.opacity = "0"; setTimeout(() => this.removeEntity(id), 200);
  }

  removeEntity(id) { const e = this.active.get(id); if (!e) return; e.node?.remove(); this.active.delete(id); if (e.type === "rocket") this.correctAnswers.delete(id); }

  async endGame() {
    this.isPlaying = false; 
    clearInterval(this.timerId); 
    cancelAnimationFrame(this.rafId);
    this.bg.pause(); 
    document.getElementById('gameScreen').style.background = '#0a0a1a';
    
    const fillEl = document.querySelector("#resultModal .rt-fill");
    const hintEl = document.querySelector("#resultModal .rt-hint");
    
    document.getElementById("finalScore").textContent = "Calculating...";
    if (hintEl) hintEl.textContent = "Syncing with server...";
    
    document.getElementById("resultModal").style.display = "flex";

    if (fillEl) {
      fillEl.style.transition = "none"; 
      fillEl.style.width = "0%";
      void fillEl.offsetWidth; 
    }

    try {
      const result = await window.API.sessionFinish(this.currentSessionId, this.score, this.sessionLog);

      if (result.success) {
        document.getElementById("finalScore").textContent = this.score;
        
        if (result.is_valid === false) {
          if (hintEl) {
            hintEl.textContent = "⚠️ Result rejected (Anti-cheat)";
            hintEl.style.color = "#ff3333";
          }
        } else {
          const balance = result.score_balance || 0;
          const tCost = this.gameConfig ? this.gameConfig.ticket_cost : 5000;
          
          if (hintEl) {
            hintEl.style.color = "rgba(255,255,255,0.6)"; 
            hintEl.textContent = `${balance.toLocaleString()} / ${tCost.toLocaleString()} to next ticket`;
          }
          
          const percent = Math.min(100, Math.max(0, Math.round((balance / tCost) * 100)));
          
          if (fillEl) {
            setTimeout(() => {
                fillEl.style.transition = "width 1.2s cubic-bezier(0.34, 1.56, 0.64, 1)";
                fillEl.style.width = `${percent}%`;
            }, 100);
          }

          if (result.tickets_earned && result.tickets_earned > 0) {
            setTimeout(() => {
                if (typeof window.startWinFlow === 'function') {
                    window.startWinFlow();
                }
            }, 700); 
          }
        }
      }
    } catch (error) {
      console.error("End Game Error:", error);
      document.getElementById("finalScore").textContent = this.score;
      if (hintEl) {
        hintEl.textContent = "Error: " + (error.reason || error.message);
        hintEl.style.color = "#ff3333";
      }
    } finally {
      this.invalidateCache();
      this.syncProfile();
    }
  }
} // Конец класса GameSandbox

// ==========================================
// ==========================================
// ИНИЦИАЛИЗАЦИЯ ИГРЫ И УМНЫЙ ПРЕДЗАГРУЗЧИК
// ==========================================

// Новая усиленная проверка на мобильное устройство
function isMobileDevice() {
  // 1. Сначала проверяем через Telegram API (самый надежный способ)
  const tg = window.Telegram?.WebApp;
  if (tg && tg.platform) {
    const p = tg.platform;
    if (p === 'tdesktop' || p === 'macos') return false; // Точно компьютер
    if (p === 'android' || p === 'ios') return true;     // Точно телефон
  }
  // 2. Фолбэк на проверку браузера
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

document.addEventListener("DOMContentLoaded", () => { 
  // Если это не мобильный телефон — рубим запуск
  if (!isMobileDevice()) {
    const desktopWarning = document.getElementById('desktopWarning');
    const loadingScreen = document.getElementById('loadingScreen');
    
    if (desktopWarning) {
      desktopWarning.style.display = 'flex';
      desktopWarning.classList.add('active');
    }
    // Удаляем лоадер, чтобы он не крутился поверх заглушки
    if (loadingScreen) loadingScreen.remove();
    
    return; // ⛔️ Выходим из функции, игра не инициализируется
  }

  // Если всё ок — запускаем игру как обычно
  window.gameSandbox = new GameSandbox(); 
  runSmartPreloader();
});

async function runSmartPreloader() {
  const loadingScreen = document.getElementById('loadingScreen');
  const loadingFill = document.getElementById('loadingFill');
  
  // Убрали loadingText из проверок
  if (!loadingScreen || !loadingFill) return;

  // Чтобы игрок успел насладиться анимацией, задаем минимальное время показа (2.5 секунды)
  const MIN_LOADING_TIME = 2500; 
  const startTime = Date.now();

  let progress = 0;
  // Функция теперь только двигает полоску, без текста
  const updateProgress = (val) => {
    progress += val;
    if (progress > 100) progress = 100;
    loadingFill.style.width = `${progress}%`;
  };

  try {
    updateProgress(10); // Даем первый импульс загрузке

    // 1. Предзагрузка тяжелых SVG-картинок
    const imagesToPreload = [
      'assets/ticket.svg', 'assets/energy.svg', 'assets/star.svg', 
      'assets/coin.svg', 'assets/tv.svg', 'assets/gamepad.svg', 
      'assets/calendar.svg', 'assets/trophy.svg', 'assets/winner.svg', 
      'assets/nft.svg', 'assets/nft1.svg', 'assets/nft2.svg', 'assets/nft3.svg'
    ];
    
    await Promise.all(imagesToPreload.map(src => {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = resolve;
        img.onerror = resolve; // Если картинки нет, игнорируем
        img.src = src;
      });
    }));
    updateProgress(20);

    // 2. Делаем запросы к БД (Синхронизация профиля и глобального счетчика билетов)
    if (window.gameSandbox) {
      await Promise.all([
        window.gameSandbox.syncProfile(),
        loadGlobalTickets() // Загружаем счетчик билетов параллельно
      ]);
    }
    updateProgress(20);

    // 3. Высчитываем, сколько времени прошло. Если всё загрузилось за 0.5 сек,
    // искусственно ждем оставшиеся 2 секунды, плавно двигая бар.
    const elapsedTime = Date.now() - startTime;
    const timeLeft = Math.max(0, MIN_LOADING_TIME - elapsedTime);

    const steps = 10;
    const stepTime = Math.floor(timeLeft / steps);
    const progressLeft = 100 - progress;
    const stepProgress = progressLeft / steps;

    for (let i = 0; i < steps; i++) {
      if (stepTime > 0) {
        await new Promise(r => setTimeout(r, stepTime));
      }
      updateProgress(stepProgress);
    }

  } catch (error) {
    console.error("Preloader Error:", error);
    updateProgress(100); // В случае ошибки все равно доводим бар до конца, чтобы пустить в игру
  }

  // Завершение загрузки: Прячем лоадер, показываем нужный экран
  setTimeout(() => {
    loadingScreen.classList.add('hidden-smooth');
    
    // Проверяем, прошел ли игрок онбординг
    const hasSeenOnboarding = localStorage.getItem('digit_tutorial_done');
    const obScreen = document.getElementById('onboardingScreen');
    const mainScreen = document.getElementById('startScreen');

    if (hasSeenOnboarding === 'true' || !obScreen) {
      if (mainScreen) {
        mainScreen.classList.add('active');
        // 👇 ВОТ ЭТА СТРОЧКА ЗАПУСТИТ АНИМАЦИЮ ЗВЕЗД В МЕНЮ 👇
        if (window.gameSandbox && window.gameSandbox.startBg) {
            window.gameSandbox.startBg.start(); 
        }
      }
    } else {
      if (obScreen) obScreen.classList.add('active');
    }

    // Удаляем лоадер из DOM через 600мс (когда закончится анимация прозрачности)
    setTimeout(() => loadingScreen.remove(), 600);

  }, 300);
}

// ==========================================
// СЕРВЕРНЫЙ ТАЙМЕР СЕЗОНА
// ==========================================
window.seasonTimerInterval = null;

window.startSeasonTimer = function(dateString) {
  if (window.seasonTimerInterval) clearInterval(window.seasonTimerInterval);
  const seasonEndDate = new Date(dateString);
  
  function updateTimer() {
    const now = new Date();
    const diff = seasonEndDate - now;
    if (diff <= 0) return;

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const format = (num) => num.toString().padStart(2, '0');

    const dStr = format(days); const hStr = format(hours); const mStr = format(mins);
    
    const elD1 = document.getElementById('heroTimerD1'); const elD2 = document.getElementById('heroTimerD2');
    if (elD1 && elD2) { elD1.textContent = dStr.length > 2 ? dStr[dStr.length - 2] : dStr[0]; elD2.textContent = dStr[dStr.length - 1]; }

    const elH1 = document.getElementById('heroTimerH1'); const elH2 = document.getElementById('heroTimerH2');
    if (elH1 && elH2) { elH1.textContent = hStr[0]; elH2.textContent = hStr[1]; }

    const elM1 = document.getElementById('heroTimerM1'); const elM2 = document.getElementById('heroTimerM2');
    if (elM1 && elM2) { elM1.textContent = mStr[0]; elM2.textContent = mStr[1]; }
  }
  
  updateTimer();
  window.seasonTimerInterval = setInterval(updateTimer, 10000); 
};

// ==========================================
// НАВИГАЦИЯ ПО НИЖНЕМУ МЕНЮ
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  const navButtons = document.querySelectorAll('.nav-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      window.TelegramAPI?.vibrate('light');
      
      navButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      tabContents.forEach(tab => { 
        tab.style.display = 'none'; 
        tab.classList.remove('active'); 
      });

      const targetTabId = btn.getAttribute('data-tab');
      const targetTab = document.getElementById(targetTabId);
      
      if (targetTab) {
        targetTab.style.display = 'flex'; 
        setTimeout(() => targetTab.classList.add('active'), 10);
        
        if (targetTabId === 'leaderboardTab' || targetTabId === 'leaderboard') { 
          if (window.gameSandbox) window.gameSandbox.loadLeaderboard();
        }
        if (targetTabId === 'missionsTab' || targetTabId === 'missions') { 
          if (window.gameSandbox) window.gameSandbox.loadMissions();
        }
      }
    });
  });
});

// ==========================================
// ЛОГИКА ВКЛАДОК В МИССИЯХ (DAILY / ONE-TIME)
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  const missionTabs = document.querySelectorAll('.custom-tabs .c-tab');
  missionTabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
      window.TelegramAPI?.vibrate('light');
      missionTabs.forEach(t => t.classList.remove('active'));
      e.target.classList.add('active');
      if (window.gameSandbox) window.gameSandbox.loadMissions(); 
    });
  });
});

// ==========================================
// ЛОГИКА ОНБОРДИНГА
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  const obScreen = document.getElementById('onboardingScreen');
  const mainScreen = document.getElementById('startScreen');

  const hasSeenOnboarding = localStorage.getItem('digit_tutorial_done');

  // Если туториал пройден, ничего не делаем. Экран включит сам Прелоадер.
  if (hasSeenOnboarding === 'true') {
    return; 
  }

  const slides = document.querySelectorAll('.ob-slide');
  const dots = document.querySelectorAll('.ob-dot');
  const btnPrev = document.getElementById('obPrevBtn');
  const btnNext = document.getElementById('obNextBtn');
  const btnStartGame = document.getElementById('obStartGameBtn');
  let currentSlide = 0;

  function updateSlider() {
    slides.forEach((slide, index) => { if (index === currentSlide) slide.classList.add('active'); else slide.classList.remove('active'); });
    dots.forEach((dot, index) => { if (index === currentSlide) dot.classList.add('active'); else dot.classList.remove('active'); });
    if (btnPrev) { if (currentSlide === 0) btnPrev.classList.add('hidden'); else { btnPrev.classList.remove('hidden'); btnPrev.classList.add('visible'); } }
    if (btnNext) { if (currentSlide === slides.length - 1) btnNext.classList.add('hidden'); else { btnNext.classList.remove('hidden'); btnNext.classList.add('visible'); } }
  }

  if (btnNext) { btnNext.addEventListener('click', () => { window.TelegramAPI?.vibrate('light'); if (currentSlide < slides.length - 1) { currentSlide++; updateSlider(); } }); }
  if (btnPrev) { btnPrev.addEventListener('click', () => { window.TelegramAPI?.vibrate('light'); if (currentSlide > 0) { currentSlide--; updateSlider(); } }); }
if (btnStartGame) {
    btnStartGame.addEventListener('click', () => {
      window.TelegramAPI?.vibrate('medium'); 
      localStorage.setItem('digit_tutorial_done', 'true');
      if (obScreen) obScreen.classList.remove('active');
      if (mainScreen) {
        mainScreen.classList.add('active');
        // 👇 ВКЛЮЧАЕМ ЗВЕЗДЫ ПОСЛЕ ОНБОРДИНГА 👇
        if (window.gameSandbox && window.gameSandbox.startBg) {
            window.gameSandbox.startBg.start(); 
        }
      }
    });
  }

  if (obScreen && slides.length > 0) updateSlider();
});

// ==========================================
// ЛОГИКА АНИМАЦИИ ПОБЕДЫ (TICKET & NFT)
// ==========================================
window.startWinFlow = function() {
  const overlay = document.getElementById('fxOverlay');
  if(overlay) overlay.classList.add('active');
  
  window.switchView('viewWin');
  
  // Вибрация успеха через твой API
  window.TelegramAPI?.vibrate('success');
  
  window.spawnConfetti();
};

window.switchView = function(viewId) {
  document.querySelectorAll('.reward-window').forEach(w => w.classList.remove('active'));
  const view = document.getElementById(viewId);
  if(view) view.classList.add('active');
  
  window.TelegramAPI?.vibrate('light');
};

window.closeAll = function() {
  const overlay = document.getElementById('fxOverlay');
  if(overlay) overlay.classList.remove('active');
  
  // Сбрасываем на первый экран через полсекунды (когда анимация закрытия пройдет)
  setTimeout(() => {
      window.switchView('viewWin');
  }, 500);
};

window.spawnConfetti = function() {
  for (let i = 0; i < 60; i++) {
      const p = document.createElement('div');
      p.className = 'p-star'; 
      
      const inner = document.createElement('div');
      inner.className = 'icon-svg mask-star';
      p.appendChild(inner);

      p.style.width = p.style.height = (Math.random() * 10 + 6) + 'px';
      p.style.left = '50%'; p.style.top = '50%';
      document.body.appendChild(p);

      const angle = Math.random() * Math.PI * 2;
      const velocity = Math.random() * 400 + 150;
      const tx = Math.cos(angle) * velocity;
      const ty = Math.sin(angle) * velocity;
      const rot = Math.random() * 720 - 360;

      p.animate([
          { transform: 'translate(-50%, -50%) scale(1) rotate(0deg)', opacity: 1 },
          { transform: `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px)) scale(0) rotate(${rot}deg)`, opacity: 0 }
      ], {
          duration: Math.random() * 800 + 800,
          easing: 'cubic-bezier(0, .9, .57, 1)'
      }).onfinish = () => p.remove();
  }
};

// ==========================================
// ГЛОБАЛЬНЫЙ СЧЕТЧИК БИЛЕТОВ
// ==========================================
async function loadGlobalTickets() {
  const counterEl = document.getElementById('globalTicketsCount');
  if (!counterEl || !window.API || typeof window.API.getGlobalStats !== 'function') return;

  try {
    const stats = await window.API.getGlobalStats();
    if (stats && stats.success) {
      counterEl.innerText = stats.total_tickets.toLocaleString();
    }
  } catch (err) {
    console.error("[TICKETS] Ошибка запроса:", err);
  }
}
