/*
 * splits-check.js: a Split-S flown on the sticks is a Split-S.
 *
 * THE REPORT THIS ANSWERS. bug-385711e7, 2026-11-04, a five inch on Hibari
 * Yard in career lesson 9-3, a radio in Acro on Actual rates of 400 deg/s,
 * Weight 100: "SPLIT S IMPOSSIBLE. I'm stuck on Split S. I have done it
 * every way I can think of but it won't pass me and won't tell me what I'm
 * doing wrong."
 *
 * THE CAUSE. Two, and the pilot met both.
 *
 * The recogniser read the lap's pitch as a fifth of a turn when the craft
 * had pitched half of one. debankLap in src/game/trickdetect.js takes the
 * loop's own turn out of the body integrals and puts it back on the axis
 * that owns it, and it took the turn out as the RAW winding but put it back
 * as the SNAPPED count. A half lap's two straight legs are both on the
 * approach side, so they add winding with no rotation in them: flown over a
 * rail the lap wound 0.82 turns after its gate for half a turn of loop, and
 * the 0.32 between came off the pitch. Nothing in the Split-S family asks
 * for pitch 0.2, so a clean one was a 1/2 Roll and a 1/2 Flip, a Beginner
 * Matty, or nothing at all, and nothing at all is a lesson that says
 * nothing. The subtraction now takes out the snapped turn.
 *
 * And the lesson sent the pilot to a roof edge. A Split-S is judged round
 * something the craft flies back under, a rail, a board or a deck in the
 * obstacle field, and under a roof edge is the building: flown off the
 * office's edge it winds round nothing and drives into the wall. Lessons 9-3
 * and 10-3 now name the billboard and the footbridge, which are in the field.
 *
 * WHAT IS CHECKED, all of it through the real plant (dist/sim.wasm) at the
 * five inch's own 1.62 g on the ticket's rates, the real recogniser, and the
 * lesson's own world. The Split-S is flown the way a pilot flies it: in
 * level over the object on a line, full roll stick through half a turn,
 * then a held pull with the throttle off while the props point at the
 * ground and on once the craft is past the vertical, and level out going
 * back the way it came.
 *
 *   the control    the same sticks in open air name no Split-S, and over a
 *                  lone rail they fly a Split-S by the geometry: in over it,
 *                  half a roll and half a turn of pitch by the gyro, out
 *                  under it going back, no contact. So the manoeuvre is the
 *                  real one before the recogniser is asked about it.
 *   the rule       over the rail, rolled right and rolled left, it is a
 *                  Split-S; with the old subtraction back it is not, which
 *                  is the bug held in place, so this check can fail.
 *   the billboard  the lesson's object: from the east and the west, at two
 *                  heights and two speeds, rolled either way, out through
 *                  the BILLBOARD GAP, a Split-S; with the old rule, not.
 *   the footbridge both ways, a Split-S; with the old rule, not.
 *   not a Split-S  the same sticks twelve metres beside the billboard, a level
 *                  pass over it, and a Split-S off the office's roof edge,
 *                  which winds round nothing.
 *   the lesson     9-3's and 10-3's words send the pilot to the billboard
 *                  or the footbridge and not to a roof edge.
 *
 * Every flight is flown twice and must come out bit identical: the same
 * names, the same contacts and the same final state, double for double.
 *
 * Usage: node scripts/splits-check.js
 * Exit code is 1 if any check failed.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  makeRig, buildWorld, V, add, mul, norm, len, rampPath, linePath, TURN,
} from './lib/flightrig.js';
import { deriveObstacles, OB_BAR } from '../src/game/obstacles.js';
import { Colliders } from '../src/game/collide.js';
import { normalize } from '../src/trackbuilder/model.js';
import { seatDocument, groundUnder, docToWorld } from '../src/maps/built/place.js';
import { addSolids } from '../src/props/solids.js';
import { lessonById } from '../src/career/curriculum.js';
import { airframeById } from '../configs/airframes.js';
import { ratesDiff, ratesSummary } from '../configs/rates.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const WASM = join(root, 'dist', 'sim.wasm');

let passed = 0;
let failed = 0;
function check(name, ok, note) {
  if (ok) {
    passed += 1;
    console.log(`  pass  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}`);
  }
  if (note) {
    console.log(`        ${note}`);
  }
}

console.log('\nsplits-check: a Split-S flown on the sticks is a Split-S\n');

/* ---- the lesson ---- */
const lesson = lessonById('9-3');
const final = lessonById('10-3');
{
  const words = (l) => [l.briefing.goal, l.briefing.why, ...l.briefing.steps].join(' ');
  const wantsSplit = (l) => l.objectives.some((o) => o.kind === 'trick'
    && o.need.some((n) => n.names.includes('Split-S')));
  for (const l of [lesson, final]) {
    const w = words(l);
    check(`lesson ${l.id} asks for a Split-S and sends the pilot to the billboard or the footbridge, not a roof edge`,
      wantsSplit(l) && /billboard|footbridge/i.test(w) && !/roof edge/i.test(w),
      l.briefing.steps.find((s) => /billboard|footbridge|roof/i.test(s)));
  }
}

