/*
 * market.js: the winter illumination market, east of the balloon field. A
 * gate off the car park, a tunnel of lit arches, a lane of wooden chalet
 * stalls under strings of lights with their roofs under the first snow,
 * and a plaza at the north end with a lit fir, a carousel, a stage and a
 * row of kitchen cars.
 *
 * THE MARKET IS A LINE TOO. The tunnel is a straight 4.6 m bore of arches
 * 33 m long; the lane is twelve metres wide under the lights; between
 * every three stalls is a two metre gap to the backs, a slot a five inch
 * takes sideways out of the lane; and the carousel's roof and the stage's
 * roof are both something to fly under. Stalls are 3 m along the lane and
 * 2 m deep, the size a Christmas market's chalet is, and their counters
 * stand at a metre.
 *
 * THE LIGHTS are strings (T.strings): a cable sagging between two points
 * and a bulb every so often along it. ./index.js draws the cable and a
 * glowing line along it on every preset, and the bulbs themselves on
 * Medium and High. Nothing of a string is solid.
 *
 * Every word on a sign is the market's own, in Japanese with a little
 * English, and names no brand (./signs.js).
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

import { rng } from './frame.js';
import { sincos } from '../../props/trig.js';

/* The market's ground, its lane, and the lane's middle. */
export const MARKET = { x0: 470, x1: 620, y0: 116, y1: 420 };
export const LANE = { x0: 539, x1: 551, cx: 545 };

/* The gate, and the tunnel of arches behind it. */
export const GATE = { py: 121, half: 4.5, h: 5.6 };
export const TUNNEL = { y0: 126, y1: 159, half: 2.3, spring: 2.1, n: 12 };

/* The stalls: groups of three, 3 m along the lane and 2 m deep, with a
 * two metre gap between groups. */
export const STALL = { w: 3, d: 2, eave: 2.3, ridge: 3.25, counter: 1.0 };
export const ROWS = { y0: 166, groups: 12, gap: 2 };
const GROUP = 3 * STALL.w + ROWS.gap;

/* The plaza's pieces. */
export const TREE = { px: 545, py: 362, h: 17 };
export const CAROUSEL = { px: 596, py: 338, r: 6, roof: 5.2 };
export const STAGE = { x0: 488, x1: 496, y0: 352, y1: 372, deck: 1.0, roof: 5.6 };

/* The y of group g's south end. */
export const groupY = (g) => ROWS.y0 + g * GROUP;

/* The stalls' goods, one a stall in order down the west row and then the
 * east, each a key in ./signs.js. */
export const GOODS = [
  'jaga', 'corn', 'cocoa', 'oden', 'ramen', 'crepe', 'imo', 'milk', 'cheese', 'butadon', 'soft', 'amazake',
  'candle', 'glass', 'wood', 'yarn', 'mittens', 'ornament', 'salmon', 'mochi', 'honey', 'tea', 'bread', 'soup',
];

/* A string of lights from a to b, plan [px, py, h], sagging `sag`, a bulb
 * every `step` metres. */
function string(T, m, a, b, sag, step = 0.5) {
  T.strings.push({ m, a, b, sag, step });
}

/*
 * ONE GROUP OF THREE STALLS, its front on the lane at `fx`, its back `s`
 * metres the other way (s = -1 for the west row, whose backs are west),
 * from py y to y + 9. Timber walls and back, three counters, a roof under
 * snow overhanging the lane, a painted name board over each opening.
 */
