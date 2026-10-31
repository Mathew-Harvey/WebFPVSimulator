/*
 * shore.js: where the island meets the sea. The promenade under the hotels'
 * retaining wall with its rail, lamps and shelter, the tetrapods heaped
 * along its sea wall, the fishing harbour on the east quays with its
 * breakwater, beacon, market shed, crane and boats, the coast road and its
 * tunnel through the spur, the lighthouse on the west knob, and the straw
 * rope and torii of the wedded rocks.
 *
 * The real places: Atami's sea wall promenade under its hotel blocks; the
 * harbour of any Izu fishing town, with its red harbour light at the end
 * of the breakwater and its banks of four legged tetrapods; Futami's wedded
 * rocks; the white lighthouses on the capes of the Izu coast.
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

import { rng } from './frame.js';
import { SHELF, TUNNEL, WEDDED, KNOB_TOP } from './terrain.js';

/* The promenade along the sea wall under the hotels. */
export const PROM = { x0: 107, x1: 371, y0: 135, y1: 151, rail: 135.4 };
/* The pavilion on it, a roof on four posts to fly through. */
export const PAVILION = { x0: 236, x1: 244, y0: 139, y1: 145, h: SHELF + 3.0 };
/* The breakwater: its east arm and its south arm, and the beacon. */
export const BREAKWATER = { e: { x0: 392, x1: 398, y0: 18, y1: 58 }, s: { x0: 300, x1: 398, y0: 18, y1: 24 }, h: SHELF + 1.6 };
export const BEACON = { px: 304, py: 21, h0: BREAKWATER.h, h1: BREAKWATER.h + 9 };
/* The fish market's shed, open on every side. */
export const MARKET = { x0: 382, x1: 406, y0: 94, y1: 114, h: SHELF + 5.0, col: 6 };
/* The lighthouse. */
export const LIGHT = { px: 35, py: 225, r0: 2.1, r1: 1.6, h: 12 };
/* The rope between the wedded rocks, from the big one to the small. */
export const ROPE = { a: [154.4, 106.8, 10.6], b: [167.5, 109.6, 6.6], sag: 0.8, r: 0.22 };

export function shore(T) {
  const r = rng(4242);
  promenade(T, r);
  tetrapods(T, r);
  harbour(T, r);
  road(T, r);
  lighthouse(T, r);
  wedded(T, r);
}

/* ------------------------------------------------------------------ */

