import * as THREE from 'three';
import { PAL } from '../core/palette.js';
import { cel, flat } from '../core/toon.js';
import { hallNotice, warningPlate } from '../core/textures.js';
import { box, cyl, bake, trs, rngKit } from '../core/util.js';
import { hullOutline } from '../core/outline.js';
import { groundY } from './street.js';
import { pad, lane, laneLine, railing, dapple, groundMats } from './ground.js';
import {
  plotBox, plotCollide, plotWall, hedgeRun, stepStones, refusePoint, dressPlot,
  laneGutter, laneSign, poleRun,
} from './plots.js';
import { makeHall } from './blocks.js';
import { makeWalkup, makeAtticHouse, makeCarport, makeBikeShelter } from './housing.js';
import {
  makeBench, makeBikeRack, makeBicycle, makeNoticeBoard, makePlanter, makeFlowerBed,
  makeMailboxBank, makeSignPost, makeMirror, makeTapPost, makeStorageShed, makeBucket,
  makeBroom, makeCrates, makeMilkCrate, makeIvy, makeLaundryPole, makeAircon,
  makeLoosePaper, makeCone, makeDoormat,
} from './props.js';
import {
  makeWheelStops, makeBallBox, makeChalkMarks, makeKidBike, makeDryingRack,
  makeKitchenGarden,
} from './streetprops.js';

/* ------------------------------------------------------------------ *
 * ひばり台四丁目 -- the quiet family district north of the library.
 *
 * Two things make this a *community* rather than an estate, and everything
 * else here is arranged around them: the neighbourhood association hall and
 * the pocket park.  The hall's notices, its folded tables and its eight parked
 * bicycles are how you say people organise here without putting anybody in the
 * frame; an empty small park at four in the afternoon does more for the mood of
 * a place than any architecture.
 *
 * The land is the whole design problem, so it is worth writing down.  The
 * envelope is x 1..30, z 49..80, and by the time this block runs almost all of
 * it is already spoken for -- ひばり台図書館 (x 10.9..20.7, z 50.5..57.7), its
 * forecourt, the corner cluster, **米・酒 なかの (x 1.95..7.05, z 49.15..54.65)**,
 * ひばり台コーポ and its open stair (x 22.6..30.1 down to z 64.0), the coin
 * parking, and the lanes this block lays.  The shop is in bold because the
 * first draft of this list left it out, and a list of what the land is spoken
 * for is worth nothing if it is not complete: the lane went through the shop,
 * the lamp pole stood in its shop floor, the boundary hedge went in a 0.65 m
 * slot, and the block was reachable only through a 0.49 m pinch.  See `LN_Z0`.
 * What is left is *two strips*:
 *
 *   zone A   x 8.8..22.6, z 57.7..68.3 -- 10.6 m deep, between the library's
 *            north wall and the east arm.  Deep enough for one building with a
 *            forecourt in front of it, which is exactly what a hall needs.
 *   the north parcel  x 1..30, z 71.6..80 -- 8.4 m deep, north of the arm.
 *            Deep enough for one row of dwellings with a front garden and
 *            nothing else, so this is where the housing goes.
 *
 * That arithmetic is why there are three buildings here and not eight.  A
 * `makeHall` cannot be narrower than about 9.05 m (below that its own window
 * run collides with its notice case -- see `porchAt` below), so it does not fit
 * across the north parcel in any orientation, and a terrace with parking bays
 * needs 6.2 + 4.6 = 10.8 m of depth, which only zone A has.  The hall takes
 * zone A; the north parcel takes a small walk-up, a 二階半 house, a carport bay
 * and the park.  Everything else in the envelope is a *gap*, and the gaps are
 * doing as much work as the buildings: a drying ground behind the コーポ, an
 * allotment and a tin store in a break in the west hedge, a vegetable bed and
 * a shared tap down the side slot, a thicket closing the arm.
 *
 * **The library's west flank is load-bearing composition** (NEXT.md records it),
 * so there is no building west of x = 8 between z = 49 and z = 62 -- that
 * stretch is dressed instead, with a hedge, a long bed, two street cherries in
 * pits, a bench and two lamps.  The lane's east side is built and its west side
 * is open, so the walk north is asymmetric, and the long view is the lane
 * itself: 22 m of it, closing on the park's railing and its three cherries.
 *
 * This is the kept street of the new work, so it gets what a kept street has:
 * edge lines, a gutter and its manholes, tree pits, three lamps on poles with
 * their cabling, a name plate at the mouth, a mirror at the junction and kerbs
 * on the arm.  The back lanes elsewhere deliberately have none of that.
 *
 * FLOODFILL -- every one of these must be reachable on foot from the spawn:
 *   [-3.4, 55.0]  the main road's last stretch, north of where street.js stops
 *   [-3.4, 58.9]  the road head, behind the barrier's footway return
 *   [2.0, 56.9]   the arm, at the T
 *   [6.0, 57.0]   the corner where the arm turns into the lane
 *   [8.2, 56.6]   なかの's back yard, in through the lane's south end
 *   [6.0, 66.4]   the lane beside the hall's flank and its notice board
 *   [6.1, 70.0]   the junction of the lane and the east arm
 *   [12.0, 66.0]  the hall's porch, on its slab under the canopy
 *   [15.4, 67.4]  the hall's forecourt, under the bike shelter
 *   [20.2, 66.6]  the association's two car bays
 *   [25.4, 66.0]  the コーポ's drying ground, through its gate
 *   [26.4, 70.0]  the east arm's far end, at the thicket
 *   [5.6, 76.2]   the middle of the pocket park
 *   [3.0, 76.8]   the park's children's bicycle shelter.  Was [3.0, 73.2]; the
 *                 park's south-west corner is ひばり台七丁目's link lane now and
 *                 the shelter moved north with it -- see `buildPark`.
 *   [2.60, 73.90] the link lane, at the park's new corner
 *   [14.0, 72.3]  ハイツ ひばり's frontage strip
 *   [23.0, 72.7]  the 二階半's front garden, in through its gate at x 25.4
 *   [20.3, 76.5]  the utility slot between the two, with the bed and the tap
 *   [28.3, 71.4]  the approach to the carport bay at the east end of the row.
 *                 Was [28.3, 74.0], which is under the carport itself -- and
 *                 there is a car parked in it now (`traffic.js`), so the probe
 *                 moved to the ground in front of it.  A bay with a vehicle in
 *                 it is not walkable and is not meant to be.
 * ------------------------------------------------------------------ */

/* the lane and its east arm */
const LN_X = 6.0;
const LN_W = 3.4;
/* The lane starts at z = 55.6 and not at the corner pad, and the reason is a
 * building this block's first draft did not account for: **米・酒 なかの**
 * (`northblock.js`, `SHOP = { x: 4.5, z: 51.9, w: 5.4, d: 5.0 }`, facing 'x-')
 * stands at x 1.95..7.05, z 49.15..54.65 -- squarely across the lane's first
 * six metres.  The draft's list of what the envelope was already spoken for
 * named the library, the corner cluster, ひばり台コーポ and the coin parking and
 * missed the corner shop, so the lane was laid through it, the lamp pole stood
 * inside its shop floor, and the block's only connection to the world was a
 * 0.49 m squeeze between a grove tree and the library's boundary hedge.
 *
 * A corner shop at the head of a road with the lane going round the back of it
 * is the ordinary arrangement anyway, so the lane keeps its centreline and
 * gains a **mouth**: the main road's last stretch, a T junction north of the
 * shop, and a west arm along the shop's back into the lane proper. */
const LN_Z0 = 55.6;
const LN_Z1 = 72.0;
const ARM_Z = 70.0;
const ARM_W = 3.0;
const ARM_X0 = 7.9;                 // starts clear of the lane so no kerb crosses the junction
const ARM_X1 = 28.0;

/* ------------------------------ the mouth ------------------------------ *
 * `street.js` runs the carriageway from Z_MIN to `Z_MAX = 52` and stops, so
 * north of the shop the road simply ended in a field -- which is what the
 * block was walking across.  The road gets its last stretch here instead: 6.4 m
 * more of asphalt on the same flat section (`centerX` is -3.40 and `groundY`
 * 0.45 for every z out here, so it is one rectangle and it matches exactly),
 * both footways carried on, the T where the arm leaves, and a proper terminus.
 *
 * The arm is 2.8 m against the lane's 3.4: a spur off a road is narrower than
 * what it serves, and the difference is what tells you which of the two is the
 * through route.  Its south edge lands 0.85 m off なかの's back wall, which is
 * the shop's service strip -- meters, a stack of crates, the extract fan -- and
 * is exactly the half-private leftover the brief asks these blocks for. */
