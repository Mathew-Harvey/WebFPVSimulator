/*
 * draw.js: Bakuon Dome, drawn over its solids. ./stadium.js says where every
 * wall is; this paints what a manga artist would put on it: the seats in
 * their sections and the fans in them, the aisles' yellow nosings, the
 * ribbon of lettering round the fascia, the roof's fabric glowing between
 * its white arches, the banners hung from them, the big screen's panels,
 * the crushed cars and the buses, the stalls in the concourse with their
 * noren and their lanterns, and the outer walls' ribs, canopies and name.
 *
 * FOR THE LATENCY RULE, everything here goes into six batches whatever
 * the detail, each one draw call (two with its shadow):
 *
 *   lit     vertex coloured cel, casts and takes shadow: cars, buses,
 *           stalls, portals, ribs, the outer walls' furniture
 *   soft    vertex coloured cel that casts none: seats, nosings, ruts,
 *           the roof's top face, everything flat or under a roof
 *   glow    unlit vertex colour: the roof's underside, lanterns, the
 *           floodlights, the LED trims
 *   crowd   the fans, a quad a row segment on ./art.js's crowd picture
 *   signs   the lit signs, a quad each on ./art.js's sheet
 *   led     the screen and the ribbon, the same sheet, unlit
 *
 * The named materials of the solids themselves (src/props/homes.js dm*)
 * are eleven more. Low leaves out the aisles' half steps, the seat pans,
 * the clods and the lanterns' strings, which are a third of the soft
 * batch's triangles and none of what a pilot steers by.
 *
 * Browser only for the meshes; the numbers all come from ./stadium.js.
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

import * as THREE from 'three';
import { cel } from '../city/vendored/core/toon.js';
import { paintMaterial } from '../../art/stf.js';
import {
  FLOOR, BARRIER, LOWER, LOWER_BACK, FASCIA, UPPER, UPPER_BACK, UPPER_TOP, OUTER, VAULT, ARCH_X, TRUSS,
  SCREEN, CATWALK, VOMS, TUNNEL, GATES, WINDOWS, END_DOORS, COLUMNS, JUMPS, RAMP_HALF, KICKERS, BRIDGE,
  CRUSHED, rampsOf, vaultY, underVault, toPlan,
} from './stadium.js';
import { courseLine } from './course.js';
import {
  paintCrowd, paintSheet, sheetCells, CROWD_M, CROWD_STRIPS, SHEET_W, SHEET_H,
} from './art.js';

const C = {
  ink: 0x1d1b24, cream: 0xf1ead8, paper: 0xf6f0e2, white: 0xf6f2ea, yellow: 0xf2c230, red: 0xd8333d,
  vermilion: 0xe4472c, indigo: 0x2e4382, navy: 0x2b3554, blue: 0x2f6fd0, green: 0x3aa45a, orange: 0xf0791e,
  pink: 0xf2a6bd, mint: 0x8fe0b8, gold: 0xe0a83a, steel: 0xb9bdc4, dark: 0x34363f, glass: 0x2a3446,
  rubber: 0x2a2830, dirt: 0x8a5d3c, rut: 0x7a5034, wood: 0x9c7a58, concrete: 0xd9d2c4,
};

/* A small fixed hash, the same every build. */
function hash(a, b = 0, c = 0) {
  let h = Math.imul(a + 0x9e37, 0x85ebca77) ^ Math.imul(b + 0x7f4a, 0xc2b2ae3d) ^ Math.imul(c + 0x1b87, 0x27d4eb2f);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

/*
 * THE PAINTER: triangles with a colour at every corner, into one geometry.
 * A box is drawn with only the faces asked for, so a seat strip pressed to
 * a riser costs no back.
 */
class Painter {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.col = [];
    this.uv = null;
    this._c = new THREE.Color();
  }

  tri(a, b, c, hex) {
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    this._c.setHex(hex);
    for (const p of [a, b, c]) {
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(nx, ny, nz);
      this.col.push(this._c.r, this._c.g, this._c.b);
    }
  }

  /* Four corners, counter clockwise seen from the face's front. */
  quad(a, b, c, d, hex) {
    this.tri(a, b, c, hex);
    this.tri(a, c, d, hex);
  }

  /* An axis box; `skip` names faces left out: any of 'x-x+y-y+z-z+'. */
  box(hex, x0, y0, z0, x1, y1, z1, skip = '') {
    if (x1 < x0) [x0, x1] = [x1, x0];
    if (y1 < y0) [y0, y1] = [y1, y0];
    if (z1 < z0) [z0, z1] = [z1, z0];
    if (x1 - x0 < 1e-4 || y1 - y0 < 1e-4 || z1 - z0 < 1e-4) {
      return;
    }
    const has = (f) => !skip.includes(f);
    if (has('y+')) this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], hex);
    if (has('y-')) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], hex);
    if (has('z+')) this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], hex);
    if (has('z-')) this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], hex);
    if (has('x+')) this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], hex);
    if (has('x-')) this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], hex);
  }

  /* A box turned `yaw` about its centre's upright: the same corners as a
   * document's yaw turns them (local +x to world (cos, -sin)). */
  obox(hex, cx, cy, cz, hx, hy, hz, yaw, skip = '') {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const P = (x, y, z) => [cx + x * c + z * s, cy + y, cz - x * s + z * c];
    const has = (f) => !skip.includes(f);
    const [x0, x1, y0, y1, z0, z1] = [-hx, hx, -hy, hy, -hz, hz];
    if (has('y+')) this.quad(P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0), P(x0, y1, z0), hex);
    if (has('y-')) this.quad(P(x0, y0, z0), P(x1, y0, z0), P(x1, y0, z1), P(x0, y0, z1), hex);
    if (has('z+')) this.quad(P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1), hex);
    if (has('z-')) this.quad(P(x1, y0, z0), P(x0, y0, z0), P(x0, y1, z0), P(x1, y1, z0), hex);
    if (has('x+')) this.quad(P(x1, y0, z1), P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), hex);
    if (has('x-')) this.quad(P(x0, y0, z0), P(x0, y0, z1), P(x0, y1, z1), P(x0, y1, z0), hex);
  }

  /* A tube from a to b, `n` sided, open at its ends. */
  tube(hex, a, b, r, n = 6) {
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const l = Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]);
    if (l < 1e-6) {
      return;
    }
    const t = [d[0] / l, d[1] / l, d[2] / l];
    const h = Math.abs(t[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    let u = [t[1] * h[2] - t[2] * h[1], t[2] * h[0] - t[0] * h[2], t[0] * h[1] - t[1] * h[0]];
    const ul = Math.sqrt(u[0] * u[0] + u[1] * u[1] + u[2] * u[2]);
    u = [u[0] / ul, u[1] / ul, u[2] / ul];
    const v = [t[1] * u[2] - t[2] * u[1], t[2] * u[0] - t[0] * u[2], t[0] * u[1] - t[1] * u[0]];
    const ring = (p, k) => {
      const ang = (k / n) * Math.PI * 2;
      const cs = Math.cos(ang) * r;
      const sn = Math.sin(ang) * r;
      return [p[0] + u[0] * cs + v[0] * sn, p[1] + u[1] * cs + v[1] * sn, p[2] + u[2] * cs + v[2] * sn];
    };
    for (let k = 0; k < n; k += 1) {
      this.quad(ring(a, k), ring(a, k + 1), ring(b, k + 1), ring(b, k), hex);
    }
  }

  /* A low ball, for a lantern or a clod. */
  ball(hex, c, rx, ry, rz, w = 8, h = 5, band = null) {
    const P = (i, j) => {
      const th = (i / w) * Math.PI * 2;
      const ph = (j / h) * Math.PI;
      return [c[0] + Math.cos(th) * Math.sin(ph) * rx, c[1] + Math.cos(ph) * ry, c[2] + Math.sin(th) * Math.sin(ph) * rz];
    };
    for (let j = 0; j < h; j += 1) {
      const hue = band && (j === 0 || j === h - 1) ? band : hex;
      for (let i = 0; i < w; i += 1) {
        const a = P(i, j);
        const b = P(i + 1, j);
        const cc = P(i + 1, j + 1);
        const d = P(i, j + 1);
        if (j === 0) {
          this.tri(a, cc, d, hue);
        } else if (j === h - 1) {
          this.tri(a, b, cc, hue);
        } else {
          this.quad(a, b, cc, d, hue);
        }
      }
    }
  }

  /* A side profile [[u, y]] at the along axis `axis` ('x' or 'z'), from
   * w0 to w1 across: its two faces, its top run and its ends. */
  prism(hex, profile, axis, at0, w0, w1, hexTop = null) {
    const P = (u, y, w) => (axis === 'x' ? [at0 + u, y, w] : [w, y, at0 + u]);
    const n = profile.length;
    /* The faces at w1 and w0, fanned from the first point. */
    for (let i = 1; i + 1 < n; i += 1) {
      const a = profile[0];
      const b = profile[i];
      const c = profile[i + 1];
      if (axis === 'x') {
        this.tri(P(a[0], a[1], w1), P(b[0], b[1], w1), P(c[0], c[1], w1), hex);
        this.tri(P(a[0], a[1], w0), P(c[0], c[1], w0), P(b[0], b[1], w0), hex);
      } else {
        this.tri(P(a[0], a[1], w0), P(b[0], b[1], w0), P(c[0], c[1], w0), hex);
        this.tri(P(a[0], a[1], w1), P(c[0], c[1], w1), P(b[0], b[1], w1), hex);
      }
    }
    for (let i = 0; i < n; i += 1) {
      const a = profile[i];
      const b = profile[(i + 1) % n];
      const hue = hexTop !== null && a[1] > 0.01 && b[1] > 0.01 ? hexTop : hex;
      if (axis === 'x') {
        this.quad(P(a[0], a[1], w0), P(b[0], b[1], w0), P(b[0], b[1], w1), P(a[0], a[1], w1), hue);
      } else {
        this.quad(P(a[0], a[1], w1), P(b[0], b[1], w1), P(b[0], b[1], w0), P(a[0], a[1], w0), hue);
      }
    }
  }

  get triangles() {
    return this.pos.length / 9;
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (this.uv) {
      g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    }
    g.computeBoundingSphere();
    return g;
  }
}

