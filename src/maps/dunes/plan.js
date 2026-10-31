/*
 * plan.js: Kazesuna Dunes, everything that stands on the sand. Pure: no
 * Three.js import, so its solids, its gaps and its spawn load in Node
 * (scripts/dunes-check.js) as they do in the browser. What it cannot say
 * as a box or a capsule it hands ./index.js as a draw, a function of the
 * kit that only the browser ever calls.
 *
 * THE PLACE, from the south: the visitors' terrace on the pine bluff, with
 * the dune centre and its roof lounge, a row of souvenir shops and their
 * vending machines, the car park, the access road and its poles, and a
 * one platform station on a single line, the sand blown up over its
 * platform ends; a timber look out cantilevered over the bluff, where the
 * pilot starts; a chair lift down the bluff into the hollow; the camel
 * hut and its ticket kiosk at the bluff's foot; crescent dunes across the
 * hollow, and rows of bamboo sand fences; the pond that comes up in the
 * hollow after rain; the big ridge's slip face, its crest with people on
 * it and their footprints up the face; the windward slope, a paraglider's
 * wing laid out on it and one in the air; the beach, a lifeguard's tower,
 * a fishing boat on its rollers, and a breakwater of tetrapods offshore.
 *
 * Every number is in the plan (./terrain.js): metres from the plot's south
 * west corner, x east, y north, h up. A thing that stands on the sand is
 * seated on the sand's own height there (groundAt), so it stands on what
 * is drawn and what is flown over alike.
 *
 * NOTHING HERE IS A COPY OF ANOTHER GAME'S MAP. It is built from what a
 * visitor to a real dune coast sees, sized from the references in the
 * PR (the ridge's 47 m, a Bactrian camel's 2.1 m to its humps, the town's
 * own 1.95 m vending machine), and laid out by hand for the lines it gives
 * a pilot.
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

import { Parts, seededRandom } from '../../props/parts.js';
import { partsOf } from '../../props/catalog.js';
import { loblollyLayout } from '../../props/street.js';
import { sincos, quarterTurns, quarterSinCos } from '../../props/trig.js';
import {
  W, D, w, groundAt, sandAt, crestY, shoreY, TERRACE, POND, BARCHANS,
} from './terrain.js';

/* ---- the cull chunks: 128 m squares of the plan ---- */

export const CHUNK = 128;
export function chunkOf(wx, wz) {
  const i = Math.max(0, Math.min(6, Math.floor((wx + W / 2) / CHUNK)));
  const j = Math.max(0, Math.min(4, Math.floor((D / 2 - wz) / CHUNK)));
  return `dn${i}_${j}`;
}
const chunkAt = (x, y) => chunkOf(x - W / 2, D / 2 - y);

/* ---- the builder ---- */

class Coast {
  constructor() {
    this.P = new Parts();
    this.draws = [];
    this.assets = [];
    this.signs = [];
    this.wires = [];
    this.fences = [];
    this.gaps = [];
  }

  /* A box in the plan, solid unless opts.solid is false. */
  box(m, x0, y0, h0, x1, y1, h1, opts = {}) {
    return this.P.box(m, x0 - W / 2, h0, D / 2 - y1, x1 - W / 2, h1, D / 2 - y0, opts);
  }

  /* Paint: drawn, never solid. `fine` paint is left off on Low. */
  deco(m, x0, y0, h0, x1, y1, h1, fine = false) {
    const p = this.box(m, x0, y0, h0, x1, y1, h1, { solid: false, cast: !fine });
    if (p && fine) {
      p.fine = true;
    }
    return p;
  }

  /* A capsule from plan [x, y, h] to plan [x, y, h]. */
  cap(m, a, b, r, opts = {}) {
    return this.P.cap(m, w(a[0], a[1], a[2]), w(b[0], b[1], b[2]), r, opts);
  }

  post(m, x, y, h0, h1, r, opts = {}) {
    return this.cap(m, [x, y, h0], [x, y, h1], r, opts);
  }

  /* A draw the kit makes in the browser, filed in the chunk of (x, y). */
  draw(x, y, fn, fine = false) {
    this.draws.push({ chunk: chunkAt(x, y), fn, fine });
  }

  /* One of the town's own assets (a tree, a car, a vending machine), drawn
   * by the kit at plan (x, y) on height h, turned `yaw`. */
  asset(el, x, y, h, yaw) {
    el.id = `dunes-${this.assets.length + 1}`;
    this.assets.push({ el, x, y, h, yaw });
  }

  /* A sign: a painted plate from ./index.js's atlas, `key` its picture, at
   * plan (x, y, h), facing `n` (a world unit normal), w by ht metres. */
  sign(key, x, y, h, n, wd, ht, lift = 0.02) {
    this.signs.push({ key, p: w(x, y, h), n, w: wd, h: ht, lift });
  }

  /* A cable between two plan points, sagging at its middle. */
  wire(a, b, sag, m = 'rope', r = 0.025) {
    this.wires.push({ a: w(a[0], a[1], a[2]), b: w(b[0], b[1], b[2]), sag, m, r });
  }

  gap(name, x, y, deg, wd, h0, h1, points) {
    this.gaps.push({ name, x, y, deg, w: wd, h0, h1, points });
  }
}

/* The ground at a plan point, and the lowest of it over a footprint, which
 * is what a thing that must not float is seated on. */
const g = groundAt;
function lowest(x0, y0, x1, y1) {
  let h = Infinity;
  for (let i = 0; i <= 4; i += 1) {
    for (let j = 0; j <= 4; j += 1) {
      h = Math.min(h, g(x0 + ((x1 - x0) * i) / 4, y0 + ((y1 - y0) * j) / 4));
    }
  }
  return h;
}

/* Normals in the world for a face looking along the plan's axes. */
const N_NORTH = [0, 0, -1];
const N_SOUTH = [0, 0, 1];
const N_EAST = [1, 0, 0];
const N_WEST = [-1, 0, 0];

/* ================================================================== */
/* THE LOOK OUT, where the pilot starts                                */
/* ================================================================== */

export const DECK = { x0: 530, x1: 550, y0: 100, y1: 121, top: 33.2, slab: 0.3 };
/* The start's heading in the plan, degrees from east: 90 is due north,
 * over the dunes to the sea. (spawnFrom in src/maps/built/place.js takes a
 * quarter turn off it, and the shell's yaw 0 is north.) */
export const SPAWN = { x: 540, y: 104, yaw: 90 };

function lookout(C) {
  const d = DECK;
  /* The plinth on the terrace, and the slab out over the bluff. */
  C.box('dnTimber', d.x0, d.y0, TERRACE - 0.4, d.x1, 106, d.top, { kind: 'wall', name: 'look out' });
  C.box('dnTimber', d.x0, 106, d.top - d.slab, d.x1, d.y1, d.top, { kind: 'wall', name: 'look out deck' });
  /* The deck boards, a darker line every 0.6 m. */
  C.draw(540, 110, (K) => {
    for (let x = d.x0 + 0.6; x < d.x1; x += 0.6) {
      const a = w(x, d.y0, d.top);
      const b = w(x + 0.05, d.y1, d.top + 0.01);
      K.box('dnWoodDark', a[0], a[1], b[2], b[0], b[1], a[2]);
    }
  }, true);
  /* The posts under it, braced, from the bluff. */
  for (const px of [d.x0 + 0.4, 540, d.x1 - 0.4]) {
    for (const py of [112, d.y1 - 0.4]) {
      C.post('dnWoodDark', px, py, g(px, py) - 0.5, d.top - d.slab, 0.18, { kind: 'pole', name: 'deck post' });
    }
  }
  for (const px of [d.x0 + 0.4, d.x1 - 0.4]) {
    C.cap('dnWoodDark', [px, 112, g(px, 112) + 0.3], [px, d.y1 - 0.4, d.top - d.slab - 0.2], 0.07, { solid: false, name: 'brace' });
  }
  /* The rail round the out end, open on the terrace side. */
  const rail = (a, b) => {
    C.cap('dnWoodDark', [a[0], a[1], d.top + 1.05], [b[0], b[1], d.top + 1.05], 0.05, { kind: 'pole', name: 'rail' });
    C.cap('dnTimber', [a[0], a[1], d.top + 0.55], [b[0], b[1], d.top + 0.55], 0.03, { solid: false });
  };
  rail([d.x0 + 0.1, 106], [d.x0 + 0.1, d.y1 - 0.1]);
  rail([d.x1 - 0.1, 106], [d.x1 - 0.1, d.y1 - 0.1]);
  rail([d.x0 + 0.1, d.y1 - 0.1], [d.x1 - 0.1, d.y1 - 0.1]);
  for (let x = d.x0 + 0.1; x <= d.x1; x += 2.5) {
    C.post('dnWoodDark', x, d.y1 - 0.1, d.top, d.top + 1.05, 0.05, { kind: 'pole', name: 'baluster' });
  }
  for (let y = 108.5; y < d.y1; y += 2.5) {
    C.post('dnWoodDark', d.x0 + 0.1, y, d.top, d.top + 1.05, 0.05, { solid: false });
    C.post('dnWoodDark', d.x1 - 0.1, y, d.top, d.top + 1.05, 0.05, { solid: false });
  }
  /* A pair of coin binoculars on the out end, and a bench. */
  for (const bx of [535, 545]) {
    C.post('metal', bx, d.y1 - 0.9, d.top, d.top + 1.1, 0.07, { kind: 'pole', name: 'binoculars' });
    C.draw(bx, d.y1, (K) => {
      const c = w(bx, d.y1 - 0.9, d.top + 1.25);
      K.box('containerGreen', c[0] - 0.2, c[1] - 0.12, c[2] - 0.15, c[0] + 0.2, c[1] + 0.12, c[2] + 0.15);
      K.cyl('metalDark', [c[0] - 0.12, c[1], c[2] - 0.15], [c[0] - 0.12, c[1], c[2] - 0.35], 0.06, 8);
      K.cyl('metalDark', [c[0] + 0.12, c[1], c[2] - 0.15], [c[0] + 0.12, c[1], c[2] - 0.35], 0.06, 8);
    }, true);
  }
  C.deco('dnTimber', 537, 101.2, d.top, 543, 101.7, d.top + 0.45, true);
  C.sign('lookout', 540, 100.3, d.top + 1.6, N_SOUTH, 2.2, 0.75);
  C.post('dnWoodDark', 538.6, 100.3, d.top, d.top + 1.95, 0.05, { kind: 'pole' });
  C.post('dnWoodDark', 541.4, 100.3, d.top, d.top + 1.95, 0.05, { kind: 'pole' });
  C.gap('UNDER THE LOOK OUT', 535, 118.6, 0, 3, g(535, 117.1) + 0.35, d.top - d.slab - 0.3, 500);
}

/* ================================================================== */
/* THE TERRACE: the centre, the shops, the car park and the road        */
/* ================================================================== */

export const CENTRE = { x0: 562, x1: 622, y0: 42, y1: 88, floors: 3, storey: 4.0, arcade: 7 };

