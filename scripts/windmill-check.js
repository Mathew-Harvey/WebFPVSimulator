/*
 * windmill-check.js: a windmill's sails, drawn and solid, held to each other
 * and flown into in the real physics module.
 *
 * WHY THIS EXISTS. The sails are the first thing on a built map that moves
 * by itself without a road and that a craft can hit. They are not parts, so
 * scripts/props-check.js, which proves every asset on its parts, never meets
 * them: they are seated in the module by the shell every step from
 * src/props/windmill.js sailsOf, a strip of box at a time round the craft,
 * and drawn by the map from the same angle. So this file holds, in plain
 * Node:
 *
 *   shape     at the corners of the builder's limits: the lowest sail corner
 *             2 m or more over the foot, the sails clear of the tower's
 *             solids by more than the gap rule and of the cap's by half a
 *             metre, the builder's height readout over the highest tip, and
 *             the sweep part round the whole disc
 *   angle     rotorAngle stays in [0, pi/2), starts where Rotor puts it,
 *             turns at the rate asked and stands still at 0 rpm
 *   boxes     seat() against the exact sails, at random craft positions and
 *             steps, at both axis headings: every point of a sail within the
 *             craft's reach is in a box or within STRIP / 2 of one, no box
 *             strays more than STRIP / 2 from a sail, every box spans the
 *             slab and carries the sail's velocity at its middle, the same
 *             call twice is the same bits, and the craft at the hub, where
 *             the four stocks meet, needs fewer boxes than there are slots
 *   warning   fs-sails names a building standing in the disc, and nothing
 *             standing clear of it
 *   physics   the module, seated the way src/main.js pushSails seats it, in
 *             a plant frame turned from the map's, at both axis headings,
 *             with the shell's crash bounce put on it as its step loop puts
 *             it (CrashJudge, putDullBounce, the sail's own velocity as the
 *             face's): a craft hovering in the gap between two sails is hit
 *             by the one coming round, at the step the drawn sail reaches
 *             it, bounced once, not dragged, and leaves at the sail's speed
 *             and no more than a thud on top, the way that sail goes, the
 *             same to the bit twice; the same hover with the sails stopped,
 *             or never seated, touches nothing; and a craft hovering past the
 *             tips, or just in front of the sails, is never touched while
 *             they turn
 *   cost      what seat() and the seating cost a step, far from the sails
 *             and in them, for the latency line in PROGRESS.md. Printed, not
 *             judged: a timing threshold here would be a coin toss
 *
 * Usage: node scripts/windmill-check.js [--only=shape|angle|boxes|warning|physics|cost]
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
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

import { loadSim, SIM_OK, simErrorName } from '../tests/lib/simmod.js';
import { PROPS, partsOf } from '../src/props/catalog.js';
import { approxHeight } from '../src/props/types.js';
import { GAP_MIN } from '../src/props/parts.js';
import {
  windmillShape, rotorAngle, rotorRate, sailsOf, sailSlotsFor, SAIL_SLOTS, SAIL_BOX_DOUBLES, STRIP, WINDOW,
} from '../src/props/windmill.js';
import { addSolids } from '../src/props/solids.js';
import { sincos } from '../src/props/trig.js';
import { Colliders, GROUND_MU, GROUND_E, CrashJudge, putDullBounce, DULL_OUT_MAX } from '../src/game/collide.js';
import { uploadWorld, setWorldFrame, setMover, moverVelocityInPlant, MOVER_SLOTS } from '../src/game/plantworld.js';
import { threePosToSim, simPosToThree } from '../src/render/frame.js';
import { createTrack, createElement, normalize } from '../src/trackbuilder/model.js';
import { placeDocument } from '../src/maps/built/place.js';
import { freestyleReport } from '../src/trackbuilder/warnings.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const only = (args.find((a) => a.startsWith('--only=')) || '').split('=')[1] || '';

let failures = 0;
function check(name, ok, detail = '') {
  if (ok) {
    console.log(`  PASS  ${name}${detail ? `: ${detail}` : ''}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? `: ${detail}` : ''}`);
  }
  return ok;
}
function note(text) {
  console.log(`  note  ${text}`);
}
const r3 = (v) => Math.round(v * 1000) / 1000;

/* The slab the sails turn in, src/props/windmill.js SLAB, and the stock's
 * width, read back off the sweep part and the shape rather than restated. */
const FOOT_MIN = 2.0;
const CAP_CLEAR = 0.5;
/* The five inch's reach from its CG, props, lens and hull: src/native/world.c. */
const CRAFT_REACH = 0.23;
const EDGE = STRIP / 2 + 1e-9;

