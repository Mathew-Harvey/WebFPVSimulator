/*
 * works.js: 旧 ひばり製作所, the disused works on the works road.
 *
 * WHAT THIS IS. A 町工場: the small machine shop that stands at the edge of
 * every Japanese suburb, on the land the houses ran out at. Sawtooth roof,
 * corrugated cladding, a two storey office with the glass gone, a brick
 * stack, a water tower, and a block wall along the road with the gate
 * chained. It stopped twenty years ago, the town grew round it, and nobody
 * has decided what to do with the site. The demolition notice on the fence
 * says the same.
 *
 * WHY THIS AND NOT THE STANDALONE BANDO REBUILT. Industrial bando, which was
 * its own freestyle map until 2026-08-30 and is in the history at 974f4ce,
 * was a 58 m stack and a 42 m preheater on a hundred metre site, painted for
 * a sunset ochre sky it brought with it. Dropped into this town it would be
 * four times the height of anything here, out of the shadow camera, and out
 * of the palette: its own `palette.js` said in as many words that its colours
 * existed to fight this town's. So what crosses over is the VOCABULARY, not
 * the model. Rust,
 * profiled sheet, punched openings, a landable roof, a yard with weeds
 * through the concrete, and one tall thing to fly round. Everything is drawn
 * out of the city's own PAL and stands at suburban height: the stack is
 * 15.5 m against the school's 10.5 and the utility poles' 9.2, so it is the
 * tallest built thing at this end of the town and it is still a thing a
 * town could contain.
 *
 * THE FLIGHT LINES, and they are the reason for every dimension below.
 * Industrial bando learned this the hard way and wrote it down three times:
 * a shaft with a hole in the floor is a DIVE, and the owner's report was
 * "too many chimney dives, not fun". The fix is always to punch the far face
 * as well, so the shape becomes a LINE. So:
 *
 *   1. THROUGH THE SHED, north to south. A 4.4 m sliding door in the south
 *      gable and a 4.4 m hole where the cladding has gone off the north
 *      gable, both from the floor to 4.65 m. Eighteen metres of shed, one
 *      line, in one end and out the other.
 *   2. THROUGH THE SHED, east to west, CROSSING the first. Three sheets are
 *      off the west wall at z 99.0 to 102.2 and three off the east wall at
 *      exactly the same z. Twenty metres, at right angles to line 1, and
 *      they cross in the middle at floor level.
 *   3. IN THROUGH THE CLERESTORY. The middle tooth's glazing is out over
 *      3.2 m. That is an entry at 6.4 to 8.2 m which lands you inside the
 *      roof space and lets you drop and leave by either of the first two.
 *   4. THE ROOF HOLE, which is the one dive, and it is a dive with a run
 *      out: 3.2 by 2.0 m through the third tooth, straight down into a shed
 *      that has two ways out at floor level.
 *   5. THROUGH THE OFFICE, three times. Every opening on the road face has
 *      one at the same x on the yard face, on both floors: three bays of
 *      1.6 m with 1.0 m piers. The first floor set at 4.70 to 6.30 m is
 *      three 5.6 m tunnels with a 0.5 m sill to clear on the way in, and the
 *      ground floor's middle bay is a doorway that goes straight through.
 *   6. UNDER THE STAIR LANDING, under the flue duct between the boiler
 *      house and the stack, under the water tower, and through the hole
 *      where the block wall has fallen down. Four gates at head height that
 *      cost no geometry, because each of them is a thing that had to be
 *      there anyway.
 *
 * THE GAP RULE, taken from Industrial bando's kit and worth restating: a
 * leftover between two solids is either 0, a shared face, or at least 1.4 m.
 * Anything in between is a slot a five inch aims at and cannot fit through.
 * Every clearance in the table below was checked against it.
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
import { cyl, rngKit } from '../vendored/core/util.js';
import { meshFence } from '../vendored/world/ground.js';
import {
  GROUND, mats, slab, decal, hit, deck, post, wallPanel, ribs, board, patch,
} from './kit.js';
import { worksName, keepOut, safetyFirst, worksNotice, bayDigit } from './signs.js';

/*
 * The plan, in metres, and the only place any of it is written down.
 *
 * X runs across the site, west (the works road's inner end) to east. Z runs
 * away from the road, which is at z 78.8: the site's frontage wall is at
 * z 84.0 and everything gets further from town as z grows.
 */
const SITE = { x0: 20.0, x1: 50.0, z0: 82.6, z1: 113.0 };
/*
 * The frontage wall is at 82.6 and NOT at 84.0, which is where it was, and
 * the reason is a swept collision probe rather than a picture.
 *
 * The office's road face is at z 85.4. With the wall at 84.0 the strip
 * between them was 1.25 m: under the 1.4 m the gap rule allows, and a dead
 * end for the one line that goes through the hole where the wall has fallen
 * down. Probed, a segment in through the breach met the office's south wall
 * a metre and a half later. Moved back to the pool compound's own fence line
 * the alley is 2.65 m, the breach leads somewhere, and the two frontages
 * along the works road are on the same line as each other.
 */
const WALL = { at: 82.6, t: 0.30, h: 2.00 };
const GATE = { x0: 33.0, x1: 38.0 };
/* Where the block wall has come down. Four metres of it, lying in the yard.
 * It is the cheapest way in and the one a pilot finds first, because it is
 * the only hole in the frontage that is not a gate somebody could have
 * locked. */
const BREACH = { x0: 22.0, x1: 25.6 };

const OFFICE = {
  x0: 21.0, x1: 29.8, z0: 85.4, z1: 91.0, floor: 3.75, roof: 7.05, parapet: 7.45,
};
/*
 * The opening grid, as x pairs, used on BOTH faces at BOTH levels. That is
 * what makes the building a tunnel rather than a box with holes in it.
 *
 * Three bays of 1.6 m with 1.0 m piers between them and at both ends. The
 * width is not a proportion, it is the gap rule: a 1.3 m opening is inside
 * the 0.08 to 1.4 m band Industrial bando's kit calls a slot, and a slot is
 * a thing that looks flyable from twenty metres out and is not. 1.6 m is
 * clear of it with a quarter of a metre to spare either side of a five inch.
 */
