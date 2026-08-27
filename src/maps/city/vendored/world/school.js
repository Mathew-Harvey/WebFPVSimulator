import * as THREE from 'three';
import { PAL } from '../core/palette.js';
import { cel, flat } from '../core/toon.js';
import {
  schoolPlate, schoolEntrance, clubPoster, gateNotice, roadSignTex,
  classroomTex, curtainTex, gymInterior, warningPlate, chainLinkTex,
  schoolBlockPlate, specialRoomTex, trailNotice,
} from '../core/textures.js';
import { box, cyl, bake, trs, rngKit, shadowify } from '../core/util.js';
import { hullOutline } from '../core/outline.js';
import { groundY } from './street.js';
import { pad, laneLine, wallRun, meshFence, groundMats } from './ground.js';
import {
  makeBikeRack, makeNoticeBoard, makeSignPost, makeFlowerBed, makeBench,
  makeAircon, makeHoseBox, makeCrates, makeTapPost, makeBucket, makeBroom,
  makeMilkCrate, makeRecycleBox, makeVendBin, makeGuideBoard, makeDoormat,
  makeLoosePaper, makeStorageShed,
} from './props.js';
import { makeGomiHouse, makeWheelStops, makeBallBox } from './streetprops.js';

/* ------------------------------------------------------------------ *
 * 県立ひばり台高等学校 -- the high school on the rise behind the station.
 *
 * The site sits at the far end of the main street, where `groundY` has
 * already climbed its full 1.05 m, so the street itself is the 通学路: walk
 * north from the crossing and the road lifts you to the school gate.  That
 * is the whole reason the school is here and not somewhere flatter.
 *
 * Composition rules the layout obeys:
 *
 *  - The gate faces the street, and the 3-storey block faces the gate, so
 *    the approach is a single straight axis with sakura down both sides.
 *  - The block is a *shell*, not a solid box.  Its west facade is built as
 *    piers and spandrels with real holes, and the classroom interiors sit
 *    behind them -- modelling it as a solid volume with a glass decal is
 *    what makes school windows read as stickers.
 *  - Interiors are unlit `flat()` material knocked back toward violet.  A
 *    cel-shaded interior inside a shell is in the roof's shadow, and comes
 *    out muddy brown.
 *  - The block's top three metres (bell housing, roof railing, water tank)
 *    are the only part visible from the crossing 50 m away, so they carry
 *    the silhouette and get the most attention.
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
 * THE EXPANSION -- what doubled, and what did not.
 *
 * The site was x 10.6..56, z -41..-74: 45.4 x 33 = 1 498 m².  It is now
 * x 10.6..84, z -41..-86 -- **73.4 x 45 = 3 303 m², 2.2 times the old one** --
 * and the growth is all east and north, because those are the only two directions
 * with anything in them.  West is the 通学路 and its footway, and south is
 * 川端の道 and the drainage channel eight metres beyond it.
 *
 * What is deliberately unchanged: the gate at (10.6, -49.5), the three-storey
 * 本校舎 at x 24.5..34 / z -68..-46, and the 昇降口 projecting west from the middle
 * of it.  Those three are the whole approach sequence -- the street lifts you to
 * the gate, the gate faces the block, the block's entrance closes the axis -- and
 * every camera position in `CLAUDE.md` that mentions the school is one of them.
 * A doubling that moves the front door is a rebuild, not an expansion.
 *
 * What moved: **the gymnasium**, from x 37..54 / z -73.5..-63.5 to the site's new
 * north-east corner, 20 x 14 instead of 17 x 10.  It had to: it stood squarely in
 * the middle of the new site, between the second block and the ground, and there
 * is no arrangement of a 22 m teaching block, a 44 m ground and a courtyard that
 * works round a gym in the centre of the plot.  Moving it is what freed the land
 * for the 中庭, which is the thing the brief actually asked for.
 *
 * The order of the plan, west to east: the approach and its yards; the two
 * teaching blocks with the 渡り廊下 between them; the courtyard; the ground; the
 * gym.  Four zones, and nothing in the middle of anything else.
 * ------------------------------------------------------------------ */

/* site, in flat XZ */
const X_W = 10.6;          // west boundary wall, hard against the street pavement
const X_E = 84.0;          // east boundary  (was 56.0)
const Z_S = -41.0;         // south boundary (nearest the crossing)
const Z_N = -86.0;         // north boundary, against ひばり山's hill-foot road (was -74)
const GATE_Z = -49.5;      // centre of the 4 m gate opening
const BACK_GATE_X = 18.0;  // the 裏門: the way out to the hill
const SERV_GATE_X = 50.0;  // the 4.2 m vehicle gate, for the ground and the gym

const BLK = { x0: 24.5, x1: 34.0, z0: -68.0, z1: -46.0 };  // teaching block
const FLOORS = 3;
const FH = 3.5;
const H_BLK = FH * FLOORS;

/** 第二校舎 -- the special-classroom block, two floors, facing south. */
const BLK2 = { x0: 25.0, x1: 47.0, z0: -84.0, z1: -75.5 };
const FH2 = 3.5;
const H_BLK2 = FH2 * 2;
/** 管理棟 -- the single-storey annex on the main block's north end. */
const ANX = { x0: 24.5, x1: 34.0, z0: -72.0, z1: -68.0 };
/** the 渡り廊下 between them. */
const LINK = { x0: 27.0, x1: 30.0, z0: -75.5, z1: -72.0 };
/** the gymnasium and its equipment store. */
const GYM = { x0: 56.0, x1: 76.0, z0: -84.0, z1: -70.0 };
const STORE = { x0: 48.0, x1: 54.0, z0: -82.0, z1: -76.0 };
/** 校庭 -- the ground. */
const GND = { x0: 36.0, x1: 80.0, z0: -67.5, z1: -45.5 };
/** 中庭 -- the courtyard between the two blocks, the store and the ground. */
const YARD = { x0: 34.5, x1: 47.5, z0: -75.0, z1: -68.5 };

const M = {};
function mats() {
  if (M.wall) return M;
  M.wall = cel({ color: PAL.schoolWall, bands: 3, tint: 0x6f6790 });
  M.wallAlt = cel({ color: PAL.schoolWallAlt, bands: 3, tint: 0x6f6790 });
  M.wallBlue = cel({ color: PAL.schoolWallBlue, bands: 3, tint: 0x6a6288 });
  M.trim = cel({ color: PAL.schoolTrim, bands: 3, tint: 0x6a6288 });
  M.roof = cel({ color: PAL.schoolRoof, bands: 3, tint: 0x514b70 });
  M.gymWall = cel({ color: PAL.gymWall, bands: 3, tint: 0x6f6790 });
  M.gymRoof = cel({ color: PAL.gymRoof, bands: 3, tint: 0x4e4970 });
  M.metal = cel({ color: PAL.metal, bands: 3, tint: 0x666090 });
  M.metalDark = cel({ color: PAL.metalDark, bands: 3, tint: 0x5c5680 });
  M.concrete = cel({ color: PAL.concrete, bands: 3, tint: 0x6f6790 });
  M.concreteMid = cel({ color: PAL.concreteMid, bands: 3, tint: 0x6a6288 });
  M.glass = flat({ color: PAL.glass, transparent: true, opacity: 0.34, depthWrite: false, cache: false });
  M.glassFlat = flat({ color: PAL.glassDark });
  M.locker = cel({ color: PAL.locker, bands: 3, tint: 0x6a6288 });
  M.wood = cel({ color: 0x9c7f5e, bands: 3, tint: 0x5c5680 });
  M.bronze = cel({ color: 0x9a7a4a, bands: 3, tint: 0x6a5a80 });
  return M;
}

/** Interiors are unlit and knocked back, so they read as depth not decoration. */
const interiorMat = (variant) => flat({
  color: 0xa39cb2, map: classroomTex(variant), cache: false,
});

