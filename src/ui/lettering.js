/*
 * lettering.js: the manga lettering, drawn by our own canvas code. Trick
 * names, gaps, close calls, the combo's verdict and the chase's callouts
 * arrive as hand lettered text (FREESTYLE-MAPS-PLAN.md section 3.2 item 3),
 * the results page letters its panels with the same hand, and so do the
 * wordmark and the menus' titles (paintTitle, polish item 19).
 *
 * WHAT "HAND LETTERED" IS HERE, precisely, because there is no font file:
 *
 *   The capitals are the system's own heaviest sans (the shell's font stack
 *   at weight 900), used as a skeleton and nothing more. Every glyph is set
 *   one at a time, slanted by our own shear (not the font's italic, which
 *   is a different angle on every platform and a fake oblique on most),
 *   turned and lifted by a small amount that is a pure function of the
 *   word and the glyph's place in it, so a word always wears the same hand
 *   and two words never wear quite the same one. Then it is inked: a hard
 *   ink drop, a thick ink outline stroked round every glyph before any is
 *   filled, so neighbours that touch share one outline the way a letterer's
 *   brush joins them, and a two band cel fill with a hard stop, because a
 *   cel shaded town has no gradients that are not a stack of hard stops.
 *
 *   The katakana are not a font at all. The sound effects are a set of
 *   seven (below) spelt from ten brush drawn kana and the voicing mark, each
 *   stored as its strokes in a unit square and drawn as an ink line with a
 *   coloured core. A manga's sound effects are drawn, not typeset, and this
 *   way they look drawn and read the same on a machine with no Japanese
 *   font installed, where the system stack would draw boxes. Five more kana
 *   spell the combo tiers' words (src/ui/scorehud.js), drawn as one brush
 *   line in a badge (paintKana), for the same reason.
 *
 * THE SOUND EFFECTS, the whole set, and what each is for. Decision 11 (the
 * owner, 2026-09-26): "Yes, small". Small in size and small in number, so
 * each one keeps meaning something:
 *
 *   ズバッ   zuba'     a gap: a clean slash through
 *   ドン     don       a big combo banked: the boom of the landing
 *   シュッ   shu'      a long skim: the swish past
 *   ギュン   gyun      a thread: the zip between
 *   ブーン   buun      a tail banked: the engine's drone
 *   キキーッ kikii'    a drift tail banked: the tyres
 *
 * Nothing else gets one. Not a trick (the name is the event), not a bail
 * (a loss is not a sound the pilot wants celebrated), not a low pass.
 *
 * COST. A callout paints one or two small canvases when it arrives, and
 * nothing at all on a frame where nothing arrived: there is no animation
 * loop in here, and the moving is CSS keyframes on the nodes that carry
 * the canvases, the rule src/ui/scorehud.js opens with. Nothing here is
 * called per frame. Nothing here reads the DOM at import, so the shell
 * stays importable in Node.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

/* The shell's tokens, from :root in index.html, and the saturated sakura the
 * score bails in. INK is the town's ink line. */
export const INK = '#0b1116';
export const PAPER = '#f7f0dc';
export const INKS = {
  cream: '#f3ead4',
  amber: '#ffd45c',
  mint: '#7dffb4',
  /* The close calls' own colour: the town's sky, lifted until it reads
   * over the sky it is the colour of, because a close call is about the
   * world round the craft rather than the craft. */
  sky: '#8fe0ff',
  sakura: '#e8a8b8',
  bail: '#ff7d96',
  drift: '#ffc46b',
  slate: '#9db3c8',
  green: '#3cc04f',
};

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/* The hand. SLANT is the shear, x per unit of height (about 13 degrees);
 * INK_W the outline as a fraction of the size, thick enough to read over a
 * lit roof; DROP the hard ink shadow, down and right, as fractions. */
