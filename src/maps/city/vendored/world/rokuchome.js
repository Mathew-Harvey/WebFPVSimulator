import * as THREE from 'three';
import { PAL } from '../core/palette.js';
import { cel, flat } from '../core/toon.js';
import {
  warningPlate, hallNotice, gomiPlate, parkingSign, noParking, roadPaint,
  busRouteBoard, bayNumber, paperSheet, flagTex, norenTex,
} from '../core/textures.js';
import { box, bake, trs, rngKit } from '../core/util.js';
import { hullOutline } from '../core/outline.js';
import { groundY } from './street.js';
import { pad, lane, laneLine, wallRun, meshFence, groundMats } from './ground.js';
import {
  plotBox, plotCollide, plotWall, hedgeRun, stepStones, refusePoint, dressPlot,
  laneGutter, bollardRow, laneSign, poleRun,
} from './plots.js';
import { makeNagaya } from './blocks.js';
import { makeWalkup, makeTerrace, makeBikeShelter } from './housing.js';
import { makeHouse } from './buildings.js';
import { makeShop, makeShopFlag } from './shops.js';
import { addVending } from './vending.js';
import { bayPaint, kerbLine, makeBusStop, makeDelineator } from './vehicles.js';
import {
  makeBench, makeBikeRack, makeBicycle, makeBins, makePlanter, makeFlowerBed,
  makeMailboxBank, makeSignPost, makeMirror, makeNoticeBoard, makeGuardrail,
  makeCone, makeVendBin, makeUmbrellaStand, makeDeliveryBox, makeDoormat,
  makePotShelf, makeStorageShed, makeTapPost, makeIvy, makeBucket, makeBroom,
  makeCrates, makeMilkCrate, makeRecycleBox, makeAircon, makeLaundryPole,
  makeCatBox,
} from './props.js';
import {
  makeWheelStops, makeLockerBank, makeKitchenGarden, makeKidBike,
  makeDryingRack, makeGasMeter, makeBallBox, makeChalkMarks,
} from './streetprops.js';

/* ------------------------------------------------------------------ *
 * ひばり台六丁目 -- the bus turnaround and the streets round it.
 *
 * The twenty-second district, and the first one laid out round a *vehicle
 * movement* rather than round a building.  ひばり台ふれあい号 has existed for a
 * round with one stop outside the library and nowhere to turn round; a route
 * that does not end anywhere is a timetable with no reason.  So this block is
 * the end of the line: the last stretch of the route, the circle the bus turns
 * in, and the dozen or so households whose connection to the rest of the town
 * is that circle.
 *
 * It is deliberately **not a terminus**.  A Japanese コミュニティバス折返場 on
 * the edge of an estate is a widened piece of residential road with a stop
 * pole, a shelter, a bay or two and a mirror -- no stands, no interchange, no
 * building.  What makes it read is the ordinariness of everything round it: a
 * 弁当屋, three marked bays, somebody's washing, a hedge on a retaining wall.
 *
 * ------------------------------------------------------------------ *
 * THE LAND, measured rather than remembered -- the 四丁目 lesson.
 *
 * Envelope x 45..80, z 40..70.  A sweep of `world.colliders` over it before a
 * single coordinate was chosen found this and nothing else:
 *
 *   the north lane's east arm   x 40..48.6, z 43.5..46.9 (`northblock.js`),
 *                               continued by 二丁目's north T at x 47.8..52.2,
 *                               z 43.5..46.9, **top 0.513** (`nichome.js`).
 *                               That surface is where this district starts and
 *                               its height is the height everything is paved to.
 *   三丁目's 片流れの平屋       x 42.90..48.70, z 47.80..53.40, and its front
 *                               garden's 板塀 at x 48.86..49.14 / z 46.00..47.90.
 *                               **That 0.28 m fence is the entire reason the
 *                               connector is at x 51.00 and not at 50.00.**
 *   三丁目's 連棟 三戸          x 39.10..45.50, z 55.95..64.85 -- the west
 *                               boundary for six metres of the north lane
 *   a 三丁目 grove tree         x 46.95..48.25, z 57.95..59.25, top 6.32
 *   二丁目's コーポ みなみ      x 51.90..56.50, z 41.80..45.80 -- the south side
 *                               of the main street is *its* back for five metres
 *   二丁目's back-edge grove    (68.9, 41.0) and (63.4, 43.2), and shrubs at
 *                               (60.75, 40.2) and (66.35, 38.9)
 *
 * Everything else in that envelope is empty ground, which is why the district
 * is here: it was the largest unbuilt parcel left beside something finished.
 *
 * **The ground had to be graded, and this is the only district in the world cut
 * into a hill.**  The shoulder rising north-east of 二丁目 read 1.4 m at
 * (60, 56) and 2.2 m at (60, 60) -- straight through where the turnaround is --
 * so `planet.js` gains a pad at (62, 55), rx 17 / rz 11.  Its north edge stops
 * short of the block's on purpose: the ground starts climbing again at z = 66
 * and is 2.4 m up by z = 72.  That bank is not a leftover.  It is what the
 * retaining wall, the hedge above it and the grove line are standing on, and it
 * is the reason the town stops here rather than merely running out.
 *
 * ------------------------------------------------------------------ *
 * WHAT THE ARITHMETIC DECIDED
 *
 * **The turning circle is 12.4 m across and that is a decision, not a
 * rounding.**  `SPEC.minibus` is 6.30 x 2.08, so its outer front corner sweeps
 * a shade over 6 m: a 6.20 m paved radius is one 切り返し, which is what a
 * driver actually does at the end of a suburban route four times a day.  A
 * radius the bus could go round in one sweep is 8 m -- a 16 m circle -- and at
 * that size it stops being a widened road and becomes a bus station, which the
 * brief rules out and which nothing else in this town would survive next to.
 *
 * **The paving is one extruded polygon, not a rectangle plus a disc.**  Two
 * slabs at one height overlapping is z-fighting across the most important
 * fifteen metres in the district; butting them leaves two crescent slivers of
 * grass at the throat.  A `THREE.Shape` -- street rectangle, `absarc` the long
 * way round the circle, back along the north edge -- is one surface with no
 * seam, and it gives the ink pass the only genuinely curved silhouette in a
 * world otherwise made of boxes.
 *
 * **The open stair is what placed every block here.**  `makeWalkup` builds it
 * 1.6 m beyond the local -x end, *outside* the mass and therefore outside
 * `plotCollide`'s box, and it was the binding constraint twice: コーポ ひがし's
 * lands at x 60.80..62.40 and 第二 さくら荘's at 68.70..70.30, which is what
 * fixes the terrace's west gable at 70.50 and not at 69.  Both are written out
 * below and both carry their own collider, because the plot box does not.
 *
 * **Three bays, not five.**  The brief asked for three to five; the land
 * offered 7.4 m of frontage between the north lane and the walk-up's stair.
 * Three at 2.4 m fills it exactly, and `traffic.js`'s own rule is that a bay
 * left empty beside a full one does more work than a second car in it.
 *
 * **There is no south lane.**  One was drafted and cut: it would have run
 * between the two shops and the circle, and the pocket it needed is the only
 * ground the corner node could stand on.  The one detached house opens straight
 * onto the circle's south rim instead, which is a better story than a stub --
 * the house at the end of the line.
 *
 * ------------------------------------------------------------------ *
 * FLOODFILL -- every one of these must be reachable on foot from the spawn:
 *
 *   mouth        [51.00, 48.00]  the connector up from 二丁目's north T
 *   mainW        [51.00, 52.20]  the main street, west end
 *   mainE        [63.20, 52.20]  the main street at the throat
 *   circleW      [66.40, 52.20]  the turning circle, west side
 *   circleN      [70.60, 56.40]  the circle beside the bus box
 *   circleE      [75.60, 52.20]  the circle, east side
 *   circleS      [70.60, 47.60]  the circle, south side
 *   isle         [65.80, 58.20]  the waiting island, at the shelter
 *   bayMid       [57.40, 57.40]  the middle bay of the 月極, the one left empty
 *   laneN        [51.15, 58.60]  北の道, halfway up
 *   laneEnd      [51.15, 63.60]  its dead end under the retaining wall
 *   nagayaFront  [49.60, 62.40]  outside the 長屋's doors
 *   corpFront    [57.00, 60.35]  コーポ ひがし's gallery and mailbox bank
 *   corpStair    [60.40, 60.20]  the forecourt's east end, at the foot of its
 *                                open stair -- the stair itself is a collider
 *                                and not a route, the way every walk-up's is
 *   miniFront    [65.80, 59.95]  第二 さくら荘's gallery
 *   terrFront    [74.40, 59.30]  the 連棟's three aprons
 *   corner       [62.20, 48.20]  the machine, the bench and the board
 *   bentoDoor    [58.50, 49.20]  outside お弁当 のはら
 *   zakkaDoor    [54.85, 49.50]  outside 雑貨 まるみ -- on the road edge, because
 *                                that shop's doorstep strip is 0.70 m and the
 *                                route past it is the carriageway's own 路側帯,
 *                                which is what a corner shop's doorstep is
 *   houseGate    [65.90, 46.90]  outside the 一戸建て's gate, off the circle
 * ------------------------------------------------------------------ */

/* --------------------------- the street network --------------------------- */

/* The connector up from 二丁目's north T.  x0 = 49.40 clears 三丁目's 板塀
 * (x1 = 49.14) by 0.26 m, which after the player's own radius is 0.60 m of a
 * 3.2 m lane he cannot use -- fine here, and fatal on a two-metre one. */
const MOUTH_X = 51.00, MOUTH_W = 3.20;
const MOUTH_Z0 = 46.90;

