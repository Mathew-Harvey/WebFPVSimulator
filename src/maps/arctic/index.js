/*
 * index.js: Hyoura Island as a map, built the way Sunnyfield is
 * (../sunny/index.js): the built map's pipeline (../built/index.js) does the
 * sky, the ink, the comic layer's hatching, the shadows, the colliders, the
 * cull, the named gaps and the marks, in the town's look at golden hour. This
 * file hands it the island's document (./yard.js) and the island itself
 * (./plan.js) as one structure, draws what the parts cannot say (the land,
 * its cliffs, the sea and everything round), hangs the signs and names the
 * world.
 *
 * THE LAND is drawn from the same grid the plant stands on (./terrain.js):
 * every land cell two triangles split on the plant's diagonal, snow where it
 * is level enough to hold it and bare rock where it is not, and along the
 * edge of the land the basalt walls, cell edge by cell edge, so the cliff
 * drawn is the cliff's solid face. On Medium and High each wall carries its
 * columns, the joints of the basalt standing a hand's width proud with snow
 * on their heads, and every one of them inked by the ink pass: that is most
 * of what makes a cliff a drawing here rather than a slope. Low draws the
 * walls flat. Nothing of the columns is solid and none of them stands more
 * than 0.55 m off the wall, so the flight is the same on every preset.
 *
 * THE SEA is one plane at the plant's sea level, in the cel colours, so the
 * cliffs and the bergs throw their shadows on it.
 *
 * FOR THE LATENCY RULE: this file loads only when the island is chosen. On
 * the island, everything is baked into the built map's batches and merged
 * one batch a look per chunk (../sunny/palette.js), sixteen chunks; the
 * hamlet's small things are drawn near the camera only (NEAR_R) and not at
 * all on Low. Per frame the CPU adds one walk of the near cells, nothing
 * allocated, and the falls' texture offset. The plant's ground is a grid
 * read, two multiplies and an add (./terrain.js groundAt).
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

import * as THREE from 'three';
import { buildMap as buildBuilt } from '../built/index.js';
import { warmPrograms } from '../../render/warm.js';
import { qualityFor } from '../../render/quality.js';
import { paintMaterial } from '../../art/stf.js';
import { partnerAllowed } from '../../steam/edition.js';
import { mergePalette } from '../sunny/palette.js';
import { chunkOf, nearOf, rng } from './frame.js';
import {
  grid, noise, NX, NZ, CELL, GX0, GZ0, WALL_FOOT, QUAY_TOP, GROTTO, GROTTO_ROOF, isTopCell, isLandCell,
} from './terrain.js';
import { arcticLayout, arcticFloor, arcticMarkSpots, boardNotices } from './plan.js';
import { arcticDocument } from './yard.js';
import { QUAY } from './hamlet.js';
import { paintSigns, signMesh } from './signs.js';

/* The chunk a drawn thing is filed under, or its near cell if it is set
 * dressing. */
const cellOf = (thing, x, z) => (thing && thing.near ? nearOf(x, z) : chunkOf(x, z));

/* How near the dressing is drawn, by preset; Low draws none of it. */
const NEAR_R = { medium: 45, high: 60 };

/* How far the wall behind the basalt columns is set back from the cell's
 * edge, where the solid's face is, on Medium and High. */
const RECESS = 0.5;

/* The height of the k-th ledge of the cliff at (x, z): every 18 m or so,
 * wandering by seven, so the snow on the ledges lines up into bands along
 * the coast as it does on a real cliff of bedded basalt. */
function ledge(k, x, z) {
  return 12 + 18 * k + 7 * noise(x, z, 30, 50 + k);
}

/* A level-ish face is snow; steeper than this (the normal's y) is rock. */
const SNOW_NY = 0.66;

/* ---- the land ---- */

/*
 * The land's top: per chunk, a snow mesh with normals from the grid's own
 * slopes (so the cel bands run smooth over a hill) and a rock mesh shaded
 * flat (so a crag reads as facets the ink can find).
 */
