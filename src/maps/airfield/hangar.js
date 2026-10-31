/*
 * hangar.js: Hangar 1, the arched hangar the airfield is named round. Pure,
 * as ./frame.js is: the arch's points come from src/props/trig.js, so its
 * solids are the same bits in every engine.
 *
 * THE BUILDING, from the real kind. A light aircraft hangar at a small
 * field is a steel arch clad in corrugated sheet on low side walls, its
 * gable ends closed in sheet above a wide door of sliding steel leaves
 * that park beside the building on outrigger rails. This one is thirty
 * metres across (the brief's figure, and two high wing four seaters' span
 * with room to walk round), twenty eight deep, 5.5 m to the eaves and
 * 11.5 m to the crown: a segmental arch of 21.75 m radius. Its front door
 * is 24 m by 7.2 m, inside the 20 to 30 by 6 to 8 m the brief asks, and the
 * back has one of 16 by 6 m, open, so the hangar is flown straight through.
 *
 * WHAT A PILOT FLIES. Through the doors, front to back. Over the ties:
 * each of the six arched trusses is tied across at the eaves with two
 * hangers up to it, so above the ties and between the hangers there is a
 * window through every truss, THE RAFTERS, flown the length of the hangar
 * under the crown. Out of the roof through the skylight, a slot in the
 * crown over the back bays. And off the crown, down the front, onto the
 * field: the dive line.
 *
 * SOLID AS DRAWN. The walls are boxes; the gable ends are boxes sliced
 * half a metre high and as wide as the arch is at the slice's top, so each
 * is inside the drawn wall; the roof is purlins, capsules a hand apart
 * along the arch's middle surface, overlapping so a quad cannot pass
 * between two, and none over the skylight.
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

/* The hangar in the plan: the door faces south, onto the apron. */
export const HANGAR = {
  x0: 205, x1: 235, y0: 222, y1: 250, eave: 5.5, crown: 11.5, skin: 0.18,
  door: { x0: 208, x1: 232, h: 7.2 },
  back: { x0: 212, x1: 228, h: 6.0 },
  /* The trusses' places along the hangar, the tie's height, the hangers'
   * distance either side of the middle. */
  trusses: [226, 230, 234, 238, 242, 246],
  tie: 5.5,
  hanger: 7,
  skylight: { y0: 238.6, y1: 245.4, half: 1.7 },
};

const CX = (HANGAR.x0 + HANGAR.x1) / 2;
const HALF = (HANGAR.x1 - HANGAR.x0) / 2;
const RISE = HANGAR.crown - HANGAR.eave;
/* The arch's radius and the height of its centre. */
export const R = (HALF * HALF + RISE * RISE) / (2 * RISE);
const HC = HANGAR.crown - R;
/* Half the angle the arch subtends, by bisection on its sine, so no
 * arcsine is taken: sin(a) = HALF / R. */
const A0 = (() => {
  let lo = 0;
  let hi = Math.PI / 2;
  const sc = { s: 0, c: 0 };
  for (let i = 0; i < 60; i += 1) {
    const m = (lo + hi) / 2;
    if (sincos(m, sc).s * R < HALF) {
      lo = m;
    } else {
      hi = m;
    }
  }
  return (lo + hi) / 2;
})();

const SC = { s: 0, c: 0 };
/* A point of an arch `off` metres out from the middle surface, at angle t
 * from the crown (negative west): [px, h]. */
function archAt(t, off = 0) {
  sincos(t, SC);
  return [CX + (R + off) * SC.s, HC + (R + off) * SC.c];
}

/* The arch's height at plan x, at radius R + off, or the eave if the arch
 * does not reach there. Square roots only. */
export function archHeight(px, off = 0) {
  const dx = px - CX;
  const r = R + off;
  const q = r * r - dx * dx;
  return q > 0 ? HC + Math.sqrt(q) : HANGAR.eave;
}

/* The angle at which the arch, at radius R, stands `dx` from the middle:
 * by bisection again. */
