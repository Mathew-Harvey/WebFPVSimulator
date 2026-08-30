/*
 * pool.js: ひばり台市民プール, the municipal pool on the works road.
 *
 * WHAT THIS IS. The 市民プール every Japanese town of this size has, on the
 * last piece of flat land before the fields: a 25 m outdoor lido, an indoor
 * hall that runs all year, a changing block with a flat roof and a water tank
 * on it, a filter house, a chain link fence and a gate with the hours on it.
 *
 * THE OUTDOOR POOL IS DRAINED, AND THAT IS THE WHOLE DESIGN.
 *
 * It is April. The notice by the ticket window says the outdoor pool opens on
 * the first of July, and until then it is an empty tiled bowl with last
 * autumn's leaves in the deep end and this spring's blossom drifting into it.
 * That is true of every municipal pool in the country for nine months of the
 * year, it is the reason a pool is the second thing after a bando that people
 * fly, and it is the only way this place gives a pilot something to CARVE:
 * twenty five metres of tiled floor, a shallow end, a step down, a deep end,
 * and vertical walls all the way round to ride. Municipal baths, the
 * standalone map this one is a suburb sized answer to, drains its 50 m hall
 * for exactly the same reason and says so: there is no water mesh anywhere in
 * that folder, only the white band a drained pool leaves on the tile.
 *
 * THE INDOOR POOL HAS WATER IN IT, and having one of each is the point. The
 * hall is open all year, so it is 25 m of water under a flat roof with a door
 * at each end, and a pilot who wants the surface to be solid and the light to
 * come off it has it, thirty metres from a bowl that is dry.
 *
 * HOW THE BOWL IS SOLID, and it is the one thing here that is not a box.
 * `world.heightAt` answers with the ground, and the ground over an empty pool
 * is not the ground: without help a quad hovering over the deep end reads
 * itself as sitting on a surface 2.55 m above the tile it can see. The town
 * already has the mechanism, because the canal needed it: `ctx.cut` pulls the
 * ground DOWN over a rectangle, and `heightAt` takes the minimum over the
 * cuts before it takes the maximum over the platforms. Two cuts, one per
 * floor level, and the bowl is a bowl to the height query as well as to the
 * eye.
 *
 * THE FLIGHT LINES.
 *
 *   1. THE BOWL. In over the coping at the shallow end, down the 0.9 m
 *      shelf, over the step, along the 2.55 m deep end and out over the far
 *      wall. Twenty five metres of transition with a wall on both sides.
 *   2. THROUGH THE HALL, west to east. A 4.6 m door in each gable, floor to
 *      4.4 m, twenty eight metres apart, with 25 m of water and three lane
 *      ropes under you.
 *   3. THROUGH THE HALL, the other way and higher. The clerestory band is a
 *      real 1.5 m opening on BOTH long faces at 5.6 to 7.1 m, so the hall
 *      crosses at high level as well as at low. Same lesson Industrial bando
 *      wrote down three times: punch the far face or the shape is a dive.
 *   4. THE ENTRANCE CORRIDOR. The changing block is twelve metres deep and
 *      the way through it is a 2.2 m corridor from the forecourt to the pool
 *      deck. In off the road, through the building, out onto the deck.
 *   5. UNDER THE GALLERY inside the hall, under the 監視台's seat, under the
 *      springboard, and over the roof of the changing block, which is
 *      landable and is the best place on the site to sit and look at the
 *      town.
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

import { PAL } from '../vendored/core/palette.js';
import { rngKit } from '../vendored/core/util.js';
import { meshFence, railing } from '../vendored/world/ground.js';
import { makeBikeRack, makeBench } from '../vendored/world/props.js';
import {
  GROUND, mats, slab, decal, hit, deck, post, wallPanel, board, patch,
} from './kit.js';
import { poolName, poolHours, poolRules, poolDepth } from './signs.js';

/* The compound. X runs west (the gate end, nearest the works) to east; z runs
 * away from the works road, which is at z 78.8. */
const SITE = { x0: 53.0, x1: 91.0, z0: 82.6, z1: 114.0 };
const GATE = { x0: 57.0, x1: 61.0 };

/* 管理棟: the changing block, with the way in cut straight through it. */
/*
 * 管理棟, the changing block, and its NORTH END IS AT 96.0 because of what
 * the corridor through it opens onto.
 *
 * At 98.2 the corridor's far end came out 1.25 m short of the hall's west
 * gable, which is blind at that point: a 2.2 m tunnel twelve metres long
 * ending in a wall, and a 1.25 m slot between two buildings on top of it.
 * Probed rather than noticed. At 96.0 the corridor puts you on the pool deck
 * with three and a half metres of air before the hall, which is what an
 * entrance is for.
 */
const BLOCK = { x0: 54.6, x1: 61.4, z0: 86.8, z1: 96.0, roof: 3.80, parapet: 4.20 };
const CORRIDOR = { x0: 57.0, x1: 59.2, y1: 2.85 };
const TANK = { x0: 55.4, x1: 58.6, z0: 91.6, z1: 94.4, top: 5.20 };

/*
 * The lido. 25 m by 9, five lanes at 1.8, which is what a town pool actually
 * is: eight lanes and 50 m belongs to a prefectural centre, and Municipal
 * baths already has that map.
 *
 * Two floor levels and one riser rather than a ramp, and it is not a
 * simplification. A tiled municipal pool IS two flats and a step: the whole
 * shallow end is one depth so a class can stand up in it. It also means the
 * drawn floor and the solid floor are the same two boxes, with no staircase
 * approximating a slope and no rotated box whose collider is its hull.
 */
