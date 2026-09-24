/*
 * industrial.js: the tall things. A tower crane, a water tower, a lattice
 * mast, a chimney, a power pylon, a stack of containers and a scaffold.
 *
 * WHY MOST OF THESE TURN FREELY. A lattice is made of members, and a member
 * is a capsule, and a capsule has no heading for the physics to care about.
 * So the crane, the water tower, the mast, the chimney and the pylon are
 * built out of nothing but capsules and face any way the author points them.
 * The containers and the scaffold have flat decks you land on, and a deck is
 * a box, so they keep to the four compass headings until the physics learns
 * turned boxes (FREESTYLE-MAPS-PLAN.md, P1).
 *
 * THE LATTICE IS SOLID, every member of it, and that is deliberate. Threading
 * a crane's mast is a trick exactly because the braces are real: the
 * triangle between two diagonals and a chord of a 1.8 m mast is about a
 * metre across at its widest, which a five inch fits through and a careless
 * one does not.
 *
 * WHAT IS NOT SOLID: wires and cables thinner than a few centimetres (except
 * the crane's hoist ropes, which a pilot has to respect), signs on a
 * member, lamps. A crane's counterweight and cab are drawn as blocks and
 * made solid as capsules that sit inside them, a few tenths of a metre shy of
 * the drawn corners, because a block cannot turn and a capsule can. That
 * shortfall is written down here rather than hidden.
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

import { Parts, seededRandom, seedOf, around, lerp3 } from './parts.js';
import { CONTAINER_STYLES } from './types.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/* ------------------------------------------------------------------ *
 * THE TOWER CRANE. A hammerhead: square lattice mast, slewing unit, cab,
 * a triangular jib forward and a flat counter jib behind with its concrete
 * blocks, an A frame over the top with tie bars down to both, and a hook on
 * a trolley. The jib points along +x.
 * ------------------------------------------------------------------ */

const MAST_HALF = 0.9;
const MAST_PANEL = 2.4;

function craneSpec(el) {
  const d = el.dims;
  const H = clamp(d.height, 10, 80);
  const L = clamp(d.jib, 12, 70);
  const Lc = clamp(d.counterJib, 6, 24);
  const hook = clamp(d.hook, 2, H - 2);
  const at = clamp(Number(d.trolley) || 0.6, 0.15, 0.95);
  const yj = H + 1.2;
  return { H, L, Lc, hook, at, yj, tx: 2 + at * (L - 4) };
}

/* A square lattice between two heights, with its four chords, braces on
 * all four faces and a rung at every panel. Returns the four chord tops. */
function squareLattice(P, m, half, y0, y1, panel, chordR, braceR) {
  const panels = Math.max(1, Math.round((y1 - y0) / panel));
  const corners = [[-half, -half], [half, -half], [half, half], [-half, half]];
  for (const [x, z] of corners) {
    P.post(m, x, z, y0, y1, chordR, { name: 'chord' });
  }
  for (let i = 0; i < 4; i += 1) {
    const [ax, az] = corners[i];
    const [bx, bz] = corners[(i + 1) % 4];
    const a0 = [ax, y0, az];
    const a1 = [ax, y1, az];
    const b0 = [bx, y0, bz];
    const b1 = [bx, y1, bz];
    P.zigzag(m, a0, a1, b0, b1, panels, braceR, { name: 'brace' });
    P.rungs(m, a0, a1, b0, b1, panels, braceR, { name: 'rung' });
  }
}

