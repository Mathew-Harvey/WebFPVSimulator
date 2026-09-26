/*
 * wallart.js: the whoop room's posters and banners, made from the slap pack.
 *
 * The owner asked for the whoop room's walls to wear "larger versions of the
 * stickers as wall art", made into "posters and or banners", in the sakura
 * theme. The stickers are the slap pack at https://webfpv.org/stickers/,
 * which is the landing repository's stickers/index.html and calls itself the
 * copy of record for every sticker. This reads that file, composes each piece
 * of wall art around one of its stickers, and writes the lot as ONE image and
 * one table:
 *
 *   assets/wallart/atlas.webp     every piece, packed, transparent between
 *   src/art/wallart-atlas.js      where each piece is in it, and its printed
 *                                 size in true metres
 *
 * src/art/wallart.js hangs them. REGENERATE, DO NOT EDIT either output:
 *
 *   npm run gen:wallart                         the live pack
 *   node scripts/wallart.js --pack=FILE         a saved copy of it
 *   ... --preview=FILE.jpg                      also the atlas on grey, to look at
 *
 * WHY A PICTURE AND NOT THE SVG. The stickers are vector and set their type
 * in three faces the pack embeds, subsetted: Zen Kaku Gothic New, Caveat
 * Brush and M PLUS Rounded 1c, under the SIL Open Font License 1.1. Drawn
 * into a WebGL texture at run time, each one would go SVG, Blob, Image,
 * canvas, and the pack's own PNG export, which takes that road, carries a
 * fallback for the browsers where it fails. Here the pieces are laid out as
 * inline SVG in a real page with the pack's font block in its head, which is
 * exactly how the pack shows its own stickers, and Chromium takes one
 * screenshot of the page. Every browser then draws the same pixels, and no
 * font file ships in this repository: the type is pixels by the time it gets
 * here. NOTICE says where the art came from.
 *
 * THE SAKURA THEME, in the pack's own palette: deep, cream, sakura and
 * hinomaru as its print notes list them, the two deeper tints its stickers
 * already use, and paler and darker tints of those four for grounds and
 * discs. The motifs are the pack's too: seigaiha waves, five petal
 * blossoms, loose petals and the hinomaru disc.
 *
 * DETERMINISTIC. Petals and blossoms are placed by a seeded generator, so a
 * regeneration from an unchanged pack is the same picture. The table carries
 * a hash of the image, which the room puts on its URL, so a new atlas is
 * never served from a cache that still holds the old one.
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

import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage } from '../tests/lib/page.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const PACK_URL = 'https://webfpv.org/stickers/';
const ATLAS = 2048;
/* Transparent gutter round every piece, so a mip level of one piece never
 * averages in the edge of its neighbour. */
const GUTTER = 12;
const OUT_IMAGE = 'assets/wallart/atlas.webp';
const OUT_TABLE = 'src/art/wallart-atlas.js';
const WEBP_QUALITY = 0.9;

/* The pack's palette, from its print notes, and the two tints its stickers
 * already carry. The pieces below also use paler and darker tints of these,
 * written where they are used. */
const DEEP = '#141c16';
const CREAM = '#f3ead4';
const SAKURA = '#e8a8b8';
const SAKURA_DEEP = '#d98aa2';
const HINOMARU = '#c14b52';
const HINOMARU_DEEP = '#a03a44';
const INK = '#0c120e';

/* ---------------------------------------------------------------------- *
 * Reading the pack
 * ---------------------------------------------------------------------- */

async function readPack(src) {
  if (/^https?:/.test(src)) {
    const res = await fetch(src);
    if (!res.ok) {
      throw new Error(`the slap pack at ${src} answered ${res.status}`);
    }
    return res.text();
  }
  return readFile(src, 'utf8');
}

/*
 * The pack is one generated file with a regular shape, and this reads that
 * shape and says so loudly when it changes: the font block is every
 * @font-face rule (base64 has no closing brace in it), each sticker is the
 * first svg inside its card, and META is the table the pack's own export
 * code reads for each sticker's printed size.
 */
