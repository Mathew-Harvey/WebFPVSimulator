import * as THREE from 'three';
import { PAL } from '../core/palette.js';
import { cel } from '../core/toon.js';
import { box, bake, trs, rngKit } from '../core/util.js';
import { pad, lane, groundMats } from './ground.js';
import {
  plotBox, plotCollide, plotWall, stepStones, refusePoint,
  laneGutter, bollardRow, laneSign, poleRun,
} from './plots.js';
import { makeTimberHouse, makeNagaya } from './blocks.js';
import {
  makeBicycle, makePlanter, makeShrine, makeTapPost,
  makeStorageShed, makeBucket, makeBroom, makeCrates, makeMilkCrate, makeIvy,
  makeLaundryPole, makeAircon, makeLoosePaper, makeDoormat, makeCatBox, makePetBowl,
  makePotShelf, makeUmbrellaStand, makeCat, makeMirror,
} from './props.js';
import {
  makeKitchenGarden, makeDryingRack, makeGasMeter, makeWaterMeter, makeChalkMarks,
} from './streetprops.js';

/* ------------------------------------------------------------------ *
 * 桜守裏町 -- the back street behind the shrine.
 *
 * The smallest of the six blocks and the oldest thing in the new work.  Its
 * whole reason for existing is comparison: 二丁目 is render and steel and kerbs,
 * and this is timber, plaster and a gutter you step over, four hundred metres
 * away.  Neither reads as anything in particular on its own.
 *
 * It is also the piece that closes the last hole in the map.  湯の坂 comes down
 * fifteen steps onto a field and 四丁目's road head stops at a barrier, and
 * between them was thirty metres of nothing.  What goes in that gap is a lane
 * you would not find unless you were looking: it leaves the main road through a
 * 2.2 m slot beside the shrine's north wall, runs behind a screen of the onsen
 * street's trees, turns east at the top and comes out through a gap in the road
 * head's hedge.  Three ways in, none of them obvious from the others.
 *
 * ------------------------------------------------------------------ *
 * THE LAND, measured.  The parcel is x -18..1, z 48..72, flat at 0.45.  What is
 * already in it:
 *
 *   湯の坂's east wall     x -18.85..-18.35, z 40.60..47.60 and 50.20..59.60,
 *                          with the fifteen steps down to the field in the gap
 *   the wall passage       x -18.60..-11.70, z 47.40..47.80 and 50.00..50.40 --
 *                          a 2.2 m slot with a wall down each side, already
 *                          built by `onsen.js` and until now leading nowhere
 *   the onsen's tree line  four grove trees at (-15.2, 52.0), (-12.8, 55.4),
 *                          (-15.2, 58.8) and (-12.8, 62.2), scale 1.35-1.55.
 *                          These are `onsen.js`'s screen -- "deep green outside
 *                          the wall, so the shelf reads as cut out of a wood" --
 *                          and **not one of them moves**.  They are the west
 *                          side of this street, which is why it has buildings
 *                          down only one side.
 *   the main road          carriageway x -6.55..-0.25 with its west footway to
 *                          x -8.10, running to `Z_MAX = 52`
 *   四丁目's road head     the carriageway carried on to z 58.40, its footways,
 *                          the barrier at 58.08..58.28 and the closing hedge at
 *                          z 59.73..60.17 running x -8.25..1.45
 *   四丁目's west hedge    x 1.48..1.92, z 58.70..61.80 and 64.60..71.40
 *
 * ------------------------------------------------------------------ *
 * WHAT THE ARITHMETIC DECIDED
 *
 * **One side only.**  The lane runs at x = -10.3 because that is the one line
 * that clears both the tree screen (which reaches x -12.17) and the road's west
 * footway (which starts at x -8.10): 2.3 m of carriageway with 0.72 m of verge
 * on the east and 0.47 m on the west.  Everything east of it as far as the road
 * is 1.05 m of leftover, so the buildings go at the *top*, where the road has
 * already stopped and there is a whole field.
 *
 * **The hedge across the road head is split for a 1.8 m gap.**  Without it this
 * block hangs off one lane with a dead end at the top, and the road head has
 * nothing beyond the barrier but planting.  With it, the end of the main road
 * has a footpath going on out of it into an older street, which is the single
 * most Japanese thing in the whole world file.  Recorded in NEXT.md.
 *
 * **The 長屋 has no setback and that is the type.**  `makeNagaya`'s eave
 * overhangs 0.92 m and its step *is* the pavement; on a 2.3 m arm that puts the
 * roof over half the street, which is exactly what a 長屋 does and the reason
 * one is worth having.  Nothing else in this world is that close to you.
 *
 * FLOODFILL -- every one of these must be reachable on foot from the spawn:
 *   slotWest   [-17.4, 48.9]  in the wall passage, at the foot of 湯の坂's steps
 *   slotEast   [-12.0, 48.9]  its east end, where the lane starts
 *   roadMouth  [-8.8, 49.4]   the mouth on the main road's west footway
 *   jizo       [-11.4, 51.0]  the little roadside shrine at the corner
 *   laneMid    [-10.3, 56.0]  the lane, behind the tree screen
 *   laneTop    [-10.3, 62.6]  where it turns east
 *   arm        [-5.0, 64.8]   the arm, under the 長屋's eave
 *   nagayaDoor [-5.6, 65.9]   outside its middle two doors
 *   dryYard    [-15.4, 61.0]  the shared drying ground, west of the lane
 *   koyaStep   [-13.0, 65.9]  the 木造平屋's doorstep, at the arm's west end
 *   headGap    [-1.6, 61.4]   the gap in the road head's hedge
 *   headSide   [-1.6, 59.0]   the road head itself, through the gap
 * ------------------------------------------------------------------ */

