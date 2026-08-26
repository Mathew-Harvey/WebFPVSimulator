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
/* The road's own centreline, so the title screen's camera flies the street
 * the town was laid out along instead of a circle drawn over the top of it.
 * Already in the import graph through world/index.js, so this costs no
 * module fetch and check 16's module count is unmoved. */
import { centerX, Z_MIN, Z_MAX } from './vendored/world/street.js';
import { Colliders } from '../../game/collide.js';
import { disposeSceneGraph } from '../../render/shell.js';
import { SESSION_TEXTURES } from '../../render/session-textures.js';
import { cityAnimation, findBoomBlocks } from './animation.js';
import {
  bakeCity, buildCullGrid, chunkInstanced, thinFoliage,
} from './bake.js';
import { cityReferences, boomColliderExtent } from './references.js';
import { drawnBoxes } from './drawn.js';
import { yieldToPaint } from '../../ui/loading.js';
import { qualityFor } from '../../render/quality.js';

/*
 * Where a run starts. On the road south of the level crossing, facing north
 * up the street at the crossing and the shop, which is the town's own
 * establishing shot and the densest thing to fly at. Yaw is measured the same
 * way the race field measures it, as a rotation about world up with zero
 * along +z, so facing -z (north up the street) is pi.
 */
const SPAWN = { x: 0, z: 24, yaw: Math.PI };

/*
 * The title screen's flythrough.
 *
 * THE OLD SHOT FLEW THROUGH THE BUILDINGS. It was an 11 m circle round the
 * spawn at 3.2 m, and the spawn is in the middle of a 6.3 m carriageway
 * with shopfronts hard against both footways, so two thirds of every
 * revolution was spent inside somebody's front room. A circle drawn on a
 * street plan does not know there are buildings on it.
 *
 * So the camera flies the ROAD. `centerX(z)` is the same centreline every
 * builder in the town placed itself against, which is what makes this
 * clearance a property of the layout rather than a value somebody tuned by
 * flying it: the carriageway is 6.3 m wide and empty by construction, and
 * anything at street level that is not empty, the crossing, the traffic,
 * the poles, stands off it.
 *
 * Up the street at 3.3 m, over the railway, then out and back over the
 * roofs, which is a lap of the district rather than a lap of one junction
 * and reads as a place rather than as a diorama.
 *
 * THE HOP OVER THE CROSSING IS NOT DECORATION. A train car's roof is at
 * 3.96 m and its pantograph reaches higher, the contact wire is at 4.88 and
 * the messenger at 5.95 (railway.js), so between the road and the wires
 * there is NO height that clears a train. 6.9 m at the crossing is over the
 * messenger with most of a metre to spare, and the district's tallest thing
 * anywhere near the road is a 9.2 m utility pole standing beside it.
 */
const STREET_EYE = 3.3;
const CROSSING_EYE = 6.9;
const CROSSING_SPAN = 15;
/*
 * The return leg's height, and it is set by the TREES.
 *
 * Two forces pull against each other here. Low is better to look at, because
 * the shot aims a fixed drop below a point a fixed distance ahead, so the
 * higher the leg the more of the frame is sky: at 24 m the town was a strip
 * along the bottom edge. But the height query answers with the walkable
 * SURFACE, and a surface is not a canopy. A pass at 14 m read beautifully
 * over the shotengai and put the camera inside a cedar at the school, and a
 * sugi in this town is 10.6 m of trunk before its own scale factor, up to
 * about 12.5 m.
 *
 * So 19 m: over the cedars with six metres to spare, over the 9.2 m utility
 * poles, over the roofs and over the 7.2 m overbridge deck, and low enough
 * that the district still fills the frame.
 */
const ROOF_EYE = 19;
/*
 * WHERE THE CLIMB HAPPENS, and it is the whole of what makes this loop
 * flyable.
 *
 * The first version climbed on the turn, and the turn is the one part of
 * the loop that leaves the road: it sweeps out into the school grounds at
 * the north end, and the school has cedars in it. The height query answers
 * with the walkable SURFACE, so a camera told to stay 8 m over the ground
 * flew straight through a canopy, twice, at two different heights. There is
 * no height between the road and the treetops that is safe out there.
 *
 * So the climb moves onto the LAST STRETCH OF ROAD instead. The carriageway
 * is empty by construction, its poles stand beside it and its wires run
 * along it, so a camera rising over the middle of it passes nothing. By the
 * time the turn begins the shot is already at roof height and the turn is
 * flat. The descent at the other end is the same thing mirrored.
 */
const CLIMB_RUN = 24;
/* The lowest the shot ever gets, over any surface. Only the street legs go
 * anywhere near it, and they are over a road. */
const MIN_CLEAR = 2.6;
/* Where the street leg starts and stops. Inside the carriageway's own ends,
 * because the road stops at a dead end north of the school and simply runs
 * out south of the canal. */
const LEG_SOUTH = Z_MAX - 6;
const LEG_NORTH = Z_MIN + 8;
/* Plan offset of the return leg from the outbound one, and the radius of
 * the two turns that join them. The return runs over the blocks east of the
 * road rather than back along the road itself, so the two legs are two
 * different shots rather than the same one at two heights. */
const RETURN_OFFSET = 22;
const TURN_R = RETURN_OFFSET * 0.5;

function smoothstep01(x) {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
}

function crossingEye(z) {
  const k = Math.max(0, 1 - Math.abs(z) / CROSSING_SPAN);
  return STREET_EYE + (CROSSING_EYE - STREET_EYE) * smoothstep01(k);
}

/*
 * Height above the road at z on the street leg: street height, lifted over
 * the crossing, and lifted again into the climb at each end.
 */
function streetEye(z) {
  const base = crossingEye(z);
  const up = Math.max(
    smoothstep01((LEG_NORTH + CLIMB_RUN - z) / CLIMB_RUN),
    smoothstep01((z - (LEG_SOUTH - CLIMB_RUN)) / CLIMB_RUN),
  );
  return base + (ROOF_EYE - base) * up;
}

function cityAttractPath(world) {
  const ground = (x, z) => {
    const bare = world.heightAt(x, z, -1000);
    return Number.isFinite(bare) ? bare : 0;
  };
  const pts = [];
  const push = (x, z, y) => {
    pts.push({ x, y: Math.max(y, ground(x, z) + MIN_CLEAR), z });
  };

  /* Up the street, south to north: down at road height through the middle,
   * over the railway, and climbing out at each end. */
  const legSteps = Math.round((LEG_SOUTH - LEG_NORTH) / 5);
  for (let i = 0; i <= legSteps; i += 1) {
    const z = LEG_SOUTH + (LEG_NORTH - LEG_SOUTH) * (i / legSteps);
    const x = centerX(z);
    push(x, z, ground(x, z) + streetEye(z));
  }

  /*
   * The two turns, as half circles in plan swept AWAY from the town, flat at
   * roof height. Away rather than back over the district on purpose: a turn
   * that cuts inward crosses the leg it just flew, and a closed spline
   * through a self intersection is a knot.
   */
  const turn = (z0, cx, from, to) => {
    const steps = 9;
    for (let i = 1; i <= steps; i += 1) {
      const a = from + (to - from) * (i / steps);
      const x = cx + Math.cos(a) * TURN_R;
      const z = z0 + Math.sin(a) * TURN_R;
      push(x, z, ground(x, z) + ROOF_EYE);
    }
  };

  const northX = centerX(LEG_NORTH);
  const southX = centerX(LEG_SOUTH);
  turn(LEG_NORTH, northX + TURN_R, Math.PI, Math.PI * 2);

  /* Back over the roofs, north to south. */
  for (let i = 1; i < legSteps; i += 1) {
    const z = LEG_NORTH + (LEG_SOUTH - LEG_NORTH) * (i / legSteps);
    const x = centerX(z) + RETURN_OFFSET;
    push(x, z, ground(x, z) + ROOF_EYE);
  }

  turn(LEG_SOUTH, southX + TURN_R, 0, Math.PI);

  return pts;
}

