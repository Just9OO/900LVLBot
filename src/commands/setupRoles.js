const { accent, EPHEMERAL } = require('../utils/ui');
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { getGuild, getAllLevelRoles } = require('../database/db');
const { createDefaultRoles } = require('../utils/roleManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup-roles')
    .setDescription('Create the default level roles automatically (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(opt =>
      opt.setName('type')
        .setDescription('Which roles to set up')
        .setRequired(false)
        .addChoices(
          { name: '💬 Text roles',  value: 'text'  },
          { name: '🎙️ Voice roles', value: 'voice' },
          { name: '✨ Both',        value: 'both'  },
        )
    )
    .addStringOption(opt =>
      opt.setName('mode')
        .setDescription('Stack roles or only keep the highest one')
        .setRequired(false)
        .addChoices(
          { name: 'Stack all earned roles',   value: 'stack'  },
          { name: 'Only keep highest role',   value: 'single' },
        )
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: EPHEMERAL });

    const type     = interaction.options.getString('type') || 'both';
    const mode     = interaction.options.getString('mode');
    const guild    = interaction.guild;
    const settings = getGuild(guild.id);

    if (mode) {
      const { updateGuild } = require('../database/db');
      updateGuild(guild.id, { stack_roles: mode === 'stack' ? 1 : 0 });
    }

    const types = type === 'both' ? ['text', 'voice'] : [type];
    const lines = [];

    for (const t of types) {
      const created = await createDefaultRoles(guild, t);
      if (created.length) {
        lines.push(`**${t === 'voice' ? '🎙️ Voice' : '💬 Text'} roles created:**`);
        for (const { level, role } of created) {
          lines.push(`  Level ${level} → <@&${role.id}> (${role.name})`);
        }
      } else {
        lines.push(`**${t === 'voice' ? '🎙️ Voice' : '💬 Text'}:** All roles already configured — nothing new created.`);
      }
    }

    const embed = new EmbedBuilder()
      .setColor(accent(settings))
      .setTitle('✅ Level Roles Setup Complete')
      .setDescription(lines.join('\n') || 'Nothing to create.')
      .addFields({
        name: 'Role mode',
        value: settings.stack_roles ? 'Stacking — members keep all earned roles' : 'Single — only the highest role is kept',
      })
      .setFooter({ text: 'Use /manage-roles to customise individual levels' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
