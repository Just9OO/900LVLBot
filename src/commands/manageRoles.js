const { accent, EPHEMERAL } = require('../utils/ui');
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { getGuild, setLevelRole, removeLevelRole, getAllLevelRoles } = require('../database/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('manage-roles')
    .setDescription('Add, change, or remove level roles (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub.setName('set')
        .setDescription('Assign an existing role to a level milestone')
        .addIntegerOption(o => o.setName('level').setDescription('Level that triggers this role').setMinValue(1).setMaxValue(100).setRequired(true))
        .addRoleOption(o => o.setName('role').setDescription('Role to assign').setRequired(true))
        .addStringOption(o =>
          o.setName('type').setDescription('Text or voice XP').setRequired(false)
            .addChoices({ name: '💬 Text', value: 'text' }, { name: '🎙️ Voice', value: 'voice' })
        )
    )
    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('Remove a level role milestone')
        .addIntegerOption(o => o.setName('level').setDescription('Level to remove').setMinValue(1).setMaxValue(100).setRequired(true))
        .addStringOption(o =>
          o.setName('type').setDescription('Text or voice').setRequired(false)
            .addChoices({ name: '💬 Text', value: 'text' }, { name: '🎙️ Voice', value: 'voice' })
        )
    )
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('Show all configured level roles')
    )
    .addSubcommand(sub =>
      sub.setName('rename')
        .setDescription('Rename a role the bot created (changes the actual Discord role name)')
        .addIntegerOption(o => o.setName('level').setDescription('Level whose role to rename').setMinValue(1).setMaxValue(100).setRequired(true))
        .addStringOption(o => o.setName('name').setDescription('New role name').setRequired(true))
        .addStringOption(o =>
          o.setName('type').setDescription('Text or voice').setRequired(false)
            .addChoices({ name: '💬 Text', value: 'text' }, { name: '🎙️ Voice', value: 'voice' })
        )
    ),

  async execute(interaction) {
    const sub     = interaction.options.getSubcommand();
    const guild   = interaction.guild;
    const guildId = guild.id;
    const settings = getGuild(guildId);
    const color    = accent(settings);

    // ── set ──────────────────────────────────────────────────────────────────
    if (sub === 'set') {
      const level  = interaction.options.getInteger('level');
      const role   = interaction.options.getRole('role');
      const type   = interaction.options.getString('type') || 'text';

      setLevelRole(guildId, level, role.id, role.name, type);

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(color)
            .setTitle('✅ Level Role Set')
            .setDescription(`${type === 'voice' ? '🎙️ Voice' : '💬 Text'} **Level ${level}** → <@&${role.id}>`),
        ],
        flags: EPHEMERAL,
      });
    }

    // ── remove ────────────────────────────────────────────────────────────────
    if (sub === 'remove') {
      const level = interaction.options.getInteger('level');
      const type  = interaction.options.getString('type') || 'text';

      removeLevelRole(guildId, level, type);

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(color)
            .setTitle('🗑️ Level Role Removed')
            .setDescription(`Removed the ${type} role milestone at level ${level}.`),
        ],
        flags: EPHEMERAL,
      });
    }

    // ── list ──────────────────────────────────────────────────────────────────
    if (sub === 'list') {
      const all   = getAllLevelRoles(guildId);
      const text  = all.filter(r => r.type === 'text');
      const voice = all.filter(r => r.type === 'voice');

      const fmt = (rows) => rows.length
        ? rows.map(r => `Level **${r.level}** → ${r.role_id ? `<@&${r.role_id}>` : `*${r.role_name}* (role not yet created)`}`).join('\n')
        : '*None configured*';

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(color)
            .setTitle('🎭 Configured Level Roles')
            .addFields(
              { name: '💬 Text Roles',   value: fmt(text),  inline: false },
              { name: '🎙️ Voice Roles',  value: fmt(voice), inline: false },
            )
            .setFooter({ text: 'Use /manage-roles set to add or change a role' }),
        ],
        flags: EPHEMERAL,
      });
    }

    // ── rename ────────────────────────────────────────────────────────────────
    if (sub === 'rename') {
      const level   = interaction.options.getInteger('level');
      const newName = interaction.options.getString('name');
      const type    = interaction.options.getString('type') || 'text';

      const all     = getAllLevelRoles(guildId);
      const entry   = all.find(r => r.level === level && r.type === type);

      if (!entry) {
        return interaction.reply({ content: `❌ No ${type} role configured at level ${level}.`, flags: EPHEMERAL });
      }

      setLevelRole(guildId, level, entry.role_id, newName, type);

      // Also rename the actual Discord role if we have an ID
      if (entry.role_id) {
        const discordRole = guild.roles.cache.get(entry.role_id);
        if (discordRole) {
          await discordRole.setName(newName, 'Level bot: admin renamed').catch(() => {});
        }
      }

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(color)
            .setTitle('✏️ Role Renamed')
            .setDescription(`${type === 'voice' ? '🎙️ Voice' : '💬 Text'} level ${level} role renamed to **${newName}**.`),
        ],
        flags: EPHEMERAL,
      });
    }
  },
};
