// game.js — Clean Sandbox with JuiceFX, Freeze, and Flicker Fix

const ENTITY_LIFETIME_MS = 11500;
const ROCKET_SPAWN_MS    = 900;
const PLANET_SPAWN_MS    = 800;
const INPUT_LOCK_MS      = 140;




// Утилиты
function randInt(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
function round1(x) { return Math.round(x * 10) / 10; }
function equalsNum(a, b) { return Math.abs(a - b) < 1e-9; }

function generateExample() {
  const op = Math.floor(Math.random() * 5);
  if (op === 0) { const a = randInt(1, 15), b = randInt(1, 15); return { example:`${a}+${b}`, answer:a+b }; }
  if (op === 1) { const a = randInt(1, 20), b = randInt(1, a); return { example:`${a}-${b}`, answer:a-b }; }
  if (op === 2) { const a = randInt(1, 9),  b = randInt(1, 9); return { example:`${a}×${b}`, answer:a*b }; }
  if (op === 3) { const a = round1(0.1 + Math.random()*1.9), b = round1(0.1 + Math.random()*1.9); return { example:`${a}+${b}`, answer:round1(a+b) }; }
  const a = round1(0.5 + Math.random()*2.5); let b = round1(Math.random()*a);
  if (b < 0.1) b = 0.1; if (b > a) b = a;
  return { example:`${a}-${b}`, answer:round1(a-b) };
}

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
    const parent = this.canvas.parentElement;
    if (parent) { this.canvas.width = parent.clientWidth; this.canvas.height = parent.clientHeight; this.buildStars(); }
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
    // Добавляем небольшой случайный разброс, чтобы хвост был объемным
    const offsetX = x + (Math.random() * 30 - 15);
    const offsetY = y + (Math.random() * 30 - 15);
    
    this.particles.push({ 
      x: offsetX, 
      y: offsetY, 
      vx: (Math.random() - 0.5) * 0.5, // Почти не имеют своей скорости, висят на месте
      vy: (Math.random() - 0.5) * 0.5, 
      life: 1.0, 
      decay: Math.random() * 0.04 + 0.02, // Скорость таяния
      color: color, 
      size: Math.random() * 3 + 1.5 // Рандомный размер льдинок
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
    
    this.active = new Map(); this.correctAnswers = new Map(); this.idSeq = 0;
    this.lastRAF = 0; this.lastRocketSpawnAt = 0; this.lastPlanetSpawnAt = 0;
    
    this.maxRockets = 12; this.maxPlanets = 15;
    this.columns = 6; this.columnWidth = 0; this.gameSize = { w: 0, h: 0 };
    this.inputLockUntil = 0;

    // Инициализируем два фона
    this.bg = new MinimalSpaceBG('playBgCanvas');
    this.startBg = new MinimalSpaceBG('startBgCanvas'); // Фон для главного меню
    
    this.fx = new JuiceFX();
    
    this.bindUI();
    
    // Запускаем звезды в главном меню сразу при загрузке
    this.startBg.init();
    this.startBg.start();
  }

  bindUI() {
    document.getElementById("startGameBtn").addEventListener("click", () => this.startGame());
    document.getElementById("playAgainBtn").addEventListener("click", () => {
      document.getElementById("resultModal").style.display = "none";
      this.startGame();
    });
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

startGame() {
    document.getElementById("startScreen").classList.remove("active");
    document.getElementById("gameScreen").classList.add("active");

    // Выключаем анимацию звезд главного меню ради производительности
    if (this.startBg) this.startBg.pause();

    requestAnimationFrame(() => {
      requestAnimationFrame((now) => {
        this.score = 0; this.timeLeft = 30; this.streak = 0; this.multiplier = 1;
        this.selectedRocket = null; this.freezeUntil = 0; this.isPlaying = true;
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
        overlay.classList.remove("hidden");
        overlay.classList.remove("hiding");
        countdownEl.textContent = "3";
        countdownEl.classList.add("warmup-tick");

        this.lastRocketSpawnAt = now;
        this.lastPlanetSpawnAt = now + 200;
        this.spawnRocket();

        this.startMainLoop();

        const steps = ["3", "2", "1", "START!"];
        let step = 0;
        const tick = () => {
          step++;
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
              this.startTimer();
            }, 500);
          }
        };
        setTimeout(tick, 1000);
      });
    });
  }

  clearGameArea() {
    this.active.forEach(e => e.node?.remove());
    this.active.clear(); this.correctAnswers.clear();
    this.idSeq = 0;
    cancelAnimationFrame(this.rafId); clearInterval(this.timerId);
    const area = document.getElementById("fullscreenGameArea");
    if (area) area.querySelectorAll('.rocket, .planet, .bonus-ice').forEach(n => n.remove());
  }

  startTimer() {
    this.timerId = setInterval(() => {
      if (performance.now() < this.freezeUntil) return; // Заморозка времени
      this.timeLeft -= 1; this.updateUI();
      if (this.timeLeft <= 0) this.endGame();
    }, 1000);
  }

  updateUI() {
    document.getElementById("timer").textContent = this.timeLeft;
    document.getElementById("score").textContent = this.score;
    document.getElementById("multiplier").textContent = this.multiplier;
  }

