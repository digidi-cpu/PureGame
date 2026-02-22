// game.js — Clean Sandbox with JuiceFX, Freeze, and Flicker Fix

const ENTITY_LIFETIME_MS = 8800;
const ROCKET_SPAWN_MS    = 1100;
const PLANET_SPAWN_MS    = 950;
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
    this.score = 0; this.timeLeft = 40; this.streak = 0; this.multiplier = 1;
    this.selectedRocket = null; this.freezeUntil = 0; this.isPlaying = false;
    
    this.active = new Map(); this.correctAnswers = new Map(); this.idSeq = 0;
    this.lastRAF = 0; this.lastRocketSpawnAt = 0; this.lastPlanetSpawnAt = 0;
    
    this.maxRockets = 8; this.maxPlanets = 9;
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
      this.score = 0; this.timeLeft = 40; this.streak = 0; this.multiplier = 1;
      this.selectedRocket = null; this.freezeUntil = 0; this.isPlaying = true;
      
      this.clearGameArea(); 
      this.updateUI(); 
      this.updateGameSize(); 
      
      this.bg.init(); 
      this.bg.start();
      
      this.lastRAF = performance.now();
      this.startMainLoop();
      this.startTimer();
    });
  }

  clearGameArea() {
    this.active.forEach(e => e.node?.remove());
    this.active.clear(); this.correctAnswers.clear();
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
    let bg = '#0a0a1a'; let isFrozen = performance.now() < this.freezeUntil;

    if (isFrozen) {
       bg = 'radial-gradient(circle at center, #001f3f 0%, #000a1a 100%)';
       fs.style.border = '4px solid #00f3ff'; fs.style.boxShadow = 'inset 0 0 50px #00f3ff';
       timerEl.classList.add('timer-ice');
    } else {
       fs.style.border = 'none'; fs.style.boxShadow = 'none';
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

  laneToX(lane) { return Math.round(10 + lane * this.columnWidth + (this.columnWidth - 70) / 2); }
  isLaneFree(lane, SAFE_Y = 160) { let free = true; this.active.forEach(e => { if (e.lane === lane && e.y < SAFE_Y) free = false; }); return free; }
  pickFreeLane(SAFE_Y = 160) {
    for (let tries = 0; tries < this.columns * 2; tries++) { const l = Math.floor(Math.random() * this.columns); if (this.isLaneFree(l, SAFE_Y)) return l; }
    return null;
  }

  countType(type) { let n = 0; this.active.forEach(e => (n += e.type === type ? 1 : 0)); return n; }

  startMainLoop() {
    const loop = (now) => {
      if (!this.isPlaying) return;
      this.fx.update(); this.fx.draw();

      const isFrozen = now < this.freezeUntil;
      const timeFactor = isFrozen ? 0.3 : 1.0; 
      const speedMult = Math.min(1.3, 1 + (this.multiplier - 1) * 0.035);

      const dynamicRocketDelay = (ROCKET_SPAWN_MS / speedMult) / timeFactor;
      const dynamicPlanetDelay = (PLANET_SPAWN_MS / speedMult) / timeFactor;

      const dtSec = Math.max(0, Math.min(48, now - this.lastRAF)) / 1000;
      this.lastRAF = now;

      this.updateAtmosphere();

      const entities = Array.from(this.active.values());
      for (const e of entities) {
        e.y += e.vy * dtSec * timeFactor;
        if (!e.node?.parentNode || e.solved) continue;
        if (e.y >= this.gameSize.h + 140) { this.removeEntity(e.id); continue; }
        e.node.style.transform = `translate3d(0, ${e.y}px, 0) scale(${e.scale})`;
      }

      if (this.countType("rocket") < this.maxRockets && now - this.lastRocketSpawnAt >= dynamicRocketDelay) { if (this.spawnRocket()) this.lastRocketSpawnAt = now; }
      if (this.countType("planet") + this.countType("bonus") < this.maxPlanets && now - this.lastPlanetSpawnAt >= dynamicPlanetDelay) { if (this.spawnPlanet()) this.lastPlanetSpawnAt = now; }
      
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  spawnRocket() {
    const id = this.idSeq++; const { example, answer } = generateExample();
    const lane = this.pickFreeLane(); if (lane === null) return false;

    const el = document.createElement("div"); el.className = "rocket"; el.id = `rocket-${id}`;
    el.style.left = `${this.laneToX(lane)}px`; el.innerHTML = `<div class="rocket-text">${example}</div>`;
    
    const yStart = -90, yEnd = this.gameSize.h + 140;
    const vy = ((yEnd - yStart) / (ENTITY_LIFETIME_MS / 1000)) * Math.min(1.3, 1 + (this.multiplier - 1) * 0.035);
    
    // ФИКС МОРГАНИЯ (Начальный сдвиг до добавления на экран)
    el.style.transform = `translate3d(0, ${yStart}px, 0) scale(1)`;
    
    el.addEventListener("pointerdown", () => {
      const now = performance.now(); if (now < this.inputLockUntil) return; this.inputLockUntil = now + INPUT_LOCK_MS;
      this.selectRocket(id);
    });
    
    document.getElementById("fullscreenGameArea").appendChild(el);
    this.active.set(id, { id, type:"rocket", node: el, answer, lane, y: yStart, vy, scale: 1, solved:false });
    this.correctAnswers.set(id, answer);
    return true;
  }

  spawnPlanet() {
    const id = this.idSeq++; const lane = this.pickFreeLane(); if (lane === null) return false;
    const isFreezeBonus = Math.random() < 0.05; 
    
    let answer, isBomb = false, contentHtml = '', className = 'planet';

    if (isFreezeBonus) {
      answer = -9999; contentHtml = '<div class="bonus-pulse">❄️</div>'; className = 'planet bonus-ice';
    } else {
      if (Math.random() < 0.3) { answer = randInt(1, 50); isBomb = ![...this.correctAnswers.values()].some(v => equalsNum(v, answer)); }
      else { const pool = [...this.correctAnswers.values()]; answer = pool.length ? pool[Math.floor(Math.random() * pool.length)] : randInt(1, 50); }
      contentHtml = `<div class="planet-text">${isBomb ? "⛔" : (Number.isInteger(answer) ? answer : answer.toFixed(1))}</div>`;
    }

    const el = document.createElement("div"); el.className = className; el.id = `planet-${id}`;
    el.style.left = `${this.laneToX(lane)}px`; el.innerHTML = contentHtml;
    
    const yStart = -90, yEnd = this.gameSize.h + 140;
    const vy = ((yEnd - yStart) / (ENTITY_LIFETIME_MS / 1000)) * Math.min(1.3, 1 + (this.multiplier - 1) * 0.035);
    
    // ФИКС МОРГАНИЯ (Начальный сдвиг до добавления на экран)
    el.style.transform = `translate3d(0, ${yStart}px, 0) scale(1)`;
    
    el.addEventListener("pointerdown", () => {
      const now = performance.now(); if (now < this.inputLockUntil) return; this.inputLockUntil = now + INPUT_LOCK_MS;
      if (isFreezeBonus) this.activateFreeze(id); else this.tryAnswer(id);
    });
    
    document.getElementById("fullscreenGameArea").appendChild(el);
    this.active.set(id, { id, type: isFreezeBonus ? "bonus" : "planet", node: el, answer, isBomb, lane, y: yStart, vy, scale: 1, solved:false });
    return true;
  }

  activateFreeze(id) {
    const node = this.active.get(id)?.node;
    if (node) this.fx.explode(node.offsetLeft + 40, node.offsetTop + 40, '#00f3ff', 30);
    this.fadeAndRemove(id);
    this.freezeUntil = performance.now() + 5000;
    this.updateAtmosphere();
    this.showScorePopup(this.gameSize.w/2, this.gameSize.h/2, "❄️ FROZEN!");
  }

  selectRocket(id) {
    this.active.forEach(e => { if (e.type === "rocket") { e.scale = 1; e.node.classList.remove("selected"); } });
    const r = this.active.get(id); if (r) { r.scale = 1.08; r.node.classList.add("selected"); this.selectedRocket = id; }
  }

  tryAnswer(planetId) {
    if (!this.selectedRocket) return;
    const p = this.active.get(planetId); const r = this.active.get(this.selectedRocket);
    if (!p || !r) return;

    if (p.isBomb) { this.applyBomb(planetId); return; }

    if (equalsNum(p.answer, r.answer)) {
      const rX = r.node.offsetLeft + r.node.offsetWidth / 2; const rY = r.y + r.node.offsetHeight / 2;
      const pX = p.node.offsetLeft + p.node.offsetWidth / 2; const pY = p.y + p.node.offsetHeight / 2;
      this.fx.shoot(rX, rY, pX, pY, '#ff8c00'); this.fx.explode(pX, pY, '#ff3333', 20); this.fx.explode(rX, rY, '#ffcc00', 10);
      this.applyCorrect(planetId);
    } else {
      this.applyWrong(planetId);
    }
  }

  applyCorrect(planetId) {
    const r = this.active.get(this.selectedRocket); const p = this.active.get(planetId);
    this.streak++; this.multiplier = Math.min(10, Math.floor(this.streak / 2) + 1);
    const pts = 1 * this.multiplier; this.score += pts;
    
    this.updateAtmosphere(); r.node.classList.add("correct"); p.node.classList.add("correct");
    this.showScorePopup(p.node.offsetLeft + 40, p.y + 40, `+${pts}`);
    this.updateUI(); this.fadeAndRemove(this.selectedRocket); this.fadeAndRemove(planetId); this.selectedRocket = null;
  }

  applyWrong(planetId) {
    const r = this.active.get(this.selectedRocket); const p = this.active.get(planetId);
    this.streak = 0; this.multiplier = 1; this.shakeScreen('hard'); this.updateAtmosphere();
    r.node.classList.add("wrong"); p.node.classList.add("wrong"); this.updateUI();
    setTimeout(() => { r.node.classList.remove("wrong", "selected"); p.node.classList.remove("wrong"); this.selectedRocket = null; }, 200);
  }

  applyBomb(planetId) {
    this.streak = 0; this.multiplier = 1; this.score = Math.max(0, this.score - 5);
    this.shakeScreen('hard'); this.updateAtmosphere(); this.updateUI();
    this.fadeAndRemove(planetId); if (this.selectedRocket) { const r = this.active.get(this.selectedRocket); r.node.classList.remove("selected"); } this.selectedRocket = null;
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