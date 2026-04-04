// server.js — Digit API (Сезонная версия: Энергия ⚡, Билеты 🎟️, Динамический Конфиг)
'use strict';

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { Pool } = require('pg');
const { createClient } = require('redis');

/* =========================
   БАЛАНС ИГРЫ (Server-Driven UI)
========================= */
const SESSION_TTL = 300;     // 5 минут на отправку результата игры
const GAME_CONFIG = {
  duration_sec: 30,          // Длительность одного матча (секунды)
  ticket_cost: 5000,         // Очков до 1 билета
  level_step: 500,           // Очков для повышения уровня
  
  // 👇 НОВЫЕ ПАРАМЕТРЫ (Сезон и Баланс) 👇
  season_end_date: '2026-06-01T18:00:00Z', // Дата конца сезона (UTC)
  toxic_multiplier: 2,       // Множитель очков при зеленой комете
  max_streak_multiplier: 10, // Максимальный множитель за комбо
  freeze_durations: {        // Длительность комет в миллисекундах
    ice: 5000,
    toxic: 3500,
    solar: 8000
  }
};

const app = express();
app.set('etag', false);

/* =========================
   ENV & КОНФИГУРАЦИЯ
========================= */
const BOT_TOKEN     = process.env.BOT_TOKEN;                 
const DATABASE_URL  = process.env.DATABASE_URL;              
const REDIS_URL     = process.env.REDIS_URL;                 

const PG_SSL_MODE   = (process.env.PG_SSL || 'require').toLowerCase(); 
const DEBUG         = !!Number(process.env.DEBUG || '0');
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || '';

if (!DATABASE_URL) { console.error('❌ DATABASE_URL is not set'); process.exit(1); }
if (!BOT_TOKEN)    { console.error('❌ BOT_TOKEN is not set');    process.exit(1); }
if (!REDIS_URL)    { console.error('❌ REDIS_URL is not set');    process.exit(1); }

// --- ГЕНЕРАТОР ПРИМЕРОВ ДЛЯ АНТИЧИТА ---
function randInt(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
function round1(x) { return Math.round(x * 10) / 10; }

function generateExample() {
  const op = Math.floor(Math.random() * 5);
  if (op === 0) { const a = randInt(1, 15), b = randInt(1, 15); return { q:`${a}+${b}`, a:a+b }; }
  if (op === 1) { const a = randInt(1, 20), b = randInt(1, a); return { q:`${a}-${b}`, a:a-b }; }
  if (op === 2) { const a = randInt(1, 9),  b = randInt(1, 9); return { q:`${a}×${b}`, a:a*b }; }
  if (op === 3) { const a = round1(0.1 + Math.random()*1.9), b = round1(0.1 + Math.random()*1.9); return { q:`${a}+${b}`, a:round1(a+b) }; }
  const a = round1(0.5 + Math.random()*2.5); let b = round1(Math.random()*a);
  if (b < 0.1) b = 0.1; if (b > a) b = a;
  return { q:`${a}-${b}`, a:round1(a-b) };
}

/* =========================
   CORS & JSON
========================= */
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Telegram-Init-Data']
}));

app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  }
  next();
});

app.use(express.json());

/* =========================
   БАЗА ДАННЫХ И КЭШ
========================= */
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: PG_SSL_MODE === 'disable' ? false : { rejectUnauthorized: false }
});

const redis = createClient({ url: REDIS_URL });
redis.on('error', (e) => console.error('Redis error', e));
async function connectRedis() { if (!redis.isOpen) await redis.connect(); }

