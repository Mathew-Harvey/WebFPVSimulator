/*
 * places.js: everything built on Momiji Pass, each a line of its own to
 * fly. Pure, as ./frame.js is: the solids are boxes on the axes and
 * capsules, and what is only drawn rides along for ./index.js.
 *
 *   the gorge          the river's cut across the valley, eighteen metres
 *                      deep, its walls ragged rock, boulders in the river
 *                      and a waterfall at its head, crossed three times:
 *   the red bridge     the road's vermilion arch on the east, a steel arch
 *                      under the deck that you fly beneath, and the hidden
 *                      Konex Drone sign on its north springing block
 *   the old bridge     the road's concrete girders on the west, two piers
 *                      standing in the river to thread
 *   the footbridge     a hikers' suspension bridge between them, planks
 *                      and cables, low over the water
 *   the tunnel         seventy metres under the ridge on the top road, its
 *                      portals lettered, lit inside, jet fans in its roof
 *   the rock shed      a concrete gallery over leg W2 where the cliff
 *                      leans over the road, open on the valley side between
 *                      its columns
 *   the rest stop      at the pass: the car park, the tea house with its
 *                      red parasol and bench, the vending machines, the
 *                      pass stone, a stone wall, and the torii and stair up
 *                      to a small shrine on the slope
 *   the lookout        a deck over the west face beside the top road
 *   the roadside       guardrails on every drop and round every hairpin,
 *                      curve mirrors, chevron boards, hairpin plates,
 *                      delineators and signs
 *   the hamlet         farmhouses and a shop by the valley road, rice
 *                      fields cut and drying on racks, a bus stop
 *
 * SIZES, from the references (scripts/touge-check.js reads them back):
 *   guardrail beam     0.8 m to its top (a Japanese class C beam rail)
 *   curve mirror       a 0.8 m round mirror on a 3.2 m orange pole
 *   tunnel bore        9.6 m wide and 5.8 m high, a two lane mountain
 *                      tunnel's bore (the brief's 8 to 10 m and 5 to 6 m)
 *   torii              4.4 m between the pillars, 5.2 m to the top beam,
 *                      a small shrine's gate
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

import { Build, hash2, rng, W } from './frame.js';
import {
  centre, heightAt, roadPoint, nearest, HALF, BENCH, SUMMIT, GORGE, TUNNEL, REST, SHED,
  NODES, HAIRPINS, bendRange, VALLEY_Y, SHRINE,
} from './route.js';
import { floorAt, inGorge, lipsAt, GORGE_X0, LOOKOUT, ground, sampleGrid } from './terrain.js';
import { plantTrees } from './trees.js';

/* The craft's clearance a named gap's window keeps inside its opening. */
const M = 0.35;

/* ------------------------------------------------------------------ */
/* The gorge                                                           */
/* ------------------------------------------------------------------ */

/* The highest the grid's ground stands along a lip from x0 to x1 at py y. */
function lipTop(x0, x1, y) {
  const { fine } = ground();
  let top = 0;
  for (let x = x0; x <= x1 + 1e-6; x += 4) {
    top = Math.max(top, sampleGrid(fine, x, y));
  }
  return top;
}

const GORGE_END = W + 20;

function gorge(B) {
  const lo = GORGE.floor - 1;
  for (let sx = GORGE_X0; sx < GORGE_END; sx += 8) {
    const [a, b] = lipsAt(sx);
    const tS = lipTop(sx, sx + 8, a);
    const tN = lipTop(sx, sx + 8, b);
    B.box('tgRock', sx, a - 6, lo, sx + 8, a, tS, { name: 'gorge wall' });
    B.box('tgRock', sx, b, lo, sx + 8, b + 6, tN, { name: 'gorge wall' });
    /* A band of darker strata a third of the way down each face. */
    B.paint('tgRockDark', sx, a - 0.02, GORGE.floor + 5.2, sx + 8, a + 0.02, GORGE.floor + 6.4);
    B.paint('tgRockDark', sx, b - 0.02, GORGE.floor + 9.6, sx + 8, b + 0.02, GORGE.floor + 10.3);
  }
  /* The head of the gorge, where the river falls in. */
  const [a0, b0] = lipsAt(GORGE_X0);
  B.box('tgRock', GORGE_X0 - 6, a0 - 6, lo, GORGE_X0, b0 + 6, lipTop(GORGE_X0, GORGE_X0, (a0 + b0) / 2), { name: 'gorge head' });
  /* THE BOULDERS, in and beside the river: drawn as rough blobs, solid as
   * a capsule inside each. Kept out of the bridges' lines and the window
   * under each bridge. */
  const r = rng(7031);
  const keep = [[120, 10], [310, 10], [210, 5]];
  for (let k = 0; k < 70; k += 1) {
    const x = r.range(GORGE_X0 + 10, GORGE_END - 4);
    if (keep.some(([c, w]) => Math.abs(x - c) < w)) {
      continue;
    }
    const [a, b] = lipsAt(x);
    const y = r.range(a + 2, b - 2);
    const big = r.chance(0.3);
    const rad = big ? r.range(1.4, 2.6) : r.range(0.5, 1.1);
    const h = GORGE.floor + rad * 0.45;
    B.leaf(big ? 'tgRock' : 'tgRockDark', x, y, h, rad, rad * 0.7, [0, k * 1.3, 0]);
    if (rad > 0.8) {
      B.post('tgRock', x, y, GORGE.floor, h + rad * 0.2, rad * 0.7, { draw: false, kind: 'wall', name: 'boulder' });
    }
  }
}

/* ------------------------------------------------------------------ */
/* The bridges                                                         */
/* ------------------------------------------------------------------ */

/* The red arch bridge, on the road at px 310, its deck at 0. */
export const RED = { x: 310, y0: GORGE.y0 - 4, y1: GORGE.y1 + 4, w: 9, spring: -12, crown: -1.6, ribs: 3.6 };

/* The arch's height at py y: a parabola from its springing on each wall to
 * its crown at mid gorge. */
export function archAt(y) {
  const mid = (GORGE.y0 + GORGE.y1) / 2;
  const half = (GORGE.y1 - GORGE.y0) / 2;
  const t = (y - mid) / half;
  return RED.crown + (RED.spring - RED.crown) * t * t;
}

