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
 *                 or into a solid; the herd's step stays cheap
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
import { hoodLayout, BOUNDS, PARK } from '../src/maps/goats/hood.js';
import { goatsDocument } from '../src/maps/goats/yard.js';
import { makeGrid, makeHerd, GARAGE_IN, HOME } from '../src/maps/goats/herd.js';
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
  return hood;
}

function goatsBlock(house, hood) {
  console.log('\n3. goats');
  const grid = makeGrid([...house.parts, ...hood.parts], toPlan, S, BOUNDS, [...hood.blocks, ROOMS]);
  const names = WALL_STICKERS.map((c) => c.name);
  check('one goat for every 90%er sticker but the patches', names.length === 98 && !names.includes('90%'), `${names.length}`);
  check('every goat has a logo cut from a sheet', WALL_STICKERS.every((c) => c.w > 0 && c.h > 0 && (c.sheet === 0 || c.sheet === 1)));
  const herd = makeHerd(names, grid, { parks: [PARK] });
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

function herdingBlock(grid, names) {
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

  /* The step's cost, the whole herd, a craft in a group of them. */
  const cost = makeHerd(names, grid, { parks: [PARK] });
  for (let k = 0; k < 600; k += 1) {
    cost.step(1 / 60, null);
  }
  let best = Infinity;
  for (let rep = 0; rep < 3; rep += 1) {
    const t0 = performance.now();
    for (let k = 0; k < 3000; k += 1) {
      cost.step(1 / 60, { x: cost.X[5] + 2, y: cost.Y[5], h: 0.8 });
    }
    best = Math.min(best, ((performance.now() - t0) / 3000) * 1000);
  }
  check(`the herd's step is under ${STEP_US_MAX} microseconds`, best < STEP_US_MAX, `${best.toFixed(1)} us, best of three`);
}

async function main() {
  const house = houseBlock();
  const hood = await streetBlock(house);
  const { grid, names } = goatsBlock(house, hood);
  herdingBlock(grid, names);
  console.log(failures ? `\n${failures} failed` : '\nall passed');
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
