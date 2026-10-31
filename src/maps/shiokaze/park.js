/*
 * park.js: the hotels' seaside garden at the island's west end, gone to
 * grass, and the race through it. A dry fountain, a wisteria pergola, the
 * little amusement park's rusted Ferris wheel, a climbing frame, the black
 * pines every Japanese shore plants against the wind, and ten old garden
 * arches of painted pipe that are the park race's ten gates, numbered on
 * plates over their heads.
 *
 * THE RACE is ten named gaps flown in order, as Joshua Bardwell's house's
 * is (../bardwell/bardwell.js GATES): each gate is a frame drawn and solid,
 * and its window the gap counter scores. A lap from the forecourt west
 * round the park and back is about 420 m.
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
import { TOP, UNIT } from './terrain.js';
import { sincos } from '../../props/trig.js';

/* An arch's clear opening. */
export const ARCH_W = 3.4;
export const ARCH_H = 3.0;

/* The gates, in race order: the foot of the opening's middle, and the
 * heading it is flown along, whole degrees, east 0 and north 90. Gates 5
 * and 6 are the pergola's two ends; gate 8 is under the wheel. */
export const GATES = [
  { px: 110, py: 182, deg: 200 },
  { px: 84, py: 165, deg: 190 },
  { px: 56, py: 161, deg: 135 },
  { px: 44, py: 188, deg: 75 },
  { px: 60.2, py: 242.6, deg: 90, pergola: true },
  { px: 60.2, py: 263.4, deg: 90, pergola: true },
  { px: 80, py: 288, deg: -27 },
  { px: 100, py: 272, deg: -90, wheel: true },
  { px: 106, py: 238, deg: -100 },
  { px: 96, py: 205, deg: -150 },
];

export const PERGOLA = { x0: 58, x1: 62.4, y0: 243, y1: 263, h: 3.0 };
export const FOUNTAIN = { px: 72, py: 196, r: 4.2 };
/* The wheel: its axle, its radius, the leg frames' plan y and foot span. */
export const WHEEL = { px: 100, py: 272, h: TOP + 11.6, R: 9, legY: [269.5, 274.5], foot: 4 };

const SC = { s: 0, c: 1 };
const unit = (deg) => {
  sincos((deg * Math.PI) / 180, SC);
  return [SC.c, SC.s];
};

export function park(T) {
  const r = rng(808);
  GATES.forEach((g, i) => {
    if (!g.pergola && !g.wheel) {
      arch(T, g, i + 1, r);
    } else {
      plate(T, g, i + 1, g.wheel ? TOP + 4.0 : TOP + PERGOLA.h + 0.9);
    }
  });
  pergola(T, r);
  fountain(T, r);
  wheel(T, r);
  climbingFrame(T, 92, 224);
  sandpit(T, 90.6, 222.6, 96.4, 227.4);
  pines(T, r);
  garden(T, r);
}

/* A garden arch across the heading: two posts, the bar, the round top's
 * hoop, the vines on it; the number plate over it. */
function arch(T, g, n, r) {
  const [ux, uy] = unit(g.deg);
  const ax = -uy;
  const ay = ux;
  const half = ARCH_W / 2 + 0.08;
  const p = (s) => [g.px + ax * s * half, g.py + ay * s * half];
  const [lx, ly] = p(-1);
  const [rx, ry] = p(1);
  const m = n % 2 ? 'skMint' : 'skPink';
  T.post(m, lx, ly, TOP, TOP + ARCH_H + 0.1, 0.08, { kind: 'pole', name: 'park gate' });
  T.post(m, rx, ry, TOP, TOP + ARCH_H + 0.1, 0.08, { kind: 'pole', name: 'park gate' });
  T.cap(m, [lx, ly, TOP + ARCH_H + 0.1], [rx, ry, TOP + ARCH_H + 0.1], 0.08, { kind: 'pole', name: 'park gate' });
  /* The hoop over the bar, in five straight pieces. */
  let prev = [lx, ly, TOP + ARCH_H + 0.1];
  const pts = [[-0.8, 0.45], [-0.35, 0.75], [0.35, 0.75], [0.8, 0.45], [1, 0]];
  for (const [s, up] of pts) {
    const q = [g.px + ax * s * half, g.py + ay * s * half, TOP + ARCH_H + 0.1 + up];
    T.cyl(m, prev, q, 0.06, 5);
    prev = q;
  }
  plate(T, g, n, TOP + ARCH_H + 0.62);
  T.dress(() => {
    for (let k = 0; k < 10; k += 1) {
      const s = r.chance(0.5) ? -1 : 1;
      const [qx, qy] = p(s);
      T.bead('skIvy', qx + r.range(-0.15, 0.15), qy + r.range(-0.15, 0.15), TOP + r.range(0.2, ARCH_H), r.range(0.15, 0.3));
    }
    for (let k = 0; k < 3; k += 1) {
      T.bead('skWeed', g.px + ax * r.range(-half, half), g.py + ay * r.range(-half, half), TOP + 0.05, r.range(0.2, 0.4));
    }
  });
  /* The rust down each post. */
  T.paint('skRust', lx - 0.085, ly - 0.085, TOP, lx + 0.085, ly + 0.085, TOP + 0.5);
  T.paint('skRust', rx - 0.085, ry - 0.085, TOP, rx + 0.085, ry + 0.085, TOP + 0.5);
}

