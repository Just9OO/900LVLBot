'use strict';
/**
 * Theme engine — pure logic, no Discord or canvas imports (so it is unit-testable).
 *
 * A theme is deliberately tiny: THREE colours plus a background style.
 *
 *   bg         – the card background
 *   primary    – borders, text-XP bar, big numbers, accents
 *   secondary  – voice-XP bar, gradients, highlights
 *   style      – which background artwork the renderer paints (see STYLES)
 *
 * Everything else (text colour, muted text, bar track, gradient partner,
 * light/dark mode) is derived, and the accent colours are nudged until they
 * are readable on the background. That is what makes admin-chosen custom
 * themes safe: no matter which three colours they pick, the card stays legible.
 */

// ─── Colour maths ────────────────────────────────────────────────────────────

/** Accepts "#abc", "abc", "#aabbcc", "aabbcc". Returns "#RRGGBB" or null. */
function parseColor(input) {
  if (typeof input !== 'string') return null;
  let h = input.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(h)) h = h.split('').map(c => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  return '#' + h.toUpperCase();
}

function toRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function toHex({ r, g, b }) {
  const c = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return ('#' + c(r) + c(g) + c(b)).toUpperCase();
}

/** Linear blend: t = 0 → a, t = 1 → b. */
function mix(a, b, t) {
  const A = toRgb(a), B = toRgb(b);
  return toHex({ r: A.r + (B.r - A.r) * t, g: A.g + (B.g - A.g) * t, b: A.b + (B.b - A.b) * t });
}

