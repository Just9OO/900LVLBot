'use strict';
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');
const { xpForLevel, xpInCurrentLevel, totalXpForLevel } = require('./xpMath');
const { resolveTheme, mix, ensureContrast, listThemesFor } = require('./themes');

// Fonts are optional. Anton-Regular.ttf ships in assets/fonts for the big
// condensed display look. Drop Montserrat-Bold/Regular.ttf in there too for a
// nicer body font. Without them the cards fall back to Impact / Arial.
const FONT_DIR = path.join(__dirname, '../../assets/fonts');
for (const [file, name] of [
  ['Anton-Regular.ttf',      'Anton'],
  ['Montserrat-Bold.ttf',    'Montserrat'],
  ['Montserrat-Regular.ttf', 'Montserrat'],
]) {
  try { GlobalFonts.registerFromPath(path.join(FONT_DIR, file), name); } catch { /* optional */ }
}

const DISPLAY = 'Anton, Impact, "Arial Narrow", "DejaVu Sans Condensed", Arial, sans-serif';
const BODY    = 'Montserrat, "Segoe UI", Arial, sans-serif';

const W = 900;

// ─── Small helpers ───────────────────────────────────────────────────────────

function roundRect(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Deterministic PRNG so a theme's artwork is identical on every render. */
function rng(seedStr) {
  let h = 2166136261;
  for (const ch of seedStr) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Horizontal gradient that fades a colour in from left to right. */
function hFade(ctx, x0, x1, color, a0, a1) {
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, rgba(color, a0));
  g.addColorStop(1, rgba(color, a1));
  return g;
}

// Letter-spaced text (works on every canvas build). align: left | center | right
function drawSpaced(ctx, text, x, y, spacing, align = 'left') {
  const chars = [...text];
  const widths = chars.map(ch => ctx.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * Math.max(0, chars.length - 1);
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  const prev = ctx.textAlign;
  ctx.textAlign = 'left';
  chars.forEach((ch, i) => { ctx.fillText(ch, cx, y); cx += widths[i] + spacing; });
  ctx.textAlign = prev;
  return total;
}
function spacedWidth(ctx, text, spacing) {
  const chars = [...text];
  return chars.reduce((a, ch) => a + ctx.measureText(ch).width, 0) + spacing * Math.max(0, chars.length - 1);
}
function fitFont(ctx, text, maxW, startSize, minSize, family, weight = '', spacing = 0) {
  let size = startSize;
  for (; size > minSize; size -= 2) {
    ctx.font = `${weight} ${size}px ${family}`.trim();
    if (spacedWidth(ctx, text, spacing) <= maxW) break;
  }
  ctx.font = `${weight} ${size}px ${family}`.trim();
  return size;
}
function truncateSpaced(ctx, text, maxW, spacing) {
  if (spacedWidth(ctx, text, spacing) <= maxW) return text;
  let t = text;
  while (t.length > 1 && spacedWidth(ctx, t + '…', spacing) > maxW) t = t.slice(0, -1);
  return t + '…';
}

/** Role names often start with an emoji, which many servers can't render on a canvas. */
function cleanBadge(text) {
  const s = String(text).replace(/[\p{Extended_Pictographic}‍️]/gu, '').replace(/\s+/g, ' ').trim();
  return s || String(text);
}

// ─── Background artwork ──────────────────────────────────────────────────────
// Every painter receives (ctx, w, h, theme) and draws inside the clipped card.
// Artwork stays mostly on the right so the left (avatar + text) stays clean.

const PAINTERS = {
  // Concentric sun, slashes and embers — the original look.
  sun(ctx, w, h, t) {
    const cx = w - 139, cy = h / 2;
    ctx.beginPath(); ctx.arc(cx, cy, 205, 0, Math.PI * 2);
    ctx.fillStyle = rgba(t.primary, 0.03); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = rgba(t.primary, 0.30); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, 170, 0, Math.PI * 2);
    ctx.fillStyle = rgba(t.primary, 0.19); ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, 120, 0, Math.PI * 2);
    ctx.fillStyle = rgba(t.secondary, 0.26); ctx.fill();

    const slash = (sx, sw, color) => {
      ctx.save();
      ctx.translate(sx, h / 2 + 10);
      ctx.rotate((18 * Math.PI) / 180);
      ctx.fillStyle = color;
      ctx.fillRect(-sw / 2, -Math.max(200, h * 0.75), sw, Math.max(400, h * 1.5));
      ctx.restore();
    };
    slash(524, 8, t.primary);
    slash(547.5, 3, mix(t.primary, t.bg, 0.5));

    const dy = (Math.min(h, 400) - 260) / 2 + (h > 400 ? (h - 400) / 2 : 0);
    for (const [ex, ey, er, ea] of [
      [612.5, 38.5, 2.5, 1], [844, 62, 2, 0.7], [690, 248, 3, 0.8],
      [869.5, 189.5, 1.5, 1], [582, 172, 2, 0.6], [813.5, 23.5, 1.5, 0.8],
    ]) {
      ctx.beginPath(); ctx.arc(ex, ey + dy, er, 0, Math.PI * 2);
      ctx.fillStyle = rgba(t.secondary, ea); ctx.fill();
    }
  },

  // Retro perspective floor with a striped sun on the horizon.
  grid(ctx, w, h, t) {
    const hy = Math.round(h * 0.62), vx = w * 0.70;
    const r = Math.min(104, h * 0.36);

    ctx.save();
    ctx.beginPath(); ctx.arc(vx, hy, r, Math.PI, 0); ctx.closePath(); ctx.clip();
    const sg = ctx.createLinearGradient(0, hy - r, 0, hy);
    sg.addColorStop(0, rgba(t.secondary, 0.55));
    sg.addColorStop(1, rgba(t.primary, 0.30));
    ctx.fillStyle = sg; ctx.fillRect(vx - r, hy - r, r * 2, r);
    ctx.fillStyle = t.bg;                       // slice the sun into bands
    for (let k = 1; k <= 5; k++) ctx.fillRect(vx - r, hy - k * (r / 6.2), r * 2, k * 0.9);
    ctx.restore();

    const gl = hFade(ctx, w * 0.30, w * 0.80, t.primary, 0, 0.6);
    ctx.strokeStyle = gl; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, hy); ctx.lineTo(w, hy); ctx.stroke();
    ctx.lineWidth = 1;
    for (let i = -16; i <= 16; i++) {
      ctx.beginPath(); ctx.moveTo(vx + i * 16, hy); ctx.lineTo(vx + i * 125, h); ctx.stroke();
    }
    for (let k = 1; k <= 8; k++) {
      const y = hy + (h - hy) * Math.pow(k / 8, 2);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
  },

  // Layered sine waves that rise towards the right.
  waves(ctx, w, h, t) {
    for (let k = 0; k < 4; k++) {
      const base = h * (0.46 + k * 0.14), amp = 9 + k * 4, f = 0.013 - k * 0.0012, ph = k * 1.7;
      const color = k % 2 ? t.secondary : t.primary;
      const y = x => base + amp * Math.sin(x * f + ph) + amp * 0.5 * Math.sin(x * f * 2.3 + ph * 1.3);

      ctx.beginPath(); ctx.moveTo(0, h);
      for (let x = 0; x <= w + 6; x += 6) ctx.lineTo(x, y(x));
      ctx.lineTo(w, h); ctx.closePath();
      const g = ctx.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, rgba(color, 0.0));
      g.addColorStop(0.45, rgba(color, 0.04 + k * 0.02));
      g.addColorStop(1, rgba(color, 0.15 + k * 0.03));
      ctx.fillStyle = g; ctx.fill();

      ctx.beginPath();
      for (let x = 0; x <= w + 6; x += 6) (x === 0 ? ctx.moveTo(0, y(0)) : ctx.lineTo(x, y(x)));
      ctx.strokeStyle = hFade(ctx, w * 0.25, w, color, 0, 0.55);
      ctx.lineWidth = 1.5; ctx.stroke();
    }
  },

  // Starfield, sparkles and a ringed planet.
  stars(ctx, w, h, t) {
    const r = rng('stars');
    const star = mix(t.text, t.secondary, 0.35);
    for (let i = 0; i < 95; i++) {
      const x = w * (0.28 + 0.72 * r()), y = r() * h, s = 0.5 + r() * 1.3;
      ctx.beginPath(); ctx.arc(x, y, s, 0, Math.PI * 2);
      ctx.fillStyle = rgba(star, 0.25 + 0.6 * r()); ctx.fill();
    }
    const sparkle = (x, y, s, a) => {
      ctx.save(); ctx.translate(x, y);
      ctx.beginPath();
      ctx.moveTo(0, -s); ctx.quadraticCurveTo(0, 0, s, 0); ctx.quadraticCurveTo(0, 0, 0, s);
      ctx.quadraticCurveTo(0, 0, -s, 0); ctx.quadraticCurveTo(0, 0, 0, -s);
      ctx.fillStyle = rgba(t.secondary, a); ctx.fill(); ctx.restore();
    };
    sparkle(w * 0.62, h * 0.20, 9, 0.85); sparkle(w * 0.93, h * 0.82, 7, 0.7);
    sparkle(w * 0.55, h * 0.78, 5, 0.6);  sparkle(w * 0.97, h * 0.16, 6, 0.8);

    const cx = w - 139, cy = h / 2, pr = 66, rot = -0.35;
    ctx.beginPath(); ctx.ellipse(cx, cy, 120, 26, rot, Math.PI, Math.PI * 2);
    ctx.strokeStyle = rgba(t.secondary, 0.45); ctx.lineWidth = 3; ctx.stroke();
    const pg = ctx.createRadialGradient(cx - 20, cy - 24, 6, cx, cy, pr);
    pg.addColorStop(0, rgba(t.secondary, 0.55)); pg.addColorStop(1, rgba(t.primary, 0.12));
    ctx.beginPath(); ctx.arc(cx, cy, pr, 0, Math.PI * 2); ctx.fillStyle = pg; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = rgba(t.primary, 0.4); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(cx, cy, 120, 26, rot, 0, Math.PI);
    ctx.strokeStyle = rgba(t.secondary, 0.7); ctx.lineWidth = 3; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(cx, cy, 142, 32, rot, 0, Math.PI);
    ctx.strokeStyle = rgba(t.primary, 0.3); ctx.lineWidth = 1.5; ctx.stroke();
  },

  // Honeycomb mesh that fades in from the left.
  hex(ctx, w, h, t) {
    const r = 27, hw = r * 1.5, hh = Math.sqrt(3) * r, rand = rng('hex');
    const hexPath = (x, y) => {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i;
        (i === 0 ? ctx.moveTo : ctx.lineTo).call(ctx, x + r * Math.cos(a), y + r * Math.sin(a));
      }
      ctx.closePath();
    };
    ctx.lineWidth = 1.2;
    for (let col = 0; col * hw < w + r; col++) {
      const x = col * hw;
      if (x < w * 0.38) continue;
      const fade = Math.min(1, (x - w * 0.38) / (w * 0.4));
      for (let row = -1; row * hh < h + hh; row++) {
        const y = row * hh + (col % 2 ? hh / 2 : 0);
        hexPath(x, y);
        if (rand() < 0.14) { ctx.fillStyle = rgba(rand() < 0.5 ? t.primary : t.secondary, 0.10 + 0.18 * fade); ctx.fill(); }
        ctx.strokeStyle = rgba(t.primary, 0.08 + 0.32 * fade); ctx.stroke();
      }
    }
  },

  // Big soft glows plus faint light ribbons.
  aurora(ctx, w, h, t) {
    const blob = (x, y, r, color, a) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, rgba(color, a)); g.addColorStop(1, rgba(color, 0));
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    };
    const s = Math.max(h, 260);
    blob(w * 0.86, h * 0.18, s * 1.05, t.primary, 0.32);
    blob(w * 0.58, h * 0.95, s * 0.95, t.secondary, 0.26);
    blob(w * 1.00, h * 0.92, s * 0.80, t.primary, 0.20);
    ctx.save(); ctx.rotate(-0.32);
    for (const [x, y, rw, a, c] of [[330, 250, 380, 0.05, t.primary], [420, 300, 300, 0.05, t.secondary], [520, 340, 260, 0.04, t.primary]]) {
      ctx.fillStyle = rgba(c, a); ctx.fillRect(x, y, rw, 10);
    }
    ctx.restore();
  },

  // Bold racing stripes plus a hazard band along the bottom.
  diagonal(ctx, w, h, t) {
    const bar = (sx, sw, color) => {
      ctx.save(); ctx.translate(sx, h / 2); ctx.rotate((20 * Math.PI) / 180);
      ctx.fillStyle = color; ctx.fillRect(-sw / 2, -Math.max(220, h), sw, Math.max(440, h * 2)); ctx.restore();
    };
    bar(585, 34, rgba(t.primary, 0.14));
    bar(626, 10, rgba(t.secondary, 0.35));
    bar(644, 4, rgba(t.primary, 0.6));
    ctx.fillStyle = rgba(t.primary, 0.92);
    for (let x = -20; x < w + 20; x += 30) {
      ctx.beginPath();
      ctx.moveTo(x, h); ctx.lineTo(x + 14, h); ctx.lineTo(x + 26, h - 12); ctx.lineTo(x + 12, h - 12);
      ctx.closePath(); ctx.fill();
    }
  },

  // Halftone dots that swell towards the right.
  dots(ctx, w, h, t) {
    const gap = 18;
    for (let x = gap / 2; x < w; x += gap) {
      const fx = Math.max(0, (x - w * 0.34) / (w * 0.66));
      if (fx <= 0) continue;
      for (let y = gap / 2 + ((Math.round(x / gap) % 2) ? gap / 2 : 0); y < h; y += gap) {
        const fy = 1 - Math.min(1, Math.abs(y - h / 2) / Math.max(h * 0.62, 150)) * 0.55;
        const r = 6.2 * fx * fx * fy;
        if (r < 0.7) continue;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = rgba(((x + y) % 4 < 2) ? t.primary : t.secondary, 0.30 + 0.30 * fx);
        ctx.fill();
      }
    }
  },

  // Falling code streaks.
  rain(ctx, w, h, t) {
    const rand = rng('rain');
    for (let x = w * 0.36; x < w; x += 15) {
      const fade = Math.min(1, (x - w * 0.36) / (w * 0.3));
      const len = 4 + Math.floor(rand() * 11), top = rand() * h * 0.9 - 40;
      for (let i = 0; i < len; i++) {
        const y = top + i * 13, head = i === len - 1;
        ctx.fillStyle = head ? rgba(mix(t.secondary, '#FFFFFF', 0.55), 0.95 * fade)
                             : rgba(i % 3 ? t.primary : t.secondary, (0.08 + 0.5 * (i / len)) * fade);
        ctx.fillRect(x, y, 6, 9);
      }
    }
  },

  // Drifting petals.
  petals(ctx, w, h, t) {
    const rand = rng('petals');
    const petal = (x, y, s, rot, color, a) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.bezierCurveTo(s * 0.95, -s * 0.55, s * 0.9, s * 0.55, 0, s);
      ctx.bezierCurveTo(-s * 0.9, s * 0.55, -s * 0.95, -s * 0.55, 0, -s);
      ctx.fillStyle = rgba(color, a); ctx.fill(); ctx.restore();
    };
    for (let i = 0; i < 20; i++) {
      const x = w * (0.42 + 0.6 * rand()), y = rand() * h, s = 9 + rand() * 18;
      petal(x, y, s, rand() * Math.PI * 2, rand() < 0.6 ? t.primary : t.secondary, 0.14 + rand() * 0.30);
    }
    for (const [x, y, s, c] of [[w - 150, h / 2, 62, t.primary], [w - 250, h * 0.28, 24, t.secondary], [w - 70, h * 0.78, 28, t.secondary]]) {
      petal(x, y, s, -0.5, c, 0.30);
    }
  },

  // Radar rings with a sweeping wedge.
  rings(ctx, w, h, t) {
    const cx = w - 139, cy = h / 2, rand = rng('rings');
    ctx.lineWidth = 1.5;
    [48, 92, 136, 180, 224].forEach((r, i) => {
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = rgba(t.primary, 0.38 - i * 0.06); ctx.stroke();
    });
    ctx.save(); ctx.setLineDash([4, 7]);
    ctx.beginPath(); ctx.arc(cx, cy, 158, 0, Math.PI * 2);
    ctx.strokeStyle = rgba(t.secondary, 0.35); ctx.stroke(); ctx.restore();

    ctx.lineWidth = 1; ctx.strokeStyle = rgba(t.primary, 0.14);
    ctx.beginPath(); ctx.moveTo(cx - 240, cy); ctx.lineTo(cx + 240, cy); ctx.moveTo(cx, cy - 240); ctx.lineTo(cx, cy + 240); ctx.stroke();

    const wedge = ctx.createRadialGradient(cx, cy, 0, cx, cy, 224);
    wedge.addColorStop(0, rgba(t.secondary, 0.0)); wedge.addColorStop(1, rgba(t.secondary, 0.26));
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, 224, -1.1, -0.45); ctx.closePath();
    ctx.fillStyle = wedge; ctx.fill();

    for (let i = 0; i < 9; i++) {
      const a = rand() * Math.PI * 2, rr = [92, 136, 180][Math.floor(rand() * 3)];
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 2.6, 0, Math.PI * 2);
      ctx.fillStyle = rgba(t.secondary, 0.9); ctx.fill();
    }
  },

  // Flat and clean: a sheen, a gradient underline.
  minimal(ctx, w, h, t) {
    ctx.beginPath(); ctx.moveTo(w * 0.62, 0); ctx.lineTo(w, 0); ctx.lineTo(w, h * 0.7); ctx.closePath();
    ctx.fillStyle = rgba(t.text, t.isLight ? 0.035 : 0.03); ctx.fill();
    ctx.beginPath(); ctx.moveTo(w * 0.78, 0); ctx.lineTo(w, 0); ctx.lineTo(w, h * 0.4); ctx.closePath();
    ctx.fillStyle = rgba(t.primary, 0.07); ctx.fill();
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, t.primary); g.addColorStop(1, t.secondary);
    ctx.fillStyle = g; ctx.fillRect(0, h - 4, w, 4);
  },
};

