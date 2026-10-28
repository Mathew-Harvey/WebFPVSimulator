/*
 * landmarks.js: the five places round Sunnyfield's edge, each a line of its
 * own to fly. Pure, as ./frame.js is.
 *
 *   the power plant   north east, behind its wall: a turbine hall open at
 *                     both ends, two cooling towers on legs that you dive
 *                     into over the rim and leave between the legs, the
 *                     reactor's dome, the stack, tanks, a pipe rack, and a
 *                     few barrels nobody has looked at in a while.
 *   the gorge         north of the town square: fourteen metres deep, its
 *                     walls ragged, a plank bridge across, a waterfall at
 *                     its head, and a ramp at its lip that somebody built.
 *   the hill          north, at the top of Mill Road: three grassy tiers,
 *                     the town's name in letters on the second, and the
 *                     big house on the top behind its gate.
 *   the dump          north west, at the end of Oak Street: junk mounds, car
 *                     cubes, and the tyre pile that has been burning since
 *                     before anybody can remember.
 *   the park          south east, past Pine Street: the pond, the bandstand,
 *                     a playground and the skate corner.
 *
 * The gorge digs below the town's ground, as the houses' basements do: its
 * walls are solid boxes from its floor to the grass, and its floor is the
 * ground the plant is given inside it (gorgeFloor, read by ./index.js as
 * extra.floor), so nothing about the physics changes.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { rng, W, D } from './frame.js';
import { sincos } from '../../props/trig.js';
import { HALF, WALK, OAK_X, MILL_X, PLANT_X, PLANT_END, OAK_END, MILL_END, bench, bin } from './streets.js';

const TAU = Math.PI * 2;
const _sc = { s: 0, c: 1 };
const around = (r, a) => {
  sincos(a, _sc);
  return [r * _sc.c, r * _sc.s];
};

/* ------------------------------------------------------------------ */
/* The power plant                                                     */
/* ------------------------------------------------------------------ */

export const PLANT = { x0: 300, x1: W, y0: 157, y1: D, wallH: 3.0 };

/* The turbine hall, its doors east and west on the line py = doorY. */
export const HALL = { x0: 310, x1: 372, y0: 166, y1: 196, h: 15, t: 0.5, doorY: 181, doorW: 8, doorH: 8 };

/*
 * THE COOLING TOWERS. A hyperboloid shell on a ring of legs: the shell from
 * `lip` to the rim at H, its radius r(h) = a sqrt(1 + ((h - hT) / c)^2), a
 * throat a round at hT. The shell is staves, as ../../props/industrial.js's
 * hollow chimney is: n capsules round, each a chain of straight pieces
 * between the same heights the drawing bends at (BENDS), so where the brick
 * is drawn is where it is solid. Under the lip, legs, as far apart as a
 * quad wants: dive in over the rim and out between any two.
 */
export const TOWERS = [
  { px: 330, py: 240, seed: 1 },
  { px: 375, py: 247, seed: 2 },
];
export const TOWER = { a: 8.4, hT: 30, c: 23, H: 40, lip: 5.5, rs: 0.9, n: 44, legs: 22, legR: 0.45 };
const BENDS = [5.5, 11, 17, 23, 30, 35, 40];
export const towerR = (h) => TOWER.a * Math.sqrt(1 + ((h - TOWER.hT) / TOWER.c) * ((h - TOWER.hT) / TOWER.c));
/* A stave's axis at height h: its outer face on the drawn shell. */
export const staveR = (h) => towerR(h) - TOWER.rs;

function coolingTower(T, t) {
  const { rs, n, legs, legR, lip, H } = TOWER;
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * TAU;
    for (let k = 0; k + 1 < BENDS.length; k += 1) {
      const h0 = BENDS[k];
      const h1 = BENDS[k + 1];
      const [ax, ay] = around(staveR(h0), a);
      const [bx, by] = around(staveR(h1), a);
      /* The lowest piece's foot is the lip, the top piece's dome the rim. */
      const b0 = k === 0 ? h0 + rs : h0;
      const b1 = k + 2 === BENDS.length ? h1 - rs : h1;
      T.cap('sfTower', [t.px + ax, t.py + ay, b0], [t.px + bx, t.py + by, b1], rs, { draw: false, kind: 'wall', name: 'cooling tower' });
    }
  }
  /* The drawing: the shell outside, the bore inside, a band of grime at
   * the rim, the lip's ring beam. */
  for (let k = 0; k + 1 < BENDS.length; k += 1) {
    const h0 = BENDS[k];
    const h1 = BENDS[k + 1];
    const top = k + 2 === BENDS.length;
    T.shell(top ? 'sfConcrete' : 'sfTower', t.px, t.py, h0, top ? h1 - 1.5 : h1, towerR(h0), top ? towerR(h1 - 1.5) : towerR(h1), false);
    if (top) {
      T.shell('sfStone', t.px, t.py, h1 - 1.5, h1, towerR(h1 - 1.5), towerR(h1), false);
    }
    T.shell('sfTowerIn', t.px, t.py, h0, h1, staveR(h0) - rs - 0.01, staveR(h1) - rs - 0.01, true);
  }
  T.torus('sfStone', t.px, t.py, H - rs, staveR(H - rs), rs, 0, 0, 8, 56);
  T.torus('sfConcrete', t.px, t.py, lip + rs, staveR(lip + rs), rs + 0.05, 0, 0, 8, 56);
  /* The legs, from the ground up into the lip, and the pond under. */
  for (let i = 0; i < legs; i += 1) {
    const a = ((i + 0.5) / legs) * TAU;
    const [x, y] = around(staveR(lip + rs), a);
    T.post('sfConcrete', t.px + x, t.py + y, 0, lip + rs, legR, { kind: 'pole', name: 'tower leg', seg: 8 });
  }
  T.disc('sfWater', t.px, t.py, staveR(lip) - 1.2, 0, 0.05, 40, false);
  T.disc('sfConcrete', t.px, t.py, staveR(lip) + 0.6, 0, 0.04, 40, true);
  /* The ladder up the outside, on the side away from the hall. */
  const [lx, ly] = around(1, Math.PI / 2);
  for (let h = lip + 2; h < H - 1; h += 2.6) {
    const r = towerR(h) + 0.12;
    T.cyl('sfIron', [t.px + lx * r - 0.25, t.py + ly * r, h], [t.px + lx * r + 0.25, t.py + ly * r, h], 0.03, 4, null, true);
  }
}

