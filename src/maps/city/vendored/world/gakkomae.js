import * as THREE from 'three';
import { PAL } from '../core/palette.js';
import { cel, flat } from '../core/toon.js';
import { warningPlate, hallNotice, roadSignTex, gomiPlate } from '../core/textures.js';
import { box, cyl, bake, trs, rngKit } from '../core/util.js';
import { hullOutline } from '../core/outline.js';
import { groundY, centerX, ROAD_HALF, WALK_W } from './street.js';
import { pad, lane, laneLine, steps, railing, groundMats } from './ground.js';
import {
  plotBox, plotWall, hedgeRun, stepStones, refusePoint,
  laneGutter, bollardRow, laneSign, poleRun,
} from './plots.js';
import { makeShop, makeGachapon, makeMenuBoard, makeShopFlag } from './shops.js';
import { makeBikeShelter } from './housing.js';
import { addVending } from './vending.js';
import {
  makeBench, makeBikeRack, makeBicycle, makeNoticeBoard, makePlanter, makeFlowerBed,
  makeSignPost, makeMirror, makeGuardrail, makeTapPost, makeStorageShed, makeBucket,
  makeBroom, makeCrates, makeMilkCrate, makeIvy, makeAircon, makeLoosePaper, makeCone,
  makeDoormat, makeVendBin, makeUmbrellaStand, makePotShelf, makeRecycleBox, makeCatBox,
} from './props.js';
import {
  makeKidBike, makeGasMeter, makeWaterMeter, makeChalkMarks, makeKitchenGarden,
} from './streetprops.js';

/* ------------------------------------------------------------------ *
 * 学校前通り -- the 通学路 itself, from こばと橋 to the school gate.
 *
 * Every other district in this world is a *place*.  This one is the 35 m of
 * road between two of them, and the brief for it was the hardest one yet
 * because the answer is almost never a building: it is what a street has on it
 * when several hundred children walk down it twice a day.
 *
 * ------------------------------------------------------------------ *
 * THE LAND, measured, and it is the reason this district is mostly street.
 *
 * The carriageway is x -0.15..6.15 with footways to -1.70 and 7.70, flat at
 * groundY 1.05 for every z south of -32.  Both sides are very nearly full:
 *
 *   west   house (-5.4,-33.5)      x -9.50..-1.30, z -37.30..-29.70
 *          五丁目's 送迎 bay        x -7.70..-2.70, z -40.50..-37.90
 *          五丁目's cross link      z -42.70..-40.10, x -20.80..-2.00
 *          ひばりマート             x -15.25..-7.95, z -52.55..-43.45, and its
 *                                   9.1 x 5.4 m apron in front of it
 *          五丁目's 抜け道          z -54.80..-52.80
 *          パン工房こむぎ           x -11.45..-4.95, z -60.55..-55.05
 *   east   house (14.4,-35.5)      x 10.90..17.90, z -39.20..-31.80
 *          the school's west wall   x 10.47..10.73, z -41.0..-74.0, with the
 *                                   gate opening at z -52.30..-46.10
 *          the canal's south kerb   z -30.20..-29.84, top 1.27, and the towpath
 *                                   behind it cut to 0.65 against a verge at 1.04
 *
 * That leaves exactly **two** parcels big enough to build on:
 *
 *   P4  x -11.4..-1.7, z -60.55..-65.0   9.7 x 4.45, on the road at the school
 *   P1  x -20.2..-11.4, z -55.0..-63.5   8.8 x 8.5, behind こむぎ, off 五丁目's
 *                                        lane, which already has a turning stub
 *                                        against it
 *
 * and a 2.77 m verge along the school wall, 24 m of it, which is too shallow
 * for anything with a roof and exactly the right depth for what a school
 * frontage actually is: bicycles, boards and signs.
 *
 * So: one shop on the road (P4), one on the lane (P1), and the rest of the work
 * is the street.  Anything more would have meant moving ひばりマート, こむぎ or
 * the school wall, and none of those is worth a shop.
 *
 * ------------------------------------------------------------------ *
 * WHAT THE ARITHMETIC DECIDED
 *
 * **The towpath was unreachable from the bridge head.**  The canal's retaining
 * kerb is 0.62 m of concrete along z = -30.0 running x 7.9..44, and the bank
 * behind it sits 0.37 m below the road verge -- 0.62 m of collider above a
 * 0.38 m step limit, so from the pavement you could see the water and there was
 * no way down to it for forty metres either way.  `canal.js` now leaves a
 * 2.5 m opening at x 7.95..10.45 with a return each side, and the flight comes
 * through it.  Three treads at 0.125, because the whole drop is 0.375.
 *
 * **The bike park fills the verge and the footway carries the walking.**  A
 * nose-in rack needs 0.95 m clear of the render for half a wheelbase, which on
 * a 2.77 m verge leaves 0.98 m -- 0.30 m of walkable ground after the player's
 * own radius, i.e. none.  That is correct and not a problem: the road's own
 * 1.55 m footway is right beside it and is the route.  A Japanese school
 * frontage *is* a wall of bicycles with the pavement in front of it.
 *
 * **Nothing new stands in the middle of the carriageway's sight line.**  The
 * view up the hill from the crossing (`hill`, pos [1.5, 0, -22]) is the opening
 * composition of the whole project, and it looks straight along this road.
 * Everything added here is on a verge.
 *
 * FLOODFILL -- every one of these must be reachable on foot from the spawn:
 *   bridgeSq   [9.3, -32.4]   the 橋詰 square, east of the bridge's south end
 *   towpath    [9.3, -29.2]   the canal's south path, down the new flight
 *   stepsTop   [9.2, -31.2]   the head of the flight
 *   westCorner [-3.2, -28.6]  the west triangle, its mirror and refuse point
 *   verge44    [9.0, -44.0]   the school verge, north of the gate
 *   verge58    [9.0, -58.0]   under the bicycle shelter
 *   bungu      [-2.4, -62.7]  outside 文具・書籍 ひばり堂
 *   bunguYard  [-9.6, -63.0]  its back yard, in from the south
 *   rinwgyo    [-19.4, -58.2] outside ひばり輪業, on 五丁目's lane
 * ------------------------------------------------------------------ */

