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
 * The parts of an object's look that a town animates without touching a
 * matrix. Read before and after the probe and compared as a string, which is
 * cheap and total: anything not listed here is something this cannot see, so
 * the list is deliberately wider than the one case known to move.
 */
function materialPulse(o) {
  if (!o.isMesh && !o.isLine && !o.isPoints && !o.isSprite) {
    return '';
  }
  const list = Array.isArray(o.material) ? o.material : [o.material];
  const out = [o.visible ? 1 : 0];
  for (const m of list) {
    if (!m) {
      out.push('-');
      continue;
    }
    out.push(
      m.uuid,
      m.opacity,
      m.transparent ? 1 : 0,
      m.visible ? 1 : 0,
      m.color ? m.color.getHex() : '-',
      m.emissive ? m.emissive.getHex() : '-',
      m.emissiveIntensity ?? '-',
      m.map ? m.map.uuid : '-',
      m.map ? m.map.version : '-',
    );
  }
  return out.join('|');
}

/*
 * Every object the town moves.
 *
 * Returns `moving`, a Set of them and all their descendants, and `stillRigs`,
 * the marked rigs that did not move so much as a matrix during the probe. The
 * second is not a list of things that are safe to merge into the town, it is a
 * list of things that are safe to merge into THEMSELVES: see mergeRigs.
 */
