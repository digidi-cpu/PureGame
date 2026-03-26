// server.js — Digit API (Сезонная версия: Энергия ⚡ и Билеты 🎟️)
'use strict';

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { Pool } = require('pg');
const { createClient } = require('redis');

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

// Баланс игры
const SESSION_TTL   = 300;     // 5 минут на отправку результата игры
const TICKET_COST   = 5000;    // 5000 очков = 1 🎟️
const MAX_SCORE_CAP = 100000;  // Античит: максимум очков за одну игру (40 сек)

if (!DATABASE_URL) { console.error('❌ DATABASE_URL is not set'); process.exit(1); }
if (!BOT_TOKEN)    { console.error('❌ BOT_TOKEN is not set');    process.exit(1); }
if (!REDIS_URL)    { console.error('❌ REDIS_URL is not set');    process.exit(1); }

/* =========================
   CORS & JSON
========================= */
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Telegram-Init-Data']
}));

// Отключаем кэширование, чтобы статистика всегда была свежей
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

// Строгий UTC-ключ дня (для обновления Энергии)
function getUTCTodayKey() {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Инициализация таблиц
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

    res.json({ session_id, energy_left: newEnergy });
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
    if (duration_ms < 1000) { isValid = false; fraudFlags.push('too_short'); }
    if (finalScore > MAX_SCORE_CAP) { isValid = false; fraudFlags.push('score_too_high'); }

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
      ticketsEarnedNow = Math.floor(totalPointsNow / TICKET_COST);
      newBalance = totalPointsNow % TICKET_COST;
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
       VALUES ($1, $2, to_timestamp($3 / 1000.0), now(), $4, $5, $6, $7, $8::jsonb, $9)`,
      [session_id, userId, sessionData.start_ms, duration_ms, finalScore, ticketsEarnedNow, isValid, JSON.stringify(fraudFlags), clientIp]
    );

    await client.query('COMMIT');
    await redis.del(redisKey);

    res.json({ success: true, score: finalScore, tickets_earned: ticketsEarnedNow, total_tickets: newTickets, score_balance: newBalance, is_valid: isValid });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'internal_error' });
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

app.get('/api/user/me/stats', requireTelegramSigned, async (req, res) => {
  try {
    const userId = `tg_${req.tg.user.id}`;
    
    const { rows } = await pool.query(
      `SELECT tickets, score_balance, total_score, games_played, energy FROM users WHERE user_id = $1`, [userId]
    );

    if (!rows.length) return res.json({ exists: false });

    const u = rows[0];
    
    // Вычисляем ранг (позицию) игрока
    const { rows: rankRows } = await pool.query(
      `SELECT 1 + count(*) as pos FROM users WHERE tickets > $1 OR (tickets = $1 AND total_score > $2)`,
      [u.tickets, u.total_score]
    );

    res.json({
      exists: true,
      rank: Number(rankRows[0]?.pos || 0),
      tickets: u.tickets,
      score_balance: u.score_balance,
      total_score: Number(u.total_score),
      games_played: u.games_played,
      energy: u.energy
    });
  } catch (e) {
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