export function buildSchool(ctx) {
  const m = mats();
  const gm = groundMats();
  const rng = rngKit(5507);
  const Y = groundY(-50);       // the whole site is on the flat top of the slope
  const sakura = [];
  const shrubs = [];

  /* ---------------------------- ground surfaces ---------------------------- */
  // forecourt inside the gate, and the path that squeezes past the south end
  // of the block to reach the playground
  pad(ctx, { x: (X_W + BLK.x0) / 2, z: -51.0, w: BLK.x0 - X_W, d: 11.0, y: Y, mat: gm.concrete, name: 'schoolYardPaving' });
  /* The south path now runs the whole width of the site, from the forecourt to
   * the gym's apron, because the ground has grown east past where it used to
   * stop.  3.0 m: it is the route to everything, and at the old 3.4 it would
   * have overlapped the ground's new south edge. */
  pad(ctx, { x: (X_W + X_E) / 2, z: -43.1, w: X_E - X_W, d: 3.0, y: Y, mat: gm.concrete, name: 'schoolSidePath' });
  /* The path to the shed, and **the shed's own floor**, as two pads that abut
   * at z = -60.0 rather than one 7 m strip.
   *
   * The strip only reached x = 18.5 and the shed runs to 23.4, so half of the
   * twenty-five bicycles stood on the 0.07 m concrete and half on bare terrain
   * 0.085 m lower -- and every one of them was seated at `Y`, the site grade,
   * rather than on whatever it was actually standing on.  What that looks like
   * is two rows of bikes with the bottom of every wheel cut off by the ground.
   * The floor now covers the shed's own footprint and the racks read their seat
   * off `ctx.groundAt` like everything else in the world. */
  pad(ctx, { x: 15.0, z: -58.0, w: 7.0, d: 4.0, y: Y, mat: gm.concrete, name: 'schoolShedPath' });
  pad(ctx, { x: 17.75, z: -62.7, w: 12.5, d: 5.4, y: Y, mat: gm.concrete, name: 'schoolShedFloor' });
  // the ground itself: rolled clay, the one warm surface in the whole district,
  // and now 44 x 22 rather than 19.6 square -- 968 m² against 384
  pad(ctx, {
    x: (GND.x0 + GND.x1) / 2, z: (GND.z0 + GND.z1) / 2,
    w: GND.x1 - GND.x0, d: GND.z1 - GND.z0,
    y: Y, h: 0.06, mat: gm.clay, name: 'schoolGround',
  });
  // 中庭: the courtyard between the two blocks, the store and the ground
  pad(ctx, {
    x: (YARD.x0 + YARD.x1) / 2, z: (YARD.z0 + YARD.z1) / 2,
    w: YARD.x1 - YARD.x0, d: YARD.z1 - YARD.z0,
    y: Y, mat: gm.concrete, name: 'schoolCourtyard',
  });
  // the apron in front of the gym's doors, and the service drive to its north
  pad(ctx, { x: 66.0, z: -69.0, w: 22.0, d: 2.6, y: Y, mat: gm.concrete, name: 'gymApron' });
  pad(ctx, { x: 51.0, z: -71.5, w: 8.0, d: 6.0, y: Y, mat: gm.concrete, name: 'storeApron' });
  // the back yard behind the second block: 用務, the store, the switch room
  pad(ctx, { x: 17.2, z: -78.2, w: 12.6, d: 11.0, y: Y, mat: gm.asphaltWorn, name: 'schoolBackYard' });
  // and the strip that links it to the forecourt past the staff bays
  pad(ctx, { x: 17.2, z: -68.6, w: 12.6, d: 8.6, y: Y, mat: gm.asphaltWorn, name: 'schoolStaffPark' });

  /* Expansion joints.  Fourteen metres of unbroken pale concrete reads as a
   * hole in the picture; a grid of joints gives the paving a scale. */
  {
    const joints = [];
    for (let z = -46.0; z > -57.0; z -= 2.6) {
      joints.push({ geometry: new THREE.BoxGeometry(BLK.x0 - X_W - 0.4, 0.02, 0.07), matrix: trs((X_W + BLK.x0) / 2, 0, z) });
    }
    for (const x of [15.2, 19.8]) {
      joints.push({ geometry: new THREE.BoxGeometry(0.07, 0.02, 10.6), matrix: trs(x, 0, -51.0) });
    }
    const jm = new THREE.Mesh(bake(joints), gm.concreteMid);
    jm.position.y = Y + 0.075;
    jm.userData.noOutline = true;
    ctx.add(jm);
  }

  /* ------------------------------- boundary -------------------------------
   * Five sides became seven runs, because the north wall now has two openings in
   * it: the 裏門 at x = 18 that lets the school out onto ひばり山's trail, and the
   * 4.2 m service gate at x = 50 that a lorry uses to reach the ground and the
   * gym.  Both are real gaps in the wall *and* in the mesh above it -- a wall with
   * a gate drawn on it is a wall. */
  {
    const WH = 1.3;          // block wall, with mesh above it
    const runs = [
      { axis: 'z', at: X_W, from: Z_N, to: GATE_Z - 2.8 },
      { axis: 'z', at: X_W, from: GATE_Z + 3.4, to: Z_S },
      { axis: 'x', at: Z_S, from: X_W, to: X_E },
      { axis: 'z', at: X_E, from: Z_N, to: Z_S },
      { axis: 'x', at: Z_N, from: X_W, to: BACK_GATE_X - 1.4 },
      { axis: 'x', at: Z_N, from: BACK_GATE_X + 1.4, to: SERV_GATE_X - 2.1 },
      { axis: 'x', at: Z_N, from: SERV_GATE_X + 2.1, to: X_E },
    ];
    for (const r of runs) {
      wallRun(ctx, { ...r, y: Y, h: WH, t: 0.26, panel: 4.2, name: 'schoolWall' });
      meshFence(ctx, { ...r, y: Y + WH + 0.1, h: 1.0, spacing: 2.1, meshColor: 0xa8bcae });
    }
  }

  /* --------------------------------- gate --------------------------------- */
  {
    const PH = 2.55;
    /* The opening is 5.6 m wide and the sliding leaf covers 3.2 of it.  The
     * pedestrian side has to be a genuine 2 m or the player is squeezing through
     * seventy centimetres of clear space to get into the district. */
    for (const [zp, plate] of [[GATE_Z - 2.5, true], [GATE_Z + 3.1, false]]) {
      const p = box(0.62, PH, 0.62, m.concrete, X_W, Y + PH / 2, zp);
      p.castShadow = p.receiveShadow = true;
      ctx.add(p);
      hullOutline(p, { thickness: 0.0034 });
      ctx.add(box(0.76, 0.12, 0.76, m.concreteMid, X_W, Y + PH + 0.06, zp));
      ctx.collide(X_W - 0.4, zp - 0.4, X_W + 0.4, zp + 0.4, Y + PH);
      // the stone name plate, on the pillar you meet first walking up the hill
      if (plate) {
        const nb = new THREE.Mesh(
          new THREE.BoxGeometry(0.06, 1.5, 0.4),
          [flat({ color: 0xffffff, map: schoolPlate(), cache: false }),
           flat({ color: PAL.wallGray }), flat({ color: PAL.wallGray }),
           flat({ color: PAL.wallGray }), flat({ color: PAL.wallGray }), flat({ color: PAL.wallGray })]
        );
        nb.position.set(X_W - 0.34, Y + 1.5, zp);
        nb.castShadow = true;
        ctx.add(nb);
        hullOutline(nb, { thickness: 0.003 });
      }
    }

    /* The main sliding gate is shut, and it should be: nothing else says "term
     * time, out of hours" as economically as a closed gate under a notice board
     * full of club recruitment.
     *
     * But a shut gate across the whole opening also shuts the player out of a
     * district, so the opening is five metres wide and the leaf only covers
     * three of them -- the rest is the pedestrian side gate, standing open,
     * which is exactly how these work.  You go in the way everybody goes in. */
    const GW = 3.2, GH = 1.85;
    const GATE_C = GATE_Z - 0.9;
    const parts = [];
    parts.push({ geometry: new THREE.BoxGeometry(0.07, 0.09, GW), matrix: trs(0, GH - 0.05, 0) });
    parts.push({ geometry: new THREE.BoxGeometry(0.07, 0.09, GW), matrix: trs(0, 0.12, 0) });
    parts.push({ geometry: new THREE.BoxGeometry(0.07, GH, 0.1), matrix: trs(0, GH / 2, -GW / 2 + 0.05) });
    parts.push({ geometry: new THREE.BoxGeometry(0.07, GH, 0.1), matrix: trs(0, GH / 2, GW / 2 - 0.05) });
    const nb = Math.round(GW / 0.2);
    for (let i = 1; i < nb; i++) {
      parts.push({
        geometry: new THREE.BoxGeometry(0.05, GH - 0.2, 0.05),
        matrix: trs(0, GH / 2, -GW / 2 + (GW / nb) * i),
      });
    }
    // the diagonal brace every sliding gate has
    parts.push({ geometry: new THREE.BoxGeometry(0.05, 0.06, GW * 0.96), matrix: trs(0, GH / 2, 0, 0.44, 0, 0) });
    const gate = new THREE.Mesh(bake(parts), m.metal);
    gate.position.set(X_W, Y, GATE_C);
    gate.castShadow = true;
    ctx.add(gate);
    hullOutline(gate, { thickness: 0.003 });
    ctx.collide(X_W - 0.15, GATE_C - GW / 2, X_W + 0.15, GATE_C + GW / 2, Y + GH);
    // guide rail in the ground, running the whole opening
    ctx.add(box(0.18, 0.05, 6.0, gm.metalDark, X_W, Y + 0.03, GATE_Z + 0.3));

    /* the side gate, swung back flat against the wall inside */
    {
      const SW = 1.5, SH2 = 1.7;
      const leaf = [];
      leaf.push({ geometry: new THREE.BoxGeometry(SW, 0.07, 0.08), matrix: trs(SW / 2, SH2 - 0.04, 0) });
      leaf.push({ geometry: new THREE.BoxGeometry(SW, 0.07, 0.08), matrix: trs(SW / 2, 0.1, 0) });
      leaf.push({ geometry: new THREE.BoxGeometry(0.07, SH2, 0.09), matrix: trs(0.04, SH2 / 2, 0) });
      leaf.push({ geometry: new THREE.BoxGeometry(0.07, SH2, 0.09), matrix: trs(SW - 0.04, SH2 / 2, 0) });
      const nb2 = Math.round(SW / 0.19);
      for (let i = 1; i < nb2; i++) {
        leaf.push({ geometry: new THREE.BoxGeometry(0.045, SH2 - 0.2, 0.045), matrix: trs((SW / nb2) * i, SH2 / 2, 0) });
      }
      const side = new THREE.Mesh(bake(leaf), m.metal);
      side.position.set(X_W + 0.1, Y, GATE_Z + 3.05);
      side.rotation.y = -1.45;          // pushed open, almost flat to the wall
      side.castShadow = true;
      ctx.add(side);
      hullOutline(side, { thickness: 0.003 });
    }

    // approach paving out to the street pavement, and the signs on it
    pad(ctx, { x: 8.9, z: GATE_Z, w: 3.6, d: 7.2, y: Y, mat: gm.concrete, name: 'gateApron' });
    ctx.add(makeSignPost({
      x: 8.4, z: GATE_Z + 4.6, y: Y, ry: -Math.PI / 2, h: 2.5,
      plates: [
        { map: roadSignTex('tsugakuro'), w: 0.62, h: 0.62, y: 2.1, double: true },
        { map: roadSignTex('slow'), w: 0.5, h: 0.5, y: 1.4, double: true },
      ],
    }));
    ctx.collide(8.2, GATE_Z + 4.4, 8.6, GATE_Z + 4.8, Y + 2.5);

    ctx.add(makeNoticeBoard({ ctx,
      x: X_W - 0.42, z: GATE_Z + 6.4, y: Y, ry: -Math.PI / 2, w: 2.3, h: 1.3, y0: 0.9,
      sheets: [
        { map: clubPoster(0), x: -0.72, y: 0.06, w: 0.44, h: 0.6, tilt: 0.02 },
        { map: clubPoster(3), x: -0.22, y: -0.02, w: 0.44, h: 0.6, tilt: -0.015 },
        { map: clubPoster(1), x: 0.28, y: 0.05, w: 0.44, h: 0.6, tilt: 0.01 },
        { map: gateNotice(), x: 0.78, y: -0.04, w: 0.4, h: 0.54, tilt: -0.02 },
      ],
    }));

    // a second board just inside, angled to the approach
    ctx.add(makeNoticeBoard({ ctx,
      x: 13.4, z: GATE_Z - 4.6, y: Y, ry: -Math.PI / 2 + 0.4, w: 1.9, h: 1.15, y0: 0.85,
      sheets: [
        { map: clubPoster(2), x: -0.5, y: 0.02, w: 0.42, h: 0.56, tilt: 0.02 },
        { map: clubPoster(4), x: 0.02, y: -0.03, w: 0.42, h: 0.56, tilt: -0.02 },
        { map: clubPoster(5), x: 0.54, y: 0.04, w: 0.42, h: 0.56, tilt: 0.01 },
      ],
    }));
  }

  /* ---------------------------- teaching blocks ---------------------------- */
  buildTeachingBlock(ctx, Y);
  buildEntrancePorch(ctx, Y);
  buildSecondBlock(ctx, Y);
  buildAnnex(ctx, Y);
  buildLink(ctx, Y);

  /* --------------------------- gymnasium and store --------------------------- */
  buildGym(ctx, Y);
  buildStore(ctx, Y);

  /* ------------------------------- the ground ------------------------------- */
  buildPlayground(ctx, Y, rng);

  /* --------------------------- 中庭 and the back yard --------------------------- */
  buildCourtyard(ctx, Y, rng, sakura, shrubs);
  buildBackYard(ctx, Y, rng, shrubs);

  /* ------------------------------- bike shed ------------------------------- */
  buildBikeShed(ctx, Y, rng);

  /* ------------------------- planting and clutter ------------------------- */
  {
    /* Flower beds down the forecourt, the club's watering-rota duty.
     *
     * **The first one is against the north wall, not on the gate's axis.**  It
     * was at (12.8, -48.5), 1.5 x 5.0 -- and the gate's clear opening is
     * z -51.6..-46.8, so five metres of raised timber bed stood squarely in the
     * doorway, 1.3 m inside it, with the whole school walking round it every
     * morning.  (14.2, -44.0) puts it a metre clear of the opening, a metre off
     * the north wall, and between the two poles at x 12.4 and 15.5, which is the
     * only 1.4 m of that wall it fits against. */
    ctx.add(makeFlowerBed({ x: 14.2, z: -44.0, w: 1.4, d: 3.6, y: Y, seed: 71 }));
    ctx.add(makeFlowerBed({ x: 11.9, z: -55.0, w: 1.5, d: 4.2, y: Y, seed: 72 }));
    ctx.add(makeFlowerBed({ x: 22.9, z: -55.6, w: 1.3, d: 4.6, y: Y, seed: 73 }));
    // a bench under the trees, and the hose box on the block wall
    ctx.add(makeBench({ x: 14.6, z: -53.4, y: Y, ry: Math.PI / 2, len: 1.8 }));
    ctx.add(makeHoseBox({ x: X_W + 0.2, z: -57.6, y: Y + 0.75, ry: 0 }));
    // crates of something by the shed
    ctx.add(makeCrates({ x: 22.2, z: -61.4, y: Y, n: 3, seed: 74, ry: 0.2 }));
  }

  /* ---------------------------- sakura and shrubs ----------------------------
   * Handed back rather than built: `buildSakura` merges every tree in the
   * world into one wood mesh and three instanced canopies, so the district
   * builders contribute spots and the assembly does one pass. */
  /* The approach is deliberately left open on the gate axis (z = -49.5).  A
   * continuous tunnel of blossom looks wonderful from the street and hides
   * the whole school the moment you step through the gate, so the west row
   * hugs the wall and skips the two bays either side of the opening. */
  [-44.4, -54.0, -58.0, -62.0].forEach((z, i) => {
    sakura.push({
      x: 12.4, z, y: Y, scale: 1.14 + (i % 2) * 0.1, seed: 620 + i, lean: 0.12, leanDir: 1.2,
      keep: i === 0,
    });
  });
  // hard against the south wall, not in the path that squeezes past the block's
  // south end -- that path is the only way through to the playground
  sakura.push({ x: 21.6, z: -41.7, y: Y, scale: 1.1, seed: 631, lean: 0.13, leanDir: 4.3 });
  sakura.push({ x: 21.9, z: -55.6, y: Y, scale: 1.06, seed: 632, lean: 0.11, leanDir: 4.6 });
  sakura.push({ x: 16.6, z: -60.8, y: Y, scale: 1.18, seed: 633, lean: 0.08, leanDir: 2.4 });
  /* Along the south wall, so the school shows over it from the street.  Hard
   * against the wall at z = -41.8, not out at -43.4: the path that squeezes past
   * the block's south end is the only route through to the playground, and a row
   * of trunks down the middle of it closed the whole east half of the site off.
   * **Nine now rather than six**, because the wall is 73 m long instead of 45. */
  for (let i = 0; i < 9; i++) {
    sakura.push({ x: 15.5 + i * 7.4, z: Z_S - 0.8, y: Y, scale: 1.06 + (i % 3) * 0.09, seed: 640 + i, lean: 0.08, leanDir: 3.0 });
  }
  sakura.push({ x: 37.4, z: -41.6, y: Y, scale: 1.2, seed: 651, lean: 0.1, leanDir: 2.2 });

  /* **Five cherries came out of the ground.**  They stood at (54, -46.4),
   * (54.2, -58.6), (35.4, -66.2), (13.2, -70.4) and (24.6, -71.6), which were all
   * outside the old 19.6 m square and are now, in order: the middle of the
   * pitch, the middle of the pitch again, the 2 m passage between the block and
   * the ground, the staff car park, and inside the 管理棟.  Two of them are
   * replanted in the 中庭's tree pits, where a cherry in paving belongs; the rest
   * of the work they were doing -- giving the ground something green to look at --
   * is now done by ひばり山 behind the north wall, which is rather better at it.
   * Nothing is planted *on* a school ground, and nothing was, once it was big
   * enough for the trees to be in the way. */

  for (let i = 0; i < 6; i++) {
    shrubs.push({
      x: 12.2 + (i % 2) * 10.9, z: -45.4 - i * 3.1, y: Y,
      r: 0.5, count: 3, spread: 1.1, seed: 660 + i,
    });
  }
  shrubs.push({ x: 34.9, z: -42.2, y: Y, r: 0.55, count: 4, spread: 1.4, seed: 671 });
  shrubs.push({ x: 82.4, z: -47.0, y: Y, r: 0.5, count: 4, spread: 1.6, seed: 672 });
  shrubs.push({ x: 82.4, z: -60.0, y: Y, r: 0.5, count: 4, spread: 1.6, seed: 673 });
  shrubs.push({ x: 78.0, z: -85.0, y: Y, r: 0.52, count: 4, spread: 1.7, seed: 674 });

  /* A dark stand outside the east wall.
   *
   * It used to start 2.6 m past the wall, which was fine when the wall was at
   * x = 56 and there was nothing beyond it.  The wall is at 84 now and the
   * hill-foot road's east leg runs at x 86..90, so the stand moves out past the
   * road -- eight metres rather than two and a half -- and what it screens is the
   * road rather than the field.  Its other job has not changed: a wall of deep
   * green is what makes the pale school walls read as pale.
   */
  const grove = [];
  for (let i = 0; i < 8; i++) {
    grove.push({
      x: X_E + 8.0 + (i % 3) * 3.4, z: -44.0 - i * 4.2, y: Y,
      scale: 1.25 + (i % 4) * 0.16, seed: 680 + i,
      lean: 0.05, leanDir: 1.0 + i * 0.7, spread: 1.05,
    });
  }
  /* The three that stood behind the old north wall are gone.  At Z_N - 3.2 they
   * would now be standing in the hill-foot road, and the thing they were there
   * for -- mass behind the school -- is a 17 m wooded hill forty metres further
   * on, which no longer needs help from three trees. */

  return { sakura, shrubs, grove, gateZ: GATE_Z, xWest: X_W, y: Y };
}

/* ------------------------------------------------------------------ *
 * The three-storey block.
 * ------------------------------------------------------------------ */