function redBridge(B) {
  const { x, y0, y1, w } = RED;
  const hw = w / 2;
  /* The deck, its girder and the parapets. */
  B.box('tgVermilion', x - hw, y0, -1.0, x + hw, y1, -0.02, { name: 'red bridge deck' });
  B.box('tgConcrete', x - hw + 0.3, y0, -0.02, x + hw - 0.3, y1, 0.0, { name: 'red bridge deck', cast: false });
  for (const s of [-1, 1]) {
    const px = x + s * (hw - 0.15);
    B.box('tgVermilion', px - 0.15, y0, 0, px + 0.15, y1, 0.35, { name: 'red bridge kerb' });
    B.box('tgVermilion', px - 0.1, y0, 1.0, px + 0.1, y1, 1.15, { name: 'red bridge rail' });
    for (let y = y0; y <= y1 + 1e-6; y += 2.5) {
      B.box('tgVermilion', px - 0.11, y - 0.11, 0.35, px + 0.11, y + 0.11, 1.0, { name: 'red bridge post' });
      B.deco('tgVermilionDark', px - 0.14, y - 0.14, 1.15, px + 0.14, y + 0.14, 1.25);
    }
    /* The giboshi, the onion finials at the ends, as old red bridges have. */
    for (const y of [y0, y1]) {
      B.post('tgVermilion', px, y, 0.35, 1.35, 0.18, { name: 'bridge end post' });
      B.ball('tgBronze', px, y, 1.5, 0.2);
      B.cone('tgBronze', px, y, 1.62, 0.1, 0.28, 8);
    }
    /* The two arch ribs, solid as capsules along them. */
    const rx = x + s * RED.ribs;
    let prev = null;
    for (let y = GORGE.y0; y <= GORGE.y1 + 1e-6; y += 2) {
      const h = archAt(y);
      if (prev) {
        B.cap('tgVermilion', [rx, prev[0], prev[1]], [rx, y, h], 0.42, { name: 'arch rib', seg: 6 });
      }
      prev = [y, h];
    }
    /* The spandrel columns from the rib to the deck. */
    for (let y = GORGE.y0 + 3; y < GORGE.y1 - 2; y += 3.4) {
      const h = archAt(y);
      if (h < -2.2) {
        B.post('tgVermilion', rx, y, h + 0.3, -1.0, 0.16, { name: 'spandrel' });
      }
    }
  }
  /* Cross bracing between the ribs at the crown and the quarters. */
  for (const y of [GORGE.y0 + 8, (GORGE.y0 + GORGE.y1) / 2, GORGE.y1 - 8]) {
    const h = archAt(y);
    B.cap('tgVermilionDark', [x - RED.ribs, y, h], [x + RED.ribs, y, h], 0.2, { name: 'arch brace' });
  }
  /* The springing blocks on each wall the ribs land on. */
  for (const [ya, yb] of [[GORGE.y0 - 1, GORGE.y0 + 1.6], [GORGE.y1 - 1.6, GORGE.y1 + 1]]) {
    B.box('tgConcrete', x - hw, ya, RED.spring - 2.4, x + hw, yb, RED.spring + 0.6, { name: 'springing block' });
  }
}

/* The hidden Konex Drone sign: on the north springing block's face, under
 * the deck, looking south down the gorge's middle. Only a pilot who flies
 * the river under the red bridge, close in, reads it. In the world frame,
 * for ./index.js's markSpots. */
export function konexSpot() {
  const y = GORGE.y1 - 1.6;
  return { p: [RED.x - W / 2, RED.spring - 0.9, 230 - y + 0.02], n: [0, 0, 1], up: [0, 1, 0], w: 1.2 };
}

/* The old concrete bridge, on the road at px 120: girders on two piers. */
export const OLD = { x: 120, y0: GORGE.y0 - 4, y1: GORGE.y1 + 4, w: 9, piers: [111, 123] };

function oldBridge(B) {
  const { x, y0, y1, w } = OLD;
  const hw = w / 2;
  B.box('tgConcrete', x - hw, y0, -1.5, x + hw, y1, -0.02, { name: 'old bridge deck' });
  B.box('tgConcreteDark', x - hw + 0.3, y0, -0.02, x + hw - 0.3, y1, 0.0, { name: 'old bridge deck', cast: false });
  for (const s of [-1, 1]) {
    const px = x + s * (hw - 0.2);
    B.box('tgConcrete', px - 0.2, y0, 0, px + 0.2, y1, 0.9, { name: 'old bridge parapet' });
    B.deco('tgConcreteDark', px - 0.24, y0, 0.9, px + 0.24, y1, 1.0);
    /* The drain holes along the parapet's foot. */
    for (let y = y0 + 1.5; y < y1; y += 3) {
      B.paint('tgIron', px - 0.21, y - 0.15, 0.08, px + 0.21, y + 0.15, 0.2, true);
    }
  }
  for (const py of OLD.piers) {
    B.box('tgConcrete', x - 3.2, py - 1, GORGE.floor - 1, x + 3.2, py + 1, -1.5, { name: 'bridge pier' });
    B.box('tgConcreteDark', x - 3.6, py - 1.3, -2.2, x + 3.6, py + 1.3, -1.5, { name: 'pier cap' });
    /* The cutwater on its upstream end. */
    B.paint('tgConcreteDark', x - 3.25, py - 1.02, GORGE.floor, x + 3.25, py + 1.02, GORGE.floor + 2.2);
  }
}

/* The footbridge across the gorge at px 210: planks hung from cables. */
export const FOOT = { x: 210, y0: GORGE.y0 - 3, y1: GORGE.y1 + 3, w: 1.6, deck: -2.5, tower: 4.2 };