/* 六丁目通り: 5.0 m of carriageway with a kerb each side, because it is the one
 * street in the district a bus drives down.  49.70 / 54.70 are the kerb faces. */
const MAIN_Z = 52.20, MAIN_W = 5.00;
const MAIN_Z0 = MAIN_Z - MAIN_W / 2;      // 49.70
const MAIN_Z1 = MAIN_Z + MAIN_W / 2;      // 54.70
const MAIN_X0 = 49.40;

/* the turning circle, and where the street's two edges meet it -- the throat */
const BULB_X = 70.60, BULB_Z = 52.20, BULB_R = 6.20;
const THROAT_X = BULB_X - Math.sqrt(BULB_R * BULB_R - (MAIN_W / 2) ** 2);   // 64.9264

/* 北の道 -- the residential lane north off the main street.  Unkerbed, because
 * a lane this size in this world has a slotted channel instead (一丁目, 三丁目
 * and 桜守裏町 all do), and the difference between that and 二丁目's kerbs is
 * the grammar that says which streets were planned. */
const LN_X = 51.15, LN_W = 3.50;
const LN_Z0 = MAIN_Z1, LN_Z1 = 64.60;

/* The retaining wall at the toe of the cut slope, and its height is measured
 * rather than chosen: the ground behind it reads 0.61 at z = 67, 1.0 at 68 and
 * 1.55 at 69, so a 1.15 m wall (top 1.66) is buried by the slope it holds at
 * about z = 69.2.  A taller one would be retaining nothing -- a wall whose top
 * stands a metre above the ground behind it is a fence pretending. */
const WALL_Z = 67.00, WALL_H = 1.15;

/* ------------------------------- the plots -------------------------------
 * Written out in world space, because every one was placed against a generator
 * extent that is *not* its own footprint -- a walk-up's stair, a 長屋's eave, a
 * terrace's roof overhang -- and guessing at those is what dropped a staircase
 * into another block's 私道 one round ago. */

/* コーポ ひがし -- 3 storeys, 3 flats a floor, gallery on the south (the
 * parking and the street) and balconies on the north, which here is the sunlit
 * side.  4.4 m deep, which is 2.8 m of room behind a 1.35 m gallery -- a 1K,
 * and it is the depth rather than a choice: the strip between the 月極's back
 * wall and the block has to be 2 m or the gallery is unreachable, and the flood
 * fill found exactly that at 4.8 m deep.
 *   mass  x 54.00..60.80, z 61.40..65.80
 *   stair x 60.80..62.40, z 60.70..63.80   (outside the mass; see the note above)
 *   balconies overhang to z = 66.76, 2.79 m up, clear of the wall face at 66.85 */
const CORP = { x: 57.40, z: 63.60, w: 6.80, d: 4.40, face: 'z-' };

/* 第二 さくら荘 -- two storeys, four flats, the 外廊下 block, on the circle's
 * north rim.  mass x 62.90..68.70, z 61.00..65.60; stair x 68.70..70.30,
 * z 60.30..63.35. */
const MINI = { x: 65.80, z: 63.30, w: 5.80, d: 4.60, face: 'z-' };

/* 連棟 三戸 -- the terrace, fronting straight onto the circle's north rim.
 * mass x 70.50..78.30, z 60.00..65.20; eave x 70.14..78.66, z 59.64..65.56. */
const TERR = { x: 74.40, z: 62.60, units: 3, unitW: 2.60, d: 5.20, face: 'z-' };

/* 長屋 二戸 -- the oldest thing here, on the north lane's west side with its
 * eave over the lane, which is the type.  mass x 45.80..49.20, z 59.60..65.20;
 * eave (0.92) x 44.88..50.12, z 58.68..66.12. */
const NAGAYA = { x: 47.50, z: 62.40, units: 2, unitW: 2.80, w: 5.60, d: 3.40, face: 'x+' };

/* the two shops, on the main street's south side */
const BENTO = { x: 58.50, z: 47.00, w: 3.40, d: 3.40, face: 'z+' };   // x 56.80..60.20, z 45.30..48.70
const ZAKKA = { x: 54.85, z: 47.45, w: 3.30, d: 3.00, face: 'z+' };   // x 53.20..56.50, z 45.95..48.95

/* the one detached house, opening onto the circle's south rim */
const HOUSE_E = { x: 65.90, z: 43.40, w: 4.20, d: 4.60, face: 'z+' }; // x 63.80..68.00, z 41.10..45.70

/* the 月極: three bays nose-in off the main street's north kerb.  4.6 m deep
 * rather than the 5.0 三丁目's coin park uses, because that is what the strip
 * between the kerb and コーポ ひがし's forecourt is -- and a 3.4 m kei needs
 * 4.6 the way a 4.4 m saloon needs 5.4. */
const BAY_X = [55.00, 57.40, 59.80];
const BAY_Z0 = MAIN_Z1 + 0.26, BAY_Z1 = BAY_Z0 + 4.20;    // 54.96..59.16
const BAY_WALL = BAY_Z1 + 0.16;                            // 59.32

/* the bus's own box on the circle, the waiting island, and the corner node */
const BUS = { x: 69.20, z: 54.60, w: 6.60, d: 2.80 };
const ISLE = { x: 65.80, z: 58.10, w: 4.40, d: 2.40 };
const NODE = { x0: 60.30, x1: 64.90, z0: 46.60, z1: MAIN_Z0 - 0.26 };

const M = {};
function mats() {
  if (M.concrete) return M;
  M.concrete = cel({ color: PAL.concrete, bands: 3, tint: 0x6f6790 });
  M.concreteMid = cel({ color: PAL.concreteMid, bands: 3, tint: 0x6a6288 });
  M.concreteDark = cel({ color: PAL.concreteDark, bands: 3, tint: 0x655d84 });
  M.metal = cel({ color: PAL.metal, bands: 3, tint: 0x666090 });
  M.metalDark = cel({ color: PAL.metalDark, bands: 3, tint: 0x5c5680 });
  M.drain = cel({ color: PAL.drain, bands: 3, tint: 0x5d5878 });
  M.wood = cel({ color: 0x9c7f5e, bands: 3, tint: 0x5c5680 });
  M.board = cel({ color: 0xe4e0d4, bands: 3, tint: 0x6f6790 });
  M.roof = cel({ color: PAL.roofTeal, bands: 3, tint: 0x514b70 });
  M.yellow = flat({ color: PAL.lineYellow });
  return M;
}

export function buildRokuchome(ctx) {
  const m = mats();
  const gm = groundMats();
  const rng = rngKit(9700);
  const sakura = [];
  const shrubs = [];
  const grove = [];
  const petals = [];
  const cloths = [];

  /* **Everything is paved to one absolute height, and it is 二丁目's.**  The
   * north T next door tops out at `groundY(45.2) + 0.09` and the natural grade
   * under this district runs 0.44 at the south edge to 0.45 over the rest -- so
   * laying each surface at its own `groundY + rise` would leave a two-centimetre
   * lip right across the junction the bus turns at, which is the mistake 四丁目
   * records at its own arm.  One datum, sampled off the surface this district
   * connects to, and every slab thick enough to bury the grade under it. */
  const PY = ctx.groundAt(50.0, 45.6);

  buildPaving(ctx, m, gm, PY);
  buildTurnaround(ctx, m, gm, PY, petals);
  buildCorner(ctx, m, gm, PY, sakura, petals);
  buildNorthLane(ctx, m, gm, PY, shrubs, petals);
  buildParking(ctx, m, gm, PY, petals);
  buildBlocks(ctx, m, gm, PY, shrubs, petals);
  buildShops(ctx, m, gm, PY, cloths, petals);
  buildHouse(ctx, m, gm, PY, shrubs, petals);
  buildEdge(ctx, m, gm, PY, grove, shrubs);

  /* ---------------------------- poles and cabling ----------------------------
   * Down the north verge of the main street and up the west side of 北の道 --
   * never on the side the bus swings through and never inside the circle.  A
   * 0.4 m pole butt takes 1.08 m of clear ground once the player's radius is on
   * it, and the one at (46.55, 31.4) that sealed a route in a *different*
   * district two rounds ago is why this run was drawn on the verge plan before
   * it was written. */
  poleRun(ctx, {
    defs: [
      { x: 53.10, z: 55.30, y: PY, h: 8.4, seed: 9761, armDir: -1, ry: Math.PI, lamp: true },
      { x: 61.30, z: 55.20, y: PY, h: 8.2, seed: 9762, armDir: -1, ry: Math.PI },
      /* the circle's own lamp, behind the waiting island: the only light at the
       * end of the route, and what makes the corner read at dusk */
      { x: 63.20, z: 59.60, y: PY, h: 8.6, seed: 9763, armDir: 1, ry: -Math.PI / 2, lamp: true },
      { x: 49.75, z: 57.40, y: PY, h: 8.2, seed: 9764, armDir: 1, ry: Math.PI / 2 },
      { x: 49.75, z: 63.40, y: PY, h: 8.0, seed: 9765, armDir: 1, ry: Math.PI / 2, lamp: true },
    ],
    chains: [[0, 1], [1, 2], [0, 3], [3, 4]],
    drops: [[1, [57.40, 6.6, 60.90]], [2, [65.80, 4.8, 60.50]], [4, [49.30, 3.0, 63.40]]],
    offsets: [[0, -0.4], [-0.4, 0.3]],
  });

  /* -------------------------------- planting --------------------------------
   * Three jobs and no others: the cherry at the corner node, one on the north
   * lane so the walk up it has something over it, and one on the right-hand
   * roadside verge beyond the turnaround guardrail. */
  sakura.push({ x: 50.30, z: 56.40, y: PY, scale: 1.04, seed: 9772, lean: 0.09, leanDir: 1.4 });
  sakura.push({
    x: 78.00, z: 56.10, y: ctx.groundAt(78.00, 56.10),
    scale: 1.02, seed: 9773, lean: 0.08, leanDir: 2.7,
  });

  return { sakura, shrubs, grove, petals, update: makeWind(ctx, cloths) };
}

