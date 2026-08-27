import * as THREE from 'three';
import { PAL } from '../core/palette.js';
import { cel } from '../core/toon.js';
import { hallNotice, warningPlate, roadSignTex } from '../core/textures.js';
import { box, cyl, bake, trs, rngKit } from '../core/util.js';
import { groundY } from './street.js';
import { pad, lane, laneLine, railing, groundMats } from './ground.js';
import {
  plotBox, plotCollide, plotWall, hedgeRun, stepStones, refusePoint, dressPlot,
  laneGutter, bollardRow, laneSign, poleRun,
} from './plots.js';
import { makeNagaya, makeTimberHouse } from './blocks.js';
import { makeTerrace, makeAtticHouse, makeBikeShelter } from './housing.js';
import {
  makeBench, makeBikeRack, makeBicycle, makeNoticeBoard, makePlanter, makeFlowerBed,
  makeSignPost, makeMirror, makeTapPost, makeStorageShed, makeBucket, makeBroom,
  makeCrates, makeMilkCrate, makeIvy, makeLaundryPole, makeAircon, makeLoosePaper,
  makeCone, makeDoormat, makeUmbrellaStand, makePotShelf, makeCatBox, makePetBowl,
  makeMailboxBank, makeDeliveryBox, makeRecycleBox,
} from './props.js';
import {
  makeKitchenGarden, makeDryingRack, makeGasMeter, makeWaterMeter, makeKidBike,
  makeChalkMarks, makeBallBox,
} from './streetprops.js';

/* ------------------------------------------------------------------ *
 * 川端の道 -- the lane between the canal and the school's back wall.
 *
 * The largest single piece of empty ground left anywhere near the middle of the
 * map: 36 m by 10.6 m, dead flat at 1.05, with water down one side and 2.35 m of
 * school wall down the other.  Nothing had ever been built on it because it is
 * *behind* everything -- behind the school, behind the house on the 通学路,
 * across the canal from the crossing -- and the only ways in are two slots
 * either side of that house, 0.82 m and 0.94 m of walkable ground each.
 *
 * That is the whole character of the street and it is why it is a lane and not
 * a road: **nothing with four wheels can get here.**  So the buildings are the
 * types that never needed a car -- a 長屋, a 木造平屋, a 連棟 二戸, a 二階半 and
 * an old two-storey timber house -- and what would be a carriageway anywhere
 * else is 2.8 m of worn asphalt with a gutter down one side.
 *
 * ------------------------------------------------------------------ *
 * THE LAND, measured.  Envelope x 19.4..56.0, z -30.2..-40.8:
 *
 *   north   the canal's retaining kerb, z -30.20..-29.84, top 1.27, running
 *           x 10.45..44.00 -- **and stopping there.**  `canal.js` runs its
 *           structure the whole way round the planet and its *dressing* only
 *           over x -58..44, so east of x = 44 the water's edge is a bare 0.40 m
 *           drop onto the towpath with nothing at all along it.  That is the
 *           single most load-bearing fact about this site and the reason the
 *           first thing built here is a railing.
 *   south   the school's north wall, x 10.60..56.00 at z -41.00, 2.35 m of
 *           block with mesh to 3.45 (`school.js`, `Z_S`/`X_W`/`X_E`)
 *   east    the school's east wall turns north at x 55.9 and runs to z -74
 *   west    the house at (14.4,-35.5), x 10.80..18.00, z -39.30..-31.70, with
 *           a 1.5 m slot north of it and a 1.62 m slot south
 *   in it   one grove tree, `canal.js`'s at (28.6, -34.2) at scale 1.8, whose
 *           collider is x 27.87..29.33, z -34.93..-33.47
 *
 * ------------------------------------------------------------------ *
 * WHAT THE ARITHMETIC DECIDED
 *
 * **The lane is at z = -32.2 because of that one tree.**  At -32.6, where a
 * 2.8 m carriageway wants to be to leave 7 m of plot, the tree's collider comes
 * 0.53 m into the south verge.  -32.2 clears it by 0.13 m and still leaves
 * 7.2 m of plot depth, which is a 1.7 m front garden and a 5.0 m building.  The
 * tree stays: it is the canal's own south-bank mass, and standing it in a break
 * in the row instead gives it a better job than it had.
 *
 * **The frontages face +z, into the canal.**  The sun is at (-52, 62, 56), so a
 * +z elevation is the warm one -- 四丁目 and 二丁目 both record it.  Facing the
 * water is therefore also facing the light, which is the whole reason a lane
 * like this is worth building: five sunlit frontages with the channel in front
 * of them and a blank wall behind you.
 *
 * **The way down to the water is at the far end, and it is a ramp.**  There is
 * a flight at こばと橋 already (`gakkomae.js`) and a second one would be the
 * same beat twice; and east of x = 44 there is no kerb to cut through, so a
 * 1:11 ramp lies straight on the bank.  It is also the only bicycle-friendly
 * way onto the towpath in the world.
 *
 * FLOODFILL -- every one of these must be reachable on foot from the spawn:
 *   slotNorth  [14.6, -30.9]  the 1.5 m slot north of the house, the way in
 *   slotSouth  [14.6, -40.1]  the 1.62 m slot south of it
 *   laneWest   [21.0, -32.2]  the mouth, at the name plate
 *   laneMid    [33.0, -32.2]  outside the 木造平屋, past the tree
 *   laneEast   [53.0, -32.2]  the turning head at the school's corner
 *   pocket     [29.2, -32.9]  the green break, under the grove tree
 *   nagayaDoor [23.5, -34.6]  the 長屋's doorstep
 *   terraceA   [38.0, -34.4]  the 連棟's west front garden
 *   atticGate  [46.0, -34.2]  the 二階半's gate
 *   rampTop    [46.6, -30.0]  the head of the ramp, through the railing
 *   rampFoot   [50.8, -29.2]  its foot, on the towpath
 * ------------------------------------------------------------------ */

