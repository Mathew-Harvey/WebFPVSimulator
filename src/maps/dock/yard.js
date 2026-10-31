/*
 * yard.js: Kamome Wharf's container yard. The three blocks of stacks with
 * their canyons, the rail gantries over them, the reefer rack, the empties
 * stacked seven high, the yard's floodlight masts, its tractors, and the
 * paint on its paving.
 *
 * A STACK IS DRAWN BOX BY BOX AND IS SOLID AS A WHOLE. Every container is
 * its own box in its own colour, which is what a yard looks like, but the
 * solid under a row of stacks of one height is one box: the third of a
 * metre between two rows, or between two bays, is narrower than any quad,
 * so it is never a line, and as separate solids it would be a slot the gap
 * rule forbids (../../props/parts.js GAP_MIN). So the solids are the grid
 * of heights merged into rectangles, and the drawing is the grid itself.
 *
 * WHAT A PILOT SEES CLOSE TO is set dressing and costs nothing far off: the
 * corrugations of a wall that faces an aisle (../frame.js flute), the doors
 * and locking bars of an end that faces one, the castings on a top box's
 * corners. A face that faces another box a third of a metre away is never
 * seen and is never dressed. Low draws the boxes and the paint and none of
 * the dressing, and the solids are the same on every preset.
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
import {
  BOX, BAY, ROW, ROWS, BLOCKS, BLOCK_BAYS, BANDS, DOUBLES, GANTRY, GANTRIES, REEFER, EMPTIES, MASTS, CANYON,
} from './site.js';

const BH = BOX.h;

/* The yard's colours, the town's seven and the port's four, weighted the
 * way a yard is: a lot of red, blue and grey, a little of the rest. */
export const BOX_COLOURS = [
  'containerRed', 'containerRed', 'containerBlue', 'containerBlue', 'containerGrey', 'containerGrey',
  'containerGreen', 'containerOrange', 'containerTeal', 'containerWhite',
  'dkBoxMaroon', 'dkBoxMaroon', 'dkBoxSky', 'dkBoxCream', 'dkBoxMustard',
];
const EMPTY_COLOURS = ['containerGrey', 'dkBoxCream', 'dkBoxMaroon', 'dkBoxSky', 'containerWhite', 'containerGrey', 'containerRed'];

/* The line names painted on a box's side, the atlas's keys (./signs.js). */
const LINES = ['line0', 'line1', 'line2', 'line3', 'line4', 'line5'];

/*
 * A FIELD OF STACKS lying along x: `slots` west to east, each { x0, x1 } the
 * box's own ends; `rows` south to north, each { y0, y1 }; `h[r][s]` the
 * stack's height in boxes. Draws every box and its dressing, and adds the
 * merged solids. `base` the height the lowest box stands on (a ship's
 * hatch lids), 0 on the paving. `colours` the list a box's colour is drawn from, `seed`
 * its stream, `logos` the share of an aisle side that carries a line's
 * name, `doors` which end the doors are at: 'w', 'e' or 'any'.
 */
