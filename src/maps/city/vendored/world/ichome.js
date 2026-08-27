import * as THREE from 'three';
import { PAL } from '../core/palette.js';
import { cel, flat } from '../core/toon.js';
import { warningPlate, hallNotice } from '../core/textures.js';
import { box, cyl, bake, trs, rngKit } from '../core/util.js';
import { hullOutline } from '../core/outline.js';
import { groundY } from './street.js';
import { pad, lane, laneLine, steps, railing, meshFence, groundMats } from './ground.js';
import {
  plotBox, plotCollide, plotWall, dressPlot, refusePoint,
  laneGutter, bollardRow, laneSign, poleRun,
} from './plots.js';
import { makeWalkup, makeTerrace, makeBikeShelter } from './housing.js';
import { makeNagaya } from './blocks.js';
import {
  makeBench, makeBicycle, makeBikeRack, makeBroom, makeBucket, makeCatBox,
  makeCone, makeCrates, makeDeliveryBox, makeDoormat, makeIvy, makeLaundryPole,
  makeLoosePaper, makeMailboxBank, makeMilkCrate, makePlanter, makePotShelf,
  makeStorageShed, makeTapPost, makeUmbrellaStand,
} from './props.js';
import {
  makeChalkMarks, makeDryingRack, makeKidBike, makeKitchenGarden, makeScooter,
  makeWaterMeter, makeWheelStops,
} from './streetprops.js';

/* ------------------------------------------------------------------ *
 * ひばり台一丁目 -- the old quarter along the railway, west of the crossing.
 *
 * Everything else in this world is a district you arrive at.  This one is a
 * *street*, and it is the only place in the project where the picture is made
 * out of a corridor rather than out of objects standing in the open:
 *
 *   the railway masking wall   2.2 m of plain concrete, z -4.98, all the way
 *   線路裏の道                 2.4 m of worn asphalt, z -6.9
 *   the frontages              the five old houses and three new ones, z -8.4
 *
 * That is a 4.4 m slot with a wall down one side and doors down the other, and
 * the whole job here is to make it read as a lane somebody lives on: ivy over
 * the wall, wires overhead, a gutter down one side, a 長屋 whose eave hangs out
 * over the carriageway, and four passages cutting south out of it to the
 * 用水路.  Nothing in this world looks like that, and the width is the reason:
 * a 2.4 m lane is one person and one small van, so the player is never more
 * than two metres from anything and the detail level is set by that.
 *
 * Three things about it are load-bearing and easy to undo by accident.
 *
 * **It is visible from the crossing**, which is the opening frame of the whole
 * project, forty metres east.  So the far half (x < -50) is deliberately
 * building mass, roofs, fences and poles and nothing finer -- all the clutter
 * is east of x = -50 where the player actually walks.
 *
 * **The wall stops at x = -30.**  `railway.js` runs its masking wall from
 * x = -118 to -30 and finishes it in a pier, so the lane is a closed slot for
 * its western forty-six metres and opens to the lineside fence for its eastern
 * seventeen.  That change of section halfway along is free and it is the best
 * thing about the street: walking east the wall runs out, the railway appears
 * over a 1.2 m fence, and the crossing is at the end of it.
 *
 * **The long view west is protected.**  Standing at the east mouth the lane
 * runs 63 m dead straight, and what closes it is the walk-up's stair tower with
 * a grove tree behind it.  Everything tall is on the verge (the pole line) or
 * against the frontages (the 長屋's eave posts); nothing stands in the middle.
 * If something has to go in the lane, it goes on the verge.
 *
 * The fourth passage is a lie the block is careful not to tell.  There are four
 * gaps between the five old houses and only three of them are wide enough to
 * walk: x -32.7..-31.4 is 1.3 m, which after the player's own 0.34 m radius on
 * both sides is 0.62 m of clear ground.  It is closed at the lane with a 板塀
 * and a shut gate and filled with a 物置, a stack of crates and a drying pole,
 * because a dead end that looks like a dead end is honest and one that looks
 * like a way through is the single most reported kind of bug in this project.
 *
 * FLOODFILL -- every one of these must be reachable on foot from the spawn:
 *   laneEast      [-13.2, -6.9]    the arrival, where the spur meets the lane
 *   laneMid       [-38.0, -6.9]    opposite house E, under the pole line
 *   laneWall      [-58.0, -6.9]    the closed slot, wall to the north
 *   laneWest      [-74.4, -6.9]    the far end, at the walk-up's forecourt
 *   walkupFront   [-71.5, -8.8]    the mailbox bank and the bin point
 *   gapYard       [-65.3, -11.6]   the shared bike yard between the two blocks
 *   nagayaEave    [-59.0, -8.7]    under the 長屋's eave, at its doors
 *   terraceApron  [-48.5, -9.3]    the 連棟's forecourt
 *   alley1Top     [-13.05, -18.05] the top of the first flight, on the verge
 *   alley2Yard    [-26.6, -16.7]   the drying ground behind house D
 *   alley2Top     [-22.85, -18.05] the top of the second flight
 *   alley4Top     [-42.7, -18.05]  the top of the fourth flight
 * ------------------------------------------------------------------ */

/* ----------------------------- the street ----------------------------- */
const LN_Z = -6.9;                     // the lane's centreline
const LN_W = 2.4;
const LN_X0 = -76.0;
const LN_X1 = -12.4;
const LN_S = LN_Z - LN_W / 2;          // -8.10, the south edge
const LN_N = LN_Z + LN_W / 2;          // -5.70, the north edge
/* `railway.js`: the masking run is a 0.35 m box at z = -(TRACK_HALF + 2.6), so
 * its lane-facing face is here and its pier begins at MASK_X1.  Anything hung
 * on it faces **-z**, which is why every plate and notice below is turned by
 * PI -- a `PlaneGeometry` faces +z and `flat()` is single-sided. */
const MASK_Z = -4.975;
const MASK_X0 = -75.5;                 // as far west as anything is dressed
const MASK_X1 = -30.2;                 // the pier at x -30.04..-29.52

/* ------------------------------- the plots -------------------------------
 * All three face 'z+', which is both the lane and the sunlit side: the sun is
 * at (-52, 62, 56), so a +z frontage is the warm elevation and a -z one is lit
 * by the cool bounce alone.  Every one of them is set back far enough that its
 * own boundary, forecourt or eave lands clear of the carriageway -- the
 * northblock lesson, where a gallery 0.1 m off the lane put its garden wall
 * *in* the lane and the flood fill found it blocked in two places. */
const WALK = { x: -71.5, z: -13.2, w: 8.0, d: 7.0 };       // ハイツ ひばり
const NAGA = { x: -59.0, z: -11.9, units: 4, unitW: 2.7, d: 5.2 };
const TERR = { x: -48.5, z: -13.5, units: 3, unitW: 2.9, d: 6.2 };
/* The gap between the walk-up and the 長屋.  3.1 m, which after two colliders
 * is 2.17 m of walkable ground -- a shared bike yard rather than a route, and
 * closed at the back with a 板塀 so it does not read as one. */
