const {
  SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
} = require('discord.js');
const { getGuild, getActiveBoost } = require('../database/db');
const { resolveTheme } = require('../utils/themes');
const { EPHEMERAL } = require('../utils/ui');

// One entry per help section. `admin: true` sections are only shown to admins.
const SECTIONS = [
  {
    id: 'member', emoji: '🌟', label: 'Everyday commands', description: 'Cards, rankings and stats',
    commands: [
      ['/level [user]', 'Your level card — text and voice XP, rank and role badge'],
      ['/leaderboard [type]', 'Top 10 members, with a Text / Voice toggle'],
      ['/stats', 'Server-wide XP statistics'],
      ['/theme', 'Browse every card theme with live previews'],
      ['/help', 'This menu'],
    ],
  },
  {
    id: 'config', emoji: '⚙️', label: 'Configuration', description: 'The control panel and quick settings', admin: true,
    commands: [
      ['/config', '**The control panel** — XP, level-ups, appearance and filters in one place'],
      ['/set-xp-rate', 'Multiplier, text range and voice XP'],
      ['/set-channel [channel]', 'Where level-ups are announced'],
      ['/ignore-channel <channel>', 'Toggle XP in a channel'],
      ['/no-xp-role <role>', 'Toggle XP for a role'],
    ],
  },
  {
    id: 'themes', emoji: '🎨', label: 'Themes', description: 'Apply a preset or build your own', admin: true,
    commands: [
      ['/set-theme <theme>', 'Apply any preset (search as you type)'],
      ['/custom-theme', 'Make your own: pick **3 colors** and a background style'],
      ['/theme', 'Gallery — admins can apply or customise right from it'],
    ],
  },
  {
    id: 'roles', emoji: '🎭', label: 'Activity roles', description: 'Roles that unlock at levels', admin: true,
    commands: [
      ['/setup-roles [type] [mode]', 'Auto-create the default level roles'],
      ['/manage-roles set <level> <role>', 'Assign a role to a level'],
      ['/manage-roles remove <level>', 'Remove a level role'],
      ['/manage-roles rename <level> <name>', 'Rename a level role'],
      ['/manage-roles list', 'See every configured role'],
      ['/sync-roles', 'Rebuild everyone\'s roles from their current level'],
    ],
  },
  {
    id: 'admin', emoji: '🛡️', label: 'XP tools & events', description: 'Boosts and manual adjustments', admin: true,
    commands: [
      ['/xp-boost start <duration> [multiplier] [label]', 'Start a server-wide boost event'],
      ['/xp-boost stop · status', 'Cancel or check the active boost'],
      ['/set-xp <user> <type> <level>', 'Force-set a level (syncs roles)'],
      ['/reset-user <user> <type>', 'Wipe a member\'s XP'],
    ],
  },
  { id: 'how', emoji: '💡', label: 'How XP works', description: 'Rates, cooldowns and the level curve', commands: [] },
];

const isAdmin = i => i.memberPermissions?.has(PermissionFlagsBits.Administrator);
const visible = i => SECTIONS.filter(s => !s.admin || isAdmin(i));

function payload(interaction, sectionId) {
  const settings = getGuild(interaction.guildId);
  const theme = resolveTheme(settings);
  const sections = visible(interaction);
  const section = sections.find(s => s.id === sectionId) || sections[0];

  const embed = new EmbedBuilder().setColor(theme.primary)
    .setAuthor({ name: `${interaction.guild.name} · Help`, iconURL: interaction.guild.iconURL() ?? undefined })
    .setTitle(`${section.emoji} ${section.label}`)
    .setFooter({ text: 'Use the menu to switch sections' });

  if (section.id === 'how') {
    const boost = getActiveBoost(interaction.guildId);
    embed.setDescription(
      [
        `**Text XP** — ${settings.text_xp_min}–${settings.text_xp_max} XP per message, one reward every ${settings.text_cooldown}s`,
        `**Voice XP** — +${settings.voice_xp_rate} XP per minute while unmuted and undeafened`,
        `**Multiplier** — ${settings.xp_multiplier}×${boost ? `  ·  ⚡ boost ${boost.multiplier}× ends <t:${Math.floor(boost.expires_at / 1000)}:R>` : ''}`,
        `**Roles** — ${settings.stack_roles ? 'you keep every role you earn' : 'only your highest role is kept'}`,
        '',
        'Levels follow an exponential curve, so each one takes a little more effort than the last.',
      ].join('\n'));
  } else {
    embed.setDescription(section.commands.map(([c, d]) => `**\`${c}\`**\n${d}`).join('\n\n'));
  }

  const select = new StringSelectMenuBuilder().setCustomId('help:section').setPlaceholder('Choose a section…')
    .addOptions(sections.map(s => new StringSelectMenuOptionBuilder()
      .setLabel(s.label).setValue(s.id).setDescription(s.description).setEmoji(s.emoji).setDefault(s.id === section.id)));

  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(select)] };
}

module.exports = {
  data: new SlashCommandBuilder().setName('help').setDescription('Show what the bot can do'),

  async execute(interaction) {
    await interaction.reply({ ...payload(interaction, 'member'), flags: EPHEMERAL });
  },

  async component(interaction) {
    await interaction.update(payload(interaction, interaction.values[0]));
  },
};
