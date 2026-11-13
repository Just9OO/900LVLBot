const { voiceUsers, startTicker } = require('./voiceStateUpdate');

module.exports = {
  name: 'ready',
  once: true,

  execute(client) {
    console.log(`✅ Logged in as ${client.user.tag}`);
    console.log(`📡 Serving ${client.guilds.cache.size} guild(s)`);

    client.user.setPresence({
      activities: [{ name: '/level — track your XP!', type: 0 }],
      status: 'online',
    });

    // Pre-populate voice users for anyone already in a channel when bot starts
    for (const guild of client.guilds.cache.values()) {
      if (!voiceUsers.has(guild.id)) voiceUsers.set(guild.id, new Map());
      const guildMap = voiceUsers.get(guild.id);

      for (const [, channel] of guild.channels.cache) {
        if (!channel.isVoiceBased()) continue;
        for (const [, member] of channel.members) {
          if (member.user.bot) continue;
          // BUG FIX: was missing serverDeaf — deafened users were being tracked and earning XP
          if (!member.voice.selfMute && !member.voice.selfDeaf
            && !member.voice.serverMute && !member.voice.serverDeaf) {
            guildMap.set(member.id, Date.now());
          }
        }
      }
    }

    const totalVoice = [...voiceUsers.values()].reduce((s, m) => s + m.size, 0);
    if (totalVoice > 0) console.log(`🎙️ Tracking ${totalVoice} users already in voice channels`);

    // BUG FIX: ticker was never started — voice XP never awarded. Start it here.
    startTicker(client);
  },
};
