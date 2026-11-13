const {
  SlashCommandBuilder, AttachmentBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');
const { getLeaderboard, getGuild } = require('../database/db');
const { generateLeaderboardCard } = require('../utils/cardRenderer');
const { resolveTheme } = require('../utils/themes');
const { EPHEMERAL } = require('../utils/ui');

/** Builds the leaderboard message. `ownerId` locks the Text/Voice buttons to whoever ran the command. */
async function build(interaction, type, ownerId) {
  const guildId  = interaction.guildId;
  const settings = getGuild(guildId);
  const theme    = resolveTheme(settings);
  const entries  = getLeaderboard(guildId, type);

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`leaderboard:text:${ownerId}`).setLabel('Text').setEmoji('💬')
      .setStyle(type === 'text' ? ButtonStyle.Primary : ButtonStyle.Secondary).setDisabled(type === 'text'),
    new ButtonBuilder().setCustomId(`leaderboard:voice:${ownerId}`).setLabel('Voice').setEmoji('🎙️')
      .setStyle(type === 'voice' ? ButtonStyle.Primary : ButtonStyle.Secondary).setDisabled(type === 'voice'),
  );

  if (entries.length === 0) {
    return {
      content: null, files: [], attachments: [], components: [buttons],
      embeds: [new EmbedBuilder().setColor(theme.primary).setTitle('Leaderboard is empty')
        .setDescription('No one has earned any XP yet — start chatting or jump in a voice channel!')],
    };
  }

  // One bulk request instead of ten serial member fetches.
  const memberMap = new Map();
  try {
    const fetched = await interaction.guild.members.fetch({ user: entries.map(e => e.user_id) });
    for (const [id, member] of fetched) memberMap.set(id, member);
  } catch { /* fall back to placeholder names */ }

  for (const entry of entries) {
    const member = memberMap.get(entry.user_id);
    entry.tag = member?.displayName || `User ${entry.user_id.slice(-4)}`;
    entry.avatarUrl = member?.user.displayAvatarURL({ extension: 'png', size: 64 });
  }

  const buffer = await generateLeaderboardCard(entries, type, theme);
  return {
    content: `**${type === 'voice' ? '🎙️ Voice' : '💬 Text'} Leaderboard** · all time`,
    embeds: [], components: [buttons], attachments: [],
    files: [new AttachmentBuilder(buffer, { name: 'leaderboard.png' })],
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('View the server leaderboard')
    .addStringOption(opt =>
      opt.setName('type').setDescription('Text or Voice (default: Text)').setRequired(false)
        .addChoices({ name: '💬 Text', value: 'text' }, { name: '🎙️ Voice', value: 'voice' })
    ),

  async execute(interaction) {
    await interaction.deferReply();
    const type = interaction.options.getString('type') || 'text';
    await interaction.editReply(await build(interaction, type, interaction.user.id));
  },

  // leaderboard:<text|voice>:<ownerId>
  async component(interaction) {
    const [, type, ownerId] = interaction.customId.split(':');
    if (interaction.user.id !== ownerId) {
      return interaction.reply({ content: 'Run `/leaderboard` yourself to flip through it.', flags: EPHEMERAL });
    }
    await interaction.deferUpdate();
    await interaction.editReply(await build(interaction, type === 'voice' ? 'voice' : 'text', ownerId));
  },
};
