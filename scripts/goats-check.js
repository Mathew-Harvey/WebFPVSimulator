/*
 * goats-check.js: 90%er goat herding (src/maps/goats/), proved in plain
 * Node, the way scripts/heads-check.js proves Heads' house. In these
 * blocks:
 *
 *   1. house      Heads' house is Heads' house: every prism, flat, disc,
 *                 cylinder and cone the same, and every part the same but
 *                 the yard track's gates and the two cars moved off the
 *                 drive
 *   2. street     every part finite, every drawn colour one the kit knows,
 *                 two builds the same to the bit, and the shapes and one
 *                 step's gather under the physics module's caps
 *   3. goats      one goat for every 90%er sticker but the patches, each
 *                 with a logo, none starting in a solid, near the garage
 *                 or in a house
 *   4. herding    the way into the garage is open; a goat pushed up the
 *                 drive runs in, is counted once and stays in through ten
 *                 minutes; a goat left alone never walks into the garage
 *                 or into a solid; the herd's step, the cars in it, stays
 *                 cheap
 *   5. cars       the street's traffic (src/maps/goats/traffic.js) is made
 *                 with no problem and taken whole by the physics module,
 *                 dist/sim.wasm; driven by the module's own clock, every
 *                 car drives a whole lap with its box CAR_CLEAR from every
 *                 solid of the map's, kerbs and parked cars included, and
 *                 no two cars ever touch; and through twenty minutes of
 *                 goats put in front of them, chased by a craft half the
 *                 time, no car ever has a goat's middle inside it and no
 *                 goat is ever in a solid
 *   7. room       goat herding in a room (src/game/goatroom.js), two
 *                 pages and a stand in board: both let the goats out to
 *                 the same places, the host's herd credits a goat the other
 *                 pilot pushes in and its bots' goats, the other page's
 *                 herd stays with the host's, what the herd costs on the
 *                 wire, and the clock ends the round with a winner
 *   6. others     the round with bots (src/game/goatround.js): craft
 *                 handed to the herd as `others` but out of reach change
 *                 nothing to the bit; a goat one of them pushes home is
 *                 that one's; the way home reaches every goat the herd
 *                 starts with; and a herder flying the bots' rule, at
 *                 every skill, gets each of a dozen goats home inside a
 *                 round
 *
 * Usage: node scripts/goats-check.js
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

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { headsLayout, FRAME } from '../src/maps/heads/heads.js';
import { WALL_STICKERS } from '../src/maps/heads/logos.js';
import { PATRONS, MAX_PATRON_GOATS, tidy } from '../src/maps/goats/patrons.js';
import { hoodLayout, BOUNDS, PARK } from '../src/maps/goats/hood.js';
import { goatsDocument } from '../src/maps/goats/yard.js';
import {
  makeGrid, makeHerd, homeField, GARAGE_IN, HOME,
} from '../src/maps/goats/herd.js';
import { GOAT_BOTS, herdPoint } from '../src/game/goatround.js';
import { GoatRoom } from '../src/game/goatroom.js';
import { DOGFIGHT_EVERY, ME } from '../src/game/dogfight.js';
import { goatTraffic } from '../src/maps/goats/traffic.js';
import { uploadTraffic } from '../src/maps/built/traffic.js';
import { makeVehiclePoses, readVehicles, setVehicleClock } from '../src/game/plantworld.js';
import { loadSim } from '../tests/lib/simmod.js';
import { MATERIALS as HOME_MATERIALS } from '../src/props/homes.js';
import { placeSolids } from '../src/props/solids.js';
import { normalize } from '../src/trackbuilder/model.js';
import { seatDocument } from '../src/maps/built/place.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
let failures = 0;

function check(name, ok, detail = '') {
  if (!ok) {
    failures += 1;
  }
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`);
}

const { OX, OZ, S } = FRAME;
const toPlan = (x, z) => [(x - OX) / S, (OZ - z) / S];
/* The house's rooms, as ./src/maps/goats/index.js keeps the goats out. */
const ROOMS = { x0: -0.2, x1: 13.9, y0: -0.1, y1: 8.6 };
/* The colours the street may draw besides the homes': the town's street
 * tree's, its cars' and its lamps', which the kit already knows. */
const KIT_PREFIXES = ['stGrove', 'car', 'lamp', 'st'];
/* The herd's step, microseconds, for the whole herd. Measured at about 20
 * in Node on this container; this is the line a change has to argue past. */
const STEP_US_MAX = 120;
/* The cars. Every car's box from every solid it passes, world metres:
 * tight by design, because a lane runs a quarter of a plan metre past a
 * parked car's side (src/maps/goats/traffic.js), 0.875 m in the world, so
 * this is the most of that the line can ask for with room for the
 * module's own easing. A solid whose top is under GROUND of the car's
 * wheels is ground it rolls on. The clock the cars are driven over for
 * the solids and for each other, ms, which every loop laps inside, and
 * every how many ms a pose is taken. Each car as the herd takes it, in
 * CAR_STRIDE numbers (src/maps/goats/cardraw.js). */
const CAR_CLEAR = 0.5;
const GROUND = 0.1;
const CARS_MS = 4 * 60 * 1000;
const CARS_EVERY = 10;
const CAR_STRIDE = 8;
const J = (x) => JSON.stringify(x);

/* src/native/world.c's numbers, read from its source as heads-check.js
 * reads them. */
async function worldLimits() {
  const src = await readFile(join(root, 'src/native/world.c'), 'utf8');
  const def = (name) => {
    const m = src.match(new RegExp(`#define ${name} \\(?([0-9.]+)(?: << ([0-9]+))?`));
    if (!m) {
      throw new Error(`src/native/world.c has no ${name}`);
    }
    return m[2] ? Number(m[1]) * 2 ** Number(m[2]) : Number(m[1]);
  };
  return {
    shapes: def('WORLD_MAX_SHAPES'),
    cand: def('WORLD_MAX_CAND'),
    cellMin: def('WORLD_CELL_MIN'),
    cells: def('WORLD_MAX_CELLS'),
  };
}

/* The most shapes one step's gather can return: heads-check.js's
 * worstGather, restated. */
