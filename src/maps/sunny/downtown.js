/*
 * downtown.js: Main Street's buildings. The corner store, the tavern, the
 * launderette, the barber and the hardware store on the south side; on the
 * north side the gas station, the donut shop with the giant donut on its
 * roof, the burger barn and its burger on a pole, the pizza place, the town
 * square where the pilot starts, the bowling alley with its pin, the town
 * hall and its clock tower, and the fire station; behind them the school
 * and the white church. Pure, as ./frame.js is.
 *
 * Every name on every sign is Sunnyfield's own. The settings are the stock
 * furniture of any American small town; none of them is anybody's drawing.
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

import { lotFrame, rng } from './frame.js';
import { sincos } from '../../props/trig.js';
import { HALF, WALK, KERB, MAIN_Y, OAK_X, MILL_X, PLANT_X, bench, bin } from './streets.js';

const MN = MAIN_Y + HALF + WALK;
const MS = MAIN_Y - HALF - WALK;

/*
 * A SHOP ON THE PAVEMENT, in a lot's frame: the body from u 0.2 to the
 * width less 0.2 and from v 0.3 back to `d`, `h` high with a parapet; a
 * glass front with a door; the fascia board with its sign; an awning in two
 * colours; and what is on the roof.
 */
function shop(T, lot, o) {
  const L = lotFrame(T, lot);
  const r = rng(o.seed ?? 7);
  const u0 = 0.2;
  const u1 = L.width - 0.2;
  const v0 = 0.3;
  const v1 = o.d;
  const h = o.h;
  L.box(o.wall, u0, v0, 0, u1, v1, h, { kind: 'wall', name: o.name });
  /* The parapet's coping. */
  L.deco(o.trim ?? 'sfTrim', u0 - 0.1, v0 - 0.1, h - 0.25, u1 + 0.1, v1 + 0.1, h + 0.05);
  /* The shop front: a stall riser, the glass, the door, the mullions. */
  const g0 = u0 + 0.6;
  const g1 = u1 - 0.6;
  L.paint(o.riser ?? 'sfConcrete', g0, v0 - 0.05, 0, g1, v0, 0.6);
  L.paint('sfGlass', g0, v0 - 0.04, 0.6, g1, v0, 2.9);
  const du = o.door ?? (g0 + g1) / 2;
  L.paint(o.doorColour ?? 'sfGlassDark', du - 0.55, v0 - 0.06, 0, du + 0.55, v0, 2.3);
  L.paint('sfIron', du - 0.65, v0 - 0.07, 2.3, du + 0.65, v0, 2.4, true);
  for (let u = g0; u <= g1 + 1e-6; u += (g1 - g0) / Math.max(2, Math.round((g1 - g0) / 2.4))) {
    if (Math.abs(u - du) > 0.7) {
      L.paint('sfIron', u - 0.05, v0 - 0.07, 0.6, u + 0.05, v0, 2.9, true);
    }
  }
  L.paint('sfIron', g0, v0 - 0.07, 2.85, g1, v0, 3.0, true);
  /* The fascia and its sign. */
  const fh0 = Math.min(h - 0.8, 3.3);
  L.paint(o.fascia, u0, v0 - 0.12, fh0, u1, v0, h - 0.3);
  if (o.sign) {
    L.sign(o.sign, (u0 + u1) / 2, v0 - 0.12, (fh0 + h - 0.3) / 2, Math.min(u1 - u0 - 1, (h - 0.3 - fh0) * (o.signAspect ?? 5)), h - 0.3 - fh0 - 0.25, 'front', 0.01);
  }
  /* The awning: a striped canvas sloped out over the pavement. */
  if (o.awning) {
    const [a, b] = o.awning;
    const ah = 3.15;
    const reach = 1.5;
    const n = Math.max(4, Math.round((g1 - g0) / 0.6));
    for (let k = 0; k < n; k += 1) {
      const s0 = g0 + ((g1 - g0) * k) / n;
      const s1 = g0 + ((g1 - g0) * (k + 1)) / n;
      L.prismAcross(k % 2 ? a : b, [[s0, ah], [s1, ah], [s1, ah + 0.02], [s0, ah + 0.02]], v0 - reach, v0, k > 0 && k < n - 1);
      const slope = [[v0 - reach, ah - 0.45], [v0, ah + 0.5], [v0, ah + 0.56], [v0 - reach, ah - 0.39]];
      L.prismAlong(k % 2 ? a : b, slope, s0, s1);
    }
    L.box('sfIron', g0, v0 - reach - 0.02, ah - 0.75, g1, v0 - reach + 0.02, ah - 0.4, { solid: false });
    /* Solid: the awning's slab, inside its slope. */
    L.hidden(g0, v0 - reach + 0.3, ah - 0.1, g1, v0, ah + 0.25, 'wall', 'awning');
  }
  /* On the roof: an air handler and a vent or two. */
  const ru = u0 + (u1 - u0) * r.range(0.25, 0.7);
  const rv = v0 + (v1 - v0) * r.range(0.45, 0.75);
  L.box('sfSteel', ru - 0.9, rv - 0.7, h, ru + 0.9, rv + 0.7, h + 1.1, { kind: 'wall', name: 'air handler' });
  L.deco('sfIron', ru - 0.6, rv - 0.45, h + 1.1, ru + 0.6, rv + 0.45, h + 1.15, true);
  L.cyl('sfSteel', [u0 + 1.2, v1 - 1.5, h], [u0 + 1.2, v1 - 1.5, h + 0.8], 0.2, 8, null, true);
  /* The back: a door and the bins. */
  L.paint('sfSteel', (u0 + u1) / 2 - 0.5, v1, 0, (u0 + u1) / 2 + 0.5, v1 + 0.05, 2.1, true);
  L.box('sfDoorGreen', u1 - 2.6, v1 + 0.4, 0, u1 - 0.8, v1 + 1.5, 1.3, { kind: 'wall', name: 'dumpster' });
  return L;
}

/* ------------------------------------------------------------------ */
/* The south side                                                      */
/* ------------------------------------------------------------------ */

