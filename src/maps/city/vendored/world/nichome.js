import * as THREE from 'three';
import { PAL } from '../core/palette.js';
import { cel, flat } from '../core/toon.js';
import { parkingSign, warningPlate, hallNotice, noParking } from '../core/textures.js';
import { box, cyl, bake, trs, rngKit } from '../core/util.js';
import { hullOutline } from '../core/outline.js';
import { groundY } from './street.js';
import { pad, lane, laneLine, meshFence, groundMats } from './ground.js';
import {
  plotBox, plotCollide, plotWall, hedgeRun, stepStones, refusePoint, dressPlot,
  laneGutter, bollardRow, poleRun,
} from './plots.js';
import { makeGarageHouse } from './blocks.js';
import { makeWalkup, makeTerrace, makeCarport, makeBikeShelter } from './housing.js';
import { makeShop } from './shops.js';
import { addVending } from './vending.js';
import {
  makeBench, makeBikeRack, makeBicycle, makeNoticeBoard, makePlanter, makeFlowerBed,
  makeMailboxBank, makeSignPost, makeMirror, makeTapPost, makeStorageShed, makeBucket,
  makeBroom, makeCrates, makeMilkCrate, makeIvy, makeLaundryPole, makeAircon,
  makeLoosePaper, makeCone, makeDoormat, makeVendBin, makeDeliveryBox, makeRecycleBox,
  makeUmbrellaStand, makePotShelf, makeCatBox, makeGuardrail,
} from './props.js';
import {
  makeWheelStops, makeLockerBank, makeKitchenGarden, makeScooter, makeKidBike,
  makeDryingRack, makeGasMeter, makeBallBox, makeChalkMarks,
} from './streetprops.js';

/* ------------------------------------------------------------------ *
 * ひばり台二丁目 -- the newer half of the district, east of the overbridge.
 *
 * Everything west of the crossing was built before the war and looks it.  This
 * is the other side of the same town: land that was paddy until somebody sold
 * it in one piece, so the plots are regular, the street has kerbs and edge
 * lines, and the buildings are render and steel rather than timber and tile.
 * It is the only block in the world that is *planned*, and that is its whole
 * job -- 一丁目 and 桜守裏町 only read as old because there is somewhere newer
 * to compare them with.
 *
 * It is also the block with a road in it rather than a lane, and the four
 * things nobody travels to: the clinic, the pharmacy, the coin laundry and the
 * estate agent.  `textures.js` has carried their fascias since the shopping
 * street was built and nothing had ever placed them; every one is a near-white
 * ground with one thin bar, deliberately, because a clinic that shouts is a
 * clinic nobody trusts and because さくら坂 is two streets away and must stay
 * the loudest thing in the district.
 *
 * ------------------------------------------------------------------ *
 * THE LAND, measured rather than assumed -- the 四丁目 lesson.  The envelope is
 * x 47.2..70, z 5..46, and what is already in it is:
 *
 *   the railway masking wall  z 4.60..5.00, top 2.20, running x 46 -> 118 with
 *                             its pier at x 45.47..46.09 (`railway.js`).  The
 *                             block's south boundary, and a hard one.
 *   公園前's link             a 2.2 m footway at z 15.15..17.35 running east to
 *                             x 47.35 -- "block 2's spine kerb".  This block
 *                             exists partly to give that link somewhere to
 *                             arrive (`koenmae.js`).
 *   公園前's 木造平屋         x 43.45..47.25, z 6.25..11.65, with its boundary
 *                             at z 11.91..12.19.  Its back wall is this
 *                             street's west edge for eight metres.
 *   児童公園's east railing   x 43.6, z 17.4..30.6 (`district.js`)
 *   公園前's service strip    x 42.9..47.3, z 35.0..43.4 -- ひばり荘's back
 *   the north lane's east arm x 40..48.6, z 43.5..46.9 (`northblock.js`), and
 *                             the boundary walls at x 47.6..49.0 / z 45.9..46.1
 *                             and x 48.9..49.1 / z 46.0..47.9
 *   片流れの平屋             x 42.90..48.70, z 47.80..53.40
 *   the guide sign            x 51.52..52.08, z 16.52..17.08, top 3.32 -- the
 *                             こ線橋 板 the link arrives past.  It stands in the
 *                             middle of what would otherwise be the T, so the
 *                             junction is laid round it.
 *
 * The ground is dead flat at y = 0 as far as z = 30 and then climbs to 0.45 by
 * z = 48, which the `lane` sweep follows for free; relief starts at about
 * x = 72, so nothing is built east of x = 70.
 *
 * ------------------------------------------------------------------ *
 * WHAT THE ARITHMETIC DECIDED
 *
 * **The spine runs the full 38 m and it is kerbed.**  It is the only new street
 * that joins two existing ones at both ends -- 公園前's link at z 16.25 and the
 * north lane's east arm at z 45.2 -- so it is a through route, and a through
 * route in this world gets kerbs, edge lines, gullies and a mirror.  The back
 * lanes deliberately have none of that, and the difference is the grammar: on
 * さくら坂裏路地 or 一丁目 the surface *is* the boundary, here there is a kerb
 * between you and the traffic.
 *
 * **Everything is on the east side.**  The west side is spoken for over its
 * whole length -- the 木造's back, then the park's railing, then ひばり荘's
 * service strip -- so a street with frontage on both sides was never available.
 * That turns out to be the best thing about it: you walk north with buildings
 * on your right and the park open on your left for thirteen metres, which is
 * the one place in the district where a street has a view *out* of it.
 *
 * **The park gets an east gate.**  `district.js` fenced 児童公園 on all four
 * sides with one opening, on the west, which was correct when there was nothing
 * east of it and is wrong now that a street runs down that side.  The east
 * railing is split for a 1.6 m gate at z 23.4..25.0 and the run ends in posts.
 * Recorded in NEXT.md with the rest of the nudges to existing content.
 *
 * **The far east is not built on.**  Past x = 66 the block becomes 貸農園 --
 * allotment beds, a tin store, a standpipe -- and then hedge, and then the
 * hills start.  An estate that ends in a straight line of identical back fences
 * reads as a render; one that ends in vegetables reads as a town.
 *
 * FLOODFILL -- every one of these must be reachable on foot from the spawn:
 *   spineS     [49.2,  8.0]   the south end, at the railway wall
 *   parkYard   [56.0, 11.6]   the 月極 car park's aisle
 *   spineT     [48.6, 16.3]   the T where 公園前's link arrives
 *   clinicDoor [51.6, 21.6]   outside ひばり台内科
 *   parkGate   [45.4, 24.2]   the park's new east gate, on the west footway
 *   spineMid   [49.2, 31.0]   the mouth of the 私道
 *   shido      [58.0, 31.0]   the 私道, between the 連棟 and the 狭小住宅
 *   shidoEnd   [64.6, 31.0]   its east end, at the allotment gate
 *   terraceA   [59.3, 29.9]   the 連棟's west front garden, in through its gate
 *   garageDoor [63.0, 33.2]   outside the 狭小住宅's bay
 *   heightsFr  [52.2, 37.6]   コーポ みなみ's gallery and its mailbox bank
 *   allotment  [67.5, 28.0]   the 貸農園, in through its gate
 *   spineN     [49.2, 44.4]   the north end, at the north lane's arm
 * ------------------------------------------------------------------ */

/* --------------------------- the spine --------------------------- */
const SP_X = 49.2;
const SP_W = 3.6;                      // carriageway x 47.40..51.00
const SP_Z0 = 6.8;
const SP_Z1 = 45.2;
const SP_E = SP_X + SP_W / 2;          // 51.00, the east kerb line
const SP_WK = SP_X - SP_W / 2;         // 47.40, the west one

const LINK_Z = 16.25;                  // 公園前's link, arriving from the west
const MASK_Z = 4.60;                   // the masking wall's north face
const PARK_X = 43.6;                   // 児童公園's east railing
const GATE_Z = 24.2;                   // the new east gate, centred
const ARM_Z = 45.2;                    // the north lane's east arm

/* the 私道: 2.0 m, unkerbed, and 3.0 m of clear ground between the two
 * frontages it runs between -- 2.32 m walkable after the player's own radius on
 * each side, which is the number that matters and not the pad's width */
const SD_Z = 31.0;
const SD_W = 2.0;
const SD_X0 = 51.2;
const SD_X1 = 65.6;

/* --------------------------- the plots ---------------------------
 * All five street buildings face 'x-', so `w` runs in z and `d` in x and a
 * plot's world footprint is x ± d/2, z ± w/2.  Writing it out once here rather
 * than in each call is the whole reason `plotBox` exists. */
