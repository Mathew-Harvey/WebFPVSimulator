/*
 * hill.js: the hillside the circuit is dug into, and the hamlet on it.
 * Pure, as ./circuit.js is.
 *
 * THE TERRACES. North of the farm road the land climbs in tanada, rice
 * terraces, the way the hill country of Japan farms a slope too steep to
 * plough: a wall of fitted stone a metre and a half high, a level paddy ten
 * or eleven metres deep behind it with water standing in it, a bund of
 * turf along its lip, and the next wall. The national list of a hundred
 * terraced fields runs from gradients of 1 in 20 to 1 in 1; these are
 * about 1 in 7, eight steps up to the cedars on the crest. Each wall
 * follows the contour, so it wanders: it is written as runs six metres
 * long, each set forward or back of its neighbours by a fixed hash, which
 * is how a dry stone wall that was built a run at a time looks anyway.
 * Every run is a box, drawn and solid from the same numbers, so a quad
 * lands on a paddy's water exactly where it is drawn.
 *
 * EARLY SUMMER. The lower paddies are flooded with the seedlings in rows,
 * the upper ones grown thick and green, as a valley does when the low
 * fields were planted first.
 *
 * THE HAMLET on the west end of the hill: two farmhouses with slate tiled
 * roofs on a levelled yard, a white storehouse with a black base, a tin
 * roofed barn, a plastic greenhouse tunnel. THE SHRINE on the east end of
 * the crest: a flight of stone steps up through the terraces to a torii,
 * a small hall, stone lanterns and the cedars round it.
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

import { W, D, w, turn, origin, hash } from './frame.js';
import { partsOf } from '../../props/catalog.js';

/* The farm road along the foot of the hill, and the hill's first wall. */
export const ROAD = { y0: 229, y1: 235 };
export const HILL_Y0 = 240;
export const STEP_RISE = 1.6;
export const LEVELS = 7;
const RUN = 6;
/* The levelled yard the hamlet stands on, and the shrine's ground. */
export const YARD = { x0: 6, x1: 92, y1: 268, h: STEP_RISE };
export const SHRINE = { x0: 318, x1: 372, y0: 306, h: STEP_RISE * LEVELS };
/* The stone steps up to the shrine. */
export const STEPS = { x: 345, w: 3.2 };

/* The front of level k's wall in run i: wandering a metre and a half either
 * way. Level 0 is the first wall up from the road. */
export function wallY(k, i) {
  const base = HILL_Y0 + k * 10.6;
  const a = hash(i + 7 * k, 31) - 0.5;
  const b = hash(Math.floor(i / 3) + 11 * k, 37) - 0.5;
  return base + a * 1.2 + b * 2.4;
}

/* The ground's height at a plan point on the hill, metres: for the trees
 * and the people the drawing stands on it. */
export function hillAt(px, py) {
  const i = Math.max(0, Math.min(Math.floor(px / RUN), Math.floor(W / RUN) - 1));
  let h = 0;
  for (let k = 0; k < LEVELS; k += 1) {
    if (py >= wallY(k, i)) {
      h = (k + 1) * STEP_RISE;
    }
  }
  if (px >= YARD.x0 && px < YARD.x1 && py >= HILL_Y0 && py < YARD.y1) {
    h = YARD.h;
  }
  return h;
}

/*
 * The terraces' solids and their drawing. Level k's box in run i runs from
 * its wall to the next level's wall (or the plot's back) and stands to
 * (k + 1) rises, so the boxes stack into the hill with nothing under any
 * of them that is not solid.
 */
