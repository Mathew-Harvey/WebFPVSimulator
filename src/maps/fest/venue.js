/*
 * venue.js: Tonbo Fest, the place. Pure: no Three.js, so its solids, its
 * gates and its named gaps load in Node (scripts/fest-check.js) as they do
 * in the browser, and the two cannot disagree about where a wall is.
 *
 * WHAT IT IS. A drone racing festival of our own, on the owner's ask of 31
 * October 2026 (a festival field with inflatable gates, tents and a stage,
 * built in the town's manga look), set where a Japanese club would really
 * hold one: on a KASENJIKI, the flat sports ground between a river and its
 * flood levee that every Japanese city keeps along its rivers, the one
 * every school has its baseball games on and every film has its sunset
 * walk along. Its bones are that kind of place, not any game's map:
 *
 *   - THE RIVER along the south edge, behind a low concrete bank with a
 *     path on it and a water level gauge.
 *   - THE LEVEE along the north edge: a stepped concrete revetment, eight
 *     steps of 0.75 m to a crown road six metres up, which is where the
 *     crowd sits, and the houses' roofs behind it. A SLUICE GATE (a hinmon)
 *     runs through it in a culvert, its gate tower on the field side.
 *   - THE RAILWAY across the east end on a viaduct ten metres up, piers
 *     every twenty six metres, crossing the river on a steel Warren truss.
 *   - A PAIR OF PYLONS carrying a line over the west end, and the ground's
 *     own baseball backstop in the west corner.
 *
 * And the festival on it: the racing arena inside green safety nets (the
 * nets a Japanese sports ground already owns), sixteen gates in it, the
 * inflatable start arch, the pilots' stand and race control on the south
 * side, the pit tents along the river, the main stage at the east end with
 * its inflatable dragonfly on the roof, the big screen for the levee, the
 * food stalls, the entrance under a balloon arch, and the car park under
 * the railway.
 *
 * THE RACE is sixteen gates in one lap, numbered, flown in order: seven
 * inflatable air gates, six MultiGP five foot gates with their pennants, a
 * double stack, a triple stack and a dive gate in a netted chimney. The
 * MultiGP gates are the track builder's own furniture, placed by ./yard.js;
 * everything else is drawn here. Every gate is a named gap (src/game/gaps.js)
 * called after its number, so the counter calls each one as it is flown.
 *
 * THE FRAME is the built map's (src/maps/built/place.js): the plan in
 * metres from the plot's near left corner, x east and y north, h up, and
 * the world's Three.js metres from the plot's middle, Y up. Every point
 * here is written in the plan and converted once, in w(). Anything a quad
 * can hit goes through Parts, so a wall is drawn and solid from the same
 * numbers; a thing turned off the axes is solid as capsules, whose ends
 * are turned with src/props/trig.js's sine and cosine, never the engine's.
 * What is only drawn (a canopy's slope, a tube's bend, a balloon, a wire)
 * is an op for ./index.js.
 *
 * NAMES ARE OUR OWN. Tonbo is a dragonfly. Every team, stall and sign word
 * is made up or is the plain word for the thing; no real brand, event or
 * person is named anywhere on the field.
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

import { Parts } from '../../props/parts.js';
import { sincos } from '../../props/trig.js';

/* The plot, metres. */
export const FIELD_W = 320;
export const FIELD_D = 240;

const DEG = Math.PI / 180;

/* A plan point (x east, y north, h up) as the world's [x, y, z]. */
export function w(x, y, h = 0) {
  return [x - FIELD_W / 2, h, FIELD_D / 2 - y];
}

/*
 * THE CULL CELLS. The structure is filed in twelve chunks, four across and
 * three up, so a view down the arena does not draw the car park behind the
 * railway; and its set dressing in forty eight near cells of its own, which
 * ./index.js switches off by range (Sunnyfield's scheme, ../sunny/frame.js).
 */
export function chunkOf(x, z) {
  const px = x + FIELD_W / 2;
  const py = FIELD_D / 2 - z;
  const c = px < 80 ? 0 : px < 160 ? 1 : px < 240 ? 2 : 3;
  const r = py < 80 ? 0 : py < 160 ? 1 : 2;
  return `fc${c}${r}`;
}

export function nearOf(x, z) {
  const px = x + FIELD_W / 2;
  const py = FIELD_D / 2 - z;
  const c = Math.min(7, Math.max(0, Math.floor(px / 40)));
  const r = Math.min(5, Math.max(0, Math.floor(py / 40)));
  return `fn${c}${r}`;
}