/* A small seeded random, so a failure names a sample that comes back. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function windmillEl(dims) {
  return { id: 'w', type: 'windmill', position: { x: 0, y: 0, z: 0 }, yaw: 0, dims: { ...PROPS.windmill.dims, ...dims } };
}

/* A map with one windmill at `yaw`, and whatever else `more` adds. */
function millDoc(yaw, dims = {}, more = null) {
  const doc = createTrack('Windmill check', 'full', 'freestyle');
  doc.field.width = 120;
  doc.field.depth = 120;
  const pads = createElement(doc, 'startPads', { x: 10, y: 10, z: 0 }, 0);
  doc.elements.push(pads);
  const el = createElement(doc, 'windmill', { x: 60, y: 60, z: 0 }, yaw);
  Object.assign(el.dims, dims);
  doc.elements.push(el);
  if (more) {
    more(doc, el);
  }
  return normalize(doc).doc;
}

/* The rotor's frame to the world: q along the axis from the slab's middle,
 * h to the right of somebody facing the sails, y up from the hub. */
function rotorToWorld(m, q, h, y) {
  const z = -h;
  return [m.X + q * m.c + z * m.s, m.Y + y, m.Z - q * m.s + z * m.c];
}
function worldToRotor(m, x, y, z) {
  const dx = x - m.X;
  const dz = z - m.Z;
  return [dx * m.c - dz * m.s, -(dx * m.s + dz * m.c), y - m.Y];
}

/* The sails' exact rectangles in (h, y) at angle a: point (h, y) in sail k
 * is at u = h c + y s, v = -h s + y c with (c, s) the sail's. */
function inSail(shape, a, h, y) {
  const sw = 0.15;
  for (let k = 0; k < 4; k += 1) {
    const c = Math.cos(a + (k * Math.PI) / 2);
    const s = Math.sin(a + (k * Math.PI) / 2);
    const u = h * c + y * s;
    const v = -h * s + y * c;
    if ((u >= 0 && u <= shape.r0 && v >= -sw && v <= sw) || (u >= shape.r0 && u <= shape.R && v >= shape.vLo && v <= shape.vHi)) {
      return true;
    }
  }
  return false;
}
function sailDist(shape, a, h, y) {
  const sw = 0.15;
  let best = Infinity;
  for (let k = 0; k < 4; k += 1) {
    const c = Math.cos(a + (k * Math.PI) / 2);
    const s = Math.sin(a + (k * Math.PI) / 2);
    const u = h * c + y * s;
    const v = -h * s + y * c;
    for (const r of [[0, shape.r0, -sw, sw], [shape.r0, shape.R, shape.vLo, shape.vHi]]) {
      const du = u < r[0] ? r[0] - u : (u > r[1] ? u - r[1] : 0);
      const dv = v < r[2] ? r[2] - v : (v > r[3] ? v - r[3] : 0);
      best = Math.min(best, Math.hypot(du, dv));
    }
  }
  return best;
}

/* ------------------------------------------------------------------ */

function cornerSets() {
  const L = PROPS.windmill.limits;
  const sets = [{ ...PROPS.windmill.dims }];
  for (const height of [L.height[0], 11, 14, 20, L.height[1]]) {
    for (const sail of [L.sail[0], 7, 10, 13, L.sail[1]]) {
      for (const spin of [0, 0.37, 1]) {
        sets.push({ height, sail, speed: 12, spin });
      }
    }
  }
  return sets;
}

