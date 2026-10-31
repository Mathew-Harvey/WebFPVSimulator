/*
 * stadium.js: Bakuon Dome, the place. Pure: no Three.js, so the solids, the
 * truck course and the named gaps load in Node (scripts/dome-check.js) as
 * they do in the browser, and the two cannot disagree about where a wall is.
 *
 * WHAT IT IS. A covered stadium of our own, of the kind Japan builds for
 * baseball and lends to everything else: a long hall of concrete stands
 * under a barrel vault of steel arch trusses and white membrane, with the
 * middle of the roof slid open to the sky. The floor is dirt for a monster
 * truck night: a car crush on one straight, a bus jump on the other, a bus
 * laid across two stacks of cars in the infield, and two kicker ramps in
 * the corners. The owner's ask of 31 October 2026, with the brief's
 * section 16: chase trucks over ramps, the roof truss gaps, tribune
 * strafes. Built from the real kind of place (the Tokyo Dome's scale and
 * membrane, the arch truss roofs of the Nagoya and Oita domes, the dirt
 * floors and jumps of a monster truck show) and not from any game's map.
 *
 * THE FRAME IS THE WORLD'S, as Quad Ball's is (../ball/arena.js): the hall's
 * middle is the origin, its long axis is x, z is across, y is up, metres.
 * The built map's plan puts x east and y north from the plot's near left
 * corner, so a world point is a plan point through toPlan, and the truck
 * course, which is a road element, is written in the plan.
 *
 * EVERY BOX IS ON THE AXES. The stands are rings of full height boxes, one
 * per row, the long sides owning the corners, so a row is four boxes and
 * has no hollow under it. A tunnel through the stands is a row box cut in
 * three along the wall it runs through (cutBox). The vault, which no box
 * can be, is capsules: each arch a truss of chords, verticals and
 * diagonals, and the membrane a row of long capsules lying along the hall
 * every 0.8 m of the arc, their tops on the drawn surface.
 *
 * NO TRIGONOMETRY. The arc is walked in z, and its height and normal are a
 * square root and a division, which IEEE specifies to the bit, so the
 * colliders are the same numbers on every engine.
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

import { Parts } from '../../props/parts.js';

export const DOME_NAME = 'Bakuon Dome';

/* The plot, metres: the hall and a plaza, the pits and a street round it. */
export const FIELD_W = 420;
export const FIELD_D = 330;

/* A world point (x, z) as the plan's (x east, y north). */
export function toPlan(x, z) {
  return [x + FIELD_W / 2, FIELD_D / 2 - z];
}

/*
 * THE HALL, world metres. A monster truck floor is about the size of an
 * American football field's playing area; this one is 116 by 66 m, a little
 * under the Tokyo Dome's 13,000 square metre field.
 *
 *   FLOOR    half length and half width of the dirt, and its depth
 *   BARRIER  the concrete wall round the floor: thickness, height
 *   WALK     the walkway behind the barrier, which the tunnels open onto
 *   LOWER    the lower bowl: rows, tread, rise, the first row's height
 *            over the walkway and where its front edge is in x and z
 *   FASCIA   the wall between the lower bowl and the concourse, which goes
 *            on up as the upper tier's front: thickness and top
 *   UPPER    the upper tier over the concourse: rows, tread, rise, first
 *            row's height, the underside (the concourse's ceiling)
 *   OUTER    the outer walls' inner faces, thickness and height
 *   VAULT    the roof: crown height at z = 0, springing height at the
 *            outer walls' outer face, and the open slot's half length
 */
export const FLOOR = Object.freeze({ hx: 58, hz: 33, dirt: 0.06 });
export const BARRIER = Object.freeze({ t: 0.6, h: 1.4 });
export const WALK = 2.4;
export const LOWER = Object.freeze({
  rows: 16, d: 0.85, rise: 0.42, base: 2.0, x0: FLOOR.hx + BARRIER.t + WALK, z0: FLOOR.hz + BARRIER.t + WALK,
});
export const LOWER_BACK = Object.freeze({ x: LOWER.x0 + LOWER.rows * LOWER.d, z: LOWER.z0 + LOWER.rows * LOWER.d });
export const FASCIA = Object.freeze({ t: 0.3, top: 12.1 });
export const UPPER = Object.freeze({
  rows: 14, d: 0.9, rise: 0.55, base: 11.0, under: 9.6, x0: LOWER_BACK.x + FASCIA.t, z0: LOWER_BACK.z + FASCIA.t,
});
export const UPPER_BACK = Object.freeze({ x: UPPER.x0 + UPPER.rows * UPPER.d, z: UPPER.z0 + UPPER.rows * UPPER.d });
export const UPPER_TOP = UPPER.base + (UPPER.rows - 1) * UPPER.rise;
export const OUTER = Object.freeze({ x: 91, z: 66, t: 1, h: 24 });
export const VAULT = Object.freeze({ crown: 50, spring: 24, half: OUTER.z + OUTER.t, open: 30 });