const Y = 1.05;                          // flat over the whole street
const W_WALK = -1.70;                    // the road's west footway edge
const E_WALK = 7.70;                     // and its east one
const SCH_X = 10.47;                     // the school wall's street face
const GATE_Z = -49.5;
const KERB_Z = -30.0;                    // the canal's retaining kerb line
const BANK_Y = 0.655;                    // the towpath behind it

/* the two plots */
const BUNGU = { x: -5.4, z: -62.7, w: 3.6, d: 4.8, face: 'x+' };   // x -7.8..-3.0, z -64.5..-60.9
const RINGYO = { x: -16.0, z: -58.2, w: 5.4, d: 5.0, face: 'x-' }; // x -18.5..-13.5, z -60.9..-55.5

const M = {};
function mats() {
  if (M.concrete) return M;
  M.concrete = cel({ color: PAL.concrete, bands: 3, tint: 0x6f6790 });
  M.concreteMid = cel({ color: PAL.concreteMid, bands: 3, tint: 0x6a6288 });
  M.concreteDark = cel({ color: PAL.concreteDark, bands: 3, tint: 0x655d84 });
  M.metal = cel({ color: PAL.metal, bands: 3, tint: 0x666090 });
  M.metalDark = cel({ color: PAL.metalDark, bands: 3, tint: 0x5c5680 });
  M.drain = cel({ color: PAL.drain, bands: 3, tint: 0x5d5878 });
  M.stone = cel({ color: PAL.stone, bands: 3, tint: 0x655d80 });
  M.wood = cel({ color: 0x9c7f5e, bands: 3, tint: 0x5c5680 });
  M.woodDark = cel({ color: 0x74563f, bands: 3, tint: 0x554e74 });
  return M;
}

export function buildGakkomae(ctx) {
  const m = mats();
  const gm = groundMats();
  const rng = rngKit(9100);
  const sakura = [];
  const shrubs = [];
  const grove = [];
  const petals = [];

  buildBridgeHead(ctx, m, gm, sakura, shrubs, petals);
  buildSchoolVerge(ctx, m, gm, rng, shrubs, petals);
  buildBungu(ctx, m, gm, rng, shrubs, petals);
  buildRingyo(ctx, m, gm, shrubs);
  buildStreetFurniture(ctx, m, gm, rng, petals);

  /* ---------------------------- poles and cabling ----------------------------
   * `approach.js` already runs the district's big poles down both verges at
   * x -2.5 and 7.4.  These are the *small* ones a street picks up between them:
   * two on the school side carrying the lamps over the bicycle shelter, and one
   * at the bridge head.  They chain to each other and not to the big line,
   * because a lane pole and a distribution pole do not share a crossarm. */
  poleRun(ctx, {
    defs: [
      { x: 9.9, z: -33.4, y: Y, h: 7.4, seed: 9161, armDir: -1, ry: -Math.PI / 2, lamp: true },
      { x: 9.9, z: -43.6, y: Y, h: 7.6, seed: 9162, armDir: -1, ry: -Math.PI / 2 },
      { x: 9.9, z: -56.4, y: Y, h: 7.6, seed: 9163, armDir: -1, ry: -Math.PI / 2, lamp: true },
    ],
    chains: [[0, 1], [1, 2]],
    offsets: [[0, -0.4], [-0.38, 0.26]],
  });

  /* -------------------------------- planting --------------------------------
   * The street's own trees go on the *school* side, in the verge, because the
   * west side is frontage for its whole length and the east side is a wall --
   * and a wall with a tree line in front of it is what stops 24 m of concrete
   * being 24 m of concrete.  Three, spaced so none of them lands on the gate
   * axis: the view through that opening into the 昇降口 is the school's own
   * establishing shot. */
  sakura.push({ x: 9.5, z: -42.6, y: Y, scale: 1.14, seed: 9171, lean: 0.11, leanDir: 1.7 });
  sakura.push({ x: 9.5, z: -55.4, y: Y, scale: 1.20, seed: 9172, lean: 0.09, leanDir: 4.4 });
  sakura.push({ x: 9.4, z: -63.2, y: Y, scale: 1.10, seed: 9173, lean: 0.12, leanDir: 2.9 });
  sakura.push({ x: -3.2, z: -60.0, y: Y, scale: 1.06, seed: 9174, lean: 0.1, leanDir: 3.4 });
  /* and the green mass at the bridge head, on the towpath side, which is what
   * the square is seen against from the road */
  grove.push({ x: 12.6, z: -28.6, y: ctx.groundAt(12.6, -28.6), scale: 1.5, seed: 9175, spread: 1.15 });
  shrubs.push({ x: 10.9, z: -30.9, y: Y, r: 0.44, count: 3, spread: 1.05, seed: 9176 });
  /* and one on the far bank, on the axis the square looks along: it is the
   * mid-ground that stops the house flank across the water reading as a card */
  shrubs.push({ x: 10.4, z: -26.4, y: ctx.groundAt(10.4, -26.4), r: 0.5, count: 4, spread: 1.3, seed: 9178 });
  shrubs.push({ x: -9.4, z: -64.4, y: Y, r: 0.46, count: 3, spread: 1.1, seed: 9177 });

  petals.push({ x: 8.9, z: -44.0, w: 2.4, d: 10.0, y: Y + 0.02, n: 70 });
  petals.push({ x: 8.9, z: -58.0, w: 2.4, d: 10.0, y: Y + 0.02, n: 70 });
  petals.push({ x: 9.4, z: -31.8, w: 3.4, d: 3.4, y: Y + 0.02, n: 45 });
  petals.push({ x: -3.4, z: -62.4, w: 2.2, d: 5.0, y: Y + 0.02, n: 45 });

  return { sakura, shrubs, grove, petals };
}