function centre(C) {
  const c = CENTRE;
  const base = TERRACE;
  const roof = base + c.floors * c.storey;
  /* The block, and the arcade along its north face under the first
   * floor's overhang, its columns every six metres. */
  C.box('wallCream', c.x0, c.y0, base - 0.5, c.x1, c.y1, roof, { kind: 'wall', name: 'dune centre' });
  C.box('concrete', c.x0, c.y1, base + 4.0, c.x1, c.y1 + c.arcade, base + 4.6, { kind: 'wall', name: 'arcade roof' });
  C.box('wallCream', c.x0, c.y1, base + 4.6, c.x1, c.y1 + c.arcade, roof, { kind: 'wall', name: 'dune centre' });
  for (let x = c.x0 + 0.4; x <= c.x1; x += 6) {
    C.post('concrete', x, c.y1 + c.arcade - 0.5, base, base + 4.0, 0.28, { kind: 'pole', name: 'column' });
  }
  /* The arcade's paving, its glass shop front and benches. */
  C.deco('concreteMid', c.x0, c.y1, base, c.x1, c.y1 + c.arcade, base + 0.05);
  C.draw(592, 90, (K) => {
    for (let x = c.x0 + 1; x < c.x1 - 1; x += 3) {
      const a = w(x, c.y1, base + 0.3);
      const b = w(x + 2.7, c.y1 + 0.06, base + 3.6);
      K.box('glassBlue', a[0], a[1], b[2], b[0], b[1], a[2]);
    }
    for (let x = c.x0 + 4; x < c.x1 - 4; x += 12) {
      const a = w(x, c.y1 + 1.2, base + 0.42);
      const b = w(x + 2.4, c.y1 + 1.7, base + 0.48);
      K.box('dnTimber', a[0], a[1], b[2], b[0], b[1], a[2]);
    }
  });
  /* The two floors over the arcade: a band of glass round all four faces,
   * mullions every 1.8 m, and a white band at each floor. */
  C.draw(592, 70, (K) => {
    for (let f = 1; f < c.floors; f += 1) {
      const h0 = base + f * c.storey + 1.0;
      const h1 = base + (f + 1) * c.storey - 0.6;
      const yN = c.y1 + c.arcade + 0.03;
      let a = w(c.x0 + 1, yN, h0);
      let b = w(c.x1 - 1, yN + 0.04, h1);
      K.box('glassBlue', a[0], a[1], b[2], b[0], b[1], a[2]);
      for (let x = c.x0 + 1; x <= c.x1 - 1; x += 1.8) {
        a = w(x, yN, h0);
        b = w(x + 0.12, yN + 0.12, h1);
        K.box('trim', a[0], a[1], b[2], b[0], b[1], a[2]);
      }
      a = w(c.x0 - 0.06, c.y0 - 0.06, base + f * c.storey - 0.2);
      b = w(c.x1 + 0.06, yN + 0.08, base + f * c.storey + 0.2);
      K.box('white', a[0], a[1], b[2], b[0], b[1], a[2]);
      for (const [x0, x1, y0, y1] of [[c.x0 - 0.03, c.x0, c.y0 + 2, c.y1 - 2], [c.x1, c.x1 + 0.03, c.y0 + 2, c.y1 - 2]]) {
        a = w(x0, y0, h0);
        b = w(x1, y1, h1);
        K.box('glassBlue', a[0], a[1], b[2], b[0], b[1], a[2]);
      }
      a = w(c.x0 + 2, c.y0 - 0.03, h0);
      b = w(c.x1 - 2, c.y0, h1);
      K.box('glassBlue', a[0], a[1], b[2], b[0], b[1], a[2]);
    }
  });
  /* The roof: a parapet, a lounge of glass on its north half with a
   * terrace rail in front, units and a water tank, and the big sign. */
  const p = 0.3;
  C.box('wallCream', c.x0, c.y0, roof, c.x1, c.y0 + p, roof + 1.0, { kind: 'wall', name: 'parapet' });
  C.box('wallCream', c.x0, c.y0, roof, c.x0 + p, c.y1 + c.arcade, roof + 1.0, { kind: 'wall', name: 'parapet' });
  C.box('wallCream', c.x1 - p, c.y0, roof, c.x1, c.y1 + c.arcade, roof + 1.0, { kind: 'wall', name: 'parapet' });
  C.box('trim', c.x0, c.y1 + c.arcade - 0.15, roof, c.x1, c.y1 + c.arcade, roof + 0.25, { kind: 'wall', name: 'roof edge' });
  for (let x = c.x0 + 1; x < c.x1; x += 2) {
    C.post('metal', x, c.y1 + c.arcade - 0.3, roof + 0.25, roof + 1.1, 0.03, { solid: false });
  }
  C.cap('metal', [c.x0 + 0.3, c.y1 + c.arcade - 0.3, roof + 1.1], [c.x1 - 0.3, c.y1 + c.arcade - 0.3, roof + 1.1], 0.04, { kind: 'pole', name: 'roof rail' });
  const L = { x0: 572, x1: 612, y0: 66, y1: 84, h: 3.4 };
  C.box('white', L.x0, L.y0, roof, L.x1, L.y0 + 1.5, roof + L.h, { kind: 'wall', name: 'lounge' });
  C.box('glassBlue', L.x0, L.y0 + 1.5, roof, L.x1, L.y1, roof + L.h - 0.3, { kind: 'wall', name: 'lounge glass', draw: false });
  C.box('concreteDark', L.x0 - 1.2, L.y0 - 0.5, roof + L.h - 0.3, L.x1 + 1.2, L.y1 + 1.8, roof + L.h + 0.1, { kind: 'wall', name: 'lounge roof' });
  C.draw(592, 75, (K) => {
    let a = w(L.x0, L.y1 - 0.02, roof);
    let b = w(L.x1, L.y1, roof + L.h - 0.3);
    K.box('glassBlue', a[0], a[1], b[2], b[0], b[1], a[2]);
    for (let x = L.x0; x <= L.x1; x += 2.5) {
      a = w(x, L.y1 - 0.08, roof);
      b = w(x + 0.1, L.y1 + 0.02, roof + L.h - 0.3);
      K.box('trim', a[0], a[1], b[2], b[0], b[1], a[2]);
    }
    for (const xx of [L.x0, L.x1 - 0.02]) {
      a = w(xx, L.y0 + 1.5, roof);
      b = w(xx + 0.02, L.y1, roof + L.h - 0.3);
      K.box('glassBlue', a[0], a[1], b[2], b[0], b[1], a[2]);
    }
  });
  C.box('acUnit', 566, 46, roof, 570, 52, roof + 1.4, { kind: 'obstacle', name: 'unit' });
  C.box('acUnit', 614, 46, roof, 618, 50, roof + 1.2, { kind: 'obstacle', name: 'unit' });
  C.post('tankPaint', 600, 52, roof, roof + 3.2, 1.3, { kind: 'wall', name: 'tank' });
  C.draw(600, 52, (K) => {
    const t = w(600, 52, roof + 3.2);
    K.cone('tankSeam', t, 1.35, 0.6, 14);
  }, true);
  /* The name on the roof, on a lattice frame over the lounge's roof,
   * facing the dunes. */
  const sy = 76;
  const sh = roof + L.h + 0.1;
  for (const x of [576, 586, 598, 608]) {
    C.post('metalDark', x, sy, sh, sh + 3.6, 0.07, { kind: 'pole', name: 'sign frame' });
  }
  C.box('white', 574, sy - 0.1, sh + 1.2, 610, sy + 0.1, sh + 3.8, { kind: 'wall', name: 'roof sign' });
  C.sign('centre', 592, sy + 0.1, sh + 2.5, N_NORTH, 35, 2.5);
  /* The pedestrian way from the arcade to the look out, in paving. */
  C.deco('concreteMid', 532, 88, TERRACE, 562, 100, TERRACE + 0.05);
  C.deco('concreteMid', 550, 95, TERRACE, 562, 106, TERRACE + 0.05);
  C.gap('THE ARCADE', c.x0 + 1, c.y1 + 3.6, 0, 6.2, TERRACE + 0.35, TERRACE + 3.65, 250);
}

/* The souvenir shops, each a timber front under a tiled gable, its eaves
 * along the walk, two nobori by the door and an awning. */
export const SHOPS = [
  { x0: 470, x1: 486, y0: 70, y1: 82, wall: 'wallTea', banner: 'nashi' },
  { x0: 488, x1: 504, y0: 70, y1: 82, wall: 'wallWhite', banner: 'suna' },
  { x0: 506, x1: 524, y0: 70, y1: 82, wall: 'wallSage', banner: 'omiyage' },
];

function shops(C) {
  for (const s of SHOPS) {
    const base = TERRACE;
    const eave = base + 4.2;
    const ridge = base + 6.4;
    C.box(s.wall, s.x0, s.y0, base - 0.4, s.x1, s.y1, eave, { kind: 'wall', name: 'shop' });
    /* The roof's solid is its lower half, a box to the eaves' height plus
     * half the rise, which is where a quad meets tiles; the slopes are
     * drawn over it. */
    C.box('dnRoof', s.x0 + 1, s.y0 + 2, eave, s.x1 - 1, s.y1 - 2, ridge - 0.9, { kind: 'wall', name: 'shop roof', draw: false });
    const cx = (s.x0 + s.x1) / 2;
    const cy = (s.y0 + s.y1) / 2;
    const half = (s.y1 - s.y0) / 2 + 0.8;
    C.draw(cx, cy, (K) => {
      const o = w(cx, cy, 0);
      K.begin(o[0], 0, o[2], Math.PI / 2, chunkAt(cx, cy));
      /* local x is the plan's -y... and the extrusion runs along plan x */
      K.extrude('dnRoof', [[-half, eave - 0.15], [half, eave - 0.15], [0, ridge]], -(s.x1 - s.x0) / 2 - 0.6, (s.x1 - s.x0) / 2 + 0.6);
      K.extrude('dnRoofRidge', [[-0.3, ridge - 0.05], [0.3, ridge - 0.05], [0.3, ridge + 0.25], [-0.3, ridge + 0.25]], -(s.x1 - s.x0) / 2 - 0.7, (s.x1 - s.x0) / 2 + 0.7);
      K.begin(0, 0, 0, 0, chunkAt(cx, cy));
      /* The front: dark timber posts, a glass front, an awning, a sill. */
      const yF = s.y1 + 0.02;
      let a = w(s.x0 + 1, yF, base + 0.4);
      let b = w(s.x1 - 1, yF + 0.04, base + 2.6);
      K.box('glassLit', a[0], a[1], b[2], b[0], b[1], a[2]);
      for (let x = s.x0 + 0.9; x <= s.x1 - 0.9; x += 2.4) {
        a = w(x, yF, base);
        b = w(x + 0.16, yF + 0.16, eave);
        K.box('dnWoodDark', a[0], a[1], b[2], b[0], b[1], a[2]);
      }
      a = w(s.x0 + 0.5, s.y1, base + 2.9);
      b = w(s.x1 - 0.5, s.y1 + 1.6, base + 3.05);
      K.box('awning', a[0], a[1], b[2], b[0], b[1], a[2]);
      a = w(s.x0, s.y1, base + 3.3);
      b = w(s.x1, s.y1 + 0.08, base + 3.95);
      K.box('dnWoodDark', a[0], a[1], b[2], b[0], b[1], a[2]);
      /* Goods out front on a low table: boxes of pears, bags of sand. */
      a = w(s.x0 + 2, s.y1 + 0.4, base);
      b = w(s.x0 + 5, s.y1 + 1.2, base + 0.75);
      K.box('dnTimber', a[0], a[1], b[2], b[0], b[1], a[2]);
      for (let k = 0; k < 4; k += 1) {
        const q = w(s.x0 + 2.4 + k * 0.7, s.y1 + 0.8, base + 0.86);
        K.ball(k % 2 ? 'dnPear' : 'dnSand', q, 0.13);
      }
    });
    C.sign(`shop:${s.banner}`, cx, s.y1 + 0.1, base + 3.62, N_NORTH, s.x1 - s.x0 - 1.4, 0.55, 0.03);
    /* Two nobori, on poles by the door. */
    for (const k of [0, 1]) {
      const nx = s.x0 + 1.4 + k * (s.x1 - s.x0 - 2.8);
      const ny = s.y1 + 2.3;
      C.post('metal', nx, ny, base, base + 3.4, 0.025, { solid: false });
      C.sign(`nobori:${s.banner}:${k}`, nx + 0.33, ny, base + 2.15, N_NORTH, 0.6, 2.1, 0.01);
      C.sign(`nobori:${s.banner}:${k}`, nx + 0.33, ny, base + 2.15, N_SOUTH, 0.6, 2.1, 0.01);
    }
  }
  /* Vending machines, the town's own, in a row along the walk. */
  for (let k = 0; k < 4; k += 1) {
    C.asset({ type: 'vending', dims: { count: 1, variant: k + 2 } }, 526.6, 71.6 + k * 1.2, TERRACE, Math.PI);
  }
  /* A bench and a bin. */
  C.deco('dnTimber', 494, 85, TERRACE + 0.42, 498, 85.5, TERRACE + 0.48, true);
  C.gap('SHOP ROW', 487, 76, 90, 1.4, TERRACE + 0.4, TERRACE + 3.8, 500);
}

