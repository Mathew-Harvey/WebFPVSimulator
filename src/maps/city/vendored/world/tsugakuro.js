import * as THREE from 'three';
import { PAL } from '../core/palette.js';
import { cel, flat } from '../core/toon.js';
import { warningPlate, hallNotice, roadSignTex } from '../core/textures.js';
import { box, cyl, bake, trs, rngKit } from '../core/util.js';
import { hullOutline } from '../core/outline.js';
import { groundY, centerX, ROAD_HALF, WALK_W } from './street.js';
import { pad, lane, laneLine, meshFence, groundMats } from './ground.js';
import {
  plotBox, plotCollide, plotWall, hedgeRun, stepStones, refusePoint, dressPlot,
  laneGutter, bollardRow, laneSign, poleRun,
} from './plots.js';
import { makeHouse } from './buildings.js';
import { makeWalkup, makeAtticHouse, makeTerrace, makeCarport, makeBikeShelter } from './housing.js';
import {
  makeBench, makeBikeRack, makeBicycle, makeNoticeBoard, makePlanter, makeFlowerBed,
  makeMailboxBank, makeSignPost, makeMirror, makeTapPost, makeStorageShed, makeBucket,
  makeBroom, makeCrates, makeMilkCrate, makeIvy, makeLaundryPole, makeAircon,
  makeLoosePaper, makeCone, makeDoormat, makeVendBin, makeDeliveryBox, makeUmbrellaStand,
  makePotShelf, makeCatBox, makeRecycleBox,
} from './props.js';
import {
  makeWheelStops, makeKitchenGarden, makeKidBike, makeDryingRack, makeGasMeter,
  makeBallBox, makeChalkMarks, makeLockerBank,
} from './streetprops.js';

/* ------------------------------------------------------------------ *
 * ひばり台五丁目 -- the houses behind the 通学路.
 *
 * The school route has had two shops on it since the school went in and nothing
 * else: everything west of the carriageway was bare graded ground running out
 * over the horizon, which is exactly the emptiness `approach.js` says the
 * convenience store was put there to fix.  Two buildings cannot fix thirty
 * metres of it, and this is the block that does.
 *
 * The whole idea is that it is the *school's* neighbourhood and reads as one
 * without a single person in it: a staff block, three family houses with
 * gardens deep enough to leave things in, a drop-off bay at the mouth of the
 * link, chalk on a garage apron, a ball box, a kid's bicycle on its side, a
 * notice board with the term's dates on it -- and a 抜け道 between the
 * convenience store and the bakery that comes out on the crossing at the gate,
 * which is the route every child in this town would actually take.
 *
 * ------------------------------------------------------------------ *
 * THE LAND, measured.  The parcel is x -32..-2, z -64..-30, and it is dead
 * flat: `streetHeight + reliefAt` is 1.05 over the whole of it (the school's
 * own graded pad covers x 4..60 and this block's pad, added with the six, runs
 * x -28..2 / z -62..-34).  What is already in it:
 *
 *   the 通学路              carriageway x -0.15..6.15 with its west footway to
 *                           x -1.70, its green belt and its guardrail, running
 *                           to a dead end at z = -65 (`approach.js`, `street.js`)
 *   the canal's south bank  a kerb at z -30.20..-29.84, top 1.27.  The lane's
 *                           north end arrives on the service path behind it.
 *   house at (-15.2,-34.6)  x -19.00..-11.40, z -38.20..-31.00
 *   house at (-5.4,-33.5)   x -9.50..-1.30, z -37.30..-29.70
 *   ひばりマート            x -15.25..-8.00, z -52.55..-43.45, facing 'x+'
 *   パン工房こむぎ          x -11.45..-4.95, z -60.55..-55.05, facing 'x+'
 *   grove trees             (-18,-41), (-19.4,-55), (-15,-62), (-22.6,-33.8)
 *   the pole line           x -2.5 at z -43 and -60.5, x 7.4 at z -37.5 / -53.5
 *
 * ------------------------------------------------------------------ *
 * WHAT THE ARITHMETIC DECIDED
 *
 * **The lane is at x = -21.8 and not -19.** -19 is where it wants to be -- one
 * plot back from the road -- and it is where the house at (-15.2,-34.6) has its
 * west wall.  -21.8 with a 3.2 m carriageway puts the east kerb at -20.2, which
 * clears that house by 1.2 m and the grove tree at (-19.4,-55) by 1.34.  It
 * does *not* clear the tree at (-22.6,-33.8), whose collider is x -23.33..-21.87
 * -- squarely in the carriageway -- so that one moves west, and it is recorded
 * with the other nudges to existing content.  It has been moved once before, out
 * of the roof of the house on the canal's north bank.
 *
 * **The 抜け道 is 2.0 m because that is all there is.**  ひばりマート's south
 * wall is at z -52.55 and こむぎ's north wall at -55.05: 2.5 m, which after the
 * player's 0.34 m radius on each side is 1.82 m of walkable ground.  It is the
 * tightest deliberate route in the block and it is the best thing in it -- you
 * come out of it onto the painted crossing at the school gate.
 *
 * **The staff block's stair decided its z.**  `makeWalkup` builds its open stair
 * 1.6 m beyond the local -x end, and for `face: 'x+'` local -x is world +z, so
 * the stair stands at the block's *north* end.  At z = -35.0 it would have come
 * down on the canal's bank kerb; -36.6 puts it clear with the forecourt still
 * addressing the lane.
 *
 * FLOODFILL -- every one of these must be reachable on foot from the spawn:
 *   laneN      [-21.8, -31.4]  the north end, on the canal's south service path
 *   laneMid    [-21.8, -45.0]  outside the 二階半, opposite the shops' backs
 *   laneS      [-21.8, -62.0]  the south end and its turning stub
 *   staffFront [-24.0, -36.6]  グリーンハイツ's gallery and its mailbox bank
 *   atticGate  [-24.6, -45.6]  the 二階半's gate on the lane
 *   houseGate  [-24.9, -53.4]  the detached house's gate
 *   terraceA   [-24.8, -59.6]  the 連棟's west front garden
 *   linkA      [-12.0, -41.4]  the cross link, between the two old houses
 *   dropOff    [-3.2, -39.2]   the 送迎 bay at the link's mouth on the road.
 *                              Was [-5.2, -39.0], the middle of the bay; a
 *                              minivan is parked across it now (`traffic.js`),
 *                              so the probe moved to the clear east end of it.
 *   nukemichi  [-13.0, -53.8]  the 抜け道 between the shops
 *   nukeEast   [-3.4, -53.8]   where it comes out on the school route
 *   service    [-17.8, -47.0]  ひばりマート's back yard, off the lane
 * ------------------------------------------------------------------ */

