/*
 * bake.js: turning a town built for a walker into one a quad can fly through.
 *
 * THE MEASUREMENT THAT MADE THIS NECESSARY. The town as built is 20,819
 * meshes with 3,545 distinct materials, and one frame of it from the street
 * costs 16,647 draw calls and 9,957,538 triangles against this project's
 * budgets of 400 and 1,200,000. That is not a bug in the town: it is drawn as
 * thousands of small separate objects because a walker with a 1.7 m eye and a
 * 23 m ground horizon never has more than a fraction of it in frame at once.
 * A quad climbs, and from 80 m the whole district is inside one frustum.
 *
 * TWO PASSES, AND THE ORDER MATTERS.
 *
 *   1. MERGE. Every static mesh sharing a material inside a spatial cell
 *      becomes one mesh. The race field's scene.js has done this since round
 *      11 for exactly the same reason, and the same caveat applies: the merge
 *      applies each instance's matrix into its vertices, so a merged object is
 *      anonymous floats afterwards. That is why the colliders are read off the
 *      town's own collider list before this runs, and never recovered from the
 *      scene.
 *   2. CULL. The merged meshes are grouped by cell and the cells past a
 *      radius are switched off outright. Frustum culling cannot help a view
 *      that genuinely contains everything, which is the view a quad has.
 *
 * WHAT IS NOT MERGED, AND HOW THAT IS DECIDED. A merged mesh cannot move, so
 * anything the town animates has to be left alone. Rather than guess from
 * names, the animated set is MEASURED: the town's own update is run over
 * several seconds of its cycle and every object whose world matrix changed is
 * excluded, along with its whole subtree. The static marker the town already
 * carries, `userData.planetRigid`, is honoured as well, because a rig that
 * only moves on an interaction (the shutter, the cat) would not move during
 * the probe. Belt and braces, because the failure mode of getting this wrong
 * is a car frozen at its start position, which is the kind of thing that
 * survives a review.
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
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/*
 * How far into the town's own cycle to look for movement.
 *
 * The level crossing's whole sequence is 42.8 s and the arms take 3.4 s, so a
 * probe shorter than one loop would miss the booms. 48 s at 0.4 s a step is
 * 120 calls to the town's update, which measured at 41 ms in total, against a
 * build that takes seconds. Cheap, and it is a measurement rather than a list
 * of names that goes stale the first time upstream adds a moving part.
 */
const PROBE_STEPS = 120;
const PROBE_DT = 0.4;

function markSubtree(o, set) {
  o.traverse((c) => set.add(c));
}

/*
 * Every object the town moves. Returns a Set containing them and all their
 * descendants.
 */
export function findAnimated(world) {
  const moving = new Set();
  const roots = [];

  /* The town's own marker for a rig driven at runtime: gate booms, the shop
   * shutter, the cat, the vending machines. Some of those only move on an
   * interaction, so no amount of probing would catch them. */
  world.root.traverse((o) => {
    if (o.userData && o.userData.planetRigid) {
      roots.push(o);
    }
  });
  /* The train is driven by src/maps/city/animation.js rather than by the
   * town, so it never moves during the probe below. */
  if (world.train && world.train.group) {
    roots.push(world.train.group);
  }
  /* Petals are a particle system writing into its own buffers every frame. */
  if (world.petals && world.petals.group) {
    roots.push(world.petals.group);
  }

  /* Now measure. Snapshot, run the town forward across a whole crossing
   * cycle, snapshot again, and take anything that moved. */
  world.root.updateMatrixWorld(true);
  const before = new Map();
  world.root.traverse((o) => {
    before.set(o, o.matrixWorld.elements.slice());
  });
  for (let i = 0; i < PROBE_STEPS; i += 1) {
    world.update(PROBE_DT);
  }
  world.root.updateMatrixWorld(true);
  world.root.traverse((o) => {
    const was = before.get(o);
    if (!was) {
      roots.push(o);
      return;
    }
    const now = o.matrixWorld.elements;
    for (let k = 0; k < 16; k += 1) {
      if (was[k] !== now[k]) {
        roots.push(o);
        return;
      }
    }
  });

  for (const r of roots) {
    markSubtree(r, moving);
  }
  return moving;
}

/*
 * Merge every static mesh, bucketed by material, spatial cell, shadow flags
 * and attribute signature.
 *
 * The attribute signature is in the key because mergeGeometries refuses a set
 * whose attributes differ and warns to the console when it does, and this
 * project's check 13 requires a clean console. Bucketing by signature makes
 * the refusal impossible instead of handling it: every geometry in a bucket
 * has the same attributes by construction. The shadow flags are in the key
 * because a merged mesh has one castShadow for all of it, and merging a
 * shadow caster with something that deliberately does not cast would quietly
 * change the lighting.
 */