const Y = 0.45;                         // flat over the whole parcel

/* the lane, its arm, and the link down to the road head */
const LN_X = -10.3;
const LN_W = 2.3;                       // x -11.45..-9.15
const LN_Z0 = 49.2;
const LN_Z1 = 63.4;
const AR_Z = 64.8;
const AR_W = 2.3;                       // z 63.65..65.95
const AR_X0 = -11.45;
const AR_X1 = 0.6;
const GAP_X = -1.6;                     // the gap in the road head's hedge
const HEDGE_Z = 59.95;                  // that hedge's centreline

/* the mouth on the main road: the slot between the wall passage's east end and
 * the road's west footway */
const MO_Z = 48.9;
const MO_W = 2.4;
const MO_X0 = -11.7;                    // where `onsen.js`'s walls stop
const MO_X1 = -8.2;

/* the two buildings */
/* **Not on the west strip, and this is the one number the block got wrong
 * first.**  The strip between 湯の坂's east wall (-18.35) and the lane (-11.45)
 * is 6.9 m, and a 3.6 m house with the 2.15 m yard it needs to face the lane
 * leaves 1.15 m -- less than one of the onsen street's trees.  The draft put it
 * there anyway and the tree at (-12.8, 55.4), whose collider is x -13.43..-12.17,
 * came down squarely in the yard: 0.14 m of walkable ground behind a 1.8 m gate,
 * which the flood fill found and no frame showed.  Moving the tree was the wrong
 * fix -- it is `onsen.js`'s screen and the whole west side of this street -- so
 * the house moved instead, to the one other place a small one fits: west of the
 * 長屋 on the north side of the arm, where the road has stopped and the land is
 * open.  It shares the 長屋's party line and addresses the same street. */
const KOYA = { x: -13.0, z: 68.2, w: 4.2, d: 3.0, face: 'z-' };   // x -15.1..-10.9, z 66.7..69.7
const NAGA = { x: -5.6, z: 68.6, units: 4, unitW: 2.6, d: 4.6, face: 'z-' }; // x -10.8..-0.4, z 66.3..70.9

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
  M.moss = cel({ color: 0x6e7a62, bands: 2, tint: 0x5b6f8c });
  return M;
}