export function craneLayout(el) {
  const s = craneSpec(el);
  const { H, L, Lc, yj } = s;
  const P = new Parts();
  const Y = 'craneYellow';

  /* The mast, from its anchor frame to the slewing ring. */
  squareLattice(P, Y, MAST_HALF, 0.35, H, MAST_PANEL, 0.09, 0.045);

  /* The slewing unit: a drum, solid as a sphere inside it. */
  P.cap('craneYellowDeep', [0, H + 0.6, 0], [0, H + 0.6, 0], 1.05, { draw: false, name: 'slew', kind: 'wall' });

  /* The cab, on the right of the jib's root. Drawn as a box in craneDraw;
   * solid as a capsule along its length that stops 0.3 m shy of the drawn
   * corners. */
  P.cap('white', [0.7, H + 1.3, MAST_HALF + 0.95], [1.9, H + 1.3, MAST_HALF + 0.95], 0.85, { draw: false, name: 'cab', kind: 'wall' });

  /*
   * The jib: a triangle, two bottom chords and a top chord, braced on all
   * three faces. It tapers over its last panel so the tip closes.
   */
  const jb = 0.75;
  const jt = 1.9;
  const panels = Math.max(3, Math.round((L - 1) / 2.2));
  const bl0 = [1.0, yj, -jb];
  const bl1 = [L, yj, -jb];
  const br0 = [1.0, yj, jb];
  const br1 = [L, yj, jb];
  const tp0 = [1.0, yj + jt, 0];
  const tp1 = [L - 1.2, yj + jt, 0];
  P.cap(Y, bl0, bl1, 0.07, { name: 'jibChord' });
  P.cap(Y, br0, br1, 0.07, { name: 'jibChord' });
  P.cap(Y, tp0, tp1, 0.07, { name: 'jibChord' });
  /* The nose, closing the triangle. */
  P.cap(Y, tp1, [L, yj, 0], 0.06, { name: 'jibNose' });
  P.cap(Y, bl1, br1, 0.05, { name: 'jibNose' });
  P.zigzag(Y, bl0, [L - 1.2, yj, -jb], tp0, tp1, panels - 1, 0.035, { name: 'jibBrace' });
  P.zigzag(Y, br0, [L - 1.2, yj, jb], tp0, tp1, panels - 1, 0.035, { name: 'jibBrace' });
  P.zigzag(Y, bl0, bl1, br0, br1, panels, 0.03, { name: 'jibBrace' });
  P.rungs(Y, bl0, bl1, br0, br1, panels, 0.03, { name: 'jibRung' });

  /* The counter jib: flat, two chords, cross members and a railing. */
  const cz = 0.9;
  const c0 = -1.0;
  const cl0 = [c0, yj, -cz];
  const cl1 = [-Lc, yj, -cz];
  const cr0 = [c0, yj, cz];
  const cr1 = [-Lc, yj, cz];
  P.cap(Y, cl0, cl1, 0.08, { name: 'counterChord' });
  P.cap(Y, cr0, cr1, 0.08, { name: 'counterChord' });
  const cpanels = Math.max(2, Math.round((Lc - 1) / 2.2));
  P.rungs(Y, cl0, cl1, cr0, cr1, cpanels, 0.04, { name: 'counterRung' });
  P.cap(Y, cl1, cr1, 0.06, { name: 'counterRung' });
  /* Railing along both sides, solid: it is the thing a pilot skims. */
  P.cap('white', [c0, yj + 1.05, -cz - 0.05], [-Lc, yj + 1.05, -cz - 0.05], 0.025, { name: 'rail' });
  P.cap('white', [c0, yj + 1.05, cz + 0.05], [-Lc, yj + 1.05, cz + 0.05], 0.025, { name: 'rail' });

  /* The counterweight blocks, near the end of the counter jib. Drawn as
   * concrete blocks; solid as two fat capsules inside them. */
  P.cap('concrete', [-Lc + 0.95, yj - 0.25, -0.65], [-Lc + 0.95, yj - 0.25, 0.65], 0.85, { draw: false, name: 'weight', kind: 'wall' });
  P.cap('concrete', [-Lc + 2.25, yj - 0.25, -0.65], [-Lc + 2.25, yj - 0.25, 0.65], 0.85, { draw: false, name: 'weight', kind: 'wall' });

  /* The A frame over the slewing unit, and the tie bars down to both jibs. */
  const apex = [0, yj + 6.2, 0];
  for (const [x, z] of [[-0.8, -0.8], [0.8, -0.8], [0.8, 0.8], [-0.8, 0.8]]) {
    P.cap(Y, [x, yj, z], apex, 0.07, { name: 'apex' });
  }
  P.cap('metalDark', apex, [L * 0.62, yj + jt, 0], 0.035, { name: 'tie' });
  P.cap('metalDark', apex, [L * 0.3, yj + jt, 0], 0.03, { name: 'tie' });
  P.cap('metalDark', apex, [-Lc + 0.3, yj + 0.1, -cz], 0.035, { name: 'tie' });
  P.cap('metalDark', apex, [-Lc + 0.3, yj + 0.1, cz], 0.035, { name: 'tie' });

  /* The hook: two ropes from the trolley to the block, and the block. The
   * ropes are thin and SOLID. A crane's rope is the thing every pilot who
   * has flown near one remembers. */
  const hy = yj - s.hook;
  P.cap('rope', [s.tx, yj - 0.35, -0.16], [s.tx, hy + 0.5, -0.16], 0.014, { name: 'rope' });
  P.cap('rope', [s.tx, yj - 0.35, 0.16], [s.tx, hy + 0.5, 0.16], 0.014, { name: 'rope' });
  P.cap('hook', [s.tx, hy + 0.25, 0], [s.tx, hy + 0.25, 0], 0.36, { draw: false, name: 'hookBlock', kind: 'obstacle' });
  return P.list;
}

