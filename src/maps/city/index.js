/*
 * city.js: the freestyle map. A whole Japanese suburban railway crossing
 * town, vendored from sakura-crossing under MIT and flown rather than walked.
 *
 * WHAT IS OURS AND WHAT IS THEIRS. Everything under ./vendored/ is Kenton
 * Wang's, MIT, and stays that way: see /NOTICE and ./vendored/LICENSE. This
 * file is ours, GPLv3, and it is the whole of the join. It builds the town,
 * lights it, gives it a contact model a quad can crash into, and drives its
 * one moving part from the physics clock instead of from frame time.
 *
 * THE FLAT AUTHORING IS TAKEN, THE PLANET IS NOT. The town is authored on a
 * flat plane and its own source says so at the bake call site: "Everything
 * above this line is still authored on a flat plane and has no idea the
 * planet exists". `bakeToPlanet` is a pure post pass over the object graph,
 * so it is a choice. We decline it, for two reasons that both matter.
 *
 *   1. Our physics is right handed Z up and the conversion to three.js Y up
 *      happens exactly once, in src/render/frame.js. A sphere of radius 160 m
 *      compresses x by cos(z / R), which is 0.37 at z = -190, and no single
 *      conversion can express that. Taking the flat authoring means the town
 *      drops into our space with NO transform and frame.js is not touched.
 *   2. The bake bends every mesh onto a 160 m sphere, which gives every one
 *      of them a bounding sphere the size of the planet, which disables
 *      frustum culling for the whole world. Measured both ways in this file's
 *      round of PROGRESS.md.
 *
 * The cost is the curved horizon, which is a look rather than a feature, and
 * the town's x wrap, which a quad has no reason to reach.
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
import { PAL } from './vendored/core/palette.js';
import { Pipeline } from './vendored/core/post.js';
import { buildSky } from './vendored/core/sky.js';
import { setOutlineResolution } from './vendored/core/outline.js';
import { buildWorld } from './vendored/world/index.js';
import { Colliders } from '../../game/collide.js';
import { disposeSceneGraph } from '../../render/shell.js';
import { SESSION_TEXTURES } from '../../render/session-textures.js';
import { cityAnimation, findBoomBlocks } from './animation.js';
import { bakeCity, buildCullGrid, chunkInstanced } from './bake.js';
import { cityReferences, boomColliderExtent } from './references.js';
import { yieldToPaint } from '../../ui/loading.js';

/*
 * Where a run starts. On the road south of the level crossing, facing north
 * up the street at the crossing and the shop, which is the town's own
 * establishing shot and the densest thing to fly at. Yaw is measured the same
 * way the race field measures it, as a rotation about world up with zero
 * along +z, so facing -z (north up the street) is pi.
 */
const SPAWN = { x: 0, z: 24, yaw: Math.PI };

/*
 * Fog and far plane.
 *
 * The town's own values are a fog of 44 to 205 m and a far plane of 600, set
 * for a walker with a 1.7 m eye whose sight lines are down streets. A quad
 * climbs, and from 60 m up the whole district is inside one frustum, so the
 * far plane has to hold the far side of the town and the fog has to not eat
 * it. 320 m of fog end and a 900 m far plane is what the measurements in
 * PROGRESS.md settled on: it keeps the hills behind the town readable from
 * altitude without turning the street level view into a clear day, which
 * would cost both the look and the draw call count.
 */
const FOG_NEAR = 45;
const FOG_FAR = 135;
const CAMERA_FAR = 900;

/*
 * Distance past which a district's contents are hidden outright.
 *
 * This is not an optimisation looking for a problem. A walker sees about 23 m
 * of ground; a quad at 80 m sees the entire town, and the town is drawn as
 * thousands of separate small meshes because nothing that draws it ever
 * expected them all to be in one frustum. Frustum culling alone cannot help
 * with a view that genuinely contains everything. So the far half of the town
 * is dropped past this radius, measured from the camera, on a grid of cells
 * whose contents are grouped at build time. Numbers in PROGRESS.md.
 */
const CULL_RADIUS = 145;
const CULL_CELL = 40;
const SHADOW_HALF = 22;

/*
 * The city's pipeline, with the two things it does to a shared renderer
 * undone.
 *
 * `Pipeline.setSize` forces `renderer.setPixelRatio(1)` and calls
 * `renderer.setSize(w, h, true)`. Both are correct for a page that owns its
 * renderer and wrong for ours: the pixel ratio is the session's and the race
 * field's render targets are sized against it, and `updateStyle` true writes
 * inline width and height onto a canvas the stylesheet sizes. Subclassing
 * rather than patching the vendored file keeps ./vendored/core/post.js byte
 * identical to upstream.
 */