/* ------------------------------------------------------------------ *
 * The paved surface.
 *
 * One polygon: the street's rectangle, then `absarc` the long way round the
 * outside of the circle, then back along the north edge.  Extruded 0.16 m and
 * dropped so its top lands on `PY` -- thick enough that the natural grade,
 * which falls to 0.44 under the circle's southern rim, stays buried under it.
 * ------------------------------------------------------------------ */

function buildPaving(ctx, m, gm, PY) {
  const T = 0.16;
  /* Shape space is (x, -z): `ExtrudeGeometry` builds in XY and extrudes along
   * +Z, and `rotateX(-PI/2)` maps (sx, sy, sz) -> (sx, sz, -sy).  So the
   * extrusion becomes height and the shape's y becomes -z, which is why every
   * z below is negated and why the arc is swept clockwise. */
  const s = new THREE.Shape();
  const a0 = Math.atan2(BULB_Z - MAIN_Z0, THROAT_X - BULB_X);      // the south throat
  const a1 = Math.atan2(BULB_Z - MAIN_Z1, THROAT_X - BULB_X);      // the north throat
  s.moveTo(MAIN_X0, -MAIN_Z0);
  s.lineTo(THROAT_X, -MAIN_Z0);
  s.absarc(BULB_X, -BULB_Z, BULB_R, a0, a1, true);
  s.lineTo(MAIN_X0, -MAIN_Z1);
  s.closePath();

  const geo = new THREE.ExtrudeGeometry(s, { depth: T, bevelEnabled: false, curveSegments: 44 });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, PY - T, 0);
  const mesh = new THREE.Mesh(geo, gm.asphalt);
  mesh.receiveShadow = true;
  mesh.name = 'rokuchomePaving';
  ctx.add(mesh);

  /* Platforms.  `heightAt` is a max over axis-aligned boxes, so the circle is
   * approximated by bands *inscribed* in it -- a band that stuck out past the
   * paving would be a 0.06 m ledge standing on bare ground, which is the class
   * of invisible mistake `isSidewalk` was making across the whole world. */
  ctx.platform({ x0: MAIN_X0, x1: THROAT_X + 0.3, z0: MAIN_Z0, z1: MAIN_Z1, top: PY });
  const BANDS = 10;
  for (let i = 0; i < BANDS; i++) {
    const z0 = BULB_Z - BULB_R + (2 * BULB_R * i) / BANDS;
    const z1 = BULB_Z - BULB_R + (2 * BULB_R * (i + 1)) / BANDS;
    const dz = Math.max(Math.abs(z0 - BULB_Z), Math.abs(z1 - BULB_Z));
    const hx = Math.sqrt(Math.max(0, BULB_R * BULB_R - dz * dz));
    if (hx < 0.25) continue;
    ctx.platform({ x0: BULB_X - hx, x1: BULB_X + hx, z0, z1, top: PY });
  }

  /* --------------------------------- kerbs --------------------------------- *
   * Straight along the street and a ring of forty short segments round the
   * circle.  At 8 degrees a chord of a 6.33 m radius sags 15 mm, a seventeenth
   * of the kerb's own width -- so the facets read as a laid kerb rather than as
   * a polygon, which is the art direction anyway.
   *
   * Both straight runs are split where a lane joins: the south one starts east
   * of the connector, the north one east of 北の道.  A kerb across the mouth of
   * a side road is a kerb nothing can get over, and it would have sealed both
   * of them. */
  {
    const parts = [];
    const KY = PY + 0.02;                            // 0.105 proud of the paving
    /* Four runs, not two.  A kerb is split wherever something drives over it:
     * the connector on the south side, and 北の道 *and the 月極's frontage* on
     * the north.  The first draft ran the north kerb straight from the lane
     * mouth to the throat, which put 0.105 m of concrete across the entrance of
     * a car park with two cars in it -- and nothing finds that, because a kerb
     * carries no collider and the flood fill walked over it. */
    const runs = [
      [MAIN_Z0 - 0.13, MOUTH_X + MOUTH_W / 2, THROAT_X],
      [MAIN_Z1 + 0.13, LN_X + LN_W / 2, BAY_X[0] - 1.40],
      [MAIN_Z1 + 0.13, BAY_X[2] + 1.40, THROAT_X],
    ];
    for (const [z, x0, x1] of runs) {
      parts.push({
        geometry: new THREE.BoxGeometry(x1 - x0, 0.17, 0.26),
        matrix: trs((x0 + x1) / 2, KY, z),
      });
    }
    // the dropped kerb across the car park's mouth, 40 mm proud rather than 105
    parts.push({
      geometry: new THREE.BoxGeometry(BAY_X[2] - BAY_X[0] + 2.8, 0.14, 0.26),
      matrix: trs((BAY_X[0] + BAY_X[2]) / 2, PY - 0.03, MAIN_Z1 + 0.13),
    });
    const RK = BULB_R + 0.13;
    const N = 40;
    const from = Math.atan2(MAIN_Z0 - BULB_Z, THROAT_X - BULB_X);
    const to = Math.atan2(MAIN_Z1 - BULB_Z, THROAT_X - BULB_X);
    const step = (to - from) / N;
    for (let i = 0; i < N; i++) {
      const p = from + step * (i + 0.5);
      parts.push({
        geometry: new THREE.BoxGeometry(2 * RK * Math.sin(step / 2) + 0.03, 0.17, 0.26),
        matrix: trs(BULB_X + RK * Math.cos(p), KY, BULB_Z + RK * Math.sin(p), 0, -(Math.PI / 2 + p), 0),
      });
    }
    const km = new THREE.Mesh(bake(parts), gm.curb);
    km.receiveShadow = true;
    ctx.add(km);
  }

  /* 路側帯 both sides and the dashed centre line the bus follows into the
   * circle.  All three stop at the throat: a circle you turn in has no edge
   * lines in it, it has a kerb. */
  laneLine(ctx, { axis: 'x', at: MAIN_Z0 + 0.55, from: MAIN_X0 + 0.8, to: THROAT_X - 0.9, y: PY + 0.012 });
  laneLine(ctx, { axis: 'x', at: MAIN_Z1 - 0.55, from: MAIN_X0 + 0.8, to: THROAT_X - 0.9, y: PY + 0.012 });
  laneLine(ctx, { axis: 'x', at: MAIN_Z, from: MAIN_X0 + 1.2, to: THROAT_X - 1.6, y: PY + 0.012, dash: 1.0 });

  /* the connector up from 二丁目's north T, laid to the same datum so there is
   * no lip where the two surfaces meet */
  pad(ctx, {
    x: MOUTH_X, z: (MOUTH_Z0 + MAIN_Z0) / 2, w: MOUTH_W, d: MAIN_Z0 - MOUTH_Z0,
    y: PY - 0.09, h: 0.09, mat: gm.asphaltWorn, name: 'rokuchomeMouth',
  });
  laneLine(ctx, { axis: 'z', at: MOUTH_X, from: MOUTH_Z0 + 0.5, to: MAIN_Z0 - 1.2, y: PY + 0.012, dash: 0.8 });
  ctx.add(makeMirror({ x: 53.20, z: MAIN_Z0 - 0.85, y: PY, ry: 2.45, h: 2.5, r: 0.42 }));
  ctx.collide(53.04, MAIN_Z0 - 1.01, 53.36, MAIN_Z0 - 0.69, PY + 2.5);
  laneSign(ctx, { x: 49.10, z: MAIN_Z1 + 0.9, y: PY, ry: -Math.PI / 2, variant: 7, h: 2.1 });

  /* --------------------------- gutters and covers ---------------------------
   * Gullies at the kerb line, which is what a kerbed street drains into, plus
   * two manholes and three patches -- a road nobody has ever dug up is a
   * rendering.  Every one of them is inside the carriageway or under a kerb. */
  {
    const parts = [];
    for (const x of [55.0, 59.8, 63.4]) {
      parts.push({
        geometry: new THREE.BoxGeometry(0.62, 0.05, 0.42),
        matrix: trs(x, PY + 0.005, MAIN_Z0 + 0.22),
      });
    }
    for (const x of [53.6, 58.2, 62.8]) {
      parts.push({
        geometry: new THREE.BoxGeometry(0.62, 0.05, 0.42),
        matrix: trs(x, PY + 0.005, MAIN_Z1 - 0.22),
      });
    }
    for (const [x, z] of [[56.2, MAIN_Z], [67.6, 50.2], [70.6, 56.2]]) {
      parts.push({
        geometry: new THREE.CylinderGeometry(0.31, 0.31, 0.05, 12),
        matrix: trs(x, PY + 0.01, z),
      });
    }
    const mesh = new THREE.Mesh(bake(parts), m.drain);
    mesh.receiveShadow = true;
    ctx.add(mesh);
  }
  for (const [x, z, w, d] of [[53.8, 51.2, 2.2, 1.5], [61.2, 53.6, 1.8, 1.2], [69.4, 49.4, 2.4, 1.9]]) {
    const p = box(w, 0.02, d, gm.asphaltWorn, x, PY + 0.014, z);
    p.receiveShadow = true;
    p.userData.noOutline = true;
    ctx.add(p);
  }
}

/* ------------------------------------------------------------------ *
 * The turnaround: the bus box, the waiting island, the shelter, the stop,
 * the mirror, the guardrail and the plates.
 * ------------------------------------------------------------------ */