const SLANT = 0.24;
const INK_W = 0.2;
const DROP_X = 0.07;
const DROP_Y = 0.09;
/* Cap height and descent of the skeleton, as fractions of the size, for
 * laying out without asking the font. Generous, because a glyph turned by
 * its jitter reaches a little past both. */
const ASC = 0.8;
const DESC = 0.24;

/*
 * THE SOUND EFFECTS, by the moment that earns one. See the table in the
 * header for the readings and why the set stops here.
 */
export const SFX = {
  gap: 'ズバッ',
  bank: 'ドン',
  skim: 'シュッ',
  thread: 'ギュン',
  tail: 'ブーン',
  drift: 'キキーッ',
};

/* How the device pixel ratio is capped, for the trick film's reason: a
 * callout does not need a retina buffer beside a simulator, and 2x is
 * already sharp on every phone. */
function dprNow() {
  const d = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  return d > 2 ? 2 : (d < 1 ? 1 : d);
}

/*
 * A number in [0, 1) that is a pure function of a string and an index: the
 * word's hand. FNV-1a and a finaliser, which is plenty for a letterer's
 * wobble and means the same callout always looks the same, in a picture
 * and on the pilot's screen.
 */
function hash(str, i) {
  let h = (2166136261 ^ Math.imul(i + 1, 374761393)) >>> 0;
  for (let k = 0; k < str.length; k += 1) {
    h ^= str.charCodeAt(k);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/*
 * A colour as #rrggbb, from #rrggbb, #rgb or the rgb() and rgba() a computed
 * style hands back, because a lettered heading takes its fill from the
 * heading's own CSS colour (a record's title is mint because its CSS says
 * so) and the cel band below does arithmetic on hex.
 */
export function hexOf(colour) {
  const c = String(colour || '').trim();
  if (/^#[0-9a-f]{6}$/i.test(c)) {
    return c;
  }
  if (/^#[0-9a-f]{3}$/i.test(c)) {
    return `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`;
  }
  const m = c.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
  if (!m) {
    return INKS.cream;
  }
  const n = (v) => Math.max(0, Math.min(255, Math.round(Number(v))));
  return `#${((1 << 24) | (n(m[1]) << 16) | (n(m[2]) << 8) | n(m[3])).toString(16).slice(1)}`;
}

/* The lower cel band: the same hue, darker. Hex in, hex out. */
function shadeOf(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * k);
  const g = Math.round(((n >> 8) & 255) * k);
  const b = Math.round((n & 255) * k);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/* ------------------------------------------------------------------ *
 * The capitals
 * ------------------------------------------------------------------ */

/*
 * Lay a word out: the advance of each glyph at `px`, and the whole width.
 * Sets the context's font, which the drawing below relies on. A space is
 * narrower than the font's, because lettering is set tight.
 */
function layout(ctx, text, px) {
  ctx.font = `900 ${px}px ${FONT}`;
  const chars = Array.from(text);
  const adv = new Array(chars.length);
  let w = 0;
  for (let i = 0; i < chars.length; i += 1) {
    const a = ctx.measureText(chars[i]).width * (chars[i] === ' ' ? 0.62 : 0.95);
    adv[i] = a;
    w += a;
  }
  return { chars, adv, w };
}

/* The width a word will take at `px`, including the slant and the drop
 * that reach past its last advance. `inkW` is the outline as a fraction of
 * the size, INK_W unless a title asks for a finer one. */
export function wordWidth(ctx, text, px, inkW = INK_W) {
  return layout(ctx, text, px).w + px * (SLANT * ASC + DROP_X + inkW);
}

/*
 * Letter one word, its baseline at y and its first glyph's left edge at x.
 * `rim` puts a paper line outside the ink, the way a manga title is cut out
 * of the page, for the moments that sit over the busiest part of the world.
 * Returns the advance.
 */
export function drawWord(ctx, text, x, y, px, fill, opts = {}) {
  return drawRuns(ctx, [{ text, fill, shade: opts.shade }], x, y, px, opts);
}

/*
 * Letter a word made of runs in different colours, { text, fill, shade? }
 * each, as one word: one hand (the seed is the whole word and a glyph's
 * place in it), one drop, every outline before any fill, then each run's
 * fill. The wordmark is the reason, WEB in cream and FPV in sakura, and
 * why it is not two calls to drawWord: the second word's outline would be
 * stroked over the first's fill where the B meets the F, and a letterer's
 * brush joins them. One run is exactly drawWord.
 *
 * opts: rim, seed, and inkW (the outline as a fraction of the size).
 */
export function drawRuns(ctx, runs, x, y, px, opts = {}) {
  const text = runs.map((r) => r.text).join('');
  const { chars, adv, w } = layout(ctx, text, px);
  const runOf = [];
  runs.forEach((r, k) => {
    for (let n = Array.from(r.text).length; n > 0; n -= 1) {
      runOf.push(k);
    }
  });
  const x0 = x;
  const ink = px * (opts.inkW > 0 ? opts.inkW : INK_W);
  const seed = opts.seed || text;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'center';
  /* One glyph through the hand: moved to its place, turned, sheared, and
   * drawn by `paint` with the glyph at the local origin. `only` limits it
   * to one run's glyphs. */
  const each = (dx, dy, paint, only = -1) => {
    let gx = x0;
    for (let i = 0; i < chars.length; i += 1) {
      const a = adv[i];
      if (chars[i] !== ' ' && (only < 0 || runOf[i] === only)) {
        const rot = (hash(seed, i * 3) - 0.5) * 0.085;
        const lift = (hash(seed, i * 3 + 1) - 0.5) * 0.07 * px;
        const sc = (i === 0 ? 1.08 : 1) + (hash(seed, i * 3 + 2) - 0.5) * 0.05;
        ctx.save();
        ctx.translate(gx + a * 0.5 + dx, y + lift + dy);
        ctx.rotate(rot);
        ctx.transform(1, 0, -SLANT, 1, 0, 0);
        ctx.scale(sc, sc);
        paint(chars[i]);
        ctx.restore();
      }
      gx += a;
    }
  };
  if (opts.rim) {
    ctx.strokeStyle = PAPER;
    ctx.lineWidth = ink * 2.1;
    each(0, 0, (ch) => ctx.strokeText(ch, 0, 0));
  }
  /* The drop: ink, stroked and filled, down and right. Hard, no blur. */
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.lineWidth = ink;
  each(px * DROP_X, px * DROP_Y, (ch) => {
    ctx.strokeText(ch, 0, 0);
    ctx.fillText(ch, 0, 0);
  });
  /* Every outline before any fill, so touching glyphs share one line. */
  each(0, 0, (ch) => ctx.strokeText(ch, 0, 0));
  /* Two cel bands with a hard stop, in the glyph's own space so the stop
   * sits at the same height in every glyph however it is turned. */
  runs.forEach((r, k) => {
    const shade = r.shade || shadeOf(r.fill, 0.8);
    const band = ctx.createLinearGradient(0, -px * 0.74, 0, 0);
    band.addColorStop(0, r.fill);
    band.addColorStop(0.55, r.fill);
    band.addColorStop(0.55, shade);
    band.addColorStop(1, shade);
    ctx.fillStyle = band;
    each(0, 0, (ch) => ctx.fillText(ch, 0, 0), runs.length > 1 ? k : -1);
  });
  ctx.restore();
  return w;
}

/* ------------------------------------------------------------------ *
 * The katakana
 * ------------------------------------------------------------------ */

/*
 * Fifteen kana as brush strokes in a unit square, y down, in the order a
 * hand writes them. M moves, L draws a straight line, Q a curve through a
 * control point. The voiced kana are these with the voicing mark, and the
 * small ones are these made small, which is how the writing system itself
 * builds them.
 *
 * The first ten spell the sound effects. イ ネ コ ヤ サ were added with the
 * combo tiers' words (src/ui/scorehud.js), which were font glyphs and drew
 * as boxes on a machine with no Japanese font: イイネ, スゴイ, ヤバイ and
 * サイコー, the katakana a manga letters a shout in, need these five and
 * ゴ, which is コ voiced.
 */
const KANA = {
  'ス': ['M.2 .2 L.76 .2 Q.66 .6 .14 .9', 'M.5 .56 Q.7 .68 .88 .9'],
  'ハ': ['M.38 .22 Q.32 .58 .1 .84', 'M.6 .22 Q.78 .56 .92 .82'],
  'ツ': ['M.14 .26 L.24 .48', 'M.4 .2 L.5 .42', 'M.86 .2 Q.8 .74 .28 .94'],
  'ト': ['M.36 .08 L.36 .94', 'M.38 .38 L.8 .6'],
  'ン': ['M.16 .22 L.38 .38', 'M.18 .9 Q.68 .8 .9 .24'],
  'シ': ['M.14 .16 L.34 .3', 'M.08 .44 L.28 .58', 'M.16 .94 Q.68 .82 .92 .3'],
  'ユ': ['M.2 .3 L.72 .3 L.7 .78', 'M.08 .8 L.92 .8'],
  'キ': ['M.16 .36 L.84 .28', 'M.1 .64 L.9 .56', 'M.42 .08 L.56 .96'],
  'フ': ['M.14 .2 L.82 .2 Q.72 .68 .24 .94'],
  'ー': ['M.06 .54 L.94 .48'],
  'イ': ['M.76 .06 Q.6 .4 .1 .62', 'M.5 .4 L.5 .96'],
  'ネ': ['M.44 .04 L.54 .17', 'M.16 .3 L.8 .3 Q.56 .6 .1 .8', 'M.5 .54 L.5 .98', 'M.64 .62 L.88 .8'],
  'コ': ['M.16 .2 L.8 .2 L.8 .82', 'M.14 .82 L.84 .82'],
  'ヤ': ['M.06 .44 L.9 .3 Q.84 .5 .64 .62', 'M.32 .08 L.54 .96'],
  'サ': ['M.04 .34 L.96 .34', 'M.28 .1 L.28 .6', 'M.7 .06 L.7 .48 Q.68 .82 .32 .96'],
};
/* The voicing mark, two ticks off the top right. */
const DAKUTEN = ['M.8 .0 L.88 .2', 'M.95 -.04 L1.03 .16'];
const VOICED = {
  'ズ': 'ス', 'バ': 'ハ', 'ド': 'ト', 'ギ': 'キ', 'ブ': 'フ', 'ゴ': 'コ',
};
const SMALL = { 'ッ': 'ツ', 'ュ': 'ユ' };

/* Parsed once, on first use: an array of strokes, each an array of
 * commands [op, numbers...]. */
const STROKES = new Map();
function strokesOf(kana) {
  let s = STROKES.get(kana);
  if (!s) {
    s = KANA[kana].map((src) => src.trim().split(/(?=[MLQ])/).map((cmd) => {
      const nums = cmd.slice(1).trim().split(/\s+/).map(Number);
      return [cmd[0], ...nums];
    }));
    STROKES.set(kana, s);
  }
  return s;
}
let DAKU_STROKES = null;

function tracePath(ctx, strokes) {
  ctx.beginPath();
  for (const stroke of strokes) {
    for (const c of stroke) {
      if (c[0] === 'M') {
        ctx.moveTo(c[1], c[2]);
      } else if (c[0] === 'L') {
        ctx.lineTo(c[1], c[2]);
      } else {
        ctx.quadraticCurveTo(c[1], c[2], c[3], c[4]);
      }
    }
  }
}

/* The advance of one kana, in units of the size. */
function kanaAdvance(ch) {
  return SMALL[ch] ? 0.66 : (ch === 'ー' ? 0.9 : 0.96);
}

/* The width a sound effect takes at `px`. */
export function sfxWidth(text, px, tight = 1) {
  let w = 0;
  for (const ch of text) {
    w += kanaAdvance(ch);
  }
  return (w * tight + 0.34) * px;
}

/*
 * Walk a line of kana, each cell `px` square with its top left at (x, y)
 * plus (dx, dy), calling `paint(strokes)` with the context in the cell's
 * unit square. `hand` is how far each kana is turned and stepped off the
 * line: 1 for a sound effect scrawled across a panel, less for a word set
 * in a badge. `tight` scales the advance, 1 for an effect. Shared by both
 * so they are one hand.
 */
function eachKana(ctx, text, x, y, px, hand, dx, dy, paint, tight = 1) {
  if (!DAKU_STROKES) {
    DAKU_STROKES = DAKUTEN.map((src) => src.split(/(?=[ML])/).map((cmd) => {
      const nums = cmd.slice(1).trim().split(/\s+/).map(Number);
      return [cmd[0], ...nums];
    }));
  }
  const chars = Array.from(text);
  let gx = x + px * 0.1;
  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i];
    const small = SMALL[ch];
    const base = small || VOICED[ch] || ch;
    if (KANA[base]) {
      const rot = (hash(text, i) - 0.5) * 0.28 * hand;
      const step = (i % 2 ? 0.06 : -0.04) * px * hand;
      ctx.save();
      ctx.translate(gx + dx, y + step + dy);
      ctx.translate(px * 0.5, px * 0.5);
      ctx.rotate(rot);
      ctx.transform(1, 0, -SLANT * 0.7, 1, 0, 0);
      ctx.translate(-px * 0.5, -px * 0.5);
      ctx.scale(px, px);
      if (small) {
        ctx.translate(0.04, 0.36);
        ctx.scale(0.62, 0.62);
      } else if (VOICED[ch]) {
        paint(DAKU_STROKES);
        ctx.translate(-0.02, 0.07);
        ctx.scale(0.88, 0.88);
      }
      paint(strokesOf(base));
      ctx.restore();
    }
    gx += kanaAdvance(ch) * px * tight;
  }
}