const CARPARK = { x0: 51.6, x1: 61.8, z0: 6.8, z1: 12.4 };
const FUDOSAN = { x: 54.4, z: 15.4, w: 4.2, d: 5.2, face: 'x-' };   // x 51.8..57.0, z 13.3..17.5
const CLINIC = { x: 55.0, z: 21.6, w: 6.4, d: 5.6, face: 'x-' };    // x 52.2..57.8, z 18.4..24.8
const YAKKYOKU = { x: 54.6, z: 27.6, w: 4.4, d: 4.8, face: 'x-' };  // x 52.2..57.0, z 25.4..29.8
/* `makeWalkup` builds its open stair 1.6 m beyond the local -x end, outside the
 * mass, and for `face: 'x-'` local -x is world -z -- so the stair stands at
 * x 52.8..54.65, z 32.2..33.8, two metres south of the building it serves.  The
 * first draft put the 私道 at z 31.8 and the stair came down squarely into it:
 * the lane rendered perfectly and the flood fill walked straight into a
 * staircase.  The block's z is what has to give, not the lane's. */
const HEIGHTS = { x: 56.4, z: 37.6, w: 7.6, d: 6.6, face: 'x-' };   // x 53.1..59.7, z 33.8..41.4
const LAUNDRY = { x: 54.2, z: 43.8, w: 3.8, d: 4.4, face: 'x-' };   // x 52.0..56.4, z 41.9..45.7
/* and the two on the 私道, which face along z instead */
const TERRACE = { x: 62.2, z: 26.0, w: 8.7, units: 3, unitW: 2.9, d: 6.2, face: 'z+' }; // x 57.85..66.55, z 22.9..29.1
const GARAGE = { x: 63.0, z: 37.0, w: 5.0, d: 6.0, face: 'z-' };    // x 60.5..65.5, z 34.0..40.0
const ALLOT = { x0: 67.2, x1: 69.8, z0: 24.0, z1: 32.6 };

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
  M.woodDark = cel({ color: 0x74563f, bands: 3, tint: 0x554e74 });
  M.soil = cel({ color: 0x8f7a62, bands: 3, tint: 0x615a80 });
  return M;
}

export function buildNichome(ctx) {
  const m = mats();
  const gm = groundMats();
  const rng = rngKit(8500);
  const sakura = [];
  const shrubs = [];
  const grove = [];
  const petals = [];

  buildSpine(ctx, m, gm);
  buildWestSide(ctx, m, gm, sakura, shrubs, petals);
  buildCarPark(ctx, m, gm, shrubs);
  buildServices(ctx, m, gm, rng);
  buildHeights(ctx, m, gm, shrubs);
  buildShido(ctx, m, gm, rng, shrubs, petals);
  buildAllotment(ctx, m, gm, shrubs, grove);

  /* ---------------------------- poles and cabling ---------------------------- *
   * Down the *west* verge, all four of them.  The east side is frontage from
   * z 13 to 45 with setbacks of 1.2-2.1 m, and a 0.4 m pole butt standing in a
   * 1.2 m forecourt is in the way of the building it is lighting; the west side
   * is 3.5 m of verge for the whole length.  Two carry lamps -- the T at the
   * south and the 私道 mouth in the middle, which are the two places you have to
   * make a decision. */
  poleRun(ctx, {
    defs: [
      { x: 46.55, z: 18.0, y: ctx.groundAt(46.55, 18.0), h: 8.6, seed: 8561, armDir: 1, ry: -Math.PI / 2, lamp: true },
      { x: 46.55, z: 22.4, y: ctx.groundAt(46.55, 22.4), h: 8.4, seed: 8562, armDir: 1, ry: -Math.PI / 2 },
      /* Not at z = 31.4.  `koenmae.js`'s east link -- "the 1.4 m squeeze past
       * the grove tree", and the only way from its pocket square onto this
       * spine -- threads z 31.0..31.3 there, between the park's north railing
       * and a 1.45 m collider at x 44.75..45.85.  A pole is a 0.4 m box and the
       * player's radius is added to every side of it, so this one took 1.08 m
       * out of a 1.4 m gap and sealed a route in another district.  Two metres
       * south is still at the 私道's mouth and blocks nothing. */
      { x: 46.55, z: 28.6, y: ctx.groundAt(46.55, 28.6), h: 8.6, seed: 8563, armDir: 1, ry: -Math.PI / 2, lamp: true },
      { x: 46.70, z: 39.6, y: ctx.groundAt(46.70, 39.6), h: 8.4, seed: 8564, armDir: 1, ry: -Math.PI / 2 },
    ],
    chains: [[0, 1], [1, 2], [2, 3]],
    /* service drops into the two buildings big enough to need one.  Both
     * targets are world points on the frontage, well below the crossarms. */
    drops: [[1, [52.3, 4.6, 21.6]], [3, [53.2, 6.2, 36.8]]],
    offsets: [[0, -0.42], [-0.4, 0.28]],
  });

  /* -------------------------------- planting --------------------------------
   * The street's own trees are in the west verge and at the far junction;
   * everything else here is the *edge* of the block, which is
   * where the mass has to be, because from the overbridge deck this is the last
   * built thing before the horizon and a flat run of roofs against sky is what
   * the empty-sky note in NEXT.md is about. */
  sakura.push({ x: 45.9, z: 33.4, y: ctx.groundAt(45.9, 33.4), scale: 1.24, seed: 8572, lean: 0.09, leanDir: 4.3 });
  sakura.push({ x: 51.9, z: 44.2, y: ctx.groundAt(51.9, 44.2), scale: 1.1, seed: 8573, lean: 0.12, leanDir: 2.6 });
  /* the block's back edge: a green line along x ~ 68 from the terrace's east
   * gable up to the 狭小住宅, so the estate ends in trees rather than in fences */
  grove.push({ x: 68.6, z: 22.0, y: ctx.groundAt(68.6, 22.0), scale: 1.5, seed: 8574, spread: 1.15 });
  grove.push({ x: 68.9, z: 41.0, y: ctx.groundAt(68.9, 41.0), scale: 1.6, seed: 8575, spread: 1.2 });
  grove.push({ x: 63.4, z: 43.2, y: ctx.groundAt(63.4, 43.2), scale: 1.4, seed: 8576, spread: 1.1 });
  grove.push({ x: 60.0, z: 16.4, y: ctx.groundAt(60.0, 16.4), scale: 1.35, seed: 8577, spread: 1.05 });
  shrubs.push({ x: 63.8, z: 19.6, y: ctx.groundAt(63.8, 19.6), r: 0.5, count: 4, spread: 1.35, seed: 8578 });
  shrubs.push({ x: 58.4, z: 44.2, y: ctx.groundAt(58.4, 44.2), r: 0.46, count: 3, spread: 1.15, seed: 8579 });

  petals.push({ x: SP_X, z: 15.6, w: 3.4, d: 7.0, y: 0.08, n: 80 });
  petals.push({ x: SP_X, z: 33.6, w: 3.4, d: 6.0, y: 0.13, n: 70 });
  petals.push({ x: 51.6, z: 44.0, w: 3.0, d: 2.6, y: 0.45, n: 40 });

  return { sakura, shrubs, grove, petals };
}

/* ------------------------------------------------------------------ *
 * The spine.
 * ------------------------------------------------------------------ */