/* The number plate over a gate, facing the pilot coming in. */
function plate(T, g, n, h) {
  const [ux, uy] = unit(g.deg);
  /* The plate faces back along the heading, on the nearest plan face. */
  const face = Math.abs(ux) > Math.abs(uy) ? (ux > 0 ? 'w' : 'e') : (uy > 0 ? 's' : 'n');
  const back = { w: [-1, 0], e: [1, 0], s: [0, -1], n: [0, 1] }[face];
  T.sign(`gate${n}`, g.px + back[0] * 0.05, g.py + back[1] * 0.05, h, 0.8, 0.8, face, 0.02);
  T.deco('skIron', g.px - 0.42 * Math.abs(back[1]) - 0.04 * Math.abs(back[0]), g.py - 0.42 * Math.abs(back[0]) - 0.04 * Math.abs(back[1]), h - 0.42, g.px + 0.42 * Math.abs(back[1]) + 0.04 * Math.abs(back[0]), g.py + 0.42 * Math.abs(back[0]) + 0.04 * Math.abs(back[1]), h + 0.42);
}

/* THE PERGOLA: posts both sides every two and a half metres, the beams
 * over, the wisteria gone wild on top, and its roof solid. */
function pergola(T, r) {
  const P = PERGOLA;
  for (let y = P.y0; y <= P.y1 + 0.01; y += 2.5) {
    for (const x of [P.x0, P.x1]) {
      T.post('skWood', x, y, TOP, TOP + P.h, 0.12, { kind: 'pole', name: 'pergola post' });
    }
    T.box('skWood', P.x0 - 0.5, y - 0.09, TOP + P.h, P.x1 + 0.5, y + 0.09, TOP + P.h + 0.22, { kind: 'wall', name: 'pergola beam' });
  }
  for (const x of [P.x0, P.x1]) {
    T.box('skWood', x - 0.09, P.y0 - 0.3, TOP + P.h + 0.22, x + 0.09, P.y1 + 0.3, TOP + P.h + 0.42, { kind: 'wall', name: 'pergola rail' });
  }
  /* The vine's mat over it, solid, and its fronds hanging. */
  T.box('skIvy', P.x0 - 0.6, P.y0 - 0.2, TOP + P.h + 0.42, P.x1 + 0.6, P.y1 + 0.2, TOP + P.h + 0.9, { draw: false, kind: 'wall', name: 'wisteria' });
  for (let y = P.y0; y < P.y1; y += 1.2) {
    for (const x of [P.x0 - 0.2, (P.x0 + P.x1) / 2, P.x1 + 0.2]) {
      T.ball('skIvy', x + r.range(-0.3, 0.3), y + r.range(-0.3, 0.3), TOP + P.h + 0.6, r.range(0.5, 0.8));
    }
  }
  T.dress(() => {
    for (let q = 0; q < 26; q += 1) {
      const x = r.chance(0.5) ? P.x0 + r.range(-0.2, 0.25) : P.x1 + r.range(-0.25, 0.2);
      T.bead('skPink', x, r.range(P.y0, P.y1), TOP + P.h - r.range(0.1, 0.7), r.range(0.1, 0.2));
    }
  });
}

/* THE FOUNTAIN: its basin, dry, its middle tier, weed in the bowl. */
function fountain(T, r) {
  const F = FOUNTAIN;
  T.disc('skStone', F.px, F.py, F.r, TOP, TOP + 0.6, 24);
  T.disc('skStain', F.px, F.py, F.r - 0.35, TOP + 0.6, TOP + 0.62, 24);
  T.hidden(F.px - F.r * 0.7, F.py - F.r * 0.7, TOP, F.px + F.r * 0.7, F.py + F.r * 0.7, TOP + 0.6, 'wall', 'fountain');
  T.disc('skStone', F.px, F.py, 0.5, TOP + 0.6, TOP + 2.2, 10);
  T.disc('skStone', F.px, F.py, 1.5, TOP + 2.2, TOP + 2.5, 16);
  T.hidden(F.px - 0.4, F.py - 0.4, TOP + 0.6, F.px + 0.4, F.py + 0.4, TOP + 2.5, 'wall', 'fountain');
  T.ball('skStone', F.px, F.py, TOP + 2.8, 0.35);
  T.dress(() => {
    for (let q = 0; q < 18; q += 1) {
      const [ux, uy] = UNIT[12][q % 12];
      const k = r.range(1.0, F.r - 0.6);
      T.bead('skWeed', F.px + ux * k, F.py + uy * k, TOP + 0.7, r.range(0.2, 0.4));
    }
  });
}

