import * as THREE from 'three';
import { PAL } from '../core/palette.js';
import { cel, flat } from '../core/toon.js';
import {
  canalPlate, bridgePlate, warningPlate, parkSign, sluicePlate,
  ankyoPlate, gaugeBoard,
} from '../core/textures.js';
import { box, cyl, bake, trs, rngKit, clamp } from '../core/util.js';
import { hullOutline } from '../core/outline.js';
import { centerX, groundY, makeStrip, ROAD_HALF, WALK_W, WALK_H, TERRAIN_DROP } from './street.js';
import { CANAL, CANAL_X0, CANAL_X1 } from './landform.js';
import { pad, railing, steps, groundMats } from './ground.js';
import { addVending } from './vending.js';
import {
  makeBench, makeSignPost, makeVendBin, makeBikeRack, makePetBowl, makeCrow,
  makeBucket, makeLoosePaper, makePlanter, makeCrates,
} from './props.js';

/* ------------------------------------------------------------------ *
 * 用水路 -- the drainage channel.
 *
 * Every Japanese suburb has one of these: a concrete-lined watercourse
 * running dead straight behind the houses, with a two-metre service path
 * either side that everybody uses as a shortcut.  It earns its place here
 * for three reasons.
 *
 *  - It is the only *open* space in the world.  Everywhere else is closed by
 *    frontage; this is a straight line and low planting for as far as you can
 *    see, which is what makes the rest read as dense.
 *  - It is across the tracks, so getting to it means going through the level
 *    crossing.  The world gets bigger by using what is already there.
 *  - From the footbridge you look back up a two-metre slot between two
 *    houses at the railway.  A train crossing that slot for half a second is
 *    worth more than any amount of open sight line.
 *
 * It now circles the planet, exactly like the railway and for exactly the
 * same reason: authored as a straight line of constant z spanning one full
 * circumference in x, the equirectangular bake closes it into a seamless
 * latitude circle.  Three things follow from that, and all three are the
 * reason this file looks the way it does:
 *
 *  - **The civil works run the whole way round; the dressing does not.**
 *    Revetment, bed, coping, bank slabs, service paths and water go all the
 *    way; railings, planting, reeds, furniture and signage stop at `D_W` and
 *    `D_E`.  Same division as `railway.js`: track everywhere, station and
 *    fencing only where the district is.
 *  - **The bank slabs are what seal the excavation**, and the excavation is
 *    now a continuous band right round the world (`landform.js`).  Any gap
 *    left in the slabs is a hole through the planet, so every gap has to be
 *    filled by something else -- which is what the road bridge is for.
 *  - **The street crosses it.**  That is not optional: a ring at z = -24 has
 *    to meet a road running along z somewhere.  The made ground is dead flat
 *    at `Y0` because the natural grade falls three quarters of a metre across
 *    the corridor, and the carriageway is *not* flat -- it climbs 0.64 m over
 *    the twelve metres of bank.  So every bank layer stops for the road and
 *    こばと橋 takes over: graded fill either side, a deck over the channel,
 *    parapets, edge upstands, and two steps where the south bank drops onto
 *    the apron.
 *
 * The channel is a genuine excavation -- see `landform.js` for the hole it
 * needs in the terrain grid and the planet sphere, and `index.js` for the
 * matching *cut* in the height query, without which the player walks the
 * north bank floating a quarter of a metre above it.
 *
 * The water, by contrast, is unashamedly a stylisation: flat blocks of sky,
 * a scatter of petals, and a pale streak in the train's own colours that
 * sweeps the surface as it passes.  The train is twenty-four metres away
 * behind two rows of houses, so an argued reflection would be nothing at
 * all; a painted one is the whole point of the shot.
 * ------------------------------------------------------------------ */

const Z_C = CANAL.z;
const HALF = CANAL.half;         // 2.5 -- half the channel's top width
const DEPTH = CANAL.depth;       // 1.75
const Y0 = groundY(Z_C);         // the graded bank level, ~0.65 m

/**
 * **The channel is a reach between two ranges, not a ring.**
 *
 * It was one exact circumference so that the equirectangular bake closed it with
 * no seam, the same trick the railway still uses.  What that produced once
 * `hills.js` existed was a flat 28 m corridor sawn clean through ひばり山 at both
 * tunnel longitudes -- the range 9-10 m high either side, dead level in between,
 * and a bare concrete channel down the middle of the gap.  It is now bounded to
 * the reach between the two ranges, and `hills.js` closes its corridor everywhere
 * else so the hills join over the line they used to be cut by.
 *
 * The two numbers live in `landform.js` because the *hole* is the thing that has
 * to agree with them, and the hills read them from there too.  Every layer below
 * that used to run the full ring now runs this reach; everything that was already
 * bounded to the dressed stretch is untouched.
 *
 * `X_MID` matters: the revetment, the bed and the water surface are single boxes
 * `L` long, and they were centred on x = 0 because a ring centred anywhere else
 * is the same ring.  A reach is not -- leave them at 0 and the whole channel is
 * drawn 4 m out of position, which is the one silent way to get this wrong.
 */
const X_MIN = CANAL_X0;
const X_MAX = CANAL_X1;
const X_MID = (X_MIN + X_MAX) / 2;
/** How much concrete runs past each end, to seal the hole's own overshoot. */
const END_TAIL = 3.2;
/** Headwall thickness in x.  The water stops at its inside face. */
const HW_T = 0.75;
/** The dressed stretch: everything outside it is bare channel. */
const D_W = -58.0;
const D_E = 44.0;

const WALL_IN = HALF - 0.34;     // inner face of the revetment
const SLAB_OUT = 6.0;            // outer edge of the made ground
const PATH_OUT = 4.6;            // outer edge of the walking surface
const WATER_Y = Y0 - 1.15;
const BED_Y = Y0 - DEPTH + 0.28;

const FOOT_X = -22.5;            // ひばり橋, the footbridge
const CROSS_X = 17.5;            // なかて橋, the plain slab crossing
const SLUICE_X = 29.5;           // the distribution gate

/* Where the street crosses.  The gap is the road corridor's whole sweep
 * across the twelve metres of made ground -- `centerX` drifts 2.0 m over it,
 * from 2.57 at z = -30 to 0.57 at z = -18 -- plus an apron either side. */
const RD0 = -4.7;
const RD1 = 7.9;
/**
 * Bank layers, as x runs that stop for the road bridge.
 *
 * They reach `END_TAIL` past each end of the reach on purpose: the slabs are what
 * seal the excavation, and `cutTrench` drops any triangle with a corner inside the
 * footprint, so each hole overshoots its bound by up to one facet of whichever
 * surface it is cutting.  The tail is buried -- `hills.js` has the field over 0.2 m
 * within a metre of the bound and over 0.6 m within three -- so it costs nothing
 * to see and it means the seal does not depend on a grid column landing exactly on
 * the bound.
 */
const BANK_RUNS = [[X_MIN - END_TAIL, RD0], [RD1, X_MAX + END_TAIL]];
/**
 * The same runs for the *height query*, and they stop at the reach itself.
 *
 * `ctx.cut` lowers the ground to `Y0`, which is right over the excavation (the
 * north bank's natural grade stands 0.34 m above the made ground) and wrong over
 * the tails, where the ground is not excavated at all -- a cut there is a 3.2 m
 * dip in front of each headwall that nothing explains.
 */
const CUT_RUNS = [[X_MIN, RD0], [RD1, X_MAX]];
/** The dressed part of the same, for railings and verges. */
const DRESS_RUNS = [[D_W, RD0], [RD1, D_E]];

/* The openings in the channel-edge barrier.
 *
 * There are *four* crossings, and every one of them needs a hole in the barrier
 * or it is decoration: the flood fill found the slab crossing and the sluice
 * walkway both walled off behind a 0.95 m collider, which is exactly the class
 * of mistake that left four of the six districts unreachable on the first pass.
 * Add a crossing, add it here. */
const OPENINGS = [
  [FOOT_X - 1.8, FOOT_X + 1.8],
  [RD0, RD1],
  [CROSS_X - 1.5, CROSS_X + 1.5],
  [SLUICE_X - 0.9, SLUICE_X + 0.9],
];

const M = {};
function mats() {
  if (M.concrete) return M;
  M.concrete = cel({ color: PAL.concrete, bands: 3, tint: 0x6f6790 });
  M.concreteMid = cel({ color: PAL.concreteMid, bands: 3, tint: 0x6a6288 });
  M.concreteDark = cel({ color: PAL.concreteDark, bands: 3, tint: 0x655d84 });
  M.metal = cel({ color: PAL.metal, bands: 3, tint: 0x666090 });
  M.metalDark = cel({ color: PAL.metalDark, bands: 3, tint: 0x5c5680 });
  M.rust = cel({ color: 0x9c7a62, bands: 3, tint: 0x6a5a80 });
  M.white = cel({ color: PAL.lineWhite, bands: 2, tint: 0x8e86ad });
  M.grass = cel({ color: PAL.grass, bands: 3, tint: 0x5b6f8c });
  M.moss = cel({ color: PAL.moss, bands: 3, tint: 0x5b6f8c });
  return M;
}

/**
 * The bridge's sub-base: the terrain grade, and 20 mm under it.
 *
 * The asphalt carries on over the bridge at `groundY + 0.012` like everywhere
 * else, so this is what the deck's own top has to be -- the level the grass
 * either side of the excavation arrives at, less enough that the two do not
 * fight at a grazing angle.  It was written as a flat `groundY - 0.095` when
 * the terrain grid was 75 mm down; both halves now come from `TERRAIN_DROP`.
 */
const GRADE = (z) => groundY(z) - TERRAIN_DROP - 0.02;

/**
 * A solid swept along z, every face following two functions of z.
 *
 * `xAt(z)` is the centreline and `halfT` the half thickness; `baseAt(z)` and
 * `topAt(z)` are the underside and the top.  Returns loose geometries in world
 * space, ready to hand to `bake()`.
 *
 * Emitted as quad strips rather than as a run of boxes, and that is not a
 * refinement -- it is the difference between a bridge and a pile of blocks.
 * The road drifts 1.19 m in x *and* falls 0.53 m in y across the seven metres
 * this thing spans, so a run of boxes steps both ways at once: the first
 * attempt used eight 0.85 m panels for each parapet and twelve for the deck,
 * and what came out was a row of separate concrete slabs above an apron that
 * read as a flight of shallow stairs, with the ink pass outlining every step.
 * A parapet is one continuous casting and has to be built as one.
 */
function sweptSolid({ xAt, halfT, baseAt, topAt, z0, z1, step = 0.7, ends = true }) {
  const geos = [];
  // the two side faces; a non-flipped vertical strip faces -x
  for (const s of [-1, 1]) {
    geos.push(makeStrip({
      z0, z1, step, flip: s > 0,
      a: (z) => ({ x: xAt(z) + s * halfT, y: baseAt(z) }),
      b: (z) => ({ x: xAt(z) + s * halfT, y: topAt(z) }),
    }));
  }
  // top, then underside
  geos.push(makeStrip({
    z0, z1, step,
    a: (z) => ({ x: xAt(z) - halfT, y: topAt(z) }),
    b: (z) => ({ x: xAt(z) + halfT, y: topAt(z) }),
  }));
  geos.push(makeStrip({
    z0, z1, step, flip: true,
    a: (z) => ({ x: xAt(z) - halfT, y: baseAt(z) }),
    b: (z) => ({ x: xAt(z) + halfT, y: baseAt(z) }),
  }));
  if (ends) {
    for (const z of [z0, z1]) {
      const g = new THREE.PlaneGeometry(halfT * 2, topAt(z) - baseAt(z));
      if (z === z0) g.rotateY(Math.PI);
      g.translate(xAt(z), (baseAt(z) + topAt(z)) / 2, z);
      geos.push(g);
    }
  }
  return geos;
}

/** `bake()` the result of one or more `sweptSolid` calls into one mesh. */
function sweptMesh(geos, mat) {
  const mesh = new THREE.Mesh(bake(geos.map((geometry) => ({ geometry }))), mat);
  geos.forEach((g) => g.dispose());
  return mesh;
}

