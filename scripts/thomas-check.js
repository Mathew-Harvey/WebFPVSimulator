/*
 * thomas-check.js: Thomas More in his shop, solid, held to his drawing and
 * flown into in the real physics module.
 *
 * WHY THIS EXISTS. The owner, 18 November 2026: "Make Thomas say sorry every
 * time you hit him, also make him solid, so he is a collision". He is the
 * second thing on a map that walks about by itself and that a craft can hit,
 * after a windmill's sails, and he goes into the physics module the same way:
 * seated every step by src/main.js pushSails from src/maps/warehouse/thomas.js
 * thomasSolid. scripts/warehouse-check.js walks his route clear of the shop's
 * furniture; this holds what makes him a solid, in plain Node:
 *
 *   pure      everything the physics reads (the table's times, thomasSpot,
 *             thomasSolid) is free of JS's sine, cosine, arc tangent, hypot
 *             and power, which engines do not do to the same bit; the table
 *             is the pinned one, so a change to his day is a change somebody
 *             meant; the drawing stands him where thomasSpot does to the bit;
 *             his head and hips are inside his boxes all day; seat() twice is
 *             the same bits and its velocity is his walk's
 *   physics   the module, seated as src/main.js seats it: a craft hovering in
 *             his path is hit by him at the step the drawn boxes reach it,
 *             reported as one of his mover slots, never ends up inside him,
 *             and the same flight twice is the same to the bit; the same hover
 *             with him never seated touches nothing; and one hovering beside
 *             his path is never touched
 *
 * The sorry is the drawing's (thomasdraw.js), which needs three.js and a page,
 * and is seen in the thread's pictures, not here.
 *
 * Usage: node scripts/thomas-check.js [--only=pure|physics]
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

import { loadSim, SIM_OK, simErrorName } from '../tests/lib/simmod.js';
import { sincos } from '../src/props/trig.js';
import { Colliders, CrashJudge, putDullBounce } from '../src/game/collide.js';
import { uploadWorld, setWorldFrame, setMover, moverVelocityInPlant, MOVER_SLOTS } from '../src/game/plantworld.js';
import { threePosToSim, simPosToThree } from '../src/render/frame.js';
import { FRAME } from '../src/maps/warehouse/warehouse.js';
import {
  THOMAS_PERIOD_MS, THOMAS_PHASES, THOMAS_BOXES, THOMAS_BOX_DOUBLES, THOMAS_FLOOR,
  thomasSpot, thomasSolid, thomasAt, thomasPose, thomasBones, BONE, BONES,
} from '../src/maps/warehouse/thomas.js';

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
const r3 = (v) => Math.round(v * 1000) / 1000;
const { OX, OZ, S } = FRAME;
const BASE = MOVER_SLOTS - THOMAS_BOXES.length;

/* His table as it was when he was made solid, 18 November 2026: its length
 * and a hash of every phase's times and places. */
const PIN = { period: 584706, phases: 160, hash: '7c61862e655fbf36' };

/* ------------------------------------------------------------------ */

/* The text of one top level function or const arrow in thomas.js. */
function sourceOf(src, head) {
  const i = src.indexOf(head);
  if (i < 0) {
    return null;
  }
  let depth = 0;
  let open = false;
  for (let k = i; k < src.length; k += 1) {
    const ch = src[k];
    if (ch === '{') {
      depth += 1;
      open = true;
    } else if (ch === '}') {
      depth -= 1;
      if (open && depth === 0) {
        return src.slice(i, k + 1);
      }
    }
  }
  return null;
}

