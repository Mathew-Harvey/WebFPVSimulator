/*
 * index.js: the two places this project adds to the freestyle city, and the
 * one function that puts them in it.
 *
 * WHAT IS ADDED, AND WHERE.
 *
 *   工場道 (./road.js)          the works road, off ひばり台四丁目's east arm
 *   旧ひばり製作所 (./works.js)   a disused machine shop, x 20..50, z 82.6..113
 *   ひばり台市民プール (./pool.js)  the municipal pool, x 53..91, z 82.6..114
 *   ひばり台ドローン練習場 (./training.js)  the practice field, x 0..128, z 118..188
 *
 * And two things that are not places: the STF mark, painted on the side of a
 * corner shop at the end of the street the pilot starts in (buildStfMark,
 * below), and the partners' marks, one each (buildPartnerMarks), and the
 * patrons' (buildPatronMarks).
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
import { buildTraining, TRAINING_SITE, TRAINING_LANDMARK } from './training.js';
import { buildBlossom } from './blossom.js';
import { makeStfMark } from '../../../art/stf.js';
import { STF_PAINTED } from '../../../game/egg.js';
import { makePartnerMark, signAspect } from '../../../art/partnermark.js';
import { PARTNERS, PATRON_MAP_BRANDS } from '../../../partners/roster.js';
import { choosePatrons } from '../../../partners/patrons.js';

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

/*
 * THE STF MARK, on the side of 米・酒 なかの at the end of the pilot's street.
 *
 * It was in the works shed's roof space, seen only by a pilot who came in
 * through the broken clerestory (FREESTYLE-MAPS-PLAN.md section 9), and the
 * owner could not find it: "the logo of SubTwoFIfty is too hard to find,
 * make it easy to see on any map" (section 12, decision 10). So it is painted
 * where the town's first frame looks. The pilot starts on the road at
 * (0, 24) facing +z up the street, and 25 m ahead the street is closed by
 * the corner shop with the flat over it (buildCornerShop in
 * ../vendored/world/northblock.js: SHOP, x 2.0 to 7.0 and z 49.2 to 54.6, its
 * shopfront facing -x onto the road). Its south flank faces the pads square,
 * 11 degrees left of the nose, and over the string course the upper storey
 * is plain wall from x 2.5 to 6.8 and from 3.7 to 6.0 m, under the eave:
 * the blade sign hangs just past its road end and a downpipe runs down its
 * far end. A 4 by 2 m mural fits between them with 15 cm to spare all round.
 * Measured by rays from 3 m in front against the drawn town, 2026-09-25,
 * because northblock.js is vendored and exports none of it, and a number
 * read off the drawn town is the one the paint has to agree with.
 *
 * WHERE THE PAINT STANDS. The drawn wall is at z 49.2, and the town's fitted
 * collider face (the one the plant flies against, and the one the find's
 * sight line is tested against) is 5 cm in front of it, at 49.15. Paint on
 * the brickwork would be behind that face, where a sight line to it ends
 * inside a solid. So the paint stands `off` in front of the collider's face,
 * 6.5 cm off the brickwork, the same way a built map lifts it off a
 * container's door leaves: nothing a pilot sees from the front, where the
 * lettering is read.
 *
 * Nothing stands between it and the pads: the first frame on the pads and
 * the view from 2 m over them both show the whole mural, the utility pole
 * at the left kerb standing just to its left (shots, 2026-09-25).
 */
const STF_SPOT = {
  x: 4.65,
  y: 4.85,
  face: 49.15,
  w: 4.0,
  h: 2.0,
  off: 0.015,
};

/*
 * Paint the mark STF_SPOT names and return where it is, as the `egg`
 * src/maps/README.md describes: the centre of the painted face, the way it
 * faces, the way its lettering reads up, and its size, in world metres.
 * Drawn and never solid: makeStfMark names it with the Trim suffix, which is
 * what keeps the collider fit, the cover pass and the audit off it (see
 * ./kit.js), and nothing here calls ctx.collide.
 */
