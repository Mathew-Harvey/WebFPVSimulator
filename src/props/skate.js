/*
 * skate.js: a rail, a ledge, a stair set and a quarter pipe.
 *
 * WHY A SKATE SET IN A DRONE GAME. The owner asked for a trick counter
 * "like the skate games", and the skate games are built out of exactly these
 * four things for a reason: each one is a line with an obvious beginning
 * and end, at a height a rider can read. For a quad they are a skim (along
 * the rail, the ledge's lip, the pipe's coping), a gap (over the stairs) and
 * a transfer (up the pipe and over the deck). The counter in Stage C scores
 * flying close to them; this file only has to make them solid where they
 * are drawn.
 *
 * The rail turns freely; the other three are boxes and keep to the compass.
 * A quarter pipe's curve is solid as a staircase of boxes UNDER the drawn
 * surface, never above it, so a craft skimming the curve meets the picture
 * first and the solid a few centimetres later, which is the side of wrong a
 * pilot forgives.
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

import { Parts, seededRandom, seedOf } from './parts.js';
import { sincos } from './trig.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/* The rail: a round bar on posts, along x. */
export function railLayout(el) {
  const L = clamp(el.dims.length, 1.5, 30);
  const h = clamp(el.dims.height, 0.3, 3);
  const P = new Parts();
  const posts = Math.max(2, Math.round(L / 2.5) + 1);
  for (let i = 0; i < posts; i += 1) {
    const x = -L / 2 + 0.2 + (i / (posts - 1)) * (L - 0.4);
    P.post('railSteel', x, 0, 0, h, 0.035, { name: 'railPost' });
  }
  P.cap('railSteel', [-L / 2, h, 0], [L / 2, h, 0], 0.03, { name: 'rail', seg: 8 });
  return P.list;
}

export function railDraw(el, parts, K) {
  const L = clamp(el.dims.length, 1.5, 30);
  const rng = seededRandom(seedOf(el));
  /* Worn paint: yellow chips along the bar. */
  const h = clamp(el.dims.height, 0.3, 3);
  for (let x = -L / 2 + 0.3; x < L / 2 - 0.3; x += rng.range(0.4, 1.2)) {
    K.cyl('yellow', [x, h, 0], [x + rng.range(0.1, 0.3), h, 0], 0.032, 8);
  }
  for (const p of parts) {
    if (p.name === 'railPost') {
      K.box('metalDark', p.a[0] - 0.12, 0, -0.12, p.a[0] + 0.12, 0.02, 0.12);
    }
  }
}

/* The ledge: a concrete block with a steel angle on its front top edge. */
export function ledgeLayout(el) {
  const L = clamp(el.dims.length, 1, 30);
  const h = clamp(el.dims.height, 0.2, 2);
  const d = clamp(el.dims.depth, 0.3, 4);
  const P = new Parts();
  P.box('ledge', -L / 2, 0, -d / 2, L / 2, h, d / 2, { name: 'ledge' });
  return P.list;
}

export function ledgeDraw(el, parts, K) {
  const L = clamp(el.dims.length, 1, 30);
  const h = clamp(el.dims.height, 0.2, 2);
  const d = clamp(el.dims.depth, 0.3, 4);
  K.box('coping', -L / 2, h - 0.06, d / 2, L / 2, h + 0.005, d / 2 + 0.02);
  K.box('coping', -L / 2, h, d / 2 - 0.06, L / 2, h + 0.005, d / 2 + 0.02);
  /* Wax marks: dark streaks along the edge. */
  K.box('wax', -L / 2 + 0.3, h + 0.006, d / 2 - 0.25, L / 2 - 0.3, h + 0.008, d / 2 - 0.08);
}

/*
 * The stair set: steps rising toward -x from the bottom step at +x, a
 * landing at the top, and a handrail down each side. Solid step by step, so
 * the stairs are stairs to the plant and not a ramp.
 */
function stairSpec(el) {
  const n = clamp(Math.round(el.dims.steps), 2, 24);
  const W = clamp(el.dims.width, 1.2, 12);
  const landing = clamp(el.dims.landing, 0.8, 12);
  const rise = 0.17;
  const run = 0.32;
  const runL = n * run;
  const total = runL + landing;
  return { n, W, landing, rise, run, runL, total, top: n * rise };
}

