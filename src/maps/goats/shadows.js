/*
 * shadows.js: the street's shadows cut into squares, so the sun's pass
 * draws the squares round the whoop and not the whole neighbourhood.
 *
 * WHY. A built map gives each chunk one shadow caster, its props again as
 * positions only (proxyCasters in ../built/index.js), and lets the chunk's
 * cull decide when it is drawn. That is right for a map whose chunks are
 * 48 metres across. Here the whole neighbourhood is three chunks (the
 * house's, its trees and its cars; see WHY ONE CHUNK in ./hood.js), each as
 * big as the map, so nothing is ever culled, and the shadow pass drew every
 * caster on the street every frame: half a million triangles on High, for
 * a sun whose box is 160 metres across round the whoop on a street nearly
 * 900 across. Measured on the first build, 517,000 of the frame's 1.13
 * million triangles were that pass.
 *
 * WHAT. The three chunks' casters are cut into CELL squares, and each
 * square is shown to the shadow pass only on a frame whose sun box overlaps
 * it. The squares are cut in the sun's own frame, across its beam, not on
 * the ground: the sun's box is a square in that frame, so the test is two
 * overlaps of two intervals and is exact, where three's own cull tests a
 * sphere round each square and let in twice as many. A triangle across a
 * square's edge is clipped in two, so no square's triangles reach outside
 * it and nothing has to be drawn always. What is drawn on the colour pass
 * does not change at all: a caster is never drawn there (shadowOnly in
 * ../../render/shadowrate.js). A triangle flat on the ground (every corner
 * under LOW, paint and paving) casts nothing anything can see, since the
 * ground under it is as high, and is left out.
 *
 * FOR THE LATENCY RULE. The shadow pass draws the one to four squares the
 * sun's box touches where it drew the chunks' three or four casters, and
 * their triangles are the share of the street inside them. The colour pass
 * is the same. Cut once when the map is built, about as long as the build's
 * own proxies took; per frame, one overlap test a square after the sun's box
 * moves, about forty.
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
import { shadowOnly } from '../../render/shadowrate.js';

/* A square's side, metres across the sun's beam: a little more than the
 * sun's box (SHADOW_HALF_MAX in ../built/index.js is its half), so the box
 * touches two squares along each side and never three. */
const CELL = 200;

/* A triangle no corner of which is this high, world metres, is paint on
 * the ground and casts nothing. */
const LOW = 0.2;

/*
 * Cut the casters of the chunks named `chunks` (their group names, as
 * 'props:extra') in `scene` into squares. Returns { stats, aim }: stats is
 * { from, to, triangles, dropped, clipped } for the map's stats, and aim()
 * shows the squares the sun's box overlaps and hides the rest, called each
 * time the box has moved.
 */