/* ------------------------------ the streets ------------------------------ */
const LN_X = -21.8;
const LN_W = 3.2;                       // carriageway x -23.40..-20.20
const LN_Z0 = -63.2;
const LN_Z1 = -30.6;
const LN_E = LN_X + LN_W / 2;           // -20.20
const LN_WK = LN_X - LN_W / 2;          // -23.40

const LK_Z = -41.4;                     // the cross link out to the road
const LK_W = 2.6;
const NK_Z = -53.8;                     // the 抜け道 between the two shops
const NK_W = 2.0;

const Y = 1.05;                         // flat over the whole parcel

/* ------------------------------- the plots -------------------------------
 * All four face 'x+', which is both the lane and the *shaded* side -- the sun
 * is at (-52, 62, 56), so an +x frontage here is lit by the cool bounce and the
 * roofs carry the warmth.  That is the opposite of every other new block and it
 * is deliberate: this row is seen from the school route looking west, i.e. with
 * the sun behind it, and a row of frontages in shade under lit roofs against a
 * bright sky is what makes a hillside of houses read as far away. */
const STAFF = { x: -28.0, z: -36.6, w: 7.2, d: 6.4, face: 'x+' };   // x -31.2..-24.8, z -40.2..-33.0
const ATTIC = { x: -28.4, z: -45.6, w: 6.4, d: 6.0, face: 'x+' };   // x -31.4..-25.4, z -48.8..-42.4
/* `makeHouse` is the one generator in the world whose `w` runs in *world* x and
 * `d` in world z whatever `face` is -- `index.js` builds its collider that way
 * and every one of the twenty-five houses depends on it.  So this one is not a
 * `plotBox` plot and its numbers are already in world axes. */
const HOUSE = { x: -28.6, z: -53.4, w: 6.2, d: 5.6, face: 'x+' };   // x -31.7..-25.5, z -56.2..-50.6
const TERR = { x: -28.4, z: -60.4, units: 2, unitW: 2.9, d: 6.0, face: 'x+' }; // x -31.4..-25.4, z -63.3..-57.5

/* the 送迎 bay, at the link's mouth on the school route */
const DROP = { x: -5.2, z: -39.2, w: 5.0, d: 2.6 };

const M = {};
function mats() {
  if (M.concrete) return M;
  M.concrete = cel({ color: PAL.concrete, bands: 3, tint: 0x6f6790 });
  M.concreteMid = cel({ color: PAL.concreteMid, bands: 3, tint: 0x6a6288 });
  M.metal = cel({ color: PAL.metal, bands: 3, tint: 0x666090 });
  M.metalDark = cel({ color: PAL.metalDark, bands: 3, tint: 0x5c5680 });
  M.drain = cel({ color: PAL.drain, bands: 3, tint: 0x5d5878 });
  M.wood = cel({ color: 0x9c7f5e, bands: 3, tint: 0x5c5680 });
  M.woodDark = cel({ color: 0x74563f, bands: 3, tint: 0x554e74 });
  return M;
}

