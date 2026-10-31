/*
 * plant.js: the chemical end of Hamakaze Works, the half that moves gas,
 * oil, steam and water. The main pipe rack the length of the works and its
 * bridge over the plant road, the branch rack down to the quay, the two
 * columns and the reactor, the three gas spheres, the tank farm in its
 * bund, the flare, the central control house, the cooling tower and the
 * substation.
 *
 * WHAT IT IS MODELLED ON. The refineries and gas terminals of the same
 * coast (the Keihin zone, see ./works.js): a rack carries everything along
 * every road and over it on a truss, a distillation column is a tall plain
 * cylinder ringed with platforms every few metres, a gas sphere stands on
 * a ring of legs at its equator with its underside a storey off the
 * ground, and a tank farm is squat cylinders in a low walled bund. Pipes
 * are lagged in aluminium or painted in the colours Japanese plants code
 * them by (JIS Z 9102: steam a dark red, water a blue, gas a yellow, oil
 * a brown, air a pale grey), and that is the whole of the colour here.
 *
 * SIZES. A rack's tiers at 6 and 10 m, bents every 8 m, as ./works.js says.
 * A 2,000 cubic metre sphere is about 15.8 m across, standing on its legs
 * with its foot 2 to 4 m off the ground (LPG terminal practice); ours is
 * 14 m across with its foot 3 m up, which is the height a five inch wants
 * under it. A column 2.4 to 5 m round and 30 to 60 m high; ours 2.4 by 44
 * and 1.8 by 34.
 *
 * THE FLIGHT LINES.
 *
 *   1. UNDER THE PIPE BRIDGE: down the plant road, 5.5 m under the truss,
 *      the first thing the pilot sees from the gate.
 *   2. BETWEEN THE TIERS: along the main rack at eight metres, inside it,
 *      the bottom tier's pipes underneath and the top tier's beams over,
 *      thirty five bents of it end to end.
 *   3. UNDER THE SPHERE: north to south through the open bays of the
 *      third sphere's legs, under its foot, then between the other two and
 *      on under the rack.
 *   4. TANK ALLEY: between the first two tanks, over the bund wall.
 *   5. THE CONTROL HOUSE, the whoop line: in at the switch room's door,
 *      through the stair hall, up through the stair well, across the
 *      control room and out of the window over the yard; or straight on at
 *      the ground floor through the canteen and out of its door.
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

import { sincos } from '../../props/trig.js';

/*
 * A round platform round a vessel, h0 to h1, R out: drawn as a disc and
 * solid as two crossed boxes inside the round. A capsule cannot be a disc:
 * its ends are rounded by its radius, so a thin one three metres round is
 * a ball three metres round.
 */
export function ringSolid(T, m, px, py, h0, h1, R, name) {
  const a = R * 0.92;
  const b = R * 0.38;
  T.hidden(px - a, py - b, h0, px + a, py + b, h1, 'wall', name);
  T.hidden(px - b, py - a, h0, px + b, py - b, h1, 'wall', name);
  T.hidden(px - b, py + b, h0, px + b, py + a, h1, 'wall', name);
  T.disc(m, px, py, R, h0, h1, 20);
}

/* ------------------------------------------------------------------ *
 * The places.
 * ------------------------------------------------------------------ */

/* The main rack, west to east, and its bents. Over the plant road it
 * spans on a truss from 136 to 154, the pipe bridge. */
export const RACK = { y0: 112, y1: 120, x0: 20, x1: 298, tier1: 6, tier2: 10, beam: 0.5, col: 0.5 };
export const RACK_BENTS = (() => {
  const out = [];
  for (let x = 20; x <= 128; x += 8) {
    out.push(x);
  }
  out.push(136, 154);
  for (let x = 162; x <= 298; x += 8) {
    out.push(x);
  }
  return out;
})();
export const BRIDGE = { x0: 136, x1: 154 };

/* The pipes on each tier: [y across the rack, radius, colour]. */
const TIER1_PIPES = [[113.0, 0.42, 'fkLag'], [114.3, 0.3, 'fkSteam'], [115.5, 0.34, 'fkWaterPipe'], [116.7, 0.25, 'fkGas'], [117.7, 0.22, 'fkOil'], [118.8, 0.32, 'fkLag']];
const TIER2_PIPES = [[113.2, 0.38, 'fkLag'], [114.6, 0.24, 'fkAir'], [117.4, 0.26, 'fkSteam'], [118.7, 0.2, 'fkWaterPipe']];

/* The branch rack down to the quay, north to south. */
export const BRANCH = { x0: 168, x1: 174, y0: 44, y1: 112, tier: 7 };

/* The refinery's columns and reactor. */
export const COLUMNS = [{ px: 190, py: 138, r: 2.4, h: 44 }, { px: 204, py: 138, r: 1.8, h: 34 }];
export const REACTOR = { px: 220, py: 136, r: 3.0, h: 18 };

/* The spheres: centre, radius, legs on the equator. The third is the one
 * flown under, so nothing hangs beneath it. */
export const SPHERE_R = 7;
export const SPHERE_C = 10;
export const SPHERES = [{ px: 262, py: 140, no: 1 }, { px: 288, py: 140, no: 2 }, { px: 275, py: 162, no: 3 }];