/* A fixed integer hash to [0, 1), so the place is the same every build. */
export function hash(i, salt) {
  let h = Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(salt + 7, 0x85ebca77);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

/* ------------------------------------------------------------------ */
/* Where things are, in the plan                                       */
/* ------------------------------------------------------------------ */

/* The river's water, its bank wall and the path along the bank. */
export const RIVER = { y1: 22, bank: 23.2, path: 27 };

/* The levee: eight steps of `rise` from `y0`, `tread` deep, the crown road
 * at the top, five steps down the back, the lane behind. */
export const LEVEE = { y0: 184, tread: 2, rise: 0.75, steps: 8, crown0: 198, crown1: 208, back: 5, lane0: 218, lane1: 222 };
export const CROWN_H = LEVEE.steps * LEVEE.rise;

/* The sluice: a culvert three metres wide and 2.6 tall through the levee at
 * x 118, its gate tower over the mouth on the field side. */
export const SLUICE = { x0: 116.5, x1: 119.5, top: 2.6, mouth: 186, tower: 188.6 };

/* The railway viaduct, its deck and its piers. */
export const RAIL = {
  x0: 266, x1: 274, deck0: 10, deck1: 11, wall: 12.6,
  piers: [-50, -8, 26, 52, 78, 104, 130, 156, 180, 226],
  truss: { y0: -8, y1: 26, top: 18, panels: 4 },
};

/* The racing arena's safety nets. */
export const ARENA = { x0: 42, x1: 190, y0: 48, y1: 170, h: 3.2, post: 6 };

/* Where the pilot starts, and the inflatable start arch ahead of the pads. */
export const PADS = { x: 52, y: 66, deg: 0 };
export const ARCH = { x: 62, y: 66, half: 6, top: 7, r: 0.6 };

/* The stand the pilots fly from, race control beside it, the timing tower. */
export const STAND = { x0: 84, x1: 104, y0: 38, y1: 45, deck: 2.0, roof: 4.4 };
export const CONTROL = { x0: 108, x1: 114, y0: 38, y1: 44 };

/* The pit tents: eight in a row along the river, three metres square. */
export const PITS = { x0: 128, step: 6.5, n: 8, y0: 30, y1: 33, eave: 2.1, peak: 3.0 };

/* The main stage at the east end of the lawn, facing west. */
export const STAGE = { x0: 232, x1: 244, y0: 88, y1: 104, deck: 1.6, slab: 0.25, roof: 10 };

/* The big screen for the crowd on the levee, facing north. */
export const SCREEN = { x0: 143.5, x1: 156.5, y: 176, h0: 3.6, h1: 10.4 };

/* The food court: a walk north to the levee stairs, stalls each side. */
export const FOOD = { walk0: 223, walk1: 227, y0: 130, y1: 174 };

/* The entrance at the foot of the levee stairs. */
export const GATEWAY = { x: 153, y: 180, half: 4.2, top: 4.8 };

/* The ground's baseball backstop in the west corner. */
export const BACKSTOP = { x: 10, y: 166 };

/*
 * THE RACE'S GATES, in their order: a kind, the middle of the opening's foot
 * in the plan, and the heading it is flown along in whole degrees (east 0,
 * north 90), so a yaw is a product and the same bits everywhere.
 *
 *   air     an inflatable square of our own, ./index.js draws it, two metres
 *           clear, tubes 0.25 m round
 *   flag    the track builder's flagged five foot gate (src/props/course.js)
 *   stack   its double stack, flown through either opening
 *   ladder  its triple stack, flown through any of the three
 *   dive    its dive gate, a horizontal opening 4.57 m up in a netted
 *           chimney, entered from above and left through the chimney's open
 *           north side
 */
export const GATES = [
  { kind: 'air', x: 80, y: 66, deg: 0, colour: 'mxOrange' },
  { kind: 'flag', x: 100, y: 70, deg: 0 },
  { kind: 'air', x: 120, y: 66, deg: 0, colour: 'qbMint' },
  { kind: 'stack', x: 144, y: 70, deg: 0 },
  { kind: 'air', x: 166, y: 84, deg: 45, colour: 'qbSakura' },
  { kind: 'flag', x: 176, y: 106, deg: 90 },
  { kind: 'dive', x: 174, y: 130, deg: 90 },
  { kind: 'air', x: 160, y: 154, deg: 150, colour: 'mxBlue' },
  { kind: 'flag', x: 138, y: 159, deg: 180 },
  { kind: 'ladder', x: 114, y: 158, deg: 180 },
  { kind: 'air', x: 90, y: 152, deg: 200, colour: 'craneYellow' },
  { kind: 'flag', x: 68, y: 140, deg: 250 },
  { kind: 'air', x: 88, y: 120, deg: 0, colour: 'mxOrange' },
  { kind: 'flag', x: 116, y: 112, deg: 0 },
  { kind: 'air', x: 120, y: 96, deg: 180, colour: 'qbMint' },
  { kind: 'flag', x: 92, y: 88, deg: 180 },
];

/* The turn markers: a race flag at each hairpin, flown round. */
export const TURN_FLAGS = [
  { x: 60, y: 126 }, { x: 142, y: 104 }, { x: 54, y: 80 },
];

/* The air gate's clear opening and tube. */
export const AIR = { clear: 2.0, r: 0.25 };

/* The five foot gate's clear opening (src/trackbuilder/elements.js). */
export const FT = 0.3048;
export const MGP = 5 * FT;
export const MGP_PITCH = 5 * FT + 0.0334;
export const DIVE = { sill: 4.572, clearW: 2.1336, clearH: 1.8288, pitch: 1.862201 };

/* How far inside an opening a gap's rectangle stands, each side and over
 * the sill: more than the craft's radius (CRAFT_WORLD_R in
 * src/game/collide.js, 0.17 m), so a pass the counter scores is one the
 * craft fits. Bardwell's house's number. */
const MARGIN = 0.25;

/* ------------------------------------------------------------------ */
/* The builder                                                         */
/* ------------------------------------------------------------------ */

/*
 * Everything is added in plan terms. Boxes and capsules are Parts in the
 * world frame (solid unless they say so); the rest is `ops`, drawn only,
 * which ./index.js turns into geometry. `fine` marks detail the Low preset
 * leaves out and `near` marks set dressing drawn only near the camera;
 * neither is ever solid, so the flight is the same on every preset.
 */
class Venue {
  constructor() {
    this.P = new Parts();
    this.ops = [];
    this.signs = [];
    this.gaps = [];
    this.wires = [];
    this.fans = [];
  }

  /* A box, solid unless opts.solid is false. */
  box(m, x0, y0, h0, x1, y1, h1, opts = {}) {
    const a = w(x0, y0, h0);
    const b = w(x1, y1, h1);
    const p = this.P.box(m, a[0], a[1], a[2], b[0], b[1], b[2], opts);
    if (p && opts.fine) {
      p.fine = true;
    }
    if (p && opts.near) {
      p.near = true;
      p.fine = true;
    }
    return p;
  }

  /* Drawn only: paint, cloth, trim. */
  deco(m, x0, y0, h0, x1, y1, h1, opts = {}) {
    return this.box(m, x0, y0, h0, x1, y1, h1, { ...opts, solid: false });
  }

  /* Set dressing: drawn only, near only, never on Low. */
  dress(m, x0, y0, h0, x1, y1, h1) {
    return this.box(m, x0, y0, h0, x1, y1, h1, { solid: false, near: true, cast: false });
  }

  /* Paint on the ground, a few centimetres proud of the grass. */
  paint(m, x0, y0, x1, y1, h = 0.03) {
    return this.box(m, x0, y0, 0, x1, y1, h, { solid: false, cast: false });
  }

  /* A capsule between two plan points with heights. */
  cap(m, a, b, r, opts = {}) {
    const p = this.P.cap(m, w(a[0], a[1], a[2]), w(b[0], b[1], b[2]), r, opts);
    if (p && opts.fine) {
      p.fine = true;
    }
    if (p && opts.near) {
      p.near = true;
      p.fine = true;
    }
    return p;
  }

  post(m, x, y, h0, h1, r, opts = {}) {
    return this.cap(m, [x, y, h0], [x, y, h1], r, opts);
  }

  op(o) {
    this.ops.push(o);
    return o;
  }

  /*
   * A painted plate from the sign atlas (./signs.js). `face` is 'n', 's',
   * 'e', 'w' or 'up', or a heading in degrees the plate faces along; the
   * plate is centred at (x, y, h), `wd` wide and `ht` tall, `lift` out from
   * whatever it hangs on. `back` paints the same picture on the other face.
   */
  sign(key, x, y, h, face, wd, ht, lift = 0.03, opts = {}) {
    this.signs.push({ key, x, y, h, face, w: wd, ht, lift, fine: Boolean(opts.fine) });
    if (opts.back) {
      const back = typeof face === 'number' ? face + 180 : { n: 's', s: 'n', e: 'w', w: 'e' }[face];
      this.signs.push({ key, x, y, h, face: back, w: wd, ht, lift, fine: Boolean(opts.fine) });
    }
  }

  /*
   * A named gap: the foot of its window's middle in the plan, the heading
   * it is flown along in whole degrees, its clear width, the bottom of its
   * window and its height, all already inside the opening.
   */
  gap(name, x, y, deg, width, z, height, points) {
    this.gaps.push({ name, x, y, deg, w: width, z, h: height, points });
  }

  /* A cable between two plan points with heights, hanging `sag`. */
  wire(a, b, sag) {
    this.wires.push({ a, b, sag });
  }

  /* A person: standing, sitting (on whatever is at h), or cheering. */
  fan(x, y, h, shirt, opts = {}) {
    this.fans.push({ x, y, h, shirt, sit: Boolean(opts.sit), cheer: Boolean(opts.cheer), goggles: Boolean(opts.goggles), face: opts.face ?? 0 });
  }
}

/* A point `d` metres along heading `deg` and `s` metres to its left. */
const SC = { s: 0, c: 1 };
function along(x, y, deg, d, s = 0) {
  sincos(deg * DEG, SC);
  return [x + SC.c * d - SC.s * s, y + SC.s * d + SC.c * s];
}

/* ------------------------------------------------------------------ */
/* The ground: the river, the bank, the paths, the ball field          */
/* ------------------------------------------------------------------ */

function ground(V) {
  /* The water runs out past the plot both ways and off the south edge,
   * so the river does not stop where the plot does. */
  V.paint('fsWater', -80, -90, FIELD_W + 80, RIVER.y1, 0.04);
  /* Ripples, the comic's white strokes on the water, near only. */
  for (let i = 0; i < 70; i += 1) {
    const x = -20 + hash(i, 1) * (FIELD_W + 40);
    const y = -30 + hash(i, 2) * 50;
    const len = 1.5 + hash(i, 3) * 4;
    V.box('fsRipple', x, y, 0.04, x + len, y + 0.12, 0.06, { solid: false, fine: true, cast: false });
  }
  /* The bank: a low concrete wall with a coping, then the path. */
  V.box('concrete', -10, RIVER.y1, 0, FIELD_W + 10, RIVER.bank, 0.8, { name: 'bank' });
  V.deco('concreteMid', -10, RIVER.y1 - 0.05, 0.8, FIELD_W + 10, RIVER.bank + 0.05, 0.9);
  V.paint('concreteMid', 0, RIVER.bank, FIELD_W, RIVER.path, 0.03);
  /* The water level gauge on the bank, and the river's warning boards. */
  V.post('metal', 40, RIVER.y1 + 0.3, 0, 3.4, 0.05);
  V.sign('gauge', 40, RIVER.y1 + 0.25, 1.9, 's', 0.36, 2.6, 0.06);
  for (const x of [20, 200, 250]) {
    V.post('metal', x, RIVER.bank + 0.4, 0, 2.6, 0.04);
    V.post('metal', x + 1.0, RIVER.bank + 0.4, 0, 2.6, 0.04);
    V.sign('warn', x + 0.5, RIVER.bank + 0.45, 1.9, 'n', 0.9, 1.4, 0.03);
  }
  /* The gravel walks: along the arena's south side to the pits, up the
   * east side to the food court, and the walk to the levee stairs. */
  V.paint('fsGravel', 40, 46, 192, 48, 0.02);
  V.paint('fsGravel', 192, 46, 196, 178, 0.02);
  V.paint('fsGravel', FOOD.walk0, FOOD.y0, FOOD.walk1, LEVEE.y0, 0.02);
  V.paint('fsGravel', 140, 172, 223, 182, 0.02);
  V.paint('fsGravel', 116, 34, 128, 46, 0.02);
  /* The baseball diamond's skin, its bases, the mound and the box lines:
   * the ground's own field, not the festival's. Turned, so drawn as an op. */
  V.op({ t: 'obox', m: 'fsDirt', c: [24, 150, 0], size: [26, 26, 0.035], deg: 45 });
  V.op({ t: 'obox', m: 'fsGrass2', c: [24, 150, 0], size: [17, 17, 0.045], deg: 45 });
  const home = [BACKSTOP.x + 5.5, BACKSTOP.y - 7.5];
  for (const [dx, dy] of [[0, 0], [12.9, 0], [12.9, -12.9], [0, -12.9]]) {
    const p = along(home[0], home[1], -45, dx, dy);
    V.op({ t: 'obox', m: 'white', c: [p[0], p[1], 0.03], size: [0.4, 0.4, 0.05], deg: 45 });
  }
  V.op({ t: 'blob', m: 'fsDirt', c: [24, 150, 0], r: 1.8, ry: 0.25, fine: true });
  /* The start's chequered line, across the straight at the arch. */
  for (let i = 0; i < 12; i += 1) {
    for (let r = 0; r < 2; r += 1) {
      const y = ARCH.y - 6 + i;
      V.paint((i + r) % 2 ? 'white' : 'drToriiBlack', ARCH.x + 1 + r * 0.5, y, ARCH.x + 1.5 + r * 0.5, y + 1, 0.035);
    }
  }
}

/* ------------------------------------------------------------------ */
/* The levee, its crown road, the sluice                               */
/* ------------------------------------------------------------------ */

/* A column of the levee from y0 to y1 at height top, cut round the
 * culvert where it runs through. */
function leveeColumn(V, m, y0, y1, top) {
  const solid = { name: 'levee', kind: 'wall' };
  V.box(m, -10, y0, 0, SLUICE.x0, y1, top, solid);
  V.box(m, SLUICE.x1, y0, 0, FIELD_W + 10, y1, top, solid);
  if (top > SLUICE.top && y0 >= SLUICE.mouth + 4 - 1e-9) {
    V.box(m, SLUICE.x0, y0, SLUICE.top, SLUICE.x1, y1, top, solid);
  }
}

function levee(V) {
  const L = LEVEE;
  /* The stepped revetment, step by step, a darker nosing on each. */
  for (let k = 0; k < L.steps; k += 1) {
    const y0 = L.y0 + k * L.tread;
    const top = (k + 1) * L.rise;
    leveeColumn(V, k === L.steps - 1 ? 'concrete' : 'fsLevee', y0, y0 + L.tread, top);
    V.deco('concreteMid', -10, y0 - 0.02, top - 0.08, SLUICE.x0, y0 + 0.12, top + 0.01, { fine: true });
    V.deco('concreteMid', SLUICE.x1, y0 - 0.02, top - 0.08, FIELD_W + 10, y0 + 0.12, top + 0.01, { fine: true });
  }
  /* The crown and its road. */
  leveeColumn(V, 'concrete', L.crown0, L.crown1, CROWN_H);
  V.deco('asphalt', -10, L.crown0 + 1.5, CROWN_H, FIELD_W + 10, L.crown1 - 0.5, CROWN_H + 0.03);
  for (const y of [L.crown0 + 1.75, L.crown1 - 0.75]) {
    V.deco('lineWhite', -10, y, CROWN_H + 0.03, FIELD_W + 10, y + 0.15, CROWN_H + 0.04, { cast: false });
  }
  /* Down the back, a metre a step, to the lane. */
  for (let j = 0; j < L.back; j += 1) {
    const y0 = L.crown1 + j * 2;
    leveeColumn(V, 'fsLevee', y0, y0 + 2, CROWN_H - (j + 1));
  }
  V.paint('asphalt', -10, L.lane0, FIELD_W + 10, L.lane1, 0.03);
  /* The guard rails along the crown's front edge, white posts and two
   * rails, gapped at the entrance stairs, the sluice tower and the bridge. */
  const breaks = [[GATEWAY.x - 3, GATEWAY.x + 3], [SLUICE.x0 - 3, SLUICE.x1 + 3], [RAIL.x0 - 1, RAIL.x1 + 1]];
  const runs = [];
  let from = 0;
  for (const [a, b] of breaks.sort((p, q) => p[0] - q[0])) {
    runs.push([from, a]);
    from = b;
  }
  runs.push([from, FIELD_W]);
  for (const [a, b] of runs) {
    const y = L.crown0 + 0.5;
    for (let x = a; x <= b + 1e-9; x += 4) {
      V.post('white', x, y, CROWN_H, CROWN_H + 0.8, 0.05, { kind: 'pole' });
    }
    V.cap('white', [a, y, CROWN_H + 0.78], [b, y, CROWN_H + 0.78], 0.045);
    V.cap('white', [a, y, CROWN_H + 0.45], [b, y, CROWN_H + 0.45], 0.035);
  }
  /* The festival's banners hung on the rail, facing the field. */
  for (const x of [72, 196]) {
    V.deco('white', x - 7, L.crown0 + 0.42, CROWN_H + 0.85, x + 7, L.crown0 + 0.46, CROWN_H + 2.25);
    V.sign('festBanner', x, L.crown0 + 0.42, CROWN_H + 1.55, 's', 13.6, 1.3, 0.02);
    for (const s of [-7, 7]) {
      V.post('metal', x + s, L.crown0 + 0.5, CROWN_H, CROWN_H + 2.3, 0.04);
    }
  }
  /* A handrail down the stairs at the entrance, each side. */
  for (const s of [-1.6, 1.6]) {
    const x = GATEWAY.x + s;
    V.cap('metal', [x, L.y0 - 0.2, 1.0], [x, L.crown0, CROWN_H + 0.95], 0.035);
    for (let k = 0; k <= L.steps; k += 2) {
      const y = L.y0 + k * L.tread;
      V.post('metal', x, y, k * L.rise, Math.min(CROWN_H, k * L.rise) + 1.0, 0.03);
    }
  }
}

/*
 * THE SLUICE (hinmon): the culvert's mouth on the field side between two
 * concrete piers, the steel gate leaf raised in its slot over the mouth,
 * the machine house across the piers' heads with a ladder up one of them.
 * The culvert itself is the hole leveeColumn leaves; its floor is the
 * ground, its walls the cut faces, its roof the steps above 2.6 m.
 */
function sluice(V) {
  const S = SLUICE;
  const y0 = S.mouth;
  const y1 = S.mouth + 2.6;
  /* The piers and their wing walls. */
  V.box('concrete', S.x0 - 1.0, y0, 0, S.x0, y1, 9.0, { name: 'sluice pier' });
  V.box('concrete', S.x1, y0, 0, S.x1 + 1.0, y1, 9.0, { name: 'sluice pier' });
  V.box('concreteMid', S.x0 - 3.2, y0 - 2.5, 0, S.x0 - 1.0, y0 - 2.2, 1.2, { name: 'wing wall' });
  V.box('concreteMid', S.x1 + 1.0, y0 - 2.5, 0, S.x1 + 3.2, y0 - 2.2, 1.2, { name: 'wing wall' });
  /* The gate leaf, raised, in its slot. */
  V.box('fsSluiceBlue', S.x0, y0 + 1.1, S.top + 0.4, S.x1, y0 + 1.5, 5.6, { name: 'gate leaf' });
  for (let h = S.top + 0.7; h < 5.5; h += 0.6) {
    V.deco('fsSluiceBlueDeep', S.x0, y0 + 1.06, h, S.x1, y0 + 1.1, h + 0.12, { fine: true });
  }
  /* The headwall over the opening, under the leaf's slot. */
  V.box('concrete', S.x0, y0, 5.6, S.x1, y1, 9.0, { name: 'sluice head' });
  V.box('concreteMid', S.x0 - 0.2, y0 - 0.15, S.top, S.x1 + 0.2, y0, S.top + 0.35, { name: 'lintel' });
  /* The machine house on top, its walkway and rail, its plate. */
  V.box('fsSluiceHouse', S.x0 - 1.2, y0 - 0.2, 9.0, S.x1 + 1.2, y1 + 0.2, 11.6, { name: 'machine house' });
  V.box('fsSluiceBlue', S.x0 - 1.5, y0 - 0.5, 11.6, S.x1 + 1.5, y1 + 0.5, 11.9, { name: 'machine roof' });
  V.deco('glassBlue', S.x0 + 0.3, y0 - 0.23, 9.9, S.x1 - 0.3, y0 - 0.2, 10.9);
  V.sign('sluice', (S.x0 + S.x1) / 2, y0 - 0.22, 10.4, 's', 2.6, 0.75, 0.04);
  V.box('grating', S.x0 - 1.2, y0 - 1.4, 9.0, S.x1 + 1.2, y0 - 0.2, 9.1, { name: 'walkway' });
  V.cap('metal', [S.x0 - 1.2, y0 - 1.35, 10.1], [S.x1 + 1.2, y0 - 1.35, 10.1], 0.03);
  V.op({ t: 'ladder', m: 'metal', a: [S.x1 + 1.05, y0 + 1.0, 0], b: [S.x1 + 1.05, y0 + 1.0, 9.0] });
  /* The gauge on the west pier, and a bare bulb over the mouth. */
  V.sign('gauge', S.x0 - 1.03, y0 + 1.3, 2.4, 'w', 0.3, 2.2, 0.02, { fine: true });
  V.op({ t: 'ball', m: 'lampGlow', c: [(S.x0 + S.x1) / 2, y0 - 0.25, 3.3], r: 0.12, fine: true });
  /* The culvert's floor: a concrete channel the whole way through the
   * levee, a thread of water down its middle, and the same apron out on
   * the field side, where the grass would otherwise run in under it. */
  V.paint('concreteMid', S.x0, y0 - 2.4, S.x1, LEVEE.crown1 + LEVEE.back + 0.5, 0.04);
  V.paint('fsWater', S.x0 + 0.9, y0 - 2.4, S.x1 - 0.9, LEVEE.crown1 + LEVEE.back + 0.5, 0.05);
  /* The gap: through the culvert, under the crown road. */
  V.gap('THE SLUICE', (S.x0 + S.x1) / 2, 203, 90, S.x1 - S.x0 - 2 * MARGIN, MARGIN, S.top - 2 * MARGIN, 1000);
}

/* ------------------------------------------------------------------ */
/* The railway                                                         */
/* ------------------------------------------------------------------ */

function railway(V) {
  const R = RAIL;
  const ys = [-90, FIELD_D + 20];
  /* The deck: a box girder, solid, with a darker soffit band. */
  V.box('concrete', R.x0, ys[0], R.deck0, R.x1, ys[1], R.deck1, { name: 'viaduct deck' });
  V.deco('concreteDark', R.x0 - 0.05, ys[0], R.deck0, R.x1 + 0.05, ys[1], R.deck0 + 0.25);
  /* The sound walls over the field, a low parapet over the river. */
  const t0 = R.truss.y1;
  for (const [x0, x1] of [[R.x0, R.x0 + 0.3], [R.x1 - 0.3, R.x1]]) {
    V.box('concrete', x0, t0, R.deck1, x1, ys[1], R.wall, { name: 'sound wall' });
    V.box('concrete', x0, ys[0], R.deck1, x1, t0, R.deck1 + 0.8, { name: 'parapet' });
    V.deco('concreteMid', x0 - 0.04, t0, R.wall - 0.15, x1 + 0.04, ys[1], R.wall);
  }
  /* Two tracks of ballast and rail on the deck. */
  for (const c of [268.3, 271.7]) {
    V.deco('fsBallast', c - 1.3, ys[0], R.deck1, c + 1.3, ys[1], R.deck1 + 0.2);
    for (const s of [-0.53, 0.53]) {
      V.deco('metalDark', c + s - 0.04, ys[0], R.deck1 + 0.2, c + s + 0.04, ys[1], R.deck1 + 0.36, { fine: true });
    }
  }
  /* The piers: two columns and a cross beam, each a rahmen frame. */
  for (const y of R.piers) {
    for (const [x0, x1] of [[266.6, 268.0], [272.0, 273.4]]) {
      V.box('concrete', x0, y - 0.7, 0, x1, y + 0.7, R.deck0, { name: 'pier' });
    }
    V.box('concrete', R.x0, y - 0.9, 8.8, R.x1, y + 0.9, R.deck0, { name: 'pier beam' });
    V.deco('concreteMid', 266.55, y - 0.75, 0, 268.05, y + 0.75, 0.5, { fine: true });
    V.deco('concreteMid', 271.95, y - 0.75, 0, 273.45, y + 0.75, 0.5, { fine: true });
  }
  /* The catenary: a mast on each side every other span, the arm over the
   * tracks, the contact wires along. */
  for (let y = -60; y < FIELD_D + 20; y += 26) {
    for (const [x, arm] of [[R.x0 + 0.5, 1], [R.x1 - 0.5, -1]]) {
      V.post('fsMast', x, y + 13, R.deck1, R.deck1 + 6.2, 0.13);
      V.cap('fsMast', [x, y + 13, R.deck1 + 5.6], [x + arm * 3.0, y + 13, R.deck1 + 5.6], 0.06);
    }
  }
  for (const c of [268.3, 271.7]) {
    V.wire([c, ys[0], R.deck1 + 5.2], [c, ys[1], R.deck1 + 5.2], 0);
    V.wire([c, ys[0], R.deck1 + 5.9], [c, ys[1], R.deck1 + 5.9], 0);
  }
  /*
   * THE TRUSS over the river: a Warren truss each side, bottom nodes on the
   * deck edge every panel, top nodes over the middles, the top chords and
   * the cross bracing between the sides, the portal over each end with its
   * plate. Every member a capsule, solid.
   */
  const T = R.truss;
  const len = (T.y1 - T.y0) / T.panels;
  const r = 0.22;
  for (const x of [R.x0 + 0.15, R.x1 - 0.15]) {
    for (let i = 0; i < T.panels; i += 1) {
      const ya = T.y0 + i * len;
      const yb = ya + len;
      const ym = ya + len / 2;
      V.cap('fsTruss', [x, ya, R.deck1], [x, ym, T.top], r, { name: 'truss' });
      V.cap('fsTruss', [x, ym, T.top], [x, yb, R.deck1], r, { name: 'truss' });
      if (i < T.panels - 1) {
        V.cap('fsTruss', [x, ym, T.top], [x, ym + len, T.top], r, { name: 'truss chord' });
      }
    }
    V.cap('fsTruss', [x, T.y0, R.deck1], [x, T.y1, R.deck1], r, { name: 'truss chord' });
  }
  for (let i = 0; i < T.panels; i += 1) {
    const ym = T.y0 + (i + 0.5) * len;
    V.cap('fsTruss', [R.x0 + 0.15, ym, T.top], [R.x1 - 0.15, ym, T.top], 0.16, { name: 'truss brace' });
  }
  V.sign('bridge', (R.x0 + R.x1) / 2, T.y1 - len / 2, T.top - 0.6, 'n', 2.2, 0.6, 0.25);
  /* The gaps: through a pier's frame, under a span, and the hard one, in
   * through the truss's west face over the river and out the far side. */
  V.gap('THROUGH THE PIER', 270, 104, 0, 4 - 2 * MARGIN, MARGIN, 8.8 - 2 * MARGIN, 250);
  V.gap('UNDER THE RAILWAY', 270, 143, 0, 26 - 1.8 - 2 * MARGIN, MARGIN, 8.8 - 2 * MARGIN, 100);
  const ym = T.y0 + 2.5 * len;
  V.gap('THROUGH THE TRUSS', R.x0 + 0.15, ym, 0, 3.0, R.deck1 + 0.8 + MARGIN, 1.9, 1000);
}

/* ------------------------------------------------------------------ */
/* The arena: nets, the start arch, the gates                          */
/* ------------------------------------------------------------------ */

/* A run of safety net between two plan points, on posts every `step`. */
function netRun(V, a, b, h, step = ARENA.post) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  const n = Math.max(1, Math.round(len / step));
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    V.post('fsNetPost', a[0] + dx * t, a[1] + dy * t, 0, h + 0.15, 0.06, { kind: 'pole' });
  }
  V.cap('fsNetPost', [a[0], a[1], h], [b[0], b[1], h], 0.025);
  /* The net, solid inside its thickness, drawn as one sheet by ./index.js. */
  const t = 0.03;
  if (Math.abs(dy) < 1e-9) {
    V.box('fsNet', Math.min(a[0], b[0]), a[1] - t, 0, Math.max(a[0], b[0]), a[1] + t, h, { draw: false, kind: 'wall', name: 'net', cast: false });
  } else {
    V.box('fsNet', a[0] - t, Math.min(a[1], b[1]), 0, a[0] + t, Math.max(a[1], b[1]), h, { draw: false, kind: 'wall', name: 'net', cast: false });
  }
  V.op({ t: 'net', a, b, h0: 0.02, h1: h });
}