/* Strokes in the cell's own units, so one number reads the same at every
 * size. */
function inkStrokes(ctx, strokes, colour, w) {
  tracePath(ctx, strokes);
  ctx.strokeStyle = colour;
  ctx.lineWidth = w;
  ctx.stroke();
}

/*
 * Letter a sound effect, its cells' top left at (x, y) and each cell `px`
 * square. Each kana is turned and stepped by its own amount, the way an SFX
 * is scrawled across a panel rather than set on a line.
 */
export function drawSfx(ctx, text, x, y, px, fill) {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  /* The ink a fifth of a cell, the core a ninth. */
  eachKana(ctx, text, x, y, px, 1, px * 0.06, px * 0.08, (s) => inkStrokes(ctx, s, INK, 0.22));
  eachKana(ctx, text, x, y, px, 1, 0, 0, (s) => inkStrokes(ctx, s, INK, 0.22));
  eachKana(ctx, text, x, y, px, 1, 0, 0, (s) => inkStrokes(ctx, s, fill, 0.11));
  ctx.restore();
}

/*
 * A kana word as a canvas of its own, one brush line in one colour and no
 * core: the combo tier's word, set in the tier's badge the way the badge
 * sets its English word, ink punched out of a solid chip (src/ui/scorehud.js).
 * The hand is steadier than an effect's, because a badge is read, not
 * glimpsed. Painted once at `px` a cell; the badge scales it by CSS, so a
 * window changing size never repaints it.
 */