async function pureBlock() {
  console.log('\npure: what the physics reads of him');
  const src = await readFile(join(root, 'src/maps/warehouse/thomas.js'), 'utf8');
  const BAD = /Math\.(sin|cos|tan|asin|acos|atan|atan2|hypot|pow|exp|expm1|log|log1p|log2|log10|cbrt|sinh|cosh|tanh)\b/;
  for (const head of ['const turnMs', '(function buildTable', 'export function thomasSpot', 'export function thomasSolid']) {
    const text = sourceOf(src, head);
    const m = text ? text.match(BAD) : null;
    check(`${head.replace(/^\(|export /g, '')} uses no engine dependent maths`, Boolean(text) && !m,
      !text ? 'not found' : (m ? m[0] : `${text.split('\n').length} lines`));
  }

  const h = createHash('sha256');
  for (const p of THOMAS_PHASES) {
    h.update(JSON.stringify([p.kind, p.t0, p.t1, p.at || null, p.from || null, p.to || null, p.len || 0, p.vx || 0, p.vy || 0]));
  }
  const hash = h.digest('hex').slice(0, 16);
  check('his day is the pinned one', THOMAS_PERIOD_MS === PIN.period && THOMAS_PHASES.length === PIN.phases && hash === PIN.hash,
    `${THOMAS_PHASES.length} phases over ${THOMAS_PERIOD_MS} ms, ${hash}`);

  const pose = thomasPose();
  const spot = { x: 0, y: 0, vx: 0, vy: 0 };
  const M = new Float64Array(BONES.length * 12);
  let same = true;
  let worstHead = 0;
  let worstHip = 0;
  let outOf = null;
  for (let T = 0; T < THOMAS_PERIOD_MS; T += 97) {
    thomasSpot(T, spot);
    thomasAt(T, null, 0, false, pose);
    if (pose.x !== spot.x || pose.y !== spot.y) {
      same = false;
    }
    thomasBones(pose, M);
    for (const [bone, box, worst] of [[BONE.head, THOMAS_BOXES[1], 'head'], [BONE.pelvis, THOMAS_BOXES[0], 'hip']]) {
      const o = bone * 12;
      const r = Math.sqrt(M[o + 9] * M[o + 9] + M[o + 11] * M[o + 11]);
      const y = M[o + 10];
      const top = bone === BONE.head ? y + 0.375 : y;
      const inside = r <= box.half && y >= box.y0 && top <= box.y1;
      if (worst === 'head') {
        worstHead = Math.max(worstHead, r);
      } else {
        worstHip = Math.max(worstHip, r);
      }
      if (!inside && !outOf) {
        outOf = `${worst} at ${T} ms: ${r3(r)} m off his axis, ${r3(y)} to ${r3(top)} m up`;
      }
    }
  }
  check('he is drawn where he is solid, to the bit', same, 'thomasAt and thomasSpot every 97 ms of his day');
  check('his head and hips are inside his boxes all day', !outOf,
    outOf || `head at most ${r3(worstHead)} m off his axis (box ${THOMAS_BOXES[1].half}), hips ${r3(worstHip)} (box ${THOMAS_BOXES[0].half})`);
  check('his body box stands on the floor', THOMAS_BOXES[0].y0 === THOMAS_FLOOR, `${THOMAS_BOXES[0].y0} m`);

  const sol = thomasSolid(FRAME, BASE);
  const a = new Float64Array(2 * THOMAS_BOX_DOUBLES);
  const b = new Float64Array(2 * THOMAS_BOX_DOUBLES);
  let bits = true;
  let speed = true;
  let walks = 0;
  for (const ph of THOMAS_PHASES) {
    const T = (ph.t0 + ph.t1) >> 1;
    sol.seat(T, 0, 0, 0, a);
    sol.seat(T, 9, 9, 9, b);
    if (Buffer.compare(Buffer.from(a.buffer), Buffer.from(b.buffer)) !== 0) {
      bits = false;
    }
    if (ph.kind === 'walk') {
      walks += 1;
      sol.seat(T + 1, 0, 0, 0, b);
      const vx = (b[0] - a[0]) * 1000;
      const vz = (b[2] - a[2]) * 1000;
      if (Math.abs(vx - a[6]) > 1e-6 || Math.abs(vz - a[8]) > 1e-6) {
        speed = false;
      }
    }
  }
  check('seat() is the same bits wherever the craft is', bits, `${THOMAS_PHASES.length} phases`);
  check('and its velocity is his walk\'s', speed, `${walks} walks, the box's move over 1 ms against the velocity seated`);
  check('his slots are the top two', sol.base === MOVER_SLOTS - 2 && sol.slots === 2, `${sol.base} and ${sol.base + 1}`);
}

/* ------------------------------------------------------------------ */
/* The module, as scripts/windmill-check.js drives it                   */
/* ------------------------------------------------------------------ */

