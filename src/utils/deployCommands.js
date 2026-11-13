const { REST, Routes } = require('discord.js');
const path = require('path');
const fs   = require('fs');

async function deployCommands(clientId, token, guildId) {
  const commandsPath = path.join(__dirname, '../commands');
  const files = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

  const commands = files.map(file => {
    const cmd = require(path.join(commandsPath, file));
    return cmd.data.toJSON();
  });

  const rest = new REST({ version: '10' }).setToken(token);

  try {
    console.log(`🔄 Deploying ${commands.length} slash command(s)…`);

    if (guildId) {
      // Guild-scoped deploy (instant, good for dev)
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
      console.log(`✅ Deployed to guild ${guildId}`);
    } else {
      // Global deploy (up to 1 hour to propagate)
      await rest.put(Routes.applicationCommands(clientId), { body: commands });
      console.log('✅ Deployed globally (may take up to 1 hour to propagate)');
    }
  } catch (err) {
    console.error('❌ Failed to deploy commands:', err);
    throw err;
  }
}

module.exports = { deployCommands };