function parsePack(html) {
  const fontCss = (html.match(/@font-face\{[^}]*\}/g) || []).join('\n');
  if (!fontCss.includes('Zen Kaku Gothic New') || !fontCss.includes('Caveat Brush')) {
    throw new Error('the slap pack has no font block this script recognises');
  }
  const stickers = new Map();
  const card = /<figure class="card" id="card-([A-Za-z0-9_]+)"[^>]*>\s*<div class="art"[^>]*>(<svg[\s\S]*?<\/svg>)<\/div>/g;
  for (const m of html.matchAll(card)) {
    stickers.set(m[1], m[2]);
  }
  const metaText = (html.match(/const META = (\{[\s\S]*?\});/) || [])[1];
  if (!metaText) {
    throw new Error('the slap pack has no META table');
  }
  const meta = JSON.parse(metaText);
  if (stickers.size !== Object.keys(meta).length) {
    throw new Error(`the slap pack lists ${Object.keys(meta).length} stickers and ${stickers.size} were read`);
  }
  return { fontCss, stickers, meta };
}

/* ---------------------------------------------------------------------- *
 * The motifs
 * ---------------------------------------------------------------------- */

/* The same generator the world uses (src/render/scene.js makeRng). */
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const f = (v) => Math.round(v * 100) / 100;

/*
 * Seigaiha, the pack's wave, as rows of concentric scales drawn top to
 * bottom so each row covers the lower half of the one above it, which is
 * all the pattern is. Clipped to its rectangle by the caller.
 */
function seigaiha(x, y, w, h, r, fill, line, lw) {
  let out = '';
  const rows = Math.ceil(h / (r * 0.5)) + 3;
  for (let j = 0; j < rows; j += 1) {
    const cy = y + j * r * 0.5 - r * 0.5;
    const off = (j % 2) * r;
    for (let cx = x - r * 2 + off; cx <= x + w + r * 2; cx += r * 2) {
      out += `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${fill}" stroke="${line}" stroke-width="${lw}"/>`;
      for (const k of [0.74, 0.5, 0.26]) {
        out += `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r * k)}" fill="none" stroke="${line}" stroke-width="${lw}"/>`;
      }
    }
  }
  return out;
}

/* A five petal blossom, each petal notched at its tip the way the pack
 * draws them, with a deeper centre and five stamens. */
function blossom(cx, cy, r, rot, fill, centre) {
  const p = `M0,0 C${f(-0.42 * r)},${f(-0.3 * r)} ${f(-0.52 * r)},${f(-0.82 * r)} ${f(-0.16 * r)},${f(-r)} `
    + `L0,${f(-0.86 * r)} L${f(0.16 * r)},${f(-r)} C${f(0.52 * r)},${f(-0.82 * r)} ${f(0.42 * r)},${f(-0.3 * r)} 0,0Z`;
  let g = `<g transform="translate(${f(cx)},${f(cy)}) rotate(${f(rot)})">`;
  for (let i = 0; i < 5; i += 1) {
    g += `<path d="${p}" fill="${fill}" transform="rotate(${i * 72})"/>`;
  }
  g += `<circle r="${f(r * 0.24)}" fill="${centre}"/>`;
  for (let i = 0; i < 5; i += 1) {
    const a = ((i * 72 + 36) * Math.PI) / 180;
    g += `<circle cx="${f(Math.sin(a) * r * 0.36)}" cy="${f(-Math.cos(a) * r * 0.36)}" r="${f(r * 0.06)}" fill="${centre}"/>`;
  }
  return `${g}</g>`;
}

/* A loose petal, a notched teardrop. */
function petal(cx, cy, s, rot, fill) {
  return `<path transform="translate(${f(cx)},${f(cy)}) rotate(${f(rot)})" fill="${fill}" `
    + `d="M0,${f(s)} C${f(-0.62 * s)},${f(0.3 * s)} ${f(-0.5 * s)},${f(-0.62 * s)} ${f(-0.12 * s)},${f(-s)} `
    + `L0,${f(-0.84 * s)} L${f(0.12 * s)},${f(-s)} C${f(0.5 * s)},${f(-0.62 * s)} ${f(0.62 * s)},${f(0.3 * s)} 0,${f(s)}Z"/>`;
}

/* Petals falling across a rectangle, kept out of one keep-clear box so
 * none of them lands on the sticker. */