class CityPipeline extends Pipeline {
  constructor(renderer, scene, camera, opts) {
    super(renderer, scene, camera, opts);
    this.shellPixelRatio = renderer.getPixelRatio();
  }

  setSize(w, h) {
    super.setSize(w, h);
    this.renderer.setPixelRatio(this.shellPixelRatio);
    this.renderer.setSize(w, h, false);
    setOutlineResolution(this.size.x, this.size.y);
  }
}

/*
 * The city's contact model.
 *
 * The town's colliders are axis aligned rectangles with a `top` and, rarely, a
 * `bottom`. Read as the walker reads them, `top` is a ceiling: the walker
 * skips any collider whose top is at or below its feet, which is how it steps
 * over a kerb. So a rectangle with a top and no bottom is a solid box from the
 * ground up to `top`, not an infinitely tall wall, and a quad at altitude
 * flies over a signpost exactly as a walker steps over a kerb. The count of
 * colliders with no `top` at all is measured and published in stats().
 *
 * Platforms are the other half of the model and they are what makes a city
 * worth flying: a roof, the supermarket roof car park and the overbridge deck
 * are surfaces you can land on. `heightAt(x, z, fromY)` already returns them,
 * gated on being within a step of where the query is made from, which is
 * exactly the behaviour a quad wants: above a deck you land on it, below it
 * you fly under it. What `heightAt` cannot express is that a deck is also
 * solid from underneath, so every platform raised more than PLATFORM_SOLID_MIN
 * above the bare ground gets a thin slab collider as well. The slab's top sits
 * 2 cm below the deck so that a craft descending onto it meets the landing
 * judgement first and the slab only ever catches something arriving from
 * below.
 */
const PLATFORM_SOLID_MIN = 0.6;
const PLATFORM_SLAB_THICK = 0.25;
const PLATFORM_SLAB_CLEAR = 0.02;
/* Below any terrain in this town, so a box with no `bottom` reaches the
 * ground. The lake bed is the deepest thing here at about -7 m. */
const BOX_FLOOR = -60;
/* Above anything in this town, for the rare box with no `top` at all. */
const BOX_CEIL = 400;

function buildColliders(world) {
  const colliders = new Colliders();
  let noTop = 0;
  let noBottom = 0;
  for (const c of world.colliders) {
    const y1 = c.top === undefined ? BOX_CEIL : c.top;
    const y0 = c.bottom === undefined ? BOX_FLOOR : c.bottom;
    if (c.top === undefined) {
      noTop += 1;
    }
    if (c.bottom === undefined) {
      noBottom += 1;
    }
    /*
     * EVERY town collider gets a box, in order, with no gaps. Index alignment
     * with world.colliders is what lets animation.js raise and lower the two
     * level crossing booms by index, and a `continue` here for a degenerate
     * box would silently shift every later index by one. A degenerate box is
     * given a valid paper thin extent instead, which is unreachable and which
     * the distance solver can answer, where an inverted lo > hi pair would be
     * a quiet wrong answer.
     */
    colliders.addBox('wall', c.x0, y0, c.z0, c.x1, y1 > y0 ? y1 : y0 + 0.001, c.z1);
  }
  let slabs = 0;
  for (const p of world.platforms) {
    /* fromY far below excludes every platform from the query, so this is the
     * bare ground under the platform: exactly what "how high is this deck"
     * has to be measured against. */
    const cx = (p.x0 + p.x1) * 0.5;
    const cz = (p.z0 + p.z1) * 0.5;
    const bare = world.heightAt(cx, cz, -1000);
    if (p.top - bare < PLATFORM_SOLID_MIN) {
      continue;
    }
    colliders.addBox(
      'wall',
      p.x0, p.top - PLATFORM_SLAB_THICK, p.z0,
      p.x1, p.top - PLATFORM_SLAB_CLEAR, p.z1,
    );
    slabs += 1;
  }
  return { colliders, noTop, noBottom, slabs };
}

