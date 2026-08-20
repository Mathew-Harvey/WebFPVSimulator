/*
 * drawn.js: what the town actually draws, as boxes the collider fit can read.
 *
 * WHY THIS IS NOT JUST A BOUNDING BOX PER MESH, WHICH IS WHAT IT USED TO BE.
 * The fit in ./index.js hugs a rectangle onto the geometry standing in it,
 * and it can only ever be as tight as its picture of that geometry. Given one
 * axis aligned box per mesh, a pitched roof is a solid block up to its ridge:
 * the box says the drawing reaches the ridge everywhere over the house, when
 * in truth it reaches the ridge along one line and the eaves at the edges.
 * Measured across the town that single approximation was most of what was
 * left after the slab fit landed: the worst offenders were all 7 to 10 m
 * square boxes over houses, with the drawing reaching the top of the box over
 * 4 to 20 percent of the footprint and four to seven metres of nothing above
 * the rest of it. That wedge over the roof slope is exactly where a freestyle
 * pilot flies, and it read as an invisible wall.
 *
 * SO A MESH WORTH SUBDIVIDING IS RASTERISED FROM ITS TRIANGLES. Its footprint
 * is cut into cells and each triangle writes the height of its own PLANE at
 * the corners of every cell it covers, clamped to the triangle's own extent.
 * A roof slope is planar, so the plane is exact for it, and the result is a
 * staircase that follows the slope to within one cell. What comes out is one
 * box per occupied cell instead of one box for the mesh.
 *
 * AND IT IS BOUNDED, BECAUSE THE TOWN IS 104,000 MESHES. Only a mesh with a
 * footprint and a height worth the trouble is subdivided, only up to a cap on
 * its triangle count, into at most a cap on its cells, and only if the result
 * is actually tighter than the box it replaces. A blossom blob, a fence post
 * and a window frame all fail the first test and cost nothing. Everything the
 * subdivision produces is a HULL over the triangles it came from, so the
 * solid world can never end up inside the picture.
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

/* A mesh smaller than this in plan is its own bounding box for every purpose
 * the fit has: nothing about a 1 m2 object is a slope a quad can use. */
const SUBDIV_MIN_AREA = 6;
/* And a flat thing has no wedge over it to remove. */
const SUBDIV_MIN_HEIGHT = 0.4;
/*
 * The raster cell, and it is a compromise measured rather than chosen. At
 * 0.5 m the town's drawn picture is 1.09 million boxes, which is ten times
 * the mesh count and a hundred megabytes of build time objects for a wedge
 * over a roof that is two or three metres deep. At 1 m it is a quarter of
 * that and the staircase still follows a roof slope to within one course of
 * tiles, which is finer than anything the fit does with it.
 */
const SUBDIV_CELL = 1;
/*
 * Caps, and the first one was set far too low to begin with.
 *
 * At 24,000 triangles every baked GROUP mesh fell through: the town bakes a
 * grove's trunks into one cedarWood mesh and its blossom into one
 * groveCanopy, and those are the meshes whose bounding box is most nearly
 * meaningless, a 16 by 21 m block over a stand of trees that is nine tenths
 * air. Both the fit and the scan then had nothing but that block to reason
 * about, so a tree canopy collider looked like a five metre invisible slab
 * floating eighteen metres up and a whole grove looked like scenery a quad
 * flies through. Raised until they are all inside it; the whole town's
 * triangles are walked once, at build, and it costs about a second.
 */
const SUBDIV_MAX_TRIS = 250000;
const SUBDIV_MAX_CELLS = 400;
/*
 * And the other end: a cell this big answers no question worth asking. A
 * terrain tile spans the town, so cutting it into 400 cells makes each one
 * eighty metres across and its height the top of whatever hill it contains,
 * which is a worse answer than the bounding box it replaced. A mesh that
 * cannot be cut finer than this keeps its box and is dropped by the callers
 * that care.
 */
const SUBDIV_MAX_CELL_SIZE = 2.5;
/* And the subdivision has to earn its keep: if the staircase is within this
 * much of the bounding box's own volume, the box is kept and the cells are
 * thrown away. A cube gains nothing from being cut into cubes. */
