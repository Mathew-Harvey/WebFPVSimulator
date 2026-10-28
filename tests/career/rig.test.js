/*
 * career-rig.test.js: the career's lessons flown through the real aircraft.
 *
 * Every lesson below is flown by the scripted pilot in ./pilot.js through
 * dist/sim.wasm, with the lesson's own judges watching, and must finish.
 * That is the question no unit test of the judges can answer: whether the
 * aircraft can do what the lesson asks, whether the recogniser names what
 * the lesson listens for, and whether a lesson's numbers (a height band, a
 * ring radius, a stop between two halves) leave room to fly it. Several
 * lessons were changed because this file could not finish them; PROGRESS.md
 * has which, and why.
 *
 * Not here: the race lessons, whose laps tests/career-laps.test.js counts
 * with the game's own lap counter, and the freestyle chapter's tricks flown
 * round objects, which need the built world's solids in the rig.
 *
 * Run with `npm run test:rig`. A few seconds: the rig flies about eighty
 * times faster than real time. Set RIG_REPORT=1 to print each lesson's time
 * against its medals, which is what the medal times were checked against.
 *
 * This file is part of WebFPV.
 *
 * WebFPV is free software: you can redistribute it and/or modify it under
 * the terms of the GNU General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option)
 * any later version.
 *
 * WebFPV is distributed in the hope that it will be useful, but WITHOUT ANY
 * WARRANTY, without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE. See the GNU General Public License for more
 * details.
 *
 * You should have received a copy of the GNU General Public License along
 * with WebFPV. If not, see <https://www.gnu.org/licenses/>.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { flyLesson, splinePath, ringPoints } from './pilot.js';
import { lessonById } from '../../src/career/curriculum.js';
import { docToWorld } from '../../src/career/geometry.js';
import { V, rampPath, circlePath, linePath } from '../../scripts/lib/flightrig.js';
import { normalize } from '../../src/trackbuilder/model.js';
import { placeDocument } from '../../src/maps/built/place.js';
import { NamedGapCounter, namedGaps } from '../../src/game/gaps.js';

const REPORT = Boolean(process.env.RIG_REPORT);
const w = (x, y, z = 0) => docToWorld(160, 160, x, y, z);

/* The named gaps of a lesson's world, and a counter for them, as the shell
 * sets them up when the built map is placed. */
function gapsOf(lesson) {
  const { doc } = normalize(lesson.world.doc);
  const gaps = namedGaps(placeDocument(doc).zones);
  const counter = new NamedGapCounter();
  counter.setGaps(gaps);
  const byName = Object.fromEntries(gaps.map((g) => [g.name, g]));
  return { counter, byName };
}

/* The middle of a gap's window, and points `d` metres either side of it
 * along its normal, `sign` choosing which way through. */
function through(g, d = 6, sign = 1, yOff = 0) {
  const y = g.y + g.h / 2 + yOff;
  return [
    V(g.x - g.nx * d * sign, y, g.z - g.nz * d * sign),
    V(g.x, y, g.z),
    V(g.x + g.nx * d * sign, y, g.z + g.nz * d * sign),
  ];
}

async function setupForTrick(lesson, y = 12, speed = 7) {
  const p = await flyLesson(lesson);
  p.climb(y);
  const c = p.craft().p;
  p.path(rampPath(V(c.x, y, c.z), V(c.x, y, c.z - 16), 3, speed), { heading: Math.PI });
  return p;
}