function arena(V) {
  const A = ARENA;
  /* Openings in the nets: the marshals' gate at the pilot stand, the
   * walk in from the food court, and the north gate under the screen. */
  netRun(V, [A.x0, A.y0], [80, A.y0], A.h);
  netRun(V, [86, A.y0], [A.x1, A.y0], A.h);
  netRun(V, [A.x0, A.y1], [140, A.y1], A.h);
  netRun(V, [160, A.y1], [A.x1, A.y1], A.h);
  netRun(V, [A.x0, A.y0], [A.x0, A.y1], A.h);
  netRun(V, [A.x1, A.y0], [A.x1, 98], A.h);
  netRun(V, [A.x1, 104], [A.x1, A.y1], A.h);
  /* The sponsor and festival banners zip tied to the nets, low, facing in
   * and out. The partners' own are hung by ./index.js on BANNERS below. */
  for (const b of FEST_BANNERS) {
    V.deco('white', b.x - 1.6, b.y - 0.05, 0.25, b.x + 1.6, b.y + 0.05, 1.15, { cast: false });
    V.sign(b.key, b.x, b.y, 0.7, b.face, 3.1, 0.82, 0.06, { back: true });
  }
}

/* The festival's own banners on the nets: which picture, where, facing. */
const FEST_BANNERS = [
  { key: 'festBanner', x: 60, y: ARENA.y0, face: 'n' },
  { key: 'clubBanner', x: 120, y: ARENA.y0, face: 'n' },
  { key: 'festBanner', x: 170, y: ARENA.y0, face: 'n' },
  { key: 'clubBanner', x: 70, y: ARENA.y1, face: 's' },
  { key: 'festBanner', x: 110, y: ARENA.y1, face: 's' },
  { key: 'festBanner', x: 180, y: ARENA.y1, face: 's' },
  { key: 'clubBanner', x: ARENA.x0, y: 100, face: 'e' },
  { key: 'festBanner', x: ARENA.x1, y: 130, face: 'w' },
];