/* The lesson's own world, the built map's own way, as deck-check builds it. */
function builtWorld(placed) {
  const colliders = new Colliders();
  addSolids(colliders, placed.solids);
  colliders.build();
  const height = (x, z, fromY) => groundUnder(placed.tops, x, z, fromY);
  return { colliders, field: deriveObstacles(colliders, height) };
}
const yardDoc = normalize(lesson.world.doc).doc;
const yard = builtWorld(seatDocument(yardDoc).placed);
const plan = (x, y) => docToWorld(yardDoc.field.width, yardDoc.field.depth, x, y, 0, {});
const element = (type) => yardDoc.elements.find((e) => e.type === type);
const BOARD = element('billboard');
const BRIDGE = element('bridge');
const B = plan(BOARD.position.x, BOARD.position.y);
const F = plan(BRIDGE.position.x, BRIDGE.position.y);
const near = (p, r) => yard.field.items.filter((o) => o.kind === OB_BAR && Math.hypot(o.cx - p.x, o.cz - p.z) <= r);
check('the lesson is flown on Hibari Yard, with bars in the billboard and a deck in the footbridge',
  yardDoc.name === 'Hibari Yard' && near(B, 1).length > 0 && near(F, 1).some((o) => o.wide > 0),
  `${near(B, 1).length} bars on the billboard's line, ${near(F, 1).filter((o) => o.wide > 0).length} deck on the footbridge's`);

