/*
 * dress.js: Sunnyfield's set dressing, the clutter that makes a town of
 * boxes a place people live in. Pure, as ./frame.js is, and all of it
 * written inside the builder's `dress` (./frame.js), so every piece is
 * drawn and not solid, left out on Low, and drawn on High and Medium only
 * near the camera (./index.js NEAR_R). Nothing here is a wall a quad meets:
 * the flight lines, the gaps and the colliders are what they were before
 * any of it, and ../../../scripts/sunny-check.js says so.
 *
 * WHAT IS HERE, by where it stands:
 *
 *   a house    window boxes, pots and a mat at the door, a number by it,
 *              baskets and rockers on a porch, lights and windows on the
 *              garage, an oil stain on the drive, bins at the kerb or down
 *              the side, a gas meter and a hose reel on the side wall,
 *              vents and an aerial on the roof; out front a lawn ornament
 *              or two (flamingos, a gnome, a bird bath, a bike left on the
 *              grass, a wagon, a lamp); out back a patio with a table and
 *              chairs or loungers, a grill, a washing line, a vegetable
 *              bed, a woodpile, and three to five of a paddling pool, a
 *              sandbox, a hoop, a mower, a wheelbarrow, a compost bin, a
 *              bird feeder, a swingball, a gnome, flamingos, a ball; the
 *              dog's bowl, worn grass under the swings, stepping stones
 *              to the shed, and shrubs and flowers along the fences
 *   a shop     a board on the pavement, café tables for food, posters
 *              in the windows; on the roof skylights, vents, condensers, a
 *              hatch, a dish, the handler's conduit, seams in the tar; out
 *              back downpipes, a step and a lamp, a lid on the dumpster,
 *              sacks, boxes, crates, drums, pallets, a ladder
 *   the town   kerbs and joints on the pavements, patches and seams in the
 *              roads, meters, planters, newspaper boxes, a phone booth,
 *              cabinets, roadworks, a hopscotch; at the gas station, the
 *              square, the school, the church, the town hall, the bowling
 *              alley, the fire station, the plant, the dump, the park, the
 *              gorge and the hill, what each would gather
 *
 * The kerbs alone are not set dressing: a kerb runs a street's length and
 * is drawn at every range on High and Medium. Paint on the ground (a car
 * park's lines, the court, a path, the pool) and what is fixed to a wall
 * (mullions, posters, the hall's hedges) is written inside `wide`, still
 * left out on Low but drawn at every range, because a line that appears
 * as the quad closes on it is seen appearing. The street furniture the
 * town already has (lamps, hydrants, benches, signs, poles, trees) puts a
 * circle on the builder's `taken` list, and nothing here stands in one.
 *
 * Its colours are the cel ones: a near cell is a single batch, one draw,
 * so glass here is the sky's colour, a lamp is butter and water is teal,
 * where the town's own glass and water are drawn flat. And none of it
 * casts a shadow (./index.js).
 *
 * Every house is rolled from a seed of its own (./houses.js passes it), so
 * the dressing never changes what the house rolled, and a yard's clutter
 * keeps clear of what is already there: the house, the drive, the path,
 * the trees and whatever ./houses.js put in the back yard, by a list of
 * circles and rectangles each piece is tried against. All the arithmetic
 * is exact (squares, never a square root), so a yard is the same on every
 * engine.
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

import { lotFrame, rng, W, D } from './frame.js';
import {
  WALKS, ROADS, MANHOLES, KERB, ROAD_H, HALF, WALK, MAIN_Y, OAK_X, PINE_X, MILL_X, PLANT_X, MAPLE_Y, BIRCH_Y,
  OAK_END, MILL_END, PLANT_END, BULB,
} from './streets.js';
import { GAS, SQUARE, PADS, BOWL, HALL as CIVIC, SCHOOL, CHURCH } from './downtown.js';
import { HALL as TURBINES, DUMP, MOUNDS, DOZER, TYRES, PARK, POND, BANDSTAND, GORGE, GORGE_BRIDGE, TIERS, MANSION } from './landmarks.js';

const FLOWERS = ['sfPink', 'sfRed', 'sfYellow', 'sfPurple', 'sfTrim', 'sfOrange'];
const CLOTHES = ['sfRed', 'sfSky', 'sfTrim', 'sfYellow', 'sfPink', 'sfDoorNavy', 'sfMint', 'sfLilac'];

/* ------------------------------------------------------------------ */
/* Keeping clear                                                       */
/* ------------------------------------------------------------------ */

/* Whether a circle at (u, v), r round, is clear of everything kept: a kept
 * thing is a circle { u, v, r } or a rectangle { u0, u1, v0, v1 }. */
function clearOf(keep, u, v, r) {
  for (const k of keep) {
    if (k.u0 !== undefined) {
      if (u + r > k.u0 && u - r < k.u1 && v + r > k.v0 && v - r < k.v1) {
        return false;
      }
    } else {
      const du = u - k.u;
      const dv = v - k.v;
      const rr = r + k.r;
      if (du * du + dv * dv < rr * rr) {
        return false;
      }
    }
  }
  return true;
}

/* A spot r round inside the zone { u0, u1, v0, v1 } and clear of what is
 * kept, tried a few times; kept itself once found. null when none fits. */
function spot(keep, d, zone, r, tries = 10) {
  if (zone.u1 - zone.u0 < 2 * r || zone.v1 - zone.v0 < 2 * r) {
    return null;
  }
  for (let k = 0; k < tries; k += 1) {
    const u = d.range(zone.u0 + r, zone.u1 - r);
    const v = d.range(zone.v0 + r, zone.v1 - r);
    if (clearOf(keep, u, v, r)) {
      keep.push({ u, v, r });
      return [u, v];
    }
  }
  return null;
}

const rect = (u0, u1, v0, v1) => ({ u0: Math.min(u0, u1), u1: Math.max(u0, u1), v0: Math.min(v0, v1), v1: Math.max(v0, v1) });

/* ------------------------------------------------------------------ */
/* The pieces, each in a lot's frame (./frame.js lotFrame), standing on  */
/* the ground at (u, v) unless h says otherwise                        */
/* ------------------------------------------------------------------ */

/* A garden chair, its back to the local side `back` ('u-', 'u+', 'v-',
 * 'v+'). */
function chair(L, u, v, h, back, m) {
  L.deco(m, u - 0.24, v - 0.24, h + 0.4, u + 0.24, v + 0.24, h + 0.46);
  const legs = back === 'u-' || back === 'u+' ? [[u - 0.22, v - 0.24, u - 0.18, v + 0.24], [u + 0.18, v - 0.24, u + 0.22, v + 0.24]]
    : [[u - 0.24, v - 0.22, u + 0.24, v - 0.18], [u - 0.24, v + 0.18, u + 0.24, v + 0.22]];
  for (const [a, b, c, e] of legs) {
    L.deco(m, a, b, h, c, e, h + 0.4);
  }
  const o = { 'u-': [-0.24, 0], 'u+': [0.24, 0], 'v-': [0, -0.24], 'v+': [0, 0.24] }[back];
  if (o[0]) {
    L.deco(m, u + o[0] - Math.sign(o[0]) * 0.05, v - 0.24, h + 0.46, u + o[0], v + 0.24, h + 0.95);
  } else {
    L.deco(m, u - 0.24, v + o[1] - Math.sign(o[1]) * 0.05, h + 0.46, u + 0.24, v + o[1], h + 0.95);
  }
}

/* A round table on one leg. */
function table(L, u, v, h, r, m) {
  L.disc(m, u, v, r, h + 0.7, h + 0.74, 12);
  L.cyl('sfIron', [u, v, h], [u, v, h + 0.7], 0.035, 5);
  L.disc('sfIron', u, v, 0.22, h, h + 0.03, 8);
}

/* A pot with a shrub in it, or flowers. */
function pot(L, d, u, v, h) {
  L.cyl('sfBrick', [u, v, h], [u, v, h + 0.36], 0.15, 7, 0.2);
  if (d.chance(0.5)) {
    L.bead('sfHedge', u, v, h + 0.5, 0.22);
  } else {
    L.bead('sfHedge', u, v, h + 0.42, 0.16);
    for (let k = 0; k < 3; k += 1) {
      L.bead(d.pick(FLOWERS), u + (k - 1) * 0.1, v + (k % 2 ? 0.06 : -0.06), h + 0.55, 0.07);
    }
  }
}

/* A pair of pink flamingos on wire legs. */
function flamingos(L, d, u, v) {
  for (const [a, b] of [[0, 0], [0.45, 0.22]]) {
    const x = u + a;
    const y = v + b;
    const s = d.chance(0.5) ? 1 : -1;
    L.cyl('sfIron', [x, y, 0], [x, y, 0.56], 0.012, 3);
    L.cyl('sfIron', [x + 0.06 * s, y, 0], [x + 0.06 * s, y, 0.5], 0.012, 3);
    L.bead('sfPink', x, y, 0.66, 0.15);
    L.bead('sfPink', x + 0.13 * s, y, 0.7, 0.1);
    L.cyl('sfPink', [x - 0.09 * s, y, 0.72], [x - 0.15 * s, y, 0.98], 0.03, 5);
    L.bead('sfPink', x - 0.13 * s, y, 1.0, 0.06);
    L.cyl('sfIron', [x - 0.15 * s, y, 1.0], [x - 0.25 * s, y, 0.95], 0.016, 4, 0.006);
  }
}

/* A garden gnome: blue coat, white beard, red hat. */
function gnome(L, u, v) {
  L.cyl('sfDoorNavy', [u, v, 0], [u, v, 0.24], 0.1, 7, 0.07);
  L.bead('sfPeach', u, v, 0.3, 0.07);
  L.bead('sfTrim', u, v - 0.04, 0.24, 0.06);
  L.cone('sfRed', u, v, 0.33, 0.075, 0.2, 6);
}

/* A bird bath, a bird on its rim. */
function birdBath(L, d, u, v) {
  L.cyl('sfStone', [u, v, 0], [u, v, 0.66], 0.08, 6, 0.06);
  L.disc('sfStone', u, v, 0.34, 0.62, 0.72, 10);
  L.disc('sfTeal', u, v, 0.28, 0.62, 0.725, 10);
  if (d.chance(0.6)) {
    L.bead('sfSky', u + 0.3, v, 0.78, 0.06);
    L.bead('sfSky', u + 0.33, v, 0.85, 0.04);
  }
}

/* A bike left lying on the lawn. */
function bike(L, d, u, v) {
  const m = d.pick(['sfRed', 'sfTeal', 'sfPurple', 'sfDoorNavy']);
  L.ring('sfIron', u - 0.5, v, 0.03, 0.3, 0.025, 0, 0, 3, 12);
  L.ring('sfIron', u + 0.5, v, 0.03, 0.3, 0.025, 0, 0, 3, 12);
  L.cyl(m, [u - 0.5, v, 0.06], [u + 0.5, v, 0.06], 0.025, 4);
  L.cyl(m, [u - 0.1, v, 0.06], [u + 0.25, v + 0.3, 0.06], 0.022, 4);
  L.deco('sfIron', u - 0.2, v + 0.25, 0.04, u + 0.05, v + 0.36, 0.1);
  L.cyl('sfIron', [u + 0.45, v - 0.3, 0.06], [u + 0.45, v + 0.3, 0.06], 0.018, 4);
}

/* A bike standing in a rack, its wheels in the plane across u. */
function parkedBike(L, d, u, v) {
  const m = d.pick(['sfRed', 'sfTeal', 'sfPurple', 'sfDoorNavy']);
  L.ring('sfIron', u, v - 0.5, 0.33, 0.3, 0.025, 1, 0, 3, 12);
  L.ring('sfIron', u, v + 0.5, 0.33, 0.3, 0.025, 1, 0, 3, 12);
  L.cyl(m, [u, v - 0.5, 0.33], [u, v - 0.12, 0.82], 0.022, 4);
  L.cyl(m, [u, v - 0.12, 0.82], [u, v + 0.38, 0.84], 0.022, 4);
  L.cyl(m, [u, v + 0.38, 0.84], [u, v + 0.5, 0.33], 0.022, 4);
  L.cyl(m, [u, v - 0.04, 0.34], [u, v + 0.38, 0.84], 0.022, 4);
  L.cyl(m, [u, v - 0.04, 0.34], [u, v - 0.12, 0.82], 0.022, 4);
  L.deco('sfIron', u - 0.06, v - 0.22, 0.86, u + 0.06, v - 0.04, 0.92);
  L.cyl('sfIron', [u - 0.24, v + 0.4, 0.96], [u + 0.24, v + 0.4, 0.96], 0.018, 4);
  L.cyl('sfIron', [u, v + 0.38, 0.84], [u, v + 0.4, 0.96], 0.018, 3);
}

/* A red wagon. */
function wagon(L, u, v) {
  L.deco('sfRed', u - 0.45, v - 0.22, 0.16, u + 0.45, v + 0.22, 0.4);
  for (const a of [-0.3, 0.3]) {
    L.cyl('sfIron', [u + a, v - 0.25, 0.12], [u + a, v - 0.2, 0.12], 0.11, 7);
    L.cyl('sfIron', [u + a, v + 0.2, 0.12], [u + a, v + 0.25, 0.12], 0.11, 7);
  }
  L.cyl('sfIron', [u + 0.45, v, 0.3], [u + 0.95, v, 0.5], 0.015, 3);
}

/* A lamp on a post, lit. */
function lawnLamp(L, u, v) {
  L.cyl('sfIron', [u, v, 0], [u, v, 1.5], 0.04, 5);
  L.ball('sfButter', u, v, 1.62, 0.13);
  L.cone('sfIron', u, v, 1.7, 0.15, 0.14, 6);
}

/* A bin, a wheelie one or a can with a lid. */
function trashCan(L, d, u, v) {
  if (d.chance(0.5)) {
    const m = d.pick(['sfDoorGreen', 'sfDoorNavy', 'sfIron']);
    L.deco(m, u - 0.28, v - 0.32, 0.04, u + 0.28, v + 0.32, 0.98);
    L.deco('sfIron', u - 0.3, v - 0.36, 0.98, u + 0.3, v + 0.34, 1.04);
    L.cyl('sfTyre', [u - 0.28, v + 0.26, 0.08], [u + 0.28, v + 0.26, 0.08], 0.08, 6);
  } else {
    L.cyl('sfSteel', [u, v, 0], [u, v, 0.82], 0.26, 8, 0.28);
    L.cyl('sfSteel', [u, v, 0.82], [u, v, 0.9], 0.31, 8, 0.29);
    L.bead('sfSteel', u, v, 0.93, 0.05);
  }
}

/* A washing line on two T posts along u from u0 to u1 at v, and what is
 * pegged to it. */
function washingLine(L, d, u0, u1, v) {
  for (const u of [u0, u1]) {
    L.cyl('sfSteel', [u, v, 0], [u, v, 1.95], 0.035, 5);
    L.cyl('sfSteel', [u, v - 0.5, 1.9], [u, v + 0.5, 1.9], 0.025, 4);
  }
  for (const o of [-0.35, 0, 0.35]) {
    L.cyl('sfTrim', [u0, v + o, 1.88], [u1, v + o, 1.88], 0.008, 3);
    for (let u = u0 + 0.4; u < u1 - 0.4; u += d.range(0.5, 0.9)) {
      if (d.chance(0.45)) {
        const w = d.range(0.25, 0.45);
        const h = d.range(0.35, 0.7);
        L.deco(d.pick(CLOTHES), u, v + o - 0.01, 1.88 - h, u + w, v + o + 0.01, 1.88);
      }
    }
  }
}

