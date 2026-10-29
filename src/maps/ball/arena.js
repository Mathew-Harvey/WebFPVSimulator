/*
 * arena.js: Quad Ball, the place. Pure: no Three.js, so the solids and the
 * numbers the game plays by load in Node (scripts/ball-selftest.js) as they
 * do in the browser. The owner's ask of 2026-10-29: "rocket league but with
 * quads", pilots pushing a big ball into goals.
 *
 * THE FRAME IS THE WORLD'S. The arena's middle is the world's origin, its
 * long axis is x and it is z across, floor at y = 0, so the game reads
 * these numbers as world metres with no conversion. The built map's plan
 * puts x east and y north from the plot's near left corner, so a plan point
 * is (x + FIELD_W / 2, FIELD_D / 2 - z) and a document yaw of 0 faces +x,
 * which is down the arena toward the east goal.
 *
 * TWO ENDS. The west goal (x < 0) is the pink team's to defend, the east
 * goal (x > 0) the mint team's. A goal is a mouth cut in the end wall and a
 * pocket behind it; the walls are solid for the quad (a crash is the usual
 * crash) and the ball bounces off them in src/game/quadball.js, which reads
 * ARENA for where.
 *
 * NO CEILING for the quad. The ball is held under CEIL by the game. The
 * walls are solid to RAIL (11 m) and a see-through cage of light bars
 * carries on to the ball's ceiling, so the crowd in the stands behind can be
 * seen from inside; a quad that climbs through the cage is simply out of the
 * match, as one that climbed over the old wall was.
 *
 * THE LOOK costs draw calls and nothing per frame. Everything that is not a
 * solid goes into the kit's one glow batch (unlit, vertex coloured: the
 * crowd, the cage, the boards, the nets, the neon), and the stands, the
 * walls and the towers reuse materials the map already had, so the whole
 * arena is three materials more than it was: the mown stripe, the glow batch
 * and nothing else. The crowd is about 3300 people of two boxes each, merged
 * at build, so a frame pays for their triangles and not for any call.
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
import { BALL_DOC_ID } from '../registry.js';

export const BALL_NAME = 'Quad Ball';

/* The plot, metres. */
export const FIELD_W = 150;
export const FIELD_D = 100;

/*
 * The arena in world metres. half length hx, half width hz, the height of
 * the cage over the walls, the goal mouth's half width and height, how deep
 * the pocket is, the ceiling the ball is held under, and the height the
 * walls are solid to.
 */
export const ARENA = Object.freeze({
  hx: 55,
  hz: 26,
  wall: 24,
  rail: 11,
  gw: 9,
  gh: 9.5,
  gd: 8,
  ceil: 22,
  /* Where the pilot's pad is, world x: the pink half, a way in front of
   * their own goal. */
  padX: -26,
});

/* Team colours: pink is the home side (west), mint the away (east). */
export const TEAM_NAMES = ['PINK', 'MINT'];

const T = 0.9;

/*
 * THE STANDS, outside the walls: stepped tiers, solid, each a full height
 * box so nothing is hollow. The side stands run the arena's length and the
 * two end stands sit behind the goal pockets. `base` is the height of the
 * first tier's floor, level with the top of the walls.
 */
export const STANDS = Object.freeze({
  side: { rows: 9, depth: 1.5, rise: 1.25, base: 11 },
  end: { rows: 6, depth: 1.4, rise: 1.2, base: 11 },
});

/* Where the stands end, world metres: the back of an end stand in x. */
export function standBackX() {
  const A = ARENA;
  return A.hx + T + A.gd + T + STANDS.end.rows * STANDS.end.depth;
}

/* A plan point (x east, y north) from a world one. */
export function toPlan(x, z) {
  return [x + FIELD_W / 2, FIELD_D / 2 - z];
}

/* A small integer hash to a number in [0, 1), so the crowd is the same crowd
 * on every machine and on every build. */
