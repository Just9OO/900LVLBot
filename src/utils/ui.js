'use strict';
/**
 * Shared look-and-feel helpers for embeds and interactive panels.
 */
const { EmbedBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { resolveTheme, toRgb } = require('./themes');

const EPHEMERAL = MessageFlags.Ephemeral;

/** The server's current theme. */
const themeOf = settings => resolveTheme(settings);

/** Embed accent colour = the server's primary theme colour. */
const accent = settings => resolveTheme(settings).primary;

/** An embed pre-styled with the server's theme and a consistent footer. */
function baseEmbed(settings, footer) {
  const t = resolveTheme(settings);
  const e = new EmbedBuilder().setColor(t.primary);
  e.setFooter({ text: footer ? `${footer}  ·  ${t.name} theme` : `${t.name} theme` });
  return e;
}

/** Text progress bar, e.g. ▰▰▰▱▱▱▱▱ */
function progressBar(fraction, length = 10) {
  const f = Math.max(0, Math.min(1, fraction));
  const filled = Math.round(f * length);
  return '▰'.repeat(filled) + '▱'.repeat(length - filled);
}

/** The nearest coloured-circle emoji for a hex colour: a tiny "swatch" for embeds. */
function dot(hex) {
  const { r, g, b } = toRgb(hex);
  const mx = Math.max(r, g, b) / 255, mn = Math.min(r, g, b) / 255;
  const l = (mx + mn) / 2, d = mx - mn;
  if (d < 0.12) return l < 0.3 ? '⚫' : '⚪';
  let h;
  const R = r / 255, G = g / 255, B = b / 255;
  if (mx === R) h = ((G - B) / d) % 6; else if (mx === G) h = (B - R) / d + 2; else h = (R - G) / d + 4;
  h = (h * 60 + 360) % 360;
  if (l < 0.28 && d < 0.35) return '⚫';
  if (h < 15 || h >= 340) return '🔴';
  if (h < 40) return l < 0.4 ? '🟤' : '🟠';
  if (h < 70) return '🟡';
  if (h < 165) return '🟢';
  if (h < 255) return '🔵';
  return '🟣';
}

/** Admin / Manage Server — the check used by every interactive admin control. */
function canManage(interaction) {
  const p = interaction.memberPermissions;
  return !!p && (p.has(PermissionFlagsBits.Administrator) || p.has(PermissionFlagsBits.ManageGuild));
}

const fmt = n => Number(n || 0).toLocaleString();

module.exports = { EPHEMERAL, themeOf, accent, baseEmbed, progressBar, dot, canManage, fmt };
