/*
 * check.mjs: does each built document still say what its .trk said?
 *
 * The import has four properties worth asserting, and every one of them has
 * already been got wrong once:
 *
 *   ORDER      every checkpoint, minus the consecutive repeats, appears in
 *              the flying order, in the order the file gives, pointing at the
 *              right hole of the right element. The previous import keyed
 *              elements off positions it had already seen, so a gate flown
 *              four times on WCMRC Round 5 became one pass and three
 *              deletions.
 *   POSITION   every element stands where the file puts it, to the
 *              millimetre, under one shared offset. The previous import slid
 *              flags sideways and pushed markers off the racing line.
 *   HEADING    every aperture's document yaw is pi/2 MINUS the Unity heading
 *              of that object's own normal, modulo a half turn because a gate
 *              is symmetric. The previous import added instead of subtracting,
 *              which mirrors a course about north, and then let the auto face
 *              rule overwrite the heading anyway.
 *   HEIGHT     every hole's centre is the height of the checkpoint that marks
 *              it. The previous import flattened every aperture to the floor.
 *
 * Usage, from the simulator root:  node tracks/check.mjs
 * Exits non zero if anything fails.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readCourse } from './course.mjs';
import { docYaw } from './trk.mjs';
import { TRK_FILES } from './sources.mjs';
import {
  deserialize, aperturesOf, kindOf, apertureCenter, entryAnchor, elementNormal, startPadsOf,
} from '../src/trackbuilder/model.js';
import { KIND, ELEMENTS, FRAME_TUBE_OD } from '../src/trackbuilder/elements.js';
import { wrapAngle, apertureFrame, pointSegment } from '../src/trackbuilder/geometry.js';
import { buildPath } from '../src/trackbuilder/path.js';
import { GATE_SCALE } from '../src/game/track.js';
import { courseFromDocument } from '../src/game/trackdoc.js';
import { Race } from '../src/game/race.js';
import { startBlockLaneOffset } from '../src/art/startblock.js';

const here = dirname(fileURLToPath(import.meta.url));
const DEG = 180 / Math.PI;

/* How wide the quad is, plus the slop a racing line is drawn with. The
 * airframe's swept disc is 0.347 m across, so half of it plus a body length
 * of margin is what has to fit past a frame. */
const CORRIDOR = 0.55;

let passed = 0;
let failed = 0;
const fails = [];
const notes = [];

function check(track, what, ok, detail = '') {
  if (ok) {
    passed += 1;
    return;
  }
  failed += 1;
  fails.push(`${track}: ${what}${detail ? `, ${detail}` : ''}`);
}

/* A gate is symmetric, so a heading and its opposite are the same plane. */
function halfTurnApart(a, b) {
  const d = Math.abs(wrapAngle(a - b));
  return Math.min(d, Math.abs(Math.PI - d));
}

/*
 * An obstacle's footprint on the plan, as a segment and a height band.
 *
 * A gate is a flat frame, so in plan it is a line across its opening, not a
 * disc: two gates a metre apart edge on do not touch, and two gates a metre
 * apart side by side are inside each other. Comparing centre distances would
 * get both of those wrong, which is why this is a segment.
 */
function footprint(el) {
  const def = ELEMENTS[el.type];
  const aps = aperturesOf(el);
  const frame = apertureFrame(el.yaw, 0);
  /* Outer width: the clear opening plus an upright each side, at the size the
   * RACE FIELD builds it. src/game/trackdoc.js puts every obstacle dimension
   * through GATE_SCALE, so measuring the document's own figures would test a
   * course 15 percent smaller than the one anybody flies. */
  const half = (aps[0].clearW / 2 + FRAME_TUBE_OD) * GATE_SCALE;
  const top = aps[aps.length - 1];
  return {
    a: { x: el.position.x - frame.widthAxis.x * half, y: el.position.y - frame.widthAxis.y * half, z: 0 },
    b: { x: el.position.x + frame.widthAxis.x * half, y: el.position.y + frame.widthAxis.y * half, z: 0 },
    loZ: el.position.z,
    hiZ: el.position.z + (top.sillH + top.clearH + FRAME_TUBE_OD) * GATE_SCALE,
    label: `${el.name || def.label}`,
  };
}

