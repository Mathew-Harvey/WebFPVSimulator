/*
 * track.js: the Ryusei coaster's track, drawn: two red rails, the cream
 * spine under them, the ties that join them, and the teal columns, arms
 * and footings that hold it up. Smooth tubes swept along the line's own
 * frames (./coaster.js coasterLine), so the rails roll with the bank and
 * never twist, cut into one run a chunk so the kit files each piece where
 * it stands and the cull drops what is behind the camera. The solids are
 * ./coaster.js coasterParts', a capsule chain within a few centimetres of
 * these tubes.
 *
 * WHAT IT COSTS. The tubes are about thirty thousand triangles for 820 m of
 * track, the ties and columns a few thousand more, and none of it is a draw
 * of its own: each colour joins its chunk's batch and the palette merge
 * (../sunny/palette.js) folds those into one a chunk.
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
import { W, D, chunkOf } from './frame.js';
import {
  coasterLine, supports, GAUGE, RAIL_R, SPINE_DOWN, SPINE_R,
} from './coaster.js';

const wx = (px) => px - W / 2;
const wz = (py) => D / 2 - py;

/* How often a ring of the tubes is laid, in samples (half a metre each),
 * and how often a tie. */
const RING_EVERY = 2;
const TIE_EVERY = 3;

/*
 * A tube along samples i0..i1 (inclusive, by `every`), its centre the line
 * offset by `side` along the left and `down` along the up, radius r,
 * n round. World frame, indexed, with normals and a blank uv so it joins
 * the kit's batches.
 */