const BADGE_TIGHT = 0.86;

export function paintKana(canvas, text, px, colour) {
  const ctx = canvas.getContext('2d');
  const dpr = dprNow();
  const W = Math.ceil(sfxWidth(text, px, BADGE_TIGHT));
  const H = Math.ceil(px * 1.3);
  canvas.width = Math.ceil(W * dpr);
  canvas.height = Math.ceil(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  eachKana(ctx, text, 0, px * 0.15, px, 0.4, 0, 0, (s) => inkStrokes(ctx, s, colour || INK, 0.19), BADGE_TIGHT);
  return { w: W, h: H };
}

/* ------------------------------------------------------------------ *
 * The burst balloon
 * ------------------------------------------------------------------ */

/*
 * The spiky balloon a manga puts behind a shout: paper, a hard ink line,
 * a hard ink drop, and spikes whose lengths are the word's hand so the same
 * shout always has the same balloon. (cx, cy) is its middle and (rx, ry)
 * the ellipse the valleys sit on. A spike's length is set by the lettering's
 * size and not by the ellipse, or a long word's balloon becomes a flat lens
 * with needles off each end; the longest reaches BURST_REACH sizes past the
 * ellipse, which the caller leaves room for.
 */
export const BURST_REACH = 0.95;

export function drawBurst(ctx, cx, cy, rx, ry, seed, px, maxReach = BURST_REACH) {
  /* More spikes round a longer balloon, so they stay about as far apart. */
  const around = Math.PI * (rx + ry);
  const n = Math.max(14, Math.min(34, Math.round(around / (px * 0.95)))) + Math.floor(hash(seed, 99) * 3);
  const path = () => {
    ctx.beginPath();
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2 + (hash(seed, i + 40) - 0.5) * 0.1;
      const b = a + Math.PI / n;
      const dip = 0.97 - hash(seed, i + 70) * 0.05;
      const reach = px * (maxReach * 0.42 + hash(seed, i + 100) * maxReach * 0.58);
      const ix = cx + Math.cos(a) * rx * dip;
      const iy = cy + Math.sin(a) * ry * dip;
      if (i === 0) {
        ctx.moveTo(ix, iy);
      } else {
        ctx.lineTo(ix, iy);
      }
      ctx.lineTo(cx + Math.cos(b) * (rx + reach), cy + Math.sin(b) * (ry + reach));
    }
    ctx.closePath();
  };
  ctx.save();
  ctx.lineJoin = 'miter';
  ctx.miterLimit = 6;
  ctx.translate(px * 0.1, px * 0.12);
  path();
  ctx.fillStyle = INK;
  ctx.fill();
  ctx.translate(-px * 0.1, -px * 0.12);
  path();
  ctx.fillStyle = PAPER;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(2, px * 0.09);
  ctx.stroke();
  /* A second, finer line inside the first, the double edge a manga gives
   * a shout that is louder than speech. */
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(0.9, 0.88);
  ctx.translate(-cx, -cy);
  path();
  ctx.lineWidth = Math.max(1, px * 0.035);
  ctx.stroke();
  ctx.restore();
  ctx.restore();
}