// How much to quieten the artwork behind the big level numbers, per style.
const CALM = { dots: 0.62, rain: 0.68, hex: 0.45, petals: 0.38, waves: 0.30, diagonal: 0.25 };

function drawBackground(ctx, w, h, t, radius = 22) {
  roundRect(ctx, 0, 0, w, h, radius);
  const base = ctx.createLinearGradient(0, 0, w, h);
  base.addColorStop(0, t.bg); base.addColorStop(1, t.bg2);
  ctx.fillStyle = base; ctx.fill();

  ctx.save();
  roundRect(ctx, 0, 0, w, h, radius);
  ctx.clip();

  // Soft glow behind the level numbers, shared by every style.
  const gx = w - 139, gy = h / 2;
  const glow = ctx.createRadialGradient(gx, gy, 0, gx, gy, 200);
  glow.addColorStop(0, rgba(t.primary, 0.13)); glow.addColorStop(1, rgba(t.primary, 0));
  ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);

  (PAINTERS[t.style] || PAINTERS.minimal)(ctx, w, h, t);

  // Busy artwork gets a calm zone behind the level numbers so they stay crisp.
  const calm = CALM[t.style] || 0;
  if (calm > 0) {
    const cz = ctx.createRadialGradient(gx, gy, 0, gx, gy, 165);
    cz.addColorStop(0, rgba(t.bg, calm)); cz.addColorStop(0.6, rgba(t.bg, calm * 0.85)); cz.addColorStop(1, rgba(t.bg, 0));
    ctx.fillStyle = cz; ctx.fillRect(gx - 170, gy - 170, 340, 340);
  }

  // Left edge stripe
  const stripe = ctx.createLinearGradient(0, 0, 0, h);
  stripe.addColorStop(0, t.primary); stripe.addColorStop(1, t.secondary);
  ctx.fillStyle = stripe; ctx.fillRect(0, 0, 7, h);
  ctx.restore();

  roundRect(ctx, 1, 1, w - 2, h - 2, radius);
  ctx.strokeStyle = t.primary; ctx.lineWidth = 2; ctx.stroke();
}