/* A raised vegetable bed from (u0, v0) to (u1, v1): rows of greens and a
 * few tomatoes. */
function vegBed(L, d, u0, v0, u1, v1) {
  L.deco('sfWood', u0, v0, 0, u1, v1, 0.3);
  L.paint('sfDirt', u0 + 0.08, v0 + 0.08, 0.3, u1 - 0.08, v1 - 0.08, 0.31);
  const alongU = u1 - u0 >= v1 - v0;
  const [a0, a1, b0, b1] = alongU ? [u0, u1, v0, v1] : [v0, v1, u0, u1];
  for (let b = b0 + 0.3; b < b1 - 0.2; b += 0.4) {
    for (let a = a0 + 0.3; a < a1 - 0.2; a += 0.45) {
      const [u, v] = alongU ? [a, b] : [b, a];
      L.bead(d.chance(0.8) ? 'sfHedge' : 'sfDoorGreen', u, v, 0.4, 0.15);
      if (d.chance(0.2)) {
        L.bead('sfRed', u + 0.08, v, 0.48, 0.06);
      }
    }
  }
}

/* A paddling pool. */
function paddlingPool(L, u, v) {
  L.disc('sfSky', u, v, 0.9, 0, 0.25, 14);
  L.disc('sfTeal', u, v, 0.8, 0, 0.255, 14);
}

/* A sandbox, a bucket and a spade. */
function sandbox(L, u, v) {
  L.deco('sfWood', u - 0.8, v - 0.8, 0, u + 0.8, v + 0.8, 0.22);
  L.paint('sfButter', u - 0.72, v - 0.72, 0.22, u + 0.72, v + 0.72, 0.23);
  L.cyl('sfRed', [u + 0.3, v - 0.2, 0.23], [u + 0.3, v - 0.2, 0.42], 0.09, 7, 0.12);
  L.cyl('sfYellow', [u - 0.3, v + 0.2, 0.24], [u - 0.1, v + 0.4, 0.24], 0.02, 3);
}

/* A mower, its handle back toward the house. */
function mower(L, u, v) {
  L.deco('sfRed', u - 0.25, v - 0.3, 0.12, u + 0.25, v + 0.3, 0.36);
  L.cyl('sfIron', [u, v, 0.36], [u, v, 0.5], 0.13, 7);
  for (const a of [-0.2, 0.2]) {
    L.cyl('sfIron', [u + a, v - 0.3, 0.07], [u + a, v + 0.3, 0.07], 0.07, 6);
    L.cyl('sfIron', [u + a, v - 0.3, 0.3], [u + a, v - 0.85, 0.95], 0.015, 3);
  }
  L.cyl('sfIron', [u - 0.2, v - 0.85, 0.95], [u + 0.2, v - 0.85, 0.95], 0.018, 3);
}

/* A wheelbarrow. */
function wheelbarrow(L, u, v) {
  L.deco('sfDoorGreen', u - 0.3, v - 0.45, 0.35, u + 0.3, v + 0.45, 0.6);
  L.cyl('sfTyre', [u - 0.05, v + 0.6, 0.17], [u + 0.05, v + 0.6, 0.17], 0.17, 8);
  for (const a of [-0.22, 0.22]) {
    L.cyl('sfIron', [u + a, v + 0.5, 0.25], [u + a, v - 0.95, 0.6], 0.02, 3);
    L.cyl('sfIron', [u + a, v - 0.3, 0], [u + a, v - 0.3, 0.35], 0.02, 3);
  }
}

/* A compost bin, a woodpile, a bird feeder, a swingball. */
function compost(L, u, v) {
  L.deco('sfDoorGreen', u - 0.4, v - 0.4, 0, u + 0.4, v + 0.4, 0.95);
  L.deco('sfIron', u - 0.44, v - 0.44, 0.95, u + 0.44, v + 0.44, 1.02);
}

function woodpile(L, d, u, v, alongU) {
  for (let row = 0; row < 3; row += 1) {
    for (let k = 0; k < 5 - row; k += 1) {
      const a = (k - (4 - row) / 2) * 0.17;
      const h = 0.08 + row * 0.15;
      const m = d.chance(0.5) ? 'sfWood' : 'sfRoofBrown';
      if (alongU) {
        L.cyl(m, [u + a, v - 0.3, h], [u + a, v + 0.3, h], 0.08, 5);
      } else {
        L.cyl(m, [u - 0.3, v + a, h], [u + 0.3, v + a, h], 0.08, 5);
      }
    }
  }
}

function birdFeeder(L, u, v) {
  L.cyl('sfWood', [u, v, 0], [u, v, 1.6], 0.03, 4);
  L.deco('sfRed', u - 0.14, v - 0.14, 1.6, u + 0.14, v + 0.14, 1.85);
  L.deco('sfRoofSlate', u - 0.2, v - 0.2, 1.85, u + 0.2, v + 0.2, 1.9);
}

function swingball(L, u, v) {
  L.cyl('sfSteel', [u, v, 0], [u, v, 1.8], 0.025, 4);
  L.cyl('sfTrim', [u, v, 1.75], [u + 0.45, v + 0.1, 1.15], 0.006, 3);
  L.bead('sfYellow', u + 0.48, v + 0.1, 1.1, 0.1);
}

/* A shrub, round. */
function shrub(L, d, u, v) {
  const r = d.range(0.35, 0.55);
  L.ball('sfHedge', u, v, r * 0.7, r);
}

/* A dish of dog food and a bone. */
function dogBowl(L, u, v) {
  L.disc('sfRed', u, v, 0.13, 0, 0.06, 8);
  L.disc('sfDough', u, v, 0.1, 0, 0.065, 8);
  L.cyl('sfTrim', [u + 0.25, v + 0.1, 0.03], [u + 0.45, v + 0.1, 0.03], 0.025, 4);
  L.bead('sfTrim', u + 0.25, v + 0.13, 0.04, 0.035);
  L.bead('sfTrim', u + 0.45, v + 0.13, 0.04, 0.035);
}

/* ------------------------------------------------------------------ */
/* A house's dressing                                                  */
/* ------------------------------------------------------------------ */

/*
 * Everything ./houses.js house() knows about the lot, as H: its size, the
 * body's corners and heights, the roof's ridge and which way it runs, the
 * garage, the door, the porch, the front windows, the letterbox, what the
 * front yard has along the street (frontKind: under 0.3 a hedge, under
 * 0.55 a picket fence, else open), the street tree, the car, the dish, the
 * back yard's fence and the things in it.
 */