/* The vault's circle, in the hall's cross section (z, y). */
const RISE = VAULT.crown - VAULT.spring;
export const VAULT_R = (VAULT.half * VAULT.half + RISE * RISE) / (2 * RISE);
export const VAULT_YC = VAULT.crown - VAULT_R;

/* The roof's outer surface over z, and its outward normal there. */
export function vaultY(z) {
  const c = Math.min(Math.abs(z), VAULT.half);
  return VAULT_YC + Math.sqrt(VAULT_R * VAULT_R - c * c);
}
export function vaultNormal(z) {
  const y = vaultY(z);
  return [z / VAULT_R, (y - VAULT_YC) / VAULT_R];
}
/* A point `depth` metres in under the roof's surface at z, as [z, y]. */
export function underVault(z, depth) {
  const y = vaultY(z);
  const [nz, ny] = vaultNormal(z);
  return [z - nz * depth, y - ny * depth];
}

/*
 * THE ARCHES, one every 15 m down the hall. Each is a truss under the
 * membrane: a top chord TRUSS.top under the roof's surface, a bottom chord
 * TRUSS.bottom under it, a vertical at every one of TRUSS.panels stations
 * and a diagonal in every panel. The crown's two panels of the arches over
 * the open slot have neither, so each of those is a window 11 m across and
 * three metres deep: the truss gaps.
 */
export const ARCH_X = [-75, -60, -45, -30, -15, 0, 15, 30, 45, 60, 75];
export const TRUSS = Object.freeze({
  top: 1.4, bottom: 4.8, panels: 24, chord: 0.22, web: 0.12,
});
/* Whether the arch at x is one with a window at its crown. */
export function hasCrownWindow(x) {
  return Math.abs(x) < VAULT.open - 0.01;
}
/* The z of station k of an arch. */
export function stationZ(k) {
  return -VAULT.half + (2 * VAULT.half * k) / TRUSS.panels;
}

/* The membrane's capsules: their radius and their spacing along z. */
export const MEMBRANE = Object.freeze({ r: 0.6, step: 0.8 });

/*
 * THE BIG SCREEN, hung under the middle arch: a box of screens, four
 * cables to the arch. The catwalk runs down the crown under every arch,
 * across the open slot as a bridge.
 */
export const SCREEN = Object.freeze({ hx: 6, hz: 6, y0: 30, y1: 37 });
export const CATWALK = Object.freeze({ y: 42.8, half: 0.7, x: 75 });

/* The tunnels: where they are and how big. Vomitories through the lower
 * bowl from the walkway to the concourse, four down each long side; the
 * truck tunnel through each end, from the floor to the plaza. */
export const VOMS = Object.freeze({ x: [-42, -14, 14, 42], half: 1.6, top: 2.8 });
export const TUNNEL = Object.freeze({ half: 4.5, top: 6 });
/* The gates in the outer long walls (concourse to plaza), and the upper
 * windows above them (upper walkway to the sky). */
export const GATES = Object.freeze({ x: [-56, 0, 56], half: 4, top: 6 });
export const WINDOWS = Object.freeze({
  x: [-77, -63, -49, -35, -21, -7, 7, 21, 35, 49, 63, 77], half: 2.5, y0: 19, y1: 22.5,
});
export const END_DOORS = Object.freeze({ z: [-30, 30], half: 3, top: 5 });
export const END_WINDOWS = Object.freeze({ z: [-50, -30, -14, 14, 30, 50], half: 2.5 });

/* The concourse's columns, under the upper tier. */
export const COLUMNS = Object.freeze({
  z: 57.6, xs: [-84, -72, -60, -48, -36, -24, -12, 12, 24, 36, 48, 60, 72, 84], x: 82.6, zs: [-36, -24, -12, 12, 24, 36], r: 0.5,
});

/*
 * THE TRUCK COURSE, a rounded oblong round the infield: straights along x
 * at z = -16 (driven east) and z = +16 (driven west), the ends turned at a
 * 14 m radius. COURSE_NODES are its corners in the world.
 */
export const COURSE_NODES = [[-40, -16], [40, -16], [40, 16], [-40, 16]];
export const COURSE_WIDTH = 10;
export const COURSE_RADIUS = 14;
/* Half the width of a ramp across the lane. */
export const RAMP_HALF = 4.5;

/* The course as a road element in the plan, `id` naming it. */
export function courseElement(id = 'dm-course') {
  const nodes = COURSE_NODES.map(([x, z]) => toPlan(x, z));
  const [x0, y0] = nodes[0];
  return {
    id,
    type: 'road',
    name: '',
    position: { x: x0, y: y0, z: 0 },
    yaw: 0,
    pitch: 0,
    yawOverridden: false,
    closed: true,
    dims: { width: COURSE_WIDTH, lanes: 1, radius: COURSE_RADIUS },
    nodes: nodes.map(([x, y]) => ({ x: x - x0, y: y - y0 })),
  };
}