const PLANS = {
  '1-1': async (L) => {
    const p = await flyLesson(L);
    const pad = w(80, 25);
    p.drive(p.angleLaw(V(pad.x, 2, pad.z)), 8000, () => p.status().index >= 2);
    p.drive(p.landLaw(V(pad.x, 0, pad.z)), 8000);
    return p;
  },
  '1-2': async (L) => {
    const p = await flyLesson(L);
    const b = w(80, 37, 3);
    p.drive(p.angleLaw(V(b.x, b.y, b.z), { vmax: 5, kp: 1.2 }), 30000);
    return p;
  },
  '1-3': async (L) => {
    const p = await flyLesson(L);
    const pad = w(80, 25);
    p.climb(1.5);
    const hs = [0, -90, 180, 90];
    for (let k = 0; k < hs.length; k += 1) {
      p.drive(p.angleLaw(V(pad.x, 1.5, pad.z), { heading: (hs[k] * Math.PI) / 180 }), 6000,
        () => p.status().current && p.status().current.state.index > k);
    }
    return p;
  },
  '1-4': async (L) => {
    const p = await flyLesson(L);
    const c = w(80, 55);
    const pad = w(80, 25);
    p.drive(p.angleLaw(V(c.x, 2.5, c.z), { vmax: 8, kp: 1.0, kv: 1.8 }), 20000, () => p.status().index >= 2);
    p.drive(p.angleLaw(V(pad.x, 2, pad.z), { vmax: 8, kp: 1.0, kv: 1.8 }), 20000, p.near(V(pad.x, 2, pad.z), 1.5));
    p.drive(p.landLaw(V(pad.x, 0, pad.z), 1.4), 8000);
    return p;
  },
  '1-5': async (L) => {
    const p = await flyLesson(L);
    const pads = [[96, 42], [80, 58], [64, 42]];
    for (let k = 0; k < pads.length; k += 1) {
      const t = w(...pads[k]);
      p.drive(p.angleLaw(V(t.x, 1.5, t.z), { vmax: 6, kp: 1.1, kv: 1.8 }), 20000, p.near(V(t.x, 1.5, t.z), 0.7));
      p.drive(p.landLaw(V(t.x, 0, t.z), 1.2), 8000, () => p.status().current && p.status().current.state.index > k);
    }
    return p;
  },
};

/* The Angle ring lessons: the pilot on a line through every ring. */
for (const [id, lead, speed] of [['2-1', 3, 4], ['2-2', 6, 3], ['2-3', 3, 4], ['2-4', 1.5, 4]]) {
  PLANS[id] = async (L) => {
    const p = await flyLesson(L);
    p.climb(2);
    const c = p.craft().p;
    const rings = p.run.objectives.find((o) => o.kind === 'rings').rings;
    p.angleRoute(splinePath([V(c.x, c.y, c.z), ...ringPoints(rings, lead)], speed));
    return p;
  };
}

/* The Acro ring lessons, by the rig's own guidance law. */
for (const [id, lead, speed] of [['3-3', 4, 6], ['3-5', 4, 5]]) {
  PLANS[id] = async (L) => {
    const p = await flyLesson(L);
    p.climb(2);
    const c = p.craft().p;
    const rings = p.run.objectives.find((o) => o.kind === 'rings').rings;
    p.acroRoute(splinePath([V(c.x, c.y, c.z), ...ringPoints(rings, lead)], speed));
    p.hold(2000, 0, 0, 0, 0.3);
    return p;
  };
}

Object.assign(PLANS, {
  '3-1': async (L) => {
    const p = await flyLesson(L);
    p.climb(2);
    const c = p.craft().p;
    const z = p.run.objectives[1].zone;
    p.acroRoute(splinePath([V(c.x, c.y, c.z), V(z.c.x, z.c.y, z.c.z)], 4));
    p.path(linePath(V(z.c.x, z.c.y, z.c.z), V(z.c.x, z.c.y, z.c.z), 22), { heading: Math.PI });
    return p;
  },
  '3-2': async (L) => {
    const p = await flyLesson(L);
    p.climb(3);
    const c = p.craft().p;
    const rings = p.run.objectives[0].rings;
    const last = rings[rings.length - 1];
    const pts = ringPoints(rings, 3);
    pts.push(V(last.c.x + last.n.x * 90, last.c.y, last.c.z + last.n.z * 90));
    p.acroRoute(splinePath([V(c.x, c.y, c.z), ...pts], 11));
    return p;
  },
  '3-4': async (L) => {
    const p = await flyLesson(L);
    p.climb(2);
    const c = p.craft().p;
    const o = p.run.objectives[0];
    const r = (o.rMin + o.rMax) / 2;
    const ctr = V(o.center.x, 4, o.center.z);
    p.acroRoute(splinePath([V(c.x, c.y, c.z), V(ctr.x + r, 4, ctr.z)], 5));
    p.acroRoute(circlePath(ctr, V(1, 0, 0), V(0, 0, -1), r, (2 * Math.PI * r) / 8, 0, 2.15));
    p.hold(2000, 0, 0, 0, 0.3);
    return p;
  },
});

