/*
 * importtinylaps.js: a track from TinyLaps (tinylaps.kwayzu.com), read into ours.
 *
 * TinyLaps is a whoop track editor of PVC pipe on a grid. It exports
 * { format: 'whoop-gate-editor', version, units: 'metres', ruleset, name,
 * connections: [ { start: [x, y, z], end: [x, y, z] } ], racePoints: [ { position,
 * rotation, size, exportToVelocidrone? } ] }. A pilot who drew a track there presses
 * Open in WebFPV and is flying it here, so everything below is read without asking.
 *
 * WHAT MAPS, read from the editor's own code (its validator and its race point
 * markers), not guessed from one file:
 *
 *   Frame. Theirs is Three.js: Y up, metres, origin in the middle of the build. Ours is
 *   Z up with the origin at the hall's near left corner, so x is kept, y is minus their
 *   z, z is their y, and the build's footprint is centred in our hall.
 *   Pipes. A connection is one straight pipe along one axis. Touching pipes on one line
 *   are joined into a run first, so a frame reads as its few long members rather than
 *   its many short ones. An upright run is a pole; a level run is a horizontal pole at
 *   its own height. Both are marked `pvc`, so they are drawn as frame pipe rather than
 *   as race pieces, and a bar has no legs: see isPvcPipe in elements.js.
 *   Race points. A point is a rectangle, `size` wide along its local x and high along
 *   its local y, flown along its local +z (the arrow their editor draws). Each one is an
 *   INVISIBLE gate here: the opening scores and lights and nothing is built round it,
 *   because the pipe that bounds it is already standing. A point flown twice, either way
 *   round, is one gate flown twice.
 *   Checkpoints. A point with exportToVelocidrone false is their "nav only": it shapes
 *   the line and does not score, which is our waypoint. The first checkpoint is their
 *   start and finish, so the flying order starts there.
 *
 * WHAT DOES NOT, said in the report and never silently: a pipe that is not along an
 * axis (their editor does not make one) is left out; an upright that does not reach the
 * floor stands on it, because a pole does; the grid and
 * the parts limits are not kept, because RaceGOW's rules are checked here by ours.
 *
 * Pure: no DOM, no fetch. The simulator reads one from a link (tinylaps.js in
 * src/share) and the builder from a file or pasted text.
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

import { createTrack, createElement, normalize } from './model.js';
import { addToSequence } from './sequence.js';
import { applyAutoFaces } from './faces.js';
import { GATE_OPENING_MAX, GATE_OPENING_MIN, PIPE_OD, inches } from './racegow.js';

/* Their editor's own limits (2,000 pipes, 256 race points, 2 MB of text). A file over
 * them did not come from it. */
const MAX_PIPES = 2000;
const MAX_POINTS = 256;
export const TINYLAPS_MAX_TEXT = 2 * 1024 * 1024;

/* Two ends closer than this are one joint: their grid is in feet and stores floats. */
const JOIN = 0.002;

const finite = (n) => typeof n === 'number' && Number.isFinite(n);
const mm = (m) => `${Math.round(m * 1000)} mm`;
const vec = (v, n) => Array.isArray(v) && v.length === n && v.every(finite);

/* The parsed object, or null for anything that is not one of theirs. */
function dataOf(input) {
  let obj = input;
  if (typeof input === 'string') {
    if (input.length > TINYLAPS_MAX_TEXT) {
      return null;
    }
    try {
      obj = JSON.parse(input);
    } catch (e) {
      return null;
    }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return null;
  }
  if (obj.format !== 'whoop-gate-editor' || !Array.isArray(obj.connections)) {
    return null;
  }
  return obj;
}

/* Whether some text or object is a TinyLaps track: the Import button and the link ask. */
export function looksLikeTinyLaps(input) {
  return dataOf(input) !== null;
}

/* A quaternion [x, y, z, w] applied to a vector [x, y, z], in their frame. */
function rotate(q, v) {
  const [qx, qy, qz, qw] = q;
  const [vx, vy, vz] = v;
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  return [
    vx + qw * tx + (qy * tz - qz * ty),
    vy + qw * ty + (qz * tx - qx * tz),
    vz + qw * tz + (qx * ty - qy * tx),
  ];
}

/* Their direction as ours: x kept, y is minus their z, z is their y. */
const dirToDoc = ([x, y, z]) => ({ x, y: -z, z: y });

/*
 * The pipes as runs: each straight pipe along one axis, then every set on one line that
 * touches or overlaps joined end to end. Returns { runs, skipped } where a run is
 * { axis: 0 | 1 | 2, at: [the two fixed coordinates], from, to } in their frame.
 */