export function buildCanal(ctx, train) {
  const m = mats();
  const gm = groundMats();
  const rng = rngKit(3371);
  const sakura = [];
  const shrubs = [];
  const grove = [];
  const petals = [];

  /* The revetment and the bed run the tails too, so their own end faces are
   * buried under the closing hill rather than landing in the same plane as the
   * headwall that seals the reach -- two coplanar faces at the one place in this
   * world where somebody stands and looks straight at them. */
  const L = X_MAX - X_MIN + 2 * END_TAIL;

  /* ------------------------------ the made ground ------------------------------ *
   * One thick slab per side, spanning from the revetment out past the hole in
   * the terrain, so the excavation is sealed on both flanks.  Its top is the
   * bank level; its underside is deep enough to meet the natural grade on the
   * low (south) side.  Two runs per side, because the road bridge occupies the
   * middle -- see the module header. */
  {
    const parts = [];
    for (const s of [-1, 1]) {
      const zc = Z_C + s * ((HALF + SLAB_OUT) / 2);
      for (const [x0, x1] of BANK_RUNS) {
        parts.push({
          geometry: new THREE.BoxGeometry(x1 - x0, 0.9, SLAB_OUT - HALF),
          matrix: trs((x0 + x1) / 2, Y0 - 0.45, zc),
        });
      }
    }
    const slab = new THREE.Mesh(bake(parts), m.concreteMid);
    slab.receiveShadow = true;
    slab.name = 'canalBankSlab';
    ctx.add(slab);
  }

  /* The matching cut in the height query.  `heightAt` has no idea the ground
   * has been excavated -- it answers with the natural grade, which on the north
   * bank stands up to 0.34 m *above* the made ground, so without this the
   * player walks the north service path floating over it.  Gapped at the road,
   * where the natural grade is the right answer because the bridge carries the
   * carriageway at it. */
  for (const [x0, x1] of CUT_RUNS) {
    ctx.cut({ x0, x1, z0: Z_C - SLAB_OUT - 0.1, z1: Z_C + SLAB_OUT + 0.1, top: Y0 });
  }

  /* ------------------------------- the revetment ------------------------------- *
   * Walls and bed run the whole ring: the bridge sits on top of them rather
   * than replacing them. */
  {
    const parts = [];
    const push = (geo, mx) => parts.push({ geometry: geo, matrix: mx });
    for (const s of [-1, 1]) {
      push(new THREE.BoxGeometry(L, DEPTH, 0.34), trs(X_MID, Y0 - DEPTH / 2, Z_C + s * (HALF - 0.17)));
    }
    push(new THREE.BoxGeometry(L, 0.28, WALL_IN * 2), trs(X_MID, BED_Y - 0.14, Z_C));
    const body = new THREE.Mesh(bake(parts), m.concreteMid);
    body.receiveShadow = true;
    body.name = 'canalChannel';
    ctx.add(body);

    /* Coping along both lips, a shade lighter.
     *
     * Dressed stretch only, and that is a cost decision rather than a taste
     * one.  Bending a 500 m box onto the sphere with 4 m facets costs about
     * fifteen thousand triangles *per box*, and this layer, the service paths
     * and the retaining kerb are five hundred metres of detail nobody is ever
     * within sight of.  Dropping them off the remote ring saved 134 000
     * triangles, which is a fifth of the whole scene; the revetment and the
     * bank slabs stay because one is the channel and the other is what stops
     * the excavation showing through to space.  Out there the lip is simply
     * the wall top flush with the slab, which is what a bare concrete channel
     * through a bare field actually looks like.
     *
     * It also stops for the road, where the bridge deck is the lip instead:
     * at 0.73 the coping would otherwise stand 8 mm through the deck and
     * z-fight it along its whole length. */
    const cope = [];
    for (const s of [-1, 1]) {
      for (const [x0, x1] of DRESS_RUNS) {
        cope.push({
          geometry: new THREE.BoxGeometry(x1 - x0, 0.16, 0.56),
          matrix: trs((x0 + x1) / 2, Y0 + 0.08, Z_C + s * (HALF - 0.05)),
        });
      }
    }
    const cm = new THREE.Mesh(bake(cope), m.concrete);
    cm.receiveShadow = true;
    // a 60 mm overhang against a 33 mm shadow texel gives sawtooth, not a line
    cm.castShadow = false;
    ctx.add(cm);

    // weep holes and the green tide line, over the dressed stretch only
    const holes = [];
    for (let x = D_W + 3; x < D_E - 3; x += 4.6) {
      if (x > RD0 - 1 && x < RD1 + 1) continue;
      for (const s of [-1, 1]) {
        holes.push({
          geometry: new THREE.BoxGeometry(0.24, 0.18, 0.06),
          matrix: trs(x, Y0 - 0.62, Z_C + s * (WALL_IN + 0.03)),
        });
      }
    }
    ctx.add(new THREE.Mesh(bake(holes), m.concreteDark));

    {
      const parts2 = [];
      for (const s of [-1, 1]) {
        for (const [x0, x1] of DRESS_RUNS) {
          parts2.push({
            geometry: new THREE.BoxGeometry(x1 - x0, 0.22, 0.03),
            matrix: trs((x0 + x1) / 2, WATER_Y + 0.1, Z_C + s * (WALL_IN - 0.02)),
          });
        }
      }
      const algae = new THREE.Mesh(bake(parts2), cel({ color: 0x7d9c7a, bands: 2, tint: 0x5b6f8c }));
      algae.userData.noOutline = true;
      ctx.add(algae);
    }

    /* The player must not be able to step in.
     *
     * This used to stand at Y0 + 0.3, which `_resolve` skips outright: a
     * collider whose top is within one step of the feet is ignored, and 0.3 m
     * above a path 0.06 m up is well inside a 0.38 m step.  What actually kept
     * anybody out of the water was the railing, so the moment the channel ran
     * past the end of the railings there was nothing there at all -- and
     * `heightAt` answers with the bank level over the whole footprint, so
     * stepping off the coping put you standing on air above the water rather
     * than in it.  The pipe `railing()` on the dressed bank is the barrier now.
     * A 0.95 m wall under those rails filled every bay a knife-edge line is
     * aimed at. */
  }

  /* ------------------------------- the water ------------------------------- */
  const water = buildWater(ctx, train);

  /* --------------------------------- the paths --------------------------------- */
  for (const s of [-1, 1]) {
    const bz = Z_C + s * ((HALF + PATH_OUT) / 2);
    // dressed stretch only; see the note on the coping above.  Outside it the
    // bank slab's own top is the walking surface, and the cut registered on it
    // means the height query agrees.
    for (const [x0, x1] of DRESS_RUNS) {
      pad(ctx, {
        x: (x0 + x1) / 2, z: bz, w: x1 - x0, d: PATH_OUT - HALF,
        y: Y0, h: 0.06, mat: gm.concrete, name: 'canalPath',
      });
    }
    // grass on the outer strip of the made ground, over the dressed stretch
    const gz = Z_C + s * ((PATH_OUT + SLAB_OUT) / 2);
    for (const [x0, x1] of DRESS_RUNS) {
      pad(ctx, {
        x: (x0 + x1) / 2, z: gz, w: x1 - x0, d: SLAB_OUT - PATH_OUT,
        y: Y0, h: 0.05, mat: m.grass, name: 'canalVerge',
      });
    }
    // railing along the water side, broken where each bridge lands
    for (const [x0, x1] of splitRuns(DRESS_RUNS, [
      [FOOT_X - 2.6, FOOT_X + 2.6], [CROSS_X - 2.0, CROSS_X + 2.0], [SLUICE_X - 2.2, SLUICE_X + 2.2],
    ])) {
      if (x1 - x0 < 1.2) continue;
      railing(ctx, {
        axis: 'x', at: Z_C + s * (HALF + 0.26), from: x0, to: x1, y: Y0 + 0.06, h: 1.0, spacing: 2.0,
      });
    }
  }

  /* On the north side the natural ground stands a third of a metre above the
   * made bank, so it gets a retaining kerb; on the south it falls away and
   * the slab's own face does the job. */
  {
    const kz = Z_C - SLAB_OUT;
    /* One opening, at こばと橋's east approach.  The kerb is 0.62 m of concrete
     * and the bank behind it is 0.37 m below the road verge, so between them
     * they made the towpath unreachable from the bridge head -- you could see
     * the water from the pavement and there was no way down to it for forty
     * metres in either direction.  `gakkomae.js` builds a three-tread flight
     * through this gap; the kerb ends in a return either side of it so it reads
     * as an opening rather than as concrete that stops. */
    const GAPS = [[7.95, 10.45]];
    const runs = [];
    for (const [x0, x1] of DRESS_RUNS) {
      let cuts = [[x0, x1]];
      for (const [g0, g1] of GAPS) {
        cuts = cuts.flatMap(([a, b]) => (g1 <= a || g0 >= b ? [[a, b]] : [[a, g0], [g1, b]]));
      }
      for (const [a, b] of cuts) if (b - a > 0.3) runs.push([a, b]);
    }
    const parts = [];
    for (const [x0, x1] of runs) {
      parts.push({
        geometry: new THREE.BoxGeometry(x1 - x0, 0.62, 0.3),
        matrix: trs((x0 + x1) / 2, Y0 + 0.31, kz),
      });
      ctx.collide(x0, kz - 0.2, x1, kz + 0.16, Y0 + 0.62);
    }
    // the returns that finish the run each side of the opening
    for (const [g0, g1] of GAPS) {
      for (const gx of [g0, g1]) {
        parts.push({ geometry: new THREE.BoxGeometry(0.3, 0.66, 0.62), matrix: trs(gx, Y0 + 0.33, kz - 0.16) });
      }
    }
    const kerb = new THREE.Mesh(bake(parts), m.concrete);
    kerb.castShadow = kerb.receiveShadow = true;
    ctx.add(kerb);
  }

  /* --------------------------------- crossings --------------------------------- */
  buildFootbridge(ctx);
  buildRoadBridge(ctx);
  buildSlabCrossing(ctx);
  buildSluice(ctx);

  /* ---------------------------------- the ends ---------------------------------- */
  buildHeadwall(ctx, { end: 'W' }, shrubs, grove);
  buildHeadwall(ctx, { end: 'E' }, shrubs, grove);

  /* ------------------------------------------------------------------ *
   * The quiet corner.
   *
   * One vending machine standing on its own beside a canal, two benches and
   * a lamp is an entire mood, and it costs nothing.  It sits on a widening
   * of the north path, so it has somewhere to be.
   * ------------------------------------------------------------------ */
  {
    const qz = Z_C - (PATH_OUT + 0.6);
    pad(ctx, { x: -27.6, z: qz, w: 11.0, d: 1.9, y: Y0 + 0.02, h: 0.06, mat: gm.concrete, name: 'canalCorner' });
    const qy = Y0 + 0.08;
    addVending(ctx, { x: -31.2, z: qz - 0.2, y: qy, ry: 0, variant: 0, seed: 41 });
    ctx.add(makeVendBin({ x: -30.1, z: qz - 0.2, y: qy, ry: 0 }));
    ctx.add(makeBench({ x: -27.8, z: qz + 0.1, y: qy, ry: 0, len: 1.8 }));
    ctx.add(makeBench({ x: -24.4, z: qz + 0.1, y: qy, ry: Math.PI, len: 1.8 }));
    ctx.add(makePetBowl({ x: -32.4, z: qz + 0.3, y: qy, ry: 0.3 }));
    ctx.add(makeBucket({ x: -32.9, z: qz - 0.4, y: qy, ry: 0.5, tilt: 0.05 }));
    makeLoosePaper(ctx, [
      { x: -25.6, z: qz + 0.7, y: qy + 0.01, ry: 0.8 },
      { x: -24.9, z: qz + 1.2, y: qy + 0.01, ry: -0.3 },
    ]);

    /* the lamp: one tall standard, the only light for fifty metres */
    const lx = -33.8;
    const post = cyl(0.06, 0.075, 4.2, 8, m.metalDark, lx, qy + 2.1, qz - 0.3);
    post.castShadow = true;
    ctx.add(post);
    hullOutline(post, { thickness: 0.0032 });
    ctx.add(cyl(0.14, 0.17, 0.2, 8, m.concreteMid, lx, qy + 0.1, qz - 0.3));
    ctx.add(box(0.06, 0.06, 0.7, m.metalDark, lx, qy + 4.18, qz + 0.05));
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.24, 12, 1, true), m.metal);
    shade.position.set(lx, qy + 4.06, qz + 0.4);
    ctx.add(shade);
    ctx.add(box(0.24, 0.05, 0.24, flat({ color: 0xfff2d0 }), lx, qy + 3.92, qz + 0.4));
    ctx.collide(lx - 0.2, qz - 0.5, lx + 0.2, qz - 0.1, qy + 4.2);

    ctx.add(makeSignPost({
      x: -35.6, z: qz + 0.2, y: Y0, ry: 0.35, h: 2.0,
      plates: [{ map: parkSign(), w: 0.8, h: 0.6, y: 1.5 }],
    }));
    // clear of the channel's retaining kerb: the bikes point at it, so it is a
    // wheelbase that has to fit, not a handlebar
    ctx.add(makeBikeRack({ x: -22.2, z: qz + 0.5, y: qy + 0.045, n: 3, spacing: 0.64, ry: Math.PI / 2, seed: 51 }));
  }

  /* --------------------- the works store on the east stretch --------------------- *
   * The eastern half is farmland edge rather than street, so what it gets is
   * what an irrigation authority leaves lying about: a run of spare concrete
   * channel sections and a stack of crates on the verge.  It is also the one
   * thing that gives the walk out to the sluice a middle. */
  {
    const wx = 22.4;
    const wz = Z_C - (PATH_OUT + 0.9);
    pad(ctx, { x: wx, z: wz, w: 5.2, d: 1.7, y: Y0 + 0.02, h: 0.05, mat: gm.gravel, name: 'canalStore' });
    const pipes = [];
    for (let i = 0; i < 5; i++) {
      const r = 0.21;
      const px = wx - 1.6 + (i % 3) * 0.46;
      const py = Y0 + 0.09 + r + ((i / 3) | 0) * 0.42;
      const pz = wz + (((i / 3) | 0) ? 0.06 : -0.06);
      pipes.push({
        geometry: new THREE.CylinderGeometry(r, r, 1.1, 9, 1, true),
        matrix: trs(px, py, pz, 0, 0, Math.PI / 2),
      });
      const t = 0.05;
      const halfL = 0.55;
      ctx.collide(px - halfL, pz - r, px + halfL, pz + r, py - r + t, py - r, true);
      ctx.collide(px - halfL, pz - r, px + halfL, pz + r, py + r, py + r - t, true);
      ctx.collide(px - halfL, pz - r, px + halfL, pz - r + t, py + r, py - r, true);
      ctx.collide(px - halfL, pz + r - t, px + halfL, pz + r, py + r, py - r, true);
    }
    const pm = new THREE.Mesh(bake(pipes),
      cel({ color: PAL.concreteMid, bands: 3, side: THREE.DoubleSide, tint: 0x6a6288 }));
    pm.castShadow = pm.receiveShadow = true;
    pm.name = 'openFrame';
    ctx.add(pm);
    ctx.add(makeCrates({ x: wx + 1.5, z: wz - 0.1, y: Y0 + 0.07, n: 3, seed: 3382, ry: 0.22 }));
    ctx.add(makeSignPost({
      x: wx + 2.4, z: wz + 0.5, y: Y0 + 0.02, ry: 2.6, h: 1.7,
      plates: [{ map: warningPlate(0), w: 0.34, h: 0.68, y: 1.35, double: true }],
    }));
  }

  /* ------------------------- warning plates along the water ------------------------- */
  for (const [x, s] of [[-14.0, 1], [-38.0, -1], [-49.0, 1], [12.6, 1], [34.4, -1]]) {
    ctx.add(makeSignPost({
      x, z: Z_C + s * (HALF + 0.85), y: Y0 + 0.06, ry: s > 0 ? 0 : Math.PI, h: 1.6,
      plates: [{ map: canalPlate(), w: 0.56, h: 0.42, y: 1.3, double: true }],
    }));
  }

  /* ------------------------------- reeds and flowers ------------------------------- */
  buildReeds(ctx, rng);

  /* --------------------------------- planting --------------------------------- *
   * `leanDir` points every cherry at the channel: branches over water is the
   * entire reason to plant them here. */
  const NB = Z_C - (HALF + 0.6);
  const SB = Z_C + (HALF + 0.6);
  for (let i = 0; i < 6; i++) {
    const x = -49.0 + i * 7.6;
    sakura.push({ x, z: NB - 1.7, y: Y0, scale: 1.16 + (i % 3) * 0.1, seed: 1010 + i, lean: 0.24, leanDir: Math.PI });
  }
  for (let i = 0; i < 4; i++) {
    const x = -45.0 + i * 9.4;
    sakura.push({ x, z: SB + 1.5, y: Y0, scale: 1.1 + (i % 2) * 0.12, seed: 1020 + i, lean: 0.22, leanDir: 0 });
  }
  /* The eastern bank.  Deliberately thin, and deliberately empty between
   * x = 8 and x = 13: that is the line you look along from こばと橋, and one
   * canopy in it closes the whole receding channel off the way a single tree
   * closed the view west off the overbridge deck. */
  for (const [x, s, sc, sd] of [
    [14.6, -1, 1.18, 1060], [24.0, -1, 1.24, 1061], [37.0, -1, 1.12, 1062],
    [19.4, 1, 1.14, 1063], [32.2, 1, 1.22, 1064],
  ]) {
    sakura.push({
      x, z: s < 0 ? NB - 1.7 : SB + 1.5, y: Y0, scale: sc, seed: sd,
      lean: 0.22, leanDir: s < 0 ? Math.PI : 0,
    });
  }
  grove.push({ x: -52.0, z: Z_C - 9.6, y: groundY(Z_C - 9.6), scale: 1.9, seed: 1031, spread: 1.2 });
  grove.push({ x: -42.0, z: Z_C - 10.4, y: groundY(Z_C - 10.4), scale: 1.7, seed: 1032, spread: 1.15 });
  /* Slid west twice.  From x = -19 first, because the house rebuilt on the north
   * bank facing the water reaches back to x = -18.9 and this canopy stood inside
   * its roof; and now from -22.6, because ひばり台五丁目's lane runs at x -21.8
   * with a 3.2 m carriageway and a grove tree at scale 1.8 collides with a
   * 1.46 m box -- x -23.33..-21.87, which is the middle of it.  -26.4 keeps it
   * on the same bank, in the gap west of the staff block, where it still closes
   * the view along the water and is now the thing the lane's south verge sees. */
  grove.push({ x: -26.4, z: Z_C - 9.8, y: groundY(Z_C - 9.8), scale: 1.8, seed: 1033, spread: 1.2 });
  grove.push({ x: -56.0, z: Z_C + 7.6, y: groundY(Z_C + 7.6), scale: 1.75, seed: 1034, spread: 1.15 });
  grove.push({ x: 28.6, z: Z_C - 10.2, y: groundY(Z_C - 10.2), scale: 1.8, seed: 1035, spread: 1.2 });
  grove.push({ x: 40.0, z: Z_C + 8.4, y: groundY(Z_C + 8.4), scale: 1.7, seed: 1036, spread: 1.15 });
  for (let i = 0; i < 7; i++) {
    shrubs.push({
      x: -50.0 + i * 6.4, z: Z_C - (SLAB_OUT - 0.7), y: Y0 + 0.05,
      r: 0.5, count: 4, spread: 1.6, seed: 1040 + i,
    });
  }
  for (let i = 0; i < 5; i++) {
    shrubs.push({
      x: -46.0 + i * 9.0, z: Z_C + (SLAB_OUT - 0.7), y: Y0 + 0.05,
      r: 0.48, count: 3, spread: 1.5, seed: 1050 + i,
    });
  }
  for (let i = 0; i < 5; i++) {
    // 6.2 m pitch, not 7.4: at 7.4 the last clump lands inside the house at
    // (41.5, -15), whose south wall already overlaps the verge
    shrubs.push({
      x: 11.0 + i * 6.2, z: Z_C + (SLAB_OUT - 0.7), y: Y0 + 0.05,
      r: 0.5, count: 4, spread: 1.6, seed: 1070 + i,
    });
  }
  for (let i = 0; i < 4; i++) {
    shrubs.push({
      x: 15.0 + i * 8.6, z: Z_C - (SLAB_OUT - 0.7), y: Y0 + 0.05,
      r: 0.48, count: 3, spread: 1.5, seed: 1080 + i,
    });
  }

  for (const [x0, x1] of DRESS_RUNS) {
    const w = x1 - x0 - 4;
    if (w < 6) continue;
    petals.push({ x: (x0 + x1) / 2, z: SB + 0.9, w, d: 1.8, y: Y0 + 0.07, n: Math.round(w * 2.6) });
    petals.push({ x: (x0 + x1) / 2, z: NB - 0.9, w, d: 1.8, y: Y0 + 0.07, n: Math.round(w * 2.6) });
  }
  petals.push({ x: -27.6, z: Z_C - (PATH_OUT + 0.6), w: 10.0, d: 1.6, y: Y0 + 0.09, n: 70 });

  /* a crow on the bridge rail -- something alive, and nothing else here is */
  ctx.add(makeCrow({ x: FOOT_X + 1.4, y: Y0 + 1.86, z: Z_C - 1.9, ry: -0.6 }));

  return { sakura, shrubs, grove, petals, update: water.update };
}