export function craneDraw(el, parts, K) {
  const s = craneSpec(el);
  const { H, L, Lc, yj } = s;
  /* The foundation and the anchor frame at the foot of the mast. */
  K.box('concrete', -2.6, 0, -2.6, 2.6, 0.3, 2.6);
  K.box('craneYellowDeep', -1.2, 0.3, -1.2, 1.2, 0.42, 1.2);
  /* The slewing drum and the platform round it. */
  K.cyl('craneYellowDeep', [0, H, 0], [0, H + 1.2, 0], 1.05, 16);
  K.box('metalDark', -1.4, H + 1.1, -1.3, 1.4, H + 1.22, 1.3);
  /* The cab: white box, dark glass on three sides, a roof lip. */
  const cx0 = 0.4;
  const cx1 = 2.2;
  const cz0 = MAST_HALF + 0.2;
  const cz1 = MAST_HALF + 1.7;
  K.box('white', cx0, H + 0.4, cz0, cx1, H + 2.3, cz1);
  K.box('glassDark', cx1, H + 1.1, cz0 + 0.15, cx1 + 0.04, H + 2.1, cz1 - 0.15);
  K.box('glassDark', cx0 + 0.2, H + 1.1, cz1, cx1 - 0.1, H + 2.1, cz1 + 0.04);
  K.box('craneYellowDeep', cx0 - 0.05, H + 2.3, cz0 - 0.05, cx1 + 0.1, H + 2.42, cz1 + 0.05);
  /* Counterweight blocks: four slabs, the joints drawn. */
  for (let k = 0; k < 4; k += 1) {
    const x0 = -Lc + 0.15 + k * 0.72;
    K.box('concrete', x0, yj - 1.1, -0.95, x0 + 0.68, yj + 0.62, 0.95);
  }
  K.box('hazard', -Lc + 0.1, yj + 0.62, -0.97, -Lc + 3.05, yj + 0.78, 0.97);
  /* Walkway grating on the counter jib, and a winch drum. */
  K.box('grating', -Lc + 3.2, yj + 0.08, -0.85, -1.0, yj + 0.12, 0.85);
  K.cyl('metalDark', [-4.0, yj + 0.6, -0.6], [-4.0, yj + 0.6, 0.6], 0.45, 12);
  K.box('craneYellowDeep', -5.0, yj + 0.12, -0.8, -3.0, yj + 0.3, 0.8);
  /* The builder's banner on the counter jib railing, both sides. */
  K.sign('craneBanner', -Lc / 2 - 0.5, yj + 0.7, -0.98, Math.min(Lc - 3.5, 6), 0.7, '-z', 0);
  K.sign('craneBanner', -Lc / 2 - 0.5, yj + 0.7, 0.98, Math.min(Lc - 3.5, 6), 0.7, '+z', 0);
  /* The trolley and the hook block, yellow and black. */
  K.box('metalDark', s.tx - 0.6, yj - 0.35, -0.6, s.tx + 0.6, yj - 0.05, 0.6);
  const hy = yj - s.hook;
  K.box('hazard', s.tx - 0.3, hy - 0.05, -0.28, s.tx + 0.3, hy + 0.55, 0.28);
  K.cyl('metalDark', [s.tx, hy - 0.05, 0], [s.tx, hy - 0.35, 0], 0.07, 6);
  K.torus('metalDark', [s.tx, hy - 0.55, 0], 0.2, 0.05);
  /* Lamps: red at the jib tip, the counter jib end and the apex. */
  K.ball('lampRed', [L - 0.2, yj + 0.2, 0], 0.13);
  K.ball('lampRed', [-Lc, yj + 0.9, 0], 0.13);
  K.ball('lampRed', [0, yj + 6.4, 0], 0.13);
}

/* ------------------------------------------------------------------ *
 * THE WATER TOWER. Four splayed legs, braced, and a capsule tank with a
 * walkway round its waist: the tank IS its solid, drawn as the same
 * capsule, so the one big surface a pilot can clip is exact.
 * ------------------------------------------------------------------ */

function waterSpec(el) {
  const d = el.dims;
  const h = clamp(d.height, 6, 40);
  const r = clamp(d.radius, 1.5, 7);
  const len = clamp(d.tank, 0, 10);
  return { h, r, len, foot: r * 1.05 + 1.2, top: r * 0.72 };
}