const Y = 1.05;                          // flat over the whole parcel
const LN_Z = -32.2;                      // the lane's centreline
const LN_W = 2.8;                        // z -30.80 .. -33.60
const LN_X0 = 19.4;
const LN_X1 = 55.6;
const KERB_Z = -30.0;                    // canal.js's retaining kerb, top 1.27
const KERB_X1 = 44.0;                    // where its dressing stops
const RAIL_Z = -30.45;                   // the railing, on the lane side of it
const BANK_Y = 0.655;                    // the towpath
const WALL_Z = -40.82;                   // the school's north wall, street face

/* the ramp down to the towpath, east of where the kerb stops */
const RP_X0 = 46.4;
const RP_X1 = 51.4;
const RP_Z = -29.6;
const RP_W = 2.4;                        // z -30.80 .. -28.40

/* the row, all facing 'z+' with their backs 0.4 m off the school wall */
const NAGA = { x: 23.5, z: -37.9, units: 3, unitW: 2.5, d: 4.6, face: 'z+' }; // x 19.75..27.25, z -40.20..-35.60
const POCKET = { x0: 27.5, x1: 31.0 };                                        // the grove tree's break
const KOYA = { x: 33.4, z: -37.9, w: 4.8, d: 4.4, face: 'z+' };               // x 31.00..35.80, z -40.10..-35.70
const TERR = { x: 39.3, z: -37.9, units: 2, unitW: 2.9, d: 5.0, face: 'z+' }; // x 36.40..42.20, z -40.40..-35.40
const ATT = { x: 46.0, z: -37.8, w: 5.6, d: 5.0, face: 'z+' };                // x 43.20..48.80, z -40.30..-35.30
const TIMB = { x: 52.6, z: -37.9, w: 5.4, d: 4.8, face: 'z+' };               // x 49.90..55.30, z -40.30..-35.50

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

export function buildKawabata(ctx) {
  const m = mats();
  const gm = groundMats();
  const rng = rngKit(9300);
  const sakura = [];
  const shrubs = [];
  const grove = [];
  const petals = [];

  buildLane(ctx, m, gm);
  buildCanalEdge(ctx, m, gm, sakura, shrubs, petals);
  buildRow(ctx, m, gm, rng, shrubs, petals);
  buildEastEnd(ctx, m, gm, shrubs, grove);

  /* ---------------------------- poles and cabling ----------------------------
   * Down the *south* verge, against the school wall, because the north side is
   * the water and a pole line over a canal is a different piece of engineering.
   * Four, no lamps on two of them: this is a lane the ward maintains but does
   * not light generously. */
  poleRun(ctx, {
    defs: [
      { x: 21.4, z: -34.6, y: Y, h: 7.8, seed: 9361, armDir: 1, ry: 0, lamp: true },
      { x: 31.6, z: -34.7, y: Y, h: 7.6, seed: 9362, armDir: 1, ry: 0 },
      { x: 42.9, z: -34.7, y: Y, h: 7.8, seed: 9363, armDir: 1, ry: 0, lamp: true },
      { x: 54.4, z: -34.6, y: Y, h: 7.6, seed: 9364, armDir: 1, ry: 0 },
    ],
    chains: [[0, 1], [1, 2], [2, 3]],
    drops: [[1, [33.4, Y + 3.9, -35.6]], [2, [46.0, Y + 4.4, -35.2]]],
    offsets: [[0, -0.4], [-0.38, 0.26]],
  });

  /* -------------------------------- planting --------------------------------
   * Blossom on the *water* side only.  The south side is five frontages and a
   * wall behind them, and anything tall there would put the row in its own
   * shade -- which on the one street in this world whose frontages face the sun
   * would throw away the reason it exists. */
  sakura.push({ x: 22.6, z: -30.9, y: Y, scale: 1.12, seed: 9371, lean: 0.12, leanDir: 1.5 });
  sakura.push({ x: 35.0, z: -30.9, y: Y, scale: 1.22, seed: 9372, lean: 0.10, leanDir: 4.6 });
  sakura.push({ x: 44.2, z: -30.9, y: Y, scale: 1.08, seed: 9373, lean: 0.13, leanDir: 2.7 });
  sakura.push({ x: 54.6, z: -30.8, y: Y, scale: 1.16, seed: 9374, lean: 0.09, leanDir: 3.8 });
  shrubs.push({ x: 28.4, z: -31.0, y: Y, r: 0.44, count: 3, spread: 1.05, seed: 9375 });
  shrubs.push({ x: 40.0, z: -30.9, y: Y, r: 0.42, count: 3, spread: 1.0, seed: 9376 });

  petals.push({ x: 24.0, z: LN_Z, w: 9.0, d: 2.6, y: Y + 0.07, n: 70 });
  petals.push({ x: 38.0, z: LN_Z, w: 10.0, d: 2.6, y: Y + 0.07, n: 75 });
  petals.push({ x: 51.0, z: LN_Z, w: 8.0, d: 2.6, y: Y + 0.07, n: 60 });
  petals.push({ x: 29.2, z: -33.0, w: 3.2, d: 2.2, y: Y + 0.02, n: 40 });

  return { sakura, shrubs, grove, petals };
}