if (!existsSync(WASM)) {
  console.log('\n  SKIP  dist/sim.wasm is not built, so nothing was flown');
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

/* The ticket's machine: the five inch at its own weight, Actual 400. */
const wasmBytes = readFileSync(WASM);
const RATES = {
  type: 'ACTUAL',
  roll: { rcRate: 6, srate: 40, expo: 0 },
  pitch: { rcRate: 6, srate: 40, expo: 0 },
  yaw: { rcRate: 6, srate: 40, expo: 0 },
};
const diffText = readFileSync(join(root, 'configs', 'betaflight-default.diff'), 'utf8') + ratesDiff(RATES);
const G_SCALE = airframeById(lesson.airframe).gravityBase;
console.log(`        ${ratesSummary(RATES)}, gravity ${G_SCALE}\n`);
/* The guidance law's hover stick at that weight. It lines the craft up and
 * levels it out; the trick itself is on the sticks. */
const HOVER = 0.45;

/*
 * A Split-S on the sticks, along world x (`axis` 'z' for along z), towards
 * `at`, the point over the object: the roll starts `lead` metres short of
 * it, so the pull begins about over it.
 *
 * `old` puts the subtraction back as it was, the whole raw winding, which is
 * what the lap's windOpen of zero says to debankLap. Nothing else changes.
 */
async function flyOnce(world, at, o = {}) {
  const {
    axis = 'x', dir = 1, h = 11, v = 12, roll = 1, pull = 0.65,
    lead = 4, runIn = 30, spawn = null, exitSecs = 2.5, old = false, sticks = true,
  } = o;
  const e = axis === 'z' ? V(0, 0, dir) : V(dir, 0, 0);
  const along = (p) => p.x * e.x + p.z * e.z;
  const head = Math.atan2(e.x, e.z);
  const rollAt = V(at.x - e.x * lead, h, at.z - e.z * lead);
  const start = V(rollAt.x - e.x * runIn, h, rollAt.z - e.z * runIn);
  const from = spawn ?? start;
  const rig = await makeRig({
    wasmBytes, diffText, colliders: world.colliders, field: world.field,
    spawn: V(from.x, 0, from.z), spawnYaw: Math.PI, groundY: 0,
  });
  if (rig.sim.e.sim_set_gravity(G_SCALE) !== 0) {
    throw new Error('splits-check: sim_set_gravity refused the five inch\'s weight');
  }
  if (old) {
    const debank = rig.det.debankLap.bind(rig.det);
    rig.det.debankLap = (run, snapped) => {
      run.windOpen = 0;
      return debank(run, snapped);
    };
  }
  let laps = 0;
  const insert = rig.det.insertPending.bind(rig.det);
  rig.det.insertPending = (p) => {
    laps += p.kind === 'path' ? 1 : 0;
    return insert(p);
  };
  rig.hold(200, 0, 0, 0, 0.5);
  if (spawn) {
    rig.settle(V(spawn.x, h, spawn.z), head, 2.5);
  }
  rig.settle(start, head, 2.5);
  rig.fly(rampPath(start, rollAt, (runIn * 1.9) / v, v), { heading: head, hover: HOVER });
  const c0 = rig.stats.contacts;
  const entry = rig.craft();
  let minY = Infinity;
  let back = null;
  let prev = entry.p;
  const watch = (c) => {
    minY = c.p.y < minY ? c.p.y : minY;
    if (!back && (along(prev) - along(at)) * (along(c.p) - along(at)) <= 0 && along(c.v) < 0) {
      back = c.p;
    }
    prev = c.p;
  };
  let rolled = 0;
  let pitched = 0;
  if (sticks) {
    /* Full roll stick through most of half a turn, then centred: a rate
     * stick stops the roll, it does not hold it. Throttle nearly off. */
    rolled += rig.stickUntil((c) => { watch(c); return [roll, 0, 0, 0.1]; }, 1200,
      (c, i, a) => Math.abs(a.p) >= TURN * 0.42).p;
    rolled += rig.stickUntil((c) => { watch(c); return [0, 0, 0, 0.1]; }, 120,
      (c) => Math.abs(c.rates.p) < 1.0).p;
    /* The pull, throttle off while the props point at the ground and on
     * once the craft is past the vertical. */
    pitched = rig.stickUntil((c) => { watch(c); return [0, pull, 0, c.up.y > -0.3 ? 0.7 : 0.05]; }, 3000,
      (c, i, a) => Math.abs(a.q) >= TURN * 0.44).q;
  }
  /* Level out the way the craft is now going, which is back. */
  const now = rig.craft();
  const flat = V(now.v.x, 0, now.v.z);
  const vOut = sticks ? mul(norm(flat), Math.max(len(flat), 3)) : mul(e, v);
  const p1 = V(now.p.x, Math.max(now.p.y, 1.2), now.p.z);
  const out = (t) => ({ p: add(p1, mul(vOut, t)), v: vOut, a: V(0, 0, 0), done: t >= exitSecs });
  out.total = exitSecs;
  rig.fly(out, { heading: Math.atan2(vOut.x, vOut.z), hover: HOVER, watch });
  const contacts = rig.stats.contacts - c0;
  rig.hold(700, 0, 0, 0, HOVER * 0.9);
  const names = rig.done(700).map((t) => t.name).join(' + ');
  return {
    names,
    contacts,
    laps,
    entryY: entry.p.y,
    minY,
    back,
    rolled: Math.abs(rolled) / TURN,
    pitched: Math.abs(pitched) / TURN,
    state: Array.from(rig.state()),
  };
}
const sameBits = (a, b) => a.length === b.length && a.every((x, i) => Object.is(x, b[i]));
async function fly(world, at, o) {
  const a = await flyOnce(world, at, o);
  const b = await flyOnce(world, at, o);
  return {
    ...a,
    same: a.names === b.names && a.contacts === b.contacts && sameBits(a.state, b.state),
  };
}
const said = (got) => {
  const under = got.back ? `, back under at ${got.back.y.toFixed(2)} m` : '';
  return `named ${got.names || 'nothing'}, ${got.contacts} contacts, in at ${got.entryY.toFixed(2)} m${under}`
    + `${got.same ? '' : ', AND THE TWO FLIGHTS DISAGREE'}`;
};
const isSplit = (got) => got.names === 'Split-S';
const clean = (got) => got.contacts === 0 && got.minY > 0.3;

/* ---- the control, in open air and over a lone rail ---- */
const RAIL_Y = 5;
const rail = buildWorld([{ kind: 'capsule', ax: 0, ay: RAIL_Y, az: -5, bx: 0, by: RAIL_Y, bz: 5, r: 0.17 }], deriveObstacles);
const sky = buildWorld([], deriveObstacles);
const RAIL = { h: 10, v: 11, pull: 0.7 };
{
  const air = await fly(sky, V(0, 0, 0), RAIL);
  check('the control: the same sticks in open air name no Split-S',
    air.same && !/Split-S/.test(air.names) && air.names !== '', said(air));
  const r = await fly(rail, V(0, 0, 0), RAIL);
  check('the control: over a lone rail they fly a Split-S by the geometry',
    r.same && r.contacts === 0 && r.entryY > RAIL_Y + 4 && r.back !== null && r.back.y < RAIL_Y - 2
      && Math.abs(r.rolled - 0.5) < 0.1 && Math.abs(r.pitched - 0.5) < 0.1,
    `in at ${r.entryY.toFixed(2)} m over a rail at ${RAIL_Y}, rolled ${r.rolled.toFixed(2)} and pitched ${r.pitched.toFixed(2)} turns, `
      + `${r.back ? `back under it at ${r.back.y.toFixed(2)} m` : 'never back under it'}, ${r.contacts} contacts`);
  check('the ticket, over the rail: it is named a Split-S', r.same && isSplit(r), said(r));
  const left = await fly(rail, V(0, 0, 0), { ...RAIL, roll: -1 });
  check('and rolled the other way', left.same && isSplit(left) && clean(left), said(left));
  const old = await fly(rail, V(0, 0, 0), { ...RAIL, old: true });
  check('with the old subtraction it is not a Split-S (the bug)',
    old.same && clean(old) && !/Split-S/.test(old.names), said(old));
}

/* ---- the billboard, which the lesson names ---- */
const GAP = { y1: 2.9, z0: B.z - 2.5, z1: B.z + 2.5 };
const throughGap = (got) => got.back !== null && got.back.y < GAP.y1 && got.back.z > GAP.z0 && got.back.z < GAP.z1;
{
  const BOARD_AT = V(B.x, 0, B.z);
  const cases = [
    ['from the east', { dir: -1, h: 11, v: 12, pull: 0.65 }],
    ['from the east, rolled left', { dir: -1, h: 11, v: 12, pull: 0.65, roll: -1 }],
    ['from the west', { dir: 1, h: 11, v: 10, pull: 0.65 }],
    ['from the east, higher and faster', { dir: -1, h: 12, v: 14, pull: 0.6 }],
    ['from the west, higher', { dir: 1, h: 12, v: 12, pull: 0.6 }],
  ];
  for (const [name, o] of cases) {
    const got = await fly(yard, BOARD_AT, o);
    check(`over the billboard ${name}, out through its gap, is a Split-S`,
      got.same && clean(got) && throughGap(got) && isSplit(got), said(got));
  }
  const old = await fly(yard, BOARD_AT, { ...cases[0][1], old: true });
  check('with the old subtraction the first of them is not (the bug, on the lesson\'s own object)',
    old.same && clean(old) && throughGap(old) && !/Split-S/.test(old.names), said(old));
}

/* ---- the footbridge ---- */
{
  const DECK = 4.45;
  const FOOT_AT = V(F.x, 0, F.z);
  const FOOT = { axis: 'z', h: 9.5, v: 11, pull: 0.7 };
  for (const dir of [1, -1]) {
    const got = await fly(yard, FOOT_AT, { ...FOOT, dir });
    check(`over the footbridge ${dir > 0 ? 'one way' : 'and the other'}, out under its deck, is a Split-S`,
      got.same && clean(got) && got.back !== null && got.back.y < DECK && isSplit(got), said(got));
  }
  const old = await fly(yard, FOOT_AT, { ...FOOT, dir: 1, old: true });
  check('with the old subtraction it is not (the bug)',
    old.same && clean(old) && !/Split-S/.test(old.names), said(old));
}

/* ---- not a Split-S ---- */
{
  /* Twelve metres off its middle on the side the containers are not, so
   * the loop has nothing in it and nothing to clip. */
  const beside = await fly(yard, V(B.x, 0, B.z + 12), { dir: -1, h: 11, v: 12, pull: 0.65 });
  check('the same sticks twelve metres beside the billboard are not a Split-S',
    beside.same && beside.contacts === 0 && beside.laps === 0 && !/Split-S/.test(beside.names),
    `${said(beside)}, ${beside.laps} laps`);
  const pass = await fly(yard, V(B.x, 0, B.z), { dir: -1, h: 11, v: 12, sticks: false });
  check('nor is a level pass over it', pass.same && pass.names === '' && pass.contacts === 0, said(pass));
  /*
   * Off the office's roof edge, the one the roof sign is not on: in over
   * the roof along z, east of the plant room, and the pull begins a metre
   * and a half past the parapet and dives down the face. The block faces
   * east, so its width runs along z. There is no bar at the edge, so no lap
   * opens, and going back the way it came is going into the wall.
   */
  const office = element('building');
  const O = plan(office.position.x, office.position.y);
  const edge = V(O.x + 2.5, 0, O.z + office.dims.width / 2 + 1.5);
  const roof = await fly(yard, edge, {
    axis: 'z', dir: 1, h: 18, v: 11, pull: 0.6, runIn: 5, exitSecs: 0.8, spawn: V(edge.x, 0, edge.z + 10),
  });
  check('a Split-S off the office\'s roof edge winds round nothing and is not a Split-S',
    roof.same && roof.laps === 0 && !/Split-S/.test(roof.names), `${said(roof)}, ${roof.laps} laps`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