export function stackField(T, f) {
  const R = rng(f.seed);
  const base = f.base ?? 0;
  const nR = f.rows.length;
  const nS = f.slots.length;
  const H = (r, s) => (r < 0 || r >= nR || s < 0 || s >= nS ? 0 : f.h[r][s]);
  for (let r = 0; r < nR; r += 1) {
    const { y0, y1 } = f.rows[r];
    for (let s = 0; s < nS; s += 1) {
      const { x0, x1 } = f.slots[s];
      const l = x1 - x0;
      const n = H(r, s);
      for (let t = 0; t < n; t += 1) {
        const m = R.pick(f.colours);
        const h0 = base + t * BH;
        const h1 = h0 + BH;
        T.box(m, x0, y0, h0, x1, y1, h1, { solid: false, name: 'container' });
        const doorEnd = f.doors === 'any' ? (R.chance(0.5) ? 'w' : 'e') : f.doors;
        const logo = R.chance(f.logos ?? 0.3) ? R.pick(LINES) : null;
        T.dress(() => {
          const rib = `${m}Rib`;
          /* The long walls, where they face the air. */
          const ribs = Math.max(3, Math.round(l / 0.85));
          if (H(r - 1, s) <= t) {
            T.flute(m, x0 + 0.2, y0, x1 - 0.2, y0, h0 + 0.18, h1 - 0.14, 's', ribs);
            if (logo) {
              T.sign(logo, (x0 + x1) / 2, y0, h0 + BH / 2 + 0.1, Math.min(l - 1.4, 5.6), 1.1, 's', 0.09);
            }
          }
          if (H(r + 1, s) <= t) {
            T.flute(m, x0 + 0.2, y1, x1 - 0.2, y1, h0 + 0.18, h1 - 0.14, 'n', ribs);
            if (logo) {
              T.sign(logo, (x0 + x1) / 2, y1, h0 + BH / 2 + 0.1, Math.min(l - 1.4, 5.6), 1.1, 'n', 0.09);
            }
          }
          /* The ends, where they face the air: the doors and their four
           * locking bars at one, a fluted front wall at the other. */
          for (const [end, x, nb] of [['w', x0, s - 1], ['e', x1, s + 1]]) {
            if (H(r, nb) > t) {
              continue;
            }
            const out = end === 'w' ? -1 : 1;
            if (end === doorEnd) {
              const xa = x + out * 0.0;
              const xb = x + out * 0.05;
              T.deco(rib, Math.min(xa, xb), y0 + 0.12, h0 + 0.2, Math.max(xa, xb), y1 - 0.12, h1 - 0.16);
              const xc = x + out * 0.09;
              for (const k of [0.22, 0.42, 0.58, 0.78]) {
                const y = y0 + (y1 - y0) * k;
                T.deco('cornerCasting', Math.min(xb, xc), y - 0.025, h0 + 0.3, Math.max(xb, xc), y + 0.025, h1 - 0.3);
              }
              T.deco('cornerCasting', Math.min(xb, xc), (y0 + y1) / 2 - 0.012, h0 + 0.2, Math.max(xb, xc), (y0 + y1) / 2 + 0.012, h1 - 0.16);
            } else {
              T.flute(m, x, y0 + 0.2, x, y1 - 0.2, h0 + 0.18, h1 - 0.14, end, 3);
            }
          }
          /* A top box's corner castings. */
          if (t === n - 1) {
            for (const [cx, sx] of [[x0, 1], [x1, -1]]) {
              for (const [cy, sy] of [[y0, 1], [y1, -1]]) {
                T.deco('cornerCasting', Math.min(cx, cx + sx * 0.18), Math.min(cy, cy + sy * 0.16), h1 - 0.13, Math.max(cx, cx + sx * 0.18), Math.max(cy, cy + sy * 0.16), h1 + 0.015);
              }
            }
          }
        });
      }
    }
  }
  mergedSolids(T, f, H, nR, nS);
}

/*
 * The solids, tier by tier: in each row, each run of slots standing at
 * least that tier high is one box from the end of the first to the end of
 * the last, so the half metre between two boxes side by side is solid as
 * far up as both stand. A slit that narrow is a slot a quad fits and no
 * pilot could fly (scripts/dock-check.js, the slot rule), and it is dark
 * between two walls from every side. A run the same in the rows beside is
 * the same box.
 */
function mergedSolids(T, f, H, nR, nS) {
  const open = new Map();
  const base = f.base ?? 0;
  const flush = (keep) => {
    for (const [key, o] of open) {
      if (!keep.has(key)) {
        T.box('concrete', f.slots[o.s0].x0, f.rows[o.r0].y0, base + (o.t - 1) * BH, f.slots[o.s1].x1, f.rows[o.r1].y1, base + o.top * BH, { draw: false, name: 'stack' });
        open.delete(key);
      }
    }
  };
  for (let r = 0; r < nR; r += 1) {
    const here = new Set();
    /* Each run's tiers from the bottom up, merged while the run stays the
     * same width, so a run of three the same height is one box. */
    const runs = [];
    let top = 0;
    for (let s = 0; s < nS; s += 1) {
      top = Math.max(top, H(r, s));
    }
    for (let t = 1; t <= top; t += 1) {
      let s = 0;
      while (s < nS) {
        if (H(r, s) < t) {
          s += 1;
          continue;
        }
        let e = s;
        while (e + 1 < nS && H(r, e + 1) >= t) {
          e += 1;
        }
        const same = runs.find((q) => q.s0 === s && q.s1 === e && q.top === t - 1);
        if (same) {
          same.top = t;
        } else {
          runs.push({ s0: s, s1: e, t, top: t });
        }
        s = e + 1;
      }
    }
    for (const q of runs) {
      const key = `${q.s0}:${q.s1}:${q.t}:${q.top}`;
      here.add(key);
      const o = open.get(key);
      if (o && o.r1 === r - 1) {
        o.r1 = r;
      } else {
        open.set(key, { ...q, r0: r, r1: r });
      }
    }
    flush(here);
  }
  flush(new Set());
}