const RD_C = -3.40;                 // centerX for every z > 44
const RD_HALF = 3.15;               // ROAD_HALF
const RD_Z1 = 58.40;                // where the carriageway finally stops
const MO_Z = 56.90;                 // the arm's centreline
const MO_W = 2.80;
const MO_X0 = -0.25;                // the road's east kerb line
const MO_X1 = 7.70;                 // the lane's east edge

/* the hall, in zone A, frontage facing +z onto the arm */
const HALL = { x: 13.4, z: 61.6, w: 9.2, d: 6.6, face: 'z+' };
/* `porchAt` is not decoration.  `makeHall` puts its glazed notice case at
 * `porchAt - PORCH_W/2 - 1.0`, and with the default `porchAt` on a 9.2 m
 * frontage that lands at -4.7 on a wall that stops at -4.6: the case hangs off
 * the west corner with half of it in mid-air.  -1.4 is the value that brings it
 * onto the wall *and* leaves the generator's window run its 3.05 m -- the
 * window count is derived from what is left east of the porch, so pushing the
 * porch further in collapses two windows onto each other. */
const HALL_PORCH = -1.4;
const F_Z0 = 64.85;                 // the forecourt, between the hall and the arm
const F_Z1 = 68.30;
const BAY_X0 = 17.90;               // the two car bays, east of the hall
const BAY_X1 = 22.50;
const BAY_Z0 = 63.40;

/* the north parcel */
const PARK = { x0: 1.4, x1: 9.8, z0: 71.9, z1: 79.7 };
const WALK = { x: 14.6, z: 76.5, w: 6.4, d: 6.6, face: 'z-' };
const ATT = { x: 24.0, z: 76.7, w: 5.8, d: 6.0, face: 'z-' };
const CARBAY = { x: 28.4, z: 74.4, w: 2.9, d: 5.0 };

const M = {};
function mats() {
  if (M.concrete) return M;
  M.concrete = cel({ color: PAL.concrete, bands: 3, tint: 0x6f6790 });
  M.concreteMid = cel({ color: PAL.concreteMid, bands: 3, tint: 0x6a6288 });
  M.metal = cel({ color: PAL.metal, bands: 3, tint: 0x666090 });
  M.metalDark = cel({ color: PAL.metalDark, bands: 3, tint: 0x5c5680 });
  M.wood = cel({ color: 0x9c7f5e, bands: 3, tint: 0x5c5680 });
  M.woodDark = cel({ color: 0x74563f, bands: 3, tint: 0x554e74 });
  M.sand = cel({ color: 0xd6c6a2, bands: 3, tint: 0x7d74a0 });
  M.sandMound = cel({ color: 0xcfbc97, bands: 3, tint: 0x7d74a0 });
  return M;
}

export function buildYonchome(ctx) {
  const m = mats();
  const gm = groundMats();
  const rng = rngKit(8300);
  const sakura = [];
  const shrubs = [];
  const grove = [];
  const petals = [];

  /* `groundY` is 0.45 for every z > 48, so this is the one block in the world
   * with no street profile to fight: one constant, and every platform, cut and
   * prop height is derived from it. */
  const Y = groundY(60);

  buildLane(ctx, Y, m, gm, sakura, grove, shrubs, petals);
  buildWestVerge(ctx, Y, m, gm, sakura, shrubs, petals);
  buildHall(ctx, Y, m, gm, rng, sakura, shrubs, petals);
  buildDryingGround(ctx, Y, m, gm);
  buildPark(ctx, Y, m, gm, rng, sakura, grove, shrubs, petals);
  buildHousing(ctx, Y, m, gm, shrubs, petals);

  /* ------------------------------ poles and cabling ------------------------------ *
   * Three lamps, which is what the brief wants of the kept street, and the
   * cabling that makes a lane read as a street rather than as a render.  Two on
   * the west verge with their arms out over the carriageway (`ry = PI/2` sends
   * `makePoleLite`'s arm, authored on local +z, to world +x), and one on the
   * hall's forecourt edge lighting the junction, carrying the service drops into
   * the hall and across the arm into the walk-up. */
  poleRun(ctx, {
    defs: [
      /* The first two both stood inside something in the draft -- pole 0 in
       * なかの's shop floor at (3.6, 54.0), pole 1 inside the tin store at
       * (3.6, 65.6), whose collider is x 3.20..4.00, z 64.25..65.75.  Neither
       * throws and neither shows from the lane, which is the whole problem with
       * placing a pole by the number that reads well on the page. */
      { x: 2.45, z: 58.6, y: Y, h: 8.4, seed: 8361, armDir: 1, ry: Math.PI / 2, lamp: true },
      { x: 2.40, z: 66.4, y: Y, h: 8.2, seed: 8362, armDir: 1, ry: Math.PI / 2, lamp: true },
      { x: 10.4, z: 68.0, y: Y + 0.07, h: 8.4, seed: 8363, armDir: 1, lamp: true },
    ],
    chains: [[0, 1], [1, 2]],
    drops: [[2, [13.0, Y + 4.1, 64.6]], [2, [12.8, Y + 7.4, 73.6]]],
    offsets: [[0, -0.45], [-0.42, 0.3]],
  });

  /* --------------------------------- the thicket --------------------------------- *
   * The east arm is closed with planting and not with a wall.  A 2 m concrete
   * end wall would read as a card standing on the paving at this tonal range,
   * and the arm's whole job is to look like it carries on into somebody else's
   * back land. */
  grove.push({ x: 28.8, z: 69.6, y: Y, scale: 1.5, seed: 8371, spread: 1.15 });
  grove.push({ x: 29.5, z: 71.4, y: Y, scale: 1.35, seed: 8372, spread: 1.1 });
  shrubs.push({ x: 29.0, z: 70.4, y: Y, r: 0.5, count: 3, spread: 1.2, seed: 8373 });
  ctx.add(makeCone({ x: 27.6, z: 69.4, y: Y, ry: 0.3 }));
  ctx.add(makeCone({ x: 27.5, z: 70.6, y: Y, ry: -0.5, tilt: 0.06 }));
  ctx.add(makeSignPost({
    x: 27.2, z: 68.6, y: Y, ry: 0.2, h: 1.7, postMat: m.metal,
    plates: [{ map: warningPlate(2), w: 0.4, h: 0.54, y: 1.34, double: true }],
  }));

  return { sakura, shrubs, grove, petals };
}

/* ------------------------------------------------------------------ *
 * The lane, and the arm off it.
 * ------------------------------------------------------------------ */

function buildLane(ctx, Y, m, gm, sakura, grove, shrubs, petals) {
  /* The main lane, joining the arm at its south end and running to the park
   * fence at its north.  Swept along z with `lane`, which follows the street
   * profile -- flat here, but a run of boxes would still step in x and get
   * every joint outlined by the ink pass. */
  lane(ctx, {
    axis: 'z', at: LN_X, from: LN_Z0, to: LN_Z1, w: LN_W,
    mat: gm.asphaltWorn, kerb: false, rise: 0.05, name: 'yonchomeLane',
  });
  /* What a lane too narrow for kerbs has instead of gutters, down its west
   * side: the slotted channel, two manholes and the squares patched back in
   * after the water main. */
  laneGutter(ctx, {
    axis: 'z', at: 4.62, from: 56.4, to: 71.4, y: Y, pitch: 0.9,
    manholes: [58.6, 66.2], manholeOff: 0.62,
    patches: [[5.7, 60.4, 1.6, 2.0], [6.9, 65.8, 1.2, 1.4]],
  });
  // 路側帯 both sides -- the marking that says this lane is maintained.  The
  // east line stops at the hall's forecourt, where the paving takes over.
  laneLine(ctx, { axis: 'z', at: 4.80, from: 58.4, to: 68.0, y: Y + 0.07 });
  laneLine(ctx, { axis: 'z', at: 7.22, from: 58.4, to: F_Z0, y: Y + 0.07 });

  /* The name plate, on the corner of the T where the arm leaves the road, so
   * it is read on the way in.  It faces **west** down the arm at the driver,
   * which `laneSign` could not do until its stand-off was taken along the
   * plate's own normal instead of along world z -- see `plots.js`. */
  laneSign(ctx, {
    x: 0.95, z: 54.60, y: ctx.groundAt(0.95, 54.60), variant: 2, h: 2.1, ry: -Math.PI / 2,
    mirror: true, mirrorAt: [0.0, -1.0], mirrorRy: -0.9,
  });

  /* The east arm.  `axis: 'x'` is one level box and it registers a platform, so
   * it gets kerbs (this is the kept street) -- but it starts at x = 7.9 rather
   * than at the lane centre, because a 0.26 m kerb run laid from x = 6 would
   * cross the mouth of the junction. */
  lane(ctx, {
    axis: 'x', at: ARM_Z, from: ARM_X0, to: ARM_X1, w: ARM_W, y: Y,
    mat: gm.asphaltWorn, kerb: true, rise: 0.05, name: 'yonchomeArm',
  });
  /* and the junction itself, as one slab tying the two together.  0.08 m thick
   * so its top lands on the arm's own surface: laid at the lane's 0.05 it would
   * leave a lip across the mouth. */
  pad(ctx, {
    x: 6.1, z: ARM_Z, w: 4.4, d: 3.6, y: Y, h: 0.08,
    mat: gm.asphaltWorn, name: 'yonchomeJunction',
  });
  laneLine(ctx, { axis: 'x', at: ARM_Z - 1.25, from: 9.0, to: 27.4, y: Y + 0.10 });
  laneLine(ctx, { axis: 'x', at: ARM_Z + 1.25, from: 9.0, to: 27.4, y: Y + 0.10 });

  // the convex mirror on the corner, which is what a blind junction gets
  ctx.add(makeMirror({ x: 7.4, z: 68.5, y: Y + 0.08, ry: -2.5, h: 2.5, r: 0.42 }));

  buildRoadHead(ctx, Y, m, gm, sakura, grove, shrubs, petals);
}

