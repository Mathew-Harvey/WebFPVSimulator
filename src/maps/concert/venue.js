/*
 * venue.js: Hanabi Sound, the place. Pure: no Three.js, so its solids, its
 * named gaps and its crowd load in Node (scripts/concert-check.js) as they
 * do in the browser, and the two cannot disagree about where a wall is.
 *
 * WHAT IT IS. An open air dance music festival at dusk, on the owner's ask
 * of 2 November 2026 ("a concert map, massive DJ set with fireworks and
 * crowds, sound desk and all the things you'd find at a concert"), drawn in
 * the town's manga look. Its bones are what every big outdoor show has,
 * not any one festival's site:
 *
 *   - THE MAIN STAGE at the east end, facing west: a deck 2.2 m up, a roof
 *     on four truss towers 22 m up, an LED wall thirty metres wide behind
 *     the DJ, the DJ's riser in the middle with the decks on it, a line
 *     array hung each side, the sub stacks under the lip, scaffold wings
 *     with the festival's banners, and a side screen on a tower each side.
 *   - THE PIT and the crowd barrier in front of it, security in the pit.
 *   - THE CROWD: thousands, packed tight at the barrier and thinning back
 *     to the sound desk, split down the middle by the cable lane from the
 *     desk to the stage. Drawn by ./show.js as instances, one draw each.
 *   - FRONT OF HOUSE, the sound desk, in its own fenced pen in the middle
 *     of the crowd under a tent, the lighting desk beside it and the follow
 *     spot tower behind it.
 *   - THE DELAY TOWERS: two scaffold towers further back with speakers on
 *     top, for the people at the back.
 *   - A LIGHTING GOALPOST across the crowd, totems and flags in it.
 *   - Behind the crowd the lawn, the bars, the food trucks, the toilets,
 *     the merch tent, the ferris wheel, the entrance arch, and behind the
 *     stage the backstage compound and the firework racks.
 *
 * THE FRAME is the built map's (src/maps/built/place.js), as Tonbo Fest's
 * is: the plan in metres from the plot's near left corner, x east and y
 * north, h up, and the world's Three.js metres from the plot's middle, Y
 * up. Every point here is written in the plan and converted once, in w().
 * Anything a quad can hit goes through Parts, so a wall is drawn and solid
 * from the same numbers; a thing turned off the axes is solid as capsules,
 * whose ends are turned with src/props/trig.js's sine and cosine, never the
 * engine's. What is only drawn (a tent's slope, a flag, a wire) is an op
 * for ./index.js.
 *
 * THE CROWD IS SOLID AS BLOCKS. A person is not a collider: four thousand
 * capsules would be four thousand tests a step. Each block of the crowd is
 * one box to head height, invisible, and the people are drawn standing in
 * it shoulder to shoulder, so what looks like a wall of people is one.
 * Nobody stands outside a block, so there is no gap between people that
 * looks flyable and is not. The lane down the middle and the pens round
 * the desk and the towers are the crowd's real gaps, and they are open.
 *
 * NAMES ARE OUR OWN. Hanabi is fireworks. Every act, stall and sign word is
 * made up or is the plain word for the thing; no real festival, brand or
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
export const FIELD_W = 280;
export const FIELD_D = 220;

const DEG = Math.PI / 180;

/* A plan point (x east, y north, h up) as the world's [x, y, z]. */
export function w(x, y, h = 0) {
  return [x - FIELD_W / 2, h, FIELD_D / 2 - y];
}

/*
 * THE CULL CELLS: twelve chunks, four across and three up, for the
 * structure, and forty two near cells of forty metres for the set
 * dressing, which ./index.js switches off by range (Tonbo Fest's scheme).
 */
export function chunkOf(x, z) {
  const px = x + FIELD_W / 2;
  const py = FIELD_D / 2 - z;
  const c = px < 70 ? 0 : px < 140 ? 1 : px < 210 ? 2 : 3;
  const r = py < 74 ? 0 : py < 146 ? 1 : 2;
  return `cc${c}${r}`;
}