function southSide(T) {
  const y0 = 93.5;
  const y1 = MS;
  /* The corner store, open all night, at Oak and Main: a deep shop with a
   * forecourt on the corner, the drinks machine and the ice chest out
   * front. */
  const store = shop(T, { x0: OAK_X + HALF + WALK, x1: 82, y0, y1, face: 'n' }, {
    name: 'corner store', wall: 'sfButter', fascia: 'sfOrange', sign: 'tuckShop', h: 5.2, d: 18,
    awning: ['sfTeal', 'sfTrim'], seed: 3, riser: 'sfTeal',
  });
  store.box('sfTrim', 2, -0.1 + 0.3 - 1.25, 0, 3.3, 0.3 - 0.4, 0.95, { kind: 'wall', name: 'ice chest' });
  store.sign('ice', 2.65, 0.3 - 1.25, 0.6, 1.1, 0.5, 'front', 0.005);
  /* The frozen drink machine, its own glow. */
  store.box('sfRed', 4.0, -0.9, 0, 5.2, 0.25, 1.95, { kind: 'wall', name: 'drink machine' });
  store.sign('frosty', 4.6, -0.9, 1.2, 1.0, 1.3, 'front', 0.01);
  store.sign('open24', 15.5, 0.24, 2.1, 1.4, 0.55, 'front', 0.01);
  store.sign('lotto', 11.5, 0.24, 1.6, 1.0, 0.7, 'front', 0.01);
  /* A tavern in brick, a neon sign, dark windows. */
  const tav = shop(T, { x0: 82.5, x1: 98.5, y0, y1, face: 'n' }, {
    name: 'tavern', wall: 'sfBrick', fascia: 'sfIron', sign: 'tavern', h: 6.4, d: 17, seed: 5,
    doorColour: 'sfWood', riser: 'sfIron',
  });
  tav.sign('neonBar', 3.2, 0.24, 2.0, 1.5, 0.75, 'front', 0.02);
  tav.box('sfIron', 12.0, -0.2, 3.6, 12.12, 0.3, 4.2, { solid: false });
  tav.sign('tavernHang', 12.06, -0.65, 3.4, 0.9, 0.9, 'right', 0.07);
  tav.sign('tavernHang', 12.06, -0.65, 3.4, 0.9, 0.9, 'left', 0.07);
  /* The launderette. */
  shop(T, { x0: 99, x1: 116.5, y0, y1, face: 'n' }, {
    name: 'launderette', wall: 'sfSky', fascia: 'sfDoorNavy', sign: 'suds', h: 5.0, d: 15,
    awning: ['sfSky', 'sfTrim'], seed: 9,
  });
  /* The barber, and his pole. */
  const barber = shop(T, { x0: 117, x1: 130, y0, y1, face: 'n' }, {
    name: 'barber', wall: 'sfTrim', fascia: 'sfRed', sign: 'barber', h: 5.0, d: 14, seed: 11,
    awning: ['sfRed', 'sfTrim'],
  });
  barber.cyl('sfTrim', [2.0, 0.0, 1.6], [2.0, 0.0, 2.9], 0.14, 10);
  barber.cyl('sfRed', [2.0, -0.01, 1.85], [2.0, -0.01, 2.0], 0.15, 10, null, true);
  barber.cyl('sfDoorNavy', [2.0, -0.01, 2.2], [2.0, -0.01, 2.35], 0.15, 10, null, true);
  barber.cyl('sfRed', [2.0, -0.01, 2.55], [2.0, -0.01, 2.7], 0.15, 10, null, true);
  barber.ball('sfTrim', 2.0, 0.0, 3.0, 0.16);
  /* The hardware store, to the bus stop. */
  const hw = shop(T, { x0: 130.5, x1: 150, y0, y1, face: 'n' }, {
    name: 'hardware', wall: 'sfMint', fascia: 'sfDoorGreen', sign: 'hardware', h: 5.6, d: 20,
    awning: ['sfDoorGreen', 'sfTrim'], seed: 13,
  });
  /* Wheelbarrows and a ladder out front. */
  hw.deco('sfRed', 2.2, -0.8, 0.3, 3.4, -0.1, 0.75, true);
  hw.cyl('sfIron', [2.0, -0.45, 0.3], [2.0, -0.45, 0.31], 0.25, 10, null, true);
  hw.deco('sfWood', 16.0, 0.05, 0, 16.1, 0.25, 3.2, true);
  hw.deco('sfWood', 16.8, 0.05, 0, 16.9, 0.25, 3.2, true);
  for (let hh = 0.3; hh < 3.2; hh += 0.35) {
    hw.deco('sfWood', 16.0, 0.12, hh, 16.9, 0.18, hh + 0.05, true);
  }
  /* The lane behind, paved, with a back fence along Birch's pavement. */
  T.paint('sfConcrete', OAK_X + HALF + WALK, 93.5, 0, 150, y1 - 15, 0.025);
}

/* ------------------------------------------------------------------ */
/* The gas station                                                     */
/* ------------------------------------------------------------------ */

export const GAS = { x0: 4, x1: 42, y0: MN + 2, y1: 170, canopyH: 5.0, cx0: 9, cx1: 37, cy0: 140, cy1: 152 };