function buildTeachingBlock(ctx, Y) {
  const m = mats();
  const rng = rngKit(9021);
  const g = new THREE.Group();
  g.name = 'teachingBlock';
  ctx.add(g);

  const D = BLK.x1 - BLK.x0;          // 9.5 m, west to east
  const L = BLK.z1 - BLK.z0;          // 22 m along the street
  const cx = (BLK.x0 + BLK.x1) / 2;
  const cz = (BLK.z0 + BLK.z1) / 2;
  const T = 0.3;                       // wall thickness

  const parts = { wall: [], alt: [], blue: [], trim: [], roof: [], metal: [] };
  const push = (k, geo, mx) => parts[k].push({ geometry: geo, matrix: mx });

  /* plinth */
  const plinth = box(D + 0.4, 0.5, L + 0.4, m.concreteMid, cx, Y + 0.25, cz);
  plinth.receiveShadow = plinth.castShadow = true;
  g.add(plinth);

  /* --- shell: end walls, corridor wall, floor slabs, roof --- */
  for (const s of [-1, 1]) {
    push('wall', new THREE.BoxGeometry(D, H_BLK, T), trs(cx, Y + H_BLK / 2, cz + s * (L / 2 - T / 2)));
  }
  push('alt', new THREE.BoxGeometry(T, H_BLK, L - T * 2), trs(BLK.x1 - T / 2, Y + H_BLK / 2, cz));
  for (let k = 0; k <= FLOORS; k++) {
    const y = Y + k * FH;
    push('trim', new THREE.BoxGeometry(D - T, 0.26, L - T * 2), trs(cx, y + 0.13, cz));
  }
  // string course reading round the outside at every floor line
  for (let k = 1; k < FLOORS; k++) {
    push('trim', new THREE.BoxGeometry(D + 0.16, 0.16, L + 0.16), trs(cx, Y + k * FH, cz));
  }
  // roof slab and parapet
  push('roof', new THREE.BoxGeometry(D + 0.5, 0.3, L + 0.5), trs(cx, Y + H_BLK + 0.15, cz));
  for (const s of [-1, 1]) {
    push('roof', new THREE.BoxGeometry(D + 0.5, 0.46, 0.18), trs(cx, Y + H_BLK + 0.53, cz + s * (L / 2 + 0.16)));
    push('roof', new THREE.BoxGeometry(0.18, 0.46, L + 0.5), trs(cx + s * (D / 2 + 0.16), Y + H_BLK + 0.53, cz));
  }

  /* --- west facade: piers, spandrels and real openings --- */
  const BAYS = 9;
  const pitch = (L - 0.5) / BAYS;      // 2.39 m bay
  const PIER = 0.44;
  const openW = pitch - PIER;          // 1.95 m of glass per bay
  const winY0 = 1.0;                   // sill above each floor
  const winH = 1.62;
  const xw = BLK.x0;

  for (let k = 0; k < FLOORS; k++) {
    const y = Y + k * FH;
    // continuous spandrel below the window band, in the cooler wall tone
    push('blue', new THREE.BoxGeometry(T, winY0 - 0.13, L), trs(xw + T / 2, y + 0.13 + (winY0 - 0.13) / 2, cz));
    // and above it, up to the next floor
    push('wall', new THREE.BoxGeometry(T, FH - winY0 - winH, L), trs(xw + T / 2, y + winY0 + winH + (FH - winY0 - winH) / 2, cz));
    // piers on the bay boundaries; the end walls close the last slivers
    for (let i = 0; i <= BAYS; i++) {
      push('wall', new THREE.BoxGeometry(T, winH, PIER),
        trs(xw + T / 2, y + winY0 + winH / 2, BLK.z0 + 0.25 + i * pitch));
    }
  }

  const facade = { frame: [] };
  for (let k = 0; k < FLOORS; k++) {
    const y = Y + k * FH;
    for (let i = 0; i < BAYS; i++) {
      const bz = BLK.z0 + 0.25 + pitch * (i + 0.5);
      const yc = y + winY0 + winH / 2;

      // interior, set back inside the shell so the glass has real depth
      const variant = (i + k) % 3 === 2 ? 1 : (i * 2 + k) % 3;
      const inner = new THREE.Mesh(new THREE.PlaneGeometry(openW + 0.4, winH + 0.5), interiorMat(variant));
      inner.position.set(xw + 1.15, yc, bz);
      inner.rotation.y = -Math.PI / 2;
      inner.userData.noOutline = true;
      g.add(inner);

      // glass
      const pane = box(0.05, winH, openW, m.glass, xw - 0.01, yc, bz);
      pane.userData.noOutline = true;
      pane.userData.noShadow = true;
      g.add(pane);
      // sliding-sash frame: head, sill and a centre mullion
      facade.frame.push({ geometry: new THREE.BoxGeometry(0.12, 0.09, openW + 0.1), matrix: trs(xw - 0.01, yc + winH / 2, bz) });
      facade.frame.push({ geometry: new THREE.BoxGeometry(0.16, 0.1, openW + 0.16), matrix: trs(xw + 0.01, yc - winH / 2 - 0.04, bz) });
      facade.frame.push({ geometry: new THREE.BoxGeometry(0.09, winH, 0.08), matrix: trs(xw - 0.03, yc, bz) });

      // curtains, half drawn on about a third of the bays
      if (rng.chance(0.42)) {
        const s = rng.sign();
        const cw = openW * rng.range(0.3, 0.5);
        const cur = new THREE.Mesh(
          new THREE.PlaneGeometry(cw, winH - 0.06),
          flat({ color: 0xe6dfd0, map: curtainTex(k % 2), cache: false })
        );
        cur.position.set(xw + 0.12, yc, bz + s * (openW / 2 - cw / 2));
        cur.rotation.y = -Math.PI / 2;
        cur.userData.noOutline = true;
        g.add(cur);
      }
      // one flat highlight per pane, angled, the way glass is painted
      if ((i + k) % 2 === 0) {
        const hi = new THREE.Mesh(
          new THREE.PlaneGeometry(openW * 0.3, winH * 1.02),
          flat({ color: 0xf2f8ff, transparent: true, opacity: 0.16, depthWrite: false, cache: false })
        );
        hi.position.set(xw - 0.06, yc, bz - openW * 0.22);
        hi.rotation.set(0, -Math.PI / 2, 0.34);
        hi.userData.noOutline = true;
        g.add(hi);
      }
    }
  }

  /* --- east side: the corridor, one ribbon window per floor --- */
  for (let k = 0; k < FLOORS; k++) {
    const yc = Y + k * FH + 1.4 + 0.7;
    const inner = new THREE.Mesh(new THREE.PlaneGeometry(L - 1.6, 1.9), interiorMat(2));
    inner.position.set(BLK.x1 - 1.1, yc, cz);
    inner.rotation.y = Math.PI / 2;
    inner.userData.noOutline = true;
    g.add(inner);
    const pane = box(0.05, 1.4, L - 1.6, m.glass, BLK.x1 + 0.02, yc, cz);
    pane.userData.noOutline = true;
    pane.userData.noShadow = true;
    g.add(pane);
    const nm = Math.round((L - 1.6) / 1.55);
    for (let i = 0; i <= nm; i++) {
      facade.frame.push({
        geometry: new THREE.BoxGeometry(0.1, 1.5, 0.08),
        matrix: trs(BLK.x1 + 0.02, yc, cz - (L - 1.6) / 2 + ((L - 1.6) / nm) * i),
      });
    }
    facade.frame.push({ geometry: new THREE.BoxGeometry(0.14, 0.09, L - 1.5), matrix: trs(BLK.x1 + 0.02, yc + 0.74, cz) });
    facade.frame.push({ geometry: new THREE.BoxGeometry(0.18, 0.1, L - 1.5), matrix: trs(BLK.x1, yc - 0.76, cz) });
  }

  /* --- services on the corridor side, where they belong --- */
  for (let k = 0; k < FLOORS; k++) {
    for (const dz of [-7.4, 0.6, 7.9]) {
      push('metal', new THREE.CylinderGeometry(0.07, 0.07, FH, 6), trs(BLK.x1 + 0.2, Y + k * FH + FH / 2, cz + dz));
    }
  }
  for (const dz of [-8.4, -1.2, 6.4]) {
    ctx.add(makeAircon({ x: BLK.x1 + 0.24, z: cz + dz, y: Y + 0.5, ry: Math.PI / 2, w: 0.9, h: 0.62 }));
  }

  /* --- merge, outline, collide --- */
  const matFor = {
    wall: m.wall, alt: m.wallAlt, blue: m.wallBlue, trim: m.trim,
    roof: m.roof, metal: m.metal, metalDark: m.metalDark,
  };
  for (const key of Object.keys(parts)) {
    if (!parts[key].length) continue;
    const mesh = new THREE.Mesh(bake(parts[key]), matFor[key]);
    mesh.castShadow = mesh.receiveShadow = true;
    g.add(mesh);
    if (key === 'wall' || key === 'roof' || key === 'alt') hullOutline(mesh, { thickness: 0.003 });
  }
  const fm = new THREE.Mesh(bake(facade.frame), m.metal);
  fm.castShadow = true;
  g.add(fm);

  ctx.collide(BLK.x0 - 0.15, BLK.z0 - 0.2, BLK.x1 + 0.7, BLK.z1 + 0.2, Y + H_BLK);

  /* ------------------------------ roof furniture ------------------------------
   * From the crossing this is all you see of the school, so it is where the
   * silhouette is made: railing, water tank, vent stacks and the bell. */
  const roofY = Y + H_BLK + 0.3;
  for (const r of [
    { axis: 'z', at: BLK.x0 + 0.1, from: BLK.z0, to: BLK.z1 },
    { axis: 'z', at: BLK.x1 - 0.1, from: BLK.z0, to: BLK.z1 },
    { axis: 'x', at: BLK.z0 + 0.15, from: BLK.x0, to: BLK.x1 },
    { axis: 'x', at: BLK.z1 - 0.15, from: BLK.x0, to: BLK.x1 },
  ]) {
    meshFence(ctx, { ...r, y: roofY + 0.46, h: 1.25, spacing: 2.0, meshColor: 0xb4bcc8 });
  }
  // water tank on legs
  {
    const tx = cx + 1.6, tz = BLK.z0 + 4.4;
    const tankG = new THREE.Group();
    tankG.name = 'openFrame';
    const legs = [];
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        legs.push({ geometry: new THREE.BoxGeometry(0.14, 1.2, 0.14), matrix: trs(tx + sx * 1.1, roofY + 0.6, tz + sz * 0.9) });
      }
    }
    const lm = new THREE.Mesh(bake(legs), m.metalDark);
    lm.castShadow = true;
    tankG.add(lm);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const px = tx + sx * 1.1, pz = tz + sz * 0.9;
        ctx.collide(px - 0.1, pz - 0.1, px + 0.1, pz + 0.1, roofY + 1.2, roofY, true);
      }
    }
    const tank = box(2.8, 1.5, 2.4, cel({ color: 0xdcdce4, bands: 3, tint: 0x6a6288 }), tx, roofY + 1.95, tz);
    tank.castShadow = tank.receiveShadow = true;
    tankG.add(tank);
    hullOutline(tank, { thickness: 0.0032 });
    tankG.add(box(2.9, 0.1, 2.5, m.metal, tx, roofY + 2.75, tz));
    tankG.add(cyl(0.12, 0.12, 1.9, 6, m.metal, tx - 1.5, roofY + 0.95, tz + 1.3));
    ctx.add(tankG);
    /* The tank is solid. The air under it is not: a box from the
     * teaching-block floor through this footprint is a wall between
     * the legs. skipFit so the building fit cannot own it. */
    ctx.collide(tx - 1.45, tz - 1.25, tx + 1.45, tz + 1.25, roofY + 2.82, roofY + 1.2, true);
  }
  // vent stacks
  for (const dz of [-2.0, 5.6, 8.6]) {
    ctx.add(cyl(0.16, 0.16, 0.8, 8, m.metal, cx - 2.4, roofY + 0.4, cz + dz));
    ctx.add(cyl(0.26, 0.2, 0.16, 8, m.metalDark, cx - 2.4, roofY + 0.86, cz + dz));
  }

  /* ------------------------------- 校鐘 (bell) -------------------------------
   * A little open housing on the roof at the south end.  It is the highest
   * thing on the site and reads from the street as the school's marker. */
  {
    const bx = cx, bz = BLK.z1 - 2.6;
    const BH = 2.5;
    const housing = new THREE.Group();
    housing.name = 'schoolBell';
    const post = [];
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        post.push({ geometry: new THREE.BoxGeometry(0.16, BH, 0.16), matrix: trs(bx + sx * 0.82, roofY + BH / 2, bz + sz * 0.7) });
      }
    }
    const pm = new THREE.Mesh(bake(post), m.wood);
    pm.castShadow = true;
    housing.add(pm);
    /* Posts, the cap and the bell, not the mouth. The whole housing sits
     * inside the teaching-block rectangle. Unnamed, the cap still votes
     * on that rectangle and roof-lift fills the opening from the floor
     * to the ridge. */
    // a shallow hipped cap
    const cap = new THREE.Mesh(new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1), m.roof);
    cap.rotation.y = Math.PI / 4;
    cap.scale.set(2.5, 0.85, 2.3);
    cap.position.set(bx, roofY + BH + 0.42, bz);
    cap.castShadow = true;
    housing.add(cap);
    hullOutline(cap, { thickness: 0.0034 });
    housing.add(box(2.4, 0.12, 2.2, m.roof, bx, roofY + BH + 0.06, bz));
    // the bell
    const bell = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.34, 0.56, 12, 1, true),
      cel({ color: 0x9a7a4a, bands: 3, tint: 0x6a5a80, side: THREE.DoubleSide })
    );
    bell.position.set(bx, roofY + BH - 0.62, bz);
    bell.castShadow = true;
    housing.add(bell);
    hullOutline(bell, { thickness: 0.0034 });
    const crown = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
      m.bronze
    );
    crown.position.set(bx, roofY + BH - 0.34, bz);
    housing.add(crown);
    housing.add(cyl(0.035, 0.035, 0.4, 5, m.metalDark, bx, roofY + BH - 0.14, bz));
    ctx.add(housing);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const px = bx + sx * 0.82, pz = bz + sz * 0.7;
        ctx.collide(px - 0.1, pz - 0.1, px + 0.1, pz + 0.1, roofY + BH, roofY, true);
      }
    }
    ctx.collide(bx - 1.25, bz - 1.15, bx + 1.25, bz + 1.15, roofY + BH + 0.9, roofY + BH, true);
    ctx.collide(bx - 0.36, bz - 0.36, bx + 0.36, bz + 0.36, roofY + BH - 0.3, roofY + BH - 0.92, true);
  }

  return g;
}

/* ------------------------------------------------------------------ *
 * 昇降口 -- the shoe-locker entrance, projecting from the middle of the
 * west facade so it closes the axis from the gate.
 * ------------------------------------------------------------------ */

function buildEntrancePorch(ctx, Y) {
  const m = mats();
  const g = new THREE.Group();
  g.name = 'schoolEntrance';
  ctx.add(g);

  const x0 = 21.1, x1 = BLK.x0 + 0.1;
  const z0 = -51.6, z1 = -47.4;
  const W = x1 - x0, L = z1 - z0;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const H = 3.3;

  const parts = { wall: [], trim: [], roof: [], metal: [] };
  const push = (k, geo, mx) => parts[k].push({ geometry: geo, matrix: mx });

  push('trim', new THREE.BoxGeometry(W + 0.3, 0.34, L + 0.3), trs(cx, Y + 0.17, cz));
  // side walls and a header over the doors: the front is glazed
  for (const s of [-1, 1]) {
    push('wall', new THREE.BoxGeometry(W, H, 0.26), trs(cx, Y + H / 2, cz + s * (L / 2 - 0.13)));
  }
  push('wall', new THREE.BoxGeometry(0.26, H - 2.5, L), trs(x0 + 0.13, Y + H - (H - 2.5) / 2, cz));
  push('roof', new THREE.BoxGeometry(W + 0.9, 0.26, L + 0.6), trs(cx - 0.3, Y + H + 0.13, cz));
  push('roof', new THREE.BoxGeometry(W + 0.9, 0.3, 0.16), trs(cx - 0.3, Y + H + 0.4, cz - L / 2 - 0.22));
  push('roof', new THREE.BoxGeometry(W + 0.9, 0.3, 0.16), trs(cx - 0.3, Y + H + 0.4, cz + L / 2 + 0.22));
  push('roof', new THREE.BoxGeometry(0.16, 0.3, L + 0.6), trs(cx - 0.3 - (W + 0.9) / 2, Y + H + 0.4, cz));

  /* --- glazed front and the doors --- */
  const glassMat = m.glass;
  const front = x0 + 0.02;
  {
    const pane = box(0.05, 2.4, L - 0.5, glassMat, front, Y + 1.3, cz);
    pane.userData.noOutline = true;
    pane.userData.noShadow = true;
    g.add(pane);
    for (let i = 0; i <= 4; i++) {
      push('metal', new THREE.BoxGeometry(0.12, 2.4, 0.09), trs(front, Y + 1.3, cz - (L - 0.5) / 2 + ((L - 0.5) / 4) * i));
    }
    push('metal', new THREE.BoxGeometry(0.16, 0.1, L - 0.4), trs(front, Y + 2.52, cz));
    push('metal', new THREE.BoxGeometry(0.18, 0.12, L - 0.4), trs(front, Y + 0.12, cz));
    // door handles, so the doors read as doors
    for (const s of [-1, 1]) {
      push('metal', new THREE.BoxGeometry(0.06, 0.6, 0.05), trs(front - 0.06, Y + 1.15, cz + s * 0.5));
    }
  }

  /* --- shoe lockers, real geometry: the porch is shallow enough to show them --- */
  {
    const lockers = [];
    const lipParts = [];
    for (const s of [-1, 1]) {
      const lz = cz + s * (L / 2 - 0.5);
      for (let i = 0; i < 5; i++) {
        const lx = x0 + 1.1 + i * 0.72;
        lockers.push({ geometry: new THREE.BoxGeometry(0.66, 1.9, 0.36), matrix: trs(lx, Y + 1.15, lz) });
        for (let r = 0; r < 5; r++) {
          lipParts.push({
            geometry: new THREE.BoxGeometry(0.6, 0.035, 0.04),
            matrix: trs(lx, Y + 0.34 + r * 0.37, lz - s * 0.19),
          });
        }
      }
    }
    const lm = new THREE.Mesh(bake(lockers), m.locker);
    lm.castShadow = lm.receiveShadow = true;
    g.add(lm);
    const lip = new THREE.Mesh(bake(lipParts), cel({ color: 0x94a4b4, bands: 2, tint: 0x5c5680 }));
    g.add(lip);
    // the step up out of the entrance, and the mat on it
    g.add(box(W - 0.5, 0.16, L - 0.6, cel({ color: PAL.corridor, bands: 3, tint: 0x6a6288 }), cx + 0.3, Y + 0.42, cz));
    const mat0 = new THREE.Mesh(new THREE.PlaneGeometry(1.1, L - 1.2),
      cel({ color: 0x6e7a86, bands: 2, tint: 0x545070 }));
    mat0.rotation.x = -Math.PI / 2;
    mat0.position.set(x0 + 0.7, Y + 0.35, cz);
    g.add(mat0);
  }

  /* --- the board over the doors --- */
  {
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.52, L - 0.2),
      [flat({ color: 0xffffff, map: schoolEntrance(), cache: false }),
       flat({ color: PAL.wallWhite }), flat({ color: PAL.wallGray }), flat({ color: PAL.wallGray }),
       flat({ color: PAL.wallWhite }), flat({ color: PAL.wallWhite })]
    );
    board.position.set(x0 - 0.34, Y + H - 0.42, cz);
    board.castShadow = true;
    g.add(board);
    hullOutline(board, { thickness: 0.0032 });
    ctx.add(box(0.6, 0.1, L - 0.2, m.metal, x0 - 0.2, Y + H - 0.06, cz));
  }

  for (const key of Object.keys(parts)) {
    if (!parts[key].length) continue;
    const mesh = new THREE.Mesh(bake(parts[key]),
      { wall: m.wall, trim: m.trim, roof: m.roof, metal: m.metal }[key]);
    mesh.castShadow = mesh.receiveShadow = true;
    g.add(mesh);
    if (key === 'wall' || key === 'roof') hullOutline(mesh, { thickness: 0.003 });
  }
  ctx.collide(x0 - 0.1, z0 - 0.1, x1, z1 + 0.1, Y + H + 0.45);
  return g;
}

/* ------------------------------------------------------------------ *
 * 体育館 -- the gym.  A single pale volume with a shallow gable, which is
 * exactly what makes it read as a gym next to a windowed classroom block.
 * ------------------------------------------------------------------ */

/**
 * A canopy stay, drawn **between two joints** in the (y, z) plane at a fixed x.
 *
 * `a` and `b` are `[y, z]`.  A box along Y turned by `rx` sends its +y end to
 * `(0, cos rx, sin rx)·L/2`, so the angle is `atan2(dz, dy)` and the length is
 * the distance between the joints -- both derived, neither guessed.  Guessing
 * them is how both of the gymnasium's canopies ended up with a 1.2 m strut
 * floating a metre clear of the wall it was supposed to be bracing.
 */