/* A band's slots along a block: pairs of bays are one 40 ft box or two
 * 20 ft ones, and the odd bay at the end a 20 ft. */
function blockSlots(x0, R) {
  const slots = [];
  let b = 0;
  while (b < BLOCK_BAYS) {
    if (b + 1 < BLOCK_BAYS && R.chance(0.7)) {
      const cx = x0 + (b + 1) * BAY;
      slots.push({ x0: cx - BOX.l40 / 2, x1: cx + BOX.l40 / 2 });
      b += 2;
    } else {
      const cx = x0 + (b + 0.5) * BAY;
      slots.push({ x0: cx - BOX.l20 / 2, x1: cx + BOX.l20 / 2 });
      b += 1;
    }
  }
  return slots;
}

/* The heights of a band's stacks: a height for each slot, rows a box lower
 * here and there, now and then a slot left empty to drop into. Rows that
 * wall a canyon are never under `wall`. */
function bandHeights(R, slots, band, canyonRow, wall) {
  const slotH = slots.map(() => (R.chance(0.06) ? 0 : R.pick([2, 3, 3, 4, 4, 4, 5, 5, 1])));
  const h = [];
  for (let r = 0; r < ROWS; r += 1) {
    h.push(slots.map((_, s) => {
      if (r === canyonRow) {
        return Math.max(wall, slotH[s] === 0 ? wall : slotH[s]);
      }
      if (slotH[s] === 0) {
        return 0;
      }
      let v = slotH[s];
      if (R.chance(0.22)) {
        v -= 1;
      }
      if (R.chance(0.06)) {
        v -= 2;
      }
      return Math.max(0, Math.min(5, v));
    }));
  }
  return h;
}

function blocks(T) {
  BLOCKS.forEach((blk, bi) => {
    BANDS.forEach((band, ki) => {
      const R = rng(1000 + bi * 37 + ki * 7);
      const slots = blockSlots(blk.x0, R);
      const rows = [];
      for (let r = 0; r < ROWS; r += 1) {
        const y0 = band.y0 + r * ROW;
        rows.push({ y0, y1: y0 + BOX.w });
      }
      /* The row beside the canyon: the north row of a south band, the
       * south row of a north band. The middle double block's canyon is the
       * named one and stands four high at least, the others three. */
      const canyonRow = band.side === 's' ? ROWS - 1 : 0;
      const wall = band.db === 1 ? 4 : 3;
      const h = bandHeights(R, slots, band, canyonRow, wall);
      stackField(T, { slots, rows, h, seed: 5000 + bi * 101 + ki * 13, colours: BOX_COLOURS, logos: 0.3, doors: 'any' });
    });
  });
}

/* ---- the gantries ---- */

