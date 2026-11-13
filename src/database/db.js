const Database = require('better-sqlite3');
const path = require('path');
const fs   = require('fs');
const {
  xpForLevel, totalXpForLevel, levelFromXp, xpInCurrentLevel,
} = require('../utils/xpMath');
const { mix, parseColor } = require('../utils/themes');

const DB_PATH = process.env.DB_PATH || './data/bot.db';
const dbDir   = path.dirname(path.resolve(DB_PATH));
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(path.resolve(DB_PATH));
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('cache_size = -64000'); // 64MB page cache
db.pragma('temp_store = MEMORY');
db.pragma('mmap_size = 268435456'); // 256MB mmap — reads bypass syscalls entirely
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    guild_id     TEXT NOT NULL,
    user_id      TEXT NOT NULL,
    text_xp      INTEGER NOT NULL DEFAULT 0,
    voice_xp     INTEGER NOT NULL DEFAULT 0,
    text_level   INTEGER NOT NULL DEFAULT 0,
    voice_level  INTEGER NOT NULL DEFAULT 0,
    last_message INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (guild_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS guilds (
    guild_id         TEXT PRIMARY KEY,
    levelup_channel  TEXT,
    card_color       TEXT NOT NULL DEFAULT '#5865F2',
    card_bg_color    TEXT NOT NULL DEFAULT '#23272A',
    card_bar_color   TEXT NOT NULL DEFAULT '#5865F2',
    card_text_color  TEXT NOT NULL DEFAULT '#FFFFFF',
    text_xp_min      INTEGER NOT NULL DEFAULT 15,
    text_xp_max      INTEGER NOT NULL DEFAULT 25,
    voice_xp_rate    INTEGER NOT NULL DEFAULT 10,
    voice_interval   INTEGER NOT NULL DEFAULT 60000,
    xp_multiplier    REAL NOT NULL DEFAULT 1.0,
    ignored_channels TEXT NOT NULL DEFAULT '[]',
    ignored_roles    TEXT NOT NULL DEFAULT '[]',
    no_xp_roles      TEXT NOT NULL DEFAULT '[]',
    stack_roles      INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS level_roles (
    guild_id   TEXT NOT NULL,
    level      INTEGER NOT NULL,
    role_id    TEXT,
    role_name  TEXT NOT NULL DEFAULT 'Unnamed Role',
    type       TEXT NOT NULL DEFAULT 'text',
    PRIMARY KEY (guild_id, level, type)
  );
  CREATE TABLE IF NOT EXISTS xp_boosts (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id   TEXT NOT NULL,
    multiplier REAL NOT NULL DEFAULT 2.0,
    expires_at INTEGER NOT NULL,
    label      TEXT NOT NULL DEFAULT 'XP Boost'
  );
  CREATE INDEX IF NOT EXISTS idx_text_xp    ON users (guild_id, text_xp  DESC);
  CREATE INDEX IF NOT EXISTS idx_voice_xp   ON users (guild_id, voice_xp DESC);
  CREATE INDEX IF NOT EXISTS idx_level_roles ON level_roles (guild_id, type, level);
  CREATE INDEX IF NOT EXISTS idx_boosts      ON xp_boosts (guild_id, expires_at DESC);
`);

// ─── Migrations ───────────────────────────────────────────────────────────────
// Additive only: new columns are added when missing, existing data is kept.

function ensureColumn(table, column, ddl) {
  const exists = db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === column);
  if (!exists) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
}

for (const [column, ddl] of [
  ['theme_id',        `TEXT NOT NULL DEFAULT 'inferno'`],   // preset id, or 'custom'
  ['custom_name',     `TEXT NOT NULL DEFAULT 'Custom'`],
  ['custom_bg',       'TEXT'],
  ['custom_primary',  'TEXT'],
  ['custom_secondary','TEXT'],
  ['custom_style',    `TEXT NOT NULL DEFAULT 'aurora'`],
  ['text_cooldown',   'INTEGER NOT NULL DEFAULT 60'],      // seconds between XP-earning messages
  ['levelup_mode',    `TEXT NOT NULL DEFAULT 'card'`],     // card | embed | text | off
  ['levelup_message', 'TEXT'],                              // custom template, NULL = default
]) ensureColumn('guilds', column, ddl);

// v2: servers that had customised the old per-element card colours get an
// equivalent custom theme, so their cards keep their look after the upgrade.
if (db.pragma('user_version', { simple: true }) < 2) {
  try {
    const OLD = { card_color: '#5865F2', card_bg_color: '#23272A', card_bar_color: '#5865F2' };
    const changed = (v, key) => v && v.toUpperCase() !== OLD[key];
    const update = db.prepare(`
      UPDATE guilds SET theme_id = 'custom', custom_name = 'Migrated',
        custom_bg = ?, custom_primary = ?, custom_secondary = ?, custom_style = 'sun'
      WHERE guild_id = ?`);
    db.transaction(() => {
      for (const r of db.prepare('SELECT guild_id, card_color, card_bg_color, card_bar_color FROM guilds').all()) {
        if (!changed(r.card_color, 'card_color') && !changed(r.card_bg_color, 'card_bg_color') && !changed(r.card_bar_color, 'card_bar_color')) continue;
        const bg      = (changed(r.card_bg_color, 'card_bg_color') && parseColor(r.card_bg_color)) || '#0A0A0D';
        const primary = (changed(r.card_color, 'card_color') && parseColor(r.card_color))         || '#E8381F';
        const secondary = (changed(r.card_bar_color, 'card_bar_color') && parseColor(r.card_bar_color))
          || mix(primary, '#FFFFFF', 0.25);
        update.run(bg, primary, secondary, r.guild_id);
      }
    })();
    db.pragma('user_version = 2');
  } catch (err) {
    console.error('[DB] Theme migration failed (will retry on next start):', err.message);
  }
}

// ─── Guild settings cache ─────────────────────────────────────────────────────
// Guild settings almost never change. Cache them in memory so every message
// doesn't hit SQLite. TTL = 5 minutes. Invalidated on any write.

const guildCache    = new Map(); // guildId → { settings, parsedChannels, parsedNoXpRoles, ts }
const GUILD_TTL_MS  = 5 * 60 * 1000;

function invalidateGuildCache(guildId) {
  guildCache.delete(guildId);
}

// ─── Boost cache ──────────────────────────────────────────────────────────────
// Active boosts change rarely. Cache per guild, expire when the boost expires.

const boostCache = new Map(); // guildId → { boost | null, expiresAt }

function invalidateBoostCache(guildId) {
  boostCache.delete(guildId);
}

// ─── Cooldown map (pure memory — no DB read needed) ──────────────────────────
// Stores last_message timestamps in memory so we can reject cooldown hits
// without ever touching SQLite.

const cooldownMap = new Map(); // `${guildId}:${userId}` → timestamp

// ─── XP formula ───────────────────────────────────────────────────────────────
// Lives in utils/xpMath.js (pure maths, no database) and is re-exported below.

// ─── Prepared statements ──────────────────────────────────────────────────────

const stmts = {
  getUser:      db.prepare(`SELECT * FROM users WHERE guild_id = ? AND user_id = ?`),
  upsertUser:   db.prepare(`
    INSERT INTO users (guild_id, user_id, text_xp, voice_xp, text_level, voice_level, last_message)
    VALUES (@guild_id, @user_id, @text_xp, @voice_xp, @text_level, @voice_level, @last_message)
    ON CONFLICT (guild_id, user_id) DO UPDATE SET
      text_xp      = excluded.text_xp,
      voice_xp     = excluded.voice_xp,
      text_level   = excluded.text_level,
      voice_level  = excluded.voice_level,
      last_message = excluded.last_message
  `),
  getGuild:        db.prepare(`SELECT * FROM guilds WHERE guild_id = ?`),
  upsertGuild:     db.prepare(`INSERT INTO guilds (guild_id) VALUES (?) ON CONFLICT (guild_id) DO NOTHING`),
  textLeaderboard:  db.prepare(`SELECT user_id, text_xp,  text_level  FROM users WHERE guild_id = ? ORDER BY text_xp  DESC LIMIT 10`),
  voiceLeaderboard: db.prepare(`SELECT user_id, voice_xp, voice_level FROM users WHERE guild_id = ? ORDER BY voice_xp DESC LIMIT 10`),
  textRank:  db.prepare(`SELECT COUNT(*)+1 AS rank FROM users WHERE guild_id = ? AND text_xp  > (SELECT text_xp  FROM users WHERE guild_id = ? AND user_id = ?)`),
  voiceRank: db.prepare(`SELECT COUNT(*)+1 AS rank FROM users WHERE guild_id = ? AND voice_xp > (SELECT voice_xp FROM users WHERE guild_id = ? AND user_id = ?)`),
  getLevelRoles:   db.prepare(`SELECT * FROM level_roles WHERE guild_id = ? AND type = ? ORDER BY level ASC`),
  getLevelRole:    db.prepare(`SELECT * FROM level_roles WHERE guild_id = ? AND level = ? AND type = ?`),
  upsertLevelRole: db.prepare(`
    INSERT INTO level_roles (guild_id, level, role_id, role_name, type)
    VALUES (@guild_id, @level, @role_id, @role_name, @type)
    ON CONFLICT (guild_id, level, type) DO UPDATE SET role_id = excluded.role_id, role_name = excluded.role_name
  `),
  deleteLevelRole: db.prepare(`DELETE FROM level_roles WHERE guild_id = ? AND level = ? AND type = ?`),
  allLevelRoles:   db.prepare(`SELECT * FROM level_roles WHERE guild_id = ? ORDER BY type, level ASC`),
  rolesUpToLevel:  db.prepare(`SELECT * FROM level_roles WHERE guild_id = ? AND type = ? AND level <= ? ORDER BY level DESC`),
  activeBoost:     db.prepare(`SELECT * FROM xp_boosts WHERE guild_id = ? AND expires_at > ? ORDER BY expires_at DESC LIMIT 1`),
  insertBoost:     db.prepare(`INSERT INTO xp_boosts (guild_id, multiplier, expires_at, label) VALUES (?, ?, ?, ?)`),
  clearBoosts:     db.prepare(`DELETE FROM xp_boosts WHERE guild_id = ?`),
  expireBoosts:    db.prepare(`DELETE FROM xp_boosts WHERE expires_at <= ?`),
};

// ─── Allowlist ────────────────────────────────────────────────────────────────

const GUILD_UPDATABLE_FIELDS = new Set([
  'levelup_channel', 'card_color', 'card_bg_color', 'card_bar_color', 'card_text_color',
  'text_xp_min', 'text_xp_max', 'voice_xp_rate', 'voice_interval',
  'xp_multiplier', 'ignored_channels', 'ignored_roles', 'no_xp_roles', 'stack_roles',
  'theme_id', 'custom_name', 'custom_bg', 'custom_primary', 'custom_secondary', 'custom_style',
  'text_cooldown', 'levelup_mode', 'levelup_message',
]);

// ─── API ──────────────────────────────────────────────────────────────────────

function getUser(guildId, userId) {
  return stmts.getUser.get(guildId, userId) || {
    guild_id: guildId, user_id: userId,
    text_xp: 0, voice_xp: 0, text_level: 0, voice_level: 0, last_message: 0,
  };
}

function saveUser(user) {
  stmts.upsertUser.run(user);
  // Keep cooldown map in sync so future messages don't need a DB read
  const key = `${user.guild_id}:${user.user_id}`;
  cooldownMap.set(key, user.last_message);
}

/** Returns cached guild settings. Parses JSON arrays once and stores them. */
function getGuild(guildId) {
  const cached = guildCache.get(guildId);
  if (cached && Date.now() - cached.ts < GUILD_TTL_MS) return cached;

  stmts.upsertGuild.run(guildId);
  const raw = stmts.getGuild.get(guildId);
  const entry = {
    ...raw,
    // Pre-parse JSON arrays so messageCreate never calls JSON.parse
    _ignoredChannels: new Set(JSON.parse(raw.ignored_channels || '[]')),
    _noXpRoles:       new Set(JSON.parse(raw.no_xp_roles      || '[]')),
    ts: Date.now(),
  };
  guildCache.set(guildId, entry);
  return entry;
}

function updateGuild(guildId, fields) {
  getGuild(guildId); // ensure row exists
  const safeFields = Object.fromEntries(
    Object.entries(fields).filter(([k]) => GUILD_UPDATABLE_FIELDS.has(k))
  );
  if (Object.keys(safeFields).length === 0) return;
  const sets = Object.keys(safeFields).map(k => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE guilds SET ${sets} WHERE guild_id = @guild_id`)
    .run({ ...safeFields, guild_id: guildId });
  invalidateGuildCache(guildId); // force fresh read next access
}

