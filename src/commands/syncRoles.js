const { accent, EPHEMERAL } = require('../utils/ui');
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { getGuild, db } = require('../database/db');
const { syncMemberRoles } = require('../utils/roleManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sync-roles')
    .setDescription('Resyncs level roles for everyone in the server (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ flags: EPHEMERAL });

    const guild    = interaction.guild;
    const settings = getGuild(guild.id);
    const stackRoles = !!settings.stack_roles;

    const rows = db.prepare(`SELECT * FROM users WHERE guild_id = ?`).all(guild.id);
    if (!rows.length) {
      return interaction.editReply({ content: 'No users tracked yet — nothing to sync.' });
    }

    let synced = 0, failed = 0;

    for (const row of rows) {
      try {
        const member = await guild.members.fetch(row.user_id).catch(() => null);
        if (!member) continue;
        await syncMemberRoles(guild, member, row.text_level, row.voice_level, stackRoles);
        synced++;
      } catch {
        failed++;
      }
    }

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(accent(settings))
          .setTitle('✅ Role Sync Complete')
          .addFields(
            { name: 'Synced', value: `${synced}`, inline: true },
            { name: 'Skipped / Failed', value: `${failed}`, inline: true },
          )
          .setTimestamp(),
      ],
    });
  },
};
