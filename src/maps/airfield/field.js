/*
 * field.js: everything on Kazami Airfield's floor but the hangar. The mown
 * strip and its markers, the windsocks, the clubhouse and its tower cab,
 * the open sheds, the fuel stand, the signal square, the two bridges over
 * the channel, the shrine up the paddies, the radio mast, and the race's
 * fourteen gates. Pure, as ./frame.js is.
 *
 * REAL SIZES, so a pilot who knows a small field finds it right: the strip
 * is 30 m wide, a grass runway's usual width at a field this size; a
 * windsock is the common 12 foot one (3.66 m long, 0.91 m at the throat)
 * on a 6 m mast; a torii's pillars stand about 3.6 m apart; the channel
 * is a farm channel's 4.4 m. The clubhouse is two storeys of a prefab
 * office, the tower cab a glass box on its roof at about 9 m, which is
 * the kind a gliding club or a small field puts up.
 *
 * WORDS. Every sign is the field's own (./signs.js): the field's name,
 * the hangar's number, the Japanese safety signs any hangar has. No brand.
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

import { sincos } from '../../props/trig.js';
import { CHANNEL, stepTop, wallPy, PROFILE } from './valley.js';
import { rng } from './frame.js';

const SC = { s: 0, c: 0 };

/* The strip: its middle line, its ends, its width. Runs east and west. */
export const STRIP = { y: 178, x0: 52, x1: 428, w: 30 };

/* The clubhouse and the tower cab on its roof. */
export const CLUB = { x0: 248, x1: 268, y0: 226, y1: 238, floor: 3.2, roof: 6.4, balcony: 1.8 };
export const CAB = { x0: 262.5, x1: 267.5, y0: 228, y1: 234, h0: 8.6, h1: 11.0 };

/* The open sheds west of the hangar: eight bays, the third pair's back
 * door open through. */
export const SHEDS = { x0: 118, x1: 190, y0: 228, y1: 241, front: 4.6, back: 3.6, bay: 9, door: { x0: 160.5, x1: 166.5, h: 3.0 } };

/* The bridges over the channel. */
export const RED_BRIDGE = { px: 395, w: 1.8, crown: 1.25 };
export const FARM_BRIDGE = { px: 150, w: 4.2, deck: 0.0, thick: 0.32 };

/* The shrine on the fourth paddy bench, above the torii at the floor's
 * edge, the stair straight up the walls between them. */
export const SHRINE = { px: 395, bench: 3 };

/* The windsocks, west and east of the strip on its north side. */
export const SOCKS = [{ px: 70, py: 202 }, { px: 412, py: 202 }];

/* ---------------------------------------------------------------- *
 * Small builders.
 * ---------------------------------------------------------------- */

/* A tube in red and white bands, the way an airfield paints what sticks up
 * near it: one solid capsule, drawn in half metre bands. */