function worstGather(solids, lim) {
  const plan = solids.map((s) => {
    if (s.box) {
      return [s.box[0], -s.box[5], s.box[3], -s.box[2]];
    }
    const c = s.cap;
    return [Math.min(c[0], c[3]) - c[6], -Math.max(c[2], c[5]) - c[6], Math.max(c[0], c[3]) + c[6], -Math.min(c[2], c[5]) + c[6]];
  });
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const b of plan) {
    x0 = Math.min(x0, b[0]);
    y0 = Math.min(y0, b[1]);
    x1 = Math.max(x1, b[2]);
    y1 = Math.max(y1, b[3]);
  }
  let cell = lim.cellMin;
  while ((Math.floor((x1 - x0) / cell) + 1) * (Math.floor((y1 - y0) / cell) + 1) > lim.cells) {
    cell *= 2;
  }
  const nx = Math.floor((x1 - x0) / cell) + 1;
  const ny = Math.floor((y1 - y0) / cell) + 1;
  const cells = Array.from({ length: nx * ny }, () => []);
  plan.forEach((b, i) => {
    for (let cx = Math.floor((b[0] - x0) / cell); cx <= Math.floor((b[2] - x0) / cell); cx += 1) {
      for (let cy = Math.floor((b[1] - y0) / cell); cy <= Math.floor((b[3] - y0) / cell); cy += 1) {
        cells[cx * ny + cy].push(i);
      }
    }
  });
  let worst = 0;
  for (let cx = 0; cx < nx; cx += 1) {
    for (let cy = 0; cy < ny; cy += 1) {
      const four = new Set(cells[cx * ny + cy]);
      for (const [dx, dy] of [[1, 0], [0, 1], [1, 1]]) {
        if (cx + dx < nx && cy + dy < ny) {
          for (const i of cells[(cx + dx) * ny + cy + dy]) {
            four.add(i);
          }
        }
      }
      worst = Math.max(worst, four.size);
    }
  }
  return { worst, cell };
}

function houseBlock() {
  console.log('1. house');
  const a = headsLayout();
  const b = headsLayout({ yardTrack: false, clearDrive: true });
  for (const k of ['prisms', 'flats', 'discs', 'cyls', 'cones']) {
    check(`Heads' house's ${k} are his map's`, J(a[k]) === J(b[k]), `${b[k].length}`);
  }
  const inB = new Set(b.parts.map(J));
  const inA = new Set(a.parts.map(J));
  const gone = a.parts.filter((p) => !inB.has(J(p)));
  const added = b.parts.filter((p) => !inA.has(J(p)));
  const yardOrCar = (p) => String(p.m).startsWith('car') || /^yard (gate|pole)/.test(String(p.name));
  check('the only parts gone are the yard track\'s and the drive\'s two cars', gone.every(yardOrCar),
    `${gone.length} gone, ${gone.filter((p) => !yardOrCar(p)).map((p) => p.name).slice(0, 3).join(', ') || 'all yard track or car'}`);
  check('the only parts added are the two cars at the kerb', added.every((p) => String(p.m).startsWith('car')), `${added.length}`);
  return b;
}

async function streetBlock(house) {
  console.log('\n2. street');
  const hood = hoodLayout();
  const bad = hood.parts.filter((p) => (p.t === 'box' ? [...p.lo, ...p.hi] : [...p.a, ...p.b, p.r]).some((v) => !Number.isFinite(v)));
  check('every part is finite', bad.length === 0, `${hood.parts.length} parts`);
  const grove = hood.grove.filter((g) => [...(g.c || g.a), ...(g.b || []), g.r].some((v) => !Number.isFinite(v)));
  check('every tree is finite', grove.length === 0, `${hood.stats.trees} trees`);
  const colours = new Set([
    ...hood.parts.filter((p) => p.draw).map((p) => p.m),
    ...hood.prisms.map((p) => p.m), ...hood.flats.map((p) => p.m), ...hood.discs.map((p) => p.m),
    ...hood.cyls.map((p) => p.m), ...hood.cones.map((p) => p.m), ...hood.grove.map((g) => g.m),
  ]);
  const unknown = [...colours].filter((m) => !HOME_MATERIALS[m] && !KIT_PREFIXES.some((k) => m.startsWith(k)));
  check('every colour the street draws is one the kit knows', unknown.length === 0, unknown.join(', ') || `${colours.size} colours`);
  const unused = Object.keys(HOME_MATERIALS).filter((m) => m.startsWith('goat') && !colours.has(m));
  check('every one of the street\'s own colours in src/props/homes.js is drawn', unused.length === 0, unused.join(', ') || 'all drawn');
  const hash = (L) => createHash('sha256').update(J([L.parts, L.prisms, L.flats, L.discs, L.cyls, L.cones, L.scaled, L.grove])).digest('hex');
  check('two builds are the same to the bit', hash(hood) === hash(hoodLayout()));
  const { doc, repairs } = normalize(goatsDocument());
  check('the document normalizes with no repairs', repairs.length === 0, repairs.join(' | ') || `${doc.elements.length} elements`);
  const { placed } = seatDocument(doc);
  placeSolids([...house.parts, ...hood.parts.filter((p) => p.solid)], 0, 0, 0, 0, 'quarter', placed.solids, placed.stats);
  const lim = await worldLimits();
  check(`the map's ${placed.solids.length} shapes are under world.c's WORLD_MAX_SHAPES`, placed.solids.length < lim.shapes, `${lim.shapes}`);
  const g = worstGather(placed.solids, lim);
  check('the most one step gathers is under world.c\'s WORLD_MAX_CAND', g.worst < lim.cand, `${g.worst} over cells of ${g.cell} m, the cap ${lim.cand}`);
  console.log(`        ${hood.stats.houses} houses, ${hood.stats.trees} trees, ${hood.stats.cars} cars, ${hood.stats.lights} street lights`);
  return { hood, solids: placed.solids };
}