/* ------------------------------------------------------------------ *
 * Run arithmetic.
 *
 * Bank layers are long spans with holes punched in them -- for the road, for
 * each bridge, for the sluice.  Doing that by hand is where the off-by-a-metre
 * mistakes live, so both helpers work on sorted [from, to] pairs and are
 * always given the holes explicitly.
 * ------------------------------------------------------------------ */

/** The whole ring minus a list of openings. */
function runsExcept(holes) {
  return splitRuns([[X_MIN, X_MAX]], holes);
}

/** Every run in `runs`, minus every hole in `holes`. */
function splitRuns(runs, holes) {
  let out = runs.map(([a, b]) => [a, b]);
  for (const [h0, h1] of holes) {
    const next = [];
    for (const [a, b] of out) {
      if (h1 <= a || h0 >= b) { next.push([a, b]); continue; }
      if (h0 > a) next.push([a, h0]);
      if (h1 < b) next.push([h1, b]);
    }
    out = next;
  }
  return out.filter(([a, b]) => b - a > 0.05);
}

/* ------------------------------------------------------------------ *
 * The water surface: flat blocks, not a shader.
 * ------------------------------------------------------------------ */

function buildWater(ctx, train) {
  const rng = rngKit(9091);
  /* The water stops at the inside face of each headwall.  It used to be `L` long
   * and centred on x = 0 because the ring closed; a reach has to be told both
   * numbers, and a water surface that runs 3 m past its own headwall shows as a
   * blue tongue lying on the grass at the hill's toe. */
  const W_X0 = X_MIN + HW_T;
  const W_X1 = X_MAX - HW_T;
  const L = W_X1 - W_X0;
  const W = WALL_IN * 2;
  const DL = D_E - D_W;
  const DC = (D_W + D_E) / 2;

  /* The base has to be a real mid blue.  Starting from the pale tone and
   * layering pale sky blocks on top gave a surface the colour of bathroom
   * tile: the sky blocks only read as sky if the water under them is darker
   * than they are.  It runs the whole ring; the painted detail on top of it
   * does not, because scattering forty sky blocks over a kilometre puts one
   * every twenty-five metres and reads as litter rather than as reflection. */
  const surface = new THREE.Mesh(
    new THREE.PlaneGeometry(L, W),
    flat({ color: PAL.waterDeep, transparent: true, opacity: 0.93, cache: false })
  );
  surface.rotation.x = -Math.PI / 2;
  surface.position.set((W_X0 + W_X1) / 2, WATER_Y, Z_C);
  surface.userData.noOutline = true;
  surface.name = 'canalWater';
  ctx.add(surface);

  /* darker bands where the channel runs deeper */
  {
    const parts = [];
    for (let i = 0; i < 22; i++) {
      parts.push({
        geometry: new THREE.PlaneGeometry(rng.range(3.0, 7.0), rng.range(0.5, 1.3)),
        matrix: trs(D_W + 3 + rng.range(0, DL - 8), 0, Z_C + rng.range(-0.6, 0.6), -Math.PI / 2, 0, 0),
      });
    }
    const bed = new THREE.Mesh(bake(parts), flat({
      color: 0x5b7d99, transparent: true, opacity: 0.5, depthWrite: false, cache: false,
    }));
    bed.position.y = WATER_Y + 0.006;
    bed.userData.noOutline = true;
    bed.renderOrder = 2;
    ctx.add(bed);
  }

  /* sky blocks: long pale panels, deliberately hard-edged */
  {
    const parts = [];
    for (let i = 0; i < 38; i++) {
      parts.push({
        geometry: new THREE.PlaneGeometry(rng.range(1.4, 4.4), rng.range(0.16, 0.42)),
        matrix: trs(D_W + 2 + rng.range(0, DL - 5), 0, Z_C + rng.range(-1.3, 1.3), -Math.PI / 2, 0, 0),
      });
    }
    const sky = new THREE.Mesh(bake(parts), flat({
      color: PAL.waterSky, transparent: true, opacity: 0.78, depthWrite: false, cache: false,
    }));
    sky.position.y = WATER_Y + 0.014;
    sky.userData.noOutline = true;
    sky.renderOrder = 3;
    ctx.add(sky);
  }

  /* Surface blossom is off. A freestyle line under the bridges does
   * not want a carpet of pink cards on the water. */

  /* the train streak: cream body, blue stripe, sliding and fading */
  const streakMat = flat({
    color: PAL.trainBody, transparent: true, opacity: 0.0, depthWrite: false, cache: false,
  });
  const streak = new THREE.Mesh(new THREE.PlaneGeometry(15.0, 1.3), streakMat);
  streak.rotation.x = -Math.PI / 2;
  streak.position.set(DC, WATER_Y + 0.028, Z_C - 0.3);
  streak.userData.noOutline = true;
  streak.renderOrder = 5;
  ctx.add(streak);

  const stripeMat = flat({
    color: PAL.trainStripe, transparent: true, opacity: 0.0, depthWrite: false, cache: false,
  });
  const stripe = new THREE.Mesh(new THREE.PlaneGeometry(15.0, 0.24), stripeMat);
  stripe.rotation.x = -Math.PI / 2;
  stripe.position.set(DC, WATER_Y + 0.032, Z_C - 0.05);
  stripe.userData.noOutline = true;
  stripe.renderOrder = 6;
  ctx.add(stripe);

  let t = 0;
  const update = (dt) => {
    t += dt;
    if (!train) return;
    const tx = train.x ?? 0;
    const near = clamp(1 - Math.abs(tx - FOOT_X) / 36, 0, 1);
    const fade = near * near * 0.55;
    streakMat.opacity = fade;
    stripeMat.opacity = Math.min(1, fade * 1.3);
    const slide = clamp(tx, D_W + 9, D_E - 9);
    streak.position.x = slide;
    stripe.position.x = slide;
    const wob = 1 + Math.sin(t * 2.4) * 0.06;
    streak.scale.set(1, wob, 1);
    stripe.scale.set(1, wob, 1);
  };
  return { update };
}