function stallGroup(T, fx, y, s, goods, r) {
  const bx = fx + s * STALL.d;
  const y1 = y + 3 * STALL.w;
  const lo = Math.min(fx, bx);
  const hi = Math.max(fx, bx);
  /* The back wall, and the walls at each end and between the stalls. */
  T.box('kzChalet', s < 0 ? lo : hi - 0.12, y, 0, s < 0 ? lo + 0.12 : hi, y1, STALL.eave, { name: 'stall back' });
  for (let k = 0; k <= 3; k += 1) {
    const wy = y + k * STALL.w;
    T.box('kzChalet', lo, Math.max(y, wy - 0.06), 0, hi, Math.min(y1, wy + 0.06), STALL.eave, { name: 'stall wall' });
  }
  /* The plinth under the counters, the counters, and each stall's name. */
  for (let k = 0; k < 3; k += 1) {
    const sy = y + k * STALL.w;
    const cx0 = s < 0 ? hi - 0.55 : lo;
    const cx1 = s < 0 ? hi : lo + 0.55;
    T.box('kzChaletDark', cx0, sy + 0.06, 0, cx1, sy + STALL.w - 0.06, STALL.counter - 0.06, { name: 'counter' });
    T.deco('kzWood', cx0 - 0.05, sy + 0.06, STALL.counter - 0.06, cx1 + 0.05, sy + STALL.w - 0.06, STALL.counter);
    /* The name board over the opening, on the lane face. */
    T.sign(goods[k], fx + s * -0.03, sy + STALL.w / 2, STALL.eave - 0.22, 2.4, 0.42, s < 0 ? 'e' : 'w');
    /* What is sold, set out on the counter and the shelves behind it. */
    T.dress(() => {
      const ware = r.pick(['kzRed', 'kzYellow', 'kzCream', 'kzOrange', 'kzGreen', 'kzBlue', 'kzPink']);
      for (let i = 0; i < 5; i += 1) {
        const wy = sy + 0.35 + i * 0.5;
        T.box(i % 2 ? ware : 'kzCream', (cx0 + cx1) / 2 - 0.12, wy, STALL.counter, (cx0 + cx1) / 2 + 0.12, wy + 0.3, STALL.counter + 0.12 + 0.08 * (i % 3));
      }
      const shelf = s < 0 ? lo + 0.3 : hi - 0.3;
      for (const sh of [1.2, 1.65]) {
        T.box('kzWood', shelf - 0.2, sy + 0.2, sh, shelf + 0.2, sy + STALL.w - 0.2, sh + 0.04);
        for (let i = 0; i < 4; i += 1) {
          T.box(r.pick(['kzRed', 'kzYellow', 'kzCream', 'kzOrange', 'kzGreen']), shelf - 0.12, sy + 0.4 + i * 0.6, sh + 0.04, shelf + 0.12, sy + 0.7 + i * 0.6, sh + 0.28);
        }
      }
      /* A lantern by the opening. */
      T.bead('kzLantern', fx - s * 0.1, sy + 0.25, STALL.eave - 0.45, 0.13);
    });
  }
  /* The roof: a gable along the row, snow on it, overhanging the lane by
   * 0.8 m and the back by 0.2, solid as steps inside it. */
  const front = fx - s * 0.8;
  const back = bx + s * 0.2;
  const mid = (front + back) / 2;
  T.prism('kzChaletDark', 'y', [[front, STALL.eave - 0.12], [mid, STALL.ridge - 0.12], [back, STALL.eave - 0.12], [back, STALL.eave - 0.24], [mid, STALL.ridge - 0.24], [front, STALL.eave - 0.24]], y - 0.25, y1 + 0.25);
  T.prism('kzSnow', 'y', [[front - s * 0.04, STALL.eave - 0.13], [mid, STALL.ridge - 0.11], [back + s * 0.04, STALL.eave - 0.13], [back + s * 0.04, STALL.eave - 0.02], [mid, STALL.ridge + 0.05], [front - s * 0.04, STALL.eave - 0.02]], y - 0.28, y1 + 0.28);
  for (let k = 0; k < 3; k += 1) {
    const f = (k + 1) / 3;
    const h0 = STALL.eave + ((STALL.ridge - STALL.eave) * k) / 3 - 0.2;
    const h1 = STALL.eave + (STALL.ridge - STALL.eave) * f - 0.25;
    const half = (Math.abs(back - front) / 2) * (1 - f) + 0.15;
    T.hidden(mid - half, y - 0.2, h0, mid + half, y1 + 0.2, h1, 'wall', 'stall roof');
  }
  /* Bunting under the eaves at the front: a string of small flags. */
  T.dress(() => {
    for (let i = 0; i < 18; i += 1) {
      const fy = y + 0.25 + i * 0.5;
      T.box(i % 3 === 0 ? 'kzRed' : i % 3 === 1 ? 'kzCream' : 'kzGreen', front + s * 0.05, fy, STALL.eave - 0.55, front + s * 0.08, fy + 0.25, STALL.eave - 0.25);
    }
  });
  /* A string of warm bulbs along the eave. */
  string(T, 'kzBulb', [front, y - 0.2, STALL.eave - 0.2], [front, y1 + 0.2, STALL.eave - 0.2], 0.12, 0.45);
}