/* The partners' banners: the same panel, its face left for the partner's
 * own mark (./index.js, markSpots), in the order the roster gives them. */
export const BANNERS = [
  { x: 76, y: ARENA.y1, face: 's' }, { x: 132, y: ARENA.y0, face: 'n' },
  { x: 92, y: ARENA.y1, face: 's' }, { x: 150, y: ARENA.y0, face: 'n' },
  { x: ARENA.x0, y: 70, face: 'e' }, { x: ARENA.x0, y: 140, face: 'e' },
  { x: ARENA.x1, y: 70, face: 'w' }, { x: ARENA.x1, y: 150, face: 'w' },
  { x: 168, y: ARENA.y1, face: 's' }, { x: 66, y: ARENA.y0, face: 'n' },
];

function partnerBanners(V) {
  for (const b of BANNERS) {
    const along = b.face === 'n' || b.face === 's';
    if (along) {
      V.deco('fsBannerField', b.x - 1.7, b.y - 0.05, 0.2, b.x + 1.7, b.y + 0.05, 1.3, { cast: false });
    } else {
      V.deco('fsBannerField', b.x - 0.05, b.y - 1.7, 0.2, b.x + 0.05, b.y + 1.7, 1.3, { cast: false });
    }
  }
}

/*
 * THE START ARCH: the big inflatable over the start, a half ring of tube
 * 1.2 m thick on two weighted feet, its banner across the top. Solid as
 * capsules round its centre line; ./index.js draws the tube round it.
 */
function startArch(V) {
  const A = ARCH;
  const n = 14;
  const pts = [];
  for (let i = 0; i <= n; i += 1) {
    sincos(Math.PI * (i / n), SC);
    pts.push([A.x, A.y - A.half * SC.c, A.r + (A.top - A.r) * SC.s]);
  }
  pts[0][2] = 0;
  pts[n][2] = 0;
  for (let i = 0; i < n; i += 1) {
    V.cap('fsInflateRed', pts[i], pts[i + 1], A.r, { draw: false, name: 'arch', kind: 'wall' });
  }
  V.op({ t: 'tube', m: 'fsInflateRed', pts, r: A.r, seg: 10, stripe: 'white' });
  /* The weighted feet and the banner over the top. */
  for (const s of [-1, 1]) {
    V.box('fsInflateRed', A.x - 1.2, A.y + s * A.half - 0.9, 0, A.x + 1.2, A.y + s * A.half + 0.9, 0.5, { name: 'arch foot' });
  }
  V.sign('festBanner', A.x + A.r + 0.02, A.y, A.top - 1.4, 'w', 6.4, 1.2, 0.02, { back: true });
  V.deco('white', A.x - 0.02, A.y - 3.3, A.top - 2.05, A.x + 0.02, A.y + 3.3, A.top - 0.75, { cast: false });
  V.gap('START ARCH', A.x, A.y, 0, 2 * (A.half - A.r) - 2.4, MARGIN, A.top - 2.2 - MARGIN, 100);
}

/*
 * AN AIR GATE: an inflatable square, two uprights and a top tube with
 * rounded corners, standing on two short stabiliser tubes along the
 * heading, sandbags on them, its number on the top tube both sides.
 */
function airGate(V, g, n) {
  const half = AIR.clear / 2 + AIR.r;
  const top = AIR.clear + AIR.r;
  const P = (s, h, d = 0) => {
    const p = along(g.x, g.y, g.deg, d, s);
    return [p[0], p[1], h];
  };
  for (const s of [-half, half]) {
    V.cap(g.colour, P(s, 0), P(s, top), AIR.r, { draw: false, name: 'air gate', kind: 'wall' });
    V.cap(g.colour, P(s, 0.18, -0.9), P(s, 0.18, 0.9), 0.18, { draw: false, name: 'air foot', kind: 'wall' });
  }
  V.cap(g.colour, P(-half, top), P(half, top), AIR.r, { draw: false, name: 'air gate', kind: 'wall' });
  /* The drawn tube: up, a rounded corner, across, down. */
  const pts = [P(-half, 0)];
  const k = 0.45;
  pts.push(P(-half, top - k), P(-half + k * 0.3, top - k * 0.3), P(-half + k, top));
  pts.push(P(half - k, top), P(half - k * 0.3, top - k * 0.3), P(half, top - k));
  pts.push(P(half, 0));
  V.op({ t: 'tube', m: g.colour, pts, r: AIR.r, seg: 8, stripe: 'white' });
  for (const s of [-half, half]) {
    V.op({ t: 'tube', m: g.colour, pts: [P(s, 0.18, -0.9), P(s, 0.18, 0.9)], r: 0.18, seg: 8 });
    for (const d of [-0.7, 0.7]) {
      V.op({ t: 'blob', m: 'courseBag', c: [...P(s, 0.38, d)].map((v, i) => (i === 2 ? v : v)), r: 0.22, ry: 0.12, fine: true });
    }
  }
  V.sign(`num${n}`, g.x, g.y, top + AIR.r + 0.36, g.deg + 180, 0.62, 0.62, 0.0, { back: true });
  V.post('white', ...P(0, 0).slice(0, 2), top + AIR.r - 0.05, top + AIR.r + 0.05, 0.02, { solid: false, fine: true });
  V.gap(`GATE ${n}`, g.x, g.y, g.deg, AIR.clear - 2 * MARGIN, MARGIN, AIR.clear - 2 * MARGIN, 100);
}

/* The number on a stake beside a builder gate, facing the approach. */
function numberStake(V, g, n, side) {
  const p = along(g.x, g.y, g.deg, -0.8, side);
  V.post('white', p[0], p[1], 0, 1.3, 0.035);
  V.sign(`num${n}`, p[0], p[1], 1.55, g.deg + 180, 0.5, 0.5, 0.04, { back: true });
}

/*
 * THE DIVE GATE'S CHIMNEY: net walls on three sides of the dive gate's
 * legs, so the only way under the opening is down through it, and out of
 * the chimney's open north side, which is where its named gap is.
 */
function chimney(V, g) {
  const hw = 2.1;
  const h = DIVE.sill - 0.15;
  netRun(V, [g.x - hw, g.y - hw], [g.x + hw, g.y - hw], h, 4.2);
  netRun(V, [g.x - hw, g.y - hw], [g.x - hw, g.y + hw], h, 4.2);
  netRun(V, [g.x + hw, g.y - hw], [g.x + hw, g.y + hw], h, 4.2);
}

