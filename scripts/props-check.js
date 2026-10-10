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
 * shows in a screenshot. This file looks for it in plain Node, in these
 * blocks:
 *
 *   1. assets      every prop type, every style, at its default dims and at
 *                  the min and max of every limit, at six headings: every
 *                  number finite, every part a real box or capsule, no solid
 *                  box on an asset that turns freely, quarter turns that are
 *                  exact permutations to the bit, nothing inflated
 *   1c. on end     the assets that stand on end (containers, the ledge), both
 *                  ways, at the same dims: the same boxes in the same sizes,
 *                  to a nanometre, with the lowest on the ground, the footprint
 *                  centred along the heading, z untouched, and no taller
 *                  than the builder says; and, in the module, a drop onto
 *                  a container stood on its end and onto one half sunk in the
 *                  ground, each landing on the part of it that is above the
 *                  paving, at the height it is
 *   1b. envelope   the same dims, what is solid against what is drawn: no
 *                  solid over the drawn top, the chimney's solids on its
 *                  brick, no stair drawn where the layout built none
 *   1d. fly through the chimney you can fly down and the turbine that
 *                  stands still, on their solids: the bore clear, the
 *                  doorway the width asked for with nothing solid in it, no
 *                  slot between solids, the drawing and the solids agreeing
 *                  to centimetres, the blades 2.5 m off the ground and
 *                  clear of the tower by the gap rule
 *   2. furniture   every course element a freestyle map may hold, the same
 *   3. determinism a map holding one of everything, placed twice from two
 *                  fresh documents, compared as Float64 bits and hashed, and
 *                  src/props/trig.js against the engine's own sine
 *   4. physics     that map uploaded to the module exactly as the shell does
 *                  it, and flown: a roof lands, the crane's mast stops a
 *                  craft, the spawn is clear; a craft dropped down the
 *                  hollow chimney's bore touches nothing and one flown in
 *                  through its doorway reaches the axis, while the wall
 *                  opposite stops it; the turbine's tower and a blade stop
 *                  a craft and the air between two blades does not; and
 *                  under every box thin enough for the height to reach,
 *                  the height answers from under it and a climb meets its
 *                  underside; and the builder's copy of the module's grid
 *                  (fs-crowded) drops what the module drops, and no map
 *                  here is over it
 *   5. starter     the starter map (src/maps/built/starter.js) and the
 *                  showpiece built on it (showpiece.js): no two elements'
 *                  solids overlap, every named gap is clear, the builder
 *                  has nothing to warn about, and the craft takes off from
 *                  the pads, and on the starter from the same pads raised
 *                  onto the office roof, seated where the shell seats it,
 *                  on the map's own ground; and a map with no pads and a
 *                  pylon over the point it starts from, where the start
 *                  is moved into the open and a climb straight up from it
 *                  clears the peak, which a climb from the point does not
 *   6. scene       a map's time of day and ground change paint and light
 *                  and never a solid
 *   7. egg         where the STF mark goes (src/maps/built/egg.js): on a
 *                  drawn wall with open air in front, in no solid, in full
 *                  sight of the pads, turned to them and in reach, no wall
 *                  that scores higher keeping the rules, the same every
 *                  time and whatever the id, on the starter, one of
 *                  everything, fifty random maps and maps built to reach
 *                  the ground fallback; pure, and timed on the starter and
 *                  on ten thousand solids. Then finding it
 *                  (src/game/egg.js), against the starter's real colliders,
 *                  and that nothing the builder loads can draw it
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
 * Usage: node scripts/props-check.js [--only=assets|tilt|envelope|flythrough|furniture|determinism|physics|starter|scene|egg] [--verbose]
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

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { loadSim, SIM_OK, simErrorName } from '../tests/lib/simmod.js';
import { PROPS, FURNITURE, partsOf, placedPartsOf } from '../src/props/catalog.js';
import { hollowShape, turbineShape } from '../src/props/industrial.js';
import { styleDims, approxHeight, fitDims } from '../src/props/types.js';
import { GAP_MIN, seededRandom, hashString } from '../src/props/parts.js';
import { placeSolids, placedYaw, addSolids } from '../src/props/solids.js';
import { sincos, quarterTurns, quarterSinCos } from '../src/props/trig.js';
import { Colliders, KINDS, GROUND_MU, GROUND_E } from '../src/game/collide.js';
import { uploadWorld, setWorldFrame } from '../src/game/plantworld.js';
import { threePosToSim, threeDirToSim } from '../src/render/frame.js';
import {
  createTrack, createElement, normalize, serialize, deserialize, SCENE_TIMES, SCENE_GROUNDS, sceneOf,
} from '../src/trackbuilder/model.js';
import { shouldFindMark } from '../src/game/egg.js';
import { ELEMENTS, KIND } from '../src/trackbuilder/elements.js';
import { placeDocument, groundUnder, indexTops, PLATFORM_REACH } from '../src/maps/built/place.js';
import { freestyleReport, crowdOf, CANDIDATES_MAX } from '../src/trackbuilder/warnings.js';

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
function checkElement(el, turns, expectSolid, label, problems, tally, partsFn = partsOf) {
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
    parts = partsFn(el);
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
        /* An asset that stands on end is checked as it stands too, both
         * ways: the same checks, on the parts as placedPartsOf gives them. */
        if (def.tilt) {
          for (const pitch of [Math.PI / 2, -Math.PI / 2]) {
            checkElement({ ...assetEl(type, style, dims), pitch }, def.turns, true,
              `${name}, on end ${pitch > 0 ? '+' : '-'}90`, problems, tally, placedPartsOf);
          }
        }
      }
      report(`${type}${style ? ` ${style}` : ''} (${def.turns})`, problems, tally, `${sets.length} dim sets x ${HEADINGS.length} headings${def.tilt ? ', and on end both ways' : ''}`);
    }
  }
}

/*
 * 1c. ON END. What standing an asset on its end must keep, over every style,
 * every dim set and both ways. It moves boxes and changes nothing else:
 * the same boxes in the same sizes, to the bit; the lowest on the ground
 * exactly, because Base is where it stands; the footprint centred along the
 * heading, because the origin is the middle of it; z untouched, because a
 * quarter about z does not move it; and no taller than the builder's drag
 * handle and readout say, which must never come out under what is drawn.
 */
function tiltBlock() {
  console.log('\n1c. on end: every asset that stands on end, both ways, at every dim set');
  const live = (parts) => parts.filter((p) => p.solid || p.draw);
  const lows = (parts, k) => Math.min(...live(parts).map((p) => (p.t === 'box' ? p.lo[k] : Math.min(p.a[k], p.b[k]) - p.r)));
  const highs = (parts, k) => Math.max(...live(parts).map((p) => (p.t === 'box' ? p.hi[k] : Math.max(p.a[k], p.b[k]) + p.r)));
  /* To a nanometre, not to the bit: each box is moved by the two offsets
   * that centre and seat it, and a sum is not exact, so a box's size can
   * differ from the layout's in its last place. The geometry between boxes
   * is not rounded at all: parts the layout put on one plane are the same
   * double, and the same offset keeps them so. */
  const sig = (parts) => parts.filter((p) => p.t === 'box')
    .map((p) => [p.hi[0] - p.lo[0], p.hi[1] - p.lo[1], p.hi[2] - p.lo[2]]
      .map((v) => Math.round(v * 1e9) / 1e9).sort((a, b) => a - b).join(','))
    .sort().join('|');
  let any = false;
  for (const [type, def] of Object.entries(PROPS)) {
    if (!def.tilt) {
      continue;
    }
    any = true;
    for (const style of def.styles ?? [null]) {
      const problems = new Map();
      const tally = { parts: [] };
      const add = (what, example) => {
        const list = problems.get(what) ?? [];
        problems.set(what, list);
        if (list.length < 3) {
          list.push(example);
        }
      };
      const sets = dimSets(type, style);
      for (const [name, dims] of sets) {
        for (const pitch of [Math.PI / 2, -Math.PI / 2]) {
          const el = { ...assetEl(type, style, dims), pitch };
          const up = partsOf(el);
          const on = placedPartsOf(el);
          const label = `${name}, ${pitch > 0 ? '+' : '-'}90`;
          tally.parts.push(on.length);
          if (on.length !== up.length) {
            add('as many parts as upright', `${label}: ${on.length} from ${up.length}`);
            continue;
          }
          if (sig(on) !== sig(up)) {
            add('the same boxes in the same sizes, to a nanometre', label);
          }
          if (lows(on, 1) !== 0) {
            add('the lowest part is on the ground', `${label}: ${lows(on, 1)}`);
          }
          const xs = [lows(on, 0), highs(on, 0)];
          if (Math.abs(xs[0] + xs[1]) > 1e-9) {
            add('the footprint is centred along the heading', `${label}: ${xs.join(' to ')}`);
          }
          if (lows(on, 2) !== lows(up, 2) || highs(on, 2) !== highs(up, 2)) {
            add('z is untouched', `${label}`);
          }
          const said = approxHeight(type, dims, style, 1);
          if (!(said >= highs(on, 1) - 1e-9)) {
            add('no taller than the builder says', `${label}: ${highs(on, 1)} over ${said}`);
          }
          /* Both ways stand it on its end: the same height, up to which end. */
          const other = placedPartsOf({ ...el, pitch: -pitch });
          if (Math.abs(highs(other, 1) - highs(on, 1)) > 0.8) {
            add('both ways stand it as tall', `${label}`);
          }
        }
      }
      report(`${type}${style ? ` ${style}` : ''} on end`, problems, tally, `${sets.length} dim sets, both ways`);
    }
  }
  check('some asset stands on end', any);
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
/* 1d. A chimney to fly down, and a turbine that stands still           */
/* ------------------------------------------------------------------ */

/*
 * TWO ASSETS A MAP BUILDER ASKED FOR (bug-e605ff6a), and what each promises a
 * pilot, measured on the solids the module is given, never on the numbers the
 * layout built them from:
 *
 *   hollowChimney  the bore is clear, nothing within 1.2 m of its axis at any
 *                  height at any size the builder offers (2.4 m across or
 *                  more), so the top is open; the doorway is as wide as it
 *                  was asked for, up to what the wall allows, never under the
 *                  gap rule, with nothing solid in it; no slot between two of
 *                  its solids; and the drawing and the solids agree to
 *                  centimetres: every solid point is inside the drawn brick,
 *                  and the drawn surface is never more than 9 cm from a
 *                  solid, so no wall is drawn that is not there and none is
 *                  there that is not drawn.
 *   turbine        the lowest blade tip hangs 2.5 m or more over the ground, a
 *                  blade hanging straight down clears the tower by the gap
 *                  rule, no slot between two of its solids, the builder's
 *                  height readout is over its highest solid at every rotor
 *                  position, and the cones the tower and the blades are drawn
 *                  as hold their solids and are held by them.
 *
 * The drawing is read by running the asset's own draw() against a kit that
 * writes its calls down (recordDraw), as the chimney's is.
 */
const BORE_MIN = 1.2;
const DOOR_EXACT = 0.02;
const DOOR_STOP = 1.309;
const FIT_THICK = 0.09;
const FOOT_MIN = 2.5;
const TWO_PI = Math.PI * 2;

/* Every solid of an asset at the origin, heading 0, where the asset's own
 * frame is the world's: +x the heading, +y up, +z to the right. */
function solidsAtOrigin(el) {
  return placeSolids(partsOf(el), 0, 0, 0, 0, 'any', []);
}

function hitsSolid(p, solids) {
  for (const s of solids) {
    if (aabbNear(aabbOf(s), [p[0], p[1], p[2], p[0], p[1], p[2]], 0) && segClearance(p, p, s) <= 0) {
      return true;
    }
  }
  return false;
}

/* The nearest any capsule's surface comes to the vertical axis from the
 * ground to over the top, and which one it is. */
function boreClearance(solids, top) {
  let least = Infinity;
  let who = '';
  for (const s of solids) {
    if (!s.cap) {
      continue;
    }
    const [c0, c1, r] = capEnds(s);
    const d = segSegDist([0, -1, 0], [0, top + 1, 0], c0, c1) - r;
    if (d < least) {
      least = d;
      who = s.name;
    }
  }
  return { least, who };
}

/*
 * The doorway as the solids make it: its width is the gap between the two
 * jamb columns, its height is the lowest underside over it (the lintel
 * staves'), and `hits` is how many of a grid of points inside the opening are
 * inside a solid.
 */
function doorwayOf(solids) {
  const jambs = solids.filter((s) => s.name === 'jamb');
  const lintels = solids.filter((s) => s.name === 'lintel');
  if (jambs.length !== 2 || lintels.length === 0) {
    return { width: NaN, height: NaN, hits: Infinity };
  }
  let height = Infinity;
  for (const s of lintels) {
    const [c0, c1, r] = capEnds(s);
    height = Math.min(height, Math.min(c0[1], c1[1]) - r);
  }
  /* The width is the gap a craft meets at the top of the opening, a hair
   * under the lintel, not at the jambs' buried tops, which lean in a little
   * further. */
  const across = (s) => {
    const [c0, c1, r] = capEnds(s);
    const t = (height - 0.01 - c0[1]) / (c1[1] - c0[1]);
    return [lerp(c0, c1, t), r];
  };
  const [pa, ra] = across(jambs[0]);
  const [pb] = across(jambs[1]);
  const width = Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]) - 2 * ra;
  let hits = 0;
  const reach = Math.max(...solids.map((s) => aabbOf(s)[3]));
  for (let x = 0; x <= reach + 0.5; x += 0.3) {
    for (let z = -(width / 2 - 0.03); z <= width / 2 - 0.03 + 1e-9; z += 0.3) {
      for (let y = 0.05; y <= height - 0.05; y += 0.4) {
        if (hitsSolid([x, y, z], solids)) {
          hits += 1;
        }
      }
    }
  }
  return { width, height, hits };
}

/* The closest points of two segments, as { a, b, d }. */
function segSegClosest(p1, q1, p2, q2) {
  const d1 = sub(q1, p1);
  const d2 = sub(q2, p2);
  const r = sub(p1, p2);
  const a = dot(d1, d1);
  const e = dot(d2, d2);
  const f = dot(d2, r);
  let s;
  let t;
  if (a <= 1e-12 && e <= 1e-12) {
    s = 0;
    t = 0;
  } else if (a <= 1e-12) {
    s = 0;
    t = clamp(f / e, 0, 1);
  } else {
    const c = dot(d1, r);
    if (e <= 1e-12) {
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
  const pa = lerp(p1, q1, s);
  const pb = lerp(p2, q2, t);
  return { a: pa, b: pb, d: Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]) };
}

/*
 * The narrowest SLOT between two of an asset's capsules: a pair whose
 * surfaces never touch and come closer than the gap rule, with nothing else
 * solid in the space between their nearest points. A pair that overlaps is
 * joined, and a pair with a third solid between them (a stave two along in a
 * ring, a blade root inside the hub) has no space between it. Returns the
 * width and the pair, or Infinity.
 */
function narrowestSlot(solids) {
  let least = Infinity;
  let pair = '';
  for (let i = 0; i < solids.length; i += 1) {
    for (let j = i + 1; j < solids.length; j += 1) {
      const A = solids[i];
      const B = solids[j];
      if (!A.cap || !B.cap || !aabbNear(aabbOf(A), aabbOf(B), GAP_MIN)) {
        continue;
      }
      const [a0, a1, ra] = capEnds(A);
      const [b0, b1, rb] = capEnds(B);
      const near = segSegClosest(a0, a1, b0, b1);
      const gap = near.d - ra - rb;
      if (!(gap > 1e-6 && gap < GAP_MIN && gap < least)) {
        continue;
      }
      const n = [(near.b[0] - near.a[0]) / near.d, (near.b[1] - near.a[1]) / near.d, (near.b[2] - near.a[2]) / near.d];
      const from = [near.a[0] + n[0] * ra, near.a[1] + n[1] * ra, near.a[2] + n[2] * ra];
      const to = [near.b[0] - n[0] * rb, near.b[1] - n[1] * rb, near.b[2] - n[2] * rb];
      let free = true;
      for (let k = 1; k < 8 && free; k += 1) {
        free = !hitsSolid(lerp(from, to, k / 8), solids);
      }
      if (free) {
        least = gap;
        pair = `${A.name} and ${B.name}`;
      }
    }
  }
  return { least, pair };
}

function pointSegDist(a, b, p) {
  const d = sub(b, a);
  const l2 = dot(d, d);
  const t = l2 > 0 ? clamp(dot(sub(p, a), d) / l2, 0, 1) : 0;
  const e = sub(p, lerp(a, b, t));
  return Math.hypot(e[0], e[1], e[2]);
}

/* Points on and round a capsule's surface, two millimetres inside it so a
 * point that is on the drawn brick's own surface is not a coin toss. */
function capSamples(s, nt = 9, na = 8) {
  const [a, b, r0] = capEnds(s);
  const r = r0 - 0.002;
  const d = sub(b, a);
  const len = Math.hypot(d[0], d[1], d[2]);
  const ax = len > 1e-9 ? [d[0] / len, d[1] / len, d[2] / len] : [0, 1, 0];
  const ref = Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  let u = cross3(ax, ref);
  const ul = Math.hypot(u[0], u[1], u[2]);
  u = [u[0] / ul, u[1] / ul, u[2] / ul];
  const v = cross3(ax, u);
  const at = (c, k, side, along) => {
    const ang = (k / na) * TWO_PI;
    const x = Math.cos(ang) * side;
    const y = Math.sin(ang) * side;
    return [0, 1, 2].map((m) => c[m] + r * (x * u[m] + y * v[m]) + along * ax[m]);
  };
  const pts = [];
  for (let i = 0; i < nt; i += 1) {
    const c = lerp(a, b, i / (nt - 1));
    for (let k = 0; k < na; k += 1) {
      pts.push(at(c, k, 1, 0));
    }
  }
  /* The two domes: the tip, and a ring half way up each. */
  for (const [c, sg] of [[a, -1], [b, 1]]) {
    pts.push(at(c, 0, 0, sg * r));
    for (let k = 0; k < na; k += 1) {
      pts.push(at(c, k, 0.7071, sg * 0.7071 * r));
    }
  }
  return pts;
}

/* What the hollow chimney's draw says is brick, read off its recorded calls:
 * between the inward and the outward shell that cover a height and a heading
 * (the doorway has neither), inside a jamb column, or inside the rim's roll. */
function hollowDrawn(calls) {
  const shells = calls.filter((c) => c[0] === 'shell').map((c) => ({ y0: c[2], y1: c[3], r0: c[4], r1: c[5], arc: c[6], inward: c[7] }));
  const radiusAt = (sh, y) => sh.r0 + ((sh.r1 - sh.r0) * (y - sh.y0)) / (sh.y1 - sh.y0);
  const covering = (y, phi, inward) => shells.find((sh) => sh.inward === inward && y >= sh.y0 - 1e-9 && y <= sh.y1 + 1e-9
    && (!sh.arc || (phi >= sh.arc[0] - 1e-9 && phi <= sh.arc[1] + 1e-9)));
  const cols = calls.filter((c) => c[0] === 'cyl' && c[1] === 'brick');
  const rims = calls.filter((c) => c[0] === 'rim' && BRICK.has(c[1]));
  const wall = (y, phi) => {
    const o = covering(y, phi, false);
    const i = covering(y, phi, true);
    return o && i ? [radiusAt(i, y), radiusAt(o, y)] : null;
  };
  return {
    wall,
    has(p, tol) {
      const r = Math.hypot(p[0], p[2]);
      const phi = ((Math.atan2(p[2], p[0]) % TWO_PI) + TWO_PI) % TWO_PI;
      const w = wall(p[1], phi);
      if (w && r >= w[0] - tol && r <= w[1] + tol) {
        return true;
      }
      if (cols.some((c) => pointSegDist(c[2], c[3], p) <= c[4] + tol)) {
        return true;
      }
      return rims.some((m) => {
        const arc = m[6];
        if (arc && ((((phi - arc[0]) % TWO_PI) + TWO_PI) % TWO_PI) > arc[1] - arc[0] + 1e-9) {
          return false;
        }
        return (r - m[3]) ** 2 + (p[1] - m[2]) ** 2 <= (m[4] + tol) ** 2;
      });
    },
  };
}