function petals(rng, n, x, y, w, h, s, colours, clear) {
  let out = '';
  let placed = 0;
  for (let tries = 0; placed < n && tries < n * 30; tries += 1) {
    const px = x + rng() * w;
    const py = y + rng() * h;
    if (clear && px > clear[0] && px < clear[2] && py > clear[1] && py < clear[3]) {
      continue;
    }
    out += petal(px, py, s * (0.7 + rng() * 0.6), rng() * 360, colours[placed % colours.length]);
    placed += 1;
  }
  return out;
}

/* A sakura branch: an ink stroke that tapers, a twig or two, blossoms and
 * buds along it, the way the pack's sakura branch sticker draws one. */
function branch(rng, pts, width, bark, fill, centre, r) {
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 1; i < pts.length; i += 1) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    d += ` Q${f((x0 + x1) / 2 + (rng() - 0.5) * 30)},${f((y0 + y1) / 2 + (rng() - 0.5) * 30)} ${f(x1)},${f(y1)}`;
  }
  let out = `<path d="${d}" fill="none" stroke="${bark}" stroke-width="${width}" stroke-linecap="round"/>`;
  out += `<path d="${d}" fill="none" stroke="${bark}" stroke-width="${f(width * 0.5)}" stroke-linecap="round" transform="translate(0,${f(width * 0.4)})"/>`;
  for (let i = 1; i < pts.length; i += 1) {
    const [x, y] = pts[i];
    const [px, py] = pts[i - 1];
    const mx = (x + px) / 2;
    const my = (y + py) / 2;
    const tx = mx + (rng() - 0.5) * 70;
    const ty = my - 30 - rng() * 40;
    out += `<path d="M${f(mx)},${f(my)} L${f(tx)},${f(ty)}" stroke="${bark}" stroke-width="${f(width * 0.45)}" stroke-linecap="round"/>`;
    out += blossom(tx, ty, r * (0.8 + rng() * 0.3), rng() * 72, fill, centre);
    out += blossom(x, y, r * (0.9 + rng() * 0.3), rng() * 72, fill, centre);
    out += `<circle cx="${f(mx + 16)}" cy="${f(my + 10)}" r="${f(r * 0.28)}" fill="${centre}"/>`;
  }
  return out;
}

/* A sticker from the pack, nested at a box inside a piece. The pack's own
 * white keyline stays: the art is a sticker, enlarged, on a poster. */
function place(svg, x, y, w, h) {
  return svg.replace(/^<svg\b[^>]*?viewBox="([^"]+)"[^>]*>/,
    (_, vb) => `<svg x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" viewBox="${vb}" overflow="visible">`);
}

function viewBoxOf(svg) {
  const [, , w, h] = svg.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number);
  return { w, h };
}

/* ---------------------------------------------------------------------- *
 * The pieces
 * ---------------------------------------------------------------------- */

/*
 * A POSTER is A0, 841 by 1189 mm, authored in millimetres. A thin deep frame,
 * a paper colour, a disc behind the sticker, a band of seigaiha along the
 * foot, blossoms in two corners and petals over the rest. Seven of them, one
 * frame, so they read as a series rather than seven ideas.
 */
function poster(pack, spec) {
  const W = 841;
  const H = 1189;
  const rng = makeRng(spec.seed);
  const sticker = pack.stickers.get(spec.sticker);
  const vb = viewBoxOf(sticker);
  const sw = spec.width;
  const sh = (sw * vb.h) / vb.w;
  const sx = (W - sw) / 2;
  const sy = spec.cy - sh / 2;
  const frame = 16;
  const bandTop = H - 250;
  let s = `<rect width="${W}" height="${H}" fill="${DEEP}"/>`;
  s += `<rect x="${frame}" y="${frame}" width="${W - frame * 2}" height="${H - frame * 2}" fill="${spec.paper}"/>`;
  s += `<clipPath id="${spec.id}-in"><rect x="${frame}" y="${frame}" width="${W - frame * 2}" height="${H - frame * 2}"/></clipPath>`;
  s += `<g clip-path="url(#${spec.id}-in)">`;
  s += `<clipPath id="${spec.id}-band"><rect x="0" y="${bandTop}" width="${W}" height="${H - bandTop}"/></clipPath>`;
  s += `<g clip-path="url(#${spec.id}-band)">${seigaiha(0, bandTop, W, H - bandTop, 58, spec.wave[0], spec.wave[1], 5)}</g>`;
  s += `<rect x="0" y="${bandTop - 7}" width="${W}" height="7" fill="${spec.wave[1]}"/>`;
  s += `<circle cx="${W / 2}" cy="${f(spec.cy)}" r="${spec.disc[1]}" fill="${spec.disc[0]}"/>`;
  s += petals(rng, spec.petals, frame, frame, W - frame * 2, bandTop - frame, 15, spec.petalColours,
    [sx - 20, sy - 20, sx + sw + 20, sy + sh + 20]);
  for (const b of spec.blossoms) {
    s += blossom(b[0], b[1], b[2], rng() * 72, spec.flower[0], spec.flower[1]);
  }
  if (spec.branch) {
    s += branch(rng, spec.branch, 11, INK, spec.flower[0], spec.flower[1], 30);
  }
  s += place(sticker, sx, sy, sw, sh);
  s += '</g>';
  return { svg: s, vw: W, vh: H, printW: 0.841, printH: 1.189 };
}

