#!/usr/bin/env node
/*
 * review-views-selftest.js: the geometry of src/review/views.js, driven in
 * Node. The drawing itself is checked in the browser by
 * scripts/review-check.js.
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


import { F, TRACE_FIELDS, TraceLap } from '../src/review/trace.js';
import { gateAcross, gateUp, travelAxis } from '../src/game/race.js';
import {
  anchorIn, labelCandidates, lineOfGhost, lineOfTrace, localOf, openingCorners, pathOf, placeLabel,
  scaleMetres, sectionGates, shrinkQuad, sideBar, sideFrame, sideOf, stationOf, stationsOfRaceGates, throughPlane,
} from '../src/review/views.js';

let failures = 0;

function check(name, cond, detail = '') {
  if (cond) {
    console.log(`  pass  ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`);
  }
}

const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

console.log('the lines');
{
  const count = 5;
  const data = new Float32Array(count * TRACE_FIELDS);
  for (let i = 0; i < count; i += 1) {
    data[i * TRACE_FIELDS + F.T] = i * 10 - 20;
    data[i * TRACE_FIELDS + F.PX] = i;
    data[i * TRACE_FIELDS + F.PY] = 2 * i;
    data[i * TRACE_FIELDS + F.PZ] = 3 * i;
  }
  const trace = new TraceLap({ rateHz: 100, durationMs: 20, splits: [20], cuts: [], lead: 2, count, data, worldScale: 1, meta: {} });
  const line = lineOfTrace(trace);
  check('a trace gives its times and positions', line.t[0] === -20 && line.t[4] === 20 && line.x[3] === 3 && line.y[3] === 6 && line.z[3] === 9);
  const ghost = { rateHz: 30, count: 3, pos: new Float32Array([0, 0, 0, 1, 1, 1, 2, 2, 2]) };
  const g = lineOfGhost(ghost);
  check('a ghost gives its grid of times and its positions', near(g.t[1], 1000 / 30) && g.x[2] === 2 && g.z[1] === 1);
}

console.log('a path through a section');
{
  const line = { t: [0, 100, 200, 300], x: [0, 1, 2, 3], y: [0, 0, 0, 0], z: [0, 10, 20, 30] };
  const p = pathOf(line, 50, 250);
  check('both ends are placed between samples', near(p[0][0], 0.5) && near(p[p.length - 1][0], 2.5) && near(p[p.length - 1][2], 25));
  check('with the samples inside between them', p.length === 4 && p[1][0] === 1 && p[2][0] === 2);
  check('an end on a sample is that sample', near(pathOf(line, 100, 200)[0][0], 1) && near(pathOf(line, 100, 200).at(-1)[0], 2));
  check('ends outside the line are held at its ends', near(pathOf(line, -50, 400)[0][0], 0) && near(pathOf(line, -50, 400).at(-1)[0], 3));
  check('an empty line is an empty path', pathOf({ t: [], x: [], y: [], z: [] }, 0, 1).length === 0);
}

console.log('the stations, as the race scores them');
{
  /* Gates as src/game/race.js makes them: a heading, a tilt, and the axes
   * made from them. Heading 0 is flown towards -z. */
  const gate = (x, z, heading, pitch, extra = {}) => ({
    x, y: 1, z, ax: gateAcross(heading), ay: gateUp(heading, pitch), az: travelAxis(heading, pitch),
    apertures: [{ centreY: 0.5, clearW: 2, clearH: 1.5 }], ...extra,
  });
  const st = stationsOfRaceGates([gate(0, 0, 0, 0, { virtual: true }), gate(1, 0, 0, 0), gate(2, 0, Math.PI / 2, 0)]);
  check('they start at the timing gate, the first that is not a flag', st[0].x === 1 && st[2].x === 0 && st[2].virtual === true);
  check('the opening is the first aperture, centred above the station', st[0].y === 1.5 && st[0].clearW === 2 && st[0].clearH === 1.5);
  check('with the race\'s own axes', near(st[1].az.x, -1) && near(st[0].az.z, -1) && near(st[0].ay.y, 1));

  const up = stationOf({ x: 0, y: 1, z: 0, clearW: 2, clearH: 1 });
  const c = openingCorners(up);
  check('an upright opening stands in one plane across its travel', c.every((p) => near(p[2], 0)), JSON.stringify(c));
  check('as wide and as tall as it is', near(Math.max(...c.map((p) => p[0])) - Math.min(...c.map((p) => p[0])), 2) && near(Math.max(...c.map((p) => p[1])) - Math.min(...c.map((p) => p[1])), 1));
  /* A dive gate tilted a quarter turn: flown straight up, lying flat. */
  const dive = stationOf({ x: 0, y: 2, z: 0, pitch: Math.PI / 2, clearW: 2, clearH: 1 });
  const d = openingCorners(dive);
  check('a dive gate lies flat: every corner at its height', d.every((p) => near(p[1], 2, 1e-9)), JSON.stringify(d));
  check('and spreads over the ground instead', near(Math.max(...d.map((p) => p[0])) - Math.min(...d.map((p) => p[0])), 2) && near(Math.max(...d.map((p) => p[2])) - Math.min(...d.map((p) => p[2])), 1, 1e-9));
  check('a point through an upright opening is z = 0 at its centre, ahead is +z', near(localOf(up, [0, 1, 0]).z, 0) && near(localOf(up, [0, 1, -0.3]).z, 0.3) && near(localOf(up, [0.4, 1.2, 0]).x, -0.4) && near(localOf(up, [0.4, 1.2, 0]).y, 0.2));
  check('through a dive gate, ahead is up', near(localOf(dive, [0, 2.5, 0]).z, 0.5));
}

