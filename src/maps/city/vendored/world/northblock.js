import * as THREE from 'three';
import { PAL } from '../core/palette.js';
import { cel, flat } from '../core/toon.js';
import { parkingSign, gomiPlate, warningPlate, chalkNotice } from '../core/textures.js';
import { box, cyl, bake, trs, rngKit, sagCurve } from '../core/util.js';
import { hullOutline } from '../core/outline.js';
import { groundY } from './street.js';
import { pad, lane, laneLine, wallRun, railing, groundMats } from './ground.js';
/* `makePoleLite` moved to `plots.js` when six more residential blocks needed it.
 * Two copies of one assembly is how both copies of the bicycle ended up with
 * the fork three tenths of a metre short of the front hub. */
import { makePoleLite } from './plots.js';
import { makeAtticHouse, makeWalkup, makeTerrace, makeCarport, makeBikeShelter } from './housing.js';
import { makeHouse, makeBlockFence, makeTimberFence } from './buildings.js';
import { makeShop, makeShopFlag, makeProduceStack } from './shops.js';
import { addVending } from './vending.js';
import {
  makeSignPost, makeBikeRack, makeBins, makePlanter, makeLaundryPole,
  makeAircon, makePostBox, makeUmbrellaStand, makeBucket, makeCrates,
  makeBicycle, makeMailboxBank, makeDeliveryBox, makeDoormat,
  makePotShelf, makeStorageShed, makeTapPost, makeIvy, makeLoosePaper, makeVendBin,
  makeCatBox, makeBroom,
} from './props.js';

/* ------------------------------------------------------------------ *
 * The north block -- ひばり台三丁目.
 *
 * The district's housing was twenty-five detached houses and one walk-up, and
 * that is not what a Japanese suburb looks like: it looks like five or six
 * *types* interleaved, because the plots were sold off at different times to
 * different buyers.  So this block is deliberately one of each, on one lane:
 *
 *   米・酒 なかの     a corner shop with the family's flat over it, on the main
 *                    road where the north lane meets it
 *   coin parking      relocated here off the shopping street (see below)
 *   the lane          3.2 m, no kerbs, one lamp, poles down one side
 *   二階半の家        the attic house, its dormer the tallest thing on the lane
 *   ひばり台コーポ    a three-storey walk-up, gallery and open stair on the lane
 *   連棟 三戸         a terrace of three, each with a bay in front of it
 *   片流れの平屋      a single-storey house under one falling roof
 *
 * They are all on one 3.2 m lane off the north end of the shopping street, and
 * the lane is the point: it is the first street in the world that is *only*
 * residential, so it has no shopfronts, no signage and nothing to look at
 * except how people live -- which is exactly the brief.
 *
 * **The coin parking moved here from the shopping street**, where it occupied
 * the six metres of frontage between そうざい and the north junction.  That was
 * the only spare frontage on either row, and the brief asked for two Showa
 * units in the street itself; a car park is a far better neighbour for a
 * library forecourt and a residential lane than it was for a run of shops, and
 * "a gap in a shopping street needs a reason" is now supplied by the two old
 * shops instead.  See `showa.js`.
 * ------------------------------------------------------------------ */

/* the lane */
const LN_X = 32.4;
const LN_W = 3.2;
const LN_Z0 = 46.4;
const LN_Z1 = 63.0;

/* the plots */
/* Every plot here is set back off the lane far enough for its own boundary,
 * and that is not cosmetic: the first pass had the walk-up's gallery 0.1 m off
 * the carriageway and the attic house's frontage 0.2 m off it, so both of their
 * garden walls ended up standing *in* the lane and the flood fill found it
 * blocked in two places.  A 3.2 m lane needs its buildings 1.5 m back. */
const PARK = { x0: 23.2, x1: 30.4, z0: 47.3, z1: 52.0 };
const ATTIC = { x: 39.2, z: 51.4, w: 7.2, d: 6.6 };      // faces -x, so w runs in z
const ATTIC_GATE = 34.05;                                // its 板塀, on the lane edge
const WALK = { x: 26.4, z: 58.2, w: 8.0, d: 7.0 };       // faces +x
const TERR = { x: 42.3, z: 60.4, units: 3, unitW: 2.9, d: 6.2 };
/* **51.7 and not 50.6.**  `makeBlockGarden` puts this plot's boundary 1.9 m in
 * front of the frontage, and at z = 50.6 that landed the wall on z = 46.0 --
 * 0.9 m *inside* the north lane's east arm, which runs to z = 46.9.  The house
 * read as standing in the road because its garden was.  Moved back 1.1 m the
 * wall is at 47.1, the back wall at 54.4, and the 1.45 m left between that and
 * 連棟 三戸's boundary at 55.95 is back land nothing has to walk through. */
const SHED = { x: 45.8, z: 51.7, w: 5.6, d: 5.4 };
const SHOP = { x: 4.5, z: 51.9, w: 5.4, d: 5.0 };