export function buildTsugakuro(ctx) {
  const m = mats();
  const gm = groundMats();
  const rng = rngKit(8700);
  const sakura = [];
  const shrubs = [];
  const grove = [];
  const petals = [];

  buildLane(ctx, m, gm);
  buildLinks(ctx, m, gm, shrubs);
  buildStaffBlock(ctx, m, gm, shrubs);
  buildHouses(ctx, m, gm, rng, shrubs, petals);
  buildServiceStrip(ctx, m, gm);

  /* ---------------------------- poles and cabling ----------------------------
   * Down the lane's west verge, where the plots are, because the east side is
   * the shops' backs and their delivery bay wants the ground clear.  One lamp at
   * the junction with the cross link, which is the only decision on the lane. */
  poleRun(ctx, {
    defs: [
      { x: -24.1, z: -33.4, y: Y, h: 8.4, seed: 8761, armDir: 1, ry: Math.PI / 2 },
      { x: -24.1, z: -41.6, y: Y, h: 8.6, seed: 8762, armDir: 1, ry: Math.PI / 2, lamp: true },
      { x: -24.1, z: -50.2, y: Y, h: 8.4, seed: 8763, armDir: 1, ry: Math.PI / 2 },
      { x: -24.2, z: -58.8, y: Y, h: 8.6, seed: 8764, armDir: 1, ry: Math.PI / 2, lamp: true },
    ],
    chains: [[0, 1], [1, 2], [2, 3]],
    drops: [[0, [-25.4, Y + 5.6, -35.6]], [3, [-25.6, Y + 4.2, -60.2]]],
    offsets: [[0, -0.42], [-0.4, 0.28]],
  });

  /* -------------------------------- planting --------------------------------
   * The row's own trees are on the west verge; the mass goes *behind* the
   * houses, at x -33, because from the school route looking west this block's
   * roof line is the last thing before the horizon.  Nothing at x < -34: the
   * ground starts to lift there and a tree seated from this block's flat Y
   * would be buried in it. */
  sakura.push({ x: -24.2, z: -37.8, y: Y, scale: 1.16, seed: 8771, lean: 0.1, leanDir: 4.5 });
  sakura.push({ x: -24.3, z: -55.0, y: Y, scale: 1.22, seed: 8772, lean: 0.11, leanDir: 1.6 });
  sakura.push({ x: -19.6, z: -63.4, y: Y, scale: 1.08, seed: 8773, lean: 0.09, leanDir: 3.0 });
  grove.push({ x: -33.4, z: -38.6, y: ctx.groundAt(-33.4, -38.6), scale: 1.55, seed: 8774, spread: 1.15 });
  grove.push({ x: -33.8, z: -48.0, y: ctx.groundAt(-33.8, -48.0), scale: 1.45, seed: 8775, spread: 1.1 });
  grove.push({ x: -33.2, z: -57.6, y: ctx.groundAt(-33.2, -57.6), scale: 1.6, seed: 8776, spread: 1.2 });
  grove.push({ x: -25.0, z: -64.8, y: ctx.groundAt(-25.0, -64.8), scale: 1.4, seed: 8777, spread: 1.1 });
  shrubs.push({ x: -32.6, z: -43.4, y: Y, r: 0.5, count: 4, spread: 1.3, seed: 8778 });
  shrubs.push({ x: -32.8, z: -53.0, y: Y, r: 0.46, count: 3, spread: 1.15, seed: 8779 });

  petals.push({ x: LN_X, z: -38.4, w: 3.0, d: 8.0, y: Y + 0.07, n: 80 });
  petals.push({ x: LN_X, z: -55.6, w: 3.0, d: 7.0, y: Y + 0.07, n: 70 });
  petals.push({ x: -12.0, z: LK_Z, w: 10.0, d: 2.2, y: Y + 0.07, n: 55 });

  return { sakura, shrubs, grove, petals };
}

/* ------------------------------------------------------------------ *
 * The lane.
 * ------------------------------------------------------------------ */

function buildLane(ctx, m, gm) {
  lane(ctx, {
    axis: 'z', at: LN_X, from: LN_Z0, to: LN_Z1, w: LN_W,
    mat: gm.asphaltWorn, kerb: false, rise: 0.05, name: 'tsugakuroLane',
  });
  /* What a lane too narrow for kerbs has instead of gutters, down the west side
   * where the plots are: the slotted channel takes the run-off from four front
   * gardens and the road's crown sheds the other way. */
  laneGutter(ctx, {
    axis: 'z', at: LN_WK + 0.26, from: LN_Z0 + 1.0, to: LN_Z1 - 1.0, y: Y, pitch: 0.9,
    manholes: [-36.0, -50.4], manholeOff: 0.6,
    patches: [[-22.6, -44.2, 1.4, 1.8], [-21.2, -57.0, 1.2, 1.5]],
  });

  /* The name plate at the north mouth, facing south down the lane, which is
   * where it is read from -- you arrive here off the canal's service path. */
  laneSign(ctx, {
    x: -19.9, z: -31.4, y: Y, variant: 3, h: 2.1, ry: Math.PI,
    mirror: true, mirrorAt: [0.0, -0.8], mirrorRy: 0.7,
  });
  bollardRow(ctx, { axis: 'x', at: -30.9, from: LN_WK + 0.4, to: LN_E - 0.4, n: 3, y: Y });

  /* --------------------------- the south stub ---------------------------
   * The lane runs 1.8 m past the last plot and stops.  What is at the end is a
   * turning square, a barrier and the field -- and this is the *second* dead end
   * in the new work, so it is deliberately not built like 四丁目's road head: no
   * guardrail, no plate, just a hedge across it and the ground going on.  A ward
   * road ends in furniture; a lane ends in somebody's hedge. */
  pad(ctx, {
    x: LN_X + 0.6, z: LN_Z0 + 1.2, w: LN_W + 2.0, d: 2.6, y: Y, h: 0.06,
    mat: gm.asphaltWorn, name: 'tsugakuroTurn',
  });
  hedgeRun(ctx, {
    axis: 'x', at: LN_Z0 - 0.4, from: LN_WK - 1.2, to: LN_E + 2.2, y: Y, h: 1.0, seed: 8711,
  });
  ctx.add(makeCone({ x: LN_E + 1.4, z: LN_Z0 + 0.4, y: Y, ry: 0.4 }));

  /* --------------------------- the north mouth ---------------------------
   * The canal's south bank runs a kerb at z -30.20..-29.84 with its service path
   * behind it, and the lane meets that path rather than the water.  One slab
   * ties the two surfaces; the bank is at `ctx.groundAt` and not at `groundY`,
   * because the canal laid its own path over the natural grade here and a pad
   * seated from the street profile would sit under it. */
  {
    const by = ctx.groundAt(LN_X, -30.9);
    pad(ctx, {
      x: LN_X, z: -30.5, w: LN_W + 1.2, d: 1.8, y: by - 0.06, h: 0.06,
      mat: gm.concrete, name: 'tsugakuroMouth',
    });
  }
}

/* ------------------------------------------------------------------ *
 * The two ways east: the cross link, and the 抜け道 between the shops.
 * ------------------------------------------------------------------ */