function drawLand(kit) {
  const G = grid();
  const r1 = NX + 1;
  const H = (i, j) => G.h[Math.max(0, Math.min(NZ, j)) * r1 + Math.max(0, Math.min(NX, i))];
  const normalAt = (i, j) => {
    const nx = -(H(i + 1, j) - H(i - 1, j)) / (2 * CELL);
    const nz = -(H(i, j + 1) - H(i, j - 1)) / (2 * CELL);
    const l = Math.sqrt(nx * nx + 1 + nz * nz);
    return [nx / l, 1 / l, nz / l];
  };
  const bins = new Map();
  const bin = (chunk, m) => {
    const k = `${chunk}|${m}`;
    let b = bins.get(k);
    if (!b) {
      b = { chunk, m, pos: [], nor: [] };
      bins.set(k, b);
    }
    return b;
  };
  for (let j = 0; j < NZ; j += 1) {
    for (let i = 0; i < NX; i += 1) {
      if (!isTopCell(i, j)) {
        continue;
      }
      const x0 = GX0 + i * CELL;
      const z0 = GZ0 + j * CELL;
      const chunk = chunkOf(x0 + CELL / 2, z0 + CELL / 2);
      const a = [x0, H(i, j), z0];
      const b = [x0 + CELL, H(i + 1, j), z0];
      const c = [x0, H(i, j + 1), z0 + CELL];
      const d = [x0 + CELL, H(i + 1, j + 1), z0 + CELL];
      /* The plant's diagonal, a to d: triangles a d b and a c d, wound to
       * face up. */
      for (const [p, q, s, ip, iq, is] of [[a, d, b, [i, j], [i + 1, j + 1], [i + 1, j]], [a, c, d, [i, j], [i, j + 1], [i + 1, j + 1]]]) {
        const ux = q[0] - p[0];
        const uy = q[1] - p[1];
        const uz = q[2] - p[2];
        const vx = s[0] - p[0];
        const vy = s[1] - p[1];
        const vz = s[2] - p[2];
        let fx = uy * vz - uz * vy;
        let fy = uz * vx - ux * vz;
        let fz = ux * vy - uy * vx;
        const fl = Math.sqrt(fx * fx + fy * fy + fz * fz);
        fx /= fl;
        fy /= fl;
        fz /= fl;
        /* Snow where it is level enough to lie, and on the steep in the
         * gullies, streaks of it down a rock face as a mountain is drawn. */
        const snow = fy >= SNOW_NY
          || (fy >= 0.42 && noise((p[0] + q[0] + s[0]) / 3, (p[2] + q[2] + s[2]) / 3, 5, 77) > 0.5 - (fy - 0.42));
        const B = bin(chunk, snow ? (p[1] < 3.2 && q[1] < 3.2 && s[1] < 3.2 ? 'arSnowDirty' : 'arSnow') : 'arRock');
        B.pos.push(...p, ...q, ...s);
        if (snow) {
          B.nor.push(...normalAt(...ip), ...normalAt(...iq), ...normalAt(...is));
        } else {
          B.nor.push(fx, fy, fz, fx, fy, fz, fx, fy, fz);
        }
      }
    }
  }
  for (const b of bins.values()) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
    kit.begin(0, 0, 0, 0, b.chunk);
    kit.add(b.m, g);
  }
}

/* Whether a wall edge is the quay's or a breakwater's, which draw their own
 * face. */
function quayEdge(x, z) {
  return Math.abs(z - QUAY.z1) < 0.01 && x >= QUAY.x0 - 6.5 && x <= QUAY.x1 + 6.5;
}

/*
 * THE CLIFFS: a vertical wall on every edge of the land with no land
 * beyond it, from under the sea to the land's own edge, and on Medium and
 * High the basalt's columns in front of it. The grotto's walls and ceiling
 * too. Every wall is a quad of its own, faced outward.
 */