export function waterLayout(el) {
  const s = waterSpec(el);
  const P = new Parts();
  const legs = [];
  for (let i = 0; i < 4; i += 1) {
    const a = Math.PI / 4 + i * (Math.PI / 2);
    const [fx, fz] = around(s.foot, a);
    const [tx, tz] = around(s.top, a);
    legs.push({ b: [fx, 0, fz], t: [tx, s.h + 0.4, tz] });
    P.cap('towerSteel', [fx, 0, fz], [tx, s.h + 0.4, tz], 0.2, { name: 'leg', kind: 'wall' });
  }
  /* Two rings of struts and an X brace in every panel between them. */
  const rings = [0, 0.36, 0.7];
  for (let k = 1; k < rings.length; k += 1) {
    for (let i = 0; i < 4; i += 1) {
      const A = lerp3(legs[i].b, legs[i].t, rings[k]);
      const B = lerp3(legs[(i + 1) % 4].b, legs[(i + 1) % 4].t, rings[k]);
      P.cap('towerSteel', A, B, 0.08, { name: 'strut' });
    }
  }
  for (let k = 0; k < rings.length - 1; k += 1) {
    for (let i = 0; i < 4; i += 1) {
      const a0 = lerp3(legs[i].b, legs[i].t, rings[k]);
      const a1 = lerp3(legs[i].b, legs[i].t, rings[k + 1]);
      const b0 = lerp3(legs[(i + 1) % 4].b, legs[(i + 1) % 4].t, rings[k]);
      const b1 = lerp3(legs[(i + 1) % 4].b, legs[(i + 1) % 4].t, rings[k + 1]);
      P.cap('rod', a0, b1, 0.03, { name: 'rod' });
      P.cap('rod', b0, a1, 0.03, { name: 'rod' });
    }
  }
  /* The tank, a capsule: drawn and solid the same shape. */
  const y0 = s.h + s.r;
  P.cap('tankPaint', [0, y0, 0], [0, y0 + s.len, 0], s.r, { look: 'capsule', seg: 20, name: 'tank', kind: 'wall' });
  /* The walkway round the tank's waist: a deck edge and a railing, as
   * rings of capsules, both solid. */
  const wr = s.r + 0.9;
  const wy = y0;
  const n = 14;
  for (let i = 0; i < n; i += 1) {
    const [ax, az] = around(wr, (i / n) * Math.PI * 2);
    const [bx, bz] = around(wr, ((i + 1) / n) * Math.PI * 2);
    P.cap('towerSteel', [ax, wy, az], [bx, wy, bz], 0.07, { name: 'walk' });
    P.cap('towerSteel', [ax, wy + 1.0, az], [bx, wy + 1.0, bz], 0.03, { name: 'walkRail' });
  }
  return P.list;
}

export function waterDraw(el, parts, K) {
  const s = waterSpec(el);
  const y0 = s.h + s.r;
  /* Feet. */
  for (let i = 0; i < 4; i += 1) {
    const [fx, fz] = around(s.foot, Math.PI / 4 + i * (Math.PI / 2));
    K.box('concrete', fx - 0.5, 0, fz - 0.5, fx + 0.5, 0.35, fz + 0.5);
  }
  /* The walkway deck, a ring of grating, and its posts. */
  K.ring('grating', [0, y0 - 0.02, 0], s.r - 0.05, s.r + 0.95, 0.06);
  for (let i = 0; i < 14; i += 1) {
    const [x, z] = around(s.r + 0.9, (i / 14) * Math.PI * 2);
    K.cyl('towerSteel', [x, y0, z], [x, y0 + 1.0, z], 0.025, 4);
  }
  /* The painted band with the town's name on it. */
  K.wrap('tankBand', [0, y0 + s.len * 0.5, 0], s.r + 0.02, Math.min(2.4, s.len + s.r * 0.8));
  /* The finial on the top. */
  K.cyl('towerSteel', [0, y0 + s.len + s.r - 0.1, 0], [0, y0 + s.len + s.r + 1.1, 0], 0.05, 5);
  K.ball('lampRed', [0, y0 + s.len + s.r + 1.15, 0], 0.12);
  /* A ladder up one leg. */
  const [fx, fz] = around(s.foot + 0.35, Math.PI / 4);
  const [tx, tz] = around(s.top + 0.35, Math.PI / 4);
  K.ladder('rod', [fx, 0.4, fz], [tx, s.h + 0.4, tz], 0.45);
}

/* ------------------------------------------------------------------ *
 * THE LATTICE MAST. A triangular radio mast, painted in the red and white
 * bands an aviation authority asks for, with sector antennas at the top and
 * a dish part way up. Every band of every leg is its own solid, so the
 * paint and the physics are the same pieces.
 * ------------------------------------------------------------------ */

function mastSpec(el) {
  const d = el.dims;
  const H = clamp(d.height, 8, 90);
  const w = clamp(d.width, 1.0, 4);
  return { H, w, R: w / Math.sqrt(3), bands: 7 };
}

