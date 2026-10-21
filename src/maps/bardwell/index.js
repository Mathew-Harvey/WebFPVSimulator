/*
 * index.js: Joshua Bardwell's house as a map, built the way Heads' house is
 * (../heads/index.js): the built map's pipeline (../built/index.js) does
 * all of it, the sky, the ground, the ink, the shadows, the colliders, the
 * cull, the named gaps, the marks. This file hands it the place's document
 * (./yard.js) and the place itself (./bardwell.js) as one structure of its
 * own, draws what the parts cannot say, hangs the sponsors' signs and
 * paints their logos (./logos.js), and names the world.
 *
 * WHAT THE DRAW ADDS, in the world frame, after the kit has drawn every
 * part the place marks as drawn:
 *
 *   prisms    the roofs' slopes, gables, fascias and rake boards, the
 *             porch's and the lean-to's shed roofs.
 *   discs     the drive's bends and its wet patches. cyls: the firewood's
 *             cut ends.
 *   oboxes    flat boxes turned to any heading: the drive and the path
 *             down their bends, the flags' cloth.
 *   tori      the two hoops.
 *   scaled    the loblolly pines and broadleaves (loblollyDraw in
 *             src/props/street.js) and the town's cars, life size; their
 *             solids are the same parts, drawn nowhere (./bardwell.js).
 *
 * Outside only and life size, so the town's pen draws it as it draws the
 * town, not the manga pen the two houses' rooms are drawn with.
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
import { loblollyDraw } from '../../props/street.js';
import { bardwellLayout, FRAME, worldAt } from './bardwell.js';
import { bardwellDocument } from './yard.js';
import {
  BRANDS, ATLAS_W, ATLAS_H, CELLS, placeSigns, placeDecals,
} from './logos.js';
import { partnerSignReady } from '../../art/partnermark.js';
import { paintMaterial } from '../../art/stf.js';

const CHUNK = 'extra';

/* Prisms along x are drawn turned a quarter, so the kit's extrusion along
 * its local z runs east; along y they are drawn unturned and run south. */
function drawPrisms(kit, prisms) {
  const { OX, OZ, S } = FRAME;
  kit.begin(0, 0, 0, Math.PI / 2, CHUNK);
  for (const p of prisms) {
    if (p.axis === 'x') {
      kit.extrude(p.m, p.profile.map(([a, h]) => [S * a - OZ, S * h]), OX + S * p.e0, OX + S * p.e1);
    }
  }
  kit.begin(0, 0, 0, 0, CHUNK);
  for (const p of prisms) {
    if (p.axis === 'y') {
      kit.extrude(p.m, p.profile.map(([a, h]) => [OX + S * a, S * h]), OZ - S * p.e1, OZ - S * p.e0);
    }
  }
}

function drawPlace(kit, L) {
  const { S } = FRAME;
  const T = kit.THREE;
  drawPrisms(kit, L.prisms);
  kit.begin(0, 0, 0, 0, CHUNK);
  for (const d of L.discs) {
    const [x, y0, z] = worldAt(d.px, d.py, d.h0);
    kit.cyl(d.m, [x, y0, z], [x, S * d.h1, z], S * d.r, 24);
  }
  for (const c of L.cyls) {
    kit.cyl(c.m, c.a, c.b, c.r, c.seg);
  }
  /* A turned box: its frame's x along the plan's (ux, uy), which is the
   * world's (ux, 0, -uy), up, and z to its right, so the frame is right
   * handed and the box's faces wind outward; `b` across to the left is
   * -z. */
  const ax = new T.Vector3();
  const up = new T.Vector3(0, 1, 0);
  const az = new T.Vector3();
  for (const o of L.oboxes) {
    const [x, , z] = worldAt(o.px, o.py, 0);
    kit.begin(x, 0, z, 0, CHUNK);
    ax.set(o.ux, 0, -o.uy);
    az.set(o.uy, 0, o.ux);
    kit.place.makeBasis(ax, up, az).setPosition(x, 0, z);
    kit.box(o.m, S * o.a0, S * o.h0, -S * o.b1, S * o.a1, S * o.h1, -S * o.b0);
  }
  /* A hoop: the ring in its frame's x y plane, its z the way it is flown. */
  for (const t of L.tori) {
    const [x, , z] = worldAt(t.px, t.py, 0);
    kit.begin(x, 0, z, 0, CHUNK);
    ax.set(-t.ny, 0, -t.nx);
    az.set(t.nx, 0, -t.ny);
    kit.place.makeBasis(ax, up, az).setPosition(x, 0, z);
    kit.torus(t.m, [0, S * t.h, 0], S * t.R, S * t.t);
  }
  for (const a of L.scaled) {
    const [x, y, z] = worldAt(a.px, a.py, a.h);
    kit.begin(x, y, z, a.yaw, a.chunk);
    kit.place.multiply(new T.Matrix4().makeScale(a.k, a.k, a.k));
    if (a.el.style === 'loblolly' || a.el.style === 'broad') {
      loblollyDraw(a.el, kit);
    } else {
      kit.element(a.el);
    }
  }
}

