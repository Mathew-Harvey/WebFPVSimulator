/*
 * training.js: ひばり台ドローン練習場, the practice field on the paddy land
 * north of the works and the pool.
 *
 * WHAT IT IS FOR. Five things a freestyle pilot has to learn before anything
 * else is fun, each with the clear air it actually needs and its name painted
 * on the ground under it. Nothing here is scored, nothing is gated and
 * nothing is timed: it is a field with the right shapes in it, which is what
 * a real practice field is.
 *
 * WHY THE ELEMENTS ARE THE SHAPES THEY ARE, and this is the whole design.
 *
 *   ORBIT wants ONE tall thing and NOTHING NEAR IT. A yaw spin round a mast
 *   is a fixed radius held while the stick hand does two things at once, and
 *   the two ways to make it unlearnable are to put something inside the
 *   circle and to give the pilot no way to see what radius they are flying.
 *   So the mast is 34 m, its section is a constant 3.0 m so the radius means
 *   the same at every height, the nearest solid in any direction is 26 m, and
 *   the ground under it carries three painted rings at 6, 10 and 14 m. A
 *   pilot can SEE the circle they are flying. Two decks, at 12 and 24 m, are
 *   both landing places and the reference a hurricane is flown between.
 *
 *   A POWER LOOP is one manoeuvre with two halves and the second half is the
 *   one nobody practises: through the gap, up and over, and BACK THROUGH. So
 *   there are two arches rather than one, 16 m apart on the same axis, and
 *   the second one is the reason the first is worth having. 7.0 m of opening
 *   and 5.6 m to the soffit is wide enough to be flown at speed and tight
 *   enough that a sloppy exit is visible.
 *
 *   A WALL TAP is not about the wall, it is about the RUN AT IT. The wall is
 *   12 m of concrete with 30 m of open paddy in front of it, a target at
 *   3.2 m, which is tap height for a five inch, and nothing at all behind it
 *   to catch a bounce.
 *
 *   A SPLIT-S is a height exercise before it is a stick exercise: you have to
 *   know how high you were when you rolled. So the entry is a bar at 12 m and
 *   the exit is a gate at 1.6 m directly under it, and both uprights carry
 *   painted metre marks so the number is on the object rather than in the
 *   HUD. Fly east over the bar, half roll, half loop, come back west through
 *   the gate.
 *
 *   FREE PRACTICE wants nothing in it. The far end of the field is 48 by 14 m
 *   of dry ground with the paddy grid round it and the sky over it.
 *
 * THE PADDIES ARE THE FABRIC, and they are also the reason the field is
 * legible from the air. A 田んぼ grid is a lattice of raised earth bunds
 * holding flat water, and from thirty metres up that lattice is what tells a
 * pilot where everything is. So the whole site is one 16 by 14 m grid: every
 * cell is either flooded paddy or a gravel pad with an element on it, three
 * of the grid lines are widened into the 農道 that gets you round, and there
 * is no other layout logic anywhere in this file.
 *
 * THE WATER IS ABOVE THE GROUND, which is not how a paddy works and is the
 * only way it can be drawn here. `street.js` lays one terrain grid over the
 * valley and anything below it is invisible unless the mesh is cut, which the
 * empty pool pays for and a forty cell paddy grid should not. A real paddy is
 * a diked tray anyway: bunds 0.30 m up, water 0.12 m up, which from the air
 * is exactly the bright rectangle inside a low earth frame that it should be.
 *
 * WHERE. x -4 to 124, z 118 to 188, measured off the built town: the survey
 * in `.loop/evidence/places-lines.js`'s sibling probe put the last collider
 * in the world at z 116 and the ground exactly flat at 0.45 from there to
 * z 190 across the full width. The hills' keep-out ends at z 114 and no
 * summit reaches this far, so `hillAt` is zero over every square metre of it.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import * as THREE from 'three';
import { rngKit } from '../vendored/core/util.js';
import { makeNoticeBoard, makeBench } from '../vendored/world/props.js';
import {
  GROUND, mats, slab, decal, deck, post, board, patch,
} from './kit.js';
import {
  markOrbit, markLoop, markWall, markSplitS, markJump, markPractice,
  fieldName, fieldGuide, towerBanner, wallTarget, heightMark,
} from './signs.js';

/* ------------------------------------------------------------------ *
 * The grid, and everything in the file is placed on it.
 * ------------------------------------------------------------------ */

const GX0 = 0.0;           // west edge
const GZ0 = 118.0;         // south edge, four metres north of the works' fence
const CW = 16.0;           // cell width in x
const CD = 14.0;           // cell depth in z
const NX = 8;              // 128 m across
const NZ = 5;              // 70 m deep
/*
 * ONE WIDTH FOR EVERY GRID LINE, and it is a geometry decision rather than a
 * design one.
 *
 * A 農道 is a wider gravelled bund and nothing else, so drawing the tracks at
 * a different width from the ridges would be true to life and would put a
 * step at every intersection where a 3 m line crossed a 1.2 m one, with the
 * two boxes sharing a volume in the middle of it. At one width the x lines
 * own the intersections, the z lines inset by half a width at each end, and
 * every joint in the grid is a shared FACE. What tells a track from a ridge
 * is the gravel on it and the two centimetres it stands proud.
 */
const W = 1.60;
const BUND_TOP = GROUND + 0.30;
const TRACK_TOP = GROUND + 0.32;
const WATER_TOP = GROUND + 0.12;
/* Every painted line and every ground plate is laid at this one height: 6 mm
 * over the tracks, which are the highest surface anything is painted on, so a
 * marking that crosses from a pad onto a track does not disappear halfway. */
const PAINT_Y = TRACK_TOP + 0.006;