const M = {};
function mats() {
  if (M.concrete) return M;
  M.concrete = cel({ color: PAL.concrete, bands: 3, tint: 0x6f6790 });
  M.concreteMid = cel({ color: PAL.concreteMid, bands: 3, tint: 0x6a6288 });
  M.metal = cel({ color: PAL.metal, bands: 3, tint: 0x666090 });
  M.metalDark = cel({ color: PAL.metalDark, bands: 3, tint: 0x5c5680 });
  M.drain = cel({ color: PAL.drain, bands: 3, tint: 0x5d5878 });
  M.wood = cel({ color: 0x9c7f5e, bands: 3, tint: 0x5c5680 });
  return M;
}

export function buildNorthBlock(ctx) {
  const m = mats();
  const gm = groundMats();
  const rng = rngKit(7701);
  const sakura = [];
  const shrubs = [];
  const grove = [];
  const petals = [];

  const Y = groundY(52);          // 0.45, and flat right across this block

  /* ------------------------- the lane and its surfaces ------------------------- *
   * The north lane in `shotengai.js` runs out at x = 40, which was the edge of
   * the world when it was built.  It gets an eastern arm here so the block has a
   * road, and the new lane hangs off that. */
  pad(ctx, {
    x: 44.3, z: 45.2, w: 8.6, d: 3.4, y: groundY(45.2), h: 0.09,
    mat: gm.asphaltWorn, name: 'northLaneEast',
  });
  laneLine(ctx, { axis: 'x', at: 45.2, from: 40.2, to: 48.4, y: groundY(45.2) + 0.11, dash: 1.1 });

  lane(ctx, {
    axis: 'z', at: LN_X, from: LN_Z0, to: LN_Z1, w: LN_W,
    mat: gm.asphaltWorn, kerb: false, rise: 0.05, name: 'northBlockLane',
  });
  /* the slotted channel down one side, and a manhole -- what a lane this narrow
   * has instead of gutters */
  {
    const parts = [];
    const n = Math.round((LN_Z1 - LN_Z0) / 0.9);
    for (let i = 0; i < n; i++) {
      const z = LN_Z0 + (i + 0.5) * ((LN_Z1 - LN_Z0) / n);
      parts.push({
        geometry: new THREE.BoxGeometry(0.3, 0.04, 0.7),
        matrix: trs(LN_X - LN_W / 2 + 0.24, groundY(z) + 0.055, z),
      });
    }
    const ch = new THREE.Mesh(bake(parts), m.drain);
    ch.receiveShadow = true;
    ctx.add(ch);
    for (const z of [49.6, 57.4]) {
      const mh = cyl(0.3, 0.3, 0.04, 12, cel({ color: PAL.metalDark, bands: 3 }), LN_X + 0.5, groundY(z) + 0.07, z);
      mh.receiveShadow = true;
      ctx.add(mh);
    }
    // two patched squares in the asphalt, from when the water main was done
    for (const [px, pz, pw, pd] of [[LN_X - 0.5, 53.4, 1.5, 1.9], [LN_X + 0.6, 60.2, 1.2, 1.4]]) {
      const p = box(pw, 0.02, pd, gm.asphalt, px, groundY(pz) + 0.065, pz);
      p.receiveShadow = true;
      p.userData.noOutline = true;
      ctx.add(p);
    }
  }

  buildCornerShop(ctx, Y, rng);
  buildCoinPark(ctx, rng);

  /* ------------------------------ 二階半の家 ------------------------------ */
  {
    const h = makeAtticHouse({
      x: ATTIC.x, z: ATTIC.z, y: Y, w: ATTIC.w, d: ATTIC.d, face: 'x-',
      seed: 7711, wall: 6, roof: 0, door: 2, nameVariant: 0, lit: true, litDormer: false,
    });
    ctx.add(h);
    // world extents: `w` runs along z once the group is turned a quarter circle
    const x0 = ATTIC.x - ATTIC.d / 2, x1 = ATTIC.x + ATTIC.d / 2;
    const z0 = ATTIC.z - ATTIC.w / 2, z1 = ATTIC.z + ATTIC.w / 2;
    ctx.collide(x0 - 0.1, z0 - 0.1, x1 + 0.1, z1 + 0.1, Y + h.userData.top);

    /* its front garden, between the frontage and the lane: a 板塀, a gate gap,
     * stepping stones, the pot shelf and the tap */
    const gx = ATTIC_GATE;
    makeTimberGarden(ctx, { x0: gx, x1: x0, z0, z1, y: Y, gapZ: ATTIC.z - 0.4, seed: 7712 });
    ctx.add(makePotShelf({ x: x0 - 0.7, z: z0 + 1.3, y: Y, ry: -Math.PI / 2, w: 1.2, n: 6, seed: 7713 }));
    ctx.add(makeTapPost({ x: x0 - 0.55, z: z1 - 1.0, y: Y, ry: -Math.PI / 2 }));
    ctx.add(makeBucket({ x: x0 - 1.0, z: z1 - 1.3, y: Y, ry: 0.6, water: true }));
    ctx.add(makePostBox({ x: gx + 0.35, z: ATTIC.z - 1.3, y: Y, ry: -1.3 }));
    ctx.add(makeDoormat({ x: x0 - 0.5, z: ATTIC.z + 1.55, y: Y, ry: Math.PI / 2, w: 0.56, d: 0.34 }));
    /* Left against the outside of the 板塀, along it.  The front garden is only
     * 1.85 m from the fence to the frontage and a bicycle is 1.73 m long, so
     * turned across it -- which is what ry = 0.3 did -- it went through the
     * boards at one end and the render at the other; and turned along it there
     * is no metre and a half of the garden free of the stepping stones, the pot
     * shelf, the tap, the bucket and the shrub. */
    ctx.add(makeBicycle({ x: gx - 0.45, z: z1 - 1.2, y: Y + 0.10, ry: Math.PI / 2 + 0.1, lean: 0.08, color: 0x4f8f6a }));
    ctx.add(makeUmbrellaStand({ x: x0 - 0.55, z: ATTIC.z + 2.1, y: Y, n: 3, seed: 7714 }));
    shrubs.push({ x: gx + 0.55, z: z1 - 1.4, y: Y, r: 0.46, count: 3, spread: 1.1, seed: 7715 });
    // in the front garden's north corner, clear of the stepping stones to the door
    sakura.push({ x: gx + 0.95, z: z0 + 1.0, y: Y, scale: 1.16, seed: 7716, lean: 0.1, leanDir: 3.6 });
  }

  /* ------------------------------ ひばり台コーポ ------------------------------ */
  {
    const b = makeWalkup({
      x: WALK.x, z: WALK.z, y: Y, w: WALK.w, d: WALK.d, face: 'x+',
      floors: 3, units: 4, seed: 7721, wall: 4, roof: 0, door: 4, plate: 0, ctx,
    });
    ctx.add(b);
    const x0 = WALK.x - WALK.d / 2, x1 = WALK.x + WALK.d / 2;
    const z0 = WALK.z - WALK.w / 2, z1 = WALK.z + WALK.w / 2;

    /* everything a block of four flats keeps outside its own front door */
    ctx.add(makeMailboxBank({ x: x1 + 0.55, z: z0 + 1.2, y: Y, ry: -Math.PI / 2, cols: 4, rows: 2 }));
    ctx.add(makeBikeShelter({ ctx, x: x1 + 1.2, z: z0 + 4.6, y: Y, ry: Math.PI / 2, w: 4.0, d: 1.8, h: 2.05 }));
    // Keep the first three bicycles in place.  The fourth reached the utility
    // pole at the end of the shelter, so the shortened row is re-centred to
    // preserve the three clear instance positions exactly.
    ctx.add(makeBikeRack({ x: x1 + 1.88, z: z0 + 4.6, y: Y + 0.09, n: 3, spacing: 0.66, ry: Math.PI / 2, seed: 77 }));
    /* **`z1 - 1.0`, not `z1 - 0.5`.**  `makeBins` lays its three bins along
     * local +x, so at `ry = -PI/2` the run climbs in z from the anchor: 1.44 m
     * of bin and a 1.58 m crow net.  Anchored at 61.7 the top bin straddled
     * z = 62.8, which is the rail closing the lane's dead end, and the rail went
     * straight through it.  Anchored at 61.2 the net tops out at 62.49 -- 0.31 m
     * clear of the rail and 0.11 m off the bike shelter's north end, which is
     * the whole of the gap there is between the two. */
    ctx.add(makeBins({ x: x1 + 0.7, z: z1 - 1.0, y: Y, ry: -Math.PI / 2 }));
    ctx.add(makeSignPost({
      x: x1 + 0.6, z: z1 - 1.6, y: Y, ry: -Math.PI / 2, h: 1.5, postMat: m.metal,
      plates: [{ map: gomiPlate(), w: 0.44, h: 0.34, y: 1.25 }],
    }));
    ctx.add(makeDeliveryBox({ x: x1 + 0.5, z: z0 + 2.2, y: Y, ry: -Math.PI / 2 }));
    /* Balcony-side outdoor units, on the -x flank: the grille has to face *away*
     * from the block, so `ry` is -PI/2.  At +PI/2 they were pointing their fans
     * into the render and standing 0.35 m clear of it besides. */
    for (const az of [z0 + 1.4, z0 + 4.0]) {
      ctx.add(makeAircon({ x: x0 - 0.25, z: az, y: Y + 0.4, ry: -Math.PI / 2, w: 0.9, h: 0.62 }));
    }
    ctx.add(makePlanter({ x: x1 + 0.5, z: z0 + 0.3, y: Y, r: 0.26, flower: true, seed: 7722, n: 5 }));
    /* **The cat box is off the lane, and turned along the wall to fit.**  At
     * `x1 + 0.9` with `ry = 0.7` its footprint was x 30.42..31.19, which
     * straddles the lane's west edge (30.8) *and* the slotted channel that runs
     * 0.24 m inside it -- and `lane({ axis: 'z' })` registers no platform, so its
     * asphalt is drawn 0.05 m above what `heightAt` answers.  Seated at `Y` the
     * box was therefore buried to a fifth of its height on the lane side and
     * standing on the drain.  Turned a quarter circle its x extent is 0.53 m and
     * it fits in the 0.9 m between the block's east face and the lane. */
    ctx.add(makeCatBox({ x: x1 + 0.45, z: z1 - 2.6, y: Y, ry: Math.PI / 2 + 0.12 }));
    makeLoosePaper(ctx, [{ x: x1 + 1.1, z: z0 + 2.9, y: Y + 0.01, ry: 0.5 }]);
    /* No boundary wall on the gallery side.  One went in and it stood 0.1 m
     * inside the lane, which walled the lane off -- and a walk-up's ground floor
     * being open to the street is right anyway: the mailboxes, the bin point and
     * the bike shelter are what define its frontage. */
  }

  /* -------------------------------- 連棟 三戸 -------------------------------- */
  {
    const t = makeTerrace({
      x: TERR.x, z: TERR.z, y: Y, units: TERR.units, unitW: TERR.unitW, d: TERR.d,
      face: 'x-', seed: 7731, wall: 7, roof: 1,
    });
    ctx.add(t);
    const W = TERR.units * TERR.unitW;
    const x0 = TERR.x - TERR.d / 2, x1 = TERR.x + TERR.d / 2;
    const z0 = TERR.z - W / 2, z1 = TERR.z + W / 2;
    ctx.collide(x0 - 0.1, z0 - 0.1, x1 + 0.1, z1 + 0.1, Y + t.userData.top);

    /* the bays: one apron, three marked stalls, three wheel stops, one carport.
     * Not three carports -- the whole read is that one household built a roof
     * over theirs and the other two did not. */
    const A0 = LN_X + LN_W / 2;
    pad(ctx, {
      x: (A0 + x0) / 2, z: TERR.z, w: x0 - A0, d: W, y: Y, h: 0.07,
      mat: gm.asphaltWorn, name: 'terraceApron',
    });
    for (let i = 0; i <= TERR.units; i++) {
      laneLine(ctx, { axis: 'z', at: z0 + i * TERR.unitW, from: A0 + 0.3, to: x0 - 0.2, y: Y + 0.09 });
    }
    for (let i = 0; i < TERR.units; i++) {
      const bz = z0 + TERR.unitW * (i + 0.5);
      ctx.add(box(0.16, 0.11, 1.3, m.concreteMid, x0 - 0.7, Y + 0.12, bz));
    }
    ctx.add(makeCarport({ ctx, x: x0 - 2.6, z: z0 + TERR.unitW * 1.5, y: Y, ry: Math.PI / 2, w: 2.7, d: 4.6, h: 2.3 }));
    for (const s of [0, 2]) {
      const bz = z0 + TERR.unitW * (s + 0.5);
      const bikeX = x0 - 1.0;
      const bikeZ = bz + (s ? -0.9 : 0.9);
      // the north unit's bike goes on the *other* side of its bay: the tin
      // store stands at z1 - 0.7 and the two were inside each other
      ctx.add(makeBicycle({
        x: bikeX, z: bikeZ, y: ctx.groundAt(bikeX, bikeZ) + 0.04, ry: 1.4, lean: 0.06,
        color: s ? 0xd8a03c : 0x9c5a4a,
      }));
    }
    ctx.add(makePlanter({ x: x0 - 0.45, z: z0 + 0.35, y: Y, r: 0.24, flower: true, seed: 7732, n: 5 }));
    ctx.add(makePlanter({ x: x0 - 0.45, z: z1 - 0.4, y: Y, r: 0.2, flower: false, seed: 7733, n: 4 }));
    ctx.add(makeDoormat({ x: x0 - 0.55, z: z0 + 0.78, y: Y, ry: Math.PI / 2 }));
    ctx.add(makeDoormat({ x: x0 - 0.55, z: z0 + 0.78 + TERR.unitW * 2, y: Y, ry: Math.PI / 2, color: 0x6a6a58 }));
    ctx.add(makePostBox({ x: A0 + 0.6, z: z0 + 1.0, y: Y, ry: -1.4 }));
    ctx.add(makeBins({ x: A0 + 0.7, z: z1 - 0.6, y: Y, ry: -Math.PI / 2 }));
    ctx.add(makeStorageShed({ x: x0 - 1.0, z: z1 - 0.7, y: Y, ry: -Math.PI / 2, w: 1.2, d: 0.68, h: 1.55 }));
    ctx.collide(x0 - 1.4, z1 - 1.1, x0 - 0.6, z1 - 0.3, Y + 1.7);
    ctx.add(makeUmbrellaStand({ x: x0 - 0.5, z: z0 + TERR.unitW + 0.9, y: Y, n: 2, seed: 7734 }));
    shrubs.push({ x: A0 + 1.2, z: z1 + 0.8, y: Y, r: 0.5, count: 3, spread: 1.2, seed: 7735 });
  }

  /* ------------------------------ 片流れの平屋 ------------------------------ *
   * One storey under a single falling roof, which is the most modern thing on
   * the block and deliberately so: the lane has to look like it was built over
   * fifty years, not in one go. */
  {
    const h = makeHouse({
      x: SHED.x, z: SHED.z, y: Y, w: SHED.w, d: SHED.d, face: 'z-', floors: 1,
      seed: 7741, wall: 5, roof: 3, roofKind: 'shed', shedDir: -1, porch: true, shutters: true,
    });
    ctx.add(h);
    ctx.collide(SHED.x - SHED.w / 2 - 0.1, SHED.z - SHED.d / 2 - 0.1,
      SHED.x + SHED.w / 2 + 0.1, SHED.z + SHED.d / 2 + 0.1, Y + 2.72 + 1.4);
    const fz = SHED.z - SHED.d / 2;
    /* 1.7 m of front garden, not 1.9.  `makeBlockFence` is 0.28 thick about the
     * line it is given, so at 1.9 the boundary reached z = 46.96 against a lane
     * whose paving ends at 46.90 -- 60 mm, which reads as a wall built on the
     * kerb.  Taking 0.2 m off the garden puts it 0.26 m back and leaves the
     * planters, the post box and the delivery box exactly where they were. */
    makeBlockGarden(ctx, {
      x0: SHED.x - SHED.w / 2 - 0.4, x1: SHED.x + SHED.w / 2 + 0.4,
      z0: fz - 1.7, z1: fz, y: Y, gapX: SHED.x + 1.2, seed: 7742,
    });
    ctx.add(makePostBox({ x: SHED.x + 2.0, z: fz - 1.35, y: Y, ry: 0.2 }));
    ctx.add(makeDeliveryBox({ x: SHED.x + 2.6, z: fz - 1.5, y: Y, ry: -0.3 }));
    ctx.add(makePlanter({ x: SHED.x - 1.9, z: fz - 0.6, y: Y, r: 0.26, flower: true, seed: 7743, n: 5 }));
    ctx.add(makePlanter({ x: SHED.x - 1.3, z: fz - 0.7, y: Y, r: 0.21, flower: false, seed: 7744, n: 4 }));
    ctx.add(makeLaundryPole({ ctx, x: SHED.x + 0.6, z: SHED.z + SHED.d / 2 + 0.9, y: Y, ry: 0, len: 2.4, n: 4, seed: 7745 }));
    // west flank: outward normal is -x, so the grille turns -PI/2
    ctx.add(makeAircon({ x: SHED.x - SHED.w / 2 - 0.25, z: SHED.z + 0.6, y: Y, ry: -Math.PI / 2, w: 0.8, h: 0.58 }));
    /* **No cherry east of this house.**  It stood at (50.5, fz - 1.2), which was
     * 46.7 and just clear of 六丁目's connector -- and moving the house back 1.1 m
     * carried it to 47.8, nine tenths of a metre *inside* that carriageway, which
     * runs x 49.4..52.6 from z 46.9 all the way to the turning circle.  There is
     * nowhere left for it: the strip between this plot's east boundary at 49.14
     * and the kerb at 49.40 is 0.26 m, and everything west is the house itself.
     * The block already carries eight cherries and a grove of four. */
  }

  /* --------------------------- the lane's own furniture --------------------------- */
  {
    // one lamp, on a pole, halfway down
    const px = LN_X - LN_W / 2 - 0.35, pz = 54.6;
    const post = cyl(0.055, 0.075, 4.6, 8, m.metalDark, px, Y + 2.3, pz);
    post.castShadow = true;
    ctx.add(post);
    hullOutline(post, { thickness: 0.0032 });
    ctx.add(cyl(0.13, 0.16, 0.18, 8, m.concreteMid, px, Y + 0.09, pz));
    ctx.add(box(0.06, 0.06, 0.72, m.metalDark, px, Y + 4.56, pz + 0.34));
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.22, 12, 1, true), m.metal);
    shade.position.set(px, Y + 4.46, pz + 0.66);
    ctx.add(shade);
    ctx.add(box(0.22, 0.05, 0.22, flat({ color: 0xfff2d0 }), px, Y + 4.33, pz + 0.66));
    ctx.collide(px - 0.18, pz - 0.18, px + 0.18, pz + 0.18, Y + 4.6);

    // a mirror where the lane meets the north lane, and the 徐行 plate
    ctx.add(makeSignPost({
      x: LN_X + LN_W / 2 + 0.5, z: 47.4, y: Y, ry: -0.4, h: 2.1, postMat: m.metal,
      plates: [{ map: warningPlate(2), w: 0.44, h: 0.6, y: 1.7, double: true }],
    }));
    // three bollards at the mouth, which is what stops a lane being a road
    for (let i = 0; i < 3; i++) {
      const bx = LN_X - LN_W / 2 + 0.5 + i * 1.0;
      const b = cyl(0.055, 0.065, 0.78, 8, m.metal, bx, groundY(46.9) + 0.39, 46.9);
      b.castShadow = true;
      ctx.add(b);
      ctx.add(cyl(0.06, 0.06, 0.12, 8, cel({ color: PAL.red, bands: 3, tint: 0x7a4060 }),
        bx, groundY(46.9) + 0.7, 46.9));
    }
    // and the dead end at the far south, closed with a rail and a thicket
    railing(ctx, {
      axis: 'x', at: LN_Z1 - 0.2, from: LN_X - LN_W / 2 - 0.3, to: LN_X + LN_W / 2 + 0.3,
      y: groundY(LN_Z1) + 0.05, h: 0.92, spacing: 1.4, mat: m.metal,
    });
    for (let i = 0; i < 4; i++) {
      grove.push({
        x: LN_X - 2.4 + i * 2.0, z: LN_Z1 + 2.2 + (i % 2) * 1.6, y: groundY(LN_Z1 + 3),
        scale: 1.45 + (i % 3) * 0.18, seed: 7750 + i, spread: 1.1,
      });
    }
  }

  /* ------------------------------ poles and cabling ------------------------------ *
   * Two poles down the lane's west side with a service drop into the walk-up.
   * A residential lane with no wires over it looks like a render, not a street. */
  {
    const defs = [
      { x: LN_X - LN_W / 2 - 0.3, z: 48.6, h: 8.4, seed: 7761, armDir: -1, transformer: false },
      { x: LN_X - LN_W / 2 - 0.3, z: 58.4, h: 8.2, seed: 7762, armDir: -1, lamp: false },
    ];
    const wires = [];
    const tops = defs.map((d) => {
      const y = groundY(d.z);
      ctx.add(makePoleLite({ ...d, y }));
      ctx.collide(d.x - 0.2, d.z - 0.2, d.x + 0.2, d.z + 0.2, y + d.h);
      return new THREE.Vector3(d.x, y + d.h - 0.7, d.z);
    });
    for (const dz of [-0.5, 0.3]) {
      wires.push({ a: tops[0].clone().add(new THREE.Vector3(0, dz * 0.6, dz)), b: tops[1].clone().add(new THREE.Vector3(0, dz * 0.6, dz)) });
    }
    wires.push({ a: tops[0].clone().add(new THREE.Vector3(0, -1.6, 0)), b: new THREE.Vector3(23.6, groundY(45.2) + 7.4, 45.6) });
    wires.push({ a: tops[1].clone().add(new THREE.Vector3(0, -1.5, 0)), b: new THREE.Vector3(WALK.x + WALK.d / 2 - 0.3, Y + 7.4, WALK.z - 2.4) });
    const geos = wires.map((r) => new THREE.TubeGeometry(sagCurve(r.a, r.b, 0.5, 14), 16, 0.022, 4, false));
    const mesh = new THREE.Mesh(bake(geos.map((geometry) => ({ geometry }))),
      cel({ color: 0x4c4658, bands: 2, tint: 0x413c58 }));
    ctx.add(mesh);
    geos.forEach((g) => g.dispose());
  }

  /* --------------------------------- planting --------------------------------- */
  sakura.push({ x: LN_X - LN_W / 2 - 1.6, z: 51.6, y: Y, scale: 1.2, seed: 7770, lean: 0.12, leanDir: 4.6 });
  // south of the lane, not in it: a trunk in a 3.4 m carriageway blocks it
  sakura.push({ x: 45.0, z: 42.6, y: groundY(42.6), scale: 1.14, seed: 7771, lean: 0.1, leanDir: 2.0 });
  grove.push({ x: 21.6, z: 62.2, y: groundY(62.2), scale: 1.7, seed: 7772, spread: 1.15 });
  grove.push({ x: 47.6, z: 58.6, y: groundY(58.6), scale: 1.6, seed: 7773, spread: 1.1 });
  petals.push({ x: LN_X, z: 52.0, w: 2.8, d: 8.0, y: Y + 0.06, n: 90 });
  petals.push({ x: 44.0, z: 46.4, w: 7.0, d: 2.6, y: groundY(46) + 0.06, n: 70 });
  return { sakura, shrubs, grove, petals };
}