function buildLinks(ctx, m, gm, shrubs) {
  /* ------------------------------ the cross link ------------------------------ *
   * Through the 5.2 m gap between the two old houses -- (-15.2,-34.6) stops at
   * z -38.20 and ひばりマート starts at -43.45 -- out to the school route's west
   * footway.  2.6 m, kerbed on the north side only, which is what a link that
   * doubles as somebody's vehicle access actually has. */
  lane(ctx, {
    axis: 'x', at: LK_Z, from: LN_E - 0.6, to: -2.0, w: LK_W, y: Y,
    mat: gm.asphaltWorn, kerb: false, rise: 0.05, name: 'tsugakuroLink',
  });
  laneLine(ctx, { axis: 'x', at: LK_Z + LK_W / 2 - 0.22, from: -18.0, to: -3.0, y: Y + 0.08 });
  ctx.add(makeMirror({ x: LN_E + 0.6, z: LK_Z - 1.5, y: Y + 0.06, ry: 2.4, h: 2.4, r: 0.4 }));

  /* ------------------------------- the 送迎 bay ------------------------------- *
   * Where the link meets the road, and the one piece of this block that is
   * about the school rather than about the houses.  A bay a parent pulls into
   * for ninety seconds: two wheel stops, a painted box, the plate that says what
   * it is for, and the notice board the PTA put up beside it.  It is *not* a car
   * park -- two spaces, no barrier, no machine -- and the difference matters,
   * because a car park here would make the school route commercial. */
  pad(ctx, {
    x: DROP.x, z: DROP.z, w: DROP.w, d: DROP.d, y: Y, h: 0.08,
    mat: gm.asphalt, name: 'tsugakuroDrop',
  });
  for (const dx of [-1.2, 1.2]) {
    laneLine(ctx, { axis: 'z', at: DROP.x + dx, from: DROP.z - 1.1, to: DROP.z + 1.1, y: Y + 0.1 });
    ctx.add(makeWheelStops({ x: DROP.x + dx, z: DROP.z + 0.9, y: Y + 0.08, ry: 0, n: 1, gauge: 1.3 }));
  }
  laneLine(ctx, { axis: 'x', at: DROP.z - 1.2, from: DROP.x - 2.3, to: DROP.x + 2.3, y: Y + 0.1 });
  ctx.add(makeSignPost({
    x: DROP.x - 2.9, z: DROP.z + 0.4, y: Y, ry: Math.PI / 2, h: 2.2, postMat: m.metal,
    plates: [{ map: roadSignTex('tsugakuro'), w: 0.56, h: 0.56, y: 1.72, double: true }],
  }));
  {
    const nb = makeNoticeBoard({ ctx,
      x: DROP.x + 0.4, z: DROP.z - 1.75, y: Y, ry: 0, w: 1.6, h: 1.05, y0: 0.85, wood: 0x8a6f52,
      sheets: [
        { map: hallNotice(0), x: -0.44, w: 0.4, h: 0.55, tilt: 0.018 },
        { map: hallNotice(2), x: 0.16, y: -0.02, w: 0.4, h: 0.55, tilt: -0.01 },
      ],
    });
    ctx.add(nb);
  }
  ctx.add(makePlanter({ x: DROP.x + 2.7, z: DROP.z - 1.4, y: Y, r: 0.26, flower: true, seed: 8721, n: 5 }));
  shrubs.push({ x: DROP.x - 2.6, z: DROP.z - 1.6, y: Y, r: 0.42, count: 3, spread: 1.0, seed: 8722 });

  /* -------------------------------- the 抜け道 --------------------------------
   * Two metres between ひばりマート's south wall and こむぎ's north one, and it
   * comes out on the school route eight metres from the painted crossing at the
   * gate.  It is a *cut-through* and it is dressed as one: no kerbs, no line, a
   * strip of worn concrete with the two buildings' backs on it, a gutter down
   * one side, a bollard at each end and the bins that live in a passage nobody
   * owns.  The gap is only 2.5 m wide, so the walkable band is 1.82 m -- which
   * is why nothing at all is allowed to stand in it. */
  pad(ctx, {
    x: -11.6, z: NK_Z, w: 17.6, d: NK_W, y: Y, h: 0.06,
    mat: gm.concreteMid, name: 'tsugakuroNukemichi',
  });
  laneGutter(ctx, {
    axis: 'x', at: NK_Z + NK_W / 2 - 0.24, from: -18.4, to: -5.0, y: Y, pitch: 0.85,
    manholes: [-14.6], manholeOff: -0.5,
  });
  bollardRow(ctx, { axis: 'z', at: -3.6, from: NK_Z - 0.7, to: NK_Z + 0.7, n: 2, y: Y });
  bollardRow(ctx, { axis: 'z', at: -19.6, from: NK_Z - 0.7, to: NK_Z + 0.7, n: 2, y: Y });
  /* Everything below is on the *verges* of the passage, outside the 1.82 m
   * band: the ichome lesson, where a warning plate a quarter of a metre inside a
   * two-metre alley made the whole view through it the blank back of a sign. */
  ctx.add(makeIvy({ x: -13.4, z: NK_Z + 1.02, y: Y, ry: Math.PI, len: 3.0, top: 1.6, drop: 0.9, seed: 8723 }));
  ctx.add(makeIvy({ x: -8.2, z: NK_Z - 1.02, y: Y, ry: 0, len: 2.4, top: 1.4, drop: 0.8, seed: 8724 }));
  ctx.add(makeLoosePaper(ctx, [
    { x: -10.4, z: NK_Z + 0.7, y: Y + 0.07, ry: 0.9 },
    { x: -6.2, z: NK_Z - 0.72, y: Y + 0.07, ry: -0.4 },
  ]) ?? new THREE.Group());
}