console.log('a section is drawn from opening to opening');
{
  /* An upright gate at z = 0 flown towards -z, and a line through it at a
   * metre a second: z from +1 to -1 over two seconds. The race credits it
   * half a metre early, at 500 ms. */
  const gate = stationOf({ x: 0, y: 1, z: 0 });
  const line = { t: [], x: [], y: [], z: [] };
  for (let i = 0; i <= 200; i += 1) {
    line.t.push(i * 10); line.x.push(0.1); line.y.push(1); line.z.push(1 - i / 100);
  }
  check('from a split at the box\'s edge, the plane half a metre on', near(throughPlane(line, gate, 500), 1000, 1e-6), `${throughPlane(line, gate, 500)}`);
  check('from a split at the plane, the plane', near(throughPlane(line, gate, 1000), 1000, 1e-6));
  check('between two samples, interpolated', near(throughPlane(line, gate, 995), 1000, 1e-6));
  check('a line that never reaches it within the look keeps the split', throughPlane(line, gate, 500, 100) === 500);
  const away = { t: [0, 10, 20], x: [0, 0, 0], y: [1, 1, 1], z: [-1, 0, 1] };
  check('a line flown through backwards does not count', throughPlane(away, gate, 0) === 0);
  const dive = stationOf({ x: 0, y: 2, z: 0, pitch: Math.PI / 2 });
  const up = { t: [0, 100, 200], x: [0, 0, 0], y: [1.5, 2, 2.5], z: [0, 0, 0] };
  check('and through a dive gate, the level it lies at', near(throughPlane(up, dive, 0), 100, 1e-6));
}