function gates(V) {
  GATES.forEach((g, i) => {
    const n = i + 1;
    if (g.kind === 'air') {
      airGate(V, g, n);
      return;
    }
    if (g.kind === 'flag') {
      numberStake(V, g, n, -1.5);
      V.gap(`GATE ${n}`, g.x, g.y, g.deg, MGP - 2 * MARGIN, MARGIN, MGP - 2 * MARGIN, 100);
      return;
    }
    if (g.kind === 'stack' || g.kind === 'ladder') {
      const levels = g.kind === 'stack' ? 2 : 3;
      numberStake(V, g, n, -1.6);
      for (let l = 0; l < levels; l += 1) {
        const name = l === 0 ? `GATE ${n}` : (l === levels - 1 ? `GATE ${n} TOP` : `GATE ${n} MIDDLE`);
        V.gap(name, g.x, g.y, g.deg, MGP - 2 * MARGIN, l * MGP_PITCH + MARGIN, MGP - 2 * MARGIN, l === 0 ? 100 : 250);
      }
      return;
    }
    /* The dive: its gap is the chimney's open side, under the opening. */
    chimney(V, g);
    numberStake(V, { ...g, x: g.x - 2.6 }, n, 0);
    V.gap(`GATE ${n}`, g.x, g.y + 2.1, g.deg, 4.2 - 2 * MARGIN, MARGIN, DIVE.sill - 0.6 - MARGIN, 250);
  });
}

/* ------------------------------------------------------------------ */
/* The pilots' stand, race control, the timing tower                   */
/* ------------------------------------------------------------------ */

/* A pop-up tent: four legs, the roof solid as a slab under its pyramid,
 * the valance printed with `key`, open sided. Its long side along x. */
function popup(V, x0, y0, x1, y1, roof, valance, opts = {}) {
  const eave = opts.eave ?? PITS.eave;
  const peak = opts.peak ?? PITS.peak;
  for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) {
    V.post('metal', x, y, 0, eave, 0.03, { kind: 'pole' });
  }
  V.box(roof, x0 - 0.05, y0 - 0.05, eave, x1 + 0.05, y1 + 0.05, eave + 0.25, { name: 'tent roof', kind: 'wall' });
  V.op({ t: 'pyr', m: roof, x0: x0 - 0.08, y0: y0 - 0.08, x1: x1 + 0.08, y1: y1 + 0.08, h0: eave + 0.25, h1: peak });
  /* The valance, a strip hanging round the eave, printed on its front. */
  V.deco(roof, x0 - 0.08, y0 - 0.1, eave - 0.3, x1 + 0.08, y0 - 0.06, eave + 0.25, { cast: false });
  V.deco(roof, x0 - 0.08, y1 + 0.06, eave - 0.3, x1 + 0.08, y1 + 0.1, eave + 0.25, { cast: false });
  if (valance) {
    V.sign(valance, (x0 + x1) / 2, y1 + 0.1, eave - 0.03, opts.face ?? 'n', (x1 - x0) * 0.9, 0.5, 0.02);
  }
}

/* A folding table with things on it, and the chairs behind it. */
function table(V, x0, y0, x1, y1, base = 0) {
  const h = base + 0.74;
  V.box('white', x0, y0, h - 0.05, x1, y1, h, { name: 'table' });
  for (const [x, y] of [[x0 + 0.1, y0 + 0.1], [x1 - 0.1, y0 + 0.1], [x0 + 0.1, y1 - 0.1], [x1 - 0.1, y1 - 0.1]]) {
    V.dress('metal', x - 0.02, y - 0.02, base, x + 0.02, y + 0.02, h - 0.05);
  }
}

/* A folding chair on whatever is at `b`, its back to the south if
 * `faceN`, to the north if not. */
function chair(V, x, y, faceN, m = 'mxBlue', b = 0) {
  V.dress(m, x - 0.22, y - 0.22, b + 0.43, x + 0.22, y + 0.22, b + 0.47);
  const by = faceN ? y - 0.22 : y + 0.18;
  V.dress(m, x - 0.22, by, b + 0.47, x + 0.22, by + 0.04, b + 0.88);
  V.dress('metal', x - 0.2, y - 0.2, b, x - 0.17, y + 0.2, b + 0.43);
  V.dress('metal', x + 0.17, y - 0.2, b, x + 0.2, y + 0.2, b + 0.43);
}

function stand(V) {
  const S = STAND;
  /* The deck on scaffold, its stairs at the west end, the rail round it. */
  V.box('plywood', S.x0, S.y0, S.deck - 0.15, S.x1, S.y1, S.deck, { name: 'stand deck' });
  V.deco('toeBoard', S.x0, S.y1 - 0.04, S.deck, S.x1, S.y1, S.deck + 0.18);
  for (let x = S.x0; x <= S.x1 + 1e-9; x += 2.5) {
    for (const y of [S.y0, S.y1]) {
      V.post('scaffold', x, y, 0, S.roof, 0.045, { kind: 'pole' });
    }
  }
  for (const y of [S.y0, S.y1]) {
    V.cap('scaffold', [S.x0, y, S.deck + 1.0], [S.x1, y, S.deck + 1.0], 0.035);
    V.cap('scaffold', [S.x0, y, 0.6], [S.x1, y, 0.6], 0.035);
  }
  V.op({ t: 'stairs', m: 'plywood', x0: S.x0 - 3.2, x1: S.x0, y0: S.y0 + 0.4, y1: S.y0 + 1.6, h: S.deck });
  V.box('plywood', S.x0 - 3.2, S.y0 + 0.4, 0, S.x0 - 2.2, S.y0 + 1.6, 0.66, { draw: false, name: 'stand stair' });
  V.box('plywood', S.x0 - 2.2, S.y0 + 0.4, 0, S.x0 - 1.1, S.y0 + 1.6, 1.33, { draw: false, name: 'stand stair' });
  V.box('plywood', S.x0 - 1.1, S.y0 + 0.4, 0, S.x0, S.y0 + 1.6, S.deck - 0.15, { draw: false, name: 'stand stair' });
  /* The canopy: a sloped roof of sheet on the posts, back high. */
  V.box('fsCanopy', S.x0 - 0.3, S.y0 - 0.3, S.roof, S.x1 + 0.3, S.y1 + 0.3, S.roof + 0.2, { name: 'stand roof' });
  V.deco('white', S.x0 - 0.32, S.y1 + 0.26, S.roof - 0.45, S.x1 + 0.32, S.y1 + 0.32, S.roof + 0.2, { cast: false });
  V.sign('pilots', (S.x0 + S.x1) / 2, S.y1 + 0.32, S.roof - 0.13, 'n', 5.5, 0.55, 0.02);
  /* The pilots, seated in a row, goggles on, a radio each. */
  for (let i = 0; i < 8; i += 1) {
    const x = S.x0 + 1.6 + i * 2.3;
    chair(V, x, S.y0 + 4.2, true, i % 2 ? 'mxBlue' : 'mxRed', S.deck);
    V.fan(x, S.y0 + 4.2, S.deck, ['mxOrange', 'drIndigo', 'qbMint', 'white'][i % 4], { sit: true, goggles: true, face: 90 });
  }
  V.gap('PILOT STAND', S.x0 - 0.3, (S.y0 + S.y1) / 2, 0, S.y1 - S.y0 - 2 * MARGIN - 0.1, S.deck + 1.1 + MARGIN, S.roof - S.deck - 1.1 - 2 * MARGIN, 500);
}

function control(V) {
  const C = CONTROL;
  popup(V, C.x0, C.y0, C.x1, C.y1, 'white', 'control', { eave: 2.2, peak: 3.1 });
  table(V, C.x0 + 0.3, C.y0 + 3.6, C.x1 - 0.3, C.y0 + 4.5);
  for (let i = 0; i < 3; i += 1) {
    const x = C.x0 + 1.2 + i * 1.8;
    V.dress('drToriiBlack', x - 0.3, C.y0 + 4.05, 0.74, x + 0.3, C.y0 + 4.1, 1.12);
    V.dress('glassBlue', x - 0.26, C.y0 + 4.1, 0.78, x + 0.26, C.y0 + 4.11, 1.08);
    V.fan(x, C.y0 + 3.2, 0, 'craneYellow', { sit: true, face: 90 });
    chair(V, x, C.y0 + 3.2, true, 'metal');
  }
  /* The timing tower: a scaffold with the lap board on top, facing in. */
  const tx = 118;
  const ty = 44;
  for (const [x, y] of [[tx - 1.2, ty - 0.8], [tx + 1.2, ty - 0.8], [tx - 1.2, ty + 0.8], [tx + 1.2, ty + 0.8]]) {
    V.post('scaffold', x, y, 0, 6.0, 0.05, { kind: 'pole' });
  }
  for (const h of [2, 4]) {
    V.cap('scaffold', [tx - 1.2, ty - 0.8, h], [tx + 1.2, ty + 0.8, h + 2], 0.03);
    V.cap('scaffold', [tx + 1.2, ty - 0.8, h], [tx - 1.2, ty + 0.8, h + 2], 0.03);
  }
  V.box('drToriiBlack', tx - 2.2, ty + 0.6, 5.2, tx + 2.2, ty + 1.0, 8.0, { name: 'lap board' });
  V.sign('lapboard', tx, ty + 1.0, 6.6, 'n', 4.1, 2.6, 0.02);
  /* The generator and its cables to the stand and control. */
  V.box('craneYellow', 124, 39, 0, 126.6, 40.4, 1.3, { name: 'generator' });
  V.deco('drToriiBlack', 123.9, 38.9, 1.3, 126.7, 40.5, 1.4);
  V.op({ t: 'cable', m: 'drToriiBlack', pts: [[124, 40, 0.05], [118, 41, 0.05], [114, 41, 0.05], [104, 41.5, 0.05]] });
}

/* ------------------------------------------------------------------ */
/* The pits                                                            */
/* ------------------------------------------------------------------ */

const TEAM_ROOFS = ['mxOrange', 'mxBlue', 'mxGreen', 'mxRed', 'qbSakura', 'qbMint', 'craneYellow', 'drIndigo'];