function buildStfMark(ctx) {
  const egg = {
    key: 'city',
    p: [STF_SPOT.x, STF_SPOT.y, STF_SPOT.face - STF_SPOT.off],
    n: [0, 0, -1],
    up: [0, 1, 0],
    w: STF_SPOT.w,
    h: STF_SPOT.h,
  };
  /* Unpainted (STF_PAINTED in src/game/egg.js): the descriptor stays, because
   * the town's best and its stamp are filed under its key. */
  if (!STF_PAINTED) {
    return egg;
  }
  /* In shade: the flank faces -z, and the town's golden sun stands at the
   * south west, so no direct light ever reaches it (see makeStfMark). */
  const mark = makeStfMark(THREE, { width: egg.w, height: egg.h, shade: true });
  /* The plane's own +X, +Y and +Z onto the lettering's right, its up and the
   * way it faces. */
  const n = new THREE.Vector3(...egg.n);
  const up = new THREE.Vector3(...egg.up);
  const right = new THREE.Vector3().crossVectors(up, n);
  mark.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, n));
  mark.position.set(...egg.p);
  ctx.add(mark);
  return egg;
}

/*
 * THE PARTNERS' MARKS (src/partners/roster.js), one each, by hand. The
 * built maps choose theirs by rule (src/maps/built/egg.js); the town is one
 * place, so its are chosen the way the STF mark's was, by looking, and each
 * one is where a partner of its kind would put a sign in a town like this:
 *
 *   Mantis FPV, the retail partner: a shop's panel over the street the
 *   pilot starts in. The south flank of the house on the right of the
 *   street, 15 m ahead and 13 m to the right of the pads, is plain wall
 *   from x -16.4 to -9.8 and up to 6.3 m, and it faces the pads square, so
 *   the panel is in the first frame beside the STF mark and reads as a
 *   different thing: a sign on a shop, where the STF mark is a tag on a
 *   wall. Its collider face is at z 39.30, measured from the town's own
 *   collider list 2026-09-27, and the paint stands `off` in front of it for
 *   STF_SPOT's reason.
 *
 *   Global Drone Solutions, the training partner: the practice field's tap
 *   wall (WALL in ./training.js, x 50 to 62, face south at z 152.325),
 *   below the tap line and left of the target, where every pilot running at
 *   the target has it in the frame. It stops 0.3 m short of the target and
 *   0.2 m under the tap line, so both still read as what they are.
 *
 *   The West Coast Multirotor Club, the club partner: the same wall's back,
 *   facing north over the Split-S and the free practice box, above the
 *   buttresses (2.6 m high) and under the coping, a club's banner over the
 *   ground a club flies.
 *
 *   weBLEEDfpv, the USA micro drone partner (2026-10-20): the same wall's
 *   back again, in the 3 m of it right of the club's banner, x 59.1 to 61.9
 *   with the wall ending at 62. The first wall tried was the south face of
 *   the shop block at z 36, and its pilasters and bands leave only 1.6 m of
 *   clean wall between them, so a sign did not fit; this stretch is the same
 *   slab the club's banner stands on, so it passed the patron spots' own
 *   three checks (npm run check:town-patrons run on this spot, 2026-10-20):
 *   solid 0.3 m behind and air 0.1 m in front at every point, the drawn
 *   surface within 1 cm of the collider face, and seen from 39 of 105 eyes.
 *   Two partners on one wall is why this sign is the smaller of the two.
 *
 * The slab is solid to its drawn face (skipFit in ./kit.js), so the paint
 * on the tap wall stands `off` in front of the drawn concrete. A partner the
 * roster adds is painted nowhere in the town until a spot is measured for
 * it here: a guessed spot is how paint ends up inside a wall.
 */
const PARTNER_SPOTS = {
  mantisfpv: { x: -13.08, y: 4.8, face: 39.3, n: -1, w: 5.0 },
  gds: { x: 52.1, y: 2.6, face: 152.325, n: -1, w: 3.6 },
  wcmrc: { x: 56.0, y: 5.35, face: 152.875, n: 1, w: 6.0 },
  webleedfpv: { x: 60.5, y: 5.35, face: 152.875, n: 1, w: 2.8 },
};

/*
 * Paint each partner's mark PARTNER_SPOTS names and return where they are,
 * as `marks` (src/maps/README.md): the `egg` shape with the slug, key
 * 'city#' and the slug. Every one of them faces along z, so `n` is the sign
 * along z and its height comes from the partner's sign (signAspect). In
 * shade on a face turned to -z, as the STF mark is, and lit on the one
 * turned to +z, which the town's south west sun reaches.
 */