const GAP_A = { x0: -67.5, x1: -64.4 };
/* And the gap between the 長屋 and the 連棟: 0.75 m, a party gap and nothing
 * else.  Meshed off at the lane, because 0.75 m of daylight between two
 * buildings reads as an opening and is a fifth of what a body needs. */
const GAP_B = { x0: -53.6, x1: -52.85 };

/* --------------------------- the ways south --------------------------- */
const A1 = { x0: -13.9, x1: -12.2 };   // 1.70 m -- the route to the canal
const A2 = { x0: -23.6, x1: -22.1 };   // 1.50 m -- the drying ground
const A3 = { x0: -32.7, x1: -31.4 };   // 1.30 m -- 0.62 m walkable: not a route
const A4 = { x0: -44.15, x1: -41.3 };  // 2.85 m -- past the 連棟's east flank
/* Where each flight climbs the canal's made ground.  `canal.js` lays its grass
 * verge as a pad over z -19.4..-18.0 with its top at Y0 + 0.05, and the natural
 * grade at z = -18 is 0.18 -- so the bank stands 0.47 m proud of the field,
 * which is more than the player's 0.38 m step and cannot be climbed at all
 * without a flight.  Three treads each, and the rise is *derived* from
 * `ctx.groundAt` at both ends rather than written down, because the verge pad
 * is what sets it and a number here would go stale the moment it moved. */
const FLIGHT_Z = -16.95;               // the foot of every flight
const VERGE_Z = -18.6;                 // a point on the verge, for the height

const M = {};
function mats() {
  if (M.concrete) return M;
  M.concrete = cel({ color: PAL.concrete, bands: 3, tint: 0x6f6790 });
  M.concreteMid = cel({ color: PAL.concreteMid, bands: 3, tint: 0x6a6288 });
  M.concreteDark = cel({ color: PAL.concreteDark, bands: 3, tint: 0x655d84 });
  M.metal = cel({ color: PAL.metal, bands: 3, tint: 0x666090 });
  M.metalDark = cel({ color: PAL.metalDark, bands: 3, tint: 0x5c5680 });
  M.stone = cel({ color: PAL.stone, bands: 3, tint: 0x655d80 });
  M.wood = cel({ color: 0x9c7f5e, bands: 3, tint: 0x5c5680 });
  M.woodDark = cel({ color: 0x74563f, bands: 3, tint: 0x554e74 });
  M.algae = cel({ color: 0x6e7a62, bands: 2, tint: 0x5b6f8c });
  return M;
}

export function buildIchome(ctx) {
  const m = mats();
  const gm = groundMats();
  const rng = rngKit(8100);
  const sakura = [];
  const shrubs = [];
  const grove = [];
  const petals = [];

  /* The lane and both its ends are at groundY = 0: the street profile only
   * starts climbing at z = -13, and every surface here is north of that. */
  const Y = groundY(LN_Z);

  buildLane(ctx, m, gm);
  buildMaskingWall(ctx, m, shrubs);
  buildAlleys(ctx, m, gm, shrubs);
  buildWalkup(ctx, m, gm, shrubs);
  buildNagaya(ctx, m, gm);
  buildTerrace(ctx, m, gm, sakura);
  buildHouseECourt(ctx, m, gm);

  /* ------------------------------ planting ------------------------------ *
   * The lineside cherry row on this side of the track is at (-11, -4.6),
   * (-18.5, -4.6) and (-42, -4.9), and the 23 m between the second and third
   * is the only place the row visibly breaks.  One more fills it -- and it can
   * only go east of the pier, because west of x = -30 the row's own z is
   * *inside* the masking wall. */
  sakura.push({ x: -25.6, z: -4.68, y: 0, scale: 1.06, seed: 8140, lean: 0.09, leanDir: 2.4 });

  /* Two at the far west end, and one behind the 連棟, so the block has a back.
   * Nothing goes south of z = -17.6 out here: `canal.js` only lays its verge
   * pad over the dressed stretch (x -58..-4.7), and west of that the bank
   * slab's top is 0.65 m while the height query still answers with the natural
   * grade -- so anything seated there is either buried or standing on nothing. */
  grove.push({ x: -77.6, z: -7.4, y: ctx.groundAt(-77.6, -7.4), scale: 1.5, seed: 8141, spread: 1.1 });
  grove.push({ x: -77.4, z: -15.8, y: ctx.groundAt(-77.4, -15.8), scale: 1.6, seed: 8142, spread: 1.15 });
  grove.push({ x: -50.5, z: -17.3, y: ctx.groundAt(-50.5, -17.3), scale: 1.35, seed: 8143, spread: 1.05 });

  /* Fallen blossom where the trees actually are: under the lineside row at the
   * open east end, a thinner drift down the closed western slot, and in the two
   * alleys that pass under a canopy. */
  petals.push({ x: -22.0, z: LN_Z + 0.1, w: 18.0, d: 2.4, y: 0.09, n: 100 });
  petals.push({ x: -58.0, z: LN_Z - 0.2, w: 20.0, d: 1.8, y: 0.09, n: 60 });
  petals.push({ x: -13.05, z: -10.6, w: 1.5, d: 4.2, y: 0.07, n: 40 });
  petals.push({ x: -42.7, z: -10.8, w: 2.4, d: 4.4, y: 0.07, n: 45 });
  petals.push({ x: -49.6, z: -9.3, w: 6.4, d: 1.8, y: 0.1, n: 50 });

  return { sakura, shrubs, grove, petals };
}

/* ------------------------------------------------------------------ *
 * 線路裏の道 -- the back lane.
 * ------------------------------------------------------------------ */

