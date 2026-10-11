/*
 * buildsheet.js: what to buy and where to stand it, from a track.
 *
 * A whoop track is built in a real room out of pipe, with a tape measure, by
 * somebody who has the drawing beside them. The room the builder draws is for
 * looking at; this is for building from. It is a page for the print dialog,
 * made from the document and nothing else: the plan with every piece measured
 * from a corner of the smallest rectangle that holds the track, each with its
 * height and which way it faces, and a parts list of pipe by length and
 * fittings by kind.
 *
 * WHERE THE PARTS COME FROM. It reads the same geometry the room draws
 * (view3d.js buildAperture): the four sides of every opening, the ones taken
 * away (elements.js frameSidesOf), the uprights that run the height of a stack
 * and the bars between two levels, and the legs under a gate that stands off the
 * floor. Every member is a straight run between two fitting centres. Members
 * that lie on top of one another are one pipe (two gates stacked at exactly a
 * gate and a pipe apart share the bar between them), members are counted once,
 * and the fittings are found where members meet: two at right angles are an
 * elbow, two in line a coupler, two in line with one across a tee, and so on.
 * Nothing is drawn from a table of what a gate "usually" needs, so a track
 * with a side taken away, a row that shares an upright or a stack of three
 * says what it needs and not what a picture of it would.
 *
 * WHAT IT ASSUMES, said on the sheet. RaceGOW's one section length, 26.5 to
 * 27.25 in, gives its 28 in opening between fittings, so a pipe is cut to the
 * centre to centre length of its member less what the fittings take at each end
 * (racegow.js: a 28 in opening and a 27 in section put that at 1.025 in). A
 * fitting is not the same in every brand, so the sheet says to dry fit one gate.
 * Poles and single bars are listed by size and are cut from the same stock.
 *
 * Pure, like the builder's other data modules: no DOM and no Three.js, so the
 * self test builds sheets in Node and counts them against a hand count.
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

import { KIND, apertureShapeOf, frameSidesOf, poleBuilt, isUnbuilt, labelOf } from './elements.js';
import { aperturesOf, apertureCenter, kindOf } from './model.js';
import { sequenceNumbers } from './sequence.js';
import { isRoomType, roomFootprint } from '../props/room.js';
import { placedYaw } from '../props/solids.js';
import { frameOutline } from '../props/aperture.js';
import { apertureCorners, apertureFrame, gateSupportFeet } from './geometry.js';
import {
  GATE_OPENING_MAX, PIPE_LEN_MAX, PIPE_LEN_MIN, PIPE_OD, inches,
} from './racegow.js';

const IN = 0.0254;

/* The one section length the parts list is counted in: RaceGOW's range is 26.5
 * to 27.25 in and 27 is inside it and what a tape measure finds. */
export const SECTION = 27 * IN;

/* What a fitting takes off each end of a member, from RaceGOW's own two numbers:
 * a 27 in section gives a 28 in opening, and the member from fitting centre to
 * fitting centre is that opening and one pipe (the centre lines of two uprights
 * are a pipe apart from the opening's edges). */
export const FITTING_ALLOWANCE = (GATE_OPENING_MAX + PIPE_OD - SECTION) / 2;

/* Two things are the same place when they are within a pipe of one another. */
const TOL = PIPE_OD;

/* The four corners a sheet can be measured from, and the way each one's two
 * measurements run. `x` is +1 when X grows toward the east (the corner is on the
 * west side), `y` is +1 when Y grows toward the north (the corner is on the south
 * side). */
export const CORNERS = {
  sw: { label: 'south west', x: 1, y: 1 },
  se: { label: 'south east', x: -1, y: 1 },
  nw: { label: 'north west', x: 1, y: -1 },
  ne: { label: 'north east', x: -1, y: -1 },
};

const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const mul = (a, k) => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const len = (a) => Math.hypot(a.x, a.y, a.z);
const unit = (a) => {
  const l = len(a);
  return l < 1e-12 ? { x: 0, y: 0, z: 0 } : mul(a, 1 / l);
};

/* ------------------------------------------------------------------ */
/* The members                                                         */
/* ------------------------------------------------------------------ */

/*
 * EVERY STRAIGHT RUN OF PIPE THE ROOM DRAWS, as { a, b, from }: two fitting
 * centres, in document coordinates (metres, z up), and the element it belongs
 * to. An opening's frame is the rectangle through the centre lines of its four
 * pipes, so its corners are where the fittings are.
 */
