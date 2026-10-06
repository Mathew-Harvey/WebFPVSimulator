/*
 * partners.js: the partners' one colour marks, made, and the roster checked
 * against its files.
 *
 * Usage:
 *   node scripts/partners.js           make what can be made, then check
 *   node scripts/partners.js --check   check only, and fail on a made file
 *                                      that is not what this would make now
 *
 * (npm run gen:partners and npm run lint:partners.)
 *
 * WHAT IS MADE, AND WHAT IS NOT. Each partner has a colour file, their own
 * artwork, and a one colour file in the palette's cream for the chrome (see
 * src/partners/roster.js). Where the one colour file follows from the colour
 * one by a rule, it is made here and never edited:
 *
 *   mantisfpv/mono.svg  the official SVG with its sticker outline taken off
 *                       (the black border and the white one inside it, the
 *                       file's first two paths) and every letter in cream.
 *   wcmrc/mono.png      the club's PNG with every pixel's colour set to
 *                       cream and its alpha kept exactly, so the drone and
 *                       the lettering keep their shape and lose their blues.
 *
 * And one mark that is not a partner's:
 *
 *   assets/credits/betaflight-mono.svg
 *                       Betaflight's logo from the credits, its two colours
 *                       (the yellow of the bird and BETA, the white of
 *                       FLIGHT) both set to cream, for "Powered by" at the
 *                       foot of the loading screen. It stood with the
 *                       partners' on the front door and the board for a day
 *                       on 2026-09-27 and came off both: Betaflight's
 *                       permission covers its logo in the game, and those
 *                       pages publicise the project (NOTICE). It is not in
 *                       the roster: Betaflight has no card on the partners
 *                       page, no login and no painted wall.
 *
 * gds/mono.svg is NOT made here. It is the redraw's own one colour version,
 * recoloured cream once by hand, because the colour file carries a gradient,
 * a drop shadow and an outline stroke, and a rule that takes those off is a
 * rule that would be wrong the day GDS send a file drawn differently. It is
 * checked like the others.
 *
 * WHAT IS CHECKED, and every line says what it found:
 *
 *   the roster    slugs unique and in the board's SOURCE_RE shape and not a
 *                 word the board reserves; a role with a title; names, short
 *                 names and drafts present, with no en or em dash; every link
 *                 https, of a known kind, the site first; no link to
 *                 wcmrc.com.au, which is a different club; a field colour.
 *   the files     both logo files there; each one's own width over height
 *                 within half a per cent of the roster's aspect, from an SVG's
 *                 viewBox or a PNG's header.
 *   one colour    a one colour SVG names no colour but cream and no paint
 *                 but flat fill: no gradient, filter, pattern, image or
 *                 stroke colour. It does not follow inheritance, so a path
 *                 left with no fill at all would draw in the default black
 *                 and pass: look at a new file once. A one colour PNG is
 *                 cream wherever it is not fully transparent.
 *   made files    with --check, each made file is what this would make now:
 *                 the SVG byte for byte, the PNG pixel for pixel, because
 *                 zlib is free to compress the same pixels differently on
 *                 another version.
 *
 * The PNG reader here takes exactly what the partners have sent, eight bit
 * RGBA without interlacing, and refuses anything else by name rather than
 * guessing. The writer is the same one scripts/icons.js carries.
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

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync, inflateSync } from 'node:zlib';
import {
  LINK_KINDS, LOGO_DIR, PARTNERS, MAP_ONLY_PARTNERS, PATRON_MAP_BRANDS, ROLE_TITLES,
} from '../src/partners/roster.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const CHECK_ONLY = process.argv.includes('--check');

/* The palette's cream, the one colour of every one colour mark. */
const CREAM = '#f3ead4';
const CREAM_RGB = [0xf3, 0xea, 0xd4];

/* The board's SOURCE_RE (src/sponsors.js in the board's repository) and the
 * two words it keeps for itself. A slug outside this would be folded into
 * "other" by the board and the partner's tracking link would count for
 * nobody. */
const SLUG_RE = /^[a-z0-9-]{2,32}$/;
const RESERVED = new Set(['direct', 'other']);

/* How far a file's own shape may be from the roster's aspect. */
const ASPECT_SLACK = 0.005;

const at = (rel) => join(root, LOGO_DIR, rel);