const LIDO = {
  x0: 63.6, x1: 88.6, z0: 87.6, z1: 96.6,
  wall: 0.30, coping: 0.42,
  step: 74.0,             // where the floor drops
  /* The two depths, and they are the two numbers on the 水深 plates set into
   * the coping. A plate that does not match the floor under it is the kind of
   * detail that is worse than no plate at all. */
  shallow: 1.00,
  deep: 2.50,
};
/*
 * The deck, and its four numbers are set by the hole rather than by taste.
 * `cutGround` removes every terrain triangle with a vertex inside the basin
 * and the grid is 2 m, so the hole it leaves is measured at x 62..90,
 * z 86..98. The deck's outer edge has to be outside all four of those, with
 * margin, because it is what seals the cut. x0 shares a face with the
 * changing block's outer wall so there is no sliver of terrain between them.
 */
const DECK = { x0: 61.53, x1: 90.60, z0: 84.60, z1: 98.60 };

/* 屋内プール: the hall. Flat RC roof, a door in each gable, and a clerestory
 * band that goes all the way through. */
const HALL = {
  x0: 58.0, x1: 86.0, z0: 99.6, z1: 112.6, t: 0.30, roof: 7.60, parapet: 8.10,
};
const HALL_DOOR = { z0: 103.4, z1: 108.0, y1: 4.40 };
/*
 * The clerestory band, and its height is set by the roof beams rather than by
 * taste. The beams sit at 6.60 to 6.95 under a 7.32 m soffit, and they run
 * the full depth of the hall, so a band at 5.6 to 7.1 would put a 0.35 m
 * beam across the far end of a line the moment it came through the wall.
 * 4.80 to 6.30 passes under every one of them.
 */
const CLERE = { x0: 62.0, x1: 82.0, y0: 4.80, y1: 6.30 };
/*
 * THE HALL FLOOR IS RAISED, AND IT IS NOT A DETAIL.
 *
 * The town's terrain is one drawn grid at `groundY - 0.015`, and nothing
 * below that is visible unless a hole is cut in it. A pool whose water sits
 * 0.13 m below the deck, which is what a real one does, therefore has its
 * water surface UNDER the ground and cannot be seen at all. The lido pays for
 * a hole in the grid because it has to; the hall does not need one, because a
 * pool hall is a building you step UP into. 0.18 m of raised floor puts the
 * water at 0.50, five centimetres over the terrain, with the 0.13 m of
 * freeboard between the water and the surround that a deck level pool has.
 */
const HALL_FLOOR = 0.18;
const WATER = {
  x0: 60.5, x1: 85.5, z0: 102.6, z1: 109.6, wall: 0.30, surface: 0.05, bed: -1.90,
};
const GALLERY = { z0: 99.90, z1: 102.30, top: 3.20 };

/* The filter house, tucked into the corner between the hall's east gable
 * and the east fence. Every other corner of this compound is either the
 * coping or a gap too narrow to stand a building in without leaving a slot
 * beside it; this one shares a face with the fence and leaves 1.6 m to the
 * hall. */
const PLANT = { x0: 87.6, x1: 91.0, z0: 99.6, z1: 103.0, roof: 3.00 };

export function buildPool(ctx) {
  const m = mats();
  const rng = rngKit(9801);
  const out = { sakura: [], shrubs: [], grove: [], petals: [], references: {} };

  buildBoundary(ctx, m, out);
  buildBlock(ctx, m);
  buildLido(ctx, m, rng, out);
  buildHall(ctx, m);
  buildPlant(ctx, m);

  /* The rectangle the drawn terrain has to lose so the bowl is a bowl to the
   * eye as well as to the height query. Handed up to ./index.js, which owns
   * the cut, so the pool does not reach into the town's own geometry. */
  out.holes = [{ x0: LIDO.x0, x1: LIDO.x1, z0: LIDO.z0, z1: LIDO.z1 }];
  /* And the same two rectangles as WELLS, with their floors, so a falling
   * petal keeps going past the deck and lands on the tile. ./blossom.js. */
  out.wells = [
    { x0: LIDO.x0, x1: LIDO.step, z0: LIDO.z0, z1: LIDO.z1, y: GROUND - LIDO.shallow },
    { x0: LIDO.step, x1: LIDO.x1, z0: LIDO.z0, z1: LIDO.z1, y: GROUND - LIDO.deep },
  ];

  out.references.poolLidoLength = {
    measured: +(LIDO.x1 - LIDO.x0).toFixed(2),
    unit: 'm',
    real: 'a municipal short course pool, 25 m',
  };
  out.references.poolLidoDeep = {
    measured: +LIDO.deep.toFixed(2),
    unit: 'm',
    real: 'the deep end of a town pool, 1.8 to 2.8 m',
  };
  out.references.poolHallDoor = {
    measured: +(HALL_DOOR.z1 - HALL_DOOR.z0).toFixed(2),
    unit: 'm',
    real: 'a hall door a five inch can leave by, 3 m and up',
  };
  out.references.poolLaneWidth = {
    measured: +((LIDO.z1 - LIDO.z0) / 5).toFixed(2),
    unit: 'm',
    real: 'a swimming lane, 1.8 to 2.5 m',
  };
  return out;
}

/**
 * Flat bands of colour round all four faces of a box.
 *
 * A plinth and a string course, drawn 20 mm proud of the render so the ink
 * pass draws a line top and bottom of each. Never solid: the wall behind is
 * already a wall, and a second box in the same place is what the collider
 * audit counts as overlap.
 */
function civicBands(ctx, m, x0, x1, z0, z1, t, bands) {
  const o = t / 2 + 0.02;
  for (const [y0, y1, mat] of bands) {
    decal(ctx, mat, x0 - o, y0, z0 - o, x1 + o, y1, z0 - t / 2, { name: 'poolBand', noOutline: false });
    decal(ctx, mat, x0 - o, y0, z1 + t / 2, x1 + o, y1, z1 + o, { name: 'poolBand', noOutline: false });
    decal(ctx, mat, x0 - o, y0, z0 - t / 2, x0 - t / 2, y1, z1 + t / 2, { name: 'poolBand', noOutline: false });
    decal(ctx, mat, x1 + t / 2, y0, z0 - t / 2, x1 + o, y1, z1 + t / 2, { name: 'poolBand', noOutline: false });
  }
}

