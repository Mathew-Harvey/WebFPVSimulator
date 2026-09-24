/*
 * street.js: a bridge, a billboard, a utility pole, a street lamp, a
 * vending machine, a parked car and trees.
 *
 * The bridge, the vending machine and the car are boxes and keep to the
 * compass headings. The billboard, the poles and the trees are capsules and
 * turn freely: a billboard's panel is solid as a stack of horizontal
 * capsules, the same way the race field makes a barrier at any angle.
 *
 * THE VENDING MACHINE AND THE CARS ARE THE TOWN'S, drawn by the vendored
 * builders in src/maps/city/vendored/world/ through the kit, so a kei van in
 * a built map is the same kei van that is parked outside the conbini. Their
 * solids are written here from the same dimensions those builders use.
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

import { Parts, seededRandom, seedOf, around } from './parts.js';
import { sincos } from './trig.js';
import { TREE_STYLES } from './types.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/* ------------------------------------------------------------------ *
 * THE BRIDGE. An overpass on piers, or the town's kind of footbridge with
 * a flight of steps at each end. The deck is one box and it is landable;
 * the air under it is the point.
 * ------------------------------------------------------------------ */

function bridgeSpec(el) {
  const d = el.dims;
  const foot = el.style === 'footbridge';
  const span = clamp(d.span, 6, 80);
  const width = foot ? clamp(d.width, 2, 5) : clamp(d.width, 4, 20);
  const h = clamp(d.height, 3, 20);
  const piers = clamp(Math.round(d.piers), 0, 6);
  return { foot, span, width, h, piers, deckT: foot ? 0.45 : 0.95 };
}

export function bridgeLayout(el) {
  const s = bridgeSpec(el);
  const P = new Parts();
  const x0 = -s.span / 2;
  const x1 = s.span / 2;
  const z0 = -s.width / 2;
  const z1 = s.width / 2;
  const dy = s.h - s.deckT;
  const deckMat = s.foot ? 'bridgeSteel' : 'concrete';
  P.box(deckMat, x0, dy, z0, x1, s.h, z1, { name: 'deck' });
  /* Parapets: solid, and the edge a pilot skims along the top of. */
  const pm = s.foot ? 'bridgeSteel' : 'concreteMid';
  const ph = s.foot ? 1.15 : 1.0;
  const pt = s.foot ? 0.08 : 0.3;
  P.box(pm, x0, s.h, z0, x1, s.h + ph, z0 + pt, { name: 'parapet' });
  P.box(pm, x0, s.h, z1 - pt, x1, s.h + ph, z1, { name: 'parapet' });

  /* The pier lines: at both ends, and `piers` more between. Each line is
   * two columns under a crosshead, so the gap between them is a way under
   * the deck along its length as well as across it. */
  const lines = [x0 + 0.8, x1 - 0.8];
  for (let i = 1; i <= s.piers; i += 1) {
    lines.push(x0 + (i / (s.piers + 1)) * s.span);
  }
  const col = s.foot ? 0.18 : 0.6;
  for (const x of lines) {
    const zs = s.width >= 6 ? [z0 + 1.2, z1 - 1.2] : [0];
    for (const z of zs) {
      P.box(s.foot ? 'bridgeSteel' : 'concreteMid', x - col, 0, z - col, x + col, dy, z + col, { name: 'pier' });
    }
    if (zs.length > 1) {
      P.box(s.foot ? 'bridgeSteel' : 'concreteMid', x - col - 0.1, dy - 0.7, z0 + 0.4, x + col + 0.1, dy, z1 - 0.4, { name: 'crosshead' });
    }
  }

  /* A footbridge's steps, one flight at each end, running out along x. */
  if (s.foot) {
    const rise = 0.16;
    const run = 0.3;
    const n = Math.max(2, Math.ceil(s.h / rise));
    for (const dir of [-1, 1]) {
      const start = dir > 0 ? x1 : x0;
      for (let i = 0; i < n; i += 1) {
        const top = s.h - (i + 1) * rise;
        if (top <= 0.02) {
          break;
        }
        const xa = start + dir * i * run;
        const xb = start + dir * (i + 1) * run;
        P.box('bridgeSteel', xa, Math.max(0, top - 0.3), z0, xb, top, z1, { name: 'step' });
      }
      const far = start + dir * n * run;
      P.cap('bridgeSteel', [start, s.h + 0.95, z0 + 0.04], [far, 0.95, z0 + 0.04], 0.035, { name: 'stairRail' });
      P.cap('bridgeSteel', [start, s.h + 0.95, z1 - 0.04], [far, 0.95, z1 - 0.04], 0.035, { name: 'stairRail' });
    }
  } else {
    /* Street lamps on the parapet, one each side at the middle. */
    for (const z of [z0 + 0.15, z1 - 0.15]) {
      const o = z < 0 ? 1 : -1;
      P.post('metalDark', 0, z, s.h + 1.0, s.h + 7.0, 0.07, { name: 'lamp' });
      P.cap('metalDark', [0, s.h + 7.0, z], [0, s.h + 7.2, z + o * 1.4], 0.05, { name: 'lampArm' });
    }
  }
  return P.list;
}