const OFF_BAYS = [[22.0, 23.6], [24.6, 26.2], [27.2, 28.8]];
const OFF_LO = { y0: 1.05, y1: 2.65 };        // ground floor windows
const OFF_HI = { y0: 4.25, y1: 5.85 };        // first floor windows, the tunnel
const OFF_DOOR_Y = 2.20;                       // bay 0 on the ground floor is a door
/*
 * The external stair, and the thing it is really for is the 3.68 m of clear
 * air UNDER the landing. It rises the other way from the way a stair usually
 * gets drawn, from the yard at the far end back toward the road, so the
 * landing sits over the corner a pilot arrives at from the gate.
 */
const STAIR = {
  x0: 29.80, x1: 31.40, zLand0: 85.40, zLand1: 87.40, zFoot: 91.20, landing: 3.90, treads: 8,
};
/* And the door it lands at, in the office's east gable. */
const STAIR_DOOR = { z0: 85.70, z1: 87.20, y0: 3.90, y1: 5.90 };

const BOILER = { x0: 32.8, x1: 37.6, z0: 85.0, z1: 89.4, roof: 3.50 };
const STACK = { cx: 40.6, cz: 87.2, base: 1.20, top: 0.80, h: 15.50, plinth: 1.55 };
const FLUE = { y0: 2.20, y1: 3.30, half: 0.55 };

const SHED = {
  x0: 22.5, x1: 42.5, z0: 93.0, z1: 111.0, eave: 6.40, ridge: 8.20, t: 0.22,
};
/* Three teeth of six metres. The glazing stands on the low edge of the tooth
 * before it and faces -z, which is away from the sun (the city's key light
 * sits at offset -52, 62, 56, so it travels toward +x and -z) and toward the
 * town, so the row of glazed faces is what you see on the way in. */
const TEETH = 3;
const TOOTH = (SHED.z1 - SHED.z0) / TEETH;
/*
 * The roof is STEPPED, and drawn exactly as it is solid.
 *
 * A pitched plane would have to be a rotated box, and a rotated box's
 * collider is its axis aligned hull: the solid roof would then stand up to
 * 0.9 m above the drawn one along the whole ridge, which is an invisible
 * wall over eighteen metres of the best landing surface on the site. Six
 * steps of a metre with a 0.30 m riser is the same slope, it is what the
 * pilot meets, and at this scale it reads as the standing seams of a
 * profiled roof rather than as a staircase.
 */
const ROOF_STEPS = 6;
/*
 * The step's thickness is the step's RISE, and that is not a coincidence.
 *
 * At 0.20 against a 0.30 m rise every joint in the roof was a 0.10 m slot
 * open to the sky, six of them per tooth and eighteen down the shed: from
 * inside it read as a beautiful accident, shafts of light the length of the
 * building, and from outside it was a roof with daylight through it in a
 * regular stripe. Nothing chose that. At exactly the rise, consecutive steps
 * meet on a shared face, the roof is a roof, and the two openings that ARE
 * authored are the only two things through it.
 */
const ROOF_T = 0.30;

/* The two doors that make line 1, at the same x on both gables. */
const SHED_DOOR = { x0: 30.0, x1: 34.4, y1: 4.65 };
/* The missing sheets that make line 2, at the same z on both flanks. */
const SHED_SIDE = { z0: 99.0, z1: 102.2, y1: 4.05 };
/* The clerestory that is out, on the middle tooth, and the hole through the
 * third tooth's roof. */
const CLERE_OUT = { x0: 26.0, x1: 29.2 };
const ROOF_HOLE = { x0: 34.0, x1: 37.2, step0: 1, step1: 2 };

const COLS = { x: 26.4, half: 0.24, zs: [97.0, 103.0, 109.0] };
const CRANE = { y0: 4.60, y1: 5.05, z0: 101.70, z1: 102.05 };
const TOWER = {
  x0: 44.4, x1: 48.0, z0: 94.4, z1: 98.0, legs: 6.60, top: 9.20, legR: 0.11,
};

export function buildWorks(ctx) {
  const m = mats();
  /* 9701 is onsen.js's stream. 9151 is not used anywhere in the town: the
   * convention is a unique block per district and two districts sharing a
   * seed correlate their scatter. */
  const rng = rngKit(9151);
  const out = { sakura: [], shrubs: [], grove: [], petals: [], references: {} };

  buildBoundary(ctx, m, out);
  buildOffice(ctx, m);
  buildStack(ctx, m);
  buildShed(ctx, m, rng);
  buildTower(ctx, m);
  buildYard(ctx, m, rng, out);

  /*
   * Measured off what was built, not off the table above, so the numbers in
   * stats() are evidence rather than a copy of the intent. Same principle as
   * ./vendored/../references.js and as the two standalone freestyle maps.
   */
  out.references.worksShedDoor = {
    measured: +(SHED_DOOR.x1 - SHED_DOOR.x0).toFixed(2),
    unit: 'm',
    real: 'a works sliding door, 3 to 5 m',
  };
  out.references.worksShedSpan = {
    measured: +(SHED.x1 - SHED.x0).toFixed(2),
    unit: 'm',
    real: 'a single span steel portal shed, 12 to 24 m',
  };
  out.references.worksStackHeight = {
    measured: +(STACK.h).toFixed(2),
    unit: 'm',
    real: 'a small works stack, 12 to 20 m',
  };
  out.references.worksClerestory = {
    measured: +(SHED.ridge - SHED.eave).toFixed(2),
    unit: 'm',
    real: 'a sawtooth north light, 1.5 to 2.5 m',
  };
  return out;
}

/* ------------------------------------------------------------------ *
 * The boundary: a block wall on the road, mesh fence on the other three
 * sides, and two holes in it.
 * ------------------------------------------------------------------ */

