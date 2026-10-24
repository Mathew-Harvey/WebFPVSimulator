/*
 * yardtrack.js: a RaceGOW track standing in a house map's yard, timed. The
 * owner's ask of 2026-10-24: the board's RaceGOW6 Track 3 (./course.js)
 * "functional (with timer callout and gates etc) placed in heads front yard,
 * in nicks back yard and in josh bardwells yard near the wood chopping shed
 * out the back ... with logos on the floor of sponsors, i should be able to
 * just fly through the start gate and see a timer start with gate sensors,
 * if i fly too far away from the track the timer goes away and the track
 * resets".
 *
 * Pure data and arithmetic, no Three.js and no DOM, so a check can build the
 * track in Node, fly its line through the race and look for anything of the
 * yard standing in it (scripts/yardtrack-check.js).
 *
 * WHAT IT IS MADE OF, and why none of it is new machinery:
 *
 *   THE COURSE is the document read by courseFromDocument
 *            (src/game/trackdoc.js), the same reader a whoop room is built
 *            from, so every station, hole and flying order is the room's.
 *            It comes out in the room's metres, MICRO_SCALE times RaceGOW's,
 *            and is moved into the yard here: turned by quarter turns only,
 *            so every sine is exact and every box stays a box, scaled by the
 *            yard's own factor over MICRO_SCALE, and set down on the spot.
 *   THE GATES are four lengths of pipe each, as a RaceGOW gate is and as
 *            src/render/scene.js builds one for the room (obstacle(), its
 *            micro branch): two uprights from the ground to just over the
 *            top member, a member over the hole and one under it when the
 *            hole stands off the ground, and a stub foot each side. Here they
 *            are parts (src/props/parts.js), capsules drawn and solid from
 *            the same numbers, handed to the house as more of its own
 *            structure, so they bake into the batches the house already
 *            draws: no draw call of their own. The start gate is drawn in
 *            the yard's red (or yellow) so a pilot can find it.
 *   THE CLOCK is src/game/race.js's Race, fed by the shell the travel it
 *            already feeds the room's race, so a pass, a split, a lap and a
 *            record mean here exactly what they mean in a room.
 *
 * WHERE. A spot names the yard's point the course's middle goes on (world
 * metres, the course's own field centre), the quarter turns it is turned
 * by, and the yard's scale: the house maps are built S times life size and
 * the track goes in at S, so a 28 inch gate is a 28 inch gate against the
 * house; Bardwell's place is life size and its whoop is drawn at
 * MICRO_SCALE, so the track goes in at MICRO_SCALE there, a whoop room's
 * size against the whoop.
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

import { courseFromDocument } from '../../game/trackdoc.js';
import { MICRO_SCALE } from '../../game/track.js';
import { PIPE_OD } from '../../trackbuilder/racegow.js';
import { Parts } from '../../props/parts.js';
import { sincos, quarterTurns, quarterSinCos } from '../../props/trig.js';
import { courseDocument, GROUND_LOGOS, COURSE_ID, COURSE_NAME } from './course.js';

export { COURSE_ID, COURSE_NAME };

/*
 * HOW FAR FROM THE TRACK IS TOO FAR, in RaceGOW's real metres past the
 * furthest gate: the owner's "if i fly too far away from the track the
 * timer goes away and the track resets". Three metres is a wide turn round
 * the outside gate and a little more, and well short of the next thing in
 * any of the three yards worth flying to, so the clock is never lost on a
 * line through the track and never kept by somebody who has gone off to
 * fly the house.
 */
export const LEAVE_REAL_M = 3;
/* And over it: a whoop climbing four metres over the top of the tallest
 * gate has left the track as surely as one that flew off sideways. */
export const LEAVE_ABOVE_REAL_M = 4;
/*
 * THE LANDING ZONE where Bardwell's place asks a five inch pilot whether to
 * swap to the whoop (the owner, 2026-10-24: "if i get within a defined
 * boundary and land, it asks if i want to swap to a whoop"): the track's
 * own footprint and this many of RaceGOW's metres round it, painted on the
 * grass so the boundary is a thing a pilot can see. A foot: at
 * Bardwell's the zone then stops short of the map's own start pads.
 */
export const ASK_REAL_M = 0.3;

/* The gate's pipe, RaceGOW's 3/4 inch schedule 40, at the yard's scale. */
const pipeR = (scale) => (PIPE_OD * scale) / 2;

