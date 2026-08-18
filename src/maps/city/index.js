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
 * How much of the town's planting survives.
 *
 * Set from the budget rather than from taste. The town draws 4.54 M triangles
 * of instanced plants against a whole frame budget of 1.20 M, and no amount of
 * merging or culling touches that: an instanced grove is already one draw call
 * and the triangles are simply there. The only lever is fewer of them.
 *
 * It reads as thinning rather than deletion because a canopy here is a few
 * dozen blobs scattered through the tree's volume, so removing some of them
 * makes the tree airier and not smaller, and every trunk is untouched. Swept
 * numbers are in PROGRESS.md. High keeps 0.65; Medium and Low keep less.
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
 * MEASURED FIRST, BECAUSE THE PADDING IS NOT THE WHOLE STORY. Scanned against
 * the drawn triangles before this existed, the town's 2731 rectangles fit
 * better than the call sites suggest: the mean overhang above the geometry
 * standing in them is 0.04 m. What there is, is a TAIL, and the tail is what
 * gets flown into: 54 boxes reach more than 0.5 m above anything drawn, the
 * worst by 9.07 m, and 106 overhang the drawn footprint by more than 0.35 m,
 * the worst by 2.91 m. Those are the invisible walls, and they are worth
 * removing without touching the 2500 boxes that were already right.
 *
 * THE FIT ONLY EVER SHRINKS, AND ONLY ONTO GEOMETRY IT CAN PROVE BELONGS.
 * Each drawn mesh contributes its world bounding box, which OVER states a
 * sloped roof or a rotated shed, so a box fitted to it is conservative in the
 * one direction that matters: the solid volume can never end up inside the
 * picture. A mesh counts toward a collider only if most of its own footprint
 * lies within that collider, so a wall shared between two plots, or the
 * terrain running underneath everything, cannot vote. A collider with nothing
 * that qualifies is left exactly as the town authored it, because a barrier
 * with no geometry in it is usually load bearing (the lake edge, a parked
 * level crossing boom) and guessing it away would put a quad inside the
 * scenery, which is worse than the wall it removes.
 *
 * It runs before src/maps/city/bake.js for the same reason references.js
 * does: after the merge a wall is anonymous floats in a shared buffer.
 */
/* A mesh this much of whose own footprint lies inside a collider is standing
 * in that collider rather than passing through it. Two thirds, so a wall
 * shared down the middle of a party boundary votes for neither. */
const FIT_OWNERSHIP = 0.67;
/* Footprint above which a mesh is a SURFACE, not an object: the terrain, the
 * road, the canal, the lake. Nothing that large is what a 7 m plot rectangle
 * stands for, and letting one vote would hold every collider it underlies at
 * full size. The largest thing in this town that a collider does stand for is
 * the school block at about 40 by 25 m. */
const FIT_MAX_FOOTPRINT = 1400;
/* Broadphase for the fit itself. Build time only, so a plain Map of arrays is
 * the right shape here where the per frame path would not tolerate it. */
const FIT_CELL = 4;
/* A fitted box may not be thinner than this on any axis. Below it the box is
 * unreachable anyway and the distance solver is being asked to answer about a
 * plane, so the authored extent is kept instead. */
const FIT_MIN_EXTENT = 0.02;
/*
 * The two rules that keep the fit from opening holes, and they were both
 * written against a measured failure rather than imagined.
 *
 * COVERAGE. The first version of this trimmed on the mere presence of owned
 * geometry, and it destroyed every long thin barrier in the town: a 78.9 m
 * lineside railing 0.24 m thick, drawn as a run of separate balusters, kept
 * whichever single post happened to qualify and collapsed to 0.18 m. Measured
 * across the town it made 675 side trims with a worst case of 74.99 m and a
 * worst top trim of 16.80 m, which is not a fit, it is a hole a quad flies
 * through the scenery. The distinction it was missing: PADDING leaves the
 * object filling its own rectangle and merely standing off the edges, while a
 * sparse barrier does not fill anything. So the drawn geometry has to cover
 * most of the rectangle before any trim is believed.
 *
 * CAP. And no single face moves further than the largest standoff the town
 * actually authors, which is the 1.8 m flank in district.js. Two metres
 * covers every authored pad with margin, and a trim larger than that is not a
 * pad being removed, it is the fit failing to understand the collider. What
 * it costs is the over tall outliers on long barriers, 54 boxes reaching over
 * half a metre above anything drawn: coverage already declines those, and
 * they are recorded in PROGRESS.md as known and unfixed rather than quietly
 * left out.
 */
const FIT_COVER = 0.6;
/* Buildings fill their rectangle. A railing does not. Using FIT_COVER on a
 * house left 0.4 m of pad the fit could have taken; using 0.42 on a railing
 * is how a 78 m lineside fence collapsed to one post. So bulky boxes get
 * the lower bar, thin ones keep the guard. */