function promenade(T, r) {
  const P = PROM;
  /* The paving's joints and the kerb along the rail. */
  T.paint('skPave', P.x0, P.y0, SHELF + 0.005, P.x1, P.y1, SHELF + 0.02);
  T.wide(() => T.dress(() => {
    for (let x = P.x0 + 3; x < P.x1; x += 3) {
      T.paint('skStain', x, P.y0 + 0.5, SHELF + 0.02, x + 0.05, P.y1 - 0.3, SHELF + 0.03);
    }
  }));
  /* The rail: posts and two bars, solid as one thin wall. */
  T.box('skRail', P.x0, P.rail - 0.04, SHELF, P.x1, P.rail + 0.04, SHELF + 1.1, { draw: false, kind: 'pole', name: 'promenade rail' });
  T.deco('skMint', P.x0, P.rail - 0.05, SHELF + 1.02, P.x1, P.rail + 0.05, SHELF + 1.1);
  T.deco('skMint', P.x0, P.rail - 0.03, SHELF + 0.5, P.x1, P.rail + 0.03, SHELF + 0.56);
  for (let x = P.x0; x <= P.x1; x += 2.0) {
    T.deco('skMint', x - 0.04, P.rail - 0.04, SHELF, x + 0.04, P.rail + 0.04, SHELF + 1.02);
  }
  /* The lamps every twenty metres, their globes long dark. */
  for (let x = P.x0 + 8; x < P.x1; x += 20) {
    T.post('skIron', x, P.rail + 0.6, SHELF, SHELF + 4.2, 0.08, { kind: 'pole', name: 'promenade lamp' });
    T.cyl('skIron', [x, P.rail + 0.6, SHELF + 4.1], [x, P.rail - 0.3, SHELF + 4.3], 0.05, 4);
    T.ball('skLamp', x, P.rail - 0.3, SHELF + 4.1, 0.22);
  }
  /* The pavilion. */
  const V = PAVILION;
  for (const [px, py] of [[V.x0, V.y0], [V.x1, V.y0], [V.x1, V.y1], [V.x0, V.y1]]) {
    T.post('skWood', px, py, SHELF, V.h, 0.14, { kind: 'pole', name: 'pavilion post' });
  }
  T.frustum('skRoofSlate', { x0: V.x0 - 1, y0: V.y0 - 1, x1: V.x1 + 1, y1: V.y1 + 1 }, V.h, { x0: (V.x0 + V.x1) / 2 - 0.3, y0: (V.y0 + V.y1) / 2 - 0.3, x1: (V.x0 + V.x1) / 2 + 0.3, y1: (V.y0 + V.y1) / 2 + 0.3 }, V.h + 2.0);
  T.frustumSolid({ x0: V.x0 - 0.2, y0: V.y0 - 0.2, x1: V.x1 + 0.2, y1: V.y1 + 0.2 }, V.h, { x0: (V.x0 + V.x1) / 2 - 0.3, y0: (V.y0 + V.y1) / 2 - 0.3, x1: (V.x0 + V.x1) / 2 + 0.3, y1: (V.y0 + V.y1) / 2 + 0.3 }, V.h + 1.7, 3, 'pavilion roof');
  /* Benches facing the sea, a bin, the rust streaks from the rail. */
  T.dress(() => {
    for (let x = P.x0 + 14; x < P.x1 - 4; x += 20) {
      T.deco('skWood', x - 0.9, P.rail + 1.2, SHELF + 0.42, x + 0.9, P.rail + 1.65, SHELF + 0.48);
      T.deco('skWood', x - 0.9, P.rail + 1.6, SHELF + 0.48, x + 0.9, P.rail + 1.66, SHELF + 0.9);
      for (const s of [-0.75, 0.75]) {
        T.deco('skIron', x + s - 0.04, P.rail + 1.2, SHELF, x + s + 0.04, P.rail + 1.65, SHELF + 0.42);
      }
    }
    for (let x = P.x0 + 2; x < P.x1; x += r.range(3, 9)) {
      T.paint('skRust', x, P.rail - 0.6, SHELF - r.range(0.6, 1.8), x + 0.12, P.rail - 0.57, SHELF);
    }
  });
  /* The retaining wall's drain holes and their stains. */
  T.wide(() => {
    for (let x = P.x0 + 6; x < P.x1 - 2; x += 5) {
      for (const h of [SHELF + 2.5, SHELF + 7]) {
        T.paint('skVoid', x - 0.12, P.y1 - 0.03, h - 0.12, x + 0.12, P.y1, h + 0.12);
        T.dress(() => T.paint('skStain', x - 0.1, P.y1 - 0.02, h - 2.2, x + 0.1, P.y1 - 0.005, h - 0.12));
      }
    }
  });
}

/* ------------------------------------------------------------------ */

/* The four legs of a tetrapod, as directions from its centre: a
 * tetrahedron's corners, turned one of four ways by swapping axes. */
const LEGS = [
  [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]],
  [[1, 1, -1], [1, -1, 1], [-1, 1, 1], [-1, -1, -1]],
  [[1, -1, 1], [-1, 1, 1], [1, 1, -1], [-1, -1, -1]],
  [[-1, 1, 1], [1, -1, 1], [1, 1, -1], [-1, -1, -1]],
];
const INV3 = 1 / Math.sqrt(3);

function tetrapod(T, px, py, h, s, turn) {
  for (const [dx, dy, dz] of LEGS[turn]) {
    const k = s * INV3;
    T.cyl('skPod', [px, py, h], [px + dx * k, py + dy * k, h + dz * k], s * 0.32, 6, s * 0.16);
  }
}

/* A bank of tetrapods along a line from a to b, `rows` deep out to
 * (ox, oy), and its solid, a heap under them. */