/* ------------------------------------------------------------------ *
 * グリーンハイツ -- the staff block.
 *
 * Three storeys, two flats a floor, and the plainest thing in the district: no
 * balcony detail, no name box, one plate.  Housing an employer builds is not
 * housing anybody chose, and that shows in what it does *not* have.  The life
 * on it is entirely in the clutter -- six mailboxes, six meters, washing on two
 * of the three galleries, a bicycle rack that is full.
 * ------------------------------------------------------------------ */

function buildStaffBlock(ctx, m, gm, shrubs) {
  const p = plotBox(STAFF);
  const b = makeWalkup({
    ...STAFF, y: Y, floors: 3, units: 2, seed: 8731, wall: 1, roof: 0, door: 0, plate: 4, ctx,
  });
  ctx.add(b);

  /* the forecourt, 1.4 m between the gallery and the lane */
  pad(ctx, {
    x: p.x1 + 0.7, z: STAFF.z, w: 1.4, d: STAFF.w + 0.4, y: Y, h: 0.08,
    mat: gm.concrete, name: 'tsugakuroStaffCourt',
  });
  const gA = (x, z) => ctx.groundAt(x, z);
  const fx = p.x1;                       // -24.8, the gallery frontage
  ctx.add(makeMailboxBank({ x: fx + 0.5, z: STAFF.z + 2.2, y: gA(fx + 0.5, STAFF.z + 2.2), ry: Math.PI / 2, cols: 3, rows: 2 }));
  ctx.add(makeNoticeBoard({ ctx,
    x: fx + 0.4, z: STAFF.z + 0.9, y: gA(fx + 0.4, STAFF.z + 0.9), ry: Math.PI / 2,
    w: 1.2, h: 0.8, y0: 0.95, wood: 0x8a6f52,
    sheets: [{ map: hallNotice(1), x: 0, w: 0.38, h: 0.52, tilt: 0.014 }],
  }));
  ctx.add(makeBikeShelter({ ctx, x: fx + 0.7, z: STAFF.z - 2.2, y: Y + 0.08, ry: Math.PI / 2, w: 3.0, d: 1.4, h: 2.0 }));
  ctx.add(makeBikeRack({ x: fx + 0.7, z: STAFF.z - 2.2, y: Y + 0.08, n: 4, spacing: 0.6, ry: Math.PI / 2, seed: 208 }));
  refusePoint(ctx, {
    kind: 'bins', x: fx + 0.55, z: p.z0 - 0.7, y: gA(fx + 0.55, p.z0 - 0.7), ry: Math.PI / 2, plate: 1,
  });

  /* Six meters in a row on the south flank -- one per flat, which is the detail
   * that says six households and not one building.  `makeGasMeter`'s bracket
   * arms span its standoff, so the origin sits half a cabinet plus 60 mm off the
   * wall face and its back actually touches the render. */
  for (let i = 0; i < 3; i++) {
    ctx.add(makeGasMeter({
      x: STAFF.x - 1.9 + i * 1.9, z: p.z0 - 0.16, y: gA(STAFF.x - 1.9 + i * 1.9, p.z0 - 0.16), ry: Math.PI,
    }));
  }
  /* Outdoor units stacked up the north flank, one per floor, and the washing on
   * the balconies round the back -- the gallery side is the lane and nobody
   * hangs washing over a lane. */
  for (let i = 0; i < 3; i++) {
    ctx.add(makeAircon({
      x: p.x0 - 0.24, z: STAFF.z - 1.6, y: Y + 1.05 + i * 2.7, ry: -Math.PI / 2, w: 0.84, h: 0.58, feet: false,
    }));
  }
  for (let i = 0; i < 2; i++) {
    ctx.add(makeDryingRack({
      x: p.x0 - 0.5, z: STAFF.z + 1.4 - i * 3.0, y: Y + 2.85 + i * 2.7, ry: -Math.PI / 2, n: 4, seed: 8733 + i,
    }));
  }
  ctx.add(makeLaundryPole({ ctx, x: p.x0 - 0.8, z: STAFF.z - 2.6, y: gA(p.x0 - 0.8, STAFF.z - 2.6), ry: Math.PI / 2, len: 2.4, n: 4, seed: 8735 }));
  ctx.add(makeStorageShed({ x: p.x0 - 0.85, z: p.z1 - 1.2, y: gA(p.x0 - 0.85, p.z1 - 1.2), ry: -Math.PI / 2, w: 1.4, d: 0.8, h: 1.7 }));
  ctx.collide(p.x0 - 1.3, p.z1 - 1.9, p.x0 - 0.4, p.z1 - 0.5, Y + 1.74);
  shrubs.push({ x: p.x0 - 1.2, z: p.z0 + 1.0, y: Y, r: 0.44, count: 3, spread: 1.05, seed: 8736 });
}

/* ------------------------------------------------------------------ *
 * The three family plots.
 *
 * A 二階半, a plain two-storey detached and a 連棟 二戸, in that order going
 * south, each with a garden deep enough to leave something in.  The brief for
 * this block is "the houses of the families whose children go to that school",
 * and the way that is said without a person in the frame is by what is in the
 * gardens: a ball box, a kid's bicycle down on its side, a chalked square on
 * the apron, a vegetable bed somebody actually waters.
 * ------------------------------------------------------------------ */

