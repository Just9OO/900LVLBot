const {
  SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ChannelSelectMenuBuilder, RoleSelectMenuBuilder,
  ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle, AttachmentBuilder, EmbedBuilder,
} = require('discord.js');
const { getGuild, updateGuild, getAllLevelRoles, getActiveBoost } = require('../database/db');
const { totalXpForLevel } = require('../utils/xpMath');
const T = require('../utils/themes');
const { EPHEMERAL, canManage, fmt } = require('../utils/ui');
const { generateThemePreview } = require('../utils/cardRenderer');
const { galleryPayload, editorPayload, styleText } = require('../utils/themeUi');
const { renderTemplate, DEFAULT_TEMPLATE, MAX_TEMPLATE_LENGTH, PLACEHOLDERS } = require('../utils/levelUp');

const DEFAULTS = { xp_multiplier: 1.0, text_xp_min: 15, text_xp_max: 25, voice_xp_rate: 10, text_cooldown: 60 };

const PAGES = [
  { id: 'overview',   label: 'Overview',          emoji: '🏠', description: 'Everything at a glance' },
  { id: 'xp',         label: 'XP & Rates',        emoji: '⚡', description: 'Rates, cooldown and role stacking' },
  { id: 'announce',   label: 'Level-up Messages', emoji: '📣', description: 'Channel, style and message text' },
  { id: 'appearance', label: 'Appearance',        emoji: '🎨', description: 'Card themes and custom colors' },
  { id: 'filters',    label: 'Filters',           emoji: '🚫', description: 'Channels and roles that earn no XP' },
];

const MODES = {
  card:  { label: '🖼️ Card + message',  description: 'A themed level-up card with your message' },
  embed: { label: '📝 Embed',            description: 'A themed embed, no image (lightest on resources)' },
  text:  { label: '💬 Plain text',       description: 'Just the message' },
  off:   { label: '🔕 Off',              description: 'No level-up announcements' },
};

// Which page each action belongs to, so the panel re-renders where the admin was.
const ACTION_PAGE = {
  stack: 'xp', resetrates: 'xp',
  channel: 'announce', clearchan: 'announce', mode: 'announce', resetmsg: 'announce',
  theme: 'appearance',
  ignored: 'filters', noxp: 'filters',
};

const row = (...components) => new ActionRowBuilder().addComponents(...components);
const list = (items, max = 12) => items.length
  ? items.slice(0, max).join(' ') + (items.length > max ? ` …+${items.length - max}` : '')
  : '*None*';

// ─── Panel ───────────────────────────────────────────────────────────────────