/*
 * THE JUMPS on the straights, in world x along the straight and the
 * profile up it (metres along the way the trucks drive, height). Each is a
 * take off ramp, a gap with something in it, and a landing ramp. `dir` is
 * the way the trucks drive along x, `z` the straight.
 *
 *   crush  six crushed cars side by side across the lane
 *   bus    a crushed bus lying across the lane
 *
 * A monster truck's take off ramp is about three metres of dirt; the gap
 * is a ten metre flight, a little over a truck's length and a half.
 */
export const JUMPS = Object.freeze([
  Object.freeze({
    name: 'crush', z: -16, dir: 1, start: -17, up: 6, lip: 1, gap: 10, land: 9, h: 3.0, hLand: 2.6,
  }),
  Object.freeze({
    name: 'bus', z: 16, dir: -1, start: 17, up: 6, lip: 1, gap: 10, land: 9, h: 3.2, hLand: 2.8,
  }),
]);

/* A jump's ramps as [{ x0, x1, pts }] in world x, each a profile of
 * [along, height] from x0 the way the trucks drive. */
export function rampsOf(j) {
  const a = j.start;
  const lipEnd = a + j.dir * (j.up + j.lip);
  const landAt = lipEnd + j.dir * j.gap;
  return {
    take: {
      x0: a,
      x1: lipEnd,
      pts: [[0, 0], [j.up * 0.4, j.h * 0.22], [j.up * 0.75, j.h * 0.6], [j.up, j.h], [j.up + j.lip, j.h]],
    },
    land: {
      x0: landAt,
      x1: landAt + j.dir * j.land,
      pts: [[0, j.hLand], [j.land * 0.2, j.hLand * 0.72], [j.land * 0.55, j.hLand * 0.3], [j.land, 0]],
    },
    gap: { x0: lipEnd, x1: landAt },
  };
}

/* The infield's bus bridge: two stacks of three crushed cars and a bus
 * laid along x over them. The gap under the bus is flown north to south. */
export const BRIDGE = Object.freeze({
  stack: [[-5.5, -4], [4, 5.5]], depth: 1.7, car: 0.9, cars: 3, bus: { hx: 5.6, hz: 1.25, h: 1.8 },
});

/* The kicker ramps in two corners of the floor: where the foot of each is,
 * which way it climbs (a unit vector in x, z), its length, width, height. */
export const KICKERS = Object.freeze([
  Object.freeze({
    x: 42, z: -20, dx: Math.SQRT1_2, dz: -Math.SQRT1_2, len: 9, half: 3.5, h: 3.6,
  }),
  Object.freeze({
    x: -42, z: 20, dx: -Math.SQRT1_2, dz: Math.SQRT1_2, len: 9, half: 3.5, h: 3.6,
  }),
]);

/* A crushed car in the crush: half its length across the lane, height. */
export const CRUSHED = Object.freeze({ half: 2.1, h: 0.95 });

/*
 * A MONSTER TRUCK, metres: 66 inch tyres (1.68 m), 43 inches wide, about
 * 3.7 m tall to the roof, 3.8 m across the tyres, 5.6 m long, the axles
 * 3.4 m apart and the body's floor 1.75 m up. TRUCK_BOX is the moving
 * trucks' solid in the plant; a parked truck is its four wheels and its
 * body, solid, with the room under it between the axles left open.
 */
export const TRUCK = Object.freeze({
  wheelR: 0.84, tyreW: 1.1, track: 2.7, base: 3.4, bodyY: 1.75, roof: 3.7, length: 5.6, width: 3.8,
});
export const TRUCK_BOX = Object.freeze({ length: TRUCK.length, width: TRUCK.width, height: TRUCK.roof });

/* The two trucks parked on the floor for the pit party, square to the
 * hall so their solids are the trucks: heading 0 faces +x, PI faces -x. */
export const PARKED = Object.freeze([
  Object.freeze({ x: 50, z: 25, yaw: Math.PI, livery: 1 }),
  Object.freeze({ x: -50, z: -25, yaw: 0, livery: 3 }),
]);

/* Where the pilot starts: on the dirt at the west end, facing east down
 * the floor, the bus bridge and the big screen in front. */
export const SPAWN = Object.freeze({ x: -51, z: 0 });

/* ------------------------------------------------------------------ */
/* The solids                                                          */
/* ------------------------------------------------------------------ */

/*
 * A box with tunnels through it: `axis` is the axis the box runs along
 * ('x' or 'z'), `holes` [{ c, half, top }] each a stretch of that axis
 * (centre and half width) under `top` that is open. The rest stands: a
 * piece either side, and over each hole whatever of the box is above its
 * top.
 */