const REST = 0.033;
const HOVER = 0.27;
const ST = { X: 1, Y: 2, Z: 3, VX: 4, VY: 5, VZ: 6, QX: 8, QY: 9 };
/* The five inch's reach from its CG, props, lens and hull: src/native/world.c. */
const CRAFT_REACH = 0.23;
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
const T3 = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } };
/* src/main.js pushSails, restated, for his slots. */
function pushThomas(sim, sol, f, step, st, boxes, used) {
  const px = st[1];
  const py = st[2];
  simPosToThree(f.turn.c * px - f.turn.s * py, f.turn.s * px + f.turn.c * py, st[3] + REST, T3);
  const n = sol.seat(step, T3.x + f.sx, T3.y + f.sy, T3.z + f.sz, boxes);
  for (let k = 0; k < n; k += 1) {
    const o = k * THOMAS_BOX_DOUBLES;
    setMover(sim, sol.base + k, boxes[o], boxes[o + 1], boxes[o + 2], boxes[o + 3], boxes[o + 4], boxes[o + 5],
      boxes[o + 6], boxes[o + 7], boxes[o + 8], 'boom', true);
  }
  for (let k = n; k < used; k += 1) {
    setMover(sim, sol.base + k, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'boom', false);
  }
  return n;
}
const SURF = new Float64Array(3);
function boxVelocity(sol, f, boxes, used, idx) {
  if (!(idx <= -2)) {
    return null;
  }
  const k = -2 - idx - sol.base;
  if (k < 0 || k >= used) {
    return null;
  }
  const o = k * THOMAS_BOX_DOUBLES;
  return moverVelocityInPlant(boxes[o + 6], boxes[o + 7], boxes[o + 8], f.turn.c, f.turn.s, SURF);
}
function craftWorld(f, st) {
  const c = f.turn.c;
  const s = f.turn.s;
  const p = simPosToThree(c * st[1] - s * st[2], s * st[1] + c * st[2], st[3] + REST, { x: 0, y: 0, z: 0, set: T3.set });
  return { x: p.x + f.sx, y: p.y + f.sy, z: p.z + f.sz };
}

/*
 * Hover at world (X, Y, Z) for `ms` from his clock T0, with him seated every
 * step (`seat` false never seats him), the shell's crash bounce on every
 * step its judge calls. Returns the first contact, its shape, his distance
 * from the CG every step, and a hash of every state block and report.
 */
async function hover(f, at, T0, ms, seat = true) {
  const sol = thomasSolid(FRAME, BASE);
  const colliders = new Colliders();
  colliders.build();
  const sim = await newSim();
  uploadWorld(sim, colliders);
  setWorldFrame(sim, f.sx, f.sy, f.sz, f.yaw, REST);
  const p = toPlant(f, at[0], at[1], at[2]);
  call(sim, 'sim_set_pose', p[0], p[1], p[2], 1, 0, 0, 0);
  call(sim, 'sim_rest');
  sim.setAngleMode(true);
  const ground = toPlant(f, at[0], S * THOMAS_FLOOR, at[2])[2];
  const ctx = { i: 0 };
  const rep = new Float64Array(11);
  const repPtr = sim.e.malloc(11 * 8);
  const boxes = new Float64Array(THOMAS_BOXES.length * THOMAS_BOX_DOUBLES);
  const hash = createHash('sha256');
  const judge = new CrashJudge();
  judge.seat(f.turn.c, f.turn.s);
  const out = new Float64Array(3);
  let used = 0;
  let st = sim.readState().state;
  const res = { t0: -1, shape: 0, gaps: [], inside: 0, nearest: Infinity };
  for (let step = 0; step < ms; step += 1) {
    const T = T0 + step;
    if (step % 16 === 0) {
      judge.beginFrame();
    }
    if (step % 4 === 0) {
      sim.input(step / 1000, 0, 0, 0, heightHold(ctx, st, p[2]));
    }
    call(sim, 'sim_set_ground', 1, 0, 0, 1, 0, 0, ground, 0.6, 0.1);
    const w = craftWorld(f, st);
    const g = sol.gapAt(w.x, w.y, w.z, 50, T);
    res.gaps.push(g);
    res.nearest = Math.min(res.nearest, g);
    if (res.t0 >= 0 && g === 0) {
      res.inside += 1;
    }
    if (seat) {
      used = pushThomas(sim, sol, f, T, st, boxes, used);
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
        boxVelocity(sol, f, boxes, used, rep[3]))) {
        st = sim.readState().state;
      }
    }
    hash.update(sim.readStateBytes().bytes);
    hash.update(Buffer.from(rep.buffer));
    if (rep[0] > 0 && res.t0 < 0) {
      res.t0 = step;
      res.shape = rep[3];
    }
    if (!Number.isFinite(st[1])) {
      throw new Error(`non-finite state at ${step} ms`);
    }
  }
  sim.e.free(repPtr);
  res.hash = hash.digest('hex');
  return res;
}