/* ------------------------------------------------------------------ *
 * A callout, as a canvas for the HUD
 * ------------------------------------------------------------------ */

/*
 * What a callout carries, and how it is set:
 *
 *   word       the big word, lettered in capitals
 *   fill       its colour
 *   size       its size in CSS pixels, before fitting
 *   pts        optional, set after the word on its baseline, smaller
 *   ptsFill    its colour
 *   tag        optional, after the points, smaller again, in slate
 *   line       optional, a second line under the word, smaller
 *   lineFill   its colour
 *   align      'left' or 'right': which edge the lines share
 *   balloon    a burst balloon behind it all
 *   reach      how far its longest spike reaches past the ellipse, in
 *              sizes (BURST_REACH unless a short screen asks for less)
 *   rim        a paper line outside the ink
 *   maxW       the widest it may be, in CSS pixels: it is scaled down to
 *              fit rather than allowed past, which is how a callout is
 *              kept out of the centre third at any window width
 *
 * Paints `canvas` and sizes it, backing store at the device pixel ratio
 * and CSS size set, and returns the CSS size.
 */
export function paintCall(canvas, spec) {
  const ctx = canvas.getContext('2d');
  const word = String(spec.word || '').toUpperCase();
  const reach = spec.reach > 0 ? spec.reach : BURST_REACH;
  const measure = (px) => {
    const pp = px * 0.62;
    const tp = px * 0.54;
    const lp = px * 0.56;
    const ww = word ? wordWidth(ctx, word, px) : 0;
    const pw = spec.pts ? wordWidth(ctx, spec.pts, pp) + px * 0.2 : 0;
    const tw = spec.tag ? wordWidth(ctx, spec.tag, tp) + px * 0.12 : 0;
    const lw = spec.line ? wordWidth(ctx, spec.line, lp) : 0;
    const bw = Math.max(ww + pw + tw, lw);
    const lineGap = px * 0.2;
    const bh = px * (ASC + DESC) + (spec.line ? lineGap + lp * (ASC + DESC) : 0);
    const pad = px * (INK_W + 0.12);
    if (spec.balloon) {
      /* An ellipse that holds the block's corners: a rectangle's corners sit
       * on the ellipse through them at radii of root two times its halves,
       * less a little so the corners may touch the valleys. */
      const rx = bw * 0.5 * 1.24 + px * 0.2;
      const ry = bh * 0.5 * 1.24 + px * 0.3;
      const W = 2 * (rx + px * reach) + px * 0.4;
      const H = 2 * (ry + px * reach) + px * 0.4;
      return {
        px, pp, tp, lp, ww, pw, tw, lw, bw, bh, lineGap, W, H,
        bx: (W - bw) * 0.5, by: (H - bh) * 0.5, rx, ry,
      };
    }
    return {
      px, pp, tp, lp, ww, pw, tw, lw, bw, bh, lineGap,
      W: bw + pad * 2, H: bh + pad * 2, bx: pad, by: pad,
    };
  };
  let m = measure(spec.size);
  if (spec.maxW && m.W > spec.maxW) {
    m = measure(spec.size * (spec.maxW / m.W));
    /* The fit is linear in the size to within a pixel; once more makes it
     * exact rather than nearly. */
    if (m.W > spec.maxW) {
      m = measure(m.px * (spec.maxW / m.W));
    }
  }
  const dpr = dprNow();
  const W = Math.ceil(m.W);
  const H = Math.ceil(m.H);
  canvas.width = Math.ceil(W * dpr);
  canvas.height = Math.ceil(H * dpr);
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const seed = spec.seed || word;
  if (spec.balloon) {
    drawBurst(ctx, W * 0.5, H * 0.5, m.rx, m.ry, seed, m.px, reach);
  }
  const right = spec.align === 'right';
  const base = m.by + m.px * ASC;
  const edgeL = m.bx;
  const edgeR = m.bx + m.bw;
  const opts = { rim: spec.rim, seed };
  /* The first line, word then points then tag, set from the left edge, or
   * from wherever puts its end on the right edge when the lines are right
   * set. */
  let x = (right ? edgeR - (m.ww + m.pw + m.tw) : edgeL) + m.px * INK_W * 0.5;
  if (word) {
    x += drawWord(ctx, word, x, base, m.px, spec.fill, opts);
  }
  if (spec.pts) {
    x += m.px * 0.2;
    x += drawWord(ctx, spec.pts, x, base, m.pp, spec.ptsFill || INKS.cream, opts);
  }
  if (spec.tag) {
    drawWord(ctx, spec.tag, x + m.px * 0.12, base, m.tp, INKS.slate, opts);
  }
  if (spec.line) {
    const lb = base + m.px * DESC + m.lineGap + m.lp * ASC;
    const lx = right ? edgeR - m.lw + m.lp * INK_W * 0.5 : edgeL + m.lp * INK_W * 0.5;
    drawWord(ctx, spec.line, lx, lb, m.lp, spec.lineFill || INKS.cream, opts);
  }
  return { w: W, h: H, px: m.px };
}