/* How many of `points` the drawing does not cover, and the first, plus the
 * furthest a point on the drawn surfaces `samples` is from every solid. */
function fitOf(solids, covers, samples) {
  const out = { outside: 0, outsideAt: '', far: 0, farAt: '' };
  for (const s of solids) {
    for (const p of capSamples(s)) {
      if (p[1] >= 0 && !covers(p)) {
        out.outside += 1;
        if (!out.outsideAt) {
          out.outsideAt = `${s.name} at ${p.map(r3).join(', ')}`;
        }
      }
    }
  }
  for (const [p, where] of samples()) {
    if (p[1] < 0) {
      continue;
    }
    let near = Infinity;
    for (const s of solids) {
      if (aabbNear(aabbOf(s), [p[0], p[1], p[2], p[0], p[1], p[2]], FIT_THICK)) {
        near = Math.min(near, segClearance(p, p, s));
      }
    }
    if (near > out.far) {
      out.far = near;
      out.farAt = where;
    }
  }
  return out;
}

/* The hollow chimney's drawing against its solids, both ways. */
function hollowFit(H, solids, calls) {
  const drawn = hollowDrawn(calls);
  return fitOf(solids, (p) => drawn.has(p, 0.01), function* samples() {
    const N = 48;
    for (let y = 0.15; y < H - 0.05; y += 0.35) {
      for (let k = 0; k < N; k += 1) {
        const phi = ((k + 0.37) / N) * TWO_PI;
        const w = drawn.wall(y, phi);
        for (const r of w ?? []) {
          yield [[r * Math.cos(phi), y, r * Math.sin(phi)], `y ${r3(y)}, heading ${r3(phi)}, radius ${r3(r)}`];
        }
      }
    }
  });
}

/* What the turbine's draw says is material: the capsules the layout draws as
 * themselves (nacelle, hub) and the cones the draw() makes. */
function coneVolumes(parts, calls) {
  const vols = [];
  for (const p of parts) {
    if (p.draw && p.t === 'cap' && p.look === 'capsule') {
      vols.push({ a: p.a, b: p.b, r0: p.r, r1: p.r, capsule: true });
    }
  }
  for (const c of calls) {
    if (c[0] === 'cyl') {
      vols.push({ a: c[2], b: c[3], r0: c[4], r1: c[6] ?? c[4], capsule: false });
    }
  }
  return vols;
}

function insideVolume(v, p, tol) {
  const d = sub(v.b, v.a);
  const l2 = dot(d, d);
  const t = l2 > 0 ? dot(sub(p, v.a), d) / l2 : 0;
  if (!v.capsule && (t < -1e-9 || t > 1 + 1e-9)) {
    return false;
  }
  const tt = clamp(t, 0, 1);
  const e = sub(p, lerp(v.a, v.b, tt));
  return Math.hypot(e[0], e[1], e[2]) <= v.r0 + (v.r1 - v.r0) * tt + tol;
}

/* The turbine's drawing against its solids, both ways. */
function coneFit(solids, parts, calls) {
  const vols = coneVolumes(parts, calls);
  return fitOf(solids, (p) => vols.some((v) => insideVolume(v, p, 0.01)), function* samples() {
    for (const v of vols) {
      if (v.capsule) {
        continue;
      }
      const d = sub(v.b, v.a);
      const len = Math.hypot(d[0], d[1], d[2]);
      const ax = [d[0] / len, d[1] / len, d[2] / len];
      const ref = Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
      let u = cross3(ax, ref);
      const ul = Math.hypot(u[0], u[1], u[2]);
      u = [u[0] / ul, u[1] / ul, u[2] / ul];
      const w = cross3(ax, u);
      for (let i = 1; i < 24; i += 1) {
        const t = i / 24;
        const c = lerp(v.a, v.b, t);
        const r = v.r0 + (v.r1 - v.r0) * t;
        for (let k = 0; k < 8; k += 1) {
          const ang = (k / 8) * TWO_PI;
          yield [[0, 1, 2].map((m) => c[m] + r * (Math.cos(ang) * u[m] + Math.sin(ang) * w[m])),
            `cone from ${v.a.map(r3).join(', ')} at ${r3(t)}`];
        }
      }
    }
  });
}

/* The dim sets the two assets are checked at: every limit alone, all at the
 * minimum, all at the maximum, and every corner of the limits. */
function cornerSets(type) {
  const def = PROPS[type];
  const keys = Object.keys(def.limits);
  const sets = dimSets(type, null);
  for (let m = 0; m < 1 << keys.length; m += 1) {
    const d = { ...def.dims };
    keys.forEach((k, i) => {
      d[k] = def.limits[k][(m >> i) & 1];
    });
    sets.push([`corner ${keys.map((k) => `${k} ${d[k]}`).join(', ')}`, d]);
  }
  return sets;
}

/* One problem list per promise, over every dim set. */
function hollowProblems(name, dims) {
  const out = {};
  const el = assetEl('hollowChimney', null, dims);
  const solids = solidsAtOrigin(el);
  const H = dims.height;
  const bore = boreClearance(solids, H);
  if (bore.least < BORE_MIN) {
    out.bore = `${name}: ${r3(bore.least)} m from the axis (${bore.who})`;
  }
  const door = doorwayOf(solids);
  const atStop = hollowShape(el).jamb >= DOOR_STOP - 1e-6;
  if (atStop && dims.door <= 1.25 * dims.radius + 1e-9) {
    out.stop = `${name}: a doorway of ${dims.door} m on a stack ${dims.radius} m in radius, which the builder allows, is stopped at 75 degrees`;
  }
  if (!(door.width >= GAP_MIN + 0.1)) {
    out.doorW = `${name}: the doorway is ${r3(door.width)} m, under the gap rule's ${GAP_MIN} m and a margin`;
  } else if (!atStop && door.width < dims.door - DOOR_EXACT) {
    out.doorW = `${name}: asked for ${dims.door} m, got ${r3(door.width)} m`;
  } else if (atStop && door.width > dims.door + DOOR_EXACT) {
    out.doorW = `${name}: at the stop, ${r3(door.width)} m is over the ${dims.door} m asked for`;
  }
  const ratio = door.height / door.width;
  const onFloor = door.height <= 3.2 + 0.02;
  const onRoof = door.height >= 0.5 * H - 0.02;
  if (!(door.height >= 3.2 - 0.02 && door.height <= 0.5 * H + 0.02) || (!onFloor && !onRoof && Math.abs(ratio - 1.5) > 0.075)) {
    out.doorH = `${name}: ${r3(door.height)} m high on ${r3(door.width)} m wide (${r3(ratio)})`;
  }
  if (door.hits !== 0) {
    out.doorHits = `${name}: ${door.hits} points in the doorway are solid`;
  }
  const slot = narrowestSlot(solids);
  if (slot.least < GAP_MIN) {
    out.slot = `${name}: ${r3(slot.least)} m between ${slot.pair}`;
  }
  const fit = hollowFit(H, solids, recordDraw(el, partsOf(el)));
  if (fit.outside > 0) {
    out.fitIn = `${name}: ${fit.outside} solid points outside the drawn brick, the first ${fit.outsideAt}`;
  }
  if (fit.far > FIT_THICK) {
    out.fitFar = `${name}: drawn ${r3(fit.far)} m from any solid at ${fit.farAt}`;
  }
  return { out, count: solids.length };
}

/*
 * The highest point of what an asset draws: its drawn parts, and every cone
 * and ball its draw() paints, a cone counted to the rim of its end caps,
 * which on a cone that leans stand r * sin(lean) over the middle of the end.
 * A blade's red tip is such a cap, and the turbine's readout once left it
 * out: 11 cm under the drawn tip of a 60 m blade at Rotor 0.5.
 */
function drawnTop(parts, calls) {
  let top = -Infinity;
  for (const p of parts) {
    if (p.draw) {
      top = Math.max(top, topOf(p));
    }
  }
  for (const c of calls) {
    if (c[0] === 'cyl') {
      const [a, b, ra] = [c[2], c[3], c[4]];
      const rb = c[6] ?? ra;
      const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      const lean = L > 0 ? Math.sqrt(Math.max(0, 1 - ((b[1] - a[1]) / L) ** 2)) : 1;
      top = Math.max(top, a[1] + ra * lean, b[1] + rb * lean);
    } else if (c[0] === 'ball') {
      top = Math.max(top, c[2][1] + c[3]);
    }
  }
  return top;
}

function turbineProblems(name, dims0, spins) {
  const out = { foot: [], gap: [], slot: [], top: [], drawn: [] };
  let count = 0;
  for (const spin of spins) {
    const dims = { ...dims0, spin };
    const label = `${name}, spin ${spin}`;
    const solids = solidsAtOrigin(assetEl('turbine', null, dims));
    count = solids.length;
    const blades = solids.filter((s) => s.name === 'blade');
    const tower = solids.filter((s) => s.name === 'tower');
    const lowest = Math.min(...blades.map((s) => Math.min(s.cap[1], s.cap[4]) - s.cap[6]));
    if (lowest < FOOT_MIN - 1e-6) {
      out.foot.push(`${label}: a blade reaches down to ${r3(lowest)} m`);
    }
    let gap = Infinity;
    for (const b of blades) {
      for (const t of tower) {
        gap = Math.min(gap, clearance(b, t));
      }
    }
    if (gap < GAP_MIN) {
      out.gap.push(`${label}: ${r3(gap)} m between a blade and the tower`);
    }
    const slot = narrowestSlot(solids);
    if (slot.least < GAP_MIN) {
      out.slot.push(`${label}: ${r3(slot.least)} m between ${slot.pair}`);
    }
    const highest = Math.max(...solids.map((s) => Math.max(s.cap[1], s.cap[4]) + s.cap[6]));
    const said = approxHeight('turbine', dims, null);
    if (highest > said + TOP_SLACK) {
      out.top.push(`${label}: a solid reaches ${r3(highest)} m, the readout says ${r3(said)} m`);
    }
    const el = assetEl('turbine', null, dims);
    const parts = partsOf(el);
    const drawn = drawnTop(parts, recordDraw(el, parts));
    if (drawn > said + 1e-6) {
      out.drawn.push(`${label}: drawn to ${r3(drawn)} m, the readout says ${r3(said)} m`);
    }
  }
  return { out, count };
}

function flyThroughBlock() {
  console.log('\n1d. a chimney to fly down and a turbine that stands still: what each promises, on the solids');
  const hollow = { bore: [], doorW: [], doorH: [], doorHits: [], slot: [], fitIn: [], fitFar: [], stop: [] };
  const counts = [];
  const hsets = cornerSets('hollowChimney');
  /* The builder holds a doorway to a radius and a quarter, so every size it
   * can ask for is checked too: the corners as the builder holds them, and
   * every radius against its widest and narrowest doorway at three heights. */
  for (const [name, dims] of [...hsets]) {
    const held = fitDims('hollowChimney', { ...dims });
    if (held.door !== dims.door) {
      hsets.push([`${name}, held (door ${held.door})`, held]);
    }
  }
  for (const radius of [2.4, 3, 4, 5.5, 7]) {
    for (const height of [8, 20, 80]) {
      for (const door of [1.6, 8]) {
        const dims = fitDims('hollowChimney', { ...PROPS.hollowChimney.dims, radius, height, door });
        hsets.push([`radius ${radius}, height ${height}, door ${dims.door} held`, dims]);
      }
    }
  }
  for (const [name, dims] of hsets) {
    const { out, count } = hollowProblems(name, dims);
    counts.push(count);
    for (const k of Object.keys(out)) {
      hollow[k].push(out[k]);
    }
  }
  const range = `${hsets.length} dim sets, ${Math.min(...counts)} to ${Math.max(...counts)} solids`;
  const say = (label, list, detail) => check(label, list.length === 0, list.slice(0, 3).join(' | ') || detail);
  say('hollowChimney: the bore is clear, 2.4 m across at the least, at every size', hollow.bore, range);
  say('hollowChimney: the doorway is the width asked for, up to what the wall allows, and never under the gap rule', hollow.doorW, range);
  say('hollowChimney: the door is half as high again as it is wide, within 3.2 m and half the stack', hollow.doorH, range);
  say('hollowChimney: every doorway the builder allows is built at the width asked, never stopped short', hollow.stop, range);
  say('hollowChimney: nothing is solid in the doorway', hollow.doorHits, range);
  say('hollowChimney: no slot between two of its solids', hollow.slot, range);
  say('hollowChimney: every solid point is inside the drawn brick', hollow.fitIn, range);
  say('hollowChimney: the drawn brick is never far from a solid', hollow.fitFar, range);

  const turb = { foot: [], gap: [], slot: [], top: [], drawn: [], sym: [], fitIn: [], fitFar: [] };
  const tcounts = [];
  const tsets = cornerSets('turbine');
  const spins = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1];
  for (const [name, dims0] of tsets) {
    const { out, count } = turbineProblems(name, dims0, spins);
    tcounts.push(count);
    for (const k of Object.keys(out)) {
      turb[k].push(...out[k]);
    }
    /* Three blades alike: a whole turn of Rotor, 1, is the rotor it started as. */
    const box = (spin) => {
      const list = solidsAtOrigin(assetEl('turbine', null, { ...dims0, spin })).filter((s) => s.name === 'blade');
      return [0, 1, 2].flatMap((k) => [Math.min(...list.map((s) => Math.min(s.cap[k], s.cap[k + 3]))), Math.max(...list.map((s) => Math.max(s.cap[k], s.cap[k + 3])))]);
    };
    const A = box(0);
    const B = box(1);
    if (A.some((v, i) => Math.abs(v - B[i]) > 1e-3)) {
      turb.sym.push(`${name}: spin 0 and spin 1 are not the same rotor`);
    }
    const el = assetEl('turbine', null, dims0);
    const parts = partsOf(el);
    const fit = coneFit(solidsAtOrigin(el), parts, recordDraw(el, parts));
    if (fit.outside > 0) {
      turb.fitIn.push(`${name}: ${fit.outside} solid points outside what is drawn, the first ${fit.outsideAt}`);
    }
    if (fit.far > FIT_THICK) {
      turb.fitFar.push(`${name}: drawn ${r3(fit.far)} m from any solid at ${fit.farAt}`);
    }
  }
  const trange = `${tsets.length} dim sets x ${spins.length} rotor positions, ${Math.min(...tcounts)} to ${Math.max(...tcounts)} solids`;
  say('turbine: the lowest blade tip hangs 2.5 m over the ground or more', turb.foot, trange);
  say('turbine: a blade hanging down clears the tower by the gap rule', turb.gap, trange);
  say('turbine: no slot between two of its solids', turb.slot, trange);
  say('turbine: the readout is over the highest solid at every rotor position', turb.top, trange);
  say('turbine: the readout is never under what is drawn, blade tips and all, at every rotor position', turb.drawn, trange);
  say('turbine: a whole turn of Rotor is the rotor it started as', turb.sym, `${tsets.length} dim sets`);
  say('turbine: every solid point is inside what is drawn', turb.fitIn, `${tsets.length} dim sets`);
  say('turbine: what is drawn is never far from a solid', turb.fitFar, `${tsets.length} dim sets`);
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
  /* Stood on end both ways, a ledge on end, and a container sunk 1.3 m: the
   * map of everything holds them like any other, so determinism, the module
   * and the grid all see them, and the drops in physicsBlock can land on
   * one (stack 2 so its top clears 3 m even sunk, which roofSpot asks). */
  entries.push({ type: 'containers', style: '40ft', pitch: Math.PI / 2, tag: 'stood' });
  entries.push({ type: 'containers', style: '40ft open', pitch: -Math.PI / 2, tag: 'stood open' });
  entries.push({ type: 'ledge', pitch: Math.PI / 2, tag: 'stood' });
  entries.push({ type: 'containers', style: '40ft', z: -1.3, tag: 'sunk' });
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
    if (e.pitch != null) {
      el.pitch = e.pitch;
    }
    if (e.tag) {
      el.name = e.tag;
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
const REST = 0.033;
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
 * SURFACE_BIAS under it with the CG itself as cgY, with the five tap
 * limited slope taken every eight steps, and every step while the craft is
 * past 60 degrees. Without it, it is level at the frame's height, which is
 * the street for the flights that prove the module holds the solids: a
 * roof the harness handed the plant as ground could not show that. Returns
 * every step's row and a hash of every state block and contact report.
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
        const h0 = world.height(w[0], w[2], from, w[1]);
        const nx = limitSlope(h0 - world.height(w[0] + e, w[2], from, w[1]), world.height(w[0] - e, w[2], from, w[1]) - h0);
        const nz = limitSlope(h0 - world.height(w[0], w[2] + e, from, w[1]), world.height(w[0], w[2] - e, from, w[1]) - h0);
        const inv = 1 / Math.sqrt(nx * nx + e * e + nz * nz);
        ground.n = dirToPlant(f, nx * inv, e * inv, nz * inv);
      }
      const gp = toPlant(f, w[0], world.height(w[0], w[2], from, w[1]), w[2]);
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