async function physicsBlock() {
  console.log('\nphysics: Thomas in the module, seated as the shell seats him');
  if (!existsSync(join(root, 'dist/sim.wasm'))) {
    check('dist/sim.wasm is built', false, 'no module to fly');
    return;
  }
  WASM = await readFile(join(root, 'dist/sim.wasm'));
  CONFIG = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');
  /* His first long walk, and a point on it 1.6 m ahead of him half a second
   * in, at his chest. */
  const walk = THOMAS_PHASES.find((ph) => ph.kind === 'walk' && ph.len > 3);
  const T0 = walk.t0 + 500;
  const sp = { x: 0, y: 0, vx: 0, vy: 0 };
  thomasSpot(T0, sp);
  const ux = walk.vx / Math.sqrt(walk.vx * walk.vx + walk.vy * walk.vy);
  const uy = walk.vy / Math.sqrt(walk.vx * walk.vx + walk.vy * walk.vy);
  const ahead = [sp.x + ux * 1.6, sp.y + uy * 1.6];
  const at = [OX + S * ahead[0], S * 1.1, OZ - S * ahead[1]];
  /* The plant's frame turned from the map's and started off to one side. */
  const f = frameOf(at[0] - 7, 0, at[2] + 3, 0.7);
  const ms = 2500;
  const hit = await hover(f, at, T0, ms);
  const slot = -2 - hit.shape;
  check('a craft hovering in his path is hit by him', hit.t0 >= 0 && slot >= BASE && slot < MOVER_SLOTS,
    hit.t0 >= 0 ? `at ${hit.t0} ms, mover slot ${slot}` : 'never touched');
  if (hit.t0 >= 0) {
    const d = hit.gaps[hit.t0];
    const clear = hit.gaps.slice(0, hit.t0).every((g) => g > 0);
    check('at the step the drawn Thomas reaches it', clear && d >= 0 && d <= CRAFT_REACH + 0.02,
      `his boxes ${r3(d)} m from the CG at contact; the craft reaches ${CRAFT_REACH} m`);
    check('and the craft never ends up inside him', hit.inside === 0, `${hit.inside} steps with the CG inside a box`);
  }
  const twice = await hover(f, at, T0, ms);
  check('the same flight twice is the same to the bit', twice.hash === hit.hash, hit.hash.slice(0, 16));
  const bare = await hover(f, at, T0, ms, false);
  check('with him never seated nothing is there', bare.t0 < 0,
    bare.t0 < 0 ? 'untouched: the hit above was Thomas' : `touched at ${bare.t0} ms, shape ${bare.shape}`);
  /* Beside his path: 1.5 m to his side, out of reach of him walking past. */
  const side = [ahead[0] - uy * 1.5, ahead[1] + ux * 1.5];
  const besideAt = [OX + S * side[0], S * 1.1, OZ - S * side[1]];
  const beside = await hover(f, besideAt, T0, ms);
  check('a craft hovering beside his path is never touched', beside.t0 < 0,
    beside.t0 < 0 ? `untouched, ${r3(beside.nearest)} m from him at the closest` : `touched at ${beside.t0} ms, shape ${beside.shape}`);
}

const blocks = { pure: pureBlock, physics: physicsBlock };
for (const [name, run] of Object.entries(blocks)) {
  if (!only || only === name) {
    await run();
  }
}
console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures);