export function nearOf(x, z) {
  const px = x + FIELD_W / 2;
  const py = FIELD_D / 2 - z;
  const c = Math.min(6, Math.max(0, Math.floor(px / 40)));
  const r = Math.min(5, Math.max(0, Math.floor(py / 40)));
  return `cn${c}${r}`;
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

/* The main stage: the deck the whole width, the roofed middle on its four
 * towers, the wings each side of it. */
export const STAGE = { x0: 200, x1: 218, y0: 80, y1: 140, deck: 2.2, my0: 92, my1: 128, roof: 22, tower: 1.2, beam: 1.0 };

/* The LED wall behind the DJ, its picture facing the crowd. */
export const LED = { x0: 214, x1: 214.8, y0: 95, y1: 125, h0: 3.0, h1: 16 };

/* The DJ's riser: a slab on four legs, open underneath. */
export const RISER = { x0: 206, x1: 210, y0: 104, y1: 116, top: 2.4, slab: 0.4, leg: 0.1 };

/* The line arrays, hung from the front beam, each side of the middle. */
export const HANGS = [{ y0: 96, y1: 97.4 }, { y0: 122.6, y1: 124 }];
export const HANG = { x0: 200.6, x1: 201.8, h0: 10, h1: 19.5 };

/* The side screens, each on a scaffold tower of its own in front of a
 * wing, open underneath. */
export const IMAG = [{ y0: 82, y1: 90 }, { y0: 130, y1: 138 }];
export const IMAG_T = { x0: 196.2, x1: 199.4, under: 7.6, top: 15, scr0: 8, scr1: 14.5 };

/* The pit and its barrier. */
export const BARRIER = { x0: 192.4, x1: 193.0, y0: 78, y1: 142, h: 1.25 };

/* Front of house: the sound desk's platform and tent, its pen, and the
 * follow spot tower behind it. */
export const FOH = { x0: 136, x1: 146, y0: 104, y1: 116, deck: 1.0, roof: 5.0 };
export const PEN = { x0: 126, x1: 150, y0: 100, y1: 120 };
export const SPOT = { x0: 128, x1: 132, y0: 106, y1: 114, deck: 6.0, roof: 9.6 };

/* The delay towers, four metres square, speakers on top facing the back. */
export const DELAYS = [{ x: 98, y: 82 }, { x: 98, y: 138 }];
export const DELAY = { half: 2, top: 14.5, step: 2 };

/* The lighting goalpost across the crowd. */
export const GOAL = { x: 162, y0: 66, y1: 154, top: 16 };

/* The cable lane from the desk to the stage, fenced each side. */
export const LANE = { x0: 150, x1: 192.4, y0: 108.5, y1: 111.5 };

/* The crowd's blocks: where people stand, solid to head height. */
export const CROWD_H = 1.7;
export const CROWD_BLOCKS = [
  { x0: 104, x1: 126, y0: 72, y1: 148 },
  { x0: 126, x1: 150, y0: 72, y1: PEN.y0 },
  { x0: 126, x1: 150, y0: PEN.y1, y1: 148 },
  { x0: 150, x1: 192, y0: 72, y1: LANE.y0 - 0.2 },
  { x0: 150, x1: 192, y0: LANE.y1 + 0.2, y1: 148 },
];

/* The ferris wheel, its plane along x, its axle along y. */
export const WHEEL = { x: 40, y: 186, hub: 16, r: 13, spokes: 12, segs: 24, legs: 8.5, half: 2.6 };

/* The entrance arch in the west fence. */
export const ARCH = { x: 10, y0: 100, y1: 120, top: 7.5 };

/* The perimeter fence. */
export const FENCE = { x0: 10, x1: 270, y0: 20, y1: 200, h: 2.0 };

/* The bars, south and north of the crowd, their counters facing it. */
export const BARS = [{ x0: 62, x1: 84, y0: 50, y1: 58, face: 1 }, { x0: 62, x1: 84, y0: 162, y1: 170, face: -1 }];

/* The food trucks along the north fence. */
export const TRUCKS = { y0: 175, y1: 177.4, xs: [64, 76, 88, 100, 112, 124] };

/* Where the pilot starts: on the lawn behind the crowd, the stage ahead. */
export const SPAWN = { x: 62, y: 110, deg: 0 };

/* How far inside an opening a gap's rectangle stands, each side and over
 * the sill: more than the craft's radius (CRAFT_WORLD_R in
 * src/game/collide.js, 0.17 m). Tonbo Fest's number. */
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
    this.crowd = [];
    this.lamps = [];
  }

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

  /* Solid and not drawn: where the drawing is an op or the crowd. */
  hidden(x0, y0, h0, x1, y1, h1, name, kind = 'wall') {
    return this.box('cxStageBlack', x0, y0, h0, x1, y1, h1, { draw: false, name, kind });
  }

  cap(m, a, b, r, opts = {}) {
    const p = this.P.cap(m, w(a[0], a[1], a[2]), w(b[0], b[1], b[2]), r, opts);
    if (p && opts.fine) {
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

  /* A painted plate from the sign atlas (./signs.js), Tonbo Fest's. */
  sign(key, x, y, h, face, wd, ht, lift = 0.03, opts = {}) {
    this.signs.push({ key, x, y, h, face, w: wd, ht, lift, fine: Boolean(opts.fine) });
    if (opts.back) {
      const back = { n: 's', s: 'n', e: 'w', w: 'e' }[face];
      this.signs.push({ key, x, y, h, face: back, w: wd, ht, lift, fine: Boolean(opts.fine) });
    }
  }

  /* A named gap: the foot of its window's middle in the plan, the heading
   * it is flown along in whole degrees, its clear width, the bottom of its
   * window and its height, all already inside the opening. */
  gap(name, x, y, deg, width, z, height, points) {
    this.gaps.push({ name, x, y, deg, w: width, z, h: height, points });
  }

  wire(a, b, sag) {
    this.wires.push({ a, b, sag });
  }

  fan(x, y, h, shirt, opts = {}) {
    this.fans.push({ x, y, h, shirt, sit: Boolean(opts.sit), cheer: Boolean(opts.cheer), phones: Boolean(opts.phones), face: opts.face ?? 0 });
  }

  /* A light that stays lit: a glowing ball, drawn on every preset. */
  glow(x, y, h, r, m = 'lampGlow') {
    this.op({ t: 'ball', m, c: [x, y, h], r });
  }
}

/* A point `d` metres along heading `deg` and `s` metres to its left. */
const SC = { s: 0, c: 1 };
function along(x, y, deg, d, s = 0) {
  sincos(deg * DEG, SC);
  return [x + SC.c * d - SC.s * s, y + SC.s * d + SC.c * s];
}

/* A scaffold tower: four standards, ledgers round it at each lift, braces
 * on the two faces named in `brace`. Solid as its tubes, so it can be
 * flown through between them. */
function scaffold(V, x0, y0, x1, y1, h0, h1, lifts, brace = 'ns', r = 0.06) {
  const legs = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  for (const [x, y] of legs) {
    V.post('cxScaffold', x, y, h0, h1, r, { name: 'standard' });
  }
  for (const h of lifts) {
    V.cap('cxScaffold', [x0, y0, h], [x1, y0, h], 0.04, { name: 'ledger' });
    V.cap('cxScaffold', [x0, y1, h], [x1, y1, h], 0.04, { name: 'ledger' });
    V.cap('cxScaffold', [x0, y0, h], [x0, y1, h], 0.04, { name: 'ledger' });
    V.cap('cxScaffold', [x1, y0, h], [x1, y1, h], 0.04, { name: 'ledger' });
  }
  const levels = [h0, ...lifts].sort((a, b) => a - b);
  for (let i = 0; i + 1 < levels.length; i += 1) {
    const a = levels[i];
    const b = levels[i + 1];
    if (brace.includes('s')) {
      V.cap('cxScaffold', [i % 2 ? x0 : x1, y0, a], [i % 2 ? x1 : x0, y0, b], 0.035, { name: 'brace' });
    }
    if (brace.includes('n')) {
      V.cap('cxScaffold', [i % 2 ? x1 : x0, y1, a], [i % 2 ? x0 : x1, y1, b], 0.035, { name: 'brace' });
    }
    if (brace.includes('w')) {
      V.cap('cxScaffold', [x0, i % 2 ? y0 : y1, a], [x0, i % 2 ? y1 : y0, b], 0.035, { name: 'brace' });
    }
    if (brace.includes('e')) {
      V.cap('cxScaffold', [x1, i % 2 ? y1 : y0, a], [x1, i % 2 ? y0 : y1, b], 0.035, { name: 'brace' });
    }
  }
}

/* A truss tower or beam, solid as its box, drawn as a truss. */
function truss(V, a, b, s, name) {
  const lo = [Math.min(a[0], b[0]) - s / 2, Math.min(a[1], b[1]) - s / 2, Math.min(a[2], b[2]) - (a[2] === b[2] ? s / 2 : 0)];
  const hi = [Math.max(a[0], b[0]) + s / 2, Math.max(a[1], b[1]) + s / 2, Math.max(a[2], b[2]) + (a[2] === b[2] ? s / 2 : 0)];
  V.box('fsTrussSilver', lo[0], lo[1], lo[2], hi[0], hi[1], hi[2], { draw: false, name });
  V.op({ t: 'truss', a, b, s });
}

/* A fence of steel crowd barrier along an axis, solid. */
function barrier(V, x0, y0, x1, y1, h = 1.2, name = 'barrier') {
  V.box('cxSteel', x0, y0, 0, x1, y1, h, { name, kind: 'wall' });
}

/* A tent: a roof slab on poles with a row of `n` pyramids on it, drawn,
 * each pyramid's middle solid as a step: a marquee's peaks. */
function tent(V, x0, y0, x1, y1, eave, peak, m, n = 1) {
  const step = (x1 - x0) / n;
  for (let i = 0; i <= n; i += 1) {
    V.post('cxSteel', x0 + i * step, y0, 0, eave, 0.05);
    V.post('cxSteel', x0 + i * step, y1, 0, eave, 0.05);
  }
  V.box(m, x0 - 0.2, y0 - 0.2, eave, x1 + 0.2, y1 + 0.2, eave + 0.15, { name: 'tent roof' });
  for (let i = 0; i < n; i += 1) {
    const a = x0 + i * step - (i === 0 ? 0.2 : 0);
    const b = x0 + (i + 1) * step + (i === n - 1 ? 0.2 : 0);
    V.op({ t: 'pyr', m: i % 2 ? 'white' : m, x0: a, y0: y0 - 0.2, x1: b, y1: y1 + 0.2, h0: eave + 0.15, h1: peak });
    const ix = (b - a) / 4;
    const iy = (y1 - y0) / 4;
    V.hidden(a + ix, y0 + iy, eave + 0.15, b - ix, y1 - iy, eave + 0.15 + (peak - eave - 0.15) / 2, 'tent peak');
  }
}

/* ------------------------------------------------------------------ */
/* The ground                                                          */
/* ------------------------------------------------------------------ */

function ground(V) {
  /* The trodden field in front of the stage, the trackway of aluminium
   * panels down the lane and round the desk, the gravel walks. */
  V.paint('cxTrodden', 100, 68, 194, 152, 0.02);
  V.paint('cxTrack', LANE.x0, LANE.y0, LANE.x1, LANE.y1, 0.04);
  V.paint('cxTrack', PEN.x0, PEN.y0, PEN.x1, PEN.y1, 0.035);
  V.paint('cxTrack', BARRIER.x1, BARRIER.y0, STAGE.x0, BARRIER.y1, 0.04);
  V.paint('cxWalk', FENCE.x0, 104, 100, 116, 0.025);
  V.paint('cxWalk', 30, 60, 40, 168, 0.025);
  V.paint('cxWalk', 40, 170, 140, 174, 0.025);
  V.paint('cxWalk', 40, 40, 200, 46, 0.025);
  V.paint('cxWalk', 40, 174, 200, 168, 0.025);
  /* The picnic blankets on the lawn, a pattern of colours. */
  const blankets = ['fsTarp', 'cxPink', 'cxGold', 'cxTeal', 'cxCream', 'cxViolet'];
  for (let i = 0; i < 46; i += 1) {
    const x = 44 + hash(i, 11) * 52;
    const y = 64 + hash(i, 12) * 92;
    if (Math.abs(y - 110) < 8 || (x < 72 && Math.abs(y - SPAWN.y) < 14)) {
      continue;
    }
    const sx = 1.6 + hash(i, 13) * 1.2;
    const sy = 1.4 + hash(i, 14) * 1.0;
    V.op({ t: 'obox', m: blankets[i % blankets.length], c: [x, y, 0], size: [sx, sy, 0.035], deg: Math.round(hash(i, 15) * 80 - 40) });
    /* Two or three sitting on each, some with an arm up. */
    const n = 1 + Math.floor(hash(i, 16) * 3);
    for (let k = 0; k < n; k += 1) {
      const p = along(x, y, Math.round(hash(i, 17 + k) * 360), 0.5);
      V.fan(p[0], p[1], 0.03, SHIRTS[(i + k) % SHIRTS.length], { sit: true, cheer: hash(i, 21 + k) < 0.3, face: 0 });
    }
  }
}

/* The colours a kit person wears: the crowd in ./show.js has its own. */
const SHIRTS = ['drToriiBlack', 'white', 'cxPink', 'cxTeal', 'cxGold', 'drIndigo', 'mxRed', 'cxViolet'];

/* ------------------------------------------------------------------ */
/* The main stage                                                      */
/* ------------------------------------------------------------------ */

function stage(V) {
  const S = STAGE;
  /* The deck, closed to the ground by its black skirt, and its floor. */
  V.box('cxStageBlack', S.x0, S.y0, 0, S.x1, S.y1, S.deck, { name: 'stage deck' });
  V.deco('cxDeck', S.x0 + 0.05, S.y0 + 0.05, S.deck, S.x1 - 0.05, S.y1 - 0.05, S.deck + 0.02, { cast: false });
  /* The lip's white edge, the comic's line along the front. */
  V.deco('white', S.x0 - 0.03, S.y0, S.deck - 0.08, S.x0 + 0.02, S.y1, S.deck, { cast: false, fine: true });

  /* The four towers and the roof's grid on them. */
  const t = S.tower;
  const tx = [S.x0 + t / 2, S.x1 - t / 2];
  const ty = [S.my0 + t / 2, S.my1 - t / 2];
  const top = S.roof - S.beam / 2;
  for (const x of tx) {
    for (const y of ty) {
      truss(V, [x, y, S.deck], [x, y, S.roof], t, 'roof tower');
    }
  }
  for (const y of ty) {
    truss(V, [tx[0], y, top], [tx[1], y, top], S.beam, 'roof beam');
  }
  for (const x of [tx[0], 206, 212, tx[1]]) {
    truss(V, [x, ty[0], top], [x, ty[1], top], S.beam, 'roof beam');
  }
  /* The roof skin: a vault over the grid, solid as a slab and a step. */
  V.box('fsRoofSkin', S.x0 - 0.5, S.my0 - 0.5, S.roof, S.x1 + 0.5, S.my1 + 0.5, S.roof + 0.4, { draw: false, name: 'stage roof' });
  V.box('fsRoofSkin', S.x0 + 2, S.my0 - 0.5, S.roof + 0.4, S.x1 - 2, S.my1 + 0.5, S.roof + 1.6, { draw: false, name: 'stage roof' });
  V.op({ t: 'vault', m: 'cxStageBlack', x0: S.x0 - 0.5, x1: S.x1 + 0.5, y0: S.my0 - 0.5, y1: S.my1 + 0.5, h0: S.roof, rise: 2.2 });
  /* The header under the front beam: the festival's name. */
  V.box('cxStageBlack', S.x0 - 0.2, S.my0 + 1.5, S.roof - 3.2, S.x0 - 0.05, S.my1 - 1.5, S.roof - 1.0, { cast: false, name: 'header' });
  V.sign('stageHead', S.x0 - 0.2, (S.my0 + S.my1) / 2, S.roof - 2.1, 'w', 32, 2.1, 0.02);

  /* The LED wall: its black frame solid, its picture ./show.js's. */
  V.box('cxStageBlack', LED.x0, LED.y0, S.deck, LED.x1, LED.y1, LED.h1, { name: 'led wall' });
  V.post('cxStageBlack', LED.x1 + 0.5, LED.y0 + 2, S.deck, LED.h1, 0.12);
  V.post('cxStageBlack', LED.x1 + 0.5, LED.y1 - 2, S.deck, LED.h1, 0.12);
  /* The gap over it: from the crowd over the wall into backstage, under
   * the roof's grid. */
  V.gap('OVER THE WALL', (LED.x0 + LED.x1) / 2, (LED.y0 + LED.y1) / 2, 0, LED.y1 - LED.y0 - 2 * MARGIN,
    LED.h1 + MARGIN, top - S.beam / 2 - LED.h1 - 2 * MARGIN, 500);

  /* The line arrays: twelve boxes in a J, hung by chains from the front
   * beam; solid as one box. */
  for (const g of HANGS) {
    V.hidden(HANG.x0, g.y0, HANG.h0, HANG.x1, g.y1, HANG.h1, 'line array');
    const n = 12;
    const step = (HANG.h1 - HANG.h0) / n;
    for (let i = 0; i < n; i += 1) {
      /* The J: the lower boxes splay forward, toward the crowd. */
      const lean = Math.max(0, (6 - i) * 0.06);
      const h0 = HANG.h0 + i * step;
      V.deco('cxSpeaker', HANG.x0 - lean, g.y0, h0 + 0.03, HANG.x1 - lean, g.y1, h0 + step - 0.03);
      V.sign('arrayFace', HANG.x0 - lean, (g.y0 + g.y1) / 2, h0 + step / 2, 'w', g.y1 - g.y0 - 0.16, step - 0.2, 0.02, { fine: true });
    }
    for (const y of [g.y0 + 0.2, g.y1 - 0.2]) {
      V.wire([HANG.x0 + 0.6, y, HANG.h1], [HANG.x0 + 0.6, y, top - S.beam / 2], 0);
    }
  }
  /* The gaps each side between a tower and its hang. */
  V.gap('SOUTH HANG', tx[0], (ty[0] + t / 2 + HANGS[0].y0) / 2, 0, HANGS[0].y0 - (ty[0] + t / 2) - 2 * MARGIN,
    HANG.h0 + MARGIN, S.roof - 3.2 - HANG.h0 - 2 * MARGIN, 500);
  V.gap('NORTH HANG', tx[0], (ty[1] - t / 2 + HANGS[1].y1) / 2, 0, (ty[1] - t / 2) - HANGS[1].y1 - 2 * MARGIN,
    HANG.h0 + MARGIN, S.roof - 3.2 - HANG.h0 - 2 * MARGIN, 500);
  /* Onto the stage between the hangs, under the header. */
  V.gap('ONTO THE STAGE', S.x0 - 0.4, 110, 0, HANGS[1].y0 - HANGS[0].y1 - 2 * MARGIN, S.deck + MARGIN,
    S.roof - 3.2 - S.deck - 2 * MARGIN, 100);

  /* The sub stacks under the lip, in blocks with a gap between. */
  for (let y = S.my0 + 1; y + 3 <= S.my1 - 1 + 1e-9; y += 4.5) {
    V.box('cxSpeaker', 197.6, y, 0, S.x0, y + 3, 1.3, { name: 'sub stack' });
    V.sign('subFace', 197.6, y + 0.785, 0.65, 'w', 1.27, 1.1, 0.02, { fine: true });
    V.sign('subFace', 197.6, y + 2.215, 0.65, 'w', 1.27, 1.1, 0.02, { fine: true });
  }
  /* The flame posts along the lip. */
  for (const y of [95, 101, 119, 125]) {
    V.post('cxStageBlack', S.x0 + 0.4, y, S.deck, S.deck + 0.7, 0.18, { seg: 8, name: 'flame post' });
    V.glow(S.x0 + 0.4, y, S.deck + 0.78, 0.12, 'lampRed');
  }
  /* The light fixtures along the front beam, pointing down at the crowd:
   * a row of blinders, the moving heads between them. */
  for (let y = S.my0 + 2.5; y < S.my1 - 2; y += 2.6) {
    V.op({ t: 'cylx', m: 'cxStageBlack', x: S.x0 + 0.2, y, h: top - 0.9, r: 0.2, len: 0.45, fine: true });
    V.glow(S.x0 - 0.05, y, top - 0.9, 0.13);
  }

  /* The wings: scaffold faced with the festival's banners, solid. */
  for (const [y0, y1, face] of [[S.y0, S.my0 - 0.4, 's'], [S.my1 + 0.4, S.y1, 'n']]) {
    V.box('cxStageBlack', S.x0 + 3, y0, S.deck, S.x1, y1, 17, { name: 'wing' });
    V.sign('wingBanner', S.x0 + 3, (y0 + y1) / 2, 10, 'w', 8, 12.5, 0.03);
    for (const y of [y0, y1]) {
      V.post('cxScaffold', S.x0 + 2.9, y, S.deck, 17.6, 0.06, { solid: false, fine: true });
    }
    V.glow(S.x0 + 2.9, (y0 + y1) / 2, 17.4, 0.25);
    void face;
  }

  /* The DJ's riser: a slab on four legs, open underneath, the decks on a
   * table at its front edge, the steps up its back. */
  const R = RISER;
  const rt = S.deck + R.top;
  V.box('cxStageBlack', R.x0, R.y0, rt - R.slab, R.x1, R.y1, rt, { name: 'riser' });
  V.deco('white', R.x0 - 0.02, R.y0, rt - 0.06, R.x0, R.y1, rt, { cast: false, fine: true });
  for (const [x, y] of [[R.x0 + 0.2, R.y0 + 0.2], [R.x1 - 0.2, R.y0 + 0.2], [R.x1 - 0.2, R.y1 - 0.2], [R.x0 + 0.2, R.y1 - 0.2]]) {
    V.post('cxScaffold', x, y, S.deck, rt - R.slab, R.leg, { name: 'riser leg' });
  }
  V.box('cxStageBlack', R.x1, R.y1 - 2, S.deck, R.x1 + 1.4, R.y1, S.deck + 0.8, { name: 'riser step' });
  V.box('cxStageBlack', R.x1, R.y1 - 2, S.deck + 0.8, R.x1 + 0.7, R.y1, S.deck + 1.6, { name: 'riser step' });
  /* The table and the decks: two players and the mixer, lit faces, and
   * the booth's lit front with the festival's mark on it. */
  V.box('cxDesk', R.x0 + 0.3, 107.4, rt, R.x0 + 1.1, 112.6, rt + 1.0, { name: 'dj table' });
  V.sign('djBooth', R.x0 + 0.3, 110, rt + 0.5, 'w', 5.2, 1.0, 0.02);
  V.deco('lampGlow', R.x0 + 0.26, 107.4, rt + 0.96, R.x0 + 0.3, 112.6, rt + 1.0, { cast: false });
  V.deco('cxGelPink', R.x0 - 0.02, R.y0, rt - R.slab, R.x0, R.y1, rt - R.slab + 0.08, { cast: false });
  for (const [y0, y1] of [[107.7, 108.9], [109.4, 110.6], [111.1, 112.3]]) {
    V.deco('cxDeskFace', R.x0 + 0.4, y0, rt + 1.0, R.x0 + 1.0, y1, rt + 1.08, { cast: false });
    V.deco('lampGlow', R.x0 + 0.42, y0 + 0.1, rt + 1.08, R.x0 + 0.47, y1 - 0.1, rt + 1.1, { cast: false, fine: true });
  }
  V.op({ t: 'cylv', m: 'cxDeskFace', x: R.x0 + 0.7, y: 108.3, h0: rt + 1.08, h1: rt + 1.12, r: 0.22, seg: 12, fine: true });
  V.op({ t: 'cylv', m: 'cxDeskFace', x: R.x0 + 0.7, y: 111.7, h0: rt + 1.08, h1: rt + 1.12, r: 0.22, seg: 12, fine: true });
  /* The DJ, headphones on, an arm up at the drop, and the host beside. */
  V.fan(R.x0 + 1.6, 110, rt, 'drToriiBlack', { cheer: true, phones: true, face: 180 });
  V.fan(R.x0 + 1.9, 113.4, rt, 'cxPink', { cheer: true, face: 180 });
  /* The gap: under the slab, the riser's length. */
  V.gap('UNDER THE DECKS', (R.x0 + R.x1) / 2, (R.y0 + R.y1) / 2, 90, R.x1 - R.x0 - 0.4 - 2 * R.leg - 2 * MARGIN,
    S.deck + MARGIN, R.top - R.slab - 2 * MARGIN, 1000);
  /* Road cases and a crew member at the side of the stage. */
  for (const [x, y] of [[215.5, 93], [216.5, 93], [215.5, 126.5]]) {
    V.box('cxStageBlack', x - 0.45, y - 0.35, S.deck, x + 0.45, y + 0.35, S.deck + 1.0, { name: 'road case' });
  }
  V.fan(213, 127.2, S.deck, 'drToriiBlack', { phones: true, face: 270 });

  /* The pit: the barrier the whole front, its returns to the wings,
   * security facing the crowd. */
  barrier(V, BARRIER.x0, BARRIER.y0, BARRIER.x1, BARRIER.y1, BARRIER.h, 'crowd barrier');
  barrier(V, BARRIER.x0, BARRIER.y0 - 0.6, S.x0, BARRIER.y0, BARRIER.h, 'barrier return');
  barrier(V, BARRIER.x0, BARRIER.y1, S.x0, BARRIER.y1 + 0.6, BARRIER.h, 'barrier return');
  V.deco('cxSteel', BARRIER.x1, BARRIER.y0, 0, BARRIER.x1 + 0.9, BARRIER.y1, 0.06, { cast: false });
  for (let y = 84; y < 138; y += 9) {
    V.fan(194.2, y + hash(y, 3) * 3, 0, 'cxGold', { face: 180 });
  }
  /* The camera jib in the pit, its arm out over the crowd. */
  V.post('cxStageBlack', 195.2, 103, 0, 2.6, 0.12, { name: 'jib post' });
  for (const d of [0, 120, 240]) {
    const p = along(195.2, 103, d, 1.2);
    V.cap('cxScaffold', [195.2, 103, 1.4], [p[0], p[1], 0], 0.04, { name: 'jib leg' });
  }
  V.cap('cxStageBlack', [198.4, 104.4, 1.8], [186, 99, 7.6], 0.1, { name: 'jib arm' });
  V.box('cxStageBlack', 186.2 - 0.35, 99 - 0.3, 7.0, 186.2 + 0.35, 99 + 0.3, 7.6, { name: 'jib camera' });
  V.box('cxSteel', 198.0, 104.0, 1.5, 198.8, 104.8, 2.2, { name: 'jib weight' });

  /* The side screens, each on its scaffold tower, open underneath. The
   * screens' pictures are ./show.js's; their frames are solid. */
  for (const [i, g] of IMAG.entries()) {
    scaffold(V, IMAG_T.x0, g.y0 + 0.2, IMAG_T.x1, g.y1 - 0.2, 0, IMAG_T.top, [IMAG_T.under, 11, IMAG_T.top], 'we');
    V.box('cxStageBlack', IMAG_T.x0 - 0.5, g.y0 - 0.2, IMAG_T.scr0, IMAG_T.x0 - 0.1, g.y1 + 0.2, IMAG_T.scr1, { name: 'side screen' });
    V.gap(i ? 'UNDER THE NORTH SCREEN' : 'UNDER THE SOUTH SCREEN', (IMAG_T.x0 + IMAG_T.x1) / 2, (g.y0 + g.y1) / 2, 90,
      IMAG_T.x1 - IMAG_T.x0 - 0.12 - 2 * MARGIN, MARGIN, IMAG_T.under - 0.04 - 2 * MARGIN, 250);
  }
}

/* ------------------------------------------------------------------ */
/* Front of house                                                      */
/* ------------------------------------------------------------------ */

function frontOfHouse(V) {
  const F = FOH;
  /* The pen's barrier, its gate on the west side at the lane. */
  barrier(V, PEN.x0, PEN.y0, PEN.x1, PEN.y0 + 0.5);
  barrier(V, PEN.x0, PEN.y1 - 0.5, PEN.x1, PEN.y1);
  barrier(V, PEN.x0, PEN.y0, PEN.x0 + 0.5, 108);
  barrier(V, PEN.x0, 112, PEN.x0 + 0.5, PEN.y1);
  barrier(V, PEN.x1 - 0.5, PEN.y0, PEN.x1, LANE.y0);
  barrier(V, PEN.x1 - 0.5, LANE.y1, PEN.x1, PEN.y1);
  /* The platform, the tent's poles and roof. */
  V.box('cxDeck', F.x0, F.y0, 0, F.x1, F.y1, F.deck, { name: 'foh deck' });
  V.deco('cxStageBlack', F.x0 - 0.02, F.y0, 0, F.x1 + 0.02, F.y1, F.deck - 0.05, { cast: false, fine: true });
  for (const [x, y] of [[F.x0 + 0.2, F.y0 + 0.2], [F.x1 - 0.2, F.y0 + 0.2], [F.x1 - 0.2, F.y1 - 0.2], [F.x0 + 0.2, F.y1 - 0.2]]) {
    V.post('cxSteel', x, y, F.deck, F.roof, 0.06);
  }
  V.box('cxStageBlack', F.x0 - 0.4, F.y0 - 0.4, F.roof, F.x1 + 0.4, F.y1 + 0.4, F.roof + 0.3, { name: 'foh roof' });
  V.op({ t: 'pyr', m: 'cxStageBlack', x0: F.x0 - 0.4, y0: F.y0 - 0.4, x1: F.x1 + 0.4, y1: F.y1 + 0.4, h0: F.roof + 0.3, h1: F.roof + 1.5 });
  V.hidden(F.x0 + 2.6, F.y0 + 3, F.roof + 0.3, F.x1 - 2.6, F.y1 - 3, F.roof + 0.9, 'foh peak');
  V.sign('foh', F.x1 + 0.4, (F.y0 + F.y1) / 2, F.roof + 0.15, 'e', 4, 0.3, 0.02);
  /* The sound desk: a long console, its faders lit, the racks and the
   * lighting desk to the sides. */
  V.box('cxDesk', 139, 106.6, F.deck, 141, 113.4, F.deck + 0.8, { name: 'sound desk' });
  V.box('cxDesk', 140.2, 106.6, F.deck + 0.8, 141, 113.4, F.deck + 1.1, { name: 'desk bridge' });
  V.deco('cxDeskFace', 139.1, 106.8, F.deck + 0.8, 140.2, 113.2, F.deck + 0.84, { cast: false });
  for (let y = 107; y < 113; y += 0.35) {
    V.deco('lampGlow', 139.3, y, F.deck + 0.84, 139.5, y + 0.06, F.deck + 0.86, { cast: false, fine: true });
  }
  V.deco('lampGlow', 140.25, 107.5, F.deck + 0.85, 140.27, 112.5, F.deck + 1.05, { cast: false, fine: true });
  for (const [y0, y1] of [[104.6, 106.2], [113.8, 115.4]]) {
    V.box('cxStageBlack', 143.2, y0, F.deck, 144.4, y1, F.deck + 1.8, { name: 'rack' });
    V.deco('cxGelTeal', 143.18, y0 + 0.2, F.deck + 1.2, 143.2, y1 - 0.2, F.deck + 1.5, { cast: false, fine: true });
  }
  V.box('cxDesk', 137, 113.8, F.deck, 138.4, 115.6, F.deck + 0.9, { name: 'lighting desk' });
  /* The engineers, facing the stage. */
  V.fan(138.2, 107.2, F.deck, 'drToriiBlack', { phones: true, face: 0 });
  V.fan(138.2, 112.9, F.deck, 'drToriiBlack', { face: 0 });
  V.fan(136.6, 114.7, F.deck, 'cxTeal', { face: 0 });
  /* The gap: in over the desk from the west, out over the crowd. */
  V.gap('THROUGH FOH', (F.x0 + F.x1) / 2, 110, 0, 5, F.deck + 1.95, F.roof - F.deck - 1.95 - MARGIN, 500);

  /* The follow spot tower behind the desk. */
  const S = SPOT;
  scaffold(V, S.x0, S.y0, S.x1, S.y1, 0, S.roof, [2, 4, S.deck, S.roof], 'ns');
  V.box('grating', S.x0, S.y0, S.deck, S.x1, S.y1, S.deck + 0.25, { name: 'spot deck' });
  V.box('cxStageBlack', S.x0 - 0.2, S.y0 - 0.2, S.roof, S.x1 + 0.2, S.y1 + 0.2, S.roof + 0.25, { name: 'spot roof' });
  for (const y of [107, 113]) {
    V.post('cxStageBlack', S.x1 - 0.6, y, S.deck + 0.25, S.deck + 1.2, 0.08, { name: 'spot stand' });
    V.cap('cxStageBlack', [S.x1 - 1.0, y, S.deck + 1.45], [S.x1 - 0.1, y, S.deck + 1.45], 0.18, { name: 'follow spot', look: 'capsule' });
    V.glow(S.x1 - 0.05, y, S.deck + 1.45, 0.14);
    V.fan(S.x1 - 1.5, y, S.deck + 0.25, 'drToriiBlack', { face: 0 });
  }
  V.op({ t: 'ladder', m: 'cxScaffold', a: [S.x0 + 0.5, S.y0 - 0.05, 0], b: [S.x0 + 0.5, S.y0 - 0.05, S.deck] });
  V.gap('SPOT TOWER', (S.x0 + S.x1) / 2, (S.y0 + S.y1) / 2, 0, 4, S.deck + 0.25 + MARGIN, S.roof - S.deck - 0.25 - 2 * MARGIN, 250);

  /* The snake: the cable from the desk down the lane to the stage. */
  V.paint('cxStageBlack', 146, 109.9, 192.4, 110.1, 0.06);
}

/* ------------------------------------------------------------------ */
/* The crowd and what stands in it                                     */
/* ------------------------------------------------------------------ */

/* How tightly packed the crowd is at plan x: shoulder to shoulder at the
 * barrier, looser back toward the desk. People per square metre. */
export function crowdDensity(x) {
  if (x > 150) {
    return 1.25 - ((192 - x) / 42) * 0.35;
  }
  return 0.82 - ((150 - x) / 46) * 0.2;
}

/* A totem: a pole a fan holds up so their friends can find them. */
const TOTEMS = [
  { x: 160, y: 84, m: 'cxPink', kind: 'flag' }, { x: 174, y: 126, m: 'cxTeal', kind: 'ball' },
  { x: 140, y: 92, m: 'cxGold', kind: 'flag' }, { x: 118, y: 132, m: 'cxViolet', kind: 'ball' },
  { x: 184, y: 96, m: 'white', kind: 'flag' }, { x: 132, y: 78, m: 'mxRed', kind: 'ball' },
  { x: 110, y: 96, m: 'cxMint', kind: 'flag' }, { x: 168, y: 140, m: 'craneYellow', kind: 'flag' },
];

function crowd(V) {
  /* The blocks, solid to head height and drawn as the people in them. */
  for (const b of CROWD_BLOCKS) {
    V.hidden(b.x0, b.y0, 0, b.x1, b.y1, CROWD_H, 'crowd', 'wall');
  }
  /* The people: a jittered grid, each cell holding one or not by the
   * density there. Faced toward the stage, give or take. Half a metre in
   * from a block's edge, so nobody stands out of it. */
  let k = 0;
  for (const b of CROWD_BLOCKS) {
    for (let y = b.y0 + 0.45; y < b.y1 - 0.45; y += 0.84) {
      for (let x = b.x0 + 0.45; x < b.x1 - 0.45; x += 0.84) {
        k += 1;
        if (hash(k, 31) * 1.42 > crowdDensity(x)) {
          continue;
        }
        const px = x + (hash(k, 32) - 0.5) * 0.5;
        const py = y + (hash(k, 33) - 0.5) * 0.5;
        if (TOTEMS.some((t) => Math.abs(t.x - px) < 0.5 && Math.abs(t.y - py) < 0.5)) {
          continue;
        }
        /* Toward the riser, not straight east: the crowd turns to the DJ. */
        const face = Math.round(Math.atan2(110 - py, 208 - px) / DEG + (hash(k, 34) - 0.5) * 50);
        V.crowd.push({
          x: Math.round(px * 100) / 100,
          y: Math.round(py * 100) / 100,
          face,
          shirt: Math.floor(hash(k, 35) * 9),
          arms: hash(k, 36) < (px > 160 ? 0.42 : 0.22) ? 1 : 0,
          s: Math.round((0.92 + hash(k, 37) * 0.16) * 100) / 100,
          phase: Math.round(hash(k, 38) * 100) / 100,
        });
      }
    }
  }
  for (const t of TOTEMS) {
    V.post('cxSteel', t.x, t.y, 0, 5.4, 0.03, { name: 'totem' });
    if (t.kind === 'flag') {
      V.op({ t: 'flag', m: t.m, x: t.x, y: t.y, h0: 3.6, h1: 5.3 });
    } else {
      V.op({ t: 'ball', m: t.m, c: [t.x, t.y, 5.75], r: 0.45 });
      V.hidden(t.x - 0.3, t.y - 0.3, 5.4, t.x + 0.3, t.y + 0.3, 6.1, 'totem ball');
    }
  }
  /* The cable lane's fences. */
  barrier(V, LANE.x0, LANE.y0 - 0.2, LANE.x1, LANE.y0, 1.1, 'lane fence');
  barrier(V, LANE.x0, LANE.y1, LANE.x1, LANE.y1 + 0.2, 1.1, 'lane fence');
  V.gap('THE CROWD SPLIT', 172, (LANE.y0 + LANE.y1) / 2, 0, LANE.y1 - LANE.y0 - 2 * MARGIN, MARGIN, CROWD_H - 2 * MARGIN, 500);

  /* The delay towers, each in a pen of its own. */
  DELAYS.forEach((d, i) => {
    const x0 = d.x - DELAY.half;
    const x1 = d.x + DELAY.half;
    const y0 = d.y - DELAY.half;
    const y1 = d.y + DELAY.half;
    const lifts = [];
    for (let h = DELAY.step; h < DELAY.top - 0.1; h += DELAY.step) {
      lifts.push(h);
    }
    lifts.push(DELAY.top);
    scaffold(V, x0 + 0.1, y0 + 0.1, x1 - 0.1, y1 - 0.1, 0, DELAY.top + 1.2, lifts, 'ns');
    V.box('grating', x0, y0, DELAY.top, x1, y1, DELAY.top + 0.15, { name: 'delay deck' });
    /* The speakers on a bar out the back, facing the people behind. */
    V.cap('cxScaffold', [x0 + 0.1, d.y, DELAY.top + 0.9], [x0 - 1.2, d.y, DELAY.top + 0.9], 0.06, { name: 'delay bar' });
    V.box('cxSpeaker', x0 - 1.6, d.y - 1.3, 9.2, x0 - 0.6, d.y + 1.3, DELAY.top + 0.5, { name: 'delay speakers' });
    V.sign('delayFace', x0 - 1.6, d.y, (9.3 + DELAY.top + 0.4) / 2, 'w', 2.4, DELAY.top + 0.4 - 9.3, 0.02, { fine: true });
    V.glow(x1 - 0.1, d.y, DELAY.top + 1.3, 0.2, 'lampRed');
    barrier(V, x0 - 2.4, y0 - 1.6, x1 + 1.4, y0 - 1.1);
    barrier(V, x0 - 2.4, y1 + 1.1, x1 + 1.4, y1 + 1.6);
    barrier(V, x1 + 0.9, y0 - 1.1, x1 + 1.4, y1 + 1.1);
    V.gap(i ? 'NORTH DELAY' : 'SOUTH DELAY', d.x, d.y, 0, 2 * DELAY.half - 0.2 - 0.12 - 2 * MARGIN,
      2 * DELAY.step + 0.04 + MARGIN, DELAY.step - 0.08 - 2 * MARGIN, 250);
  });

  /* The lighting goalpost across the crowd, its truss lit underneath. */
  const G = GOAL;
  truss(V, [G.x, G.y0, 0], [G.x, G.y0, G.top], 1.0, 'goalpost leg');
  truss(V, [G.x, G.y1, 0], [G.x, G.y1, G.top], 1.0, 'goalpost leg');
  truss(V, [G.x, G.y0, G.top - 0.5], [G.x, G.y1, G.top - 0.5], 1.0, 'goalpost truss');
  for (let y = G.y0 + 4; y < G.y1 - 2; y += 4) {
    V.glow(G.x, y, G.top - 1.15, 0.16);
  }
  V.box('cxStageBlack', G.x - 0.55, 98, G.top - 1.6, G.x + 0.55, 122, G.top - 1.0, { name: 'goalpost banner' });
  V.sign('goalBanner', G.x + 0.55, 110, G.top - 0.8, 'e', 24, 1.6, 0.02);
  V.sign('goalBanner', G.x - 0.55, 110, G.top - 0.8, 'w', 24, 1.6, 0.02);
  V.gap('THE GOALPOST', G.x, (G.y0 + G.y1) / 2, 0, G.y1 - G.y0 - 1.0 - 2 * MARGIN, CROWD_H + MARGIN, G.top - 1.6 - CROWD_H - 2 * MARGIN, 100);
}

/* ------------------------------------------------------------------ */
/* Round the field                                                     */
/* ------------------------------------------------------------------ */

function bars(V) {
  BARS.forEach((B, i) => {
    const front = B.face > 0 ? B.y1 : B.y0;
    const back = B.face > 0 ? B.y0 : B.y1;
    tent(V, B.x0, B.y0, B.x1, B.y1, 3.2, 6.2, i ? 'cxTeal' : 'cxPink', 3);
    /* The counter along the front, the fridges along the back. */
    V.box('cxStageBlack', B.x0 + 0.5, front - B.face * 1.2, 0, B.x1 - 0.5, front - B.face * 0.4, 1.1, { name: 'bar counter' });
    V.deco('cxGold', B.x0 + 0.5, front - B.face * 0.42, 1.1, B.x1 - 0.5, front - B.face * 1.22, 1.16);
    V.box('cxCream', B.x0 + 0.5, back + B.face * 0.2, 0, B.x1 - 0.5, back + B.face * 0.9, 1.9, { name: 'fridges' });
    V.deco('glassLit', B.x0 + 0.6, back + B.face * 0.9, 0.3, B.x1 - 0.6, back + B.face * 0.92, 1.7, { cast: false, fine: true });
    V.box('cxStageBlack', (B.x0 + B.x1) / 2 - 3.1, front + B.face * 0.2, 2.15, (B.x0 + B.x1) / 2 + 3.1, front + B.face * 0.26, 3.2, { name: 'bar board' });
    V.sign('bar', (B.x0 + B.x1) / 2, front, 2.7, B.face > 0 ? 'n' : 's', 6, 1.0, 0.27);
    for (let x = B.x0 + 2; x < B.x1 - 1; x += 3.2) {
      V.fan(x, front - B.face * 2.0, 0, 'drToriiBlack', { face: B.face > 0 ? 90 : 270 });
      V.fan(x + 0.8, front + B.face * (0.9 + hash(Math.round(x), i) * 2), 0, SHIRTS[Math.round(x) % SHIRTS.length], { face: B.face > 0 ? 270 : 90, cheer: hash(Math.round(x), 7 + i) < 0.25 });
    }
    for (let x = B.x0 + 1; x < B.x1; x += 4.5) {
      const y = front + B.face * 6;
      V.op({ t: 'cylv', m: 'cxStageBlack', x, y, h0: 0, h1: 1.05, r: 0.05, seg: 6 });
      V.box('cxStageBlack', x - 0.4, y - 0.4, 1.05, x + 0.4, y + 0.4, 1.1, { name: 'poseur table' });
      V.hidden(x - 0.08, y - 0.08, 0, x + 0.08, y + 0.08, 1.05, 'table leg', 'pole');
    }
  });
}

function trucks(V) {
  const T = TRUCKS;
  const paints = ['cxGold', 'cxPink', 'cxTeal', 'mxRed', 'cxMint', 'cxViolet'];
  T.xs.forEach((x, i) => {
    const x0 = x - 3.2;
    const x1 = x + 3.2;
    V.box(paints[i], x0, T.y0, 0.45, x1, T.y1, 3.2, { name: 'food truck' });
    V.deco('white', x0 + 0.02, T.y0 - 0.02, 2.6, x1 - 0.02, T.y1 + 0.02, 3.2, { cast: false });
    for (const xw of [x0 + 1.2, x1 - 1.2]) {
      V.op({ t: 'wheel', x: xw, y: T.y0 - 0.02 });
    }
    /* The hatch, open: its lit window, the flap propped over it, the
     * counter shelf, the sign. */
    V.deco('glassLit', x - 2, T.y0 - 0.02, 1.25, x + 2, T.y0, 2.3, { cast: false });
    V.box(paints[i], x - 2.1, T.y0 - 1.0, 2.35, x + 2.1, T.y0, 2.45, { name: 'truck flap' });
    V.box('white', x - 2, T.y0 - 0.35, 1.2, x + 2, T.y0, 1.26, { name: 'truck shelf' });
    V.sign(`truck${i % 4}`, x, T.y0 - 0.04, 2.9, 's', 5.2, 0.55, 0.02);
    V.fan(x - 0.6, T.y0 + 0.8, 0.45, 'white', { face: 270 });
    /* The queue. */
    const n = 2 + (i % 3);
    for (let q = 0; q < n; q += 1) {
      V.fan(x + (hash(i, q) - 0.5) * 1.2, T.y0 - 1.6 - q * 0.9, 0, SHIRTS[(i + q) % SHIRTS.length], { face: 90 });
    }
  });
  /* Benches in front of them. */
  for (let x = 90; x < 126; x += 8) {
    V.box('fsBench', x, 168.4, 0.65, x + 3, 169.4, 0.75, { name: 'picnic table' });
    V.hidden(x + 0.2, 168.6, 0, x + 2.8, 169.2, 0.65, 'picnic table legs');
  }
}

function toilets(V) {
  /* A row of portable toilets along the south fence, solid as one row. */
  const y0 = 24;
  const y1 = 25.4;
  V.hidden(30, y0, 0, 30 + 18 * 1.3, y1, 2.35, 'toilets');
  for (let i = 0; i < 18; i += 1) {
    const x = 30 + i * 1.3;
    V.deco(i % 6 === 5 ? 'fsLooBlue' : 'mxBlue', x + 0.04, y0, 0, x + 1.26, y1, 2.2);
    V.deco('white', x + 0.02, y0 - 0.02, 2.2, x + 1.28, y1 + 0.02, 2.35);
    V.deco('fsLooBlue', x + 0.2, y1, 0.1, x + 1.1, y1 + 0.02, 2.0, { cast: false, fine: true });
  }
  V.sign('toilet', 41.7, y1 + 0.04, 2.65, 'n', 3, 0.6, 0.02);
  V.post('cxSteel', 40.2, y1 + 0.1, 2.35, 3.0, 0.03, { solid: false, fine: true });
  V.post('cxSteel', 43.2, y1 + 0.1, 2.35, 3.0, 0.03, { solid: false, fine: true });
}

function tents(V) {
  /* The merch tent, the info and first aid tents by the entrance. */
  tent(V, 24, 146, 34, 156, 3.0, 4.8, 'cxViolet');
  V.box('cxStageBlack', 24.4, 146.4, 0, 33.6, 147.2, 1.0, { name: 'merch counter' });
  V.sign('merch', 29, 145.8, 2.5, 's', 5, 0.8, 0.02);
  for (let x = 25; x < 34; x += 1.6) {
    V.deco(SHIRTS[Math.round(x) % SHIRTS.length], x, 155.6, 1.4, x + 1.1, 155.7, 2.6, { fine: true });
  }
  tent(V, 16, 124, 22, 130, 2.6, 4.0, 'white');
  V.sign('firstaid', 19, 123.8, 2.2, 's', 4, 0.6, 0.02);
  tent(V, 16, 88, 22, 94, 2.6, 4.0, 'cxGold');
  V.sign('info', 19, 94.2, 2.2, 'n', 4, 0.6, 0.02);
}

function entrance(V) {
  const A = ARCH;
  truss(V, [A.x, A.y0, 0], [A.x, A.y0, A.top], 1.0, 'arch leg');
  truss(V, [A.x, A.y1, 0], [A.x, A.y1, A.top], 1.0, 'arch leg');
  truss(V, [A.x, A.y0, A.top - 0.5], [A.x, A.y1, A.top - 0.5], 1.0, 'arch truss');
  V.box('cxStageBlack', A.x - 0.55, A.y0 + 1.5, A.top - 2.6, A.x + 0.55, A.y1 - 1.5, A.top - 1.0, { name: 'arch banner' });
  V.sign('entrance', A.x + 0.55, (A.y0 + A.y1) / 2, A.top - 1.8, 'e', 16, 1.5, 0.02);
  V.sign('entrance', A.x - 0.55, (A.y0 + A.y1) / 2, A.top - 1.8, 'w', 16, 1.5, 0.02);
  for (let y = A.y0 + 1.5; y < A.y1 - 1; y += 2) {
    V.glow(A.x, y, A.top - 1.15, 0.13);
  }
  V.gap('ENTRANCE ARCH', A.x, (A.y0 + A.y1) / 2, 0, A.y1 - A.y0 - 1.0 - 2 * MARGIN, 1.2 + MARGIN, A.top - 2.6 - 1.2 - 2 * MARGIN, 100);
  /* The ticket lanes: barriers under the arch, to waist height. */
  for (let y = A.y0 + 2.5; y < A.y1 - 2; y += 3) {
    barrier(V, A.x - 6, y - 0.1, A.x - 1, y + 0.1, 1.1, 'ticket lane');
  }
  for (const y of [A.y0 - 3, A.y1 + 1]) {
    V.box('cxCream', A.x - 7, y, 0, A.x - 3, y + 2, 2.6, { name: 'ticket booth' });
    V.box('cxPink', A.x - 7.2, y - 0.2, 2.6, A.x - 2.8, y + 2.2, 2.85, { name: 'booth roof' });
    V.deco('glassLit', A.x - 2.98, y + 0.3, 1.1, A.x - 2.96, y + 1.7, 2.0, { cast: false, fine: true });
  }
}

function fence(V) {
  /* Mesh panels on blocks, two metres, round the plot; solid as a thin
   * wall, drawn as the net it is. A gap in the west side for the arch. */
  const F = FENCE;
  const runs = [
    { a: [F.x0, F.y0], b: [F.x1, F.y0] },
    { a: [F.x0, F.y1], b: [F.x1, F.y1] },
    { a: [F.x1, F.y0], b: [F.x1, F.y1] },
    { a: [F.x0, F.y0], b: [F.x0, ARCH.y0 - 0.5] },
    { a: [F.x0, ARCH.y1 + 0.5], b: [F.x0, F.y1] },
  ];
  for (const r of runs) {
    const vx = r.a[0] === r.b[0];
    if (vx) {
      V.box('cxSteel', r.a[0] - 0.03, r.a[1], 0, r.a[0] + 0.03, r.b[1], F.h, { draw: false, name: 'fence' });
    } else {
      V.box('cxSteel', r.a[0], r.a[1] - 0.03, 0, r.b[0], r.a[1] + 0.03, F.h, { draw: false, name: 'fence' });
    }
    const len = Math.abs(vx ? r.b[1] - r.a[1] : r.b[0] - r.a[0]);
    const n = Math.max(1, Math.round(len / 3.5));
    for (let i = 0; i < n; i += 1) {
      const t0 = i / n;
      const t1 = (i + 1) / n;
      const p = [r.a[0] + (r.b[0] - r.a[0]) * t0, r.a[1] + (r.b[1] - r.a[1]) * t0];
      const q = [r.a[0] + (r.b[0] - r.a[0]) * t1, r.a[1] + (r.b[1] - r.a[1]) * t1];
      V.op({ t: 'net', a: p, b: q, h0: 0.1, h1: F.h });
      V.op({ t: 'cylv', m: 'cxSteel', x: p[0], y: p[1], h0: 0, h1: F.h, r: 0.025, seg: 4 });
    }
  }
}

/*
 * THE FERRIS WHEEL: a rim of twenty four tubes, twelve spokes, the hub, an
 * A frame each side, a cabin hung under every spoke's end and a light at
 * each joint. The spokes stand at fifteen degrees either side of level, so
 * the sector each side of the hub level with it is open: a window through
 * the wheel, east and west.
 */
function wheel(V) {
  const Wh = WHEEL;
  const ring = [];
  for (let i = 0; i < Wh.segs; i += 1) {
    sincos((i * 360 / Wh.segs + 7.5) * DEG, SC);
    ring.push([Wh.x + SC.c * Wh.r, Wh.hub + SC.s * Wh.r]);
  }
  for (let i = 0; i < Wh.segs; i += 1) {
    const a = ring[i];
    const b = ring[(i + 1) % Wh.segs];
    V.cap('cxWheel', [a[0], Wh.y, a[1]], [b[0], Wh.y, b[1]], 0.18, { name: 'wheel rim', seg: 6 });
    V.glow(a[0], Wh.y - 0.25, a[1], 0.22);
  }
  for (let i = 0; i < Wh.spokes; i += 1) {
    sincos((i * 360 / Wh.spokes + 15) * DEG, SC);
    const hx = Wh.x + SC.c * 1.4;
    const hh = Wh.hub + SC.s * 1.4;
    const ex = Wh.x + SC.c * Wh.r;
    const eh = Wh.hub + SC.s * Wh.r;
    V.cap('cxWheel', [hx, Wh.y, hh], [ex, Wh.y, eh], 0.1, { name: 'wheel spoke', seg: 5 });
  }
  for (let i = 0; i < Wh.spokes; i += 1) {
    /* The cabin, hung on its pin under the rim halfway between two
     * spokes, so no spoke runs through it at the top of the turn. */
    sincos((i * 360 / Wh.spokes) * DEG, SC);
    const ex = Wh.x + SC.c * (Wh.r - 0.1);
    const eh = Wh.hub + SC.s * (Wh.r - 0.1);
    const cab = ['cxCabinA', 'cxCabinB', 'cxCabinC'][i % 3];
    V.cap('cxSteel', [ex, Wh.y - 0.7, eh], [ex, Wh.y + 0.7, eh], 0.06, { name: 'cabin pin' });
    /* A round pod, as a comic's ferris wheel has: a capsule across the
     * wheel, solid as drawn, a lit window band each side and a knob on top
     * where it hangs. */
    V.cap(cab, [ex, Wh.y - 0.45, eh - 1.45], [ex, Wh.y + 0.45, eh - 1.45], 0.85, { name: 'cabin', look: 'capsule', seg: 10 });
    V.post('white', ex, Wh.y, eh - 0.75, eh - 0.35, 0.16, { name: 'cabin hanger' });
    V.deco('glassLit', ex - 0.87, Wh.y - 0.42, eh - 1.75, ex - 0.84, Wh.y + 0.42, eh - 1.2, { cast: false, fine: true });
    V.deco('glassLit', ex + 0.84, Wh.y - 0.42, eh - 1.75, ex + 0.87, Wh.y + 0.42, eh - 1.2, { cast: false, fine: true });
  }
  V.cap('cxWheel', [Wh.x, Wh.y - Wh.half, Wh.hub], [Wh.x, Wh.y + Wh.half, Wh.hub], 0.6, { name: 'axle', look: 'capsule', seg: 10 });
  V.cap('cxGold', [Wh.x, Wh.y - 0.4, Wh.hub], [Wh.x, Wh.y + 0.4, Wh.hub], 1.4, { name: 'hub', seg: 12 });
  for (const s of [-1, 1]) {
    const y = Wh.y + s * Wh.half;
    V.cap('cxWheel', [Wh.x - Wh.legs, y, 0], [Wh.x, y, Wh.hub], 0.3, { name: 'wheel leg' });
    V.cap('cxWheel', [Wh.x + Wh.legs, y, 0], [Wh.x, y, Wh.hub], 0.3, { name: 'wheel leg' });
    V.cap('cxWheel', [Wh.x - Wh.legs * 0.55, y, Wh.hub * 0.45], [Wh.x + Wh.legs * 0.55, y, Wh.hub * 0.45], 0.15, { name: 'wheel tie' });
  }
  /* The platform cabins are boarded from, and its little ticket hut. */
  V.box('cxCream', Wh.x - 4, Wh.y - 3.4, 0, Wh.x + 4, Wh.y + 3.4, 0.5, { name: 'wheel platform' });
  V.box('cxPink', Wh.x + 5, Wh.y - 6, 0, Wh.x + 7, Wh.y - 4, 2.4, { name: 'wheel hut' });
  V.op({ t: 'pyr', m: 'white', x0: Wh.x + 4.7, y0: Wh.y - 6.3, x1: Wh.x + 7.3, y1: Wh.y - 3.7, h0: 2.4, h1: 3.3 });
  V.hidden(Wh.x + 5.4, Wh.y - 5.6, 2.4, Wh.x + 6.6, Wh.y - 4.4, 2.9, 'wheel hut roof');
  /* The windows: the sectors level with the hub, either side, in the
   * wheel's plane, flown along its axle. */
  const rIn = 6.25;
  const rOut = 9.75;
  const hgt = 2.2;
  V.gap('THE BIG WHEEL', Wh.x + (rIn + rOut) / 2, Wh.y, 90, rOut - rIn, Wh.hub - hgt / 2, hgt, 1000);
  V.gap('WHEEL WEST', Wh.x - (rIn + rOut) / 2, Wh.y, 90, rOut - rIn, Wh.hub - hgt / 2, hgt, 1000);
}

function backstage(V) {
  /* The firework racks: rows of mortar boxes on the grass behind the
   * compound, a fuse line between them. */
  for (let y = 56; y <= 164; y += 12) {
    for (let x = 252; x <= 264; x += 6) {
      V.box('cxMortar', x - 1.0, y - 0.5, 0, x + 1.0, y + 0.5, 0.7, { name: 'mortar rack' });
      V.deco('drToriiBlack', x - 0.9, y - 0.4, 0.7, x + 0.9, y + 0.4, 0.72, { cast: false, fine: true });
    }
  }
  V.post('cxSteel', 250, 50, 0, 3.0, 0.04);
  V.sign('danger', 250, 49.96, 2.4, 's', 1.2, 0.9, 0.02);
  /* Generators, a fuel tank. */
  for (const y of [60, 70]) {
    V.box('cxCream', 228, y, 0, 234, y + 2.4, 2.4, { name: 'generator' });
    V.deco('drToriiBlack', 228.4, y + 2.4, 0.4, 233.6, y + 2.42, 2.0, { cast: false, fine: true });
    V.post('drToriiBlack', 229, y + 1.2, 2.4, 3.4, 0.08);
  }
  V.cap('cxWheel', [236, 64, 0.9], [242, 64, 0.9], 0.9, { name: 'fuel tank', look: 'capsule', seg: 10 });
  /* The production office: containers, by the document's own furniture,
   * placed in ./yard.js. The artists' cabins here. */
  for (let y = 150; y < 176; y += 6) {
    V.box('cxCream', 226, y, 0, 232, y + 4, 2.8, { name: 'artist cabin' });
    V.box('cxStageBlack', 225.8, y - 0.2, 2.8, 232.2, y + 4.2, 3.0, { name: 'cabin roof' });
    V.deco('glassLit', 225.98, y + 1, 1.2, 226, y + 3, 2.2, { cast: false, fine: true });
  }
  V.fan(224, 158, 0, 'drToriiBlack', { phones: true, face: 180 });
  V.fan(222.6, 152, 0, 'cxGold', { face: 90 });
}

/* ------------------------------------------------------------------ */
/* The marks                                                           */
/* ------------------------------------------------------------------ */

/* The partners' and patrons' banners: on the barrier's crowd face and on
 * the desk's pen, facing the people. */
export const BANNERS = [
  { x: BARRIER.x0, y: 84, face: 'w' }, { x: BARRIER.x0, y: 92, face: 'w' }, { x: BARRIER.x0, y: 100, face: 'w' },
  { x: BARRIER.x0, y: 120, face: 'w' }, { x: BARRIER.x0, y: 128, face: 'w' }, { x: BARRIER.x0, y: 136, face: 'w' },
  { x: PEN.x0, y: 104, face: 'w' }, { x: PEN.x0, y: 116, face: 'w' },
  { x: 74, y: BARS[0].y1, face: 'n' }, { x: 74, y: BARS[1].y0, face: 's' },
];

/* The one hidden Konex Drone sign: inside the north delay tower, on its
 * north face, between the second and third lifts. Readable only from
 * inside the tower, so the line through it is the line to it. */
export const HIDDEN_KONEX = { x: DELAYS[1].x, y: DELAYS[1].y + DELAY.half - 0.14, h: 5.0, w: 1.0 };

/* ------------------------------------------------------------------ */
/* The fireworks' and lasers' places, for ./show.js                    */
/* ------------------------------------------------------------------ */

/* Where shells go up from (the racks) and where they burst, in the plan,
 * fixed: the show is the same every night. */
export function fireworkShells(n) {
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const rack = [252 + (i % 3) * 6, 56 + Math.floor(hash(i, 51) * 10) * 12];
    out.push({
      from: [rack[0], rack[1], 0.7],
      at: [206 + hash(i, 52) * 40, 50 + hash(i, 53) * 120, 52 + hash(i, 54) * 40],
      kind: i % 5 === 4 ? 'willow' : (i % 3 === 2 ? 'ring' : 'peony'),
      colour: i % 7,
      period: Math.round((6 + hash(i, 55) * 6) * 100) / 100,
      offset: Math.round(hash(i, 56) * 1400) / 100,
    });
  }
  return out;
}