updateAtmosphere() {
    const fs = document.getElementById('gameScreen');
    const timerEl = document.getElementById('timer');
    let bg = '#0a0a1a'; 
    let isFrozen = performance.now() < this.freezeUntil;

    // Сначала всегда сбрасываем старые фильтры
    fs.classList.remove('frozen-ice', 'frozen-toxic', 'frozen-solar');

    if (isFrozen && this.activeFreezeType) {
       fs.classList.add(`frozen-${this.activeFreezeType}`); // Включаем нужный фильтр
       fs.style.border = 'none'; fs.style.boxShadow = 'none';
       timerEl.classList.add('timer-ice');

       // Разные радиальные фоны для разных комет
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
    const app = document.getElementById('mobileApp');
    const cls = type === 'hard' ? 'shake-h' : 'shake-s';
    app.classList.remove('shake-s', 'shake-h'); void app.offsetWidth;
    app.classList.add(cls); setTimeout(() => app.classList.remove(cls), 350);
  }

  showScorePopup(x, y, text) {
    const el = document.createElement("div");
    el.style.cssText = `position:fixed;left:${x}px;top:${y}px;transform:translate(-50%,-50%);font-size:1.5em;font-weight:900;color:#ffd700;text-shadow:0 0 10px #ffd700;z-index:2500;pointer-events:none;font-family:'Orbitron',monospace;opacity:0;transition:all 0.6s ease-out;`;
    el.textContent = text; document.body.appendChild(el);
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

      // ВАЖНО: Единый множитель ускорения для экрана 3-2-1
      // 2.0 означает, что всё будет в 2 раза быстрее (и падать, и спавниться)
      const warmupMultiplier = this.isWarmup ? 1.4 : 1.0;

      // Применяем его к задержке (чтобы плотность осталась той же)
      const dynamicRocketDelay = (ROCKET_SPAWN_MS / speedMult / warmupMultiplier) / timeFactor;
      const dynamicPlanetDelay = (PLANET_SPAWN_MS / speedMult / warmupMultiplier) / timeFactor;

      const dtSec = Math.max(0, Math.min(48, now - this.lastRAF)) / 1000;
      this.lastRAF = now;

      this.updateAtmosphere();

      if (now < this.magnetUntil) {
        this.autoCollectAnswers();
      }

      const entities = Array.from(this.active.values());
      for (const e of entities) {
        // 1. Двигаем по горизонтали, УМНОЖАЯ НА warmupMultiplier
        if (e.vx !== undefined) {
          e.x += e.vx * dtSec * timeFactor * warmupMultiplier;
        }

        // 2. Двигаем по вертикали, УМНОЖАЯ НА warmupMultiplier
        e.y += e.vy * dtSec * timeFactor * warmupMultiplier;

        if (!e.node?.parentNode || e.solved) continue;

        // 3. Проверка выхода за границы экрана
        if (e.y >= this.gameSize.h + 140 || e.x > this.gameSize.w + 200 || e.x < -200) { 
          this.removeEntity(e.id); 
          continue; 
        }

        // 4. ОБНОВЛЕНИЕ ТРАНСФОРМАЦИИ
        const posX = e.x !== undefined ? e.x : 0; 
        e.node.style.transform = `translate3d(${posX}px, ${e.y}px, 0) scale(${e.scale})`;

        // --- ШЛЕЙФ ДЛЯ КОМЕТЫ ---
        if (e.type === "bonus" && Math.random() > 0.3) {
          let c1 = '#c2f8ff', c2 = '#00f3ff'; 
          if (e.cometType === 'toxic') { c1 = '#dcfce7'; c2 = '#39ff14'; } 
          else if (e.cometType === 'solar') { c1 = '#fef9c3'; c2 = '#ffcc00'; } 
          
          this.fx.trail(posX + 40, e.y + 40, c1);
          this.fx.trail(posX + 40, e.y + 40, c2);
        }
      }

      // Спавн ракет и планет
      if (this.countType("rocket") < this.maxRockets && now - this.lastRocketSpawnAt >= dynamicRocketDelay) { 
        if (this.spawnRocket()) this.lastRocketSpawnAt = now; 
      }
      if (this.countType("planet") + this.countType("bonus") < this.maxPlanets && now - this.lastPlanetSpawnAt >= dynamicPlanetDelay) { 
        if (this.spawnPlanet()) this.lastPlanetSpawnAt = now; 
      }

      if (Math.random() < 0.0015 && this.countType("bonus") < 1 && !isFrozen) {
        this.spawnComet();
      }

      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

 spawnRocket() {
    const id = this.idSeq++; 
    const { example, answer } = generateExample();
    const lane = this.pickFreeLane(); 
    if (lane === null) return false;

    const randomSvg = ROCKET_SVGS[Math.floor(Math.random() * ROCKET_SVGS.length)];
    const el = document.createElement("div"); 
    el.className = "rocket"; 
    el.id = `rocket-${id}`;
    
    // Рассчитываем X координату
    const xStart = this.laneToX(lane, 94);
    const yStart = -90;
    const yEnd = this.gameSize.h + 140;
    const vy = ((yEnd - yStart) / (ENTITY_LIFETIME_MS / 1000)) * Math.min(1.3, 1 + (this.multiplier - 1) * 0.035);

    // Устанавливаем left в 0, чтобы всем управлял transform
    el.style.left = `0px`; 
    el.innerHTML = `${randomSvg}<div class="rocket-text">${example}</div>`;
    
    // ФИКС МОРГАНИЯ: теперь используем xStart вместо 0
    el.style.transform = `translate3d(${xStart}px, ${yStart}px, 0) scale(1)`;
    
    el.addEventListener("pointerdown", () => {
      if (this.isWarmup) return;
      const now = performance.now(); 
      if (now < this.inputLockUntil) return; 
      this.inputLockUntil = now + INPUT_LOCK_MS;
      this.selectRocket(id);
    });
    
    document.getElementById("fullscreenGameArea").appendChild(el);
    
    // ВАЖНО: Добавляем x: xStart для корректной работы цикла движения
    this.active.set(id, { id, type:"rocket", node: el, answer, lane, x: xStart, y: yStart, vy, scale: 1, solved:false });
    this.correctAnswers.set(id, answer);
    return true;
  }

spawnPlanet() {
    const id = this.idSeq++; 
    const lane = this.pickFreeLane(); 
    if (lane === null) return false;

    let answer, isBomb = false, contentHtml = '';

    if (Math.random() < 0.3) { 
      answer = randInt(1, 50); 
      isBomb = ![...this.correctAnswers.values()].some(v => equalsNum(v, answer)); 
    } else {
      const hasMatchingPlanet = (ans) => { 
        for (const e of this.active.values()) { 
          if (e.type === "planet" && e.answer !== undefined && equalsNum(e.answer, ans)) return true; 
        } 
        return false; 
      };
      const starvingAnswers = [...this.correctAnswers.values()].filter(a => !hasMatchingPlanet(a));
      const pool = starvingAnswers.length ? starvingAnswers : [...this.correctAnswers.values()];
      answer = pool.length ? pool[Math.floor(Math.random() * pool.length)] : randInt(1, 50);
    }

    if (isBomb) {
  contentHtml = `<div class="planet-svg-wrap bomb-asteroid">${BOMB_ASTEROID_SVG}</div>`;
} else {
  const randomPlanetSvg = PLANET_SVGS_WRAPPED[Math.floor(Math.random() * PLANET_SVGS_WRAPPED.length)];
  contentHtml = `<div class="planet-svg-wrap">${randomPlanetSvg}</div><div class="planet-text">${Number.isInteger(answer) ? answer : answer.toFixed(1)}</div>`;
}

    const el = document.createElement("div"); 
    el.className = "planet"; 
    el.id = `planet-${id}`;
    
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

spawnComet() {
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

    // --- ИЗМЕНЕНИЕ 1: Выбираем тип кометы (добавлен магнит) ---
    const rand = Math.random();
    let cometType = 'ice', svg = FREEZE_SVG;
    if (rand < 0.25) { cometType = 'toxic'; svg = COMET_TOXIC_SVG; }
    else if (rand < 0.5) { cometType = 'solar'; svg = COMET_SOLAR_SVG; }
    else if (rand < 0.75) { cometType = 'magnet'; svg = MAGNET_SVG; }

    const el = document.createElement("div");
    // --- ИЗМЕНЕНИЕ 2: Динамический класс (теперь не жестко bonus-ice) ---
    el.className = `planet bonus-${cometType}`;
    el.id = `comet-${id}`;
    el.style.left = `0px`; 
    el.innerHTML = `<div class="bonus-pulse" style="transform: rotate(${angleDeg}deg)">${svg}</div>`;
    
    el.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      if (this.isWarmup) return;
      
      // --- ИЗМЕНЕНИЕ 3: Логика магнита против логики заморозки ---
if (cometType === 'magnet') {
        this.magnetUntil = performance.now() + 1000;
        this.showScorePopup(this.gameSize.w/2, this.gameSize.h/2, "🧲 MAGNET!"); // Добавили сочности
        this.fadeAndRemove(id); 
      } else {
        this.activateFreeze(id, cometType); // Старая добрая заморозка
      }
    });

    area.appendChild(el);

    const duration = 3.5;
    const vx = (xEnd - xStart) / duration;
    const vy = (yEnd - yStart) / duration;
  
    this.active.set(id, { id, type: "bonus", cometType: cometType, node: el, x: xStart, y: yStart, vx, vy, scale: 1, solved: false });
  }

  autoCollectAnswers() {
    const now = performance.now();
    // Делаем задержку между выстрелами магнита, чтобы лазеры вылетали красиво по очереди (раз в 200 мс)
    if (!this.lastMagnetShot) this.lastMagnetShot = 0;
    if (now - this.lastMagnetShot < 200) return;

    // Собираем все летящие ракеты и безопасные планеты
    const rockets = Array.from(this.active.values()).filter(e => e.type === 'rocket' && !e.solved);
    const planets = Array.from(this.active.values()).filter(e => e.type === 'planet' && !e.solved && !e.isBomb);

    if (rockets.length > 0 && planets.length > 0) {
      for (let r of rockets) {
        for (let p of planets) {
          // Если ответ ракеты совпадает с ответом на планете
          if (r.answer === p.answer) {
            // Имитируем действия игрока!
            this.selectedRocket = r.id;   // Выбираем ракету
            this.tryAnswer(p.id);         // Стреляем в планету
            
            this.lastMagnetShot = now;    // Запоминаем время выстрела
            return; // Выходим из функции, чтобы за один кадр сделать только 1 выстрел
          }
        }
      }
    }
  }
  activateFreeze(id, type) {
    const e = this.active.get(id);
    if (!e) return;

    let duration = 5000, popupText = "❄️ FROZEN!", explodeColor = '#00f3ff';

    // Настраиваем логику для каждой кометы
    if (type === 'toxic') {
        duration = 3500; popupText = "🧪 TOXIC x2!"; explodeColor = '#39ff14';
    } else if (type === 'solar') {
        duration = 8000; popupText = "☀️ SOLAR SLOW!"; explodeColor = '#ffcc00';
    }

    this.fx.explode(e.x + 40, e.y + 40, explodeColor, 30);
    this.fadeAndRemove(id);
    
    this.freezeUntil = performance.now() + duration;
    this.activeFreezeType = type; // Запоминаем, какой фильтр включить
    this.updateAtmosphere();
    this.showScorePopup(this.gameSize.w/2, this.gameSize.h/2, popupText);
  }

  selectRocket(id) {
    this.active.forEach(e => { if (e.type === "rocket") { e.scale = 1; e.node.classList.remove("selected"); } });
    const r = this.active.get(id); if (r) { r.scale = 1.08; r.node.classList.add("selected"); this.selectedRocket = id; }
  }

tryAnswer(planetId) {
    if (this.selectedRocket === null) return;
    const p = this.active.get(planetId); const r = this.active.get(this.selectedRocket);
    if (!p || !r) return;

    if (p.isBomb) { this.applyBomb(planetId); return; }

    if (equalsNum(p.answer, r.answer)) {
      // ИСПРАВЛЕНИЕ: Используем r.x и p.x вместо offsetLeft!
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
    this.streak++; this.multiplier = Math.min(10, Math.floor(this.streak / 2) + 1);
    
    // БАЗОВЫЕ ОЧКИ
    let pts = 1 * this.multiplier; 
    
    // ПРОВЕРЯЕМ ТОКСИЧНУЮ КОМЕТУ
    if (performance.now() < this.freezeUntil && this.activeFreezeType === 'toxic') {
        pts *= 2; // Множитель х2 работает!
    }
    this.score += pts;

    // <--- ВИБРАЦИЯ ЗДЕСЬ (Легкий приятный щелчок при успехе)
    TelegramAPI.vibrate('light'); 
    
    this.updateAtmosphere(); r.node.classList.add("correct"); p.node.classList.add("correct");
    this.showScorePopup(p.x + 40, p.y + 40, `+${pts}`);
    this.updateUI(); this.fadeAndRemove(this.selectedRocket); this.fadeAndRemove(planetId); this.selectedRocket = null;
  }

  applyWrong(planetId) {
    const r = this.active.get(this.selectedRocket); const p = this.active.get(planetId);
    this.streak = 0; this.multiplier = 1; 

    this.shakeScreen('hard'); 
    // <--- ВИБРАЦИЯ ЗДЕСЬ (Двойной вибро-сигнал ошибки вместе с тряской экрана)
    TelegramAPI.vibrate('error'); 

    this.updateAtmosphere();
    r.node.classList.add("wrong"); p.node.classList.add("wrong"); this.updateUI();
    setTimeout(() => { r.node.classList.remove("wrong", "selected"); p.node.classList.remove("wrong"); this.selectedRocket = null; }, 200);
  }

  applyBomb(planetId) {
    this.streak = 0; this.multiplier = 1; this.score = Math.max(0, this.score - 5);
    
    this.shakeScreen('hard'); 
    // <--- ВИБРАЦИЯ ЗДЕСЬ (Тяжелый глухой удар при взрыве бомбы)
    TelegramAPI.vibrate('heavy'); 

    this.updateAtmosphere(); this.updateUI();
    this.fadeAndRemove(planetId); if (this.selectedRocket !== null) { const r = this.active.get(this.selectedRocket); r.node.classList.remove("selected"); } this.selectedRocket = null;
  }

  fadeAndRemove(id) {
    const e = this.active.get(id); if (!e) return;
    e.solved = true; e.node.style.transition = "opacity 0.2s"; e.node.style.opacity = "0"; setTimeout(() => this.removeEntity(id), 200);
  }

  removeEntity(id) { const e = this.active.get(id); if (!e) return; e.node?.remove(); this.active.delete(id); if (e.type === "rocket") this.correctAnswers.delete(id); }

  endGame() {
    this.isPlaying = false; clearInterval(this.timerId); cancelAnimationFrame(this.rafId);
    this.bg.pause(); document.getElementById('gameScreen').style.background = '#0a0a1a';
    document.getElementById("finalScore").textContent = this.score;
    document.getElementById("resultModal").style.display = "flex";
  }
}


document.addEventListener("DOMContentLoaded", () => { window.gameSandbox = new GameSandbox(); });


// ==========================================
// ЛЮКСОВЫЙ ТАЙМЕР ДЛЯ ГЛАВНОГО ЭКРАНА
// ==========================================
function startSeasonTimer() {
  // Укажите точную дату окончания 1 сезона! 
  // Формат: Год, Месяц (от 0 до 11, где 0 - Январь), День, Час, Минута
  // Например: 1 Июня 2026 года, 18:00
  const seasonEndDate = new Date(Date.UTC(2026, 5, 1, 18, 0, 0));

  function updateTimer() {
    const now = new Date();
    const diff = seasonEndDate - now;

    if (diff <= 0) {
      // Сезон завершен (можно поставить нули)
      return;
    }

    // Считаем дни, часы и минуты
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    // Функция, которая делает из числа "9" строку "09" (чтобы всегда было 2 символа)
    const format = (num) => num.toString().padStart(2, '0');

    const dStr = format(days);
    const hStr = format(hours);
    const mStr = format(mins);

    // Раскидываем КАЖДУЮ цифру в свой собственный слот
    
    // Дни (D1 и D2)
    const elD1 = document.getElementById('heroTimerD1');
    const elD2 = document.getElementById('heroTimerD2');
    if (elD1 && elD2) {
        // Если дней больше 99 (например 120), берем последние две цифры, либо добавьте еще один слот в HTML
        elD1.textContent = dStr.length > 2 ? dStr[dStr.length - 2] : dStr[0]; 
        elD2.textContent = dStr[dStr.length - 1];
    }

    // Часы (H1 и H2)
    const elH1 = document.getElementById('heroTimerH1');
    const elH2 = document.getElementById('heroTimerH2');
    if (elH1 && elH2) {
        elH1.textContent = hStr[0];
        elH2.textContent = hStr[1];
    }

    // Минуты (M1 и M2)
    const elM1 = document.getElementById('heroTimerM1');
    const elM2 = document.getElementById('heroTimerM2');
    if (elM1 && elM2) {
        elM1.textContent = mStr[0];
        elM2.textContent = mStr[1];
    }
  }

  // Обновляем таймер сразу при запуске
  updateTimer();
  
  // Так как у нас нет секунд на экране, нам не нужно обновлять его каждую секунду.
  // Обновляем раз в 10 секунд (10000 мс) - это сэкономит батарею телефона игрока!
  setInterval(updateTimer, 10000); 
}

// Запускаем, когда игра загрузилась
document.addEventListener('DOMContentLoaded', startSeasonTimer);




// ==========================================
// НАВИГАЦИЯ ПО НИЖНЕМУ МЕНЮ
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  const navButtons = document.querySelectorAll('.nav-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      // 1. Убираем класс active у всех кнопок
      navButtons.forEach(b => b.classList.remove('active'));
      // 2. Добавляем active нажатой кнопке
      btn.classList.add('active');

      // 3. Скрываем все вкладки
      tabContents.forEach(tab => {
        tab.style.display = 'none';
        tab.classList.remove('active');
      });

      // 4. Показываем нужную вкладку
      const targetTabId = btn.getAttribute('data-tab');
      const targetTab = document.getElementById(targetTabId);
      if (targetTab) {
        targetTab.style.display = 'flex'; // У нас вкладки используют flex-direction: column
        // Небольшой таймаут для плавности анимации (если она есть)
        setTimeout(() => targetTab.classList.add('active'), 10);
      }
    });
  });
});