function buildLane(ctx, m, gm) {
  const rng = rngKit(8101);

  /* The carriageway.  `axis: 'x'` is one level box and it registers a platform,
   * which is right here: the profile is flat across the whole run, so the lane
   * is a 0.11 m level change rather than a surface following a slope. */
  lane(ctx, {
    axis: 'x', at: LN_Z, from: LN_X0, to: LN_X1, w: LN_W, y: 0,
    mat: gm.asphaltWorn, kerb: false, rise: 0.05, name: 'ichomeLane',
  });

  /* The spur that makes the road gap and the lane actually meet.
   *
   * The player arrives through the 2.2 m hole in the road's retaining wall at
   * z -12.9..-10.7, walks west along the 2 m corridor between houses A and B,
   * and turns north here.  `axis: 'z'` sweeps `groundY` and registers no
   * platform, which is correct -- it is a surface laid on the grade, not a step
   * up onto anything.  It stops 0.1 m *under* the lane's south edge so the two
   * surfaces overlap instead of leaving a hairline of terrain between them. */
  lane(ctx, {
    axis: 'z', at: -12.9, from: -12.6, to: -8.0, w: 2.0,
    mat: gm.asphaltWorn, kerb: false, rise: 0.05, name: 'ichomeSpur',
  });

  /* What a lane too narrow for kerbs has instead of gutters.  0.25 m inside the
   * south edge, and clear of the 長屋's own front channel at z = -8.22: two
   * drains 0.13 m apart is one drain drawn twice, with the ink pass outlining
   * both. */
  laneGutter(ctx, {
    axis: 'x', at: -7.85, from: -75.0, to: -13.2, y: 0.02, pitch: 0.95,
    manholes: [-50.0, -24.4],
    patches: [[-63.0, -7.2, 2.2, 1.5], [-33.6, -6.4, 1.8, 1.3], [-19.4, -7.4, 1.5, 1.2]],
  });

  /* The corner, at the east mouth where the spur comes up out of the road
   * corridor: the street-name plate, the convex mirror for the blind turn, and
   * the 徐行 plate.  All three stand on the verge north of the lane -- the
   * corridor lesson from the canal link, where a warning plate a quarter of a
   * metre inside a 2 m passage meant the whole view through the gap walking
   * west was the blank back of a sign at eye height. */
  laneSign(ctx, {
    x: -14.9, z: -5.2, y: 0, variant: 0, ry: 0.06, h: 2.1,
    mirror: true, mirrorAt: [0.62, 0.26], mirrorRy: 2.35,
    slow: true, slowAt: [-2.6, 0.12], slowRy: 0.2,
  });

  /* 車止め at the threshold between the surfaced spur, which a small van uses,
   * and the 1.5 m footpath south to the canal, which it does not.  Two of them
   * in a 1.5 m opening, and neither is collided -- a bollard you cannot walk
   * round is a wall. */
  bollardRow(ctx, { axis: 'x', at: -12.72, from: -13.55, to: -12.55, n: 2, y: 0.02 });

  /* --------------------------- poles and cabling --------------------------- *
   * Five down the north verge with the cables strung between them and three
   * service drops.  A residential lane with no wires over it looks like a
   * render rather than a street, and on a straight 63 m run the pole line is
   * also what carries the eye west to the end of it.
   *
   * The verge is 0.36 m of walkable ground -- the wall's collider reaches
   * z = -5.34 -- so a 0.4 m pole collider sits behind the walkable edge and
   * costs the lane nothing.  The one at x = -20.5 is 4 m clear of the existing
   * pole at (-16.5, -4.4), which is the sixth in the run as far as the picture
   * is concerned. */
  {
    const PZ = -5.4;
    const defs = [
      { x: -71.5, z: PZ, h: 8.4, seed: 8110, armDir: -1, lamp: true },
      { x: -58.0, z: PZ, h: 8.2, seed: 8111, armDir: -1 },
      { x: -45.0, z: PZ, h: 8.4, seed: 8112, armDir: -1, lamp: true },
      { x: -31.5, z: PZ, h: 8.2, seed: 8113, armDir: -1 },
      { x: -20.5, z: PZ, h: 8.4, seed: 8114, armDir: -1, lamp: true },
    ].map((d) => ({ ...d, y: 0 }));
    poleRun(ctx, {
      defs,
      chains: [[0, 1, 2, 3, 4]],
      offsets: [[0, -0.45], [-0.42, 0.28]],
      drops: [
        [0, [-68.6, 6.1, -9.9]],       // the walk-up's gallery end
        [1, [-57.4, 2.95, -8.65]],     // a bracket on the 長屋's eave fascia
        [2, [-45.8, 4.9, -10.5]],      // the 連棟's east verge board
      ],
      sag: 0.5,
    });
  }

  /* One bench and one propped bicycle, both on the *open* verge east of the
   * pier where there is 1.96 m between the lane and the lineside fence.  There
   * is nowhere for either west of x = -30: 0.36 m of walkable verge in front of
   * a 2.2 m wall is a place to grow ivy, not a place to sit. */
  ctx.add(makeBench({ x: -21.2, z: -4.3, y: ctx.groundAt(-21.2, -4.3), ry: Math.PI, len: 1.8 }));
  ctx.collide(-22.1, -4.62, -20.3, -3.98, 0.02 + 1.02);
  ctx.add(makeBicycle({ x: -24.6, z: -4.55, y: ctx.groundAt(-24.6, -4.55), ry: 0.04, lean: 0.07, color: 0x9c5a4a }));
  ctx.add(makeMilkCrate({ x: -19.6, z: -4.4, y: ctx.groundAt(-19.6, -4.4), n: 2, ry: 0.4 }));

  /* A hopscotch grid chalked on the asphalt.  It is the only thing in the
   * street that says children live on it, and it says so without a figure --
   * which is the constraint, not a workaround for it. */
  makeChalkMarks(ctx, [
    { x: -20.2, z: -6.5, y: 0.09, ry: 0.28, scale: 0.95, seed: 8121 },
    { x: -35.4, z: -7.1, y: 0.09, ry: -0.4, scale: 0.8, seed: 8122 },
  ]);
  makeLoosePaper(ctx, [
    { x: -30.8, z: -6.2, y: 0.09, ry: 0.7 },
    { x: -55.2, z: -7.4, y: 0.09, ry: -0.3 },
  ]);

  /* The dead end at the west, 0.3 m past where the asphalt stops.  A lane that
   * simply runs out of surface reads as an unfinished model; a rail across it
   * with a thicket behind reads as the end of the street.  Same move as the
   * north block's south end, and the walk-up's stair tower stands just south of
   * it so the view west closes on a building rather than on a hedge. */
  railing(ctx, {
    axis: 'z', at: -76.3, from: LN_S - 0.2, to: LN_N + 0.2, y: 0.06, h: 0.92,
    spacing: 1.4, mat: m.metal,
  });
}

/* ------------------------------------------------------------------ *
 * The masking wall, which is the north side of the whole street.
 *
 * 46 m of plain 2.2 m concrete, and at this tonal range that is a grey card
 * unless something happens on it.  Four things do, and they are all cheap:
 * buttress piers every four and a half metres, an algae tide line along the
 * foot, weep holes above it, and three runs of ivy over the top.  Nothing
 * stands in front of it above a metre, because the verge in front is 0.36 m
 * wide and anything taller closes the lane.
 * ------------------------------------------------------------------ */