export function findAnimated(world, { releaseStillRigs = false } = {}) {
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
  const beforeLook = new Map();
  world.root.traverse((o) => {
    before.set(o, o.matrixWorld.elements.slice());
    beforeLook.set(o, materialPulse(o));
  });
  for (let i = 0; i < PROBE_STEPS; i += 1) {
    world.update(PROBE_DT);
  }
  world.root.updateMatrixWorld(true);
  const stirred = new Set();
  world.root.traverse((o) => {
    const was = before.get(o);
    if (was === undefined) {
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
    /* A TRANSFORM IS NOT THE ONLY THING A TOWN ANIMATES. onsen.js drives
     * `p.material.opacity` on both steam vents every frame and never moves
     * them by a matrix element, so a probe watching only matrices calls them
     * still. That was survivable while a still rig was merged into ITSELF,
     * keeping its own materials, and it stops being survivable the moment one
     * is merged into the town: the vent's per frame opacity would then be
     * written to a material shared with every other surface in its bucket,
     * and half the town would breathe. */
    if (beforeLook.get(o) !== materialPulse(o)) {
      roots.push(o);
      stirred.add(o);
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

  /*
   * WHETHER A STILL RIG IS HELD OUT AT ALL.
   *
   * Upstream marks a rig `planetRigid` because ITS OWN walker can walk up to a
   * vending machine and press a button, and the note in planet.js says so.
   * That walker does not exist here. Nothing in this shell reaches the town's
   * interaction list: `animation.js`, this map's index.js and src/main.js
   * mention no dispense, no action and no hitbox, and the only thing driving
   * the town is `world.update` on the physics clock, which is exactly what the
   * probe above runs. So a rig that neither moved nor changed its look across
   * a whole 48 s crossing cycle cannot be moved by anything at all here.
   *
   * That makes the marker worth honouring in a weaker way than mergeRigs did.
   * mergeRigs took a still rig and merged it into ITSELF, which turned 936
   * meshes into 154 and stopped there, because a rig merged into itself can
   * only share materials with its own parts. Released into the town merge it
   * shares them with the whole district, and the vending machines and the
   * lineside furniture stop being 180 draw calls carrying 6,000 triangles.
   *
   * The cost of being wrong is a rig frozen at its start position, so the
   * conditions are narrow and all three have to hold: the marker's own
   * subtree moved no matrix element, changed no material property, and this
   * shell has no way to call the rig's action. The first two are measured
   * above. The third is a fact about this repository, and it is the one that
   * would go stale, so it is written down here rather than assumed: IF AN
   * INTERACTION IS EVER WIRED UP, this option is what to turn off.
   */
  const released = releaseStillRigs ? new Set(stillRigs) : new Set();
  for (const r of roots) {
    if (released.has(r)) {
      continue;
    }
    markSubtree(r, moving);
  }
  /* A released rig that sits inside something that DOES move is still moving,
   * and the loop above cannot see that because it walks roots rather than the
   * tree. Cheaper to re-check than to order the loop. */
  for (const r of released) {
    for (let p = r.parent; p; p = p.parent) {
      if (moving.has(p)) {
        markSubtree(r, moving);
        break;
      }
    }
  }
  return { moving, stillRigs: releaseStillRigs ? [] : stillRigs, released: released.size };
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
 * Bake a material's colour into its geometry, so that colour stops splitting
 * the merge.
 *
 * THIS IS THE TOWN'S BIGGEST REMAINING DRAW CALL, AND IT IS NOT GEOMETRY. The
 * merge buckets by material identity, and 1,774 of its buckets hold exactly
 * one mesh: a mesh whose material nothing else in the town shares. Counted,
 * 1,103 of those materials carry NO TEXTURE OF ANY KIND, and stripped of their
 * colour they collapse to 24 distinct looks. They are the same handful of
 * materials painted 1,103 different colours, and every colour is a bucket that
 * cannot form and a draw call nothing can remove.
 *
 * Colour is the one property that does not have to live on the material.
 * Three.js multiplies the material's colour by a per vertex colour attribute,
 * so a white material with the colour written into the vertices draws exactly
 * the same pixels. Do that and 1,103 materials become 24, the meshes land in
 * the same buckets, and they merge.
 *
 * IT IS EXACT, NOT APPROXIMATE. The attribute is filled from `m.color.r/g/b`
 * as three floats, which are already in the renderer's working colour space,
 * against a material colour set to white. White times the original is the
 * original, to the bit. Nothing is quantised and no conversion happens.
 *
 * WHAT IS REFUSED. Anything with a `map` or an `alphaMap`, because those
 * multiply the diffuse and are the part of the look this cannot fold up. NOT
 * a gradientMap or an emissiveMap: the first is the toon lighting ramp and the
 * second is added rather than multiplied, so both ride along on the shared
 * material with their uuid in its key. Refusing them, which the first version
 * did, painted 1,711 meshes where 15,000 were available, because this town's
 * cel factory puts a toon ramp on nearly everything. Anything that
 * already uses vertex colours, because its geometry is already saying
 * something with that attribute. Shader materials, whose colour may not be a
 * uniform called `color` at all. And every material is left untouched: a
 * canonical WHITE COPY is made per look, so a material an animated mesh holds
 * is never modified out from under it.
 *
 * Geometry is cloned per mesh before the attribute is added, because two
 * meshes of different colours routinely share one geometry in this town and
 * writing the attribute into the shared one would paint both.
 */
function lookWithoutColour(m) {
  const tex = (t) => (t ? t.uuid : '-');
  return [
    m.type,
    m.emissive ? m.emissive.getHexString() : '-',
    m.emissiveIntensity ?? '-',
    tex(m.normalMap), tex(m.aoMap), tex(m.lightMap), tex(m.specularMap),
    /* The toon ramp and the emissive map stay ON the shared material, so they
     * belong in the key rather than in the refusal below: neither multiplies
     * the diffuse the way `map` does, so folding colour into the vertices
     * leaves both doing exactly what they did. */
    tex(m.gradientMap), tex(m.emissiveMap),
    m.transparent ? 1 : 0, m.opacity, m.side, m.alphaTest,
    m.depthWrite ? 1 : 0, m.depthTest ? 1 : 0, m.fog ? 1 : 0,
    m.toneMapped ? 1 : 0, m.blending,
    m.wireframe ? 1 : 0, m.flatShading ? 1 : 0, m.dithering ? 1 : 0,
    m.premultipliedAlpha ? 1 : 0, m.polygonOffset ? 1 : 0,
    m.polygonOffsetFactor ?? 0, m.polygonOffsetUnits ?? 0,
    m.colorWrite ? 1 : 0, m.shadowSide ?? '-',
    typeof m.customProgramCacheKey === 'function' ? m.customProgramCacheKey() : '-',
  ].join('|');
}

export function bakeColourToVertices(root, animated) {
  const moving = animated ?? new Set();
  const canonical = new Map();
  let painted = 0;

  /*
   * WHICH LOOKS ACTUALLY MIX COLOURS, counted before anything is painted.
   *
   * The point of this pass is to stop colour from splitting a merge bucket. A
   * look whose every user is the SAME colour was never splitting anything:
   * those materials are already identical in appearance, shareMaterials
   * collapses them to one, and they merge with no help. Painting them anyway
   * writes three floats a vertex to say what the material already said.
   *
   * Measured, that is most of it. P10 is 2x over on this map and the colour
   * attribute is 26.9 MB of it, so a group of one colour is worth finding.
   */
  const coloursPerLook = new Map();
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || moving.has(o) || Array.isArray(o.material)) {
      return;
    }
    const m = o.material;
    if (!m || !o.geometry || !o.geometry.attributes.position) {
      return;
    }
    if (m.isShaderMaterial || m.isRawShaderMaterial || m.vertexColors || !m.color) {
      return;
    }
    if (m.map || m.alphaMap) {
      return;
    }
    const key = lookWithoutColour(m);
    let set = coloursPerLook.get(key);
    if (!set) {
      set = new Set();
      coloursPerLook.set(key, set);
    }
    set.add(m.color.getHex());
  });
  let singleColour = 0;
  for (const set of coloursPerLook.values()) {
    if (set.size < 2) {
      singleColour += 1;
    }
  }

  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || moving.has(o) || Array.isArray(o.material)) {
      return;
    }
    const m = o.material;
    const geo = o.geometry;
    if (!m || !geo || !geo.attributes.position) {
      return;
    }
    if (m.isShaderMaterial || m.isRawShaderMaterial || m.vertexColors || !m.color) {
      return;
    }
    /* Only the two that multiply the diffuse. A gradientMap is the toon
     * lighting ramp and an emissiveMap is added on top, and this town puts a
     * gradientMap on nearly every material it has: refusing them, which the
     * first version did, left 1,711 meshes painted of a possible 15,000. */
    if (m.map || m.alphaMap) {
      return;
    }
    const key = lookWithoutColour(m);
    const mixes = coloursPerLook.get(key);
    if (!mixes || mixes.size < 2) {
      return;
    }
    let white = canonical.get(key);
    if (!white) {
      white = m.clone();
      white.color.setRGB(1, 1, 1);
      white.vertexColors = true;
      /*
       * Material.copy does NOT carry onBeforeCompile, customProgramCacheKey or
       * a live userData reference, and this town's whole look is in them:
       * ./vendored/core/toon.js injects the cool shadow tint through
       * onBeforeCompile and keys the program on the tint's hex. The first
       * version relied on clone() and every painted surface came back with an
       * untinted shadow side, which a pixel diff caught as a 1.4 of 255 shift
       * across the whole frame rather than as anything you could point at.
       *
       * Sharing the closure is correct rather than merely convenient: the
       * cache key IS the tint, and the key above includes the cache key, so
       * every material in this group already has the same tint uniform.
       */
      white.onBeforeCompile = m.onBeforeCompile;
      if (typeof m.customProgramCacheKey === 'function') {
        white.customProgramCacheKey = m.customProgramCacheKey;
      }
      white.userData = m.userData;
      canonical.set(key, white);
    }

    const g = geo.clone();
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    const { r, gr, b } = { r: m.color.r, gr: m.color.g, b: m.color.b };
    for (let i = 0; i < n; i += 1) {
      col[i * 3] = r;
      col[i * 3 + 1] = gr;
      col[i * 3 + 2] = b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    o.geometry = g;
    o.material = white;
    painted += 1;
  });

  return {
    painted,
    colourLooks: canonical.size,
    looks: coloursPerLook.size,
    singleColourLooks: singleColour,
  };
}