const cellX0 = (i) => GX0 + i * CW;
const cellZ0 = (j) => GZ0 + j * CD;

/*
 * Which cells are dry, and what stands on each. Everything else is flooded.
 *
 * Read it as the map it is: south is the bottom row, the way in is at the
 * bottom on the x = 32 line, and a pilot meets the arches first because a
 * power loop is the thing you can fly badly and still get through.
 *
 * The mast has FOUR cells, and that is the whole reason the table is not
 * one entry per element. Its outermost painted ring is 13 m and a single
 * cell gives 6.4 m from the centre to the water: the rings are the thing
 * that makes an orbit learnable, so the pad is sized by them.
 */
const PADS = {
  '2,0': 'entrance',
  '4,0': 'jump',
  '5,0': 'jump',
  '1,1': 'loop',
  '2,1': 'loop',
  '3,2': 'wall',
  '5,2': 'tower',
  '6,2': 'tower',
  '5,3': 'tower',
  '6,3': 'tower',
  '1,3': 'splits',
  '2,4': 'practice',
  '3,4': 'practice',
  '4,4': 'practice',
};
const isPad = (i, j) => PADS[`${i},${j}`] !== undefined;
const inside = (i, j) => i >= 0 && i < NX && j >= 0 && j < NZ;
const wet = (i, j) => inside(i, j) && !isPad(i, j);
const dry = (i, j) => inside(i, j) && isPad(i, j);

/* The lines that are gravelled: the spine along z = 132, the way in and out
 * along x = 32, and the one cell spur that lands you on the mast's pad. */
const TRACK_Z = [{ at: 132.0, from: 0.0, to: 128.0 }];
const TRACK_X = [
  { at: 32.0, from: 118.0, to: 188.0 },
  { at: 80.0, from: 132.0, to: 146.0 },
];
const trackZ = (z, x0, x1) => TRACK_Z.some(
  (t) => Math.abs(t.at - z) < 0.01 && x0 >= t.from - 0.01 && x1 <= t.to + 0.01,
);
const trackX = (x, z0, z1) => TRACK_X.some(
  (t) => Math.abs(t.at - x) < 0.01 && z0 >= t.from - 0.01 && z1 <= t.to + 0.01,
);

/* ------------------------------------------------------------------ *
 * The five elements, in the order a pilot meets them.
 * ------------------------------------------------------------------ */

/* Two arches on one axis, 16 m apart, in cells (1,1) and (2,1). */
const LOOP = { z: 139.0, xs: [24.0, 40.0], half: 3.50, head: 5.60, leg: 0.55 };
/* Twelve metres of wall, its face south, with two flooded cells in front. */
const WALL = { x0: 50.0, x1: 62.0, z: 152.6, t: 0.55, h: 7.00, target: 3.20 };
/* A bar at 12 m and a gate at 1.6 m directly under it. */
/*
 * A bar at 12 m and a gate at 1.6 m directly under it, both in the x = 24
 * plane, so the run is along X: east over the bar, half roll, half loop, back
 * west through the gate. `post` is 0.32 and not the 0.20 it started at: a
 * 12.5 m upright a fifth of a metre thick reads as a wire from twenty metres
 * out, and the uprights are the thing that says how high the bar is.
 */
const SPLITS = { x: 24.0, z0: 164.0, z1: 172.0, bar: 12.00, gate: 2.60, gateHalf: 1.60, post: 0.32 };
/*
 * なわとび: a low rail you hop, and the only element here you go OVER rather
 * than through.
 *
 * WHY IT IS LONG AND LOW. A jump rope is not one hop, it is a sequence: over
 * the rail, down the far side, back over it, and on down its length, which is
 * the same shape as a skipping rope and is where the trick gets its name. So
 * the rail is 30 m, which is four or five hops at freestyle speed, and the
 * pad is two cells so there is landing room on both sides of it rather than
 * water. Everything else in this field is a thing you fly THROUGH or AROUND
 * and it is placed to give the approach clear air; this one is placed to give
 * the run ALONG it clear air, which is why it sits on the south edge with the
 * open apron in front and nothing behind it until the loop's arches.
 *
 * WHY 2.60 m TO THE UNDERSIDE. Three tricks are flown here and they want
 * opposite things. A Jump Rope goes over, so the rail wants to be low enough
 * to pop rather than climb. A Side Loop and a Cinnamon Roll pass UNDER it, so
 * there has to be daylight beneath: `BAR_CLEAR_MIN` in src/game/obstacles.js
 * is 1.5 m and a five inch is 0.25 m across, so 2.60 m to the underside is
 * ten airframes of gap, which is flyable at speed without being a hole you
 * have to aim at. The rail itself is 0.22 m square, the same section as the
 * Split-S bar, which is the thinnest thing in this field that still reads as
 * solid from twenty metres.
 *
 * The uprights stand OUTSIDE the run, one at each end and none in the middle,
 * because a leg halfway along would be the one thing a pilot hopping down the
 * rail cannot see coming.
 */
const JUMP = {
  z: 125.0, x0: 66.0, x1: 96.0, bar: 2.60, t: 0.22, post: 0.26,
};
/* The mast, on the grid intersection at the middle of its four cells. */
const TOWER = { x: 96.0, z: 160.0, half: 1.50, h: 34.00, decks: [12.0, 24.0], leg: 0.16 };
const RINGS = [6.0, 10.0, 13.0];