function noise(a, b, c = 0) {
  let h = Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b | 0, 0x85ebca6b) ^ Math.imul(c | 0, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

export function ballLayout() {
  const A = ARENA;
  const P = new Parts();
  const wallM = 'wallCream';
  const R = A.rail;
  /* The floor: a pitch laid over the grass, drawn and not solid, on a dark
   * plinth that runs out under the stands. */
  P.box('concreteDark', -FIELD_W / 2 + 1, 0, -FIELD_D / 2 + 1, FIELD_W / 2 - 1, 0.03, FIELD_D / 2 - 1, { solid: false, cast: false, name: 'plinth' });
  P.box('qbPitch', -A.hx - A.gd, 0.03, -A.hz, A.hx + A.gd, 0.05, A.hz, { solid: false, cast: false, name: 'pitch' });
  /* Mown stripes: every other band across the length. */
  const bands = 18;
  const bw = (2 * (A.hx + A.gd)) / bands;
  for (let i = 1; i < bands; i += 2) {
    const x0 = -A.hx - A.gd + i * bw;
    P.box('qbPitchB', x0, 0.05, -A.hz, x0 + bw, 0.06, A.hz, { solid: false, cast: false, name: 'stripe' });
  }
  /* Side walls, pink in the west half and mint in the east. */
  for (const s of [-1, 1]) {
    const z0 = s > 0 ? A.hz : -A.hz - T;
    const z1 = s > 0 ? A.hz + T : -A.hz;
    P.box('qbSakura', -A.hx - T, 0, z0, 0, R, z1, { name: 'side wall' });
    P.box('qbMint', 0, 0, z0, A.hx + T, R, z1, { name: 'side wall' });
    /* A dark skirting along the foot, flush with the face. */
    const f0 = s > 0 ? A.hz - 0.05 : -A.hz - T;
    const f1 = s > 0 ? A.hz + T : -A.hz + 0.05;
    P.box('qbBand', -A.hx - T, 0, f0, A.hx + T, 0.8, f1, { solid: false, cast: false, name: 'skirting' });
    P.box('qbBand', -A.hx - T, R - 0.9, f0, A.hx + T, R, f1, { solid: false, cast: false, name: 'cap' });
  }
  /* End walls, each with its mouth, a lintel over it, and its pocket. */
  for (const s of [-1, 1]) {
    const m = s < 0 ? 'qbSakura' : 'qbMint';
    const glow = s < 0 ? 'qbSakuraGlow' : 'qbMintGlow';
    const x0 = s > 0 ? A.hx : -A.hx - T;
    const x1 = s > 0 ? A.hx + T : -A.hx;
    P.box(m, x0, 0, A.gw, x1, R, A.hz + T, { name: 'end wall' });
    P.box(m, x0, 0, -A.hz - T, x1, R, -A.gw, { name: 'end wall' });
    P.box(m, x0, A.gh, -A.gw, x1, R, A.gw, { name: 'lintel' });
    /* The pocket: two side walls, a roof, a back wall that glows. */
    const px0 = s > 0 ? A.hx + T : -A.hx - T - A.gd;
    const px1 = s > 0 ? A.hx + T + A.gd : -A.hx - T;
    for (const z of [-1, 1]) {
      P.box(wallM, px0, 0, z > 0 ? A.gw : -A.gw - T, px1, A.gh + T, z > 0 ? A.gw + T : -A.gw, { name: 'pocket wall' });
    }
    P.box(wallM, px0, A.gh, -A.gw, px1, A.gh + T, A.gw, { name: 'pocket roof' });
    const bx0 = s > 0 ? A.hx + T + A.gd : -A.hx - T - A.gd - T;
    P.box(glow, bx0, 0, -A.gw, bx0 + T, A.gh, A.gw, { name: 'goal back' });
  }
  /* The stands: each tier a full height box, adjacent, so the staircase has
   * no hollow and no coplanar overlap. */
  const sd = STANDS.side;
  const xs = standBackX();
  for (const s of [-1, 1]) {
    for (let i = 0; i < sd.rows; i += 1) {
      const za = A.hz + T + i * sd.depth;
      const zb = za + sd.depth;
      P.box('concreteDark', -xs, 0, s > 0 ? za : -zb, xs, sd.base + i * sd.rise, s > 0 ? zb : -za, { name: 'stand' });
    }
  }
  const ed = STANDS.end;
  const xe = A.hx + T + A.gd + T;
  for (const s of [-1, 1]) {
    for (let i = 0; i < ed.rows; i += 1) {
      const xa = xe + i * ed.depth;
      const xb = xa + ed.depth;
      P.box('concreteDark', s > 0 ? xa : -xb, 0, -(A.hz + T), s > 0 ? xb : -xa, ed.base + i * ed.rise, A.hz + T, { name: 'stand' });
    }
  }
  /* Floodlight towers beyond the stands' corners: a solid core, and the
   * lattice round it is drawn. */
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      P.post('concreteDark', sx * towerX(), sz * towerZ(), 0, 40, 0.5, { kind: 'pole', name: 'tower' });
    }
  }
  return { parts: P.list };
}