function strut(g, mat, x, a, b, t = 0.08) {
  const dy = a[0] - b[0], dz = a[1] - b[1];
  const st = box(t, Math.hypot(dy, dz), t, mat, x, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
  st.rotation.x = Math.atan2(dz, dy);
  st.castShadow = true;
  g.add(st);
  return st;
}

function buildGym(ctx, Y) {
  const m = mats();
  const g = new THREE.Group();
  g.name = 'gymnasium';
  ctx.add(g);

  const { x0, x1, z0, z1 } = GYM;
  const W = x1 - x0, L = z1 - z0;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const WH = 6.8;            // eaves -- 0.4 m taller with the extra span
  const RH = 3.1;            // ridge above eaves

  const parts = { wall: [], trim: [], roof: [], metal: [] };
  const push = (k, geo, mx) => parts[k].push({ geometry: geo, matrix: mx });

  push('trim', new THREE.BoxGeometry(W + 0.4, 0.55, L + 0.4), trs(cx, Y + 0.27, cz));
  push('wall', new THREE.BoxGeometry(W, WH, L), trs(cx, Y + WH / 2, cz));
  push('trim', new THREE.BoxGeometry(W + 0.12, 0.2, L + 0.12), trs(cx, Y + WH, cz));

  /* gable roof, ridge running along Z so the triangle faces the playground */
  {
    const eave = 0.5;
    const rw = W + eave * 2;
    const rl = L + eave * 2;
    const slope = Math.atan2(RH, rw / 2);
    const slab = Math.hypot(rw / 2, RH) + 0.1;
    for (const s of [-1, 1]) {
      push('roof', new THREE.BoxGeometry(slab, 0.18, rl), trs(cx + s * (rw / 4), Y + WH + RH / 2, cz, 0, 0, -s * slope));
    }
    push('roof', new THREE.BoxGeometry(0.3, 0.22, rl), trs(cx, Y + WH + RH + 0.05, cz));
    // gable infill, closing the roof volume
    const tri = new THREE.Shape();
    tri.moveTo(-W / 2, 0);
    tri.lineTo(W / 2, 0);
    tri.lineTo(0, RH * (1 - (eave * 2) / rw));
    tri.closePath();
    const triGeo = new THREE.ExtrudeGeometry(tri, { depth: 0.22, bevelEnabled: false });
    triGeo.translate(0, 0, -0.11);
    for (const s of [-1, 1]) {
      push('wall', triGeo, trs(cx, Y + WH, cz + s * (L / 2 - 0.11)));
    }
    triGeo.dispose();
    // ridge ventilators
    for (const dz of [-2.6, 0.4, 3.4]) {
      push('metal', new THREE.BoxGeometry(0.7, 0.44, 1.5), trs(cx, Y + WH + RH + 0.34, cz + dz));
      push('roof', new THREE.BoxGeometry(0.95, 0.1, 1.75), trs(cx, Y + WH + RH + 0.58, cz + dz));
    }
  }

  /* high window band on the south gable and along both long walls */
  const bandY = Y + 4.0;
  const glassBand = (axis, at, from, to, height) => {
    const len = to - from;
    const inner = new THREE.Mesh(new THREE.PlaneGeometry(len - 0.6, height + 0.4),
      flat({ color: 0x807a8c, map: gymInterior(), cache: false }));
    const glazing = flat({ color: 0x93aec4, transparent: true, opacity: 0.42, depthWrite: false, cache: false });
    const pane = axis === 'z'
      ? box(0.05, height, len, glazing, at, bandY + height / 2, (from + to) / 2)
      : box(len, height, 0.05, glazing, (from + to) / 2, bandY + height / 2, at);
    pane.userData.noOutline = true;
    pane.userData.noShadow = true;
    if (axis === 'z') {
      inner.position.set(at + (at < cx ? 0.7 : -0.7), bandY + height / 2, (from + to) / 2);
      inner.rotation.y = at < cx ? -Math.PI / 2 : Math.PI / 2;
    } else {
      inner.position.set((from + to) / 2, bandY + height / 2, at + (at < cz ? 0.7 : -0.7));
      inner.rotation.y = at < cz ? Math.PI : 0;
    }
    inner.userData.noOutline = true;
    g.add(inner, pane);
    const nm = Math.max(2, Math.round(len / 1.9));
    for (let i = 0; i <= nm; i++) {
      const t = from + (len / nm) * i;
      push('metal', new THREE.BoxGeometry(axis === 'z' ? 0.12 : 0.1, height + 0.1, axis === 'z' ? 0.1 : 0.12),
        axis === 'z' ? trs(at, bandY + height / 2, t) : trs(t, bandY + height / 2, at));
    }
    for (const yy of [bandY - 0.06, bandY + height + 0.06]) {
      push('trim', new THREE.BoxGeometry(axis === 'z' ? 0.2 : len + 0.2, 0.16, axis === 'z' ? len + 0.2 : 0.2),
        axis === 'z' ? trs(at, yy, (from + to) / 2) : trs((from + to) / 2, yy, at));
    }
  };
  glassBand('z', x0 - 0.02, z0 + 1.0, z1 - 1.0, 1.9);
  glassBand('x', z1 + 0.02, x0 + 5.4, x1 - 1.2, 1.9);
  // the east flank as well: with the gym on the site's corner this wall is the
  // one the whole world sees it from, and a 20 m blank gable is a grey card
  glassBand('z', x1 + 0.02, z0 + 1.6, z1 - 1.6, 1.9);

  /* the big doors on the playground side, with a canopy */
  {
    const dz = z1 + 0.02;
    const dx = x0 + 3.0;
    g.add(box(3.0, 2.6, 0.14, cel({ color: 0xc8ccd4, bands: 3, tint: 0x6a6288 }), dx, Y + 1.3, dz));
    for (const s of [-1, 1]) {
      push('metal', new THREE.BoxGeometry(0.12, 2.6, 0.16), trs(dx + s * 1.5, Y + 1.3, dz));
      push('metal', new THREE.BoxGeometry(0.08, 1.5, 0.06), trs(dx + s * 0.18, Y + 1.2, dz - 0.1));
    }
    push('metal', new THREE.BoxGeometry(3.3, 0.14, 0.16), trs(dx, Y + 2.66, dz));
    const canopy = box(3.9, 0.14, 1.3, m.roof, dx, Y + 3.1, dz + 0.6);
    canopy.rotation.x = -0.12;
    canopy.castShadow = true;
    g.add(canopy);
    /* The two stays, **built between their joints** rather than from a centre and
     * an angle.  Written the second way they were a 1.2 m member centred 0.9 m out
     * from the wall at 0.5 rad, which puts one end at the canopy and the other in
     * mid-air 1.19 m clear of the building -- a strut bracing nothing, which is
     * exactly what it looked like.  A member drawn between two points cannot do
     * that: same rule as the bicycle's frame and the overbridge's stringers. */
    for (const s of [-1, 1]) {
      strut(g, m.metalDark, dx + s * 1.7, [Y + 3.06, dz + 1.02], [Y + 1.95, dz + 0.07]);
    }
    // 立入禁止 plate on the blank stretch of wall beside the doors
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.8, 0.05),
      [flat({ color: PAL.wallGray }), flat({ color: PAL.wallGray }), flat({ color: PAL.wallGray }),
       flat({ color: PAL.wallGray }), flat({ color: 0xffffff, map: warningPlate(1), cache: false }),
       flat({ color: PAL.wallGray })]
    );
    plate.position.set(dx + 5.4, Y + 2.2, dz + 0.03);
    ctx.add(plate);
    // the name plate over the doors
    const name = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 0.44, 0.09),
      [flat({ color: PAL.wallGray }), flat({ color: PAL.wallGray }),
       flat({ color: PAL.wallGray }), flat({ color: PAL.wallGray }),
       flat({ color: 0xffffff, map: schoolBlockPlate(2), cache: false }),
       flat({ color: PAL.wallGray })]
    );
    name.position.set(dx, Y + 3.42, dz + 0.05);
    name.castShadow = true;
    ctx.add(name);
    hullOutline(name, { thickness: 0.003 });
  }

  /* --- the back door and the service steps on the north gable ---
   * A gym has two ways in and only one of them is the one you see: the doors on
   * the ground, and the pair of steel doors at the back that the mats and the
   * apparatus go through.  This one opens onto the service drive off the north
   * gate, which is the whole reason that gate exists. */
  {
    const bz = z0 - 0.02;
    const bx = cx + 4.0;
    g.add(box(2.2, 2.3, 0.12, cel({ color: 0xbcc2ca, bands: 3, tint: 0x6a6288 }), bx, Y + 1.15, bz));
    for (const s of [-1, 1]) {
      push('metal', new THREE.BoxGeometry(0.12, 2.3, 0.14), trs(bx + s * 1.1, Y + 1.15, bz));
      push('metal', new THREE.BoxGeometry(0.07, 0.9, 0.06), trs(bx + s * 0.16, Y + 1.1, bz - 0.09));
    }
    push('metal', new THREE.BoxGeometry(2.5, 0.13, 0.15), trs(bx, Y + 2.36, bz));
    const canopy = box(2.9, 0.13, 1.05, m.roof, bx, Y + 2.78, bz - 0.5);
    canopy.rotation.x = 0.14;
    canopy.castShadow = true;
    g.add(canopy);
    // the same two stays, mirrored -- this gable's canopy projects toward -z
    for (const s of [-1, 1]) {
      strut(g, m.metalDark, bx + s * 1.25, [Y + 2.74, bz - 0.82], [Y + 1.75, bz - 0.06]);
    }
    // the extract fans that go with a hall nobody can open a window in
    for (const dx of [cx - 5.2, cx - 2.8]) {
      const hood = box(1.05, 1.05, 0.4, cel({ color: 0xb4bac4, bands: 3, tint: 0x655d84 }), dx, Y + 5.3, bz - 0.18);
      hood.castShadow = true;
      g.add(hood);
      g.add(box(1.2, 0.12, 0.5, m.metalDark, dx, Y + 5.9, bz - 0.22));
      for (let k = 0; k < 4; k++) {
        g.add(box(0.95, 0.05, 0.06, m.metal, dx, Y + 4.95 + k * 0.24, bz - 0.4));
      }
    }
    // and the switch cabinet every gym has bolted to the outside of it
    const cab = box(0.8, 1.3, 0.44, cel({ color: PAL.cabinet, bands: 3, tint: 0x6f6890 }), cx - 8.2, Y + 0.65, bz - 0.24);
    cab.castShadow = cab.receiveShadow = true;
    ctx.add(cab);
    ctx.add(box(0.88, 0.08, 0.52, cel({ color: PAL.cabinetTop, bands: 3 }), cx - 8.2, Y + 1.34, bz - 0.24));
    ctx.collide(cx - 8.65, bz - 0.5, cx - 7.75, bz + 0.02, Y + 1.4);
  }

  /* downpipes and a hose reel */
  for (const dx of [x0 + 0.16, x1 - 0.16]) {
    for (const dz of [z0 + 1.2, z1 - 1.2]) {
      push('metal', new THREE.CylinderGeometry(0.08, 0.08, WH, 6), trs(dx, Y + WH / 2, dz));
    }
  }

  for (const key of Object.keys(parts)) {
    if (!parts[key].length) continue;
    const mesh = new THREE.Mesh(bake(parts[key]),
      { wall: m.gymWall, trim: m.trim, roof: m.gymRoof, metal: m.metal }[key]);
    mesh.castShadow = mesh.receiveShadow = true;
    g.add(mesh);
    if (key === 'wall' || key === 'roof') hullOutline(mesh, { thickness: 0.003 });
  }
  ctx.collide(x0 - 0.2, z0 - 0.2, x1 + 0.2, z1 + 0.2, Y + WH + RH);
  return g;
}

/* ------------------------------------------------------------------ *
 * The ground: rolled clay, lime lines, a backstop, and the equipment
 * that says a club was here this afternoon.
 * ------------------------------------------------------------------ */