/* The tank farm and its bund. */
export const TANKS = [{ px: 194, py: 165, no: 1 }, { px: 216, py: 165, no: 2 }, { px: 238, py: 165, no: 3 }];
export const TANK = { r: 8, h: 13, roof: 1.6 };
export const BUND = { x0: 183, x1: 249, y0: 154, y1: 176.5, h: 1.2 };

/* The flare's foot. The lattice is the kit's mast (./yard.js). */
export const FLARE = { px: 306, py: 170, h: 58 };

/* The control house: two storeys and the openings of the whoop line. */
export const HOUSE = {
  x0: 200, x1: 228, y0: 88, y1: 100, t: 0.3,
  floor1: 4.2, slab: 0.3, roof: 8.4, parapet: 9.6,
  doorY0: 92, doorY1: 95.5, doorH: 3.0,
  partA: 212, partB: 218,
  win: { y0: 91, y1: 97, h0: 5.4, h1: 7.6 },
};

/* The cooling tower and the substation, west of the plant road. */
export const COOLER = { x0: 30, x1: 60, y0: 130, y1: 144, h: 9, fans: [37, 45, 53], fanY: 137, fanR: 3.0, stack: 3.4 };
export const SUBSTATION = { x0: 76, x1: 124, y0: 132, y1: 172 };

/* ------------------------------------------------------------------ *
 * The racks.
 * ------------------------------------------------------------------ */

function pipesAlongX(T, list, h, x0, x1) {
  for (const [y, r, m] of list) {
    T.cap(m, [x0, y, h + r], [x1, y, h + r], r, { name: 'pipe', kind: r > 0.3 ? 'wall' : 'pole', seg: 10 });
  }
}

function mainRack(T) {
  const R = RACK;
  const c = R.col;
  for (const x of RACK_BENTS) {
    for (const [y0, y1] of [[R.y0, R.y0 + c], [R.y1 - c, R.y1]]) {
      T.box('fkSteel', x - c / 2, y0, 0, x + c / 2, y1, R.tier2, { name: 'rack column' });
    }
    for (const t of [R.tier1, R.tier2]) {
      T.box('fkSteel', x - 0.25, R.y0 + c, t - R.beam, x + 0.25, R.y1 - c, t, { name: 'rack beam' });
    }
  }
  /* The longitudinal beams along both column lines, at both tiers. */
  for (const [y0, y1] of [[R.y0, R.y0 + c], [R.y1 - c, R.y1]]) {
    for (const t of [R.tier1, R.tier2]) {
      T.box('fkSteel', R.x0 - c / 2, y0, t - R.beam, R.x1 + c / 2, y1, t, { name: 'rack stringer' });
    }
  }
  pipesAlongX(T, TIER1_PIPES, R.tier1, R.x0 - 0.6, R.x1 + 0.6);
  pipesAlongX(T, TIER2_PIPES, R.tier2, R.x0 - 0.6, R.x1 + 0.6);
  /* The cable tray on the top tier's middle: its two side rails and the
   * black cables laid between them, which is what a pilot under it sees. A
   * plain plate read from below as one long pale wedge. */
  T.box('fkBelt', R.x0, 115.66, R.tier2, R.x1, 116.54, R.tier2 + 0.1, { name: 'cable tray' });
  for (const y of [115.6, 116.54]) {
    T.box('fkSteelDark', R.x0, y, R.tier2, R.x1, y + 0.06, R.tier2 + 0.15, { name: 'cable tray rail' });
  }
  /* The pipe bridge's truss sides over the road, diagonals between the
   * tiers in the planes of the column lines. */
  const B = BRIDGE;
  for (const y of [R.y0 + c / 2, R.y1 - c / 2]) {
    const n = 3;
    for (let k = 0; k < n; k += 1) {
      const xa = B.x0 + ((B.x1 - B.x0) * k) / n;
      const xb = B.x0 + ((B.x1 - B.x0) * (k + 1)) / n;
      const up = k % 2 === 0;
      T.cap('fkSteel', [xa, y, up ? R.tier1 : R.tier2 - R.beam], [xb, y, up ? R.tier2 - R.beam : R.tier1], 0.14, { name: 'bridge diagonal', kind: 'pole' });
    }
  }
  T.dress(() => {
    /* Lagging bands on the lagged pipes, every bent's width, and pipe
     * shoes under each pipe on each beam. */
    for (const x of RACK_BENTS) {
      for (const [list, t] of [[TIER1_PIPES, R.tier1], [TIER2_PIPES, R.tier2]]) {
        for (const [y, r, m] of list) {
          if (m === 'fkLag') {
            T.cyl('fkLagBand', [x + 3.8, y, t + r], [x + 4.2, y, t + r], r + 0.02, 10);
          }
          T.deco('fkSteelDark', x - 0.15, y - 0.12, t, x + 0.15, y + 0.12, t + 0.06);
        }
      }
      /* Knee braces in the bent's plane under each tier. */
      for (const [y, s] of [[R.y0 + c, 1], [R.y1 - c, -1]]) {
        T.cyl('fkSteel', [x, y, R.tier1 - 1.6], [x, y + s * 1.4, R.tier1 - R.beam], 0.06, 4);
      }
    }
  });
  T.wide(() => {
    T.dress(() => {
      /* The bridge's clearance, painted on the truss as every one is. */
      for (const y of [R.y0 - 0.02, R.y1 + 0.02]) {
        T.paint('hazard', B.x0, y - 0.02, R.tier1 - R.beam - 0.4, B.x1, y + 0.02, R.tier1 - R.beam);
      }
    });
  });
  T.sign('clearance', (B.x0 + B.x1) / 2, R.y1 + 0.04, R.tier1 + 1.2, 4.4, 1.1, 'n');
  T.sign('clearance', (B.x0 + B.x1) / 2, R.y0 - 0.04, R.tier1 + 1.2, 4.4, 1.1, 's');
  T.sign('rackNo', 62, R.y1 + 0.04, R.tier2 - 1.4, 1.4, 0.7, 'n');
  T.sign('rackNo', 232, R.y0 - 0.04, R.tier2 - 1.4, 1.4, 0.7, 's');
}

