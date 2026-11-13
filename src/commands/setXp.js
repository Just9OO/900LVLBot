const { accent, EPHEMERAL } = require('../utils/ui');
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { getUser, saveUser, getGuild, totalXpForLevel } = require('../database/db');
const { syncMemberRoles } = require('../utils/roleManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('set-xp')
    .setDescription("Set a user's level (Admin only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(opt => opt.setName('user').setDescription('Target user').setRequired(true))
    .addStringOption(opt =>
      opt.setName('type').setDescription('Text or Voice XP').setRequired(true)
        .addChoices({ name: '💬 Text', value: 'text' }, { name: '🎙️ Voice', value: 'voice' })
    )
    .addIntegerOption(opt =>
      opt.setName('level').setDescription('Level to set (0–100)').setRequired(true).setMinValue(0).setMaxValue(100)
    ),

  async execute(interaction) {
    const target  = interaction.options.getUser('user');
    const type    = interaction.options.getString('type');
    const level   = interaction.options.getInteger('level');
    const guildId = interaction.guildId;

    const userData = getUser(guildId, target.id);
    const xp       = totalXpForLevel(level);

    if (type === 'text')  { userData.text_xp  = xp; userData.text_level  = level; }
    else                  { userData.voice_xp = xp; userData.voice_level = level; }
    saveUser(userData);

    // Sync roles to reflect new level
    const settings   = getGuild(guildId);
    const stackRoles = !!settings.stack_roles;
    const member     = await interaction.guild.members.fetch(target.id).catch(() => null);
    if (member) {
      await syncMemberRoles(interaction.guild, member, userData.text_level, userData.voice_level, stackRoles);
    }

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(accent(settings))
          .setTitle('✅ XP Updated')
          .setDescription(
            `Set **${target.username}**'s ${type === 'voice' ? '🎙️ Voice' : '💬 Text'} level to **${level}**\n` +
            `(${xp.toLocaleString()} total XP)` +
            (member ? '\nRoles synced.' : '')
          )
          .setTimestamp(),
      ],
      flags: EPHEMERAL,
    });
  },
};