function footbridge(B) {
  const { x, y0, y1, w, deck, tower } = FOOT;
  const hw = w / 2;
  /* The deck sags to its middle, laid as level runs of planks. */
  const n = 10;
  for (let k = 0; k < n; k += 1) {
    const ya = y0 + ((y1 - y0) * k) / n;
    const yb = y0 + ((y1 - y0) * (k + 1)) / n;
    const t = ((k + 0.5) / n) * 2 - 1;
    const h = deck - 1.2 * (1 - t * t);
    B.box('tgWood', x - hw, ya, h - 0.12, x + hw, yb, h, { name: 'footbridge planks' });
    for (let y = ya + 0.2; y < yb; y += 0.5) {
      B.paint('tgWoodDark', x - hw, y - 0.03, h + 0.001, x + hw, y + 0.03, h + 0.004, true);
    }
    /* The hand cables' hangers. */
    for (const s of [-1, 1]) {
      B.cyl('tgSteel', [x + s * hw, (ya + yb) / 2, h], [x + s * hw, (ya + yb) / 2, h + 1.05], 0.012, 3, null, true);
    }
  }
  /* The towers on each lip, timber, and the main cables. */
  for (const [y, toward] of [[y0, 1], [y1, -1]]) {
    for (const s of [-1, 1]) {
      B.post('tgWoodDark', x + s * (hw + 0.25), y, 0, tower, 0.16, { name: 'footbridge tower' });
    }
    B.box('tgWoodDark', x - hw - 0.45, y - 0.15, tower - 0.3, x + hw + 0.45, y + 0.15, tower, { name: 'footbridge lintel' });
    B.box('tgConcrete', x - hw - 0.6, y - 0.8, -0.6, x + hw + 0.6, y + 0.8, 0.05, { name: 'footbridge anchor' });
    void toward;
  }
  for (const s of [-1, 1]) {
    B.wire('tgSteel', [x + s * hw, y0, tower - 0.2], [x + s * hw, y1, tower - 0.2], 3.6, 0.03);
    B.wire('tgSteel', [x + s * hw, y0, 1.0], [x + s * hw, y1, 1.0], 2.2, 0.02);
  }
}

/* ------------------------------------------------------------------ */
/* The tunnel                                                          */
/* ------------------------------------------------------------------ */

/* The jet fans, px, hung either side of the crown. */
const FANS = [254, 281];

function tunnel(B) {
  const { x0, x1, y, w, h, wall, roof } = TUNNEL;
  const e = SUMMIT;
  const hw = w / 2;
  const { fine } = ground();
  /* The bore: two walls and a roof, the walls' faces in the lining's
   * cream, a dado of tiles at the foot. */
  B.box('tgLining', x0, y - hw - wall, e, x1, y - hw, e + h, { name: 'tunnel wall' });
  B.box('tgLining', x0, y + hw, e, x1, y + hw + wall, e + h, { name: 'tunnel wall' });
  B.box('tgLiningDark', x0, y - hw - wall, e + h, x1, y + hw + wall, e + h + roof, { name: 'tunnel roof' });
  for (const s of [-1, 1]) {
    const face = y + s * hw;
    B.paint('tgTile', x0, face - s * 0.03, e, x1, face, e + 1.1);
    B.paint('tgLiningDark', x0, face - s * 0.03, e + 1.1, x1, face, e + 1.2);
  }
  /* The ridge over the roof: solid up to the drawn ground in 2 m slices,
   * each to the lowest the ground stands over it, so a quad that lands on
   * the ridge over the tunnel lands on it. */
  for (let x = x0; x < x1 - 1e-6; x += 2) {
    let top = Infinity;
    for (let px = x; px <= x + 2; px += 1) {
      for (let py = y - hw - wall; py <= y + hw + wall; py += 1) {
        top = Math.min(top, sampleGrid(fine, px, py));
      }
    }
    if (top > e + h + roof + 0.05) {
      B.box('tgRock', x, y - hw - wall, e + h + roof, x + 2, y + hw + wall, top - 0.05, { draw: false, name: 'ridge over the tunnel' });
    }
  }
  /* The lamps down the crown, every 6 m: the town's lamp glow. */
  for (let x = x0 + 3; x < x1; x += 6) {
    for (const s of [-1, 1]) {
      B.deco('lampGlow', x - 0.6, y + s * 1.6 - 0.1, e + h - 0.12, x + 0.6, y + s * 1.6 + 0.1, e + h - 0.02);
    }
  }
  /* The jet fans, in pairs either side of the crown: solid. */
  for (const fx of FANS) {
    for (const s of [-1, 1]) {
      const fy = y + s * 2.4;
      B.cap('tgSteel', [fx - 1.6, fy, e + h - 0.85], [fx + 1.6, fy, e + h - 0.85], 0.55, { name: 'jet fan', look: 'cyl', seg: 10 });
      B.box('tgSteel', fx - 0.15, fy - 0.08, e + h - 0.35, fx + 0.15, fy + 0.08, e + h, { name: 'jet fan hanger' });
    }
  }
  /* The portals: a concrete face over each mouth, the bore cut from it, a
   * hood over the mouth, and the tunnel's plate. */
  for (const [px, out] of [[x0, -1], [x1, 1]]) {
    const fx0 = out < 0 ? px - 1.2 : px;
    const fx1 = out < 0 ? px : px + 1.2;
    let top = e + h + roof;
    for (let py = y - hw - 10; py <= y + hw + 10; py += 2) {
      top = Math.max(top, sampleGrid(fine, px + out * 3, py));
    }
    top = Math.min(top, e + h + roof + 9);
    B.box('tgConcrete', fx0, y - hw - 9, e, fx1, y - hw, top, { name: 'portal' });
    B.box('tgConcrete', fx0, y + hw, e, fx1, y + hw + 9, top, { name: 'portal' });
    B.box('tgConcrete', fx0, y - hw, e + h, fx1, y + hw, top, { name: 'portal' });
    /* The hood: a frame proud of the face round the mouth. */
    const hx0 = out < 0 ? px - 2.2 : px + 1.2;
    const hx1 = out < 0 ? px - 1.2 : px + 2.2;
    B.box('tgConcreteDark', hx0, y - hw - 0.8, e, hx1, y - hw, e + h + 0.8, { name: 'portal hood' });
    B.box('tgConcreteDark', hx0, y + hw, e, hx1, y + hw + 0.8, e + h + 0.8, { name: 'portal hood' });
    B.box('tgConcreteDark', hx0, y - hw - 0.8, e + h, hx1, y + hw + 0.8, e + h + 0.8, { name: 'portal hood' });
    B.sign('tunnelPlate', out < 0 ? px - 2.2 : px + 2.2, y, e + h + 1.7, [out, 0], 4.2, 0.9, 0.03);
  }
}

/* ------------------------------------------------------------------ */
/* The rock shed                                                       */
/* ------------------------------------------------------------------ */