// ─── Components ──────────────────────────────────────────────────────────────

async function drawAvatar(ctx, avatarUrl, x, y, size, t, initial = '?', preloaded) {
  const cx = x + size / 2, cy = y + size / 2;

  ctx.save();
  ctx.shadowColor = t.primary; ctx.shadowBlur = size > 60 ? 24 : 8;
  ctx.beginPath(); ctx.arc(cx, cy, size / 2 + 2, 0, Math.PI * 2);
  ctx.strokeStyle = t.primary; ctx.lineWidth = size > 60 ? 4 : 2.5; ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, size / 2 - 2, 0, Math.PI * 2); ctx.clip();
  let img = preloaded || null;
  if (!img && avatarUrl) { try { img = await loadImage(avatarUrl); } catch { img = null; } }
  if (img) {
    ctx.drawImage(img, x + 2, y + 2, size - 4, size - 4);
  } else {
    const g = ctx.createLinearGradient(x, y, x + size, y + size);
    g.addColorStop(0, t.primary); g.addColorStop(1, t.secondary);
    ctx.fillStyle = g; ctx.fillRect(x, y, size, size);
    ctx.fillStyle = t.bg; ctx.textAlign = 'center';
    ctx.font = `${Math.round(size * 0.5)}px ${DISPLAY}`;
    ctx.fillText(String(initial).slice(0, 1).toUpperCase(), cx, cy + size * 0.18);
  }
  ctx.restore();
}