export function buildUramachi(ctx) {
  const m = mats();
  const gm = groundMats();
  const rng = rngKit(8900);
  const sakura = [];
  const shrubs = [];
  const grove = [];
  const petals = [];

  buildStreets(ctx, m, gm);
  buildKoya(ctx, m, gm, shrubs);
  buildNagaya(ctx, m, gm, rng, shrubs, petals);
  buildBackLand(ctx, m, gm, shrubs);

  /* ---------------------------- poles and cabling ----------------------------
   * Two, both on the lane's east verge, and no lamp on either.  An old back
   * street is not lit by the ward: what light there is comes off the doors, and
   * on this one that is the 長屋's four porch bulbs.  A街灯 here would make it
   * read as maintained, which is the one thing it must not. */
  poleRun(ctx, {
    defs: [
      { x: -9.0, z: 53.2, y: Y, h: 7.6, seed: 8961, armDir: -1, ry: -Math.PI / 2 },
      { x: -9.0, z: 62.0, y: Y, h: 7.8, seed: 8962, armDir: -1, ry: -Math.PI / 2 },
      /* Not at (-1.4, 66.4).  That is 0.2 m off the centre line of the gap in
       * the road head's hedge, eight metres from it -- so standing at the
       * terminus and looking through the one opening in the hedge, the entire
       * view was a 0.34 m pole butt.  The gap exists to show the 長屋 through
       * it; anything on that axis defeats the only reason it is there.  A pole
       * goes on the verge, which is the same rule the 一丁目 lane keeps. */
      { x: -3.6, z: 63.0, y: Y, h: 7.6, seed: 8963, armDir: 1, ry: Math.PI },
    ],
    chains: [[0, 1], [1, 2]],
    drops: [[1, [-8.2, Y + 3.6, 65.4]], [2, [-4.4, Y + 3.2, 66.6]]],
    offsets: [[0, -0.4], [-0.38, 0.26]],
  });

  /* -------------------------------- planting --------------------------------
   * Nothing new on the west: `onsen.js`'s four trees are the screen and adding
   * to them would close the lane over.  One cherry over the 長屋's east gable,
   * which is what you see from the road head through the gap in the hedge, and
   * green mass filling the corner north of the arm so the block has a back. */
  sakura.push({ x: -0.6, z: 67.4, y: Y, scale: 1.18, seed: 8971, lean: 0.12, leanDir: 2.1 });
  sakura.push({ x: -16.4, z: 66.8, y: Y, scale: 1.06, seed: 8972, lean: 0.1, leanDir: 4.8 });
  grove.push({ x: -16.8, z: 70.6, y: Y, scale: 1.5, seed: 8973, spread: 1.15 });
  /* These two moved 4.6 m north with ひばり台七丁目.  They were at (-8.0, 73.4)
   * and (-2.0, 72.8), and a grove tree collides with a 1.4 m box: both stood in
   * the middle of the 3.6 m link lane that now runs east along z = 74.6 from the
   * supermarket to 四丁目's lane -- the only corridor north of the 長屋 there is.
   * Four metres further out they still close the corner behind the block, which
   * is the whole job they were doing. */
  grove.push({ x: -8.2, z: 78.0, y: Y, scale: 1.45, seed: 8974, spread: 1.1 });
  grove.push({ x: -2.4, z: 78.6, y: Y, scale: 1.55, seed: 8975, spread: 1.2 });
  shrubs.push({ x: -9.6, z: 70.6, y: Y, r: 0.46, count: 3, spread: 1.1, seed: 8976 });
  /* Slid 2.4 m north-west off (-16.6, 65.4).  ひばり台七丁目's 2.4 m footpath
   * runs east at z = 64.2 between `onsen.js`'s two screen trees, and a 1.2 m
   * spread of shrub was standing in the middle of it. */
  shrubs.push({ x: -17.6, z: 67.8, y: Y, r: 0.5, count: 3, spread: 1.2, seed: 8977 });

  petals.push({ x: LN_X, z: 57.0, w: 2.6, d: 12.0, y: Y + 0.07, n: 90 });
  petals.push({ x: -4.0, z: AR_Z - 0.6, w: 9.0, d: 2.2, y: Y + 0.07, n: 70 });

  return { sakura, shrubs, grove, petals };
}

/* ------------------------------------------------------------------ *
 * The lane, its arm, the mouth on the road and the gap in the hedge.
 * ------------------------------------------------------------------ */