function buildTurnaround(ctx, m, gm, PY, petals) {
  /* ------------------------------- the bus box -------------------------------
   * 黄色い停止線: the box a service bus stands in, painted rather than kerbed,
   * because on a 転回場 the bus is the only thing that ever stops there and the
   * paint is the whole instruction.  6.6 x 2.8 for a 6.30 x 2.08 vehicle, which
   * is the clearance a real 停車位置 is marked with. */
  {
    const parts = [];
    const t = 0.12;
    for (const s of [-1, 1]) {
      parts.push({
        geometry: new THREE.BoxGeometry(BUS.w, 0.02, t),
        matrix: trs(BUS.x, 0, BUS.z + s * (BUS.d / 2)),
      });
      parts.push({
        geometry: new THREE.BoxGeometry(t, 0.02, BUS.d),
        matrix: trs(BUS.x + s * (BUS.w / 2), 0, BUS.z),
      });
    }
    // the bar across the head, which is what says which way in
    parts.push({
      geometry: new THREE.BoxGeometry(t, 0.02, BUS.d - 0.8),
      matrix: trs(BUS.x - BUS.w / 2 + 1.0, 0, BUS.z),
    });
    const mesh = new THREE.Mesh(bake(parts), m.yellow);
    mesh.position.y = PY + 0.014;
    mesh.userData.noOutline = true;
    ctx.add(mesh);
  }
  /* 駐停車禁止 round the circle's south-west arc, which is the piece of it a
   * delivery would otherwise stop on and block the swing */
  {
    const parts = [];
    const N = 14;
    const from = -2.50, to = -1.05;
    const RK = BULB_R - 0.45;
    const step = (to - from) / N;
    for (let i = 0; i < N; i++) {
      const p = from + step * (i + 0.5);
      parts.push({
        geometry: new THREE.BoxGeometry(2 * RK * Math.sin(step / 2) + 0.02, 0.02, 0.11),
        matrix: trs(BULB_X + RK * Math.cos(p), 0, BULB_Z + RK * Math.sin(p), 0, -(Math.PI / 2 + p), 0),
      });
    }
    const mesh = new THREE.Mesh(bake(parts), m.yellow);
    mesh.position.y = PY + 0.014;
    mesh.userData.noOutline = true;
    ctx.add(mesh);
  }
  /* 徐行 at the throat, read by a driver coming east into the circle */
  {
    const g = new THREE.PlaneGeometry(1.2, 2.3);
    g.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(g, flat({
      color: 0xffffff, map: roadPaint('slow'), transparent: true, depthWrite: false, cache: false,
    }));
    mesh.position.set(61.6, PY + 0.016, MAIN_Z + 1.15);
    mesh.rotation.y = -Math.PI / 2;
    mesh.userData.noOutline = true;
    mesh.renderOrder = 1;
    ctx.add(mesh);
  }

  /* ----------------------------- the waiting island -----------------------------
   * 0.11 m proud of the circle, which is a kerb: a waiting area level with the
   * carriageway is a piece of the carriageway.  The raise is also what keeps it
   * out of the paving's depth buffer -- two surfaces at one height is the
   * z-fight the whole circle was built as a single polygon to avoid. */
  const IY = PY + 0.11;
  {
    const slab = box(ISLE.w, 0.11, ISLE.d, gm.sidewalk, ISLE.x, PY + 0.055, ISLE.z);
    slab.receiveShadow = true;
    ctx.add(slab);
    for (const s of [-1, 1]) {
      ctx.add(box(ISLE.w + 0.16, 0.13, 0.08, gm.curb, ISLE.x, PY + 0.055, ISLE.z + s * (ISLE.d / 2 + 0.04)));
      ctx.add(box(0.08, 0.13, ISLE.d, gm.curb, ISLE.x + s * (ISLE.w / 2 + 0.04), PY + 0.055, ISLE.z));
    }
    ctx.platform({
      x0: ISLE.x - ISLE.w / 2, x1: ISLE.x + ISLE.w / 2,
      z0: ISLE.z - ISLE.d / 2, z1: ISLE.z + ISLE.d / 2, top: IY,
    });
  }

  /* -------------------------------- the shelter --------------------------------
   * 2.9 x 1.4, four posts, a mono-pitch roof falling to the back, a boarded
   * back and one bench.  Deliberately the smallest roofed structure in the
   * world: the brief asked for a 待合所 and not a station, and the whole type is
   * a bus stop with a lid on it.  The roof falls *away* from the road so the
   * drip line is behind whoever is standing under it, and the rake is derived
   * from the fall rather than guessed -- the overbridge stringers got that
   * inverted in both directions. */
  {
    const SW = 2.9, SD = 1.4, H = 2.20, FALL = 0.18;
    const g = new THREE.Group();
    g.name = 'openFrame';
    const parts = { post: [], roof: [], board: [] };
    const push = (k, geo, mx) => parts[k].push({ geometry: geo, matrix: mx });
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const h = H + (sz > 0 ? FALL : 0);
        push('post', new THREE.BoxGeometry(0.09, h, 0.09),
          trs(sx * (SW / 2 - 0.08), h / 2, sz * (SD / 2 - 0.07)));
      }
    }
    // the back panel, boarded to 1.5 m and open above it so the block behind shows
    push('board', new THREE.BoxGeometry(SW - 0.08, 1.42, 0.06), trs(0, 0.78, -(SD / 2 - 0.07)));
    push('board', new THREE.BoxGeometry(SW - 0.08, 0.09, 0.13), trs(0, 1.54, -(SD / 2 - 0.07)));
    // the two side cheeks, which is what stops a shelter reading as a table
    for (const sx of [-1, 1]) {
      push('board', new THREE.BoxGeometry(0.06, 1.42, SD - 0.2), trs(sx * (SW / 2 - 0.08), 0.78, 0));
    }
    const rake = Math.atan2(FALL, SD);
    push('roof', new THREE.BoxGeometry(SW + 0.26, 0.07, SD / Math.cos(rake) + 0.28),
      trs(0, H + FALL / 2 + 0.06, 0, -rake, 0, 0));
    push('roof', new THREE.BoxGeometry(SW + 0.26, 0.12, 0.09), trs(0, H + 0.02, SD / 2 + 0.13));
    for (const key of ['post', 'roof', 'board']) {
      const mesh = new THREE.Mesh(bake(parts[key]),
        key === 'roof' ? m.roof : key === 'board' ? m.board : m.metalDark);
      mesh.castShadow = mesh.receiveShadow = true;
      g.add(mesh);
      if (key !== 'post') hullOutline(mesh, { thickness: 0.003 });
    }
    /* the route board, screwed to the inside of the back panel.  A
     * `PlaneGeometry` faces +z and `flat()` is single-sided, so a plate on the
     * inside of a panel whose face looks -z has to be turned -- which is what
     * took every glimpsed interior off the library. */
    g.add(box(1.14, 0.88, 0.05, m.metal, -0.72, 1.06, -(SD / 2 - 0.10)));
    const rb = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.75),
      flat({ color: 0xffffff, map: busRouteBoard(), cache: false }));
    rb.position.set(-0.72, 1.06, -(SD / 2 - 0.135));
    rb.userData.noOutline = true;
    g.add(rb);

    /* A half turn, so the *opening* faces the bus and the back panel faces the
     * block behind: local -z carries the boarded back and the low end of the
     * roof, so a shelter left at ry = 0 has its back to the vehicle it is a
     * shelter for.  Nothing about that shows in a frame taken from the north.
     *
     * COVER_SOFT on the group: four posts plus cheeks plus a roof bake to
     * a 2.9 x 1.4 x 2.2 AABB that cover would fill, which is the waiting
     * island wall the first flood fill found. Posts, cheeks, back panel
     * and the roof slab stay; the mouth facing the bus is air. skipFit
     * so the island slab cannot grow a post into that opening. */
    const gx = ISLE.x + 0.15;
    const gz = ISLE.z + 0.35;
    g.position.set(gx, IY, gz);
    g.rotation.y = Math.PI;
    ctx.add(g);
    const postHw = 0.06;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const lx = sx * (SW / 2 - 0.08);
        const lz = sz * (SD / 2 - 0.07);
        const px = gx - lx;
        const pz = gz - lz;
        const h = H + (sz > 0 ? FALL : 0);
        ctx.collide(px - postHw, pz - postHw, px + postHw, pz + postHw, IY + h, IY, true);
      }
    }
    const backZ = gz + (SD / 2 - 0.07);
    ctx.collide(gx - (SW / 2 - 0.04), backZ - 0.05, gx + (SW / 2 - 0.04), backZ + 0.05,
      IY + 1.54, IY, true);
    for (const sx of [-1, 1]) {
      const px = gx - sx * (SW / 2 - 0.08);
      const halfD = (SD - 0.2) / 2;
      ctx.collide(px - 0.04, gz - halfD, px + 0.04, gz + halfD, IY + 1.50, IY, true);
    }
    ctx.collide(gx - (SW + 0.26) / 2, gz - (SD + 0.28) / 2,
      gx + (SW + 0.26) / 2, gz + (SD + 0.28) / 2,
      IY + H + FALL + 0.14, IY + H - 0.04, true);
  }
  // the bench inside it, facing the bus, and one on the sunny end of the island
  ctx.add(makeBench({ x: ISLE.x + 0.15, z: ISLE.z + 0.66, y: IY, ry: Math.PI, len: 1.5 }));
  ctx.add(makeBench({ x: ISLE.x - 1.60, z: ISLE.z - 0.55, y: IY, ry: -Math.PI / 2, len: 1.2, back: false }));

  /* --------------------------------- the stop --------------------------------- *
   * At the *front* door of a bus that noses west, not at its middle: `SPEC`
   * puts the minibus's doors at local x 1.72 and -0.36, so a bus at ry = PI has
   * its front door at 69.20 - 1.72 = 67.48.  A stop pole standing level with a
   * bus's back axle is the kind of detail that is wrong in a way nobody can
   * name.
   *
   * **No collider**, the same decision `traffic.js` records for the one outside
   * the library: 0.11 m of post with the player's radius on each side takes
   * 0.79 m out of a 2.4 m island. */
  ctx.add(makeBusStop({ x: 67.40, z: ISLE.z - 0.95, y: IY, ry: Math.PI, h: 2.45, variant: 1 }));

  /* the 転回場 plate at the throat and the mirror on the blind inside of the
   * turn -- the two signs that explain the circle to somebody driving into it */
  ctx.add(makeSignPost({
    x: 64.20, z: MAIN_Z1 + 0.80, y: PY, ry: -Math.PI / 2 - 0.4, h: 2.3, postMat: m.metal,
    plates: [
      { map: warningPlate(3), w: 0.44, h: 0.72, y: 1.78, double: true },
      { map: noParking(), w: 0.44, h: 0.44, y: 1.22 },
    ],
  }));
  ctx.collide(64.04, MAIN_Z1 + 0.64, 64.36, MAIN_Z1 + 0.96, PY + 2.3);

  /* ----------------------- the guardrail on the outer rim -----------------------
   * The circle's east arc is the last made thing before the ground climbs, and
   * anything that misjudges the turn there goes off a made edge onto a bank.
   * Five short runs following the arc rather than one straight one, because a
   * guardrail is bolted to posts on a curve like everything else -- and one
   * collider along the chord, because five overlapping boxes on a curve is five
   * chances to seal the rim. */
  {
    const RK = BULB_R + 0.44, LEN = 3.3;
    for (const p of [-0.5, 0, 0.5]) {
      const x = BULB_X + RK * Math.cos(p), z = BULB_Z + RK * Math.sin(p);
      const ry = -(Math.PI / 2 + p);
      ctx.add(makeGuardrail({ ctx, x, z, y: PY, ry, len: LEN }));
    }
  }
  /* Keep the north throat's frangible sight-line delineator. */
  ctx.add(makeDelineator({ x: THROAT_X - 0.3, z: MAIN_Z1 + 0.55, y: PY, lean: -0.04 }));
  ctx.add(makeCone({ x: 74.9, z: 55.9, y: PY, ry: 0.3 }));
  ctx.add(makeCone({ x: 75.3, z: 54.6, y: PY, ry: -0.5, tilt: 0.05 }));

  /* ---------------------------- the swing marks ----------------------------
   * The one piece of wear the circle gets, and it is the thing that makes a
   * fifteen-metre disc of asphalt read as somewhere a bus turns rather than as
   * a car park with nothing painted on it: two faint arcs at the radii the
   * outer and inner wheels actually trace, laid as short tangential quads.
   * 0.09 opacity and out of the depth buffer, the same terms `tyreMarks` uses
   * -- the brief for the whole world is a *clean* town, so this is a tone
   * change on the paving and not grime. */
  {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    const spots = [];
    for (const [RK, from, to] of [[4.55, -2.05, 1.35], [2.35, -1.75, 1.15]]) {
      const N = Math.round((to - from) / 0.19);
      for (let i = 0; i < N; i++) {
        const p = from + ((to - from) * (i + 0.5)) / N;
        spots.push({
          x: BULB_X + RK * Math.cos(p), z: BULB_Z + RK * Math.sin(p),
          ry: -p, len: 2 * RK * Math.sin((to - from) / (2 * N)) + 0.06,
        });
      }
    }
    const inst = new THREE.InstancedMesh(geo, flat({
      color: 0x6e6880, transparent: true, opacity: 0.09, depthWrite: false, cache: false,
    }), spots.length);
    const d = new THREE.Object3D();
    spots.forEach((sp, i) => {
      d.position.set(sp.x, PY + 0.018, sp.z);
      d.rotation.set(0, sp.ry, 0);
      d.scale.set(sp.len, 1, 0.26);
      d.updateMatrix();
      inst.setMatrixAt(i, d.matrix);
    });
    inst.userData.noOutline = true;
    inst.renderOrder = 1;
    ctx.add(inst);
  }

  petals.push({ x: 67.0, z: 57.6, w: 4.0, d: 1.8, y: PY + 0.02, n: 30 });
}