export function dressHouse(L, d, H) {
  const { Wl, Dl, hu0, hu1, v0, v1, garageW, gu0, gu1, du, plinth } = H;
  const keep = [];
  /* The house, the porch, the path and the stoop, the beds, the garage,
   * the drive, the letterbox, the street tree, the air conditioner. */
  keep.push(rect(hu0 - 0.3, hu1 + 0.3, v0 - 0.15, v1 + 0.15));
  if (H.porch) {
    keep.push(rect(hu0 + 0.2, hu1 - 0.2, v0 - 2.4, v0));
  }
  keep.push(rect(du - 0.9, du + 0.9, 0, v0));
  for (const u of H.frontWins) {
    keep.push(rect(u - 1.1, u + 1.1, v0 - 1.1, v0));
  }
  let gv1 = v0;
  if (garageW > 0) {
    gv1 = Math.min(v1, H.gv0 + 6.4);
    keep.push(rect(gu0 - 0.2, gu1 + 0.2, 0, gv1 + 0.2));
  } else {
    const pu0 = H.left ? Math.max(0.6, hu0 - 3.2) : hu1 + 0.3;
    keep.push(rect(pu0, pu0 + 2.9, 0, v0 + 3));
  }
  keep.push({ u: H.mu, v: 0.45, r: 0.5 });
  if (H.frontKind < 0.55) {
    keep.push(rect(0, Wl, 0.9, 2.1));
  }
  if (H.treeU !== null) {
    keep.push({ u: H.treeU, v: 2.0, r: 2.2 });
  }
  for (const t of H.things) {
    keep.push({ u: t.u, v: t.v, r: t.r });
  }
  const chim = H.chimney;
  if (chim) {
    keep.push(rect(chim.u0 - 0.1, chim.u1 + 0.1, chim.v0 - 0.1, chim.v1 + 0.1));
  }

  /* THE DOOR: a mat, a pot either side, the number. */
  const top = H.porch ? plinth : plinth - 0.05;
  L.paint(d.pick(['sfRoofBrown', 'sfDoorRed', 'sfDoorGreen']), du - 0.45, v0 - 0.7, top, du + 0.45, v0 - 0.1, top + 0.015);
  if (H.porch) {
    pot(L, d, du - 0.85, v0 - 0.35, plinth);
    pot(L, d, du + 0.85, v0 - 0.35, plinth);
  } else if (d.chance(0.7)) {
    pot(L, d, du - 1.05, v0 - 0.45, 0);
    pot(L, d, du + 1.05, v0 - 0.45, 0);
  }
  L.paint('sfYellow', du - 0.13, v0 - 0.06, plinth + 1.55, du - 0.04, v0 - 0.05, plinth + 1.72);
  L.paint('sfYellow', du + 0.04, v0 - 0.06, plinth + 1.55, du + 0.13, v0 - 0.05, plinth + 1.72);

  /* WINDOW BOXES under some of the front windows, upstairs and down. */
  const boxColour = d.pick(['sfTrim', 'sfWood', H.door]);
  const sills = [H.wsill];
  if (H.storeys === 2) {
    sills.push(H.wsill + H.storey + 0.05);
  }
  for (const s of sills) {
    const us = s === H.wsill ? H.frontWins : [hu0 + 1.6, hu1 - 1.6, (hu0 + hu1) / 2];
    for (const u of us) {
      if (!d.chance(0.5)) {
        continue;
      }
      L.deco(boxColour, u - 0.6, v0 - 0.34, s - 0.42, u + 0.6, v0, s - 0.14);
      for (let k = 0; k < 5; k += 1) {
        L.bead(d.chance(0.35) ? 'sfHedge' : d.pick(FLOWERS), u - 0.44 + k * 0.22, v0 - 0.18, s - 0.08, 0.1);
      }
    }
  }

  /* THE PORCH: baskets hung at its ends, and rockers if there is no swing. */
  if (H.porch) {
    const pu0 = hu0 + 0.4;
    const pu1 = hu1 - 0.4;
    for (const u of [pu0 + 0.6, pu1 - 0.6]) {
      L.cyl('sfIron', [u, v0 - 1.6, plinth + 2.55], [u, v0 - 1.6, plinth + 2.1], 0.01, 3);
      L.ball('sfHedge', u, v0 - 1.6, plinth + 1.95, 0.22);
      for (let k = 0; k < 3; k += 1) {
        L.bead(d.pick(FLOWERS), u + (k - 1) * 0.14, v0 - 1.72, plinth + 2.0, 0.07);
      }
    }
    if (!H.porchSwing && pu1 - pu0 > 5) {
      const m = d.pick(['sfTrim', 'sfWood', 'sfDoorGreen']);
      chair(L, pu1 - 1.4, v0 - 0.9, plinth, 'v+', m);
      chair(L, pu1 - 2.3, v0 - 0.9, plinth, 'v+', m);
      L.deco('sfWood', pu1 - 1.95, v0 - 1.05, plinth, pu1 - 1.75, v0 - 0.75, plinth + 0.5);
    }
  }

  /* THE GARAGE: a light either side, windows in the doors, a stain on the
   * drive. */
  if (garageW > 0) {
    const gv0 = H.gv0;
    for (const u of [gu0 + 0.3, gu1 - 0.3]) {
      L.deco('sfButter', u - 0.1, gv0 - 0.14, 2.42, u + 0.1, gv0, 2.66);
    }
    const n = garageW > 5 ? 2 : 1;
    const dw = (garageW - 0.6 * (n + 1)) / n;
    for (let k = 0; k < n; k += 1) {
      const a = gu0 + 0.6 + k * (dw + 0.6);
      for (let w = 0; w < 4; w += 1) {
        const x0 = a + 0.15 + (w * (dw - 0.3)) / 4;
        L.paint('sfRoofSlate', x0 + 0.06, gv0 - 0.075, 1.78, x0 + (dw - 0.3) / 4 - 0.06, gv0 - 0.055, 2.08);
      }
    }
    if (!H.parked && d.chance(0.6)) {
      const u = (gu0 + gu1) / 2 + d.range(-0.8, 0.8);
      L.paint('sfPatch', u - 0.5, gv0 - 2.6, 0.03, u + 0.4, gv0 - 1.8, 0.034);
    }
    if (!H.parked && d.chance(0.35)) {
      /* A basketball and a pair of boxes for the move nobody finished. */
      L.bead('sfOrange', gu1 - 0.6, gv0 - 1.2, 0.12, 0.12);
      if (d.chance(0.5)) {
        L.deco('sfCardboard', gu0 + 0.4, gv0 - 1.1, 0.03, gu0 + 0.95, gv0 - 0.6, 0.45);
        L.deco('sfCardboard', gu0 + 0.45, gv0 - 1.05, 0.45, gu0 + 0.9, gv0 - 0.65, 0.8);
      }
    }
  }

  /* BINS: out at the kerb, or down the side of the house. */
  const side = garageW > 0 ? (H.left ? 'right' : 'left') : (d.chance(0.5) ? 'left' : 'right');
  if (d.chance(0.4)) {
    const u = garageW > 0 ? (H.left ? gu1 + 0.55 : gu0 - 0.55) : (H.left ? hu1 + 0.9 : hu0 - 0.9);
    const u2 = u + (u < Wl / 2 ? 0.7 : -0.7);
    if (u > 0.5 && u < Wl - 0.5 && clearOf(keep, u, 0.5, 0.35) && clearOf(keep, u2, 0.5, 0.35)) {
      trashCan(L, d, u, 0.5);
      trashCan(L, d, u2, 0.5);
    }
  } else {
    const u = side === 'left' ? hu0 - 0.55 : hu1 + 0.55;
    if (u > 0.6 && u < Wl - 0.6) {
      trashCan(L, d, u, v1 - 2.2);
      trashCan(L, d, u, v1 - 2.95);
    }
  }
  /* The gas meter and the hose reel on the side wall without the garage,
   * clear of a chimney that side and of the side windows. */
  const sw = side === 'left' ? hu0 : hu1;
  const out = side === 'left' ? -1 : 1;
  const mid = chim && chim.side === side ? v0 + 0.9 : (v0 + v1) / 2;
  L.deco('sfSteel', sw, mid - 0.2, 0.9, sw + out * 0.18, mid + 0.2, 1.35);
  L.cyl('sfIron', [sw + out * 0.09, mid, 0.3], [sw + out * 0.09, mid, 0.9], 0.02, 3);
  L.ring('sfDoorGreen', sw + out * 0.12, mid + 0.75, 0.75, 0.25, 0.06, out, 0, 4, 12);

  /* THE ROOF: a vent pipe or two on the back slope, an aerial on some. */
  const slopeAt = (a, m) => H.ridge + 0.2 - Math.abs(a - m) * H.pitch;
  const vents = d.int(1, 2);
  for (let k = 0; k < vents; k += 1) {
    let u;
    let v;
    let h;
    if (H.along) {
      const m = (v0 + v1) / 2;
      u = d.range(hu0 + 1.2, hu1 - 1.2);
      v = m + (v1 - m) * d.range(0.3, 0.6);
      h = slopeAt(v, m);
    } else {
      const m = (hu0 + hu1) / 2;
      u = m - (m - hu0) * d.range(0.3, 0.6);
      v = d.range(v0 + 1.2, (v0 + v1) / 2);
      h = slopeAt(u, m);
    }
    L.cyl('sfIron', [u, v, h - 0.15], [u, v, h + 0.45], 0.055, 6);
    L.cyl('sfIron', [u, v, h + 0.45], [u, v, h + 0.5], 0.08, 6);
  }
  if (!H.dish && d.chance(0.4)) {
    const u = H.along ? hu0 + 1.0 : (hu0 + hu1) / 2;
    const v = H.along ? (v0 + v1) / 2 : v1 - 1.0;
    L.cyl('sfIron', [u, v, H.ridge], [u, v, H.ridge + 2.3], 0.025, 4);
    for (const [h, w] of [[1.5, 0.75], [1.8, 0.55], [2.1, 0.38]]) {
      if (H.along) {
        L.cyl('sfIron', [u - w, v, H.ridge + h], [u + w, v, H.ridge + h], 0.012, 3);
      } else {
        L.cyl('sfIron', [u, v - w, H.ridge + h], [u, v + w, H.ridge + h], 0.012, 3);
      }
    }
  }

  /* THE FRONT LAWN: shrubs at the corners, and an ornament or two. */
  for (const [u, s] of [[hu0 - 0.15, 'left'], [hu1 + 0.15, 'right']]) {
    const garageSide = garageW > 0 && (s === 'left') === H.left;
    if (!garageSide && d.chance(0.6)) {
      shrub(L, d, u, v0 - 0.55);
    }
  }
  const lawn = { u0: 0.6, u1: Wl - 0.6, v0: H.frontKind < 0.55 ? 2.3 : 0.9, v1: v0 - 1.2 };
  if (H.frontKind !== 1) {
    const kinds = ['flamingos', 'gnome', 'bath', 'bike', 'wagon', 'lamp', 'ball', 'gnome', 'lamp'];
    const n = d.int(1, 2);
    for (let k = 0; k < n; k += 1) {
      const kind = d.pick(kinds);
      const r = { flamingos: 0.6, bike: 0.7, wagon: 0.8, bath: 0.45 }[kind] ?? 0.3;
      const at = spot(keep, d, lawn, r);
      if (!at) {
        continue;
      }
      const [u, v] = at;
      if (kind === 'flamingos') {
        flamingos(L, d, u - 0.2, v - 0.1);
      } else if (kind === 'gnome') {
        gnome(L, u, v);
      } else if (kind === 'bath') {
        birdBath(L, d, u, v);
      } else if (kind === 'bike') {
        bike(L, d, u, v);
      } else if (kind === 'wagon') {
        wagon(L, u - 0.2, v);
      } else if (kind === 'lamp') {
        lawnLamp(L, u, v);
      } else {
        L.bead(d.pick(['sfRed', 'sfYellow', 'sfSky']), u, v, 0.13, 0.13);
      }
    }
  }

  /* THE BACK YARD. */
  if (!H.fenced) {
    return;
  }
  const yard = { u0: 0.7, u1: Wl - 0.7, v0: v1 + 0.3, v1: Dl - 0.6 };
  /* The patio off the back door, as deep as the yard allows, tried at its
   * corners, its edges' middles and its middle against what is there. */
  const p0 = Math.max(0.8, du - 1.9);
  const p1 = Math.min(Wl - 0.8, du + 1.9);
  const patioClear = (pd) => [p0, (p0 + p1) / 2, p1].every((u) => [v1 + 0.3, v1 + pd / 2, v1 + pd].every((v) => clearOf(keep, u, v, 0.15)));
  let pd = Math.min(2.8, (Dl - v1) * 0.4);
  while (pd > 1.2 && !patioClear(pd)) {
    pd -= 0.3;
  }
  /* The air conditioner stands on the patio, so it is kept only now. */
  keep.push(rect(hu1 - 1.7, hu1 - 0.5, v1, v1 + 1.0));
  const fences = [rect(0, 0.6, v1 - 1, Dl), rect(Wl - 0.6, Wl, v1 - 1, Dl), rect(0, Wl, Dl - 0.6, Dl)];
  const things = new Set(H.things.map((t) => t.kind));
  if (pd > 1.2) {
    const pm = d.pick(['sfConcrete', 'sfBrick', 'sfWood', 'sfStone']);
    L.paint(pm, p0, v1 + 0.05, 0, p1, v1 + pd, 0.04);
    const patio = rect(p0, p1, v1, v1 + pd);
    const cv = v1 + pd / 2 + 0.1;
    const lounge = pd >= 2.2 && d.chance(0.4);
    let cu = du;
    if (!lounge && !things.has('table')) {
      cu = du + (d.chance(0.5) ? -0.9 : 0.9);
      const m = d.pick(['sfTrim', 'sfDoorGreen', 'sfWood', 'sfTeal']);
      table(L, cu, cv, 0.04, 0.4, m === 'sfWood' ? 'sfTrim' : m);
      chair(L, cu - 0.7, cv, 0.04, 'u-', m);
      chair(L, cu + 0.7, cv, 0.04, 'u+', m);
    } else if (lounge) {
      for (const u of [du - 0.8, du + 0.8]) {
        const m = d.pick(['sfTrim', 'sfTeal', 'sfYellow']);
        L.deco(m, u - 0.3, cv - 0.75, 0.25, u + 0.3, cv + 0.6, 0.33);
        L.deco(m, u - 0.3, cv - 0.85, 0.33, u + 0.3, cv - 0.75, 0.8);
        L.deco('sfIron', u - 0.28, cv - 0.7, 0.04, u + 0.28, cv + 0.55, 0.25);
      }
      /* The cool box between them. */
      L.deco('sfTeal', du - 0.25, cv - 0.2, 0.04, du + 0.25, cv + 0.15, 0.38);
      L.deco('sfTrim', du - 0.27, cv - 0.22, 0.38, du + 0.27, cv + 0.17, 0.43);
    }
    /* A kettle grill, on the side away from the table, on the patio and
     * clear of the air conditioner. */
    if (!things.has('bbq') && d.chance(0.55)) {
      const u = cu === du ? du + (d.chance(0.5) ? -1.6 : 1.6) : du - Math.sign(cu - du) * 1.6;
      if (u > 1 && u < Wl - 1 && clearOf(keep, u, v1 + 0.6, 0.3)) {
        L.cyl('sfIron', [u, v1 + 0.6, 0.04], [u, v1 + 0.6, 0.75], 0.03, 4);
        L.ball('sfIron', u, v1 + 0.6, 0.9, 0.3);
        L.disc('sfIron', u, v1 + 0.6, 0.31, 0.88, 0.9, 10);
      }
    }
    keep.push(patio);
  }
  keep.push(...fences);
  /* The washing line, across the yard. */
  if (d.chance(0.5) && Wl - 1.6 > 5) {
    const len = Math.min(5.5, Wl - 3);
    const at = spot(keep, d, yard, len / 2 + 0.3);
    if (at) {
      washingLine(L, d, at[0] - len / 2, at[0] + len / 2, at[1]);
    }
  }
  /* The vegetable bed, along the back fence. */
  if (d.chance(0.55)) {
    const len = d.range(2.4, 3.6);
    const u = d.range(1.0, Math.max(1.0, Wl - 1.0 - len));
    const vb = Dl - 0.75;
    if (clearOf(keep, u + len / 2, vb - 0.45, 0.6) && clearOf(keep, u + 0.4, vb - 0.45, 0.45) && clearOf(keep, u + len - 0.4, vb - 0.45, 0.45)) {
      vegBed(L, d, u, vb - 0.95, u + len, vb);
      keep.push(rect(u, u + len, vb - 0.95, vb));
    }
  }
  /* The woodpile against a side fence. */
  if (d.chance(0.35)) {
    const u = d.chance(0.5) ? 0.75 : Wl - 0.75;
    const v = d.range(v1 + 1.5, Dl - 2);
    if (clearOf(keep.filter((k) => !fences.includes(k)), u, v, 0.5)) {
      woodpile(L, d, u, v, true);
      keep.push({ u, v, r: 0.5 });
    }
  }
  /* Worn grass under the swings and at the kennel's door. */
  for (const t of H.things) {
    if (t.kind === 'swing') {
      L.disc('sfDirt', t.u, t.v, 1.3, 0, 0.012, 12);
    } else if (t.kind === 'dog') {
      L.disc('sfDirt', t.u, t.v - 0.9, 0.7, 0, 0.012, 10);
    }
  }
  /* Stepping stones from the patio out to the shed, if there is one. */
  const shed = H.things.find((t) => t.kind === 'shed');
  if (shed) {
    const a = [du, v1 + Math.max(pd, 0.6) + 0.4];
    const b = [shed.u, shed.v - 1.4];
    const du2 = b[0] - a[0];
    const dv2 = b[1] - a[1];
    const n = Math.max(2, Math.round(Math.sqrt(du2 * du2 + dv2 * dv2) / 0.7));
    for (let k = 0; k <= n; k += 1) {
      L.disc('sfStone', a[0] + (du2 * k) / n, a[1] + (dv2 * k) / n, 0.24, 0, 0.03, 7);
    }
  }
  /* Three to five of the rest. */
  const small = ['pool', 'sand', 'hoop', 'mower', 'barrow', 'compost', 'feeder', 'swingball', 'gnome', 'ball', 'flamingos', 'bath'];
  const n = d.int(3, 5);
  for (let k = 0; k < n; k += 1) {
    const kind = d.pick(small);
    const r = { pool: 1.0, sand: 0.95, hoop: 0.5, mower: 0.7, barrow: 0.9, compost: 0.5, feeder: 0.3, swingball: 0.6 }[kind] ?? 0.3;
    const at = spot(keep, d, yard, r);
    if (!at) {
      continue;
    }
    const [u, v] = at;
    if (kind === 'pool') {
      paddlingPool(L, u, v);
    } else if (kind === 'sand') {
      sandbox(L, u, v);
    } else if (kind === 'hoop') {
      L.ring(d.pick(['sfPink', 'sfTeal', 'sfYellow']), u, v, 0.02, 0.42, 0.02, 0, 0, 3, 14);
    } else if (kind === 'mower') {
      mower(L, u, v);
    } else if (kind === 'barrow') {
      wheelbarrow(L, u, v);
    } else if (kind === 'compost') {
      compost(L, u, v);
    } else if (kind === 'feeder') {
      birdFeeder(L, u, v);
    } else if (kind === 'swingball') {
      swingball(L, u, v);
    } else if (kind === 'gnome') {
      gnome(L, u, v);
    } else if (kind === 'flamingos') {
      flamingos(L, d, u - 0.2, v - 0.1);
    } else if (kind === 'bath') {
      birdBath(L, d, u, v);
    } else {
      L.bead(d.pick(['sfRed', 'sfYellow', 'sfTrim']), u, v, 0.12, 0.12);
    }
  }
  const dog = H.things.find((t) => t.kind === 'dog');
  if (dog) {
    dogBowl(L, dog.u + 0.9, dog.v - 0.7);
  }
  /* The borders: shrubs and flowers along the fences, on the sides and
   * the back the yard rolls for, wherever nothing else is. */
  const inner = keep.filter((k) => !fences.includes(k));
  const along = [];
  if (d.chance(0.75)) {
    along.push((t) => [1.0 + t * (Wl - 2.0), Dl - 0.9]);
  }
  for (const u of [0.85, Wl - 0.85]) {
    if (d.chance(0.55)) {
      along.push((t) => [u, v1 + 0.8 + t * (Dl - v1 - 2.0)]);
    }
  }
  for (const at of along) {
    const [ua, va] = at(0);
    const [ub, vb] = at(1);
    const len = Math.abs(ub - ua) + Math.abs(vb - va);
    for (let k = 0; k * 1.0 <= len; k += 1) {
      const [u, v] = at(len > 0 ? (k * 1.0) / len : 0);
      const r = d.range(0.28, 0.45);
      if (!clearOf(inner, u, v, r)) {
        continue;
      }
      if (d.chance(0.7)) {
        L.bead(d.chance(0.8) ? 'sfHedge' : 'sfDoorGreen', u, v, r * 0.75, r);
      } else {
        for (let f = 0; f < 3; f += 1) {
          L.bead(d.pick(FLOWERS), u + (f - 1) * 0.22, v + (f % 2 ? 0.1 : -0.1), 0.25, 0.09);
          L.cyl('sfHedge', [u + (f - 1) * 0.22, v + (f % 2 ? 0.1 : -0.1), 0], [u + (f - 1) * 0.22, v + (f % 2 ? 0.1 : -0.1), 0.2], 0.05, 4);
        }
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* More pieces, for the town                                           */
/* ------------------------------------------------------------------ */

/* A bench of slats on two iron legs, along u or across it, its back on the
 * side `back` (+1 or -1) of its line. */
function seat(L, u, v, h, alongU, back, m = 'sfWood') {
  if (alongU) {
    L.deco(m, u - 0.8, v - 0.22, h + 0.42, u + 0.8, v + 0.22, h + 0.47);
    L.deco(m, u - 0.8, v + back * 0.2 - 0.03, h + 0.52, u + 0.8, v + back * 0.2 + 0.03, h + 0.88);
    for (const a of [-0.65, 0.65]) {
      L.deco('sfIron', u + a - 0.04, v - 0.22, h, u + a + 0.04, v + 0.22, h + 0.42);
    }
  } else {
    L.deco(m, u - 0.22, v - 0.8, h + 0.42, u + 0.22, v + 0.8, h + 0.47);
    L.deco(m, u + back * 0.2 - 0.03, v - 0.8, h + 0.52, u + back * 0.2 + 0.03, v + 0.8, h + 0.88);
    for (const a of [-0.65, 0.65]) {
      L.deco('sfIron', u - 0.22, v + a - 0.04, h, u + 0.22, v + a + 0.04, h + 0.42);
    }
  }
}

/* A picnic table and its two benches. */
function picnicTable(L, u, v, h, alongU) {
  const [a, b] = alongU ? [0.95, 0.4] : [0.4, 0.95];
  L.deco('sfWood', u - a, v - b, h + 0.72, u + a, v + b, h + 0.77);
  for (const s of [-1, 1]) {
    if (alongU) {
      L.deco('sfWood', u - a, v + s * 0.75 - 0.15, h + 0.42, u + a, v + s * 0.75 + 0.15, h + 0.46);
      L.deco('sfRoofBrown', u + s * 0.7 - 0.04, v - 0.9, h, u + s * 0.7 + 0.04, v + 0.9, h + 0.72);
    } else {
      L.deco('sfWood', u + s * 0.75 - 0.15, v - a, h + 0.42, u + s * 0.75 + 0.15, v + a, h + 0.46);
      L.deco('sfRoofBrown', u - 0.9, v + s * 0.7 - 0.04, h, u + 0.9, v + s * 0.7 + 0.04, h + 0.72);
    }
  }
}

/* A lamp on a post, taller than a garden's. */
function parkLamp(L, u, v, h, tall = 3.2) {
  L.cyl('sfIron', [u, v, h], [u, v, h + 0.35], 0.11, 6, 0.06);
  L.cyl('sfIron', [u, v, h + 0.35], [u, v, h + tall], 0.045, 5);
  L.bead('sfButter', u, v, h + tall + 0.16, 0.2);
  L.cone('sfIron', u, v, h + tall + 0.3, 0.25, 0.2, 6);
}

/* A parking meter, its window both ways along the kerb. */
function meter(L, u, v, h) {
  L.cyl('sfIron', [u, v, h], [u, v, h + 1.05], 0.035, 4);
  L.deco('sfSteel', u - 0.1, v - 0.08, h + 1.05, u + 0.1, v + 0.08, h + 1.36);
  L.paint('sfRoofSlate', u - 0.07, v - 0.09, h + 1.2, u + 0.07, v + 0.09, h + 1.32);
  L.bead('sfSteel', u, v, h + 1.37, 0.09);
}

/* A traffic cone. */
function cone(L, u, v, h) {
  L.deco('sfOrange', u - 0.18, v - 0.18, h, u + 0.18, v + 0.18, h + 0.04);
  L.cone('sfOrange', u, v, h + 0.04, 0.14, 0.6, 6);
  L.cyl('sfTrim', [u, v, h + 0.3], [u, v, h + 0.38], 0.085, 6, 0.074);
}

/* A planter box of flowers. */
function planter(L, d, u, v, h, alongU, m = 'sfWood') {
  const [a, b] = alongU ? [0.7, 0.3] : [0.3, 0.7];
  L.deco(m, u - a, v - b, h, u + a, v + b, h + 0.5);
  L.paint('sfDirt', u - a + 0.06, v - b + 0.06, h + 0.5, u + a - 0.06, v + b - 0.06, h + 0.51);
  for (let k = -2; k <= 2; k += 1) {
    const [x, y] = alongU ? [u + k * 0.27, v] : [u, v + k * 0.27];
    L.bead(k % 2 ? d.pick(FLOWERS) : 'sfHedge', x, y, h + 0.6, k % 2 ? 0.1 : 0.15);
  }
}

/* A black sack of rubbish. */
function sack(L, d, u, v, h) {
  const r = d.range(0.22, 0.32);
  L.bead(d.chance(0.8) ? 'sfIron' : 'sfDoorGreen', u, v, h + r * 0.8, r);
  L.bead('sfIron', u, v, h + r * 1.7, 0.06);
}

/* A drum, standing or on its side along u. */
function drum(L, d, u, v, h, lying) {
  const m = d.pick(['sfRust', 'sfTeal', 'sfDoorNavy', 'sfRed', 'sfSteel']);
  if (lying) {
    L.cyl(m, [u - 0.45, v, h + 0.3], [u + 0.45, v, h + 0.3], 0.3, 8);
  } else {
    L.cyl(m, [u, v, h], [u, v, h + 0.9], 0.3, 8);
    L.disc('sfIron', u, v, 0.27, h + 0.9, h + 0.92, 8);
  }
}

/* A stack of cardboard boxes, or crates. */
function boxes(L, d, u, v, h, m = 'sfCardboard') {
  let top = h;
  const n = d.int(1, 3);
  for (let k = 0; k < n; k += 1) {
    const a = d.range(0.22, 0.32);
    const b = d.range(0.18, 0.28);
    const t = d.range(0.25, 0.4);
    const j = d.range(-0.05, 0.05);
    L.deco(m, u - a + j, v - b, top, u + a + j, v + b, top + t);
    top += t;
  }
}

/* A pallet, or a stack of them. */
function pallets(L, u, v, h, n) {
  for (let k = 0; k < n; k += 1) {
    const b = h + k * 0.15;
    for (const a of [-0.5, 0, 0.5]) {
      L.deco('sfRoofBrown', u - 0.6, v + a - 0.05, b, u + 0.6, v + a + 0.05, b + 0.11);
    }
    L.deco('sfWood', u - 0.6, v - 0.5, b + 0.11, u + 0.6, v + 0.5, b + 0.15);
  }
}

/* A sawhorse barrier in stripes, along u. */
function barrier(L, u, v, h) {
  L.deco('sfTrim', u - 0.9, v - 0.04, h + 0.75, u + 0.9, v + 0.04, h + 1.0);
  for (const a of [-0.6, 0, 0.6]) {
    L.paint('sfOrange', u + a - 0.15, v - 0.05, h + 0.76, u + a + 0.15, v + 0.05, h + 0.99);
  }
  for (const a of [-0.75, 0.75]) {
    L.cyl('sfTrim', [u + a, v - 0.3, h], [u + a, v, h + 0.9], 0.025, 3);
    L.cyl('sfTrim', [u + a, v + 0.3, h], [u + a, v, h + 0.9], 0.025, 3);
  }
}

/* A bird on the ground: a pigeon, a gull, a duck. `s` is the way it looks
 * along u. */
function bird(L, u, v, h, s, body, head, beak) {
  L.bead(body, u, v, h + 0.1, 0.1);
  L.bead(head, u + s * 0.1, v, h + 0.19, 0.055);
  if (beak) {
    L.bead(beak, u + s * 0.16, v, h + 0.18, 0.025);
  }
}

/* A bike rack's hoop, its plane across the rack's line along u. */
function hoop(L, u, v, h) {
  L.ring('sfSteel', u, v, h + 0.2, 0.42, 0.03, 1, 0, 3, 12);
}

/* ------------------------------------------------------------------ */
/* A shop's dressing                                                   */
/* ------------------------------------------------------------------ */

/*
 * Everything ./downtown.js shop() knows about a shop, as s: its lot's
 * frame, the body's corners and height, the glass front and the door,
 * the air handler on the roof, whether it has an awning, sells food or
 * has windows free for posters, and what on its roof and along its front
 * is somebody else's (the donut, the pin, the barber's pole). Out front,
 * a board on the pavement and, for food, tables; in the windows, posters;
 * on the roof, the kit a flat roof gathers; out back, the yard behind any
 * shop.
 */
export function dressShop(T, s) {
  const { L, u0, u1, v0, v1, h, g0, g1, du } = s;
  const d = rng(s.seed * 7 + 1);
  const free = (u, v, r) => {
    const [px, py] = L.at(u, v);
    return clearOf(T.taken, px, py, r);
  };
  const take = (u, v, r) => {
    const [px, py] = L.at(u, v);
    T.take(px, py, r);
  };
  const front = (u, r) => Math.abs(u - du) > 1.0 + r && s.frontKeep.every(([a, b]) => u + r < a || u - r > b);

  /* OUT FRONT: a board on the pavement, and tables for food. */
  for (let k = 0; k < 8; k += 1) {
    const u = d.range(u0 + 1, u1 - 1);
    if (front(u, 0.45) && free(u, -1.2, 0.6)) {
      aBoard(L, u, -1.2, KERB, d.pick(['sfIron', 'sfTrim', 'sfIron']));
      take(u, -1.2, 0.5);
      break;
    }
  }
  if (s.food && s.name !== 'donut shop') {
    let n = 0;
    for (let k = 0; k < 10 && n < 2; k += 1) {
      const u = d.range(u0 + 1.4, u1 - 1.4);
      if (front(u, 1.1) && free(u, -1.75, 1.3)) {
        cafeTable(L, d, u, -1.75, KERB, s.name === 'pizza' ? 'sfDoorGreen' : 'sfRed');
        take(u, -1.75, 1.2);
        n += 1;
      }
    }
  }

  /* IN THE WINDOWS: a poster or two between the mullions. */
  if (s.posters) {
    const panes = Math.max(2, Math.round((g1 - g0) / 2.4));
    const step = (g1 - g0) / panes;
    for (let k = 0; k < panes; k += 1) {
      const u = g0 + (k + 0.5) * step;
      if (front(u, 0.4) && d.chance(0.55)) {
        T.wide(() => poster(L, d, u + d.range(-0.25, 0.25), v0, d.range(0.95, 1.25)));
      }
    }
  }

  /* ON THE ROOF. */
  if (s.roof) {
    const hr = h + 0.07;
    const keep = [rect(s.ru - 1.1, s.ru + 1.1, s.rv - 0.9, s.rv + 0.9), { u: u0 + 1.2, v: v1 - 1.5, r: 0.45 }];
    for (const [a, b, c, e] of s.roofKeep) {
      keep.push(rect(a, b, c, e));
    }
    const zone = { u0: u0 + 0.6, u1: u1 - 0.6, v0: v0 + 0.6, v1: v1 - 0.6 };
    if (s.tar) {
      for (let u = u0 + 2.2; u < u1 - 1.2; u += 2.2) {
        L.paint('sfJoint', u - 0.03, v0 + 0.4, hr, u + 0.03, v1 - 0.4, hr + 0.004);
      }
    }
    /* The handler's conduit to the back edge and down the wall. */
    if (clearOf(keep, s.ru, (s.rv + v1) / 2 + 0.45, 0.15)) {
      L.cyl('sfSteel', [s.ru, s.rv + 0.7, hr + 0.4], [s.ru, v1 - 0.3, hr + 0.4], 0.07, 5);
      L.cyl('sfSteel', [s.ru, v1 - 0.3, hr + 0.4], [s.ru, v1 + 0.12, hr + 0.4], 0.07, 5);
      if (Math.abs(s.ru - (u0 + u1) / 2) > 1.0 && Math.abs(s.ru - (u1 - 1.7)) > 1.2) {
        L.cyl('sfSteel', [s.ru, v1 + 0.12, hr + 0.4], [s.ru, v1 + 0.12, 2.6], 0.07, 5);
      }
      keep.push(rect(s.ru - 0.2, s.ru + 0.2, s.rv, v1));
    }
    const area = (u1 - u0) * (v1 - v0);
    const want = [['sky', d.int(1, area > 500 ? 3 : 2)], ['vent', d.int(2, 4)], ['cond', d.int(1, 2)], ['hatch', 1], ['dish', d.chance(0.45) ? 1 : 0], ['junk', d.chance(0.35) ? 1 : 0]];
    for (const [kind, n] of want) {
      const r = { sky: 0.8, vent: 0.3, cond: 0.6, hatch: 0.6, dish: 0.5, junk: 0.5 }[kind];
      for (let k = 0; k < n; k += 1) {
        const at = spot(keep, d, zone, r);
        if (!at) {
          continue;
        }
        const [u, v] = at;
        if (kind === 'sky') {
          L.deco('sfSteel', u - 0.6, v - 0.45, hr, u + 0.6, v + 0.45, hr + 0.22);
          L.prismAlong('sfSky', [[v - 0.42, hr + 0.22], [v + 0.42, hr + 0.22], [v, hr + 0.5]], u - 0.57, u + 0.57);
        } else if (kind === 'vent') {
          L.cyl('sfSteel', [u, v, hr], [u, v, hr + 0.45], 0.1, 6);
          L.cone('sfSteel', u, v, hr + 0.45, 0.22, 0.18, 6);
        } else if (kind === 'cond') {
          L.deco('sfIron', u - 0.47, v - 0.47, hr, u + 0.47, v + 0.47, hr + 0.08);
          L.deco('sfSteel', u - 0.45, v - 0.45, hr + 0.08, u + 0.45, v + 0.45, hr + 0.8);
          L.disc('sfIron', u, v, 0.33, hr + 0.8, hr + 0.83, 10);
        } else if (kind === 'hatch') {
          L.deco('sfSteel', u - 0.45, v - 0.45, hr, u + 0.45, v + 0.45, hr + 0.4);
          L.deco('sfIron', u - 0.5, v - 0.5, hr + 0.4, u + 0.5, v + 0.5, hr + 0.46);
        } else if (kind === 'dish') {
          L.cyl('sfIron', [u, v, hr], [u, v, hr + 0.75], 0.03, 4);
          L.cyl('sfTrim', [u, v, hr + 0.72], [u, v - 0.14, hr + 0.95], 0.05, 10, 0.42);
          L.cyl('sfIron', [u, v - 0.1, hr + 0.85], [u, v - 0.55, hr + 1.12], 0.015, 3);
        } else {
          chair(L, u, v, hr, d.pick(['u-', 'u+', 'v-', 'v+']), d.pick(['sfTrim', 'sfDoorGreen']));
          L.cyl('sfRed', [u + 0.45, v + 0.2, hr], [u + 0.45, v + 0.2, hr + 0.3], 0.13, 7, 0.16);
        }
      }
    }
  }

  /* OUT BACK: the downpipes, a step and a lamp at the door, a lid on the
   * dumpster and sacks by it, a meter box, and what a back yard keeps. */
  const mid = (u0 + u1) / 2;
  for (const u of [u0 + 0.22, u1 - 0.22]) {
    L.cyl('sfSteel', [u, v1 + 0.1, 0], [u, v1 + 0.1, h], 0.06, 5);
  }
  L.deco('sfConcrete', mid - 0.75, v1, 0, mid + 0.75, v1 + 0.7, 0.14);
  L.deco('sfIron', mid - 0.07, v1, 2.35, mid + 0.07, v1 + 0.28, 2.45);
  L.bead('sfButter', mid, v1 + 0.3, 2.33, 0.1);
  L.deco('sfIron', u1 - 2.66, v1 + 0.34, 1.3, u1 - 0.74, v1 + 1.56, 1.36);
  L.deco('sfSteel', u0 + 1.4, v1, 1.2, u0 + 2.0, v1 + 0.18, 1.85);
  L.cyl('sfSteel', [u0 + 1.7, v1 + 0.06, 1.85], [u0 + 1.7, v1 + 0.06, h], 0.03, 4);
  const back = [rect(mid - 0.95, mid + 0.95, v1, v1 + 1.3), rect(u1 - 2.8, u1 - 0.6, v1 + 0.2, v1 + 1.7), rect(u0, u0 + 2.2, v1, v1 + 0.5)];
  const yard = { u0: u0 + 0.4, u1: u1 - 0.4, v0: v1 + 0.3, v1: v1 + 2.6 };
  for (let k = d.int(1, 2); k > 0; k -= 1) {
    const at = spot(back, d, { u0: u1 - 4.2, u1: u1 - 2.6, v0: v1 + 0.3, v1: v1 + 1.6 }, 0.35);
    if (at) {
      sack(L, d, at[0], at[1], 0);
    }
  }
  const things = s.food ? ['boxes', 'crates', 'drum', 'drum', 'pallet'] : ['boxes', 'boxes', 'crates', 'drum', 'pallet'];
  for (let k = d.int(2, 4); k > 0; k -= 1) {
    const kind = d.pick(things);
    const at = spot(back, d, yard, kind === 'pallet' ? 0.8 : 0.45);
    if (!at) {
      continue;
    }
    const [u, v] = at;
    if (kind === 'boxes') {
      boxes(L, d, u, v, 0);
    } else if (kind === 'crates') {
      boxes(L, d, u, v, 0, 'sfWood');
    } else if (kind === 'drum') {
      drum(L, d, u, v, 0, d.chance(0.25));
    } else {
      pallets(L, u, v, 0, d.int(1, 4));
    }
  }
  /* A ladder up the back of the taller ones. */
  if (h > 5.5) {
    const u = u0 + 3.2;
    for (const a of [-0.22, 0.22]) {
      L.cyl('sfIron', [u + a, v1 + 0.2, 0.4], [u + a, v1 + 0.2, h + 0.9], 0.025, 4);
    }
    for (let hh = 0.7; hh < h + 0.7; hh += 0.32) {
      L.deco('sfIron', u - 0.22, v1 + 0.18, hh, u + 0.22, v1 + 0.22, hh + 0.03);
    }
  }
}

/* A pavement board, an A frame in a wooden frame, its faces to the street
 * and the shop. */
function aBoard(L, u, v, h, m) {
  L.prismAlong('sfWood', [[v - 0.3, h], [v + 0.3, h], [v, h + 0.9]], u - 0.3, u + 0.3);
  L.prismAlong(m, [[v - 0.315, h + 0.08], [v + 0.315, h + 0.08], [v, h + 0.93]], u - 0.25, u + 0.25);
}

/* A café table on the pavement, two chairs and a parasol. */
function cafeTable(L, d, u, v, h, m) {
  table(L, u, v, h, 0.4, 'sfTrim');
  chair(L, u - 0.65, v, h, 'u-', m);
  chair(L, u + 0.65, v, h, 'u+', m);
  L.cyl('sfSteel', [u, v, h + 0.74], [u, v, h + 2.25], 0.025, 4);
  L.cone(d.pick(['sfRed', 'sfTeal', 'sfYellow', m]), u, v, h + 1.92, 1.0, 0.42, 8);
}

/* A poster in a shop window: a white sheet and a colour on it. */
function poster(L, d, u, v0, h) {
  const w = d.range(0.45, 0.7) / 2;
  const t = d.range(0.6, 0.9);
  L.paint('sfTrim', u - w, v0 - 0.05, h, u + w, v0 - 0.04, h + t);
  L.paint(d.pick(['sfRed', 'sfYellow', 'sfOrange', 'sfTeal', 'sfPink', 'sfSky']), u - w + 0.05, v0 - 0.056, h + 0.05, u + w - 0.05, v0 - 0.05, h + t * 0.62);
}

/* ------------------------------------------------------------------ */
/* The town's dressing                                                 */
/* ------------------------------------------------------------------ */

/* Main Street's kerbs, north and south. */
const MNK = MAIN_Y + HALF;
const MSK = MAIN_Y - HALF;

/* Where two streets meet, and the dead ends' ends: no patch in the road
 * within fourteen metres, where the crossings and stop lines are. */
const JUNCTIONS = [
  [OAK_X, MAIN_Y], [PINE_X, MAIN_Y], [MILL_X, MAIN_Y], [PLANT_X, MAIN_Y], [OAK_X, MAPLE_Y], [PINE_X, MAPLE_Y],
  [OAK_X, BIRCH_Y], [BULB.px, BULB.py], [OAK_X, OAK_END], [MILL_X, MILL_END], [PLANT_X, PLANT_END],
];

/* Eight ways round, for what stands in a ring: cos and sin of k/8 turns. */
const OCT = [[1, 0], [0.7071067811865476, 0.7071067811865476], [0, 1], [-0.7071067811865476, 0.7071067811865476],
  [-1, 0], [-0.7071067811865476, -0.7071067811865476], [0, -1], [0.7071067811865476, -0.7071067811865476]];

/* Squared distance, exact. */
const far2 = (ax, ay, bx, by, r) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by) >= r * r;

/*
 * THE KERBS: a concrete edge along every pavement where it meets a road,
 * standing a few millimetres proud of the pavement and the kerb's face.
 * Drawn on High and Medium at every range, not as set dressing: a kerb
 * runs the length of a street, and a line that long switching on at a
 * cell's edge would be seen to.
 */
function kerbs(T) {
  const inRoad = (px, py) => ROADS.some(([x0, y0, x1, y1]) => px > x0 && px < x1 && py > y0 && py < y1);
  const o = { solid: false, cast: false, fine: true };
  for (const [x0, y0, x1, y1] of WALKS) {
    if (x1 - x0 >= y1 - y0) {
      const m = (x0 + x1) / 2;
      if (inRoad(m, y0 - 0.5)) {
        T.box('sfConcrete', x0 + 0.005, y0 - 0.012, 0, x1 - 0.005, y0 + 0.2, KERB + 0.006, o);
      }
      if (inRoad(m, y1 + 0.5)) {
        T.box('sfConcrete', x0 + 0.005, y1 - 0.2, 0, x1 - 0.005, y1 + 0.012, KERB + 0.006, o);
      }
    } else {
      const m = (y0 + y1) / 2;
      if (inRoad(x0 - 0.5, m)) {
        T.box('sfConcrete', x0 - 0.012, y0 + 0.005, 0, x0 + 0.2, y1 - 0.005, KERB + 0.006, o);
      }
      if (inRoad(x1 + 0.5, m)) {
        T.box('sfConcrete', x1 - 0.2, y0 + 0.005, 0, x1 + 0.012, y1 - 0.005, KERB + 0.006, o);
      }
    }
  }
}

/* The joints across the pavements, a slab apart. */
function joints(P) {
  for (const [x0, y0, x1, y1] of WALKS) {
    const alongX = x1 - x0 >= y1 - y0;
    const [a0, a1] = alongX ? [x0, x1] : [y0, y1];
    const n = Math.floor((a1 - a0) / 1.8);
    for (let k = 1; k < n; k += 1) {
      const a = a0 + (k * (a1 - a0)) / n;
      if (alongX) {
        P.paint('sfJoint', a - 0.025, y0 + 0.25, KERB, a + 0.025, y1 - 0.25, KERB + 0.005);
      } else {
        P.paint('sfJoint', x0 + 0.25, a - 0.025, KERB, x1 - 0.25, a + 0.025, KERB + 0.005);
      }
    }
  }
}

/* Patches and tar seams in the roads, off the middle line, away from the
 * junctions and the manholes. */
function patches(P, d) {
  const holeY = (px) => MAIN_Y + (px % 2 ? 2.1 : -2.1);
  for (const [x0, y0, x1, y1] of ROADS) {
    const alongX = x1 - x0 >= y1 - y0;
    const [a0, a1] = alongX ? [x0, x1] : [y0, y1];
    const mid = alongX ? (y0 + y1) / 2 : (x0 + x1) / 2;
    const n = Math.round((a1 - a0) / 11);
    for (let k = 0; k < n; k += 1) {
      const a = d.range(a0 + 3, a1 - 3);
      const half = d.range(0.4, 1.4);
      const w = d.range(0.3, 0.8);
      const b = mid + (d.chance(0.5) ? 1 : -1) * d.range(0.7 + w, HALF - 0.5 - w);
      const crack = d.chance(0.45);
      const cb = mid + (d.chance(0.5) ? 1 : -1) * d.range(0.8, HALF - 0.6);
      const clen = d.range(1.2, 3.2);
      const [px, py] = alongX ? [a, b] : [b, a];
      if (!JUNCTIONS.every(([jx, jy]) => far2(px, py, jx, jy, 14))) {
        continue;
      }
      if (y0 === MSK && MANHOLES.some((mx) => Math.abs(a - mx) < half + 2 && Math.abs(b - holeY(mx)) < w + 1)) {
        continue;
      }
      if (alongX) {
        P.paint('sfPatch', a - half, b - w, ROAD_H, a + half, b + w, ROAD_H + 0.004);
        if (crack) {
          P.paint('sfPatch', a + half + 1, cb - 0.03, ROAD_H, a + half + 1 + clen, cb + 0.03, ROAD_H + 0.004);
        }
      } else {
        P.paint('sfPatch', b - w, a - half, ROAD_H, b + w, a + half, ROAD_H + 0.004);
        if (crack && a + half + 1 + clen < a1 - 1) {
          P.paint('sfPatch', cb - 0.03, a + half + 1, ROAD_H, cb + 0.03, a + half + 1 + clen, ROAD_H + 0.004);
        }
      }
    }
  }
}

/* Three newspaper boxes in a row along u, their windows to the street on
 * the side `toStreet` (+1 or -1) of v. */
function newsBoxes(L, u, v, h, toStreet) {
  ['sfRed', 'sfYellow', 'sfSky'].forEach((m, k) => {
    const x = u + k * 0.56;
    L.deco('sfIron', x - 0.05, v - 0.05, h, x + 0.05, v + 0.05, h + 0.45);
    L.deco(m, x - 0.25, v - 0.21, h + 0.45, x + 0.25, v + 0.21, h + 1.05 + k * 0.04);
    L.paint('sfRoofSlate', x - 0.18, v + toStreet * 0.21, h + 0.72, x + 0.18, v + toStreet * 0.22, h + 0.98);
  });
}

/* A phone booth of steel and glass, open to the street on -v. */
function phoneBooth(L, u, v, h) {
  for (const [a, b] of [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]]) {
    L.deco('sfSteel', u + a - 0.04, v + b - 0.04, h, u + a + 0.04, v + b + 0.04, h + 2.2);
  }
  L.deco('sfSteel', u - 0.5, v - 0.5, h + 2.2, u + 0.5, v + 0.5, h + 2.42);
  L.paint('sfDoorNavy', u - 0.51, v - 0.51, h + 2.24, u + 0.51, v + 0.51, h + 2.36);
  L.paint('sfSky', u - 0.42, v + 0.41, h + 0.12, u + 0.42, v + 0.44, h + 2.12);
  L.paint('sfSky', u - 0.44, v - 0.42, h + 0.12, u - 0.41, v + 0.42, h + 2.12);
  L.paint('sfSky', u + 0.41, v - 0.42, h + 0.12, u + 0.44, v + 0.42, h + 2.12);
  L.deco('sfIron', u - 0.15, v + 0.28, h + 1.2, u + 0.15, v + 0.4, h + 1.62);
  L.deco('sfSteel', u - 0.3, v + 0.12, h + 0.95, u + 0.3, v + 0.4, h + 1.0);
  L.cyl('sfIron', [u + 0.1, v + 0.27, h + 1.45], [u + 0.1, v + 0.27, h + 1.05], 0.012, 3);
}

/* A utility cabinet, long along u or across it. */
function cabinet(L, u, v, h, alongU) {
  const [a, b] = alongU ? [0.45, 0.22] : [0.22, 0.45];
  L.deco('sfDoorGreen', u - a, v - b, h, u + a, v + b, h + 1.15);
  L.deco('sfIron', u - a - 0.03, v - b - 0.03, h + 1.15, u + a + 0.03, v + b + 0.03, h + 1.2);
  if (alongU) {
    L.paint('sfHazard', u - 0.1, v - b - 0.01, h + 0.8, u + 0.1, v + b + 0.01, h + 1.0);
  } else {
    L.paint('sfHazard', u - a - 0.01, v - 0.1, h + 0.8, u + a + 0.01, v + 0.1, h + 1.0);
  }
}

/*
 * MAIN STREET: meters along the kerb in front of the shops and the hall,
 * planters between them, newspaper boxes at two corners, a phone booth by
 * the square; on the side streets, a cabinet by a pole or two, roadworks
 * on Birch Lane and a hopscotch on Maple's pavement.
 */
function streetDressing(T, P, d) {
  for (const [a, b, y] of [[58, 148, MNK + 0.45], [188, 228, MNK + 0.45], [246, 300, MNK + 0.45], [56, 150, MSK - 0.45]]) {
    for (let x = a + 2; x < b - 1; x += 6.5) {
      const u = x + d.range(-0.4, 0.4);
      if (clearOf(T.taken, u, y, 0.6)) {
        meter(P, u, y, KERB);
        T.take(u, y, 0.3);
      }
    }
    for (let k = 0; k < 3; k += 1) {
      const u = d.range(a + 2, b - 2);
      const v = y > MAIN_Y ? y + 0.1 : y - 0.1;
      if (clearOf(T.taken, u, v, 0.95)) {
        planter(P, d, u, v, KERB, true, d.pick(['sfWood', 'sfStone', 'sfConcrete']));
        T.take(u, v, 0.8);
      }
    }
  }
  newsBoxes(P, 59.2, MSK - WALK + 0.55, KERB, 1);
  T.take(59.8, MSK - WALK + 0.55, 1.1);
  newsBoxes(P, 181.6, MNK + WALK - 0.55, KERB, -1);
  T.take(182.2, MNK + WALK - 0.55, 1.1);
  phoneBooth(P, 149.3, MNK + WALK - 0.62, KERB);
  T.take(149.3, MNK + WALK - 0.62, 0.8);

  for (const [u, v, alongU] of [[43.0, 44, false], [302.9, 71, false], [150, 31.0, true], [120, 79.0, true], [OAK_X + HALF + 2.5, 160, false]]) {
    if (clearOf(T.taken, u, v, 0.7)) {
      cabinet(P, u, v, KERB, alongU);
      T.take(u, v, 0.6);
    }
  }

  /* The roadworks on Birch Lane: a trench, its spoil, a shovel in it,
   * cones round it and a barrier on the traffic's side. */
  const rx = 178;
  const ry = 83.3;
  P.paint('sfDirt', rx - 2, ry - 0.9, ROAD_H, rx + 2, ry + 0.9, ROAD_H + 0.005);
  P.paint('sfIron', rx - 1.6, ry - 0.5, ROAD_H, rx + 1.6, ry + 0.5, ROAD_H + 0.006);
  P.cone('sfDirt', rx + 3.4, ry, ROAD_H, 0.95, 0.65, 7);
  P.cyl('sfWood', [rx + 3.3, ry + 0.1, 0.4], [rx + 3.0, ry + 0.25, 1.4], 0.025, 3);
  P.deco('sfSteel', rx + 3.22, ry + 0.02, 0.2, rx + 3.42, ry + 0.2, 0.45);
  for (const [a, b] of [[-2.6, -1.4], [-2.6, 1.6], [0, 2.0], [2.6, 1.6], [4.8, 1.2], [4.8, -1.2]]) {
    cone(P, rx + a, ry + b, ROAD_H);
  }
  barrier(P, rx, ry + 2.3, ROAD_H);

  /* A hopscotch in chalk, and a sun beside it. */
  const hx = 110;
  const hy = MAPLE_Y + HALF + 1.5;
  const chalk = ['sfYellow', 'sfPink', 'sfSky'];
  [1, 1, 2, 1, 2, 1].forEach((n, k) => {
    const x = hx + k * 0.6;
    for (let j = 0; j < n; j += 1) {
      const y = n === 1 ? hy : hy + (j ? 0.27 : -0.27);
      P.paint(chalk[(k + j) % 3], x, y - 0.24, KERB + 0.004, x + 0.5, y + 0.24, KERB + 0.007);
    }
  });
  P.disc('sfYellow', hx + 4.6, hy, 0.38, KERB + 0.004, KERB + 0.007, 10);
}

/* THE GAS STATION: stains under the pumps, bollards at the islands' ends,
 * squeegee buckets and bins on them, an ice chest, a propane cage and a
 * vending machine at the shop, lines for the spaces in front of it. */
function gasDressing(T, P, d) {
  const { cx0, cx1, cy0, cy1 } = GAS;
  const ys = [(cy0 + cy1) / 2 - 2.6, (cy0 + cy1) / 2 + 2.6];
  for (const x of [cx0 + 9, cx1 - 9]) {
    for (const y of [(cy0 + cy1) / 2, cy0 + 1.5, cy1 - 1.5]) {
      P.disc('sfPatch', x + d.range(-0.8, 0.8), y + d.range(-0.3, 0.3), d.range(0.35, 0.7), 0.03, 0.034, 9);
    }
  }
  for (const y of ys) {
    for (const x of [cx0 + 3.6, cx1 - 3.6]) {
      P.cyl('sfHazard', [x, y, 0], [x, y, 0.95], 0.11, 6);
      P.disc('sfIron', x, y, 0.12, 0.95, 0.98, 6);
    }
    const bx = (cx0 + cx1) / 2;
    P.cyl('sfDoorGreen', [bx - 1.2, y, 0.2], [bx - 1.2, y, 0.52], 0.15, 7, 0.18);
    P.cyl('sfIron', [bx - 1.2, y, 0.5], [bx - 1.1, y, 1.05], 0.015, 3);
    trashCanAt(P, bx + 1.2, y, 0.2);
  }
  const ky = 156;
  /* The spaces in front of the shop. */
  T.wide(() => {
    for (let x = 13.5; x < 33; x += 3) {
      P.paint('sfPaint', x - 0.05, ky - 2.4, 0.025, x + 0.05, ky - 0.4, 0.029);
    }
  });
  /* The ice chest and the propane cage by the door, the vending machine
   * round the side. */
  P.deco('sfTrim', 11.0, ky - 1.0, 0.025, 12.7, ky - 0.05, 1.05);
  P.paint('sfSky', 11.05, ky - 1.01, 0.55, 12.65, ky - 0.04, 0.85);
  P.deco('sfSteel', 33.9, ky - 1.2, 0.025, 35.9, ky - 0.05, 0.08);
  for (const [a, b] of [[33.95, ky - 1.15], [35.85, ky - 1.15], [33.95, ky - 0.1], [35.85, ky - 0.1]]) {
    P.deco('sfSteel', a - 0.03, b - 0.03, 0.08, a + 0.03, b + 0.03, 1.6);
  }
  P.deco('sfSteel', 33.9, ky - 1.2, 1.6, 35.9, ky - 0.05, 1.65);
  for (let k = 0; k < 6; k += 1) {
    P.cyl('sfTrim', [34.25 + (k % 3) * 0.55, ky - 0.85 + Math.floor(k / 3) * 0.5, 0.08], [34.25 + (k % 3) * 0.55, ky - 0.85 + Math.floor(k / 3) * 0.5, 0.55], 0.15, 6);
  }
  P.deco('sfRed', GAS.x1 - 6, 159.6, 0.025, GAS.x1 - 5.2, 160.6, 1.85);
  P.paint('sfSky', GAS.x1 - 5.21, 159.75, 0.9, GAS.x1 - 5.19, 160.3, 1.7);
}

/* A wheelie bin or a can, standing at h. */
function trashCanAt(L, u, v, h) {
  L.cyl('sfSteel', [u, v, h], [u, v, h + 0.75], 0.24, 8, 0.26);
  L.cyl('sfSteel', [u, v, h + 0.75], [u, v, h + 0.82], 0.29, 8, 0.27);
}

/* THE SQUARE: pigeons, a hot dog cart, lamps, flowers round the trees in
 * the planters, a bike rack by the street. */
function squareDressing(T, P, d) {
  const Q = SQUARE;
  const keep = [...T.taken, { u: 157, v: 162, r: 3.4 }, { u: PADS.px, v: PADS.py, r: 5.5 }, { u: 177, v: 164, r: 0.6 }];
  const planters = [[152.5, 143], [181.5, 143], [152.5, 168.2], [181.5, 168.2]];
  for (const [x, y] of planters) {
    keep.push({ u: x, v: y, r: 1.7 });
    for (const [c, s] of OCT) {
      P.bead(d.chance(0.3) ? 'sfHedge' : d.pick(FLOWERS), x + c * 0.85, y + s * 0.85, 0.7, d.range(0.1, 0.15));
    }
  }
  /* The cart, its umbrella and its bottles. */
  const cx = 176.5;
  const cy = 137.6;
  P.deco('sfTrim', cx - 0.75, cy - 0.4, 0.35, cx + 0.75, cy + 0.4, 1.0);
  P.paint('sfRed', cx - 0.76, cy - 0.41, 0.55, cx + 0.76, cy + 0.41, 0.75);
  P.deco('sfSteel', cx - 0.8, cy - 0.45, 1.0, cx + 0.8, cy + 0.45, 1.04);
  for (const a of [-0.45, 0.45]) {
    P.cyl('sfIron', [cx + a, cy - 0.5, 0.25], [cx + a, cy + 0.5, 0.25], 0.22, 10);
  }
  P.cyl('sfSteel', [cx - 0.75, cy, 0.95], [cx - 1.15, cy, 1.0], 0.02, 3);
  P.cyl('sfSteel', [cx, cy, 1.04], [cx, cy, 2.3], 0.025, 4);
  P.cone('sfYellow', cx, cy, 1.95, 1.15, 0.45, 8);
  P.bead('sfRed', cx + 0.4, cy - 0.2, 1.15, 0.06);
  P.bead('sfYellow', cx + 0.55, cy - 0.2, 1.15, 0.06);
  keep.push({ u: cx, v: cy, r: 1.5 });
  /* Lamps round the pads, and by the north benches. */
  for (const [x, y] of [[155.5, 150], [178.5, 150], [161, 168.6], [173, 168.6]]) {
    parkLamp(P, x, y, 0.03, 3.4);
    keep.push({ u: x, v: y, r: 0.4 });
  }
  /* The bike rack, a bike left by it. */
  for (let k = 0; k < 4; k += 1) {
    hoop(P, 159.5 + k * 0.9, Q.y0 + 2.6, 0.03);
  }
  bike(P, d, 164.6, Q.y0 + 3.2);
  keep.push(rect(158.8, 165.4, Q.y0 + 2, Q.y0 + 3.6));
  /* Pigeons on the flags and on the fountain's rim. */
  for (let k = 0; k < 12; k += 1) {
    const at = spot(keep, d, { u0: Q.x0 + 1, u1: Q.x1 - 1, v0: Q.y0 + 1, v1: Q.y1 - 1 }, 0.25);
    if (at) {
      bird(P, at[0], at[1], 0.03, d.chance(0.5) ? 1 : -1, 'sfStone', 'sfRoofSlate', null);
    }
  }
  for (const [c, s] of [OCT[0], OCT[3], OCT[6]]) {
    bird(P, 157 + c * 3.05, 162 + s * 3.05, 0.7, s > 0 ? 1 : -1, 'sfStone', 'sfRoofSlate', null);
  }
}

/* THE SCHOOL: mullions and transoms in its windows, a bike rack and
 * sunflowers along its south wall, bins by the door; on the playground a
 * hopscotch, the court's lines, backboards and rims, picnic tables. */
function schoolDressing(T, P, d) {
  const S = SCHOOL;
  const b0 = (S.y0 + S.y1) / 2 - S.bw / 2;
  const b1 = (S.y0 + S.y1) / 2 + S.bw / 2;
  T.wide(() => {
    for (let x = S.x0 + 2; x < S.x1 - 1.5; x += 3) {
      for (const h of [1.2, 4.9]) {
        for (const [y0, y1] of [[S.y0 - 0.07, S.y0 - 0.05], [S.y1 + 0.05, S.y1 + 0.07]]) {
          P.paint('sfTrim', x - 0.04, y0, h, x + 0.04, y1, h + 1.8);
          P.paint('sfTrim', x - 1.0, y0, h + 1.24, x + 1.0, y1, h + 1.3);
        }
      }
    }
    for (let y = S.y0 + 2; y < S.y1 - 1.5; y += 3) {
      if (y > b0 - 1.2 && y < b1 + 1.2) {
        continue;
      }
      for (const h of [1.2, 4.9]) {
        P.paint('sfTrim', S.x0 - 0.07, y - 0.04, h, S.x0 - 0.05, y + 0.04, h + 1.8);
      }
    }
  });
  /* The bike rack and two bikes. */
  for (let k = 0; k < 6; k += 1) {
    hoop(P, 84 + k * 0.9, S.y0 - 2.6, 0);
  }
  parkedBike(P, d, 85.1, S.y0 - 2.6);
  parkedBike(P, d, 87.8, S.y0 - 2.6);
  bike(P, d, 90.8, S.y0 - 3.4);
  /* Sunflowers along the wall. */
  for (let x = 96; x < S.x1 - 0.5; x += 0.9) {
    const t = d.range(1.4, 1.9);
    const y = S.y0 - 0.6 + d.range(-0.1, 0.1);
    P.cyl('sfHedge', [x, y, 0], [x, y, t], 0.025, 3);
    P.bead('sfHedge', x + 0.08, y, t * 0.5, 0.08);
    P.cyl('sfYellow', [x, y + 0.03, t], [x, y - 0.03, t + 0.05], 0.2, 8);
    P.cyl('sfRoofBrown', [x, y - 0.03, t + 0.05], [x, y - 0.05, t + 0.06], 0.09, 6);
  }
  trashCanAt(P, S.x0 - 1.7, b0 - 2.9, 0);
  trashCanAt(P, S.x0 - 1.7, b1 + 2.9, 0);
  /* The hopscotch on the breezeway's concrete. */
  const chalk = ['sfYellow', 'sfPink', 'sfSky', 'sfTrim'];
  [1, 1, 2, 1, 2, 1, 1].forEach((n, k) => {
    const x = S.x1 + 0.6 + k * 0.6;
    for (let j = 0; j < n; j += 1) {
      const y = n === 1 ? (b0 + b1) / 2 : (b0 + b1) / 2 + (j ? 0.27 : -0.27);
      P.paint(chalk[(k + j) % 4], x, y - 0.24, 0.03, x + 0.5, y + 0.24, 0.034);
    }
  });
  /* The court: its edges, the half court line and circle, the keys and
   * their circles; a board and a rim on each post. */
  const c0 = S.x1 + 3;
  const c1 = S.x1 + 15;
  const e0 = S.y0 + 1;
  const e1 = S.y0 + 13;
  const cm = (c0 + c1) / 2;
  const line = (x0, y0, x1, y1) => P.paint('sfPaint', x0, y0, 0.03, x1, y1, 0.034);
  T.wide(() => {
    line(c0, e0, c1, e0 + 0.08);
    line(c0, e1 - 0.08, c1, e1);
    line(c0, e0, c0 + 0.08, e1);
    line(c1 - 0.08, e0, c1, e1);
    line(c0, (e0 + e1) / 2 - 0.04, c1, (e0 + e1) / 2 + 0.04);
    P.ring('sfPaint', cm, (e0 + e1) / 2, 0.03, 1.5, 0.03, 0, 0, 3, 20);
    for (const [y, s] of [[e0, 1], [e1, -1]]) {
      const ky = y + s * 3.6;
      line(cm - 1.8, Math.min(y, ky), cm - 1.72, Math.max(y, ky));
      line(cm + 1.72, Math.min(y, ky), cm + 1.8, Math.max(y, ky));
      line(cm - 1.8, ky - 0.04, cm + 1.8, ky + 0.04);
      P.ring('sfPaint', cm, ky, 0.03, 1.2, 0.03, 0, 0, 3, 16);
    }
  });
  for (const [y, s] of [[e0, 1], [e1, -1]]) {
    const py = y + s * 0.5;
    P.deco('sfSteel', cm - 0.05, Math.min(py, py + s * 0.3), 2.95, cm + 0.05, Math.max(py, py + s * 0.3), 3.05);
    P.deco('sfTrim', cm - 0.9, py + s * 0.3 - 0.03, 2.85, cm + 0.9, py + s * 0.3 + 0.03, 3.9);
    P.paint('sfRed', cm - 0.3, py + s * 0.33 - 0.005, 3.1, cm + 0.3, py + s * 0.33 + 0.005, 3.5);
    P.ring('sfOrange', cm, py + s * 0.6, 3.08, 0.23, 0.02, 0, 0, 3, 12);
  }
  /* The picnic tables, on the dirt past the court. */
  picnicTable(P, c1 + 5, e0 + 2.5, 0.02, true);
  picnicTable(P, c1 + 5, e0 + 7.5, 0.02, true);
}

/* THE CHURCH: a path from the door to Oak Street, shrubs under its south
 * windows, pots at the door, plots and flowers at the graves, benches. */
function churchDressing(T, P, d) {
  const C = CHURCH;
  T.wide(() => {
    P.paint('sfWalk', C.tx - 0.8, C.y0 - 3.4, 0, C.tx + 0.8, C.y0, 0.025);
    P.paint('sfWalk', C.tx + 0.8, C.y0 - 3.4, 0, OAK_X - HALF - WALK, C.y0 - 2.0, 0.025);
  });
  pot(P, d, C.tx - 1.7, C.y0 - 0.5, 0);
  pot(P, d, C.tx + 1.7, C.y0 - 0.5, 0);
  for (const [a, b] of [[C.x0 + 1, C.tx - 3.5], [C.tx + 3.5, C.x1 - 0.5]]) {
    for (let x = a; x < b; x += 1.6) {
      const r = d.range(0.42, 0.6);
      bush(P, x + d.range(-0.2, 0.2), C.y0 + 2.4, r);
    }
  }
  for (let x = C.x0 + 3; x < C.x1 - 2; x += 3.2) {
    if (!d.chance(0.75)) {
      continue;
    }
    P.deco('sfStone', x - 0.45, C.y1 + 2.8, 0, x + 0.45, C.y1 + 4.8, 0.12);
    P.paint(d.chance(0.5) ? 'sfLawn' : 'sfDirt', x - 0.36, C.y1 + 2.9, 0.12, x + 0.36, C.y1 + 4.7, 0.13);
    for (let k = 0; k < 3; k += 1) {
      P.bead(d.pick(FLOWERS), x - 0.15 + k * 0.15, C.y1 + 3.0, 0.2, 0.07);
    }
  }
  seat(P, C.x0 + 8, C.y0 - 1.8, 0, true, 1);
  seat(P, C.x1 - 6, C.y0 - 1.2, 0, true, 1);
}

/* A round bush sitting on the ground. */
function bush(L, u, v, r, h = 0) {
  L.bead('sfHedge', u, v, h + r * 0.75, r);
}

/* THE TOWN HALL: lamps and urns at its steps, clipped hedges across its
 * lawn, mullions in its windows, a bike rack. */
function civicDressing(T, P, d) {
  const H = CIVIC;
  const cx = (H.x0 + H.x1) / 2;
  for (const s of [-1, 1]) {
    parkLamp(P, cx + s * 10.4, H.y0 - 2.9, 0, 3.6);
    const ux = cx + s * 10.4;
    const uy = H.y0 - 0.9;
    P.cyl('sfStone', [ux, uy, 0], [ux, uy, 0.5], 0.3, 8, 0.2);
    P.cyl('sfStone', [ux, uy, 0.5], [ux, uy, 0.95], 0.18, 8, 0.36);
    P.bead('sfHedge', ux, uy, 1.1, 0.3);
    P.bead(d.pick(FLOWERS), ux + 0.15, uy - 0.15, 1.3, 0.1);
    P.bead(d.pick(FLOWERS), ux - 0.15, uy + 0.1, 1.32, 0.1);
  }
  T.wide(() => {
    for (const [a, b] of [[H.x0 + 1, cx - 11.5], [cx + 11.5, H.x1 - 1]]) {
      const n = Math.max(1, Math.round((b - a) / 4.6));
      const w = (b - a) / n;
      for (let k = 0; k < n; k += 1) {
        P.deco('sfHedge', a + k * w + 0.15, H.y0 - 3.0, 0, a + (k + 1) * w - 0.15, H.y0 - 2.2, 0.75);
      }
    }
    for (let x = H.x0 + 2.5; x < H.x1 - 2; x += 3.5) {
      if (Math.abs(x - cx) < 9.5) {
        continue;
      }
      for (const h of [2.0, 6.0]) {
        P.paint('sfTrim', x - 0.04, H.y0 - 0.07, h, x + 0.04, H.y0 - 0.05, h + 2.2);
        P.paint('sfTrim', x - 0.7, H.y0 - 0.07, h + 1.5, x + 0.7, H.y0 - 0.05, h + 1.56);
      }
    }
  });
  for (let k = 0; k < 4; k += 1) {
    hoop(P, H.x1 - 12 + k * 0.9, H.y0 - 4.6, 0);
  }
}

/* THE BOWLING ALLEY and THE FIRE STATION, out front: planters, a bench
 * under the wing, bins; a dalmatian asleep by the door, the old bell on
 * its frame, a hose reel on the wall, a bench. */
function frontsDressing(T, P, d) {
  const B = BOWL;
  for (const u of [4, 8, 32, 36]) {
    planter(P, d, B.x0 + u, B.y0 - 1.5, 0, true, 'sfPurple');
  }
  seat(P, B.x0 + 20, B.y0 - 0.9, 0, true, 1, 'sfLilac');
  trashCanAt(P, B.x0 + 10.5, B.y0 - 1.2, 0);
  trashCanAt(P, B.x0 + 29.5, B.y0 - 1.2, 0);
  const F = T.shops.find((s) => s.name === 'fire station');
  if (F) {
    const [fx, fy] = F.L.at(0, 0);
    const y = fy - 0.8;
    /* The dog, curled on the pavement by the door. */
    const dx = fx + 30.6;
    P.cyl('sfTrim', [dx - 0.35, y, KERB + 0.17], [dx + 0.3, y, KERB + 0.17], 0.15, 7);
    P.bead('sfTrim', dx + 0.42, y - 0.05, KERB + 0.22, 0.12);
    P.bead('sfIron', dx + 0.42, y + 0.07, KERB + 0.3, 0.05);
    P.bead('sfIron', dx + 0.54, y - 0.07, KERB + 0.2, 0.035);
    for (const [a, b] of [[-0.2, 0.12], [0.05, -0.13], [0.2, 0.1], [-0.05, 0.14]]) {
      P.bead('sfIron', dx + a, y + b, KERB + 0.24, 0.045);
    }
    P.cyl('sfTrim', [dx - 0.35, y, KERB + 0.15], [dx - 0.6, y + 0.25, KERB + 0.05], 0.03, 4);
    /* The bell. */
    const bx = fx + 26.5;
    for (const a of [-0.45, 0.45]) {
      P.cyl('sfIron', [bx + a, y, KERB], [bx + a, y, KERB + 1.6], 0.04, 4);
    }
    P.cyl('sfIron', [bx - 0.5, y, KERB + 1.6], [bx + 0.5, y, KERB + 1.6], 0.04, 4);
    P.cyl('sfYellow', [bx, y, KERB + 1.55], [bx, y, KERB + 1.05], 0.12, 10, 0.3);
    P.bead('sfYellow', bx, y, KERB + 1.0, 0.06);
    /* The hose reel on the wall, and the bench. */
    P.ring('sfRed', fx + 25.2, fy + 0.18, 1.6, 0.35, 0.08, 0, -1, 4, 14);
    P.cyl('sfRed', [fx + 25.2, fy + 0.3, 1.6], [fx + 25.2, fy + 0.12, 1.6], 0.18, 8);
    seat(P, fx + 35.8, y + 0.2, KERB, true, 1);
  }
}

/*
 * THE PLANT: lines and wheel stops in the car park, a lunch bench with a
 * box of donuts on it and a drinks machine by the control room door, pipes
 * and valves and boxes down the hall's south wall, vents on its roof,
 * ladders and a walkway on the tanks, a forklift and pallets, and cones
 * round the glowing puddle.
 */
function plantDressing(T, P, d) {
  const g = 0.02;
  T.wide(() => {
    for (let k = 0; k <= 10; k += 1) {
      const x = 303 + k * 2.6;
      P.paint('sfPaint', x - 0.05, 158.3, g, x + 0.05, 163.3, g + 0.004);
      if (k < 10) {
        P.deco('sfConcrete', x + 0.5, 158.45, g, x + 2.1, 158.65, g + 0.12);
      }
    }
  });
  seat(P, 331.5, 164.0, g, true, 1);
  P.deco('sfPink', 330.9, 163.85, g + 0.47, 331.35, 164.2, g + 0.56);
  P.ring('sfGlaze', 331.7, 164.0, g + 0.5, 0.07, 0.035, 0, 0, 4, 10);
  P.deco('sfRed', 337.45, 165.1, g, 338.45, 165.95, 1.85);
  P.paint('sfSky', 337.55, 165.08, 0.9, 338.1, 165.1, 1.7);
  const wy = TURBINES.y0;
  P.cyl('sfSteel', [339, wy - 0.55, 0.9], [370, wy - 0.55, 0.9], 0.15, 8);
  P.cyl('sfSteel', [340, wy - 0.55, 1.45], [369, wy - 0.55, 1.45], 0.1, 6);
  for (const [x, r] of [[339, 0.15], [370, 0.15]]) {
    P.cyl('sfSteel', [x, wy - 0.55, 0.9], [x, wy, 0.9], r, 8);
  }
  for (const x of [340, 369]) {
    P.cyl('sfSteel', [x, wy - 0.55, 1.45], [x, wy, 1.45], 0.1, 6);
  }
  for (let x = 343; x < 369; x += 4) {
    P.deco('sfIron', x - 0.05, wy - 0.7, g, x + 0.05, wy - 0.4, 1.5);
  }
  for (const x of [344.5, 356.5, 364.5]) {
    P.cyl('sfSteel', [x, wy - 0.7, 0.9], [x, wy - 0.8, 0.9], 0.03, 4);
    P.ring('sfRed', x, wy - 0.82, 0.9, 0.18, 0.025, 0, -1, 3, 12);
  }
  for (const [x0, x1, h0, h1] of [[346, 348, 1.9, 2.9], [362, 363.4, 1.8, 2.6]]) {
    P.deco('sfSteel', x0, wy - 0.28, h0, x1, wy, h1);
    P.paint('sfHazard', (x0 + x1) / 2 - 0.2, wy - 0.3, h1 - 0.35, (x0 + x1) / 2 + 0.2, wy - 0.28, h1 - 0.1);
    P.cyl('sfSteel', [(x0 + x1) / 2, wy - 0.14, h1], [(x0 + x1) / 2, wy - 0.14, 5.3], 0.04, 4);
  }
  /* The hall's roof vents. */
  for (let x = TURBINES.x0 + 6; x < TURBINES.x1 - 3; x += 8) {
    for (const y of [TURBINES.y0 + 9, TURBINES.y1 - 9]) {
      P.cyl('sfSteel', [x, y, TURBINES.h + 0.8], [x, y, TURBINES.h + 1.5], 0.4, 8);
      P.cone('sfSteel', x, y, TURBINES.h + 1.5, 0.65, 0.35, 8);
    }
  }
  /* The tanks. */
  for (const [x, y, r, h] of [[316, 210, 4, 10], [327, 210, 4, 10], [338, 206, 2.6, 7]]) {
    const ly = y - r - 0.18;
    for (const a of [-0.22, 0.22]) {
      P.cyl('sfIron', [x + a, ly, 0.3], [x + a, ly, h + 1.1], 0.025, 4);
    }
    for (let hh = 0.6; hh < h + 0.8; hh += 0.3) {
      P.deco('sfIron', x - 0.22, ly - 0.02, hh, x + 0.22, ly + 0.02, hh + 0.03);
    }
    P.ring('sfSteel', x, y, h + 0.05, r + 0.25, 0.1, 0, 0, 3, 24);
    P.ring('sfIron', x, y, h + 1.0, r + 0.3, 0.03, 0, 0, 3, 24);
    for (const [c, s] of OCT) {
      P.cyl('sfIron', [x + c * (r + 0.3), y + s * (r + 0.3), h], [x + c * (r + 0.3), y + s * (r + 0.3), h + 1.0], 0.025, 3);
    }
  }
  /* The forklift, and its pallets. */
  forklift(P, 380, 205.2, g);
  pallets(P, 383.6, 207.2, g, 3);
  pallets(P, 383.6, 209.6, g, 2);
  boxes(P, d, 383.6, 209.6, g + 0.3, 'sfWood');
  drum(P, d, 386.2, 208, g, false);
  drum(P, d, 386.9, 208.7, g, false);
  for (const [x, y] of [[364.6, 212], [366.4, 215.2], [370.6, 215.9], [373.6, 213.6], [366.6, 208.9]]) {
    cone(P, x, y, g);
  }
  barrier(P, 369, 217, g);
}

/* A forklift, its forks toward -v. */
function forklift(L, u, v, h) {
  L.deco('sfYellow', u - 0.55, v - 0.6, h + 0.3, u + 0.55, v + 1.0, h + 1.15);
  L.deco('sfIron', u - 0.5, v + 0.6, h + 1.15, u + 0.5, v + 1.0, h + 1.4);
  for (const a of [-0.5, 0.5]) {
    for (const b of [-0.45, 0.55]) {
      L.cyl('sfIron', [u + a, v + b, h + 1.15], [u + a, v + b, h + 2.1], 0.03, 4);
    }
  }
  L.deco('sfIron', u - 0.55, v - 0.5, h + 2.1, u + 0.55, v + 0.6, h + 2.16);
  L.deco('sfIron', u - 0.25, v + 0.1, h + 1.15, u + 0.25, v + 0.5, h + 1.3);
  L.deco('sfIron', u - 0.25, v + 0.45, h + 1.3, u + 0.25, v + 0.55, h + 1.75);
  for (const a of [-0.35, 0.35]) {
    L.deco('sfIron', u + a - 0.05, v - 0.75, h + 0.1, u + a + 0.05, v - 0.65, h + 2.4);
  }
  L.deco('sfIron', u - 0.4, v - 0.8, h + 0.4, u + 0.4, v - 0.72, h + 0.75);
  for (const a of [-0.25, 0.25]) {
    L.deco('sfSteel', u + a - 0.05, v - 1.85, h + 0.1, u + a + 0.05, v - 0.75, h + 0.15);
  }
  for (const b of [-0.3, 0.75]) {
    L.cyl('sfTyre', [u - 0.62, v + b, h + 0.28], [u + 0.62, v + b, h + 0.28], 0.28, 8);
  }
}

/* THE DUMP: what the heaps left on the flat between them, sacks, white
 * goods, a mattress, a cart, drums, a television, litter, and gulls, some
 * of them on the old bus. */
function dumpDressing(T, P, d) {
  const clear = (x, y, r) => MOUNDS.every((m) => far2(x, y, m.px, m.py, m.r + 1.5 + r))
    && far2(x, y, TYRES.px, TYRES.py, TYRES.r + 1.5 + r)
    && Math.abs(x - OAK_X) > 6 + r
    && !(x > 98 - r && y < 232 + r)
    && !(x > 114 - r && x < 128 + r && y > 226 - r && y < 244 + r)
    && !(x > 16 - r && x < 35 + r && y < 228 + r)
    && !(x > 58 - r && x < 68 + r && y < 223 + r)
    && far2(x, y, DOZER.px, DOZER.py, 5 + r)
    && clearOf(T.taken, x, y, r);
  const zone = { x0: DUMP.x0 + 3, x1: DUMP.x1 - 3, y0: DUMP.y0 + 3, y1: DUMP.y1 - 3 };
  const kinds = ['sacks', 'sacks', 'sacks', 'fridge', 'washer', 'mattress', 'cart', 'drums', 'tv', 'litter', 'litter', 'gulls', 'cones', 'boxes'];
  let placed = 0;
  for (let k = 0; k < 160 && placed < 46; k += 1) {
    const x = d.range(zone.x0, zone.x1);
    const y = d.range(zone.y0, zone.y1);
    const kind = kinds[placed % kinds.length];
    const r = { mattress: 1.2, fridge: 1.0, gulls: 1.4, sacks: 0.9, drums: 0.9, cones: 1.0, litter: 1.2 }[kind] ?? 0.7;
    if (!clear(x, y, r)) {
      continue;
    }
    T.take(x, y, r);
    placed += 1;
    const g = 0.02;
    if (kind === 'sacks') {
      for (let j = d.int(2, 4); j > 0; j -= 1) {
        sack(P, d, x + d.range(-0.6, 0.6), y + d.range(-0.6, 0.6), g);
      }
    } else if (kind === 'fridge') {
      P.deco('sfTrim', x - 0.85, y - 0.36, g, x + 0.85, y + 0.36, g + 0.68);
      P.deco('sfSteel', x - 0.6, y + 0.36, g + 0.2, x + 0.4, y + 0.42, g + 0.26);
    } else if (kind === 'washer') {
      P.deco('sfTrim', x - 0.34, y - 0.34, g, x + 0.34, y + 0.34, g + 0.85);
      P.ring('sfSteel', x, y - 0.36, g + 0.42, 0.2, 0.035, 0, -1, 3, 12);
      P.cyl('sfRoofSlate', [x, y - 0.34, g + 0.42], [x, y - 0.36, g + 0.42], 0.17, 10);
    } else if (kind === 'mattress') {
      P.deco('sfSky', x - 0.95, y - 0.45, g, x + 0.95, y + 0.45, g + 0.2);
      P.paint('sfTrim', x - 0.96, y - 0.15, g + 0.05, x + 0.96, y - 0.05, g + 0.21);
      P.paint('sfRust', x + d.range(-0.5, 0.2), y + 0.05, g + 0.2, x + 0.6, y + 0.35, g + 0.205);
    } else if (kind === 'cart') {
      P.deco('sfSteel', x - 0.45, y - 0.3, g + 0.45, x + 0.45, y + 0.3, g + 0.48);
      for (const [a, b, c, e] of [[-0.45, -0.3, 0.45, -0.28], [-0.45, 0.28, 0.45, 0.3], [-0.45, -0.3, -0.43, 0.3], [0.43, -0.3, 0.45, 0.3]]) {
        P.deco('sfSteel', x + a, y + b, g + 0.48, x + c, y + e, g + 0.95);
      }
      P.cyl('sfRed', [x - 0.5, y - 0.3, g + 1.0], [x - 0.5, y + 0.3, g + 1.0], 0.025, 4);
      for (const [a, b] of [[-0.4, -0.25], [-0.4, 0.25], [0.4, -0.25], [0.4, 0.25]]) {
        P.cyl('sfSteel', [x + a, y + b, g + 0.07], [x + a, y + b, g + 0.45], 0.015, 3);
        P.bead('sfIron', x + a, y + b, g + 0.06, 0.06);
      }
    } else if (kind === 'drums') {
      drum(P, d, x, y, g, false);
      drum(P, d, x + 0.75, y + 0.2, g, d.chance(0.5));
    } else if (kind === 'tv') {
      P.deco('sfIron', x - 0.35, y - 0.25, g, x + 0.35, y + 0.25, g + 0.5);
      P.paint('sfRoofSlate', x - 0.28, y - 0.26, g + 0.08, x + 0.28, y - 0.25, g + 0.42);
    } else if (kind === 'litter') {
      for (let j = 0; j < 6; j += 1) {
        const a = x + d.range(-1, 1);
        const b = y + d.range(-1, 1);
        P.paint(d.pick(['sfTrim', 'sfCardboard', 'sfSky', 'sfTrim']), a, b, g, a + d.range(0.15, 0.35), b + d.range(0.15, 0.3), g + 0.004);
      }
    } else if (kind === 'gulls') {
      for (let j = d.int(3, 5); j > 0; j -= 1) {
        gull(P, d, x + d.range(-1.1, 1.1), y + d.range(-1.1, 1.1), g);
      }
    } else if (kind === 'cones') {
      cone(P, x, y, g);
      cone(P, x + 0.7, y + 0.4, g);
    } else {
      boxes(P, d, x, y, g);
    }
  }
  for (const x of [22.5, 25.8, 29.1]) {
    gull(P, d, x, 223.3, 2.4);
  }
}

/* A gull standing, its wings folded along its back. */
function gull(L, d, u, v, h) {
  const s = d.chance(0.5) ? 1 : -1;
  bird(L, u, v, h + 0.06, s, 'sfTrim', 'sfTrim', 'sfYellow');
  L.deco('sfSteel', u - s * 0.15 - 0.08, v - 0.06, h + 0.18, u - s * 0.15 + 0.08, v + 0.06, h + 0.22);
  L.cyl('sfOrange', [u, v, h], [u, v, h + 0.08], 0.012, 3);
}

/*
 * THE PARK: ducks and ducklings on the pond, lily pads, reeds at its edge,
 * a rowboat tied to the jetty; lamps down the paths, flower beds round
 * the bandstand, a clipped hedge along Main Street, a drinking fountain;
 * in the playground a see-saw, a sandbox and a climbing dome; picnic
 * tables and a grill on the lawn north of the pond.
 */
function parkDressing(T, P, d) {
  const { px, py, r: R } = POND;
  const water = 0.27;
  const island = [px + 4, py + 3];
  const onPond = (lo, hi) => {
    for (let k = 0; k < 20; k += 1) {
      const x = px + d.range(-hi, hi);
      const y = py + d.range(-hi, hi);
      const q = (x - px) * (x - px) + (y - py) * (y - py);
      if (q > lo * lo && q < hi * hi && far2(x, y, island[0], island[1], 3.4) && !(x < px - R + 8 && Math.abs(y - py) < 2.6)) {
        return [x, y];
      }
    }
    return null;
  };
  for (let k = 0; k < 7; k += 1) {
    const at = onPond(4, 12.5);
    if (!at) {
      continue;
    }
    const s = d.chance(0.5) ? 1 : -1;
    const mallard = d.chance(0.5);
    bird(P, at[0], at[1], water - 0.04, s, mallard ? 'sfRoofBrown' : 'sfTrim', mallard ? 'sfDoorGreen' : 'sfTrim', 'sfOrange');
    if (k === 0) {
      for (let j = 1; j <= 3; j += 1) {
        P.bead('sfYellow', at[0] - s * 0.35 * j, at[1] + (j % 2 ? 0.08 : -0.08), water + 0.03, 0.06);
      }
    }
  }
  for (let k = 0; k < 12; k += 1) {
    const at = onPond(10.5, 14.3);
    if (at) {
      P.disc('sfHedge', at[0], at[1], d.range(0.25, 0.45), water, water + 0.006, 8);
      if (d.chance(0.3)) {
        P.bead('sfPink', at[0], at[1], water + 0.05, 0.06);
      }
    }
  }
  for (let k = 0; k < 6; k += 1) {
    const at = onPond(13.6, 14.6);
    if (!at) {
      continue;
    }
    for (let j = 0; j < 6; j += 1) {
      const x = at[0] + d.range(-0.35, 0.35);
      const y = at[1] + d.range(-0.35, 0.35);
      const t = water + d.range(0.6, 1.2);
      P.cyl(d.chance(0.7) ? 'sfHedge' : 'sfDoorGreen', [x, y, water - 0.05], [x, y, t], 0.02, 3);
      if (j < 2) {
        P.cyl('sfRoofBrown', [x, y, t - 0.25], [x, y, t - 0.05], 0.04, 4);
      }
    }
  }
  /* The rowboat, tied up south of the jetty. */
  const bx = px - R + 2.7;
  const by = py - 2.6;
  P.prismAlong('sfRed', [[by - 0.62, water + 0.38], [by - 0.42, water - 0.08], [by + 0.42, water - 0.08], [by + 0.62, water + 0.38]], bx - 1.2, bx + 1.2);
  P.paint('sfWood', bx - 1.1, by - 0.5, water + 0.38, bx + 1.1, by + 0.5, water + 0.39);
  for (const a of [-0.5, 0.5]) {
    P.deco('sfWood', bx + a - 0.15, by - 0.58, water + 0.39, bx + a + 0.15, by + 0.58, water + 0.44);
  }
  P.cyl('sfWood', [bx - 0.4, by - 1.0, water + 0.45], [bx + 0.1, by + 0.9, water + 0.45], 0.025, 3);
  P.cyl('sfWood', [bx - 1.2, by + 0.3, water + 0.38], [px - R + 1, py - 0.9, 1.1], 0.012, 3);
  /* The paths' lamps. */
  const B = BANDSTAND;
  const lamps = [[310, B.py - 2.15], [346, B.py - 2.15], [361, B.py + 2.15], [318, B.py + 2.15],
    [B.px + 2.15, 15], [B.px + 2.15, 45], [B.px - 2.15, 62], [B.px - 2.15, 84], [B.px + 2.15, 108]];
  for (const [x, y] of lamps) {
    if (clearOf(T.taken, x, y, 0.5)) {
      parkLamp(P, x, y, 0.015, 3.2);
      T.take(x, y, 0.4);
    }
  }
  /* The beds round the bandstand. */
  for (const [c, s] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const x = B.px + c * 8;
    const y = B.py + s * 7.5;
    if (!clearOf(T.taken, x, y, 1.7)) {
      continue;
    }
    P.disc('sfDirt', x, y, 1.6, 0.015, 0.05, 12);
    P.ring('sfStone', x, y, 0.05, 1.6, 0.06, 0, 0, 3, 16);
    bush(P, x, y, 0.45, 0.05);
    for (const [oc, os] of OCT) {
      P.bead(d.pick(FLOWERS), x + oc * 1.05, y + os * 1.05, 0.2, 0.13);
    }
    T.take(x, y, 1.7);
  }
  /* The hedge along Main Street, in clipped lengths, broken for the path
   * and the sign. */
  for (const [a, b] of [[313.5, B.px - 2.5], [B.px + 2.5, W - 0.5]]) {
    const n = Math.max(1, Math.round((b - a) / 7));
    const w = (b - a) / n;
    for (let k = 0; k < n; k += 1) {
      P.deco('sfHedge', a + k * w + 0.2, PARK.y1 + 0.3, 0, a + (k + 1) * w - 0.2, PARK.y1 + 1.1, 0.8);
    }
  }
  /* The drinking fountain. */
  const fx = B.px - 2.6;
  const fy = B.py - 3.6;
  P.cyl('sfStone', [fx, fy, 0.015], [fx, fy, 0.85], 0.16, 8, 0.12);
  P.disc('sfStone', fx, fy, 0.28, 0.85, 0.95, 10);
  P.disc('sfTeal', fx, fy, 0.22, 0.85, 0.955, 10);
  P.bead('sfSteel', fx, fy, 1.0, 0.04);
  /* The playground: a see-saw, a sandbox, a climbing dome. */
  P.deco('sfRed', 370.8, 92.3, 0.015, 371.2, 92.7, 0.42);
  P.cyl('sfYellow', [369.2, 92.5, 0.22], [372.8, 92.5, 0.72], 0.07, 4);
  for (const [x, h] of [[369.6, 0.27], [372.4, 0.66]]) {
    P.cyl('sfIron', [x, 92.32, h], [x, 92.32, h + 0.32], 0.015, 3);
    P.cyl('sfIron', [x, 92.68, h], [x, 92.68, h + 0.32], 0.015, 3);
    P.cyl('sfIron', [x, 92.32, h + 0.32], [x, 92.68, h + 0.32], 0.015, 3);
  }
  sandbox(P, 367, 101);
  const dx = 377;
  const dy = 80;
  const prof = [[1.65, 0.015], [1.55, 0.55], [1.3, 1.1], [0.75, 1.55], [0, 1.75]];
  for (let k = 1; k < 4; k += 1) {
    P.ring('sfTeal', dx, dy, prof[k][1], prof[k][0], 0.03, 0, 0, 3, 16);
  }
  for (const [c, s] of OCT) {
    for (let k = 0; k < prof.length - 1; k += 1) {
      const [r0, h0] = prof[k];
      const [r1, h1] = prof[k + 1];
      P.cyl('sfTeal', [dx + c * r0, dy + s * r0, h0], [dx + c * r1, dy + s * r1, h1], 0.03, 3);
    }
  }
  /* The picnic tables and a grill, north of the pond. */
  for (const [x, y] of [[343, 82], [362, 80.5], [345.5, 87.5]]) {
    if (clearOf(T.taken, x, y, 1.5)) {
      picnicTable(P, x, y, 0.015, true);
      T.take(x, y, 1.4);
    }
  }
  if (clearOf(T.taken, 340, 80, 0.5)) {
    P.cyl('sfIron', [340, 80, 0.015], [340, 80, 0.8], 0.05, 4);
    P.deco('sfIron', 339.65, 79.75, 0.8, 340.35, 80.25, 1.05);
    P.paint('sfSteel', 339.7, 79.8, 1.05, 340.3, 80.2, 1.06);
  }
}

/* THE GORGE: logs and stones on its floor, bushes against its walls and
 * along both rims. */
function gorgeDressing(T, P, d) {
  const G = GORGE;
  const lo = -G.depth + 0.03;
  const floor = { u0: G.x0 + 3.5, u1: G.x1 - 3.5, v0: G.y0 + 2, v1: G.y1 - 2 };
  const keep = T.taken.filter((t) => t.u > G.x0 - 1 && t.u < G.x1 + 1);
  for (let k = 0; k < 4; k += 1) {
    const at = spot(keep, d, floor, 1.8);
    if (at) {
      const [x, y] = at;
      const a = d.range(-0.8, 0.8);
      P.cyl('sfRoofBrown', [x - a, y - 1.6, lo + 0.22], [x + a, y + 1.6, lo + 0.22], 0.22, 6);
      P.disc('sfWood', x + a, y + 1.6, 0.2, lo + 0.02, lo + 0.03, 6);
    }
  }
  for (let k = 0; k < 28; k += 1) {
    const r = d.range(0.15, 0.45);
    const at = spot(keep, d, floor, r);
    if (at) {
      P.bead(d.chance(0.5) ? 'sfRock' : 'sfRockDark', at[0], at[1], lo + r * 0.4, r);
    }
  }
  for (let k = 0; k < 10; k += 1) {
    const r = d.range(0.3, 0.5);
    const x = d.chance(0.5) ? G.x0 + 3.5 + r : G.x1 - 3.5 - r;
    const y = d.range(G.y0 + 3, G.y1 - 3);
    if (clearOf(keep, x, y, r)) {
      bush(P, x, y, r, lo);
      keep.push({ u: x, v: y, r });
    }
  }
  for (let y = G.y0 + 1; y < G.y1 - 2; y += d.range(2.2, 4)) {
    if (Math.abs(y - GORGE_BRIDGE.py) < 2.2) {
      continue;
    }
    for (const x of [G.x0 - G.wall - d.range(0.6, 2.2), G.x1 + G.wall + d.range(0.6, 2.2)]) {
      const r = d.range(0.4, 0.7);
      if (clearOf(T.taken, x, y, r)) {
        bush(P, x, y, r);
      }
    }
  }
}

/* THE HILL: a pool behind the house with a board and loungers, beds of
 * flowers along its front, urns at its steps, lamps up the last of the
 * drive. */
function hillDressing(T, P, d) {
  const M = MANSION;
  const h = M.h0;
  const cx = (M.x0 + M.x1) / 2;
  T.wide(() => {
    P.deco('sfTrim', cx - 6.4, M.y1 + 5.1, h, cx + 6.4, M.y1 + 10.9, h + 0.08);
    P.paint('sfWater', cx - 6, M.y1 + 5.5, h + 0.08, cx + 6, M.y1 + 10.5, h + 0.09);
  });
  P.deco('sfSteel', cx - 7.8, M.y1 + 7.7, h, cx - 7.3, M.y1 + 8.3, h + 0.25);
  P.deco('sfTrim', cx - 8.0, M.y1 + 7.6, h + 0.25, cx - 5.4, M.y1 + 8.4, h + 0.32);
  for (const a of [-0.25, 0.25]) {
    P.cyl('sfSteel', [cx + 5.4, M.y1 + 5.5 + a, h + 0.9], [cx + 5.7, M.y1 + 5.5 + a, h + 0.08], 0.025, 4);
  }
  for (const x of [cx - 4, cx, cx + 4]) {
    const m = d.pick(['sfTrim', 'sfTeal', 'sfYellow']);
    P.deco('sfIron', x - 0.3, M.y1 + 12.05, h, x + 0.3, M.y1 + 13.45, h + 0.25);
    P.deco(m, x - 0.32, M.y1 + 12.0, h + 0.25, x + 0.32, M.y1 + 13.5, h + 0.33);
    P.deco(m, x - 0.32, M.y1 + 13.4, h + 0.33, x + 0.32, M.y1 + 13.5, h + 0.85);
    if (d.chance(0.6)) {
      P.paint(d.pick(['sfRed', 'sfSky', 'sfPink']), x - 0.25, M.y1 + 12.3, h + 0.33, x + 0.25, M.y1 + 13.2, h + 0.34);
    }
  }
  for (const x of [cx - 2, cx + 2]) {
    P.cyl('sfSteel', [x, M.y1 + 12.8, h], [x, M.y1 + 12.8, h + 2.3], 0.03, 4);
    P.cone('sfTeal', x, M.y1 + 12.8, h + 1.95, 1.2, 0.45, 8);
  }
  for (const [a, b] of [[M.x0 + 1.2, cx - 6.6], [cx + 6.6, M.x1 - 4.4]]) {
    P.deco('sfBrick', a, M.y0 - 1.4, h, b, M.y0 - 0.4, h + 0.25);
    P.paint('sfDirt', a + 0.08, M.y0 - 1.32, h + 0.25, b - 0.08, M.y0 - 0.48, h + 0.26);
    for (let x = a + 0.35; x < b - 0.2; x += 0.5) {
      P.bead(d.chance(0.35) ? 'sfHedge' : d.pick(FLOWERS), x, M.y0 - 0.9, h + 0.35, d.range(0.12, 0.18));
    }
  }
  for (const s of [-1, 1]) {
    const ux = cx + s * 6.7;
    const uy = M.y0 - 4.0;
    P.cyl('sfStone', [ux, uy, h], [ux, uy, h + 0.5], 0.3, 8, 0.2);
    P.cyl('sfStone', [ux, uy, h + 0.5], [ux, uy, h + 0.95], 0.18, 8, 0.36);
    bush(P, ux, uy, 0.3, h + 0.9);
  }
  for (const x of [MILL_X - 3.7, MILL_X + 3.7]) {
    for (const y of [TIERS[2].y0 + 1.5, TIERS[2].y0 + 6.5]) {
      if (clearOf(T.taken, x, y, 0.5)) {
        parkLamp(P, x, y, h, 2.8);
      }
    }
  }
}

/*
 * ALL OF IT, in the order the furniture is kept: the street's first, so a
 * shop's board keeps off a meter, then the shops, then the rest. Each part
 * rolls from a seed of its own, so changing one moves nothing in another.
 */
export function townDressing(T) {
  const P = lotFrame(T, { x0: 0, x1: W, y0: 0, y1: D, face: 's' });
  kerbs(T);
  T.dress(() => {
    joints(P);
    patches(P, rng(4201));
    streetDressing(T, P, rng(4202));
    for (const s of T.shops) {
      dressShop(T, s);
    }
    gasDressing(T, P, rng(4203));
    squareDressing(T, P, rng(4204));
    schoolDressing(T, P, rng(4205));
    churchDressing(T, P, rng(4206));
    civicDressing(T, P, rng(4207));
    frontsDressing(T, P, rng(4208));
    plantDressing(T, P, rng(4209));
    dumpDressing(T, P, rng(4210));
    parkDressing(T, P, rng(4211));
    gorgeDressing(T, P, rng(4212));
    hillDressing(T, P, rng(4213));
  });
}
