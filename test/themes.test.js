const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../src/utils/themes');

test('parseColor accepts the usual hex spellings and rejects junk', () => {
  assert.equal(T.parseColor('#ff5733'), '#FF5733');
  assert.equal(T.parseColor('ff5733'), '#FF5733');
  assert.equal(T.parseColor('#0af'), '#00AAFF');
  for (const bad of ['', '#12', '#12345', 'red', '#GGGGGG', null, undefined, 42]) assert.equal(T.parseColor(bad), null, String(bad));
});

test('every preset is complete, unique and readable', () => {
  const presets = T.listPresets();
  assert.ok(presets.length >= 16);
  assert.equal(new Set(presets.map(t => t.id)).size, presets.length, 'ids are unique');
  for (const t of presets) {
    assert.ok(T.STYLE_IDS.has(t.style), `${t.id} has a known style`);
    for (const k of ['bg', 'bg2', 'primary', 'secondary', 'text', 'muted', 'track']) assert.match(t[k], /^#[0-9A-F]{6}$/, `${t.id}.${k}`);
    assert.ok(T.contrast(t.primary, t.bg) >= 3, `${t.id} primary contrast`);
    assert.ok(T.contrast(t.secondary, t.bg) >= 3, `${t.id} secondary contrast`);
    assert.ok(T.contrast(t.text, t.bg) >= 7, `${t.id} text contrast`);
  }
});

test('custom themes stay readable no matter which three colors are chosen', () => {
  const nasty = [
    ['#336699', '#336699', '#336699'], ['#FFFFFF', '#FFFF00', '#FAFAFA'], ['#000000', '#000000', '#111111'],
    ['#808080', '#7F7F7F', '#FF00FF'], ['#FF0000', '#FF0000', '#00FF00'],
  ];
  for (const [bg, primary, secondary] of nasty) {
    const t = T.buildTheme({ id: 'x', name: 'x', bg, primary, secondary, style: 'sun' });
    assert.ok(T.contrast(t.primary, t.bg) >= 3, `${bg}/${primary} primary`);
    assert.ok(T.contrast(t.secondary, t.bg) >= 3, `${bg}/${secondary} secondary`);
    assert.ok(T.contrast(t.text, t.bg) >= 4.5, `${bg} text`);
  }
});

test('light backgrounds switch to dark text', () => {
  assert.equal(T.getPreset('daylight').isLight, true);
  assert.equal(T.getPreset('inferno').isLight, false);
  assert.ok(T.luminance(T.getPreset('daylight').text) < 0.1);
});

test('resolveTheme falls back safely', () => {
  assert.equal(T.resolveTheme(undefined).id, T.DEFAULT_THEME_ID);
  assert.equal(T.resolveTheme({ theme_id: 'does-not-exist' }).id, T.DEFAULT_THEME_ID);
  assert.equal(T.resolveTheme({ theme_id: 'ocean' }).id, 'ocean');
  assert.equal(T.resolveTheme({ theme_id: 'custom' }).id, T.DEFAULT_THEME_ID, 'custom selected but never saved');
  const custom = { theme_id: 'custom', custom_bg: '#101820', custom_primary: '#FF5733', custom_secondary: '#00AAFF', custom_style: 'grid', custom_name: 'Mine' };
  const t = T.resolveTheme(custom);
  assert.equal(t.id, 'custom'); assert.equal(t.name, 'Mine'); assert.equal(t.style, 'grid');
});

test('an unknown style never breaks a theme', () => {
  assert.equal(T.buildTheme({ id: 'x', name: 'x', bg: '#000', primary: '#fff', secondary: '#fff', style: 'nonsense' }).style, 'aurora');
});

test('listThemesFor appends the custom theme only when one is saved', () => {
  const presets = T.listPresets().length;
  assert.equal(T.listThemesFor({}).length, presets);
  assert.equal(T.listThemesFor({ custom_bg: '#000000', custom_primary: '#FFFFFF', custom_secondary: '#FF0000' }).length, presets + 1);
});

test('sanitizeName strips markdown and limits length', () => {
  assert.equal(T.sanitizeName('My *Cool* `Theme`'), 'My Cool Theme');
  assert.equal(T.sanitizeName('   '), 'Custom');
  assert.equal(T.sanitizeName('x'.repeat(100)).length, 24);
  assert.equal(T.sanitizeName('@everyone'), 'everyone');
});

test('randomPalette always produces three valid colors', () => {
  for (let i = 0; i < 200; i++) {
    const p = T.randomPalette();
    for (const k of ['bg', 'primary', 'secondary']) assert.match(p[k], /^#[0-9A-F]{6}$/);
    assert.ok(T.luminance(p.bg) < 0.1, 'random backgrounds are dark');
  }
});