function plant(T) {
  const P = PLANT;
  /* The yard's concrete, and its wall: west and south, the gate on Plant
   * Road. */
  T.paint('sfConcrete', P.x0, P.y0, 0, P.x1, P.y1, 0.02);
  const gx0 = PLANT_X - HALF - WALK;
  const gx1 = PLANT_X + HALF + WALK;
  for (const [x0, x1] of [[P.x0, gx0], [gx1, P.x1]]) {
    T.box('sfStone', x0, P.y0 - 0.5, 0, x1, P.y0, P.wallH, { kind: 'wall', name: 'plant wall' });
    T.deco('sfTrim', x0, P.y0 - 0.6, P.wallH - 0.2, x1, P.y0 + 0.1, P.wallH);
    /* The wire along its top. */
    T.cyl('sfIron', [x0, P.y0 - 0.25, P.wallH + 0.5], [x1, P.y0 - 0.25, P.wallH + 0.5], 0.02, 3, null, true);
    T.cyl('sfIron', [x0, P.y0 - 0.25, P.wallH + 0.9], [x1, P.y0 - 0.25, P.wallH + 0.9], 0.02, 3, null, true);
    for (let x = x0 + 0.2; x < x1; x += 3) {
      T.cyl('sfIron', [x, P.y0 - 0.25, P.wallH], [x, P.y0 - 0.25, P.wallH + 1.0], 0.03, 4, null, true);
    }
  }
  T.box('sfStone', P.x0, P.y0, 0, P.x0 + 0.5, P.y1, P.wallH, { kind: 'wall', name: 'plant wall' });
  T.deco('sfTrim', P.x0 - 0.1, P.y0, P.wallH - 0.2, P.x0 + 0.6, P.y1, P.wallH);
  /* The gate: a gantry over the road with the plant's name, a guard hut,
   * a barrier arm, up. */
  const gh = 6.5;
  for (const x of [gx0 - 0.6, gx1 + 0.6]) {
    T.box('sfSteel', x - 0.4, P.y0 - 0.4, 0, x + 0.4, P.y0 + 0.4, gh + 1.6, { kind: 'wall', name: 'gate post' });
  }
  T.box('sfDoorNavy', gx0 - 1.0, P.y0 - 0.35, gh, gx1 + 1.0, P.y0 + 0.35, gh + 1.6, { kind: 'wall', name: 'gate beam' });
  T.sign('plantGate', PLANT_X, P.y0 - 0.37, gh + 0.8, 12, 1.3, 's', 0.01);
  T.sign('plantGate', PLANT_X, P.y0 + 0.37, gh + 0.8, 12, 1.3, 'n', 0.01);
  T.box('sfTrim', gx1 + 1.5, P.y0 + 1, 0, gx1 + 5.0, P.y0 + 4, 2.8, { kind: 'wall', name: 'guard hut' });
  T.deco('sfDoorNavy', gx1 + 1.3, P.y0 + 0.8, 2.8, gx1 + 5.2, P.y0 + 4.2, 3.1);
  T.paint('sfGlass', gx1 + 1.45, P.y0 + 1.4, 1.1, gx1 + 1.5, P.y0 + 3.6, 2.2);
  T.post('sfHazard', gx1 + 1.2, P.y0 + 1.8, 0, 1.1, 0.15, { kind: 'pole', name: 'barrier post' });
  T.cyl('sfHazard', [gx1 + 1.2, P.y0 + 1.8, 1.1], [gx1 + 1.5, P.y0 + 1.8, 6.5], 0.07, 6, null, false);
  /* The sign by the gate, for the people inside it. */
  T.box('sfTrim', gx0 - 7.5, P.y0 + 1.5, 0, gx0 - 3.5, P.y0 + 1.7, 3.6, { solid: false });
  T.box('sfTrim', gx0 - 7.7, P.y0 + 1.3, 1.6, gx0 - 3.3, P.y0 + 1.5, 3.8, { kind: 'wall', name: 'safety board' });
  T.sign('mishap', gx0 - 5.5, P.y0 + 1.29, 2.7, 4.0, 2.0, 's', 0.005);
  /* The way in, paved to the hall. */
  T.paint('sfAsphalt', PLANT_X - HALF, PLANT_END, 0, PLANT_X + HALF, HALL.y0, 0.025);

  /* The turbine hall: four walls and a roof, open at both ends. */
  const H = HALL;
  const d0 = H.doorY - H.doorW / 2;
  const d1 = H.doorY + H.doorW / 2;
  T.box('sfPlant', H.x0, H.y0, 0, H.x1, H.y0 + H.t, H.h, { kind: 'wall', name: 'hall wall' });
  T.box('sfPlant', H.x0, H.y1 - H.t, 0, H.x1, H.y1, H.h, { kind: 'wall', name: 'hall wall' });
  T.box('sfRoofSlate', H.x0 - 0.3, H.y0 - 0.3, H.h, H.x1 + 0.3, H.y1 + 0.3, H.h + 0.8, { kind: 'wall', name: 'hall roof' });
  for (const x of [H.x0, H.x1 - H.t]) {
    T.box('sfPlant', x, H.y0 + H.t, 0, x + H.t, d0, H.h, { kind: 'wall', name: 'hall end' });
    T.box('sfPlant', x, d1, 0, x + H.t, H.y1 - H.t, H.h, { kind: 'wall', name: 'hall end' });
    T.box('sfPlant', x, d0, H.doorH, x + H.t, d1, H.h, { kind: 'wall', name: 'hall end' });
    /* The roller door, rolled up: its drum over the opening. */
    const out = x === H.x0 ? -0.5 : H.t + 0.5;
    T.cyl('sfHazard', [x + out, d0 - 0.2, H.doorH + 0.5], [x + out, d1 + 0.2, H.doorH + 0.5], 0.5, 10, null, false);
    for (let k = 0; k < 6; k += 1) {
      const y = d0 + (k + 0.5) * (H.doorW / 6);
      T.paint(k % 2 ? 'sfIron' : 'sfHazard', x - 0.06, y - H.doorW / 12, H.doorH + 1.1, x + H.t + 0.06, y + H.doorW / 12, H.doorH + 1.5, true);
    }
  }
  /* The ribs and the high windows down both sides, and the name. */
  for (let x = H.x0 + 3; x < H.x1 - 1; x += 4) {
    T.deco('sfSteel', x - 0.2, H.y0 - 0.25, 0, x + 0.2, H.y0, H.h, true);
    T.deco('sfSteel', x - 0.2, H.y1, 0, x + 0.2, H.y1 + 0.25, H.h, true);
  }
  for (let x = H.x0 + 5; x < H.x1 - 3; x += 4) {
    T.paint('sfGlassDark', x - 1.4, H.y0 - 0.05, 10.5, x + 1.4, H.y0, 13.5);
    T.paint('sfGlassDark', x - 1.4, H.y1, 10.5, x + 1.4, H.y1 + 0.05, 13.5);
  }
  T.sign('plantName', (H.x0 + H.x1) / 2, H.y0 - 0.3, 7.0, 30, 3.0, 's', 0.0);
  /* The control room's long window and its door. */
  T.paint('sfGlass', H.x0 + 4, H.y0 - 0.05, 2.0, H.x0 + 22, H.y0, 4.0);
  T.paint('sfDoorNavy', H.x0 + 24, H.y0 - 0.05, 0, H.x0 + 26, H.y0, 2.6);
  T.sign('control', H.x0 + 13, H.y0 - 0.06, 4.6, 6, 0.6, 's', 0.0);
  /* Inside: the floor, two turbines on their plinths either side of the
   * line from door to door, a crane beam across overhead, the lamps. */
  T.paint('sfConcrete', H.x0 + H.t, H.y0 + H.t, 0.02, H.x1 - H.t, H.y1 - H.t, 0.04);
  T.paint('sfHazard', H.x0 + H.t, d0 - 0.3, 0.04, H.x1 - H.t, d0, 0.05, true);
  T.paint('sfHazard', H.x0 + H.t, d1, 0.04, H.x1 - H.t, d1 + 0.3, 0.05, true);
  for (const y of [H.y0 + 7.5, H.y1 - 7.5]) {
    T.box('sfStone', H.x0 + 8, y - 2.8, 0, H.x1 - 8, y + 2.8, 1.0, { kind: 'wall', name: 'turbine plinth' });
    T.cap('sfDoorGreen', [H.x0 + 10, y, 3.2], [H.x1 - 18, y, 3.2], 2.2, { kind: 'wall', name: 'turbine', look: 'cyl', seg: 16 });
    T.cyl('sfDoorGreen', [H.x1 - 18, y, 3.2], [H.x1 - 10, y, 3.2], 2.2, 16, 1.4);
    T.hidden(H.x1 - 18, y - 1.4, 1.8, H.x1 - 10.5, y + 1.4, 4.6, 'wall', 'turbine');
    T.box('sfSteel', H.x1 - 10, y - 1.1, 1.0, H.x1 - 8.5, y + 1.1, 4.4, { kind: 'wall', name: 'generator' });
    for (let x = H.x0 + 12; x < H.x1 - 18; x += 6) {
      T.deco('sfHazard', x, y - 2.3, 1.0, x + 0.3, y + 2.3, 5.5, true);
    }
  }
  T.box('sfHazard', H.x0 + 30, H.y0 + H.t, 12, H.x0 + 31.2, H.y1 - H.t, 12.9, { kind: 'wall', name: 'crane beam' });
  for (let x = H.x0 + 8; x < H.x1 - 4; x += 12) {
    T.paint('sfLamp', x - 1.5, H.doorY - 0.3, H.h - 0.12, x + 1.5, H.doorY + 0.3, H.h - 0.02);
  }

  /* The reactor's dome, east of the hall. */
  const rx = 388;
  const ry = 182;
  T.post('sfTower', rx, ry, 0, 8, 10, { draw: false, kind: 'wall', name: 'reactor' });
  T.cyl('sfTower', [rx, ry, 0], [rx, ry, 8], 10, 32, null, false);
  T.ball('sfTower', rx, ry, 8, 10);
  T.torus('sfHazard', rx, ry, 8, 10.02, 0.25, 0, 0, 6, 40);
  T.sign('trefoil', rx, ry - 10.02, 4.8, 3.2, 3.2, 's', 0.02);

  /* The stack, red and white, from the town's own chimney. */
  T.asset({ type: 'chimney', dims: { height: 52, radius: 2.4 } }, 1, 310, 268, 0, 0);

  /* The tanks and the barrels between the hall and the towers. */
  for (const [x, y, r, h] of [[316, 210, 4, 10], [327, 210, 4, 10], [338, 206, 2.6, 7]]) {
    T.post('sfPlant', x, y, 0, h, r, { draw: false, kind: 'wall', name: 'tank' });
    T.cyl('sfPlant', [x, y, 0], [x, y, h], r, 24, null, false);
    T.ball('sfPlant', x, y, h, r * 0.98);
    T.cyl('sfHazard', [x, y, h * 0.55], [x, y, h * 0.62], r + 0.03, 24, null, true);
  }
  /* A pipe rack north from the hall to the towers, at a height a quad
   * can fly under or over. */
  for (let y = H.y1 + 2; y < 230; y += 6) {
    for (const x of [349, 355]) {
      T.post('sfSteel', x, y, 0, 5.4, 0.18, { kind: 'pole', name: 'rack post' });
    }
    T.box('sfSteel', 348.6, y - 0.2, 5.2, 355.4, y + 0.2, 5.5, { kind: 'wall', name: 'rack beam' });
  }
  for (const [x, r] of [[350.2, 0.45], [352, 0.6], [353.8, 0.35]]) {
    T.cap('sfSteel', [x, H.y1 + 0.5, 5.5 + r], [x, 228, 5.5 + r], r, { kind: 'wall', name: 'pipe', look: 'cyl', seg: 10 });
  }
  /* The barrels, a few of them leaking something that glows. */
  const br = rng(404);
  for (let k = 0; k < 14; k += 1) {
    const x = 362 + (k % 5) * 1.5 + br.range(-0.2, 0.2);
    const y = 203 + Math.floor(k / 5) * 1.5 + br.range(-0.2, 0.2);
    T.post('sfHazard', x, y, 0, 1.25, 0.42, { kind: 'wall', name: 'barrel', seg: 12 });
    T.disc(k % 3 ? 'sfIron' : 'sfGlow', x, y, 0.36, 1.25, 1.28, 12, true);
  }
  T.disc('sfGlow', 368, 212, 2.6, 0.02, 0.04, 18);
  T.disc('sfGlow', 371, 213.5, 1.3, 0.02, 0.045, 14);
  T.sign('hazardBarrels', 362, 201.2, 1.6, 2.0, 1.0, 's', 0.02);

  for (const t of TOWERS) {
    coolingTower(T, t);
  }
}

/* ------------------------------------------------------------------ */
/* The gorge                                                           */
/* ------------------------------------------------------------------ */

/* The cut, its floor DEPTH under the grass, its walls WALL thick outside
 * the cut. The square's railing is at py 170. */
export const GORGE = { x0: 158, x1: 174, y0: 177, y1: 264, depth: 14, wall: 3 };

/* The ground in the plan, metres: the floor inside the cut, the grass
 * outside it. */
export function gorgeFloorAt(px, py) {
  const G = GORGE;
  return px > G.x0 && px < G.x1 && py > G.y0 && py < G.y1 ? -G.depth : 0;
}

/* The plank bridge across, py. */
export const GORGE_BRIDGE = { py: 226, w: 2.2, h: 0.35 };