/* ------------------------------------------------------------------ *
 * ひばり橋 -- a footbridge, three metres wide, no vehicles.
 *
 * It humps up seventy centimetres over the channel, which lifts the eye
 * just high enough to look back over the housing at the railway.
 * ------------------------------------------------------------------ */

function buildFootbridge(ctx) {
  const m = mats();
  const g = new THREE.Group();
  g.name = 'canalBridge';
  ctx.add(g);

  const W = 3.0;                       // deck width, along x
  const RISE = 0.5;
  /* The deck spans exactly the channel and lands on the coping at each end.
   *
   * It used to run three metres longer, which put its ramps -- and therefore
   * its railings -- a metre and a half out across both bank paths.  The result
   * was a bridge you could not get onto: walking the bank you hit the side
   * railing, and the gap left between its end and the outer edge of the path
   * was a quarter of a metre. */
  const SPAN = HALF * 2;
  const z0 = Z_C - SPAN / 2;
  const profile = (u) => RISE * Math.sin(Math.PI * u);

  /* deck: seven short slabs stepping up and over, so the hump reads */
  const segs = 7;
  const deck = [];
  for (let i = 0; i < segs; i++) {
    const u0 = i / segs;
    const u1 = (i + 1) / segs;
    const y0 = profile(u0);
    const y1 = profile(u1);
    const len = SPAN / segs;
    const tilt = Math.atan2(y1 - y0, len);
    deck.push({
      geometry: new THREE.BoxGeometry(W, 0.26, len / Math.cos(tilt) + 0.02),
      matrix: trs(FOOT_X, Y0 + (y0 + y1) / 2, z0 + SPAN * ((u0 + u1) / 2), tilt, 0, 0),
    });
    ctx.platform({
      x0: FOOT_X - W / 2, x1: FOOT_X + W / 2,
      z0: z0 + SPAN * u0, z1: z0 + SPAN * u1,
      top: Y0 + Math.max(y0, y1) + 0.13,
    });
    /* Slab as itself, floor at the soffit, so the channel under it stays
     * a gap. */
    ctx.collide(
      FOOT_X - W / 2, z0 + SPAN * u0, FOOT_X + W / 2, z0 + SPAN * u1,
      Y0 + Math.max(y0, y1) + 0.13, Y0 + Math.min(y0, y1) - 0.13);

  }
  const dm = new THREE.Mesh(bake(deck), m.concrete);
  dm.castShadow = dm.receiveShadow = true;
  g.add(dm);
  hullOutline(dm, { thickness: 0.0032 });

  /* abutments into the revetment, and a single pier standing in the water */
  for (const s of [-1, 1]) {
    const ab = box(W + 0.5, 1.1, 0.8, m.concreteMid, FOOT_X, Y0 - 0.45, Z_C + s * (HALF + 0.1));
    ab.castShadow = ab.receiveShadow = true;
    g.add(ab);
    ctx.collide(
      FOOT_X - (W + 0.5) / 2, Z_C + s * (HALF + 0.1) - 0.4,
      FOOT_X + (W + 0.5) / 2, Z_C + s * (HALF + 0.1) + 0.4,
      Y0 + 0.1, Y0 - 1.0);
  }
  const pier = box(0.5, DEPTH - 0.3, 0.9, m.concreteDark, FOOT_X, Y0 - (DEPTH - 0.3) / 2 - 0.2, Z_C);
  pier.receiveShadow = true;
  g.add(pier);
  ctx.collide(FOOT_X - 0.28, Z_C - 0.48, FOOT_X + 0.28, Z_C + 0.48, Y0, Y0 - DEPTH);

  /* railings following the hump */
  for (const s of [-1, 1]) {
    const parts = [];
    const n = 9;
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      parts.push({
        geometry: new THREE.CylinderGeometry(0.035, 0.04, 1.0, 7),
        matrix: trs(FOOT_X + s * (W / 2 - 0.12), Y0 + profile(u) + 0.63, z0 + SPAN * u),
      });
    }
    for (const ry of [1.08, 0.62]) {
      for (let i = 0; i < n; i++) {
        const u0 = i / n, u1 = (i + 1) / n;
        const y0 = profile(u0) + ry, y1 = profile(u1) + ry;
        const len = SPAN / n;
        const tilt = Math.atan2(y1 - y0, len);
        parts.push({
          geometry: new THREE.CylinderGeometry(0.038, 0.038, len / Math.cos(tilt) + 0.02, 7),
          matrix: trs(FOOT_X + s * (W / 2 - 0.12), Y0 + (y0 + y1) / 2,
            z0 + SPAN * ((u0 + u1) / 2), Math.PI / 2 + tilt, 0, 0),
        });
      }
    }
    const rm = new THREE.Mesh(bake(parts), m.white);
    rm.castShadow = true;
    g.add(rm);
    /* Parapet on the deck, not a wall through the water. One box for the
     * whole span with no floor is what sealed the undercroft. */
    const rx = FOOT_X + s * (W / 2 - 0.12);
    for (let i = 0; i < n; i++) {
      const u0 = i / n, u1 = (i + 1) / n;
      const y0 = Y0 + profile(u0);
      const y1 = Y0 + profile(u1);
      const zA = z0 + SPAN * u0;
      const zB = z0 + SPAN * u1;
      ctx.collide(rx - 0.05, zA - 0.05, rx + 0.05, zA + 0.05, y0 + 1.05, y0, true);
      const yMid = (y0 + y1) / 2;
      ctx.collide(rx - 0.05, Math.min(zA, zB), rx + 0.05, Math.max(zA, zB),
        yMid + 1.05, yMid + 0.95, true);
      ctx.collide(rx - 0.05, Math.min(zA, zB), rx + 0.05, Math.max(zA, zB),
        yMid + 0.55, yMid + 0.45, true);
    }
  }

  /* the name plate, and the no-vehicles sign at the south landing */
  {
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.24, 0.06),
      [flat({ color: PAL.wallGray }), flat({ color: PAL.wallGray }),
       flat({ color: PAL.wallGray }), flat({ color: PAL.wallGray }),
       flat({ color: 0xffffff, map: bridgePlate(0), cache: false }),
       flat({ color: PAL.wallGray })]
    );
    plate.position.set(FOOT_X - W / 2 + 0.45, Y0 + 0.9, z0 + SPAN + 0.02);
    g.add(plate);
    ctx.add(makeSignPost({
      x: FOOT_X + W / 2 + 0.9, z: z0 + SPAN + 0.4, y: Y0 + 0.06, ry: 0, h: 1.8,
      plates: [{ map: warningPlate(1), w: 0.32, h: 0.64, y: 1.4, double: true }],
    }));
  }

  ctx.add(makePlanter({ x: FOOT_X - W / 2 - 0.6, z: z0 - 0.3, y: Y0 + 0.06, r: 0.26, flower: true, seed: 71, n: 5 }));
  ctx.add(makePlanter({ x: FOOT_X + W / 2 + 0.5, z: z0 + SPAN + 0.4, y: Y0 + 0.06, r: 0.24, flower: true, seed: 72, n: 4 }));
  return g;
}

/* ------------------------------------------------------------------ *
 * こばと橋 -- where the street crosses the channel.
 *
 * This is the piece that makes a channel circling the planet legal.  The two
 * levels it has to reconcile are three quarters of a metre apart and neither
 * of them can move: the bank is flat at Y0 because a canal is flat, and the
 * road climbs through the corridor on its way to the school.  So the bank
 * stops and the road carries on over the water:
 *
 *   fill    z -30.0 .. -26.3 and -21.7 .. -17.2, top at the natural grade,
 *           deep enough to seal the excavation the terrain lost
 *   deck    z -26.6 .. -21.4, 0.42 m thick, soffit half a metre over the
 *           water at the south lip and 0.8 at the north
 *   parapet the trench footprint exactly, z -27.4 .. -20.6
 *   upstand along both outer edges of the deck, because a 0.42 m drop into a
 *           channel needs an edge and a 0.25 m kerb is inside a step height
 *   steps   two, at each end of the south path, which arrives 0.34 m above
 *           the apron
 *
 * Nothing here is registered as a platform: the deck top is deliberately at
 * the terrain grade (`GRADE`, i.e. `TERRAIN_DROP` under the reference plane and
 * under the asphalt that runs over it), so the existing height query already
 * answers correctly over the whole bridge.
 * ------------------------------------------------------------------ */

