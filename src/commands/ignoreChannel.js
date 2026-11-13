const { accent, EPHEMERAL } = require('../utils/ui');
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ChannelType,
} = require('discord.js');
const { getGuild, updateGuild } = require('../database/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ignore-channel')
    .setDescription('Toggle XP earning in a specific channel (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(opt =>
      opt.setName('channel')
        .setDescription('Channel to toggle')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    ),

  async execute(interaction) {
    const channel   = interaction.options.getChannel('channel');
    const guildId   = interaction.guildId;
    const settings  = getGuild(guildId);
    let ignored     = JSON.parse(settings.ignored_channels || '[]');

    const idx = ignored.indexOf(channel.id);
    let action;
    if (idx === -1) {
      ignored.push(channel.id);
      action = 'ignored';
    } else {
      ignored.splice(idx, 1);
      action = 'unignored';
    }

    updateGuild(guildId, { ignored_channels: JSON.stringify(ignored) });

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(accent(settings))
          .setTitle(`✅ Channel ${action === 'ignored' ? 'Ignored' : 'Re-enabled'}`)
          .setDescription(
            action === 'ignored'
              ? `${channel} will no longer grant XP.`
              : `${channel} will now grant XP again.`
          ),
      ],
      flags: EPHEMERAL,
    });
  },
};
