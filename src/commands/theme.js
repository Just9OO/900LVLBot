const { SlashCommandBuilder } = require('discord.js');
const { getGuild, updateGuild } = require('../database/db');
const T = require('../utils/themes');
const { EPHEMERAL, canManage } = require('../utils/ui');
const { galleryPayload, editorPayload } = require('../utils/themeUi');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('theme')
    .setDescription('Browse the level card themes and preview them'),

  async execute(interaction) {
    await interaction.deferReply({ flags: EPHEMERAL });
    await interaction.editReply(await galleryPayload(interaction, 'all'));
  },

  // Buttons and the theme menu:  theme:go:<index|all> · theme:pick · theme:apply:<id> · theme:custom
  async component(interaction) {
    const [, action, arg] = interaction.customId.split(':');
    const guildId = interaction.guildId;
    const themes = () => T.listThemesFor(getGuild(guildId));

    if (action === 'go') {
      await interaction.deferUpdate();
      return interaction.editReply(await galleryPayload(interaction, arg));
    }

    if (action === 'pick') {
      await interaction.deferUpdate();
      const idx = Math.max(0, themes().findIndex(t => t.id === interaction.values[0]));
      return interaction.editReply(await galleryPayload(interaction, idx));
    }

    if (!canManage(interaction)) {
      return interaction.reply({ content: '🔒 Only admins can change the server theme.', flags: EPHEMERAL });
    }

    if (action === 'apply') {
      const list = themes();
      const idx = list.findIndex(t => t.id === arg);
      if (idx === -1) return interaction.reply({ content: '❌ That theme no longer exists.', flags: EPHEMERAL });
      updateGuild(guildId, { theme_id: arg });
      await interaction.deferUpdate();
      return interaction.editReply(await galleryPayload(interaction, idx, `✅ **${list[idx].name}** is now the server theme. Try \`/level\`!`));
    }

    if (action === 'custom') {
      await interaction.deferReply({ flags: EPHEMERAL });
      return interaction.editReply(await editorPayload(interaction));
    }
  },
};