/* Textured quads: a sign or a crowd card, each four corners and uvs. */
class Cards {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.uv = [];
  }

  /* Centre `c`, `r` the unit vector to the right as the face is seen, `u`
   * up, size w by h; uv box [u0, v0, u1, v1]. */
  put(c, r, u, w, h, uvb) {
    const n = [r[1] * u[2] - r[2] * u[1], r[2] * u[0] - r[0] * u[2], r[0] * u[1] - r[1] * u[0]];
    const hw = w / 2;
    const hh = h / 2;
    const P = (sx, sy) => [c[0] + r[0] * sx * hw + u[0] * sy * hh, c[1] + r[1] * sx * hw + u[1] * sy * hh, c[2] + r[2] * sx * hw + u[2] * sy * hh];
    const [u0, v0, u1, v1] = uvb;
    const corners = [[P(-1, -1), u0, v0], [P(1, -1), u1, v0], [P(1, 1), u1, v1], [P(-1, -1), u0, v0], [P(1, 1), u1, v1], [P(-1, 1), u0, v1]];
    for (const [p, a, b] of corners) {
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(n[0], n[1], n[2]);
      this.uv.push(a, b);
    }
  }

  /* An upright sign facing (nx, nz). */
  wall(cell, x, y, z, nx, nz, w, h) {
    this.put([x, y, z], [nz, 0, -nx], [0, 1, 0], w, h, [cell.u0, cell.v0, cell.u1, cell.v1]);
  }

  get triangles() {
    return this.pos.length / 9;
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeBoundingSphere();
    return g;
  }
}

/* ---- the stands ---- */

const AISLE = 7;
const AISLE_HALF = 0.55;

/* A row's run [a0, a1] cut into the seated stretches between its aisles
 * and round any tunnel whose mouth it stands in. */
function stretches(seat) {
  const holes = [];
  if (seat.tier === 0 && (seat.side === 'n' || seat.side === 's') && seat.y < VOMS.top + 0.1) {
    for (const x of VOMS.x) {
      holes.push([x - VOMS.half - 0.2, x + VOMS.half + 0.2]);
    }
  }
  if (seat.tier === 0 && (seat.side === 'e' || seat.side === 'w') && seat.y < TUNNEL.top + 0.1) {
    holes.push([-TUNNEL.half - 0.2, TUNNEL.half + 0.2]);
  }
  const k0 = Math.ceil(seat.a0 / AISLE);
  const k1 = Math.floor(seat.a1 / AISLE);
  for (let k = k0; k <= k1; k += 1) {
    holes.push([k * AISLE - AISLE_HALF, k * AISLE + AISLE_HALF]);
  }
  holes.sort((p, q) => p[0] - q[0]);
  const out = [];
  let at = seat.a0 + 0.1;
  for (const [a, b] of holes) {
    if (a > at + 0.6) {
      out.push([at, Math.min(a, seat.a1 - 0.1)]);
    }
    at = Math.max(at, b);
  }
  if (seat.a1 - 0.1 > at + 0.6) {
    out.push([at, seat.a1 - 0.1]);
  }
  return out;
}

/* The section colours: the lower bowl in red blocks and cream, the upper
 * tier in indigo, every block a little different, as paint fades. */
function seatColour(seat, k) {
  if (seat.tier === 0) {
    return [0xc8424a, 0xd24f52, 0xbd3a45][k % 3];
  }
  return [0x34406a, 0x3b4a7a, 0x2f3a62][k % 3];
}

/* Where a row's things go: along `a` and `o` metres back from its front
 * edge, `y` up, in the world, and the way its fans face. */
function rowFrame(seat) {
  const s = seat.side;
  const sgn = s === 's' || s === 'e' ? 1 : -1;
  const across = s === 'n' || s === 's';
  return {
    at: (a, o, y) => (across ? [a, y, seat.at + sgn * o] : [seat.at + sgn * o, y, a]),
    /* The fans face the floor: toward the hall's middle. */
    face: across ? [0, -sgn] : [-sgn, 0],
    across,
    sgn,
  };
}