function buildBoundary(ctx, m, out) {
  const y1 = GROUND + WALL.h;

  wallPanel(ctx, m.concreteMid, {
    axis: 'x', at: WALL.at, t: WALL.t, from: SITE.x0, to: SITE.x1,
    y0: GROUND, y1,
    holes: [
      { from: GATE.x0, to: GATE.x1, y0: GROUND - 1, y1: y1 + 1 },
      { from: BREACH.x0, to: BREACH.x1, y0: GROUND - 1, y1: y1 + 1 },
    ],
    name: 'worksWall',
  });
  /* The coping, which is what makes a block wall read as a block wall. It
   * does not cast: a 60 mm overhang's own shadow lands as a row of sawtooth
   * triangles along the wall face at this cascade size, which is the reason
   * the town's own `wallRun` clears the flag too. */
  for (const seg of [[SITE.x0, BREACH.x0], [BREACH.x1, GATE.x0], [GATE.x1, SITE.x1]]) {
    decal(ctx, m.concrete, seg[0], y1, WALL.at - WALL.t / 2 - 0.06,
      seg[1], y1 + 0.10, WALL.at + WALL.t / 2 + 0.06, { name: 'worksCoping', noOutline: false });
  }

  const leafZ0 = WALL.at + WALL.t / 2;
  /*
   * The two gate leaves, swung back INSIDE the wall and flat against it, and
   * TALLER than it. Flush, sharing the wall's inner face: a leaf standing
   * 0.15 m off the wall would be a slot 0.15 m wide and 2 m tall running the
   * length of the frontage, which is the exact thing the gap rule forbids.
   * But a leaf the same height as the wall it is folded against is invisible
   * from the road, which is where a pilot sees this gate from: measured, the
   * first version drew two panels nobody could ever see. A works gate is
   * 2.3 m against a 2.0 m wall anyway, so 0.25 m of it stands over the
   * coping and says the gate is open.
   */
  for (const seg of [[30.5, 32.9], [38.1, 40.5]]) {
    slab(ctx, m.metalDark, seg[0], GROUND + 0.06, leafZ0, seg[1], GROUND + 2.80, leafZ0 + 0.12,
      { name: 'worksGateLeaf' });
    /* The bars, drawn only. The leaf behind them is already solid. */
    for (let x = seg[0] + 0.22; x < seg[1] - 0.1; x += 0.34) {
      decal(ctx, m.metal, x, GROUND + 0.1, leafZ0 + 0.12, x + 0.06, GROUND + 2.72, leafZ0 + 0.17,
        { name: 'worksGateBar' });
    }
    /* The hinge post it hangs on, which is what stops a 2.4 m panel reading
     * as a card leaning on a wall. */
    post(ctx, m.metalDark, seg[0] + 0.06, leafZ0 + 0.06, GROUND, GROUND + 2.95, 0.09,
      { name: 'worksGatePost' });
  }
  /* 立入禁止 and the demolition notice, on the WALL beside the gate and
   * facing the road, which is the face a pilot arrives at. */
  const plateZ = WALL.at - WALL.t / 2 - 0.02;
  board(ctx, keepOut(), {
    x: 31.4, y: GROUND + 1.30, z: plateZ, w: 0.50, h: 0.66, ry: Math.PI,
    name: 'worksKeepOut',
  });
  board(ctx, worksNotice(), {
    x: 40.2, y: GROUND + 1.30, z: plateZ, w: 0.46, h: 0.61, ry: Math.PI,
    name: 'worksNotice',
  });

  /* The rubble where the wall came down. Three courses' worth, lying in the
   * gap and spilling both ways, and every one of them solid: a pilot who
   * takes this line low has to lift over them. */
  const rubble = [
    [22.1, 82.0, 23.9, 83.3, 0.34],
    [23.4, 82.8, 25.3, 84.0, 0.26],
    [24.4, 81.7, 25.5, 82.8, 0.42],
  ];
  for (const [x0, z0, x1, z1, h] of rubble) {
    slab(ctx, m.concreteDark, x0, GROUND, z0, x1, GROUND + h, z1, { name: 'worksRubble' });
  }
  patch(ctx, PAL.concreteDark, {
    x: 23.8, y: GROUND + 0.02, z: 83.2, w: 4.6, d: 3.0, opacity: 0.28, name: 'worksDust',
  });

  /* Mesh fence on the other three sides, with a flattened panel at the far
   * corner. `meshFence` is the town's own, so the fence round the works is
   * the same fence as the one round the school. */
  meshFence(ctx, { axis: 'z', at: SITE.x0, from: SITE.z0, to: SITE.z1, y: GROUND, h: 2.0 });
  meshFence(ctx, { axis: 'z', at: SITE.x1, from: SITE.z0, to: SITE.z1, y: GROUND, h: 2.0 });
  meshFence(ctx, { axis: 'x', at: SITE.z1, from: SITE.x0, to: 30.0, y: GROUND, h: 2.0 });
  meshFence(ctx, { axis: 'x', at: SITE.z1, from: 34.0, to: SITE.x1, y: GROUND, h: 2.0 });
  /* The flattened panel itself, lying on the grass where somebody walked
   * over it. Drawn, not solid: it is 60 mm of wire on the ground. */
  decal(ctx, m.metal, 30.0, GROUND + 0.05, SITE.z1 - 1.9, 34.0, GROUND + 0.09, SITE.z1 + 0.1,
    { name: 'worksFlatFence' });

  /* Two cherries on the road side of the wall, because the street trees do
   * not stop at the last house. `keep: true` holds them out of the town's
   * planting thin: they are the two that frame the works from the road and
   * a hash that removed one would take the composition with it. */
  /*
   * NOT IN FRONT OF A WINDOW. The first pass stood one of these at x = 27.6,
   * which is the centre of the office's third bay, and a cherry canopy is
   * 2.5 m across: probed, the line through that bay met leaf collision two
   * metres before it reached the wall. A tree that screens a pier is a tree;
   * a tree that screens the opening the building exists for is a mistake.
   */
  out.sakura.push({ x: 19.4, z: 81.2, y: GROUND, scale: 1.05, seed: 9711, keep: true });
  out.sakura.push({ x: 31.4, z: 81.2, y: GROUND, scale: 0.95, seed: 9712, lean: 0.1, keep: true });
  out.sakura.push({ x: 45.6, z: 81.2, y: GROUND, scale: 0.9, seed: 9713, keep: true });
  out.petals.push({ x: 31.4, z: 81.8, w: 3.4, d: 2.2, y: GROUND, n: 60 });
  out.petals.push({ x: 23.8, z: 83.8, w: 3.2, d: 2.6, y: GROUND, n: 44 });
}

/* ------------------------------------------------------------------ *
 * The office. Two floors, flat roof, and every window a gate.
 * ------------------------------------------------------------------ */