/* ------------------------------------------------------------------ *
 * こばと橋南詰 -- the bridge head.
 *
 * The one place on this street where you can stop.  Everything about it is
 * arranged round the fact that the towpath is 0.375 m below the pavement and
 * three metres away: the flight down to it is the reason the square exists, the
 * guardrail is what makes the drop legible from the road, and the bench faces
 * the water rather than the traffic.
 * ------------------------------------------------------------------ */

function buildBridgeHead(ctx, m, gm, sakura, shrubs, petals) {
  /* the square: 3.9 x 3.6, between the road's east footway and the house at
   * (14.4,-35.5), butting the kerb line at its north edge */
  /* 2.9 m wide and not 3.7.  The house at (14.4,-35.5) has its west frontage at
   * x = 10.80 and its north gable at z = -31.70, and the first draft's slab ran
   * 0.6 m into both -- paving inside a building, and the machine, the bed, the
   * planter and one guardrail with it.  The square is the piece of this district
   * whose own footprint most needed querying and is the one I did not query. */
  pad(ctx, {
    x: 9.15, z: -32.55, w: 2.9, d: 3.3, y: Y, h: 0.08,
    mat: gm.concrete, name: 'gakkomaeBridgeSquare',
  });
  // the paving joint that stops 10 m2 of concrete reading as one slab
  laneLine(ctx, { axis: 'x', at: -32.55, from: 7.8, to: 10.5, y: Y + 0.09, mat: m.concreteMid });

  /* ------------------------------- the flight -------------------------------
   * Three treads through the opening `canal.js` leaves in its retaining kerb.
   * `dir: -1` on the z axis means travel *up* runs toward -z, so the flight is
   * laid from the towpath and climbs to the square -- and every tread registers
   * a platform, which is what actually carries the player. */
  /* **The pocket has to be cut before the treads can be laid.**  `heightAt` takes
   * the max over platforms, so a flight laid on the bank was simply buried: the
   * natural grade between the square and the kerb is 1.02 and the highest tread
   * is 1.13, but the two lower ones are at 0.81 and 0.97 and the ground won.
   * Nothing threw and the treads rendered perfectly -- you just walked over the
   * top of them on flat ground, which is the same class of bug as the canal's
   * service path floating for twelve years.  `ctx.cut` is the only thing in this
   * world that can lower ground; platforms then raise it back, tread by tread. */
  ctx.cut({ x0: 8.15, x1: 10.45, z0: -30.9, z1: -29.9, top: BANK_Y + 0.005 });
  const RISE = (Y + 0.08 - BANK_Y) / 3;    // 0.158, to meet the square's slab exactly
  steps(ctx, {
    axis: 'z', dir: -1, n: 3, rise: RISE, run: 0.33, w: 2.2,
    x: 9.3, z: -29.9, y: BANK_Y, mat: m.stone,
  });
  /* a rail down the open side of it.  The other side is the kerb's return, so
   * it does not need one -- and a rail on both sides of a 2.2 m flight is what
   * a station has, not what a towpath has. */
  {
    const parts = [];
    for (let i = 0; i <= 3; i++) {
      parts.push({
        geometry: new THREE.CylinderGeometry(0.035, 0.035, 0.95, 7),
        matrix: trs(8.25, BANK_Y + i * RISE + 0.475, -29.9 - i * 0.33),
      });
    }
    parts.push({
      geometry: new THREE.CylinderGeometry(0.04, 0.04, 1.12, 8),
      matrix: trs(8.25, BANK_Y + 0.95 + 1.5 * RISE, -30.4, -Math.atan2(0.99, 3 * RISE), 0, 0),
    });
    const rail = new THREE.Mesh(bake(parts), m.metal);
    rail.castShadow = true;
    ctx.add(rail);
  }

  /* The guardrail along the square's canal edge, either side of the opening --
   * this is a 0.4 m drop onto a concrete towpath and the rail is what says so
   * from the pavement.  `makeGuardrail` runs along local X with its face on +z,
   * so `ry = PI` turns the face to the water. */
  /* **One rail, and it is west of the opening.**  The draft put a second at
   * x = 10.0, which reads well on the page and is 1.1 m of collider inflated by
   * the player's 0.34 m on each side -- so it reached to x 9.11 and closed the
   * middle of a 2.2 m flight down to 0.97 m of walkable ground with the centre
   * line inside it.  The flood fill found it in one scan; the frame showed a
   * perfectly good staircase.  East of the opening the edge is closed by the
   * kerb's own return and the house behind it, which is enough. */
  {
    // Run it with the road at the footway's outer edge.  The old east-west
    // placement spanned the whole pavement and read as a barrier across it.
    const gx = 7.3, gz = -31.6, len = 1.4;
    const gy = ctx.groundAt(gx, gz);
    ctx.add(makeGuardrail({ ctx, x: gx, z: gz, y: gy, len, ry: Math.PI / 2 }));
  }

  /* ------------------------------ the furniture ------------------------------ *
   * A machine, a bed and the board that tells you where the two
   * routes go.  The machine is this district's interaction and it is at the
   * bridge head for the same reason every machine in Japan is: it is where
   * people stop. */
  const gA = (x, z) => ctx.groundAt(x, z);
  addVending(ctx, {
    x: 10.00, z: -33.4, y: gA(10.00, -33.4), ry: -Math.PI / 2, variant: 2, seed: 57,
    label: '自動販売機  E  buy a drink',
  });
  ctx.add(makeVendBin({ x: 10.00, z: -34.4, y: gA(10.00, -34.4), ry: -Math.PI / 2 }));
  ctx.add(makeFlowerBed({ x: 10.15, z: -31.3, w: 0.9, d: 1.6, y: gA(10.15, -31.3), seed: 9111, n: 11 }));
  ctx.add(makePlanter({ x: 8.1, z: -31.5, y: gA(8.1, -31.5), r: 0.26, flower: true, seed: 9112, n: 5 }));
  ctx.add(makePlanter({ x: 7.95, z: -34.4, y: gA(7.95, -34.4), r: 0.22, flower: false, seed: 9113, n: 4 }));

  /* The direction board.  Two arms on one post -- the towpath one way and the
   * school the other -- which is the only piece of wayfinding in the district
   * and the reason the flight is findable at all. */
  ctx.add(makeSignPost({
    x: 8.05, z: -30.9, y: gA(8.05, -30.9), ry: -Math.PI / 2, h: 2.4, postMat: m.metal,
    plates: [
      { map: roadSignTex('tsugakuro'), w: 0.52, h: 0.52, y: 1.98, double: true },
      { map: warningPlate(2), w: 0.44, h: 0.58, y: 1.32, double: true },
    ],
  }));
  ctx.add(makeBicycle({ x: 8.5, z: -32.4, y: gA(8.5, -32.4), ry: 0, lean: 0.06, color: 0x4c6a86 }));
  ctx.add(makeLoosePaper(ctx, [{ x: 9.9, z: -31.9, y: Y + 0.1, ry: 0.8 }]) ?? new THREE.Group());

  /* ---------------------------- the west corner ----------------------------
   * 2.7 x 2.3 between the bridge's west parapet and the house, and it takes the
   * two things a bridge head on the other side of a road needs: the mirror for
   * the blind approach and the block's refuse point, which had nowhere to be. */
  ctx.add(makeMirror({ x: -2.6, z: -29.2, y: gA(-2.6, -29.2), ry: 0.5, h: 2.4, r: 0.42 }));
  refusePoint(ctx, {
    kind: 'bins', x: -3.6, z: -28.3, y: gA(-3.6, -28.3), ry: -Math.PI / 2, plate: 0,
  });
  ctx.add(makePlanter({ x: -2.3, z: -30.6, y: gA(-2.3, -30.6), r: 0.24, flower: true, seed: 9114, n: 5 }));
  shrubs.push({ x: -3.9, z: -30.4, y: gA(-3.9, -30.4), r: 0.4, count: 3, spread: 0.95, seed: 9115 });
  petals.push({ x: -3.0, z: -29.4, w: 2.4, d: 2.6, y: gA(-3.0, -29.4) + 0.02, n: 35 });
}