function shed(B) {
  const { x0, x1, y } = SHED;
  const hw = HALF + 1.4;
  for (let x = x0; x < x1 - 1e-6; x += 6) {
    const s = nearest(x + 3, y, 10).s;
    const e = heightAt(s);
    const top = e + 6.2;
    /* The back wall against the cliff, the roof over the road and its
     * earth fill, the columns on the valley side. */
    B.box('tgConcrete', x, y + hw, e - 0.5, x + 6, y + hw + 1.0, top + 0.8, { name: 'rock shed wall' });
    B.box('tgConcrete', x, y - hw - 0.4, top, x + 6, y + hw + 1.0, top + 0.8, { name: 'rock shed roof' });
    B.deco('tgVerge', x, y - hw + 0.4, top + 0.8, x + 6, y + hw + 1.0, top + 1.1);
    B.box('tgConcreteDark', x, y - hw - 0.6, top - 0.6, x + 6, y - hw, top + 0.8, { name: 'rock shed beam' });
    B.box('tgConcrete', x + 0.1, y - hw - 0.5, e - 0.5, x + 0.9, y - hw + 0.3, top, { name: 'rock shed column' });
    /* The sodium lamps on the back wall. */
    B.deco('lampGlow', x + 2.6, y + hw - 0.08, e + 4.6, x + 3.4, y + hw, e + 4.9);
  }
  const s = nearest(x1, y, 10).s;
  const e = heightAt(s);
  B.box('tgConcrete', x1 - 0.8, y - hw - 0.5, e - 0.5, x1, y - hw + 0.3, e + 6.2, { name: 'rock shed column' });
}

/* ------------------------------------------------------------------ */
/* The rest stop, the shrine and the lookout                           */
/* ------------------------------------------------------------------ */

/* The tea house, on the car park's north east corner, facing south. */
export const TEA = { x0: 176, x1: 196, y0: 306, y1: 318, h: 3.4 };
export const TORII = { x: 150, y: 329, span: 4.4, h: 5.2 };

function restStop(B) {
  const e = SUMMIT;
  const { x0, x1, y0, y1 } = REST;
  /* The stone wall along the back, ishigaki laid in courses. */
  B.box('tgStone', x0, y1, e - 0.5, x1, y1 + 1.6, e + 3.2, { name: 'stone wall' });
  for (let h = e + 0.5; h < e + 3.1; h += 0.6) {
    B.paint('tgStoneDark', x0, y1 - 0.02, h, x1, y1 + 0.0, h + 0.07);
  }
  /* The tea house: plaster walls on a timber frame, a deep tiled roof,
   * open on the car park side under its eaves, a noren in the doorway. */
  const T = TEA;
  B.box('tgPlaster', T.x0, T.y0 + 3, e, T.x1, T.y1, e + T.h, { name: 'tea house' });
  for (let x = T.x0; x <= T.x1 + 1e-6; x += 2.5) {
    B.post('tgWoodDark', x, T.y0 + 0.4, e, e + T.h, 0.12, { name: 'tea house post' });
    B.paint('tgWoodDark', x - 0.1, T.y0 + 2.97, e, x + 0.1, T.y0 + 3.0, e + T.h, true);
  }
  B.box('tgWoodDark', T.x0, T.y0 + 0.2, e + T.h - 0.3, T.x1, T.y0 + 0.6, e + T.h, { name: 'tea house beam' });
  B.box('tgWood', T.x0, T.y0 + 0.4, e, T.x1, T.y1, e + 0.25, { name: 'tea house floor', cast: false });
  /* Its roof, irimoya: a hip below a gable, in dark tiles. */
  const rh = e + T.h;
  B.prism('tgRoofTile', 'x', [[T.y0 - 1.2, rh - 0.1], [(T.y0 + T.y1) / 2, rh + 3.2], [T.y1 + 1.2, rh - 0.1]], T.x0 - 1.2, T.x1 + 1.2);
  B.hidden(T.x0 - 1, T.y0 - 0.6, rh - 0.1, T.x1 + 1, T.y1 + 0.6, rh + 1.2, 'wall', 'tea house roof');
  B.hidden(T.x0, T.y0 + 1.5, rh + 1.2, T.x1, T.y1 - 1.5, rh + 2.4, 'wall', 'tea house roof');
  B.box('tgRoofTile', T.x0 - 1.3, (T.y0 + T.y1) / 2 - 0.25, rh + 3.0, T.x1 + 1.3, (T.y0 + T.y1) / 2 + 0.25, rh + 3.45, { name: 'ridge', solid: false });
  /* The noren over the doorway and the sign over the eaves. */
  B.sign('noren', (T.x0 + T.x1) / 2, T.y0 + 3, e + 2.3, [0, -1], 2.6, 1.1, 0.03);
  B.sign('teaSign', (T.x0 + T.x1) / 2, T.y0 + 0.18, e + T.h - 0.15, [0, -1], 3.6, 0.7, 0.03);
  /* The red bench and the parasol, nodate: a red cloth on a low bench and
   * a red paper umbrella over it. */
  for (const bx of [T.x0 + 3, T.x1 - 6]) {
    B.box('tgRed', bx, T.y0 - 3.2, e + 0.42, bx + 3, T.y0 - 2.4, e + 0.5, { name: 'bench', solid: false });
    B.deco('tgWoodDark', bx + 0.1, T.y0 - 3.1, e, bx + 2.9, T.y0 - 2.5, e + 0.42);
  }
  B.post('tgWoodDark', T.x0 + 4.5, T.y0 - 3.6, e, e + 2.6, 0.04, { name: 'parasol pole' });
  B.cone('tgRed', T.x0 + 4.5, T.y0 - 3.6, e + 2.15, 1.5, 0.55, 16);
  /* The toilets, a small concrete block with a flat roof, west. */
  B.box('tgConcrete', x0 + 4, y1 - 9, e, x0 + 14, y1 - 1, e + 3.2, { name: 'toilets' });
  B.box('tgConcreteDark', x0 + 3.6, y1 - 9.4, e + 3.2, x0 + 14.4, y1 - 0.6, e + 3.5, { name: 'toilets roof' });
  B.paint('tgWoodDark', x0 + 8.2, y1 - 9.03, e, x0 + 9.8, y1 - 9, e + 2.1, true);
  /* The pass stone: a tall slab on a plinth, its name cut into it. */
  B.box('tgStone', 158, 288, e, 162, 291, e + 0.5, { name: 'pass stone plinth' });
  B.box('tgStoneDark', 158.6, 288.8, e + 0.5, 161.4, 290.2, e + 3.6, { name: 'pass stone' });
  B.sign('passStone', 160, 288.78, e + 2.1, [0, -1], 2.4, 2.6, 0.01);
  /* The car park's kerb along the road, broken by its two gates. */
  for (const [a, b] of [[x0, x0 + 8], [x0 + 20, x1 - 20], [x1 - 8, x1]]) {
    B.box('tgConcrete', a, y0 - 0.3, e, b, y0 + 0.1, e + 0.18, { name: 'kerb', cast: false });
  }
  /* Stone lanterns, toro, by the stair and by the tea house. */
  for (const [lx, ly] of [[145, 325], [155, 325], [173, 304], [199, 304]]) {
    B.box('tgStone', lx - 0.35, ly - 0.35, e, lx + 0.35, ly + 0.35, e + 0.25, { name: 'lantern' });
    B.post('tgStone', lx, ly, e + 0.25, e + 1.1, 0.12, { name: 'lantern' });
    B.box('tgStone', lx - 0.35, ly - 0.35, e + 1.1, lx + 0.35, ly + 0.35, e + 1.5, { name: 'lantern' });
    B.deco('lampGlow', lx - 0.2, ly - 0.2, e + 1.18, lx + 0.2, ly + 0.2, e + 1.42);
    B.cone('tgStone', lx, ly, e + 1.5, 0.55, 0.42, 6);
  }
}