function shapeBlock() {
  console.log('\nshape: what a windmill promises, on its solids');
  const sets = cornerSets();
  let foot = Infinity;
  let tower = Infinity;
  let cap = Infinity;
  let over = Infinity;
  let sweepBad = 0;
  let worst = '';
  for (const dims of sets) {
    const el = windmillEl(dims);
    const s = windmillShape(el);
    const parts = partsOf(el);
    foot = Math.min(foot, s.H - s.reach);
    /* The slab's back face against the front of the tower's solids at
     * every height the disc passes in front of, 5 cm apart: the tower is
     * upright capsules on its axis, so at height y one reaches forward by
     * its radius, less the drop over its round end. And the cap's front. */
    const sweep = parts.find((p) => p.sweep);
    const back = sweep ? sweep.lo[0] : -Infinity;
    const towerCaps = parts.filter((p) => p.t === 'cap' && p.solid && p.name === 'tower');
    for (let y = Math.max(0, s.H - s.reach); y <= s.H + s.reach; y += 0.05) {
      let front = -Infinity;
      for (const p of towerCaps) {
        const y0 = Math.min(p.a[1], p.b[1]);
        const y1 = Math.max(p.a[1], p.b[1]);
        const dy = y < y0 ? y0 - y : (y > y1 ? y - y1 : 0);
        if (dy < p.r) {
          front = Math.max(front, Math.max(p.a[0], p.b[0]) + Math.sqrt(p.r * p.r - dy * dy));
        }
      }
      if (back - front < tower) {
        tower = back - front;
        worst = `${JSON.stringify(dims)} at ${r3(y)} m`;
      }
    }
    for (const p of parts) {
      if (p.t === 'cap' && p.solid && p.name === 'cap') {
        cap = Math.min(cap, back - (Math.max(p.a[0], p.b[0]) + p.r));
      }
    }
    over = Math.min(over, approxHeight('windmill', dims, null) - (s.H + s.reach));
    if (!sweep || sweep.solid || sweep.draw || Math.abs(sweep.hi[1] - (s.H + s.reach)) > 1e-9
      || Math.abs(sweep.lo[1] - (s.H - s.reach)) > 1e-9 || Math.abs(sweep.hi[2] - s.reach) > 1e-9) {
      sweepBad += 1;
    }
  }
  check('the lowest sail corner is 2 m or more over the foot', foot >= FOOT_MIN - 1e-9, `${r3(foot)} m at the lowest, ${sets.length} dim sets`);
  check('the sails clear the tower by more than the gap rule', tower > GAP_MIN, `${r3(tower)} m at the closest (${worst})`);
  check('and the cap by half a metre', cap >= CAP_CLEAR, `${r3(cap)} m`);
  check('the builder’s height readout is over the highest tip', over >= 0, `${r3(over)} m to spare at the least`);
  check('the sweep part is the whole disc, neither drawn nor solid', sweepBad === 0, `${sweepBad} wrong`);
}

function angleBlock() {
  console.log('\nangle: rotorAngle');
  let range = 0;
  let start = 0;
  let rate = 0;
  let still = 0;
  for (const dims of [...cornerSets(), { speed: 30, spin: 0.9 }, { speed: 1, spin: 0.1 }, { speed: 0, spin: 0.4 }]) {
    const s = windmillShape(windmillEl(dims));
    const a0 = rotorAngle(s, 0);
    if (Math.abs(a0 - ((s.spin % 1) * Math.PI) / 2) > 1e-12) {
      start += 1;
    }
    for (const step of [0, 1, 999, 1234567, 86400000, 2 ** 40]) {
      const a = rotorAngle(s, step);
      if (!(a >= 0 && a < Math.PI / 2)) {
        range += 1;
      }
      const b = rotorAngle(s, step + 1000);
      const quarter = Math.PI / 2;
      const want = ((rotorRate(s) % quarter) + quarter) % quarter;
      const got = (((b - a) % quarter) + quarter) % quarter;
      const err = Math.min(Math.abs(got - want), quarter - Math.abs(got - want));
      if (err > 1e-6) {
        rate += 1;
      }
      if (s.rpm === 0 && a !== a0) {
        still += 1;
      }
    }
  }
  check('it stays in [0, pi/2) at any step, a day and 2^40 ms in included', range === 0, `${range} out`);
  check('it starts where Rotor puts it', start === 0, `${start} wrong`);
  check('it turns at the rate asked, over a second', rate === 0, `${rate} wrong`);
  check('and at 0 rpm it stands still', still === 0, `${still} moved`);
}

/* ------------------------------------------------------------------ */

function boxesOf(out, n, m) {
  const list = [];
  for (let k = 0; k < n; k += 1) {
    const o = k * SAIL_BOX_DOUBLES;
    const a = worldToRotor(m, out[o] - out[o + 3], out[o + 1] - out[o + 4], out[o + 2] - out[o + 5]);
    const b = worldToRotor(m, out[o] + out[o + 3], out[o + 1] + out[o + 4], out[o + 2] + out[o + 5]);
    const c = worldToRotor(m, out[o], out[o + 1], out[o + 2]);
    /* The velocity into the rotor's frame: a direction, so no hub. */
    const lvx = out[o + 6] * m.c - out[o + 8] * m.s;
    const lvz = out[o + 6] * m.s + out[o + 8] * m.c;
    list.push({
      q0: Math.min(a[0], b[0]), q1: Math.max(a[0], b[0]),
      h0: Math.min(a[1], b[1]), h1: Math.max(a[1], b[1]),
      y0: Math.min(a[2], b[2]), y1: Math.max(a[2], b[2]),
      hc: c[1], yc: c[2], vq: lvx, vh: -lvz, vy: out[o + 7],
    });
  }
  return list;
}