function pipeRuns(connections) {
  const byLine = new Map();
  let skipped = 0;
  for (const c of connections) {
    if (!c || !vec(c.start, 3) || !vec(c.end, 3)) {
      skipped += 1;
      continue;
    }
    const d = [0, 1, 2].map((i) => Math.abs(c.end[i] - c.start[i]));
    const moving = d.filter((v) => v > JOIN).length;
    if (moving !== 1) {
      skipped += 1;
      continue;
    }
    const axis = d.findIndex((v) => v > JOIN);
    const fixed = [0, 1, 2].filter((i) => i !== axis).map((i) => (c.start[i] + c.end[i]) / 2);
    const key = `${axis}|${fixed.map((v) => Math.round(v / JOIN)).join('|')}`;
    const list = byLine.get(key) ?? [];
    list.push([Math.min(c.start[axis], c.end[axis]), Math.max(c.start[axis], c.end[axis]), fixed]);
    byLine.set(key, list);
  }
  const runs = [];
  for (const [key, list] of byLine) {
    const axis = Number(key[0]);
    list.sort((a, b) => a[0] - b[0]);
    let cur = null;
    for (const [from, to, at] of list) {
      if (cur && from <= cur.to + JOIN) {
        cur.to = Math.max(cur.to, to);
      } else {
        cur = { axis, at, from, to };
        runs.push(cur);
      }
    }
  }
  return { runs, skipped };
}

/*
 * THE TRACK, AS OURS. Returns { doc, report: { kept, approximated, dropped } } and never
 * throws: a text that is not one of theirs, or one with nothing to fly, is { error }.
 * `author`, when the link says who drew it, is credited as the designer.
 */