function buildSpine(ctx, m, gm) {
  lane(ctx, {
    axis: 'z', at: SP_X, from: SP_Z0, to: SP_Z1, w: SP_W,
    mat: gm.asphalt, kerb: true, rise: 0.05, name: 'nichomeSpine',
  });
  // 路側帯 both sides, the marking a maintained street has and a lane does not
  laneLine(ctx, { axis: 'z', at: SP_WK + 0.26, from: SP_Z0 + 0.6, to: SP_Z1 - 0.6, y: 0.09 });
  laneLine(ctx, { axis: 'z', at: SP_E - 0.26, from: SP_Z0 + 0.6, to: SP_Z1 - 0.6, y: 0.09 });

  /* Gullies rather than a slotted channel: a kerbed street drains into gratings
   * at the kerb line, and getting that difference right is most of why this
   * street reads as newer than 一丁目's. */
  {
    const parts = [];
    for (const z of [11.2, 20.6, 30.0, 39.4]) {
      parts.push({
        geometry: new THREE.BoxGeometry(0.42, 0.05, 0.62),
        matrix: trs(SP_E - 0.22, ctx.groundAt(SP_E - 0.22, z) + 0.055, z),
      });
    }
    for (const z of [16.0, 35.2]) {
      parts.push({
        geometry: new THREE.CylinderGeometry(0.31, 0.31, 0.05, 12),
        matrix: trs(SP_X + 0.8, ctx.groundAt(SP_X + 0.8, z) + 0.06, z),
      });
    }
    const mesh = new THREE.Mesh(bake(parts), m.drain);
    mesh.receiveShadow = true;
    ctx.add(mesh);
  }

  /* ------------------------------ the south end ------------------------------ *
   * The street stops 1.8 m short of the railway masking wall, and what is there
   * is a guardrail and the wall.  It is the only place in the district where you
   * stand on a street and the railway is a *blank* -- 2.2 m of concrete with the
   * catenary over it and the train going past behind -- and that is worth having
   * once.  A wall ends in a pier; this one already does, at x 45.47..46.09. */
  ctx.add(makeGuardrail({ ctx,
    x: SP_X, z: MASK_Z + 1.0, y: ctx.groundAt(SP_X, MASK_Z + 1.0), len: 4.6, ry: 0,
  }));
  ctx.add(makeSignPost({
    x: SP_E + 0.5, z: MASK_Z + 1.5, y: ctx.groundAt(SP_E + 0.5, MASK_Z + 1.5), ry: -Math.PI / 2,
    h: 2.0, postMat: m.metal,
    plates: [{ map: warningPlate(0), w: 0.46, h: 0.62, y: 1.5, double: true }],
  }));
  ctx.add(makeCone({ x: SP_WK + 0.5, z: MASK_Z + 1.5, y: ctx.groundAt(SP_WK + 0.5, MASK_Z + 1.5), ry: 0.4 }));

  /* --------------------------------- the T --------------------------------- *
   * 公園前's link arrives at z 15.15..17.35 and the こ線橋 guide sign already
   * stands at x 51.52..52.08 / z 16.52..17.08 -- inside what would be the
   * junction's north-east quadrant.  So the mouth is laid *round* it: the
   * junction slab stops at x 51.4 and the name plate goes on the south side,
   * where there is 2.4 m of clear verge. */
  pad(ctx, {
    x: SP_X - 0.2, z: LINK_Z, w: SP_W + 1.6, d: 2.6, y: 0, h: 0.08,
    mat: gm.asphalt, name: 'nichomeT',
  });
  bollardRow(ctx, { axis: 'z', at: 47.05, from: 15.3, to: 17.2, n: 3, y: 0 });

  /* -------------------------------- the north T -------------------------------- *
   * `northblock.js` lays its east arm as a pad over x 40..48.6, z 43.5..46.9 and
   * finishes it there, so the spine's last two metres and the tie into that
   * surface are this block's to build.  0.09 m to match the arm exactly -- laid
   * at the spine's 0.05 it would leave a lip right across the junction, which is
   * the mistake 四丁目 records at its own arm. */
  const armY = ctx.groundAt(48.0, ARM_Z);
  pad(ctx, {
    x: 50.0, z: ARM_Z, w: 4.4, d: 3.4, y: armY - 0.09, h: 0.09,
    mat: gm.asphaltWorn, name: 'nichomeNorthT',
  });
  ctx.add(makeMirror({ x: SP_E + 0.55, z: ARM_Z - 1.5, y: ctx.groundAt(SP_E + 0.55, ARM_Z - 1.5), ry: -2.4, h: 2.5, r: 0.42 }));
  laneLine(ctx, { axis: 'x', at: ARM_Z - 1.7, from: 48.4, to: 50.9, y: armY + 0.02 });
}

/* ------------------------------------------------------------------ *
 * The west side: the footway, the park's new east gate, the notice corner.
 * ------------------------------------------------------------------ */

function buildWestSide(ctx, m, gm, sakura, shrubs, petals) {
  /* A 1.9 m footway the whole length, which the east side does not get: on the
   * east you step off the kerb into a forecourt every few metres, and on the
   * west there is a railing for thirteen metres with nothing to step into. */
  pad(ctx, {
    x: 45.85, z: 29.0, w: 1.9, d: 32.6, y: 0, h: 0.11,
    mat: gm.sidewalk, name: 'nichomeWalk',
  });
  {
    // the kerb face, so the footway reads as a footway and not as a pale slab
    const kerb = box(0.16, 0.13, 32.6, gm.curb, 46.88, 0.065, 29.0);
    kerb.receiveShadow = true;
    ctx.add(kerb);
  }

  /* -------------------------- the notice corner --------------------------
   * The pocket between 公園前's 木造 boundary (z 12.19) and the park's south-east
   * corner (z 17.4) is too small for a roof.  The board sits just north of it,
   * against the park edge, leaving the overbridge stair approach unobstructed. */
  ctx.add(makeNoticeBoard({ ctx,
    x: 44.25, z: 18.0, y: ctx.groundAt(44.25, 18.0), ry: -Math.PI / 2,
    w: 1.8, h: 1.2, y0: 0.85,
    sheets: [
      { map: hallNotice(0), x: -0.52, y: 0.02, w: 0.42, h: 0.58, tilt: 0.02 },
      { map: hallNotice(1), x: 0.02, y: -0.02, w: 0.42, h: 0.58, tilt: -0.015 },
      { map: hallNotice(2), x: 0.56, y: 0.01, w: 0.42, h: 0.58 },
    ],
  }));
  ctx.add(makeRecycleBox({ x: 44.5, z: 15.6, y: ctx.groundAt(44.5, 15.6), ry: -Math.PI / 2 }));
  /* **No bench here.**  One stood at (45.0, 11.9) turned along the frontage, and
   * the 木造二階建's own veranda and its railing are at x 44.6..45.4 over exactly
   * that z: half the seat and one leg were inside the render, and the half you
   * could see was a bench facing the wall a hand's width away.  The recycling box
   * and the planter are the frontage's furniture; a bench needs somewhere to look. */
  ctx.add(makePlanter({ x: 44.4, z: 11.0, y: ctx.groundAt(44.4, 11.0), r: 0.26, flower: true, seed: 8511, n: 5 }));
  ctx.add(makeLoosePaper(ctx, [{ x: 46.2, z: 12.4, y: 0.12, ry: 1.1 }]) ?? new THREE.Group());
  shrubs.push({ x: 44.2, z: 9.6, y: ctx.groundAt(44.2, 9.6), r: 0.44, count: 3, spread: 1.0, seed: 8512 });

  /* ------------------------- the park's east gate -------------------------
   * `district.js` fences 児童公園 on all four sides and leaves one opening, on
   * the west, which was right when there was nothing east of it.  A street down
   * the east side and no way in from it is the kind of thing that looks fine in
   * every frame and is wrong the moment anybody walks it, so the railing is
   * split (see `buildChildrensPark`) and this is the gate's own furniture: two
   * posts, a threshold slab and the paving that takes you off the footway. */
  {
    const gy = ctx.groundAt(PARK_X, GATE_Z);
    pad(ctx, {
      x: PARK_X + 0.9, z: GATE_Z, w: 3.4, d: 2.4, y: gy, h: 0.08,
      mat: gm.concrete, name: 'nichomeParkGate',
    });
    for (const s of [-1, 1]) {
      const pz = GATE_Z + s * 0.86;
      const post = box(0.17, 1.34, 0.17, m.concreteMid, PARK_X, gy + 0.67, pz);
      post.castShadow = true;
      ctx.add(post);
      ctx.add(box(0.23, 0.05, 0.23, m.concrete, PARK_X, gy + 1.36, pz));
      ctx.collide(PARK_X - 0.1, pz - 0.1, PARK_X + 0.1, pz + 0.1, gy + 1.38);
    }
    ctx.add(makeSignPost({
      x: PARK_X + 0.5, z: GATE_Z + 1.5, y: gy, ry: -Math.PI / 2, h: 1.6, postMat: m.metal,
      plates: [{ map: warningPlate(2), w: 0.42, h: 0.56, y: 1.3 }],
    }));
  }

  /* Two street trees in pits and a bench looking into the park.  The pit is what
   * makes a street tree a street tree rather than a tree in a field -- kerb
   * ring, soil, stake -- and this is the only new street kept enough to have
   * them besides 四丁目's. */
  for (const [tz, sc, sd] of [[19.8, 1.16, 8513], [28.6, 1.22, 8514]]) {
    treePit(ctx, m, gm, { x: 45.0, z: tz, y: ctx.groundAt(45.0, tz) });
    sakura.push({ x: 45.0, z: tz, y: ctx.groundAt(45.0, tz), scale: sc, seed: sd, lean: 0.1, leanDir: 4.6 });
  }
  ctx.add(makeBench({ x: 45.0, z: 26.6, y: ctx.groundAt(45.0, 26.6), ry: Math.PI / 2, len: 1.8 }));
  ctx.add(makeFlowerBed({ x: 44.4, z: 21.8, w: 1.0, d: 2.2, y: ctx.groundAt(44.4, 21.8), seed: 8515, n: 10 }));

  /* --------------------------- the refuse point ---------------------------
   * In the gap between the park's north-east corner (z 30.6) and 公園前's
   * service strip (z 35.0), which is 4.4 m and the only piece of the west side
   * that is neither railing nor somebody's back.  A built enclosure rather than
   * three bins on the pavement, because this one serves a walk-up. */
  refusePoint(ctx, {
    kind: 'house', x: 45.3, z: 32.6, y: ctx.groundAt(45.3, 32.6), ry: -Math.PI / 2, plate: 2, seed: 8516,
  });
  // The southern blue bicycle occupied z = 33.78 and entered the street tree's
  // pit.  Keep the other two at their existing positions.
  ctx.add(makeBikeRack({ x: 45.4, z: 34.71, y: ctx.groundAt(45.4, 34.71), n: 2, spacing: 0.62, ry: 0, seed: 205 }));
  petals.push({ x: 45.2, z: 24.0, w: 2.4, d: 12.0, y: 0.12, n: 70 });
}

