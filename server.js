'use strict';

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { Pool } = require('pg');
const { createClient } = require('redis');

const app = express();
app.set('etag', false);

/* =========================
   ENV & КОНФИГ
========================= */
const BOT_TOKEN     = process.env.BOT_TOKEN;                 
const DATABASE_URL  = process.env.DATABASE_URL;              
const REDIS_URL     = process.env.REDIS_URL;                 

const TZ            = process.env.DIGIT_TZ || 'Europe/Moscow';
const PG_SSL_MODE   = (process.env.PG_SSL || 'require').toLowerCase(); 
const DEBUG         = !!Number(process.env.DEBUG || '0');

const SESSION_TTL   = 300;  // 5 минут на одну игру
const TICKET_COST   = 5000; // Цена одного билета в очках

if (!DATABASE_URL) { console.error('❌ DATABASE_URL is not set'); process.exit(1); }
if (!BOT_TOKEN)    { console.error('❌ BOT_TOKEN is not set');    process.exit(1); }
if (!REDIS_URL)    { console.error('❌ REDIS_URL is not set');    process.exit(1); }

/* =========================
   CORS / JSON
========================= */
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Telegram-Init-Data']
}));

app.use(express.json());

/* =========================
   ПОДКЛЮЧЕНИЯ: Postgres & Redis
========================= */
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: PG_SSL_MODE === 'disable' ? false : { rejectUnauthorized: false }
});

const redis = createClient({ url: REDIS_URL });
redis.on('error', (e) => console.error('Redis error', e));
async function connectRedis() { if (!redis.isOpen) await redis.connect(); }

// Получение текущей даты (для обновления энергии)
function todayKey(tz = TZ) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
}

/* =========================
   НОВАЯ СХЕМА БАЗЫ ДАННЫХ
========================= */
async function ensureSchema() {
  await pool.query(`
    -- 1. ГЛАВНАЯ ТАБЛИЦА ИГРОКОВ (Сезонная)
    create table if not exists users (
      user_id         text primary key,
      username        text,
      tickets         integer not null default 0, -- Главная валюта 🎟️
      score_balance   integer not null default 0, -- Очки до следующего билета (0 - 4999)
      total_score     bigint not null default 0,  -- Абсолютно все заработанные очки за сезон
      energy          integer not null default 3, -- Текущие молнии ⚡
      last_energy_day date not null default current_date, -- Когда последний раз выдавали 3 FREE
      games_played    integer not null default 0,
      created_at      timestamptz not null default now(),
      updated_at      timestamptz not null default now()
    );
    -- Индекс для быстрого построения Top-100 по билетам
    create index if not exists idx_users_tickets_desc on users (tickets desc, total_score desc);

    -- 2. ИГРОВЫЕ СЕССИИ (Античит и логирование)
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

    -- 3. ИСТОРИЯ ОПЕРАЦИЙ (Ledger)
    create table if not exists score_events (
      id         bigserial primary key,
      ts         timestamptz not null default now(),
      user_id    text not null references users(user_id),
      source     text not null, -- 'game', 'mission', 'buy_energy'
      title      text not null,
      score_add  integer not null default 0,
      ticket_add integer not null default 0,
      meta       jsonb not null default '{}'::jsonb
    );
    create index if not exists idx_score_events_user_ts on score_events (user_id, ts desc);

    -- 4. МИССИИ
    create table if not exists mission_rewards (
      user_id    text not null references users(user_id),
      mission_id text not null,
      created_at timestamptz not null default now(),
      primary key (user_id, mission_id)
    );
  `);
  console.log('✅ Database schema initialized');
}

// Утилита для записи истории
async function addScoreEvent(client, { userId, source, title, scoreAdd = 0, ticketAdd = 0, meta = {} }) {
  await client.query(
    `insert into score_events (user_id, source, title, score_add, ticket_add, meta)
     values ($1, $2, $3, $4, $5, $6::jsonb)`,
    [userId, source, title, scoreAdd, ticketAdd, JSON.stringify(meta)]
  );
}
