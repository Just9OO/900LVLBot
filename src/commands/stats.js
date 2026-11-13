const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db, getGuild } = require('../database/db');
const { resolveTheme } = require('../utils/themes');
const { fmt } = require('../utils/ui');

// Prepared once at module load so the Statement objects are reused.
const stmtTotals = db.prepare(`
  SELECT
    COUNT(*)         AS members,
    SUM(text_xp)     AS total_text_xp,
    SUM(voice_xp)    AS total_voice_xp,
    MAX(text_level)  AS max_text_level,
    MAX(voice_level) AS max_voice_level
  FROM users WHERE guild_id = ?
`);
const stmtTopText  = db.prepare(`SELECT user_id, text_xp,  text_level  FROM users WHERE guild_id = ? AND text_xp  > 0 ORDER BY text_xp  DESC LIMIT 3`);
const stmtTopVoice = db.prepare(`SELECT user_id, voice_xp, voice_level FROM users WHERE guild_id = ? AND voice_xp > 0 ORDER BY voice_xp DESC LIMIT 3`);

const MEDALS = ['🥇', '🥈', '🥉'];
const podium = (rows, xpKey, lvlKey) => rows.length
  ? rows.map((r, i) => `${MEDALS[i]} <@${r.user_id}> — Lv **${r[lvlKey]}** · ${fmt(r[xpKey])} XP`).join('\n')
  : '*Nobody yet*';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('View server-wide XP statistics'),

  async execute(interaction) {
    const guildId  = interaction.guildId;
    const settings = getGuild(guildId);
    const theme    = resolveTheme(settings);
    const totals   = stmtTotals.get(guildId);

    const embed = new EmbedBuilder()
      .setColor(theme.primary)
      .setAuthor({ name: `${interaction.guild.name} · XP Stats`, iconURL: interaction.guild.iconURL() ?? undefined })
      .setThumbnail(interaction.guild.iconURL() ?? null)
      .addFields(
        { name: '👥 Tracked members',  value: `**${fmt(totals?.members)}**`,                inline: true },
        { name: '💬 Total text XP',    value: `**${fmt(totals?.total_text_xp)}**`,          inline: true },
        { name: '🎙️ Total voice XP',  value: `**${fmt(totals?.total_voice_xp)}**`,         inline: true },
        { name: '🏅 Top text level',   value: `**${totals?.max_text_level ?? 0}**`,         inline: true },
        { name: '🏅 Top voice level',  value: `**${totals?.max_voice_level ?? 0}**`,        inline: true },
        { name: '​', value: '​', inline: true },
        { name: '💬 Text podium',  value: podium(stmtTopText.all(guildId),  'text_xp',  'text_level'),  inline: true },
        { name: '🎙️ Voice podium', value: podium(stmtTopVoice.all(guildId), 'voice_xp', 'voice_level'), inline: true },
      )
      .setFooter({ text: '/leaderboard for the full rankings' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
  },
};