export function membersOf(doc) {
  const out = [];
  const tube = PIPE_OD;
  for (const el of doc.elements) {
    if (kindOf(el) !== KIND.APERTURE || isUnbuilt(el)) {
      continue;
    }
    /*
     * A HOOP IS NOT PIPE, and a hex gate is six lengths of it: one from each corner of the frame to the
     * next, at the corners src/props/aperture.js gives the game, and two legs from the ends of its
     * bottom side when it hangs above the floor.
     */
    const shape = apertureShapeOf(el);
    if (shape === 'circle') {
      continue;
    }
    if (shape === 'hex') {
      hexMembers(out, el, tube);
      continue;
    }
    const f = apertureFrame(el.yaw, el.pitch);
    const sides = frameSidesOf(el);
    const levels = aperturesOf(el);
    const last = levels.length - 1;
    for (const ap of levels) {
      const c = apertureCenter(el, ap.index);
      const hw = (ap.clearW + tube) / 2;
      const hh = (ap.clearH + tube) / 2;
      const at = (sw, sh) => add(c, add(mul(f.widthAxis, sw * hw), mul(f.heightAxis, sh * hh)));
      /* A bar between two levels is none of the four sides and is always there:
       * see view3d buildAperture, which draws it for the same reason. */
      if (ap.index !== last || sides.top) {
        out.push({ a: at(-1, 1), b: at(1, 1), from: el.id });
      }
      if (ap.index !== 0 || sides.bottom) {
        out.push({ a: at(-1, -1), b: at(1, -1), from: el.id });
      }
      /* An upright is one stretch per opening on a stack: see unbuiltPolesOf in elements.js. */
      if (poleBuilt(el, 'left', ap.index)) {
        out.push({ a: at(-1, -1), b: at(-1, 1), from: el.id });
      }
      if (poleBuilt(el, 'right', ap.index)) {
        out.push({ a: at(1, -1), b: at(1, 1), from: el.id });
      }
    }
    /* The legs: a gate that stands off the floor stands on its two uprights
     * carried down, from the lower outer corners. gateSupportFeet gives the
     * -widthAxis leg first, and a leg goes when its upright does. */
    const bottom = levels[0];
    const feet = gateSupportFeet(el.yaw, el.pitch, bottom.clearW, bottom.clearH, bottom.centerH, tube);
    const c0 = apertureCenter(el, 0);
    feet.forEach((foot, i) => {
      if (foot.z < 0.02 || !poleBuilt(el, i === 0 ? 'left' : 'right', 0)) {
        return;
      }
      const sw = i === 0 ? -1 : 1;
      const corner = add(c0, add(mul(f.widthAxis, sw * ((bottom.clearW + tube) / 2)), mul(f.heightAxis, -(bottom.clearH + tube) / 2)));
      out.push({ a: { x: corner.x, y: corner.y, z: el.position.z }, b: corner, from: el.id });
    });
  }
  return out;
}

/* The six pipes of a hex gate, and its legs. The frame is the hexagon through the centre lines of
 * its pipes, which is the hole pushed out by half a pipe (frameOutline), so its corners are where
 * the fittings are. */
function hexMembers(out, el, tube) {
  const ap = aperturesOf(el)[0];
  const f = apertureFrame(el.yaw, el.pitch);
  const c = apertureCenter(el, 0);
  const at = ([x, y]) => add(c, add(mul(f.widthAxis, x), mul(f.heightAxis, y)));
  const run = frameOutline('hex', ap.clearW / 2, ap.clearH / 2, tube / 2).map(at);
  for (let i = 0; i < run.length; i += 1) {
    out.push({ a: run[i], b: run[(i + 1) % run.length], from: el.id });
  }
  /* Legs: down from the lowest corners, the way the game and the room stand it. */
  const lowest = Math.min(...run.map((p) => p.z));
  if (lowest - el.position.z - tube / 2 > 0.02) {
    for (const p of run) {
      if (Math.abs(p.z - lowest) <= 1e-6) {
        out.push({ a: { x: p.x, y: p.y, z: el.position.z }, b: p, from: el.id });
      }
    }
  }
}

/*
 * PIPES THAT LIE ON TOP OF ONE ANOTHER ARE ONE PIPE. Two members are one when
 * they are parallel, on the same line to within half a pipe, and overlap along
 * it by more than half a pipe: the bar shared by two gates stacked a gate and a
 * pipe apart is drawn twice by the room and is bought once. The merged member
 * runs the length of both.
 */