function branchRack(T) {
  const B = BRANCH;
  const c = 0.5;
  for (let y = B.y0; y <= B.y1 - 4; y += 8) {
    for (const [x0, x1] of [[B.x0, B.x0 + c], [B.x1 - c, B.x1]]) {
      T.box('fkSteel', x0, y - c / 2, 0, x1, y + c / 2, B.tier, { name: 'branch column' });
    }
    T.box('fkSteel', B.x0 + c, y - 0.25, B.tier - 0.5, B.x1 - c, y + 0.25, B.tier, { name: 'branch beam' });
  }
  for (const [x0, x1] of [[B.x0, B.x0 + c], [B.x1 - c, B.x1]]) {
    T.box('fkSteel', x0, B.y0 - c / 2, B.tier - 0.5, x1, B.y1, B.tier, { name: 'branch stringer' });
  }
  const pipes = [[169.2, 0.32, 'fkOil'], [170.6, 0.4, 'fkLag'], [172.2, 0.28, 'fkGas']];
  for (const [x, r, m] of pipes) {
    T.cap(m, [x, B.y0 - 0.5, B.tier + r], [x, B.y1, B.tier + r], r, { name: 'pipe', kind: r > 0.3 ? 'wall' : 'pole', seg: 10 });
  }
  /* At the quay end the pipes turn down to a manifold of valves, the
   * loading point for the barges. */
  T.box('concreteMid', B.x0 - 1, B.y0 - 4, 0, B.x1 + 1, B.y0 - 0.5, 0.4, { name: 'manifold plinth' });
  for (const [x, r, m] of pipes) {
    T.cap(m, [x, B.y0 - 0.5, B.tier + r], [x, B.y0 - 0.5, 0.4 + r], r, { name: 'riser', kind: 'pole', seg: 10 });
    T.cap(m, [x, B.y0 - 0.5, 0.4 + r], [x, B.y0 - 3.6, 0.4 + r], r, { name: 'manifold', kind: 'pole', seg: 10 });
  }
  T.dress(() => {
    for (const [x, r] of pipes) {
      T.torus('fkValve', x, B.y0 - 2.2, 0.4 + r * 2 + 0.6, 0.32, 0.04, 0, 0, 4, 12);
      T.cyl('fkSteelDark', [x, B.y0 - 2.2, 0.4 + r * 2], [x, B.y0 - 2.2, 0.4 + r * 2 + 0.6], 0.04, 4);
    }
  });
  T.sign('noFire', (B.x0 + B.x1) / 2, B.y0 - 4.02, 1.6, 1.4, 1.4, 's');
}

/* ------------------------------------------------------------------ *
 * Columns, reactor, spheres, tanks, flare.
 * ------------------------------------------------------------------ */

/* A vertical vessel: solid, its head a dome, a platform every eight
 * metres solid as a thin disc, a caged ladder, and its vapour line over
 * to the rack. */
function column(T, C, name) {
  T.post('fkLag', C.px, C.py, 0, C.h, C.r, { name, kind: 'wall', seg: 16 });
  T.ball('fkLag', C.px, C.py, C.h, C.r);
  T.hidden(C.px - C.r * 0.6, C.py - C.r * 0.6, C.h, C.px + C.r * 0.6, C.py + C.r * 0.6, C.h + C.r * 0.75, 'wall', `${name} head`);
  for (let h = 8; h < C.h - 2; h += 8) {
    ringSolid(T, 'grating', C.px, C.py, h - 0.15, h, C.r + 1.2, 'column platform');
  }
  T.dress(() => {
    T.cyl('fkSoot', [C.px, C.py, 0], [C.px, C.py, 3], C.r + 0.08, 16);
    for (let h = 8; h < C.h - 2; h += 8) {
      T.torus('fkRail', C.px, C.py, h + 1.0, C.r + 1.15, 0.03, 0, 0, 4, 24);
    }
    for (let h = 4; h < C.h; h += 2.5) {
      T.torus('fkLagBand', C.px, C.py, h, C.r + 0.015, 0.025, 0, 0, 3, 24);
    }
    /* The caged ladder up the south face. */
    for (const dx of [-0.25, 0.25]) {
      T.cyl('fkSteelDark', [C.px + dx, C.py - C.r - 0.25, 0], [C.px + dx, C.py - C.r - 0.25, C.h], 0.03, 4);
    }
    for (let h = 2.5; h < C.h; h += 1.2) {
      T.torus('fkSteelDark', C.px, C.py - C.r - 0.5, h, 0.4, 0.02, 0, 0, 3, 10);
    }
  });
  /* The overhead line from the head over to the rack and down to its top
   * tier, lagged. */
  const y1 = RACK.y1 + 1;
  T.cap('fkLag', [C.px, C.py - C.r + 0.2, C.h - 2], [C.px, y1, C.h - 2], 0.35, { name: 'vapour line', kind: 'wall', seg: 10 });
  T.cap('fkLag', [C.px, y1, C.h - 2], [C.px, y1, RACK.tier2 + 0.8], 0.35, { name: 'vapour line', kind: 'wall', seg: 10 });
}