function buildMaskingWall(ctx, m, shrubs) {
  const rng = rngKit(8102);
  const piers = [];
  const caps = [];
  const weeps = [];
  const tide = [];

  for (let x = MASK_X0; x <= MASK_X1; x += 4.5) {
    piers.push({
      geometry: new THREE.BoxGeometry(0.44, 2.24, 0.16),
      matrix: trs(x, 1.12, MASK_Z - 0.08),
    });
    caps.push({
      geometry: new THREE.BoxGeometry(0.56, 0.09, 0.26),
      matrix: trs(x, 2.28, MASK_Z - 0.1),
    });
    // the weep hole halfway between two piers, and the stain under it
    const wx = x + 2.25;
    if (wx > MASK_X1) continue;
    weeps.push({
      geometry: new THREE.BoxGeometry(0.16, 0.11, 0.07),
      matrix: trs(wx, 0.46, MASK_Z - 0.03),
    });
    tide.push({
      geometry: new THREE.BoxGeometry(0.13, 0.42, 0.03),
      matrix: trs(wx, 0.24, MASK_Z - 0.035),
    });
  }
  // and the continuous damp line along the base, where the paving meets it
  tide.push({
    geometry: new THREE.BoxGeometry(MASK_X1 - MASK_X0, 0.13, 0.03),
    matrix: trs((MASK_X0 + MASK_X1) / 2, 0.09, MASK_Z - 0.03),
  });

  const pm = new THREE.Mesh(bake(piers), m.concreteMid);
  pm.castShadow = pm.receiveShadow = true;
  ctx.add(pm);
  /* The pier caps do not cast.  A 60 mm overhang is about two texels of this
   * shadow cascade, so its own shadow lands as a row of sawtooth triangles
   * along the wall face instead of as a line -- the reason `wallRun` turns it
   * off on its coping too. */
  const cm = new THREE.Mesh(bake(caps), m.concrete);
  cm.castShadow = false;
  cm.receiveShadow = true;
  ctx.add(cm);
  ctx.add(new THREE.Mesh(bake(weeps), m.concreteDark));
  const tm = new THREE.Mesh(bake(tide), m.algae);
  tm.userData.noOutline = true;
  ctx.add(tm);

  /* Ivy over the coping, three runs with two clear stretches between them.  A
   * continuous curtain the whole length is a hedge; the point of the wall is
   * that it is mostly bare, with the green where the gardens behind it are.
   * `face: -1` leans the blobs out to -z, off the wall and over the lane. */
  for (const [x, len, seed] of [[-71.0, 9.0, 8130], [-52.5, 12.0, 8131], [-35.5, 8.0, 8132]]) {
    ctx.add(makeIvy({ x, z: MASK_Z - 0.02, y: 0, ry: 0, face: -1, len, top: 2.2, drop: 1.45, seed }));
  }

  /* Two 防犯カメラ plates and the 町内会 notice case, bolted flat to the wall.
   * Flat to the wall and not on posts: a 1.4 m board on legs occupies 2.08 m
   * once the player's radius is added to both sides, which is most of a 2.4 m
   * lane -- exactly what sealed the canal alley off for a whole round. */
  wallPlate(ctx, m, { x: -58.6, y: 1.62, w: 0.3, h: 0.6, map: warningPlate(0) });
  wallPlate(ctx, m, { x: -35.2, y: 1.66, w: 0.3, h: 0.6, map: warningPlate(0) });
  noticeCase(ctx, m, { x: -43.0, y: 1.6 });

  /* Shrub clumps along the foot of it, and two on the open verge east of the
   * pier.  Shrubs keep `receiveShadow` on purpose -- they sit on the ground
   * where being in the wall's shade reads correctly.  (A tree canopy must not:
   * see the note in CLAUDE.md about dark circles hanging in the sky.) */
  for (const [x, seed] of [[-73.2, 8133], [-62.4, 8134], [-48.6, 8135], [-40.2, 8136], [-32.4, 8137]]) {
    shrubs.push({ x, z: -5.5, y: 0, r: 0.34, count: 3, spread: 0.6, seed });
  }
  shrubs.push({ x: -27.6, z: -4.3, y: 0, r: 0.42, count: 4, spread: 1.1, seed: 8138 });
  shrubs.push({ x: -16.2, z: -4.25, y: 0, r: 0.4, count: 3, spread: 1.0, seed: 8139 });
  shrubs.push({ x: -77.0, z: -6.4, y: 0, r: 0.5, count: 4, spread: 1.4, seed: 8144 });
}

/**
 * A printed plate bolted flat to the masking wall.
 *
 * The map goes on the box's **-z** face, because that is the face the lane
 * sees, and `BoxGeometry` already reverses `udir` on the negative face of every
 * axis -- so one map reads correctly from that side with no `mirrored()`, which
 * is what used to produce mirror writing on every two-sided sign in the world.
 */
function wallPlate(ctx, m, o) {
  const side = flat({ color: PAL.wallGray });
  const face = flat({ color: 0xffffff, map: o.map, cache: false });
  const plate = new THREE.Mesh(new THREE.BoxGeometry(o.w, o.h, 0.05),
    [side, side, side, side, side, face]);
  plate.position.set(o.x, o.y, MASK_Z - 0.025);
  plate.castShadow = true;
  ctx.add(plate);
  hullOutline(plate, { thickness: 0.0026 });
}

/**
 * The 町内会 notice case on the wall: a shallow glazed box with two sheets in
 * it, at the height a notice is actually read from.
 *
 * The two sheets are `PlaneGeometry`, which faces +z, and this wall's outward
 * normal is (0, -1) -- so both are turned by `atan2(nx, nz) = PI` or they are
 * back-face culled and the case comes out as an empty grey box.  The library
 * lost every glimpsed interior it had to exactly this.
 */
function noticeCase(ctx, m, o) {
  const g = new THREE.Group();
  const zf = MASK_Z - 0.14;              // the front face of the case
  const body = box(1.2, 0.9, 0.14, m.metalDark, o.x, o.y, MASK_Z - 0.07);
  body.castShadow = body.receiveShadow = true;
  g.add(body);
  hullOutline(body, { thickness: 0.0028 });
  // the backing board, so the sheets have something behind them
  g.add(box(1.1, 0.8, 0.02, flat({ color: 0xd8d2c4 }), o.x, o.y, zf + 0.01));
  for (let i = 0; i < 2; i++) {
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.6),
      flat({ color: 0xffffff, map: hallNotice(i), cache: false }));
    sheet.position.set(o.x - 0.27 + i * 0.54, o.y + 0.02, zf - 0.005);
    sheet.rotation.y = Math.PI;
    sheet.userData.noOutline = true;
    g.add(sheet);
  }
  /* The glazing.  Transparent, so it must not cast and must not write depth --
   * the ink pass reads the depth buffer and a see-through pane written into it
   * comes back as a field of speckle. */
  const glass = box(1.12, 0.82, 0.03,
    flat({ color: PAL.glass, transparent: true, opacity: 0.2, depthWrite: false, cache: false }),
    o.x, o.y, zf - 0.02);
  glass.userData.noOutline = true;
  glass.userData.noShadow = true;
  g.add(glass);
  // the hasp, and the pitched drip over the top
  g.add(box(0.09, 0.13, 0.05, m.metal, o.x + 0.62, o.y, MASK_Z - 0.09));
  const hood = box(1.34, 0.05, 0.22, m.metal, o.x, o.y + 0.49, MASK_Z - 0.13);
  hood.rotation.x = 0.22;
  hood.castShadow = true;
  g.add(hood);
  ctx.add(g);
}

/* ------------------------------------------------------------------ *
 * The four ways south.
 *
 * Three of them are the point of the block: they are the first pedestrian
 * routes from the crossing to the 用水路's south bank, and the second one lands
 * a metre from the foot of ひばり橋, which turns the footbridge from something
 * you find by walking the whole bank into something you walk out of an alley
 * onto.  The fourth is a dead end and is built as one.
 * ------------------------------------------------------------------ */