function goatsBlock(house, hood) {
  console.log('\n3. goats');
  const grid = makeGrid([...house.parts, ...hood.parts], toPlan, S, BOUNDS, [...hood.blocks, ROOMS]);
  const names = WALL_STICKERS.map((c) => c.name);
  check('one goat for every 90%er sticker but the patches', names.length === 98 && !names.includes('90%'), `${names.length}`);
  check('every goat has a logo cut from a sheet', WALL_STICKERS.every((c) => c.w > 0 && c.h > 0 && (c.sheet === 0 || c.sheet === 1)));
  /* The patrons' goats ride on the same herd (src/maps/goats/patrons.js). */
  const tidied = tidy();
  check('the patron list has entries, all labelled EXAMPLE until real ones are added', tidied.length === PATRONS.length && tidied.length > 0, `${tidied.length}`);
  const many = Array.from({ length: MAX_PATRON_GOATS + 25 }, (_, i) => ({ name: `Patron ${i}` }));
  check(`tidy holds the patrons to MAX_PATRON_GOATS (${MAX_PATRON_GOATS})`, tidy(many).length === MAX_PATRON_GOATS);
  const rough = tidy([null, {}, { name: '' }, { name: 5 }, { name: '  <b>Ann</b>  ', logo: '../../etc/x.png', tier: 'platinum' }, { name: 'Bo', logo: 'assets/patrons/bo.png', tier: 'gold' }]);
  check('tidy drops a bad entry, strips symbols, refuses an unsafe logo path and an unknown tier',
    rough.length === 2 && rough[0].name === 'bAnnb' && rough[0].logo === '' && rough[0].tier === 'bronze' && rough[1].logo === 'assets/patrons/bo.png' && rough[1].tier === 'gold', JSON.stringify(rough));
  const herd = makeHerd([...names, ...tidied.map((p) => p.name)], grid, { parks: [PARK] });
  check('a patron goat is in the herd after the 90%ers', herd.count === names.length + tidied.length && herd.names[names.length] === tidied[0].name, `${herd.count}`);
  const stuck = [];
  const near = [];
  for (let i = 0; i < herd.count; i += 1) {
    if (grid.blocked(herd.X[i], herd.Y[i])) {
      stuck.push(herd.names[i]);
    }
    if (Math.hypot(herd.X[i] - 15.9, herd.Y[i] - 4) < 20) {
      near.push(herd.names[i]);
    }
  }
  check('no goat starts in a solid', stuck.length === 0, stuck.slice(0, 3).join(', ') || `${herd.count} placed`);
  check('no goat starts within 20 m of the garage', near.length === 0, near.slice(0, 3).join(', ') || 'clear');
  check('no goat starts home', herd.homeCount() === 0);
  return { grid, names };
}

function herdingBlock(grid, names, world) {
  console.log('\n4. herding');
  const way = [[15.9, -12], [15.9, -6], [15.9, -1], [15.9, 0.5], [15.9, 2], [15.9, 5]];
  const shut = way.filter(([x, y]) => grid.blocked(x, y));
  check('the drive and the open garage door are clear to a goat', shut.length === 0, shut.map((p) => p.join(',')).join(' ') || `${way.length} points`);
  const inside = [[0.5, 4], [7, 4], [12.5, 4]].filter(([x, y]) => !grid.blocked(x, y));
  check('the house\'s rooms are shut to a goat', inside.length === 0, inside.map((p) => p.join(',')).join(' ') || 'shut');

  /* A goat left alone for twenty minutes: never in a solid, never home. */
  const calm = makeHerd(names, grid, { parks: [PARK] });
  let solid = 0;
  for (let k = 0; k < 20 * 60 * 30; k += 1) {
    calm.step(1 / 30, null);
    if (k % 30 === 0) {
      for (let i = 0; i < calm.count; i += 1) {
        solid += grid.blocked(calm.X[i], calm.Y[i]) ? 1 : 0;
      }
    }
  }
  check('twenty minutes alone, no goat is ever in a solid', solid === 0, `${solid} goat seconds`);
  check('twenty minutes alone, no goat walks into the garage', calm.homeCount() === 0, `${calm.homeCount()}`);

  /* A goat pushed up the drive from the street by a craft behind it. */
  const herd = makeHerd(names, grid, { parks: [PARK] });
  herd.place(0, 15.9, -12);
  let homed = -1;
  for (let k = 0; k < 60 * 40; k += 1) {
    const dx = 15.9 - herd.X[0];
    const dy = 4 - herd.Y[0];
    const d = Math.hypot(dx, dy) || 1;
    herd.step(1 / 60, { x: herd.X[0] - (dx / d) * 2.2, y: herd.Y[0] - (dy / d) * 2.2, h: 0.8 });
    if (herd.MODE[0] === HOME) {
      homed = k / 60;
      break;
    }
  }
  check('a goat pushed up the drive runs into the garage', homed >= 0, homed >= 0 ? `${homed.toFixed(1)} s` : 'never');
  const ev = herd.events.filter((e) => e.kind === 'home');
  check('it is counted home once, as the first', ev.length === 1 && ev[0].goat === 0 && ev[0].count === 1, J(ev));
  /* Ten minutes on, a craft flying through the garage: it stays. */
  let out = 0;
  for (let k = 0; k < 10 * 60 * 30; k += 1) {
    const t = k / 30;
    herd.step(1 / 30, { x: 15.9 + 1.5 * Math.sin(t), y: 4 + 3 * Math.cos(t * 0.7), h: 0.5 });
    const inPen = herd.X[0] > GARAGE_IN.x0 - 0.5 && herd.X[0] < GARAGE_IN.x1 + 0.5 && herd.Y[0] > GARAGE_IN.y0 - 0.5 && herd.Y[0] < GARAGE_IN.y1 + 0.5;
    out += inPen && herd.MODE[0] === HOME ? 0 : 1;
  }
  check('ten minutes on, with a craft flying round the garage, it is still home', out === 0, `${out} steps out`);
  check('and the count is still one', herd.homeCount() === 1, `${herd.homeCount()}`);

  /* The same herd taken whole by another, as a rebuild for a change of
   * graphics takes it: the same goats home, and stepped side by side the
   * two stay the same to the bit. */
  const copy = makeHerd(names, grid, { parks: [PARK] });
  const took = copy.adopt(herd.state());
  let apart = 0;
  for (let k = 0; k < 30 * 60; k += 1) {
    const c = { x: 15.9 + Math.sin(k / 50) * 20, y: -10, h: 0.7 };
    herd.step(1 / 30, c);
    copy.step(1 / 30, c);
    for (let i = 0; i < herd.count; i += 1) {
      apart += herd.X[i] === copy.X[i] && herd.Y[i] === copy.Y[i] && herd.MODE[i] === copy.MODE[i] ? 0 : 1;
    }
  }
  check('a rebuild takes the herd whole: the goat home stays home, and a minute on the two herds are the same to the bit',
    took && copy.homeCount() === 1 && copy.MODE[0] === HOME && apart === 0, `${apart} goat steps apart`);
  /* Let the goats out: none home, the clock not started, nobody in a
   * solid or near the garage, and somewhere new. */
  const before = Array.from(herd.X);
  herd.reset();
  let moved = 0;
  let bad = 0;
  for (let i = 0; i < herd.count; i += 1) {
    moved += herd.X[i] !== before[i] ? 1 : 0;
    bad += grid.blocked(herd.X[i], herd.Y[i]) || Math.hypot(herd.X[i] - 15.9, herd.Y[i] - 4) < 20 || herd.MODE[i] === HOME ? 1 : 0;
  }
  check('letting the goats out puts every goat back on the street, somewhere new, none home and the clock not started',
    herd.homeCount() === 0 && !herd.started() && herd.events.length === 0 && bad === 0 && moved > herd.count / 2,
    `${moved} moved, ${bad} in a solid, near the garage or home`);

  /* The step's cost, the whole herd, a craft in a group of them and the
   * street's cars, as the map steps it. */
  const cost = makeHerd(names, grid, { parks: [PARK] });
  for (let k = 0; k < 600; k += 1) {
    cost.step(1 / 60, null);
  }
  world.at(60000);
  let best = Infinity;
  for (let rep = 0; rep < 3; rep += 1) {
    const t0 = performance.now();
    for (let k = 0; k < 3000; k += 1) {
      cost.step(1 / 60, { x: cost.X[5] + 2, y: cost.Y[5], h: 0.8 }, world.feed, world.n);
    }
    best = Math.min(best, ((performance.now() - t0) / 3000) * 1000);
  }
  check(`the herd's step is under ${STEP_US_MAX} microseconds`, best < STEP_US_MAX, `${best.toFixed(1)} us, best of three`);
}