/* ------------------------------------------------------------------ *
 * The mouth: the main road's last stretch, the T, and the west arm.
 *
 * Two jobs, and the second one is the reason this is worth the geometry.  It
 * gives 四丁目 a way in that is a *street* rather than a gap between a tree and
 * a hedge -- and it finishes the main road, which until now ran 118 m up the
 * valley and stopped dead in a field with nothing to say about it.  A suburban
 * road that ends has a head: the carriageway runs on a little past the last
 * junction, the footway carries round it, and a guard barrier and a plate close
 * it off with the land beyond left as land.
 * ------------------------------------------------------------------ */

function buildRoadHead(ctx, Y, m, gm, sakura, grove, shrubs, petals) {
  const Z0 = 52.0;                       // where street.js's asphalt stops
  /* The carriageway, at exactly the section `buildStreet` sweeps: its strip
   * runs between centerX ± ROAD_HALF at `groundY(z) + 0.012`, and out here both
   * are constant, so one flat slab meets it with no seam.  `platform: false` --
   * the road *is* the natural grade here and a platform would lift the join. */
  pad(ctx, {
    x: RD_C, z: (Z0 + RD_Z1) / 2, w: RD_HALF * 2, d: RD_Z1 - Z0,
    y: Y - 0.048, h: 0.06, mat: gm.asphalt, platform: false, name: 'roadHead',
  });
  // one repair patch, so the new asphalt is not a dead field either
  {
    const g = new THREE.PlaneGeometry(2.2, 2.8);
    g.rotateX(-Math.PI / 2);
    const p = new THREE.Mesh(g, gm.asphaltWorn);
    p.position.set(RD_C + 1.1, Y + 0.018, 54.6);
    p.receiveShadow = true;
    p.userData.noOutline = true;
    ctx.add(p);
  }
  laneLine(ctx, { axis: 'z', at: RD_C + 2.79, from: Z0, to: RD_Z1 - 0.5, y: Y + 0.024 });
  laneLine(ctx, { axis: 'z', at: RD_C - 2.79, from: Z0, to: RD_Z1 - 0.5, y: Y + 0.024 });

  /* Both footways carried on at the street's own 0.135 m, and the kerb faces
   * that make them read as footways rather than as pale slabs.  The east one
   * stops at the T and starts again north of it; the west one runs to the head
   * and turns the corner, which is what closes the end of the road. */
  const WK = 1.55, WH = 0.135;
  const wkE = RD_C + RD_HALF + WK / 2;   // 0.525
  const wkW = RD_C - RD_HALF - WK / 2;   // -7.475
  const walkRuns = [
    [wkE, Z0, MO_Z - MO_W / 2],          // east, up to the T
    [wkE, MO_Z + MO_W / 2, RD_Z1],       // east, past it
    [wkW, Z0, RD_Z1],                    // west, the whole way
  ];
  for (const [wx, z0, z1] of walkRuns) {
    pad(ctx, { x: wx, z: (z0 + z1) / 2, w: WK, d: z1 - z0, y: Y, h: WH, mat: gm.sidewalk, name: 'roadHeadWalk' });
    const s = wx > RD_C ? -1 : 1;
    const kerb = box(0.16, WH + 0.02, z1 - z0, gm.curb, wx + s * (WK / 2 + 0.08), Y + (WH + 0.02) / 2, (z0 + z1) / 2);
    kerb.receiveShadow = true;
    ctx.add(kerb);
  }
  // and the return across the head, which is what makes it a head and not a stop
  pad(ctx, {
    x: RD_C, z: RD_Z1 + WK / 2, w: RD_HALF * 2 + WK * 2 + 0.32, d: WK,
    y: Y, h: WH, mat: gm.sidewalk, name: 'roadHeadReturn',
  });
  {
    const kerb = box(RD_HALF * 2 + 0.32, WH + 0.02, 0.16, gm.curb, RD_C, Y + (WH + 0.02) / 2, RD_Z1 + 0.08);
    kerb.receiveShadow = true;
    ctx.add(kerb);
  }

  /* The terminus.  A guard barrier across the carriageway and the plate that
   * goes with it -- and *not* a wall, because 2 m of concrete standing in the
   * open at this tonal range reads as a grey card (the `wallRun` note in
   * CLAUDE.md).  The barrier is 0.9 m, so it clears the 0.38 m step by a long
   * way and is a real barrier rather than a kerb pretending to be one. */
  {
    const parts = { rail: [], post: [] };
    const push = (k, geo, mx) => parts[k].push({ geometry: geo, matrix: mx });
    const x0 = RD_C - RD_HALF + 0.15, x1 = RD_C + RD_HALF - 0.15;
    for (const yy of [0.86, 0.52]) {
      push('rail', new THREE.BoxGeometry(x1 - x0, 0.11, 0.06), trs((x0 + x1) / 2, Y + yy, RD_Z1 - 0.22));
    }
    for (let i = 0; i <= 4; i++) {
      const x = x0 + ((x1 - x0) * i) / 4;
      push('post', new THREE.CylinderGeometry(0.055, 0.055, 0.98, 8), trs(x, Y + 0.49, RD_Z1 - 0.22));
      ctx.collide(x - 0.06, RD_Z1 - 0.28, x + 0.06, RD_Z1 - 0.16, Y + 0.98, Y, true);
    }
    ctx.collide(x0, RD_Z1 - 0.28, x1, RD_Z1 - 0.16, Y + 0.91, Y + 0.81, true);
    ctx.collide(x0, RD_Z1 - 0.28, x1, RD_Z1 - 0.16, Y + 0.57, Y + 0.47, true);
    for (const [k, mat] of [['rail', m.metal], ['post', m.metalDark]]) {
      const mesh = new THREE.Mesh(bake(parts[k]), mat);
      mesh.castShadow = mesh.receiveShadow = true;
      ctx.add(mesh);
    }
  }
  ctx.add(makeSignPost({
    x: RD_C + 2.35, z: RD_Z1 - 0.75, y: Y, ry: 0, h: 2.0, postMat: m.metal,
    plates: [{ map: warningPlate(1), w: 0.5, h: 0.66, y: 1.55, double: true }],
  }));
  ctx.add(makeCone({ x: RD_C - 2.5, z: RD_Z1 - 0.9, y: Y, ry: 0.3 }));

  /* What is on the other side of the barrier, and it is not optional.  A road
   * that stops needs something for the eye to stop *on*: without it the view
   * north is the pale ground running to the 23 m horizon under a pale sky, which
   * is two thirds of the frame doing nothing -- the same failure the empty-sky
   * note in NEXT.md records.  A hedge line and a green mass behind it read as
   * the field the road ran out of money before reaching, which is the truth. */
  /* Two runs and not one: 桜守裏町 goes in behind this hedge, and its footpath
   * comes down through a 1.8 m gap at x -2.5..-0.7 onto the head.  `uramachi.js`
   * lays the threshold and stands the two posts, so the opening reads as a way
   * through rather than as a hedge somebody stopped planting. */
  hedgeRun(ctx, {
    axis: 'x', at: RD_Z1 + 1.55, from: RD_C - RD_HALF - 1.7, to: -2.5,
    y: Y, h: 1.02, seed: 8330,
  });
  hedgeRun(ctx, {
    axis: 'x', at: RD_Z1 + 1.55, from: -0.7, to: RD_C + RD_HALF + 1.7,
    y: Y, h: 1.02, seed: 8336,
  });
  grove.push({ x: RD_C - 2.4, z: RD_Z1 + 3.6, y: Y, scale: 1.55, seed: 8331, spread: 1.15 });
  /* Slid east from RD_C + 2.2 (x -1.2).  桜守裏町's footpath comes down through
   * the gap in the hedge on the centre line x = -1.6, and at 1.35 this canopy
   * collides with a 1.5 m box -- so from the terminus the one opening in the
   * hedge framed a tree trunk and nothing else.  At x 0.3 it flanks the opening
   * instead, which is what it was for. */
  grove.push({ x: 0.3, z: RD_Z1 + 4.0, y: Y, scale: 1.35, seed: 8332, spread: 1.05 });
  shrubs.push({ x: RD_C - 0.4, z: RD_Z1 + 2.9, y: Y, r: 0.5, count: 4, spread: 1.35, seed: 8333 });
  shrubs.push({ x: RD_C + 4.6, z: RD_Z1 + 2.4, y: Y, r: 0.44, count: 3, spread: 1.1, seed: 8334 });
  /* and one cherry standing over the head itself, behind the west footway, so
   * the terminus has a canopy the way every other corner in this world does */
  sakura.push({ x: RD_C - 4.6, z: RD_Z1 - 1.2, y: Y, scale: 1.22, seed: 8335, lean: 0.11, leanDir: 1.4 });
  petals.push({ x: RD_C - 2.6, z: RD_Z1 - 1.6, w: 6.0, d: 3.0, y: Y + 0.02, n: 80 });

  /* ------------------------------- the arm ------------------------------- *
   * Kerbed, because it hangs off the road and everything that hangs off a road
   * in this district is kerbed; the lane it feeds is not, and that difference
   * is the whole grammar of the block.  It starts at the road's east kerb line
   * and ends on the lane's east edge, so the junction slab below ties the two
   * surfaces without a lip. */
  lane(ctx, {
    axis: 'x', at: MO_Z, from: MO_X0 + 0.9, to: MO_X1, w: MO_W, y: Y,
    mat: gm.asphaltWorn, kerb: true, rise: 0.05, name: 'yonchomeMouth',
  });
  /* the T itself: one slab over the kerb line, 0.08 m so its top lands on the
   * arm's surface rather than leaving a lip across the mouth */
  pad(ctx, {
    x: MO_X0 - 0.35, z: MO_Z, w: 2.6, d: MO_W + 0.5, y: Y, h: 0.08,
    mat: gm.asphaltWorn, name: 'yonchomeMouthJunction',
  });
  // and the corner into the lane, same trick at the other end
  pad(ctx, {
    x: LN_X, z: MO_Z + 0.4, w: LN_W, d: MO_W + 1.2, y: Y, h: 0.08,
    mat: gm.asphaltWorn, name: 'yonchomeMouthCorner',
  });
  laneLine(ctx, { axis: 'x', at: MO_Z - MO_W / 2 + 0.22, from: 1.4, to: 4.2, y: Y + 0.10 });

  /* ------------------------ なかの's service side ------------------------ *
   * The 0.85 m the arm leaves against the shop's back wall.  A blank two-storey
   * elevation onto a spur is correct and wants only what a shop's back has: the
   * meters, the extract fan's outdoor unit, the crates that never went back and
   * the tap.  `makeAircon`'s grille is on +z, so `ry = atan2(nx, nz)` for the
   * outward normal -- here (0, +1), i.e. 0 -- and its back has to touch the
   * wall, so the origin sits at wall + (d/2 + standoff). */
  const SH_Z = 54.65;                    // なかの's back wall
  ctx.add(makeAircon({ x: 3.30, z: SH_Z + 0.30, y: Y + 1.05, ry: 0, feet: false, w: 0.78, h: 0.58, d: 0.29 }));
  ctx.add(makeCrates({ x: 5.80, z: SH_Z + 0.32, y: Y, n: 3, seed: 8305, ry: -0.12 }));
  ctx.add(makeMilkCrate({ x: 6.55, z: SH_Z + 0.30, y: Y, n: 2, ry: 0.35 }));
  ctx.add(makeTapPost({ x: 2.35, z: SH_Z + 0.28, y: Y, ry: 0 }));
  ctx.add(makeBucket({ x: 2.80, z: SH_Z + 0.30, y: Y, ry: 0.9, water: true }));
  ctx.add(makeBroom({ x: 4.55, z: SH_Z + 0.16, y: Y, tilt: -0.06, roll: 0.2, ry: 0.1 }));
  ctx.add(makeIvy({ x: 6.95, z: SH_Z + 0.04, y: Y, ry: 0, len: 1.6, top: 1.5, drop: 0.8, seed: 8306 }));
}