function buildStreets(ctx, m, gm) {
  /* ------------------------------- the mouth -------------------------------
   * `onsen.js` built a 2.2 m slot between two walls from x -18.6 to -11.7 and
   * stopped, because at the time there was nothing east of it.  This is the
   * three and a half metres that take it out onto the road, and it is
   * deliberately the *same* surface -- worn concrete, no kerb, a channel down
   * one side -- so the two read as one passage rather than as a passage that
   * turns into something. */
  pad(ctx, {
    x: (MO_X0 + MO_X1) / 2, z: MO_Z, w: MO_X1 - MO_X0, d: MO_W, y: Y, h: 0.06,
    mat: gm.concreteMid, name: 'uramachiMouth',
  });
  bollardRow(ctx, { axis: 'z', at: MO_X1 - 0.35, from: MO_Z - 0.8, to: MO_Z + 0.8, n: 2, y: Y });
  /* The name plate on the road, facing the traffic, because a slot 2.4 m wide
   * between two walls is invisible from a carriageway otherwise -- and being
   * findable is the whole difference between a back street and a bug. */
  laneSign(ctx, {
    x: -8.6, z: 47.3, y: ctx.groundAt(-8.6, 47.3), variant: 4, h: 2.0, ry: -Math.PI / 2,
  });

  /* -------------------------------- the lane -------------------------------- */
  lane(ctx, {
    axis: 'z', at: LN_X, from: LN_Z0, to: LN_Z1, w: LN_W,
    mat: gm.concreteMid, kerb: false, rise: 0.05, name: 'uramachiLane',
  });
  /* The open channel down the west side, which on a street this old is not a
   * slotted cover but a U of concrete with a grating every few metres -- you
   * step over it to get to a door.  `laneGutter` draws exactly that. */
  laneGutter(ctx, {
    axis: 'z', at: LN_X - LN_W / 2 + 0.24, from: LN_Z0 + 0.6, to: LN_Z1 - 0.4, y: Y, pitch: 0.8,
    manholes: [52.6, 60.4], manholeOff: 0.55,
    patches: [[-9.7, 57.8, 1.1, 1.4]],
  });

  /* -------------------------------- the arm -------------------------------- */
  lane(ctx, {
    axis: 'x', at: AR_Z, from: AR_X0, to: AR_X1, w: AR_W, y: Y,
    mat: gm.concreteMid, kerb: false, rise: 0.05, name: 'uramachiArm',
  });
  // the corner, as one slab so the two surfaces do not leave a lip across it
  pad(ctx, {
    x: LN_X, z: AR_Z - 0.9, w: LN_W, d: AR_W + 1.8, y: Y, h: 0.11,
    mat: gm.concreteMid, name: 'uramachiCorner',
  });
  ctx.add(makeMirror({ x: -11.9, z: 63.6, y: Y + 0.09, ry: -0.7, h: 2.3, r: 0.4 }));

  /* ------------------------- the gap in the head's hedge -------------------------
   * `yonchome.js` runs a hedge across the whole width of the road head at
   * z 59.73..60.17 to close the view north.  It still does -- 7.9 m of the 9.7 m
   * of it -- but 1.8 m of it is now a way through, with a stone kerb at the
   * threshold and a post either side so the opening reads as deliberate.  A gap
   * in a boundary needs a reason to be a gap; this one's reason is on the other
   * side of it. */
  pad(ctx, {
    x: GAP_X, z: HEDGE_Z, w: 1.9, d: 2.4, y: Y, h: 0.07,
    mat: gm.stone, name: 'uramachiHedgeGap',
  });
  for (const s of [-1, 1]) {
    const px = GAP_X + s * 1.0;
    const post = box(0.16, 1.15, 0.16, m.stone, px, Y + 0.605, HEDGE_Z);
    post.castShadow = true;
    ctx.add(post);
    ctx.add(box(0.22, 0.05, 0.22, m.concrete, px, Y + 1.2, HEDGE_Z));
    ctx.collide(px - 0.1, HEDGE_Z - 0.1, px + 0.1, HEDGE_Z + 0.1, Y + 1.22);
  }
  /* and the path from it up to the arm: 1.8 m, unpaved apart from the stepping
   * stones, because this is a footpath through the back of somebody's plot and
   * not a street */
  pad(ctx, {
    x: GAP_X, z: 62.4, w: 1.8, d: 3.4, y: Y, h: 0.05,
    mat: gm.gravel, name: 'uramachiHeadPath',
  });
  stepStones(ctx, { from: [GAP_X, 61.0], to: [GAP_X, 63.6], y: Y + 0.05, n: 4, seed: 8911 });

  /* --------------------------------- the 祠 ---------------------------------
   * A 小祠 on the corner where the mouth meets the lane, with its bowl, its two
   * cups and a stone in front of it.  Every old back street in Japan has one and
   * this one is the block's name: 桜守 is the shrine four hundred metres south,
   * and this is its little outpost.  It is also the one warm thing on the whole
   * street, which is why it sits where the light gets in. */
  {
    const sx = -11.9, sz = 50.9;
    const base = box(1.0, 0.22, 0.9, m.stone, sx, Y + 0.11, sz);
    base.receiveShadow = base.castShadow = true;
    ctx.add(base);
    ctx.add(makeShrine({ ctx, x: sx, z: sz, y: Y + 0.22, ry: Math.PI / 2 }));
    ctx.add(makePlanter({ x: sx + 0.05, z: sz - 0.8, y: Y, r: 0.2, flower: true, seed: 8912, n: 5 }));
    ctx.add(makeBucket({ x: sx - 0.55, z: sz + 0.7, y: Y, ry: 0.6, water: true }));
    // the moss the north face of a stone base grows, and nothing else
    const moss = box(0.94, 0.06, 0.1, m.moss, sx, Y + 0.2, sz - 0.42);
    moss.userData.noOutline = true;
    ctx.add(moss);
  }
}