function drawStands(P, S, crowd, seats, low) {
  for (const seat of seats) {
    const F = rowFrame(seat);
    const runs = stretches(seat);
    const d = seat.d;
    const y = seat.y;
    runs.forEach(([a0, a1], k) => {
      const hue = seatColour(seat, Math.floor((a0 + 200) / AISLE) + seat.row * 0);
      /* The seat backs, a strip at the back of the tread. */
      const b0 = F.at(a0, d - 0.2, y + 0.08);
      const b1 = F.at(a1, d - 0.1, y + 0.52);
      S.box(hue, b0[0], b0[1], b0[2], b1[0], b1[1], b1[2], 'y-');
      if (!low) {
        /* The pans, folded down. */
        const p0 = F.at(a0, d * 0.42, y + 0.36);
        const p1 = F.at(a1, d - 0.2, y + 0.42);
        S.box(hue, p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], 'y-');
      }
      /* The fans, a card leaning back with the rake. */
      const lower = seat.tier === 0;
      const front = seat.row < 3 && lower;
      const h = hash(seat.row * 7 + seat.tier * 101, Math.round(a0), seat.side.charCodeAt(0));
      const strip = lower ? (front || h < 0.45 ? 1 : 0) : (h < 0.4 ? 0 : (h < 0.8 ? 2 : 3));
      const len = a1 - a0;
      const u0 = hash(seat.row, Math.round(a0 * 3), 5);
      const vTop = 1 - strip / CROWD_STRIPS;
      const vBot = 1 - (strip + 1) / CROWD_STRIPS;
      const mid = (a0 + a1) / 2;
      const c0 = F.at(mid, 0.3, y + CROWD_M.h / 2 - 0.02);
      const r = F.across ? [F.face[1] < 0 ? 1 : -1, 0, 0] : [0, 0, F.face[0] > 0 ? -1 : 1];
      /* Leaning back a tenth: the card's up has a little of "away". */
      const lean = 0.1;
      const away = F.across ? [0, 0, F.sgn] : [F.sgn, 0, 0];
      const up = [away[0] * lean, 1, away[2] * lean];
      const ul = Math.sqrt(1 + lean * lean);
      crowd.put([c0[0] + away[0] * lean * 0.9, c0[1], c0[2] + away[2] * lean * 0.9], r, [up[0] / ul, up[1] / ul, up[2] / ul], len, CROWD_M.h, [u0, vBot, u0 + len / CROWD_M.w, vTop]);
      void k;
    });
    /* The aisles: a yellow nosing on every step, and the half step. */
    const k0 = Math.ceil(seat.a0 / AISLE);
    const k1 = Math.floor(seat.a1 / AISLE);
    for (let k = k0; k <= k1; k += 1) {
      const a = k * AISLE;
      if (seat.tier === 0 && seat.y < VOMS.top + 0.1 && F.across && VOMS.x.includes(a)) {
        continue;
      }
      if (seat.tier === 0 && !F.across && a === 0 && seat.y < TUNNEL.top + 0.1) {
        continue;
      }
      const n0 = F.at(a - AISLE_HALF, -0.005, y - 0.02);
      const n1 = F.at(a + AISLE_HALF, 0.08, y + 0.012);
      S.box(C.yellow, n0[0], n0[1], n0[2], n1[0], n1[1], n1[2], 'y-');
      if (!low) {
        const rise = seat.tier === 0 ? LOWER.rise : UPPER.rise;
        const h0 = F.at(a - AISLE_HALF, d * 0.5, y);
        const h1 = F.at(a + AISLE_HALF, d, y + rise / 2);
        S.box(C.concrete, h0[0], h0[1], h0[2], h1[0], h1[1], h1[2], 'y-');
        const m0 = F.at(a - AISLE_HALF, d * 0.5 - 0.005, y + rise / 2 - 0.02);
        const m1 = F.at(a + AISLE_HALF, d * 0.5 + 0.07, y + rise / 2 + 0.012);
        S.box(C.yellow, m0[0], m0[1], m0[2], m1[0], m1[1], m1[2], 'y-');
      }
    }
  }
}

/* ---- the floor ---- */

/* The course's worn line in the dirt: a darker ribbon and two pairs of
 * tyre tracks, a few centimetres proud of the floor. */
function drawRuts(S, low) {
  const line = courseLine();
  const pts = line.points;
  const tan = line.tangents;
  const n = pts.length;
  const ribbon = (o0, o1, y, hex, stride) => {
    for (let i = 0; i < n; i += stride) {
      const j = (i + stride) % n;
      const P = (k, o) => {
        const p = pts[k];
        const t = tan[k];
        const px = p.x - t.y * o;
        const py = p.y + t.x * o;
        return [px - 210, y, 165 - py];
      };
      const a = P(i, o0);
      const b = P(i, o1);
      const c = P(j, o1);
      const d = P(j, o0);
      /* Whichever winding faces up. */
      const ux = b[0] - a[0];
      const uz = b[2] - a[2];
      const vx = d[0] - a[0];
      const vz = d[2] - a[2];
      if (uz * vx - ux * vz > 0) {
        S.quad(a, b, c, d, hex);
      } else {
        S.quad(a, d, c, b, hex);
      }
    }
  };
  void toPlan;
  ribbon(-4.6, 4.6, FLOOR.dirt + 0.006, C.dirt, 2);
  for (const o of [-2.6, -1.3, 1.3, 2.6]) {
    ribbon(o - 0.28, o + 0.28, FLOOR.dirt + 0.012, C.rut, 2);
  }
  /* Donuts in the infield, where the freestyle ends. */
  for (const [cx, cz, r] of [[-22, 0, 5.5], [22, 0, 6.5], [0, -26, 4.5], [0, 26, 4.5]]) {
    const m = 28;
    for (let i = 0; i < m; i += 1) {
      const a0 = (i / m) * Math.PI * 2;
      const a1 = ((i + 1) / m) * Math.PI * 2;
      for (const [r0, r1] of [[r - 0.9, r - 0.3], [r + 0.3, r + 0.9]]) {
        const y = FLOOR.dirt + 0.012;
        const p = (rr, a) => [cx + Math.cos(a) * rr, y, cz + Math.sin(a) * rr];
        S.quad(p(r0, a0), p(r0, a1), p(r1, a1), p(r1, a0), C.rut);
      }
    }
  }
  if (low) {
    return;
  }
  /* Clods thrown off the line. */
  for (let i = 0; i < 260; i += 1) {
    const x = (hash(i, 1) - 0.5) * (FLOOR.hx * 2 - 4);
    const z = (hash(i, 2) - 0.5) * (FLOOR.hz * 2 - 4);
    const r = 0.1 + hash(i, 3) * 0.18;
    S.ball(hash(i, 4) < 0.5 ? C.dirt : C.rut, [x, FLOOR.dirt + r * 0.3, z], r, r * 0.55, r * (0.8 + hash(i, 5) * 0.5), 5, 3);
  }
}