/*
 * A sound effect as a canvas of its own, so it can land a beat after the
 * word it belongs to. `px` is one kana's cell.
 */
export function paintSfx(canvas, text, px, fill) {
  const ctx = canvas.getContext('2d');
  const dpr = dprNow();
  const W = Math.ceil(sfxWidth(text, px));
  const H = Math.ceil(px * 1.5);
  canvas.width = Math.ceil(W * dpr);
  canvas.height = Math.ceil(H * dpr);
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  drawSfx(ctx, text, px * 0.08, px * 0.22, px, fill || INKS.cream);
  return { w: W, h: H };
}

/*
 * A TITLE, lettered once into a canvas of its own (polish item 19): the
 * wordmark and the menus' headings in the callouts' hand, so the game's
 * own voice is the one that names its rooms.
 *
 *   runs    [{ text, fill }]: the heading's words in their colours, WEB and
 *           FPV for the wordmark, one run for a room's title
 *   px      its size in CSS pixels, the heading's own font size, so the
 *           lettering takes the room its text already takes
 *   maxW    the widest it may be: it is set smaller to fit, never past
 *   inkW    the outline as a fraction of the size (INK_W unless given)
 *
 * Returns { w, h, px, base, left }: its CSS size, the size it was set at
 * once fitted, its baseline from the canvas's top, and how far in from the
 * canvas's left edge the lettering's own left edge is, so the caller can
 * lay it on the heading's baseline and left edge.
 */
