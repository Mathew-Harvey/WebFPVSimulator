/*
 * props-check.js: every freestyle asset, proved well formed, deterministic
 * and solid in the real physics module.
 *
 * WHY THIS EXISTS. A freestyle map is built from src/props, and every asset
 * there is a list of parts that is drawn and solid in one line
 * (src/props/parts.js). What is solid goes to dist/sim.wasm through
 * src/game/plantworld.js and is resolved at 1 kHz by src/native/world.c. So
 * an asset that makes a NaN, an asset that turns a box by 0.4 rad, or a
 * layout that rolls a different ruin on a second load is a wall a quad
 * flies through or a trace that differs between two browsers. None of that
 * shows in a screenshot. This file looks for it in plain Node, in six
 * blocks:
 *
 *   1. assets      every prop type, every style, at its default dims and at
 *                  the min and max of every limit, at six headings: every
 *                  number finite, every part a real box or capsule, no solid
 *                  box on an asset that turns freely, quarter turns that are
 *                  exact permutations to the bit, nothing inflated
 *   1b. envelope   the same dims, what is solid against what is drawn: no
 *                  solid over the drawn top, the chimney's solids on its
 *                  brick, no stair drawn where the layout built none
 *   2. furniture   every course element a freestyle map may hold, the same
 *   3. determinism a map holding one of everything, placed twice from two
 *                  fresh documents, compared as Float64 bits and hashed, and
 *                  src/props/trig.js against the engine's own sine
 *   4. physics     that map uploaded to the module exactly as the shell does
 *                  it, and flown: a roof lands, the crane's mast stops a
 *                  craft, the spawn is clear
 *   5. starter     the starter map (src/maps/built/starter.js): no two
 *                  elements' solids overlap, every named gap is clear, and
 *                  the craft takes off from its pads, and from the same
 *                  pads raised onto the office roof, seated where the
 *                  shell seats it, on the map's own ground
 *
 * WHAT A FAILURE MEANS. The line names the asset, the style, the dimension
 * set and the heading, and the first numbers that are wrong. A threshold
 * here is never widened to make a line pass (CLAUDE.md); the argument goes
 * in PROGRESS.md.
 *
 * The flights reuse scripts/world-check.js's pilot: the same height hold,
 * the same hover throttle, the same forward stick and the same hands off on
 * contact, on the five inch, which is the only craft freestyle is offered
 * on. Every flight is flown twice and must agree with itself to the bit.
 *
 * Usage: node scripts/props-check.js [--only=assets|envelope|furniture|determinism|physics|starter] [--verbose]
 *        node scripts/props-check.js --selftest    prove each detector sees a planted fault
 * Exit code is the number of failed checks.
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

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { loadSim, SIM_OK, simErrorName } from '../tests/lib/simmod.js';
import { PROPS, FURNITURE, partsOf } from '../src/props/catalog.js';
import { styleDims, approxHeight } from '../src/props/types.js';
import { GAP_MIN } from '../src/props/parts.js';
import { placeSolids, placedYaw, addSolids } from '../src/props/solids.js';
import { sincos, quarterTurns, quarterSinCos } from '../src/props/trig.js';
import { Colliders, KINDS, GROUND_MU, GROUND_E } from '../src/game/collide.js';
import { uploadWorld, setWorldFrame } from '../src/game/plantworld.js';
import { threePosToSim, threeDirToSim } from '../src/render/frame.js';
import {
  createTrack, createElement, normalize, serialize, deserialize, SCENE_TIMES, SCENE_GROUNDS, sceneOf,
} from '../src/trackbuilder/model.js';
import { ELEMENTS, KIND } from '../src/trackbuilder/elements.js';
import { placeDocument, groundUnder } from '../src/maps/built/place.js';
import { freestyleReport } from '../src/trackbuilder/warnings.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const only = (args.find((a) => a.startsWith('--only=')) || '').split('=')[1] || '';
const verbose = args.includes('--verbose');

let failures = 0;
/* While the self test replays a scenario against a planted fault, its lines
 * are collected here instead of printed and counted. */
let captured = null;
function pass(name, detail) {
  console.log(`  PASS  ${name}${detail ? `: ${detail}` : ''}`);
}
function fail(name, detail) {
  if (captured) {
    captured.push({ name, ok: false, detail });
    return;
  }
  failures += 1;
  console.log(`  FAIL  ${name}${detail ? `: ${detail}` : ''}`);
}
function check(name, ok, detail) {
  if (captured) {
    captured.push({ name, ok, detail });
    return ok;
  }
  if (ok) {
    pass(name, detail);
  } else {
    fail(name, detail);
  }
  return ok;
}
function skip(name, why) {
  console.log(`  SKIP  ${name}: ${why}`);
}
function note(text) {
  console.log(`        ${text}`);
}

function r3(v) {
  return Math.round(v * 1000) / 1000;
}

/* ------------------------------------------------------------------ */
/* Bits                                                                */
/* ------------------------------------------------------------------ */

/*
 * Two doubles compared by their bits, which is the only comparison that
 * means "the same number": == calls -0 and 0 equal and NaN unequal to
 * itself, and a determinism check must do neither.
 */
const BITS = new Float64Array(1);
const BITS_U = new BigUint64Array(BITS.buffer);
function bitsOf(v) {
  BITS[0] = v;
  return BITS_U[0];
}
function sameBits(a, b) {
  return bitsOf(a) === bitsOf(b);
}
/*
 * The same, with the sign of a zero ignored. Turning a box by a quarter turn
 * multiplies coordinates by 0 and -1, and 0 * -1 is -0: the box is exactly
 * where it should be, and its zero carries a sign that has no meaning. The
 * turn comparisons use this; the determinism comparison does not.
 */
function sameValue(a, b) {
  return sameBits(a + 0, b + 0);
}

/* ------------------------------------------------------------------ */
/* Assets                                                              */
/* ------------------------------------------------------------------ */

/*
 * The headings every asset is placed at: the four compass points, a turn
 * that is none of them, and 1.570796, which is what a quarter turn is once a
 * document has rounded it to six places (src/trackbuilder/model.js num).
 */
const HEADINGS = [0, 0.4, Math.PI / 2, 1.570796, 2.2, -Math.PI];
/* The four quarter turns, as headings, index q = 0 to 3. */
const QUARTERS = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
/* Where an asset is placed for the translation check: not the origin, not
 * round numbers, so a rounding in the turn would show. */
const AWAY = [37.25, 1.5, -12.7];

/* Every number anywhere in a part, as the paths of the ones not finite. */
function nonFinite(v, path, out) {
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) {
      out.push(`${path}=${v}`);
    }
    return out;
  }
  if (Array.isArray(v)) {
    v.forEach((x, i) => nonFinite(x, `${path}[${i}]`, out));
    return out;
  }
  if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      nonFinite(x, path ? `${path}.${k}` : k, out);
    }
  }
  return out;
}

function isVec3(v) {
  return Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === 'number');
}

/* What is wrong with one part's shape, as short strings. */
function shapeProblems(p) {
  const out = [];
  if (p.t === 'box') {
    if (!isVec3(p.lo) || !isVec3(p.hi)) {
      out.push('a box without lo and hi');
    } else {
      for (let i = 0; i < 3; i += 1) {
        if (!(p.lo[i] <= p.hi[i])) {
          out.push(`an inverted box on axis ${i}: ${p.lo[i]} > ${p.hi[i]}`);
        }
      }
    }
  } else if (p.t === 'cap') {
    if (!isVec3(p.a) || !isVec3(p.b)) {
      out.push('a capsule without a and b');
    }
    if (!(p.r > 0)) {
      out.push(`a capsule of radius ${p.r}`);
    }
  } else {
    out.push(`a part of type ${p.t}`);
  }
  /* A solid part's kind picks its contact material, and Colliders.add
   * throws on a kind it does not know, which would take the whole map's
   * upload down with it. */
  if (p.solid && !KINDS.includes(p.kind)) {
    out.push(`a solid of kind ${p.kind}, which is not a collider kind`);
  }
  return out;
}

/* A box's three extents, in its own axis order. */
function extents(b) {
  return [b[3] - b[0], b[4] - b[1], b[5] - b[2]];
}

/*
 * The box a quarter turn q MUST give for a local box, written out from the
 * rotation src/props/trig.js turnY documents (x' = x c + z s, z' = -x s +
 * z c) with c and s each 0, 1 or -1: a signed swap of the two plan axes and
 * nothing else. Any other answer means a sine was taken.
 */
function quarterBox(p, q) {
  const [lx0, ly0, lz0] = p.lo;
  const [lx1, ly1, lz1] = p.hi;
  if (q === 0) return [lx0, ly0, lz0, lx1, ly1, lz1];
  if (q === 1) return [lz0, ly0, -lx1, lz1, ly1, -lx0];
  if (q === 2) return [-lx1, ly0, -lz1, -lx0, ly1, -lz0];
  return [-lz1, ly0, lx0, -lz0, ly1, lx1];
}
function quarterPoint(a, q) {
  if (q === 0) return [a[0], a[1], a[2]];
  if (q === 1) return [a[2], a[1], -a[0]];
  if (q === 2) return [-a[0], a[1], -a[2]];
  return [-a[2], a[1], a[0]];
}

function numbersOfSolid(s) {
  return s.box ?? s.cap;
}

/*
 * Check one element (a prop or a piece of furniture) at one set of dims.
 * Returns a map of problem name to example strings; empty means it passed.
 */