function boxesBlock() {
  console.log('\nboxes: seat() against the exact sails');
  for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const placed = placeDocument(millDoc(yaw, { speed: 17, spin: 0.21 }));
    const sails = sailsOf(placed, MOVER_SLOTS);
    const twin = sailsOf(placeDocument(millDoc(yaw, { speed: 17, spin: 0.21 })), MOVER_SLOTS);
    const m = sails.mills[0];
    const shape = m.shape;
    const half = (placed.items.find((it) => it.el.type === 'windmill').parts.find((p) => p.sweep).hi[0]
      - placed.items.find((it) => it.el.type === 'windmill').parts.find((p) => p.sweep).lo[0]) / 2;
    const out = new Float64Array(SAIL_SLOTS * SAIL_BOX_DOUBLES);
    const again = new Float64Array(SAIL_SLOTS * SAIL_BOX_DOUBLES);
    const rand = rng(7 + Math.round(yaw * 100));
    let samples = 0;
    let seated = 0;
    let uncovered = 0;
    let stray = 0;
    let slab = 0;
    let speed = 0;
    let bits = 0;
    let spilled = 0;
    let most = 0;
    let firstBad = '';
    for (let i = 0; i < 3000; i += 1) {
      const step = Math.floor(rand() * 1e8);
      const q = (rand() - 0.5) * 2 * (half + WINDOW);
      const h = (rand() - 0.5) * 2 * (shape.reach + 0.4);
      const y = (rand() - 0.5) * 2 * (shape.reach + 0.4);
      const [x, wy, z] = rotorToWorld(m, q, h, y);
      const n = sails.seat(step, x, wy, z, out);
      const n2 = twin.seat(step, x, wy, z, again);
      if (n !== n2 || out.subarray(0, n * SAIL_BOX_DOUBLES).some((v, k) => !Object.is(v, again[k]))) {
        bits += 1;
      }
      samples += 1;
      seated += n;
      most = Math.max(most, n);
      if (n >= SAIL_SLOTS) {
        spilled += 1;
      }
      const a = rotorAngle(shape, step);
      const boxes = boxesOf(out, n, m);
      const rate = rotorRate(shape);
      boxes.forEach((b, k) => {
        if (Math.abs(b.q0 + half) > 1e-9 || Math.abs(b.q1 - half) > 1e-9) {
          slab += 1;
        }
        if (Math.abs(b.vq) > 1e-9 || Math.abs(b.vh + rate * b.yc) > 1e-9 || Math.abs(b.vy - rate * b.hc) > 1e-9) {
          speed += 1;
        }
        if (n >= SAIL_SLOTS && k === n - 1) {
          return;
        }
        for (const [ch, cy] of [[b.h0, b.y0], [b.h0, b.y1], [b.h1, b.y0], [b.h1, b.y1]]) {
          if (sailDist(shape, a, ch, cy) > EDGE) {
            stray += 1;
            firstBad = firstBad || `stray corner at step ${step}, craft (${r3(q)}, ${r3(h)}, ${r3(y)})`;
          }
        }
      });
      /* Every point of a sail the craft can reach, on a 2 cm grid. */
      const dq = Math.max(0, Math.abs(q) - half);
      if (dq >= CRAFT_REACH) {
        continue;
      }
      const rr = Math.sqrt(CRAFT_REACH * CRAFT_REACH - dq * dq);
      for (let ph = h - rr; ph <= h + rr; ph += 0.02) {
        for (let py = y - rr; py <= y + rr; py += 0.02) {
          if ((ph - h) ** 2 + (py - y) ** 2 > rr * rr || !inSail(shape, a, ph, py)) {
            continue;
          }
          if (!boxes.some((b) => ph >= b.h0 - EDGE && ph <= b.h1 + EDGE && py >= b.y0 - EDGE && py <= b.y1 + EDGE)) {
            uncovered += 1;
            firstBad = firstBad || `uncovered (${r3(ph)}, ${r3(py)}) at step ${step}, craft (${r3(q)}, ${r3(h)}, ${r3(y)})`;
          }
        }
      }
    }
    const tag = `heading ${r3(yaw)}`;
    check(`${tag}: every point of a sail within the craft's reach is in a box, to STRIP / 2`, uncovered === 0,
      `${uncovered} points uncovered in ${samples} samples${firstBad ? `, ${firstBad}` : ''}`);
    check(`${tag}: no box strays more than STRIP / 2 from a sail`, stray === 0, `${stray} corners, ${seated} boxes`);
    check(`${tag}: every box spans the slab`, slab === 0, `${slab} wrong, half depth ${r3(half)} m`);
    check(`${tag}: every box carries the sail's velocity at its middle`, speed === 0, `${speed} wrong`);
    check(`${tag}: the same call, and a second sailsOf, give the same bits`, bits === 0, `${bits} differ`);
    check(`${tag}: no random sample filled the slots`, spilled === 0, `the most was ${most} of ${SAIL_SLOTS}`);
    /* The craft on the axis, where the four stocks meet, round a turn. */
    const hub = rotorToWorld(m, 0, 0, 0);
    let atHub = 0;
    for (let step = 0; step < 6000; step += 7) {
      atHub = Math.max(atHub, sails.seat(step, hub[0], hub[1], hub[2], out));
    }
    check(`${tag}: at the hub, where four stocks meet, fewer boxes than slots`, atHub < SAIL_SLOTS, `${atHub} of ${SAIL_SLOTS}`);
  }
  const none = createTrack('No windmill', 'full', 'freestyle');
  check('a map with no windmill takes no slots and seats nothing', sailSlotsFor(none) === 0
    && sailsOf(placeDocument(normalize(none).doc), MOVER_SLOTS) === null && sailSlotsFor(millDoc(0)) === SAIL_SLOTS);
}