/* Big Gaps: the gaps' own windows, the gap counter the shell runs. */
function gapPlan(names, { speed = 6, y0 = 2.5 } = {}) {
  return async (L) => {
    const { counter, byName } = gapsOf(L);
    const p = await flyLesson(L, { gaps: counter });
    p.climb(y0);
    const c = p.craft().p;
    const pts = [V(c.x, c.y, c.z)];
    for (const step of names) {
      const [name, sign = 1, d = 6] = Array.isArray(step) ? step : [step];
      if (name.startsWith('@')) {
        const [x, y, z] = name.slice(1).split(',').map(Number);
        pts.push(V(x, y, z));
        continue;
      }
      pts.push(...through(byName[name], d, sign));
    }
    p.acroRoute(splinePath(pts, speed));
    p.hold(1500, 0, 0, 0, 0.3);
    return p;
  };
}

Object.assign(PLANS, {
  '4-1': gapPlan(['WIDE GAP', '@0,3,15', '@12,4,22', '@10,4,44', '@0,3,48', ['WIDE GAP', 1, 4]]),
  '4-2': gapPlan(['UNDER THE BRIDGE', '@6,2,-6', '@26,2,-4', ['BILLBOARD GAP', -1]], { speed: 5 }),
  '4-3': gapPlan(['WIDE GAP', 'UNDER THE BRIDGE', 'SIX METRE GAP', 'FOUR METRE GAP'], { speed: 5 }),
  '4-4': gapPlan(['@-10,2.5,40', '@-30,2.5,-2', ['THE ARCADE', -1]], { speed: 5 }),
  '4-5': gapPlan(['WIDE GAP', 'UNDER THE BRIDGE', 'SIX METRE GAP', 'FOUR METRE GAP',
    '@0,3,-56', '@20,3,-48', '@28,3,-20', '@20,2,2', '@22,1.7,10', ['BILLBOARD GAP', 1],
    '@52,3,16', '@40,3,30', '@-10,3,20', '@-26,3,-4', ['THE ARCADE', -1]], { speed: 5 }),
});

/* Flips and rolls: climb, run in, full stick until the gyro has the turn. */
Object.assign(PLANS, {
  '5-1': async (L) => { const p = await setupForTrick(L, 10, 6); p.rotate('pitch', -1, 1, { thr: 0.2 }); p.recover(); p.hold(1500, 0, 0, 0, 0.3); return p; },
  '5-2': async (L) => { const p = await setupForTrick(L, 10, 6); p.rotate('roll', 1, 1, { thr: 0.2 }); p.recover(); p.hold(1500, 0, 0, 0, 0.3); return p; },
  '5-3': async (L) => { const p = await setupForTrick(L, 10, 6); p.rotate('pitch', 1, 1, { thr: 0.2 }); p.recover(); p.hold(1500, 0, 0, 0, 0.3); return p; },
  '5-4': async (L) => {
    const p = await setupForTrick(L, 10, 6);
    p.rotate('roll', -1, 1, { thr: 0.2 });
    p.recover();
    const c = p.craft().p;
    p.path(rampPath(V(c.x, 10, c.z), V(c.x, 10, c.z - 14), 3, 6), { heading: Math.PI });
    p.rotate('roll', 1, 1, { thr: 0.2 });
    p.recover();
    p.hold(1500, 0, 0, 0, 0.3);
    return p;
  },
  '5-5': async (L) => { const p = await setupForTrick(L, 14, 6); p.rotate('pitch', -1, 2, { thr: 0.15 }); p.recover(); p.hold(1500, 0, 0, 0, 0.3); return p; },
  '6-1': async (L) => {
    const p = await setupForTrick(L);
    p.rotate('roll', 1, 0.25, { thr: 0.45, rate: 0.6 });
    p.hold(1300, 0, 0, 0, 0.45);
    p.rotate('roll', -1, 0.25, { thr: 0.4, rate: 0.6 });
    p.hold(800, 0, 0, 0, 0.4);
    return p;
  },
  '6-2': async (L) => {
    const p = await setupForTrick(L, 20);
    p.rotate('roll', 1, 0.5, { thr: 0.1, rate: 0.8 });
    p.hold(1300, 0, 0, 0, 0.08);
    p.rotate('roll', -1, 0.5, { thr: 0.2, rate: 0.8 });
    p.hold(800, 0, 0, 0, 0.4);
    return p;
  },
  '6-3': async (L) => {
    const p = await setupForTrick(L, 14);
    p.rotate('roll', 1, 0.5, { thr: 0.1, rate: 0.8 });
    p.hold(620, 0, 0, 0, 0.08);
    p.rotate('roll', 1, 0.5, { thr: 0.2, rate: 0.8 });
    p.hold(600, 0, 0, 0, 0.5);
    p.recover();
    return p;
  },
  '6-4': async (L) => {
    const p = await setupForTrick(L, 25);
    p.rotate('pitch', -1, 0.5, { thr: 0.1, rate: 0.8 });
    p.hold(620, 0, 0, 0, 0.08);
    p.rotate('pitch', -1, 0.5, { thr: 0.2, rate: 0.8 });
    p.hold(600, 0, 0, 0, 0.5);
    p.recover();
    return p;
  },
  '6-5': async (L) => {
    const p = await setupForTrick(L, 14);
    p.rotate('roll', 1, 0.5, { thr: 0.1, rate: 0.8 });
    p.hold(620, 0, 0, 0, 0.08);
    p.rotate('roll', -1, 0.5, { thr: 0.2, rate: 0.8 });
    p.hold(600, 0, 0, 0, 0.5);
    p.recover();
    return p;
  },
});