function pits(V) {
  const T = PITS;
  for (let i = 0; i < T.n; i += 1) {
    const x0 = T.x0 + i * T.step;
    const x1 = x0 + 3;
    popup(V, x0, T.y0, x1, T.y1, TEAM_ROOFS[i], `team${i}`);
    /* The bench at the back with its kit: a laptop, a charger, battery
     * cases, a quad or two; the chairs; a tool box; a team flag. */
    table(V, x0 + 0.2, T.y0 + 0.15, x1 - 0.2, T.y0 + 0.95);
    V.dress('drToriiBlack', x0 + 0.5, T.y0 + 0.4, 0.74, x0 + 0.85, T.y0 + 0.65, 0.79);
    V.dress('glassBlue', x0 + 0.5, T.y0 + 0.62, 0.79, x0 + 0.85, T.y0 + 0.66, 1.0);
    V.dress('craneYellow', x0 + 1.2, T.y0 + 0.35, 0.74, x0 + 1.6, T.y0 + 0.7, 0.92);
    V.dress('drTyre', x1 - 1.0, T.y0 + 0.35, 0.74, x1 - 0.5, T.y0 + 0.7, 0.86);
    for (const qx of [x0 + 2.0, x1 - 0.35]) {
      V.dress('drToriiBlack', qx - 0.12, T.y0 + 0.43, 0.75, qx + 0.12, T.y0 + 0.67, 0.79);
      for (const [a, b] of [[-0.11, -0.11], [0.11, -0.11], [-0.11, 0.11], [0.11, 0.11]]) {
        V.op({ t: 'cylv', m: 'fsProp', x: qx + a, y: T.y0 + 0.55 + b, h0: 0.8, h1: 0.81, r: 0.06, seg: 8, near: true });
      }
    }
    V.dress('lampRed', x1 - 0.6, T.y1 - 0.5, 0, x1 - 0.2, T.y1 - 0.25, 0.3);
    for (let c = 0; c < 2; c += 1) {
      chair(V, x0 + 0.9 + c * 1.3, T.y0 + 1.6, false, TEAM_ROOFS[(i + 3) % 8]);
    }
    V.fan(x0 + 0.9, T.y0 + 1.6, 0, TEAM_ROOFS[i], { sit: true, face: -90 });
    V.fan(x0 + 2.2, T.y0 + 2.2, 0, 'white', { face: -60 });
    /* A feather flag beside each tent. */
    nobori(V, x1 + 0.9, T.y1 + 0.2, `nobori${i % 4}`, 'n');
  }
  /* The bunting along the front of the row. */
  V.op({ t: 'bunting', a: [T.x0, T.y1 + 0.1, T.eave + 0.6], b: [T.x0 + T.n * T.step, T.y1 + 0.1, T.eave + 0.6], sag: 0.35, every: 0.5 });
  /* Through the first tent, under the roof and over nothing: the line the
   * row leaves between the benches and the chairs. */
  V.gap('THE PIT TENTS', T.x0, T.y0 + 1.25, 0, 1.0, MARGIN + 0.05, T.eave - 0.3 - MARGIN - 0.3, 500);
}

/* A nobori: the tall feather banner on its pole and arm. */
function nobori(V, x, y, key, face) {
  V.post('flagMast', x, y, 0, 3.8, 0.025, { kind: 'pole' });
  const dx = face === 'n' || face === 's' ? 0.32 : 0;
  const dy = face === 'e' || face === 'w' ? 0.32 : 0;
  V.cap('flagMast', [x, y, 3.75], [x + dx * 2, y + dy * 2, 3.75], 0.015, { solid: false, fine: true });
  V.sign(key, x + dx, y + dy, 2.65, face, 0.6, 2.2, 0.0, { back: true });
}

/* ------------------------------------------------------------------ */
/* The main stage and the big screen                                   */
/* ------------------------------------------------------------------ */

function stage(V) {
  const S = STAGE;
  /* The deck, on legs every four metres, open underneath. */
  V.box('drToriiBlack', S.x0, S.y0, S.deck - S.slab, S.x1, S.y1, S.deck, { name: 'stage deck' });
  V.deco('fsStageFloor', S.x0 + 0.05, S.y0 + 0.05, S.deck, S.x1 - 0.05, S.y1 - 0.05, S.deck + 0.02, { cast: false });
  for (const x of [S.x0 + 0.2, 236, 240, S.x1 - 0.2]) {
    for (const y of [S.y0 + 0.2, 92, 96, 100, S.y1 - 0.2]) {
      V.post('metal', x, y, 0, S.deck - S.slab, 0.05, { kind: 'pole' });
    }
  }
  /* The steps up at the north side. */
  V.box('drToriiBlack', S.x0 + 3, S.y1, 0, S.x0 + 4.4, S.y1 + 1.0, 0.55, { name: 'stage step' });
  V.box('drToriiBlack', S.x0 + 3, S.y1, 0.55, S.x0 + 4.4, S.y1 + 0.5, 1.1, { name: 'stage step' });
  /* The four truss towers and the roof grid on them. */
  const towers = [[S.x0 + 0.3, S.y0 + 0.3], [S.x1 - 0.3, S.y0 + 0.3], [S.x0 + 0.3, S.y1 - 0.3], [S.x1 - 0.3, S.y1 - 0.3]];
  for (const [x, y] of towers) {
    V.box('fsTrussSilver', x - 0.2, y - 0.2, S.deck, x + 0.2, y + 0.2, S.roof, { draw: false, name: 'truss tower' });
    V.op({ t: 'truss', a: [x, y, S.deck], b: [x, y, S.roof], s: 0.4 });
  }
  for (const [a, b] of [[towers[0], towers[1]], [towers[2], towers[3]], [towers[0], towers[2]], [towers[1], towers[3]]]) {
    const lo = [Math.min(a[0], b[0]) - 0.2, Math.min(a[1], b[1]) - 0.2];
    const hi = [Math.max(a[0], b[0]) + 0.2, Math.max(a[1], b[1]) + 0.2];
    V.box('fsTrussSilver', lo[0], lo[1], S.roof - 0.4, hi[0], hi[1], S.roof, { draw: false, name: 'roof truss' });
    V.op({ t: 'truss', a: [a[0], a[1], S.roof - 0.2], b: [b[0], b[1], S.roof - 0.2], s: 0.4 });
  }
  /* The roof: a curved skin over the grid, solid as a slab and a step. */
  V.box('fsRoofSkin', S.x0 - 0.4, S.y0 - 0.4, S.roof, S.x1 + 0.4, S.y1 + 0.4, S.roof + 0.4, { draw: false, name: 'stage roof' });
  V.box('fsRoofSkin', S.x0 + 1.5, S.y0 - 0.4, S.roof + 0.4, S.x1 - 1.5, S.y1 + 0.4, S.roof + 0.9, { draw: false, name: 'stage roof' });
  V.op({ t: 'vault', m: 'fsRoofSkin', x0: S.x0 - 0.4, x1: S.x1 + 0.4, y0: S.y0 - 0.4, y1: S.y1 + 0.4, h0: S.roof, rise: 1.1 });
  /* The LED wall at the back, its picture facing the lawn. */
  V.box('drToriiBlack', S.x1 - 0.7, S.y0 + 2, S.deck + 0.6, S.x1 - 0.3, S.y1 - 2, 8.6, { name: 'led wall' });
  V.sign('screen', S.x1 - 0.7, (S.y0 + S.y1) / 2, (S.deck + 0.6 + 8.6) / 2, 'w', 11.6, 6.2, 0.02);
  /* The header banner under the front truss. */
  V.deco('white', S.x0 - 0.1, S.y0 + 0.6, S.roof - 1.6, S.x0 - 0.05, S.y1 - 0.6, S.roof - 0.4, { cast: false });
  V.sign('stageHead', S.x0 - 0.1, (S.y0 + S.y1) / 2, S.roof - 1.0, 'w', 14.4, 1.15, 0.02);
  /* The hung speakers and the ground stacks, out front each side. */
  for (const y of [S.y0 - 0.8, S.y1 + 0.8]) {
    V.box('drToriiBlack', S.x0 + 0.2, y - 0.45, 5.0, S.x0 + 1.2, y + 0.45, 8.6, { name: 'line array' });
    V.cap('metal', [S.x0 + 0.7, y, 8.6], [S.x0 + 0.7, y < S.y0 ? S.y0 + 0.3 : S.y1 - 0.3, S.roof - 0.3], 0.02, { solid: false, fine: true });
    V.box('drToriiBlack', S.x0 - 1.4, y - 1.0, 0, S.x0 + 0.2, y + 1.0, 1.6, { name: 'speaker stack' });
    for (let i = 0; i < 3; i += 1) {
      V.op({ t: 'cylx', m: 'metalDark', x: S.x0 - 1.42, y, h: 0.35 + i * 0.5, r: 0.2, fine: true });
    }
  }
  /* On the deck: a drum riser, a mic stand, the host's table. */
  V.box('drToriiBlack', S.x1 - 4, 94, S.deck, S.x1 - 1.2, 98, S.deck + 0.4, { name: 'drum riser' });
  V.op({ t: 'cylv', m: 'metal', x: S.x1 - 2.6, y: 96, h0: S.deck + 0.4, h1: S.deck + 0.8, r: 0.3, seg: 10, fine: true });
  V.op({ t: 'cylv', m: 'craneYellow', x: S.x1 - 3.3, y: 95.2, h0: S.deck + 0.4, h1: S.deck + 0.7, r: 0.25, seg: 10, fine: true });
  V.post('metal', S.x0 + 2, 96, S.deck, S.deck + 1.6, 0.015, { solid: false, fine: true });
  table(V, S.x0 + 1.2, 99, S.x0 + 3.2, 100.2, S.deck);
  V.fan(S.x0 + 2, 96.5, S.deck, 'qbSakura', { cheer: true, face: 180 });
  V.fan(S.x0 + 2.2, 99.6, S.deck, 'drIndigo', { face: 180 });
  /* Par cans along the front truss, pointing in. */
  for (let y = S.y0 + 1.5; y < S.y1 - 1; y += 1.6) {
    V.op({ t: 'cylx', m: 'drToriiBlack', x: S.x0 + 0.5, y, h: S.roof - 0.65, r: 0.14, len: 0.35, fine: true });
  }
  /* The inflatable tonbo on the roof: the mascot. Its body and head are
   * solid; its wings are cloth. */
  const hy = 101.5;
  V.cap('fsTonboBody', [238, 89.5, S.roof + 2.3], [238, hy - 1.2, S.roof + 2.6], 0.75, { name: 'tonbo', look: 'capsule', seg: 10 });
  V.cap('fsTonboBody', [238, 87.5, S.roof + 2.0], [238, 89.6, S.roof + 2.3], 0.45, { name: 'tonbo tail', look: 'capsule', seg: 8 });
  V.op({ t: 'ball', m: 'fsTonboBody', c: [238, hy, S.roof + 2.8], r: 1.05 });
  for (const s of [-1, 1]) {
    V.op({ t: 'ball', m: 'fsTonboEye', c: [238 + s * 0.65, hy + 0.55, S.roof + 3.1], r: 0.55 });
    V.op({ t: 'ball', m: 'drToriiBlack', c: [238 + s * 0.85, hy + 0.95, S.roof + 3.25], r: 0.2, fine: true });
    for (const [wy, len] of [[98.5, 5.6], [96.6, 5.0]]) {
      V.op({ t: 'wing', m: 'fsTonboWing', c: [238 + s * (len / 2 + 0.5), wy, S.roof + 2.8 + s * 0.0], len, wd: 1.3, side: s });
    }
  }
  for (const [x, y] of [[S.x0 + 0.3, S.y0 + 0.3], [S.x1 - 0.3, S.y1 - 0.3]]) {
    V.wire([x, y, S.roof + 0.8], [238, y < 96 ? 90 : 100, S.roof + 2.3], 0.2);
  }
  /* The gaps: across the stage, and under its deck. */
  V.gap('ACROSS THE STAGE', 237.6, S.y0, 90, 9.4, S.deck + 0.3, S.roof - 0.8 - S.deck - 0.6, 250);
  V.gap('UNDER THE STAGE', 238, S.y0, 90, 4 - 0.1 - 2 * MARGIN, MARGIN, S.deck - S.slab - 2 * MARGIN, 1000);
}