export function cellShadows(scene, chunks) {
  const groups = chunks.map((n) => scene.getObjectByName(n)).filter(Boolean);
  const stats = { from: 0, to: 0, triangles: 0, dropped: 0, clipped: 0 };
  let sun = null;
  scene.traverse((o) => {
    if (o.isDirectionalLight && o.castShadow && !sun) {
      sun = o;
    }
  });
  if (!groups.length || !sun) {
    return { stats, aim: () => {} };
  }
  const home = groups[0];
  /* The sun's frame as three builds its shadow camera (lookAt from the
   * light to its target): Z back up the beam, X and Y across it. The sun
   * keeps one direction for the map's life, only its target moves. */
  const Z = sun.position.clone().sub(sun.target.position).normalize();
  const X = new THREE.Vector3().crossVectors(sun.shadow.camera.up, Z);
  if (X.lengthSq() < 1e-9) {
    X.set(1, 0, 0);
  }
  X.normalize();
  const Y = new THREE.Vector3().crossVectors(Z, X);
  const ux = X.x;
  const uy = X.y;
  const uz = X.z;
  const vx = Y.x;
  const vy = Y.y;
  const vz = Y.z;

  /* By material, which holds the side and is the switch the map flips on
   * a frame that draws no shadow: the same object, so that still works. */
  const byMat = new Map();
  for (const g of groups) {
    for (const m of g.children.slice()) {
      if (!m.userData.shadowProxy || !m.geometry || !m.geometry.attributes.position) {
        continue;
      }
      let list = byMat.get(m.material);
      if (!list) {
        list = [];
        byMat.set(m.material, list);
      }
      list.push(m.geometry);
      g.remove(m);
      stats.from += 1;
    }
  }
  const cells = [];
  for (const [mat, geos] of byMat) {
    /* Each square's triangles, as corners into its own positions: a
     * corner shared inside a square stays shared. */
    const squares = new Map();
    const square = (i, j) => {
      const key = `${i},${j}`;
      let s = squares.get(key);
      if (!s) {
        s = { i, j, pos: [], index: [] };
        squares.set(key, s);
      }
      return s;
    };
    for (const geo of geos) {
      const p = geo.attributes.position.array;
      const count = p.length / 3;
      const idx = geo.index ? geo.index.array : null;
      const n = idx ? idx.length : count;
      const corner = (t) => (idx ? idx[t] : t);
      /* Every corner's place across the beam, in squares. */
      const cu = new Float64Array(count);
      const cv = new Float64Array(count);
      for (let k = 0; k < count; k += 1) {
        const x = p[3 * k];
        const y = p[3 * k + 1];
        const z = p[3 * k + 2];
        cu[k] = (ux * x + uy * y + uz * z) / CELL;
        cv[k] = (vx * x + vy * y + vz * z) / CELL;
      }
      /* Which square each triangle is in: -1 for none, -2 for across an
       * edge, clipped below. */
      const where = new Int32Array(n / 3).fill(-1);
      const keys = [];
      const keyOf = new Map();
      const across = [];
      for (let t = 0; t < n; t += 3) {
        const a = corner(t);
        const b = corner(t + 1);
        const c = corner(t + 2);
        if (p[3 * a + 1] < LOW && p[3 * b + 1] < LOW && p[3 * c + 1] < LOW) {
          stats.dropped += 1;
          continue;
        }
        const i0 = Math.floor(Math.min(cu[a], cu[b], cu[c]));
        const i1 = Math.floor(Math.max(cu[a], cu[b], cu[c]));
        const j0 = Math.floor(Math.min(cv[a], cv[b], cv[c]));
        const j1 = Math.floor(Math.max(cv[a], cv[b], cv[c]));
        if (i0 !== i1 || j0 !== j1) {
          where[t / 3] = -2;
          across.push(t);
          continue;
        }
        const key = `${i0},${j0}`;
        let k = keyOf.get(key);
        if (k === undefined) {
          k = keys.length;
          keys.push(square(i0, j0));
          keyOf.set(key, k);
        }
        where[t / 3] = k;
      }
      /* One square at a time, with one map from this geometry's corners
       * to the square's, put back after each. */
      const local = new Int32Array(count).fill(-1);
      keys.forEach((s, k) => {
        const used = [];
        for (let t = 0; t < n; t += 3) {
          if (where[t / 3] !== k) {
            continue;
          }
          for (let j = 0; j < 3; j += 1) {
            const v = corner(t + j);
            if (local[v] < 0) {
              local[v] = s.pos.length / 3;
              s.pos.push(p[3 * v], p[3 * v + 1], p[3 * v + 2]);
              used.push(v);
            }
            s.index.push(local[v]);
          }
        }
        for (const v of used) {
          local[v] = -1;
        }
      });
      /* A triangle across an edge, clipped to each square it crosses and
       * laid in each as a fan of its own corners. */
      for (const t of across) {
        const poly = [0, 1, 2].map((j) => {
          const v = corner(t + j);
          return [p[3 * v], p[3 * v + 1], p[3 * v + 2], cu[v], cv[v]];
        });
        const i0 = Math.floor(Math.min(poly[0][3], poly[1][3], poly[2][3]));
        const i1 = Math.floor(Math.max(poly[0][3], poly[1][3], poly[2][3]));
        const j0 = Math.floor(Math.min(poly[0][4], poly[1][4], poly[2][4]));
        const j1 = Math.floor(Math.max(poly[0][4], poly[1][4], poly[2][4]));
        stats.clipped += 1;
        for (let i = i0; i <= i1; i += 1) {
          for (let j = j0; j <= j1; j += 1) {
            let q = clip(poly, 3, i, 1);
            q = clip(q, 3, i + 1, -1);
            q = clip(q, 4, j, 1);
            q = clip(q, 4, j + 1, -1);
            if (q.length < 3) {
              continue;
            }
            const s = square(i, j);
            const base = s.pos.length / 3;
            for (const c of q) {
              s.pos.push(c[0], c[1], c[2]);
            }
            for (let k = 1; k + 1 < q.length; k += 1) {
              s.index.push(base, base + k, base + k + 1);
            }
          }
        }
      }
      geo.dispose();
    }
    for (const s of squares.values()) {
      if (!s.index.length) {
        continue;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(s.pos), 3));
      const verts = s.pos.length / 3;
      g.setIndex(new THREE.BufferAttribute(verts > 65535 ? new Uint32Array(s.index) : new Uint16Array(s.index), 1));
      g.computeBoundingSphere();
      const proxy = new THREE.Mesh(g, mat);
      proxy.name = 'shadow cell';
      proxy.castShadow = true;
      proxy.receiveShadow = false;
      proxy.matrixAutoUpdate = false;
      proxy.userData.shadowProxy = true;
      proxy.raycast = () => {};
      shadowOnly(proxy);
      home.add(proxy);
      cells.push({ mesh: proxy, u0: s.i * CELL, u1: (s.i + 1) * CELL, v0: s.j * CELL, v1: (s.j + 1) * CELL });
      stats.to += 1;
      stats.triangles += s.index.length / 3;
    }
  }

  /* The sun's box across its beam is the shadow camera's square round the
   * target; a square is drawn when the two overlap, with a metre to spare.
   * Should anything ever turn the sun, the squares were cut in a frame that
   * is no longer its own, and every one is drawn, as before the cut. */
  const cam = sun.shadow.camera;
  const now = new THREE.Vector3();
  function aim() {
    const t = sun.target.position;
    now.copy(sun.position).sub(t).normalize();
    if (now.dot(Z) < 0.99999) {
      for (let k = 0; k < cells.length; k += 1) {
        cells[k].mesh.visible = true;
      }
      return;
    }
    const tu = ux * t.x + uy * t.y + uz * t.z;
    const tv = vx * t.x + vy * t.y + vz * t.z;
    const hu = Math.max(cam.right, -cam.left) + 1;
    const hv = Math.max(cam.top, -cam.bottom) + 1;
    for (let k = 0; k < cells.length; k += 1) {
      const c = cells[k];
      const on = c.u1 > tu - hu && c.u0 < tu + hu && c.v1 > tv - hv && c.v0 < tv + hv;
      if (c.mesh.visible !== on) {
        c.mesh.visible = on;
      }
    }
  }
  aim();
  return { stats, aim };
}

/*
 * The part of polygon `poly` (corners [x, y, z, u, v], u and v in squares)
 * on one side of the line where coordinate `at` (3 for u, 4 for v) is
 * `edge`: the side above it for `sign` 1, below for -1.
 */
function clip(poly, at, edge, sign) {
  const out = [];
  for (let k = 0; k < poly.length; k += 1) {
    const a = poly[k];
    const b = poly[(k + 1) % poly.length];
    const da = sign * (a[at] - edge);
    const db = sign * (b[at] - edge);
    if (da >= 0) {
      out.push(a);
    }
    if ((da >= 0) !== (db >= 0)) {
      const f = da / (da - db);
      out.push(a.map((x, i) => x + f * (b[i] - x)));
    }
  }
  return out;
}