function buildOffice(ctx, m) {
  const { x0, x1, z0, z1, floor, roof, parapet } = OFFICE;
  const T = 0.24;

  /* The same three bays on both long faces at both levels, minus the one
   * that is a door on the ground floor. Three tunnels upstairs, two windows
   * and a doorway down. */
  const holes = [];
  OFF_BAYS.forEach(([a, b], i) => {
    holes.push(i === 0
      ? { from: a, to: b, y0: GROUND - 0.1, y1: GROUND + OFF_DOOR_Y }
      : { from: a, to: b, y0: GROUND + OFF_LO.y0, y1: GROUND + OFF_LO.y1 });
    holes.push({ from: a, to: b, y0: GROUND + OFF_HI.y0, y1: GROUND + OFF_HI.y1 });
  });

  for (const at of [z0, z1]) {
    wallPanel(ctx, m.wall, {
      axis: 'x', at, t: T, from: x0, to: x1, y0: GROUND, y1: roof,
      holes, name: 'worksOffice',
    });
  }
  /* The west gable is blind, which is what gives the tunnels their walls.
   * The east one carries the stair door. Both are inset by half the long
   * walls' thickness so the four meet on shared faces and leave no slot at
   * the corners. */
  wallPanel(ctx, m.wall, {
    axis: 'z', at: x0, t: T, from: z0 + T / 2, to: z1 - T / 2, y0: GROUND, y1: roof,
    name: 'worksOffice',
  });
  wallPanel(ctx, m.wall, {
    axis: 'z', at: x1, t: T, from: z0 + T / 2, to: z1 - T / 2, y0: GROUND, y1: roof,
    holes: [{
      from: STAIR_DOOR.z0, to: STAIR_DOOR.z1,
      y0: GROUND + STAIR_DOOR.y0, y1: GROUND + STAIR_DOOR.y1,
    }],
    name: 'worksOffice',
  });

  /* The intermediate floor, and the roof. Both are decks: you can stand on
   * the first floor if you come in through a window, and you can land on the
   * roof. The floor's slab is thin so the ground floor keeps its height. */
  deck(ctx, m.concreteMid, x0 + T / 2, z0 + T / 2, x1 - T / 2, z1 - T / 2, floor,
    { thick: 0.18, name: 'worksOfficeFloor' });
  deck(ctx, m.concrete, x0, z0, x1, z1, roof, { thick: 0.26, name: 'worksOfficeRoof' });
  /* The parapet: four low walls round the roof edge, standing ON the roof so
   * it is a kerb up there and not a wall through the rooms below. */
  for (const at of [z0 + 0.09, z1 - 0.09]) {
    wallPanel(ctx, m.concreteMid, {
      axis: 'x', at, t: 0.18, from: x0, to: x1, y0: roof, y1: parapet, name: 'worksParapet',
    });
  }
  for (const at of [x0 + 0.09, x1 - 0.09]) {
    wallPanel(ctx, m.concreteMid, {
      axis: 'z', at, t: 0.18, from: z0 + 0.18, to: z1 - 0.18, y0: roof, y1: parapet, name: 'worksParapet',
    });
  }

  /* The reveals round every opening, and the three panes that survived,
   * which are the only glass left in the works. Drawn only, so an opening
   * stays exactly the size it looks. */
  OFF_BAYS.forEach(([a, b], i) => {
    const bands = [i === 0 ? [GROUND, GROUND + OFF_DOOR_Y] : [GROUND + OFF_LO.y0, GROUND + OFF_LO.y1],
      [GROUND + OFF_HI.y0, GROUND + OFF_HI.y1]];
    for (const [yb, yt] of bands) {
      for (const at of [z0, z1]) {
        const face = at === z0 ? -1 : 1;
        decal(ctx, m.trim, a - 0.07, yb - 0.07, at + face * 0.13, b + 0.07, yt + 0.07, at + face * 0.16,
          { name: 'worksReveal' });
      }
    }
    /* Rust from the lintel of every opening on the road face. A steel angle
     * over a window is the first thing on a building like this to go. */
    decal(ctx, m.rustDeep, a + 0.18, GROUND + OFF_HI.y1, z0 - 0.14, a + 0.28, roof - 0.35, z0 - 0.12,
      { name: 'worksStreak' });
    decal(ctx, m.rustDeep, b - 0.30, GROUND + OFF_LO.y1, z0 - 0.14, b - 0.20, GROUND + OFF_HI.y0 - 0.2, z0 - 0.12,
      { name: 'worksStreak' });
  });
  const kept = [[OFF_BAYS[1], GROUND + OFF_LO.y0, z0], [OFF_BAYS[2], GROUND + OFF_HI.y0, z0],
    [OFF_BAYS[0], GROUND + OFF_HI.y0, z1]];
  for (const [[a, b], yb, at] of kept) {
    const face = at === z0 ? -1 : 1;
    decal(ctx, m.glass, a, yb, at + face * 0.11, b, yb + 0.58, at + face * 0.13, { name: 'worksPane' });
  }

  /* The name board, over the middle bay, on the road face. */
  board(ctx, worksName(), {
    x: (x0 + x1) / 2, y: GROUND + 3.10, z: z0 - 0.14, w: 4.60, h: 1.15, ry: Math.PI,
    name: 'worksSign',
  });

  /*
   * The external stair: a straight flight from the yard up to a landing at
   * the first floor door. Eight treads over 3.8 m of run for 3.45 m of rise,
   * which is 42 degrees and is what an industrial stair actually is. Drawn
   * and solid as the same steps, because a rotated box's collider is its
   * axis aligned hull and that would put a wall over the whole flight.
   */
  const s = STAIR;
  deck(ctx, m.metal, s.x0, s.zLand0, s.x1, s.zLand1, s.landing, { thick: 0.22, name: 'worksLanding' });
  const run = (s.zFoot - s.zLand1) / s.treads;
  for (let i = 0; i < s.treads; i += 1) {
    const top = GROUND + (s.landing - GROUND) * (1 - i / s.treads);
    deck(ctx, m.metal, s.x0, s.zLand1 + i * run, s.x1, s.zLand1 + (i + 1) * run, top,
      { thick: 0.09, name: 'worksTread' });
    /* The stringer, one short piece per tread down each side. Drawn only, so
     * the wedge of air under the flight stays flyable: what this fixes is a
     * flight of eight treads that read as eight planks floating in a row
     * because a 90 mm deck has no edge to see. */
    for (const sx of [s.x0, s.x1 - 0.09]) {
      decal(ctx, m.metalDark, sx, top - 0.42, s.zLand1 + i * run, sx + 0.09, top - 0.09,
        s.zLand1 + (i + 1) * run, { name: 'worksStringer', noOutline: false });
    }
  }
  /* Two posts under the landing's outer corners, and the handrail up the
   * outside of the flight. Solid, because a drawn bar you can pass through
   * is the same lie as an invisible wall, only the other way round. */
  post(ctx, m.metalDark, s.x1 - 0.12, s.zLand0 + 0.12, GROUND, s.landing, 0.10, { name: 'worksStairPost' });
  post(ctx, m.metalDark, s.x1 - 0.12, s.zLand1 - 0.12, GROUND, s.landing, 0.10, { name: 'worksStairPost' });
  slab(ctx, m.metalDark, s.x1 - 0.07, GROUND + 1.0, s.zLand0, s.x1 + 0.01, s.landing + 1.0, s.zLand1,
    { name: 'worksStairRail' });
}