/* ------------------------------------------------------------------ */

function warningBlock() {
  console.log('\nwarning: fs-sails');
  const at = (local) => (doc, mill) => {
    const s = windmillShape(mill);
    const b = createElement(doc, 'building', { x: 0, y: 0, z: 0 }, 0);
    Object.assign(b.dims, { width: 4, depth: 4, floors: 3 });
    b.position.x = mill.position.x + local(s)[0];
    b.position.y = mill.position.y - local(s)[1];
    doc.elements.push(b);
  };
  const codes = (doc) => freestyleReport(doc).warnings.filter((w) => w.code === 'fs-sails');
  const inDisc = codes(millDoc(0, {}, at((s) => [s.xb, 6])));
  check('a building standing in the disc is named', inDisc.length === 1, inDisc.map((w) => w.message).join(' | ') || 'none');
  const turned = codes(millDoc(Math.PI / 2, {}, (doc, mill) => {
    const s = windmillShape(mill);
    const b = createElement(doc, 'building', { x: 0, y: 0, z: 0 }, 0);
    Object.assign(b.dims, { width: 4, depth: 4, floors: 3 });
    /* A quarter turn left: the heading is plan +y, the right is plan +x. */
    b.position.x = mill.position.x + 6;
    b.position.y = mill.position.y + s.xb;
    doc.elements.push(b);
  }));
  check('and at a quarter turn', turned.length === 1, turned.map((w) => w.message).join(' | ') || 'none');
  const wide = codes(millDoc(0, {}, at((s) => [s.xb, s.reach + 3])));
  check('one beside the disc, past the tips, is not', wide.length === 0, wide.map((w) => w.message).join(' | ') || 'none');
  const behind = codes(millDoc(0, {}, at(() => [-9, 0])));
  check('nor is one behind the tower', behind.length === 0, behind.map((w) => w.message).join(' | ') || 'none');
}

/* ------------------------------------------------------------------ */

const REST = 0.033;
const HOVER = 0.27;
const ST = { X: 1, Y: 2, Z: 3, VX: 4, VY: 5, VZ: 6, QX: 8, QY: 9 };
let WASM = null;
let CONFIG = null;

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
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
function upZ(st) {
  return 1 - 2 * (st[ST.QX] * st[ST.QX] + st[ST.QY] * st[ST.QY]);
}
/* scripts/world-check.js's height hold, unchanged. */
function heightHold(ctx, st, z) {
  const e = z - st[ST.Z];
  ctx.i = clamp(ctx.i + e * 0.004 * 0.4, -0.3, 0.3);
  const u = upZ(st);
  return clamp((HOVER + 0.15 * e - 0.1 * st[ST.VZ] + ctx.i) / (u > 0.5 ? u : 0.5), 0, 1);
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

/* The shell's plant frame (src/main.js seatWorldFrame): its start, its yaw,
 * and the yaw's sine and cosine from src/props/trig.js, as frameTurn. */
function frameOf(sx, sy, sz, yaw) {
  const o = threePosToSim(sx, sy, sz, { x: 0, y: 0, z: 0 });
  return { sx, sy, sz, yaw, turn: sincos(yaw, { s: 0, c: 1 }), o: [o.x, o.y, o.z + REST] };
}
function toPlant(f, X, Y, Z) {
  const w = threePosToSim(X, Y, Z, { x: 0, y: 0, z: 0 });
  const dx = w.x - f.o[0];
  const dy = w.y - f.o[1];
  return [f.turn.c * dx + f.turn.s * dy, -f.turn.s * dx + f.turn.c * dy, w.z - f.o[2]];
}

/*
 * src/main.js pushSails, restated: main.js runs in a browser and cannot be
 * imported. The craft's state into the world through frameTurn and the
 * start, sailsOf's seat, setMover for every box and a park for every slot
 * the last step used and this one does not.
 */
const T3 = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } };
function pushSails(sim, sails, f, step, st, boxes, used) {
  const px = st[1];
  const py = st[2];
  simPosToThree(f.turn.c * px - f.turn.s * py, f.turn.s * px + f.turn.c * py, st[3] + REST, T3);
  const n = sails.seat(step, T3.x + f.sx, T3.y + f.sy, T3.z + f.sz, boxes);
  for (let k = 0; k < n; k += 1) {
    const o = k * SAIL_BOX_DOUBLES;
    setMover(sim, sails.base + k, boxes[o], boxes[o + 1], boxes[o + 2], boxes[o + 3], boxes[o + 4], boxes[o + 5],
      boxes[o + 6], boxes[o + 7], boxes[o + 8], 'boom', true);
  }
  for (let k = n; k < used; k += 1) {
    setMover(sim, sails.base + k, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'boom', false);
  }
  return n;
}