/** A street tree's pit: a kerb ring, the soil in it, and the stake and tie. */
function treePit(ctx, m, gm, o) {
  const R = 0.6;
  const soil = box(R * 2 - 0.16, 0.05, R * 2 - 0.16, m.soil, o.x, o.y + 0.03, o.z);
  soil.receiveShadow = true;
  ctx.add(soil);
  const rim = [];
  for (const s of [-1, 1]) {
    rim.push({ geometry: new THREE.BoxGeometry(R * 2, 0.11, 0.13), matrix: trs(o.x, o.y + 0.055, o.z + s * (R - 0.065)) });
    rim.push({ geometry: new THREE.BoxGeometry(0.13, 0.11, R * 2 - 0.26), matrix: trs(o.x + s * (R - 0.065), o.y + 0.055, o.z) });
  }
  const ring = new THREE.Mesh(bake(rim), gm.curb);
  ring.receiveShadow = true;
  ctx.add(ring);
  // the stake and its tie, on the windward side
  const stake = cyl(0.045, 0.045, 1.7, 6, m.woodDark, o.x - 0.3, o.y + 0.85, o.z + 0.16);
  stake.castShadow = true;
  ctx.add(stake);
  ctx.add(box(0.36, 0.05, 0.05, m.wood, o.x - 0.14, o.y + 1.45, o.z + 0.16));
}

/* ------------------------------------------------------------------ *
 * 月極駐車場 -- the monthly car park, along the railway wall.
 *
 * The strip between the masking wall and the first frontage is 8.4 m deep and
 * has a railway behind it, which is not somewhere anybody builds a house.  A
 * car park is what actually goes there, and it does three jobs at once: it
 * gives the spine's south end a reason to exist, it puts the block's one
 * vending machine somewhere plausible, and its open surface is what lets you
 * see the wall and the catenary from the street.
 * ------------------------------------------------------------------ */

function buildCarPark(ctx, m, gm, shrubs) {
  const Y = 0;
  const w = CARPARK.x1 - CARPARK.x0, d = CARPARK.z1 - CARPARK.z0;
  const cx = (CARPARK.x0 + CARPARK.x1) / 2, cz = (CARPARK.z0 + CARPARK.z1) / 2;
  pad(ctx, { x: cx, z: cz, w, d, y: Y, h: 0.07, mat: gm.gravel, name: 'nichomeCarPark' });

  /* Four bays nose-in off the aisle, which runs along the north edge.  The bays
   * are 3.6 m deep and 2.4 m apart: a kei car is 3.4 x 1.48, and this district
   * has exactly one vehicle in it, so what has to be right is the *markings*
   * rather than the clearance. */
  const BAY_Z0 = CARPARK.z0 + 0.4, BAY_Z1 = BAY_Z0 + 3.6;
  const xs = [53.0, 55.4, 57.8, 60.2];
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i];
    for (const s of [-1, 1]) {
      laneLine(ctx, { axis: 'z', at: x + s * 1.15, from: BAY_Z0, to: BAY_Z1, y: Y + 0.09 });
    }
    ctx.add(makeWheelStops({ x, z: BAY_Z0 + 0.55, y: Y + 0.07, ry: 0, n: 1, gauge: 1.4 }));
    /* the bay number on a small plate at the head of each bay, which is what
     * makes a 月極 park read as let rather than as public */
    ctx.add(makeSignPost({
      x: x - 1.15, z: BAY_Z0 + 0.1, y: Y + 0.07, ry: Math.PI, h: 0.62, postMat: m.metalDark,
      plates: [{ map: noParking(), w: 0.26, h: 0.2, y: 0.52 }],
    }));
  }
  laneLine(ctx, { axis: 'x', at: BAY_Z1, from: 51.9, to: 61.5, y: Y + 0.09 });

  /* the boundary: mesh to the railway on the south and the east, nothing on the
   * north where the aisle meets the street -- a car park you cannot drive into
   * is a yard */
  meshFence(ctx, { axis: 'x', at: CARPARK.z0 - 0.15, from: CARPARK.x0, to: CARPARK.x1, y: Y, h: 1.5, spacing: 2.2, mid: true });
  meshFence(ctx, { axis: 'z', at: CARPARK.x1 + 0.15, from: CARPARK.z0, to: CARPARK.z1 - 1.4, y: Y, h: 1.5, spacing: 2.2, mid: true });

  /* The 月極 board, on the aisle's west end where a driver turning in reads it,
   * and the machine beside it.  `parkingSign` is the coin-park board the north
   * block already uses; this is the same street furniture family, which is the
   * point -- one company runs both. */
  ctx.add(makeSignPost({
    x: 52.2, z: CARPARK.z1 - 0.5, y: Y + 0.07, ry: -Math.PI / 2, h: 2.3, postMat: m.metal,
    plates: [{ map: parkingSign(), w: 1.0, h: 0.74, y: 1.7, double: true }],
  }));
  /* The block's one interaction.  Eleven of the world's twelve live in the old
   * half; a machine at the mouth of a car park beside a railway wall is the most
   * ordinary place in Japan to find one, and it means the new half has something
   * you can press E on.  `ry` is the outward normal and the machine faces +Z at
   * ry 0, so facing west down the street is -PI/2. */
  addVending(ctx, {
    x: 51.95, z: 10.4, y: Y, ry: -Math.PI / 2, variant: 1, seed: 41,
    label: '自動販売機  E  buy a drink',
  });
  ctx.add(makeVendBin({ x: 51.95, z: 9.3, y: Y, ry: -Math.PI / 2 }));

  /* what accumulates at the back of a car park by a railway */
  ctx.add(makeCrates({ x: 61.0, z: 7.6, y: Y + 0.07, n: 3, seed: 8521, ry: 0.2 }));
  ctx.add(makeCone({ x: 58.9, z: 11.9, y: Y + 0.07, ry: -0.3, tilt: 0.05 }));
  ctx.add(makeCone({ x: 55.2, z: 12.0, y: Y + 0.07, ry: 0.5 }));
  ctx.add(makeBicycle({ x: 61.3, z: 10.2, y: Y + 0.07, ry: Math.PI / 2, lean: 0.08, color: 0x6a7d5c }));
  ctx.add(makeScooter({ x: 52.6, z: 12.0, y: Y + 0.07, ry: -1.5, color: 0x5f6f7a, lean: 0.05 }));
  shrubs.push({ x: 61.6, z: 13.4, y: Y, r: 0.46, count: 3, spread: 1.15, seed: 8523 });
  shrubs.push({ x: 50.2, z: 6.4, y: Y, r: 0.42, count: 3, spread: 1.0, seed: 8524 });
}

/* ------------------------------------------------------------------ *
 * The four services.
 *
 * Small, quiet and not adjacent: the estate agent at the T, the clinic and its
 * pharmacy together in the middle (they always are), the coin laundry up at the
 * north corner where the flats are.  Two storeys each with the family or the
 * consulting rooms over the shop, which is what keeps them the same height as
 * the housing and stops the row reading as a parade.
 * ------------------------------------------------------------------ */