/** WCAG relative luminance, 0 (black) … 1 (white). */
function luminance(hex) {
  const { r, g, b } = toRgb(hex);
  const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** WCAG contrast ratio, 1 … 21. */
function contrast(a, b) {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Pushes `color` away from `bg` (towards white on dark, black on light) until it reads. */
function ensureContrast(color, bg, min = 3) {
  const toward = contrast('#FFFFFF', bg) >= contrast('#000000', bg) ? '#FFFFFF' : '#000000';
  let out = color;
  for (let i = 0; i < 12 && contrast(out, bg) < min; i++) out = mix(out, toward, 0.14);
  return out;
}

function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return toHex({ r: f(0) * 255, g: f(8) * 255, b: f(4) * 255 });
}

// ─── Background styles ───────────────────────────────────────────────────────
// The artwork itself lives in cardRenderer.js; this is the catalogue.

const STYLES = [
  { id: 'sun',      emoji: '🌅', label: 'Sun',       description: 'Rings, slashes and embers' },
  { id: 'grid',     emoji: '🌆', label: 'Grid',      description: 'Retro perspective horizon' },
  { id: 'waves',    emoji: '🌊', label: 'Waves',     description: 'Layered flowing waves' },
  { id: 'stars',    emoji: '🌌', label: 'Stars',     description: 'Starfield with a planet' },
  { id: 'hex',      emoji: '🐝',  label: 'Hex',       description: 'Honeycomb mesh' },
  { id: 'aurora',   emoji: '🌠', label: 'Aurora',    description: 'Soft glowing light blobs' },
  { id: 'diagonal', emoji: '🏁', label: 'Stripes',   description: 'Bold diagonal stripes' },
  { id: 'dots',     emoji: '🔴', label: 'Halftone',  description: 'Retro halftone dots' },
  { id: 'rain',     emoji: '🟩', label: 'Code rain', description: 'Falling code streaks' },
  { id: 'petals',   emoji: '🌸', label: 'Petals',    description: 'Drifting petals' },
  { id: 'rings',    emoji: '🎯', label: 'Rings',     description: 'Concentric radar rings' },
  { id: 'minimal',  emoji: '▫️', label: 'Minimal',   description: 'Clean and flat' },
];
const STYLE_IDS = new Set(STYLES.map(s => s.id));

// ─── Presets ─────────────────────────────────────────────────────────────────

const PRESET_DEFS = [
  { id: 'inferno',   name: 'Inferno',   emoji: '🔥', description: 'Black and blazing red. The classic.',   bg: '#0A0A0D', primary: '#E8381F', secondary: '#FF8A3D', style: 'sun' },
  { id: 'sunset',    name: 'Sunset',    emoji: '🌇', description: 'Hot orange melting into magenta.',      bg: '#1A0B14', primary: '#FF6B3D', secondary: '#FF2E7E', style: 'dots' },
  { id: 'midnight',  name: 'Midnight',  emoji: '🌌', description: 'Deep navy sky, electric blue stars.',   bg: '#0B1020', primary: '#5B8CFF', secondary: '#9B7BFF', style: 'stars' },
  { id: 'ocean',     name: 'Ocean',     emoji: '🌊', description: 'Cool teal tides.',                      bg: '#041B2D', primary: '#19C3D6', secondary: '#3A86FF', style: 'waves' },
  { id: 'synthwave', name: 'Synthwave', emoji: '🌆', description: '80s neon grid and a cyan glow.',        bg: '#12062B', primary: '#FF2E97', secondary: '#22D3EE', style: 'grid' },
  { id: 'toxic',     name: 'Toxic',     emoji: '☢️', description: 'Radioactive green honeycomb.',          bg: '#060D08', primary: '#39FF6A', secondary: '#B6FF3B', style: 'hex' },
  { id: 'cyberpunk', name: 'Cyberpunk', emoji: '🤖', description: 'Hazard yellow with cyan accents.',      bg: '#0D0D14', primary: '#FCEE09', secondary: '#00F0FF', style: 'diagonal' },
  { id: 'sakura',    name: 'Sakura',    emoji: '🌸', description: 'Soft pink petals on dark plum.',        bg: '#1B0F1A', primary: '#FF7EB6', secondary: '#FFC4DD', style: 'petals' },
  { id: 'royal',     name: 'Royal',     emoji: '👑', description: 'Black and gold, for the elite.',        bg: '#0C0A06', primary: '#F5C542', secondary: '#FF9F1C', style: 'sun' },
  { id: 'aurora',    name: 'Aurora',    emoji: '🌠', description: 'Northern lights in mint and violet.',   bg: '#07121A', primary: '#3DF5A5', secondary: '#8B5CF6', style: 'aurora' },
  { id: 'frost',     name: 'Frost',     emoji: '❄️', description: 'Icy blue radar rings.',                 bg: '#0A1822', primary: '#8FD3FF', secondary: '#D6F1FF', style: 'rings' },
  { id: 'amethyst',  name: 'Amethyst',  emoji: '🔮', description: 'Rich purple with a pink flare.',        bg: '#12071F', primary: '#B26BFF', secondary: '#FF6BD6', style: 'rings' },
  { id: 'matrix',    name: 'Matrix',    emoji: '🟩', description: 'Falling green code.',                   bg: '#000A03', primary: '#00FF41', secondary: '#12B34A', style: 'rain' },
  { id: 'mocha',     name: 'Mocha',     emoji: '☕', description: 'Warm coffee and cream.',                bg: '#1A120D', primary: '#E0A96D', secondary: '#C48A55', style: 'waves' },
  { id: 'carbon',    name: 'Carbon',    emoji: '⚫', description: 'Understated monochrome.',               bg: '#0F0F11', primary: '#E4E4E7', secondary: '#8A8A93', style: 'minimal' },
  { id: 'classic',   name: 'Classic',   emoji: '💙', description: 'Familiar blurple on charcoal.',         bg: '#23272A', primary: '#5865F2', secondary: '#57F287', style: 'minimal' },
  { id: 'daylight',  name: 'Daylight',  emoji: '☀️', description: 'A light theme for the bright side.',    bg: '#F6F4EF', primary: '#3B5BDB', secondary: '#F08C00', style: 'aurora' },
];

const DEFAULT_THEME_ID = 'inferno';
const CUSTOM_ID = 'custom';

const LIGHT_TEXT = '#F4F4F5';
const DARK_TEXT  = '#16161A';

/** Turns the three colours + style into a full, render-ready theme. */
function buildTheme(def) {
  const bg        = parseColor(def.bg)        || '#0A0A0D';
  // Whichever of near-black / near-white text reads better on this background.
  const isLight   = contrast(DARK_TEXT, bg) > contrast(LIGHT_TEXT, bg);
  const primary   = ensureContrast(parseColor(def.primary)   || '#E8381F', bg, 3);
  const secondary = ensureContrast(parseColor(def.secondary) || '#FF8A3D', bg, 3);
  const text      = isLight ? DARK_TEXT : LIGHT_TEXT;

  return {
    id: def.id,
    name: def.name,
    emoji: def.emoji || '🎨',
    description: def.description || '',
    style: STYLE_IDS.has(def.style) ? def.style : 'aurora',
    isLight,
    bg,
    bg2:     mix(bg, primary, isLight ? 0.10 : 0.12), // gradient partner, used for depth
    primary,
    secondary,
    text,
    muted:   mix(text, bg, 0.42),
    track:   mix(bg, text, isLight ? 0.12 : 0.10),    // empty part of progress bars
  };
}

const PRESETS = new Map(PRESET_DEFS.map(d => [d.id, buildTheme(d)]));

function listPresets() { return [...PRESETS.values()]; }
function getPreset(id)  { return PRESETS.get(id) || null; }

/** True when the guild has a complete custom theme saved. */
function hasCustom(settings) {
  return !!(settings && settings.custom_bg && settings.custom_primary && settings.custom_secondary);
}

function customFromSettings(settings) {
  return buildTheme({
    id: CUSTOM_ID,
    name: settings.custom_name || 'Custom',
    emoji: '🎨',
    description: 'Your server\'s own palette.',
    bg: settings.custom_bg,
    primary: settings.custom_primary,
    secondary: settings.custom_secondary,
    style: settings.custom_style,
  });
}

/** The theme a guild is currently using. Never throws, always returns a theme. */
function resolveTheme(settings) {
  if (settings && settings.theme_id === CUSTOM_ID && hasCustom(settings)) return customFromSettings(settings);
  return PRESETS.get(settings && settings.theme_id) || PRESETS.get(DEFAULT_THEME_ID);
}

/** Every theme a guild can pick from: all presets, plus its custom one if saved. */
function listThemesFor(settings) {
  const list = listPresets();
  if (hasCustom(settings)) list.push(customFromSettings(settings));
  return list;
}

function sanitizeName(name) {
  const cleaned = String(name || '').replace(/[\u0000-\u001f`*_~|<>@#\\]/g, '').trim().slice(0, 24);
  return cleaned || 'Custom';
}

/** A tasteful random palette, for the "Surprise me" button. */
function randomPalette(rand = Math.random) {
  const h = Math.floor(rand() * 360);
  const split = rand() < 0.5 ? 30 + rand() * 30 : 150 + rand() * 60; // analogous or near-complementary
  return {
    bg:        hslToHex(h, 35 + rand() * 25, 5 + rand() * 4),
    primary:   hslToHex(h + (rand() * 24 - 12), 80 + rand() * 15, 56 + rand() * 8),
    secondary: hslToHex(h + split, 75 + rand() * 20, 58 + rand() * 8),
  };
}

module.exports = {
  STYLES, STYLE_IDS, DEFAULT_THEME_ID, CUSTOM_ID,
  parseColor, toRgb, toHex, mix, luminance, contrast, ensureContrast, hslToHex,
  buildTheme, listPresets, getPreset, hasCustom, customFromSettings,
  resolveTheme, listThemesFor, sanitizeName, randomPalette,
};