export function mastLayout(el) {
  const s = mastSpec(el);
  const P = new Parts();
  const legs = [];
  for (let i = 0; i < 3; i += 1) {
    const [x, z] = around(s.R, (i / 3) * Math.PI * 2);
    legs.push([x, z]);
  }
  const bandH = s.H / s.bands;
  for (let b = 0; b < s.bands; b += 1) {
    const m = b % 2 === 0 ? 'mastRed' : 'mastWhite';
    const y0 = b * bandH;
    const y1 = (b + 1) * bandH;
    const panels = Math.max(1, Math.round(bandH / (s.w * 1.1)));
    for (let i = 0; i < 3; i += 1) {
      const [ax, az] = legs[i];
      const [bx, bz] = legs[(i + 1) % 3];
      P.cap(m, [ax, y0, az], [ax, y1, az], 0.07, { name: 'leg' });
      P.zigzag(m, [ax, y0, az], [ax, y1, az], [bx, y0, bz], [bx, y1, bz], panels, 0.03, { name: 'brace' });
      P.rungs(m, [ax, y0, az], [ax, y1, az], [bx, y0, bz], [bx, y1, bz], panels + 1, 0.025, { name: 'rung' });
    }
  }
  /* The top platform's railing, solid. */
  const pr = s.R + 0.8;
  for (let i = 0; i < 9; i += 1) {
    const [ax, az] = around(pr, (i / 9) * Math.PI * 2);
    const [bx, bz] = around(pr, ((i + 1) / 9) * Math.PI * 2);
    P.cap('mastWhite', [ax, s.H - 1.2, az], [bx, s.H - 1.2, bz], 0.04, { name: 'platform' });
  }
  /* Sector antennas round the top, and the dish two thirds up. */
  for (let i = 0; i < 3; i += 1) {
    const [x, z] = around(pr + 0.15, (i / 3) * Math.PI * 2 + Math.PI / 3);
    P.cap('white', [x, s.H - 1.0, z], [x, s.H + 1.2, z], 0.16, { name: 'antenna' });
  }
  const [dx, dz] = around(s.R + 0.7, Math.PI);
  P.cap('white', [dx, s.H * 0.64, dz], [dx, s.H * 0.64, dz], 0.55, { draw: false, name: 'dish', kind: 'obstacle' });
  P.post('mastWhite', 0, 0, s.H, s.H + 3.0, 0.05, { name: 'lightningRod' });
  return P.list;
}

export function mastDraw(el, parts, K) {
  const s = mastSpec(el);
  K.box('concrete', -s.R - 0.8, 0, -s.R - 0.8, s.R + 0.8, 0.3, s.R + 0.8);
  K.ring('grating', [0, s.H - 1.25, 0], 0.1, s.R + 0.85, 0.05);
  const [dx, dz] = around(s.R + 0.7, Math.PI);
  K.dish('white', [dx, s.H * 0.64, dz], 0.6, [-1, 0.05, 0]);
  K.ball('lampRed', [0, s.H + 3.05, 0], 0.14);
  K.ball('lampRed', [0, s.H * 0.5, s.R + 0.1], 0.1);
}

/* ------------------------------------------------------------------ *
 * THE CHIMNEY. A brick stack, tapering, with steel bands, a ladder and the
 * red and white warning rings a tall stack wears. Solid as three stacked
 * capsules that follow the taper; the top capsule stops its own radius
 * below the rim so the dome is inside the drawn stack.
 * ------------------------------------------------------------------ */

function chimneySpec(el) {
  const d = el.dims;
  const H = clamp(d.height, 6, 80);
  const r0 = clamp(d.radius, 0.5, 5);
  return { H, r0, r1: r0 * 0.7 };
}

function chimneyR(s, y) {
  return s.r0 + (s.r1 - s.r0) * (y / s.H);
}

export function chimneyLayout(el) {
  const s = chimneySpec(el);
  const P = new Parts();
  /* Drawn: one tapered cylinder. Solid: three capsules under it. */
  P.cap('brick', [0, 0, 0], [0, s.H, 0], s.r0, { rTop: s.r1, solid: false, seg: 18, name: 'stackDraw' });
  const cuts = [0, 0.34, 0.68, 1];
  for (let i = 0; i < 3; i += 1) {
    const ya = cuts[i] * s.H;
    const yb = cuts[i + 1] * s.H;
    const r = Math.min(chimneyR(s, ya), chimneyR(s, yb)) * 0.98;
    const top = i === 2 ? s.H - r : yb;
    P.cap('brick', [0, ya, 0], [0, Math.max(ya, top), 0], r, { draw: false, name: 'stack', kind: 'wall' });
  }
  return P.list;
}

export function chimneyDraw(el, parts, K) {
  const s = chimneySpec(el);
  /* Steel bands every few metres, the red and white rings at the top, and a
   * sooty lip. */
  for (let y = 3; y < s.H - 2; y += 3.2) {
    K.cyl('metalDark', [0, y, 0], [0, y + 0.18, 0], chimneyR(s, y) + 0.04, 16);
  }
  const top = s.H;
  for (let k = 0; k < 3; k += 1) {
    const y = top - 3.6 + k * 1.2;
    K.cyl(k % 2 === 0 ? 'mastRed' : 'mastWhite', [0, y, 0], [0, y + 1.2, 0], chimneyR(s, y + 0.6) + 0.02, 16);
  }
  K.cyl('soot', [0, top - 0.4, 0], [0, top + 0.05, 0], s.r1 + 0.05, 16);
  K.ladder('rod', [s.r0 + 0.3, 1.2, 0], [s.r1 + 0.3, top - 0.6, 0], 0.4);
  K.box('concrete', -s.r0 - 0.6, 0, -s.r0 - 0.6, s.r0 + 0.6, 0.4, s.r0 + 0.6);
}

