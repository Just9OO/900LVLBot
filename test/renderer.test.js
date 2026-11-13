const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../src/utils/themes');
const R = require('../src/utils/cardRenderer');

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const isPng = b => Buffer.isBuffer(b) && b.subarray(0, 4).equals(PNG);

test('every preset renders level, level-up and leaderboard cards', async () => {
  const entries = Array.from({ length: 3 }, (_, i) => ({
    user_id: String(i), tag: `User ${i}`, text_xp: 5000 - i * 900, text_level: 10 - i, voice_xp: 800, voice_level: 3,
  }));
  for (const theme of T.listPresets()) {
    assert.ok(isPng(await R.generateThemePreview(theme)), `${theme.id} level card`);
    assert.ok(isPng(await R.generateLevelUpCard({ username: 'Nyx', type: 'voice', textXp: 100, voiceXp: 100, textLevel: 1, voiceLevel: 1, theme })), `${theme.id} level-up`);
    assert.ok(isPng(await R.generateLeaderboardCard(entries, 'text', theme)), `${theme.id} leaderboard`);
  }
});

test('the gallery sheet renders, with and without a custom theme', async () => {
  assert.ok(isPng(await R.generateThemeSheet({ theme_id: 'inferno' })));
  assert.ok(isPng(await R.generateThemeSheet({ theme_id: 'custom', custom_bg: '#101820', custom_primary: '#FF5733', custom_secondary: '#00AAFF', custom_style: 'hex' })));
});

test('very long names and a missing avatar do not break the level card', async () => {
  const buf = await R.generateLevelCard({
    username: 'A'.repeat(80), avatarUrl: null, textXp: 0, voiceXp: 0, textLevel: 0, voiceLevel: 0,
    textRank: 1, voiceRank: 1, guildSettings: { theme_id: 'matrix' }, roleBadge: '🔥 Elite Member Of The Year',
  });
  assert.ok(isPng(buf));
});