console.log('the side view looks across the section');
{
  /* A section flown towards +x with a wobble: the view's direction is +x. */
  const path = [[0, 1, 0], [1, 1.2, 0.2], [2, 1.1, -0.1], [3, 1, 0]];
  const f = sideFrame([path, []], stationOf({ x: 0, y: 1, z: 0 }));
  check('along the way the lines spread furthest', near(Math.abs(f.x), 1, 0.05) && near(f.z, 0, 0.1), JSON.stringify(f));
  const s = sideOf(path, f);
  check('pointed from the section\'s start to its end, so it reads left to right', s[3][0] > s[0][0]);
  const back = sideFrame([[...path].reverse()], stationOf({ x: 0, y: 1, z: 0 }));
  check('the same line flown the other way is pointed the other way', back.x < 0 && sideOf([...path].reverse(), back)[3][0] > sideOf([...path].reverse(), back)[0][0]);
  check('a point is its distance along and its height', near(s[0][1], 1) && near(s[3][0] - s[0][0], 3, 0.05));
  /* A gate left sideways: the first cut looked across the first gate's
   * travel (-z here), so this section was seen end on. */
  const sideways = [[0, 1, 0], [0.5, 1, -0.3], [2, 1, -0.4], [4, 1, -0.3]];
  const g = sideFrame([sideways], stationOf({ x: 0, y: 1, z: 0 }));
  check('a section that leaves its first gate sideways is seen side on, not end on', Math.abs(g.x) > 0.95, JSON.stringify(g));
  const hover = sideFrame([[[1, 1, 1], [1, 1.2, 1]]], stationOf({ x: 0, y: 1, z: 0, heading: Math.PI / 2 }));
  check('with no spread over the ground, the first gate\'s travel', near(Math.abs(hover.x), 1) && near(hover.z, 0, 1e-9), JSON.stringify(hover));
  const diveHover = sideFrame([[]], stationOf({ x: 0, y: 1, z: 0, pitch: Math.PI / 2 }));
  check('or across it when that gate is flown straight up', near(Math.hypot(diveHover.x, diveHover.z), 1), JSON.stringify(diveHover));
}

console.log('a view draws the section\'s two gates and no other');
{
  const stations = [
    stationOf({ x: 0, y: 1, z: 0, clearW: 1, clearH: 1 }),
    stationOf({ x: 0, y: 1, z: -6, clearW: 1, clearH: 1 }),
    stationOf({ x: 8, y: 1, z: -3, clearW: 1, clearH: 1 }),
  ];
  const top = sectionGates(stations, [0, 1], (p) => [p[0], p[2]]);
  check('two outlines, the section\'s own', top.length === 2 && top[0].list[0] === 0 && top[1].list[0] === 1);
  check('each its opening\'s four corners on the picture', top[0].quad.length === 4 && top[0].quad.every((q) => near(q[1], 0)));
  check('one when the section starts and ends at the same gate', sectionGates(stations, [0, 0], (p) => [p[0], p[2]]).length === 1);
  const along = { x: 0, z: -1, ox: 0, oz: 0 };
  const [edge] = sectionGates([stationOf({ x: 0, y: 1, z: -2, clearW: 2, clearH: 1 })], [0], (p) => sideOf([p], along)[0]);
  const us = edge.quad.map((q) => q[0]);
  const vs = edge.quad.map((q) => q[1]);
  check('from the side an upright gate seen along its travel is an upright bar', near(Math.max(...us) - Math.min(...us), 0, 1e-9) && near(Math.max(...vs) - Math.min(...vs), 1));
  const [flat] = sectionGates([stationOf({ x: 0, y: 2, z: -2, pitch: Math.PI / 2, clearW: 2, clearH: 1 })], [0], (p) => sideOf([p], along)[0]);
  check('and a dive gate a level bar at its height', flat.quad.every((q) => near(q[1], 2, 1e-9)));

  /* From the side every gate is a bar (sideBar), even one seen face on. */
  const faceSt = stationOf({ x: 3, y: 1, z: -2, heading: Math.PI / 2, clearW: 2, clearH: 1 });
  const face = sideBar(sectionGates([faceSt], [0], (p) => sideOf([p], along)[0])[0].quad, faceSt);
  const fu = face.map((q) => q[0]);
  const fv = face.map((q) => q[1]);
  check('a gate seen face on from the side is an upright bar, not its box', near(Math.max(...fu) - Math.min(...fu), 0, 1e-9) && near(Math.max(...fv) - Math.min(...fv), 1), JSON.stringify(face));
  check('standing at the middle of where it falls, with no line to place it', near(fu[0], 2, 1e-9));
  const placed = sideBar(sectionGates([faceSt], [0], (p) => sideOf([p], along)[0])[0].quad, faceSt, 1.4);
  check('or where your line went through it', near(placed[0][0], 1.4, 1e-9));
  const kept = sideBar(sectionGates([faceSt], [0], (p) => sideOf([p], along)[0])[0].quad, faceSt, 9);
  check('kept inside the opening\'s width', near(kept[0][0], 3, 1e-9), JSON.stringify(kept));
  const diveSt = stationOf({ x: 0, y: 2, z: -2, pitch: Math.PI / 2, clearW: 2, clearH: 1 });
  const dive = sideBar(sectionGates([diveSt], [0], (p) => sideOf([p], along)[0])[0].quad, diveSt);
  check('a dive gate is a level bar the length it spans', dive.every((q) => near(q[1], 2, 1e-9)) && near(Math.max(...dive.map((q) => q[0])) - Math.min(...dive.map((q) => q[0])), 1, 1e-9), JSON.stringify(dive));
}