function gasStation(T) {
  const { x0, x1, y0, y1, canopyH, cx0, cx1, cy0, cy1 } = GAS;
  T.paint('sfAsphalt', x0, y0, 0, x1, y1, 0.025);
  T.paint('sfConcrete', cx0 - 1, cy0 - 1, 0.025, cx1 + 1, cy1 + 1, 0.03);
  /* The canopy on four columns: fly under it between the pumps. */
  T.box('sfTrim', cx0, cy0, canopyH, cx1, cy1, canopyH + 0.9, { kind: 'wall', name: 'canopy' });
  T.paint('sfRed', cx0 - 0.02, cy0 - 0.02, canopyH + 0.15, cx1 + 0.02, cy1 + 0.02, canopyH + 0.75);
  T.sign('gasCanopy', (cx0 + cx1) / 2, cy0 - 0.02, canopyH + 0.45, 9, 0.55, 's', 0.01);
  T.sign('gasCanopy', (cx0 + cx1) / 2, cy1 + 0.02, canopyH + 0.45, 9, 0.55, 'n', 0.01);
  for (let x = cx0 + 1.5; x < cx1; x += 6.25) {
    T.paint('sfLamp', x - 0.6, cy0 + 1, canopyH - 0.01, x + 0.6, cy0 + 2, canopyH, true);
    T.paint('sfLamp', x - 0.6, cy1 - 2, canopyH - 0.01, x + 0.6, cy1 - 1, canopyH, true);
  }
  for (const x of [cx0 + 6, cx1 - 6]) {
    for (const y of [cy0 + 3, cy1 - 3]) {
      T.box('sfSteel', x - 0.25, y - 0.25, 0, x + 0.25, y + 0.25, canopyH, { kind: 'wall', name: 'canopy column' });
    }
  }
  /* Two pump islands, two pumps each. */
  for (const y of [(cy0 + cy1) / 2 - 2.6, (cy0 + cy1) / 2 + 2.6]) {
    T.box('sfConcrete', cx0 + 4, y - 0.6, 0, cx1 - 4, y + 0.6, 0.2, { kind: 'wall', name: 'island' });
    for (const x of [cx0 + 9, cx1 - 9]) {
      T.box('sfTrim', x - 0.5, y - 0.35, 0.2, x + 0.5, y + 0.35, 1.9, { kind: 'wall', name: 'pump' });
      T.paint('sfRed', x - 0.52, y - 0.37, 1.45, x + 0.52, y + 0.37, 1.9);
      T.sign('pump', x, y - 0.35, 1.0, 0.6, 0.7, 's', 0.01);
      T.sign('pump', x, y + 0.35, 1.0, 0.6, 0.7, 'n', 0.01);
      T.cyl('sfIron', [x + 0.5, y, 1.2], [x + 0.9, y, 0.6], 0.03, 4, null, true);
    }
  }
  /* The kiosk at the back. */
  const ky0 = 156;
  T.box('sfTrim', x0 + 6, ky0, 0, x1 - 6, y1 - 2, 3.8, { kind: 'wall', name: 'kiosk' });
  T.deco('sfRed', x0 + 5.9, ky0 - 0.1, 3.3, x1 - 5.9, y1 - 1.9, 4.0);
  T.paint('sfGlass', x0 + 9, ky0 - 0.05, 0.5, x1 - 9, ky0, 2.7);
  T.paint('sfGlassDark', (x0 + x1) / 2 - 0.6, ky0 - 0.07, 0, (x0 + x1) / 2 + 0.6, ky0, 2.3);
  T.sign('gasShop', (x0 + x1) / 2, ky0 - 0.1, 3.65, 8, 0.6, 's', 0.01);
  T.box('sfSteel', x0 + 10, ky0 + 4, 3.8, x0 + 12.5, ky0 + 6.5, 4.8, { kind: 'wall', name: 'air handler' });
  /* The price sign on its tall pole at the corner. */
  const px = x1 - 1.5;
  const py = y0 + 1.5;
  T.post('sfSteel', px, py, 0, 8.5, 0.18, { kind: 'pole', name: 'price pole' });
  T.box('sfTrim', px - 1.6, py - 0.3, 8.5, px + 1.6, py + 0.3, 12.0, { kind: 'wall', name: 'price sign' });
  T.sign('gasPrice', px, py - 0.3, 10.25, 3.0, 3.3, 's', 0.01);
  T.sign('gasPrice', px, py + 0.3, 10.25, 3.0, 3.3, 'n', 0.01);
  /* An air and water post, and a tyre stack by the kiosk. */
  T.box('sfDoorNavy', x0 + 2.5, 158, 0, x0 + 3.2, 158.7, 1.3, { kind: 'wall', name: 'air post' });
  for (let k = 0; k < 4; k += 1) {
    T.torus('sfTyre', x1 - 4, 158, 0.15 + k * 0.25, 0.32, 0.12, 0, 0, 6, 14);
  }
  T.hidden(x1 - 4.45, 157.55, 0, x1 - 3.55, 158.45, 1.0, 'wall', 'tyres');
}

/* ------------------------------------------------------------------ */
/* The donut shop and the giant donut                                  */
/* ------------------------------------------------------------------ */

/* The donut stands on edge on the shop's roof facing Main Street: its
 * middle at (px, py, h), R round to the middle of its tube, which is t
 * thick. The hole is 2 (R - t) across, wide enough to fly. */
export const DONUT = { px: 72, py: 147, h: 0, R: 4.4, t: 1.65, roof: 5.4, x0: 58, x1: 86, y0: MN + 0.3, y1: 158 };
DONUT.h = DONUT.roof + 1.4 + DONUT.R + DONUT.t;

function donutShop(T) {
  const D = DONUT;
  const L = shop(T, { x0: D.x0, x1: D.x1, y0: D.y0, y1: D.y1 + 20, face: 's' }, {
    name: 'donut shop', wall: 'sfPink', fascia: 'sfTrim', sign: 'donuts', h: D.roof, d: D.y1 - D.y0,
    awning: ['sfPink', 'sfTrim'], seed: 17, riser: 'sfDoorRed',
  });
  L.sign('coffee', 4.0, 0.25, 1.75, 1.2, 0.8, 'front', 0.01);
  L.sign('dozen', 22.5, 0.25, 1.75, 1.3, 0.8, 'front', 0.01);
  /* Two tables out front. */
  for (const u of [6.5, 21.5]) {
    L.disc('sfTrim', u, -1.6, 0.45, 0.7, 0.74, 14);
    L.hidden(u - 0.3, -1.9, 0, u + 0.3, -1.3, 0.74, 'wall', 'table');
    L.cyl('sfSteel', [u, -1.6, 0], [u, -1.6, 0.7], 0.04, 5, null, true);
  }
  /* The donut: dough all round, and on each face a squashed ring of glaze
   * that stands proud of the dough and laps over its rim, with sprinkles
   * on the glaze; two struts down to the roof. */
  T.torus('sfDough', D.px, D.py, D.h, D.R, D.t, 0, 1, 14, 40);
  const GO = 0.75;
  const GS = 0.62;
  for (const f of [-1, 1]) {
    T.torus('sfGlaze', D.px, D.py + f * GO, D.h, D.R, D.t * 0.98, 0, 1, 12, 40, GS);
  }
  const r = rng(99);
  const sprinkle = ['sfYellow', 'sfTeal', 'sfPurple', 'sfTrim', 'sfRed', 'sfDoorGreen'];
  for (let k = 0; k < 120; k += 1) {
    const a = r.range(0, Math.PI * 2);
    const b = r.range(0.45, Math.PI - 0.45);
    const f = k % 2 ? -1 : 1;
    const rad = D.R + D.t * 0.98 * cosOf(b);
    const ax = f * (GO + GS * D.t * 0.98 * sinOf(b) + 0.02);
    const x = D.px + rad * cosOf(a);
    const z = D.h + rad * sinOf(a);
    const y = D.py + ax;
    const s = r.range(0, Math.PI);
    const dx = 0.16 * cosOf(s);
    const dz = 0.16 * sinOf(s);
    T.cyl(r.pick(sprinkle), [x - dx, y, z - dz], [x + dx, y, z + dz], 0.06, 4, null, true);
  }
  /* The ring's solid: capsules round its tube's middle circle. */
  const n = 28;
  for (let k = 0; k < n; k += 1) {
    const a0 = (k / n) * Math.PI * 2;
    const a1 = ((k + 1) / n) * Math.PI * 2;
    T.cap('sfDough', [D.px + D.R * cosOf(a0), D.py, D.h + D.R * sinOf(a0)], [D.px + D.R * cosOf(a1), D.py, D.h + D.R * sinOf(a1)], D.t, { draw: false, kind: 'wall', name: 'donut' });
  }
  /* The struts to the roof. */
  for (const s of [-1, 1]) {
    const x = D.px + s * 2.2;
    T.cap('sfSteel', [x, D.py, D.roof], [x, D.py, D.h - D.R * 0.86], 0.14, { kind: 'pole', name: 'donut strut' });
  }
  T.box('sfSteel', D.px - 3.2, D.py - 0.8, D.roof, D.px + 3.2, D.py + 0.8, D.roof + 0.4, { kind: 'wall', name: 'donut plinth' });
}