// ==========================================
// ЛОГИКА ЭКРАНА ОНБОРДИНГА (ОБУЧЕНИЯ)
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  const obScreen = document.getElementById('onboardingScreen');
  const mainScreen = document.getElementById('startScreen');
  
  const slides = document.querySelectorAll('.ob-slide');
  const dots = document.querySelectorAll('.ob-dot');
  const btnPrev = document.getElementById('obPrevBtn');
  const btnNext = document.getElementById('obNextBtn');
  const btnStartGame = document.getElementById('obStartGameBtn');

  let currentSlide = 0;

  // Функция обновления состояния слайдера
  function updateSlider() {
    // 1. Переключаем классы активного слайда
    slides.forEach((slide, index) => {
      if (index === currentSlide) {
        slide.classList.add('active');
      } else {
        slide.classList.remove('active');
      }
    });

    // 2. Переключаем активные точки
    dots.forEach((dot, index) => {
      if (index === currentSlide) {
        dot.classList.add('active');
      } else {
        dot.classList.remove('active');
      }
    });

    // 3. Прячем/показываем стрелки в зависимости от слайда
    if (currentSlide === 0) {
      btnPrev.classList.add('hidden');
    } else {
      btnPrev.classList.remove('hidden');
      btnPrev.classList.add('visible');
    }

    if (currentSlide === slides.length - 1) {
      btnNext.classList.add('hidden');
    } else {
      btnNext.classList.remove('hidden');
      btnNext.classList.add('visible');
    }
  }

  // Клик "Вперед"
  btnNext.addEventListener('click', () => {
    if (currentSlide < slides.length - 1) {
      currentSlide++;
      updateSlider();
    }
  });

  // Клик "Назад"
  btnPrev.addEventListener('click', () => {
    if (currentSlide > 0) {
      currentSlide--;
      updateSlider();
    }
  });

  // Клик "LET'S GO" (Завершение онбординга)
  btnStartGame.addEventListener('click', () => {
    obScreen.classList.remove('active'); // Скрываем онбординг
    mainScreen.classList.add('active');  // Показываем главный экран
  });

  // Инициализируем стартовое состояние при запуске
  if (obScreen && slides.length > 0) {
    updateSlider();
  }
});









