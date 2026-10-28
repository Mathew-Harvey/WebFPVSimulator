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
}

async function main() {
  const house = houseBlock();
  const { hood, solids } = await streetBlock(house);
  const { grid, names } = goatsBlock(house, hood);
  const world = await carWorld();
  herdingBlock(grid, names, world);
  await carsBlock(world, solids, grid, names);
  console.log(failures ? `\n${failures} failed` : '\nall passed');
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