/* ------------------------------------------------------------------ *
 * The west verge and the library's flank.
 *
 * No building west of x = 8 between z = 49 and z = 62: the library's sunlit
 * west flank seen against its shaded front is a composition NEXT.md records as
 * worth keeping, and the west side of the lane is left open until z = 62 so the
 * walk north is asymmetric.  Dressed, therefore, and not built:
 * ------------------------------------------------------------------ */

function buildWestVerge(ctx, Y, m, gm, sakura, shrubs, petals) {
  /* The hedge is the block's west boundary, and it starts north of the arm.
   * The draft ran it from z = 50.6, which put eleven metres of it in the 0.65 m
   * slot between the road's footway and なかの's west wall -- a hedge inside a
   * gap too narrow to stand in.  It begins where the block actually begins. */
  hedgeRun(ctx, { axis: 'z', at: 1.7, from: 58.7, to: 61.8, y: Y, h: 0.95, seed: 8310 });
  hedgeRun(ctx, { axis: 'z', at: 1.7, from: 64.6, to: 71.4, y: Y, h: 0.92, seed: 8311 });

  /* The 2.8 m break in it is the allotment gate: a vegetable bed, the tin
   * store, a stack of crates and a bottle crate somebody left.  A gap in a
   * boundary needs a reason to be a gap. */
  ctx.add(makeKitchenGarden({ x: 2.6, z: 63.2, y: Y, ry: 0, w: 2.3, d: 1.2, seed: 8314 }));
  {
    const sh = makeStorageShed({ x: 3.6, z: 65.0, y: Y, ry: Math.PI / 2, w: 1.4, d: 0.75, h: 1.65 });
    ctx.add(sh);
    ctx.collide(3.2, 64.25, 4.0, 65.75, Y + (sh.userData.top ?? 1.8));
  }
  ctx.add(makeCrates({ x: 2.6, z: 65.4, y: Y, n: 3, seed: 8315, ry: 0.25 }));
  ctx.add(makeMilkCrate({ x: 2.0, z: 64.4, y: Y, ry: -0.4, n: 2 }));
  ctx.add(makeBucket({ x: 3.3, z: 63.9, y: Y, ry: 0.5, water: true }));
  shrubs.push({ x: 2.3, z: 62.4, y: Y, r: 0.44, count: 3, spread: 1.0, seed: 8316 });

  /* The long bed and the bench, both moved north out of the shop: the bed ran
   * z 52.2..57.8 and the bench sat at 51.6, which is inside なかの's shop floor.
   * They go where the verge actually is now -- the bed against the north hedge
   * run, the bench on the approach to the junction looking back down the lane. */
  ctx.add(makeFlowerBed({ x: 2.7, z: 61.2, w: 1.0, d: 1.4, y: Y, seed: 8312, n: 10 }));
  ctx.add(makeBench({ x: 3.2, z: 66.6, y: Y, ry: Math.PI / 2, len: 1.7 }));
  ctx.add(makeLoosePaper(ctx, [{ x: 4.0, z: 66.4, y: Y + 0.01, ry: 0.8 }]) ?? new THREE.Group());

  /* Two street cherries in proper pits.  A tree standing in bare verge reads as
   * a tree in a field; the kerb ring, the soil and the stake are what make it a
   * street tree, and this is the one lane in the new work that is kept enough to
   * have them.  The southern one moved off z = 50.9 for the same reason as the
   * bench, and lands at the junction where it does more work: it is the thing
   * that closes the view east along the arm from the road head. */
  for (const [tx, tz, sc, sd] of [[3.5, 59.8, 1.18, 8317], [3.2, 69.0, 1.24, 8318]]) {
    treePit(ctx, m, gm, { x: tx, z: tz, y: Y });
    sakura.push({ x: tx, z: tz, y: Y, scale: sc, seed: sd, lean: 0.1, leanDir: 4.4 });
  }

  /* The library's flank, on the other side of the lane: a clipped hedge along
   * its boundary, and nothing tall.  It tops out at 0.8 m, well under the string
   * course, so the elevation the composition depends on is untouched. */
  hedgeRun(ctx, { axis: 'z', at: 9.9, from: 51.4, to: 57.4, y: Y, h: 0.8, t: 0.4, seed: 8313 });

  /* ------------------------- なかの's back yard -------------------------
   * The 2.65 m slot between the shop's east flank and that hedge, which the
   * draft left as open ground and the flood fill walked -- through a 0.49 m
   * pinch between two grove-tree colliders (`shotengai.js` 7.8/51.4 at scale
   * 1.8, `library.js` 8.6/53.8 at 1.6), which is a fifth of what a body needs.
   * A gap that looks like a way through and is not is the single most reported
   * kind of bug in this project.
   *
   * Both trees are staying: one closes the gap between the corner and the
   * library's west flank and the other stops the cornice line running out into
   * sky, and those are the reasons they were placed.  So the slot becomes what
   * it looks like from the forecourt -- the shop's back yard, closed at the
   * street with a solid 板塀 and entered from the lane at its north end.  No
   * gate: a 0.9 m opening is a route, and this is not one. */
  plotWall(ctx, {
    x0: 7.05, x1: 9.70, z0: 49.90, z1: 57.60, sides: ['z-'],
    kind: 'timber', y: Y, h: 0.26, fenceH: 1.34, seed: 8321,
  });
  ctx.add(makeCrates({ x: 7.75, z: 56.35, y: Y, n: 4, seed: 8322, ry: 0.08 }));
  ctx.add(makeMilkCrate({ x: 8.60, z: 56.55, y: Y, n: 3, ry: -0.3 }));
  /* Parked *along* the flank and standing off it by half a handlebar: a bicycle
   * is 1.73 m long, and placing one by its clearance to a wall is what buried
   * thirty-seven of them in the render. */
  ctx.add(makeBicycle({ x: 7.45, z: 54.60, y: Y, ry: 0, lean: 0.06, color: 0x4c6a86 }));
  ctx.add(makePlanter({ x: 9.30, z: 55.90, y: Y, r: 0.24, flower: false, seed: 8319, n: 4 }));
  shrubs.push({ x: 9.0, z: 57.9, y: Y, r: 0.48, count: 3, spread: 1.1, seed: 8320 });

  petals.push({ x: LN_X, z: 62.0, w: 2.9, d: 8.0, y: Y + 0.07, n: 90 });
  petals.push({ x: 3.4, z: 60.6, w: 2.4, d: 3.0, y: Y + 0.02, n: 40 });
}