/* The car park, east of the centre, and the road along the south of the
 * terrace with its poles. */
function carPark(C) {
  const y0 = 36;
  const y1 = 100;
  const x0 = 632;
  const x1 = 760;
  C.deco('asphalt', x0, y0, TERRACE, x1, y1, TERRACE + 0.04);
  C.draw(696, 68, (K) => {
    for (const row of [44, 74]) {
      for (let x = x0 + 4; x < x1 - 4; x += 2.6) {
        const a = w(x, row, TERRACE + 0.045);
        const b = w(x + 0.12, row + 5.2, TERRACE + 0.05);
        K.box('lineWhite', a[0], a[1], b[2], b[0], b[1], a[2]);
      }
    }
  }, true);
  const STYLES = ['kei', 'hatch', 'sedan', 'wagon', 'minivan', 'keivan', 'kei', 'van'];
  const rng = seededRandom(91).next;
  let k = 0;
  for (const [row, yaw] of [[46.6, -Math.PI / 2], [76.6, Math.PI / 2]]) {
    for (let x = x0 + 5.3; x < x1 - 5; x += 2.6) {
      if (rng() < 0.42) {
        continue;
      }
      k += 1;
      C.asset({ type: 'car', style: STYLES[k % STYLES.length], dims: { variant: 1 + (k * 7) % 11 } }, x, row, TERRACE + 0.04, yaw);
    }
  }
  /* A tour bus, along the kerb by the centre. */
  C.asset({ type: 'car', style: 'minibus', dims: { variant: 4 } }, 646, 92, TERRACE + 0.04, 0);
  C.asset({ type: 'car', style: 'minibus', dims: { variant: 9 } }, 680, 92, TERRACE + 0.04, 0);
  C.sign('parking', x0 + 2, y1 - 1, TERRACE + 3.0, N_NORTH, 1.1, 1.1);
  C.post('metal', x0 + 2, y1 - 1.05, TERRACE, TERRACE + 3.6, 0.05, { kind: 'pole' });
}

/* The access road, the poles along it and their wires, the way the town
 * hangs its own. */
export const ROAD = { y0: 8, y1: 16 };
function road(C) {
  C.deco('asphalt', -300, ROAD.y0, TERRACE, W + 300, ROAD.y1, TERRACE + 0.04);
  C.draw(448, 12, (K) => {
    for (let x = -280; x < W + 280; x += 9) {
      const a = w(x, 11.92, TERRACE + 0.045);
      const b = w(x + 4.5, 12.08, TERRACE + 0.05);
      K.box('lineWhite', a[0], a[1], b[2], b[0], b[1], a[2]);
    }
  }, true);
  /* The lane up to the car park, over the crossing. */
  C.deco('asphalt', 636, ROAD.y1, TERRACE, 646, 36, TERRACE + 0.04);
  const poles = [];
  for (let x = 20; x < W; x += 34) {
    poles.push(x);
  }
  let last = null;
  for (const x of poles) {
    const y = 18.2;
    const top = TERRACE + 10.5;
    C.post('concrete', x, y, TERRACE - 0.3, top, 0.16, { kind: 'pole', name: 'pole' });
    C.draw(x, y, (K) => {
      const a = w(x, y - 0.9, top - 0.6);
      const b = w(x, y + 0.9, top - 0.6);
      K.cyl('metalDark', a, b, 0.06, 4);
      for (const off of [-0.7, 0, 0.7]) {
        K.cyl('insulatorWhite', w(x, y + off, top - 0.55), w(x, y + off, top - 0.35), 0.05, 6);
      }
      if (Math.round(x / 34) % 3 === 0) {
        K.cyl('concreteMid', w(x + 0.45, y, top - 3.2), w(x + 0.45, y, top - 2.0), 0.3, 10);
        K.box('metalDark', ...w(x + 0.1, y - 0.05, top - 2.7), ...w(x + 0.2, y + 0.05, top - 2.5));
      }
      /* Its yellow and black guard at the foot, as the town's poles have. */
      const f0 = w(x, y, TERRACE);
      K.cyl('craneYellow', f0, [f0[0], f0[1] + 1.8, f0[2]], 0.19, 8);
    });
    if (last !== null) {
      for (const off of [-0.7, 0, 0.7]) {
        C.wire([last, y + off, top - 0.3], [x, y + off, top - 0.3], 0.5);
      }
      C.wire([last, y, top - 2.4], [x, y, top - 2.4], 0.35, 'rope', 0.02);
    }
    last = x;
  }
}

/* ================================================================== */
/* THE STATION                                                          */
/* ================================================================== */

export const RAIL = { y: 28, gauge: 1.067 };
export const PLATFORM = { x0: 52, x1: 152, y0: 30.6, y1: 35.2, top: TERRACE + 0.95 };
export const RAILCAR = { x0: 98, x1: 116.5 };

function station(C) {
  const r = RAIL;
  const top = TERRACE + 0.2;
  /* The ballast and the two rails, out past both ends of the plot. */
  C.deco('dnBallast', -320, r.y - 1.6, TERRACE - 0.05, W + 320, r.y + 1.6, TERRACE + 0.12);
  for (const s of [-1, 1]) {
    const y = r.y + (s * r.gauge) / 2;
    C.deco('dnRail', -320, y - 0.04, top - 0.08, W + 320, y + 0.04, top + 0.06);
  }
  /* Sleepers, near the station only. */
  C.draw(150, r.y, (K) => {
    for (let x = -40; x < 360; x += 0.75) {
      const a = w(x, r.y - 1.05, TERRACE + 0.1);
      const b = w(x + 0.2, r.y + 1.05, TERRACE + 0.14);
      K.box('dnSleeper', a[0], a[1], b[2], b[0], b[1], a[2]);
    }
  }, true);
  /* The platform: a concrete edge, its yellow tactile line, its surface. */
  const p = PLATFORM;
  C.box('concreteMid', p.x0, p.y0, TERRACE - 0.3, p.x1, p.y1, p.top, { kind: 'wall', name: 'platform' });
  C.deco('craneYellow', p.x0 + 1, p.y0 + 0.9, p.top, p.x1 - 1, p.y0 + 1.2, p.top + 0.02);
  C.deco('white', p.x0, p.y0 - 0.02, p.top - 0.12, p.x1, p.y0 + 0.25, p.top + 0.01, true);
  /* Ramps down at each end. */
  C.draw(p.x0, p.y0, (K) => {
    for (const [x, dir] of [[p.x0, -1], [p.x1, 1]]) {
      const o = w(x, (p.y0 + p.y1) / 2, 0);
      K.begin(o[0], 0, o[2], 0, chunkAt(x, p.y0));
      K.extrude('concreteMid', [[0, TERRACE - 0.3], [0, p.top], [dir * 6, TERRACE], [dir * 6, TERRACE - 0.3]], -(p.y1 - p.y0) / 2, (p.y1 - p.y0) / 2);
      K.begin(0, 0, 0, 0, chunkAt(x, p.y0));
    }
  });
  /* The waiting shelter: a back wall, two short wind screens at its ends,
   * a lean to roof, a bench, open to the track. The screens stop short of
   * the front so the shelter is a tunnel a whoop flies end to end, under
   * the roof and past the bench, and not a slot under a wall. */
  const S = { x0: 96, x1: 106, y0: 32.4, y1: 35.0, h: 2.6 };
  C.box('dnTimber', S.x0, S.y1 - 0.15, p.top, S.x1, S.y1, p.top + S.h, { kind: 'wall', name: 'shelter' });
  C.box('dnTimber', S.x0, S.y1 - 0.8, p.top, S.x0 + 0.12, S.y1, p.top + S.h, { kind: 'wall', name: 'shelter end' });
  C.box('dnTimber', S.x1 - 0.12, S.y1 - 0.8, p.top, S.x1, S.y1, p.top + S.h, { kind: 'wall', name: 'shelter end' });
  C.post('dnWoodDark', S.x0 + 0.06, S.y0 + 0.06, p.top, p.top + S.h, 0.06, { kind: 'pole', name: 'shelter post' });
  C.post('dnWoodDark', S.x1 - 0.06, S.y0 + 0.06, p.top, p.top + S.h, 0.06, { kind: 'pole', name: 'shelter post' });
  C.box('dnRoofRust', S.x0 - 0.4, S.y0 - 0.6, p.top + S.h, S.x1 + 0.4, S.y1 + 0.2, p.top + S.h + 0.18, { kind: 'wall', name: 'shelter roof' });
  C.deco('dnWoodDark', S.x0 + 0.6, S.y1 - 0.6, p.top + 0.42, S.x1 - 0.6, S.y1 - 0.15, p.top + 0.48);
  C.draw(101, 34, (K) => {
    for (let x = S.x0 + 0.2; x < S.x1; x += 0.5) {
      const a = w(x, S.y1 + 0.005, p.top + 0.05);
      const b = w(x + 0.03, S.y1 + 0.02, p.top + S.h - 0.05);
      K.box('dnWoodDark', a[0], a[1], b[2], b[0], b[1], a[2]);
    }
  }, true);
  C.gap('THE SHELTER', 101, 33.35, 0, 1.4, p.top + 0.55, p.top + S.h - 0.35, 1000);
  /* The station house: one room, a tin roof, its name over the door. */
  const H = { x0: 66, x1: 76, y0: 35.2, y1: 42, h: 3.2 };
  C.box('dnTimber', H.x0, H.y0, TERRACE - 0.3, H.x1, H.y1, p.top + H.h, { kind: 'wall', name: 'station' });
  C.draw(71, 38, (K) => {
    const o = w(71, 38.6, 0);
    K.begin(o[0], 0, o[2], 0, chunkAt(71, 38));
    K.extrude('dnRoofRust', [[-5.6, p.top + H.h - 0.1], [5.6, p.top + H.h - 0.1], [0, p.top + H.h + 1.7]], -4.0, 4.0);
    K.begin(0, 0, 0, 0, chunkAt(71, 38));
    let a = w(69.5, H.y0 - 0.03, p.top);
    let b = w(72.5, H.y0, p.top + 2.2);
    K.box('glassLit', a[0], a[1], b[2], b[0], b[1], a[2]);
    for (const x of [H.x0 + 0.8, H.x1 - 2.8]) {
      a = w(x, H.y0 - 0.03, p.top + 1.0);
      b = w(x + 2, H.y0, p.top + 2.2);
      K.box('glassBlue', a[0], a[1], b[2], b[0], b[1], a[2]);
    }
    a = w(H.x0 - 0.05, H.y0 - 0.05, TERRACE);
    b = w(H.x1 + 0.05, H.y1 + 0.05, TERRACE + 0.9);
    K.box('dnWoodDark', a[0], a[1], b[2], b[0], b[1], a[2]);
  });
  C.box('dnRoofRust', H.x0 - 0.3, H.y0 - 0.3, p.top + H.h - 0.1, H.x1 + 0.3, H.y1 + 0.3, p.top + H.h + 0.75, { kind: 'wall', name: 'station roof', draw: false });
  C.sign('station:door', 71, H.y0 - 0.06, p.top + 2.7, N_SOUTH, 3.4, 0.6);
  /* The name board on the platform, its two posts and the name. */
  C.post('white', 126, 34.2, p.top, p.top + 2.4, 0.05, { kind: 'pole', name: 'name board' });
  C.post('white', 129.6, 34.2, p.top, p.top + 2.4, 0.05, { kind: 'pole', name: 'name board' });
  C.box('white', 125.8, 34.15, p.top + 1.25, 129.8, 34.3, p.top + 2.35, { kind: 'wall', name: 'name board' });
  C.sign('station:name', 127.8, 34.15, p.top + 1.8, N_SOUTH, 3.9, 1.0);
  C.sign('station:name', 127.8, 34.3, p.top + 1.8, N_NORTH, 3.9, 1.0);
  /* A lamp or two, and the bench outside. */
  for (const x of [62, 88, 116, 142]) {
    C.post('metalDark', x, p.y1 - 0.4, p.top, p.top + 3.6, 0.05, { kind: 'pole', name: 'lamp' });
    C.deco('lampGlow', x - 0.35, p.y1 - 0.75, p.top + 3.35, x + 0.35, p.y1 - 0.25, p.top + 3.45, true);
    C.deco('metalDark', x - 0.4, p.y1 - 0.8, p.top + 3.45, x + 0.4, p.y1 - 0.2, p.top + 3.55, true);
  }
  /* The one car railcar, stopped at the platform: a cream body, a red
   * band, windows down both sides, two cabs, a roof of vents. */
  const R = RAILCAR;
  const fl = top + 1.1;
  const rt = top + 3.75;
  const y0 = r.y - 1.4;
  const y1 = r.y + 1.4;
  C.box('dnTrainCream', R.x0, y0, fl, R.x1, y1, rt, { kind: 'wall', name: 'railcar' });
  C.box('metalDark', R.x0 + 1.2, y0 + 0.3, top + 0.15, R.x1 - 1.2, y1 - 0.3, fl, { kind: 'wall', name: 'railcar frame' });
  C.draw((R.x0 + R.x1) / 2, r.y, (K) => {
    let a = w(R.x0 - 0.02, y0 - 0.02, fl + 0.3);
    let b = w(R.x1 + 0.02, y1 + 0.02, fl + 0.75);
    K.box('dnTrainRed', a[0], a[1], b[2], b[0], b[1], a[2]);
    a = w(R.x0 - 0.02, y0 - 0.02, rt - 0.3);
    b = w(R.x1 + 0.02, y1 + 0.02, rt - 0.22);
    K.box('dnTrainRed', a[0], a[1], b[2], b[0], b[1], a[2]);
    for (const yy of [y0 - 0.03, y1]) {
      for (let x = R.x0 + 2.6; x < R.x1 - 2.4; x += 1.6) {
        a = w(x, yy, fl + 1.0);
        b = w(x + 1.2, yy + 0.03, fl + 2.1);
        K.box('glassDark', a[0], a[1], b[2], b[0], b[1], a[2]);
      }
      for (const x of [R.x0 + 1.3, R.x1 - 2.3]) {
        a = w(x, yy, fl + 0.1);
        b = w(x + 1.0, yy + 0.03, fl + 2.3);
        K.box('metalDark', a[0], a[1], b[2], b[0], b[1], a[2]);
      }
    }
    for (const x of [R.x0 - 0.03, R.x1]) {
      a = w(x, y0 + 0.35, fl + 1.1);
      b = w(x + 0.03, y1 - 0.35, fl + 2.1);
      K.box('glassDark', a[0], a[1], b[2], b[0], b[1], a[2]);
      a = w(x, r.y - 0.2, fl + 0.5);
      b = w(x + 0.03, r.y + 0.2, fl + 0.65);
      K.box('lampGlow', a[0], a[1], b[2], b[0], b[1], a[2]);
    }
    /* Bogies and wheels. */
    for (const cx of [R.x0 + 3.4, R.x1 - 3.4]) {
      a = w(cx - 1.3, y0 + 0.2, top + 0.25);
      b = w(cx + 1.3, y1 - 0.2, top + 0.85);
      K.box('rope', a[0], a[1], b[2], b[0], b[1], a[2]);
      for (const dx of [-0.9, 0.9]) {
        for (const yy of [y0 + 0.4, y1 - 0.4]) {
          K.cyl('metalDark', w(cx + dx, yy - 0.06, top + 0.42), w(cx + dx, yy + 0.06, top + 0.42), 0.42, 10);
        }
      }
    }
    /* The roof's vents and the exhaust stack. */
    for (let x = R.x0 + 3; x < R.x1 - 3; x += 3.2) {
      a = w(x, r.y - 0.6, rt);
      b = w(x + 1.4, r.y + 0.6, rt + 0.3);
      K.box('trim', a[0], a[1], b[2], b[0], b[1], a[2]);
    }
    K.cyl('metalDark', w(R.x0 + 2, r.y + 0.8, rt), w(R.x0 + 2, r.y + 0.8, rt + 0.6), 0.12, 6);
  });
  C.sign('railcar', R.x0 - 0.04, r.y, rt - 0.62, N_WEST, 1.6, 0.42);
  /* Sand blown over the platform's ends and over the line west of it, the
   * station half given back to the dunes. */
  C.draw(p.x0, p.y0, (K) => {
    const heaps = [[p.x0 + 1.5, 33, 2.6, 0.55], [p.x0 + 4, 32.4, 1.8, 0.35], [p.x1 - 2, 34.2, 2.2, 0.45], [36, r.y + 0.5, 3.4, 0.4], [26, r.y - 0.8, 2.8, 0.3], [170, r.y + 1.2, 3.0, 0.32]];
    for (const [x, y, rr, hh] of heaps) {
      const hb = y > p.y0 && x > p.x0 - 1 && x < p.x1 + 1 ? p.top : TERRACE + 0.12;
      K.blob('dnSand', w(x, y, hb), rr, hh, [0, x, 0]);
    }
  });
}