/*
 * src/main.js sailVelocity, restated: the velocity pushSails seated on the
 * mover the report names, in the plant frame, for the crash bounce's surf.
 */
const SURF = new Float64Array(3);
function sailVelocity(sails, f, boxes, used, idx) {
  if (!(idx <= -2)) {
    return null;
  }
  const k = -2 - idx - sails.base;
  if (k < 0 || k >= used) {
    return null;
  }
  const o = k * SAIL_BOX_DOUBLES;
  return moverVelocityInPlant(boxes[o + 6], boxes[o + 7], boxes[o + 8], f.turn.c, f.turn.s, SURF);
}

/* The craft's world position and velocity from its state, as the shell has
 * them, for the judging below (not for the physics). */
function craftWorld(f, st) {
  const c = f.turn.c;
  const s = f.turn.s;
  const p = simPosToThree(c * st[1] - s * st[2], s * st[1] + c * st[2], st[3] + REST, { x: 0, y: 0, z: 0, set: T3.set });
  const v = simPosToThree(c * st[4] - s * st[5], s * st[4] + c * st[5], st[6], { x: 0, y: 0, z: 0, set: T3.set });
  return { x: p.x + f.sx, y: p.y + f.sy, z: p.z + f.sz, vx: v.x, vy: v.y, vz: v.z };
}

/*
 * Hover at rotor point (q, h, y) of the map's windmill for `ms`, with the
 * sails seated every step (`seat` false leaves the movers empty) and the
 * shell's crash bounce put on every step its judge calls (src/main.js's
 * step loop: a crash or a knock, then putDullBounce, on a 16 step frame).
 * Returns the first contact, its shape, the drawn sail's distance from the
 * CG at every step up to it, the steps that bounced, the craft's speed
 * along the sail's turn the step after the first contact and 60 ms on,
 * the sail's own speed there, and a hash of every state block and report.
 */