/* ------------------------------------------------------------------ *
 * The fence, the gate and the forecourt.
 * ------------------------------------------------------------------ */

function buildBoundary(ctx, m, out) {
  const H = 1.90;
  meshFence(ctx, { axis: 'x', at: SITE.z0, from: SITE.x0, to: GATE.x0, y: GROUND, h: H, mid: true });
  meshFence(ctx, { axis: 'x', at: SITE.z0, from: GATE.x1, to: SITE.x1, y: GROUND, h: H, mid: true });
  meshFence(ctx, { axis: 'x', at: SITE.z1, from: SITE.x0, to: SITE.x1, y: GROUND, h: H, mid: true });
  meshFence(ctx, { axis: 'z', at: SITE.x0, from: SITE.z0, to: SITE.z1, y: GROUND, h: H, mid: true });
  meshFence(ctx, { axis: 'z', at: SITE.x1, from: SITE.z0, to: SITE.z1, y: GROUND, h: H, mid: true });

  /* The gate: two posts and the name board across the top of them. The
   * opening is four metres wide and 2.6 m to the underside of the board,
   * which is the first gate on the site and the one you arrive at. */
  for (const x of [GATE.x0, GATE.x1]) {
    post(ctx, m.metal, x, SITE.z0, GROUND, GROUND + 3.10, 0.11, { name: 'poolGatePost' });
  }
  slab(ctx, m.civicBand, GATE.x0 - 0.11, GROUND + 2.60, SITE.z0 - 0.09,
    GATE.x1 + 0.11, GROUND + 3.10, SITE.z0 + 0.09, { name: 'poolGateBeam' });
  board(ctx, poolName(), {
    x: (GATE.x0 + GATE.x1) / 2, y: GROUND + 2.85, z: SITE.z0 - 0.11, w: 3.90, h: 0.85,
    ry: Math.PI, name: 'poolSign',
  });

  /* The forecourt, and the two things people leave in it. Paving is drawn as
   * a patch rather than laid as a pad: a pad registers a platform, and a
   * platform is a rectangle at one height, which over a compound that has a
   * hole in the middle of it would be a floor across the pool. Everything
   * flat on this site is at GROUND and the two basins are cuts below it. */
  patch(ctx, PAL.sidewalk, {
    x: 62.0, y: GROUND + 0.015, z: 84.8, w: 15.0, d: 4.0, opacity: 0.55, name: 'poolForecourt',
  });
  patch(ctx, PAL.roadWorn, {
    x: 59.0, y: GROUND + 0.02, z: 83.4, w: 4.6, d: 1.6, opacity: 0.4, name: 'poolApron',
  });
  /* `keep: true` and a ctx on both: `skipClutter` in the town's props.js
   * returns an empty group for anything without them, which is the whole
   * point of that opt in, and a rack that is not kept is also a rack with no
   * collider. These two are the arrival, so they are kept. */
  ctx.add(makeBikeRack({
    ctx, keep: true, x: 64.6, z: 84.4, y: GROUND, ry: 0, n: 5, seed: 9811,
  }));
  ctx.add(makeBench({ ctx, keep: true, x: 68.4, z: 84.2, y: GROUND, ry: Math.PI }));

  /* The cherries along the road fence. This is what the place is FOR in
   * April: the pool is shut, and the blossom comes over the fence and lands
   * in the empty bowl. `keep: true` on all three, because the town's planting
   * thin runs a hash over every spot in the world and losing one of these
   * would take the picture with it. */
  const trees = [[55.8, 81.2, 1.05], [67.0, 81.2, 0.95], [78.4, 81.2, 1.10], [88.6, 81.2, 0.9]];
  trees.forEach(([x, z, scale], i) => {
    out.sakura.push({ x, z, y: GROUND, scale, seed: 9820 + i, keep: true, lean: i === 1 ? 0.12 : 0 });
  });
  out.petals.push({ x: 70.0, z: 82.0, w: 26.0, d: 1.8, y: GROUND, n: 130 });
  out.petals.push({ x: 62.0, z: 85.2, w: 12.0, d: 2.2, y: GROUND, n: 70 });

  /* Two boards on the fence by the gate: the hours, and the rules. */
  board(ctx, poolHours(), {
    x: GATE.x1 + 1.30, y: GROUND + 1.20, z: SITE.z0 - 0.07, w: 0.62, h: 0.80, ry: Math.PI,
    name: 'poolHoursBoard',
  });
  board(ctx, poolRules(), {
    x: GATE.x0 - 1.30, y: GROUND + 1.20, z: SITE.z0 - 0.07, w: 0.62, h: 0.62, ry: Math.PI,
    name: 'poolRulesBoard',
  });
}

/* ------------------------------------------------------------------ *
 * 管理棟, and the corridor straight through it.
 * ------------------------------------------------------------------ */