/* The jumps' ramps and the kickers, in the dark dirt, the lip in plank. */
function drawRamps(kit, L) {
  for (const j of JUMPS) {
    const r = rampsOf(j);
    for (const part of [r.take, r.land]) {
      const pts = part.pts.map(([a, h]) => [part.x0 + j.dir * a, h + FLOOR.dirt]);
      const first = pts[0][0];
      const last = pts[pts.length - 1][0];
      const profile = [...pts];
      if (pts[pts.length - 1][1] > FLOOR.dirt + 0.01) {
        profile.push([last, FLOOR.dirt]);
      }
      if (pts[0][1] > FLOOR.dirt + 0.01) {
        profile.unshift([first, FLOOR.dirt]);
      }
      /* Three's extrusion finds the winding itself. */
      const ccw = profile;
      kit.extrude('dmDirtDark', ccw.map(([x, y]) => [x, y]), j.z - RAMP_HALF, j.z + RAMP_HALF);
      /* The groomed line up it, proud and narrower. */
      kit.extrude('dmDirt', ccw.map(([x, y]) => [x, y > FLOOR.dirt + 0.001 ? y + 0.03 : y]), j.z - RAMP_HALF + 0.9, j.z + RAMP_HALF - 0.9);
    }
  }
  for (const k of KICKERS) {
    const yaw = Math.atan2(-k.dz, k.dx);
    kit.begin(k.x, 0, k.z, yaw, 'extra');
    kit.extrude('dmDirtDark', [[0, FLOOR.dirt], [k.len, FLOOR.dirt], [k.len, k.h + FLOOR.dirt], [k.len * 0.55, k.h * 0.42 + FLOOR.dirt]], -k.half, k.half);
    kit.box('dmGrate', k.len - 0.15, FLOOR.dirt, -k.half, k.len + 0.05, k.h + FLOOR.dirt + 0.05, k.half);
    kit.begin(0, 0, 0, 0, 'extra');
  }
  void L;
}

/* A car crushed flat: body, roof caved, the glass gone dark, the wheels
 * splayed. Centre (x, z), long along z, `h` its height. */
function crushedCar(P, x, z, h, hue, seed, long = 'z') {
  const lh = long === 'z' ? [0.72, 2.0] : [2.0, 0.72];
  const y0 = FLOOR.dirt;
  const tilt = (hash(seed, 9) - 0.5) * 0.1;
  P.box(hue, x - lh[0], y0 + 0.12, z - lh[1], x + lh[0], y0 + h * 0.62 + tilt, z + lh[1]);
  /* The cabin, squashed to a lump, its glass dark. */
  const cx = long === 'z' ? [0.62, 0.95] : [0.95, 0.62];
  P.box(hue, x - cx[0], y0 + h * 0.62, z - cx[1], x + cx[0], y0 + h - 0.05, z + cx[1]);
  P.box(C.glass, x - cx[0] - 0.01, y0 + h * 0.66, z - cx[1] + 0.12, x + cx[0] + 0.01, y0 + h - 0.12, z + cx[1] - 0.12);
  /* The bumpers and the wheels. */
  const L = long === 'z' ? [[0, -lh[1]], [0, lh[1]]] : [[-lh[0], 0], [lh[0], 0]];
  for (const [bx, bz] of L) {
    P.box(C.steel, x + bx - (long === 'z' ? 0.7 : 0.06), y0 + 0.14, z + bz - (long === 'z' ? 0.06 : 0.7), x + bx + (long === 'z' ? 0.7 : 0.06), y0 + 0.3, z + bz + (long === 'z' ? 0.06 : 0.7));
  }
  for (const s of [-1, 1]) {
    for (const t of [-0.6, 0.6]) {
      const wx = long === 'z' ? x + s * (lh[0] - 0.05) : x + t * lh[0];
      const wz = long === 'z' ? z + t * lh[1] : z + s * (lh[1] - 0.05);
      P.box(C.rubber, wx - 0.15, y0, wz - 0.3, wx + 0.15, y0 + 0.36, wz + 0.3);
    }
  }
}

/* A bus, along x from x0 to x1, z half width hz, y0 up to y0 + h: cream
 * with a band, its windows a dark run, a door, its lamps. */
function bus(P, x0, x1, z0, z1, y0, h, band, crushed = false) {
  const top = y0 + h;
  P.box(C.cream, x0, y0 + 0.25, z0, x1, top, z1);
  P.box(band, x0 - 0.01, y0 + 0.5, z0 - 0.01, x1 + 0.01, y0 + 0.8, z1 + 0.01, 'y-y+');
  const wy0 = y0 + h * 0.52;
  const wy1 = top - 0.18;
  if (wy1 > wy0) {
    for (let x = x0 + 0.5; x < x1 - 0.9; x += 1.15) {
      P.box(C.glass, x, wy0, z0 - 0.02, x + 0.95, wy1, z1 + 0.02, 'y-y+x-x+');
    }
    P.box(C.glass, x1 - 0.01, wy0, z0 + 0.15, x1 + 0.02, wy1, z1 - 0.15, 'y-y+z-z+');
  }
  P.box(C.rubber, x0 + 0.8, y0, z0 - 0.04, x0 + 1.8, y0 + 0.7, z1 + 0.04, 'y+');
  P.box(C.rubber, x1 - 2.3, y0, z0 - 0.04, x1 - 1.3, y0 + 0.7, z1 + 0.04, 'y+');
  P.box(C.steel, x0 - 0.05, top - 0.04, z0 + 0.2, x1 + 0.05, top + 0.06, z1 - 0.2, 'y-');
  if (crushed) {
    /* A crease down the roof, where the first truck landed. */
    P.box(0xc8bfa8, (x0 + x1) / 2 - 0.25, top - 0.08, z0 - 0.02, (x0 + x1) / 2 + 0.25, top + 0.02, z1 + 0.02, 'y-');
  }
}