export function mergeMembers(members) {
  const list = members.map((m) => ({ ...m }));
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < list.length && !changed; i += 1) {
      for (let j = i + 1; j < list.length && !changed; j += 1) {
        const p = list[i];
        const q = list[j];
        const up = unit(sub(p.b, p.a));
        const uq = unit(sub(q.b, q.a));
        if (Math.abs(dot(up, uq)) < 0.999) {
          continue;
        }
        /* Off the line: the distance from q's start to p's line. */
        const rel = sub(q.a, p.a);
        const along = dot(rel, up);
        const off = len(sub(rel, mul(up, along)));
        if (off > TOL / 2) {
          continue;
        }
        const pa = 0;
        const pb = len(sub(p.b, p.a));
        const qa = along;
        const qb = along + dot(sub(q.b, q.a), up);
        const lo = Math.max(pa, Math.min(qa, qb));
        const hi = Math.min(pb, Math.max(qa, qb));
        if (hi - lo <= TOL / 2) {
          continue;
        }
        const start = Math.min(pa, qa, qb);
        const end = Math.max(pb, qa, qb);
        list[i] = { a: add(p.a, mul(up, start)), b: add(p.a, mul(up, end)), from: p.from };
        list.splice(j, 1);
        changed = true;
      }
    }
  }
  return list;
}

/* ------------------------------------------------------------------ */
/* Fittings                                                            */
/* ------------------------------------------------------------------ */

/*
 * WHERE MEMBERS MEET, in two passes, because two pipes a pipe apart are two
 * things and a pipe that stops a pipe short of another is one.
 *
 * First, ends at the same point (within a tenth of a pipe) are one node: the
 * corners of a frame, a leg under a corner, the ends of a shared bar. Then every
 * node with a single member, an open end, is joined to the nearest node of some
 * other piece that is within a pipe of it: the bars of the second gate of a row,
 * whose own upright was taken away to share the first's, stop at the first's
 * upright and are one fitting with it, while two gates that are both fully built
 * and 30 in apart have an elbow each and stay two.
 *
 * Returns [{ at, ends: [{ dir, member }] }], `dir` the unit vector from the node
 * along the member. What a node is is fittingKind's business.
 */
export function nodesOf(members) {
  const nodes = [];
  const exact = TOL / 10;
  members.forEach((m, index) => {
    for (const [end, dir] of [[m.a, unit(sub(m.b, m.a))], [m.b, unit(sub(m.a, m.b))]]) {
      let node = nodes.find((n) => len(sub(n.at, end)) <= exact);
      if (!node) {
        node = { at: end, ends: [] };
        nodes.push(node);
      }
      node.ends.push({ dir, member: index, from: m.from });
    }
  });
  for (const open of nodes.filter((n) => n.ends.length === 1)) {
    const mine = open.ends[0];
    let best = null;
    for (const n of nodes) {
      if (n === open || !n.ends.length || n.ends.some((e) => e.from === mine.from)) {
        continue;
      }
      const d = len(sub(n.at, open.at));
      if (d <= TOL && (!best || d < best.d)) {
        best = { d, n };
      }
    }
    if (best) {
      best.n.ends.push(mine);
      open.ends = [];
    }
  }
  return nodes.filter((n) => n.ends.length);
}

/* The name of a fitting from the directions of the members that reach it. */
export function fittingKind(dirs, floor) {
  const n = dirs.length;
  const opposite = (a, b) => dot(a, b) < -0.99;
  const square = (a, b) => Math.abs(dot(a, b)) < 0.05;
  if (n === 1) {
    return floor ? 'foot' : 'end cap';
  }
  if (n === 2) {
    if (opposite(dirs[0], dirs[1])) {
      return 'coupler';
    }
    return square(dirs[0], dirs[1]) ? 'elbow' : 'angled elbow';
  }
  if (n === 3) {
    for (let i = 0; i < 3; i += 1) {
      const [a, b, c] = [dirs[i], dirs[(i + 1) % 3], dirs[(i + 2) % 3]];
      if (opposite(a, b) && square(a, c) && square(b, c)) {
        return 'tee';
      }
    }
    const [a, b, c] = dirs;
    return square(a, b) && square(a, c) && square(b, c) ? '3-way corner' : 'junction of 3 pipes';
  }
  if (n === 4) {
    const pairs = [[0, 1, 2, 3], [0, 2, 1, 3], [0, 3, 1, 2]];
    for (const [i, j, k, l] of pairs) {
      if (opposite(dirs[i], dirs[j]) && opposite(dirs[k], dirs[l]) && square(dirs[i], dirs[k])) {
        return 'cross';
      }
    }
  }
  /* Four that are not a cross, or five or more: not one fitting on any shelf.
   * Where a stack meets the corner of a cube it is a cross and a tee with a
   * short pipe between, and the sheet says so rather than naming a part that
   * does not exist. */
  return `junction of ${n} pipes`;
}