function buildServices(ctx, m, gm, rng) {
  /* ---------------------------- ひばり不動産 ---------------------------- */
  {
    const p = plotBox(FUDOSAN);
    makeShop(ctx, {
      ...FUDOSAN, y: ctx.groundAt(FUDOSAN.x, FUDOSAN.z), kind: 'fudosan', floors: 2,
      seed: 8531, awning: false, shutter: 0, wall: 3, blade: false,
    });
    frontApron(ctx, gm, p, 1.1, 'nichomeFudosanApron');
    /* The window cards are the whole character of an estate agent, and this one
     * cannot have any: every card in a real window is a photograph of a room.
     * So the frontage carries the boards and the plants instead, and the notion
     * that somebody works here is left to the bicycle and the swept step. */
    const [bx, bz] = p.at(-1.2, p.halfD + 0.72);
    ctx.add(makeNoticeBoard({ ctx,
      x: bx, z: bz, y: ctx.groundAt(bx, bz), ry: p.outRy, w: 1.5, h: 1.05, y0: 0.8, wood: 0x8a6f52,
      sheets: [
        { map: hallNotice(2), x: -0.42, w: 0.4, h: 0.55, tilt: 0.02 },
        { map: hallNotice(0), x: 0.14, y: -0.02, w: 0.4, h: 0.55, tilt: -0.012 },
      ],
    }));
    const [px, pz] = p.at(0.7, p.halfD + 0.42);
    ctx.add(makePlanter({ x: px, z: pz, y: ctx.groundAt(px, pz), r: 0.28, flower: true, seed: 8532, n: 6 }));
    const [dx, dz] = p.at(0.2, p.halfD + 0.18);
    ctx.add(makeDoormat({ x: dx, z: dz, y: ctx.groundAt(dx, dz), ry: p.outRy }));
    const [kx, kz] = p.at(2.0, p.halfD + 0.55);
    // Parallel to the shopfront: turned across it, the rear wheel entered the wall.
    ctx.add(makeBicycle({ x: kx, z: kz, y: ctx.groundAt(kx, kz), ry: p.outRy, lean: 0.06, color: 0x9c5a4a }));
    ctx.add(makeAircon({
      x: FUDOSAN.x - FUDOSAN.d / 2 - 0.24, z: FUDOSAN.z + 1.5, y: ctx.groundAt(51.9, FUDOSAN.z + 1.5) + 2.9,
      ry: -Math.PI / 2, w: 0.84, h: 0.58, feet: false,
    }));
  }

  /* ---------------------------- ひばり台内科 ---------------------------- */
  {
    const p = plotBox(CLINIC);
    makeShop(ctx, {
      ...CLINIC, y: ctx.groundAt(CLINIC.x, CLINIC.z), kind: 'clinic', floors: 2,
      seed: 8533, awning: false, shutter: 0, wall: 0, blade: false,
    });
    frontApron(ctx, gm, p, 1.15, 'nichomeClinicApron');
    /* A clinic's forecourt is the one in this world with a *ramp*, and it is not
     * decoration: it is the single detail that says who comes here.  1:12 over
     * the 0.16 m step up to the door, with a handrail on the open side. */
    {
      /* The ramp runs out of the frontage along the plot's local +Z, which for
       * `face: 'x-'` is world -x, and its width runs along local X, which is
       * world +z.  Both directions are taken from `plotBox` rather than written
       * down, so the handrail's posts march *along* the ramp instead of landing
       * on top of each other -- which is what `czr + s * 0.56 + t * 0` did. */
      const RL = 1.5, RW = 1.2, RISE = 0.17;
      const [cxr, czr] = p.at(-2.15, p.halfD + RL / 2);
      const ry = ctx.groundAt(cxr, czr);
      const ramp = box(Math.abs(p.fx) * RL + Math.abs(p.lx) * RW, 0.2,
        Math.abs(p.fz) * RL + Math.abs(p.lz) * RW, gm.concrete, cxr, ry + 0.08, czr);
      ramp.rotation.z = 0.1 * Math.sign(p.fx || 1);
      ramp.receiveShadow = true;
      ctx.add(ramp);
      ctx.platform({
        x0: cxr - (Math.abs(p.fx) * RL + Math.abs(p.lx) * RW) / 2,
        x1: cxr + (Math.abs(p.fx) * RL + Math.abs(p.lx) * RW) / 2,
        z0: czr - (Math.abs(p.fz) * RL + Math.abs(p.lz) * RW) / 2,
        z1: czr + (Math.abs(p.fz) * RL + Math.abs(p.lz) * RW) / 2,
        top: ry + RISE,
      });
      for (const s of [-1, 1]) {
        // the rail itself, lying along the run
        const [hx, hz] = p.at(-2.15 + s * RW / 2, p.halfD + RL / 2);
        const rail = cyl(0.03, 0.03, RL, 8, m.metal, hx, ry + 0.92, hz);
        rail.rotation.set(Math.abs(p.fz) > 0.5 ? Math.PI / 2 : 0, 0,
          Math.abs(p.fx) > 0.5 ? Math.PI / 2 : 0);
        rail.castShadow = true;
        ctx.add(rail);
        for (const t of [-RL / 2 + 0.2, RL / 2 - 0.2]) {
          const [px, pz] = p.at(-2.15 + s * RW / 2, p.halfD + RL / 2 + t);
          ctx.add(cyl(0.03, 0.03, 0.88, 8, m.metal, px, ry + 0.5, pz));
        }
      }
    }
    const [sx, sz] = p.at(0.6, p.halfD + 0.62);
    ctx.add(makeSignPost({
      x: sx, z: sz, y: ctx.groundAt(sx, sz), ry: p.outRy, h: 1.9, postMat: m.metal,
      plates: [{ map: hallNotice(0), w: 0.62, h: 0.86, y: 1.32 }],
    }));
    const [ux, uz] = p.at(2.1, p.halfD + 0.36);
    ctx.add(makeUmbrellaStand({ x: ux, z: uz, y: ctx.groundAt(ux, uz), ry: p.outRy, seed: 8534 }));
    const [mx, mz] = p.at(-0.6, p.halfD + 0.2);
    ctx.add(makeDoormat({ x: mx, z: mz, y: ctx.groundAt(mx, mz), ry: p.outRy }));
    /* the bike parking a clinic actually needs, at the north end of its plot and
     * running *along* the frontage so the machines lie parallel to it */
    const [rx, rz] = p.at(2.7, p.halfD + 0.95);
    ctx.add(makeBikeRack({ x: rx, z: rz, y: ctx.groundAt(rx, rz), n: 4, spacing: 0.6, ry: p.outRy + Math.PI / 2, seed: 206 }));
    ctx.add(makeAircon({
      x: CLINIC.x + CLINIC.d / 2 + 0.24, z: CLINIC.z - 1.9,
      y: ctx.groundAt(CLINIC.x + CLINIC.d / 2 + 0.24, CLINIC.z - 1.9), ry: Math.PI / 2, w: 0.9, h: 0.62,
    }));
    ctx.add(makeAircon({
      x: CLINIC.x + CLINIC.d / 2 + 0.24, z: CLINIC.z + 1.4,
      y: ctx.groundAt(57.9, CLINIC.z + 1.4) + 3.1, ry: Math.PI / 2, w: 0.9, h: 0.62, feet: false,
    }));
  }

  /* ---------------------------- くすり さかい ---------------------------- */
  {
    const p = plotBox(YAKKYOKU);
    makeShop(ctx, {
      ...YAKKYOKU, y: ctx.groundAt(YAKKYOKU.x, YAKKYOKU.z), kind: 'yakkyoku', floors: 2,
      seed: 8535, awning: 1, shutter: 0.18, wall: 1, blade: false,
    });
    frontApron(ctx, gm, p, 1.15, 'nichomeYakkyokuApron');
    const [dx, dz] = p.at(0.4, p.halfD + 0.2);
    ctx.add(makeDoormat({ x: dx, z: dz, y: ctx.groundAt(dx, dz), ry: p.outRy }));
    const [cx1, cz1] = p.at(-1.5, p.halfD + 0.4);
    ctx.add(makeCrates({ x: cx1, z: cz1, y: ctx.groundAt(cx1, cz1), n: 2, seed: 8536, ry: p.outRy + 0.1 }));
    const [gx, gz] = p.at(1.5, p.halfD + 0.46);
    ctx.add(makePlanter({ x: gx, z: gz, y: ctx.groundAt(gx, gz), r: 0.24, flower: false, seed: 8537, n: 4 }));
    ctx.add(makeGasMeter({
      x: YAKKYOKU.x + YAKKYOKU.d / 2 + 0.16, z: YAKKYOKU.z + 1.5,
      y: ctx.groundAt(YAKKYOKU.x + YAKKYOKU.d / 2 + 0.16, YAKKYOKU.z + 1.5), ry: Math.PI / 2,
    }));
    /* the 0.6 m party gap between the clinic and the pharmacy, meshed off at the
     * street: a gap that reads as a way through and is a fifth of what a body
     * needs is the most-reported bug in this project */
    meshFence(ctx, { axis: 'z', at: 52.3, from: 24.9, to: 25.4, y: 0, h: 1.7, spacing: 1.0, mid: false });
  }

  /* ------------------------ コインランドリー ひばり ------------------------ */
  {
    const p = plotBox(LAUNDRY);
    makeShop(ctx, {
      ...LAUNDRY, y: ctx.groundAt(LAUNDRY.x, LAUNDRY.z), kind: 'laundry', floors: 1,
      seed: 8538, awning: false, shutter: 0, wall: 4, blade: false, h1: 3.1,
    });
    frontApron(ctx, gm, p, 1.3, 'nichomeLaundryApron');
    /* A coin laundry is single storey, it is lit at night, and it has a bench
     * and a bin outside because people wait.  It is the one unit here whose
     * whole frontage is glass, which is why it is at the north end -- against
     * the sky at the top of the street it is the thing that stops the row. */
    const [bx, bz] = p.at(-1.1, p.halfD + 0.75);
    ctx.add(makeBench({ x: bx, z: bz, y: ctx.groundAt(bx, bz), ry: p.outRy, len: 1.5 }));
    const [vx, vz] = p.at(1.3, p.halfD + 0.5);
    ctx.add(makeVendBin({ x: vx, z: vz, y: ctx.groundAt(vx, vz), ry: p.outRy }));
    const [mx, mz] = p.at(0.1, p.halfD + 0.2);
    ctx.add(makeDoormat({ x: mx, z: mz, y: ctx.groundAt(mx, mz), ry: p.outRy }));
    ctx.add(makeAircon({
      x: LAUNDRY.x - LAUNDRY.d / 2 - 0.24, z: LAUNDRY.z - 1.4,
      y: ctx.groundAt(51.8, LAUNDRY.z - 1.4), ry: -Math.PI / 2, w: 0.86, h: 0.6,
    }));
    /* the extract stack a laundry has and nothing else in this world does: four
     * ducts up the flank, which is the detail that identifies the building from
     * the far end of the street */
    {
      const parts = [];
      for (let i = 0; i < 4; i++) {
        const z = LAUNDRY.z - 1.5 + i * 1.0;
        parts.push({ geometry: new THREE.CylinderGeometry(0.11, 0.11, 3.3, 8), matrix: trs(56.62, ctx.groundAt(56.62, z) + 1.65, z) });
        parts.push({ geometry: new THREE.BoxGeometry(0.3, 0.16, 0.3), matrix: trs(56.62, ctx.groundAt(56.62, z) + 3.36, z) });
      }
      const mesh = new THREE.Mesh(bake(parts), m.metalDark);
      mesh.castShadow = mesh.receiveShadow = true;
      ctx.add(mesh);
    }
  }
}