function buildPlayground(ctx, Y, rng) {
  const m = mats();
  const gm = groundMats();
  const g = new THREE.Group();
  g.name = 'playground';
  ctx.add(g);

  const x0 = GND.x0 + 0.4, x1 = GND.x1 - 0.4, z0 = GND.z0 + 0.4, z1 = GND.z1 - 0.4;
  const lineMat = cel({ color: PAL.clayLine, bands: 2, tint: 0x8f86ad });

  /* lime markings: six sprint lanes across the long dimension, a centre circle
   * and the touch lines of the football pitch the two goals belong to.  Six
   * lanes because the ground is 43 m long now and a 40 m dash fits in it, which
   * is the one thing the old 19 m square could not do. */
  {
    const parts = [];
    for (let i = 0; i < 7; i++) {
      parts.push({
        geometry: new THREE.BoxGeometry(x1 - x0 - 3.0, 0.02, 0.09),
        matrix: trs((x0 + x1) / 2, 0, z0 + 2.2 + i * 1.5),
      });
    }
    for (const dx of [x0 + 2.0, x1 - 2.0]) {
      parts.push({ geometry: new THREE.BoxGeometry(0.1, 0.02, 9.4), matrix: trs(dx, 0, z0 + 6.7) });
    }
    /* The pitch: touch lines, halfway line, and the two goal areas.  36 x 18,
     * which is a school pitch, and it *overlaps* the sprint lanes -- every school
     * ground in Japan has two sets of markings crossing each other because the
     * ground is used for both and there is only one of it. */
    const px0 = x0 + 3.5, px1 = x1 - 3.5, pz0 = z0 + 1.5, pz1 = z1 - 1.5;
    for (const pz of [pz0, pz1]) {
      parts.push({ geometry: new THREE.BoxGeometry(px1 - px0, 0.02, 0.09), matrix: trs((px0 + px1) / 2, 0, pz) });
    }
    for (const px of [px0, px1]) {
      parts.push({ geometry: new THREE.BoxGeometry(0.09, 0.02, pz1 - pz0), matrix: trs(px, 0, (pz0 + pz1) / 2) });
    }
    parts.push({
      geometry: new THREE.BoxGeometry(0.09, 0.02, pz1 - pz0),
      matrix: trs((px0 + px1) / 2, 0, (pz0 + pz1) / 2),
    });
    for (const px of [px0, px1]) {
      const s = px === px0 ? 1 : -1;
      parts.push({ geometry: new THREE.BoxGeometry(4.4, 0.02, 0.09), matrix: trs(px + s * 2.2, 0, (pz0 + pz1) / 2 - 4.4) });
      parts.push({ geometry: new THREE.BoxGeometry(4.4, 0.02, 0.09), matrix: trs(px + s * 2.2, 0, (pz0 + pz1) / 2 + 4.4) });
      parts.push({ geometry: new THREE.BoxGeometry(0.09, 0.02, 8.8), matrix: trs(px + s * 4.4, 0, (pz0 + pz1) / 2) });
    }
    // and the two arcs the corner flags stand at
    for (const px of [px0, px1]) {
      for (const pz of [pz0, pz1]) {
        const arc = new THREE.TorusGeometry(1.0, 0.045, 3, 8, Math.PI / 2);
        arc.rotateX(Math.PI / 2);
        arc.rotateY(px === px0 ? (pz === pz0 ? 0 : -Math.PI / 2) : (pz === pz0 ? Math.PI / 2 : Math.PI));
        parts.push({ geometry: arc, matrix: trs(px, 0, pz) });
      }
    }
    const ring = new THREE.TorusGeometry(3.6, 0.05, 3, 30);
    ring.rotateX(Math.PI / 2);
    parts.push({ geometry: ring, matrix: trs((px0 + px1) / 2, 0, (pz0 + pz1) / 2) });
    const mesh = new THREE.Mesh(bake(parts), lineMat);
    mesh.position.y = Y + 0.075;
    mesh.userData.noOutline = true;
    mesh.renderOrder = 1;
    g.add(mesh);
    ring.dispose();
  }

  /* long-jump pit */
  {
    const sx = x1 - 4.6, sz = z1 - 3.0;
    const sand = box(5.4, 0.05, 2.3, cel({ color: PAL.sand, bands: 3, tint: 0x7d74a0 }), sx, Y + 0.075, sz);
    sand.receiveShadow = true;
    g.add(sand);
    for (const s of [-1, 1]) {
      g.add(box(5.6, 0.12, 0.1, m.wood, sx, Y + 0.09, sz + s * 1.2));
    }
    g.add(box(0.1, 0.12, 2.5, m.wood, sx + 2.75, Y + 0.09, sz));
    g.add(box(0.5, 0.03, 2.3, cel({ color: PAL.lineWhite, bands: 2, tint: 0x8e86ad }), sx - 3.1, Y + 0.085, sz));
  }

  /* backstop at the north end -- a tall mesh panel, one of the most
   * recognisable shapes on any Japanese school ground */
  meshFence(ctx, {
    axis: 'x', at: z0 - 0.5, from: 40.0, to: 48.6, y: Y, h: 4.4, spacing: 2.15, mid: true,
    meshColor: 0xa4b0bc,
  });
  for (const dx of [40.0, 48.6]) {
    const brace = box(0.1, 4.4, 0.1, m.metalDark, dx, Y + 2.2, z0 - 0.5);
    brace.rotation.x = 0.24;
    brace.castShadow = true;
    g.add(brace);
  }

  /* 防球網 -- the tall ball net down the east boundary and round the south-east
   * corner, which is where a kicked ball leaves the site.  8 m: a 4.4 m backstop
   * catches a bat, a net that stops a football has to be twice that, and the two
   * different heights next to each other are half of what makes a school ground
   * read as one.  No collider: the boundary wall behind it already has one, and a
   * second inflated by the player's radius would seal the gym's apron. */
  for (const r of [
    { axis: 'z', at: GND.x1 + 1.2, from: GND.z0 - 1.0, to: GND.z1 + 1.0 },
    { axis: 'x', at: GND.z1 + 1.2, from: GND.x1 - 12.0, to: GND.x1 + 1.2 },
  ]) {
    meshFence(ctx, { ...r, y: Y, h: 8.0, spacing: 2.4, mid: true, meshColor: 0xaab6c0, collide: false });
    // the raking struts that hold a net that tall up
    const along = r.axis === 'z' ? r.from : r.from;
    const n = Math.max(2, Math.round(Math.abs(r.to - r.from) / 4.8));
    for (let k = 0; k <= n; k++) {
      const t = r.from + ((r.to - r.from) * k) / n;
      const sx = r.axis === 'z' ? r.at : t;
      const sz = r.axis === 'z' ? t : r.at;
      const st = box(0.11, 5.4, 0.11, m.metalDark,
        sx + (r.axis === 'z' ? -0.9 : 0), Y + 2.9, sz + (r.axis === 'z' ? 0 : -0.9));
      st.rotation.z = r.axis === 'z' ? -0.32 : 0;
      st.rotation.x = r.axis === 'z' ? 0 : 0.32;
      st.castShadow = true;
      g.add(st);
    }
  }

  /* 旗竿 -- the three flagpoles, at the ground's north-west corner where the
   * assembly forms up.  Three and not one: a single pole is a garden ornament,
   * three in a row on a concrete plinth is a school. */
  {
    const bx = x0 + 1.6, bz = z0 + 2.0;
    const plinth = box(4.6, 0.34, 1.5, gm.concrete, bx + 1.5, Y + 0.17, bz);
    plinth.castShadow = plinth.receiveShadow = true;
    g.add(plinth);
    hullOutline(plinth, { thickness: 0.003 });
    ctx.platform({ x0: bx - 0.7, x1: bx + 3.7, z0: bz - 0.75, z1: bz + 0.75, top: Y + 0.34 });
    for (let k = 0; k < 3; k++) {
      const px = bx + k * 1.5;
      const h = 8.4 - Math.abs(k - 1) * 0.9;
      const pole = cyl(0.055, 0.075, h, 8, cel({ color: 0xe4e2e6, bands: 3, tint: 0x6f6790 }), px, Y + 0.34 + h / 2, bz);
      pole.castShadow = true;
      g.add(pole);
      g.add(cyl(0.09, 0.09, 0.1, 8, m.metalDark, px, Y + 0.34 + h + 0.05, bz));
      // the halyard cleat, and the rope hanging slack against the pole
      g.add(box(0.07, 0.16, 0.05, m.metalDark, px + 0.09, Y + 1.5, bz));
      g.add(cyl(0.012, 0.012, h - 1.6, 4, cel({ color: 0xe8e2d2, bands: 2, tint: 0x8a83a8 }), px + 0.075, Y + 1.5 + (h - 1.6) / 2, bz));
      ctx.collide(px - 0.14, bz - 0.14, px + 0.14, bz + 0.14, Y + 0.34 + h);
    }
  }

  /* 朝礼台 -- the assembly podium */
  {
    const px = x0 + 8.0, pz = z0 + 2.6;
    const p = box(2.6, 0.5, 1.7, gm.concrete, px, Y + 0.25, pz);
    p.castShadow = p.receiveShadow = true;
    g.add(p);
    hullOutline(p, { thickness: 0.003 });
    g.add(box(2.7, 0.07, 1.8, gm.concreteMid, px, Y + 0.53, pz));
    for (let i = 0; i < 2; i++) {
      g.add(box(0.9, 0.18 * (2 - i), 0.34, gm.concrete, px, Y + (0.18 * (2 - i)) / 2, pz + 1.02 + i * 0.34));
    }
    ctx.platform({ x0: px - 1.35, x1: px + 1.35, z0: pz - 0.9, z1: pz + 0.9, top: Y + 0.56 });
  }

  /* Goals: two football goals at the ends of the pitch, and one small practice
   * goal off to the side.  The netting is kept out of the depth buffer -- a
   * see-through panel written into it turns into a field of ink speckle. */
  const goalSpec = [
    [x0 + 3.5, (z0 + z1) / 2, -Math.PI / 2, 5.0, 2.1],
    [x1 - 3.5, (z0 + z1) / 2, Math.PI / 2, 5.0, 2.1],
    [x1 - 9.0, z0 + 2.4, 0, 3.0, 2.0],
  ];
  for (const [gx, gz, ry, GW, GH] of goalSpec) {
    const goal = new THREE.Group();
    const parts = [];
    for (const s of [-1, 1]) {
      parts.push({ geometry: new THREE.CylinderGeometry(0.055, 0.055, GH, 7), matrix: trs((s * GW) / 2, GH / 2, 0) });
      parts.push({ geometry: new THREE.CylinderGeometry(0.045, 0.045, 1.1, 6), matrix: trs((s * GW) / 2, GH * 0.5, -0.5, 0.9, 0, 0) });
    }
    parts.push({ geometry: new THREE.CylinderGeometry(0.055, 0.055, GW, 7), matrix: trs(0, GH, 0, 0, 0, Math.PI / 2) });
    const frame = new THREE.Mesh(bake(parts), m.metal);
    frame.castShadow = true;
    goal.add(frame);
    const netTex = chainLinkTex().clone();
    netTex.wrapS = netTex.wrapT = THREE.RepeatWrapping;
    netTex.repeat.set(GW / 0.22, GH / 0.22);
    netTex.needsUpdate = true;
    const net = new THREE.Mesh(new THREE.PlaneGeometry(GW, GH),
      flat({
        color: 0xeef1f5, map: netTex, transparent: true, opacity: 0.7,
        side: THREE.DoubleSide, depthWrite: false, cache: false,
      }));
    net.position.set(0, GH / 2, -0.45);
    net.rotation.x = -0.2;
    net.userData.noOutline = true;
    net.userData.noShadow = true;
    goal.add(net);
    goal.position.set(gx, Y + 0.06, gz);
    goal.rotation.y = ry;
    g.add(goal);
    /* Posts and crossbar, not the mouth. A baked frame AABB is a wall
     * across the one gap a quad wants. The net is air. */
    const gy = Y + 0.06;
    const pr = 0.08;
    const ca = Math.cos(ry);
    const sa = Math.sin(ry);
    for (const side of [-1, 1]) {
      const lx = (side * GW) / 2;
      const px = gx + ca * lx;
      const pz = gz - sa * lx;
      ctx.collide(px - pr, pz - pr, px + pr, pz + pr, gy + GH, gy);
      const bx = gx + ca * lx - sa * 0.5;
      const bz = gz - sa * lx - ca * 0.5;
      ctx.collide(bx - pr, bz - pr, bx + pr, bz + pr, gy + GH * 0.8, gy);
    }
    const half = GW / 2 + pr;
    const wx = Math.abs(ca) * half + Math.abs(sa) * pr;
    const wz = Math.abs(sa) * half + Math.abs(ca) * pr;
    ctx.collide(gx - wx, gz - wz, gx + wx, gz + wz, gy + GH + pr, gy + GH - pr, true);
  }

  /* 百葉箱 -- the louvred weather box on legs, and the equipment left out.
   * Moved to the ground's south-east corner: its old spot at (x0+1.4, z0+2.2) is
   * now under the flagpole plinth. */
  {
    const wx = x1 - 2.2, wz = z1 - 2.6;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        g.add(box(0.07, 1.2, 0.07, cel({ color: 0xf4f2ee, bands: 3, tint: 0x6f6790 }), wx + sx * 0.28, Y + 0.6, wz + sz * 0.24));
      }
    }
    const bx = box(0.78, 0.62, 0.6, cel({ color: 0xf6f4f0, bands: 3, tint: 0x6f6790 }), wx, Y + 1.5, wz);
    bx.castShadow = true;
    g.add(bx);
    for (let i = 0; i < 5; i++) {
      g.add(box(0.8, 0.04, 0.62, cel({ color: 0xdcd8dc, bands: 2, tint: 0x6a6288 }), wx, Y + 1.26 + i * 0.12, wz));
    }
    const lid = box(0.94, 0.07, 0.74, cel({ color: 0xe8e6ea, bands: 3, tint: 0x6a6288 }), wx, Y + 1.85, wz);
    lid.rotation.z = 0.06;
    g.add(lid);
  }

  // hurdles, a tyre stack, a line marker and a rolled mat
  {
    for (let i = 0; i < 4; i++) {
      const hx = x1 - 15.0 - i * 1.5;
      const hz = z0 + 1.4 + rng.range(-0.2, 0.2);
      // two uprights, a banded top bar and splayed feet -- read as a hurdle
      for (const s of [-1, 1]) {
        g.add(box(0.05, 0.78, 0.05, m.metal, hx, Y + 0.42, hz + s * 0.53));
        g.add(box(0.72, 0.05, 0.06, m.metalDark, hx, Y + 0.06, hz + s * 0.53));
      }
      g.add(box(0.1, 0.11, 1.16, cel({ color: i % 2 ? PAL.lineWhite : PAL.yellow, bands: 2, tint: 0x8f7050 }), hx, Y + 0.79, hz));
      g.add(box(0.06, 0.06, 1.1, m.metal, hx, Y + 0.4, hz));
    }
    for (let i = 0; i < 4; i++) {
      const t = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.1, 5, 12),
        cel({ color: 0x4a4653, bands: 2, tint: 0x453f5c }));
      t.rotation.x = Math.PI / 2;
      t.position.set(x0 + 1.2 + (i % 2) * 0.68, Y + 0.16 + ((i / 2) | 0) * 0.2, z1 - 6.4 + (i % 2) * 0.2);
      t.castShadow = true;
      g.add(t);
    }
    // line-marking cart
    {
      const cxx = x0 + 5.6, czz = z1 - 5.4;
      g.add(box(0.5, 0.42, 0.42, cel({ color: 0xd8d4dc, bands: 3, tint: 0x6a6288 }), cxx, Y + 0.3, czz));
      for (const s of [-1, 1]) {
        const wl = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.05, 10), m.metalDark);
        wl.rotation.z = Math.PI / 2;
        wl.position.set(cxx, Y + 0.14, czz + s * 0.26);
        g.add(wl);
      }
      const handle = cyl(0.025, 0.025, 0.95, 5, m.metal, cxx - 0.36, Y + 0.66, czz);
      handle.rotation.z = 0.75;
      g.add(handle);
    }
    // two rolled mats leaned against the gym wall
    for (let i = 0; i < 2; i++) {
      const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 1.9, 12),
        cel({ color: i ? 0x6f8fa8 : 0x8a9caa, bands: 3, tint: 0x5a5480 }));
      roll.position.set(GYM.x0 + 1.4 + i * 0.64, Y + 1.0, GYM.z1 + 0.9);
      roll.rotation.set(0, 0, 0.1 - i * 0.05);
      roll.castShadow = true;
      g.add(roll);
      g.add(cyl(0.29, 0.29, 0.04, 12, cel({ color: 0x5f6f80, bands: 2 }), GYM.x0 + 1.4 + i * 0.64, Y + 1.95, GYM.z1 + 0.9));
    }
  }

  /* --------------------- what a bigger ground needs ---------------------
   * 968 m² of clay wants more than markings on it or it reads as a car park with
   * lines.  A drinking point at each end (the one thing every school ground in
   * Japan has and this one did not), benches along the south path where the
   * spectators would be, and a ball box by the gym's apron. */
  ctx.add(makeTapPost({ x: GND.x0 + 1.2, z: GND.z1 - 5.6, y: Y, ry: -Math.PI / 2, h: 0.92 }));
  ctx.add(makeTapPost({ x: GND.x1 - 1.4, z: GND.z0 + 6.2, y: Y, ry: Math.PI / 2, h: 0.92 }));
  for (const [bx, bz] of [[42.0, -44.9], [52.0, -44.9], [62.0, -44.9]]) {
    ctx.add(makeBench({ x: bx, z: bz, y: Y, ry: Math.PI, len: 1.9 }));
  }
  ctx.add(makeBallBox({ x: GYM.x0 + 3.4, z: GYM.z1 + 1.0, y: Y, ry: Math.PI, seed: 7731 }));
  ctx.add(makeCrates({ x: GYM.x0 + 6.4, z: GYM.z1 + 1.1, y: Y, n: 4, seed: 7732, ry: -0.18 }));
  ctx.add(makeBucket({ x: GYM.x0 + 7.6, z: GYM.z1 + 0.8, y: Y, ry: 0.4 }));

  shadowify(g, true, true);
  return g;
}

/* ------------------------------------------------------------------ *
 * 第二校舎 -- the special-classroom block.
 *
 * Two floors, 22 x 8.5, along the site's north edge and facing south across the
 * 中庭 at the back of the main block.  Built as a shell with real openings for the
 * same reason the 本校舎 is: a solid volume with a glass decal on it is what makes
 * school windows read as stickers.
 *
 * What is different from the main block, and it is the whole point of the
 * building: **the rooms behind the glass are not classrooms.**  A 特別教室棟 is
 * science benches with tap risers, easels and a plaster shelf, an upright piano
 * and instrument cases, cooking islands under a hood, rows of monitors -- six
 * interiors in `specialRoomTex`, cycled per bay and per floor so no two adjacent
 * windows show the same room.  From the courtyard you read the building as a set
 * of different rooms rather than as a repeat, which is the difference between a
 * second block and a copy of the first.
 *
 * Its long axis runs along X and its windows face +z, so unlike the main block --
 * whose facade looks west into the afternoon -- this one is lit all day.  That is
 * why it is the north building: the sun is at (-52, 62, 56), so a +z elevation is
 * the only one in the school where the wall is lit *and* the ground in front of it
 * is out of the building's own shadow.
 * ------------------------------------------------------------------ */