const FIT_COVER_BULK = 0.42;
const FIT_BULK_MIN = 0.35;
const FIT_MAX_PAD = 2.0;

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
/* Foliage and ground decoration, excluded by name. Tree canopies are
 * collided as one mass per tree in trees.js. This skip stops 46000
 * blossom instances each becoming a wall. */
const COVER_SOFT = /canopy|tuft|moss|reed|petal|lily|ripple|windLane|chalk|doormat|paper|crow|cat|ivy|grass|blossom|leaf|flower/i;

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

function drawnBoxes(root) {
  const out = [];
  const box = new THREE.Box3();
  const inst = new THREE.Matrix4();
  const world = new THREE.Matrix4();
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry) {
      return;
    }
    const g = o.geometry;
    if (!g.boundingBox) {
      g.computeBoundingBox();
    }
    if (!g.boundingBox) {
      return;
    }
    const push = (m) => {
      box.copy(g.boundingBox).applyMatrix4(m);
      const fx = box.max.x - box.min.x;
      const fz = box.max.z - box.min.z;
      if (fx * fz > FIT_MAX_FOOTPRINT) {
        return;
      }
      out.push({
        x0: box.min.x, x1: box.max.x, y1: box.max.y, z0: box.min.z, z1: box.max.z, area: fx * fz,
      });
    };
    if (o.isInstancedMesh) {
      for (let i = 0; i < o.count; i += 1) {
        o.getMatrixAt(i, inst);
        world.multiplyMatrices(o.matrixWorld, inst);
        push(world);
      }
      return;
    }
    push(o.matrixWorld);
  });
  return out;
}

/*
 * The drawn extent standing inside one authored rectangle. Writes into `out`
 * rather than allocating, because this runs 2731 times during a load that
 * already costs seconds.
 *
 * TWO ANSWERS, BECAUSE THE TOP AND THE SIDES ARE DIFFERENT QUESTIONS.
 *
 * The sides ask "where does the object in this rectangle actually stand", and
 * that needs the ownership filter: a neighbour's wall clipping the corner of
 * this plot must not vote on where this plot's collider ends.
 *
 * The top asks something much simpler, "is anything at all drawn up there",
 * and ownership is wrong for it. A tree is the case that proved it. The town
 * collides a tree as its trunk, a 1.1 m square box up to the trunk's height,
 * and the canopy that sits on top is several metres across, so ownership
 * rejects the canopy and the owned union tops out at the trunk. Trimming to
 * that ate 2 m off nine tree colliders and opened the only twelve holes the
 * safety scan has ever found: the box stopped reaching into a canopy that is
 * drawn, dense and right there on screen. So the top is capped by the tallest
 * drawn thing anywhere over the footprint, owned or not, which is exactly the
 * question "would the pilot see anything where this box still reaches".
 */
function fitOne(c, boxes, grid, out) {
  let found = false;
  out.x0 = Infinity; out.x1 = -Infinity;
  out.z0 = Infinity; out.z1 = -Infinity;
  out.y1 = -Infinity;
  out.anyTop = -Infinity;
  out.covered = 0;
  const ca0 = Math.floor(c.x0 / FIT_CELL);
  const ca1 = Math.floor(c.x1 / FIT_CELL);
  const cb0 = Math.floor(c.z0 / FIT_CELL);
  const cb1 = Math.floor(c.z1 / FIT_CELL);
  const seen = out.seen;
  out.mark += 1;
  const mark = out.mark;
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
        const g = boxes[i];
        /* How much of the MESH's own footprint is inside this rectangle. */
        const ox = Math.min(g.x1, c.x1) - Math.max(g.x0, c.x0);
        const oz = Math.min(g.z1, c.z1) - Math.max(g.z0, c.z0);
        if (ox <= 0 || oz <= 0) {
          continue;
        }
        /* Overlapping at all is enough to answer the top question. */
        if (g.y1 > out.anyTop) {
          out.anyTop = g.y1;
        }
        if (g.area > 0 && (ox * oz) / g.area < FIT_OWNERSHIP) {
          continue;
        }
        found = true;
        /* Sum of the owned footprints clipped to the rectangle. Overlapping
         * meshes double count, which can only ever make the coverage look
         * BETTER than it is, so it is bounded against the rectangle's own
         * area by the caller and the error is in the direction of trimming
         * more. That is the wrong direction, so the caller also requires the
         * union's own footprint to cover, which cannot double count. */
        out.covered += ox * oz;
        if (g.x0 < out.x0) { out.x0 = g.x0; }
        if (g.x1 > out.x1) { out.x1 = g.x1; }
        if (g.z0 < out.z0) { out.z0 = g.z0; }
        if (g.z1 > out.z1) { out.z1 = g.z1; }
        if (g.y1 > out.y1) { out.y1 = g.y1; }
      }
    }
  }
  return found;
}