/** A street tree's pit: a kerb ring, the soil in it, and the stake and tie. */
function treePit(ctx, m, gm, o) {
  const R = 0.62;
  const soil = box(R * 2 - 0.16, 0.05, R * 2 - 0.16, cel({ color: 0x8f7a62, bands: 3, tint: 0x615a80 }),
    o.x, o.y + 0.03, o.z);
  soil.receiveShadow = true;
  ctx.add(soil);
  const rim = [];
  for (const s of [-1, 1]) {
    rim.push({ geometry: new THREE.BoxGeometry(R * 2, 0.11, 0.13), matrix: trs(o.x, o.y + 0.055, o.z + s * (R - 0.065)) });
    rim.push({ geometry: new THREE.BoxGeometry(0.13, 0.11, R * 2 - 0.26), matrix: trs(o.x + s * (R - 0.065), o.y + 0.055, o.z) });
  }
  const mesh = new THREE.Mesh(bake(rim), m.concreteMid);
  mesh.receiveShadow = true;
  ctx.add(mesh);
  // the stake, on the shaded side, and the tie round it
  const stake = cyl(0.035, 0.035, 1.5, 6, m.wood, o.x + 0.28, o.y + 0.75, o.z + 0.1);
  stake.castShadow = true;
  ctx.add(stake);
  ctx.add(box(0.3, 0.035, 0.035, cel({ color: 0x6a6252, bands: 2 }), o.x + 0.14, o.y + 1.15, o.z + 0.1));
}

/* ------------------------------------------------------------------ *
 * ひばり台町内会館 -- the neighbourhood association hall.
 *
 * Zone A is 10.6 m deep, so the hall's 9.2 m frontage runs along x and the
 * building faces +z onto the east arm with a 3.4 m forecourt in front of it.
 * That gets both of its public elevations into the sun, which is the whole
 * reason for this orientation: the sun is at (-52, 62, 56), so a frontage
 * facing +z and a flank facing -x are both lit, and those are exactly the two
 * faces the district sees -- the flank with its notice board from the lane, the
 * frontage with its porch from the junction.
 *
 * The generator gives the porch, the name board, the lit lobby with the stack
 * of folded tables in it and the glazed notice case.  Everything here is
 * outside: the forecourt, two marked bays with wheel stops, the bike shelter
 * with more bicycles than it covers, the association's refuse enclosure on the
 * corner, the planters flanking the steps, and the board on the flank.
 * ------------------------------------------------------------------ */