function getUTCTodayKey() {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

async function ensureSchema() {
  await pool.query(`
    create table if not exists users (
      user_id         text primary key,
      username        text,
      tickets         integer not null default 0,
      score_balance   integer not null default 0,
      total_score     bigint not null default 0,
      energy          integer not null default 3,
      last_energy_day text not null,
      games_played    integer not null default 0,
      created_at      timestamptz not null default now(),
      updated_at      timestamptz not null default now()
    );
    create index if not exists idx_users_leaderboard on users (tickets desc, total_score desc);

    create table if not exists game_sessions (
      session_id      text primary key,
      user_id         text not null references users(user_id),
      started_at      timestamptz not null default now(),
      finished_at     timestamptz,
      duration_ms     integer,
      final_score     integer,
      tickets_earned  integer default 0,
      is_valid        boolean not null default true,
      fraud_flags     jsonb not null default '[]'::jsonb,
      ip_address      text
    );

    create table if not exists score_events (
      id         bigserial primary key,
      ts         timestamptz not null default now(),
      user_id    text not null references users(user_id),
      source     text not null,
      title      text not null,
      score_add  integer not null default 0,
      ticket_add integer not null default 0,
      meta       jsonb not null default '{}'::jsonb
    );
    create index if not exists idx_score_events_user_ts on score_events (user_id, ts desc);

    create table if not exists mission_rewards (
      user_id    text not null references users(user_id),
      mission_id text not null,
      created_at timestamptz not null default now(),
      primary key (user_id, mission_id)
    );
  `);
  console.log('✅ Database schema initialized');
}

async function addScoreEvent(client, { userId, source, title, scoreAdd = 0, ticketAdd = 0, meta = {} }) {
  await client.query(
    `insert into score_events (user_id, source, title, score_add, ticket_add, meta)
     values ($1, $2, $3, $4, $5, $6::jsonb)`,
    [userId, source, title, scoreAdd, ticketAdd, JSON.stringify(meta)]
  );
}

/* =========================
   TELEGRAM АВТОРИЗАЦИЯ
========================= */
const tgSecretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();

function verifyTelegramInitData(initDataRaw) {
  if (!initDataRaw || typeof initDataRaw !== 'string') return { ok: false, reason: 'no_init_data' };
  const params = new URLSearchParams(initDataRaw);
  const hash = params.get('hash');
  if (!hash) return { ok: false, reason: 'no_hash' };

  const data = {};
  for (const [k, v] of params.entries()) if (k !== 'hash') data[k] = v;
  
  const checkString = Object.keys(data).sort().map(k => `${k}=${data[k]}`).join('\n');
  const hmac = crypto.createHmac('sha256', tgSecretKey).update(checkString).digest('hex');
  
  if (crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(hash))) {
    let user = null;
    try { user = JSON.parse(data.user); } catch {}
    return { ok: true, user, raw: data };
  }
  return { ok: false, reason: 'bad_signature' };
}

function requireTelegramSigned(req, res, next) {
  const initData = req.headers['x-telegram-init-data'];
  const result = verifyTelegramInitData(initData);
  if (!result.ok) return res.status(401).json({ error: 'unauthorized', reason: result.reason });
  req.tg = { user: result.user };
  next();
}

/* =========================
   API: ИГРОВОЙ ЦИКЛ
========================= */