/* A level crossing on the lane to the car park, in the town's yellow and
 * black: two posts with the crossed boards and the lamps, and the booms. */
function crossing(C) {
  const cx = 641;
  for (const [x, y, s] of [[635.2, 24.4, -1], [646.8, 31.6, 1]]) {
    C.post('craneYellow', x, y, TERRACE, TERRACE + 3.3, 0.09, { kind: 'pole', name: 'crossing' });
    C.draw(x, y, (K) => {
      const c = w(x, y, TERRACE + 3.0);
      const len = 0.62;
      K.begin(c[0], c[1], c[2], Math.PI / 4, chunkAt(x, y));
      K.box('craneYellow', -len, -0.07, -0.02, len, 0.07, 0.02);
      K.begin(c[0], c[1], c[2], -Math.PI / 4, chunkAt(x, y));
      K.box('rope', -len, -0.07, -0.025, len, 0.07, 0.025);
      K.begin(0, 0, 0, 0, chunkAt(x, y));
      for (const dx of [-0.35, 0.35]) {
        K.cyl('lampRed', w(x + dx, y + s * 0.12, TERRACE + 2.3), w(x + dx, y + s * 0.2, TERRACE + 2.3), 0.12, 10);
      }
      /* The boom raised, striped. */
      for (let k = 0; k < 8; k += 1) {
        K.box(k % 2 ? 'rope' : 'craneYellow', ...w(x + 0.15, y - 0.05, TERRACE + 1.2 + k * 0.6), ...w(x + 0.25, y + 0.05, TERRACE + 1.8 + k * 0.6));
      }
    });
  }
  void cx;
}

/* ================================================================== */
/* THE CHAIR LIFT, down the bluff                                        */
/* ================================================================== */

export const LIFT = { x: 470, yTop: 92, yFoot: 204, cable: 4.6, half: 1.25 };

function liftHeight(y) {
  /* The cable's line, straight between the two bullwheels. */
  const top = TERRACE + LIFT.cable;
  const foot = g(LIFT.x, LIFT.yFoot) + LIFT.cable;
  const t = (y - LIFT.yTop) / (LIFT.yFoot - LIFT.yTop);
  return top + (foot - top) * t;
}

function chairLift(C) {
  const L = LIFT;
  /* The two stations: a deck under a roof on four posts, the bullwheel
   * at the open end, the drive house at the top. */
  for (const [y, dir] of [[L.yTop, 1], [L.yFoot, -1]]) {
    const gy = y === L.yTop ? TERRACE : g(L.x, y);
    C.box('concrete', L.x - 3, y - 4, gy - 0.6, L.x + 3, y + 4, gy + 0.6, { kind: 'wall', name: 'lift station' });
    for (const [dx, dy] of [[-2.7, -3.7], [2.7, -3.7], [-2.7, 3.7], [2.7, 3.7]]) {
      C.post('dnLift', L.x + dx, y + dy, gy + 0.6, gy + 5.6, 0.12, { kind: 'pole', name: 'lift station' });
    }
    C.box('dnRoofRust', L.x - 3.6, y - 4.6, gy + 5.6, L.x + 3.6, y + 4.6, gy + 6.0, { kind: 'wall', name: 'lift roof' });
    const wy = y + dir * 3.2;
    C.draw(L.x, wy, (K) => {
      const c = w(L.x, wy, gy + L.cable);
      K.cyl('dnLift', [c[0], c[1] - 0.12, c[2]], [c[0], c[1] + 0.12, c[2]], L.half + 0.1, 20);
      K.cyl('metalDark', [c[0], c[1] + 0.12, c[2]], [c[0], gy + 5.6, c[2]], 0.18, 8);
    });
    if (y === L.yTop) {
      C.box('wallBlue', L.x - 3, y - 10, TERRACE - 0.3, L.x + 3, y - 4, TERRACE + 4, { kind: 'wall', name: 'lift drive house' });
      C.sign('lift', L.x, y - 4.02, TERRACE + 3.2, N_NORTH, 3.4, 0.7);
    }
  }
  /* The towers, two on the bluff and one at its foot. */
  for (const y of [126, 152, 182]) {
    const gy = g(L.x, y);
    const top = liftHeight(y) + 0.3;
    C.post('dnLift', L.x, y, gy - 0.4, top, 0.22, { kind: 'pole', name: 'lift tower' });
    C.cap('dnLift', [L.x - L.half - 0.3, y, top], [L.x + L.half + 0.3, y, top], 0.12, { kind: 'pole', name: 'lift cross arm' });
    C.draw(L.x, y, (K) => {
      for (const s of [-1, 1]) {
        const c = w(L.x + s * L.half, y, top - 0.25);
        K.box('metalDark', c[0] - 0.12, c[1] - 0.1, c[2] - 1.0, c[0] + 0.12, c[1] + 0.1, c[2] + 1.0);
      }
      K.ladder('metal', w(L.x + 0.3, y, gy), w(L.x + 0.3, y, top - 0.5), 0.4);
      K.cyl('concrete', w(L.x, y, gy - 0.2), w(L.x, y, gy + 0.6), 0.6, 10);
    });
  }
  /* The cables and the chairs on them, every 13 m: up on the east line,
   * down on the west. */
  for (const s of [-1, 1]) {
    C.wire([L.x + s * L.half, L.yTop + 3.2, TERRACE + L.cable], [L.x + s * L.half, L.yFoot - 3.2, liftHeight(L.yFoot)], 0.6, 'rope', 0.035);
  }
  for (let y = L.yTop + 9; y < L.yFoot - 6; y += 13) {
    for (const s of [-1, 1]) {
      const x = L.x + s * L.half;
      const ch = liftHeight(y) - 0.25;
      C.draw(x, y, (K) => {
        K.cyl('metalDark', w(x, y, ch), w(x, y, ch - 1.7), 0.03, 4);
        const seat = w(x, y, ch - 1.75);
        K.box('dnChair', seat[0] - 0.55, seat[1] - 0.06, seat[2] - 0.25, seat[0] + 0.55, seat[1] + 0.04, seat[2] + 0.25);
        K.box('dnChair', seat[0] - 0.55, seat[1], seat[2] + 0.2 * s, seat[0] + 0.55, seat[1] + 0.5, seat[2] + 0.25 * s);
        K.cyl('metalDark', [seat[0] - 0.55, seat[1] + 0.35, seat[2] - 0.25], [seat[0] + 0.55, seat[1] + 0.35, seat[2] - 0.25], 0.02, 4);
      });
    }
  }
  /* Under the cable between the bluff's two towers is the line. */
  C.gap('UNDER THE LIFT', L.x, 139, 0, 2.6, Math.max(g(L.x, 137.7), g(L.x, 140.3)) + 0.4, liftHeight(139) - 2.4, 250);
}

/* ================================================================== */
/* THE CAMEL HUT AND ITS KIOSK                                          */
/* ================================================================== */

export const HUT = { x0: 600, x1: 612, y0: 192, y1: 199, h: 3.3 };
export const KIOSK = { x0: 620, x1: 623.5, y0: 192.5, y1: 196, h: 2.7 };