function othersBlock(grid, names) {
  console.log('\n6. others');
  /* Others overhead, out of the spook's reach: the herd as it is alone. */
  const a = makeHerd(names, grid, { parks: [PARK] });
  const b = makeHerd(names, grid, { parks: [PARK] });
  const high = new Float64Array([0, 0, 1e9, 10, 10, 50, -20, 4, 3.3]);
  let apart = 0;
  for (let k = 0; k < 60 * 60; k += 1) {
    const c = { x: a.X[3] + 2.5, y: a.Y[3], h: 0.9 };
    a.step(1 / 60, c);
    b.step(1 / 60, { ...c }, null, 0, high, 3);
    for (let i = 0; i < a.count; i += 1) {
      apart += a.X[i] === b.X[i] && a.Y[i] === b.Y[i] && a.MODE[i] === b.MODE[i] ? 0 : 1;
    }
  }
  check('others out of reach change nothing: a minute side by side, the same to the bit', apart === 0, `${apart} goat steps apart`);

  /* A goat pushed up the drive by the second of two others. */
  const herd = makeHerd(names, grid, { parks: [PARK] });
  herd.place(0, 15.9, -12);
  const two = new Float64Array([-60, -60, 0.8, 0, 0, 0.8]);
  let homed = false;
  for (let k = 0; k < 60 * 40 && !homed; k += 1) {
    const dx = 15.9 - herd.X[0];
    const dy = 4 - herd.Y[0];
    const d = Math.hypot(dx, dy) || 1;
    two[3] = herd.X[0] - (dx / d) * 2.2;
    two[4] = herd.Y[0] - (dy / d) * 2.2;
    herd.step(1 / 60, null, null, 0, two, 2);
    homed = herd.MODE[0] === HOME;
  }
  const ev = herd.events.filter((e) => e.kind === 'home');
  check('a goat the second other pushes home is the second other\'s', homed && ev.length === 1 && ev[0].by === 2, J(ev));

  /* The way home, and the bots' rule flown by a herder that goes where it
   * means to: behind its goat on the way home, low when it is there, over
   * the roofs on the way round. */
  const field = homeField(grid);
  const start = makeHerd(names, grid, { parks: [PARK] });
  let lost = 0;
  for (let i = 0; i < start.count; i += 1) {
    lost += field.at(start.X[i], start.Y[i]) < 0 ? 1 : 0;
  }
  check('the way home reaches every goat where the herd first starts', lost === 0, `${start.count - lost} of ${start.count}`);
  /* Let out again and again, no goat starts in a yard with no way out a
   * goat can walk: one in twenty five did, before the herd asked. */
  let shut = 0;
  for (let r = 0; r < 20; r += 1) {
    start.reset();
    for (let i = 0; i < start.count; i += 1) {
      shut += field.at(start.X[i], start.Y[i]) < 0 ? 1 : 0;
    }
  }
  check('let out twenty times, every goat can get home', shut === 0, `${shut} of ${start.count * 20} shut in`);
  const way = new Float64Array(2);
  const at = new Float64Array(2);
  const one = new Float64Array(3);
  for (const skill of Object.keys(GOAT_BOTS)) {
    const sk = GOAT_BOTS[skill];
    const times = [];
    for (let trial = 0; trial < 12; trial += 1) {
      start.reset();
      /* A goat a bot would go after: one with a way home. */
      let t = (trial * 7) % start.count;
      while (field.at(start.X[t], start.Y[t]) < 0) {
        t = (t + 1) % start.count;
      }
      let bx = start.X[t] + 20;
      let by = start.Y[t] + 20;
      let bh = 6.5;
      let done = -1;
      let best = Infinity;
      let bestAt = 0;
      let side = 0;
      for (let k = 0; k < 60 * 180 && done < 0; k += 1) {
        const left = field.at(start.X[t], start.Y[t]);
        if (left < best) {
          best = left;
          bestAt = k;
        } else if (k - bestAt > 150) {
          side = side > 0 ? -1.4 : 1.4;
          bestAt = k;
        }
        herdPoint(field, start.X[t], start.Y[t], sk.behind, side, way, at);
        const dx = at[0] - bx;
        const dy = at[1] - by;
        const d = Math.hypot(dx, dy);
        const ahead = (bx - start.X[t]) * way[0] + (by - start.Y[t]) * way[1] > 0;
        const low = d < 3 && !ahead;
        const step = Math.min(d, (low ? sk.pace : 12) / 60);
        if (d > 1e-6) {
          bx += (dx / d) * step;
          by += (dy / d) * step;
        }
        bh += Math.max(-4 / 60, Math.min(4 / 60, (low ? 1.3 : 6.5) - bh));
        one[0] = bx;
        one[1] = by;
        one[2] = bh;
        start.step(1 / 60, null, null, 0, one, 1);
        if (start.MODE[t] === HOME) {
          done = k / 60;
        }
      }
      times.push(done);
    }
    const home = times.filter((x) => x >= 0);
    check(`a ${skill} herder gets each of a dozen goats home inside three minutes`, home.length === times.length,
      times.map((x) => (x >= 0 ? `${x.toFixed(0)} s` : 'never')).join(' '));
  }
}