function buildRoadBridge(ctx) {
  const m = mats();
  const gm = groundMats();
  const g = new THREE.Group();
  g.name = 'roadBridge';
  ctx.add(g);

  const MID = (RD0 + RD1) / 2;
  const HALF_W = (RD1 - RD0) / 2;
  /* The parapets span the excavation (z -26.2 .. -21.8) with a margin at each
   * end.  The north margin used to be 1.2 m, which reached to z = -20.6 -- and
   * that is what sealed both flights of steps off the bank.  The house at
   * (-8.2, -16.4) stops at z = -19.9 and the one at (10.0, -16.2) at -19.8, so
   * with the player's 0.34 m radius on both the parapet and the house there was
   * 0.08 m of clear ground between them: the steps were walled in from the day
   * they went in, and the same on the east side.  Pulled back to -21.4 the gap
   * is 0.72 m, which is the same sliver the bank path is everywhere else it
   * squeezes behind those two houses. */
  const P0 = -27.4;
  const P1 = -21.4;

  /* ------------------------------- fill and deck ------------------------------- *
   * The fill runs 0.4 m past the excavation at each end so it is keyed under
   * real terrain, and its top sits 20 mm below the terrain grade rather than on
   * it: two coincident planes at a grazing angle is a z-fight, and 20 mm of
   * step at the edge of a hole nobody can see the edge of is not. */
  {
    const fill = sweptSolid({
      xAt: () => MID, halfT: HALF_W, baseAt: () => -0.85, topAt: GRADE,
      z0: -30.3, z1: -26.2, step: 0.68,
    }).concat(sweptSolid({
      xAt: () => MID, halfT: HALF_W, baseAt: () => -0.85, topAt: GRADE,
      z0: -21.8, z1: -17.0, step: 0.68,
    }));
    const fm = sweptMesh(fill, m.concreteMid);
    fm.receiveShadow = true;
    fm.name = 'roadBridgeFill';
    g.add(fm);

    const deck = sweptMesh(sweptSolid({
      xAt: () => MID, halfT: HALF_W,
      baseAt: (z) => GRADE(z) - 0.42, topAt: GRADE,
      z0: -26.5, z1: -21.5, step: 0.63,
    }), m.concrete);
    deck.castShadow = deck.receiveShadow = true;
    deck.name = 'roadBridgeDeck';
    g.add(deck);
    /* Thin lid at the soffit. Upstands and rails used to have no floor,
     * which walled the channel. The deck itself had no mass at all. */
    for (let i = 0; i < 3; i++) {
      const za = -26.5 + ((-21.5 + 26.5) * i) / 3;
      const zb = -26.5 + ((-21.5 + 26.5) * (i + 1)) / 3;
      const zMid = (za + zb) / 2;
      ctx.collide(RD0, za, RD1, zb, GRADE(zMid), GRADE(zMid) - 0.42);
    }
  }

  /* ------------------------------ the edge upstand ------------------------------ *
   * A kerb along each outer edge of the deck, standing 0.6 m so that it is
   * actually a barrier: `_resolve` ignores any collider whose top is within a
   * step of the feet, so the 0.25 m upstand this wants to be would have been
   * pure decoration and the apron a 0.42 m drop into the water. */
  for (const sx of [-1, 1]) {
    const ux = sx < 0 ? RD0 + 0.15 : RD1 - 0.15;
    const um = sweptMesh(sweptSolid({
      xAt: () => ux, halfT: 0.14,
      baseAt: (z) => GRADE(z) - 0.14, topAt: (z) => GRADE(z) + 0.6,
      z0: P0, z1: P1, step: 0.68,
    }), m.concreteMid);
    um.castShadow = um.receiveShadow = true;
    g.add(um);
    /* **Three colliders following the grade, not one flat box.**  The upstand's
     * geometry has always been swept -- `topAt` is `GRADE(z) + 0.6` -- but its
     * collider was a single box topped at `GRADE(-24) + 0.6`, i.e. the height it
     * reaches at the *middle* of the bridge.  The road climbs 0.53 m across the
     * crossing, so at the south end that flat top stood only 0.276 m over the
     * footway: inside the 0.38 m step, so `_resolve` skipped it and the upstand
     * was not a barrier there at all.  It never showed because the parapet was
     * standing in front of it; taking the west parapet out is what exposed it.
     * Per segment it clears the footway by 0.43 m everywhere, which is the same
     * arithmetic the comment above already claimed. */
    for (let i = 0; i < 3; i++) {
      const za = P0 + ((P1 - P0) * i) / 3;
      const zb = P0 + ((P1 - P0) * (i + 1)) / 3;
      const g0 = GRADE(Math.min(za, zb));
      ctx.collide(ux - 0.16, za, ux + 0.16, zb, g0 + 0.6, g0);
    }
  }

  /* ------------------------ the west edge's railing ------------------------
   * What replaces the parapet on the west side.  The report was that the slab
   * blocks the view, not that the edge should be open: a 0.43 m upstand is a
   * barrier by five centimetres of step height, and five centimetres is not
   * what should be standing between a footway and a drained channel.  So the
   * *wall* goes and a pipe railing takes its place -- the same one the canal's
   * own banks use forty metres either side of here, which is why it disappears
   * into the picture instead of closing it.
   *
   * Built along `px(z)` rather than as a straight run, because the road drifts
   * 0.63 m in x over the six metres of parapet: `railing()` is axis-aligned, so
   * three or four straight runs would kink by 0.16 m at every joint. */
  {
    const RY = (z) => groundY(z) + WALK_H;
    const rx = (z) => centerX(z) - (ROAD_HALF + WALK_W - 0.12);
    const H = 1.02;
    const parts = [];
    const N = 5;
    for (let i = 0; i <= N; i++) {
      const z = P0 + ((P1 - P0) * i) / N;
      parts.push({
        geometry: new THREE.CylinderGeometry(0.036, 0.04, H, 7),
        matrix: trs(rx(z), RY(z) + H / 2, z),
      });
      if (i === N) continue;
      const zb = P0 + ((P1 - P0) * (i + 1)) / N;
      const dx = rx(zb) - rx(z), dz = zb - z;
      const len = Math.hypot(dx, dz);
      // a box along +x turned by `ry` about Y spans (cos ry, -sin ry) in (x, z)
      const ry = Math.atan2(-dz, dx);
      for (const hy of [H - 0.03, H * 0.5]) {
        parts.push({
          geometry: new THREE.BoxGeometry(len + 0.02, 0.06, 0.06),
          matrix: trs(rx(z) + dx / 2, (RY(z) + RY(zb)) / 2 + hy, z + dz / 2, 0, ry, 0),
        });
      }
    }
    const rm = new THREE.Mesh(bake(parts), cel({ color: PAL.lineWhite, bands: 2, tint: 0x8e86ad }));
    rm.castShadow = true;
    g.add(rm);
    for (let i = 0; i <= 3; i++) {
      const za = P0 + ((P1 - P0) * i) / 3;
      const cx = rx(za);
      const yLo = RY(za);
      ctx.collide(cx - 0.05, za - 0.05, cx + 0.05, za + 0.05, yLo + H, yLo, true);
    }
    for (let i = 0; i < 3; i++) {
      const za = P0 + ((P1 - P0) * i) / 3;
      const zb = P0 + ((P1 - P0) * (i + 1) / 3);
      const cx = rx((za + zb) / 2);
      const yLo = RY(Math.min(za, zb));
      const yMid = (RY(za) + RY(zb)) / 2;
      ctx.collide(cx - 0.05, Math.min(za, zb), cx + 0.05, Math.max(za, zb),
        yMid + H, yMid + H - 0.10, true);
      ctx.collide(cx - 0.05, Math.min(za, zb), cx + 0.05, Math.max(za, zb),
        yMid + H * 0.5 + 0.05, yMid + H * 0.5 - 0.05, true);
    }
  }

  /* -------------------------------- the parapet --------------------------------
   * **East side only.**  There were two, one over each footway, and the west
   * one was removed on a report: standing on the road approach at (-0.8, -28.3)
   * and looking north-west, it is a blank two-metre slab filling half the frame
   * from 0.9 m away, and what it is standing in front of is the one thing the
   * bridge exists to show -- the channel, its railings and its reeds.  A
   * parapet does that from every angle a pedestrian on the west footway has.
   *
   * The west edge is guarded by the pipe railing above instead, which is the
   * canal's own bank detail and reads as part of the water rather than as a
   * wall in front of it.  What is genuinely lost is the bridge's symmetry: from
   * the crossing looking north the deck now has a parapet on one side and a
   * railing on the other, which is common enough on a small Japanese road
   * bridge but is a change, and it is recorded in NEXT.md.
   *
   * The name plate is on the east parapet and is unaffected. */
  for (const sx of [1]) {
    const px = (z) => centerX(z) + sx * (ROAD_HALF + WALK_W + 0.18);
    const capBase = (z) => groundY(z) + WALK_H + 0.8;
    const bm = sweptMesh(sweptSolid({
      xAt: px, halfT: 0.15,
      baseAt: (z) => GRADE(z) - 0.12, topAt: capBase,
      z0: P0, z1: P1, step: 0.62,
    }), m.concrete);
    bm.castShadow = bm.receiveShadow = true;
    g.add(bm);
    hullOutline(bm, { thickness: 0.003 });
    /* The cap overhangs by 60 mm and must not cast: two shadow texels of
     * overhang lands as sawtooth along the parapet face, not as a line.  Same
     * reason `wallRun` does it. */
    const cm = sweptMesh(sweptSolid({
      xAt: px, halfT: 0.21,
      baseAt: capBase, topAt: (z) => capBase(z) + 0.1,
      z0: P0, z1: P1, step: 0.62,
    }), m.concreteMid);
    cm.receiveShadow = true;
    g.add(cm);
    // three colliders, because the parapet drifts 1.19 m in x over its length
    for (let i = 0; i < 3; i++) {
      const za = P0 + ((P1 - P0) * i) / 3;
      const zb = P0 + ((P1 - P0) * (i + 1)) / 3;
      const cx = px((za + zb) / 2);
      ctx.collide(cx - 0.3, za, cx + 0.3, zb, capBase((za + zb) / 2) + 0.1, GRADE((za + zb) / 2));
    }
  }

  /* the name plate, on the parapet the walk up from the crossing meets first */
  {
    const zp = -21.9;
    const px = centerX(zp) + (ROAD_HALF + WALK_W + 0.18);
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.26, 0.95),
      [flat({ color: 0xffffff, map: bridgePlate(1), cache: false }),
       flat({ color: 0xffffff, map: bridgePlate(1), cache: false }),
       flat({ color: PAL.wallGray }), flat({ color: PAL.wallGray }),
       flat({ color: PAL.wallGray }), flat({ color: PAL.wallGray })]
    );
    plate.position.set(px + 0.2, groundY(zp) + WALK_H + 0.5, zp);
    plate.castShadow = true;
    g.add(plate);
  }

  /* --------------------- the steps off the south bank path --------------------- *
   * The south made ground stands 0.34 m over the bridge apron, which is inside
   * a step height but reads as a ledge.  Two treads at each end turn it into a
   * way down.  `x` is offset by 0.74 rather than 0.84 so the top tread's
   * platform *overlaps* the path's by 0.1 m: platform boxes that merely meet
   * are a hole to fall through. */
  {
    /* -20.55, in the middle of the 0.72 m the shortened parapet leaves between
     * itself and the house behind it, and 1.1 m wide so the flight sits inside
     * that gap rather than straddling the parapet at one end and the house
     * corner at the other. */
    const sz = -20.55;
    const base = GRADE(sz);
    /* Three treads, and the top one deliberately 15 mm under the path slab: the
     * platform boxes have to overlap by 0.1 m or the join is a hole, which puts
     * the top tread's *geometry* 0.1 m under the pad as well, and two coplanar
     * concrete tops fight. */
    for (const sx of [-1, 1]) {
      steps(ctx, {
        x: sx < 0 ? RD0 + 1.16 : RD1 - 1.16, z: sz, axis: 'x', dir: sx, n: 3,
        rise: (Y0 + 0.045 - base) / 3, run: 0.42, w: 1.1, y: base,
        mat: gm.concrete, lipMat: gm.concreteMid,
      });
    }
  }

  /* --------------------------- the clutter of a bridge --------------------------- */
  {
    // a marker post at each parapet end, the way a narrow bridge is flagged
    for (const zp of [P0 - 0.25, P1 + 0.25]) {
      for (const sx of [-1, 1]) {
        const px = centerX(zp) + sx * (ROAD_HALF + WALK_W + 0.18);
        const post = cyl(0.055, 0.06, 0.95, 8, m.white, px, GRADE(zp) + 0.475, zp);
        post.castShadow = true;
        g.add(post);
        g.add(cyl(0.062, 0.062, 0.14, 8, cel({ color: PAL.red, bands: 3, tint: 0x7a4060 }),
          px, GRADE(zp) + 0.82, zp));
      }
    }
    // and the gauge board every irrigation crossing carries, out on the verge
    // clear of the steps down off the south path
    ctx.add(makeSignPost({
      x: RD0 - 1.1, z: -18.9, y: Y0 + 0.05, ry: Math.PI / 2, h: 1.7,
      plates: [{ map: canalPlate(), w: 0.5, h: 0.38, y: 1.35, double: true }],
    }));
  }
  return g;
}