function drawBadge(ctx, text, x, y, t, h = 26) {
  ctx.font = `bold 11px ${BODY}`;
  const label = cleanBadge(text).toUpperCase();
  const pad = 14, sp = 2;
  const w = spacedWidth(ctx, label, sp) + pad * 2;

  roundRect(ctx, x, y, w, h, h / 2); ctx.fillStyle = rgba(t.primary, 0.18); ctx.fill();
  roundRect(ctx, x + 0.75, y + 0.75, w - 1.5, h - 1.5, h / 2);
  ctx.strokeStyle = t.primary; ctx.lineWidth = 1.5; ctx.stroke();

  ctx.fillStyle = mix(t.primary, t.text, 0.25);
  drawSpaced(ctx, label, x + pad, y + h / 2 + 4, sp);
}

function drawBar(ctx, x, y, w, h, progress, color, partner, t) {
  const r = h / 2, p = Math.max(0, Math.min(progress, 1));

  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = t.track; ctx.fill();
  if (p <= 0) return;

  const fillW = Math.max(h, w * p);
  const g = ctx.createLinearGradient(x, 0, x + fillW, 0);
  g.addColorStop(0, color); g.addColorStop(1, mix(color, partner, 0.55));

  ctx.save();
  ctx.shadowColor = color; ctx.shadowBlur = t.isLight ? 6 : 10;
  roundRect(ctx, x, y, fillW, h, r);
  ctx.fillStyle = g; ctx.fill();
  ctx.restore();

  if (fillW > 24) {
    roundRect(ctx, x + 8, y + 3, fillW - 16, 3, 1.5);
    ctx.fillStyle = rgba('#FFFFFF', 0.28); ctx.fill();
  }
}

