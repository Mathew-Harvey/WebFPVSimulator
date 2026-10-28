/*
 * hood.js: Heads' neighbourhood, made up, round Heads' house as it stands
 * in ../heads/. The owner's ask of 28 October 2026: "make it heads house
 * and his entire neighbourhood, make it up", "go hard with the build out,
 * make sure its as detailed as the town sakura map". Pure: plan metres in,
 * parts in the world frame out, and nothing here draws.
 *
 * WHAT IS HERE. Heads' house and its plot are ../heads/heads.js's, built
 * exactly as Heads' house builds them. Round that plot this lays out the
 * rest of a suburb in the same plan metres and at the same S: three
 * streets each way on a grid, Street A and the cross street carried on
 * past the plot, about fifty houses facing them, every one different
 * (width, depth, one or two storeys, siding, roof, door, porch, garage,
 * chimney, shutters), their drives, walks, mailboxes, beds and trees, back
 * yards fenced or open with what people keep in them (a trampoline, a
 * swing set, a shed, a pool, a sandpit, a playhouse, a patio and grill, a
 * doghouse), the streets' kerbs, walks, corners, crosswalks, lights, power
 * poles and their wires, hydrants, bins and parked cars, and a park with a
 * playground, a pond, a ball diamond, a court and a gazebo.
 *
 * WHERE THE GOATS CAN GO is said here too, because this is the file that
 * knows: `goatBlocks` is water and the houses' insides, which the parts do
 * not make solid at a goat's height (../goats/herd.js rasterises the rest
 * of the parts itself).
 *
 * THE FRAME is Heads' house's (../heads/heads.js): plan x east, plan y
 * north, real metres, worldAt to the world. The plan's origin is the front
 * west corner of Heads' house.
 *
 * WHY ONE CHUNK. Everything here is drawn into the house's own chunk
 * (CHUNK in ./index.js), so a colour the house already draws costs no
 * draw call, and the town's trees and cars go in the house's tree and
 * street chunks for the same reason. The suburb is drawn whole, which is
 * triangles rather than calls: see the latency note in ./index.js.
 *
 * No JS trig in the solids, as in ../heads/heads.js: every turn is a
 * quarter, and the wires' sag, which is drawn only, is a parabola.
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

import {
  House, gableRoof, fence, onFace, scaledParts, cornerPoint, PLOT, S, worldAt,
  STREET_A, STREET_B, HALF_A, HALF_B, KERB_W, KERB_H, VERGE, WALK, CORNER_R,
  G_ASPHALT, G_PAVE, G_DRIVE, G_LINE, TREE_M,
} from '../heads/heads.js';

/* ------------------------------------------------------------------ */
/* The grid                                                            */
/* ------------------------------------------------------------------ */

/* The neighbourhood's edge, plan metres. */
export const BOUNDS = { x0: -122, x1: 130, y0: -132, y1: 102 };

/* The streets, each a middle line and a half width between kerbs. Street A
 * and the cross street are Heads' house's, carried on past its plot. The
 * cars drive them (./traffic.js). */
export const EW = [
  { id: 'A', c: STREET_A, h: HALF_A, yellow: true },
  { id: 'C', c: 64, h: 4.5 },
  { id: 'D', c: -94, h: 4.5 },
];
export const NS = [
  { id: 'B', c: STREET_B, h: HALF_B },
  { id: 'W', c: -84, h: 4.5 },
  { id: 'E', c: 94, h: 4.5 },
];

/* Kerb, verge and walk, as Heads' house's: the property line is this far
 * out from a street's kerb. */
const SIDE = KERB_W + VERGE + WALK;

/* The property line on one side of a street, s = 1 the high side. */
const lineOf = (st, s) => st.c + s * (st.h + SIDE);

/* The park, plan metres: the block south of Street A's south row, between
 * the cross street and Street E. */
export const PARK = { x0: lineOf(NS[0], 1), x1: lineOf(NS[2], -1), y0: lineOf(EW[2], 1), y1: -57 };

/* Plan rectangles the goats may not stand in, besides what is solid:
 * water, and Heads' house's rooms behind its open doors. */
export const goatBlocks = [];

/* ------------------------------------------------------------------ */
/* A seeded stream                                                     */
/* ------------------------------------------------------------------ */