/* Sines and cosines, from ../../props/trig.js, so the donut's capsules and
 * the burger's ring are the same bits on every engine. */
const _sc = { s: 0, c: 1 };
export function cosOf(a) {
  return sincos(a, _sc).c;
}
export function sinOf(a) {
  return sincos(a, _sc).s;
}

/* ------------------------------------------------------------------ */
/* The burger barn, the pizza place                                    */
/* ------------------------------------------------------------------ */

export const BURGER = { x0: 90, x1: 116, y0: MN + 0.3, y1: 160, pole: [122.7, 135.2], top: 13 };

function burgerBarn(T) {
  const B = BURGER;
  const L = shop(T, { x0: B.x0, x1: B.x1, y0: B.y0, y1: B.y1 + 20, face: 's' }, {
    name: 'burger barn', wall: 'sfRed', fascia: 'sfYellow', sign: 'burger', h: 4.6, d: B.y1 - B.y0 - 6,
    awning: ['sfYellow', 'sfRed'], seed: 19, trim: 'sfTrim',
  });
  /* A barn's gambrel over the box. */
  const d = B.y1 - B.y0 - 6;
  L.prismAcross('sfRoofRed', [[0.0, 4.6], [3.2, 7.4], [L.width / 2, 8.6], [L.width - 3.2, 7.4], [L.width, 4.6]], 0.3, d, false);
  L.hidden(1.0, 0.6, 4.6, L.width - 1.0, d - 0.3, 7.2, 'wall', 'barn roof');
  L.hidden(4.0, 0.6, 7.2, L.width - 4.0, d - 0.3, 8.3, 'wall', 'barn roof');
  L.sign('barnX', L.width / 2, 0.25, 6.7, 2.6, 1.6, 'front', 0.01);
  /* The drive through lane round the side. */
  T.paint('sfAsphalt', B.x1 - 0.2, B.y0, 0, B.x1 + 5.4, B.y1 - 2, 0.025);
  /* The burger on its pole: bun, patty, cheese, lettuce, bun. */
  const [px, py] = B.pole;
  T.post('sfSteel', px, py, KERB, B.top - 1.6, 0.22, { kind: 'pole', name: 'burger pole' });
  const layers = [['sfDough', 0.0, 0.55, 1.9], ['sfDoorGreen', 0.55, 0.7, 2.05], ['sfYellow', 0.7, 0.85, 2.05], ['sfRoofBrown', 0.85, 1.4, 1.95]];
  const base = B.top - 1.6;
  for (const [m, a, b, rr] of layers) {
    T.disc(m, px, py, rr, base + a, base + b, 24);
  }
  /* The top bun: a taper and a dome, its sesame on the dome. */
  T.cyl('sfDough', [px, py, base + 1.4], [px, py, base + 2.1], 1.95, 24, 1.55);
  T.ball('sfDough', px, py, base + 2.1, 1.55);
  for (let k = 0; k < 9; k += 1) {
    const a = (k / 9) * Math.PI * 2;
    T.ball('sfTrim', px + 1.0 * cosOf(a), py + 1.0 * sinOf(a), base + 3.26, 0.11, true);
  }
  T.hidden(px - 1.35, py - 1.35, base, px + 1.35, py + 1.35, base + 1.4, 'wall', 'burger');
  T.cap('sfDough', [px, py, base + 1.95], [px, py, base + 1.95], 1.95, { draw: false, kind: 'wall', name: 'burger' });
}

function pizza(T) {
  const L = shop(T, { x0: 124, x1: 148, y0: MN + 0.3, y1: 176, face: 's' }, {
    name: 'pizza', wall: 'sfTrim', fascia: 'sfDoorGreen', sign: 'pizza', h: 5.0, d: 15,
    awning: ['sfRed', 'sfDoorGreen'], seed: 23, riser: 'sfRed',
  });
  /* A slice on the roof edge, its tip toward the street. */
  L.prismAlong('sfYellow', [[0.4, 5.0], [2.6, 7.6], [2.6, 7.8], [0.4, 5.2]], 9.5, 14.5);
  L.ball('sfRed', 11, 1.6, 6.1, 0.35, true);
  L.ball('sfRed', 13, 1.9, 6.5, 0.32, true);
  L.ball('sfRed', 12, 1.2, 5.7, 0.3, true);
  L.hidden(9.7, 0.6, 5.0, 14.3, 2.4, 6.4, 'wall', 'slice');
}

/* ------------------------------------------------------------------ */
/* The town square                                                     */
/* ------------------------------------------------------------------ */

export const SQUARE = { x0: 150, x1: 184, y0: MN, y1: 170 };
export const PADS = { px: 167, py: 150, yaw: Math.PI / 2 };

function townSquare(T) {
  const Q = SQUARE;
  T.paint('sfWalk', Q.x0, Q.y0, 0, Q.x1, Q.y1, 0.03);
  /* A border of brick, and a cross of it. */
  T.paint('sfBrick', Q.x0, Q.y0, 0.03, Q.x1, Q.y0 + 0.4, 0.04, true);
  T.paint('sfBrick', Q.x0, Q.y1 - 0.4, 0.03, Q.x1, Q.y1, 0.04, true);
  T.paint('sfBrick', (Q.x0 + Q.x1) / 2 - 0.3, Q.y0, 0.03, (Q.x0 + Q.x1) / 2 + 0.3, Q.y1, 0.04, true);
  /* The fountain, off the pads' shoulder: a round basin and a tiered
   * middle. */
  const fx = 157;
  const fy = 162;
  T.disc('sfStone', fx, fy, 3.2, 0, 0.7, 28);
  T.disc('sfWater', fx, fy, 2.9, 0, 0.72, 28);
  T.hidden(fx - 2.2, fy - 2.2, 0, fx + 2.2, fy + 2.2, 0.7, 'wall', 'fountain');
  T.post('sfStone', fx, fy, 0.7, 2.2, 0.25, { kind: 'pole', name: 'fountain' });
  T.disc('sfStone', fx, fy, 1.0, 1.6, 1.75, 18);
  T.disc('sfWater', fx, fy, 0.85, 1.6, 1.77, 18, true);
  T.cone('sfWater', fx, fy, 2.2, 0.2, 0.9, 8, true);
  /* The flagpole. */
  T.post('sfSteel', 177, 164, 0, 12, 0.09, { kind: 'pole', name: 'flagpole' });
  T.ball('sfYellow', 177, 164, 12.1, 0.16);
  T.sign('flag', 177, 164.9, 11.0, 1.7, 1.1, 'e', 0.0);
  T.sign('flag', 177, 164.9, 11.0, 1.7, 1.1, 'w', 0.0);
  /* Benches round it, planters with trees. */
  bench(T, 152.5, 156, 'w');
  bench(T, 181.5, 156, 'e');
  bench(T, 167, Q.y1 - 1.2, 'n');
  for (const [x, y] of [[152.5, 143], [181.5, 143], [152.5, 168.2], [181.5, 168.2]]) {
    T.box('sfStone', x - 1.1, y - 1.1, 0, x + 1.1, y + 1.1, 0.6, { kind: 'wall', name: 'planter' });
    T.asset({ type: 'tree', style: 'street', dims: { size: 0.65, variant: Math.round(x + y) } }, 1, x, y, 0.6, 0);
  }
  bin(T, 160, 141, 0.03);
  bin(T, 174, 141, 0.03);
  /* The railing along the gorge's mouth. */
  T.box('sfIron', Q.x0, Q.y1 - 0.1, 0, Q.x1, Q.y1 + 0.05, 1.1, { kind: 'wall', name: 'railing' });
}