/* ------------------------------------------------------------------ *
 * The boiler house, the flue and the stack.
 * ------------------------------------------------------------------ */

function buildStack(ctx, m) {
  const b = BOILER;
  const T = 0.26;
  /* The town has no brick, so ./kit.js derives one: see the note there. */
  const brick = m.brick;

  /* The boiler house: three blind walls, one open side facing the yard, and
   * a flat roof you can land on. The open side is what makes it a shelter
   * rather than a box, and it is 4.3 m wide by 3.0 m tall. */
  wallPanel(ctx, m.concreteMid, {
    axis: 'x', at: b.z0, t: T, from: b.x0, to: b.x1, y0: GROUND, y1: b.roof,
    holes: [{ from: b.x0 + 0.4, to: b.x1 - 0.4, y0: GROUND, y1: GROUND + 3.0 }],
    name: 'worksBoiler',
  });
  wallPanel(ctx, m.concreteMid, {
    axis: 'x', at: b.z1, t: T, from: b.x0, to: b.x1, y0: GROUND, y1: b.roof, name: 'worksBoiler',
  });
  wallPanel(ctx, m.concreteMid, {
    axis: 'z', at: b.x0, t: T, from: b.z0 + T / 2, to: b.z1 - T / 2, y0: GROUND, y1: b.roof, name: 'worksBoiler',
  });
  wallPanel(ctx, m.concreteMid, {
    axis: 'z', at: b.x1, t: T, from: b.z0 + T / 2, to: b.z1 - T / 2, y0: GROUND, y1: b.roof,
    holes: [{ from: b.z0 + 1.2, to: b.z0 + 2.6, y0: GROUND + 0.9, y1: GROUND + 2.3 }],
    name: 'worksBoiler',
  });
  deck(ctx, m.concrete, b.x0, b.z0, b.x1, b.z1, b.roof, { thick: 0.24, name: 'worksBoilerRoof' });
  board(ctx, safetyFirst(), {
    x: (b.x0 + b.x1) / 2 - 1.4, y: GROUND + 3.05, z: b.z0 - 0.15, w: 1.30, h: 0.65, ry: Math.PI,
    name: 'worksSafety',
  });

  /*
   * The stack. Five courses, each a little narrower than the one below, so
   * the taper is drawn exactly as it is solid and every set-back gives the
   * ink pass a line to draw. A cone would be smoother and would need a
   * collider that is not a cone.
   */
  const s = STACK;
  slab(ctx, m.concreteDark, s.cx - s.plinth, GROUND, s.cz - s.plinth,
    s.cx + s.plinth, GROUND + 1.15, s.cz + s.plinth, { name: 'worksStackPlinth' });
  const courses = 5;
  for (let i = 0; i < courses; i += 1) {
    const t0 = i / courses;
    const t1 = (i + 1) / courses;
    const r = s.base + (s.top - s.base) * t0;
    const y0 = GROUND + 1.15 + (s.h - 1.15) * t0;
    const y1 = GROUND + 1.15 + (s.h - 1.15) * t1;
    slab(ctx, brick, s.cx - r, y0, s.cz - r, s.cx + r, y1, s.cz + r, { name: 'worksStack' });
    /* The band at each set-back. Drawn only: it is 40 mm of iron round a
     * shaft that is already solid. */
    decal(ctx, m.metalDark, s.cx - r - 0.06, y1 - 0.16, s.cz - r - 0.06,
      s.cx + r + 0.06, y1, s.cz + r + 0.06, { name: 'worksStackBand', noOutline: false });
  }
  /* The cap, and the ladder up the west face. The ladder is drawn: it is a
   * 60 mm rung on a shaft the pilot is going to be looking at from twenty
   * metres away and it must not become a wall. */
  decal(ctx, m.metalDark, s.cx - s.top - 0.12, GROUND + s.h, s.cz - s.top - 0.12,
    s.cx + s.top + 0.12, GROUND + s.h + 0.18, s.cz + s.top + 0.12,
    { name: 'worksStackCap', noOutline: false });
  for (let y = GROUND + 1.6; y < GROUND + s.h - 0.4; y += 0.42) {
    const t = (y - GROUND - 1.15) / (s.h - 1.15);
    const r = s.base + (s.top - s.base) * t;
    decal(ctx, m.metalDark, s.cx - r - 0.16, y, s.cz - 0.22, s.cx - r, y + 0.05, s.cz + 0.22,
      { name: 'worksStackRung' });
  }

  /*
   * The flue duct from the boiler house to the stack, and the reason it is
   * here at all is the 1.75 m of air underneath it. A duct at head height
   * between two solid things is a gate that costs nothing, because the duct
   * had to exist for the stack to make sense.
   */
  slab(ctx, m.rust, b.x1, GROUND + FLUE.y0, s.cz - FLUE.half, s.cx - s.base, GROUND + FLUE.y1, s.cz + FLUE.half,
    { name: 'worksFlue' });
  ribs(ctx, m.rustDeep, {
    axis: 'z', at: s.cz - FLUE.half, from: b.x1, to: s.cx - s.base,
    y0: GROUND + FLUE.y0, y1: GROUND + FLUE.y1, pitch: 0.5, w: 0.07, depth: 0.03, face: -1,
    name: 'worksFlueRib',
  });
}

/* ------------------------------------------------------------------ *
 * The shed. Everything here exists to make lines 1 to 4.
 * ------------------------------------------------------------------ */