function buildAlleys(ctx, m, gm, shrubs) {
  const rng = rngKit(8103);

  /* ------------------------- 1: x -13.9..-12.2 ------------------------- *
   * 1.02 m of walkable width, and a cherry standing in its mouth at
   * (-12.0, -14.5) with a 0.4 m collider that takes it down to 1.02 m at that
   * one z.  The tree stays and nothing else goes in the passage: a cherry
   * overhanging a metre-wide alley is worth more than the tidiness, and two
   * things in a passage this narrow is a wall. */
  alleyPath(ctx, gm, { at: -13.05, w: 1.5, from: -17.4, to: -8.05, mat: gm.concrete });
  flight(ctx, gm, -13.05, 1.3, 8150);

  /* ------------------------- 2: x -23.6..-22.1 ------------------------- *
   * 0.82 m walkable, which is a genuine squeeze and deliberately so -- it is
   * the oldest-feeling thing in the block.  Ivy up both flanking walls, and the
   * drying ground is *not* in it: a `makeDryingRack` is 1.2 m wide and would
   * occupy 1.88 m of a 1.5 m alley.  It goes in the yard behind house D
   * instead, which the alley opens into once house D's south wall runs out at
   * z = -15.9. */
  alleyPath(ctx, gm, { at: -22.85, w: 1.24, from: -17.4, to: -8.05, mat: gm.concrete });
  flight(ctx, gm, -22.85, 1.1, 8151);
  ctx.add(makeIvy({ x: -23.55, z: -12.4, y: 0.02, ry: Math.PI / 2, face: -1, len: 5.4, top: 2.4, drop: 1.7, seed: 8152 }));
  ctx.add(makeIvy({ x: -22.15, z: -11.4, y: 0.02, ry: -Math.PI / 2, face: -1, len: 4.2, top: 2.15, drop: 1.5, seed: 8153 }));

  /* the drying ground and the allotment behind house D, off alley 2 */
  {
    const yz = -16.6;
    const gy = (x, z) => ctx.groundAt(x, z);
    ctx.add(makeDryingRack({ x: -26.6, z: yz + 0.1, y: gy(-26.6, yz), ry: 0.16, seed: 8154, n: 5 }));
    ctx.add(makeTapPost({ x: -24.4, z: -16.3, y: gy(-24.4, -16.3), ry: Math.PI }));
    ctx.add(makeBucket({ x: -24.9, z: -16.85, y: gy(-24.9, -16.85), ry: 0.5, water: true }));
    ctx.add(makePotShelf({ x: -23.6, z: -16.35, y: gy(-23.6, -16.35), ry: Math.PI, w: 1.1, n: 5, seed: 8155 }));
    ctx.add(makeCrates({ x: -28.7, z: -16.45, y: gy(-28.7, -16.45), n: 3, seed: 8156, ry: -0.24 }));
    ctx.add(makeKitchenGarden({ x: -30.4, z: -16.9, y: gy(-30.4, -16.9), ry: 0, w: 1.7, d: 1.0, seed: 8157 }));
    ctx.add(makeBroom({ x: -23.75, z: -15.95, y: gy(-23.75, -15.95), tilt: -0.05, roll: -0.18, ry: 0.4 }));
    shrubs.push({ x: -32.0, z: -16.7, y: gy(-32.0, -16.7), r: 0.42, count: 3, spread: 1.0, seed: 8158 });
  }

  /* -------------------- 3: x -32.7..-31.4, the dead end -------------------- *
   * 1.3 m between two house walls is 0.62 m of clear ground once the player's
   * radius is added to both sides, and 0.62 m is not a route.  So it is closed
   * where it meets the lane -- a 板塀 across the full width with a shut gate in
   * it -- and the 物置 inside seals the rest by being 1.2 m wide in a 1.3 m
   * slot.  What is behind the gate is visible over it and goes nowhere, which
   * is the honest reading of the space and is what a lane like this is full of. */
  {
    const y = ctx.groundAt(-32.05, -10.5);
    plotWall(ctx, {
      x0: A3.x0, x1: A3.x1, z0: -14.8, z1: -10.45, y,
      sides: ['z+'], kind: 'timber', h: 0.34, fenceH: 1.25, seed: 8160,
    });
    shutGate(ctx, m, { x: -32.05, z: -10.38, y, w: 0.92, h: 1.42 });
    const sh = makeStorageShed({ x: -32.05, z: -13.4, y: ctx.groundAt(-32.05, -13.4), ry: 0, w: 1.2, d: 0.68, h: 1.55 });
    ctx.add(sh);
    ctx.collide(-32.65, -13.76, -31.45, -13.04, y + (sh.userData.top ?? 1.63));
    ctx.add(makeCrates({ x: -32.1, z: -12.4, y: ctx.groundAt(-32.1, -12.4), n: 3, seed: 8161, ry: 0.1 }));
    ctx.add(makeLaundryPole({ ctx,
      x: -32.05, z: -11.5, y: ctx.groundAt(-32.05, -11.5), ry: Math.PI / 2,
      len: 1.6, n: 3, seed: 8162,
    }));
  }

  /* ------------------------- 4: x -44.15..-41.3 ------------------------- *
   * 2.85 m between the 連棟's east flank and house E, which is 2.17 m walkable
   * and the widest of the four -- so it gets the handrail the other two have no
   * room for.  The rail is 0.15 m off the terrace's flank, which puts its
   * collider inside the ground the terrace already blocks and costs the alley
   * 0.14 m of width. */
  alleyPath(ctx, gm, { at: -42.72, w: 2.3, from: -17.2, to: -8.05, mat: gm.asphaltWorn });
  flight(ctx, gm, -42.72, 1.9, 8163);
  railing(ctx, {
    axis: 'z', at: -44.0, from: -16.4, to: -9.6, y: 0.02, h: 1.0, spacing: 2.1, mat: m.white ?? gm.white,
  });
  ctx.add(makeBucket({ x: -43.6, z: -13.2, y: ctx.groundAt(-43.6, -13.2), ry: 0.8 }));
  ctx.add(makeMilkCrate({ x: -41.7, z: -12.5, y: ctx.groundAt(-41.7, -12.5), n: 2, ry: -0.3 }));
  ctx.add(makeCatBox({ x: -41.75, z: -14.4, y: ctx.groundAt(-41.75, -14.4), ry: 1.2 }));
}

/**
 * The surface down one alley.
 *
 * `axis: 'z'` because the grade climbs 0.12 m over the run and a level box
 * would be buried at one end -- and because it must register no platform: an
 * alley is a surface laid on the ground, not a step up onto anything.  It ends
 * 0.05 m under the lane so the two overlap rather than meeting.
 */
function alleyPath(ctx, gm, o) {
  lane(ctx, {
    axis: 'z', at: o.at, from: o.from, to: o.to, w: o.w,
    mat: o.mat ?? gm.concrete, kerb: false, rise: 0.04, name: 'ichomeAlley',
  });
}

/**
 * Three treads up onto the canal's grass verge.
 *
 * The rise is derived, not written down: `ctx.groundAt` at the foot and on the
 * verge is the only pair of numbers that can be right, because the verge is a
 * pad laid by `canal.js` and any constant here goes stale the moment it moves.
 *
 * Two details that are the difference between a flight and a hole:
 *  - the top tread lands 15 mm *under* the verge pad, so the two platforms
 *    overlap by 0.15 m instead of merely meeting -- a few centimetres of gap
 *    between the top tread and what it lands on is a hole to fall through --
 *    and so the two concrete tops are not coplanar and do not fight;
 *  - no railings on the narrow flights.  A pipe rail costs 0.43 m of width per
 *    side, and alley 2 has 0.82 m to give.
 */