export function bakeCity(world, { cell = 40 } = {}) {
  const root = world.root;
  const animated = findAnimated(world);
  root.updateMatrixWorld(true);

  const buckets = new Map();
  const sources = [];
  const sphere = new THREE.Sphere();
  const box = new THREE.Box3();
  let skippedAnimated = 0;
  let skippedInstanced = 0;

  root.traverse((o) => {
    if (!o.isMesh || !o.visible) {
      return;
    }
    if (animated.has(o)) {
      skippedAnimated += 1;
      return;
    }
    if (o.isInstancedMesh) {
      /* Already one draw call for however many copies, and merging one would
       * multiply its geometry by its count. */
      skippedInstanced += 1;
      return;
    }
    const geo = o.geometry;
    if (!geo || !geo.attributes.position) {
      return;
    }
    box.setFromObject(o);
    if (box.isEmpty()) {
      return;
    }
    box.getBoundingSphere(sphere);
    const cx = Math.floor(sphere.center.x / cell);
    const cz = Math.floor(sphere.center.z / cell);
    const mat = Array.isArray(o.material) ? o.material[0] : o.material;
    if (!mat) {
      return;
    }
    const attrs = Object.keys(geo.attributes).sort().join(',');
    /*
     * Indexed and non indexed geometry cannot merge together, and which one a
     * bucket is has to be in the key rather than resolved by converting
     * everything to non indexed. Converting was the first version and it cost
     * 34.3 MB: P10's attribute total went from 69.0 to 103.3 MB, because
     * toNonIndexed writes out every shared vertex once per triangle that uses
     * it. A box goes from 8 vertices to 36.
     */
    const indexed = geo.index ? 1 : 0;
    const key = `${mat.uuid}|${cx},${cz}|${o.castShadow ? 1 : 0}${o.receiveShadow ? 1 : 0}|${attrs}|${indexed}|${o.renderOrder}`;
    let b = buckets.get(key);
    if (!b) {
      b = {
        material: mat,
        cx,
        cz,
        castShadow: o.castShadow,
        receiveShadow: o.receiveShadow,
        renderOrder: o.renderOrder,
        geos: [],
        meshes: [],
      };
      buckets.set(key, b);
    }
    const g = geo.clone();
    g.applyMatrix4(o.matrixWorld);
    b.geos.push(g);
    b.meshes.push(o);
    sources.push(o);
  });

  /* Reference counting before anything is freed. A geometry can be shared
   * between a mesh being merged and one that is not, and disposing it because
   * the first was merged would empty the second. */
  const refs = new Map();
  root.traverse((o) => {
    if (o.isMesh && o.geometry) {
      refs.set(o.geometry, (refs.get(o.geometry) ?? 0) + 1);
    }
  });

  const merged = [];
  for (const b of buckets.values()) {
    /* One mesh alone in a bucket is already one draw call; merging it would
     * copy its buffer for nothing. Leave it where it is. */
    if (b.geos.length < 2) {
      for (const g of b.geos) {
        g.dispose();
      }
      continue;
    }
    const geo = mergeGeometries(b.geos, false);
    for (const g of b.geos) {
      g.dispose();
    }
    if (!geo) {
      continue;
    }
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, b.material);
    mesh.castShadow = b.castShadow;
    mesh.receiveShadow = b.receiveShadow;
    mesh.renderOrder = b.renderOrder;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    root.add(mesh);
    merged.push(mesh);
    for (const m of b.meshes) {
      m.removeFromParent();
      const n = refs.get(m.geometry) ?? 0;
      refs.set(m.geometry, n - 1);
      if (n - 1 <= 0) {
        m.geometry.dispose();
      }
    }
  }

  return {
    merged,
    stats: {
      bakedFrom: sources.length,
      bakedTo: merged.length,
      buckets: buckets.size,
      skippedAnimated,
      skippedInstanced,
      cell,
    },
  };
}