/* ------------------------------------------------------------------ *
 * 米・酒 なかの -- the corner shop with the flat over it.
 *
 * The one mixed-use building in the world: a shop on the ground floor and the
 * family living above it, which is what every pre-war Japanese street corner
 * is.  It reads as *domestic over commercial* because the upper storey keeps
 * its washing, its curtains and its aerial while the ground floor keeps its
 * shutter, its crates and its flag -- two different kinds of clutter stacked
 * on each other.
 * ------------------------------------------------------------------ */

function buildCornerShop(ctx, Y, rng) {
  const m = mats();
  const gm = groundMats();
  const y = groundY(SHOP.z);

  makeShop(ctx, {
    x: SHOP.x, z: SHOP.z, y, w: SHOP.w, d: SHOP.d, face: 'x-',
    kind: 'kokuya', floors: 2, h1: 3.1, h2: 2.6, wall: 1, roof: 2, roofKind: 'gable',
    roofH: 1.3, interior: 3, openW: 3.6, awning: 3, awningOut: 1.3, blade: 'kokuya',
    bladeSide: -1, shutter: 0.28, lit: true, balcony: true, seed: 7781,
  });

  const fx = SHOP.x - SHOP.d / 2;          // the frontage, facing -x
  /* the apron out to the pavement, and the goods that live on it */
  pad(ctx, {
    x: fx - 0.85, z: SHOP.z, w: 1.7, d: SHOP.w + 0.6, y, h: 0.07,
    mat: gm.concrete, name: 'kokuyaApron',
  });
  ctx.add(makeProduceStack({ x: fx - 0.75, z: SHOP.z - 1.7, y: y + 0.07, ry: -Math.PI / 2, seed: 7782 }));
  ctx.add(makeCrates({ x: fx - 0.55, z: SHOP.z + 1.9, y: y + 0.07, n: 3, seed: 7783, ry: -0.2 }));
  ctx.add(makeShopFlag({ ctx, x: fx - 0.7, z: SHOP.z - 2.4, y: y + 0.07, variant: 1, ry: -Math.PI / 2 }));
  addVending(ctx, { x: fx - 0.72, z: SHOP.z + 0.9, y: y + 0.07, ry: -Math.PI / 2, variant: 1, seed: 77 });
  ctx.add(makeVendBin({ x: fx - 0.7, z: SHOP.z + 0.05, y: y + 0.07, ry: -Math.PI / 2 }));
  // The lean takes the tyre a little below the group's authored ground plane,
  // so give this apron bicycle enough clearance to keep both wheels visible.
  ctx.add(makeBicycle({ x: fx - 1.3, z: SHOP.z + 2.1, y: y + 0.10, ry: 1.5, lean: 0.06, color: 0x3f6f9c }));
  ctx.add(makeBroom({ x: fx - 0.28, z: SHOP.z - 2.05, y: y + 0.07, tilt: -0.04, roll: -0.16, ry: -1.4 }));
  // the blackboard by the door: the shop is open, somebody chalked it this morning
  {
    const b = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.66, 0.5),
      [flat({ color: 0xffffff, map: chalkNotice(0), cache: false }),
       flat({ color: 0xffffff, map: chalkNotice(0), cache: false }),
       m.wood, m.wood, m.wood, m.wood]
    );
    b.position.set(fx - 0.42, y + 0.66, SHOP.z + 2.4);
    b.rotation.z = 0.06;
    b.castShadow = true;
    ctx.add(b);
  }
  // the family's side: an outside stair up to the flat, on the +z flank
  {
    const sz = SHOP.z + SHOP.w / 2 + 0.5;
    const parts = [];
    for (let i = 0; i < 12; i++) {
      parts.push({
        geometry: new THREE.BoxGeometry(1.1, 0.14, 0.28),
        matrix: trs(SHOP.x - 1.2 + i * 0.2, 0.28 + i * 0.27, sz),
      });
    }
    const st = new THREE.Mesh(bake(parts), m.concreteMid);
    st.position.y = y;
    st.castShadow = st.receiveShadow = true;
    ctx.add(st);
    const rail = [];
    for (let i = 0; i <= 5; i++) {
      rail.push({
        geometry: new THREE.CylinderGeometry(0.028, 0.03, 0.92, 6),
        matrix: trs(SHOP.x - 1.2 + i * 0.44, 0.4 + i * 0.594 + 0.46, sz + 0.5),
      });
    }
    rail.push({
      geometry: new THREE.CylinderGeometry(0.03, 0.03, Math.hypot(2.2, 3.0) + 0.2, 6),
      matrix: trs(SHOP.x - 0.1, 1.9 + 0.46, sz + 0.5, 0, 0, Math.PI / 2 - Math.atan2(3.0, 2.2)),
    });
    const rm = new THREE.Mesh(bake(rail), m.metal);
    rm.position.y = y;
    rm.castShadow = true;
    ctx.add(rm);
    ctx.add(makeLaundryPole({ ctx, x: SHOP.x + 0.4, z: sz + 1.0, y, ry: 0, len: 2.2, n: 3, seed: 7784 }));
    ctx.add(makePotShelf({ x: SHOP.x + 1.6, z: sz + 0.3, y, ry: 0, w: 1.0, n: 5, seed: 7785 }));
  }
  ctx.add(makeAircon({ x: SHOP.x + SHOP.d / 2 + 0.24, z: SHOP.z - 1.4, y: y + 0.3, ry: Math.PI / 2, w: 0.86, h: 0.6 }));
}