function buildShed(ctx, m, rng) {
  const s = SHED;

  /* ---- the two gables, with the door and the hole opposite each other ---- */
  const doorHole = { from: SHED_DOOR.x0, to: SHED_DOOR.x1, y0: GROUND - 0.1, y1: GROUND + SHED_DOOR.y1 };
  const personnel = { from: 24.6, to: 25.8, y0: GROUND - 0.1, y1: GROUND + 2.10 };
  wallPanel(ctx, m.sheet, {
    axis: 'x', at: s.z0, t: s.t, from: s.x0, to: s.x1, y0: GROUND, y1: s.eave,
    holes: [doorHole, personnel], name: 'worksShed',
  });
  wallPanel(ctx, m.sheet, {
    axis: 'x', at: s.z1, t: s.t, from: s.x0, to: s.x1, y0: GROUND, y1: s.eave,
    holes: [doorHole], name: 'worksShed',
  });
  /* ---- the two flanks, with the missing sheets opposite each other ---- */
  const sideHole = { from: SHED_SIDE.z0, to: SHED_SIDE.z1, y0: GROUND - 0.1, y1: GROUND + SHED_SIDE.y1 };
  for (const at of [s.x0, s.x1]) {
    wallPanel(ctx, m.sheet, {
      axis: 'z', at, t: s.t, from: s.z0 + s.t / 2, to: s.z1 - s.t / 2, y0: GROUND, y1: s.eave,
      holes: [sideHole], name: 'worksShed',
    });
  }
  /* The cladding ribs, on all four faces, skipping the openings. This is the
   * single strongest read the works has and it is one merged mesh a face
   * with no collider at all: the ink pass turns a 35 mm step into a ruled
   * field of vertical lines. */
  ribs(ctx, m.sheetDark, {
    axis: 'x', at: s.z0 - s.t / 2, from: s.x0, to: s.x1, y0: GROUND, y1: s.eave, face: -1,
    holes: [{ from: SHED_DOOR.x0, to: SHED_DOOR.x1, y0: GROUND, y1: GROUND + SHED_DOOR.y1 },
      { from: 24.6, to: 25.8, y0: GROUND, y1: GROUND + 2.1 }],
    name: 'worksShedRib',
  });
  ribs(ctx, m.sheetDark, {
    axis: 'x', at: s.z1 + s.t / 2, from: s.x0, to: s.x1, y0: GROUND, y1: s.eave, face: 1,
    holes: [{ from: SHED_DOOR.x0, to: SHED_DOOR.x1, y0: GROUND, y1: GROUND + SHED_DOOR.y1 }],
    name: 'worksShedRib',
  });
  for (const [at, face] of [[s.x0 - s.t / 2, -1], [s.x1 + s.t / 2, 1]]) {
    ribs(ctx, m.sheetDark, {
      axis: 'z', at, from: s.z0, to: s.z1, y0: GROUND, y1: s.eave, face,
      holes: [{ from: SHED_SIDE.z0, to: SHED_SIDE.z1, y0: GROUND, y1: GROUND + SHED_SIDE.y1 }],
      name: 'worksShedRib',
    });
  }
  /* The torn edge where the sheets came off, both flanks. A 40 mm lip of
   * folded steel down each side of the hole says the sheet was taken rather
   * than that the building was drawn with a rectangle missing. */
  for (const at of [s.x0, s.x1]) {
    for (const z of [SHED_SIDE.z0, SHED_SIDE.z1]) {
      decal(ctx, m.rust, at - 0.16, GROUND, z - 0.05, at + 0.16, GROUND + SHED_SIDE.y1, z + 0.05,
        { name: 'worksTorn', noOutline: false });
    }
    decal(ctx, m.rust, at - 0.16, GROUND + SHED_SIDE.y1 - 0.05, SHED_SIDE.z0,
      at + 0.16, GROUND + SHED_SIDE.y1 + 0.05, SHED_SIDE.z1, { name: 'worksTorn', noOutline: false });
  }

  /* ---- the teeth ---- */
  for (let k = 0; k < TEETH; k += 1) {
    const z0 = s.z0 + k * TOOTH;
    /* The clerestory: a vertical face from the eave to the ridge, glazed,
     * facing away from the sun. The middle one is out over 3.2 m and that
     * is entry line 3. */
    const out = k === 1 ? [{ from: CLERE_OUT.x0, to: CLERE_OUT.x1, y0: s.eave, y1: s.ridge }] : [];
    wallPanel(ctx, m.trim, {
      axis: 'x', at: z0 + 0.09, t: 0.18, from: s.x0, to: s.x1, y0: s.eave, y1: s.ridge,
      holes: out, name: 'worksClerestory',
    });
    /* The glass in it, drawn only, and skipped where it is out. */
    for (let x = s.x0 + 0.2; x < s.x1 - 0.5; x += 1.55) {
      if (k === 1 && x + 1.35 > CLERE_OUT.x0 && x < CLERE_OUT.x1) {
        continue;
      }
      decal(ctx, m.glassDark, x, s.eave + 0.12, z0 - 0.02, x + 1.35, s.ridge - 0.12, z0 + 0.02,
        { name: 'worksClerePane' });
    }
    /* And the roof of the tooth: six steps down from the ridge to the eave
     * of the next one. */
    for (let i = 0; i < ROOF_STEPS; i += 1) {
      /* Tops from the ridge DOWN, not from the middle of each step: the
       * lowest step's underside then lands exactly on the eave, sharing a
       * face with the wall head instead of cutting 0.15 m into it. */
      const top = s.ridge - ((s.ridge - s.eave) / ROOF_STEPS) * i;
      const za = z0 + 0.18 + (TOOTH - 0.18) * (i / ROOF_STEPS);
      const zb = z0 + 0.18 + (TOOTH - 0.18) * ((i + 1) / ROOF_STEPS);
      /* The hole through the third tooth. Two steps out of six, 3.2 m
       * across: a drop into a shed that has two ways out at floor level,
       * which is what stops it being a dive with nowhere to go. */
      if (k === 2 && i >= ROOF_HOLE.step0 && i <= ROOF_HOLE.step1) {
        deck(ctx, m.sheet, s.x0, za, ROOF_HOLE.x0, zb, top, { thick: ROOF_T, name: 'worksRoof' });
        deck(ctx, m.sheet, ROOF_HOLE.x1, za, s.x1, zb, top, { thick: ROOF_T, name: 'worksRoof' });
        continue;
      }
      deck(ctx, m.sheet, s.x0, za, s.x1, zb, top, { thick: ROOF_T, name: 'worksRoof' });
    }
  }
  /* The torn flashing round the roof hole, so the hole has an edge. */
  for (const x of [ROOF_HOLE.x0, ROOF_HOLE.x1]) {
    decal(ctx, m.rust, x - 0.07, s.eave + 0.9, s.z0 + 2 * TOOTH + 0.18 + (TOOTH - 0.18) / 6,
      x + 0.07, s.eave + 1.5, s.z0 + 2 * TOOTH + 0.18 + (TOOTH - 0.18) / 2,
      { name: 'worksTorn', noOutline: false });
  }

  /* ---- inside ---- */
  /* Three columns down the west side of the shed. Deliberately NOT on the
   * centreline: the centreline is line 1, and a column standing in it is
   * the shed's best run turned into a slalom nobody asked for. */
  for (const z of COLS.zs) {
    post(ctx, m.metalDark, COLS.x, z, GROUND, s.eave, COLS.half, { name: 'worksColumn' });
  }
  /*
   * The crane rail, wall to wall at 4.60 to 5.05 m. It shares a face with
   * both flanks, so there is no slot at either end, and it sits above the
   * side openings (which stop at 4.05) and just under the door head (4.65),
   * so line 1 goes under it and line 2 goes under it and neither is blocked.
   */
  slab(ctx, m.metal, s.x0, GROUND + CRANE.y0, CRANE.z0, s.x1, GROUND + CRANE.y1, CRANE.z1,
    { name: 'worksCrane' });
  /* The crab, hanging off the rail east of line 1 so it is something to
   * carve round on the way through rather than something in the way. */
  slab(ctx, m.rust, 35.4, GROUND + 3.70, 101.35, 36.9, GROUND + CRANE.y0, 102.40,
    { name: 'worksCrab' });
  decal(ctx, m.metalDark, 36.0, GROUND + 2.20, 101.80, 36.3, GROUND + 3.70, 102.00,
    { name: 'worksHook' });

  /* Machine bases. Every one of them clear of both lines and at least 1.4 m
   * from anything else standing up. */
  const plinths = [
    [23.0, 94.6, 24.7, 95.8, 0.50],
    [23.0, 106.0, 24.7, 107.2, 0.50],
    [38.4, 95.0, 40.2, 96.2, 0.50],
    [38.4, 106.4, 40.6, 108.0, 0.70],
  ];
  for (const [x0, z0, x1, z1, h] of plinths) {
    slab(ctx, m.concreteDark, x0, GROUND, z0, x1, GROUND + h, z1, { name: 'worksPlinth' });
    decal(ctx, m.rust, x0 + 0.2, GROUND + h, z0 + 0.2, x0 + 0.42, GROUND + h + 0.16, z0 + 0.42,
      { name: 'worksBolt', noOutline: false });
  }
  /* A pallet stack and a toppled rack, the two bits of shed junk that read
   * from the door. */
  for (let i = 0; i < 3; i += 1) {
    slab(ctx, m.wood, 28.2, GROUND + i * 0.32, 107.4, 29.4, GROUND + 0.26 + i * 0.32, 108.6,
      { name: 'worksPallet' });
  }
  slab(ctx, m.rust, 37.0, GROUND, 99.6, 40.5, GROUND + 0.40, 100.4, { name: 'worksRack' });

  /* The floor: an oil stained slab with the bay numbers still on it and
   * weeds coming through where the roof lets the rain in. */
  patch(ctx, PAL.concreteDark, {
    x: (s.x0 + s.x1) / 2, y: GROUND + 0.02, z: (s.z0 + s.z1) / 2, w: 19.0, d: 17.0,
    opacity: 0.20, name: 'worksFloor',
  });
  for (let i = 1; i <= 4; i += 1) {
    board(ctx, bayDigit(i), {
      x: 31.0, y: GROUND + 0.035, z: 95.5 + (i - 1) * 4.4, w: 1.7, h: 1.7,
      rx: -Math.PI / 2, transparent: true, name: 'worksBay',
    });
  }
  for (let i = 0; i < 7; i += 1) {
    patch(ctx, 0x4a4458, {
      x: 24 + rng.range(0, 17), y: GROUND + 0.03, z: 94 + rng.range(0, 16),
      round: true, r: rng.range(0.5, 1.5), opacity: 0.22, sz: rng.range(0.5, 1.0),
      name: 'worksOil',
    });
  }
}