/** The strip of paving a shop puts between its frontage and the kerb. */
function frontApron(ctx, gm, p, depth, name) {
  const [ax, az] = p.at(0, p.halfD + depth / 2);
  const along = Math.abs(p.lx) * p.w + Math.abs(p.fx) * depth;
  const across = Math.abs(p.lz) * p.w + Math.abs(p.fz) * depth;
  pad(ctx, {
    x: ax, z: az, w: along, d: across, y: ctx.groundAt(ax, az) - 0.0, h: 0.09,
    mat: gm.concrete, name: name ?? 'apron',
  });
}

/* ------------------------------------------------------------------ *
 * コーポ みなみ -- the three-storey block, and the biggest thing on the street.
 *
 * `plate: 3` and not 1: `blockPlate`'s names are appended and never reordered,
 * 0 is 三丁目's ひばり台コーポ and 2 is 四丁目's ハイツ ひばり, so this is the
 * next unused one.  Two blocks in one town with the same name plate is the kind
 * of detail nobody looks for and everybody notices.
 * ------------------------------------------------------------------ */

function buildHeights(ctx, m, gm, shrubs) {
  const Y = ctx.groundAt(HEIGHTS.x, HEIGHTS.z);
  const p = plotBox(HEIGHTS);
    const b = makeWalkup({
      ...HEIGHTS, y: Y, floors: 3, units: 3, seed: 8541, wall: 4, roof: 0, door: 2, plate: 3, ctx,
    });
    ctx.add(b);

  /* The forecourt: 2.1 m between the gallery and the kerb, stopping short of
   * the refuse enclosure so its own slab remains on the natural ground. */
  const fx = HEIGHTS.x - HEIGHTS.d / 2;            // 53.1, the gallery frontage
  pad(ctx, {
    x: fx - 1.05, z: HEIGHTS.z + 0.5, w: 2.1, d: HEIGHTS.w - 0.6, y: Y, h: 0.09,
    mat: gm.concrete, name: 'nichomeHeightsCourt',
  });
  const gA = (x, z) => ctx.groundAt(x, z);
  /* Nine flats, so nine boxes: 3 x 3.  A mailbox bank with the wrong number of
   * doors on it is the one detail on a block like this that anybody checks. */
  ctx.add(makeMailboxBank({ x: fx - 0.55, z: HEIGHTS.z - 2.6, y: gA(fx - 0.55, HEIGHTS.z - 2.6), ry: -Math.PI / 2, cols: 3, rows: 3 }));
  ctx.add(makeLockerBank({ x: fx - 0.6, z: HEIGHTS.z - 1.3, y: gA(fx - 0.6, HEIGHTS.z - 1.3), ry: -Math.PI / 2 }));
  ctx.collide(fx - 0.9, HEIGHTS.z - 2.0, fx - 0.3, HEIGHTS.z - 0.6, Y + 1.85);
  ctx.add(makeNoticeBoard({ ctx,
    x: fx - 0.42, z: HEIGHTS.z + 0.6, y: gA(fx - 0.42, HEIGHTS.z + 0.6), ry: -Math.PI / 2,
    w: 1.3, h: 0.9, y0: 0.95, wood: 0x8a6f52,
    sheets: [
      { map: hallNotice(1), x: -0.3, w: 0.38, h: 0.52, tilt: 0.015 },
      { map: hallNotice(2), x: 0.28, y: -0.01, w: 0.38, h: 0.52 },
    ],
  }));
  ctx.add(makeBikeShelter({ ctx, x: fx - 1.05, z: HEIGHTS.z + 2.8, y: Y + 0.09, ry: Math.PI / 2, w: 3.2, d: 1.9, h: 2.05 }));
  // Keep the three clear bicycles in their original bays.  The fourth blue
  // bicycle entered the planter; move the remaining row forward until the
  // front tyres meet the step, while the slight pitch keeps the rear tyres up.
  /* **`fx - 1.26`, not `fx - 0.96`.**  `ry = 0` noses the row at the frontage and
   * a bicycle is 1.73 m about its own origin, so at 0.96 m off the wall the front
   * tyres reached x = 53.00 -- and this block's access gallery and its railing
   * stand on that line, not the wall behind it.  All three front wheels came
   * through the rail.  0.3 m further back the tyre stops at 52.70, a hand's width
   * clear of the rail, and the row is still under the shelter. */
  const heightsRack = makeBikeRack({
    x: fx - 1.26, z: HEIGHTS.z + 2.5, y: Y + 0.13, n: 3, spacing: 0.6, ry: 0, seed: 207,
  });
  heightsRack.rotation.z = -0.03;
  heightsRack.position.y += 0.017;
  ctx.add(heightsRack);
  ctx.add(makePlanter({ x: fx - 0.5, z: HEIGHTS.z + 3.7, y: gA(fx - 0.5, HEIGHTS.z + 3.7), r: 0.26, flower: true, seed: 8542, n: 5 }));
  refusePoint(ctx, {
    kind: 'house', x: fx - 1.0, z: HEIGHTS.z - 4.0, y: gA(fx - 1.0, HEIGHTS.z - 4.0), ry: -Math.PI / 2, plate: 0, seed: 8543,
  });

  /* Outdoor units up the south flank -- one per floor, stacked, which is what a
   * walk-up's flank actually looks like.  `makeAircon`'s grille is on local +z,
   * so `ry` is the wall's outward normal: -z here. */
  for (let i = 0; i < 3; i++) {
    ctx.add(makeAircon({
      x: HEIGHTS.x - 1.9, z: p.z0 - 0.24, y: Y + 1.05 + i * 2.7,
      ry: Math.PI, w: 0.84, h: 0.58, feet: false,
    }));
  }
  /* and the washing, which is the whole reason the balconies face east: the
   * gallery side is the street and nobody hangs washing over a street */
  const bx = HEIGHTS.x + HEIGHTS.d / 2 + 0.55;
  for (let i = 0; i < 2; i++) {
    ctx.add(makeDryingRack({
      x: bx, z: HEIGHTS.z - 2.0 + i * 3.4, y: Y + 2.85 + i * 2.7, ry: -Math.PI / 2, n: 4, seed: 8544 + i,
    }));
  }
  ctx.add(makeLaundryPole({ ctx, x: bx + 0.3, z: HEIGHTS.z + 0.4, y: Y, ry: 0, len: 2.4, n: 4, seed: 8546 }));
  ctx.add(makeStorageShed({ x: bx + 0.5, z: p.z1 - 1.2, y: gA(bx + 0.5, p.z1 - 1.2), ry: -Math.PI / 2, w: 1.4, d: 0.8, h: 1.7 }));
  ctx.collide(bx - 0.05, p.z1 - 1.9, bx + 1.05, p.z1 - 0.5, Y + 1.74);
  shrubs.push({ x: 60.6, z: 41.4, y: gA(60.6, 41.4), r: 0.46, count: 3, spread: 1.1, seed: 8547 });
  shrubs.push({ x: 52.6, z: 32.2, y: gA(52.6, 32.2), r: 0.4, count: 3, spread: 0.95, seed: 8548 });
}