/* ------------------------------------------------------------------ *
 * The corner node: the machine, the board, the bench, the bed and the
 * cherry, in the pocket between the shops, the street and the circle.
 * ------------------------------------------------------------------ */

function buildCorner(ctx, m, gm, PY, sakura, petals) {
  /* The brief's own list, and it is a composition rather than a collection:
   * everything within four metres of one another on the one piece of ground
   * that everybody arriving at the end of the route walks past.  The machine is
   * the district's interaction -- the new half of the world had two.
   *
   * The pocket is 4.6 x 2.84 and it is bounded on three sides by things that
   * were fixed before it: お弁当's east flank at x 60.20, the street's south
   * kerb at z 49.44, and the circle's south-west arc, which crosses x = 64.90
   * at z = 49.44 and is what stops the pad 0.15 m short of it. */
  pad(ctx, {
    x: (NODE.x0 + NODE.x1) / 2, z: (NODE.z0 + NODE.z1) / 2,
    w: NODE.x1 - NODE.x0, d: NODE.z1 - NODE.z0,
    y: PY - 0.08, h: 0.08, mat: gm.sidewalkAlt, name: 'rokuchomeCorner',
  });
  addVending(ctx, {
    x: 61.30, z: 48.30, y: PY, ry: 0.18, variant: 2, seed: 97,
    label: '自動販売機  ·  buy a drink',
  });
  ctx.add(makeVendBin({ x: 62.30, z: 48.15, y: PY, ry: 0.18 }));
  ctx.add(makeNoticeBoard({ ctx,
    x: 60.95, z: 47.15, y: PY, ry: 0.1, w: 1.6, h: 1.05, y0: 0.82,
    sheets: [
      { map: hallNotice(2), x: -0.4, y: 0.02, w: 0.4, h: 0.54, tilt: 0.02 },
      { map: hallNotice(0), x: 0.08, y: -0.02, w: 0.4, h: 0.54, tilt: -0.015 },
      { map: gomiPlate(1), x: 0.56, y: 0.0, w: 0.42, h: 0.32 },
    ],
  }));
  ctx.add(makeBench({ x: 63.55, z: 48.30, y: PY, ry: 2.85, len: 1.5 }));
  ctx.add(makeFlowerBed({ x: 62.75, z: 47.05, y: PY, w: 1.5, d: 0.8, seed: 9781 }));
  /* the cherry stands in the paving in a proper tree pit, the way the library's
   * two do -- a street tree on a corner this small has nowhere else to be */
  sakura.push({ x: 64.30, z: 47.10, y: PY, scale: 1.1, seed: 9771, lean: 0.11, leanDir: 3.9 });
  {
    const pit = box(1.05, 0.04, 1.05, m.concreteDark, 64.30, PY + 0.021, 47.10);
    pit.receiveShadow = true;
    ctx.add(pit);
  }
  // the bollards that keep the pocket a pocket rather than an extra bay
  bollardRow(ctx, { axis: 'x', at: NODE.z1 - 0.35, from: 60.7, to: 64.5, n: 4, y: PY });
  petals.push({ x: 63.4, z: 47.9, w: 3.0, d: 2.4, y: PY + 0.02, n: 40 });
}

/* ------------------------------------------------------------------ *
 * 北の道 -- the residential lane, the 長屋 on its west side, and the
 * block's shared kit at its south end.
 * ------------------------------------------------------------------ */