/* The yard's frame for the course: turn by quarter turns, scale, move. */
function framer(spot) {
  const k = spot.scale / MICRO_SCALE;
  const q = quarterTurns(spot.yaw ?? 0);
  const t = quarterSinCos(q);
  const y0 = spot.y ?? 0;
  return {
    k,
    q,
    turn: (q * Math.PI) / 2,
    /* A course point (x, z) to the yard's, as Object3D.rotation.y turns. */
    at(x, z) {
      return [spot.x + k * (x * t.c + z * t.s), spot.z + k * (-x * t.s + z * t.c)];
    },
    y(h) {
      return y0 + k * h;
    },
    /* A direction in the course, turned the same way (no move, no scale). */
    dir(x, z) {
      return [x * t.c + z * t.s, -x * t.s + z * t.c];
    },
  };
}

/* A heading's sin and cos, exact on a quarter turn, which every gate of
 * this track stands at. */
function headingSinCos(a, out) {
  const q = quarterTurns(a);
  if (Math.abs(a - (q * Math.PI) / 2) < 1e-5 || Math.abs(a - (q * Math.PI) / 2 + 2 * Math.PI) < 1e-5
    || Math.abs(a - (q * Math.PI) / 2 - 2 * Math.PI) < 1e-5) {
    return quarterSinCos(q, out);
  }
  return sincos(a, out);
}

/*
 * One RaceGOW gate's pipe as parts, in its own frame (x across the hole, y
 * up, z along travel) handed through `put` into the world. The same
 * members scene.js's micro obstacle() builds and makes solid, at one level:
 * this track has no stacked gate, and one that does is refused rather than
 * drawn wrong. `r` is the pipe's radius in the course's metres, which the
 * layout is worked in, and `rw` in the world's, which the parts are.
 */
function gatePipes(P, m, s, put, r, rw) {
  const d = s.dims;
  if ((d.stack ?? 1) !== 1) {
    throw new Error(`yardtrack: ${s.id} is a stack, and the yard builds single gates`);
  }
  const sides = s.meshSides || null;
  const built = (k) => !sides || Boolean(sides[k]);
  const upX = d.clearW / 2 + r;
  const top = d.sillH + d.clearH;
  const upTop = top + 2 * r;
  for (const sx of [-1, 1]) {
    if (!built(sx < 0 ? 'xNeg' : 'xPos')) {
      continue;
    }
    P.cap(m, put(sx * upX, 0, 0), put(sx * upX, upTop, 0), rw, { kind: 'gate', seg: 8, name: 'yard gate' });
    /* The stub foot lying flat, in line with travel: one pipe thick, four
     * long, as in every photograph of one. */
    P.cap(m, put(sx * upX, r * 0.8, -r * 2), put(sx * upX, r * 0.8, r * 2), rw, { kind: 'obstacle', seg: 6, name: 'yard gate foot' });
  }
  const len = d.clearW + 4 * r;
  if (built('top')) {
    P.cap(m, put(-len / 2, top + r, 0), put(len / 2, top + r, 0), rw, { kind: 'gate', seg: 8, name: 'yard gate' });
  }
  if (d.sillH > 0 && built('bottom')) {
    P.cap(m, put(-len / 2, d.sillH - r, 0), put(len / 2, d.sillH - r, 0), rw, { kind: 'gate', seg: 8, name: 'yard gate' });
  }
}

/*
 * THE TRACK IN A YARD. spot: { x, z, y, yaw, scale, pipe, start, id }:
 *   x, z, y   where the course's middle stands, world metres
 *   yaw       quarter turns only (snapped)
 *   scale     the yard's world metres to a real metre for the track
 *   pipe      the material the pipe is drawn in, start the start gate's:
 *             both colours the yard already draws, so no batch is added
 *   id        the map's, for the record's key
 *
 * Returns { id, name, parts, gates, start, centre, leaveR, top, ask, logos,
 * scale }:
 *   parts    the pipe, the pole, world frame, for the house's structure
 *   gates    one per station in flying order, the shape Race takes
 *   start    { x, z, yaw }: where a run is set down, behind the start gate
 *   centre   { x, z }, leaveR the radius past which the run is reset, and
 *            top the height over which it is too
 *   ask      { x0, x1, z0, z1 }: the landing zone, world rectangle
 *   logos    { x, z, yaw, w, d } the two ground logo pieces' rectangles
 */