function camels(C) {
  const H = HUT;
  const base = lowest(H.x0, H.y0, H.x1, H.y1);
  H.base = base;
  /* Four posts and a back wall, open on three sides: the camels rest in
   * its shade in the heat of the day. */
  C.box('dnTimber', H.x0, H.y1 - 0.2, base - 0.3, H.x1, H.y1, base + H.h, { kind: 'wall', name: 'camel hut' });
  for (const x of [H.x0 + 0.15, (H.x0 + H.x1) / 2, H.x1 - 0.15]) {
    C.post('dnWoodDark', x, H.y0 + 0.15, base - 0.3, base + H.h, 0.12, { kind: 'pole', name: 'hut post' });
  }
  C.box('dnTimber', H.x0, H.y0, base - 0.3, H.x0 + 0.15, H.y1, base + 1.0, { kind: 'wall', name: 'hut rail' });
  C.draw((H.x0 + H.x1) / 2, (H.y0 + H.y1) / 2, (K) => {
    const o = w((H.x0 + H.x1) / 2, (H.y0 + H.y1) / 2, 0);
    K.begin(o[0], 0, o[2], Math.PI / 2, chunkAt(H.x0, H.y0));
    /* A thatch of reed on a low pitch, its eaves deep. */
    K.extrude('dnThatch', [[-4.7, base + H.h - 0.1], [4.7, base + H.h - 0.1], [4.7, base + H.h + 0.2], [0, base + H.h + 1.7], [-4.7, base + H.h + 0.2]], -7.2, 7.2);
    K.begin(0, 0, 0, 0, chunkAt(H.x0, H.y0));
    /* The planks of the back wall, the hay, the trough, the buckets. */
    for (let x = H.x0 + 0.3; x < H.x1; x += 0.45) {
      const a = w(x, H.y1 - 0.24, base);
      const b = w(x + 0.04, H.y1 - 0.2, base + H.h - 0.1);
      K.box('dnWoodDark', a[0], a[1], b[2], b[0], b[1], a[2]);
    }
    K.box('mxHay', ...w(H.x0 + 0.6, H.y1 - 1.6, base), ...w(H.x0 + 2.6, H.y1 - 0.4, base + 0.7));
    K.box('mxHay', ...w(H.x0 + 0.9, H.y1 - 1.4, base + 0.7), ...w(H.x0 + 2.3, H.y1 - 0.5, base + 1.2));
    K.box('dnWoodDark', ...w(H.x1 - 3.4, H.y1 - 1.0, base), ...w(H.x1 - 0.6, H.y1 - 0.4, base + 0.6));
    K.box('homeWater', ...w(H.x1 - 3.3, H.y1 - 0.95, base + 0.5), ...w(H.x1 - 0.7, H.y1 - 0.45, base + 0.58));
    for (const x of [H.x0 + 4, H.x0 + 4.6]) {
      K.cyl('mxBlue', w(x, H.y1 - 0.6, base), w(x, H.y1 - 0.6, base + 0.4), 0.2, 8, 0.24);
    }
    /* Saddle blankets over the hitching rail. */
    for (const [x, m] of [[H.x0 + 6.6, 'dnSaddle'], [H.x0 + 7.6, 'drIndigo'], [H.x0 + 8.6, 'dnSaddleGold']]) {
      K.box(m, ...w(x, H.y1 - 0.5, base + 1.0), ...w(x + 0.8, H.y1 - 0.42, base + 1.6));
    }
    K.cyl('dnWoodDark', w(H.x0 + 6.4, H.y1 - 0.46, base + 1.6), w(H.x0 + 9.6, H.y1 - 0.46, base + 1.6), 0.05, 6);
  });
  C.box('dnThatch', H.x0 - 0.6, H.y0 - 1.0, base + H.h - 0.1, H.x1 + 0.6, H.y1 + 1.0, base + H.h + 0.8, { kind: 'wall', name: 'hut roof', draw: false });
  /* Through the hut, west to east, under the thatch. */
  C.gap('THE CAMEL HUT', H.x0 + 4, (H.y0 + H.y1) / 2 - 0.3, 0, 4.4, base + 1.35, base + H.h - 0.4, 1000);

  /* The ticket kiosk: a little booth with a door front and back, a
   * counter, a roof, and an awning back to the hut's corner. */
  const k = KIOSK;
  const kb = lowest(k.x0, k.y0, k.x1, k.y1);
  const door0 = 0.7;
  const door1 = 2.8;
  for (const y of [k.y0, k.y1 - 0.12]) {
    C.box('wallWhite', k.x0, y, kb - 0.3, k.x0 + door0, y + 0.12, kb + k.h, { kind: 'wall', name: 'kiosk' });
    C.box('wallWhite', k.x0 + door1, y, kb - 0.3, k.x1, y + 0.12, kb + k.h, { kind: 'wall', name: 'kiosk' });
    C.box('wallWhite', k.x0 + door0, y, kb + 2.25, k.x0 + door1, y + 0.12, kb + k.h, { kind: 'wall', name: 'kiosk lintel' });
  }
  C.box('wallWhite', k.x0, k.y0, kb - 0.3, k.x0 + 0.12, k.y1, kb + k.h, { kind: 'wall', name: 'kiosk' });
  C.box('wallWhite', k.x1 - 0.12, k.y0, kb - 0.3, k.x1, k.y1, kb + 1.0, { kind: 'wall', name: 'kiosk counter' });
  C.box('wallWhite', k.x1 - 0.12, k.y0, kb + 2.1, k.x1, k.y1, kb + k.h, { kind: 'wall', name: 'kiosk' });
  C.box('dnRoofRust', k.x0 - 0.4, k.y0 - 0.4, kb + k.h, k.x1 + 0.4, k.y1 + 0.4, kb + k.h + 0.2, { kind: 'wall', name: 'kiosk roof' });
  C.deco('dnTimber', k.x1, k.y0 + 0.2, kb + 0.95, k.x1 + 0.4, k.y1 - 0.2, kb + 1.02);
  C.sign('kiosk', k.x1 + 0.02, (k.y0 + k.y1) / 2, kb + 2.38, N_EAST, 2.8, 0.42);
  C.sign('camels', (H.x0 + H.x1) / 2, H.y0 - 0.9, base + H.h + 0.55, N_SOUTH, 4.6, 0.9, 0.95);
  C.gap('THROUGH THE KIOSK', k.x0 + (door0 + door1) / 2, (k.y0 + k.y1) / 2, 90, door1 - door0 - 0.5, kb + 0.3, kb + 2.25 - 0.3, 1000);
  /* The awning from the hut's east posts to the kiosk, on two poles. */
  C.box('awning', H.x1, H.y0 + 0.4, base + 2.9, k.x0, k.y1 - 0.4, base + 3.0, { kind: 'wall', name: 'awning' });
  C.post('dnWoodDark', (H.x1 + k.x0) / 2, H.y0 + 0.5, base - 0.2, base + 2.9, 0.06, { kind: 'pole' });

  /* The camels: two standing saddled out front, three lying down. */
  const herd = [
    { x: 603.5, y: 188.2, yaw: 0.2, sit: false, m: 'dnSaddle' },
    { x: 609.0, y: 187.6, yaw: -0.15, sit: false, m: 'drIndigo' },
    { x: 595.5, y: 194.5, yaw: 1.4, sit: true, m: 'dnSaddleGold' },
    { x: 616.5, y: 201.5, yaw: 2.6, sit: true, m: null },
    { x: 598.0, y: 200.2, yaw: -2.0, sit: true, m: null },
  ];
  for (const c of herd) {
    camel(C, c);
  }
  /* A hitching rail, and the camel path's rope line. */
  C.cap('dnWoodDark', [602, 185.4, g(602, 185.4) + 0.95], [611, 185.4, g(611, 185.4) + 0.95], 0.05, { kind: 'pole', name: 'rail' });
  for (const x of [602, 611]) {
    C.post('dnWoodDark', x, 185.4, g(x, 185.4) - 0.3, g(x, 185.4) + 1.0, 0.07, { kind: 'pole', name: 'rail post' });
  }
}

/*
 * A Bactrian camel, two humps, about 2.1 m to the tops of them (the
 * figure in the reference list), drawn from blobs and tapered cylinders
 * in the hut's own colours. Its solid is a capsule along its body and one
 * up its neck. `yaw` is plan radians from east toward north.
 */
function camel(C, c) {
  const gy = g(c.x, c.y);
  const sc = { s: 0, c: 1 };
  sincos(c.yaw, sc);
  /* Along the body, in the plan, and across it. */
  const fx = sc.c;
  const fy = sc.s;
  const at = (along, across, h) => [c.x + fx * along - fy * across, c.y + fy * along + fx * across, gy + h];
  const bodyH = c.sit ? 0.75 : 1.55;
  C.cap('dnCamel', at(-0.6, 0, bodyH), at(0.6, 0, bodyH), c.sit ? 0.55 : 0.5, { draw: false, kind: 'obstacle', name: 'camel' });
  C.cap('dnCamel', at(0.9, 0, bodyH + 0.2), at(1.35, 0, bodyH + (c.sit ? 0.9 : 0.85)), 0.22, { draw: false, kind: 'obstacle', name: 'camel' });
  C.draw(c.x, c.y, (K) => {
    const W3 = (p) => w(p[0], p[1], p[2]);
    const spin = [0, -c.yaw, 0];
    K.blob('dnCamel', W3(at(0, 0, bodyH)), 0.95, 0.55, spin);
    K.blob('dnCamelDark', W3(at(-0.4, 0, bodyH + 0.48)), 0.32, 0.38, spin);
    K.blob('dnCamelDark', W3(at(0.35, 0, bodyH + 0.48)), 0.32, 0.4, spin);
    /* The neck down and up, the head forward, the ears. */
    K.cyl('dnCamel', W3(at(0.75, 0, bodyH + 0.05)), W3(at(1.25, 0, bodyH + 0.15)), 0.24, 8, 0.2);
    K.cyl('dnCamel', W3(at(1.25, 0, bodyH + 0.15)), W3(at(1.42, 0, bodyH + 0.85)), 0.18, 8, 0.16);
    K.cyl('dnCamel', W3(at(1.38, 0, bodyH + 0.85)), W3(at(1.82, 0, bodyH + 0.8)), 0.14, 8, 0.1);
    K.blob('dnCamelDark', W3(at(1.0, 0, bodyH + 0.25)), 0.2, 0.3, spin);
    for (const s of [-1, 1]) {
      K.cyl('dnCamelDark', W3(at(1.36, s * 0.08, bodyH + 0.98)), W3(at(1.32, s * 0.12, bodyH + 1.06)), 0.03, 4);
    }
    if (c.sit) {
      /* Folded legs under it. */
      for (const along of [-0.55, 0.55]) {
        for (const s of [-1, 1]) {
          K.cyl('dnCamelDark', W3(at(along, s * 0.45, 0.15)), W3(at(along + 0.45, s * 0.42, 0.15)), 0.12, 6);
        }
      }
    } else {
      for (const along of [-0.55, 0.6]) {
        for (const s of [-1, 1]) {
          K.cyl('dnCamel', W3(at(along, s * 0.25, bodyH - 0.2)), W3(at(along, s * 0.27, 0.55)), 0.11, 6, 0.08);
          K.cyl('dnCamelDark', W3(at(along, s * 0.27, 0.55)), W3(at(along, s * 0.27, 0)), 0.08, 6, 0.09);
        }
      }
      K.cyl('dnCamelDark', W3(at(-0.95, 0, bodyH + 0.1)), W3(at(-1.1, 0, bodyH - 0.5)), 0.04, 4);
    }
    if (c.m) {
      /* The saddle between the humps and its blanket down each flank,
       * with a tassel fringe in the other colour. */
      K.box(c.m, ...cornersAbout(K, at(0, 0, bodyH + 0.45), c.yaw, 0.38, 0.5, 0.06));
      for (const s of [-1, 1]) {
        const p = W3(at(0, s * 0.48, bodyH + 0.1));
        K.blob(c.m, p, 0.42, 0.3, spin);
      }
      K.cyl('dnSaddleGold', W3(at(-0.15, 0, bodyH + 0.5)), W3(at(-0.15, 0, bodyH + 0.85)), 0.04, 6);
      K.cyl('dnSaddleGold', W3(at(0.12, 0, bodyH + 0.5)), W3(at(0.12, 0, bodyH + 0.85)), 0.04, 6);
    }
  });
}