export function bridgeDraw(el, parts, K) {
  const s = bridgeSpec(el);
  const x0 = -s.span / 2;
  const x1 = s.span / 2;
  const z0 = -s.width / 2;
  const z1 = s.width / 2;
  const dy = s.h - s.deckT;
  if (s.foot) {
    /* The footbridge's balustrade: a top rail and close bars, both sides,
     * painted the town's pale green. */
    for (const z of [z0 + 0.04, z1 - 0.04]) {
      K.cyl('bridgeSteel', [x0, s.h + 1.15, z], [x1, s.h + 1.15, z], 0.05, 6);
      for (let x = x0; x <= x1; x += 0.24) {
        K.box('bridgeSteel', x - 0.015, s.h, z - 0.015, x + 0.015, s.h + 1.12, z + 0.015);
      }
    }
    K.box('bridgeDeck', x0, s.h, z0 + 0.08, x1, s.h + 0.03, z1 - 0.08);
    K.box('bridgeSteelDark', x0, dy - 0.3, z0 + 0.2, x1, dy, z1 - 0.2);
    K.sign('bridgePlate', 0, dy + 0.2, z1 + 0.01, 3.2, 0.5, '+z', 0);
    K.sign('bridgePlate', 0, dy + 0.2, z0 - 0.01, 3.2, 0.5, '-z', 0);
    return;
  }
  /* The road: tarmac on the deck, white lines, a dark joint at each end. */
  K.box('asphalt', x0, s.h, z0 + 0.3, x1, s.h + 0.03, z1 - 0.3);
  for (let x = x0 + 1; x < x1 - 2; x += 5) {
    K.box('lineWhite', x, s.h + 0.03, -0.08, x + 3, s.h + 0.04, 0.08);
  }
  K.box('lineWhite', x0, s.h + 0.03, z0 + 0.55, x1, s.h + 0.04, z0 + 0.7);
  K.box('lineWhite', x0, s.h + 0.03, z1 - 0.7, x1, s.h + 0.04, z1 - 0.55);
  /* Girders under the deck: the lines that make an underside read. */
  for (let z = z0 + 1.0; z < z1 - 0.5; z += 1.8) {
    K.box('concreteDark', x0 + 0.3, dy - 0.55, z - 0.25, x1 - 0.3, dy, z + 0.25);
  }
  /* The coping on the parapets and a name plate on each face. */
  K.box('trim', x0, s.h + 1.0, z0 - 0.02, x1, s.h + 1.08, z0 + 0.32);
  K.box('trim', x0, s.h + 1.0, z1 - 0.32, x1, s.h + 1.08, z1 + 0.02);
  K.sign('bridgePlate', 0, s.h + 0.5, z0 - 0.01, 3.0, 0.5, '-z', 1);
  K.sign('bridgePlate', 0, s.h + 0.5, z1 + 0.01, 3.0, 0.5, '+z', 1);
  for (const z of [z0 + 0.15, z1 - 0.15]) {
    const o = z < 0 ? 1 : -1;
    K.box('lampHead', -0.25, s.h + 7.05, z + o * 1.2, 0.25, s.h + 7.25, z + o * 1.65);
    K.box('lampGlow', -0.2, s.h + 7.03, z + o * 1.25, 0.2, s.h + 7.05, z + o * 1.6);
  }
}