function drawCliffs(kit, low) {
  const G = grid();
  const r1 = NX + 1;
  const H = (i, j) => G.h[j * r1 + i];
  const r = rng(201);
  const bins = new Map();
  /* A wall quad from (p, y0p)-(q, y0q) up to (p, y1p)-(q, y1q). */
  const quad = (chunk, m, p, q, nx, nz, y0p, y0q, y1p, y1q) => {
    if (y1p <= y0p && y1q <= y0q) {
      return;
    }
    const k = `${chunk}|${m}`;
    let b = bins.get(k);
    if (!b) {
      b = { chunk, m, pos: [], nor: [] };
      bins.set(k, b);
    }
    const A = [p[0], y0p, p[1]];
    const B = [q[0], y0q, q[1]];
    const C = [q[0], y1q, q[1]];
    const D = [p[0], y1p, p[1]];
    /* Wound so its face looks along (nx, nz). */
    const cross = (q[0] - p[0]) * nz - (q[1] - p[1]) * nx;
    const tri = cross < 0 ? [A, C, B, A, D, C] : [A, B, C, A, C, D];
    for (const v of tri) {
      b.pos.push(...v);
      b.nor.push(nx, 0, nz);
    }
  };
  /* A wall from y0 to its top, basalt, with the snow lying on every ledge
   * as a white band. */
  const banded = (chunk, m, p, q, nx, nz, y0, hp, hq) => {
    let yp = y0;
    let yq = y0;
    for (let k = 0; ; k += 1) {
      const lp = ledge(k, p[0], p[1]);
      const lq = ledge(k, q[0], q[1]);
      if (lp > hp - 3 || lq > hq - 3) {
        break;
      }
      quad(chunk, m, p, q, nx, nz, yp, yq, lp, lq);
      quad(chunk, 'arSnow', p, q, nx, nz, lp, lq, lp + 1.2, lq + 1.2);
      yp = lp + 1.2;
      yq = lq + 1.2;
    }
    quad(chunk, m, p, q, nx, nz, yp, yq, hp, hq);
  };
  /* The four edges of cell (i, j): its two corners in order, the outward
   * normal and the neighbour across it. */
  const EDGES = [
    [0, 0, 1, 0, 0, -1, 0, -1],
    [1, 0, 1, 1, 1, 0, 1, 0],
    [1, 1, 0, 1, 0, 1, 0, 1],
    [0, 1, 0, 0, -1, 0, -1, 0],
  ];
  const grotto = (i, j) => i >= GROTTO.i0 && i <= GROTTO.i1 && j >= GROTTO.j0 && j <= GROTTO.j1;
  for (let j = 0; j < NZ; j += 1) {
    for (let i = 0; i < NX; i += 1) {
      if (!isTopCell(i, j)) {
        continue;
      }
      const inGrotto = grotto(i, j);
      for (const [ai, aj, bi, bj, nx, nz, di, dj] of EDGES) {
        const ni = i + di;
        const nj = j + dj;
        const p = [GX0 + (i + ai) * CELL, GZ0 + (j + aj) * CELL];
        const q = [GX0 + (i + bi) * CELL, GZ0 + (j + bj) * CELL];
        const hp = H(i + ai, j + aj);
        const hq = H(i + bi, j + bj);
        const mx = (p[0] + q[0]) / 2;
        const mz = (p[1] + q[1]) / 2;
        const chunk = chunkOf(mx, mz);
        /* A land cell beside the grotto: the grotto's side or back wall,
         * up to its roof. */
        if (!inGrotto && grotto(ni, nj)) {
          quad(chunk, 'arBasalt', p, q, nx, nz, WALL_FOOT, WALL_FOOT, GROTTO_ROOF, GROTTO_ROOF);
          continue;
        }
        if (isTopCell(ni, nj)) {
          continue;
        }
        if (quayEdge(mx, mz)) {
          continue;
        }
        const y0 = inGrotto ? GROTTO_ROOF : WALL_FOOT;
        const tall = Math.min(hp, hq);
        const columns = !low && !inGrotto && tall > 8;
        if (tall < 6) {
          quad(chunk, 'arShingle', p, q, nx, nz, y0, y0, hp, hq);
        } else if (columns) {
          /* Behind the columns, set back so no column stands proud of the
           * solid's face. */
          const ex = (q[0] - p[0]) / CELL * RECESS;
          const ez = (q[1] - p[1]) / CELL * RECESS;
          /* Run past each end by as much, so no corner shows a slot. */
          const pb = [p[0] - nx * RECESS - ex, p[1] - nz * RECESS - ez];
          const qb = [q[0] - nx * RECESS + ex, q[1] - nz * RECESS + ez];
          quad(chunk, 'arBasalt', pb, qb, nx, nz, y0, y0, hp, hq);
        } else {
          banded(chunk, 'arBasalt', p, q, nx, nz, y0, hp, hq);
        }
        /* The waterline's foam. */
        if (!inGrotto) {
          kit.begin(0, 0, 0, 0, chunk);
          const fx0 = Math.min(p[0], q[0]) + (nx < 0 ? -0.7 : 0);
          const fz0 = Math.min(p[1], q[1]) + (nz < 0 ? -0.7 : 0);
          const fx1 = Math.max(p[0], q[0]) + (nx > 0 ? 0.7 : 0);
          const fz1 = Math.max(p[1], q[1]) + (nz > 0 ? 0.7 : 0);
          kit.box('arFoam', fx0, -0.05, fz0, fx1, 0.1, fz1);
        }
        /* The columns: two to an edge, each in lifts that step back a
         * little at every ledge, with the snow lying on the step. The
         * outermost face is never past the cell's edge, where the solid's
         * face is. */
        if (columns) {
          kit.begin(0, 0, 0, 0, chunk);
          for (let c = 0; c < 2; c += 1) {
            const t0 = c / 2;
            const t1 = (c + 1) / 2;
            const ax = p[0] + (q[0] - p[0]) * t0;
            const az = p[1] + (q[1] - p[1]) * t0;
            const bx = p[0] + (q[0] - p[0]) * t1;
            const bz = p[1] + (q[1] - p[1]) * t1;
            const cx = (ax + bx) / 2;
            const cz = (az + bz) / 2;
            const top = tall - r.range(0.2, Math.min(3, tall * 0.2));
            const pale = r.chance(0.35) ? 'arBasaltPale' : 'arBasalt';
            /* How far in from the cell's edge the lowest lift's face is. */
            let back = r.range(0.02, 0.18);
            let y = WALL_FOOT;
            for (let k = 0; y < top; k += 1) {
              let yTop = ledge(k, cx, cz);
              const last = yTop > top - 3;
              if (last) {
                yTop = top;
              }
              /* The lift's footprint: the column's width along the edge,
               * and across it from the recessed wall to `back` inside the
               * cell's edge. */
              const span = (u0, u1, n) => (n !== 0
                ? [Math.min(u0 - n * RECESS, u0 - n * back), Math.max(u0 - n * RECESS, u0 - n * back)]
                : [Math.min(u0, u1) + 0.05, Math.max(u0, u1) - 0.05]);
              const [x0, x1] = span(ax, bx, nx);
              const [z0, z1] = span(az, bz, nz);
              kit.box(pale, x0, y, z0, x1, yTop, z1);
              kit.box('arSnow', x0, yTop, z0, x1, yTop + 0.9, z1);
              y = yTop + 0.9;
              back = Math.min(RECESS - 0.06, back + r.range(0.06, 0.14));
              if (last) {
                break;
              }
            }
          }
        }
      }
      /* The grotto's ceiling. */
      if (inGrotto) {
        const x0 = GX0 + i * CELL;
        const z0 = GZ0 + j * CELL;
        kit.begin(0, 0, 0, 0, chunkOf(x0, z0));
        const g = new THREE.PlaneGeometry(CELL, CELL);
        g.rotateX(Math.PI / 2);
        g.translate(x0 + CELL / 2, GROTTO_ROOF, z0 + CELL / 2);
        kit.add('arBasalt', g);
      }
    }
  }
  for (const b of bins.values()) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
    kit.begin(0, 0, 0, 0, b.chunk);
    kit.add(b.m, g);
  }
}

