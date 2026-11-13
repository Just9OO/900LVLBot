'use strict';
/**
 * Level-up announcements — one place for text and voice level-ups.
 *
 * Mode (per server, set in /config):
 *   card  – themed level-up card image + message   (default)
 *   embed – themed embed, no image rendering
 *   text  – plain message only
 *   off   – no announcement at all
 */
const { AttachmentBuilder, EmbedBuilder } = require('discord.js');
const { generateLevelUpCard } = require('./cardRenderer');
const { resolveTheme } = require('./themes');
const { getRank, getRolesForLevel } = require('../database/db');

const DEFAULT_TEMPLATE = '🎉 {user} leveled up! **{type} Level {level}** reached!';
const MAX_TEMPLATE_LENGTH = 300;
const PLACEHOLDERS = {
  '{user}':     'Mentions the member',
  '{username}': 'Their name, without a ping',
  '{level}':    'The level they reached',
  '{type}':     '💬 Text or 🎙️ Voice',
  '{role}':     'Role they earned (blank if none)',
  '{server}':   'Server name',
};

function renderTemplate(template, vars) {
  return (template || DEFAULT_TEMPLATE).replace(
    /\{(user|username|level|type|role|server)\}/g,
    (_, key) => vars[key] ?? ''
  );
}

/**
 * @param {object} o
 * @param {import('discord.js').Client} o.client
 * @param {import('discord.js').Guild}  o.guild
 * @param {import('discord.js').User}   o.user
 * @param {'text'|'voice'} o.type
 * @param {object} o.userData        row from the users table (already updated)
 * @param {object} o.settings        guild settings
 * @param {{roleName:string}|null} o.roleAwarded
 * @param {import('discord.js').GuildMember|null} [o.member]   used for the voice DM fallback
 * @param {import('discord.js').TextBasedChannel|null} [o.fallbackChannel]  where to post if no channel is configured
 */
async function announceLevelUp({ client, guild, user, type, userData, settings, roleAwarded, member = null, fallbackChannel = null }) {
  const mode = settings.levelup_mode || 'card';
  if (mode === 'off') return;

  const isVoice = type === 'voice';
  const level   = isVoice ? userData.voice_level : userData.text_level;
  const theme   = resolveTheme(settings);

  const template = settings.levelup_message || DEFAULT_TEMPLATE;
  let content = renderTemplate(template, {
    user: `<@${user.id}>`,
    username: user.username,
    level: String(level),
    type: isVoice ? '🎙️ Voice' : '💬 Text',
    role: roleAwarded?.roleName ?? '',
    server: guild.name,
  });
  if (roleAwarded && !template.includes('{role}')) {
    content += `\nYou earned the **${roleAwarded.roleName}** role! 🎭`;
  }

  const payload = {
    content,
    // Admin-written text must never be able to ping @everyone or roles.
    allowedMentions: { parse: [], users: [user.id], roles: [] },
  };

  if (mode === 'card') {
    const topRole = getRolesForLevel(guild.id, level, type, false)[0];
    const buffer = await generateLevelUpCard({
      type,
      username:   user.username,
      avatarUrl:  user.displayAvatarURL({ extension: 'png', size: 256 }),
      textXp:     userData.text_xp,
      voiceXp:    userData.voice_xp,
      textLevel:  userData.text_level,
      voiceLevel: userData.voice_level,
      textRank:   getRank(guild.id, user.id, 'text'),
      voiceRank:  getRank(guild.id, user.id, 'voice'),
      theme,
      roleBadge:  topRole?.role_name || null,
    });
    payload.files = [new AttachmentBuilder(buffer, { name: 'levelup.png' })];
  } else if (mode === 'embed') {
    payload.content = `<@${user.id}>`;
    payload.embeds = [
      new EmbedBuilder()
        .setColor(isVoice ? theme.secondary : theme.primary)
        .setAuthor({ name: 'LEVEL UP', iconURL: user.displayAvatarURL({ size: 64 }) })
        .setDescription(content)
        .setThumbnail(user.displayAvatarURL({ size: 128 }))
        .setFooter({ text: guild.name }),
    ];
  }

  const channelId = settings.levelup_channel;
  if (channelId) {
    const ch = client.channels.cache.get(channelId) ?? await client.channels.fetch(channelId).catch(() => null);
    if (ch) return ch.send(payload);
  }
  if (fallbackChannel) return fallbackChannel.send(payload).catch(() => {});
  if (member) return member.send(payload).catch(() => {});   // voice level-ups: DM when no channel is set
}

module.exports = { announceLevelUp, renderTemplate, DEFAULT_TEMPLATE, MAX_TEMPLATE_LENGTH, PLACEHOLDERS };