function torii(B, cx, cy, e, span, h, m) {
  for (const s of [-1, 1]) {
    B.post(m, cx + s * span / 2, cy, e, e + h, 0.22, { name: 'torii pillar', seg: 10 });
    B.deco('tgInk', cx + s * span / 2 - 0.3, cy - 0.3, e, cx + s * span / 2 + 0.3, cy + 0.3, e + 0.5);
  }
  /* The kasagi, the top beam with its upturned ends, and the nuki below. */
  B.box(m, cx - span / 2 - 1.0, cy - 0.3, e + h - 0.15, cx + span / 2 + 1.0, cy + 0.3, e + h + 0.25, { name: 'kasagi' });
  B.deco('tgInk', cx - span / 2 - 1.2, cy - 0.34, e + h + 0.25, cx + span / 2 + 1.2, cy + 0.34, e + h + 0.45);
  B.box(m, cx - span / 2 - 0.4, cy - 0.17, e + h - 1.35, cx + span / 2 + 0.4, cy + 0.17, e + h - 1.0, { name: 'nuki' });
  B.box(m, cx - 0.15, cy - 0.16, e + h - 1.0, cx + 0.15, cy + 0.16, e + h - 0.15, { name: 'gakuzuka' });
}

function shrine(B) {
  const e = SUMMIT;
  const { x, y0, y1, top } = SHRINE;
  /* The stair up the slope: stone steps, each solid, flanked by low walls. */
  const n = 24;
  for (let k = 0; k < n; k += 1) {
    const ya = y0 + ((y1 - y0) * k) / n;
    const yb = y0 + ((y1 - y0) * (k + 1)) / n;
    const h = e + ((top - e) * (k + 1)) / n;
    B.box('tgStone', x - 1.6, ya, h - 0.6 - ((top - e) / n), x + 1.6, ys(yb), h, { name: 'shrine step' });
  }
  for (const s of [-1, 1]) {
    for (let k = 0; k < 6; k += 1) {
      const ya = y0 + ((y1 - y0) * k) / 6;
      const yb = y0 + ((y1 - y0) * (k + 1)) / 6;
      const h = e + ((top - e) * (k + 1)) / 6;
      B.box('tgStoneDark', x + s * 1.6, ya, e - 0.5, x + s * 2.1, yb, h + 0.5, { name: 'stair wall' });
    }
  }
  /* The ledge, a level stone platform, and the shrine on it: a small
   * hall of dark timber under a copper roof gone green. */
  B.box('tgStone', x - 7, y1, e - 0.5, x + 7, y1 + 9, top, { name: 'shrine ledge' });
  B.box('tgWoodDark', x - 2.2, y1 + 3.5, top, x + 2.2, y1 + 7, top + 2.4, { name: 'shrine' });
  B.box('tgWood', x - 2.6, y1 + 2.6, top, x + 2.6, y1 + 7.4, top + 0.5, { name: 'shrine floor' });
  B.prism('tgRoofCopper', 'x', [[y1 + 1.8, top + 2.3], [y1 + 5.25, top + 4.3], [y1 + 8.7, top + 2.3]], x - 3.2, x + 3.2);
  B.hidden(x - 2.6, y1 + 2.4, top + 2.4, x + 2.6, y1 + 8.1, top + 3.5, 'wall', 'shrine roof');
  B.deco('tgVermilion', x - 2.25, y1 + 3.45, top + 2.0, x + 2.25, y1 + 3.5, top + 2.4);
  B.sign('ema', x, y1 + 3.44, top + 1.3, [0, -1], 1.8, 0.9, 0.02);
  /* The shimenawa rope and its paper over the shrine's front. */
  B.cyl('tgRice', [x - 2.0, y1 + 3.35, top + 2.05], [x + 2.0, y1 + 3.35, top + 2.05], 0.09, 6, null, true);
  for (const s of [-1.2, 0, 1.2]) {
    B.paint('tgPaper', x + s - 0.08, y1 + 3.3, top + 1.55, x + s + 0.08, y1 + 3.32, top + 1.95, true);
  }
  /* Two torii: one at the stair's foot on the car park, one at its top. */
  torii(B, x, TORII.y, e, TORII.span, TORII.h, 'tgVermilion');
  torii(B, x, y1 + 0.8, top, 3.6, 4.0, 'tgVermilion');
  /* Two stone lanterns and a pair of komainu plinths on the ledge. */
  for (const s of [-1, 1]) {
    B.box('tgStone', x + s * 4 - 0.4, y1 + 2.2, top, x + s * 4 + 0.4, y1 + 3, top + 1.1, { name: 'komainu plinth' });
    B.ball('tgStoneDark', x + s * 4, y1 + 2.6, top + 1.45, 0.38);
  }
}

/* A stair's step edge, kept off the grid's drift by rounding. */
function ys(y) {
  return Math.round(y * 1000) / 1000;
}