/*
 * THE TUNNEL OF ARCHES: twelve steel hoops on posts, every 3 m, each
 * wound with bulbs, ice blue and gold in turn. Each hoop is solid as six
 * short capsules round its half circle, inside its drawn bar.
 */
function tunnel(T) {
  const Tn = TUNNEL;
  const cx = LANE.cx;
  const SC = { s: 0, c: 1 };
  for (let i = 0; i < Tn.n; i += 1) {
    const y = Tn.y0 + 1 + (i * (Tn.y1 - Tn.y0 - 2)) / (Tn.n - 1);
    for (const sx of [-1, 1]) {
      T.post('kzWhite', cx + sx * Tn.half, y, 0, Tn.spring, 0.06, { name: 'arch post' });
    }
    T.torus('kzWhite', cx, y, Tn.spring, Tn.half, 0.05, 0, 1, 5, 24, null);
    /* The hoop's solid, six capsules on its half circle. */
    let prev = null;
    for (let k = 0; k <= 6; k += 1) {
      sincos((k * Math.PI) / 6, SC);
      const p = [cx + Tn.half * SC.c, y, Tn.spring + Tn.half * SC.s];
      if (prev) {
        T.cap('kzWhite', prev, p, 0.05, { draw: false, name: 'arch' });
      }
      prev = p;
    }
    /* The bulbs on the hoop, as a string round it in short pieces. */
    const m = i % 2 ? 'kzBulbIce' : 'kzBulbGold';
    for (let k = 0; k < 12; k += 1) {
      sincos((k * Math.PI) / 12, SC);
      const a = [cx + (Tn.half + 0.07) * SC.c, y, Tn.spring + (Tn.half + 0.07) * SC.s];
      sincos(((k + 1) * Math.PI) / 12, SC);
      const b = [cx + (Tn.half + 0.07) * SC.c, y, Tn.spring + (Tn.half + 0.07) * SC.s];
      string(T, m, a, b, 0, 0.3);
    }
    for (const sx of [-1, 1]) {
      string(T, m, [cx + sx * (Tn.half + 0.08), y, 0.3], [cx + sx * (Tn.half + 0.08), y, Tn.spring], 0, 0.3);
    }
  }
  /* Lit runners along the tunnel's floor, either side. */
  T.dress(() => T.wide(() => {
    T.paint('kzStone', cx - Tn.half - 0.3, Tn.y0, 0.006, cx + Tn.half + 0.3, Tn.y1, 0.014);
  }));
  for (const sx of [-1, 1]) {
    string(T, 'kzBulbIce', [cx + sx * (Tn.half - 0.2), Tn.y0 + 0.5, 0.05], [cx + sx * (Tn.half - 0.2), Tn.y1 - 0.5, 0.05], 0, 0.6);
  }
}

/* The gate off the car park: two log posts, a beam and a roof, and the
 * market's name on a board under the beam. */
function gate(T) {
  const { py, half, h } = GATE;
  const cx = LANE.cx;
  for (const sx of [-1, 1]) {
    T.post('kzWoodDark', cx + sx * half, py, 0, h, 0.22, { name: 'gate post' });
    T.ball('kzLantern', cx + sx * half, py - 0.35, h - 1.6, 0.28);
  }
  T.box('kzWoodDark', cx - half - 0.6, py - 0.25, h - 0.55, cx + half + 0.6, py + 0.25, h - 0.1, { name: 'gate beam' });
  T.prism('kzChaletDark', 'x', [[py - 0.9, h - 0.12], [py, h + 0.7], [py + 0.9, h - 0.12], [py + 0.9, h - 0.25], [py, h + 0.57], [py - 0.9, h - 0.25]], cx - half - 1.0, cx + half + 1.0);
  T.prism('kzSnow', 'x', [[py - 0.94, h - 0.12], [py, h + 0.74], [py + 0.94, h - 0.12], [py + 0.94, h - 0.02], [py, h + 0.84], [py - 0.94, h - 0.02]], cx - half - 1.04, cx + half + 1.04);
  T.hidden(cx - half - 0.9, py - 0.5, h - 0.1, cx + half + 0.9, py + 0.5, h + 0.5, 'wall', 'gate roof');
  T.sign('marketGate', cx, py - 0.27, h - 1.15, 6.6, 1.0, 's');
  T.box('kzWood', cx - 3.4, py - 0.05, h - 1.7, cx + 3.4, py + 0.05, h - 0.55, { name: 'gate board' });
  string(T, 'kzBulbGold', [cx - half - 0.6, py - 0.3, h - 0.6], [cx + half + 0.6, py - 0.3, h - 0.6], 0.5, 0.4);
  T.take(cx - half, py, 0.8);
  T.take(cx + half, py, 0.8);
}

