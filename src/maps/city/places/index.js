/*
 * index.js: the two places this project adds to the freestyle city, and the
 * one function that puts them in it.
 *
 * WHAT IS ADDED, AND WHERE.
 *
 *   工場道 (./road.js)     the works road, off ひばり台四丁目's east arm
 *   旧ひばり製作所 (./works.js)  a disused machine shop, x 20..50, z 84..113
 *   ひばり台市民プール (./pool.js)  the municipal pool, x 53..91, z 82..114
 *
 * All three stand on land the town has never built on: a survey of the built
 * world's own collider list puts nothing at all east of x = 30 past z = 78,
 * and the hills' keep-out rectangle runs to x 88 and z 114, so the ground out
 * there is exactly flat and exactly 0.45 m, which is what `GROUND` in
 * ./kit.js is. Nothing in the existing town is moved, resized, removed or
 * re-coloured by any of it.
 *
 * WHY THIS IS NOT A DISTRICT IN ./vendored/world/index.js.
 *
 * That is where the town's own twenty-odd districts are built, and adding two
 * more to the list would be the obvious thing. It is also an edit to the one
 * vendored file this project has already had to patch once, and /NOTICE says
 * what the rule is: "Everywhere else our shell needs different behaviour from
 * a vendored class, it subclasses or wraps it in our own GPLv3 code under
 * src/maps/city/ rather than editing the vendored copy, so an upstream update
 * is a re-copy plus one patch rather than a merge."
 *
 * So these two are built HERE, from the host side, straight after
 * `buildWorld` returns and before anything in the bake has looked at the
 * scene. Everything the town's own districts get, they get:
 *
 *   - `world.root` is the same group, so ./bake.js merges them into the same
 *     buckets, ./drawn.js sees their geometry, the cull grid cells them and
 *     the collider fit inspects their boxes.
 *   - `world.colliders` is the same array, APPENDED to and never inserted
 *     into, because `findBoomBlocks` identifies the level crossing's two
 *     booms by INDEX and animation.js holds those indices for the life of
 *     the map.
 *   - `world.platforms` and `world.cuts` are the same arrays, and
 *     `world.heightAt` closes over both, so a roof here is landable and the
 *     empty pool is a hole in the ground.
 *
 * The one thing the district list would have given them is a place in the
 * town's single planting merge. They get their own instead, which costs about
 * ten draw calls for one more merged trunk mesh and its instanced canopies,
 * and is the whole price of leaving the vendored tree alone.
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
import { buildSakura, buildGrove, buildShrubs } from '../vendored/world/trees.js';
import { buildFallenPatches } from '../vendored/world/petals.js';
import { buildWorksRoad } from './road.js';
import { buildWorks, WORKS_SITE, WORKS_LANDMARK } from './works.js';
import { buildPool, POOL_SITE, POOL_LANDMARK } from './pool.js';

/**
 * The town's builder context, over a world that is already built.
 *
 * `buildWorld` hands its districts an object with `add`, `collide`,
 * `platform`, `cut`, `groundAt`, `interact` and `update` on it, and every
 * helper in ./vendored/world/ground.js, plots.js, props.js and trees.js is
 * written against exactly that shape. This is the same shape over the
 * finished world, so those helpers work here unchanged: the fence round the
 * works is the same `meshFence` as the one round the school, and the lamp
 * standards on the works road are the same `poleRun` as the ones on 四丁目's
 * lane.
 *
 * `update` is a real list and not a no-op, even though nothing registers on
 * it today. A no-op would silently swallow an animated part somebody adds
 * later, which is the kind of thing that is only ever noticed by a pilot
 * asking why the thing that moves does not.
 */
export function placeContext(world) {
  const updaters = [];
  return {
    scene: world.root.parent,
    root: world.root,
    colliders: world.colliders,
    interactables: world.interactables,
    updaters,
    add: (obj) => {
      world.root.add(obj);
      return obj;
    },
    /* Appended, never inserted. See the note at the top of this file. */
    collide: (x0, z0, x1, z1, top, bottom, skipFit) => {
      world.colliders.push({
        x0: Math.min(x0, x1),
        x1: Math.max(x0, x1),
        z0: Math.min(z0, z1),
        z1: Math.max(z0, z1),
        top,
        bottom,
        skipFit: skipFit === true,
      });
    },
    platform: (p) => world.platforms.push(p),
    cut: (c) => world.cuts.push(c),
    /* The same answer the town's own `ctx.groundAt` gives: cuts and platforms
     * included, with no `fromY`, which is what a builder seating a prop
     * wants. */
    groundAt: (x, z) => world.heightAt(x, z),
    interact: (i) => world.interactables.push(i),
    update: (fn) => updaters.push(fn),
  };
}

/**
 * Build both places into a finished town.
 *
 * Returns the planting it merged, the references it measured and the
 * updaters it collected, so `src/maps/city/index.js` can report and drive
 * them without knowing what is in either place.
 */