function terraces(T) {
  const runs = Math.floor(W / RUN);
  for (let i = 0; i < runs; i += 1) {
    const x0 = i * RUN;
    const x1 = x0 + RUN;
    const inYard = x1 <= YARD.x1 && x0 >= YARD.x0;
    for (let k = 0; k < LEVELS; k += 1) {
      let y0 = wallY(k, i);
      const y1 = k + 1 < LEVELS ? wallY(k + 1, i) : D;
      const h = (k + 1) * STEP_RISE;
      if (inYard && k === 0) {
        y0 = HILL_Y0;
      }
      if (inYard && y1 <= YARD.y1) {
        continue;
      }
      if (inYard && y0 < YARD.y1) {
        T.box('rxStone', x0, YARD.y1, 0, x1, y1, h, { name: 'terrace' });
        continue;
      }
      T.box('rxStone', x0, y0, 0, x1, y1, h, { name: 'terrace' });
    }
    if (inYard) {
      T.box('rxEarth', x0, HILL_Y0, 0, x1, YARD.y1, YARD.h, { name: 'yard' });
    }
  }
  /* The paddies drawn over the tops: water, the bund on the lip, the
   * dividing bunds across, the rows of seedlings. */
  for (let i = 0; i < runs; i += 1) {
    const x0 = i * RUN;
    const x1 = x0 + RUN;
    const inYard = x1 <= YARD.x1 && x0 >= YARD.x0;
    for (let k = 0; k < LEVELS; k += 1) {
      const y0 = Math.max(wallY(k, i), inYard ? YARD.y1 : 0);
      const y1 = k + 1 < LEVELS ? wallY(k + 1, i) : D;
      const h = (k + 1) * STEP_RISE;
      if (y1 - y0 < 1.2) {
        continue;
      }
      const grown = k >= 3;
      const crest = k === LEVELS - 1;
      T.draw((x0 + x1) / 2, (y0 + y1) / 2, (K, c) => {
        origin(K, c);
        const a = w(x0, y0, h);
        const b = w(x1, y1, h);
        if (crest) {
          K.box('rxGrassBank', a[0], h, b[2], b[0], h + 0.02, a[2]);
          return;
        }
        /* The lip's bund, then the water or the grown rice behind it. */
        K.box('rxBund', a[0], h, a[2] - 0.6, b[0], h + 0.2, a[2]);
        K.box(grown ? 'rxRice' : ((i + k) % 3 ? 'rxPaddy' : 'rxPaddyDeep'), a[0], h, b[2], b[0], h + (grown ? 0.35 : 0.06), a[2] - 0.6);
        /* A dividing bund every third run, where one paddy meets the next. */
        if (i % 3 === 0) {
          K.box('rxBund', a[0] - 0.25, h, b[2], a[0] + 0.25, h + 0.18, a[2] - 0.6);
        }
      });
      /* The rows: on the flooded paddies short green strokes along the
       * contour, and on the grown rice darker furrows. Fine and near. */
      if (crest) {
        continue;
      }
      T.dress(() => {
        T.draw((x0 + x1) / 2, (y0 + y1) / 2, (K, c) => {
          origin(K, c);
          for (let y = y0 + 1.2; y < y1 - 0.4; y += 0.7) {
            const a = w(x0 + 0.35, y, h);
            const b = w(x1 - 0.35, y, h);
            /* One stroke a row: a row of seedlings is a green line from
             * the air, and a box a plant would be two thousand triangles
             * a paddy. */
            if (grown) {
              K.box('rxRiceDeep', a[0], h + 0.3, a[2] - 0.08, b[0], h + 0.37, a[2] + 0.08);
            } else {
              K.box('rxSeedling', a[0], h + 0.04, a[2] - 0.06, b[0], h + 0.2, a[2] + 0.06);
            }
          }
        });
      });
    }
  }
}

/* The farm road at the foot of the hill: tarmac with white edge lines, a
 * gutter on the hill side, and a guard rail along the stand's back. */
function farmRoad(T) {
  T.paint('rxTarmac', 0, ROAD.y0, 0, W, ROAD.y1, 0.03);
  T.paint('rxPaint', 0, ROAD.y0 + 0.25, 0.03, W, ROAD.y0 + 0.4, 0.04);
  T.paint('rxPaint', 0, ROAD.y1 - 0.4, 0.03, W, ROAD.y1 - 0.25, 0.04);
  T.paint('concrete', 0, ROAD.y1, 0, W, ROAD.y1 + 0.8, 0.05);
  /* The concrete gutter at the wall's foot, with water in it. */
  T.paint('rxPaddyDeep', 0, ROAD.y1 + 0.25, 0.05, W, ROAD.y1 + 0.55, 0.06);
  T.draw(W / 2, ROAD.y0, (K, c) => {
    origin(K, c);
    for (let x = 4; x < W - 4; x += 4) {
      if (x > 146 && x < 254) {
        continue;
      }
      const p = w(x, ROAD.y0 - 0.4, 0);
      K.cyl('rxSteel', p, [p[0], 0.75, p[2]], 0.05, 6);
    }
    for (const [xa, xb] of [[4, 144], [256, W - 4]]) {
      const a = w(xa, ROAD.y0 - 0.45, 0.6);
      const b = w(xb, ROAD.y0 - 0.35, 0.78);
      K.box('rxKerbWhite', a[0], 0.55, Math.min(a[2], b[2]), b[0], 0.78, Math.max(a[2], b[2]));
    }
  });
}