function gantry(T, g, k) {
  const db = DOUBLES[g.db];
  const G = GANTRY;
  const ys = db.y0 - G.legOut;
  const yn = db.y1 + G.legOut;
  const top = G.top;
  const g0 = top - G.girder;
  const half = 8.0;
  for (const y of [ys, yn]) {
    /* The bogie beam along the rail under both legs, its wheels, its
     * hazard ends. */
    T.box('dkGantry', g.x - half - 1.5, y - 0.7, 0.45, g.x + half + 1.5, y + 0.7, 1.25, { name: 'gantry bogie' });
    T.dress(() => {
      for (const x of [g.x - half - 0.9, g.x - half + 0.9, g.x + half - 0.9, g.x + half + 0.9]) {
        T.cyl('dkTyre', [x, y - 0.75, 0.45], [x, y + 0.75, 0.45], 0.45, 10);
      }
      for (const s of [-1, 1]) {
        T.deco('mastRed', g.x + s * (half + 1.5) - 0.02, y - 0.72, 0.5, g.x + s * (half + 1.5) + 0.02, y + 0.72, 1.2);
      }
    });
    for (const s of [-1, 1]) {
      T.box('dkGantry', g.x + s * half - G.leg / 2, y - 0.6, 1.25, g.x + s * half + G.leg / 2, y + 0.6, g0, { name: 'gantry leg' });
    }
    /* The end beam over the legs. */
    T.box('dkGantry', g.x - half - 0.5, y - 0.6, g0, g.x + half + 0.5, y + 0.6, top, { name: 'gantry end' });
  }
  /* The two girders across the block. */
  for (const s of [-1, 1]) {
    T.box('dkGantry', g.x + s * half - 0.6, ys - 0.6, g0, g.x + s * half + 0.6, yn + 0.6, top, { name: 'gantry girder' });
  }
  /* The trolley on the girders, its cab hung off one side, the spreader on
   * its ropes. */
  const ty = (db.y0 + db.y1) / 2 + (k % 2 ? 6 : -9);
  T.box('dkCraneCream', g.x - half + 0.2, ty - 1.8, top, g.x + half - 0.2, ty + 1.8, top + 1.8, { name: 'gantry trolley' });
  T.box('dkGantry', g.x + 2.0, ty - 1.1, top - 2.4, g.x + 4.2, ty + 1.1, top, { name: 'gantry cab' });
  T.paint('glassDark', g.x + 2.15, ty - 1.12, top - 2.1, g.x + 4.05, ty + 1.12, top - 0.8);
  T.box('dkGantry', g.x - 6.1, ty - 1.2, 15.0, g.x + 6.1, ty + 1.2, 15.6, { name: 'gantry spreader' });
  for (const x of [g.x - 4.5, g.x + 4.5]) {
    for (const y of [ty - 0.8, ty + 0.8]) {
      T.cyl('rope', [x, y, 15.6], [x, y, top], 0.03, 3, null, true);
    }
  }
  T.dress(() => {
    /* A ladder up one leg, a hand rail along each girder's top, the hazard
     * stripes on the trolley's ends, and the lamps under the girders that
     * light the stacks at night. */
    T.box('metalDark', g.x + half + 0.5, ys - 0.25, 1.3, g.x + half + 0.56, ys + 0.25, g0, { solid: false });
    for (const s of [-1, 1]) {
      T.cyl('metal', [g.x + s * half, ys - 0.6, top + 1.05], [g.x + s * half, yn + 0.6, top + 1.05], 0.03, 4);
      for (let y = ys; y <= yn; y += 4) {
        T.cyl('metal', [g.x + s * half, y, top], [g.x + s * half, y, top + 1.05], 0.025, 3);
      }
    }
    for (const s of [-1, 1]) {
      T.deco('mastRed', g.x - half + 0.2, ty + s * 1.8 - 0.02, top + 0.2, g.x + half - 0.2, ty + s * 1.8 + 0.02, top + 0.6);
    }
  });
  for (const s of [-1, 1]) {
    for (const y of [ys + 7, yn - 7]) {
      T.box('lampGlow', g.x + s * half - 0.35, y - 0.3, g0 - 0.25, g.x + s * half + 0.35, y + 0.3, g0, { solid: false, cast: false });
    }
  }
  T.sign(`gantry${k}`, g.x, ys - 0.62, g0 + 1, 3.2, 1.1, 's');
  T.sign(`gantry${k}`, g.x, yn + 0.62, g0 + 1, 3.2, 1.1, 'n');
}

/* ---- the reefer rack ---- */

