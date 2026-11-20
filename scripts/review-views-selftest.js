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
  lineOfGhost, lineOfTrace, pathOf, scaleMetres, sideAxis, sideGates, sideOf, stationsOfRaceGates, topSpots,
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

console.log('the scale bar');
check('the first step at least the share of the width', scaleMetres(1, 10, 400, 0.1) === 5);
check('in OSD metres, so a room at a third of life size reads its own metres', scaleMetres(1 / 3, 10, 400, 0.1) === 20);
check('the longest step when none is long enough', scaleMetres(1, 0.01, 400, 0.1) === 50);

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
