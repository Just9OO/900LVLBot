const { accent, EPHEMERAL } = require('../utils/ui');
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require('discord.js');
const { getGuild, updateGuild } = require('../database/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('no-xp-role')
    .setDescription('Toggle XP earning for a role (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addRoleOption(opt =>
      opt.setName('role')
        .setDescription('Role to toggle XP for')
        .setRequired(true)
    ),

  async execute(interaction) {
    const role      = interaction.options.getRole('role');
    const guildId   = interaction.guildId;
    const settings  = getGuild(guildId);
    let noXp        = JSON.parse(settings.no_xp_roles || '[]');

    const idx = noXp.indexOf(role.id);
    let action;
    if (idx === -1) {
      noXp.push(role.id);
      action = 'blocked';
    } else {
      noXp.splice(idx, 1);
      action = 'allowed';
    }

    updateGuild(guildId, { no_xp_roles: JSON.stringify(noXp) });

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(accent(settings))
          .setTitle(`✅ Role XP ${action === 'blocked' ? 'Blocked' : 'Restored'}`)
          .setDescription(
            action === 'blocked'
              ? `Members with ${role} will no longer earn XP.`
              : `Members with ${role} can now earn XP again.`
          ),
      ],
      flags: EPHEMERAL,
    });
  },
};