function buildNorthLane(ctx, m, gm, PY, shrubs, petals) {
  lane(ctx, {
    axis: 'z', at: LN_X, from: LN_Z0, to: LN_Z1, w: LN_W,
    mat: gm.asphaltWorn, kerb: false, rise: 0.06, name: 'rokuchomeNorthLane',
  });
  /* `lane` registers no platform on its z axis, so without this the lane's own
   * surface reads 60 mm below itself to every prop seated on it -- the
   * `groundY(z) is not the ground` trap, one layer further in. */
  ctx.platform({ x0: LN_X - LN_W / 2, x1: LN_X + LN_W / 2, z0: LN_Z0, z1: LN_Z1, top: PY });
  laneGutter(ctx, {
    axis: 'z', at: LN_X + LN_W / 2 - 0.32, from: LN_Z0 + 0.5, to: LN_Z1 - 0.5, y: PY - 0.06,
    manholes: [58.4], manholeOff: -1.2,
    patches: [[50.6, 57.0, 1.4, 1.1], [51.9, 62.2, 1.2, 0.9]],
  });
  /* The name plate and the mirror stand in the 0.8 m of verge between the lane
   * and the car park, which is what the park was slid 0.5 m east to leave.
   * `laneSign`'s own `mirror:` option was not used: it offsets the mirror in
   * world x/z from the post, so on a run turned a quarter circle the mirror
   * lands *in* the lane -- which is where the first one went, 0.2 m inside the
   * carriageway with its orange back filling the top of the frame.  Placed
   * outright instead, and turned to face the junction it is a mirror for. */
  laneSign(ctx, { x: 53.20, z: LN_Z0 + 0.9, y: PY, ry: 0.62, variant: 8, h: 2.1 });
  ctx.add(makeMirror({ x: 53.25, z: LN_Z0 + 4.0, y: PY, ry: 0.63, h: 2.5, r: 0.44 }));
  /* The dead end.  Three bollards, a 徐行 plate and the retaining wall behind
   * them -- and the bollards carry no collider, so what actually stops a car is
   * the wall and what stops nobody on foot is the row. */
  bollardRow(ctx, { axis: 'x', at: LN_Z1 - 0.45, from: LN_X - 1.25, to: LN_X + 1.25, n: 3, y: PY });
  ctx.add(makeSignPost({
    x: LN_X + 1.55, z: LN_Z1 - 0.45, y: PY, ry: Math.PI, h: 1.9, postMat: m.metal,
    plates: [{ map: warningPlate(2), w: 0.4, h: 0.54, y: 1.5, double: true }],
  }));

  /* ---------------------------- 長屋 二戸 ----------------------------
   * The oldest building in the district and the only thing that predates the
   * estate: two units under one roof with the doors straight onto the lane and
   * a 0.92 m eave over it.  `makeNagaya`'s eave is *outside* its own footprint
   * -- x 44.88..50.12 against a mass of 45.80..49.20 -- which is why the lane's
   * west edge is at 49.40 and the collider is not.  It reads best from the
   * lane's mouth, where the eave line runs away from you with 三丁目's 連棟
   * standing behind it. */
  {
    const p = plotBox(NAGAYA);
    const g = makeNagaya({ ...NAGAYA, y: PY, seed: 9711 });
    ctx.add(g);
    plotCollide(ctx, p, PY + (g.userData.top ?? 3.7));
    dressPlot(ctx, {
      ...NAGAYA, y: PY, seed: 9712, doorAt: g.userData.doorAt ?? 0, gap: 0.9,
      aircon: false, pots: true, umbrella: true, parcel: true, bike: true, mat: true,
      gas: true, lit: true, litY: 1.9,
      clear: (x) => x < LN_X - LN_W / 2 + 0.1,
    });
    ctx.add(makePotShelf({ x: 49.32, z: 60.60, y: PY, ry: Math.PI / 2, w: 1.1, n: 5, seed: 9713 }));
    ctx.add(makeBucket({ x: 49.36, z: 64.55, y: PY, ry: 0.5, tilt: 0.04 }));
    ctx.add(makeBroom({ x: 49.28, z: 64.90, y: PY, ry: Math.PI / 2, lean: 0.16 }));
    ctx.add(makeCatBox({ x: 49.38, z: 58.90, y: PY, ry: 1.3, cat: 0xb0a48e }));
    petals.push({ x: 49.80, z: 62.40, w: 1.2, d: 5.0, y: PY + 0.02, n: 40 });
  }

  /* the shared kit, on the lane's west verge south of the 長屋 where nothing
   * else wants the ground and nothing is in the eave's way */
  refusePoint(ctx, {
    kind: 'house', x: 48.55, z: 57.40, y: PY, ry: Math.PI / 2, plate: 0, seed: 9714,
  });
  ctx.add(makeBikeShelter({ ctx, x: 46.70, z: 56.30, y: PY, ry: 0, w: 2.2, d: 1.8, h: 2.0 }));
  ctx.add(makeBikeRack({ x: 46.70, z: 56.35, y: PY, ry: Math.PI / 2, n: 3, seed: 9715 }));
  ctx.add(makeTapPost({ x: 48.60, z: 59.20, y: PY, ry: Math.PI / 2 }));
  ctx.add(makeBicycle({ x: 49.90, z: 59.60, y: PY, ry: -Math.PI / 2 - 0.05, lean: 0.07, color: 0x8f6fb5 }));
  shrubs.push({ x: 46.30, z: 58.60, y: PY, r: 0.42, count: 3, spread: 1.0, seed: 9716 });
}

/* ------------------------------------------------------------------ *
 * 月極駐車場 -- three bays nose-in off the main street's north kerb.
 * ------------------------------------------------------------------ */

function buildParking(ctx, m, gm, PY, petals) {
  pad(ctx, {
    x: (BAY_X[0] + BAY_X[2]) / 2, z: (BAY_Z0 + BAY_Z1) / 2,
    w: BAY_X[2] - BAY_X[0] + 2.8, d: BAY_Z1 - BAY_Z0,
    y: PY - 0.07, h: 0.07, mat: gm.gravel, name: 'rokuchomeParking',
  });
  /* **Both of these are authored with the car nosing in from local +z**, and
   * here the cars come off the street at the *low* z end -- so both take a half
   * turn.  Getting it wrong puts `bayPaint`'s head line across the mouth of the
   * bay and turns `makeWheelStops`' numbered stake to face the wall it is
   * standing against, and neither shows in a rendered frame from the street. */
  BAY_X.forEach((x, i) => {
    bayPaint(ctx, { x, z: (BAY_Z0 + BAY_Z1) / 2, w: 2.4, d: 4.4, y: PY, ry: Math.PI, head: true });
    ctx.add(makeWheelStops({
      x, z: BAY_Z1 - 0.75, y: PY, ry: Math.PI, n: 1, gauge: 1.5,
      plateMaps: [bayNumber(i + 1)],
    }));
  });
  wallRun(ctx, {
    axis: 'x', at: BAY_WALL, from: BAY_X[0] - 1.5, to: BAY_X[2] + 1.4,
    y: PY, h: 1.15, t: 0.18, panel: 2.4, mat: m.concreteMid, name: 'rokuchomeParkWall',
  });
  ctx.add(makeSignPost({
    x: BAY_X[0] - 1.45, z: BAY_Z0 + 1.2, y: PY, ry: -Math.PI / 2 - 0.15, h: 2.6, postMat: m.metal,
    plates: [{ map: parkingSign(), w: 0.58, h: 0.78, y: 2.0, double: true }],
  }));
  ctx.collide(BAY_X[0] - 1.61, BAY_Z0 + 1.04, BAY_X[0] - 1.29, BAY_Z0 + 1.36, PY + 2.6);
  ctx.add(makeIvy({
    x: BAY_X[2] + 0.9, z: BAY_WALL, y: PY, ry: Math.PI, len: 2.2, top: 1.2, drop: 0.7, seed: 9721,
  }));
  ctx.add(makeCone({ x: BAY_X[2] + 1.3, z: BAY_Z0 + 0.8, y: PY, ry: 0.2 }));
  petals.push({ x: BAY_X[0], z: BAY_Z1 - 1.4, w: 2.2, d: 2.4, y: PY + 0.02, n: 26 });
}

/* ------------------------------------------------------------------ *
 * The three blocks: コーポ ひがし, 第二 さくら荘, 連棟 三戸.
 * ------------------------------------------------------------------ */