function angleAt(dx) {
  let lo = -A0;
  let hi = A0;
  const sc = { s: 0, c: 0 };
  for (let i = 0; i < 60; i += 1) {
    const m = (lo + hi) / 2;
    if (sincos(m, sc).s * R < dx) {
      lo = m;
    } else {
      hi = m;
    }
  }
  return (lo + hi) / 2;
}

/* A band of the arch between angles t0 and t1, `t` thick about radius
 * R + off, as a closed profile for a prism along y. */
function archBand(t0, t1, off, t, n) {
  const out = [];
  const inner = [];
  for (let i = 0; i <= n; i += 1) {
    const a = t0 + ((t1 - t0) * i) / n;
    out.push(archAt(a, off + t / 2));
    inner.push(archAt(a, off - t / 2));
  }
  return [...out, ...inner.reverse()];
}

/*
 * A GABLE END, as solids: slices half a metre high from the ground to the
 * crown, each as wide as the arch is at the slice's top, less the door
 * where the slice is beside it. Below the eave every slice is the same, so
 * it is one box a side of the door.
 */
function gableSolids(T, y, door, name) {
  const t = 0.1;
  const pieces = (h0, h1) => {
    const half = h1 <= HANGAR.eave ? HALF : Math.sqrt(Math.max(0, R * R - (h1 - HC) * (h1 - HC)));
    if (half < 0.3) {
      return;
    }
    const a = CX - half;
    const b = CX + half;
    if (h0 < door.h) {
      if (door.x0 - a > 0.05) {
        T.hidden(a, y - t, h0, door.x0, y + t, h1, 'wall', name);
      }
      if (b - door.x1 > 0.05) {
        T.hidden(door.x1, y - t, h0, b, y + t, h1, 'wall', name);
      }
    } else {
      T.hidden(a, y - t, h0, b, y + t, h1, 'wall', name);
    }
  };
  /* Below the eave, beside the door: one box a side. */
  pieces(0, Math.min(HANGAR.eave, door.h));
  let h = Math.min(HANGAR.eave, door.h);
  while (h < HANGAR.crown - 0.05) {
    /* Slices meet the door's head exactly. */
    const next = h < door.h && door.h < h + 0.5 ? door.h : Math.min(HANGAR.crown, h + 0.5);
    pieces(h, next);
    h = next;
  }
}

/* A gable end as drawn: the wall's outline under the arch, the door cut
 * out of it, extruded the wall's thickness. */
function gableDrawn(T, y, door, m) {
  const n = 28;
  const prof = [[HANGAR.x0, 0], [door.x0, 0], [door.x0, door.h], [door.x1, door.h], [door.x1, 0], [HANGAR.x1, 0]];
  for (let i = n; i >= 0; i -= 1) {
    prof.push(archAt(-A0 + (2 * A0 * i) / n, -HANGAR.skin / 2));
  }
  T.prism(m, 'y', prof, y - 0.12, y + 0.12);
}

/* One arched truss: a top chord under the roof, a bottom chord parallel to
 * it, lacing between, the tie across at the eaves and the two hangers.
 * Capsules all, solid. */
function truss(T, y) {
  const n = 18;
  const top = [];
  const bot = [];
  for (let i = 0; i <= n; i += 1) {
    const a = -A0 + (2 * A0 * i) / n;
    top.push(archAt(a, -HANGAR.skin / 2 - 0.12));
    bot.push(archAt(a, -HANGAR.skin / 2 - 0.82));
  }
  const o = { kind: 'pole', name: 'truss' };
  for (let i = 0; i < n; i += 1) {
    T.cap('afFrame', [top[i][0], y, top[i][1]], [top[i + 1][0], y, top[i + 1][1]], 0.07, o);
    T.cap('afFrame', [bot[i][0], y, bot[i][1]], [bot[i + 1][0], y, bot[i + 1][1]], 0.07, o);
    /* The lacing, a zigzag. */
    const a = i % 2 === 0 ? bot[i] : top[i];
    const b = i % 2 === 0 ? top[i + 1] : bot[i + 1];
    T.cap('afFrame', [a[0], y, a[1]], [b[0], y, b[1]], 0.04, o);
  }
  /* The legs down the side walls to the floor, inside the walls. */
  for (const s of [-1, 1]) {
    const x = CX + s * (HALF - 0.3);
    T.cap('afFrame', [x, y, 0], [x, y, HANGAR.eave], 0.14, { kind: 'pole', name: 'column' });
  }
  /* The tie and the hangers. */
  T.cap('afFrame', [HANGAR.x0 + 0.3, y, HANGAR.tie], [HANGAR.x1 - 0.3, y, HANGAR.tie], 0.08, { kind: 'pole', name: 'tie' });
  for (const s of [-1, 1]) {
    const x = CX + s * HANGAR.hanger;
    T.cap('afFrame', [x, y, HANGAR.tie], [x, y, archHeight(x, -HANGAR.skin / 2 - 0.82)], 0.06, { kind: 'pole', name: 'hanger' });
  }
}