/* A box's two corners round a point, for a small box that need not turn
 * with its owner: the kit's boxes are on the axes, and a saddle a few
 * centimetres off its camel's line reads the same. */
function cornersAbout(K, p, yaw, hx, hz, hy) {
  void K;
  void yaw;
  const q = w(p[0], p[1], p[2]);
  return [q[0] - hx, q[1] - hy, q[2] - hz, q[0] + hx, q[1] + hy, q[2] + hz];
}

/* ================================================================== */
/* THE SAND FENCES                                                       */
/* ================================================================== */

/*
 * Rows of bamboo slat fence across the slopes, the way a dune coast keeps
 * its sand: posts every two metres, slats with as much air as bamboo
 * between them, so the wind drops its sand in their lee. A row runs east
 * along a line, a panel between each pair of posts, its foot on the sand
 * at each post. A panel left out is a gap, and three of them are named.
 *
 * The slats are one picture with clear gaps in it on one plane a panel
 * (./index.js), so a row of four hundred panels is one draw call; the
 * solid is a thin box a panel, which is all a five inch can tell apart.
 */
export const FENCE_H = 1.35;
export const FENCES = [
  { y: 478, x0: 40, x1: 360, skip: [9, 37, 71, 113], named: [37, 'FENCE GAP WEST'] },
  { y: 496, x0: 120, x1: 520, skip: [22, 64, 101, 160], named: [64, 'FENCE GAP'] },
  { y: 486, x0: 560, x1: 880, skip: [18, 55, 90, 132] },
  { y: 512, x0: 620, x1: 860, skip: [30, 77, 101] },
  { y: 176, x0: 740, x1: 880, skip: [12, 33, 51], named: [33, 'FENCE GAP EAST'] },
  { y: 186, x0: 150, x1: 330, skip: [20, 47, 70] },
];

function fences(C) {
  for (const f of FENCES) {
    const step = 2;
    let i = 0;
    for (let x = f.x0; x < f.x1; x += step, i += 1) {
      const ga = g(x, f.y);
      const gb = g(x + step, f.y);
      C.post('dnBambooDark', x, f.y, ga - 0.3, ga + FENCE_H + 0.12, 0.045, { kind: 'pole', name: 'fence post' });
      if (f.skip.includes(i)) {
        continue;
      }
      const lo = Math.min(ga, gb);
      const hi = Math.max(ga, gb) + FENCE_H;
      C.box('dnSlat', x + 0.05, f.y - 0.04, lo - 0.2, x + step - 0.05, f.y + 0.04, hi, { kind: 'wall', name: 'sand fence', draw: false });
      C.fences.push({ x0: x, x1: x + step, y: f.y, a: ga, b: gb });
    }
    /* The rails each side, top and bottom. */
    C.draw((f.x0 + f.x1) / 2, f.y, (K) => {
      for (let x = f.x0; x < f.x1; x += step) {
        const ga = g(x, f.y);
        const gb = g(x + step, f.y);
        for (const hh of [0.3, FENCE_H - 0.1]) {
          K.cyl('dnBambooDark', w(x, f.y + 0.06, ga + hh), w(x + step, f.y + 0.06, gb + hh), 0.022, 4);
        }
      }
    }, true);
    if (f.named) {
      const [k, name] = f.named;
      const x = f.x0 + k * step + 1;
      /* Open to the sky, so the window stands past the slats' tops: the
       * gap is the notch, and a whoop threads it low. */
      C.gap(name, x, f.y, 90, step - 0.5, g(x, f.y) + 0.25, g(x, f.y) + FENCE_H + 0.5, 500);
    }
  }
}

/* ================================================================== */
/* THE DUNES' PEOPLE, THE POND, THE GRASS                               */
/* ================================================================== */

const SHIRTS = ['mxOrange', 'mxBlue', 'white', 'mxRed', 'dnSaddleGold', 'drIndigo', 'mxGreen'];

/* A person standing, 1.6 m or so, facing plan `yaw`: shoes, legs, a shirt,
 * a head, a hat if `hat`. Drawn only; at this size nothing is solid. */
function person(K, x, y, k, hat = false) {
  const gy = g(x, y);
  const p = w(x, y, gy);
  const shirt = SHIRTS[k % SHIRTS.length];
  const tall = 1.5 + (k % 4) * 0.07;
  K.cyl('rope', p, [p[0], p[1] + tall * 0.48, p[2]], 0.12, 6, 0.15);
  K.cyl(shirt, [p[0], p[1] + tall * 0.48, p[2]], [p[0], p[1] + tall * 0.84, p[2]], 0.19, 6, 0.15);
  K.blob('drSkin', [p[0], p[1] + tall * 0.93, p[2]], 0.12, 0.13, [0, k, 0]);
  if (hat) {
    K.cyl(k % 2 ? 'white' : 'dnStraw', [p[0], p[1] + tall * 0.98, p[2]], [p[0], p[1] + tall * 1.0, p[2]], 0.24, 10);
    K.cone(k % 2 ? 'white' : 'dnStraw', [p[0], p[1] + tall * 1.0, p[2]], 0.13, 0.1, 8);
  }
}

function people(C) {
  /* On the crest, looking out to sea, in twos and threes; on the face,
   * climbing it; at the pond; and two on boards on a barchan's face. */
  const spots = [];
  for (const [x, n] of [[352, 3], [376, 2], [398, 4], [430, 2], [470, 3], [520, 2], [300, 2]]) {
    for (let i = 0; i < n; i += 1) {
      spots.push([x + i * 1.1, crestY(x) - 1.2 + (i % 2) * 0.8]);
    }
  }
  const climbers = [[380, 352], [383, 344], [386, 333], [410, 360], [408, 340], [356, 336]];
  spots.push(...climbers);
  spots.push([392, 307], [396, 306.5], [446, 297], [470, 268], [452, 300]);
  let k = 0;
  for (const [x, y] of spots) {
    k += 1;
    const kk = k;
    C.draw(x, y, (K) => person(K, x, y, kk, kk % 3 === 0), true);
  }
  /* Footprints up the face from the pond to the crest: two trails of dents
   * in the sand, in a darker sand, a step apart. */
  C.draw(390, 340, (K) => {
    const trails = [[396, 306, 392, crestY(392) - 0.5], [452, 300, 430, crestY(430) - 0.5], [360, 318, 352, crestY(352) - 0.5]];
    for (const [ax, ay, bx, by] of trails) {
      const n = Math.floor(Math.hypot(bx - ax, by - ay) / 0.7);
      for (let i = 0; i < n; i += 1) {
        const t = i / n;
        const wob = Math.sin(i * 0.9) * 0.6;
        const x = ax + (bx - ax) * t + wob + (i % 2 ? 0.18 : -0.18);
        const y = ay + (by - ay) * t;
        const q = w(x, y, sandAt(x, y) + 0.015);
        K.blob('dnSandDark', q, 0.14, 0.03, [0, i, 0]);
      }
    }
  }, true);
  /* The sandboarders on the big barchan's slip face, and their boards. */
  const b = BARCHANS[0];
  for (const [dx, dy, k2] of [[-6, -14, 5], [4, -18, 2]]) {
    const x = b.cx + dx;
    const y = b.cy + dy;
    C.draw(x, y, (K) => {
      person(K, x, y, k2, false);
      const q = w(x, y, g(x, y) + 0.05);
      K.box(k2 % 2 ? 'mxOrange' : 'mxBlue', q[0] - 0.15, q[1], q[2] - 0.6, q[0] + 0.15, q[1] + 0.04, q[2] + 0.6);
    }, true);
  }
  /* A summit post on the crest's high point. */
  const px = 381;
  const py = crestY(px);
  C.post('dnWoodDark', px, py, g(px, py) - 0.5, g(px, py) + 1.6, 0.08, { kind: 'pole', name: 'summit post' });
  C.sign('summit', px, py - 0.09, g(px, py) + 1.2, N_SOUTH, 0.3, 0.75, 0.0);
}

/* The pond's reeds and the dune grass, in clumps of blades, fine. */
function grass(C) {
  const rng = seededRandom(707).next;
  const clumps = [];
  /* Round the pond. */
  for (let i = 0; i < 140; i += 1) {
    const a = rng() * 6.283;
    const rr = 1.0 + rng() * 0.35;
    const x = POND.cx + Math.cos(a) * POND.rx * rr;
    const y = POND.cy + Math.sin(a) * POND.ry * rr;
    clumps.push([x, y, 0.5 + rng() * 0.5, 'dnGrass']);
  }
  /* The back of the beach and the hollow's edges: the dune grass that
   * holds the sand. */
  for (let i = 0; i < 900 && clumps.length < 620; i += 1) {
    const x = rng() * W;
    const y = 150 + rng() * 380;
    const yS = shoreY(x);
    const yc = crestY(x);
    const back = y > yS - 46 && y < yS - 10;
    const toe = y < yc - 70 && y > 160;
    if (!(back || (toe && rng() < 0.35))) {
      continue;
    }
    clumps.push([x, y, 0.35 + rng() * 0.45, rng() < 0.35 ? 'dnGrassDry' : 'dnGrass']);
  }
  for (const [x, y, s, m] of clumps) {
    C.draw(x, y, (K) => {
      const q = w(x, y, g(x, y) - 0.05);
      for (let k = 0; k < 3; k += 1) {
        const a = k * 2.1 + x;
        K.cone(m, [q[0] + Math.cos(a) * 0.18 * s, q[1], q[2] + Math.sin(a) * 0.18 * s], 0.16 * s, 0.9 * s + k * 0.12, 4);
      }
    }, true);
  }
}

/* ================================================================== */
/* THE WINDWARD SIDE AND THE BEACH                                       */
/* ================================================================== */

export const LIFEGUARD = { x: 470, y: 528, legs: 2.6, deck: 3.4 };
export const TETRA = { y: 612, x0: 150, x1: 410, gapAt: 268 };