export function yardTrack(spot) {
  const F = framer(spot);
  const course = courseFromDocument(courseDocument());
  if (course.trackClass !== 'micro') {
    throw new Error('yardtrack: the track on the board is not a RaceGOW track');
  }
  const P = new Parts();
  const r = pipeR(spot.scale);
  const sc = { s: 0, c: 1 };
  /* Each built gate faces the way its first station is flown, the mesh's
   * frame (scene.js coursePlacements), which is the frame its missing sides
   * are written in (meshSidesFor in src/game/trackdoc.js). */
  const firstYaw = new Map();
  for (const st of course.stations) {
    if (!firstYaw.has(st.elementId)) {
      firstYaw.set(st.elementId, st.yaw);
    }
  }
  const startEl = course.stations.find((st) => !st.virtual).elementId;
  for (const s of course.structures) {
    if (s.type === 'gate' && !s.unbuilt) {
      const yaw = (firstYaw.has(s.id) ? firstYaw.get(s.id) : s.yaw) + F.turn;
      headingSinCos(yaw, sc);
      const [cx, cz] = F.at(s.x, s.z);
      const base = F.y(s.baseY);
      const k = F.k;
      const put = (lx, ly, lz) => [cx + k * lx * sc.c + k * lz * sc.s, base + k * ly, cz - k * lx * sc.s + k * lz * sc.c];
      gatePipes(P, s.id === startEl ? spot.start : spot.pipe, s, put, r / k, r);
    } else if (s.type === 'pole') {
      const [x, z] = F.at(s.x, s.z);
      P.cap(spot.pipe, [x, F.y(s.baseY), z], [x, F.y(s.baseY + s.dims.height), z], F.k * s.dims.poleRadius, { kind: 'pole', seg: 8, name: 'yard pole' });
    }
  }
  /* The stations, in the shape Race takes and scene.js hands it. */
  const gates = course.stations.map((st) => {
    if (st.poly) {
      throw new Error(`yardtrack: ${st.elementId} is a letter, which the yard does not build`);
    }
    const [x, z] = F.at(st.x, st.z);
    const ap = {
      shape: 'square', index: 0, sillH: 0, centreY: F.k * st.centreY, clearW: F.k * st.clearW, clearH: F.k * st.clearH,
    };
    return {
      position: { x, y: F.y(st.baseY), z },
      heading: st.yaw + F.turn,
      pitch: st.pitch ?? 0,
      aperture: ap,
      apertures: [ap],
      kindName: st.virtual ? 'virtualGate' : 'standardGate',
      elementId: st.elementId,
      apertureIndex: st.apertureIndex,
      flyOrder: st.flyOrder,
      virtual: Boolean(st.virtual),
    };
  });
  /* The middle, the reach and the top, from everything built and scored. */
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  let top = -Infinity;
  const take = (x, z, h) => {
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    z0 = Math.min(z0, z);
    z1 = Math.max(z1, z);
    top = Math.max(top, h);
  };
  for (const p of P.list) {
    take(p.a[0], p.a[2], p.a[1] + p.r);
    take(p.b[0], p.b[2], p.b[1] + p.r);
  }
  for (const g of gates) {
    if (!g.virtual) {
      take(g.position.x, g.position.z, g.position.y + g.aperture.centreY + g.aperture.clearH / 2);
    }
  }
  /* And the racing line, which swings wide of the pipe on its turns. */
  const line = course.line.map((p) => {
    const [x, z] = F.at(p.x, p.z);
    return { x, y: F.y(p.y), z };
  });
  for (const p of line) {
    take(p.x, p.z, p.y);
  }
  const centre = { x: (x0 + x1) / 2, z: (z0 + z1) / 2 };
  const reach = Math.hypot((x1 - x0) / 2, (z1 - z0) / 2);
  const [sx, sz] = F.at(course.spawn.x, course.spawn.z);
  const pad = spot.scale * ASK_REAL_M;
  /* The two ground logo pieces in the yard, document metres to the room's
   * (trackdoc.js's toScene, MICRO_SCALE about the field's middle) and on
   * into the yard's. */
  const field = course.field;
  const logos = GROUND_LOGOS.map((g) => {
    const cx = (g.position.x - 10 / 2) * MICRO_SCALE;
    const cz = -(g.position.y - 12 / 2) * MICRO_SCALE;
    const [x, z] = F.at(cx, cz);
    return {
      id: g.id, x, z, yaw: F.turn, w: spot.scale * g.dims.width, d: spot.scale * g.dims.depth,
    };
  });
  return {
    id: spot.id,
    name: COURSE_NAME,
    courseId: COURSE_ID,
    scale: spot.scale,
    field,
    parts: P.list,
    gates,
    start: { x: sx, z: sz, yaw: course.spawn.yaw + F.turn },
    centre,
    leaveR: reach + spot.scale * LEAVE_REAL_M,
    top: top + spot.scale * LEAVE_ABOVE_REAL_M,
    y: spot.y ?? 0,
    ask: askZone(x0, x1, z0, z1, sx, sz, logos, pad),
    logos,
    /* The racing line the room's guide is fitted through, in the yard, for
     * the check to fly, and the box everything above stands in. */
    line,
    box: { x0, x1, z0, z1, top },
  };
}