/* THE FERRIS WHEEL: two A frames, the axle, eight spokes, the rim and the
 * gondolas, all rust; turned so no gondola hangs at the bottom, and the
 * way under it is gate 8. Still, because a wheel that turned would be
 * geometry a craft can hit that is not on the step's clock. */
function wheel(T, r) {
  const W = WHEEL;
  for (const y of W.legY) {
    for (const s of [-1, 1]) {
      T.cap('skRust', [W.px + s * W.foot, y, TOP], [W.px, y, W.h], 0.16, { kind: 'pole', name: 'wheel leg' });
    }
    T.cap('skRust', [W.px - W.foot * 0.55, y, TOP + 5], [W.px + W.foot * 0.55, y, TOP + 5], 0.07, { kind: 'pole', name: 'wheel brace' });
    T.box('skGrey', W.px - W.foot - 0.5, y - 0.5, TOP, W.px - W.foot + 0.5, y + 0.5, TOP + 0.4, { kind: 'wall', name: 'wheel footing' });
    T.box('skGrey', W.px + W.foot - 0.5, y - 0.5, TOP, W.px + W.foot + 0.5, y + 0.5, TOP + 0.4, { kind: 'wall', name: 'wheel footing' });
  }
  T.cap('skIron', [W.px, W.legY[0], W.h], [W.px, W.legY[1], W.h], 0.3, { kind: 'wall', name: 'wheel axle' });
  /* Eight spokes and the rim as sixteen straight pieces, in the x h
   * plane, turned half a spoke. */
  const yMid = (W.legY[0] + W.legY[1]) / 2;
  const rim = [];
  const c = 0.9238795325112867;
  const s = 0.3826834323650898;
  for (let i = 0; i < 16; i += 1) {
    const [ux, uy] = UNIT[8][i >> 1];
    /* Odd points half way round to the next, by the half angle. */
    const [vx, vy] = i % 2 ? [ux * c - uy * s, ux * s + uy * c] : [ux, uy];
    /* Start half a spoke round: rotate by 22.5 degrees. */
    rim.push([vx * c - vy * s, vx * s + vy * c]);
  }
  for (let i = 0; i < 16; i += 1) {
    const [ax, az] = rim[i];
    const [bx, bz] = rim[(i + 1) % 16];
    T.cap('skRust', [W.px + ax * W.R, yMid, W.h + az * W.R], [W.px + bx * W.R, yMid, W.h + bz * W.R], 0.14, { kind: 'pole', name: 'wheel rim' });
    if (i % 2 === 0) {
      T.cap('skRust', [W.px, yMid, W.h], [W.px + ax * W.R, yMid, W.h + az * W.R], 0.07, { kind: 'pole', name: 'wheel spoke' });
      /* The gondola hung under its point of the rim. */
      const gx = W.px + ax * W.R;
      const gz = W.h + az * W.R;
      T.box(r.pick(['skMint', 'skPink', 'skYellow', 'skBlue']), gx - 0.7, yMid - 0.7, gz - 1.9, gx + 0.7, yMid + 0.7, gz - 0.6, { kind: 'wall', name: 'gondola' });
      T.deco('skRoofTin', gx - 0.8, yMid - 0.8, gz - 0.6, gx + 0.8, yMid + 0.8, gz - 0.45);
      T.cyl('skIron', [gx, yMid, gz - 0.45], [gx, yMid, gz], 0.04, 3);
      T.paint('skVoid', gx - 0.5, yMid - 0.72, gz - 1.5, gx + 0.5, yMid - 0.7, gz - 0.9);
    }
  }
  T.dress(() => {
    T.torus('skIron', W.px, yMid, W.h, 1.0, 0.12, 0, 1, 6, 16);
  });
}