/*
 * THE FIR at the plaza's middle: a trunk, four tiers of branches, a star,
 * and a spiral of lights wound round it. Solid like the town's pines: a
 * capsule up the tiers' middle and a ball in the skirt of each tier.
 */
function fir(T) {
  const { px, py, h } = TREE;
  T.post('kzBark', px, py, 0, 3.0, 0.4, { name: 'fir trunk' });
  const tiers = [[2.2, 6.4, 5.4], [5.6, 5.0, 4.6], [8.8, 3.8, 4.4], [12.0, 2.5, 4.6]];
  for (const [base, r, ht] of tiers) {
    T.cone('kzFir', px, py, base, r, ht, 12);
    /* The largest ball the tier holds, on its base and touching its slope. */
    const sinA = r / Math.hypot(r, ht);
    const rin = (ht * sinA) / (1 + sinA);
    T.cap('kzFir', [px, py, base + rin], [px, py, base + rin], rin * 0.9, { draw: false, name: 'canopy', kind: 'canopy' });
  }
  T.cap('kzFir', [px, py, 3.0], [px, py, h - 1.8], 0.9, { draw: false, name: 'canopy', kind: 'canopy' });
  /* The star. */
  T.ball('kzBulbGold', px, py, h - 0.2, 0.55);
  T.cone('kzBulbGold', px, py, h - 0.6, 0.18, 1.6, 5);
  /* The spiral, in pieces a quarter turn long, from the skirt to the top. */
  const SC = { s: 0, c: 1 };
  const turns = 5;
  const steps = turns * 8;
  let prev = null;
  for (let k = 0; k <= steps; k += 1) {
    const f = k / steps;
    const hh = 2.6 + f * (h - 3.6);
    /* The radius at this height: the tiers' slope, a little outside it. */
    let rr = 0.6;
    for (const [base, r, ht] of tiers) {
      if (hh >= base && hh <= base + ht) {
        rr = Math.max(rr, r * (1 - (hh - base) / ht) + 0.15);
      }
    }
    sincos((k * Math.PI) / 4, SC);
    const p = [px + rr * SC.c, py + rr * SC.s, hh];
    if (prev) {
      string(T, k % 16 < 8 ? 'kzBulbGold' : 'kzBulb', prev, p, 0, 0.35);
    }
    prev = p;
  }
  /* A ring of lit snowballs round its foot. */
  T.dress(() => {
    for (let k = 0; k < 12; k += 1) {
      sincos((k * Math.PI) / 6, SC);
      T.bead('kzSnow', px + 7.2 * SC.c, py + 7.2 * SC.s, 0.35, 0.4);
    }
  });
  T.take(px, py, 7.5);
}

/*
 * THE CAROUSEL: a platform, a centre drum, a roof cone on a ring of brass
 * poles, and horses on the poles. Only the platform, the drum and the
 * roof are solid; a pilot threads the poles under the roof.
 */