/* ------------------------------------------------------------------ *
 * THE POWER PYLON. A tapering four legged lattice with three cross arms
 * and insulator strings. The wires between pylons are drawn by the map,
 * which knows where the neighbours are; they are not solid.
 * ------------------------------------------------------------------ */

function pylonSpec(el) {
  const d = el.dims;
  const H = clamp(d.height, 12, 60);
  return { H, b0: H * 0.11, b1: 0.9, arms: [0.62, 0.76, 0.9] };
}

export function pylonLayout(el) {
  const s = pylonSpec(el);
  const P = new Parts();
  const m = 'pylon';
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const at = (c, y) => {
    const t = y / s.H;
    const h = s.b0 + (s.b1 - s.b0) * t;
    return [c[0] * h, y, c[1] * h];
  };
  const top = s.H * 0.92;
  for (const c of corners) {
    P.cap(m, at(c, 0), at(c, top), 0.1, { name: 'leg' });
  }
  const panels = Math.max(3, Math.round(top / 3.2));
  for (let i = 0; i < 4; i += 1) {
    const a0 = at(corners[i], 0);
    const a1 = at(corners[i], top);
    const b0 = at(corners[(i + 1) % 4], 0);
    const b1 = at(corners[(i + 1) % 4], top);
    P.zigzag(m, a0, a1, b0, b1, panels, 0.045, { name: 'brace' });
    P.rungs(m, a0, a1, b0, b1, panels, 0.04, { name: 'rung' });
  }
  /* The peak, carrying the earth wire. */
  const peak = [0, s.H, 0];
  for (const c of corners) {
    P.cap(m, at(c, top), peak, 0.06, { name: 'peak' });
  }
  /* The cross arms, out along x both ways, each a triangle of members with
   * a string of insulators hanging from its tip. */
  s.arms.forEach((f, k) => {
    const y = s.H * f;
    const reach = k === 1 ? 5.2 : 4.2;
    const h = at([1, 1], y)[0];
    for (const side of [-1, 1]) {
      const tip = [side * reach, y, 0];
      P.cap(m, [side * h, y, -h], tip, 0.06, { name: 'arm' });
      P.cap(m, [side * h, y, h], tip, 0.06, { name: 'arm' });
      P.cap(m, [side * h, y + 1.4, 0], tip, 0.05, { name: 'arm' });
      P.cap('insulator', [side * (reach - 0.1), y - 0.05, 0], [side * (reach - 0.1), y - 1.9, 0], 0.09, { name: 'insulator' });
    }
  });
  return P.list;
}

export function pylonDraw(el, parts, K) {
  const s = pylonSpec(el);
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    K.box('concrete', x * s.b0 - 0.5, 0, z * s.b0 - 0.5, x * s.b0 + 0.5, 0.4, z * s.b0 + 0.5);
  }
  /* The discs on each insulator string. */
  for (const p of parts) {
    if (p.name !== 'insulator') {
      continue;
    }
    for (let k = 0; k < 7; k += 1) {
      const y = p.a[1] - 0.2 - k * 0.24;
      K.cyl('insulator', [p.a[0], y, 0], [p.a[0], y + 0.06, 0], 0.17, 10);
    }
  }
  K.sign('dangerPlate', 0, 3.2, s.b0 * 0.72 + 0.03, 0.6, 0.45, '+z', 0);
}

/* ------------------------------------------------------------------ *
 * CONTAINERS. A stack of one to four shipping containers, each a little
 * off square on the one below, in whatever colours the seed deals. The
 * open style is empty with both ends open: a tunnel 2.3 m wide and tall,
 * which is the classic container line.
 * ------------------------------------------------------------------ */

const CONTAINER_W = 2.438;
const CONTAINER_H = 2.591;
const CONTAINER_COLOURS = ['containerRed', 'containerBlue', 'containerGreen', 'containerOrange', 'containerTeal', 'containerGrey', 'containerWhite'];