/* ------------------------------------------------------------------ *
 * The 私道 and the two things on it.
 *
 * 2.0 m of concrete with no kerb, no line and no name plate -- the difference
 * between a street the ward maintains and a strip of ground four households
 * share.  It is the only way to the back land, so it carries the 連棟's three
 * front gardens on one side and a 狭小住宅's garage bay on the other, and the
 * whole point of it is that those two types have never stood opposite each
 * other anywhere in this world.
 * ------------------------------------------------------------------ */

function buildShido(ctx, m, gm, rng, shrubs, petals) {
  const Y = ctx.groundAt(58.0, SD_Z);
  pad(ctx, {
    x: (SD_X0 + SD_X1) / 2, z: SD_Z, w: SD_X1 - SD_X0, d: SD_W, y: Y, h: 0.06,
    mat: gm.concreteMid, name: 'nichomeShido',
  });
  laneGutter(ctx, {
    axis: 'x', at: SD_Z - SD_W / 2 + 0.26, from: SD_X0 + 1.2, to: SD_X1 - 1.0, y: Y, pitch: 0.9,
    manholes: [55.4, 62.6], manholeOff: 0.5,
  });
  /* the two posts at its mouth.  A private lane is announced by the fact that a
   * car cannot swing into it, which is what these say and a sign would not. */
  bollardRow(ctx, { axis: 'z', at: SD_X0 + 0.3, from: SD_Z - 0.75, to: SD_Z + 0.75, n: 2, y: Y });

  /* ------------------------------- 連棟 三戸 ------------------------------- *
   * Three units, one wall, one roof.  The type's variety is per unit and
   * *material-free* -- same render, same tile, same window, different door
   * colour, different clutter, one shutter down -- and varying the walls is what
   * stops it being a terrace and starts it being three houses that happen to
   * touch. */
  {
    const p = plotBox(TERRACE);
    const ty = ctx.groundAt(TERRACE.x, TERRACE.z);
    const t = makeTerrace({ ...TERRACE, y: ty, seed: 8551, wall: 5, roof: 3 });
    ctx.add(t);
    plotCollide(ctx, p, ty + (t.userData.top ?? 6.0));

    /* Each unit's own front garden, 1.1 m deep, with a low boundary and its own
     * gate.  The boundary stands 0.25 m off the lane: a fence in the middle of a
     * 1.1 m garden leaves less than the 0.68 m of clear ground a body needs
     * between it and the door. */
    const FZ = SD_Z - SD_W / 2 - 0.25;
    /* One `plotWall` per unit, because a boundary can only carry one gate and
     * three households have three gates.  Each run is its own 2.9 m plot with
     * its own opening and its own pair of posts, which is also what it looks
     * like on the ground: the terrace is one building and three properties. */
    for (let i = 0; i < 3; i++) {
      const x0 = p.x0 + i * TERRACE.unitW, x1 = x0 + TERRACE.unitW;
      plotWall(ctx, {
        x0, x1, z0: FZ, z1: FZ + 0.3, sides: ['z-'], kind: 'block',
        h: 0.36, fenceH: 0.5, y: ty, seed: 8552 + i,
        gate: { side: 'z-', at: (x0 + x1) / 2, w: 1.0 },
      });
    }
    for (let i = 0; i < 3; i++) {
      const u = (i - 1) * TERRACE.unitW;
      const [gx, gz] = p.at(u, p.halfD + 0.9);
      const [dx, dz] = p.at(u, p.halfD + 0.15);
      stepStones(ctx, { from: [gx, gz], to: [dx, dz], y: ty, n: 3, seed: 8553 + i });
    }
    /* the clutter, one household at a time and deliberately different each --
     * this is the whole difference between a terrace and a barracks */
    const gA = (x, z) => ctx.groundAt(x, z);
    {
      /* **The kid's bike is on the lane, not in the garden.**  Each garden is
       * 2.9 x 0.65 m with a stepping-stone path down the middle of it, and the
       * stones are 0.08 m proud while everything here is seated on `ctx.groundAt`,
       * which out past the 私道's pad answers with the bare grade: a 1.07 m
       * machine laid along the path had the stones through both wheels.  There is
       * no 1.07 m of garden clear of the path, the planter, the gate posts and the
       * doormat -- so it goes where a kid's bike actually gets dropped, flat along
       * the shared lane, clear of the gutter at z = 30.26. */
      const [x, z] = p.at(-2.9, p.halfD + 4.7);
      ctx.add(makeKidBike({ x, z, y: gA(x, z), ry: p.outRy }));
      const [x2, z2] = p.at(-3.8, p.halfD + 0.25);
      ctx.add(makePlanter({ x: x2, z: z2, y: gA(x2, z2), r: 0.24, flower: true, seed: 8556, n: 5 }));
      const [x3, z3] = p.at(-2.2, p.halfD + 0.3);
      ctx.add(makeDoormat({ x: x3, z: z3, y: gA(x3, z3), ry: p.outRy }));
    }
    {
      const [x, z] = p.at(0.0, p.halfD + 0.5);
      ctx.add(makeUmbrellaStand({ x, z, y: gA(x, z), ry: p.outRy, seed: 8557 }));
      const [x2, z2] = p.at(0.9, p.halfD + 0.28);
      ctx.add(makeDeliveryBox({ x: x2, z: z2, y: gA(x2, z2), ry: p.outRy }));
      const [x3, z3] = p.at(-0.9, p.halfD + 0.35);
      ctx.add(makePotShelf({ x: x3, z: z3, y: gA(x3, z3), ry: p.outRy, seed: 8558 }));
    }
    {
      const [x, z] = p.at(2.6, -p.halfD - 0.7);
      ctx.add(makeBicycle({ x, z, y: gA(x, z), ry: p.outRy, lean: 0.05, color: 0x4c6a86 }));
      const [x2, z2] = p.at(2.0, p.halfD + 0.36);
      ctx.add(makeBucket({ x: x2, z: z2, y: gA(x2, z2), ry: 0.8 }));
      /* 3.9 and not 2.9: the third unit's stepping stones run down x 64.9..65.3
       * and they stand 0.08 m proud of the grade this is seated on, so the box was
       * sunk to a quarter of its height in them.  3.9 puts it against the plot's
       * east boundary, clear of the gate post at 65.6. */
      const [x3, z3] = p.at(3.9, p.halfD + 0.45);
      ctx.add(makeCatBox({ x: x3, z: z3, y: gA(x3, z3), ry: p.outRy }));
    }
    /* the backs: gas meters, the washing and the outdoor units, all on the south
     * flank where nobody on the lane sees them, which is why they can be honest */
    for (let i = 0; i < 3; i++) {
      const u = (i - 1) * TERRACE.unitW + 0.9;
      const [x, z] = p.at(u, -p.halfD - 0.16);
      ctx.add(makeGasMeter({ x, z, y: gA(x, z), ry: p.outRy + Math.PI }));
    }
    ctx.add(makeLaundryPole({ ctx, x: TERRACE.x - 1.4, z: p.z0 - 1.1, y: gA(TERRACE.x - 1.4, p.z0 - 1.1), ry: Math.PI / 2, len: 2.6, n: 5, seed: 8559 }));
    ctx.add(makeKitchenGarden({ x: TERRACE.x + 2.6, z: p.z0 - 1.2, y: gA(TERRACE.x + 2.6, p.z0 - 1.2), ry: 0, w: 2.0, d: 1.1, seed: 8560 }));
    ctx.add(makeTapPost({ x: TERRACE.x + 0.4, z: p.z0 - 0.32, y: gA(TERRACE.x + 0.4, p.z0 - 0.32), ry: Math.PI }));
    petals.push({ x: TERRACE.x, z: p.z1 + 0.9, w: 8.4, d: 1.6, y: ty + 0.02, n: 60 });
  }

  /* ------------------------------ 狭小住宅 ------------------------------ *
   * The one type in the world whose front elevation is mostly a hole: a dark
   * bay under two storeys of render, with the shutter three-quarters up.  It
   * faces the 連棟 across two metres of concrete, which is exactly the section
   * post-war infill produces and nowhere else here has. */
  {
    const p = plotBox(GARAGE);
    const hy = ctx.groundAt(GARAGE.x, GARAGE.z);
    const h = makeGarageHouse({
      ...GARAGE, y: hy, floors: 2, garage: 0.28, doorSide: 1,
      seed: 8561, wall: 6, roof: 1, door: 4, nameVariant: 4, lit: true, ctx,
    });
    ctx.add(h);
    /* the apron the car crosses.  It runs the full frontage and it is *flush*
     * with the lane: a kerb across a garage mouth is the one thing a 狭小住宅
     * plot never has. */
    pad(ctx, {
      x: GARAGE.x, z: p.z0 - 0.7, w: GARAGE.w + 0.3, d: 1.5, y: hy, h: 0.06,
      mat: gm.concrete, name: 'nichomeGarageApron',
    });
    const doorAt = h.userData.doorAt ?? 1.4;
    dressPlot(ctx, {
      ...GARAGE, y: hy, doorAt, seed: 8562, gap: 1.2,
      clear: (x, z) => z < p.z0 - 0.15,
      aircon: true, gas: false, mat: false, pots: true, parcel: true, umbrella: false,
      bike: true, kidBike: false, laundry: false, garden: 0, tap: 1, flank: 0.7,
    });
    {
      const [x, z] = p.at(doorAt, p.halfD + 0.86);
      ctx.add(makeDoormat({ x, z, y: ctx.groundAt(x, z), ry: p.outRy, w: 0.58, d: 0.35 }));
    }
    ctx.add(makeGasMeter({
      x: p.x1 + 0.16, z: p.z0 + 0.7, y: ctx.groundAt(p.x1 + 0.16, p.z0 + 0.7),
      ry: Math.PI / 2,
    }));
    ctx.add(makeMilkCrate({ x: p.x1 - 0.5, z: p.z0 - 0.55, y: ctx.groundAt(p.x1 - 0.5, p.z0 - 0.55), n: 2, ry: -0.3 }));
    ctx.add(makeBallBox({ x: p.x0 + 0.6, z: p.z0 - 1.15, y: ctx.groundAt(p.x0 + 0.6, p.z0 - 1.15), ry: 0.2, seed: 8563 }));
    /* Chalk on the apron, which is the closest this world comes to saying a
     * child lives here without drawing one. */
    makeChalkMarks(ctx, [
      { x: GARAGE.x - 1.2, z: p.z0 - 1.0, y: hy + 0.07, ry: 0.3 },
      { x: GARAGE.x + 0.4, z: p.z0 - 1.25, y: hy + 0.07, ry: -0.6 },
    ]);
    /* No carport here: the house already parks a car in its own ground floor,
     * which is the entire point of the type, and one bolted to its flank as well
     * would be saying the same thing twice -- besides landing inside the
     * allotment's boundary at x 65.8.  The flank gets the drying ground instead,
     * which is what a plot with no garden and no garage bay left over has. */
    ctx.add(makeDryingRack({ x: p.x1 + 0.9, z: GARAGE.z - 1.2, y: ctx.groundAt(p.x1 + 0.9, GARAGE.z - 1.2), ry: 0, n: 4, seed: 8566 }));
    ctx.add(makeStorageShed({ x: p.x1 + 0.85, z: GARAGE.z + 1.9, y: ctx.groundAt(p.x1 + 0.85, GARAGE.z + 1.9), ry: -Math.PI / 2, w: 1.5, d: 0.85, h: 1.75 }));
    ctx.collide(p.x1 + 0.4, GARAGE.z + 1.15, p.x1 + 1.3, GARAGE.z + 2.65, hy + 1.8);
    ctx.add(makeBucket({ x: p.x1 + 0.7, z: GARAGE.z + 0.5, y: ctx.groundAt(p.x1 + 0.7, GARAGE.z + 0.5), ry: 0.6 }));
    shrubs.push({ x: p.x0 - 0.8, z: p.z1 - 1.0, y: ctx.groundAt(p.x0 - 0.8, p.z1 - 1.0), r: 0.42, count: 3, spread: 1.0, seed: 8565 });
  }
}

