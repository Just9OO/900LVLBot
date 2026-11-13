const { EPHEMERAL } = require('../utils/ui');
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { db, getGuild } = require('../database/db');

// BUG FIX: was preparing these statements inside execute() on every command invocation.
// Prepared once at module load instead.
const stmtResetText  = db.prepare(`UPDATE users SET text_xp  = 0, text_level  = 0 WHERE guild_id = ? AND user_id = ?`);
const stmtResetVoice = db.prepare(`UPDATE users SET voice_xp = 0, voice_level = 0 WHERE guild_id = ? AND user_id = ?`);
const stmtResetAll   = db.prepare(`DELETE FROM users WHERE guild_id = ? AND user_id = ?`);

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reset-user')
    .setDescription("Reset a user's XP (Admin only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(opt =>
      opt.setName('user').setDescription('User to reset').setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('type')
        .setDescription('What to reset')
        .setRequired(true)
        .addChoices(
          { name: '💬 Text XP only',  value: 'text'  },
          { name: '🎙️ Voice XP only', value: 'voice' },
          { name: '💥 Everything',    value: 'all'   },
        )
    ),

  async execute(interaction) {
    const target   = interaction.options.getUser('user');
    const type     = interaction.options.getString('type');
    const guildId  = interaction.guildId;
    const settings = getGuild(guildId);

    if (type === 'text')       stmtResetText.run(guildId, target.id);
    else if (type === 'voice') stmtResetVoice.run(guildId, target.id);
    else                       stmtResetAll.run(guildId, target.id);

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor('#ED4245')
          .setTitle('🔄 User Reset')
          .setDescription(`**${target.username}**'s ${type === 'all' ? 'all XP' : type + ' XP'} has been reset to 0.`)
          .setTimestamp(),
      ],
      flags: EPHEMERAL,
    });
  },
};