function reefers(T) {
  const F = REEFER;
  const L = BOX.l40;
  const nRows = Math.floor((F.x1 - F.x0 + 0.32) / ROW);
  const slots = [];
  for (let i = 0; i < nRows; i += 1) {
    const x0 = F.x0 + i * ROW;
    slots.push({ x0, x1: x0 + BOX.w });
  }
  const yS = [F.y0, F.y0 + L];
  const yR = [F.y0 + L, F.y0 + L + F.rack];
  const yN = [yR[1], yR[1] + L];
  const R = rng(77);
  for (const [ya, yb, faceRack] of [[yS[0], yS[1], 'n'], [yN[0], yN[1], 's']]) {
    for (let i = 0; i < slots.length; i += 1) {
      const { x0, x1 } = slots[i];
      const n = F.tiers;
      for (let t = 0; t < n; t += 1) {
        const h0 = t * BH;
        const h1 = h0 + BH;
        T.box('containerWhite', x0, ya, h0, x1, yb, h1, { solid: false, name: 'reefer' });
        /* The machinery end, toward the rack: a dark grille, a panel and
         * a small lit display. */
        const yf = faceRack === 'n' ? yb : ya;
        const o = faceRack === 'n' ? 1 : -1;
        T.wide(() => T.dress(() => {
          T.paint('metalDark', x0 + 0.15, Math.min(yf, yf + o * 0.04), h0 + 0.25, x1 - 0.15, Math.max(yf, yf + o * 0.04), h0 + 1.5);
          T.paint('containerWhiteRib', x0 + 0.15, Math.min(yf, yf + o * 0.05), h0 + 1.6, x1 - 0.15, Math.max(yf, yf + o * 0.05), h1 - 0.2);
          T.paint('glassLit', x0 + 0.3, Math.min(yf, yf + o * 0.06), h0 + 1.75, x0 + 0.65, Math.max(yf, yf + o * 0.06), h0 + 2.0);
        }));
      }
      /* One solid for each band's run, below. */
    }
    /* The band's solid, out to the rack's edge so no slot is left between
     * the boxes and the walkways. */
    T.hidden(slots[0].x0, faceRack === 'n' ? ya : ya - 0.25, 0, slots[slots.length - 1].x1, faceRack === 'n' ? yb + 0.25 : yb, F.tiers * BH, 'wall', 'reefer band');
  }
  /* A missing top box shows as a step in the drawing and not in the solid:
   * take the solid down where it is. Done simply: no reefer stands two
   * high by the rack's ends, so the step is only ever inside the band. */
  /* The rack: posts on its two edges, three walkways, rails, lamps. */
  const deckH = [2.4, 4.99, 7.58];
  for (const h of deckH) {
    T.box('grating', F.x0 - 0.2, yR[0] + 0.25, h, slots[slots.length - 1].x1 + 0.2, yR[1] - 0.25, h + 0.12, { name: 'rack walkway', kind: 'wall' });
  }
  T.box('grating', F.x0 - 0.2, yR[0] + 0.25, 10.0, slots[slots.length - 1].x1 + 0.2, yR[1] - 0.25, 10.15, { name: 'rack roof' });
  for (let x = F.x0; x <= F.x1; x += 4 * ROW) {
    for (const y of [yR[0] + 0.3, yR[1] - 0.3]) {
      T.cyl('metal', [x, y, 0], [x, y, 10.0], 0.1, 6);
    }
    for (const h of deckH) {
      T.box('lampGlow', x - 0.2, (yR[0] + yR[1]) / 2 - 0.15, h + 2.2, x + 0.2, (yR[0] + yR[1]) / 2 + 0.15, h + 2.32, { solid: false, cast: false });
    }
  }
  T.dress(() => {
    for (const h of deckH) {
      for (const y of [yR[0] + 0.3, yR[1] - 0.3]) {
        T.cyl('mastWhite', [F.x0, y, h + 1.05], [F.x1, y, h + 1.05], 0.03, 4);
      }
    }
    /* The stair at the west end, flight over flight. */
    for (let i = 0; i < 4; i += 1) {
      const h0 = i * 2.5;
      T.cyl('metal', [F.x0 - 2.6, yR[0] + 0.4, h0], [F.x0 - 0.3, yR[0] + 0.4, h0 + 2.5], 0.05, 4);
      T.cyl('metal', [F.x0 - 2.6, yR[1] - 0.4, h0], [F.x0 - 0.3, yR[1] - 0.4, h0 + 2.5], 0.05, 4);
    }
  });
  T.hidden(F.x0 - 2.9, yR[0] + 0.25, 0, F.x0 - 0.2, yR[1] - 0.25, 0.4, 'wall', 'rack stair foot');
  T.sign('reefer', F.x0 - 0.25, (yR[0] + yR[1]) / 2, 11.0, 2.6, 0.9, 'w');
}