function checkElement(el, turns, expectSolid, label, problems, tally) {
  const add = (what, example) => {
    if (!problems.has(what)) {
      problems.set(what, []);
    }
    const list = problems.get(what);
    if (list.length < 3) {
      list.push(`${label}: ${example}`);
    } else if (list.length === 3) {
      list.push('...');
    }
  };
  let parts;
  try {
    parts = partsOf(el);
  } catch (e) {
    add('layout throws', e.message);
    return;
  }
  if (!Array.isArray(parts)) {
    add('layout returns a list', `got ${typeof parts}`);
    return;
  }
  tally.parts.push(parts.length);
  const bad = [];
  parts.forEach((p, i) => nonFinite(p, `part ${i} (${p?.name || p?.t})`, bad));
  if (bad.length) {
    add('every number finite', bad.slice(0, 3).join(', '));
    return;
  }
  parts.forEach((p, i) => {
    for (const s of shapeProblems(p)) {
      add('every part a real box or capsule of a known kind', `part ${i} (${p.name || p.t}): ${s}`);
    }
  });
  const solids = parts.filter((p) => p.solid);
  if (expectSolid === true && solids.length === 0) {
    add('something solid', `${parts.length} parts, none solid`);
  }
  if (expectSolid === false && solids.length > 0) {
    add('nothing solid', `${solids.length} solid parts (${solids[0].name || solids[0].t})`);
  }
  if (turns === 'any') {
    const boxes = solids.filter((p) => p.t === 'box');
    if (boxes.length) {
      add("no solid box on an asset that turns freely", `${boxes.length} solid boxes, the first ${boxes[0].name || 'unnamed'}`);
    }
  }

  /* Every heading, as src/maps/built/place.js places it. */
  const byHeading = new Map();
  for (const h of HEADINGS) {
    const stats = { inflated: 0 };
    const yaw = placedYaw(turns, h);
    const out = placeSolids(parts, AWAY[0], AWAY[1], AWAY[2], yaw, turns, [], stats);
    byHeading.set(h, out);
    if ((stats.inflated || 0) !== 0) {
      add('nothing inflated at any heading', `heading ${h}: ${stats.inflated} boxes placed as the box that holds them`);
    }
    if (out.length !== solids.length) {
      add('one solid per solid part', `heading ${h}: ${out.length} solids from ${solids.length} solid parts`);
      continue;
    }
    const nf = [];
    out.forEach((s, i) => nonFinite(numbersOfSolid(s), `solid ${i}`, nf));
    if (nf.length) {
      add('every placed number finite', `heading ${h}: ${nf.slice(0, 3).join(', ')}`);
    }
    if (turns === 'any') {
      /* A turn about up moves no height and changes no length. The length
       * is compared to a part in a billion: trig.js is good to an ulp, and
       * this is a sanity bound on the turn, not a measure of it. */
      out.forEach((s, i) => {
        const p = solids[i];
        if (!s.cap) {
          return;
        }
        const c = s.cap;
        if (!sameBits(c[1], AWAY[1] + p.a[1]) || !sameBits(c[4], AWAY[1] + p.b[1]) || !sameBits(c[6], p.r)) {
          add('a turn moves no height and keeps every radius', `heading ${h}, ${p.name || 'capsule'} ${i}`);
        }
        const l0 = Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1], p.b[2] - p.a[2]);
        const l1 = Math.hypot(c[3] - c[0], c[4] - c[1], c[5] - c[2]);
        if (Math.abs(l1 - l0) > 1e-9 * (1 + l0)) {
          add('a turn keeps every length', `heading ${h}, ${p.name || 'capsule'} ${i}: ${l0} became ${l1}`);
        }
      });
    }
  }

  if (turns === 'quarter') {
    /* 1.570796 and pi/2 are the same quarter turn and must be the same
     * solids, to the bit: this is what quarterTurns snapping is for. */
    const a = byHeading.get(Math.PI / 2);
    const b = byHeading.get(1.570796);
    const same = a.length === b.length && a.every((s, i) => {
      const x = numbersOfSolid(s);
      const y = numbersOfSolid(b[i]);
      return x.length === y.length && x.every((v, k) => sameBits(v, y[k]));
    });
    if (!same) {
      add('1.570796 and pi/2 place the same solids to the bit', 'they differ');
    }
    /* At the origin, every quarter turn: each box is the signed swap of the
     * unturned one, its extents a permutation of the unturned extents, bit
     * for bit. Capsules on a quarter asset are turned the same exact way. */
    const base = placeSolids(parts, 0, 0, 0, 0, 'quarter', []);
    for (let q = 0; q < 4; q += 1) {
      const got = placeSolids(parts, 0, 0, 0, QUARTERS[q], 'quarter', []);
      const moved = placeSolids(parts, AWAY[0], AWAY[1], AWAY[2], QUARTERS[q], 'quarter', []);
      got.forEach((s, i) => {
        const p = solids[i];
        if (s.box) {
          const want = quarterBox(p, q);
          if (!want.every((v, k) => sameValue(v, s.box[k]))) {
            add('a quarter turn is an exact signed swap of the plan axes', `q ${q}, ${p.name || 'box'} ${i}: got [${s.box.join(', ')}], want [${want.join(', ')}]`);
          }
          const e0 = extents(base[i].box);
          const e1 = extents(s.box);
          const perm = q % 2 === 0 ? [e0[0], e0[1], e0[2]] : [e0[2], e0[1], e0[0]];
          if (!perm.every((v, k) => sameBits(v, e1[k]))) {
            add('turned extents are a permutation of the unturned ones, to the bit', `q ${q}, ${p.name || 'box'} ${i}: [${e1.join(', ')}] from [${e0.join(', ')}]`);
          }
          /* Placed away from the origin, the turned box is the origin one
           * moved, to the bit: the turn itself rounded nothing. */
          const m = moved[i].box;
          const off = [AWAY[0], AWAY[1], AWAY[2], AWAY[0], AWAY[1], AWAY[2]];
          if (!m.every((v, k) => sameValue(v, off[k] + s.box[k]))) {
            add('a turned box placed away from the origin is the origin box moved, to the bit', `q ${q}, ${p.name || 'box'} ${i}`);
          }
        } else {
          const wa = quarterPoint(p.a, q);
          const wb = quarterPoint(p.b, q);
          const c = s.cap;
          if (![...wa, ...wb].every((v, k) => sameValue(v, c[k])) || !sameBits(c[6], p.r)) {
            add('a quarter turn moves a capsule exactly', `q ${q}, ${p.name || 'capsule'} ${i}`);
          }
        }
      });
    }
  }
}

/*
 * The dimension sets a prop is checked at: its style's defaults, each limit
 * at its min and at its max with the rest at their defaults, every limit at
 * its min at once and at its max at once, and, for an asset that rolls a
 * seed, the first ten variants, because a seeded layout that makes a
 * degenerate part on one roll in ten is still broken.
 */
function dimSets(type, style) {
  const def = PROPS[type];
  const base = { ...def.dims, ...(styleDims(type, style) ?? {}) };
  const sets = [['default', base]];
  const limits = def.limits ?? {};
  const lo = { ...base };
  const hi = { ...base };
  for (const [k, lim] of Object.entries(limits)) {
    sets.push([`${k} ${lim[0]}`, { ...base, [k]: lim[0] }]);
    sets.push([`${k} ${lim[1]}`, { ...base, [k]: lim[1] }]);
    lo[k] = lim[0];
    hi[k] = lim[1];
  }
  if (Object.keys(limits).length) {
    sets.push(['every limit at its min', lo]);
    sets.push(['every limit at its max', hi]);
  }
  if (limits.variant) {
    for (let v = 2; v <= 10; v += 1) {
      sets.push([`variant ${v}`, { ...base, variant: v }]);
    }
  }
  return sets;
}

function assetEl(type, style, dims) {
  const el = {
    id: 'el-1',
    type,
    name: '',
    position: { x: 0, y: 0, z: 0 },
    yaw: 0,
    pitch: 0,
    yawOverridden: false,
    dims: { ...dims },
  };
  if (style) {
    el.style = style;
  }
  return el;
}

function report(label, problems, tally, detail) {
  if (problems.size === 0) {
    const n = tally.parts;
    pass(label, `${detail}, ${Math.min(...n)} to ${Math.max(...n)} parts`);
    return;
  }
  for (const [what, examples] of problems) {
    fail(`${label}: ${what}`, examples.join(' | '));
  }
}

