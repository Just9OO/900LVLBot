const { accent, EPHEMERAL } = require('../utils/ui');
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { getGuild, getActiveBoost, createBoost, clearBoosts } = require('../database/db');

const DURATION_MAP = {
  '30m': 30 * 60 * 1000,
  '1h':  1 * 60 * 60 * 1000,
  '2h':  2 * 60 * 60 * 1000,
  '6h':  6 * 60 * 60 * 1000,
  '12h': 12 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('xp-boost')
    .setDescription('Start or stop an XP boost event (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub.setName('start')
        .setDescription('Start a server-wide XP boost')
        .addStringOption(o =>
          o.setName('duration').setDescription('How long the boost lasts').setRequired(true)
            .addChoices(
              { name: '30 minutes', value: '30m' },
              { name: '1 hour',     value: '1h'  },
              { name: '2 hours',    value: '2h'  },
              { name: '6 hours',    value: '6h'  },
              { name: '12 hours',   value: '12h' },
              { name: '24 hours',   value: '24h' },
            )
        )
        .addNumberOption(o =>
          o.setName('multiplier').setDescription('XP multiplier (e.g. 2 = double XP)').setMinValue(1.1).setMaxValue(10).setRequired(false)
        )
        .addStringOption(o =>
          o.setName('label').setDescription('Event name shown in announcements').setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub.setName('stop')
        .setDescription('Cancel the active XP boost early')
    )
    .addSubcommand(sub =>
      sub.setName('status')
        .setDescription('Check if a boost is currently active')
    ),

  async execute(interaction) {
    const sub      = interaction.options.getSubcommand();
    const guildId  = interaction.guildId;
    const settings = getGuild(guildId);
    const color    = accent(settings);

    if (sub === 'start') {
      const durationKey  = interaction.options.getString('duration');
      const multiplier   = interaction.options.getNumber('multiplier') || 2.0;
      const label        = interaction.options.getString('label') || '🚀 XP Boost Event';
      const durationMs   = DURATION_MAP[durationKey];
      const expiresAt    = Date.now() + durationMs;

      clearBoosts(guildId); // replace any existing boost
      createBoost(guildId, multiplier, durationMs, label);

      const expiresStr = `<t:${Math.floor(expiresAt / 1000)}:R>`;

      const levelupChannel = settings.levelup_channel
        ? interaction.client.channels.cache.get(settings.levelup_channel)
        : null;

      const announceEmbed = new EmbedBuilder()
        .setColor('#FFD700')
        .setTitle(`⚡ ${label} Started!`)
        .setDescription(`XP gains are now **${multiplier}×** for everyone!\nEnds ${expiresStr}`)
        .setTimestamp();

      if (levelupChannel) levelupChannel.send({ embeds: [announceEmbed] }).catch(() => {});

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(color)
            .setTitle(`✅ Boost Started: ${label}`)
            .addFields(
              { name: 'Multiplier', value: `${multiplier}×`,    inline: true },
              { name: 'Duration',   value: durationKey,          inline: true },
              { name: 'Expires',    value: expiresStr,           inline: true },
            )
            .setTimestamp(),
        ],
        flags: EPHEMERAL,
      });
    }

    if (sub === 'stop') {
      clearBoosts(guildId);
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(color).setTitle('✅ XP Boost Cancelled').setDescription('The active boost has been removed.')],
        flags: EPHEMERAL,
      });
    }

    if (sub === 'status') {
      const boost = getActiveBoost(guildId);
      if (!boost) {
        return interaction.reply({
          embeds: [new EmbedBuilder().setColor(color).setTitle('ℹ️ No Active Boost').setDescription('There is no XP boost running right now.')],
          flags: EPHEMERAL,
        });
      }
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#FFD700')
            .setTitle(`⚡ Active: ${boost.label}`)
            .addFields(
              { name: 'Multiplier', value: `${boost.multiplier}×`, inline: true },
              { name: 'Expires',    value: `<t:${Math.floor(boost.expires_at / 1000)}:R>`, inline: true },
            ),
        ],
        flags: EPHEMERAL,
      });
    }
  },
};
