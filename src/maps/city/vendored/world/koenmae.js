import * as THREE from 'three';
import { PAL } from '../core/palette.js';
import { cel } from '../core/toon.js';
import { hallNotice, lockerPlate } from '../core/textures.js';
import { bake, trs } from '../core/util.js';
import { groundY } from './street.js';
import { pad, lane, laneLine, groundMats } from './ground.js';
import {
  plotBox, plotCollide, hedgeRun, stepStones, refusePoint, dressPlot,
  laneGutter, bollardRow, laneSign, poleRun,
} from './plots.js';
import { makeTimberHouse } from './blocks.js';
import { makeBikeShelter } from './housing.js';
import { addVending } from './vending.js';
import {
  makeBench, makeBikeRack, makeBins, makePlanter, makeLaundryPole, makeAircon,
  makeNoticeBoard, makeRecycleBox, makeSignPost, makeStorageShed, makeTapPost,
  makeIvy, makeBucket, makeBroom, makeCrates, makeMilkCrate, makeBicycle,
  makeFlowerBed, makeLoosePaper, makeCatBox,
} from './props.js';
import {
  makeLockerBank, makeScooter, makeKitchenGarden, makeKidBike,
  makeDryingRack, makeBallBox, makeWheelStops, makeChalkMarks,
} from './streetprops.js';

/* ------------------------------------------------------------------ *
 * 公園前 -- the housing that puts 児童公園 and ひばり荘 *inside* a
 * neighbourhood instead of beside one.
 *
 * The smallest of the six blocks and the one that carries the most connective
 * work.  Everything east of the crossing used to be a line of set pieces you
 * arrived at one at a time and left the same way: the lineside path ran out at
 * the overbridge, the park could only be entered from the west, and the walk-up
 * was a building you looked at across grass.  What this block builds is the
 * **link** -- a 2.2 m footway north off the lineside path, past the overbridge's
 * west piers, then east along the strip between the park's south railing and the
 * bridge's north end to meet block 2's spine at x = 47.3 -- and a second,
 * quieter one up ひばり荘's service flank to the north lane.  Between them those
 * two turn a line of districts into a loop.
 *
 * Three envelopes, none wider than five metres, so this block is about *edges*
 * rather than mass: the park railing, the overbridge's piers and undercroft,
 * ひばり荘's flank, and the one frontage there is room for.
 *
 *   (a) south of the park   x 34.5..47.3, z 6.0..17.2   -- split by the bridge
 *   (b) north of the park   x 31.9..47.3, z 30.8..34.9  -- the pocket square
 *   (c) east of ひばり荘    x 42.9..47.3, z 35.0..43.4  -- the flats' back
 *
 * ------------------------------------------------------------------ *
 * Three things about (a) that the arithmetic decided rather than taste, because
 * all three look like omissions until you measure them.
 *
 * **There is no terrace here, and there could not be.**  The bridge occupies
 * x 39.70..42.60 through the whole of (a) -- head landing, flight, corner
 * landing -- so the buildable west sub-piece is x 34.5..39.7, and the house next
 * door already has its own roof over the first 0.4 m of that (its eave reaches
 * x 34.82 at 5.44 m).  That leaves a 4.9 m roof envelope.  A `makeTerrace` of
 * two units at 2.9 m is 5.8 m of frontage and 6.52 m of roof; even at 2.4 m
 * units it is 5.52 m, and both put the east eave inside the flight, whose soffit
 * has dropped below terrace-ridge height by z = 7.2.  Nothing throws -- it is a
 * roof inside a staircase, the `makeTerrace`-shaped version of the 格子 panels
 * that were inside the wall on the onsen street.  So the west sub-piece takes
 * the *footway* and the block's one dwelling goes east of the bridge, where a
 * low building fits.
 *
 * **The dwelling is a 木造平屋, and it faces west.**  The east strip is 4.7 m of
 * usable width and 6.4 m of depth with the second flight coming down over its
 * northern 2.4 m, so the only thing that fits is single-storey and shallow in
 * plan: `makeTimberHouse` at w 5.2 / d 3.6 with the eave cut to 0.6 sits inside
 * it with 0.35 m to spare under the stair balustrade.  Facing 'x-' it is sunlit
 * (the sun is at -52/62/56), its 玄関 lands on the centre line of the 私道 that
 * serves it, and it is seen from the footway framed between the bridge's piers
 * and under its soffit -- which is the strongest picture available out here.
 * Its 縁側 goes on the south flank looking over the railway; the north flank is
 * under the stair and cannot carry one.
 *
 * **The car park is one bay, and it is under the bridge because that is the only
 * place a car fits.**  The court is 3.55 m across and 2.95 m deep between the
 * spur and the corner landing's platform -- shorter than a kei car -- so the bay
 * runs *north* out of the spur and borrows the spur's northern metre for its
 * nose-in.  Headroom over it is 3.2-5.7 m.  Everything else on the gravel is
 * two wheels.
 *
 * ------------------------------------------------------------------ *
 * FLOODFILL -- must all be reachable on foot from the spawn:
 *
 *   linkSouth        [38.5,  6.4]   south mouth of the footway, off the lineside path
 *   linkMid          [38.5, 11.4]   under the lineside cherry, beside the piers
 *   linkCorner       [38.5, 16.3]   where the two legs meet
 *   linkEast         [46.8, 16.3]   the east end, at block 2's spine kerb
 *   spurUnderBridge  [41.0,  8.4]   the 私道 through the undercroft
 *   houseFront       [42.9,  8.4]   outside the 木造's 玄関
 *   cyclePark        [41.3, 11.5]   the gravel court under the flight
 *   gapYard          [35.8, 12.6]   the residents' 空き地 west of the footway
 *   squareWest       [33.2, 32.7]   the pocket square, west end
 *   squareEast       [43.6, 33.3]   the pocket square, east end
 *   eastLink         [45.6, 31.7]   the 1.4 m squeeze past the grove tree
 *   serviceNorth     [45.0, 43.2]   top of ひばり荘's service strip, at the north lane
 * ------------------------------------------------------------------ */