async function hover(world, f, rq, ms, seat = true) {
  const { sails, colliders } = world;
  const m = sails.mills[0];
  const sim = await newSim();
  uploadWorld(sim, colliders);
  setWorldFrame(sim, f.sx, f.sy, f.sz, f.yaw, REST);
  const at = rotorToWorld(m, rq[0], rq[1], rq[2]);
  const p = toPlant(f, at[0], at[1], at[2]);
  call(sim, 'sim_set_pose', p[0], p[1], p[2], 1, 0, 0, 0);
  call(sim, 'sim_rest');
  sim.setAngleMode(true);
  const ground = toPlant(f, at[0], 0, at[2])[2];
  const ctx = { i: 0 };
  const rep = new Float64Array(11);
  const repPtr = sim.e.malloc(11 * 8);
  const boxes = new Float64Array(SAIL_SLOTS * SAIL_BOX_DOUBLES);
  const hash = createHash('sha256');
  const judge = new CrashJudge();
  judge.seat(f.turn.c, f.turn.s);
  const out = new Float64Array(3);
  let used = 0;
  let st = sim.readState().state;
  const res = { t0: -1, shape: 0, gaps: [], across: null, off: null, sail: null, bounces: [], nearest: Infinity, most: 0, seatMs: 0 };
  /* Along the way the sail turns at the craft, anticlockwise: (-y, h) / r. */
  const along = (lr) => {
    const v = craftWorld(f, st);
    const lv = worldToRotor({ X: 0, Y: 0, Z: 0, c: m.c, s: m.s }, v.vx, v.vy, v.vz);
    const r = Math.hypot(lr[1], lr[2]) || 1;
    return (lv[1] * -lr[2] + lv[2] * lr[1]) / r;
  };
  for (let step = 0; step < ms; step += 1) {
    if (step % 16 === 0) {
      judge.beginFrame();
    }
    if (step % 4 === 0) {
      sim.input(step / 1000, 0, 0, 0, heightHold(ctx, st, p[2]));
    }
    call(sim, 'sim_set_ground', 1, 0, 0, 1, 0, 0, ground, GROUND_MU, GROUND_E);
    const w = craftWorld(f, st);
    if (res.t0 < 0) {
      res.gaps.push(sails.gapAt(w.x, w.y, w.z, 5, step));
    }
    const lr = worldToRotor(m, w.x, w.y, w.z);
    res.nearest = Math.min(res.nearest, sails.gapAt(w.x, w.y, w.z, 5, step));
    if (seat) {
      const t = performance.now();
      used = pushSails(sim, sails, f, step, st, boxes, used);
      res.seatMs += performance.now() - t;
      res.most = Math.max(res.most, used);
    }
    const before = st;
    sim.step(1);
    st = sim.readState().state;
    call(sim, 'sim_world_report', repPtr);
    rep.set(new Float64Array(sim.e.memory.buffer, repPtr, 11));
    const crashed = judge.step(before, st, sim.e.sim_ground_contacts(), rep, step + 1, true);
    if (crashed || judge.knock(rep, st)) {
      const kind = crashed ? judge.stepKind : 'solid';
      if (putDullBounce(sim, kind, before, st, rep, 0, 0, 1, f.turn.c, f.turn.s, out, !crashed,
        sailVelocity(sails, f, boxes, used, rep[3]))) {
        st = sim.readState().state;
        res.bounces.push(step);
      }
    }
    hash.update(sim.readStateBytes().bytes);
    hash.update(Buffer.from(rep.buffer));
    if (rep[0] > 0 && res.t0 < 0) {
      res.t0 = step;
      res.shape = rep[3];
      res.off = along(lr);
      res.sail = rotorRate(m.shape) * Math.hypot(lr[1], lr[2]);
    }
    if (res.t0 >= 0 && step === res.t0 + 60) {
      res.across = along(lr);
    }
    if (!Number.isFinite(st[1])) {
      throw new Error(`non-finite state at ${step} ms`);
    }
  }
  sim.e.free(repPtr);
  res.hash = hash.digest('hex');
  res.steps = ms;
  return res;
}

function worldOf(doc) {
  const placed = placeDocument(doc);
  const colliders = new Colliders();
  addSolids(colliders, placed.solids);
  colliders.build();
  return { placed, colliders, sails: sailsOf(placed, MOVER_SLOTS) };
}