/* A farmhouse: plaster walls with dark timber posts, a deep veranda on the
 * front with paper doors behind it, and a slate tiled gable roof with its
 * eaves well out. (px, py) the middle of its footprint, h the ground; the
 * front faces south. */
function farmhouse(T, px, py, h, wd, dp, hgt) {
  const x0 = px - wd / 2;
  const x1 = px + wd / 2;
  const y0 = py - dp / 2;
  const y1 = py + dp / 2;
  T.box('rxPlaster', x0, y0, h, x1, y1, h + hgt, { name: 'farmhouse' });
  T.box('rxBlackBase', x0 - 0.05, y0 - 0.05, h, x1 + 0.05, y1 + 0.05, h + 0.45, { solid: false });
  /* The roof's solid, a box under its slopes to the eaves' height. */
  const ridge = h + hgt + dp * 0.36;
  T.hidden(x0 - 0.9, y0 - 0.9, h + hgt, x1 + 0.9, y1 + 0.9, h + hgt + 0.3, 'wall', 'farmhouse roof');
  T.hidden(x0, y0 + dp * 0.25, h + hgt + 0.3, x1, y1 - dp * 0.25, ridge - 0.4, 'wall', 'farmhouse roof');
  T.draw(px, py, (K, c) => {
    /* The gable, extruded along the house's length (local z is south, so
     * the extrusion runs from the east end back to the west). */
    turn(K, c, x0 - 1.0, py, h, Math.PI / 2);
    const e = dp / 2 + 1.1;
    K.extrude('rxKawara', [[-e, hgt - 0.15], [e, hgt - 0.15], [0, hgt + dp * 0.36 + 0.1]], 0, wd + 2.0);
    K.extrude('rxKawaraEdge', [[-0.35, hgt + dp * 0.36 - 0.05], [0.35, hgt + dp * 0.36 - 0.05], [0.25, hgt + dp * 0.36 + 0.35], [-0.25, hgt + dp * 0.36 + 0.35]], -0.2, wd + 2.2);
    /* Timber posts at the corners and along the front, a beam under the
     * eaves, the veranda deck and its paper doors. */
    origin(K, c);
    for (let x = x0; x <= x1 + 0.01; x += wd / 4) {
      const p = w(x, y0 - 0.02, h);
      K.box('rxTimber', p[0] - 0.1, h, p[2] - 0.1, p[0] + 0.1, h + hgt, p[2] + 0.12);
    }
    const bA = w(x0, y0 - 0.06, h + hgt - 0.35);
    const bB = w(x1, y0 + 0.04, h + hgt);
    K.box('rxTimber', bA[0], bA[1], bB[2], bB[0], bB[1], bA[2]);
    const dA = w(x0 + 0.3, y0 - 1.3, h + 0.4);
    const dB = w(x1 - 0.3, y0, h + 0.5);
    K.box('rxTimberPale', dA[0], dA[1], dB[2], dB[0], dB[1], dA[2]);
    for (let x = x0 + 0.6; x < x1 - 1.2; x += 1.8) {
      const p = w(x, y0 - 0.03, h + 0.5);
      K.box('rxShoji', p[0], h + 0.5, p[2], p[0] + 1.6, h + 2.3, p[2] + 0.02);
      for (let j = 1; j < 4; j += 1) {
        K.box('rxTimber', p[0], h + 0.5 + j * 0.45, p[2] - 0.01, p[0] + 1.6, h + 0.53 + j * 0.45, p[2] + 0.03);
      }
    }
    /* Windows down the side walls. */
    for (const x of [x0 - 0.02, x1 + 0.02]) {
      for (let y = y0 + 1.5; y < y1 - 1; y += 2.5) {
        const p = w(x, y, h + 1.2);
        K.box('glassDark', p[0] - 0.02, h + 1.2, p[2] - 0.9, p[0] + 0.02, h + 2.1, p[2]);
      }
    }
  });
}