/* ----------------------------- the link ----------------------------- *
 * Leg 1 runs north at x 37.40..39.60; leg 2 east at z 15.15..17.35.  The
 * numbers on leg 2 are the tight ones: the park's south railing collides at
 * z 17.31..17.49 and the bridge's corner-landing columns at z 14.40..14.84, so
 * with the player's 0.34 m radius on every side the walkable band is
 * 15.18..16.97 -- 1.79 m.  Enough, and only just, so nothing stands in it: the
 * gutter, the bollards, the name plate and the mirror are all on the far side of
 * a paving line from that band. */
const NS_X = 38.50, NS_W = 2.20;
const NS_Z0 = 5.30, NS_Z1 = 15.30;
const EW_Z = 16.25, EW_D = 2.20;
const EW_X0 = 34.60, EW_X1 = 47.35;
/* the 私道 under the bridge, and the house it serves */
const SP_Z = 8.30, SP_D = 2.20;
const SP_X0 = 38.40, SP_X1 = 43.50;
const HOUSE = { x: 45.35, z: 8.95, w: 5.20, d: 3.60, face: 'x-' };
/* the gravel court, under the near flight where the soffit is 3.2-5.7 m up */
const COURT = { x0: 39.85, x1: 43.40, z0: 9.40, z1: 12.35 };
/* the pocket square: 3.6 m between the park's north railing (which blocks to
 * z 31.03) and ひばり荘's collider (which blocks from z 34.66) -- it fits, exactly */
const SQ_Z = 32.85, SQ_W = 3.60, SQ_X0 = 32.30, SQ_X1 = 44.30;
/* the flats' east wall, which every wall-fixed prop in (c) is measured off */
const APT_X = 42.40;

const M = {};
function mats() {
  if (M.concrete) return M;
  M.concrete = cel({ color: PAL.concrete, bands: 3, tint: 0x6f6790 });
  M.concreteMid = cel({ color: PAL.concreteMid, bands: 3, tint: 0x6a6288 });
  M.metal = cel({ color: PAL.metal, bands: 3, tint: 0x666090 });
  M.metalDark = cel({ color: PAL.metalDark, bands: 3, tint: 0x5c5680 });
  M.wood = cel({ color: 0x9c7f5e, bands: 3, tint: 0x5c5680 });
  M.slat = cel({ color: 0xb09a76, bands: 3, tint: 0x6f6790 });
  return M;
}

export function buildKoenmae(ctx) {
  const sakura = [];
  const shrubs = [];
  const grove = [];
  const petals = [];

  /* `groundY` is flat 0 across the whole of (a) -- the climb to the north lane
   * does not start until z = 28 -- so (a) can use a constant.  (b) and (c) are
   * on the first six metres of that climb and every prop in them is seated from
   * `ctx.groundAt`, which is the only thing that knows about the slabs. */
  const Y0 = groundY(10);

  buildLink(ctx, Y0);
  buildGap(ctx, Y0, shrubs, petals);
  buildHousePlot(ctx, Y0, shrubs, petals);
  buildCourt(ctx, Y0, petals);
  buildSquare(ctx, sakura, shrubs, petals);
  buildService(ctx, sakura, shrubs, petals);

  /* --------------------------------- cabling --------------------------------- *
   * One real chain in (a), with a service drop into the house next door; then an
   * 引込柱 in (b) with a drop into ひばり荘.  The east service strip is already
   * supplied by `nichome.js`'s continuous west-verge run; putting a second pole
   * beside it made the two columns and crossarms intersect. */
  poleRun(ctx, {
    defs: [
      { x: 36.95, z: 6.40, h: 8.2, seed: 8681, armDir: 1, lamp: true, y: Y0 },
      { x: 35.05, z: 10.60, h: 8.0, seed: 8682, armDir: 1, y: Y0 },
    ],
    chains: [[0, 1]],
    offsets: [[0, -0.4], [-0.4, 0.25]],
    // onto the east eave of the house at (30.5, 11.0), which reaches x = 34.82
    drops: [[1, [34.60, Y0 + 5.2, 12.40]]],
    sag: 0.35,
  });
  {
    const aptY = groundY(39.7);
    poleRun(ctx, {
      defs: [
        { x: 32.55, z: 34.60, h: 7.8, seed: 8683, armDir: -1, lamp: true, y: groundY(34.6) },
      ],
      drops: [
        [0, [37.60, aptY + 5.0, 36.10]],
      ],
      sag: 0.3,
    });
  }

  return { sakura, shrubs, grove, petals };
}

/* ------------------------------------------------------------------ *
 * The link.  Built first, because everything else in the block is set out
 * against it.
 * ------------------------------------------------------------------ */