function getLeaderboard(guildId, type) {
  return type === 'voice'
    ? stmts.voiceLeaderboard.all(guildId)
    : stmts.textLeaderboard.all(guildId);
}

function getRank(guildId, userId, type) {
  if (type === 'voice') return stmts.voiceRank.get(guildId, guildId, userId)?.rank ?? 1;
  return stmts.textRank.get(guildId, guildId, userId)?.rank ?? 1;
}

// ─── Level roles ──────────────────────────────────────────────────────────────

function getLevelRoles(guildId, type) {
  return stmts.getLevelRoles.all(guildId, type);
}

function getAllLevelRoles(guildId) {
  return stmts.allLevelRoles.all(guildId);
}

function setLevelRole(guildId, level, roleId, roleName, type = 'text') {
  stmts.upsertLevelRole.run({ guild_id: guildId, level, role_id: roleId, role_name: roleName, type });
}

function removeLevelRole(guildId, level, type = 'text') {
  stmts.deleteLevelRole.run(guildId, level, type);
}

function getRolesForLevel(guildId, level, type, stackRoles = true) {
  const rows = stmts.rolesUpToLevel.all(guildId, type, level);
  if (!rows.length) return [];
  return stackRoles ? rows : [rows[0]];
}

// ─── XP Boost ────────────────────────────────────────────────────────────────