function cutBox(P, m, lo, hi, axis, holes, opts) {
  const i = axis === 'x' ? 0 : 2;
  const cuts = holes
    .map((h) => ({ a: Math.max(lo[i], h.c - h.half), b: Math.min(hi[i], h.c + h.half), top: h.top }))
    .filter((h) => h.b > h.a)
    .sort((p, q) => p.a - q.a);
  let at = lo[i];
  const piece = (a, b, y0) => {
    if (b - a < 0.01 || hi[1] - y0 < 0.01) {
      return;
    }
    const l = [...lo];
    const h = [...hi];
    l[i] = a;
    h[i] = b;
    l[1] = y0;
    P.box(m, l[0], l[1], l[2], h[0], h[1], h[2], opts);
  };
  for (const c of cuts) {
    piece(at, c.a, lo[1]);
    piece(c.a, c.b, Math.max(lo[1], c.top));
    at = c.b;
  }
  piece(at, hi[i], lo[1]);
}

/* The vomitories on one long side, as holes along x. */
const vomHoles = () => VOMS.x.map((c) => ({ c, half: VOMS.half, top: VOMS.top }));
const tunnelHole = () => [{ c: 0, half: TUNNEL.half, top: TUNNEL.top }];

/*
 * Everything the place is, worked out once.
 *
 *   parts   Parts: the solids, and what of them the kit draws
 *   seats   [{ side, row, a0, a1, y, at, d }] each row's tread, for the
 *           seats and the crowd: `side` 'n' 's' 'e' 'w', `a0` `a1` its
 *           stretch along the stand, `at` its front edge across, `y` its
 *           top, `d` its tread
 *   gaps    the named gaps, in the plan, for the document
 */