/* ------------------------------------------------------------------ *
 * THE BILLBOARD. A panel on two legs with a catwalk in front of it, and
 * the gap under it is the line. The panel faces +x and its artwork is one
 * of the kit's invented manga adverts.
 * ------------------------------------------------------------------ */

function billboardSpec(el) {
  const d = el.dims;
  return {
    W: clamp(d.width, 2, 20),
    H: clamp(d.height, 1.2, 8),
    lift: clamp(d.lift, 1.5, 30),
  };
}

export function billboardLayout(el) {
  const s = billboardSpec(el);
  const P = new Parts();
  const legZ = s.W * 0.3;
  for (const z of [-legZ, legZ]) {
    P.post('billboardSteel', -0.35, z, 0, s.lift + s.H * 0.85, 0.2, { name: 'leg' });
  }
  /* The panel, solid as a stack of horizontal capsules whose rounded ends
   * stop at its edges. */
  const r = 0.22;
  const n = Math.max(1, Math.ceil((s.H - 2 * r) / (1.6 * r)));
  for (let i = 0; i <= n; i += 1) {
    const y = s.lift + r + (i / n) * (s.H - 2 * r);
    P.cap('billboardSteel', [0, y, -s.W / 2 + r], [0, y, s.W / 2 - r], r, { draw: false, name: 'panel', kind: 'wall' });
  }
  /* The catwalk's front rail and its deck edge. */
  P.cap('billboardSteel', [0.95, s.lift + 0.85, -s.W / 2], [0.95, s.lift + 0.85, s.W / 2], 0.03, { name: 'catwalkRail' });
  P.cap('billboardSteel', [0.95, s.lift - 0.12, -s.W / 2], [0.95, s.lift - 0.12, s.W / 2], 0.05, { name: 'catwalkEdge' });
  return P.list;
}

export function billboardDraw(el, parts, K) {
  const s = billboardSpec(el);
  const rng = seededRandom(seedOf(el));
  /* The panel: a steel box, the advert on its face, ribs on its back. */
  K.box('billboardSteel', -0.2, s.lift, -s.W / 2, 0.16, s.lift + s.H, s.W / 2);
  K.sign('mangaAd', 0.17, s.lift + s.H / 2, 0, s.W - 0.2, s.H - 0.2, '+x', rng.int(0, 999));
  for (let z = -s.W / 2 + 0.4; z < s.W / 2; z += 1.2) {
    K.box('billboardSteelDark', -0.32, s.lift, z - 0.05, -0.2, s.lift + s.H, z + 0.05);
  }
  /* The catwalk: grating, posts, and three lamps leaning over the face. */
  K.box('grating', 0.18, s.lift - 0.16, -s.W / 2, 1.0, s.lift - 0.1, s.W / 2);
  for (let z = -s.W / 2; z <= s.W / 2 + 1e-6; z += s.W / 4) {
    K.cyl('billboardSteel', [0.95, s.lift - 0.12, z], [0.95, s.lift + 0.85, z], 0.025, 4);
  }
  for (const z of [-s.W / 3, 0, s.W / 3]) {
    K.cyl('billboardSteel', [0.2, s.lift + s.H + 0.02, z], [0.9, s.lift + s.H + 0.55, z], 0.03, 4);
    K.box('lampHead', 0.8, s.lift + s.H + 0.45, z - 0.2, 1.1, s.lift + s.H + 0.62, z + 0.2);
  }
  K.box('concrete', -0.85, 0, -s.W * 0.3 - 0.5, 0.15, 0.35, -s.W * 0.3 + 0.5);
  K.box('concrete', -0.85, 0, s.W * 0.3 - 0.5, 0.15, 0.35, s.W * 0.3 + 0.5);
}

/* ------------------------------------------------------------------ *
 * THE UTILITY POLE. The town's concrete pole with its crossarm and a
 * transformer: wires run from it to its nearest neighbour, drawn by the
 * map. The wires are not solid; the pole, the arm and the can are.
 * ------------------------------------------------------------------ */