export function paintTitle(canvas, runs, px, opts = {}) {
  const ctx = canvas.getContext('2d');
  const up = runs.map((r) => ({ text: String(r.text).toUpperCase(), fill: hexOf(r.fill) }));
  const text = up.map((r) => r.text).join('');
  const inkW = opts.inkW > 0 ? opts.inkW : INK_W;
  const measure = (s) => {
    const pad = s * (inkW + 0.12);
    return {
      s, pad, W: wordWidth(ctx, text, s, inkW) + pad * 2, H: s * (ASC + DESC) + pad * 2,
    };
  };
  let m = measure(px);
  if (opts.maxW && m.W > opts.maxW) {
    m = measure(px * (opts.maxW / m.W));
    if (m.W > opts.maxW) {
      m = measure(m.s * (opts.maxW / m.W));
    }
  }
  const dpr = dprNow();
  const W = Math.ceil(m.W);
  const H = Math.ceil(m.H);
  canvas.width = Math.ceil(W * dpr);
  canvas.height = Math.ceil(H * dpr);
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const base = m.pad + m.s * ASC;
  drawRuns(ctx, up, m.pad + m.s * inkW * 0.5, base, m.s, { inkW, seed: opts.seed });
  return {
    w: W, h: H, px: m.s, base, left: m.pad,
  };
}

/* A fresh canvas for a callout. aria-hidden, because the words a callout
 * says are spoken by the shell's announcer, not read off a picture. */
export function letterCanvas(cls) {
  const c = document.createElement('canvas');
  c.className = cls || 'lettering';
  c.setAttribute('aria-hidden', 'true');
  return c;
}

/*
 * The widest a left or right column callout may be, in CSS pixels: the
 * outer third of the window, less the column's margin and a hair. The rule
 * is FREESTYLE-MAPS-PLAN.md section 3.3's: nothing drawn in flight covers
 * the centre third, at any width, and this is what makes it so.
 */
export function sideRoom(margin) {
  const w = typeof window !== 'undefined' ? window.innerWidth : 1280;
  return Math.max(80, Math.floor(w / 3 - margin - 8));
}

/* The callout size for a window, from the row size scorehud.js has always
 * used (clamp(15px, 1.85vw, 21px)), a shade larger because a lettered word
 * carries its outline inside the same height. */
export function callSize(scale) {
  const w = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const s = Math.min(24, Math.max(16, w * 0.02));
  return Math.round(s * (scale || 1));
}