function reactor(T) {
  const R = REACTOR;
  /* On a skirt and four legs, a fat vessel with a dome each end. */
  T.box('concreteMid', R.px - 4, R.py - 4, 0, R.px + 4, R.py + 4, 0.6, { name: 'reactor plinth' });
  T.post('fkWhite', R.px, R.py, 0.6, R.h, R.r, { name: 'reactor', kind: 'wall', seg: 16 });
  T.ball('fkWhite', R.px, R.py, R.h, R.r);
  T.hidden(R.px - 2, R.py - 2, R.h, R.px + 2, R.py + 2, R.h + 2.2, 'wall', 'reactor head');
  ringSolid(T, 'grating', R.px, R.py, 9.85, 10, R.r + 1.3, 'reactor platform');
  T.dress(() => {
    T.torus('fkRail', R.px, R.py, 11.0, R.r + 1.25, 0.03, 0, 0, 4, 24);
    T.cyl('fkRed', [R.px, R.py, R.h + R.r - 0.2], [R.px, R.py, R.h + R.r + 1.4], 0.25, 8);
    T.cyl('fkValve', [R.px, R.py, R.h + R.r + 1.4], [R.px, R.py, R.h + R.r + 1.6], 0.4, 8);
  });
}

function sphere(T, S) {
  const r = SPHERE_R;
  const c = SPHERE_C;
  /* The ball, solid as a ball, on eight legs at its equator. */
  T.cap('fkSphere', [S.px, S.py, c], [S.px, S.py, c], r, { name: 'gas sphere', kind: 'wall', draw: false });
  T.ball('fkSphere', S.px, S.py, c, r);
  const legs = [];
  const sc = { s: 0, c: 0 };
  for (let k = 0; k < 8; k += 1) {
    sincos(((22.5 + 45 * k) * Math.PI) / 180, sc);
    const lx = S.px + r * sc.c;
    const ly = S.py + r * sc.s;
    legs.push([lx, ly]);
    T.post('fkWhite', lx, ly, 0, c, 0.35, { name: 'sphere leg', kind: 'pole', seg: 8 });
  }
  /* Braced in the four diagonal bays only, so the bays that face north,
   * south, east and west are open to fly through. A bay k to k + 1 faces
   * 45 * (k + 1) degrees. */
  for (let k = 0; k < 8; k += 1) {
    if ((k + 1) % 2 === 0) {
      continue;
    }
    const [ax, ay] = legs[k];
    const [bx, by] = legs[(k + 1) % 8];
    T.cap('fkSteel', [ax, ay, 0.4], [bx, by, c - 2], 0.07, { name: 'sphere brace', kind: 'pole' });
    T.cap('fkSteel', [bx, by, 0.4], [ax, ay, c - 2], 0.07, { name: 'sphere brace', kind: 'pole' });
  }
  T.dress(() => {
    /* The leg feet, the top platform and its rail, the stair's last flight
     * up the shell, the relief valves, and a fireproofed band on each leg. */
    for (const [lx, ly] of legs) {
      T.cyl('concreteMid', [lx, ly, 0], [lx, ly, 2.2], 0.45, 8);
      T.cyl('fkSteel', [lx, ly, c - 0.6], [lx, ly, c + 0.2], 0.42, 8);
    }
    T.disc('grating', S.px, S.py, 2.2, c + r - 0.2, c + r - 0.05, 16);
    T.torus('fkRail', S.px, S.py, c + r + 0.85, 2.15, 0.03, 0, 0, 4, 20);
    for (const dx of [-0.6, 0.6]) {
      T.cyl('fkValve', [S.px + dx, S.py, c + r - 0.1], [S.px + dx, S.py, c + r + 1.1], 0.16, 8);
    }
    /* The equator seam, where the legs meet the shell. */
    T.torus('fkLagBand', S.px, S.py, c, r + 0.01, 0.05, 0, 0, 4, 40);
  });
  T.roundSign(`sphere${S.no}`, S.px, S.py, c + 1.8, 6.84, Math.PI / 2, 5.0, 1.1);
  T.roundSign(`sphere${S.no}`, S.px, S.py, c + 1.8, 6.84, -Math.PI / 2, 5.0, 1.1);
}