function containerSpec(el) {
  const style = CONTAINER_STYLES.includes(el.style) ? el.style : '40ft';
  const L = style === '20ft' ? 6.058 : 12.192;
  const open = style === '40ft open';
  const stack = clamp(Math.round(el.dims.stack), 1, 5);
  const rng = seededRandom(seedOf(el));
  const boxes = [];
  for (let i = 0; i < stack; i += 1) {
    /* The bottom one sits true; the ones above are set down by a crane and
     * are never quite square. */
    const ox = i === 0 ? 0 : rng.range(-0.35, 0.35);
    const oz = i === 0 ? 0 : rng.range(-0.12, 0.12);
    const colour = rng.pick(CONTAINER_COLOURS);
    boxes.push({
      x0: -L / 2 + ox,
      x1: L / 2 + ox,
      z0: -CONTAINER_W / 2 + oz,
      z1: CONTAINER_W / 2 + oz,
      y0: i * CONTAINER_H,
      y1: (i + 1) * CONTAINER_H,
      colour,
      logo: rng.int(0, 5),
      /* Only the bottom one of an open stack is open: an open box with a
       * closed one on it is the tunnel, and a stack of open boxes would be
       * a stack of tunnels nobody asked for. */
      open: open && i === 0,
    });
  }
  return { L, boxes };
}

export function containerLayout(el) {
  const s = containerSpec(el);
  const P = new Parts();
  for (const b of s.boxes) {
    if (!b.open) {
      P.box(b.colour, b.x0, b.y0, b.z0, b.x1, b.y1, b.z1, { name: 'container' });
      continue;
    }
    const t = 0.06;
    P.box(b.colour, b.x0, b.y0, b.z0, b.x1, b.y0 + 0.16, b.z1, { name: 'containerFloor' });
    P.box(b.colour, b.x0, b.y1 - 0.1, b.z0, b.x1, b.y1, b.z1, { name: 'containerRoof' });
    P.box(b.colour, b.x0, b.y0 + 0.16, b.z0, b.x1, b.y1 - 0.1, b.z0 + t, { name: 'containerSide' });
    P.box(b.colour, b.x0, b.y0 + 0.16, b.z1 - t, b.x1, b.y1 - 0.1, b.z1, { name: 'containerSide' });
  }
  return P.list;
}