/* ------------------------------------------------------------------ *
 * 木造平屋 -- the one house on the street, at the west end of the arm.
 *
 * 4.2 x 3.0 and single storey, sharing a party line with the 長屋 and addressing
 * the same 2.3 m of concrete: the smallest detached house in the world, on the
 * smallest plot, which is what is left when a 長屋 was built across the rest of
 * the frontage forty years earlier.  Its 縁側 is on the west flank looking at
 * the drying ground, because that is the only side with anything to look at.
 * ------------------------------------------------------------------ */

function buildKoya(ctx, m, gm, shrubs) {
  const p = plotBox(KOYA);
  const h = makeTimberHouse({
    ...KOYA, y: Y, floors: 1, roofKind: 'gable', engawa: -1, plaster: false,
    eave: 0.62, seed: 8921, door: 0, nameVariant: 5, lit: true,
  });
  ctx.add(h);
  plotCollide(ctx, p, Y + (h.userData.top ?? 4.6));

  /* 0.75 m between the frontage and the arm, which is a doorstep rather than a
   * garden -- so it is swept concrete with the pots on it and nothing else.
   * The arm's walkable band is 1.62 m and everything here stays inside 0.45 m
   * of the wall: a prop standing in a two-metre passage is a hole in the
   * picture, which is the one thing 一丁目 records twice. */
  pad(ctx, {
    x: KOYA.x, z: p.z0 - 0.38, w: KOYA.w + 0.5, d: 0.8, y: Y, h: 0.07,
    mat: gm.concreteMid, name: 'uramachiKoyaStep',
  });
  const gA = (x, z) => ctx.groundAt(x, z);
  const doorAt = h.userData.doorAt ?? 0;
  const [dx, dz] = p.at(doorAt, p.halfD + 0.24);
  ctx.add(makeDoormat({ x: dx, z: dz, y: gA(dx, dz), ry: p.outRy }));
  const [ux, uz] = p.at(doorAt - 1.25, p.halfD + 0.32);
  ctx.add(makeUmbrellaStand({ x: ux, z: uz, y: gA(ux, uz), ry: p.outRy, seed: 8922 }));
  const [px, pz] = p.at(doorAt + 1.3, p.halfD + 0.4);
  ctx.add(makePotShelf({ x: px, z: pz, y: gA(px, pz), ry: p.outRy, seed: 8923, w: 0.9 }));
  const [gx, gz] = p.at(doorAt - 1.9, p.halfD + 0.16);
  ctx.add(makeGasMeter({ x: gx, z: gz, y: gA(gx, gz), ry: p.outRy }));
  const [wx, wz] = p.at(doorAt + 1.9, p.halfD + 0.14);
  ctx.add(makeWaterMeter({ x: wx, z: wz, y: gA(wx, wz), ry: p.outRy }));

  /* the west flank, which is the 縁側 side and looks over the drying ground --
   * `makeAircon`'s grille is on local +z, so `ry` is the wall's outward normal,
   * and the back of the casing sits at wall + (d/2 + standoff) so its bracket
   * arms actually reach the render */
  ctx.add(makeAircon({ x: p.x0 - 0.24, z: KOYA.z + 0.6, y: gA(p.x0 - 0.24, KOYA.z + 0.6), ry: -Math.PI / 2, w: 0.72, h: 0.52 }));
  ctx.add(makeBicycle({ x: p.x0 - 0.5, z: KOYA.z - 0.5, y: gA(p.x0 - 0.5, KOYA.z - 0.5), ry: Math.PI / 2, lean: 0.06, color: 0x6a5f70 }));
  ctx.add(makeCrates({ x: p.x0 - 0.55, z: p.z1 - 0.6, y: gA(p.x0 - 0.55, p.z1 - 0.6), n: 3, seed: 8925, ry: 0.2 }));
  ctx.add(makeMilkCrate({ x: p.x0 - 0.5, z: p.z1 + 0.4, y: gA(p.x0 - 0.5, p.z1 + 0.4), n: 2, ry: -0.35 }));
  ctx.add(makeIvy({ x: p.x0 - 0.04, z: KOYA.z - 0.9, y: Y, ry: -Math.PI / 2, len: 1.8, top: 1.6, drop: 0.85, seed: 8926 }));

  /* the back, which is a field: the pole, the tap and the vegetable box that go
   * with a house whose whole plot is 4 x 3 */
  ctx.add(makeLaundryPole({ ctx, x: KOYA.x - 0.4, z: p.z1 + 1.1, y: gA(KOYA.x - 0.4, p.z1 + 1.1), ry: Math.PI / 2, len: 2.2, n: 4, seed: 8928 }));
  ctx.add(makeKitchenGarden({ x: KOYA.x + 1.2, z: p.z1 + 1.0, y: gA(KOYA.x + 1.2, p.z1 + 1.0), ry: 0, w: 1.8, d: 1.0, seed: 8929 }));
  ctx.add(makeTapPost({ x: KOYA.x - 1.5, z: p.z1 + 0.3, y: gA(KOYA.x - 1.5, p.z1 + 0.3), ry: 0 }));
  shrubs.push({ x: p.x0 - 1.1, z: KOYA.z + 1.6, y: Y, r: 0.4, count: 3, spread: 0.95, seed: 8927 });
}