function buildHall(ctx, Y, m, gm, rng, sakura, shrubs, petals) {
  const h = makeHall({
    ...HALL, y: Y, porchAt: HALL_PORCH, wall: 1, roof: 0, door: 1, lit: true, seed: 8301,
  });
  ctx.add(h);
  const p = plotBox(HALL);
  plotCollide(ctx, p, Y + (h.userData.top ?? 4.4));

  /* The porch slab is walked on, so it is a platform and not part of the
   * collider: `makeHall` stands it 0.2 m proud of the forecourt, which is a
   * step, and platforms have to *overlap* what they land on or the joint is a
   * hole.  This one runs 0.05 m back under the frontage line. */
  const PX = HALL.x + HALL_PORCH;              // the porch centre, in world x
  ctx.platform({
    x0: PX - 1.7, x1: PX + 1.7,
    z0: HALL.z + HALL.d / 2 - 0.1, z1: HALL.z + HALL.d / 2 + 1.65,
    top: Y + 0.2,
  });
  ctx.add(makeDoormat({ x: PX, z: HALL.z + HALL.d / 2 + 0.75, y: Y + 0.2, ry: 0, w: 0.8, d: 0.44 }));

  /* ------------------------------- the forecourt ------------------------------- */
  pad(ctx, {
    x: (7.7 + 18.3) / 2, z: (F_Z0 + F_Z1) / 2, w: 18.3 - 7.7, d: F_Z1 - F_Z0,
    y: Y, h: 0.07, mat: gm.concrete, name: 'hallForecourt',
  });
  pad(ctx, {
    x: (BAY_X0 + BAY_X1) / 2, z: (BAY_Z0 + F_Z1) / 2, w: BAY_X1 - BAY_X0, d: F_Z1 - BAY_Z0,
    y: Y, h: 0.07, mat: gm.asphaltWorn, name: 'hallBays',
  });
  const FY = Y + 0.07;

  /* Two bays, and they are 4.7 m deep because that is the one place on the plot
   * where a car length fits: they run *south* off the arm past the hall's east
   * end, stopping clear of the grove tree at (21.6, 62.2) that was already
   * standing there -- which now shades them, which is better than moving it. */
  for (let i = 0; i <= 2; i++) {
    laneLine(ctx, {
      axis: 'z', at: BAY_X0 + 0.2 + i * ((BAY_X1 - BAY_X0 - 0.4) / 2),
      from: BAY_Z0 + 0.4, to: F_Z1 - 0.2, y: FY + 0.02,
    });
  }
  ctx.add(makeWheelStops({
    x: (BAY_X0 + BAY_X1) / 2, z: BAY_Z0 + 1.1, y: FY, ry: 0, n: 2, pitch: 2.1, gauge: 1.45,
  }));

  /* The bike stand.  Eight bicycles and a four-metre shelter, so two of them
   * are parked out in the open at the end of the row -- the association has
   * more members than it has roof, which is the story.
   *
   * `makeBikeRack` at `ry = PI/2` runs its row along x with every nose pointing
   * -z, so what has to clear the hall's frontage is half a wheelbase (0.95 m)
   * and not half a handlebar. */
  ctx.add(makeBikeShelter({ ctx, x: 15.0, z: 66.9, y: FY, ry: 0, w: 4.0, d: 1.8, h: 2.05 }));
  ctx.add(makeBikeRack({ x: 15.0, z: 66.7, y: FY, n: 6, spacing: 0.64, ry: Math.PI / 2, seed: 83 }));
  /* **One loose bicycle east of the rack, not two.**  Both stood on x = 17.4 at
   * `ry ≈ PI/2`, which runs a 1.73 m machine along z -- and they were 0.8 m apart
   * *down their own length*, so the second one was inside the first from every
   * angle.  The amber one is gone rather than moved: 0.8 m is the whole width of
   * the shelter's overhang there, and a sixth machine in the rack is what a full
   * stand looks like anyway. */
  ctx.add(makeBicycle({ x: 17.4, z: 66.9, y: FY, ry: Math.PI / 2 + 0.05, lean: 0.07, color: 0x4f8f6a }));

  /* The refuse enclosure on the corner where the lane meets the arm, which is
   * where a 集積所 actually is -- the collection stops there.  Its gate is on
   * local +z, so `ry = 0` faces it at the street.  It leaves the 1.8 m of
   * forecourt south of it as the way in from the lane. */
  refusePoint(ctx, { kind: 'house', x: 9.5, z: 67.6, y: FY, ry: 0, plate: 0, seed: 8302 });

  // planters flanking the porch steps, and two more under the window run
  ctx.add(makePlanter({ x: PX - 2.1, z: F_Z0 + 0.5, y: FY, r: 0.26, flower: true, seed: 8303, n: 5 }));
  ctx.add(makePlanter({ x: PX + 2.1, z: F_Z0 + 0.45, y: FY, r: 0.24, flower: true, seed: 8304, n: 5 }));
  ctx.add(makePlanter({ x: 15.9, z: F_Z0 + 0.4, y: FY, r: 0.21, flower: false, seed: 8305, n: 4 }));
  ctx.add(makePlanter({ x: 16.6, z: F_Z0 + 0.42, y: FY, r: 0.19, flower: false, seed: 8306, n: 4 }));
  makeLoosePaper(ctx, [{ x: 13.9, z: 67.4, y: FY + 0.01, ry: -0.6 }]);

  /* ------------------------------- the flank ------------------------------- *
   * The 掲示板 goes on the hall's west flank rather than in its forecourt, and
   * that is a route decision as much as a compositional one.  A 2.0 m board is
   * 2.68 m of blocked ground once the player's own radius is added to both
   * ends, and anywhere in the 3.4 m forecourt that is either across the way in
   * from the lane or across the way to the porch.  On the flank it blocks a
   * metre-wide strip that goes nowhere, it is sunlit, and it is the first thing
   * on the block you can actually read -- you meet it walking north up the lane
   * before the porch swings into view round the corner. */
  {
    const bx = HALL.x - HALL.w / 2 - 0.3;
    const board = makeNoticeBoard({ ctx,
      x: bx, z: HALL.z, y: Y, ry: -Math.PI / 2, w: 2.0, h: 1.05, y0: 0.9,
      wood: 0x8a6f52,
      sheets: [
        { map: hallNotice(0), x: -0.62, w: 0.42, h: 0.58, tilt: 0.015 },
        { map: hallNotice(1), x: 0.0, w: 0.42, h: 0.58, tilt: -0.01 },
        { map: hallNotice(2), x: 0.62, w: 0.42, h: 0.58, y: -0.02 },
      ],
    });
    ctx.add(board);
  }
  // the service door's own clutter, on the same flank
  ctx.add(makeBroom({ x: HALL.x - HALL.w / 2 - 0.28, z: 60.0, y: Y, tilt: -0.05, roll: 0.14, ry: 1.4 }));
  ctx.add(makeBucket({ x: HALL.x - HALL.w / 2 - 0.45, z: 59.5, y: Y, ry: -0.3 }));
  ctx.add(makeCrates({ x: HALL.x - HALL.w / 2 - 0.5, z: 58.9, y: Y, n: 2, seed: 8307, ry: -0.2 }));

  /* --------------------------- the back pocket --------------------------- *
   * x 18..22.5 between the hall, the library's north wall and the コーポ:
   * enclosed on three sides and reached off the bays, so it gets what that kind
   * of leftover always gets -- the store, a stack of crates, ivy on the blank
   * wall and the shade of the tree that was already there. */
  {
    const sh = makeStorageShed({ x: 19.3, z: 59.0, y: Y, ry: 0, w: 1.6, d: 0.8, h: 1.72 });
    ctx.add(sh);
    ctx.collide(18.4, 58.5, 20.2, 59.5, Y + (sh.userData.top ?? 1.9));
    ctx.add(makeCrates({ x: 20.6, z: 58.6, y: Y, n: 3, seed: 8308, ry: 0.3 }));
    ctx.add(makeIvy({ x: 18.8, z: 57.78, y: Y, ry: 0, len: 3.2, top: 1.35, drop: 0.9, seed: 8309 }));
    shrubs.push({ x: 19.4, z: 62.4, y: Y, r: 0.5, count: 4, spread: 1.4, seed: 8321 });
    dapple(ctx, { rng, x: 21.4, z: 62.6, y: Y, r: 1.5, spread: 1.6, n: 6, opacity: 0.11 });
  }

  /* One cherry on the forecourt's north edge, off the porch axis.  It stands
   * between the paving and the arm so the hall has something over its bicycles,
   * and it does not close the view down the arm the way a tree in the middle
   * would. */
  sakura.push({ x: 9.4, z: 66.55, y: FY, scale: 1.16, seed: 8322, lean: 0.11, leanDir: 2.4 });
  petals.push({ x: 13.4, z: 66.9, w: 8.4, d: 2.6, y: FY + 0.02, n: 90 });
}

/* ------------------------------------------------------------------ *
 * The drying ground behind ひばり台コーポ.
 *
 * x 22.8..29.8 between the コーポ's open stair (which already occupies
 * z 62.3..64.0) and the arm.  Four metres deep, so nothing can be built on it,
 * and a block of nine flats with no drying space is a block nobody lives in.
 * A low ブロック塀 with a 1.6 m gate along the street edge makes it read as
 * half-private rather than as spare ground.
 * ------------------------------------------------------------------ */

function buildDryingGround(ctx, Y, m, gm) {
  const X0 = 22.8, X1 = 29.8, Z0 = 64.1, Z1 = 68.1;
  pad(ctx, {
    x: (X0 + X1) / 2, z: (Z0 + Z1) / 2, w: X1 - X0, d: Z1 - Z0,
    y: Y, h: 0.06, mat: gm.gravel, name: 'kohoDrying',
  });
  const GY = Y + 0.06;
  plotWall(ctx, {
    x0: X0, x1: X1, z0: Z0, z1: Z1, sides: ['z+'], kind: 'block',
    h: 0.62, blockH: 0.4, y: Y, seed: 8340,
    gate: { side: 'z+', at: 24.6, w: 1.6 },
  });
  ctx.add(makeIvy({ x: 27.8, z: Z1 - 0.06, y: Y, ry: 0, len: 3.0, top: 1.05, drop: 0.72, seed: 8341 }));

  ctx.add(makeDryingRack({ x: 24.4, z: 65.4, y: GY, ry: Math.PI / 2, seed: 8342 }));
  ctx.add(makeDryingRack({ x: 26.2, z: 65.2, y: GY, ry: Math.PI / 2 + 0.12, seed: 8343 }));
  ctx.add(makeLaundryPole({ ctx, x: 27.9, z: 66.4, y: GY, ry: Math.PI / 2, len: 2.6, n: 4, seed: 8344 }));
  ctx.add(makeTapPost({ x: 23.5, z: 67.2, y: GY, ry: Math.PI }));
  ctx.add(makeBucket({ x: 23.9, z: 67.3, y: GY, ry: 0.4, water: true }));
  ctx.add(makeKitchenGarden({ x: 28.4, z: 64.8, y: GY, ry: Math.PI / 2, w: 1.6, d: 1.0, seed: 8345 }));
  ctx.add(makeCrates({ x: 22.6, z: 66.2, y: GY, n: 3, seed: 8346, ry: 0.2 }));
  ctx.add(makeMilkCrate({ x: 25.6, z: 67.4, y: GY, ry: 0.3, n: 3 }));
}

/* ------------------------------------------------------------------ *
 * The pocket park.
 *
 * Deliberately smaller and quieter than 児童公園, and deliberately not a
 * playground: a sandpit, two benches, a tap, the ball crate and three
 * cherries.  It closes the north end of the lane, so it is the long view of the
 * whole block -- twenty-two metres of carriageway ending on a pipe railing with
 * blossom over it.
 * ------------------------------------------------------------------ */