async function panel(interaction, page = 'overview', notice = null) {
  const guild = interaction.guild;
  const s = getGuild(guild.id);
  const t = T.resolveTheme(s);
  const meta = PAGES.find(p => p.id === page) || PAGES[0];

  const embed = new EmbedBuilder()
    .setColor(t.primary)
    .setAuthor({ name: `${guild.name} · Configuration`, iconURL: guild.iconURL() ?? undefined })
    .setTitle(`${meta.emoji} ${meta.label}`)
    .setFooter({ text: 'Changes apply instantly' });

  const nav = new StringSelectMenuBuilder()
    .setCustomId('config:page').setPlaceholder('Jump to a section…')
    .addOptions(PAGES.map(p => new StringSelectMenuOptionBuilder()
      .setLabel(p.label).setValue(p.id).setDescription(p.description).setEmoji(p.emoji).setDefault(p.id === page)));

  const components = [];
  let file = null;

  const channel = s.levelup_channel ? `<#${s.levelup_channel}>` : '*Where it happens*';
  const mode = MODES[s.levelup_mode] || MODES.card;
  const boost = getActiveBoost(guild.id);

  if (page === 'overview') {
    const roles = getAllLevelRoles(guild.id);
    embed.setThumbnail(guild.iconURL() ?? null)
      .setDescription('Use the menu below to jump between sections.')
      .addFields(
        { name: '⚡ XP', inline: true, value:
          `Multiplier **${s.xp_multiplier}×**${boost ? `  🚀 *${boost.multiplier}× boost*` : ''}\n` +
          `Text **${s.text_xp_min}–${s.text_xp_max}** XP every **${s.text_cooldown}s**\nVoice **${s.voice_xp_rate}** XP/min` },
        { name: '📣 Level-ups', inline: true, value: `${mode.label}\nChannel: ${channel}` },
        { name: '🎨 Appearance', inline: true, value: `${t.emoji} **${t.name}**\n${styleText(t.style)}` },
        { name: '🎭 Roles', inline: true, value:
          `💬 ${roles.filter(r => r.type === 'text').length} text · 🎙️ ${roles.filter(r => r.type === 'voice').length} voice\n` +
          `Stacking **${s.stack_roles ? 'on' : 'off'}**` },
        { name: '🚫 Filters', inline: true, value: `${s._ignoredChannels.size} ignored channel(s)\n${s._noXpRoles.size} no-XP role(s)` },
        { name: '​', value: '​', inline: true },
      );
    components.push(row(nav));
  }

  if (page === 'xp') {
    embed.setDescription('How fast members level up.')
      .addFields(
        { name: 'Rates', inline: true, value:
          `Multiplier **${s.xp_multiplier}×**\nText **${s.text_xp_min}–${s.text_xp_max}** XP / message\n` +
          `Voice **${s.voice_xp_rate}** XP / minute\nCooldown **${s.text_cooldown}s**` },
        { name: 'XP needed (total)', inline: true, value:
          [5, 10, 25, 50, 75].map(l => `Level **${l}** → ${fmt(totalXpForLevel(l))}`).join('\n') },
        { name: 'Roles', inline: true, value: s.stack_roles ? 'Stacking: members **keep** every role they earn.' : 'Single: members only keep their **highest** role.' },
      );
    if (boost) embed.addFields({ name: '🚀 Boost active', value: `**${boost.multiplier}×** until <t:${Math.floor(boost.expires_at / 1000)}:R> — it replaces the multiplier while it lasts.` });
    components.push(row(nav), row(
      new ButtonBuilder().setCustomId('config:rates').setLabel('Edit rates').setEmoji('✏️').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('config:stack').setLabel(`Role stacking: ${s.stack_roles ? 'ON' : 'OFF'}`).setEmoji('🎭')
        .setStyle(s.stack_roles ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('config:resetrates').setLabel('Reset rates').setEmoji('♻️').setStyle(ButtonStyle.Danger),
    ));
  }

  if (page === 'announce') {
    const template = s.levelup_message || DEFAULT_TEMPLATE;
    const preview = renderTemplate(template, {
      user: '@Nyx', username: 'Nyx', level: '24', type: '💬 Text', role: 'Veteran', server: guild.name,
    });
    embed.setDescription('What happens when someone levels up.')
      .addFields(
        { name: 'Style', inline: true, value: `**${mode.label}**\n${mode.description}` },
        { name: 'Channel', inline: true, value: s.levelup_channel ? channel : 'Where it happens\n*(voice level-ups are sent by DM)*' },
        { name: 'Message', value: '```\n' + template.slice(0, 300) + '\n```' },
        { name: 'Preview', value: preview.slice(0, 500) },
        { name: 'Placeholders', value: Object.entries(PLACEHOLDERS).map(([k, v]) => `\`${k}\` ${v}`).join('\n') },
      );

    const chan = new ChannelSelectMenuBuilder()
      .setCustomId('config:channel').setPlaceholder('Pick the level-up channel…')
      .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setMinValues(1).setMaxValues(1);
    if (s.levelup_channel && guild.channels.cache.has(s.levelup_channel)) chan.setDefaultChannels(s.levelup_channel);

    const modeSel = new StringSelectMenuBuilder()
      .setCustomId('config:mode').setPlaceholder('Announcement style…')
      .addOptions(Object.entries(MODES).map(([id, m]) => new StringSelectMenuOptionBuilder()
        .setLabel(m.label.replace(/^\S+\s/, '')).setEmoji(m.label.split(' ')[0]).setValue(id).setDescription(m.description).setDefault(id === (s.levelup_mode || 'card'))));

    components.push(row(nav), row(chan), row(modeSel), row(
      new ButtonBuilder().setCustomId('config:message').setLabel('Edit message').setEmoji('✏️').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('config:resetmsg').setLabel('Default message').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('config:clearchan').setLabel('Post where it happens').setEmoji('📍').setStyle(ButtonStyle.Secondary).setDisabled(!s.levelup_channel),
    ));
  }

  if (page === 'appearance') {
    const themes = T.listThemesFor(s);
    file = new AttachmentBuilder(await generateThemePreview(t), { name: 'preview.png' });
    embed.setColor(t.primary)
      .setDescription(`Using ${t.emoji} **${t.name}** — ${t.description}\n${themes.length} themes available.`)
      .addFields(
        { name: 'Style', value: styleText(t.style), inline: true },
        { name: 'Colors', value: `\`${t.bg}\` \`${t.primary}\` \`${t.secondary}\``, inline: true },
      )
      .setImage('attachment://preview.png');

    const sel = new StringSelectMenuBuilder().setCustomId('config:theme').setPlaceholder('Change theme…')
      .addOptions(themes.map(th => new StringSelectMenuOptionBuilder()
        .setLabel(th.name).setValue(th.id).setEmoji(th.emoji)
        .setDescription((th.description || '').slice(0, 100) || styleText(th.style).slice(0, 100)).setDefault(th.id === t.id)));
    components.push(row(nav), row(sel), row(
      new ButtonBuilder().setCustomId('config:gallery').setLabel('Browse gallery').setEmoji('🗂️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('config:custom').setLabel('Custom theme').setEmoji('🎨').setStyle(ButtonStyle.Primary),
    ));
  }

  if (page === 'filters') {
    const chans = [...s._ignoredChannels].filter(id => guild.channels.cache.has(id));
    const roles = [...s._noXpRoles].filter(id => guild.roles.cache.has(id));
    embed.setDescription('Channels and roles that **don\'t** earn XP. Choose from the menus — the selection replaces the current list.')
      .addFields(
        { name: `🔇 Ignored channels (${chans.length})`, value: list(chans.map(id => `<#${id}>`)) },
        { name: `🚫 No-XP roles (${roles.length})`, value: list(roles.map(id => `<@&${id}>`)) },
      );

    const chanSel = new ChannelSelectMenuBuilder()
      .setCustomId('config:ignored').setPlaceholder('Channels that earn no XP…')
      .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setMinValues(0).setMaxValues(25);
    if (chans.length) chanSel.setDefaultChannels(chans.slice(0, 25));
    const roleSel = new RoleSelectMenuBuilder()
      .setCustomId('config:noxp').setPlaceholder('Roles that earn no XP…').setMinValues(0).setMaxValues(25);
    if (roles.length) roleSel.setDefaultRoles(roles.slice(0, 25));
    components.push(row(nav), row(chanSel), row(roleSel));
  }

  const payload = { content: notice || null, embeds: [embed], components, attachments: [] };
  if (file) payload.files = [file];
  return payload;
}

// ─── Modals ──────────────────────────────────────────────────────────────────

const field = (id, label, value, placeholder, style = TextInputStyle.Short, max = 8) => {
  const f = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(true).setMaxLength(max).setPlaceholder(placeholder);
  if (value !== undefined && value !== null && value !== '') f.setValue(String(value));
  return row(f);
};

function ratesModal(s) {
  return new ModalBuilder().setCustomId('config:rates').setTitle('Edit XP rates').addComponents(
    field('mult',   'XP multiplier (0.1 – 10)',        s.xp_multiplier,  '1.0'),
    field('tmin',   'Text XP per message — minimum',   s.text_xp_min,    '15'),
    field('tmax',   'Text XP per message — maximum',   s.text_xp_max,    '25'),
    field('voice',  'Voice XP per minute',             s.voice_xp_rate,  '10'),
    field('cool',   'Text cooldown in seconds (5–600)', s.text_cooldown, '60'),
  );
}

function messageModal(s) {
  return new ModalBuilder().setCustomId('config:message').setTitle('Level-up message').addComponents(
    field('template', 'Message (use {user}, {level}, {role}…)',
      s.levelup_message || DEFAULT_TEMPLATE, DEFAULT_TEMPLATE, TextInputStyle.Paragraph, MAX_TEMPLATE_LENGTH),
  );
}

function parseRates(f) {
  const num = id => Number(String(f(id)).trim().replace(',', '.'));
  const v = { xp_multiplier: num('mult'), text_xp_min: num('tmin'), text_xp_max: num('tmax'), voice_xp_rate: num('voice'), text_cooldown: num('cool') };
  const errors = [];
  const bad = (k, lo, hi, int) => !Number.isFinite(v[k]) || v[k] < lo || v[k] > hi || (int && !Number.isInteger(v[k]));
  if (bad('xp_multiplier', 0.1, 10, false))  errors.push('**Multiplier** must be between 0.1 and 10.');
  if (bad('text_xp_min', 1, 500, true))      errors.push('**Text minimum** must be a whole number from 1 to 500.');
  if (bad('text_xp_max', 1, 500, true))      errors.push('**Text maximum** must be a whole number from 1 to 500.');
  if (bad('voice_xp_rate', 1, 500, true))    errors.push('**Voice XP** must be a whole number from 1 to 500.');
  if (bad('text_cooldown', 5, 600, true))    errors.push('**Cooldown** must be a whole number of seconds from 5 to 600.');
  if (!errors.length && v.text_xp_min > v.text_xp_max) errors.push(`**Text minimum** (${v.text_xp_min}) can't be higher than the maximum (${v.text_xp_max}).`);
  return { values: v, errors };
}

// ─── Command ─────────────────────────────────────────────────────────────────

module.exports = {
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('Open the server configuration panel (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ flags: EPHEMERAL });
    await interaction.editReply(await panel(interaction, 'overview'));
  },

  async component(interaction) {
    if (!canManage(interaction)) {
      return interaction.reply({ content: '🔒 You need the **Manage Server** permission to change settings.', flags: EPHEMERAL });
    }
    const action  = interaction.customId.split(':')[1];
    const guildId = interaction.guildId;
    const s       = getGuild(guildId);

    // These open another message or a modal instead of editing the panel.
    if (action === 'rates')   return interaction.showModal(ratesModal(s));
    if (action === 'message') return interaction.showModal(messageModal(s));
    if (action === 'custom')  { await interaction.deferReply({ flags: EPHEMERAL }); return interaction.editReply(await editorPayload(interaction)); }
    if (action === 'gallery') { await interaction.deferReply({ flags: EPHEMERAL }); return interaction.editReply(await galleryPayload(interaction, 'all')); }

    await interaction.deferUpdate();
    let page = ACTION_PAGE[action] || 'overview';
    let notice = null;

    switch (action) {
      case 'page':
        page = PAGES.some(p => p.id === interaction.values[0]) ? interaction.values[0] : 'overview';
        break;
      case 'stack':
        updateGuild(guildId, { stack_roles: s.stack_roles ? 0 : 1 });
        notice = `🎭 Role stacking **${s.stack_roles ? 'off' : 'on'}**. Run \`/sync-roles\` to apply it to existing members.`;
        break;
      case 'resetrates':
        updateGuild(guildId, DEFAULTS);
        notice = '♻️ XP rates reset to defaults.';
        break;
      case 'channel':
        updateGuild(guildId, { levelup_channel: interaction.values[0] });
        notice = `📣 Level-ups will be posted in <#${interaction.values[0]}>.`;
        break;
      case 'clearchan':
        updateGuild(guildId, { levelup_channel: null });
        notice = '📍 Level-ups will be posted where they happen.';
        break;
      case 'mode':
        if (MODES[interaction.values[0]]) {
          updateGuild(guildId, { levelup_mode: interaction.values[0] });
          notice = `✅ Level-up style: **${MODES[interaction.values[0]].label}**.`;
        }
        break;
      case 'resetmsg':
        updateGuild(guildId, { levelup_message: null });
        notice = '↩️ Level-up message reset to the default.';
        break;
      case 'theme': {
        const t = T.listThemesFor(s).find(th => th.id === interaction.values[0]);
        if (t) { updateGuild(guildId, { theme_id: t.id }); notice = `🎨 Theme set to **${t.name}**.`; }
        break;
      }
      case 'ignored':
        updateGuild(guildId, { ignored_channels: JSON.stringify(interaction.values) });
        notice = `🔇 ${interaction.values.length} channel(s) now earn no XP.`;
        break;
      case 'noxp':
        updateGuild(guildId, { no_xp_roles: JSON.stringify(interaction.values) });
        notice = `🚫 ${interaction.values.length} role(s) now earn no XP.`;
        break;
    }

    return interaction.editReply(await panel(interaction, page, notice));
  },

  async modal(interaction) {
    if (!canManage(interaction)) {
      return interaction.reply({ content: '🔒 You need the **Manage Server** permission to change settings.', flags: EPHEMERAL });
    }
    const action = interaction.customId.split(':')[1];
    const f = id => interaction.fields.getTextInputValue(id);
    let page, notice;

    if (action === 'rates') {
      const { values, errors } = parseRates(f);
      if (errors.length) return interaction.reply({ content: `❌ ${errors.join('\n')}`, flags: EPHEMERAL });
      updateGuild(interaction.guildId, values);
      page = 'xp'; notice = '✅ XP rates updated.';
    } else if (action === 'message') {
      const template = f('template').trim();
      if (!template) return interaction.reply({ content: '❌ The message can\'t be empty.', flags: EPHEMERAL });
      updateGuild(interaction.guildId, { levelup_message: template === DEFAULT_TEMPLATE ? null : template.slice(0, MAX_TEMPLATE_LENGTH) });
      page = 'announce'; notice = '✅ Level-up message saved.';
    } else {
      return;
    }

    if (interaction.isFromMessage()) await interaction.deferUpdate();
    else await interaction.deferReply({ flags: EPHEMERAL });
    await interaction.editReply(await panel(interaction, page, notice));
  },
};