function buildLink(ctx, Y) {
  const gm = groundMats();

  /* Leg 1 -- north off the lineside path.  `pad` rather than `lane` with
   * `axis: 'z'`: a z-swept lane registers no platform (it follows `groundY`
   * instead), and this surface has to *be* a platform so the height query puts
   * the player on the slab rather than 90 mm inside it.  The ground is dead flat
   * here, so a level slab is also the truth.  It starts at z = 5.30, half a
   * metre inside the lineside lane's own platform: two platforms have to overlap
   * rather than meet, because a few centimetres of gap between them is a hole. */
  pad(ctx, {
    x: NS_X, z: (NS_Z0 + NS_Z1) / 2, w: NS_W, d: NS_Z1 - NS_Z0,
    y: Y, h: 0.09, mat: gm.concrete, name: 'koenmaeLinkNS',
  });
  /* Leg 2 -- east along the strip between the park and the bridge's north end,
   * out to x = 47.35, a fifth of a metre past block 2's west kerb. */
  pad(ctx, {
    x: (EW_X0 + EW_X1) / 2, z: EW_Z, w: EW_X1 - EW_X0, d: EW_D,
    y: Y, h: 0.09, mat: gm.concrete, name: 'koenmaeLinkEW',
  });
  /* The spur.  The head-landing columns block x 39.42..40.54 and 41.46..42.58 up
   * to z = 7.08 once the player's radius is added, so the spur's south edge is
   * at 7.20 and every one of its 2.2 m is walkable. */
  pad(ctx, {
    x: (SP_X0 + SP_X1) / 2, z: SP_Z, w: SP_X1 - SP_X0, d: SP_D,
    y: Y, h: 0.09, mat: gm.concrete, name: 'koenmaeSpur',
  });

  /* the slotted channel down the far side of each leg, two covers, and the patch
   * left by whoever dug the water main up -- what a footway this narrow has
   * instead of gutters */
  laneGutter(ctx, {
    axis: 'z', at: NS_X - NS_W / 2 + 0.22, from: NS_Z0 + 0.4, to: NS_Z1 - 0.3,
    y: Y + 0.055, pitch: 0.9, manholes: [8.90], manholeOff: 0.95,
    patches: [[NS_X + 0.35, 12.60, 1.10, 1.45]],
  });
  laneGutter(ctx, {
    axis: 'x', at: EW_Z - EW_D / 2 + 0.24, from: 35.20, to: 47.00,
    y: Y + 0.055, pitch: 0.9, manholes: [36.80, 44.60], manholeOff: 0.78,
    patches: [[41.30, EW_Z + 0.55, 1.60, 1.10]],
  });
  /* a painted edge line along the park side of leg 2 and down the spur.  These
   * two stretches are the only ones in the block a car uses, and the line is
   * what says so without a sign. */
  laneLine(ctx, {
    axis: 'x', at: EW_Z + EW_D / 2 - 0.24, from: 35.40, to: 46.60, y: Y + 0.11, dash: 0.9,
  });
  laneLine(ctx, { axis: 'x', at: SP_Z, from: SP_X0 + 0.6, to: 42.30, y: Y + 0.11, dash: 0.7 });

  /* Bollards at the south mouth.  `bollardRow` emits geometry only, and that is
   * what makes a pair usable at a 2.2 m mouth: two 0.13 m posts with 0.34 m added
   * to every side would take 1.34 m of the 2.2.  The east mouth is already
   * marked by the three-post row owned by `nichome.js`; duplicating it here made
   * five alternating posts across the same junction. */
  bollardRow(ctx, { axis: 'x', at: 6.05, from: NS_X - 0.75, to: NS_X + 0.75, n: 2, y: Y + 0.09 });

  /* 公園通り -- laneNamePlate variant 5, at the inside corner of the junction
   * with the convex mirror the corner needs.  Its collider is a 0.32 m box,
   * which with the radius added is 1.0 m, and there is exactly that much between
   * it and the paving. */
  laneSign(ctx, {
    x: 36.85, z: 14.45, y: Y, variant: 5, ry: 0.55, h: 2.1,
    mirror: true, mirrorAt: [-0.60, 0.35], mirrorRy: -0.7,
  });

  /* No hedge or railing on the park side of leg 2, and that is deliberate: the
   * park's own pipe railing already runs its whole length at z = 17.4, and a
   * 0.44 m hedge inside that would take 0.36 m off a band with 1.79 m to give.
   * The greenery goes *through* the rail instead -- a shrub clump has no
   * collider, so it can sit where a hedge cannot. */
}

/* ------------------------------------------------------------------ *
 * The 空き地 west of the footway.
 *
 * 2.75 m between the neighbour's flank and the paving, with the overbridge's
 * lineside cherry standing in the middle of it.  Nothing can be built here --
 * that canopy alone is six metres across -- and that is the point: it is the
 * block's shared back ground, and from the south mouth of the footway you look
 * straight up it through the blossom to the park railing.  A gap is worth as
 * much as a building, and this one does three jobs: it holds back the west half
 * of the block, it gives the drying and the vegetable boxes somewhere to be, and
 * it is the quiet corner with the bench on it.
 * ------------------------------------------------------------------ */