/* The storehouse: thick white walls on a black stone base, one small
 * window high up, a heavy tiled roof. */
function kura(T, px, py, h) {
  const x0 = px - 2.6;
  const x1 = px + 2.6;
  const y0 = py - 3.2;
  const y1 = py + 3.2;
  T.box('rxPlaster', x0, y0, h, x1, y1, h + 5.4, { name: 'storehouse' });
  T.hidden(x0 - 0.5, y0 - 0.5, h + 5.4, x1 + 0.5, y1 + 0.5, h + 6.6, 'wall', 'storehouse roof');
  T.draw(px, py, (K, c) => {
    origin(K, c);
    const a = w(x0 - 0.04, y0 - 0.04, h);
    const b = w(x1 + 0.04, y1 + 0.04, h + 1.4);
    K.box('rxBlackBase', a[0], h, b[2], b[0], h + 1.4, a[2]);
    for (let r = 0; r < 4; r += 1) {
      for (let q = 0; q < 6; q += 1) {
        const p = w(x0 - 0.05, y0 + 0.2 + q * 1.0, h + 0.15 + r * 0.32);
        K.box('rxStone', p[0] - 0.01, p[1], p[2] - 0.9, p[0] + 0.01, p[1] + 0.02, p[2]);
      }
    }
    const win = w(px - 0.5, y0 - 0.06, h + 3.9);
    K.box('rxBlackBase', win[0], win[1], win[2] - 0.02, win[0] + 1.0, win[1] + 0.8, win[2] + 0.06);
    turn(K, c, px, py, h + 5.4, -Math.PI / 2);
    K.extrude('rxKawara', [[-3.4, 0], [3.4, 0], [0, 1.6]], -3.5, 3.5);
    K.extrude('rxKawaraEdge', [[-0.3, 1.5], [0.3, 1.5], [0.2, 1.85], [-0.2, 1.85]], -3.6, 3.6);
  });
}

/* A barn of corrugated tin on a timber frame, open on its front, with a
 * kei truck's worth of straw and crates inside. */
function barn(T, px, py, h) {
  const x0 = px - 4;
  const x1 = px + 4;
  const y0 = py - 3;
  const y1 = py + 3;
  T.box('rxTin', x0, y1 - 0.15, h, x1, y1, h + 3.4, { name: 'barn' });
  T.box('rxTin', x0, y0, h, x0 + 0.15, y1, h + 3.4, { name: 'barn' });
  T.box('rxTin', x1 - 0.15, y0, h, x1, y1, h + 3.4, { name: 'barn' });
  T.post('rxTimber', px, y0 + 0.2, h, h + 3.4, 0.12, { name: 'barn post' });
  T.box('rxTinBlue', x0 - 0.4, y0 - 0.8, h + 3.4, x1 + 0.4, y1 + 0.3, h + 3.6, { name: 'barn roof' });
  T.dress(() => {
    for (let k = 0; k < 6; k += 1) {
      const bx = x0 + 0.8 + (k % 3) * 1.3;
      const by = y1 - 1.2 - Math.floor(k / 3) * 1.0;
      T.box('rxStraw', bx, by, h, bx + 1.1, by + 0.8, h + 0.55 + (k % 2) * 0.4);
    }
    T.box('rxCanvasYellow', x1 - 2.4, y1 - 1.5, h, x1 - 1.4, y1 - 0.6, h + 0.5);
    T.box('rxCanvasBlue', x1 - 1.3, y1 - 1.5, h, x1 - 0.4, y1 - 0.6, h + 0.5);
  });
}

/* The greenhouse: a hoop tunnel of plastic sheet, rows inside. */
function tunnel(T, px, py, h, len) {
  T.hidden(px - 2.4, py, h, px + 2.4, py + len, h + 2.2, 'obstacle', 'greenhouse');
  T.draw(px, py + len / 2, (K, c) => {
    turn(K, c, px, py, h, 0);
    const arch = [];
    for (let i = 0; i <= 8; i += 1) {
      const t = (i / 8) * Math.PI;
      arch.push([-2.4 * Math.cos(t), 2.5 * Math.sin(t)]);
    }
    K.extrude('rxRoof', arch, -len, 0);
    for (let y = 0; y <= len; y += 2.4) {
      for (let i = 0; i < 8; i += 1) {
        const ta = (i / 8) * Math.PI;
        const tb = ((i + 1) / 8) * Math.PI;
        K.cyl('rxSteel', [-2.42 * Math.cos(ta), 2.52 * Math.sin(ta), -y], [-2.42 * Math.cos(tb), 2.52 * Math.sin(tb), -y], 0.03, 4);
      }
    }
  });
}