/* ------------------------------------------------------------------ */
/* The bowling alley                                                   */
/* ------------------------------------------------------------------ */

export const BOWL = { x0: 188, x1: 228, y0: MN + 4, y1: 172, h: 7.5 };

function bowling(T) {
  const B = BOWL;
  const L = shop(T, { x0: B.x0, x1: B.x1, y0: B.y0, y1: B.y1 + 10, face: 's' }, {
    name: 'bowling alley', wall: 'sfLilac', fascia: 'sfPurple', sign: 'bowling', h: B.h, d: B.y1 - B.y0,
    seed: 29, riser: 'sfPurple', signAspect: 7,
  });
  /* A swooping roof wing over the door, on two raked columns. */
  L.prismAlong('sfPurple', [[-3.5, 4.2], [0.3, 5.0], [0.3, 5.3], [-3.5, 4.5]], 12, 28);
  L.hidden(12, -3.2, 4.25, 28, 0.3, 4.75, 'wall', 'wing');
  for (const u of [14, 26]) {
    L.cap('sfTrim', [u, -3.0, 0], [u, -2.6, 4.3], 0.15, { kind: 'pole', name: 'wing column' });
  }
  /* The pin on the roof: a lathe of discs, white with two red necks. */
  const px = (B.x0 + B.x1) / 2;
  const py = B.y0 + 6;
  const prof = [[0, 0.9], [0.8, 1.15], [1.8, 1.35], [2.8, 1.3], [3.8, 1.0], [4.6, 0.7], [5.1, 0.62], [5.6, 0.75], [6.3, 0.85], [6.9, 0.7], [7.3, 0.35]];
  for (let k = 0; k < prof.length - 1; k += 1) {
    const [h0, r0] = prof[k];
    const [h1, r1] = prof[k + 1];
    const m = k === 5 || k === 6 ? 'sfRed' : 'sfTrim';
    T.cyl(m, [px, py, B.h + h0], [px, py, B.h + h1], r0, 18, r1);
  }
  T.ball('sfTrim', px, py, B.h + 7.25, 0.4);
  T.post('sfTrim', px, py, B.h, B.h + 4.0, 1.0, { draw: false, kind: 'wall', name: 'pin' });
  T.post('sfTrim', px, py, B.h + 4.0, B.h + 7.0, 0.6, { draw: false, kind: 'wall', name: 'pin' });
  /* And a ball beside it. */
  T.ball('sfDoorNavy', px + 3.2, py - 0.4, B.h + 1.2, 1.2);
  T.cap('sfDoorNavy', [px + 3.2, py - 0.4, B.h + 1.2], [px + 3.2, py - 0.4, B.h + 1.2], 1.2, { draw: false, kind: 'wall', name: 'ball' });
}

/* ------------------------------------------------------------------ */
/* The town hall and its clock tower                                   */
/* ------------------------------------------------------------------ */

/* The tower stands on the hall's middle; through its belfry, under the
 * clock, is an arch on the line of Main Street (east and west). */
export const HALL = { x0: 246, x1: 300, y0: MN + 6, y1: 176, h: 10, tw: 7, top: 27, arch0: 17.5, arch1: 21.5, archW: 3.4 };