function lookout(B) {
  const L = LOOKOUT;
  /* The deck on posts over the slope, its railing on three sides. */
  B.box('tgWood', L.x0, L.y0, L.h - 0.3, L.x1, L.y1, L.h, { name: 'lookout deck' });
  for (let x = L.x0 + 0.3; x < L.x1; x += 4) {
    const g = floorAt(x, L.y0 + 0.3);
    B.post('tgWoodDark', x, L.y0 + 0.3, Math.min(g, L.h - 0.4), L.h - 0.3, 0.14, { name: 'lookout post' });
  }
  const rail = (x0, y0, x1, y1) => {
    B.box('tgWoodDark', x0, y0, L.h + 0.95, x1, y1, L.h + 1.08, { name: 'lookout rail' });
    B.deco('tgWoodDark', x0, y0, L.h + 0.45, x1, y1, L.h + 0.52);
  };
  rail(L.x0, L.y0, L.x1, L.y0 + 0.1);
  rail(L.x0, L.y0, L.x0 + 0.1, L.y1);
  rail(L.x1 - 0.1, L.y0, L.x1, L.y1);
  for (let x = L.x0; x <= L.x1 + 1e-6; x += 2) {
    B.box('tgWoodDark', x - 0.06, L.y0, L.h, x + 0.06, L.y0 + 0.1, L.h + 0.95, { name: 'rail post', solid: false });
  }
  /* The coin telescope on its post, looking out over the valley. */
  B.post('tgSteel', 164, L.y0 + 1.2, L.h, L.h + 1.1, 0.06, { name: 'telescope' });
  B.cyl('tgTeal', [164, L.y0 + 1.6, L.h + 1.25], [164, L.y0 + 0.8, L.h + 1.25], 0.16, 8, 0.12);
  B.sign('viewBoard', 172, L.y1 - 0.05, L.h + 1.2, [0, -1], 3.0, 1.2, 0.01);
  B.box('tgWoodDark', 170.4, L.y1 - 0.12, L.h, 173.6, L.y1 - 0.02, L.h + 1.85, { name: 'view board', solid: false });
}

/* ------------------------------------------------------------------ */
/* The roadside                                                        */
/* ------------------------------------------------------------------ */

/* Where the road has its own parapets or no drop beside it: the bridges,
 * the tunnel and its approaches, the rest stop's gates and the shed. */
function railless(x, y) {
  if (Math.abs(x - RED.x) < 8 && y > RED.y0 - 2 && y < RED.y1 + 2) {
    return true;
  }
  if (Math.abs(x - OLD.x) < 8 && y > OLD.y0 - 2 && y < OLD.y1 + 2) {
    return true;
  }
  if (x > TUNNEL.x0 - 6 && x < TUNNEL.x1 + 6 && Math.abs(y - TUNNEL.y) < 10) {
    return true;
  }
  if (x > SHED.x0 - 1 && x < SHED.x1 + 1 && Math.abs(y - SHED.y) < 10) {
    return true;
  }
  return false;
}

/* Whether node k is one of a hairpin's two bends. */
function hairpinOf(k) {
  return HAIRPINS.findIndex(([a, b]) => a === k || b === k);
}