let MEMO = null;
export function domeLayout() {
  if (MEMO) {
    return MEMO;
  }
  const P = new Parts();
  const seats = [];

  /* THE FLOOR: dirt, solid, the ground the plant reads in the hall. */
  P.box('dmDirt', -FLOOR.hx, 0, -FLOOR.hz, FLOOR.hx, FLOOR.dirt, FLOOR.hz, { cast: false, name: 'dirt floor' });
  /* The walkway round it and the concourse, drawn paving, and not solid:
   * the ground under them is the plot's. */
  const xw = LOWER.x0;
  const zw = LOWER.z0;
  for (const s of [-1, 1]) {
    P.box('dmWalk', -xw, 0, s > 0 ? FLOOR.hz + BARRIER.t : -zw, xw, 0.03, s > 0 ? zw : -FLOOR.hz - BARRIER.t, {
      solid: false, cast: false, name: 'walkway',
    });
    P.box('dmWalk', s > 0 ? FLOOR.hx + BARRIER.t : -xw, 0, -FLOOR.hz - BARRIER.t, s > 0 ? xw : -FLOOR.hx - BARRIER.t, 0.03, FLOOR.hz + BARRIER.t, {
      solid: false, cast: false, name: 'walkway',
    });
  }

  /* THE BARRIER: concrete, 1.4 m, open at each end for the truck tunnel. */
  for (const s of [-1, 1]) {
    const z0 = s > 0 ? FLOOR.hz : -FLOOR.hz - BARRIER.t;
    P.box('dmBarrier', -FLOOR.hx - BARRIER.t, 0, z0, FLOOR.hx + BARRIER.t, BARRIER.h, z0 + BARRIER.t, { name: 'barrier' });
    const x0 = s > 0 ? FLOOR.hx : -FLOOR.hx - BARRIER.t;
    cutBox(P, 'dmBarrier', [x0, 0, -FLOOR.hz], [x0 + BARRIER.t, BARRIER.h, FLOOR.hz], 'z', tunnelHole(), { name: 'barrier' });
  }

  /* THE LOWER BOWL: a ring of four boxes a row, the long sides owning the
   * corners, each cut for the tunnels it stands across. */
  for (let i = 0; i < LOWER.rows; i += 1) {
    const xi = LOWER.x0 + i * LOWER.d;
    const zi = LOWER.z0 + i * LOWER.d;
    const top = LOWER.base + i * LOWER.rise;
    for (const s of [-1, 1]) {
      const za = s > 0 ? zi : -zi - LOWER.d;
      cutBox(P, 'dmStand', [-xi - LOWER.d, 0, za], [xi + LOWER.d, top, za + LOWER.d], 'x', vomHoles(), { name: 'lower bowl' });
      seats.push({
        side: s > 0 ? 's' : 'n', tier: 0, row: i, a0: -xi - LOWER.d, a1: xi + LOWER.d, y: top, at: s * zi, d: LOWER.d,
      });
      const xa = s > 0 ? xi : -xi - LOWER.d;
      cutBox(P, 'dmStand', [xa, 0, -zi], [xa + LOWER.d, top, zi], 'z', tunnelHole(), { name: 'lower bowl' });
      seats.push({
        side: s > 0 ? 'e' : 'w', tier: 0, row: i, a0: -zi, a1: zi, y: top, at: s * xi, d: LOWER.d,
      });
    }
  }

  /* THE FASCIA: the concourse's inner wall, and the upper tier's front. */
  const LB = LOWER_BACK;
  for (const s of [-1, 1]) {
    const za = s > 0 ? LB.z : -LB.z - FASCIA.t;
    cutBox(P, 'dmFascia', [-LB.x - FASCIA.t, 0, za], [LB.x + FASCIA.t, FASCIA.top, za + FASCIA.t], 'x', vomHoles(), { name: 'fascia' });
    const xa = s > 0 ? LB.x : -LB.x - FASCIA.t;
    cutBox(P, 'dmFascia', [xa, 0, -LB.z], [xa + FASCIA.t, FASCIA.top, LB.z], 'z', tunnelHole(), { name: 'fascia' });
  }

  /* THE UPPER TIER, over the concourse, the same rings from its ceiling. */
  for (let i = 0; i < UPPER.rows; i += 1) {
    const xi = UPPER.x0 + i * UPPER.d;
    const zi = UPPER.z0 + i * UPPER.d;
    const top = UPPER.base + i * UPPER.rise;
    for (const s of [-1, 1]) {
      const za = s > 0 ? zi : -zi - UPPER.d;
      P.box('dmStand', -xi - UPPER.d, UPPER.under, za, xi + UPPER.d, top, za + UPPER.d, { name: 'upper tier' });
      seats.push({
        side: s > 0 ? 's' : 'n', tier: 1, row: i, a0: -xi - UPPER.d, a1: xi + UPPER.d, y: top, at: s * zi, d: UPPER.d,
      });
      const xa = s > 0 ? xi : -xi - UPPER.d;
      P.box('dmStand', xa, UPPER.under, -zi, xa + UPPER.d, top, zi, { name: 'upper tier' });
      seats.push({
        side: s > 0 ? 'e' : 'w', tier: 1, row: i, a0: -zi, a1: zi, y: top, at: s * xi, d: UPPER.d,
      });
    }
  }
  /* The walkway behind the top row, level with it, out to the outer wall. */
  const UB = UPPER_BACK;
  for (const s of [-1, 1]) {
    P.box('dmStand', -OUTER.x, UPPER.under, s > 0 ? UB.z : -OUTER.z, OUTER.x, UPPER_TOP, s > 0 ? OUTER.z : -UB.z, { name: 'upper walkway' });
    P.box('dmStand', s > 0 ? UB.x : -OUTER.x, UPPER.under, -UB.z, s > 0 ? OUTER.x : -UB.x, UPPER_TOP, UB.z, { name: 'upper walkway' });
  }

  /* THE CONCOURSE'S COLUMNS. */
  for (const s of [-1, 1]) {
    for (const x of COLUMNS.xs) {
      P.post('dmColumn', x, s * COLUMNS.z, 0, UPPER.under, COLUMNS.r, { name: 'column', kind: 'wall', seg: 10 });
    }
    for (const z of COLUMNS.zs) {
      P.post('dmColumn', s * COLUMNS.x, z, 0, UPPER.under, COLUMNS.r, { name: 'column', kind: 'wall', seg: 10 });
    }
  }

  /* THE OUTER WALLS, long sides: gates at the foot, windows high up. */
  for (const s of [-1, 1]) {
    P.wall('dmWall', {
      axis: 'x',
      at: s * (OUTER.z + OUTER.t / 2),
      t: OUTER.t,
      from: -OUTER.x - OUTER.t,
      to: OUTER.x + OUTER.t,
      y0: 0,
      y1: OUTER.h,
      holes: [
        ...GATES.x.map((c) => ({ from: c - GATES.half, to: c + GATES.half, y0: 0, y1: GATES.top })),
        ...WINDOWS.x.map((c) => ({ from: c - WINDOWS.half, to: c + WINDOWS.half, y0: WINDOWS.y0, y1: WINDOWS.y1 })),
      ],
    }, { name: 'outer wall' });
  }
  /* The ends: the tunnel, two doors, windows, and the gable over them up
   * to the vault, in 2 m strips, each as tall as the roof at its outer
   * edge so none comes through the membrane. */
  for (const s of [-1, 1]) {
    const xc = s * (OUTER.x + OUTER.t / 2);
    P.wall('dmWall', {
      axis: 'z',
      at: xc,
      t: OUTER.t,
      from: -OUTER.z,
      to: OUTER.z,
      y0: 0,
      y1: OUTER.h,
      holes: [
        { from: -TUNNEL.half, to: TUNNEL.half, y0: 0, y1: TUNNEL.top },
        ...END_DOORS.z.map((c) => ({ from: c - END_DOORS.half, to: c + END_DOORS.half, y0: 0, y1: END_DOORS.top })),
        ...END_WINDOWS.z.map((c) => ({ from: c - END_WINDOWS.half, to: c + END_WINDOWS.half, y0: WINDOWS.y0, y1: WINDOWS.y1 })),
      ],
    }, { name: 'end wall' });
    for (let z = -VAULT.half; z < VAULT.half - 0.01; z += 2) {
      const z1 = Math.min(z + 2, VAULT.half);
      const top = vaultY(Math.max(Math.abs(z), Math.abs(z1)));
      if (top - OUTER.h < 0.05) {
        continue;
      }
      P.box('dmWall', xc - OUTER.t / 2, OUTER.h, z, xc + OUTER.t / 2, top, z1, { draw: false, name: 'gable' });
    }
  }

  /* THE ROOF. The membrane over both covered ends, capsules along x. */
  for (const s of [-1, 1]) {
    const xa = s * VAULT.open;
    const xb = s * (OUTER.x + OUTER.t);
    for (let z = -VAULT.half; z <= VAULT.half + 1e-9; z += MEMBRANE.step) {
      const [cz, cy] = underVault(z, MEMBRANE.r);
      P.cap('dmMembrane', [xa, cy, cz], [xb, cy, cz], MEMBRANE.r, {
        draw: false, kind: 'wall', name: 'membrane',
      });
    }
  }
  /* The arches. */
  for (const x of ARCH_X) {
    const win = hasCrownWindow(x);
    const top = [];
    const bot = [];
    for (let k = 0; k <= TRUSS.panels; k += 1) {
      const z = stationZ(k);
      top.push(underVault(z, TRUSS.top));
      bot.push(underVault(z, TRUSS.bottom));
    }
    const mid = TRUSS.panels / 2;
    const at = (p) => [x, p[1], p[0]];
    const chord = { kind: 'pole', name: 'arch chord', seg: 6 };
    const web = { kind: 'pole', name: 'arch web', seg: 5 };
    for (let k = 0; k < TRUSS.panels; k += 1) {
      P.cap('dmSteel', at(top[k]), at(top[k + 1]), TRUSS.chord, chord);
      P.cap('dmSteel', at(bot[k]), at(bot[k + 1]), TRUSS.chord, chord);
      const crown = win && (k === mid - 1 || k === mid);
      if (!crown) {
        /* The diagonal leans toward the crown, so the truss reads the
         * same from both ends. */
        if (k < mid) {
          P.cap('dmSteel', at(bot[k]), at(top[k + 1]), TRUSS.web, web);
        } else {
          P.cap('dmSteel', at(top[k]), at(bot[k + 1]), TRUSS.web, web);
        }
      }
      if (k > 0 && !(win && k === mid)) {
        P.cap('dmSteel', at(top[k]), at(bot[k]), TRUSS.web, web);
      }
    }
  }
  /* The catwalk down the crown, under every arch's bottom chord. */
  P.box('dmGrate', -CATWALK.x, CATWALK.y - 0.2, -CATWALK.half, CATWALK.x, CATWALK.y, CATWALK.half, { name: 'catwalk' });
  /* The big screen and its four cables. */
  P.box('dmScreenBox', -SCREEN.hx, SCREEN.y0, -SCREEN.hz, SCREEN.hx, SCREEN.y1, SCREEN.hz, { name: 'big screen' });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const zt = sz * (SCREEN.hz - 1);
      const [, yb] = underVault(zt, TRUSS.bottom);
      P.cap('dmSteel', [sx * (SCREEN.hx - 1), SCREEN.y1 + 0.6, zt], [0, yb - 0.2, zt], 0.05, { kind: 'pole', name: 'screen cable', seg: 4 });
    }
  }
  /* The screen's hangers, square on the catwalk: rods from the catwalk to
   * the arch over it at every arch, so it is hung and not floating. */
  for (const x of ARCH_X) {
    const [, yb] = underVault(0, TRUSS.bottom);
    for (const sz of [-1, 1]) {
      P.cap('dmSteel', [x, CATWALK.y, sz * CATWALK.half], [x, yb - 0.2, sz * CATWALK.half], 0.04, { kind: 'pole', name: 'catwalk hanger', seg: 4 });
    }
  }

  /* THE FLOOR'S FURNITURE. The jumps: each ramp a run of capsules across
   * it at its height, as Ridgeline MX's mounds are, drawn as one shape. */
  const ramps = [];
  for (const j of JUMPS) {
    const r = rampsOf(j);
    for (const part of [r.take, r.land]) {
      ramps.push({
        ...part, z: j.z, dir: j.dir, half: RAMP_HALF,
      });
      const len = Math.abs(part.x1 - part.x0);
      for (let a = 0.45; a < len - 0.2; a += 0.8) {
        const h = profileAt(part.pts, a);
        if (h < 0.3) {
          continue;
        }
        const x = part.x0 + j.dir * a;
        const rr = 0.45;
        P.cap('dmDirtDark', [x, h - rr + FLOOR.dirt, j.z - RAMP_HALF], [x, h - rr + FLOOR.dirt, j.z + RAMP_HALF], rr, {
          draw: false, kind: 'wall', name: `${j.name} ramp`,
        });
      }
    }
    const g = r.gap;
    const gx0 = Math.min(g.x0, g.x1);
    const gx1 = Math.max(g.x0, g.x1);
    if (j.name === 'crush') {
      /* Six crushed cars, side by side across the lane, a hand apart. */
      const n = 6;
      const w = 1.55;
      const start = (gx0 + gx1) / 2 - (n * w) / 2;
      for (let i = 0; i < n; i += 1) {
        const x = start + i * w + 0.04;
        P.box('dmCarBody', x, FLOOR.dirt, j.z - CRUSHED.half, x + w - 0.08, FLOOR.dirt + CRUSHED.h, j.z + CRUSHED.half, { draw: false, name: 'crushed car' });
      }
    } else {
      const c = (gx0 + gx1) / 2;
      P.box('dmCarBody', c - 1.25, FLOOR.dirt, j.z - 5.5, c + 1.25, FLOOR.dirt + 1.9, j.z + 5.5, { draw: false, name: 'crushed bus' });
    }
  }
  /* The bus bridge in the infield. */
  for (const [x0, x1] of BRIDGE.stack) {
    P.box('dmCarBody', x0, FLOOR.dirt, -BRIDGE.depth, x1, FLOOR.dirt + BRIDGE.car * BRIDGE.cars, BRIDGE.depth, { draw: false, name: 'car stack' });
  }
  {
    const b = BRIDGE.bus;
    const y0 = FLOOR.dirt + BRIDGE.car * BRIDGE.cars;
    P.box('dmCarBody', -b.hx, y0, -b.hz, b.hx, y0 + b.h, b.hz, { draw: false, name: 'bridge bus' });
  }
  /* The kickers: capsules across each, at its height. */
  for (const k of KICKERS) {
    const ax = -k.dz;
    const az = k.dx;
    for (let a = 0.45; a < k.len - 0.1; a += 0.8) {
      const h = (k.h * a) / k.len;
      if (h < 0.3) {
        continue;
      }
      const x = k.x + k.dx * a;
      const z = k.z + k.dz * a;
      const rr = 0.45;
      P.cap('dmDirtDark', [x - ax * k.half, h - rr + FLOOR.dirt, z - az * k.half], [x + ax * k.half, h - rr + FLOOR.dirt, z + az * k.half], rr, {
        draw: false, kind: 'wall', name: 'kicker',
      });
    }
    /* Its back: a wall of dirt from the lip to the floor, as capsules
     * standing up. */
    const xb = k.x + k.dx * k.len;
    const zb = k.z + k.dz * k.len;
    for (let t = -k.half; t <= k.half + 1e-9; t += 0.9) {
      P.cap('dmDirtDark', [xb + ax * t, FLOOR.dirt + 0.45, zb + az * t], [xb + ax * t, FLOOR.dirt + k.h - 0.45, zb + az * t], 0.45, {
        draw: false, kind: 'wall', name: 'kicker back',
      });
    }
  }
  /* The parked trucks: four wheels and a body, and room under it. */
  for (const t of PARKED) {
    const T = TRUCK;
    const y0 = FLOOR.dirt;
    for (const ax of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const cx = t.x + ax * T.base / 2;
        const cz = t.z + sz * T.track / 2;
        P.box('dmCarBody', cx - T.wheelR, y0, cz - T.tyreW / 2, cx + T.wheelR, y0 + T.wheelR * 2, cz + T.tyreW / 2, { draw: false, name: 'parked truck wheel' });
      }
    }
    P.box('dmCarBody', t.x - T.length / 2, y0 + T.bodyY + 0.06, t.z - T.width / 2 + 0.3, t.x + T.length / 2, y0 + T.roof, t.z + T.width / 2 - 0.3, { draw: false, name: 'parked truck body' });
  }

  MEMO = { parts: P.list, seats, ramps };
  return MEMO;
}