function drawWrecks(P) {
  const CAR = [C.red, 0x8a8d96, C.blue, C.white, 0x508c5e, C.yellow, 0x2b2830, C.orange];
  /* The crush: six cars across the lane. */
  {
    const j = JUMPS[0];
    const g = rampsOf(j).gap;
    const gx0 = Math.min(g.x0, g.x1);
    const gx1 = Math.max(g.x0, g.x1);
    const n = 6;
    const w = 1.55;
    const start = (gx0 + gx1) / 2 - (n * w) / 2;
    for (let i = 0; i < n; i += 1) {
      const x = start + i * w + 0.04 + (w - 0.08) / 2;
      crushedCar(P, x, j.z, CRUSHED.h, CAR[i % CAR.length], i);
    }
  }
  /* The crushed bus over the other gap, side on to the trucks. */
  {
    const j = JUMPS[1];
    const g = rampsOf(j).gap;
    const c = (g.x0 + g.x1) / 2;
    P.box(C.cream, c - 1.25, FLOOR.dirt + 0.25, j.z - 5.5, c + 1.25, FLOOR.dirt + 1.9, j.z + 5.5);
    P.box(C.green, c - 1.26, FLOOR.dirt + 0.5, j.z - 5.51, c + 1.26, FLOOR.dirt + 0.8, j.z + 5.51, 'y-y+');
    for (let z = j.z - 5; z < j.z + 4.6; z += 1.15) {
      P.box(C.glass, c - 1.27, FLOOR.dirt + 1.1, z, c + 1.27, FLOOR.dirt + 1.7, z + 0.9, 'y-y+z-z+');
    }
    P.box(0xc8bfa8, c - 1.26, FLOOR.dirt + 1.82, j.z - 0.3, c + 1.26, FLOOR.dirt + 1.92, j.z + 0.3, 'y-');
    for (const z of [j.z - 4, j.z + 3.4]) {
      P.box(C.rubber, c - 1.29, FLOOR.dirt, z, c + 1.29, FLOOR.dirt + 0.7, z + 1);
    }
  }
  /* The bridge: two stacks of three cars each and the bus across them. */
  for (const [x0, x1] of BRIDGE.stack) {
    for (let i = 0; i < BRIDGE.cars; i += 1) {
      const y = FLOOR.dirt + i * BRIDGE.car;
      const hue = CAR[(i * 3 + (x0 > 0 ? 2 : 0)) % CAR.length];
      const xm = (x0 + x1) / 2;
      const off = (hash(i, x0 > 0 ? 3 : 4) - 0.5) * 0.2;
      P.box(hue, x0 + off, y + 0.04, -BRIDGE.depth - off, x1 + off, y + BRIDGE.car - 0.05, BRIDGE.depth - off);
      P.box(C.glass, xm - 0.6 + off, y + BRIDGE.car * 0.55, -BRIDGE.depth - 0.01 - off, xm + 0.6 + off, y + BRIDGE.car - 0.12, BRIDGE.depth + 0.01 - off, 'y-y+x-x+');
      P.box(C.rubber, x0 + off - 0.02, y + 0.04, -BRIDGE.depth + 0.3 - off, x1 + off + 0.02, y + 0.3, -BRIDGE.depth + 0.9 - off, 'y-y+');
      P.box(C.rubber, x0 + off - 0.02, y + 0.04, BRIDGE.depth - 0.9 - off, x1 + off + 0.02, y + 0.3, BRIDGE.depth - 0.3 - off, 'y-y+');
    }
  }
  {
    const b = BRIDGE.bus;
    const y0 = FLOOR.dirt + BRIDGE.car * BRIDGE.cars;
    bus(P, -b.hx, b.hx, -b.hz, b.hz, y0, b.h, C.blue);
  }
}

/* ---- the hall ---- */

/* The barrier's face, a pad a truck's length, its words on the sheet. */
function drawBarrier(P, signs, cells) {
  const PADS = ['pad0', 'pad1', 'pad2', 'pad3', 'pad4', 'pad1', 'pad2'];
  let k = 0;
  const h = 0.8;
  const y = 0.62;
  /* The long sides, inner face. */
  for (const s of [-1, 1]) {
    for (let x = -FLOOR.hx + 3.2; x < FLOOR.hx - 3; x += 6.4) {
      const z = s * (FLOOR.hz - 0.02);
      signs.wall(cells[PADS[k % PADS.length]], x, y, z, 0, -s, 3.2, h);
      k += 1;
    }
    /* The top cap, yellow and black, the way a race wall is painted. */
    for (let x = -FLOOR.hx - BARRIER.t; x < FLOOR.hx + BARRIER.t - 0.1; x += 1.6) {
      const zz = s > 0 ? FLOOR.hz : -FLOOR.hz - BARRIER.t;
      P.box(((x / 1.6) | 0) % 2 ? C.yellow : C.ink, x, BARRIER.h, zz, Math.min(x + 1.6, FLOOR.hx + BARRIER.t), BARRIER.h + 0.05, zz + BARRIER.t, 'y-');
    }
  }
  for (const s of [-1, 1]) {
    for (const [z0, z1] of [[-FLOOR.hz, -TUNNEL.half], [TUNNEL.half, FLOOR.hz]]) {
      for (let z = z0 + 3.2; z < z1 - 1.5; z += 6.4) {
        signs.wall(cells[PADS[k % PADS.length]], s * (FLOOR.hx - 0.02), y, z, -s, 0, Math.min(3.2, z1 - z), h);
        k += 1;
      }
      const xx = s > 0 ? FLOOR.hx : -FLOOR.hx - BARRIER.t;
      for (let z = z0; z < z1 - 0.1; z += 1.6) {
        P.box(Math.round(z / 1.6) % 2 ? C.yellow : C.ink, xx, BARRIER.h, z, xx + BARRIER.t, BARRIER.h + 0.05, Math.min(z + 1.6, z1), 'y-');
      }
    }
  }
}

/* The truck tunnels' portals at each end of the floor, the gates' frames
 * in the stands, and their signs. */
function drawPortals(P, signs, cells) {
  for (const s of [-1, 1]) {
    /* The truck tunnel: a hazard frame on the face of the bowl's front
     * row, its name over it. */
    const x = s * (LOWER.x0 - 0.02);
    for (const z of [-TUNNEL.half - 0.35, TUNNEL.half]) {
      P.box(C.yellow, x - s * 0.05, 0, z, x + s * 0.02, TUNNEL.top, z + 0.35);
    }
    signs.wall(cells.hazard, x - s * 0.06, TUNNEL.top + 0.25, 0, -s, 0, TUNNEL.half * 2 + 0.7, 0.5);
    signs.wall(cells[s < 0 ? 'enter' : 'exit'], x - s * 0.06, TUNNEL.top + 1.25, 0, -s, 0, 4.2, 1.3);
    /* The rows above the tunnel are bridged over it; their fronts get
     * the frame's top. */
    for (const z of [-TUNNEL.half - 0.35, TUNNEL.half]) {
      P.box(C.yellow, s * FLOOR.hx - s * 0.02, 0, z, s * FLOOR.hx + s * (BARRIER.t + 0.02), BARRIER.h + 0.3, z + 0.35);
    }
  }
  /* The gates: a frame round each tunnel in the long sides' stands, and
   * its number over it on the row above. */
  let n = 1;
  for (const s of [-1, 1]) {
    VOMS.x.forEach((vx) => {
      const z = s * (LOWER.z0 - 0.02);
      for (const x of [vx - VOMS.half - 0.25, vx + VOMS.half]) {
        P.box(C.yellow, x, 0, z - s * 0.04, x + 0.25, VOMS.top, z + s * 0.02);
      }
      P.box(C.yellow, vx - VOMS.half - 0.25, VOMS.top, z - s * 0.04, vx + VOMS.half + 0.25, VOMS.top + 0.2, z + s * 0.02);
      const row = 3;
      const zr = s * (LOWER.z0 + row * LOWER.d - 0.03);
      signs.wall(cells[`gate${n}`], vx, LOWER.base + (row - 1) * LOWER.rise + 0.2, zr, 0, -s, 1.6, 0.8);
      n += 1;
    });
  }
}