// 1. СТАРТ ИГРЫ (Списание энергии)
app.post('/api/session/start', requireTelegramSigned, async (req, res) => {
  const client = await pool.connect();
  try {
    await connectRedis();
    const tgUser = req.tg.user;
    if (!tgUser?.id) return res.status(401).json({ error: 'no_telegram_user' });

    const userId = `tg_${tgUser.id}`;
    const username = tgUser.username || tgUser.first_name || 'Anonymous';
    const today = getUTCTodayKey();

    await client.query('BEGIN');

    let { rows } = await client.query(`SELECT energy, last_energy_day FROM users WHERE user_id = $1 FOR UPDATE`, [userId]);

    let energy = 0;
    let lastEnergyDay = null;

    if (rows.length === 0) {
      await client.query(
        `INSERT INTO users (user_id, username, energy, last_energy_day) VALUES ($1, $2, 3, $3)`,
        [userId, username, today]
      );
      energy = 3; lastEnergyDay = today;
    } else {
      energy = rows[0].energy;
      lastEnergyDay = rows[0].last_energy_day;
      await client.query(`UPDATE users SET username = $2 WHERE user_id = $1`, [userId, username]);
    }

    if (lastEnergyDay !== today) {
      energy = Math.max(energy, 3);
      await client.query(`UPDATE users SET energy = $1, last_energy_day = $2 WHERE user_id = $3`, [energy, today, userId]);
    }

    if (energy <= 0) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'not_enough_energy' });
    }

    const newEnergy = energy - 1;
    await client.query(`UPDATE users SET energy = $1 WHERE user_id = $2`, [newEnergy, userId]);
    await client.query('COMMIT');

    const session_id = crypto.randomUUID();
    const payload = { user_id: userId, username, start_ms: Date.now() };
    await redis.set(`sess:${session_id}`, JSON.stringify(payload), { EX: SESSION_TTL });

    const equations = [];
    for(let i = 0; i < 150; i++) {
      equations.push(generateExample());
    }

    res.json({ 
      session_id, 
      energy_left: newEnergy,
      equations: equations,
      duration_sec: GAME_CONFIG.duration_sec
    });

  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'internal_error' });
  } finally {
    client.release();
  }
});

// 2. ФИНИШ ИГРЫ (Начисление билетов)
app.post('/api/session/finish', requireTelegramSigned, async (req, res) => {
  const client = await pool.connect();
  try {
    const { session_id, score } = req.body || {};
    const finalScore = Math.max(0, parseInt(score, 10) || 0);
    if (!session_id) return res.status(400).json({ error: 'session_id_required' });

    const redisKey = `sess:${session_id}`;
    const sessionJson = await redis.get(redisKey);
    if (!sessionJson) return res.status(410).json({ error: 'session_expired' });
    
    const sessionData = JSON.parse(sessionJson);
    const userId = sessionData.user_id;
    const duration_ms = Date.now() - sessionData.start_ms;

    let isValid = true;
    const fraudFlags = [];
    
    if (duration_ms < 2000) { 
      isValid = false; 
      fraudFlags.push('too_short'); 
    }

    const durationSeconds = duration_ms / 1000;
    const dynamicScoreCap = durationSeconds * 100;
    const HARD_CAP = (GAME_CONFIG.duration_sec * 100) + 500; 

    if (finalScore > dynamicScoreCap || finalScore > HARD_CAP) { 
      isValid = false; 
      fraudFlags.push('score_too_high'); 
    }

    await client.query('BEGIN');

    const { rows: userRows } = await client.query(
      `SELECT tickets, score_balance FROM users WHERE user_id = $1 FOR UPDATE`, [userId]
    );

    if (userRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'user_not_found' });
    }

    let newTickets = userRows[0].tickets;
    let newBalance = userRows[0].score_balance;
    let ticketsEarnedNow = 0;

    if (isValid) {
      const totalPointsNow = newBalance + finalScore;
      ticketsEarnedNow = Math.floor(totalPointsNow / GAME_CONFIG.ticket_cost);
      newBalance = totalPointsNow % GAME_CONFIG.ticket_cost;
      newTickets += ticketsEarnedNow;

      await client.query(
        `UPDATE users SET tickets = $1, score_balance = $2, total_score = total_score + $3, games_played = games_played + 1, updated_at = now() WHERE user_id = $4`,
        [newTickets, newBalance, finalScore, userId]
      );

      await addScoreEvent(client, {
        userId, source: 'game', title: `Match played`, scoreAdd: finalScore, ticketAdd: ticketsEarnedNow, meta: { session_id }
      });
    }

    const clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || null;
    
    await client.query(
      `INSERT INTO game_sessions (session_id, user_id, started_at, finished_at, duration_ms, final_score, tickets_earned, is_valid, fraud_flags, ip_address)
       VALUES ($1, $2, $3, now(), $4, $5, $6, $7, $8::jsonb, $9)`,
      [session_id, userId, new Date(sessionData.start_ms), duration_ms, finalScore, ticketsEarnedNow, isValid, JSON.stringify(fraudFlags), clientIp]
    );

    await client.query('COMMIT');
    await redis.del(redisKey);

    res.json({ success: true, score: finalScore, tickets_earned: ticketsEarnedNow, total_tickets: newTickets, score_balance: newBalance, is_valid: isValid });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('session/finish error:', e);
    res.status(500).json({ error: 'internal_error', reason: e.message || String(e) });
  } finally {
    client.release();
  }
});