/* ------------------------------------------------------------------ *
 * The lane.
 * ------------------------------------------------------------------ */

function buildLane(ctx, m, gm) {
  /* One level box along x: the whole parcel is flat, so there is nothing for a
   * swept solid to follow and `lane` with `axis: 'x'` registers the platform. */
  lane(ctx, {
    axis: 'x', at: LN_Z, from: LN_X0, to: LN_X1, w: LN_W, y: Y,
    mat: gm.asphaltWorn, kerb: false, rise: 0.05, name: 'kawabataLane',
  });
  /* The channel down the *south* side, which is where the run-off from five
   * frontages and 36 m of school wall goes.  The north side drains into the
   * canal over the kerb, which is what the kerb is for. */
  laneGutter(ctx, {
    axis: 'x', at: LN_Z - LN_W / 2 + 0.26, from: LN_X0 + 1.4, to: LN_X1 - 1.2, y: Y, pitch: 0.9,
    manholes: [26.4, 39.8, 51.2], manholeOff: -0.5,
    patches: [[30.6, -33.0, 1.6, 1.2], [47.4, -32.8, 1.3, 1.1]],
  });
  laneLine(ctx, { axis: 'x', at: LN_Z - LN_W / 2 + 0.24, from: LN_X0 + 1.0, to: LN_X1 - 1.0, y: Y + 0.08 });

  /* The name plate at the west mouth, facing east down the lane, which is the
   * way it is read from -- you arrive through the slot beside the house. */
  laneSign(ctx, {
    x: 20.2, z: -33.9, y: Y, variant: 6, h: 2.0, ry: -Math.PI / 2,
    mirror: true, mirrorAt: [-0.6, 0.7], mirrorRy: -0.9,
  });
  /* and the bollards at both slots.  A lane no car can reach still gets these:
   * they are what tell you it is a lane rather than the back of a yard. */
  bollardRow(ctx, { axis: 'z', at: 19.1, from: -31.4, to: -33.0, n: 2, y: Y });
  bollardRow(ctx, { axis: 'z', at: 18.6, from: -39.6, to: -40.4, n: 2, y: Y });

  /* ------------------------- the way in past the house -------------------------
   * 1.5 m north of the house and 1.62 m south, and both of them are dressed as
   * what they are: a passage you turn sideways in.  Nothing stands in either --
   * the walkable band is 0.82 m and 0.94 m, and a prop in a passage that narrow
   * is a hole in the picture (the 一丁目 lesson, recorded twice). */
  pad(ctx, {
    x: 14.4, z: -30.95, w: 7.6, d: 1.4, y: Y, h: 0.06,
    mat: gm.concreteMid, name: 'kawabataSlotN',
  });
  pad(ctx, {
    x: 14.4, z: -40.05, w: 7.6, d: 1.4, y: Y, h: 0.06,
    mat: gm.concreteMid, name: 'kawabataSlotS',
  });
  ctx.add(makeIvy({ x: 18.02, z: -33.65, y: Y, ry: Math.PI / 2, len: 3.4, top: 2.0, drop: 1.0, seed: 9311 }));
  ctx.add(makeIvy({ x: 18.02, z: -37.4, y: Y, ry: Math.PI / 2, len: 2.6, top: 1.7, drop: 0.9, seed: 9312 }));
}

/* ------------------------------------------------------------------ *
 * The water's edge.
 *
 * The railing is the first thing built here and the reason is arithmetic, not
 * taste: `canal.js`'s retaining kerb tops out at 1.27 against a lane at 1.10, so
 * it clears the feet by 0.17 m -- less than the 0.38 m step -- and `_resolve`
 * skips any collider that low.  It is a kerb you walk over, and behind it is a
 * 0.4 m drop onto concrete.  East of x = 44 the kerb is not there at all.  So
 * for 36 m this lane had an unguarded edge onto the channel, and a real barrier
 * has to clear the feet by more than a step: 0.95 m is the number the canal
 * settled on and this uses it.
 * ------------------------------------------------------------------ */

