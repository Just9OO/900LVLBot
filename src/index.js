require('dotenv').config();
const { Client, Collection, GatewayIntentBits, Partials } = require('discord.js');
const path = require('path');
const fs   = require('fs');
const { deployCommands } = require('./utils/deployCommands');

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;
if (!DISCORD_TOKEN) throw new Error('Missing DISCORD_TOKEN in .env');
if (!CLIENT_ID)     throw new Error('Missing CLIENT_ID in .env');

// ─── Client — minimal intents ─────────────────────────────────────────────────
// Only request what the bot actually needs. Every extra intent increases
// event volume and memory usage.
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Message, Partials.Channel],

  // Disable caching of data the bot doesn't need to hold in memory
  sweepers: {
    messages: {
      interval: 300,    // sweep every 5 minutes
      lifetime:  60,    // discard messages older than 1 minute
    },
    users: {
      interval: 3600,   // sweep every hour
      filter: () => user => !user.bot && user.id !== client.user?.id,
    },
  },
});

// ─── Load commands ────────────────────────────────────────────────────────────
client.commands = new Collection();
const commandsDir = path.join(__dirname, 'commands');

for (const file of fs.readdirSync(commandsDir).filter(f => f.endsWith('.js'))) {
  const command = require(path.join(commandsDir, file));
  if (!command.data || !command.execute) {
    console.warn(`[Commands] Skipping ${file} — missing data or execute`);
    continue;
  }
  client.commands.set(command.data.name, command);
}
console.log(`✅ Loaded ${client.commands.size} commands`);

// ─── Load events ──────────────────────────────────────────────────────────────
const eventsDir = path.join(__dirname, 'events');
for (const file of fs.readdirSync(eventsDir).filter(f => f.endsWith('.js'))) {
  const event = require(path.join(eventsDir, file));
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args, client));
  } else {
    client.on(event.name, (...args) => event.execute(...args, client));
  }
}

// ─── Memory leak prevention ───────────────────────────────────────────────────
// Clear the cooldown map of entries older than 11 minutes every 10 minutes.
// Without this it grows unbounded on busy servers.
const { cooldownMap } = require('./database/db');
setInterval(() => {
  const cutoff = Date.now() - 660_000; // must outlive the longest configurable cooldown (600s)
  for (const [key, ts] of cooldownMap) {
    if (ts < cutoff) cooldownMap.delete(key);
  }
}, 10 * 60 * 1000);

// ─── Graceful shutdown ────────────────────────────────────────────────────────
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

function shutdown(signal) {
  console.log(`\n[${signal}] Shutting down…`);
  client.destroy();
  process.exit(0);
}

process.on('unhandledRejection', err => {
  console.error('[UnhandledRejection]', err);
});

// ─── Deploy then login ────────────────────────────────────────────────────────
(async () => {
  try {
    await deployCommands(CLIENT_ID, DISCORD_TOKEN, GUILD_ID || null);
  } catch (err) {
    console.error('Command deploy failed — continuing anyway:', err.message);
  }
  await client.login(DISCORD_TOKEN);
})();