function gorge(T) {
  const G = GORGE;
  const lo = -G.depth;
  const top = 0.02;
  /* The walls: west, east, and the two ends, from the floor to the grass,
   * so the cut is closed all round below the grass. */
  T.box('sfRock', G.x0 - G.wall, G.y0 - G.wall, lo - 1, G.x0, G.y1 + G.wall, top, { kind: 'wall', name: 'gorge wall' });
  T.box('sfRock', G.x1, G.y0 - G.wall, lo - 1, G.x1 + G.wall, G.y1 + G.wall, top, { kind: 'wall', name: 'gorge wall' });
  T.box('sfRock', G.x0, G.y0 - G.wall, lo - 1, G.x1, G.y0, top, { kind: 'wall', name: 'gorge wall' });
  T.box('sfRock', G.x0, G.y1, lo - 1, G.x1, G.y1 + G.wall, top, { kind: 'wall', name: 'gorge wall' });
  /* The floor, drawn, and the stream down it. */
  T.paint('sfDirt', G.x0, G.y0, lo - 0.02, G.x1, G.y1, lo + 0.005);
  const r = rng(717);
  let sx = (G.x0 + G.x1) / 2;
  for (let y = G.y0 + 2; y < G.y1 - 1; y += 6) {
    const nx = Math.max(G.x0 + 3, Math.min(G.x1 - 3, sx + r.range(-2.2, 2.2)));
    T.paint('sfWater', Math.min(sx, nx) - 1.1, y, lo + 0.005, Math.max(sx, nx) + 1.1, y + 6.05, lo + 0.03);
    sx = nx;
  }
  /* The strata: darker bands across both faces, and outcrops that stand
   * out of the walls at different depths, solid, never so far that the
   * gorge narrows under nine metres. */
  for (const h of [-3.2, -7.5, -11.4]) {
    T.paint('sfRockDark', G.x0 - 0.04, G.y0, h - 0.6, G.x0, G.y1, h, true);
    T.paint('sfRockDark', G.x1, G.y0, h - 0.6, G.x1 + 0.04, G.y1, h, true);
  }
  /* Nine bays a side, one outcrop in each, so two on the same wall are
   * never closer than 1.6 m along it, nor nearer an end than 2.8 m. */
  const bay = (G.y1 - G.y0 - 4) / 9;
  for (let k = 0; k < 18; k += 1) {
    const west = k % 2 === 0;
    const len = r.range(3, Math.min(8, bay - 1.6));
    const y = G.y0 + 2 + Math.floor(k / 2) * bay + 0.8 + r.range(0, bay - 1.6 - len);
    const out = r.range(0.8, 3.2);
    const h0 = lo + r.range(0, G.depth - 3);
    const h1 = Math.min(-0.6, h0 + r.range(1.5, 4.5));
    const m = r.chance(0.5) ? 'sfRock' : 'sfRockDark';
    if (west) {
      T.box(m, G.x0, y, h0, G.x0 + out, y + len, h1, { kind: 'wall', name: 'outcrop' });
    } else {
      T.box(m, G.x1 - out, y, h0, G.x1, y + len, h1, { kind: 'wall', name: 'outcrop' });
    }
  }
  /* Boulders on the floor, and along the rim. */
  for (let k = 0; k < 10; k += 1) {
    const x = r.range(G.x0 + 2, G.x1 - 2);
    const y = r.range(G.y0 + 6, G.y1 - 6);
    const s = r.range(0.7, 1.6);
    T.cap('sfRock', [x, y, lo + s * 0.6], [x, y, lo + s * 0.6], s, { kind: 'wall', name: 'boulder', look: 'capsule', seg: 7 });
    T.take(x, y, s + 0.3);
  }
  for (let y = G.y0 - 2; y < G.y1 + 2; y += r.range(5, 9)) {
    for (const x of [G.x0 - r.range(1.0, 2.6), G.x1 + r.range(1.0, 2.6)]) {
      const s = r.range(0.6, 1.2);
      T.cap('sfRock', [x, y, s * 0.4], [x, y, s * 0.4], s, { kind: 'wall', name: 'rim rock', look: 'capsule', seg: 7 });
      T.take(x, y, s + 0.3);
    }
  }
  /* The waterfall at the head, and its pool. */
  T.paint('sfWater', 163, G.y1 - 0.12, lo, 169, G.y1, -0.2);
  T.paint('sfTrim', 163.6, G.y1 - 0.16, lo, 164.2, G.y1 - 0.12, -0.6, true);
  T.paint('sfTrim', 167.4, G.y1 - 0.16, lo, 167.8, G.y1 - 0.12, -1.2, true);
  T.disc('sfWater', 166, G.y1 - 3, 3.4, lo, lo + 0.05, 20);
  T.paint('sfWater', 162, G.y1 + 0.2, 0.02, 170, G.y1 + G.wall + 6, 0.05);
  /* The plank bridge across. */
  const B = GORGE_BRIDGE;
  T.box('sfWood', G.x0 - G.wall, B.py - B.w / 2, B.h - 0.2, G.x1 + G.wall, B.py + B.w / 2, B.h, { kind: 'wall', name: 'plank bridge' });
  for (let x = G.x0 - G.wall + 0.15; x < G.x1 + G.wall; x += 0.55) {
    T.paint('sfRoofBrown', x, B.py - B.w / 2 - 0.01, B.h - 0.005, x + 0.06, B.py + B.w / 2 + 0.01, B.h + 0.004, true);
  }
  for (const y of [B.py - B.w / 2, B.py + B.w / 2]) {
    for (const x of [G.x0 - G.wall + 0.3, G.x0 - 0.4, G.x1 + 0.4, G.x1 + G.wall - 0.3]) {
      T.post('sfWood', x, y, B.h, B.h + 1.2, 0.08, { kind: 'pole', name: 'bridge post' });
    }
    T.cyl('sfDirt', [G.x0 - G.wall + 0.3, y, B.h + 1.15], [G.x1 + G.wall - 0.3, y, B.h + 1.0], 0.035, 4, null, true);
    T.cyl('sfDirt', [G.x0 - G.wall + 0.3, y, B.h + 0.6], [G.x1 + G.wall - 0.3, y, B.h + 0.5], 0.03, 4, null, true);
  }
  /* The ramp somebody built at the lip, and the signs. */
  T.prism('sfWood', 'x', [[171.2, 0.0], [G.y0 - G.wall - 0.1, 1.7], [G.y0 - G.wall - 0.1, 1.5], [171.6, 0.0]], 163, 169);
  for (let k = 0; k < 5; k += 1) {
    const f = (k + 1) / 5;
    const y0 = 171.2 + (G.y0 - G.wall - 0.1 - 171.2) * (k / 5);
    T.hidden(163, y0 + 0.4, 0, 169, G.y0 - G.wall - 0.1, 1.5 * f, 'wall', 'ramp');
  }
  for (const x of [163.3, 168.7]) {
    T.post('sfWood', x, G.y0 - G.wall - 0.35, 0, 1.6, 0.09, { kind: 'pole', name: 'ramp leg' });
  }
  T.post('sfWood', 156, 172, 0, 2.4, 0.06, { kind: 'pole', name: 'sign post' });
  T.box('sfTrim', 154.6, 171.94, 1.5, 157.4, 172.06, 2.6, { kind: 'wall', name: 'gorge sign' });
  T.sign('gorgeSign', 156, 171.93, 2.05, 2.7, 1.05, 's', 0.002);
  T.post('sfWood', 176.5, 172, 0, 2.2, 0.06, { kind: 'pole', name: 'sign post' });
  T.box('sfTrim', 175.4, 171.94, 1.4, 177.6, 172.06, 2.3, { kind: 'wall', name: 'gorge sign' });
  T.sign('noJumping', 176.5, 171.93, 1.85, 2.1, 0.85, 's', 0.002);
}

/* ------------------------------------------------------------------ */
/* The hill, the house on it and the letters                           */
/* ------------------------------------------------------------------ */

/* The tiers, each a level lawn h up, its bank RUN wide outside it. The
 * top tier carries the house; the drive climbs the banks on Mill Road's
 * line. */
const RUN = 6;
export const TIERS = [
  { h: 4, x0: 204, x1: 292, y0: 192, y1: D },
  { h: 8, x0: 214, x1: 284, y0: 206, y1: D },
  { h: 12, x0: 224, x1: 276, y0: 220, y1: D },
];
export const MANSION = { x0: 232, x1: 268, y0: 234, y1: 258, h0: 12, floors: 3, fh: 3.6 };
/* Ten letters from x0 to the tier's east end, a pitch apart: 2.75 m of
 * letter and 1.6 m between. */
export const LETTERS = { x0: 239.5, py: 209.5, h0: 8, cw: 0.55, ch: 0.7, t: 0.5 };
export const letterPitch = () => (TIERS[1].x1 - LETTERS.x0 - 1) / WORD.length;
export const MANSION_GATE = { px: MILL_X, py: MILL_END + 2.5, w: 8, h: 6.5 };