function buildSecondBlock(ctx, Y) {
  const m = mats();
  const rng = rngKit(7714);
  const g = new THREE.Group();
  g.name = 'secondBlock';
  ctx.add(g);

  const { x0, x1, z0, z1 } = BLK2;
  const W = x1 - x0, D = z1 - z0;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const T = 0.3;

  const parts = { wall: [], alt: [], blue: [], trim: [], roof: [], metal: [] };
  const push = (k, geo, mx) => parts[k].push({ geometry: geo, matrix: mx });

  /* plinth */
  const plinth = box(W + 0.4, 0.45, D + 0.4, m.concreteMid, cx, Y + 0.22, cz);
  plinth.receiveShadow = plinth.castShadow = true;
  g.add(plinth);

  /* shell: end walls, the corridor wall on the north, floor slabs, roof */
  for (const s of [-1, 1]) {
    push('wall', new THREE.BoxGeometry(T, H_BLK2, D), trs(cx + s * (W / 2 - T / 2), Y + H_BLK2 / 2, cz));
  }
  push('alt', new THREE.BoxGeometry(W - T * 2, H_BLK2, T), trs(cx, Y + H_BLK2 / 2, z0 + T / 2));
  for (let k = 0; k <= 2; k++) {
    push('trim', new THREE.BoxGeometry(W - T * 2, 0.26, D - T), trs(cx, Y + k * FH2 + 0.13, cz));
  }
  push('trim', new THREE.BoxGeometry(W + 0.16, 0.16, D + 0.16), trs(cx, Y + FH2, cz));
  push('roof', new THREE.BoxGeometry(W + 0.5, 0.3, D + 0.5), trs(cx, Y + H_BLK2 + 0.15, cz));
  for (const s of [-1, 1]) {
    push('roof', new THREE.BoxGeometry(W + 0.5, 0.44, 0.18), trs(cx, Y + H_BLK2 + 0.52, cz + s * (D / 2 + 0.16)));
    push('roof', new THREE.BoxGeometry(0.18, 0.44, D + 0.5), trs(cx + s * (W / 2 + 0.16), Y + H_BLK2 + 0.52, cz));
  }

  /* south facade: piers, spandrels and real openings */
  const BAYS = 8;
  const pitch = (W - 0.6) / BAYS;
  const PIER = 0.46;
  const openW = pitch - PIER;
  const winY0 = 1.0;
  const winH = 1.66;
  const zw = z1;

  for (let k = 0; k < 2; k++) {
    const y = Y + k * FH2;
    push('blue', new THREE.BoxGeometry(W, winY0 - 0.13, T), trs(cx, y + 0.13 + (winY0 - 0.13) / 2, zw - T / 2));
    push('wall', new THREE.BoxGeometry(W, FH2 - winY0 - winH, T), trs(cx, y + winY0 + winH + (FH2 - winY0 - winH) / 2, zw - T / 2));
    for (let i = 0; i <= BAYS; i++) {
      push('wall', new THREE.BoxGeometry(PIER, winH, T), trs(x0 + 0.3 + i * pitch, y + winY0 + winH / 2, zw - T / 2));
    }
  }

  const frame = [];
  for (let k = 0; k < 2; k++) {
    const y = Y + k * FH2;
    for (let i = 0; i < BAYS; i++) {
      const bx = x0 + 0.3 + pitch * (i + 0.5);
      const yc = y + winY0 + winH / 2;
      /* The room behind this bay.  Cycled so that no two adjacent windows on
       * either floor show the same one, and the corridor tone (5) lands on the
       * two end bays of the upper floor where the stair is. */
      const variant = (k === 1 && (i === 0 || i === BAYS - 1)) ? 5 : (i * 2 + k * 3) % 5;
      const inner = new THREE.Mesh(
        new THREE.PlaneGeometry(openW + 0.4, winH + 0.5),
        flat({ color: 0xa39cb2, map: specialRoomTex(variant), cache: false })
      );
      inner.position.set(bx, yc, zw - 1.15);
      // a PlaneGeometry faces +z and flat() is single-sided; this facade looks +z
      inner.userData.noOutline = true;
      g.add(inner);

      const pane = box(openW, winH, 0.05, m.glass, bx, yc, zw + 0.01);
      pane.userData.noOutline = true;
      pane.userData.noShadow = true;
      g.add(pane);
      frame.push({ geometry: new THREE.BoxGeometry(openW + 0.1, 0.09, 0.12), matrix: trs(bx, yc + winH / 2, zw + 0.01) });
      frame.push({ geometry: new THREE.BoxGeometry(openW + 0.16, 0.1, 0.16), matrix: trs(bx, yc - winH / 2 - 0.04, zw - 0.01) });
      frame.push({ geometry: new THREE.BoxGeometry(0.08, winH, 0.09), matrix: trs(bx, yc, zw + 0.03) });

      if (rng.chance(0.34)) {
        const s = rng.sign();
        const cw = openW * rng.range(0.3, 0.5);
        const cur = new THREE.Mesh(
          new THREE.PlaneGeometry(cw, winH - 0.06),
          flat({ color: 0xe6dfd0, map: curtainTex(k % 2), cache: false })
        );
        cur.position.set(bx + s * (openW / 2 - cw / 2), yc, zw - 0.12);
        cur.userData.noOutline = true;
        g.add(cur);
      }
      if ((i + k) % 2 === 1) {
        const hi = new THREE.Mesh(
          new THREE.PlaneGeometry(openW * 0.3, winH * 1.02),
          flat({ color: 0xf2f8ff, transparent: true, opacity: 0.16, depthWrite: false, cache: false })
        );
        hi.position.set(bx - openW * 0.22, yc, zw + 0.06);
        hi.rotation.z = 0.34;
        hi.userData.noOutline = true;
        g.add(hi);
      }
    }
  }

  /* north side: the corridor's ribbon window, and the services on it */
  for (let k = 0; k < 2; k++) {
    const yc = Y + k * FH2 + 2.1;
    const inner = new THREE.Mesh(new THREE.PlaneGeometry(W - 1.6, 1.9),
      flat({ color: 0xa39cb2, map: specialRoomTex(5), cache: false }));
    inner.position.set(cx, yc, z0 + 1.1);
    inner.rotation.y = Math.PI;
    inner.userData.noOutline = true;
    g.add(inner);
    const pane = box(W - 1.6, 1.4, 0.05, m.glass, cx, yc, z0 - 0.02);
    pane.userData.noOutline = true;
    pane.userData.noShadow = true;
    g.add(pane);
    const nm = Math.round((W - 1.6) / 1.55);
    for (let i = 0; i <= nm; i++) {
      frame.push({
        geometry: new THREE.BoxGeometry(0.08, 1.5, 0.1),
        matrix: trs(cx - (W - 1.6) / 2 + ((W - 1.6) / nm) * i, yc, z0 - 0.02),
      });
    }
    frame.push({ geometry: new THREE.BoxGeometry(W - 1.5, 0.09, 0.14), matrix: trs(cx, yc + 0.74, z0 - 0.02) });
    frame.push({ geometry: new THREE.BoxGeometry(W - 1.5, 0.1, 0.18), matrix: trs(cx, yc - 0.76, z0) });
  }
  for (const dx of [-7.6, -0.4, 7.2]) {
    for (let k = 0; k < 2; k++) {
      push('metal', new THREE.CylinderGeometry(0.07, 0.07, FH2, 6), trs(cx + dx, Y + k * FH2 + FH2 / 2, z0 - 0.2));
    }
  }
  /* Outdoor units on the corridor side, where they belong.  `makeAircon`'s
   * grille is on +z, so `ry` is the wall's outward normal -- this wall's is -z,
   * hence PI.  Half the units in the world were a half turn out for exactly this. */
  for (const dx of [-8.6, -2.0, 6.0]) {
    ctx.add(makeAircon({ x: cx + dx, z: z0 - 0.24, y: Y + 0.45, ry: Math.PI, w: 0.9, h: 0.62 }));
  }

  /* the entrance from the courtyard, into the middle of the south facade */
  {
    const dx = cx - 3.2;
    const H = 2.7;
    g.add(box(2.6, H, 0.14, cel({ color: 0xc8ccd4, bands: 3, tint: 0x6a6288 }), dx, Y + H / 2, z1 + 0.03));
    for (const s of [-1, 1]) {
      push('metal', new THREE.BoxGeometry(0.13, H, 0.16), trs(dx + s * 1.3, Y + H / 2, z1 + 0.04));
      push('metal', new THREE.BoxGeometry(0.06, 1.4, 0.05), trs(dx + s * 0.17, Y + 1.15, z1 + 0.12));
    }
    push('metal', new THREE.BoxGeometry(2.9, 0.13, 0.17), trs(dx, Y + H + 0.07, z1 + 0.04));
    const canopy = box(3.5, 0.14, 1.3, m.roof, dx, Y + H + 0.5, z1 + 0.6);
    canopy.rotation.x = 0.12;
    canopy.castShadow = true;
    g.add(canopy);
    for (const s of [-1, 1]) {
      const st = box(0.08, 1.15, 0.08, m.metalDark, dx + s * 1.5, Y + H + 0.02, z1 + 0.85);
      st.rotation.x = -0.5;
      g.add(st);
    }
    // the name plate over the doors
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, 0.5, 0.1),
      [flat({ color: PAL.wallGray }), flat({ color: PAL.wallGray }),
       flat({ color: PAL.wallGray }), flat({ color: PAL.wallGray }),
       flat({ color: 0xffffff, map: schoolBlockPlate(0), cache: false }),
       flat({ color: PAL.wallGray })]
    );
    plate.position.set(dx + 4.2, Y + 2.3, z1 + 0.06);
    plate.castShadow = true;
    g.add(plate);
    hullOutline(plate, { thickness: 0.003 });
    ctx.add(makeDoormat({ x: dx, z: z1 + 1.0, y: Y, ry: 0, w: 1.5, d: 0.85 }));
  }

  /* --- roof: railing, the tanks and the two big vents a science block has --- */
  const roofY = Y + H_BLK2 + 0.3;
  for (const r of [
    { axis: 'x', at: z0 + 0.15, from: x0, to: x1 },
    { axis: 'x', at: z1 - 0.15, from: x0, to: x1 },
    { axis: 'z', at: x0 + 0.1, from: z0, to: z1 },
    { axis: 'z', at: x1 - 0.1, from: z0, to: z1 },
  ]) {
    meshFence(ctx, { ...r, y: roofY + 0.44, h: 1.2, spacing: 2.0, meshColor: 0xb4bcc8 });
  }
  for (const dx of [-6.0, 4.4]) {
    ctx.add(box(1.5, 0.9, 1.4, cel({ color: 0xb4bac4, bands: 3, tint: 0x655d84 }), cx + dx, roofY + 0.45, cz + 1.0));
    ctx.add(box(1.7, 0.11, 1.6, m.metal, cx + dx, roofY + 0.95, cz + 1.0));
  }
  for (const dx of [-2.0, 1.2, 8.0]) {
    ctx.add(cyl(0.15, 0.15, 0.85, 8, m.metal, cx + dx, roofY + 0.42, cz - 2.2));
    ctx.add(cyl(0.25, 0.19, 0.16, 8, m.metalDark, cx + dx, roofY + 0.9, cz - 2.2));
  }

  for (const key of Object.keys(parts)) {
    if (!parts[key].length) continue;
    const mesh = new THREE.Mesh(bake(parts[key]),
      { wall: m.wall, alt: m.wallAlt, blue: m.wallBlue, trim: m.trim, roof: m.roof, metal: m.metal }[key]);
    mesh.castShadow = mesh.receiveShadow = true;
    g.add(mesh);
    if (key === 'wall' || key === 'roof' || key === 'alt') hullOutline(mesh, { thickness: 0.003 });
  }
  const fm = new THREE.Mesh(bake(frame), m.metal);
  fm.castShadow = true;
  g.add(fm);

  ctx.collide(x0 - 0.2, z0 - 0.3, x1 + 0.2, z1 + 0.2, Y + H_BLK2 + 0.5);
  return g;
}

/* ------------------------------------------------------------------ *
 * 管理棟 -- the single-storey annex, and the 渡り廊下 to the second block.
 *
 * 保健室, 放送室 and the caretaker's room, in a 9.5 x 4 wing on the main block's
 * north end.  One floor on purpose: three storeys here would close the courtyard
 * in, and what the plan needs at this corner is something low enough to see the
 * second block over.
 *
 * The link is the piece that makes the two blocks one school.  Ground floor and
 * first floor, glazed on both sides, 3.5 m of span -- and it is the only place in
 * the district where you walk *through* a building at first-floor level.
 * ------------------------------------------------------------------ */

function buildAnnex(ctx, Y) {
  const m = mats();
  const g = new THREE.Group();
  g.name = 'schoolAnnex';
  ctx.add(g);

  const { x0, x1, z0, z1 } = ANX;
  const W = x1 - x0, D = z1 - z0;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const H = 3.4;
  const parts = { wall: [], trim: [], roof: [], metal: [] };
  const push = (k, geo, mx) => parts[k].push({ geometry: geo, matrix: mx });

  push('trim', new THREE.BoxGeometry(W + 0.36, 0.4, D + 0.36), trs(cx, Y + 0.2, cz));
  push('wall', new THREE.BoxGeometry(W, H, D), trs(cx, Y + H / 2, cz));
  push('roof', new THREE.BoxGeometry(W + 0.46, 0.28, D + 0.46), trs(cx, Y + H + 0.14, cz));
  push('roof', new THREE.BoxGeometry(W + 0.46, 0.4, 0.16), trs(cx, Y + H + 0.48, cz - D / 2 - 0.15));
  push('roof', new THREE.BoxGeometry(W + 0.46, 0.4, 0.16), trs(cx, Y + H + 0.48, cz + D / 2 + 0.15));

  /* windows on the courtyard side (east) and the yard side (west).  Built out
   * rather than in: you cannot carve a recess into a box, and a panel written
   * behind the wall face is simply inside the render. */
  const win = (nx, at, along, wide) => {
    const yc = Y + 1.85;
    const inner = new THREE.Mesh(new THREE.PlaneGeometry(wide, 1.6),
      flat({ color: 0xa39cb2, map: classroomTex(1), cache: false }));
    if (nx) {
      inner.position.set(at + (at > cx ? -0.06 : 0.06), yc, along);
      inner.rotation.y = at > cx ? Math.PI / 2 : -Math.PI / 2;
      g.add(inner);
      const pane = box(0.05, 1.5, wide, m.glass, at + (at > cx ? 0.02 : -0.02), yc, along);
      pane.userData.noOutline = pane.userData.noShadow = true;
      g.add(pane);
      push('metal', new THREE.BoxGeometry(0.11, 0.09, wide + 0.14), trs(at, yc + 0.78, along));
      push('metal', new THREE.BoxGeometry(0.14, 0.1, wide + 0.2), trs(at, yc - 0.8, along));
      push('metal', new THREE.BoxGeometry(0.09, 1.5, 0.08), trs(at, yc, along));
    }
    inner.userData.noOutline = true;
  };
  win(true, x1, cz - 1.0, 2.0);
  win(true, x1, cz + 1.0, 1.4);
  win(true, x0, cz, 2.6);

  /* the door onto the courtyard side, with the 管理棟 plate over it */
  {
    const dz = z1 - 0.9;
    g.add(box(0.12, 2.2, 1.1, cel({ color: 0xc8ccd4, bands: 3, tint: 0x6a6288 }), x1 + 0.03, Y + 1.1, dz));
    push('metal', new THREE.BoxGeometry(0.14, 2.3, 0.13), trs(x1 + 0.04, Y + 1.15, dz + 0.62));
    push('metal', new THREE.BoxGeometry(0.14, 2.3, 0.13), trs(x1 + 0.04, Y + 1.15, dz - 0.62));
    push('metal', new THREE.BoxGeometry(0.05, 0.5, 0.05), trs(x1 + 0.11, Y + 1.05, dz - 0.36));
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.38, 1.9),
      [flat({ color: 0xffffff, map: schoolBlockPlate(1), cache: false }),
       flat({ color: PAL.wallGray }), flat({ color: PAL.wallGray }),
       flat({ color: PAL.wallGray }), flat({ color: PAL.wallGray }), flat({ color: PAL.wallGray })]
    );
    plate.position.set(x1 + 0.06, Y + 2.62, dz);
    plate.castShadow = true;
    g.add(plate);
    ctx.add(makeDoormat({ x: x1 + 0.75, z: dz, y: Y, ry: Math.PI / 2, w: 1.1, d: 0.8 }));
  }

  // the flue off the 放送室's rack, and the roof vent
  push('metal', new THREE.CylinderGeometry(0.09, 0.09, H + 0.9, 6), trs(x0 + 0.22, Y + (H + 0.9) / 2, z0 + 0.7));
  ctx.add(cyl(0.13, 0.13, 0.7, 8, m.metal, cx + 2.4, Y + H + 0.62, cz));
  ctx.add(cyl(0.22, 0.17, 0.14, 8, m.metalDark, cx + 2.4, Y + H + 1.02, cz));
  ctx.add(makeAircon({ x: x0 - 0.24, z: cz - 1.4, y: Y + 0.4, ry: -Math.PI / 2, w: 0.86, h: 0.6 }));

  for (const key of Object.keys(parts)) {
    if (!parts[key].length) continue;
    const mesh = new THREE.Mesh(bake(parts[key]),
      { wall: m.wallAlt, trim: m.trim, roof: m.roof, metal: m.metal }[key]);
    mesh.castShadow = mesh.receiveShadow = true;
    g.add(mesh);
    if (key === 'wall' || key === 'roof') hullOutline(mesh, { thickness: 0.003 });
  }
  ctx.collide(x0 - 0.15, z0 - 0.15, x1 + 0.15, z1 + 0.15, Y + H + 0.5);
  return g;
}

