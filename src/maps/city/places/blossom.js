/*
 * blossom.js: falling cherry blossom over the works road, the works and the
 * pool.
 *
 * WHY THIS EXISTS AND IS NOT ./vendored/world/petals.js.
 *
 * The town's own field is beautiful and it is BOUNDED. `petals.js` respawns
 * every card inside `centerX(z) ± 9.5` over `z -30..34` and takes its floor
 * from `groundY(z)`: it is a field down the street corridor, authored for the
 * opening shot at the level crossing, and it has no idea either of these
 * places exists. Sixty metres away at the end of the works road there are
 * eight cherries in blossom and nothing at all falls off them.
 *
 * Widening the vendored one is the wrong lever. Its bounds are three module
 * constants, its wrap is written against the street's centreline, and its
 * whole reason for a 980 card count is a corridor a pilot spends most of
 * their time in. Out here the same density over four times the area would
 * cost four times the instances for a thinner effect.
 *
 * So this is a second field, ours, over the rectangle the two places
 * actually occupy, at a third of the count, with two things the vendored one
 * does not need:
 *
 *   - A FLOOR THAT IS NOT A PLANE. The lido is a hole in the ground 2.5 m
 *     deep. A card that respawns at `GROUND` disappears at the pool's rim,
 *     which is the one place in either location the blossom most wants to
 *     end up. `wells` is a short list of rectangles with their own floor, so
 *     a petal falls into the bowl and lands on the tile.
 *   - NO TRAIN. The town's field takes a sideways shove every time the train
 *     goes past. There is no train out here, and a gust with nothing making
 *     it is a thing that happens for no reason.
 *
 * ON THE CLOCK, NOT THE FRAME. `update(dt)` is called from the places'
 * updater list, which `src/maps/city/index.js` drives off `updateAnim`'s
 * fixed step count. Nothing here is solid and nothing here is in the physics
 * path, but the town's own decoration is driven that way and a second clock
 * in the same scene is a thing nobody would find twice.
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
import { PAL } from '../vendored/core/palette.js';
import { flat } from '../vendored/core/toon.js';
import { petalTex } from '../vendored/core/textures.js';
import { rngKit } from '../vendored/core/util.js';
import { GROUND } from './kit.js';

/*
 * 640 cards, against the town's 980, and the two numbers are not comparable
 * the way they look.
 *
 * The street's field is 980 over 19 by 64 by 6.8 m, which is 0.119 cards a
 * cubic metre in a corridor with buildings on both sides and the eye close to
 * all of it. This is 640 over 64 by 38 by 9.4, which is 0.026: a fifth of the
 * density over nearly three times the volume. Matching the street's density
 * out here would take 2,700 cards for an effect nobody would read as denser,
 * because most of this field is seen against open sky at twenty metres rather
 * than across a road at five. 360 was the first pass and it was too thin
 * against the sky; 640 is what reads as blossom coming off eight trees.
 */
const COUNT = 640;
/*
 * The field's box, and its SIZE is set by the cull grid rather than by where
 * the blossom would go if nothing were watching.
 *
 * `buildCullGrid` in ../bake.js walks the town's root children and puts
 * anything whose bounding sphere is smaller than a cell into that cell;
 * anything bigger goes into `always` and is drawn from everywhere. At
 * 68 by 42 by 9 the three sets came out with spheres either side of the 40 m
 * cell, so they landed in different cells and, measured, TWO OF THE THREE
 * were switched off from the spawn while the third stayed on: a third of a
 * blossom field, which is worse than none. Two things fix it and both are
 * here: the three sets are one group, so the grid makes one decision about
 * the field rather than three about its tones, and 64 by 38 keeps that
 * group's sphere the size a cull decision can be made about.
 */
const AREA = { x0: 26.0, x1: 90.0, z0: 74.0, z1: 112.0 };
const TOP = 9.4;