function buildHouses(ctx, m, gm, rng, shrubs, petals) {
  const gA = (x, z) => ctx.groundAt(x, z);

  /* ------------------------------ 二階半の家 ------------------------------ */
  {
    const p = plotBox(ATTIC);
    const h = makeAtticHouse({
      ...ATTIC, y: Y, seed: 8741, wall: 3, roof: 1, door: 2, nameVariant: 3,
      lit: false, litDormer: true,
    });
    ctx.add(h);
    plotCollide(ctx, p, Y + (h.userData.top ?? 8.3));

    /* The boundary 0.3 m off the kerb, with the gate opposite the door.  A fence
     * set back into the middle of a 1.6 m garden leaves less than the 0.68 m of
     * clear ground the player's own radius needs between it and the frontage,
     * and a front garden you cannot walk into is not a garden. */
    const FX = p.x1 + 1.6;
    plotWall(ctx, {
      x0: FX, x1: FX + 0.3, z0: p.z0, z1: p.z1, sides: ['x+'], kind: 'block',
      h: 0.4, fenceH: 0.62, y: Y, seed: 8742,
      gate: { side: 'x+', at: ATTIC.z + 1.2, w: 1.1 },
    });
    const doorAt = h.userData.doorAt ?? (ATTIC.w / 2 - 1.15);
    const [dx, dz] = p.at(doorAt, p.halfD + 0.5);
    stepStones(ctx, { from: [FX - 0.5, ATTIC.z + 1.2], to: [dx, dz], y: Y, n: 4, seed: 8743 });
    dressPlot(ctx, {
      ...ATTIC, y: Y, doorAt, seed: 8744, gap: 1.5, gateAt: 1.2,
      clear: (x, z) => x < FX - 0.1,
      aircon: true, gas: true, mat: true, pots: true, parcel: true, umbrella: true,
      bike: true, kidBike: true, laundry: false, garden: 1, tap: 1, flank: 0.85,
    });
    ctx.add(makeBallBox({ x: p.x1 + 0.7, z: p.z0 + 0.8, y: gA(p.x1 + 0.7, p.z0 + 0.8), ry: Math.PI / 2, seed: 8745 }));
    ctx.add(makeLaundryPole({ ctx, x: p.x0 - 0.7, z: ATTIC.z, y: gA(p.x0 - 0.7, ATTIC.z), ry: Math.PI / 2, len: 2.4, n: 4, seed: 8746 }));
    shrubs.push({ x: p.x1 + 0.9, z: p.z1 - 0.9, y: Y, r: 0.4, count: 3, spread: 0.95, seed: 8747 });
    petals.push({ x: p.x1 + 0.9, z: ATTIC.z, w: 1.8, d: 5.2, y: Y + 0.02, n: 40 });
  }

  /* ------------------------- the plain two-storey ------------------------- *
   * `makeHouse` and not one of the newer generators, on purpose: this row needs
   * one building that is the same type as the twenty-five the district was
   * already made of, or the new work reads as an estate dropped in beside the
   * old town rather than as the same town continuing. */
  {
    const hs = makeHouse({ ...HOUSE, y: Y, floors: 2, seed: 8748, wall: 5, roof: 2, roofKind: 'gable' });
    ctx.add(hs);
    ctx.collide(HOUSE.x - HOUSE.w / 2 - 0.1, HOUSE.z - HOUSE.d / 2 - 0.1,
      HOUSE.x + HOUSE.w / 2 + 0.1, HOUSE.z + HOUSE.d / 2 + 0.1, Y + 2.72 * 2);
    const fx = HOUSE.x + HOUSE.w / 2;             // -25.5, the frontage
    const FX = fx + 1.5;
    plotWall(ctx, {
      x0: FX, x1: FX + 0.3, z0: HOUSE.z - HOUSE.d / 2, z1: HOUSE.z + HOUSE.d / 2,
      sides: ['x+'], kind: 'timber', h: 0.3, fenceH: 0.82, y: Y, seed: 8749,
      gate: { side: 'x+', at: HOUSE.z - 1.0, w: 1.1 },
    });
    stepStones(ctx, { from: [FX - 0.5, HOUSE.z - 1.0], to: [fx + 0.35, HOUSE.z - 0.2], y: Y, n: 3, seed: 8750 });
    /* the carport on the north side of the plot, off the lane -- a family house
     * on a 3.2 m lane parks on its own ground, and the roof is what breaks the
     * run of three gable ends into something with a rhythm */
    pad(ctx, {
      x: fx + 0.9, z: HOUSE.z + HOUSE.d / 2 + 1.5, w: 4.6, d: 2.7, y: Y, h: 0.07,
      mat: gm.concrete, name: 'tsugakuroCarBay', ry: 0,
    });
    ctx.add(makeCarport({ ctx, x: fx - 1.0, z: HOUSE.z + HOUSE.d / 2 + 1.5, y: Y + 0.07, ry: Math.PI / 2, w: 2.7, d: 4.6, h: 2.3 }));
    makeChalkMarks(ctx, [
      { x: fx + 1.4, z: HOUSE.z + HOUSE.d / 2 + 1.1, y: Y + 0.09, ry: 0.2 },
      { x: fx + 2.2, z: HOUSE.z + HOUSE.d / 2 + 2.0, y: Y + 0.09, ry: -0.5 },
    ]);
    ctx.add(makeKidBike({ x: fx + 1.9, z: HOUSE.z + HOUSE.d / 2 + 0.6, y: Y + 0.07, ry: 2.4, lean: 0.34 }));
    ctx.add(makeDoormat({ x: fx + 0.3, z: HOUSE.z - 0.2, y: gA(fx + 0.3, HOUSE.z - 0.2), ry: Math.PI / 2 }));
    ctx.add(makePotShelf({ x: fx + 0.35, z: HOUSE.z + 1.5, y: gA(fx + 0.35, HOUSE.z + 1.5), ry: Math.PI / 2, seed: 8751 }));
    ctx.add(makeGasMeter({ x: fx + 0.16, z: HOUSE.z - 2.0, y: gA(fx + 0.16, HOUSE.z - 2.0), ry: Math.PI / 2 }));
    ctx.add(makeAircon({ x: fx + 0.24, z: HOUSE.z + 2.3, y: gA(fx + 0.24, HOUSE.z + 2.3), ry: Math.PI / 2, w: 0.8, h: 0.58 }));
    ctx.add(makeKitchenGarden({ x: HOUSE.x - HOUSE.w / 2 - 1.2, z: HOUSE.z, y: gA(HOUSE.x - HOUSE.w / 2 - 1.2, HOUSE.z), ry: Math.PI / 2, w: 2.2, d: 1.1, seed: 8752 }));
    ctx.add(makeTapPost({ x: HOUSE.x - HOUSE.w / 2 - 0.3, z: HOUSE.z - 1.6, y: gA(HOUSE.x - HOUSE.w / 2 - 0.3, HOUSE.z - 1.6), ry: -Math.PI / 2 }));
    ctx.add(makeBucket({ x: HOUSE.x - HOUSE.w / 2 - 0.75, z: HOUSE.z - 1.4, y: gA(HOUSE.x - HOUSE.w / 2 - 0.75, HOUSE.z - 1.4), ry: 0.6, water: true }));
    shrubs.push({ x: fx + 1.1, z: HOUSE.z - HOUSE.d / 2 + 0.6, y: Y, r: 0.42, count: 3, spread: 1.0, seed: 8753 });
  }

  /* ------------------------------- 連棟 二戸 ------------------------------- *
   * Two units, one wall, one roof -- the smallest terrace in the world, which is
   * what a leftover strip at the end of a lane gets built as.  Its variety is
   * per unit and material-free: same render, same tile, same window, different
   * door colour, different clutter, one shutter down. */
  {
    const p = plotBox(TERR);
    const t = makeTerrace({ ...TERR, y: Y, seed: 8754, wall: 2, roof: 3 });
    ctx.add(t);
    plotCollide(ctx, p, Y + (t.userData.top ?? 6.0));
    const FX = p.x1 + 1.3;
    for (let i = 0; i < 2; i++) {
      const z0 = p.z0 + i * TERR.unitW, z1 = z0 + TERR.unitW;
      plotWall(ctx, {
        x0: FX, x1: FX + 0.3, z0, z1, sides: ['x+'], kind: 'block',
        h: 0.34, fenceH: 0.48, y: Y, seed: 8755 + i,
        gate: { side: 'x+', at: (z0 + z1) / 2, w: 1.0 },
      });
    }
    for (let i = 0; i < 2; i++) {
      const u = (i - 0.5) * TERR.unitW;
      const [gx, gz] = p.at(u, p.halfD + 1.0);
      const [dx, dz] = p.at(u, p.halfD + 0.2);
      stepStones(ctx, { from: [gx, gz], to: [dx, dz], y: Y, n: 3, seed: 8757 + i });
    }
    /* one household at a time, and deliberately different each -- this is the
     * whole difference between a terrace and a barracks */
    {
      const [x, z] = p.at(-1.5, p.halfD + 0.5);
      ctx.add(makeUmbrellaStand({ x, z, y: gA(x, z), ry: p.outRy, seed: 8759 }));
      const [x2, z2] = p.at(-2.3, p.halfD + 0.42);
      ctx.add(makePlanter({ x: x2, z: z2, y: gA(x2, z2), r: 0.24, flower: true, seed: 8760, n: 5 }));
      const [x3, z3] = p.at(-0.7, p.halfD + 0.24);
      ctx.add(makeDoormat({ x: x3, z: z3, y: gA(x3, z3), ry: p.outRy }));
    }
    {
      const [x, z] = p.at(1.6, p.halfD + 0.6);
      ctx.add(makeBicycle({ x, z, y: gA(x, z), ry: p.outRy, lean: 0.06, color: 0x6a7d5c }));
      const [x2, z2] = p.at(2.4, p.halfD + 0.44);
      ctx.add(makeDeliveryBox({ x: x2, z: z2, y: gA(x2, z2), ry: p.outRy }));
      const [x3, z3] = p.at(0.8, p.halfD + 0.36);
      ctx.add(makeMilkCrate({ x: x3, z: z3, y: gA(x3, z3), n: 2, ry: p.outRy + 0.3 }));
    }
    for (let i = 0; i < 2; i++) {
      const [x, z] = p.at((i - 0.5) * TERR.unitW + 0.9, -p.halfD - 0.16);
      ctx.add(makeGasMeter({ x, z, y: gA(x, z), ry: p.outRy + Math.PI }));
    }
    ctx.add(makeLaundryPole({ ctx, x: p.x0 - 1.0, z: TERR.z + 0.6, y: gA(p.x0 - 1.0, TERR.z + 0.6), ry: Math.PI / 2, len: 2.4, n: 4, seed: 8761 }));
    ctx.add(makeCatBox({ x: p.x1 + 0.5, z: p.z0 - 0.5, y: gA(p.x1 + 0.5, p.z0 - 0.5), ry: 1.1 }));
    shrubs.push({ x: p.x0 - 1.1, z: p.z0 + 1.2, y: Y, r: 0.44, count: 3, spread: 1.05, seed: 8762 });
    petals.push({ x: p.x1 + 0.8, z: TERR.z, w: 1.8, d: 5.4, y: Y + 0.02, n: 40 });
  }
}