/* ------------------------------------------------------------------ */
/* PNG                                                                 */
/* ------------------------------------------------------------------ */

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) {
      c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/* Eight bit RGBA, not interlaced, or an error that says which it is not. */
function readPng(buf, name) {
  if (!buf.subarray(0, 8).equals(SIGNATURE)) {
    throw new Error(`${name} is not a PNG`);
  }
  let pos = 8;
  let w = 0;
  let h = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      const [depth, colour, , , interlace] = data.subarray(8, 13);
      if (depth !== 8 || colour !== 6 || interlace !== 0) {
        throw new Error(`${name} is ${depth} bit, colour type ${colour}, interlace ${interlace}: this reads 8 bit RGBA, not interlaced`);
      }
    } else if (type === 'IDAT') {
      idat.push(data);
    }
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * 4;
  const px = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x += 1) {
      const a = x >= 4 ? px[y * stride + x - 4] : 0;
      const b = y > 0 ? px[(y - 1) * stride + x] : 0;
      const c = x >= 4 && y > 0 ? px[(y - 1) * stride + x - 4] : 0;
      let v = line[x];
      if (filter === 1) {
        v += a;
      } else if (filter === 2) {
        v += b;
      } else if (filter === 3) {
        v += (a + b) >> 1;
      } else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : (pb <= pc ? b : c);
      } else if (filter !== 0) {
        throw new Error(`${name}: row ${y} has filter ${filter}, which no PNG has`);
      }
      px[y * stride + x] = v & 255;
    }
  }
  return { w, h, px };
}