// ─── Level card (/level) ─────────────────────────────────────────────────────

const themeOf = o => o.theme || resolveTheme(o.guildSettings);

async function drawLevelCard(ctx, options, H) {
  const {
    username, discriminator, avatarUrl,
    textXp, voiceXp, textLevel, voiceLevel, textRank, voiceRank,
  } = options;
  const t = themeOf(options);

  drawBackground(ctx, W, H, t);

  const avatarSize = 124;
  await drawAvatar(ctx, avatarUrl, 42, (H - avatarSize) / 2, avatarSize, t, username);

  const cx0 = 196, barW = 430;

  ctx.textAlign = 'left';
  ctx.fillStyle = t.text;
  const nameSp = 2, name = username.toUpperCase();
  fitFont(ctx, name, barW, 42, 22, DISPLAY, '', nameSp);
  const shown = truncateSpaced(ctx, name, barW, nameSp);
  drawSpaced(ctx, shown, cx0, 62, nameSp);
  if (discriminator && discriminator !== '0') {
    const nw = spacedWidth(ctx, shown, nameSp);
    ctx.fillStyle = t.muted; ctx.font = `16px ${BODY}`;
    ctx.fillText(`#${discriminator}`, cx0 + nw + 8, 62);
  }

  ctx.fillStyle = t.muted; ctx.font = `bold 12px ${BODY}`;
  drawSpaced(ctx, `TEXT #${textRank}   ·   VOICE #${voiceRank}`, cx0, 88, 3);

  const stat = (label, y, level, xp, color, partner) => {
    const cur = xpInCurrentLevel(xp), max = xpForLevel(level);
    ctx.fillStyle = color; ctx.font = `bold 12px ${BODY}`;
    drawSpaced(ctx, label, cx0, y - 8, 3);
    drawBar(ctx, cx0, y, barW, 14, max > 0 ? cur / max : 0, color, partner, t);
    ctx.fillStyle = t.muted; ctx.font = `12px ${BODY}`; ctx.textAlign = 'left';
    ctx.fillText(`${cur.toLocaleString()} / ${max.toLocaleString()} XP`, cx0, y + 32);
  };
  stat('TEXT',  134, textLevel,  textXp,  t.primary,   t.secondary);
  stat('VOICE', 202, voiceLevel, voiceXp, t.secondary, t.primary);

  const num = (label, level, centerX, color) => {
    ctx.fillStyle = t.text; ctx.font = `bold 13px ${BODY}`;
    drawSpaced(ctx, label, centerX, 84, 6, 'center');

    ctx.save();
    ctx.shadowColor = color; ctx.shadowBlur = t.isLight ? 12 : 26;
    ctx.fillStyle = color;
    fitFont(ctx, String(level), 100, 96, 44, DISPLAY);
    ctx.textAlign = 'center';
    ctx.fillText(String(level), centerX, 176);
    ctx.restore();

    ctx.fillStyle = mix(color, t.text, 0.25); ctx.font = `bold 11px ${BODY}`;
    drawSpaced(ctx, 'LEVEL', centerX, 204, 5, 'center');
  };
  num('TEXT',  textLevel,  708, t.primary);
  num('VOICE', voiceLevel, 818, t.secondary);

  if (options.roleBadge) drawBadge(ctx, options.roleBadge, cx0, H - 40, t);
}

