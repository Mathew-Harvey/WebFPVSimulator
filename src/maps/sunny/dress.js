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
 *              chairs or loungers, a washing line, a vegetable bed, and two
 *              or three of a paddling pool, a sandbox, a hoop, a mower, a
 *              wheelbarrow, a compost bin, a woodpile, a bird feeder, a
 *              swingball, the dog's bowl
 *   the town   ./dress.js townDressing, for the streets, the shops, the
 *              plant, the dump, the park, the gorge and the hill
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
  L.disc('sfWater', u, v, 0.28, 0.62, 0.725, 10);
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
  L.ball('sfLamp', u, v, 1.62, 0.13);
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
  L.disc('sfWater', u, v, 0.8, 0, 0.255, 14);
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
      L.deco('sfLamp', u - 0.1, gv0 - 0.14, 2.42, u + 0.1, gv0, 2.66);
    }
    const n = garageW > 5 ? 2 : 1;
    const dw = (garageW - 0.6 * (n + 1)) / n;
    for (let k = 0; k < n; k += 1) {
      const a = gu0 + 0.6 + k * (dw + 0.6);
      for (let w = 0; w < 4; w += 1) {
        const x0 = a + 0.15 + (w * (dw - 0.3)) / 4;
        L.paint('sfGlassDark', x0 + 0.06, gv0 - 0.075, 1.78, x0 + (dw - 0.3) / 4 - 0.06, gv0 - 0.055, 2.08);
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
  /* And two or three of the rest. */
  const small = ['pool', 'sand', 'hoop', 'mower', 'barrow', 'compost', 'feeder', 'swingball', 'gnome', 'ball'];
  const n = d.int(2, 3);
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
    } else {
      L.bead(d.pick(['sfRed', 'sfYellow', 'sfTrim']), u, v, 0.12, 0.12);
    }
  }
  const dog = H.things.find((t) => t.kind === 'dog');
  if (dog) {
    dogBowl(L, dog.u + 0.9, dog.v - 0.7);
  }
}