/*
 * THE LIGHT AIRCRAFT. A high wing four seater of our own drawing, at the
 * size of the most common one there is (11.0 m span, 8.3 m long, 2.7 m
 * tall). `px, py` is the nose's middle on the ground; it points `dir`
 * ('s' or 'n'). Solid as its fuselage, wing, tail and wheels.
 */
export function plane(T, px, py, dir, livery = 'afPlaneRed') {
  const s = dir === 's' ? -1 : 1;
  const at = (u) => py - s * u;
  /* u runs from the nose (0) aft (8.3). */
  const box = (m, x0, u0, h0, x1, u1, h1, solid = true, name = 'plane') => {
    const a = at(u0);
    const b = at(u1);
    T.box(m, px + x0, Math.min(a, b), h0, px + x1, Math.max(a, b), h1, solid ? { kind: 'obstacle', name } : { solid: false });
  };
  /* The cowling, the cabin and the tail cone, each a box a little smaller
   * than the last, so the fuselage tapers as a comic draws one. */
  box('afPlane', -0.52, 0.35, 0.75, 0.52, 1.6, 1.75);
  box('afPlane', -0.58, 1.6, 0.7, 0.58, 3.6, 2.15);
  box('afPlane', -0.42, 3.6, 0.95, 0.42, 5.6, 1.95);
  box('afPlane', -0.22, 5.6, 1.15, 0.22, 7.9, 1.75);
  /* The cheat line down each side and the cabin's glass. */
  for (const side of [-1, 1]) {
    const x = side * 0.6;
    box(livery, x - 0.01, 0.4, 1.25, x + 0.01, 5.6, 1.42, false);
    box('afPlaneNavy', x - 0.01, 0.4, 1.12, x + 0.01, 5.6, 1.2, false);
    box('afCanopy', side * 0.59 - 0.01, 1.8, 1.55, side * 0.59 + 0.01, 3.3, 2.05, false);
  }
  box('afCanopy', -0.5, 1.58, 1.5, 0.5, 1.62, 2.1, false);
  /* The spinner and the propeller, across. */
  T.cyl('afPlaneRed', [px, at(0.36), 1.25], [px, at(0.02), 1.25], 0.22, 10, 0.04);
  T.box('afProp', px - 0.95, Math.min(at(0.18), at(0.24)), 1.18, px + 0.95, Math.max(at(0.18), at(0.24)), 1.32, { kind: 'obstacle', name: 'propeller' });
  /* The wing on top of the cabin, its tips in the livery, the struts. */
  box('afPlane', -5.5, 1.7, 2.15, 5.5, 3.3, 2.32);
  box(livery, -5.5, 1.69, 2.14, -4.7, 3.31, 2.33, false);
  box(livery, 4.7, 1.69, 2.14, 5.5, 3.31, 2.33, false);
  for (const side of [-1, 1]) {
    T.cap('afFrame', [px + side * 0.55, at(2.7), 0.9], [px + side * 2.7, at(2.3), 2.15], 0.04, { kind: 'pole', name: 'strut' });
  }
  /* The tailplane and the fin. */
  box('afPlane', -1.7, 7.0, 1.55, 1.7, 7.9, 1.66);
  box('afPlane', -0.06, 6.6, 1.75, 0.06, 8.3, 2.7);
  box(livery, -0.07, 7.4, 2.25, 0.07, 8.3, 2.7, false);
  /* The wheels: two mains on spring legs, the nose wheel. */
  for (const side of [-1, 1]) {
    T.cap('afFrame', [px + side * 0.5, at(2.9), 0.8], [px + side * 1.25, at(2.9), 0.3], 0.04, { kind: 'pole', name: 'gear leg' });
    T.cyl('afTyre', [px + side * 1.15, at(2.9), 0.29], [px + side * 1.35, at(2.9), 0.29], 0.29, 10);
    T.hidden(px + side * 1.25 - 0.1, Math.min(at(2.65), at(3.15)), 0, px + side * 1.25 + 0.1, Math.max(at(2.65), at(3.15)), 0.5, 'obstacle', 'wheel');
  }
  T.cyl('afTyre', [px - 0.08, at(0.9), 0.24], [px + 0.08, at(0.9), 0.24], 0.24, 10);
  T.cap('afFrame', [px, at(0.9), 0.24], [px, at(0.95), 0.8], 0.04, { kind: 'pole', name: 'nose leg' });
}