async function generateLevelCard(options) {
  const H = 280;
  const canvas = createCanvas(W, H);
  await drawLevelCard(canvas.getContext('2d'), options, H);
  return canvas.encode('png');
}

// ─── Level-up card ───────────────────────────────────────────────────────────

async function generateLevelUpCard(options) {
  const { username, avatarUrl, type = 'text', textXp, voiceXp, textLevel, voiceLevel } = options;
  const t = themeOf(options);
  const H = 260;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  drawBackground(ctx, W, H, t);

  const isVoice = type === 'voice';
  const level = isVoice ? voiceLevel : textLevel;
  const xp    = isVoice ? voiceXp    : textXp;
  const main  = isVoice ? t.secondary : t.primary;
  const other = isVoice ? t.primary   : t.secondary;

  await drawAvatar(ctx, avatarUrl, 42, 68, 124, t, username);

  const cx0 = 196, barW = 430;

  ctx.textAlign = 'left'; ctx.fillStyle = main; ctx.font = `22px ${DISPLAY}`;
  drawSpaced(ctx, 'LEVEL UP', cx0, 50, 6);

  ctx.fillStyle = t.text;
  const nameSp = 2, name = username.toUpperCase();
  fitFont(ctx, name, 400, 44, 24, DISPLAY, '', nameSp);
  drawSpaced(ctx, truncateSpaced(ctx, name, 400, nameSp), cx0, 98, nameSp);

  ctx.fillStyle = t.muted; ctx.font = `bold 12px ${BODY}`;
  drawSpaced(ctx, isVoice ? 'VOICE LEVEL REACHED' : 'TEXT LEVEL REACHED', cx0, 128, 3);

  const cur = xpInCurrentLevel(xp), max = xpForLevel(level);
  drawBar(ctx, cx0, 146, barW, 14, max > 0 ? cur / max : 0, main, other, t);
  ctx.fillStyle = t.muted; ctx.font = `12px ${BODY}`; ctx.textAlign = 'left';
  drawSpaced(ctx, `${cur.toLocaleString()} / ${max.toLocaleString()} XP TO NEXT LEVEL`, cx0, 181, 1);

  if (options.roleBadge) drawBadge(ctx, options.roleBadge, cx0, 200, t);

  const numCx = 760;
  ctx.fillStyle = t.text; ctx.font = `bold 14px ${BODY}`;
  drawSpaced(ctx, 'LEVEL', numCx, 50, 8, 'center');

  ctx.save();
  ctx.shadowColor = main; ctx.shadowBlur = t.isLight ? 14 : 30;
  ctx.fillStyle = main;
  fitFont(ctx, String(level), 210, 160, 70, DISPLAY);
  ctx.textAlign = 'center';
  ctx.fillText(String(level), numCx, 200);
  ctx.restore();

  ctx.fillStyle = mix(main, t.text, 0.25); ctx.font = `bold 11px ${BODY}`;
  drawSpaced(ctx, 'NEW RANK UNLOCKED', numCx, 228, 4, 'center');

  return canvas.encode('png');
}