function buildGap(ctx, Y, shrubs, petals) {
  const gm = groundMats();
  const gy = (x, z) => ctx.groundAt(x, z);

  /* the working slab at the north end.  Its west edge stops 0.4 m off the
   * neighbour's wall so the two 物置 have soil to stand on. */
  pad(ctx, {
    x: 36.10, z: 12.90, w: 2.40, d: 3.40, y: Y, h: 0.07,
    mat: gm.concreteMid, name: 'koenmaeYard',
  });

  /* the hedge between the yard and the footway -- a boundary the block needed,
   * since everything else out here is pipe railing and concrete, and short
   * enough that the footway keeps 1.71 m of walkable width past it.  The way
   * into the yard is the 1.06 m opening between the cherry's collider and the
   * hedge's south end, plus the whole open south half. */
  hedgeRun(ctx, {
    axis: 'z', at: 37.15, from: 10.80, to: 14.20, y: Y, h: 0.90, t: 0.40, seed: 8611,
  });

  /* two 物置 against the neighbour's flank, backs to it.  `makeStorageShed`'s
   * doors are on local +z, so a shed backing onto a wall whose outward normal is
   * +x turns +PI/2 -- `atan2(nx, nz)`, the same expression the name plates use --
   * and the origin belongs at `wall + (d / 2 + clearance)`. */
  for (const [sz, w, d, h] of [[13.40, 1.50, 0.80, 1.72], [11.60, 1.20, 0.72, 1.55]]) {
    const sx = 34.50 + d / 2 + 0.06;
    const sh = makeStorageShed({ x: sx, z: sz, y: gy(sx, sz), ry: Math.PI / 2, w, d, h });
    ctx.add(sh);
    ctx.collide(sx - d / 2 - 0.1, sz - w / 2 - 0.1, sx + d / 2 + 0.1, sz + w / 2 + 0.1, Y + sh.userData.top);
  }

  /* the drying ground: two airers and a pole, all turned a quarter circle so
   * their bars run *along* the strip.  A 1.2 m airer across a 2.4 m yard would
   * be survivable; a 2.0 m run of washing across a 2.75 m gap is not -- it goes
   * through both boundaries at once. */
  ctx.add(makeDryingRack({ x: 36.30, z: 12.10, y: gy(36.30, 12.10), ry: Math.PI / 2, n: 5, seed: 8614 }));
  ctx.add(makeDryingRack({ x: 36.40, z: 13.90, y: gy(36.40, 13.90), ry: Math.PI / 2 + 0.22, n: 4, seed: 8615 }));
  ctx.add(makeLaundryPole({ ctx,
    x: 35.60, z: 14.55, y: gy(35.60, 14.55), ry: Math.PI / 2, len: 2.0, n: 4, h: 1.7, seed: 8616,
  }));

  /* two 家庭菜園 on the soil south of the slab, both with their 1.6 m length
   * along the strip rather than across it, and both clear of the cherry's
   * collider at 36.39..36.91 / 8.34..8.86 */
  ctx.add(makeKitchenGarden({ x: 35.55, z: 10.30, y: gy(35.55, 10.30), ry: Math.PI / 2, w: 1.6, d: 0.9, seed: 8617 }));
  ctx.add(makeKitchenGarden({ x: 35.45, z: 7.30, y: gy(35.45, 7.30), ry: Math.PI / 2 + 0.1, w: 1.5, d: 0.85, seed: 8618 }));

  /* the shared tap, and everything that collects round one */
  ctx.add(makeTapPost({ x: 35.20, z: 12.35, y: gy(35.20, 12.35), ry: Math.PI / 2 }));
  ctx.add(makeBucket({ x: 35.62, z: 12.30, y: gy(35.62, 12.30), ry: 0.7, water: true }));
  ctx.add(makeBroom({ x: 35.10, z: 14.20, y: gy(35.10, 14.20), tilt: -0.05, roll: 0.18, ry: 1.2 }));
  ctx.add(makeCrates({ x: 36.85, z: 11.30, y: gy(36.85, 11.30), n: 3, seed: 8619, ry: -0.25 }));
  ctx.add(makeMilkCrate({ x: 35.10, z: 9.20, y: gy(35.10, 9.20), ry: 0.4 }));
  /* z 8.60 and not 8.10: the 家庭菜園 at (35.45, 7.30) is 1.5 m along z once its
   * `ry` is applied, so it reaches z = 8.09, and a 0.62 x 0.46 box turned 0.9 rad
   * occupies 0.77 m of both axes -- the two overlapped by a third of a metre each
   * way.  8.60 puts it in the 0.96 m gap between the bed and the milk crate. */
  ctx.add(makeCatBox({ x: 34.95, z: 8.60, y: gy(34.95, 8.60), ry: 0.9 }));
  makeLoosePaper(ctx, [{ x: 36.60, z: 10.60, y: Y + 0.01, ry: 0.6 }]);

  /* children.  The ball crate, a bike somebody has outgrown, and chalk on the
   * slab -- marks only: a hopscotch grid with numerals written in it is signage,
   * and the no-people rule has no loophole for chalk either. */
  ctx.add(makeBallBox({ x: 36.80, z: 14.30, y: gy(36.80, 14.30), ry: -0.5, seed: 8620 }));
  ctx.add(makeKidBike({ x: 36.35, z: 10.30, y: gy(36.35, 10.30), ry: Math.PI / 2 }));
  makeChalkMarks(ctx, [
    { x: 36.20, z: 13.10, y: gy(36.20, 13.10), seed: 8621, ry: 0.3, scale: 0.85 },
    { x: 38.60, z: 13.60, y: gy(38.60, 13.60), seed: 8622, ry: -0.2, scale: 0.8 },
  ]);

  /* the bench.  At the south end under the cherry, facing +z, so sitting on it
   * you look up the whole gap at the park railing with the railway behind you.
   * `makeBench` builds its back on -z, so `ry = 0` faces north. */
  ctx.add(makeBench({ x: 36.55, z: 6.95, y: gy(36.55, 6.95), ry: 0.06, len: 1.6 }));
  ctx.add(makePlanter({ x: 35.55, z: 6.55, y: gy(35.55, 6.55), r: 0.26, flower: true, seed: 8623, n: 5 }));
  ctx.add(makePlanter({ x: 35.05, z: 6.90, y: gy(35.05, 6.90), r: 0.20, flower: false, seed: 8624, n: 4 }));

  shrubs.push({ x: 34.95, z: 15.90, y: gy(34.95, 15.90), r: 0.44, count: 3, spread: 1.0, seed: 8625 });
  shrubs.push({ x: 36.05, z: 9.75, y: Y, r: 0.34, count: 3, spread: 0.85, seed: 8626 });
  /* Two patches rather than one, because the slab is 70 mm thick: a single patch
   * at soil height would be *inside* the yard slab over half its area, which is
   * how an opaque control box on a paved spot went missing without an error. */
  petals.push({ x: 36.10, z: 8.80, w: 2.4, d: 4.6, y: Y + 0.02, n: 45 });
  petals.push({ x: 36.10, z: 12.90, w: 2.2, d: 3.2, y: Y + 0.09, n: 40 });
}

/* ------------------------------------------------------------------ *
 * The one frontage: 木造平屋, east of the bridge, facing west.
 * ------------------------------------------------------------------ */