/* ------------------------------------------------------------------ *
 * ひばり駐車場, moved up from the shopping street.
 * ------------------------------------------------------------------ */

function buildCoinPark(ctx, rng) {
  const m = mats();
  const gm = groundMats();
  const y = groundY((PARK.z0 + PARK.z1) / 2);
  const BAYS = 3;
  const w = PARK.x1 - PARK.x0;
  const pitch = (w - 0.4) / BAYS;

  pad(ctx, {
    x: (PARK.x0 + PARK.x1) / 2, z: (PARK.z0 + PARK.z1) / 2, w, d: PARK.z1 - PARK.z0,
    y, h: 0.06, mat: gm.gravel, name: 'coinPark',
  });
  for (let i = 0; i <= BAYS; i++) {
    laneLine(ctx, {
      axis: 'z', at: PARK.x0 + 0.2 + i * pitch, from: PARK.z0 + 0.3, to: PARK.z1 - 0.4, y: y + 0.08,
    });
  }
  for (let i = 0; i < BAYS; i++) {
    const bx = PARK.x0 + 0.2 + (i + 0.5) * pitch;
    // wheel stop at the far end of each bay, and the coin plate that rises by it
    ctx.add(box(1.4, 0.11, 0.16, m.concreteMid, bx, y + 0.12, PARK.z1 - 0.9));
    const plate = box(0.62, 0.16, 0.5, cel({ color: 0xc8ccd4, bands: 3, tint: 0x6a6288 }), bx, y + 0.14, PARK.z1 - 1.7);
    plate.rotation.x = 0.5;
    plate.castShadow = true;
    ctx.add(plate);
    ctx.add(box(0.5, 0.1, 0.3, m.metalDark, bx, y + 0.06, PARK.z1 - 2.1));
  }
  // the payment machine and its sign, at the mouth off the lane
  {
    const mx = PARK.x1 - 0.7, mz = PARK.z0 + 0.7;
    const mach = box(0.44, 1.4, 0.5, cel({ color: 0xe4e2e6, bands: 3, tint: 0x6f6790 }), mx, y + 0.7, mz);
    mach.castShadow = mach.receiveShadow = true;
    ctx.add(mach);
    hullOutline(mach, { thickness: 0.0032 });
    ctx.add(box(0.03, 0.4, 0.34, flat({ color: 0x3a3744 }), mx - 0.24, y + 1.0, mz));
    ctx.collide(mx - 0.3, mz - 0.3, mx + 0.3, mz + 0.3, y + 1.4);
    ctx.add(makeSignPost({
      x: PARK.x1 - 0.5, z: PARK.z0 + 2.0, y, ry: -Math.PI / 2, h: 2.7, postMat: m.metal,
      plates: [{ map: parkingSign(), w: 0.62, h: 0.82, y: 2.1, double: true }],
    }));
  }
  // the low chain fence along the back, and the block wall on the west boundary
  for (let i = 0; i <= BAYS; i++) {
    ctx.add(cyl(0.05, 0.055, 0.6, 7, m.metalDark, PARK.x0 + 0.2 + i * pitch, y + 0.3, PARK.z1 - 0.35));
  }
  wallRun(ctx, {
    axis: 'z', at: PARK.x0 - 0.2, from: PARK.z0, to: PARK.z1, y, h: 1.35, t: 0.2, panel: 2.3,
    mat: m.concreteMid,
  });
  ctx.add(makeIvy({ x: PARK.x0 - 0.2, z: (PARK.z0 + PARK.z1) / 2, y, ry: Math.PI / 2, len: 4.0, top: 1.44, drop: 0.8, seed: 7791 }));
}