function buildColliders(world) {
  const colliders = new Colliders();
  let noTop = 0;
  let noBottom = 0;

  /* The fit's own index over the drawn meshes. */
  const fitStart = (typeof performance !== 'undefined' ? performance.now() : 0);
  const boxes = drawnBoxes(world.root);
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
  const fit = { x0: 0, x1: 0, z0: 0, z1: 0, y1: 0, seen: new Int32Array(boxes.length), mark: 0 };
  const fitStats = { fitted: 0, unmatched: 0, topTrims: 0, sideTrims: 0, maxTopTrim: 0, maxSideTrim: 0, totalTopTrim: 0, covered: 0, seeThrough: 0, roofLifts: 0, worst: [] };

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
     * The fit. Shrink only, onto geometry that qualifies, and never past the
     * point where the box stops being a box.
     */
    let fx0 = c.x0;
    let fx1 = c.x1;
    let fz0 = c.z0;
    let fz1 = c.z1;
    let fy1 = y1;
    const hit = fitOne(c, boxes, grid, fit);
    if (hit) {
      /* Clamp each face to the drawn extent, then no further than one pad. */
      const nx0 = Math.min(Math.max(fx0, fit.x0), fx0 + FIT_MAX_PAD);
      const nx1 = Math.max(Math.min(fx1, fit.x1), fx1 - FIT_MAX_PAD);
      const nz0 = Math.min(Math.max(fz0, fit.z0), fz0 + FIT_MAX_PAD);
      const nz1 = Math.max(Math.min(fz1, fit.z1), fz1 - FIT_MAX_PAD);
      const ny1 = Math.max(Math.min(fy1, fit.anyTop), fy1 - FIT_MAX_PAD);
      /* Does the drawn geometry actually fill this rectangle? Both the union
       * of the owned boxes and the sum of their clipped footprints have to
       * say yes: the union alone would be fooled by two posts at opposite
       * corners, and the sum alone by a stack of coincident meshes. */
      const area = Math.max(1e-6, (c.x1 - c.x0) * (c.z1 - c.z0));
      const unionArea = Math.max(0, Math.min(fit.x1, c.x1) - Math.max(fit.x0, c.x0))
        * Math.max(0, Math.min(fit.z1, c.z1) - Math.max(fit.z0, c.z0));
      const thin = Math.min(c.x1 - c.x0, c.z1 - c.z0);
      const coverNeed = thin < FIT_BULK_MIN ? FIT_COVER : FIT_COVER_BULK;
      const covers = unionArea / area >= coverNeed && fit.covered / area >= coverNeed;
      if (covers && nx1 - nx0 >= FIT_MIN_EXTENT && nz1 - nz0 >= FIT_MIN_EXTENT && ny1 > y0) {
        const side = Math.max(nx0 - fx0, fx1 - nx1, nz0 - fz0, fz1 - nz1);
        const topTrim = fy1 - ny1;
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
        if (side > 0.05 || topTrim > 0.05) {
          fitStats.worst.push({
            side: +side.toFixed(2),
            topTrim: +topTrim.toFixed(2),
            was: { x: +(c.x1 - c.x0).toFixed(2), z: +(c.z1 - c.z0).toFixed(2), top: +y1.toFixed(2) },
            now: { x: +(nx1 - nx0).toFixed(2), z: +(nz1 - nz0).toFixed(2), top: +ny1.toFixed(2) },
            at: [+((c.x0 + c.x1) / 2).toFixed(1), +((c.z0 + c.z1) / 2).toFixed(1)],
          });
        }
        fx0 = nx0; fx1 = nx1; fz0 = nz0; fz1 = nz1; fy1 = ny1;
        fitStats.fitted += 1;
      } else {
        fitStats.unmatched += 1;
      }
    } else {
      fitStats.unmatched += 1;
    }
    /*
     * Fit only shrinks. A house collider that stopped at the wall plate
     * never grew to the ridge. If drawn mass over a bulky footprint
     * reaches a little above the box, raise the top to it. Skip a lift
     * bigger than a roof: that is a tree overhanging the plot, not a
     * gable.
     */
    const footMin = Math.min(fx1 - fx0, fz1 - fz0);
    if (hit && footMin > 1.0 && fit.anyTop > fy1 + 0.2 && fit.anyTop <= fy1 + 2.8) {
      fy1 = fit.anyTop;
      fitStats.roofLifts += 1;
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
    colliders.addBox('wall', fx0, y0, fz0, fx1, fy1 > y0 ? fy1 : y0 + 0.001, fz1);
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
   * Foliage is collided as ONE mass per tree (trunk plus a canopy box with
   * a floor), not as a box per blossom blob. The cover pass still skips
   * named foliage so 46000 canopy instances do not become walls. The tree
   * generators in trees.js own the mass.
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
    colliders.addBox('obstacle', b.x0, b.y0, b.z0, b.x1, b.y1, b.z1);
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
      trainCarColliders: trainCars.length,
      cullCells: cull.cells.length,
      cullAlways: cull.always.length,
      cullRadius,
      foliageKeep,
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