function hill(T) {
  let prev = 0;
  for (const t of TIERS) {
    const o = { x0: t.x0 - RUN, y0: t.y0 - RUN, x1: t.x1 + RUN, y1: D };
    const i = { x0: t.x0, y0: t.y0, x1: t.x1, y1: D };
    T.frustum('sfLawn', o, prev, i, t.h);
    T.frustumSolid(o, prev, i, t.h, 8, 'hill');
    T.hidden(t.x0, t.y0, prev, t.x1, D, t.h, 'wall', 'hill');
    prev = t.h;
  }
  /* The drive up Mill Road's line: a strip on each bank and each lawn. */
  const x0 = MILL_X - 3;
  const x1 = MILL_X + 3;
  let h = 0;
  let y = MILL_END;
  for (const t of TIERS) {
    const b = t.y0 - RUN;
    T.prism('sfAsphalt', 'x', [[y, h + 0.03], [b, h + 0.03], [t.y0, t.h + 0.03], [t.y0, t.h], [b, h], [y, h]], x0, x1);
    h = t.h;
    y = t.y0;
  }
  T.paint('sfAsphalt', x0, y, h, x1, MANSION.y0 - 4, h + 0.03);
  T.paint('sfAsphalt', MANSION.x0 - 4, MANSION.y0 - 8, h, MANSION.x1 + 4, MANSION.y0 - 4, h + 0.03);
  /* Hedges and trees up the banks, either side of the drive. */
  for (const t of TIERS) {
    for (const s of [-1, 1]) {
      for (let k = 0; k < 3; k += 1) {
        const x = MILL_X + s * (9 + k * 9);
        /* Not in front of the letters, which stand on the second tier,
         * nor behind them, where a canopy muddies the word. */
        if (x > LETTERS.x0 - 3) {
          continue;
        }
        T.asset({ type: 'tree', style: 'broad', dims: { size: 0.8 + 0.1 * k, variant: 7 + k * 13 + (s > 0 ? 5 : 0) } }, 1, x, t.y0 + 2.5, t.h, 0);
      }
    }
  }
  /* The gate at the foot, two stone pillars and an arch of iron, open. */
  const G = MANSION_GATE;
  for (const s of [-1, 1]) {
    const x = G.px + s * (G.w / 2 + 0.6);
    T.box('sfStone', x - 0.6, G.py - 0.6, 0, x + 0.6, G.py + 0.6, G.h, { kind: 'wall', name: 'gate pillar' });
    T.deco('sfTrim', x - 0.75, G.py - 0.75, G.h, x + 0.75, G.py + 0.75, G.h + 0.25);
    T.ball('sfLamp', x, G.py, G.h + 0.75, 0.45);
    /* The searchlight on the pillar, aimed down the road. */
    T.cyl('sfIron', [x, G.py - 0.2, G.h + 1.25], [x, G.py - 0.9, G.h + 1.55], 0.32, 10, 0.42, true);
    T.disc('sfLamp', x, G.py - 0.92, 0.36, G.h + 1.5, G.h + 1.6, 10, true);
    /* The leaf of the gate, swung in against the drive's edge. */
    const lx = G.px + s * (G.w / 2 - 0.1);
    T.box('sfIron', lx - 0.05, G.py + 0.6, 0.1, lx + 0.05, G.py + 0.6 + G.w / 2, 0.2, { kind: 'pole', name: 'gate leaf' });
    T.box('sfIron', lx - 0.05, G.py + 0.6, 2.3, lx + 0.05, G.py + 0.6 + G.w / 2, 2.4, { kind: 'pole', name: 'gate leaf' });
    for (let y = G.py + 0.8; y < G.py + 0.6 + G.w / 2; y += 0.3) {
      T.cyl('sfIron', [lx, y, 0.1], [lx, y, 2.6], 0.03, 4, null, true);
    }
    T.hidden(lx - 0.05, G.py + 0.6, 0.2, lx + 0.05, G.py + 0.6 + G.w / 2, 2.3, 'wall', 'gate leaf');
  }
  /* The arch: a scroll of iron over the opening and the plate in it. */
  T.box('sfIron', G.px - G.w / 2, G.py - 0.08, G.h - 0.25, G.px + G.w / 2, G.py + 0.08, G.h, { kind: 'pole', name: 'gate arch' });
  /* Scrolls of iron over the beam, either side of the plate. */
  for (const s of [-1, 1]) {
    T.cyl('sfIron', [G.px + s * (G.w / 2), G.py, G.h], [G.px + s * 2.2, G.py, G.h + 0.9], 0.05, 4, null, true);
    T.cyl('sfIron', [G.px + s * 2.2, G.py, G.h + 0.9], [G.px + s * 1.8, G.py, G.h + 1.1], 0.05, 4, null, true);
  }
  T.sign('mansionGate', G.px, G.py - 0.09, G.h + 0.65, 3.4, 0.9, 's', 0.0);
  T.box('sfIron', G.px - 1.8, G.py - 0.08, G.h, G.px + 1.8, G.py + 0.08, G.h + 1.15, { kind: 'wall', name: 'gate plate' });
  /* The board is screwed to the wall's face, under its coping: stood off
   * the wall on a post it made a slot too narrow to fly. */
  T.box('sfTrim', G.px + G.w / 2 + 2.2, G.py - 0.42, 0.3, G.px + G.w / 2 + 4.2, G.py - 0.3, 1.5, { kind: 'wall', name: 'keep out' });
  T.sign('keepOut', G.px + G.w / 2 + 3.2, G.py - 0.43, 0.9, 1.9, 1.1, 's', 0.002);
  /* A wall along the hill's foot either side of the gate. */
  for (const [a, b] of [[TIERS[0].x0 - RUN, G.px - G.w / 2 - 1.2], [G.px + G.w / 2 + 1.2, TIERS[0].x1 + RUN]]) {
    T.box('sfStone', a, G.py - 0.3, 0, b, G.py + 0.3, 1.6, { kind: 'wall', name: 'estate wall' });
    T.deco('sfTrim', a, G.py - 0.4, 1.6, b, G.py + 0.4, 1.75);
  }
  mansion(T);
  letters(T);
}

function mansion(T) {
  const M = MANSION;
  const top = M.h0 + M.floors * M.fh;
  const cx = (M.x0 + M.x1) / 2;
  /* The house: a stone body, a cornice, a slate hipped roof. */
  T.box('sfStone', M.x0, M.y0, M.h0, M.x1, M.y1, top, { kind: 'wall', name: 'mansion' });
  T.deco('sfTrim', M.x0 - 0.3, M.y0 - 0.3, top - 0.4, M.x1 + 0.3, M.y1 + 0.3, top + 0.1);
  T.deco('sfTrim', M.x0 - 0.15, M.y0 - 0.15, M.h0, M.x1 + 0.15, M.y1 + 0.15, M.h0 + 0.7);
  const o = { x0: M.x0 - 0.5, y0: M.y0 - 0.5, x1: M.x1 + 0.5, y1: M.y1 + 0.5 };
  const i = { x0: M.x0 + 8, y0: M.y0 + 8, x1: M.x1 - 8, y1: M.y1 - 8 };
  T.frustum('sfRoofSlate', o, top + 0.1, i, top + 6.5);
  T.frustumSolid({ x0: M.x0, y0: M.y0, x1: M.x1, y1: M.y1 }, top, { x0: M.x0 + 8, y0: M.y0 + 8, x1: M.x1 - 8, y1: M.y1 - 8 }, top + 6.2, 6, 'mansion roof');
  /* The chimneys, tall and many. */
  for (const [x, y] of [[M.x0 + 5, M.y0 + 5], [M.x1 - 5, M.y0 + 5], [M.x0 + 5, M.y1 - 5], [M.x1 - 5, M.y1 - 5], [cx, M.y1 - 9]]) {
    T.box('sfBrick', x - 0.8, y - 0.6, top, x + 0.8, y + 0.6, top + 7.2, { kind: 'wall', name: 'chimney' });
    T.deco('sfStone', x - 0.95, y - 0.75, top + 6.9, x + 0.95, y + 0.75, top + 7.3);
  }
  /* Windows on every face, tall, with dark glass. */
  for (let f = 0; f < M.floors; f += 1) {
    const h = M.h0 + f * M.fh + 1.0;
    for (let x = M.x0 + 2.5; x < M.x1 - 1.5; x += 3) {
      if (f === 0 && Math.abs(x - cx) < 4) {
        continue;
      }
      T.paint('sfGlassDark', x - 0.6, M.y0 - 0.05, h, x + 0.6, M.y0, h + 2.1);
      T.paint('sfTrim', x - 0.75, M.y0 - 0.1, h + 2.1, x + 0.75, M.y0, h + 2.35, true);
      T.paint('sfGlassDark', x - 0.6, M.y1, h, x + 0.6, M.y1 + 0.05, h + 2.1);
    }
    for (let y = M.y0 + 2.5; y < M.y1 - 1.5; y += 3) {
      T.paint('sfGlassDark', M.x0 - 0.05, y - 0.6, h, M.x0, y + 0.6, h + 2.1);
      T.paint('sfGlassDark', M.x1, y - 0.6, h, M.x1 + 0.05, y + 0.6, h + 2.1);
    }
  }
  /* The portico: steps, four columns, a pediment, the door. */
  const py = M.y0 - 4;
  T.box('sfStone', cx - 6, py - 1.2, M.h0, cx + 6, M.y0, M.h0 + 0.6, { kind: 'wall', name: 'steps' });
  for (const x of [cx - 4.5, cx - 1.5, cx + 1.5, cx + 4.5]) {
    T.post('sfTrim', x, py + 0.2, M.h0 + 0.6, M.h0 + 7.2, 0.4, { kind: 'wall', name: 'column', seg: 12 });
  }
  T.box('sfTrim', cx - 6, py - 0.5, M.h0 + 7.2, cx + 6, M.y0, M.h0 + 8.2, { kind: 'wall', name: 'entablature' });
  T.prism('sfStone', 'y', [[cx - 6.2, M.h0 + 8.2], [cx, M.h0 + 10.6], [cx + 6.2, M.h0 + 8.2]], py - 0.6, M.y0);
  T.hidden(cx - 4, py - 0.5, M.h0 + 8.2, cx + 4, M.y0, M.h0 + 9.2, 'wall', 'pediment');
  T.paint('sfDoorRed', cx - 1.2, M.y0 - 0.06, M.h0 + 0.6, cx + 1.2, M.y0, M.h0 + 4.2);
  T.paint('sfYellow', cx - 0.08, M.y0 - 0.08, M.h0 + 2.2, cx + 0.08, M.y0 - 0.06, M.h0 + 2.5, true);
  /* A round tower on the east corner with a cone roof, and a weather
   * vane. */
  const tx = M.x1 - 1;
  const ty = M.y0 + 1;
  T.post('sfStone', tx, ty, M.h0, top + 4, 3.0, { draw: false, kind: 'wall', name: 'tower' });
  T.cyl('sfStone', [tx, ty, M.h0], [tx, ty, top + 4], 3.0, 20, null, false);
  T.cone('sfRoofSlate', tx, ty, top + 4, 3.5, 6, 20, false);
  T.post('sfRoofSlate', tx, ty, top + 4, top + 6, 2.2, { draw: false, kind: 'wall', name: 'tower roof' });
  T.post('sfIron', tx, ty, top + 10, top + 11.5, 0.05, { kind: 'pole', name: 'vane' });
  T.paint('sfIron', tx - 0.6, ty - 0.03, top + 11, tx + 0.6, ty + 0.03, top + 11.25, true);
  for (let k = 0; k < 6; k += 1) {
    const [ax, ay] = around(3.02, (k / 6) * TAU + 0.3);
    T.paint('sfGlassDark', tx + ax - 0.4, ty + ay - 0.4, top + 1, tx + ax + 0.4, ty + ay + 0.4, top + 2.8, true);
  }
  /* The lawn's fountain, a car out front, and topiary. */
  T.disc('sfStone', cx, M.y0 - 13, 3.0, M.h0, M.h0 + 0.6, 24);
  T.disc('sfWater', cx, M.y0 - 13, 2.6, M.h0, M.h0 + 0.62, 24);
  T.hidden(cx - 2.1, M.y0 - 15.1, M.h0, cx + 2.1, M.y0 - 10.9, M.h0 + 0.6, 'wall', 'fountain');
  T.post('sfStone', cx, M.y0 - 13, M.h0 + 0.6, M.h0 + 2.2, 0.22, { kind: 'pole', name: 'fountain' });
  T.ball('sfWater', cx, M.y0 - 13, M.h0 + 2.4, 0.45, true);
  T.asset({ type: 'car', style: 'sedan', dims: { variant: 3 } }, 1, cx + 9, M.y0 - 6, M.h0, 0);
  for (const x of [M.x0 + 1.5, M.x1 - 6]) {
    for (let k = 0; k < 3; k += 1) {
      const y = M.y0 - 3 - k * 6;
      T.cone('sfHedge', x, y, M.h0, 0.9, 2.4, 8, false);
      T.post('sfHedge', x, y, M.h0, M.h0 + 0.6, 0.6, { draw: false, kind: 'canopy', name: 'topiary' });
    }
  }
}