// ─── Leaderboard ─────────────────────────────────────────────────────────────

const MEDALS = ['#FFC83D', '#C9D1D9', '#E0955A'];

async function generateLeaderboardCard(entries, type, themeOrSettings) {
  const t = themeOrSettings && themeOrSettings.style && themeOrSettings.primary
    ? themeOrSettings : resolveTheme(themeOrSettings);
  const isVoice = type === 'voice';
  const main = isVoice ? t.secondary : t.primary;
  const other = isVoice ? t.primary : t.secondary;

  const avatars = await Promise.all(entries.map(e =>
    e.avatarUrl ? loadImage(e.avatarUrl).catch(() => null) : null));

  const rowH = 72, totalH = 100 + entries.length * rowH;
  const canvas = createCanvas(W, totalH);
  const ctx = canvas.getContext('2d');

  drawBackground(ctx, W, totalH, t);

  ctx.fillStyle = main; ctx.font = `30px ${DISPLAY}`; ctx.textAlign = 'left';
  drawSpaced(ctx, `${isVoice ? 'VOICE' : 'TEXT'} LEADERBOARD`, 34, 56, 5);
  ctx.fillStyle = rgba(main, 0.35); ctx.fillRect(34, 70, 832, 2);

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i], y = 90 + i * rowH;
    const xp  = isVoice ? e.voice_xp : e.text_xp;
    const lvl = isVoice ? e.voice_level : e.text_level;
    const medal = i < 3 ? ensureContrast(MEDALS[i], t.bg, 2.2) : null;

    roundRect(ctx, 16, y + 2, 868, rowH - 4, 12);
    ctx.fillStyle = t.isLight
      ? (i % 2 === 0 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.55)')
      : (i % 2 === 0 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.25)');
    ctx.fill();
    if (medal) {
      roundRect(ctx, 16, y + 2, 868, rowH - 4, 12);
      ctx.strokeStyle = rgba(medal, 0.6 - i * 0.14); ctx.lineWidth = 1.5; ctx.stroke();
    }

    ctx.font = `26px ${DISPLAY}`; ctx.textAlign = 'left';
    ctx.fillStyle = medal || t.muted;
    ctx.fillText(`#${i + 1}`, 34, y + rowH / 2 + 9);

    const tag = e.tag || `User ${String(e.user_id).slice(-4)}`;
    await drawAvatar(ctx, null, 98, y + rowH / 2 - 22, 44, { ...t, primary: medal || main }, tag, avatars[i]);

    ctx.fillStyle = t.text; ctx.font = `bold 18px ${BODY}`; ctx.textAlign = 'left';
    ctx.fillText(tag.length > 26 ? tag.slice(0, 25) + '…' : tag, 155, y + rowH / 2 + 2);

    ctx.fillStyle = t.muted; ctx.font = `15px ${BODY}`; ctx.textAlign = 'right';
    ctx.fillText(`Level ${lvl}  ·  ${xp.toLocaleString()} XP`, 866, y + rowH / 2 + 2);

    const curXp = xpInCurrentLevel(xp), maxXp = xpForLevel(lvl);
    drawBar(ctx, 155, y + rowH - 22, 711, 8, maxXp > 0 ? curXp / maxXp : 0, main, other, t);
  }

  return canvas.encode('png');
}