function carousel(T) {
  const { px, py, r, roof } = CAROUSEL;
  T.disc('kzWood', px, py, r, 0, 0.45, 24);
  T.disc('kzRed', px, py, r + 0.08, 0.3, 0.42, 24);
  /* The platform's solid, a cross of two boxes inside the disc. */
  const a = r * 0.92;
  const b = r * 0.38;
  T.hidden(px - a, py - b, 0, px + a, py + b, 0.45, 'wall', 'carousel deck');
  T.hidden(px - b, py - a, 0, px + b, py + a, 0.45, 'wall', 'carousel deck');
  T.post('kzCream', px, py, 0.45, roof, 1.0, { name: 'carousel drum' });
  T.disc('kzRed', px, py, 1.08, 2.0, 2.6, 16);
  T.disc('kzYellow', px, py, 1.08, 3.6, 4.2, 16);
  /* The roof: a cone of red and cream, its valance and a flag. */
  T.disc('kzRed', px, py, r + 0.4, roof, roof + 0.55, 24);
  T.cone('kzCream', px, py, roof + 0.55, r + 0.4, 2.6, 16);
  T.post('kzIron', px, py, roof + 3.0, roof + 4.2, 0.04, { solid: false });
  T.deco('kzRed', px, py - 0.02, roof + 3.6, px + 0.9, py + 0.02, roof + 4.1);
  for (let k = 0; k < 3; k += 1) {
    const f = (k + 1) / 3;
    const rr = (r + 0.2) * (1 - f * 0.85) * 0.7;
    T.hidden(px - rr, py - rr, roof + (2.6 * k) / 3, px + rr, py + rr, roof + 0.55 + (2.6 * f) * 0.9, 'wall', 'carousel roof');
  }
  T.hidden(px - (r + 0.3) * 0.7, py - (r + 0.3) * 0.7, roof, px + (r + 0.3) * 0.7, py + (r + 0.3) * 0.7, roof + 0.55, 'wall', 'carousel roof');
  /* The poles and their horses, in two rings. */
  const SC = { s: 0, c: 1 };
  const colours = ['kzCream', 'kzWhite', 'kzWicker', 'kzPink'];
  for (let k = 0; k < 16; k += 1) {
    const ring = k % 2 ? 4.8 : 3.4;
    sincos((k * Math.PI) / 8, SC);
    const hx = px + ring * SC.c;
    const hy = py + ring * SC.s;
    T.post('kzYellow', hx, hy, 0.45, roof, 0.035, { solid: false });
    const lift = 1.2 + 0.3 * (k % 3);
    /* A horse: a body, a neck and head, legs out, along the ring. */
    sincos((k * Math.PI) / 8 + Math.PI / 2, SC);
    const tx = SC.c;
    const ty = SC.s;
    const col = colours[k % colours.length];
    T.cap(col, [hx - tx * 0.45, hy - ty * 0.45, lift], [hx + tx * 0.35, hy + ty * 0.35, lift], 0.2, { solid: false, look: 'capsule' });
    T.cap(col, [hx + tx * 0.35, hy + ty * 0.35, lift + 0.05], [hx + tx * 0.6, hy + ty * 0.6, lift + 0.5], 0.1, { solid: false });
    T.cap(col, [hx + tx * 0.6, hy + ty * 0.6, lift + 0.5], [hx + tx * 0.85, hy + ty * 0.85, lift + 0.45], 0.1, { solid: false, look: 'capsule' });
    T.box('kzRed', hx - 0.12, hy - 0.12, lift + 0.15, hx + 0.12, hy + 0.12, lift + 0.24, { solid: false });
  }
  /* Bulbs round the valance. */
  for (let k = 0; k < 24; k += 1) {
    sincos((k * Math.PI) / 12, SC);
    const a2 = [px + (r + 0.45) * SC.c, py + (r + 0.45) * SC.s, roof + 0.3];
    sincos(((k + 1) * Math.PI) / 12, SC);
    const b2 = [px + (r + 0.45) * SC.c, py + (r + 0.45) * SC.s, roof + 0.3];
    string(T, k % 2 ? 'kzBulbPink' : 'kzBulbGold', a2, b2, 0, 0.4);
  }
  T.take(px, py, r + 0.6);
}

/* The stage: a deck, a back wall with a painted backdrop, a roof on four
 * posts, and a truss of lights under it. Open to the east and both ends. */