/* ------------------------------------------------------------------ *
 * なかて橋 -- the plain slab crossing on the eastern stretch.
 *
 * Two and a half metres of concrete laid straight across, kerb blocks either
 * side and no railing at all.  This is what a field crossing actually is, and
 * having one lets the eastern half of the channel be crossed without pretending
 * it is a street.  The kerbs are what stop it being a plank: 0.2 m is too low
 * for `_resolve` to treat as a wall, which is correct -- you are meant to be
 * able to step over it.
 * ------------------------------------------------------------------ */

function buildSlabCrossing(ctx) {
  const m = mats();
  const g = new THREE.Group();
  g.name = 'canalSlabCrossing';
  ctx.add(g);

  const W = 2.5;
  const SPAN = HALF * 2 + 1.2;
  const z0 = Z_C - SPAN / 2;

  const deck = box(W, 0.3, SPAN, m.concrete, CROSS_X, Y0 + 0.06, Z_C);
  deck.castShadow = deck.receiveShadow = true;
  g.add(deck);
  hullOutline(deck, { thickness: 0.0032 });
  ctx.platform({ x0: CROSS_X - W / 2, x1: CROSS_X + W / 2, z0, z1: z0 + SPAN, top: Y0 + 0.21 });
  ctx.collide(CROSS_X - W / 2, z0, CROSS_X + W / 2, z0 + SPAN, Y0 + 0.21, Y0 - 0.09);

  // kerb blocks along both edges, and the pier in the water
  for (const s of [-1, 1]) {
    const k = box(0.2, 0.2, SPAN - 0.3, m.concreteMid, CROSS_X + s * (W / 2 - 0.1), Y0 + 0.31, Z_C);
    k.castShadow = k.receiveShadow = true;
    g.add(k);
  }
  const pier = box(0.45, DEPTH - 0.3, 0.8, m.concreteDark, CROSS_X, Y0 - (DEPTH - 0.3) / 2 - 0.2, Z_C);
  pier.receiveShadow = true;
  g.add(pier);
  ctx.collide(CROSS_X - 0.25, Z_C - 0.42, CROSS_X + 0.25, Z_C + 0.42, Y0, Y0 - DEPTH);
  for (const s of [-1, 1]) {
    const ab = box(W + 0.4, 0.9, 0.7, m.concreteMid, CROSS_X, Y0 - 0.4, Z_C + s * (HALF + 0.2));
    ab.receiveShadow = true;
    g.add(ab);
  }

  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.2, 0.72),
    [flat({ color: 0xffffff, map: bridgePlate(2), cache: false }),
     flat({ color: 0xffffff, map: bridgePlate(2), cache: false }),
     flat({ color: PAL.wallGray }), flat({ color: PAL.wallGray }),
     flat({ color: PAL.wallGray }), flat({ color: PAL.wallGray })]
  );
  plate.position.set(CROSS_X + W / 2 - 0.02, Y0 + 0.31, Z_C + HALF + 0.1);
  g.add(plate);
  return g;
}

/* ------------------------------------------------------------------ *
 * The two 暗渠 -- where the channel goes under ひばり山.
 *
 * The reach has two ends now, and an end is the one thing a watercourse cannot
 * simply have: water has to come from somewhere and go somewhere, and a channel
 * that stops in a field is the same mistake as a wall that ends in mid-air.  So
 * each end is a culvert mouth set in the toe of the closing range, and what is on
 * the far side of it is the hill.
 *
 * **The two are deliberately not the same structure**, the same argument
 * `hills.js` makes about its two portals: a player who has walked one end of the
 * channel must not think they have walked back to the other.  The tell here is
 * function rather than light --
 *
 *   西 (x = -98)  **呑口**, the inlet.  The channel *ends* here and the water goes
 *                 in, so it gets the thing only an inlet has: a raked 除塵
 *                 スクリーン across the mouth with a rake stood beside it, a
 *                 maintenance platform on the north bank and a gauge board.
 *                 Concrete, square, and recent.
 *   東 (x = 106)  **吐口**, and it is also the reach's source.  Water comes *out*,
 *                 so there is nothing across it -- a screen on an outlet is
 *                 nonsense -- and it is the older work: a stone-faced arch, a
 *                 mossy sill, a stilling apron with a lip, and reeds at the mouth
 *                 where the flow slows.
 *
 * **Built as blocks round the opening, never as a hole in a box.**  You cannot
 * carve a recess into a `BoxGeometry`, which is the trap the onsen street's 格子
 * panels and the library's window plates each cost a round: two side blocks and a
 * header, with the reveal and the dark of the barrel built *outward* off them.
 *
 * The wall's outer face sits exactly on the trench bound, which is what closes the
 * excavation's own void: `landform.js` stops cutting at `CANAL_X0`/`CANAL_X1`, but
 * the revetment and the bed run `END_TAIL` further to seal the hole's overshoot,
 * so behind each headwall there are three metres of channel with no ground over
 * it.  Without the wall you look straight along that and out through the back of
 * the terrain grid, which is culled from beneath and shows as sky.
 * ------------------------------------------------------------------ */