function tube(L, idx, side, down, r, n) {
  const pos = [];
  const nor = [];
  const ind = [];
  for (const i of idx) {
    const o = 3 * i;
    const cx = L.p[o] + L.l[o] * side - L.u[o] * down;
    const cy = L.p[o + 1] + L.l[o + 1] * side - L.u[o + 1] * down;
    const ch = L.p[o + 2] + L.l[o + 2] * side - L.u[o + 2] * down;
    for (let k = 0; k < n; k += 1) {
      const a = (2 * Math.PI * k) / n;
      const c = Math.cos(a);
      const s = Math.sin(a);
      /* Round the tangent, from the up and the left, plan to world. */
      const dx = L.u[o] * c + L.l[o] * s;
      const dy = L.u[o + 1] * c + L.l[o + 1] * s;
      const dh = L.u[o + 2] * c + L.l[o + 2] * s;
      pos.push(wx(cx) + dx * r, ch + dh * r, wz(cy) - dy * r);
      nor.push(dx, dh, -dy);
    }
  }
  const rings = idx.length;
  for (let j = 0; j + 1 < rings; j += 1) {
    for (let k = 0; k < n; k += 1) {
      const a = j * n + k;
      const b = j * n + ((k + 1) % n);
      const c = (j + 1) * n + k;
      const d = (j + 1) * n + ((k + 1) % n);
      ind.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  g.setIndex(ind);
  return g;
}

/*
 * The ties of a run, each a flat bar across under the rails and a web down
 * to the spine, as boxes in the line's frame.
 */
function ties(L, idx) {
  const pos = [];
  const nor = [];
  const ind = [];
  /* A box from its centre (world) and three half axes (world). */
  const box = (c, a, b, e) => {
    const faces = [[a, b, e], [a, e, b], [b, e, a]];
    for (const [n, u, v] of faces) {
      for (const sgn of [-1, 1]) {
        const base = pos.length / 3;
        for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
          pos.push(
            c[0] + n[0] * sgn + u[0] * su + v[0] * sv,
            c[1] + n[1] * sgn + u[1] * su + v[1] * sv,
            c[2] + n[2] * sgn + u[2] * su + v[2] * sv,
          );
          const ln = Math.hypot(n[0], n[1], n[2]) || 1;
          nor.push((n[0] * sgn) / ln, (n[1] * sgn) / ln, (n[2] * sgn) / ln);
        }
        /* Wound outward whichever way u x v points. */
        const ux = u[1] * v[2] - u[2] * v[1];
        const uy = u[2] * v[0] - u[0] * v[2];
        const uz = u[0] * v[1] - u[1] * v[0];
        const out = (ux * n[0] + uy * n[1] + uz * n[2]) * sgn > 0;
        if (out) {
          ind.push(base, base + 1, base + 2, base, base + 2, base + 3);
        } else {
          ind.push(base, base + 2, base + 1, base, base + 3, base + 2);
        }
      }
    }
  };
  const w = (o, v, k) => [v[o] * k, v[o + 2] * k, -v[o + 1] * k];
  for (const i of idx) {
    const o = 3 * i;
    const at = (side, down) => [
      wx(L.p[o] + L.l[o] * side - L.u[o] * down),
      L.p[o + 2] + L.l[o + 2] * side - L.u[o + 2] * down,
      wz(L.p[o + 1] + L.l[o + 1] * side - L.u[o + 1] * down),
    ];
    /* The bar, under the rails, from rail to rail. */
    box(at(0, RAIL_R + 0.06), w(o, L.l, GAUGE + 0.06), w(o, L.u, 0.06), w(o, L.t, 0.09));
    /* The web, from the bar down into the spine. */
    box(at(0, (RAIL_R + SPINE_DOWN) / 2), w(o, L.l, 0.07), w(o, L.u, (SPINE_DOWN - RAIL_R) / 2), w(o, L.t, 0.07));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  g.setIndex(ind);
  return g;
}

/* The samples cut into runs by the chunk each stands in, each run taking
 * the next run's first sample so the tubes meet. */
function runs(L) {
  const out = [];
  let cur = null;
  for (let i = 0; i < L.n; i += RING_EVERY) {
    const ch = chunkOf(wx(L.p[3 * i]), wz(L.p[3 * i + 1]));
    if (!cur || cur.chunk !== ch) {
      if (cur) {
        cur.idx.push(i);
      }
      cur = { chunk: ch, idx: [] };
      out.push(cur);
    }
    cur.idx.push(i);
  }
  /* The lap closes: the last run ends on the first sample. */
  cur.idx.push(L.n - 1);
  return out;
}

/* The track into the kit, `low` with fewer sides to each tube. */
export function drawTrack(kit, low) {
  const L = coasterLine();
  const railN = low ? 5 : 6;
  const spineN = low ? 7 : 10;
  for (const run of runs(L)) {
    kit.begin(0, 0, 0, 0, run.chunk);
    kit.add('ymCoasterRail', tube(L, run.idx, GAUGE, 0, RAIL_R, railN));
    kit.add('ymCoasterRail', tube(L, run.idx, -GAUGE, 0, RAIL_R, railN));
    kit.add('ymCoasterSpine', tube(L, run.idx, 0, SPINE_DOWN, SPINE_R, spineN));
    const tieIdx = run.idx.filter((i) => i % (RING_EVERY * TIE_EVERY) === 0 && i < L.n - 1);
    if (tieIdx.length) {
      kit.add('ymCoasterSpine', ties(L, tieIdx));
    }
  }
  /* The columns, their footings and the arms of the outriggers. */
  for (const c of supports()) {
    const x = wx(c.px);
    const z = wz(c.py);
    kit.begin(0, 0, 0, 0, chunkOf(x, z));
    kit.cyl('ymCoasterLeg', [x, 0, z], [x, c.top, z], c.r, low ? 6 : 8);
    kit.cyl('ymConcrete', [x, 0, z], [x, 0.35, z], c.r + 0.35, low ? 6 : 8);
    if (c.arm) {
      const ax = wx(c.arm[0]);
      const az = wz(c.arm[1]);
      kit.cyl('ymCoasterLeg', [x, c.top, z], [ax, c.arm[2], az], c.r * 0.8, low ? 5 : 6);
      kit.cyl('ymCoasterLeg', [ax, c.arm[2] - 0.2, az], [ax, c.arm[2] + 0.2, az], c.r + 0.06, low ? 5 : 6);
    } else if (!c.leg) {
      /* The saddle the spine sits in. */
      kit.cyl('ymCoasterLeg', [x, c.top - 0.25, z], [x, c.top + SPINE_R * 0.6, z], c.r + 0.08, low ? 5 : 6);
    }
  }
}