function towerX() {
  return standBackX() - 1.5;
}

function towerZ() {
  return ARENA.hz + T + STANDS.side.rows * STANDS.side.depth + 3.2;
}

const PINK = 0xff6fa5;
const MINT = 0x57e0a8;
const WHITE = 0xfff4e0;
const GOLD = 0xffc94d;
const LILAC = 0xb8a4ff;
const NAVY = 0x2b3358;
const FANS = [0xff7fae, 0xff4f8e, 0x62e3ac, 0x2fc9a0, 0xf6f1e6, 0xffcf5a, 0x3b4577, 0xb7a1ff];
const SKIN = [0xf1c7a4, 0xd9a47c, 0xa8704f, 0x7a4d36, 0xfde0c8];

/* A hex colour times a shade. */
function shade(hex, k) {
  const r = Math.min(255, Math.round(((hex >> 16) & 255) * k));
  const g = Math.min(255, Math.round(((hex >> 8) & 255) * k));
  const b = Math.min(255, Math.round((hex & 255) * k));
  return (r << 16) | (g << 8) | b;
}

/* One person on a tier: a body and a head, or a body with its arms up. */
function person(kit, x, y, z, key, fan, row, rows) {
  const n = noise(key, row, 7);
  const dark = 1 - 0.05 * (rows - 1 - row) * 0.6;
  /* West stands lean pink and east stands lean mint. */
  const lean = noise(key, row, 3) < 0.55;
  const pick = lean ? (fan < 0 ? Math.floor(noise(key, row, 5) * 2) : 2 + Math.floor(noise(key, row, 5) * 2)) : Math.floor(noise(key, row, 11) * FANS.length);
  const body = shade(FANS[pick], dark);
  const h = 0.62 + n * 0.22;
  const dx = (noise(key, row, 13) - 0.5) * 0.25;
  const dz = (noise(key, row, 17) - 0.5) * 0.2;
  kit.glow(body, x + dx - 0.24, y, z + dz - 0.2, x + dx + 0.24, y + h, z + dz + 0.2);
  kit.glow(SKIN[Math.floor(noise(key, row, 19) * SKIN.length)], x + dx - 0.12, y + h, z + dz - 0.11, x + dx + 0.12, y + h + 0.26, z + dz + 0.11);
  if (noise(key, row, 23) < 0.14) {
    /* Arms up. */
    kit.glow(body, x + dx - 0.22, y + h, z + dz - 0.06, x + dx - 0.12, y + h + 0.5, z + dz + 0.06);
    kit.glow(body, x + dx + 0.12, y + h, z + dz - 0.06, x + dx + 0.22, y + h + 0.5, z + dz + 0.06);
  }
}

/* What the pipeline draws beside the parts: pitch lines, the goals' nets,
 * the cage, the boards, the crowd and the towers. */
