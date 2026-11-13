'use strict';
/**
 * Message builders for the theme gallery and the custom-theme editor.
 * Shared by /theme, /custom-theme and the /config panel.
 */
const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder, AttachmentBuilder, EmbedBuilder,
} = require('discord.js');
const { getGuild, updateGuild } = require('../database/db');
const T = require('./themes');
const { generateThemePreview, generateThemeSheet } = require('./cardRenderer');
const { dot, canManage } = require('./ui');

const styleOf = id => T.STYLES.find(s => s.id === id) || { emoji: '🎨', label: id };
const styleText = id => { const s = styleOf(id); return `${s.emoji} ${s.label}`; };

function paletteLines(t) {
  return [
    `${dot(t.bg)} Background  \`${t.bg}\``,
    `${dot(t.primary)} Primary  \`${t.primary}\``,
    `${dot(t.secondary)} Secondary  \`${t.secondary}\``,
  ].join('\n');
}

function themeOption(t, selected) {
  return new StringSelectMenuOptionBuilder()
    .setLabel(t.name).setValue(t.id)
    .setDescription((t.description || styleOf(t.style).label).slice(0, 100))
    .setEmoji(t.emoji)
    .setDefault(!!selected);
}

// ─── Gallery ─────────────────────────────────────────────────────────────────

/**
 * @param view 'all' for the overview sheet, or a theme index.
 */
async function galleryPayload(interaction, view = 'all', notice = null) {
  const settings = getGuild(interaction.guildId);
  const themes   = T.listThemesFor(settings);
  const active   = T.resolveTheme(settings);
  const manager  = canManage(interaction);

  const idx = view === 'all' ? -1 : Math.max(0, Math.min(themes.length - 1, Number(view) || 0));
  const embed = new EmbedBuilder();
  let file;

  if (idx === -1) {
    file = new AttachmentBuilder(await generateThemeSheet(settings), { name: 'themes.png' });
    embed.setColor(active.primary)
      .setTitle('🎨 Card Themes')
      .setDescription(
        `**${themes.length} themes** to choose from. Your server is using ${active.emoji} **${active.name}**.\n` +
        `Pick one from the menu to see it up close${manager ? ', then apply it with one click.' : '.'}`)
      .setImage('attachment://themes.png')
      .setFooter({ text: manager ? 'Want your own colors? Press Custom.' : 'Ask an admin to apply a theme.' });
  } else {
    const t = themes[idx];
    file = new AttachmentBuilder(await generateThemePreview(t), { name: 'preview.png' });
    embed.setColor(t.primary)
      .setTitle(`${t.emoji} ${t.name}`)
      .setDescription(t.description)
      .addFields(
        { name: 'Palette', value: paletteLines(t), inline: true },
        { name: 'Style',   value: styleText(t.style), inline: true },
        { name: 'Status',  value: t.id === active.id ? '✅ Active on this server' : 'Not active', inline: true },
      )
      .setImage('attachment://preview.png')
      .setFooter({ text: `Theme ${idx + 1} of ${themes.length}` });
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId('theme:pick')
    .setPlaceholder('Jump to a theme…')
    .addOptions(themes.map((t, i) => themeOption(t, i === idx)));

  const prev = idx <= 0 ? themes.length - 1 : idx - 1;
  const next = idx === -1 || idx >= themes.length - 1 ? 0 : idx + 1;
  const buttons = [
    new ButtonBuilder().setCustomId(`theme:go:${prev}`).setLabel('◀').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('theme:go:all').setLabel('Overview').setEmoji('🗂️').setStyle(ButtonStyle.Secondary).setDisabled(idx === -1),
    new ButtonBuilder().setCustomId(`theme:go:${next}`).setLabel('▶').setStyle(ButtonStyle.Secondary),
  ];
  if (manager) {
    if (idx >= 0) {
      const isActive = themes[idx].id === active.id;
      buttons.push(new ButtonBuilder().setCustomId(`theme:apply:${themes[idx].id}`)
        .setLabel(isActive ? 'Applied' : 'Apply theme').setEmoji(isActive ? '✅' : '🎯')
        .setStyle(ButtonStyle.Success).setDisabled(isActive));
    }
    buttons.push(new ButtonBuilder().setCustomId('theme:custom').setLabel('Custom').setEmoji('🎨').setStyle(ButtonStyle.Primary));
  }

  return {
    content: notice || null,
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(select), new ActionRowBuilder().addComponents(buttons)],
    files: [file],
    attachments: [],
  };
}

// ─── Custom theme: persistence ───────────────────────────────────────────────

function customBase(settings) {
  if (T.hasCustom(settings)) {
    return {
      bg: settings.custom_bg, primary: settings.custom_primary, secondary: settings.custom_secondary,
      style: settings.custom_style, name: settings.custom_name,
    };
  }
  const a = T.resolveTheme(settings);
  return { bg: a.bg, primary: a.primary, secondary: a.secondary, style: a.style, name: 'Custom' };
}

