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
 * and the cross street are Heads' house's, carried on past its plot. */
const EW = [
  { id: 'A', c: STREET_A, h: HALF_A, yellow: true },
  { id: 'C', c: 64, h: 4.5 },
  { id: 'D', c: -94, h: 4.5 },
];
const NS = [
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
}

/* ------------------------------------------------------------------ */
/* The palette                                                         */
/* ------------------------------------------------------------------ */

const SIDINGS = ['homeTrim', 'homeNeighbourTan', 'homeSiding', 'goatSage', 'goatBlue', 'goatYellow', 'homeBrick', 'homeTrim', 'goatSage'];
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
  L.roof(hu0, v0, hu1, v1, h, h, { gable: wallM, pitch, roof: roofM });
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
  return {
    door, dc, dw, gu0, gu1, gv0, gv1, v0, v1, hu0, hu1, porch,
    rect: L.rect(Math.min(hu0, gu0) - 1, Math.min(v0, gv0) - 2.5, Math.max(hu1, gu1) + 1, Math.max(v1, gv1) + 0.5),
  };
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
    grove.push({ m: 'stGroveWood', a: w(px, py, trunkTop * 0.85), b: w(end[0], end[1], end[2]), r: S * trunkR * 0.45, rTop: S * trunkR * 0.25, seg: 5 });
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
  /* What is solid of the crown: a ball inside the blobs, as the town's
   * canopy solids are inside theirs. */
  H.cap('stGrove1', [px, py, cy + R * 0.1], [px, py, cy + R * 0.1], R * 0.8, { draw: false, name: 'canopy', kind: 'canopy' });
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
      const look = house(probe, stream(Math.floor(seed * 4294967296)));
      if (!offPlot(look.rect, 2)) {
        continue;
      }
      const lr = stream(Math.floor(seed * 4294967296));
      const hs = house(L, lr);
      yard(L, hs, lr, on);
    }
  }
}

/* The yard round a house: the drive and the walk, the mailbox, the trees,
 * the fence and what is behind it. */
function yard(L, hs, r, on) {
  const H = L.H;
  /* The drive from the garage door out across the walk and the verge to
   * the kerb, and its cut in the kerb. */
  const d0 = hs.dc - hs.dw / 2 - 0.4;
  const d1 = hs.dc + hs.dw / 2 + 0.4;
  L.paint(r() < 0.5 ? 'homeAsphalt' : 'homeDrive', d0, -SIDE + KERB_W, 0, d1, hs.gv0, G_DRIVE);
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
  /* The mailbox by the drive at the walk. */
  const mu = hs.dc + (hs.dw / 2 + 0.9) * (r() < 0.5 ? -1 : 1);
  L.post('homeShutter', mu, 0.4, 0, 1.05, 0.05, { seg: 6, kind: 'pole' });
  L.box(pick(r, ['homeShutter', 'homeTrim', 'homePlay']), mu - 0.25, 0.15, 1.05, mu + 0.25, 0.65, 1.32, { name: 'mailbox' });
  /* A basketball hoop at the drive's edge on some. */
  if (r() < 0.3) {
    const bu = hs.dc + (hs.dw / 2 + 0.5) * (r() < 0.5 ? -1 : 1);
    L.post('homeShutter', bu, hs.gv0 - 5.5, 0, 3.3, 0.06, { seg: 6, kind: 'pole' });
    L.box('homeTrim', bu - 0.6, hs.gv0 - 5.4, 2.9, bu + 0.6, hs.gv0 - 5.35, 3.65, { name: 'backboard' });
    L.cyl('homePlay', [bu - 0.23, hs.gv0 - 5.1, 3.05], [bu + 0.23, hs.gv0 - 5.1, 3.05], 0.015, 4);
  }
  /* Trees in the front yard and at the back. */
  const fu = r() < 0.5 ? L.u0 + 3 + r() * 3 : L.u1 - 3 - r() * 3;
  if (Math.abs(fu - hs.dc) > hs.dw / 2 + 3 && r() < 0.8) {
    const [x, y] = L.xy(fu, 2.5 + r() * 2);
    if (offPlot({ x0: x - 4, x1: x + 4, y0: y - 4, y1: y + 4 })) {
      tree(H, x, y, 1.1 + r() * 0.6);
    }
  }
  for (let k = 0; k < 2; k += 1) {
    if (r() < 0.6) {
      const [x, y] = L.xy(L.u0 + 2.5 + r() * (L.u1 - L.u0 - 5), L.depth - 2.5 - r() * 3);
      if (offPlot({ x0: x - 4, x1: x + 4, y0: y - 4, y1: y + 4 })) {
        tree(H, x, y, 1.2 + r() * 0.7);
      }
    }
  }
  /* The back yard: fenced on a few (privacy, picket), open on the rest,
   * and one or two things in it. */
  const back0 = hs.v1 + 1.2;
  const fenceKind = r();
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
  }
  if (L.depth - back0 > 6) {
    const n = 1 + (r() < 0.5 ? 1 : 0);
    for (let k = 0; k < n; k += 1) {
      const u = L.u0 + 4 + ((k + 0.5) / n) * (L.u1 - L.u0 - 8);
      const v = back0 + 3 + r() * Math.max(0.5, L.depth - back0 - 7);
      const [x, y] = L.xy(u, v);
      if (offPlot({ x0: x - 3.5, x1: x + 3.5, y0: y - 3.5, y1: y + 3.5 })) {
        const kind = pick(r, BACK_THINGS);
        backThing(L, kind, u, v, r);
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
      for (let a = a0 + 8 + (s > 0 ? 0 : 17); a < a1 - 4; a += 34) {
        const [x, y] = at(a);
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
        if (clear(a + 5) && !inPlot(x, y)) {
          hydrant(H, x, y);
        }
      }
      for (let a = a0 + 14 + r() * 4; a < a1 - 6; a += 15 + r() * 8) {
        const [x, y] = at(a);
        if (clear(a) && !inPlot(x, y) && r() < 0.75) {
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
    }
  }
  /* Street A's double yellow line off the plot, and a white dashed line
   * down the middle of the others. */
  for (const [a0, a1] of subtract([[BOUNDS.x0, BOUNDS.x1]], [[PLOT.x0, PLOT.x1], ...NS.map((n) => [n.c - n.h, n.c + n.h])])) {
    H.paint('homeBook', a0, A.c - 0.18, 0, a1, A.c - 0.08, G_LINE);
    H.paint('homeBook', a0, A.c + 0.08, 0, a1, A.c + 0.18, G_LINE);
  }
  return lightN;
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
    H.ball('homeStone', px + ux * 9.4, py + uy * 6.4, 0.15, 0.32 + r() * 0.2);
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
  H.flat('bardwellDirt', [[dx0, dy0], [dx0 + 14, dy0 + 2], [dx0 + 12, dy0 + 14], [dx0 - 2, dy0 + 12]], 0, 0.035);
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
  lots(H, r);
  const lightN = streets(H, r);
  park(H, r);
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
    blocks: goatBlocks.slice(),
    stats: {
      houses: parts.filter((p) => p.name === 'house').length,
      trees: treeN,
      cars: H.scaled.filter((a) => a.el.type === 'car').length,
      lights: lightN,
    },
  };
}