/* ------------------------------------------------------------------ *
 * The school verge -- 24 m of 2.77 m between the footway and the wall.
 *
 * `approach.js` already put the SCHOOL ZONE board, the 徐行 plate and the
 * painted crossing here, and `school.js` the wall, the gate and its piers.
 * What was missing is everything that says several hundred children arrive
 * along this pavement: the bicycle park, the boards, the beds and the run of
 * signs.  None of it is more than 1.4 m tall except the shelters, so the wall
 * and the gate still read from the road.
 * ------------------------------------------------------------------ */

function buildSchoolVerge(ctx, m, gm, rng, shrubs, petals) {
  const gA = (x, z) => ctx.groundAt(x, z);
  const VX = 9.1;                        // the verge's centre line

  /* the surface: worn asphalt over the whole run, laid to the wall, with the
   * paving joints that stop it being one field */
  pad(ctx, {
    x: 9.08, z: -52.8, w: 2.76, d: 23.6, y: Y, h: 0.07,
    mat: gm.asphaltWorn, name: 'gakkomaeSchoolVerge',
  });
  for (const z of [-44.4, -50.2, -56.0, -61.8]) {
    laneLine(ctx, { axis: 'x', at: z, from: 7.75, to: 10.4, y: Y + 0.08, mat: m.concreteMid });
  }
  /* the channel down the wall side and its two gullies -- a school frontage is
   * the one place a verge really does drain, because the whole of it is paved */
  laneGutter(ctx, {
    axis: 'z', at: 10.18, from: -63.8, to: -41.6, y: Y, pitch: 0.9,
    manholes: [-45.6, -60.2], manholeOff: -0.55,
  });

  /* --------------------------- the bicycle park ---------------------------
   * Two shelters and four racks, south of the gate so nothing stands across
   * the opening.  The bikes are nose-in to the wall: a bicycle is 1.73 m long,
   * so what has to clear the render is half a wheelbase (~0.87 m) and not half
   * a handlebar -- the rack sits at x 9.55 and the front wheels stop 0.05 m
   * short of the wall face.  That fills the verge, and it is meant to: the
   * road's own 1.55 m footway is the route past it. */
  for (const sz of [-56.4, -61.4]) {
    ctx.add(makeBikeShelter({ ctx, x: 9.35, z: sz, y: Y + 0.07, ry: Math.PI / 2, w: 4.6, d: 2.1, h: 2.15 }));
  }
  for (const rz of [-54.9, -57.9, -60.0, -62.9]) {
    ctx.add(makeBikeRack({ x: 9.55, z: rz, y: Y + 0.07, n: 4, spacing: 0.58, ry: Math.PI / 2, seed: 220 + Math.round(-rz) }));
  }
  /* one out of line and one down, which is what a full rack looks like at four
   * in the afternoon and is worth more than a fifth tidy row */
  ctx.add(makeBicycle({ x: 8.6, z: -52.9, y: gA(8.6, -52.9), ry: Math.PI / 2 + 0.22, lean: 0.09, color: 0x8f6fb5 }));
  ctx.add(makeKidBike({ x: 8.5, z: -63.9, y: gA(8.5, -63.9), ry: 1.4, lean: 0.36 }));

  /* ------------------------------ the boards ------------------------------
   * The association board and the school's own, on the two lengths of verge the
   * bicycles do not take: north of the gate and right at the corner. */
  {
    const nb = makeNoticeBoard({ ctx,
      x: 9.5, z: -43.4, y: gA(9.5, -43.4), ry: -Math.PI / 2, w: 1.9, h: 1.2, y0: 0.9, wood: 0x8a6f52,
      sheets: [
        { map: hallNotice(0), x: -0.56, y: 0.02, w: 0.42, h: 0.58, tilt: 0.02 },
        { map: hallNotice(1), x: 0.0, y: -0.02, w: 0.42, h: 0.58, tilt: -0.014 },
        { map: hallNotice(2), x: 0.58, w: 0.42, h: 0.58 },
      ],
    });
    ctx.add(nb);
  }
  {
    const nb = makeNoticeBoard({ ctx,
      x: 9.85, z: -65.0, y: gA(9.85, -65.0), ry: -Math.PI / 2, w: 1.3, h: 0.9, y0: 0.95, wood: 0x7d6146,
      sheets: [{ map: hallNotice(2), x: 0, w: 0.4, h: 0.55, tilt: 0.016 }],
    });
    ctx.add(nb);
  }

  /* ------------------------------- the signs -------------------------------
   * Three more 通学路 plates down the run, and the mirror on the gate corner.
   * `roadSignTex` is 320 x 320, so the plate is square -- a decal whose aspect
   * does not match its face renders as a smear rather than as an error. */
  for (const [sz, h] of [[-46.6, 2.2], [-58.8, 2.1], [-64.2, 2.2]]) {
    ctx.add(makeSignPost({
      x: 7.95, z: sz, y: gA(7.95, sz), ry: -Math.PI / 2, h, postMat: m.metal,
      plates: [{ map: roadSignTex('tsugakuro'), w: 0.5, h: 0.5, y: h - 0.34, double: true }],
    }));
  }
  ctx.add(makeMirror({ x: 8.0, z: GATE_Z + 3.9, y: gA(8.0, GATE_Z + 3.9), ry: -2.6, h: 2.5, r: 0.44 }));

  /* -------------------------------- planting -------------------------------- */
  ctx.add(makeFlowerBed({ x: 9.9, z: -41.9, w: 0.9, d: 2.0, y: gA(9.9, -41.9), seed: 9121, n: 12 }));
  /* **Not on the gate apron.**  It was at (8.6, -47.8), which puts 2.4 m of
   * raised bed in the middle of the 3.6 m approach paving, half a metre off the
   * gate's own axis -- so from the street the school's entrance is a flower bed
   * with a gateway behind it.  South of the gate, hard against the wall between
   * the piers and the shelters, it is planting on a verge instead of an obstacle
   * in a doorway. */
  ctx.add(makeFlowerBed({ x: 9.7, z: -53.9, w: 0.9, d: 1.8, y: gA(9.7, -53.9), seed: 9122, n: 14 }));
  ctx.add(makeBench({ x: 8.4, z: -42.2, y: gA(8.4, -42.2), ry: Math.PI / 2, len: 1.6 }));
  ctx.add(makeUmbrellaStand({ x: 9.9, z: -45.0, y: gA(9.9, -45.0), ry: -Math.PI / 2, seed: 9123, n: 5 }));
  ctx.add(makeCrates({ x: 10.0, z: -51.4, y: gA(10.0, -51.4), n: 2, seed: 9124, ry: -0.2 }));
  ctx.add(makeLoosePaper(ctx, [
    { x: 8.8, z: -50.6, y: Y + 0.09, ry: 0.6 },
    { x: 9.2, z: -59.4, y: Y + 0.09, ry: -1.0 },
  ]) ?? new THREE.Group());
  shrubs.push({ x: 8.9, z: -39.9, y: gA(8.9, -39.9), r: 0.42, count: 3, spread: 1.0, seed: 9125 });
}