/* ------------------------------------------------------------------ */
/* The pieces on the floor                                             */
/* ------------------------------------------------------------------ */

/* Metres of plan a piece takes, as a list of floor points: enough to find the
 * smallest rectangle that holds the track and to draw the piece. */
function footprint(el) {
  const d = el.dims || {};
  const kind = kindOf(el);
  const c = { x: el.position.x, y: el.position.y };
  const rect = (w, h, yaw) => {
    const co = Math.cos(yaw);
    const si = Math.sin(yaw);
    return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]
      .map(([x, y]) => ({ x: c.x + x * co - y * si, y: c.y + x * si + y * co }));
  };
  if (kind === KIND.APERTURE) {
    const levels = aperturesOf(el);
    const lo = levels[0];
    const hi = levels[levels.length - 1];
    const f = apertureFrame(el.yaw, el.pitch);
    const wide = lo.clearW + 2 * PIPE_OD;
    const tall = (hi.centerH - lo.centerH) + hi.clearH + 2 * PIPE_OD;
    const mid = { x: el.position.x, y: el.position.y, z: el.position.z + (lo.centerH + hi.centerH) / 2 };
    return apertureCorners(mid, el.yaw, el.pitch, wide, tall).map((p) => ({ x: p.x, y: p.y })).concat(
      [add({ ...mid }, mul(f.normal, PIPE_OD / 2)), sub({ ...mid }, mul(f.normal, PIPE_OD / 2))].map((p) => ({ x: p.x, y: p.y })),
    );
  }
  if (el.type === 'pole') {
    const r = Math.max(d.poleRadius || PIPE_OD / 2, PIPE_OD / 2);
    return rect(2 * r, 2 * r, 0);
  }
  if (el.type === 'cone') {
    const r = d.baseRadius || 0.03;
    return rect(2 * r, 2 * r, 0);
  }
  if (el.type === 'horizontalPole' || el.type === 'barrier') {
    return rect(d.width || 0.5, d.depth || PIPE_OD, el.yaw);
  }
  if (isRoomType(el.type)) {
    /* The ground it covers, at the quarter turn it is built at. */
    const fp = roomFootprint(el.type, d);
    return rect(fp.x1 - fp.x0, fp.y1 - fp.y0, placedYaw('quarter', el.yaw));
  }
  if (kind === KIND.START) {
    const pads = d.pads || 1;
    const size = d.padSize || 0.1;
    return rect((pads - 1) * (d.spacing || 0.3) + size, size, el.yaw);
  }
  return [];
}

/* The pieces a builder puts on the floor. A waypoint is a bend in a line, a label
 * is a caption and a decal is paint: none of them is stood up. */
const PHYSICAL = new Set([KIND.APERTURE, KIND.START, KIND.OBSTACLE]);
function isPhysical(el) {
  return PHYSICAL.has(kindOf(el)) || el.type === 'pole' || el.type === 'cone';
}

/* Which way a heading points, in the words a builder has for a room. */
export function compass(yaw) {
  const quarter = Math.round(yaw / (Math.PI / 2));
  if (Math.abs(yaw - quarter * (Math.PI / 2)) < 0.01) {
    return ['east', 'north', 'west', 'south'][((quarter % 4) + 4) % 4];
  }
  const deg = ((yaw * 180) / Math.PI + 360) % 360;
  return `${Math.round(deg)} degrees counter clockwise from east`;
}

/* The wall a gate's frame runs along, for a gate at a quarter turn. */
function frameRuns(yaw) {
  const quarter = Math.round(yaw / (Math.PI / 2));
  if (Math.abs(yaw - quarter * (Math.PI / 2)) >= 0.01) {
    return '';
  }
  return quarter % 2 === 0 ? 'north to south' : 'east to west';
}

/* ------------------------------------------------------------------ */
/* The sheet                                                           */
/* ------------------------------------------------------------------ */

const round = (n, places) => Math.round(n * 10 ** places) / 10 ** places;
const cutKey = (m) => round(m / IN, 2);