/* The shrine on the crest: a torii at the head of the steps, a gravel
 * court, a small hall with a sweeping roof, two stone lanterns. */
export const TORII = { x: STEPS.x, y: SHRINE.y0 + 1.5, h: SHRINE.h, span: 3.6, top: 4.6 };
function shrine(T) {
  const S = SHRINE;
  const h = S.h;
  const { x, y, span, top } = TORII;
  /* The torii: two pillars, the two beams across, the upper one curved
   * up at its ends. Solid: the pillars and the beams. */
  for (const dx of [-span / 2, span / 2]) {
    T.post('rxVermilion', x + dx, y, h, h + top, 0.2, { kind: 'pole', name: 'torii pillar' });
  }
  T.box('rxVermilion', x - span / 2 - 0.5, y - 0.15, h + top - 1.05, x + span / 2 + 0.5, y + 0.15, h + top - 0.8, { name: 'torii beam' });
  T.box('rxBlackBase', x - span / 2 - 1.0, y - 0.25, h + top, x + span / 2 + 1.0, y + 0.25, h + top + 0.35, { name: 'torii lintel' });
  T.draw(x, y, (K, c) => {
    origin(K, c);
    const p = w(x, y, h + top - 0.25);
    K.box('rxVermilion', p[0] - span / 2 - 0.9, p[1], p[2] - 0.2, p[0] + span / 2 + 0.9, p[1] + 0.26, p[2] + 0.2);
    for (const s of [-1, 1]) {
      K.box('rxBlackBase', p[0] + s * (span / 2 + 0.95) - 0.2, p[1] + 0.35, p[2] - 0.26, p[0] + s * (span / 2 + 0.95) + 0.25, p[1] + 0.62, p[2] + 0.26);
    }
    /* The plaque between the beams, and the rope. */
    K.box('rxBlackBase', p[0] - 0.3, p[1] - 0.8, p[2] - 0.17, p[0] + 0.3, p[1], p[2] + 0.17);
  });
  /* The hall: on a stone plinth, timber walls, a roof sweeping out. */
  const hx = x;
  const hy = y + 11.5;
  T.box('rxStone', hx - 3.4, hy - 3, h, hx + 3.4, hy + 3, h + 0.7, { name: 'shrine plinth' });
  T.box('rxTimberPale', hx - 2.6, hy - 2.2, h + 0.7, hx + 2.6, hy + 2.2, h + 3.4, { name: 'shrine hall' });
  T.hidden(hx - 3.6, hy - 3.4, h + 3.4, hx + 3.6, hy + 3.4, h + 4.4, 'wall', 'shrine roof');
  T.draw(hx, hy, (K, c) => {
    turn(K, c, hx - 3.8, hy, h + 3.3, Math.PI / 2);
    K.extrude('rxKawara', [[-3.6, -0.1], [-3.2, 0.05], [0, 2.2], [3.2, 0.05], [3.6, -0.1], [0, 1.9]], 0, 7.6);
    origin(K, c);
    const f = w(hx, hy - 2.22, h + 0.7);
    K.box('rxVermilion', f[0] - 2.6, h + 0.7, f[2], f[0] + 2.6, h + 0.95, f[2] + 0.04);
    K.box('rxShoji', f[0] - 1.6, h + 0.95, f[2], f[0] + 1.6, h + 2.8, f[2] + 0.02);
    /* The rope across the front with its paper streamers. */
    K.cyl('rxRope', w(hx - 2.4, hy - 2.45, h + 3.0), w(hx + 2.4, hy - 2.45, h + 3.0), 0.09, 6);
    for (let k = -2; k <= 2; k += 1) {
      const q = w(hx + k * 0.9, hy - 2.5, h + 2.95);
      K.box('rxPaint', q[0] - 0.08, q[1] - 0.45, q[2] - 0.01, q[0] + 0.08, q[1], q[2] + 0.01);
    }
  });
  /* The stone lanterns either side of the path. */
  for (const dx of [-3.2, 3.2]) {
    const lx = x + dx;
    const ly = y + 7;
    T.post('rxStone', lx, ly, h, h + 1.9, 0.22, { kind: 'pole', name: 'stone lantern' });
    T.draw(lx, ly, (K, c) => {
      origin(K, c);
      const p = w(lx, ly, h);
      K.box('rxStone', p[0] - 0.4, h, p[2] - 0.4, p[0] + 0.4, h + 0.25, p[2] + 0.4);
      K.box('rxStone', p[0] - 0.34, h + 1.1, p[2] - 0.34, p[0] + 0.34, h + 1.55, p[2] + 0.34);
      K.box('lampGlow', p[0] - 0.2, h + 1.2, p[2] - 0.35, p[0] + 0.2, h + 1.45, p[2] + 0.35);
      K.cone('rxStoneDark', [p[0], h + 1.55, p[2]], 0.6, 0.45, 4);
      K.ball('rxStone', [p[0], h + 2.05, p[2]], 0.12);
    });
  }
  /* The gravel court. */
  T.paint('rxGravel', S.x0 + 8, S.y0, h + 0.02, S.x1 - 8, D - 2, h + 0.05);
}