/* The ribbon round the fascia: lit panels over the back rows. */
function drawRibbon(led, P, cells) {
  const RIB = ['rb0', 'rb1', 'rb2', 'rb3', 'rb4', 'rb5', 'rb6', 'rb7'];
  const y0 = LOWER.base + (LOWER.rows - 1) * LOWER.rise + 1.3;
  const h = 2.2;
  const w = h * (512 / 96);
  let k = 0;
  const LB = LOWER_BACK;
  for (const s of [-1, 1]) {
    for (let x = -LB.x + w / 2 + 0.6; x < LB.x - w / 2; x += w + 0.4) {
      led.wall(cells[RIB[k % RIB.length]], x, y0 + h / 2, s * (LB.z - 0.03), 0, -s, w, h);
      k += 3;
    }
    for (let z = -LB.z + w / 2 + 0.6; z < LB.z - w / 2; z += w + 0.4) {
      led.wall(cells[RIB[k % RIB.length]], s * (LB.x - 0.03), y0 + h / 2, z, -s, 0, w, h);
      k += 5;
    }
    /* A rail of light under it and over it, round the whole fascia. */
    P.box(C.paper, -LB.x, y0 - 0.12, s * LB.z - s * 0.06, LB.x, y0 - 0.04, s * LB.z, 'y-');
    P.box(C.paper, -LB.x, y0 + h + 0.04, s * LB.z - s * 0.06, LB.x, y0 + h + 0.12, s * LB.z, 'y-');
    P.box(C.paper, s * LB.x - s * 0.06, y0 - 0.12, -LB.z, s * LB.x, y0 - 0.04, LB.z, 'y-');
    P.box(C.paper, s * LB.x - s * 0.06, y0 + h + 0.04, -LB.z, s * LB.x, y0 + h + 0.12, LB.z, 'y-');
  }
}

/* The concourse: stalls along the outer wall's inside, a noren and a
 * counter each, lanterns on a string, posters on the columns. */
function drawConcourse(L, G, signs, cells, low) {
  const NOREN = ['nr0', 'nr1', 'nr2', 'nr3', 'nr4', 'nr5'];
  let k = 0;
  const inner = OUTER.z - 0.02;
  for (const s of [-1, 1]) {
    for (let x = -84; x <= 84; x += 12) {
      if (GATES.x.some((g) => Math.abs(g - x) < GATES.half + 3)) {
        continue;
      }
      const z1 = s * inner;
      const z0 = s * (inner - 2.6);
      const hue = [C.red, C.indigo, C.wood, C.green, C.orange, C.ink][k % 6];
      /* The booth: back, sides, a roof board, a counter. */
      L.box(C.paper, x - 2.6, 0, z1 - s * 0.2, x + 2.6, 3.4, z1);
      for (const sx of [-1, 1]) {
        L.box(C.wood, x + sx * 2.6 - 0.1, 0, Math.min(z0, z1), x + sx * 2.6 + 0.1, 3.0, Math.max(z0, z1));
      }
      L.box(hue, x - 2.9, 3.0, Math.min(z0, z1) - 0.3, x + 2.9, 3.35, Math.max(z0, z1));
      L.box(C.wood, x - 2.4, 0, z0 - s * 0.05, x + 2.4, 1.0, z0 + s * 0.6);
      L.box(C.paper, x - 2.45, 1.0, z0 - s * 0.08, x + 2.45, 1.06, z0 + s * 0.65);
      /* What is on the counter: pots and stacked boxes. */
      for (let i = 0; i < 4; i += 1) {
        const px = x - 1.8 + i * 1.2;
        L.box([C.red, C.white, C.yellow, C.steel][(i + k) % 4], px - 0.18, 1.06, z0 + s * 0.15, px + 0.18, 1.35 + (i % 2) * 0.15, z0 + s * 0.45);
      }
      signs.wall(cells[NOREN[k % NOREN.length]], x, 2.45, z0 - s * 0.32, 0, -s, 5.2, 1.0);
      /* A pair of red lanterns at the front corners. */
      if (!low) {
        for (const sx of [-1, 1]) {
          G.ball(0xff6a4e, [x + sx * 2.4, 2.55, z0 - s * 0.35], 0.26, 0.34, 0.26, 8, 5, C.ink);
        }
      }
      k += 1;
    }
  }
  /* The ends' concourse: vending machines in a line. */
  for (const s of [-1, 1]) {
    for (let z = -44; z <= 44; z += 2.2) {
      if (Math.abs(z) < TUNNEL.half + 5 || END_DOORS.z.some((d) => Math.abs(d - z) < END_DOORS.half + 1.2)) {
        continue;
      }
      const x = s * (OUTER.x - 0.5);
      const hue = [C.red, C.blue, C.white, C.green][Math.abs(Math.round(z / 2.2)) % 4];
      L.box(hue, x - 0.45, 0, z - 0.6, x + 0.45, 1.85, z + 0.6);
      G.box(0xfff6e2, x - s * 0.46, 1.1, z - 0.48, x - s * 0.47, 1.7, z + 0.48);
      L.box(C.ink, x - s * 0.47, 0.25, z - 0.4, x - s * 0.5, 0.55, z + 0.4);
    }
  }
  /* The lantern strings down the concourse, zigzag between the columns. */
  if (!low) {
    for (const s of [-1, 1]) {
      for (let i = 0; i < COLUMNS.xs.length - 1; i += 1) {
        const xa = COLUMNS.xs[i];
        const xb = COLUMNS.xs[i + 1];
        if (xb - xa > 13) {
          continue;
        }
        const n = 4;
        for (let t = 1; t < n; t += 1) {
          const x = xa + ((xb - xa) * t) / n;
          G.ball(t % 2 ? 0xff6a4e : 0xfff2cc, [x, 6.2 - 0.25 * Math.sin((t / n) * Math.PI), s * (COLUMNS.z - 2.5)], 0.22, 0.3, 0.22, 6, 4, C.ink);
        }
      }
    }
  }
  /* Strip lights on the concourse's ceiling, the underside of the upper
   * tier, two lines down each side. */
  for (const s of [-1, 1]) {
    for (const zc of [COLUMNS.z - 4, COLUMNS.z + 4]) {
      for (let x = -86; x < 86; x += 6) {
        G.box(0xfff6e2, x, UPPER.under - 0.06, s * zc - 0.15, x + 3.2, UPPER.under - 0.01, s * zc + 0.15);
      }
    }
    for (const xc of [COLUMNS.x - 4, COLUMNS.x + 4]) {
      for (let z = -54; z < 54; z += 6) {
        G.box(0xfff6e2, s * xc - 0.15, UPPER.under - 0.06, z, s * xc + 0.15, UPPER.under - 0.01, z + 3.2);
      }
    }
  }
  /* A poster on each column, toward the stalls. */
  let p = 0;
  for (const s of [-1, 1]) {
    for (const x of COLUMNS.xs) {
      signs.wall(cells[`ps${p % 4}`], x, 2.2, s * (COLUMNS.z + COLUMNS.r + 0.02), 0, s, 1.2, 1.7);
      p += 1;
    }
  }
}

/* The roof: the fabric over each covered end, its top lit cream with its
 * seams, its underside glowing; the rims at the crown's opening; the
 * gables' faces. */