async function roofScenario(world, f, ranges, label = '(a) roof', pick = (r) => r.item.el.type === 'building' && r.item.el.style === 'flats', what = 'the flats', topBand = null) {
  const range = ranges.find(pick);
  if (!range) {
    fail(`${label}: the map has ${what}`, 'none found');
    return;
  }
  const spot = roofSpot(world, range);
  if (!check(`${label}: a spot on ${what} with 3.5 m of clear air over it`, Boolean(spot),
    spot ? `roof top ${r3(spot.top)} m at (${r3(spot.x)}, ${r3(spot.z)}), nearest solid ${spot.clear === Infinity ? 'none' : `${r3(spot.clear)} m`} from the column` : 'no clear spot')) {
    return;
  }
  /* WHERE THE ROOF MUST BE, for a case that is about where a thing is: a
   * drop that lands on SOME roof of the container proves nothing about
   * whether it was stood on end or half sunk, since flat it has a roof too.
   * (A first version of this passed with the placement ignoring the tilt.) */
  if (topBand && !check(`${label}: its roof is where it stands, ${topBand[0]} to ${topBand[1]} m`,
    spot.top >= topBand[0] && spot.top <= topBand[1], `${r3(spot.top)} m`)) {
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
  check(`${label}: two drops agree to the bit`, res.hash === res2.hash);
  const onRoof = end.support >= range.from && end.support < range.to;
  check(`${label}: it is the ground under the craft at rest`, onRoof,
    `support shape ${end.support}, ${what} is ${range.from} to ${range.to - 1}`);
  /* At rest on the roof: level and still, the CG at the parked height over
   * the roof's top. 3 cm is "a few centimetres": the street is metres
   * below, so this cannot be confused with falling through. */
  const dz = endW[1] - (spot.top + REST);
  check(`${label}: comes to rest on the roof, not the street`, end.spd < 0.05 && Math.abs(dz) <= 0.03 && end.up > 0.99,
    `CG ${r3(endW[1])} m against a top at ${r3(spot.top)} m (${r3(dz * 1000)} mm off parked), ${r3(end.spd)} m/s, up ${r3(end.up)}, arrived at ${r3(impact)} m/s`);
  const deepest = Math.max(...rows.map((r) => r.depth));
  check(`${label}: no contact deeper than 5 cm`, deepest <= 0.05, `${r3(deepest)} m`);
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
 * A STRAIGHT FLIGHT, as the mast run is flown: angle mode, the stick forward,
 * the height held, turned onto a direction and set so the craft first does
 * 5 m/s `back` metres short of a point. All of it in Three.js world metres:
 * `at` is the point [x, z], `y` the height held, `dir` the direction of
 * travel [x, z], a unit vector. Returns two identical runs, so the caller can
 * hold them to the bit, with where the point is in the plant's frame; or null
 * when the craft never reaches 5 m/s.
 */
async function straightFlight(world, f, o) {
  const dirP = dirToPlant(f, o.dir[0], 0, o.dir[1]);
  const atP = toPlant(f, o.at[0], o.y, o.at[1]);
  const zHold = atP[2];
  const probe = (q) => ({ empty: true, ms: 6000, p: [0, 0, zHold], q, sticks: approach(0.8, zHold) });
  const learn = await fly(world, f, probe([1, 0, 0, 0]));
  const at0 = learn.rows.find((row) => row.spd >= 5);
  if (!at0) {
    return null;
  }
  const e0l = Math.hypot(at0.p[0], at0.p[1]);
  const e0 = [at0.p[0] / e0l, at0.p[1] / e0l];
  const q = yawQuat(e0[0] * dirP[0] + e0[1] * dirP[1], e0[0] * dirP[1] - e0[1] * dirP[0]);
  const turned = await fly(world, f, probe(q));
  const at = turned.rows.find((row) => row.spd >= 5);
  const start = [atP[0] - dirP[0] * o.back - at.p[0], atP[1] - dirP[1] * o.back - at.p[1], zHold];
  const sc = { ms: o.ms ?? 3500, p: start, q, sticks: approach(0.8, zHold) };
  const res = await fly(world, f, sc);
  const res2 = await fly(world, f, sc);
  return { res, res2 };
}

/* An item's own axes in the world: where its heading and its right hand point
 * in (x, z), as place.js turns them, and a point's distance along and across. */
function axesOf(it) {
  const sc = sincos(it.yaw, { s: 0, c: 0 });
  const ahead = [sc.c, -sc.s];
  const right = [sc.s, sc.c];
  return {
    ahead,
    right,
    along: (w, from = [0, 0]) => (w[0] - it.x - from[0]) * ahead[0] + (w[2] - it.z - from[1]) * ahead[1],
    across: (w, from = [0, 0]) => (w[0] - it.x - from[0]) * right[0] + (w[2] - it.z - from[1]) * right[1],
    /* the world's (x, z) of a point `x` ahead and `z` to the right */
    at: (x, z) => [it.x + x * ahead[0] + z * right[0], it.z + x * ahead[1] + z * right[1]],
  };
}

/*
 * (h) THE HOLLOW CHIMNEY, flown in the module. Dropped from over the rim it
 * must fall the whole bore touching nothing and land on its floor; flown in
 * through the doorway at 5 m/s it must reach the axis touching nothing, in
 * the middle of the opening; and, the control that says the flights can see
 * the wall at all, flown at the wall opposite the door it is stopped by it.
 */
async function chimneyFlights(world, f, ranges) {
  const range = ranges.find((r) => r.item.el.type === 'hollowChimney');
  if (!check('(h) hollow chimney: the map has one', Boolean(range), range ? '' : 'none found')) {
    return;
  }
  const it = range.item;
  const el = it.el;
  const H = el.dims.height;
  const shape = hollowShape(el);
  const ax = axesOf(it);

  const drop = { ms: 4200, p: toPlant(f, it.x, H + 1.5 + REST, it.z), sticks: () => [0, 0, 0, 0] };
  const a = await fly(world, f, drop);
  const b = await fly(world, f, drop);
  check('(h1) dive: two drops down the bore agree to the bit', a.hash === b.hash);
  const landed = a.rows.find((r) => r.ground > 0);
  const fall = landed ? a.rows.slice(0, landed.ms) : a.rows;
  const end = toThree(f, a.rows[a.rows.length - 1].p);
  check('(h1) dive: it falls the whole height of the bore touching nothing, and lands on the floor of it',
    Boolean(landed) && fall.every((r) => !r.touching) && Math.hypot(end[0] - it.x, end[2] - it.z) < 1,
    `${landed ? `lands at ${landed.ms} ms` : 'never lands'}, ${fall.filter((r) => r.touching).length} steps in contact, ends ${r3(Math.hypot(end[0] - it.x, end[2] - it.z))} m from the axis`);

  const into = await straightFlight(world, f, { at: [it.x, it.z], dir: [-ax.ahead[0], -ax.ahead[1]], y: 1.6, back: el.dims.radius + 3 });
  if (check('(h2) door: the approach reaches 5 m/s', Boolean(into), into ? '' : 'never')) {
    const pts = into.res.rows.map((r) => toThree(f, r.p));
    const k = pts.findIndex((w) => ax.along(w) <= 0);
    check('(h2) door: two flights in through the doorway agree to the bit', into.res.hash === into.res2.hash);
    const before = into.res.rows.slice(0, k < 0 ? undefined : k);
    const drift = Math.max(0, ...pts.slice(0, k < 0 ? undefined : k).map((w) => Math.abs(ax.across(w))));
    check('(h2) door: it flies in through the middle of the doorway to the axis of the bore, touching nothing',
      k > 0 && before.every((r) => !r.touching) && drift < shape.clear / 2 - 0.35,
      `${k < 0 ? 'never reaches the axis' : `reaches it at ${k} ms`}, ${before.filter((r) => r.touching).length} steps in contact, at most ${r3(drift)} m off the middle of a ${r3(shape.clear)} m opening`);
  }

  const wall = await straightFlight(world, f, { at: [it.x, it.z], dir: ax.ahead, y: 1.6, back: el.dims.radius + 3 });
  if (check('(h3) back wall: the approach reaches 5 m/s', Boolean(wall), wall ? '' : 'never')) {
    const rows = wall.res.rows;
    const t0 = wall.res.t0;
    const pts = rows.map((r) => toThree(f, r.p));
    const reach = Math.max(...pts.map((w) => ax.along(w)));
    const hit = new Set(rows.filter((r) => r.shape >= 0).map((r) => r.shape));
    const foreign = [...hit].filter((i) => i < range.from || i >= range.to);
    check('(h3) back wall: the wall opposite the door stops it, and it is the chimney that does', t0 >= 0 && reach < 0 && foreign.length === 0,
      `${t0 < 0 ? 'never touched' : `touched at ${t0} ms`}, reached ${r3(reach)} m along the doorway's axis (0 is the axis), ${foreign.length ? `foreign shapes ${foreign.join(', ')}` : 'only the chimney'}`);
  }
}

/*
 * (t) THE TURBINE, flown in the module, rotor at 0 (one blade straight up).
 * At 8 m, at the tower from ahead, under the lowest blade: stopped by the
 * tower. At the middle of the blade standing up, from ahead: stopped by a
 * blade. And through the rotor plane half way out between that blade and the
 * next, which is open air: touching nothing, all the way across.
 */
async function turbineFlights(world, f, ranges) {
  const range = ranges.find((r) => r.item.el.type === 'turbine');
  if (!check('(t) turbine: the map has one', Boolean(range), range ? '' : 'none found')) {
    return;
  }
  const it = range.item;
  const el = it.el;
  const s = turbineShape(el);
  const ax = axesOf(it);
  const names = (rows) => [...new Set(rows.filter((r) => r.shape >= 0).map((r) => world.placed.solids[r.shape].name))];
  const ours = (rows) => rows.filter((r) => r.shape >= 0).every((r) => r.shape >= range.from && r.shape < range.to);

  const tower = await straightFlight(world, f, { at: [it.x, it.z], dir: [-ax.ahead[0], -ax.ahead[1]], y: 8, back: 6 });
  if (check('(t1) tower: the approach reaches 5 m/s', Boolean(tower), tower ? '' : 'never')) {
    const rows = tower.res.rows;
    const reach = Math.min(...rows.map((r) => ax.along(toThree(f, r.p))));
    check('(t1) tower: it is stopped by the tower, and by nothing else', tower.res.t0 >= 0 && reach > 0 && ours(rows) && names(rows).every((n) => n === 'tower'),
      `${tower.res.t0 < 0 ? 'never touched' : `touched at ${tower.res.t0} ms`}, nearest the axis ${r3(reach)} m (the tower is ${r3(s.rb)} m round at the foot), touched ${names(rows).join(', ')}`);
  }

  const blade = await straightFlight(world, f, { at: ax.at(s.xb, 0), dir: [-ax.ahead[0], -ax.ahead[1]], y: s.H + s.s0 + s.L / 2, back: 6 });
  if (check('(t2) blade: the approach reaches 5 m/s', Boolean(blade), blade ? '' : 'never')) {
    const rows = blade.res.rows;
    const reach = Math.min(...rows.map((r) => ax.along(toThree(f, r.p))));
    check('(t2) blade: it is stopped by the blade standing up, and by nothing else',
      blade.res.t0 >= 0 && reach > s.xb && ours(rows) && names(rows).every((n) => n === 'blade'),
      `${blade.res.t0 < 0 ? 'never touched' : `touched at ${blade.res.t0} ms`}, nearest ${r3(reach - s.xb)} m ahead of the blade's axis (negative would be through it), touched ${names(rows).join(', ')}`);
  }

  /* The open air between blade 0 (up) and blade 1 (a third of a turn round): the
   * point at 60 degrees, 60 per cent of the way out. */
  const rho = 0.6 * s.L;
  const gap = await straightFlight(world, f, { at: ax.at(s.xb, rho * 0.8660254), dir: [-ax.ahead[0], -ax.ahead[1]], y: s.H + rho * 0.5, back: 8, ms: 4000 });
  if (check('(t3) rotor: the approach reaches 5 m/s', Boolean(gap), gap ? '' : 'never')) {
    const rows = gap.res.rows;
    const pts = rows.map((r) => toThree(f, r.p));
    const lo = Math.min(...pts.map((w) => ax.along(w)));
    const hi = Math.max(...pts.map((w) => ax.along(w)));
    check('(t3) rotor: two flights through the rotor agree to the bit', gap.res.hash === gap.res2.hash);
    check('(t3) rotor: it flies through the open air between two blades, from ahead of the rotor to behind it, touching nothing',
      rows.every((r) => !r.touching) && hi > s.xb + 1 && lo < s.xb - 1,
      `${rows.filter((r) => r.touching).length} steps in contact, from ${r3(hi - s.xb)} m ahead of the rotor's plane to ${r3(s.xb - lo)} m behind it`);
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

/*
 * (d) UNDER A THIN BOX. The shell asks the map's height from SURFACE_BIAS
 * under the CG, and ./place.js counts a top as ground up to PLATFORM_REACH
 * over that, so a top up to 0.15 m over the CG is in reach. A box thinner
 * than that with air under it (a scaffold board, an open container's roof,
 * a bridge flange) is then in reach of a craft still under it, and a height
 * that handed its top as the ground lifted the craft up through it in one
 * step, with no contact. Every such place, in every prop, style and dim
 * set, for each airframe's hull (src/native/plant.c hull_hx, hull_hz_down,
 * hull_hz_up; the plan half width taken to the corner): the height asked
 * as the shell asks it must answer from under the craft. And a climb into
 * one box of each name must meet its underside in the module.
 */
const HULLS = [
  { name: 'five inch', plan: 0.094 * Math.SQRT2, down: 0.033, up: 0.038 },
  /* In the room's metres: plant.c's whoop hull times len_scale. */
  { name: 'whoop', plan: 0.094 * Math.SQRT2, down: 0.0329, up: 0.0617 },
];
const REACH_OVER_CG = PLATFORM_REACH - SURFACE_BIAS;
/* More than a metre a millisecond is not a climb. */
const STEP_JUMP = 0.05;

/* Every place under a thin box of one asset where the hull touches
 * nothing and the box's top is within reach of the shell's query, and what
 * `ask`, the map's groundUnder unless a self test plants another, answers
 * there. */
function thinBoxSpots(type, style, dims, hull, ask = groundUnder) {
  const el = assetEl(type, style, dims);
  const solids = placeSolids(partsOf(el), 0, 0, 0, 0, PROPS[type].turns ?? 'any', []);
  const tops = indexTops(solids);
  const bounds = solids.map(aabbOf);
  const spots = [];
  for (const s of solids) {
    const b = s.box;
    if (!b || !(b[4] - b[1] < REACH_OVER_CG)) {
      continue;
    }
    for (let i = 1; i < 10; i += 2) {
      for (let j = 1; j < 10; j += 2) {
        const x = b[0] + ((b[3] - b[0]) * i) / 10;
        const z = b[2] + ((b[5] - b[2]) * j) / 10;
        const col = bounds.filter((a) => x > a[0] - hull.plan && x < a[3] + hull.plan
          && z > a[2] - hull.plan && z < a[5] + hull.plan);
        const clear = (cg) => cg - hull.down > 0 && col.every((a) => a[4] <= cg - hull.down || a[1] >= cg + hull.up);
        for (let cg = b[1] - hull.up - 0.001; cg >= b[4] - REACH_OVER_CG; cg -= 0.005) {
          if (clear(cg)) {
            spots.push({ s, b, x, z, cg, clear, h: ask(tops, x, z, cg - SURFACE_BIAS, cg) });
          }
        }
      }
    }
  }
  return { solids, tops, spots };
}

function thinBoxScan(ask = groundUnder) {
  const found = [];
  for (const hull of HULLS) {
    let places = 0;
    const boxes = new Set();
    const bad = [];
    const firsts = new Map();
    for (const [type, def] of Object.entries(PROPS)) {
      if (def.zone) {
        continue;
      }
      for (const style of def.styles ?? [null]) {
        for (const [name, dims] of dimSets(type, style)) {
          const { spots } = thinBoxSpots(type, style, dims, hull, ask);
          for (const sp of spots) {
            places += 1;
            const key = `${type}${style ? ` ${style}` : ''} ${sp.s.name}`;
            boxes.add(key);
            if (!firsts.has(key)) {
              firsts.set(key, { type, style, dims, name, key, x: sp.x, z: sp.z });
            }
            if (!(sp.h <= sp.cg - hull.down)) {
              bad.push(`${key} (${name}) y ${r3(sp.b[1])} to ${r3(sp.b[4])} at (${r3(sp.x)}, ${r3(sp.z)}): CG ${r3(sp.cg)} m, height ${r3(sp.h)} m`);
            }
          }
        }
      }
    }
    check(`(d) under a thin box, ${hull.name}: the height never hands a box over the craft as its ground`, bad.length === 0 && places > 0,
      bad.length ? `${bad.length} of ${places}: ${bad.slice(0, 3).join(' | ')}`
        : `${places} places under ${boxes.size} boxes thinner than ${r3(REACH_OVER_CG)} m: ${[...boxes].join(', ')}`);
    if (hull === HULLS[0]) {
      found.push(...firsts.values());
    }
  }
  return found;
}

/* A climb straight up into the box from as far under it as the column is
 * clear, up to 0.6 m, with the shell's own ground under the craft. */
async function thinBoxClimb(spot, ask = groundUnder) {
  const el = assetEl(spot.type, spot.style, spot.dims);
  const solids = placeSolids(partsOf(el), 0, 0, 0, 0, PROPS[spot.type].turns ?? 'any', []);
  const tops = indexTops(solids);
  const { spots } = thinBoxSpots(spot.type, spot.style, spot.dims, HULLS[0]);
  const sp = spots.find((c) => `${spot.type}${spot.style ? ` ${spot.style}` : ''} ${c.s.name}` === spot.key
    && c.x === spot.x && c.z === spot.z);
  let cg = sp.cg;
  while (cg - 0.005 > sp.b[1] - 0.6 && sp.clear(cg - 0.005)) {
    cg -= 0.005;
  }
  const f = frameOf({ x: sp.x, z: sp.z, yaw: 0 }, 0);
  const w = {
    colliders: buildColliders({ solids }),
    height: (X, Z, fromY, cgY) => ask(tops, X, Z, fromY, cgY),
  };
  const run = await fly(w, f, {
    ms: 2000,
    p: toPlant(f, sp.x, cg, sp.z),
    sticks: (ms) => [0, 0, 0, ms < 200 ? HOVER : HOVER + 0.06],
  });
  let jump = 0;
  let top = -Infinity;
  for (let i = 0; i < run.rows.length; i += 1) {
    const y = run.rows[i].p[2] + f.o[2];
    top = Math.max(top, y);
    if (i) {
      jump = Math.max(jump, run.rows[i].p[2] - run.rows[i - 1].p[2]);
    }
  }
  const steps = run.rows.filter((row) => row.touching).length;
  check(`(d) under a thin box: a climb into the ${spot.key} meets its underside`,
    steps > 0 && jump < STEP_JUMP && top < sp.b[1],
    `from CG ${r3(cg)} m under a box from ${r3(sp.b[1])} to ${r3(sp.b[4])} m (${spot.name}): first contact at ${run.t0} ms, ${steps} steps in contact, highest CG ${r3(top)} m, largest rise in one step ${r3(jump)} m`);
}

async function thinBoxScenario() {
  for (const spot of thinBoxScan()) {
    await thinBoxClimb(spot);
  }
}

/*
 * (e) THE MODULE'S GRID. src/native/world.c gathers the shapes round the
 * craft from 8 m cells and keeps the first WORLD_MAX_CAND of them, dropping
 * the rest without a word, and crowdOf in src/trackbuilder/warnings.js
 * (fs-crowded) is the builder's copy of that grid. Here the copy is held to
 * the module: laid out in the plan crowdOf assumes and uploaded the shell's
 * way, 1100 small shapes high in one cell and a wall just inside the next,
 * with the craft's hull 3 cm into the wall from the first cell's side. The
 * module must gather the first cell first and never see the wall, and see
 * it with the filler gone. And the maps flown here must be under the cap.
 */
function simBox(a) {
  /* A box in the plant's plan as a Three.js box: x is -sim y, z is -sim x. */
  return { kind: 'wall', name: 'grid', box: [-a[4], a[2], -a[3], -a[1], a[5], -a[0]] };
}

async function gridScenario(maps) {
  const corner = simBox([0, 0, 60, 0.1, 0.1, 60.1]);
  const filler = [];
  for (let i = 0; i < 1100; i += 1) {
    const x = 4 + (i % 30) * 0.1;
    const y = 0.5 + Math.floor(i / 30) * 0.15;
    filler.push(simBox([x, y, 50, x + 0.05, y + 0.05, 50.05]));
  }
  const wall = simBox([8.01, 3, 0, 9, 4, 20]);
  const touch = async (solids) => {
    const sim = await newSim();
    upload(sim, buildColliders({ solids }));
    call(sim, 'sim_set_pose', 7.95, 3.5, 10, 1, 0, 0, 0);
    for (let ms = 0; ms < 20; ms += 1) {
      sim.input(ms / 1000, 0, 0, 0, 0.45);
      sim.step(1);
    }
    const rep = new Float64Array(11);
    const ptr = sim.e.malloc(11 * 8);
    call(sim, 'sim_world_report', ptr);
    rep.set(new Float64Array(sim.e.memory.buffer, ptr, 11));
    sim.e.free(ptr);
    return rep[0];
  };
  const crowded = [corner, ...filler, wall];
  const hidden = await touch(crowded);
  const seen = await touch([corner, wall]);
  check('(e) the module drops shapes past the cap, where crowdOf counts them',
    hidden === 0 && seen > 0 && crowdOf(crowded).max > CANDIDATES_MAX && crowdOf([corner, wall]).max <= CANDIDATES_MAX,
    `a wall behind ${filler.length} shapes of the cell before it: ${hidden} steps in contact, alone ${seen}; crowdOf ${crowdOf(crowded).max} and ${crowdOf([corner, wall]).max}`);
  for (const [label, placed] of maps) {
    const c = crowdOf(placed.solids);
    check(`(e) ${label}: no two by two block of the module's cells holds more than ${CANDIDATES_MAX} shapes`, c.max <= CANDIDATES_MAX,
      `the most is ${c.max}`);
  }
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
  /* The same drop onto a container stood on its end and onto one half sunk in
   * the ground: each is a surface where it is drawn, at the height it is,
   * which for the stood one is twelve metres up on a box the layout never
   * put there, and for the sunk one is a roof 1.3 m lower than a flat one.
   * Held by the module, not by the placement's own arithmetic. */
  try {
    /* Two 40 foot containers: stood, the roof is the end of the stack, 12.19 m
     * up and a little over for the offset of the upper one; flat it would be
     * 5.18 m. Sunk 1.3 m it is 5.18 - 1.3 = 3.88 m. */
    await roofScenario(w, f, ranges, '(a2) stood',
      (r) => r.item.el.type === 'containers' && r.item.el.name === 'stood', 'a container stood on end', [12.1, 13.1]);
    await roofScenario(w, f, ranges, '(a3) sunk',
      (r) => r.item.el.type === 'containers' && r.item.el.name === 'sunk', 'a container half sunk in the ground', [3.8, 3.95]);
  } catch (e) {
    fail('(a2, a3) stood and sunk', e.stack);
  }
  try {
    await mastScenario(w, f, ranges);
  } catch (e) {
    fail('(b) mast', e.stack);
  }
  try {
    await chimneyFlights(w, f, ranges);
  } catch (e) {
    fail('(h) hollow chimney', e.stack);
  }
  try {
    await turbineFlights(w, f, ranges);
  } catch (e) {
    fail('(t) turbine', e.stack);
  }
  try {
    await spawnScenario(w, f, '(c) spawn');
  } catch (e) {
    fail('(c) spawn', e.stack);
  }
  try {
    await thinBoxScenario();
  } catch (e) {
    fail('(d) under a thin box', e.stack);
  }
  try {
    const starter = (await import(pathToFileURL(join(root, 'src/maps/built/starter.js')).href)).starterMap();
    const showpiece = (await import(pathToFileURL(join(root, 'src/maps/built/showpiece.js')).href)).showpieceMap();
    await gridScenario([['the map of everything', placed], ['the starter', placeDocument(normalize(starter).doc)],
      ['the showpiece', placeDocument(normalize(showpiece).doc)]]);
  } catch (e) {
    fail('(e) the module grid', e.stack);
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

/*
 * The maps this block holds: the starter, and the showpiece built on it
 * (src/maps/built/showpiece.js), the starter's yard with a drift course
 * added. The pads on the office roof are the starter's own scenario.
 */
const SHIPPED = [
  { label: 'the starter', file: 'src/maps/built/starter.js', make: 'starterMap', roof: true },
  { label: 'the showpiece', file: 'src/maps/built/showpiece.js', make: 'showpieceMap', roof: false },
];

async function starterBlock() {
  for (const map of SHIPPED) {
    await mapBlock(map);
  }
  await openStartScenario();
}

async function mapBlock(map) {
  const L = map.label;
  console.log(`\n5. ${L.slice(4)}: ${map.file}`);
  const path = join(root, map.file);
  if (!existsSync(path)) {
    skip(`${L} map`, `${map.file} does not exist yet`);
    return;
  }
  let mod;
  try {
    mod = await import(pathToFileURL(path).href);
  } catch (e) {
    fail(`${L} map imports`, e.message);
    return;
  }
  const { doc, repairs } = normalize(mod[map.make]());
  check(`${L} normalizes with no repairs`, repairs.length === 0, repairs.join(' | ') || `${doc.elements.length} elements`);
  const placed = placeDocument(doc);
  check(`${L}: nothing inflated`, (placed.stats.inflated || 0) === 0, `${placed.stats.inflated || 0}`);
  const report = freestyleReport(doc).warnings;
  check(`${L}: the builder report is clean`, report.length === 0,
    report.map((w) => `${w.code}: ${w.message}`).join(' | ') || 'no warnings');
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
  check(`${L}: no two elements' solids overlap`, over.length === 0,
    over.length
      ? over.map(([k, v]) => `${k}: ${v.n} solid pairs, deepest ${v.parts} ${r3(-v.c)} m in`).join('; ')
      : `${pairs} nearby solid pairs measured`);
  if (narrow.size) {
    const near = [...narrow].sort((p, q) => p[1].c - q[1].c);
    note(`closer than the ${GAP_MIN} m gap rule, element to element (the builder warns; not failed here): ${near.map(([k, v]) => `${k} ${r3(v.c)} m (${v.parts})`).join('; ')}`);
  }

  /* Every named gap's window is clear of every solid. */
  if (placed.zones.length === 0) {
    fail(`${L} has named gaps`, 'none');
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
    check(`${L}: ${z.name} (${r3(z.w)} by ${r3(z.h)} m) is clear of every solid`, worst > 0,
      worst === Infinity ? what : `nearest ${what} at ${r3(worst)} m`);
  }

  /* And the pilot can take off where the map puts them, with the shell's
   * own ground under them. */
  if (!(await loadModule())) {
    fail(`${L} in the module`, 'dist/sim.wasm does not exist');
  } else {
    try {
      const colliders = buildColliders(placed);
      const sim = await newSim();
      const up = upload(sim, colliders);
      check(`${L}: sim_world_build returns the count`, up.built === placed.solids.length && up.count === up.built,
        `${up.built} for ${placed.solids.length} solids`);
      const height = (x, z, fromY, cgY) => groundUnder(placed.tops, x, z, fromY, cgY);
      await spawnScenario({ placed, colliders, height }, builtFrame(placed), `${L} spawn`);
    } catch (e) {
      fail(`${L} in the module`, e.message);
    }
  }
  if (map.roof) {
    await officeRoofPads(mod, ranges);
  }
}

/*
 * THE PADS ON THE ROOF. The starter with its pads moved onto the open north
 * half of the office roof, facing north, at a Base of the roof's 15 m: the
 * builder has nothing to say, and the simulator seats the craft on the
 * roof, on a mat, and the pilot can take off from it.
 */
async function officeRoofPads(mod, ranges) {
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
  if (await loadModule()) {
    try {
      const roofHeight = (x, z, fromY, cgY) => groundUnder(roofPlaced.tops, x, z, fromY, cgY);
      await spawnScenario({ placed: roofPlaced, colliders: buildColliders(roofPlaced), height: roofHeight },
        builtFrame(roofPlaced), 'the starter, pads on the office roof');
    } catch (e) {
      fail('the starter, pads on the office roof, in the module', e.message);
    }
  }
}

/*
 * THE START IN THE OPEN (openSpawn in src/maps/built/place.js). A map with
 * no start pads and a pylon over the point 8 m in from the plot's west
 * edge, which is the pilot's report of 28 September 2026: "it spawns me
 * inside a pylon i can't get out". Every leg and brace is more than the
 * builder's metre off the pylon's middle, so nothing warned, and the lift
 * off and the hover above never reach the peak, so none of them could see
 * it: a climb straight up can. It is flown twice. From the point, inside
 * the lattice, it meets the pylon, which is the trap, seen. From where the
 * map now starts the craft, it clears the peak and touches nothing, and so
 * do the lift off and the hover.
 *
 * WHAT THE FIRST ONE ASSERTS, made exact on 2026-10-04 with the owner's
 * word ("fix the tests"). It is the control for the second: the open climb
 * passes only if it touches nothing, so from the point the same climb has to
 * touch the pylon, and that is what is asserted. It also asserted that the
 * climb from the point never got over the peak in nine seconds, which held
 * on main's module (stuck under the apex at 27.6 m to the end) and stopped
 * holding when the five inch's drag changed that day: the craft bumps under
 * the apex for about two seconds, works sideways and rises out through one
 * of the peak's faces, which are open, four rods 6 cm thick from the tops of
 * the legs to the apex. Whether a craft pushing up under an open pyramid
 * finds a face in nine seconds is not something this control is for, so it
 * is printed, not asserted: how high the climb got, and when it first
 * passed the open climb's mark if it did.
 */
const OPEN_CLIMB = 34;

async function openStartScenario() {
  console.log('\n5. a start with no pads: in the open, whatever stands on the point');
  const raw = createTrack('Open start', 'full', 'freestyle');
  raw.elements.push(createElement(raw, 'pylon', { x: 8, y: raw.field.depth / 2, z: 0 }, 0));
  const { doc } = normalize(raw);
  const placed = placeDocument(doc);
  const sp = placed.spawn;
  const pylon = placed.items.find((it) => it.el.type === 'pylon');
  check('no pads and a 28 m pylon over the point: the start is moved into the open, on the paving',
    sp.from === 'open' && sp.y === 0 && pylon.x === -doc.field.width / 2 + 8 && pylon.z === 0,
    `${sp.from} at (${r3(sp.x)}, ${r3(sp.z)}), the pylon at (${r3(pylon.x)}, ${r3(pylon.z)})`);
  if (!(await loadModule())) {
    fail('the open start in the module', 'dist/sim.wasm does not exist');
    return;
  }
  try {
    const colliders = buildColliders(placed);
    const height = (x, z, fromY, cgY) => groundUnder(placed.tops, x, z, fromY, cgY);
    const world = { placed, colliders, height };
    const climb = {
      ms: 9000,
      p: [0, 0, 0],
      sticks: (ms, st, ctx) => [0, 0, 0, heightHold(ctx, st, Math.min(OPEN_CLIMB, 1.5 + 5 * (ms / 1000)))],
    };
    const inside = await fly(world, frameOf({ x: pylon.x, y: 0, z: pylon.z, yaw: sp.yaw }), climb);
    const open = await fly(world, builtFrame(placed), climb);
    const open2 = await fly(world, builtFrame(placed), climb);
    const top = (run) => Math.max(...run.rows.map((row) => row.p[2]));
    const touched = (run) => run.rows.filter((row) => row.touching).length;
    const past = (run) => run.rows.find((row) => row.p[2] > OPEN_CLIMB - 1);
    const pastNote = (run) => (past(run) ? `past ${OPEN_CLIMB - 1} m at ${r3(past(run).ms / 1000)} s` : `never past ${OPEN_CLIMB - 1} m`);
    check('from the point, inside the lattice, a climb straight up meets the pylon: the trap, seen',
      touched(inside) > 0,
      `${touched(inside)} steps in contact, up to ${r3(top(inside))} m, ${pastNote(inside)} `
      + `(the open climb ${pastNote(open)})`);
    check(`from the start, a climb straight up to ${OPEN_CLIMB} m, over the peak, touches nothing, the same to the bit twice`,
      touched(open) === 0 && top(open) > OPEN_CLIMB - 1 && open.hash === open2.hash,
      `${touched(open)} steps in contact, up to ${r3(top(open))} m`);
    await spawnScenario(world, builtFrame(placed), 'the open start');
  } catch (e) {
    fail('the open start in the module', e.stack);
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

  /*
   * The detectors of block 1d, each against the defect it was written for,
   * planted on a clean asset: a bar across a bore, a doorway shut, a jamb
   * gone, a solid outside the brick, brick with nothing solid behind it, a
   * slot and its closing, and a blade by the tower.
   */
  const hel = assetEl('hollowChimney', null, PROPS.hollowChimney.dims);
  const hh = hel.dims.height;
  const hs = solidsAtOrigin(hel);
  const hcalls = recordDraw(hel, partsOf(hel));
  const bores = boreClearance(hs, hh);
  check('self test: the default hollow chimney has a clear bore and a clear doorway',
    bores.least >= BORE_MIN && doorwayOf(hs).hits === 0 && doorwayOf(hs).width >= hel.dims.door - DOOR_EXACT,
    `bore ${r3(bores.least)} m, ${doorwayOf(hs).hits} solid points in a ${r3(doorwayOf(hs).width)} m doorway`);
  const bar = { kind: 'wall', name: 'planted', cap: [-2, 5, 0, 2, 5, 0, 0.3] };
  check('self test: a bar across the bore is seen', boreClearance([...hs, bar], hh).least < BORE_MIN,
    `${r3(boreClearance([...hs, bar], hh).least)} m`);
  const post = { kind: 'wall', name: 'planted', cap: [2.7, 0, 0, 2.7, 3, 0, 0.3] };
  check('self test: a post in the doorway is seen', doorwayOf([...hs, post]).hits > 0, `${doorwayOf([...hs, post]).hits} points`);
  const shut = hs.map((s) => (s.name === 'lintel' ? { ...s, cap: [s.cap[0], 0, s.cap[2], s.cap[3], s.cap[4], s.cap[5], s.cap[6]] } : s));
  check('self test: staves over the doorway stood in it are seen as a door with no height', doorwayOf(shut).height < 3.2 - DOOR_EXACT, `${r3(doorwayOf(shut).height)} m`);
  check('self test: a missing jamb is seen', !(doorwayOf(hs.filter((s) => s.name !== 'jamb')).width >= 0), 'no width');
  const out = { kind: 'wall', name: 'planted', cap: [3.6, 0, 0, 3.6, 20, 0, 0.3] };
  check('self test: a solid outside the drawn brick is seen', hollowFit(hh, [...hs, out], hcalls).outside > 0,
    `${hollowFit(hh, [...hs, out], hcalls).outside} points outside`);
  const bare = hs.filter((s) => !(s.name === 'stave' && s.cap[2] > 0.5));
  check('self test: brick drawn with no solid behind it is seen', hollowFit(hh, bare, hcalls).far > FIT_THICK,
    `${r3(hollowFit(hh, bare, hcalls).far)} m`);
  check('self test: a clean hollow chimney fits its brick', hollowFit(hh, hs, hcalls).outside === 0 && hollowFit(hh, hs, hcalls).far <= FIT_THICK,
    `${hollowFit(hh, hs, hcalls).outside} outside, ${r3(hollowFit(hh, hs, hcalls).far)} m far`);
  const poleA = { kind: 'pole', name: 'a', cap: [0, 0, 0, 0, 5, 0, 0.1] };
  const poleB = { kind: 'pole', name: 'b', cap: [0.6, 0, 0, 0.6, 5, 0, 0.1] };
  const poleC = { kind: 'pole', name: 'c', cap: [0.3, 0, 0, 0.3, 5, 0, 0.25] };
  check('self test: two poles 0.4 m apart are a slot', Math.abs(narrowestSlot([poleA, poleB]).least - 0.4) < 1e-9,
    `${r3(narrowestSlot([poleA, poleB]).least)} m`);
  check('self test: a third between them closes it', narrowestSlot([poleA, poleB, poleC]).least === Infinity,
    `${r3(narrowestSlot([poleA, poleB, poleC]).least)} m`);
  const tel = assetEl('turbine', null, { ...PROPS.turbine.dims, spin: 0.5 });
  const ts = solidsAtOrigin(tel);
  const tower = ts.filter((s) => s.name === 'tower');
  const beside = { kind: 'wall', name: 'blade', cap: [2.6, 5, 0, 2.6, 30, 0, 0.5] };
  check('self test: a blade hung beside the tower is seen under the gap rule', Math.min(...tower.map((t) => clearance(beside, t))) < GAP_MIN,
    `${r3(Math.min(...tower.map((t) => clearance(beside, t))))} m`);
  const tcalls = recordDraw(tel, partsOf(tel));
  const sound = coneFit(ts, partsOf(tel), tcalls);
  check('self test: a clean turbine fits what is drawn', sound.outside === 0 && sound.far <= FIT_THICK,
    `${sound.outside} outside, ${r3(sound.far)} m far`);
  const fat = coneFit(ts.filter((s) => s.name !== 'blade'), partsOf(tel), tcalls);
  check('self test: blades drawn with no solid in them are seen', fat.far > FIT_THICK, `${r3(fat.far)} m`);
  const stray = coneFit([...ts, { kind: 'wall', name: 'blade', cap: [9, 20, 9, 9, 40, 9, 0.5] }], partsOf(tel), tcalls);
  check('self test: a solid where nothing is drawn is seen', stray.outside > 0, `${stray.outside} points`);
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
   * The two control flights of the chimney and the turbine, with the module
   * handed no world: the wall opposite the doorway, the tower and a blade
   * stop nothing, so the lines that say they do must fail.
   */
  captured = [];
  try {
    await chimneyFlights(w, f, ranges);
    await turbineFlights(w, f, ranges);
  } finally {
    const got = captured;
    captured = null;
    for (const [what, start] of [['the wall opposite the doorway', '(h3) back wall: the wall opposite the door stops it'],
      ['the tower', '(t1) tower: it is stopped by the tower'], ['a blade', '(t2) blade: it is stopped by the blade']]) {
      const line = got.find((c) => c.name.startsWith(start));
      check(`self test: with no world in the module, ${what} stops nothing`, Boolean(line) && !line.ok, line ? line.detail : 'the line never ran');
    }
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
    const height = (x, z, fromY, cgY) => groundUnder(rp.tops, x, z, fromY, cgY);
    await spawnScenario({ placed: rp, colliders: buildColliders(rp), height }, frameOf(rp.spawn, 0), 'planted');
  } finally {
    const got = captured;
    captured = null;
    const lift = got.find((c) => c.name.startsWith('planted: lifting off the pads touches nothing'));
    check('self test: raised pads seated at 0, inside the office, touch it lifting off', Boolean(lift) && !lift.ok,
      lift ? lift.detail : 'the line never ran');
  }

  /*
   * Under a thin box, with the height asked as it was before the shell
   * passed the CG: the places must be seen, and the climb into a scaffold
   * board must be seen to go up through it.
   */
  const blind = (tops, x, z, fromY) => groundUnder(tops, x, z, fromY);
  captured = [];
  try {
    const spots = thinBoxScan(blind);
    await thinBoxClimb(spots.find((c) => c.type === 'scaffold'), blind);
  } finally {
    const got = captured;
    captured = null;
    const scan = got.find((c) => c.name.startsWith('(d) under a thin box, five inch'));
    const climb = got.find((c) => c.name.startsWith('(d) under a thin box: a climb into the scaffold'));
    check('self test: a height that leaves out the CG hands a thin box over the craft as its ground', Boolean(scan) && !scan.ok,
      scan ? scan.detail.slice(0, 200) : 'the line never ran');
    check('self test: and a climb under a scaffold board goes up through it', Boolean(climb) && !climb.ok,
      climb ? climb.detail : 'the line never ran');
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
/* The STF mark                                                        */
/* ------------------------------------------------------------------ */

/*
 * WHERE THE STF MARK GOES ON A BUILT MAP (src/maps/built/egg.js). The sim
 * chooses the spot from the map's own assets and nothing a player reads says
 * where, so this is the only place anybody can see that the spot keeps its
 * rules. Since 2026-09-25 the mark is painted to be SEEN from the pads,
 * where Stage B hid it from them: the owner, "the logo of SubTwoFIfty is too
 * hard to find, make it easy to see on any map" (FREESTYLE-MAPS-PLAN.md
 * section 12, decision 10). Each rule is restated here in this file's own
 * geometry, the distances the starter block already trusts, so a mistake in
 * egg.js's arithmetic shows as a spot that breaks one:
 *
 *   1  paint on a wall: the mark is on an upright face of a solid box its
 *      element draws, not glass, 6 by 3 m or down to 0.3 of that, two to
 *      one, and inside the face; a wall's mark is the biggest that fits 10
 *      cm in from its edges and 10 cm over rule 2's 0.3 m
 *   2  open air: the mark pushed out 3 m along its normal is clear of every
 *      solid, over 0.3 m and inside the plot
 *   3  never in a solid: the point 2 cm off the mark's middle is in none
 *   4  seen from the pads: no line from 0.3, 2 and 5 m over the seat to the
 *      mark's middle, corners and edge middles, 5 cm in and ending 2 cm off
 *      the face, passes through a solid a pilot cannot see through: a box
 *      that is not glass, a net, a railing, a balustrade of bars or a
 *      skylight, not foliage, or a capsule 0.3 m thick or more
 *   5  turned to the pads and in reach: the wall's normal, at the middle of
 *      the band a mark can take on it, within 60 degrees of the eye 2 m over
 *      the seat, and the mark's middle 15 to 60 m from the spawn across the
 *      ground
 *   6  the pick: no wall that scores higher (the width of the mark it takes,
 *      times how square it stands to the pads, over its distance, times 2
 *      plus the cosine of the turn from the pads' heading, all at the
 *      wall's middle) keeps rules 1 to 5 at its middle; the score the spot
 *      reports is the one this file computes; the walls come best first;
 *      the same spot on a second run, after normalize(normalize(doc)), and
 *      under another id
 *   7  always a spot: 'ground' only when no wall keeps rules 1 to 5 at its
 *      middle; flat on the paving, 12 by 6 m or the most the plot has room
 *      for, square to the plot and reading away from the pads, at the first
 *      of its places whose air is clear, or the first; each on a map built
 *      to reach it
 *   8  pure and quick: nothing imported but src/props/trig.js, no DOM, no
 *      clock, no Math.random, and the time on the starter and on a map of
 *      ten thousand solids
 *   9  no JS trigonometry or powers anywhere in the file
 *
 * Rule 6 is checked at each wall's middle only. egg.js tries a wall at up to
 * 49 places, and a wall whose middle is blocked can still take the mark to
 * one side; restating that walk would be restating egg.js. What this sees is
 * the failure that matters: a better wall, clear at its middle, passed over.
 */

/* The brief's numbers, restated rather than read from egg.js, so a change
 * there is a failure here. */
const EGG = {
  W: 6,
  H: 3,
  MIN: 0.3,
  EDGE: 0.1,
  AIR: 3,
  GROUND: 0.3,
  EYES: [0.3, 2, 5],
  OFF: 0.02,
  INSET: 0.05,
  FACE_COS: 0.5,
  NEAR_MIN: 15,
  NEAR_MAX: 60,
  TURN: 2,
  OPAQUE_R: 0.3,
  SEE_THROUGH: new Set(['glass', 'net', 'railing', 'balustrade', 'skylight']),
  GROUND_SCALE: 2,
  GROUND_AHEAD: [12, 8, 18],
  GROUND_INSET: 1,
  STARTER_MS: 30,
  STRESS_MS: 200,
  STRESS_SOLIDS: 10000,
  RANDOM_MAPS: 50,
  /* The partners' marks (rules 8 to 10 there): the widest sign, the least
   * share of it, the gap between any two marks' middles, the artwork's
   * share of a sign's height (src/art/partnermark.js), and the ground
   * step's places as [along, across] the pads' heading. */
  PARTNER: {
    W: 6, MIN: 0.5, SEP: 10, SHARE: 0.7, AROUND: [[0, 14], [0, -14], [-14, 0], [22, 12], [22, -12]],
  },
};

/* A partner's sign as egg.js sizes it: its aspect, and the full size. */
function partnerSign(aspect) {
  const a = EGG.PARTNER.SHARE * aspect + (1 - EGG.PARTNER.SHARE);
  let w = EGG.PARTNER.W;
  let h = w / a;
  if (h > EGG.H) {
    h = EGG.H;
    w = h * a;
  }
  return { a, w, h };
}

function cross3(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/* The axis a unit axis vector lies along, or -1 for anything else. */
function unitAxis(v) {
  if (!Array.isArray(v) || v.length !== 3 || !v.every(Number.isFinite)) {
    return -1;
  }
  const on = [0, 1, 2].filter((k) => v[k] !== 0);
  return on.length === 1 && Math.abs(v[on[0]]) === 1 ? on[0] : -1;
}

/* A point on the mark: its middle, u along right, v along up, off along n. */
function markPoint(spot, right, u, v, off) {
  return [0, 1, 2].map((k) => spot.p[k] + right[k] * u + spot.up[k] * v + spot.n[k] * off);
}

/* The mark pushed `depth` out along its normal, as [x0, y0, z0, x1, y1, z1]. */
function markPrism(spot, right, depth) {
  const box = [0, 0, 0, 0, 0, 0];
  for (let k = 0; k < 3; k += 1) {
    if (spot.n[k] !== 0) {
      const out = spot.p[k] + spot.n[k] * depth;
      box[k] = Math.min(spot.p[k], out);
      box[k + 3] = Math.max(spot.p[k], out);
    } else {
      const half = Math.abs(right[k]) * spot.w / 2 + Math.abs(spot.up[k]) * spot.h / 2;
      box[k] = spot.p[k] - half;
      box[k + 3] = spot.p[k] + half;
    }
  }
  return box;
}

/* What a pilot cannot see through, the brief's list. */
function eggOpaque(s) {
  if (s.kind === 'canopy') {
    return false;
  }
  return s.box ? !EGG.SEE_THROUGH.has(s.name) : s.cap[6] >= EGG.OPAQUE_R;
}

/* The first solid in a box, or null. Touching is not in. */
function solidInBox(solids, box) {
  for (const s of solids) {
    if (!aabbNear(aabbOf(s), box, 0)) {
      continue;
    }
    if (s.box) {
      const b = s.box;
      if ([0, 1, 2].every((k) => Math.min(b[k + 3], box[k + 3]) - Math.max(b[k], box[k]) > 1e-9)) {
        return s;
      }
    } else {
      const [c0, c1, r] = capEnds(s);
      if (segBoxDist(c0, c1, box) < r - 1e-9) {
        return s;
      }
    }
  }
  return null;
}

/* Does the segment a to b pass through the box, a millimetre in from its
 * faces? The slab method, written out here: the stretch of the segment
 * between each pair of planes, intersected, and something left. */
function segThroughBox(a, b, box) {
  let t0 = 0;
  let t1 = 1;
  for (let k = 0; k < 3; k += 1) {
    const lo = box[k] + 0.001;
    const hi = box[k + 3] - 0.001;
    const d = b[k] - a[k];
    if (d === 0) {
      if (!(a[k] > lo && a[k] < hi)) {
        return false;
      }
      continue;
    }
    const u0 = Math.min((lo - a[k]) / d, (hi - a[k]) / d);
    const u1 = Math.max((lo - a[k]) / d, (hi - a[k]) / d);
    t0 = Math.max(t0, u0);
    t1 = Math.min(t1, u1);
    if (!(t0 < t1)) {
      return false;
    }
  }
  return true;
}

/* The first solid a pilot cannot see through that the line a to b passes
 * through, or null: a box it goes into, a capsule it passes inside. */
function sightBlocker(solids, a, b) {
  const box = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2]),
    Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])];
  for (const s of solids) {
    if (!eggOpaque(s) || !aabbNear(aabbOf(s), box, 0)) {
      continue;
    }
    if (s.box) {
      if (segThroughBox(a, b, s.box)) {
        return s;
      }
    } else {
      const [c0, c1, r] = capEnds(s);
      if (segSegDist(a, b, c0, c1) < r - 0.001) {
        return s;
      }
    }
  }
  return null;
}

function nameOf(s) {
  return s ? `${s.kind} ${s.name}` : 'nothing';
}

/* The pads: the eyes over the seat, and the heading across the ground the
 * shell faces a craft at the spawn's yaw, (-sin yaw, 0, -cos yaw). */
function eggPads(placed) {
  const sp = placed.spawn;
  const sc = sincos(sp.yaw);
  return {
    x: sp.x,
    z: sp.z,
    eyes: EGG.EYES.map((h) => [sp.x, sp.y + h, sp.z]),
    eye: [sp.x, sp.y + EGG.EYES[1], sp.z],
    fx: -sc.s,
    fz: -sc.c,
  };
}

/* The band a wall's mark can take, EDGE in from every edge and EDGE over
 * GROUND at the lowest, as { floor, band }, and its middle place. */
function eggBand(box) {
  const floor = Math.max(box[1] + EGG.EDGE, EGG.GROUND + EGG.EDGE);
  return { floor, band: box[4] - EGG.EDGE - floor };
}
function bandMid(box, a, plane) {
  const { floor, band } = eggBand(box);
  const ra = 2 - a;
  const mid = [0, 0, 0];
  mid[a] = plane;
  mid[ra] = (box[ra] + box[ra + 3]) / 2;
  mid[1] = floor + band / 2;
  return mid;
}

/* Every upright face of every drawn, solid, opaque box on the map, with its
 * element, its part and the mark it would take. */
function eggWalls(placed) {
  const out = [];
  for (const it of placed.items) {
    const own = placeSolids(it.parts, it.x, it.y, it.z, it.yaw, it.turns, []);
    const parts = it.parts.filter((p) => p.solid);
    own.forEach((s, k) => {
      const part = parts[k];
      if (!s.box || !part || part.t !== 'box' || !part.draw || !eggOpaque(s)) {
        return;
      }
      const b = s.box;
      for (const [a, sg] of [[0, -1], [0, 1], [2, -1], [2, 1]]) {
        const ra = 2 - a;
        const scale = Math.min(1, (b[ra + 3] - b[ra] - 2 * EGG.EDGE) / EGG.W, eggBand(b).band / EGG.H);
        if (!(scale >= EGG.MIN)) {
          continue;
        }
        const n = [0, 0, 0];
        n[a] = sg;
        const mid = bandMid(b, a, sg > 0 ? b[a + 3] : b[a]);
        out.push({ el: it.el, part, box: b, n, mid, w: EGG.W * scale, h: EGG.H * scale });
      }
    });
  }
  return out;
}

/* Rule 6's score at a wall's middle, or null when rule 5 turns it away. */
function wallScore(pads, n, mid, w) {
  const d = sub(pads.eye, mid);
  const dist = Math.sqrt(dot(d, d));
  const toward = dot(n, d);
  if (!(dist > 0) || !(toward >= EGG.FACE_COS * dist)) {
    return null;
  }
  const gx = mid[0] - pads.x;
  const gz = mid[2] - pads.z;
  const g = Math.sqrt(gx * gx + gz * gz);
  const cos = g > 0 ? (pads.fx * gx + pads.fz * gz) / g : -1;
  return ((w * toward) / (dist * dist)) * (EGG.TURN + cos);
}

/* How far a point is from the spawn across the ground. */
function eggReach(pads, p) {
  return Math.sqrt((p[0] - pads.x) * (p[0] - pads.x) + (p[2] - pads.z) * (p[2] - pads.z));
}

/* The ground step's mark and its places, as rule 7 puts them. */
function groundPlan(placed, pads) {
  const W = placed.W;
  const D = placed.D;
  const alongX = Math.abs(pads.fx) >= Math.abs(pads.fz);
  const up = alongX ? [pads.fx < 0 ? -1 : 1, 0, 0] : [0, 0, pads.fz < 0 ? -1 : 1];
  const spanX = (alongX ? EGG.H : EGG.W) * EGG.GROUND_SCALE;
  const spanZ = (alongX ? EGG.W : EGG.H) * EGG.GROUND_SCALE;
  let s = Math.min(1, (W - 2 * EGG.GROUND_INSET) / spanX, (D - 2 * EGG.GROUND_INSET) / spanZ);
  if (!(s >= EGG.MIN / EGG.GROUND_SCALE)) {
    s = EGG.MIN / EGG.GROUND_SCALE;
  }
  const w = EGG.W * EGG.GROUND_SCALE * s;
  const h = EGG.H * EGG.GROUND_SCALE * s;
  const hx = (alongX ? h : w) / 2;
  const hz = (alongX ? w : h) / 2;
  const inside = (v, half, size) => {
    const lim = size / 2 - EGG.GROUND_INSET - half;
    return lim > 0 ? clamp(v, -lim, lim) : 0;
  };
  const places = [...EGG.GROUND_AHEAD.map((d) => [pads.x + pads.fx * d, pads.z + pads.fz * d]), [0, 0]].map(([tx, tz]) => {
    const x = inside(tx, hx, W);
    const z = inside(tz, hz, D);
    return { x, z, clear: solidInBox(placed.solids, [x - hx, 0, z - hz, x + hx, EGG.AIR, z + hz]) === null };
  });
  return { up, w, h, places };
}

/*
 * Rules 1 to 5 (or the ground step's own) for one spot, as a list of
 * { rule, ok, detail }. Pure: the self test hands it planted spots, and
 * rule 6 hands it each better wall's middle. `quick` stops at the first
 * broken rule and asks rule 5 first, the cheap one, for the walk over every
 * wall that scores higher.
 */
function eggRules(placed, spot, quick = false, opts = {}) {
  const out = [];
  const say = (rule, ok, detail) => {
    out.push({ rule, ok: Boolean(ok), detail });
    return Boolean(ok);
  };
  const pads = eggPads(placed);
  const a = unitAxis(spot.n);
  const ua = unitAxis(spot.up);
  if (a < 0 || ua < 0 || a === ua || !(spot.w > 0 && spot.h > 0) || !spot.p.every(Number.isFinite)) {
    say('frame', false, `n ${spot.n}, up ${spot.up}, ${spot.w} by ${spot.h} m at ${spot.p}`);
    return out;
  }
  const right = cross3(spot.up, spot.n);
  const W = placed.W;
  const D = placed.D;
  const inPlot = (b) => b[0] >= -W / 2 - 1e-9 && b[3] <= W / 2 + 1e-9 && b[2] >= -D / 2 - 1e-9 && b[5] <= D / 2 + 1e-9;
  say('frame', !spot.right || spot.right.every((v, k) => sameValue(v, right[k])),
    `n ${spot.n.join(' ')}, up ${spot.up.join(' ')}, right ${right.map((v) => v + 0).join(' ')}`);

  if (spot.step === 'ground' && opts.sign) {
    /* A partner's ground step: flat, its sign's shape, inside the plot. */
    const sign = opts.sign;
    const flat = spot.n[0] === 0 && spot.n[1] === 1 && spot.n[2] === 0 && spot.p[1] === 0;
    const shape = Math.abs(spot.w / spot.h - sign.a) < 1e-9 * sign.a
      && spot.w <= sign.w * EGG.GROUND_SCALE + 1e-9 && spot.w >= sign.w * EGG.PARTNER.MIN - 1e-9;
    const hx = Math.abs(right[0]) * spot.w / 2 + Math.abs(spot.up[0]) * spot.h / 2;
    const hz = Math.abs(right[2]) * spot.w / 2 + Math.abs(spot.up[2]) * spot.h / 2;
    const inside = inPlot([spot.p[0] - hx, 0, spot.p[2] - hz, spot.p[0] + hx, 0, spot.p[2] + hz]);
    say('ground: flat on the paving, the sign\'s own shape, inside the plot', flat && shape && inside,
      `${r3(spot.w)} by ${r3(spot.h)} m (aspect ${r3(sign.a)}), ${inside ? 'inside' : 'outside'} the plot, ${r3(eggReach(pads, spot.p))} m from the pads`);
    return out;
  }
  if (spot.step === 'ground') {
    const plan = groundPlan(placed, pads);
    const flat = spot.n[0] === 0 && spot.n[1] === 1 && spot.n[2] === 0 && spot.p[1] === 0
      && spot.up.every((v, k) => sameValue(v, plan.up[k]));
    const size = Math.abs(spot.w - plan.w) < 1e-9 && Math.abs(spot.h - plan.h) < 1e-9;
    say('ground: flat on the paving, square to the plot, reading away from the pads, the size the plot has room for', flat && size,
      `up ${spot.up.join(' ')} (the pads' axis ${plan.up.join(' ')}), ${r3(spot.w)} by ${r3(spot.h)} m (${r3(plan.w)} by ${r3(plan.h)})`);
    const at = plan.places.findIndex((c) => Math.abs(c.x - spot.p[0]) < 1e-9 && Math.abs(c.z - spot.p[2]) < 1e-9);
    const firstClear = plan.places.findIndex((c) => c.clear);
    const want = firstClear >= 0 ? firstClear : 0;
    say('ground: the first of its places whose air is clear, or the first', at === want && spot.clear === (firstClear >= 0),
      `at place ${at + 1} of ${plan.places.length} (${plan.places.map((c) => (c.clear ? 'clear' : 'not clear')).join(', ')}), `
      + `${r3(eggReach(pads, spot.p))} m from the pads`);
    return out;
  }

  /* 5, first when quick: turned to the pads at the wall's middle, and the
   * mark in reach. */
  const it = placed.items.find((x) => x.el && x.el.id === spot.elementId);
  let host = null;
  if (it && a !== 1 && ua === 1 && spot.up[1] === 1) {
    const own = placeSolids(it.parts, it.x, it.y, it.z, it.yaw, it.turns, []);
    const parts = it.parts.filter((p) => p.solid);
    for (let k = 0; k < own.length && !host; k += 1) {
      const b = own[k].box;
      if (!b || !parts[k] || parts[k].t !== 'box' || !parts[k].draw || !eggOpaque(own[k])) {
        continue;
      }
      if (Math.abs(spot.p[a] - (spot.n[a] > 0 ? b[a + 3] : b[a])) > 1e-9) {
        continue;
      }
      let within = true;
      for (let m = 0; m < 3; m += 1) {
        if (m === a) {
          continue;
        }
        const half = Math.abs(right[m]) * spot.w / 2 + Math.abs(spot.up[m]) * spot.h / 2;
        if (spot.p[m] - half < b[m] - 1e-9 || spot.p[m] + half > b[m + 3] + 1e-9) {
          within = false;
        }
      }
      if (within) {
        host = { box: b, part: parts[k], solid: own[k] };
      }
    }
  }
  const reach = eggReach(pads, spot.p);
  let turned = null;
  if (host) {
    const d = sub(pads.eye, bandMid(host.box, a, spot.p[a]));
    turned = dot(spot.n, d) / Math.sqrt(dot(d, d));
  }
  if (opts.loose) {
    /* A partner's 'wall' step keeps only the near half of rule 5. */
    say(5, spot.kind === 'wall' && reach >= EGG.NEAR_MIN, `${spot.kind}, ${r3(reach)} m from the pads (at least ${EGG.NEAR_MIN}); turned and far are not asked`);
  } else if (!say(5, spot.kind === 'wall' && (turned === null || turned >= EGG.FACE_COS) && reach >= EGG.NEAR_MIN && reach <= EGG.NEAR_MAX,
    `${spot.kind}, turned ${turned === null ? 'unknown' : r3(turned)} of the way to the pads (at least ${EGG.FACE_COS}), `
    + `${r3(reach)} m from them (${EGG.NEAR_MIN} to ${EGG.NEAR_MAX})`) && quick) {
    return out;
  }

  /* 1. On an upright face of a drawn, solid, opaque box of its element,
   * inside it. */
  const sizeOk = opts.sign
    ? Math.abs(spot.w / spot.h - opts.sign.a) < 1e-9 * opts.sign.a && spot.w <= opts.sign.w + 1e-9 && spot.w >= opts.sign.w * EGG.PARTNER.MIN - 1e-9
    : Math.abs(spot.w - 2 * spot.h) < 1e-9 && spot.w <= EGG.W + 1e-9 && spot.w >= EGG.W * EGG.MIN - 1e-9;
  if (!say(1, sizeOk && host, `${r3(spot.w)} by ${r3(spot.h)} m, ${host ? `inside the face of ${it.el.id} ${it.el.type} ${host.part.name}` : `on no drawn upright box face of ${spot.elementId}`}`) && quick) {
    return out;
  }

  /* 2. Open air in front. */
  const prism = markPrism(spot, right, EGG.AIR);
  const intruder = solidInBox(placed.solids, prism);
  if (!say(2, inPlot(prism) && prism[1] > EGG.GROUND && !intruder,
    `${EGG.AIR} m out: ${intruder ? `${nameOf(intruder)} in it` : 'clear'}, lowest ${r3(prism[1])} m, ${inPlot(prism) ? 'inside' : 'outside'} the plot`) && quick) {
    return out;
  }

  /* 3. The point 2 cm off the middle is in no solid. */
  const q = markPoint(spot, right, 0, 0, EGG.OFF);
  let holder = null;
  for (const s of placed.solids) {
    if (s.box) {
      const b = s.box;
      if ([0, 1, 2].every((k) => q[k] > b[k] + 1e-9 && q[k] < b[k + 3] - 1e-9)) {
        holder = s;
        break;
      }
    } else {
      const [c0, c1, r] = capEnds(s);
      if (segSegDist(q, q, c0, c1) < r) {
        holder = s;
        break;
      }
    }
  }
  if (!say(3, !holder, holder ? `the point is in ${nameOf(holder)}` : `(${r3(q[0])}, ${r3(q[1])}, ${r3(q[2])}) is in no solid`) && quick) {
    return out;
  }

  /* 4. No line from any eye passes through a solid a pilot cannot see
   * through. Not asked of a partner's 'wall' step, which is the step for
   * when no wall keeps it. */
  if (opts.loose) {
    return out;
  }
  const hu = spot.w / 2 - EGG.INSET;
  const hv = spot.h / 2 - EGG.INSET;
  const pts = [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]]
    .map(([su, sv]) => markPoint(spot, right, su * hu, sv * hv, EGG.OFF));
  let lines = 0;
  let hidden = null;
  for (const e of pads.eyes) {
    for (const t of pts) {
      lines += 1;
      const s = sightBlocker(placed.solids, e, t);
      if (s) {
        hidden = `from ${r3(e[1] - placed.spawn.y)} m to (${r3(t[0])}, ${r3(t[1])}, ${r3(t[2])}) through ${nameOf(s)}`;
        break;
      }
    }
    if (hidden) {
      break;
    }
  }
  say(4, !hidden, hidden ? `hidden ${hidden}` : `${lines} lines from ${EGG.EYES.join(', ')} m, none through a solid a pilot cannot see through`);
  return out;
}

/* Two spots compared field by field, numbers by their bits. */
function spotDifference(a, b) {
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  for (const k of keys) {
    const x = a[k];
    const y = b[k];
    if (Array.isArray(x) || Array.isArray(y)) {
      if (!Array.isArray(x) || !Array.isArray(y) || x.length !== y.length || x.some((v, i) => !sameBits(v, y[i]))) {
        return `${k}: ${x} against ${y}`;
      }
    } else if (typeof x === 'number' && typeof y === 'number') {
      if (!sameBits(x, y)) {
        return `${k}: ${x} against ${y}`;
      }
    } else if (x !== y) {
      return `${k}: ${x} against ${y}`;
    }
  }
  return null;
}

/*
 * Rule 6 and the first half of rule 7: the best wall, restated. Every wall
 * that scores higher than the spot's own (a ground spot's own is nothing)
 * is tried at its middle, and the first that keeps rules 1 to 5 there is
 * returned, or null. Also the spot's own score, from this file's
 * arithmetic.
 */
function betterWall(placed, spot) {
  const pads = eggPads(placed);
  let mine = -Infinity;
  if (spot.step === 'seen') {
    const it = placed.items.find((x) => x.el && x.el.id === spot.elementId);
    const own = eggWalls({ ...placed, items: it ? [it] : [] });
    const a = unitAxis(spot.n);
    const wall = own.find((w) => w.n.every((v, k) => v === spot.n[k]) && Math.abs(w.mid[a] - spot.p[a]) < 1e-9
      && [0, 1, 2].every((k) => k === a || (spot.p[k] >= w.box[k] - 1e-9 && spot.p[k] <= w.box[k + 3] + 1e-9)));
    mine = wall ? wallScore(pads, wall.n, wall.mid, wall.w) : NaN;
  }
  let better = null;
  let tried = 0;
  for (const wall of eggWalls(placed)) {
    const score = wallScore(pads, wall.n, wall.mid, wall.w);
    if (score === null || !(score > mine * (1 + 1e-9))) {
      continue;
    }
    const reach = eggReach(pads, wall.mid);
    if (reach < EGG.NEAR_MIN || reach > EGG.NEAR_MAX) {
      continue;
    }
    tried += 1;
    const at = { step: 'seen', kind: 'wall', p: [...wall.mid], n: wall.n, up: [0, 1, 0], w: wall.w, h: wall.h, elementId: wall.el.id };
    if (eggRules(placed, at, true).every((r) => r.ok)) {
      better = { wall, score };
      break;
    }
  }
  return { mine, better, tried };
}

/* A seeded random freestyle map: a plot, maybe pads, and three to thirty
 * of anything the builder offers at any place and heading. Overlaps and
 * all, because an author's map has them. */
const EGG_TYPES = (() => {
  const list = [];
  for (const [type, def] of Object.entries(PROPS)) {
    if (!def.zone) {
      for (const style of def.styles ?? [null]) {
        list.push([type, style]);
      }
    }
  }
  for (const type of Object.keys(FURNITURE)) {
    if (type !== 'startPads') {
      list.push([type, null]);
    }
  }
  return list;
})();

function eggElement(doc, type, x, y, yaw, style = null, dims = null) {
  const el = createElement(doc, type, { x, y, z: 0 }, yaw);
  if (style) {
    el.style = style;
    Object.assign(el.dims, styleDims(type, style) ?? {});
  }
  if (dims) {
    Object.assign(el.dims, dims);
  }
  doc.elements.push(el);
  return el;
}

function randomEggMap(k) {
  const R = seededRandom(0x5eed0000 + k);
  const doc = createTrack(`Random ${k}`, 'full', 'freestyle');
  doc.id = `trk-egg-random-${k}`;
  doc.field.width = Math.round(R.range(60, 240));
  doc.field.depth = Math.round(R.range(60, 240));
  const n = R.int(3, 30);
  if (R.chance(0.85)) {
    eggElement(doc, 'startPads', R.range(5, doc.field.width - 5), R.range(5, doc.field.depth - 5), R.range(-Math.PI, Math.PI));
  }
  for (let i = 0; i < n; i += 1) {
    const [type, style] = R.pick(EGG_TYPES);
    eggElement(doc, type, R.range(10, doc.field.width - 10), R.range(10, doc.field.depth - 10), R.range(-Math.PI, Math.PI), style);
  }
  return doc;
}

/* A 40 ft container 25 m ahead of pads that face north, the side that looks
 * at them in full view: a wall mark, in the first frame. `ahead` moves it. */
function containerEggMap(id, ahead = 25) {
  const doc = createTrack('Egg container', 'full', 'freestyle');
  doc.id = id;
  doc.field.width = 60;
  doc.field.depth = 40 + ahead;
  eggElement(doc, 'startPads', 30, 10, Math.PI / 2);
  eggElement(doc, 'containers', 30, 10 + ahead, 0, '40ft', { stack: 1 });
  return doc;
}

/* The maps built to reach each step. */
function eggStepMaps() {
  const maps = [];
  maps.push({ label: 'a container ahead of the pads', doc: containerEggMap('trk-egg-view'), step: 'seen', frame: true });
  /* An empty plot with only its pads: no solid at all. */
  const pads = createTrack('Egg pads', 'full', 'freestyle');
  pads.id = 'trk-egg-pads';
  pads.field.width = 60;
  pads.field.depth = 40;
  eggElement(pads, 'startPads', 10, 10, Math.PI / 4);
  maps.push({ label: 'an empty plot with only its pads', doc: pads, step: 'ground', first: true });
  /* A map of trees: solids, and not one wall. */
  const trees = createTrack('Egg trees', 'full', 'freestyle');
  trees.id = 'trk-egg-trees';
  trees.field.width = 80;
  trees.field.depth = 80;
  eggElement(trees, 'startPads', 10, 10, Math.PI / 4);
  for (let i = 0; i < 12; i += 1) {
    eggElement(trees, 'tree', 20 + (i % 4) * 14, 20 + Math.floor(i / 4) * 16, 0, PROPS.tree.styles[i % PROPS.tree.styles.length]);
  }
  maps.push({ label: 'a map of trees, the first place ahead under one', doc: trees, step: 'ground', notFirst: true });
  /* A container out of reach: the only wall that faces the pads is 75 m off. */
  maps.push({ label: 'a container out of reach', doc: containerEggMap('trk-egg-far', 75), step: 'ground' });
  return maps;
}

/* Enough of everything, in rows, to pass ten thousand solids. */
function stressEggMap() {
  const doc = createTrack('Egg stress', 'full', 'freestyle');
  doc.id = 'trk-egg-stress';
  const CW = 50;
  const N = 16;
  doc.field.width = CW * N;
  doc.field.depth = CW * N;
  eggElement(doc, 'startPads', 10, 10, Math.PI / 4);
  const types = EGG_TYPES.filter(([type]) => PROPS[type]);
  let solids = 0;
  for (let i = 0; solids < EGG.STRESS_SOLIDS && i < N * N; i += 1) {
    const [type, style] = types[i % types.length];
    const el = eggElement(doc, type, CW / 2 + (i % N) * CW, CW / 2 + Math.floor(i / N) * CW + CW / 2,
      [0, Math.PI / 2, Math.PI, -Math.PI / 2][i % 4], style);
    solids += placeSolids(partsOf(el), 0, 0, 0, 0, 'quarter', []).length;
  }
  return doc;
}

/* The source with its comments taken out, and what it reaches for. The one
 * import allowed is src/props/trig.js, the project's own sine, which gives
 * the same bits in every engine: the pads' heading is an angle. */
function eggSourceProblems(src) {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const problems = [];
  const imports = [...code.matchAll(/^\s*(?:import|export)\s[^;]*?from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]);
  const dynamic = [...code.matchAll(/\bimport\s*\(/g)].length;
  if (imports.some((p) => p !== '../../props/trig.js') || dynamic) {
    problems.push(`imports ${imports.join(', ') || 'nothing'}${dynamic ? ' and a dynamic import' : ''}`);
  }
  const ALLOWED = new Set(['abs', 'ceil', 'floor', 'max', 'min', 'round', 'sign', 'sqrt', 'trunc', 'imul', 'fround', 'PI']);
  const math = [...new Set([...code.matchAll(/\bMath\s*\.\s*([A-Za-z0-9_]+)/g)].map((m) => m[1]))];
  const bad = math.filter((f) => !ALLOWED.has(f));
  if (bad.length) {
    problems.push(`Math.${bad.join(', Math.')}`);
  }
  for (const word of ['Date', 'performance', 'document', 'window', 'navigator', 'localStorage', 'THREE', 'requestAnimationFrame', 'crypto']) {
    if (new RegExp(`\\b${word}\\b`).test(code)) {
      problems.push(word);
    }
  }
  return problems;
}

function median(list) {
  const s = [...list].sort((p, q) => p - q);
  return s[Math.floor(s.length / 2)];
}

/*
 * THE FIRST CALL IN A FRESH ENGINE, which is what a map pays in the
 * browser: the spot is chosen once, as the map is built, with nothing
 * compiled yet. A child Node reads the document on its standard input,
 * places it, and times one stfSearch. The best of two children is what is
 * held to the budget, because this container shares its cores and one
 * start in a few loses them to a neighbour.
 */
function coldEggMs(doc, source) {
  const url = (p) => JSON.stringify(pathToFileURL(join(root, p)).href);
  const code = [
    `import { normalize } from ${url('src/trackbuilder/model.js')};`,
    `import { placeDocument } from ${url('src/maps/built/place.js')};`,
    `import { stfSearch } from ${url('src/maps/built/egg.js')};`,
    "let raw = '';",
    'for await (const chunk of process.stdin) { raw += chunk; }',
    'const doc = normalize(JSON.parse(raw)).doc;',
    'const placed = placeDocument(doc);',
    'const t0 = performance.now();',
    `stfSearch(placed, doc, ${JSON.stringify(source)});`,
    'process.stdout.write(String(performance.now() - t0));',
  ].join('\n');
  let best = Infinity;
  for (let i = 0; i < 2; i += 1) {
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', code], { input: JSON.stringify(doc), encoding: 'utf8' });
    best = Math.min(best, Number(out));
  }
  return best;
}

async function eggBlock() {
  console.log('\n7. egg: where the STF mark goes on a built map (src/maps/built/egg.js)');
  const path = join(root, 'src/maps/built/egg.js');
  if (!existsSync(path)) {
    fail('src/maps/built/egg.js', 'does not exist');
    return;
  }
  let egg;
  let starter;
  try {
    egg = await import(pathToFileURL(path).href);
    starter = await import(pathToFileURL(join(root, 'src/maps/built/starter.js')).href);
  } catch (e) {
    fail('src/maps/built/egg.js imports in Node', e.message);
    return;
  }
  const { stfSearch, chooseStfSpot, stfKey } = egg;

  /* 8. Quick: the first call in a fresh engine, held to the budget, and
   * the warm median beside it. */
  const sDoc = normalize(starter.starterMap()).doc;
  const sPlaced = placeDocument(sDoc);
  const hashBefore = placementHash(sPlaced);
  const sRun = stfSearch(sPlaced, sDoc, 'starter');
  const stDoc = normalize(stressEggMap()).doc;
  const stPlaced = placeDocument(stDoc);
  const stRun = stfSearch(stPlaced, stDoc, 'canvas');
  const warm = (placed, doc, source) => {
    const times = [];
    for (let i = 0; i < 7; i += 1) {
      const t0 = performance.now();
      stfSearch(placed, doc, source);
      times.push(performance.now() - t0);
    }
    return median(times);
  };
  let sCold = NaN;
  let stCold = NaN;
  try {
    sCold = coldEggMs(sDoc, 'starter');
    stCold = coldEggMs(stDoc, 'canvas');
  } catch (e) {
    fail('the spot timed in a fresh engine', e.message);
  }
  check(`quick: the starter in under ${EGG.STARTER_MS} ms`, sCold < EGG.STARTER_MS,
    `first call in a fresh engine ${r3(sCold)} ms (best of 2), warm median of 7 ${r3(warm(sPlaced, sDoc, 'starter'))} ms; `
    + `${sPlaced.solids.length} solids, ${sRun.stats.faces} walls, ${sRun.stats.tried} places tried, ${sRun.stats.lines} sight lines`);
  check(`quick: ${stPlaced.solids.length} solids in under ${EGG.STRESS_MS} ms`,
    stPlaced.solids.length >= EGG.STRESS_SOLIDS && stCold < EGG.STRESS_MS,
    `first call in a fresh engine ${r3(stCold)} ms (best of 2), warm median of 7 ${r3(warm(stPlaced, stDoc, 'canvas'))} ms; `
    + `${stDoc.elements.length} elements, ${stRun.stats.faces} walls, found ${stRun.spot.step} ${stRun.spot.kind}`);

  /* 8 and 9. What the file reaches for. */
  const src = await readFile(path, 'utf8');
  const problems = eggSourceProblems(src);
  check('pure: imports only src/props/trig.js; no DOM, clock, Three.js or Math.random; no JS trigonometry or powers',
    problems.length === 0, problems.join('; ') || `Math.${[...new Set([...src.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/\bMath\.([A-Za-z0-9_]+)/g)].map((m) => m[1]))].join(', Math.')} only`);

  /* A map's spot held to the rules, the best wall, the walls' order, and
   * the same spot again. */
  const judge = (label, placed, doc, source, run, opts = {}) => {
    const { spot } = run;
    const broken = eggRules(placed, spot).filter((r) => !r.ok)
      .map((r) => `${spot.kind} on ${spot.elementId ?? 'the paving'} ${spot.type ?? ''} ${spot.part ?? ''}: rule ${r.rule}: ${r.detail}`);
    if (!opts.quiet || broken.length) {
      check(`${label}: the ${spot.step} spot keeps its rules`, broken.length === 0,
        broken.slice(0, 3).join(' | ') || (spot.step === 'seen' ? 'rules 1 to 5' : "the ground step's"));
    }
    const { mine, better, tried } = betterWall(placed, spot);
    const scored = spot.step !== 'seen' || (Number.isFinite(mine) && Math.abs(spot.score - mine) <= 1e-12 * Math.abs(mine));
    let order = true;
    for (let i = 1; i < run.faces.length; i += 1) {
      order = order && run.faces[i - 1].score >= run.faces[i].score;
    }
    const best = !better && scored && order;
    if (!opts.quiet || !best) {
      check(`${label}: ${spot.step === 'seen' ? 'no wall that scores higher' : 'no wall'} keeps rules 1 to 5 at its middle, and the walls come best first`, best,
        better ? `${better.wall.el.id} ${better.wall.el.type} ${better.wall.part.name} scores ${r3(better.score)} against ${r3(mine)} and keeps them`
          : `${tried} better walls tried, none keeps them; score ${spot.step === 'seen' ? `${r3(spot.score)}, this file's ${r3(mine)}` : 'none, on the paving'}; `
          + `${run.faces.length} walls ${order ? 'in order' : 'OUT OF ORDER'}`);
    }
    const again = chooseStfSpot(placed, doc, source);
    const twice = normalize(normalize(doc).doc).doc;
    const renorm = chooseStfSpot(placeDocument(twice), twice, source);
    const d1 = spotDifference(spot, again);
    const d2 = spotDifference(spot, renorm);
    if (!opts.quiet || d1 || d2) {
      check(`${label}: the same spot on a second run and after normalize(normalize(doc)), to the bit`, !d1 && !d2, d1 || d2 || 'the same');
    }
    return broken.length === 0 && best && !d1 && !d2;
  };
  const where = (s) => `${s.step} ${s.kind}${s.frame ? ' in the first frame' : ''} on ${s.elementId ?? 'the paving'} ${s.type ?? ''} ${s.part ?? ''}`.replace(/\s+/g, ' ').trim()
    + ` at (${r3(s.p[0])}, ${r3(s.p[1])}, ${r3(s.p[2])}) facing (${s.n.join(', ')}), ${r3(s.w)} by ${r3(s.h)} m`;

  /* The starter. Its key is 'built:starter' whatever its id is; the source
   * changes the key and nothing else. */
  const sSpot = sRun.spot;
  console.log(`        the starter's spot: ${where(sSpot)}, ${r3(eggReach(eggPads(sPlaced), sSpot.p))} m from the pads`);
  check("the starter's key is 'built:starter'", sSpot.key === 'built:starter' && stfKey(sDoc, 'starter') === 'built:starter', sSpot.key);
  const asCanvas = chooseStfSpot(sPlaced, sDoc, 'canvas');
  check("the same map from the seat keys by its id, at the same spot", asCanvas.key === `built:${sDoc.id}`
    && spotDifference({ ...asCanvas, key: '' }, { ...sSpot, key: '' }) === null, asCanvas.key);
  check('the starter: a wall seen from the pads', sSpot.step === 'seen' && sSpot.kind === 'wall', `${sSpot.step} ${sSpot.kind}`);
  for (const r of eggRules(sPlaced, sSpot)) {
    note(`rule ${r.rule}: ${r.ok ? 'kept' : 'BROKEN'}, ${r.detail}`);
  }
  judge('the starter', sPlaced, sDoc, 'starter', sRun);
  const fresh = normalize(starter.starterMap()).doc;
  const dFresh = spotDifference(sSpot, chooseStfSpot(placeDocument(fresh), fresh, 'starter'));
  check('the starter: two fresh copies of it, the same spot to the bit', dFresh === null, dFresh ?? 'the same');
  check('the starter: choosing the spot leaves the placement as it was, to the bit', placementHash(sPlaced) === hashBefore,
    `placement hash ${hashBefore.slice(0, 16)}`);

  /* One of everything, under a fixed id. */
  const eDoc = everythingDoc().doc;
  eDoc.id = 'trk-egg-everything';
  const ePlaced = placeDocument(eDoc);
  const eHash = placementHash(ePlaced);
  const eRun = stfSearch(ePlaced, eDoc, 'canvas');
  console.log(`        one of everything: ${where(eRun.spot)}`);
  judge('one of everything', ePlaced, eDoc, 'canvas', eRun);
  check('one of everything: choosing the spot leaves the placement as it was, to the bit', placementHash(ePlaced) === eHash,
    `placement hash ${eHash.slice(0, 16)}`);

  /* 6 and 7. Fifty random maps, and the id moves nothing. */
  const steps = {};
  let good = 0;
  let moved = 0;
  let frame = 0;
  for (let k = 0; k < EGG.RANDOM_MAPS; k += 1) {
    const doc = normalize(randomEggMap(k)).doc;
    const placed = placeDocument(doc);
    const run = stfSearch(placed, doc, 'canvas');
    steps[run.spot.step] = (steps[run.spot.step] || 0) + 1;
    frame += run.spot.frame ? 1 : 0;
    if (judge(`random map ${k}`, placed, doc, 'canvas', run, { quiet: true })) {
      good += 1;
    }
    const copy = { ...doc, id: `${doc.id}-copy` };
    if (spotDifference({ ...run.spot, key: '' }, { ...chooseStfSpot(placed, copy, 'canvas'), key: '' })) {
      moved += 1;
    }
  }
  check(`${EGG.RANDOM_MAPS} random maps: every spot keeps its rules, no better wall is passed over, and it comes back the same`, good === EGG.RANDOM_MAPS,
    `${good} of ${EGG.RANDOM_MAPS}; steps ${Object.entries(steps).map(([s, n]) => `${s} ${n}`).join(', ')}; ${frame} in the first frame`);
  check('the id moves nothing: each random map under a second id, the same spot to the bit', moved === 0,
    `${moved} of ${EGG.RANDOM_MAPS} moved`);

  /* 7. Each step, on a map built to reach it. */
  for (const m of eggStepMaps()) {
    const doc = normalize(m.doc).doc;
    const placed = placeDocument(doc);
    const run = stfSearch(placed, doc, 'canvas');
    const plan = m.step === 'ground' ? groundPlan(placed, eggPads(placed)) : null;
    const atFirst = plan && Math.abs(run.spot.p[0] - plan.places[0].x) < 1e-9 && Math.abs(run.spot.p[2] - plan.places[0].z) < 1e-9;
    const reached = run.spot.step === m.step && (!m.frame || run.spot.frame)
      && (!m.first || (plan.places[0].clear && atFirst)) && (!m.notFirst || (!plan.places[0].clear && !atFirst));
    check(`a spot on every map: ${m.label} reaches '${m.step}'${m.frame ? ', in the first frame' : ''}`
      + `${m.first ? ', at the first place ahead' : ''}${m.notFirst ? ', not at the first place' : ''}`, reached,
      `${where(run.spot)}; ${placed.solids.length} solids, ${run.stats.faces} walls`);
    judge(m.label, placed, doc, 'canvas', run);
  }

  /* The partners' marks, on the same maps. */
  await partnerMarks(egg, sDoc, sPlaced, eDoc, ePlaced);

  /* The patron marks, capped at 3 per map, not findable. */
  await patronMarks(egg, sDoc, sPlaced, eDoc, ePlaced);

  /* Finding it, on the starter, where its map paints it. */
  await eggFind(sPlaced, sSpot);
  /* And that the builder can never draw it. */
  await eggBuilderBlind();
}

/* ------------------------------------------------------------------ */
/* The partners' marks                                                 */
/* ------------------------------------------------------------------ */

/*
 * THE PARTNERS' MARKS (src/maps/built/egg.js, rules 8 to 10), held to the
 * same rules as the STF mark's by the same eggRules, with the sign's own
 * shape for rule 1, and for the 'wall' step only the near half of rule 5
 * and not rule 4: one spot per partner in the roster's order, keyed by the
 * map's key and the slug, never on the STF mark's element or another
 * partner's, every middle PARTNER.SEP from every other, the placement left
 * as it was, and the same spots again on a second run and under a second
 * id. On the starter, one of everything, fifty random maps and the maps
 * built to reach each of the STF mark's steps.
 */
async function partnerMarks(egg, sDoc, sPlaced, eDoc, ePlaced) {
  console.log("        the partners' marks (rules 8 to 10)");
  const { chooseStfSpot, partnerSearch, stfKey } = egg;
  const roster = await import(pathToFileURL(join(root, 'src/partners/roster.js')).href);
  const list = roster.PARTNERS.map((p) => ({ slug: p.slug, aspect: EGG.PARTNER.SHARE * p.logo.aspect + (1 - EGG.PARTNER.SHARE) }));
  const signs = new Map(roster.PARTNERS.map((p) => [p.slug, partnerSign(p.logo.aspect)]));
  const judgePartners = (label, placed, doc, source, quiet = false) => {
    const hash = placementHash(placed);
    const stf = chooseStfSpot(placed, doc, source);
    const run = partnerSearch(placed, doc, source, stf, list);
    const problems = [];
    if (run.spots.length !== list.length || run.spots.some((sp, k) => sp.slug !== list[k].slug)) {
      problems.push(`spots for ${run.spots.map((sp) => sp.slug).join(', ')}, not the roster's ${list.map((p) => p.slug).join(', ')}`);
    }
    const all = [stf, ...run.spots];
    const elements = new Set(stf.elementId ? [stf.elementId] : []);
    for (const sp of run.spots) {
      if (sp.key !== `${stfKey(doc, source)}#${sp.slug}`) {
        problems.push(`${sp.slug}: key ${sp.key}`);
      }
      if (!['seen', 'wall', 'ground'].includes(sp.step)) {
        problems.push(`${sp.slug}: step ${sp.step}`);
      }
      const broken = eggRules(placed, sp, false, { sign: signs.get(sp.slug), loose: sp.step === 'wall' }).filter((r) => !r.ok);
      for (const r of broken) {
        problems.push(`${sp.slug} ${sp.step} on ${sp.elementId ?? 'the paving'} ${sp.part ?? ''}: rule ${r.rule}: ${r.detail}`);
      }
      if (sp.elementId) {
        if (elements.has(sp.elementId)) {
          problems.push(`${sp.slug}: on ${sp.elementId}, which already carries a mark`);
        }
        elements.add(sp.elementId);
      }
    }
    for (let i = 0; i < all.length; i += 1) {
      for (let j = i + 1; j < all.length; j += 1) {
        const d = Math.hypot(all[i].p[0] - all[j].p[0], all[i].p[1] - all[j].p[1], all[i].p[2] - all[j].p[2]);
        if (d < EGG.PARTNER.SEP - 1e-9) {
          problems.push(`${all[i].slug ?? 'STF'} and ${all[j].slug} ${r3(d)} m apart`);
        }
      }
    }
    const again = partnerSearch(placed, doc, source, stf, list).spots;
    const copy = { ...doc, id: `${doc.id}-copy` };
    const other = partnerSearch(placed, copy, source, chooseStfSpot(placed, copy, source), list).spots;
    run.spots.forEach((sp, k) => {
      const d1 = again[k] ? spotDifference(sp, again[k]) : 'missing';
      const d2 = other[k] ? spotDifference({ ...sp, key: '' }, { ...other[k], key: '' }) : 'missing';
      if (d1 || d2) {
        problems.push(`${sp.slug}: not the same spot again (${d1 || d2})`);
      }
    });
    if (placementHash(placed) !== hash) {
      problems.push('the placement changed');
    }
    if (!quiet || problems.length) {
      check(`${label}: every partner has a spot that keeps its rules, apart and on its own wall, the same every time`, problems.length === 0,
        problems.slice(0, 3).join(' | ') || run.spots.map((sp) => `${sp.slug} ${sp.step} ${sp.kind} on ${sp.elementId ?? 'the paving'} ${sp.type ?? ''}, ${r3(sp.w)} by ${r3(sp.h)} m`).join('; '));
    }
    return { ok: problems.length === 0, run };
  };

  const t0 = performance.now();
  const s = judgePartners('the starter', sPlaced, sDoc, 'starter');
  const ms = performance.now() - t0;
  check(`quick: the partners' spots on the starter in under ${EGG.STARTER_MS} ms, warm`, ms < EGG.STARTER_MS * 4,
    `${r3(ms)} ms for the search, a second run and a second id, three searches; ${s.run.stats.faces} walls, ${s.run.stats.tried} places, ${s.run.stats.lines} sight lines`);
  judgePartners('one of everything', ePlaced, eDoc, 'canvas');
  const steps = {};
  let good = 0;
  for (let k = 0; k < EGG.RANDOM_MAPS; k += 1) {
    const doc = normalize(randomEggMap(k)).doc;
    const r = judgePartners(`random map ${k}`, placeDocument(doc), doc, 'canvas', true);
    for (const sp of r.run.spots) {
      steps[sp.step] = (steps[sp.step] || 0) + 1;
    }
    good += r.ok ? 1 : 0;
  }
  check(`${EGG.RANDOM_MAPS} random maps: every partner's spot keeps its rules`, good === EGG.RANDOM_MAPS,
    `${good} of ${EGG.RANDOM_MAPS}; steps ${Object.entries(steps).map(([st, n]) => `${st} ${n}`).join(', ')}`);
  for (const m of eggStepMaps()) {
    const doc = normalize(m.doc).doc;
    judgePartners(m.label, placeDocument(doc), doc, 'canvas');
  }
}

async function patronMarks(egg, sDoc, sPlaced, eDoc, ePlaced) {
  console.log("        the patron marks (capped at 3, not findable)");
  const { chooseStfSpot, partnerSearch, stfKey, choosePatronSpots, PARTNER_SEP } = egg;
  const { choosePatrons } = await import(pathToFileURL(join(root, 'src/partners/patrons.js')).href);
  const roster = await import(pathToFileURL(join(root, 'src/partners/roster.js')).href);
  const art = await import(pathToFileURL(join(root, 'src/art/partnermark.js')).href);
  const findModule = await import(pathToFileURL(join(root, 'src/game/egg.js')).href);
  const { shouldFindMark } = findModule;
  
  /* Two test patrons for the "all appear on every map" case */
  const twoPatrons = [
    { slug: 'test-patron-one', name: 'Test Patron One', short: 'TP1', mark: { field: '#19171e' } },
    { slug: 'test-patron-two', name: 'Test Patron Two', short: 'TP2', mark: { field: '#f3ead4' } },
  ];
  
  /* Test 1: with 2 patrons, both appear on every map */
  const mapKey1 = stfKey(sDoc, 'starter');
  const mapKey2 = stfKey(eDoc, 'canvas');
  const chosen2a = choosePatrons(twoPatrons, mapKey1);
  const chosen2b = choosePatrons(twoPatrons, mapKey2);
  check('with 2 patrons, both appear on both map keys', 
    chosen2a.length === 2 && chosen2b.length === 2 
    && chosen2a[0].slug === 'test-patron-one' && chosen2a[1].slug === 'test-patron-two'
    && chosen2b[0].slug === 'test-patron-one' && chosen2b[1].slug === 'test-patron-two',
    `key1: ${chosen2a.map((p) => p.slug).join(', ')}; key2: ${chosen2b.map((p) => p.slug).join(', ')}`);
  
  /* Five test patrons for the seeded selection case: 3 text-only, 1 with a fake logo, 1 text-only */
  const fivePatrons = [
    { slug: 'test-patron-one', name: 'Test Patron One', short: 'TP1', mark: { field: '#19171e' } },
    { slug: 'test-patron-two', name: 'Test Patron Two', short: 'Patron 2', mark: { field: '#f3ead4' } },
    { slug: 'test-patron-three', name: 'Test Patron Three', short: 'Three', mark: { field: '#19171e' } },
    { slug: 'test-patron-four', name: 'Test Patron Four', short: 'Four', logo: { aspect: 208 / 72 }, mark: { field: '#f3ead4' } },
    { slug: 'test-patron-five', name: 'Test Patron Five', short: 'TP5', mark: { field: '#19171e' } },
  ];

  /* Test 2: with 5 patrons, exactly 3 appear */
  const chosen5 = choosePatrons(fivePatrons, mapKey1);
  check('with 5 patrons, exactly 3 are chosen', chosen5.length === 3);
  
  /* Test 3: same pick across two runs for one map key */
  const chosen5Again = choosePatrons(fivePatrons, mapKey1);
  const same = chosen5.length === chosen5Again.length && chosen5.every((p, k) => p.slug === chosen5Again[k].slug);
  check('with 5 patrons, same map key picks the same 3 every time', same,
    `first: ${chosen5.map((p) => p.slug).join(', ')}; second: ${chosen5Again.map((p) => p.slug).join(', ')}`);
  
  /* Test 4: different pick for multiple keys - at least two differ */
  const testKeys = ['built:test-a', 'built:test-b', 'built:test-c', 'built:test-d', 'built:test-e'];
  const picks = testKeys.map(k => choosePatrons(fivePatrons, k).map(p => p.slug).join(','));
  const uniquePicks = new Set(picks);
  check('with 5 patrons, different map keys pick different patrons (at least 2 unique picks from 5 keys)', uniquePicks.size >= 2,
    `${uniquePicks.size} unique picks: ${[...uniquePicks].slice(0, 3).join(' | ')}`);
  
  /* Test 5: text-only sign aspect is deterministic and in range */
  const textOnlyPatron = fivePatrons[0];
  const aspect1 = art.signAspect(textOnlyPatron);
  const aspect2 = art.signAspect(textOnlyPatron);
  check('text-only patron aspect is deterministic', aspect1 === aspect2, `${r3(aspect1)} vs ${r3(aspect2)}`);
  check('text-only patron aspect is in sensible range', aspect1 >= 1.5 && aspect1 <= 6.0, `aspect ${r3(aspect1)}`);
  
  /* Test 6: patron spots never on a wall already used by STF or a partner, and at least PARTNER_SEP apart */
  const stf = chooseStfSpot(sPlaced, sDoc, 'starter');
  const allPartners = [...roster.PARTNERS, ...roster.MAP_ONLY_PARTNERS];
  const partnerSpots = partnerSearch(sPlaced, sDoc, 'starter', stf,
    allPartners.map((p) => ({ slug: p.slug, aspect: art.signAspect(p) }))).spots;
  const patronList = chosen5.map((p) => ({ slug: p.slug, aspect: art.signAspect(p) }));
  const patronSpots = choosePatronSpots(sPlaced, sDoc, 'starter', stf, partnerSpots, patronList);
  
  const takenElements = new Set([stf.elementId, ...partnerSpots.map((s) => s.elementId)].filter(Boolean));
  const patronsOnTakenWall = patronSpots.filter((ps) => ps.elementId && takenElements.has(ps.elementId));
  check('patron spots never on a wall already used by STF or a partner', patronsOnTakenWall.length === 0,
    `${patronsOnTakenWall.length} patrons on taken walls: ${patronsOnTakenWall.map((ps) => ps.slug).join(', ')}`);
  
  const allMarks = [stf, ...partnerSpots, ...patronSpots];
  const tooClose = [];
  for (let i = allMarks.length - patronSpots.length; i < allMarks.length; i += 1) {
    for (let j = 0; j < i; j += 1) {
      const d = Math.hypot(allMarks[i].p[0] - allMarks[j].p[0],
        allMarks[i].p[1] - allMarks[j].p[1], allMarks[i].p[2] - allMarks[j].p[2]);
      if (d < PARTNER_SEP - 1e-9) {
        tooClose.push(`${allMarks[i].slug} and ${allMarks[j].slug ?? 'STF'} ${r3(d)} m apart`);
      }
    }
  }
  check('patron spots at least PARTNER_SEP from STF and all partners', tooClose.length === 0,
    tooClose.slice(0, 3).join(' | ') || 'all apart');
  
  /* Test 7a: patron spots chosen, and paintPatronMarks would set findable: false */
  check('patron spots chosen for all patrons (findable: false set by paintPatronMarks)', 
    patronSpots.length === chosen5.length && patronSpots.every(s => chosen5.find(p => p.slug === s.slug)),
    `${patronSpots.length} patron spots for ${chosen5.length} patrons: ${patronSpots.map(s => s.slug).join(', ')}`);
  
  /* Test 7b: shouldFindMark correctly filters based on findable flag */
  const testMarks = [
    { slug: 'partner-findable-true', findable: true },
    { slug: 'partner-findable-undefined' },
    { slug: 'patron-not-findable', findable: false },
  ];
  const shouldFindResults = testMarks.map(m => ({ slug: m.slug, should: shouldFindMark(m) }));
  const correctBehavior = shouldFindResults[0].should === true 
    && shouldFindResults[1].should === true 
    && shouldFindResults[2].should === false;
  check('shouldFindMark: findable:true and undefined are findable, findable:false is not', correctBehavior,
    shouldFindResults.map(r => `${r.slug}=${r.should}`).join(', '));
  
  /* Test 8a: text-only patron aspect computes without crashing */
  const textOnlyTest = fivePatrons.find(p => !p.logo);
  let aspectError = null;
  let textAspect = 0;
  try {
    textAspect = art.signAspect(textOnlyTest);
  } catch (e) {
    aspectError = e.message;
  }
  check('text-only patron signAspect computes without throwing', textAspect > 0 && !aspectError,
    aspectError || `aspect ${r3(textAspect)}`);
  
  /* Test 8b: text-only patron paints without throwing, produces canvas */
  const canvasMock = {
    width: 1024,
    height: 512,
    getContext: () => ({
      clearRect: () => {},
      fillRect: () => {},
      measureText: (text) => ({ width: text.length * 30 }),
      fillText: () => {},
      createRadialGradient: () => ({ addColorStop: () => {} }),
      save: () => {},
      restore: () => {},
      beginPath: () => {},
      moveTo: () => {},
      arcTo: () => {},
      closePath: () => {},
      fill: () => {},
    }),
    toDataURL: () => 'data:image/png;base64,test',
  };
  global.document = { createElement: (tag) => tag === 'canvas' ? canvasMock : {} };
  let paintError = null;
  let canvas = null;
  try {
    canvas = art.partnerCanvas(textOnlyTest);
  } catch (e) {
    paintError = e.message;
  }
  delete global.document;
  check('text-only patron partnerCanvas produces canvas without throwing', canvas && canvas.width > 0 && !paintError,
    paintError || `got canvas ${canvas.width}x${canvas.height}`);
  
  /* Test 9: build the starter map with test patrons, verify spots are chosen correctly */
  const testPatronsForBuild = [
    {
      slug: 'test-patron-alpha',
      name: 'Test Patron Alpha',
      short: 'ALPHA',
      mark: { field: '#3a4a5c' },
    },
    {
      slug: 'test-patron-beta',
      name: 'Test Patron Beta',
      short: 'BETA',
      mark: { field: '#5c3a4a' },
    },
  ];
  
  const partnerList = roster.PARTNERS.map((p) => ({ slug: p.slug, aspect: EGG.PARTNER.SHARE * p.logo.aspect + (1 - EGG.PARTNER.SHARE) }));
  const mapKeyForTest = stfKey(sDoc, 'starter');
  const chosenPatronsForTest = choosePatrons(testPatronsForBuild, mapKeyForTest);
  const stfSpot = chooseStfSpot(sPlaced, sDoc, 'starter');
  const partnerSpotsForTest = partnerSearch(sPlaced, sDoc, 'starter', stfSpot, partnerList).spots;
  const patronSpotsForTest = choosePatronSpots(sPlaced, sDoc, 'starter', stfSpot, partnerSpotsForTest, chosenPatronsForTest);
  
  /* Verify both patrons are in the spots with correct properties */
  check('starter map with 2 test patrons: both patron spots chosen', 
    patronSpotsForTest.length === 2 
    && patronSpotsForTest.every(s => testPatronsForBuild.find(p => p.slug === s.slug)),
    `${patronSpotsForTest.length} patron spots: ${patronSpotsForTest.map(s => s.slug).join(', ')}`);
  
  /* Verify partners are still present (not displaced by patrons) */
  check('starter map with patrons: all partner spots still present', 
    partnerSpotsForTest.length === partnerList.length 
    && partnerSpotsForTest.every((s, k) => s.slug === partnerList[k].slug),
    `${partnerSpotsForTest.length} partner spots: ${partnerSpotsForTest.map(s => s.slug).join(', ')}`);
  
  /* Verify patrons don't overlap STF or partners (same element ID) */
  const partnerElementIds = new Set(partnerSpotsForTest.map(s => s.el));
  const patronOnPartnerWall = patronSpotsForTest.filter(s => s.el && partnerElementIds.has(s.el));
  check('starter map with patrons: no patron on a wall already used by STF or partner', patronOnPartnerWall.length === 0,
    patronOnPartnerWall.length ? `${patronOnPartnerWall.map(s => s.slug).join(', ')} on partner walls` : 'all patrons on distinct walls');

  /*
   * Test 10: the town's roster rules. WHERE the town's three spots are is not
   * asked here, and that is on purpose. This file runs in plain Node and the
   * town's module needs Three.js, so an earlier version of this block kept a
   * copy of the spots and of the buildings' constants beside it and checked
   * the copy against the constants. The copy had drifted from the real spots
   * on the day it was written (a 4 m sign at x 29.8 against a 3.5 m one at
   * 29.68), the constants were centrelines and not faces, and sixteen green
   * lines said nothing about the paint. The spots are asked of the live city,
   * wall by wall, by `npm run check:town-patrons`.
   */
  console.log('        the town map patron roster (the spots: npm run check:town-patrons)');

  const testPatrons3 = [
    { slug: 'test-city-patron-one', name: 'Test City Patron One', short: 'TCP1', mark: { field: '#19171e' } },
    { slug: 'test-city-patron-two', name: 'Test City Patron Two', short: 'TCP2', mark: { field: '#f3ead4' } },
    { slug: 'test-city-patron-three', name: 'Test City Patron Three', short: 'TCP3', mark: { field: '#19171e' } },
  ];

  /* Test 10a: selection rules */
  const chosen1town = choosePatrons([testPatrons3[0]], 'city');
  check('town map with 1 patron: 1 appears', chosen1town.length === 1, `${chosen1town.length} patrons`);

  const chosen2town = choosePatrons(testPatrons3.slice(0, 2), 'city');
  check('town map with 2 patrons: 2 appear', chosen2town.length === 2, `${chosen2town.length} patrons`);

  const chosen3town = choosePatrons(testPatrons3, 'city');
  check('town map with 3 patrons: 3 appear', chosen3town.length === 3, `${chosen3town.length} patrons`);

  const testPatrons5town = [...testPatrons3,
    { slug: 'test-city-patron-four', name: 'Test City Patron Four', short: 'TCP4', mark: { field: '#f3ead4' } },
    { slug: 'test-city-patron-five', name: 'Test City Patron Five', short: 'TCP5', mark: { field: '#19171e' } }];
  const chosen5town = choosePatrons(testPatrons5town, 'city');
  const chosen5townAgain = choosePatrons(testPatrons5town, 'city');
  const stableTown = chosen5town.length === 3 && chosen5town.every((p, i) => p.slug === chosen5townAgain[i].slug);
  check('town map with 5 patrons: 3 picked, same every time', stableTown,
    `${chosen5town.length} picked, stable: ${stableTown}`);

  /* Test 10b: findable checks using mock marks */
  const mockPatronMark = { findable: false, slug: 'test-patron' };
  const mockPartnerMark = { slug: 'mantisfpv' };
  const patronFindable = shouldFindMark(mockPatronMark);
  const partnerFindable = shouldFindMark(mockPartnerMark);
  check('shouldFindMark returns false for patron marks (findable:false)', !patronFindable,
    `shouldFindMark(patron)=${patronFindable}`);
  check('shouldFindMark returns true for partner marks', partnerFindable,
    `shouldFindMark(partner)=${partnerFindable}`);
}

/* ------------------------------------------------------------------ */
/* Finding the mark                                                    */
/* ------------------------------------------------------------------ */

/*
 * FINDING THE MARK (src/game/egg.js), against real Colliders built from the
 * starter's placed solids: the set the plant flies against, so a wall that
 * stops a craft hides the mark. The mark is where src/maps/built/index.js
 * paints it, LIFT off the face the spot chose, and every eye looks straight
 * at its centre unless it is turned away:
 *
 *   NEAR in front, looking at it          found
 *   the same eye turned round             not found
 *   FAR past its range, in front          not found: out of range, which
 *                                         grows with the mark's width
 *   BEHIND past the solid it is on        not found, and no clear line
 *   the spawn's eyes (the chooser's)      a clear line and not found: seen
 *                                         from the pads, and found only by
 *                                         flying to it
 *   a plate planted square across         not found: the line goes in one
 *                                         face and out of the opposite one
 *   a box whose corner the line cuts,     not found, where the opposite
 *   seen from HIGH over the near eye      faces question alone says clear
 *
 * LIFT is STF_LIFT in src/maps/built/index.js. The page also lifts the
 * paint clear of the relief the kit draws on the face (drawnRelief there,
 * 5.6 cm on the starter's container door), which Node cannot draw, so the
 * eyes here look at paint nearer the solid than the page puts it: the
 * harder case for the clear line. NEAR, BEHIND and HIGH are the brief's
 * distances and the corner case's height, in metres, and FAR is how far past
 * the mark's own range the far eye stands.
 */
const EGG_FIND = { LIFT: 0.015, NEAR: 3, FAR: 2, BEHIND: 1, HIGH: 1.5, EDGE_OUT: 0.3, SLANT_OUT: 1.2 };

/* A point in the mark's own frame: `a` out along its normal, `u` along its
 * up and `r` along its right, from the painted centre. */
function eggAt(egg, right, a, u, r) {
  const at = (k) => egg.p[k] + egg.n[k] * a + egg.up[k] * u + right[k] * r;
  return { x: at(0), y: at(1), z: at(2) };
}

/* A box in the mark's own frame, planted as a wall. The normal, up and
 * right of a spot are unit axis vectors, so it is axis aligned. */
function eggPlant(egg, right, a0, a1, u0, u1, r0, r1, name) {
  const c = eggAt(egg, right, a0, u0, r0);
  const d = eggAt(egg, right, a1, u1, r1);
  return {
    kind: 'wall',
    name,
    box: [Math.min(c.x, d.x), Math.min(c.y, d.y), Math.min(c.z, d.z), Math.max(c.x, d.x), Math.max(c.y, d.y), Math.max(c.z, d.z)],
  };
}

function eggToward(eye, egg) {
  return { x: egg.p[0] - eye.x, y: egg.p[1] - eye.y, z: egg.p[2] - eye.z };
}

async function eggFind(placed, spot) {
  console.log('        finding it (src/game/egg.js), on the starter');
  const path = join(root, 'src/game/egg.js');
  let find;
  try {
    find = await import(pathToFileURL(path).href);
  } catch (e) {
    fail('src/game/egg.js imports in Node', e.message);
    return;
  }
  const { seesMark, clearLineTo, findRange, FIND_FACE } = find;
  const colliders = buildColliders(placed);
  const egg = {
    key: spot.key,
    p: spot.p.map((v, k) => v + spot.n[k] * EGG_FIND.LIFT),
    n: spot.n,
    up: spot.up,
    w: spot.w,
    h: spot.h,
  };
  const right = cross3(spot.up, spot.n);
  const sees = (eye, set = colliders) => seesMark(eye, eggToward(eye, egg), egg, set);
  const at = (e) => `(${r3(e.x)}, ${r3(e.y)}, ${r3(e.z)})`;

  const near = eggAt(egg, right, EGG_FIND.NEAR, 0, 0);
  check(`the find: an eye ${EGG_FIND.NEAR} m in front of the starter's mark, looking at it, finds it`, sees(near),
    `eye ${at(near)}, mark ${at({ x: egg.p[0], y: egg.p[1], z: egg.p[2] })} facing (${egg.n.join(', ')})`);
  const back = eggToward(near, egg);
  check('the find: the same eye turned round does not', !seesMark(near, { x: -back.x, y: -back.y, z: -back.z }, egg, colliders),
    'looking straight away from it');
  const range = findRange(egg);
  const far = eggAt(egg, right, range + EGG_FIND.FAR, 0, 0);
  const inReach = eggAt(egg, right, range - 0.5, 0, 0);
  check(`the find: ${EGG_FIND.FAR} m past its range in front, looking at it, does not; half a metre inside it, it does`,
    !sees(far) && sees(inReach) && range > EGG_FIND.NEAR,
    `range ${r3(range)} m for a ${r3(egg.w)} m mark`);

  /* Edge on: 3 m along the face and a little out from it, looking at the
   * centre. In range, in front of the paint, looking at it, with a clear
   * line, and still a stripe of paint rather than a mark; the same eye
   * further out, at a slant a pilot reads, finds it. */
  const slant = (e) => (180 / Math.PI) * Math.asin(Math.min(1, dot(sub([e.x, e.y, e.z], egg.p), egg.n)
    / Math.hypot(e.x - egg.p[0], e.y - egg.p[1], e.z - egg.p[2])));
  const edge = eggAt(egg, right, EGG_FIND.EDGE_OUT, 0, EGG_FIND.NEAR);
  const slanted = eggAt(egg, right, EGG_FIND.SLANT_OUT, 0, EGG_FIND.NEAR);
  check(`the find: an eye ${EGG_FIND.NEAR} m along the face and ${EGG_FIND.EDGE_OUT} m out, edge on, does not; ${EGG_FIND.SLANT_OUT} m out, it does`,
    !sees(edge) && clearLineTo(edge, egg, colliders) && sees(slanted),
    `${r3(slant(edge))} degrees off the paint with a clear line: ${sees(edge) ? 'FOUND' : 'not found'}; `
    + `${r3(slant(slanted))} degrees: ${sees(slanted) ? 'found' : 'NOT FOUND'}; FIND_FACE ${r3(FIND_FACE)}`);

  /* Behind: past the far side of the box it is painted on, looking back at
   * it. The box is the solid the face belongs to, found by the point just
   * inside the face. */
  const inside = eggAt(egg, right, -EGG_FIND.LIFT - 0.01, 0, 0);
  const own = placed.solids.find((s2) => s2.box
    && inside.x > s2.box[0] && inside.x < s2.box[3]
    && inside.y > s2.box[1] && inside.y < s2.box[4]
    && inside.z > s2.box[2] && inside.z < s2.box[5]);
  if (!own) {
    fail('the find: the solid the mark is painted on', `no box holds ${at(inside)}`);
  } else {
    const depth = [0, 1, 2].reduce((sum, k) => sum + Math.abs(spot.n[k]) * (own.box[k + 3] - own.box[k]), 0);
    const behind = eggAt(egg, right, -(EGG_FIND.LIFT + depth + EGG_FIND.BEHIND), 0, 0);
    check(`the find: an eye ${EGG_FIND.BEHIND} m past the far side of the ${own.name} it is on does not, and has no clear line`,
      !sees(behind) && !clearLineTo(behind, egg, colliders), `eye ${at(behind)}, through ${r3(depth)} m of ${own.kind} ${own.name}`);
  }

  const sp = placed.spawn;
  const spawnEyes = EGG.EYES.map((h) => ({ x: sp.x, y: sp.y + h, z: sp.z }));
  const blind = spawnEyes.filter((e) => !clearLineTo(e, egg, colliders));
  const foundOnPads = spawnEyes.filter((e) => sees(e));
  check(`the find: the spawn's eyes, ${EGG.EYES.join(', ')} m over the seat, have a clear line to it and do not find it`,
    blind.length === 0 && foundOnPads.length === 0,
    blind.length ? `no clear line from ${blind.map(at).join(', ')}`
      : (foundOnPads.length ? `found from ${foundOnPads.map(at).join(', ')}` : `seen from the pads, ${r3(Math.hypot(egg.p[0] - sp.x, egg.p[2] - sp.z))} m off, past its ${r3(range)} m range`));

  /* A plate square across the line, 5 cm thick, half way. */
  const plate = eggPlant(egg, right, 1.5, 1.55, -1, 1, -1, 1, 'plantedPlate');
  const withPlate = buildColliders({ solids: [...placed.solids, plate] });
  check('the find: a 5 cm plate planted square across the line hides it', !sees(near, withPlate), 'in one face and out of the opposite one');

  /* A box whose corner the line cuts: the eye HIGH over the near one, the
   * box's top a little over the mark's centre and its near face 12 cm off
   * the paint, reaching past the eye. Neither end of the line is past the
   * box on any one axis, so the opposite faces question calls it clear,
   * and the walk along the line finds the half metre it spends inside. */
  const high = eggAt(egg, right, EGG_FIND.NEAR, EGG_FIND.HIGH, 0);
  const corner = eggPlant(egg, right, 0.12, EGG_FIND.NEAR + 0.7, -2, 0.31, -1.5, 1.5, 'plantedCorner');
  const withCorner = buildColliders({ solids: [...placed.solids, corner] });
  const end = eggAt(egg, right, 0.02, 0, 0);
  const crosses = withCorner.segmentCrossesAny(high.x, high.y, high.z, end.x, end.y, end.z);
  check('the find: a box whose corner the sight line cuts hides it, where the opposite faces question alone says clear',
    sees(high) && !crosses && !sees(high, withCorner),
    `unplanted ${sees(high) ? 'found' : 'NOT FOUND'}; segmentCrossesAny ${crosses ? 'crosses' : 'clear'}; planted ${sees(high, withCorner) ? 'FOUND' : 'hidden'}`);

  /* It runs every few frames for a whole flight, and the shell's rule is
   * that nothing in it takes an angle or reads a clock. */
  const problems = eggSourceProblems(await readFile(path, 'utf8'));
  check('the find is pure: no imports, no DOM, clock or Three.js, no JS trigonometry or powers', problems.length === 0,
    problems.join('; ') || 'plain arithmetic and a square root');
}

/*
 * WHAT A PAGE CAN REACH, every module its files import, statically or by a
 * literal dynamic import, followed through the tree. Bare specifiers
 * (three and its add-ons) are the CDN's and are not followed.
 */
function importsOf(src) {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const out = [];
  for (const m of code.matchAll(/^\s*(?:import|export)\s[^;]*?from\s+['"]([^'"]+)['"]/gm)) {
    out.push(m[1]);
  }
  for (const m of code.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)) {
    out.push(m[1]);
  }
  for (const m of code.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    out.push(m[1]);
  }
  return out;
}

async function reachableFrom(entries) {
  const seen = new Set();
  const todo = [...entries];
  while (todo.length) {
    const file = todo.pop();
    if (seen.has(file)) {
      continue;
    }
    seen.add(file);
    let src;
    try {
      src = await readFile(join(root, file), 'utf8');
    } catch (e) {
      continue;
    }
    for (const spec of importsOf(src)) {
      if (spec.startsWith('.')) {
        todo.push(posix.normalize(posix.join(posix.dirname(file), spec)));
      }
    }
  }
  return seen;
}

/* The files that draw the mark, choose where it goes or find it, none of
 * which the builder may reach: the person who built a map has to find the
 * mark too (FREESTYLE-MAPS-PLAN.md section 12, decision 3). */
const EGG_BUILDER_BLIND = ['src/art/stf.js', 'src/art/partnermark.js', 'src/maps/built/egg.js', 'src/maps/built/index.js', 'src/game/egg.js', 'src/partners/patrons.js'];

async function eggBuilderBlind() {
  const dir = 'src/trackbuilder';
  const entries = (await readdir(join(root, dir))).filter((f) => f.endsWith('.js')).map((f) => `${dir}/${f}`);
  const reached = await reachableFrom(entries);
  const leaks = EGG_BUILDER_BLIND.filter((f) => reached.has(f));
  check('the builder never draws the mark: nothing in src/trackbuilder reaches the mark, its spot or its find',
    leaks.length === 0, leaks.join(', ') || `${entries.length} builder files reach ${reached.size} modules, none of ${EGG_BUILDER_BLIND.join(', ')}`);
}

/*
 * The egg's detectors against planted faults: a mark in full view of the
 * pads keeps every rule, and fails rule 4 and only rule 4 with a wall
 * planted between; a mark out of reach fails rule 5 and only rule 5, and one
 * on the side turned away fails rule 5; a spot with a solid planted in
 * front of it fails rule 3, a mark too wide for its face rule 1, a pole in
 * its air rule 2; a ground spot on a map with a wall in view is caught
 * passing that wall over; and a source that takes a sine fails the purity
 * scan.
 */
async function selftestEgg() {
  const path = join(root, 'src/maps/built/egg.js');
  const egg = await import(pathToFileURL(path).href);
  const starter = await import(pathToFileURL(join(root, 'src/maps/built/starter.js')).href);
  const failed = (list) => list.filter((r) => !r.ok).map((r) => String(r.rule));
  /* The mark at the middle of a map's wall that faces the pads, or the one
   * behind it when `away`. */
  const wallOn = (placed, away) => {
    const pads = eggPads(placed);
    const walls = eggWalls(placed);
    const seen = walls.find((w) => wallScore(pads, w.n, w.mid, w.w) !== null);
    const w = away ? walls.find((x) => x.el === seen.el && x.box === seen.box && x.n.every((v, k) => v === -seen.n[k])) : seen;
    return {
      key: 'built:selftest', step: 'seen', kind: 'wall', p: [...w.mid], n: w.n, up: [0, 1, 0],
      right: cross3([0, 1, 0], w.n).map((v) => v + 0), w: w.w, h: w.h, elementId: w.el.id,
    };
  };

  /* In full view: a container 25 m ahead of the pads, the mark on the side
   * that looks at them. Then a wall planted half way. */
  const vDoc = normalize(containerEggMap('trk-egg-view')).doc;
  const vPlaced = placeDocument(vDoc);
  const viewSpot = wallOn(vPlaced, false);
  check('self test: a mark in full view of the pads keeps every rule', failed(eggRules(vPlaced, viewSpot)).length === 0,
    failed(eggRules(vPlaced, viewSpot)).join(', ') || 'clean');
  const mz = (vPlaced.spawn.z + viewSpot.p[2]) / 2;
  const between = { kind: 'wall', name: 'planted', box: [-10, 0, mz - 0.25, 10, 8, mz + 0.25] };
  const hidden = failed(eggRules({ ...vPlaced, solids: [...vPlaced.solids, between] }, viewSpot));
  check('self test: the same mark with a wall planted between it and the pads fails rule 4, and nothing else',
    hidden.includes('4') && hidden.every((r) => r === '4'), hidden.join(', ') || 'nothing failed');
  const turned = failed(eggRules(vPlaced, wallOn(vPlaced, true)));
  check('self test: a mark on the side turned away from the pads fails rule 5', turned.includes('5'), turned.join(', ') || 'nothing failed');
  const fDoc = normalize(containerEggMap('trk-egg-far', 75)).doc;
  const fPlaced = placeDocument(fDoc);
  const far = failed(eggRules(fPlaced, wallOn(fPlaced, false)));
  check('self test: a mark 75 m from the pads fails rule 5, and nothing else', far.includes('5') && far.every((r) => r === '5'),
    far.join(', ') || 'nothing failed');

  /* The pick: the paving chosen on a map with a wall in view. */
  const plan = groundPlan(vPlaced, eggPads(vPlaced));
  const onPaving = {
    key: 'built:selftest', step: 'ground', kind: 'ground', p: [plan.places[0].x, 0, plan.places[0].z], n: [0, 1, 0], up: plan.up,
    right: cross3(plan.up, [0, 1, 0]).map((v) => v + 0), w: plan.w, h: plan.h, clear: plan.places[0].clear,
  };
  const passed = betterWall(vPlaced, onPaving);
  check('self test: a spot on the paving of a map with a wall in view is caught passing the wall over', Boolean(passed.better),
    passed.better ? `${passed.better.wall.el.type} ${passed.better.wall.part.name} keeps the rules` : 'nothing caught');

  /* The starter's own spot, clean, then with a box planted over the air
   * in front of it, then too wide for its face, then with a pole in its air. */
  const sDoc = normalize(starter.starterMap()).doc;
  const sPlaced = placeDocument(sDoc);
  const spot = egg.chooseStfSpot(sPlaced, sDoc, 'starter');
  check('self test: the starter\'s spot is clean before anything is planted', failed(eggRules(sPlaced, spot)).length === 0,
    failed(eggRules(sPlaced, spot)).join(', ') || 'clean');
  const q = spot.p.map((v, k) => v + spot.n[k] * EGG.OFF);
  const planted = { ...sPlaced, solids: [...sPlaced.solids, { kind: 'wall', name: 'planted', box: [q[0] - 0.25, q[1] - 0.25, q[2] - 0.25, q[0] + 0.25, q[1] + 0.25, q[2] + 0.25] }] };
  const inSolid = failed(eggRules(planted, spot));
  check('self test: a mark with a solid over its middle fails rule 3', inSolid.includes('3'), inSolid.join(', ') || 'nothing failed');
  const wide = failed(eggRules(sPlaced, { ...spot, w: 40, h: 20 }));
  check('self test: a mark wider than its face fails rule 1', wide.includes('1'), wide.join(', ') || 'nothing failed');
  const out = spot.p.map((v, k) => v + spot.n[k] * 1.5);
  const up = spot.up;
  const pole = { kind: 'pole', name: 'planted', cap: [out[0] - up[0] * 2, out[1] - up[1] * 2, out[2] - up[2] * 2, out[0] + up[0] * 2, out[1] + up[1] * 2, out[2] + up[2] * 2, 0.05] };
  const inAir = failed(eggRules({ ...sPlaced, solids: [...sPlaced.solids, pole] }, spot));
  check('self test: a pole in the air in front of a mark fails rule 2 and not rule 3', inAir.includes('2') && !inAir.includes('3'),
    inAir.join(', ') || 'nothing failed');

  /* The builder's import walk sees an import written over two lines and a
   * dynamic one, and not one a comment only talks about. */
  const walked = importsOf("import {\n  a,\n} from './a.js';\n/* import('./c.js') */\nconst m = await import('../art/stf.js'); // https://x\n");
  check('self test: the builder\'s import walk sees a static and a dynamic import, and not one in a comment',
    walked.includes('./a.js') && walked.includes('../art/stf.js') && !walked.includes('./c.js'), walked.join(', '));

  /* The purity scan sees a renderer, a sine and a clock, and not a cosine
   * a comment only talks about. */
  const dirty = eggSourceProblems("import * as THREE from 'three';\n/* Math.cos in a comment is fine */\nconst a = Math.sin(1) + Date.now();\n");
  check('self test: the purity scan sees an import, a sine and a clock, and not a comment',
    dirty.some((p) => p.startsWith('imports three')) && dirty.some((p) => p.includes('Math.sin')) && dirty.includes('Date')
      && !dirty.some((p) => p.includes('cos')), dirty.join('; '));
}

/* ------------------------------------------------------------------ */

console.log('props-check: the freestyle assets, their placement, and the physics');
const world = {};
const blocks = args.includes('--selftest') ? [['selftest', selftestBlock], ['selftest', selftestFlights], ['selftest', selftestEgg]] : [
  ['assets', assetsBlock],
  ['tilt', tiltBlock],
  ['envelope', envelopeBlock],
  ['flythrough', flyThroughBlock],
  ['furniture', furnitureBlock],
  ['determinism', determinismBlock],
  ['physics', physicsBlock],
  ['starter', starterBlock],
  ['scene', sceneBlock],
  ['egg', eggBlock],
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
