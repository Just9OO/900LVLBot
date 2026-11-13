const { accent, EPHEMERAL } = require('../utils/ui');
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require('discord.js');
const { getGuild, updateGuild } = require('../database/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('set-xp-rate')
    .setDescription('Configure XP gain rates (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addNumberOption(opt =>
      opt.setName('multiplier')
        .setDescription('XP multiplier (e.g. 2.0 = double XP, 0.5 = half XP)')
        .setMinValue(0.1).setMaxValue(10).setRequired(false)
    )
    .addIntegerOption(opt =>
      opt.setName('text-min')
        .setDescription('Minimum text XP per message (default 15)')
        .setMinValue(1).setMaxValue(500).setRequired(false)
    )
    .addIntegerOption(opt =>
      opt.setName('text-max')
        .setDescription('Maximum text XP per message (default 25)')
        .setMinValue(1).setMaxValue(500).setRequired(false)
    )
    .addIntegerOption(opt =>
      opt.setName('voice-xp')
        .setDescription('Voice XP awarded every minute (default 10)')
        .setMinValue(1).setMaxValue(500).setRequired(false)
    ),

  async execute(interaction) {
    const guildId    = interaction.guildId;
    const settings   = getGuild(guildId);
    const multiplier = interaction.options.getNumber('multiplier');
    const textMin    = interaction.options.getInteger('text-min');
    const textMax    = interaction.options.getInteger('text-max');
    const voiceXp    = interaction.options.getInteger('voice-xp');

    const updates = {};
    if (multiplier !== null) updates.xp_multiplier = multiplier;
    if (textMin    !== null) updates.text_xp_min   = textMin;
    if (textMax    !== null) updates.text_xp_max   = textMax;
    if (voiceXp    !== null) updates.voice_xp_rate = voiceXp;

    if (Object.keys(updates).length === 0) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(accent(settings))
            .setTitle('⚙️ Current XP Rate Settings')
            .addFields(
              { name: 'Multiplier',    value: `${settings.xp_multiplier}×`, inline: true },
              { name: 'Text XP Range', value: `${settings.text_xp_min}–${settings.text_xp_max}`, inline: true },
              { name: 'Voice XP/min',  value: `${settings.voice_xp_rate}`, inline: true },
            ),
        ],
        flags: EPHEMERAL,
      });
    }

    // BUG FIX: old check used `if (textMin && textMax ...)` — falsy for 0, and also missed
    // the case where only one of the two is provided. Now we resolve the effective values
    // (falling back to what's already saved) and validate against those.
    const effectiveMin = textMin !== null ? textMin : settings.text_xp_min;
    const effectiveMax = textMax !== null ? textMax : settings.text_xp_max;

    if (effectiveMin > effectiveMax) {
      return interaction.reply({
        content: `❌ text-min (${effectiveMin}) can't be higher than text-max (${effectiveMax}).`,
        flags: EPHEMERAL,
      });
    }

    updateGuild(guildId, updates);
    const fresh = getGuild(guildId);

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(accent(fresh))
          .setTitle('✅ XP Rates Updated')
          .addFields(
            { name: 'Multiplier',    value: `${fresh.xp_multiplier}×`, inline: true },
            { name: 'Text XP Range', value: `${fresh.text_xp_min}–${fresh.text_xp_max}`, inline: true },
            { name: 'Voice XP/min',  value: `${fresh.voice_xp_rate}`, inline: true },
          )
          .setTimestamp(),
      ],
      flags: EPHEMERAL,
    });
  },
};