/* ------------------------------------------------------------------ *
 * 長屋 四戸 -- four units under one roof, doors straight onto the arm.
 *
 * The lowest thing with a frontage in the world and the only one with no
 * setback at all: the eave overhangs 0.92 m of a 2.3 m street, so walking the
 * arm you are under somebody's roof.  Its variety is per unit and material-free
 * -- same wall, same tile, same window, different door colour, different
 * clutter, one screen shut -- because varying the walls is what stops it being
 * a 長屋 and starts it being four houses that happen to touch.
 * ------------------------------------------------------------------ */

function buildNagaya(ctx, m, gm, rng, shrubs, petals) {
  const p = plotBox(NAGA);
  const g = makeNagaya({ ...NAGA, y: Y, seed: 8931, h: 2.44 });
  ctx.add(g);
  plotCollide(ctx, p, Y + (g.userData.top ?? 4.3));

  const gA = (x, z) => ctx.groundAt(x, z);
  /* The strip in front is the *street*, so everything below is against the wall
   * or against the party line between two units.  Nothing stands more than
   * 0.55 m out: the arm is 2.3 m and the walkable band after the player's own
   * radius on each side is 1.62 m, and a plant pot a metre into that is the
   * ichome mistake -- a prop on a two-metre path is a hole in the picture. */
  const OUT = 0.42;
  for (let i = 0; i < 4; i++) {
    const u = (i - 1.5) * NAGA.unitW;
    const [dx, dz] = p.at(u, p.halfD + 0.22);
    ctx.add(makeDoormat({ x: dx, z: dz, y: gA(dx, dz), ry: p.outRy }));
    // the party line between units, where the meters and the drainpipes go
    if (i < 3) {
      const [mx, mz] = p.at(u + NAGA.unitW / 2, p.halfD + 0.16);
      ctx.add(i % 2 === 0
        ? makeGasMeter({ x: mx, z: mz, y: gA(mx, mz), ry: p.outRy })
        : makeWaterMeter({ x: mx, z: mz, y: gA(mx, mz), ry: p.outRy }));
    }
  }
  /* and one thing each, all different, all within OUT of the wall */
  {
    const [x, z] = p.at(-4.2, p.halfD + OUT);
    ctx.add(makePlanter({ x, z, y: gA(x, z), r: 0.22, flower: true, seed: 8932, n: 5 }));
    const [x2, z2] = p.at(-3.2, p.halfD + OUT - 0.06);
    ctx.add(makeBucket({ x: x2, z: z2, y: gA(x2, z2), ry: 0.9 }));
  }
  {
    const [x, z] = p.at(-1.4, p.halfD + OUT);
    ctx.add(makeUmbrellaStand({ x, z, y: gA(x, z), ry: p.outRy, seed: 8933 }));
    const [x2, z2] = p.at(-0.5, p.halfD + OUT - 0.08);
    ctx.add(makeMilkCrate({ x: x2, z: z2, y: gA(x2, z2), n: 2, ry: p.outRy + 0.3 }));
  }
  {
    const [x, z] = p.at(1.5, p.halfD + OUT);
    ctx.add(makePotShelf({ x, z, y: gA(x, z), ry: p.outRy, seed: 8934, w: 0.9 }));
    const [x2, z2] = p.at(2.6, p.halfD + OUT - 0.1);
    ctx.add(makeCatBox({ x: x2, z: z2, y: gA(x2, z2), ry: p.outRy + 0.2 }));
    const [x3, z3] = p.at(3.2, p.halfD + OUT - 0.16);
    ctx.add(makePetBowl({ x: x3, z: z3, y: gA(x3, z3) }));
  }
  {
    const [x, z] = p.at(4.3, p.halfD + OUT - 0.04);
    ctx.add(makeCrates({ x, z, y: gA(x, z), n: 2, seed: 8935, ry: p.outRy - 0.15 }));
  }
  /* The cat, on the 長屋's own step.  There is one already, at the crossing; a
   * second one four hundred metres away on the oldest street in the world is
   * the right kind of repetition -- it is the same animal's territory. */
  {
    const [x, z] = p.at(0.6, p.halfD + 0.34);
    const c = makeCat({ x, z, y: gA(x, z), ry: p.outRy + 0.5 });
    ctx.add(c);
  }

  /* the backs: the whole of life that does not fit in a 2.6 m unit goes behind,
   * where there is a field */
  const bz = p.z1 + 0.9;
  ctx.add(makeLaundryPole({ ctx, x: NAGA.x - 3.4, z: bz, y: gA(NAGA.x - 3.4, bz), ry: 0, len: 2.6, n: 5, seed: 8936 }));
  ctx.add(makeDryingRack({ x: NAGA.x + 0.4, z: bz - 0.2, y: gA(NAGA.x + 0.4, bz - 0.2), ry: 0, n: 4, seed: 8937 }));
  ctx.add(makeKitchenGarden({ x: NAGA.x + 3.6, z: bz + 0.3, y: gA(NAGA.x + 3.6, bz + 0.3), ry: 0, w: 2.2, d: 1.1, seed: 8938 }));
  {
    const sh = makeStorageShed({ x: NAGA.x - 4.6, z: bz + 0.4, y: gA(NAGA.x - 4.6, bz + 0.4), ry: 0, w: 1.5, d: 0.9, h: 1.8 });
    ctx.add(sh);
    ctx.collide(NAGA.x - 5.35, bz - 0.05, NAGA.x - 3.85, bz + 0.85, Y + 1.85);
  }
  ctx.add(makeTapPost({ x: NAGA.x - 1.9, z: p.z1 + 0.32, y: gA(NAGA.x - 1.9, p.z1 + 0.32), ry: 0 }));
  ctx.add(makeAircon({ x: NAGA.x - 2.6, z: p.z1 + 0.24, y: gA(NAGA.x - 2.6, p.z1 + 0.24), ry: 0, w: 0.72, h: 0.52 }));
  ctx.add(makeAircon({ x: NAGA.x + 2.4, z: p.z1 + 0.24, y: gA(NAGA.x + 2.4, p.z1 + 0.24), ry: 0, w: 0.72, h: 0.52 }));
  ctx.add(makeBroom({ x: NAGA.x + 4.6, z: p.z1 + 0.3, y: gA(NAGA.x + 4.6, p.z1 + 0.3), tilt: -0.06, roll: 0.2, ry: 0.3 }));
  refusePoint(ctx, {
    kind: 'bins', x: -11.0, z: AR_Z - 1.6, y: gA(-11.0, AR_Z - 1.6), ry: Math.PI / 2, plate: 2,
  });
  ctx.add(makeIvy({ x: p.x1 - 0.04, z: NAGA.z + 0.4, y: Y, ry: Math.PI / 2, len: 2.8, top: 1.9, drop: 1.0, seed: 8939 }));
  shrubs.push({ x: p.x1 + 0.9, z: p.z1 - 1.0, y: Y, r: 0.42, count: 3, spread: 1.0, seed: 8940 });
  petals.push({ x: NAGA.x, z: p.z0 - 0.8, w: 10.0, d: 1.4, y: Y + 0.02, n: 55 });
}