/* A letter for a piece with no number: A, B, ... Z, AA. */
function letter(i) {
  let s = '';
  let n = i;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

/*
 * THE SHEET, as data. `corner` is where the tape measure starts (CORNERS),
 * south west unless asked. Returns
 *
 *   { name, corner, size, bounds, pieces, parts, notes }
 *
 * `pieces` is one row per thing stood up, each { key, numbers, type, label, x, y,
 * heights, faces, runs, note, shape }, x and y in metres from the corner along
 * the way that corner's measurements run. Two gates at one spot and one heading
 * are one row (a stack built as two gates is a stack). `parts` is what to buy:
 * { sections, cuts, fittings, poles, bars, other }, every count from the members
 * and the pieces and none from a table.
 */
export function buildSheet(doc, opts = {}) {
  const corner = CORNERS[opts.corner] ? opts.corner : 'sw';
  const numbers = sequenceNumbers(doc);
  const physical = doc.elements.filter(isPhysical);

  /* The smallest rectangle that holds the track. */
  let box = null;
  for (const el of physical) {
    for (const p of footprint(el)) {
      box = box
        ? { minX: Math.min(box.minX, p.x), maxX: Math.max(box.maxX, p.x), minY: Math.min(box.minY, p.y), maxY: Math.max(box.maxY, p.y) }
        : { minX: p.x, maxX: p.x, minY: p.y, maxY: p.y };
    }
  }
  if (!box) {
    box = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  }
  const way = CORNERS[corner];
  const from = (p) => ({
    x: way.x > 0 ? p.x - box.minX : box.maxX - p.x,
    y: way.y > 0 ? p.y - box.minY : box.maxY - p.y,
  });

  /* One row per piece, gates at one spot and heading together. */
  const rows = [];
  for (const el of physical) {
    const kind = kindOf(el);
    const mine = (numbers.get(el.id) ?? []).map((n) => n.number).filter((n) => n != null);
    const partner = kind === KIND.APERTURE
      ? rows.find((r) => r.kind === KIND.APERTURE
        && Math.hypot(r.el.position.x - el.position.x, r.el.position.y - el.position.y) < 0.002
        && Math.abs(r.el.yaw - el.yaw) < 0.002 && Math.abs(r.el.pitch - el.pitch) < 0.002)
      : null;
    if (partner) {
      partner.els.push(el);
      partner.numbers.push(...mine);
      continue;
    }
    rows.push({ kind, el, els: [el], numbers: [...mine] });
  }
  rows.forEach((r) => r.numbers.sort((a, b) => a - b));
  rows.sort((a, b) => {
    const na = a.numbers.length ? a.numbers[0] : Infinity;
    const nb = b.numbers.length ? b.numbers[0] : Infinity;
    return na - nb;
  });

  let spare = 0;
  const pieces = rows.map((r) => {
    const el = r.el;
    const at = from(el.position);
    const key = r.numbers.length ? r.numbers.join(', ') : letter(spare++);
    const heights = [];
    const stacked = r.els.length > 1 || aperturesOf(el).length > 1;
    if (r.kind === KIND.APERTURE) {
      for (const g of r.els) {
        for (const ap of aperturesOf(g)) {
          heights.push({ bottom: g.position.z + ap.sillH, top: g.position.z + ap.sillH + ap.clearH });
        }
      }
      heights.sort((a, b) => a.bottom - b.bottom);
    } else if (el.type === 'pole') {
      heights.push({ bottom: el.position.z, top: el.position.z + (el.dims.height || 0) });
    } else {
      heights.push({ bottom: el.position.z, top: el.position.z + (el.dims.height || 0) });
    }
    /* A face of a cube is not a gate to build: its pipe is the cube's, counted once in the parts, and the
     * row says so, so nobody cuts five gates' worth for it. */
    const face = Boolean(el.group) && r.els.length === 1;
    const label = face
      ? 'Cube face'
      : (r.kind === KIND.APERTURE && stacked && r.els.length > 1
        ? `Stack of ${r.els.length}`
        : labelOf(el.type, 'micro'));
    const note = isUnbuilt(el) && r.els.length === 1
      ? 'no frame of its own: the opening is marked by its neighbours'
      : (face ? 'shares its pipe with the rest of the cube' : '');
    /* A piece of furniture is built at its nearest quarter turn, so that is the
     * way the sheet says it faces. */
    const heading = isRoomType(el.type) ? placedYaw('quarter', el.yaw) : el.yaw;
    return {
      key,
      numbers: r.numbers,
      type: el.type,
      label,
      x: at.x,
      y: at.y,
      heights,
      faces: r.kind === KIND.APERTURE || r.kind === KIND.OBSTACLE || r.kind === KIND.START ? compass(heading) : '',
      runs: r.kind === KIND.APERTURE ? frameRuns(el.yaw) : '',
      note,
      elementIds: r.els.map((e) => e.id),
      shape: footprint(el).map((p) => from(p)),
      yaw: heading,
      kind: r.kind,
    };
  });

  /* The parts. */
  const members = mergeMembers(membersOf(doc));
  const cuts = new Map();
  let sections = 0;
  for (const m of members) {
    const cut = len(sub(m.b, m.a)) - 2 * FITTING_ALLOWANCE;
    if (cut >= PIPE_LEN_MIN - 1e-6 && cut <= PIPE_LEN_MAX + 1e-6) {
      sections += 1;
    } else {
      const k = cutKey(cut);
      cuts.set(k, (cuts.get(k) ?? 0) + 1);
    }
  }
  const fittings = new Map();
  for (const n of nodesOf(members)) {
    const kind = fittingKind(n.ends.map((e) => e.dir), n.at.z < 0.05 && n.ends.length === 1 && n.ends[0].dir.z > 0.99);
    fittings.set(kind, (fittings.get(kind) ?? 0) + 1);
  }
  /* By size, to a hundredth of an inch, keeping the size the piece has. */
  const poles = new Map();
  const bars = new Map();
  const other = new Map();
  for (const el of physical) {
    if (el.type === 'pole') {
      const k = round((el.dims.height || 0) / IN, 2);
      poles.set(k, { count: (poles.get(k)?.count ?? 0) + 1, height: el.dims.height || 0 });
    } else if (el.type === 'horizontalPole') {
      const k = `${round((el.dims.width || 0) / IN, 2)}|${round(el.position.z / IN, 2)}`;
      bars.set(k, { count: (bars.get(k)?.count ?? 0) + 1, length: el.dims.width || 0, height: el.position.z });
    } else if (el.type === 'cone' || el.type === 'barrier' || isRoomType(el.type) || apertureShapeOf(el) === 'circle') {
      other.set(labelOf(el.type, 'micro'), (other.get(labelOf(el.type, 'micro')) ?? 0) + 1);
    } else if (kindOf(el) === KIND.START) {
      other.set('Start pads', (other.get('Start pads') ?? 0) + (el.dims.pads || 1));
    }
  }
  const order = ['elbow', 'tee', 'cross', 'coupler', '3-way corner', 'angled elbow', 'end cap', 'foot'];
  const byOrder = (a, b) => (order.indexOf(a[0]) + 1 || 99) - (order.indexOf(b[0]) + 1 || 99) || a[0].localeCompare(b[0]);

  const parts = {
    sections: { count: sections, length: SECTION },
    cuts: [...cuts].map(([k, count]) => ({ length: k * IN, count })).sort((a, b) => b.length - a.length),
    fittings: [...fittings].sort(byOrder).map(([kind, count]) => ({ kind, count })),
    poles: [...poles.values()].sort((a, b) => b.height - a.height),
    bars: [...bars.values()].sort((a, b) => b.length - a.length),
    other: [...other].map(([label, count]) => ({ label, count })),
  };

  const gates = doc.elements.filter((e) => kindOf(e) === KIND.APERTURE);
  const opening = gates.length ? aperturesOf(gates[0])[0].clearW : GATE_OPENING_MAX;
  return {
    name: doc.name || 'Untitled track',
    corner,
    cornerLabel: way.label,
    opening,
    bounds: { width: box.maxX - box.minX, depth: box.maxY - box.minY },
    /* Where the south west corner of that rectangle is, in the document's own frame, so a
     * picture drawn in the document's frame can be laid on this sheet's. */
    origin: { x: box.minX, y: box.minY },
    pieces,
    parts,
    members: members.length,
    notes: [
      `Measure from the ${way.label} corner of the smallest rectangle that holds the whole track: mark it on the floor first. X runs ${way.x > 0 ? 'east' : 'west'} from that corner and Y runs ${way.y > 0 ? 'north' : 'south'}, to the middle of each piece.`,
      `Pipe is ${inches(PIPE_OD)} outside diameter. Sections are ${inches(SECTION)}, inside RaceGOW's ${inches(PIPE_LEN_MIN)} to ${inches(PIPE_LEN_MAX)}. Every length here is the run from fitting centre to fitting centre less ${inches(FITTING_ALLOWANCE)} at each end for the fitting, which is what makes a 27 in section a 28 in opening. Fittings differ by maker: dry fit one gate, then cut the rest.`,
      'Two gates that share an upright or a bar are counted with that pipe once.',
      'Poles and bars are listed by size and are cut from the same stock. Cones and barriers are not pipe.',
      'A junction of more than three pipes that is not a cross (a stack meeting the corner of a cube) is not one fitting: build it from a cross or a tee and a short pipe.',
      ...(physical.some((el) => isRoomType(el.type))
        ? ['A table, a chair or a banner is furniture, not pipe: put one where the room has it, at the position and the heading given. A chair faces the way its heading says, with its back behind it.']
        : []),
      ...(physical.some((el) => apertureShapeOf(el) === 'circle')
        ? [`A hoop is not pipe: bring a ring ${inches(aperturesOf(physical.find((el) => apertureShapeOf(el) === 'circle'))[0].clearW)} across inside, and a stand for any that hangs above the floor. Nothing is cut for it.`]
        : []),
    ],
  };
}

/* ------------------------------------------------------------------ */
/* The page                                                            */
/* ------------------------------------------------------------------ */

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;',
}[c]));