function buildHousePlot(ctx, Y, shrubs, petals) {
  const m = mats();
  const gy = (x, z) => ctx.groundAt(x, z);

  const h = makeTimberHouse({
    x: HOUSE.x, z: HOUSE.z, y: Y, w: HOUSE.w, d: HOUSE.d, face: HOUSE.face,
    floors: 1, roofKind: 'gable',
    /* 0.60 rather than the 0.86 the type wants.  The east strip has 5.3 m of
     * roof envelope between the flight (x 42.20) and the open ground past block
     * 2's kerb; at 0.86 the roof is 5.72 m across and lands inside the flight,
     * whose soffit at this depth is well below the eave line. */
    eave: 0.60,
    /* on the *south* flank.  The north flank is under the second flight, whose
     * treads there are at 0.6-2.9 m -- a 縁側 with a 1.9 m shoji screen behind
     * it would be inside the staircase. */
    engawa: -1,
    plaster: false, lit: true, door: 3, nameVariant: 9, seed: 8631,
  });
  ctx.add(h);
  const p = plotBox(HOUSE);
  plotCollide(ctx, p, Y + h.userData.top);

  /* The 玄関 lands at (43.50, 7.90).  `doorAt` is in the *unit's* frame and this
   * unit is turned a quarter circle, so the offset that reads as "1.05 m west of
   * centre" inside the generator is 1.05 m *south* of centre in the world.  That
   * is the arithmetic that put a ryokan's whole porch beside its own doorway,
   * and the reason the spur is centred on z = 8.30 and not on 8.95. */
  const [dx, dz] = p.at(h.userData.doorAt, p.halfD + 0.05);
  stepStones(ctx, {
    from: [dx - 0.95, dz - 0.10], to: [dx - 0.12, dz], y: Y + 0.09, n: 3, seed: 8632,
  });

  /* Everything the house keeps outside its own door, through `dressPlot` so it
   * all lands in the unit's frame: the outdoor unit on the wall it belongs to
   * with its brackets touching it, the mat at the door rather than at the
   * window, the bicycle *along* the frontage.
   *
   * Both flanks are refused.  `laundry`, `rack`, `garden`, `tap`, `crates` and
   * `shed` all place at `halfW + 0.85`, which here is z 5.50 (the 縁側 deck) and
   * z 12.40 (under the stair).  The drying and the vegetable boxes are in the
   * 空き地 across the way instead, which is where a plot this size keeps them. */
  dressPlot(ctx, {
    ...HOUSE, y: Y, doorAt: h.userData.doorAt, seed: 8633, gap: 1.05,
    aircon: true, airconUp: 0.45, gas: false, lit: false,
    mat: true, pots: true, umbrella: true, parcel: true, shelf: false,
    bike: true, kidBike: true, scooter: false, meterLid: true,
    laundry: false, rack: false, garden: false, tap: false, crates: false, shed: false,
  });

  /* The 板塀 on the back boundary only, between the plot and the undercroft of
   * the second flight -- otherwise a 2.4 m strip of nothing with a staircase
   * over it.  No boundary on the frontage: the spur runs right up to the door,
   * and a gate across a 0.44 m front garden is a gate you cannot walk through --
   * a 0.9 m opening minus twice the player's radius is 0.22 m. */
  {
    const bz = 12.05, x0 = 43.30, x1 = 47.25, len = x1 - x0;
    const g = new THREE.Group();
    const slats = [];
    const ns = Math.round(len / 0.17);
    for (let i = 0; i < ns; i++) {
      slats.push({
        geometry: new THREE.BoxGeometry((len / ns) * 0.72, 0.90, 0.05),
        matrix: trs(x0 + (len / ns) * (i + 0.5), 0.45, bz),
      });
    }
    const sm = new THREE.Mesh(bake(slats), m.slat);
    sm.castShadow = sm.receiveShadow = true;
    g.add(sm);
    const frame = [];
    for (let i = 0; i <= 3; i++) {
      frame.push({
        geometry: new THREE.BoxGeometry(0.12, 1.00, 0.12),
        matrix: trs(x0 + (len / 3) * i, 0.50, bz),
      });
    }
    frame.push({ geometry: new THREE.BoxGeometry(len + 0.1, 0.07, 0.24), matrix: trs((x0 + x1) / 2, 0.96, bz) });
    const fm = new THREE.Mesh(bake(frame), m.wood);
    fm.castShadow = true;
    g.add(fm);
    g.position.y = Y;
    ctx.add(g);
    ctx.collide(x0, bz - 0.14, x1, bz + 0.14, Y + 1.0);
  }

  /* The 縁側 side.  This is the only elevation of the house anybody sees from a
   * distance -- from the lineside path and from the bridge deck 7 m up -- so it
   * gets the washing and the pots rather than the back door. */
  ctx.add(makeLaundryPole({ ctx, x: 45.90, z: 4.90, y: gy(45.90, 4.90), ry: 0, len: 2.2, n: 4, seed: 8634 }));
  ctx.add(makePlanter({ x: 44.30, z: 4.80, y: gy(44.30, 4.80), r: 0.24, flower: true, seed: 8635, n: 5 }));
  ctx.add(makeBucket({ x: 43.85, z: 5.20, y: gy(43.85, 5.20), ry: 1.2 }));
  shrubs.push({ x: 47.00, z: 5.30, y: gy(47.00, 5.30), r: 0.46, count: 3, spread: 1.1, seed: 8636 });
  petals.push({ x: 41.00, z: 8.30, w: 4.2, d: 2.0, y: Y + 0.11, n: 45 });
}

/* ------------------------------------------------------------------ *
 * 公園前駐車場 -- the one bay and the bicycles, under the flight.
 *
 * A car park under a 跨線橋 is one of the few things in a Japanese suburb that
 * is honestly *under* something, and the headroom is there: the flight's soffit
 * runs from 5.7 m at the south end of the court down to 3.2 m at the north.  The
 * court is 2.95 m deep, which is shorter than a kei car, so the bay runs north
 * out of the spur and borrows the spur's last metre for the nose-in -- the same
 * way every 私道 bay in a Japanese block does.  Two wheels for the rest of it.
 * ------------------------------------------------------------------ */