/* Hibari Yard's gaps. */
Object.assign(PLANS, {
  '9-1': gapPlan(['@-30,3,10', ['BILLBOARD GAP', 1, 8], '@50,3,6', '@64,3,-4', ['FOOTBRIDGE', 1, 8]], { speed: 6 }),
  '9-5': async (L) => {
    const { counter, byName } = gapsOf(L);
    const p = await flyLesson(L, { gaps: counter });
    p.climb(12);
    const c = p.craft().p;
    const wt = byName['WATER TOWER'];
    const cr = byName['CRANE GAP'];
    const pts = [V(c.x, 12, c.z), ...through(wt, 10, 1), V(wt.x + 18, wt.y + 4, wt.z - 6), V(cr.x + 10, cr.y + 2, cr.z + 24), ...through(cr, 10, -1)];
    p.acroRoute(splinePath(pts, 5));
    p.hold(1500, 0, 0, 0, 0.3);
    return p;
  },
});

/* The checkride: rings, a flip and a roll, a knife edge and the pad. */
PLANS['10-1'] = async (L) => {
  const p = await flyLesson(L);
  p.climb(2);
  let c = p.craft().p;
  const rings = p.run.objectives[0].rings;
  p.acroRoute(splinePath([V(c.x, c.y, c.z), ...ringPoints(rings, 4)], 5));
  c = p.craft().p;
  p.acroRoute(splinePath([V(c.x, c.y, c.z), V(c.x, 12, c.z - 6)], 4));
  c = p.craft().p;
  p.path(rampPath(V(c.x, 12, c.z), V(c.x, 12, c.z - 14), 3, 6), { heading: Math.PI });
  p.rotate('pitch', -1, 1, { thr: 0.2 });
  p.recover();
  c = p.craft().p;
  p.path(rampPath(V(c.x, 12, c.z), V(c.x, 12, c.z - 14), 3, 6), { heading: Math.PI });
  p.rotate('roll', 1, 1, { thr: 0.2 });
  p.recover();
  c = p.craft().p;
  p.path(rampPath(V(c.x, 12, c.z), V(c.x, 12, c.z - 14), 3, 7), { heading: Math.PI });
  p.rotate('roll', 1, 0.25, { thr: 0.45, rate: 0.6 });
  p.hold(1300, 0, 0, 0, 0.45);
  p.rotate('roll', -1, 0.25, { thr: 0.4, rate: 0.6 });
  p.hold(800, 0, 0, 0, 0.4);
  p.recover();
  const pad = w(80, 25);
  c = p.craft().p;
  p.acroRoute(splinePath([V(c.x, c.y, c.z), V(pad.x, 2, pad.z)], 5));
  p.landAcro(pad);
  return p;
};