/* The lasers: emitters along the front beam, each sweeping its own fan. */
export function laserBeams(n) {
  const S = STAGE;
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const t = n > 1 ? i / (n - 1) : 0.5;
    out.push({
      from: [S.x0 + 0.3, S.my0 + 4 + t * (S.my1 - S.my0 - 8), S.roof - 1.2],
      yaw: 180 + (t - 0.5) * 40,
      pitch: 4 + (i % 3) * 3,
      sweep: 22 + (i % 2) * 10,
      phase: Math.round(hash(i, 61) * 628) / 100,
      colour: i % 3,
    });
  }
  return out;
}

/*
 * The trees round the outside of the fence, drawn the way the manga draws
 * a tree in the background of a panel: a short trunk under three to five
 * big round puffs (cherries to the west and north where the town would be,
 * greens to the south), and the pines behind the stage as three stacked
 * whorls. The builder's own trees are a cherry of twenty blobs and a dozen
 * limbs, two thousand triangles each; these are a fifth of that, so the
 * belt can be two deep for what one row cost. Solid as drawn, as the
 * builder's are: the trunk a tapered capsule, each puff a ball inside it.
 */
function tree(V, x, y, style, S, k) {
  if (style === 'pine') {
    const top = 9.4 * S;
    V.cap('stCedarWood', [x, y, 0], [x, y, top * 0.7], 0.2 * S, { name: 'trunk', kind: 'tree', seg: 6 });
    const tiers = [];
    for (let i = 0; i < 3; i += 1) {
      const h0 = (2.0 + i * 2.3) * S;
      const r = (2.5 - i * 0.62) * S * (0.92 + hash(k, 40 + i) * 0.16);
      const ht = (3.6 - i * 0.3) * S;
      tiers.push({ h0, r, ht, tone: i === 2 ? 0 : i === 1 ? 1 : 2 });
      /* The largest ball the cone holds, sitting on its base. */
      const sinA = r / Math.hypot(r, ht);
      const rin = (ht * sinA) / (1 + sinA);
      V.P.cap('stCedar1', w(x, y, h0 + rin), w(x, y, h0 + rin), rin * 0.95, { draw: false, name: 'canopy', kind: 'canopy' });
    }
    V.op({ t: 'pine', x, y, tiers, spin: hash(k, 44) * 6.28 });
    return;
  }
  const trunkH = (style === 'sakura' ? 2.3 : 2.9) * S;
  const lean = (hash(k, 45) - 0.5) * 0.5 * S;
  V.cap('trunk', [x, y, 0], [x + lean, y, trunkH], 0.21 * S, { name: 'trunk', kind: 'tree', seg: 6 });
  const tx = x + lean;
  const R = (style === 'sakura' ? 1.45 : 1.65) * S;
  const blobs = [{ c: [tx, y, trunkH + R * 0.85], r: R, tone: 1 }];
  const n = 3 + Math.floor(hash(k, 46) * 2);
  const turn = hash(k, 47) * 360;
  for (let i = 0; i < n; i += 1) {
    sincos((turn + (i * 360) / n) * DEG, SC);
    const rr = R * (0.62 + hash(k, 48 + i) * 0.18);
    blobs.push({ c: [tx + SC.c * R * 0.85, y + SC.s * R * 0.85, trunkH + R * (0.45 + hash(k, 52 + i) * 0.5)], r: rr, tone: hash(k, 56 + i) > 0.5 ? 2 : 1 });
  }
  blobs.push({ c: [tx + (hash(k, 60) - 0.5) * R * 0.5, y + (hash(k, 61) - 0.5) * R * 0.5, trunkH + R * 1.75], r: R * 0.62, tone: 0 });
  for (const b of blobs) {
    V.P.cap('stGrove1', w(...b.c), w(...b.c), 0.78 * b.r * 0.86, { draw: false, name: 'canopy', kind: 'canopy' });
  }
  V.op({ t: 'crown', style, blobs, spin: hash(k, 62) * 6.28 });
}