function buildPark(ctx, Y, m, gm, rng, sakura, grove, shrubs, petals) {
  const { x0, x1, z1 } = PARK;
  /* **The park's south-west corner is the supermarket's road.**
   *
   * ひばり台七丁目 is on the far side of 桜守裏町 and there is exactly one
   * corridor to it -- north of the 長屋's eave (z 71.82) and south of the two
   * grove trees behind it -- so its 3.6 m link lane runs east along z = 73.90
   * and has to arrive somewhere.  It arrives here, at the head of this lane,
   * because the only other candidate is the main road's head at (-3.40, 58.4)
   * and `onsen.js`'s immovable screen tree at (-12.8, 62.2) fills that corridor
   * completely.  See `nanachome.js`'s header and NEXT.md.
   *
   * What it costs is x 1.40..4.40 of the park's south edge, cut back to
   * z = 75.70: 9.3 m² of 65, and the corner that had the least in it.  The lane
   * ends *on* this park's apron, so the long view up 四丁目's own lane -- 22 m
   * of carriageway closing on a pipe railing with blossom over it -- is intact;
   * what it gains is a junction at the far end of it instead of a dead end. */
  const CUT_X = 4.40, CUT_Z = 75.70;
  const z0 = PARK.z0;
  for (const b of [
    { x0, x1: CUT_X, z0: CUT_Z, z1 },
    { x0: CUT_X, x1, z0, z1 },
  ]) {
    pad(ctx, {
      x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2, w: b.x1 - b.x0, d: b.z1 - b.z0,
      y: Y, h: 0.06, mat: gm.dirt, name: 'yonchomeParkGround',
    });
  }
  // the paved apron at the gap, on the lane's own axis
  pad(ctx, {
    x: LN_X, z: z0 + 0.7, w: 3.2, d: 1.6, y: Y, h: 0.08,
    mat: gm.concrete, name: 'yonchomeParkApron',
  });
  const PY = Y + 0.06;

  /* A low pipe railing all the way round with one 3.2 m entrance, which is the
   * lane's width -- the lane runs into the park rather than stopping beside it.
   * The west end of the south run and the south end of the west run are the two
   * that moved with the cut above; the new return closes the corner. */
  for (const r of [
    { axis: 'x', at: CUT_Z, from: x0, to: CUT_X },
    { axis: 'x', at: z0, from: LN_X + 1.6, to: x1 },
    { axis: 'x', at: z1, from: x0, to: x1 },
    { axis: 'z', at: x0, from: CUT_Z, to: z1 },
    { axis: 'z', at: x1, from: z0, to: z1 },
    /* **No run at `x = CUT_X`.**  Drawn there it looks like the tidy way to
     * close the cut corner and it is a 3.8 m fence straight across the mouth of
     * the new lane -- neither the flood fill nor a rendered frame finds that,
     * because the world stays connected round the long way and a railing seen
     * along its length is a line.  A scan line across the junction is what
     * showed it.  The park's opening is L-shaped now, which is what a park on
     * the inside of a road junction actually has. */
  ]) {
    railing(ctx, { ...r, y: PY, h: 0.92, spacing: 2.0, mat: m.metal });
  }

  /* The children's bicycle parking, inside the fence by the entrance, which is
   * where it belongs -- a stand out on the verge would be one more thing in the
   * 1.4 m strip between the arm and the housing.  Moved 3.6 m north with the
   * corner cut: at (2.9, 73.0) it stood in the middle of the new lane. */
  /* **The shelter is 1.8 m wide and the sandpit moved 0.8 m east, because the two
   * were inside each other.**  At w = 2.2 on x = 2.9 the shelter reached x = 4.0
   * and the sandpit's timber edge started at 2.83: its north-east post stood *in*
   * the sand, and the green kid's bike at (3.4, 76.5) was sunk to its axles in it
   * -- the sand's surface is 0.11 m above the `PY` everything here is seated on. */
  ctx.add(makeBikeShelter({ ctx, x: 2.6, z: 76.6, y: PY, ry: 0, w: 1.8, d: 1.7, h: 1.92 }));
  ctx.add(makeKidBike({ x: 2.4, z: 76.8, y: PY, ry: -Math.PI / 2 + 0.12 }));
  ctx.add(makeKidBike({ x: 3.0, z: 76.5, y: PY, ry: Math.PI / 2 - 0.2, color: 0x4f8f6a }));
  ctx.add(makeBicycle({ x: 6.7, z: 72.3, y: PY, ry: 0.06, lean: 0.07, color: 0x3f6f9c }));

  ctx.add(makeBench({ x: 5.4, z: 74.2, y: PY, ry: Math.PI / 2, len: 1.7 }));
  // 7.6, not 7.2: the sandpit's east timber is at 6.37 now and a 1.7 m seat on
  // 7.2 reaches 6.35
  ctx.add(makeBench({ x: 7.6, z: 78.4, y: PY, ry: Math.PI, len: 1.7 }));

  /* The sandpit: sand, a timber edge on all four sides, a bucket somebody left
   * and the mound they left with it.  One piece of play equipment and no more --
   * 児童公園 already has the swings, the slide and the riders, and a second full
   * playground two streets away would flatten both of them. */
  {
    const sx = 5.0, sz = 77.4, w = 2.6, d = 2.2;   // 5.0: see the shelter above
    const sand = box(w, 0.14, d, m.sand, sx, PY + 0.04, sz);
    sand.receiveShadow = true;
    ctx.add(sand);
    for (const s of [-1, 1]) {
      ctx.add(box(w + 0.28, 0.24, 0.14, m.wood, sx, PY + 0.06, sz + s * (d / 2 + 0.07)));
      ctx.add(box(0.14, 0.24, d + 0.28, m.wood, sx + s * (w / 2 + 0.07), PY + 0.06, sz));
    }
    ctx.add(makeBucket({ x: sx + 0.6, z: sz - 0.4, y: PY + 0.11, ry: 0.5, color: PAL.yellow }));
    const mound = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.18, 8), m.sandMound);
    mound.position.set(sx - 0.5, PY + 0.2, sz + 0.4);
    mound.castShadow = true;
    ctx.add(mound);
  }

  ctx.add(makeTapPost({ x: 8.6, z: 73.9, y: PY, ry: -Math.PI / 2 }));
  ctx.add(makeBallBox({ x: 8.9, z: 76.4, y: PY, ry: -Math.PI / 2, seed: 8351, loose: 0.62 }));

  /* The board at the gate.  The park is the association's, so the sheet on it
   * is the association's -- and the one pinned here is the drill notice that
   * tells everybody to assemble in the park, which is the cheapest possible way
   * to tie the two halves of the district together. */
  {
    const nb = makeNoticeBoard({ ctx,
      x: 8.3, z: 72.5, y: PY, ry: Math.PI, w: 1.25, h: 0.8, y0: 0.85, wood: 0x8a6f52,
      sheets: [{ map: hallNotice(1), x: 0, w: 0.4, h: 0.55, tilt: 0.012 }],
    });
    ctx.add(nb);
  }

  /* Chalk on the apron and again inside the gate.  `makeChalkMarks` must be
   * seated on the surface the marks are actually on -- at 20 mm, a spot seated
   * from the street profile where a slab has since been laid is not faint, it is
   * gone -- so both of these read the height back out of `ctx.groundAt`. */
  makeChalkMarks(ctx, [
    { x: LN_X, z: z0 + 0.8, y: ctx.groundAt(LN_X, z0 + 0.8), seed: 8352, scale: 1.0 },
    { x: 5.0, z: 74.4, y: ctx.groundAt(5.0, 74.4), seed: 8353, scale: 0.9, ry: 0.4 },
  ]);

  sakura.push({ x: 2.0, z: 77.4, y: PY, scale: 1.22, seed: 8354, lean: 0.12, leanDir: 1.4 });
  sakura.push({ x: 6.2, z: 79.0, y: PY, scale: 1.14, seed: 8355, lean: 0.1, leanDir: 3.2 });
  sakura.push({ x: 7.6, z: 75.0, y: PY, scale: 1.1, seed: 8356, lean: 0.09, leanDir: 5.0 });
  // one dark green mass on the north edge, so the block has a back
  grove.push({ x: 2.7, z: 79.0, y: PY, scale: 1.45, seed: 8357, spread: 1.1 });
  shrubs.push({ x: 6.6, z: 77.2, y: PY, r: 0.5, count: 4, spread: 1.5, seed: 8358 });
  shrubs.push({ x: 9.0, z: 78.6, y: PY, r: 0.46, count: 3, spread: 1.2, seed: 8359 });
  dapple(ctx, { rng, x: 3.0, z: 78.0, y: PY, r: 1.5, spread: 1.8, n: 7, opacity: 0.12 });
  petals.push({ x: 4.6, z: 74.6, w: 5.0, d: 3.4, y: PY + 0.02, n: 80 });
}