/* The reefer block's own measures, for the gaps. */
export function rackWindow() {
  const L = BOX.l40;
  const y0 = REEFER.y0 + L;
  return { x: REEFER.x0, y: y0 + REEFER.rack / 2, w: REEFER.rack - 0.5, h0: 2.52, h1: 4.99 };
}

/* ---- the empties ---- */

export function emptyWalls() {
  const E = EMPTIES;
  const wall = E.rows * BOX.w + (E.rows - 1) * 0.32;
  const out = [];
  for (let i = 0; i < E.walls; i += 1) {
    const y0 = E.y0 + i * (wall + E.gap);
    out.push({ y0, y1: y0 + wall });
  }
  return out;
}

function empties(T) {
  const E = EMPTIES;
  const slots = [];
  for (let b = 0; b < E.bays; b += 1) {
    const cx = E.x0 + (b + 0.5) * BAY;
    slots.push({ x0: cx - BOX.l20 / 2, x1: cx + BOX.l20 / 2 });
  }
  emptyWalls().forEach((w, i) => {
    const R = rng(300 + i);
    const rows = [];
    for (let r = 0; r < E.rows; r += 1) {
      const y0 = w.y0 + r * ROW;
      rows.push({ y0, y1: y0 + BOX.w });
    }
    const top = slots.map(() => R.pick([6, 6, 7, 7, 7, 5]));
    const h = rows.map(() => top.map((v) => v));
    stackField(T, { slots, rows, h, seed: 900 + i, colours: EMPTY_COLOURS, logos: 0.4, doors: 'e' });
  });
  /* The top lifter that stacks them, parked at the walls' east end with a
   * box on its forks. */
  const lx = E.x0 + E.bays * BAY + 6;
  const ly = E.y0 + 34;
  T.box('dkGantry', lx - 2.0, ly - 4.5, 0.5, lx + 2.0, ly + 3.5, 2.8, { name: 'top lifter' });
  T.box('dkGantry', lx - 1.4, ly + 1.5, 2.8, lx + 1.4, ly + 3.5, 5.2, { name: 'top lifter cab' });
  T.paint('glassDark', lx - 1.42, ly + 1.7, 3.3, lx + 1.42, ly + 3.3, 4.9);
  for (const s of [-1, 1]) {
    T.post('metalDark', lx + s * 1.1, ly - 4.9, 0.3, 17.5, 0.28, { name: 'top lifter mast' });
    for (const y of [ly - 3.3, ly + 2.3]) {
      T.cyl('dkTyre', [lx + s * 2.0, y, 0.75], [lx + s * 2.25, y, 0.75], 0.75, 10);
    }
  }
  T.box('dkGantry', lx - 3.1, ly - 6.4, 11.8, lx + 3.1, ly - 5.2 + 1.24, 12.3, { name: 'top lifter spreader' });
  T.box('dkBoxSky', lx - 3.03, ly - 6.4, 11.8 - BH, lx + 3.03, ly - 5.2 + 1.24, 11.8, { name: 'container' });
  T.box('metalDark', lx - 1.3, ly - 5.2, 11.9, lx + 1.3, ly - 4.6, 17.6, { name: 'top lifter carriage' });
}

/* ---- the masts ---- */