function tank(T, K) {
  const { r, h, roof } = TANK;
  T.post('fkTank', K.px, K.py, 0, h, r, { name: 'tank', kind: 'wall', seg: 32 });
  T.cone('fkTankRoof', K.px, K.py, h, r + 0.15, roof, 32);
  T.hidden(K.px - r * 0.55, K.py - r * 0.55, h, K.px + r * 0.55, K.py + r * 0.55, h + roof * 0.4, 'wall', 'tank roof');
  T.dress(() => {
    /* The wind girder near the top, the roof's handrail, the spiral stair
     * up the shell and the foam pourers, the furniture of every tank. */
    T.torus('fkSteel', K.px, K.py, h - 0.8, r + 0.25, 0.08, 0, 0, 4, 40);
    T.torus('fkRail', K.px, K.py, h + 1.05, r - 0.1, 0.03, 0, 0, 4, 40);
    const turns = 0.45;
    const n = 18;
    for (let i = 0; i < n; i += 1) {
      const a0 = -Math.PI / 2 + (i / n) * turns * 2 * Math.PI;
      const a1 = -Math.PI / 2 + ((i + 1) / n) * turns * 2 * Math.PI;
      const rr = r + 0.6;
      T.cyl('fkSteel', [K.px + rr * Math.cos(a0), K.py + rr * Math.sin(a0), (i / n) * h], [K.px + rr * Math.cos(a1), K.py + rr * Math.sin(a1), ((i + 1) / n) * h], 0.35, 4);
      const rx = r + 1.0;
      T.cyl('fkRail', [K.px + rx * Math.cos(a0), K.py + rx * Math.sin(a0), (i / n) * h + 1.0], [K.px + rx * Math.cos(a1), K.py + rx * Math.sin(a1), ((i + 1) / n) * h + 1.0], 0.025, 3);
    }
    for (let k = 0; k < 4; k += 1) {
      const a = Math.PI / 4 + (k * Math.PI) / 2;
      T.cyl('fkRed', [K.px + (r + 0.2) * Math.cos(a), K.py + (r + 0.2) * Math.sin(a), 0], [K.px + (r + 0.2) * Math.cos(a), K.py + (r + 0.2) * Math.sin(a), h - 0.2], 0.08, 6);
    }
  });
  T.roundSign(`tank${K.no}`, K.px, K.py, h * 0.62, r, -Math.PI / 2, 7.2, 2.4);
}

function tankFarm(T) {
  for (const K of TANKS) {
    tank(T, K);
  }
  const B = BUND;
  const t = 0.3;
  T.box('concreteWorn', B.x0, B.y0, 0, B.x1, B.y0 + t, B.h, { name: 'bund wall' });
  T.box('concreteWorn', B.x0, B.y1 - t, 0, B.x1, B.y1, B.h, { name: 'bund wall' });
  T.box('concreteWorn', B.x0, B.y0 + t, 0, B.x0 + t, B.y1 - t, B.h, { name: 'bund wall' });
  T.box('concreteWorn', B.x1 - t, B.y0 + t, 0, B.x1, B.y1 - t, B.h, { name: 'bund wall' });
  T.paint('concrete', B.x0 + t, B.y0 + t, 0.004, B.x1 - t, B.y1 - t, 0.01);
  T.dress(() => {
    /* Steps over the bund at the south side. */
    for (let k = 0; k < 4; k += 1) {
      T.deco('concreteMid', 228 + k * 0.01, B.y0 - 1.2 + k * 0.3, 0, 230, B.y0 - 0.9 + k * 0.3, 0.3 * (k + 1));
    }
  });
  T.sign('noFire', 196, B.y0 - 0.02, 0.7, 1.0, 1.0, 's', 0.03);
  T.sign('tankFarm', 210, B.y0 - 0.02, 0.6, 3.2, 0.8, 's', 0.03);
}

function flare(T) {
  const F = FLARE;
  T.post('fkSteelDark', F.px, F.py, 0, F.h, 0.55, { name: 'flare stack', kind: 'pole', seg: 10 });
  T.dress(() => {
    for (let k = 0; k < 7; k += 1) {
      const h0 = F.h - 7 + k;
      T.cyl(k % 2 ? 'fkWhite' : 'fkRed', [F.px, F.py, h0], [F.px, F.py, h0 + 1], 0.6, 10);
    }
    T.cyl('fkSoot', [F.px, F.py, F.h], [F.px, F.py, F.h + 0.8], 0.75, 10, 0.6);
  });
  /* The knockout drum at the foot, lying on two saddles. */
  T.cap('fkLag', [F.px - 10, F.py, 2.2], [F.px - 3, F.py, 2.2], 1.6, { name: 'knockout drum', kind: 'wall', look: 'capsule', seg: 14 });
  T.box('concreteMid', F.px - 9, F.py - 1.4, 0, F.px - 8, F.py + 1.4, 1.0, { name: 'saddle' });
  T.box('concreteMid', F.px - 5, F.py - 1.4, 0, F.px - 4, F.py + 1.4, 1.0, { name: 'saddle' });
}

/* ------------------------------------------------------------------ *
 * The central control house.
 * ------------------------------------------------------------------ */