/*
 * THE HOLE IN THE GROUND, and it is the one thing an empty swimming pool
 * needs that no amount of boxes can give it.
 *
 * `street.js` lays one 320 by 320 m displaced grid over the whole valley and
 * calls it the terrain. `ctx.cut` pulls the HEIGHT QUERY down, which is what
 * makes the bowl a bowl to a quad, and it does nothing at all to that mesh:
 * the drawn ground closes straight over the top of the pool and from a metre
 * up the lido is invisible. Measured, and it is exactly what the first build
 * of it looked like: a flat field where a 25 m pool ought to be.
 *
 * The town already solved this once, for the drainage channel, and wrote down
 * why the obvious alternative does not work (`landform.js`): displacing the
 * grid downward is useless, because at 2 m tessellation a hole comes out as a
 * coarse V whose sides climb back through whatever is in it. What works is
 * REMOVING the faces and sealing the edge with something solid. `cutTrench`
 * does exactly that, and it is hard wired to the canal's own footprint, so
 * this is the same rule over a rectangle we pass in.
 *
 * ANY VERTEX, not the centroid, for the reason landform.js gives: it
 * guarantees no surviving triangle reaches into the footprint, so nothing
 * pokes up through the pool floor. The cost is that the hole is up to one
 * cell bigger than asked for in each direction, and the caller has to seal
 * that. The grid is 2 m, so the overshoot is 2 m; the lido's apron is 2.2 m
 * of real slab all the way round. The measured extent is returned so the
 * apron can be checked against it rather than trusted.
 */
export function cutGround(root, rects) {
  const stats = { meshes: 0, dropped: 0, x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
  if (!rects.length) {
    return stats;
  }
  const inside = (x, z) => rects.some((r) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1);
  root.traverse((o) => {
    if (!o.isMesh || o.name !== 'terrain' || !o.geometry || !o.geometry.index) {
      return;
    }
    const geo = o.geometry;
    const pos = geo.attributes.position;
    const src = geo.index.array;
    const keep = [];
    let dropped = 0;
    for (let t = 0; t < src.length; t += 3) {
      const a = src[t];
      const b = src[t + 1];
      const c = src[t + 2];
      if (inside(pos.getX(a), pos.getZ(a))
        || inside(pos.getX(b), pos.getZ(b))
        || inside(pos.getX(c), pos.getZ(c))) {
        dropped += 1;
        for (const i of [a, b, c]) {
          stats.x0 = Math.min(stats.x0, pos.getX(i));
          stats.x1 = Math.max(stats.x1, pos.getX(i));
          stats.z0 = Math.min(stats.z0, pos.getZ(i));
          stats.z1 = Math.max(stats.z1, pos.getZ(i));
        }
        continue;
      }
      keep.push(a, b, c);
    }
    if (!dropped) {
      return;
    }
    geo.setIndex(keep);
    geo.computeBoundingSphere();
    stats.meshes += 1;
    stats.dropped += dropped;
  });
  /* The planet sphere is the other ground surface and it does NOT need
   * cutting here, unlike the canal's case. It sits 65 mm under the grid only
   * where the grid is level with it; at the lido's latitude the
   * equirectangular mapping has already carried it 26 m below, and the bowl
   * is sealed on top by its own floor and walls and round the edge by the
   * apron, so there is no line of sight to it at all. */
  return stats;
}

export function buildPlaces(world) {
  const t0 = (typeof performance !== 'undefined' ? performance.now() : 0);
  const ctx = placeContext(world);
  const colliders0 = world.colliders.length;
  const platforms0 = world.platforms.length;
  const children0 = world.root.children.length;

  const parts = [buildWorksRoad(ctx), buildWorks(ctx), buildPool(ctx)];

  /* The one hole either place needs cut in the drawn ground. See cutGround. */
  const holes = parts.flatMap((p) => p.holes ?? []);
  const cut = cutGround(world.root, holes);

  /*
   * The planting, merged once at the end, exactly as the town does it. Every
   * cherry in these two places and along the road between them ends up in one
   * baked trunk mesh and three instanced canopies; the same for the green
   * stands and the same for the scrub.
   *
   * NOT THINNED. `thinSpots` runs a hash over the town's 943 grove spots and
   * 302 cherries and keeps 28 percent of them, which is right for planting
   * that was generated by the hundred. These are authored one at a time and
   * every one of them is doing a job: closing the end of the works road,
   * standing over the pool fence so the blossom lands in the empty bowl,
   * breaking the corner of the shed. A hash that removed a third of them
   * would take the composition with it.
   */
  const sakura = parts.flatMap((p) => p.sakura ?? []);
  const grove = parts.flatMap((p) => p.grove ?? []);
  const shrubs = parts.flatMap((p) => p.shrubs ?? []);
  const petals = parts.flatMap((p) => p.petals ?? []);
  if (sakura.length) {
    buildSakura(ctx, sakura);
  }
  if (grove.length) {
    buildGrove(ctx, grove);
  }
  if (shrubs.length) {
    buildShrubs(ctx, shrubs);
  }
  /* And the drifts under them. Same three instanced meshes the town's own
   * fallen blossom uses, so this is three draw calls however many patches
   * feed it. */
  buildFallenPatches(ctx, petals);

  const references = {};
  for (const p of parts) {
    Object.assign(references, p.references ?? {});
  }

  return {
    references,
    updaters: ctx.updaters,
    sites: { works: WORKS_SITE, pool: POOL_SITE },
    landmarks: { works: WORKS_LANDMARK, pool: POOL_LANDMARK },
    planting: { sakura: sakura.length, grove: grove.length, shrubs: shrubs.length, petals: petals.length },
    stats: {
      /* Measured here rather than inferred from the loading bar's world
       * stage, which on this container swings by a second between runs on
       * the town alone. */
      ms: +((typeof performance !== 'undefined' ? performance.now() : 0) - t0).toFixed(0),
      groundCut: cut.dropped
        ? {
          triangles: cut.dropped,
          extent: [+cut.x0.toFixed(1), +cut.x1.toFixed(1), +cut.z0.toFixed(1), +cut.z1.toFixed(1)],
          asked: holes.map((h) => [h.x0, h.x1, h.z0, h.z1]),
        }
        : null,
      colliders: world.colliders.length - colliders0,
      platforms: world.platforms.length - platforms0,
      cuts: world.cuts.length,
      objects: world.root.children.length - children0,
    },
  };
}