function buildBlock(ctx, m) {
  const b = BLOCK;
  const T = 0.26;
  const corridor = {
    from: CORRIDOR.x0, to: CORRIDOR.x1, y0: GROUND - 0.1, y1: GROUND + CORRIDOR.y1,
  };
  /* Both end walls carry the corridor's opening, which is what makes it a
   * corridor and not a doorway. */
  for (const at of [b.z0, b.z1]) {
    wallPanel(ctx, m.civic, {
      axis: 'x', at, t: T, from: b.x0, to: b.x1, y0: GROUND, y1: b.roof,
      holes: [corridor], name: 'poolBlock',
    });
  }
  /* The long faces: a run of high windows, which is what a changing room
   * has. Real openings at 2.30 to 3.10, so a pilot who wants to can thread
   * the building sideways as well as end to end. */
  const highWin = [];
  for (let z = b.z0 + 1.6; z < b.z1 - 2.0; z += 2.6) {
    highWin.push({ from: z, to: z + 1.6, y0: GROUND + 2.30, y1: GROUND + 3.10 });
  }
  for (const at of [b.x0, b.x1]) {
    wallPanel(ctx, m.civic, {
      axis: 'z', at, t: T, from: b.z0 + T / 2, to: b.z1 - T / 2, y0: GROUND, y1: b.roof,
      holes: highWin, name: 'poolBlock',
    });
  }
  /*
   * The corridor's own two walls. They run the whole depth of the block and
   * they are what separates the two changing rooms, so the corridor is a
   * tunnel with a wall on each side rather than a hole through a shed.
   */
  for (const at of [CORRIDOR.x0, CORRIDOR.x1]) {
    wallPanel(ctx, m.civic, {
      axis: 'z', at, t: 0.16, from: b.z0, to: b.z1, y0: GROUND, y1: b.roof, name: 'poolBlock',
    });
  }
  /* The plinth and the band. Two flat strips of colour and they are what
   * turn 6.8 by 11.4 m of render into a civic building rather than a box:
   * the same grey base and blue string course the school two hundred metres
   * away carries, out of the same three PAL entries. */
  civicBands(ctx, m, b.x0, b.x1, b.z0, b.z1, 0.26, [
    [GROUND, GROUND + 0.55, m.concreteMid],
    [GROUND + 2.94, GROUND + 3.24, m.civicBand],
  ]);
  deck(ctx, m.concrete, b.x0, b.z0, b.x1, b.z1, b.roof, { thick: 0.26, name: 'poolBlockRoof' });
  for (const at of [b.z0 + 0.09, b.z1 - 0.09]) {
    wallPanel(ctx, m.civicBand, {
      axis: 'x', at, t: 0.18, from: b.x0, to: b.x1, y0: b.roof, y1: b.parapet, name: 'poolParapet',
    });
  }
  for (const at of [b.x0 + 0.09, b.x1 - 0.09]) {
    wallPanel(ctx, m.civicBand, {
      axis: 'z', at, t: 0.18, from: b.z0 + 0.18, to: b.z1 - 0.18, y0: b.roof, y1: b.parapet,
      name: 'poolParapet',
    });
  }

  /* The water tank on the roof, which is the silhouette this building has
   * from anywhere in the town: an FRP panel tank on a low stand is what sits
   * on top of every small public building in Japan. */
  const t = TANK;
  for (const [x, z] of [[t.x0 + 0.3, t.z0 + 0.3], [t.x1 - 0.3, t.z0 + 0.3],
    [t.x0 + 0.3, t.z1 - 0.3], [t.x1 - 0.3, t.z1 - 0.3]]) {
    post(ctx, m.metalDark, x, z, b.roof, b.roof + 0.60, 0.08, { name: 'poolTankLeg' });
  }
  slab(ctx, m.white, t.x0, b.roof + 0.60, t.z0, t.x1, t.top, t.z1, { name: 'poolTank' });
  /* The panel joints, drawn: an FRP tank is a grid of 1 m panels and the ink
   * pass will draw every one of them for the price of one merged mesh. */
  for (let x = t.x0 + 1.0; x < t.x1 - 0.2; x += 1.0) {
    decal(ctx, m.trim, x - 0.03, b.roof + 0.62, t.z0 - 0.02, x + 0.03, t.top - 0.02, t.z1 + 0.02,
      { name: 'poolTankJoint', noOutline: false });
  }
  decal(ctx, m.metalDark, t.x1 - 0.36, b.roof + 0.60, t.z1 - 0.26, t.x1 - 0.22, t.top + 0.30, t.z1 - 0.12,
    { name: 'poolTankPipe', noOutline: false });

  /* The ticket window and its shutter, on the forecourt face. Drawn only:
   * the wall behind it is already solid and a second box in the same place
   * is exactly what the collider audit counts as overlap. */
  decal(ctx, m.glassDark, 59.6, GROUND + 1.00, b.z0 - 0.15, 61.0, GROUND + 2.05, b.z0 - 0.13,
    { name: 'poolWindow' });
  decal(ctx, m.metal, 59.5, GROUND + 2.05, b.z0 - 0.17, 61.1, GROUND + 2.30, b.z0 - 0.11,
    { name: 'poolShutter', noOutline: false });
  /* The canopy over it, on two brackets. Solid, and 2.4 m up, so it is a
   * thing to duck under on the way to the corridor. */
  slab(ctx, m.civicBand, 56.6, GROUND + 2.40, b.z0 - 1.30, 61.4, GROUND + 2.58, b.z0,
    { name: 'poolCanopy' });
  for (const x of [57.0, 60.9]) {
    decal(ctx, m.metalDark, x, GROUND + 2.05, b.z0 - 1.20, x + 0.09, GROUND + 2.40, b.z0 - 0.10,
      { name: 'poolBracket', noOutline: false });
  }
}

/* ------------------------------------------------------------------ *
 * The lido: the empty bowl.
 * ------------------------------------------------------------------ */