function striped(T, a, b, r, name, band = 0.5) {
  T.cap('mastRed', a, b, r, { draw: false, kind: 'pole', name });
  const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const n = Math.max(1, Math.round(len / band));
  for (let i = 0; i < n; i += 1) {
    const f0 = i / n;
    const f1 = (i + 1) / n;
    const p = (f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
    T.cyl(i % 2 ? 'mastWhite' : 'mastRed', p(f0), p(f1), r, 8);
  }
}

/* A sloped roof over a plan rectangle, high at `y0`, low at `y1`, drawn as
 * a prism along x and solid as slabs a metre deep, each between the
 * drawn underside's highest point and the top's lowest over its stretch. */
function slopedRoof(T, m, x0, x1, y0, y1, h0, h1, t, name) {
  T.prism(m, 'x', [[y0, h0], [y1, h1], [y1, h1 - t], [y0, h0 - t]], x0, x1);
  const n = Math.ceil(Math.abs(y1 - y0));
  for (let i = 0; i < n; i += 1) {
    const ya = y0 + ((y1 - y0) * i) / n;
    const yb = y0 + ((y1 - y0) * (i + 1)) / n;
    const ha = h0 + ((h1 - h0) * i) / n;
    const hb = h0 + ((h1 - h0) * (i + 1)) / n;
    const top = Math.min(ha, hb);
    const under = Math.max(ha, hb) - t;
    if (top - under > 0.02) {
      T.hidden(x0, Math.min(ya, yb), under, x1, Math.max(ya, yb), top, 'wall', name);
    }
  }
}

/* ---------------------------------------------------------------- *
 * The strip.
 * ---------------------------------------------------------------- */

function strip(T) {
  const S = STRIP;
  const y0 = S.y - S.w / 2;
  const y1 = S.y + S.w / 2;
  /* Mown in bands along its length, as a grass runway is cut: light and
   * dark by the way the mower went. */
  for (let x = S.x0, i = 0; x < S.x1; x += 12, i += 1) {
    T.paint(i % 2 ? 'afMownDark' : 'afMown', x, y0, 0.0, Math.min(S.x1, x + 12), y1, 0.02);
  }
  /* The thresholds: chalk bars across each end, and the numbers. */
  for (const [x, dir] of [[S.x0, 1], [S.x1, -1]]) {
    for (let j = 0; j < 8; j += 1) {
      const y = y0 + 2 + j * 3.4;
      T.paint('afChalk', Math.min(x + dir * 2, x + dir * 12), y, 0.02, Math.max(x + dir * 2, x + dir * 12), y + 1.8, 0.03);
    }
    T.sign(dir > 0 ? 'rwy09' : 'rwy27', x + dir * 20, S.y, 0.04, 9, 6, dir > 0 ? 'upE' : 'upW');
  }
  /* The edge markers: half buried tyres painted white, every 50 m down
   * both sides, as a grass strip's edges are marked. */
  for (let x = S.x0; x <= S.x1 + 0.1; x += 47) {
    for (const y of [y0 - 0.6, y1 + 0.6]) {
      T.torus('afTyreWhite', x, y, 0.05, 0.38, 0.14, 1, 0, 6, 14);
      T.hidden(x - 0.2, y - 0.52, 0, x + 0.2, y + 0.52, 0.42, 'obstacle', 'marker tyre');
    }
  }
  /* The taxiway from the apron, a darker mown lane. */
  T.paint('afMownDark', 214, y1, 0.0, 226, 205, 0.02);
  /* The apron, concrete, in front of the hangar and the clubhouse. */
  T.paint('concrete', 150, 205, 0.0, 300, 222, 0.03);
  T.paint('concrete', 238, 222, 0.0, 300, 226, 0.03);
  T.dress(() => T.wide(() => {
    for (let x = 156; x < 300; x += 6) {
      T.paint('concreteMid', x, 205, 0.03, x + 0.08, 222, 0.035);
    }
    for (let y = 211; y < 222; y += 6) {
      T.paint('concreteMid', 150, y, 0.03, 300, y + 0.08, 0.035);
    }
    /* Tie down rings and a yellow parking line out of the hangar. */
    T.paint('afFloorLine', 219.92, 192, 0.035, 220.08, 222, 0.04);
    for (const x of [160, 180, 270, 290]) {
      T.paint('afFloorLine', x - 2, 213.4, 0.035, x + 2, 213.6, 0.04);
      T.paint('afFloorLine', x - 0.1, 211, 0.035, x + 0.1, 216, 0.04);
    }
  }));
}

/* A windsock on its 6 m mast, the sock blown east and a little down, in
 * five bands, a ring of white stones round its foot. */
function windsock(T, s) {
  striped(T, [s.px, s.py, 0], [s.px, s.py, 6], 0.07, 'windsock mast', 1.2);
  T.cyl('metalDark', [s.px, s.py, 5.75], [s.px + 0.5, s.py, 5.75], 0.03, 4);
  /* The sock: 3.66 m long, from 0.91 m to 0.45 m across, drooping 12
   * degrees. */
  const L = 3.66;
  sincos(-12 * (Math.PI / 180), SC);
  const dx = SC.c;
  const dz = SC.s;
  const r0 = 0.455;
  const r1 = 0.225;
  for (let i = 0; i < 5; i += 1) {
    const f0 = i / 5;
    const f1 = (i + 1) / 5;
    const a = [s.px + 0.5 + dx * L * f0, s.py, 5.75 + dz * L * f0];
    const b = [s.px + 0.5 + dx * L * f1, s.py, 5.75 + dz * L * f1];
    T.cyl(i % 2 ? 'afSockWhite' : 'afSock', a, b, r0 + (r1 - r0) * f0, 12, r0 + (r1 - r0) * f1);
  }
  T.cap('afSock', [s.px + 0.5, s.py, 5.75], [s.px + 0.5 + dx * L, s.py, 5.75 + dz * L], 0.3, { draw: false, kind: 'obstacle', name: 'windsock' });
  T.torus('metalDark', s.px + 0.5, s.py, 5.75, r0 + 0.01, 0.025, 1, 0, 4, 18);
  T.dress(() => T.wide(() => {
    for (let i = 0; i < 16; i += 1) {
      sincos((i / 16) * Math.PI * 2, SC);
      T.ball('afChalk', s.px + 4 * SC.c, s.py + 4 * SC.s, 0.05, 0.22);
    }
  }));
}

/* The signal square by the clubhouse and the landing T in it. */
function signalSquare(T) {
  const x = 302;
  const y = 201;
  T.paint('afChalk', x - 4.5, y - 4.5, 0.02, x + 4.5, y + 4.5, 0.03);
  T.paint('afMownDark', x - 4.1, y - 4.1, 0.03, x + 4.1, y + 4.1, 0.035);
  /* The T, its bar across the wind and its stem pointing the way to land. */
  T.paint('afChalk', x + 1.2, y - 2.4, 0.035, x + 1.8, y + 2.4, 0.045);
  T.paint('afChalk', x - 2.6, y - 0.3, 0.035, x + 1.2, y + 0.3, 0.045);
}

/* ---------------------------------------------------------------- *
 * The clubhouse and its tower cab.
 * ---------------------------------------------------------------- */

function clubhouse(T) {
  const C = CLUB;
  const f = C.floor;
  /* The block: two storeys of cream prefab panel on a plinth. */
  T.box('concrete', C.x0 - 0.1, C.y0 - 0.1, 0, C.x1 + 0.1, C.y1 + 0.1, 0.35, { kind: 'wall', name: 'clubhouse' });
  T.box('wallCream', C.x0, C.y0, 0.35, C.x1, C.y1, C.roof, { kind: 'wall', name: 'clubhouse' });
  T.box('wallCream', C.x0 - 0.15, C.y0 - 0.15, C.roof, C.x1 + 0.15, C.y1 + 0.15, C.roof + 0.5, { kind: 'wall', name: 'parapet' });
  T.deco('trim', C.x0 - 0.18, C.y0 - 0.18, C.roof + 0.42, C.x1 + 0.18, C.y1 + 0.18, C.roof + 0.55);
  T.deco('trim', C.x0 - 0.04, C.y0 - 0.04, f - 0.1, C.x1 + 0.04, C.y1 + 0.04, f + 0.08);
  /* The front: glass doors, the windows up and down, the field's name. */
  T.paint('glassBlue', 250.5, C.y0 - 0.02, 0.35, 253.5, C.y0 - 0.01, 2.6);
  T.deco('trim', 250.4, C.y0 - 0.05, 2.6, 253.6, C.y0, 2.75);
  T.deco('trim', 251.95, C.y0 - 0.05, 0.35, 252.05, C.y0, 2.6);
  for (const x of [255, 259.5, 264]) {
    T.paint('glassBlue', x, C.y0 - 0.02, 1.0, x + 3, C.y0 - 0.01, 2.4);
    T.deco('trim', x - 0.05, C.y0 - 0.06, 0.94, x + 3.05, C.y0, 1.0);
  }
  for (const x of [249, 253.5, 258, 262.5]) {
    T.paint('glassBlue', x, C.y0 - 0.02, f + 0.8, x + 3.6, C.y0 - 0.01, f + 2.5);
    T.deco('trim', x + 1.75, C.y0 - 0.04, f + 0.8, x + 1.85, C.y0, f + 2.5);
  }
  T.sign('clubName', (C.x0 + C.x1) / 2, C.y0 - 0.17, C.roof + 0.26, 12, 0.9, 's');
  T.sign('clubDoor', 252, C.y0 - 0.06, 2.95, 2.6, 0.4, 's');
  /* The sides and back: windows, a door, air conditioners, the gutter. */
  for (const y of [228, 232.5]) {
    T.paint('glassBlue', C.x1 + 0.01, y, f + 0.9, C.x1 + 0.02, y + 2.6, f + 2.4);
    T.paint('glassBlue', C.x0 - 0.02, y, 1.0, C.x0 - 0.01, y + 2.6, 2.3);
  }
  for (const x of [250, 256, 262]) {
    T.paint('glassBlue', x, C.y1 + 0.01, f + 1.2, x + 2, C.y1 + 0.02, f + 2.3);
  }
  for (const [x, y, h] of [[C.x1 + 0.38, 236, 0.4], [C.x1 + 0.38, 236, f + 0.4]]) {
    T.box('acUnit', C.x1, y - 0.42, h, x, y + 0.42, h + 0.6, { kind: 'obstacle', name: 'ac unit' });
    T.disc('metalDark', x + 0.005, y, 0.22, h + 0.3, h + 0.3, 10);
  }
  T.cyl('metalDark', [C.x0 + 0.2, C.y1 + 0.15, 0.1], [C.x0 + 0.2, C.y1 + 0.15, C.roof + 0.3], 0.05, 6);
  /* The balcony along the front at the first floor, on steel posts, its
   * rail; the stair up its west end. */
  const b0 = C.y0 - C.balcony;
  T.box('concreteMid', C.x0, b0, f, C.x1, C.y0, f + 0.2, { kind: 'wall', name: 'balcony' });
  for (let x = C.x0 + 0.3; x <= C.x1 - 0.2; x += 4.9) {
    T.post('afFrame', x, b0 + 0.15, 0, f, 0.08, { kind: 'pole', name: 'balcony post' });
  }
  T.box('afFrame', C.x0, b0 - 0.02, f + 1.0, C.x1, b0 + 0.04, f + 1.08, { kind: 'wall', name: 'balcony rail' });
  T.dress(() => {
    for (let x = C.x0 + 0.2; x < C.x1; x += 0.5) {
      T.cyl('afFrame', [x, b0 + 0.01, f + 0.2], [x, b0 + 0.01, f + 1.0], 0.012, 3);
    }
  });
  T.hidden(C.x0, b0 - 0.02, f + 0.2, C.x1, b0 + 0.04, f + 1.0, 'wall', 'balcony rail');
  for (let i = 0; i < 9; i += 1) {
    const h = (f * (i + 1)) / 9;
    const x = C.x0 - 0.6 - 0.3 * i;
    T.box('afFrame', x - 0.3, C.y0 + 0.3, h - 0.06, x, C.y0 + 1.5, h, { kind: 'wall', name: 'stair' });
  }
  T.cap('afFrame', [C.x0 - 0.6, C.y0 + 0.3, 1.0], [C.x0 - 3.3, C.y0 + 0.3, f + 1.0], 0.03, { kind: 'pole', name: 'stair rail' });
  /* The cab: a concrete shaft through the roof, the glass box with its
   * corner posts, the walkway round it, the roof cap, the beacon and the
   * weather mast. */
  const K = CAB;
  T.box('concreteMid', K.x0 + 0.5, K.y0 + 0.5, C.roof, K.x1 - 0.5, K.y1 - 0.5, K.h0, { kind: 'wall', name: 'tower' });
  T.box('concrete', K.x0 - 0.6, K.y0 - 0.6, K.h0 - 0.15, K.x1 + 0.6, K.y1 + 0.6, K.h0, { kind: 'wall', name: 'tower walkway' });
  T.box('afCab', K.x0, K.y0, K.h0, K.x1, K.y1, K.h1, { kind: 'wall', name: 'tower cab' });
  for (const [x, y] of [[K.x0, K.y0], [K.x1, K.y0], [K.x0, K.y1], [K.x1, K.y1], [(K.x0 + K.x1) / 2, K.y0], [(K.x0 + K.x1) / 2, K.y1]]) {
    T.post('afFrame', x, y, K.h0, K.h1, 0.06, { solid: false });
  }
  T.deco('afFrame', K.x0 - 0.02, K.y0 - 0.02, K.h0 + 1.0, K.x1 + 0.02, K.y1 + 0.02, K.h0 + 1.08);
  T.box('afRoof', K.x0 - 0.5, K.y0 - 0.5, K.h1, K.x1 + 0.5, K.y1 + 0.5, K.h1 + 0.3, { kind: 'wall', name: 'cab roof' });
  T.box('afFrame', K.x0 - 0.6, K.y0 - 0.62, K.h0 + 0.95, K.x1 + 0.6, K.y0 - 0.56, K.h0 + 1.0, { kind: 'wall', name: 'walkway rail' });
  T.hidden(K.x0 - 0.6, K.y0 - 0.62, K.h0, K.x1 + 0.6, K.y0 - 0.56, K.h0 + 1.0, 'wall', 'walkway rail');
  const bx = (K.x0 + K.x1) / 2;
  const by = (K.y0 + K.y1) / 2;
  T.post('afFrame', bx, by, K.h1 + 0.3, K.h1 + 1.2, 0.05, { kind: 'pole', name: 'beacon post' });
  T.cyl('afBeaconGreen', [bx, by, K.h1 + 1.2], [bx, by, K.h1 + 1.55], 0.22, 10);
  T.ball('lampGlow', bx, by, K.h1 + 1.62, 0.12);
  T.post('metal', K.x0 + 0.3, K.y1 - 0.3, K.h1 + 0.3, K.h1 + 3.2, 0.04, { kind: 'pole', name: 'weather mast' });
  for (let i = 0; i < 3; i += 1) {
    sincos((i / 3) * Math.PI * 2, SC);
    const x = K.x0 + 0.3 + 0.3 * SC.c;
    const y = K.y1 - 0.3 + 0.3 * SC.s;
    T.cyl('metal', [K.x0 + 0.3, K.y1 - 0.3, K.h1 + 3.2], [x, y, K.h1 + 3.2], 0.012, 3);
    T.ball('metalDark', x, y, K.h1 + 3.2, 0.06);
  }
  T.box('afSock', K.x0 + 0.25, K.y1 - 0.32, K.h1 + 2.85, K.x0 + 0.85, K.y1 - 0.28, K.h1 + 3.0, { solid: false });
  /* By the door: a bench, a bicycle, two planters, a sign board. */
  T.dress(() => {
    T.box('afBench2', 254.5, 224.6, 0.42, 257, 225.1, 0.5, { solid: false });
    for (const x of [254.7, 256.8]) {
      T.box('afFrame', x - 0.04, 224.65, 0, x + 0.04, 225.05, 0.42, { solid: false });
    }
    for (const x of [249.2, 254]) {
      T.box('afStoneDark', x - 0.35, 225.2, 0, x + 0.35, 225.8, 0.5, { solid: false });
      T.ball('leaf1', x, 225.5, 0.75, 0.38);
    }
    T.cyl('afTyre', [258.4, 225.4, 0.34], [258.4, 225.6, 0.34], 0.33, 10);
    T.cyl('afTyre', [259.5, 225.4, 0.34], [259.5, 225.6, 0.34], 0.33, 10);
    T.cyl('afPlaneNavy', [258.4, 225.5, 0.34], [259.1, 225.5, 0.9], 0.03, 4);
    T.cyl('afPlaneNavy', [259.5, 225.5, 0.34], [259.1, 225.5, 0.9], 0.03, 4);
    T.cyl('afFrame', [259.1, 225.5, 0.9], [258.6, 225.5, 1.0], 0.025, 4);
  });
}

/* ---------------------------------------------------------------- *
 * The sheds, the fuel stand, the mast.
 * ---------------------------------------------------------------- */

function sheds(T) {
  const S = SHEDS;
  const t = 0.18;
  /* The back wall, the door through it in the middle compartment. */
  const back = S.y1 - 0.2;
  T.box('sheetGreen', S.x0, back, 0, S.door.x0, S.y1, S.back, { kind: 'wall', name: 'shed back' });
  T.box('sheetGreen', S.door.x1, back, 0, S.x1, S.y1, S.back, { kind: 'wall', name: 'shed back' });
  T.box('sheetGreen', S.door.x0, back, S.door.h, S.door.x1, S.y1, S.back, { kind: 'wall', name: 'shed back' });
  T.deco('shutter', S.door.x0, S.y1, S.door.h - 0.5, S.door.x1, S.y1 + 0.25, S.door.h);
  /* The partitions, every two bays, short of the front. */
  for (let x = S.x0; x <= S.x1 + 0.01; x += 2 * S.bay) {
    T.box('sheetGreen', x - 0.1, S.y0 + 1.6, 0, x + 0.1, back, S.back, { kind: 'wall', name: 'shed partition' });
  }
  /* The roof and its posts along the front. */
  slopedRoof(T, 'sheetGreenRib', S.x0 - 0.3, S.x1 + 0.3, S.y0 - 0.6, S.y1 + 0.3, S.front + 0.05, S.back - 0.05, t, 'shed roof');
  for (let x = S.x0; x <= S.x1 + 0.01; x += S.bay) {
    T.post('afFrame', x, S.y0 + 0.2, 0, S.front - 0.1, 0.09, { kind: 'pole', name: 'shed post' });
  }
  T.box('afFrame', S.x0, S.y0 + 0.05, S.front - 0.45, S.x1, S.y0 + 0.35, S.front - 0.12, { kind: 'wall', name: 'shed beam' });
  T.dress(() => T.wide(() => {
    for (let x = S.x0; x < S.x1; x += 0.8) {
      T.prism('sheetGreen', 'x', [[S.y0 - 0.6, S.front + 0.06], [S.y1 + 0.3, S.back - 0.04], [S.y1 + 0.3, S.back - 0.08], [S.y0 - 0.6, S.front + 0.02]], x, x + 0.08);
    }
  }));
  /* In the bays: a weight shift trike, a tractor, hay, the glider winch,
   * pallets. */
  T.dress(() => {
    /* The trike: its wing on a mast, its pod, three wheels. */
    T.cyl('afFrame', [127, 234, 0.5], [127, 234, 2.6], 0.04, 4);
    T.prism('afBannerRed', 'y', [[122.5, 2.75], [127, 3.2], [131.5, 2.75], [127, 2.6]], 232.5, 235.5);
    T.box('afPlane', 126.6, 232.8, 0.35, 127.4, 234.6, 1.1, { solid: false });
    for (const [x, y] of [[126.3, 234.2], [127.7, 234.2], [127, 232.6]]) {
      T.cyl('afTyre', [x - 0.05, y, 0.22], [x + 0.05, y, 0.22], 0.22, 8);
    }
    /* Hay, round bales wrapped white, three in the second bay. */
    for (const [x, y] of [[139, 237.5], [141, 237.5], [140, 237.5]]) {
      T.cyl('afSockWhite', [x - 0.6, y, 0.75], [x + 0.6, y, 0.75], 0.75, 12);
    }
    /* Pallets stacked. */
    for (let i = 0; i < 6; i += 1) {
      T.box('afBench2', 182, 236.5, i * 0.15, 183.2, 237.5, i * 0.15 + 0.12, { solid: false });
    }
  });
  T.hidden(138.2, 236.7, 0, 141.8, 238.3, 1.5, 'obstacle', 'hay');
  /* The tractor, a small Japanese farm one, orange. */
  T.box('containerOrange', 145.5, 233, 0.5, 147.1, 236, 1.4, { kind: 'obstacle', name: 'tractor' });
  T.box('containerOrange', 145.7, 233.1, 1.4, 146.9, 234.1, 2.0, { kind: 'obstacle', name: 'tractor' });
  T.cyl('afTyre', [145.3, 235.2, 0.62], [147.3, 235.2, 0.62], 0.62, 12);
  T.cyl('afTyre', [145.6, 233.4, 0.38], [147.0, 233.4, 0.38], 0.38, 10);
  T.post('metalDark', 146.3, 236.2, 1.4, 2.6, 0.04, { kind: 'pole', name: 'exhaust' });
  /* The glider winch: a truck with two cable drums behind its cab. */
  T.box('afPlaneNavy', 173, 232, 0.6, 175.2, 234.4, 2.5, { kind: 'obstacle', name: 'winch truck' });
  T.box('afPlaneNavy', 173, 234.4, 0.6, 175.2, 239.6, 1.4, { kind: 'obstacle', name: 'winch truck' });
  T.box('afCanopy', 173.1, 231.96, 1.6, 175.1, 232.0, 2.3, { solid: false });
  for (const y of [236, 238]) {
    T.cyl('metal', [173.2, y, 1.9], [175.0, y, 1.9], 0.55, 14);
    T.disc('afFrame', 173.2, y, 0.6, 1.3, 1.3, 14);
  }
  for (const y of [233.2, 237, 238.6]) {
    T.cyl('afTyre', [172.9, y, 0.45], [175.3, y, 0.45], 0.45, 10);
  }
}

function fuel(T) {
  /* The fuel stand at the east end of the apron: a tank on saddles, its
   * pump, a sign, yellow bollards. */
  T.cyl('afPlane', [293, 217.5, 1.55], [297.4, 217.5, 1.55], 1.05, 16);
  T.cap('afPlane', [293.2, 217.5, 1.55], [297.2, 217.5, 1.55], 1.0, { draw: false, kind: 'obstacle', name: 'fuel tank' });
  T.deco('afPlaneRed', 294.9, 216.42, 1.2, 295.5, 218.58, 1.9);
  for (const x of [293.6, 296.8]) {
    T.box('concrete', x - 0.25, 216.6, 0, x + 0.25, 218.4, 0.75, { kind: 'wall', name: 'saddle' });
  }
  T.box('afPlaneRed', 298.6, 216.9, 0, 299.4, 217.6, 1.5, { kind: 'obstacle', name: 'pump' });
  T.paint('afCab', 298.7, 216.88, 0.9, 299.3, 216.89, 1.3);
  T.sign('fuelSign', 299, 216.8, 1.95, 0.9, 0.42, 's');
  for (const [x, y] of [[292, 215.4], [300.5, 215.4], [292, 219.6], [300.5, 219.6]]) {
    striped(T, [x, y, 0], [x, y, 0.9], 0.08, 'bollard', 0.3);
  }
}

/* The radio mast up the north slope, red and white, three guys. */
export const MAST = { px: 74, py: 318 };
function mast(T) {
  const h0 = stepTop(MAST.px, MAST.py);
  const top = h0 + 30;
  for (let i = 0; i < 3; i += 1) {
    const f = i / 3;
    sincos(f * Math.PI * 2 + 0.3, SC);
    const leg = [MAST.px + 0.55 * SC.c, MAST.py + 0.55 * SC.s];
    striped(T, [leg[0], leg[1], h0], [leg[0], leg[1], top], 0.06, 'mast', 4.3);
  }
  T.dress(() => {
    for (let h = h0 + 1.5; h < top; h += 1.5) {
      for (let i = 0; i < 3; i += 1) {
        sincos((i / 3) * Math.PI * 2 + 0.3, SC);
        const a = [MAST.px + 0.55 * SC.c, MAST.py + 0.55 * SC.s];
        sincos(((i + 1) / 3) * Math.PI * 2 + 0.3, SC);
        const b = [MAST.px + 0.55 * SC.c, MAST.py + 0.55 * SC.s];
        T.cyl('mastWhite', [a[0], a[1], h], [b[0], b[1], h + 0.75], 0.025, 3);
      }
    }
  });
  T.ball('lampRed', MAST.px, MAST.py, top + 0.25, 0.2);
  /* The guys, out to anchors on the benches around. */
  for (let i = 0; i < 3; i += 1) {
    sincos((i / 3) * Math.PI * 2 + 1.35, SC);
    const ax = MAST.px + 20 * SC.c;
    const ay = MAST.py + 20 * SC.s;
    const ah = stepTop(ax, ay);
    T.wire('rope', [MAST.px, MAST.py, top - 3], [ax, ay, ah + 0.3], 0.15, 0.025);
    T.box('concrete', ax - 0.5, ay - 0.5, ah - 0.2, ax + 0.5, ay + 0.5, ah + 0.35, { kind: 'wall', name: 'guy anchor' });
  }
}

/* ---------------------------------------------------------------- *
 * The bridges and the shrine.
 * ---------------------------------------------------------------- */

function bridges(T) {
  const C = CHANNEL;
  const ya = C.y0 - C.wall - 1.2;
  const yb = C.y1 + C.wall + 1.2;
  /* The red bridge, a little drum bridge (taikobashi) for the shrine's
   * path: an arched deck in vermilion, rails with bronze caps. The deck is
   * an arch of parabola, solid as slices under it. */
  const B = RED_BRIDGE;
  const n = 14;
  const prof = [];
  const under = [];
  const archH = (u) => B.crown * (1 - u * u);
  for (let i = 0; i <= n; i += 1) {
    const u = -1 + (2 * i) / n;
    const y = (ya + yb) / 2 + (u * (yb - ya)) / 2;
    prof.push([y, archH(u) + 0.12]);
    under.push([y, archH(u) - 0.18]);
  }
  T.prism('afShrine', 'x', [...prof, ...under.reverse()], B.px - B.w / 2, B.px + B.w / 2);
  for (let i = 0; i < n; i += 1) {
    const y0 = prof[i][0];
    const y1 = prof[i + 1][0];
    const lo = Math.max(under[n - i][1], under[n - i - 1][1]);
    const hi = Math.min(prof[i][1], prof[i + 1][1]);
    if (hi - lo > 0.04) {
      T.hidden(B.px - B.w / 2, y0, lo, B.px + B.w / 2, y1, hi, 'wall', 'red bridge');
    }
  }
  for (const s of [-1, 1]) {
    const x = B.px + s * (B.w / 2 - 0.08);
    for (let i = 0; i <= n; i += 2) {
      const [y, h] = prof[i];
      T.post('afShrine', x, y, h, h + 0.85, 0.06, { kind: 'pole', name: 'bridge rail' });
      if (i === 0 || i === n) {
        T.ball('afHasa', x, y, h + 0.95, 0.11);
      }
    }
    for (let i = 0; i < n; i += 1) {
      const [y0, h0] = prof[i];
      const [y1, h1] = prof[i + 1];
      T.cap('afShrine', [x, y0, h0 + 0.82], [x, y1, h1 + 0.82], 0.045, { kind: 'pole', name: 'bridge rail' });
    }
  }
  /* The farm bridge: a flat concrete deck with low kerbs. */
  const F = FARM_BRIDGE;
  T.box('concreteMid', F.px - F.w / 2, ya, F.deck - F.thick, F.px + F.w / 2, yb, F.deck, { kind: 'wall', name: 'farm bridge' });
  for (const s of [-1, 1]) {
    T.box('concrete', F.px + s * (F.w / 2) - 0.15, ya, F.deck, F.px + s * (F.w / 2) + 0.15, yb, F.deck + 0.35, { kind: 'wall', name: 'kerb' });
  }
  /* The farm track along the south of the floor, beaten earth. */
  T.paint('afEarth', 0, 97.6, 0.0, 480, 101.4, 0.015);
  T.paint('afEarth', F.px - 2, 101.4, 0.0, F.px + 2, 120, 0.015);
}

/* A stone lantern (toro): base, post, the light box, its roof, a knob. */
function lantern(T, px, py, h) {
  T.box('afLantern', px - 0.35, py - 0.35, h, px + 0.35, py + 0.35, h + 0.25, { kind: 'obstacle', name: 'lantern' });
  T.cyl('afLantern', [px, py, h + 0.25], [px, py, h + 1.1], 0.14, 8);
  T.box('afLantern', px - 0.3, py - 0.3, h + 1.1, px + 0.3, py + 0.3, h + 1.5, { kind: 'obstacle', name: 'lantern' });
  T.paint('afShrineDark', px - 0.12, py - 0.31, h + 1.18, px + 0.12, py - 0.3, h + 1.42);
  T.frustum('afLantern', { x0: px - 0.48, y0: py - 0.48, x1: px + 0.48, y1: py + 0.48 }, h + 1.5, { x0: px - 0.08, y0: py - 0.08, x1: px + 0.08, y1: py + 0.08 }, h + 1.85);
  T.ball('afLantern', px, py, h + 1.92, 0.09);
  T.hidden(px - 0.3, py - 0.3, h + 0.25, px + 0.3, py + 0.3, h + 1.1, 'obstacle', 'lantern');
}

/* A torii, myojin style, its pillars `span` apart, facing along plan y. */
function torii(T, px, py, h, span, height) {
  const r = 0.17;
  for (const s of [-1, 1]) {
    const x = px + s * span / 2;
    T.post('afShrine', x, py, h, h + height, r, { kind: 'pole', name: 'torii' });
    T.cyl('afShrineDark', [x, py, h], [x, py, h + 0.35], r + 0.04, 10);
  }
  /* The nuki, the tie through the pillars, and the kasagi on top, its
   * ends turned up, black over vermilion. */
  T.box('afShrine', px - span / 2 - 0.55, py - 0.12, h + height - 0.95, px + span / 2 + 0.55, py + 0.12, h + height - 0.7, { kind: 'wall', name: 'torii' });
  const k0 = h + height;
  const ends = span / 2 + 1.0;
  T.prism('afShrine', 'y', [[px - ends, k0 + 0.18], [px - span / 2, k0], [px + span / 2, k0], [px + ends, k0 + 0.18], [px + ends, k0 + 0.42], [px - ends, k0 + 0.42]], py - 0.2, py + 0.2);
  T.prism('afShrineDark', 'y', [[px - ends - 0.08, k0 + 0.42], [px + ends + 0.08, k0 + 0.42], [px + ends + 0.12, k0 + 0.62], [px - ends - 0.12, k0 + 0.62]], py - 0.24, py + 0.24);
  T.hidden(px - ends, py - 0.2, k0, px + ends, py + 0.2, k0 + 0.62, 'wall', 'torii');
  T.box('afShrine', px - 0.12, py - 0.1, h + height - 0.7, px + 0.12, py + 0.1, k0, { kind: 'wall', name: 'torii' });
  T.sign('toriiPlaque', px, py - 0.13, h + height - 0.35, 0.5, 0.55, 's');
}

function shrine(T) {
  const S = SHRINE;
  const P = PROFILE[0];
  const h = P[S.bench].h;
  /* Where each wall's foot is, at the stair. */
  const walls = [0, 1, 2, 3].map((k) => wallPy(0, k, S.px));
  /* The torii at the floor's edge, on the track. */
  const ty = walls[0] + 1.6;
  torii(T, S.px, ty, 0, 3.6, 4.2);
  /* The stair: straight up each wall, stone, solid as each step. */
  for (let k = 0; k <= S.bench; k += 1) {
    const base = k === 0 ? 0 : P[k - 1].h;
    const rise = P[k].h - base;
    const steps = Math.round(rise / 0.2);
    for (let i = 0; i < steps; i += 1) {
      const y1 = walls[k] + 0.05;
      const y0 = y1 + (steps - i) * 0.32;
      T.box('afStone', S.px - 1.0, Math.min(y0, y1), base, S.px + 1.0, Math.max(y0, y1), base + (rise * (i + 1)) / steps, { kind: 'wall', name: 'shrine stair' });
    }
  }
  /* The shrine on its bench: a small hall on a stone plinth, gable roof,
   * a pair of lanterns, the offering box, the sacred cedar with its rope. */
  const yb = wallPy(0, S.bench, S.px) - 3.6;
  T.box('afStone', S.px - 1.8, yb - 1.5, h, S.px + 1.8, yb + 1.5, h + 0.5, { kind: 'wall', name: 'shrine plinth' });
  T.box('afShrineWood', S.px - 1.3, yb - 1.1, h + 0.5, S.px + 1.3, yb + 1.1, h + 2.2, { kind: 'wall', name: 'shrine' });
  T.deco('afShrine', S.px - 1.32, yb - 1.12, h + 0.5, S.px - 1.18, yb + 1.12, h + 2.2);
  T.deco('afShrine', S.px + 1.18, yb - 1.12, h + 0.5, S.px + 1.32, yb + 1.12, h + 2.2);
  T.paint('afShrineDark', S.px - 0.8, yb + 1.11, h + 0.7, S.px + 0.8, yb + 1.12, h + 1.9);
  T.prism('afShrineDark', 'x', [[yb - 1.9, h + 2.1], [yb, h + 3.3], [yb + 1.9, h + 2.1], [yb + 1.9, h + 1.95], [yb, h + 3.12], [yb - 1.9, h + 1.95]], S.px - 1.8, S.px + 1.8);
  T.hidden(S.px - 1.8, yb - 1.9, h + 2.2, S.px + 1.8, yb + 1.9, h + 3.0, 'wall', 'shrine roof');
  T.box('afShrineWood', S.px - 0.45, yb + 1.3, h + 0.5, S.px + 0.45, yb + 1.8, h + 0.95, { kind: 'obstacle', name: 'offering box' });
  T.disc('afHasa', S.px, yb + 1.25, 0.14, h + 2.0, h + 2.1, 10);
  T.cyl('afRope', [S.px, yb + 1.25, h + 1.95], [S.px, yb + 1.25, h + 1.3], 0.03, 4);
  for (const s of [-1, 1]) {
    lantern(T, S.px + s * 2.2, yb + 2.4, h);
  }
  /* The sacred cedar beside, old and broad, its rope and paper. */
  const cx = S.px + 4.5;
  const cy = yb - 0.5;
  T.post('afCedarTrunk', cx, cy, h, h + 6, 0.55, { kind: 'tree', name: 'sacred cedar' });
  T.cap('afCedarDeep', [cx, cy, h + 6.5], [cx, cy, h + 16], 2.0, { draw: false, kind: 'canopy', name: 'sacred cedar' });
  T.cone('afCedarDeep', cx, cy, h + 5, 3.4, 7.5, 9);
  T.cone('afCedar', cx, cy, h + 9, 2.6, 6.5, 9);
  T.cone('afCedarDeep', cx, cy, h + 12.6, 1.7, 5.2, 9);
  T.torus('afRope', cx, cy, h + 1.6, 0.62, 0.07, 0, 0, 6, 18);
  T.dress(() => T.wide(() => {
    for (let i = 0; i < 4; i += 1) {
      sincos((i / 4) * Math.PI * 2 + 0.4, SC);
      const x = cx + 0.66 * SC.c;
      const y = cy + 0.66 * SC.s;
      T.box('afPaper', x - 0.05, y - 0.05, h + 1.15, x + 0.05, y + 0.05, h + 1.55, { solid: false, cast: false });
    }
  }));
  /* Red banners (nobori) up the stair, either side. */
  for (let k = 0; k < 3; k += 1) {
    for (const s of [-1, 1]) {
      const x = S.px + s * 1.5;
      const y = walls[k] - 2.5;
      const base = P[k].h;
      T.post('afShrineWood', x, y, base, base + 3.2, 0.03, { kind: 'pole', name: 'nobori pole' });
      T.box('afBannerRed', x - 0.02, y - 0.3, base + 1.1, x + 0.02, y + 0.3, base + 3.0, { solid: false });
    }
  }
}

/* ---------------------------------------------------------------- *
 * The race's gates.
 * ---------------------------------------------------------------- */

/*
 * THE RACE, fourteen gates in its order, a lap of the whole field: off the
 * apron, through the hangar front to back, west along the paddies, up
 * into a clearing of the cedars, down the dive by the sheds, the west
 * windsock, the strip's threshold and length, the high gate, down into
 * the channel and under the red bridge, the east windsock, and home under
 * the clubhouse's balcony. Each: its kind, the middle of its opening's
 * foot in the plan, the heading it is flown along (degrees, east 0, north
 * 90), its clear width and height, the sill's height, and its points.
 *
 * Kinds: 'frame' a square of red and white tube on two legs; 'banner' the
 * same with a cloth across its top; 'nobori' two tall flags, the gap
 * between them; 'hoop' a ring on a stand; 'dive' a frame up on scaffold;
 * 'open' nothing drawn, the place itself is the gate.
 */
const bench = (side, k, px, u = 0.5) => {
  const f = wallPy(side, k, px);
  const b = wallPy(side, k + 1, px);
  return { py: f + (b - f) * u, h: PROFILE[side][k].h };
};
export function raceGates() {
  const pad = bench(1, 2, 172, 0.55);
  const ced = bench(1, 7, 118, 0.5);
  const C = CHANNEL;
  return [
    { kind: 'banner', name: 'THE APRON', px: 196, py: 213, deg: 0, w: 3.2, hh: 2.4, base: 0.4, points: 100 },
    { kind: 'open', name: 'HANGAR DOORS', px: 220, py: 222, deg: 90, w: 22.4, hh: 6.4, base: 0.3, points: 250 },
    { kind: 'open', name: 'THE BACK DOOR', px: 220, py: 250, deg: 90, w: 14.4, hh: 5.4, base: 0.3, points: 250 },
    { kind: 'frame', name: 'THE PADDIES', px: 172, py: pad.py, deg: 180, w: 2.6, hh: 2.0, base: pad.h + 0.5, points: 100 },
    { kind: 'nobori', name: 'THE CEDARS', px: 118, py: ced.py, deg: 180, w: 3.2, hh: 3.2, base: ced.h, points: 250 },
    { kind: 'dive', name: 'THE DIVE', px: 98, py: 250, deg: 270, w: 3.0, hh: 2.4, base: 6.0, points: 250 },
    { kind: 'frame', name: 'WEST WINDSOCK', px: 76, py: 206, deg: 270, w: 2.6, hh: 2.0, base: 0.6, points: 100 },
    { kind: 'hoop', name: 'THE THRESHOLD', px: 92, py: 178, deg: 0, w: 2.6, hh: 2.6, base: 1.3, points: 100 },
    { kind: 'nobori', name: 'THE STRIP', px: 170, py: 178, deg: 0, w: 3.4, hh: 3.2, base: 0, points: 100 },
    { kind: 'dive', name: 'THE HIGH GATE', px: 250, py: 160, deg: 0, w: 3.0, hh: 2.4, base: 7.5, points: 250 },
    { kind: 'open', name: 'THE CHANNEL', px: 336, py: (C.y0 + C.y1) / 2, deg: 0, w: C.y1 - C.y0 - 0.6, hh: 1.4, base: C.water + 0.1, points: 500 },
    { kind: 'open', name: 'UNDER THE RED BRIDGE', px: RED_BRIDGE.px, py: (C.y0 + C.y1) / 2, deg: 0, w: C.y1 - C.y0 - 0.6, hh: 1.25, base: C.water + 0.1, points: 1000 },
    { kind: 'banner', name: 'EAST WINDSOCK', px: 420, py: 214, deg: 90, w: 3.2, hh: 2.4, base: 0.4, points: 100 },
    { kind: 'open', name: 'UNDER THE BALCONY', px: CLUB.x1 + 0.5, py: CLUB.y0 - CLUB.balcony / 2 + 0.05, deg: 180, w: CLUB.balcony - 0.62, hh: CLUB.floor - 0.6, base: 0.3, points: 500 },
  ];
}

/* A gate drawn and made solid, by its kind. The frame's tube stands just
 * outside the clear opening. */
function gate(T, g) {
  if (g.kind === 'open') {
    return;
  }
  sincos(g.deg * (Math.PI / 180), SC);
  /* Across the opening: perpendicular to the heading, in the plan. */
  const ax = -SC.s;
  const ay = SC.c;
  const at = (u, h) => [g.px + ax * u, g.py + ay * u, h];
  const tube = 0.07;
  const half = g.w / 2 + tube;
  const top = g.base + g.hh + tube;
  const sill = g.base - tube;
  if (g.kind === 'frame' || g.kind === 'banner' || g.kind === 'dive') {
    for (const s of [-1, 1]) {
      striped(T, at(s * half, 0), at(s * half, top), tube, 'gate', 0.45);
    }
    striped(T, at(-half, top), at(half, top), tube, 'gate', 0.45);
    if (sill > 0.1) {
      striped(T, at(-half, sill), at(half, sill), tube, 'gate', 0.45);
    }
    /* Feet. */
    for (const s of [-1, 1]) {
      const [x, y] = at(s * half, 0);
      T.box('metalDark', x - 0.3, y - 0.3, 0, x + 0.3, y + 0.3, 0.06, { solid: false });
    }
  }
  if (g.kind === 'dive') {
    /* The scaffold under it: braces from each leg out and back. */
    for (const s of [-1, 1]) {
      const [x, y] = at(s * half, 0);
      for (const t of [-1.6, 1.6]) {
        const bx = x + SC.c * t;
        const by = y + SC.s * t;
        T.cap('scaffold', [bx, by, 0], [x, y, g.base * 0.85], 0.045, { kind: 'pole', name: 'brace' });
      }
      T.cap('scaffold', [x, y, g.base * 0.45], at(-s * half, g.base * 0.45).map((v, i) => (i === 2 ? g.base * 0.45 : v)), 0.04, { kind: 'pole', name: 'brace' });
    }
  }
  if (g.kind === 'banner') {
    /* A cloth across the top, lettered. */
    const [x0, y0] = at(-half, 0);
    const [x1, y1] = at(half, 0);
    const lo = top + 0.08;
    const hi = top + 0.9;
    T.box('afBanner', Math.min(x0, x1) - (ax === 0 ? 0 : 0) - 0.02 * Math.abs(ay), Math.min(y0, y1) - 0.02 * Math.abs(ax), lo, Math.max(x0, x1) + 0.02 * Math.abs(ay), Math.max(y0, y1) + 0.02 * Math.abs(ax), hi, { kind: 'wall', name: 'banner' });
    const face = Math.abs(SC.c) > 0.5 ? (SC.c > 0 ? 'w' : 'e') : (SC.s > 0 ? 's' : 'n');
    const off = 0.04;
    const fx = face === 'w' ? -off : face === 'e' ? off : 0;
    const fy = face === 's' ? -off : face === 'n' ? off : 0;
    T.sign('gateBanner', g.px + fx, g.py + fy, (lo + hi) / 2, 2 * half - 0.2, hi - lo - 0.1, face);
    T.striped = null;
    striped(T, at(-half, top), at(-half, hi), tube, 'gate', 0.45);
    striped(T, at(half, top), at(half, hi), tube, 'gate', 0.45);
  }
  if (g.kind === 'nobori') {
    for (const s of [-1, 1]) {
      const [x, y] = at(s * (g.w / 2 + 0.05), 0);
      T.post('afShrineWood', x, y, g.base, g.base + g.hh + 1.4, 0.05, { kind: 'pole', name: 'nobori pole' });
      T.cyl('afShrineWood', [x, y, g.base + g.hh + 1.3], [x + ax * s * 0.75, y + ay * s * 0.75, g.base + g.hh + 1.3], 0.025, 4);
      const [cx, cy] = at(s * (g.w / 2 + 0.45), 0);
      const lo = g.base + 0.9;
      const hi = g.base + g.hh + 1.25;
      const ex = Math.abs(ax) * 0.38 + Math.abs(ay) * 0.025;
      const ey = Math.abs(ay) * 0.38 + Math.abs(ax) * 0.025;
      T.box(s < 0 ? 'afBannerRed' : 'afBanner', cx - ex, cy - ey, lo, cx + ex, cy + ey, hi, { kind: 'obstacle', name: 'nobori' });
    }
  }
  if (g.kind === 'hoop') {
    const R = g.w / Math.SQRT2 + 0.35;
    const hc = g.base + g.hh / 2;
    T.torus('mastRed', g.px, g.py, hc, R, 0.09, SC.c, SC.s, 8, 36);
    for (let i = 0; i < 16; i += 1) {
      sincos((i / 16) * Math.PI * 2, SC);
      const u0 = SC.c * R;
      const v0 = SC.s * R;
      sincos(((i + 1) / 16) * Math.PI * 2, SC);
      const u1 = SC.c * R;
      const v1 = SC.s * R;
      T.cap('mastRed', at(u0, hc + v0), at(u1, hc + v1), 0.09, { draw: false, kind: 'pole', name: 'hoop' });
      if (i % 4 === 0) {
        T.cyl('mastWhite', at(u0 * 1.0, hc + v0), at(u0 + (u1 - u0) * 0.5, hc + v0 + (v1 - v0) * 0.5), 0.1, 8);
      }
    }
    sincos(g.deg * (Math.PI / 180), SC);
    T.post('afFrame', g.px, g.py, 0, hc - R, 0.07, { kind: 'pole', name: 'hoop stand' });
    T.box('metalDark', g.px - 0.5, g.py - 0.5, 0, g.px + 0.5, g.py + 0.5, 0.08, { solid: false });
  }
}

/* The field, whole. */
export function field(T) {
  strip(T);
  for (const s of SOCKS) {
    windsock(T, s);
  }
  signalSquare(T);
  clubhouse(T);
  sheds(T);
  fuel(T);
  mast(T);
  bridges(T);
  shrine(T);
  for (const g of raceGates()) {
    gate(T, g);
  }
  /* The launch point: a glider on the grass at the west end, one wing
   * down on the turf as a glider waits, and its tow rope laid out. */
  gliderOnGrass(T, 120, 196);
}

/*
 * A GLIDER waiting at the launch point, a two seater of our own drawing at
 * a training glider's size: 17 m span, 8.4 m long, its fuselage a long
 * tapering pod, its T tail, its left wing tip on the grass.
 */
function gliderOnGrass(T, px, py) {
  const r = rng(0x911de5);
  r.next();
  /* Pointing east, nose at px. */
  T.box('afPlane', px - 2.2, py - 0.38, 0.25, px, py + 0.38, 1.1, { kind: 'obstacle', name: 'glider' });
  T.box('afPlane', px - 5.2, py - 0.26, 0.45, px - 2.2, py + 0.26, 1.0, { kind: 'obstacle', name: 'glider' });
  T.box('afPlane', px - 8.4, py - 0.14, 0.62, px - 5.2, py + 0.14, 0.92, { kind: 'obstacle', name: 'glider' });
  T.box('afCanopy', px - 1.9, py - 0.32, 1.1, px - 0.4, py + 0.32, 1.42, { solid: false });
  T.box('afPlane', px - 8.4, py - 0.06, 0.92, px - 7.4, py + 0.06, 2.3, { kind: 'obstacle', name: 'glider fin' });
  T.box('afPlane', px - 8.5, py - 1.6, 2.25, px - 7.6, py + 1.6, 2.35, { kind: 'obstacle', name: 'glider tail' });
  /* The wing: level from the root, one tip down to the grass. */
  const tip = 8.5;
  for (let i = 0; i < 8; i += 1) {
    const u0 = -tip + (2 * tip * i) / 8;
    const u1 = -tip + (2 * tip * (i + 1)) / 8;
    const lean = (u) => 1.05 + (u < 0 ? (u / tip) * 0.85 : (u / tip) * -0.25);
    const h = (lean(u0) + lean(u1)) / 2;
    T.box('afPlane', px - 2.9, py + u0, h - 0.06, px - 1.7, py + u1, h + 0.06, { kind: 'obstacle', name: 'glider wing' });
  }
  T.box('afPlaneRed', px - 2.9, py - tip - 0.02, 0.14, px - 1.7, py - tip + 0.9, 0.3, { solid: false });
  T.cyl('afTyre', [px - 2.1, py - 0.05, 0.22], [px - 2.1, py + 0.05, 0.22], 0.22, 10);
  /* The tow rope laid out ahead toward the winch. */
  T.cyl('rope', [px + 0.1, py, 0.05], [px + 40, py + 0.4, 0.05], 0.015, 3);
}
