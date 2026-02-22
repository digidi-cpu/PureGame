// game.js — Clean Sandbox with JuiceFX, Freeze, and Flicker Fix

const ENTITY_LIFETIME_MS = 8800;
const ROCKET_SPAWN_MS    = 1100;
const PLANET_SPAWN_MS    = 950;
const INPUT_LOCK_MS      = 140;

const ROCKET_SVGS = [
  '<svg class="entity-svg" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><g fill="var(--cosmic-secondary)"><rect x="51.1" y="338.883" width="409.81" height="15.507"/><path d="M153.676,244.052h204.648V118.214H153.676V244.052z M169.183,133.72h173.634v94.825H169.183V133.72z"/><rect x="193.071" y="154.222" transform="matrix(0.7071 0.7071 -0.7071 0.7071 175.753 -93.5696)" width="15.507" height="22.29"/><rect x="187.773" y="173.375" transform="matrix(0.7071 -0.7071 0.7071 0.7071 -60.0217 217.3505)" width="89.162" height="15.507"/><rect x="256.129" y="185.749" transform="matrix(-0.7071 -0.7071 0.7071 -0.7071 311.2517 522.7122)" width="15.507" height="22.29"/><rect x="280.995" y="165.496" transform="matrix(0.7071 -0.7071 0.7071 0.7071 -33.6758 265.1971)" width="44.576" height="15.506"/><rect x="303.41" y="193.636" transform="matrix(-0.7071 -0.7071 0.7071 -0.7071 386.3853 569.6082)" width="15.507" height="22.29"/><rect x="216.597" y="267.945" width="15.762" height="15.507"/><rect x="248.117" y="267.945" width="15.762" height="15.507"/><rect x="279.647" y="267.945" width="15.762" height="15.507"/><path d="M508.113,496.041l-17.955,0.173l-34.471-110.306h36.704v-78.554H468.67L411.895,63.047h-23.756c-14.756-18.184-33.284-33.337-54.025-44.082C310.166,6.558,283.158,0,256.01,0c-27.154,0-54.167,6.56-78.118,18.972c-20.734,10.745-39.258,25.894-54.012,44.075h-23.775L50.969,274.479V165.37H35.463v141.983H19.61v78.554h36.704L21.843,496.213l-17.956-0.173l-0.15,15.506L51.022,512l0.15-15.506l-13.132-0.126l34.52-110.461h51.715c15.157,19.676,34.671,36.029,56.67,47.429c23.951,12.412,50.964,18.972,78.118,18.972c27.149,0,54.156-6.558,78.104-18.965c22.004-11.399,41.523-27.757,56.683-47.437h45.591l34.52,110.461l-13.132,0.126l0.15,15.506l47.285-0.454L508.113,496.041z M412.399,133.72l22.036,94.825h-36.706V133.72H412.399z M185.026,32.74c22.067-11.435,45.949-17.233,70.984-17.233c25.029,0,48.908,5.795,70.971,17.227c15.006,7.774,28.735,18.093,40.483,30.313H144.555C156.3,50.83,170.024,40.513,185.026,32.74z M99.601,133.72h14.67v94.825H77.564L99.601,133.72z M73.961,244.052h55.818V118.214h-26.573l9.217-39.66h18.654l0.255,0.187c0.045-0.063,0.095-0.124,0.142-0.187h249.075c0.04,0.055,0.083,0.107,0.123,0.163l0.222-0.163h18.686l9.217,39.66h-26.573v125.839h55.818l14.711,63.301H59.25L73.961,244.052z M330.033,419.575c-22.063,11.43-45.941,17.227-70.971,17.227c-25.035,0-48.917-5.797-70.984-17.233c-16.355-8.476-31.194-19.972-43.601-33.662h229.169C361.237,399.602,346.393,411.099,330.033,419.575z M35.116,370.4v-47.54h441.768v47.54H35.116z"/><polygon points="263.754,496.193 263.754,456.963 248.247,456.963 248.247,496.341 232.283,496.494 232.432,512 279.717,511.546 279.569,496.041"/><rect x="35.459" y="141.731" width="15.507" height="15.762"/></g></svg>',
  '<svg class="entity-svg" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><g fill="var(--cosmic-secondary)"><rect x="172.953" y="112.661" width="15.099" height="14.885"/><rect x="203.151" y="112.661" width="15.099" height="14.885"/><rect x="233.349" y="112.661" width="15.099" height="14.885"/><rect x="263.547" y="112.661" width="15.099" height="14.885"/><rect x="293.745" y="112.661" width="15.099" height="14.885"/><rect x="323.943" y="112.661" width="15.099" height="14.885"/><path d="M492.563,173.501c-0.724-0.261-50.676-18.001-123.425-29.206v-16.746h7.658v-14.885h-7.658v-22.65h-30.55c-3.778-42.256-39.365-75.497-82.589-75.497s-78.81,33.241-82.589,75.497h-30.55v22.649h-7.658v14.885h7.658v16.746C70.111,155.499,20.16,173.239,19.435,173.5L0,180.503l19.436,7.001c1.061,0.382,107.499,38.191,236.564,38.191s235.503-37.809,236.564-38.191L512,180.503L492.563,173.501z M256,29.401c35.01,0,63.919,26.577,67.639,60.612H188.36C192.08,55.978,220.99,29.401,256,29.401z M157.746,104.898h196.508v37.244c-29.997-4.053-63.292-6.83-98.254-6.83c-34.962,0-68.257,2.777-98.254,6.83V104.898z M256,210.809c-91.821,0-171.905-19.505-209.219-30.31c37.29-10.807,117.312-30.304,209.219-30.304c91.821,0,171.905,19.506,209.219,30.31C427.929,191.312,347.905,210.809,256,210.809z"/><rect x="210.698" y="67.359" width="90.594" height="14.885"/><path d="M218.251,157.961c-12.43,0-22.542,10.113-22.542,22.542c0,12.43,10.113,22.542,22.542,22.542c12.429,0,22.542-10.112,22.542-22.542C240.792,168.074,230.681,157.961,218.251,157.961z M218.251,188.16c-4.222,0-7.656-3.435-7.656-7.658c0-4.222,3.435-7.656,7.656-7.656s7.658,3.434,7.658,7.656C225.908,184.725,222.473,188.16,218.251,188.16z"/><path d="M293.748,203.044c12.43,0,22.542-10.112,22.542-22.542c0-12.429-10.113-22.542-22.542-22.542c-12.429,0-22.542,10.113-22.542,22.542C271.207,192.933,281.318,203.044,293.748,203.044z M293.748,172.846c4.222,0,7.656,3.434,7.656,7.656c0,4.222-3.435,7.658-7.656,7.658s-7.658-3.435-7.658-7.658C286.091,176.28,289.526,172.846,293.748,172.846z"/><rect x="215.617" y="323.669" transform="matrix(-0.9839 -0.179 0.179 -0.9839 381.8367 712.4898)" width="14.885" height="30.702"/><rect x="270.848" y="316.492" transform="matrix(-0.1789 -0.9839 0.9839 -0.1789 18.6874 663.4634)" width="30.697" height="14.884"/><path d="M331.496,248.342v-14.885H180.502v14.885h18.641L85.897,497.484h340.204L312.854,248.342H331.496z M402.986,482.599H204.519l17.622-96.922l-14.644-2.663l-18.106,99.584h-80.377l106.48-234.257h49.394l7.125,39.188l14.644-2.664l-6.641-36.524h16.489L402.986,482.599z"/></g></svg>',
  '<svg class="entity-svg" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><g fill="var(--cosmic-secondary)"><polygon points="378.303,384.064 362.549,384.064 362.549,392.194 138.185,392.194 138.185,384.064 122.43,384.064 122.43,407.949 378.303,407.949"/><rect x="274.378" y="264.127" width="16.007" height="15.754"/><rect x="154.457" y="132.628" transform="matrix(-0.7071 -0.7071 0.7071 -0.7071 175.3342 360.5207)" width="15.754" height="22.638"/><rect x="186.477" y="132.626" transform="matrix(-0.7071 -0.7071 0.7071 -0.7071 229.9997 383.1585)" width="15.754" height="22.638"/><rect x="218.491" y="132.616" transform="matrix(-0.7071 -0.7071 0.7071 -0.7071 284.657 405.7784)" width="15.754" height="22.638"/><rect x="250.512" y="132.624" transform="matrix(-0.7071 -0.7071 0.7071 -0.7071 339.3143 428.4342)" width="15.754" height="22.638"/><rect x="210.352" y="40.016" width="16.008" height="15.754"/><rect x="242.365" y="40.016" width="16.008" height="15.754"/><rect x="274.378" y="40.016" width="16.007" height="15.754"/><path d="M138.438,432.215H58.399v24.671c-22.675,3.769-40.02,23.511-40.02,47.238v7.877h95.794v-7.877c0-23.727-17.346-43.468-40.02-47.238v-8.917h80.039V416.08h-15.754V432.215z M97.442,496.246H35.11c3.522-13.929,16.159-24.266,31.166-24.266C81.284,471.98,93.921,482.318,97.442,496.246z"/><path d="M258.244,456.885v-40.806H242.49v40.806c-22.674,3.769-40.02,23.511-40.02,47.238V512h95.794v-7.877C298.264,480.397,280.918,460.654,258.244,456.885z M219.201,496.246c3.522-13.929,16.159-24.266,31.166-24.266c15.008,0,27.645,10.337,31.166,24.266H219.201z"/><path d="M442.335,456.885v-24.671h-80.04v-16.135h-15.754v31.889h80.039v8.917c-22.675,3.769-40.02,23.511-40.02,47.238V512h95.794v-7.877C482.356,480.397,465.009,460.654,442.335,456.885z M403.292,496.246c3.522-13.929,16.159-24.266,31.166-24.266s27.645,10.337,31.166,24.266H403.292z"/><path d="M459.664,73.851l12.38-12.38l-11.14-11.139l-12.38,12.38l-33.957-33.958l-5.571,5.57c-10.559,10.559-16.373,24.596-16.373,39.528c0,13.801,4.976,26.833,14.067,37.065v41.159h-28.385v-24.139C378.303,57.392,320.912,0,250.367,0S122.43,57.392,122.43,127.937v247.997h255.873V167.829h44.14v-44.51c7.943,4.201,16.839,6.433,26.081,6.433c14.932,0,28.97-5.815,39.529-16.373l5.57-5.57L459.664,73.851z M138.185,127.937c0-2.735,0.104-5.445,0.296-8.13h152.033v48.278H138.185V127.937z M362.55,360.178h-0.001H138.185v-56.281h112.968c3.768,22.675,23.511,40.02,47.239,40.02c23.727,0,43.468-17.346,47.239-40.02h16.919V360.178z M266.248,296.02v-48.024c0-17.724,14.419-32.143,32.143-32.143c17.724,0,32.143,14.419,32.143,32.143v48.024c0,17.724-14.419,32.143-32.143,32.143h-0.001C280.667,328.162,266.248,313.744,266.248,296.02z M362.55,288.143h-0.001h-16.261v-40.146c0-26.411-21.487-47.897-47.897-47.897c-26.411,0-47.897,21.487-47.897,47.897v40.146H138.185V183.838h168.083v-79.786H140.753c3.941-18.101,12.261-34.583,23.795-48.278h29.79V40.019h-13.573c19.141-15.184,43.329-24.265,69.602-24.265c26.273,0,50.461,9.081,69.601,24.266h-13.573v15.754h29.79c16.441,19.521,26.364,44.704,26.364,72.162V288.143z M448.525,113.999c-10.723,0-20.806-4.176-28.387-11.759c-7.583-7.583-11.759-17.665-11.759-28.388c0-8.048,2.352-15.734,6.731-22.275l55.691,55.69C464.259,111.646,456.573,113.999,448.525,113.999z"/><rect x="154.319" y="264.127" width="16.008" height="15.754"/><rect x="186.332" y="264.127" width="16.008" height="15.754"/><rect x="218.355" y="264.127" width="16.008" height="15.754"/><path d="M154.446,351.921h79.786v-39.766h-79.786V351.921z M170.201,327.909h48.278v8.257h-48.278V327.909z"/></g></svg>',
  '<svg class="entity-svg" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><g fill="var(--cosmic-secondary)"><rect x="264" y="280" width="16" height="16"/><rect x="264" y="312" width="16" height="16"/><rect x="264" y="344" width="16" height="16"/><rect x="232" y="180" transform="matrix(0.7071 0.7071 -0.7071 0.7071 206 -113)" width="16" height="23"/><rect x="253" y="208" transform="matrix(-0.7071 0.7071 -0.7071 -0.7071 603 182)" width="23" height="16"/><path d="M320,40c0-19-38-23-56-24V0h-16v16c-18,1-56,5-56,24c0,33,24,59,56,63v17h-48v272h48v17c-32,4-56,31-56,63c0,19,38,23,56,24v16h16v-16c18-1,56-5,56-24c0-33-24-59-56-63v-17h48V120h-48v-17C295,99,320,73,320,40z M264,32c21,1,34,5,39,8c-5,3-18,7-39,8V32z M209,40c5-3,18-7,39-8v16C227,47,214,43,209,40z M216,312h16v32h-16V312z M248,480c-21-1-34-5-39-8c5-3,18-7,39-8V480z M303,472c-5,3-18,7-39,8v-16C285,465,298,469,303,472z M301,454c-17-6-41-6-45-6c-4,0-27,0-45,6c7-18,24-30,45-30C276,424,293,436,301,454z M296,376h-80v-16h32v-64h-32v-40h80V376z M296,240h-80v-72h80V240z M296,136v16h-80v-16H296z M256,88c-20,0-37-12-45-30c17,6,41,6,45,6c4,0,27,0,45-6C293,76,276,88,256,88z"/><path d="M344,104v144h-16v16h16v144h168V104H344z M360,120h136v48H360V120z M360,184h136v144H360V184z M360,392v-48h136v48H360z"/><path d="M168,104H0v304h168V264h16v-16h-16V104z M16,120h136v48H16V120z M16,184h136v144H16V184z M16,392v-48h136v48H16z"/><rect x="36" y="195" transform="matrix(0.7071 0.7071 -0.7071 0.7071 163 31)" width="16" height="34"/><rect x="17" y="228" transform="matrix(0.7071 -0.7071 0.7071 0.7071 -147 117)" width="102" height="16"/><rect x="84" y="206" transform="matrix(-0.7071 -0.7071 0.7071 -0.7071 -32 523)" width="16" height="124"/><rect x="108" y="264" transform="matrix(-0.7071 -0.7071 0.7071 -0.7071 -8 581)" width="16" height="57"/><rect x="380" y="195" transform="matrix(0.7071 0.7071 -0.7071 0.7071 264 -212)" width="16" height="34"/><rect x="361" y="228" transform="matrix(0.7071 -0.7071 0.7071 0.7071 -46 360)" width="102" height="16"/><rect x="374" y="260" transform="matrix(0.7071 -0.7071 0.7071 0.7071 -62 387)" width="124" height="16"/><rect x="452" y="264" transform="matrix(-0.7071 -0.7071 0.7071 -0.7071 579 824)" width="16" height="57"/></g></svg>'
];

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

  laneToX(lane) { return Math.round(10 + lane * this.columnWidth + (this.columnWidth - 90) / 2); }
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

    const randomSvg = ROCKET_SVGS[Math.floor(Math.random() * ROCKET_SVGS.length)];
    const el = document.createElement("div"); el.className = "rocket"; el.id = `rocket-${id}`;
    el.style.left = `${this.laneToX(lane)}px`; el.innerHTML = `${randomSvg}<div class="rocket-text">${example}</div>`;
    
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