function buildLido(ctx, m, rng, out) {
  const L = LIDO;
  const shallowY = GROUND - L.shallow;
  const deepY = GROUND - L.deep;

  /*
   * THE APRON, and it is a real slab rather than a painted patch because it
   * is what seals the hole in the drawn ground.
   *
   * `cutGround` in ./index.js removes every terrain triangle with a vertex
   * inside the basin. The grid is 2 m, so the hole it actually leaves runs
   * x 62..90 and z 86..98, up to 2 m outside what was asked for. These four
   * slabs cover exactly that overshoot: 1.35 m of apron west, 1.6 m east,
   * 1.5 m south and 1.5 m north, measured from the coping's outer edge, and
   * they run 0.6 m deep so there is no line of sight under them from a low
   * pass on the deck. The measured extent of the cut is reported in stats()
   * beside what was asked for, so the two can be compared rather than
   * trusted.
   */
  const cw = L.wall + L.coping;
  const px0 = L.x0 - cw;
  const px1 = L.x1 + cw;
  const pz0 = L.z0 - cw;
  const pz1 = L.z1 + cw;
  const apron = (x0, z0, x1, z1) => slab(ctx, m.concrete, x0, GROUND - 0.60, z0,
    x1, GROUND + 0.04, z1, { name: 'poolApron', cast: false });
  apron(DECK.x0, DECK.z0, DECK.x1, pz0);
  apron(DECK.x0, pz1, DECK.x1, DECK.z1);
  apron(DECK.x0, pz0, px0, pz1);
  apron(px1, pz0, DECK.x1, pz1);
  /* Slab joints, so 28 by 13 m of concrete has a grain. */
  {
    const parts = [];
    for (let x = DECK.x0 + 2.4; x < DECK.x1 - 1.0; x += 2.4) {
      parts.push([x, DECK.z0, x, pz0], [x, pz1, x, DECK.z1]);
    }
    for (const [x0, z0, x1, z1] of parts) {
      decal(ctx, m.concreteMid, x0 - 0.03, GROUND + 0.04, z0, x1 + 0.03, GROUND + 0.06, z1,
        { name: 'poolDeckJoint' });
    }
  }

  /*
   * THE TWO CUTS. This is what makes the bowl a bowl to `world.heightAt` and
   * not just to the eye. Without them the height query answers GROUND over
   * the hole, a quad hovering in the deep end reports itself sitting on
   * nothing 2.55 m up, and the landing judgement fires in mid air.
   */
  ctx.cut({ x0: L.x0, x1: L.step, z0: L.z0, z1: L.z1, top: shallowY });
  ctx.cut({ x0: L.step, x1: L.x1, z0: L.z0, z1: L.z1, top: deepY });

  /* The floor, in two flats and one riser, drawn exactly as it is solid. */
  slab(ctx, m.tile, L.x0, shallowY - 0.30, L.z0, L.step, shallowY, L.z1, { name: 'poolFloor' });
  slab(ctx, m.tileDeep, L.step, deepY - 0.30, L.z0, L.x1, deepY, L.z1, { name: 'poolFloor' });
  slab(ctx, m.tileDeep, L.step - 0.10, deepY, L.z0, L.step, shallowY, L.z1, { name: 'poolStep' });

  /* The four walls, outside the water rectangle so the bowl stays open, and
   * carried down past the deepest floor so nothing can be flown under. */
  const wallTop = GROUND;
  slab(ctx, m.tile, L.x0 - L.wall, deepY - 0.30, L.z0 - L.wall, L.x0, wallTop, L.z1 + L.wall,
    { name: 'poolWall' });
  slab(ctx, m.tile, L.x1, deepY - 0.30, L.z0 - L.wall, L.x1 + L.wall, wallTop, L.z1 + L.wall,
    { name: 'poolWall' });
  slab(ctx, m.tile, L.x0, deepY - 0.30, L.z0 - L.wall, L.x1, wallTop, L.z0, { name: 'poolWall' });
  slab(ctx, m.tile, L.x0, deepY - 0.30, L.z1, L.x1, wallTop, L.z1 + L.wall, { name: 'poolWall' });

  /* The coping: a white rim standing 40 mm proud all the way round, which is
   * the line that says POOL from four hundred metres up. */
  const c = L.coping;
  const cy = GROUND + 0.04;
  slab(ctx, m.tileRim, L.x0 - L.wall - c, GROUND, L.z0 - L.wall - c, L.x0, cy, L.z1 + L.wall + c,
    { name: 'poolCoping' });
  slab(ctx, m.tileRim, L.x1, GROUND, L.z0 - L.wall - c, L.x1 + L.wall + c, cy, L.z1 + L.wall + c,
    { name: 'poolCoping' });
  slab(ctx, m.tileRim, L.x0, GROUND, L.z0 - L.wall - c, L.x1, cy, L.z0, { name: 'poolCoping' });
  slab(ctx, m.tileRim, L.x0, GROUND, L.z1, L.x1, cy, L.z1 + L.wall + c, { name: 'poolCoping' });

  /* The tide mark. A drained pool keeps a pale band where the water stood,
   * and it is the single detail that tells a pilot the bowl is empty on
   * purpose rather than modelled wrong. */
  for (const [x0, x1, y] of [[L.x0, L.step, GROUND - 0.30], [L.step, L.x1, GROUND - 0.30]]) {
    decal(ctx, m.tileRim, x0, y, L.z0, x1, y + 0.10, L.z0 + 0.03, { name: 'poolTide' });
    decal(ctx, m.tileRim, x0, y, L.z1 - 0.03, x1, y + 0.10, L.z1, { name: 'poolTide' });
  }
  decal(ctx, m.tileRim, L.x0, GROUND - 0.30, L.z0, L.x0 + 0.03, GROUND - 0.20, L.z1, { name: 'poolTide' });
  decal(ctx, m.tileRim, L.x1 - 0.03, GROUND - 0.30, L.z0, L.x1, GROUND - 0.20, L.z1, { name: 'poolTide' });

  /* Five lanes, painted on the floor, and the T at each end of every one.
   * Drawn only: it is paint. */
  const lanes = 5;
  for (let i = 1; i < lanes; i += 1) {
    const z = L.z0 + ((L.z1 - L.z0) / lanes) * i;
    decal(ctx, m.tileLane, L.x0, shallowY, z - 0.06, L.step, shallowY + 0.02, z + 0.06,
      { name: 'poolLane' });
    decal(ctx, m.tileLane, L.step, deepY, z - 0.06, L.x1, deepY + 0.02, z + 0.06, { name: 'poolLane' });
  }
  for (let i = 0; i < lanes; i += 1) {
    const z = L.z0 + ((L.z1 - L.z0) / lanes) * (i + 0.5);
    decal(ctx, m.tileLane, L.x0 + 1.6, shallowY, z - 0.55, L.x0 + 1.72, shallowY + 0.02, z + 0.55,
      { name: 'poolLane' });
    decal(ctx, m.tileLane, L.x1 - 1.72, deepY, z - 0.55, L.x1 - 1.6, deepY + 0.02, z + 0.55,
      { name: 'poolLane' });
  }

  /* What has blown in. Leaves in the deep end, where they always end up,
   * and blossom on the shallow shelf. */
  patch(ctx, 0x8a7f5e, {
    x: 85.0, y: deepY + 0.03, z: 92.0, w: 5.0, d: 7.0, opacity: 0.42, name: 'poolLeaves',
  });
  patch(ctx, 0x8a7f5e, {
    x: 76.5, y: deepY + 0.03, z: 88.6, round: true, r: 1.6, opacity: 0.30, sz: 0.6, name: 'poolLeaves',
  });
  out.petals.push({ x: 68.0, z: 92.0, w: 8.0, d: 7.0, y: shallowY, n: 90 });
  out.petals.push({ x: 84.0, z: 92.0, w: 7.0, d: 7.0, y: deepY, n: 80 });

  /* 水深 plates, set into the coping at each end. */
  board(ctx, poolDepth(false), {
    x: L.x0 + 2.2, y: cy + 0.005, z: L.z0 - L.wall - 0.22, w: 0.80, h: 0.40,
    rx: -Math.PI / 2, name: 'poolDepthPlate',
  });
  board(ctx, poolDepth(true), {
    x: L.x1 - 2.2, y: cy + 0.005, z: L.z0 - L.wall - 0.22, w: 0.80, h: 0.40,
    rx: -Math.PI / 2, name: 'poolDepthPlate',
  });

  /* Five starting blocks on the deep end coping, one per lane. */
  for (let i = 0; i < lanes; i += 1) {
    const z = L.z0 + ((L.z1 - L.z0) / lanes) * (i + 0.5);
    slab(ctx, m.tileRim, L.x1 + 0.10, cy, z - 0.28, L.x1 + 0.68, cy + 0.52, z + 0.28,
      { name: 'poolStartBlock' });
    decal(ctx, m.yellow, L.x1 + 0.08, cy + 0.50, z - 0.28, L.x1 + 0.70, cy + 0.54, z + 0.28,
      { name: 'poolBlockTop', noOutline: false });
  }

  /*
   * The springboard. One metre over the coping at the deep end, cantilevered
   * out over the bowl, and the thing it gives a pilot is the gap under it:
   * a board 1.0 m up over a floor 2.55 m down is a 3.55 m gate you take on
   * the way along the pool.
   */
  const bx = L.x1 - 3.7;
  for (const z of [L.z1 + 0.40, L.z1 + 1.00]) {
    post(ctx, m.metal, bx, z, GROUND, GROUND + 1.00, 0.07, { name: 'poolBoardPost' });
  }
  slab(ctx, m.white, bx - 0.30, GROUND + 1.00, L.z1 - 2.80, bx + 0.30, GROUND + 1.10, L.z1 + 1.30,
    { name: 'poolBoard' });
  decal(ctx, m.metalDark, bx - 0.30, GROUND + 1.10, L.z1 + 0.90, bx + 0.30, GROUND + 1.85, L.z1 + 1.30,
    { name: 'poolBoardRail', noOutline: false });

  /* Two ladders, recessed into the long wall. Drawn: a 40 mm rung must not
   * become a rail across the bowl. */
  for (const x of [L.x0 + 4.0, L.x1 - 5.5]) {
    for (let i = 0; i < 4; i += 1) {
      const y = GROUND - 0.24 - i * 0.30;
      decal(ctx, m.metal, x, y, L.z0 - 0.02, x + 0.52, y + 0.06, L.z0 + 0.06, { name: 'poolRung' });
    }
    decal(ctx, m.metal, x + 0.02, GROUND, L.z0 - 0.10, x + 0.10, GROUND + 0.85, L.z0 - 0.02,
      { name: 'poolRail', noOutline: false });
    decal(ctx, m.metal, x + 0.44, GROUND, L.z0 - 0.10, x + 0.52, GROUND + 0.85, L.z0 - 0.02,
      { name: 'poolRail', noOutline: false });
  }

  /*
   * 監視台, the lifeguard's chair. Two posts, a seat 2.40 m up and a back:
   * one more gate at head height on the deck, and the only thing on this
   * side of the compound that breaks the horizontal.
   */
  const gx = 76.0;
  const gz = 85.8;
  for (const dz of [-0.42, 0.42]) {
    post(ctx, m.metal, gx, gz + dz, GROUND, GROUND + 2.40, 0.07, { name: 'poolChairLeg' });
  }
  slab(ctx, m.white, gx - 0.50, GROUND + 2.40, gz - 0.52, gx + 0.50, GROUND + 2.52, gz + 0.52,
    { name: 'poolChair' });
  decal(ctx, m.white, gx - 0.50, GROUND + 2.52, gz - 0.62, gx + 0.50, GROUND + 3.20, gz - 0.52,
    { name: 'poolChairBack', noOutline: false });

  /* Weeds where the deck meets the fence, because nobody strims the last
   * half metre. */
  for (let i = 0; i < 9; i += 1) {
    out.shrubs.push({
      x: 54.0 + rng.range(0, 36.0), z: SITE.z0 + rng.range(0.2, 1.4), y: GROUND,
      r: rng.range(0.22, 0.4), count: 2, spread: 0.7, seed: 9850 + i,
    });
  }
}