/* ---- what the parts cannot say ---- */

/* A level polygon's top and walls, faced outward. */
function polyGeometry(pts, y0, y1) {
  let area = 0;
  for (let k = 0; k < pts.length; k += 1) {
    const [ax, az] = pts[k];
    const [bx, bz] = pts[(k + 1) % pts.length];
    area += ax * bz - bx * az;
  }
  /* In x, z with y up, a positive shoelace runs clockwise seen from above. */
  const P = area > 0 ? pts : [...pts].reverse();
  const top = [];
  for (let k = 1; k + 1 < P.length; k += 1) {
    top.push(P[0][0], y1, P[0][1], P[k + 1][0], y1, P[k + 1][1], P[k][0], y1, P[k][1]);
  }
  const side = [];
  for (let k = 0; k < P.length; k += 1) {
    const [ax, az] = P[k];
    const [bx, bz] = P[(k + 1) % P.length];
    side.push(ax, y0, az, ax, y1, az, bx, y1, bz, ax, y0, az, bx, y1, bz, bx, y0, bz);
  }
  const make = (arr) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    g.computeVertexNormals();
    return g;
  };
  return { top: make(top), side: make(side) };
}

/* A cable's curve, hanging `sag` at its middle. */
const WIRE_SEGMENTS = 8;
function wireCurve(w) {
  const a = new THREE.Vector3(...w.a);
  const b = new THREE.Vector3(...w.b);
  const c = a.clone().add(b).multiplyScalar(0.5);
  c.y -= 2 * w.sag;
  return new THREE.QuadraticBezierCurve3(a, c, b);
}

const UNIT_BALL = new THREE.SphereGeometry(1, 10, 7);

