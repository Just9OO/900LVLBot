const { EPHEMERAL } = require('../utils/ui');

/**
 * Routes every interaction to the command that owns it.
 *
 * Interactive components and modals carry a customId of the form
 * "<command-name>:<action>[:<args>]" — the first segment picks the command,
 * which then handles the rest in its `component()` / `modal()` function.
 */
module.exports = {
  name: 'interactionCreate',

  async execute(interaction, client) {
    try {
      if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return console.warn(`[Commands] Unknown command: ${interaction.commandName}`);
        if (!interaction.guildId) {
          return interaction.reply({ content: 'These commands only work inside a server.', flags: EPHEMERAL });
        }
        return await command.execute(interaction, client);
      }

      if (interaction.isAutocomplete()) {
        const command = client.commands.get(interaction.commandName);
        return await command?.autocomplete?.(interaction, client);
      }

      const isComponent = interaction.isMessageComponent();
      if (isComponent || interaction.isModalSubmit()) {
        const handler = client.commands.get(interaction.customId.split(':')[0])?.[isComponent ? 'component' : 'modal'];
        if (!handler) {
          // Stale buttons from a removed feature: tell the user instead of showing "interaction failed".
          return interaction.reply({ content: '⌛ That control has expired. Please run the command again.', flags: EPHEMERAL });
        }
        if (!interaction.guildId) return;
        return await handler(interaction, client);
      }
    } catch (err) {
      const name = interaction.commandName || interaction.customId || 'interaction';
      console.error(`[Interactions] Error in ${name}:`, err);
      if (interaction.isAutocomplete?.()) return;
      const msg = { content: '❌ Something went wrong. Please try again.', flags: EPHEMERAL };
      if (interaction.replied || interaction.deferred) await interaction.followUp(msg).catch(() => {});
      else await interaction.reply(msg).catch(() => {});
    }
  },
};