/* ------------------------------------------------------------------ *
 * 屋内プール: the hall, and the water in it.
 * ------------------------------------------------------------------ */

function buildHall(ctx, m) {
  const h = HALL;
  const floor = GROUND + HALL_FLOOR;
  const door = { from: HALL_DOOR.z0, to: HALL_DOOR.z1, y0: GROUND - 0.1, y1: floor + HALL_DOOR.y1 };
  const clere = { from: CLERE.x0, to: CLERE.x1, y0: GROUND + CLERE.y0, y1: GROUND + CLERE.y1 };

  /* The two gables carry the doors; the two long faces carry the clerestory.
   * Every one of the four openings has a partner opposite it, which is what
   * turns a shed with holes in it into two lines that cross. */
  for (const at of [h.x0, h.x1]) {
    wallPanel(ctx, m.civic, {
      axis: 'z', at, t: h.t, from: h.z0, to: h.z1, y0: GROUND, y1: h.roof,
      holes: [door], name: 'poolHall',
    });
  }
  for (const at of [h.z0, h.z1]) {
    wallPanel(ctx, m.civic, {
      axis: 'x', at, t: h.t, from: h.x0 + h.t / 2, to: h.x1 - h.t / 2, y0: GROUND, y1: h.roof,
      holes: [clere], name: 'poolHall',
    });
  }
  /* The mullions in the clerestory: drawn only, at 2.5 m centres, so the
   * band reads as glazing that has been taken out for the summer rather
   * than as a slot cut in a wall. Eight of them at that spacing leave 2.4 m
   * between, which is well clear of the gap rule either way. */
  for (const at of [h.z0, h.z1]) {
    for (let x = CLERE.x0 + 2.5; x < CLERE.x1 - 0.5; x += 2.5) {
      decal(ctx, m.trim, x - 0.05, GROUND + CLERE.y0, at - 0.06, x + 0.05, GROUND + CLERE.y1, at + 0.06,
        { name: 'poolMullion', noOutline: false });
    }
  }
  civicBands(ctx, m, h.x0, h.x1, h.z0, h.z1, h.t, [
    [GROUND, GROUND + 0.70, m.concreteMid],
    [GROUND + 3.30, GROUND + 3.72, m.civicBand],
  ]);
  /* The two tall lights either side of each gable door. Drawn, not punched:
   * four more holes in a 28 m wall would take more out of it than they put
   * in, and what the gable actually needs is something to break 190 square
   * metres of flat render. */
  for (const at of [h.x0, h.x1]) {
    const face = at === h.x0 ? -1 : 1;
    for (const dz of [-3.10, 3.10]) {
      const z0 = (HALL_DOOR.z0 + HALL_DOOR.z1) / 2 + dz - 0.45;
      /* Two panes, above and below the string course, and not one that the
       * band is then drawn across. A projecting band really does run over a
       * window on a building like this, but drawn as a strip in front of a
       * pane it reads as a mistake rather than as a string course. */
      for (const [y0, y1] of [[1.10, 3.20], [3.82, 5.40]]) {
        decal(ctx, m.civicTrim, at + face * (h.t / 2 + 0.02), GROUND + y0, z0,
          at + face * (h.t / 2 + 0.05), GROUND + y1, z0 + 0.90, { name: 'poolLightReveal' });
        decal(ctx, m.glass, at + face * (h.t / 2 + 0.05), GROUND + y0 + 0.10, z0 + 0.08,
          at + face * (h.t / 2 + 0.07), GROUND + y1 - 0.10, z0 + 0.82, { name: 'poolLightPane' });
      }
    }
    /* And the downpipe off each corner, which is the other thing every RC
     * box in this town has and this one did not. */
    for (const dz of [h.z0 + 0.55, h.z1 - 0.55]) {
      decal(ctx, m.civicTrim, at + face * (h.t / 2 + 0.01), GROUND, dz - 0.09,
        at + face * (h.t / 2 + 0.13), h.roof, dz + 0.09, { name: 'poolDownpipe', noOutline: false });
    }
  }
  deck(ctx, m.concrete, h.x0, h.z0, h.x1, h.z1, h.roof, { thick: 0.28, name: 'poolHallRoof' });
  for (const at of [h.z0 + 0.09, h.z1 - 0.09]) {
    wallPanel(ctx, m.civicBand, {
      axis: 'x', at, t: 0.18, from: h.x0, to: h.x1, y0: h.roof, y1: h.parapet, name: 'poolParapet',
    });
  }
  for (const at of [h.x0 + 0.09, h.x1 - 0.09]) {
    wallPanel(ctx, m.civicBand, {
      axis: 'z', at, t: 0.18, from: h.z0 + 0.18, to: h.z1 - 0.18, y0: h.roof, y1: h.parapet,
      name: 'poolParapet',
    });
  }
  /* The rooflight, a raised lantern down the middle of the roof. Landable
   * either side of it, which makes the roof two strips rather than one
   * table and is the difference between a place to sit and a helipad. */
  slab(ctx, m.glass, h.x0 + 4.0, h.roof, (h.z0 + h.z1) / 2 - 1.10, h.x1 - 4.0, h.roof + 0.70,
    (h.z0 + h.z1) / 2 + 1.10, { name: 'poolLantern' });

  /*
   * The floor, raised. One slab from the ground to HALL_FLOOR, drawn round
   * the water and not over it, so the hall is a step up off the deck and the
   * water surface clears the town's terrain grid.
   */
  const w = WATER;
  const surface = GROUND + w.surface;
  const fs = (x0, z0, x1, z1) => deck(ctx, m.tileRim, x0, z0, x1, z1, floor,
    { thick: HALL_FLOOR, name: 'poolHallFloor' });
  fs(h.x0 + h.t / 2, h.z0 + h.t / 2, h.x1 - h.t / 2, w.z0 - w.wall);
  fs(h.x0 + h.t / 2, w.z1 + w.wall, h.x1 - h.t / 2, h.z1 - h.t / 2);
  fs(h.x0 + h.t / 2, w.z0 - w.wall, w.x0 - w.wall, w.z1 + w.wall);
  fs(w.x1 + w.wall, w.z0 - w.wall, h.x1 - h.t / 2, w.z1 + w.wall);
  /* The step down off the doors, so the raised floor reads as a step rather
   * than as a floor that happens to be thick. */
  for (const at of [h.x0, h.x1]) {
    const face = at === h.x0 ? -1 : 1;
    decal(ctx, m.concreteMid, at + face * (h.t / 2), GROUND, HALL_DOOR.z0,
      at + face * (h.t / 2 + 0.55), floor, HALL_DOOR.z1, { name: 'poolStep', noOutline: false });
  }

  /*
   * The water. One solid box with its top at the surface: a quad that meets
   * water crashes, so the surface has to be as solid as the tile beside it,
   * and a cut puts the height query on the same plane so the readout and the
   * landing judgement agree with the drawing.
   */
  ctx.cut({ x0: w.x0, x1: w.x1, z0: w.z0, z1: w.z1, top: surface });
  slab(ctx, m.poolWater, w.x0, GROUND + w.bed, w.z0, w.x1, surface, w.z1,
    { name: 'poolWaterBody', cast: false });
  /* The deep end reads darker, which is most of what makes a flat blue box
   * read as water rather than as a blue box. */
  decal(ctx, m.poolWaterDeep, w.x1 - 8.0, surface - 0.02, w.z0, w.x1, surface, w.z1,
    { name: 'poolWaterDeep' });
  /* The surround: the tiled edge between the water and the raised floor. */
  slab(ctx, m.tileRim, w.x0 - w.wall, floor - 0.20, w.z0 - w.wall, w.x1 + w.wall, floor,
    w.z0, { name: 'poolSurround' });
  slab(ctx, m.tileRim, w.x0 - w.wall, floor - 0.20, w.z1, w.x1 + w.wall, floor,
    w.z1 + w.wall, { name: 'poolSurround' });
  slab(ctx, m.tileRim, w.x0 - w.wall, floor - 0.20, w.z0, w.x0, floor, w.z1,
    { name: 'poolSurround' });
  slab(ctx, m.tileRim, w.x1, floor - 0.20, w.z0, w.x1 + w.wall, floor, w.z1,
    { name: 'poolSurround' });

  /* Three lane ropes, and they stay SOLID. A drawn bar you can pass through
   * is the same lie as an invisible wall, only the other way round. 2.1 m
   * between them, which is a gate rather than a slot. */
  for (const z of [104.0, 106.1, 108.2]) {
    slab(ctx, m.lineWhite, w.x0, surface + 0.02, z - 0.06, w.x1, surface + 0.14, z + 0.06,
      { name: 'poolRope', cast: false });
  }

  /*
   * The gallery down the south side, 3.20 m up and 2.4 m deep. Landable, and
   * the 2.95 m of clear air under it is line 5. A hall with a flat floor and
   * nothing in it is 28 m of nothing; one deck at head height is what gives
   * the inside of it a shape.
   */
  deck(ctx, m.concreteMid, h.x0 + h.t, GALLERY.z0, h.x1 - h.t, GALLERY.z1, GALLERY.top,
    { thick: 0.25, name: 'poolGallery' });
  railing(ctx, {
    axis: 'x', at: GALLERY.z1 - 0.08, from: h.x0 + h.t, to: h.x1 - h.t, y: GALLERY.top, h: 1.00,
  });

  /* Four roof beams. Solid, seven metres apart, so the top of the hall is a
   * thing you fly between rather than an empty ceiling. */
  for (const x of [63.0, 70.0, 77.0, 84.0]) {
    slab(ctx, m.trim, x - 0.16, GROUND + 6.60, h.z0 + h.t, x + 0.16, GROUND + 6.95, h.z1 - h.t,
      { name: 'poolBeam' });
  }
}

