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
import { bardwellLayout, bardwellYardTrack, FRAME, worldAt } from './bardwell.js';
import { floorQuads } from '../yardtrack/yardtrack.js';
import { bardwellDocument } from './yard.js';
import {
  BRANDS, ATLAS_W, ATLAS_H, CELLS, placeSigns, placeDecals,
} from './logos.js';
import { placeStickers, paintSticker, STICKER_WORD, GOAT_STICKER } from './stickers.js';
import { stickerMesh } from '../stickermesh.js';
import { makeGoats, STICKER_GOAT } from './goats.js';
import { partnerSignReady } from '../../art/partnermark.js';
import { paintMaterial } from '../../art/stf.js';
import { stfKey } from '../built/egg.js';

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
  /* The yard track (../yardtrack/), which the shell times. */
  map.yardTrack = bardwellYardTrack();
  /* Timed on the whoop only: a five inch is offered the swap. */
  map.yardWhoopOnly = true;
  const signs = await signsCame;
  /* The yard track's floor logos (../yardtrack/) are the same picture's
   * cells, quads in the same mesh, so they cost nothing. */
  const decals = [...placeDecals(L.parts).filter(Boolean), ...floorQuads(bardwellYardTrack(), L.parts)];
  map.scene.add(logoMesh(decals, paintMaterial(THREE, paintAtlas(signs))));
  /* Stickers to find (./stickers.js), one mesh and one draw call, each an
   * achievement that plays one of Joshua Bardwell's clips (src/render/clips.js):
   * his voice is this map's alone. */
  const sheet = paintSticker(THREE);
  const stuck = placeStickers(L.parts).filter(Boolean);
  /* The twelfth rides a goat: its quad is the last in the same mesh, no draw
   * call of its own, and its four corners are written each frame from the
   * goat (below). `p` and `n` of its entry are what the shell looks at, and
   * are moved in place. */
  const riding = { p: [0, -50, 0], n: [0, 0, 1], w: FRAME.S * GOAT_STICKER.size, turn: 0 };
  const jbStickers = stickerMesh(THREE, [...stuck, riding], sheet, 'jb stickers');
  jbStickers.frustumCulled = false;
  const ridePos = jbStickers.geometry.attributes.position;
  ridePos.setUsage(THREE.DynamicDrawUsage);
  const rideBase = stuck.length * 4;
  map.scene.add(jbStickers);
  map.stickers = [
    ...(map.stickers || []),
    ...stuck.map((s) => ({
      id: `jb-${s.id}`,
      key: `${stfKey(doc, 'bardwell')}#sticker:jb-${s.id}`,
      name: s.name,
      achievement: STICKER_WORD,
      crop: { x: 0, y: 0, w: 1, h: 1 },
      sheet,
      p: s.p,
      n: s.n,
      w: s.w,
      h: s.w,
    })),
    {
      id: `jb-${GOAT_STICKER.id}`,
      key: `${stfKey(doc, 'bardwell')}#sticker:jb-${GOAT_STICKER.id}`,
      name: GOAT_STICKER.name,
      achievement: STICKER_WORD,
      crop: { x: 0, y: 0, w: 1, h: 1 },
      sheet,
      p: riding.p,
      n: riding.n,
      w: riding.w,
      h: riding.w,
    },
  ];
  map.clips = 'jb';
  /* The goats in the field (./goats.js): one instanced mesh, moved on the
   * clock the map is handed, and a catch cues Nick's "Boom Shakala!" through
   * the map's onCue, which the shell sets once the map is live. */
  const goats = makeGoats(
    () => (shell.quad ? shell.quad.position : null),
    (name) => {
      if (typeof map.onCue === 'function') {
        map.onCue(name);
      }
    },
  );
  map.scene.add(goats.group);
  await warmPrograms(shell.renderer, map.scene, shell.camera, map.post.rtScene);
  const anim = map.updateAnim;
  const flank = new THREE.Vector3();
  const right = new THREE.Vector3();
  map.updateAnim = (step) => {
    anim(step);
    goats.update(step);
    /* The sticker on the goat's flank that faces the camera, 0.17 m out from
     * its middle, and gone while the goat is. */
    const g = goats.pose(STICKER_GOAT);
    const h = riding.w / 2;
    let cx = 0;
    let cy = -50;
    let cz = 0;
    if (g.shown) {
      const sx = Math.sin(g.hd);
      const sz = Math.cos(g.hd);
      const side = sx * (shell.camera.position.x - g.x) + sz * (shell.camera.position.z - g.z) < 0 ? -1 : 1;
      riding.n[0] = sx * side;
      riding.n[1] = 0;
      riding.n[2] = sz * side;
      cx = g.x + riding.n[0] * 0.172;
      cy = 0.62;
      cz = g.z + riding.n[2] * 0.172;
    }
    riding.p[0] = cx;
    riding.p[1] = cy;
    riding.p[2] = cz;
    flank.fromArray(riding.n);
    right.set(0, 1, 0).cross(flank).normalize();
    for (let k = 0; k < 4; k += 1) {
      const sx = k === 0 || k === 3 ? -1 : 1;
      const sy = k < 2 ? -1 : 1;
      ridePos.setXYZ(rideBase + k, cx + right.x * sx * h, cy + sy * h, cz + right.z * sx * h);
    }
    ridePos.needsUpdate = true;
  };
  const stats = map.stats;
  map.stats = () => ({ ...stats(), goats: goats.stats() });
  return map;
}