export function stairsLayout(el) {
  const s = stairSpec(el);
  const P = new Parts();
  const xFront = s.total / 2;
  for (let i = 0; i < s.n; i += 1) {
    const xa = xFront - (i + 1) * s.run;
    const xb = xFront - i * s.run;
    P.box('stairConcrete', xa, 0, -s.W / 2, xb, (i + 1) * s.rise, s.W / 2, { name: 'step' });
  }
  P.box('stairConcrete', -s.total / 2, 0, -s.W / 2, xFront - s.runL, s.top, s.W / 2, { name: 'landing' });
  /* The handrails, down the slope and along the landing. Solid and round:
   * the rail a pilot follows down the set. */
  for (const z of [-s.W / 2 + 0.12, s.W / 2 - 0.12]) {
    const h = 0.9;
    P.cap('railSteel', [xFront - 0.1, s.rise + h, z], [xFront - s.runL, s.top + h, z], 0.03, { name: 'handrail' });
    P.cap('railSteel', [xFront - s.runL, s.top + h, z], [-s.total / 2 + 0.1, s.top + h, z], 0.03, { name: 'handrail' });
    P.post('railSteel', xFront - 0.1, z, s.rise, s.rise + h, 0.025, { name: 'handrailPost' });
    P.post('railSteel', xFront - s.runL, z, s.top, s.top + h, 0.025, { name: 'handrailPost' });
    P.post('railSteel', -s.total / 2 + 0.1, z, s.top, s.top + h, 0.025, { name: 'handrailPost' });
  }
  return P.list;
}

export function stairsDraw(el, parts, K) {
  const s = stairSpec(el);
  const xFront = s.total / 2;
  /* A nosing on every step: the dark line that makes a stair read. */
  for (let i = 0; i < s.n; i += 1) {
    const xb = xFront - i * s.run;
    K.box('nosing', xb - 0.05, (i + 1) * s.rise - 0.03, -s.W / 2, xb + 0.005, (i + 1) * s.rise + 0.004, s.W / 2);
  }
}

/*
 * The quarter pipe: a transition of radius equal to its height, rising
 * toward -x, a deck behind the top, and a steel coping along the lip.
 */
function pipeSpec(el) {
  const H = clamp(el.dims.height, 0.8, 5);
  const W = clamp(el.dims.width, 2, 20);
  const deck = clamp(el.dims.deck, 0.6, 6);
  const R = H;
  const total = R + deck;
  /* The wall of the transition is at xw; the toe, where the curve meets the
   * ground, is at xw + R. */
  const xw = total / 2 - R;
  return { H, W, deck, R, total, xw };
}

/* Height of the transition's surface above the ground at x, for x in
 * [xw, xw + R]: the circle of radius R centred at (xw + R, R). */
function pipeY(s, x) {
  const u = clamp((s.xw + s.R - x) / s.R, 0, 1);
  /* 1 - sqrt(1 - u^2), times R. Math.sqrt is the one function here, and it
   * only decides where a box under the curve stops. */
  return s.R * (1 - Math.sqrt(Math.max(0, 1 - u * u)));
}

export function pipeLayout(el) {
  const s = pipeSpec(el);
  const P = new Parts();
  /* The deck, landable, and the frame under it. */
  P.box('rampDeck', -s.total / 2, 0, -s.W / 2, s.xw, s.H, s.W / 2, { name: 'deck' });
  /* The transition, as a staircase of boxes each topped at the LOWER end of
   * its slice of the curve, so the solid is always under the drawn surface. */
  const slices = 14;
  for (let i = 0; i < slices; i += 1) {
    const xa = s.xw + (i / slices) * s.R;
    const xb = s.xw + ((i + 1) / slices) * s.R;
    const top = pipeY(s, xb);
    if (top < 0.02) {
      continue;
    }
    P.box('rampFace', xa, 0, -s.W / 2, xb, top, s.W / 2, { draw: false, name: 'transition' });
  }
  P.cap('coping', [s.xw + 0.03, s.H, -s.W / 2], [s.xw + 0.03, s.H, s.W / 2], 0.035, { name: 'coping', seg: 8 });
  return P.list;
}

export function pipeDraw(el, parts, K) {
  const s = pipeSpec(el);
  /* The curved face, as a profile extruded across the width: the toe, the
   * arc, the lip, down the back of the deck frame and home. */
  const prof = [];
  const n = 18;
  prof.push([s.xw + s.R, 0]);
  const sc = { s: 0, c: 1 };
  for (let i = 1; i <= n; i += 1) {
    const a = (i / n) * (Math.PI / 2);
    sincos(a, sc);
    prof.push([s.xw + s.R - s.R * sc.s, s.R - s.R * sc.c]);
  }
  prof.push([s.xw, s.H]);
  prof.push([s.xw, 0]);
  K.extrude('rampFace', prof, -s.W / 2, s.W / 2);
  /* Plywood seams across the face, and the deck's edge. */
  for (let i = 1; i < 6; i += 1) {
    const a = (i / 6) * (Math.PI / 2);
    sincos(a, sc);
    const x = s.xw + s.R - s.R * sc.s;
    const y = s.R - s.R * sc.c;
    K.box('rampSeam', x - 0.015, y - 0.005, -s.W / 2, x + 0.015, y + 0.01, s.W / 2);
  }
  K.box('rampSide', -s.total / 2 - 0.01, 0, -s.W / 2 - 0.02, s.xw, s.H - 0.02, -s.W / 2);
  K.box('rampSide', -s.total / 2 - 0.01, 0, s.W / 2, s.xw, s.H - 0.02, s.W / 2 + 0.02);
  K.box('coping', -s.total / 2, s.H - 0.04, -s.W / 2, -s.total / 2 + 0.06, s.H + 0.01, s.W / 2);
}