export const MAST_H = 31;
function mast(T, px, py) {
  T.disc('concreteMid', px, py, 1.0, 0, 0.6);
  T.hidden(px - 0.7, py - 0.7, 0, px + 0.7, py + 0.7, 0.6, 'wall', 'mast foot');
  T.post('metal', px, py, 0.6, MAST_H, 0.38, { name: 'light mast', seg: 8, rTop: 0.24 });
  T.disc('metalDark', px, py, 1.7, MAST_H, MAST_H + 0.25, 12);
  T.hidden(px - 1.2, py - 1.2, MAST_H, px + 1.2, py + 1.2, MAST_H + 0.25, 'wall', 'mast head');
  for (const [dx, dy] of [[1.3, 0], [-1.3, 0], [0, 1.3], [0, -1.3], [0.92, 0.92], [-0.92, -0.92]]) {
    T.box('lampHead', px + dx - 0.35, py + dy - 0.35, MAST_H + 0.25, px + dx + 0.35, py + dy + 0.35, MAST_H + 0.75, { solid: false });
    T.box('lampGlow', px + dx - 0.3, py + dy - 0.3, MAST_H + 0.2, px + dx + 0.3, py + dy + 0.3, MAST_H + 0.25, { solid: false, cast: false });
  }
  T.ball('lampRed', px, py, MAST_H + 1.3, 0.16);
  T.dress(() => {
    T.cyl('metal', [px, py, MAST_H + 0.25], [px, py, MAST_H + 1.2], 0.04, 4);
    for (let h = 2; h < MAST_H; h += 0.45) {
      T.cyl('metalDark', [px + 0.38, py - 0.18, h], [px + 0.38, py + 0.18, h], 0.012, 3);
    }
  });
}

/* ---- the tractors ---- */

/*
 * A terminal tractor and its chassis, heading east (dir 1) or west (-1)
 * along x, the chassis behind it, a 40 ft box on it if `load` names its
 * colour. Solid as the cab, the chassis's deck and the box.
 */
export function tractor(T, px, py, dir, m, load) {
  const cab0 = px;
  const cab1 = px + dir * 3.2;
  const xa = Math.min(cab0, cab1);
  const xb = Math.max(cab0, cab1);
  T.box(m, xa, py - 1.25, 0.6, xb, py + 1.25, 1.5, { name: 'tractor' });
  T.box(m, dir > 0 ? xa + 1.6 : xa, py - 1.2, 1.5, dir > 0 ? xb : xb - 1.6, py + 1.2, 3.1, { name: 'tractor cab' });
  const gx = dir > 0 ? xb : xa;
  T.paint('glassDark', gx - 0.02, py - 1.0, 2.0, gx + 0.02, py + 1.0, 2.9);
  T.paint('glassDark', dir > 0 ? xa + 1.8 : xa + 0.2, py - 1.22, 2.0, dir > 0 ? xb - 0.2 : xb - 1.8, py + 1.22, 2.8);
  T.ball('lampGlow', gx, py - 0.95, 1.1, 0.12, true);
  T.ball('lampGlow', gx, py + 0.95, 1.1, 0.12, true);
  T.ball('lampRed', dir > 0 ? xa + 1.7 : xb - 1.7, py, 3.25, 0.12, true);
  for (const x of [px + dir * 0.7, px + dir * 2.6]) {
    T.cyl('dkTyre', [x, py - 1.3, 0.55], [x, py + 1.3, 0.55], 0.55, 10);
  }
  /* The chassis, behind. */
  const c0 = px - dir * 0.2;
  const c1 = px - dir * 12.6;
  const ca = Math.min(c0, c1);
  const cb = Math.max(c0, c1);
  T.box('metalDark', ca, py - 1.2, 1.0, cb, py + 1.2, 1.35, { name: 'chassis' });
  for (const x of [c1 + dir * 1.0, c1 + dir * 2.4]) {
    T.cyl('dkTyre', [x, py - 1.25, 0.5], [x, py + 1.25, 0.5], 0.5, 10);
  }
  T.hidden(Math.min(c1 + dir * 0.3, c1 + dir * 3.1), py - 1.0, 0.0, Math.max(c1 + dir * 0.3, c1 + dir * 3.1), py + 1.0, 1.0, 'wall', 'chassis wheels');
  if (load) {
    T.box(load, ca + 0.1, py - BOX.w / 2, 1.35, cb - 0.1, py + BOX.w / 2, 1.35 + BH, { name: 'container' });
    T.dress(() => {
      T.flute(load, ca + 0.3, py - BOX.w / 2, cb - 0.3, py - BOX.w / 2, 1.53, 1.35 + BH - 0.14, 's', 14);
      T.flute(load, ca + 0.3, py + BOX.w / 2, cb - 0.3, py + BOX.w / 2, 1.53, 1.35 + BH - 0.14, 'n', 14);
    });
  }
}