function bigScreen(V) {
  const S = SCREEN;
  for (const x of [S.x0 + 0.5, S.x1 - 0.5]) {
    V.box('fsTrussSilver', x - 0.25, S.y - 0.25, 0, x + 0.25, S.y + 0.25, S.h1 + 0.3, { draw: false, name: 'screen leg' });
    V.op({ t: 'truss', a: [x, S.y, 0], b: [x, S.y, S.h1 + 0.3], s: 0.5 });
    V.box('drToriiBlack', x - 0.8, S.y - 1.4, 0, x + 0.8, S.y + 1.4, 0.3, { name: 'screen foot' });
  }
  V.box('drToriiBlack', S.x0 + 0.8, S.y - 0.3, S.h0, S.x1 - 0.8, S.y + 0.3, S.h1, { name: 'screen' });
  V.sign('screen', (S.x0 + S.x1) / 2, S.y + 0.3, (S.h0 + S.h1) / 2, 'n', S.x1 - S.x0 - 2.0, S.h1 - S.h0 - 0.4, 0.02);
  V.sign('festBanner', (S.x0 + S.x1) / 2, S.y - 0.3, (S.h0 + S.h1) / 2, 's', S.x1 - S.x0 - 2.0, 2.6, 0.02);
  V.gap('UNDER THE SCREEN', (S.x0 + S.x1) / 2, S.y, 90, S.x1 - S.x0 - 1.5 - 2 * MARGIN, 0.3 + MARGIN, S.h0 - 0.3 - 2 * MARGIN, 100);
}

/* ------------------------------------------------------------------ */
/* The lawn, the food court, the entrance                              */
/* ------------------------------------------------------------------ */

function lawn(V) {
  /* Rows of folding chairs facing the stage. */
  for (let r = 0; r < 6; r += 1) {
    for (let i = 0; i < 12; i += 1) {
      const x = 210 + r * 1.6;
      const y = 89.5 + i * 1.2 + (i >= 6 ? 1.6 : 0);
      V.dress('white', x - 0.22, y - 0.22, 0.43, x + 0.22, y + 0.22, 0.47);
      V.dress('white', x - 0.26, y - 0.22, 0.47, x - 0.22, y + 0.22, 0.86);
      if (hash(r * 12 + i, 41) < 0.55) {
        V.fan(x, y, 0, ['qbSakura', 'mxBlue', 'white', 'mxOrange', 'qbMint', 'drIndigo'][Math.floor(hash(r * 12 + i, 42) * 6)], { sit: true, face: 0, cheer: hash(r, i) < 0.15 });
      }
    }
  }
  /* Blue picnic sheets further back, people on them. */
  for (let i = 0; i < 7; i += 1) {
    const x = 199 + (i % 2) * 4.5 + hash(i, 5) * 1.5;
    const y = 86 + i * 3.4;
    V.paint('fsTarp', x, y, x + 2.4, y + 1.8, 0.025);
    for (let k = 0; k < 3; k += 1) {
      if (hash(i, k + 7) < 0.7) {
        V.fan(x + 0.5 + k * 0.7, y + 0.6 + hash(i, k) * 0.6, 0, ['mxRed', 'white', 'qbMint', 'craneYellow'][(i + k) % 4], { sit: true, face: 0 });
      }
    }
    V.dress('white', x + 2.0, y + 1.3, 0, x + 2.4, y + 1.6, 0.35);
  }
}

/* A food stall (yatai): a counter, a back bench, four posts, a striped
 * awning sloping to the front, its sign and noren, lanterns. `dir` is +1
 * for a stall facing east, -1 for one facing west. */
function yatai(V, x, y, dir, i) {
  const fx = x + dir * 1.2;
  const bx = x - dir * 1.2;
  const y0 = y - 2;
  const y1 = y + 2;
  V.box('plywood', Math.min(fx, fx - dir * 0.7), y0, 0, Math.max(fx, fx - dir * 0.7), y1, 1.0, { name: 'counter' });
  V.deco('white', Math.min(fx, fx - dir * 0.75), y0, 1.0, Math.max(fx + dir * 0.05, fx - dir * 0.75), y1, 1.06);
  V.box('metal', Math.min(bx, bx + dir * 0.6), y0 + 0.2, 0, Math.max(bx, bx + dir * 0.6), y1 - 0.2, 0.9, { name: 'grill' });
  for (const [px, py] of [[fx, y0], [fx, y1], [bx, y0], [bx, y1]]) {
    V.post('rope', px, py, 0, px === fx ? 2.3 : 2.7, 0.04, { kind: 'pole' });
  }
  V.box('white', Math.min(fx, bx) - 0.1, y0 - 0.1, 2.3, Math.max(fx, bx) + 0.1, y1 + 0.1, 2.5, { name: 'stall roof' });
  V.op({ t: 'awning', x0: Math.min(fx, bx) - 0.2, x1: Math.max(fx, bx) + 0.2, y0: y0 - 0.15, y1: y1 + 0.15, hLow: dir > 0 ? 2.5 : 2.85, hHigh: dir > 0 ? 2.85 : 2.5, alongX: true, m: ['mxRed', 'mxBlue', 'mxGreen', 'craneYellow', 'qbSakura'][i % 5] });
  /* The sign over the front, the noren under it, lanterns at the corners. */
  V.sign(`stall${i % 5}`, fx + dir * 0.12, y, 2.05, dir > 0 ? 'e' : 'w', 3.4, 0.62, 0.02);
  V.sign(`noren${i % 3}`, fx + dir * 0.1, y, 1.5, dir > 0 ? 'e' : 'w', 3.2, 0.55, 0.02, { fine: true });
  for (const py of [y0 + 0.2, y1 - 0.2]) {
    V.op({ t: 'lantern', c: [fx + dir * 0.15, py, 1.9] });
  }
  /* Behind: a gas bottle, crates, a cool box. */
  V.dress('mxRed', bx - dir * 0.6 - 0.18, y0 + 0.5, 0, bx - dir * 0.6 + 0.18, y0 + 0.86, 0.9);
  V.dress('plywood', bx - dir * 0.9 - 0.3, y1 - 1.2, 0, bx - dir * 0.9 + 0.3, y1 - 0.6, 0.6);
  V.dress('white', bx - dir * 0.9 - 0.3, y1 - 0.5, 0, bx - dir * 0.9 + 0.3, y1 - 0.1, 0.4);
  V.fan(x, y, 0, 'white', { face: dir > 0 ? 0 : 180 });
  V.fan(fx + dir * 1.0, y - 0.6 + hash(i, 3), 0, ['mxBlue', 'qbSakura', 'mxOrange'][i % 3], { face: dir > 0 ? 180 : 0 });
}

function food(V) {
  const F = FOOD;
  let k = 0;
  for (let y = F.y0 + 3; y < F.y1 - 2; y += 4.6) {
    yatai(V, F.walk0 - 2.2, y, 1, k);
    yatai(V, F.walk1 + 2.2, y, -1, k + 2);
    k += 1;
  }
  /* Lantern strings across the walk. */
  for (let y = F.y0 + 2; y < F.y1; y += 7) {
    V.post('rope', F.walk0 - 0.5, y, 0, 3.6, 0.05, { kind: 'pole' });
    V.post('rope', F.walk1 + 0.5, y, 0, 3.6, 0.05, { kind: 'pole' });
    V.op({ t: 'lanterns', a: [F.walk0 - 0.5, y, 3.5], b: [F.walk1 + 0.5, y, 3.5], sag: 0.3, every: 1.2 });
    V.op({ t: 'lanterns', a: [F.walk0 - 0.5, y, 3.5], b: [F.walk0 - 0.5, y + 7, 3.5], sag: 0.4, every: 1.4, fine: true });
  }
  /* Tables with parasols on the lawn east of the stalls. */
  for (let i = 0; i < 4; i += 1) {
    for (let j = 0; j < 5; j += 1) {
      const x = 236 + i * 5;
      const y = 134 + j * 7.5;
      table(V, x - 0.7, y - 0.45, x + 0.7, y + 0.45);
      V.post('white', x, y, 0.74, 2.2, 0.025, { solid: false });
      V.box(['mxRed', 'white', 'mxBlue'][(i + j) % 3], x - 0.8, y - 0.8, 2.0, x + 0.8, y + 0.8, 2.15, { draw: false, name: 'parasol' });
      V.op({ t: 'parasol', m: ['mxRed', 'white', 'mxBlue'][(i + j) % 3], c: [x, y, 2.0], r: 1.2, h: 0.5 });
      for (const s of [-1, 1]) {
        V.dress('fsBench', x - 0.7, y + s * 0.85 - 0.15, 0.42, x + 0.7, y + s * 0.85 + 0.15, 0.46);
        if (hash(i * 5 + j, s + 9) < 0.6) {
          V.fan(x - 0.3 + hash(i, j) * 0.6, y + s * 0.85, 0, ['qbMint', 'mxOrange', 'drIndigo', 'white'][(i + j + s + 4) % 4], { sit: true, face: s > 0 ? -90 : 90 });
        }
      }
    }
  }
  /* The bin station. */
  for (let i = 0; i < 4; i += 1) {
    V.box(['mxBlue', 'mxGreen', 'craneYellow', 'mxRed'][i], 228.6 + i * 0.7, F.y0 - 2.8, 0, 229.2 + i * 0.7, F.y0 - 2.2, 0.9, { name: 'bin' });
  }
  V.sign('gomi', 230, F.y0 - 2.82, 1.35, 's', 2.4, 0.6, 0.02);
  /* People walking. */
  for (let i = 0; i < 20; i += 1) {
    V.fan(F.walk0 + 0.3 + hash(i, 21) * 3.4, F.y0 + hash(i, 22) * (F.y1 - F.y0), 0, ['white', 'qbSakura', 'mxBlue', 'mxOrange', 'drIndigo', 'qbMint'][i % 6], { face: hash(i, 23) < 0.5 ? 90 : -90 });
  }
}