/* ------------------------------------------------------------------ *
 * 文具・書籍 ひばり堂 -- the stationery shop, on the last road frontage.
 *
 * 3.6 m of frontage and 4.8 m deep on P4, fifteen metres from the school gate,
 * which is where a school stationer is.  It gets its **own** fascia and not
 * ほしの's: さくら坂 already has a 文具とゲーム, and putting the same shop on two
 * streets four hundred metres apart is the copy-paste this round exists to
 * avoid.  `SHOPS` is append-only, so `bungu` and `ringyo` go on the end.  It is the only shop in the world with
 * a *gachapon* outside it that is not on さくら坂, and that is the whole beat:
 * the last thing on the walk home before the gate.
 * ------------------------------------------------------------------ */

function buildBungu(ctx, m, gm, rng, shrubs, petals) {
  const p = plotBox(BUNGU);
  makeShop(ctx, {
    ...BUNGU, y: Y, kind: 'bungu', floors: 2, seed: 9131,
    awning: 2, awningOut: 1.1, shutter: 0, wall: 2, blade: false, lit: true,
  });

  /* the forecourt: 1.3 m between the frontage and the footway, which is the
   * whole of it, so nothing here is more than 0.55 m deep */
  const [ax, az] = p.at(0, p.halfD + 0.65);
  pad(ctx, {
    x: ax, z: az, w: 1.3, d: BUNGU.w + 0.4, y: Y, h: 0.09,
    mat: gm.concrete, name: 'gakkomaeBunguApron',
  });
  const gA = (x, z) => ctx.groundAt(x, z);
  const [gx, gz] = p.at(-1.15, p.halfD + 0.42);
  ctx.add(makeGachapon({ x: gx, z: gz, y: gA(gx, gz), ry: p.outRy, n: 3 }));
  const [ux, uz] = p.at(1.25, p.halfD + 0.3);
  ctx.add(makeUmbrellaStand({ x: ux, z: uz, y: gA(ux, uz), ry: p.outRy, seed: 9132, n: 6 }));
  const [dx, dz] = p.at(0.15, p.halfD + 0.18);
  ctx.add(makeDoormat({ x: dx, z: dz, y: gA(dx, dz), ry: p.outRy }));
  const [bx, bz] = p.at(-1.5, p.halfD + 0.55);
  ctx.add(makeMenuBoard({ x: bx, z: bz, y: gA(bx, bz), ry: p.outRy + 0.25 }));
  ctx.add(makeShopFlag({ ctx, x: p.x1 + 0.12, z: BUNGU.z - 1.45, y: Y, ry: p.outRy, variant: 1 }));
  /* the bike rack, on the footway side of the apron and running *along* the
   * frontage so the machines lie parallel to it */
  const [rx, rz] = p.at(-2.35, p.halfD + 0.85);
  ctx.add(makeBikeRack({ x: rx, z: rz, y: gA(rx, rz) + 0.04, n: 3, spacing: 0.58, ry: p.outRy + Math.PI / 2, seed: 231 }));
  ctx.add(makeAircon({
    x: BUNGU.x, z: p.z0 - 0.24, y: Y + 3.05, ry: Math.PI, w: 0.8, h: 0.56, feet: false,
  }));
  ctx.add(makeGasMeter({ x: p.x1 + 0.16, z: BUNGU.z + 1.4, y: gA(p.x1 + 0.16, BUNGU.z + 1.4), ry: Math.PI / 2 }));

  /* ------------------------------- the back yard -------------------------------
   * P4's western 3.6 m, which is landlocked behind the shop -- こむぎ closes it
   * to the north and there is 0.35 m to the road at the south, so it is not a
   * route and is not dressed as one.  It is where the stock goes. */
  pad(ctx, {
    x: -9.5, z: -62.8, w: 3.2, d: 3.4, y: Y, h: 0.05,
    mat: gm.gravel, name: 'gakkomaeBunguYard',
  });
  ctx.add(makeCrates({ x: -8.5, z: -61.6, y: Y + 0.05, n: 4, seed: 9133, ry: 0.14 }));
  ctx.add(makeMilkCrate({ x: -9.4, z: -61.5, y: Y + 0.05, n: 3, ry: -0.3 }));
  {
    const sh = makeStorageShed({ x: -10.6, z: -62.8, y: Y + 0.05, ry: Math.PI / 2, w: 1.5, d: 0.85, h: 1.8 });
    ctx.add(sh);
    ctx.collide(-11.05, -63.55, -10.15, -62.05, Y + 1.85);
  }
  ctx.add(makeBicycle({ x: -8.3, z: -63.6, y: Y + 0.05, ry: Math.PI / 2, lean: 0.06, color: 0x6a7d5c }));
  ctx.add(makeBucket({ x: -9.9, z: -64.1, y: Y + 0.05, ry: 0.7 }));
  ctx.add(makeIvy({ x: -7.84, z: -62.4, y: Y, ry: -Math.PI / 2, len: 2.2, top: 1.7, drop: 0.9, seed: 9134 }));
  /* a 板塀 across the south, so the yard reads as private from the road's end
   * rather than as a gap between the shop and the field */
  plotWall(ctx, {
    x0: -11.3, x1: -7.8, z0: -64.6, z1: -64.35, sides: ['z-'], kind: 'timber',
    h: 0.24, fenceH: 1.3, y: Y, seed: 9135,
  });
}