function stream(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (r, list) => list[Math.floor(r() * list.length) % list.length];

/* ------------------------------------------------------------------ */
/* Dressing                                                            */
/* ------------------------------------------------------------------ */

/*
 * THE DRESSING (the owner's ask of 28 October, the same morning: "now for
 * a graphical polish, add details"): what a street has that nobody would
 * list, a gutter and its downpipe, a flower in a bed, a leaf pile, the
 * washing on a line, a crack sealed in the asphalt. None of it is solid,
 * so none of it reaches the plant, the goats or the colliders, and all of
 * it is drawn on Medium and High only: Low draws the street as it was, so
 * its frame is not paid for detail it was chosen to go without.
 *
 * Two kinds. A part marked `fine` is a paint box like any other, left out
 * on Low by ./index.js. A BIT is a blob of the kit's, the twenty sided
 * one (src/props/kit.js, blob), at a fifth of a ball's triangles:
 * { m, c, r, ry, spin } in the world frame, drawn by ./index.js. Both are
 * in colours the house already draws, so neither costs a draw call.
 */
function bit(H, m, px, py, h, r, ry = r, spin = [0, 0, 0]) {
  if (!H.bits) {
    H.bits = [];
  }
  H.bits.push({ m, c: worldAt(px, py, h), r: S * r, ry: S * ry, spin });
}

/* A part left out on Low. */
const fine = (p) => {
  if (p) {
    p.fine = true;
  }
  return p;
};

/* The last cylinder or cone a House was given, left out on Low. */
const fineLast = (list) => {
  list[list.length - 1].fine = true;
};

/* What flowers there are, in the house's paint. */
const FLOWERS = ['homePlay', 'homeBook', 'headsPurple', 'homeWhite', 'goatPumpkin', 'homePlayBlue', 'homePlay'];
/* And autumn's leaves. */
const LEAVES = ['homePlay', 'goatPumpkin', 'homeBook', 'goatPumpkin'];

/* ------------------------------------------------------------------ */
/* Rectangles                                                          */
/* ------------------------------------------------------------------ */

const overlaps = (a, b, pad = 0) => a.x0 < b.x1 + pad && a.x1 > b.x0 - pad && a.y0 < b.y1 + pad && a.y1 > b.y0 - pad;

/* Is a plan rectangle clear of Heads' house's plot, which is built? */
const offPlot = (r, pad = 0) => !overlaps(r, PLOT, pad);

/* ------------------------------------------------------------------ */
/* A lot's frame                                                       */
/* ------------------------------------------------------------------ */

/*
 * A LOT is written in its own terms: u along the street, v back from the
 * property line into the lot. The street is on side `face` of the lot
 * ('s': the lot is north of an east west street), and the frame turns
 * (u, v) into plan (x, y) by quarter turns only.
 */
class Lot {
  constructor(H, face, line, u0, u1, depth) {
    this.H = H;
    this.face = face;
    this.line = line;
    this.u0 = u0;
    this.u1 = u1;
    this.depth = depth;
    this.ew = face === 's' || face === 'n';
    this.sv = face === 's' || face === 'w' ? 1 : -1;
  }

  xy(u, v) {
    const w = this.line + this.sv * v;
    return this.ew ? [u, w] : [w, u];
  }

  rect(u0, v0, u1, v1) {
    const [ax, ay] = this.xy(u0, v0);
    const [bx, by] = this.xy(u1, v1);
    return { x0: Math.min(ax, bx), x1: Math.max(ax, bx), y0: Math.min(ay, by), y1: Math.max(ay, by) };
  }

  /* The whole lot as a plan rectangle. */
  get all() {
    return this.rect(this.u0, 0, this.u1, this.depth);
  }

  box(m, u0, v0, h0, u1, v1, h1, opts) {
    const r = this.rect(u0, v0, u1, v1);
    return this.H.box(m, r.x0, r.y0, h0, r.x1, r.y1, h1, opts);
  }

  paint(m, u0, v0, h0, u1, v1, h1) {
    const r = this.rect(u0, v0, u1, v1);
    return this.H.paint(m, r.x0, r.y0, h0, r.x1, r.y1, h1);
  }

  ball(m, u, v, h, r) {
    const [x, y] = this.xy(u, v);
    return this.H.ball(m, x, y, h, r);
  }

  post(m, u, v, h0, h1, r, opts) {
    const [x, y] = this.xy(u, v);
    return this.H.post(m, x, y, h0, h1, r, opts);
  }

  cap(m, a, b, r, opts) {
    const [ax, ay] = this.xy(a[0], a[1]);
    const [bx, by] = this.xy(b[0], b[1]);
    return this.H.cap(m, [ax, ay, a[2]], [bx, by, b[2]], r, opts);
  }

  cyl(m, a, b, r, seg) {
    const [ax, ay] = this.xy(a[0], a[1]);
    const [bx, by] = this.xy(b[0], b[1]);
    this.H.cyl(m, [ax, ay, a[2]], [bx, by, b[2]], r, seg);
  }

  disc(m, u, v, r, h) {
    const [x, y] = this.xy(u, v);
    this.H.discs.push({ m, px: x, py: y, r, h });
  }

  cone(m, u, v, h, r, height) {
    const [x, y] = this.xy(u, v);
    this.H.cone(m, x, y, h, r, height);
  }

  flat(m, pts, h0, h1) {
    this.H.flat(m, pts.map(([u, v]) => this.xy(u, v)), h0, h1);
  }

  /* A gable roof over u0..u1 by v0..v1, its ridge along the street when
   * `along`, across it otherwise. */
  roof(u0, v0, u1, v1, eave, floor, o = {}) {
    const r = this.rect(u0, v0, u1, v1);
    const ridgeAlongX = this.ew === (o.along !== false);
    if (ridgeAlongX) {
      return gableRoof(this.H, 'x', r.y0, r.y1, r.x0, r.x1, eave, floor, o);
    }
    return gableRoof(this.H, 'y', r.x0, r.x1, r.y0, r.y1, eave, floor, o);
  }

  /* Paint proud of a wall: `side` 'front' (the street's), 'back', 'left'
   * (u0) or 'right' (u1); `at` the wall's v (front, back) or u (left,
   * right); a0..a1 along it in the other coordinate. */
  onWall(m, side, at, a0, a1, h0, h1, k) {
    const out = { front: -1, back: 1, left: -1, right: 1 }[side];
    if (side === 'front' || side === 'back') {
      const [, w] = this.xy(0, at);
      const [wx] = this.xy(0, at);
      const plan = this.ew ? w : wx;
      const dir = this.ew ? (this.sv * out > 0 ? 'n' : 's') : (this.sv * out > 0 ? 'e' : 'w');
      onFace(this.H, m, dir, plan, Math.min(a0, a1), Math.max(a0, a1), h0, h1, k);
    } else {
      const [p0x, p0y] = this.xy(at, a0);
      const [p1x, p1y] = this.xy(at, a1);
      const dir = this.ew ? (out > 0 ? 'e' : 'w') : (out > 0 ? 'n' : 's');
      const plan = this.ew ? p0x : p0y;
      const lo = this.ew ? Math.min(p0y, p1y) : Math.min(p0x, p1x);
      const hi = this.ew ? Math.max(p0y, p1y) : Math.max(p0x, p1x);
      onFace(this.H, m, dir, plan, lo, hi, h0, h1, k);
    }
  }

  /* A fence from (u0, v0) to (u1, v1), one of them the same. */
  fence(ua, va, ub, vb, h, m) {
    const r = this.rect(ua, va, ub, vb);
    if (!offPlot(r, 0.5)) {
      return;
    }
    if (r.x1 - r.x0 > r.y1 - r.y0) {
      fence(this.H, 'x', (r.y0 + r.y1) / 2, r.x0, r.x1, h, m);
    } else {
      fence(this.H, 'y', (r.x0 + r.x1) / 2, r.y0, r.y1, h, m);
    }
  }

  /* Dressing (above): paint left out on Low, and a blob. */
  trim(m, u0, v0, h0, u1, v1, h1) {
    return fine(this.paint(m, u0, v0, h0, u1, v1, h1));
  }

  wallTrim(m, side, at, a0, a1, h0, h1, k) {
    const n = this.H.P.list.length;
    this.onWall(m, side, at, a0, a1, h0, h1, k);
    for (let i = n; i < this.H.P.list.length; i += 1) {
      fine(this.H.P.list[i]);
    }
  }

  bit(m, u, v, h, r, ry, spin) {
    const [x, y] = this.xy(u, v);
    bit(this.H, m, x, y, h, r, ry, spin);
  }

  /* A thin cylinder drawn only, left out on Low. */
  rod(m, a, b, r, seg = 4) {
    this.cyl(m, a, b, r, seg);
    fineLast(this.H.cyls);
  }

  /* The plan coordinate across a roof whose ridge runs along the street,
   * at the lot's depth v. */
  across(v) {
    return this.line + this.sv * v;
  }

  /*
   * A board lying on a roof slope whose ridge runs along the street: u0..u1
   * along it, v0..v1 up the slope in lot terms, `lift` off the roof and
   * `t` thick. `roof` is { ridge, mid, pitch } (gableRoof's ridge and mid,
   * in plan terms). A prism, so it follows the slope exactly.
   */
  onRoof(m, roof, u0, u1, v0, v1, lift, t) {
    const a0 = this.across(v0);
    const a1 = this.across(v1);
    const top = (a) => roof.ridge - roof.pitch * Math.abs(a - roof.mid);
    const lo = Math.min(u0, u1);
    const hi = Math.max(u0, u1);
    this.H.prism(m, this.ew ? 'x' : 'y', [
      [a0, top(a0) + lift], [a0, top(a0) + lift + t], [a1, top(a1) + lift + t], [a1, top(a1) + lift],
    ], lo, hi);
    this.H.prisms[this.H.prisms.length - 1].fine = true;
  }
}

/* ------------------------------------------------------------------ */
/* The palette                                                         */
/* ------------------------------------------------------------------ */

/* homeFoundation's pale grey stands in for a grey siding, and homeCoping
 * for the pond's stones and homeBrick for the diamond's clay below, so
 * that each is a colour the street already draws: three draw calls fewer
 * than the first build, which had a colour of its own for each. The
 * dressing keeps to the street's colours for the same reason, and leaves
 * Heads' own (his patio, his maple, his cream) to his house: a colour only
 * his house draws is one batch the size of his lot, culled when he is out
 * of view, and the first leaf of it down the street makes that batch the
 * size of the street and a draw call in every view of it. */
const SIDINGS = ['homeTrim', 'homeNeighbourTan', 'homeFoundation', 'goatSage', 'goatBlue', 'goatYellow', 'homeBrick', 'homeTrim', 'goatSage'];
const ROOFS = ['homeRoof', 'homeRoof', 'goatClay'];
const DOORS = ['homePlay', 'homePlayBlue', 'headsShutter', 'homeShutter', 'homeTrim', 'goatClay'];
const BINS = ['homeShutter', 'homePlayBlue', 'homeHedge'];

/* ------------------------------------------------------------------ */
/* A house                                                             */
/* ------------------------------------------------------------------ */

const STOREY = 2.8;
const FIRST = 0.45;

/* Windows across a wall from a0 to a1, at each storey, `skip` the one
 * left out for the door. */
function windows(L, side, at, a0, a1, storeys, o) {
  const n = Math.max(2, Math.round((a1 - a0) / 2.7));
  for (let i = 0; i < n; i += 1) {
    const c = a0 + ((i + 0.5) * (a1 - a0)) / n;
    for (let k = 0; k < storeys; k += 1) {
      if (k === 0 && o.skip !== undefined && Math.abs(c - o.skip) < 1.4) {
        continue;
      }
      const h = FIRST + 0.85 + k * STOREY;
      L.onWall(o.trim, side, at, c - 0.58, c + 0.58, h - 0.1, h + 1.48, 0.03);
      L.onWall('homeWindow', side, at, c - 0.47, c + 0.47, h, h + 1.38, 0.05);
      /* Muntins: a cross over the glass. */
      L.onWall(o.trim, side, at, c - 0.02, c + 0.02, h, h + 1.38, 0.055);
      L.onWall(o.trim, side, at, c - 0.47, c + 0.47, h + 0.67, h + 0.71, 0.055);
      /* The sill, out past the frame, on the street's side. */
      if (side === 'front') {
        L.wallTrim(o.trim, side, at, c - 0.68, c + 0.68, h - 0.2, h - 0.1, 0.1);
      }
      if (o.shutters && (side === 'front')) {
        for (const sx of [-1, 1]) {
          L.onWall(o.shutter, side, at, c + sx * 0.66 - 0.19, c + sx * 0.66 + 0.19, h - 0.04, h + 1.42, 0.05);
        }
      }
    }
  }
}

/*
 * One house on a lot: { u0, u1 } its width along the street, `sb` its
 * setback from the property line, `d` its depth, and the rest from the
 * lot's stream. Returns where its front door and garage door are, in lot
 * terms, for the walk and the drive.
 */
function house(L, r) {
  const w = 9.5 + r() * 4.5;
  const d = 8 + r() * 3;
  const sb = 7.5 + r() * 3;
  const storeys = r() < 0.55 ? 2 : 1;
  const wallM = pick(r, SIDINGS);
  const roofM = pick(r, ROOFS);
  const trim = wallM === 'homeTrim' ? 'homeWhite' : 'homeTrim';
  const shutter = pick(r, ['homeShutter', 'headsShutter', 'homePlayBlue', 'homeShutter']);
  const garageLeft = r() < 0.5;
  const garageW = r() < 0.6 ? 6.2 : 3.7;
  const lotMid = (L.u0 + L.u1) / 2;
  /* The house and its garage side by side, centred on the lot. */
  const total = w + garageW;
  const start = lotMid - total / 2;
  const hu0 = garageLeft ? start + garageW : start;
  const hu1 = hu0 + w;
  const gu0 = garageLeft ? start : hu1;
  const gu1 = gu0 + garageW;
  const v0 = sb;
  const v1 = sb + d;
  const h = FIRST + storeys * STOREY;
  const pitch = storeys === 2 ? 6 / 12 : 7 / 12;
  L.box(wallM, hu0, v0, 0, hu1, v1, h, { name: 'house' });
  const roof = { ...L.roof(hu0, v0, hu1, v1, h, h, { gable: wallM, pitch, roof: roofM }), pitch };
  /* The foundation's band, and a brick front on a few. */
  for (const [side, at, a0, a1] of [['front', v0, hu0, hu1], ['back', v1, hu0, hu1]]) {
    L.onWall('homeFoundation', side, at, a0, a1, 0, FIRST, 0.025);
  }
  L.onWall('homeFoundation', 'left', hu0, v0, v1, 0, FIRST, 0.025);
  L.onWall('homeFoundation', 'right', hu1, v0, v1, 0, FIRST, 0.025);
  if (wallM !== 'homeBrick' && r() < 0.25) {
    L.onWall('homeBrick', 'front', v0, hu0, hu1, FIRST, FIRST + 1.0, 0.03);
  }
  /* The front door, off centre toward the garage, its frame and step. */
  const door = garageLeft ? hu0 + w * 0.38 : hu1 - w * 0.38;
  const doorM = pick(r, DOORS);
  L.onWall(trim, 'front', v0, door - 0.62, door + 0.62, FIRST, FIRST + 2.32, 0.04);
  L.onWall(doorM === trim ? 'homeShutter' : doorM, 'front', v0, door - 0.47, door + 0.47, FIRST, FIRST + 2.18, 0.06);
  L.onWall('homeSteel', 'front', v0, door + 0.3, door + 0.36, FIRST + 1.0, FIRST + 1.08, 0.075);
  windows(L, 'front', v0, hu0, hu1, storeys, { trim, shutters: r() < 0.6, shutter, skip: door });
  windows(L, 'back', v1, hu0, hu1, storeys, { trim });
  const sideWall = garageLeft ? 'right' : 'left';
  windows(L, sideWall, garageLeft ? hu1 : hu0, v0, v1, storeys, { trim });
  /* The porch: a stoop under a little gable, or a deck across the front
   * with posts and a shed roof. */
  const porch = r() < 0.45;
  if (porch) {
    const pd = 2.2;
    const pu0 = hu0 + 0.3;
    const pu1 = hu1 - 0.3;
    L.box('homeWood', pu0, v0 - pd, 0, pu1, v0, FIRST - 0.05, { name: 'porch' });
    L.box('homeFoundation', door - 0.7, v0 - pd - 0.35, 0, door + 0.7, v0 - pd, FIRST * 0.5, { name: 'step' });
    const n = Math.max(2, Math.round((pu1 - pu0) / 2.4));
    for (let i = 0; i <= n; i += 1) {
      const u = pu0 + 0.12 + ((pu1 - pu0 - 0.24) * i) / n;
      L.post(trim, u, v0 - pd + 0.12, FIRST - 0.05, FIRST + 2.5, 0.07, { seg: 6, kind: 'pole' });
    }
    L.box(roofM, pu0 - 0.15, v0 - pd - 0.25, FIRST + 2.5, pu1 + 0.15, v0, FIRST + 2.62, { name: 'porch roof' });
    L.paint(trim, pu0 - 0.15, v0 - pd - 0.27, FIRST + 2.36, pu1 + 0.15, v0 - pd - 0.25, FIRST + 2.62);
    for (const [a, b] of [[pu0 + 0.2, door - 0.75], [door + 0.75, pu1 - 0.2]]) {
      if (b - a > 0.4) {
        L.paint(trim, a, v0 - pd + 0.08, FIRST + 0.85, b, v0 - pd + 0.16, FIRST + 0.92);
        for (let u = a + 0.15; u < b; u += 0.15) {
          L.paint(trim, u - 0.02, v0 - pd + 0.1, FIRST - 0.05, u + 0.02, v0 - pd + 0.14, FIRST + 0.85);
        }
      }
    }
    if (r() < 0.6) {
      L.box('homeWicker', pu0 + 0.5, v0 - 1.0, FIRST - 0.05, pu0 + 1.3, v0 - 0.3, FIRST + 0.4, { name: 'chair', kind: 'obstacle' });
    }
  } else {
    L.box('homeFoundation', door - 0.75, v0 - 1.1, 0, door + 0.75, v0, FIRST - 0.1, { name: 'stoop' });
    L.box('homeFoundation', door - 0.75, v0 - 1.45, 0, door + 0.75, v0 - 1.1, FIRST * 0.5, { name: 'step' });
    L.box(roofM, door - 1.0, v0 - 1.25, FIRST + 2.45, door + 1.0, v0, FIRST + 2.55, { name: 'canopy' });
    for (const s of [-1, 1]) {
      L.paint(trim, door + s * 0.85 - 0.06, v0 - 0.5, FIRST + 2.0, door + s * 0.85 + 0.06, v0, FIRST + 2.45);
    }
  }
  /* Pumpkins on the step: it is the end of October. */
  if (r() < 0.55) {
    L.ball('goatPumpkin', door + 0.9, v0 - (porch ? 1.7 : 0.9), porch ? FIRST + 0.13 : 0.18, 0.18);
    if (r() < 0.5) {
      L.ball('goatPumpkin', door + 1.25, v0 - (porch ? 1.5 : 0.7), porch ? FIRST + 0.1 : 0.14, 0.13);
    }
  }
  /* The garage: one storey, its own gable, its door a white panel with
   * its seams, the door's light over it. */
  const gv0 = v0 + (r() < 0.5 ? -1.0 : 0.5);
  const gv1 = gv0 + 6.6;
  const gh = 2.9;
  L.box(wallM, gu0, gv0, 0, gu1, gv1, gh, { name: 'garage' });
  L.roof(gu0, gv0, gu1, gv1, gh, gh, { gable: wallM, pitch: 5 / 12, roof: roofM, along: false, over: 0.3 });
  const dw = garageW > 5 ? 4.9 : 2.5;
  const dc = (gu0 + gu1) / 2;
  L.onWall(trim, 'front', gv0, dc - dw / 2 - 0.12, dc + dw / 2 + 0.12, 0, 2.32, 0.03);
  L.onWall(doorM === 'homeTrim' || wallM === 'homeTrim' ? 'homeWhite' : 'homeTrim', 'front', gv0, dc - dw / 2, dc + dw / 2, 0.02, 2.2, 0.05);
  for (let k = 1; k < 4; k += 1) {
    L.onWall('homeCoping', 'front', gv0, dc - dw / 2, dc + dw / 2, k * 0.55, k * 0.55 + 0.03, 0.055);
  }
  L.onWall('homeLamp', 'front', gv0, dc - 0.15, dc + 0.15, 2.45, 2.65, 0.06);
  /* A row of little windows in the door's top panel on half of them. */
  if (L.dr() < 0.5) {
    const n = dw > 3 ? 4 : 2;
    const pw = (dw - 0.3) / n;
    for (let k = 0; k < n; k += 1) {
      const a = dc - dw / 2 + 0.15 + k * pw;
      L.wallTrim('homeWindow', 'front', gv0, a + 0.08, a + pw - 0.08, 1.74, 2.06, 0.065);
    }
  }
  /* A chimney on some, up the side wall past the ridge. */
  if (r() < 0.4) {
    const cu = garageLeft ? hu1 : hu0 - 0.9;
    const cv = (v0 + v1) / 2;
    L.box('homeBrick', cu, cv - 0.6, 0, cu + 0.9, cv + 0.6, h + 2.6 + (d / 2) * pitch, { name: 'chimney' });
    L.paint('homeShelf', cu + 0.1, cv - 0.5, h + 2.6 + (d / 2) * pitch, cu + 0.8, cv + 0.5, h + 2.62 + (d / 2) * pitch);
  }
  /* The air conditioner and the bins by the garage's side. */
  const sideU = garageLeft ? hu1 + 0.15 : hu0 - 0.95;
  L.box('homeSteel', sideU, v1 - 2.0, 0, sideU + 0.8, v1 - 1.2, 0.75, { name: 'ac unit', kind: 'obstacle' });
  const binU = garageLeft ? gu0 - 0.75 : gu1 + 0.1;
  for (let k = 0; k < 2; k += 1) {
    L.box(BINS[(k + Math.floor(r() * 3)) % 3], binU, gv0 + 0.6 + k * 0.75, 0, binU + 0.62, gv0 + 1.25 + k * 0.75, 1.05, { name: 'bin', kind: 'obstacle' });
  }
  /* Beds along the front, shrubs in them. */
  for (const [a, b] of [[hu0 + 0.2, door - 1.0], [door + 1.0, hu1 - 0.2]]) {
    if (b - a < 0.8 || porch) {
      continue;
    }
    L.paint('homeMulch', a, v0 - 1.1, 0, b, v0, 0.025);
    for (let u = a + 0.45; u < b - 0.3; u += 0.9 + r() * 0.4) {
      L.ball(r() < 0.8 ? 'homeHedge' : 'headsPurple', u, v0 - 0.55, 0.36, 0.34 + r() * 0.12);
    }
  }
  dressHouse(L, {
    hu0, hu1, v0, v1, h, door, porch, roof, roofM, trim, garageLeft, gu0, gu1, gv0, gv1, gh, sideU, w, d,
  });
  return {
    door, dc, dw, gu0, gu1, gv0, gv1, v0, v1, hu0, hu1, porch,
    rect: L.rect(Math.min(hu0, gu0) - 1, Math.min(v0, gv0) - 2.5, Math.max(hu1, gu1) + 1, Math.max(v1, gv1) + 0.5),
  };
}

/*
 * A HOUSE DRESSED (THE DRESSING, above), from the lot's own stream `L.dr`:
 * gutters and downpipes, a porch light, a doormat, the air conditioner's
 * grille, foundation vents, a vent stack on the roof, and on some a
 * satellite dish, solar panels, window boxes in flower, orange lights
 * along the porch, a spider on the roof. `o` is what house() worked out.
 */
const EAVE_OVER = 0.35;
function dressHouse(L, o) {
  const r = L.dr;
  const { hu0, hu1, v0, v1, h, door, porch, roof, garageLeft, sideU, w, d } = o;
  const yEdge = h - 0.15;
  /* Gutters under both eaves, outside the fascia. */
  L.trim('homeWhite', hu0 - EAVE_OVER, v0 - EAVE_OVER - 0.15, yEdge - 0.36, hu1 + EAVE_OVER, v0 - EAVE_OVER - 0.02, yEdge - 0.18);
  L.trim('homeWhite', hu0 - EAVE_OVER, v1 + EAVE_OVER + 0.02, yEdge - 0.36, hu1 + EAVE_OVER, v1 + EAVE_OVER + 0.15, yEdge - 0.18);
  /* Downpipes: the front corner away from the garage, both back corners,
   * each with its dogleg in to the wall under the gutter. */
  const pipes = [[garageLeft ? hu1 - 0.24 : hu0 + 0.1, v0, -1], [hu0 + 0.1, v1, 1], [hu1 - 0.24, v1, 1]];
  for (const [u, at, s] of pipes) {
    const wall = at + s * 0.01;
    const out = at + s * 0.13;
    L.trim('homeWhite', u, wall, 0.05, u + 0.14, out, yEdge - 0.42);
    L.trim('homeWhite', u, out, yEdge - 0.5, u + 0.14, at + s * (EAVE_OVER + 0.1), yEdge - 0.36);
    L.trim('homeWhite', u - 0.04, wall, 0.02, u + 0.18, out + s * 0.18, 0.12);
  }
  /* The porch light beside the door, away from the garage. */
  const ls = garageLeft ? 1 : -1;
  const lu = door + ls * 0.8;
  L.wallTrim('homeShelf', 'front', v0, lu - 0.1, lu + 0.1, FIRST + 1.52, FIRST + 1.98, 0.08);
  L.wallTrim('homeLamp', 'front', v0, lu - 0.07, lu + 0.07, FIRST + 1.58, FIRST + 1.9, 0.15);
  /* A doormat. */
  const matV = porch ? v0 - 0.75 : v0 - 0.95;
  const matH = porch ? FIRST - 0.05 : FIRST - 0.1;
  L.trim(r() < 0.5 ? 'homeMulch' : 'homeShelf', door - 0.42, matV, matH, door + 0.42, matV + 0.5, matH + 0.012);
  /* The air conditioner's grille, and two vents in the foundation. */
  L.trim('homeShelf', sideU + 0.08, v1 - 1.92, 0.75, sideU + 0.72, v1 - 1.28, 0.77);
  for (const f of [0.18, 0.82]) {
    const u = hu0 + w * f;
    if (Math.abs(u - door) > 1.2) {
      L.wallTrim('homeShelf', 'front', v0, u - 0.22, u + 0.22, 0.14, 0.3, 0.04);
    }
  }
  /* A vent stack through the back of the roof. */
  const top = (v) => roof.ridge - roof.pitch * Math.abs(L.across(v) - roof.mid);
  const sv = v0 + d * 0.72;
  const su = hu0 + w * (0.3 + 0.4 * r());
  L.rod('homeShelf', [su, sv, top(sv) - 0.1], [su, sv, top(sv) + 0.5], 0.055, 6);
  /* A satellite dish at the back on a quarter of them, tilted to the sky. */
  if (r() < 0.25) {
    const du = r() < 0.5 ? hu0 + 0.9 : hu1 - 0.9;
    const dv = v1 - 0.9;
    const base = top(dv);
    L.rod('homeSteel', [du, dv, base - 0.05], [du, dv, base + 0.55], 0.03, 4);
    L.bit('homeWhite', du, dv - 0.12, base + 0.72, 0.36, 0.09, [-0.9, 0, 0.2]);
    L.rod('homeSteel', [du, dv - 0.12, base + 0.72], [du, dv - 0.5, base + 0.95], 0.015, 3);
  }
  /* Solar panels on the street's slope of about one in six: two rows of
   * dark glass boards, the roof showing between. */
  if (r() < 0.17 && w > 9) {
    const mid = (v0 + v1) / 2;
    const n = Math.floor((w - 2.2) / 1.12);
    const ua = (hu0 + hu1) / 2 - (n * 1.12) / 2;
    const rowsV = [[v0 + 0.25, (v0 + mid) / 2 - 0.05], [(v0 + mid) / 2 + 0.05, mid - 0.5]];
    for (const [va, vb] of rowsV) {
      for (let k = 0; k < n; k += 1) {
        L.onRoof('homeWindow', roof, ua + k * 1.12 + 0.05, ua + (k + 1) * 1.12 - 0.05, va, vb, 0.04, 0.06);
      }
    }
  }
  /* Window boxes in flower under the ground floor's front windows, on some
   * of the houses with no porch to hide them. */
  if (!porch && r() < 0.3) {
    const n = Math.max(2, Math.round((hu1 - hu0) / 2.7));
    const box = r() < 0.5 ? 'homeWood' : 'homeWhite';
    const tones = [pick(r, FLOWERS), pick(r, FLOWERS)];
    for (let i = 0; i < n; i += 1) {
      const c = hu0 + ((i + 0.5) * (hu1 - hu0)) / n;
      if (Math.abs(c - door) < 1.4) {
        continue;
      }
      const hh = FIRST + 0.85;
      L.trim(box, c - 0.6, v0 - 0.34, hh - 0.46, c + 0.6, v0 - 0.02, hh - 0.21);
      for (let k = 0; k < 5; k += 1) {
        L.bit(tones[k % 2], c - 0.48 + k * 0.24, v0 - 0.18, hh - 0.17, 0.12, 0.1, [r() * 3, r() * 3, 0]);
      }
    }
  }
  /* Orange and purple lights along a third of the porches: it is the end
   * of October. */
  if (porch && r() < 0.35) {
    const pd = 2.2;
    for (let u = hu0 + 0.45, k = 0; u < hu1 - 0.4; u += 0.42, k += 1) {
      L.bit(k % 2 ? 'headsPurple' : 'goatPumpkin', u, v0 - pd - 0.33, FIRST + 2.3, 0.065);
    }
  }
  /* And on one house in sixteen, a spider the size of a goat on the roof. */
  if (r() < 0.06) {
    const u = hu0 + w * (0.3 + 0.4 * r());
    const v = v0 + d * 0.3;
    const z = top(v);
    L.bit('homeShelf', u, v, z + 0.28, 0.45, 0.3, [0, 0, 0]);
    L.bit('homeShelf', u, v - 0.55, z + 0.32, 0.26, 0.22, [0, 0, 0]);
    L.bit('homePlay', u - 0.09, v - 0.78, z + 0.42, 0.05);
    L.bit('homePlay', u + 0.09, v - 0.78, z + 0.42, 0.05);
    for (const s of [-1, 1]) {
      for (let k = 0; k < 4; k += 1) {
        const lv = v - 0.45 + k * 0.32;
        const kneeU = u + s * 0.7;
        const footU = u + s * 1.15;
        const footV = lv + (k - 1.5) * 0.25;
        L.rod('homeShelf', [u + s * 0.2, lv * 0.5 + v * 0.5, z + 0.32], [kneeU, lv, z + 0.62], 0.035, 4);
        L.rod('homeShelf', [kneeU, lv, z + 0.62], [footU, footV, top(footV) + 0.02], 0.03, 4);
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* What people keep in a yard                                          */
/* ------------------------------------------------------------------ */

const BACK_THINGS = ['trampoline', 'swings', 'shed', 'pool', 'sandpit', 'playhouse', 'patio', 'doghouse', 'garden', 'shed', 'trampoline', 'swings'];

function backThing(L, kind, u, v, r) {
  switch (kind) {
    case 'trampoline': {
      L.disc('homePlayBlue', u, v, 1.8, 0.9);
      L.disc('homeShutter', u, v, 1.55, 0.92);
      for (const [du, dv] of [[1.3, 1.3], [-1.3, 1.3], [1.3, -1.3], [-1.3, -1.3]]) {
        L.cap('homeSteel', [u + du, v + dv, 0], [u + du, v + dv, 0.88], 0.04, { seg: 5, kind: 'pole' });
      }
      L.box('homeShutter', u - 1.3, v - 1.3, 0.85, u + 1.3, v + 1.3, 0.92, { draw: false, name: 'trampoline', kind: 'obstacle' });
      break;
    }
    case 'swings': {
      for (const s of [-1, 1]) {
        L.cap('homeWood', [u + s * 1.6, v - 0.8, 0], [u + s * 1.6, v, 2.3], 0.06, { seg: 5, kind: 'pole' });
        L.cap('homeWood', [u + s * 1.6, v + 0.8, 0], [u + s * 1.6, v, 2.3], 0.06, { seg: 5, kind: 'pole' });
      }
      L.cap('homeWood', [u - 1.7, v, 2.3], [u + 1.7, v, 2.3], 0.07, { seg: 6, kind: 'pole' });
      for (const du of [-0.7, 0.7]) {
        L.cyl('homeSteel', [u + du - 0.2, v, 2.28], [u + du - 0.2, v, 0.55], 0.012, 3);
        L.cyl('homeSteel', [u + du + 0.2, v, 2.28], [u + du + 0.2, v, 0.55], 0.012, 3);
        L.box(du < 0 ? 'homePlay' : 'homeBook', u + du - 0.25, v - 0.12, 0.5, u + du + 0.25, v + 0.12, 0.56, { name: 'swing', kind: 'obstacle' });
      }
      break;
    }
    case 'shed': {
      const m = pick(r, ['homeFenceWood', 'goatSage', 'homeTrim', 'goatClay']);
      L.box(m, u - 1.5, v - 1.2, 0, u + 1.5, v + 1.2, 2.0, { name: 'shed' });
      L.roof(u - 1.5, v - 1.2, u + 1.5, v + 1.2, 2.0, 2.0, { gable: m, pitch: 6 / 12, roof: 'homeRoof', over: 0.15 });
      L.onWall(m === 'homeTrim' ? 'homeShutter' : 'homeTrim', 'front', v - 1.2, u - 0.6, u + 0.6, 0, 1.85, 0.04);
      break;
    }
    case 'pool': {
      L.disc('homePlayBlue', u, v, 2.4, 1.15);
      L.disc('homeWater', u, v, 2.3, 1.17);
      L.box('homeWood', u + 2.3, v - 0.4, 0, u + 2.9, v + 0.4, 1.15, { name: 'pool steps' });
      L.box('homeShutter', u - 2.0, v - 2.0, 0, u + 2.0, v + 2.0, 1.15, { draw: false, name: 'pool', kind: 'obstacle' });
      break;
    }
    case 'sandpit': {
      L.paint('homeWood', u - 1.2, v - 1.2, 0, u + 1.2, v + 1.2, 0.25);
      L.paint('homeBook', u - 1.05, v - 1.05, 0.25, u + 1.05, v + 1.05, 0.27);
      L.ball('homePlay', u + 0.4, v - 0.3, 0.33, 0.1);
      break;
    }
    case 'playhouse': {
      L.box('homeWood', u - 1.1, v - 1.1, 0, u + 1.1, v + 1.1, 1.0, { name: 'playhouse deck' });
      for (const [du, dv] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        L.post('homeWood', u + du, v + dv, 1.0, 2.4, 0.06, { seg: 5, kind: 'pole' });
      }
      L.roof(u - 1.1, v - 1.1, u + 1.1, v + 1.1, 2.4, 2.4, { gable: 'homeWood', pitch: 9 / 12, roof: 'homePlay', over: 0.2 });
      L.cap('homeBook', [u, v - 1.1, 1.0], [u, v - 3.2, 0.15], 0.22, { seg: 8, name: 'slide' });
      break;
    }
    case 'patio': {
      L.paint('homeDrive', u - 2.5, v - 2.0, 0, u + 2.5, v + 2.0, G_PAVE);
      L.disc('homeWood', u, v, 0.7, 0.74);
      L.post('homeWood', u, v, 0, 0.74, 0.05, { seg: 5, kind: 'pole' });
      L.post('homeSteel', u, v, 0.74, 2.3, 0.025, { seg: 4, kind: 'pole' });
      L.cone(pick(r, ['homePlay', 'homeTeal', 'homeBook']), u, v, 2.0, 1.4, 0.45);
      L.box('homeShelf', u + 1.6, v - 1.6, 0, u + 2.3, v - 0.9, 1.0, { name: 'grill', kind: 'obstacle' });
      for (const [du, dv] of [[-1.1, 0], [1.1, 0], [0, -1.1], [0, 1.1]]) {
        L.box('homeShutter', u + du - 0.22, v + dv - 0.22, 0, u + du + 0.22, v + dv + 0.22, 0.85, { name: 'chair', kind: 'obstacle' });
      }
      break;
    }
    case 'doghouse': {
      L.box('goatClay', u - 0.6, v - 0.5, 0, u + 0.6, v + 0.5, 0.8, { name: 'doghouse' });
      L.roof(u - 0.6, v - 0.5, u + 0.6, v + 0.5, 0.8, 0.8, { gable: 'goatClay', pitch: 10 / 12, roof: 'homeRoof', over: 0.1 });
      L.onWall('homeShelf', 'front', v - 0.5, u - 0.22, u + 0.22, 0, 0.5, 0.02);
      break;
    }
    case 'garden': {
      for (let k = 0; k < 3; k += 1) {
        L.box('homeWood', u - 2, v - 1.6 + k * 1.2, 0, u + 2, v - 0.9 + k * 1.2, 0.35, { name: 'raised bed', kind: 'obstacle' });
        for (let j = 0; j < 6; j += 1) {
          L.ball(j % 3 ? 'homeHedge' : 'homePlay', u - 1.6 + j * 0.64, v - 1.25 + k * 1.2, 0.5, 0.2);
        }
      }
      break;
    }
    default:
      break;
  }
}

/*
 * A small tree in a back yard, a dogwood, a plum or a maple: a trunk and
 * four round blobs in the house's own paint (no new colour, so no new draw
 * call), a fifth of a street tree's triangles, solid like one.
 */
const SMALL_CROWNS = ['homeHedge', 'headsPurple', 'homeWhite', 'headsShutter', 'homeHedge'];
function smallTree(L, u, v, r) {
  const T = 3.2 + r() * 1.4;
  const R = 0.32 * T;
  const cy = 0.68 * T;
  const m = pick(r, SMALL_CROWNS);
  L.post('homeWood', u, v, 0, cy, 0.09, { seg: 5, kind: 'pole' });
  /* Its crown is solid, so it is drawn on every preset (`keep`). */
  const bits = L.H.bits ? L.H.bits.length : 0;
  L.bit(m, u, v, cy + R * 0.3, R * 0.75, R * 0.62, [r() * 3, r() * 3, 0]);
  const turn = r() * Math.PI * 2;
  for (let i = 0; i < 3; i += 1) {
    const a = turn + (i / 3) * Math.PI * 2;
    L.bit(m, u + Math.cos(a) * R * 0.55, v + Math.sin(a) * R * 0.55, cy - R * 0.1, R * 0.58, R * 0.5, [r() * 3, r() * 3, 0]);
  }
  for (let i = bits; i < L.H.bits.length; i += 1) {
    L.H.bits[i].keep = true;
  }
  const [x, y] = L.xy(u, v);
  L.H.cap(m, [x, y, cy], [x, y, cy], R * 0.75, { draw: false, name: 'canopy', kind: 'canopy' });
}

/* ------------------------------------------------------------------ */
/* Trees and cars                                                      */
/* ------------------------------------------------------------------ */

/*
 * A TREE OF THE STREET'S OWN, lighter than the town's. The town's street
 * tree (treeDraw in src/props/street.js) is twenty leaf blobs, four
 * limbs and their forks, about three and a half thousand triangles, and a
 * hundred and twenty eight of them were half a million triangles drawn
 * twice, once for the shadow: the first build of this map was 1.7 million
 * a frame. This one is the same tree to a whoop going past it, in the
 * same paint (the grove's tones, the grove's wood, so no new draw call):
 * a trunk, two limbs and seven blobs, a fifth of the cost. Heads' own
 * trees round his house are still the town's (../heads/heads.js), so his
 * yard is as his map has it.
 *
 * `grove` collects them: { m, c, r, ry, spin } a blob, { m, a, b, r, rTop,
 * seg } a piece of wood, all in the world frame, drawn by ./index.js in
 * the trees' own chunk. Their solids are parts like any other.
 */
const grove = [];
const GROVE_TONES = ['stGrove0', 'stGrove1', 'stGrove2'];
let treeN = 0;
function tree(H, px, py, k) {
  treeN += 1;
  const r = stream(0x7ee0 + treeN * 97);
  const T = TREE_M * k * (0.85 + 0.3 * r());
  const trunkTop = 0.55 * T;
  const trunkR = 0.045 * T;
  const R = 0.3 * T;
  const cy = 0.66 * T;
  const w = (x, y, h) => worldAt(x, y, h);
  grove.push({ m: 'stGroveWood', a: w(px, py, 0), b: w(px, py, trunkTop), r: S * trunkR, rTop: S * trunkR * 0.6, seg: 6 });
  H.cap('stGroveWood', [px, py, 0], [px, py, trunkTop], trunkR * 0.8, { draw: false, name: 'trunk', kind: 'tree' });
  const turn = r() * Math.PI * 2;
  for (let i = 0; i < 2; i += 1) {
    const a = turn + i * Math.PI * 0.9;
    const end = [px + Math.cos(a) * R * 0.75, py + Math.sin(a) * R * 0.75, cy + R * 0.1];
    /* A limb is all but hidden in the crown: Low leaves it out. */
    grove.push({
      m: 'stGroveWood', a: w(px, py, trunkTop * 0.85), b: w(end[0], end[1], end[2]), r: S * trunkR * 0.45, rTop: S * trunkR * 0.25, seg: 5, fine: true,
    });
  }
  /* The blobs: a crown on top, five round it and one low on the side the
   * limbs went, the top the lightest tone and the bottom the darkest. */
  const blob = (dx, dy, dh, rr, tone) => {
    grove.push({
      m: GROVE_TONES[tone], c: w(px + dx, py + dy, cy + dh), r: S * rr, ry: S * rr * (0.78 + 0.12 * r()),
      spin: [r() * 3, r() * 3, r() * 3],
    });
  };
  blob(0, 0, R * 0.55, R * 0.62, 0);
  for (let i = 0; i < 5; i += 1) {
    const a = turn + (i / 5) * Math.PI * 2 + r() * 0.5;
    const d = R * (0.55 + 0.2 * r());
    blob(Math.cos(a) * d, Math.sin(a) * d, R * (r() * 0.4 - 0.15), R * (0.5 + 0.15 * r()), i % 2 ? 1 : 2);
  }
  blob(Math.cos(turn) * R * 0.5, Math.sin(turn) * R * 0.5, -R * 0.45, R * 0.45, 2);
  /* Low leaves the low one out: the crown reads the same from a whoop's
   * height, and it pays for Low's share of the goats (./goatdraw.js). */
  grove[grove.length - 1].fine = true;
  /* What is solid of the crown: a ball inside the blobs, as the town's
   * canopy solids are inside theirs. */
  H.cap('stGrove1', [px, py, cy + R * 0.1], [px, py, cy + R * 0.1], R * 0.8, { draw: false, name: 'canopy', kind: 'canopy' });
  /* Autumn under half of them: a leaf pile or two, flat, in the reds and
   * oranges of the season (dressing, after every draw the tree's own
   * shape takes, so the tree is as it was). */
  if (r() < 0.5) {
    const n = 1 + Math.floor(r() * 3);
    for (let i = 0; i < n; i += 1) {
      const a = turn + i * 2.1 + r();
      const d = R * (0.25 + 0.5 * r());
      bit(H, pick(r, LEAVES), px + Math.cos(a) * d, py + Math.sin(a) * d, 0.02, 0.45 + r() * 0.4, 0.09, [0, r() * 3, 0]);
    }
  }
  return { T, R, cy, trunkTop };
}

let carN = 0;
const CAR_STYLES = ['sedan', 'wagon', 'hatch', 'minivan', 'sedan', 'hatch'];
function car(H, px, py, yaw, r, h) {
  carN += 1;
  const el = { id: `goats-car-${carN}`, type: 'car', style: pick(r, CAR_STYLES), dims: { variant: Math.floor(r() * 30) } };
  H.asset(el, S, px, py, h, yaw, 'extra:street');
}

/* ------------------------------------------------------------------ */
/* The lots                                                            */
/* ------------------------------------------------------------------ */

/*
 * The rows of lots, each along one side of a street between the cross
 * streets: `face` the street's side of the lot, `line` the property line,
 * u0..u1 along the street, `depth` back from the line.
 */
function rows() {
  const [A, C, D] = EW;
  const [B, W, E] = NS;
  const mid = [lineOf(B, 1), lineOf(E, -1)];
  const west = [lineOf(W, 1), lineOf(B, -1)];
  const far = [BOUNDS.x0, lineOf(W, -1)];
  const east = [lineOf(E, 1), BOUNDS.x1];
  const ySpans = [
    [BOUNDS.y0, lineOf(D, -1)], [lineOf(D, 1), lineOf(A, -1)], [lineOf(A, 1), lineOf(C, -1)], [lineOf(C, 1), BOUNDS.y1],
  ];
  const out = [];
  /* The middle column faces the east west streets, as Heads' row does. */
  out.push({ face: 's', line: lineOf(A, 1), u: mid, depth: 31 });
  out.push({ face: 'n', line: lineOf(C, -1), u: mid, depth: 31 });
  out.push({ face: 'n', line: lineOf(A, -1), u: mid, depth: 31 });
  out.push({ face: 's', line: lineOf(C, 1), u: mid, depth: BOUNDS.y1 - lineOf(C, 1) });
  out.push({ face: 'n', line: lineOf(D, -1), u: mid, depth: lineOf(D, -1) - BOUNDS.y0 });
  /* West of the cross street, two rows back to back facing the north
   * south streets, as the houses across from Heads' face it; past Street
   * W and Street E, one row each facing in. */
  for (const [a, b] of ySpans) {
    out.push({ face: 'e', line: west[1], u: [a, b], depth: 27 });
    out.push({ face: 'w', line: west[0], u: [a, b], depth: 27 });
    out.push({ face: 'e', line: far[1], u: [a, b], depth: far[1] - far[0] });
    out.push({ face: 'w', line: east[0], u: [a, b], depth: east[1] - east[0] });
  }
  return out;
}

/*
 * The lots of one row: widths of 19 to 23 metres from the stream, the
 * spare spread evenly, the ends kept off the corners.
 */
function lotsOf(row, r) {
  const a0 = row.u[0] + 3;
  const a1 = row.u[1] - 3;
  const out = [];
  if (a1 - a0 < 16) {
    return out;
  }
  const widths = [];
  let sum = 0;
  for (;;) {
    const w = 19 + r() * 4;
    if (sum + w > a1 - a0) {
      break;
    }
    widths.push(w);
    sum += w;
  }
  const spare = (a1 - a0 - sum) / Math.max(1, widths.length);
  let u = a0;
  for (const w of widths) {
    out.push([u, u + w + spare]);
    u += w + spare;
  }
  return out;
}

/* The drives cut through the kerbs, by street and side. */
const cuts = new Map();
function cutKerb(street, side, a0, a1) {
  const k = `${street}${side}`;
  if (!cuts.has(k)) {
    cuts.set(k, []);
  }
  cuts.get(k).push([a0, a1]);
}

/* Which street a row's line belongs to, and on which side. */
function streetOfRow(row) {
  const list = row.face === 's' || row.face === 'n' ? EW : NS;
  for (const st of list) {
    for (const s of [1, -1]) {
      if (Math.abs(lineOf(st, s) - row.line) < 1e-6) {
        return { st, s };
      }
    }
  }
  return null;
}

function lots(H, r) {
  for (const R of rows()) {
    const { face, line } = R;
    const on = streetOfRow(R);
    for (const [u0, u1] of lotsOf(R, r)) {
      const L = new Lot(H, face, line, u0, u1, R.depth);
      const all = L.all;
      if (all.x0 < BOUNDS.x0 - 0.1 || all.x1 > BOUNDS.x1 + 0.1 || all.y0 < BOUNDS.y0 - 0.1 || all.y1 > BOUNDS.y1 + 0.1) {
        continue;
      }
      /* The park takes its block. */
      if (overlaps(all, PARK, -1)) {
        continue;
      }
      const probe = new Lot(new House(), face, line, u0, u1, R.depth);
      const seed = r();
      /* The dressing draws from a stream of its own, so the street's own
       * draws, and so the street, are as they were before it. */
      const dressSeed = Math.floor(seed * 4294967296) ^ 0x5eed;
      probe.dr = stream(dressSeed);
      const look = house(probe, stream(Math.floor(seed * 4294967296)));
      if (!offPlot(look.rect, 2)) {
        besidePlot(H, R, u0, u1, seed);
        continue;
      }
      const lr = stream(Math.floor(seed * 4294967296));
      L.dr = stream(dressSeed);
      const hs = house(L, lr);
      yard(L, hs, lr, on);
    }
  }
}

/*
 * A lot that Heads' house's plot cuts into has no house, and what is left
 * of it beside the plot was bare lawn where the street met his. It is a
 * garden now: small trees, shrubs and a shed at the back, from a stream of
 * its own, so every other lot is as it was.
 */
function besidePlot(H, R, u0, u1, seed) {
  const ew = R.face === 's' || R.face === 'n';
  const left = [u0, Math.min(u1, (ew ? PLOT.x0 : PLOT.y0) - 1.5)];
  const right = [Math.max(u0, (ew ? PLOT.x1 : PLOT.y1) + 1.5), u1];
  const [a, b] = left[1] - left[0] >= right[1] - right[0] ? left : right;
  if (b - a < 6) {
    return;
  }
  const L = new Lot(H, R.face, R.line, a, b, R.depth);
  const r = stream(Math.floor(seed * 4294967296) ^ 0xb351de);
  const taken = [];
  const spot = (w, d, va, vb) => {
    for (let k = 0; k < 8; k += 1) {
      const u = a + 0.8 + w / 2 + r() * Math.max(0, b - a - 1.6 - w);
      const v = va + d / 2 + r() * Math.max(0, vb - va - d);
      const t = { u0: u - w / 2, v0: v - d / 2, u1: u + w / 2, v1: v + d / 2 };
      if (offPlot(L.rect(t.u0, t.v0, t.u1, t.v1), 0.5)
        && !taken.some((o) => t.u0 < o.u1 && t.u1 > o.u0 && t.v0 < o.v1 && t.v1 > o.v0)) {
        taken.push(t);
        return [u, v];
      }
    }
    return null;
  };
  if (R.depth > 14) {
    const at = spot(6.4, 6.4, R.depth - 9, R.depth - 0.8);
    if (at) {
      backThing(L, pick(r, ['shed', 'garden', 'shed', 'playhouse']), at[0], at[1], r);
    }
  }
  const trees = 1 + Math.floor((b - a) / 6) + (r() < 0.5 ? 1 : 0);
  for (let k = 0; k < trees; k += 1) {
    const at = spot(2.8, 2.8, 3, R.depth - 1);
    if (at) {
      smallTree(L, at[0], at[1], r);
    }
  }
  for (let k = 0; k < 8; k += 1) {
    const at = spot(1.0, 1.0, 1.5, R.depth - 1);
    if (at) {
      L.bit(r() < 0.75 ? 'homeHedge' : 'headsPurple', at[0], at[1], 0.3, 0.45 + r() * 0.2, 0.36 + r() * 0.1, [r() * 3, r() * 3, 0]);
    }
  }
}

/* The yard round a house: the drive and the walk, the mailbox, the trees,
 * the fence and what is behind it. */
function yard(L, hs, r, on) {
  const H = L.H;
  /* What is where in the lot, in its own terms, for the dressing to keep
   * clear of: { u0, v0, u1, v1 }. */
  const taken = [];
  const take = (u0, v0, u1, v1) => taken.push({ u0, v0, u1, v1 });
  /* The drive from the garage door out across the walk and the verge to
   * the kerb, and its cut in the kerb. */
  const d0 = hs.dc - hs.dw / 2 - 0.4;
  const d1 = hs.dc + hs.dw / 2 + 0.4;
  const driveM = r() < 0.5 ? 'homeAsphalt' : 'homeDrive';
  L.paint(driveM, d0, -SIDE + KERB_W, 0, d1, hs.gv0, G_DRIVE);
  take(d0 - 0.3, 0, d1 + 0.3, hs.gv0);
  if (on) {
    cutKerb(on.st.id, on.s, Math.min(...[L.xy(d0, 0), L.xy(d1, 0)].map((p) => (L.ew ? p[0] : p[1]))),
      Math.max(...[L.xy(d0, 0), L.xy(d1, 0)].map((p) => (L.ew ? p[0] : p[1]))));
  }
  /* A car on about half the drives, nose in: each is three thousand
   * triangles, drawn twice with its shadow. */
  if (r() < 0.45) {
    const [x, y] = L.xy(hs.dc + (hs.dw > 3 ? (r() < 0.5 ? -1.3 : 1.3) : 0), hs.gv0 - 3.4);
    const yaw = L.ew ? (L.sv > 0 ? Math.PI / 2 : -Math.PI / 2) : (L.sv > 0 ? 0 : Math.PI);
    car(H, x, y, yaw, r, G_DRIVE);
  }
  /* The walk from the door to the street's walk. */
  L.paint('homeDrive', hs.door - 0.6, 0, 0, hs.door + 0.6, hs.v0 - (hs.porch ? 2.55 : 1.45), G_PAVE);
  take(hs.door - 0.9, 0, hs.door + 0.9, hs.v0);
  /* The mailbox by the drive at the walk. */
  const mu = hs.dc + (hs.dw / 2 + 0.9) * (r() < 0.5 ? -1 : 1);
  L.post('homeShutter', mu, 0.4, 0, 1.05, 0.05, { seg: 6, kind: 'pole' });
  L.box(pick(r, ['homeShutter', 'homeTrim', 'homePlay']), mu - 0.25, 0.15, 1.05, mu + 0.25, 0.65, 1.32, { name: 'mailbox' });
  take(mu - 0.6, 0, mu + 0.6, 1.0);
  /* A basketball hoop at the drive's edge on some. */
  if (r() < 0.3) {
    const bu = hs.dc + (hs.dw / 2 + 0.5) * (r() < 0.5 ? -1 : 1);
    L.post('homeShutter', bu, hs.gv0 - 5.5, 0, 3.3, 0.06, { seg: 6, kind: 'pole' });
    L.box('homeTrim', bu - 0.6, hs.gv0 - 5.4, 2.9, bu + 0.6, hs.gv0 - 5.35, 3.65, { name: 'backboard' });
    L.cyl('homePlay', [bu - 0.23, hs.gv0 - 5.1, 3.05], [bu + 0.23, hs.gv0 - 5.1, 3.05], 0.015, 4);
    take(bu - 0.8, hs.gv0 - 6, bu + 0.8, hs.gv0 - 4.8);
  }
  /* Trees in the front yard and at the back. */
  const trees = [];
  const fu = r() < 0.5 ? L.u0 + 3 + r() * 3 : L.u1 - 3 - r() * 3;
  if (Math.abs(fu - hs.dc) > hs.dw / 2 + 3 && r() < 0.8) {
    const fv = 2.5 + r() * 2;
    const [x, y] = L.xy(fu, fv);
    if (offPlot({ x0: x - 4, x1: x + 4, y0: y - 4, y1: y + 4 })) {
      trees.push({ u: fu, v: fv, front: true, ...tree(H, x, y, 1.1 + r() * 0.6) });
      take(fu - 1.2, fv - 1.2, fu + 1.2, fv + 1.2);
    }
  }
  for (let k = 0; k < 2; k += 1) {
    if (r() < 0.6) {
      const tu = L.u0 + 2.5 + r() * (L.u1 - L.u0 - 5);
      const tv = L.depth - 2.5 - r() * 3;
      const [x, y] = L.xy(tu, tv);
      if (offPlot({ x0: x - 4, x1: x + 4, y0: y - 4, y1: y + 4 })) {
        trees.push({ u: tu, v: tv, front: false, ...tree(H, x, y, 1.2 + r() * 0.7) });
        take(tu - 1.2, tv - 1.2, tu + 1.2, tv + 1.2);
      }
    }
  }
  /* The back yard: fenced on a few (privacy, picket), open on the rest,
   * and one or two things in it. */
  const back0 = hs.v1 + 1.2;
  const fenceKind = r();
  let fenced = null;
  if (fenceKind < 0.45 && L.depth - back0 > 6) {
    const fh = fenceKind < 0.25 ? 1.83 : 1.1;
    const fm = fenceKind < 0.25 ? 'homeFenceWood' : 'homeTrim';
    const fv0 = Math.min(hs.v0 + 2, hs.v1 - 1);
    const e = L.depth - 0.3;
    L.fence(L.u0 + 0.3, fv0, L.u0 + 0.3, e, fh, fm);
    L.fence(L.u1 - 0.3, fv0, L.u1 - 0.3, e, fh, fm);
    L.fence(L.u0 + 0.3, e, L.u1 - 0.3, e, fh, fm);
    /* Front of it, house to side fence, a gate left open on one side. */
    const left = Math.min(hs.hu0, hs.gu0);
    const right = Math.max(hs.hu1, hs.gu1);
    if (left - L.u0 > 2.2) {
      L.fence(L.u0 + 0.3, fv0, left - 1.4, fv0, fh, fm);
    }
    if (L.u1 - right > 1.2) {
      L.fence(right, fv0, L.u1 - 0.3, fv0, fh, fm);
    }
    fenced = { fv0, e, fh, fm };
  }
  const things = [];
  if (L.depth - back0 > 6) {
    const n = 1 + (r() < 0.5 ? 1 : 0);
    for (let k = 0; k < n; k += 1) {
      const u = L.u0 + 4 + ((k + 0.5) / n) * (L.u1 - L.u0 - 8);
      const v = back0 + 3 + r() * Math.max(0.5, L.depth - back0 - 7);
      const [x, y] = L.xy(u, v);
      if (offPlot({ x0: x - 3.5, x1: x + 3.5, y0: y - 3.5, y1: y + 3.5 })) {
        const kind = pick(r, BACK_THINGS);
        backThing(L, kind, u, v, r);
        things.push(kind);
        take(u - 3.2, v - 3.2, u + 3.2, v + 3.2);
        if (kind === 'pool') {
          goatBlocks.push({ x0: x - 2.6, x1: x + 2.6, y0: y - 2.6, y1: y + 2.6 });
        }
      }
    }
  }
  /* Bins out at the kerb on a few: it is collection day somewhere. */
  if (r() < 0.25) {
    const bu = hs.dc + (hs.dw / 2 + 1.0) * (r() < 0.5 ? -1 : 1);
    for (let k = 0; k < 2; k += 1) {
      L.box(BINS[k], bu + k * 0.75, -SIDE + KERB_W + 0.4, 0, bu + k * 0.75 + 0.62, -SIDE + KERB_W + 1.05, 1.05, { name: 'bin', kind: 'obstacle' });
    }
  }
  dressYard(L, hs, {
    taken, trees, fenced, things, driveM, d0, d1, mu,
  });
}

/*
 * A YARD DRESSED (THE DRESSING, above), from the lot's own stream: flowers
 * in the beds and a bed before a porch, the mailbox's flag, seams in a
 * concrete drive; on some a hedge down the side, a picket fence, a gnome
 * or three, a bike dropped on the lawn, gravestones and a ghost in the
 * front tree; at the back a deck or a patio at the back door with a grill,
 * a table and chairs, and on some a washing line, a fire pit, a wood pile,
 * a paddling pool, a goal, shrubs along the back fence. Whatever stands up
 * enough to clip a whoop is solid and drawn on every preset; the rest is
 * dressing. `o` is what yard() placed.
 */
function dressYard(L, hs, o) {
  const r = L.dr;
  const { taken, trees, fenced, driveM, d0, d1, mu } = o;
  taken.push({
    u0: Math.min(hs.hu0, hs.gu0) - 1.2,
    v0: Math.min(hs.v0, hs.gv0) - (hs.porch ? 2.8 : 1.7),
    u1: Math.max(hs.hu1, hs.gu1) + 1.2,
    v1: Math.max(hs.v1, hs.gv1) + 0.3,
  });
  const free = (u0, v0, u1, v1) => u0 > L.u0 + 0.6 && u1 < L.u1 - 0.6 && v0 > 0.3 && v1 < L.depth - 0.6
    && !taken.some((t) => u0 < t.u1 && u1 > t.u0 && v0 < t.v1 && v1 > t.v0) && offPlot(L.rect(u0, v0, u1, v1), 0.5);
  const take = (u0, v0, u1, v1) => taken.push({ u0, v0, u1, v1 });
  /* A free spot w by d somewhere in u0..u1, v0..v1, or null. */
  const spot = (w, d, ua, ub, va, vb) => {
    for (let k = 0; k < 8; k += 1) {
      const u = ua + w / 2 + r() * Math.max(0, ub - ua - w);
      const v = va + d / 2 + r() * Math.max(0, vb - va - d);
      if (free(u - w / 2, v - d / 2, u + w / 2, v + d / 2)) {
        take(u - w / 2, v - d / 2, u + w / 2, v + d / 2);
        return [u, v];
      }
    }
    return null;
  };
  const tones = [pick(r, FLOWERS), pick(r, FLOWERS)];
  const flowers = (ua, ub, v, step = 0.3) => {
    for (let u = ua; u < ub; u += step) {
      if (r() < 0.75) {
        L.bit(tones[Math.floor(r() * 2)], u + (r() - 0.5) * 0.1, v + (r() - 0.5) * 0.12, 0.14, 0.1, 0.08, [r() * 3, r() * 3, 0]);
      }
    }
  };
  const { v0, door } = hs;
  /* FRONT. Flowers round the shrubs in the beds, or a bed before the
   * porch with its own shrubs. */
  if (!hs.porch) {
    for (const [a, b] of [[hs.hu0 + 0.2, door - 1.0], [door + 1.0, hs.hu1 - 0.2]]) {
      if (b - a >= 0.8) {
        flowers(a + 0.15, b - 0.15, v0 - 0.9);
        flowers(a + 0.3, b - 0.15, v0 - 0.22, 0.45);
      }
    }
  } else {
    for (const [a, b] of [[hs.hu0 + 0.3, door - 0.9], [door + 0.9, hs.hu1 - 0.3]]) {
      if (b - a < 0.8) {
        continue;
      }
      L.trim('homeMulch', a, v0 - 3.15, 0, b, v0 - 2.25, 0.025);
      for (let u = a + 0.5; u < b - 0.3; u += 1.0 + r() * 0.3) {
        L.bit(r() < 0.8 ? 'homeHedge' : 'headsPurple', u, v0 - 2.65, 0.26, 0.32 + r() * 0.08, 0.28, [r() * 3, r() * 3, 0]);
      }
      flowers(a + 0.15, b - 0.15, v0 - 3.0);
    }
  }
  /* The mailbox's red flag, up. */
  L.trim('homePlay', mu + 0.25, 0.45, 1.12, mu + 0.27, 0.53, 1.5);
  L.trim('homePlay', mu + 0.25, 0.53, 1.36, mu + 0.27, 0.68, 1.5);
  /* Seams across a concrete drive. */
  if (driveM === 'homeDrive') {
    for (let v = 0; v < hs.gv0 - 0.4; v += 3) {
      L.trim('homeCoping', d0, v - 0.02, G_DRIVE, d1, v + 0.02, G_DRIVE + 0.003);
    }
    L.trim('homeCoping', (d0 + d1) / 2 - 0.02, -SIDE + KERB_W, G_DRIVE, (d0 + d1) / 2 + 0.02, hs.gv0, G_DRIVE + 0.003);
  }
  /* A hedge down the side away from the drive, on some, or a picket fence
   * along the front, gaps for the drive, the walk and the mailbox. */
  const side = (d0 + d1) / 2 < (L.u0 + L.u1) / 2 ? 1 : -1;
  const look = r();
  if (look < 0.3) {
    const ua = side > 0 ? L.u1 - 1.1 : L.u0 + 0.35;
    const ub = ua + 0.75;
    const vb = Math.max(1.5, v0 - (hs.porch ? 3.4 : 1.9));
    const tUntil = taken.findIndex((t) => ua < t.u1 && ub > t.u0 && 1.0 < t.v1 && vb > t.v0);
    if (vb - 1.0 > 2 && tUntil < 0 && offPlot(L.rect(ua, 1.0, ub, vb), 0.5)) {
      L.box('homeHedge', ua, 1.0, 0, ub, vb, 1.0, { name: 'hedge', kind: 'obstacle' });
      for (let v = 1.4; v < vb - 0.3; v += 0.8) {
        L.bit('homeHedge', (ua + ub) / 2, v, 1.0, 0.42, 0.2, [0, r() * 3, 0]);
      }
      take(ua, 1.0, ub, vb);
    }
  } else if (look < 0.45) {
    const gaps = [[d0 - 0.4, d1 + 0.4], [door - 1.0, door + 1.0], [mu - 0.6, mu + 0.6]];
    for (const [a, b] of subtract([[L.u0 + 0.4, L.u1 - 0.4]], gaps)) {
      if (b - a > 0.8 && free(a, 0.95, b, 1.25)) {
        L.fence(a, 1.1, b, 1.1, 0.95, 'homeTrim');
        take(a, 0.95, b, 1.25);
      }
    }
  }
  /* Gnomes by the beds. */
  if (r() < 0.14) {
    const n = 1 + Math.floor(r() * 3);
    for (let k = 0; k < n; k += 1) {
      const at = spot(0.5, 0.5, hs.hu0, hs.hu1, 1.5, v0 - (hs.porch ? 3.3 : 1.5));
      if (!at) {
        continue;
      }
      const [u, v] = at;
      L.cone(pick(r, ['homePlayBlue', 'homeHedge', 'homeTeal']), u, v, 0, 0.13, 0.32);
      fineLast(L.H.cones);
      L.bit('goatClay', u, v, 0.38, 0.085);
      L.bit('homeWhite', u, v - 0.07, 0.31, 0.075, 0.1);
      L.cone('homePlay', u, v, 0.42, 0.095, 0.27);
      fineLast(L.H.cones);
    }
  }
  /* A bike dropped on the lawn. */
  if (r() < 0.1) {
    const at = spot(1.6, 0.8, L.u0, L.u1, 1.4, v0 - 2);
    if (at) {
      const [u, v] = at;
      const frame = pick(r, ['homePlay', 'homePlayBlue', 'homeTeal']);
      for (const s of [-1, 1]) {
        L.rod('homeShelf', [u + s * 0.45, v, 0.02], [u + s * 0.45, v, 0.07], 0.3, 10);
      }
      L.rod(frame, [u - 0.45, v, 0.08], [u, v + 0.1, 0.09], 0.025, 4);
      L.rod(frame, [u, v + 0.1, 0.09], [u + 0.45, v, 0.08], 0.025, 4);
      L.rod(frame, [u, v + 0.1, 0.09], [u + 0.35, v + 0.1, 0.09], 0.025, 4);
      L.rod('homeShelf', [u + 0.35, v - 0.25, 0.09], [u + 0.35, v + 0.3, 0.09], 0.02, 4);
    }
  }
  /* A Halloween yard on about one in seven: gravestones on the lawn, and a
   * ghost hung from the front tree. */
  if (r() < 0.15) {
    const n = 2 + Math.floor(r() * 3);
    for (let k = 0; k < n; k += 1) {
      const at = spot(0.9, 0.9, L.u0, L.u1, 1.6, v0 - (hs.porch ? 3.4 : 2));
      if (!at) {
        continue;
      }
      const [u, v] = at;
      const t = 0.5 + r() * 0.15;
      L.box('homeFoundation', u - 0.27, v - 0.08, 0, u + 0.27, v + 0.08, t, { name: 'gravestone', kind: 'obstacle' });
      L.rod('homeFoundation', [u, v - 0.08, t], [u, v + 0.08, t], 0.27, 10);
      L.trim('homeShelf', u - 0.14, v - 0.095, t - 0.12, u + 0.14, v - 0.08, t - 0.08);
      L.trim('homeShelf', u - 0.09, v - 0.095, t - 0.24, u + 0.09, v - 0.08, t - 0.21);
      L.bit('homeMulch', u, v - 0.5, 0, 0.38, 0.07);
    }
    const ft = trees.find((t) => t.front);
    if (ft) {
      const hang = ft.cy - ft.R * 0.55;
      const head = hang - 0.55;
      if (head - 0.9 > 0.6) {
        const gu = ft.u + (ft.u < (L.u0 + L.u1) / 2 ? 1 : -1) * ft.R * 0.55;
        const gv = ft.v - 0.4;
        L.rod('homeWhite', [gu, gv, hang], [gu, gv, head + 0.2], 0.012, 3);
        L.bit('homeWhite', gu, gv, head, 0.26, 0.28);
        L.bit('homeWhite', gu, gv, head - 0.55, 0.3, 0.55, [0, 0.4, 0]);
        for (const s of [-1, 1]) {
          L.bit('homeShelf', gu + s * 0.09, gv - 0.23, head + 0.04, 0.05, 0.065);
        }
        L.bit('homeShelf', gu, gv - 0.24, head - 0.1, 0.06, 0.07);
      }
    }
  }
  /* A sign for the house being sold, on one in twenty five. */
  if (r() < 0.04) {
    const at = spot(1.0, 0.6, L.u0, L.u1, 1.2, 2.4);
    if (at) {
      const [u, v] = at;
      L.post('homeWood', u - 0.42, v, 0, 1.35, 0.04, { seg: 5, kind: 'pole' });
      L.paint('homeWood', u - 0.42, v - 0.03, 1.22, u + 0.42, v + 0.03, 1.28);
      L.paint('homeWhite', u - 0.33, v - 0.02, 0.62, u + 0.37, v + 0.02, 1.08);
      L.paint('homePlay', u - 0.33, v - 0.025, 0.95, u + 0.37, v + 0.025, 1.08);
    }
  }
  /* BACK. At the back door, a deck or a patio with a grill, a table and
   * its chairs. */
  const v1 = hs.v1;
  const pu0 = hs.hu0 + 0.8;
  const pu1 = Math.min(hs.hu1 - 0.8, pu0 + 5.6);
  let dd = 2.9;
  const clear = (depth) => !taken.some((t) => pu0 < t.u1 && pu1 > t.u0 && v1 + 0.4 < t.v1 && v1 + depth > t.v0)
    && offPlot(L.rect(pu0, v1, pu1, v1 + depth), 0.5);
  if (!clear(dd)) {
    dd = 2.1;
  }
  if (pu1 - pu0 > 3 && clear(dd)) {
    const deck = r() < 0.45;
    const base = deck ? 0.32 : 0;
    if (deck) {
      L.box('homeWood', pu0, v1, 0, pu1, v1 + dd, base, { name: 'deck', kind: 'obstacle' });
      for (let u = pu0 + 0.5; u < pu1 - 0.2; u += 0.5) {
        L.trim('homeShelf', u - 0.012, v1 + 0.05, base, u + 0.012, v1 + dd - 0.05, base + 0.004);
      }
      const c = (pu0 + pu1) / 2;
      L.box('homeWood', c - 0.6, v1 + dd, 0, c + 0.6, v1 + dd + 0.35, base / 2, { name: 'step', kind: 'obstacle' });
    } else {
      L.paint(r() < 0.5 ? 'homeDrive' : 'homeBrick', pu0, v1, 0, pu1, v1 + dd, G_PAVE);
    }
    /* The grill at one end, the table and chairs at the other. */
    L.box('homeShelf', pu1 - 0.85, v1 + 0.7, base, pu1 - 0.25, v1 + 1.2, base + 0.95, { name: 'grill', kind: 'obstacle' });
    L.trim('homeSteel', pu1 - 0.88, v1 + 0.68, base + 0.95, pu1 - 0.22, v1 + 1.22, base + 1.02);
    const tu = pu0 + 1.4;
    const tv = v1 + dd / 2 + 0.1;
    L.box('homeWood', tu - 0.45, tv - 0.45, base + 0.68, tu + 0.45, tv + 0.45, base + 0.74, { name: 'table', kind: 'obstacle' });
    L.post('homeWood', tu, tv, base, base + 0.68, 0.05, { seg: 5, kind: 'pole' });
    const chair = pick(r, ['homeWicker', 'homeShutter', 'homeWhite']);
    for (const s of [-1, 1]) {
      const cu = tu + s * 0.85;
      L.box(chair, cu - 0.24, tv - 0.24, base, cu + 0.24, tv + 0.24, base + 0.45, { name: 'chair', kind: 'obstacle' });
      L.trim(chair, cu + s * 0.2, tv - 0.24, base + 0.45, cu + s * 0.26, tv + 0.24, base + 0.95);
    }
    if (r() < 0.35) {
      L.rod('homeSteel', [tu, tv, base + 0.74], [tu, tv, base + 2.2], 0.025, 4);
      L.cone(pick(r, ['homeTeal', 'homePlay', 'homeBook', 'homeWhite']), tu, tv, base + 1.9, 1.15, 0.4);
      fineLast(L.H.cones);
    }
    take(pu0, v1, pu1, v1 + dd + 0.4);
  }
  /* A washing line, the week's colours on it. */
  if (r() < 0.35) {
    const at = spot(5.6, 1.4, L.u0, L.u1, v1 + 3, L.depth - 1);
    if (at) {
      const [u, v] = at;
      for (const s of [-1, 1]) {
        L.post('homeSteel', u + s * 2.6, v, 0, 2.0, 0.045, { seg: 5, kind: 'pole' });
        L.trim('homeSteel', u + s * 2.6 - 0.03, v - 0.42, 1.94, u + s * 2.6 + 0.03, v + 0.42, 2.0);
      }
      for (const dv of [-0.36, 0.36]) {
        L.rod('homeWhite', [u - 2.6, v + dv, 1.96], [u + 2.6, v + dv, 1.96], 0.01, 3);
        for (let x = u - 2.3; x < u + 2.1;) {
          const w = 0.3 + r() * 0.45;
          const len = 0.4 + r() * 0.45;
          if (r() < 0.8) {
            L.trim(pick(r, ['homePlay', 'homePlayBlue', 'homeWhite', 'homeBook', 'homeTeal', 'headsPurple', 'goatYellow']),
              x, v + dv - 0.012, 1.94 - len, x + w, v + dv + 0.012, 1.95);
          }
          x += w + 0.12 + r() * 0.2;
        }
      }
    }
  }
  /* A fire pit ringed with stones and four chairs round it. */
  if (r() < 0.25) {
    const at = spot(4.4, 4.4, L.u0, L.u1, v1 + 3, L.depth - 1);
    if (at) {
      const [u, v] = at;
      const [px, py] = L.xy(u, v);
      L.H.flat('homeShelf', ring(px, py, 0.62, 0.62, 12), 0, 0.03);
      fineLast(L.H.flats);
      for (const [cu, cv] of ring(u, v, 0.72, 0.72, 10)) {
        L.bit('homeCoping', cu, cv, 0.08, 0.17, 0.13, [r() * 3, r() * 3, 0]);
      }
      L.rod('homeWood', [u - 0.35, v - 0.1, 0.1], [u + 0.35, v + 0.12, 0.1], 0.06, 5);
      L.rod('homeWood', [u - 0.1, v - 0.35, 0.16], [u + 0.12, v + 0.35, 0.16], 0.06, 5);
      const chairM = pick(r, ['homePlay', 'homeTeal', 'goatPumpkin', 'homePlayBlue', 'homeWhite']);
      for (const [du, dv] of [[1.6, 0], [-1.6, 0], [0, 1.6], [0, -1.6]]) {
        const cu = u + du;
        const cv = v + dv;
        L.box(chairM, cu - 0.27, cv - 0.27, 0, cu + 0.27, cv + 0.27, 0.38, { name: 'chair', kind: 'obstacle' });
        const bu = Math.sign(du) * 0.27;
        const bv = Math.sign(dv) * 0.27;
        if (du) {
          L.trim(chairM, cu + bu - 0.04, cv - 0.27, 0.38, cu + bu + 0.04, cv + 0.27, 0.95);
        } else {
          L.trim(chairM, cu - 0.27, cv + bv - 0.04, 0.38, cu + 0.27, cv + bv + 0.04, 0.95);
        }
      }
    }
  }
  /* A wood pile, its cut ends out. */
  if (r() < 0.2) {
    const at = spot(2.6, 0.9, L.u0, L.u1, v1 + 2, L.depth - 0.7);
    if (at) {
      const [u, v] = at;
      L.box('homeWood', u - 1.2, v - 0.3, 0, u + 1.2, v + 0.3, 0.85, { name: 'wood pile', kind: 'obstacle' });
      for (let row = 0; row < 4; row += 1) {
        for (let k = 0; k < 6 - (row % 2); k += 1) {
          const cu = u - 1.0 + (row % 2) * 0.2 + k * 0.4;
          L.rod('homeWicker', [cu, v - 0.31, 0.12 + row * 0.2], [cu, v - 0.3, 0.12 + row * 0.2], 0.09, 6);
        }
      }
    }
  }
  /* A paddling pool, or a goal for the kids. */
  const play = r();
  if (play < 0.15) {
    const at = spot(2.2, 2.2, L.u0, L.u1, v1 + 2.5, L.depth - 1);
    if (at) {
      const [px, py] = L.xy(at[0], at[1]);
      L.H.flat('homePlayBlue', ring(px, py, 0.9, 0.9, 16), 0, 0.25);
      fineLast(L.H.flats);
      L.H.flat('homeWater', ring(px, py, 0.8, 0.8, 16), 0, 0.22);
      fineLast(L.H.flats);
      goatBlocks.push({ x0: px - 1, x1: px + 1, y0: py - 1, y1: py + 1 });
    }
  } else if (play < 0.3) {
    const at = spot(2.8, 1.4, L.u0, L.u1, v1 + 3, L.depth - 1);
    if (at) {
      const [u, v] = at;
      for (const s of [-1, 1]) {
        L.post('homeWhite', u + s * 1.2, v, 0, 1.2, 0.04, { seg: 5, kind: 'pole' });
        L.rod('homeWhite', [u + s * 1.2, v, 1.2], [u + s * 1.2, v + 0.8, 0], 0.025, 4);
      }
      L.cap('homeWhite', [u - 1.2, v, 1.2], [u + 1.2, v, 1.2], 0.04, { seg: 5, kind: 'pole' });
      L.rod('homeWhite', [u - 1.2, v + 0.8, 0.02], [u + 1.2, v + 0.8, 0.02], 0.025, 4);
      L.bit('homeWhite', u + 0.6, v - 1.2, 0.11, 0.11);
    }
  }
  /* A big back yard gets more in it: a second thing from the list, a small
   * tree, a vegetable patch. */
  if (L.depth - v1 > 10) {
    const kind = pick(r, BACK_THINGS);
    const at = o.things.includes(kind) ? null : spot(6.4, 6.4, L.u0, L.u1, v1 + 3, L.depth - 0.8);
    if (at) {
      const [x, y] = L.xy(at[0], at[1]);
      if (offPlot({ x0: x - 3.5, x1: x + 3.5, y0: y - 3.5, y1: y + 3.5 })) {
        backThing(L, kind, at[0], at[1], r);
        if (kind === 'pool') {
          goatBlocks.push({ x0: x - 2.6, x1: x + 2.6, y0: y - 2.6, y1: y + 2.6 });
        }
      }
    }
  }
  if (r() < 0.5) {
    const at = spot(2.8, 2.8, L.u0, L.u1, v1 + 2.5, L.depth - 0.8);
    if (at) {
      const [x, y] = L.xy(at[0], at[1]);
      if (offPlot({ x0: x - 2, x1: x + 2, y0: y - 2, y1: y + 2 })) {
        smallTree(L, at[0], at[1], r);
      }
    }
  }
  if (r() < 0.3) {
    const at = spot(3.6, 2.6, L.u0, L.u1, v1 + 2, L.depth - 0.8);
    if (at) {
      const [u, v] = at;
      L.trim('homeMulch', u - 1.6, v - 1.1, 0, u + 1.6, v + 1.1, 0.04);
      for (let row = 0; row < 3; row += 1) {
        const crop = pick(r, ['homeHedge', 'goatSage', 'homeHedge', 'homePlay', 'goatPumpkin']);
        for (let c = 0; c < 6; c += 1) {
          L.bit(crop === 'homePlay' && c % 2 ? 'homeHedge' : crop, u - 1.3 + c * 0.52, v - 0.75 + row * 0.75, 0.12, 0.2, 0.15,
            [r() * 3, r() * 3, 0]);
        }
      }
    }
  }
  /* An open back yard ends at a hedge or a low fence on some, in runs
   * round whatever is already there. */
  if (!fenced && r() < 0.55) {
    const v = L.depth - 0.7;
    const hedge = r() < 0.6;
    const clearAt = (u) => !taken.some((t) => u - 0.3 < t.u1 && u + 0.3 > t.u0 && v - 0.5 < t.v1 && v + 0.5 > t.v0);
    const runs = [];
    let start = null;
    for (let u = L.u0 + 0.6; u <= L.u1 - 0.6; u += 0.5) {
      if (clearAt(u)) {
        start = start === null ? u : start;
      } else if (start !== null) {
        runs.push([start, u - 0.5]);
        start = null;
      }
    }
    if (start !== null) {
      runs.push([start, L.u1 - 0.6]);
    }
    for (const [a, b] of runs) {
      const rect = L.rect(a, v - 0.45, b, v + 0.45);
      if (b - a < 2 || !offPlot(rect, 0.5)) {
        continue;
      }
      if (hedge) {
        L.box('homeHedge', a, v - 0.4, 0, b, v + 0.4, 1.25, { name: 'hedge', kind: 'obstacle' });
        for (let u = a + 0.5; u < b - 0.3; u += 1.1) {
          L.bit('homeHedge', u, v, 1.22, 0.52, 0.28, [0, r() * 3, 0]);
        }
      } else {
        L.fence(a, v, b, v, 1.2, 'homeFenceWood');
      }
      take(a, v - 0.45, b, v + 0.45);
    }
  }
  /* Shrubs along a fenced yard's back fence, a flower or two before them. */
  if (fenced) {
    for (let u = L.u0 + 1.2; u < L.u1 - 1.2; u += 1.3 + r() * 0.4) {
      const v = fenced.e - 0.55;
      if (r() < 0.6 && free(u - 0.5, v - 0.5, u + 0.5, v + 0.45)) {
        L.bit(r() < 0.85 ? 'homeHedge' : 'headsPurple', u, v, 0.32, 0.42 + r() * 0.15, 0.36 + r() * 0.1, [r() * 3, r() * 3, 0]);
        if (r() < 0.4) {
          flowers(u - 0.3, u + 0.4, v - 0.6, 0.25);
        }
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* The streets                                                         */
/* ------------------------------------------------------------------ */

/* The spans [a0, a1] of `a` less each of `cut`. */
function subtract(spans, cut) {
  const out = [];
  for (const [a0, a1] of spans) {
    let parts = [[a0, a1]];
    for (const [c0, c1] of cut) {
      const next = [];
      for (const [p0, p1] of parts) {
        if (c1 <= p0 || c0 >= p1) {
          next.push([p0, p1]);
          continue;
        }
        if (c0 > p0) {
          next.push([p0, c0]);
        }
        if (c1 < p1) {
          next.push([c1, p1]);
        }
      }
      parts = next;
    }
    out.push(...parts.filter(([p0, p1]) => p1 - p0 > 0.05));
  }
  return out;
}

/* A corner's kerb return, its asphalt fillet and its walk, as Heads' house
 * draws its own (../heads/heads.js streets). */
function corner(H, c) {
  const pts = [[c.x + c.sx * CORNER_R, c.y + c.sy * CORNER_R]];
  for (let i = 0; i <= 18; i += 1) {
    pts.push(cornerPoint(c, CORNER_R, (i * 90) / 18));
  }
  H.flat('homeAsphalt', pts, 0, G_ASPHALT);
  const walk = [];
  for (let i = 0; i <= 18; i += 1) {
    walk.push(cornerPoint(c, CORNER_R - KERB_W - VERGE, (i * 90) / 18));
  }
  for (let i = 18; i >= 0; i -= 1) {
    walk.push(cornerPoint(c, CORNER_R - KERB_W - VERGE - WALK, (i * 90) / 18));
  }
  H.flat('homeDrive', walk, 0, G_PAVE);
  const kr = CORNER_R - KERB_W / 2;
  for (let i = 0; i < 18; i += 1) {
    const a = (i * 90) / 18;
    const b = ((i + 1) * 90) / 18;
    if (b > 37.5 && a < 52.5) {
      continue;
    }
    const p = cornerPoint(c, kr, a);
    const q = cornerPoint(c, kr, b);
    H.cap('homeFoundation', [p[0], p[1], KERB_H / 2], [q[0], q[1], KERB_H / 2], KERB_H / 2, { kind: 'obstacle', seg: 6, name: 'kerb' });
  }
  const t = cornerPoint(c, CORNER_R - 0.4, 45);
  H.paint('homeBook', t[0] - 0.35, t[1] - 0.35, 0, t[0] + 0.35, t[1] + 0.35, G_PAVE + 0.004);
}

/* Is a plan point inside Heads' house's plot, which draws its own? */
const inPlot = (x, y) => x > PLOT.x0 && x < PLOT.x1 && y > PLOT.y0 && y < PLOT.y1;

/* A street light: a steel pole, an arm out over the street, the lamp. */
function light(H, x, y, dx, dy) {
  H.post('homeSteel', x, y, 0, 7.2, 0.09, { seg: 6, kind: 'pole', name: 'street light' });
  H.cap('homeSteel', [x, y, 7.0], [x + dx * 1.8, y + dy * 1.8, 7.25], 0.05, { seg: 5, kind: 'pole' });
  const lx = x + dx * 1.9;
  const ly = y + dy * 1.9;
  H.box('homeSteel', lx - 0.35, ly - 0.35, 7.12, lx + 0.35, ly + 0.35, 7.32, { name: 'lamp' });
  H.paint('homeLamp', lx - 0.3, ly - 0.3, 7.08, lx + 0.3, ly + 0.3, 7.12);
}

/* A hydrant at the verge. */
function hydrant(H, x, y) {
  H.post('homePlay', x, y, 0, 0.62, 0.13, { seg: 8, kind: 'pole', name: 'hydrant' });
  H.cyl('homePlay', [x, y, 0.62], [x, y, 0.78], 0.09, 8);
  H.cyl('homeSteel', [x - 0.2, y, 0.45], [x + 0.2, y, 0.45], 0.045, 6);
}

/* A wooden power pole with its cross arm; the wires are hung after. */
function powerPole(H, x, y, alongX) {
  H.post('homeWood', x, y, 0, 9.2, 0.13, { seg: 7, kind: 'pole', name: 'power pole' });
  if (alongX) {
    H.box('homeWood', x - 0.08, y - 1.1, 8.55, x + 0.08, y + 1.1, 8.7, { name: 'cross arm' });
  } else {
    H.box('homeWood', x - 1.1, y - 0.08, 8.55, x + 1.1, y + 0.08, 8.7, { name: 'cross arm' });
  }
  H.cyl('homeShelf', [x, y, 7.2], [x, y, 8.1], 0.3, 8);
}

/* Wires from pole to pole: three, sagging, drawn only, as a parabola in
 * six pieces. */
function wires(H, a, b, alongX) {
  const SAG = 0.9;
  const N = 6;
  for (const off of [-0.95, 0, 0.95]) {
    const ox = alongX ? 0 : off;
    const oy = alongX ? off : 0;
    for (let i = 0; i < N; i += 1) {
      const t0 = i / N;
      const t1 = (i + 1) / N;
      const h0 = 8.75 - SAG * 4 * t0 * (1 - t0);
      const h1 = 8.75 - SAG * 4 * t1 * (1 - t1);
      H.cyl('homeShelf', [a[0] + (b[0] - a[0]) * t0 + ox, a[1] + (b[1] - a[1]) * t0 + oy, h0],
        [a[0] + (b[0] - a[0]) * t1 + ox, a[1] + (b[1] - a[1]) * t1 + oy, h1], 0.018, 3);
    }
  }
}

function streets(H, r) {
  const [A] = EW;
  const [B] = NS;
  /* The dressing's own stream (THE DRESSING, above). */
  const dr = stream(0x5772ee7);
  /* Asphalt: every street end to end, Street A and the cross street less
   * the stretch Heads' house paints itself. */
  for (const st of EW) {
    const spans = st === A ? subtract([[BOUNDS.x0, BOUNDS.x1]], [[PLOT.x0, PLOT.x1]]) : [[BOUNDS.x0, BOUNDS.x1]];
    for (const [a0, a1] of spans) {
      H.paint('homeAsphalt', a0, st.c - st.h, 0, a1, st.c + st.h, G_ASPHALT);
    }
  }
  for (const st of NS) {
    let spans = st === B ? subtract([[BOUNDS.y0, BOUNDS.y1]], [[PLOT.y0, PLOT.y1]]) : [[BOUNDS.y0, BOUNDS.y1]];
    /* Not again over an east west street's asphalt. */
    spans = subtract(spans, EW.filter((e) => st !== B || e !== A).map((e) => [e.c - e.h, e.c + e.h]));
    for (const [a0, a1] of spans) {
      H.paint('homeAsphalt', st.c - st.h, a0, 0, st.c + st.h, a1, G_ASPHALT);
    }
  }
  /* The corners, all but the four Heads' house draws. */
  for (const e of EW) {
    for (const n of NS) {
      if (e === A && n === B) {
        continue;
      }
      for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        const c = {
          x: n.c + sx * (n.h + CORNER_R), y: e.c + sy * (e.h + CORNER_R), sx: -sx, sy: -sy,
        };
        corner(H, c);
      }
      /* The crosswalks on all four sides and a stop bar on the cross
       * street's two approaches. */
      for (const s of [-1, 1]) {
        const x = n.c + s * (n.h + 2.2);
        for (let k = -4; k <= 4; k += 1) {
          const y = e.c + k * 1.0;
          if (Math.abs(y - e.c) < e.h - 0.4) {
            H.paint('homeTrim', Math.min(x, x + s * 2.4), y - 0.25, 0, Math.max(x, x + s * 2.4), y + 0.25, G_LINE);
          }
        }
        const y = e.c + s * (e.h + 2.2);
        for (let k = -4; k <= 4; k += 1) {
          const xx = n.c + k * 1.0;
          if (Math.abs(xx - n.c) < n.h - 0.4) {
            H.paint('homeTrim', xx - 0.25, Math.min(y, y + s * 2.4), 0, xx + 0.25, Math.max(y, y + s * 2.4), G_LINE);
          }
        }
        const sb = e.c + s * (e.h + 5.0);
        H.paint('homeTrim', n.c + (s > 0 ? -n.h + 0.1 : 0.1), sb - 0.2, 0, n.c + (s > 0 ? -0.1 : n.h - 0.1), sb + 0.2, G_LINE);
      }
      /* A stop sign on the cross street's corner, plate as three hidden
       * boxes as Heads' is. */
      const sx = n.c + n.h + 0.75;
      const sy = e.c + e.h + 3.5;
      /* The street names on the opposite corner: a pole and two green
       * blades across each other, a white line of lettering on each. */
      const nx = n.c - n.h - 0.75;
      const ny = e.c - e.h - 3.5;
      if (!inPlot(nx, ny)) {
        H.post('homeSteel', nx, ny, 0, 2.75, 0.035, { seg: 5, kind: 'pole' });
        H.paint('headsShutter', nx - 0.55, ny - 0.015, 2.36, nx + 0.55, ny + 0.015, 2.54);
        H.paint('headsShutter', nx - 0.015, ny - 0.55, 2.56, nx + 0.015, ny + 0.55, 2.74);
        fine(H.paint('homeWhite', nx - 0.42, ny - 0.02, 2.42, nx + 0.42, ny + 0.02, 2.48));
        fine(H.paint('homeWhite', nx - 0.02, ny - 0.42, 2.62, nx + 0.02, ny + 0.42, 2.68));
      }
      if (!inPlot(sx, sy)) {
        H.post('homeSteel', sx, sy, 0, 2.45, 0.035, { seg: 5, kind: 'pole' });
        H.cyl('homePlay', [sx, sy - 0.03, 2.25], [sx, sy, 2.25], 0.38, 8);
        for (const [a, b] of [[0.27, 0.27], [0.38, 0.12], [0.12, 0.38]]) {
          H.hidden(sx - a, sy - 0.03, 2.25 - b, sx + a, sy, 2.25 + b, 'wall', 'stop sign');
        }
      }
    }
  }
  /* Kerbs, walks, lights, poles and hydrants along every street side,
   * between the corners, round the drives, off Heads' plot. */
  const sides = [];
  for (const st of EW) {
    const across = NS.map((n) => [n.c - n.h - CORNER_R, n.c + n.h + CORNER_R]);
    for (const s of [1, -1]) {
      let spans = subtract([[BOUNDS.x0, BOUNDS.x1]], across);
      if (st === A) {
        spans = subtract(spans, [[PLOT.x0, PLOT.x1]]);
      }
      sides.push({ st, s, ew: true, spans });
    }
  }
  for (const st of NS) {
    const across = EW.map((e) => [e.c - e.h - CORNER_R, e.c + e.h + CORNER_R]);
    for (const s of [1, -1]) {
      let spans = subtract([[BOUNDS.y0, BOUNDS.y1]], across);
      if (st === B) {
        spans = subtract(spans, [[PLOT.y0, PLOT.y1]]);
      }
      sides.push({ st, s, ew: false, spans });
    }
  }
  let lightN = 0;
  for (const { st, s, ew, spans } of sides) {
    const k = st.c + s * st.h;
    const w0 = k + s * (KERB_W + VERGE);
    const kerbs = subtract(spans, cuts.get(`${st.id}${s}`) || []);
    const rect = (a0, a1, c0, c1, h0, h1) => (ew ? [a0, Math.min(c0, c1), h0, a1, Math.max(c0, c1), h1] : [Math.min(c0, c1), a0, h0, Math.max(c0, c1), a1, h1]);
    for (const [a0, a1] of kerbs) {
      const [x0, y0, h0, x1, y1, h1] = rect(a0, a1, k, k + s * KERB_W, 0, KERB_H);
      H.box('homeFoundation', x0, y0, h0, x1, y1, h1, { name: 'kerb', kind: 'obstacle' });
    }
    for (const [a0, a1] of spans) {
      const [x0, y0, h0, x1, y1, h1] = rect(a0, a1, w0, w0 + s * WALK, 0, G_PAVE);
      H.paint('homeDrive', x0, y0, h0, x1, y1, h1);
      for (let a = a0 + 1.5; a < a1 - 0.2; a += 1.5) {
        const [p0, q0, g0, p1, q1, g1] = rect(a - 0.015, a + 0.015, w0, w0 + s * WALK, 0, G_PAVE + 0.003);
        H.paint('homeCoping', p0, q0, g0, p1, q1, g1);
      }
      /* Along the verge: a light every 34 metres on alternate sides, a
       * power pole every 38 on the low side, a hydrant every 90, and
       * street trees between. */
      const vm = k + s * (KERB_W + VERGE / 2);
      const at = (a) => (ew ? [a, vm] : [vm, a]);
      const dir = ew ? [0, -s] : [-s, 0];
      const clear = (a) => !(cuts.get(`${st.id}${s}`) || []).some(([c0, c1]) => a > c0 - 1.5 && a < c1 + 1.5);
      const verge = [];
      for (let a = a0 + 8 + (s > 0 ? 0 : 17); a < a1 - 4; a += 34) {
        const [x, y] = at(a);
        verge.push(a);
        if (clear(a) && !inPlot(x, y)) {
          light(H, x, y, dir[0], dir[1]);
          lightN += 1;
        }
      }
      if (s < 0) {
        let last = null;
        for (let a = a0 + 3; a < a1 - 2; a += 38) {
          const [x, y] = at(clear(a) ? a : a + 3);
          if (inPlot(x, y)) {
            last = null;
            continue;
          }
          powerPole(H, x, y, !ew);
          if (last) {
            wires(H, last, [x, y], !ew);
          }
          last = [x, y];
        }
      }
      for (let a = a0 + 45; a < a1 - 4; a += 90) {
        const [x, y] = at(a + 5);
        verge.push(a + 5);
        if (clear(a + 5) && !inPlot(x, y)) {
          hydrant(H, x, y);
          /* No parking by a hydrant: the kerb's top painted red. */
          const [p0, q0, g0, p1, q1, g1] = rect(a + 3.5, a + 6.5, k, k + s * KERB_W, KERB_H, KERB_H + 0.006);
          fine(H.paint('homePlay', p0, q0, g0, p1, q1, g1));
        }
      }
      for (let a = a0 + 14 + r() * 4; a < a1 - 6; a += 15 + r() * 8) {
        const [x, y] = at(a);
        if (clear(a) && !inPlot(x, y) && r() < 0.75) {
          verge.push(a);
          tree(H, x, y, 1.1 + r() * 0.6);
        }
      }
      /* Cars parked at this kerb, now and then, clear of the drives. */
      for (let a = a0 + 10 + r() * 20; a < a1 - 8; a += 26 + r() * 30) {
        if (!clear(a) || !clear(a + 3) || !clear(a - 3) || r() < 0.5) {
          continue;
        }
        const c = k - s * 1.25;
        const [x, y] = ew ? [a, c] : [c, a];
        if (inPlot(x, y)) {
          continue;
        }
        car(H, x, y, ew ? (s > 0 ? 0 : Math.PI) : (s > 0 ? Math.PI / 2 : -Math.PI / 2), r, G_ASPHALT);
      }
      dressKerb(H, dr, {
        ew, s, k, a0, a1, rect, at, clear, verge,
      });
    }
  }
  /* Street A's double yellow line off the plot, and a white dashed line
   * down the middle of the others. */
  for (const [a0, a1] of subtract([[BOUNDS.x0, BOUNDS.x1]], [[PLOT.x0, PLOT.x1], ...NS.map((n) => [n.c - n.h, n.c + n.h])])) {
    H.paint('homeBook', a0, A.c - 0.18, 0, a1, A.c - 0.08, G_LINE);
    H.paint('homeBook', a0, A.c + 0.08, 0, a1, A.c + 0.18, G_LINE);
  }
  dressStreets(H, dr);
  return lightN;
}

/*
 * ONE SIDE OF A STREET DRESSED (THE DRESSING, above), between two corners:
 * a storm drain at each end, its grate on the asphalt and its mouth in the
 * kerb, a green utility box now and then on the verge, and leaves blown
 * into the gutter. `o` is streets()'s own measure of the side.
 */
function dressKerb(H, r, o) {
  const { ew, s, k, a0, a1, rect, at, clear, verge } = o;
  const box = (m, b) => H.paint(m, b[0], b[1], b[2], b[3], b[4], b[5]);
  for (const a of [a0 + 2.2, a1 - 3.1]) {
    if (!clear(a) || !clear(a + 0.9) || a1 - a0 < 8) {
      continue;
    }
    const [x, y] = at(a);
    if (inPlot(x, y)) {
      continue;
    }
    fine(box('homeShelf', rect(a, a + 0.9, k - s * 0.48, k - s * 0.02, 0, G_ASPHALT + 0.007)));
    for (let g = a + 0.12; g < a + 0.85; g += 0.15) {
      fine(box('homeCoping', rect(g, g + 0.03, k - s * 0.44, k - s * 0.06, 0, G_ASPHALT + 0.011)));
    }
    fine(box('homeShelf', rect(a, a + 0.9, k - s * 0.012, k, 0.03, KERB_H - 0.03)));
  }
  for (let a = a0 + 30 + r() * 40; a < a1 - 10; a += 90 + r() * 60) {
    const [x, y] = at(a);
    if (!clear(a) || inPlot(x, y) || s < 0 || verge.some((v) => Math.abs(v - a) < 3)) {
      continue;
    }
    const b = rect(a - 0.35, a + 0.35, k + s * (KERB_W + 0.35), k + s * (KERB_W + 0.85), 0, 1.15);
    H.box('headsShutter', b[0], b[1], b[2], b[3], b[4], b[5], { name: 'utility box', kind: 'obstacle' });
    fine(box('homeShelf', rect(a - 0.22, a + 0.22, k + s * (KERB_W + 0.33), k + s * (KERB_W + 0.35), 0.6, 0.95)));
  }
  for (let a = a0 + 3 + r() * 5; a < a1 - 2; a += 4 + r() * 7) {
    if (r() < 0.45 && clear(a)) {
      const g = k - s * (0.18 + r() * 0.25);
      const [x, y] = ew ? [a, g] : [g, a];
      if (!inPlot(x, y)) {
        bit(H, pick(r, LEAVES), x, y, 0.02, 0.22 + r() * 0.25, 0.05, [0, r() * 3, 0]);
      }
    }
  }
}

/*
 * THE STREETS' ASPHALT DRESSED (THE DRESSING, above): a white dashed line
 * down every street but Street A, which has its double yellow; manhole
 * covers; repaired patches and sealed cracks.
 */
function dressStreets(H, r) {
  const [A] = EW;
  const [B] = NS;
  const lanes = [];
  for (const st of EW) {
    const across = [...NS.map((n) => [n.c - n.h - 2, n.c + n.h + 2])];
    const spans = subtract([[BOUNDS.x0, BOUNDS.x1]], st === A ? [...across, [PLOT.x0, PLOT.x1]] : across);
    lanes.push({ st, ew: true, spans });
  }
  for (const st of NS) {
    const across = [...EW.map((e) => [e.c - e.h - 2, e.c + e.h + 2])];
    const spans = subtract([[BOUNDS.y0, BOUNDS.y1]], st === B ? [...across, [PLOT.y0, PLOT.y1]] : across);
    lanes.push({ st, ew: false, spans });
  }
  for (const { st, ew, spans } of lanes) {
    const rect = (a0, a1, c0, c1, h) => (ew ? [a0, c0, 0, a1, c1, h] : [c0, a0, 0, c1, a1, h]);
    const paint = (m, b) => H.paint(m, b[0], b[1], b[2], b[3], b[4], b[5]);
    for (const [a0, a1] of spans) {
      if (st !== A) {
        for (let a = a0 + 1.5; a < a1 - 3; a += 9) {
          paint('homeTrim', rect(a, a + 3, st.c - 0.06, st.c + 0.06, G_LINE));
        }
      }
      /* Manholes, a dark lid in a pale rim, now one lane and now the other. */
      let lane = 1;
      for (let a = a0 + 12 + r() * 20; a < a1 - 6; a += 45 + r() * 40) {
        lane = -lane;
        const c = st.c + lane * st.h * 0.45;
        const [x, y] = ew ? [a, c] : [c, a];
        H.flat('homeCoping', ring(x, y, 0.46, 0.46, 12), 0, G_ASPHALT + 0.006);
        fineLast(H.flats);
        H.flat('homeShelf', ring(x, y, 0.38, 0.38, 12), 0, G_ASPHALT + 0.01);
        fineLast(H.flats);
      }
      /* Patches of newer asphalt, and cracks run with sealant. */
      for (let a = a0 + 6 + r() * 15; a < a1 - 6; a += 14 + r() * 26) {
        if (r() < 0.5) {
          const len = 1.2 + r() * 2.8;
          const wid = 0.8 + r() * 1.4;
          const c = st.c + (r() - 0.5) * (st.h * 2 - wid - 1);
          fine(paint('homeRoof', rect(a, a + len, c - wid / 2, c + wid / 2, G_ASPHALT + 0.006)));
        } else {
          let u = a;
          let c = st.c + (r() - 0.5) * (st.h * 1.4);
          for (let i = 0; i < 4 + Math.floor(r() * 4); i += 1) {
            const du = 0.4 + r() * 0.9;
            const dc = (r() - 0.5) * 0.7;
            fine(paint('homeShelf', rect(u, u + du, c - 0.012, c + 0.012, G_ASPHALT + 0.006)));
            const c2 = Math.max(st.c - st.h + 0.4, Math.min(st.c + st.h - 0.4, c + dc));
            fine(paint('homeShelf', rect(u + du - 0.012, u + du + 0.012, Math.min(c, c2), Math.max(c, c2) + 0.001, G_ASPHALT + 0.006)));
            u += du;
            c = c2;
          }
        }
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* The park                                                            */
/* ------------------------------------------------------------------ */

/* A round flat, n points, on an ellipse. No trig: each quarter is walked
 * by the rational parametrisation (1 - f^2, 2f) / (1 + f^2), which is on
 * the unit circle for every f, so the points are exact if not evenly
 * spaced. */
function ring(cx, cy, rx, ry, n) {
  const pts = [];
  for (let i = 0; i < n; i += 1) {
    const q = (i / n) * 4;
    const seg = Math.floor(q);
    const f = q - seg;
    const c = (1 - f * f) / (1 + f * f);
    const s = (2 * f) / (1 + f * f);
    const [ux, uy] = [[c, s], [-s, c], [-c, -s], [s, -c]][seg];
    pts.push([cx + rx * ux, cy + ry * uy]);
  }
  return pts;
}

function park(H, r) {
  const P = PARK;
  const cx = (P.x0 + P.x1) / 2;
  const cy = (P.y0 + P.y1) / 2;
  /* The path round it and across it. */
  const inset = 4;
  H.paint('homeDrive', P.x0 + inset, P.y0 + inset, 0, P.x1 - inset, P.y0 + inset + 1.8, G_PAVE);
  H.paint('homeDrive', P.x0 + inset, P.y1 - inset - 1.8, 0, P.x1 - inset, P.y1 - inset, G_PAVE);
  H.paint('homeDrive', P.x0 + inset, P.y0 + inset, 0, P.x0 + inset + 1.8, P.y1 - inset, G_PAVE);
  H.paint('homeDrive', P.x1 - inset - 1.8, P.y0 + inset, 0, P.x1 - inset, P.y1 - inset, G_PAVE);
  H.paint('homeDrive', cx - 0.9, P.y0 + inset, 0, cx + 0.9, P.y1 - inset, G_PAVE);
  /* The pond, west of the middle, its stones, and the little bridge. */
  const px = P.x0 + 30;
  const py = cy;
  H.flat('homeWater', ring(px, py, 9, 6, 32), 0, 0.04);
  goatBlocks.push({ x0: px - 9.3, x1: px + 9.3, y0: py - 6.3, y1: py + 6.3 });
  for (const [ux, uy] of ring(0, 0, 1, 1, 22)) {
    H.ball('homeCoping', px + ux * 9.4, py + uy * 6.4, 0.15, 0.32 + r() * 0.2);
  }
  H.box('homeWood', px - 1.0, py - 7.5, 0.35, px + 1.0, py + 7.5, 0.5, { name: 'footbridge' });
  for (const s of [-1, 1]) {
    for (const y of [-7.2, -3.6, 0, 3.6, 7.2]) {
      H.post('homeWood', px + s * 0.95, py + y, 0, 1.4, 0.06, { seg: 5, kind: 'pole' });
    }
    H.box('homeWood', px + s * 0.95 - 0.05, py - 7.3, 1.3, px + s * 0.95 + 0.05, py + 7.3, 1.42, { name: 'rail' });
  }
  /* The playground, west: bark, a tower with its slide, swings, a climbing
   * frame and a seesaw. */
  const gx = P.x0 + 10;
  const gy = cy;
  H.flat('homeMulch', ring(gx, gy, 7, 9, 24), 0, 0.03);
  H.box('homePlayBlue', gx - 1.2, gy - 1.2, 1.4, gx + 1.2, gy + 1.2, 1.55, { name: 'tower deck' });
  for (const [dx, dy] of [[-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1]]) {
    H.post('homeBook', gx + dx, gy + dy, 0, 3.2, 0.08, { seg: 6, kind: 'pole' });
  }
  gableRoof(H, 'x', gy - 1.3, gy + 1.3, gx - 1.3, gx + 1.3, 3.2, 3.2, { gable: 'homePlay', pitch: 9 / 12, roof: 'homePlay', over: 0.25 });
  H.cap('homeBook', [gx + 1.2, gy, 1.5], [gx + 4.4, gy, 0.25], 0.3, { seg: 8, name: 'slide' });
  for (let k = 0; k < 4; k += 1) {
    H.box('homePlayBlue', gx - 1.2 - 0.3 * (k + 1), gy - 0.5, 0, gx - 1.2 - 0.3 * k, gy + 0.5, 1.4 - k * 0.35, { name: 'steps' });
  }
  for (const s of [-1, 1]) {
    H.cap('homePlay', [gx + s * 2.2, gy + 4.2, 0], [gx + s * 2.2, gy + 5.0, 2.4], 0.07, { seg: 6, kind: 'pole' });
    H.cap('homePlay', [gx + s * 2.2, gy + 5.8, 0], [gx + s * 2.2, gy + 5.0, 2.4], 0.07, { seg: 6, kind: 'pole' });
  }
  H.cap('homePlay', [gx - 2.3, gy + 5.0, 2.4], [gx + 2.3, gy + 5.0, 2.4], 0.08, { seg: 6, kind: 'pole' });
  for (const dx of [-1.1, 0, 1.1]) {
    H.cyl('homeSteel', [gx + dx, gy + 5.0, 2.38], [gx + dx, gy + 5.0, 0.5], 0.015, 3);
    H.box('homeShutter', gx + dx - 0.25, gy + 4.85, 0.45, gx + dx + 0.25, gy + 5.15, 0.52, { name: 'swing', kind: 'obstacle' });
  }
  for (let i = 0; i < 4; i += 1) {
    for (let j = 0; j < 3; j += 1) {
      const x = gx - 2.0 + i * 0.9;
      const y = gy - 5.6 + j * 0.9;
      H.post('homeTeal', x, y, 0, 1.8, 0.04, { seg: 5, kind: 'pole' });
    }
  }
  for (const h of [0.6, 1.2, 1.8]) {
    H.cap('homeTeal', [gx - 2.0, gy - 5.6, h], [gx + 0.7, gy - 5.6, h], 0.035, { seg: 4, kind: 'pole' });
    H.cap('homeTeal', [gx - 2.0, gy - 3.8, h], [gx + 0.7, gy - 3.8, h], 0.035, { seg: 4, kind: 'pole' });
  }
  H.box('homeBook', gx + 3.0, gy - 6.5, 0.35, gx + 3.25, gy - 3.0, 0.45, { name: 'seesaw' });
  H.post('homeShelf', gx + 3.12, gy - 4.75, 0, 0.35, 0.12, { seg: 6 });
  /* The court, east of the middle path: asphalt, its lines, two hoops. */
  const kx = cx + 12;
  H.paint('homeAsphalt', kx - 7.5, cy - 4.5, 0, kx + 7.5, cy + 4.5, G_DRIVE);
  H.paint('homeTrim', kx - 7.3, cy - 4.3, G_DRIVE, kx + 7.3, cy - 4.2, G_LINE + 0.01);
  H.paint('homeTrim', kx - 7.3, cy + 4.2, G_DRIVE, kx + 7.3, cy + 4.3, G_LINE + 0.01);
  H.paint('homeTrim', kx - 0.05, cy - 4.3, G_DRIVE, kx + 0.05, cy + 4.3, G_LINE + 0.01);
  for (const s of [-1, 1]) {
    H.post('homeShutter', kx + s * 7.9, cy, 0, 3.4, 0.08, { seg: 6, kind: 'pole' });
    H.box('homeTrim', kx + s * 7.6 - 0.04, cy - 0.9, 2.9, kx + s * 7.6 + 0.04, cy + 0.9, 3.95, { name: 'backboard' });
    H.cyl('homePlay', [kx + s * 7.3, cy - 0.23, 3.05], [kx + s * 7.3, cy + 0.23, 3.05], 0.015, 4);
  }
  /* The ball diamond, east: the dirt, the bases, the backstop. */
  const dx0 = P.x1 - 24;
  const dy0 = cy - 8;
  H.flat('homeBrick', [[dx0, dy0], [dx0 + 14, dy0 + 2], [dx0 + 12, dy0 + 14], [dx0 - 2, dy0 + 12]], 0, 0.035);
  for (const [bx, by] of [[dx0 + 13, dy0 + 2.2], [dx0 + 11.8, dy0 + 13.8], [dx0 - 1.8, dy0 + 11.8]]) {
    H.paint('homeWhite', bx - 0.2, by - 0.2, 0.035, bx + 0.2, by + 0.2, 0.09);
  }
  for (const [ax, ay, bx, by] of [[dx0 - 3, dy0 - 3, dx0 + 3, dy0 - 3], [dx0 - 3, dy0 - 3, dx0 - 3, dy0 + 3]]) {
    for (let t = 0; t <= 1.001; t += 0.25) {
      H.post('homeSteel', ax + (bx - ax) * t, ay + (by - ay) * t, 0, 3.6, 0.05, { seg: 5, kind: 'pole' });
    }
    H.cap('homeSteel', [ax, ay, 3.6], [bx, by, 3.6], 0.04, { seg: 4, kind: 'pole' });
    H.cap('homeSteel', [ax, ay, 1.2], [bx, by, 1.2], 0.03, { seg: 4, kind: 'pole' });
  }
  /* The gazebo near the middle: eight posts, a floor, a cone roof. */
  const zx = cx - 6;
  const zy = cy + 7;
  H.discs.push({ m: 'homeWood', px: zx, py: zy, r: 2.8, h: 0.35 });
  H.box('homeWood', zx - 2.4, zy - 2.4, 0, zx + 2.4, zy + 2.4, 0.35, { draw: false, name: 'gazebo floor' });
  for (const [ux, uy] of ring(0, 0, 2.5, 2.5, 8)) {
    H.post('homeTrim', zx + ux, zy + uy, 0.35, 2.9, 0.07, { seg: 6, kind: 'pole' });
  }
  H.cone('goatClay', zx, zy, 2.9, 3.2, 1.6);
  H.box('goatClay', zx - 2.2, zy - 2.2, 2.9, zx + 2.2, zy + 2.2, 3.3, { draw: false, name: 'gazebo roof' });
  /* Benches and bins along the paths, and trees all round. */
  for (let x = P.x0 + 14; x < P.x1 - 10; x += 16) {
    for (const y of [P.y0 + inset + 2.4, P.y1 - inset - 2.4]) {
      H.box('homeWood', x - 0.9, y - 0.25, 0.42, x + 0.9, y + 0.25, 0.48, { name: 'bench', kind: 'obstacle' });
      for (const s of [-0.75, 0.75]) {
        H.paint('homeShelf', x + s - 0.05, y - 0.25, 0, x + s + 0.05, y + 0.25, 0.42);
      }
      H.paint('homeWood', x - 0.9, y + (y > cy ? 0.25 : -0.3), 0.5, x + 0.9, y + (y > cy ? 0.3 : -0.25), 0.9);
    }
  }
  for (let i = 0; i < 26; i += 1) {
    const edge = i % 4;
    const t = r();
    const x = edge < 2 ? P.x0 + 2 + t * (P.x1 - P.x0 - 4) : (edge === 2 ? P.x0 + 1.8 : P.x1 - 1.8);
    const y = edge < 2 ? (edge === 0 ? P.y0 + 1.8 : P.y1 - 1.8) : P.y0 + 2 + t * (P.y1 - P.y0 - 4);
    tree(H, x, y, 1.2 + r() * 0.8);
  }
  for (const [x, y] of [[cx - 16, cy - 7], [cx + 3, cy - 9], [cx + 30, cy + 9], [px + 13, py - 8], [cx - 20, cy + 9]]) {
    tree(H, x, y, 1.6 + r() * 0.5);
  }
  dressPark(H, {
    cx, cy, px, py, zx, zy, inset,
  });
}

/*
 * THE PARK DRESSED (THE DRESSING, above): ducks and lily pads on the pond,
 * flowers round the gazebo, picnic tables, a bin by every bench, and its
 * name board at the gate on Street D.
 */
function dressPark(H, o) {
  const r = stream(0xd0c5);
  const P = PARK;
  const { cx, cy, px, py, zx, zy, inset } = o;
  /* Lily pads round the pond's edge, clear of the bridge. */
  for (const [x, y] of ring(px, py, 7.2, 4.4, 11)) {
    if (Math.abs(x - px) > 2) {
      H.flat('homeHedge', ring(x + (r() - 0.5), y + (r() - 0.5) * 0.6, 0.45 + r() * 0.2, 0.45 + r() * 0.2, 10), 0.04, 0.05);
      fineLast(H.flats);
      if (r() < 0.3) {
        bit(H, pick(r, ['homeWhite', 'headsPurple']), x, y, 0.08, 0.1, 0.07);
      }
    }
  }
  /* Ducks: a pair, and a mother with her line of ducklings. */
  const duck = (x, y, k, m, faceX) => {
    bit(H, m, x, y, 0.1 * k, 0.24 * k, 0.15 * k, [0, 0, 0]);
    bit(H, m === 'homeBook' ? 'homeBook' : 'homeHedge', x + faceX * 0.2 * k, y, 0.3 * k, 0.11 * k);
    bit(H, 'goatPumpkin', x + faceX * 0.33 * k, y, 0.28 * k, 0.06 * k, 0.03 * k);
    bit(H, m, x - faceX * 0.24 * k, y, 0.2 * k, 0.07 * k, 0.05 * k);
  };
  duck(px - 5.2, py + 2.2, 1, 'homeWhite', 1);
  duck(px - 4.4, py + 1.4, 1, 'homeWicker', 1);
  duck(px + 4.2, py - 2.4, 1, 'homeWicker', -1);
  for (let i = 0; i < 4; i += 1) {
    duck(px + 5.0 + i * 0.55, py - 2.0 + i * 0.25, 0.5, 'homeBook', -1);
  }
  /* Flowers in a ring round the gazebo. */
  for (const [x, y] of ring(zx, zy, 3.5, 3.5, 44)) {
    if (r() < 0.85) {
      bit(H, pick(r, FLOWERS), x + (r() - 0.5) * 0.3, y + (r() - 0.5) * 0.3, 0.14, 0.12, 0.09, [r() * 3, r() * 3, 0]);
    }
  }
  for (const [x, y] of ring(zx, zy, 4.0, 4.0, 14)) {
    bit(H, 'homeHedge', x, y, 0.25, 0.32, 0.28, [r() * 3, r() * 3, 0]);
  }
  /* Picnic tables, long way north south: the top, the two benches, the
   * legs. */
  for (const [x, y] of [[cx + 2.8, cy - 1.2], [cx + 2.8, cy + 3.6], [P.x0 + 21, cy + 5.5]]) {
    H.box('homeWood', x - 0.4, y - 0.9, 0.72, x + 0.4, y + 0.9, 0.78, { name: 'picnic table', kind: 'obstacle' });
    for (const s of [-1, 1]) {
      H.box('homeWood', x + s * 0.68 - 0.14, y - 0.9, 0.42, x + s * 0.68 + 0.14, y + 0.9, 0.47, { name: 'picnic bench', kind: 'obstacle' });
      for (const e of [-0.7, 0.7]) {
        H.paint('homeWood', x + s * 0.5 - 0.04, y + e - 0.04, 0, x + s * 0.5 + 0.04, y + e + 0.04, 0.72);
      }
    }
  }
  /* A bin at the end of every bench. */
  for (let x = P.x0 + 14; x < P.x1 - 10; x += 16) {
    for (const y of [P.y0 + inset + 2.4, P.y1 - inset - 2.4]) {
      H.box('headsShutter', x + 1.25, y - 0.25, 0, x + 1.75, y + 0.25, 0.9, { name: 'bin', kind: 'obstacle' });
      fine(H.paint('homeShelf', x + 1.28, y - 0.22, 0.9, x + 1.72, y + 0.22, 0.92));
    }
  }
  /* The name board at the gate, two posts and a green board with a white
   * line of lettering on its face. */
  const gy = P.y0 + 1.6;
  for (const s of [-1, 1]) {
    H.post('homeWood', cx + s * 1.7, gy, 0, 2.0, 0.07, { seg: 6, kind: 'pole' });
  }
  H.box('headsShutter', cx - 1.6, gy - 0.05, 1.15, cx + 1.6, gy + 0.05, 1.85, { name: 'park sign' });
  fine(H.paint('homeWhite', cx - 1.2, gy - 0.07, 1.42, cx + 1.2, gy - 0.05, 1.58));
  fine(H.paint('homeWhite', cx - 0.8, gy - 0.07, 1.25, cx + 0.8, gy - 0.05, 1.33));
  for (let x = cx - 1.5; x < cx + 1.6; x += 0.5) {
    bit(H, pick(r, FLOWERS), x, gy - 0.5, 0.14, 0.13, 0.1);
  }
}

/*
 * THE TREES PAST THE EDGE: a ring of them round the neighbourhood, just
 * past its last back fences, so the street does not stop at a lawn going
 * on into the fog, and from up high it reads as a suburb in its woods.
 * Lighter again than the street's own (tree, above): a trunk and three
 * round blobs. Solid as the street's are, and drawn on every preset for
 * that reason. A gap is left where each street runs out.
 */
function horizon(H) {
  const r = stream(0x40e12);
  const mouths = (a, list) => list.some((st) => Math.abs(a - st.c) < st.h + 6);
  const side = (fixed, a0, a1, alongX, out, list) => {
    for (let a = a0; a < a1; a += 9 + r() * 4) {
      if (mouths(a, list)) {
        continue;
      }
      const d = 6 + r() * 6;
      const [x, y] = alongX ? [a, fixed + out * d] : [fixed + out * d, a];
      farTree(H, x, y, 0.9 + r() * 0.6, r);
    }
  };
  side(BOUNDS.y1, BOUNDS.x0 - 10, BOUNDS.x1 + 10, true, 1, NS);
  side(BOUNDS.y0, BOUNDS.x0 - 10, BOUNDS.x1 + 10, true, -1, NS);
  side(BOUNDS.x0, BOUNDS.y0 + 4, BOUNDS.y1 - 4, false, -1, EW);
  side(BOUNDS.x1, BOUNDS.y0 + 4, BOUNDS.y1 - 4, false, 1, EW);
}

let farN = 0;
function farTree(H, px, py, k, r) {
  farN += 1;
  const T = TREE_M * k;
  const R = 0.3 * T;
  const cy = 0.62 * T;
  const trunkR = 0.045 * T;
  grove.push({ m: 'stGroveWood', a: worldAt(px, py, 0), b: worldAt(px, py, cy), r: S * trunkR, rTop: S * trunkR * 0.6, seg: 5 });
  H.cap('stGroveWood', [px, py, 0], [px, py, cy], trunkR * 0.8, { draw: false, name: 'trunk', kind: 'tree' });
  const turn = r() * 6.28;
  const blob = (dx, dy, dh, rr, tone) => {
    grove.push({ m: GROVE_TONES[tone], c: worldAt(px + dx, py + dy, cy + dh), r: S * rr, ry: S * rr, spin: [r() * 3, r() * 3, r() * 3] });
  };
  blob(0, 0, R * 0.5, R * 0.7, 0);
  blob(Math.cos(turn) * R * 0.55, Math.sin(turn) * R * 0.55, 0, R * 0.62, 1);
  blob(-Math.cos(turn) * R * 0.5, -Math.sin(turn) * R * 0.5, -R * 0.1, R * 0.6, 2);
  grove[grove.length - 1].fine = true;
  H.cap('stGrove1', [px, py, cy + R * 0.2], [px, py, cy + R * 0.2], R * 0.85, { draw: false, name: 'canopy', kind: 'canopy' });
}

/* ------------------------------------------------------------------ */
/* The whole                                                           */
/* ------------------------------------------------------------------ */

/*
 * The neighbourhood round Heads' plot: { parts, prisms, flats, discs, cyls,
 * cones, scaled, blocks, stats }, every part in the world frame. The same
 * every call.
 */
export function hoodLayout() {
  treeN = 0;
  carN = 0;
  grove.length = 0;
  cuts.clear();
  goatBlocks.length = 0;
  const H = new House();
  const r = stream(0x90e7);
  farN = 0;
  lots(H, r);
  const lightN = streets(H, r);
  park(H, r);
  horizon(H);
  const parts = H.P.list.slice();
  for (const a of H.scaled) {
    parts.push(...scaledParts(a));
  }
  return {
    parts,
    prisms: H.prisms,
    flats: H.flats,
    discs: H.discs,
    cyls: H.cyls,
    cones: H.cones,
    scaled: H.scaled,
    grove: grove.slice(),
    bits: (H.bits || []).slice(),
    blocks: goatBlocks.slice(),
    stats: {
      houses: parts.filter((p) => p.name === 'house').length,
      trees: treeN,
      far: farN,
      cars: H.scaled.filter((a) => a.el.type === 'car').length,
      lights: lightN,
    },
  };
}