/* One length, in both units, the way the rules and a tape measure are read. */
const both = (m) => inches(m);

/* The heights of a piece, bottom of the opening for a gate and the top for the rest. */
function heightText(p) {
  if (!p.heights.length) {
    return '';
  }
  if (p.kind === KIND.APERTURE) {
    return p.heights.map((h) => `${both(h.bottom)}`).join(', then ');
  }
  const h = p.heights[0];
  return h.top > h.bottom + 1e-6 ? `${both(h.bottom)} up to ${both(h.top)}` : `${both(h.bottom)}`;
}

/*
 * THE PLAN, as an SVG string: north up, the smallest rectangle that holds the
 * track dashed with the corner marked, a tick every 12 in along the two edges
 * that run from that corner, and every piece drawn where it stands with the key
 * the table below gives it. Units in the picture are millimetres.
 */
export function sheetSvg(sheet) {
  const way = CORNERS[sheet.corner];
  const W = sheet.bounds.width;
  const D = sheet.bounds.depth;
  const pad = 0.3;
  const mm = (m) => round(m * 1000, 1);
  /* Sheet measurements to picture coordinates: north is up whichever corner. */
  const px = (p) => mm(pad + (way.x > 0 ? p.x : W - p.x));
  const py = (p) => mm(pad + (way.y > 0 ? D - p.y : p.y));
  const vw = mm(W + 2 * pad);
  const vh = mm(D + 2 * pad);
  const parts = [];
  parts.push(`<rect x="${mm(pad)}" y="${mm(pad)}" width="${mm(W)}" height="${mm(D)}" fill="none" stroke="#7a7a7a" stroke-width="4" stroke-dasharray="30 20"/>`);
  /* The corner. */
  const cx = px({ x: 0, y: 0 });
  const cy = py({ x: 0, y: 0 });
  parts.push(`<path d="M ${cx - 60} ${cy} H ${cx + 60} M ${cx} ${cy - 60} V ${cy + 60}" stroke="#000" stroke-width="6"/>`);
  /* Ticks along the two edges that run from the corner. */
  for (let i = 1; i * 12 * IN <= Math.max(W, D) + 1e-9; i += 1) {
    const t = i * 12 * IN;
    const big = i % 2 === 0;
    if (t <= W) {
      const x = px({ x: t, y: 0 });
      parts.push(`<path d="M ${x} ${cy} v ${way.y > 0 ? 25 : -25}" stroke="#555" stroke-width="3"/>`);
      if (big) {
        parts.push(`<text x="${x}" y="${cy + (way.y > 0 ? 80 : -60)}" font-size="46" text-anchor="middle" fill="#333">${i * 12}</text>`);
      }
    }
    if (t <= D) {
      const y = py({ x: 0, y: t });
      parts.push(`<path d="M ${cx} ${y} h ${way.x > 0 ? -25 : 25}" stroke="#555" stroke-width="3"/>`);
      if (big) {
        parts.push(`<text x="${cx + (way.x > 0 ? -34 : 34)}" y="${y + 16}" font-size="46" text-anchor="${way.x > 0 ? 'end' : 'start'}" fill="#333">${i * 12}</text>`);
      }
    }
  }
  for (const p of sheet.pieces) {
    const c = { x: px({ x: p.x, y: p.y }), y: py({ x: p.x, y: p.y }) };
    const pts = p.shape.map((s) => `${px(s)},${py(s)}`).join(' ');
    if (p.kind === KIND.APERTURE) {
      parts.push(`<polygon points="${pts}" fill="#ffd45c" fill-opacity="0.55" stroke="#000" stroke-width="7" stroke-linejoin="round"/>`);
    } else if (p.type === 'pole') {
      parts.push(`<circle cx="${c.x}" cy="${c.y}" r="34" fill="#c0392b" stroke="#000" stroke-width="5"/>`);
    } else if (p.type === 'cone') {
      parts.push(`<polygon points="${pts}" fill="#e67e22" stroke="#000" stroke-width="5"/>`);
    } else {
      parts.push(`<polygon points="${pts}" fill="#bbb" fill-opacity="0.6" stroke="#000" stroke-width="5"/>`);
    }
    parts.push(`<circle cx="${c.x}" cy="${c.y}" r="44" fill="#fff" stroke="#000" stroke-width="5"/>`);
    parts.push(`<text x="${c.x}" y="${c.y + 15}" font-size="${p.key.length > 4 ? 30 : 42}" font-weight="700" text-anchor="middle" fill="#000">${esc(p.key.length > 6 ? `${p.key.slice(0, 5)}..` : p.key)}</text>`);
  }
  return `<svg class="tb-sheet-plan" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vw} ${vh}" role="img" aria-label="Plan of ${esc(sheet.name)}, north up">${parts.join('')}</svg>`;
}