export function buildTraining(ctx) {
  const m = mats();
  const rng = rngKit(9411);
  const out = { sakura: [], shrubs: [], grove: [], petals: [], references: {} };

  buildApron(ctx, m);
  buildGrid(ctx, m, rng);
  buildEntrance(ctx, m, out);
  buildLoop(ctx, m);
  buildJumpRope(ctx, m);
  buildWall(ctx, m);
  buildSplitS(ctx, m);
  buildTower(ctx, m);
  buildPractice(ctx, m);

  out.references.trainingTowerHeight = {
    measured: +TOWER.h.toFixed(2),
    unit: 'm',
    real: 'a suburban lattice mast, 20 to 50 m',
  };
  out.references.trainingLoopGap = {
    measured: +(LOOP.xs[1] - LOOP.xs[0]).toFixed(2),
    unit: 'm',
    real: 'far enough apart to fly the second half, 12 to 25 m',
  };
  out.references.trainingArchOpening = {
    measured: +(LOOP.half * 2).toFixed(2),
    unit: 'm',
    real: 'an arch a five inch takes at speed, 4 m and up',
  };
  out.references.trainingSplitEntry = {
    measured: +SPLITS.bar.toFixed(2),
    unit: 'm',
    real: 'enough height to finish a split-S, 10 m and up',
  };
  out.references.trainingJumpRail = {
    measured: +JUMP.bar.toFixed(2),
    unit: 'm',
    real: 'low enough to hop and high enough to fly under, 2 to 3.5 m',
  };
  out.references.trainingWallTap = {
    measured: +WALL.target.toFixed(2),
    unit: 'm',
    real: 'tap height for a five inch, 2 to 4 m',
  };
  return out;
}

/* ------------------------------------------------------------------ *
 * The ground under the field, which the town does not have.
 * ------------------------------------------------------------------ */

/*
 * THE TOWN'S TERRAIN RUNS OUT AT z = 140 AND THIS FIELD RUNS TO 188.
 *
 * `street.js` lays one 320 by 320 m displaced grid, centred and then shifted
 * 20 m south, so the drawn ground is x -160..160 and z -180..140 and nothing
 * else. Everything the town has ever built is inside that. This field is the
 * first thing that is not: measured from the air at the practice box's north
 * edge, the ground simply STOPPED at the last bund and there was sky under
 * the horizon for the rest of the frame.
 *
 * The sphere is not the answer either. `planet.js` says that out past the
 * grid "the sphere IS the ground", and it would be, if the town were baked
 * onto it. This map deliberately takes the flat authoring, so the sphere is
 * still drawn but it curves away underneath: at z = 188 flat it is 98 m
 * below, which is past the fog and reads as nothing at all.
 *
 * So the field brings its own. One flat quad in the terrain's own material,
 * 35 mm UNDER it so the overlap is hidden by the grid rather than z-fighting
 * with it, big enough that its own edge is outside the fog from anywhere a
 * pilot can stand in the field: High's fog closes at 65 m, the field's far
 * corner is (128, 188), so the nearest apron edge is 72 m further out than
 * anything anyone can see. Drawn only, and no platform: `heightAt` is a
 * function and already answers 0.45 out here.
 */
const APRON = { x0: -150.0, x1: 270.0, z0: 128.0, z1: 300.0 };

function buildApron(ctx, m) {
  const a = APRON;
  const g = new THREE.PlaneGeometry(a.x1 - a.x0, a.z1 - a.z0);
  g.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(g, m.terrain);
  mesh.position.set((a.x0 + a.x1) / 2, GROUND - 0.035, (a.z0 + a.z1) / 2);
  mesh.receiveShadow = true;
  mesh.name = 'trainingGround';
  ctx.add(mesh);
}

/* ------------------------------------------------------------------ *
 * The paddy grid: bunds, water, pads and the 農道.
 * ------------------------------------------------------------------ */

/*
 * Platform rectangles overlap by this much, and the drawn boxes do not.
 *
 * `heightAt` tests a platform with strict `>` and `<`, so the shared EDGE
 * between two rectangles belongs to neither and the query falls through to
 * bare ground there. Everywhere else in the town that is invisible, because
 * a roof is one rectangle on its own. Here ninety of them tile edge to edge,
 * and a sample landing exactly on a seam reads 0.30 m low. In flight the odds
 * of hitting x = 96.000000 are nil, but a spawn or a reset is seated at an
 * authored coordinate, and the authored coordinates ARE the seams: the mast
 * centre is 96, 160, which is a corner where four of them meet.
 *
 * Two millimetres of overlap covers every seam twice, and `heightAt` takes
 * the max, so where a proud track meets a bund the track wins, which is the
 * right answer. Nothing drawn and nothing solid moves: this is the height
 * query only.
 */
const PEPS = 0.002;