function buildBlocks(ctx, m, gm, PY, shrubs, petals) {
  /* --------------------------- コーポ ひがし --------------------------- *
   * Three storeys, three flats a floor, `face: 'z-'` -- which puts the access
   * gallery on the *street* side and the balconies on the far one.  That is the
   * right way round twice over: a gallery is how you get in and it wants to
   * face the road, and the sun in this world is at (-52, 62, 56), so a balcony
   * on the +z elevation is a balcony in the sun.  The other way up would have
   * given the street a wall of washing and the flats a north light. */
  {
    const p = plotBox(CORP);
    const g = makeWalkup({
      ...CORP, y: PY, floors: 3, units: 3, fh: 2.70, seed: 9731, wall: 4, plate: 6, ctx,
    });
    ctx.add(g);

    /* the forecourt: 2.1 m between the car park's back wall and the block, and
     * that number is the reason the block is 4.4 m deep and not 4.8.  At 4.8 it
     * was 1.5 m, which after two player radii is 0.82 m with a mailbox bank in
     * it -- the flood fill read the whole gallery unreachable and nine frames
     * of it looked fine. */
    pad(ctx, {
      x: 56.90, z: 60.35, w: 8.0, d: 1.8, y: PY - 0.07, h: 0.07,
      mat: gm.concrete, name: 'corpForecourt',
    });
    ctx.add(makeMailboxBank({ x: 54.60, z: 61.12, y: PY, ry: Math.PI, cols: 3, rows: 3 }));
    ctx.add(makeLockerBank({ x: 56.30, z: 61.02, y: PY, ry: Math.PI, seed: 9732 }));
    ctx.add(makeBicycle({ x: 59.40, z: 61.00, y: PY, ry: 0.04, lean: 0.07, color: 0x4f8f6a }));
    ctx.add(makeBicycle({ x: 60.30, z: 59.90, y: PY, ry: -0.03, lean: -0.06, color: 0x9c5a4a }));
    ctx.add(makeNoticeBoard({ ctx,
      x: 58.20, z: 59.72, y: PY, ry: 0, w: 1.1, h: 0.8, y0: 0.9,
      sheets: [{ map: hallNotice(1), x: -0.22, y: 0.0, w: 0.34, h: 0.48, tilt: 0.02 },
        { map: paperSheet(), x: 0.24, y: -0.02, w: 0.3, h: 0.42, tilt: -0.03 }],
    }));
    ctx.add(makeGasMeter({ x: 53.86, z: 62.80, y: PY, ry: -Math.PI / 2 }));
    ctx.add(makeStorageShed({ x: 55.00, z: 66.40, y: PY, ry: Math.PI, seed: 9734 }));
    ctx.add(makeDryingRack({ x: 57.60, z: 66.50, y: PY, ry: Math.PI / 2, seed: 9735 }));
    ctx.add(makeAircon({ x: 60.20, z: 66.04, y: PY, ry: 0, w: 0.84, h: 0.6 }));
    shrubs.push({ x: 53.40, z: 66.50, y: PY, r: 0.42, count: 3, spread: 1.1, seed: 9736 });
    petals.push({ x: 56.90, z: 60.35, w: 7.6, d: 1.7, y: PY + 0.02, n: 34 });
  }

  /* --------------------------- 第二 さくら荘 ---------------------------
   * The 外廊下 block the brief asked for, and it is two storeys rather than
   * three on purpose: it stands on the circle's north rim, and a third floor
   * there would close the one view in the district worth having -- west down
   * the street, over the bus, with the hill behind you.  Four flats, one stair,
   * a gallery you can count the doors on. */
  {
    const p = plotBox(MINI);
    const g = makeWalkup({
      ...MINI, y: PY, floors: 2, units: 2, fh: 2.62, seed: 9741, wall: 1, plate: 8, ctx,
    });
    ctx.add(g);

    pad(ctx, {
      x: 65.80, z: 60.10, w: 6.2, d: 1.4, y: PY - 0.07, h: 0.07,
      mat: gm.concrete, name: 'miniForecourt',
    });
    ctx.add(makeMailboxBank({ x: 63.30, z: 60.62, y: PY, ry: Math.PI, cols: 2, rows: 2 }));
    ctx.add(makeBins({ x: 68.30, z: 59.30, y: PY, ry: 0 }));
    ctx.add(makeLaundryPole({ ctx, x: 65.80, z: 66.30, y: PY, ry: 0, len: 3.0, seed: 9743 }));
    ctx.add(makeAircon({ x: 63.60, z: 65.84, y: PY, ry: 0, w: 0.8, h: 0.56 }));
    ctx.add(makePlanter({ x: 62.65, z: 60.30, y: PY, r: 0.24, flower: true, seed: 9744, n: 5 }));
    /* The block's bicycles are on the *island* side of its forecourt, parked
     * along the frontage: a rack here would be nose-in across a 1.4 m strip,
     * and a bike in a rack needs half a wheelbase -- 0.95 m -- clear of the
     * wall behind it, which this strip does not have. */
    ctx.add(makeBicycle({ x: 67.20, z: 60.05, y: PY, ry: 0.05, lean: 0.06, color: 0x3f6f9c }));
  }

  /* ----------------------------- 連棟 三戸 -----------------------------
   * Three units, one roof, and their aprons open straight onto the circle's
   * north rim -- no gate, a metre of paving and then the road, which is what a
   * 建売 terrace on a turning head actually has.  Variety per unit and
   * material-free, the `makeTerrace` rule: same wall, same roof, same window,
   * different door, different clutter. */
  {
    const p = plotBox({ ...TERR, w: TERR.units * TERR.unitW });
    const g = makeTerrace({ ...TERR, y: PY, seed: 9751, wall: 3, roof: 1, door: 1, plate: 7 });
    ctx.add(g);
    plotCollide(ctx, p, PY + (g.userData.top ?? 6.4));

    for (let i = 0; i < TERR.units; i++) {
      const x = TERR.x + (i - (TERR.units - 1) / 2) * TERR.unitW;
      pad(ctx, {
        x, z: 59.25, w: TERR.unitW - 0.14, d: 1.3, y: PY - 0.06, h: 0.06,
        mat: gm.concrete, name: 'terrApron',
      });
      if (i === 0) {
        ctx.add(makeDoormat({ x, z: 59.76, y: PY, ry: Math.PI, w: 0.56, d: 0.34 }));
        ctx.add(makeUmbrellaStand({ x: 71.20, z: 59.62, y: PY, n: 3, seed: 9752 }));
      } else if (i === 1) {
        ctx.add(makeBicycle({ x: 73.97, z: 58.96, y: PY, ry: Math.PI / 2, lean: -0.06, color: 0xd8a03c }));
        ctx.add(makeKidBike({ x: 75.35, z: 58.88, y: PY, ry: 0, color: 0x9c5a4a }));
      } else {
        ctx.add(makePlanter({ x: x - 0.9, z: 59.48, y: PY, r: 0.22, flower: true, seed: 9754, n: 5 }));
        ctx.add(makePlanter({ x: x - 0.48, z: 59.34, y: PY, r: 0.18, flower: false, seed: 9755, n: 4 }));
        ctx.add(makeDeliveryBox({ x: x + 0.95, z: 59.54, y: PY, ry: Math.PI }));
      }
      ctx.add(makeAircon({ x, z: 65.44, y: PY, ry: 0, w: 0.78, h: 0.56 }));
    }
    ctx.add(makeLaundryPole({ ctx, x: 72.60, z: 66.30, y: PY, ry: Math.PI / 2, len: 3.2, seed: 9756 }));
    ctx.add(makeKitchenGarden({ x: 76.80, z: 66.40, y: PY, ry: 0, w: 2.2, d: 1.1, seed: 9757 }));
    ctx.add(makeGasMeter({ x: 70.14, z: 62.60, y: PY, ry: -Math.PI / 2 }));
    petals.push({ x: 74.40, z: 59.40, w: 7.8, d: 1.3, y: PY + 0.02, n: 40 });
  }
}

/* ------------------------------------------------------------------ *
 * The two shops on the main street's south side.
 * ------------------------------------------------------------------ */

function buildShops(ctx, m, gm, PY, cloths, petals) {
  /* Both face +z, which in this world is the sunlit elevation -- and that is
   * the whole reason the shops are on this side of the street and the housing
   * is on the other.  A 弁当屋 whose window is in permanent shade is a 弁当屋
   * nobody can see the food in, and the two frontages catching the sun across
   * the road from a shaded row of flats is the district's one strong section.
   *
   * `makeShop` adds itself to the scene and registers its own collider, so
   * neither is done here. */
  pad(ctx, { x: 54.85, z: 49.20, w: 3.3, d: 0.5, y: PY - 0.07, h: 0.07, mat: gm.sidewalkAlt, name: 'zakkaWalk' });
  pad(ctx, { x: 58.50, z: 49.07, w: 3.6, d: 0.75, y: PY - 0.07, h: 0.07, mat: gm.sidewalkAlt, name: 'bentoWalk' });

  makeShop(ctx, {
    ...BENTO, y: PY, kind: 'bento', floors: 1, h1: 3.05, seed: 9761,
    wall: 1, roof: 2, awning: 3, shutter: 0, openW: 2.5, recess: 0.85,
  });
  ctx.add(makeShopFlag({ ctx, x: 57.05, z: 48.86, y: PY, ry: 0, variant: 0 }));
  ctx.add(makeMilkCrate({ x: 59.95, z: 48.90, y: PY, ry: 0.2, n: 2, seed: 9762 }));
  ctx.add(makeRecycleBox({ x: 60.35, z: 46.20, y: PY, ry: Math.PI / 2 }));
  /* the noren over its doorway, hung 0.16 m clear of the header.  Two coplanar
   * sheets is a coin toss, not a layer -- 蓬莱湯's 男湯/女湯 curtain went in at
   * exactly the doorway board's face and came out as a flat black rectangle. */
  cloths.push({
    x: BENTO.x, y: PY + 2.26, z: BENTO.z + BENTO.d / 2 + 0.16, ry: 0,
    w: 2.1, h: 0.62, map: norenTex('bento'), amp: 0.10, rate: 0.66, phase: 0.4,
  });

  makeShop(ctx, {
    ...ZAKKA, y: PY, kind: 'zakka', floors: 1, h1: 2.92, seed: 9765,
    wall: 4, roof: 0, awning: 0, shutter: 0.22, openW: 2.3, recess: 0.8,
  });
  ctx.add(makeCrates({ x: 56.25, z: 49.22, y: PY, n: 3, seed: 9766, ry: 0.1 }));
  ctx.add(makeUmbrellaStand({ x: 53.60, z: 49.20, y: PY, n: 4, seed: 9767 }));
  ctx.add(makeBroom({ x: 53.32, z: 49.05, y: PY, ry: 0.3, lean: 0.2 }));
  cloths.push({
    x: 53.55, y: PY + 2.5, z: ZAKKA.z + ZAKKA.d / 2 + 0.18, ry: 0,
    w: 0.42, h: 0.95, map: flagTex(1), amp: 0.15, rate: 1.16, phase: 2.1,
  });

  /* the yellow line along the shops' frontage: the one stretch where a parked
   * car would push the bus over the centre line */
  kerbLine(ctx, {
    axis: 'x', at: MAIN_Z0 + 0.30, from: 53.2, to: 57.4, y: PY + 0.012, mat: m.yellow,
  });
  ctx.add(makeBicycle({ x: 56.60, z: 49.05, y: PY, ry: Math.PI / 2 + 0.06, lean: 0.07, color: 0x3f6f9c }));
  petals.push({ x: 57.20, z: 49.10, w: 6.2, d: 0.9, y: PY + 0.02, n: 26 });
}

/* ------------------------------------------------------------------ *
 * The one detached house, opening onto the circle's south rim.
 * ------------------------------------------------------------------ */