/* ------------------------------------------------------------------ *
 * 貸農園 -- where the estate stops.
 *
 * Four raised beds, a standpipe, a tin store and the tools somebody left, in
 * the corner past the last house.  It costs almost nothing and it does the one
 * job no building can: it says the town has an edge and this is it.  An estate
 * that ends in a straight run of identical back fences reads as a render.
 * ------------------------------------------------------------------ */

function buildAllotment(ctx, m, gm, shrubs, grove) {
  const Y = ctx.groundAt((ALLOT.x0 + ALLOT.x1) / 2, (ALLOT.z0 + ALLOT.z1) / 2);
  const cx = (ALLOT.x0 + ALLOT.x1) / 2, cz = (ALLOT.z0 + ALLOT.z1) / 2;
  pad(ctx, {
    x: cx, z: cz, w: ALLOT.x1 - ALLOT.x0, d: ALLOT.z1 - ALLOT.z0, y: Y, h: 0.05,
    mat: m.soil, name: 'nichomeAllotment',
  });
  /* the boundary: mesh on three sides with the gate on the west, off the end of
   * the 私道.  1.4 m, so it clears the 0.38 m step by a long way and is a real
   * barrier rather than a kerb pretending to be one. */
  plotWall(ctx, {
    x0: ALLOT.x0, x1: ALLOT.x1, z0: ALLOT.z0, z1: ALLOT.z1,
    sides: ['x-', 'x+', 'z-', 'z+'], kind: 'mesh', h: 1.4, y: Y, seed: 8581,
    /* 1.8 m and not the 1.2 that reads well on the page: `plotWall` splits the
     * run at `at ± w/2` and its gate posts carry no collider, so the opening is
     * exactly `w` minus twice the player's 0.34 m radius.  At 1.2 that is 0.52 m
     * -- a gate you can see through and not walk through, which is the failure
     * mode this project keeps finding. */
    gate: { side: 'x-', at: SD_Z - 0.1, w: 1.8 },
  });
  /* **The beds are 0.9 m deep on x = cx - 0.45, and the store and the crates sit
   * east of them.**  The allotment is only 2.6 m wide, and at 1.1 m on `cx - 0.3`
   * the beds reached x = 68.75 while the tool store (0.85 deep on `x1 - 0.9`)
   * started at 68.475 and the crate stack at 68.55: both stood a quarter of a
   * metre inside a bed, with the timber frame through them.  Narrowing the beds
   * 0.2 m and sliding them 0.15 m west opens a clear 1.3 m strip along the east
   * fence, which is where an allotment keeps its shed anyway. */
  for (let i = 0; i < 4; i++) {
    const z = ALLOT.z0 + 1.1 + i * 2.0;
    ctx.add(makeKitchenGarden({ x: cx - 0.45, z, y: Y + 0.05, ry: Math.PI / 2, w: 2.4, d: 0.9, seed: 8582 + i }));
  }
  ctx.add(makeTapPost({ x: ALLOT.x0 + 0.7, z: 29.6, y: Y + 0.05, ry: -Math.PI / 2 }));
  ctx.add(makeBucket({ x: ALLOT.x0 + 1.2, z: 29.4, y: Y + 0.05, ry: 0.5, water: true }));
  {
    const sh = makeStorageShed({ x: ALLOT.x1 - 0.75, z: ALLOT.z0 + 1.0, y: Y + 0.05, ry: -Math.PI / 2, w: 1.5, d: 0.85, h: 1.75 });
    ctx.add(sh);
    ctx.collide(ALLOT.x1 - 1.2, ALLOT.z0 + 0.25, ALLOT.x1 - 0.3, ALLOT.z0 + 1.75, Y + 1.8);
  }
  ctx.add(makeCrates({ x: ALLOT.x1 - 0.65, z: ALLOT.z0 + 2.4, y: Y + 0.05, n: 3, seed: 8586, ry: -0.2 }));
  ctx.add(makeBroom({ x: ALLOT.x0 + 0.5, z: 26.2, y: Y + 0.05, tilt: -0.07, roll: 0.15, ry: 0.9 }));
  ctx.add(makeMilkCrate({ x: ALLOT.x0 + 1.0, z: 25.4, y: Y + 0.05, ry: 0.4, n: 2 }));
  /* the tool rack against the store: canes and a fork, which at this range is
   * three cylinders and is the difference between a bed and an allotment */
  {
    const parts = [];
    for (let i = 0; i < 5; i++) {
      parts.push({
        geometry: new THREE.CylinderGeometry(0.022, 0.022, 1.9, 5),
        // x1 - 0.85, not x1 - 1.5: the beds now reach 68.5 and 1.5 was inside them
        matrix: trs(ALLOT.x1 - 0.85 + i * 0.06, Y + 0.98, ALLOT.z0 + 2.9 + i * 0.04, 0.14, 0, 0.1 - i * 0.02),
      });
    }
    const canes = new THREE.Mesh(bake(parts), m.wood);
    canes.castShadow = true;
    ctx.add(canes);
  }
  shrubs.push({ x: ALLOT.x0 - 0.9, z: ALLOT.z1 - 1.4, y: Y, r: 0.44, count: 3, spread: 1.05, seed: 8587 });
  grove.push({ x: ALLOT.x1 + 1.4, z: cz, y: Y, scale: 1.45, seed: 8588, spread: 1.15 });
}