/* A profile's height at `a` metres along it. */
export function profileAt(pts, a) {
  if (a <= pts[0][0]) {
    return pts[0][1];
  }
  for (let i = 1; i < pts.length; i += 1) {
    if (pts[i][0] >= a) {
      const p = pts[i - 1];
      const q = pts[i];
      const t = q[0] > p[0] ? (a - p[0]) / (q[0] - p[0]) : 0;
      return p[1] + (q[1] - p[1]) * t;
    }
  }
  return pts[pts.length - 1][1];
}

/*
 * THE NAMED GAPS, in the world: { name, x, z, y (the sill), yaw (the
 * window's normal, as a document yaw: 0 faces +x, a quarter turn faces -z),
 * w, h, points }. The yard (./yard.js) turns them into gap elements.
 */
export function domeGaps() {
  const out = [];
  const Q = Math.PI / 2;
  const crownSill = vaultY(0) - TRUSS.bottom + TRUSS.chord + 0.15;
  const crownH = (TRUSS.bottom - TRUSS.top) - 2 * TRUSS.chord - 0.3;
  for (const x of ARCH_X.filter(hasCrownWindow)) {
    out.push({
      name: x === 0 ? 'Crown window' : (x < 0 ? 'West crown window' : 'East crown window'), x, z: 0, y: crownSill, yaw: 0, w: 9, h: crownH, points: 1000,
    });
  }
  out.push({
    name: 'West truck tunnel', x: -FLOOR.hx - BARRIER.t / 2, z: 0, y: FLOOR.dirt, yaw: 0, w: TUNNEL.half * 2 - 0.6, h: TUNNEL.top - 0.4, points: 250,
  });
  out.push({
    name: 'East truck tunnel', x: FLOOR.hx + BARRIER.t / 2, z: 0, y: FLOOR.dirt, yaw: 0, w: TUNNEL.half * 2 - 0.6, h: TUNNEL.top - 0.4, points: 250,
  });
  out.push({
    name: 'Under the bus', x: 0, z: 0, y: FLOOR.dirt + 0.1, yaw: Q, w: 7.4, h: BRIDGE.car * BRIDGE.cars - 0.3, points: 500,
  });
  out.push({
    name: 'Over the big screen', x: 0, z: 0, y: SCREEN.y1 + 0.8, yaw: Q, w: 6, h: CATWALK.y - 0.2 - SCREEN.y1 - 1.2, points: 500,
  });
  out.push({
    name: 'Car crush', x: (rampsOf(JUMPS[0]).gap.x0 + rampsOf(JUMPS[0]).gap.x1) / 2, z: JUMPS[0].z, y: FLOOR.dirt + 1.2, yaw: 0, w: COURSE_WIDTH - 1, h: 1.6, points: 250,
  });
  out.push({
    name: 'Bus jump', x: (rampsOf(JUMPS[1]).gap.x0 + rampsOf(JUMPS[1]).gap.x1) / 2, z: JUMPS[1].z, y: FLOOR.dirt + 2.1, yaw: 0, w: COURSE_WIDTH - 1, h: 1.4, points: 250,
  });
  /* The vomitories: north side through to the concourse, by name. */
  VOMS.x.forEach((x, i) => {
    out.push({
      name: `Gate ${i + 1} tunnel`, x, z: -(LOWER.z0 + 0.3), y: 0.1, yaw: Q, w: VOMS.half * 2 - 0.4, h: VOMS.top - 0.3, points: 250,
    });
    out.push({
      name: `Gate ${i + 5} tunnel`, x, z: LOWER.z0 + 0.3, y: 0.1, yaw: Q, w: VOMS.half * 2 - 0.4, h: VOMS.top - 0.3, points: 250,
    });
  });
  /* Under each parked truck, between its axles, side to side. */
  PARKED.forEach((t, i) => {
    out.push({
      name: i ? 'Under the blue truck' : 'Under the orange truck', x: t.x, z: t.z, y: FLOOR.dirt + 0.05, yaw: Math.PI / 2, w: TRUCK.base - 2 * TRUCK.wheelR - 0.3, h: TRUCK.bodyY - 0.4, points: 500,
    });
  });
  /* Two of the high windows, out to the sky from the top walkway. */
  out.push({
    name: 'Sky window', x: 0 - 7, z: -(OUTER.z + OUTER.t / 2), y: WINDOWS.y0 + 0.2, yaw: Q, w: WINDOWS.half * 2 - 0.4, h: WINDOWS.y1 - WINDOWS.y0 - 0.4, points: 500,
  });
  out.push({
    name: 'Sky window', x: 7, z: OUTER.z + OUTER.t / 2, y: WINDOWS.y0 + 0.2, yaw: Q, w: WINDOWS.half * 2 - 0.4, h: WINDOWS.y1 - WINDOWS.y0 - 0.4, points: 500,
  });
  return out;
}

/*
 * THE HIDDEN KONEX DRONE SIGN (the owner's promise of one logo hidden in
 * every map): flat on the roof of the big screen, facing up, readable only
 * by a pilot who climbs the 37 m to it and looks down from over it.
 */
export const KONEX = Object.freeze({
  p: [0, SCREEN.y1 + 0.02, 0], n: [0, 1, 0], up: [-1, 0, 0], w: 1.2,
});
