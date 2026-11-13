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
    .setName('set-channel')
    .setDescription('Set the channel for level-up announcements (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(opt =>
      opt.setName('channel')
        .setDescription('Target text channel (omit to post where the level-up happens)')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
    ),

  async execute(interaction) {
    const channel  = interaction.options.getChannel('channel');
    const guildId  = interaction.guildId;
    const guildSettings = getGuild(guildId);

    if (channel) {
      updateGuild(guildId, { levelup_channel: channel.id });
    } else {
      updateGuild(guildId, { levelup_channel: null });
    }

    const embed = new EmbedBuilder()
      .setColor(accent(guildSettings))
      .setTitle('✅ Level-up Channel Updated')
      .setDescription(
        channel
          ? `Level-up announcements will now be sent to ${channel}.`
          : 'Level-up announcements will now be posted in the channel where the level-up happens (voice level-ups are sent by DM). Use `/config` to turn them off entirely.'
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: EPHEMERAL });
  },
};