const TRACTORS = [
  [96, 93.6, 1, 'dkTractorA', 'containerBlue'],
  [202, 136.7, -1, 'dkTractorB', 'dkBoxMaroon'],
  [260, 136.7, 1, 'dkTractorA', null],
  [150, 50.5, -1, 'dkTractorB', 'containerGreen'],
  [262, 93.6, -1, 'dkTractorB', 'containerOrange'],
  [356, 92.5, 1, 'dkTractorA', 'containerWhite'],
];

/* ---- the paint ---- */

function paint(T) {
  T.dress(() => T.wide(() => {
    /* The gantries' rails along every lane, both sides of the block's
     * stack. */
    for (const d of DOUBLES) {
      for (const y of [d.y0 - GANTRY.legOut, d.y1 + GANTRY.legOut]) {
        for (const o of [-0.65, 0.65]) {
          T.paint('dkRail', BLOCKS[0].x0 - 4, y + o - 0.08, 0, BLOCKS[2].x1 + 4, y + o + 0.08, 0.025);
        }
      }
    }
    /* Each band's outline and its bay ticks, and the canyon's yellow
     * centre line. */
    for (const blk of BLOCKS) {
      for (const band of BANDS) {
        for (const y of [band.y0 - 0.35, band.y1 + 0.2]) {
          T.paint('dkLine', blk.x0 - 0.2, y, 0, blk.x1 + 0.2, y + 0.15, 0.02);
        }
        for (let b = 0; b <= BLOCK_BAYS; b += 1) {
          const x = blk.x0 + b * BAY;
          T.paint('dkLine', x - 0.08, band.y0 - 0.9, 0, x + 0.08, band.y0 - 0.35, 0.02);
          T.paint('dkLine', x - 0.08, band.y1 + 0.35, 0, x + 0.08, band.y1 + 0.9, 0.02);
        }
      }
      for (const d of DOUBLES) {
        const yc = (d.canyon[0] + d.canyon[1]) / 2;
        for (let x = blk.x0 + 1; x < blk.x1 - 2; x += 4) {
          T.paint('dkLineYellow', x, yc - 0.06, 0, x + 2, yc + 0.06, 0.02);
        }
        T.sign(`block${blk.name}`, blk.x0 - 3.0, (d.y0 + d.y1) / 2, 0.03, 4, 4, 'up', 0.0);
      }
    }
    /* The lanes' dashed centres. */
    for (let k = 0; k < DOUBLES.length - 1; k += 1) {
      const y = (DOUBLES[k].y1 + DOUBLES[k + 1].y0) / 2;
      for (let x = 20; x < 330; x += 6) {
        T.paint('dkLine', x, y - 0.07, 0, x + 3, y + 0.07, 0.02);
      }
    }
    /* The cross roads' zebra crossings at the yard's south road. */
    for (const blk of BLOCKS.slice(1)) {
      for (let i = 0; i < 6; i += 1) {
        const x = blk.x0 - 20 + i * 2.6;
        T.paint('dkLine', x, 46.8, 0, x + 1.3, 51.6, 0.02);
      }
    }
  }));
}

/* ---- the yard ---- */

export function yard(T) {
  blocks(T);
  GANTRIES.forEach((g, k) => gantry(T, g, k));
  reefers(T);
  empties(T);
  for (const [px, py] of MASTS) {
    mast(T, px, py);
  }
  for (const [px, py, dir, m, load] of TRACTORS) {
    tractor(T, px, py, dir, m, load);
  }
  paint(T);
}

/* The named canyon's window, for the gaps: the middle double block's, half
 * way along block B. */
export function canyonWindow() {
  const d = DOUBLES[1];
  const blk = BLOCKS[1];
  return { x: (blk.x0 + blk.x1) / 2, y: (d.canyon[0] + d.canyon[1]) / 2, w: CANYON, h1: 4 * BH };
}

export function gantryWindow(k) {
  const g = GANTRIES[k];
  const d = DOUBLES[g.db];
  return { x: g.x, y: d.y0 - GANTRY.legOut, w: 16 - GANTRY.leg, h0: 1.25, h1: GANTRY.top - GANTRY.girder };
}
