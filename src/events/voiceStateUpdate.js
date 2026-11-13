const {
  getUser, saveUser, getGuild, levelFromXp, getActiveBoost,
} = require('../database/db');
const { assignLevelRole } = require('../utils/roleManager');
const { announceLevelUp } = require('../utils/levelUp');

const voiceUsers = new Map(); // Map<guildId, Map<userId, joinTimestamp>>
let tickerInterval = null;

module.exports = {
  name: 'voiceStateUpdate',

  execute(oldState, newState) {
    const userId  = newState.id;
    const guildId = newState.guild.id;

    const wasInVoice = !!(oldState.channelId && !oldState.selfMute && !oldState.selfDeaf && !oldState.serverMute && !oldState.serverDeaf);
    const isInVoice  = !!(newState.channelId && !newState.selfMute && !newState.selfDeaf && !newState.serverMute && !newState.serverDeaf);

    if (!voiceUsers.has(guildId)) voiceUsers.set(guildId, new Map());
    const guildMap = voiceUsers.get(guildId);

    if (!wasInVoice && isInVoice)       guildMap.set(userId, Date.now());
    else if (wasInVoice && !isInVoice)  guildMap.delete(userId);
    else if (!wasInVoice && !isInVoice) guildMap.delete(userId);
  },

  startTicker,
  voiceUsers,
};

function startTicker(client) {
  if (tickerInterval) return;

  tickerInterval = setInterval(() => {
    // Run all XP writes in a single batch, then handle level-ups after
    const levelUps = [];

    for (const [guildId, guildMap] of voiceUsers) {
      if (guildMap.size === 0) continue;

      let settings;
      try { settings = getGuild(guildId); } catch { continue; }

      const boost      = getActiveBoost(guildId);
      const multiplier = boost ? boost.multiplier : settings.xp_multiplier;
      const earned     = Math.floor(settings.voice_xp_rate * multiplier);

      for (const [userId] of guildMap) {
        try {
          const userData = getUser(guildId, userId);
          const oldLevel = userData.voice_level;
          userData.voice_xp    += earned;
          userData.voice_level  = levelFromXp(userData.voice_xp);
          saveUser(userData);

          if (userData.voice_level > oldLevel) {
            levelUps.push({ guildId, userId, userData, settings });
          }
        } catch (err) {
          console.error('[VoiceXP] Error awarding XP to', userId, err);
        }
      }
    }

    // Handle level-ups outside the DB loop — they involve async Discord API calls
    // and canvas rendering which we don't want blocking the next tick
    for (const lu of levelUps) {
      handleVoiceLevelUp(lu, client).catch(err =>
        console.error('[VoiceLevelUp] Error:', err)
      );
    }
  }, 60_000);
}

async function handleVoiceLevelUp({ guildId, userId, userData, settings }, client) {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return;

  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return;

  const roleAwarded = await assignLevelRole(guild, member, userData.voice_level, 'voice', !!settings.stack_roles);

  await announceLevelUp({
    client, guild, user: member.user, member, type: 'voice',
    userData, settings, roleAwarded,
  });
}