/* ------------------------------------------------------------------ *
 * Two garden boundaries.  (The reduced utility pole moved to `plots.js`, which
 * is where the six later residential blocks reach for it.)
 * ------------------------------------------------------------------ */

/** 板塀 round a front garden, with a gap where the gate is. */
function makeTimberGarden(ctx, o) {
  const runs = [
    { axis: 'z', at: o.x0, from: o.z0, to: o.gapZ - 0.6 },
    { axis: 'z', at: o.x0, from: o.gapZ + 0.6, to: o.z1 },
    { axis: 'x', at: o.z0, from: o.x0, to: o.x1 },
    { axis: 'x', at: o.z1, from: o.x0, to: o.x1 },
  ];
  for (const r of runs) {
    if (Math.abs((r.to ?? 0) - (r.from ?? 0)) < 0.4) continue;
    const g = makeTimberFence({
      x: r.axis === 'z' ? r.at : (r.from + r.to) / 2,
      z: r.axis === 'z' ? (r.from + r.to) / 2 : r.at,
      len: Math.abs(r.to - r.from), axis: r.axis, h: 0.36, fenceH: 0.86, y: o.y,
    });
    ctx.add(g);
    if (r.axis === 'z') ctx.collide(r.at - 0.14, r.from, r.at + 0.14, r.to, o.y + g.userData.top);
    else ctx.collide(r.from, r.at - 0.14, r.to, r.at + 0.14, o.y + g.userData.top);
  }
  // the two gate posts, and the stepping stones from the gap to the door
  for (const s of [-1, 1]) {
    const p = box(0.14, 1.4, 0.14, cel({ color: 0x74563f, bands: 3, tint: 0x554e74 }),
      o.x0, o.y + 0.7, o.gapZ + s * 0.6);
    p.castShadow = true;
    ctx.add(p);
  }
  const stones = [];
  for (let i = 0; i < 4; i++) {
    const r = 0.22 + (i % 2) * 0.03;
    stones.push({
      geometry: new THREE.CylinderGeometry(r, r, 0.08, 7),
      matrix: trs(o.x0 + 0.5 + i * 0.42, 0.04, o.gapZ + (i % 2 ? 0.28 : -0.1) + i * 0.22),
    });
  }
  const sm = new THREE.Mesh(bake(stones), cel({ color: PAL.stone, bands: 3, tint: 0x655d80 }));
  sm.position.y = o.y;
  sm.receiveShadow = true;
  ctx.add(sm);
}

/** ブロック塀 with a 透かし course, round a front garden, gapped for the gate. */
function makeBlockGarden(ctx, o) {
  const runs = [
    { axis: 'x', at: o.z0, from: o.x0, to: o.gapX - 0.6 },
    { axis: 'x', at: o.z0, from: o.gapX + 0.6, to: o.x1 },
    { axis: 'z', at: o.x0, from: o.z0, to: o.z1 },
    { axis: 'z', at: o.x1, from: o.z0, to: o.z1 },
  ];
  for (const r of runs) {
    if (Math.abs(r.to - r.from) < 0.4) continue;
    const g = makeBlockFence({
      x: r.axis === 'z' ? r.at : (r.from + r.to) / 2,
      z: r.axis === 'z' ? (r.from + r.to) / 2 : r.at,
      len: Math.abs(r.to - r.from), axis: r.axis, h: 0.62, blockH: 0.4, y: o.y,
    });
    ctx.add(g);
    if (r.axis === 'z') ctx.collide(r.at - 0.14, r.from, r.at + 0.14, r.to, o.y + 0.62);
    else ctx.collide(r.from, r.at - 0.14, r.to, r.at + 0.14, o.y + 0.62);
  }
}