function buildGrid(ctx, m, rng) {
  const paddy = m.paddyWater;
  const earth = m.paddyBund;
  const gravel = m.gravel;
  const half = W / 2;

  /*
   * The cells: water or gravel, one box each.
   *
   * Water is SOLID to its surface, the same rule the pool hall's water is
   * drawn under: a quad that meets water is in it. A platform on top puts the
   * height query on the same plane so the readout agrees with the drawing.
   */
  for (let j = 0; j < NZ; j += 1) {
    for (let i = 0; i < NX; i += 1) {
      const x0 = cellX0(i) + half;
      const x1 = cellX0(i + 1) - half;
      const z0 = cellZ0(j) + half;
      const z1 = cellZ0(j + 1) - half;
      if (isPad(i, j)) {
        slab(ctx, gravel, x0, GROUND, z0, x1, BUND_TOP, z1, { name: 'trainingPad', cast: false });
        ctx.platform({ x0: x0 - PEPS, z0: z0 - PEPS, x1: x1 + PEPS, z1: z1 + PEPS, top: BUND_TOP });
        continue;
      }
      slab(ctx, paddy, x0, GROUND, z0, x1, WATER_TOP, z1, { name: 'trainingPaddy', cast: false });
      ctx.platform({ x0: x0 - PEPS, z0: z0 - PEPS, x1: x1 + PEPS, z1: z1 + PEPS, top: WATER_TOP });
      /* The young rice, as one flat tone over the water rather than as
       * blades. A paddy in spring is water with a green haze on it, and at
       * the height this is read from that is a colour and not geometry. */
      if (rng.chance(0.72)) {
        patch(ctx, 0x86a86a, {
          x: (x0 + x1) / 2, y: WATER_TOP + 0.02, z: (z0 + z1) / 2,
          w: (x1 - x0) * 0.86, d: (z1 - z0) * 0.86, opacity: 0.42, name: 'trainingRice',
        });
      }
    }
  }

  /*
   * The grid lines. EVERY segment gets exactly one box and the only question
   * is which: gravel and 20 mm proud where it is a track, earth where either
   * cell beside it holds water, and gravel at bund height where both cells
   * are dry, which is the filler that makes the mast's four cells one pad
   * rather than four islands with a trench between them.
   */
  const pick = (a, b, track) => {
    if (track) {
      return { mat: gravel, top: TRACK_TOP, name: 'trainingTrack' };
    }
    if (wet(a[0], a[1]) || wet(b[0], b[1])) {
      return { mat: earth, top: BUND_TOP, name: 'trainingBund' };
    }
    return { mat: gravel, top: BUND_TOP, name: 'trainingPad' };
  };

  /* Along x, at every z line. These own the intersections. */
  for (let j = 0; j <= NZ; j += 1) {
    const z = cellZ0(j);
    for (let i = 0; i < NX; i += 1) {
      const x0 = cellX0(i);
      const x1 = cellX0(i + 1);
      const p = pick([i, j - 1], [i, j], trackZ(z, x0, x1));
      slab(ctx, p.mat, x0, GROUND, z - half, x1, p.top, z + half, { name: p.name, cast: false });
      ctx.platform({
        x0: x0 - PEPS, z0: z - half - PEPS, x1: x1 + PEPS, z1: z + half + PEPS, top: p.top,
      });
    }
  }
  /* And along z, inset by half a width at each end so the crossings are
   * shared faces and never shared volumes. */
  for (let i = 0; i <= NX; i += 1) {
    const x = cellX0(i);
    for (let j = 0; j < NZ; j += 1) {
      const z0 = cellZ0(j) + half;
      const z1 = cellZ0(j + 1) - half;
      const p = pick([i - 1, j], [i, j], trackX(x, z0, z1));
      slab(ctx, p.mat, x - half, GROUND, z0, x + half, p.top, z1, { name: p.name, cast: false });
      ctx.platform({
        x0: x - half - PEPS, z0: z0 - PEPS, x1: x + half + PEPS, z1: z1 + PEPS, top: p.top,
      });
    }
  }
  /*
   * And the spur. The works' north fence has a panel flattened at x 30 to 34
   * and this is the four and a half metres between it and the grid's south
   * edge, on the same line, so a pilot leaving the works through the hole
   * somebody walked over is already on the track.
   */
  slab(ctx, gravel, 32.0 - half, GROUND, 113.4, 32.0 + half, TRACK_TOP, GZ0 - half,
    { name: 'trainingTrack', cast: false });
  ctx.platform({
    x0: 32.0 - half - PEPS, z0: 113.4, x1: 32.0 + half + PEPS, z1: GZ0 - half + PEPS, top: TRACK_TOP,
  });
}

/**
 * A painted marking on a pad: the name of the thing standing on it.
 *
 * Laid 20 mm over the gravel and never solid, because it is paint. The plate
 * is opaque, so it merges with everything else drawn in this town rather than
 * holding a transparent bucket open for the life of the map.
 */
function mark(ctx, tex, x, z, w, ry = 0) {
  return board(ctx, tex, {
    x, y: PAINT_Y, z, w, h: w / 4, rx: -Math.PI / 2, ry, name: 'trainingMark',
  });
}

/* ------------------------------------------------------------------ *
 * The way in, and the two boards that say what this is.
 * ------------------------------------------------------------------ */

function buildEntrance(ctx, m, out) {
  const z = 121.5;
  const gx = 32.0;
  /* A gate frame over the track, which is what every 練習場 in the country
   * has and is the one thing that turns a field into a place. Two posts and
   * a beam, and the beam is 3.2 m up so it is a gate you fly as well as a
   * gate you read. */
  for (const x of [gx - 2.6, gx + 2.6]) {
    post(ctx, m.metal, x, z, GROUND, GROUND + 3.70, 0.12, { name: 'trainingGatePost' });
  }
  slab(ctx, m.wood, gx - 2.72, GROUND + 3.20, z - 0.10, gx + 2.72, GROUND + 3.70, z + 0.10,
    { name: 'trainingGateBeam' });
  board(ctx, fieldName(), {
    x: gx, y: GROUND + 3.45, z: z - 0.12, w: 4.90, h: 1.23, ry: Math.PI, name: 'trainingSign',
  });

  /* The guide board, on the track edge where a pilot arriving stops. The
   * town's own notice board, so it is the same object as the one at the
   * school gate. */
  ctx.add(makeNoticeBoard({
    ctx, x: 36.4, z: 124.0, y: BUND_TOP, ry: -Math.PI / 2, w: 2.2, h: 1.6, y0: 0.95,
    sheets: [{ map: fieldGuide(), w: 1.42, h: 1.40, x: 0, y: 0 }],
  }));
  ctx.add(makeBench({ ctx, keep: true, x: 38.6, z: 127.6, y: BUND_TOP, ry: -Math.PI / 2 }));

  /* Two cherries at the gate, because the town's tree line does not stop at
   * the last fence and this is the one place in the field with anything to
   * stand beside. `keep: true`: they are the composition. */
  out.sakura.push({ x: 45.6, z: 120.4, y: GROUND, scale: 1.0, seed: 9421, keep: true });
  out.sakura.push({ x: 40.2, z: 129.6, y: GROUND, scale: 0.9, seed: 9422, keep: true, lean: 0.1 });
  out.petals.push({ x: 42.0, z: 124.0, w: 8.0, d: 6.0, y: BUND_TOP, n: 80 });
}