/* The entrance: the balloon arch at the foot of the stairs, the
 * reception tent, nobori up the walk. */
function gateway(V) {
  const G = GATEWAY;
  const n = 18;
  const pts = [];
  for (let i = 0; i <= n; i += 1) {
    sincos(Math.PI * (i / n), SC);
    pts.push([G.x - G.half * SC.c, G.y, G.top * SC.s]);
  }
  for (let i = 0; i < n; i += 1) {
    V.cap('fsBalloonA', pts[i], pts[i + 1], 0.3, { draw: false, name: 'balloon arch' });
  }
  V.op({ t: 'balloons', pts, r: 0.33 });
  V.gap('THE BALLOON ARCH', G.x, G.y, 90, 2 * G.half - 2.6, MARGIN, G.top - 1.6, 100);
  popup(V, 160, 177, 164, 180.5, 'white', 'reception', { eave: 2.2, peak: 3.1, face: 's' });
  table(V, 160.3, 177.2, 163.7, 178);
  V.fan(162, 178.8, 0, 'craneYellow', { face: -90 });
  for (let i = 0; i < 6; i += 1) {
    nobori(V, 140 + i * 3.4, 182.2, `nobori${i % 4}`, 's');
  }
  /* Bicycles parked along the levee foot, east of the stairs. */
  for (let i = 0; i < 14; i += 1) {
    const x = 166 + i * 0.75;
    V.op({ t: 'bike', x, y: 182.6, m: ['mxBlue', 'white', 'mxRed', 'drToriiBlack', 'qbMint'][i % 5] });
  }
}

/* ------------------------------------------------------------------ */
/* The crowd on the levee, the car park, the ball field                */
/* ------------------------------------------------------------------ */

function crowd(V) {
  const shirts = ['white', 'qbSakura', 'mxBlue', 'mxOrange', 'drIndigo', 'qbMint', 'craneYellow', 'mxRed'];
  let i = 0;
  for (let k = 1; k < LEVEE.steps; k += 1) {
    for (let x = 46; x < 262; x += 1.6) {
      i += 1;
      if (x > SLUICE.x0 - 4 && x < SLUICE.x1 + 4) {
        continue;
      }
      if (Math.abs(x - GATEWAY.x) < 2.6) {
        continue;
      }
      /* Thicker opposite the arena and the screen, thinning to the ends. */
      const want = (x > 60 && x < 200 ? 0.24 : 0.08) * (k < 5 ? 1 : 0.6);
      if (hash(i, 31) > want) {
        continue;
      }
      const y = LEVEE.y0 + (k - 1) * LEVEE.tread + 0.9;
      V.fan(x + hash(i, 32) * 0.6, y, k * LEVEE.rise - LEVEE.rise, shirts[Math.floor(hash(i, 33) * shirts.length)], { sit: true, face: -90, cheer: hash(i, 34) < 0.08 });
      if (hash(i, 35) < 0.12) {
        V.paint('fsTarp', x - 0.6, y - 0.4, x + 1.4, y + 0.8, (k - 1) * LEVEE.rise + 0.02);
      }
    }
  }
  /* A few walking the crown and leaning on the rail. */
  for (let j = 0; j < 14; j += 1) {
    V.fan(20 + hash(j, 36) * 240, LEVEE.crown0 + 1.0 + hash(j, 37) * 1.2, CROWN_H, shirts[j % 8], { face: -90 });
  }
}

function carPark(V) {
  /* The portable toilets in a row, their sign. */
  for (let i = 0; i < 6; i += 1) {
    const x = 282 + i * 1.3;
    V.box('fsLooBlue', x, 176, 0, x + 1.15, 177.2, 2.3, { name: 'toilet' });
    V.deco('white', x - 0.03, 175.97, 2.3, x + 1.18, 177.23, 2.45);
    V.dress('white', x + 0.2, 175.96, 0.1, x + 0.95, 175.98, 2.0);
  }
  V.sign('toilet', 285.9, 175.95, 2.75, 's', 2.2, 0.55, 0.0);
  V.post('metal', 285.9, 176, 0, 2.5, 0.03, { solid: false });
  /* The first aid tent by the toilets. */
  popup(V, 292, 172, 296, 175.5, 'white', 'firstaid', { eave: 2.2, peak: 3.1, face: 's' });
  /* The marshals' cones along the car park's lanes. */
  for (let y = 46; y < 170; y += 8) {
    V.op({ t: 'cone', x: 298, y });
  }
}

function backstop(V) {
  const B = BACKSTOP;
  /* Five panels of net in an arc behind home plate, posts at the joints,
   * eight metres high, as a sports ground's backstop is. */
  const home = [B.x + 5.5, B.y - 7.5];
  const pts = [];
  for (let i = 0; i <= 5; i += 1) {
    const a = 45 + 90 - i * 36 + 90;
    sincos(a * DEG, SC);
    pts.push([home[0] + SC.c * 9, home[1] + SC.s * 9]);
  }
  for (let i = 0; i <= 5; i += 1) {
    V.post('fsNetPost', pts[i][0], pts[i][1], 0, 8.2, 0.1, { kind: 'pole' });
  }
  for (let i = 0; i < 5; i += 1) {
    V.cap('fsNetPost', [...pts[i], 8.0], [...pts[i + 1], 8.0], 0.05);
    V.cap('fsNetPost', [...pts[i], 4.0], [...pts[i + 1], 4.0], 0.04);
    /* Solid as capsules lying inside the net's sheet, stacked. */
    for (let h = 0.3; h < 8; h += 0.5) {
      V.cap('fsNet', [...pts[i], h], [...pts[i + 1], h], 0.12, { draw: false, name: 'backstop net', kind: 'wall' });
    }
    V.op({ t: 'net', a: pts[i], b: pts[i + 1], h0: 0.02, h1: 8 });
  }
  /* The benches each side, under a lean-to roof. */
  for (const [x0, y0, x1, y1] of [[home[0] + 6, home[1] + 5.5, home[0] + 12, home[1] + 7], [home[0] - 7.5, home[1] - 12, home[0] - 6, home[1] - 6]]) {
    V.box('fsBench', x0, y0, 0.4, x1, y1, 0.48, { name: 'bench' });
    for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) {
      V.post('metal', x, y, 0, 2.3, 0.04, { kind: 'pole' });
    }
    V.box('sheetGreen', x0 - 0.2, y0 - 0.2, 2.3, x1 + 0.2, y1 + 0.2, 2.42, { name: 'bench roof' });
  }
  V.sign('ground', home[0] + 9, home[1] + 9.3, 2.3, 's', 2.4, 0.8, 0.04);
  V.post('metal', home[0] + 8, home[1] + 9.35, 0, 2.7, 0.04);
  V.post('metal', home[0] + 10, home[1] + 9.35, 0, 2.7, 0.04);
}

/* ------------------------------------------------------------------ */
/* Nobori round the arena, marshals, the last of the people            */
/* ------------------------------------------------------------------ */

function dressing(V) {
  /* Nobori along the south walk, every eight metres. */
  for (let x = 46; x < 80; x += 8) {
    nobori(V, x, 46.5, `nobori${(x / 8) % 4 | 0}`, 'n');
  }
  for (let x = 122; x < 188; x += 8) {
    nobori(V, x, 46.5, `nobori${(x / 8) % 4 | 0}`, 'n');
  }
  /* And up the east walk to the food court. */
  for (let y = 54; y < 170; y += 10) {
    if (y > 94 && y < 108) {
      continue;
    }
    nobori(V, 196.5, y, `nobori${(y / 10) % 4 | 0}`, 'w');
  }
  /* Marshals in hi vis at the corners of the arena, outside the nets. */
  for (const [x, y] of [[40, 46], [192, 46], [40, 172], [192, 172], [192, 101]]) {
    V.fan(x, y, 0, 'craneYellow', { face: 45 });
  }
  /* Spectators along the south net either side of the stand. */
  for (let i = 0; i < 26; i += 1) {
    const x = 44 + hash(i, 51) * 140;
    if (x > STAND.x0 - 4 && x < CONTROL.x1 + 6) {
      continue;
    }
    V.fan(x, 46.6 + hash(i, 52) * 0.8, 0, ['white', 'mxBlue', 'qbSakura', 'mxOrange'][i % 4], { face: 90, cheer: hash(i, 53) < 0.2 });
  }
  /* The kei trucks' tailgate picnics are the yard's cars; here, a few cool
   * boxes and folding chairs by them. */
  for (let i = 0; i < 6; i += 1) {
    const x = 132 + i * 9;
    V.dress('white', x, 24.6, 0, x + 0.6, 25.0, 0.38);
    V.dress('wallBlue', x - 0.02, 24.58, 0.38, x + 0.62, 25.02, 0.44);
  }
}

/* ------------------------------------------------------------------ */
/* The layout                                                          */
/* ------------------------------------------------------------------ */

/*
 * The whole place: { parts, ops, signs, gaps, wires, fans }, every one in
 * the plan but the parts, which are in the world. Built fresh on every
 * call and the same every call.
 */
export function venueLayout() {
  const V = new Venue();
  ground(V);
  levee(V);
  sluice(V);
  railway(V);
  arena(V);
  partnerBanners(V);
  startArch(V);
  gates(V);
  stand(V);
  control(V);
  pits(V);
  stage(V);
  bigScreen(V);
  lawn(V);
  food(V);
  gateway(V);
  crowd(V);
  carPark(V);
  backstop(V);
  dressing(V);
  return { parts: V.P.list, ops: V.ops, signs: V.signs, gaps: V.gaps, wires: V.wires, fans: V.fans };
}

/* Where the pilot starts: on the grass behind the start arch, the whole
 * straight ahead. */
export const SPAWN = { x: PADS.x, y: PADS.y, deg: PADS.deg };

/* The one hidden Konex Drone sign: on the culvert's west wall, under the
 * crown road, halfway through the sluice. Readable only from inside the
 * tunnel, so the line through it is the line to it. */
export const HIDDEN_KONEX = { x: SLUICE.x0 + 0.02, y: 202, h: 1.35, w: 1.0 };