/*
 * Pack the town's small canvases into sheets, so that a texture stops being a
 * reason two meshes cannot merge.
 *
 * WHAT THIS IS FOR. Round 27 folded material colour into vertex colours and
 * took 1,103 one mesh merge buckets down to a couple of dozen looks. It could
 * not touch the textured ones, and said so: "a texture is the part of a
 * material that cannot be folded into a vertex attribute". That left the
 * town's signs, posters, shop fronts, hoardings and vending fascias each
 * holding a bucket of one. Measured at the worst viewpoint they are 244 draw
 * calls carrying 5,212 triangles between them, which is 21 triangles a call.
 *
 * A texture cannot be folded into a vertex attribute. It CAN be moved: put
 * every small canvas on one sheet, rewrite each mesh's uvs into its tile, and
 * the meshes now share one material, which is the only thing the merge ever
 * needed. The town generates these canvases itself at build time, so the
 * packer runs over what buildWorld produced rather than over asset files.
 *
 * WHAT IS REFUSED, AND WHY EACH ONE IS REFUSED RATHER THAN FORCED:
 *
 *   A REPEATING TEXTURE cannot go on a sheet at all. Wrapping is a property
 *   of the whole texture, and a tile inside a sheet has no edges of its own
 *   to wrap at: uv 1.3 would land in the neighbouring tile instead of back at
 *   0.3. 96 of the town's 311 textures repeat and every one of them stays
 *   where it is.
 *
 *   UVS OUTSIDE 0 TO 1 are the same problem wearing different clothes, so the
 *   geometry is checked rather than trusted. A mesh whose uvs leave the unit
 *   square is skipped even if its texture claims to clamp.
 *
 *   A SECOND MAP on the same material, an alphaMap or an emissiveMap, would
 *   have to be packed into a second sheet with an identical layout to stay
 *   registered with the first. That is worth doing and it is not worth doing
 *   first, so those materials are counted as misses and left alone.
 *
 * MIPMAPS ARE OFF ON THE SHEET AND THAT IS A REAL COST, not an oversight. A
 * mip level averages across tile boundaries no matter how wide the gutter is,
 * because level n reaches 2^n pixels, so a sign at distance would pick up its
 * neighbour on the sheet. The alternatives are bleeding, or a gutter that
 * wastes most of the sheet, or no mips. Without mips a distant sign aliases
 * instead, which the fog at 65 m keeps short and which is the failure that
 * looks like the town rather than like a bug. The gutter is still there, at
 * two pixels of replicated edge, for the bilinear filter at level zero.
 *
 * COLOUR IS FOLDED HERE rather than left for bakeColourToVertices, because
 * that pass refuses anything carrying a `map` and it is right to: two meshes
 * with different maps cannot share a material however their colour is stored.
 * Once they share a sheet they can, so this pass does the same trick on its
 * own way out, and sets `vertexColors`, which is what makes the colour pass
 * skip them afterwards. The onBeforeCompile, customProgramCacheKey and
 * userData are carried across by hand for the reason round 27 recorded: clone
 * does not take them and the town's whole shadow tint lives in them.
 */
function atlasGroupKey(m, tex) {
  return [
    lookWithoutColour(m),
    tex.colorSpace,
    tex.magFilter,
    tex.anisotropy,
  ].join('|');
}

/* Shelf packing, tallest first. A sheet here holds a few hundred small
 * canvases whose sizes repeat heavily, 108 of the town's textures are
 * 128 by 128, so the shelves come out nearly full and a better packer would
 * buy very little. */
function packShelves(items, maxSize, gutter) {
  const sorted = [...items].sort((a, b) => b.h - a.h || b.w - a.w);
  const sheets = [];
  for (const it of sorted) {
    const w = it.w + gutter * 2;
    const h = it.h + gutter * 2;
    if (w > maxSize || h > maxSize) {
      it.sheet = -1;
      continue;
    }
    let placed = false;
    for (const sheet of sheets) {
      for (const shelf of sheet.shelves) {
        if (shelf.h >= h && shelf.x + w <= maxSize) {
          it.x = shelf.x + gutter;
          it.y = shelf.y + gutter;
          it.sheet = sheet.index;
          shelf.x += w;
          placed = true;
          break;
        }
      }
      if (placed) {
        break;
      }
      if (sheet.used + h <= maxSize) {
        const shelf = { y: sheet.used, x: w, h };
        sheet.shelves.push(shelf);
        sheet.used += h;
        it.x = gutter;
        it.y = shelf.y + gutter;
        it.sheet = sheet.index;
        placed = true;
        break;
      }
    }
    if (!placed) {
      const sheet = { index: sheets.length, shelves: [{ y: 0, x: w, h }], used: h };
      sheets.push(sheet);
      it.x = gutter;
      it.y = gutter;
      it.sheet = sheet.index;
    }
  }
  /*
   * Size each sheet to what it actually holds rather than to maxSize. The
   * first version allocated a full 4096 square canvas per sheet whatever went
   * on it, which for this town's 28.8 megapixels of packable texture was five
   * sheets and 335 MB of it blank. Nothing here needs a power of two: the
   * sheet clamps and carries no mipmaps.
   */
  for (const sheet of sheets) {
    sheet.w = Math.max(1, ...sheet.shelves.map((sh) => sh.x));
    sheet.h = Math.max(1, sheet.used);
  }
  return sheets;
}

/* Edge replicated padding, so the bilinear filter at level zero cannot reach
 * off a tile and pick up the sheet's background. */