/*
 * The street's traffic in the physics module, as the map uploads it:
 * `at(ms)` sets the module's clock and reads every car, into `poses` (the
 * shell's frame, Y up) and into `feed`, the numbers the herd takes, made
 * as src/maps/goats/cardraw.js makes them.
 */
async function carWorld() {
  const { traffic } = goatTraffic();
  const sim = await loadSim(await readFile(join(root, 'dist/sim.wasm')));
  sim.e.sim_world_clear();
  sim.e.sim_world_build();
  const up = uploadTraffic(sim, traffic);
  const poses = makeVehiclePoses();
  const cars = traffic.vehicles;
  const feed = new Float64Array(cars.length * CAR_STRIDE);
  const at = (ms) => {
    setVehicleClock(sim, ms);
    readVehicles(sim, poses);
    cars.forEach((v, k) => {
      const p = poses[v.slot];
      const f = k * CAR_STRIDE;
      const [x, y] = toPlan(p.x, p.z);
      feed[f] = x;
      feed[f + 1] = y;
      feed[f + 2] = p.hx;
      feed[f + 3] = -p.hz;
      feed[f + 4] = p.speed / S;
      feed[f + 5] = v.length / S / 2;
      feed[f + 6] = v.width / S / 2;
      feed[f + 7] = p.on ? 1 : 0;
    });
  };
  return { traffic, up, poses, cars, feed, n: cars.length, at };
}

/* Two boxes in plan, each its middle, its unit heading and its half
 * length and width, overlap: the separating axis test on the four axes. */
function boxesMeet(a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  for (const [ux, uz] of [[a.hx, a.hz], [-a.hz, a.hx], [b.hx, b.hz], [-b.hz, b.hx]]) {
    const ra = a.l * Math.abs(a.hx * ux + a.hz * uz) + a.w * Math.abs(-a.hz * ux + a.hx * uz);
    const rb = b.l * Math.abs(b.hx * ux + b.hz * uz) + b.w * Math.abs(-b.hz * ux + b.hx * uz);
    if (Math.abs(dx * ux + dz * uz) > ra + rb) {
      return false;
    }
  }
  return true;
}

/* A solid as a plan box in the shell's frame, a capsule by the box round
 * it, with its foot and top. */
function solidBox(o) {
  if (o.box) {
    const b = o.box;
    return { x: (b[0] + b[3]) / 2, z: (b[2] + b[5]) / 2, hx: 1, hz: 0, l: (b[3] - b[0]) / 2, w: (b[5] - b[2]) / 2, y0: b[1], y1: b[4], o };
  }
  const c = o.cap;
  const [x0, x1] = [Math.min(c[0], c[3]) - c[6], Math.max(c[0], c[3]) + c[6]];
  const [z0, z1] = [Math.min(c[2], c[5]) - c[6], Math.max(c[2], c[5]) + c[6]];
  return { x: (x0 + x1) / 2, z: (z0 + z1) / 2, hx: 1, hz: 0, l: (x1 - x0) / 2, w: (z1 - z0) / 2, y0: Math.min(c[1], c[4]) - c[6], y1: Math.max(c[1], c[4]) + c[6], o };
}

