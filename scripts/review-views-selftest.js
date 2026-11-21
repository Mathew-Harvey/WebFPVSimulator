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
import {
  insetBar, labelCandidates, lateralOf, lineOfGhost, lineOfTrace, nearSideGates, pathOf, placeLabel, scaleMetres, sideAxis, sideGates, sideOf, stationsOfRaceGates, topSpots,
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

console.log('the stations');
{
  /* Heading h has travel axis (-sin h, -cos h): flying -z is heading 0. */
  const gate = (x, z, az, extra = {}) => ({ x, y: 1, z, az: { x: az[0], y: 0, z: az[1] }, apertures: [{ centreY: 0.5, clearW: 2, clearH: 1.5 }], ...extra });
  const gates = [gate(0, 0, [0, 0], { virtual: true }), gate(1, 0, [0, -1]), gate(2, 0, [-1, 0])];
  const st = stationsOfRaceGates(gates);
  check('they start at the timing gate, the first that is not a flag', st[0].x === 1 && st[2].x === 0 && st[2].virtual === true);
  check('a heading comes back from the travel axis', near(st[0].yaw, 0) && near(st[1].yaw, Math.PI / 2));
  check('the opening is the first aperture, centred above the station', st[0].y === 1.5 && st[0].clearW === 2 && st[0].clearH === 1.5);
  const spots = topSpots([{ x: 0, z: 0, clearW: 2 }, { x: 5, z: 0, clearW: 2 }, { x: 0.1, z: 0, clearW: 2 }]);
  check('openings stacked at one spot are one label', spots.length === 2 && JSON.stringify(spots[0].list) === '[0,2]');
}

console.log('the side view');
{
  /* A station at (2, ., 3) flown towards -z. */
  const stations = [
    { x: 2, y: 1, z: 3, yaw: 0, clearW: 2, clearH: 2, virtual: false },
    { x: 2, y: 4, z: -5, yaw: 0, clearW: 2, clearH: 1, virtual: false },
    { x: 9, y: 1, z: 0, yaw: Math.PI / 2, clearW: 2, clearH: 2, virtual: false },
    { x: 2, y: 1, z: -9, yaw: Math.PI, clearW: 2, clearH: 2, virtual: true },
  ];
  const axis = sideAxis(stations, 0);
  check('the axis is the station\'s travel, from the station', near(axis.x, 0) && near(axis.z, -1) && axis.ox === 2 && axis.oz === 3);
  const s = sideOf([[2, 1.5, 3], [7, 2, -1]], axis);
  check('a point is its distance along the axis and its height', near(s[0][0], 0) && s[0][1] === 1.5 && near(s[1][0], 4) && s[1][1] === 2);
  const g = sideGates(stations, axis);
  check('gates flown along the axis are seen edge on, one across it and a flag are not', g.length === 2 && g[0].i === 0 && g[1].i === 1);
  check('each with its place along the axis and its bottom and top', near(g[1].along, 8) && g[1].lo === 3.5 && g[1].hi === 4.5);
}

console.log('which gates the side view draws');
{
  /* Flying -z from (0, ., 0). lateralOf is the signed offset across the
   * axis; only its size, measured the same way for the lines and the
   * gates, matters here. */
  const axis = { x: 0, z: -1, ox: 0, oz: 0 };
  check('sideways is across the travel, along is along it', near(Math.abs(lateralOf([3, 0, -5], axis)), 3) && near(lateralOf([0, 0, -5], axis), 0));
  const st = (x, z, y, i) => ({ x, y, z, yaw: 0, clearW: 1, clearH: 1, virtual: false, i });
  const stations = [
    st(0, 0, 1),      /* 0: the section's first gate */
    st(0, -6, 1),     /* 1: its last */
    st(0, -3, 3),     /* 2: a bay stacked above the path, in the middle */
    st(8, -3, 1),     /* 3: across the room, at the same distance along */
    st(0, -40, 1),    /* 4: in line, but far beyond the section */
  ];
  const gates = sideGates(stations, axis);
  check('each gate carries its sideways offset and half width', gates.length === 5 && near(Math.abs(gates[3].lat), 8) && gates[3].halfW === 0.5);
  /* The lines wander half a metre either side of the axis. */
  const points = [[0, 1, 0], [0.5, 1.2, -2], [-0.5, 1.1, -4], [0, 1, -6]];
  const kept = nearSideGates(gates, points, axis, [0, 1]).map((q) => q.i);
  check('a gate across the room at the same distance along is left out', !kept.includes(3), JSON.stringify(kept));
  check('a bay stacked over the path is kept', kept.includes(2), JSON.stringify(kept));
  check('a gate far beyond the section is left out', !kept.includes(4), JSON.stringify(kept));
  check('the section\'s own two are always kept', kept.includes(0) && kept.includes(1));
  const far = nearSideGates(gates, points, axis, [0, 3]).map((q) => q.i);
  check('even when one of them stands across the room', far.includes(3));
  check('with no lines, only the section\'s own', JSON.stringify(nearSideGates(gates, [], axis, [0, 1]).map((q) => q.i)) === '[0,1]');
}

console.log('a gap between bars that touch');
{
  const [p, q] = insetBar([10, 100], [10, 40], 4);
  check('a bar is drawn short of each end', near(p[1], 96) && near(q[1], 44) && p[0] === 10);
  /* A second bar from 40 up to 0, meeting the first at 40. */
  const [r] = insetBar([10, 40], [10, 0], 4);
  check('so two bars that meet leave twice that between them', near(q[1] - r[1], 8), `${q[1]} to ${r[1]}`);
  const [s, t] = insetBar([0, 0], [8, 0], 4);
  check('a short bar keeps half its length', near(t[0] - s[0], 4));
  const [u, v] = insetBar([3, 3], [3, 3], 4);
  check('a bar of no length is left alone', u[0] === 3 && v[1] === 3);
}

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