/*
 * Fog and far plane.
 *
 * The town's own values are a fog of 44 to 205 m and a far plane of 600, set
 * for a walker with a 1.7 m eye whose sight lines are down streets. A quad
 * climbs, and from 60 m up the whole district is inside one frustum, so the
 * far plane has to hold the far side of the town and the fog has to not eat
 * it.
 *
 * THE FOG IS WHAT MAKES THE CULL INVISIBLE, so it is set from CULL_RADIUS
 * rather than chosen for itself. Anything switched off at the radius has to
 * already be the fog's colour when it goes, or the cull is a pop instead of a
 * cull, and that means FOG_FAR at or inside the radius rather than past it.
 * It was 135 against a radius of 145, which held; cutting the radius to 100
 * without moving the fog would have left a 35 m band where the town winks out
 * in clear air.
 *
 * HOW SHORT IS SET BY THE FLYING, NOT BY THE FRAME. 65 m of fog at 100 km/h is
 * 2.3 s of sight, which is enough to read a gap and commit to it. The sweep
 * kept paying below that, 1153 draw calls at the worst view for a radius of 50
 * against 1236 for 70, and 45 m of fog is 1.6 s, which is being asked to
 * commit to a line before it exists. 83 draw calls is not worth flying blind,
 * so this stops at the last value a pilot can use rather than at the last one
 * the ledger likes.
 *
 * The far plane stays long. It costs nothing, it is depth precision rather
 * than draw calls, and the sky dome and the hills behind the town live out
 * there.
 *
 * High's live numbers (fog 22 to 65, cull 70, foliage keep 0.65, shadow
 * half 22) live in src/render/quality.js so Medium and Low can scale them
 * without a second copy of the reasoning.
 */
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
 *
 * ROUND 29 CHANGED WHAT THIS LEVER IS WORTH, so the value moved with it. When
 * almost everything cast a shadow, cutting the radius from 100 to 70 bought
 * 174 draw calls at street and the conclusion was that the radius was a weak
 * lever. With the casters restricted it buys 402 at the worst view, 1638 to
 * 1236, because the work it removes is no longer being paid for a second time
 * in a shadow pass that the radius cannot reach.
 *
 * THE CELL STAYS AT 40 AND THAT WAS SWEPT, NOT ASSUMED. Coarser cells make
 * fewer instanced chunks, 1200 at 40 m against 458 at 80 m, and every one of
 * the draw calls that saves is handed back in triangles: at 80 m and a 100 m
 * radius the worst view is 3.43 M triangles against 2.51 M at 40 m, because a
 * cell is only dropped once ALL of it is out of range and an 80 m cell rarely
 * is. 40 m is better on both axes at every radius measured.
 */
const CULL_CELL = 40;

/*
 * How finely the shadow proxies are cut. See buildShadowProxies in ./bake.js
 * for what they are and why they exist.
 *
 * Small enough that the 44 m shadow box holds only a few of them, large enough
 * that the handful inside the box are not a draw call each. A 24 m cell puts
 * between four and nine inside the box depending on where the craft sits,
 * against the 351 calls the shadow pass cost when the town cast for itself.
 */

/*
 * How much of the town's hill decoration survives at bake time.
 *
 * Tree canopies are not in this list. Remaining trees have their
 * collision authored per leaf, so thinning the blobs after that would
 * put a wall where the drawing no longer is. Hill tufts, moss, rocks
 * and lake reeds still thin. High keeps 0.48; Medium and Low keep less.
 * The live value is src/render/quality.js.
 */

/*
 * How coarsely the static merge groups geometry, and why it is NOT CULL_CELL.
 *
 * These were one constant, and making them one was a mistake that hid the
 * town's real cost for two rounds. Sweeping it moved three things at once,
 * the merge, the instanced chunking and the cull grid, so every value looked
 * like a bad trade and the conclusion was that there was nothing to win.
 *
 * Measured separately they want opposite things, because the town's draw
 * calls and the town's triangles live in different objects:
 *
 *   static, merged     7229 meshes    1,338,381 triangles
 *   instanced foliage  1565 meshes    4,540,348 triangles
 *
 * The static half is almost all draw call and almost no triangle. At the
 * street viewpoint 1,229,557 of those 1,338,381 triangles were being drawn
 * anyway, so culling the static half at 40 m was buying 8 percent of its
 * triangles at a cost of thousands of separate objects, in a frame of 5981
 * draw calls. A draw call is what the town is actually short of. So the merge
 * is given the whole town, geometry that shares a material becomes one mesh
 * wherever it stands, and the 8 percent is paid gladly.
 *
 * The instanced half is the mirror image: 4.5 M triangles in objects that are
 * already one draw call each, where a bounding sphere spanning a grove means
 * every tree in it is submitted whether or not one is in frame. That half
 * keeps CULL_CELL, and so does the cull grid.
 *
 * buildCullGrid needs no change to cope: it already routes anything whose
 * bounding sphere exceeds a cell into `always`, so a town wide merge is
 * frustum culled and never distance culled, which is the correct handling and
 * not a special case written for this.
 */
/*
 * ROUND 32 PUT THIS BACK TO Infinity, and the reason is a measurement rather
 * than a preference. Splitting the static merge spatially makes it distance
 * cullable, which costs draw calls and buys triangles, monotonically. Swept
 * twice, before and after the texture atlas, worst of four viewpoints at a
 * 70 m radius:
 *
 *   Infinity   1372 calls   2,426,187 triangles
 *   120        1597 calls   2,367,100
 *   80         1611 calls   2,329,544
 *   60         1807 calls   2,069,086
 *
 * 225 draw calls for 59,000 triangles at 120. Draw calls are the binding
 * budget by a wide margin, 3.5x over against 2.0x, so the trade is negative
 * until that stops being true. It is a real lever and it is pointing the wrong
 * way today.
 */
const MERGE_CELL = Infinity;

/*
 * The same, for geometry that casts a shadow, and it is NOT Infinity.
 *
 * A caster is culled by a second camera: the shadow camera is a SHADOW_HALF
 * box that follows the craft, 44 m a side, and a mesh spanning the town is
 * never outside it. Merged town wide the casters put every static triangle
 * into the shadow pass every frame, which measured at +0.57 M triangles on a
 * change whose whole point was a cheaper frame.
 *
 * Swept at the street viewpoint, as draw calls against triangles:
 *
 *    40   4686 calls   3.20 M
 *    80   4041 calls   3.41 M
 *   120   3986 calls   3.47 M
 *   inf   3476 calls   3.76 M
 *
 * 80 is the knee: 40 to 80 buys 645 calls for 0.21 M triangles, and 80 to 120
 * buys 55 for another 0.06 M, which is the same trade four times worse. It is
 * also about twice the shadow box, which is the relationship that makes it the
 * right shape of number rather than a lucky one.
 */
const MERGE_SHADOW_CELL = 80;

/*
 * How big a thing has to be before it casts a shadow.
 *
 * The reasoning, the sweep and the reason a size test is allowed here when two
 * previous ones were not are all at `restrictCasters` in ./bake.js. The short
 * version: the shadow pass was 35 percent of this map's draw calls and 39
 * percent of its triangles, most of it thousands of objects too small to cast
 * a shadow anyone flying could see, and every one of those also held a
 * MERGE_SHADOW_CELL bucket open in the colour pass.
 *
 * Two numbers rather than one, and the reason is the canopy: a single
 * threshold anywhere above this town's 1.0 m canopy blob turns off every tree
 * shadow in the town, and the 190 draw calls that buys are not worth the
 * cherry trees. A mesh standing on its own has to be 1.4 m to cast. One member
 * of an instanced crowd only has to be 0.8, because what the eye reads there
 * is the cluster and never the blob. Hill tufts and lake reeds are 0.5 and
 * stop casting either way.
 */
const CASTER_MIN_RADIUS = 1.4;
const CASTER_MIN_RADIUS_INSTANCED = 0.8;

/*
 * The city's pipeline, with the two things it does to a shared renderer
 * undone.
 *
 * `Pipeline.setSize` forces `renderer.setPixelRatio(1)` and calls
 * `renderer.setSize(w, h, true)`. Both are correct for a page that owns its
 * renderer and wrong for ours: the pixel ratio is the session's and the race
 * field's render targets are sized against it, and `updateStyle` true writes
 * inline width and height onto a canvas the stylesheet sizes. Calling
 * setSize again with updateStyle false does not clear those styles, so they
 * have to be stripped here. Subclassing rather than patching the vendored
 * file keeps ./vendored/core/post.js byte identical to upstream.
 */
class CityPipeline extends Pipeline {
  constructor(renderer, scene, camera, opts) {
    super(renderer, scene, camera, opts);
    this.shellPixelRatio = renderer.getPixelRatio();
    this.minScale = opts && opts.minScale != null ? opts.minScale : 1;
    this.preferScale = opts && opts.preferScale != null ? opts.preferScale : null;
  }