async function carsBlock(world, solids, grid, names) {
  console.log('\n5. cars');
  const { traffic, up, poses, cars } = world;
  check('the traffic is made with no problems', traffic.problems.length === 0,
    traffic.problems.map((p) => p.message).join('; ') || `${traffic.roads.length} lanes, ${cars.length} cars`);
  check('a car on every loop, two to a loop', traffic.roads.length === 4 && cars.length === 8);
  check('two builds are the same to the bit', J(goatTraffic().traffic) === J(traffic));
  check('the physics module takes every lane and every car', up.problems.length === 0 && up.roads === traffic.roads.length && up.vehicles === cars.length,
    `${up.roads} lanes, ${up.vehicles} cars${up.problems.length ? `; ${up.problems.map((p) => p.message).join('; ')}` : ''}`);

  /* The solids a car could reach, bucketed by CELL metres of plan. */
  const CELL = 10;
  const cells = new Map();
  const key = (i, j) => i * 100003 + j;
  for (const s of solids.map(solidBox)) {
    for (let i = Math.floor((s.x - s.l) / CELL); i <= Math.floor((s.x + s.l) / CELL); i += 1) {
      for (let j = Math.floor((s.z - s.w) / CELL); j <= Math.floor((s.z + s.w) / CELL); j += 1) {
        if (!cells.has(key(i, j))) {
          cells.set(key(i, j), []);
        }
        cells.get(key(i, j)).push(s);
      }
    }
  }
  const box = (v, p, grow) => ({ x: p.x, z: p.z, hx: p.hx, hz: p.hz, l: v.length / 2 + grow, w: v.width / 2 + grow });
  const hits = new Map();
  let touch = 0;
  let touchAt = '';
  let finite = true;
  world.at(0);
  const from = cars.map((v) => poses[v.slot].distance);
  for (let ms = 0; ms <= CARS_MS; ms += CARS_EVERY) {
    world.at(ms);
    const boxes = cars.map((v) => box(v, poses[v.slot], 0));
    cars.forEach((v, k) => {
      const p = poses[v.slot];
      if (!p.on || ![p.x, p.y, p.z, p.hx, p.hz, p.speed].every(Number.isFinite)) {
        finite = false;
        return;
      }
      const b = box(v, p, CAR_CLEAR);
      const reach = Math.ceil((b.l + 1) / CELL);
      const ci = Math.floor(p.x / CELL);
      const cj = Math.floor(p.z / CELL);
      for (let i = ci - reach; i <= ci + reach; i += 1) {
        for (let j = cj - reach; j <= cj + reach; j += 1) {
          for (const s of cells.get(key(i, j)) || []) {
            if (s.y1 > p.y + GROUND && s.y0 < p.y + v.height && boxesMeet(b, s) && !hits.has(s)) {
              hits.set(s, `${v.element} at ${(ms / 1000).toFixed(1)} s on ${s.o.name || s.o.kind} at ${s.x.toFixed(1)}, ${s.z.toFixed(1)}`);
            }
          }
        }
      }
      for (let m = k + 1; m < cars.length; m += 1) {
        if (boxesMeet(boxes[k], boxes[m])) {
          touch += 1;
          touchAt = touchAt || `${v.element} and ${cars[m].element} at ${(ms / 1000).toFixed(1)} s`;
        }
      }
    });
  }
  const laps = cars.map((v) => (poses[v.slot].distance - from[cars.indexOf(v)]) / traffic.roads[v.road].length);
  check('every car\'s pose is finite and on the street', finite);
  check(`every car drives at least a whole lap in ${CARS_MS / 60000} minutes`, laps.every((l) => l >= 1), laps.map((l) => l.toFixed(2)).join(' '));
  check(`every car keeps ${CAR_CLEAR} m from every solid, kerbs and parked cars included`, hits.size === 0,
    [...hits.values()].slice(0, 3).join('; ') || `${solids.length} solids, every ${CARS_EVERY} ms`);
  check('no two cars ever touch', touch === 0, touchAt || `${cars.length * (cars.length - 1) / 2} pairs`);

  /* Twenty minutes of goats beside the cars. Every two seconds a goat is
   * put in a car's way, a car's length to nine metres ahead of it and
   * anywhere across its lane, never on a car, and half the time a craft
   * comes at it from the far side, pushing it into the car's path. */
  const herd = makeHerd(names, grid, { parks: [PARK] });
  const { feed, n } = world;
  let seed = 7;
  const rnd = () => {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    return seed / 4294967296;
  };
  const inCar = (x, y, grow) => {
    for (let c = 0; c < n; c += 1) {
      const f = c * CAR_STRIDE;
      const dx = x - feed[f];
      const dy = y - feed[f + 1];
      if (Math.abs(dx * feed[f + 2] + dy * feed[f + 3]) < feed[f + 5] + grow && Math.abs(dy * feed[f + 2] - dx * feed[f + 3]) < feed[f + 6] + grow) {
        return c;
      }
    }
    return -1;
  };
  const dt = 1 / 30;
  let put = 0;
  let craft = null;
  let under = 0;
  let underAt = '';
  let solid = 0;
  let leaps = 0;
  const up0 = new Uint8Array(herd.count);
  for (let k = 0; k < 20 * 60 * 30; k += 1) {
    world.at(Math.round(k * dt * 1000));
    if (k % 60 === 0) {
      const f = Math.floor(rnd() * n) * CAR_STRIDE;
      const g = Math.floor(rnd() * herd.count);
      const ahead = feed[f + 5] + 0.6 + rnd() * 9;
      const across = (rnd() - 0.5) * 3;
      const x = feed[f] + feed[f + 2] * ahead - feed[f + 3] * across;
      const y = feed[f + 1] + feed[f + 3] * ahead + feed[f + 2] * across;
      craft = null;
      if (!grid.blocked(x, y) && inCar(x, y, 0.6) < 0) {
        herd.place(g, x, y);
        put += 1;
        const s = across < 0 ? -1 : 1;
        craft = rnd() < 0.5 ? { x: x + feed[f + 3] * 2 * s, y: y - feed[f + 2] * 2 * s, h: 0.8 } : null;
      }
    }
    herd.step(dt, craft, feed, n);
    for (let g = 0; g < herd.count; g += 1) {
      const c = inCar(herd.X[g], herd.Y[g], 0);
      if (c >= 0) {
        under += 1;
        underAt = underAt || `${herd.names[g]} in ${cars[c].element} at ${(k * dt).toFixed(1)} s`;
      }
      if (herd.HOP[g] > 0.3 && !up0[g]) {
        leaps += 1;
      }
      up0[g] = herd.HOP[g] > 0.3 ? 1 : 0;
    }
    if (k % 30 === 0) {
      for (let g = 0; g < herd.count; g += 1) {
        solid += grid.blocked(herd.X[g], herd.Y[g]) ? 1 : 0;
      }
    }
  }
  check('twenty minutes of goats put in front of the cars, no car ever has a goat in it', under === 0, underAt || `${put} goats put in a car's way, ${leaps} leaps`);
  check('and no goat is ever in a solid', solid === 0, `${solid} goat seconds`);

  /* A car standing (the cars' clock stopped, the goats' not): a goat beside
   * it never leaps, and one put inside it walks out. */
  const still = new Float64Array(feed);
  for (let c = 0; c < n; c += 1) {
    still[c * CAR_STRIDE + 4] = 0;
  }
  const calmHerd = makeHerd(names, grid, { parks: [PARK] });
  const f0 = 0;
  const side = still[f0 + 6] + 0.2;
  const at = (along, across) => [still[f0] + still[f0 + 2] * along - still[f0 + 3] * across, still[f0 + 1] + still[f0 + 3] * along + still[f0 + 2] * across];
  const [bx, by] = at(0, side);
  const [ix, iy] = at(0.5, 0.2);
  calmHerd.place(0, bx, by);
  calmHerd.place(1, ix, iy);
  let hopped = 0;
  for (let k = 0; k < 30 * 20; k += 1) {
    calmHerd.step(1 / 30, null, still, n);
    hopped += calmHerd.HOP[0] > 0.3 || calmHerd.HOP[1] > 0.3 ? 1 : 0;
  }
  const outOf = (x, y) => {
    const dx = x - still[f0];
    const dy = y - still[f0 + 1];
    return Math.abs(dx * still[f0 + 2] + dy * still[f0 + 3]) > still[f0 + 5] || Math.abs(dy * still[f0 + 2] - dx * still[f0 + 3]) > still[f0 + 6];
  };
  check('a goat beside a car standing still never leaps from it, and one put inside it walks out',
    hopped === 0 && outOf(calmHerd.X[1], calmHerd.Y[1]), `${hopped} steps in the air`);
  /* The clock starts at the first goat the craft moves, even one already
   * stepping out of a car's way. */
  const clockHerd = makeHerd(names, grid, { parks: [PARK] });
  const [gx, gy] = at(still[f0 + 5] + 3, 0);
  clockHerd.place(0, gx, gy);
  const moving = new Float64Array(feed);
  clockHerd.step(1 / 30, null, moving, n);
  clockHerd.step(1 / 30, { x: clockHerd.X[0] + 1.5, y: clockHerd.Y[0], h: 0.6 }, null, 0);
  check('the clock starts at the first goat the craft moves, one dodging a car included', clockHerd.started());
}

