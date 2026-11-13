const {
  getUser, saveUser, getGuild, levelFromXp,
  getActiveBoost, isOnCooldown,
} = require('../database/db');
const { assignLevelRole }  = require('../utils/roleManager');
const { announceLevelUp }  = require('../utils/levelUp');

const DEFAULT_COOLDOWN_S = 60;
const MIN_LENGTH         = 5;

module.exports = {
  name: 'messageCreate',

  async execute(message, client) {
    // ── Cheap early exits (no DB reads) ────────────────────────────────────────
    if (message.author.bot || !message.guild || message.system) return;
    if (message.content.length < MIN_LENGTH) return;

    const guildId = message.guild.id;
    const userId  = message.author.id;

    // ── Guild settings (cached — no DB read if recently fetched) ───────────────
    const settings = getGuild(guildId);

    // Cooldown check from memory — zero DB reads for the common case
    if (isOnCooldown(guildId, userId, (settings.text_cooldown ?? DEFAULT_COOLDOWN_S) * 1000)) return;

    // _ignoredChannels and _noXpRoles are pre-parsed Sets in the cache entry
    if (settings._ignoredChannels.has(message.channel.id)) return;

    if (settings._noXpRoles.size > 0) {
      const member = message.member || await message.guild.members.fetch(userId).catch(() => null);
      if (member && [...settings._noXpRoles].some(r => member.roles.cache.has(r))) return;
    }

    // ── XP calculation ─────────────────────────────────────────────────────────
    const boost      = getActiveBoost(guildId); // cached — no DB hit most of the time
    const multiplier = boost ? boost.multiplier : settings.xp_multiplier;
    const base       = settings.text_xp_min +
      Math.floor(Math.random() * (settings.text_xp_max - settings.text_xp_min + 1));
    const earned     = Math.floor(base * multiplier);

    const userData  = getUser(guildId, userId);
    const oldLevel  = userData.text_level;
    userData.text_xp     += earned;
    userData.text_level   = levelFromXp(userData.text_xp);
    userData.last_message = Date.now();
    saveUser(userData); // also updates cooldownMap

    // ── Level-up (rare — don't slow down the happy path) ───────────────────────
    if (userData.text_level > oldLevel) {
      // Defer the heavy work (card render, role assignment, Discord API) so
      // the message handler returns immediately and doesn't block the event loop
      setImmediate(() =>
        handleLevelUp(message, userId, userData, settings, client).catch(err =>
          console.error('[LevelUp] Error:', err)
        )
      );
    }
  },
};

async function handleLevelUp(message, userId, userData, settings, client) {
  const member = message.member || await message.guild.members.fetch(userId).catch(() => null);
  const user   = member?.user || message.author;

  const roleAwarded = member
    ? await assignLevelRole(message.guild, member, userData.text_level, 'text', !!settings.stack_roles)
    : null;

  await announceLevelUp({
    client, guild: message.guild, user, type: 'text',
    userData, settings, roleAwarded,
    fallbackChannel: message.channel,
  });
}