/*
 * The track on a map's plan: `worldAt(px, py, h)` is the map's own plan to
 * world (../heads/heads.js and its kin), `at` { px, py, q } the plan point
 * the course's middle stands on and its quarter turns, and the rest as
 * yardTrack's spot. Built once per map and kept, since the layout, the
 * index and the checks all ask for it.
 */
const BUILT = new Map();
export function yardTrackOn(worldAt, at, spot) {
  if (!BUILT.has(spot.id)) {
    const [x, y, z] = worldAt(at.px, at.py, 0);
    BUILT.set(spot.id, yardTrack({ ...spot, x, y, z, yaw: (at.q * Math.PI) / 2 }));
  }
  return BUILT.get(spot.id);
}

/* The landing zone: the track, its start and its floor logos, and `pad`
 * round them. */
function askZone(x0, x1, z0, z1, sx, sz, logos, pad) {
  const a = {
    x0: Math.min(x0, sx), x1: Math.max(x1, sx), z0: Math.min(z0, sz), z1: Math.max(z1, sz),
  };
  for (const g of logos) {
    const across = quarterTurns(g.yaw) % 2 !== 0;
    const hx = (across ? g.d : g.w) / 2;
    const hz = (across ? g.w : g.d) / 2;
    a.x0 = Math.min(a.x0, g.x - hx);
    a.x1 = Math.max(a.x1, g.x + hx);
    a.z0 = Math.min(a.z0, g.z - hz);
    a.z1 = Math.max(a.z1, g.z + hz);
  }
  return {
    x0: a.x0 - pad, x1: a.x1 + pad, z0: a.z0 - pad, z1: a.z1 + pad,
  };
}

/* Whether a craft has left the track, and whether a point is in the
 * landing zone, are the shell's questions and live with its timing
 * (src/game/yardrace.js), so the boot does not fetch the track to ask them. */
export { leftTrack, inAskZone } from '../../game/yardrace.js';

/*
 * THE TRACK'S OWN FLOOR LOGOS, the two its author published with it on the
 * board: MiniFigs.me on the big ground logo piece and RaceGOW6 on the small
 * one (the owner, 2026-10-24: "when i said the sponsors i meant minifig.me
 * and racegow only, the other logos as before"). The pictures are the
 * board's own, saved as WebP (assets/yardtrack/, NOTICE), fetched only by
 * the three maps that stand the track.
 *
 * The board stretches each picture over its piece. These are fitted inside
 * instead, at their own shape, because the big piece is long and MiniFigs
 * is wide: it lies down the piece's length, reading from the course's east
 * side with its top to the west, which is how it fills the piece, and
 * RaceGOW6 lies across the small one with its top to the course's north.
 * The small piece lies over the big one's north end, so MiniFigs keeps to
 * what of the big one shows.
 */
export const FLOOR_MARKS = [
  {
    key: 'minifigs', url: new URL('../../../assets/yardtrack/minifigs.webp', import.meta.url).href, aspect: 624 / 400, piece: 0, along: true,
  },
  {
    key: 'racegow6', url: new URL('../../../assets/yardtrack/racegow6.webp', import.meta.url).href, aspect: 287 / 180, piece: 1, along: false,
  },
];

/* How much of its piece's room a picture may fill. */
const FLOOR_FILL = 0.94;

/*
 * Each floor mark as { key, cx, cz, up, w, h }: its middle in the world, the
 * world way its top faces, and its width and height. The yard says how high
 * (floorQuad).
 */
