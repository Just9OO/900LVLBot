const test = require('node:test');
const assert = require('node:assert/strict');
const { xpForLevel, totalXpForLevel, levelFromXp, xpInCurrentLevel, MAX_LEVEL } = require('../src/utils/xpMath');

test('level curve matches floor(100 * (n+1)^1.5)', () => {
  assert.equal(xpForLevel(0), 100);
  assert.equal(xpForLevel(1), Math.floor(100 * Math.pow(2, 1.5)));
});

test('levelFromXp inverts totalXpForLevel at every boundary', () => {
  for (let l = 0; l <= MAX_LEVEL; l++) {
    const t = totalXpForLevel(l);
    assert.equal(levelFromXp(t), l);
    if (t > 0) assert.equal(levelFromXp(t - 1), l - 1);
  }
});

test('xpInCurrentLevel is progress inside the level', () => {
  const t = totalXpForLevel(10);
  assert.equal(xpInCurrentLevel(t), 0);
  assert.equal(xpInCurrentLevel(t + 123), 123);
});