function assetsBlock() {
  console.log('\n1. assets: every prop, every style, default and limit dims, six headings');
  for (const [type, def] of Object.entries(PROPS)) {
    for (const style of def.styles ?? [null]) {
      const problems = new Map();
      const tally = { parts: [] };
      const sets = dimSets(type, style);
      for (const [name, dims] of sets) {
        checkElement(assetEl(type, style, dims), def.turns, def.zone ? false : true, name, problems, tally);
      }
      report(`${type}${style ? ` ${style}` : ''} (${def.turns})`, problems, tally, `${sets.length} dim sets x ${HEADINGS.length} headings`);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Furniture                                                           */
/* ------------------------------------------------------------------ */

/* A freestyle document to make elements in, so each gets the full sized
 * class's defaults exactly as the builder would give it. */
function furnitureEl(type) {
  const doc = createTrack(undefined, 'full', 'freestyle');
  const el = createElement(doc, type, { x: 0, y: 0 }, 0);
  el.id = 'el-1';
  return el;
}

function furnitureBlock() {
  console.log('\n2. furniture: every course element a freestyle map may hold, at its defaults');
  for (const [type, f] of Object.entries(FURNITURE)) {
    const def = ELEMENTS[type];
    if (!def) {
      fail(`${type}: is an element type`, 'FURNITURE names it and ELEMENTS does not');
      continue;
    }
    /* A gate, a marker or an obstacle is something a quad hits. Start pads
     * and ground paint are not: a solid pad would seat the craft inside it. */
    const expect = def.kind === KIND.START || def.kind === KIND.DECAL ? false : true;
    const problems = new Map();
    const tally = { parts: [] };
    checkElement(furnitureEl(type), f.turns ?? 'any', expect, 'default', problems, tally);
    report(`${type} (${def.kind}, ${f.turns ?? 'any'})`, problems, tally, `${expect ? 'solid' : 'not solid'}, ${HEADINGS.length} headings`);
  }
}

/* ------------------------------------------------------------------ */
/* Envelope                                                            */
/* ------------------------------------------------------------------ */

/*
 * WHAT IS SOLID AGAINST WHAT IS DRAWN. Block 1 proves every part well
 * formed, and a part can be well formed and still in the wrong place: a
 * chimney whose last capsule stood two metres of invisible dome over its
 * rim, drawn brick half a metre outside its solid at the foot of every
 * section, a block of flats that drew an external stair its layout had
 * refused and so had nothing under it. Each of those passed every line
 * above. These look at the pair, at every dimension set block 1 uses,
 * which for a seeded asset is ten of its variants:
 *
 *   top      no solid stands more than TOP_SLACK over the asset's drawn
 *            height, src/props/types.js approxHeight, which is measured
 *            never to come out under what is drawn
 *   chimney  at every 5 cm of height and 16 headings round it, the
 *            outermost solid point is within BRICK_SHORT of the drawn
 *            brick and never more than BRICK_PROUD outside it, and the
 *            brick's solids stop at the rim
 *   stair    a building draws stair stringers only where its layout holds
 *            stair treads
 *
 * What is drawn is read by running the asset's own draw() against a kit
 * that records its calls instead of making meshes, which the buildings
 * and the chimney allow in plain Node.
 */
const TOP_SLACK = 0.05;
const BRICK_SHORT = 0.10;
const BRICK_PROUD = 0.01;
const BRICK = new Set(['brick', 'indBrickDark']);

/* An asset's draw() against a kit that writes its calls down. */
function recordDraw(el, parts) {
  const calls = [];
  const K = new Proxy({}, {
    get(t, k) {
      return k === 'THREE' ? undefined : (...a) => {
        calls.push([k, ...a]);
      };
    },
  });
  PROPS[el.type].draw(el, parts, K);
  return calls;
}

function topOf(p) {
  return p.t === 'box' ? p.hi[1] : Math.max(p.a[1], p.b[1]) + p.r;
}

/* How far the highest solid stands over the asset's drawn height, and
 * which part it is, or null when nothing is solid. */
function overDrawnTop(type, style, dims, parts) {
  let best = null;
  for (const p of parts) {
    if (p.solid && (!best || topOf(p) > topOf(best))) {
      best = p;
    }
  }
  return best ? { over: topOf(best) - approxHeight(type, dims, style), part: best } : null;
}

/* The drawn brick's radius at height y, from every upright cylinder on the
 * axis the chimney draws in brick, whether a drawn part or a draw() call. */
function brickProfile(parts, calls) {
  const cyl = [];
  const onAxis = (a, b) => a[0] === 0 && a[2] === 0 && b[0] === 0 && b[2] === 0;
  for (const p of parts) {
    if (p.draw && p.t === 'cap' && BRICK.has(p.m) && onAxis(p.a, p.b)) {
      cyl.push([p.a[1], p.b[1], p.r, p.rTop ?? p.r]);
    }
  }
  for (const c of calls) {
    if (c[0] === 'cyl' && BRICK.has(c[1]) && onAxis(c[2], c[3])) {
      cyl.push([c[2][1], c[3][1], c[4], c[6] ?? c[4]]);
    }
  }
  return (y) => {
    let r = 0;
    for (const [y0, y1, r0, r1] of cyl) {
      if (y >= y0 && y <= y1 && y1 > y0) {
        r = Math.max(r, r0 + ((r1 - r0) * (y - y0)) / (y1 - y0));
      }
    }
    return r;
  };
}

function insideCap(x, y, z, p) {
  const ex = p.b[0] - p.a[0];
  const ey = p.b[1] - p.a[1];
  const ez = p.b[2] - p.a[2];
  const L = ex * ex + ey * ey + ez * ez;
  let t = L > 0 ? ((x - p.a[0]) * ex + (y - p.a[1]) * ey + (z - p.a[2]) * ez) / L : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = p.a[0] + ex * t - x;
  const dy = p.a[1] + ey * t - y;
  const dz = p.a[2] + ez * t - z;
  return dx * dx + dy * dy + dz * dz <= p.r * p.r;
}

/*
 * The chimney's brick against its solids: the worst shortfall and the
 * worst overshoot, in metres, and where. The reach at a height and a
 * heading is the outermost solid point on the ray out from the axis,
 * found walking in from outside the brick in 5 mm steps, which is the
 * point a craft coming in from outside meets.
 */
function chimneyFit(H, parts, calls) {
  const drawn = brickProfile(parts, calls);
  const solid = parts.filter((p) => p.solid && p.t === 'cap' && p.m === 'brick');
  const out = { short: 0, shortAt: 0, proud: -Infinity, proudAt: 0, top: -Infinity };
  for (const p of solid) {
    out.top = Math.max(out.top, topOf(p));
  }
  const N = 16;
  for (let y = 0.2; y <= H - 0.02; y += 0.05) {
    const d = drawn(y);
    const near = solid.filter((p) => Math.min(p.a[1], p.b[1]) - p.r <= y && Math.max(p.a[1], p.b[1]) + p.r >= y);
    for (let i = 0; i < N; i += 1) {
      const sc = sincos(((i + 0.37) / N) * 2 * Math.PI, { s: 0, c: 0 });
      let reach = -Infinity;
      for (let m = d + 0.1; m >= 0; m -= 0.005) {
        if (near.some((p) => insideCap(m * sc.c, y, m * sc.s, p))) {
          reach = m;
          break;
        }
      }
      if (d - reach > out.short) {
        out.short = d - reach;
        out.shortAt = y;
      }
      if (reach - d > out.proud) {
        out.proud = reach - d;
        out.proudAt = y;
      }
    }
  }
  return out;
}

/* How many stair stringers a draw made, and how many treads the layout
 * holds under them. */
function stairCounts(parts, calls) {
  return {
    stringers: calls.filter((c) => c[0] === 'cyl' && (c[1] === 'bldStair' || c[1] === 'bldStairGreen')).length,
    treads: parts.filter((p) => p.name === 'stairTread').length,
  };
}

/* The chimney at the four corners of its limits as well: a short fat
 * stack is where its solids went wrong, and neither the all-min nor the
 * all-max set is one. */
function envelopeSets(type, style) {
  const sets = dimSets(type, style);
  if (type === 'chimney') {
    const L = PROPS.chimney.limits;
    for (const h of L.height.slice(0, 2)) {
      for (const r of L.radius.slice(0, 2)) {
        sets.push([`height ${h} radius ${r}`, { ...PROPS.chimney.dims, height: h, radius: r }]);
      }
    }
  }
  return sets;
}

function envelopeBlock() {
  console.log('\n1b. envelope: what is solid against what is drawn, at every dim set');
  for (const [type, def] of Object.entries(PROPS)) {
    if (def.zone) {
      continue;
    }
    for (const style of def.styles ?? [null]) {
      const label = `${type}${style ? ` ${style}` : ''}`;
      const sets = envelopeSets(type, style);
      let worstTop = -Infinity;
      let topBad = null;
      const fit = { short: 0, proud: -Infinity, over: -Infinity, bad: [] };
      const stair = { drawn: 0, bad: [] };
      for (const [name, dims] of sets) {
        const el = assetEl(type, style, dims);
        const parts = partsOf(el);
        const hi = overDrawnTop(type, style, dims, parts);
        if (hi) {
          worstTop = Math.max(worstTop, hi.over);
          if (hi.over > TOP_SLACK && !topBad) {
            topBad = `${name}: ${hi.part.name || hi.part.t} tops out ${r3(hi.over)} m over the drawn ${r3(approxHeight(type, dims, style))} m`;
          }
        }
        if (type === 'chimney') {
          const f = chimneyFit(dims.height, parts, recordDraw(el, parts));
          fit.short = Math.max(fit.short, f.short);
          fit.proud = Math.max(fit.proud, f.proud);
          fit.over = Math.max(fit.over, f.top - dims.height);
          if (f.short > BRICK_SHORT || f.proud > BRICK_PROUD || f.top > dims.height + TOP_SLACK) {
            fit.bad.push(`${name}: ${r3(f.short)} m short at ${r3(f.shortAt)} m, ${r3(f.proud)} m proud at ${r3(f.proudAt)} m, top ${r3(f.top - dims.height)} m over the rim`);
          }
        }
        if (type === 'building') {
          const c = stairCounts(parts, recordDraw(el, parts));
          stair.drawn += c.stringers;
          if (c.stringers > 0 && c.treads === 0) {
            stair.bad.push(`${name}: ${c.stringers} stringers drawn, no treads`);
          }
        }
      }
      check(`${label}: no solid over the drawn top`, !topBad,
        topBad ?? `highest ${r3(worstTop)} m against approxHeight over ${sets.length} dim sets`);
      if (type === 'chimney') {
        check(`${label}: the solid follows the drawn brick and stops at the rim`, fit.bad.length === 0,
          fit.bad.length ? fit.bad.slice(0, 3).join(' | ')
            : `worst ${r3(fit.short)} m short of the brick, ${r3(fit.proud)} m outside it, ${r3(fit.over)} m over the rim, over ${sets.length} dim sets`);
      }
      if (type === 'building') {
        check(`${label}: no stair drawn without stair solids`, stair.bad.length === 0,
          stair.bad.length ? stair.bad.slice(0, 3).join(' | ') : `${stair.drawn} stringers over ${sets.length} dim sets, every one on treads`);
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* One of everything                                                   */
/* ------------------------------------------------------------------ */

/*
 * A map holding one of every prop in every style, every piece of furniture,
 * the start pads and a named gap, on a 60 m grid so nothing reaches its
 * neighbour. Headings cycle through HEADINGS so the determinism check sees
 * free turns and snapped ones. The crane and the flats have cells of their
 * own with nothing within 40 m, because the flights use them.
 */
const CELL = 60;
const COLS = 8;
const PADS_YAW = 0.7;

function everythingDoc() {
  const doc = createTrack('Everything', 'full', 'freestyle');
  doc.field.width = CELL * COLS;
  doc.field.depth = CELL * COLS;
  const entries = [{ type: 'startPads', yaw: PADS_YAW }];
  for (const [type, def] of Object.entries(PROPS)) {
    if (def.zone) {
      continue;
    }
    for (const style of def.styles ?? [null]) {
      entries.push({ type, style });
    }
  }
  for (const type of Object.keys(FURNITURE)) {
    if (type !== 'startPads') {
      entries.push({ type });
    }
  }
  entries.push({ type: 'gap', z: 1.2, name: 'CHECK GAP', points: 500 });
  entries.forEach((e, i) => {
    const x = CELL / 2 + (i % COLS) * CELL;
    const y = CELL / 2 + Math.floor(i / COLS) * CELL;
    const el = createElement(doc, e.type, { x, y, z: e.z ?? 0 }, e.yaw ?? HEADINGS[i % HEADINGS.length]);
    if (e.style) {
      el.style = e.style;
      Object.assign(el.dims, styleDims(e.type, e.style) ?? {});
    }
    if (e.name) {
      el.name = e.name;
    }
    if (e.points) {
      el.points = e.points;
    }
    doc.elements.push(el);
  });
  const { doc: clean, repairs } = normalize(doc);
  return { doc: clean, repairs };
}

/* Every number a placement produced, in order, with what it belongs to. */
function placementRecords(placed) {
  const recs = [];
  for (const s of placed.solids) {
    recs.push([`${s.kind}|${s.name}|${s.box ? 'box' : 'cap'}`, numbersOfSolid(s)]);
  }
  for (const z of placed.zones) {
    recs.push([`zone|${z.name}|${z.points}`, [z.x, z.y, z.z, z.yaw, z.w, z.h]]);
  }
  recs.push(['spawn', [placed.spawn.x, placed.spawn.y, placed.spawn.z, placed.spawn.yaw, placed.spawn.base]]);
  return recs;
}

function placementHash(placed) {
  const h = createHash('sha256');
  const buf = new Float64Array(1);
  for (const [tag, nums] of placementRecords(placed)) {
    h.update(tag);
    for (const v of nums) {
      buf[0] = v;
      h.update(Buffer.from(buf.buffer));
    }
  }
  return h.digest('hex');
}

/* The first place two placements differ, or null. Bits, not ==. */
function firstDifference(a, b) {
  const ra = placementRecords(a);
  const rb = placementRecords(b);
  if (ra.length !== rb.length) {
    return `${ra.length} records against ${rb.length}`;
  }
  for (let i = 0; i < ra.length; i += 1) {
    if (ra[i][0] !== rb[i][0] || ra[i][1].length !== rb[i][1].length) {
      return `record ${i}: ${ra[i][0]} against ${rb[i][0]}`;
    }
    for (let k = 0; k < ra[i][1].length; k += 1) {
      if (!sameBits(ra[i][1][k], rb[i][1][k])) {
        return `record ${i} (${ra[i][0]}) number ${k}: ${ra[i][1][k]} against ${rb[i][1][k]}`;
      }
    }
  }
  return null;
}

function countShapes(placed) {
  const boxes = placed.solids.filter((s) => s.box).length;
  return `${placed.solids.length} solids (${boxes} boxes, ${placed.solids.length - boxes} capsules), ${placed.items.length} items, ${placed.zones.length} zones`;
}

function determinismBlock(world) {
  console.log('\n3. determinism: one of everything, placed twice; trig.js against the engine');
  const { doc, repairs } = everythingDoc();
  check('the map of everything normalizes with no repairs', repairs.length === 0, repairs.join(' | ') || `${doc.elements.length} elements`);
  const a = placeDocument(doc);
  const again = placeDocument(doc);
  const b = placeDocument(everythingDoc().doc);
  check('it places every element', a.items.length + a.zones.length === doc.elements.length,
    `${a.items.length} items and ${a.zones.length} zones from ${doc.elements.length} elements`);
  check('nothing inflated anywhere on it', (a.stats.inflated || 0) === 0, `${a.stats.inflated || 0}`);
  const d1 = firstDifference(a, again);
  check('the same document placed twice: the same solids, to the bit', d1 === null, d1 ?? countShapes(a));
  const d2 = firstDifference(a, b);
  check('two fresh documents placed: the same solids, to the bit', d2 === null, d2 ?? 'including the zones and the spawn');
  console.log(`        placement hash ${placementHash(a)}`);
  world.everything = { doc, placed: a };

  /*
   * trig.js against the engine's own sine, which is fdlibm in V8 and so
   * should agree to an ulp. 2e-16 is under two ulps of anything in
   * [0.5, 1) and far above the error either has; a real mistake in a
   * constant or a quadrant is off by far more than that.
   */
  const N = 400001;
  const span = 8 * Math.PI;
  let worstS = 0;
  let worstC = 0;
  let worstAt = 0;
  let identical = 0;
  let count = 0;
  const sc = { s: 0, c: 0 };
  const probe = (a) => {
    sincos(a, sc);
    const ds = Math.abs(sc.s - Math.sin(a));
    const dc = Math.abs(sc.c - Math.cos(a));
    if (ds > worstS || dc > worstC) {
      worstAt = a;
    }
    worstS = Math.max(worstS, ds);
    worstC = Math.max(worstC, dc);
    if (sameBits(sc.s, Math.sin(a)) && sameBits(sc.c, Math.cos(a))) {
      identical += 1;
    }
    count += 1;
  };
  for (let i = 0; i < N; i += 1) {
    probe(-4 * Math.PI + (span * i) / (N - 1));
  }
  /* The awkward ones: every multiple of pi/4, a hair either side of each
   * quarter turn, the document's rounded headings, and tiny angles. */
  for (let k = -16; k <= 16; k += 1) {
    const q = (k * Math.PI) / 4;
    probe(q);
    probe(q + 1e-9);
    probe(q - 1e-9);
    probe(q + 1e-15);
  }
  for (const a of [...HEADINGS, 3.141593, -1.570796, 1e-300, -1e-300, 0, -0, 1e-8, -1e-8]) {
    probe(a);
  }
  check('sincos agrees with Math.sin and Math.cos within 2e-16', worstS <= 2e-16 && worstC <= 2e-16,
    `${count} angles in [-4 pi, 4 pi], worst sin ${worstS.toExponential(2)}, cos ${worstC.toExponential(2)} at ${worstAt}, ${identical} bit identical`);
  const qs = [[1.570796, 1], [3.141593, 2], [-1.570796, 3], [Math.PI / 2, 1], [-Math.PI, 2], [Math.PI, 2], [0, 0], [-Math.PI / 2, 3]];
  const wrong = qs.filter(([a, q]) => quarterTurns(a) !== q);
  check('quarterTurns is exact at 1.570796, 3.141593, -1.570796 and the true quarter turns', wrong.length === 0,
    wrong.length ? wrong.map(([a, q]) => `${a} gave ${quarterTurns(a)}, want ${q}`).join(', ') : qs.map(([a, q]) => `${a} to ${q}`).join(', '));
  /* [cos, sin] of each quarter turn, q = 0 to 3. */
  const exact = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const qsc = { s: 0, c: 0 };
  const badTable = [0, 1, 2, 3].filter((q) => {
    quarterSinCos(q, qsc);
    return !(sameValue(qsc.c, exact[q][0]) && sameValue(qsc.s, exact[q][1]));
  });
  check('quarterSinCos is exactly 0, 1 or -1', badTable.length === 0,
    badTable.length ? `wrong at q ${badTable.join(', ')}` : 'cos 1 0 -1 0, sin 0 1 0 -1');
}

/* ------------------------------------------------------------------ */
/* Geometry, for the flights and the starter                           */
/* ------------------------------------------------------------------ */

function sub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function lerp(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function clamp(v, a, b) {
  return v < a ? a : (v > b ? b : v);
}

/* A solid's bounds, [x0, y0, z0, x1, y1, z1], a capsule's padded by its
 * radius. */
function aabbOf(s) {
  if (s.box) {
    return s.box;
  }
  const c = s.cap;
  return [
    Math.min(c[0], c[3]) - c[6], Math.min(c[1], c[4]) - c[6], Math.min(c[2], c[5]) - c[6],
    Math.max(c[0], c[3]) + c[6], Math.max(c[1], c[4]) + c[6], Math.max(c[2], c[5]) + c[6],
  ];
}
function aabbNear(a, b, pad) {
  return a[0] - pad <= b[3] && b[0] - pad <= a[3]
    && a[1] - pad <= b[4] && b[1] - pad <= a[4]
    && a[2] - pad <= b[5] && b[2] - pad <= a[5];
}

function pointBoxDist(p, b) {
  const dx = Math.max(b[0] - p[0], 0, p[0] - b[3]);
  const dy = Math.max(b[1] - p[1], 0, p[1] - b[4]);
  const dz = Math.max(b[2] - p[2], 0, p[2] - b[5]);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/*
 * The least of a convex function of t on [0, 1], by ternary search. The
 * distance from a point moving along a segment to a convex set is convex in
 * t, so this is exact to the search's resolution, (2/3)^80 of the segment.
 */
function minConvex(f) {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 80; i += 1) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    if (f(m1) <= f(m2)) {
      hi = m2;
    } else {
      lo = m1;
    }
  }
  return f((lo + hi) / 2);
}

function segBoxDist(a, b, box) {
  return minConvex((t) => pointBoxDist(lerp(a, b, t), box));
}

/* Closest points of two segments (Ericson, Real-Time Collision Detection,
 * 5.1.9), as the distance between them. */
function segSegDist(p1, q1, p2, q2) {
  const d1 = sub(q1, p1);
  const d2 = sub(q2, p2);
  const r = sub(p1, p2);
  const a = dot(d1, d1);
  const e = dot(d2, d2);
  const f = dot(d2, r);
  let s;
  let t;
  const EPS = 1e-12;
  if (a <= EPS && e <= EPS) {
    return Math.sqrt(dot(r, r));
  }
  if (a <= EPS) {
    s = 0;
    t = clamp(f / e, 0, 1);
  } else {
    const c = dot(d1, r);
    if (e <= EPS) {
      t = 0;
      s = clamp(-c / a, 0, 1);
    } else {
      const b = dot(d1, d2);
      const den = a * e - b * b;
      s = den !== 0 ? clamp((b * f - c * e) / den, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp(-c / a, 0, 1);
      } else if (t > 1) {
        t = 1;
        s = clamp((b - c) / a, 0, 1);
      }
    }
  }
  const c1 = lerp(p1, q1, s);
  const c2 = lerp(p2, q2, t);
  const d = sub(c1, c2);
  return Math.sqrt(dot(d, d));
}

function capEnds(s) {
  const c = s.cap;
  return [[c[0], c[1], c[2]], [c[3], c[4], c[5]], c[6]];
}

/*
 * Signed clearance between two solids: positive is the gap between their
 * surfaces, negative is how far one is into the other. Box and box is exact;
 * the rest go through the segment distances above.
 */
function clearance(s, t) {
  if (s.box && t.box) {
    const a = s.box;
    const b = t.box;
    const over = [0, 1, 2].map((i) => Math.min(a[i + 3], b[i + 3]) - Math.max(a[i], b[i]));
    if (over.every((o) => o > 0)) {
      return -Math.min(...over);
    }
    const gap = over.map((o) => Math.max(0, -o));
    return Math.sqrt(gap[0] * gap[0] + gap[1] * gap[1] + gap[2] * gap[2]);
  }
  if (s.cap && t.cap) {
    const [a0, a1, ra] = capEnds(s);
    const [b0, b1, rb] = capEnds(t);
    return segSegDist(a0, a1, b0, b1) - ra - rb;
  }
  const box = s.box ? s : t;
  const cap = s.box ? t : s;
  const [c0, c1, r] = capEnds(cap);
  return segBoxDist(c0, c1, box.box) - r;
}

/* Signed clearance from a segment (the craft's path) to a solid. */
function segClearance(a, b, s) {
  if (s.box) {
    return segBoxDist(a, b, s.box);
  }
  const [c0, c1, r] = capEnds(s);
  return segSegDist(a, b, c0, c1) - r;
}

/* ------------------------------------------------------------------ */
/* The module                                                          */
/* ------------------------------------------------------------------ */

/* The five inch's parked height, src/native/plant.c hull_hz_down: where the
 * shell puts the plant's origin over the ground (SPAWN_ALT in src/main.js)
 * and where it raises the ground plane. The same number world-check uses. */
const REST = 0.045;
/* scripts/world-check.js's hover throttle for the five inch. */
const HOVER = 0.27;
/* The thinnest the hull ever is, from the CG: what world-check allows a
 * craft's centre to come to the axis of a bar it hit, past the bar's own
 * radius, before calling it through. */
const HULL_MIN = 0.03;
const ST = { X: 1, Y: 2, Z: 3, VX: 4, VY: 5, VZ: 6, QX: 8, QY: 9 };

let WASM = null;
let CONFIG = null;

/* The module and the five inch's baseline config, read once, or false when
 * there is no build to fly. */
async function loadModule() {
  if (WASM) {
    return true;
  }
  const wasmPath = join(root, 'dist/sim.wasm');
  if (!existsSync(wasmPath)) {
    return false;
  }
  WASM = await readFile(wasmPath);
  CONFIG = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');
  return true;
}

function call(sim, name, ...a) {
  if (typeof sim.e[name] !== 'function') {
    throw new Error(`sim.wasm does not export ${name}`);
  }
  const code = sim.e[name](...a);
  if (code < 0) {
    throw new Error(`${name}: ${simErrorName(code)}`);
  }
  return code;
}

function upZ(st) {
  return 1 - 2 * (st[ST.QX] * st[ST.QX] + st[ST.QY] * st[ST.QY]);
}

/* scripts/world-check.js's height hold, unchanged: + - * / and a clamp. */
function heightHold(ctx, st, z) {
  const e = z - st[ST.Z];
  ctx.i = clamp(ctx.i + e * 0.004 * 0.4, -0.3, 0.3);
  const u = upZ(st);
  return clamp((HOVER + 0.15 * e - 0.1 * st[ST.VZ] + ctx.i) / (u > 0.5 ? u : 0.5), 0, 1);
}

/* scripts/world-check.js's approach: angle mode, the stick forward, height
 * held; once in contact, hands off in acro the way a crashing pilot lets go. */
function approach(pitch, z, after = [0, 0, 0, 0.34]) {
  return (ms, st, ctx) => {
    if (ctx.touched) {
      ctx.angle = false;
      return after;
    }
    return [0, -pitch, 0, heightHold(ctx, st, z)];
  };
}

/*
 * The plant's frame for a map, as the shell seats it (src/main.js
 * seatWorldFrame): the origin at the spawn, SPAWN_ALT up, facing the spawn
 * yaw. The frame's sine comes from src/props/trig.js, so turning a point
 * into the plant's frame takes no JS trigonometry either. `y` is the
 * height the shell seats it at, which adoptSpawn asks the map's height for
 * from spawn.y: 0 on the paving, a roof under raised pads.
 */
function frameOf(spawn, y = 0) {
  const o = threePosToSim(spawn.x, y, spawn.z, { x: 0, y: 0, z: 0 });
  const sc = sincos(spawn.yaw, { s: 0, c: 0 });
  return { spawn, y, o: [o.x, o.y, o.z + REST], s: sc.s, c: sc.c };
}

/*
 * The frame for a built map, from the map's own height, exactly as
 * adoptSpawn in src/main.js takes it: height(x, z, spawn.y).
 */
function builtFrame(placed) {
  const sp = placed.spawn;
  return frameOf(sp, groundUnder(placed.tops, sp.x, sp.z, sp.y));
}

/*
 * The one sided slope limiter the shell puts on the ground's normal
 * (limitSlope in src/main.js): opposite signs are a step or a ridge and
 * read as level, matching signs a slope, and the gentler is taken.
 */
function limitSlope(a, b) {
  if (a * b <= 0) {
    return 0;
  }
  return (a < 0 ? -a : a) < (b < 0 ? -b : b) ? a : b;
}
/* src/main.js SURFACE_BIAS: the ground is asked for from this far under
 * the CG, so a deck overhead is never the ground. */
const SURFACE_BIAS = 0.40;
/* A Three.js world point into the plant's frame: p = Rz(-yaw)(W - O). */
function toPlant(f, X, Y, Z) {
  const w = threePosToSim(X, Y, Z, { x: 0, y: 0, z: 0 });
  const dx = w.x - f.o[0];
  const dy = w.y - f.o[1];
  return [f.c * dx + f.s * dy, -f.s * dx + f.c * dy, w.z - f.o[2]];
}
function dirToPlant(f, X, Y, Z) {
  const w = threeDirToSim(X, Y, Z, { x: 0, y: 0, z: 0 });
  return [f.c * w.x + f.s * w.y, -f.s * w.x + f.c * w.y, w.z];
}
/* And back: W = Rz(yaw) p + O, then sim to Three (frame.js, inverted). */
function toThree(f, p) {
  const x = f.c * p[0] - f.s * p[1] + f.o[0];
  const y = f.s * p[0] + f.c * p[1] + f.o[1];
  return [-y, p[2] + f.o[2], -x];
}

/*
 * A heading about up as a quaternion, from its cosine and sine, by the half
 * angle identities: square roots only, which IEEE 754 specifies to the bit.
 */
function yawQuat(c, s) {
  const w = Math.sqrt(Math.max(0, (1 + c) / 2));
  let z = Math.sqrt(Math.max(0, (1 - c) / 2));
  if (s < 0) {
    z = -z;
  }
  return [w, 0, 0, z];
}

/*
 * The shell's upload, unchanged: src/game/plantworld.js uploadWorld, which
 * imports nothing that needs a browser, so it is called here as it is in
 * src/main.js. The module's own export is wrapped only to read what
 * sim_world_build returned, which uploadWorld checks and then drops.
 */
function upload(sim, colliders) {
  const got = { built: null };
  const e = Object.assign({}, sim.e);
  e.sim_world_build = () => {
    got.built = sim.e.sim_world_build();
    return got.built;
  };
  const n = uploadWorld({ e }, colliders);
  return { n, built: got.built, count: sim.e.sim_world_count() };
}

async function newSim() {
  const sim = await loadSim(WASM);
  call(sim, 'sim_set_airframe', 0);
  if (sim.init(CONFIG) !== SIM_OK) {
    throw new Error('sim_init failed');
  }
  sim.reset();
  sim.setCellVoltage(4.2);
  return sim;
}

/*
 * Fly one run in a map. sc.sticks(ms, st, ctx) returns [roll, pitch, yaw,
 * throttle], on the shell's 4 ms RC grid. The ground is raised every step.
 * With world.height it is the shell's (src/main.js raiseGroundFromState and
 * sampleGroundNormal): the map's height under the CG, asked from
 * SURFACE_BIAS under it, with the five tap limited slope taken every eight
 * steps, and every step while the craft is past 60 degrees. Without it, it
 * is level at the frame's height, which is the street for the flights that
 * prove the module holds the solids: a roof the harness handed the plant
 * as ground could not show that. Returns every step's row and a hash of
 * every state block and contact report.
 */
async function fly(world, f, sc) {
  const sim = await newSim();
  const up = upload(sim, sc.empty ? null : (world.upload ?? world.colliders));
  setWorldFrame(sim, f.spawn.x, f.y, f.spawn.z, f.spawn.yaw, REST);
  call(sim, 'sim_set_pose', sc.p[0], sc.p[1], sc.p[2], ...(sc.q ?? [1, 0, 0, 0]));
  call(sim, 'sim_rest');
  const ctx = { i: 0, angle: sc.angle ?? true, touched: false, t0: -1 };
  sim.setAngleMode(ctx.angle);
  let angleNow = ctx.angle;
  const rep = new Float64Array(11);
  const repPtr = sim.e.malloc(11 * 8);
  const hash = createHash('sha256');
  const rows = [];
  const ground = { n: [0, 0, 1] };
  let st = sim.readState().state;
  for (let ms = 0; ms < sc.ms; ms += 1) {
    if (ms % 4 === 0) {
      const k = sc.sticks(ms, st, ctx);
      if (ctx.angle !== angleNow) {
        sim.setAngleMode(ctx.angle);
        angleNow = ctx.angle;
      }
      sim.input(ms / 1000, k[0], k[1], k[2], k[3]);
    }
    if (world.height) {
      const w = toThree(f, [st[ST.X], st[ST.Y], st[ST.Z]]);
      const from = w[1] - SURFACE_BIAS;
      if ((ms & 7) === 0 || upZ(st) < 0.5) {
        const e = 0.35;
        const h0 = world.height(w[0], w[2], from);
        const nx = limitSlope(h0 - world.height(w[0] + e, w[2], from), world.height(w[0] - e, w[2], from) - h0);
        const nz = limitSlope(h0 - world.height(w[0], w[2] + e, from), world.height(w[0], w[2] - e, from) - h0);
        const inv = 1 / Math.sqrt(nx * nx + e * e + nz * nz);
        ground.n = dirToPlant(f, nx * inv, e * inv, nz * inv);
      }
      const gp = toPlant(f, w[0], world.height(w[0], w[2], from), w[2]);
      call(sim, 'sim_set_ground', 1, ground.n[0], ground.n[1], ground.n[2], gp[0], gp[1], gp[2], GROUND_MU, GROUND_E);
    } else {
      call(sim, 'sim_set_ground', 1, 0, 0, 1, 0, 0, -REST, GROUND_MU, GROUND_E);
    }
    sim.step(1);
    st = sim.readState().state;
    hash.update(sim.readStateBytes().bytes);
    call(sim, 'sim_world_report', repPtr);
    rep.set(new Float64Array(sim.e.memory.buffer, repPtr, 11));
    hash.update(Buffer.from(rep.buffer));
    for (let i = 0; i < 14; i += 1) {
      if (!Number.isFinite(st[i])) {
        throw new Error(`non-finite state at ${ms} ms`);
      }
    }
    const touching = rep[0] > 0;
    if (touching && !ctx.touched) {
      ctx.touched = true;
      ctx.t0 = ms;
    }
    rows.push({
      ms,
      p: [st[ST.X], st[ST.Y], st[ST.Z]],
      v: [st[ST.VX], st[ST.VY], st[ST.VZ]],
      spd: Math.hypot(st[ST.VX], st[ST.VY], st[ST.VZ]),
      up: upZ(st),
      touching,
      shape: rep[3],
      depth: rep[9],
      support: rep[10],
      ground: sim.e.sim_ground_contacts(),
    });
  }
  sim.e.free(repPtr);
  return { rows, hash: hash.digest('hex'), t0: ctx.t0, up };
}

/* The solids of each item, in order, and where they sit in the map's
 * solid list, which is the order the module numbers them. */
function itemRanges(placed) {
  const ranges = [];
  let at = 0;
  for (const it of placed.items) {
    const own = placeSolids(it.parts, it.x, it.y, it.z, it.yaw, it.turns, []);
    ranges.push({ item: it, from: at, to: at + own.length, own });
    at += own.length;
  }
  return ranges;
}

function buildColliders(placed) {
  const colliders = new Colliders();
  addSolids(colliders, placed.solids);
  colliders.build();
  return colliders;
}

/*
 * (a) THE ROOF. A spot on the flats' roof with nothing over it for 3.5 m:
 * the highest box under the craft's column is the roof, and the column is
 * clear of every solid by half a metre. The roof's height is read back from
 * the collider set, because that is the float32 the module was handed.
 */
function roofSpot(world, range) {
  const it = range.item;
  const boxes = [];
  for (let i = range.from; i < range.to; i += 1) {
    if (world.placed.solids[i].box) {
      boxes.push(i);
    }
  }
  /* The building's plan bounds, so a candidate spot is a metre inside them. */
  const b = boxes.reduce((acc, i) => {
    const s = world.placed.solids[i].box;
    return [Math.min(acc[0], s[0]), Math.min(acc[1], s[1]), Math.min(acc[2], s[2]),
      Math.max(acc[3], s[3]), Math.max(acc[4], s[4]), Math.max(acc[5], s[5])];
  }, [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]);
  const cands = [];
  for (let u = -3; u <= 3; u += 1) {
    for (let v = -3; v <= 3; v += 1) {
      cands.push([it.x + u * 1.5, it.z + v * 1.5, u * u + v * v]);
    }
  }
  cands.sort((p, q) => p[2] - q[2]);
  const C = world.colliders;
  for (const [x, z] of cands) {
    if (x < b[0] + 1 || x > b[3] - 1 || z < b[2] + 1 || z > b[5] - 1) {
      continue;
    }
    /* The highest box whose top is under the column, 0.3 m round it. */
    let top = -Infinity;
    let idx = -1;
    for (const i of boxes) {
      const s = world.placed.solids[i].box;
      if (x - 0.3 >= s[0] && x + 0.3 <= s[3] && z - 0.3 >= s[2] && z + 0.3 <= s[5] && C.fby[i] > top) {
        top = C.fby[i];
        idx = i;
      }
    }
    if (idx < 0 || top < 3) {
      continue;
    }
    const a = [x, top + 0.01, z];
    const c = [x, top + 3.5, z];
    let clear = Infinity;
    for (let i = 0; i < world.placed.solids.length; i += 1) {
      const s = world.placed.solids[i];
      if (i === idx || !aabbNear(aabbOf(s), [x, top, z, x, top + 3.5, z], 1)) {
        continue;
      }
      clear = Math.min(clear, segClearance(a, c, s));
    }
    if (clear >= 0.5) {
      return { x, z, top, idx, clear };
    }
  }
  return null;
}

async function roofScenario(world, f, ranges) {
  const range = ranges.find((r) => r.item.el.type === 'building' && r.item.el.style === 'flats');
  if (!range) {
    fail('(a) roof: the map has a block of flats', 'none found');
    return;
  }
  const spot = roofSpot(world, range);
  if (!check('(a) roof: a spot on the flats roof with 3.5 m of clear air over it', Boolean(spot),
    spot ? `roof top ${r3(spot.top)} m at (${r3(spot.x)}, ${r3(spot.z)}), nearest solid ${spot.clear === Infinity ? 'none' : `${r3(spot.clear)} m`} from the column` : 'no clear spot')) {
    return;
  }
  /* Dropped, motors idle, from 3 m over the roof. */
  const p = toPlant(f, spot.x, spot.top + 3 + REST, spot.z);
  const sc = { ms: 4000, p, sticks: () => [0, 0, 0, 0] };
  const res = await fly(world, f, sc);
  const res2 = await fly(world, f, sc);
  const rows = res.rows;
  const end = rows[rows.length - 1];
  const endW = toThree(f, end.p);
  const landed = rows.find((r) => r.ground > 0);
  const impact = landed ? rows[Math.max(0, landed.ms - 1)].spd : 0;
  if (verbose) {
    note(`first ground contact at ${landed?.ms} ms, ${r3(impact)} m/s, support ${landed?.support}; end y ${r3(endW[1])}, ${r3(end.spd)} m/s, up ${r3(end.up)}, support ${end.support}`);
  }
  check('(a) roof: two drops agree to the bit', res.hash === res2.hash);
  const onRoof = end.support >= range.from && end.support < range.to;
  check('(a) roof: the roof is the ground under it at rest', onRoof,
    `support shape ${end.support}, the flats are ${range.from} to ${range.to - 1}`);
  /* At rest on the roof: level and still, the CG at the parked height over
   * the roof's top. 3 cm is "a few centimetres": the street is metres
   * below, so this cannot be confused with falling through. */
  const dz = endW[1] - (spot.top + REST);
  check('(a) roof: comes to rest on the roof, not the street', end.spd < 0.05 && Math.abs(dz) <= 0.03 && end.up > 0.99,
    `CG ${r3(endW[1])} m against a roof at ${r3(spot.top)} m (${r3(dz * 1000)} mm off parked), ${r3(end.spd)} m/s, up ${r3(end.up)}, arrived at ${r3(impact)} m/s`);
  const deepest = Math.max(...rows.map((r) => r.depth));
  check('(a) roof: no contact deeper than 5 cm', deepest <= 0.05, `${r3(deepest)} m`);
}

/*
 * (b) THE MAST. The crane's mast is a square lattice; its four corner
 * chords run the full height. The craft is flown at one of them along the
 * mast's diagonal, from outside, so the chord is the first thing in its way
 * whichever way the braces zigzag. Where the craft is at 5 m/s is learned
 * from a flight in an empty world first, as world-check learns where to put
 * its wall, and the start is then set so that is a metre short of the chord.
 */
async function mastScenario(world, f, ranges) {
  const range = ranges.find((r) => r.item.el.type === 'crane');
  if (!range) {
    fail('(b) mast: the map has a crane', 'none found');
    return;
  }
  const it = range.item;
  const chords = [];
  for (let i = range.from; i < range.to; i += 1) {
    const s = world.placed.solids[i];
    if (s.cap && s.name === 'chord' && s.cap[0] === s.cap[3] && s.cap[2] === s.cap[5]) {
      chords.push(i);
    }
  }
  if (!check('(b) mast: the crane has four vertical corner chords', chords.length === 4, `${chords.length} found`)) {
    return;
  }
  const H = 5;
  /* The first corner chord, and the mast's diagonal out through it: the
   * mast is centred on the crane's origin (src/props/industrial.js
   * squareLattice), so the diagonal is the chord's offset from it. */
  const leg = world.placed.solids[chords[0]].cap;
  const r = leg[6];
  let dx = leg[0] - it.x;
  let dz = leg[2] - it.z;
  const dl = Math.sqrt(dx * dx + dz * dz);
  dx /= dl;
  dz /= dl;
  /* Travel is toward the chord: minus the outward diagonal. */
  const dirP = dirToPlant(f, -dx, 0, -dz);
  const legP = toPlant(f, leg[0], H, leg[2]);
  const zHold = legP[2];

  /* Which way does the craft go for this stick? Learn it, then turn it. */
  const probeSc = (q) => ({ empty: true, ms: 6000, p: [0, 0, zHold], q, sticks: approach(0.8, zHold) });
  const learn = await fly(world, f, probeSc([1, 0, 0, 0]));
  const at0 = learn.rows.find((row) => row.spd >= 5);
  if (!check('(b) mast: the approach reaches 5 m/s', Boolean(at0), at0 ? `after ${at0.ms} ms` : 'never')) {
    return;
  }
  const e0l = Math.hypot(at0.p[0], at0.p[1]);
  const e0 = [at0.p[0] / e0l, at0.p[1] / e0l];
  const cosT = e0[0] * dirP[0] + e0[1] * dirP[1];
  const sinT = e0[0] * dirP[1] - e0[1] * dirP[0];
  const q = yawQuat(cosT, sinT);
  const turned = await fly(world, f, probeSc(q));
  const at = turned.rows.find((row) => row.spd >= 5);
  /* One metre from the chord's surface when it first does 5 m/s. */
  const back = r + 1.0;
  const start = [
    legP[0] - dirP[0] * back - at.p[0],
    legP[1] - dirP[1] * back - at.p[1],
    zHold,
  ];
  /* Nothing but the crane between the start and the chord. */
  const a3 = toThree(f, start);
  const b3 = [leg[0], a3[1], leg[2]];
  let corridor = Infinity;
  let nearest = '';
  for (let i = 0; i < world.placed.solids.length; i += 1) {
    if (i >= range.from && i < range.to) {
      continue;
    }
    const s = world.placed.solids[i];
    if (!aabbNear(aabbOf(s), [Math.min(a3[0], b3[0]), a3[1] - 2, Math.min(a3[2], b3[2]), Math.max(a3[0], b3[0]), a3[1] + 2, Math.max(a3[2], b3[2])], 2)) {
      continue;
    }
    const c = segClearance(a3, b3, s);
    if (c < corridor) {
      corridor = c;
      nearest = `${s.kind} ${s.name}`;
    }
  }
  check('(b) mast: the approach is clear of everything but the crane', corridor >= 1,
    corridor === Infinity ? `${r3(Math.hypot(a3[0] - b3[0], a3[2] - b3[2]))} m run, nothing within 2 m` : `nearest ${nearest} at ${r3(corridor)} m`);

  const sc = { ms: 3000, p: start, q, sticks: approach(0.8, zHold) };
  const res = await fly(world, f, sc);
  const res2 = await fly(world, f, sc);
  const rows = res.rows;
  const t0 = res.t0;
  check('(b) mast: two runs agree to the bit', res.hash === res2.hash);
  if (!check('(b) mast: the craft reaches the mast and a world contact is reported', t0 >= 0,
    t0 >= 0 ? `at ${t0} ms, ${r3(rows[Math.max(0, t0 - 1)].spd)} m/s` : 'never touched')) {
    return;
  }
  const hit = new Set(rows.filter((row) => row.shape >= 0).map((row) => row.shape));
  const foreign = [...hit].filter((i) => i < range.from || i >= range.to);
  check('(b) mast: everything it touched is the crane', foreign.length === 0,
    foreign.length ? `shapes ${foreign.join(', ')}` : `shapes ${[...hit].map((i) => `${i} ${world.placed.solids[i].name}`).join(', ')}`);
  /* Along the approach, measured from the chord's axis: negative is short
   * of it. Through would be past it, or its centre closer to any member's
   * axis than that member's radius and the thinnest the hull is. */
  const along = (row) => (row.p[0] - legP[0]) * dirP[0] + (row.p[1] - legP[1]) * dirP[1];
  const furthest = Math.max(...rows.map(along));
  let closest = Infinity;
  let closestName = '';
  for (const row of rows) {
    const w = toThree(f, row.p);
    for (let i = range.from; i < range.to; i += 1) {
      const s = world.placed.solids[i];
      if (!s.cap || !aabbNear(aabbOf(s), [w[0], w[1], w[2], w[0], w[1], w[2]], 0.5)) {
        continue;
      }
      const [c0, c1, rr] = capEnds(s);
      const m = segSegDist(w, w, c0, c1) - rr;
      if (m < closest) {
        closest = m;
        closestName = s.name;
      }
    }
  }
  check('(b) mast: it does not pass through', furthest < 0 && closest >= HULL_MIN,
    `never nearer the chord's axis than ${r3(-furthest)} m along the approach; nearest any member's surface ${r3(closest)} m (${closestName})`);
  /* Stopped: within a third of a second of the first touch it has no speed
   * left toward the mast. */
  const vAlong = (row) => row.v[0] * dirP[0] + row.v[1] * dirP[1];
  const window = rows.filter((row) => row.ms >= t0 && row.ms <= t0 + 300);
  const left = Math.min(...window.map(vAlong));
  check('(b) mast: it is stopped by it', left <= 0.25,
    `${r3(vAlong(rows[t0 - 1]))} m/s toward it before, ${r3(left)} m/s within 300 ms of the hit`);
  if (verbose) {
    note(`start ${start.map(r3).join(', ')} plant; chord ${legP.map(r3).join(', ')}; hit ${t0} ms`);
  }
}

/*
 * (c) THE SPAWN, in two flights.
 *
 * The lift off: from rest on the pads, climbing to 1.5 m over a second. It
 * must leave the pads and touch nothing, or the first thing a pilot does on
 * the map is crash. No height band here: world-check's height hold winds
 * its integrator up while the motors spool on the pads and overshoots to
 * about 2.3 m (measured), which is the scripted pilot and not the map.
 *
 * The hover: world-check's own way, seated in the air at 1.5 m over the
 * spawn and held there for two seconds, where the same hold keeps within a
 * few centimetres. It must touch nothing and stay over the spawn.
 */
async function spawnScenario(world, f, label) {
  const lift = {
    ms: 3000,
    p: [0, 0, 0],
    sticks: (ms, st, ctx) => [0, 0, 0, heightHold(ctx, st, Math.min(1.5, 1.5 * (ms / 1000)))],
  };
  const hover = {
    ms: 2000,
    p: [0, 0, 1.5],
    sticks: (ms, st, ctx) => [0, 0, 0, heightHold(ctx, st, 1.5)],
  };
  const a = await fly(world, f, lift);
  const a2 = await fly(world, f, lift);
  const b = await fly(world, f, hover);
  const b2 = await fly(world, f, hover);
  check(`${label}: two runs of each agree to the bit`, a.hash === a2.hash && b.hash === b2.hash);
  const aTouch = a.rows.filter((row) => row.touching).length;
  const aTop = Math.max(...a.rows.map((row) => row.p[2]));
  check(`${label}: lifting off the pads touches nothing`, aTouch === 0 && aTop > 1,
    `${aTouch} steps in contact, up to ${r3(aTop)} m`);
  const bTouch = b.rows.filter((row) => row.touching).length;
  const zs = b.rows.map((row) => row.p[2]);
  const drift = Math.max(...b.rows.map((row) => Math.hypot(row.p[0], row.p[1])));
  check(`${label}: two seconds of hover over the spawn touch nothing`, bTouch === 0 && Math.min(...zs) > 1.3 && Math.max(...zs) < 1.7 && drift < 0.3,
    `${bTouch} steps in contact, height ${r3(Math.min(...zs))} to ${r3(Math.max(...zs))} m, drift ${r3(drift)} m`);
}

async function physicsBlock(world) {
  console.log('\n4. physics: the map of everything, in dist/sim.wasm');
  if (!(await loadModule())) {
    fail('dist/sim.wasm exists', 'build it with npm run build:wasm');
    return;
  }
  if (!world.everything) {
    world.everything = { doc: everythingDoc().doc };
    world.everything.placed = placeDocument(world.everything.doc);
  }
  const placed = world.everything.placed;
  const colliders = buildColliders(placed);
  const w = { placed, colliders };
  check('the collider set holds every solid', colliders.count === placed.solids.length,
    `${colliders.count} colliders from ${placed.solids.length} solids`);
  const ranges = itemRanges(placed);
  const flat = ranges.flatMap((r) => r.own);
  const d = firstDifference({ solids: flat, zones: [], spawn: placed.spawn }, { solids: placed.solids, zones: [], spawn: placed.spawn });
  check('the map is its items placed one by one, to the bit', d === null, d ?? `${ranges.length} items`);
  let up;
  try {
    const sim = await newSim();
    up = upload(sim, colliders);
  } catch (e) {
    fail('the module takes every solid', e.message);
    return;
  }
  check('the module takes every solid: sim_world_build returns the count', up.built === placed.solids.length && up.n === up.built && up.count === up.built,
    `sim_world_build ${up.built}, uploadWorld ${up.n}, sim_world_count ${up.count}, for ${placed.solids.length} solids`);
  const f = frameOf(placed.spawn);
  try {
    await roofScenario(w, f, ranges);
  } catch (e) {
    fail('(a) roof', e.stack);
  }
  try {
    await mastScenario(w, f, ranges);
  } catch (e) {
    fail('(b) mast', e.stack);
  }
  try {
    await spawnScenario(w, f, '(c) spawn');
  } catch (e) {
    fail('(c) spawn', e.stack);
  }
}

/* ------------------------------------------------------------------ */
/* The starter                                                         */
/* ------------------------------------------------------------------ */

/* A named gap's window, from src/maps/built/starter.js's own statement of
 * it: position is the middle of the sill, z the sill's height, yaw the
 * window's normal, `width` across it and `height` up from the sill. */
function windowOf(z) {
  const sc = sincos(z.yaw, { s: 0, c: 0 });
  return {
    c: [z.x, z.y + z.h / 2, z.z],
    n: [sc.c, 0, -sc.s],
    u: [sc.s, 0, sc.c],
    hw: z.w / 2,
    hh: z.h / 2,
  };
}
function pointWindowDist(p, w) {
  const d = sub(p, w.c);
  const a = dot(d, w.u);
  const b = d[1];
  const ea = a - clamp(a, -w.hw, w.hw);
  const eb = b - clamp(b, -w.hh, w.hh);
  const en = dot(d, w.n);
  return Math.sqrt(en * en + ea * ea + eb * eb);
}
function windowPoint(w, s, t) {
  const a = -w.hw + 2 * w.hw * s;
  const b = -w.hh + 2 * w.hh * t;
  return [w.c[0] + w.u[0] * a, w.c[1] + b, w.c[2] + w.u[2] * a];
}
/* Clearance between a solid and a window: a box by a nested search over
 * the window (the distance from a window point to a box is convex in both
 * coordinates, so the inner minimum is convex in the outer), a capsule by
 * a search along its axis. */
function windowClearance(w, s) {
  if (s.box) {
    return minConvex((u) => minConvex((v) => pointBoxDist(windowPoint(w, u, v), s.box)));
  }
  const [c0, c1, r] = capEnds(s);
  return minConvex((t) => pointWindowDist(lerp(c0, c1, t), w)) - r;
}

async function starterBlock() {
  console.log('\n5. starter: src/maps/built/starter.js');
  const path = join(root, 'src/maps/built/starter.js');
  if (!existsSync(path)) {
    skip('the starter map', 'src/maps/built/starter.js does not exist yet');
    return;
  }
  let mod;
  try {
    mod = await import(pathToFileURL(path).href);
  } catch (e) {
    fail('the starter map imports', e.message);
    return;
  }
  const { doc, repairs } = normalize(mod.starterMap());
  check('the starter normalizes with no repairs', repairs.length === 0, repairs.join(' | ') || `${doc.elements.length} elements`);
  const placed = placeDocument(doc);
  check('the starter: nothing inflated', (placed.stats.inflated || 0) === 0, `${placed.stats.inflated || 0}`);
  console.log(`        ${countShapes(placed)}, placement hash ${placementHash(placed)}`);
  const ranges = itemRanges(placed);

  /* No two elements' solids overlap. Touching is reported, not failed;
   * anything under the gap rule between two elements is listed, because
   * the builder warns about it and the author may mean it. */
  const boxes = ranges.map((r) => r.own.map(aabbOf));
  const overlaps = new Map();
  const narrow = new Map();
  let pairs = 0;
  for (let i = 0; i < ranges.length; i += 1) {
    for (let j = i + 1; j < ranges.length; j += 1) {
      const key = `${ranges[i].item.el.id} ${ranges[i].item.el.type} and ${ranges[j].item.el.id} ${ranges[j].item.el.type}`;
      for (let a = 0; a < ranges[i].own.length; a += 1) {
        for (let b = 0; b < ranges[j].own.length; b += 1) {
          if (!aabbNear(boxes[i][a], boxes[j][b], GAP_MIN)) {
            continue;
          }
          pairs += 1;
          const c = clearance(ranges[i].own[a], ranges[j].own[b]);
          /* A micrometre either way is the arithmetic, not the layout. */
          const into = c < -1e-6 ? overlaps : (c < GAP_MIN ? narrow : null);
          if (!into) {
            continue;
          }
          const was = into.get(key);
          if (!was || c < was.c) {
            into.set(key, { c, n: (was?.n ?? 0) + 1, parts: `${ranges[i].own[a].name} and ${ranges[j].own[b].name}` });
          } else {
            was.n += 1;
          }
        }
      }
    }
  }
  const over = [...overlaps].sort((p, q) => p[1].c - q[1].c);
  check("the starter: no two elements' solids overlap", over.length === 0,
    over.length
      ? over.map(([k, v]) => `${k}: ${v.n} solid pairs, deepest ${v.parts} ${r3(-v.c)} m in`).join('; ')
      : `${pairs} nearby solid pairs measured`);
  if (narrow.size) {
    const near = [...narrow].sort((p, q) => p[1].c - q[1].c);
    note(`closer than the ${GAP_MIN} m gap rule, element to element (the builder warns; not failed here): ${near.map(([k, v]) => `${k} ${r3(v.c)} m (${v.parts})`).join('; ')}`);
  }

  /* Every named gap's window is clear of every solid. */
  if (placed.zones.length === 0) {
    fail('the starter has named gaps', 'none');
  }
  for (const z of placed.zones) {
    const w = windowOf(z);
    const reach = Math.hypot(w.hw, w.hh);
    const around = [w.c[0] - reach, w.c[1] - reach, w.c[2] - reach, w.c[0] + reach, w.c[1] + reach, w.c[2] + reach];
    let worst = Infinity;
    let what = 'nothing within 2 m';
    for (const r of ranges) {
      for (const s of r.own) {
        if (!aabbNear(aabbOf(s), around, 2)) {
          continue;
        }
        const c = windowClearance(w, s);
        if (c < worst) {
          worst = c;
          what = `${r.item.el.id} ${r.item.el.type} ${s.name}`;
        }
      }
    }
    check(`the starter: ${z.name} (${r3(z.w)} by ${r3(z.h)} m) is clear of every solid`, worst > 0,
      worst === Infinity ? what : `nearest ${what} at ${r3(worst)} m`);
  }

  /*
   * THE PADS ON THE ROOF. The same map with its pads moved onto the open
   * north half of the office roof, facing north, at a Base of the roof's
   * 15 m: the builder has nothing to say, and the simulator seats the
   * craft on the roof, on a mat.
   */
  const raised = mod.starterMap();
  const padsEl = raised.elements.find((e) => e.type === 'startPads');
  padsEl.position = { x: 42, y: 129, z: 15 };
  padsEl.yaw = Math.PI / 2;
  const roofDoc = normalize(raised).doc;
  const roofPlaced = placeDocument(roofDoc);
  const office = ranges.find((r) => r.item.el.type === 'building' && r.item.el.style === 'office');
  const roof = office.own.find((s) => s.name === 'body').box;
  const rs = roofPlaced.spawn;
  check('the starter, pads on the office roof: the craft is seated on the roof, not in the building under it',
    rs.y === roof[4] && rs.base === 15 && rs.x > roof[0] && rs.x < roof[3] && rs.z > roof[2] && rs.z < roof[5],
    `seat ${r3(rs.y)} m at (${r3(rs.x)}, ${r3(rs.z)}), Base ${r3(rs.base)}, roof ${r3(roof[4])} m over x ${r3(roof[0])} to ${r3(roof[3])}, z ${r3(roof[2])} to ${r3(roof[5])}`);
  const roofWarn = freestyleReport(roofDoc).warnings;
  check('the starter, pads on the office roof: the builder report is clean', roofWarn.length === 0,
    roofWarn.map((w) => `${w.code}: ${w.message}`).join(' | ') || 'no warnings');

  /* And the pilot can take off where the starter puts them, on the ground
   * and on the roof, with the shell's own ground under them. */
  if (!(await loadModule())) {
    fail('the starter in the module', 'dist/sim.wasm does not exist');
  } else {
    try {
      const colliders = buildColliders(placed);
      const sim = await newSim();
      const up = upload(sim, colliders);
      check('the starter: sim_world_build returns the count', up.built === placed.solids.length && up.count === up.built,
        `${up.built} for ${placed.solids.length} solids`);
      const height = (x, z, fromY) => groundUnder(placed.tops, x, z, fromY);
      await spawnScenario({ placed, colliders, height }, builtFrame(placed), 'the starter spawn');
      const roofHeight = (x, z, fromY) => groundUnder(roofPlaced.tops, x, z, fromY);
      await spawnScenario({ placed: roofPlaced, colliders: buildColliders(roofPlaced), height: roofHeight },
        builtFrame(roofPlaced), 'the starter, pads on the office roof');
    } catch (e) {
      fail('the starter in the module', e.message);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Self test                                                           */
/* ------------------------------------------------------------------ */

/*
 * A check that cannot fail is not evidence. Plant one fault for each thing
 * the blocks above look for and require it to be seen: a layout with a NaN,
 * a solid box on an asset that turns freely, a kind the colliders do not
 * know, a placement one ulp off, a zero of the wrong sign, and the distances
 * the starter block trusts, against answers worked by hand.
 */
function selftestBlock() {
  console.log('\nself test: every detector sees a planted fault');
  const FAKE = '__propsCheckSelftest';
  const run = (layout, turns) => {
    PROPS[FAKE] = { id: FAKE, turns, layout, draw: null };
    const problems = new Map();
    try {
      checkElement({ id: 'el-1', type: FAKE, dims: {}, position: { x: 0, y: 0, z: 0 }, yaw: 0 }, turns, true, 'planted', problems, { parts: [] });
    } finally {
      delete PROPS[FAKE];
    }
    return [...problems.keys()];
  };
  const box = (lo, hi, o = {}) => ({ t: 'box', m: 'x', lo, hi, solid: true, draw: true, kind: 'wall', name: 'b', ...o });
  const cap = (a, b, r, o = {}) => ({ t: 'cap', m: 'x', a, b, r, solid: true, draw: true, kind: 'pole', name: 'c', ...o });
  const sees = (name, got, want) => check(`self test: ${name}`, got.includes(want), got.join(' | ') || 'nothing reported');

  sees('a NaN in a layout', run(() => [box([0, 0, 0], [1, NaN, 1])], 'quarter'), 'every number finite');
  const anyBox = run(() => [box([0, 0, 0], [1, 1, 1])], 'any');
  sees('a solid box on an asset that turns freely', anyBox, 'no solid box on an asset that turns freely');
  sees('and it is inflated at 0.4 rad', anyBox, 'nothing inflated at any heading');
  sees('a solid of an unknown kind', run(() => [cap([0, 0, 0], [0, 1, 0], 0.1, { kind: 'jelly' })], 'any'),
    'every part a real box or capsule of a known kind');
  sees('an inverted box', run(() => [box([0, 2, 0], [1, 1, 1])], 'quarter'), 'every part a real box or capsule of a known kind');
  sees('an asset with nothing solid', run(() => [box([0, 0, 0], [1, 1, 1], { solid: false })], 'quarter'), 'something solid');
  check('self test: a clean quarter asset passes', run(() => [box([-1, 0, -2], [3, 1, 0.5]), cap([0, 0, 0], [1, 2, 3], 0.2)], 'quarter').length === 0);
  check('self test: a clean free asset passes', run(() => [cap([0.3, 0, -0.7], [4, 2, 1.1], 0.2)], 'any').length === 0);

  /* The envelope's detectors (block 1b), each against the defect it was
   * written for, planted on a clean asset. */
  const chim = assetEl('chimney', null, PROPS.chimney.dims);
  const H = chim.dims.height;
  const cp = partsOf(chim);
  const cCalls = recordDraw(chim, cp);
  const clean = chimneyFit(H, cp, cCalls);
  check('self test: the default chimney fits its brick', clean.short <= BRICK_SHORT && clean.proud <= BRICK_PROUD && clean.top <= H + TOP_SLACK,
    `${r3(clean.short)} m short, ${r3(clean.proud)} m proud, top ${r3(clean.top - H)} m over the rim`);
  const noCap = chimneyFit(H, cp.filter((p) => p.name !== 'rim'), cCalls);
  check('self test: a chimney without its cap rings is seen short of the corbel', noCap.short > BRICK_SHORT,
    `${r3(noCap.short)} m short at ${r3(noCap.shortAt)} m`);
  const dome = cap([0, H - 0.4, 0], [0, H - 0.4, 0], 1.2, { m: 'brick', kind: 'wall', draw: false });
  const domed = chimneyFit(H, [...cp, dome], cCalls);
  check('self test: a dome over the rim is seen over it and outside the brick', domed.top > H + TOP_SLACK && domed.proud > BRICK_PROUD,
    `top ${r3(domed.top - H)} m over the rim, ${r3(domed.proud)} m proud`);
  const high = overDrawnTop('chimney', null, chim.dims, [...cp, cap([0, H + 1.5, 0], [0, H + 1.5, 0], 0.5, { kind: 'wall' })]);
  check('self test: a solid over the drawn top is seen', Boolean(high) && high.over > TOP_SLACK, high ? `${r3(high.over)} m over` : 'nothing solid');
  const flatsDims = { ...PROPS.building.dims, ...styleDims('building', 'flats') };
  const flats = assetEl('building', 'flats', flatsDims);
  const fp = partsOf(flats);
  const stairs = stairCounts(fp.filter((p) => p.name !== 'stairTread'), recordDraw(flats, fp));
  check('self test: stringers drawn over a layout without treads are seen', stairs.stringers > 0 && stairs.treads === 0,
    `${stairs.stringers} stringers, ${stairs.treads} treads`);

  const base = { solids: [{ kind: 'wall', name: 'a', box: [0, 0, 0, 1, 1, 1] }], zones: [], spawn: { x: 0, y: 0, z: 0, yaw: 0, base: 0 } };
  const ulp = { ...base, solids: [{ kind: 'wall', name: 'a', box: [0, 0, 0, 1 + 2 ** -52, 1, 1] }] };
  const negZero = { ...base, solids: [{ kind: 'wall', name: 'a', box: [-0, 0, 0, 1, 1, 1] }] };
  check('self test: a placement one ulp off is a difference', firstDifference(base, ulp) !== null);
  check('self test: -0 against 0 is a difference', firstDifference(base, negZero) !== null);
  check('self test: a placement against itself is none', firstDifference(base, { ...base }) === null);
  check('self test: the hash sees one ulp', placementHash(base) !== placementHash(ulp));

  /* Distances worked by hand. */
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  const B = (b) => ({ box: b });
  const C = (a, b, r) => ({ cap: [...a, ...b, r] });
  const cases = [
    ['two boxes 0.5 m apart', clearance(B([0, 0, 0, 1, 1, 1]), B([1.5, 0, 0, 2, 1, 1])), 0.5],
    ['two boxes 0.1 m into each other', clearance(B([0, 0, 0, 1, 1, 1]), B([0.9, 0.5, 0.5, 2, 2, 2])), -0.1],
    ['two boxes apart on a diagonal', clearance(B([0, 0, 0, 1, 1, 1]), B([4, 5, 0, 5, 6, 1])), 5],
    ['a capsule 0.3 m over a box, radius 0.1', clearance(B([0, 0, 0, 2, 1, 2]), C([-1, 1.3, 1], [3, 1.3, 1], 0.1)), 0.2],
    ['a capsule through a box', clearance(B([0, 0, 0, 2, 1, 2]), C([1, -1, 1], [1, 3, 1], 0.1)), -0.1],
    ['two parallel capsules 1 m apart', clearance(C([0, 0, 0], [0, 5, 0], 0.1), C([1, 0, 0], [1, 5, 0], 0.1)), 0.8],
    ['two crossed capsules 0.5 m apart', clearance(C([-1, 0, 0], [1, 0, 0], 0.1), C([0, 0.5, -1], [0, 0.5, 1], 0.1)), 0.3],
  ];
  /* A window 2 m wide and 1 m tall, sill at 1 m, facing +x, at the origin. */
  const w = windowOf({ x: 0, y: 1, z: 0, yaw: 0, w: 2, h: 1 });
  cases.push(['a box 0.25 m in front of a window', windowClearance(w, B([0.25, 0, -3, 1, 5, 3])), 0.25]);
  cases.push(['a box 0.4 m past a window edge', windowClearance(w, B([-1, 0, 1.4, 1, 5, 3])), 0.4]);
  cases.push(['a box under a window sill by 0.2 m', windowClearance(w, B([-1, 0, -3, 1, 0.8, 3])), 0.2]);
  cases.push(['a box through a window', windowClearance(w, B([-0.1, 1.2, -0.1, 0.1, 1.4, 0.1])), 0]);
  cases.push(['a pole 0.5 m beside a window, radius 0.1', windowClearance(w, C([0, 0, 1.5], [0, 3, 1.5], 0.1)), 0.4]);
  cases.push(['a pole through a window, radius 0.1', windowClearance(w, C([-1, 1.5, 0], [1, 1.5, 0], 0.1)), -0.1]);
  /* The same window turned a quarter: facing -z in the world, spanning x. */
  const wq = windowOf({ x: 0, y: 1, z: 0, yaw: Math.PI / 2, w: 2, h: 1 });
  cases.push(['a box 0.3 m beyond a quarter turned window', windowClearance(wq, B([1.3, 0, -1, 2, 5, 1])), 0.3]);
  for (const [name, got, want] of cases) {
    check(`self test: ${name}`, near(got, want), `${got}, want ${want}`);
  }
}

/*
 * The flights, against a planted fault: the map of everything with its
 * solids withheld from the module, everything else the same. The roof drop
 * must then end in the street and the mast run must touch nothing, so the
 * lines that pass in block 4 are seen to fail when the world is missing.
 */
async function selftestFlights() {
  if (!(await loadModule())) {
    fail('self test: the flights', 'dist/sim.wasm does not exist');
    return;
  }
  const placed = placeDocument(everythingDoc().doc);
  const none = new Colliders();
  none.build();
  const w = { placed, colliders: buildColliders(placed), upload: none };
  const f = frameOf(placed.spawn);
  const ranges = itemRanges(placed);
  captured = [];
  try {
    await roofScenario(w, f, ranges);
    await mastScenario(w, f, ranges);
  } finally {
    const got = captured;
    captured = null;
    const line = (start) => got.find((c) => c.name.startsWith(start));
    const roof = line('(a) roof: comes to rest on the roof');
    const mast = line('(b) mast: the craft reaches the mast');
    check('self test: with no world in the module, the roof drop fails', Boolean(roof) && !roof.ok, roof ? roof.detail : 'the line never ran');
    check('self test: with no world in the module, the mast run fails', Boolean(mast) && !mast.ok, mast ? mast.detail : 'the line never ran');
  }

  /*
   * The rooftop start, seated where the simulator used to seat it: at 0,
   * in the office under the pads, which is what dropping the pads' Base
   * did. The lift off must then be seen to touch the building.
   */
  const raw = (await import(pathToFileURL(join(root, 'src/maps/built/starter.js')).href)).starterMap();
  const padsEl = raw.elements.find((e) => e.type === 'startPads');
  padsEl.position = { x: 42, y: 129, z: 15 };
  padsEl.yaw = Math.PI / 2;
  const rp = placeDocument(normalize(raw).doc);
  captured = [];
  try {
    const height = (x, z, fromY) => groundUnder(rp.tops, x, z, fromY);
    await spawnScenario({ placed: rp, colliders: buildColliders(rp), height }, frameOf(rp.spawn, 0), 'planted');
  } finally {
    const got = captured;
    captured = null;
    const lift = got.find((c) => c.name.startsWith('planted: lifting off the pads touches nothing'));
    check('self test: raised pads seated at 0, inside the office, touch it lifting off', Boolean(lift) && !lift.ok,
      lift ? lift.detail : 'the line never ran');
  }
}

/* ------------------------------------------------------------------ */
/* The scene                                                           */
/* ------------------------------------------------------------------ */

/*
 * A MAP'S TIME OF DAY AND GROUND ARE PAINT AND LIGHT. So, for the starter
 * and for one of everything, at each of the sixteen scenes:
 *
 *   the scene round trips through the file, and a map with it places to
 *   exactly the solids, zones and spawn it places to with none, bit for
 *   bit, which is the statement that no scene changes the physics;
 *   src/maps/built/looks.js has a time for every time the document knows
 *   and a ground for every ground, each with every field it is read for,
 *   and golden asks the kit for nothing, so golden draws what it always
 *   drew;
 *   the buildings' lit windows (src/props/buildings.js, pane) change only
 *   glass: drawn at night against a kit that lights a share of panes, a
 *   building makes every other call it makes by day, in the same order
 *   with the same numbers, so the building a pilot sees at dusk is the one
 *   rolled at noon; and by day it lights nothing.
 *
 * Only what is pure is run here. The ground's paint and the lamps' glow
 * are Three.js, and are looked at in the shots.
 */
const LOOK_FIELDS = ['sun', 'fill', 'bounce', 'hemi', 'fog', 'sky', 'hills', 'ink', 'grade', 'wire'];
const GLASS = new Set(['bldPane', 'bldFrosted', 'bldBlind', 'bldSky', 'glassDark', 'glassBlue', 'glassLit',
  'curtainPink', 'curtainBlue', 'curtainCream', 'curtainGreen']);

/* A building's draw() against a kit that writes its calls down, lit or
 * not: at night a pane is lit when a hash of where it stands falls under
 * its share, which is enough to see the plumbing work without the real
 * kit's hash, which needs Three.js. */
function recordLit(el, parts, night) {
  const calls = [];
  let panes = 0;
  let lit = 0;
  const K = new Proxy({}, {
    get(t, k) {
      if (k === 'THREE') {
        return undefined;
      }
      if (k === 'night') {
        return night;
      }
      if (k === 'windowLight') {
        return (x, y, z, share) => {
          panes += 1;
          if (!night) {
            return 0;
          }
          const h = ((Math.imul(Math.round(x * 64), 73856093) ^ Math.imul(Math.round(y * 64), 19349663)
            ^ Math.imul(Math.round(z * 64), 83492791)) >>> 0) / 4294967296;
          if (h < share) {
            lit += 1;
            return 0xffc978;
          }
          return 0;
        };
      }
      return (...a) => {
        calls.push([k, ...a]);
      };
    },
  });
  PROPS[el.type].draw(el, parts, K);
  return { calls, panes, lit };
}

/* Everything but glass: the glow calls, and a box or plane in a glass
 * material, are what night is allowed to change. */
function notGlass(calls) {
  return calls.filter((c) => c[0] !== 'glow' && !(typeof c[1] === 'string' && GLASS.has(c[1])));
}

async function sceneBlock() {
  console.log('\n6. the scene: time of day and ground');
  let looks;
  try {
    looks = await import(pathToFileURL(join(root, 'src/maps/built/looks.js')).href);
  } catch (e) {
    fail('src/maps/built/looks.js imports in Node', e.message);
    return;
  }
  const { TIMES, GROUNDS, kitLook } = looks;
  check('looks.js has a time for every time the document knows, and no other',
    JSON.stringify(Object.keys(TIMES)) === JSON.stringify(SCENE_TIMES), Object.keys(TIMES).join(', '));
  check('and a ground for every ground', JSON.stringify(Object.keys(GROUNDS)) === JSON.stringify(SCENE_GROUNDS), Object.keys(GROUNDS).join(', '));
  const missing = [];
  for (const [id, T] of Object.entries(TIMES)) {
    for (const f of LOOK_FIELDS) {
      if (T[f] == null) {
        missing.push(`${id}.${f}`);
      }
    }
    for (const f of ['sun', 'fill', 'bounce']) {
      if (!(T[f] && Array.isArray(T[f].at) && T[f].at.length === 3 && T[f].at.every(Number.isFinite) && Number.isFinite(T[f].intensity))) {
        missing.push(`${id}.${f}.at/intensity`);
      }
    }
    if (!(T.sun.at[1] > 0)) {
      missing.push(`${id}: the sun is below the horizon`);
    }
    if (!(T.fog.near > 0 && T.fog.far > 0)) {
      missing.push(`${id}.fog`);
    }
  }
  for (const [id, G] of Object.entries(GROUNDS)) {
    if (!(Number.isInteger(G.plot) && Number.isInteger(G.tint) && G.terrain && typeof G.terrain.base === 'string')) {
      missing.push(`ground ${id}`);
    }
  }
  check('every time and ground has every field it is read for', missing.length === 0, missing.join(', '));
  check('golden asks the kit for nothing, so it draws what it always drew', kitLook('golden') === null);
  check('dusk lights the windows and dims the unlit materials',
    Boolean(kitLook('dusk') && kitLook('dusk').night && kitLook('dusk').flats));

  const starter = (await import(pathToFileURL(join(root, 'src/maps/built/starter.js')).href)).starterMap();
  for (const [label, raw] of [['the starter', starter], ['one of everything', everythingDoc().doc]]) {
    const base = normalize(raw).doc;
    const want = placementHash(placeDocument(base));
    let trips = 0;
    let same = 0;
    const odd = [];
    for (const time of SCENE_TIMES) {
      for (const ground of SCENE_GROUNDS) {
        const d = normalize(raw).doc;
        d.scene = { time, ground };
        const back = deserialize(serialize(d));
        const sc = sceneOf(back.doc);
        if (back.repairs.length === 0 && sc.time === time && sc.ground === ground) {
          trips += 1;
        } else {
          odd.push(`${time}/${ground} read back as ${sc.time}/${sc.ground}`);
        }
        const got = placementHash(placeDocument(back.doc));
        if (got === want) {
          same += 1;
        } else {
          odd.push(`${time}/${ground} placed differently: ${firstDifference(placeDocument(base), placeDocument(back.doc))}`);
        }
      }
    }
    const n = SCENE_TIMES.length * SCENE_GROUNDS.length;
    check(`${label}: all ${n} scenes round trip through the file`, trips === n, odd.join('; '));
    check(`${label}: and every one places to the same solids, zones and spawn, bit for bit`, same === n, odd.join('; ') || want.slice(0, 16));
  }

  /* The lit windows. Every building style at three variants. */
  let buildings = 0;
  let unchanged = 0;
  let darkByDay = 0;
  let panes = 0;
  let lit = 0;
  const changed = [];
  for (const style of PROPS.building.styles) {
    for (const variant of [1, 7, 42]) {
      const el = assetEl('building', style, { ...styleDims('building', style), variant });
      const parts = partsOf(el);
      const day = recordLit(el, parts, false);
      const night = recordLit(el, parts, true);
      buildings += 1;
      if (!day.calls.some((c) => c[0] === 'glow')) {
        darkByDay += 1;
      }
      const a = JSON.stringify(notGlass(day.calls));
      const b = JSON.stringify(notGlass(night.calls));
      if (a === b) {
        unchanged += 1;
      } else {
        changed.push(`${style} ${variant}`);
      }
      panes += night.panes;
      lit += night.lit;
    }
  }
  check(`no building lights a window by day (${buildings} buildings)`, darkByDay === buildings);
  check('at night a building draws exactly what it draws by day, glass aside', unchanged === buildings, changed.join(', '));
  check('and at night a share of its panes is lit', panes > 0 && lit > 0.2 * panes && lit < 0.8 * panes, `${lit} of ${panes}`);
}

/* ------------------------------------------------------------------ */

console.log('props-check: the freestyle assets, their placement, and the physics');
const world = {};
const blocks = args.includes('--selftest') ? [['selftest', selftestBlock], ['selftest', selftestFlights]] : [
  ['assets', assetsBlock],
  ['envelope', envelopeBlock],
  ['furniture', furnitureBlock],
  ['determinism', determinismBlock],
  ['physics', physicsBlock],
  ['starter', starterBlock],
  ['scene', sceneBlock],
];
for (const [name, fn] of blocks) {
  if (only && name !== only) {
    continue;
  }
  try {
    /* eslint-disable no-await-in-loop */
    await fn(world);
  } catch (e) {
    fail(`${name} block`, e.stack);
  }
}
console.log(`\nprops-check: ${failures === 0 ? 'all passed' : `${failures} FAILED`}`);
process.exit(failures);