export function buildBlossom(ctx, wells = []) {
  const rng = rngKit(9271);
  const tex = petalTex();
  const geo = new THREE.PlaneGeometry(0.185, 0.135);
  /* The town's own three tones, in the town's own proportions, so the two
   * fields are the same blossom seen over different ground. */
  const groups = [
    { color: PAL.petal, n: Math.round(COUNT * 0.55) },
    { color: PAL.blossomLight, n: Math.round(COUNT * 0.28) },
    { color: PAL.petalDeep, n: COUNT - Math.round(COUNT * 0.55) - Math.round(COUNT * 0.28) },
  ];

  /* One group, and it is what makes the cull grid treat the field as a field.
   * Three root children with three different bounding spheres is three
   * independent cull decisions over the same air. */
  const group = new THREE.Group();
  group.name = 'placesBlossom';
  ctx.add(group);

  const meshes = [];
  const P = [];
  for (const grp of groups) {
    const mat = flat({
      color: grp.color,
      map: tex,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      side: THREE.DoubleSide,
      alphaTest: 0.32,
      cache: false,
    });
    const inst = new THREE.InstancedMesh(geo, mat, grp.n);
    inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    /* Never culled, and never chunked. `chunkInstanced` in ../bake.js splits
     * any instanced set over 200 into per cell copies and detaches the
     * source, and this file keeps a {mesh, idx} pair per card and writes
     * `setMatrixAt(idx)` on it every step: split, the field would vanish with
     * nothing reported. The same trap the town's own field is held out of. */
    inst.frustumCulled = false;
    inst.renderOrder = 4;
    inst.name = 'petalField';
    inst.userData.noOutline = true;
    inst.userData.noChunk = true;
    inst.userData.noMerge = true;
    group.add(inst);
    meshes.push(inst);
    for (let i = 0; i < grp.n; i += 1) {
      P.push({
        mesh: inst,
        idx: i,
        x: rng.range(AREA.x0, AREA.x1),
        y: rng.range(0.4, TOP),
        z: rng.range(AREA.z0, AREA.z1),
        fall: rng.range(0.40, 0.84),
        swayAmp: rng.range(0.25, 0.75),
        swayFreq: rng.range(0.5, 1.35),
        phase: rng.range(0, 10),
        spin: new THREE.Vector3(rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)).normalize(),
        spinRate: rng.range(0.5, 2.4),
        angle: rng.range(0, 6.28),
        scale: rng.range(0.78, 1.25),
        drift: rng.range(-0.16, 0.16),
      });
    }
  }

  /* The floor under a point. `GROUND` everywhere except the wells, which are
   * the two halves of the drained lido: a card that reaches the deck over a
   * hole 2.5 m deep has not landed. Two rectangle tests a card a step. */
  const floorAt = (x, z) => {
    for (let i = 0; i < wells.length; i += 1) {
      const w = wells[i];
      if (x > w.x0 && x < w.x1 && z > w.z0 && z < w.z1) {
        return w.y;
      }
    }
    return GROUND;
  };

  const dummy = new THREE.Object3D();
  const q = new THREE.Quaternion();
  const scaleV = new THREE.Vector3();
  let t = 0;

  function respawn(p) {
    p.x = rng.range(AREA.x0, AREA.x1);
    p.z = rng.range(AREA.z0, AREA.z1);
    p.y = TOP + rng.range(0, 1.6);
    p.phase = rng.range(0, 10);
  }

  function update(dt) {
    t += dt;
    for (let i = 0; i < P.length; i += 1) {
      const p = P[i];
      /* One slow wave and one fast flutter, the same pair the town's field
       * uses: either alone reads as noise, the two together read as air. */
      const s = Math.sin(t * p.swayFreq + p.phase);
      const s2 = Math.sin(t * p.swayFreq * 2.7 + p.phase * 1.7);
      p.y -= p.fall * dt;
      p.x += (p.swayAmp * s * 0.55 + p.drift) * dt;
      p.z += p.swayAmp * s2 * 0.32 * dt;
      p.angle += p.spinRate * dt;

      if (p.x < AREA.x0) {
        p.x = AREA.x1;
      } else if (p.x > AREA.x1) {
        p.x = AREA.x0;
      }
      if (p.z < AREA.z0) {
        p.z = AREA.z1;
      } else if (p.z > AREA.z1) {
        p.z = AREA.z0;
      }
      if (p.y < floorAt(p.x, p.z) + 0.04) {
        respawn(p);
      }

      q.setFromAxisAngle(p.spin, p.angle);
      dummy.position.set(p.x, p.y, p.z);
      dummy.quaternion.copy(q);
      scaleV.setScalar(p.scale);
      dummy.scale.copy(scaleV);
      dummy.updateMatrix();
      p.mesh.setMatrixAt(p.idx, dummy.matrix);
    }
    for (const m of meshes) {
      m.instanceMatrix.needsUpdate = true;
    }
  }

  /* Settle it, so the first frame a pilot sees out here already has blossom
   * in the air rather than a curtain of it starting nine metres up. */
  for (let i = 0; i < 40; i += 1) {
    update(0.1);
  }
  ctx.update(update);

  return {
    group,
    meshes,
    count: COUNT,
    dispose() {
      for (const m of meshes) {
        m.dispose();
        m.material.dispose();
      }
      group.removeFromParent();
      /* NOT the geometry on the last pass and NOT the map: the plane is
       * shared by all three sets and freed once here, and `petalTex()` is a
       * module level singleton in ../vendored/core/textures.js that the
       * town's own fallen drifts are still drawing with. */
      geo.dispose();
      meshes.length = 0;
    },
  };
}