/* ------------------------------------------------------------------ *
 * パワーループ: two arches, and the second one is the point.
 * ------------------------------------------------------------------ */

function buildLoop(ctx, m) {
  for (const x of LOOP.xs) {
    arch(ctx, m, x, LOOP.z, LOOP.half, LOOP.head, LOOP.leg);
  }
  mark(ctx, markLoop(), (LOOP.xs[0] + LOOP.xs[1]) / 2, LOOP.z + 4.2, 12.0);
  /* And on the beam of the first arch, on both faces, because an arch is
   * flown from either side and the beam is the one part of it a pilot lines
   * up on. A ground plate is read from the air and is edge on from the
   * approach; this is the other way round, and the element needs both. */
  for (const face of [-1, 1]) {
    board(ctx, markLoop(), {
      x: LOOP.xs[0] + face * (LOOP.leg / 2 + 0.03), y: GROUND + LOOP.head + 0.25,
      z: LOOP.z, w: 6.40, h: 1.60, ry: face > 0 ? Math.PI / 2 : -Math.PI / 2,
      name: 'trainingArchName',
    });
  }
  /* The centre line between them, so the axis is a line on the ground and
   * not a thing you have to imagine. */
  decal(ctx, m.lineWhite, LOOP.xs[0] - 6.0, PAINT_Y - 0.02, LOOP.z - 0.07,
    LOOP.xs[1] + 6.0, PAINT_Y, LOOP.z + 0.07, { name: 'trainingLine' });
  /* Distance ticks every four metres along it. */
  for (let x = LOOP.xs[0] - 4.0; x <= LOOP.xs[1] + 4.0; x += 4.0) {
    decal(ctx, m.lineWhite, x - 0.07, PAINT_Y - 0.02, LOOP.z - 0.55, x + 0.07, PAINT_Y, LOOP.z + 0.55,
      { name: 'trainingLine' });
  }
}

/*
 * One arch: two legs, a beam and a stepped haunch in each top corner.
 *
 * NOT A CURVE, and the reason is the collider. A drawn curve is rotated
 * boxes, and a rotated box's collider is its axis aligned hull: over an arch
 * soffit that hull is a slab straight across the opening, so the hole a pilot
 * can see would be solid. Three steps in each corner, each drawn exactly as
 * it is solid, gives the corner the turn an arch has and leaves the opening
 * the size it looks. 7.0 m clear between the legs and 5.6 m to the beam, with
 * the corners cut back to 5.0.
 *
 * The safety band round the opening is not decoration either. A pale steel
 * frame against a pale sky is a shape whose HOLE is hard to find at speed;
 * the yellow is the only thing in the frame the eye lands on, and it is on
 * the edge the pilot has to miss.
 */
function arch(ctx, m, x, z, half, head, leg) {
  const beamTop = head + 0.50;
  for (const s of [-1, 1]) {
    const zc = z + s * (half + leg / 2);
    slab(ctx, m.archSteel, x - leg / 2, GROUND, zc - leg / 2, x + leg / 2, GROUND + head, zc + leg / 2,
      { name: 'trainingArchLeg' });
    slab(ctx, m.concreteMid, x - 0.55, GROUND, zc - 0.55, x + 0.55, GROUND + 0.30, zc + 0.55,
      { name: 'trainingArchBase' });
    /* The haunch: three steps turning the square corner into a shoulder. */
    const STEPS = [[0.60, 0.20], [0.40, 0.38], [0.20, 0.54]];
    for (const [drop, reach] of STEPS) {
      slab(ctx, m.archSteel,
        x - leg / 2, GROUND + head - drop, z + s * (half - reach),
        x + leg / 2, GROUND + head, z + s * half,
        { name: 'trainingArch' });
    }
  }
  /* The beam, wall to wall over the top of both legs. */
  slab(ctx, m.archSteel, x - leg / 2, GROUND + head, z - half - leg, x + leg / 2, GROUND + beamTop,
    z + half + leg, { name: 'trainingArch' });
  /* The band: up the inside of each leg and along the soffit. */
  for (const s of [-1, 1]) {
    decal(ctx, m.yellow, x - leg / 2 - 0.03, GROUND + 0.30, z + s * half - 0.05,
      x + leg / 2 + 0.03, GROUND + head - 0.62, z + s * half + 0.05, { name: 'trainingArchBand' });
  }
  decal(ctx, m.yellow, x - leg / 2 - 0.03, GROUND + head - 0.10, z - half + 0.60,
    x + leg / 2 + 0.03, GROUND + head, z + half - 0.60, { name: 'trainingArchBand' });
}

/* ------------------------------------------------------------------ *
 * なわとび: the low rail, and the length of it.
 * ------------------------------------------------------------------ */