function drawTile(ctx, image, x, y, w, h, gutter) {
  ctx.drawImage(image, x, y, w, h);
  for (let g = 1; g <= gutter; g += 1) {
    ctx.drawImage(image, 0, 0, image.width, 1, x, y - g, w, 1);
    ctx.drawImage(image, 0, image.height - 1, image.width, 1, x, y + h + g - 1, w, 1);
    ctx.drawImage(image, 0, 0, 1, image.height, x - g, y, 1, h);
    ctx.drawImage(image, image.width - 1, 0, 1, image.height, x + w + g - 1, y, 1, h);
  }
}

export function atlasTextures(root, animated, { maxSize = 4096, gutter = 2 } = {}) {
  const moving = animated ?? new Set();
  const stats = {
    sheets: 0, sheetPixels: 0, packed: 0, meshes: 0, groups: 0,
    skippedRepeat: 0, skippedUv: 0, skippedSecondMap: 0, skippedNoCanvas: 0,
  };
  if (typeof document === 'undefined' || !document.createElement) {
    stats.skippedNoCanvas = 1;
    return stats;
  }

  /* Any material an animated object holds is off limits, the same rule and
   * the same reason as shareMaterials: one animated holder means something
   * may write to it. */
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

  const groups = new Map();
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || moving.has(o) || Array.isArray(o.material)) {
      return;
    }
    const m = o.material;
    const geo = o.geometry;
    if (!m || !geo || !geo.attributes.uv || !geo.attributes.position) {
      return;
    }
    if (m.isShaderMaterial || m.isRawShaderMaterial || m.vertexColors || !m.color) {
      return;
    }
    if (taboo.has(m)) {
      return;
    }
    const t = m.map;
    if (!t || !t.image || !t.image.width) {
      return;
    }
    if (m.alphaMap || m.emissiveMap || m.normalMap || m.aoMap || m.lightMap) {
      stats.skippedSecondMap += 1;
      return;
    }
    if (t.wrapS !== THREE.ClampToEdgeWrapping || t.wrapT !== THREE.ClampToEdgeWrapping
      || t.repeat.x !== 1 || t.repeat.y !== 1 || t.offset.x !== 0 || t.offset.y !== 0
      || t.rotation !== 0 || t.flipY !== true) {
      stats.skippedRepeat += 1;
      return;
    }
    const uv = geo.attributes.uv;
    let inside = true;
    for (let i = 0; i < uv.count; i += 1) {
      const u = uv.getX(i);
      const v = uv.getY(i);
      if (u < -1e-4 || u > 1 + 1e-4 || v < -1e-4 || v > 1 + 1e-4) {
        inside = false;
        break;
      }
    }
    if (!inside) {
      stats.skippedUv += 1;
      return;
    }
    const key = atlasGroupKey(m, t);
    let g = groups.get(key);
    if (!g) {
      g = { sample: m, textures: new Map(), meshes: [] };
      groups.set(key, g);
    }
    if (!g.textures.has(t.uuid)) {
      g.textures.set(t.uuid, { tex: t, w: t.image.width, h: t.image.height, x: 0, y: 0, sheet: -1 });
    }
    g.meshes.push(o);
  });

  for (const g of groups.values()) {
    /* A group with one texture gains nothing: its meshes already share a
     * material and already merge. */
    if (g.textures.size < 2) {
      continue;
    }
    const items = [...g.textures.values()];
    const sheets = packShelves(items, maxSize, gutter);
    if (!sheets.length) {
      continue;
    }
    const made = [];
    for (const sheet of sheets) {
      const canvas = document.createElement('canvas');
      canvas.width = sheet.w;
      canvas.height = sheet.h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return stats;
      }
      for (const it of items) {
        if (it.sheet !== sheet.index) {
          continue;
        }
        drawTile(ctx, it.tex.image, it.x, it.y, it.w, it.h, gutter);
      }
      const atlas = new THREE.CanvasTexture(canvas);
      atlas.colorSpace = g.sample.map.colorSpace;
      atlas.magFilter = g.sample.map.magFilter;
      atlas.minFilter = THREE.LinearFilter;
      atlas.generateMipmaps = false;
      atlas.wrapS = THREE.ClampToEdgeWrapping;
      atlas.wrapT = THREE.ClampToEdgeWrapping;
      atlas.anisotropy = g.sample.map.anisotropy;
      atlas.needsUpdate = true;
      const mat = g.sample.clone();
      mat.map = atlas;
      mat.color.setRGB(1, 1, 1);
      mat.vertexColors = true;
      /* Clone does not carry these three and this town's shadow tint is in
       * them. Round 27's pixel diff is the record of what happens otherwise. */
      mat.onBeforeCompile = g.sample.onBeforeCompile;
      if (typeof g.sample.customProgramCacheKey === 'function') {
        mat.customProgramCacheKey = g.sample.customProgramCacheKey;
      }
      mat.userData = g.sample.userData;
      made.push({ mat, w: sheet.w, h: sheet.h });
      stats.sheets += 1;
      stats.sheetPixels += sheet.w * sheet.h;
    }

    for (const o of g.meshes) {
      const it = g.textures.get(o.material.map.uuid);
      if (!it || it.sheet < 0) {
        continue;
      }
      const src = o.geometry;
      /* Cloned per mesh: two meshes of different colours on one geometry is
       * routine in this town, and both the uvs and the colour attribute below
       * are per mesh answers. */
      const geo = src.clone();
      const uv = geo.attributes.uv;
      const next = new Float32Array(uv.count * 2);
      for (let i = 0; i < uv.count; i += 1) {
        /* flipY is true on both the tiles and the sheet, so v counts up from
         * the BOTTOM of the sheet while the canvas y counts down from the
         * top. */
        next[i * 2] = (it.x + uv.getX(i) * it.w) / made[it.sheet].w;
        next[i * 2 + 1] = (made[it.sheet].h - it.y - it.h + uv.getY(i) * it.h) / made[it.sheet].h;
      }
      geo.setAttribute('uv', new THREE.BufferAttribute(next, 2));
      const n = geo.attributes.position.count;
      const col = new Float32Array(n * 3);
      const { r, g: gg, b } = o.material.color;
      for (let i = 0; i < n; i += 1) {
        col[i * 3] = r;
        col[i * 3 + 1] = gg;
        col[i * 3 + 2] = b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      o.geometry = geo;
      o.material = made[it.sheet].mat;
      stats.meshes += 1;
    }
    stats.packed += items.filter((it) => it.sheet >= 0).length;
    stats.groups += 1;
  }

  return stats;
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
/*
 * Who casts a shadow.
 *
 * MEASURED FIRST. The shadow pass was 608 of the street viewpoint's 1715 draw
 * calls and 1,089,544 of its 2,765,233 triangles, confirmed two independent
 * ways that agree exactly: `renderer.shadowMap.enabled` false, and castShadow
 * cleared on every mesh, both give 1107 and 1,675,689. 2,511 of the town's
 * 3,736 meshes cast and only 12 of those are town wide merges, so the pass is
 * mostly thousands of tiny objects: 258 of those 608 calls are non instanced
 * meshes under 1.2 m, for about 6,000 triangles between them.
 *
 * IT COSTS TWICE, AND THE SECOND COST IS THE LARGER ONE. bakeCity buckets a
 * caster on `shadowCell` so the shadow camera can cull it, and everything else
 * town wide. With almost everything casting, the static town is drawn as 331
 * separate pieces where it could be about 70. So a window frame that casts a
 * shadow nobody will ever see also holds a merge bucket open.
 *
 * THIS IS A SIZE TEST AND TWO ROUNDS OF SIZE TESTS HAVE ALREADY GONE WRONG.
 * The objection does not transfer, and the difference is the whole reason this
 * is allowed to exist. A size test used for REMOVAL cannot see that a window
 * frame is PART of a building, so it deletes the shop's signage and its
 * awnings, which is what round 26 and round 27 both did. A size test used for
 * CASTING decides only whether a bollard puts a shadow on the pavement inside
 * a 44 m box at 100 km/h. A wrong answer here is invisible rather than
 * structural, and it is reversible by moving one number.
 *
 * SIZE MEANS THE OBJECT'S OWN SIZE, scaled into the world. An InstancedMesh is
 * therefore measured as ONE BLOB rather than as the 40 m chunk it will later
 * be cut into, which is the question actually being asked: not how much
 * planting is in this cell, but whether one leaf cluster's shadow reads.
 *
 * AND THAT IS WHY PLANTING GETS A LOWER BAR THAN PROPS, which is the one part
 * of this that is not a single number. Swept at the street viewpoint against
 * 1715 with everything casting, both thresholds moved together: 0.8 m gives
 * 1363 draw calls, 1.4 m gives 1173, 2.0 m gives 1149. The 190 calls between
 * 0.8 and 1.4 look free and are not, because the interval contains exactly one
 * thing: this town's canopy blob is 1.0 and the cedar's is 1.16, so a single
 * threshold anywhere above 1.0 turns off EVERY TREE SHADOW IN THE TOWN. Round
 * 27 spent 0.26 M triangles keeping the cherry trees on the grounds that they
 * are the reason anyone looks at this town, and their shadow on the road is
 * the same argument.
 *
 * The distinction is real rather than a way of keeping a favourite. A lone
 * 1.0 m bin casts a shadow nobody reads as anything. A hundred and thirty 1.0
 * m blobs in one chunk cast a TREE, and the eye reads the cluster, never the
 * blob. So the bar for a lone object is what it takes to be seen on its own,
 * and the bar for one member of a crowd is only what it takes to be part of
 * one: 1.4 m for a mesh that stands alone, 0.8 m for an instanced set, which
 * puts the canopies clearly inside and the hill tufts and lake reeds at 0.5
 * clearly outside.
 */