console.log('a gap between outlines that touch');
{
  /* An upright bar from y 100 up to 40, its four corners in pairs. */
  const bar = shrinkQuad([[10, 100], [10, 100], [10, 40], [10, 40]], 4);
  check('a bar is drawn short of each end', near(bar[0][1], 96) && near(bar[2][1], 44) && bar[0][0] === 10);
  const above = shrinkQuad([[10, 40], [10, 40], [10, 0], [10, 0]], 4);
  check('so two bars that meet leave twice that between them', near(bar[2][1] - above[0][1], 8), `${bar[2][1]} to ${above[0][1]}`);
  const short = shrinkQuad([[0, 0], [0, 0], [8, 0], [8, 0]], 4);
  check('a short bar comes in a quarter of the way at each end, no more', near(short[2][0] - short[0][0], 6));
  const box = shrinkQuad([[0, 0], [100, 0], [100, 50], [0, 50]], 4);
  check('a face on opening comes in at every corner', box[0][0] > 0 && box[0][1] > 0 && box[2][0] < 100 && box[2][1] < 50);
  check('a point is left alone', JSON.stringify(shrinkQuad([[3, 3], [3, 3], [3, 3], [3, 3]], 4)) === '[[3,3],[3,3],[3,3],[3,3]]');
}

console.log('where an outline\'s label is anchored');
check('the middle of the part in the picture', JSON.stringify(anchorIn([[-100, 10], [100, 10], [100, 30], [-100, 30]], 200, 100)) === '[50,20]');
check('none for an outline wholly outside it', anchorIn([[300, 10], [400, 10], [400, 30], [300, 30]], 200, 100) === null);

console.log('where a label goes');
{
  const bounds = { x: 0, y: 0, w: 200, h: 100 };
  const c = labelCandidates(100, 50, 30, 12, 6);
  check('first to the right of its anchor, then to the left', c[0].x === 106 && c[1].x === 64 && c[0].y === 44);
  check('then a line up and a line down', c[2].y === 44 - 18 && c[4].y === 44 + 18);
  const taken = [];
  const a = placeLabel(c, taken, [], bounds);
  check('the first free place is the first choice', a === c[0] && taken.length === 1);
  const b = placeLabel(labelCandidates(100, 50, 30, 12, 6), taken, [], bounds);
  check('a second label at the same anchor goes left, not on top', b.x === 64 && b.y === 44);
  const d = placeLabel(labelCandidates(100, 50, 30, 12, 6), taken, [], bounds);
  check('a third goes a line up', d.y === 26);
  const e = placeLabel(labelCandidates(20, 50, 30, 12, 6), [], [[30, 50]], bounds);
  check('a label keeps off a line', !(30 > e.x && 30 < e.x + e.w && 50 > e.y && 50 < e.y + e.h), JSON.stringify(e));
  const f = placeLabel(labelCandidates(195, 50, 30, 12, 6), [], [], bounds);
  check('and inside the picture at its right edge', f.x + f.w <= 200, JSON.stringify(f));
  const crowd = [];
  for (let k = 0; k < 20; k += 1) {
    placeLabel(labelCandidates(100, 50, 30, 12, 6), crowd, [], bounds);
  }
  check('when nowhere is free it still places it, inside the picture', crowd.length === 20 && crowd.every((r) => r.y >= 0 && r.y + r.h <= 100));
}

console.log('the scale bar');
check('the first step at least the share of the width', scaleMetres(1, 10, 400, 0.1) === 5);
check('in OSD metres, so a room at a third of life size reads its own metres', scaleMetres(1 / 3, 10, 400, 0.1) === 20);
check('the longest step when none is long enough', scaleMetres(1, 0.01, 400, 0.1) === 50);

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