export async function buildMap(shell, onProgress) {
  const renderer = shell.renderer;
  const camera = shell.camera;
  const progress = onProgress ?? (() => {});

  /* PCF, not PCF soft. The town's shadow map covers 68 m at 2048, which is
   * 3.3 cm per texel, and at that density the softer filter smears a fence
   * post's shadow into a smudge. The field sets its own. */
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor(new THREE.Color(PAL.fog), 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(PAL.fog, FOG_NEAR, FOG_FAR);
  camera.far = CAMERA_FAR;
  camera.updateProjectionMatrix();

  /* The two light anime setup the town is authored for: one warm quantised
   * key, one strong cool bounce carrying the shadow side, a weak underside
   * bounce, and a hemisphere so nothing in shadow goes black. Directions are
   * the town's own. Without the planet there is no local surface frame to
   * seat them in, so they are plain offsets from the shadow target. */
  const sun = new THREE.DirectionalLight(PAL.sun, 2.25);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  /*
   * 22 m half width, not the town's 34.
   *
   * The town's shadow camera is sized for a walker who sees 23 m of ground.
   * A quad at 25 m/s crosses 34 m in 1.4 s, and everything inside that box is
   * submitted to the shadow pass twice over, which measured as roughly half
   * of the frame's draw calls. 22 m is 44 m across at 2048, which is 2.1 cm a
   * texel, so contact shadows under the craft get CRISPER as well as cheaper.
   * What it costs is a cast shadow from a building the pilot is about to
   * reach, which at 25 m/s is under a second of warning.
   */
  const half = SHADOW_HALF;
  sun.shadow.camera.left = -half;
  sun.shadow.camera.right = half;
  sun.shadow.camera.top = half;
  sun.shadow.camera.bottom = -half;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 200;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.035;
  scene.add(sun);
  scene.add(sun.target);

  const fill = new THREE.DirectionalLight(PAL.fill, 1.08);
  scene.add(fill);
  scene.add(fill.target);
  const bounce = new THREE.DirectionalLight(0xd8cbe8, 0.34);
  scene.add(bounce);
  scene.add(bounce.target);
  scene.add(new THREE.HemisphereLight(PAL.hemiSky, PAL.hemiGround, 1.12));

  const SUN_OFFSET = new THREE.Vector3(-52, 62, 56);
  const FILL_OFFSET = new THREE.Vector3(48, 26, -44);
  const BOUNCE_OFFSET = new THREE.Vector3(10, -18, 40);

  progress(0.04);
  const sky = buildSky(scene, 500);
  progress(0.08);

  /*
   * The town. `bake: false` is the one patched line in the vendored tree and
   * the reason this map is possible at all; see the header and
   * ./vendored/PATCH-world-index.diff.
   *
   * This is the expensive call and it is synchronous: it builds about
   * nineteen thousand meshes and generates every sign, fascia, lantern and
   * price strip with Canvas2D. Yielding to the event loop around it is what
   * lets the loading screen paint the stage it is on rather than freezing on
   * the previous one.
   */
  await yieldToPaint();
  const world = buildWorld(scene, { bake: false });
  progress(0.86);
  await yieldToPaint();

  const { colliders, noTop, noBottom, slabs } = buildColliders(world);
  /*
   * Find the level crossing booms NOW, before anything runs the town forward.
   *
   * They are identified by being parked below ground, and `top` is RUNTIME
   * state: the town rewrites it on every `world.update`. bake.js then runs the
   * town for 48 simulated seconds to measure what moves, which leaves the
   * crossing in whatever phase that lands on. Measured, PROBE_STEPS in 95 to
   * 117 and 202 to 213 leaves both booms DOWN, and the identification would
   * throw. It happens to work at 120. Doing it here makes the ordering
   * irrelevant instead of lucky.
   */
  const boomIndices = findBoomBlocks(world.colliders);
  colliders.build();
  progress(0.9);

  /*
   * Reference measurements BEFORE the merge. The merge applies each
   * instance's matrix into its vertices, so after it a door is anonymous
   * floats in a shared buffer and there is nothing left to measure.
   */
  const references = cityReferences(world);
  progress(0.91);

  /*
   * Merge, then group for culling, in that order: the cull grid has to see
   * the merged meshes, not the twenty thousand it replaced.
   */
  const baked = bakeCity(world, { cell: CULL_CELL });
  const chunked = chunkInstanced(world.root, { cell: CULL_CELL });
  progress(0.92);
  const cull = buildCullGrid(world.root, { cell: CULL_CELL });
  const anim = cityAnimation(world, colliders, boomIndices);
  /* Measured AFTER cityAnimation has seated the booms at step zero, so it is
   * the extent a quad would actually meet. */
  references.crossingBoomCollider = {
    measured: boomColliderExtent(anim.boomExtentDown(), references.crossingBoomGround),
    unit: 'm',
    real: 'must bracket the drawn arm hinge, with the arms DOWN',
  };
  progress(0.94);

  const pipeline = new CityPipeline(renderer, scene, camera, {
    /*
     * 2.6e6, not the town's own 4.6e6.
     *
     * The pipeline holds three full resolution targets plus a depth texture:
     * half float RGBA for the scene and the ink result at 8 bytes a pixel, a
     * 32 bit depth texture at 4, and a byte RGBA for the grade result at 4,
     * so 24 bytes per pixel of budget. At 4.6e6 that is 110.4 MB, and with
     * the default framebuffer on top the frame lands at 118.7 MB against a
     * 120 MB ceiling, with nothing left for anything else that ever wants a
     * target. At 2.6e6 it is 62.4 MB. The cost is supersampling: the town
     * asks for 1.5x on a low DPI screen and gets about 1.1x at 1080p. The
     * measured effect on the ink is in PROGRESS.md.
     */
    pixelBudget: 2.6e6,
  });
  const d = shell.resize();
  pipeline.setSize(d.w, d.h);

  scene.add(shell.quad);
  progress(1);

  const shadowTarget = new THREE.Vector3();
  function seat(light, offset, origin) {
    light.target.position.copy(origin);
    light.position.copy(origin).add(offset);
    light.target.updateMatrixWorld();
  }

  function updateShadowFocus(target) {
    /* Snapped to a 0.5 m grid. A shadow camera that follows a quad exactly
     * shimmers every texel boundary, and at 3.3 cm per texel that is a
     * crawling edge on every fence in frame. */
    shadowTarget.set(
      Math.round(target.x * 2) / 2,
      Math.round(target.y * 2) / 2,
      Math.round(target.z * 2) / 2,
    );
    seat(sun, SUN_OFFSET, shadowTarget);
    seat(fill, FILL_OFFSET, shadowTarget);
    seat(bounce, BOUNCE_OFFSET, shadowTarget);
    /* The dome is centred on the flat origin, so it has to trail the camera
     * or a quad flying 200 m out flies out of its own sky. */
    sky.dome.position.copy(camera.position);
    sky.clouds.position.copy(camera.position);
    cullTo(camera.position);
  }

  /* Overridable so a sweep can measure the draw call count against the cull
   * radius rather than one value being asserted. Harness only. */
  let cullRadius = CULL_RADIUS;
  let cullR2 = cullRadius * cullRadius;
  function setCullRadius(r) {
    cullRadius = r == null ? CULL_RADIUS : r;
    cullR2 = cullRadius * cullRadius;
  }
  function cullTo(eye) {
    for (let i = 0; i < cull.cells.length; i += 1) {
      const c = cull.cells[i];
      const dx = c.x - eye.x;
      const dz = c.z - eye.z;
      const on = dx * dx + dz * dz <= cullR2;
      if (c.on === on) {
        continue;
      }
      c.on = on;
      for (let j = 0; j < c.items.length; j += 1) {
        c.items[j].visible = on;
      }
    }
  }

  /* Nothing on the field's wall clock decoration path exists here: the town's
   * moving parts are all on the fixed step clock in updateAnim. Present so
   * the shell has one call shape for both maps. */
  function updateWind() {}

  return {
    id: 'city',
    name: 'Freestyle city',
    mode: 'freestyle',
    scene,
    post: pipeline,
    colliders,
    /* No gates, no racing line, no lap. */
    gates: [],
    curve: null,
    spawn: SPAWN,
    attract: { x: SPAWN.x, y: world.heightAt(SPAWN.x, SPAWN.z), z: SPAWN.z, radius: 11, eye: 3.2, aim: 1.2 },
    /*
     * The contact surface, and the third argument is what makes a city fly.
     * `fromY` is the height the query is made FROM: a platform is only
     * eligible if it is within a step of it, so a quad above the overbridge
     * lands on the deck and a quad under it sees the road.
     */
    height: (x, z, fromY) => world.heightAt(x, z, fromY),
    setNextGate() {},
    updateShadowFocus,
    updateWind,
    updateAnim: anim.update,
    references,
    setCullRadius,
    world,
    stats: () => ({
      colliders: colliders.stats(),
      cityColliders: world.colliders.length,
      platforms: world.platforms.length,
      platformSlabs: slabs,
      collidersWithNoTop: noTop,
      collidersWithNoBottom: noBottom,
      cullCells: cull.cells.length,
      cullAlways: cull.always.length,
      cullRadius,
      ...baked.stats,
      ...chunked,
      shadowExtent: SHADOW_HALF,
      pipelineScale: pipeline.scale,
      pipelineSize: { x: pipeline.size.x, y: pipeline.size.y },
      ...anim.stats(),
    }),
    dispose() {
      scene.remove(shell.quad);
      pipeline.dispose();
      disposeSceneGraph(scene, SESSION_TEXTURES);
    },
  };
}