/* ------------------------------------------------------------------ */
/* The logos                                                           */
/* ------------------------------------------------------------------ */

/* The atlas (CELLS in ./logos.js) painted: each roster sign copied whole
 * from its own canvas (src/art/partnermark.js), once its artwork has
 * come. */
function paintAtlas(signs) {
  const c = document.createElement('canvas');
  c.width = ATLAS_W;
  c.height = ATLAS_H;
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  BRANDS.forEach((p, i) => {
    const { x, y, w, h } = CELLS[p.slug];
    g.drawImage(signs[i], x, y, w, h);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/* Every decal as a quad on its cell, one lit mesh: each { cell, p, n, up,
 * w, h } in the world, `p` its middle, with its normal for the light. */
function logoMesh(items, material) {
  const pos = [];
  const nor = [];
  const uv = [];
  const idx = [];
  const n = new THREE.Vector3();
  const up = new THREE.Vector3();
  const right = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (const q of items) {
    const cell = CELLS[q.cell];
    const u0 = cell.x / ATLAS_W;
    const u1 = (cell.x + cell.w) / ATLAS_W;
    const v0 = 1 - (cell.y + cell.h) / ATLAS_H;
    const v1 = 1 - cell.y / ATLAS_H;
    n.fromArray(q.n);
    up.fromArray(q.up);
    right.crossVectors(up, n).normalize();
    up.crossVectors(n, right).normalize();
    const base = pos.length / 3;
    for (const [sx, sy, tu, tv] of [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]]) {
      c.fromArray(q.p).addScaledVector(right, (sx * q.w) / 2).addScaledVector(up, (sy * q.h) / 2);
      pos.push(c.x, c.y, c.z);
      nor.push(n.x, n.y, n.z);
      uv.push(u0 + tu * (u1 - u0), v0 + tv * (v1 - v0));
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'bardwell logos';
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}

export async function buildMap(shell, onProgress, options) {
  /* Every roster sign's artwork, asked for first so it comes while the
   * world builds. */
  const signsCame = Promise.all(BRANDS.map((p) => partnerSignReady(p)));
  const L = bardwellLayout();
  const extra = {
    el: { id: 'bardwell', type: 'bardwell' },
    parts: L.parts,
    draw: (kit) => drawPlace(kit, L),
  };
  const doc = bardwellDocument();
  /* Every roster brand's sign hung by hand (./logos.js), the chooser's
   * spots off: it sees the yard's document and not the place. */
  const markSpots = placeSigns(L.parts, CHUNK).filter(Boolean);
  const map = await buildBuilt(shell, onProgress, {
    ...(options || {}), document: doc, extra, sponsorMarks: false, markSpots,
  });
  /* Its own world: the shell keys the world, the results and the board's
   * refusal by this id (src/main.js, src/ui/ui.js), and `source` is the word
   * the board counts its partner signs under (MARK_MAP_WORDS in src/main.js). */
  map.id = 'bardwell';
  map.source = 'bardwell';
  const signs = await signsCame;
  const decals = placeDecals(L.parts).filter(Boolean);
  map.scene.add(logoMesh(decals, paintMaterial(THREE, paintAtlas(signs))));
  await warmPrograms(shell.renderer, map.scene, shell.camera, map.post.rtScene);
  return map;
}
