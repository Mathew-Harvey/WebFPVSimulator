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
 * Every object the town moves.
 *
 * Returns `moving`, a Set of them and all their descendants, and `stillRigs`,
 * the marked rigs that did not move so much as a matrix during the probe. The
 * second is not a list of things that are safe to merge into the town, it is a
 * list of things that are safe to merge into THEMSELVES: see mergeRigs.
 */
export function findAnimated(world) {
  const moving = new Set();
  const roots = [];
  const marked = [];

  /* The town's own marker for a rig driven at runtime: gate booms, the shop
   * shutter, the cat, the vending machines. Some of those only move on an
   * interaction, so no amount of probing would catch them. */
  world.root.traverse((o) => {
    if (o.userData && o.userData.planetRigid) {
      roots.push(o);
      marked.push(o);
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
  const stirred = new Set();
  world.root.traverse((o) => {
    const was = before.get(o);
    if (!was) {
      roots.push(o);
      stirred.add(o);
      return;
    }
    const now = o.matrixWorld.elements;
    for (let k = 0; k < 16; k += 1) {
      if (was[k] !== now[k]) {
        roots.push(o);
        stirred.add(o);
        return;
      }
    }
  });

  /* A marked rig is still if NOTHING in it stirred, the root included. One
   * moving part anywhere in the subtree disqualifies the whole rig, because
   * the thing mergeRigs is allowed to assume is that the rig is rigid. */
  const stillRigs = [];
  for (const r of marked) {
    let quiet = true;
    r.traverse((c) => {
      if (stirred.has(c)) {
        quiet = false;
      }
    });
    if (quiet) {
      stillRigs.push(r);
    }
  }

  for (const r of roots) {
    markSubtree(r, moving);
  }
  return { moving, stillRigs };
}

/*
 * Merge each still rig into itself.
 *
 * THE MEASUREMENT. 1,934 of the town's meshes are held out of the merge as
 * animated and only 468 of them ever move: 1,466 are there because they carry
 * `userData.planetRigid`, and did not stir once in a 48 s probe. That is
 * roughly a third of the frame's draw calls sitting in the one bucket the bake
 * refuses to touch.
 *
 * WHY THEY ARE HELD OUT, AND WHY THAT IS RIGHT. Upstream's own note in
 * ./vendored/world/planet.js reads "userData.planetRigid -> left in flat
 * space; used for animated rigs", and the eleven call sites bear it out: the
 * shop shutter, the crossing booms, the cat, the vending machines, the train,
 * the lake and onsen rigs, and a banner cloth on a pivot. Some of those move
 * only when something interacts with them, so no probe of any length would
 * catch them, which is exactly why the marker is honoured on top of the
 * measurement. Merging them into the town would bake their world matrices into
 * anonymous floats and freeze whichever of them the probe was too short to see.
 *
 * WHAT IS SAFE IS SOMETHING ELSE. A rig is a group with an animated TRANSFORM;
 * the meshes inside it are almost always rigid with respect to it. So rather
 * than merge a rig into the town, merge it into ITSELF: every mesh in the rig
 * becomes one mesh per material, expressed in the RIG'S OWN local space and
 * parented to the rig. The rig keeps its transform, whatever drives it goes on
 * driving it, and a banner that swings still swings, because the swing is the
 * group's rotation and the group is untouched.
 *
 * The one thing this cannot survive is a rig that articulates INTERNALLY, one
 * part moving against another, since those parts are now one mesh. That is
 * what `stillRigs` is for: a rig qualifies only if nothing anywhere in it,
 * root included, moved by a single matrix element across the whole probe. A
 * rig whose cloth swings on an inner pivot moves during the probe and is never
 * offered here.
 */
export function mergeRigs(rigs) {
  const made = [];
  let from = 0;
  const local = new THREE.Matrix4();
  const inv = new THREE.Matrix4();

  for (const rig of rigs) {
    const parts = [];
    rig.traverse((o) => {
      if (o.isMesh && !o.isInstancedMesh && o.visible
        && o.geometry && o.geometry.attributes.position) {
        parts.push(o);
      }
    });
    if (parts.length < 2) {
      continue;
    }
    rig.updateMatrixWorld(true);
    inv.copy(rig.matrixWorld).invert();

    /* Same bucket key the town merge uses, minus the spatial cell: a rig is
     * one place by definition. */
    const buckets = new Map();
    for (const o of parts) {
      const mat = Array.isArray(o.material) ? o.material[0] : o.material;
      if (!mat) {
        continue;
      }
      const attrs = Object.keys(o.geometry.attributes).sort().join(',');
      const key = `${mat.uuid}|${o.castShadow ? 1 : 0}${o.receiveShadow ? 1 : 0}`
        + `|${attrs}|${o.geometry.index ? 1 : 0}|${o.renderOrder}`;
      let b = buckets.get(key);
      if (!b) {
        b = {
          material: mat,
          castShadow: o.castShadow,
          receiveShadow: o.receiveShadow,
          renderOrder: o.renderOrder,
          geos: [],
          meshes: [],
        };
        buckets.set(key, b);
      }
      const g = o.geometry.clone();
      local.multiplyMatrices(inv, o.matrixWorld);
      g.applyMatrix4(local);
      b.geos.push(g);
      b.meshes.push(o);
    }

    for (const b of buckets.values()) {
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
      /* Into the rig, not into the root. This is the whole point. */
      rig.add(mesh);
      made.push(mesh);
      from += b.meshes.length;
      for (const m of b.meshes) {
        m.removeFromParent();
      }
    }
  }

  return { made, rigsMerged: rigs.length, mergedFrom: from, mergedTo: made.length };
}

/*
 * Share materials that are the same material.
 *
 * MEASURED, and it is the town's single biggest draw call cost. The vendored
 * factories in ./vendored/core/toon.js cache aggressively, but their cache
 * key is null whenever a texture is set:
 *
 *     const key = cache && !map && !alphaMap ? [...] : null;
 *
 * so every TEXTURED material is a fresh object, and so is every caller that
 * passes cache: false. Counted on the built town, the static set holds 20,876
 * material references that resolve to just 1,108 distinct APPEARANCES, and
 * 1,497 of those references were pointing at a duplicate of one they could
 * have shared.
 *
 * That matters far more than the wasted objects, because bakeCity buckets by
 * material identity. Two meshes that look identical but hold different
 * material objects can never merge, so every duplicate is a bucket that could
 * not form and a draw call that did not go away. Pointing them at one shared
 * material first took the street viewpoint from 5981 draw calls to 5504 on its
 * own, at the 40 m merge cell this had before, and it costs nothing: no
 * geometry moves, no culling changes, no shader compiles differently.
 *
 * The vendored files are Kenton Wang's and stay byte identical, per /NOTICE,
 * so the fix is here rather than in the factory that caused it.
 *
 * WHAT IS SAFE TO SHARE. Only materials whose whole appearance can be read
 * off them. Three.js already has the exact contract for "these two need
 * different shader programs", customProgramCacheKey, and the town's cel
 * factory sets it for the shadow tint, so it goes in the key. Anything with
 * its OWN onBeforeCompile and no cache key is left alone: its differences
 * live in a closure this cannot see.
 *
 * SHADER MATERIALS ARE LEFT ALONE, AND THAT IS A DECISION, NOT AN OMISSION. A
 * shader material's appearance is its source and its uniforms, both of which
 * can be read, and doing so collapses the town's 1039 of them to 7: they are
 * the ink shells `hullOutline` mints one per mesh in
 * ./vendored/core/outline.js. It was tried, and it is not worth having.
 *
 * It bought 1.5 percent of the frame's draw calls, because the shells are
 * small. What it cost was correctness. A shell is an inverted hull that reads
 * as an outline ONLY while the mesh it inks is drawn on top of it, and being
 * unique per mesh is what has been keeping every shell a bucket of one, so
 * that it stays a child of that mesh and shares its fate. Share the materials
 * and the shells merge with each other instead, into an object with its own
 * bounds, its own cull cell and no relationship to the geometry it belongs to.
 * The far side of the town came back as solid black hulls standing where the
 * meshes they ink had been culled away, worst on the tunnel portal. The
 * screenshots are in PROGRESS.md.
 *
 * A shell could be made to follow its mesh through the merge. That is a real
 * change to what the bake is, for 1.5 percent, so it is written down here and
 * not done.
 *
 * AND ONLY THE STATIC SET. A material that a mesh writes to every frame is
 * not a look, it is a channel, and pointing a second mesh at it hands that
 * mesh someone else's animation. The town does exactly this: onsen.js drives
 * `p.material.opacity` per frame on both steam vents. So this runs over the
 * meshes the bake is about to merge and no others, and any material an
 * animated object holds is untouchable, neither adopted as a canonical nor
 * replaced. That is not a heuristic, it is the same measured animated set the
 * merge itself uses, which is why findAnimated runs first.
 */

function materialLook(m) {
  const ownCompile = Object.prototype.hasOwnProperty.call(m, 'onBeforeCompile');
  if (m.isShaderMaterial || m.isRawShaderMaterial) {
    return null;
  }
  if (ownCompile && typeof m.customProgramCacheKey !== 'function') {
    return null;
  }
  const tex = (t) => (t ? t.uuid : '-');
  return [
    m.type,
    m.color ? m.color.getHexString() : '-',
    m.emissive ? m.emissive.getHexString() : '-',
    m.emissiveIntensity ?? '-',
    tex(m.map), tex(m.alphaMap), tex(m.gradientMap), tex(m.emissiveMap),
    tex(m.normalMap), tex(m.aoMap), tex(m.lightMap), tex(m.specularMap),
    m.transparent ? 1 : 0, m.opacity, m.side, m.alphaTest,
    m.depthWrite ? 1 : 0, m.depthTest ? 1 : 0, m.fog ? 1 : 0,
    m.vertexColors ? 1 : 0, m.toneMapped ? 1 : 0, m.blending,
    m.wireframe ? 1 : 0, m.flatShading ? 1 : 0, m.dithering ? 1 : 0,
    m.premultipliedAlpha ? 1 : 0, m.polygonOffset ? 1 : 0,
    m.polygonOffsetFactor ?? 0, m.polygonOffsetUnits ?? 0,
    m.visible ? 1 : 0, m.colorWrite ? 1 : 0, m.shadowSide ?? '-',
    /* Three's own answer to "do these need separate programs". */
    typeof m.customProgramCacheKey === 'function' ? m.customProgramCacheKey() : '-',
  ].join('|');
}

export function shareMaterials(root, animated) {
  const moving = animated ?? new Set();

  /*
   * Every material any animated object holds, collected before a single
   * reference is rewritten. A material is off limits if it appears here at
   * all, even once, and even if a hundred static meshes also use it: the
   * question is not how it is mostly used, it is whether anything writes to
   * it, and one animated holder is enough to mean yes.
   */
  const taboo = new Set();
  root.traverse((o) => {
    if (!moving.has(o) || !o.material) {
      return;
    }
    for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
      if (m) {
        taboo.add(m);
      }
    }
  });

  const canonical = new Map();
  let seen = 0;
  let replaced = 0;
  let skipped = 0;

  root.traverse((o) => {
    if (moving.has(o)) {
      return;
    }
    if (!o.isMesh && !o.isLine && !o.isPoints && !o.isSprite) {
      return;
    }
    const list = Array.isArray(o.material) ? o.material : [o.material];
    const out = [];
    for (const m of list) {
      if (!m) {
        out.push(m);
        continue;
      }
      seen += 1;
      if (taboo.has(m)) {
        skipped += 1;
        out.push(m);
        continue;
      }
      const look = materialLook(m);
      if (look == null) {
        skipped += 1;
        out.push(m);
        continue;
      }
      const first = canonical.get(look);
      if (!first) {
        canonical.set(look, m);
        out.push(m);
        continue;
      }
      if (first !== m) {
        replaced += 1;
      }
      out.push(first);
    }
    o.material = Array.isArray(o.material) ? out : out[0];
  });

  /*
   * Nothing is disposed here. The materials this orphans have never been
   * rendered, so they hold no GPU resource for dispose to release, and the
   * vendored toon factory keeps a module level cache that outlives this
   * scene: disposing something it still hands out would break the next build
   * for no gain. Dropping the last reference is enough, the collector does
   * the rest.
   */
  return { seen, looks: canonical.size, replaced, skipped, taboo: taboo.size };
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
 *
 * HOW COARSELY TO MERGE IS NOT ONE ANSWER, BECAUSE MERGING IS GIVING UP
 * CULLING. The caller wants the merge as coarse as possible, ideally the whole
 * town, since separate objects are what the town is short of. A mesh spanning
 * the town can never be culled out of anything, so it may only be merged that
 * coarsely when nothing but the frustum was ever going to hide it. Two kinds
 * of geometry fail that test and each gets its own cell.
 *
 *   A SHADOW CASTER is culled by a SECOND camera. The shadow camera is a
 *   SHADOW_HALF box that follows the craft, 44 m a side, and a 40 m mesh is
 *   outside it almost always where a town wide one never is. Merging casters
 *   town wide measured as +0.57 M triangles a frame, all of it in the shadow
 *   pass, on a change whose whole purpose was a cheaper frame. They merge at
 *   `shadowCell`.
 *
 *   GEOMETRY THAT IGNORES FOG is hidden by the distance cull and by nothing
 *   else. Everything else in the town fades into FOG_FAR long before the cull
 *   radius, so whether it is culled is invisible. The ink shells do not: their
 *   material is `fog: false`, upstream's choice in ./vendored/core/outline.js
 *   and correct for a walker who never sees that far. Merged town wide they
 *   stopped being distance culled and the far side of the town came back as
 *   solid unfogged black silhouettes hanging above the fog, which the
 *   screenshots in PROGRESS.md show. They merge at `cullCell`, small enough
 *   that buildCullGrid still takes them into a cell rather than into `always`.
 *
 * Everything else merges at `cell`, which the caller sets to Infinity.
 */
export function bakeCity(world, { cell = 40, shadowCell = cell, cullCell = cell } = {}) {
  const root = world.root;
  const { moving: animated, stillRigs } = findAnimated(world);
  /* Rigs first, and their output joins the animated set before anything else
   * looks at it. mergeRigs parents its meshes INSIDE the rig, so the town
   * merge below must not then take them: it would bake the rig's transform
   * into their vertices and reparent them to the root, which is exactly the
   * freeze the animated set exists to prevent. */
  const rigs = mergeRigs(stillRigs);
  for (const m of rigs.made) {
    animated.add(m);
  }
  /* Before anything is bucketed by material identity, make identical
   * materials BE identical, or the bucketing below splits on a distinction
   * that is not one. See shareMaterials above. It needs the animated set, so
   * it cannot run before findAnimated. */
  const shared = shareMaterials(root, animated);
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
    const mat = Array.isArray(o.material) ? o.material[0] : o.material;
    if (!mat) {
      return;
    }
    /* Both reasons an object still needs to be cullable, smallest wins. See
     * the note above: a shadow caster is culled by the shadow camera, and
     * anything the fog does not reach is culled by distance or not at all. */
    let span = cell;
    if (o.castShadow) {
      span = Math.min(span, shadowCell);
    }
    if (mat.fog === false) {
      span = Math.min(span, cullCell);
    }
    /* Infinity divides to a signed zero, and -0 floors to -0, which is why
     * the cell index is normalised rather than used raw: `${-0}` is "0" today
     * but the key should not rest on that. */
    const cx = Number.isFinite(span) ? Math.floor(sphere.center.x / span) : 0;
    const cz = Number.isFinite(span) ? Math.floor(sphere.center.z / span) : 0;
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
      rigsMerged: rigs.rigsMerged,
      rigMeshesFrom: rigs.mergedFrom,
      rigMeshesTo: rigs.mergedTo,
      /* JSON has no Infinity, and a stat that reads as null in the harness is
       * worse than no stat, so the town wide case is named. */
      mergeCell: Number.isFinite(cell) ? cell : 'town',
      mergeShadowCell: shadowCell,
      mergeCullCell: cullCell,
      sharedMaterials: shared,
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