/*
 * A BANNER is a printed fabric strip: a sakura ground with a cream hem and
 * brass eyelets, blossoms at the two ends, and one of the pack's own strip
 * stickers across the middle, which already have banner proportions.
 */
function banner(pack, spec) {
  const sticker = pack.stickers.get(spec.sticker);
  const vb = viewBoxOf(sticker);
  const W = spec.lengthMm;
  const sw = W * spec.fill;
  const sh = (sw * vb.h) / vb.w;
  const H = sh + spec.pad * 2;
  const rng = makeRng(spec.seed);
  const hem = 26;
  let s = `<rect width="${f(W)}" height="${f(H)}" fill="${CREAM}"/>`;
  s += `<rect x="${hem}" y="${hem}" width="${f(W - hem * 2)}" height="${f(H - hem * 2)}" fill="${spec.ground}"/>`;
  s += `<clipPath id="${spec.id}-in"><rect x="${hem}" y="${hem}" width="${f(W - hem * 2)}" height="${f(H - hem * 2)}"/></clipPath>`;
  s += `<g clip-path="url(#${spec.id}-in)">`;
  s += petals(rng, spec.petals, hem, hem, W - hem * 2, H - hem * 2, 20, [CREAM, SAKURA_DEEP],
    [(W - sw) / 2 - 30, 0, (W + sw) / 2 + 30, H]);
  const ends = (W - sw) / 2;
  for (const side of [0, 1]) {
    const cx = side ? W - ends / 2 : ends / 2;
    s += blossom(cx, H * 0.36, H * 0.17, rng() * 72, CREAM, HINOMARU);
    s += blossom(cx + (side ? -1 : 1) * ends * 0.18, H * 0.7, H * 0.12, rng() * 72, CREAM, HINOMARU);
  }
  s += place(sticker, (W - sw) / 2, spec.pad, sw, sh);
  s += '</g>';
  for (const ex of [hem * 1.6, W / 2, W - hem * 1.6]) {
    s += `<circle cx="${f(ex)}" cy="${hem * 0.5 + 2}" r="9" fill="#c9a74a" stroke="${INK}" stroke-width="3"/>`;
  }
  return { svg: s, vw: W, vh: H, printW: W / 1000, printH: H / 1000 };
}

/* A sticker on its own at a printed size, keyline and all: the brush banner
 * is already a nobori, a hanging banner with a swallowtail foot. */
function alone(pack, spec) {
  const sticker = pack.stickers.get(spec.sticker);
  const vb = viewBoxOf(sticker);
  const W = spec.widthMm;
  const H = (W * vb.h) / vb.w;
  return { svg: place(sticker, 0, 0, W, H), vw: W, vh: H, printW: W / 1000, printH: H / 1000 };
}

/* The cut vinyl wordmark, which the pack prints in one colour, cut in
 * another for a pale wall: the pack's cream would vanish on sakura plaster. */