function getActiveBoost(guildId) {
  const now = Date.now();
  const cached = boostCache.get(guildId);

  // Return from cache if still valid
  if (cached !== undefined) {
    if (cached === null) return null;                // cached "no boost"
    if (cached.expires_at > now) return cached;     // boost still active
    boostCache.delete(guildId);                     // boost just expired
  }

  // Cache miss — hit DB once, then cache result
  stmts.expireBoosts.run(now);
  const boost = stmts.activeBoost.get(guildId, now) || null;
  // Cache null for 30s so we don't hit DB on every message during no-boost periods
  boostCache.set(guildId, boost);
  if (boost === null) setTimeout(() => boostCache.delete(guildId), 30_000);
  return boost;
}

function createBoost(guildId, multiplier, durationMs, label) {
  stmts.insertBoost.run(guildId, multiplier, Date.now() + durationMs, label);
  invalidateBoostCache(guildId);
}

function clearBoosts(guildId) {
  stmts.clearBoosts.run(guildId);
  invalidateBoostCache(guildId);
}

// ─── Cooldown helper (hot path — zero DB reads) ───────────────────────────────

function isOnCooldown(guildId, userId, cooldownMs) {
  const key = `${guildId}:${userId}`;
  const last = cooldownMap.get(key) ?? 0;
  return Date.now() - last < cooldownMs;
}

module.exports = {
  cooldownMap,
  db, getUser, saveUser, getGuild, updateGuild,
  getLeaderboard, getRank,
  xpForLevel, totalXpForLevel, levelFromXp, xpInCurrentLevel,
  getLevelRoles, getAllLevelRoles, setLevelRole, removeLevelRole, getRolesForLevel,
  getActiveBoost, createBoost, clearBoosts,
  isOnCooldown,
  invalidateGuildCache, invalidateBoostCache,
};