/* ------------------------------------------------------------------ *
 * The back land west of the lane.
 *
 * Everything between the tree screen and the lane that is not the 木造平屋: the
 * shared drying ground, the standpipe, the stack of crates nobody moved.  It is
 * two and a half metres wide in places and it is the most useful ground in the
 * block, which is the truth about back streets and the reason the brief asked
 * for one.
 * ------------------------------------------------------------------ */

function buildBackLand(ctx, m, gm, shrubs) {
  const gA = (x, z) => ctx.groundAt(x, z);

  /* --------------------------- the drying ground --------------------------- *
   * North of the 木造平屋, between the tree at (-15.2, 58.8) and the corner.
   * Rolled gravel, three poles' worth of washing, a tap the four households
   * share and the crates that live under it. */
  pad(ctx, {
    x: -14.4, z: 61.4, w: 5.4, d: 5.0, y: Y, h: 0.05,
    mat: gm.gravel, name: 'uramachiDryYard',
  });
  ctx.add(makeLaundryPole({ ctx, x: -15.6, z: 60.4, y: Y + 0.05, ry: Math.PI / 2, len: 2.6, n: 5, seed: 8951 }));
  ctx.add(makeLaundryPole({ ctx, x: -15.6, z: 62.6, y: Y + 0.05, ry: Math.PI / 2, len: 2.4, n: 4, seed: 8952 }));
  ctx.add(makeDryingRack({ x: -13.4, z: 61.6, y: Y + 0.05, ry: -Math.PI / 2, n: 4, seed: 8953 }));
  ctx.add(makeTapPost({ x: -16.7, z: 59.9, y: Y + 0.05, ry: Math.PI / 2 }));
  ctx.add(makeBucket({ x: -16.3, z: 60.4, y: Y + 0.05, ry: 0.7, water: true }));
  ctx.add(makeBucket({ x: -16.5, z: 59.3, y: Y + 0.05, ry: -0.4 }));
  ctx.add(makeCrates({ x: -16.6, z: 62.8, y: Y + 0.05, n: 3, seed: 8954, ry: 0.15 }));
  ctx.add(makeMilkCrate({ x: -15.9, z: 63.6, y: Y + 0.05, ry: -0.5, n: 3 }));
  ctx.add(makeBroom({ x: -16.8, z: 61.6, y: Y + 0.05, tilt: -0.05, roll: 0.18, ry: 1.5 }));
  {
    const sh = makeStorageShed({ x: -16.7, z: 57.6, y: gA(-16.7, 57.6), ry: Math.PI / 2, w: 1.4, d: 0.8, h: 1.7 });
    ctx.add(sh);
    ctx.collide(-17.1, 56.9, -16.3, 58.3, Y + 1.74);
  }

  /* --------------------------- the lane's own edges --------------------------- *
   * The east verge is 0.72 m of nothing between the carriageway and the road's
   * footway, so it gets a low block wall and the things that go against one --
   * and being 0.72 m wide is exactly why nothing here is more than 0.3 m deep. */
  plotWall(ctx, {
    x0: -8.75, x1: -8.5, z0: 50.6, z1: 58.4, sides: ['x-'], kind: 'block',
    h: 0.5, fenceH: 0.42, y: Y, seed: 8955,
  });
  ctx.add(makeIvy({ x: -8.78, z: 54.6, y: Y, ry: -Math.PI / 2, len: 3.4, top: 0.9, drop: 0.6, seed: 8956 }));
  ctx.add(makeLoosePaper(ctx, [
    { x: -9.6, z: 52.4, y: Y + 0.07, ry: 0.7 },
    { x: -10.9, z: 59.8, y: Y + 0.07, ry: -1.1 },
  ]) ?? new THREE.Group());
  ctx.add(makeCatBox({ x: -9.0, z: 56.8, y: gA(-9.0, 56.8), ry: -Math.PI / 2 }));
  ctx.add(makePetBowl({ x: -9.05, z: 57.5, y: gA(-9.05, 57.5) }));
  ctx.add(makeCrates({ x: -8.95, z: 61.0, y: gA(-8.95, 61.0), n: 2, seed: 8957, ry: -0.2 }));
  ctx.add(makeBicycle({ x: -9.15, z: 51.9, y: gA(-9.15, 51.9), ry: Math.PI / 2, lean: 0.07, color: 0x8f6fb5 }));
  /* the chalk on the corner slab, which is the only mark anybody has left in
   * this block and is worth more than another prop */
  makeChalkMarks(ctx, [
    { x: -10.6, z: 63.2, y: Y + 0.12, ry: 0.4 },
    { x: -9.8, z: 64.4, y: Y + 0.12, ry: -0.3 },
  ]);
  shrubs.push({ x: -8.9, z: 59.4, y: Y, r: 0.38, count: 3, spread: 0.9, seed: 8958 });
}