/*
 * GOAT HERDING IN A ROOM, two pages and a board in one process. Page A is
 * the host and flies two bots; page B is another pilot, who herds one goat
 * by the bots' rule. Each page steps its own herd with its own pilot as
 * the craft and the round's others, as the goat map does. The board is a
 * stand in for the real one's goatsMessage (the board's own
 * src/rooms-test.js checks that): it counts every goat the host says and
 * passes the herd on.
 */
function roomBlock(grid, names) {
  console.log('\n7. room');
  const world = {
    k: S,
    cruise: 9 * S,
    cx: OX + 10 * S,
    cy: 0,
    cz: OZ + 10 * S,
    radius: 150 * S,
    top: 45 * S,
    spawns: [
      { x: OX + 40 * S, y: 6 * S, z: OZ + 10 * S }, { x: OX - 20 * S, y: 6 * S, z: OZ + 30 * S },
      { x: OX + 10 * S, y: 6 * S, z: OZ + 40 * S }, { x: OX - 30 * S, y: 6 * S, z: OZ - 10 * S },
    ],
    floorAt: () => 0,
    blocked: () => -1,
  };
  const clock = { t: 1000 };
  const now = () => clock.t;
  const toLocal = (ms) => ms;
  const page = (seed) => {
    const herd = makeHerd(names, grid, { parks: [PARK] });
    const pen = {
      herd, others: new Float64Array(3 * 64), nOthers: 0, frame: FRAME, field: () => herd.field,
    };
    return { herd, pen, g: new GoatRoom(world, { now, seed, pen }) };
  };
  const A = page(11);
  const B = page(22);
  const YOU_A = 1;
  const YOU_B = 2;
  const BOTS = [{ id: 201, name: 'MOCHI', skill: 'ace' }, { id: 202, name: 'GIZMO', skill: 'ace' }];
  A.g.setYou(YOU_A, true);
  B.g.setYou(YOU_B, false);
  A.g.setBots(BOTS);
  B.g.setBots(BOTS);
  /* Stray the two herds before the round: a page that joined later. */
  for (let k = 0; k < 300; k += 1) {
    A.herd.step(1 / 30, { x: A.herd.X[5] + 1, y: A.herd.Y[5], h: 0.5 });
  }
  const board = {
    n: 0, goAt: 0, endAt: 0, rows: new Map(), homed: new Set(), winner: null, bytes: 0, herds: 0, wrong: 0,
    state(phase) {
      return {
        phase,
        round: '3m',
        n: this.n,
        goAt: this.goAt,
        endAt: this.endAt,
        total: A.herd.count,
        home: this.homed.size,
        winner: this.winner,
        rows: [...this.rows].map(([id, goats]) => ({ id, goats })).sort((a, b) => b.goats - a.goats || a.id - b.id),
      };
    },
    take(from, msg) {
      if (msg.n !== this.n) {
        return;
      }
      if (msg.t === 'gtHerd') {
        this.herds += 1;
        this.bytes += JSON.stringify(msg).length;
        B.g.heardHerd(msg);
        return;
      }
      if (msg.t !== 'gtHome' || from !== A || this.homed.has(msg.goat)) {
        this.wrong += msg.t === 'gtHome' ? 1 : 0;
        return;
      }
      this.homed.add(msg.goat);
      const has = this.rows.has(msg.by);
      if (has) {
        this.rows.set(msg.by, this.rows.get(msg.by) + 1);
      }
      const out = {
        t: 'gtHome', n: this.n, goat: msg.goat, by: has ? msg.by : -1, goats: has ? this.rows.get(msg.by) : 0,
      };
      A.g.heardHome(out);
      B.g.heardHome(out);
    },
  };
  board.n = 1;
  board.goAt = clock.t + 5000;
  board.endAt = board.goAt + 180000;
  board.rows = new Map([YOU_A, YOU_B, 201, 202].map((id) => [id, 0]));
  A.g.heard(board.state('count'), toLocal);
  B.g.heard(board.state('count'), toLocal);
  let same = 0;
  for (let i = 0; i < A.herd.count; i += 1) {
    same += A.herd.X[i] === B.herd.X[i] && A.herd.Y[i] === B.herd.Y[i] ? 1 : 0;
  }
  check('both pages let the goats out to the same places for the round', same === A.herd.count, `${same} of ${A.herd.count}`);
  check('both put everybody in the round, the bots too', A.g.inFight[ME] && B.g.inFight[ME] && A.g.inFight[A.g.slotOf(201)] && B.g.inFight[B.g.slotOf(202)]);

  /* The host hovers high over the garage, out of every goat's way; B
   * herds the goat nearest the garage by the bots' rule. */
  const meA = {
    x: OX + 16 * S, y: 9 * S, z: OZ - 4 * S, fx: 1, fy: 0, fz: 0, ux: 0, uy: 1, uz: 0, flying: true, gun: false, missile: false,
  };
  const meB = { ...meA };
  const field = B.herd.field;
  let t = -1;
  let tBest = Infinity;
  for (let i = 0; i < B.herd.count; i += 1) {
    const d = field.at(B.herd.X[i], B.herd.Y[i]);
    if (d >= 0 && d < tBest) {
      tBest = d;
      t = i;
    }
  }
  let bx = B.herd.X[t] + 15;
  let by = B.herd.Y[t] + 15;
  let bh = 6.5;
  let best = Infinity;
  let bestAt = 0;
  let side = 0;
  const way = new Float64Array(2);
  const at = new Float64Array(2);
  const pose = {
    px: 0, py: 0, pz: 0, qx: 0, qy: 0, qz: 0, qw: 1, cut: false,
  };
  const craftA = { x: 0, y: 0, h: 0 };
  const craftB = { x: 0, y: 0, h: 0 };
  let live = false;
  let ended = false;
  let apartSum = 0;
  let apartN = 0;
  let worst = 0;
  let stepUs = 0;
  let steps = 0;
  const liveFrom = { herds: 0, bytes: 0 };
  for (let k = 0; k < (5000 + 181000) / DOGFIGHT_EVERY && !ended; k += 1) {
    clock.t += DOGFIGHT_EVERY;
    if (!live && clock.t >= board.goAt) {
      live = true;
      liveFrom.herds = board.herds;
      liveFrom.bytes = board.bytes;
      A.g.heard(board.state('live'), toLocal);
      B.g.heard(board.state('live'), toLocal);
    }
    if (live && clock.t >= board.endAt) {
      const rows = board.state('results').rows;
      board.winner = rows[0].goats > 0 && (!rows[1] || rows[1].goats < rows[0].goats) ? rows[0].id : null;
      A.g.heard(board.state('results'), toLocal);
      B.g.heard(board.state('results'), toLocal);
      ended = true;
      break;
    }
    /* B's pilot: behind its goat on the way home, low when there. */
    if (B.herd.MODE[t] !== HOME) {
      const left = field.at(B.herd.X[t], B.herd.Y[t]);
      if (left < best) {
        best = left;
        bestAt = k;
      } else if (k - bestAt > 250) {
        side = side > 0 ? -1.4 : 1.4;
        bestAt = k;
      }
      herdPoint(field, B.herd.X[t], B.herd.Y[t], GOAT_BOTS.ace.behind, side, way, at);
      const dx = at[0] - bx;
      const dy = at[1] - by;
      const d = Math.hypot(dx, dy);
      const ahead = (bx - B.herd.X[t]) * way[0] + (by - B.herd.Y[t]) * way[1] > 0;
      const low = d < 3 && !ahead;
      const stepM = Math.min(d, ((low ? GOAT_BOTS.ace.pace : 12) * DOGFIGHT_EVERY) / 1000);
      if (d > 1e-6) {
        bx += (dx / d) * stepM;
        by += (dy / d) * stepM;
      }
      bh += Math.max(-0.04, Math.min(0.04, (low ? 1.3 : 6.5) - bh));
    } else {
      bh = 9;
    }
    meB.x = OX + bx * S;
    meB.z = OZ - by * S;
    meB.y = bh * S;
    /* What each page draws of the other, and of the host's bots. */
    pose.px = meB.x; pose.py = meB.y; pose.pz = meB.z;
    A.g.remote(YOU_B, pose, { handle: 'Lou' });
    pose.px = meA.x; pose.py = meA.y; pose.pz = meA.z;
    B.g.remote(YOU_A, pose, { handle: 'Host' });
    A.g.eachFlown((id, x, y, z) => {
      pose.px = x; pose.py = y; pose.pz = z;
      B.g.remote(id, pose, { handle: BOTS.find((b) => b.id === id).name, bot: true, skill: 'ace' });
    });
    const t0 = process.hrtime.bigint();
    A.g.step(meA);
    craftA.x = (meA.x - OX) / S; craftA.y = (OZ - meA.z) / S; craftA.h = meA.y / S;
    A.herd.step(DOGFIGHT_EVERY / 1000, craftA, null, 0, A.pen.nOthers ? A.pen.others : null, A.pen.nOthers);
    stepUs += Number(process.hrtime.bigint() - t0) / 1000;
    steps += 1;
    B.g.step(meB);
    craftB.x = bx; craftB.y = by; craftB.h = bh;
    B.herd.step(DOGFIGHT_EVERY / 1000, craftB, null, 0, B.pen.nOthers ? B.pen.others : null, B.pen.nOthers);
    for (const p of [A, B]) {
      const out = p.g.takeOutbox();
      if (out) {
        for (const m of out) board.take(p, m);
      }
    }
    if (live && k % 100 === 0) {
      for (let i = 0; i < A.herd.count; i += 1) {
        const d = Math.hypot(A.herd.X[i] - B.herd.X[i], A.herd.Y[i] - B.herd.Y[i]);
        apartSum += d;
        apartN += 1;
        if (d > worst) {
          worst = d;
        }
      }
    }
  }
  const rows = board.state('results').rows;
  const goatsOf = (id) => (rows.find((r) => r.id === id) || { goats: 0 }).goats;
  check('the host\'s herd credits the goat the other pilot pushed in to that pilot', goatsOf(YOU_B) >= 1 && A.herd.MODE[t] === HOME, `Lou ${goatsOf(YOU_B)}, goat ${t} ${A.herd.MODE[t] === HOME ? 'home' : 'out'} on the host`);
  check('and that pilot\'s page counts it as theirs', B.g.pops[ME] === goatsOf(YOU_B), `${B.g.pops[ME]}`);
  check('the host\'s bots herd goats home in a round', goatsOf(201) + goatsOf(202) >= 1, `MOCHI ${goatsOf(201)}, GIZMO ${goatsOf(202)}`);
  check('only the host says a goat is home, and once', board.wrong === 0, `${board.wrong} refused`);
  check('both pages agree how many are home', A.g.home === board.homed.size && B.g.home === board.homed.size, `${A.g.home} ${B.g.home} ${board.homed.size}`);
  const mean = apartSum / Math.max(1, apartN);
  check('the other page\'s herd stays with the host\'s', mean < 0.5 && worst < 6, `mean ${mean.toFixed(2)} m, worst ${worst.toFixed(1)} m`);
  const secs = 180;
  const bps = (board.bytes - liveFrom.bytes) / secs;
  check('the herd costs the host under a kilobyte a second on the wire', bps < 1000, `${bps.toFixed(0)} B/s, ${((board.herds - liveFrom.herds) / secs).toFixed(1)} a second`);
  check('the clock ends the round, and both pages show the winner', ended && A.g.over && B.g.over && A.g.winner === A.g.slotOf(board.winner ?? -9) && B.g.winner === B.g.slotOf(board.winner ?? -9),
    `winner ${board.winner}, ${rows.map((r) => `${r.id}:${r.goats}`).join(' ')}`);
  check('a feed of the host\'s round and its herd, under the solo step\'s line', stepUs / steps < STEP_US_MAX * 2, `${(stepUs / steps).toFixed(0)} us`);
}

async function main() {
  const house = houseBlock();
  const { hood, solids } = await streetBlock(house);
  const { grid, names } = goatsBlock(house, hood);
  const world = await carWorld();
  herdingBlock(grid, names, world);
  await carsBlock(world, solids, grid, names);
  othersBlock(grid, names);
  roomBlock(grid, names);
  console.log(failures ? `\n${failures} failed` : '\nall passed');
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