function house(T) {
  const H = HOUSE;
  const t = H.t;
  const f1 = H.floor1;
  const s = H.slab;
  const dy0 = H.doorY0;
  const dy1 = H.doorY1;
  /* The long walls, south and north, both storeys, solid; their windows
   * are paint and glass, not openings. */
  T.box('wallCream', H.x0, H.y0, 0, H.x1, H.y0 + t, H.roof, { name: 'house wall' });
  T.box('wallCream', H.x0, H.y1 - t, 0, H.x1, H.y1, H.roof, { name: 'house wall' });
  /* The end walls, a door in each at the ground, the east end's control
   * room window above. */
  const end = (x0, x1, win) => {
    T.box('wallCream', x0, H.y0 + t, 0, x1, dy0, f1 + s, { name: 'house end' });
    T.box('wallCream', x0, dy1, 0, x1, H.y1 - t, f1 + s, { name: 'house end' });
    T.box('wallCream', x0, dy0, H.doorH, x1, dy1, f1 + s, { name: 'house end' });
    if (win) {
      const w = H.win;
      T.box('wallCream', x0, H.y0 + t, f1 + s, x1, w.y0, H.roof, { name: 'house end' });
      T.box('wallCream', x0, w.y1, f1 + s, x1, H.y1 - t, H.roof, { name: 'house end' });
      T.box('wallCream', x0, w.y0, f1 + s, x1, w.y1, w.h0, { name: 'house sill' });
      T.box('wallCream', x0, w.y0, w.h1, x1, w.y1, H.roof, { name: 'house head' });
    } else {
      T.box('wallCream', x0, H.y0 + t, f1 + s, x1, H.y1 - t, H.roof, { name: 'house end' });
    }
  };
  end(H.x0, H.x0 + t, false);
  end(H.x1 - t, H.x1, true);
  /* The ground floor's two partitions, a door in each on the line. */
  for (const x of [H.partA, H.partB]) {
    T.box('wallWhite', x, H.y0 + t, 0, x + 0.2, dy0, f1, { name: 'partition' });
    T.box('wallWhite', x, dy1, 0, x + 0.2, H.y1 - t, f1, { name: 'partition' });
    T.box('wallWhite', x, dy0, H.doorH, x + 0.2, dy1, f1, { name: 'partition' });
  }
  /* The first floor, with the stair well open over the stair hall. */
  const wellY1 = 96;
  T.box('concreteMid', H.x0 + t, H.y0 + t, f1, H.partA, H.y1 - t, f1 + s, { name: 'first floor' });
  T.box('concreteMid', H.partB + 0.2, H.y0 + t, f1, H.x1 - t, H.y1 - t, f1 + s, { name: 'first floor' });
  T.box('concreteMid', H.partA, wellY1, f1, H.partB + 0.2, H.y1 - t, f1 + s, { name: 'first floor' });
  /* The first floor's partition between the office and the control room,
   * its door at the north end, off the line. */
  T.box('wallWhite', H.partA, H.y0 + t, f1 + s, H.partA + 0.2, 96.5, H.roof, { name: 'partition' });
  T.box('wallWhite', H.partA, 99.2, f1 + s, H.partA + 0.2, H.y1 - t, H.roof, { name: 'partition' });
  T.box('wallWhite', H.partA, 96.5, f1 + s + 2.6, H.partA + 0.2, 99.2, H.roof, { name: 'partition' });
  /* The roof and its parapet. */
  T.box('concreteMid', H.x0, H.y0, H.roof, H.x1, H.y1, H.roof + 0.4, { name: 'house roof' });
  for (const [x0, y0, x1, y1] of [[H.x0, H.y0, H.x1, H.y0 + 0.2], [H.x0, H.y1 - 0.2, H.x1, H.y1], [H.x0, H.y0 + 0.2, H.x0 + 0.2, H.y1 - 0.2], [H.x1 - 0.2, H.y0 + 0.2, H.x1, H.y1 - 0.2]]) {
    T.box('wallCream', x0, y0, H.roof + 0.4, x1, y1, H.parapet, { name: 'parapet' });
  }
  /* Inside, ground floor: switchgear down both long walls of the switch
   * room; tables in the canteen. */
  T.box('fkConsole', H.x0 + t, H.y1 - t - 1.4, 0, H.partA, H.y1 - t, 2.2, { name: 'switchgear' });
  T.box('fkConsole', H.x0 + t, H.y0 + t, 0, H.partA, H.y0 + t + 1.2, 2.2, { name: 'switchgear' });
  for (const y of [89.8, 97.0]) {
    T.box('fkPallet', H.partB + 1.8, y, 0, H.x1 - 1.8, y + 1.0, 0.76, { name: 'canteen table' });
  }
  /* Upstairs: the long console along the north wall, its screens, and
   * the mimic panel over it; desks in the office. */
  T.box('fkConsole', H.partA + 3, 97.5, f1 + s, H.x1 - t, H.y1 - t - 0.4, f1 + s + 0.8, { name: 'console' });
  T.box('fkConsole', H.partA + 0.6, H.y1 - t - 0.4, f1 + s, H.x1 - 0.6, H.y1 - t, H.roof - 0.4, { name: 'mimic panel' });
  T.box('fkPallet', H.x0 + 1.8, 89.8, f1 + s, H.partA - 1.8, 91.6, f1 + s + 0.78, { name: 'desk' });
  T.dress(() => {
    /* The screens on the console, two to a seat, and the chairs. */
    for (let x = H.partA + 3.4; x < H.x1 - 2; x += 1.1) {
      T.deco('fkScreenDark', x, 98.2, f1 + s + 0.8, x + 0.9, 98.3, f1 + s + 1.4);
      T.paint('fkScreen', x + 0.05, 98.18, f1 + s + 0.85, x + 0.85, 98.2, f1 + s + 1.35);
      T.deco('fkTarp', x + 0.2, 96.6, f1 + s, x + 0.7, 97.1, f1 + s + 0.5);
    }
    /* The mimic panel's lines and lamps. */
    for (let k = 0; k < 5; k += 1) {
      T.paint(k % 2 ? 'fkWaterPipe' : 'fkSteam', H.partA + 1, H.y1 - t - 0.42, f1 + s + 1.6 + k * 0.42, H.x1 - 1, H.y1 - t - 0.4, f1 + s + 1.66 + k * 0.42);
    }
    for (let x = H.partA + 2; x < H.x1 - 1; x += 1.3) {
      T.paint(x % 3 < 1 ? 'lampRed' : 'fkScreen', x, H.y1 - t - 0.43, f1 + s + 2.0, x + 0.12, H.y1 - t - 0.42, f1 + s + 2.12);
    }
    /* The stair in the well, two flights. */
    T.prism('grating', 'y', [[H.partA + 0.4, 0.1], [H.partB - 0.4, f1 - 0.1], [H.partB - 0.4, f1 - 0.3], [H.partA + 0.4, -0.1]], H.y0 + t + 0.2, H.y0 + t + 1.4);
    T.deco('fkRail', H.partA + 0.4, H.y0 + t + 1.4, 1.0, H.partB - 0.4, H.y0 + t + 1.45, 1.05);
    /* The ceiling lights in every room. */
    for (let x = H.x0 + 2; x < H.x1 - 1; x += 3) {
      for (const [h, y] of [[f1 - 0.03, 90], [f1 - 0.03, 98], [H.roof - 0.03, 90], [H.roof - 0.03, 94]]) {
        T.paint('fkLamp', x, y, h - 0.02, x + 1.2, y + 0.2, h);
      }
    }
  });
  T.wide(() => {
    T.dress(() => {
      /* Windows down both long walls, both storeys, and the band of the
       * control room's on the south. */
      for (let x = H.x0 + 1.5; x < H.x1 - 1.5; x += 3) {
        for (const [y0, y1] of [[H.y0 - 0.03, H.y0], [H.y1, H.y1 + 0.03]]) {
          T.paint('glassDark', x, y0, 1.2, x + 1.8, y1, 3.0);
          T.paint(x > H.partA ? 'glassLit' : 'glassDark', x, y0, 5.4, x + 1.8, y1, 7.4);
        }
      }
      for (const [y0, y1] of [[H.y0 - 0.05, H.y0], [H.y1, H.y1 + 0.05]]) {
        T.paint('trim', H.x0, y0, f1 - 0.1, H.x1, y1, f1 + 0.4);
      }
      /* The door frames on the line, painted. */
      for (const x of [H.x0 - 0.04, H.x1]) {
        T.paint('fkSteelDark', x, dy0 - 0.15, 0, x + 0.04, dy0, H.doorH + 0.15);
        T.paint('fkSteelDark', x, dy1, 0, x + 0.04, dy1 + 0.15, H.doorH + 0.15);
        T.paint('fkSteelDark', x, dy0 - 0.15, H.doorH, x + 0.04, dy1 + 0.15, H.doorH + 0.15);
      }
    });
  });
  T.dress(() => {
    /* The air conditioners and the aerial on the roof, a stair up the
     * west end, the rolled up shutter over the west door. */
    for (let k = 0; k < 4; k += 1) {
      T.deco('acUnit', H.x0 + 3 + k * 6, H.y1 - 2.4, H.roof + 0.4, H.x0 + 4.6 + k * 6, H.y1 - 1.6, H.roof + 1.4);
    }
    T.cyl('fkSteel', [H.x1 - 3, H.y0 + 3, H.roof + 0.4], [H.x1 - 3, H.y0 + 3, H.roof + 6], 0.06, 4);
    T.deco('shutter', H.x0 - 0.5, dy0 - 0.2, H.doorH, H.x0 - 0.04, dy1 + 0.2, H.doorH + 0.8);
  });
  T.sign('control', (H.x0 + H.x1) / 2, H.y0 - 0.04, H.roof - 0.9, 8.4, 1.2, 's');
  T.sign('switchRoom', H.x0 - 0.04, (dy0 + dy1) / 2, H.doorH + 0.55, 2.4, 0.6, 'w');
  T.sign('exit', H.x1 + 0.04, (dy0 + dy1) / 2, H.doorH + 0.45, 1.2, 0.6, 'e');
  T.sign('canteen', H.partB + 0.22, (dy0 + dy1) / 2, H.doorH + 0.4, 1.6, 0.5, 'e');
}