const SUBDIV_GAIN = 0.7;

const tmpBox = new THREE.Box3();
const tmpInst = new THREE.Matrix4();
const tmpWorld = new THREE.Matrix4();
const va = new THREE.Vector3();
const vb = new THREE.Vector3();
const vc = new THREE.Vector3();

/*
 * One mesh under one world matrix, rasterised into a height field.
 *
 * Pushes one box per occupied cell into `out` and returns true, or returns
 * false when the mesh is not worth subdividing and the caller should push its
 * bounding box instead.
 */
function subdivide(geometry, matrix, box, name, out) {
  const pos = geometry.getAttribute('position');
  if (!pos) {
    return false;
  }
  const index = geometry.getIndex();
  const triCount = (index ? index.count : pos.count) / 3;
  if (!(triCount >= 2) || triCount > SUBDIV_MAX_TRIS) {
    return false;
  }
  const sx = box.max.x - box.min.x;
  const sz = box.max.z - box.min.z;
  const sy = box.max.y - box.min.y;
  if (sx * sz < SUBDIV_MIN_AREA || sy < SUBDIV_MIN_HEIGHT) {
    return false;
  }
  let nx = Math.max(1, Math.ceil(sx / SUBDIV_CELL));
  let nz = Math.max(1, Math.ceil(sz / SUBDIV_CELL));
  while (nx * nz > SUBDIV_MAX_CELLS) {
    nx = Math.max(1, nx >> 1);
    nz = Math.max(1, nz >> 1);
  }
  if (nx * nz < 2) {
    return false;
  }
  const dx = sx / nx;
  const dz = sz / nz;
  if (dx > SUBDIV_MAX_CELL_SIZE || dz > SUBDIV_MAX_CELL_SIZE) {
    return false;
  }
  const n = nx * nz;
  const lo = new Float64Array(n).fill(Infinity);
  const hi = new Float64Array(n).fill(-Infinity);

  const readVert = (i, v) => {
    v.fromBufferAttribute(pos, i).applyMatrix4(matrix);
  };
  for (let t = 0; t < triCount; t += 1) {
    const i0 = index ? index.getX(t * 3) : t * 3;
    const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
    const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;
    readVert(i0, va);
    readVert(i1, vb);
    readVert(i2, vc);
    const tx0 = Math.min(va.x, vb.x, vc.x);
    const tx1 = Math.max(va.x, vb.x, vc.x);
    const tz0 = Math.min(va.z, vb.z, vc.z);
    const tz1 = Math.max(va.z, vb.z, vc.z);
    const ty0 = Math.min(va.y, vb.y, vc.y);
    const ty1 = Math.max(va.y, vb.y, vc.y);
    let a0 = Math.floor((tx0 - box.min.x) / dx);
    let a1 = Math.floor((tx1 - box.min.x) / dx);
    let b0 = Math.floor((tz0 - box.min.z) / dz);
    let b1 = Math.floor((tz1 - box.min.z) / dz);
    if (a0 < 0) { a0 = 0; }
    if (b0 < 0) { b0 = 0; }
    if (a1 > nx - 1) { a1 = nx - 1; }
    if (b1 > nz - 1) { b1 = nz - 1; }
    /*
     * The triangle's plane, so a slope is followed rather than boxed. ny is
     * the y component of the un-normalised normal; when it is tiny the
     * triangle stands on edge and has no single height over a cell, so the
     * whole triangle's y range is used instead, which is that triangle's own
     * bounding box and is still a hull.
     */
    const e1x = vb.x - va.x;
    const e1y = vb.y - va.y;
    const e1z = vb.z - va.z;
    const e2x = vc.x - va.x;
    const e2y = vc.y - va.y;
    const e2z = vc.z - va.z;
    const nX = e1y * e2z - e1z * e2y;
    const nY = e1z * e2x - e1x * e2z;
    const nZ = e1x * e2y - e1y * e2x;
    const planar = Math.abs(nY) > 1e-6 * (Math.abs(nX) + Math.abs(nZ) + 1e-9);
    for (let a = a0; a <= a1; a += 1) {
      const cx0 = box.min.x + a * dx;
      const cx1 = cx0 + dx;
      for (let b = b0; b <= b1; b += 1) {
        const cz0 = box.min.z + b * dz;
        const cz1 = cz0 + dz;
        let y0 = ty0;
        let y1 = ty1;
        if (planar) {
          /* y on the plane at the four corners of the cell, clamped into the
           * triangle's own range so a cell outside the triangle but inside
           * its bounding box cannot invent height. */
          let mn = Infinity;
          let mx = -Infinity;
          for (let q = 0; q < 4; q += 1) {
            const px = q < 2 ? cx0 : cx1;
            const pz = (q & 1) === 0 ? cz0 : cz1;
            const y = va.y - (nX * (px - va.x) + nZ * (pz - va.z)) / nY;
            if (y < mn) { mn = y; }
            if (y > mx) { mx = y; }
          }
          y0 = mn < ty0 ? ty0 : mn;
          y1 = mx > ty1 ? ty1 : mx;
          if (y1 < y0) {
            y0 = ty0;
            y1 = ty1;
          }
        }
        const k = a * nz + b;
        if (y0 < lo[k]) { lo[k] = y0; }
        if (y1 > hi[k]) { hi[k] = y1; }
      }
    }
  }

  let vol = 0;
  let occupied = 0;
  for (let k = 0; k < n; k += 1) {
    if (hi[k] === -Infinity) {
      continue;
    }
    occupied += 1;
    vol += (hi[k] - lo[k]) * dx * dz;
  }
  if (occupied === 0 || vol > sx * sy * sz * SUBDIV_GAIN) {
    return false;
  }
  for (let a = 0; a < nx; a += 1) {
    for (let b = 0; b < nz; b += 1) {
      const k = a * nz + b;
      if (hi[k] === -Infinity) {
        continue;
      }
      out.push({
        x0: box.min.x + a * dx,
        y0: lo[k],
        z0: box.min.z + b * dz,
        x1: box.min.x + (a + 1) * dx,
        y1: hi[k],
        z1: box.min.z + (b + 1) * dz,
        name,
      });
    }
  }
  return true;
}