function windward(C) {
  /* A paraglider's wing laid out on the slope, lines to its pilot, and a
   * windsock on the crest. */
  const wx0 = 268;
  const wy0 = 432;
  C.draw(wx0, wy0, (K) => {
    for (let i = 0; i < 11; i += 1) {
      const t = (i - 5) / 5;
      const x = wx0 + t * 6;
      const y = wy0 + 2.2 - t * t * 1.6;
      const q = w(x, y, sandAt(x, y) + 0.12);
      K.box(i % 2 ? 'dnWing' : 'dnWingRed', q[0] - 0.55, q[1] - 0.06, q[2] - 1.0, q[0] + 0.55, q[1] + 0.12, q[2] + 1.0);
    }
    const pilot = [wx0, wy0 - 7];
    person(K, pilot[0], pilot[1], 4, false);
    for (const t of [-1, -0.5, 0, 0.5, 1]) {
      const x = wx0 + t * 6;
      const y = wy0 + 1.2 - t * t * 1.6;
      K.cyl('rope', w(x, y, sandAt(x, y) + 0.15), w(pilot[0], pilot[1], g(pilot[0], pilot[1]) + 1.2), 0.008, 3);
    }
  }, true);
  const sx = 300;
  const sy = crestY(sx) + 1;
  C.post('white', sx, sy, g(sx, sy) - 0.5, g(sx, sy) + 5.2, 0.05, { kind: 'pole', name: 'windsock pole' });
  C.draw(sx, sy, (K) => {
    const top = w(sx, sy, g(sx, sy) + 5.0);
    for (let i = 0; i < 4; i += 1) {
      const r0 = 0.24 - i * 0.04;
      K.cyl(i % 2 ? 'white' : 'mxOrange', [top[0], top[1] - i * 0.05, top[2] + 0.1 + i * 0.32], [top[0], top[1] - (i + 1) * 0.05, top[2] + 0.1 + (i + 1) * 0.32], r0, 8, r0 - 0.04);
    }
  });
  /* And one in the air, hanging over the windward slope in the sea wind:
   * a curved wing of cells, its lines and its pilot in a harness. Solid,
   * as a thing that big is worth flying round. */
  const ax = 560;
  const ay = 460;
  const ah = g(ax, ay) + 26;
  C.cap('dnWing', [ax - 4.2, ay, ah + 6.4], [ax + 4.2, ay, ah + 6.4], 0.9, { draw: false, kind: 'obstacle', name: 'paraglider' });
  C.cap('drIndigo', [ax, ay, ah], [ax, ay, ah + 0.9], 0.35, { draw: false, kind: 'obstacle', name: 'paraglider pilot' });
  C.draw(ax, ay, (K) => {
    const n = 13;
    for (let i = 0; i < n; i += 1) {
      const t = (i - (n - 1) / 2) / ((n - 1) / 2);
      const x = ax + t * 5.2;
      const hh = ah + 6.8 - t * t * 1.6;
      const q = w(x, ay, hh);
      K.box(i % 3 === 0 ? 'dnWingRed' : (i % 3 === 1 ? 'dnWing' : 'white'), q[0] - 0.43, q[1] - 0.18, q[2] - 1.0, q[0] + 0.43, q[1] + 0.18, q[2] + 1.0);
      if (i % 2 === 0) {
        K.cyl('rope', w(x, ay, hh - 0.2), w(ax, ay, ah + 1.0), 0.01, 3);
      }
    }
    const p = w(ax, ay, ah);
    K.cyl('drIndigo', p, [p[0], p[1] + 0.9, p[2]], 0.22, 6, 0.18);
    K.blob('white', [p[0], p[1] + 1.05, p[2]], 0.15, 0.15, [0, 0, 0]);
    K.box('rope', p[0] - 0.25, p[1] - 0.1, p[2] - 0.35, p[0] + 0.25, p[1] + 0.3, p[2] + 0.35);
  });
}

function beach(C) {
  /* The lifeguard's tower: four legs, a deck and a rail, a parasol over a
   * chair, a ladder, and the flag. */
  const L = LIFEGUARD;
  const gy = g(L.x, L.y);
  const half = L.legs / 2;
  for (const [dx, dy] of [[-half, -half], [half, -half], [-half, half], [half, half]]) {
    C.post('white', L.x + dx, L.y + dy, gy - 0.5, gy + L.deck, 0.09, { kind: 'pole', name: 'tower leg' });
  }
  C.box('white', L.x - half - 0.2, L.y - half - 0.2, gy + L.deck, L.x + half + 0.2, L.y + half + 0.2, gy + L.deck + 0.18, { kind: 'wall', name: 'tower deck' });
  for (const [a, b] of [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[-1, 1], [1, 1]]]) {
    C.cap('drNoboriRed', [L.x + a[0] * (half + 0.1), L.y + a[1] * (half + 0.1), gy + L.deck + 0.9], [L.x + b[0] * (half + 0.1), L.y + b[1] * (half + 0.1), gy + L.deck + 0.9], 0.04, { kind: 'pole', name: 'tower rail' });
  }
  C.draw(L.x, L.y, (K) => {
    K.ladder('white', w(L.x, L.y - half - 0.9, gy), w(L.x, L.y - half - 0.2, gy + L.deck), 0.5);
    const top = w(L.x, L.y, gy + L.deck + 0.18);
    K.cyl('white', top, [top[0], top[1] + 2.6, top[2]], 0.03, 4);
    K.cone('drNoboriRed', [top[0], top[1] + 2.2, top[2]], 1.4, 0.55, 10);
    K.box('mxOrange', top[0] - 0.3, top[1], top[2] - 0.3, top[0] + 0.3, top[1] + 0.45, top[2] + 0.3);
    K.box('mxOrange', top[0] - 0.3, top[1] + 0.45, top[2] + 0.22, top[0] + 0.3, top[1] + 0.95, top[2] + 0.3);
  });
  C.post('white', L.x + half + 0.8, L.y, gy - 0.5, gy + 6.5, 0.04, { kind: 'pole', name: 'flag pole' });
  C.sign('flag', L.x + half + 1.35, L.y, gy + 6.0, N_SOUTH, 1.0, 0.7, 0.0);
  C.sign('flag', L.x + half + 1.35, L.y, gy + 6.0, N_NORTH, 1.0, 0.7, 0.0);
  C.sign('lifeguard', L.x, L.y - half - 0.22, gy + L.deck - 0.25, N_SOUTH, 1.8, 0.4);
  C.gap('THE LIFEGUARD TOWER', L.x, L.y, 90, L.legs - 0.6, gy + 0.5, gy + L.deck - 0.35, 1000);

  /* A beach sign, a lifebuoy stand, a fishing boat up on its rollers,
   * driftwood and the glass floats a winter sea leaves. */
  C.post('metal', 430, 520, g(430, 520) - 0.4, g(430, 520) + 2.2, 0.05, { kind: 'pole', name: 'sign' });
  C.box('white', 429.1, 519.95, g(430, 520) + 1.3, 430.9, 520.05, g(430, 520) + 2.3, { kind: 'wall', name: 'sign' });
  C.sign('swim', 430, 519.94, g(430, 520) + 1.8, N_SOUTH, 1.8, 1.0);
  C.post('drNoboriRed', 500, 522, g(500, 522) - 0.3, g(500, 522) + 1.7, 0.05, { kind: 'pole' });
  C.draw(500, 522, (K) => {
    const q = w(500, 521.9, g(500, 522) + 1.3);
    K.torus('dnBuoy', q, 0.33, 0.08);
  });
  const bx = 742;
  const by = 532;
  const bg = lowest(bx - 4, by - 1.5, bx + 4, by + 1.5);
  C.box('white', bx - 3.6, by - 1.1, bg + 0.35, bx + 3.2, by + 1.1, bg + 1.25, { kind: 'wall', name: 'boat' });
  C.draw(bx, by, (K) => {
    const o = w(bx, by, 0);
    K.begin(o[0], 0, o[2], 0, chunkAt(bx, by));
    K.extrude('white', [[-3.6, bg + 1.25], [3.2, bg + 1.25], [4.6, bg + 1.5], [3.4, bg + 0.6], [-3.6, bg + 0.35]], -1.15, 1.15);
    K.extrude('containerBlue', [[-3.6, bg + 0.75], [3.4, bg + 0.75], [3.9, bg + 0.98], [-3.6, bg + 0.98]], -1.17, 1.17);
    K.begin(0, 0, 0, 0, chunkAt(bx, by));
    let a = w(bx - 2.6, by - 0.9, bg + 1.25);
    let b = w(bx - 0.8, by + 0.9, bg + 2.6);
    K.box('white', a[0], a[1], b[2], b[0], b[1], a[2]);
    a = w(bx - 2.62, by - 0.92, bg + 1.95);
    b = w(bx - 0.78, by + 0.92, bg + 2.4);
    K.box('glassDark', a[0], a[1], b[2], b[0], b[1], a[2]);
    K.cyl('metal', w(bx - 1.7, by, bg + 2.6), w(bx - 1.7, by, bg + 4.4), 0.04, 4);
    K.cyl('lampRed', w(bx - 1.7, by, bg + 4.4), w(bx - 1.7, by, bg + 4.6), 0.07, 6);
    for (const x of [bx - 2.4, bx, bx + 2.4]) {
      K.cyl('dnWoodDark', w(x, by - 1.6, bg + 0.17), w(x, by + 1.6, bg + 0.17), 0.17, 8);
    }
    for (let i = 0; i < 6; i += 1) {
      K.ball(i % 2 ? 'dnFloat' : 'mxOrange', w(bx + 2.2 + (i % 3) * 0.4, by + 1.5 + Math.floor(i / 3) * 0.4, bg + 0.2), 0.2);
    }
  });
  for (const [x, y, len, a] of [[300, 528, 3.4, 0.4], [612, 534, 2.6, -0.3], [820, 528, 4.2, 0.1], [180, 530, 2.2, 1.2]]) {
    C.draw(x, y, (K) => {
      const c = Math.cos(a) * len * 0.5;
      const s = Math.sin(a) * len * 0.5;
      K.cyl('dnDrift', w(x - c, y - s, g(x - c, y - s) + 0.12), w(x + c, y + s, g(x + c, y + s) + 0.1), 0.13, 6, 0.09);
      K.ball('dnFloat', w(x + c + 0.6, y + s, g(x + c, y + s) + 0.12), 0.16);
    }, true);
  }
  /* The breakwater, two staggered rows of tetrapods offshore, with a gap
   * a quad fits through and a crest of foam on the sea side. */
  const T = TETRA;
  const rng = seededRandom(613).next;
  for (let row = 0; row < 2; row += 1) {
    for (let x = T.x0 + row * 1.6; x < T.x1; x += 3.2) {
      if (Math.abs(x - T.gapAt) < 3.2) {
        continue;
      }
      const y = T.y + row * 2.8;
      const h = 0.3 + row * 0.2;
      tetrapod(C, x, y, h, rng() * 3.1, rng() < 0.5);
    }
  }
  C.gap('THE BREAKWATER', T.gapAt, T.y + 1.4, 90, 2.4, 0.3, 2.2, 1000);
}

/* A tetrapod: four legs out of one middle, each a tapered cylinder, and a
 * capsule a leg for its solid. One leg up, three splayed down, or turned. */
function tetrapod(C, x, y, h, spin, flip) {
  const legs = [];
  const sc = { s: 0, c: 1 };
  /* The four directions of a regular tetrahedron's vertices, one up. */
  const up = flip ? -1 : 1;
  legs.push([0, 0, up]);
  for (let k = 0; k < 3; k += 1) {
    sincos(spin + (k * 2 * 3.14159265) / 3, sc);
    legs.push([sc.c * 0.9428, sc.s * 0.9428, -up / 3]);
  }
  const c = [x, y, h + 1.0];
  for (const L of legs) {
    const tip = [c[0] + L[0] * 1.6, c[1] + L[1] * 1.6, c[2] + L[2] * 1.6];
    C.cap('dnTetra', c, tip, 0.42, { look: 'cyl', rTop: 0.3, kind: 'wall', name: 'tetrapod', seg: 8 });
  }
}

/* ================================================================== */
/* THE PINES                                                             */
/* ================================================================== */

function pines(C) {
  const rng = seededRandom(4242).next;
  const keep = [
    [440, 0, 780, 106], [96, 20, 160, 44], [20, 0, 900, 22], [462, 84, 478, 210], [526, 98, 554, 130],
    [40, 22, 200, 46],
  ];
  const clear = (x, y, r) => keep.every(([x0, y0, x1, y1]) => x < x0 - r || x > x1 + r || y < y0 - r || y > y1 + r);
  const placed = [];
  for (let i = 0; i < 3000 && placed.length < 230; i += 1) {
    const x = 4 + rng() * (W - 8);
    const y = 2 + rng() * 158;
    if (!clear(x, y, 3)) {
      continue;
    }
    /* Thicker on the terrace, thinning down the bluff. */
    if (y > 110 && rng() > (165 - y) / 55) {
      continue;
    }
    if (placed.some(([px, py]) => (px - x) * (px - x) + (py - y) * (py - y) < 38)) {
      continue;
    }
    placed.push([x, y]);
  }
  placed.forEach(([x, y], k) => {
    blackPine(C, x, y, 0.8 + rng() * 0.5, 1000 + k);
  });
  return placed.length;
}

/*
 * A BLACK PINE, the coast's own tree: a trunk that leans and kinks away
 * from the sea wind, a few limbs out of its upper half, and the needles in
 * flat clouds at the ends of them, the shape a Japanese garden prunes a
 * pine to and the wind prunes the coast's. Drawn as the town's leaf clumps
 * (K.leaf, squashed, so they ink as clumps), solid as a capsule up each
 * limb and a squat sphere in each cloud.
 */