function drawRoof(kit, S, G, signs, cells) {
  const nz = 48;
  const seam = 0xd8cdb4;
  for (const s of [-1, 1]) {
    const xa = s * VAULT.open;
    const xb = s * (OUTER.x + OUTER.t);
    const [x0, x1] = xa < xb ? [xa, xb] : [xb, xa];
    for (let i = 0; i < nz; i += 1) {
      const za = -VAULT.half + (2 * VAULT.half * i) / nz;
      const zb = -VAULT.half + (2 * VAULT.half * (i + 1)) / nz;
      const ya = vaultY(za) + 0.02;
      const yb = vaultY(zb) + 0.02;
      /* Panels between the arches, a seam on every third. */
      const hue = i % 3 === 0 ? seam : C.paper;
      S.quad([x0, ya, za], [x0, yb, zb], [x1, yb, zb], [x1, ya, za], hue);
      /* The underside, glowing, a little below the top. */
      const glowHue = i % 3 === 0 ? 0xeee0c4 : 0xfff6e2;
      G.quad([x0, ya - 0.08, za], [x1, ya - 0.08, za], [x1, yb - 0.08, zb], [x0, yb - 0.08, zb], glowHue);
    }
    /* Seams along the length over every arch on the top. */
    for (const ax of ARCH_X) {
      if (Math.abs(ax) < VAULT.open || Math.sign(ax) !== s) {
        continue;
      }
      for (let i = 0; i < nz; i += 1) {
        const za = -VAULT.half + (2 * VAULT.half * i) / nz;
        const zb = -VAULT.half + (2 * VAULT.half * (i + 1)) / nz;
        S.quad([ax - 0.3, vaultY(za) + 0.05, za], [ax - 0.3, vaultY(zb) + 0.05, zb], [ax + 0.3, vaultY(zb) + 0.05, zb], [ax + 0.3, vaultY(za) + 0.05, za], 0xe9eef2);
      }
    }
    /* The rim at the opening, a deep white edge beam following the vault. */
    for (let i = 0; i < nz; i += 1) {
      const za = -VAULT.half + (2 * VAULT.half * i) / nz;
      const zb = -VAULT.half + (2 * VAULT.half * (i + 1)) / nz;
      kit.cyl('dmSteel', [xa, vaultY(za) - 0.3, za], [xa, vaultY(zb) - 0.3, zb], 0.45, 6);
    }
    /* The gable over the end wall, outside face lettered with the name. */
    const xc = s * (OUTER.x + OUTER.t / 2);
    const prof = [];
    for (let i = 0; i <= 32; i += 1) {
      const z = -VAULT.half + (2 * VAULT.half * i) / 32;
      prof.push([z, vaultY(z)]);
    }
    prof.push([VAULT.half, OUTER.h]);
    prof.push([-VAULT.half, OUTER.h]);
    /* Turned a quarter, local x is world z and local z is world minus x,
     * so the profile is drawn in (z, y) and extruded across the wall. */
    kit.begin(0, 0, 0, -Math.PI / 2, 'extra');
    kit.extrude('dmWall', prof.map(([z, y]) => [z, y]).reverse(), -(xc + OUTER.t / 2), -(xc - OUTER.t / 2));
    kit.begin(0, 0, 0, 0, 'extra');
    signs.wall(cells.gable, xc + s * (OUTER.t / 2 + 0.04), OUTER.h + 7.5, 0, s, 0, 36, 9);
  }
}

/* The arches' floodlights, the banners hung from them, the big screen's
 * faces and trim, the catwalk's rails. */
function drawRig(kit, G, signs, led, cells) {
  for (const x of ARCH_X) {
    for (const z of [-48, -34, -20, 20, 34, 48]) {
      const [cz, cy] = underVault(z, TRUSS.bottom + 0.35);
      G.box(0xfff6e2, x - 0.5, cy - 0.25, cz - 0.3, x + 0.5, cy + 0.05, cz + 0.3);
      kit.box('dmScreenBox', x - 0.6, cy + 0.05, cz - 0.4, x + 0.6, cy + 0.3, cz + 0.4);
    }
  }
  /* Four banners, a truck each, from the arches over the ends. */
  const B = [['bn0', -45, -22], ['bn1', 45, -22], ['bn2', -45, 22], ['bn3', 45, 22]];
  for (const [key, x, z] of B) {
    const [, cy] = underVault(z, TRUSS.bottom);
    const h = 10;
    const top = cy - 0.3;
    for (const n of [-1, 1]) {
      signs.wall(cells[key], x + n * 0.03, top - h / 2, z, n, 0, h / 3, h);
    }
    kit.cyl('dmSteel', [x, top, z - h / 6 - 0.2], [x, top, z + h / 6 + 0.2], 0.06, 5);
  }
  /* The screen: a panel on each face, a light rail round its top and foot. */
  const faces = [['screen0', 0, 1], ['screen1', 0, -1], ['screen2', 1, 0], ['screen3', -1, 0]];
  const sh = SCREEN.y1 - SCREEN.y0 - 1.0;
  const sw = Math.min(sh * (512 / 288), SCREEN.hx * 2 - 0.8);
  for (const [key, nx, nz] of faces) {
    const x = nx * (SCREEN.hx + 0.03);
    const z = nz * (SCREEN.hz + 0.03);
    led.wall(cells[key], x, (SCREEN.y0 + SCREEN.y1) / 2, z, nx, nz, sw, sh);
  }
  G.box(0xd8333d, -SCREEN.hx - 0.06, SCREEN.y0 - 0.1, -SCREEN.hz - 0.06, SCREEN.hx + 0.06, SCREEN.y0 + 0.08, SCREEN.hz + 0.06);
  G.box(0xf2c230, -SCREEN.hx - 0.06, SCREEN.y1 - 0.08, -SCREEN.hz - 0.06, SCREEN.hx + 0.06, SCREEN.y1 + 0.02, SCREEN.hz + 0.06);
  /* The catwalk's rails, both sides, posts every three metres. */
  for (const sz of [-1, 1]) {
    const z = sz * (CATWALK.half - 0.05);
    kit.cyl('dmGrate', [-CATWALK.x, CATWALK.y + 1.05, z], [CATWALK.x, CATWALK.y + 1.05, z], 0.03, 4);
    kit.cyl('dmGrate', [-CATWALK.x, CATWALK.y + 0.55, z], [CATWALK.x, CATWALK.y + 0.55, z], 0.02, 4);
    for (let x = -CATWALK.x; x <= CATWALK.x; x += 3) {
      kit.cyl('dmGrate', [x, CATWALK.y, z], [x, CATWALK.y + 1.05, z], 0.025, 4);
    }
  }
}

/* The outside: ribs up the outer walls, a red band at their top, the
 * gates' canopies and signs, the windows' frames. */