export function poleLayout(el) {
  const h = clamp(el.dims.height, 5, 16);
  const P = new Parts();
  P.cap('poleConcrete', [0, 0, 0], [0, h, 0], 0.16, { rTop: 0.12, name: 'pole' });
  P.cap('metalDark', [0, h - 0.5, -0.95], [0, h - 0.5, 0.95], 0.05, { name: 'arm' });
  P.cap('metalDark', [0, h - 1.6, -0.75], [0, h - 1.6, 0.75], 0.045, { name: 'arm' });
  P.cap('transformer', [0.5, h - 3.6, 0], [0.5, h - 2.7, 0], 0.32, { look: 'capsule', name: 'transformer', kind: 'obstacle' });
  return P.list;
}

export function poleDraw(el, parts, K) {
  const h = clamp(el.dims.height, 5, 16);
  /* Insulators on the arms, the transformer's bracket, step bolts, and the
   * yellow and black sleeve at the foot. */
  for (const z of [-0.8, 0, 0.8]) {
    K.cyl('insulatorWhite', [0, h - 0.45, z], [0, h - 0.25, z], 0.05, 6);
  }
  for (const z of [-0.6, 0.6]) {
    K.cyl('insulatorWhite', [0, h - 1.55, z], [0, h - 1.38, z], 0.045, 6);
  }
  K.box('metalDark', 0.08, h - 3.3, -0.06, 0.25, h - 3.0, 0.06);
  for (let y = 2.4; y < h - 1.8; y += 0.45) {
    const s = y % 0.9 < 0.45 ? 1 : -1;
    K.cyl('metalDark', [0, y, 0], [0, y, s * 0.3], 0.012, 4);
  }
  K.cyl('hazard', [0, 0.3, 0], [0, 2.0, 0], 0.175, 10);
  K.sign('polePlate', 0.17, 2.6, 0, 0.16, 0.7, '+x', 0);
}

/* The street lamp: a pole and an arm out over +x with a lamp head. */
export function lampLayout(el) {
  const h = clamp(el.dims.height, 3, 12);
  const P = new Parts();
  P.cap('lampPost', [0, 0, 0], [0, h, 0], 0.09, { rTop: 0.06, name: 'lampPost' });
  P.cap('lampPost', [0, h, 0], [1.5, h + 0.25, 0], 0.05, { name: 'lampArm' });
  return P.list;
}

export function lampDraw(el, parts, K) {
  const h = clamp(el.dims.height, 3, 12);
  K.box('lampHead', 1.2, h + 0.08, -0.22, 1.85, h + 0.3, 0.22);
  K.box('lampGlow', 1.25, h + 0.05, -0.18, 1.8, h + 0.08, 0.18);
  K.cyl('metalDark', [0, 0, 0], [0, 0.5, 0], 0.14, 8);
}

/* ------------------------------------------------------------------ *
 * THE VENDING MACHINE, the town's, facing +x. 1.12 m wide, 1.95 tall and
 * 0.72 deep, from src/maps/city/vendored/world/vending.js.
 * ------------------------------------------------------------------ */

const VEND = { W: 1.12, H: 1.95, D: 0.72 };

export function vendingLayout(el) {
  const P = new Parts();
  const n = clamp(Math.round(el.dims.count), 1, 4);
  for (let i = 0; i < n; i += 1) {
    const z = (i - (n - 1) / 2) * (VEND.W + 0.08);
    P.box('vendWhite', -VEND.D / 2, 0, z - VEND.W / 2, VEND.D / 2, VEND.H, z + VEND.W / 2, { draw: false, name: 'vending' });
  }
  return P.list;
}

export function vendingDraw(el, parts, K) {
  const rng = seededRandom(seedOf(el));
  const n = clamp(Math.round(el.dims.count), 1, 4);
  for (let i = 0; i < n; i += 1) {
    const z = (i - (n - 1) / 2) * (VEND.W + 0.08);
    /* The town's machine faces +z; a quarter turn puts its face on +x. */
    K.town('vending', { variant: rng.int(0, 2), seed: rng.int(1, 99) }, [0, 0, z], Math.PI / 2);
  }
}