function flight(ctx, gm, x, w, seed) {
  const yBot = ctx.groundAt(x, FLIGHT_Z);
  const yTop = ctx.groundAt(x, VERGE_Z);
  const n = 3;
  const rise = (yTop - 0.015 - yBot) / n;
  steps(ctx, {
    x, z: FLIGHT_Z, axis: 'z', dir: -1, n, rise, run: 0.4, w, y: yBot,
    mat: gm.concrete, lipMat: gm.concreteMid,
  });
  return { top: yBot + rise * n };
}

/** A shut timber gate leaf, so a closed 板塀 reads as closed *on purpose*. */
function shutGate(ctx, m, o) {
  const g = new THREE.Group();
  const parts = { wood: [], dark: [], metal: [] };
  const push = (k, geo, mx) => parts[k].push({ geometry: geo, matrix: mx });
  // three boards, a top and bottom rail, a diagonal brace and the latch
  const n = 3;
  for (let i = 0; i < n; i++) {
    push('wood', new THREE.BoxGeometry(o.w / n - 0.02, o.h, 0.035),
      trs(o.x - o.w / 2 + (o.w / n) * (i + 0.5), o.h / 2 + 0.06, o.z));
  }
  for (const y of [o.h - 0.16, 0.28]) {
    push('dark', new THREE.BoxGeometry(o.w, 0.09, 0.04), trs(o.x, y + 0.06, o.z - 0.035));
  }
  push('dark', new THREE.BoxGeometry(Math.hypot(o.w, o.h - 0.44) + 0.04, 0.07, 0.04),
    trs(o.x, o.h / 2 + 0.06, o.z - 0.035, 0, 0, Math.atan2(o.h - 0.44, o.w)));
  for (const s of [-1, 1]) {
    push('dark', new THREE.BoxGeometry(0.07, o.h + 0.12, 0.06), trs(o.x + s * (o.w / 2 + 0.03), o.h / 2 + 0.06, o.z - 0.02));
  }
  push('metal', new THREE.BoxGeometry(0.16, 0.06, 0.05), trs(o.x + o.w / 2 - 0.12, o.h * 0.58, o.z - 0.05));
  push('metal', new THREE.CylinderGeometry(0.018, 0.018, 0.12, 6), trs(o.x + o.w / 2 - 0.05, o.h * 0.58, o.z - 0.05));
  const matFor = { wood: m.wood, dark: m.woodDark, metal: m.metalDark };
  for (const k of Object.keys(parts)) {
    if (!parts[k].length) continue;
    const mesh = new THREE.Mesh(bake(parts[k]), matFor[k]);
    mesh.castShadow = mesh.receiveShadow = true;
    g.add(mesh);
  }
  g.position.y = o.y;
  ctx.add(g);
}

/* ------------------------------------------------------------------ *
 * ハイツ ひばり -- the three-storey block at the west end.
 *
 * The oldest type in the world after the 長屋 and the one the brief asked for:
 * a pre-war walk-up, gallery and open steel stair on the street, four flats
 * over three floors.  It stands at the far west end and its stair tower is
 * what closes the 63 m view down the lane -- which is why it is here rather
 * than in the middle, where it would have walled the street in half.
 * ------------------------------------------------------------------ */

function buildWalkup(ctx, m, gm, shrubs) {
  const rng = rngKit(8104);
  const Y = groundY(WALK.z);
  const p = plotBox({ ...WALK, face: 'z+' });

  const b = makeWalkup({
    x: WALK.x, z: WALK.z, y: Y, w: WALK.w, d: WALK.d, face: 'z+',
    floors: 3, units: 4, seed: 8170, wall: 4, roof: 0, door: 5, plate: 2, ctx,
  });
  ctx.add(b);

  /* the forecourt: 1.55 m of concrete between the gallery and the lane */
  pad(ctx, {
    x: WALK.x, z: -8.925, w: WALK.w, d: 1.55, y: Y, h: 0.07,
    mat: gm.concrete, name: 'ichomeWalkupCourt',
  });

  const gy = (x, z) => ctx.groundAt(x, z);
  /* Everything a block of four flats keeps outside its own front door.  All of
   * it faces the lane -- `ry = 0` is the frontage's outward normal here, and a
   * mailbox bank turned to address the building it belongs to is the mistake
   * that had half the outdoor units in the world blowing into their own walls. */
  ctx.add(makeMailboxBank({ x: -74.4, z: -8.8, y: gy(-74.4, -8.8), ry: 0, cols: 4, rows: 2 }));
  ctx.add(makeDeliveryBox({ x: -73.4, z: -8.85, y: gy(-73.4, -8.85), ry: 0 }));
  ctx.add(makeWaterMeter({ x: -72.4, z: -8.55, y: gy(-72.4, -8.55), ry: 0 }));
  /* the bin point: three bins and the collection plate, not the built
   * enclosure -- a 1.9 m 塵置場 in a 1.55 m forecourt has its back inside the
   * gallery and its front in the lane */
  refusePoint(ctx, {
    x: -68.6, z: -8.85, y: gy(-68.6, -8.85), ry: 0, kind: 'bins', plate: 0,
  });
  ctx.add(makePlanter({ x: -75.15, z: -8.6, y: gy(-75.15, -8.6), r: 0.24, flower: true, seed: 8171, n: 5 }));
  ctx.add(makePlanter({ x: -74.75, z: -9.15, y: gy(-74.75, -9.15), r: 0.19, flower: false, seed: 8172, n: 4 }));
  /* A bicycle *along* the frontage.  It is 1.73 m long and 0.55 m wide, so
   * turned across a 1.55 m forecourt it goes through the gallery at one end and
   * over the lane edge at the other -- which is what thirty-seven of the
   * eighty-seven bicycles in this world were doing. */
  ctx.add(makeBicycle({ x: -70.9, z: -8.86, y: gy(-70.9, -8.86), ry: 0.03, lean: 0.07, color: 0x3f6f9c }));
  ctx.add(makeKidBike({ x: -72.9, z: -9.15, y: gy(-72.9, -9.15), ry: 0.4 }));
  ctx.add(makeCatBox({ x: -75.9, z: -9.9, y: gy(-75.9, -9.9), ry: -0.5 }));
  makeLoosePaper(ctx, [{ x: -69.9, z: -9.3, y: gy(-69.9, -9.3) + 0.01, ry: 0.55 }]);

  /* ------------------- the shared yard between the two blocks ------------------- *
   * 3.1 m, 2.17 m of it walkable, and the block's bike parking.  The shelter and
   * the rack are laid out the only way they fit: the row runs along z (four at
   * 0.66 m is 2.0 m of it) and each bicycle's 1.73 m length runs along x inside
   * the 3.1 m gap, nose to the fence.  A bike in a rack is nose-in, so what has
   * to clear the render is half a wheelbase and not half a handlebar. */
  {
    const cx = (GAP_A.x0 + GAP_A.x1) / 2;
    const y = ctx.groundAt(cx, -11.0);
    pad(ctx, {
      x: cx, z: -10.75, w: GAP_A.x1 - GAP_A.x0, d: 5.2, y, h: 0.06,
      mat: gm.gravel, name: 'ichomeBikeYard',
    });
    ctx.add(makeBikeShelter({ ctx, x: -66.5, z: -11.0, y: ctx.groundAt(-66.5, -11.0), ry: Math.PI / 2, w: 3.4, d: 1.9, h: 2.05 }));
    ctx.add(makeBikeRack({ x: -66.4, z: -11.0, y: ctx.groundAt(-66.4, -11.0), n: 4, spacing: 0.66, ry: 0, seed: 81 }));
    ctx.add(makeTapPost({ x: -64.85, z: -9.9, y: ctx.groundAt(-64.85, -9.9), ry: -Math.PI / 2 }));
    ctx.add(makeLaundryPole({ ctx,
      x: -65.15, z: -12.4, y: ctx.groundAt(-65.15, -12.4), ry: Math.PI / 2,
      len: 2.1, n: 4, seed: 8173,
    }));
    ctx.add(makeCrates({ x: -64.9, z: -13.0, y: ctx.groundAt(-64.9, -13.0), n: 2, seed: 8174, ry: 0.3 }));
    /* and the 板塀 across the back of it.  Without this the yard opens onto four
     * metres of waste ground that dead-ends against the canal's made bank -- a
     * space that looks like a way through and is not, which is the one thing
     * this block is most careful about. */
    plotWall(ctx, {
      x0: GAP_A.x0, x1: GAP_A.x1, z0: -13.35, z1: -8.15,
      y: ctx.groundAt(cx, -13.35), sides: ['z-'], kind: 'timber',
      h: 0.34, fenceH: 1.15, seed: 8175,
    });
  }
}