function buildCourt(ctx, Y, petals) {
  const gm = groundMats();
  const cz = (COURT.z0 + COURT.z1) / 2;

  pad(ctx, {
    x: (COURT.x0 + COURT.x1) / 2, z: cz, w: COURT.x1 - COURT.x0, d: COURT.z1 - COURT.z0,
    y: Y, h: 0.06, mat: gm.gravel, name: 'koenmaeCourt',
  });
  /* the bay, marked out and stopped.  `makeWheelStops` is authored with the bays
   * side by side along x and the car nosing in from +z, so a bay entered from
   * the spur -- which is on -z -- turns a half circle: the stops end up at the
   * far end of the bay and the stake behind them, which is the whole point of
   * the prop reporting which way round it is. */
  for (const bx of [40.55, 42.35]) {
    laneLine(ctx, { axis: 'z', at: bx, from: 8.90, to: COURT.z1 - 0.10, y: Y + 0.08 });
  }
  ctx.add(makeWheelStops({
    x: 41.45, z: COURT.z1 - 0.30, y: Y + 0.06, ry: Math.PI, n: 1, gauge: 1.30,
  }));

  /* the bicycles, east of the bay against the plot boundary.  A racked bike is
   * parked along its own length, so the row runs *across* them: two at 0.62 m
   * centres is 0.62 m of frontage and 1.73 m of depth, not the other way round. */
  ctx.add(makeBikeRack({ x: 42.85, z: 10.80, y: Y + 0.06, n: 2, spacing: 0.62, ry: Math.PI / 2, seed: 86 }));
  /* z 9.40 and not 10.30.  At `ry = PI/2` both the scooter and the refuse point
   * run along z: `makeBins` lays three bins and a 1.58 m crow net from its own
   * anchor, so from 11.95 it reaches down to 10.66, and 1.75 m of scooter centred
   * on 10.30 reached up to 11.18 -- half a metre of overlap, with the scooter's
   * rear box inside the yellow bin. */
  ctx.add(makeScooter({ x: 40.20, z: 9.40, y: Y + 0.06, ry: Math.PI / 2, seed: 8641 }));
  ctx.add(makeBins({ x: 40.15, z: 11.95, y: Y + 0.06, ry: Math.PI / 2 }));
  ctx.add(makeCrates({ x: 42.95, z: 12.00, y: Y + 0.06, n: 2, seed: 8642, ry: 0.3 }));
  ctx.add(makeMilkCrate({ x: 42.90, z: 9.85, y: Y + 0.06, ry: -0.3 }));
  petals.push({ x: 41.60, z: cz, w: 3.2, d: 2.6, y: Y + 0.08, n: 35 });
}

/* ------------------------------------------------------------------ *
 * 公園前広場 -- the pocket square north of the park.
 *
 * Four metres between the park's north railing and ひばり荘, which is why no
 * building fits and why that is the best thing about it.  It is the block's
 * shared open ground: standing at the park rail you look straight across the
 * paving at the flats' balcony elevation with the washing on it, which is the
 * relationship the whole block exists to make.
 *
 * Everything with a collider on it goes on the *north* verge, against the flats.
 * That is not composition, it is arithmetic: the walkable band is 31.03..34.66
 * and a gomi enclosure is 1.9 m in plan, so one on the park side and one on the
 * flats side at the same x would leave nothing between them.  And nothing tall
 * stands in the middle of it, because the middle of it is the sight line.
 * ------------------------------------------------------------------ */