/*
 * THE TOWN'S NAME on the second tier, facing the town, nine letters each
 * a five by seven of blocks. Each row's run of blocks is one box, drawn
 * and solid. A letter is three metres across and five up, and between
 * two is over a metre and a half, so between the letters is a line and
 * not a slot.
 */
const FONT = {
  S: ['.###.', '#...#', '#....', '.###.', '....#', '#...#', '.###.'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  N: ['#...#', '##..#', '##..#', '#.#.#', '#..##', '#..##', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
};
export const WORD = 'SUNNYFIELD';

function letters(T) {
  const L = LETTERS;
  const lw = 5 * L.cw;
  const pitch = letterPitch();
  [...WORD].forEach((ch, n) => {
    const rows = FONT[ch];
    const x0 = L.x0 + n * pitch;
    rows.forEach((row, k) => {
      const h1 = L.h0 + 0.35 + (7 - k) * L.ch;
      const h0 = h1 - L.ch;
      let c = 0;
      while (c < 5) {
        if (row[c] !== '#') {
          c += 1;
          continue;
        }
        let e = c;
        while (e < 5 && row[e] === '#') {
          e += 1;
        }
        T.box('sfTrim', x0 + c * L.cw, L.py, h0, x0 + e * L.cw, L.py + L.t, h1, { kind: 'wall', name: `letter ${ch}` });
        c = e;
      }
    });
    /* The struts behind, down to the lawn. */
    for (const x of [x0 + 0.4, x0 + lw - 0.4]) {
      T.cap('sfWood', [x, L.py + L.t + 0.1, L.h0 + 0.35 + 7 * L.ch - 0.6], [x, L.py + L.t + 1.6, L.h0], 0.06, { kind: 'pole', name: 'letter strut' });
    }
  });
}

/* ------------------------------------------------------------------ */
/* The dump                                                            */
/* ------------------------------------------------------------------ */

export const DUMP = { x0: 0, x1: 140, y0: 212, y1: D, fenceH: 3.2 };
export const TYRES = { px: 100, py: 248, r: 9, h: 6.5 };

function dump(T) {
  const P = DUMP;
  T.paint('sfDirt', P.x0, P.y0, 0, P.x1, P.y1, 0.02);
  /* The paved end of Oak Street into the gate. */
  T.paint('sfAsphalt', OAK_X - HALF, OAK_END, 0, OAK_X + HALF, P.y0 + 6, 0.025);
  /* Its fence: sheets of tin, odd colours, along the front and the east
   * side, the gate on Oak Street. */
  const r = rng(808);
  const tins = ['sfRust', 'sfSteel', 'sfRust', 'sfRoofTeal', 'sfIron'];
  const run = (a, b, along) => {
    for (let s = a; s < b - 0.01; s += 2.4) {
      const e = Math.min(b, s + 2.4);
      const h = P.fenceH + r.range(-0.3, 0.3);
      const m = r.pick(tins);
      if (along === 'x') {
        T.box(m, s, P.y0 - 0.12, 0, e, P.y0, h, { kind: 'wall', name: 'dump fence' });
      } else {
        T.box(m, P.x1, s, 0, P.x1 + 0.12, e, h, { kind: 'wall', name: 'dump fence' });
      }
    }
  };
  const gx0 = OAK_X - HALF - 1;
  const gx1 = OAK_X + HALF + 1;
  run(P.x0, gx0, 'x');
  run(gx1, P.x1, 'x');
  run(P.y0, P.y1, 'y');
  /* The gate's two posts and its board, high enough to fly under. */
  for (const x of [gx0 - 0.3, gx1 + 0.3]) {
    T.box('sfWood', x - 0.3, P.y0 - 0.3, 0, x + 0.3, P.y0 + 0.3, 6.2, { kind: 'wall', name: 'gate post' });
  }
  T.box('sfWood', gx0 - 0.6, P.y0 - 0.2, 4.8, gx1 + 0.6, P.y0 + 0.2, 6.0, { kind: 'wall', name: 'dump board' });
  T.sign('dump', OAK_X, P.y0 - 0.21, 5.4, 9, 1.0, 's', 0.002);
  T.sign('dump', OAK_X, P.y0 + 0.21, 5.4, 9, 1.0, 'n', 0.002);
  /* The weighbridge hut and its scales, inside the gate. */
  T.box('sfButter', 60, 216, 0, 66, 221, 2.8, { kind: 'wall', name: 'hut' });
  T.deco('sfRust', 59.7, 215.7, 2.8, 66.3, 221.3, 3.1);
  T.paint('sfGlass', 59.95, 217, 1.1, 60, 220, 2.1);
  T.paint('sfSteel', OAK_X - 3, 220, 0.02, OAK_X + 3, 230, 0.06);

  /* The mounds, each a heap of earth with junk on it, the junk spaced so
   * no two pieces make a slot. */
  const grounds = MOUNDS.map((m) => {
    T.cone('sfDirt', m.px, m.py, 0, m.r, m.h, 9, false);
    const ground = moundSolid(T, m);
    const n = Math.round(m.r * 2.4);
    const here = [];
    for (let k = 0; k < n; k += 1) {
      const a = r.range(0, TAU);
      const d = r.range(0.2, 0.9) * m.r;
      const [dx, dy] = around(d, a);
      const x = m.px + dx;
      const y = m.py + dy;
      if (here.some(([u, v]) => (u - x) * (u - x) + (v - y) * (v - y) < JUNK_APART * JUNK_APART)) {
        continue;
      }
      here.push([x, y]);
      junkPiece(T, r, x, y, 0, ground);
    }
    return ground;
  });
  /* An old sofa on top of the first, and a bathtub on the second. */
  const m0 = MOUNDS[0];
  const s0 = footing(T, grounds[0], m0.px - 1.0, m0.py - 0.45, m0.px + 1.0, m0.py + 0.45);
  T.box('sfLilac', m0.px - 1.0, m0.py - 0.45, s0, m0.px + 1.0, m0.py + 0.45, s0 + 0.45, { kind: 'wall', name: 'sofa' });
  T.box('sfLilac', m0.px - 1.0, m0.py + 0.2, s0 + 0.45, m0.px + 1.0, m0.py + 0.45, s0 + 0.95, { kind: 'wall', name: 'sofa' });
  T.box('sfLilac', m0.px - 1.0, m0.py - 0.45, s0 + 0.45, m0.px - 0.8, m0.py + 0.45, s0 + 0.7, { kind: 'wall', name: 'sofa' });
  T.box('sfLilac', m0.px + 0.8, m0.py - 0.45, s0 + 0.45, m0.px + 1.0, m0.py + 0.45, s0 + 0.7, { kind: 'wall', name: 'sofa' });
  const m1 = MOUNDS[1];
  const b1 = footing(T, grounds[1], m1.px + 2, m1.py - 0.4, m1.px + 3.6, m1.py + 0.4);
  T.box('sfTrim', m1.px + 2, m1.py - 0.4, b1, m1.px + 3.6, m1.py + 0.4, b1 + 0.6, { kind: 'wall', name: 'bathtub' });

  /* The car cubes, stacked four high in three stacks, a quad's width
   * apart. */
  const cubes = ['sfRust', 'sfDoorRed', 'sfSky', 'sfButter', 'sfDoorGreen', 'sfSteel', 'sfRoofTeal'];
  for (const [x, y] of [[104, 222], [108.6, 222], [113.2, 222], [104, 228], [113.2, 228]]) {
    const n = r.int(2, 5);
    for (let k = 0; k < n; k += 1) {
      const j = r.range(-0.15, 0.15);
      T.box(r.pick(cubes), x - 1.4 + j, y - 1.0, k * 1.0, x + 1.4 + j, y + 1.0, k * 1.0 + 0.98, { kind: 'wall', name: 'car cube' });
      T.paint('sfGlassDark', x - 1.0 + j, y - 1.01, k * 1.0 + 0.55, x + 0.6 + j, y - 1.0, k * 1.0 + 0.8, true);
    }
  }
  /* A crushed bus on its side, and the tyre pile. */
  T.box('sfYellow', 20, 222, 0, 31, 224.6, 2.4, { kind: 'wall', name: 'old bus' });
  T.paint('sfGlassDark', 21, 221.98, 1.2, 30.5, 222, 1.9);
  tyrePile(T);
  /* Loose junk over the flat between the heaps, and stray tyres. */
  for (let k = 0; k < 40; k += 1) {
    const x = r.range(P.x0 + 4, P.x1 - 4);
    const y = r.range(P.y0 + 12, P.y1 - 3);
    const clear = MOUNDS.every((m) => Math.hypot(x - m.px, y - m.py) > m.r + 1.5)
      && Math.hypot(x - TYRES.px, y - TYRES.py) > TYRES.r + 1.5
      && Math.abs(x - OAK_X) > 6
      && !(x > 98 && y < 232)
      && !(x > 114 && x < 128 && y > 226 && y < 244)
      && !(x > 16 && x < 35 && y < 228)
      && Math.hypot(x - DOZER.px, y - DOZER.py) > 5;
    if (!clear) {
      continue;
    }
    T.take(x, y, 1.6);
    if (k % 3 === 0) {
      T.torus('sfTyre', x, y, 0.2, 0.42, 0.18, 0, 0, 6, 12, null);
      T.hidden(x - 0.4, y - 0.4, 0, x + 0.4, y + 0.4, 0.38, 'wall', 'tyre');
    } else {
      junkPiece(T, r, x, y, 0.02);
    }
  }
  bulldozer(T, DOZER.px, DOZER.py, 0);
  containers(T);
}

/* Where the bulldozer is parked, at the second heap's foot. */
export const DOZER = { px: 58, py: 246 };

/* The heaps, the first three tallest. */
export const MOUNDS = [
  { px: 22, py: 252, r: 15, h: 8 },
  { px: 66, py: 262, r: 12, h: 6.5 },
  { px: 128, py: 268, r: 10, h: 5.5 },
  { px: 44, py: 230, r: 7, h: 3.5 },
  { px: 92, py: 272, r: 7, h: 3.5 },
];

/* Two pieces of junk on one heap stand at least this far apart, centre to
 * centre: the widest two, two mattresses end to end, are then 1.4 m apart,
 * the gap rule. */
const JUNK_APART = 3.4;

/* The cells of a heap's solid, metres a side. */
const MOUND_CELL = 1.5;

/*
 * A heap's solid: a column for every cell of a grid over it, each as tall
 * as the drawn cone is over the whole of its cell, so the solid is never
 * outside the dirt and is under it by a cell's rise at most. Stacked
 * squares inside the slope, as the heaps had first, left pockets three
 * metres deep under the dirt at the foot, and every piece of junk on one
 * stood over a slot. The cone is drawn with nine sides, so a point is
 * inside it only within the nine-gon's inner radius, which is what the
 * height is reckoned from.
 *
 * Returns the heap's ground: given a footprint, where a thing with that
 * footprint rests, on the drawn dirt at the footprint's lowest corner and
 * a hand into it, and the hidden boxes that fill under and round it.
 */
function moundSolid(T, m) {
  const inner = m.r * NINE_GON;
  const n = Math.ceil(m.r / MOUND_CELL);
  for (let i = -n; i < n; i += 1) {
    for (let j = -n; j < n; j += 1) {
      const fx = Math.max(Math.abs(i), Math.abs(i + 1)) * MOUND_CELL;
      const fy = Math.max(Math.abs(j), Math.abs(j + 1)) * MOUND_CELL;
      const top = m.h * (1 - Math.sqrt(fx * fx + fy * fy) / inner) - 0.05;
      if (top < 0.3) {
        continue;
      }
      T.hidden(m.px + i * MOUND_CELL, m.py + j * MOUND_CELL, 0, m.px + (i + 1) * MOUND_CELL, m.py + (j + 1) * MOUND_CELL, top, 'wall', 'mound');
    }
  }
  /* The drawn dirt's lowest over a box: at its corner farthest out. */
  const dirtOver = (x0, y0, x1, y1) => {
    const fx = Math.max(Math.abs(x0 - m.px), Math.abs(x1 - m.px));
    const fy = Math.max(Math.abs(y0 - m.py), Math.abs(y1 - m.py));
    return m.h * (1 - Math.sqrt(fx * fx + fy * fy) / inner);
  };
  const cell = (v) => Math.floor(v / MOUND_CELL);
  return (x0, y0, x1, y1) => {
    const base = Math.max(0.02, dirtOver(x0, y0, x1, y1) - 0.1);
    /* Under the thing, a footing to the ground. Then on each side that
     * faces up the heap, the rest of the cell between the thing and the
     * next column, in steps no wider than STEP and each as high as the
     * dirt over it: the next column up is taller than the thing's foot by
     * more than a quad, and without these the space beside the thing
     * under the dirt was a slot. */
    const fill = [[x0, y0, x1, y1, base]];
    const steps = (a, b, box) => {
      const n = Math.ceil((b - a) / JUNK_STEP - 1e-9);
      for (let k = 0; k < n; k += 1) {
        const [sx0, sy0, sx1, sy1] = box(a + ((b - a) * k) / n, a + ((b - a) * (k + 1)) / n);
        fill.push([sx0, sy0, sx1, sy1, dirtOver(sx0, sy0, sx1, sy1) - 0.05]);
      }
    };
    if (x0 > m.px) {
      steps(m.px + cell(x0 - m.px) * MOUND_CELL, x0, (a, b) => [a, y0, b, y1]);
    } else if (x1 < m.px) {
      steps(x1, m.px + (cell(x1 - m.px) + 1) * MOUND_CELL, (a, b) => [a, y0, b, y1]);
    }
    if (y0 > m.py) {
      steps(m.py + cell(y0 - m.py) * MOUND_CELL, y0, (a, b) => [x0, a, x1, b]);
    } else if (y1 < m.py) {
      steps(y1, m.py + (cell(y1 - m.py) + 1) * MOUND_CELL, (a, b) => [x0, a, x1, b]);
    }
    return { base, fill: fill.filter((f) => f[2] - f[0] > 1e-6 && f[3] - f[1] > 1e-6 && f[4] > 0.05) };
  };
}

/* The widest step of the fill beside a thing on a heap. */
const JUNK_STEP = 0.4;

/* cos(TAU / 18): a nine-gon's inner radius over its outer. */
const NINE_GON = 0.9396926207859084;

/*
 * Where a thing with this footprint rests on a heap, with its hidden
 * footing and the fill beside it, so it never stands over or beside a gap
 * a quad could be pushed into.
 */
function footing(T, ground, x0, y0, x1, y1) {
  const { base, fill } = ground(x0, y0, x1, y1);
  for (const [a0, b0, a1, b1, top] of fill) {
    T.hidden(a0, b0, 0, a1, b1, top, 'wall', 'junk footing');
  }
  return base;
}

/*
 * One piece of junk standing at (px, py): a fridge, a washing machine, a
 * barrel, a television, a mattress, a crate. On the flat it stands on h;
 * on a heap, given the heap's ground, it rests on the heap's solid. Each
 * is solid as the box it is, so the heaps are things to weave and not
 * haze.
 */
function junkPiece(T, r, px, py, h, ground = null) {
  const kind = r.int(0, 5);
  const c = r.pick(['sfTrim', 'sfSky', 'sfButter', 'sfMint', 'sfRust', 'sfRoofTeal', 'sfDoorRed', 'sfSteel']);
  const crate = kind === 5 ? [r.range(0.6, 1.6), r.range(0.5, 1.1), r.range(0.5, 1.4)] : null;
  const half = [[0.4, 0.35], [0.35, 0.35], [0.32, 0.32], [0.4, 0.3], [1.0, 0.7], crate && [crate[0] / 2, crate[1] / 2]][kind];
  if (ground) {
    h = footing(T, ground, px - half[0], py - half[1], px + half[0], py + half[1]);
  }
  if (kind === 0) {
    /* A fridge, its door the street side, its handle. */
    T.box(r.pick(['sfTrim', 'sfMint', 'sfButter']), px - 0.4, py - 0.35, h, px + 0.4, py + 0.35, h + 1.8, { kind: 'wall', name: 'fridge' });
    T.paint('sfIron', px - 0.41, py - 0.36, h + 1.1, px + 0.41, py - 0.35, h + 1.14, true);
    T.paint('sfSteel', px + 0.25, py - 0.4, h + 1.3, px + 0.3, py - 0.35, h + 1.7, true);
  } else if (kind === 1) {
    /* A washing machine and its round door. */
    T.box('sfTrim', px - 0.35, py - 0.35, h, px + 0.35, py + 0.35, h + 0.9, { kind: 'wall', name: 'washer' });
    T.cyl('sfGlassDark', [px, py - 0.35, h + 0.5], [px, py - 0.4, h + 0.5], 0.22, 10, null, true);
  } else if (kind === 2) {
    /* A barrel. */
    T.cyl(r.pick(['sfRust', 'sfDoorNavy', 'sfDoorGreen']), [px, py, h], [px, py, h + 0.9], 0.32, 10);
    T.post('sfRust', px, py, h + 0.3, h + 0.6, 0.3, { draw: false, kind: 'wall', name: 'barrel' });
  } else if (kind === 3) {
    /* A television, its screen, its aerial. */
    T.box(r.pick(['sfWood', 'sfIron', 'sfSteel']), px - 0.4, py - 0.3, h, px + 0.4, py + 0.3, h + 0.6, { kind: 'wall', name: 'tv' });
    T.paint('sfGlassDark', px - 0.3, py - 0.31, h + 0.1, px + 0.2, py - 0.3, h + 0.5, true);
    T.cyl('sfIron', [px, py, h + 0.6], [px - 0.3, py, h + 1.1], 0.012, 3, null, true);
    T.cyl('sfIron', [px, py, h + 0.6], [px + 0.3, py, h + 1.1], 0.012, 3, null, true);
  } else if (kind === 4) {
    /* A mattress, flat. */
    T.box(r.pick(['sfSky', 'sfTrim', 'sfPink']), px - 1.0, py - 0.7, h, px + 1.0, py + 0.7, h + 0.25, { kind: 'wall', name: 'mattress' });
  } else {
    /* A crate or a cabinet. */
    const [w, d, t] = crate;
    T.box(c, px - w / 2, py - d / 2, h, px + w / 2, py + d / 2, h + t, { kind: 'wall', name: 'junk' });
  }
}

/* The dump's bulldozer, parked at a heap's foot: tracks, body, cab, the
 * blade out front, its exhaust. Solid as its boxes. */
function bulldozer(T, px, py, h) {
  for (const s of [-1, 1]) {
    T.box('sfIron', px - 2.2, py + s * 1.15 - 0.4, h, px + 2.2, py + s * 1.15 + 0.4, h + 0.9, { kind: 'wall', name: 'dozer track' });
  }
  T.box('sfYellow', px - 1.8, py - 0.8, h + 0.6, px + 2.2, py + 0.8, h + 2.0, { kind: 'wall', name: 'dozer' });
  T.box('sfYellow', px - 1.8, py - 0.75, h + 2.0, px - 0.2, py + 0.75, h + 3.4, { kind: 'wall', name: 'dozer cab' });
  T.paint('sfGlassDark', px - 0.21, py - 0.6, h + 2.3, px - 0.19, py + 0.6, h + 3.2);
  T.deco('sfIron', px - 1.9, py - 0.85, h + 3.4, px - 0.1, py + 0.85, h + 3.5);
  /* The blade against the tracks' noses, so nothing between them is a
   * slot. */
  T.box('sfSteel', px + 2.2, py - 1.8, h, px + 2.5, py + 1.8, h + 1.3, { kind: 'wall', name: 'dozer blade' });
  for (const s of [-1, 1]) {
    T.cyl('sfYellow', [px + 0.6, py + s * 0.9, h + 1.3], [px + 2.2, py + s * 0.9, h + 0.7], 0.12, 6, null, true);
  }
  T.post('sfIron', px + 0.8, py + 0.5, h + 2.0, h + 3.1, 0.08, { kind: 'pole', name: 'dozer stack' });
}

/*
 * THE CONTAINER ARCH: two stacks of shipping boxes, two high, and a long
 * one laid across their tops, so there is a door four metres wide and five
 * high to fly through, east to west. CONTAINER below is the gap's frame.
 */
export const CONTAINER = { x0: 117, x1: 123.1, yA: 230, yB: 236.6, d: 2.44, hc: 2.6 };

function containers(T) {
  const C = CONTAINER;
  const colours = [['sfRust', 'sfRoofTeal'], ['sfDoorNavy', 'sfRed']];
  [C.yA, C.yB].forEach((y0, i) => {
    for (let k = 0; k < 2; k += 1) {
      const m = colours[i][k];
      T.box(m, C.x0, y0, k * C.hc, C.x1, y0 + C.d, (k + 1) * C.hc - 0.02, { kind: 'wall', name: 'container' });
      /* Its ribs, both long sides, and its doors' bars on the west end. */
      for (let x = C.x0 + 0.5; x < C.x1 - 0.3; x += 0.6) {
        T.deco(m, x - 0.05, y0 - 0.05, k * C.hc + 0.1, x + 0.05, y0, (k + 1) * C.hc - 0.12, true);
        T.deco(m, x - 0.05, y0 + C.d, k * C.hc + 0.1, x + 0.05, y0 + C.d + 0.05, (k + 1) * C.hc - 0.12, true);
      }
      for (const y of [y0 + 0.5, y0 + 0.95, y0 + 1.5, y0 + 1.95]) {
        T.cyl('sfSteel', [C.x0 - 0.04, y, k * C.hc + 0.15], [C.x0 - 0.04, y, (k + 1) * C.hc - 0.15], 0.025, 4, null, true);
      }
    }
  });
  /* The long one across the tops, along y. */
  const xm = (C.x0 + C.x1) / 2;
  const y0 = C.yA - 0.6;
  const y1 = C.yB + C.d + 0.6;
  T.box('sfDoorGreen', xm - C.d / 2, y0, 2 * C.hc, xm + C.d / 2, y1, 3 * C.hc - 0.02, { kind: 'wall', name: 'container' });
  for (let y = y0 + 0.5; y < y1 - 0.3; y += 0.6) {
    T.deco('sfDoorGreen', xm - C.d / 2 - 0.05, y - 0.05, 2 * C.hc + 0.1, xm - C.d / 2, y + 0.05, 3 * C.hc - 0.12, true);
    T.deco('sfDoorGreen', xm + C.d / 2, y - 0.05, 2 * C.hc + 0.1, xm + C.d / 2 + 0.05, y + 0.05, 3 * C.hc - 0.12, true);
  }
}

/* The tyre pile that is always burning: tyres in rings round a cone, its
 * solid boxes inside it, the fire and the smoke drawn by ./fx.js over its
 * top. */
function tyrePile(T) {
  const P = TYRES;
  const rings = 8;
  for (let k = 0; k < rings; k += 1) {
    const f = k / rings;
    const rr = P.r * (1 - f) - 0.6;
    const h = P.h * f + 0.35;
    if (rr < 0.5) {
      continue;
    }
    const n = Math.max(3, Math.floor((TAU * rr) / 1.5));
    for (let i = 0; i < n; i += 1) {
      const a = ((i + (k % 2) * 0.5) / n) * TAU;
      const [dx, dy] = around(rr, a);
      T.torus('sfTyre', P.px + dx, P.py + dy, h, 0.42, 0.18, dx / rr, dy / rr, 6, 12);
    }
  }
  T.cone('sfTyre', P.px, P.py, 0, P.r - 0.3, P.h + 0.4, 12, false);
  for (let k = 0; k < 6; k += 1) {
    const f = (k + 1) / 6;
    const s = (P.r - 0.3) * (1 - f) * 0.7;
    if (s > 0.4) {
      T.hidden(P.px - s, P.py - s, (P.h * k) / 6, P.px + s, P.py + s, (P.h + 0.4) * f, 'wall', 'tyre pile');
    }
  }
  T.disc('sfFire', P.px, P.py, 2.4, P.h - 0.6, P.h + 0.05, 12, false);
}

/* ------------------------------------------------------------------ */
/* The park                                                            */
/* ------------------------------------------------------------------ */

export const PARK = { x0: 303.5, x1: W, y0: 0, y1: 115.5 };
export const POND = { px: 352, py: 58, r: 15 };
export const BANDSTAND = { px: 330, py: 96, r: 5, posts: 8, h: 3.8 };
/* The power line's pylons stand east of the plant's road, the document's
 * (./yard.js), solid as every one of the builder's is. The water tower is
 * the town's own (waterTower below): `h` is the middle of its tank. */
export const WATER_TOWER = { px: 320, py: 24, h: 24, R: 4.6 };
export const PYLONS = [[394, 146], [394, 82], [394, 16]];

/* A ring of hidden capsules lying round (px, py) at h, `r` out: a round
 * deck's or a hand rail's solid, as the builder's water tower has. */
function ringSolid(T, px, py, h, r, n, rad, name) {
  for (let i = 0; i < n; i += 1) {
    const [ax, ay] = around(r, (i / n) * TAU);
    const [bx, by] = around(r, ((i + 1) / n) * TAU);
    T.cap('sfSteel', [px + ax, py + ay, h], [px + bx, py + by, h], rad, { draw: false, kind: 'wall', name });
  }
}

/*
 * The town's water tower: a round tank on four raked legs, two rings of
 * struts and crossed rods under them, a catwalk round the tank's lower
 * half with its rail, a hat on top, a riser and its ladder down the
 * middle, and the town's name round the tank's waist twice. The town's
 * own rather than the builder's, whose band is lettered ひばり台.
 */
function waterTower(T) {
  const { px, py, h, R } = WATER_TOWER;
  /* The legs meet the tank where it is 3.5 m round. */
  const legTop = h - Math.sqrt(R * R - 3.5 * 3.5);
  const foot = 6.2;
  const legs = [];
  for (let i = 0; i < 4; i += 1) {
    const a = TAU / 8 + (i * TAU) / 4;
    const [fx, fy] = around(foot, a);
    const [tx, ty] = around(3.5, a);
    const b = [px + fx, py + fy, 0];
    const t = [px + tx, py + ty, legTop];
    legs.push({ b, t });
    T.cap('sfSteel', b, t, 0.22, { kind: 'wall', name: 'tower leg' });
    T.cyl('sfConcrete', [b[0], b[1], 0], [b[0], b[1], 0.35], 0.5, 8);
  }
  const lerp = (p, q, f) => [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f, p[2] + (q[2] - p[2]) * f];
  const rings = [0, 0.36, 0.7];
  for (let k = 0; k < rings.length - 1; k += 1) {
    for (let i = 0; i < 4; i += 1) {
      const L = legs[i];
      const M = legs[(i + 1) % 4];
      const a0 = lerp(L.b, L.t, rings[k]);
      const a1 = lerp(L.b, L.t, rings[k + 1]);
      const b0 = lerp(M.b, M.t, rings[k]);
      const b1 = lerp(M.b, M.t, rings[k + 1]);
      T.cap('sfSteel', a1, b1, 0.09, { kind: 'pole', name: 'tower strut' });
      T.cap('sfIron', a0, b1, 0.035, { kind: 'pole', name: 'tower rod' });
      T.cap('sfIron', b0, a1, 0.035, { kind: 'pole', name: 'tower rod' });
    }
  }
  /* The tank: a sphere of ten bands, solid as one round capsule. */
  const BANDS = 10;
  let prev = around(R, -TAU / 4);
  for (let k = 1; k <= BANDS; k += 1) {
    const next = around(R, -TAU / 4 + (k / BANDS) * (TAU / 2));
    T.shell('sfSky', px, py, h + prev[1], h + next[1], Math.max(0.02, prev[0]), Math.max(0.02, next[0]), false, null, 36);
    prev = next;
  }
  T.post('sfSky', px, py, h - 0.01, h + 0.01, R - 0.05, { draw: false, kind: 'wall', name: 'tank' });
  /* Its belt, and the name painted on it, facing the town and away. */
  T.cyl('sfTrim', [px, py, h - 0.9], [px, py, h + 0.9], R + 0.02, 36);
  /* North west, toward Main Street, and south east. */
  const face = (3 * TAU) / 8;
  const arc = 0.45 * TAU * (R + 0.06);
  T.roundSign('waterName', px, py, h, R + 0.03, face, arc, 1.7);
  T.roundSign('waterName', px, py, h, R + 0.03, face + TAU / 2, arc, 1.7);
  /* The hat and its finial. */
  T.cone('sfRoofRed', px, py, h + R - 0.35, 1.7, 1.4, 12);
  T.ball('sfYellow', px, py, h + R + 1.25, 0.22);
  T.post('sfRoofRed', px, py, h + R - 0.1, h + R + 0.3, 0.6, { draw: false, kind: 'wall', name: 'tank hat' });
  /* The catwalk round its waist, its rail and posts. */
  T.disc('sfSteel', px, py, 5.1, legTop - 0.12, legTop, 32);
  ringSolid(T, px, py, legTop - 0.1, 3.9, 16, 0.08, 'catwalk');
  ringSolid(T, px, py, legTop - 0.1, 4.6, 16, 0.08, 'catwalk');
  T.torus('sfSteel', px, py, legTop + 1.0, 5.0, 0.045, 0, 0, 4, 40);
  ringSolid(T, px, py, legTop + 1.0, 5.0, 16, 0.05, 'catwalk rail');
  for (let i = 0; i < 16; i += 1) {
    const [x, y] = around(5.0, (i / 16) * TAU);
    T.cyl('sfSteel', [px + x, py + y, legTop], [px + x, py + y, legTop + 1.0], 0.03, 4, null, true);
  }
  /* The riser down the middle, and the ladder beside it. */
  T.post('sfSteel', px, py, 0, h - R + 0.4, 0.55, { kind: 'wall', name: 'riser' });
  for (const d of [-0.25, 0.25]) {
    T.cyl('sfIron', [px + 0.75, py + d, 0.4], [px + 0.75, py + d, legTop], 0.03, 4, null, true);
  }
  for (let y = 0.8; y < legTop; y += 0.45) {
    T.cyl('sfIron', [px + 0.75, py - 0.25, y], [px + 0.75, py + 0.25, y], 0.02, 3, null, true);
  }
}

/*
 * THE SKATE CORNER, the town's own: two quarter pipes facing across a pad,
 * a funbox between them, a rail and a ledge. A quarter pipe's ramp is the
 * arc of a circle R round, H high, with a deck behind its coping; its solid
 * is stacked boxes inside the arc, as frustumSolid stacks them inside a bank.
 */
const QP = { R: 2.2, H: 1.6, deck: 1.2, base: 0.03, steps: 6 };

function quarterPipe(T, edge, dir, y0, y1) {
  const { R, H, deck, base, steps } = QP;
  const cx = edge + dir * R;
  const cy = base + R;
  const at = (hh) => cx - dir * Math.sqrt(R * R - (cy - hh) * (cy - hh));
  const prof = [[cx, base]];
  for (let k = 1; k <= 8; k += 1) {
    const hh = base + (H * k) / 8;
    prof.push([at(hh), hh]);
  }
  prof.push([edge - dir * deck, base + H], [edge - dir * deck, base]);
  T.prism('sfTeal', 'y', prof, y0, y1);
  for (let k = 0; k < steps; k += 1) {
    const top = base + (H * (k + 1)) / steps;
    const a = edge - dir * deck;
    const b = at(top);
    T.hidden(Math.min(a, b), y0, base + (H * k) / steps, Math.max(a, b), y1, top, 'wall', 'quarter pipe');
  }
  /* The coping, and the deck's rail at the back. */
  T.cyl('sfSteel', [at(base + H), y0, base + H], [at(base + H), y1, base + H], 0.05, 6, null, true);
  T.cap('sfSteel', [edge - dir * (deck - 0.1), y0, base + H + 0.9], [edge - dir * (deck - 0.1), y1, base + H + 0.9], 0.04, { kind: 'pole', name: 'deck rail' });
  for (const y of [y0 + 0.1, y1 - 0.1]) {
    T.post('sfSteel', edge - dir * (deck - 0.1), y, base + H, base + H + 0.9, 0.035, { kind: 'pole', name: 'deck rail' });
  }
}

function skatePark(T) {
  T.paint('sfConcrete', 360, 4, 0, 398, 34, 0.03);
  quarterPipe(T, 364.5, 1, 15, 23);
  quarterPipe(T, 393.5, -1, 15, 23);
  T.sign('skate', 364.5 - QP.deck, 19, 0.85, 6.6, 1.1, 'w', 0.02);
  /* The funbox: a flat top with a bank each side. */
  const o = { x0: 373.5, x1: 384.5, y0: 15.5, y1: 22.5 };
  const i = { x0: 376.5, x1: 381.5, y0: 17, y1: 21 };
  T.frustum('sfSky', o, 0.03, i, 0.9);
  T.frustumSolid(o, 0.03, i, 0.9, 4, 'funbox');
  T.cyl('sfSteel', [i.x0, i.y0, 0.9], [i.x1, i.y0, 0.9], 0.04, 6, null, true);
  T.cyl('sfSteel', [i.x0, i.y1, 0.9], [i.x1, i.y1, 0.9], 0.04, 6, null, true);
  /* The rail, and the ledge with its steel edge. */
  T.cap('sfSteel', [376, 10, 0.55], [382, 10, 0.55], 0.04, { kind: 'pole', name: 'rail' });
  for (const x of [376.6, 381.4]) {
    T.post('sfSteel', x, 10, 0.03, 0.55, 0.035, { kind: 'pole', name: 'rail leg' });
  }
  T.box('sfButter', 376.5, 27.4, 0.03, 381.5, 28.6, 0.5, { kind: 'wall', name: 'ledge' });
  bench(T, 370, 32, 'n');
  bin(T, 366, 32, 0.03);
  T.deco('sfSteel', 376.5, 27.35, 0.42, 381.5, 27.45, 0.53);
}

function park(T) {
  const P = PARK;
  T.paint('sfLawn', P.x0, P.y0, 0, P.x1, P.y1, 0.015);
  /* The paths, crossing at the bandstand and round the pond. */
  T.paint('sfWalk', P.x0, BANDSTAND.py - 1.5, 0.015, P.x1, BANDSTAND.py + 1.5, 0.03);
  T.paint('sfWalk', BANDSTAND.px - 1.5, P.y0, 0.015, BANDSTAND.px + 1.5, P.y1, 0.03);
  T.disc('sfWalk', POND.px, POND.py, POND.r + 3, 0, 0.028, 40);
  T.disc('sfLawn', POND.px, POND.py, POND.r + 1.2, 0, 0.032, 40);
  /* The pond, its stone edge, an island with a tree, a jetty. */
  T.disc('sfStone', POND.px, POND.py, POND.r + 0.4, 0, 0.25, 40);
  T.disc('sfWater', POND.px, POND.py, POND.r, 0, 0.27, 40);
  T.disc('sfLawn', POND.px + 4, POND.py + 3, 2.6, 0, 0.5, 14);
  T.hidden(POND.px + 2.2, POND.py + 1.2, 0, POND.px + 5.8, POND.py + 4.8, 0.5, 'wall', 'island');
  T.asset({ type: 'tree', style: 'broad', dims: { size: 0.9, variant: 44 } }, 1, POND.px + 4, POND.py + 3, 0.5, 0);
  T.box('sfWood', POND.px - POND.r - 1, POND.py - 1, 0.35, POND.px - POND.r + 6, POND.py + 1, 0.55, { kind: 'wall', name: 'jetty' });
  for (const x of [POND.px - POND.r + 1, POND.px - POND.r + 5.6]) {
    for (const y of [POND.py - 0.9, POND.py + 0.9]) {
      T.post('sfWood', x, y, 0, 1.4, 0.1, { kind: 'pole', name: 'jetty post' });
    }
  }
  /* The bandstand: a round plinth and steps, eight posts, a roof. */
  const B = BANDSTAND;
  T.disc('sfStone', B.px, B.py, B.r + 0.3, 0, 0.8, 8);
  T.hidden(B.px - B.r * 0.7, B.py - B.r * 0.7, 0, B.px + B.r * 0.7, B.py + B.r * 0.7, 0.8, 'wall', 'bandstand');
  T.disc('sfWood', B.px, B.py, B.r, 0.8, 0.85, 8, true);
  T.box('sfStone', B.px - 1.2, B.py - B.r - 1.6, 0, B.px + 1.2, B.py - B.r * 0.6, 0.4, { kind: 'wall', name: 'steps' });
  for (let k = 0; k < B.posts; k += 1) {
    const [dx, dy] = around(B.r - 0.3, ((k + 0.5) / B.posts) * TAU);
    T.post('sfTrim', B.px + dx, B.py + dy, 0.8, B.h + 0.8, 0.13, { kind: 'pole', name: 'bandstand post' });
  }
  T.disc('sfTrim', B.px, B.py, B.r + 0.4, B.h + 0.8, B.h + 1.1, 8);
  T.cone('sfRoofRed', B.px, B.py, B.h + 1.1, B.r + 0.6, 2.6, 8, false);
  /* The roof's solid is stacked boxes inside the cone. A round cap this
   * wide would reach down past the ring into the opening. */
  for (const [z0, z1] of [[0, 0.8], [0.8, 1.6], [1.6, 2.2]]) {
    const s = (B.r + 0.6) * (1 - z1 / 2.6) * 0.65;
    T.hidden(B.px - s, B.py - s, B.h + 1.1 + z0, B.px + s, B.py + s, B.h + 1.1 + z1, 'wall', 'bandstand roof');
  }
  T.hidden(B.px - B.r * 0.7, B.py - B.r * 0.7, B.h + 0.8, B.px + B.r * 0.7, B.py + B.r * 0.7, B.h + 1.1, 'wall', 'bandstand roof');
  T.post('sfYellow', B.px, B.py, B.h + 3.7, B.h + 4.4, 0.06, { kind: 'pole', name: 'finial' });
  /* The playground: swings, a roundabout, a climbing dome. */
  const sx = 382;
  const sy = 98;
  for (const x of [sx - 3, sx + 3]) {
    T.cap('sfRed', [x, sy - 1.2, 0], [x, sy, 2.6], 0.07, { kind: 'pole', name: 'swing frame' });
    T.cap('sfRed', [x, sy + 1.2, 0], [x, sy, 2.6], 0.07, { kind: 'pole', name: 'swing frame' });
  }
  T.cap('sfRed', [sx - 3, sy, 2.6], [sx + 3, sy, 2.6], 0.07, { kind: 'pole', name: 'swing bar' });
  for (const x of [sx - 1.5, sx + 1.5]) {
    T.cyl('sfIron', [x - 0.25, sy, 2.6], [x - 0.25, sy, 0.6], 0.015, 3, null, true);
    T.cyl('sfIron', [x + 0.25, sy, 2.6], [x + 0.25, sy, 0.6], 0.015, 3, null, true);
    T.box('sfYellow', x - 0.3, sy - 0.12, 0.55, x + 0.3, sy + 0.12, 0.62, { solid: false });
  }
  T.disc('sfYellow', 370, 84, 1.8, 0.2, 0.35, 16);
  T.post('sfSteel', 370, 84, 0, 1.0, 0.06, { kind: 'pole', name: 'roundabout' });
  T.hidden(368.8, 82.8, 0, 371.2, 85.2, 0.35, 'wall', 'roundabout');
  T.disc('sfDirt', 380, 88, 6, 0, 0.03, 20, true);
  skatePark(T);
  waterTower(T);
  /* Trees round the edge and in clumps, benches by the paths, bins. */
  const r = rng(909);
  const spots = [];
  for (let k = 0; k < 34; k += 1) {
    const x = r.range(P.x0 + 4, P.x1 - 3);
    const y = r.range(P.y0 + 3, P.y1 - 4);
    const nearPond = Math.hypot(x - POND.px, y - POND.py) < POND.r + 5;
    const nearBand = Math.hypot(x - B.px, y - B.py) < B.r + 6;
    const onPath = Math.abs(y - B.py) < 3.5 || Math.abs(x - B.px) < 3.5;
    const skate = x > 356 && y < 38;
    const play = x > 364 && y > 78 && y < 106;
    /* The water tower's legs, and the pylons' line in ./yard.js. */
    const kept = Math.hypot(x - WATER_TOWER.px, y - WATER_TOWER.py) < 10 || x > 386;
    if (nearPond || nearBand || onPath || skate || play || kept || spots.some(([a, b]) => Math.hypot(a - x, b - y) < 7)) {
      continue;
    }
    spots.push([x, y]);
    const style = r.chance(0.3) ? 'pine' : 'broad';
    T.asset({ type: 'tree', style, dims: { size: r.range(0.8, 1.1), variant: r.int(1, 99) } }, 1, x, y, 0, 0);
  }
  for (const [x, y, back] of [[B.px + 8, B.py - 2, 's'], [B.px - 8, B.py + 2, 'n'], [POND.px, POND.py + POND.r + 2.2, 'n'], [POND.px + POND.r + 2.2, POND.py, 'e']]) {
    bench(T, x, y, back);
  }
  bin(T, B.px + 3, B.py - 2.6, 0.03);
  bin(T, POND.px - 3, POND.py + POND.r + 2.4, 0.03);
  /* The park's sign at the corner by the street. */
  T.box('sfWood', 306, 112.6, 0, 312, 113.0, 0.5, { kind: 'wall', name: 'park sign' });
  T.box('sfDoorGreen', 306, 112.5, 0.5, 312, 113.1, 2.0, { kind: 'wall', name: 'park sign' });
  T.sign('park', 309, 113.11, 1.25, 5.6, 1.3, 'n', 0.002);
}

export function landmarks(T) {
  plant(T);
  gorge(T);
  hill(T);
  dump(T);
  park(T);
}