/* ------------------------------------------------------------------ *
 * The cooling tower and the substation.
 * ------------------------------------------------------------------ */

function cooler(T) {
  const C = COOLER;
  T.box('fkPanel', C.x0, C.y0, 0.6, C.x1, C.y1, C.h, { name: 'cooling tower' });
  T.box('concreteMid', C.x0 - 1, C.y0 - 1, 0, C.x1 + 1, C.y1 + 1, 0.6, { name: 'cold water basin' });
  for (const x of C.fans) {
    T.post('fkPanelBlue', x, C.fanY, C.h, C.h + C.stack, C.fanR, { name: 'fan stack', kind: 'wall', seg: 20 });
  }
  T.dress(() => {
    T.wide(() => {
      /* The louvres down both long faces, the cooler's whole look. */
      for (let h = 1.0; h < C.h - 0.5; h += 0.45) {
        for (const [y0, y1] of [[C.y0 - 0.12, C.y0], [C.y1, C.y1 + 0.12]]) {
          T.paint('fkPanelBlue', C.x0 + 0.3, y0, h, C.x1 - 0.3, y1, h + 0.16);
        }
      }
    });
    for (const x of C.fans) {
      T.shell('fkSteelDark', x, C.fanY, C.h + C.stack - 0.6, C.h + C.stack - 0.01, C.fanR - 0.08, C.fanR - 0.08, true, null, 20);
      T.cyl('fkSteelDark', [x, C.fanY, C.h + C.stack - 0.7], [x, C.fanY, C.h + C.stack - 0.4], 0.35, 8);
      for (let k = 0; k < 4; k += 1) {
        const a = (k * Math.PI) / 2 + 0.3;
        T.cyl('fkSteel', [x, C.fanY, C.h + C.stack - 0.55], [x + 2.6 * Math.cos(a), C.fanY + 2.6 * Math.sin(a), C.h + C.stack - 0.55], 0.12, 4);
      }
    }
    T.deco('fkRail', C.x0, C.y0, C.h + 1.0, C.x1, C.y0 + 0.05, C.h + 1.05);
    T.deco('fkRail', C.x0, C.y1 - 0.05, C.h + 1.0, C.x1, C.y1, C.h + 1.05);
  });
  /* Its two big blue pipes down to the rack. */
  for (const x of [42, 48]) {
    T.cap('fkWaterPipe', [x, C.y0 - 1, 0.6], [x, RACK.y1 + 0.5, 0.6], 0.5, { name: 'cooling water', kind: 'wall', seg: 10 });
  }
  T.sign('cooler', (C.x0 + C.x1) / 2, C.y0 - 0.14, C.h - 0.9, 7.0, 1.2, 's');
}