function buildHeadwall(ctx, o, shrubs, grove) {
  const m = mats();
  const west = o.end === 'W';
  const g = new THREE.Group();
  g.name = 'canalHeadwall' + o.end;
  ctx.add(g);

  /* `dir` is the direction the water lies in from the wall, so every offset below
   * is written once and mirrored by it -- the `makeShop`/`face` convention.  The
   * wall's outer face is on the bound and its inner face `HW_T` into the reach. */
  const dir = west ? 1 : -1;
  const XO = west ? X_MIN : X_MAX;               // the outer face, on the bound
  const XI = XO + dir * HW_T;                    // the inner face, where the water stops
  const XC = (XO + XI) / 2;

  const SILL = BED_Y;                            // the barrel's invert, level with the bed
  const TOP = Y0 + 0.10;                         // coping level, matching the channel's lip
  const OPEN_W = 2.10;                           // clear width -- half the channel's, so the
                                                 // mouth reads as a throttle and not as a hole
  const R = OPEN_W / 2;                          // the arch's radius, at the east end
  /**
   * The height of the *rectangular* part of the opening: the whole clear height at
   * the west end, and the springing line at the east.
   *
   * **The east number is what the wall can hold, worked backwards.**  There is
   * `TOP - SILL` = 1.85 m of wall, and an arch over a 2.10 m opening rises `R` =
   * 1.05 above its springing and carries a 0.30 m ring on top of that.  Springing
   * at `SILL + 0.34` therefore puts the extrados at `SILL + 1.69`, which is 0.16 m
   * under the coping.  The first draft used the west end's 1.20 m as the springing
   * for both, which put the crown 0.55 m *above* the coping: the ring stood clear
   * over the top of the wall like a handle, with a separate square hole underneath
   * it, and the render showed exactly that.
   */
  const RECT_H = west ? 1.34 : 0.34;
  const SPRING_Y = SILL + RECT_H;
  const CROWN_Y = west ? SPRING_Y : SPRING_Y + R;
  /** The top of the opening at a lateral offset from the centreline. */
  const openTop = (dz) => (west ? SPRING_Y : SPRING_Y + Math.sqrt(Math.max(0, R * R - dz * dz)));
  const face = west ? m.concrete : m.concreteMid;

  /* ------------------------------- the wall ------------------------------- *
   * Two side blocks and a spandrel, and **never a hole in a box**.  The blocks run
   * from the bed's underside up to the coping and out to the revetment's own outer
   * faces, so the wall is keyed into the channel rather than standing in it; the
   * spandrel is a run of short columns each stopping on the opening's own profile,
   * which is one expression for a square head and an arched one alike. */
  const WALL_Z = HALF;                           // out to the outside of the revetment
  {
    const parts = [];
    const base = Y0 - DEPTH - 0.3;
    for (const s of [-1, 1]) {
      const z0 = Z_C + s * (OPEN_W / 2), z1 = Z_C + s * WALL_Z;
      parts.push({
        geometry: new THREE.BoxGeometry(HW_T, TOP - base, Math.abs(z1 - z0)),
        matrix: trs(XC, (base + TOP) / 2, (z0 + z1) / 2),
      });
    }
    /* the spandrel over the opening.  One block for a square head; fourteen for an
     * arch, whose stepping is covered by the ring standing 50 mm proud of it. */
    const NS = west ? 1 : 14;
    for (let i = 0; i < NS; i++) {
      const w = OPEN_W / NS;
      const zc = Z_C - OPEN_W / 2 + (i + 0.5) * w;
      const yb = openTop(Math.abs(zc - Z_C));
      if (TOP - yb < 0.02) continue;
      parts.push({
        geometry: new THREE.BoxGeometry(HW_T, TOP - yb, w + 0.004),
        matrix: trs(XC, (yb + TOP) / 2, zc),
      });
    }
    const wall = new THREE.Mesh(bake(parts), face);
    wall.castShadow = wall.receiveShadow = true;
    g.add(wall);
    hullOutline(wall, { thickness: 0.0034 });
  }

  /* ------------------------------ the barrel ------------------------------ *
   * A short dark solid behind the opening and nothing else: you cannot see up a
   * culvert, and the one thing that must not happen is seeing *through* it -- there
   * are three metres of channel behind each headwall with no ground over them, and
   * the terrain grid is culled from beneath, so an unclosed mouth is a rectangle of
   * sky.  A solid rather than a plate because the mouth is looked into from a range
   * of angles along the channel and a single plate at one depth reads as paint from
   * every one of them. */
  {
    const d = 2.4;
    const dark = cel({ color: 0x2e2c3a, bands: 2, tint: 0x4a4560 });
    const bx = XO - dir * d / 2;
    g.add(box(d, RECT_H, OPEN_W, dark, bx, SILL + RECT_H / 2, Z_C));
    // the reveal: a darker band on the inside of the jambs, 90 mm in from the face
    const rv = [];
    for (const s of [-1, 1]) {
      rv.push({
        geometry: new THREE.BoxGeometry(0.10, RECT_H, 0.09),
        matrix: trs(XO - dir * 0.05, SILL + RECT_H / 2, Z_C + s * (OPEN_W / 2 - 0.045)),
      });
    }
    if (west) {
      rv.push({
        geometry: new THREE.BoxGeometry(0.10, 0.09, OPEN_W),
        matrix: trs(XO - dir * 0.05, SPRING_Y - 0.045, Z_C),
      });
    }
    g.add(new THREE.Mesh(bake(rv), m.concreteDark));
  }

  /* --------------------------------- the arch --------------------------------- *
   * East only.  A ring of voussoirs above the springing, drawn as short chords so
   * the ink pass gets a joint at every stone -- which is the whole difference
   * between a stone arch and a printed semicircle. */
  if (!west) {
    const N = 9;
    const ring = [];
    const barrel = [];
    /* **`rx = am - PI/2`, derived and not guessed.**  The ring lies in the y-z
     * plane, so a voussoir's local y has to point along the radius
     * `(0, sin am, -cos am)` and its local z along the tangent `(0, cos am, sin am)`.
     * A rotation about X by t sends local y to `(0, cos t, sin t)` and local z to
     * `(0, -sin t, cos t)`; matching both gives `cos t = sin am` and
     * `sin t = -cos am`, i.e. `t = am - PI/2`.  Written as a scale argument by
     * mistake first -- `trs`'s seventh parameter is `sx`, not a rotation -- which
     * squashed the whole ring to a point and drew nothing at all. */
    for (let i = 0; i < N; i++) {
      const a0 = Math.PI * (i / N), a1 = Math.PI * ((i + 1) / N);
      const am = (a0 + a1) / 2;
      const w = R * (a1 - a0) * 1.06;                    // chord along the ring
      const t = am - Math.PI / 2;
      /* **`XC + dir * 0.05`, so the ring stands proud on the face you see.**  `dir`
       * points from the wall toward the water, and the visible elevation is the
       * *inner* face at `XI`; written `XC - dir` the ring is proud on the buried
       * side and sits 0.43 m *inside* the wall, which rendered as a dark hole with a
       * ghost of a ring stencilled behind it.  Same family as every stand-off in
       * this project: take it along the prop's own outward normal. */
      ring.push({
        geometry: new THREE.BoxGeometry(HW_T + 0.10, 0.30, w),
        matrix: trs(XC + dir * 0.05, SPRING_Y + Math.sin(am) * (R + 0.15),
          Z_C - Math.cos(am) * (R + 0.15), t, 0, 0),
      });
      // and the dark of the barrel behind the ring, so the arch is not a lid
      barrel.push({
        geometry: new THREE.BoxGeometry(2.2, 0.34, w),
        matrix: trs(XO - dir * 1.2, SPRING_Y + Math.sin(am) * (R - 0.14),
          Z_C - Math.cos(am) * (R - 0.14), t, 0, 0),
      });
    }
    const rm = new THREE.Mesh(bake(ring), m.concrete);
    rm.castShadow = rm.receiveShadow = true;
    g.add(rm);
    g.add(new THREE.Mesh(bake(barrel), cel({ color: 0x2e2c3a, bands: 2, tint: 0x4a4560 })));
    /* the mossy sill and the tide line -- an outlet is the wettest concrete in the
     * world and the only place in this district where that can be said */
    g.add(box(HW_T + 0.16, 0.14, OPEN_W + 0.08, m.moss, XC + dir * 0.08, SILL + 0.06, Z_C));
  }

  /* ------------------------------- the coping ------------------------------- */
  {
    const cap = box(HW_T + 0.34, 0.18, WALL_Z * 2 + 0.34, m.concrete, XC, TOP + 0.09, Z_C);
    cap.receiveShadow = true;
    // 60 mm of overhang against a 33 mm shadow texel is sawtooth, not a line
    cap.castShadow = false;
    g.add(cap);
    hullOutline(cap, { thickness: 0.0032 });
  }

  /* ------------------------------ the wing walls ------------------------------ *
   * They splay back into the bank at about 30 degrees and step down as they go,
   * which is what ties the structure to the ground either side of it.  Three
   * stepped blocks a side rather than a rotated slab: a wing wall is built in
   * lifts and the ink pass draws every lift, which is most of what says "civil
   * engineering" at this scale. */
  for (const s of [-1, 1]) {
    const parts = [];
    /* Three lifts, and they have to **overlap in both axes** or they read as three
     * detached lumps on the bank rather than as one wall stepping away: 0.95 m of
     * step against a 1.05 m block in x, 0.50 against 0.62 in z. */
    for (let i = 0; i < 3; i++) {
      const back = 0.55 + i * 0.95;                        // how far behind the face
      const out = WALL_Z + 0.34 + i * 0.50;                // how far out into the bank
      const h = 1.30 - i * 0.34;
      parts.push({
        geometry: new THREE.BoxGeometry(1.05, h, 0.62),
        matrix: trs(XO - dir * back, Y0 + 0.10 - h / 2 + 0.06, Z_C + s * out),
      });
    }
    const wm = new THREE.Mesh(bake(parts), face);
    wm.castShadow = wm.receiveShadow = true;
    g.add(wm);
    hullOutline(wm, { thickness: 0.0032 });
    ctx.collide(
      Math.min(XO, XO - dir * 3.1), Z_C + s * WALL_Z,
      Math.max(XO, XO - dir * 3.1), Z_C + s * (WALL_Z + 2.2), Y0 + 0.95
    );
  }

  /* -------------------------- the barrier across the end -------------------------- *
   * The channel-edge barrier runs to the bound and stops; without this the last
   * four metres of both banks end at an unguarded 1.75 m drop with the water at the
   * bottom of it -- the 川端の道 finding, in the one place nobody would look. */
  ctx.collide(
    Math.min(XI, XI + dir * 0.4), Z_C - WALL_Z - 0.1,
    Math.max(XI, XI + dir * 0.4), Z_C + WALL_Z + 0.1, Y0 + 0.95
  );

  /* ------------------------------- the dressing ------------------------------- */
  if (west) {
    /* the 除塵スクリーン: a raked grille across the mouth.
     *
     * **Built about its own foot in a group, not by hand-offsetting a rotation.**
     * The bars are authored standing on y = 0 and the group is then tilted and
     * placed, so the foot lands where it is asked to.  Written as a `trs` rotation
     * with a hand-derived x offset first, which double-counted the lean -- the same
     * arithmetic mistake as `laneSign`'s plate and `makeSignPost`'s stand-off, and
     * it is always the same fix: rotate the assembly, not the numbers.
     *
     * It leans back *over the water*, which is upstream and is the only way a rake
     * standing on the bank can reach the bottom of it.  A group rotated by `rz` sends
     * its local +y to `(-sin rz, cos rz)`, so leaning the top toward the water needs
     * `rz = -dir * rake` -- the sign the first draft also had backwards. */
    const sc = new THREE.Group();
    const rake = 0.34;                                    // radians off vertical
    const H = RECT_H + 0.26;
    const bars = [];
    for (let i = 0; i < 11; i++) {
      bars.push({
        geometry: new THREE.BoxGeometry(0.05, H, 0.05),
        matrix: trs(0, H / 2, -OPEN_W / 2 + 0.08 + i * ((OPEN_W - 0.16) / 10)),
      });
    }
    for (const t of [0.18, 0.72]) {
      bars.push({
        geometry: new THREE.BoxGeometry(0.06, 0.06, OPEN_W - 0.06),
        matrix: trs(0, H * t, 0),
      });
    }
    const scm = new THREE.Mesh(bake(bars), m.rust);
    scm.castShadow = true;
    sc.add(scm);
    sc.position.set(XI + dir * 0.26, SILL, Z_C);
    sc.rotation.z = -dir * rake;
    g.add(sc);

    /* the platform you stand on to rake it, on the north bank, and the handrail
     * round the two open sides of it.  0.30 above the bank, which is inside a
     * 0.38 m step, so it can actually be stood on -- the sluice deck's lesson. */
    const PX = XI + dir * 1.5, PZ = Z_C - (WALL_Z + 1.05), PY = Y0 + 0.30;
    {
      const deck = box(2.9, 0.24, 2.0, m.concrete, PX, PY - 0.12, PZ);
      deck.castShadow = deck.receiveShadow = true;
      g.add(deck);
      hullOutline(deck, { thickness: 0.0032 });
      ctx.platform({ x0: PX - 1.45, x1: PX + 1.45, z0: PZ - 1.0, z1: PZ + 1.0, top: PY });
      /* **One railing, on the channel side, and it carries no collider.**
       *
       * The first pass put one at `PZ - 1.0` and one at `PX + dir * 1.45`, which is
       * both of the wrong two sides: the drop is toward the channel at `+z`, so the
       * first guarded the side where the bank simply continues, and the second stood
       * across the towpath -- the linear trace along the north bank stopped dead at
       * x = -94.1 against a 1.95 m collider, forty metres short of the mouth.  Same
       * finding as 東山's overlook, and the same rule: work out which side you
       * arrive from and leave it open.
       *
       * No collider because the channel-edge barrier already runs along z = -26.4
       * under it; a second box there would be two barriers deep on a 3.5 m bank. */
      railing(ctx, {
        axis: 'x', at: PZ + 1.0, from: PX - 1.45, to: PX + 1.45, y: PY, h: 1.0,
        spacing: 1.5, collide: false,
      });
    }
    // the rake itself, stood against the wall, and a gauge board on the jamb
    {
      const rk = new THREE.Group();
      rk.add(cyl(0.03, 0.03, 2.3, 6, m.rust, 0, 1.15, 0));
      rk.add(box(0.06, 0.05, 0.62, m.metalDark, 0, 0.06, 0));
      for (let i = 0; i < 7; i++) rk.add(box(0.04, 0.20, 0.04, m.metalDark, 0, -0.05, -0.28 + i * 0.093));
      rk.position.set(PX - dir * 1.1, PY, PZ + 0.8);
      rk.rotation.z = dir * 0.22;
      ctx.add(rk);
    }
    /* **`ry` faces the approach.**  `makeSignPost` puts its plate on local +z, and a
     * rotation of `+PI/2` maps that to `+x`; `dir` is the direction the water lies
     * in from the wall, which at each end is also the direction anybody reading the
     * plate has walked from.  Written the other way round first, so both plates
     * faced into the hillside -- two blank white cards on a post, the same mistake
     * the ramp mouth's signage in `nanachome.js` records. */
    ctx.add(makeSignPost({
      x: PX + dir * 0.2, z: PZ - 1.5, y: Y0 + 0.02, ry: dir > 0 ? Math.PI / 2 : -Math.PI / 2,
      h: 2.0, postMat: m.metal,
      plates: [{ map: ankyoPlate(0), w: 0.72, h: 0.30, y: 1.58 }],
    }));
    shrubs.push({ x: XO - dir * 4.0, z: Z_C + WALL_Z + 2.6, y: Y0, r: 0.44, count: 3, spread: 1.1, seed: 6611 });
  } else {
    /* the stilling apron: a slab in front of the mouth with a lip at its end, so
     * the water arrives on something rather than on nothing */
    const AX = XI + dir * 2.2;
    {
      const ap = box(4.4, 0.20, WALL_IN * 2, m.concreteMid, AX, SILL - 0.02, Z_C);
      ap.receiveShadow = true;
      g.add(ap);
      g.add(box(0.24, 0.34, WALL_IN * 2, m.concreteMid, XI + dir * 4.4, SILL + 0.09, Z_C));
      // the wet line, and the algae that goes with it
      g.add(box(4.4, 0.14, WALL_IN * 2 - 0.1, m.moss, AX, SILL + 0.09, Z_C));
    }
    /* the gauge post -- an outlet is where you read the flow, and it is the only
     * instrument on this half of the reach */
    ctx.add(makeSignPost({
      x: XI + dir * 1.1, z: Z_C - (WALL_Z + 0.6), y: Y0 + 0.02,
      ry: dir > 0 ? Math.PI / 2 : -Math.PI / 2, h: 1.9, postMat: m.metal,
      plates: [{ map: ankyoPlate(1), w: 0.72, h: 0.30, y: 1.48 }],
    }));
    /* the 量水標, bolted flat to the outlet's own jamb where a gauge is read from --
     * on a post out on the bank it is an instrument measuring a field */
    {
      const gb = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 1.10),
        flat({ color: 0xffffff, map: gaugeBoard(), cache: false }));
      gb.position.set(XI + dir * 0.04, SILL + 0.62, Z_C + (OPEN_W / 2 + 0.34));
      gb.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      gb.userData.noOutline = true;
      g.add(gb);
    }
    shrubs.push({ x: XO - dir * 3.4, z: Z_C - (WALL_Z + 2.4), y: Y0, r: 0.46, count: 3, spread: 1.2, seed: 6612 });
    grove.push({ x: XO - dir * 5.6, z: Z_C + WALL_Z + 3.4, y: Y0, scale: 1.28, seed: 6613 });
  }
}

/* ------------------------------------------------------------------ *
 * 第二分水門 -- the distribution gate.
 *
 * A 用水路 is a machine, and this is the only part of it that looks like one:
 * two piers narrowing the channel, a steel gate leaf shut in its guides, a
 * threaded stem up to a handwheel on a small headstock deck, and the enamel
 * plate that records which gate it is.  It is also the only reason to walk the
 * eastern bank to the end, which is exactly what it is for.
 * ------------------------------------------------------------------ */