function buildJumpRope(ctx, m) {
  const j = JUMP;
  const y = GROUND + j.bar;
  /* The two uprights, at the ends and nowhere else. Each stands on the same
   * concrete pad every other upright in this field stands on, so the base of
   * a thing is the same shape wherever you meet it. */
  for (const x of [j.x0, j.x1]) {
    post(ctx, m.archSteel, x, j.z, GROUND, y + j.t + 0.40, j.post / 2,
      { name: 'trainingJumpPost' });
    slab(ctx, m.concreteMid, x - 0.45, GROUND, j.z - 0.45, x + 0.45, GROUND + 0.26, j.z + 0.45,
      { name: 'trainingJumpBase' });
  }
  /*
   * The rail. Solid, for the same reason the Split-S bar is: a drawn bar you
   * can pass through is the same lie as an invisible wall, only the other way
   * round. It is what src/game/obstacles.js derives a BAR from, and every
   * powerloop, matty and jump rope in the recogniser needs one to exist.
   */
  slab(ctx, m.archSteel, j.x0, y, j.z - j.t / 2, j.x1, y + j.t, j.z + j.t / 2,
    { name: 'trainingJumpRail' });
  /* The band along the top of it, on the edge the pilot has to clear. The
   * arches use the same yellow on the edge you have to miss. */
  decal(ctx, m.yellow, j.x0, y + j.t, j.z - j.t / 2 - 0.03, j.x1, y + j.t + 0.03,
    j.z + j.t / 2 + 0.03, { name: 'trainingJumpBand' });

  mark(ctx, markJump(), (j.x0 + j.x1) / 2, j.z + 4.6, 12.0);
  /*
   * THE HOP MARKS, which are what make this element teachable rather than
   * just present. A jump rope is a rhythm, and a pilot cannot find a rhythm
   * against a bare 30 m rail because there is nothing to say whether this hop
   * landed where the last one did. Six ticks at five metre spacing, painted
   * on both sides, are the beat: cross on a tick, land on the next.
   */
  for (let x = j.x0 + 5.0; x <= j.x1 - 4.0; x += 5.0) {
    for (const side of [-1, 1]) {
      decal(ctx, m.lineWhite, x - 0.08, PAINT_Y - 0.02, j.z + side * 2.2 - 0.55,
        x + 0.08, PAINT_Y, j.z + side * 2.2 + 0.55, { name: 'trainingLine' });
    }
  }
  /* The rail's own line on the ground, so its axis is a thing you can see
   * from the approach rather than a shadow. */
  decal(ctx, m.lineWhite, j.x0 - 4.0, PAINT_Y - 0.02, j.z - 0.07,
    j.x1 + 4.0, PAINT_Y, j.z + 0.07, { name: 'trainingLine' });
}

/* ------------------------------------------------------------------ *
 * ウォールタップ: the wall, and the thirty metres in front of it.
 * ------------------------------------------------------------------ */

function buildWall(ctx, m) {
  const w = WALL;
  slab(ctx, m.concrete, w.x0, GROUND, w.z - w.t / 2, w.x1, GROUND + w.h, w.z + w.t / 2,
    { name: 'trainingWall' });
  /* The coping, and the buttresses on the back. A 12 by 7 m slab standing on
   * its own edge with nothing holding it up is the one thing here a pilot
   * would look at twice for the wrong reason. */
  decal(ctx, m.concreteMid, w.x0 - 0.10, GROUND + w.h, w.z - w.t / 2 - 0.10,
    w.x1 + 0.10, GROUND + w.h + 0.16, w.z + w.t / 2 + 0.10,
    { name: 'trainingWallCap', noOutline: false });
  for (const x of [w.x0 + 1.6, (w.x0 + w.x1) / 2, w.x1 - 1.6]) {
    slab(ctx, m.concreteMid, x - 0.30, GROUND, w.z + w.t / 2, x + 0.30, GROUND + 2.60, w.z + w.t / 2 + 1.40,
      { name: 'trainingButtress' });
  }
  /* The target, at tap height, on the face that has the run at it. */
  board(ctx, wallTarget(), {
    x: (w.x0 + w.x1) / 2, y: GROUND + w.target, z: w.z - w.t / 2 - 0.03, w: 3.60, h: 3.60,
    ry: Math.PI, transparent: true, name: 'trainingTarget',
  });
  /* And the line at tap height right across the wall, so the height is
   * readable from an approach that is not dead centre. */
  decal(ctx, m.lineWhite, w.x0, GROUND + w.target - 0.05, w.z - w.t / 2 - 0.02,
    w.x1, GROUND + w.target + 0.05, w.z - w.t / 2, { name: 'trainingTapLine' });
  mark(ctx, markWall(), (w.x0 + w.x1) / 2, w.z - 4.0, 11.0);
  /* And again on the wall itself, over the target. A plate on the ground is
   * read from the air and squashed to nothing from the approach, which is the
   * one direction this element is ever looked at from. */
  board(ctx, markWall(), {
    x: (w.x0 + w.x1) / 2, y: GROUND + 5.90, z: w.z - w.t / 2 - 0.03, w: 7.20, h: 1.80,
    ry: Math.PI, name: 'trainingWallName',
  });
}

/* ------------------------------------------------------------------ *
 * スプリットＳ: a bar at twelve metres and a gate under it.
 * ------------------------------------------------------------------ */