function bank(T, a, b, ox, oy, rows, r) {
  const len = Math.sqrt((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2);
  const n = Math.floor(len / 2.3);
  for (let row = 0; row < rows; row += 1) {
    for (let i = 0; i < n; i += 1) {
      const t = (i + 0.5 + (row % 2) * 0.5) / n;
      if (t > 1) {
        continue;
      }
      const off = 1.3 + row * 2.0;
      const px = a[0] + (b[0] - a[0]) * t + ox * off;
      const py = a[1] + (b[1] - a[1]) * t + oy * off;
      tetrapod(T, px, py, 1.1 - row * 0.35 + r.range(-0.2, 0.2), 1.5, r.int(0, 3));
    }
  }
  const x0 = Math.min(a[0], b[0], a[0] + ox * (rows * 2), b[0] + ox * (rows * 2));
  const x1 = Math.max(a[0], b[0], a[0] + ox * (rows * 2), b[0] + ox * (rows * 2));
  const y0 = Math.min(a[1], b[1], a[1] + oy * (rows * 2), b[1] + oy * (rows * 2));
  const y1 = Math.max(a[1], b[1], a[1] + oy * (rows * 2), b[1] + oy * (rows * 2));
  T.hidden(x0 + 0.3 * Math.abs(oy), y0 + 0.3 * Math.abs(ox), -0.5, x1 - 0.3 * Math.abs(oy), y1 - 0.3 * Math.abs(ox), 1.4, 'wall', 'tetrapods');
}

function tetrapods(T, r) {
  /* Along the promenade's sea wall, two deep. */
  bank(T, [PROM.x0 + 2, PROM.y0], [PROM.x1, PROM.y0], 0, -1, 2, r);
  /* Outside the breakwater, south and east. */
  const B = BREAKWATER;
  bank(T, [B.s.x0, B.s.y0], [B.e.x1, B.s.y0], 0, -1, 2, r);
  bank(T, [B.e.x1, B.s.y0], [B.e.x1, B.e.y1], 1, 0, 2, r);
}

/* ------------------------------------------------------------------ */

function harbour(T, r) {
  const B = BREAKWATER;
  /* The breakwater: its two arms, the parapet on the sea side. */
  for (const a of [B.e, B.s]) {
    T.box('skGrey', a.x0, a.y0, -1, a.x1, a.y1, B.h, { kind: 'wall', name: 'breakwater' });
    T.paint('skWet', a.x0 - 0.05, a.y0 - 0.05, 0, a.x1 + 0.05, a.y1 + 0.05, 0.8);
  }
  T.box('skGrey', B.s.x0, B.s.y0, B.h, B.e.x1, B.s.y0 + 0.6, B.h + 1.0, { kind: 'wall', name: 'breakwater parapet' });
  T.box('skGrey', B.e.x1 - 0.6, B.s.y0, B.h, B.e.x1, B.e.y1, B.h + 1.0, { kind: 'wall', name: 'breakwater parapet' });
  /* The red beacon at the end of the south arm. */
  const E = BEACON;
  T.disc('skBeaconRed', E.px, E.py, 1.3, E.h0, E.h1 - 1.6, 12);
  T.hidden(E.px - 0.9, E.py - 0.9, E.h0, E.px + 0.9, E.py + 0.9, E.h1 - 1.6, 'wall', 'beacon');
  T.disc('skBeaconWhite', E.px, E.py, 1.32, E.h0 + 2.5, E.h0 + 3.2, 12);
  T.disc('skIron', E.px, E.py, 1.6, E.h1 - 1.6, E.h1 - 1.45, 12);
  T.disc('skLens', E.px, E.py, 0.55, E.h1 - 1.45, E.h1 - 0.5, 10);
  T.cone('skBeaconRed', E.px, E.py, E.h1 - 0.5, 0.7, 0.6, 10);
  /* Bollards along the quay's edge, and the market shed. */
  for (let y = 62; y < 176; y += 9) {
    T.post('skIron', 410.8, y, SHELF, SHELF + 0.55, 0.18, { kind: 'pole', name: 'bollard', look: 'capsule' });
  }
  for (let x = 376; x < 410; x += 9) {
    T.post('skIron', x, 59.2, SHELF, SHELF + 0.55, 0.18, { kind: 'pole', name: 'bollard', look: 'capsule' });
  }
  const M = MARKET;
  for (let x = M.x0; x <= M.x1 + 0.01; x += M.col) {
    for (const y of [M.y0, M.y1]) {
      T.post('skSteel', x, y, SHELF, M.h, 0.16, { kind: 'pole', name: 'market column' });
    }
  }
  T.box('skRoofTin', M.x0 - 1, M.y0 - 1, M.h, M.x1 + 1, M.y1 + 1, M.h + 0.15, { kind: 'wall', name: 'market roof' });
  T.prism('skRoofRust', 'x', [[M.y0 - 1, M.h + 0.15], [(M.y0 + M.y1) / 2, M.h + 1.6], [M.y1 + 1, M.h + 0.15]], M.x0 - 1, M.x1 + 1);
  T.box('skGrey', M.x0 + 0.4, (M.y0 + M.y1) / 2 - 3, M.h + 0.15, M.x1 - 0.4, (M.y0 + M.y1) / 2 + 3, M.h + 0.8, { draw: false, kind: 'wall', name: 'market roof' });
  T.sign('market', (M.x0 + M.x1) / 2, M.y0 - 1.05, M.h + 0.6, 7, 0.9, 's', 0.02);
  /* The market's tables, crates, the ice plant's box, the crane. */
  T.box('skSteel', M.x0 + 3, M.y0 + 4, SHELF, M.x1 - 3, M.y0 + 5.2, SHELF + 0.9, { kind: 'wall', name: 'fish table' });
  T.box('skSteel', M.x0 + 3, M.y1 - 5.2, SHELF, M.x1 - 3, M.y1 - 4, SHELF + 0.9, { kind: 'wall', name: 'fish table' });
  T.box('skCream', 376, 126, SHELF, 388, 134, SHELF + 4.5, { kind: 'wall', name: 'ice house' });
  T.sign('ice', 382, 126, SHELF + 3.6, 3.2, 1.0, 's', 0.03);
  T.paint('skShutter', 378, 125.97, SHELF + 0.02, 386, 126, SHELF + 2.8);
  crane(T, 404, 72, r);
  T.dress(() => {
    for (let q = 0; q < 40; q += 1) {
      const px = r.range(M.x0 + 1, M.x1 - 1);
      const py = r.chance(0.5) ? r.range(M.y0 + 1, M.y0 + 3.5) : r.range(M.y1 - 3.5, M.y1 - 1);
      const c = r.pick(['skBlue', 'skBuoy', 'skMint']);
      const n = r.int(1, 4);
      for (let k = 0; k < n; k += 1) {
        T.deco(c, px - 0.3, py - 0.2, SHELF + k * 0.3, px + 0.3, py + 0.2, SHELF + (k + 1) * 0.3 - 0.02);
      }
    }
    for (let q = 0; q < 8; q += 1) {
      const px = r.range(378, 408);
      const py = r.range(64, 90);
      T.obox('skNet', px, py, r.range(-1, 1), r.range(-1, 1), r.range(1.5, 3), r.range(1, 2), SHELF, SHELF + 0.3);
      T.bead('skBuoy', px + 0.5, py, SHELF + 0.35, 0.25);
    }
  });
  /* The boats in the basin, their buoys, the fishing floats on the
   * breakwater. */
  const boats = [
    [318, 40, 'skHull', 1], [336, 46, 'skHullBlue', -1], [356, 38, 'skHull', 1], [374, 48, 'skHullRed', -1],
  ];
  for (const [px, py, m, d] of boats) {
    boat(T, px, py, m, d);
  }
  T.dress(() => {
    for (let q = 0; q < 12; q += 1) {
      T.bead('skBuoy', r.range(306, 388), r.range(28, 54), 0.15, 0.35);
    }
  });
}

/* A fishing boat along x, its bow to `dir`: the hull a vee extruded,
 * the wheelhouse, the mast, solid as boxes inside the hull. */
function boat(T, px, py, m, dir) {
  const L = 11;
  const B = 3.2;
  const x0 = px - L / 2;
  const x1 = px + L / 2;
  T.prism(m, 'x', [[py - B / 2, 1.4], [py - B * 0.32, -0.6], [py + B * 0.32, -0.6], [py + B / 2, 1.4]], x0, x1);
  /* The bow's point, a wedge of the same. */
  const bx = dir > 0 ? x1 : x0;
  const tip = bx + dir * 2.4;
  T.mesh(m, [
    [bx, py - B / 2, 1.4], [tip, py, 1.6], [bx, py - B * 0.32, -0.6],
    [bx, py + B * 0.32, -0.6], [tip, py, 1.6], [bx, py + B / 2, 1.4],
    [bx, py - B * 0.32, -0.6], [tip, py, 1.6], [bx, py + B * 0.32, -0.6],
  ].map((p, i, all) => (dir < 0 ? p : all[i - (i % 3) + (2 - (i % 3))])));
  T.paint('skIron', x0, py - B / 2 - 0.02, 1.1, x1, py + B / 2 + 0.02, 1.4);
  T.paint('skWoodDark', x0 + 0.2, py - B / 2 + 0.2, 1.3, x1 - 0.2, py + B / 2 - 0.2, 1.35);
  T.box('skHull', px - dir * 1.5 - 1.4, py - 1.1, 1.35, px - dir * 1.5 + 1.4, py + 1.1, 3.4, { kind: 'wall', name: 'wheelhouse' });
  T.paint('skGlassDark', px - dir * 1.5 - 1.42, py - 0.8, 2.5, px - dir * 1.5 + 1.42, py + 0.8, 3.1);
  T.post('skSteel', px + dir * 1.5, py, 1.35, 8.0, 0.08, { kind: 'pole', name: 'mast' });
  T.cyl('skSteel', [px + dir * 1.5, py, 7.6], [px + dir * 5.0, py, 1.6], 0.025, 3);
  T.cyl('skSteel', [px + dir * 1.5, py, 7.6], [px - dir * 4.6, py, 1.6], 0.025, 3);
  T.hidden(x0 + 0.4, py - B * 0.4, -0.5, x1 - 0.4, py + B * 0.4, 1.3, 'wall', 'boat');
  T.dress(() => {
    for (let k = 0; k < 6; k += 1) {
      T.ball('skLamp', px + dir * (1.5 + (k - 2.5) * 1.0), py, 4.5 + Math.abs(k - 2.5) * 0.25, 0.14);
    }
  });
}

/* The quay's crane: a mast, a jib out over the water, its hook. */
function crane(T, px, py, r) {
  T.box('skYellow', px - 1, py - 1, SHELF, px + 1, py + 1, SHELF + 1.0, { kind: 'wall', name: 'crane' });
  T.post('skYellow', px, py, SHELF + 1, SHELF + 9, 0.35, { kind: 'wall', name: 'crane' });
  T.cap('skYellow', [px, py, SHELF + 8.6], [px - 10, py - 3, SHELF + 11], 0.22, { kind: 'pole', name: 'crane jib' });
  T.dress(() => {
    T.cyl('skIron', [px - 10, py - 3, SHELF + 11], [px - 10, py - 3, SHELF + 5], 0.02, 3);
    T.deco('skIron', px - 10.3, py - 3.3, SHELF + 4.6, px - 9.7, py - 2.7, SHELF + 5.0);
  });
  void r;
}

/* ------------------------------------------------------------------ */

/* The coast road up the quays and through the spur, and the tunnel's
 * portals, its lamps inside. */
function road(T, r) {
  const X0 = TUNNEL.x0;
  const X1 = TUNNEL.x1;
  T.paint('skAsphalt', X0, 60, SHELF + 0.005, X1, 262, SHELF + 0.02);
  T.wide(() => T.dress(() => {
    for (let y = 62; y < 260; y += 5) {
      T.paint('skLine', (X0 + X1) / 2 - 0.06, y, SHELF + 0.02, (X0 + X1) / 2 + 0.06, y + 2.5, SHELF + 0.03);
    }
    T.paint('skYellow', X0 + 0.3, 60, SHELF + 0.02, X0 + 0.42, 262, SHELF + 0.03);
    T.paint('skYellow', X1 - 0.42, 60, SHELF + 0.02, X1 - 0.3, 262, SHELF + 0.03);
  }));
  /* The portals: a concrete face round the bore at each end. */
  for (const [y0, y1] of [[TUNNEL.y0 - 0.6, TUNNEL.y0], [TUNNEL.y1, TUNNEL.y1 + 0.6]]) {
    T.box('skGrey', X0 - 1.5, y0, SHELF, X0, y1, TUNNEL.h1 + 1.6, { kind: 'wall', name: 'tunnel portal' });
    T.box('skGrey', X1, y0, SHELF, X1 + 1.5, y1, TUNNEL.h1 + 1.6, { kind: 'wall', name: 'tunnel portal' });
    T.box('skGrey', X0, y0, TUNNEL.h1, X1, y1, TUNNEL.h1 + 1.6, { kind: 'wall', name: 'tunnel portal' });
  }
  T.sign('tunnel', (X0 + X1) / 2, TUNNEL.y0 - 0.6, TUNNEL.h1 + 0.8, 4.2, 0.9, 's', 0.03);
  T.sign('tunnelN', (X0 + X1) / 2, TUNNEL.y1 + 0.6, TUNNEL.h1 + 0.8, 4.2, 0.9, 'n', 0.03);
  for (let y = TUNNEL.y0 + 2; y < TUNNEL.y1; y += 4) {
    T.deco('skIron', (X0 + X1) / 2 - 0.4, y - 0.15, TUNNEL.h1 - 0.15, (X0 + X1) / 2 + 0.4, y + 0.15, TUNNEL.h1);
    T.paint('skLamp', (X0 + X1) / 2 - 0.3, y - 0.1, TUNNEL.h1 - 0.17, (X0 + X1) / 2 + 0.3, y + 0.1, TUNNEL.h1 - 0.15);
  }
  /* The guard rail along the quay's edge north of the spur, the bus stop
   * and its shelter at the road's end. */
  T.box('skSteel', 410.4, 200, SHELF + 0.5, 410.6, 260, SHELF + 0.8, { kind: 'pole', name: 'guard rail' });
  T.dress(() => {
    for (let y = 200; y <= 260; y += 4) {
      T.deco('skSteel', 410.45, y, SHELF, 410.55, y + 0.1, SHELF + 0.8);
    }
  });
  const sh = { x0: 398, x1: 404, y0: 244, y1: 246.4 };
  T.box('skMint', sh.x0, sh.y1 - 0.1, SHELF, sh.x1, sh.y1, SHELF + 2.4, { kind: 'wall', name: 'bus shelter' });
  T.box('skRoofTin', sh.x0 - 0.3, sh.y0 - 0.3, SHELF + 2.4, sh.x1 + 0.3, sh.y1 + 0.1, SHELF + 2.55, { kind: 'wall', name: 'bus shelter' });
  for (const px of [sh.x0 + 0.1, sh.x1 - 0.1]) {
    T.post('skSteel', px, sh.y0, SHELF, SHELF + 2.4, 0.05, { kind: 'pole', name: 'bus shelter' });
  }
  T.post('skSteel', 395.5, 242, SHELF, SHELF + 2.6, 0.04, { kind: 'pole', name: 'bus stop' });
  T.disc('skBlue', 395.5, 242, 0.32, SHELF + 2.3, SHELF + 2.34, 12);
  T.sign('busStop', 395.5, 241.95, SHELF + 2.3, 0.6, 0.6, 's', 0.03);
  T.asset({ type: 'vending', dims: { count: 2, variant: 5 } }, 1, 406.4, 238, SHELF, Math.PI);
  void r;
}

/* ------------------------------------------------------------------ */

function lighthouse(T, r) {
  const L = LIGHT;
  const h0 = KNOB_TOP;
  const top = h0 + L.h;
  T.cyl('skBeaconWhite', [L.px, L.py, h0], [L.px, L.py, top], L.r0, 16, L.r1);
  T.post('skBeaconWhite', L.px, L.py, h0, top, L.r1, { draw: false, kind: 'wall', name: 'lighthouse' });
  T.disc('skIron', L.px, L.py, L.r1 + 0.7, top, top + 0.2, 16);
  T.disc('skLens', L.px, L.py, L.r1 - 0.3, top + 0.2, top + 2.0, 12);
  T.post('skLens', L.px, L.py, top, top + 2.0, L.r1 - 0.3, { draw: false, kind: 'wall', name: 'lighthouse lantern' });
  T.cone('skIron', L.px, L.py, top + 2.0, L.r1, 1.0, 12);
  T.cyl('skIron', [L.px, L.py, top + 3.0], [L.px, L.py, top + 3.8], 0.05, 4);
  /* The gallery's rail, the door, the windows up the tower. */
  T.dress(() => {
    const n = 16;
    for (let i = 0; i < n; i += 1) {
      const [ux, uy] = RING16[i];
      T.cyl('skIron', [L.px + ux * (L.r1 + 0.65), L.py + uy * (L.r1 + 0.65), top + 0.2], [L.px + ux * (L.r1 + 0.65), L.py + uy * (L.r1 + 0.65), top + 1.1], 0.02, 3);
    }
    T.torus('skIron', L.px, L.py, top + 1.1, L.r1 + 0.65, 0.025, 0, 0, 4, 24);
  });
  T.roundSign('lightDoor', L.px, L.py, h0 + 1.1, L.r0 + 0.02, Math.PI * 1.5, 1.0, 2.0, 0.03);
  for (const k of [0.35, 0.65]) {
    T.roundSign('lightWindow', L.px, L.py, h0 + L.h * k, L.r0 - (L.r0 - L.r1) * k + 0.02, Math.PI * (k === 0.35 ? 0.5 : 1.2), 0.5, 0.8, 0.03);
  }
  void r;
}

/* Sixteen points round a circle, by the same exact rotation as the rocks'
 * (./terrain.js UNIT), for the gallery's rail. */
const RING16 = (() => {
  const out = [];
  const c = 0.9238795325112867;
  const s = 0.3826834323650898;
  let x = 1;
  let y = 0;
  for (let i = 0; i < 16; i += 1) {
    out.push([x, y]);
    const nx = x * c - y * s;
    y = x * s + y * c;
    x = nx;
  }
  return out;
})();

/* ------------------------------------------------------------------ */

/* THE WEDDED ROCKS: the straw rope between them, solid, its paper
 * streamers hanging, and the little torii on the big rock's top. */
function wedded(T, r) {
  const { a, b, sag, r: rad } = ROPE;
  const n = 8;
  let prev = a;
  for (let i = 1; i <= n; i += 1) {
    const t = i / n;
    const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t - 4 * sag * t * (1 - t)];
    T.cap('skRope', prev, p, rad, { kind: 'pole', name: 'shimenawa', seg: 6 });
    if (i < n) {
      T.dress(() => T.paint('skPaper', p[0] - 0.08, p[1] - 0.02, p[2] - 0.9, p[0] + 0.08, p[1] + 0.02, p[2] - rad));
    }
    prev = p;
  }
  const big = WEDDED[0];
  const h = big.h;
  for (const s of [-1, 1]) {
    T.post('skVermilion', big.px + s * 1.1, big.py, h - 0.2, h + 2.4, 0.09, { kind: 'pole', name: 'rock torii' });
  }
  T.box('skVermilion', big.px - 1.6, big.py - 0.1, h + 2.4, big.px + 1.6, big.py + 0.1, h + 2.6, { kind: 'wall', name: 'rock torii' });
  T.deco('skIron', big.px - 1.7, big.py - 0.12, h + 2.6, big.px + 1.7, big.py + 0.12, h + 2.7);
  T.box('skVermilion', big.px - 1.3, big.py - 0.07, h + 1.95, big.px + 1.3, big.py + 0.07, h + 2.1, { kind: 'wall', name: 'rock torii' });
  void r;
}