function buildCanalEdge(ctx, m, gm, sakura, shrubs, petals) {
  const gA = (x, z) => ctx.groundAt(x, z);

  /* the verge between the lane and the kerb, 0.9 m, paved where the furniture
   * stands and left as ground where it does not */
  pad(ctx, {
    x: 30.0, z: -30.75, w: 21.4, d: 0.9, y: Y, h: 0.06,
    mat: gm.concrete, name: 'kawabataVergeW',
  });
  pad(ctx, {
    x: 48.6, z: -30.75, w: 13.6, d: 0.9, y: Y, h: 0.06,
    mat: gm.concrete, name: 'kawabataVergeE',
  });

  /* The railing, in two runs with the ramp's head between them.  `railing`
   * registers its own collider, and at 0.95 m over a lane at 1.10 it clears the
   * 0.38 m step by a long way -- which is the whole point. */
  railing(ctx, { axis: 'x', at: RAIL_Z, from: LN_X0 - 0.2, to: RP_X0 - 0.3, y: Y, h: 0.95, spacing: 2.0, mat: m.metal });
  railing(ctx, { axis: 'x', at: RAIL_Z, from: RP_X1 + 0.3, to: LN_X1 + 0.3, y: Y, h: 0.95, spacing: 2.0, mat: m.metal });

  /* ------------------------------- the ramp -------------------------------
   * 5 m for 0.44 m, which is 1:11 -- and it lies straight on the bank because
   * east of x = 44 there is no kerb to cut through.  Built as eight platform
   * boxes under one swept slab: `heightAt` takes the max over platforms and
   * cannot express a slope, so a ramp is a staircase the eye does not read as
   * one.  0.055 m a step, which is under a kerb and walks as smooth.
   */
  {
    const N = 8;
    const TOP = Y + 0.05, FOOT = BANK_Y;
    /* **One solid, and eight platforms that are not drawn.**  The height query
     * cannot express a slope -- `heightAt` is a max over axis-aligned boxes --
     * so a ramp has to be a staircase to the *walker*.  It must not be one to
     * the *eye*: the ink pass fires on every box's silhouette, so eight of them
     * end to end came out as eight pale slabs with a black line between each,
     * which is exactly what こばと橋's deck did before it was rebuilt as a swept
     * casting.  So the platforms carry the feet and a single raked slab carries
     * the picture. */
    for (let i = 0; i < N; i++) {
      const x0 = RP_X0 + ((RP_X1 - RP_X0) * i) / N;
      const x1 = RP_X0 + ((RP_X1 - RP_X0) * (i + 1)) / N;
      ctx.platform({
        x0, x1, z0: RP_Z - RP_W / 2, z1: RP_Z + RP_W / 2,
        top: TOP - ((TOP - FOOT) * (i + 0.5)) / N,
      });
    }
    {
      const len = RP_X1 - RP_X0;
      const rake = Math.atan2(TOP - FOOT, len);          // 0.089 rad, 1:11
      const slab = box(len / Math.cos(rake) + 0.1, 0.3, RP_W, gm.concrete,
        (RP_X0 + RP_X1) / 2, (TOP + FOOT) / 2 - 0.15, RP_Z);
      /* a box along X turned by `rz` about Z sends its +x end *up*, so the sign
       * is negative for a ramp that falls to the east -- the same derivation the
       * overbridge stringers got wrong in both directions */
      slab.rotation.z = -rake;
      slab.receiveShadow = true;
      slab.castShadow = true;
      ctx.add(slab);
    }
    // the kerb upstand down the water side of it, and the rail down the other
    ctx.add(box(RP_X1 - RP_X0, 0.14, 0.16, m.concreteMid, (RP_X0 + RP_X1) / 2, Y - 0.36, RP_Z - RP_W / 2 + 0.08));
    {
      const posts = [];
      for (let i = 0; i <= 5; i++) {
        const x = RP_X0 + ((RP_X1 - RP_X0) * i) / 5;
        const top = Y + 0.05 - ((Y + 0.05 - BANK_Y) * i) / 5;
        posts.push({ geometry: new THREE.CylinderGeometry(0.035, 0.035, 0.92, 7), matrix: trs(x, top + 0.46, RP_Z + RP_W / 2 - 0.1) });
      }
      posts.push({
        geometry: new THREE.CylinderGeometry(0.04, 0.04, 5.02, 8),
        matrix: trs((RP_X0 + RP_X1) / 2, Y + 0.05 - (Y + 0.05 - BANK_Y) / 2 + 0.9, RP_Z + RP_W / 2 - 0.1, 0, 0, Math.PI / 2 - 0.088),
      });
      const r = new THREE.Mesh(bake(posts), m.metal);
      r.castShadow = true;
      ctx.add(r);
    }
    ctx.add(makeSignPost({
      x: RP_X0 - 0.6, z: -31.0, y: gA(RP_X0 - 0.6, -31.0), ry: Math.PI, h: 1.9, postMat: m.metal,
      plates: [{ map: warningPlate(2), w: 0.42, h: 0.56, y: 1.42, double: true }],
    }));
  }

  /* ------------------------------ the furniture ------------------------------
   * Three benches down 36 m, all of them facing the water, which is the only
   * thing on this street worth sitting in front of.  A bench facing the row
   * would be facing somebody's front door from two metres. */
  for (const [bx, seed] of [[25.4, 9321], [37.2, 9322], [49.6, 9323]]) {
    ctx.add(makeBench({ x: bx, z: -30.95, y: gA(bx, -30.95), ry: Math.PI, len: 1.7 }));
    ctx.add(makePlanter({ x: bx + 1.3, z: -30.9, y: gA(bx + 1.3, -30.9), r: 0.24, flower: true, seed, n: 5 }));
  }
  ctx.add(makeFlowerBed({ x: 32.0, z: -30.85, w: 2.4, d: 0.7, y: gA(32.0, -30.85), seed: 9324, n: 14 }));
  ctx.add(makeFlowerBed({ x: 43.0, z: -30.85, w: 2.0, d: 0.7, y: gA(43.0, -30.85), seed: 9325, n: 12 }));

  /* the district's refuse point and its recycling, on the verge at the mouth
   * where the two slots deliver -- which is where a collection lorry that can
   * only reach the 通学路 would actually stop */
  refusePoint(ctx, {
    kind: 'house', x: 21.2, z: -30.9, y: gA(21.2, -30.9), ry: Math.PI, plate: 1, seed: 9326,
  });
  ctx.add(makeRecycleBox({ x: 23.0, z: -30.85, y: gA(23.0, -30.85), ry: Math.PI }));

  /* the board that tells you the two things this lane joins */
  {
    const nb = makeNoticeBoard({ ctx,
      x: 34.4, z: -30.85, y: gA(34.4, -30.85), ry: Math.PI, w: 1.5, h: 1.0, y0: 0.9, wood: 0x8a6f52,
      sheets: [
        { map: hallNotice(1), x: -0.4, w: 0.4, h: 0.55, tilt: 0.018 },
        { map: hallNotice(2), x: 0.18, y: -0.02, w: 0.4, h: 0.55, tilt: -0.012 },
      ],
    });
    ctx.add(nb);
  }
  ctx.add(makeSignPost({
    x: 19.9, z: -30.9, y: gA(19.9, -30.9), ry: -Math.PI / 2, h: 2.2, postMat: m.metal,
    plates: [{ map: roadSignTex('tsugakuro'), w: 0.5, h: 0.5, y: 1.74, double: true }],
  }));

  petals.push({ x: 30.0, z: -30.8, w: 22.0, d: 1.0, y: Y + 0.07, n: 60 });
}