/* ------------------------------------------------------------------ *
 * The water tower: four legs and a tank, and 6.15 m of clear air.
 * ------------------------------------------------------------------ */

function buildTower(ctx, m) {
  const t = TOWER;
  const legs = [[t.x0 + 0.6, t.z0 + 0.6], [t.x1 - 0.6, t.z0 + 0.6],
    [t.x0 + 0.6, t.z1 - 0.6], [t.x1 - 0.6, t.z1 - 0.6]];
  for (const [x, z] of legs) {
    post(ctx, m.metalDark, x, z, GROUND, GROUND + t.legs, t.legR, { name: 'worksTowerLeg' });
  }
  /* The cross bracing, drawn only: it is a 60 mm angle and a pilot who
   * takes the gate under this tower is taking a 2.2 m square hole between
   * the legs, not a 60 mm one. */
  for (const [x0, z0, x1, z1] of [[legs[0][0], legs[0][1], legs[1][0], legs[1][1]],
    [legs[2][0], legs[2][1], legs[3][0], legs[3][1]]]) {
    decal(ctx, m.metalDark, x0, GROUND + 2.6, z0 - 0.04, x1, GROUND + 2.72, z1 + 0.04,
      { name: 'worksBrace' });
    decal(ctx, m.metalDark, x0, GROUND + 5.0, z0 - 0.04, x1, GROUND + 5.12, z1 + 0.04,
      { name: 'worksBrace' });
  }
  slab(ctx, m.rust, t.x0, GROUND + t.legs, t.z0, t.x1, GROUND + t.top, t.z1, { name: 'worksTank' });
  decal(ctx, m.rustDeep, t.x0 - 0.10, GROUND + t.top, t.z0 - 0.10, t.x1 + 0.10, GROUND + t.top + 0.16, t.z1 + 0.10,
    { name: 'worksTankLip', noOutline: false });
  /* The downpipe, into the yard. */
  decal(ctx, m.metalDark, t.x0 + 0.30, GROUND, t.z1 - 0.34, t.x0 + 0.44, GROUND + t.legs, t.z1 - 0.20,
    { name: 'worksDownpipe', noOutline: false });
}

/* ------------------------------------------------------------------ *
 * The yard: what is lying about, and what has grown through it.
 * ------------------------------------------------------------------ */