/* The hangar, whole: walls, gables, roof, trusses, doors, the annex, the
 * things inside it. */
export function hangar(T) {
  const H = HANGAR;
  const skin = H.skin;
  /* ---- the side walls: block to 1.2 m, sheet above, a strip of windows. */
  for (const [x0, x1] of [[H.x0, H.x0 + 0.25], [H.x1 - 0.25, H.x1]]) {
    T.box('concrete', x0 - 0.05, H.y0, 0, x1 + 0.05, H.y1, 1.2, { kind: 'wall', name: 'hangar wall' });
    T.box('sheetBlue', x0, H.y0, 1.2, x1, H.y1, H.eave, { kind: 'wall', name: 'hangar wall' });
    const out = x0 === H.x0 ? x0 - 0.02 : x1 + 0.02;
    const inn = x0 === H.x0 ? x1 + 0.02 : x0 - 0.02;
    for (let y = H.y0 + 2; y < H.y1 - 2; y += 4) {
      for (const x of [out, inn]) {
        T.paint('glassBlue', Math.min(x, x + 0.01), y, 3.0, Math.max(x, x + 0.01), y + 2.6, 4.3);
      }
      T.deco('trim', Math.min(out, out + 0.06) - 0.03, y - 0.06, 2.94, Math.max(out, out + 0.06) + 0.03, y + 2.66, 3.0, true);
    }
    /* Ribs of the cladding, one a metre, fine. */
    T.dress(() => T.wide(() => {
      for (let y = H.y0 + 0.5; y < H.y1; y += 1) {
        const x = x0 === H.x0 ? x0 - 0.04 : x1;
        T.deco('sheetBlueRib', x, y - 0.05, 1.2, x + 0.04, y + 0.05, H.eave - 0.05);
      }
    }));
  }
  /* ---- the gables: the front's wide door, the back's narrower one. */
  gableDrawn(T, H.y0, H.door, 'sheetBlue');
  gableSolids(T, H.y0, H.door, 'hangar front');
  gableDrawn(T, H.y1, H.back, 'sheetBlue');
  gableSolids(T, H.y1, H.back, 'hangar back');
  /* The door's steel head and posts, red, and the gables' louvres. */
  T.box('afDoorStripe', H.door.x0 - 0.35, H.y0 - 0.25, 0, H.door.x0, H.y0 + 0.2, H.door.h + 0.35, { kind: 'pole', name: 'door post' });
  T.box('afDoorStripe', H.door.x1, H.y0 - 0.25, 0, H.door.x1 + 0.35, H.y0 + 0.2, H.door.h + 0.35, { kind: 'pole', name: 'door post' });
  T.box('afDoorStripe', H.door.x0 - 0.35, H.y0 - 0.25, H.door.h, H.door.x1 + 0.35, H.y0 + 0.2, H.door.h + 0.45, { kind: 'wall', name: 'door head' });
  T.box('afDoorStripe', H.back.x0 - 0.25, H.y1 - 0.2, H.back.h, H.back.x1 + 0.25, H.y1 + 0.25, H.back.h + 0.35, { kind: 'wall', name: 'door head' });
  for (const y of [H.y0 - 0.14, H.y1 + 0.14]) {
    for (const x of [CX - 4.5, CX + 4.5]) {
      T.deco('sheetRib', x - 0.9, y - 0.03, 8.6, x + 0.9, y + 0.03, 9.6);
      T.dress(() => T.wide(() => {
        for (let h = 8.7; h < 9.55; h += 0.18) {
          T.deco('metalDark', x - 0.85, Math.min(y, y + (y < 236 ? -0.06 : 0.06)), h, x + 0.85, Math.max(y, y + (y < 236 ? -0.06 : 0.06)), h + 0.05);
        }
      }));
    }
  }
  /* The gable's number and name, the safety signs on the door posts. */
  T.sign('hangarNo', CX, H.y0 - 0.14, 9.55, 2.0, 2.0, 's');
  T.sign('hangarName', CX, H.y0 - 0.14, 8.05, 7.2, 0.8, 's');
  T.sign('safety', H.door.x1 + 1.5, H.y0 - 0.14, 2.4, 1.1, 1.3, 's');
  T.sign('noFire', H.door.x0 - 1.5, H.y0 - 0.14, 2.4, 0.6, 1.6, 's');
  T.sign('safety', H.x0 + 0.29, 240, 2.4, 1.1, 1.3, 'e');
  /* ---- the roof: the sheet in three runs, the middle run cut for the
   * skylight; its eave flashing and the ridge cap. */
  const S = H.skylight;
  const ts = angleAt(S.half);
  const band = (t0, t1, y0, y1, m = 'sheetBlue') => T.prism(m, 'y', archBand(t0, t1, 0, skin, 32), y0, y1);
  band(-A0, A0, H.y0 - 0.6, S.y0);
  band(-A0, -ts, S.y0, S.y1);
  band(ts, A0, S.y0, S.y1);
  band(-A0, A0, S.y1, H.y1 + 0.3);
  /* The corrugation's seams, a raised rib every 1.4 m along. */
  T.dress(() => T.wide(() => {
    for (let y = H.y0; y < H.y1; y += 1.4) {
      if (y > S.y0 - 0.1 && y < S.y1 + 0.1) {
        T.prism('sheetBlueRib', 'y', archBand(-A0, -ts, skin / 2 + 0.03, 0.06, 20), y, y + 0.1);
        T.prism('sheetBlueRib', 'y', archBand(ts, A0, skin / 2 + 0.03, 0.06, 20), y, y + 0.1);
      } else {
        T.prism('sheetBlueRib', 'y', archBand(-A0, A0, skin / 2 + 0.03, 0.06, 32), y, y + 0.1);
      }
    }
  }));
  /* The skylight's curb, round the slot. */
  for (const s of [-1, 1]) {
    const [x, h] = archAt(s * ts, skin / 2);
    T.box('trim', Math.min(x, x + s * 0.2), S.y0, h - 0.1, Math.max(x, x + s * 0.2), S.y1, h + 0.35, { solid: false });
  }
  T.box('trim', CX - S.half - 0.2, S.y0 - 0.2, H.crown - 0.2, CX + S.half + 0.2, S.y0, H.crown + 0.35, { solid: false });
  T.box('trim', CX - S.half - 0.2, S.y1, H.crown - 0.2, CX + S.half + 0.2, S.y1 + 0.2, H.crown + 0.35, { solid: false });
  /* The purlins: the roof's solid. A capsule every 0.42 m of arc. */
  const arc = 2 * A0 * R;
  const n = Math.ceil(arc / 0.42);
  for (let i = 0; i <= n; i += 1) {
    const t = -A0 + (2 * A0 * i) / n;
    const [x, h] = archAt(t, 0);
    const o = { draw: false, kind: 'wall', name: 'hangar roof' };
    if (t > -ts && t < ts) {
      T.cap('sheetBlue', [x, H.y0 - 0.6, h], [x, S.y0, h], 0.26, o);
      T.cap('sheetBlue', [x, S.y1, h], [x, H.y1 + 0.3, h], 0.26, o);
    } else {
      T.cap('sheetBlue', [x, H.y0 - 0.6, h], [x, H.y1 + 0.3, h], 0.26, o);
    }
  }
  /* Gutters and downpipes at the four corners. */
  for (const x of [H.x0 - 0.2, H.x1 + 0.2]) {
    T.cyl('metalDark', [x, H.y0 - 0.6, H.eave - 0.05], [x, H.y1 + 0.3, H.eave - 0.05], 0.1, 6);
    for (const y of [H.y0 + 0.3, H.y1 - 0.3]) {
      T.cyl('metalDark', [x, y, 0.1], [x, y, H.eave - 0.05], 0.06, 6);
    }
  }
  /* ---- the trusses. */
  for (const y of H.trusses) {
    truss(T, y);
  }
  /* A crane rail down the crown and its hoist, parked forward with its
   * hook wound up, above THE RAFTERS' window and not across it. */
  T.cap('afFrame', [CX, H.y0 + 1, H.crown - 1.25], [CX, H.y1 - 1, H.crown - 1.25], 0.12, { kind: 'pole', name: 'crane rail' });
  T.box('craneYellow', CX - 0.3, 223.2, H.crown - 1.8, CX + 0.3, 224.2, H.crown - 1.38, { kind: 'obstacle', name: 'hoist' });
  T.box('craneYellowDeep', CX - 0.18, 223.5, H.crown - 2.05, CX + 0.18, 223.9, H.crown - 1.8, { solid: false });
  /* The high bay lamps, hung from the bottom chords outside the hangers. */
  for (const y of H.trusses) {
    for (const s of [-1, 1]) {
      const x = CX + s * 10.5;
      const top = archHeight(x, -skin / 2 - 0.82);
      T.cyl('rope', [x, y, top], [x, y, 7.0], 0.012, 3);
      T.cyl('lampHead', [x, y, 6.75], [x, y, 7.05], 0.32, 10, 0.12);
      T.disc('lampGlow', x, y, 0.26, 6.72, 6.75, 10);
    }
  }
  /* ---- the sliding doors, three leaves a side, parked beside the
   * building on their outrigger rails, the stripe across each. Stacked
   * leaf on leaf, as a telescoping door parks, so no slot is left
   * between them or behind them for a quad to try. */
  for (const s of [-1, 1]) {
    const edge = s < 0 ? H.x0 : H.x1;
    for (let i = 0; i < 3; i += 1) {
      const y0 = H.y0 - 0.32 - i * 0.26;
      const x0 = edge - s * 2.6 + s * i * 0.3;
      const xa = s < 0 ? x0 - 4.1 : x0;
      const xb = s < 0 ? x0 : x0 + 4.1;
      T.box('afDoor', xa, y0 - 0.12, 0.05, xb, y0 + 0.12, H.door.h + 0.2, { kind: 'wall', name: 'door leaf' });
      T.deco('afDoorStripe', xa, y0 - 0.14, 3.0, xb, y0 + 0.14, 3.5);
      T.deco('afFrame', xa, y0 - 0.14, 0.05, xb, y0 + 0.14, 0.3);
    }
    /* The rails' far posts and the head rail over the leaves. */
    const far = edge + s * 4.6;
    T.post('afFrame', far, H.y0 - 0.85, 0, H.door.h + 0.55, 0.12, { kind: 'pole', name: 'door rail post' });
    T.box('afFrame', Math.min(edge, far), H.y0 - 1.25, H.door.h + 0.35, Math.max(edge, far), H.y0 - 0.35, H.door.h + 0.6, { kind: 'wall', name: 'door rail' });
  }
  /* ---- the annex down the east side: the workshop, a lean to with a
   * roller shutter onto the apron. */
  const ax0 = H.x1;
  const ax1 = H.x1 + 6;
  T.box('concrete', ax0, 230, 0, ax1, 246, 0.9, { kind: 'wall', name: 'annex' });
  T.box('wallCream', ax0, 230, 0.9, ax1, 246, 3.3, { kind: 'wall', name: 'annex' });
  T.prism('afRoof', 'y', [[ax0 - 0.1, 4.2], [ax1 + 0.4, 3.3], [ax1 + 0.4, 3.12], [ax0 - 0.1, 4.02]], 229.6, 246.4);
  T.hidden(ax0, 230, 3.3, ax1, 246, 3.9, 'wall', 'annex roof');
  T.deco('shutter', ax0 + 1, 229.95, 0.05, ax1 - 1, 230.0, 2.8);
  T.dress(() => T.wide(() => {
    for (let h = 0.3; h < 2.8; h += 0.25) {
      T.deco('shutterLight', ax0 + 1, 229.93, h, ax1 - 1, 229.96, h + 0.05);
    }
  }));
  for (let y = 233; y < 245; y += 4) {
    T.paint('glassBlue', ax1 + 0.01, y, 1.4, ax1 + 0.02, y + 1.6, 2.5);
    T.deco('trim', ax1, y - 0.06, 1.34, ax1 + 0.06, y + 1.66, 1.4);
  }
  T.box('acUnit', ax1, 239.6, 0.15, ax1 + 0.38, 240.5, 0.75, { kind: 'obstacle', name: 'ac unit' });
  /* ---- the floor: the slab and its paint. */
  T.paint('afFloor', H.x0, H.y0 - 4, 0.0, H.x1, H.y1, 0.025);
  T.wide(() => T.dress(() => {
    T.paint('afFloorLine', CX - 0.08, H.y0 - 4, 0.025, CX + 0.08, H.y1 - 1, 0.035);
    for (let x = H.door.x0; x < H.door.x1; x += 1.2) {
      T.paint('afFloorLine', x, H.y0 - 0.3, 0.025, x + 0.6, H.y0 + 0.3, 0.035);
      T.paint('afShrineDark', x + 0.6, H.y0 - 0.3, 0.025, x + 1.2, H.y0 + 0.3, 0.035);
    }
    for (const [x, y, r] of [[212.5, 236, 0.9], [216, 243, 0.6], [226, 233, 0.7], [221, 228, 0.5]]) {
      T.disc('afOil', x, y, r, 0.025, 0.031, 12);
    }
  }));
  /* ---- inside. */
  plane(T, 213.5, 227.6, 's');
  /* The glider's trailer down the east side, its long white box. */
  T.box('afPlane', 227.4, 233, 0.55, 230.2, 245, 2.35, { kind: 'obstacle', name: 'glider trailer' });
  T.deco('afPlaneRed', 227.38, 233, 1.6, 230.22, 245, 1.75);
  T.cap('afFrame', [228.8, 231.5, 0.55], [228.8, 233, 0.55], 0.06, { kind: 'pole', name: 'drawbar' });
  for (const y of [238.4, 239.8]) {
    for (const x of [227.3, 230.3]) {
      T.cyl('afTyre', [x - 0.1, y, 0.32], [x + 0.1, y, 0.32], 0.32, 10);
    }
  }
  /* The workshop corner, back west: a bench, the red tool chests, a rack
   * of shelves, drums, tyres, an engine on its stand, a ladder. */
  T.box('afBench2', H.x0 + 0.3, 243, 0.85, H.x0 + 1.2, 249.6, 0.95, { kind: 'obstacle', name: 'bench' });
  T.box('metalDark', H.x0 + 0.35, 243.1, 0, H.x0 + 1.15, 249.5, 0.85, { solid: false });
  T.box('metal', H.x0 + 0.25, 236, 0, H.x0 + 0.9, 242, 2.6, { kind: 'wall', name: 'shelves' });
  T.dress(() => {
    for (let h = 0.5; h < 2.6; h += 0.6) {
      T.deco('afToolRed', H.x0 + 0.92, 236.4, h, H.x0 + 0.94, 237.6, h + 0.3);
      T.deco('afDrum', H.x0 + 0.92, 238.2, h, H.x0 + 0.94, 239.4, h + 0.35);
      T.deco('afBench2', H.x0 + 0.92, 240, h, H.x0 + 0.94, 241.6, h + 0.25);
    }
    for (const [x, y] of [[207.4, 245.2], [208.6, 248.4]]) {
      T.box('afToolRed', x - 0.4, y - 0.3, 0, x + 0.4, y + 0.3, 1.05, { solid: false });
      for (let h = 0.2; h < 1; h += 0.2) {
        T.deco('metal', x - 0.38, y - 0.31, h, x + 0.38, y - 0.29, h + 0.04);
      }
    }
    for (const [x, y, m] of [[232.6, 248.6, 'afDrum'], [233.4, 248.6, 'afDrumRed'], [233.4, 247.8, 'afDrum'], [232.6, 247.8, 'afDrumRed']]) {
      T.cyl(m, [x, y, 0], [x, y, 0.88], 0.29, 10);
    }
    for (let i = 0; i < 4; i += 1) {
      T.cyl('afTyre', [215.4, 248.6, 0.2 * i], [215.4, 248.6, 0.2 * i + 0.18], 0.3, 10);
    }
    /* The engine on its stand, cylinders out each side. */
    T.box('metal', 217.6, 246.6, 0, 218.6, 247.4, 0.6, { solid: false });
    T.box('metalDark', 217.5, 246.4, 0.6, 218.7, 247.6, 1.25, { solid: false });
    for (const s of [-1, 1]) {
      T.cyl('metal', [218.1, 247, 0.92], [218.1 + s * 0.8, 247, 0.92], 0.13, 8);
    }
    /* A step ladder against the wall. */
    T.cyl('craneYellow', [H.x1 - 0.5, 232, 0], [H.x1 - 0.32, 232, 3.2], 0.04, 4);
    T.cyl('craneYellow', [H.x1 - 0.5, 232.6, 0], [H.x1 - 0.32, 232.6, 3.2], 0.04, 4);
    /* Chocks, cones and the tow bar by the plane. */
    for (const [x, y] of [[212, 230.5], [215, 230.5]]) {
      T.deco('craneYellow', x - 0.15, y - 0.12, 0, x + 0.15, y + 0.12, 0.14);
    }
    for (const [x, y] of [[208.5, 223], [231.5, 223], [210.2, 233.5]]) {
      T.cone('containerOrange', x, y, 0, 0.18, 0.55, 8);
    }
    /* The tug: a small yellow tractor that tows the aircraft. */
    T.box('craneYellow', 222.4, 224.2, 0.25, 224.0, 226.6, 0.95, { solid: false });
    T.box('craneYellowDeep', 222.6, 225.6, 0.95, 223.8, 226.5, 1.35, { solid: false });
    for (const [x, y] of [[222.4, 224.7], [224.0, 224.7], [222.4, 226.1], [224.0, 226.1]]) {
      T.cyl('afTyre', [x - 0.08, y, 0.25], [x + 0.08, y, 0.25], 0.25, 8);
    }
    /* A fire extinguisher trolley, red, by the door post. */
    T.cyl('afToolRed', [233.2, 223.4, 0.25], [233.2, 223.4, 1.25], 0.22, 10);
  });
  /* The tug as a solid, so the floor's clutter a quad can strike is felt. */
  T.hidden(222.4, 224.2, 0, 224, 226.6, 1.35, 'obstacle', 'tug');
}

/* The point the rafters gap stands at: the front truss, between its
 * hangers, over its tie. For ./plan.js. */
export const RAFTERS = {
  px: CX, py: HANGAR.trusses[0], w: 2 * HANGAR.hanger,
  h0: HANGAR.tie, h1: archHeight(CX + HANGAR.hanger, -HANGAR.skin / 2 - 0.82),
};