async function physicsBlock() {
  console.log('\nphysics: the sails in the module, seated as the shell seats them');
  if (!existsSync(join(root, 'dist/sim.wasm'))) {
    check('dist/sim.wasm is built', false, 'no module to fly');
    return;
  }
  WASM = await readFile(join(root, 'dist/sim.wasm'));
  CONFIG = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');
  for (const yaw of [0, Math.PI / 2]) {
    const tag = `heading ${r3(yaw)}`;
    const world = worldOf(millDoc(yaw, { speed: 12, spin: 0.5 }));
    const m = world.sails.mills[0];
    const s = m.shape;
    /* The plant's frame turned from the map's and started off to one side,
     * as a map's pads would put it. */
    const f = frameOf(m.X - 7, 0, m.Z + 3, 0.7);
    /* Six metres under the hub, halfway between the sails at 225 and 315
     * degrees: the one at 225 comes round to it. */
    const gapPoint = [0, 0, -6];
    const hit = await hover(world, f, gapPoint, 1500);
    const base = world.sails.base;
    const slot = -2 - hit.shape;
    const coming = (Math.PI / 4 - Math.atan2(s.vHi, 6)) / rotorRate(s);
    check(`${tag}: a craft hovering in the gap is hit by the sail coming round`, hit.t0 >= 0 && slot >= base && slot < base + SAIL_SLOTS,
      hit.t0 >= 0 ? `at ${hit.t0} ms, mover slot ${slot}; the leading edge reaches its CG at ${Math.round(coming * 1000)} ms` : 'never touched');
    if (hit.t0 >= 0) {
      const d = hit.gaps[hit.t0];
      const clear = hit.gaps.slice(0, hit.t0).every((g) => g > 0);
      check(`${tag}: at the step the drawn sail reaches it`, clear && d <= CRAFT_REACH + STRIP / 2 && d >= 0,
        `the drawn sail ${r3(d)} m from the CG at contact; the craft reaches ${CRAFT_REACH} m, the boxes are within ${STRIP / 2} m of the drawing`);
      const early = hit.bounces.filter((b) => b >= hit.t0 && b < hit.t0 + 100);
      check(`${tag}: bounced off it once, not dragged along by it`, early.length >= 1 && early.length <= 2,
        `${early.length} bounce${early.length === 1 ? '' : 's'} in the 100 ms from the first contact`);
      check(`${tag}: and off at the sail's speed, a thud more at the most`,
        hit.off >= hit.sail && hit.off <= hit.sail + DULL_OUT_MAX + 0.05,
        `${r3(hit.off)} m/s along the sail's turn the step after, the sail ${r3(hit.sail)} m/s there`);
      check(`${tag}: and still going the way the sail goes`, hit.across !== null && hit.across > 0.5, `${r3(hit.across)} m/s along the sail's turn, 60 ms on`);
    }
    const twice = await hover(world, f, gapPoint, 1500);
    check(`${tag}: the same flight twice is the same to the bit`, twice.hash === hit.hash, `${hit.hash.slice(0, 16)}`);
    const stoppedWorld = worldOf(millDoc(yaw, { speed: 0, spin: 0.5 }));
    const stopped = await hover(stoppedWorld, f, gapPoint, 1500);
    check(`${tag}: with the sails stopped the gap stays open`, stopped.t0 < 0,
      stopped.t0 < 0 ? `untouched over 1.5 s, ${r3(stopped.nearest)} m from the nearest sail` : `touched at ${stopped.t0} ms, shape ${stopped.shape}`);
    const bare = await hover(world, f, gapPoint, 1500, false);
    check(`${tag}: and with the sails never seated nothing else is there`, bare.t0 < 0,
      bare.t0 < 0 ? 'untouched: the hit above was a sail' : `touched at ${bare.t0} ms, shape ${bare.shape}`);
    const tips = await hover(world, f, [0, 0, -(s.reach + 0.45)], 3000);
    check(`${tag}: a craft hovering just past the tips is never touched`, tips.t0 < 0,
      tips.t0 < 0 ? `3 s, every sail by, ${r3(tips.nearest)} m from the nearest at the closest` : `touched at ${tips.t0} ms`);
    const front = await hover(world, f, [0.2 + 0.35, 0, -6], 3000);
    check(`${tag}: and one hovering just in front of the sails`, front.t0 < 0,
      front.t0 < 0 ? `3 s, ${r3(front.nearest)} m from the nearest at the closest, ${front.most} boxes at the most` : `touched at ${front.t0} ms`);
    note(`${tag}: seating the sails in the flights above: ${r3((1000 * front.seatMs) / front.steps)} us a step in front of them, `
      + `${r3((1000 * tips.seatMs) / tips.steps)} us past the tips, setMover included`);
  }
}

/* ------------------------------------------------------------------ */

function costBlock() {
  console.log('\ncost: seat() a step');
  const placed = placeDocument(millDoc(0));
  const sails = sailsOf(placed, MOVER_SLOTS);
  const m = sails.mills[0];
  const out = new Float64Array(SAIL_SLOTS * SAIL_BOX_DOUBLES);
  const time = (n, at) => {
    const t = performance.now();
    let k = 0;
    for (let i = 0; i < n; i += 1) {
      k += sails.seat(i, at[0], at[1], at[2], out);
    }
    return { us: ((performance.now() - t) * 1000) / n, k: k / n };
  };
  const far = rotorToWorld(m, 30, 0, 0);
  const near = rotorToWorld(m, 0, 0.3, -6);
  time(200000, far);
  time(20000, near);
  const a = time(1000000, far);
  const b = time(100000, near);
  note(`far from the sails: ${r3(a.us)} us a step, ${r3(a.k)} boxes; in them: ${r3(b.us)} us a step, ${r3(b.k)} boxes on average`);
}

/* ------------------------------------------------------------------ */

const blocks = { shape: shapeBlock, angle: angleBlock, boxes: boxesBlock, warning: warningBlock, physics: physicsBlock, cost: costBlock };
for (const [name, fn] of Object.entries(blocks)) {
  if (!only || only === name) {
    await fn();
  }
}
console.log(failures ? `\nwindmill-check: ${failures} FAILED` : '\nwindmill-check: all passed');
process.exitCode = failures;