function buildLink(ctx, Y) {
  const m = mats();
  const g = new THREE.Group();
  g.name = 'schoolLink';
  ctx.add(g);

  const { x0, x1, z0, z1 } = LINK;
  const W = x1 - x0, D = z1 - z0;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const parts = { wall: [], trim: [], roof: [], metal: [] };
  const push = (k, geo, mx) => parts[k].push({ geometry: geo, matrix: mx });

  // ground level: a covered way, posts and a roof, open at the sides
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      push('metal', new THREE.CylinderGeometry(0.08, 0.09, 2.7, 8),
        trs(cx + sx * (W / 2 - 0.16), Y + 1.35, cz + sz * (D / 2 - 0.16)));
    }
  }
  push('trim', new THREE.BoxGeometry(W + 0.5, 0.24, D + 0.5), trs(cx, Y + 2.82, cz));
  // first floor: the enclosed bridge
  const FY = Y + 3.5;
  push('trim', new THREE.BoxGeometry(W + 0.3, 0.26, D + 0.3), trs(cx, FY - 0.13, cz));
  for (const sx of [-1, 1]) {
    push('wall', new THREE.BoxGeometry(0.22, 1.0, D), trs(cx + sx * (W / 2 - 0.11), FY + 0.5, cz));
    // the glazing above the spandrel
    const pane = box(0.05, 1.5, D - 0.2, m.glass, cx + sx * (W / 2 - 0.03), FY + 1.75, cz);
    pane.userData.noOutline = pane.userData.noShadow = true;
    g.add(pane);
    for (let k = 0; k <= 3; k++) {
      push('metal', new THREE.BoxGeometry(0.1, 1.6, 0.08), trs(cx + sx * (W / 2 - 0.02), FY + 1.75, cz - D / 2 + (D / 3) * k));
    }
    push('metal', new THREE.BoxGeometry(0.13, 0.09, D), trs(cx + sx * (W / 2 - 0.02), FY + 2.54, cz));
  }
  push('roof', new THREE.BoxGeometry(W + 0.44, 0.26, D + 0.44), trs(cx, FY + 2.74, cz));
  push('roof', new THREE.BoxGeometry(W + 0.44, 0.3, 0.15), trs(cx, FY + 3.0, cz - D / 2 - 0.14));
  push('roof', new THREE.BoxGeometry(W + 0.44, 0.3, 0.15), trs(cx, FY + 3.0, cz + D / 2 + 0.14));

  for (const key of Object.keys(parts)) {
    if (!parts[key].length) continue;
    const mesh = new THREE.Mesh(bake(parts[key]),
      { wall: m.wallAlt, trim: m.trim, roof: m.roof, metal: m.metal }[key]);
    mesh.castShadow = mesh.receiveShadow = true;
    g.add(mesh);
    if (key === 'wall' || key === 'roof') hullOutline(mesh, { thickness: 0.003 });
  }
  /* The four posts collide and the span does not: the ground level of a 渡り廊下 is
   * a covered way you walk *through*, and a box round the whole footprint would
   * make it a wall between the courtyard and the back yard. */
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const px = cx + sx * (W / 2 - 0.16);
      const pz = cz + sz * (D / 2 - 0.16);
      ctx.collide(px - 0.09, pz - 0.09, px + 0.09, pz + 0.09, Y + 2.7);
    }
  }
  ctx.collide(x0 - 0.1, z0, x1 + 0.1, z1, FY + 3.0, FY - 0.3, true);
  return g;
}

/* ------------------------------------------------------------------ *
 * 器材倉庫 -- the equipment store between the second block and the gym.
 * ------------------------------------------------------------------ */

function buildStore(ctx, Y) {
  const m = mats();
  const gm = groundMats();
  const g = new THREE.Group();
  g.name = 'schoolStore';
  ctx.add(g);

  const { x0, x1, z0, z1 } = STORE;
  const W = x1 - x0, D = z1 - z0;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const H = 3.2;
  const RH = 0.9;

  g.add(box(W + 0.3, 0.36, D + 0.3, m.concreteMid, cx, Y + 0.18, cz));
  const body = box(W, H, D, m.gymWall, cx, Y + H / 2, cz);
  body.castShadow = body.receiveShadow = true;
  g.add(body);
  hullOutline(body, { thickness: 0.003 });
  // a shallow single-pitch roof falling south, which is what a store shed has
  const roof = box(W + 0.7, 0.16, D + 0.7, m.gymRoof, cx, Y + H + RH / 2 + 0.08, cz);
  roof.rotation.x = -Math.atan2(RH, D + 0.7);
  roof.castShadow = roof.receiveShadow = true;
  g.add(roof);
  hullOutline(roof, { thickness: 0.003 });
  g.add(box(W + 0.16, 0.18, D + 0.16, m.trim, cx, Y + H, cz));

  /* the roll-up shutter on the courtyard side, half up.  Ribs rather than a
   * texture: the ink pass keeps them crisp and a map at this size goes to mush. */
  {
    const SW = 3.2, SH = 2.5;
    const sx = cx - 0.9;
    g.add(box(SW + 0.3, SH + 0.2, 0.1, m.metalDark, sx, Y + (SH + 0.2) / 2, z1 + 0.02));
    const ribs = [];
    const n = Math.round(SH * 0.55 / 0.11);
    for (let k = 0; k < n; k++) {
      ribs.push({ geometry: new THREE.BoxGeometry(SW, 0.09, 0.07), matrix: trs(sx, SH - k * 0.11, z1 + 0.08) });
    }
    const sm = new THREE.Mesh(bake(ribs), cel({ color: PAL.shutterLight, bands: 3, tint: 0x5c5680 }));
    sm.position.y = Y;
    sm.castShadow = true;
    g.add(sm);
    g.add(box(SW + 0.4, 0.24, 0.26, m.metal, sx, Y + SH + 0.24, z1 + 0.1));
    // what is behind a half-open shutter: the dark of the store
    const dark = box(SW - 0.1, SH * 0.45, 0.06, flat({ color: 0x3b3a48 }), sx, Y + SH * 0.225, z1 - 0.02);
    dark.userData.noOutline = true;
    g.add(dark);
  }

  // a personnel door on the gym side, the meter box, and the gutter
  g.add(box(0.1, 2.05, 0.95, cel({ color: 0x8a6f5c, bands: 3, tint: 0x5c5680 }), x1 + 0.03, Y + 1.02, cz - 1.6));
  ctx.add(makeAircon({ x: x0 - 0.24, z: cz + 1.2, y: Y + 0.4, ry: -Math.PI / 2, w: 0.8, h: 0.56 }));
  g.add(box(W + 0.6, 0.09, 0.09, m.metal, cx, Y + H + 0.02, z1 + 0.32));
  g.add(cyl(0.055, 0.055, H, 6, m.metal, x1 - 0.2, Y + H / 2, z1 + 0.3));

  // the name plate, and the equipment that lives outside it
  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 0.38, 0.08),
    [flat({ color: PAL.wallGray }), flat({ color: PAL.wallGray }),
     flat({ color: PAL.wallGray }), flat({ color: PAL.wallGray }),
     flat({ color: 0xffffff, map: schoolBlockPlate(2), cache: false }),
     flat({ color: PAL.wallGray })]
  );
  plate.position.set(cx + 1.6, Y + 2.62, z1 + 0.05);
  plate.castShadow = true;
  g.add(plate);

  ctx.add(makeCrates({ x: x1 + 1.0, z: z1 + 0.9, y: Y, n: 3, seed: 7741, ry: 0.3 }));
  ctx.add(makeBucket({ x: x0 + 0.7, z: z1 + 0.8, y: Y, ry: -0.4 }));
  ctx.add(makeBroom({ x: x0 + 0.4, z: z1 + 0.35, y: Y, ry: 0.35, lean: 0.16 }));
  ctx.add(makeHoseBox({ x: cx + 2.6, z: z1 + 0.06, y: Y + 0.8, ry: 0 }));

  ctx.collide(x0 - 0.2, z0 - 0.2, x1 + 0.2, z1 + 0.2, Y + H + RH);
  return g;
}

/* ------------------------------------------------------------------ *
 * 中庭 -- the courtyard.
 *
 * Thirteen metres by six and a half, enclosed on all four sides: the main block's
 * east flank, the annex, the second block, the store and the ground's west edge.
 * That enclosure is the whole reason the gym moved -- it stood exactly here.
 *
 * It is the one place on the site with no traffic through it and nothing
 * functional in it, which is what a 中庭 is for: two cherries in tree pits, the
 * boards, the refuse point, a drinking fountain, a bench, the small stone that
 * every Japanese school has somewhere with something carved on it, and the
 * loudspeaker on a pole that the whole school hears the bell through.
 * ------------------------------------------------------------------ */

function buildCourtyard(ctx, Y, rng, sakura, shrubs) {
  const m = mats();
  const gm = groundMats();
  const g = new THREE.Group();
  g.name = 'schoolCourtyard';
  ctx.add(g);
  const cx = (YARD.x0 + YARD.x1) / 2;
  const cz = (YARD.z0 + YARD.z1) / 2;

  // expansion joints, so six metres of pale concrete has a scale
  {
    const joints = [];
    for (let x = YARD.x0 + 2.6; x < YARD.x1 - 1.0; x += 2.6) {
      joints.push({ geometry: new THREE.BoxGeometry(0.07, 0.02, YARD.z1 - YARD.z0 - 0.4), matrix: trs(x, 0, cz) });
    }
    joints.push({ geometry: new THREE.BoxGeometry(YARD.x1 - YARD.x0 - 0.4, 0.02, 0.07), matrix: trs(cx, 0, cz) });
    const jm = new THREE.Mesh(bake(joints), gm.concreteMid);
    jm.position.y = Y + 0.075;
    jm.userData.noOutline = true;
    g.add(jm);
  }

  /* the two tree pits.  A pit and not a bed: this is paving, and a cherry in
   * paving stands in a square of soil with a stone kerb round it. */
  for (const [tx, tz, sc, sd] of [[YARD.x0 + 3.2, cz + 1.4, 1.16, 7751], [YARD.x1 - 3.6, cz - 1.2, 1.08, 7752]]) {
    const kerb = [];
    for (const s of [-1, 1]) {
      kerb.push({ geometry: new THREE.BoxGeometry(2.2, 0.2, 0.16), matrix: trs(tx, 0.1, tz + s * 1.02) });
      kerb.push({ geometry: new THREE.BoxGeometry(0.16, 0.2, 2.2), matrix: trs(tx + s * 1.02, 0.1, tz) });
    }
    const km = new THREE.Mesh(bake(kerb), gm.stone);
    km.position.y = Y + 0.07;
    km.castShadow = km.receiveShadow = true;
    g.add(km);
    const soil = box(1.9, 0.1, 1.9, cel({ color: PAL.dirt, bands: 3, tint: 0x7a7396 }), tx, Y + 0.11, tz);
    soil.receiveShadow = true;
    g.add(soil);
    ctx.collide(tx - 1.1, tz - 1.1, tx + 1.1, tz + 1.1, Y + 0.27);
    sakura.push({ x: tx, z: tz, y: Y + 0.16, scale: sc, seed: sd, lean: 0.09, leanDir: 2.2, collide: false });
  }

  /* the boards.  Two, and they face different ways on purpose: the club board
   * looks at the second block's door, the notice board at the passage in from the
   * forecourt, because those are the two directions anybody arrives from. */
  ctx.add(makeNoticeBoard({ ctx,
    x: YARD.x0 + 0.5, z: cz - 1.2, y: Y, ry: Math.PI / 2, w: 2.0, h: 1.2, y0: 0.9,
    sheets: [
      { map: clubPoster(1), x: -0.58, y: 0.04, w: 0.44, h: 0.6, tilt: 0.02 },
      { map: clubPoster(4), x: -0.06, y: -0.02, w: 0.44, h: 0.6, tilt: -0.02 },
      { map: clubPoster(2), x: 0.5, y: 0.05, w: 0.44, h: 0.6, tilt: 0.015 },
    ],
  }));
  ctx.add(makeNoticeBoard({ ctx,
    x: cx + 2.2, z: YARD.z0 + 0.5, y: Y, ry: 0, w: 1.7, h: 1.1, y0: 0.88,
    wood: 0x8a7a5c,
    sheets: [
      { map: gateNotice(), x: -0.4, y: 0.0, w: 0.44, h: 0.58, tilt: -0.02 },
      { map: clubPoster(5), x: 0.16, y: 0.03, w: 0.44, h: 0.58, tilt: 0.02 },
    ],
  }));

  /* the 記念碑: a small block of stone on a plinth with a bronze plate on it.
   * Every school has one and nobody remembers what it says. */
  {
    const sx = YARD.x1 - 1.4, sz = YARD.z1 - 1.4;
    const base = box(1.3, 0.22, 1.3, gm.stoneDark, sx, Y + 0.18, sz);
    base.castShadow = base.receiveShadow = true;
    g.add(base);
    const stone = new THREE.Mesh(new THREE.BoxGeometry(0.74, 1.15, 0.42), gm.stone);
    stone.position.set(sx, Y + 0.87, sz);
    stone.rotation.y = 0.24;
    stone.castShadow = stone.receiveShadow = true;
    g.add(stone);
    hullOutline(stone, { thickness: 0.0032 });
    const bronze = box(0.44, 0.3, 0.03, cel({ color: 0x9a7a4a, bands: 3, tint: 0x6a5a80 }), 0, 0.1, 0.22);
    bronze.position.set(sx + Math.sin(0.24) * 0.22, Y + 0.95, sz + Math.cos(0.24) * 0.22);
    bronze.rotation.y = 0.24;
    g.add(bronze);
    ctx.collide(sx - 0.7, sz - 0.7, sx + 0.7, sz + 0.7, Y + 1.5);
    shrubs.push({ x: sx - 1.4, z: sz - 0.2, y: Y + 0.07, r: 0.4, count: 3, spread: 0.9, seed: 7761 });
  }

  /* the refuse point, the drinking fountain, a bench, and the cleaning store's
   * buckets standing outside it */
  ctx.add(makeRecycleBox({ x: cx - 1.0, z: YARD.z0 + 0.9, y: Y + 0.07, ry: 0 }));
  ctx.add(makeVendBin({ x: cx - 2.4, z: YARD.z0 + 0.85, y: Y + 0.07, ry: 0 }));
  ctx.add(makeTapPost({ x: YARD.x1 - 0.9, z: cz + 1.6, y: Y + 0.07, ry: Math.PI / 2, h: 0.92 }));
  /* Both benches face **into** the 中庭, which means their `ry` is decided by
   * which half of it they stand in and not by a constant.  `makeBench` puts its
   * back at local -z, so `ry: 0` faces +z: the one on the south side gets 0 and
   * the one on the north gets PI.  They had it exactly the other way round, so
   * each of them sat you a metre from a wall looking at it. */
  ctx.add(makeBench({ x: YARD.x0 + 3.2, z: cz - 1.9, y: Y + 0.07, ry: 0, len: 1.8 }));
  ctx.add(makeBench({ x: YARD.x1 - 4.6, z: YARD.z1 - 0.9, y: Y + 0.07, ry: Math.PI, len: 1.6 }));
  ctx.add(makeBucket({ x: YARD.x0 + 0.9, z: YARD.z1 - 0.8, y: Y + 0.07, ry: 0.5 }));
  ctx.add(makeBroom({ x: YARD.x0 + 0.45, z: YARD.z1 - 1.3, y: Y + 0.07, ry: 1.2, lean: 0.2 }));
  makeLoosePaper(ctx, [
    { x: cx + 0.6, z: cz + 2.0, y: Y + 0.08, ry: 0.6, tilt: 0.02 },
    { x: cx + 1.1, z: cz + 2.4, y: Y + 0.08, ry: -1.1 },
  ]);

  /* the guide board at the way in from the forecourt, and the loudspeaker pole.
   * The speaker is the thing that makes a courtyard read as the middle of a
   * school rather than as a paved gap: it is what the bell comes out of. */
  // square to the wall it stands against, not angled: a board turned a few
  // degrees off its neighbours reads as one that has been knocked, not as one
  // aimed at anybody
  ctx.add(makeGuideBoard({ ctx, x: YARD.x0 + 1.1, z: YARD.z1 - 2.6, y: Y + 0.07, ry: Math.PI / 2 }));
  {
    const px = cx + 3.4, pz = cz + 2.2;
    const pole = cyl(0.06, 0.075, 4.6, 8, m.metal, px, Y + 2.3, pz);
    pole.castShadow = true;
    g.add(pole);
    g.add(cyl(0.12, 0.12, 0.12, 8, m.concreteMid, px, Y + 0.06, pz));
    for (const [a, r] of [[0.4, 0.28], [Math.PI + 0.6, 0.28]]) {
      const horn = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.22, 0.34, 10, 1, true),
        cel({ color: 0xd8d4d0, bands: 3, tint: 0x6a6288, side: THREE.DoubleSide }));
      horn.position.set(px + Math.sin(a) * r, Y + 4.3, pz + Math.cos(a) * r);
      horn.rotation.set(Math.PI / 2 - 0.2, a, 0);
      horn.castShadow = true;
      g.add(horn);
      g.add(box(0.06, 0.06, 0.3, m.metalDark, px + Math.sin(a) * 0.12, Y + 4.3, pz + Math.cos(a) * 0.12));
    }
    ctx.collide(px - 0.18, pz - 0.18, px + 0.18, pz + 0.18, Y + 4.6);
  }

  shadowify(g, true, true);
  return g;
}