function buildPartnerMarks(ctx) {
  const out = [];
  for (const partner of PARTNERS) {
    const spot = PARTNER_SPOTS[partner.slug];
    if (!spot) {
      continue;
    }
    const w = spot.w;
    const h = w / signAspect(partner);
    const mark = {
      slug: partner.slug,
      key: `city#${partner.slug}`,
      p: [spot.x, spot.y, spot.face + spot.n * STF_SPOT.off],
      n: [0, 0, spot.n],
      up: [0, 1, 0],
      w,
      h,
    };
    const mesh = makePartnerMark(THREE, partner, { width: w, height: h, shade: spot.n < 0 });
    const n = new THREE.Vector3(...mark.n);
    const up = new THREE.Vector3(...mark.up);
    const right = new THREE.Vector3().crossVectors(up, n);
    mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, n));
    mesh.position.set(...mark.p);
    ctx.add(mesh);
    out.push(mark);
  }
  return out;
}

/*
 * THE PATRONS' MARKS (PATRON_MAP_BRANDS in src/partners/roster.js): the
 * supporters' tier, painted the way a partner's is and never found
 * (`findable: false`, shouldFindMark in src/game/egg.js), so a patron's sign
 * is paint and nothing more: no stamp, no find, no event to the board. The
 * roster is empty until a supporter has said yes, and an empty roster paints
 * nothing here.
 *
 * THREE SPOTS, each a PANEL on a solid wall and not a sign of one size. A
 * patron's artwork is not known when a spot is measured, and a name set in
 * type has no shape until it is lettered, so a spot that fixed a width and
 * let the height follow would put the paint over an edge for the first tall
 * artwork. patronMark fits the sign inside PATRON_PANEL by the rule
 * partnerSize uses (src/maps/built/egg.js): as wide as the panel, unless that
 * makes it taller than the panel, and then as tall as the panel. Every
 * patron's panel is the same size, so how big a supporter's sign comes out
 * does not depend on which spot the roster's order hands them.
 *
 * `face` is the wall's COLLIDER face, the one the plant flies against and the
 * find's sight line is tested against, and the paint stands `off` in front of
 * it for STF_SPOT's reason. `x` and `y` are the panel's centre, and `n` is
 * the way the wall looks along z, as PARTNER_SPOTS has it.
 *
 * WHY THESE WALLS AND NOT THE ONES THE SPOTS WERE FIRST WRITTEN FOR. They
 * were written for the works office's east gable, the pool block's south
 * wall and the shed's east wall, from the constants in works.js and pool.js,
 * and those constants are centrelines and not faces: the office gable is
 * 0.24 m thick about x 29.8, so its outer face is at 29.92 and the paint was
 * inside the wall. Worse, all three of those walls are 0.22 to 0.26 m thick,
 * and the paint wants 0.3 m of solid behind it (scripts/town-patron-check.js),
 * so no point on their outer faces can pass. The three below are walls on the
 * same site that are 0.30 m or thicker, and flat for the whole panel:
 *
 *   The works' frontage wall (WALL in works.js, 0.30 m, solid to its drawn
 *   face), on its road face: collider boxes z 82.45 to 82.75, x 25.6 to 33.0,
 *   y 0.45 to 2.45. The breach is on its left and the keep out plate and a
 *   cherry trunk are on its right, so the panel stands in the 5.5 m between
 *   them (x 25.6 to 31.1) with 1.1 m to spare each side and 0.2 m of wall
 *   above and below it.
 *
 *   The pool hall's north wall (HALL in pool.js, 0.30 m, z 99.45 to 99.75),
 *   over the deck and the drained lido, ahead of a pilot who has come out of
 *   the changing block's corridor. Its plinth band tops out at y 1.15 and its
 *   string course starts at 3.75, and both stand 2 cm proud of the render
 *   (civicBands in pool.js), which is more than the paint's own `off`, so the
 *   panel has to stay between them and does, with 0.5 m above and below.
 *
 *   The water tower's tank (TOWER in works.js), a plain box x 44.4 to 48.0,
 *   y 7.05 to 9.65, z 94.4 to 98.0, flat on every face. Its south face looks
 *   back along the line the works road comes in on, so it is the one a pilot
 *   sees over the frontage. A tree stands beside it with its canopy up to
 *   y 7.53, so the panel starts at 7.7.
 *
 * Every number was read off the live town on 2026-10-03 and not off the
 * code: the boxes with window.__colliderBoxes, the depth behind and the air in
 * front of each point of each panel with window.__nearSolid, and the drawn
 * surface with rays through the scene. `npm run check:town-patrons` repeats
 * all three on every run and fails the day one of these numbers stops
 * agreeing with the world.
 */
export const PATRON_PANEL = Object.freeze({ w: 3.2, h: 1.6 });
export const PATRON_SPOTS = Object.freeze([
  Object.freeze({ x: 28.35, y: 1.45, face: 82.45, n: -1 }),
  Object.freeze({ x: 63.0, y: 2.45, face: 99.45, n: -1 }),
  Object.freeze({ x: 46.2, y: 8.5, face: 94.4, n: -1 }),
]);