function buildSquare(ctx, sakura, shrubs, petals) {
  const m = mats();
  const gm = groundMats();
  const Y = groundY(SQ_Z);
  const gy = (x, z) => ctx.groundAt(x, z);

  lane(ctx, {
    axis: 'x', at: SQ_Z, from: SQ_X0, to: SQ_X1, w: SQ_W, y: Y, rise: 0.05,
    kerb: true, mat: gm.asphaltWorn, name: 'koenmaeSquare',
  });
  laneLine(ctx, {
    axis: 'x', at: SQ_Z - SQ_W / 2 + 0.35, from: SQ_X0 + 0.6, to: SQ_X1 - 0.6, y: Y + 0.12, dash: 0.9,
  });
  laneGutter(ctx, {
    axis: 'x', at: SQ_Z + SQ_W / 2 - 0.30, from: SQ_X0 + 0.8, to: SQ_X1 - 0.8,
    y: Y + 0.055, pitch: 0.95, manholes: [35.60, 41.40], manholeOff: -0.75,
    patches: [[38.20, SQ_Z - 0.70, 1.50, 1.20]],
  });

  /* The east squeeze.  The park's north-east corner blocks to z 31.03 and the
   * grove tree at (45.6, 33.6) from z 32.46, so this is 1.43 m of clear ground
   * and it is the only way from the square onto block 2's spine -- a 1.5 m slab,
   * not a lane, and nothing on it. */
  pad(ctx, {
    x: 45.70, z: 31.75, w: 3.40, d: 1.50, y: groundY(31.75), h: 0.08,
    mat: gm.concrete, name: 'koenmaeEastLink',
  });
  /* and the arm north to ひばり荘's service side: 1.42 m between the block's
   * collider at 43.04 and the same grove tree at 44.46.  This one closes the
   * loop, so like the squeeze it stays empty. */
  pad(ctx, {
    x: 43.75, z: 33.90, w: 1.30, d: 3.00, y: groundY(33.90), h: 0.08,
    mat: gm.concrete, name: 'koenmaeServiceLink',
  });

  /* ------------------------- the north verge, west to east ------------------------- */
  /* the flats' bicycle shelter.  No collider on it -- four 0.09 m posts inflated
   * by the player's radius would take 1.5 m out of a 3.6 m square, and the same
   * decision is already made for the one on the north block's lane. */
  ctx.add(makeBikeShelter({ ctx, x: 33.60, z: 33.95, y: gy(33.60, 33.95), ry: 0, w: 2.8, d: 1.8, h: 2.05 }));

  /* the machine by the park the brief asks for, facing -z so it is read from the
   * paving and from the park beyond it.  Its glow is what carries the square at
   * dusk, which is the one thing 3.6 m of asphalt cannot do on its own. */
  addVending(ctx, {
    x: 35.90, z: 34.10, y: gy(35.90, 34.10), ry: Math.PI, variant: 2, seed: 86,
  });

  /* 分別のお願い -- the built refuse enclosure.  Its gate is on local +z and
   * stands ajar, so `ry = PI` puts the gate and the collection plate on the
   * approach and the back wall against the flats. */
  refusePoint(ctx, {
    x: 38.10, z: 34.05, y: gy(38.10, 34.05), kind: 'house', ry: Math.PI, plate: 1, seed: 8651,
  });

  /* The parcel locker.  Doors on local +z, so the same half turn.  Its own
   * header board is 1.25 x 0.16 -- 8:1 -- and `lockerPlate` is drawn 2:1, so the
   * plate goes on a post beside it rather than onto the header: a decal whose
   * aspect does not match the face it lands on renders as an unreadable smear
   * and not as an error.  Same lesson as `alleyPlate` on a 0.24 m post. */
  {
    const lx = 40.00, lz = 34.35;
    const lb = makeLockerBank({ x: lx, z: lz, y: gy(lx, lz), ry: Math.PI });
    ctx.add(lb);
    ctx.collide(lx - 0.70, lz - 0.30, lx + 0.70, lz + 0.30, gy(lx, lz) + lb.userData.top);
    ctx.add(makeSignPost({
      x: 39.10, z: 34.20, y: gy(39.10, 34.20), ry: Math.PI, h: 1.9, postMat: m.metal,
      plates: [{ map: lockerPlate(), w: 0.60, h: 0.30, y: 1.52 }],
    }));
  }

  /* the 町内会 board.  Three sheets, all `hallNotice` -- 256 x 352, which is
   * exactly the 0.42 x 0.58 the board hangs them at.  1.8 m wide and not 2.2:
   * at 2.2 its collider reaches x 43.84 and the service link past it is 1.42 m,
   * so a wider board seals the loop.  That is the notice-board-across-an-alley
   * mistake from the last round, one metre further along. */
  {
    const nx = 41.70, nz = 34.30;
    ctx.add(makeNoticeBoard({ ctx,
      x: nx, z: nz, y: gy(nx, nz), ry: Math.PI, w: 1.8, h: 1.2, y0: 0.85,
      sheets: [
        { map: hallNotice(0), x: -0.52, y: 0.02, w: 0.42, h: 0.58, tilt: 0.02 },
        { map: hallNotice(1), x: 0.02, y: -0.02, w: 0.42, h: 0.58, tilt: -0.015 },
        { map: hallNotice(2), x: 0.56, y: 0.01, w: 0.42, h: 0.58 },
      ],
    }));
  }

  /* ------------------------- the park verge: nothing tall ------------------------- */
  ctx.add(makeBench({ x: 33.95, z: 31.85, y: gy(33.95, 31.85), ry: Math.PI, len: 1.5 }));
  ctx.add(makeBench({ x: 36.95, z: 31.85, y: gy(36.95, 31.85), ry: Math.PI, len: 1.5 }));
  ctx.add(makeRecycleBox({ x: 38.40, z: 31.50, y: gy(38.40, 31.50), ry: 0 }));
  ctx.add(makeFlowerBed({ x: 40.80, z: 31.60, w: 2.80, d: 0.90, y: gy(40.80, 31.60), seed: 8652, n: 13 }));
  ctx.add(makeTapPost({ x: 42.60, z: 31.50, y: gy(42.60, 31.50), ry: 0 }));
  ctx.add(makeBucket({ x: 42.96, z: 31.76, y: gy(42.96, 31.76), ry: 0.4, water: true }));
  ctx.add(makePlanter({ x: 46.95, z: 31.35, y: gy(46.95, 31.35), r: 0.24, flower: true, seed: 8653, n: 5 }));
  ctx.add(makePlanter({ x: 47.20, z: 31.80, y: gy(47.20, 31.80), r: 0.19, flower: false, seed: 8654, n: 4 }));
  ctx.add(makeBicycle({ x: 40.20, z: 32.55, y: gy(40.20, 32.55), ry: 0.05, lean: 0.07, color: 0x4f8f6a }));
  makeChalkMarks(ctx, [{ x: 37.80, z: 32.90, y: gy(37.80, 32.90), seed: 8655, ry: 0.4 }]);
  makeLoosePaper(ctx, [{ x: 35.10, z: 32.60, y: gy(35.10, 32.60) + 0.01, ry: -0.5 }]);

  /* Two street cherries, both off the sight line and both on the park verge
   * where their canopies fall over the benches.  A trunk in the middle of the
   * square closes the view north at the flats, which is the whole reason the
   * square is here -- same rule as the school forecourt skipping the gate axis
   * and the row west of the overbridge deck. */
  sakura.push({ x: 32.55, z: 31.50, y: gy(32.55, 31.50), scale: 1.14, seed: 8656, lean: 0.11, leanDir: 1.6 });
  sakura.push({ x: 35.60, z: 31.45, y: gy(35.60, 31.45), scale: 1.08, seed: 8657, lean: 0.09, leanDir: 4.3 });
  for (const [sx, sd] of [[34.80, 8660], [37.90, 8661], [43.30, 8662]]) {
    shrubs.push({ x: sx, z: 31.20, y: gy(sx, 31.20), r: 0.30, count: 3, spread: 0.85, seed: sd });
  }
  petals.push({ x: 37.50, z: SQ_Z, w: 10.0, d: 3.2, y: Y + 0.12, n: 110 });
  /* the fallen blossom on leg 2, off the lineside cherry and these two */
  petals.push({ x: 41.00, z: EW_Z, w: 12.0, d: 2.0, y: groundY(EW_Z) + 0.11, n: 90 });
}

/* ------------------------------------------------------------------ *
 * (c) -- ひばり荘's service side, and the second half of the loop.
 *
 * 4.4 m between the flats' east flank and block 2's spine kerb, climbing 0.25 m
 * from the square to the north lane.  It has never been anything but grass, and
 * it is the only route from the park end of the district up to the north lane
 * that does not go all the way round by the shopping street.
 *
 * Laid as three overlapping level slabs rather than one, because the ground
 * rises across it: one slab would stand a quarter of a metre proud at the low
 * end, and platforms have to *overlap* -- a few centimetres of gap between two
 * of them is a hole the player falls through.
 * ------------------------------------------------------------------ */