/* =========================
   API: ЛИДЕРБОРД И ПРОФИЛЬ
========================= */

app.get('/api/leaderboard', async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit || '100', 10)));
    const offset = Math.max(0, parseInt(req.query.offset || '0', 10));

    const { rows } = await pool.query(
      `SELECT user_id, username, tickets, total_score 
       FROM users ORDER BY tickets DESC, total_score DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const items = rows.map((r, i) => ({
      userId: r.user_id,
      username: r.username || 'Anonymous',
      tickets: r.tickets,
      score: Number(r.total_score),
      rank: offset + i + 1
    }));

    res.json({ items, hasMore: items.length === limit });
  } catch (e) {
    res.status(500).json({ error: 'internal_error' });
  }
});

// Получить статистику профиля
app.get('/api/user/me/stats', requireTelegramSigned, async (req, res) => {
  try {
    const userId = `tg_${req.tg.user.id}`;
    
    const { rows } = await pool.query(
      `SELECT tickets, score_balance, total_score, games_played, energy FROM users WHERE user_id = $1`, [userId]
    );

    if (!rows.length) return res.json({ exists: false });
    const u = rows[0];
    
    const { rows: rankRows } = await pool.query(
      `SELECT 1 + count(*) as pos FROM users WHERE tickets > $1 OR (tickets = $1 AND total_score > $2)`,
      [u.tickets, u.total_score]
    );

    const { rows: hsRows } = await pool.query(
      `SELECT MAX(final_score) as max_score FROM game_sessions WHERE user_id = $1 AND is_valid = true`,
      [userId]
    );
    const highScore = hsRows[0]?.max_score || 0;

    const currentLevel = Math.floor(Number(u.total_score) / GAME_CONFIG.level_step) + 1;
      
    res.json({
      exists: true,
      rank: Number(rankRows[0]?.pos || 0),
      tickets: u.tickets,
      score_balance: u.score_balance,
      total_score: Number(u.total_score),
      games_played: u.games_played,
      energy: u.energy,
      level: currentLevel,
      high_score: Number(highScore),
      // 👇 ТЕПЕРЬ СЕРВЕР ОТДАЕТ ВСЕ НАСТРОЙКИ БАЛАНСА КЛИЕНТУ 👇
      config: {
        ticket_cost: GAME_CONFIG.ticket_cost,
        level_step: GAME_CONFIG.level_step,
        toxic_multiplier: GAME_CONFIG.toxic_multiplier,
        max_streak_multiplier: GAME_CONFIG.max_streak_multiplier,
        freeze_durations: GAME_CONFIG.freeze_durations,
        season_end_date: GAME_CONFIG.season_end_date
      }
    });
  } catch (e) {
    console.error("Stats API Error:", e);
    res.status(500).json({ error: 'internal_error' });
  }
});

app.get('/api/user/me/history', requireTelegramSigned, async (req, res) => {
  try {
    const userId = `tg_${req.tg.user.id}`;
    const offset = parseInt(req.query.offset) || 0;
    const limit = 10;

    // Тянем всё из score_events (Матчи + Миссии)
    const { rows } = await pool.query(
      `SELECT title, score_add as final_score, ticket_add as tickets_earned, ts as started_at 
       FROM score_events 
       WHERE user_id = $1 
       ORDER BY ts DESC 
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    res.json({ success: true, matches: rows });
  } catch (e) {
    console.error("History API Error:", e);
    res.status(500).json({ error: 'internal_error' });
  }
});