function buildSplitS(ctx, m) {
  const s = SPLITS;
  for (const z of [s.z0, s.z1]) {
    post(ctx, m.metal, s.x, z, GROUND, GROUND + s.bar + 0.5, s.post / 2, { name: 'trainingSplitPost' });
    slab(ctx, m.concreteMid, s.x - 0.50, GROUND, z - 0.50, s.x + 0.50, GROUND + 0.26, z + 0.50,
      { name: 'trainingSplitBase' });
    /* The metre marks, every two metres up the upright, which is what puts
     * the entry height on the object instead of in the HUD. */
    for (let n = 2; n <= 12; n += 2) {
      board(ctx, heightMark(n), {
        x: s.x - s.post / 2 - 0.02, y: GROUND + n, z, w: 0.42, h: 0.42, ry: -Math.PI / 2,
        name: 'trainingHeight',
      });
    }
  }
  /* The bar. Solid, because a drawn bar you can pass through is the same lie
   * as an invisible wall, only the other way round. */
  slab(ctx, m.metal, s.x - 0.11, GROUND + s.bar, s.z0, s.x + 0.11, GROUND + s.bar + 0.22, s.z1,
    { name: 'trainingSplitBar' });
  decal(ctx, m.yellow, s.x - 0.14, GROUND + s.bar - 0.03, s.z0, s.x + 0.14, GROUND + s.bar, s.z1,
    { name: 'trainingSplitBand' });

  /* The gate under it: 3.2 m wide, 2.6 m to the soffit, on the same axis and
   * the same centre, so the exit is directly below the entry. */
  const gz = (s.z0 + s.z1) / 2;
  for (const dz of [-s.gateHalf, s.gateHalf]) {
    post(ctx, m.metal, s.x, gz + dz, GROUND, GROUND + s.gate + 0.24, 0.09, { name: 'trainingGatePost' });
  }
  slab(ctx, m.metal, s.x - 0.09, GROUND + s.gate, gz - s.gateHalf - 0.09,
    s.x + 0.09, GROUND + s.gate + 0.24, gz + s.gateHalf + 0.09, { name: 'trainingGateBar' });
  decal(ctx, m.yellow, s.x - 0.12, GROUND + s.gate - 0.04, gz - s.gateHalf,
    s.x + 0.12, GROUND + s.gate, gz + s.gateHalf, { name: 'trainingGateBand' });

  /* The label reads ALONG the run, which is x, and sits five metres south of
   * it so it is not under the gate a pilot is aiming at. */
  mark(ctx, markSplitS(), s.x, 162.6, 11.0);
}

/* ------------------------------------------------------------------ *
 * オービット: the mast, and the rings that make a radius visible.
 * ------------------------------------------------------------------ */

function buildTower(ctx, m) {
  const t = TOWER;
  const legs = [
    [t.x - t.half, t.z - t.half], [t.x + t.half, t.z - t.half],
    [t.x - t.half, t.z + t.half], [t.x + t.half, t.z + t.half],
  ];
  /*
   * FOUR LEGS AND NOT A SHAFT. A 3 m solid column is a 34 m wall to orbit
   * round: the pilot's own prop wash comes back off it and there is nothing
   * to see through. Four 0.32 m legs with the air between them is a mast,
   * and it is also what one actually is.
   */
  for (const [x, z] of legs) {
    post(ctx, m.metalDark, x, z, GROUND, GROUND + t.h, t.leg, { name: 'trainingMastLeg' });
    slab(ctx, m.concreteMid, x - 0.50, GROUND, z - 0.50, x + 0.50, GROUND + 0.40, z + 0.50,
      { name: 'trainingMastBase' });
  }
  /* Belts every four metres and the diagonals between them. Drawn only: a
   * 60 mm angle is not a thing to be stopped by, and the four legs are
   * already the solid the pilot has to respect. */
  for (let y = GROUND + 4.0; y < GROUND + t.h; y += 4.0) {
    for (const s of [-1, 1]) {
      decal(ctx, m.metalDark, t.x - t.half - 0.05, y, t.z + s * t.half - 0.05,
        t.x + t.half + 0.05, y + 0.14, t.z + s * t.half + 0.05, { name: 'trainingMastBelt', noOutline: false });
      decal(ctx, m.metalDark, t.x + s * t.half - 0.05, y, t.z - t.half - 0.05,
        t.x + s * t.half + 0.05, y + 0.14, t.z + t.half + 0.05, { name: 'trainingMastBelt', noOutline: false });
    }
  }
  /*
   * The two decks. Landable, and the reason they are at 12 and 24 rather
   * than anywhere else is that a hurricane is flown BETWEEN two references
   * and 12 m apart is what a five inch can hold.
   */
  for (const y of t.decks) {
    deck(ctx, m.metal, t.x - 2.20, t.z - 2.20, t.x + 2.20, t.z + 2.20, GROUND + y,
      { thick: 0.24, name: 'trainingMastDeck' });
    /* The handrail round it, as four thin runs, and it is solid: it is the
     * thing that catches a landing that came in flat. */
    for (const s of [-1, 1]) {
      slab(ctx, m.metal, t.x - 2.20, GROUND + y, t.z + s * 2.20 - 0.05,
        t.x + 2.20, GROUND + y + 0.95, t.z + s * 2.20 + 0.05, { name: 'trainingMastRail' });
      slab(ctx, m.metal, t.x + s * 2.20 - 0.05, GROUND + y, t.z - 2.15,
        t.x + s * 2.20 + 0.05, GROUND + y + 0.95, t.z + 2.15, { name: 'trainingMastRail' });
    }
  }
  /*
   * The head: a frame and three panel antennas, which is what says radio
   * mast rather than scaffold.
   *
   * A deck and not a slab, because it is a roof and the town makes every
   * roof landable. A slab is solid, so a quad set down on it does stop, but
   * the surface query would go on answering with the deck 10 m below and the
   * sim would think the quad was 10 m in the air: wrong clearance, wrong
   * camera floor. Somebody WILL try to perch on top of the tallest thing
   * here. The copings on the tap wall stay slabs, which is also the town's
   * rule: 0.75 m of parapet is a ledge, not a floor.
   */
  deck(ctx, m.metalDark, t.x - t.half - 0.35, t.z - t.half - 0.35,
    t.x + t.half + 0.35, t.z + t.half + 0.35, GROUND + t.h + 0.30,
    { thick: 0.30, name: 'trainingMastHead' });
  const panels = [[0, -1], [0.87, 0.5], [-0.87, 0.5]];
  panels.forEach(([dx, dz], i) => {
    const px = t.x + dx * (t.half + 0.55);
    const pz = t.z + dz * (t.half + 0.55);
    slab(ctx, m.white, px - 0.16, GROUND + t.h + 0.30, pz - 0.16, px + 0.16, GROUND + t.h + 2.10, pz + 0.16,
      { name: `trainingAntenna${i}` });
  });
  /* The mast light, and the pole it is on. */
  slab(ctx, m.metalDark, t.x - 0.06, GROUND + t.h + 0.30, t.z - 0.06,
    t.x + 0.06, GROUND + t.h + 3.20, t.z + 0.06, { name: 'trainingMastPole' });
  decal(ctx, m.red, t.x - 0.16, GROUND + t.h + 3.20, t.z - 0.16,
    t.x + 0.16, GROUND + t.h + 3.50, t.z + 0.16, { name: 'trainingMastLamp', noOutline: false });

  /* The banner, down the face a pilot arrives at. */
  board(ctx, towerBanner(), {
    x: t.x, y: GROUND + 7.60, z: t.z - t.half - 0.06, w: 1.90, h: 7.60, ry: Math.PI,
    name: 'trainingBanner',
  });

  /*
   * THE RINGS, and they are the whole reason this is a trainer rather than a
   * mast. Three painted circles at 6, 10 and 14 m: a pilot flying an orbit
   * can see which one they are on and whether they are holding it. Drawn as
   * a ring of short chords, which is what paint on gravel is anyway.
   */
  for (const r of RINGS) {
    const n = Math.max(24, Math.round(r * 4));
    const parts = [];
    for (let k = 0; k < n; k += 1) {
      const a = (k / n) * Math.PI * 2;
      parts.push([t.x + Math.cos(a) * r, t.z + Math.sin(a) * r, a]);
    }
    for (const [px, pz, a] of parts) {
      const g = new THREE.PlaneGeometry((Math.PI * 2 * r) / n + 0.12, 0.16);
      g.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(g, r === 10.0 ? m.ringMid : m.ringLine);
      mesh.position.set(px, PAINT_Y, pz);
      /*
       * `-a - PI/2`, and the half turn is the whole difference between a
       * ring and a compass rose. `rotateX(-PI/2)` puts the plate's long axis
       * on world +X, and a Y rotation by t sends +X to (cos t, 0, -sin t):
       * at t = -a that is the RADIAL direction, so the first pass drew
       * fourteen dozen little spokes pointing out of the mast. The tangent
       * wants (-sin a, 0, cos a), which is t = -(a + PI/2).
       */
      mesh.rotation.y = -a - Math.PI / 2;
      mesh.userData.noOutline = true;
      mesh.name = 'trainingRingTrim';
      ctx.add(mesh);
    }
  }
  mark(ctx, markOrbit(), t.x + 8.0, t.z - 10.6, 9.0);
}