function drawIsle(kit, I, low) {
  const skip = (t) => low && t.fine;
  for (const p of I.prisms) {
    if (skip(p)) {
      continue;
    }
    const mid = (p.e0 + p.e1) / 2;
    const am = p.profile.reduce((s, [a]) => s + a, 0) / p.profile.length;
    if (p.axis === 'x') {
      kit.begin(0, 0, 0, Math.PI / 2, cellOf(p, mid, am));
      kit.extrude(p.m, p.profile.map(([a, h]) => [-a, h]), p.e0, p.e1);
    } else {
      kit.begin(0, 0, 0, 0, cellOf(p, am, mid));
      kit.extrude(p.m, p.profile, p.e0, p.e1);
    }
  }
  for (const c of I.cyls) {
    if (skip(c)) {
      continue;
    }
    kit.begin(0, 0, 0, 0, cellOf(c, (c.a[0] + c.b[0]) / 2, (c.a[2] + c.b[2]) / 2));
    kit.cyl(c.m, c.a, c.b, c.r, c.seg, c.rTop);
  }
  for (const c of I.cones) {
    if (skip(c)) {
      continue;
    }
    kit.begin(0, 0, 0, 0, cellOf(c, c.x, c.z));
    if (c.h < 0) {
      const g = new THREE.ConeGeometry(c.r, -c.h, c.seg, 1);
      g.rotateX(Math.PI);
      g.translate(c.x, c.y + c.h / 2, c.z);
      kit.add(c.m, g);
    } else {
      kit.cone(c.m, [c.x, c.y, c.z], c.r, c.h, c.seg);
    }
  }
  const m4 = new THREE.Matrix4();
  for (const b of I.balls) {
    if (skip(b)) {
      continue;
    }
    kit.begin(0, 0, 0, 0, cellOf(b, b.x, b.z));
    m4.makeScale(b.r, b.r * b.sy, b.r).setPosition(b.x, b.y, b.z);
    kit.add(b.m, UNIT_BALL, m4.clone());
  }
  for (const p of I.polys) {
    if (skip(p)) {
      continue;
    }
    const cx = p.pts.reduce((s, q) => s + q[0], 0) / p.pts.length;
    const cz = p.pts.reduce((s, q) => s + q[1], 0) / p.pts.length;
    const g = polyGeometry(p.pts, p.y0, p.y1);
    kit.begin(0, 0, 0, 0, cellOf(p, cx, cz));
    kit.add(p.top, g.top);
    kit.add(p.side, g.side);
  }
  for (const rb of I.ribbons) {
    if (skip(rb)) {
      continue;
    }
    const pos = [];
    for (let k = 0; k + 1 < rb.left.length; k += 1) {
      const a = rb.left[k];
      const b = rb.right[k];
      const c = rb.right[k + 1];
      const d = rb.left[k + 1];
      pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    /* Faced up, whichever way the run was written. */
    const n = g.attributes.normal;
    if (rb.m !== 'arFall' && n.getY(0) < 0) {
      const arr = g.attributes.position.array;
      for (let t = 0; t < arr.length; t += 9) {
        for (let c = 0; c < 3; c += 1) {
          const s = arr[t + 3 + c];
          arr[t + 3 + c] = arr[t + 6 + c];
          arr[t + 6 + c] = s;
        }
      }
      g.computeVertexNormals();
    }
    const mid = rb.left[Math.floor(rb.left.length / 2)];
    kit.begin(0, 0, 0, 0, cellOf(rb, mid[0], mid[2]));
    kit.add(rb.m, g);
  }
  for (const w of I.wires) {
    const curve = wireCurve(w);
    const mid = curve.getPoint(0.5);
    kit.begin(0, 0, 0, 0, chunkOf(mid.x, mid.z));
    kit.add(w.m, new THREE.TubeGeometry(curve, WIRE_SEGMENTS, w.r, 3, false));
  }
  for (const a of I.assets) {
    kit.begin(a.x, a.y, a.z, a.yaw, chunkOf(a.x, a.z));
    kit.element(a.el);
  }
}

/* The wires again as lines, which are a pixel from any range. */
function wireLines(I) {
  const pts = [];
  for (const w of I.wires) {
    const p = wireCurve(w).getPoints(WIRE_SEGMENTS);
    for (let i = 0; i < WIRE_SEGMENTS; i += 1) {
      pts.push(p[i].x, p[i].y, p[i].z, p[i + 1].x, p[i + 1].y, p[i + 1].z);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.computeBoundingSphere();
  const lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x2c2a33 }));
  lines.name = 'arctic wire lines';
  return lines;
}