/* ------------------------------------------------------------------ *
 * The row.
 *
 * Five buildings and a break, in the 7.2 m between the lane and the school
 * wall.  Every one faces the water and the sun; every one has its back 0.4 m
 * off 36 m of school wall, which is where all the drying, the meters and the
 * things nobody looks at go.  The types are the five that never needed a car,
 * because nothing with four wheels can get down here.
 * ------------------------------------------------------------------ */

function buildRow(ctx, m, gm, rng, shrubs, petals) {
  const gA = (x, z) => ctx.groundAt(x, z);

  /* ------------------------------- 長屋 三戸 ------------------------------- *
   * At the mouth, where you arrive: three units under one roof with the eave
   * over the front strip and the doors a step off it.  It is the lowest thing
   * on the street and it is first, so the lane starts low and the roof line
   * climbs as you walk east. */
  {
    const p = plotBox(NAGA);
    const g = makeNagaya({ ...NAGA, y: Y, seed: 9331, h: 2.46 });
    ctx.add(g);
    plotCollide(ctx, p, Y + (g.userData.top ?? 4.3));
    for (let i = 0; i < 3; i++) {
      const u = (i - 1) * NAGA.unitW;
      const [dx, dz] = p.at(u, p.halfD + 0.22);
      ctx.add(makeDoormat({ x: dx, z: dz, y: gA(dx, dz), ry: p.outRy }));
      if (i < 2) {
        const [mx, mz] = p.at(u + NAGA.unitW / 2, p.halfD + 0.16);
        ctx.add(i % 2 === 0
          ? makeGasMeter({ x: mx, z: mz, y: gA(mx, mz), ry: p.outRy })
          : makeWaterMeter({ x: mx, z: mz, y: gA(mx, mz), ry: p.outRy }));
      }
    }
    // one thing each, all different, none more than 0.5 m off the wall
    {
      const [x, z] = p.at(-2.9, p.halfD + 0.44);
      ctx.add(makePlanter({ x, z, y: gA(x, z), r: 0.22, flower: true, seed: 9332, n: 5 }));
      const [x2, z2] = p.at(-1.9, p.halfD + 0.36);
      ctx.add(makeBucket({ x: x2, z: z2, y: gA(x2, z2), ry: 0.8 }));
    }
    {
      const [x, z] = p.at(0.5, p.halfD + 0.42);
      ctx.add(makeUmbrellaStand({ x, z, y: gA(x, z), ry: p.outRy, seed: 9333 }));
      const [x2, z2] = p.at(-0.4, p.halfD + 1.5);
      ctx.add(makeCatBox({ x: x2, z: z2, y: gA(x2, z2), ry: p.outRy + 0.3 }));
      const [x3, z3] = p.at(1.1, p.halfD + 0.3);
      ctx.add(makePetBowl({ x: x3, z: z3, y: gA(x3, z3) }));
    }
    {
      const [x, z] = p.at(2.6, p.halfD + 0.46);
      ctx.add(makePotShelf({ x, z, y: gA(x, z), ry: p.outRy, seed: 9334, w: 0.9 }));
      const [x2, z2] = p.at(3.4, p.halfD + 0.4);
      ctx.add(makeMilkCrate({ x: x2, z: z2, y: gA(x2, z2), n: 2, ry: p.outRy - 0.3 }));
    }
    // the backs, in the 0.4 m against the school wall
    ctx.add(makeLaundryPole({ ctx, x: NAGA.x - 1.6, z: p.z0 - 0.34, y: gA(NAGA.x - 1.6, p.z0 - 0.34), ry: 0, len: 2.4, n: 4, seed: 9335 }));
    ctx.add(makeAircon({ x: NAGA.x + 1.8, z: p.z0 - 0.24, y: gA(NAGA.x + 1.8, p.z0 - 0.24), ry: Math.PI, w: 0.72, h: 0.52 }));
    ctx.add(makeBicycle({ x: p.x1 + 0.5, z: NAGA.z + 0.4, y: gA(p.x1 + 0.5, NAGA.z + 0.4), ry: Math.PI / 2, lean: 0.06, color: 0x8f6fb5 }));
    petals.push({ x: NAGA.x, z: p.z1 + 0.8, w: 7.6, d: 1.4, y: Y + 0.02, n: 45 });
  }

  /* -------------------------------- the break --------------------------------
   * `canal.js`'s grove tree at (28.6, -34.2) at scale 1.8 stands here and it is
   * staying: it is the south bank's own mass and it is what stops 36 m of roof
   * line running unbroken.  So the row breaks round it and the 3.5 m becomes the
   * street's one piece of green -- a bench under it, a bed, and the standpipe
   * three households share. */
  {
    const cx = (POCKET.x0 + POCKET.x1) / 2;
    pad(ctx, {
      x: cx, z: -35.6, w: POCKET.x1 - POCKET.x0, d: 4.6, y: Y, h: 0.05,
      mat: gm.gravel, name: 'kawabataPocket',
    });
    ctx.add(makeBench({ x: 30.69, z: -35.85, y: gA(30.69, -35.85), ry: -Math.PI / 2, len: 1.5 }));
    ctx.add(makeTapPost({ x: 27.9, z: -36.6, y: gA(27.9, -36.6), ry: Math.PI / 2 }));
    ctx.add(makeBucket({ x: 28.4, z: -36.9, y: gA(28.4, -36.9), ry: 0.5, water: true }));
    ctx.add(makeFlowerBed({ x: 29.4, z: -34.4, w: 1.8, d: 0.8, y: gA(29.4, -34.4), seed: 9336, n: 12 }));
    ctx.add(makeCrates({ x: 30.4, z: -37.4, y: gA(30.4, -37.4), n: 3, seed: 9337, ry: 0.2 }));
    ctx.add(makeDryingRack({ x: 28.6, z: -38.6, y: gA(28.6, -38.6), ry: 0, n: 4, seed: 9338 }));
    ctx.add(makeKidBike({ x: 30.3, z: -33.3, y: gA(30.3, -33.3), ry: 2.2, lean: 0.32 }));
    makeChalkMarks(ctx, [
      { x: 29.0, z: -33.4, y: Y + 0.06, ry: 0.3 },
      { x: 30.0, z: -34.2, y: Y + 0.06, ry: -0.5 },
    ]);
    shrubs.push({ x: 27.9, z: -39.4, y: Y, r: 0.42, count: 3, spread: 1.0, seed: 9339 });
  }

  /* ------------------------------ 木造平屋 ------------------------------ */
  {
    const p = plotBox(KOYA);
    const h = makeTimberHouse({
      ...KOYA, y: Y, floors: 1, roofKind: 'gable', engawa: 1, plaster: false,
      eave: 0.7, seed: 9340, door: 1, nameVariant: 2, lit: true,
    });
    ctx.add(h);
    plotCollide(ctx, p, Y + (h.userData.top ?? 4.6));
    const doorAt = h.userData.doorAt ?? 0;
    plotWall(ctx, {
      x0: p.x0, x1: p.x1, z0: p.z1 + 1.25, z1: p.z1 + 1.5, sides: ['z+'], kind: 'timber',
      h: 0.22, fenceH: 0.66, y: Y, seed: 9341,
      gate: { side: 'z+', at: KOYA.x + doorAt, w: 1.8 },
    });
    const [dx, dz] = p.at(doorAt, p.halfD + 0.3);
    stepStones(ctx, { from: [KOYA.x + doorAt, p.z1 + 1.05], to: [dx, dz], y: Y, n: 3, seed: 9342 });
    dressPlot(ctx, {
      ...KOYA, y: Y, doorAt, seed: 9343, gap: 1.2, gateAt: doorAt,
      clear: (x, z) => z < p.z1 + 1.15,
      aircon: true, airconAt: -2.25, airconOut: 0.20, gas: true, mat: true, pots: true, parcel: false, umbrella: true,
      bike: true, kidBike: false, laundry: false, garden: 1, tap: 0, flank: 0.7,
    });
    ctx.add(makeKitchenGarden({ x: KOYA.x + 1.2, z: p.z0 - 0.7, y: gA(KOYA.x + 1.2, p.z0 - 0.7), ry: Math.PI, w: 1.8, d: 0.9, seed: 9344 }));
    shrubs.push({ x: p.x0 - 0.55, z: KOYA.z, y: Y, r: 0.38, count: 3, spread: 0.9, seed: 9345 });
  }

  /* ------------------------------- 連棟 二戸 ------------------------------- */
  {
    const p = plotBox(TERR);
    const t = makeTerrace({ ...TERR, y: Y, seed: 9346, wall: 6, roof: 1 });
    ctx.add(t);
    plotCollide(ctx, p, Y + (t.userData.top ?? 6.0));
    const FZ = p.z1 + 1.2;
    for (let i = 0; i < 2; i++) {
      const x0 = p.x0 + i * TERR.unitW, x1 = x0 + TERR.unitW;
      plotWall(ctx, {
        x0, x1, z0: FZ, z1: FZ + 0.26, sides: ['z+'], kind: 'block',
        h: 0.32, fenceH: 0.46, y: Y, seed: 9347 + i,
        gate: { side: 'z+', at: (x0 + x1) / 2, w: 1.0 },
      });
      const u = (i - 0.5) * TERR.unitW;
      const [gx, gz] = p.at(u, p.halfD + 1.05);
      const [dx, dz] = p.at(u, p.halfD + 0.22);
      stepStones(ctx, { from: [gx, gz], to: [dx, dz], y: Y, n: 3, seed: 9349 + i });
    }
    {
      const [x, z] = p.at(-1.6, p.halfD + 0.5);
      ctx.add(makeUmbrellaStand({ x, z, y: gA(x, z), ry: p.outRy, seed: 9351 }));
      const [x2, z2] = p.at(-2.4, p.halfD + 0.42);
      ctx.add(makePlanter({ x: x2, z: z2, y: gA(x2, z2), r: 0.24, flower: true, seed: 9352, n: 5 }));
    }
    {
      const [x, z] = p.at(-0.67, p.halfD + 0.91);
      ctx.add(makeBicycle({ x, z, y: gA(x, z), ry: p.outRy, lean: 0, color: 0x6a7d5c }));
      const [x2, z2] = p.at(2.5, p.halfD + 0.42);
      ctx.add(makeDeliveryBox({ x: x2, z: z2, y: gA(x2, z2), ry: p.outRy }));
    }
    for (let i = 0; i < 2; i++) {
      const [x, z] = p.at((i - 0.5) * TERR.unitW + 0.9, -p.halfD - 0.16);
      ctx.add(makeGasMeter({ x, z, y: gA(x, z), ry: p.outRy + Math.PI }));
    }
    ctx.add(makeLaundryPole({ ctx, x: TERR.x - 0.6, z: p.z0 - 0.36, y: gA(TERR.x - 0.6, p.z0 - 0.36), ry: 0, len: 2.4, n: 4, seed: 9353 }));
    ctx.add(makeCatBox({ x: p.x1 + 0.5, z: p.z1 - 0.6, y: gA(p.x1 + 0.5, p.z1 - 0.6), ry: 1.1 }));
    petals.push({ x: TERR.x, z: p.z1 + 0.8, w: 5.8, d: 1.4, y: Y + 0.02, n: 40 });
  }

  /* -------------------------------- 二階半 -------------------------------- *
   * The tallest thing on the street, and it is two thirds of the way along on
   * purpose: from the mouth the roof line runs 長屋, 平屋, 連棟, *dormer*,
   * 二階建, which is a climb and then a settle rather than a row. */
  {
    const p = plotBox(ATT);
    const h = makeAtticHouse({
      ...ATT, y: Y, seed: 9354, wall: 5, roof: 0, door: 4, nameVariant: 6,
      lit: true, litDormer: true,
    });
    ctx.add(h);
    plotCollide(ctx, p, Y + (h.userData.top ?? 8.3));
    const doorAt = h.userData.doorAt ?? (ATT.w / 2 - 1.15);
    plotWall(ctx, {
      x0: p.x0, x1: p.x1, z0: p.z1 + 1.15, z1: p.z1 + 1.4, sides: ['z+'], kind: 'block',
      h: 0.36, fenceH: 0.56, y: Y, seed: 9355,
      gate: { side: 'z+', at: ATT.x + doorAt, w: 1.8 },
    });
    const [dx, dz] = p.at(doorAt, p.halfD + 0.4);
    stepStones(ctx, { from: [ATT.x + doorAt, p.z1 + 0.95], to: [dx, dz], y: Y, n: 3, seed: 9356 });
    /* **The outdoor unit is on the wall, and at the far end of the frontage.**
     * `dressPlot` puts it at `±(halfW - 0.75)` without consulting the slot
     * allocator, so on this plot it landed at u = +2.05 -- which is inside the
     * front door's own step: `makeAtticHouse` runs a 1.5 m entrance step out to
     * local z 2.86 at `ex = doorAt`, i.e. x 46.9..48.4, and a ground-standing
     * unit there is buried to its middle in concrete.  There is only 0.4 m of
     * frontage east of that step, so the unit goes west (u = -2.05) and up onto
     * the wall, which is where half the outdoor units in Japan are anyway.
     * `airconOut` drops to 0.09 with it: 0.20 was clearing the plinth, and a
     * wall unit is 1.25 m above the plinth -- at 0.20 its bracket arms, which
     * span exactly the standoff, would not reach the wall. */
    dressPlot(ctx, {
      ...ATT, y: Y, doorAt, seed: 9357, gap: 1.15, gateAt: doorAt,
      clear: (x, z) => z < p.z1 + 1.05,
      aircon: true, airconAt: -2.05, airconOut: 0.09, airconUp: 1.25,
      gas: true, mat: true, pots: true, parcel: true, umbrella: true,
      bike: true, kidBike: true, laundry: false, garden: 0, tap: 1, flank: 0.65, tapBucketOffset: [0, 0.55],
    });
    ctx.add(makeBallBox({ x: p.x0 + 0.7, z: p.z1 + 0.6, y: gA(p.x0 + 0.7, p.z1 + 0.6), ry: 0, seed: 9358 }));
    ctx.add(makeDryingRack({ x: ATT.x + 0.6, z: p.z0 - 0.55, y: gA(ATT.x + 0.6, p.z0 - 0.55), ry: Math.PI, n: 4, seed: 9359 }));
    shrubs.push({ x: p.x1 + 0.7, z: ATT.z - 1.2, y: Y, r: 0.4, count: 3, spread: 0.95, seed: 9360 });
  }

  /* ------------------------------ 木造二階建 ------------------------------ *
   * The oldest-looking thing here, at the far end where the street runs out --
   * boarding, a heavy tiled roof and a 格子 frontage, which is the elevation
   * that closes the walk. */
  {
    const p = plotBox(TIMB);
    const h = makeTimberHouse({
      ...TIMB, y: Y, floors: 2, roofKind: 'hip', engawa: -1, plaster: true,
      eave: 0.78, seed: 9365, door: 3, nameVariant: 1, lit: true,
    });
    ctx.add(h);
    plotCollide(ctx, p, Y + (h.userData.top ?? 6.8));
    const doorAt = h.userData.doorAt ?? 0;
    plotWall(ctx, {
      x0: p.x0, x1: p.x1, z0: p.z1 + 1.2, z1: p.z1 + 1.44, sides: ['z+'], kind: 'timber',
      h: 0.24, fenceH: 0.72, y: Y, seed: 9366,
      gate: { side: 'z+', at: TIMB.x + doorAt, w: 1.8 },
    });
    const [dx, dz] = p.at(doorAt, p.halfD + 0.32);
    stepStones(ctx, { from: [TIMB.x + doorAt, p.z1 + 1.0], to: [dx, dz], y: Y, n: 3, seed: 9367 });
    dressPlot(ctx, {
      ...TIMB, y: Y, doorAt, seed: 9368, gap: 1.15, gateAt: doorAt,
      clear: (x, z) => z < p.z1 + 1.1,
      aircon: true, gas: true, mat: true, pots: true, parcel: false, umbrella: false,
      bike: true, kidBike: false, laundry: false, garden: 1, tap: 1, flank: 0.75,
    });
    ctx.add(makeMilkCrate({ x: p.x0 + 0.6, z: p.z1 + 0.5, y: gA(p.x0 + 0.6, p.z1 + 0.5), n: 2, ry: 0.3 }));
    ctx.add(makeLaundryPole({ ctx, x: TIMB.x, z: p.z0 - 0.36, y: gA(TIMB.x, p.z0 - 0.36), ry: 0, len: 2.6, n: 5, seed: 9369 }));
    ctx.add(makeStorageShed({ x: p.x1 + 0.55, z: p.z0 + 1.0, y: gA(p.x1 + 0.55, p.z0 + 1.0), ry: -Math.PI / 2, w: 1.4, d: 0.8, h: 1.7 }));
    ctx.collide(p.x1 + 0.15, p.z0 + 0.3, p.x1 + 0.95, p.z0 + 1.7, Y + 1.74);
    ctx.add(makeIvy({ x: p.x1 + 0.04, z: TIMB.z - 1.0, y: Y, ry: Math.PI / 2, len: 2.2, top: 1.9, drop: 0.9, seed: 9370 }));
    petals.push({ x: TIMB.x, z: p.z1 + 0.9, w: 5.2, d: 1.5, y: Y + 0.02, n: 40 });
  }
}