/* ------------------------------------------------------------------ *
 * 自由練習: the far end, with nothing in it.
 * ------------------------------------------------------------------ */

function buildPractice(ctx, m) {
  const x0 = cellX0(2) + W / 2;
  const x1 = cellX0(5) - W / 2;
  const z0 = cellZ0(4) + W / 2;
  const z1 = cellZ0(5) - W / 2;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  /* A box marked on the ground and nothing standing in it. The lines are
   * what turn open ground into a place you can tell you are in the middle
   * of, which is the only thing free practice needs. */
  for (const z of [z0 + 1.5, z1 - 1.5]) {
    decal(ctx, m.lineWhite, x0 + 1.5, PAINT_Y - 0.02, z - 0.08, x1 - 1.5, PAINT_Y, z + 0.08,
      { name: 'trainingLine' });
  }
  for (const x of [x0 + 1.5, x1 - 1.5]) {
    decal(ctx, m.lineWhite, x - 0.08, PAINT_Y - 0.02, z0 + 1.5, x + 0.08, PAINT_Y, z1 - 1.5,
      { name: 'trainingLine' });
  }
  /* A centre circle, same construction as the mast's rings. */
  const r = 4.0;
  const n = 28;
  for (let k = 0; k < n; k += 1) {
    const a = (k / n) * Math.PI * 2;
    const g = new THREE.PlaneGeometry((Math.PI * 2 * r) / n + 0.12, 0.14);
    g.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(g, m.ringLine);
    mesh.position.set(cx + Math.cos(a) * r, PAINT_Y, cz + Math.sin(a) * r);
    mesh.rotation.y = -a - Math.PI / 2;
    mesh.userData.noOutline = true;
    mesh.name = 'trainingRingTrim';
    ctx.add(mesh);
  }
  mark(ctx, markPractice(), cx, cz - 7.6, 12.0);

  /* One wind sock at the corner, which is the only thing a flying field
   * really has to have and the only moving-looking thing out here. */
  post(ctx, m.metal, x1 - 2.2, z0 + 2.2, GROUND, GROUND + 5.20, 0.08, { name: 'trainingSockPost' });
  slab(ctx, m.orangeSock, x1 - 2.2, GROUND + 4.30, z0 + 2.2, x1 + 0.6, GROUND + 4.90, z0 + 2.9,
    { name: 'trainingSock' });
  decal(ctx, m.white, x1 + 0.6, GROUND + 4.42, z0 + 2.2, x1 + 1.5, GROUND + 4.78, z0 + 2.78,
    { name: 'trainingSockTip', noOutline: false });
}

export const TRAINING_SITE = { x0: GX0, x1: GX0 + NX * CW, z0: GZ0, z1: GZ0 + NZ * CD };
export const TRAINING_LANDMARK = { x: TOWER.x, z: TOWER.z, top: GROUND + TOWER.h };
export const TRAINING_WELLS = [];