/* ------------------------------------------------------------------ *
 * The housing row, north of the arm.
 *
 * 8.4 m of depth is one building and a front garden, so the row is: the park,
 * a small walk-up, a 1.5 m utility slot, a 二階半 house, and the family's
 * carport bay at the east end.  Six flats and a house, which is the seven
 * dwellings this parcel holds at Japanese setbacks.
 *
 * Both frontages face -z onto the arm, and -z is the shaded quarter here (the
 * sun is at (-52, 62, 56)).  That is correct for the type rather than a
 * compromise: a walk-up's access gallery is its *back* and is always in shade,
 * which is what puts its balconies -- and its washing -- on the sunlit +z side.
 * The mitigations are the library's: lit kitchen windows on the gallery, a warm
 * upper window on the house, and the lamp on the pole at the junction.
 * ------------------------------------------------------------------ */

function buildHousing(ctx, Y, m, gm, shrubs, petals) {
  /* ----------------------------- ハイツ ひばり ----------------------------- *
   * Three storeys, two flats a floor, pale render: the newer kind, deliberately
   * not another ひばり台コーポ.  Six letterboxes for six flats -- a bank with
   * the wrong number of doors on it is the one detail on a block like this that
   * anybody checks. */
  {
    const b = makeWalkup({
      ...WALK, y: Y, floors: 3, units: 2, seed: 8330, wall: 0, roof: 1, door: 1, plate: 2, ctx,
    });
    ctx.add(b);

    const fz = WALK.z - WALK.d / 2;            // the gallery frontage, facing -z
    const gA = (x, z) => ctx.groundAt(x, z);
    ctx.add(makeMailboxBank({ x: 12.2, z: fz - 0.6, y: gA(12.2, fz - 0.6), ry: Math.PI, cols: 3, rows: 2 }));
    ctx.add(makePlanter({ x: 13.0, z: fz - 0.4, y: gA(13.0, fz - 0.4), r: 0.24, flower: true, seed: 8331, n: 5 }));
    /* propped along the frontage and not pointed at it: a bicycle is 1.73 m
     * long and 0.55 m wide, so parallel to the wall with half a handlebar of
     * standoff is the only way it is not half inside the render */
    ctx.add(makeBicycle({ x: 14.3, z: fz - 0.35, y: gA(14.3, fz - 0.35), ry: Math.PI, lean: 0.06, color: 0x8f6fb5 }));
    refusePoint(ctx, { kind: 'bins', x: 16.4, z: fz - 0.5, y: gA(16.4, fz - 0.5), ry: Math.PI, plate: 1 });
    /* Outdoor units on the west flank.  `makeAircon`'s grille is on local +z, so
     * `ry` is the wall's outward normal -- -x here -- and the origin sits half a
     * casing plus the 90 mm standoff off the wall face so the back of it and its
     * bracket arms actually touch the render. */
    const wx = WALK.x - WALK.w / 2 - 0.24;
    ctx.add(makeAircon({ x: wx, z: WALK.z - 1.6, y: gA(wx, WALK.z - 1.6), ry: -Math.PI / 2, w: 0.86, h: 0.6 }));
    ctx.add(makeAircon({ x: wx, z: WALK.z + 1.2, y: Y + 2.95, ry: -Math.PI / 2, w: 0.86, h: 0.6, feet: false }));

    /* the block's two bicycles live down its west side under a lean-to, which is
     * what a walk-up on a 1.3 m setback actually does with them.  The slot is
     * 1.55 m wide, so the row runs *across* it and the machines lie along it. */
    ctx.add(makeBikeShelter({ ctx, x: 10.6, z: 76.0, y: Y, ry: 0, w: 1.4, d: 2.4, h: 2.0 }));
    ctx.add(makeBikeRack({ x: 10.6, z: 76.0, y: Y, n: 2, spacing: 0.62, ry: -Math.PI / 2, seed: 84 }));
    shrubs.push({ x: 10.5, z: 78.6, y: Y, r: 0.44, count: 3, spread: 1.1, seed: 8332 });
  }

  /* ------------------------------ 二階半の家 ------------------------------ */
  {
    const h = makeAtticHouse({
      ...ATT, y: Y, seed: 8333, wall: 7, roof: 2, door: 3, nameVariant: 7,
      lit: true, litDormer: false,
    });
    ctx.add(h);
    const p = plotBox(ATT);
    plotCollide(ctx, p, Y + (h.userData.top ?? 8.3));

    /* The boundary stands almost on the pavement -- 0.19 m off the kerb -- and
     * that is not carelessness.  A fence set back into the middle of a 1.75 m
     * garden leaves less than the 0.68 m of clear ground the player's own radius
     * needs between it and the frontage, and the front garden of a house you
     * cannot walk up to is not a garden. */
    const FENCE_Z = 71.95;
    plotWall(ctx, {
      x0: 20.85, x1: 26.9, z0: FENCE_Z, z1: 79.8, sides: ['z-'], kind: 'timber',
      h: 0.36, fenceH: 0.86, y: Y, seed: 8334,
      gate: { side: 'z-', at: 25.4, w: 1.2 },
    });
    /* The gate is at the east end and the path turns, which is how a plot this
     * shallow is actually laid out: straight in from the gate you would be
     * standing on the doorstep. `doorAt` is the generator's own frontage offset
     * (`w / 2 - 1.15`) in the *unit's* frame, so on a `z-` frontage it moves
     * west in world space. */
    const doorAt = ATT.w / 2 - 1.15;
    const [dx, dz] = p.at(doorAt, p.halfD + 0.62);
    stepStones(ctx, { from: [25.3, FENCE_Z + 0.55], to: [dx + 0.2, dz - 0.1], y: Y, n: 4, seed: 8335 });

    /* Everything a household leaves outside, in the unit's own frame and seated
     * on `ctx.groundAt`.  `laundry` is off and the pole placed by hand because
     * `dressPlot` picks its flank from the seed: half the time that is the east
     * flank, and a 2.2 m run of washing there would hang inside the carport. */
    dressPlot(ctx, {
      ...ATT, y: Y, doorAt, seed: 8336, gap: 1.6,
      clear: (x, z) => z > FENCE_Z + 0.1,
      aircon: true, gas: true, mat: true, pots: true, parcel: true, umbrella: true,
      /* `airconUp` puts the outdoor unit on the wall instead of on its feet in the
       * garden, which is where a 二階半's unit is: `dressPlot` places it with its
       * back 0.09 m off the frontage either way, and `makeAircon` draws the bracket
       * arms across that standoff once `feet` goes false. */
      airconUp: 1.5,
      bike: true, kidBike: true, laundry: false, garden: 1, tap: 1, flank: 0.85,
    });
    ctx.add(makeLaundryPole({ ctx, x: 20.25, z: 74.4, y: ctx.groundAt(20.25, 74.4), ry: Math.PI / 2, len: 2.2, n: 4, seed: 8337 }));
    ctx.add(makeCrates({ x: 20.4, z: 79.0, y: Y, n: 2, seed: 8338, ry: 0.3 }));
    shrubs.push({ x: 26.4, z: 72.6, y: Y, r: 0.42, count: 3, spread: 1.0, seed: 8339 });
  }

  /* --------------------------- the carport and its bay --------------------------- *
   * At the east end of the row, entered straight off the arm.  `makeCarport`'s
   * sheet falls toward +z, which is the street, so the water comes off it where
   * the gully is. */
  pad(ctx, {
    x: CARBAY.x, z: CARBAY.z, w: CARBAY.w, d: CARBAY.d, y: Y, h: 0.07,
    mat: gm.asphaltWorn, name: 'yonchomeCarBay',
  });
  laneLine(ctx, { axis: 'z', at: CARBAY.x - CARBAY.w / 2 + 0.1, from: 72.1, to: 76.7, y: Y + 0.09 });
  laneLine(ctx, { axis: 'z', at: CARBAY.x + CARBAY.w / 2 - 0.1, from: 72.1, to: 76.7, y: Y + 0.09 });
  ctx.add(makeCarport({ ctx, x: CARBAY.x, z: CARBAY.z + 0.2, y: Y + 0.07, ry: 0, w: 2.7, d: 4.6, h: 2.3 }));

  /* the back of the row: one big green mass in the slot behind the two
   * buildings, which is what stops the roof line running out into bare sky */
  shrubs.push({ x: 19.8, z: 77.8, y: Y, r: 0.5, count: 4, spread: 1.3, seed: 8360 });
  petals.push({ x: 22.0, z: 72.6, w: 7.0, d: 1.5, y: Y + 0.02, n: 60 });
  petals.push({ x: 13.6, z: 72.4, w: 6.0, d: 1.4, y: Y + 0.02, n: 50 });
}