function trees(V) {
  let k = 0;
  const S = (i) => 0.9 + hash(i, 63) * 0.35;
  for (const row of [0, 1]) {
    for (let x = 4 + row * 4.5; x < FIELD_W - 3; x += 9) {
      k += 1;
      /* North of the fence: cherries, pines behind the stage. */
      tree(V, x + (hash(k, 1) - 0.5) * 3, FENCE.y1 + 6 + row * 6.5 + hash(k, 2) * 3, x > 200 ? 'pine' : 'sakura', S(k), k);
      k += 1;
      /* South: greens, a pine in every third. */
      tree(V, x + (hash(k, 4) - 0.5) * 3, FENCE.y0 - 5.5 - row * 6.5 - hash(k, 5) * 2, k % 3 ? 'street' : 'pine', S(k), k);
    }
  }
  for (let y = FENCE.y0 + 4; y < FENCE.y1 - 2; y += 9) {
    k += 1;
    tree(V, FENCE.x1 + 5 + hash(k, 7) * 3, y + hash(k, 8) * 3, 'pine', S(k), k);
  }
}

export function venueLayout() {
  const V = new Venue();
  ground(V);
  stage(V);
  frontOfHouse(V);
  crowd(V);
  bars(V);
  trucks(V);
  toilets(V);
  tents(V);
  entrance(V);
  fence(V);
  wheel(V);
  backstage(V);
  trees(V);
  return {
    parts: V.P.list, ops: V.ops, signs: V.signs, gaps: V.gaps, wires: V.wires, fans: V.fans, crowd: V.crowd,
  };
}