/* ------------------------------------------------------------------ *
 * The east end.
 *
 * Where the school's north wall meets its east wall, and where the lane stops.
 * A lane with no vehicle access does not need a turning head, so what closes it
 * is the corner itself -- two 2.35 m walls meeting with the mesh above them --
 * a bench looking back west down the whole street with the water on the right,
 * and the planting that says the town ends here.
 * ------------------------------------------------------------------ */

function buildEastEnd(ctx, m, gm, shrubs, grove) {
  const gA = (x, z) => ctx.groundAt(x, z);
  pad(ctx, {
    x: 55.6, z: -33.2, w: 3.6, d: 5.4, y: Y, h: 0.06,
    mat: gm.concreteMid, name: 'kawabataEastEnd',
  });
  ctx.add(makeBench({ x: 56.3, z: -32.4, y: gA(56.3, -32.4), ry: -Math.PI / 2, len: 1.7 }));
  ctx.add(makePlanter({ x: 56.6, z: -33.8, y: gA(56.6, -33.8), r: 0.26, flower: true, seed: 9381, n: 5 }));
  ctx.add(makeCone({ x: 55.0, z: -30.9, y: gA(55.0, -30.9), ry: 0.4 }));
  /* the school's corner board -- the one piece of the school that addresses this
   * side of it, and the reason the walk down here ends at something */
  {
    const nb = makeNoticeBoard({ ctx,
      x: 54.0, z: -40.35, y: gA(54.0, -40.35), ry: 0, w: 1.4, h: 0.95, y0: 0.92, wood: 0x7d6146,
      sheets: [{ map: hallNotice(0), x: 0, w: 0.4, h: 0.55, tilt: 0.015 }],
    });
    ctx.add(nb);
  }
  /* the hedge that turns the corner north of the wall, and the mass behind it:
   * past x = 56 there is nothing at all, so this is the edge of the built world
   * on this side and it has to read as an edge rather than as a stop */
  hedgeRun(ctx, { axis: 'z', at: 57.6, from: -34.6, to: -30.6, y: Y, h: 1.05, seed: 9382 });
  grove.push({ x: 59.4, z: -33.0, y: gA(59.4, -33.0), scale: 1.55, seed: 9383, spread: 1.15 });
  grove.push({ x: 58.6, z: -37.6, y: gA(58.6, -37.6), scale: 1.4, seed: 9384, spread: 1.1 });
  shrubs.push({ x: 57.4, z: -35.8, y: Y, r: 0.46, count: 3, spread: 1.1, seed: 9385 });
  shrubs.push({ x: 56.2, z: -30.4, y: Y, r: 0.42, count: 3, spread: 1.0, seed: 9386 });
}
