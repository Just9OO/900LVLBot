const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { getUser, getGuild, getRank, getRolesForLevel } = require('../database/db');
const { generateLevelCard } = require('../utils/cardRenderer');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('level')
    .setDescription('View your level card showing Text and Voice XP')
    .addUserOption(opt =>
      opt.setName('user').setDescription('User to check (defaults to yourself)').setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const target        = interaction.options.getUser('user') || interaction.user;
    const guildId       = interaction.guildId;
    const userData      = getUser(guildId, target.id);
    const guildSettings = getGuild(guildId);
    const textRank      = getRank(guildId, target.id, 'text');
    const voiceRank     = getRank(guildId, target.id, 'voice');

    // Show highest text role as badge (voice roles shown separately if wanted)
    const topTextRole  = getRolesForLevel(guildId, userData.text_level,  'text',  false)[0];
    const topVoiceRole = getRolesForLevel(guildId, userData.voice_level, 'voice', false)[0];
    const roleBadge    = topTextRole?.role_name || topVoiceRole?.role_name || null;

    const buffer = await generateLevelCard({
      username:      target.username,
      discriminator: target.discriminator,
      avatarUrl:     target.displayAvatarURL({ extension: 'png', size: 256 }),
      textXp:        userData.text_xp,
      voiceXp:       userData.voice_xp,
      textLevel:     userData.text_level,
      voiceLevel:    userData.voice_level,
      textRank, voiceRank,
      guildSettings,
      roleBadge,
    });

    const attachment = new AttachmentBuilder(buffer, { name: 'level-card.png' });
    await interaction.editReply({ files: [attachment] });
  },
};