/* The stone steps from the farm road up to the torii: a flight at each
 * wall, a landing on each terrace. */
function steps(T) {
  const { x, w: sw } = STEPS;
  const i = Math.floor(x / RUN);
  for (let k = 0; k < LEVELS; k += 1) {
    const y = wallY(k, i);
    const h0 = k * STEP_RISE;
    for (let j = 0; j < 8; j += 1) {
      const sy = y - 2.4 + j * 0.3;
      T.box('rxStoneDark', x - sw / 2, sy, h0, x + sw / 2, sy + 0.3, h0 + (j + 1) * (STEP_RISE / 8), { name: 'steps' });
    }
  }
}

/* A scarecrow on a bund: a cross of bamboo, a straw hat, an old coat. */
function scarecrow(T, px, py, h, k) {
  T.dress(() => {
    T.draw(px, py, (K, c) => {
      origin(K, c);
      const p = w(px, py, h);
      K.cyl('rxTimberPale', p, [p[0], h + 1.7, p[2]], 0.04, 4);
      K.cyl('rxTimberPale', [p[0] - 0.7, h + 1.25, p[2]], [p[0] + 0.7, h + 1.25, p[2]], 0.035, 4);
      K.box(k % 2 ? 'rxCanvasBlue' : 'rxIndigo', p[0] - 0.32, h + 0.7, p[2] - 0.14, p[0] + 0.32, h + 1.35, p[2] + 0.14);
      K.blob('rxStraw', [p[0], h + 1.55, p[2]], 0.17, 0.2, [0, k, 0]);
      K.cone('rxStraw', [p[0], h + 1.68, p[2]], 0.42, 0.24, 8);
    });
  });
}

/* A jizo by the road: a little stone figure in a red bib and cap. */
function jizo(T, px, py) {
  T.dress(() => {
    T.draw(px, py, (K, c) => {
      origin(K, c);
      for (let k = 0; k < 3; k += 1) {
        const p = w(px + k * 0.6, py, 0);
        K.box('rxStone', p[0] - 0.25, 0, p[2] - 0.2, p[0] + 0.25, 0.25, p[2] + 0.2);
        K.cyl('rxStone', [p[0], 0.25, p[2]], [p[0], 0.75, p[2]], 0.17, 8, 0.14);
        K.ball('rxStone', [p[0], 0.88, p[2]], 0.14);
        K.cone('rxBib', [p[0], 0.5, p[2]], 0.22, 0.25, 8);
        K.cyl('rxBib', [p[0], 0.96, p[2]], [p[0], 1.04, p[2]], 0.13, 8);
      }
      const r = w(px + 0.6, py - 0.1, 1.15);
      K.box('rxTimber', r[0] - 1.0, 1.15, r[2] - 0.4, r[0] + 1.0, 1.22, r[2] + 0.4);
    });
  });
}

/* ------------------------------------------------------------------ */
/* Trees on the hill, and the hamlet's car                            */
/* ------------------------------------------------------------------ */

/* The trees the hill grows: a band of cedars along the crest behind the
 * paddies and round the shrine, cherries flanking the shrine's steps, and
 * a few by the hamlet. Each stands on the level it grows from. */