function buildSluice(ctx) {
  const m = mats();
  const g = new THREE.Group();
  g.name = 'canalSluice';
  ctx.add(g);

  const X = SLUICE_X;
  const OPEN = 1.5;                 // clear width between the guide piers
  const PIER_H = DEPTH + 0.9;

  /* the two guide piers, standing off the revetment walls */
  for (const s of [-1, 1]) {
    const pz = Z_C + s * ((OPEN / 2 + WALL_IN) / 2);
    const pd = WALL_IN - OPEN / 2;
    const p = box(1.1, PIER_H, pd, m.concreteMid, X, Y0 + 0.28 - PIER_H / 2, pz);
    p.castShadow = p.receiveShadow = true;
    g.add(p);
    // the guide slot, as a recessed dark strip on the channel side
    g.add(box(0.16, DEPTH - 0.2, pd - 0.1, m.concreteDark, X - 0.48, Y0 - DEPTH / 2, pz));
  }
  /* ------------------------------- the headstock ------------------------------- *
   * A walkway across the top of the piers, and it has to be *walkable*: the bank
   * path is 0.06 m up and a step is 0.38, so the deck sits at 0.30 rather than
   * the 0.50 the first pass gave it -- at 0.50 it was a 0.44 m riser and the one
   * interesting thing on the eastern half of the channel could not be stood on.
   *
   * The railings run *along* the walkway, on its two long edges.  They were
   * across its two ends to begin with, which is not how a sluice is built and,
   * more to the point, walled the deck off from both banks. */
  const DECK = 0.30;
  {
    const deck = box(1.4, 0.22, WALL_IN * 2 + 0.7, m.concrete, X, Y0 + DECK - 0.11, Z_C);
    deck.castShadow = deck.receiveShadow = true;
    g.add(deck);
    hullOutline(deck, { thickness: 0.0032 });
    ctx.platform({
      x0: X - 0.7, x1: X + 0.7,
      z0: Z_C - WALL_IN - 0.35, z1: Z_C + WALL_IN + 0.35, top: Y0 + DECK,
    });
    ctx.collide(
      X - 0.7, Z_C - WALL_IN - 0.35, X + 0.7, Z_C + WALL_IN + 0.35,
      Y0 + DECK, Y0 + DECK - 0.22);
    // grating: a run of dark bars, so it is not a blank lid
    const bars = [];
    for (let i = 0; i < 11; i++) {
      bars.push({
        geometry: new THREE.BoxGeometry(1.2, 0.04, 0.06),
        matrix: trs(X, Y0 + DECK + 0.02, Z_C - 2.4 + i * 0.48),
      });
    }
    g.add(new THREE.Mesh(bake(bars), m.metalDark));
    const L = WALL_IN * 2 + 0.7;
    for (const s of [-1, 1]) {
      const parts = [];
      const rx = X + s * 0.66;
      for (let i = 0; i <= 4; i++) {
        parts.push({
          geometry: new THREE.CylinderGeometry(0.035, 0.04, 0.95, 7),
          matrix: trs(rx, Y0 + DECK + 0.48, Z_C - L / 2 + (L / 4) * i),
        });
      }
      for (const dy of [0.93, 0.5]) {
        parts.push({
          geometry: new THREE.CylinderGeometry(0.038, 0.038, L, 7),
          matrix: trs(rx, Y0 + DECK + dy, Z_C, Math.PI / 2, 0, 0),
        });
      }
      const rm = new THREE.Mesh(bake(parts), m.white);
      rm.castShadow = true;
      g.add(rm);
      for (let i = 0; i <= 4; i++) {
        const pz = Z_C - L / 2 + (L / 4) * i;
        ctx.collide(rx - 0.05, pz - 0.05, rx + 0.05, pz + 0.05, Y0 + DECK + 0.95, Y0 + DECK, true);
      }
      ctx.collide(rx - 0.05, Z_C - L / 2, rx + 0.05, Z_C + L / 2, Y0 + DECK + 0.98, Y0 + DECK + 0.88, true);
      ctx.collide(rx - 0.05, Z_C - L / 2, rx + 0.05, Z_C + L / 2, Y0 + DECK + 0.55, Y0 + DECK + 0.45, true);
    }
  }

  /* the gate leaf, shut, and the stem and handwheel that drive it */
  {
    const leaf = box(0.1, DEPTH - 0.35, OPEN + 0.16, m.rust, X - 0.4, Y0 - DEPTH / 2 - 0.05, Z_C);
    leaf.castShadow = leaf.receiveShadow = true;
    g.add(leaf);
    // stiffeners across the leaf, which is what makes it read as plate steel
    for (let i = 0; i < 3; i++) {
      g.add(box(0.06, 0.08, OPEN + 0.1, m.metalDark, X - 0.47, Y0 - 0.45 - i * 0.45, Z_C));
    }
    const frame = new THREE.Group();
    for (const s of [-1, 1]) {
      frame.add(cyl(0.05, 0.05, 1.5, 6, m.metalDark, X - 0.3, Y0 + 1.25, Z_C + s * 0.34));
    }
    frame.add(box(0.34, 0.14, 0.9, m.metalDark, X - 0.3, Y0 + 2.02, Z_C));
    g.add(frame);
    const stem = cyl(0.035, 0.035, 1.9, 6, m.metal, X - 0.3, Y0 + 1.35, Z_C);
    g.add(stem);
    // the handwheel: a rim, a hub and four spokes, lying flat
    const wheel = new THREE.Group();
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.026, 5, 14), m.rust);
    rim.rotation.x = Math.PI / 2;
    wheel.add(rim);
    for (let i = 0; i < 4; i++) {
      const sp = box(0.46, 0.03, 0.03, m.rust, 0, 0, 0);
      sp.rotation.y = (i / 4) * Math.PI;
      wheel.add(sp);
    }
    wheel.add(cyl(0.06, 0.06, 0.1, 8, m.metalDark, 0, 0, 0));
    wheel.position.set(X - 0.3, Y0 + 2.16, Z_C);
    wheel.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    g.add(wheel);
  }

  /* the plate, and the moss the wet face always grows */
  {
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.4, 0.52),
      [flat({ color: 0xffffff, map: sluicePlate(), cache: false }),
       flat({ color: 0xffffff, map: sluicePlate(), cache: false }),
       flat({ color: PAL.wallGray }), flat({ color: PAL.wallGray }),
       flat({ color: PAL.wallGray }), flat({ color: PAL.wallGray })]
    );
    plate.position.set(X + 0.72, Y0 + 0.95, Z_C - WALL_IN - 0.1);
    plate.castShadow = true;
    g.add(plate);
    ctx.add(cyl(0.045, 0.05, 1.1, 8, m.metal, X + 0.72, Y0 + 0.55, Z_C - WALL_IN - 0.1));

    for (const s of [-1, 1]) {
      const moss = box(0.9, 0.5, 0.03, cel({ color: PAL.moss, bands: 2, tint: 0x5b6f8c }),
        X + 0.02, Y0 - 0.55, Z_C + s * (OPEN / 2 + 0.02));
      moss.userData.noOutline = true;
      g.add(moss);
    }
  }
  return g;
}

/* ------------------------------------------------------------------ *
 * Reeds and wildflowers.
 *
 * Reeds are pure line -- tall, thin, splayed -- which is exactly what a hard
 * concrete channel needs standing against it.
 * ------------------------------------------------------------------ */

function buildReeds(ctx, rng) {
  /* Tapered cones, smooth-shaded, in light greens.
   *
   * The first pass used thin flat-shaded cylinders and they came out as a
   * bundle of dark skewers: at that thinness you only ever see one facet, and
   * a flat-shaded facet turned away from the sun is nearly black.  Smooth
   * normals plus a two-band ramp keeps a blade light along its whole length,
   * which is what makes a clump read as foliage rather than as spikes.  A few
   * low blobs at the base give it something to grow out of. */
  const bladeGeo = new THREE.ConeGeometry(0.032, 1, 3, 1);
  const headGeo = new THREE.ConeGeometry(0.028, 0.22, 4, 1);
  const baseGeo = new THREE.IcosahedronGeometry(1, 0);
  const blades = [[], []];
  const heads = [];
  const bases = [];

  const clump = (x, z, y, n, scale) => {
    bases.push(trs(x, y + 0.07 * scale, z, rng.range(0, 3), rng.range(0, 3), rng.range(0, 3),
      0.3 * scale, 0.16 * scale, 0.26 * scale));
    for (let i = 0; i < n; i++) {
      const h = (1.05 + rng.range(-0.25, 0.5)) * scale;
      const px = x + rng.range(-0.4, 0.4);
      const pz = z + rng.range(-0.26, 0.26);
      const lean = rng.range(0.05, 0.2);
      const dir = rng.range(0, 6.3);
      blades[i % 2].push(trs(px, y + h / 2, pz,
        lean * Math.sin(dir), 0, -lean * Math.cos(dir), 1, h, 1));
      if (rng.chance(0.35)) {
        heads.push(trs(
          px + Math.sin(dir) * lean * h * 0.9, y + h + 0.1, pz - Math.cos(dir) * lean * h * 0.9,
          lean * Math.sin(dir), 0, -lean * Math.cos(dir), 1, 1, 1));
      }
    }
  };

  // standing in the water along both walls
  const clearOf = (x) => (
    Math.abs(x - FOOT_X) > 2.8 && Math.abs(x - CROSS_X) > 2.6 &&
    Math.abs(x - SLUICE_X) > 2.8 && (x < RD0 - 1.4 || x > RD1 + 1.4)
  );
  for (let x = D_W + 2; x < D_E - 2; x += 2.4) {
    if (!clearOf(x)) continue;
    if (rng.chance(0.74)) clump(x, Z_C - (WALL_IN - 0.18), WATER_Y - 0.06, rng.int(5, 9), rng.range(0.9, 1.4));
    if (rng.chance(0.62)) clump(x, Z_C + (WALL_IN - 0.18), WATER_Y - 0.06, rng.int(4, 8), rng.range(0.85, 1.3));
  }
  // and in the grass verge above
  for (let i = 0; i < 40; i++) {
    const s = rng.chance(0.7) ? -1 : 1;
    const x = D_W + 7 + rng.range(0, D_E - D_W - 14);
    if (x > RD0 - 1 && x < RD1 + 1) continue;
    clump(x, Z_C + s * rng.range(PATH_OUT + 0.3, SLAB_OUT - 0.3), Y0 + 0.05,
      rng.int(4, 8), rng.range(0.6, 1.0));
  }

  const tones = [0x94b874, 0x74a05c];
  blades.forEach((list, i) => {
    if (!list.length) return;
    const inst = new THREE.InstancedMesh(
      bladeGeo,
      cel({ color: tones[i], bands: 2, flat: false, tint: 0x6a86a0 }),
      list.length
    );
    list.forEach((mx, k) => inst.setMatrixAt(k, mx));
    inst.castShadow = true;
    ctx.add(inst);
  });
  if (heads.length) {
    const inst = new THREE.InstancedMesh(
      headGeo, cel({ color: 0xcfbd94, bands: 2, flat: false, tint: 0x8a7f9c }), heads.length);
    heads.forEach((mx, k) => inst.setMatrixAt(k, mx));
    ctx.add(inst);
  }
  if (bases.length) {
    const inst = new THREE.InstancedMesh(
      baseGeo, cel({ color: PAL.moss, bands: 3, tint: 0x5b6f8c }), bases.length);
    bases.forEach((mx, k) => inst.setMatrixAt(k, mx));
    inst.castShadow = true;
    ctx.add(inst);
  }

  /* wildflowers over the verges */
  {
    const geo = new THREE.IcosahedronGeometry(1, 0);
    const lists = [[], [], []];
    for (let i = 0; i < 380; i++) {
      const s = rng.chance(0.6) ? -1 : 1;
      const x = D_W + 6 + rng.range(0, D_E - D_W - 12);
      if (x > RD0 - 0.8 && x < RD1 + 0.8) continue;
      const z = Z_C + s * rng.range(PATH_OUT + 0.2, SLAB_OUT - 0.2);
      const r = rng.range(0.035, 0.07);
      lists[rng.int(0, 2)].push(trs(x, Y0 + 0.05 + r + rng.range(0.02, 0.18), z,
        rng.range(0, 3), rng.range(0, 3), rng.range(0, 3), r, r, r));
    }
    const cols = [0xf6f2e8, PAL.yellow, PAL.blossomDeep];
    lists.forEach((list, i) => {
      if (!list.length) return;
      const inst = new THREE.InstancedMesh(geo, cel({ color: cols[i], bands: 2, tint: 0x8f7aa8 }), list.length);
      list.forEach((mx, k) => inst.setMatrixAt(k, mx));
      ctx.add(inst);
    });
  }
  // note: bladeGeo / headGeo / baseGeo are the instanced meshes' own geometry,
  // so they must not be disposed here
}
