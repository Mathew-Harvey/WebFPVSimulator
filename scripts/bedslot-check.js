/*
 * bedslot-check.js: no bed in Nick's house leaves a slot a craft can fall
 * into and not fly out of.
 *
 * THE REPORT THIS ANSWERS. bug-243d42f7, a whoop on the house map: "Got
 * stuck between a bed and a wall". The ticket's craft was at world
 * [-28, 11.7, -49.6], on its side (upZ -0.13), still, upstairs in bedroom 4.
 *
 * THE CAUSE. bed() in src/maps/house/house.js put the mattress 3 cm (real)
 * in from its frame on every side, and every bed in the house stands with a
 * side against a wall. At the house's scale that is a slot 0.105 m of the
 * world wide and 0.875 m deep between the mattress and the wall, with the
 * frame for a floor. A craft on its edge drops into it and rests on the
 * frame, and flown through the real plant from there, full throttle with
 * full pitch or full roll moves it 4 mm: both faces of the slot are solid
 * and the thrust only presses a blade into one of them. house-check's slot
 * rule did not see it, because it looks for gaps a craft can fly into flat,
 * from 0.347 m up, and a craft on its edge fits a much narrower one. The
 * mattress is flush with the frame now on every side but the head, where
 * the headboard stands over the lip.
 *
 * WHAT IS CHECKED.
 *
 *   the geometry   every mattress in the house, every side: the gap between
 *                  its face and the nearest solid outward of it at mattress
 *                  height is either none, or wide enough for the craft to fly
 *                  in and out flat (2 CRAFT_WORLD_R). Anything between is a
 *                  slot. Pure numbers, every bed, about a millisecond.
 *   the flight     the ticket's bed, through the real plant (dist/sim.wasm,
 *                  the house's own solids, the ground raised to the upstairs
 *                  floor the way the shell raises it): a craft dropped on its
 *                  edge at the wall side of the mattress ends up ON the
 *                  mattress, never under its top, and one dropped upright
 *                  stays on it. Each drop is flown twice and must agree to
 *                  the bit.
 *
 * Usage: node scripts/bedslot-check.js [--verbose]
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

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeRig, V } from './lib/flightrig.js';
import { houseLayout } from '../src/maps/house/house.js';
import { houseDocument } from '../src/maps/house/yard.js';
import { normalize } from '../src/trackbuilder/model.js';
import { seatDocument, indexTops } from '../src/maps/built/place.js';
import { placeSolids, addSolids } from '../src/props/solids.js';
import { Colliders, CRAFT_WORLD_R } from '../src/game/collide.js';
import { threePosToSim } from '../src/render/frame.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const verbose = process.argv.includes('--verbose');

let failed = 0;
let passed = 0;
function check(name, ok, note) {
  if (ok) {
    passed += 1;
    console.log(`  ok    ${name}${verbose && note ? `: ${note}` : ''}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${note ? `: ${note}` : ''}`);
  }
}

const L = houseLayout();
const solids = L.parts.filter((p) => p.t === 'box' && p.solid);
const mattresses = solids.filter((p) => p.name === 'mattress');

/* The four sides of a box in plan, as the axis (0 x, 2 z), which way is
 * outward, and the face's coordinate. */
const SIDES = [
  { name: 'west', axis: 0, out: -1, face: (b) => b.lo[0] },
  { name: 'east', axis: 0, out: 1, face: (b) => b.hi[0] },
  { name: 'north', axis: 2, out: -1, face: (b) => b.lo[2] },
  { name: 'south', axis: 2, out: 1, face: (b) => b.hi[2] },
];

/* The gap at one point of a mattress's side: from the face to the nearest
 * solid outward of it there, at mattress height. 0 when something stands
 * against or over the face at that point (the headboard, a wall, a
 * nightstand); the frame does not count, it is under the mattress. */
function gapAtPoint(m, side, at) {
  const along = side.axis === 0 ? 2 : 0;
  const face = side.face(m);
  let gap = Infinity;
  for (const s of solids) {
    if (s === m || s.name === 'bed frame') {
      continue;
    }
    if (at <= s.lo[along] || at >= s.hi[along]) {
      continue;
    }
    if (s.hi[1] <= m.lo[1] + 1e-6 || s.lo[1] >= m.hi[1] - 1e-6) {
      continue;
    }
    const near = side.out > 0 ? s.lo[side.axis] - face : face - s.hi[side.axis];
    const far = side.out > 0 ? s.hi[side.axis] - face : face - s.lo[side.axis];
    if (far <= 1e-6) {
      continue;
    }
    gap = Math.min(gap, Math.max(near, 0));
  }
  return gap;
}

/* The slots along a mattress's side: runs of the side, sampled every
 * centimetre of the world, where the gap is open but narrower than SLOT_MAX,
 * and long enough for the craft to drop into (its own width). A solid that
 * covers only part of the side, as the headboard covers a corner, closes
 * only that part. */
function slotsAlong(m, side, slotMax, minRun) {
  const along = side.axis === 0 ? 2 : 0;
  const step = 0.01;
  const out = [];
  let run = null;
  for (let at = m.lo[along] + step / 2; at < m.hi[along]; at += step) {
    const g = gapAtPoint(m, side, at);
    const slot = g > 1e-6 && g < slotMax;
    if (slot) {
      run = run || { from: at, to: at, w: g };
      run.to = at;
      run.w = Math.min(run.w, g);
    }
    if ((!slot || at + step >= m.hi[along]) && run) {
      if (run.to - run.from + step >= minRun) {
        out.push(run);
      }
      run = null;
    }
  }
  return out;
}