export function importTinyLaps(input, { author = '' } = {}) {
  const data = dataOf(input);
  if (!data) {
    return { error: 'That is not a TinyLaps track: it has no "whoop-gate-editor" format and no list of pipes.' };
  }
  if (data.units !== undefined && data.units !== 'metres') {
    return { error: `That TinyLaps track is in ${String(data.units).slice(0, 20)}, and only metres are read.` };
  }
  const points = Array.isArray(data.racePoints) ? data.racePoints : [];
  if (data.connections.length > MAX_PIPES || points.length > MAX_POINTS) {
    return { error: `That track has more than TinyLaps allows (${MAX_PIPES} pipes and ${MAX_POINTS} race points).` };
  }

  const rawName = typeof data.name === 'string' ? data.name.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 60) : '';
  const doc = createTrack(rawName ? `${rawName} (TinyLaps)` : 'Track from TinyLaps', 'micro');
  const designer = typeof author === 'string' ? author.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 60) : '';
  doc.credit = {
    designer, series: '', sponsor: '', source: 'TinyLaps, tinylaps.kwayzu.com', broughtOverBy: '', note: '',
  };
  const report = { kept: [], approximated: [], dropped: [] };

  const { runs, skipped } = pipeRuns(data.connections);
  if (skipped) {
    report.dropped.push(`${skipped} pipe${skipped === 1 ? ' was' : 's were'} not one straight length along the grid, so ${skipped === 1 ? 'it was' : 'they were'} left out.`);
  }

  /* Where their build sits, so its footprint is centred in our hall. */
  const xs = [];
  const zs = [];
  for (const r of runs) {
    const ends = [r.from, r.to];
    if (r.axis === 0) {
      xs.push(...ends);
      zs.push(r.at[1]);
    } else if (r.axis === 1) {
      xs.push(r.at[0]);
      zs.push(r.at[1]);
    } else {
      xs.push(r.at[0]);
      zs.push(...ends);
    }
  }
  for (const p of points) {
    if (p && vec(p.position, 3)) {
      xs.push(p.position[0]);
      zs.push(p.position[2]);
    }
  }
  if (!xs.length) {
    return { error: 'That TinyLaps track is empty: it has no pipes and no race points.' };
  }
  const midX = (Math.min(...xs) + Math.max(...xs)) / 2;
  const midZ = (Math.min(...zs) + Math.max(...zs)) / 2;
  const W = doc.field.width;
  const D = doc.field.depth;
  const place = (x, z) => ({ x: W / 2 + (x - midX), y: D / 2 - (z - midZ) });
  const inHall = (p) => p.x >= 0 && p.y >= 0 && p.x <= W && p.y <= D;
  let outside = 0;

  /* The pipe. */
  let uprights = 0;
  let floating = 0;
  let bars = 0;
  for (const r of runs) {
    if (r.axis === 1) {
      const p = place(r.at[0], r.at[1]);
      if (!inHall(p)) {
        outside += 1;
        continue;
      }
      const el = createElement(doc, 'pole', { x: p.x, y: p.y, z: 0 }, 0);
      el.dims.height = Math.max(PIPE_OD, r.to);
      el.pvc = true;
      doc.elements.push(el);
      uprights += 1;
      if (r.from > JOIN * 5) {
        floating += 1;
      }
      continue;
    }
    const mid = (r.from + r.to) / 2;
    const p = r.axis === 0 ? place(mid, r.at[1]) : place(r.at[0], mid);
    if (!inHall(p)) {
      outside += 1;
      continue;
    }
    /* The race field builds a bar upward from its base, so the base is half a pipe under
     * the middle of theirs, and never under the floor. */
    const z = Math.max(0, (r.axis === 0 ? r.at[0] : r.at[1]) - PIPE_OD / 2);
    /* A horizontal pole runs across its yaw (its bar is the element's local x, which is
     * the plan's widthAxis turned a quarter): along their x is our x, along their z is
     * our y. */
    const el = createElement(doc, 'horizontalPole', { x: p.x, y: p.y, z }, r.axis === 0 ? 0 : Math.PI / 2);
    /* End to end over the uprights it rests on, so the corner is closed. */
    el.dims.width = Math.max(0.2, r.to - r.from + PIPE_OD);
    el.pvc = true;
    el.yawOverridden = true;
    doc.elements.push(el);
    bars += 1;
  }
  if (uprights) {
    report.kept.push(`${uprights} upright${uprights === 1 ? '' : 's'} of pipe, joined where they meet end to end.`);
  }
  if (floating) {
    report.approximated.push(`${floating} upright${floating === 1 ? ' starts' : 's start'} above the floor in TinyLaps and ${floating === 1 ? 'stands' : 'stand'} on it here.`);
  }
  if (bars) {
    report.kept.push(`${bars} level run${bars === 1 ? '' : 's'} of pipe at the height ${bars === 1 ? 'it was' : 'they were'}, resting on the uprights.`);
  }

  /* The race points, in their order from the start and finish, which is their first
   * checkpoint. */
  const valid = [];
  let badPoints = 0;
  for (const p of points) {
    const q = p && vec(p.rotation, 4) ? p.rotation : null;
    const n = q ? Math.hypot(...q) : 0;
    if (!p || !vec(p.position, 3) || !q || !(n > 0.5) || !vec(p.size, 2) || !(p.size[0] > 0.01) || !(p.size[1] > 0.01)) {
      badPoints += 1;
      continue;
    }
    valid.push({ ...p, rotation: q.map((v) => v / n), check: p.exportToVelocidrone !== false });
  }
  if (badPoints) {
    report.dropped.push(`${badPoints} race point${badPoints === 1 ? ' had' : 's had'} no usable place, turn or size, so ${badPoints === 1 ? 'it was' : 'they were'} left out.`);
  }
  const first = valid.findIndex((p) => p.check);
  if (first < 0) {
    return { error: 'That TinyLaps track has no race points to fly through, so there is no lap. Add them in TinyLaps under Race points.' };
  }
  const order = [...valid.slice(first), ...valid.slice(0, first)];

  const gates = new Map();
  /* Where the first checkpoint is and which way it is flown, on the plan. */
  let start = null;
  let keptGates = 0;
  let passes = 0;
  let navs = 0;
  let rolled = 0;
  const sizes = new Set();
  for (const p of order) {
    const at = place(p.position[0], p.position[2]);
    if (!inHall(at)) {
      outside += 1;
      continue;
    }
    if (!p.check) {
      const wp = createElement(doc, 'waypoint', { x: at.x, y: at.y, z: Math.max(0, p.position[1]) }, 0);
      doc.elements.push(wp);
      addToSequence(doc, wp.id, 0);
      navs += 1;
      continue;
    }
    const travel = dirToDoc(rotate(p.rotation, [0, 0, 1]));
    const across = dirToDoc(rotate(p.rotation, [1, 0, 0]));
    const flat = Math.hypot(travel.x, travel.y);
    /* The yaw of a gate whose opening faces the way it is flown. A flat one (a dive)
     * has no heading of its own, so its width runs where their width runs. */
    const yaw = flat > 0.05 ? Math.atan2(travel.y, travel.x) : Math.atan2(-across.x, across.y);
    const pitch = Math.atan2(travel.z, flat);
    /* Our width runs level; theirs is their local x, unless the point was rolled. */
    const widthAxis = { x: -Math.sin(yaw), y: Math.cos(yaw) };
    const straight = Math.abs(across.x * widthAxis.x + across.y * widthAxis.y) >= Math.SQRT1_2;
    const [w, h] = straight ? p.size : [p.size[1], p.size[0]];
    if (Math.abs(across.z) > 0.05 && Math.abs(across.z) < 0.95) {
      rolled += 1;
    }
    /* One opening flown twice is one gate: the same middle, the same size and the same
     * plane, whichever way it is flown. */
    const key = [at.x, at.y, p.position[1], w, h].map((v) => Math.round(v * 200)).join('|')
      + `|${Math.round((((yaw % Math.PI) + Math.PI) % Math.PI) * 20)}|${Math.round(Math.abs(pitch) * 20)}`;
    let el = gates.get(key);
    if (!el) {
      el = createElement(doc, 'gate', at, yaw);
      el.pitch = pitch;
      el.unbuilt = true;
      el.dims.clearW = w;
      el.dims.clearH = h;
      el.dims.sillH = Math.max(0, p.position[1] - h / 2);
      el.yawOverridden = true;
      doc.elements.push(el);
      gates.set(key, el);
      keptGates += 1;
      sizes.add(Math.round(Math.max(w, h) * 1000));
    }
    if (!start) {
      const n = Math.hypot(travel.x, travel.y);
      start = { at, dir: n > 0.05 ? { x: travel.x / n, y: travel.y / n } : { x: Math.cos(yaw), y: Math.sin(yaw) } };
    }
    const seq = addToSequence(doc, el.id, 0);
    if (seq) {
      const nx = Math.cos(el.pitch) * Math.cos(el.yaw);
      const ny = Math.cos(el.pitch) * Math.sin(el.yaw);
      const nz = Math.sin(el.pitch);
      seq.entry = travel.x * nx + travel.y * ny + travel.z * nz >= 0 ? 1 : -1;
      seq.overridden = true;
      passes += 1;
    }
  }
  /*
   * THE START PADS, behind the start and finish, facing through it. Without them the line
   * runs from the first gate to the last and the lap does not close (the builder's no-start
   * warning). Set back the distance the race field parks a quad behind a first gate when
   * there are none, or nearer when the frame is in the way, and never on a pipe.
   */
  if (start) {
    const clear = (q) => inHall(q) && doc.elements.every((e) => {
      if (e.type === 'pole') {
        return Math.hypot(e.position.x - q.x, e.position.y - q.y) > 0.15;
      }
      if (e.type !== 'horizontalPole' || e.position.z > 0.1) {
        return true;
      }
      /* A bar lying on the floor: the distance to its segment. */
      const ux = Math.cos(e.yaw);
      const uy = Math.sin(e.yaw);
      const t = Math.max(-e.dims.width / 2, Math.min(e.dims.width / 2, (q.x - e.position.x) * ux + (q.y - e.position.y) * uy));
      return Math.hypot(e.position.x + ux * t - q.x, e.position.y + uy * t - q.y) > 0.15;
    });
    const back = [1.2, 0.9, 0.6, 1.5, 0.4].map((d) => ({ x: start.at.x - start.dir.x * d, y: start.at.y - start.dir.y * d }))
      .find(clear);
    if (back) {
      const pads = createElement(doc, 'startPads', { x: back.x, y: back.y, z: 0 }, Math.atan2(start.dir.y, start.dir.x));
      pads.yawOverridden = true;
      doc.elements.push(pads);
      report.kept.push('The start pad stands behind their start and finish, facing through it, so the lap closes there.');
    } else {
      report.dropped.push('There was no clear floor behind their start and finish for a start pad, so the lap does not close. Place one with S.');
    }
  }
  if (keptGates) {
    report.kept.push(`${passes} race point${passes === 1 ? '' : 's'} became ${keptGates} invisible gate${keptGates === 1 ? '' : 's'}, in their order from the start and finish, at the size, height and turn they had and flown the way their arrows point.${passes > keptGates ? ' A point flown more than once is one gate flown again.' : ''}`);
  }
  if (navs) {
    report.kept.push(`${navs} nav only point${navs === 1 ? ' became a waypoint' : 's became waypoints'}: the line goes through ${navs === 1 ? 'it' : 'them'} and nothing scores there.`);
  }
  if (rolled) {
    report.approximated.push(`${rolled} race point${rolled === 1 ? ' was' : 's were'} turned on ${rolled === 1 ? 'its' : 'their'} side partway. Gates here stand level across, so ${rolled === 1 ? 'it was' : 'they were'} straightened.`);
  }
  if (outside) {
    report.dropped.push(`${outside} piece${outside === 1 ? '' : 's'} stood outside the ${W} by ${D} m hall, so ${outside === 1 ? 'it was' : 'they were'} left out.`);
  }
  const odd = [...sizes].filter((s) => s > GATE_OPENING_MAX * 1000 + 1 || s < GATE_OPENING_MIN * 1000 - 1);
  if (odd.length) {
    report.approximated.push(`Some openings are ${odd.map((s) => mm(s / 1000)).join(', ')} across and were kept at that size. RaceGOW's gates are ${inches(GATE_OPENING_MIN)} to ${inches(GATE_OPENING_MAX)}, so the rules will say so.`);
  }

  applyAutoFaces(doc);
  return { doc: normalize(JSON.parse(JSON.stringify(doc))).doc, report };
}