function stage(T) {
  const { x0, x1, y0, y1, deck, roof } = STAGE;
  T.box('kzWoodDark', x0, y0, 0, x1, y1, deck, { name: 'stage deck' });
  T.deco('kzWood', x0, y0, deck - 0.02, x1, y1, deck + 0.02);
  T.box('kzNavy', x0, y0, deck, x0 + 0.2, y1, roof, { name: 'stage back' });
  T.sign('stageBack', x0 + 0.22, (y0 + y1) / 2, deck + 2.3, 9.0, 2.6, 'e');
  for (const y of [y0 + 0.2, y1 - 0.2]) {
    T.post('kzIron', x1 - 0.2, y, deck, roof, 0.1, { name: 'stage post' });
  }
  T.box('kzIron', x0, y0 - 0.3, roof, x1 + 0.3, y1 + 0.3, roof + 0.35, { name: 'stage roof' });
  T.box('kzRed', x1 + 0.28, y0 - 0.3, roof - 0.5, x1 + 0.34, y1 + 0.3, roof + 0.35, { solid: false });
  /* The truss under the roof, its lamps, and the steps up at the south. */
  T.cyl('kzSteel', [x1 - 0.6, y0, roof - 0.4], [x1 - 0.6, y1, roof - 0.4], 0.08, 6);
  for (let y = y0 + 1.5; y < y1 - 1; y += 2.5) {
    T.cyl('kzIron', [x1 - 0.6, y, roof - 0.48], [x1 - 0.2, y, roof - 1.0], 0.16, 8);
    T.disc('kzBulb', x1 - 0.12, y, 0.12, roof - 1.12, roof - 1.06, 8);
  }
  T.box('kzWood', x1, y0 - 1.6, 0, x1 - 1.4, y0, 0.5, { name: 'stage step' });
  T.take((x0 + x1) / 2, (y0 + y1) / 2, 10);
}

/* A kitchen car: a small van with its side open as a counter and an
 * awning out over it, facing south. */
function kitchenCar(T, px, py, colour, sign) {
  T.box(colour, px - 2.2, py - 0.9, 0.45, px + 2.2, py + 0.9, 2.6, { name: 'kitchen car' });
  T.box('kzWhite', px - 2.2, py - 0.9, 2.6, px + 1.0, py + 0.9, 2.75, { name: 'kitchen car' });
  T.box('kzGlassDark', px + 1.3, py - 0.92, 1.4, px + 2.15, py + 0.92, 2.2, { solid: false });
  T.box('kzCream', px - 1.8, py - 0.95, 1.05, px + 0.8, py - 0.9, 1.15, { solid: false });
  T.box('kzGlass', px - 1.8, py - 0.93, 1.2, px + 0.8, py - 0.9, 2.2, { solid: false });
  T.prism(colour === 'kzRed' ? 'kzCream' : 'kzRed', 'x', [[py - 0.9, 2.6], [py - 2.3, 2.15], [py - 2.3, 2.05], [py - 0.9, 2.5]], px - 2.0, px + 0.9);
  T.sign(sign, px - 0.5, py - 0.93, 2.42, 2.4, 0.32, 's');
  for (const wx of [px - 1.4, px + 1.4]) {
    T.cyl('kzTyre', [wx, py - 0.95, 0.38], [wx, py + 0.95, 0.38], 0.38, 10);
  }
  T.take(px, py, 3);
}