/* The sandpit under the climbing frame, in its timber edge. */
function sandpit(T, x0, y0, x1, y1) {
  T.paint('skSand', x0, y0, TOP + 0.005, x1, y1, TOP + 0.05);
  T.deco('skWood', x0 - 0.15, y0 - 0.15, TOP, x1 + 0.15, y0, TOP + 0.2);
  T.deco('skWood', x0 - 0.15, y1, TOP, x1 + 0.15, y1 + 0.15, TOP + 0.2);
  T.deco('skWood', x0 - 0.15, y0, TOP, x0, y1, TOP + 0.2);
  T.deco('skWood', x1, y0, TOP, x1 + 0.15, y1, TOP + 0.2);
}

/* A climbing frame: a box of bars, three by two by two. */
function climbingFrame(T, px, py) {
  const w = 3;
  const d = 2;
  const h = 2;
  for (const [x, y] of [[0, 0], [w, 0], [w, d], [0, d]]) {
    T.post('skBlue', px + x, py + y, TOP, TOP + h, 0.05, { kind: 'pole', name: 'climbing frame' });
  }
  for (let k = 1; k <= 3; k += 1) {
    const z = TOP + (h * k) / 3;
    T.cyl('skYellow', [px, py, z], [px + w, py, z], 0.035, 4);
    T.cyl('skYellow', [px, py + d, z], [px + w, py + d, z], 0.035, 4);
    T.cyl('skYellow', [px, py, z], [px, py + d, z], 0.035, 4);
    T.cyl('skYellow', [px + w, py, z], [px + w, py + d, z], 0.035, 4);
  }
  T.box('skYellow', px, py, TOP + h - 0.05, px + w, py + d, TOP + h, { draw: false, kind: 'pole', name: 'climbing frame' });
}

/* The black pines, wind bent, all round the park and the cliff tops. */
const PINES = [
  [40, 160, 1.1], [64, 148, 1.2], [96, 150, 0.9], [36, 202, 1.0], [52, 214, 1.3], [44, 252, 1.1],
  [40, 270, 1.2], [56, 284, 1.0], [70, 296, 0.9], [118, 288, 1.1], [124, 262, 0.9], [76, 226, 1.2],
  [86, 246, 0.9], [118, 226, 1.0], [64, 206, 0.8], [104, 188, 0.9], [140, 292, 1.2], [166, 292, 1.0],
  [196, 292, 1.1], [222, 290, 1.0], [330, 294, 1.0], [352, 282, 1.1], [362, 262, 0.9], [340, 242, 0.8],
  [126, 236, 0.9], [72, 268, 1.0],
];
function pines(T, r) {
  for (const [px, py, s] of PINES) {
    T.asset({ type: 'tree', style: 'pine', dims: { size: s, variant: Math.round(px * 3 + py) } }, 1, px, py, TOP, 0);
  }
  void r;
}

/* The garden's own: the lamps, the hedges gone to mounds, the benches,
 * the long grass. */
function garden(T, r) {
  for (const [px, py] of [[90, 196], [70, 176], [50, 230], [110, 256], [96, 290]]) {
    T.post('skIron', px, py, TOP, TOP + 3.4, 0.06, { kind: 'pole', name: 'garden lamp' });
    T.ball('skLamp', px, py, TOP + 3.55, 0.22);
  }
  T.dress(() => {
    for (let q = 0; q < 160; q += 1) {
      const px = r.range(34, 122);
      const py = r.range(150, 295);
      if (Math.abs(px - FOUNTAIN.px) < 5 && Math.abs(py - FOUNTAIN.py) < 5) {
        continue;
      }
      if (GATES.some((g) => Math.abs(g.px - px) < 3 && Math.abs(g.py - py) < 3)) {
        continue;
      }
      T.bead(r.chance(0.7) ? 'skWeed' : 'skMoss', px, py, TOP + 0.05, r.range(0.25, 0.6));
    }
    for (const [px, py] of [[82, 198], [62, 198], [72, 186], [108, 248]]) {
      T.deco('skStone', px - 0.9, py - 0.25, TOP + 0.35, px + 0.9, py + 0.25, TOP + 0.45);
      T.deco('skStone', px - 0.8, py - 0.2, TOP, px - 0.6, py + 0.2, TOP + 0.35);
      T.deco('skStone', px + 0.6, py - 0.2, TOP, px + 0.8, py + 0.2, TOP + 0.35);
    }
  });
  /* The hedges along the cliff, mounds, solid as low boxes inside them. */
  for (let x = 40; x < 104; x += 4.5) {
    const y = x < 60 ? 152 : x < 90 ? 147 : 151;
    T.ball('skWeed', x, y, TOP + 0.3, 1.0);
    T.hidden(x - 0.6, y - 0.6, TOP, x + 0.6, y + 0.6, TOP + 0.8, 'wall', 'hedge');
  }
}