/* ------------------------------------------------------------------ *
 * ろ過機室: the filter house, and the pipework outside it.
 * ------------------------------------------------------------------ */

function buildPlant(ctx, m) {
  const p = PLANT;
  const T = 0.24;
  for (const at of [p.z0, p.z1]) {
    wallPanel(ctx, m.wall, {
      axis: 'x', at, t: T, from: p.x0, to: p.x1, y0: GROUND, y1: p.roof,
      holes: at === p.z0 ? [{ from: p.x0 + 0.9, to: p.x0 + 2.1, y0: GROUND, y1: GROUND + 2.05 }] : [],
      name: 'poolPlant',
    });
  }
  for (const at of [p.x0, p.x1]) {
    wallPanel(ctx, m.wall, {
      axis: 'z', at, t: T, from: p.z0 + T / 2, to: p.z1 - T / 2, y0: GROUND, y1: p.roof,
      holes: at === p.x0
        ? [{ from: p.z0 + 1.0, to: p.z0 + 2.2, y0: GROUND + 1.10, y1: GROUND + 2.10 }]
        : [],
      name: 'poolPlant',
    });
  }
  deck(ctx, m.concrete, p.x0, p.z0, p.x1, p.z1, p.roof, { thick: 0.22, name: 'poolPlantRoof' });
  /* The pipe run from the filter house down to the pool, along the deck.
   * Solid, and 0.34 m tall, so it is something to hop rather than something
   * to hit. It stops 0.3 m short of the coping: a pipe crossing it would be
   * two solids sharing a volume, which the collider audit counts. */
  slab(ctx, m.metal, 88.6, GROUND, 97.6, 89.0, GROUND + 0.34, p.z0,
    { name: 'poolPipe' });
  slab(ctx, m.metal, 88.6, GROUND + 0.34, 98.4, 89.0, GROUND + 1.20, 98.8,
    { name: 'poolPipe' });
  decal(ctx, m.red, 88.52, GROUND + 1.20, 98.4, 89.08, GROUND + 1.36, 98.8,
    { name: 'poolValve', noOutline: false });
  /* And the ventilation cowl on the roof, which is the only thing that says
   * there is machinery in here. */
  slab(ctx, m.metalDark, p.x0 + 1.0, p.roof, p.z0 + 1.1, p.x0 + 1.9, p.roof + 0.75, p.z0 + 2.0,
    { name: 'poolCowl' });
}

export const POOL_SITE = SITE;
export const POOL_LANDMARK = { x: (HALL.x0 + HALL.x1) / 2, z: (HALL.z0 + HALL.z1) / 2, top: GROUND + HALL.parapet };