/* ------------------------------------------------------------------ *
 * The back yard: the staff bays, the caretaker's end of the school, and the
 * 裏門 that lets it out onto ひばり山.
 * ------------------------------------------------------------------ */

function buildBackYard(ctx, Y, rng, shrubs) {
  const m = mats();
  const gm = groundMats();
  const g = new THREE.Group();
  g.name = 'schoolBackYard';
  ctx.add(g);

  /* --- 職員駐車場: four bays along the west wall, nose-in --- */
  {
    const bz = -68.6;
    for (let k = 0; k < 4; k++) {
      const bx = 12.6 + k * 2.6;
      laneLine(ctx, { axis: 'z', at: bx - 1.3, from: bz - 2.6, to: bz + 2.6, y: Y + 0.08 });
      if (k === 3) laneLine(ctx, { axis: 'z', at: bx + 1.3, from: bz - 2.6, to: bz + 2.6, y: Y + 0.08 });
      ctx.add(makeWheelStops({ x: bx, z: bz - 1.9, y: Y, ry: Math.PI, n: 1, gauge: 1.4 }));
    }
    laneLine(ctx, { axis: 'x', at: bz + 2.6, from: 11.3, to: 23.0, y: Y + 0.08 });
    ctx.add(makeSignPost({
      x: 11.4, z: bz + 3.4, y: Y, ry: -Math.PI / 2, h: 2.0,
      plates: [{ map: warningPlate(2), w: 0.42, h: 0.62, y: 1.5, double: true }],
    }));
    ctx.collide(11.24, bz + 3.24, 11.56, bz + 3.56, Y + 2.0);
  }

  /* --- 用務員室倉庫 and the switch room, against the west wall --- */
  ctx.add(makeStorageShed({ x: 13.4, z: -76.6, y: Y, ry: Math.PI / 2, w: 3.0, d: 2.2, h: 2.3, seed: 7781 }));
  ctx.collide(12.2, -77.8, 14.6, -75.4, Y + 2.5);
  {
    // the switch room: a low blockwork box with a steel door and a warning plate
    const sx = 20.4, sz = -76.4;
    const body = box(3.4, 2.6, 2.6, m.concreteMid, sx, Y + 1.3, sz);
    body.castShadow = body.receiveShadow = true;
    g.add(body);
    hullOutline(body, { thickness: 0.003 });
    g.add(box(3.7, 0.16, 2.9, gm.concrete, sx, Y + 2.68, sz));
    g.add(box(0.1, 2.0, 1.0, cel({ color: 0x9aa2ac, bands: 3, tint: 0x5c5680 }), sx + 1.72, Y + 1.0, sz + 0.5));
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.5, 0.34),
      [flat({ color: 0xffffff, map: warningPlate(1), cache: false }),
       flat({ color: PAL.wallGray }), flat({ color: PAL.wallGray }),
       flat({ color: PAL.wallGray }), flat({ color: PAL.wallGray }), flat({ color: PAL.wallGray })]
    );
    plate.position.set(sx + 1.75, Y + 2.1, sz - 0.7);
    g.add(plate);
    for (let k = 0; k < 3; k++) {
      g.add(box(2.6, 0.06, 0.06, m.metal, sx, Y + 0.55 + k * 0.5, sz - 1.34));
    }
    ctx.collide(sx - 1.9, sz - 1.5, sx + 1.9, sz + 1.5, Y + 2.85);
    ctx.add(makeAircon({ x: sx, z: sz - 1.6, y: Y + 1.5, ry: Math.PI, w: 0.8, h: 0.56 }));
  }
  // the refuse point, the tap and the clutter of a working yard
  ctx.add(makeGomiHouse({ ctx, x: 16.8, z: -82.0, y: Y, ry: Math.PI, w: 2.6, d: 1.6, seed: 7782 }));
  ctx.add(makeTapPost({ x: 22.4, z: -81.2, y: Y, ry: Math.PI, h: 0.88 }));
  ctx.add(makeCrates({ x: 12.6, z: -81.4, y: Y, n: 4, seed: 7783, ry: -0.22 }));
  ctx.add(makeMilkCrate({ x: 14.0, z: -82.2, y: Y, ry: 0.4, n: 3 }));
  ctx.add(makeBucket({ x: 21.4, z: -80.4, y: Y, ry: 0.9 }));
  makeLoosePaper(ctx, [
    { x: 19.0, z: -80.0, y: Y + 0.02, ry: 1.4 },
    { x: 19.6, z: -80.5, y: Y + 0.02, ry: -0.3, tilt: 0.03 },
  ]);

  /* --- 裏門: the gate onto the hill ---
   * A 2.8 m opening with a 1.6 m leaf standing open against the wall, so the way
   * through is real.  Every gate this world has built at 1.1-1.2 m turned out to
   * be a gate you can see through and not walk through, because `plotWall`'s
   * posts carry no collider and the player's own radius eats 0.68 m of any
   * opening.  1.8 m clear is the working minimum and this has 2.8. */
  {
    const gx = BACK_GATE_X;
    const PH = 2.2;
    for (const s of [-1, 1]) {
      const p = box(0.5, PH, 0.5, m.concrete, gx + s * 1.4, Y + PH / 2 - 0.05, Z_N);
      p.castShadow = p.receiveShadow = true;
      g.add(p);
      g.add(box(0.62, 0.1, 0.62, m.concreteMid, gx + s * 1.4, Y + PH + 0.0, Z_N));
      ctx.collide(gx + s * 1.4 - 0.3, Z_N - 0.3, gx + s * 1.4 + 0.3, Z_N + 0.3, Y + PH);
    }
    // the leaf, swung back flat against the inside of the wall
    const SW = 1.6, SH = 1.75;
    const leaf = [];
    leaf.push({ geometry: new THREE.BoxGeometry(SW, 0.07, 0.08), matrix: trs(SW / 2, SH - 0.04, 0) });
    leaf.push({ geometry: new THREE.BoxGeometry(SW, 0.07, 0.08), matrix: trs(SW / 2, 0.1, 0) });
    leaf.push({ geometry: new THREE.BoxGeometry(0.07, SH, 0.09), matrix: trs(0.04, SH / 2, 0) });
    leaf.push({ geometry: new THREE.BoxGeometry(0.07, SH, 0.09), matrix: trs(SW - 0.04, SH / 2, 0) });
    const nb = Math.round(SW / 0.19);
    for (let i = 1; i < nb; i++) {
      leaf.push({ geometry: new THREE.BoxGeometry(0.045, SH - 0.2, 0.045), matrix: trs((SW / nb) * i, SH / 2, 0) });
    }
    const lm = new THREE.Mesh(bake(leaf), m.metal);
    lm.position.set(gx + 1.5, Y, Z_N + 0.18);
    lm.rotation.y = -1.5;
    lm.castShadow = true;
    g.add(lm);
    hullOutline(lm, { thickness: 0.003 });
    // the apron through the opening, and the plate that says when it is locked
    pad(ctx, { x: gx, z: Z_N + 1.1, w: 3.4, d: 3.0, y: Y, mat: gm.concrete, name: 'backGateApron' });
    ctx.add(makeNoticeBoard({ ctx,
      x: gx - 2.5, z: Z_N + 1.6, y: Y, ry: 0.5, w: 1.4, h: 1.0, y0: 0.9, wood: 0x8a6f52,
      sheets: [{ map: trailNotice(3), x: 0, y: 0, w: 0.72, h: 0.56, tilt: 0.0 }],
    }));
    const np = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.3, 0.9),
      [flat({ color: 0xffffff, map: schoolBlockPlate(4), cache: false }),
       flat({ color: 0xffffff, map: schoolBlockPlate(4), cache: false }),
       flat({ color: PAL.wallGray }), flat({ color: PAL.wallGray }),
       flat({ color: PAL.wallGray }), flat({ color: PAL.wallGray })]
    );
    np.position.set(gx - 1.68, Y + 1.6, Z_N);
    g.add(np);
  }

  /* --- the service gate at x = 50, for the ground and the gym ---
   * Two leaves, both shut, because a vehicle gate is shut except when a lorry is
   * coming through -- and one that is open reads as an invitation to walk out
   * onto the hill-foot road, which is what the 裏門 is for. */
  {
    const gx = SERV_GATE_X;
    const PH = 2.3;
    for (const s of [-1, 1]) {
      const p = box(0.54, PH, 0.54, m.concrete, gx + s * 2.1, Y + PH / 2 - 0.05, Z_N);
      p.castShadow = p.receiveShadow = true;
      g.add(p);
      g.add(box(0.66, 0.1, 0.66, m.concreteMid, gx + s * 2.1, Y + PH, Z_N));
      ctx.collide(gx + s * 2.1 - 0.32, Z_N - 0.32, gx + s * 2.1 + 0.32, Z_N + 0.32, Y + PH);
    }
    const GW = 1.95, GH = 1.9;
    for (const s of [-1, 1]) {
      const leaf = [];
      leaf.push({ geometry: new THREE.BoxGeometry(GW, 0.08, 0.09), matrix: trs(0, GH - 0.05, 0) });
      leaf.push({ geometry: new THREE.BoxGeometry(GW, 0.08, 0.09), matrix: trs(0, 0.12, 0) });
      for (const e of [-1, 1]) {
        leaf.push({ geometry: new THREE.BoxGeometry(0.08, GH, 0.1), matrix: trs(e * (GW / 2 - 0.04), GH / 2, 0) });
      }
      const n = Math.round(GW / 0.2);
      for (let i = 1; i < n; i++) {
        leaf.push({ geometry: new THREE.BoxGeometry(0.05, GH - 0.2, 0.05), matrix: trs(-GW / 2 + (GW / n) * i, GH / 2, 0) });
      }
      leaf.push({ geometry: new THREE.BoxGeometry(GW * 0.97, 0.06, 0.05), matrix: trs(0, GH / 2, 0, 0, 0, 0.75) });
      const lm = new THREE.Mesh(bake(leaf), m.metal);
      lm.position.set(gx + s * (GW / 2 + 0.05), Y, Z_N);
      lm.castShadow = true;
      g.add(lm);
      hullOutline(lm, { thickness: 0.003 });
    }
    ctx.collide(gx - 2.1, Z_N - 0.12, gx + 2.1, Z_N + 0.12, Y + GH);
    pad(ctx, { x: gx, z: Z_N + 2.2, w: 5.2, d: 5.0, y: Y, mat: gm.asphaltWorn, name: 'servGateApron' });
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.62, 0.05),
      [flat({ color: PAL.wallGray }), flat({ color: PAL.wallGray }),
       flat({ color: PAL.wallGray }), flat({ color: PAL.wallGray }),
       flat({ color: 0xffffff, map: warningPlate(1), cache: false }),
       flat({ color: PAL.wallGray })]
    );
    plate.position.set(gx - 1.0, Y + 1.4, Z_N + 0.09);
    g.add(plate);
  }

  // a hedge softening the yard's edge against the second block's gable
  shrubs.push({ x: 23.4, z: -74.4, y: Y, r: 0.5, count: 4, spread: 1.5, seed: 7791 });
  shrubs.push({ x: 12.4, z: -73.2, y: Y, r: 0.46, count: 3, spread: 1.3, seed: 7792 });

  shadowify(g, true, true);
  return g;
}

/* ------------------------------------------------------------------ *
 * 自転車置場 -- the bike shed.  Sixteen bicycles parked in two neat rows
 * is the single strongest signal that this school is in use.
 * ------------------------------------------------------------------ */

function buildBikeShed(ctx, Y, rng) {
  const m = mats();
  const g = new THREE.Group();
  g.name = 'bikeShed';
  ctx.add(g);

  const x0 = 12.2, x1 = 23.4, z0 = -65.0, z1 = -60.4;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const H = 2.35;

  const posts = [];
  for (let i = 0; i <= 4; i++) {
    const px = x0 + ((x1 - x0) / 4) * i;
    for (const pz of [z0 + 0.4, z1 - 0.4]) {
      posts.push({ geometry: new THREE.CylinderGeometry(0.075, 0.085, H, 7), matrix: trs(px, H / 2, pz) });
    }
    posts.push({ geometry: new THREE.BoxGeometry(0.09, 0.09, z1 - z0 - 0.8), matrix: trs(px, H - 0.1, cz) });
  }
  const pm = new THREE.Mesh(bake(posts), m.metalDark);
  pm.name = 'openFrame';
  pm.castShadow = true;
  pm.position.y = Y;
  g.add(pm);

  // corrugated roof: ribs rather than a texture, which stays crisp under cel
  const ribs = [];
  const ribN = Math.round((x1 - x0) / 0.34);
  for (let i = 0; i < ribN; i++) {
    ribs.push({
      geometry: new THREE.BoxGeometry(0.17, 0.09, z1 - z0 + 0.5),
      matrix: trs(x0 + ((x1 - x0) / ribN) * (i + 0.5), 0, cz),
    });
  }
  const roof = new THREE.Mesh(bake(ribs), cel({ color: 0xbfc4cc, bands: 3, tint: 0x6a6288 }));
  roof.position.set(0, Y + H + 0.12, 0);
  roof.rotation.x = -0.05;
  roof.castShadow = roof.receiveShadow = true;
  g.add(roof);
  const deck = box(x1 - x0 + 0.4, 0.08, z1 - z0 + 0.6, cel({ color: 0xa8adb8, bands: 3, tint: 0x655d84 }), cx, Y + H + 0.04, cz);
  deck.castShadow = true;
  g.add(deck);
  hullOutline(deck, { thickness: 0.003 });

  /* Wheel gutters and the bikes in them.  1.55 in from each end wall rather
   * than 1.15: the bikes stand nose-out, so at 1.15 the front wheel of every
   * bike opposite a stanchion was inside it. */
  /* `F`, not `Y`.  The shed stands on its own concrete floor and the floor is
   * 0.07 m thick, so a bicycle seated on the site grade is a bicycle sunk to
   * the axle -- the `groundY(z) is not the ground` trap, in the one place in
   * this module where a slab was laid under something after the fact. */
  const F = ctx.groundAt(cx, cz);
  for (const rz of [z0 + 1.55, z1 - 1.55]) {
    g.add(box(x1 - x0 - 0.6, 0.09, 0.16, m.concreteMid, cx, F + 0.045, rz));
  }
  ctx.add(makeBikeRack({ x: cx - 0.4, z: z0 + 1.55, y: F, n: 13, spacing: 0.7, ry: Math.PI / 2, seed: 3, keep: true, ctx }));
  ctx.add(makeBikeRack({ x: cx - 0.4, z: z1 - 1.55, y: F, n: 12, spacing: 0.7, ry: -Math.PI / 2, seed: 6, keep: true, ctx }));

  for (let i = 0; i <= 4; i++) {
    const px = x0 + ((x1 - x0) / 4) * i;
    ctx.collide(px - 0.09, z0 + 0.31, px + 0.09, z0 + 0.49, Y + H);
    ctx.collide(px - 0.09, z1 - 0.49, px + 0.09, z1 - 0.31, Y + H);
  }
  ctx.collide(x0 - 0.2, z0 - 0.3, x1 + 0.2, z1 + 0.3, Y + H + 0.22, Y + H - 0.04, true);
  return g;
}