/* ------------------------------------------------------------------ *
 * The shops' backs.
 *
 * The 4.7 m strip between the lane's east kerb and ひばりマート / パン工房こむぎ,
 * which is the only piece of *back* a shop in this world has ever been given --
 * さくら坂裏路地 dresses five of them, and this is the same idea applied to the
 * two that stand on their own.  A convenience store's back is one of the most
 * recognisable pieces of Japanese street in existence and it is almost entirely
 * made of things nobody designed: the waste cage, the stacked bread trays, the
 * condenser bank, the bulk gas, the one blue door with a step in front of it.
 * ------------------------------------------------------------------ */

function buildServiceStrip(ctx, m, gm) {
  const gA = (x, z) => ctx.groundAt(x, z);
  const MART_X = -15.25;                 // ひばりマート's west wall
  const PAN_X = -11.45;                  // こむぎ's

  /* the strip itself: worn concrete, laid only where it is used, so the lane's
   * asphalt still reads as the surface that goes somewhere */
  pad(ctx, {
    x: -17.6, z: -48.0, w: 5.0, d: 9.4, y: Y, h: 0.05,
    mat: gm.concreteMid, name: 'tsugakuroService',
  });

  /* --------------------------- ひばりマート's back --------------------------- */
  ctx.add(makeAircon({ x: MART_X - 0.24, z: -50.4, y: gA(MART_X - 0.24, -50.4), ry: -Math.PI / 2, w: 0.9, h: 0.66 }));
  ctx.add(makeAircon({ x: MART_X - 0.24, z: -48.8, y: gA(MART_X - 0.24, -48.8), ry: -Math.PI / 2, w: 0.9, h: 0.66 }));
  ctx.add(makeAircon({ x: MART_X - 0.24, z: -47.2, y: Y + 2.55, ry: -Math.PI / 2, w: 0.9, h: 0.66, feet: false }));
  ctx.add(makeGasMeter({ x: MART_X - 0.16, z: -45.4, y: gA(MART_X - 0.16, -45.4), ry: -Math.PI / 2 }));
  /* the waste cage: mesh on three sides against the wall, which is what a
   * convenience store has instead of a bin */
  {
    const cx = -17.0, cz = -52.0;
    for (const at of [cx - 1.1, cx + 1.1]) {
      meshFence(ctx, { axis: 'z', at, from: cz - 1.0, to: cz + 1.0, y: Y, h: 1.5, spacing: 1.4, mid: false });
    }
    meshFence(ctx, { axis: 'x', at: cz - 1.0, from: cx - 1.1, to: cx + 1.1, y: Y, h: 1.5, spacing: 1.4, mid: false });
    ctx.add(makeCrates({ x: cx - 0.4, z: cz + 0.2, y: Y + 0.05, n: 4, seed: 8771, ry: 0.1 }));
    ctx.add(makeMilkCrate({ x: cx + 0.5, z: cz - 0.3, y: Y + 0.05, n: 3, ry: -0.25 }));
  }
  ctx.add(makeCrates({ x: -16.4, z: -46.4, y: Y + 0.05, n: 3, seed: 8772, ry: -0.15 }));
  ctx.add(makeBicycle({ x: -18.6, z: -44.6, y: gA(-18.6, -44.6), ry: Math.PI / 2, lean: 0.07, color: 0x8f6fb5 }));
  ctx.add(makeVendBin({ x: -19.0, z: -46.6, y: gA(-19.0, -46.6), ry: Math.PI / 2 }));
  ctx.add(makeBroom({ x: MART_X - 0.34, z: -44.4, y: gA(MART_X - 0.34, -44.4), tilt: -0.06, roll: 0.2, ry: 1.4 }));
  ctx.add(makeTapPost({ x: MART_X - 0.4, z: -51.6, y: gA(MART_X - 0.4, -51.6), ry: -Math.PI / 2 }));
  ctx.add(makeBucket({ x: MART_X - 0.9, z: -51.4, y: gA(MART_X - 0.9, -51.4), ry: 0.9 }));

  /* ----------------------------- こむぎ's back ----------------------------- *
   * A bakery's back is flour, trays and a very warm extract.  It is on the
   * 抜け道 rather than on the service strip, which is why the passage is worth
   * walking: you go past the ovens. */
  ctx.add(makeCrates({ x: PAN_X - 0.55, z: -55.9, y: gA(PAN_X - 0.55, -55.9), n: 3, seed: 8773, ry: 0.2 }));
  ctx.add(makeMilkCrate({ x: PAN_X - 0.5, z: -57.2, y: gA(PAN_X - 0.5, -57.2), n: 2, ry: -0.4 }));
  ctx.add(makeAircon({ x: PAN_X - 0.24, z: -58.6, y: gA(PAN_X - 0.24, -58.6), ry: -Math.PI / 2, w: 0.86, h: 0.6 }));
  {
    // the extract duct up the flank, which is the only thing on either back that
    // is not a box: a cylinder, an elbow and a cowl
    const parts = [];
    parts.push({ geometry: new THREE.CylinderGeometry(0.14, 0.14, 3.0, 8), matrix: trs(PAN_X - 0.3, Y + 1.5, -60.0) });
    parts.push({ geometry: new THREE.CylinderGeometry(0.14, 0.14, 0.9, 8), matrix: trs(PAN_X - 0.3, Y + 3.0, -59.55, Math.PI / 2, 0, 0) });
    parts.push({ geometry: new THREE.BoxGeometry(0.42, 0.2, 0.42), matrix: trs(PAN_X - 0.3, Y + 3.16, -59.2) });
    const duct = new THREE.Mesh(bake(parts), m.metalDark);
    duct.castShadow = duct.receiveShadow = true;
    ctx.add(duct);
  }
  ctx.add(makeStorageShed({ x: -13.6, z: -59.6, y: gA(-13.6, -59.6), ry: Math.PI / 2, w: 1.5, d: 0.85, h: 1.8 }));
  ctx.collide(-14.05, -60.35, -13.15, -58.85, Y + 1.85);
}
