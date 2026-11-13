const {
  SlashCommandBuilder, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder,
} = require('discord.js');
const { getGuild, updateGuild } = require('../database/db');
const T = require('../utils/themes');
const { EPHEMERAL, canManage } = require('../utils/ui');
const { editorPayload, customBase, saveCustom, deleteCustom, parseColors } = require('../utils/themeUi');

const input = (id, label, value, placeholder, required = true) => {
  const field = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(TextInputStyle.Short)
    .setRequired(required).setMaxLength(id === 'name' ? 24 : 7).setPlaceholder(placeholder);
  if (value) field.setValue(String(value));
  return new ActionRowBuilder().addComponents(field);
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('custom-theme')
    .setDescription('Design your own card theme from three colors (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o => o.setName('background').setDescription('Card background, hex e.g. #0A0A0D'))
    .addStringOption(o => o.setName('primary').setDescription('Main accent: borders, text bar, big numbers, e.g. #E8381F'))
    .addStringOption(o => o.setName('secondary').setDescription('Second accent: voice bar and highlights, e.g. #FF8A3D'))
    .addStringOption(o =>
      o.setName('style').setDescription('Background artwork')
        .addChoices(...T.STYLES.map(s => ({ name: `${s.emoji} ${s.label} — ${s.description}`, value: s.id })))
    )
    .addStringOption(o => o.setName('name').setDescription('A name for your theme (max 24 characters)').setMaxLength(24)),

  async execute(interaction) {
    await interaction.deferReply({ flags: EPHEMERAL });

    const raw = {
      bg: interaction.options.getString('background'),
      primary: interaction.options.getString('primary'),
      secondary: interaction.options.getString('secondary'),
    };
    const style = interaction.options.getString('style');
    const name  = interaction.options.getString('name');

    const { values, errors } = parseColors(raw);
    if (errors.length) {
      return interaction.editReply({ content: `❌ ${errors.join('\n')}` });
    }

    const patch = { ...values };
    if (style) patch.style = style;
    if (name)  patch.name  = name;

    if (Object.keys(patch).length === 0) {
      return interaction.editReply(await editorPayload(interaction));
    }

    saveCustom(interaction.guildId, patch, true);
    await interaction.editReply(await editorPayload(interaction, '✅ Custom theme saved and applied.'));
  },

  // custom-theme:base · :style · :random · :apply · :delete · :edit
  async component(interaction) {
    if (!canManage(interaction)) {
      return interaction.reply({ content: '🔒 Only admins can edit the server theme.', flags: EPHEMERAL });
    }
    const action  = interaction.customId.split(':')[1];
    const guildId = interaction.guildId;

    if (action === 'edit') {
      const cur = customBase(getGuild(guildId));
      return interaction.showModal(
        new ModalBuilder().setCustomId('custom-theme:modal').setTitle('Custom theme')
          .addComponents(
            input('bg', 'Background color (hex)', cur.bg, '#0A0A0D'),
            input('primary', 'Primary color (hex)', cur.primary, '#E8381F'),
            input('secondary', 'Secondary color (hex)', cur.secondary, '#FF8A3D'),
            input('name', 'Theme name (optional)', T.hasCustom(getGuild(guildId)) ? cur.name : '', 'My Theme', false),
          )
      );
    }

    await interaction.deferUpdate();
    let notice = null;

    if (action === 'base') {
      const p = T.getPreset(interaction.values[0]);
      if (p) {
        saveCustom(guildId, { bg: p.bg, primary: p.primary, secondary: p.secondary, style: p.style });
        notice = `✅ Started from **${p.name}** — now tweak it.`;
      }
    } else if (action === 'style') {
      saveCustom(guildId, { style: interaction.values[0] });
      notice = '✅ Style updated.';
    } else if (action === 'random') {
      saveCustom(guildId, T.randomPalette());
      notice = '🎲 Fresh palette! Not feeling it? Roll again.';
    } else if (action === 'apply') {
      updateGuild(guildId, { theme_id: T.CUSTOM_ID });
      notice = '✅ Custom theme applied.';
    } else if (action === 'delete') {
      deleteCustom(guildId);
      notice = '🗑️ Custom theme deleted.';
    }

    return interaction.editReply(await editorPayload(interaction, notice));
  },

  async modal(interaction) {
    if (!canManage(interaction)) {
      return interaction.reply({ content: '🔒 Only admins can edit the server theme.', flags: EPHEMERAL });
    }
    const f = id => interaction.fields.getTextInputValue(id);
    const { values, errors } = parseColors({ bg: f('bg'), primary: f('primary'), secondary: f('secondary') });
    if (errors.length) {
      return interaction.reply({ content: `❌ ${errors.join('\n')}`, flags: EPHEMERAL });
    }

    const patch = { ...values };
    const name = f('name').trim();
    if (name) patch.name = name;
    saveCustom(interaction.guildId, patch, true);

    if (interaction.isFromMessage()) await interaction.deferUpdate();
    else await interaction.deferReply({ flags: EPHEMERAL });
    await interaction.editReply(await editorPayload(interaction, '✅ Colors saved and applied.'));
  },
};