function buildYard(ctx, m, rng, out) {
  /* The skip, and the drums. Two drums, well apart: five of them scattered
   * would be four slots a metre wide, which is the gap rule's whole point. */
  slab(ctx, m.rust, 43.5, GROUND, 89.0, 46.9, GROUND + 1.30, 90.7, { name: 'worksSkip' });
  decal(ctx, m.rustDeep, 43.4, GROUND + 1.30, 88.9, 47.0, GROUND + 1.42, 90.8,
    { name: 'worksSkipLip', noOutline: false });

  const drum = (x, z, seed) => {
    const g = cyl(0.29, 0.29, 0.88, 10, m.rust, x, GROUND + 0.44, z);
    g.castShadow = true;
    g.receiveShadow = true;
    g.name = 'worksDrum';
    ctx.add(g);
    hit(ctx, x - 0.29, GROUND, z - 0.29, x + 0.29, GROUND + 0.88, z + 0.29);
    patch(ctx, 0x4a4458, {
      x: x + 0.4, y: GROUND + 0.03, z: z + 0.3, round: true, r: 0.8, opacity: 0.24,
      sz: 0.7, ry: seed, name: 'worksOil',
    });
  };
  drum(44.6, 84.4, 0.4);
  drum(21.9, 96.4, 1.1);
  /* One on its side, which is the one that reads. */
  const lying = cyl(0.29, 0.29, 0.88, 10, m.rustDeep, 46.6, GROUND + 0.29, 91.9);
  lying.rotation.z = Math.PI / 2;
  lying.castShadow = true;
  lying.name = 'worksDrum';
  ctx.add(lying);
  hit(ctx, 46.16, GROUND, 91.61, 47.04, GROUND + 0.58, 92.19);

  /* Steel section, stacked where it was unloaded and never moved. */
  slab(ctx, m.metalDark, 43.0, GROUND, 92.0, 46.6, GROUND + 0.34, 93.0, { name: 'worksSteel' });
  slab(ctx, m.metalDark, 43.3, GROUND + 0.34, 92.2, 46.3, GROUND + 0.62, 92.8, { name: 'worksSteel' });

  /* The yard surface: three patches rather than one, so it reads as
   * concrete that has been patched and re-patched rather than as a slab. */
  patch(ctx, PAL.gravel, { x: 35.0, y: GROUND + 0.015, z: 88.5, w: 26.0, d: 8.0, opacity: 0.30, name: 'worksApron' });
  patch(ctx, PAL.roadWorn, { x: 35.5, y: GROUND + 0.025, z: 84.2, w: 8.0, d: 2.6, opacity: 0.45, name: 'worksApron' });
  patch(ctx, PAL.dirt, { x: 45.0, y: GROUND + 0.02, z: 104.0, w: 9.0, d: 16.0, opacity: 0.35, name: 'worksBare' });

  /*
   * What has grown back. This is half of what makes the place read as
   * abandoned rather than as closed: self seeded green along the fence
   * lines where nobody drives, and weeds in every crack in the yard.
   *
   * The spots are handed back rather than planted, because the town merges
   * every tree in the world into one mesh plus three instanced canopies and
   * that has to happen once, at the end. `keep: true` on the two that make
   * the silhouette from the road.
   */
  /*
   * SELF SEEDED, AND OUTSIDE THE BUILDING. Measured: the first version put
   * two of these at z 112.1 and 112.3, which is 1.1 m off the shed's north
   * wall, and a grove canopy is 2.5 m across at this scale -- so both of them
   * grew THROUGH the wall and hung inside the shed at four metres, in the
   * middle of the one line the building exists for. The same happened on the
   * west side, where the gap between the fence and the shed is 2.5 m and a
   * tree in it fouls both. Nothing self seeds in a 2.5 m alley anyway: it
   * seeds where nothing drives, which is outside the fence.
   */
  const trees = [
    [17.8, 100.4, 1.15, true], [17.4, 108.6, 0.95, false],
    [48.6, 96.0, 1.05, true], [48.6, 105.4, 0.85, false],
    [27.0, 116.4, 0.9, false], [42.0, 115.8, 1.0, false],
    [52.6, 90.0, 0.8, false],
  ];
  trees.forEach(([x, z, scale, keep], i) => {
    out.grove.push({ x, z, y: GROUND, scale, seed: 9720 + i, spread: 1.1, keep });
  });
  for (let i = 0; i < 16; i += 1) {
    const x = 20.6 + rng.range(0, 28.8);
    const z = 83.2 + rng.range(0, 29.2);
    /* Not inside the shed or the office: weeds get in through a hole in a
     * roof, they do not carpet a floor that still has a roof over most of
     * it. The two exceptions below are under the roof hole and under the
     * clerestory that is out, which is exactly where the rain gets in. */
    if (x > SHED.x0 && x < SHED.x1 && z > SHED.z0 && z < SHED.z1) {
      continue;
    }
    if (x > OFFICE.x0 && x < OFFICE.x1 && z > OFFICE.z0 && z < OFFICE.z1) {
      continue;
    }
    out.shrubs.push({ x, z, y: GROUND, r: rng.range(0.28, 0.5), count: 3, spread: 0.9, seed: 9740 + i });
  }
  out.shrubs.push({ x: 35.6, z: 107.0, y: GROUND, r: 0.42, count: 3, spread: 0.8, seed: 9761 });
  out.shrubs.push({ x: 27.6, z: 100.4, y: GROUND, r: 0.36, count: 2, spread: 0.7, seed: 9762 });

  /* Blossom drifts in the corners the wind puts it, which on this site is
   * the inside of the frontage wall and the lee of the shed's south gable. */
  out.petals.push({ x: 31.0, z: 83.4, w: 8.0, d: 1.6, y: GROUND, n: 70 });
  out.petals.push({ x: 32.0, z: 92.3, w: 12.0, d: 1.4, y: GROUND, n: 60 });
  out.petals.push({ x: 32.2, z: 106.9, w: 3.2, d: 2.0, y: GROUND, n: 40 });

  /* One notice on the mesh fence, on the way in from the road. */
  board(ctx, worksNotice(), {
    x: SITE.x0 + 0.06, y: GROUND + 1.25, z: 94.0, w: 0.46, h: 0.61, ry: -Math.PI / 2,
    name: 'worksNotice',
  });
}

/* Re-exported so ./index.js can report where the place is without knowing
 * how it is built. */
export const WORKS_SITE = SITE;
export const WORKS_LANDMARK = { x: STACK.cx, z: STACK.cz, top: GROUND + STACK.h };