  setSize(w, h) {
    /* Own scale math, not super.setSize. The vendored walker pipeline
     * floors scale at 1.0 so a low-DPI screen supersamples for clean ink.
     * Low on a Deck has to go below 1.0 or the fill rate is the whole
     * frame. High keeps minScale 1 so 1080p matches the measured budget. */
    const dpr = window.devicePixelRatio || 1;
    let scale = this.forceScale
      || this.preferScale
      || (dpr < 1.5 ? 1.5 : Math.min(dpr, 2));
    if (w * h * scale * scale > this.pixelBudget) {
      scale = Math.max(this.minScale, Math.sqrt(this.pixelBudget / (w * h)));
    }
    this.scale = scale;
    const rw = Math.max(2, Math.floor(w * scale));
    const rh = Math.max(2, Math.floor(h * scale));
    this.size.set(rw, rh);

    this.rtScene.setSize(rw, rh);
    this.rtA.setSize(rw, rh);
    this.rtB.setSize(rw, rh);

    const texel = new THREE.Vector2(1 / rw, 1 / rh);
    this.ink.mat.uniforms.uTexel.value.copy(texel);
    this.fxaa.mat.uniforms.uTexel.value.copy(texel);
    this.ink.mat.uniforms.uNear.value = this.camera.near;
    this.ink.mat.uniforms.uFar.value = this.camera.far;
    this.ink.mat.uniforms.uThickness.value = 1.05 + 0.55 * scale;

    this.renderer.setPixelRatio(this.shellPixelRatio);
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '';
    this.renderer.domElement.style.height = '';
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

/*
 * Trimming the town's keep-out volumes down to the things they stand for.
 *
 * THE TOWN'S RECTANGLES ARE NOT THE TOWN'S SURFACES. They were authored for a
 * walker, and a walker's collider is a keep-out volume with the walker's own
 * body allowed for: `plotCollide` pads every building plot by 0.1 m a side,
 * `district.js` pads one frontage by 1.0 m and one flank by 1.8 m, a 1.3 by
 * 0.7 m shed gets a 1.4 by 1.4 m box, and a tree trunk gets 1.15 times its
 * own radius. None of that is visible to a person on foot, who cannot put
 * their shoulder in the 10 cm anyway. All of it is visible to a quad, which
 * is flown at the gaps on purpose and reads a barrier standing off the wall
 * it belongs to as an invisible wall. The owner's report was exactly that:
 * "the collisions need to HUG the graphics, i want to hit gaps but in many
 * places they are actually invisible walls".
 *
 * AND THE RECTANGLE IS THE WRONG SHAPE, NOT ONLY THE WRONG SIZE. A walker
 * cannot go under a torii's lintel, through the gap between two sheds or
 * beneath a verandah, so the town draws one rectangle around each of those
 * and is right to. A quad can do all three, and does it on purpose. So the
 * fit below does not only shrink a rectangle, it CUTS it wherever the drawing
 * inside it leaves a hole big enough to fly.
 *
 * The algorithm is the slab fit, and it is documented where it is written,
 * further down this file. What is here is the vocabulary it works in.
 *
 * It runs before src/maps/city/bake.js for the same reason references.js
 * does: after the merge a wall is anonymous floats in a shared buffer.
 */
/* Footprint above which a mesh is a SURFACE, not an object: the terrain, the
 * road, the canal, the lake. Nothing that large is what a 7 m plot rectangle
 * stands for, and letting one vote would hold every collider it underlies at
 * full size. The largest thing in this town that a collider does stand for is
 * the school block at about 40 by 25 m. */
const FIT_MAX_FOOTPRINT = 1400;
/* Broadphase for the fit itself. Build time only, so a plain Map of arrays is
 * the right shape here where the per frame path would not tolerate it. */
const FIT_CELL = 4;

/*
 * Bounds on the pass that gives a collider to drawn objects that had none.
 * Every one of them is there to keep the pass away from something whose
 * bounding box is not a fair contact volume, and the numbers come from the
 * survey of the town rather than from taste: the widest thing the pass should
 * catch is a bus shelter or a vending bank at about 4 m, the tallest lamp
 * post measured 8.4 m, and the shortest thing worth being solid is a bollard.
 */
const COVER_MIN_HEIGHT = 0.4;
const COVER_MIN_THICK = 0.03;
const COVER_MAX_FOOTPRINT = 12;
const COVER_MAX_SPAN = 6;
/* How far an object's underside may sit above the surface under it and still
 * be treated as standing on the ground. A canopy sits 20 m up; an awning or a
 * sign on a post sits under a metre. */
const COVER_MAX_LIFT = 1.0;
/*
 * How much of its own bounding box an object has to actually fill before a
 * single box is a fair contact volume for it.
 *
 * Without this the pass makes every SEE THROUGH object solid, and a town like
 * this is full of them: a torii is two posts and a lintel inside a 3 by 3 m
 * box that is 90 percent air, and turning that into a block is the exact
 * complaint being fixed here, pointing the other way. Estimated as the sum of
 * the object's own mesh boxes over its union box, which over counts where
 * meshes overlap and therefore only ever errs toward calling something solid
 * that is; a frame or an archway still lands far below the threshold. An
 * object that fails is left exactly as it was, with no collider, because the
 * status quo is better than a wall across a gap the pilot can see through.
 */
const COVER_MIN_FILL = 0.4;
/* Foliage, ground decoration, and see-through frames, excluded by
 * name. Tree leaves are collided as one box per blob in trees.js.
 * A torii, a 渡り廊下, the overbridge cage and a bell housing bake
 * posts and beams into one mesh whose AABB is a wall across the
 * opening; COVER_MIN_FILL cannot save them because that AABB is
 * the fill. Authored posts and beams stay. */
const COVER_SOFT = /canopy|tuft|moss|reed|petal|lily|ripple|windLane|chalk|doormat|paper|crow|cat|ivy|grass|blossom|leaf|flower|strippedClutter|torii|schoolLink|overbridgeCage|schoolBell|openFrame|temizuya|haiden/i;

/*
 * One object's world extent, skipping foliage, or null if it draws nothing.
 * `child` is a direct child of the town root, which is the granularity the
 * town adds things at: one prop, one house, one pole per ctx.add.
 */
const extentBox = new THREE.Box3();
const extentInst = new THREE.Matrix4();
const extentWorld = new THREE.Matrix4();
function objectExtent(child) {
  let x0 = Infinity; let y0 = Infinity; let z0 = Infinity;
  let x1 = -Infinity; let y1 = -Infinity; let z1 = -Infinity;
  let vol = 0;
  let any = false;
  child.traverse((o) => {
    if (!o.isMesh || !o.geometry) {
      return;
    }
    for (let p = o; p && p !== child.parent; p = p.parent) {
      if (COVER_SOFT.test(p.name || '')) {
        return;
      }
    }
    const g = o.geometry;
    if (!g.boundingBox) {
      g.computeBoundingBox();
    }
    if (!g.boundingBox) {
      return;
    }
    const take = (m) => {
      extentBox.copy(g.boundingBox).applyMatrix4(m);
      if (extentBox.min.x < x0) { x0 = extentBox.min.x; }
      if (extentBox.min.y < y0) { y0 = extentBox.min.y; }
      if (extentBox.min.z < z0) { z0 = extentBox.min.z; }
      if (extentBox.max.x > x1) { x1 = extentBox.max.x; }
      if (extentBox.max.y > y1) { y1 = extentBox.max.y; }
      if (extentBox.max.z > z1) { z1 = extentBox.max.z; }
      vol += (extentBox.max.x - extentBox.min.x)
        * (extentBox.max.y - extentBox.min.y)
        * (extentBox.max.z - extentBox.min.z);
      any = true;
    };
    if (o.isInstancedMesh) {
      for (let i = 0; i < o.count; i += 1) {
        o.getMatrixAt(i, extentInst);
        extentWorld.multiplyMatrices(o.matrixWorld, extentInst);
        take(extentWorld);
      }
      return;
    }
    take(o.matrixWorld);
  });
  return any ? { x0, y0, z0, x1, y1, z1, vol } : null;
}

/* Is any authored rectangle already solid at this point? Linear over the
 * town's 2731 rectangles, run once per root child at build time. */
function coveredAlready(list, x, z, y) {
  for (let i = 0; i < list.length; i += 1) {
    const c = list[i];
    if (x < c.x0 || x > c.x1 || z < c.z0 || z > c.z1) {
      continue;
    }
    const top = c.top === undefined ? BOX_CEIL : c.top;
    const bottom = c.bottom === undefined ? BOX_FLOOR : c.bottom;
    if (y >= bottom && y <= top) {
      return true;
    }
  }
  return false;
}

/* The town's drawn geometry now comes from ./drawn.js, which subdivides a
 * sloped mesh into a staircase rather than handing the fit one box for it. */

/*
 * THE SLAB FIT, which is what actually makes the solid world hug the drawn
 * one, and what replaced the ownership vote above.
 *
 * WHAT THE OWNERSHIP VOTE COULD NOT DO, MEASURED. Scanned by ./scan.js
 * against the town as it stood, 3261 of the 5885 authored rectangles had NO
 * geometry that passed the two thirds ownership test, so the fit could say
 * nothing about them and they kept every centimetre of their authored
 * standoff. Another 2190 had owned geometry and were still declined by the
 * coverage rule. The result was 55,083 m3 of solid volume with nothing drawn
 * under it, 1940 boxes reaching over a metre past the drawing, 468 over five
 * metres, and 935 standing on air outright. That is the invisible wall, and
 * it is most of the town.
 *
 * THE IDEA. A rectangle is cut into SLABS across its long axis, each slab a
 * strip spanning the whole of its short axis, and every drawn mesh that
 * touches a slab writes its own extent into it. A slab then knows four
 * things about the drawing standing in it: how high it reaches, how low it
 * starts, and how far across the strip it spreads. Runs of adjacent slabs
 * become one box each, and a box is the UNION of the mesh boxes assigned to
 * it, clipped to the rectangle the town authored.
 *
 * WHY THIS CANNOT OPEN A HOLE, WHICH THE OWNERSHIP VERSION COULD. Every
 * drawn mesh inside the rectangle is assigned to some slab, and every
 * occupied slab is inside some run, and every run box contains the union of
 * its slabs' mesh boxes. So the solid volume always contains the drawn
 * geometry: it is a hull, not a sample. The 78.9 m lineside railing that an
 * earlier version collapsed to a single 0.18 m post cannot collapse here,
 * because each baluster's own box is inside the run that covers it. That is
 * why the coverage rule and the two metre cap are both gone: they existed to
 * guard a fit that could lose geometry, and this one cannot.
 *
 * WHY A SLAB IS A STRIP AND NOT A COLUMN. A strip crosses the whole
 * rectangle, so it meets both of a building's side walls whatever is or is
 * not drawn between them. A column in the middle of a house would see only
 * the roof, whose underside is the eaves, and lifting the box to the eaves
 * would hollow the building out. The strip makes enclosure along the short
 * axis free, and the short axis is split by a second pass over each run, at
 * which point the run is small enough that the same argument holds again.
 *
 * WHAT IS DELIBERATELY LEFT ALONE. A rectangle with nothing drawn in it at
 * all keeps its authored box exactly. It is usually load bearing: the lake
 * edge, the map boundary, a parked level crossing boom.
 */
/* A slab count per rectangle, and the step that follows from it. The step
 * has to resolve GAP_MIN or a gap a quad fits through is invisible to the
 * cut, and it must not be so fine that a 300 m lakeside barrier costs a
 * thousand slabs. */
const SLAB_MAX = 160;
const SLAB_MIN_STEP = 0.12;
const SLAB_MAX_STEP = 0.5;
/*
 * The gap a pilot can actually use.
 *
 * The craft sweeps CRAFT_R, 0.1735 m, so it is 0.347 m across its widest
 * diagonal and a hole has to beat that before anyone can fly it. Half a
 * metre is that with enough margin that the gap reads as a gap on screen
 * rather than as a slot. Anything narrower is merged back into one box,
 * which is why a fence with 0.15 m between its balusters stays a fence and
 * a torii with 2 m between its posts becomes two posts and a lintel.
 */
const GAP_MIN = 0.5;
/* How far above the ground the drawing has to reach before a slab counts as
 * occupied. A road patch, a manhole cover and a painted line are all drawn
 * and none of them is a wall. */
const SLAB_MIN_SOLID = 0.1;
/* A change in the profile this large starts a new run. Same number as the
 * gap, because the question is the same one: is what changed something a
 * quad could fly through. */
const SLAB_STEP_TOL = 0.15;
/* Boxes per authored rectangle, per cut. The cut is greedy and merges the
 * cheapest pair until it is under this, so a busy rectangle loses its least
 * useful gap first rather than its most useful one. */
const MAX_RUNS = 64;
/* And per rectangle over both cuts, so a rectangle full of detail cannot
 * turn into a hundred boxes. */
const MAX_PIECES = 160;
/*
 * Solid volume a split has to save before it is worth a second box.
 *
 * This is the whole box budget, expressed as a price rather than as a count.
 * A count cannot tell a shed from a hipped roof: eight boxes are far too many
 * for the first and nowhere near enough for the second. So a rectangle keeps
 * cutting for as long as each further cut removes at least this much solid
 * volume that has nothing drawn under it, and MAX_RUNS is only the backstop
 * that stops a pathological rectangle running away. A metre and a half is
 * about the volume of the craft's own flight envelope through a gap, which is
 * the smallest amount of invisible wall worth a second entry in the
 * broadphase.
 */
const MERGE_TRIVIAL = 0.25;
/*
 * A box this small is already a leaf cluster, a trunk or a post. Running
 * the slab cut on thousands of them costs load time and can merge two
 * neighbouring leaves into one fatter box. Leave them as authored.
 */
const FIT_TIGHT = 2.4;
/*
 * The fit only ever shrinks, which leaves one thing undone: a house collider
 * authored to the wall plate never reached the ridge, and the roof above it
 * was drawn and not solid. So a run whose footprint is bulky enough to be a
 * building, and over which the drawing reaches a little above the authored
 * top, is raised to it. A little, because a metre or two is a gable and five
 * is a tree overhanging the plot.
 */
const ROOF_LIFT_MIN_FOOT = 1.0;
const ROOF_LIFT_MAX = 2.8;
/* Before a run's floor is lifted off the ground, the space underneath has to
 * be worth flying through. */
const RAISE_MIN_CLEAR = 0.6;

function clampStep(v, lo, hi) {
  if (v < lo) {
    return lo;
  }
  if (v > hi) {
    return hi;
  }
  return v;
}

/*
 * Every drawn mesh box overlapping one rectangle, gathered once.
 *
 * `list` is filled with indices into `boxes` and its length returned. The
 * stamp array is the same duplicate rejection the ownership version used: a
 * mesh in four grid cells must be counted once.
 */
function gatherBoxes(c, boxes, grid, seen, mark, list) {
  let n = 0;
  const ca0 = Math.floor(c.x0 / FIT_CELL);
  const ca1 = Math.floor(c.x1 / FIT_CELL);
  const cb0 = Math.floor(c.z0 / FIT_CELL);
  const cb1 = Math.floor(c.z1 / FIT_CELL);
  for (let a = ca0; a <= ca1; a += 1) {
    for (let b = cb0; b <= cb1; b += 1) {
      const bucket = grid.get(`${a},${b}`);
      if (bucket === undefined) {
        continue;
      }
      for (let bi = 0; bi < bucket.length; bi += 1) {
        const i = bucket[bi];
        if (seen[i] === mark) {
          continue;
        }
        seen[i] = mark;
        list[n] = i;
        n += 1;
        if (n >= list.length) {
          return n;
        }
      }
    }
  }
  return n;
}

/*
 * Cut one rectangle along one axis into boxes that hug what is drawn in it.
 *
 * `rect` is {x0, y0, z0, x1, y1, z1} in world space and is never grown: every
 * box returned is inside it. `alongX` picks the axis to cut. `floorAt` is the
 * bare ground, which is what "reaches above the ground" is measured from and
 * what a lifted floor is measured against.
 *
 * Returns an array of boxes, or null when nothing is drawn in the rectangle,
 * which the caller reads as "leave this one exactly as the town authored it".
 */
function cutAxis(rect, alongX, boxes, list, count, floorAt, scratch) {
  const L0 = alongX ? rect.x0 : rect.z0;
  const L1 = alongX ? rect.x1 : rect.z1;
  const S0 = alongX ? rect.z0 : rect.x0;
  const S1 = alongX ? rect.z1 : rect.x1;
  const span = L1 - L0;
  if (!(span > 0) || !(S1 > S0)) {
    return null;
  }
  let n = Math.ceil(span / clampStep(span / SLAB_MAX, SLAB_MIN_STEP, SLAB_MAX_STEP));
  if (n < 1) {
    n = 1;
  }
  if (n > SLAB_MAX) {
    n = SLAB_MAX;
  }
  const step = span / n;
  const {
    hi, lo, s0, s1, l0, l1,
  } = scratch;
  for (let k = 0; k < n; k += 1) {
    hi[k] = -Infinity;
    lo[k] = Infinity;
    s0[k] = Infinity;
    s1[k] = -Infinity;
    l0[k] = Infinity;
    l1[k] = -Infinity;
  }
  let any = false;
  for (let idx = 0; idx < count; idx += 1) {
    const g = boxes[list[idx]];
    /* Only what is inside the rectangle, in all three axes. A neighbour's
     * wall clipping the corner is deliberately allowed to vote: the box that
     * results still hugs something the pilot can see, which is the whole
     * point, and the ownership rule that used to exclude it is what left
     * three thousand rectangles unfitted. */
    if (g.y1 < rect.y0 || g.y0 > rect.y1) {
      continue;
    }
    const gl0 = Math.max(alongX ? g.x0 : g.z0, L0);
    const gl1 = Math.min(alongX ? g.x1 : g.z1, L1);
    const gs0 = Math.max(alongX ? g.z0 : g.x0, S0);
    const gs1 = Math.min(alongX ? g.z1 : g.x1, S1);
    if (gl1 <= gl0 || gs1 <= gs0) {
      continue;
    }
    let a = Math.floor((gl0 - L0) / step);
    let b = Math.ceil((gl1 - L0) / step) - 1;
    if (a < 0) {
      a = 0;
    }
    if (b > n - 1) {
      b = n - 1;
    }
    if (b < a) {
      b = a;
    }
    const gy1 = Math.min(g.y1, rect.y1);
    const gy0 = Math.max(g.y0, rect.y0);
    for (let k = a; k <= b; k += 1) {
      if (gy1 > hi[k]) {
        hi[k] = gy1;
      }
      if (gy0 < lo[k]) {
        lo[k] = gy0;
      }
      if (gs0 < s0[k]) {
        s0[k] = gs0;
      }
      if (gs1 > s1[k]) {
        s1[k] = gs1;
      }
      /*
       * CLIPPED TO THE SLAB, not to the rectangle, and this line is the
       * difference between a cut and a mess. A 20 m mesh writes into every
       * slab it crosses; if each of those slabs recorded the mesh's whole
       * extent then two runs at opposite ends of it would both claim the
       * middle, the boxes would overlap along their whole length, and the
       * town's solid volume would double. Clipping makes the runs disjoint,
       * so a cut removes volume rather than adding it.
       */
      const sl0 = L0 + k * step;
      const sl1 = sl0 + step;
      const cl0 = gl0 > sl0 ? gl0 : sl0;
      const cl1 = gl1 < sl1 ? gl1 : sl1;
      if (cl0 < l0[k]) {
        l0[k] = cl0;
      }
      if (cl1 > l1[k]) {
        l1[k] = cl1;
      }
    }
    any = true;
  }
  if (!any) {
    return null;
  }

  /* Occupancy, measured against the ground rather than against the box's own
   * bottom, because a box with no authored bottom starts 60 m down. */
  const sMid = (S0 + S1) * 0.5;
  let occupied = 0;
  for (let k = 0; k < n; k += 1) {
    const lMid = L0 + (k + 0.5) * step;
    const ground = alongX ? floorAt(lMid, sMid) : floorAt(sMid, lMid);
    const base = Math.max(rect.y0, ground);
    scratch.floor[k] = base;
    scratch.occ[k] = hi[k] !== -Infinity && hi[k] > base + SLAB_MIN_SOLID ? 1 : 0;
    occupied += scratch.occ[k];
  }
  if (occupied === 0) {
    return null;
  }

  /*
   * Segments: a break wherever the strip stops being drawn, starts being
   * drawn, or steps away from what the run has been so far.
   *
   * AGAINST THE RUN, NOT AGAINST THE PREVIOUS SLAB, and the difference is a
   * roof. Comparing neighbours only breaks on a STEP, and a slope is not a
   * step: at a slab every 0.12 m a 30 degree pitch changes height by 0.07 m
   * between neighbours and never trips any threshold worth having, so the
   * whole roof came out as one run at the height of its ridge. Measured, the
   * worst boxes left in the town after the cut first landed were all houses,
   * seven to ten metres square with the drawing reaching the top of the box
   * over five percent of its footprint and six metres of nothing above the
   * rest. Compared against the run's own accumulated extent, the same slope
   * breaks every time it has fallen SLAB_STEP_TOL below the run, which is a
   * staircase down the pitch with treads that size.
   */
  const segs = [];
  let cur = null;
  for (let k = 0; k < n; k += 1) {
    if (!scratch.occ[k]) {
      cur = null;
      continue;
    }
    if (cur !== null
      && Math.abs(Math.max(cur.hi, hi[k]) - Math.min(cur.hi, hi[k])) <= SLAB_STEP_TOL
      && Math.abs(Math.max(cur.lo, lo[k]) - Math.min(cur.lo, lo[k])) <= SLAB_STEP_TOL) {
      cur.hi = Math.max(cur.hi, hi[k]);
      cur.lo = Math.min(cur.lo, lo[k]);
      cur.s0 = Math.min(cur.s0, s0[k]);
      cur.s1 = Math.max(cur.s1, s1[k]);
      cur.l0 = Math.min(cur.l0, l0[k]);
      cur.l1 = Math.max(cur.l1, l1[k]);
      cur.floor = Math.min(cur.floor, scratch.floor[k]);
      continue;
    }
    cur = {
      hi: hi[k],
      lo: lo[k],
      s0: s0[k],
      s1: s1[k],
      l0: l0[k],
      l1: l1[k],
      floor: scratch.floor[k],
    };
    segs.push(cur);
  }
  if (segs.length === 0) {
    return null;
  }

  /*
   * Merge back everything that is not a gap a quad could fly.
   *
   * Two runs stay apart only if what is between them is at least GAP_MIN
   * across, or one of them starts at least GAP_MIN higher off the ground
   * than the other. A fence's balusters fail the first, a kerb's dropped
   * crossing fails the second, and a torii passes. Everything else is
   * merged cheapest pair first until the rectangle is inside its box budget.
   */
  const vol = (a) => (a.l1 - a.l0) * (a.s1 - a.s0) * (a.hi - a.lo);
  const cost = (a, b) => {
    const ul0 = Math.min(a.l0, b.l0);
    const ul1 = Math.max(a.l1, b.l1);
    const us0 = Math.min(a.s0, b.s0);
    const us1 = Math.max(a.s1, b.s1);
    const uy0 = Math.min(a.lo, b.lo);
    const uy1 = Math.max(a.hi, b.hi);
    return (ul1 - ul0) * (us1 - us0) * (uy1 - uy0) - vol(a) - vol(b);
  };
  const flyable = (a, b) => {
    /* Side by side with room between them: fly through. */
    if (b.l0 - a.l1 >= GAP_MIN) {
      return true;
    }
    /* A step down in the top: fly over the lower one. Merging these was the
     * first version's worst mistake, because the merge takes the taller top
     * and a 36 m lineside barrier inherited the height of the one pylon
     * standing at the end of it. */
    if (Math.abs(a.hi - b.hi) >= GAP_MIN) {
      return true;
    }
    /* A step up in the underside: fly under the higher one. */
    return Math.abs(a.lo - b.lo) >= GAP_MIN;
  };
  const merge = (a, b) => ({
    hi: Math.max(a.hi, b.hi),
    lo: Math.min(a.lo, b.lo),
    s0: Math.min(a.s0, b.s0),
    s1: Math.max(a.s1, b.s1),
    l0: Math.min(a.l0, b.l0),
    l1: Math.max(a.l1, b.l1),
    floor: Math.min(a.floor, b.floor),
  });
  /*
   * Two tiers. Normally a pair is merged when it is cheap and not a gap a
   * pilot could use; a gap is never merged for being cheap. Over MAX_RUNS
   * the budget wins and the cheapest pair goes whatever it is, because an
   * unbounded cut is a broadphase full of slivers.
   */
  for (;;) {
    let at = -1;
    let best = Infinity;
    let atAny = -1;
    let bestAny = Infinity;
    for (let i = 0; i + 1 < segs.length; i += 1) {
      const cc = cost(segs[i], segs[i + 1]);
      if (cc < bestAny) {
        bestAny = cc;
        atAny = i;
      }
      if (flyable(segs[i], segs[i + 1])) {
        continue;
      }
      if (cc < best) {
        best = cc;
        at = i;
      }
    }
    if (at >= 0 && best < MERGE_TRIVIAL) {
      segs.splice(at, 2, merge(segs[at], segs[at + 1]));
      continue;
    }
    if (segs.length > MAX_RUNS && atAny >= 0) {
      segs.splice(atAny, 2, merge(segs[atAny], segs[atAny + 1]));
      continue;
    }
    break;
  }

  const out = [];
  for (const g of segs) {
    /*
     * The floor. A run whose lowest drawn point is well clear of the ground
     * is lifted onto it, which is what turns a torii into two posts and a
     * lintel and a verandah into a roof a quad can fly under. Anything less
     * than RAISE_MIN_CLEAR stays on the rectangle's own bottom, so a wall
     * standing on a 5 cm plinth does not float.
     */
    const lift = g.lo - g.floor >= RAISE_MIN_CLEAR;
    const y0 = lift ? g.lo : rect.y0;
    const y1 = Math.max(y0 + 0.001, Math.min(g.hi, rect.y1));
    out.push(alongX
      ? {
        x0: Math.max(g.l0, rect.x0),
        y0,
        z0: Math.max(g.s0, rect.z0),
        x1: Math.min(g.l1, rect.x1),
        y1,
        z1: Math.min(g.s1, rect.z1),
      }
      : {
        x0: Math.max(g.s0, rect.x0),
        y0,
        z0: Math.max(g.l0, rect.z0),
        x1: Math.min(g.s1, rect.x1),
        y1,
        z1: Math.min(g.l1, rect.z1),
      });
  }
  return out;
}

/*
 * One rectangle, cut along its long axis and then each piece cut again along
 * the other one.
 *
 * The second pass is what opens a courtyard: a plot with a house on one side
 * and a shed on the other is one run after the first cut, because a strip
 * across it meets both. Cutting that run the other way separates them. Two
 * passes and no more, because the third would be cutting pieces already
 * smaller than the craft.
 */
function fitRect(c, y0, y1, boxes, grid, floorAt, scratch, { roof = true } = {}) {
  scratch.mark += 1;
  const count = gatherBoxes(c, boxes, grid, scratch.seen, scratch.mark, scratch.list);
  if (count === 0) {
    /* Nothing drawn anywhere near it, as opposed to something drawn that
     * does not reach above the ground. The audit tells the two apart. */
    scratch.lastEmpty = 'nothing';
    return null;
  }
  scratch.lastEmpty = 'below-ground';
  /*
   * The roof, which a fit that only shrinks could never reach.
   *
   * A house collider is authored to the wall plate and the roof above it was
   * drawn and not solid. Rather than raise a finished box afterwards, which
   * raises it over its whole footprint including the half with no roof on it,
   * the rectangle is simply allowed to reach ROOF_LIFT_MAX higher before the
   * cut runs. The cut then hugs the roof where the roof is and stops at the
   * plate where it is not. Only for a rectangle bulky enough to be a
   * building: a kerb does not grow a gable.
   */
  const bulky = roof && Math.min(c.x1 - c.x0, c.z1 - c.z0) > ROOF_LIFT_MIN_FOOT;
  const rect = {
    x0: c.x0, y0, z0: c.z0, x1: c.x1, y1: bulky ? y1 + ROOF_LIFT_MAX : y1, z1: c.z1,
  };
  /*
   * WHICH WAY TO CUT, MEASURED RATHER THAN GUESSED. The first version cut the
   * longer axis, which is right for a barrier and arbitrary for a house. A
   * gable roof is a staircase in one direction and a flat block in the other,
   * so cutting the wrong way removes nothing. Both are tried and the one that
   * leaves less solid volume wins. It is two passes over a list already in
   * cache, against a fit that costs under a second in total.
   */
  const solid = (list) => {
    if (list === null) {
      return Infinity;
    }
    let v = 0;
    for (const b of list) {
      v += (b.x1 - b.x0) * (b.z1 - b.z0) * (b.y1 - Math.max(b.y0, y0));
    }
    return v;
  };
  const byX = cutAxis(rect, true, boxes, scratch.list, count, floorAt, scratch);
  const byZ = cutAxis(rect, false, boxes, scratch.list, count, floorAt, scratch);
  if (byX === null && byZ === null) {
    return null;
  }
  const alongX = solid(byX) <= solid(byZ);
  const first = alongX ? byX : byZ;
  if (first === null) {
    return null;
  }
  const out = [];
  for (const r of first) {
    if (out.length >= MAX_PIECES) {
      out.push(r);
      continue;
    }
    const second = cutAxis(r, !alongX, boxes, scratch.list, count, floorAt, scratch);
    if (second === null || second.length === 0) {
      out.push(r);
      continue;
    }
    for (const q of second) {
      out.push(q);
    }
  }
  return out;
}

function buildColliders(world) {
  const colliders = new Colliders();
  let noTop = 0;
  let noBottom = 0;

  /* The fit's own index over the drawn meshes. */
  const fitStart = (typeof performance !== 'undefined' ? performance.now() : 0);
  const boxes = drawnBoxes(world.root, { maxFootprint: FIT_MAX_FOOTPRINT });
  const grid = new Map();
  for (let i = 0; i < boxes.length; i += 1) {
    const g = boxes[i];
    const a0 = Math.floor(g.x0 / FIT_CELL);
    const a1 = Math.floor(g.x1 / FIT_CELL);
    const b0 = Math.floor(g.z0 / FIT_CELL);
    const b1 = Math.floor(g.z1 / FIT_CELL);
    for (let a = a0; a <= a1; a += 1) {
      for (let b = b0; b <= b1; b += 1) {
        const k = `${a},${b}`;
        const bucket = grid.get(k);
        if (bucket === undefined) {
          grid.set(k, [i]);
        } else {
          bucket.push(i);
        }
      }
    }
  }
  /*
   * The fit's scratch, allocated once for the whole town. Everything the cut
   * needs per rectangle lives here, so 5885 rectangles do not make 5885 sets
   * of typed arrays during a load that is already the slow part.
   */
  const scratch = {
    lastEmpty: '',
    hi: new Float64Array(SLAB_MAX),
    lo: new Float64Array(SLAB_MAX),
    s0: new Float64Array(SLAB_MAX),
    s1: new Float64Array(SLAB_MAX),
    l0: new Float64Array(SLAB_MAX),
    l1: new Float64Array(SLAB_MAX),
    floor: new Float64Array(SLAB_MAX),
    occ: new Uint8Array(SLAB_MAX),
    seen: new Int32Array(boxes.length),
    mark: 0,
    list: new Int32Array(boxes.length),
  };
  /*
   * The bare ground, cached.
   *
   * fromY far below excludes every platform from the query, so this is the
   * terrain under the town rather than whatever deck happens to be over it,
   * which is what "does the drawing reach above the ground here" has to be
   * measured against. Rounded to a decimetre, well under the finest slab.
   */
  const groundSeen = new Map();
  const floorAt = (x, z) => {
    const k = `${Math.round(x * 10)},${Math.round(z * 10)}`;
    let v = groundSeen.get(k);
    if (v === undefined) {
      v = world.heightAt(x, z, -1000);
      groundSeen.set(k, v);
    }
    return v;
  };
  const fitStats = {
    fitted: 0, unmatched: 0, split: 0, extraBoxes: 0, coverSplit: 0, lifted: 0, topTrims: 0, sideTrims: 0, maxTopTrim: 0, maxSideTrim: 0, totalTopTrim: 0, covered: 0, seeThrough: 0, roofLifts: 0, droppedEmpty: 0, tight: 0, worst: [],
  };
  /*
   * The boxes a split rectangle produced beyond its first.
   *
   * EVERY town collider gets exactly one box at its own index, in order, with
   * no gaps. Index alignment with world.colliders is what lets animation.js
   * raise and lower the two level crossing booms by index, so a rectangle
   * that cuts into four contributes its first piece in place and its other
   * three here, to be added after the whole list has been walked. Nothing
   * downstream indexes past the authored count.
   */
  const extra = [];
  /*
   * One row per authored rectangle, and only when the audit asked for it.
   * See scripts/collider-audit.js.
   */
  /* Rows are the per-rectangle dump. The scan itself does not need them,
   * and stringifying thousands of them is what used to drown the audit. */
  const diag = globalThis.__CITY_SCAN_ROWS ? [] : null;

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
     * The fit. A hull over the drawing inside the rectangle, cut where a
     * quad could fly through, and never grown past what the town authored.
     * See the slab fit above.
     */
    let fx0 = c.x0;
    let fx1 = c.x1;
    let fz0 = c.z0;
    let fz1 = c.z1;
    let fy0 = y0;
    let fy1 = y1;
    const tight = c.skipFit === true
      || ((c.x1 - c.x0) <= FIT_TIGHT && (c.z1 - c.z0) <= FIT_TIGHT);
    const pieces = tight ? null : fitRect(c, y0, y1, boxes, grid, floorAt, scratch);
    if (tight) {
      fitStats.tight += 1;
    } else if (pieces !== null && pieces.length > 0) {
      const p = pieces[0];
      const side = Math.max(p.x0 - c.x0, c.x1 - p.x1, p.z0 - c.z0, c.z1 - p.z1);
      const topTrim = y1 - p.y1;
      if (topTrim > 1e-6) {
        fitStats.topTrims += 1;
        fitStats.totalTopTrim += topTrim;
        if (topTrim > fitStats.maxTopTrim) {
          fitStats.maxTopTrim = topTrim;
        }
      }
      if (side > 1e-6) {
        fitStats.sideTrims += 1;
        if (side > fitStats.maxSideTrim) {
          fitStats.maxSideTrim = side;
        }
      }
      if (side > 0.05 || topTrim > 0.05 || pieces.length > 1) {
        fitStats.worst.push({
          side: +side.toFixed(2),
          topTrim: +topTrim.toFixed(2),
          pieces: pieces.length,
          was: { x: +(c.x1 - c.x0).toFixed(2), z: +(c.z1 - c.z0).toFixed(2), top: +y1.toFixed(2) },
          now: { x: +(p.x1 - p.x0).toFixed(2), z: +(p.z1 - p.z0).toFixed(2), top: +p.y1.toFixed(2) },
          at: [+((c.x0 + c.x1) / 2).toFixed(1), +((c.z0 + c.z1) / 2).toFixed(1)],
        });
      }
      fx0 = p.x0; fx1 = p.x1; fz0 = p.z0; fz1 = p.z1; fy0 = p.y0; fy1 = p.y1;
      if (p.y0 > y0 + 1e-6) {
        fitStats.lifted += 1;
      }
      fitStats.fitted += 1;
      if (pieces.length > 1) {
        fitStats.split += 1;
        for (let k = 1; k < pieces.length; k += 1) {
          extra.push(pieces[k]);
          if (pieces[k].y0 > y0 + 1e-6) {
            fitStats.lifted += 1;
          }
        }
      }
    } else {
      /* Nothing drawn in it. A large barrier with no geometry is usually
       * load bearing (lake edge, map bound). A compact one is dressing
       * whose drawing we stripped: park it below ground, not as a boom
       * (booms are the only two authored at top === -1). */
      fitStats.unmatched += 1;
      const sx = c.x1 - c.x0;
      const sz = c.z1 - c.z0;
      if (c.top !== -1 && sx <= 6 && sz <= 6 && sx * sz <= 12 && y1 < 10) {
        const mx = (c.x0 + c.x1) * 0.5;
        const mz = (c.z0 + c.z1) * 0.5;
        fx0 = mx;
        fx1 = mx + 0.001;
        fz0 = mz;
        fz1 = mz + 0.001;
        fy0 = -2;
        fy1 = -1.999;
        fitStats.droppedEmpty += 1;
      }
    }
    if (diag !== null) {
      const r2 = (v) => (Number.isFinite(v) ? +v.toFixed(3) : null);
      diag.push([
        diag.length,
        r2(c.x1 - c.x0), r2(c.z1 - c.z0), r2(y1),
        r2(fx1 - fx0), r2(fz1 - fz0), r2(fy1),
        pieces === null ? (scratch.lastEmpty === 'nothing' ? -1 : 0) : pieces.length,
        r2(fy0),
        r2((c.x0 + c.x1) * 0.5), r2((c.z0 + c.z1) * 0.5),
      ]);
    }
    /*
     * A degenerate box is given a valid paper thin extent rather than being
     * dropped, because a `continue` here would silently shift every later
     * index by one, and an inverted lo > hi pair would be a quiet wrong
     * answer from the distance solver.
     */
    colliders.addBox('wall', fx0, fy0, fz0, fx1, fy1 > fy0 ? fy1 : fy0 + 0.001, fz1);
  }
  for (const p of extra) {
    colliders.addBox('wall', p.x0, p.y0, p.z0, p.x1, p.y1 > p.y0 ? p.y1 : p.y0 + 0.001, p.z1);
    fitStats.extraBoxes += 1;
  }
  fitStats.ms = (typeof performance !== 'undefined' ? performance.now() : 0) - fitStart;
  fitStats.drawnBoxes = boxes.length;
  fitStats.meanTopTrim = fitStats.topTrims ? fitStats.totalTopTrim / fitStats.topTrims : 0;
  fitStats.worst.sort((a, b) => Math.max(b.side, b.topTrim) - Math.max(a.side, a.topTrim));
  fitStats.worst = fitStats.worst.slice(0, 14);
  /*
   * The other half of hugging the graphics: things that are DRAWN and were
   * never solid at all.
   *
   * The town collides what a walker can walk into, and a walker never walks
   * into a lamp post standing in the middle of a footway, so a great deal of
   * street furniture is scenery. The owner flew it and said so: "the train
   * and lamp posts and many other graphic elements have no collision".
   * Measured at object granularity, which is what ctx.add puts in the root,
   * 403 objects stand on the ground, are at least 0.4 m tall and have no
   * collider over them at all. A 2.4 m lamp post 0.1 m square is the typical
   * one.
   *
   * WHY A FLAT BOX PER OBJECT IS SAFE HERE AND WOULD NOT BE IN GENERAL.
   * Adding the bounding box of every uncovered mesh in the town would make
   * the tunnel bore solid, put a lid on the lake and turn 46000 canopy blobs
   * into walls. So the pass is bounded to COMPACT objects standing on the
   * ground: nothing wider than COVER_MAX_SPAN, nothing with a footprint over
   * COVER_MAX_FOOTPRINT, nothing whose base floats more than COVER_MAX_LIFT
   * above the surface under it. Those bounds exclude buildings, tunnels,
   * hills, roads and the lake by construction, and what is left is furniture,
   * for which its own bounding box IS a fair contact volume.
   *
 * Foliage is collided as one box per leaf blob in trees.js. The
 * cover pass still skips named foliage so canopy instances do not
 * become walls, and skips named frames (torii, schoolLink,
 * overbridgeCage, schoolBell, openFrame) whose baked AABB is a
 * wall across a gap the pilot can see. The tree generators own
 * the mass.
   */
  for (const child of world.root.children) {
    const b = objectExtent(child);
    if (b === null) {
      continue;
    }
    const sx = b.x1 - b.x0;
    const sy = b.y1 - b.y0;
    const sz = b.z1 - b.z0;
    if (sy < COVER_MIN_HEIGHT || Math.min(sx, sz) < COVER_MIN_THICK) {
      continue;
    }
    if (sx * sz > COVER_MAX_FOOTPRINT || Math.max(sx, sz) > COVER_MAX_SPAN) {
      continue;
    }
    const cx = (b.x0 + b.x1) * 0.5;
    const cz = (b.z0 + b.z1) * 0.5;
    if (b.y0 - world.heightAt(cx, cz, -1000) > COVER_MAX_LIFT) {
      continue;
    }
    if (b.vol / Math.max(1e-6, sx * sy * sz) < COVER_MIN_FILL) {
      fitStats.seeThrough += 1;
      continue;
    }
    if (coveredAlready(world.colliders, cx, cz, b.y0 + sy * 0.5)) {
      continue;
    }
    /*
     * And through the same cut as everything else, rather than straight in as
     * a bounding box.
     *
     * The bounds above already keep this pass to compact things standing on
     * the ground, for which a bounding box is a fair contact volume, and
     * COVER_MIN_FILL already turns away a torii or an archway. What they
     * cannot do is anything about the shape of what is left: a signpost with
     * an arm, a shed standing at thirty degrees to the grid, a bus shelter
     * with a bench under an open frame. The slab cut reads all three off the
     * drawing and hugs them, so the box only has to be the envelope it starts
     * from. The roof extension is off here, because unlike a plot rectangle
     * this envelope was measured off the object itself and there is nothing
     * above it to reach for.
     */
    const rect = {
      x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1,
    };
    const pieces = fitRect(rect, b.y0, b.y1, boxes, grid, floorAt, scratch, { roof: false });
    if (pieces === null || pieces.length === 0) {
      colliders.addBox('obstacle', b.x0, b.y0, b.z0, b.x1, b.y1, b.z1);
    } else {
      for (const q of pieces) {
        colliders.addBox('obstacle', q.x0, q.y0, q.z0, q.x1, q.y1 > q.y0 ? q.y1 : q.y0 + 0.001, q.z1);
      }
      if (pieces.length > 1) {
        fitStats.coverSplit += 1;
      }
    }
    fitStats.covered += 1;
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
  if (diag !== null) {
    fitStats.rows = diag;
  }
  return { colliders, noTop, noBottom, slabs, fit: fitStats };
}

export async function buildMap(shell, onProgress, options) {
  const renderer = shell.renderer;
  const camera = shell.camera;
  const progress = onProgress ?? (() => {});
  const q = qualityFor(options && options.quality);
  const fogNear = q.city.fogNear;
  const fogFar = Math.min(q.city.fogFar, q.city.cullRadius - 4);
  const half = q.city.shadowHalf;
  const foliageKeep = q.city.foliageKeep;
  const cullDefault = q.city.cullRadius;

  /* PCF, not PCF soft. The town's shadow map covers 68 m at 2048, which is
   * 3.3 cm per texel, and at that density the softer filter smears a fence
   * post's shadow into a smudge. The field sets its own. Low turns the
   * map off. */
  renderer.shadowMap.enabled = q.shadows;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor(new THREE.Color(PAL.fog), 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(PAL.fog, fogNear, fogFar);
  camera.far = CAMERA_FAR;
  camera.updateProjectionMatrix();

  /* The two light anime setup the town is authored for: one warm quantised
   * key, one strong cool bounce carrying the shadow side, a weak underside
   * bounce, and a hemisphere so nothing in shadow goes black. Directions are
   * the town's own. Without the planet there is no local surface frame to
   * seat them in, so they are plain offsets from the shadow target. */
  const sun = new THREE.DirectionalLight(PAL.sun, 2.25);
  sun.castShadow = q.shadows;
  const shadowMap = q.city.shadowMap || 2048;
  sun.shadow.mapSize.set(shadowMap, shadowMap);
  /*
   * 22 m half width on High, not the town's 34.
   *
   * The town's shadow camera is sized for a walker who sees 23 m of ground.
   * A quad at 25 m/s crosses 34 m in 1.4 s, and everything inside that box is
   * submitted to the shadow pass twice over, which measured as roughly half
   * of the frame's draw calls. 22 m is 44 m across at 2048, which is 2.1 cm a
   * texel, so contact shadows under the craft get CRISPER as well as cheaper.
   * What it costs is a cast shadow from a building the pilot is about to
   * reach, which at 25 m/s is under a second of warning.
   */
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

  const { colliders, noTop, noBottom, slabs, fit } = buildColliders(world);
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

  /*
   * The train, as three moving boxes.
   *
   * It is 59.6 m of solid steel crossing the town at 23.5 m/s and it had no
   * collision of any kind: the owner flew through it. It cannot be a static
   * box because the broadphase grid is indexed on x and z, which is the same
   * reason a level crossing boom may only move in y, so it uses the moving
   * box path in src/game/collide.js instead.
   *
   * One box per car rather than one for the whole set, because the gap
   * between cars is a real gap and a single 59.6 m box would be a wall across
   * the coupling. Each car's extent is measured off its own drawn meshes here
   * and then only translated, which is exactly what animation.js does to the
   * group: it sets `train.group.position` along x and never rotates it, so
   * the boxes stay axis aligned and a half extent measured once stays true.
   */
  const trainCars = [];
  for (const car of world.train.cars) {
    const b = objectExtent(car);
    if (b === null) {
      continue;
    }
    const i = colliders.addMoving(
      'train',
      (b.x1 - b.x0) * 0.5, (b.y1 - b.y0) * 0.5, (b.z1 - b.z0) * 0.5,
    );
    trainCars.push({
      index: i,
      /* The car's centre in the group's own frame, so animation.js only has
       * to add the group's offset. */
      x: (b.x0 + b.x1) * 0.5,
      y: (b.y0 + b.y1) * 0.5,
      z: (b.z0 + b.z1) * 0.5,
    });
  }

  colliders.build();
  progress(0.9);

  /*
   * The audit, and only when it is asked for.
   *
   * ./scan.js measures the solid world against the drawn one in both
   * directions: solid volume with nothing drawn under it, which is what a
   * pilot flying the gaps meets as an invisible wall, and drawn objects with
   * nothing solid in them, which is scenery a quad passes through. It has to
   * run here, after the collider set is built and before bakeCity merges the
   * per mesh geometry away, and it costs seconds, so no ordinary load pays
   * for it. scripts/collider-audit.js sets the flag.
   */
  /* Imported here rather than at the top of the file so an ordinary load
   * never fetches it: check 16 counts the city's modules and a diagnostic
   * should not be one of them. */
  const scan = globalThis.__CITY_SCAN
    ? (await import('./scan.js')).scanCity(world, colliders)
    : null;

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
  const baked = bakeCity(world, {
    cell: MERGE_CELL,
    shadowCell: q.shadows ? MERGE_SHADOW_CELL : MERGE_CELL,
    cullCell: CULL_CELL,
    casterMinRadius: q.shadows ? CASTER_MIN_RADIUS : 1e9,
    casterMinRadiusInstanced: q.shadows ? CASTER_MIN_RADIUS_INSTANCED : 1e9,
    /* See findAnimated in ./bake.js. Turn this OFF the day anything in this
     * shell can press one of the town's buttons. */
    releaseStillRigs: true,
    shadowProxyCell: q.shadows ? q.city.shadowProxyCell : 0,
  });
  const thinned = thinFoliage(world.root, { keep: foliageKeep });
  const chunked = chunkInstanced(world.root, { cell: CULL_CELL });
  progress(0.92);
  const cull = buildCullGrid(world.root, { cell: CULL_CELL });
  const anim = cityAnimation(world, colliders, boomIndices, trainCars);
  if (!q.city.petals && world.petals && world.petals.meshes) {
    /* Floating blossom is a per-frame instance update of 980 cards. Low
     * keeps the fallen drifts (static, three draws) and drops the live
     * field. */
    for (const m of world.petals.meshes) {
      m.visible = false;
    }
    world.petals.update = () => {};
  }
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
     * 2.6e6 on High, not the town's own 4.6e6.
     *
     * The pipeline holds three full resolution targets plus a depth texture:
     * half float RGBA for the scene and the ink result at 8 bytes a pixel, a
     * 32 bit depth texture at 4, and a byte RGBA for the grade result at 4,
     * so 24 bytes per pixel of budget. At 4.6e6 that is 110.4 MB, and with
     * the default framebuffer on top the frame lands at 118.7 MB against a
     * 120 MB ceiling, with nothing left for anything else that ever wants a
     * target. At 2.6e6 it is 62.4 MB. The cost is supersampling: the town
     * asks for 1.5x on a low DPI screen and gets about 1.1x at 1080p. The
     * measured effect on the ink is in PROGRESS.md. Medium and Low tighten
     * the budget further; see src/render/quality.js.
     */
    pixelBudget: q.city.pixelBudget,
    minScale: q.city.minScale,
    preferScale: q.city.preferScale,
  });
  pipeline.enabled.ink = q.city.ink;
  pipeline.enabled.fxaa = q.city.fxaa;
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

  /*
   * Which shadow proxies are inside the shadow box.
   *
   * The shadow camera is an orthographic box of SHADOW_HALF a side looking
   * from the sun's offset at the shadow target, so the test is that box's own
   * test done by hand: put the cell centre into the light's view space and
   * compare against the half extents, widened by the cell's own radius so a
   * cell straddling the edge is kept rather than clipped. Done here rather
   * than from `sun.shadow.camera` because that camera's matrices are only
   * brought up to date inside the shadow pass, which runs after this.
   *
   * Every vector and matrix here is allocated once at build time. This runs
   * every frame and P8 forbids allocating in that path.
   */
  const proxyMeshes = baked.proxies ? baked.proxies.meshes : [];
  /* quality.js owns this number; there used to be a SHADOW_PROXY_CELL
   * constant here holding a second copy of the same 24. The `||` rather
   * than `??` is deliberate and narrow: the lowest tier sets
   * shadowProxyCell 0 next to shadowMap 0, so shadows are off there and a
   * zero cell would only give proxyReach nothing to work with. */
  const proxyCell = q.city.shadowProxyCell || 24;
  const proxyReach = Math.hypot(proxyCell, proxyCell) * 0.5;
  const proxyView = new THREE.Matrix4();
  const proxyEye = new THREE.Vector3();
  const proxyUp = new THREE.Vector3(0, 1, 0);
  const proxyAt = new THREE.Vector3();
  function gateProxies(target) {
    if (!proxyMeshes.length) {
      return;
    }
    proxyEye.copy(target).add(SUN_OFFSET);
    proxyView.lookAt(proxyEye, target, proxyUp);
    proxyView.setPosition(proxyEye);
    proxyView.invert();
    for (let i = 0; i < proxyMeshes.length; i += 1) {
      const m = proxyMeshes[i];
      proxyAt.set(m.userData.cellX, target.y, m.userData.cellZ).applyMatrix4(proxyView);
      /* x and y are across the light's view, z is depth into it and negative
       * in front of the camera. The depth range is the shadow camera's own
       * near and far, widened the same way. */
      const d = -proxyAt.z;
      m.visible = Math.abs(proxyAt.x) <= half + proxyReach
        && Math.abs(proxyAt.y) <= half + proxyReach
        && d >= sun.shadow.camera.near - proxyReach
        && d <= sun.shadow.camera.far + proxyReach;
    }
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
    /* Gated on the SHADOW target rather than the camera: a proxy matters
     * because it is near the light's box, which follows the craft, and not
     * because it is near the eye. */
    gateProxies(shadowTarget);
  }

  /* Overridable so a sweep can measure the draw call count against the cull
   * radius rather than one value being asserted. Harness only. */
  let cullRadius = cullDefault;
  let cullR2 = cullRadius * cullRadius;
  function setCullRadius(r) {
    cullRadius = r == null ? cullDefault : r;
    cullR2 = cullRadius * cullRadius;
  }
  /*
   * Half a cell, because the test below measures to the NEAREST POINT of a
   * cell and not to its centre.
   *
   * Measuring to the centre makes the radius a lie by up to a cell half
   * diagonal, 28 m here: a cell whose centre is at the radius holds things
   * from 28 m nearer than that to 28 m further, and switching the cell off
   * takes the near ones with it. At the old 145 m radius against a fog that
   * ended at 135 the error was invisible, because everything it could reach
   * was already fog coloured. At 100 m against a fog ending at 95 it reaches
   * 72 m, where the fog is only two thirds of the way in and a building
   * winking out is something you would see.
   *
   * Clamping to the cell's bounds costs two max calls a cell and makes the
   * radius mean the distance it is written as: nothing inside it is ever
   * switched off. The cost is that a cell is only dropped once ALL of it is
   * beyond the radius, which is why the radius could not simply be shortened
   * to 72 instead.
   */
  const cullHalf = cull.cell * 0.5;
  function cullTo(eye) {
    for (let i = 0; i < cull.cells.length; i += 1) {
      const c = cull.cells[i];
      const dx = Math.max(0, Math.abs(eye.x - c.x) - cullHalf);
      const dz = Math.max(0, Math.abs(eye.z - c.z) - cullHalf);
      const d2 = dx * dx + dz * dz;
      const on = d2 <= cullR2;
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

  /* One frozen answer, so the shell's per frame read allocates nothing
   * here either. A town with no gates has no target and never gains one. */
  const CITY_AIM = { active: false, sceneIndex: -1, correct: true, distance: 0 };

  return {
    id: 'city',
    name: 'Freestyle city',
    mode: 'freestyle',
    graphics: q.id,
    scene,
    post: pipeline,
    colliders,
    /* No gates, no racing line, no lap. */
    gates: [],
    curve: null,
    spawn: SPAWN,
    /* Only path, speed, lookAhead and aimDrop are read: see the top of
     * src/render/attract.js. This object used to carry x, y, z, radius, eye
     * and aim as well, left over from the orbit shot the city's flythrough
     * replaced, and they read as live camera settings. */
    attract: {
      path: cityAttractPath(world),
      /* Slower than the field's 13 m/s. The field's shot is a lap of a
       * course and wants to read as racing; this one is a street with things
       * in it, and at 13 m/s a 6 m wide corridor is a blur. */
      speed: 9,
      lookAhead: 13,
      /* Only a little down. The camera is IN the street rather than over the
       * course, so the interest is at eye height and ahead, not below. */
      aimDrop: 2.4,
    },
    /*
     * The contact surface, and the third argument is what makes a city fly.
     * `fromY` is the height the query is made FROM: a platform is only
     * eligible if it is within a step of it, so a quad above the overbridge
     * lands on the deck and a quad under it sees the road.
     */
    height: (x, z, fromY) => world.heightAt(x, z, fromY),
    setNextGate() {},
    /* No gates, so nothing is ever the next one. Present so the shell has
     * one call shape for both maps and the target mark stays off here. */
    targetAim: () => CITY_AIM,
    approachSide: () => null,
    /* No gates, so no line to be on or off. Present so the shell has one
     * call shape for both maps. */
    hasRacingLine: false,
    setRacingLine() {},
    updateRacingLine() { return null; },
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
      /* What the geometry fit did to the town's walker rectangles, so the
       * claim that the solid world hugs the drawn one is a measurement
       * rather than a comment. */
      colliderFit: fit,
      /* null unless globalThis.__CITY_SCAN was set before the map was
       * built. See ./scan.js. */
      colliderScan: scan,
      trainCarColliders: trainCars.length,
      cullCells: cull.cells.length,
      cullAlways: cull.always.length,
      cullRadius,
      foliageKeep,
      planting: world.planting ?? null,
      ...thinned,
      ...baked.stats,
      ...chunked,
      shadowExtent: half,
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