/** Merge `patch` into the saved custom theme and (by default) switch the server to it. */
function saveCustom(guildId, patch, activate = true) {
  const m = { ...customBase(getGuild(guildId)), ...patch };
  updateGuild(guildId, {
    custom_bg: m.bg, custom_primary: m.primary, custom_secondary: m.secondary,
    custom_style: T.STYLE_IDS.has(m.style) ? m.style : 'aurora',
    custom_name: T.sanitizeName(m.name),
    ...(activate ? { theme_id: T.CUSTOM_ID } : {}),
  });
}

/** Removes the custom theme and falls back to the default preset if it was active. */
function deleteCustom(guildId) {
  const s = getGuild(guildId);
  updateGuild(guildId, {
    custom_bg: null, custom_primary: null, custom_secondary: null,
    custom_style: 'aurora', custom_name: 'Custom',
    ...(s.theme_id === T.CUSTOM_ID ? { theme_id: T.DEFAULT_THEME_ID } : {}),
  });
}

/** Parses { bg, primary, secondary } hex strings. Returns { values, errors }. */
function parseColors(raw) {
  const labels = { bg: 'Background', primary: 'Primary', secondary: 'Secondary' };
  const values = {}, errors = [];
  for (const key of Object.keys(labels)) {
    if (raw[key] == null) continue;
    const c = T.parseColor(raw[key]);
    if (c) values[key] = c;
    else errors.push(`**${labels[key]}** \`${String(raw[key]).slice(0, 20)}\` isn't a valid hex color (try \`#FF5733\`).`);
  }
  return { values, errors };
}

// ─── Custom theme: editor message ────────────────────────────────────────────

async function editorPayload(interaction, notice = null) {
  const settings     = getGuild(interaction.guildId);
  const has          = T.hasCustom(settings);
  const active       = T.resolveTheme(settings);
  const customActive = has && settings.theme_id === T.CUSTOM_ID;
  const shown        = has ? T.customFromSettings(settings) : active;

  const raw = has
    ? { bg: settings.custom_bg, primary: settings.custom_primary, secondary: settings.custom_secondary }
    : { bg: shown.bg, primary: shown.primary, secondary: shown.secondary };

  const embed = new EmbedBuilder()
    .setColor(shown.primary)
    .setTitle('🎨 Custom Theme Editor')
    .setDescription(
      (has
        ? (customActive ? '✅ **Active** on your server.' : '⏸️ **Saved, but not active.** Press **Apply** to use it.')
        : `You haven't made a custom theme yet. The preview shows **${active.name}** as a starting point.`) +
      '\n\nPick **three colors** and a background style — everything else is worked out for you.')
    .addFields(
      { name: 'Palette', value: paletteLines({ bg: raw.bg, primary: raw.primary, secondary: raw.secondary }), inline: true },
      { name: 'Style',   value: styleText(shown.style), inline: true },
      { name: 'Name',    value: has ? shown.name : '—', inline: true },
    )
    .setImage('attachment://custom-preview.png')
    .setFooter({ text: 'Primary colors the text XP bar · Secondary colors the voice XP bar' });

  const adjusted = has && (shown.primary !== T.parseColor(raw.primary) || shown.secondary !== T.parseColor(raw.secondary));
  if (adjusted) {
    embed.addFields({
      name: '⚠️ Auto-adjusted',
      value: 'Some colors were lightened or darkened automatically so text stays readable on your background.',
    });
  }

  const file = new AttachmentBuilder(await generateThemePreview(shown), { name: 'custom-preview.png' });

  const base = new StringSelectMenuBuilder()
    .setCustomId('custom-theme:base')
    .setPlaceholder('Start from a preset…')
    .addOptions(T.listPresets().map(t => themeOption(t, false)));

  const style = new StringSelectMenuBuilder()
    .setCustomId('custom-theme:style')
    .setPlaceholder('Background style…')
    .addOptions(T.STYLES.map(s => new StringSelectMenuOptionBuilder()
      .setLabel(s.label).setValue(s.id).setDescription(s.description).setEmoji(s.emoji).setDefault(s.id === shown.style)));

  const buttons = [
    new ButtonBuilder().setCustomId('custom-theme:edit').setLabel('Edit colors').setEmoji('✏️').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('custom-theme:random').setLabel('Surprise me').setEmoji('🎲').setStyle(ButtonStyle.Secondary),
  ];
  if (has && !customActive) buttons.push(new ButtonBuilder().setCustomId('custom-theme:apply').setLabel('Apply').setEmoji('✅').setStyle(ButtonStyle.Success));
  if (has) buttons.push(new ButtonBuilder().setCustomId('custom-theme:delete').setLabel('Delete').setEmoji('🗑️').setStyle(ButtonStyle.Danger));

  return {
    content: notice || null,
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(base),
      new ActionRowBuilder().addComponents(style),
      new ActionRowBuilder().addComponents(buttons),
    ],
    files: [file],
    attachments: [],
  };
}

module.exports = {
  galleryPayload, editorPayload, customBase, saveCustom, deleteCustom, parseColors,
  styleText, paletteLines,
};