function townHall(T) {
  const H = HALL;
  const cx = (H.x0 + H.x1) / 2;
  /* The steps, the body, the cornice. */
  T.box('sfStone', H.x0, H.y0, 0, H.x1, H.y1, H.h, { kind: 'wall', name: 'town hall' });
  T.deco('sfTrim', H.x0 - 0.3, H.y0 - 0.3, H.h - 0.5, H.x1 + 0.3, H.y1 + 0.3, H.h + 0.2);
  T.deco('sfTrim', H.x0 - 0.15, H.y0 - 0.15, 0, H.x1 + 0.15, H.y1 + 0.15, 0.8);
  for (let k = 0; k < 4; k += 1) {
    T.box('sfStone', cx - 9 + k * 0.3, H.y0 - 3.6 + k * 0.6, 0, cx + 9 - k * 0.3, H.y0, 0.2 + k * 0.2, { kind: 'wall', name: 'steps' });
  }
  /* The portico: six columns and a pediment. */
  const pd = 3.0;
  for (let k = 0; k < 6; k += 1) {
    const x = cx - 7.5 + k * 3;
    T.post('sfTrim', x, H.y0 - pd + 0.4, 0.8, H.h - 1.4, 0.42, { kind: 'wall', name: 'column', seg: 12 });
    T.deco('sfTrim', x - 0.6, H.y0 - pd - 0.2, H.h - 1.6, x + 0.6, H.y0 - pd + 1.0, H.h - 1.35, true);
  }
  T.box('sfTrim', cx - 9, H.y0 - pd - 0.4, H.h - 1.4, cx + 9, H.y0, H.h - 0.2, { kind: 'wall', name: 'entablature' });
  T.prism('sfStone', 'y', [[cx - 9.3, H.h - 0.2], [cx, H.h + 3.0], [cx + 9.3, H.h - 0.2]], H.y0 - pd - 0.5, H.y0 + 0.5);
  T.hidden(cx - 6, H.y0 - pd - 0.3, H.h - 0.2, cx + 6, H.y0 + 0.3, H.h + 1.0, 'wall', 'pediment');
  T.sign('townHall', cx, H.y0 - pd - 0.42, H.h - 0.8, 9, 0.75, 's', 0.0);
  /* Windows down both storeys. */
  for (let x = H.x0 + 2.5; x < H.x1 - 2; x += 3.5) {
    if (Math.abs(x - cx) < 9.5) {
      continue;
    }
    for (const h of [2.0, 6.0]) {
      T.paint('sfGlassDark', x - 0.7, H.y0 - 0.05, h, x + 0.7, H.y0, h + 2.2);
      T.paint('sfTrim', x - 0.85, H.y0 - 0.1, h - 0.2, x + 0.85, H.y0, h, true);
    }
  }
  T.paint('sfWood', cx - 1.4, H.y0 - 0.05, 0.8, cx + 1.4, H.y0, 4.4);
  /* The tower: a square shaft, the clock stage, the belfry with its arch
   * east to west, the cupola. */
  const t = H.tw / 2;
  const ty = (H.y0 + H.y1) / 2;
  T.box('sfStone', cx - t, ty - t, H.h, cx + t, ty + t, H.arch0, { kind: 'wall', name: 'tower' });
  T.deco('sfTrim', cx - t - 0.25, ty - t - 0.25, H.arch0 - 0.4, cx + t + 0.25, ty + t + 0.25, H.arch0);
  /* The clocks, on all four faces. */
  for (const f of ['s', 'n', 'e', 'w']) {
    const [x, y] = { s: [cx, ty - t], n: [cx, ty + t], e: [cx + t, ty], w: [cx - t, ty] }[f];
    T.sign('clock', x, y, H.arch0 - 2.6, 3.4, 3.4, f, 0.03);
  }
  /* The belfry: the arch through it east and west, and solid piers north
   * and south of the opening, the lintel over it. */
  const aw = H.archW / 2;
  T.box('sfTrim', cx - t, ty - t, H.arch0, cx + t, ty - aw, H.arch1, { kind: 'wall', name: 'belfry pier' });
  T.box('sfTrim', cx - t, ty + aw, H.arch0, cx + t, ty + t, H.arch1, { kind: 'wall', name: 'belfry pier' });
  T.box('sfStone', cx - t - 0.2, ty - t - 0.2, H.arch1, cx + t + 0.2, ty + t + 0.2, H.arch1 + 0.8, { kind: 'wall', name: 'belfry lintel' });
  /* The bell, hung in the arch, high enough to pass under. */
  T.cyl('sfYellow', [cx, ty, H.arch1 - 0.2], [cx, ty, H.arch1 - 1.0], 0.25, 14, 0.6);
  T.cap('sfYellow', [cx, ty, H.arch1 - 0.55], [cx, ty, H.arch1 - 0.45], 0.45, { draw: false, kind: 'wall', name: 'bell' });
  /* The cupola and its spike. */
  T.box('sfStone', cx - t + 0.8, ty - t + 0.8, H.arch1 + 0.8, cx + t - 0.8, ty + t - 0.8, H.arch1 + 2.8, { kind: 'wall', name: 'cupola' });
  T.cone('sfRoofTeal', cx, ty, H.arch1 + 2.8, t - 0.5, H.top - H.arch1 - 3.2, 4, false);
  T.post('sfRoofTeal', cx, ty, H.arch1 + 2.8, H.arch1 + 4.3, 1.6, { draw: false, kind: 'wall', name: 'spire' });
  T.post('sfYellow', cx, ty, H.top - 0.5, H.top + 0.8, 0.05, { kind: 'pole', name: 'finial' });
  /* A flag on the hall's roof, and the roof's plant. */
  T.box('sfSteel', H.x0 + 4, H.y1 - 8, H.h, H.x0 + 8, H.y1 - 4, H.h + 1.4, { kind: 'wall', name: 'roof plant' });
  T.box('sfSteel', H.x1 - 8, H.y1 - 8, H.h, H.x1 - 4, H.y1 - 4, H.h + 1.4, { kind: 'wall', name: 'roof plant' });
}

/* ------------------------------------------------------------------ */
/* The fire station                                                    */
/* ------------------------------------------------------------------ */

function fireStation(T) {
  const L = shop(T, { x0: 304, x1: 342, y0: MN + 0.3, y1: 180, face: 's' }, {
    name: 'fire station', wall: 'sfBrick', fascia: 'sfTrim', sign: 'fireStation', h: 8.0, d: 18,
    seed: 31, riser: 'sfBrick', door: 33,
  });
  /* Two bay doors in red, glass in their tops. */
  for (const u of [8, 19]) {
    L.paint('sfRed', u - 4, 0.24, 0, u + 4, 0.3, 4.6);
    L.paint('sfGlass', u - 3.6, 0.22, 3.4, u + 3.6, 0.24, 4.3, true);
    for (let h = 0.9; h < 3.4; h += 0.85) {
      L.paint('sfRoofRed', u - 4, 0.22, h - 0.04, u + 4, 0.24, h + 0.04, true);
    }
    L.paint('sfConcrete', u - 4, -3.2, 0, u + 4, 0.3, 0.035);
  }
  /* The hose tower at the back. */
  L.box('sfBrick', 31, 12, 8, 36, 17, 15.5, { kind: 'wall', name: 'hose tower' });
  L.deco('sfTrim', 30.8, 11.8, 15.3, 36.2, 17.2, 15.8);
  L.sign('fireBadge', 33.5, 12, 12, 2.2, 2.2, 'front', 0.03);
}

/* ------------------------------------------------------------------ */
/* The school and the church                                           */
/* ------------------------------------------------------------------ */

/* The school faces Oak Street, two storeys, with a breezeway through its
 * middle, west to east, out to the playground. */
export const SCHOOL = { x0: OAK_X + HALF + WALK + 4, x1: 120, y0: 172, y1: 202, h: 8.2, bw: 4.4, bh: 3.6 };