/* ------------------------------------------------------------------ *
 * THE PARKED CAR, the town's, nose along +x. Dimensions from SPEC in the
 * vendored vehicles.js, repeated here because that module draws with
 * Three.js and this one must not.
 * ------------------------------------------------------------------ */

export const CAR_KINDS = {
  kei: { L: 3.40, W: 1.475, H: 1.70 },
  keivan: { L: 3.40, W: 1.475, H: 1.88 },
  hatch: { L: 4.05, W: 1.695, H: 1.52 },
  sedan: { L: 4.42, W: 1.695, H: 1.44 },
  wagon: { L: 4.25, W: 1.690, H: 1.54 },
  minivan: { L: 4.34, W: 1.695, H: 1.80 },
  van: { L: 4.44, W: 1.695, H: 1.98 },
  boxtruck: { L: 4.80, W: 1.755, H: 2.46 },
  minibus: { L: 6.30, W: 2.08, H: 2.60 },
};
const CAR_COLOURS = ['white', 'white', 'pearl', 'silver', 'silver', 'cream', 'gunmetal', 'charcoal', 'skyblue', 'slate', 'mint', 'forest', 'wine', 'tea', 'mustard', 'navy'];

export function carLayout(el) {
  const k = CAR_KINDS[el.style] ?? CAR_KINDS.kei;
  const P = new Parts();
  P.box('carBody', -k.L / 2, 0, -k.W / 2, k.L / 2, k.H, k.W / 2, { draw: false, name: 'car' });
  return P.list;
}

export function carDraw(el, parts, K) {
  const rng = seededRandom(seedOf(el));
  K.town('car', { kind: CAR_KINDS[el.style] ? el.style : 'kei', colour: rng.pick(CAR_COLOURS) }, [0, 0, 0], 0);
}

/* ------------------------------------------------------------------ *
 * TREES, drawn the way the town draws them: a trunk, limbs, and a canopy of
 * small faceted blobs in three tones, lightest on top. Every blob is also a
 * solid sphere a little inside it, so a pilot who clips the canopy is where
 * the picture says they are.
 * ------------------------------------------------------------------ */

/* The whole tree, as numbers, computed once and read by both the layout and
 * the draw so the blobs they place are the same blobs. */
function treeSpec(el) {
  const style = TREE_STYLES.includes(el.style) ? el.style : 'sakura';
  const S = clamp(el.dims.size, 0.5, 3);
  const rng = seededRandom(seedOf(el));
  const out = { style, S, trunk: null, limbs: [], blobs: [] };
  const sc = { s: 0, c: 1 };
  if (style === 'pine') {
    const H = 9 * S;
    out.trunk = { a: [0, 0, 0], b: [0, H * 0.95, 0], r: 0.22 * S };
    /* Tiers of cone, stacked; the solid is a sphere per tier. */
    const tiers = 5;
    for (let i = 0; i < tiers; i += 1) {
      const t = i / tiers;
      const y = H * (0.3 + 0.62 * t);
      const r = (2.4 - 1.8 * t) * S;
      out.blobs.push({ c: [0, y, 0], r, tone: i % 3, cone: true, h: r * 1.3 });
    }
    return out;
  }
  const trunkH = (style === 'street' ? 3.2 : 2.5) * S * rng.range(0.92, 1.1);
  const lean = rng.range(-0.08, 0.08);
  sincos(rng.range(0, Math.PI * 2), sc);
  const top = [lean * trunkH * sc.c, trunkH, lean * trunkH * sc.s];
  out.trunk = { a: [0, 0, 0], b: top, r: 0.2 * S };
  const limbs = style === 'street' ? 4 : 3 + rng.int(0, 1);
  const centres = [];
  for (let i = 0; i < limbs; i += 1) {
    const a = (i / limbs) * Math.PI * 2 + rng.range(-0.4, 0.4);
    const len = (style === 'street' ? 1.6 : 1.9) * S * rng.range(0.82, 1.2);
    const tilt = style === 'street' ? rng.range(0.25, 0.5) : rng.range(0.5, 0.85);
    const st = { s: 0, c: 1 };
    sincos(tilt, st);
    sincos(a, sc);
    const end = [top[0] + sc.c * st.s * len, top[1] + st.c * len, top[2] + sc.s * st.s * len];
    out.limbs.push({ a: top, b: end, r: 0.09 * S });
    centres.push(end);
  }
  const count = (style === 'street' ? 14 : 18) + rng.int(0, 5);
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const c of centres) {
    yMin = Math.min(yMin, c[1]);
    yMax = Math.max(yMax, c[1]);
  }
  for (let i = 0; i < count; i += 1) {
    const c = centres[rng.int(0, centres.length - 1)];
    const r = (style === 'street' ? 0.7 : 0.56) * S * rng.range(0.7, 1.3);
    const p = [c[0] + rng.range(-1.15, 1.15) * S, c[1] + rng.range(-0.5, 0.95) * S, c[2] + rng.range(-1.15, 1.15) * S];
    const hi = (p[1] - yMin) / Math.max(0.5, yMax + 1.2 * S - yMin);
    let tone = hi > 0.62 ? 0 : hi < 0.28 ? 2 : 1;
    if (rng.chance(0.22)) {
      tone = (tone + 1) % 3;
    }
    out.blobs.push({ c: p, r, tone, spin: [rng.range(0, 3), rng.range(0, 3), rng.range(0, 3)] });
  }
  for (let i = 0; i < 3; i += 1) {
    const r = 0.6 * S * rng.range(0.8, 1.15);
    out.blobs.push({
      c: [top[0] + rng.range(-0.7, 0.7) * S, top[1] + (1.25 + rng.range(0, 0.5)) * S, top[2] + rng.range(-0.7, 0.7) * S],
      r,
      tone: 0,
      spin: [rng.range(0, 3), rng.range(0, 3), rng.range(0, 3)],
    });
  }
  return out;
}