function buildService(ctx, sakura, shrubs, petals) {
  const gm = groundMats();
  const gy = (x, z) => ctx.groundAt(x, z);

  for (const [z0, z1] of [[35.20, 38.20], [38.10, 41.10], [41.00, 43.55]]) {
    const zc = (z0 + z1) / 2;
    pad(ctx, {
      x: 45.00, z: zc, w: 3.80, d: z1 - z0, y: groundY(zc), h: 0.09,
      mat: gm.concrete, name: 'koenmaeService',
    });
    /* the channel runs with each slab, not across all three: `laneGutter` takes
     * one `y`, and a single run over a strip that climbs 0.25 m would be 0.12 m
     * under the paving at one end and floating at the other */
    laneGutter(ctx, {
      axis: 'z', at: 43.35, from: z0 + 0.25, to: z1 - 0.25, y: groundY(zc) + 0.055,
      pitch: 0.95, manholes: zc > 41 ? [42.10] : (zc < 38 ? [36.90] : []), manholeOff: 0.85,
    });
  }

  /* The refuse point stays at the south end, against the flats.  The former
   * north set stood in the road at the junction and has been removed. */
  refusePoint(ctx, { x: 44.30, z: 36.10, y: gy(44.30, 36.10), kind: 'bins', ry: Math.PI / 2, plate: 0 });

  /* the drying line: two airers and a pole, all parallel to the flank */
  ctx.add(makeDryingRack({ x: 43.95, z: 37.60, y: gy(43.95, 37.60), ry: Math.PI / 2, n: 5, seed: 8671 }));
  ctx.add(makeDryingRack({ x: 46.20, z: 38.60, y: gy(46.20, 38.60), ry: Math.PI / 2 + 0.18, n: 4, seed: 8672 }));
  ctx.add(makeLaundryPole({ ctx,
    x: 46.30, z: 36.60, y: gy(46.30, 36.60), ry: Math.PI / 2, len: 2.2, n: 4, seed: 8673,
  }));

  /* the 物置 the block keeps, back to the flats' wall.  The wall's outward normal
   * is +x, so the doors turn +PI/2 and the origin sits at `APT_X + d/2 + 0.06`. */
  {
    const d = 0.80, w = 1.60, sz = 39.10;
    const sx = APT_X + d / 2 + 0.06;
    const sh = makeStorageShed({ x: sx, z: sz, y: gy(sx, sz), ry: Math.PI / 2, w, d, h: 1.72 });
    ctx.add(sh);
    ctx.collide(sx - d / 2 - 0.1, sz - w / 2 - 0.1, sx + d / 2 + 0.1, sz + w / 2 + 0.1, gy(sx, sz) + sh.userData.top);
  }

  /* Keep the single bicycle against the far edge; the row that occupied the
   * middle of the service road has been removed. */
  ctx.add(makeBicycle({ x: 46.90, z: 41.60, y: gy(46.90, 41.60), ry: Math.PI / 2 + 0.06, lean: -0.08, color: 0x9c5a4a }));

  /* One more outdoor unit, north of the two `district.js` already hangs on this
   * flank at (42.64, 37.60) and (42.64, 40.40) -- not a third beside them.  Same
   * convention: the grille is on local +z, so `ry` is `atan2(nx, nz)` of the
   * wall's outward normal, and the origin sits at `wall + (d / 2 + standoff)` so
   * the brackets span the gap and the back face touches the render. */
  ctx.add(makeAircon({
    x: APT_X + 0.24, z: 42.20, y: gy(APT_X + 0.24, 42.20) + 0.50, ry: Math.PI / 2,
    w: 0.86, h: 0.60, d: 0.30, feet: false, standoff: 0.09,
  }));
  /* ivy up the flank, in two runs that dodge the 物置 and the outdoor unit.
   * `ry = PI/2` sends the run's length along z and pushes the leaves out along
   * +x, off the face rather than into it. */
  ctx.add(makeIvy({
    x: APT_X + 0.04, z: 36.60, y: gy(APT_X + 0.04, 36.60), ry: Math.PI / 2,
    len: 2.6, top: 1.55, drop: 1.0, face: 1, n: 46, seed: 8674,
  }));
  ctx.add(makeIvy({
    x: APT_X + 0.04, z: 41.00, y: gy(APT_X + 0.04, 41.00), ry: Math.PI / 2,
    len: 1.9, top: 1.20, drop: 0.8, face: 1, n: 32, seed: 8675,
  }));

  ctx.add(makeTapPost({ x: 43.30, z: 35.70, y: gy(43.30, 35.70), ry: Math.PI / 2 }));
  ctx.add(makeCrates({ x: 46.55, z: 35.60, y: gy(46.55, 35.60), n: 3, seed: 8676, ry: -0.2 }));
  ctx.add(makeMilkCrate({ x: 46.60, z: 40.20, y: gy(46.60, 40.20), ry: 0.5 }));
  ctx.add(makePlanter({ x: 43.35, z: 43.10, y: gy(43.35, 43.10), r: 0.24, flower: true, seed: 8677, n: 5 }));
  ctx.add(makeBroom({ x: 42.85, z: 38.20, y: gy(42.85, 38.20), tilt: -0.05, roll: -0.2, ry: -1.5 }));
  makeLoosePaper(ctx, [{ x: 45.60, z: 39.80, y: gy(45.60, 39.80) + 0.01, ry: 0.4 }]);

  /* the one cherry on this side.  Against the flats' pale render, which is the
   * best backdrop in the block, and on the *far* verge so the strip stays
   * walkable at 2.66 m past it. */
  sakura.push({ x: 46.35, z: 41.40, y: gy(46.35, 41.40), scale: 1.10, seed: 8678, lean: 0.10, leanDir: 2.4 });
  shrubs.push({ x: 46.90, z: 37.20, y: gy(46.90, 37.20), r: 0.44, count: 3, spread: 1.0, seed: 8679 });
  shrubs.push({ x: 43.20, z: 41.90, y: gy(43.20, 41.90), r: 0.34, count: 3, spread: 0.85, seed: 8680 });
  petals.push({ x: 45.60, z: 41.00, w: 3.2, d: 4.0, y: gy(45.60, 41.00) + 0.11, n: 60 });
}