function writePng({ w, h, px }) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y += 1) {
    raw[y * (w * 4 + 1)] = 0;
    px.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ------------------------------------------------------------------ */
/* What is made                                                        */
/* ------------------------------------------------------------------ */

/* The club's mark in cream: every pixel's colour replaced, its alpha kept. */
function creamPng(img) {
  const px = Buffer.from(img.px);
  for (let i = 0; i < px.length; i += 4) {
    px[i] = CREAM_RGB[0];
    px[i + 1] = CREAM_RGB[1];
    px[i + 2] = CREAM_RGB[2];
  }
  return { w: img.w, h: img.h, px };
}

/*
 * Quad Configurator's mark in cream with navy keyed out. The logo has a navy
 * #323f5d background that needs to be transparent in the mono version, so the
 * sign is the mark itself (the text and quad icon) rather than a solid block.
 * Pixels close to navy (within 20 units per channel) go transparent, the rest
 * become cream and keep their alpha.
 */
function quadconfigMono(img) {
  const px = Buffer.from(img.px);
  const navy = [0x32, 0x3f, 0x5d];
  const threshold = 20;
  for (let i = 0; i < px.length; i += 4) {
    const rDiff = Math.abs(px[i] - navy[0]);
    const gDiff = Math.abs(px[i + 1] - navy[1]);
    const bDiff = Math.abs(px[i + 2] - navy[2]);
    if (rDiff <= threshold && gDiff <= threshold && bDiff <= threshold) {
      // Navy background: make transparent
      px[i + 3] = 0;
    } else {
      // Not navy: make cream and keep alpha
      px[i] = CREAM_RGB[0];
      px[i + 1] = CREAM_RGB[1];
      px[i + 2] = CREAM_RGB[2];
    }
  }
  return { w: img.w, h: img.h, px };
}

/*
 * Mantis FPV's mark in cream. Their 2022 SVG draws a sticker: a black
 * outline round the whole word, a white one inside it, then the letters,
 * black for Mantis and green for FPV, then the registered mark. The one
 * colour mark is the letters and the registered mark on their own, so the
 * first two paths go and every fill becomes the root's cream.
 */
function mantisMono(src) {
  const body = src
    .replace(/<\?xml[^>]*\?>\s*/, '')
    .replace(/<!--[\s\S]*?-->\s*/g, '');
  const paths = [...body.matchAll(/<path\b[^>]*\/>/g)];
  if (paths.length < 3 || !/fill="#FFFFFF"/i.test(paths[1][0]) || /fill=/.test(paths[0][0])) {
    throw new Error('mantisfpv/colour.svg is not drawn the way this expects: its first path should be the black outline and its second the white one');
  }
  const kept = body.slice(0, paths[0].index)
    + body.slice(paths[1].index + paths[1][0].length);
  const svg = kept
    .replace(/\s+fill="#[0-9A-Fa-f]{6}"/g, '')
    .replace('<svg ', `<svg fill="${CREAM}" `);
  return `<!-- Mantis FPV, one colour: their 2022 logo with the sticker outline taken off and every letter in the palette's cream. Made by scripts/partners.js from colour.svg in this folder; regenerate, do not edit. The mark is Mantis FPV's, used with permission (NOTICE). -->\n${svg}`;
}

/*
 * Betaflight's mark in cream. The file draws with two classes in a style
 * block, .st1 (yellow) and .st2 (white), and nothing else paints: both
 * become cream, the Illustrator declaration and comment go, and the rest is
 * the file as it is.
 */
function betaflightMono(src) {
  const body = src
    .replace(/<\?xml[^>]*\?>\s*/, '')
    .replace(/<!--[\s\S]*?-->\s*/g, '');
  if (!/\.st1\{fill:#FFBB00;\}/.test(body) || !/\.st2\{fill:#FFFFFF;\}/.test(body) || /fill="/.test(body)) {
    throw new Error('assets/credits/betaflight.svg is not drawn the way this expects: two style classes, yellow and white, and no fill attributes');
  }
  const svg = body
    .replace('.st1{fill:#FFBB00;}', `.st1{fill:${CREAM};}`)
    .replace('.st2{fill:#FFFFFF;}', `.st2{fill:${CREAM};}`);
  return `<!-- Betaflight's mark, one colour: the logo in betaflight.svg in this folder with both of its colours set to the palette's cream, for Powered by on the loading screen. Made by scripts/partners.js; regenerate, do not edit. The mark is the Betaflight project's (NOTICE). -->\n${svg}`;
}

/* ------------------------------------------------------------------ */
/* The check                                                           */
/* ------------------------------------------------------------------ */

let failures = 0;
let passes = 0;
function check(label, ok, why = '') {
  if (ok) {
    passes += 1;
    console.log(`  ok    ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${label}${why ? `: ${why}` : ''}`);
  }
}

const DASH = /[\u2013\u2014]/;

function aspectOf(rel) {
  const buf = readFileSync(at(rel));
  if (rel.endsWith('.png')) {
    return buf.readUInt32BE(16) / buf.readUInt32BE(20);
  }
  const box = String(buf).match(/viewBox="\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*"/);
  return box ? Number(box[1]) / Number(box[2]) : NaN;
}

/* Every colour a one colour SVG names, and every kind of paint it uses that
 * is not a flat fill. */
function svgPaint(text) {
  const colours = new Set();
  for (const m of text.matchAll(/(?:fill|stroke|stop-color|flood-color|color)\s*[=:]\s*"?\s*(#[0-9a-fA-F]{3,8}|rgb[a]?\([^)]*\)|[a-z]+)/g)) {
    const c = m[1].toLowerCase();
    if (c !== 'none' && c !== 'currentcolor' && c !== 'inherit') {
      colours.add(c);
    }
  }
  const banned = ['linearGradient', 'radialGradient', 'filter', 'pattern', 'image']
    .filter((tag) => new RegExp(`<${tag}\\b`).test(text));
  const stroked = /\bstroke\s*=\s*"(?!none)/.test(text);
  return { colours: [...colours], banned, stroked };
}

function checkRoster() {
  console.log('\nthe roster');
  const slugs = PARTNERS.map((p) => p.slug);
  check(`${PARTNERS.length} partners, slugs unique`, new Set(slugs).size === slugs.length);
  for (const p of PARTNERS) {
    const who = p.slug;
    check(`${who}: slug is a board source`, SLUG_RE.test(p.slug) && !RESERVED.has(p.slug));
    check(`${who}: role "${p.role}" has a title`, Boolean(ROLE_TITLES[p.role]));
    check(`${who}: name, short name and draft present`,
      [p.name, p.short, p.about].every((s) => typeof s === 'string' && s.trim().length > 0));
    const words = [p.name, p.short, p.about, ...p.links.map((l) => l.label)];
    check(`${who}: no en or em dash in anything printed`, !words.some((s) => DASH.test(s)));
    check(`${who}: the first link is the site`, p.links.length > 0 && p.links[0].kind === 'site');
    check(`${who}: logo is present`, p.logo && p.logo.colour && p.logo.mono);
    for (const l of p.links) {
      let url = null;
      try {
        url = new URL(l.href);
      } catch (e) {
        url = null;
      }
      check(`${who}: ${l.kind} link is https and a known kind`,
        Boolean(url) && url.protocol === 'https:' && LINK_KINDS.includes(l.kind) && Boolean(l.label));
      check(`${who}: ${l.kind} link is not wcmrc.com.au`, !url || !/(^|\.)wcmrc\.com\.au$/.test(url.hostname));
    }
    check(`${who}: the paint's field is a colour`, /^#[0-9a-f]{6}$/.test(p.mark.field));
  }
  
  console.log('\nthe maps-only partners');
  const mapOnlySlugs = MAP_ONLY_PARTNERS.map((p) => p.slug);
  check(`${MAP_ONLY_PARTNERS.length} maps-only partners, slugs unique`, new Set(mapOnlySlugs).size === mapOnlySlugs.length);
  let allSlugs = [...slugs, ...mapOnlySlugs];
  check('no slug collision between PARTNERS and MAP_ONLY_PARTNERS', new Set(allSlugs).size === allSlugs.length);
  for (const p of MAP_ONLY_PARTNERS) {
    const who = p.slug;
    check(`${who}: slug is a board source`, SLUG_RE.test(p.slug) && !RESERVED.has(p.slug));
    check(`${who}: has no role (maps-only partners are not categorized)`, !p.role);
    check(`${who}: name, short name and draft present`,
      [p.name, p.short, p.about].every((s) => typeof s === 'string' && s.trim().length > 0));
    const words = [p.name, p.short, p.about, ...p.links.map((l) => l.label)];
    check(`${who}: no en or em dash in anything printed`, !words.some((s) => DASH.test(s)));
    check(`${who}: the first link is the site`, p.links.length > 0 && p.links[0].kind === 'site');
    check(`${who}: logo is present`, p.logo && p.logo.colour && p.logo.mono);
    for (const l of p.links) {
      let url = null;
      try {
        url = new URL(l.href);
      } catch (e) {
        url = null;
      }
      check(`${who}: ${l.kind} link is https and a known kind`,
        Boolean(url) && url.protocol === 'https:' && LINK_KINDS.includes(l.kind) && Boolean(l.label));
      check(`${who}: ${l.kind} link is not wcmrc.com.au`, !url || !/(^|\.)wcmrc\.com\.au$/.test(url.hostname));
    }
    check(`${who}: the paint's field is a colour`, /^#[0-9a-f]{6}$/.test(p.mark.field));
  }
  
  console.log('\nthe patron map brands');
  const patronSlugs = PATRON_MAP_BRANDS.map((p) => p.slug);
  check(`${PATRON_MAP_BRANDS.length} patron brands, slugs unique`, new Set(patronSlugs).size === patronSlugs.length);
  allSlugs = [...allSlugs, ...patronSlugs];
  check('no slug collision across PARTNERS, MAP_ONLY_PARTNERS, and PATRON_MAP_BRANDS', new Set(allSlugs).size === allSlugs.length);
  for (const p of PATRON_MAP_BRANDS) {
    const who = p.slug;
    check(`${who}: slug is a board source`, SLUG_RE.test(p.slug) && !RESERVED.has(p.slug));
    check(`${who}: has no role (patrons are not categorized)`, !p.role);
    check(`${who}: name and short name present`,
      [p.name, p.short].every((s) => typeof s === 'string' && s.trim().length > 0));
    const words = [p.name, p.short];
    check(`${who}: no en or em dash in name or short`, !words.some((s) => DASH.test(s)));
    if (p.logo) {
      check(`${who}: logo has colour and mono`, p.logo.colour && p.logo.mono);
    } else {
      check(`${who}: text-only patron (no logo)`, true);
    }
    check(`${who}: the paint's field is a colour`, /^#[0-9a-f]{6}$/.test(p.mark.field));
  }
}

function checkFiles(made) {
  console.log('\nthe files');
  const allPartners = [...PARTNERS, ...MAP_ONLY_PARTNERS];
  for (const p of allPartners) {
    for (const which of ['colour', 'mono']) {
      const rel = p.logo[which];
      let aspect = NaN;
      try {
        aspect = aspectOf(rel);
      } catch (e) {
        check(`${p.slug}: ${rel} is there`, false, e.code || e.message);
        continue;
      }
      check(`${p.slug}: ${rel} is ${aspect.toFixed(3)} wide to 1 tall, the roster says ${p.logo.aspect.toFixed(3)}`,
        Math.abs(aspect / p.logo.aspect - 1) <= ASPECT_SLACK);
    }
    const mono = p.logo.mono;
    if (mono.endsWith('.svg')) {
      const { colours, banned, stroked } = svgPaint(readFileSync(at(mono), 'utf8'));
      check(`${p.slug}: ${mono} names cream and nothing else`,
        colours.length === 1 && colours[0] === CREAM, `it names ${colours.join(', ') || 'no colour'}`);
      check(`${p.slug}: ${mono} is flat fill only`, !banned.length && !stroked,
        [...banned, ...(stroked ? ['a stroke'] : [])].join(', '));
    } else {
      const img = readPng(readFileSync(at(mono)), mono);
      let off = 0;
      for (let i = 0; i < img.px.length; i += 4) {
        if (img.px[i + 3] > 0 && (img.px[i] !== CREAM_RGB[0] || img.px[i + 1] !== CREAM_RGB[1] || img.px[i + 2] !== CREAM_RGB[2])) {
          off += 1;
        }
      }
      check(`${p.slug}: ${mono} is cream wherever it is not clear`, off === 0, `${off} pixels are another colour`);
    }
  }
  
  console.log('\nthe patron files');
  for (const p of PATRON_MAP_BRANDS) {
    if (!p.logo) {
      check(`${p.slug}: text-only patron, no files to check`, true);
      continue;
    }
    for (const which of ['colour', 'mono']) {
      const rel = p.logo[which];
      let aspect = NaN;
      try {
        aspect = aspectOf(rel);
      } catch (e) {
        check(`${p.slug}: ${rel} is there`, false, e.code || e.message);
        continue;
      }
      check(`${p.slug}: ${rel} is ${aspect.toFixed(3)} wide to 1 tall, the roster says ${p.logo.aspect.toFixed(3)}`,
        Math.abs(aspect / p.logo.aspect - 1) <= ASPECT_SLACK);
    }
    const mono = p.logo.mono;
    if (mono.endsWith('.svg')) {
      const { colours, banned, stroked } = svgPaint(readFileSync(at(mono), 'utf8'));
      check(`${p.slug}: ${mono} names cream and nothing else`,
        colours.length === 1 && colours[0] === CREAM, `it names ${colours.join(', ') || 'no colour'}`);
      check(`${p.slug}: ${mono} is flat fill only`, !banned.length && !stroked,
        [...banned, ...(stroked ? ['a stroke'] : [])].join(', '));
    } else {
      const img = readPng(readFileSync(at(mono)), mono);
      let off = 0;
      for (let i = 0; i < img.px.length; i += 4) {
        if (img.px[i + 3] > 0 && (img.px[i] !== CREAM_RGB[0] || img.px[i + 1] !== CREAM_RGB[1] || img.px[i + 2] !== CREAM_RGB[2])) {
          off += 1;
        }
      }
      check(`${p.slug}: ${mono} is cream wherever it is not clear`, off === 0, `${off} pixels are another colour`);
    }
  }
  if (!made) {
    return;
  }
  console.log('\nthe made files, as this would make them now');
  for (const m of made) {
    if (m.kind === 'svg') {
      check(`${m.rel} is current`, readFileSync(at(m.rel), 'utf8') === m.body, 'run npm run gen:partners');
    } else {
      const got = readPng(readFileSync(at(m.rel)), m.rel);
      check(`${m.rel} is current`, got.w === m.img.w && got.h === m.img.h && got.px.equals(m.img.px),
        'run npm run gen:partners');
    }
  }
  /* Betaflight's mark is in no roster entry, so the one colour rule above
   * never reaches it: it is held to the same rule here. */
  for (const m of made.filter((x) => x.kind === 'svg' && x.rel.includes('credits/'))) {
    const { colours, banned, stroked } = svgPaint(m.body);
    check(`${m.rel} names cream and nothing else`,
      colours.length === 1 && colours[0] === CREAM, `it names ${colours.join(', ') || 'no colour'}`);
    check(`${m.rel} is flat fill only`, !banned.length && !stroked, [...banned, ...(stroked ? ['a stroke'] : [])].join(', '));
  }
}

/* ------------------------------------------------------------------ */

const made = [
  { kind: 'svg', rel: 'mantisfpv/mono.svg', body: mantisMono(readFileSync(at('mantisfpv/colour.svg'), 'utf8')) },
  { kind: 'png', rel: 'wcmrc/mono.png', img: creamPng(readPng(readFileSync(at('wcmrc/colour.png')), 'wcmrc/colour.png')) },
  { kind: 'png', rel: 'mattsflooring/mono.png', img: creamPng(readPng(readFileSync(at('mattsflooring/colour.png')), 'mattsflooring/colour.png')) },
  { kind: 'png', rel: 'quadconfig/mono.png', img: quadconfigMono(readPng(readFileSync(at('quadconfig/colour.png')), 'quadconfig/colour.png')) },
  {
    kind: 'svg',
    rel: '../credits/betaflight-mono.svg',
    body: betaflightMono(readFileSync(join(root, 'assets/credits/betaflight.svg'), 'utf8')),
  },
];

if (!CHECK_ONLY) {
  for (const m of made) {
    writeFileSync(at(m.rel), m.kind === 'svg' ? m.body : writePng(m.img));
    console.log(`made ${LOGO_DIR}/${m.rel}`);
  }
}

checkRoster();
checkFiles(made);
console.log(`\npartners: ${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
