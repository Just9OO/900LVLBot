const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getGuild, updateGuild } = require('../database/db');
const T = require('../utils/themes');
const { EPHEMERAL } = require('../utils/ui');
const { galleryPayload } = require('../utils/themeUi');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('set-theme')
    .setDescription('Apply a card theme to the whole server (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o =>
      o.setName('theme').setDescription('Start typing to search the themes').setRequired(true).setAutocomplete(true)
    ),

  async autocomplete(interaction) {
    const q = interaction.options.getFocused().toLowerCase();
    const themes = T.listThemesFor(getGuild(interaction.guildId));
    await interaction.respond(
      themes
        .filter(t => t.name.toLowerCase().includes(q) || t.id.includes(q))
        .slice(0, 25)
        .map(t => ({ name: `${t.emoji} ${t.name}${t.id === 'custom' ? ' (yours)' : ''}`, value: t.id }))
    );
  },

  async execute(interaction) {
    const id = interaction.options.getString('theme');
    const themes = T.listThemesFor(getGuild(interaction.guildId));
    const idx = themes.findIndex(t => t.id === id);

    if (idx === -1) {
      return interaction.reply({
        content: '❌ I don\'t know that theme. Pick one from the list, or browse them with `/theme`.',
        flags: EPHEMERAL,
      });
    }

    await interaction.deferReply({ flags: EPHEMERAL });
    updateGuild(interaction.guildId, { theme_id: id });
    await interaction.editReply(await galleryPayload(interaction, idx, `✅ **${themes[idx].name}** is now the server theme.`));
  },
};