function roadside(B) {
  const line = centre();
  const L = line.length;
  const step = 3;
  /* A guardrail wherever the ground falls away beside the road. */
  for (const side of [1, -1]) {
    let run = [];
    const flush = () => {
      if (run.length > 2) {
        B.rail(run, side);
        for (let k = 0; k + 1 < run.length; k += 1) {
          B.cap('tgRail', [run[k][0], run[k][1], run[k][2] + 0.68], [run[k + 1][0], run[k + 1][1], run[k + 1][2] + 0.68], 0.16, { draw: false, name: 'guardrail' });
        }
        B.furniture(() => {
          for (let k = 0; k < run.length; k += 1) {
            const p = run[k];
            B.turn('tgSteel', p[0], p[1], p[2], [p[3], p[4]], -0.05, -0.05, -0.3, 0.05, 0.05, 0.62);
          }
        });
      }
      run = [];
    };
    for (let s = 0; s < L; s += step) {
      const p = roadPoint(s);
      const nx = -p.ty * side;
      const ny = p.tx * side;
      const off = HALF + 0.9;
      const rx = p.x + nx * off;
      const ry = p.y + ny * off;
      const qx = p.x + nx * 18;
      const qy = p.y + ny * 18;
      const node = line.node[Math.min(line.points.length - 1, Math.round(s))];
      void node;
      const drop = p.h - (inGorge(qx, qy) ? GORGE.floor : floorAt(qx, qy));
      const want = drop > 2.2 && !railless(p.x, p.y) && !inGorge(rx, ry);
      if (want) {
        run.push([rx, ry, p.h, p.tx, p.ty]);
      } else {
        flush();
      }
    }
    flush();
  }
  /* At each hairpin's apex: a curve mirror on the outside, three chevron
   * boards round the bend, and the hairpin's plate before it. */
  HAIRPINS.forEach(([a, b], i) => {
    const [sa] = bendRange(line, a);
    const [, sb] = bendRange(line, b);
    const mid = roadPoint((sa + sb) / 2);
    /* The bend's outside is away from the two nodes' middle. */
    const cx = (NODES[a][0] + NODES[b][0]) / 2;
    const cy = (NODES[a][1] + NODES[b][1]) / 2;
    let ox = mid.x - cx;
    let oy = mid.y - cy;
    const ol = Math.sqrt(ox * ox + oy * oy) || 1;
    ox /= ol;
    oy /= ol;
    void ox;
    void oy;
    const outward = (s) => {
      const p = roadPoint(s);
      /* The outside of the bend is the side the turn is not to. */
      const q = roadPoint(s + 2);
      const cross = p.tx * q.ty - p.ty * q.tx;
      const side = cross > 0 ? -1 : 1;
      return { p, nx: -p.ty * side, ny: p.tx * side };
    };
    const m = outward((sa + sb) / 2);
    const mx = m.p.x + m.nx * (HALF + 2.0);
    const my = m.p.y + m.ny * (HALF + 2.0);
    const g = Math.max(m.p.h, floorAt(mx, my));
    B.post('tgOrange', mx, my, g, g + 3.2, 0.05, { name: 'curve mirror' });
    B.cyl('tgOrange', [mx, my, g + 3.3], [mx - m.nx * 0.12, my - m.ny * 0.12, g + 3.3], 0.46, 16);
    B.cyl('tgMirror', [mx - m.nx * 0.12, my - m.ny * 0.12, g + 3.3], [mx - m.nx * 0.13, my - m.ny * 0.13, g + 3.3], 0.4, 16);
    for (const f of [0.22, 0.5, 0.78]) {
      const c = outward(sa + (sb - sa) * f);
      const bx = c.p.x + c.nx * (HALF + 1.5);
      const by = c.p.y + c.ny * (HALF + 1.5);
      const gb = Math.max(c.p.h, floorAt(bx, by));
      B.post('tgSteel', bx, by, gb, gb + 1.9, 0.04, { name: 'chevron post' });
      B.sign('chevron', bx - c.nx * 0.06, by - c.ny * 0.06, gb + 1.55, [-c.nx, -c.ny], 0.9, 0.6, 0.0);
    }
    /* The plate, 30 m before the bend in the direction it is climbed, on
     * the inside of the road so it is read on the way in. */
    for (const dir of [-1, 1]) {
      const sp = dir < 0 ? sa - 26 : sb + 26;
      const p = roadPoint(sp);
      const side = dir < 0 ? 1 : -1;
      const nx = -p.ty * side;
      const ny = p.tx * side;
      const px0 = p.x + nx * (HALF + 1.3);
      const py0 = p.y + ny * (HALF + 1.3);
      if (railless(px0, py0)) {
        continue;
      }
      const gp = floorAt(px0, py0);
      B.post('tgSteel', px0, py0, gp, gp + 2.3, 0.04, { name: 'hairpin plate post' });
      B.sign(`hairpin${i + 1}`, px0, py0, gp + 2.0, [p.tx * -dir, p.ty * -dir], 0.7, 0.9, 0.04);
    }
  });
  /* Delineators every 24 m on both edges, where there is no rail, and the
   * speed and bend signs. */
  B.furniture(() => {
    for (let s = 6; s < L; s += 24) {
      const p = roadPoint(s);
      for (const side of [1, -1]) {
        const nx = -p.ty * side;
        const ny = p.tx * side;
        const x = p.x + nx * (HALF + 0.6);
        const y = p.y + ny * (HALF + 0.6);
        if (railless(x, y) || inGorge(x, y)) {
          continue;
        }
        const g = floorAt(x, y);
        if (Math.abs(g - p.h) > 0.5) {
          continue;
        }
        B.turn('tgPaper', x, y, g, [p.tx, p.ty], -0.04, -0.04, 0, 0.04, 0.04, 1.0);
        B.turn('tgOrange', x, y, g, [p.tx, p.ty], -0.05, -0.05, 0.82, 0.05, 0.05, 0.96);
      }
    }
  });
  for (const [s0, key] of [[30, 'speed40'], [240, 'bendWarn'], [700, 'speed40'], [1080, 'bendWarn'], [1420, 'speed40']]) {
    const p = roadPoint(s0);
    const x = p.x - p.ty * (HALF + 1.4);
    const y = p.y + p.tx * (HALF + 1.4);
    if (railless(x, y) || inGorge(x, y)) {
      continue;
    }
    const g = floorAt(x, y);
    B.post('tgSteel', x, y, g, g + 2.6, 0.04, { name: 'sign post' });
    B.sign(key, x, y, g + 2.2, [-p.tx, -p.ty], 0.7, 0.7, 0.04);
  }
}

/* ------------------------------------------------------------------ */
/* The hamlet and the fields                                           */
/* ------------------------------------------------------------------ */

/* The farmhouses: { x, y, w, d, face } on the valley floor, each a
 * timber and plaster house under a hipped tile roof, facing the road. */
export const HOUSES = [
  { x: 150, y: 28, w: 12, d: 9 },
  { x: 176, y: 30, w: 10, d: 8 },
  { x: 236, y: 26, w: 13, d: 9 },
  { x: 262, y: 32, w: 9, d: 8 },
  { x: 336, y: 34, w: 12, d: 9 },
];

function farmhouse(B, hs, k) {
  const { x, y, w, d } = hs;
  const h = 3.0;
  const wall = k % 2 ? 'tgPlaster' : 'tgWood';
  B.box(wall, x, y, 0, x + w, y + d, h, { name: 'farmhouse' });
  /* The timber frame showing on the front, and the sliding doors. */
  for (let px = x; px <= x + w + 1e-6; px += 1.8) {
    B.paint('tgWoodDark', px - 0.08, y + d, 0, px + 0.08, y + d + 0.03, h, true);
  }
  B.paint('tgWoodDark', x, y + d, h - 0.35, x + w, y + d + 0.03, h - 0.2, true);
  B.paint('tgShoji', x + w * 0.3, y + d, 0.2, x + w * 0.7, y + d + 0.02, 2.0);
  /* The engawa, the veranda boards along the front. */
  B.box('tgWood', x, y + d, 0, x + w, y + d + 1.1, 0.45, { name: 'engawa', cast: false });
  /* The roof: hipped, deep eaves, dark tiles. A prism one way and the two
   * hips as half prisms the other. */
  const rh = h;
  const o = 1.0;
  B.prism('tgRoofTile', 'x', [[y - o, rh - 0.1], [y + d / 2, rh + 2.8], [y + d + o, rh - 0.1]], x + d / 2 - o * 0.2, x + w - d / 2 + o * 0.2);
  B.prism('tgRoofTile', 'y', [[x - o, rh - 0.1], [x + d / 2, rh + 2.8], [x + d / 2 + 0.01, rh - 0.1]], y - o * 0.4, y + d + o * 0.4);
  B.prism('tgRoofTile', 'y', [[x + w - d / 2 - 0.01, rh - 0.1], [x + w - d / 2, rh + 2.8], [x + w + o, rh - 0.1]], y - o * 0.4, y + d + o * 0.4);
  B.hidden(x - 0.5, y - 0.5, rh - 0.1, x + w + 0.5, y + d + 0.5, rh + 1.2, 'wall', 'farmhouse roof');
  B.hidden(x + 1.5, y + 1.5, rh + 1.2, x + w - 1.5, y + d - 1.5, rh + 2.1, 'wall', 'farmhouse roof');
}

/* The rice fields west of the old bridge's road, and the racks. */
export const FIELDS = { x0: 24, x1: 108, y0: 24, y1: 92 };