function substation(T) {
  const S = SUBSTATION;
  /* Three transformers on their plinths, each with its radiators. */
  for (const x of [84, 98, 112]) {
    T.box('concreteMid', x - 3, 138, 0, x + 3, 144, 0.4, { name: 'transformer plinth' });
    T.box('fkPanelBlue', x - 2.2, 139.2, 0.4, x + 2.2, 142.8, 4.0, { name: 'transformer' });
    T.dress(() => {
      for (let k = 0; k < 6; k += 1) {
        T.deco('fkPanelBlue', x - 2.0 + k * 0.7, 138.6, 0.8, x - 1.8 + k * 0.7, 139.2, 3.6);
        T.deco('fkPanelBlue', x - 2.0 + k * 0.7, 142.8, 0.8, x - 1.8 + k * 0.7, 143.4, 3.6);
      }
      for (const dx of [-1.2, 0, 1.2]) {
        T.cyl('insulatorWhite', [x + dx, 141, 4.0], [x + dx, 141, 5.4], 0.14, 8);
      }
    });
  }
  /* The switchyard's two portals, and the lines from them. */
  for (const y of [156, 166]) {
    for (const x of [S.x0 + 4, S.x1 - 4]) {
      T.post('fkSteel', x, y, 0, 12, 0.3, { name: 'portal leg', kind: 'pole' });
    }
    T.box('fkSteel', S.x0 + 3.6, y - 0.3, 11.4, S.x1 - 3.6, y + 0.3, 12.0, { name: 'portal beam' });
  }
  T.dress(() => {
    for (const x of [88, 100, 112]) {
      for (const y of [156, 166]) {
        T.cyl('insulator', [x, y, 11.4], [x, y, 10.2], 0.12, 8);
      }
      T.wire('rope', [x, 156, 10.2], [x, 166, 10.2], 0.6, 0.03);
      T.wire('rope', [x, 156, 10.2], [x - 14 + (x - 88) * 1.15, 141, 5.4], 1.0, 0.03);
    }
    /* The fence round the yard, mesh on posts. */
    for (const [x0, y0, x1, y1] of [[S.x0, S.y0, S.x1, S.y0], [S.x0, S.y1, S.x1, S.y1], [S.x0, S.y0, S.x0, S.y1], [S.x1, S.y0, S.x1, S.y1]]) {
      const len = Math.hypot(x1 - x0, y1 - y0);
      for (let d = 0; d <= len; d += 3) {
        const px = x0 + ((x1 - x0) * d) / len;
        const py = y0 + ((y1 - y0) * d) / len;
        T.cyl('fkSteel', [px, py, 0], [px, py, 2.2], 0.04, 4);
      }
      T.deco('fkSteel', Math.min(x0, x1) - 0.02, Math.min(y0, y1) - 0.02, 2.1, Math.max(x0, x1) + 0.02, Math.max(y0, y1) + 0.02, 2.16);
    }
  });
  T.wide(() => {
    T.dress(() => {
      T.paint('slab', S.x0, S.y0, 0.004, S.x1, S.y1, 0.01);
    });
  });
  T.sign('highVoltage', (S.x0 + S.x1) / 2, S.y0 - 0.06, 1.4, 2.4, 0.9, 's');
}

/* Everything in this file. */
export function plant(T) {
  mainRack(T);
  branchRack(T);
  for (const [i, C] of COLUMNS.entries()) {
    column(T, C, `column ${i + 1}`);
  }
  reactor(T);
  for (const S of SPHERES) {
    sphere(T, S);
  }
  tankFarm(T);
  flare(T);
  house(T);
  cooler(T);
  substation(T);
}