console.log(`\n--- the geometry: ${mattresses.length} mattresses in the house ---`);
const SLOT_MAX = 2 * CRAFT_WORLD_R;
const slots = [];
for (const m of mattresses) {
  for (const side of SIDES) {
    for (const r of slotsAlong(m, side, SLOT_MAX, SLOT_MAX)) {
      slots.push(`mattress at x ${m.lo[0].toFixed(2)}..${m.hi[0].toFixed(2)}, z ${m.lo[2].toFixed(2)}..${m.hi[2].toFixed(2)}, ${side.name} side: ${r.w.toFixed(3)} m wide for ${(r.to - r.from + 0.01).toFixed(2)} m`);
    }
  }
}
check('the house has its beds', mattresses.length >= 6, `${mattresses.length}`);
check(`no mattress side leaves a slot between nothing and ${SLOT_MAX.toFixed(3)} m to the next solid`,
  slots.length === 0, slots.join('; '));

console.log('\n--- the flight: the ticket\'s bed, through the real plant ---');
const { doc } = normalize(houseDocument());
const { placed } = seatDocument(doc);
placeSolids(L.parts, 0, 0, 0, 0, 'quarter', placed.solids, placed.stats);
placed.tops = indexTops(placed.solids);
const colliders = new Colliders();
addSolids(colliders, placed.solids);
colliders.build();
const wasmBytes = readFileSync(join(root, 'dist', 'sim.wasm'));
const diffText = readFileSync(join(root, 'configs', 'betaflight-default.diff'), 'utf8');

/* The ticket's bed: the frame under its craft, the mattress on that frame,
 * and the strip along the wall the slot was, 5 cm of the world off the wall
 * (the frame's wall face), which is over the slot when there is one and over
 * the mattress's edge when there is not. */
const T = { x: -28, y: 11.7, z: -49.65 };
/* Upstairs, the storey its craft was on: since 2026-11-04 the basement
 * guest room's bed stands under bedroom 4's, head to the same north wall,
 * and a find by plan alone took it, the headboard for the wall side. */
const frame = solids.find((s) => s.name === 'bed frame' && T.x > s.lo[0] && T.x < s.hi[0] && Math.abs(T.z - s.lo[2]) < 0.5
  && s.lo[1] <= T.y && T.y - s.lo[1] < 2);
const bedM = frame && mattresses.find((m) => Math.abs(m.lo[1] - frame.hi[1]) < 1e-6 && T.x > m.lo[0] && T.x < m.hi[0]
  && m.lo[2] >= frame.lo[2] - 1e-6 && m.hi[2] <= frame.hi[2] + 1e-6);
check('the ticket\'s spot is at the wall side of a bed', Boolean(frame && bedM));
if (frame && bedM) {
  const top = bedM.hi[1];
  const X = T.x;
  const Z = frame.lo[2] + 0.05;
  /* The ground plane at the bedroom's floor, under the frame. The shell
   * raises its plane to the top under the craft, which over the mattress is
   * the mattress itself and would hold the craft up whether there was a slot
   * there or not, so the drop would prove nothing. At the floor, only the
   * solids hold it up. */
  const gy = frame.lo[1];
  const SPAWN_ALT = 0.045;
  const S45 = Math.SQRT1_2;
  async function drop(startY, q, ms = 4000) {
    const rig = await makeRig({ wasmBytes, diffText, colliders, field: null, spawn: V(X, gy, Z), spawnYaw: 0, groundY: gy });
    const p = threePosToSim(0, startY - gy, 0, { x: 0, y: 0, z: 0 });
    rig.sim.e.sim_set_pose(p.x, p.y, p.z - SPAWN_ALT, ...q);
    rig.sim.e.sim_rest();
    for (let t = 16; t <= ms; t += 16) {
      rig.hold(16, 0, 0, 0, 0);
    }
    const c = rig.craft();
    return { y: c.p.y, z: c.p.z, upZ: c.upZ, key: `${c.p.x},${c.p.y},${c.p.z},${c.upZ}` };
  }
  const startY = top + 0.4;
  /* On its edge, the disc in the wall's plane, so it meets the slot edge on
   * (a pitch of 90 degrees about the sim's y, which is the world's x). */
  const edge = await drop(startY, [S45, 0, S45, 0]);
  const edge2 = await drop(startY, [S45, 0, S45, 0]);
  const flat = await drop(startY, [1, 0, 0, 0]);
  if (verbose) {
    console.log(`        mattress top ${top.toFixed(3)}, ground ${gy.toFixed(3)}`);
    console.log(`        on its edge: y ${edge.y.toFixed(3)}, z ${edge.z.toFixed(3)}, upZ ${edge.upZ.toFixed(2)}`);
    console.log(`        upright: y ${flat.y.toFixed(3)}, z ${flat.z.toFixed(3)}, upZ ${flat.upZ.toFixed(2)}`);
  }
  check('dropped on its edge at the wall, it ends on the mattress, not down beside it',
    edge.y >= top - 0.02, `rests at y ${edge.y.toFixed(3)} against the top at ${top.toFixed(3)}, upZ ${edge.upZ.toFixed(2)}`);
  check('dropped upright at the wall, it stays on the mattress', flat.y >= top - 0.02,
    `rests at y ${flat.y.toFixed(3)} against the top at ${top.toFixed(3)}`);
  check('the same drop twice is the same to the bit', edge.key === edge2.key, `${edge.key} against ${edge2.key}`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