/* The sea: one plane, far past the fog, in the chunk of its own. */
function drawSea(kit) {
  const g = new THREE.PlaneGeometry(5000, 5000, 1, 1);
  g.rotateX(-Math.PI / 2);
  kit.begin(0, 0, 0, 0, 'sea');
  kit.add('arSea', g);
}

/* THE NEAR CULL, as Sunnyfield's: the near cells off past `r`. */
function nearCull(props, r) {
  const cells = [];
  const bb = new THREE.Box3();
  for (const g of props.children) {
    if (!g.name.startsWith('props:an')) {
      continue;
    }
    bb.makeEmpty();
    for (const m of g.children) {
      if (!m.geometry) {
        continue;
      }
      if (!m.geometry.boundingBox) {
        m.geometry.computeBoundingBox();
      }
      bb.union(m.geometry.boundingBox);
    }
    if (!bb.isEmpty()) {
      cells.push({ group: g, x0: bb.min.x, x1: bb.max.x, z0: bb.min.z, z1: bb.max.z, on: true });
    }
  }
  const r2 = r * r;
  return {
    to(eye) {
      for (let i = 0; i < cells.length; i += 1) {
        const c = cells[i];
        const dx = Math.max(0, c.x0 - eye.x, eye.x - c.x1);
        const dz = Math.max(0, c.z0 - eye.z, eye.z - c.z1);
        c.on = dx * dx + dz * dz <= r2;
        c.group.visible = c.on;
      }
    },
    stats: () => ({ cells: cells.length, on: cells.filter((c) => c.on).length, radius: r }),
  };
}

export async function buildMap(shell, onProgress, options) {
  const qid = qualityFor(options && options.quality).id;
  const low = qid === 'low';
  const { parts, I, stats: layoutStats } = arcticLayout();
  const extra = {
    el: { id: 'arctic', type: 'arctic' },
    /* On Low the fine parts are left out of what is drawn; none is solid. */
    parts: low ? parts.filter((p) => !(p.fine && !p.solid)) : parts,
    draw: (kit) => {
      drawLand(kit);
      drawCliffs(kit, low);
      drawSea(kit);
      drawIsle(kit, I, low);
    },
    floor: arcticFloor,
    /* The start pads stand on the quay's top. */
    padBase: QUAY_TOP,
    chunkOf: (x, z, p) => cellOf(p, x, z),
  };
  const doc = arcticDocument();
  const spots = arcticMarkSpots(partnerAllowed);
  const map = await buildBuilt(shell, onProgress, {
    ...(options || {}), document: doc, extra, sponsorMarks: false, markSpots: spots,
  });
  map.id = 'arctic';
  map.source = 'arctic';
  /* The yard's own ground, kerb and verge are the sea and the land here. */
  for (const name of ['plot', 'kerb', 'verge', 'terrain', 'ruts']) {
    const m = map.scene.getObjectByName(name);
    if (m) {
      m.visible = false;
    }
  }
  const props = map.scene.getObjectByName('props');
  /* The dressing casts no shadow, as Sunnyfield's does not. */
  if (props) {
    for (const g of props.children) {
      if (!g.name.startsWith('props:an')) {
        continue;
      }
      for (const m of [...g.children]) {
        if (m.userData.shadowProxy) {
          g.remove(m);
          m.geometry.dispose();
        }
      }
    }
  }
  const palette = props ? mergePalette(props) : { from: 0, to: 0 };
  const stats = map.stats;
  const near = props && !low ? nearCull(props, NEAR_R[qid] || NEAR_R.high) : null;
  if (near) {
    const focus = map.updateShadowFocus;
    map.updateShadowFocus = (target) => {
      focus(target);
      near.to(shell.camera.position);
    };
    near.to(shell.camera.position);
  }
  map.stats = () => ({ ...(stats ? stats() : {}), palette, near: near ? near.stats() : null, island: layoutStats });
  /* The signs, one mesh on one picture. */
  const signs = [...I.signs, ...boardNotices(spots.filter((m) => !m.key).length)];
  const atlas = paintSigns(signs);
  const tex = new THREE.CanvasTexture(atlas.canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  map.scene.add(signMesh(THREE, signs, atlas, paintMaterial(THREE, tex)));
  map.scene.add(wireLines(I));
  await warmPrograms(shell.renderer, map.scene, shell.camera, map.post.rtScene);
  return map;
}

/* For the check: whether a land cell is solid ground for the plant. */
export { isLandCell };