/*
 * THE WHOLE SHEET as one string of HTML: the plan, the table of where every
 * piece stands, and what to buy. Every name in it is escaped, because a track's
 * name and a piece's name are text somebody typed.
 */
export function sheetHtml(sheet) {
  const rows = sheet.pieces.map((p) => `<tr><td>${esc(p.key)}</td><td>${esc(p.label)}${p.note ? `<br><small>${esc(p.note)}</small>` : ''}</td>`
    + `<td>${esc(both(p.x))}</td><td>${esc(both(p.y))}</td><td>${esc(heightText(p))}</td>`
    + `<td>${esc(p.faces ? `${p.faces}${p.runs ? `, frame runs ${p.runs}` : ''}` : '')}</td></tr>`).join('');
  const parts = sheet.parts;
  const pipe = [];
  pipe.push(`<tr><td>${parts.sections.count}</td><td>sections, ${esc(both(parts.sections.length))}</td></tr>`);
  for (const c of parts.cuts) {
    pipe.push(`<tr><td>${c.count}</td><td>pieces cut to ${esc(both(c.length))}</td></tr>`);
  }
  for (const p of parts.poles) {
    pipe.push(`<tr><td>${p.count}</td><td>vertical pole${p.count === 1 ? '' : 's'}, ${esc(both(p.height))} tall</td></tr>`);
  }
  for (const b of parts.bars) {
    pipe.push(`<tr><td>${b.count}</td><td>horizontal pole${b.count === 1 ? '' : 's'}, ${esc(both(b.length))} long, ${esc(both(b.height))} off the floor</td></tr>`);
  }
  const plural = (name, count) => (count === 1 ? name : name.startsWith('junction') ? name.replace('junction', 'junctions') : name.endsWith('s') ? name : `${name}s`);
  const fit = parts.fittings.map((f) => `<tr><td>${f.count}</td><td>${esc(plural(f.kind, f.count))}</td></tr>`).join('');
  const other = parts.other.map((o) => `<tr><td>${o.count}</td><td>${esc(o.label)}</td></tr>`).join('');
  return `<article class="tb-sheet-page">
<h1>${esc(sheet.name)}</h1>
<p class="tb-sheet-meta">Build sheet. Gate opening ${esc(both(sheet.opening))}. The track fits ${esc(both(sheet.bounds.width))} by ${esc(both(sheet.bounds.depth))}. Measured from the ${esc(sheet.cornerLabel)} corner.</p>
${sheetSvg(sheet)}
<h2>Where everything stands</h2>
<table class="tb-sheet-table"><thead><tr><th>No.</th><th>Piece</th><th>X</th><th>Y</th><th>Height off the floor</th><th>Faces</th></tr></thead><tbody>${rows}</tbody></table>
<h2>What to buy</h2>
<div class="tb-sheet-buy">
<table class="tb-sheet-table"><thead><tr><th colspan="2">Pipe</th></tr></thead><tbody>${pipe.join('')}</tbody></table>
<table class="tb-sheet-table"><thead><tr><th colspan="2">Fittings</th></tr></thead><tbody>${fit || '<tr><td colspan="2">none</td></tr>'}</tbody></table>
${other ? `<table class="tb-sheet-table"><thead><tr><th colspan="2">Other</th></tr></thead><tbody>${other}</tbody></table>` : ''}
</div>
<h2>Notes</h2>
<ul class="tb-sheet-notes">${sheet.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
</article>`;
}