export function containerDraw(el, parts, K) {
  const s = containerSpec(el);
  for (const b of s.boxes) {
    const rib = `${b.colour}Rib`;
    /* Corrugation on both long sides: the ribs are what makes a box a
     * container at forty metres. */
    const n = Math.floor((b.x1 - b.x0 - 0.3) / 0.3);
    for (let i = 0; i <= n; i += 1) {
      const x = b.x0 + 0.15 + (i / Math.max(1, n)) * (b.x1 - b.x0 - 0.3);
      K.box(rib, x - 0.05, b.y0 + 0.18, b.z0 - 0.03, x + 0.05, b.y1 - 0.12, b.z0);
      K.box(rib, x - 0.05, b.y0 + 0.18, b.z1, x + 0.05, b.y1 - 0.12, b.z1 + 0.03);
    }
    /* Top and bottom rails and the corner posts, darker. */
    K.box(rib, b.x0 - 0.01, b.y0, b.z0 - 0.04, b.x1 + 0.01, b.y0 + 0.18, b.z0);
    K.box(rib, b.x0 - 0.01, b.y0, b.z1, b.x1 + 0.01, b.y0 + 0.18, b.z1 + 0.04);
    K.box(rib, b.x0 - 0.01, b.y1 - 0.12, b.z0 - 0.04, b.x1 + 0.01, b.y1, b.z0);
    K.box(rib, b.x0 - 0.01, b.y1 - 0.12, b.z1, b.x1 + 0.01, b.y1, b.z1 + 0.04);
    for (const x of [b.x0, b.x1]) {
      for (const z of [b.z0, b.z1]) {
        K.box('cornerCasting', x - 0.1, b.y0, z - 0.1, x + 0.1, b.y1, z + 0.1);
      }
    }
    /* The line's name on both sides. */
    const w = Math.min(b.x1 - b.x0 - 1.2, 7.5);
    K.sign('containerLogo', (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2 + 0.1, b.z1 + 0.035, w, 1.2, '+z', b.logo);
    K.sign('containerLogo', (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2 + 0.1, b.z0 - 0.035, w, 1.2, '-z', b.logo);
    /* The doors at +x: two leaves, four locking bars. */
    if (!b.open) {
      K.box(rib, b.x1, b.y0 + 0.18, b.z0 + 0.1, b.x1 + 0.03, b.y1 - 0.12, b.z1 - 0.1);
      for (let k = 0; k < 4; k += 1) {
        const z = b.z0 + 0.35 + k * ((b.z1 - b.z0 - 0.7) / 3);
        K.cyl('metalDark', [b.x1 + 0.08, b.y0 + 0.2, z], [b.x1 + 0.08, b.y1 - 0.15, z], 0.025, 5);
      }
    } else {
      /* An open box shows its dark inside. */
      K.box('containerInside', b.x0 + 0.05, b.y0 + 0.16, b.z0 + 0.06, b.x1 - 0.05, b.y0 + 0.17, b.z1 - 0.06);
    }
  }
}

/* ------------------------------------------------------------------ *
 * THE SCAFFOLD. Tube and fitting, board at every lift, braced on the
 * outer face, and in the netted style a debris net on the outside. The
 * boards are two metres apart and the scaffold is 1.3 m deep, so between
 * any two lifts there is a tunnel the length of the scaffold.
 * ------------------------------------------------------------------ */

function scaffoldSpec(el) {
  const d = el.dims;
  const W = clamp(d.width, 2.5, 40);
  const H = clamp(d.height, 2, 40);
  const Dp = clamp(d.depth, 1.0, 2.5);
  const bays = Math.max(1, Math.round(W / 2.5));
  const lifts = Math.max(1, Math.round(H / 2.0));
  return { W, H, D: Dp, bays, lifts, bay: W / bays, lift: H / lifts, netted: el.style === 'netted' };
}

export function scaffoldLayout(el) {
  const s = scaffoldSpec(el);
  const P = new Parts();
  const r = 0.03;
  const zf = -s.D / 2;
  const zb = s.D / 2;
  /* Standards. */
  for (let i = 0; i <= s.bays; i += 1) {
    const x = -s.W / 2 + i * s.bay;
    P.post('scaffold', x, zf, 0, s.H + 1.0, r, { name: 'standard' });
    P.post('scaffold', x, zb, 0, s.H + 1.0, r, { name: 'standard' });
  }
  /* Ledgers, transoms and a board at every lift. */
  for (let j = 1; j <= s.lifts; j += 1) {
    const y = j * s.lift;
    P.cap('scaffold', [-s.W / 2, y, zf], [s.W / 2, y, zf], r, { name: 'ledger' });
    P.cap('scaffold', [-s.W / 2, y, zb], [s.W / 2, y, zb], r, { name: 'ledger' });
    /* The guard rail a metre above each board, on the outside. */
    P.cap('scaffold', [-s.W / 2, y + 1.0, zb], [s.W / 2, y + 1.0, zb], r, { name: 'guard' });
    for (let i = 0; i <= s.bays; i += 1) {
      const x = -s.W / 2 + i * s.bay;
      P.cap('scaffold', [x, y, zf], [x, y, zb], r, { name: 'transom' });
    }
    P.box('plywood', -s.W / 2, y + r, zf + 0.05, s.W / 2, y + r + 0.05, zb - 0.05, { name: 'board' });
  }
  /* Diagonal bracing, face to face, on the outer face. */
  for (let i = 0; i < s.bays; i += 2) {
    const xa = -s.W / 2 + i * s.bay;
    const xb = Math.min(s.W / 2, xa + 2 * s.bay);
    P.cap('scaffold', [xa, 0.15, zb + 0.06], [xb, Math.min(s.H, (xb - xa) * 1.2), zb + 0.06], r, { name: 'brace' });
  }
  if (s.netted) {
    /* The net: soft, solid, and on the outside of the outer standards. */
    P.box('net', -s.W / 2 - 0.05, 0.4, zb + 0.1, s.W / 2 + 0.05, s.H + 0.9, zb + 0.14, { name: 'net', kind: 'canopy', cast: false });
  }
  return P.list;
}

export function scaffoldDraw(el, parts, K) {
  const s = scaffoldSpec(el);
  /* Base plates, toe boards, and a ladder in the first bay. */
  for (let i = 0; i <= s.bays; i += 1) {
    const x = -s.W / 2 + i * s.bay;
    for (const z of [-s.D / 2, s.D / 2]) {
      K.box('metalDark', x - 0.1, 0, z - 0.1, x + 0.1, 0.03, z + 0.1);
    }
  }
  for (let j = 1; j <= s.lifts; j += 1) {
    const y = j * s.lift;
    K.box('toeBoard', -s.W / 2, y + 0.08, s.D / 2 - 0.06, s.W / 2, y + 0.23, s.D / 2 - 0.03);
  }
  K.ladder('scaffold', [-s.W / 2 + 0.6, 0, -s.D / 2 + 0.35], [-s.W / 2 + 0.6, Math.min(s.H, s.lift * s.lifts) + 1.0, -s.D / 2 + 0.35], 0.42);
  /* Couplers at the joints of the outer face: small dark knuckles the ink
   * picks up. */
  for (let i = 0; i <= s.bays; i += 1) {
    for (let j = 1; j <= s.lifts; j += 1) {
      const x = -s.W / 2 + i * s.bay;
      const y = j * s.lift;
      K.box('metalDark', x - 0.05, y - 0.05, s.D / 2 - 0.05, x + 0.05, y + 0.05, s.D / 2 + 0.05);
    }
  }
}