/*
 * Every drawn mesh in the town as world space boxes.
 *
 * `maxFootprint` drops anything larger in plan, which is how the FIT keeps
 * the terrain and the lake from voting on a 7 m plot rectangle; the SCAN
 * passes Infinity because for it the road under a barrier is exactly the
 * answer it wants. The cap is applied to the WHOLE mesh, before subdivision,
 * so a terrain tile is dropped rather than turned into a thousand cells.
 */
export function drawnBoxes(root, { maxFootprint = Infinity, subdivide: allowSubdiv = true } = {}) {
  const out = [];
  let subdivided = 0;
  let plain = 0;
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry || o.visible === false) {
      return;
    }
    const g = o.geometry;
    if (!g.boundingBox) {
      g.computeBoundingBox();
    }
    if (!g.boundingBox) {
      return;
    }
    let name = o.name || '';
    for (let q = o.parent; q && !name; q = q.parent) {
      name = q.name || '';
    }
    const push = (m) => {
      tmpBox.copy(g.boundingBox).applyMatrix4(m);
      const fx = tmpBox.max.x - tmpBox.min.x;
      const fz = tmpBox.max.z - tmpBox.min.z;
      if (fx * fz > maxFootprint) {
        return;
      }
      if (allowSubdiv && subdivide(g, m, tmpBox, name, out)) {
        subdivided += 1;
        return;
      }
      plain += 1;
      out.push({
        x0: tmpBox.min.x,
        y0: tmpBox.min.y,
        z0: tmpBox.min.z,
        x1: tmpBox.max.x,
        y1: tmpBox.max.y,
        z1: tmpBox.max.z,
        name,
      });
    };
    if (o.isInstancedMesh) {
      for (let i = 0; i < o.count; i += 1) {
        o.getMatrixAt(i, tmpInst);
        tmpWorld.multiplyMatrices(o.matrixWorld, tmpInst);
        push(tmpWorld);
      }
      return;
    }
    push(o.matrixWorld);
  });
  out.subdivided = subdivided;
  out.plain = plain;
  return out;
}