/* ------------------------------------------------------------------ *
 * 長屋 -- four units under one low roof, doors straight onto the lane.
 *
 * The type's whole character is that it has *no setback*: the eave hangs out
 * over the carriageway on a row of posts, the step is the pavement, and the
 * gutter along its front is what a row with no garden has instead of one.  It
 * is also the lowest thing in the world with a frontage, which is exactly what
 * makes it read against the three-storey block twelve metres west of it.
 *
 * Two placement rules, and both of them are why it sits at z = -11.9 rather
 * than at the -11.0 the composition would prefer:
 *
 *  - the eave and its posts must clear the carriageway.  The eave tip lands at
 *    z = -8.38 and the posts at -8.52, so the lane's south edge at -8.10 is
 *    clear by a quarter of a metre.  Half a metre further north and there would
 *    be a 0.16 m timber post standing in a 2.4 m lane every 2.7 m.
 *  - only the volume is collided, never the eave, so the 0.53 m of ground under
 *    the overhang stays walkable.  That strip is the whole point of the type.
 * ------------------------------------------------------------------ */

function buildNagaya(ctx, m, gm) {
  const rng = rngKit(8105);
  const Y = groundY(NAGA.z);
  const W = NAGA.units * NAGA.unitW;
  const p = plotBox({ x: NAGA.x, z: NAGA.z, w: W, d: NAGA.d, face: 'z+' });

  const g = makeNagaya({
    x: NAGA.x, z: NAGA.z, y: Y, units: NAGA.units, unitW: NAGA.unitW, d: NAGA.d,
    face: 'z+', seed: 8180, h: 2.48,
  });
  ctx.add(g);
  ctx.collide(p.x0 - 0.1, p.z0 - 0.1, p.x1 + 0.1, p.z1 + 0.05, Y + (g.userData.top ?? 4.0));

  /* The life of the row, through `dressPlot` so every offset is in the unit's
   * own frame: the aircon on the correct wall facing out of it, the gas cabinet
   * with its back touching the plaster, the mat and the pots at unit 0's door
   * rather than at its window, the shared tap out in the bike yard on the -x
   * flank.  `gap: 0.8` is the honest clear depth in front of the frontage, and
   * it is what makes `dressPlot` skip anything that would not fit -- there is
   * no bicycle here for exactly that reason, and no lit window because
   * `makeNagaya` already lights its end unit. */
  dressPlot(ctx, {
    x: NAGA.x, z: NAGA.z, w: W, d: NAGA.d, face: 'z+', y: Y, seed: 8181,
    doorAt: g.userData.doorAt, gap: 0.8,
    aircon: true, gas: true, mat: true, pots: true, umbrella: true, shelf: true,
    meterLid: true, parcel: false, bike: false, laundry: false, tap: -1,
    clear: (x, z) => z < LN_S - 0.1,
  });

  /* Per-unit clutter in the eave zone, which `dressPlot` only ever dresses one
   * door of.  A 長屋 is four households sharing a roof and the variety has to
   * be per unit and material-free -- same wall, same window, same door frame,
   * different things left outside it. */
  const doors = g.userData.doors ?? [];
  const world = (u) => NAGA.x + u;
  const ez = NAGA.z + NAGA.d / 2 + 0.55;         // -8.75, under the eave
  const gy = (x, z) => ctx.groundAt(x, z);
  if (doors[1] !== undefined) {
    const x = world(doors[1]);
    ctx.add(makeBucket({ x: x + 0.86, z: ez, y: gy(x + 0.86, ez), ry: 0.4, water: true }));
    ctx.add(makeBroom({ x: x + 1.06, z: ez + 0.14, y: gy(x + 1.06, ez), tilt: -0.06, roll: -0.2, ry: -1.3 }));
  }
  if (doors[2] !== undefined) {
    const x = world(doors[2]);
    ctx.add(makeMilkCrate({ x: x + 0.94, z: ez - 0.06, y: gy(x + 0.94, ez), n: 2, ry: 0.2 }));
    ctx.add(makeDoormat({ x, z: ez - 0.1, y: gy(x, ez), ry: 0, w: 0.54, d: 0.32 }));
  }
  if (doors[3] !== undefined) {
    const x = world(doors[3]);
    ctx.add(makeDoormat({ x, z: ez - 0.1, y: gy(x, ez), ry: 0, w: 0.54, d: 0.32, color: 0x6a6a58 }));
    ctx.add(makePlanter({ x: x + 0.9, z: ez, y: gy(x + 0.9, ez), r: 0.2, flower: true, seed: 8182, n: 4 }));
  }
  /* One bicycle, laid along the frontage in the middle of a bay: the bays
   * between eave posts are 2.7 m and each door's stone step takes 1.5 m of the
   * 1.2 m of frontage that is left, so the only place a 1.73 m machine fits is
   * centred between two posts and 0.2 m north of the steps. */
  {
    const bx = -60.35, bz = -8.6;
    ctx.add(makeBicycle({ x: bx, z: bz, y: gy(bx, bz), ry: 0.02, lean: -0.06, color: 0xd8a03c }));
  }
  makeLoosePaper(ctx, [{ x: -56.6, z: -8.4, y: 0.02, ry: -0.6 }]);

  /* GAP_B: 0.75 m between this gable and the 連棟's flank.  Meshed off at the
   * lane, because 0.75 m of daylight between two buildings reads as an opening
   * from the street and is a fifth of what a body needs to get through it. */
  meshFence(ctx, {
    axis: 'x', at: -9.4, from: GAP_B.x0, to: GAP_B.x1,
    y: ctx.groundAt((GAP_B.x0 + GAP_B.x1) / 2, -9.4), h: 1.5, spacing: 2.0, mid: true,
  });
}