function fields(B) {
  const F = FIELDS;
  /* The dikes between the paddies, a low grassy bank. */
  for (let x = F.x0; x <= F.x1 + 1e-6; x += 21) {
    B.deco('tgVerge', x - 0.4, F.y0, 0, x + 0.4, F.y1, 0.35);
  }
  for (let y = F.y0; y <= F.y1 + 1e-6; y += 17) {
    B.deco('tgVerge', F.x0, y - 0.4, 0, F.x1, y + 0.4, 0.35);
  }
  /* The drying racks, hasagi: poles and rails with the cut rice hung over
   * them, golden, in rows along the paddies. Solid as one box each, since
   * a rack of rice is a wall to a quad. */
  for (const [x0, x1, y] of [[30, 48, 40], [54, 72, 58], [78, 98, 40], [32, 50, 76], [80, 100, 76]]) {
    B.box('tgRice', x0, y - 0.3, 0.5, x1, y + 0.3, 1.9, { name: 'drying rack' });
    for (let x = x0; x <= x1 + 1e-6; x += 3) {
      B.post('tgWoodDark', x, y, 0, 2.3, 0.05, { name: 'rack pole', solid: false });
    }
    B.deco('tgWoodDark', x0, y - 0.05, 2.0, x1, y + 0.05, 2.1);
  }
  /* A scarecrow, kakashi. */
  B.post('tgWoodDark', 64, 84, 0, 1.9, 0.04, { name: 'scarecrow', solid: false });
  B.cyl('tgIndigo', [64, 84, 0.9], [64, 84, 1.55], 0.22, 6, 0.16);
  B.cone('tgRice', 64, 84, 1.7, 0.42, 0.26, 10);
}

function hamlet(B) {
  HOUSES.forEach((hs, k) => farmhouse(B, hs, k));
  /* The bus stop by the valley road: a timber shelter with a bench. */
  const bx = 214;
  const by = VALLEY_Y - HALF - 3.6;
  B.box('tgWoodDark', bx - 2.5, by - 1.2, 0, bx + 2.5, by - 1.0, 2.4, { name: 'bus shelter' });
  B.box('tgRoofTile', bx - 2.8, by - 1.4, 2.4, bx + 2.8, by + 0.9, 2.6, { name: 'bus shelter roof' });
  for (const s of [-1, 1]) {
    B.post('tgWoodDark', bx + s * 2.4, by + 0.7, 0, 2.4, 0.07, { name: 'bus shelter post' });
  }
  B.box('tgWood', bx - 2, by - 0.9, 0.42, bx + 2, by - 0.5, 0.5, { name: 'bench', solid: false });
  B.post('tgSteel', bx + 3.3, by + 1.6, 0, 2.2, 0.04, { name: 'bus stop sign' });
  B.sign('busStop', bx + 3.3, by + 1.6, 2.15, [0, 1], 0.55, 0.55, 0.0);
  B.cyl('tgSteel', [bx + 3.3, by + 1.6, 0], [bx + 3.3, by + 1.6, 0.1], 0.22, 8);
}

/* ------------------------------------------------------------------ */

/*
 * THE NAMED GAPS, each { name, x, y, deg, w, h0, h1, points }: the foot of
 * its window's middle in the plan, the heading it is flown along in whole
 * degrees (0 east, 90 north), its clear width and the bottom and top of its
 * clear height, inside the opening by more than the craft's radius.
 */
export function gaps() {
  const e = SUMMIT;
  const shedS = nearest((SHED.x0 + SHED.x1) / 2, SHED.y, 10).s;
  const shedE = heightAt(shedS);
  const mid = (GORGE.y0 + GORGE.y1) / 2;
  return [
    { name: 'THE TUNNEL', x: (TUNNEL.x0 + TUNNEL.x1) / 2 + 6, y: TUNNEL.y, deg: 0, w: TUNNEL.w - 2 * M, h0: e + M, h1: e + TUNNEL.h - 1.45 - M, points: 500 },
    { name: 'UNDER THE RED BRIDGE', x: RED.x, y: mid, deg: 0, w: 15, h0: GORGE.floor + 1.2, h1: archAt(mid + 7.5) - 0.42 - M, points: 1000 },
    { name: 'THE OLD PIERS', x: OLD.x, y: mid, deg: 0, w: OLD.piers[1] - OLD.piers[0] - 2 - 2 * M, h0: GORGE.floor + 1.2, h1: -1.5 - M, points: 500 },
    { name: 'UNDER THE FOOTBRIDGE', x: FOOT.x, y: mid, deg: 0, w: 22, h0: GORGE.floor + 1.2, h1: FOOT.deck - 1.2 - 0.12 - M, points: 250 },
    { name: 'ROCK SHED', x: (SHED.x0 + SHED.x1) / 2, y: SHED.y, deg: 0, w: 2 * HALF - 2 * M, h0: shedE + 0.8, h1: shedE + 5.2, points: 500 },
    { name: 'TORII', x: TORII.x, y: TORII.y, deg: 90, w: TORII.span - 0.44 - 2 * M, h0: e + M, h1: e + TORII.h - 1.35 - M, points: 250 },
    { name: 'SHRINE GATE', x: SHRINE.x, y: SHRINE.y1 + 0.8, deg: 90, w: 3.6 - 0.44 - 2 * M, h0: SHRINE.top + M, h1: SHRINE.top + 4.0 - 1.35 - M, points: 500 },
  ];
}

/* Everything built, once. */
let BUILT = null;
export function places() {
  if (!BUILT) {
    const B = new Build();
    gorge(B);
    redBridge(B);
    oldBridge(B);
    footbridge(B);
    tunnel(B);
    shed(B);
    restStop(B);
    shrine(B);
    lookout(B);
    roadside(B);
    hamlet(B);
    fields(B);
    B.trees = plantTrees(B, HOUSES, FIELDS, [
      { x0: TEA.x0 - 3, x1: TEA.x1 + 3, y0: TEA.y0 - 5, y1: TEA.y1 + 3 },
      { x0: FOOT.x - 4, x1: FOOT.x + 4, y0: FOOT.y0 - 4, y1: FOOT.y1 + 4 },
      { x0: 205, x1: 224, y0: VALLEY_Y - 12, y1: VALLEY_Y - 2 },
    ]);
    BUILT = B;
  }
  return BUILT;
}

export { BENCH, hash2 };