function drawOutside(L, signs, cells) {
  const GATE_SIGNS = ['gateC', 'gateB', 'gateA'];
  for (const s of [-1, 1]) {
    const z = s * (OUTER.z + OUTER.t);
    for (let x = -OUTER.x + 7; x < OUTER.x; x += 14) {
      L.box(C.paper, x - 0.4, 0, z, x + 0.4, OUTER.h + 0.2, z + s * 0.5, s > 0 ? 'z-' : 'z+');
    }
    L.box(C.red, -OUTER.x - OUTER.t, OUTER.h - 1.2, z, OUTER.x + OUTER.t, OUTER.h, z + s * 0.12, s > 0 ? 'z-' : 'z+');
    L.box(C.navy, -OUTER.x - OUTER.t, 0, z, OUTER.x + OUTER.t, 0.9, z + s * 0.08, s > 0 ? 'z-' : 'z+');
    GATES.x.forEach((gx, i) => {
      L.box(C.ink, gx - GATES.half - 1.5, GATES.top + 0.2, z, gx + GATES.half + 1.5, GATES.top + 0.6, z + s * 3.2);
      L.box(C.red, gx - GATES.half - 1.5, GATES.top + 0.6, z + s * 3.0, gx + GATES.half + 1.5, GATES.top + 1.4, z + s * 3.2);
      signs.wall(cells[GATE_SIGNS[i]], gx, GATES.top + 2.6, z + s * 0.03, 0, s, 6, 2.25);
    });
    for (const wx of WINDOWS.x) {
      L.box(C.ink, wx - WINDOWS.half - 0.2, WINDOWS.y0 - 0.3, z, wx + WINDOWS.half + 0.2, WINDOWS.y0, z + s * 0.4);
    }
    /* The name again down each long side, between the gates. */
    for (const nx of [-28, 28]) {
      signs.wall(cells.gable, nx, 12, z + s * 0.04, 0, s, 30, 7.5);
    }
    /* Nobori along the plaza, a truck's banner on a pole, two by each
     * gate. */
    let b = 0;
    for (const gx of GATES.x) {
      for (const dx of [-9, 9]) {
        const x = gx + dx;
        const zz = z + s * 7;
        L.tube(C.steel, [x, 0, zz], [x, 6.4, zz], 0.06, 5);
        L.tube(C.steel, [x, 6.2, zz], [x + 1.1, 6.2, zz], 0.03, 4);
        signs.wall(cells[`bn${b % 4}`], x + 0.55, 6.15 - 1.65, zz, 0, s, 1.1, 3.3);
        signs.wall(cells[`bn${b % 4}`], x + 0.55, 6.15 - 1.65, zz - s * 0.01, 0, -s, 1.1, 3.3);
        b += 1;
      }
    }
  }
  for (const s of [-1, 1]) {
    const x = s * (OUTER.x + OUTER.t);
    L.box(C.red, x, OUTER.h - 1.2, -OUTER.z - OUTER.t, x + s * 0.12, OUTER.h, OUTER.z + OUTER.t, s > 0 ? 'x-' : 'x+');
    L.box(C.navy, x, 0, -OUTER.z - OUTER.t, x + s * 0.08, 0.9, OUTER.z + OUTER.t, s > 0 ? 'x-' : 'x+');
    signs.wall(cells.hazard, x + s * 0.03, TUNNEL.top + 0.3, 0, s, 0, TUNNEL.half * 2 + 0.6, 0.5);
    signs.wall(cells[s < 0 ? 'enter' : 'exit'], x + s * 0.03, TUNNEL.top + 1.6, 0, s, 0, 5, 1.55);
  }
}

/* The upper tier's rails: along the parapet and the top walkway. */
function drawRails(kit) {
  const UB = UPPER_BACK;
  const LB = LOWER_BACK;
  const y1 = FASCIA.top + 0.7;
  for (const s of [-1, 1]) {
    kit.cyl('dmSteel', [-LB.x, y1, s * (LB.z + 0.15)], [LB.x, y1, s * (LB.z + 0.15)], 0.04, 4);
    kit.cyl('dmSteel', [s * (LB.x + 0.15), y1, -LB.z], [s * (LB.x + 0.15), y1, LB.z], 0.04, 4);
    kit.cyl('dmSteel', [-UB.x, UPPER_TOP + 1.0, s * (UB.z + 0.3)], [UB.x, UPPER_TOP + 1.0, s * (UB.z + 0.3)], 0.04, 4);
    kit.cyl('dmSteel', [s * (UB.x + 0.3), UPPER_TOP + 1.0, -UB.z], [s * (UB.x + 0.3), UPPER_TOP + 1.0, UB.z], 0.04, 4);
  }
  void UPPER;
}

/* Everything above, into the kit. Returns what it drew, for stats(). */
export function drawDome(kit, layout, { low = false } = {}) {
  const lit = new Painter();
  const soft = new Painter();
  const glow = new Painter();
  const crowd = new Cards();
  const signs = new Cards();
  const led = new Cards();
  const cells = sheetCells();
  kit.begin(0, 0, 0, 0, 'extra');

  drawStands(lit, soft, crowd, layout.seats, low);
  drawRuts(soft, low);
  drawRamps(kit, layout);
  drawWrecks(lit);
  drawBarrier(soft, signs, cells);
  drawPortals(lit, signs, cells);
  drawRibbon(led, glow, cells);
  drawConcourse(lit, glow, signs, cells, low);
  drawRoof(kit, soft, glow, signs, cells);
  drawRig(kit, glow, signs, led, cells);
  drawOutside(lit, signs, cells);
  drawRails(kit);

  /* The materials, each one batch. */
  const litMat = cel({
    color: 0xffffff, vertexColors: true, bands: 3, tint: 0x6f6790, cache: false,
  });
  const softMat = cel({
    color: 0xffffff, vertexColors: true, bands: 3, tint: 0x6f6790, cache: false,
  });
  softMat.userData.propCast = false;
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  glowMat.name = 'domeGlow';
  glowMat.userData.propCast = false;
  glowMat.userData.propReceive = false;
  const crowdTex = new THREE.CanvasTexture(paintCrowd());
  crowdTex.colorSpace = THREE.SRGBColorSpace;
  crowdTex.wrapS = THREE.RepeatWrapping;
  crowdTex.anisotropy = 4;
  const crowdMat = cel({
    color: 0xffffff, map: crowdTex, alphaTest: 0.5, side: THREE.DoubleSide, bands: 3, tint: 0x6f6790, cache: false,
  });
  crowdMat.userData.propCast = false;
  const sheetTex = new THREE.CanvasTexture(paintSheet());
  sheetTex.colorSpace = THREE.SRGBColorSpace;
  sheetTex.anisotropy = 4;
  const signMat = paintMaterial(THREE, sheetTex);
  signMat.side = THREE.DoubleSide;
  signMat.userData.propCast = false;
  const ledMat = new THREE.MeshBasicMaterial({ map: sheetTex, alphaTest: 0.5 });
  ledMat.name = 'domeLed';
  ledMat.userData.propCast = false;
  ledMat.userData.propReceive = false;

  kit.begin(0, 0, 0, 0, 'extra');
  const tris = {};
  for (const [name, pnt, mat] of [['lit', lit, litMat], ['soft', soft, softMat], ['glow', glow, glowMat], ['crowd', crowd, crowdMat], ['signs', signs, signMat], ['led', led, ledMat]]) {
    tris[name] = Math.round(pnt.triangles);
    if (pnt.triangles > 0) {
      kit.add(mat, pnt.geometry());
    }
  }
  return {
    triangles: tris,
    textures: { crowd: [crowdTex.image.width, crowdTex.image.height], sheet: [SHEET_W, SHEET_H] },
    owned: { textures: [crowdTex, sheetTex], materials: [litMat, softMat, crowdMat, signMat, ledMat, glowMat] },
  };
}