function blackPine(C, x, y, size, seed) {
  const r = seededRandom(seed);
  const base = g(x, y) - 0.15;
  const H = (7.5 + r.next() * 3) * size;
  /* The lean is away from the sea, south, with a little east or west. */
  const lx = (r.next() - 0.5) * 0.5;
  const ly = -(0.15 + r.next() * 0.25);
  const tr = 0.2 * size;
  const p0 = [x, y, base];
  const p1 = [x + lx * H * 0.35, y + ly * H * 0.3, base + H * 0.42];
  const p2 = [x + lx * H * 0.6 + (r.next() - 0.5) * 0.8, y + ly * H * 0.55, base + H * 0.78];
  C.cap('dnPineBark', p0, p1, tr, { kind: 'tree', name: 'pine trunk', draw: false });
  C.cap('dnPineBark', p1, p2, tr * 0.75, { kind: 'tree', name: 'pine trunk', draw: false });
  const pads = [[p2[0], p2[1], p2[2] + 0.7 * size, 2.0 * size]];
  const limbs = [];
  const n = 2 + Math.floor(r.next() * 3);
  const sc = { s: 0, c: 1 };
  for (let i = 0; i < n; i += 1) {
    sincos(r.next() * 6.283 + i * 2.1, sc);
    const from = i % 2 ? p1 : [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2, (p1[2] + p2[2]) / 2];
    const len = (2.0 + r.next() * 1.8) * size;
    const end = [from[0] + sc.c * len, from[1] + sc.s * len, from[2] + (0.6 + r.next() * 1.4) * size];
    limbs.push([from, end]);
    pads.push([end[0], end[1], end[2] + 0.35 * size, (1.3 + r.next() * 0.8) * size]);
  }
  for (const [a, b] of limbs) {
    C.cap('dnPineBark', a, b, tr * 0.45, { kind: 'tree', name: 'pine limb', draw: false });
  }
  for (const [px, py, ph, pr] of pads) {
    C.cap('stCedar1', [px, py, ph], [px, py, ph], pr * 0.62, { kind: 'canopy', name: 'pine needles', draw: false });
  }
  C.draw(x, y, (K) => {
    const W3 = (q) => w(q[0], q[1], q[2]);
    K.cyl('dnPineBark', W3(p0), W3(p1), tr, 6, tr * 0.8);
    K.cyl('dnPineBark', W3(p1), W3(p2), tr * 0.78, 6, tr * 0.5);
    K.cyl('dnPineBark', W3(p0), W3([x, y, base + 0.5]), tr * 1.5, 6, tr);
    for (const [a, b] of limbs) {
      K.cyl('dnPineBark', W3(a), W3(b), tr * 0.42, 5, tr * 0.25);
    }
    pads.forEach(([px, py, ph, pr], i) => {
      const spin = [0, (seed * 1.7 + i) % 6.28, 0];
      /* One squashed clump a cloud: the cel ramp and its ink already give
       * it a lit top and a dark underside, and a second clump under it
       * cost a third of the map's triangles for a band nobody could see. */
      K.leaf(i % 3 === 0 ? 'stCedar2' : i % 2 ? 'stCedar0' : 'stCedar1', W3([px, py, ph]), pr, pr * 0.34, spin);
    });
  });
}

/* ================================================================== */
/* THE RACE                                                              */
/* ================================================================== */

/*
 * The open race, twelve bamboo frames, in its order: off the look out and
 * down the bluff, past the camels, over the pond, up the slip face, over
 * the high point of the crest, down the windward side to the beach, along
 * the water's edge past the lifeguard, back up through the saddle, over
 * the biggest crescent's crest and home up the bluff. Each is a frame of
 * two poles and a cross bar with a straw rope under it, its paper
 * streamers hanging, and a number on the bar; its opening is a named gap.
 */
export const GATE = { w: 3.2, h: 2.7 };

/* A frame stands on the highest sand across its width, so on a slope its
 * opening never dips under the dune. */
function footOf(x, y, deg) {
  const sc = { s: 0, c: 1 };
  sincos((deg * Math.PI) / 180, sc);
  let h = -Infinity;
  for (let k = -4; k <= 4; k += 1) {
    const t = (k / 4) * (GATE.w / 2);
    h = Math.max(h, g(x - sc.s * t, y + sc.c * t));
  }
  return h;
}
export function raceGates() {
  const pts = [
    ['1 OFF THE BLUFF', 528, 146],
    ['2 THE CAMEL ROW', 590, 206],
    ['3 OVER THE OASIS', 420, 284],
    ['4 THE SLIP FACE', 384, 350],
    ['5 THE HORSE\'S BACK', 372, null],
    ['6 WINDWARD', 300, 462],
    ['7 THE TIDE LINE', 230, 538],
    ['8 THE BEACH RUN', 560, 540],
    ['9 THE SADDLE', 708, null],
    ['10 THE CRESCENT', 690, 236],
    ['11 THE HOLLOW', 620, 172],
    ['12 HOME', 544, 128],
  ].map(([name, x, y]) => ({ name, x, y: y === null ? crestY(x) : y }));
  return pts.map((p, i) => {
    const a = pts[(i + pts.length - 1) % pts.length];
    const b = pts[(i + 1) % pts.length];
    /* Faced along the line from the gate before it to the one after, to
     * the nearest five degrees, so a heading is a product. */
    const deg = Math.round((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI / 5) * 5;
    return { ...p, deg, base: footOf(p.x, p.y, deg) };
  });
}

function race(C) {
  for (const [i, gt] of raceGates().entries()) {
    const sc = { s: 0, c: 1 };
    sincos((gt.deg * Math.PI) / 180, sc);
    /* Across the line of flight, in the plan. */
    const ax = -sc.s;
    const ay = sc.c;
    const half = GATE.w / 2 + 0.12;
    const posts = [-1, 1].map((s) => [gt.x + ax * half * s, gt.y + ay * half * s]);
    const top = gt.base + GATE.h;
    for (const [x, y] of posts) {
      C.post('dnBamboo', x, y, g(x, y) - 0.5, top + 0.45, 0.075, { kind: 'gate', name: 'gate post' });
    }
    C.cap('dnBamboo', [posts[0][0], posts[0][1], top + 0.12], [posts[1][0], posts[1][1], top + 0.12], 0.07, { kind: 'gate', name: 'gate bar' });
    const n = [sc.c, 0, -sc.s];
    C.draw(gt.x, gt.y, (K) => {
      const W3 = (p) => w(p[0], p[1], p[2]);
      /* The rope, sagging, and the paper streamers on it. */
      const ropeA = [posts[0][0], posts[0][1], top - 0.12];
      const ropeB = [posts[1][0], posts[1][1], top - 0.12];
      const steps = 8;
      for (let k = 0; k < steps; k += 1) {
        const t0 = k / steps;
        const t1 = (k + 1) / steps;
        const at = (t) => W3([ropeA[0] + (ropeB[0] - ropeA[0]) * t, ropeA[1] + (ropeB[1] - ropeA[1]) * t, ropeA[2] - 0.22 * 4 * t * (1 - t)]);
        K.cyl('dnStraw', at(t0), at(t1), 0.06, 5);
      }
      for (const t of [0.22, 0.5, 0.78]) {
        const p = W3([ropeA[0] + (ropeB[0] - ropeA[0]) * t, ropeA[1] + (ropeB[1] - ropeA[1]) * t, ropeA[2] - 0.22 * 4 * t * (1 - t) - 0.05]);
        for (let z = 0; z < 3; z += 1) {
          K.box('white', p[0] - 0.05, p[1] - 0.16 * (z + 1), p[2] - 0.05, p[0] + 0.05, p[1] - 0.16 * z, p[2] + 0.05);
        }
      }
      /* The bamboo's joints, a darker ring every 40 cm. */
      for (const [x, y] of posts) {
        for (let hh = g(x, y) + 0.4; hh < top + 0.4; hh += 0.42) {
          K.cyl('dnBambooDark', W3([x, y, hh]), W3([x, y, hh + 0.05]), 0.085, 6);
        }
      }
    });
    C.sign(`gate:${i + 1}`, gt.x, gt.y, top + 0.12, n, 0.6, 0.42, 0.09);
    C.sign(`gate:${i + 1}`, gt.x, gt.y, top + 0.12, [-n[0], 0, -n[2]], 0.6, 0.42, 0.09);
    C.gap(gt.name, gt.x, gt.y, gt.deg, GATE.w - 0.6, gt.base + 0.35, top - 0.5, 100);
  }
}

/* ================================================================== */
/* THE WHOLE COAST                                                       */
/* ================================================================== */

/* The solids of one of the town's assets, turned and set down where the
 * coast placed it, in the world, as Sunnyfield's are (../sunny/plan.js). */
const SCQ = { s: 0, c: 1 };
function assetParts(a) {
  const [x, y, z] = w(a.x, a.y, a.h);
  const parts = a.el.style === 'loblolly' || a.el.style === 'broad' ? loblollyLayout(a.el) : partsOf(a.el);
  const out = [];
  if (parts.some((p) => p.t === 'box')) {
    quarterSinCos(quarterTurns(a.yaw), SCQ);
  } else {
    sincos(a.yaw, SCQ);
  }
  const { s, c } = SCQ;
  const turn = (p) => [x + (p[0] * c + p[2] * s), y + p[1], z + (-p[0] * s + p[2] * c)];
  for (const p of parts) {
    if (!p.solid) {
      continue;
    }
    if (p.t === 'box') {
      const A = turn(p.lo);
      const B = turn(p.hi);
      out.push({
        t: 'box', m: p.m, lo: [Math.min(A[0], B[0]), Math.min(A[1], B[1]), Math.min(A[2], B[2])],
        hi: [Math.max(A[0], B[0]), Math.max(A[1], B[1]), Math.max(A[2], B[2])],
        solid: true, draw: false, kind: p.kind, name: p.name, cast: false,
      });
    } else {
      out.push({
        t: 'cap', m: p.m, a: turn(p.a), b: turn(p.b), r: p.r, solid: true, draw: false,
        kind: p.kind, look: p.look, seg: p.seg, rTop: null, name: p.name, cast: false,
      });
    }
  }
  return out;
}

let MEMO = null;

/* The coast: { parts, draws, assets, signs, wires, fences, gaps, pines },
 * the same every call. */
export function coastLayout() {
  if (MEMO) {
    return MEMO;
  }
  const C = new Coast();
  lookout(C);
  centre(C);
  shops(C);
  carPark(C);
  road(C);
  station(C);
  crossing(C);
  chairLift(C);
  camels(C);
  fences(C);
  people(C);
  grass(C);
  windward(C);
  beach(C);
  const pineCount = pines(C);
  race(C);
  const parts = [...C.P.list];
  for (const a of C.assets) {
    parts.push(...assetParts(a));
  }
  MEMO = {
    parts, draws: C.draws, assets: C.assets, signs: C.signs, wires: C.wires, fences: C.fences, gaps: C.gaps, pines: pineCount,
  };
  return MEMO;
}

/* ================================================================== */
/* THE MARKS                                                             */
/* ================================================================== */

/*
 * THE ONE HIDDEN KONEX DRONE SIGN (the owner's promise of a logo hidden in
 * every map): on the inside of the camel hut's back wall, facing south,
 * 1.8 m up, between the hay and the trough. It is under the thatch and
 * behind the herd, so it is seen only from inside the hut, which is the
 * line THE CAMEL HUT names: in from the west, a look left, and out.
 */
export function dunesMarkSpots() {
  coastLayout();
  const x = (HUT.x0 + HUT.x1) / 2;
  const y = HUT.y1 - 0.2 - 0.02;
  const p = w(x, y, HUT.base + 1.8);
  return [{ slug: 'konexdrone', key: 'dunes#konexdrone~hidden', p, n: N_SOUTH, up: [0, 1, 0], w: 1.1, chunk: chunkOf(p[0], p[2]) }];
}

/* The title camera's tour: along the crest, out over the sea, back over
 * the hollow to the terrace. Plan [x, y, h]. */
export function tourPoints() {
  return [
    [540, 140, 48], [460, 260, 30], [372, 360, 58], [300, 470, 34], [420, 560, 20],
    [700, 470, 40], [760, 260, 30], [620, 150, 46],
  ];
}