function buildHouse(ctx, m, gm, PY, shrubs, petals) {
  /* The only parcel in the district with a garden in it: 4.2 x 4.6 of house, a
   * 0.9 m front garden and a boundary on three sides, with the circle's south
   * rim two metres in front of the gate.  It faces +z, so its frontage is
   * sunlit and it is the first building you see coming into the turnaround from
   * the west -- which is the job it is here to do. */
  const y = ctx.groundAt(HOUSE_E.x, HOUSE_E.z);
  const g = makeHouse({
    ...HOUSE_E, y, floors: 2, seed: 9771, wall: 3, roof: 1, roofKind: 'gable',
  });
  ctx.add(g);
  ctx.collide(HOUSE_E.x - HOUSE_E.w / 2 - 0.12, HOUSE_E.z - HOUSE_E.d / 2 - 0.12,
    HOUSE_E.x + HOUSE_E.w / 2 + 0.12, HOUSE_E.z + HOUSE_E.d / 2 + 0.12, y + 5.6);
  plotWall(ctx, {
    x0: 63.50, x1: 68.30, z0: 40.70, z1: 46.20, y, kind: 'block', h: 0.9,
    sides: ['x-', 'x+', 'z+'],
    /* 1.9 m and not the 1.2 that reads well on the page: `plotWall` splits its
     * run at `at ± w/2` and its gate posts carry no collider, so the usable
     * opening is `w` less 0.68 m.  Three gates went in at 1.1-1.2 m one round
     * ago and not one of them could be walked through. */
    gate: { side: 'z+', at: 65.90, w: 1.9 },
  });
  stepStones(ctx, { from: [65.90, 45.95], to: [65.90, 45.72], y: y + 0.02, n: 2, seed: 9772 });
  dressPlot(ctx, {
    ...HOUSE_E, y, seed: 9773, doorAt: 0, gap: 1.0, gateAt: 0,
    // The front wall is only 0.5 m off the facade, so place the pots outside
    // its coping rather than through the wall's centre line.
    aircon: true, airconAt: -1.5, pots: true, potOut: 0.9, potShift: -0.8, umbrella: false, parcel: true,
    mat: true, gas: true, bike: true, lit: true, litY: 3.7,
  });
  ctx.add(makeKitchenGarden({
    x: 64.30, z: 41.50, y: ctx.groundAt(64.30, 41.50), ry: 0, w: 1.5, d: 1.0, seed: 9774,
  }));
  ctx.add(makeBallBox({ x: 67.65, z: 41.30, y: ctx.groundAt(67.65, 41.30), ry: -Math.PI / 2, seed: 9775 }));
  makeChalkMarks(ctx, [
    { x: 65.6, z: 47.2, y: PY, scale: 0.9, ry: 0.3 },
    { x: 66.8, z: 46.9, y: PY, scale: 0.7, ry: -0.5 },
  ]);
  /* the shops' backs, which is all this ground is on the west side, and the
   * planting that stops the estate ending in a line of blank render */
  ctx.add(makeAircon({ x: 60.36, z: 46.10, y: ctx.groundAt(60.36, 46.10), ry: Math.PI / 2, w: 0.8, h: 0.56 }));
  ctx.add(makeCrates({ x: 59.90, z: 44.60, y: ctx.groundAt(59.90, 44.60), n: 4, seed: 9777, ry: -0.2 }));
  ctx.add(makeMilkCrate({ x: 57.60, z: 44.80, y: ctx.groundAt(57.60, 44.80), ry: 0.4, n: 3, seed: 9778 }));
  shrubs.push({ x: 55.20, z: 44.40, y: ctx.groundAt(55.20, 44.40), r: 0.46, count: 3, spread: 1.2, seed: 9779 });
  shrubs.push({ x: 62.20, z: 43.80, y: ctx.groundAt(62.20, 43.80), r: 0.44, count: 3, spread: 1.1, seed: 9780 });
  petals.push({ x: 65.90, z: 46.60, w: 3.4, d: 1.6, y: PY + 0.02, n: 24 });
}

/* ------------------------------------------------------------------ *
 * The block's back edge: the retaining wall, the hedge above it and the
 * grove on the bank behind.
 * ------------------------------------------------------------------ */

function buildEdge(ctx, m, gm, PY, grove, shrubs) {
  /* **The wall is the reason the estate ends.**  `planet.js`'s pad stops at
   * z = 66; the ground is 0.6 m up by z = 67, 1.5 by z = 69 and 2.4 by z = 72,
   * so what is behind this line is a cut slope and not a field.  1.6 m of 擁壁
   * with a hedge on the shoulder above it is what a Japanese 造成地 has along
   * that boundary, and it is also the cheapest possible answer to "why does the
   * town stop here". */
  wallRun(ctx, {
    axis: 'x', at: WALL_Z, from: 49.20, to: 79.20, y: PY, h: WALL_H, t: 0.30, panel: 3.0,
    mat: m.concreteMid, name: 'rokuchomeRetaining',
  });
  /* 転落防止柵 on top of it, and a mesh fence rather than a hedge because a
   * hedge wants soil at its own base: the retained ground only reaches the
   * wall's top at about z = 69.2, so anything planted on the coping would be a
   * metre in the air.  The fence also does the better job -- from the
   * turnaround it is a pale lattice line with the green rising behind it, which
   * is what a 造成地 boundary actually reads as. */
  meshFence(ctx, {
    axis: 'x', at: WALL_Z, from: 49.20, to: 79.20, y: PY + WALL_H, h: 1.0,
    spacing: 2.0, collide: false,
  });
  /* the weep holes and the channel at its foot, which is the one detail that
   * says a retaining wall is retaining something */
  {
    const parts = [];
    for (let x = 51.0; x < 78.6; x += 2.6) {
      parts.push({
        geometry: new THREE.CylinderGeometry(0.055, 0.055, 0.34, 8),
        matrix: trs(x, PY + 0.36, WALL_Z - 0.04, Math.PI / 2, 0, 0),
      });
    }
    for (let x = 49.4; x < 78.8; x += 3.2) {
      parts.push({
        geometry: new THREE.BoxGeometry(3.0, 0.05, 0.34),
        matrix: trs(x + 1.5, PY + 0.005, WALL_Z - 0.40),
      });
    }
    const mesh = new THREE.Mesh(bake(parts), m.drain);
    mesh.receiveShadow = true;
    ctx.add(mesh);
  }

  /* the west boundary against 三丁目, and the east one where the made ground
   * runs out past the terrace */
  /* **The west boundary runs across the alley, not along it.**  On `axis: 'z'` at
   * x = 49.10 it stood on end in the mouth of the walk between 三丁目's back land
   * and this block, 0.3 m off the connector's kerb, and read as a green wall
   * standing in the open with the passage going past it.  Turned a quarter circle
   * it does the job a boundary hedge does: 3.4 m along x, closing the 5 m of dead
   * ground between 片流れの平屋's back wall at z = 54.5 and the 長屋 at 59.48.
   * It *does* seal that alley, which is fine -- it is back land with nothing in
   * it, and the 長屋's own doors are on 北の道. */
  hedgeRun(ctx, { axis: 'x', at: 55.20, from: 45.60, to: 49.00, y: PY, h: 0.9, t: 0.44, seed: 9792 });
  hedgeRun(ctx, { axis: 'z', at: 79.10, from: 58.60, to: 66.60, y: PY, h: 0.95, t: 0.46, seed: 9793 });

  /* The grove on the bank.  A line rather than a scatter, because from the
   * turnaround it *is* the horizon: the ground behind it climbs away and this
   * is the last built thing before it.  Nothing over scale 1.7 -- a grove tree
   * collides with a 1.42 m box at 1.75, and although the bank is not walkable
   * anyway, the canopies are what close the sky and a heavier one would start
   * shading the terrace's back rooms. */
  const bank = (x, z, scale, seed, spread) => grove.push({
    x, z, y: ctx.groundAt(x, z), scale, seed, spread,
  });
  bank(51.8, 68.6, 1.55, 9801, 1.15);
  bank(57.0, 69.8, 1.70, 9802, 1.25);
  bank(62.6, 69.0, 1.50, 9803, 1.10);
  bank(68.0, 70.2, 1.65, 9804, 1.20);
  bank(73.6, 68.8, 1.45, 9805, 1.10);
  bank(78.8, 70.0, 1.60, 9806, 1.20);
  [[54.4, 68.0], [60.2, 68.4], [65.8, 67.8], [71.4, 68.2], [76.6, 68.0]]
    .forEach(([x, z], i) => shrubs.push({
      x, z, y: ctx.groundAt(x, z), r: 0.5, count: 4, spread: 1.5, seed: 9811 + i,
    }));
}

/* ------------------------------------------------------------------ *
 * The cloth in the wind.
 *
 * Same rig as `details.js`, and for the same reason: the outer group carries
 * the placement and is the only thing the bake touches, and the inner pivot --
 * skipped by the bake because it sits under a rigid group -- is what the wind
 * actually turns.  Driving `rotation.x` on the outer group is what hung every
 * noren on the shopping street sideways: a re-seated rig carries its placement
 * as a quaternion, and for anything turned a quarter circle the Euler X is
 * within a degree of ±90, so writing to it throws the placement away.
 * ------------------------------------------------------------------ */

function makeWind(ctx, specs) {
  if (!specs.length) return undefined;
  const rigs = [];
  const railMat = cel({ color: PAL.metalDark, bands: 3, tint: 0x5c5680 });
  for (const o of specs) {
    const g = new THREE.Group();
    const piv = new THREE.Group();
    g.add(piv);
    const cloth = new THREE.Mesh(
      new THREE.PlaneGeometry(o.w, o.h),
      flat({ color: 0xffffff, map: o.map, side: THREE.DoubleSide, cache: false })
    );
    cloth.position.y = -o.h / 2;
    cloth.castShadow = true;
    piv.add(cloth);
    g.add(box(o.w + 0.14, 0.05, 0.05, railMat, 0, 0.02, 0));
    g.position.set(o.x, o.y, o.z);
    g.rotation.y = o.ry ?? 0;
    g.userData.planetRigid = true;
    ctx.add(g);
    rigs.push({ obj: piv, amp: o.amp ?? 0.09, rate: o.rate ?? 0.7, phase: o.phase ?? 0 });
  }
  let t = 0;
  return (dt) => {
    t += dt;
    for (const c of rigs) {
      const s = Math.sin(t * c.rate + c.phase) * 0.75 + Math.sin(t * c.rate * 3.3 + c.phase) * 0.25;
      c.obj.rotation.x = s * c.amp;
    }
  };
}