export function floorLogos(t) {
  const [big, small] = t.logos;
  const q = quarterSinCos(quarterTurns(big.yaw));
  /* The course's north and west in the world: -z and -x turned. */
  const north = [-q.s, 0, -q.c];
  const west = [-q.c, 0, q.s];
  /* What of the big piece shows: from lo to hi along its length (north
   * positive), metres from its middle. */
  const at = (small.x - big.x) * north[0] + (small.z - big.z) * north[2];
  let lo = -big.d / 2;
  let hi = big.d / 2;
  if (at < 0) {
    lo = Math.max(lo, at + small.d / 2);
  } else {
    hi = Math.min(hi, at - small.d / 2);
  }
  return FLOOR_MARKS.map((m) => {
    const rect = m.piece === 0 ? big : small;
    const mid = m.piece === 0 ? (lo + hi) / 2 : 0;
    const len = m.piece === 0 ? hi - lo : rect.d;
    /* The room across the picture and up it. */
    const across = (m.along ? len : rect.w) * FLOOR_FILL;
    const upward = (m.along ? rect.w : len) * FLOOR_FILL;
    let w = across;
    let h = w / m.aspect;
    if (h > upward) {
      h = upward;
      w = h * m.aspect;
    }
    return {
      key: m.key,
      cx: rect.x + mid * north[0],
      cz: rect.z + mid * north[2],
      up: m.along ? west : north,
      w,
      h,
    };
  });
}

/*
 * A floor logo as the quad a logo mesh takes ({ cell, p, n, up, w, h }),
 * lying over the highest drawn top under any of it below `below`, PROUD
 * over it: the way the houses' own ground logos are aimed down (aimLogo in
 * ../heads/logos.js), so it never shares a plane with the paint it lies on.
 */
const PROUD = 0.012;
export function floorQuad(parts, f, below) {
  const sideways = Math.abs(f.up[0]) > 0.5;
  const hx = sideways ? f.h / 2 : f.w / 2;
  const hz = sideways ? f.w / 2 : f.h / 2;
  let y = 0;
  for (const b of parts) {
    if (b.t !== 'box' || !b.draw) {
      continue;
    }
    if (b.hi[1] < below && b.hi[1] > y && b.lo[0] < f.cx + hx && b.hi[0] > f.cx - hx && b.lo[2] < f.cz + hz && b.hi[2] > f.cz - hz) {
      y = b.hi[1];
    }
  }
  return {
    cell: f.key, p: [f.cx, y + PROUD, f.cz], n: [0, 1, 0], up: f.up, w: f.w, h: f.h,
  };
}

/* Every floor logo of `t` as a logo mesh's quad, on whatever `parts` draw
 * under it, its `cell` the mark's key. */
export function floorQuads(t, parts) {
  return floorLogos(t).map((f) => floorQuad(parts, f, t.y + 0.05));
}

/*
 * The floor marks' pictures, loaded, as { key: image }: an image that did
 * not come is left out, and its quad is drawn from a blank cell. Never
 * rejects. Browser only.
 */
export function loadFloorMarks() {
  return Promise.all(FLOOR_MARKS.map((m) => new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve([m.key, img]);
    img.onerror = () => resolve([m.key, null]);
    img.src = m.url;
  }))).then((pairs) => Object.fromEntries(pairs.filter(([, img]) => img)));
}

/*
 * The landing zone's boundary as paint on the grass: four strips a hand
 * wide round `ask`, each a box a whisker over the highest drawn top under
 * it, in a colour the yard already draws.
 */
export function askBoundary(t, m, lineW, hOver) {
  const P = new Parts();
  const a = t.ask;
  const h = hOver;
  P.box(m, a.x0, h, a.z0, a.x1, h + 0.012, a.z0 + lineW, { solid: false, cast: false, name: 'yard zone' });
  P.box(m, a.x0, h, a.z1 - lineW, a.x1, h + 0.012, a.z1, { solid: false, cast: false, name: 'yard zone' });
  P.box(m, a.x0, h, a.z0 + lineW, a.x0 + lineW, h + 0.012, a.z1 - lineW, { solid: false, cast: false, name: 'yard zone' });
  P.box(m, a.x1 - lineW, h, a.z0 + lineW, a.x1, h + 0.012, a.z1 - lineW, { solid: false, cast: false, name: 'yard zone' });
  return P.list;
}