app.get('/api/user/me/events', requireTelegramSigned, async (req, res) => {
  try {
    const userId = `tg_${req.tg.user.id}`;
    const { rows } = await pool.query(
      `SELECT ts, title, score_add, ticket_add FROM score_events WHERE user_id = $1 ORDER BY ts DESC LIMIT 50`, [userId]
    );
    res.json({ items: rows });
  } catch (e) {
    res.status(500).json({ error: 'internal_error' });
  }
});

/* =========================
   API: МИССИИ И ЗАДАНИЯ (PTS Награды)
========================= */
// Функция для проверки подписки через Telegram API
async function checkChannelSub(tgId, channelUsername) {
  try {
    const url = `https://api.telegram.org/bot${process.env.BOT_TOKEN}/getChatMember?chat_id=${channelUsername}&user_id=${tgId}`;
    const resp = await fetch(url);
    const data = await resp.json();
    if (data.ok) {
      const status = data.result.status;
      return ['member', 'administrator', 'creator'].includes(status);
    }
    return false;
  } catch (e) {
    console.error("TG Check Error:", e);
    return false;
  }
}
// Конфиг наших миссий
const MISSIONS_CONFIG = [
  // Дейлики (Ежедневные)
  { id: 'daily_play_3', type: 'daily', title: 'Play 3 Games', icon: '🎮', reward_pts: 100, target: 3 },
  { id: 'daily_score_300', type: 'daily', title: 'Earn 300 PTS Today', icon: '⭐', reward_pts: 100, target: 300 },
  // Единоразовые (Ачивки)
  { id: 'onetime_sub_main', type: 'one_time', title: 'Join Digit Channel', icon: '📢', reward_pts: 200, target: 1, actionUrl: 'https://t.me/digit_community', tgChannel: '@digit_community' },
  { id: 'onetime_sub_dev', type: 'one_time', title: 'Join Creator Channel', icon: '👨‍💻', reward_pts: 200, target: 1, actionUrl: 'https://t.me/stayrational', tgChannel: '@stayrational' },
  { id: 'onetime_veteran', type: 'one_time', title: 'Play 50 Games Total', icon: '🏆', reward_pts: 100, target: 50 },
];

// Генерируем миссии за Уровни (от 10 до 100)
for (let i = 10; i <= 100; i += 10) {
  MISSIONS_CONFIG.push({
    id: `level_${i}`,
    type: 'one_time',
    title: `Reach Level ${i}`,
    icon: i === 100 ? '👑' : '🆙',
    reward_pts: i === 100 ? 500 : 100,
    target: i
  });
}

// 1. Получить список миссий и прогресс
app.get('/api/user/me/missions', requireTelegramSigned, async (req, res) => {
  try {
    const userId = `tg_${req.tg.user.id}`;
    const today = getUTCTodayKey();

    // Достаем уже забранные награды
    const { rows: claims } = await pool.query(`SELECT mission_id FROM mission_rewards WHERE user_id = $1`, [userId]);
    const claimedSet = new Set(claims.map(r => r.mission_id));

    // Достаем статистику игрока
    const { rows: stats } = await pool.query(`SELECT games_played, total_score FROM users WHERE user_id = $1`, [userId]);
    const userStats = stats[0] || { games_played: 0, total_score: 0 };
    const currentLevel = Math.floor(Number(userStats.total_score) / GAME_CONFIG.level_step) + 1;

    // Считаем статистику именно за СЕГОДНЯ
    const { rows: todayStats } = await pool.query(
      `SELECT count(*) as games, sum(final_score) as pts FROM game_sessions WHERE user_id = $1 AND started_at >= current_date AND is_valid = true`, [userId]
    );
    const gamesToday = parseInt(todayStats[0].games, 10) || 0;
    const ptsToday = parseInt(todayStats[0].pts, 10) || 0;

    const result = MISSIONS_CONFIG.map(m => {
      // Для дейликов склеиваем ID с датой
      const dbId = m.type === 'daily' ? `${m.id}_${today}` : m.id;
      const isClaimed = claimedSet.has(dbId);

      let progress = 0;
      if (m.id === 'daily_play_3') progress = gamesToday;
      if (m.id === 'daily_score_300') progress = ptsToday;
      if (m.id === 'onetime_veteran') progress = userStats.games_played;
      if (m.id.startsWith('level_')) progress = currentLevel;
      if (m.actionUrl) progress = 1; // Соц. таски всегда можно выполнить

      let status = 'available';
      if (isClaimed) status = 'claimed';
      else if (progress >= m.target) status = 'claimable';

      return { ...m, progress, status, dbId };
    });

    res.json({ missions: result });
  } catch (e) {
    console.error("Missions API Error:", e);
    res.status(500).json({ error: 'internal_error' });
  }
});