export function market(T) {
  const r = rng(5207);
  const { x0, x1, y0, y1 } = MARKET;
  /* The market's ground: packed snow and gravel, and the lane's paving. */
  T.dress(() => T.wide(() => {
    T.paint('kzSnow', x0, y0, 0.004, x1, y1, 0.009);
    T.paint('kzStone', LANE.x0, ROWS.y0 - 4, 0.009, LANE.x1, 300, 0.014);
    T.paint('kzStone', 488, 302, 0.009, 612, 416, 0.014);
  }));
  gate(T);
  tunnel(T);
  /* The two rows, each group's three stalls, and the strings across the
   * lane between the groups: one straight across and one zigzag. */
  let n = 0;
  for (let g = 0; g < ROWS.groups; g += 1) {
    const y = groupY(g);
    stallGroup(T, LANE.x0, y, -1, [GOODS[n % GOODS.length], GOODS[(n + 1) % GOODS.length], GOODS[(n + 2) % GOODS.length]], r);
    n += 3;
    stallGroup(T, LANE.x1, y, 1, [GOODS[n % GOODS.length], GOODS[(n + 1) % GOODS.length], GOODS[(n + 2) % GOODS.length]], r);
    n += 3;
    /* A mast at each group's middle stall, on the lane side, and the
     * strings across. */
    const my = y + 1.5 * STALL.w;
    for (const sx of [LANE.x0 + 0.15, LANE.x1 - 0.15]) {
      T.post('kzIron', sx, my, 0, 5.4, 0.05, { name: 'light mast' });
      T.take(sx, my, 0.4);
    }
    string(T, g % 2 ? 'kzBulbGold' : 'kzBulb', [LANE.x0 + 0.15, my, 5.3], [LANE.x1 - 0.15, my, 5.3], 0.7, 0.45);
    if (g + 1 < ROWS.groups) {
      const ny = my + GROUP;
      string(T, 'kzBulbPink', [LANE.x0 + 0.15, my, 5.25], [LANE.x1 - 0.15, ny, 5.25], 0.9, 0.5);
      string(T, 'kzBulbIce', [LANE.x1 - 0.15, my, 5.25], [LANE.x0 + 0.15, ny, 5.25], 0.9, 0.5);
    }
  }
  /* Behind the west row: the stallholders' vans, crates and the
   * generator; behind the east row, tables and braziers. */
  for (let i = 0; i < 6; i += 1) {
    T.asset({ type: 'car', style: r.pick(['keivan', 'kei', 'van']), dims: { variant: r.int(1, 12) } }, 1, 522, 176 + i * 21, 0, Math.PI / 2);
  }
  T.box('kzTractorGreen', 505, 300, 0, 509, 302, 1.6, { name: 'generator' });
  T.dress(() => {
    for (let i = 0; i < 18; i += 1) {
      const cy = 172 + i * 7.3;
      T.box(r.pick(['kzWood', 'kzChalet', 'kzBlue', 'kzRed']), 531.6, cy, 0, 532.4, cy + 0.6, 0.45 + 0.4 * (i % 2));
    }
    for (let i = 0; i < 12; i += 1) {
      const ty = 172 + i * 11;
      /* A picnic table and its benches. */
      T.box('kzWood', 566, ty, 0.72, 569, ty + 0.8, 0.78);
      T.box('kzWood', 566, ty - 0.55, 0.42, 569, ty - 0.25, 0.46);
      T.box('kzWood', 566, ty + 1.05, 0.42, 569, ty + 1.35, 0.46);
      for (const lx of [566.3, 568.7]) {
        T.box('kzWoodDark', lx - 0.05, ty - 0.5, 0, lx + 0.05, ty + 1.3, 0.72);
      }
      if (i % 3 === 1) {
        /* A brazier with its fire. */
        T.post('kzIron', 574, ty + 0.4, 0, 0.7, 0.35);
        T.bead('kzFlame', 574, ty + 0.4, 0.85, 0.28);
      }
    }
  });
  /* Strings over the tables, from the stalls' backs to posts. */
  for (let i = 0; i < 6; i += 1) {
    const ty = 175 + i * 22;
    T.post('kzWoodDark', 580, ty, 0, 4.2, 0.07, { name: 'light post' });
    T.take(580, ty, 0.5);
    string(T, 'kzBulb', [554, ty, 2.6], [580, ty, 4.0], 0.8, 0.5);
    if (i + 1 < 6) {
      string(T, 'kzBulbGold', [580, ty, 4.0], [580, ty + 22, 4.0], 0.9, 0.5);
    }
  }
  fir(T);
  carousel(T);
  stage(T);
  const cars = [[505, 'kzRed', 'kcCrepe'], [523, 'kzTeal', 'kcCurry'], [567, 'kzYellow', 'kcCoffee'], [585, 'kzPink', 'kcDonut']];
  for (const [px, col, sign] of cars) {
    kitchenCar(T, px, 410, col, sign);
  }
  /* Strings from the fir's top out to the plaza's corners: the lit tent
   * of light every Japanese illumination puts over its tree. */
  for (const [cx, cy] of [[500, 316], [592, 316], [500, 404], [592, 404], [545, 306], [545, 412]]) {
    T.post('kzIron', cx, cy, 0, 4.4, 0.06, { name: 'light post' });
    T.take(cx, cy, 0.5);
    string(T, (cx + cy) % 2 ? 'kzBulbIce' : 'kzBulbGold', [TREE.px, TREE.py, TREE.h - 1.2], [cx, cy, 4.3], 1.5, 0.55);
  }
  /* Benches and lit snowmen about the plaza. */
  T.dress(() => {
    for (const [sx, sy] of [[520, 330], [570, 392], [528, 396], [604, 380]]) {
      T.ball('kzSnow', sx, sy, 0.45, 0.48);
      T.ball('kzSnow', sx, sy, 1.1, 0.34);
      T.ball('kzSnow', sx, sy, 1.55, 0.22);
      T.cone('kzOrange', sx, sy - 0.2, 1.55, 0.04, 0.25, 5);
      T.box('kzRed', sx - 0.26, sy - 0.26, 1.32, sx + 0.26, sy + 0.26, 1.38);
    }
  });
}