export function treeLayout(el) {
  const t = treeSpec(el);
  const P = new Parts();
  P.cap('trunk', t.trunk.a, t.trunk.b, t.trunk.r, { rTop: t.trunk.r * 0.7, name: 'trunk', kind: 'tree' });
  for (const l of t.limbs) {
    P.cap('trunk', l.a, l.b, l.r, { rTop: l.r * 0.6, name: 'limb', kind: 'tree', seg: 5 });
  }
  /* The canopy's solids: a sphere inside every blob. An icosahedron of
   * radius r holds a sphere of 0.79 r, so 0.8 r leaves the facets proud of
   * the solid by a hair, which is the right side to be wrong on for leaves. */
  for (const b of t.blobs) {
    const r = b.cone ? b.r * 0.7 : b.r * 0.8;
    P.cap('leaf', b.c, b.c, r, { draw: false, name: 'canopy', kind: 'canopy' });
  }
  return P.list;
}

export function treeDraw(el, parts, K) {
  const t = treeSpec(el);
  const tones = t.style === 'sakura'
    ? ['blossom0', 'blossom1', 'blossom2']
    : t.style === 'pine' ? ['pine0', 'pine1', 'pine2'] : ['leaf0', 'leaf1', 'leaf2'];
  for (const b of t.blobs) {
    if (b.cone) {
      K.cone(tones[b.tone], [b.c[0], b.c[1] - b.h * 0.35, b.c[2]], b.r, b.h, 9);
    } else {
      K.blob(tones[b.tone], b.c, b.r, b.r * 0.8, b.spin);
    }
  }
  /* A root flare. */
  K.cyl('trunk', [0, 0, 0], [0, 0.35 * t.S, 0], t.trunk.r * 1.5, 7, t.trunk.r);
  /* Fallen petals under a cherry. */
  if (t.style === 'sakura') {
    K.patch('petals', 0, 0.02, 0, 2.4 * t.S, 7);
  }
}

/* Where a tree's canopy reaches, for the plan view: the blobs' extent. */
export function treeReach(el) {
  const t = treeSpec(el);
  let r = 0.5;
  for (const b of t.blobs) {
    r = Math.max(r, Math.hypot(b.c[0], b.c[2]) + b.r);
  }
  return r;
}

/* Re-exported so the plan view can draw a round footprint without taking a
 * sine of its own. */
export { around };