export function drawArena(kit) {
  const A = ARENA;
  const R = A.rail;
  kit.begin(0, 0, 0, 0, 'extra');
  const y0 = 0.06;
  const y1 = 0.075;
  /* The centre: a ring, a spot, and the ball's own pattern on the grass. */
  kit.box('qbLine', -0.15, y0, -A.hz, 0.15, y1, A.hz);
  kit.ring('qbLine', [0, y1, 0], 8.7, 9.2, 0.015);
  kit.cyl('qbLine', [0, y0, 0], [0, y1 + 0.005, 0], 3.6, 28);
  kit.cyl('qbBand', [0, y1, 0], [0, y1 + 0.012, 0], 1.3, 5);
  for (let i = 0; i < 5; i += 1) {
    const a = (i / 5) * Math.PI * 2 + 0.314;
    kit.cyl('qbBand', [Math.cos(a) * 2.9, y1, Math.sin(a) * 2.9], [Math.cos(a) * 2.9, y1 + 0.012, Math.sin(a) * 2.9], 0.7, 5);
  }
  for (const s of [-1, 1]) {
    const x = s * (A.hx - 0.2);
    const col = s < 0 ? 'qbSakura' : 'qbMint';
    /* The goal area painted in the team's colour, and its lines. */
    kit.box(col, s > 0 ? A.hx - 12 : -A.hx, y0, -A.gw - 5, s > 0 ? A.hx : -A.hx + 12, y0 + 0.012, A.gw + 5);
    kit.box('qbLine', s > 0 ? A.hx - 12 : -A.hx, y0 + 0.012, -A.gw - 5, s > 0 ? A.hx : -A.hx + 12, y1 + 0.012, -A.gw - 4.7);
    kit.box('qbLine', s > 0 ? A.hx - 12 : -A.hx, y0 + 0.012, A.gw + 4.7, s > 0 ? A.hx : -A.hx + 12, y1 + 0.012, A.gw + 5);
    kit.box('qbLine', s > 0 ? A.hx - 12.3 : -A.hx + 12, y0 + 0.012, -A.gw - 5, s > 0 ? A.hx - 12 : -A.hx + 12.3, y1 + 0.012, A.gw + 5);
    /* The goal's frame, picked out in white round the mouth. */
    kit.box('white', x, 0, -A.gw - 0.4, x + s * 0.6, A.gh + 0.2, -A.gw);
    kit.box('white', x, 0, A.gw, x + s * 0.6, A.gh + 0.2, A.gw + 0.4);
    kit.box('white', x, A.gh - 0.3, -A.gw - 0.4, x + s * 0.6, A.gh + 0.2, A.gw + 0.4);
    /* Neon round the mouth, flush with the wall behind the frame. */
    const neon = s < 0 ? PINK : MINT;
    const nx = s * (A.hx - 0.65);
    kit.glow(neon, Math.min(nx, nx + s * 0.06), 0, -A.gw - 1.6, Math.max(nx, nx + s * 0.06), A.gh + 1.2, -A.gw - 0.5);
    kit.glow(neon, Math.min(nx, nx + s * 0.06), 0, A.gw + 0.5, Math.max(nx, nx + s * 0.06), A.gh + 1.2, A.gw + 1.6);
    kit.glow(neon, Math.min(nx, nx + s * 0.06), A.gh + 0.2, -A.gw - 1.6, Math.max(nx, nx + s * 0.06), A.gh + 1.2, A.gw + 1.6);
    /* The net: a lattice of light across the back, the roof and the sides of
     * the pocket, a little brighter than the glow behind it. */
    const bx = s > 0 ? A.hx + T + A.gd : -A.hx - T - A.gd;
    const inx = s > 0 ? -0.07 : 0.07;
    const net = s < 0 ? 0xffe3ee : 0xe0fff2;
    const nb = (a, b) => [Math.min(a, b), Math.max(a, b)];
    for (let z = -A.gw + 0.9; z < A.gw - 0.2; z += 1.8) {
      const [a, b] = nb(bx + inx, bx + inx * 2.4);
      kit.glow(net, a, 0.1, z - 0.05, b, A.gh - 0.1, z + 0.05);
    }
    for (let y = 0.9; y < A.gh - 0.1; y += 1.4) {
      const [a, b] = nb(bx + inx, bx + inx * 2.4);
      kit.glow(net, a, y - 0.05, -A.gw + 0.1, b, y + 0.05, A.gw - 0.1);
    }
    const xa = s > 0 ? A.hx + T : -A.hx - T - A.gd;
    const xb = s > 0 ? A.hx + T + A.gd : -A.hx - T;
    for (let x = xa + 1; x < xb - 0.2; x += 1.6) {
      kit.glow(net, x - 0.05, A.gh - 0.12, -A.gw + 0.1, x + 0.05, A.gh - 0.02, A.gw - 0.1);
    }
    for (let z = -A.gw + 1.8; z < A.gw - 0.2; z += 1.8) {
      kit.glow(net, xa + 0.1, A.gh - 0.12, z - 0.05, xb - 0.1, A.gh - 0.02, z + 0.05);
    }
    for (const sz of [-1, 1]) {
      const zz = sz * (A.gw - 0.05);
      const z0 = Math.min(zz, zz - sz * 0.07);
      const z1 = Math.max(zz, zz - sz * 0.07);
      for (let x = xa + 1; x < xb - 0.2; x += 1.6) {
        kit.glow(net, x - 0.05, 0.1, z0, x + 0.05, A.gh - 0.1, z1);
      }
      for (let y = 1.4; y < A.gh - 0.1; y += 1.6) {
        kit.glow(net, xa + 0.1, y - 0.05, z0, xb - 0.1, y + 0.05, z1);
      }
    }
  }
  /* The boards: a ribbon of lit panels along the foot of every wall, and a
   * neon line under the cage, on the arena's face. */
  const tones = [PINK, WHITE, MINT, GOLD, LILAC, WHITE];
  let k = 0;
  for (const s of [-1, 1]) {
    const zf = s > 0 ? A.hz - 0.1 : -A.hz;
    const za = Math.min(zf, zf + 0.1);
    const zb = Math.max(zf, zf + 0.1);
    for (let x = -A.hx + 0.6; x < A.hx - 5.4; x += 5.8) {
      const c = tones[k % tones.length];
      k += 1;
      kit.glow(shade(c, 0.78), x, 0.95, za, x + 5.4, 2.85, zb);
      kit.glow(c, x + 0.3, 1.45, za + (s > 0 ? 0.01 : -0.01), x + 5.1, 2.35, zb + (s > 0 ? 0.01 : -0.01));
    }
    kit.glow(PINK, -A.hx, R - 1.4, za, 0, R - 1.0, zb);
    kit.glow(MINT, 0, R - 1.4, za, A.hx, R - 1.0, zb);
    kit.glow(WHITE, -A.hx, R - 0.2, za - 0.04, A.hx, R + 0.15, zb + 0.04);
  }
  for (const s of [-1, 1]) {
    const xf = s > 0 ? A.hx - 0.1 : -A.hx;
    const xa = Math.min(xf, xf + 0.1);
    const xb = Math.max(xf, xf + 0.1);
    const c = s < 0 ? PINK : MINT;
    for (const sz of [-1, 1]) {
      const z0 = sz > 0 ? A.gw + 1.8 : -A.hz + 0.4;
      const z1 = sz > 0 ? A.hz - 0.4 : -A.gw - 1.8;
      kit.glow(shade(c, 0.8), xa, 0.95, z0, xb, 2.85, z1);
      kit.glow(c, xa, 1.45, z0 + 0.3, xb, 2.35, z1 - 0.3);
    }
    kit.glow(c, xa, R - 1.4, -A.hz, xb, R - 1.0, A.hz);
    kit.glow(WHITE, xa - 0.04, R - 0.2, -A.hz, xb + 0.04, R + 0.15, A.hz);
  }
  /* The cage: bars of light from the walls up to the ball's ceiling, and
   * rails across them, so the crowd can be seen through it. */
  const topY = A.wall;
  for (const s of [-1, 1]) {
    const z = s > 0 ? A.hz - 0.1 : -A.hz;
    for (let x = -A.hx; x <= A.hx + 0.01; x += 2.75) {
      const c = x < 0 ? PINK : MINT;
      kit.glow(c, x - 0.07, R, z, x + 0.07, topY, z + 0.1);
    }
    kit.glow(PINK, -A.hx, (R + topY) / 2 - 0.06, z, 0, (R + topY) / 2 + 0.06, z + 0.1);
    kit.glow(MINT, 0, (R + topY) / 2 - 0.06, z, A.hx, (R + topY) / 2 + 0.06, z + 0.1);
    kit.glow(PINK, -A.hx, topY - 0.14, z - 0.03, 0, topY + 0.14, z + 0.13);
    kit.glow(MINT, 0, topY - 0.14, z - 0.03, A.hx, topY + 0.14, z + 0.13);
  }
  for (const s of [-1, 1]) {
    const x = s > 0 ? A.hx - 0.1 : -A.hx;
    const c = s < 0 ? PINK : MINT;
    for (let z = -A.hz; z <= A.hz + 0.01; z += 2.6) {
      kit.glow(c, x, R, z - 0.07, x + 0.1, topY, z + 0.07);
    }
    kit.glow(c, x - 0.03, (R + topY) / 2 - 0.06, -A.hz, x + 0.13, (R + topY) / 2 + 0.06, A.hz);
    kit.glow(c, x - 0.03, topY - 0.14, -A.hz, x + 0.13, topY + 0.14, A.hz);
  }
  /* The crowd: every tier of every stand, two boxes a person. */
  const sd = STANDS.side;
  const xs = standBackX();
  for (const s of [-1, 1]) {
    for (let i = 0; i < sd.rows; i += 1) {
      const y = sd.base + i * sd.rise;
      const z = A.hz + T + i * sd.depth + sd.depth * 0.55;
      let n = 0;
      for (let x = -xs + 0.7; x < xs - 0.4; x += 1.05) {
        person(kit, x, y, s * z, n + (s > 0 ? 0 : 5000), x, i, sd.rows);
        n += 1;
      }
    }
  }
  const ed = STANDS.end;
  const xe = A.hx + T + A.gd + T;
  for (const s of [-1, 1]) {
    for (let i = 0; i < ed.rows; i += 1) {
      const y = ed.base + i * ed.rise;
      const x = xe + i * ed.depth + ed.depth * 0.55;
      let n = 0;
      for (let z = -A.hz + 0.2; z < A.hz + 0.6; z += 1.05) {
        person(kit, s * x, y, z, n + (s > 0 ? 9000 : 13000), s * 1, i, ed.rows);
        n += 1;
      }
    }
  }
  /* A bright lip on every tier's riser, pink in the west and mint in the
   * east, so the stands read as stripes of colour from across the pitch. */
  for (const s of [-1, 1]) {
    for (let i = 0; i < sd.rows; i += 1) {
      const y = sd.base + i * sd.rise;
      const zf = A.hz + T + i * sd.depth;
      const za = s > 0 ? zf - 0.05 : -zf;
      const zb = s > 0 ? zf : -zf + 0.05;
      kit.glow(shade(PINK, 0.7), -xs, y - 0.24, za, 0, y, zb);
      kit.glow(shade(MINT, 0.7), 0, y - 0.24, za, xs, y, zb);
    }
  }
  const ed0 = STANDS.end;
  for (const s of [-1, 1]) {
    for (let i = 0; i < ed0.rows; i += 1) {
      const y = ed0.base + i * ed0.rise;
      const xf = xe + i * ed0.depth;
      const xa = s > 0 ? xf - 0.05 : -xf;
      const xb = s > 0 ? xf : -xf + 0.05;
      kit.glow(shade(s < 0 ? PINK : MINT, 0.7), xa, y - 0.24, -(A.hz + T), xb, y, A.hz + T);
    }
  }
  /* The backs of the stands, which a pilot sees flying round the outside:
   * fins of light, and a band of lit panels low down. */
  const zBack = A.hz + T + sd.rows * sd.depth;
  for (const s of [-1, 1]) {
    for (let x = -xs + 3; x < xs - 1; x += 6) {
      kit.glow(x < 0 ? PINK : MINT, x - 0.16, 1.0, s > 0 ? zBack : -zBack - 0.1, x + 0.16, 9, s > 0 ? zBack + 0.1 : -zBack);
    }
    for (let z = -A.hz + 3; z < A.hz; z += 6) {
      kit.glow(s < 0 ? PINK : MINT, s > 0 ? xs : -xs - 0.1, 1.0, z - 0.16, s > 0 ? xs + 0.1 : -xs, 9, z + 0.16);
    }
  }
  /* The big screens over the end stands, facing the pitch, each with the
   * ball lit up in pixels on a field of the team's colour. */
  for (const s of [-1, 1]) {
    const c = s < 0 ? PINK : MINT;
    const xBack = xs - 0.5;
    const xa = s > 0 ? xBack : -xBack - 0.4;
    const xb = s > 0 ? xBack + 0.4 : -xBack;
    const y0s = 19.5;
    const hs = 13;
    const ws = 30;
    /* Two legs from the top tier to the screen. */
    for (const z of [-ws / 2 + 2, ws / 2 - 2]) {
      kit.box('concreteDark', xa, A.rail + 6, z - 0.5, xb, y0s, z + 0.5);
    }
    kit.glow(NAVY, xa - (s > 0 ? 0.1 : -0.1), y0s - 0.6, -ws / 2 - 0.6, xb, y0s + hs + 0.6, ws / 2 + 0.6);
    const fx = s > 0 ? xa - 0.05 : xb + 0.05;
    const fxa = Math.min(fx, fx + (s > 0 ? -0.35 : 0.35));
    const fxb = Math.max(fx, fx + (s > 0 ? -0.35 : 0.35));
    const bands = [shade(c, 0.55), shade(c, 0.75), shade(c, 0.95)];
    for (let b = 0; b < 3; b += 1) {
      kit.glow(bands[b], fxa, y0s + (b * hs) / 3, -ws / 2, fxb, y0s + ((b + 1) * hs) / 3, ws / 2);
    }
    const px = 0.82;
    const half = 6;
    const cy = y0s + hs / 2;
    const fa = Math.min(fx, fx + (s > 0 ? -0.55 : 0.55));
    const fb = Math.max(fx, fx + (s > 0 ? -0.55 : 0.55));
    for (let i = -half; i <= half; i += 1) {
      for (let j = -half; j <= half; j += 1) {
        const d = Math.hypot(i, j);
        if (d > 6.3) {
          continue;
        }
        let col = WHITE;
        if (d > 5.3) {
          col = NAVY;
        } else if (d < 1.9) {
          col = NAVY;
        } else {
          for (let q = 0; q < 5; q += 1) {
            const a = (q / 5) * Math.PI * 2 + 0.314;
            if (Math.hypot(i - Math.cos(a) * 4.1, j - Math.sin(a) * 4.1) < 1.25) {
              col = NAVY;
            }
          }
        }
        kit.glow(col, fa, cy + j * px - px / 2, i * px - px / 2, fb, cy + j * px + px / 2, i * px + px / 2);
      }
    }
  }
  /* The canopy over the back rows of the side stands: a slab on columns,
   * lit underneath, trimmed in the team's colours, and flags along its edge. */
  const roofY = sd.base + (sd.rows - 1) * sd.rise + 5;
  const zr0 = A.hz + T + (sd.rows - 4) * sd.depth - 0.4;
  const zr1 = zBack + 1.6;
  for (const s of [-1, 1]) {
    const za = s > 0 ? zr0 : -zr1;
    const zb = s > 0 ? zr1 : -zr0;
    kit.box('concreteDark', -xs, roofY, za, xs, roofY + 0.6, zb);
    const zf = s > 0 ? zr0 : -zr0;
    const lo = Math.min(zf, zf + (s > 0 ? -0.25 : 0.25));
    const hi = Math.max(zf, zf + (s > 0 ? -0.25 : 0.25));
    kit.glow(PINK, -xs, roofY - 0.1, lo, 0, roofY + 0.7, hi);
    kit.glow(MINT, 0, roofY - 0.1, lo, xs, roofY + 0.7, hi);
    const zl = s * (zr0 + 2.2);
    kit.glow(0xfff0c8, -xs, roofY - 0.04, zl - 0.2, xs, roofY, zl + 0.2);
    for (let x = -xs + 6; x < xs - 3; x += 12) {
      kit.box('concreteDark', x - 0.35, roofY - 5, s * (zBack - 0.8) - 0.35, x + 0.35, roofY, s * (zBack - 0.8) + 0.35);
    }
    for (let x = -xs + 4; x < xs - 2; x += 9) {
      const fz = s * (zr0 + 0.3);
      kit.glow(0xd6d9ee, x - 0.05, roofY + 0.6, fz - 0.05, x + 0.05, roofY + 4.2, fz + 0.05);
      kit.glow(x < 0 ? PINK : MINT, x + 0.05, roofY + 2.8, fz - 0.03, x + 2.3, roofY + 4.1, fz + 0.03);
    }
  }
  /* The plaza round the stands: tiles in two tones. */
  for (const s of [-1, 1]) {
    for (let r = 0; r < 3; r += 1) {
      for (let c = 0; c < 53; c += 1) {
        const x = -74.2 + c * 2.8;
        const z0 = zBack + 0.3 + r * 2.8;
        const tone = (r + c) % 2 ? 0xd6cfe8 : 0xeee6d2;
        kit.glow(tone, x, 0.03, s > 0 ? z0 : -z0 - 2.7, x + 2.7, 0.045, s > 0 ? z0 + 2.7 : -z0);
      }
    }
  }
  /* Trees along the plaza, built of boxes like the screens' pixels. */
  for (const s of [-1, 1]) {
    for (let x = -70; x <= 70; x += 7) {
      const z = s * (zBack + 4.6 + noise(x, s, 2) * 1.2);
      const h = 0.8 + noise(x, s, 4) * 0.5;
      kit.glow(0x6b4a3a, x - 0.25, 0.045, z - 0.25, x + 0.25, 1.7 * h, z + 0.25);
      kit.glow(0x4aa86a, x - 1.8 * h, 1.4 * h, z - 1.8 * h, x + 1.8 * h, 2.9 * h, z + 1.8 * h);
      kit.glow(0x5fbf7f, x - 1.35 * h, 2.9 * h, z - 1.35 * h, x + 1.35 * h, 4.2 * h, z + 1.35 * h);
      kit.glow(0x82dc9c, x - 0.8 * h, 4.2 * h, z - 0.8 * h, x + 0.8 * h, 5.2 * h, z + 0.8 * h);
    }
  }
  /* The city beyond: boxes of haze in pastel, unlit, so the fog takes them. */
  const city = [0xb8c4e8, 0xd7c6ea, 0xf0d8e0, 0xc4e4de, 0xe6e0f0, 0xa9b8e0];
  for (let gx = -330; gx <= 330; gx += 24) {
    for (let gz = -330; gz <= 330; gz += 24) {
      if (Math.abs(gx) < 140 && Math.abs(gz) < 100) {
        continue;
      }
      if (noise(gx, gz, 31) < 0.45) {
        continue;
      }
      const w = 10 + noise(gx, gz, 33) * 12;
      const d = 10 + noise(gx, gz, 35) * 12;
      const far = Math.hypot(gx, gz);
      const h = 18 + noise(gx, gz, 37) ** 2 * 90 + far * 0.05;
      const x = gx + (noise(gx, gz, 39) - 0.5) * 8;
      const z = gz + (noise(gx, gz, 41) - 0.5) * 8;
      const col = city[Math.floor(noise(gx, gz, 43) * city.length)];
      kit.glow(col, x - w / 2, 0, z - d / 2, x + w / 2, h, z + d / 2);
      kit.glow(shade(col, 0.88), x - w / 2 + 1, h, z - d / 2 + 1, x + w / 2 - 1, h + 2.5, z + d / 2 - 1);
      if (noise(gx, gz, 45) < 0.5) {
        kit.glow(0xfff0c8, x - w / 2 - 0.05, h * 0.35, z - d / 2 - 0.05, x + w / 2 + 0.05, h * 0.35 + 1.2, z + d / 2 + 0.05);
        kit.glow(0xfff0c8, x - w / 2 - 0.05, h * 0.65, z - d / 2 - 0.05, x + w / 2 + 0.05, h * 0.65 + 1.2, z + d / 2 + 0.05);
      }
    }
  }
  /* The towers: four tapering legs, braces, and a bank of lamps. */
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const cx = sx * towerX();
      const cz = sz * towerZ();
      for (const [lx, lz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        kit.cyl('concreteDark', [cx + lx * 1.8, 0, cz + lz * 1.8], [cx + lx * 0.7, 38, cz + lz * 0.7], 0.22, 5, 0.12);
      }
      for (const y of [8, 16, 24, 32]) {
        const w = 1.8 - (y / 38) * 1.1;
        kit.box('concreteDark', cx - w, y, cz - w - 0.06, cx + w, y + 0.18, cz - w + 0.06);
        kit.box('concreteDark', cx - w, y, cz + w - 0.06, cx + w, y + 0.18, cz + w + 0.06);
        kit.box('concreteDark', cx - w - 0.06, y, cz - w, cx - w + 0.06, y + 0.18, cz + w);
        kit.box('concreteDark', cx + w - 0.06, y, cz - w, cx + w + 0.06, y + 0.18, cz + w);
      }
      /* The lamp bank faces the pitch. */
      const fx = -sx;
      const fz = -sz;
      kit.box('concreteDark', cx - 3.4, 38, cz - 3.4, cx + 3.4, 38.5, cz + 3.4);
      for (let a = 0; a < 3; a += 1) {
        for (let b = 0; b < 2; b += 1) {
          const ox = (a - 1) * 2.0;
          const oy = 38.7 + b * 1.4;
          kit.box('whLamp', cx + ox - 0.85 + fx * 0.3, oy, cz + fz * 0.4 - 0.85, cx + ox + 0.85 + fx * 0.3, oy + 1.1, cz + fz * 0.4 + 0.85);
        }
      }
    }
  }
}

export function ballDocument() {
  const A = ARENA;
  const [px, py] = toPlan(A.padX, 0);
  const el = {
    id: 'el-1',
    type: 'startPads',
    name: '',
    position: { x: px, y: py, z: 0 },
    yaw: 0,
    pitch: 0,
    yawOverridden: true,
    dims: { pads: 1, spacing: 1.5, padSize: 0.9 },
  };
  return {
    schemaVersion: 3,
    id: BALL_DOC_ID,
    name: BALL_NAME,
    createdUtc: '2026-10-29T00:00:00Z',
    modifiedUtc: '2026-10-29T00:00:00Z',
    trackClass: 'full',
    mode: 'freestyle',
    field: { width: FIELD_W, depth: FIELD_D, gridSize: 1 },
    settings: { tangentScale: 1.1, minCurveRadius: 2.5, samplesPerSegment: 48 },
    scene: { time: 'noon', ground: 'grass' },
    branding: { logos: [] },
    credit: null,
    elements: [el],
    sequence: [],
  };
}