/*
 * One patron's mark on one spot, as the `egg` src/maps/README.md describes
 * with the slug, the key 'city#' and the slug, and `findable: false`. It is
 * its own function, and does not paint, so the check can ask what the town
 * would do for a patron of any shape without building a mesh for it.
 */
export function patronMark(spot, patron) {
  const aspect = signAspect(patron);
  let w = PATRON_PANEL.w;
  let h = w / aspect;
  if (h > PATRON_PANEL.h) {
    h = PATRON_PANEL.h;
    w = h * aspect;
  }
  return {
    slug: patron.slug,
    key: `city#${patron.slug}`,
    findable: false,
    p: [spot.x, spot.y, spot.face + spot.n * STF_SPOT.off],
    n: [0, 0, spot.n],
    up: [0, 1, 0],
    w,
    h,
  };
}

/*
 * Paint the patrons' marks and return where they are, as `marks`
 * (src/maps/README.md). choosePatrons (src/partners/patrons.js) says which: all
 * of them while there are three or fewer, otherwise a pick that is the same
 * every time the town is built. Patron i goes on spot i, and a roster of more
 * than PATRON_SPOTS holds is not painted past the last. In shade on a face
 * turned to -z and lit on one turned to +z, as buildPartnerMarks has it.
 *
 * `patrons` is a parameter so the check and a picture can hand it a roster of
 * their own while the real one is empty.
 */
export function buildPatronMarks(ctx, patrons = PATRON_MAP_BRANDS) {
  const chosen = choosePatrons(patrons, 'city');
  const out = [];
  for (let i = 0; i < chosen.length && i < PATRON_SPOTS.length; i += 1) {
    const mark = patronMark(PATRON_SPOTS[i], chosen[i]);
    const mesh = makePartnerMark(THREE, chosen[i], {
      width: mark.w, height: mark.h, shade: PATRON_SPOTS[i].n < 0,
    });
    const n = new THREE.Vector3(...mark.n);
    const up = new THREE.Vector3(...mark.up);
    const right = new THREE.Vector3().crossVectors(up, n);
    mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, n));
    mesh.position.set(...mark.p);
    ctx.add(mesh);
    out.push(mark);
  }
  return out;
}

export function buildPlaces(world, { petals: livePetals = true } = {}) {
  const t0 = (typeof performance !== 'undefined' ? performance.now() : 0);
  const ctx = placeContext(world);
  const colliders0 = world.colliders.length;
  const platforms0 = world.platforms.length;
  const children0 = world.root.children.length;

  const parts = [buildWorksRoad(ctx), buildWorks(ctx), buildPool(ctx), buildTraining(ctx)];
  const egg = buildStfMark(ctx);
  const marks = [...buildPartnerMarks(ctx), ...buildPatronMarks(ctx)];

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

  /*
   * And the blossom in the air over both of them. The town's own field is
   * bounded to the street corridor it was authored for, so without this the
   * eight cherries out here are trees that drop drifts and nothing falls off
   * them. Off on Low for the same reason the town's field is off on Low: it
   * is a per step matrix upload, and bandwidth is what a handheld is short
   * of. The wells are the two halves of the drained lido, so a petal that
   * reaches the deck over a 2.5 m hole keeps going.
   */
  const blossom = livePetals
    ? buildBlossom(ctx, parts.flatMap((p) => p.wells ?? []))
    : null;

  const references = {};
  for (const p of parts) {
    Object.assign(references, p.references ?? {});
  }

  return {
    references,
    blossom,
    /* Where the STF mark is painted, for the town's MapInstance to hand the
     * shell. See STF_SPOT. */
    egg,
    /* And the partners', one each, then the patrons'. See PARTNER_SPOTS and
     * PATRON_SPOTS. */
    marks,
    updaters: ctx.updaters,
    sites: { works: WORKS_SITE, pool: POOL_SITE, training: TRAINING_SITE },
    landmarks: { works: WORKS_LANDMARK, pool: POOL_LANDMARK, training: TRAINING_LANDMARK },
    planting: { sakura: sakura.length, grove: grove.length, shrubs: shrubs.length, petals: petals.length },
    stats: {
      /* Measured here rather than inferred from the loading bar's world
       * stage, which on this container swings by a second between runs on
       * the town alone. */
      ms: +((typeof performance !== 'undefined' ? performance.now() : 0) - t0).toFixed(0),
      blossom: blossom ? blossom.count : 0,
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