function school(T) {
  const S = SCHOOL;
  const by = (S.y0 + S.y1) / 2;
  const b0 = by - S.bw / 2;
  const b1 = by + S.bw / 2;
  /* South wing, north wing, the floor over the breezeway. */
  T.box('sfButter', S.x0, S.y0, 0, S.x1, b0, S.h, { kind: 'wall', name: 'school' });
  T.box('sfButter', S.x0, b1, 0, S.x1, S.y1, S.h, { kind: 'wall', name: 'school' });
  T.box('sfButter', S.x0, b0, S.bh, S.x1, b1, S.h, { kind: 'wall', name: 'school' });
  T.paint('sfConcrete', S.x0 - 3, b0, 0, S.x1 + 6, b1, 0.03);
  T.deco('sfBrick', S.x0 - 0.1, S.y0 - 0.1, S.h - 0.6, S.x1 + 0.1, S.y1 + 0.1, S.h + 0.25);
  T.deco('sfBrick', S.x0 - 0.1, S.y0 - 0.1, 0, S.x1 + 0.1, S.y1 + 0.1, 0.7);
  /* Rows of windows on both long faces and the front. */
  for (let x = S.x0 + 2; x < S.x1 - 1.5; x += 3) {
    for (const h of [1.2, 4.9]) {
      T.paint('sfGlass', x - 1.0, S.y0 - 0.05, h, x + 1.0, S.y0, h + 1.8);
      T.paint('sfGlass', x - 1.0, S.y1, h, x + 1.0, S.y1 + 0.05, h + 1.8);
      T.paint('sfTrim', x - 1.1, S.y0 - 0.1, h - 0.15, x + 1.1, S.y0, h, true);
    }
  }
  for (let y = S.y0 + 2; y < S.y1 - 1.5; y += 3) {
    if (y > b0 - 1.2 && y < b1 + 1.2) {
      continue;
    }
    for (const h of [1.2, 4.9]) {
      T.paint('sfGlass', S.x0 - 0.05, y - 1.0, h, S.x0, y + 1.0, h + 1.8);
    }
  }
  /* The name over the breezeway, the canopy over the door, the bell. */
  T.sign('school', S.x0 - 0.05, by, S.bh + 1.2, 12, 1.2, 'w', 0.01);
  T.box('sfRed', S.x0 - 3, b0 - 1.5, S.bh, S.x0, b1 + 1.5, S.bh + 0.3, { kind: 'wall', name: 'canopy' });
  T.post('sfSteel', S.x0 - 2.7, b0 - 1.2, 0, S.bh, 0.1, { kind: 'pole', name: 'canopy post' });
  T.post('sfSteel', S.x0 - 2.7, b1 + 1.2, 0, S.bh, 0.1, { kind: 'pole', name: 'canopy post' });
  /* The flagpole on the lawn. */
  T.post('sfSteel', S.x0 - 2.5, S.y0 + 4, 0, 11, 0.08, { kind: 'pole', name: 'flagpole' });
  T.sign('flag', S.x0 - 2.5, S.y0 + 4.85, 10.0, 1.6, 1.0, 'e', 0.0);
  T.sign('flag', S.x0 - 2.5, S.y0 + 4.85, 10.0, 1.6, 1.0, 'w', 0.0);
  /* On the roof: plant and a stair head. */
  T.box('sfSteel', S.x0 + 10, S.y0 + 4, S.h, S.x0 + 15, S.y0 + 8, S.h + 1.6, { kind: 'wall', name: 'roof plant' });
  T.box('sfButter', S.x1 - 10, S.y1 - 7, S.h, S.x1 - 6, S.y1 - 2, S.h + 2.6, { kind: 'wall', name: 'stair head' });
  /* The school bus, parked at the kerb on the south side. */
  schoolBus(T, S.x0 + 6, S.y0 - 6.5);
  /* The playground: a climbing frame, a slide, swings, a court. */
  const px0 = S.x1 + 2;
  T.paint('sfDirt', px0, S.y0, 0, 146, S.y1, 0.02);
  T.paint('sfAsphalt', px0 + 1, S.y0 + 1, 0.02, px0 + 13, S.y0 + 13, 0.03);
  T.paint('sfPaint', px0 + 6.9, S.y0 + 1, 0.03, px0 + 7.1, S.y0 + 13, 0.035, true);
  for (const y of [S.y0 + 1.5, S.y0 + 12.5]) {
    T.post('sfSteel', px0 + 7, y, 0, 3.05, 0.07, { kind: 'pole', name: 'hoop post' });
  }
  const cx = px0 + 17;
  const cy = S.y1 - 7;
  for (const [dx, dy] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) {
    T.post('sfRed', cx + dx, cy + dy, 0, 3.2, 0.08, { kind: 'pole', name: 'frame post' });
  }
  T.box('sfYellow', cx - 2.1, cy - 2.1, 2.0, cx + 2.1, cy + 2.1, 2.15, { kind: 'wall', name: 'deck' });
  T.prism('sfTeal', 'x', [[cy + 2.1, 0.1], [cy + 2.1, 0.25], [cy + 6.5, 0.4], [cy + 6.5, 0.25]].map(([y, h], k) => [k < 2 ? cy - 0.6 : cy + 0.6, h]), cx - 0.5, cx + 0.5);
  T.prism('sfTeal', 'y', [[cx + 2.1, 2.1], [cx + 6.0, 0.3], [cx + 6.0, 0.15], [cx + 2.1, 1.95]], cy - 0.55, cy + 0.55);
  T.hidden(cx + 2.1, cy - 0.5, 0.3, cx + 3.4, cy + 0.5, 1.4, 'wall', 'slide');
  T.cone('sfRed', cx, cy, 3.2, 2.6, 1.6, 4, false);
  T.hidden(cx - 1.6, cy - 1.6, 3.2, cx + 1.6, cy + 1.6, 3.8, 'wall', 'frame roof');
}

/* A yellow school bus, drawn and solid as its box. */
function schoolBus(T, px, py) {
  const len = 11;
  const w = 2.5;
  const x0 = px;
  const x1 = px + len;
  const y0 = py - w / 2;
  const y1 = py + w / 2;
  T.box('sfYellow', x0 + 1.4, y0, 0.55, x1, y1, 3.1, { kind: 'wall', name: 'bus' });
  T.box('sfYellow', x0, y0 + 0.1, 0.55, x0 + 1.4, y1 - 0.1, 2.0, { kind: 'wall', name: 'bus bonnet' });
  T.hidden(x0, y0, 0.1, x1, y1, 0.55, 'wall', 'bus');
  T.deco('sfYellow', x0 + 1.4, y0 + 0.05, 3.1, x1, y1 - 0.05, 3.25);
  for (const y of [y0 - 0.02, y1]) {
    for (let x = x0 + 2.4; x < x1 - 0.6; x += 1.05) {
      T.paint('sfGlassDark', x, y, 1.9, x + 0.85, y + 0.02, 2.75);
    }
    T.paint('sfIron', x0 + 1.4, y, 1.45, x1, y + 0.02, 1.55);
    T.paint('sfIron', x0 + 1.4, y, 1.0, x1, y + 0.02, 1.08);
  }
  T.paint('sfGlassDark', x0 + 1.38, y0 + 0.2, 1.95, x0 + 1.4, y1 - 0.2, 2.85);
  T.sign('schoolBus', (x0 + x1) / 2 + 0.6, y0 - 0.02, 2.35, 4.5, 0.4, 's', 0.0);
  T.sign('schoolBus', (x0 + x1) / 2 + 0.6, y1 + 0.02, 2.35, 4.5, 0.4, 'n', 0.0);
  for (const x of [x0 + 1.8, x1 - 2.2]) {
    for (const y of [y0 + 0.05, y1 - 0.05]) {
      T.cyl('sfTyre', [x, y - 0.18, 0.5], [x, y + 0.18, 0.5], 0.5, 12, null, false);
    }
  }
  T.deco('sfIron', x0 - 0.15, y0 + 0.1, 0.5, x0, y1 - 0.1, 0.8);
  /* The stop arm folded on its side. */
  T.paint('sfRed', x0 + 2.0, y0 - 0.06, 2.0, x0 + 2.6, y0 - 0.04, 2.6, true);
}