function hillTrees() {
  const out = [];
  let k = 0;
  const add = (x, y, style, size) => {
    out.push({ x, y, h: hillAt(x, y), style, size, variant: 1 + (k % 9) });
    k += 1;
  };
  /* Two loose rows, with gaps where the wind took one, so the crest is a
   * wood's edge and not a hedge. */
  for (let x = 3; x < W - 3; x += 5.5) {
    const n = Math.round(x * 10);
    if (hash(n, 40) < 0.22) {
      continue;
    }
    const jx = x + (hash(n, 41) - 0.5) * 3.5;
    if (jx > SHRINE.x0 - 2 && jx < SHRINE.x1 + 2) {
      continue;
    }
    add(jx, 315 + hash(n, 42) * 13, hash(n, 45) < 0.12 ? 'sakura' : 'pine', 0.9 + hash(n, 43) * 0.75);
  }
  /* The shrine's grove, behind and either side of the hall. */
  for (const [x, y] of [[SHRINE.x0 + 2, 314], [SHRINE.x0 + 4, 326], [SHRINE.x1 - 3, 316], [SHRINE.x1 - 2, 327], [334, 328], [358, 328]]) {
    add(x, y, 'pine', 1.4 + hash(k, 44) * 0.3);
  }
  /* Cherries beside the steps, every other level. */
  for (let lv = 1; lv < LEVELS - 1; lv += 2) {
    const i = Math.floor(STEPS.x / 6);
    const y = wallY(lv, i) + 3;
    add(STEPS.x - STEPS.w / 2 - 3.2, y, 'sakura', 0.85);
    add(STEPS.x + STEPS.w / 2 + 3.2, y, 'sakura', 0.85);
  }
  /* By the hamlet. */
  add(YARD.x0 + 3, 263, 'sakura', 1.0);
  add(YARD.x1 - 4, 244, 'pine', 0.95);
  return out;
}

/* The parts of an element stood at (x, h, z) unturned, made solid and
 * never drawn: the kit draws the element itself. */
function solidsAt(el, x, h, z) {
  const out = [];
  for (const p of partsOf(el)) {
    if (!p.solid) {
      continue;
    }
    const q = { ...p, draw: false };
    if (p.t === 'box') {
      q.lo = [p.lo[0] + x, p.lo[1] + h, p.lo[2] + z];
      q.hi = [p.hi[0] + x, p.hi[1] + h, p.hi[2] + z];
    } else {
      q.a = [p.a[0] + x, p.a[1] + h, p.a[2] + z];
      q.b = [p.b[0] + x, p.b[1] + h, p.b[2] + z];
    }
    out.push(q);
  }
  return out;
}

/* The trees and the car as the kit stands them: world x, the height of
 * what they stand on, world z, and the element. */
export function hillStanding() {
  const out = [];
  for (const t of hillTrees()) {
    const [x, , z] = w(t.x, t.y);
    out.push({
      x, h: t.h, z, el: { id: 'rx-tree', type: 'tree', style: t.style, dims: { size: t.size, variant: t.variant }, yaw: 0 },
    });
  }
  const [x, , z] = w(48, 263.5);
  out.push({
    x, h: YARD.h, z, el: { id: 'rx-kei', type: 'car', style: 'keivan', dims: { variant: 4 }, yaw: 0 },
  });
  return out;
}

/* Their solids, in the world frame, for the structure's parts. */
export function standingSolids(list) {
  const out = [];
  for (const s of list) {
    out.push(...solidsAt(s.el, s.x, s.h, s.z));
  }
  return out;
}

export function hillParts(T) {
  terraces(T);
  farmRoad(T);
  farmhouse(T, 26, 254, YARD.h, 13, 8.5, 3.6);
  farmhouse(T, 58, 258, YARD.h, 10, 7.5, 3.2);
  kura(T, 82, 258, YARD.h);
  barn(T, 40, 248.5 + 0, YARD.h);
  tunnel(T, 70, 241.5, YARD.h, 10);
  shrine(T);
  steps(T);
  jizo(T, 300, ROAD.y1 + 1.2);
  for (const [px, k] of [[150, 1], [210, 2], [262, 0], [384, 3], [118, 2]]) {
    const i = Math.floor(px / RUN);
    scarecrow(T, px, wallY(k, i) + 0.3, (k + 1) * STEP_RISE + 0.2, px);
  }
}