// ─── Theme previews & gallery sheet ──────────────────────────────────────────

const SAMPLE = {
  username: 'Nyx', discriminator: '0',
  textLevel: 24, voiceLevel: 12, textRank: 3, voiceRank: 7,
  textXp:  totalXpForLevel(24) + Math.floor(xpForLevel(24) * 0.62),
  voiceXp: totalXpForLevel(12) + Math.floor(xpForLevel(12) * 0.35),
  roleBadge: 'Veteran',
};

const sig = t => `${t.style}|${t.bg}|${t.primary}|${t.secondary}`;
const previewCache = new Map();

/** A sample level card in the given theme. Results are cached by palette. */
async function generateThemePreview(theme) {
  const key = sig(theme);
  if (previewCache.has(key)) return previewCache.get(key);
  const buf = await generateLevelCard({ ...SAMPLE, theme });
  previewCache.set(key, buf);
  if (previewCache.size > 60) previewCache.delete(previewCache.keys().next().value);
  return buf;
}

const sheetCache = new Map();

/** A contact sheet of every theme a guild can pick, with the active one marked. */
async function generateThemeSheet(settings) {
  const themes = listThemesFor(settings);
  const active = resolveTheme(settings);
  const key = themes.map(sig).join('~') + '#' + active.id;
  if (sheetCache.has(key)) return sheetCache.get(key);

  const cols = 3, tw = 420, th = Math.round(280 * tw / W), gap = 22, pad = 28, labelH = 44;
  const rows = Math.ceil(themes.length / cols);
  const sw = pad * 2 + cols * tw + (cols - 1) * gap;
  const sh = pad * 2 + rows * (th + labelH) + (rows - 1) * gap;

  const canvas = createCanvas(sw, sh);
  const ctx = canvas.getContext('2d');
  roundRect(ctx, 0, 0, sw, sh, 24); ctx.fillStyle = '#0C0C10'; ctx.fill();
  ctx.imageSmoothingQuality = 'high';

  for (let i = 0; i < themes.length; i++) {
    const t = themes[i];
    const x = pad + (i % cols) * (tw + gap), y = pad + Math.floor(i / cols) * (th + labelH + gap);

    const card = createCanvas(W, 280);
    await drawLevelCard(card.getContext('2d'), { ...SAMPLE, theme: t }, 280);

    ctx.save(); roundRect(ctx, x, y, tw, th, 10); ctx.clip();
    ctx.drawImage(card, x, y, tw, th);
    ctx.restore();

    const isActive = t.id === active.id;
    if (isActive) { roundRect(ctx, x - 3, y - 3, tw + 6, th + 6, 13); ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 2; ctx.stroke(); }

    ctx.textAlign = 'left'; ctx.fillStyle = '#F4F4F5'; ctx.font = `bold 15px ${BODY}`;
    ctx.fillText(t.name, x + 2, y + th + 24);

    // Colour swatches
    [t.bg, t.primary, t.secondary].forEach((c, k) => {
      ctx.beginPath(); ctx.arc(x + tw - 14 - k * 22, y + th + 19, 8, 0, Math.PI * 2);
      ctx.fillStyle = c; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1; ctx.stroke();
    });
    if (isActive) {
      ctx.font = `bold 15px ${BODY}`;
      const nameW = ctx.measureText(t.name).width;
      ctx.font = `bold 10px ${BODY}`;
      const label = 'ACTIVE', lw = spacedWidth(ctx, label, 2) + 16;
      roundRect(ctx, x + 2 + nameW + 10, y + th + 10, lw, 20, 10); ctx.fillStyle = '#FFFFFF'; ctx.fill();
      ctx.fillStyle = '#0C0C10';
      drawSpaced(ctx, label, x + 2 + nameW + 18, y + th + 24, 2);
    }
  }

  const buf = await canvas.encode('png');
  sheetCache.set(key, buf);
  if (sheetCache.size > 12) sheetCache.delete(sheetCache.keys().next().value);
  return buf;
}

module.exports = {
  generateLevelCard, generateLevelUpCard, generateLeaderboardCard,
  generateThemePreview, generateThemeSheet,
};