/* Closest approach of two plan segments, sampled. Exact enough at this size
 * and it needs no special cases for parallel or touching. */
function segmentGap(p, q) {
  let best = Infinity;
  for (let i = 0; i <= 24; i += 1) {
    const t = i / 24;
    const on = { x: p.a.x + (p.b.x - p.a.x) * t, y: p.a.y + (p.b.y - p.a.y) * t, z: 0 };
    best = Math.min(best, pointSegment(on, q.a, q.b).dist);
    const on2 = { x: q.a.x + (q.b.x - q.a.x) * t, y: q.a.y + (q.b.y - q.a.y) * t, z: 0 };
    best = Math.min(best, pointSegment(on2, p.a, p.b).dist);
  }
  return best;
}

for (const spec of TRK_FILES) {
  const course = readCourse(await readFile(join(here, spec.file), 'utf8'), spec.name);
  const { doc, error } = deserialize(await readFile(join(here, 'json', `${spec.id}.json`), 'utf8'));
  if (error) {
    check(spec.name, 'the document reads back', false, error);
    continue;
  }
  check(spec.name, 'the document is the one this .trk builds', doc.id === spec.id, doc.id);
  check(spec.name, 'the document reads back with no repairs needed',
    deserialize(JSON.stringify(doc)).repairs.length === 0);

  /* ---- ORDER ---- */
  const flown = course.stops.filter((s) => s.repeatOf == null);
  check(spec.name, 'every checkpoint that is not a consecutive repeat is flown',
    doc.sequence.length === flown.length, `${doc.sequence.length} entries against ${flown.length} stops`);

  /* The offset the converter used, recovered from the start gate, so the
   * comparison does not have to duplicate the field sizing. */
  let offX = null;
  let offY = null;
  for (let i = 0; i < Math.min(doc.sequence.length, flown.length); i += 1) {
    const stop = flown[i];
    const el = doc.elements.find((e) => e.id === doc.sequence[i].elementId);
    if (!el) {
      check(spec.name, `entry ${i} points at an element`, false);
      continue;
    }
    if (offX == null) {
      offX = el.position.x - stop.x;
      offY = el.position.y - stop.z;
    }

    /* POSITION. Everything under one offset, so a single element that has
     * been moved shows up rather than shifting the whole comparison. */
    const dx = Math.abs((el.position.x - offX) - stop.x);
    const dy = Math.abs((el.position.y - offY) - stop.z);
    const site = course.sites[stop.siteId];
    /* A site is the mean of its members, so a stack that leans is allowed to
     * sit between its own holes. Everything else is exact. */
    const slack = site.members.length > 1 ? 1.0 : 0.002;
    check(spec.name, `stop ${stop.order} stands where the file puts it`,
      dx <= slack && dy <= slack, `${dx.toFixed(3)}, ${dy.toFixed(3)} m out`);

    if (kindOf(el) !== KIND.APERTURE) {
      continue;
    }

    /* HEADING. */
    if (site.headingTrusted) {
      const want = wrapAngle(docYaw(site.heading));
      const off = halfTurnApart(el.yaw, want);
      check(spec.name, `stop ${stop.order} faces the way the file says`,
        off < 1e-4, `${(el.yaw * DEG).toFixed(1)} against ${(want * DEG).toFixed(1)} degrees`);
    }

    /*
     * HEIGHT. Only a checkpoint knows where a hole is, so only a site that
     * has one is asserted; a bare gate mesh gets the standard height and
     * there is nothing in the file to check it against.
     *
     * The expected height is the authored one raised, if need be, to half an
     * opening off the ground, because a hole cannot be centred lower than
     * that and the ground level checkpoints in these files are centred at
     * about zero. The bottom and the top of a structure are exact. A middle
     * hole is only required to sit between them, because the document spaces
     * a ladder evenly and a clamped bottom makes the real spacing uneven.
     */
    const centre = site.levels[stop.level]?.centre;
    if (centre != null) {
      const aps = aperturesOf(el);
      const want = Math.max(aps[0].clearH / 2, centre);
      const got = apertureCenter(el, doc.sequence[i].apertureIndex ?? 0).z;
      const middle = stop.level > 0 && stop.level < site.levels.length - 1;
      const ok = middle
        ? got > aps[0].centerH - 0.06 && got < aps[aps.length - 1].centerH + 0.06
        : Math.abs(got - want) < 0.06;
      check(spec.name, `stop ${stop.order} flies at the height the file says`,
        ok, `${got.toFixed(2)} against ${want.toFixed(2)} m`);
    }

    /* The right hole of the right structure. */
    check(spec.name, `stop ${stop.order} flies a hole that exists`,
      (doc.sequence[i].apertureIndex ?? 0) < aperturesOf(el).length);
  }

  /* Every site with more than one hole became a structure with that many. */
  for (const site of course.sites) {
    if (site.role !== 'gate' || site.levels.length < 2) {
      continue;
    }
    const stop = course.stops.find((s) => s.siteId === site.id);
    const i = flown.indexOf(stop);
    if (i < 0) {
      continue;
    }
    const el = doc.elements.find((e) => e.id === doc.sequence[i]?.elementId);
    check(spec.name, `the ${site.levels.length} hole structure at ${site.names.join('-')} kept its holes`,
      el && aperturesOf(el).length === site.levels.length,
      el ? `${aperturesOf(el).length} holes` : 'no element');
  }

  /* Nothing invented and nothing lost: one element per site, plus the loose
   * scenery, plus the start pads. */
  const loose = course.props.filter((p) => (p.role === 'flag' || p.role === 'cone') && p.attachedTo == null);
  const pads = doc.elements.filter((e) => kindOf(e) === KIND.START).length;
  check(spec.name, 'one element per site, plus the scenery, plus one grid',
    doc.elements.length === course.sites.length + loose.length + pads,
    `${doc.elements.length} against ${course.sites.length} + ${loose.length} + ${pads}`);
  check(spec.name, 'exactly one start grid', pads === 1);

  /*
   * NOTHING STANDS INSIDE ANYTHING ELSE.
   *
   * Reported from the cockpit on 2025 WA States: "there is a gate blocking
   * the next gate". Two obstacles whose frames intersect are not a course,
   * they are a pile, and no amount of correct position and heading data adds
   * up to a flyable track if two of the things are in the same place. The
   * other checks all compare one element against the file; this one compares
   * elements against each other, which is the class of fault they cannot see.
   */
  const solid = doc.elements.filter((e) => kindOf(e) === KIND.APERTURE);
  const prints = solid.map(footprint);
  for (let i = 0; i < prints.length; i += 1) {
    for (let j = i + 1; j < prints.length; j += 1) {
      const p = prints[i];
      const q = prints[j];
      if (p.hiZ < q.loZ - 0.05 || q.hiZ < p.loZ - 0.05) {
        continue;
      }
      const gap = segmentGap(p, q);
      check(spec.name, `${p.label} and ${q.label} are not standing in each other`,
        gap > 0.25, `frames ${gap.toFixed(2)} m apart`);
    }
  }

  /* And a marker is not standing in a gate's opening either. */
  for (const m of doc.elements.filter((e) => e.type === 'flag' || e.type === 'cone')) {
    for (const p of prints) {
      if (p.hiZ < m.position.z - 0.05) {
        continue;
      }
      const gap = pointSegment({ ...m.position, z: 0 }, p.a, p.b).dist;
      check(spec.name, `${m.name || m.type} is not standing in ${p.label}`,
        gap > 0.25, `${gap.toFixed(2)} m from the frame`);
    }
  }

  /*
   * NOTHING STANDS ON THE APPROACH TO A GATE.
   *
   * Intersection is not the only way one obstacle ruins another. A gate a
   * metre and a half to the side of the line into the NEXT gate does not
   * touch anything and is still the thing you hit, and from the cockpit it
   * reads as "there is a gate blocking the next gate". So this walks the
   * racing line and asks, at every sample, whether any obstacle that is not
   * the one being flown is inside the corridor the quad occupies.
   */
  const path = buildPath(doc);
  const blocked = new Set();
  for (const smp of path.samples) {
    const seg = path.segments[smp.segment];
    const near = new Set([seg?.a?.elementId, seg?.b?.elementId]);
    for (let k = 0; k < solid.length; k += 1) {
      if (near.has(solid[k].id)) {
        continue;
      }
      const p = prints[k];
      if (smp.pos.z < p.loZ - CORRIDOR || smp.pos.z > p.hiZ + CORRIDOR) {
        continue;
      }
      const gap = pointSegment({ x: smp.pos.x, y: smp.pos.y, z: 0 }, p.a, p.b).dist;
      if (gap < CORRIDOR) {
        const from = seg?.a?.elementId ? (doc.elements.find((e) => e.id === seg.a.elementId)?.name || '?') : 'start';
        const to = seg?.b?.elementId ? (doc.elements.find((e) => e.id === seg.b.elementId)?.name || '?') : 'finish';
        blocked.add(`${p.label} is ${gap.toFixed(2)} m off the leg ${from} to ${to}`);
      }
    }
  }
  /*
   * THE LAUNCH FLIES THROUGH THE FIRST GATE, AND IT SCORES.
   *
   * Two reports, one fault: the grid stood 127 degrees off gate 0's normal on
   * 2025 WA States, and the gate then refused to register a genuine pass,
   * because applyAutoFaces picks each aperture's entry SIGN off the chain
   * pads-gate-next and a grid pointing the wrong way chose the sign for a
   * crossing nobody makes.
   *
   * So this does not check an angle. It builds the course the way the race
   * field builds it, hands it to the real Race, and flies a straight line
   * from behind the first gate along the direction of travel that gate was
   * given. If the answer is not "gate 0 scored", the lap cannot be started,
   * whatever the geometry looks like.
   */
  const built = courseFromDocument(doc);
  if (built.stations.length) {
    const raceGates = built.stations.map((st, i) => ({
      position: { x: st.x, y: 0, z: st.z },
      heading: st.yaw,
      pitch: st.pitch ?? 0,
      flyOrder: i,
      elementId: st.elementId,
      apertureIndex: st.apertureIndex,
      apertures: [{ centreY: st.centreY, clearW: st.clearW, clearH: st.clearH }],
      aperture: { centreY: st.centreY, clearW: st.clearW, clearH: st.clearH },
    }));
    const race = new Race(raceGates);
    const g0 = race.gates[0];
    const ap = g0.apertures[0];
    const cy = g0.y + ap.centreY;
    const prev = { x: g0.x - g0.az.x * 4, y: cy - g0.az.y * 4, z: g0.z - g0.az.z * 4 };
    const curr = { x: g0.x + g0.az.x * 4, y: cy + g0.az.y * 4, z: g0.z + g0.az.z * 4 };
    check(spec.name, 'the first gate scores when it is flown along its own axis',
      race.update(prev, curr, 10, 10).passed === 0);

    /*
     * And the grid is behind it on that axis, which is the owner's
     * requirement in as many words: the start blocks are always straight on
     * to the first element.
     *
     * Measured at the SPAWN, which is not the grid's centreline. A lone pilot
     * parks on the pad nearest the middle of a four stand grid, so the craft
     * sits one lane over, and every track reads exactly that same 0.75 m off
     * axis. That is the lane and not a crooked grid, which is why the
     * tolerance is the lane offset plus slop rather than zero: a constant
     * that is identical on all nine courses is a property of the start block,
     * not of any of them.
     */
    const spawn = built.spawn;
    const pads = doc.elements.find((e) => kindOf(e) === KIND.START);
    if (spawn && pads) {
      const lane = Math.abs(startBlockLaneOffset(pads.dims));
      const vx = spawn.x - g0.x;
      const vz = spawn.z - g0.z;
      const along = vx * g0.az.x + vz * g0.az.z;
      const across = Math.abs(vx * g0.ax.x + vz * g0.ax.z);
      check(spec.name, 'the grid is behind the first gate, not in front of it',
        along < 0, `${along.toFixed(2)} m along the axis`);
      check(spec.name, 'the grid is square to the first gate, not off to one side',
        across <= lane + 0.15, `${across.toFixed(2)} m off the axis, lane is ${lane.toFixed(2)}`);
    }
  }

  /*
   * FLOW. Every hole sends the pilot towards the next one.
   *
   * The owner's instruction after finding a tunnel whose mouth pointed the
   * wrong way: always inspect the flight path for flow as a final check, and
   * if there is an anti flow section, double check the track. This is that
   * check. An aperture's tangent is entry times its normal, and the lap has
   * to get from this knot to the next one, so the two must not oppose. A
   * negative dot means the gate is telling the pilot to fly away from where
   * the course goes, which is what a tunnel threaded backwards looks like
   * from the cockpit.
   *
   * Consecutive passes of one structure are exempt: they share a place, so
   * the chord between them is a wrap and carries no direction.
   */
  const chain = [
    { pos: startPadsOf(doc)?.position, seq: null },
    ...doc.sequence.map((s) => ({ pos: entryAnchor(doc, s), seq: s })),
    { pos: startPadsOf(doc)?.position, seq: null },
  ].filter((k) => k.pos);
  const anti = [];
  for (let i = 0; i < chain.length - 1; i += 1) {
    const seq = chain[i].seq;
    if (!seq || seq.entry == null) {
      continue;
    }
    const el = doc.elements.find((e) => e.id === seq.elementId);
    if (!el || kindOf(el) !== KIND.APERTURE) {
      continue;
    }
    const dx = chain[i + 1].pos.x - chain[i].pos.x;
    const dy = chain[i + 1].pos.y - chain[i].pos.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.5) {
      continue;
    }
    const n = elementNormal(el);
    const dot = ((n.x * seq.entry) * dx + (n.y * seq.entry) * dy) / len;
    if (dot < 0) {
      anti.push(`${el.name || el.type} at position ${i} points ${(Math.acos(Math.max(-1, dot)) * DEG).toFixed(0)} deg away from the next one`);
    }
  }
  check(spec.name, 'no gate sends the pilot away from the next one',
    anti.length === 0, anti.join('; '));

  /*
   * REPORTED, NOT ASSERTED, and the reason is that this one cannot tell two
   * different things apart.
   *
   * Some of what it finds is a real fault. Most of it is not. A flag 1.5 ft
   * behind a gate is a MultiGP standard and the lap is supposed to come back
   * past the frame to wrap it; an out and back down a tunnel is supposed to
   * pass every gate in it twice. And the largest group is not track design at
   * all, it is the Hermite: at a hairpin the spline overshoots the turn and
   * bows out by a metre or two, so the reported clearance is against a line
   * no pilot would fly. Failing on any of those would be failing on a correct
   * import, so this counts and prints and leaves the judgement to a person.
   */
  if (blocked.size) {
    notes.push(`${spec.name}: ${blocked.size} place(s) where the drawn line passes within ${CORRIDOR} m of an obstacle it is not flying`);
    for (const b of blocked) {
      notes.push(`    ${b}`);
    }
  }
}

console.log(`${passed} passed, ${failed} failed`);
for (const f of fails) {
  console.log(`  FAIL ${f}`);
}
if (notes.length) {
  console.log('\nFor a human to look at, not failures:');
  for (const n of notes) {
    console.log(`  ${n}`);
  }
}
process.exitCode = failed ? 1 : 0;