export function restrictCasters(root, { minRadius = 0, minRadiusInstanced = minRadius } = {}) {
  if (!(minRadius > 0) && !(minRadiusInstanced > 0)) {
    return { minRadius, minRadiusInstanced, casters: 0, cleared: 0 };
  }
  root.updateMatrixWorld(true);
  let casters = 0;
  let cleared = 0;
  root.traverse((o) => {
    if (!o.isMesh || !o.castShadow) {
      return;
    }
    const g = o.geometry;
    if (!g || !g.attributes || !g.attributes.position) {
      return;
    }
    if (!g.boundingSphere) {
      g.computeBoundingSphere();
    }
    if (!g.boundingSphere) {
      return;
    }
    casterScale.setFromMatrixScale(o.matrixWorld);
    const s = Math.max(
      Math.abs(casterScale.x),
      Math.abs(casterScale.y),
      Math.abs(casterScale.z),
    );
    const bar = o.isInstancedMesh ? minRadiusInstanced : minRadius;
    if (g.boundingSphere.radius * s >= bar) {
      casters += 1;
      return;
    }
    o.castShadow = false;
    cleared += 1;
  });
  return { minRadius, minRadiusInstanced, casters, cleared };
}
const casterScale = new THREE.Vector3();

export function bakeCity(world, {
  cell = 40,
  shadowCell = cell,
  cullCell = cell,
  casterMinRadius = 0,
  casterMinRadiusInstanced = casterMinRadius,
  atlasSize = 4096,
  releaseStillRigs = false,
  shadowProxyCell = 0,
} = {}) {
  const root = world.root;
  const { moving: animated, stillRigs, released } = findAnimated(world, { releaseStillRigs });
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
  /* Colour first: it turns 1,103 one mesh buckets into a couple of dozen, and
   * it has to happen before shareMaterials so that the white copies it makes
   * are what gets deduplicated. */
  /* Textures first, because it is the pass that turns a texture from a reason
   * two meshes cannot merge into a tile they share, and both passes below key
   * on the material it leaves behind. */
  const atlas = atlasTextures(root, animated, { maxSize: atlasSize });
  const painted = bakeColourToVertices(root, animated);
  const shared = shareMaterials(root, animated);
  root.updateMatrixWorld(true);
  /* AFTER mergeRigs and BEFORE the bucketing below, in that order for two
   * reasons. A rig's parts are merged by then, so a vending machine is
   * measured as a machine rather than as its door furniture and keeps its
   * shadow. And the bucket key carries castShadow, so anything cleared here
   * merges town wide instead of holding a `shadowCell` bucket open, which is
   * the larger half of what this is for. */
  const casters = restrictCasters(root, {
    minRadius: casterMinRadius,
    minRadiusInstanced: casterMinRadiusInstanced,
  });
  /* After restrictCasters, so a proxy is only ever made for something that
   * survived the size test, and BEFORE the bucketing, because clearing
   * castShadow on the source is what lets it merge at `cell` rather than at
   * `shadowCell`. */
  const proxies = shadowProxyCell > 0
    ? buildShadowProxies(root, animated, { cell: shadowProxyCell })
    : { group: null, meshes: [], stats: { cells: 0, from: 0, triangles: 0, bytes: 0 } };

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
    /* The proxies are already merged, already in world space, and switched off
     * until the gate turns them on, which the `!o.visible` test above would
     * have skipped them for anyway. Named here so that stops being a
     * coincidence. */
    if (o.userData && o.userData.shadowProxy) {
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

  /* Last, because it asks each mesh about its own material and the merge is
   * what decides which material a mesh ends up with. */
  const trimmed = trimAttributes(root);

  return {
    merged,
    proxies,
    stats: {
      trimmed,
      bakedFrom: sources.length,
      bakedTo: merged.length,
      buckets: buckets.size,
      skippedAnimated,
      skippedInstanced,
      rigsReleased: released,
      rigsMerged: rigs.rigsMerged,
      rigMeshesFrom: rigs.mergedFrom,
      rigMeshesTo: rigs.mergedTo,
      /* JSON has no Infinity, and a stat that reads as null in the harness is
       * worse than no stat, so the town wide case is named. */
      mergeCell: Number.isFinite(cell) ? cell : 'town',
      mergeShadowCell: shadowCell,
      mergeCullCell: cullCell,
      atlas,
      shadowProxies: proxies.stats,
      casterMinRadius: casters.minRadius,
      casterMinRadiusInstanced: casters.minRadiusInstanced,
      castersKept: casters.casters,
      castersCleared: casters.cleared,
      sharedMaterials: shared,
      colourBaked: painted,
    },
  };
}

/*
 * The town's plant and rock sets, by name, and why this is a name list.
 *
 * A NAME LIST IS THE WRONG SHAPE and it is the right answer here anyway. The
 * rule that wants to be measured is "thin the things there are thousands of
 * that nobody counts", and every measured proxy for it is wrong in a way that
 * deletes structure. Per instance size says a fence post is a grass tuft. A
 * high instance count says the same. Triangle share says the same. There is no
 * property on an InstancedMesh that separates a canopy blob from a window
 * mullion, because the difference is what the thing IS.
 *
 * So the sets are named, and the cost of the list going stale is that a future
 * upstream plant does not get thinned, which is a missed optimisation and not
 * a hole in the world. The cost of the measured version being wrong is a
 * building with half its windows. Measured by triangle mass, these sets are
 * 4.31 M of the town's 4.54 M instanced triangles, so the list being narrow
 * costs almost nothing.
 */
const FOLIAGE = [
  'hillTuft', 'hillMoss', 'hillRock',
  'lakeReed', 'lakeReedHead', 'lakePetals',
];

function isFoliage(name) {
  if (!name) {
    return false;
  }
  for (const f of FOLIAGE) {
    if (name.startsWith(f)) {
      return true;
    }
  }
  return false;
}

/*
 * Keep a fraction of the instances in every plant and rock set.
 *
 * Tree canopies are NOT in this list. Remaining trees have their
 * collision authored per leaf cluster, so thinning the blobs after
 * that would put a wall where the drawing no longer is. Hill tufts,
 * moss, rocks and lake reeds are decoration and still thin.
 *
 * WHICH ONES GO IS A HASH, NOT A STRIDE. Keeping every other index would thin
 * whatever spatial order the town happened to generate them in, which for the
 * groves is tree by tree: one tree bald, the next untouched. Hashing the index
 * scatters the removal evenly through every tree instead. The hash is the
 * Knuth multiplicative constant on a 32 bit index, which is deterministic
 * across engines because it is integer arithmetic all the way down, and this
 * has to be the same town in Node and in the browser.
 *
 * The instance buffer is rewritten in place and `count` lowered rather than
 * reallocated, because chunkInstanced runs next and builds correctly sized
 * chunks from what is left, then disposes the source.
 */
export function thinFoliage(root, { keep = 1 } = {}) {
  if (keep >= 1) {
    return { thinnedSets: 0, instancesBefore: 0, instancesAfter: 0 };
  }
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  /* keep is compared against a 32 bit hash, so it becomes a 32 bit threshold
   * once rather than a float divide per instance. */
  const cut = Math.round(keep * 4294967295);
  let sets = 0;
  let before = 0;
  let after = 0;

  root.traverse((o) => {
    if (!o.isInstancedMesh || !isFoliage(o.name)) {
      return;
    }
    sets += 1;
    before += o.count;
    let k = 0;
    for (let i = 0; i < o.count; i += 1) {
      /* >>> 0 keeps it unsigned; Math.imul keeps the multiply in 32 bits
       * instead of drifting into doubles. */
      const h = (Math.imul(i + 1, 2654435761) ^ 0x9e3779b9) >>> 0;
      if (h > cut) {
        continue;
      }
      if (k !== i) {
        o.getMatrixAt(i, m);
        o.setMatrixAt(k, m);
        if (o.instanceColor) {
          o.getColorAt(i, c);
          o.setColorAt(k, c);
        }
      }
      k += 1;
    }
    /* A set thinned to nothing would be a grove that vanished, so one survives
     * whatever the fraction says. */
    o.count = k > 0 ? k : 1;
    after += o.count;
    o.instanceMatrix.needsUpdate = true;
    if (o.instanceColor) {
      o.instanceColor.needsUpdate = true;
    }
    o.computeBoundingSphere();
  });

  return { thinnedSets: sets, instancesBefore: before, instancesAfter: after };
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
    /*
     * `noChunk` is set by whatever OWNS the instance buffer at runtime. The
     * falling blossom is the case and it is not an optimisation question:
     * `petals.js` keeps a {mesh, idx} pair for each of its 980 cards and
     * writes `setMatrixAt(idx)` every step, so splitting the source into
     * per cell copies and detaching it leaves 980 writes going into a mesh
     * that is no longer in the graph. The field simply disappears, with no
     * error anywhere. Chunking is for static sets.
     */
    if (o.userData && o.userData.noChunk) {
      return;
    }
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
      /*
       * REMAPPED, not cloned. The chunk holds instances idx[0..n], so
       * instance k here is source instance idx[k]: copying the source
       * buffer whole handed chunk instance k the colour of SOURCE instance
       * k, which is a different tree. Every chunk after the first got its
       * colours from the wrong end of the set, and a clone of a longer
       * buffer also leaves the tail of it in memory for nothing.
       */
      if (src.instanceColor) {
        const from = src.instanceColor.array;
        const colours = new Float32Array(idx.length * 3);
        for (let k = 0; k < idx.length; k += 1) {
          colours[k * 3] = from[idx[k] * 3];
          colours[k * 3 + 1] = from[idx[k] * 3 + 1];
          colours[k * 3 + 2] = from[idx[k] * 3 + 2];
        }
        chunk.instanceColor = new THREE.InstancedBufferAttribute(colours, 3);
        chunk.instanceColor.needsUpdate = true;
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
      /* Shadow proxies own their own visibility, gated on the shadow box every
       * frame. Letting the distance cull have them too would mean two writers
       * of one flag and the looser one winning. */
      if (child.userData && child.userData.shadowProxy) {
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

/*
 * Shadow proxies: a second copy of the casters that only the shadow pass ever
 * sees, so that the colour pass can merge the town as coarsely as it likes.
 *
 * THE CONFLICT THIS RESOLVES. The colour pass wants the static town merged as
 * coarsely as possible, ideally into one mesh per material for the whole
 * district, because separate objects are what the frame is short of. The
 * shadow pass wants the opposite: the shadow camera is a box 44 m a side that
 * follows the craft, it culls whole OBJECTS, and a mesh spanning the town is
 * never outside it, so a town wide caster submits every triangle it owns on
 * every frame. Round 29 measured the compromise between those two wants at 351
 * draw calls and 800,941 triangles, and no cell size makes both happy: 80 m
 * cells cost the shadow pass, 24 m cells cost the colour pass more.
 *
 * They only conflict because ONE SET OF MESHES IS SERVING BOTH. Give the
 * shadow pass its own copy, cut small enough to cull well, and each side gets
 * the granularity it wants.
 *
 * WHY NOT A HIDDEN LAYER, which is the usual way to do this. three 0.160's
 * `WebGLShadowMap.renderObject` tests `object.layers.test( camera.layers )`
 * against the VIEW camera rather than the shadow camera, so an object the main
 * camera cannot see casts nothing. Checked in the vendored source rather than
 * assumed.
 *
 * WHAT MAKES IT NEARLY FREE INSTEAD. The renderer builds its render list and
 * then runs the shadow pass, and BOTH skip `visible === false`. So a proxy
 * that is only visible while it is inside the shadow box is submitted to the
 * shadow pass exactly when it matters and is in the colour pass only for those
 * few frames, where `colorWrite` and `depthWrite` false make it write nothing
 * at all. At a 24 m cell against a 44 m box that is a handful of objects.
 *
 * POSITIONS ONLY, WHICH IS WHY THE COPY IS AFFORDABLE. MeshDepthMaterial reads
 * position and nothing else, so a proxy carries no normal, no uv and no colour:
 * a quarter of the attribute bytes of the geometry it copies, against a P10
 * budget this map is already over. The alternative, boxes fitted to each
 * object's bounds, is an eighth of that again and it makes a sloped roof cast
 * a rectangle, so the exact geometry is worth its four bytes a vertex.
 *
 * WHAT KEEPS CASTING FOR ITSELF: anything animated, because a proxy baked in
 * world space would stand still while the thing it copies moved, and the
 * instanced planting, because one proxy per canopy blob is thousands of
 * objects to save one draw call each and a tree's shadow is worth having
 * exactly right.
 */
export function buildShadowProxies(root, animated, { cell = 24 } = {}) {
  const moving = animated ?? new Set();
  const cells = new Map();
  const stats = { cells: 0, from: 0, triangles: 0, bytes: 0, cell };
  root.updateMatrixWorld(true);

  const sphere = new THREE.Sphere();
  const box = new THREE.Box3();
  root.traverse((o) => {
    if (!o.isMesh || !o.castShadow || o.isInstancedMesh || moving.has(o)) {
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
    /* Indexed and non indexed geometry cannot merge, and which one a bucket is
     * has to be in the key rather than discovered: mergeGeometries does not
     * throw on a mixed set, it returns null and writes to the console, so the
     * first version of this lost the shadows of whole cells and reported it as
     * 35 console errors against a check that requires none. The town merge
     * above has carried this in its key since it was written. */
    const indexed = geo.index ? 1 : 0;
    const key = `${cx},${cz}|${indexed}`;
    let c = cells.get(key);
    if (!c) {
      c = { cx, cz, geos: [] };
      cells.set(key, c);
    }
    /* Position and index only. A new BufferGeometry rather than a clone,
     * because clone copies every attribute and the whole point is not to. */
    const src = geo.attributes.position;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(src.array.slice(), src.itemSize));
    if (geo.index) {
      g.setIndex(new THREE.BufferAttribute(geo.index.array.slice(), 1));
    }
    g.applyMatrix4(o.matrixWorld);
    c.geos.push(g);
    /* It has a proxy now, so it stops casting for itself. This is what lets
     * the bucketing below merge it at `cell` instead of at `shadowCell`. */
    o.castShadow = false;
    stats.from += 1;
  });

  const group = new THREE.Group();
  group.name = 'shadowProxies';
  group.userData.shadowProxy = true;
  group.matrixAutoUpdate = false;
  /* One material for every proxy in the town. It is never seen: colorWrite and
   * depthWrite off mean the colour pass writes neither pixel nor depth, and
   * the shadow pass replaces it with a depth material anyway. `visible` stays
   * true on the MATERIAL, because three's shadow pass checks it and a false
   * one would cast nothing. */
  const mat = new THREE.MeshBasicMaterial();
  mat.colorWrite = false;
  mat.depthWrite = false;
  mat.name = 'shadowProxy';

  const made = [];
  for (const c of cells.values()) {
    const geo = c.geos.length === 1 ? c.geos[0] : mergeGeometries(c.geos, false);
    if (c.geos.length > 1) {
      for (const g of c.geos) {
        g.dispose();
      }
    }
    if (!geo) {
      continue;
    }
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    /* Off until the gate says otherwise, so a frame that never calls the gate
     * costs nothing rather than drawing the whole town twice. */
    mesh.visible = false;
    mesh.userData.shadowProxy = true;
    mesh.userData.cellX = (c.cx + 0.5) * cell;
    mesh.userData.cellZ = (c.cz + 0.5) * cell;
    group.add(mesh);
    made.push(mesh);
    stats.triangles += geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3;
    stats.bytes += geo.attributes.position.array.byteLength
      + (geo.index ? geo.index.array.byteLength : 0);
  }
  stats.cells = made.length;
  stats.triangles = Math.round(stats.triangles);
  root.add(group);
  return { group, meshes: made, stats };
}

/*
 * Drop attributes no shader will read.
 *
 * P10 is resident vertex attribute bytes and this map is at 98.4 MB against a
 * 48 MB ceiling, which is the budget nothing in this file had ever looked at.
 * Read by attribute: position 28.0 MB, normal 28.0 MB, colour 26.3 MB, uv
 * 16.0 MB, over 2,333,270 vertices.
 *
 * Two of those are being paid for nothing at all.
 *
 * UV IS ONLY READ IF SOMETHING SAMPLES BY IT. three declares the attribute
 * when a uv sampled map is present and not otherwise, so geometry whose
 * material carries no map, alphaMap, emissiveMap, aoMap, lightMap, specularMap
 * or normalMap has a uv buffer that no shader can see. A `gradientMap` does not
 * count and that is the one to get right: a toon ramp is sampled by the
 * lighting dot product rather than by uv, and this town puts one on nearly
 * every material it makes, so treating it as a uv user would refuse almost
 * everything.
 *
 * COLOUR IS ONLY READ IF `vertexColors` IS ON. Round 27 wrote the attribute
 * from the material colour and round 30's atlas does the same, and both leave
 * it on geometry that ends up in a bucket where the material kept its own
 * colour instead.
 *
 * Run AFTER the merge rather than before, because the bucket key carries the
 * attribute signature: stripping uv from some sources and not others would
 * split buckets that should have merged, which trades a draw call for a few
 * kilobytes. After the merge each mesh is asked about its own material and the
 * answer cannot affect anyone else.
 */
export function trimAttributes(root) {
  const seen = new Set();
  const stats = { uvDropped: 0, colourDropped: 0, bytes: 0 };
  const UV_USERS = ['map', 'alphaMap', 'emissiveMap', 'aoMap', 'lightMap', 'specularMap', 'normalMap', 'bumpMap', 'displacementMap', 'roughnessMap', 'metalnessMap'];
  root.traverse((o) => {
    if (!o.isMesh && !o.isPoints && !o.isLine) {
      return;
    }
    const geo = o.geometry;
    if (!geo || seen.has(geo.uuid)) {
      return;
    }
    seen.add(geo.uuid);
    const list = Array.isArray(o.material) ? o.material : [o.material];
    let samplesUv = false;
    let readsColour = false;
    let unknown = false;
    for (const m of list) {
      if (!m) {
        continue;
      }
      /* A shader material's needs are its source, which this cannot read. */
      if (m.isShaderMaterial || m.isRawShaderMaterial) {
        unknown = true;
        break;
      }
      for (const key of UV_USERS) {
        if (m[key]) {
          samplesUv = true;
        }
      }
      if (m.vertexColors) {
        readsColour = true;
      }
    }
    if (unknown) {
      return;
    }
    if (!samplesUv && geo.attributes.uv) {
      stats.bytes += geo.attributes.uv.array.byteLength;
      geo.deleteAttribute('uv');
      if (geo.attributes.uv1) {
        stats.bytes += geo.attributes.uv1.array.byteLength;
        geo.deleteAttribute('uv1');
      }
      stats.uvDropped += 1;
    }
    if (!readsColour && geo.attributes.color) {
      stats.bytes += geo.attributes.color.array.byteLength;
      geo.deleteAttribute('color');
      stats.colourDropped += 1;
    }
  });
  stats.MB = +(stats.bytes / 1e6).toFixed(1);
  return stats;
}