/* The white church with its steeple, on Oak Street north of the gas
 * station: a belfry you can fly through, north and south. */
export const CHURCH = { x0: 6, x1: 40, y0: 178, y1: 200, h: 7, tx: 23, ty: 180.5, tw: 5, belfry0: 13.5, belfry1: 17.0, top: 27 };

function church(T) {
  const C = CHURCH;
  T.box('sfTrim', C.x0, C.y0 + 3, 0, C.x1, C.y1, C.h, { kind: 'wall', name: 'church' });
  /* The nave's roof, its ridge east and west. */
  const span = C.y1 - (C.y0 + 3);
  const rise = 0.9 * span / 2;
  const m = (C.y0 + 3 + C.y1) / 2;
  T.prism('sfTrim', 'x', [[C.y0 + 3, C.h], [m, C.h + rise], [C.y1, C.h]], C.x0, C.x1);
  T.prism('sfRoofSlate', 'x', [[C.y0 + 2.6, C.h - 0.3], [m, C.h + rise + 0.05], [m, C.h + rise + 0.3], [C.y0 + 2.6, C.h - 0.1]], C.x0 - 0.4, C.x1 + 0.4);
  T.prism('sfRoofSlate', 'x', [[m, C.h + rise + 0.05], [C.y1 + 0.4, C.h - 0.3], [C.y1 + 0.4, C.h - 0.1], [m, C.h + rise + 0.3]], C.x0 - 0.4, C.x1 + 0.4);
  for (let h = C.h; h < C.h + rise - 0.3; h += 0.4) {
    const half = ((C.h + rise - (h + 0.4)) / rise) * (span / 2);
    if (half > 0.2) {
      T.hidden(C.x0, m - half, h, C.x1, m + half, h + 0.4, 'wall', 'church roof');
    }
  }
  /* Tall arched windows down the sides. */
  for (let x = C.x0 + 3; x < C.x1 - 2; x += 4) {
    if (Math.abs(x - C.tx) < 4) {
      continue;
    }
    for (const [y, f] of [[C.y0 + 3 - 0.05, 's'], [C.y1, 'n']]) {
      T.paint('sfGlass', x - 0.6, y, 1.5, x + 0.6, y + 0.05, 5.0);
      T.cyl('sfGlass', [x, y + (f === 's' ? 0 : 0.05), 5.0], [x, y + (f === 's' ? 0.05 : 0), 5.0], 0.6, 10, null, true);
    }
  }
  /* The tower on the front, the belfry open north and south, the spire. */
  const t = C.tw / 2;
  T.box('sfTrim', C.tx - t, C.y0, 0, C.tx + t, C.y0 + C.tw, C.belfry0, { kind: 'wall', name: 'church tower' });
  T.paint('sfWood', C.tx - 1.0, C.y0 - 0.05, 0, C.tx + 1.0, C.y0, 3.2);
  T.cyl('sfWood', [C.tx, C.y0 - 0.05, 3.2], [C.tx, C.y0, 3.2], 1.0, 12, null, true);
  T.paint('sfGlass', C.tx - 0.7, C.y0 - 0.05, 6.5, C.tx + 0.7, C.y0, 9.0);
  for (const x of [C.tx - t, C.tx + t - 0.8]) {
    T.box('sfTrim', x, C.y0, C.belfry0, x + 0.8, C.y0 + C.tw, C.belfry1, { kind: 'wall', name: 'belfry post' });
  }
  T.box('sfTrim', C.tx - t, C.y0, C.belfry1, C.tx + t, C.y0 + C.tw, C.belfry1 + 0.8, { kind: 'wall', name: 'belfry top' });
  T.cyl('sfYellow', [C.tx, C.y0 + t, C.belfry1 - 0.2], [C.tx, C.y0 + t, C.belfry1 - 0.9], 0.2, 12, 0.5);
  T.cap('sfYellow', [C.tx, C.y0 + t, C.belfry1 - 0.5], [C.tx, C.y0 + t, C.belfry1 - 0.45], 0.38, { draw: false, kind: 'wall', name: 'bell' });
  T.cone('sfRoofSlate', C.tx, C.y0 + t, C.belfry1 + 0.8, t + 0.1, C.top - C.belfry1 - 0.8, 4, false);
  T.post('sfRoofSlate', C.tx, C.y0 + t, C.belfry1 + 0.8, C.belfry1 + 3.6, 1.4, { draw: false, kind: 'wall', name: 'spire' });
  T.post('sfRoofSlate', C.tx, C.y0 + t, C.belfry1 + 3.6, C.top - 2.5, 0.5, { draw: false, kind: 'wall', name: 'spire' });
  T.cap('sfYellow', [C.tx, C.y0 + t, C.top - 0.2], [C.tx, C.y0 + t, C.top + 1.6], 0.06, { kind: 'pole', name: 'cross' });
  T.cap('sfYellow', [C.tx - 0.5, C.y0 + t, C.top + 1.0], [C.tx + 0.5, C.y0 + t, C.top + 1.0], 0.06, { kind: 'pole', name: 'cross' });
  /* The sign board on the lawn: its letters change on nobody's say. */
  T.box('sfWood', C.tx + 6, C.y0 - 4.2, 0, C.tx + 6.2, C.y0 - 4.0, 0.6, { solid: false });
  T.box('sfTrim', C.tx + 4.2, C.y0 - 4.3, 0.6, C.tx + 8.2, C.y0 - 3.9, 2.4, { kind: 'wall', name: 'church sign' });
  T.sign('churchSign', C.tx + 6.2, C.y0 - 4.31, 1.5, 3.7, 1.6, 's', 0.005);
  /* A picket fence along the front and graves of nobody behind. */
  for (let x = C.x0 + 3; x < C.x1 - 2; x += 3.2) {
    T.box('sfStone', x - 0.4, C.y1 + 2.5, 0, x + 0.4, C.y1 + 2.7, 1.0, { kind: 'wall', name: 'headstone' });
  }
}

export function downtown(T) {
  southSide(T);
  gasStation(T);
  donutShop(T);
  burgerBarn(T);
  pizza(T);
  townSquare(T);
  bowling(T);
  townHall(T);
  fireStation(T);
  school(T);
  church(T);
  void MILL_X;
  void PLANT_X;
}