/* ------------------------------------------------------------------ *
 * 連棟 三戸 -- the terrace, and its forecourt.
 *
 * The forecourt is 2.25 m deep, and that is worth being explicit about because
 * the obvious thing to do with it is wrong: it will not park a car.  A kei car
 * is 3.4 m long, so three painted bays here would be three bays nothing could
 * ever stand in -- the sort of detail that is correct furniture and a lie about
 * the place.  What it holds instead is what a household on a 2.4 m lane
 * actually keeps: a bicycle each, a scooter, the pots and the parcel box.  The
 * one car space on the whole street is the gravel one in front of house E.
 * ------------------------------------------------------------------ */

function buildTerrace(ctx, m, gm, sakura) {
  const rng = rngKit(8106);
  const Y = groundY(TERR.z);
  const W = TERR.units * TERR.unitW;
  const p = plotBox({ x: TERR.x, z: TERR.z, w: W, d: TERR.d, face: 'z+' });

  const t = makeTerrace({
    x: TERR.x, z: TERR.z, y: Y, units: TERR.units, unitW: TERR.unitW, d: TERR.d,
    face: 'z+', seed: 8190, wall: 6, roof: 2,
  });
  ctx.add(t);
  plotCollide(ctx, p, Y + (t.userData.top ?? 6.34));

  pad(ctx, {
    x: TERR.x, z: -9.275, w: W, d: 2.25, y: Y, h: 0.07,
    mat: gm.asphaltWorn, name: 'ichomeTerraceCourt',
  });
  // the joints in the apron, one on each party line: the only marking on it
  for (let i = 1; i < TERR.units; i++) {
    laneLine(ctx, {
      axis: 'z', at: p.x0 + i * TERR.unitW, from: -10.2, to: -8.4, y: Y + 0.09,
      mat: gm.concreteMid,
    });
  }

  /* The middle unit's door, in the unit's own frame: `makeTerrace` puts each
   * door at `cx - unitW / 2 + 0.78`, and unit 1's `cx` is 0.  Handing that to
   * `dressPlot` is what keeps the mat, the parcel box and the umbrella stand
   * beside a door instead of beside a window -- and it is a signed offset in a
   * frame, which for a unit turned a half circle is the arithmetic that put a
   * ryokan's whole porch 1.4 m off its own doorway. */
  dressPlot(ctx, {
    x: TERR.x, z: TERR.z, w: W, d: TERR.d, face: 'z+', y: Y, seed: 8191,
    doorAt: -0.67, gap: 2.1, litY: 4.2,
    aircon: true, gas: true, lit: true, mat: true, pots: true, umbrella: true,
    parcel: true, bike: false, kidBike: false, laundry: false,
    clear: (x, z) => z < LN_S - 0.1,
  });

  /* the other two doors, and one scooter.  Same recipe as the 長屋: identical
   * doors, different things left at them. */
  const gy = (x, z) => ctx.groundAt(x, z);
  for (const [dx, seed] of [[-3.57, 8192], [2.23, 8193]]) {
    const x = TERR.x + dx;
    const z = -9.85;
    ctx.add(makeDoormat({ x, z, y: gy(x, z), ry: 0, w: 0.56, d: 0.34, color: seed % 2 ? 0x8a7f6a : 0x6a6a58 }));
    const planterX = seed === 8193 ? -43.55 : x + 0.82;
    const planterZ = seed === 8193 ? -10.0 : z + 0.06;
    ctx.add(makePlanter({ x: planterX, z: planterZ, y: gy(planterX, planterZ), r: 0.21, flower: seed === 8192, seed, n: 4 }));
  }
  ctx.add(makeBicycle({ x: -51.2, z: -9.62, y: gy(-51.2, -9.62), ry: -0.03, lean: 0.06, color: 0x4f8f6a }));
  ctx.add(makeBicycle({ x: -45.34, z: -9.2, y: gy(-45.34, -9.2), ry: -Math.PI / 2, lean: -0.0432, color: 0xd8a03c }));
  ctx.add(makeScooter({ x: -44.625, z: -9.2, y: gy(-44.625, -9.2), ry: -Math.PI / 2, seed: 8194 }));
  ctx.add(makeUmbrellaStand({ x: -46.9, z: -9.9, y: gy(-46.9, -9.9), n: 3, seed: 8195 }));
  ctx.add(makeCrates({ x: -52.5, z: -10.0, y: gy(-52.5, -10.0), n: 2, seed: 8196, ry: -0.2 }));

  /* One cherry in the apron's west corner.  It does two jobs: it is the only
   * garden tree on the block, and standing where the 長屋's gable meets the
   * 連棟's it holds back a third of the street from the east approach, so
   * walking west keeps opening new picture rather than showing all of it at
   * once.  Clear of the lane: its trunk collider is 0.5 m and its blocked
   * region stops 0.95 m short of the carriageway. */
  sakura.push({ x: -52.3, z: -9.35, y: Y, scale: 1.12, seed: 8197, lean: 0.11, leanDir: 2.9 });
}

/* ------------------------------------------------------------------ *
 * The gravel car space in front of house E.
 *
 * House E's frontage is 2.3 m back off the lane, which on this street is a
 * whole extra room's worth of ground, and it is the one place a car will stand
 * -- parallel to the lane rather than nose-in, because 2.3 m of depth parks a
 * car sideways and nothing else.  Empty, with the cone somebody puts out and
 * the scooter that lives beside it: a gap that says a household here owns a
 * car and it is out, which is more use than one more building would be.
 *
 * It only occupies the *western* half of that ground.  The eastern half is
 * where `district.js`'s housing sweep puts house E's post box, planters and
 * bicycle when it runs, and a post box standing in the middle of a marked bay
 * is two correct details making one wrong picture.
 * ------------------------------------------------------------------ */

function buildHouseECourt(ctx, m, gm) {
  const y = groundY(-9.2);
  pad(ctx, {
    x: -39.1, z: -9.2, w: 4.2, d: 2.1, y, h: 0.06,
    mat: gm.gravel, name: 'ichomeCarSpace',
  });
  for (const x of [-41.15, -37.05]) {
    laneLine(ctx, { axis: 'z', at: x, from: -10.15, to: -8.35, y: y + 0.08 });
  }
  const gy = (a, b) => ctx.groundAt(a, b);
  /* `makeWheelStops` is authored with the bays side by side along x and the car
   * nosing in from +z, so the plates face the approach -- which here is the
   * lane, at +z.  One bay, and the stops at the far end of it. */
  ctx.add(makeWheelStops({ x: -39.1, z: -10.0, y: gy(-39.1, -10.0), ry: 0, n: 1, gauge: 1.5 }));
  ctx.add(makeCone({ x: -37.5, z: -8.66, y: gy(-37.5, -8.66), ry: 0.3 }));
  ctx.add(makeScooter({ x: -40.5, z: -9.7, y: gy(-40.5, -9.7), ry: 0.12, seed: 8199 }));
  ctx.add(makeStorageShed({ x: -40.9, z: -10.2, y: gy(-40.9, -10.2), ry: 0, w: 1.1, d: 0.62, h: 1.5 }));
  ctx.collide(-41.5, -10.55, -40.3, -9.85, y + 1.58);
}