/* ------------------------------------------------------------------ *
 * ひばり輪業 -- the bicycle shop, on 五丁目's lane.
 *
 * It is not on the 通学路 because there is nowhere on the 通学路 for it, and
 * that turns out to be right anyway: a bike shop is a workshop, it wants a yard
 * and a lane rather than a shop window on a school route, and this one sits at
 * the south end of 五丁目's lane where its turning stub already is.  Twenty
 * metres from the school gate as the child walks, through the 抜け道.
 * ------------------------------------------------------------------ */

function buildRingyo(ctx, m, gm, shrubs) {
  const p = plotBox(RINGYO);
  makeShop(ctx, {
    ...RINGYO, y: Y, kind: 'ringyo', floors: 1, h1: 3.4, seed: 9141,
    awning: 0, awningOut: 1.4, shutter: 0.22, wall: 4, blade: false, roofKind: 'flat',
  });

  /* The apron.  A bicycle shop's whole frontage is the machines standing on it,
   * so it is 1.3 m of concrete with the row *along* the shop rather than nose
   * in -- eight bicycles at 0.55 m wide is 4.4 m and the frontage is 5.4. */
  pad(ctx, {
    x: p.x0 - 0.65, z: RINGYO.z, w: 1.3, d: RINGYO.w + 0.4, y: Y, h: 0.08,
    mat: gm.concrete, name: 'gakkomaeRingyoApron',
  });
  const gA = (x, z) => ctx.groundAt(x, z);
  ctx.add(makeBikeRack({ x: p.x0 - 0.72, z: RINGYO.z - 0.9, y: Y + 0.08, n: 4, spacing: 0.58, ry: -Math.PI / 2, seed: 232 }));
  ctx.add(makeBicycle({ x: p.x0 - 0.62, z: RINGYO.z + 1.6, y: Y + 0.08, ry: Math.PI / 2, lean: 0.07, color: 0x9c5a4a }));
  ctx.add(makeBicycle({ x: p.x0 - 0.62, z: RINGYO.z + 2.3, y: Y + 0.08, ry: Math.PI / 2 + 0.1, lean: 0.05, color: 0x4c6a86 }));
  ctx.add(makeKidBike({ x: p.x0 - 1.05, z: RINGYO.z + 2.7, y: Y + 0.08, ry: 1.7, lean: 0.3 }));
  const [dx, dz] = p.at(0.4, p.halfD + 0.2);
  ctx.add(makeDoormat({ x: dx, z: dz, y: gA(dx, dz), ry: p.outRy }));
  ctx.add(makeMenuBoard({ x: p.x0 - 0.5, z: RINGYO.z - 2.2, y: gA(p.x0 - 0.5, RINGYO.z - 2.2), ry: p.outRy + 0.2 }));
  ctx.add(makeCrates({ x: p.x0 - 0.55, z: p.z1 - 0.5, y: gA(p.x0 - 0.55, p.z1 - 0.5), n: 3, seed: 9142, ry: 0.2 }));

  /* the workshop's own side: the compressor, the meters, the drum of parts and
   * the frames waiting for somebody to collect them */
  ctx.add(makeAircon({ x: p.x1 + 0.24, z: RINGYO.z - 1.4, y: gA(p.x1 + 0.24, RINGYO.z - 1.4), ry: Math.PI / 2, w: 0.78, h: 0.56 }));
  ctx.add(makeGasMeter({ x: p.x1 + 0.16, z: RINGYO.z + 1.2, y: gA(p.x1 + 0.16, RINGYO.z + 1.2), ry: Math.PI / 2 }));
  ctx.add(makeWaterMeter({ x: p.x1 + 0.9, z: RINGYO.z + 2.0, y: gA(p.x1 + 0.9, RINGYO.z + 2.0), ry: Math.PI / 2 }));
  ctx.add(makeMilkCrate({ x: p.x1 + 0.6, z: p.z0 + 0.7, y: gA(p.x1 + 0.6, p.z0 + 0.7), n: 3, ry: -0.35 }));
  ctx.add(makeBucket({ x: p.x1 + 0.5, z: RINGYO.z - 0.4, y: gA(p.x1 + 0.5, RINGYO.z - 0.4), ry: 0.9 }));
  ctx.add(makeBroom({ x: p.x0 - 0.16, z: p.z0 + 0.6, y: gA(p.x0 - 0.16, p.z0 + 0.6), tilt: -0.06, roll: 0.2, ry: 1.6 }));
  ctx.add(makeCatBox({ x: p.x1 + 0.5, z: p.z1 - 0.9, y: gA(p.x1 + 0.5, p.z1 - 0.9), ry: 1.0 }));
  shrubs.push({ x: p.x1 + 1.1, z: RINGYO.z + 0.2, y: Y, r: 0.42, count: 3, spread: 1.0, seed: 9143 });
}