// 2. Забрать награду за миссию
app.post('/api/user/me/missions/claim', requireTelegramSigned, async (req, res) => {
  const client = await pool.connect();
  try {
    const userId = `tg_${req.tg.user.id}`;
    const { dbId } = req.body;
    const today = getUTCTodayKey();

    const baseId = dbId.replace(`_${today}`, '');
    const missionConfig = MISSIONS_CONFIG.find(m => m.id === baseId || m.id === dbId);

    if (!missionConfig) return res.status(400).json({ error: 'mission_not_found' });
    
    // ПРОВЕРКА ПОДПИСКИ
    if (missionConfig.tgChannel) {
      const rawTgId = req.tg.user.id; // Достаем чистый ID цифрами
      const isSubbed = await checkChannelSub(rawTgId, missionConfig.tgChannel);
      if (!isSubbed) {
        return res.status(403).json({ error: 'not_subscribed', actionUrl: missionConfig.actionUrl });
      }
    }
    
    await client.query('BEGIN');

    // Пытаемся записать награду в БД
    try {
      await client.query(`INSERT INTO mission_rewards (user_id, mission_id) VALUES ($1, $2)`, [userId, dbId]);
    } catch (err) {
      if (err.code === '23505') { 
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'already_claimed' });
      }
      throw err;
    }

    // Достаем текущий баланс игрока
    const { rows: userRows } = await client.query(
      `SELECT tickets, score_balance FROM users WHERE user_id = $1 FOR UPDATE`, [userId]
    );

    let tickets = userRows[0].tickets;
    let balance = userRows[0].score_balance;

    // СЧИТАЕМ НОВЫЕ ОЧКИ И БИЛЕТЫ (Та же логика, что и в конце матча!)
    const totalPointsNow = balance + missionConfig.reward_pts;
    const ticketsEarnedNow = Math.floor(totalPointsNow / GAME_CONFIG.ticket_cost);
    const newBalance = totalPointsNow % GAME_CONFIG.ticket_cost;
    const newTickets = tickets + ticketsEarnedNow;

    // Обновляем БД
    await client.query(
      `UPDATE users SET tickets = $1, score_balance = $2, total_score = total_score + $3, updated_at = now() WHERE user_id = $4`,
      [newTickets, newBalance, missionConfig.reward_pts, userId]
    );

    // Записываем в логи
    await addScoreEvent(client, {
      userId, source: 'mission', title: `Mission: ${missionConfig.title}`, scoreAdd: missionConfig.reward_pts, ticketAdd: ticketsEarnedNow
    });

    await client.query('COMMIT');
    res.json({ success: true, reward_pts: missionConfig.reward_pts, tickets_earned: ticketsEarnedNow, total_tickets: newTickets, score_balance: newBalance });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'internal_error' });
  } finally {
    client.release();
  }
});


/* =========================
   СТАРТ СЕРВЕРА
========================= */
app.use('*', (_req, res) => res.status(404).json({ error: 'Not found' }));

ensureSchema()
  .then(() => connectRedis())
  .then(() => {
    const PORT = process.env.PORT || 8080;
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Digit API is running on port ${PORT} | Timezone: UTC`);
    });
  })
  .catch(err => {
    console.error('Server failed to start:', err);
    process.exit(1);
  });
