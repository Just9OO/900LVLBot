'use strict';
/**
 * XP curve — pure maths, no database. Lives in its own module so the card
 * renderer (and tests) can use it without opening SQLite.
 *
 * XP needed to go from level n → n+1 is floor(100 · (n+1)^1.5).
 * Cumulative thresholds are pre-computed once; lookups are O(log n).
 */

const MAX_LEVEL = 100;
const XP_TABLE  = new Array(MAX_LEVEL + 2); // XP_TABLE[n] = total XP needed to reach level n
XP_TABLE[0] = 0;
for (let i = 1; i <= MAX_LEVEL + 1; i++) {
  XP_TABLE[i] = XP_TABLE[i - 1] + Math.floor(100 * Math.pow(i, 1.5));
}

/** XP required to go from `level` to `level + 1`. */
function xpForLevel(level) {
  return Math.floor(100 * Math.pow(level + 1, 1.5));
}

/** Total XP at which `level` is reached. */
function totalXpForLevel(level) {
  return XP_TABLE[Math.min(level, MAX_LEVEL)];
}

/** Level for a total XP amount (binary search). */
function levelFromXp(xp) {
  let lo = 0, hi = MAX_LEVEL;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (XP_TABLE[mid] <= xp) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** XP earned inside the current level. */
function xpInCurrentLevel(xp) {
  return xp - XP_TABLE[levelFromXp(xp)];
}

module.exports = { MAX_LEVEL, XP_TABLE, xpForLevel, totalXpForLevel, levelFromXp, xpInCurrentLevel };