/* ------------------------------------------------------------------ *
 * The street itself.
 *
 * The rest of the brief, and most of its length: the drainage, the covers, the
 * bins, the posters, the umbrella stands, the crates and the parked bicycles
 * that a road has when people live on it.  All of it on the verges -- the
 * carriageway carries the opening composition of the whole project (`hill`,
 * pos [1.5, 0, -22] looks straight up it) and nothing new stands in it.
 * ------------------------------------------------------------------ */

function buildStreetFurniture(ctx, m, gm, rng, petals) {
  const gA = (x, z) => ctx.groundAt(x, z);

  /* ---------------------------- the west gutter ----------------------------
   * Down the back of the west footway, which is where the run-off from six
   * frontages goes.  Broken at the 送迎 bay and the cross link, because a
   * channel across a vehicle crossing is a different detail and the district
   * does not have it. */
  for (const [z0, z1, mh] of [[-37.6, -30.4, [-34.0]], [-52.4, -43.6, [-45.4, -50.8]], [-64.2, -55.4, [-58.2, -62.4]]]) {
    laneGutter(ctx, {
      axis: 'z', at: W_WALK - 0.22, from: z0, to: z1, y: Y, pitch: 0.9,
      manholes: mh, manholeOff: 0.5,
    });
  }
  /* two square patches in the carriageway edge where the main was dug up, which
   * is the one thing allowed on the asphalt itself because it is flat paint */
  for (const [px, pz, pw, pd] of [[0.6, -47.0, 1.6, 2.0], [5.2, -57.6, 1.4, 1.8]]) {
    const g = new THREE.PlaneGeometry(pw, pd);
    g.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(g, gm.asphaltWorn);
    mesh.position.set(px, Y + 0.018, pz);
    mesh.receiveShadow = true;
    mesh.userData.noOutline = true;
    ctx.add(mesh);
  }

  /* ------------------------ ひばりマート's frontage ------------------------
   * The apron in front of the convenience store is 9.1 x 5.4 and had nothing on
   * it but its own three props.  What a conbini car park has is the machines
   * against the wall, the bin bank, the crates the delivery left and the two
   * bicycles somebody leaned on the railing -- all of it against the *edges*, so
   * the middle stays open, which is what makes it read as a car park. */
  ctx.add(makeRecycleBox({ x: -2.5, z: -44.6, y: gA(-2.5, -44.6), ry: Math.PI / 2 }));
  ctx.add(makeVendBin({ x: -2.5, z: -45.9, y: gA(-2.5, -45.9), ry: Math.PI / 2 }));
  ctx.add(makeCrates({ x: -7.2, z: -51.6, y: gA(-7.2, -51.6), n: 3, seed: 9151, ry: 0.16 }));
  ctx.add(makeMilkCrate({ x: -6.4, z: -52.1, y: gA(-6.4, -52.1), n: 3, ry: -0.4 }));
  ctx.add(makeBicycle({ x: -2.35, z: -48.4, y: gA(-2.35, -48.4), ry: 0, lean: 0.07, color: 0x6a5f70 }));
  ctx.add(makeBicycle({ x: -2.35, z: -49.6, y: gA(-2.35, -49.6), ry: 0.06, lean: 0.05, color: 0xb5764a }));
  ctx.add(makeUmbrellaStand({ x: -7.3, z: -43.9, y: gA(-7.3, -43.9), ry: Math.PI / 2, seed: 9152, n: 4 }));
  ctx.add(makeLoosePaper(ctx, [{ x: -4.6, z: -46.8, y: Y + 0.01, ry: -0.5 }]) ?? new THREE.Group());
  /* the wheel stops that make an apron a car park, along its west edge */
  for (const wz of [-45.4, -47.8, -50.2]) {
    laneLine(ctx, { axis: 'z', at: -2.9, from: wz - 1.0, to: wz + 1.0, y: Y + 0.02 });
  }

  /* ------------------------- パン工房こむぎ's frontage -------------------------
   * 3.25 m, so a shallow one: the bread crates, the flag, a bench and the two
   * bicycles that are always outside a bakery at eight in the morning.  This is
   * the brief's 面包店 and it has been on this street since the school went in;
   * what it did not have is a frontage. */
  ctx.add(makeShopFlag({ ctx, x: -4.82, z: -56.4, y: Y, ry: Math.PI / 2, variant: 0 }));
  ctx.add(makeCrates({ x: -4.5, z: -59.6, y: gA(-4.5, -59.6), n: 3, seed: 9153, ry: -0.12 }));
  ctx.add(makeBench({ x: -2.6, z: -58.4, y: gA(-2.6, -58.4), ry: -Math.PI / 2, len: 1.5 }));
  ctx.add(makePlanter({ x: -4.6, z: -55.6, y: gA(-4.6, -55.6), r: 0.26, flower: true, seed: 9154, n: 5 }));
  ctx.add(makePotShelf({ x: -4.72, z: -57.6, y: gA(-4.72, -57.6), ry: Math.PI / 2, seed: 9155, w: 1.0 }));
  ctx.add(makeBicycle({ x: -2.4, z: -56.2, y: gA(-2.4, -56.2), ry: 0, lean: 0.06, color: 0x8f6fb5 }));
  ctx.add(makeDoormat({ x: -4.78, z: -57.0, y: gA(-4.78, -57.0), ry: Math.PI / 2 }));

  /* ------------------------- the west verge, north half -------------------------
   * Between the bridge head and the 送迎 bay: the house at (-5.4,-33.5) turns
   * its flank to the street here, which is 7.6 m of blank wall and the longest
   * dead frontage on the road.  Ivy, a pot shelf, the meters and a poster board
   * are what a wall like that actually carries. */
  /* **Everything on this wall stands at x > -1.40, and four of the five did not.**
   *
   * The house is x -9.40..-1.40, so its east face -- the one this street sees --
   * is at -1.40 and *outward is +x*.  The ivy went in at -1.34, correctly, and
   * then the pot shelf, the water meter, the notice board and the cat box all
   * went in at -1.44, -1.50, -1.55 and -1.60, which is the wrong side: a 0.34 m
   * shelf centred on -1.50 is half inside the render, and the notice board was
   * entirely inside it along with the collider that was supposed to keep people
   * off it.  The tell from the street is three terracotta pots with no backs.
   *
   * There is 1.15 m of footway between the house's collider (-1.30) and the kerb
   * (-0.15), so everything here has to sit inside that band and be *shallow*. */
  ctx.add(makeIvy({ x: -1.34, z: -33.4, y: Y, ry: Math.PI / 2, len: 3.6, top: 2.1, drop: 1.0, seed: 9156 }));
  ctx.add(makePotShelf({ x: -1.21, z: -36.0, y: gA(-1.21, -36.0), ry: Math.PI / 2, seed: 9157, w: 1.1 }));
  ctx.add(makeWaterMeter({ x: -1.33, z: -31.4, y: gA(-1.33, -31.4), ry: Math.PI / 2 }));
  {
    /* No collider on the board: it is 0.15 m of timber bolted flat to a wall the
     * house's own collider already blocks to -0.96, and a second box in front of
     * it would take the walkable footway down to 0.71 m. */
    const nb = makeNoticeBoard({ ctx,
      x: -1.31, z: -34.9, y: gA(-1.31, -34.9), ry: Math.PI / 2, w: 1.2, h: 0.82, y0: 0.98, wood: 0x7d6146,
      sheets: [{ map: hallNotice(0), x: 0, w: 0.38, h: 0.52, tilt: -0.014 }],
    });
    ctx.add(nb);
  }
  ctx.add(makeCatBox({ x: -1.22, z: -37.0, y: gA(-1.22, -37.0), ry: Math.PI / 2 }));

  petals.push({ x: -2.2, z: -34.0, w: 1.8, d: 7.0, y: Y + 0.02, n: 45 });
  petals.push({ x: -3.0, z: -48.0, w: 2.6, d: 8.0, y: Y + 0.02, n: 55 });
}