/*
 * Split the big InstancedMeshes into spatial chunks.
 *
 * MEASURED FIRST. The town's triangle mass is not its buildings, it is its
 * trees: `groveCanopy0/1/2` carry 15,616, 10,090 and 7,909 instances of an
 * eighty triangle blob, which is 2,689,200 triangles in three draw calls, and
 * the sakura canopies, the hill tufts and the lake reeds add another 1.0 M.
 *
 * One draw call sounds cheap, and it is, but an InstancedMesh is culled as a
 * WHOLE: its bounding sphere spans the entire grove, so it passes every
 * frustum test, and all 15,616 instances are submitted to the colour pass and
 * again to the shadow pass whether or not a single one is in frame. Splitting
 * one grove into one InstancedMesh per cell costs a few dozen draw calls and
 * buys per cell frustum culling and per cell distance culling on 33,615
 * trees. Numbers before and after are in PROGRESS.md.
 *
 * Only meshes with enough instances to be worth splitting are touched.
 * Chunking a nine instance bicycle rack would turn one draw call into nine
 * for nothing, and at a threshold of 64 the measurement said so: 62 sources
 * became 1,324 chunks and the draw call count went UP by more than the
 * triangle saving was worth. At 400 the split reaches the thirteen meshes
 * that carry the town's triangles and leaves the rest alone.
 */
const CHUNK_MIN_INSTANCES = 200;

export function chunkInstanced(root, { cell = 40 } = {}) {
  const targets = [];
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (o.isInstancedMesh && o.count >= CHUNK_MIN_INSTANCES) {
      targets.push(o);
    }
  });

  const m = new THREE.Matrix4();
  const v = new THREE.Vector3();
  let made = 0;
  for (const src of targets) {
    const buckets = new Map();
    for (let i = 0; i < src.count; i += 1) {
      src.getMatrixAt(i, m);
      v.setFromMatrixPosition(m);
      const key = `${Math.floor(v.x / cell)},${Math.floor(v.z / cell)}`;
      let b = buckets.get(key);
      if (!b) {
        b = [];
        buckets.set(key, b);
      }
      b.push(i);
    }
    if (buckets.size < 2) {
      continue;
    }
    for (const idx of buckets.values()) {
      const chunk = new THREE.InstancedMesh(src.geometry, src.material, idx.length);
      chunk.name = src.name;
      chunk.castShadow = src.castShadow;
      chunk.receiveShadow = src.receiveShadow;
      chunk.renderOrder = src.renderOrder;
      for (let k = 0; k < idx.length; k += 1) {
        src.getMatrixAt(idx[k], m);
        chunk.setMatrixAt(k, m);
      }
      chunk.instanceMatrix.needsUpdate = true;
      if (src.instanceColor) {
        chunk.instanceColor = src.instanceColor.clone();
      }
      chunk.computeBoundingSphere();
      /* Seated in the source's parent so any transform above it still
       * applies. The instance matrices are in that same local space. */
      src.parent.add(chunk);
      made += 1;
    }
    src.removeFromParent();
    /* The geometry and material are now shared with the chunks, so neither is
     * disposed. Only the per instance matrix buffer dies with the original. */
    src.dispose();
  }
  return { chunkedFrom: targets.length, chunkedTo: made };
}

/*
 * Group everything left in the graph into cells so the far half of the town
 * can be switched off in a few hundred property writes rather than a walk of
 * twenty thousand objects.
 *
 * Anything whose bounding sphere is bigger than a cell, the ground, the road
 * strip, the rails, stays out of the grid and is always drawn: hiding it
 * would open a hole in the world rather than remove clutter from the
 * distance.
 */
export function buildCullGrid(root, { cell = 40 } = {}) {
  const cells = new Map();
  const always = [];
  const sphere = new THREE.Sphere();
  const box = new THREE.Box3();
  root.updateMatrixWorld(true);

  const consider = (o) => {
    box.setFromObject(o);
    if (box.isEmpty()) {
      return false;
    }
    box.getBoundingSphere(sphere);
    if (sphere.radius > cell) {
      return false;
    }
    const cx = Math.floor(sphere.center.x / cell);
    const cz = Math.floor(sphere.center.z / cell);
    const key = `${cx},${cz}`;
    let c = cells.get(key);
    if (!c) {
      c = { x: (cx + 0.5) * cell, z: (cz + 0.5) * cell, items: [], on: true };
      cells.set(key, c);
    }
    c.items.push(o);
    return true;
  };

  /*
   * Descend until something fits in a cell. Grouping at the district level
   * would put the whole town in `always`, which is the mistake the first
   * version of this made: every one of the town's top level children has a
   * bounding sphere far bigger than a cell, so nothing was ever culled and
   * the measurement said so.
   */
  const walk = (o) => {
    for (const child of o.children) {
      if (!child.isObject3D) {
        continue;
      }
      if (child.isMesh || child.isInstancedMesh) {
        if (!consider(child)) {
          always.push(child);
        }
        continue;
      }
      if (consider(child)) {
        continue;
      }
      walk(child);
    }
  };
  walk(root);

  return { cells: [...cells.values()], always, cell };
}