/* The Rookie Licence: the ring road, one circle round the pylon, the pad. */
PLANS['rk-1'] = async (L) => {
  const p = await flyLesson(L);
  p.climb(2);
  let c = p.craft().p;
  const rings = p.run.objectives[0].rings;
  p.acroRoute(splinePath([V(c.x, c.y, c.z), ...ringPoints(rings, 4)], 5));
  const o = p.run.objectives[1];
  const r = (o.rMin + o.rMax) / 2;
  const ctr = V(o.center.x, 4, o.center.z);
  c = p.craft().p;
  p.acroRoute(splinePath([V(c.x, c.y, c.z), V(ctr.x + r, 4, ctr.z)], 5));
  p.acroRoute(circlePath(ctr, V(1, 0, 0), V(0, 0, -1), r, (2 * Math.PI * r) / 8, 0, 1.15));
  const pad = w(80, 25);
  c = p.craft().p;
  p.acroRoute(splinePath([V(c.x, c.y, c.z), V(pad.x, 2, pad.z)], 5));
  p.landAcro(pad);
  return p;
};

PLANS['10-2'] = async (L) => {
  const plan = gapPlan(['WIDE GAP', 'UNDER THE BRIDGE', 'SIX METRE GAP', 'FOUR METRE GAP',
    '@0,3,-56', '@20,3,-48', '@28,3,-20', '@20,2,2', '@22,1.7,10', ['BILLBOARD GAP', 1],
    '@52,3,16', '@40,3,30', '@-10,3,20', '@-26,3,-4', ['THE ARCADE', -1], '@-56,3,-10', '@-30,3,20', '@0,2,56'], { speed: 5 });
  const p = await plan(L);
  const pad = docToWorld(160, 160, 80, 18);
  p.landAcro(pad, 5);
  return p;
};

/*
 * Brake Points (rc-2): the straights fast and the hairpins slow, as four
 * legs of the rig's own line, each one flown at its own speed and eased in
 * and out, so the fast rings are crossed at the leg's cruise and the brake
 * rings after an easing that a pilot's pull back stands for.
 */
PLANS['rc-2'] = async (L) => {
  const p = await flyLesson(L);
  p.climb(3);
  const rings = p.run.objectives[0].rings;
  const at = (i) => V(rings[i].c.x, rings[i].c.y, rings[i].c.z);
  const leg = (pts, speed) => {
    const c = p.craft().p;
    p.acroRoute(splinePath([V(c.x, c.y, c.z), ...pts], speed));
  };
  const w3 = (x, y) => w(x, y, 3);
  leg([at(0), at(1), w3(80, 92)], 16);
  leg([at(2), at(3), at(4), at(5), w3(108, 94)], 6);
  leg([at(6), w3(108, 62)], 16);
  leg([at(7), at(8), at(9), at(10), w3(78, 62)], 6);
  return p;
};

/* The Line (rc-3) is not flown here: its rings sit at a five foot gate's
 * middle, a metre up, and the rig's height loop swings a metre either way
 * in Acro at that height (tests/career/pilot.js path), so it misses rings a
 * pilot flies through. Its medals are the track's lap medals instead. */

const rows = [];
for (const [id, plan] of Object.entries(PLANS)) {
  const lesson = lessonById(id);
  test(`rig flies lesson ${id} ${lesson.title} to the end`, async () => {
    const p = await plan(lesson);
    const s = p.status();
    rows.push([id, lesson.title, s.phase, s.elapsedMs, s.medal, lesson.medals]);
    assert.equal(s.phase, 'complete', `${id} ended ${s.phase} on objective ${s.index + 1} of ${s.count}`
      + `${s.current ? ` (${s.current.kind}${s.current.detail ? `, ${s.current.detail}` : ''})` : ''}`
      + `; tricks seen: ${p.tricks.map((t) => t.name).join(', ') || 'none'}`
      + `; gaps: ${p.gapLog.join(', ') || 'none'}`);
  });
}

test.after(() => {
  if (!REPORT) {
    return;
  }
  for (const [id, title, phase, ms, medal, m] of rows) {
    console.log(`${id.padEnd(5)} ${title.padEnd(26)} ${phase.padEnd(8)} ${(ms / 1000).toFixed(1).padStart(6)} s  ${String(medal).padEnd(6)}  gold ${(m.gold / 1000).toFixed(1)}  silver ${(m.silver / 1000).toFixed(1)}`);
  }
});