function vinyl(pack, spec) {
  const piece = alone(pack, spec);
  piece.svg = piece.svg.replace(/#f3ead4/gi, spec.colour);
  return piece;
}

/*
 * THE SET. Each entry is one piece of art; the room decides where each one
 * hangs, and may hang one twice. Sizes are in millimetres of print. The
 * sticker keys are the pack's own; a key the pack drops fails the run.
 */
function pieces(pack) {
  return {
    posterChibi: poster(pack, {
      id: 'pc', sticker: 'p01_1e', seed: 11, paper: '#f2c3ce', width: 600, cy: 520,
      disc: [CREAM, 330], wave: [SAKURA, '#f8dde4'], flower: [CREAM, HINOMARU],
      petals: 22, petalColours: [CREAM, SAKURA_DEEP],
      blossoms: [[120, 130, 62], [215, 210, 40], [720, 860, 56]],
    }),
    posterBubble: poster(pack, {
      id: 'pb', sticker: 'p05_5c', seed: 12, paper: DEEP, width: 560, cy: 520,
      disc: [HINOMARU, 320], wave: [DEEP, '#34463a'], flower: [SAKURA, HINOMARU],
      petals: 26, petalColours: [SAKURA, SAKURA_DEEP],
      blossoms: [[720, 120, 60], [640, 200, 38], [115, 860, 52]],
    }),
    posterCity: poster(pack, {
      id: 'py', sticker: 'p01_1f', seed: 13, paper: CREAM, width: 690, cy: 560,
      disc: ['#f1cdd6', 340], wave: [CREAM, '#e0c9bd'], flower: [SAKURA, HINOMARU],
      petals: 24, petalColours: [SAKURA, SAKURA_DEEP],
      blossoms: [],
      branch: [[40, 120], [230, 190], [420, 150], [620, 230], [800, 210]],
    }),
    posterPilot: poster(pack, {
      id: 'pp', sticker: 'p06_6i', seed: 14, paper: '#f6dde3', width: 590, cy: 540,
      disc: [SAKURA, 320], wave: ['#f6dde3', SAKURA_DEEP], flower: [SAKURA, HINOMARU],
      petals: 22, petalColours: [SAKURA, SAKURA_DEEP],
      blossoms: [[110, 120, 58], [735, 150, 48], [700, 860, 44]],
    }),
    posterSea: poster(pack, {
      id: 'ps', sticker: 'p05_5a_hinomaru_sea', seed: 15, paper: HINOMARU, width: 600, cy: 520,
      disc: [HINOMARU_DEEP, 330], wave: [HINOMARU, '#d9707a'], flower: [CREAM, HINOMARU_DEEP],
      petals: 24, petalColours: [CREAM, SAKURA],
      blossoms: [[115, 125, 58], [730, 140, 44], [110, 860, 40]],
    }),
    posterGoggles: poster(pack, {
      id: 'pg', sticker: 'p05_5g', seed: 16, paper: CREAM, width: 700, cy: 540,
      disc: [SAKURA, 300], wave: [CREAM, SAKURA_DEEP], flower: [SAKURA, HINOMARU],
      petals: 20, petalColours: [SAKURA, SAKURA_DEEP],
      blossoms: [],
      branch: [[800, 90], [610, 170], [430, 120], [240, 190], [50, 160]],
    }),
    posterEma: poster(pack, {
      id: 'pe', sticker: 'p06_6e', seed: 17, paper: DEEP, width: 620, cy: 560,
      disc: ['#2b3a30', 330], wave: [DEEP, '#34463a'], flower: [SAKURA, HINOMARU],
      petals: 26, petalColours: [SAKURA, SAKURA_DEEP],
      blossoms: [[725, 860, 54]],
      branch: [[40, 140], [220, 110], [410, 190], [600, 130], [800, 175]],
    }),
    bannerVisor: banner(pack, {
      id: 'bv', sticker: 'p03_3b', seed: 21, lengthMm: 4400, fill: 0.78, pad: 90, ground: SAKURA, petals: 30,
    }),
    bannerWave: banner(pack, {
      id: 'bw', sticker: 'p05_5d_wave_strip', seed: 22, lengthMm: 4400, fill: 0.78, pad: 90, ground: SAKURA, petals: 30,
    }),
    nobori: alone(pack, { sticker: 'p02_2e', widthMm: 660 }),
    wordmark: vinyl(pack, { sticker: 'p06_6a', widthMm: 3000, colour: HINOMARU }),
  };
}

/* ---------------------------------------------------------------------- *
 * Packing and rendering
 * ---------------------------------------------------------------------- */

/*
 * Skyline packing, bottom left, at one texel density for the whole set, so a
 * poster and the banner beside it are equally sharp. The density starts high
 * and steps down until everything fits, trying two orders at each step, and
 * the one it settles on is printed. A banner wider than the atlas is capped
 * at the atlas and keeps its proportions, so only banners can come out
 * softer than the rest.
 */
function skyline(items) {
  let sky = [{ x: 0, y: 0, w: ATLAS - GUTTER }];
  const out = {};
  for (const it of items) {
    const w = it.w + GUTTER;
    const h = it.h + GUTTER;
    let best = null;
    for (let i = 0; i < sky.length; i += 1) {
      const x = sky[i].x;
      if (x + w > ATLAS - GUTTER) {
        break;
      }
      let y = 0;
      for (let j = i; j < sky.length && sky[j].x < x + w; j += 1) {
        y = Math.max(y, sky[j].y);
      }
      if (y + h > ATLAS - GUTTER) {
        continue;
      }
      if (!best || y + h < best.y + best.h || (y + h === best.y + best.h && x < best.x)) {
        best = { x, y, h };
      }
    }
    if (!best) {
      return null;
    }
    out[it.name] = { x: best.x + GUTTER, y: best.y + GUTTER, w: it.w, h: it.h };
    const next = [];
    for (const seg of sky) {
      const end = seg.x + seg.w;
      if (end <= best.x || seg.x >= best.x + w) {
        next.push(seg);
        continue;
      }
      if (seg.x < best.x) {
        next.push({ x: seg.x, y: seg.y, w: best.x - seg.x });
      }
      if (end > best.x + w) {
        next.push({ x: best.x + w, y: seg.y, w: end - best.x - w });
      }
    }
    next.push({ x: best.x, y: best.y + h, w });
    sky = next.sort((a, b) => a.x - b.x);
  }
  return out;
}

function packAtlas(set) {
  const names = Object.keys(set);
  const room = ATLAS - GUTTER * 2;
  for (let pxPerM = 640; pxPerM > 120; pxPerM -= 5) {
    const items = names.map((n) => {
      const cap = Math.min(1, room / (set[n].printW * pxPerM));
      return {
        name: n,
        w: Math.round(set[n].printW * pxPerM * cap),
        h: Math.round(set[n].printH * pxPerM * cap),
      };
    });
    for (const order of [(a, b) => b.h - a.h, (a, b) => b.w * b.h - a.w * a.h]) {
      const rects = skyline([...items].sort(order));
      if (rects) {
        return { rects, pxPerM };
      }
    }
  }
  throw new Error('the wall art does not fit the atlas at any density');
}

function atlasPage(packData, set, rects) {
  let body = '';
  for (const [name, r] of Object.entries(rects)) {
    const p = set[name];
    body += `<svg xmlns="http://www.w3.org/2000/svg" style="position:absolute;left:${r.x}px;top:${r.y}px" `
      + `width="${r.w}" height="${r.h}" viewBox="0 0 ${f(p.vw)} ${f(p.vh)}" preserveAspectRatio="none">${p.svg}</svg>`;
  }
  return `<!doctype html><html><head><meta charset="utf-8"><style>${packData.fontCss}
html,body{margin:0;padding:0;background:transparent;width:${ATLAS}px;height:${ATLAS}px;overflow:hidden}
</style></head><body>${body}</body></html>`;
}

async function render(html) {
  const dir = await mkdtemp(join(tmpdir(), 'wallart-'));
  await writeFile(join(dir, 'atlas.html'), html);
  const page = await openPage({ root: dir, width: ATLAS, height: ATLAS, url: '/atlas.html' });
  try {
    await page.until('document.readyState === "complete"');
    /* Every face the pack embeds, loaded, before one pixel is taken: a
     * screenshot in a fallback face would be a quiet, permanent fault. */
    const faces = await page.evaluate(`Promise.all([...document.fonts].map((x) => x.load()))
      .then(() => document.fonts.ready)
      .then(() => [...document.fonts].map((x) => ({ name: x.family + ' ' + x.weight, status: x.status })))`);
    const bad = faces.filter((x) => x.status !== 'loaded');
    if (faces.length < 3 || bad.length) {
      throw new Error(`fonts not loaded: ${bad.map((x) => `${x.name} ${x.status}`).join(', ') || 'none declared'}`);
    }
    await page.cdp.send('Emulation.setDefaultBackgroundColorOverride', {
      color: { r: 0, g: 0, b: 0, a: 0 },
    }, page.sessionId);
    await page.sleep(300);
    const shot = await page.cdp.send('Page.captureScreenshot', {
      format: 'png', clip: { x: 0, y: 0, width: ATLAS, height: ATLAS, scale: 1 },
    }, page.sessionId);
    await writeFile(join(dir, 'atlas.png'), Buffer.from(shot.data, 'base64'));
    /* Re-encoded in the page, where the codec is: a lossy WebP keeps the
     * alpha the nobori's swallowtail and the vinyl's letters need, at a
     * fraction of the PNG. The preview is the same pixels on a mid grey,
     * for a person to look at. */
    const [webp, preview] = await page.evaluate(`(async () => {
      const img = new Image();
      img.src = '/atlas.png';
      await img.decode();
      const c = document.createElement('canvas');
      c.width = ${ATLAS}; c.height = ${ATLAS};
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      const webp = c.toDataURL('image/webp', ${WEBP_QUALITY}).split(',')[1];
      g.fillStyle = '#808080';
      g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0);
      return [webp, c.toDataURL('image/jpeg', 0.85).split(',')[1]];
    })()`);
    return { faces, webp: Buffer.from(webp, 'base64'), preview: Buffer.from(preview, 'base64') };
  } finally {
    await page.close();
    await rm(dir, { recursive: true, force: true });
  }
}

function tableSource(rects, set, rev, pxPerM) {
  const lines = Object.keys(rects).sort().map((n) => {
    const r = rects[n];
    const p = set[n];
    return `    ${n}: { x: ${r.x}, y: ${r.y}, w: ${r.w}, h: ${r.h}, printW: ${Math.round(p.printW * 1000) / 1000}, printH: ${Math.round(p.printH * 1000) / 1000} },`;
  });
  return `/*
 * wallart-atlas.js: where each piece of the whoop room's wall art is in
 * ${OUT_IMAGE}, and its printed size in true metres. GENERATED by
 * scripts/wallart.js from the slap pack: regenerate, do not edit.
 *
 * x, y, w, h are atlas pixels from the top left. printW and printH are
 * what the piece measures on a real wall; the room multiplies them by
 * MICRO_SCALE like every other length in it. rev is a hash of the image,
 * for its URL. Packed at ${pxPerM} px per printed metre.
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

export const WALLART = {
  url: '${OUT_IMAGE}',
  rev: '${rev}',
  size: ${ATLAS},
  pieces: {
${lines.join('\n')}
  },
};
`;
}

async function main() {
  const opt = (name) => {
    const a = process.argv.slice(2).find((x) => x.startsWith(`--${name}=`));
    return a ? a.slice(name.length + 3) : null;
  };
  const src = opt('pack') ?? PACK_URL;
  const packData = parsePack(await readPack(src));
  const set = pieces(packData);
  const { rects, pxPerM } = packAtlas(set);
  const { faces, webp, preview } = await render(atlasPage(packData, set, rects));
  if (opt('preview')) {
    await writeFile(opt('preview'), preview);
  }
  const rev = createHash('sha256').update(webp).digest('hex').slice(0, 12);
  await mkdir(join(root, dirname(OUT_IMAGE)), { recursive: true });
  await writeFile(join(root, OUT_IMAGE), webp);
  await writeFile(join(root, OUT_TABLE), tableSource(rects, set, rev, pxPerM));
  console.log(`read ${packData.stickers.size} stickers from ${src}`);
  console.log(`fonts ${faces.map((x) => x.name).join(', ')}, all loaded`);
  console.log(`${Object.keys(rects).length} pieces at ${pxPerM} px per printed metre`);
  console.log(`wrote ${OUT_IMAGE} (${(webp.length / 1024).toFixed(0)} KB, rev ${rev}) and ${OUT_TABLE}`);
}

main().catch((e) => {
  console.error(e.stack || e.message);
  process.exit(1);
});
