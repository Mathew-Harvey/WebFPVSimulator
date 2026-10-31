/*
 * stands.js: where Hayate Circuit's crowd watches from, and what crosses
 * the track overhead.
 *
 *   THE MAIN STAND opposite the pits: two covered stands of twelve rows
 *   under one cantilevered roof, with a canyon between the two under that
 *   roof, a tunnel through each stand's base up into the seats, and a slot
 *   between the back wall and the roof all the way along: the grandstand
 *   roof gaps the brief asks for.
 *   THE ICHI STAND at turn one, open, on the outside of the braking zone.
 *   THE KURENAI STAND at the top corner, a small stand under a Japanese
 *   hipped roof.
 *   THE CHICANE STAND, a temporary one on scaffolding, open underneath.
 *   THE BANK down the esses, grass terraces with picnic rugs.
 *   THE FOOTBRIDGE over the straight by the last corner, under a steel
 *   arch, with the circuit's name on it.
 *   THE TYRE BRIDGE over the back straight, with a giant tyre on it, which
 *   circuits the world over have had in one form or another.
 *   THE START GANTRY over the line, its lights in the middle.
 *
 * The crowd is painted (./signs.js, the crowd cells): a quad along each row
 * with a row of fans on it, inked as a manga background crowd is drawn. A
 * stand of seven hundred fans is a few hundred triangles that way, where a
 * body and a head each would be fifty thousand.
 *
 * Sizes from Japanese national circuits' main stands: a row 0.85 to 0.9 m
 * deep and 0.4 to 0.45 m high per seat tread, here stepped two seats a
 * box (1.8 m and 0.9 m) because one box a seat would be a slot too narrow
 * to fly between and too many solids; a roof 20 m up at the back.
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

import { hash, sAt, beside, HALF } from './frame.js';
import { START_X, SOUTH_WALL, PIT_WALL } from './track.js';
import { sincos } from '../../props/trig.js';

const SEATS = ['mxBlue', 'mxBlue', 'white', 'mxBlue', 'mxRed', 'mxBlue'];
const CROWD_KEYS = ['crowd0', 'crowd1', 'crowd2', 'crowd3'];

/* A painted run of fans along a row: quads every `seg` metres, each a
 * random crowd cell, a few left empty, facing (nx, ny). Along x or y. */
function crowdRow(T, along, a0, a1, c, h, nx, ny, k, full = 0.8) {
  const seg = 6;
  for (let a = a0; a + 1 < a1; a += seg) {
    const b = Math.min(a1, a + seg);
    k += 1;
    if (hash(k, 41) > full) {
      continue;
    }
    const key = CROWD_KEYS[Math.floor(hash(k, 43) * CROWD_KEYS.length)];
    const mid = (a + b) / 2;
    if (along === 'x') {
      T.sign(key, mid, c, h + 0.55, nx, ny, b - a, 1.1, 0.02);
    } else {
      T.sign(key, c, mid, h + 0.55, nx, ny, b - a, 1.1, 0.02);
    }
  }
  return k;
}

/*
 * THE MAIN STAND. Rows step up away from the track, two seats a step,
 * each step a solid box from the ground, so the stand is a mass a pilot
 * can land on anywhere. The tunnel through each stand's base is the steps
 * started high over its span; the canyon between the two stands is the
 * absence of steps; the roof gap is the back wall stopping 5 m under the
 * roof.
 */
export const MAIN = {
  x0: 218, x1: 442, gap0: 324, gap1: 336, front: 55.0, rows: 12, depth: 1.8, rise: 0.95, first: 1.6,
  back: 29.0, wall: 15.2, roof0: 20.0, roof1: 20.6, roofFront: 52.5, tunnels: [262, 392], tunnelW: 5, tunnelH: 3.6,
};
function mainStand(T) {
  const M = MAIN;
  const backRow = M.front - M.rows * M.depth;
  let k = 0;
  for (const [x0, x1] of [[M.x0, M.gap0], [M.gap1, M.x1]]) {
    const tunnel = M.tunnels.find((t) => t > x0 && t < x1);
    const t0 = tunnel - M.tunnelW / 2;
    const t1 = tunnel + M.tunnelW / 2;
    for (let r = 0; r < M.rows; r += 1) {
      const y1 = M.front - r * M.depth;
      const y0 = y1 - M.depth;
      const top = M.first + r * M.rise;
      const name = 'main stand row';
      /* Either side of the tunnel, from the ground; over it, from its roof
       * up, and nothing where the row is lower than the tunnel's roof. */
      T.box('concreteMid', x0, y0, 0, t0, y1, top, { name });
      T.box('concreteMid', t1, y0, 0, x1, y1, top, { name });
      if (top > M.tunnelH + 0.6) {
        T.box('concreteMid', t0, y0, M.tunnelH, t1, y1, top, { name: 'tunnel roof' });
      }
      /* The seats: a back in each step's colour block, a white aisle every
       * 16 m. Fine: Low draws the step alone. */
      for (let x = x0; x < x1; x += 16) {
        const xa = x + 1.2;
        const xb = Math.min(x1, x + 16);
        const seat = SEATS[(Math.floor((x - M.x0) / 16) + (r > 6 ? 1 : 0)) % SEATS.length];
        if (xb - xa < 1) {
          continue;
        }
        const sa = xa < t0 && xb > t0 ? [[xa, t0], [t1, xb]] : [[xa, xb]];
        for (const [u0, u1] of sa) {
          if (u1 - u0 < 0.5 || (u0 >= t0 && u1 <= t1)) {
            continue;
          }
          T.deco(seat, u0, y0 + 0.15, top, u1, y0 + 0.5, top + 0.45, true);
          T.deco(seat, u0, y0 + 1.05, top, u1, y0 + 1.4, top + 0.45, true);
        }
        T.deco('white', x, y0, top, x + 1.2, y1, top + 0.02, true);
      }
      /* The fans, sat on the step facing the track. */
      k = crowdRow(T, 'x', x0 + 1, x1 - 1, y0 + 0.9, top, 0, 1, k + r * 13, 0.55 + 0.03 * r);
    }
    /* The front wall, the advertising on it, and the stand's end walls. */
    T.box('concreteMid', x0, M.front, 0, x1, M.front + 0.3, M.first + 1.0, { name: 'stand front' });
    T.box('white', x0 - 0.4, backRow - 0.4, 0, x0, M.front + 0.3, M.first + M.rows * M.rise + 1.0, { name: 'stand end' });
    T.box('white', x1, backRow - 0.4, 0, x1 + 0.4, M.front + 0.3, M.first + M.rows * M.rise + 1.0, { name: 'stand end' });
    const ads = ['adTombo', 'adInazuma', 'adNeko', 'adKumo', 'adOkami', 'adSuzume'];
    let a = 0;
    for (let x = x0 + 4; x + 4 <= x1; x += 9) {
      T.sign(ads[a % ads.length], x + 4, M.front + 0.32, M.first + 0.5, 0, 1, 8.6, 0.95);
      a += 1;
    }
    /* The tunnel's mouth: a lintel in the stand's colour and a sign. */
    T.deco('white', t0 - 0.3, backRow - 0.5, M.tunnelH, t1 + 0.3, backRow + 0.1, M.tunnelH + 0.6);
    T.sign('gateA', tunnel, backRow - 0.52, M.tunnelH + 0.3, 0, -1, 2.4, 0.5);
  }
  /* The back wall, up to 5 m under the roof, open at each tunnel under a
   * lintel and open the full height at the canyon between the stands. */
  const cuts = [...M.tunnels.map((t) => [t - M.tunnelW / 2, t + M.tunnelW / 2, M.tunnelH]), [M.gap0, M.gap1, M.wall]].sort((a, b) => a[0] - b[0]);
  let from = M.x0 - 0.4;
  for (const [c0, c1, ch] of cuts) {
    T.box('white', from, M.back, 0, c0, backRow, M.wall, { name: 'stand back wall' });
    if (ch < M.wall) {
      T.box('white', c0, M.back, ch, c1, backRow, M.wall, { name: 'stand back wall' });
    }
    from = c1;
  }
  T.box('white', from, M.back, 0, M.x1 + 0.4, backRow, M.wall, { name: 'stand back wall' });
  /* Its windows, the concourse's, and the gates at the tunnels' backs. */
  for (let x = M.x0 + 3; x < M.x1 - 3; x += 6) {
    if (M.tunnels.some((t) => Math.abs(t - x - 1.5) < 4)) {
      continue;
    }
    T.deco('glassBlue', x, M.back - 0.03, 4.0, x + 3, M.back, 6.2, true);
  }
  /* The roof, cantilevered from columns behind the back wall, over the
   * seats and the canyon between the stands. */
  for (let x = M.x0; x <= M.x1; x += 16) {
    T.post('white', x, M.back - 1.2, 0, M.roof1, 0.45, { kind: 'wall', name: 'roof column', seg: 10 });
    /* The cantilever: a deep steel girder from the column out over the
     * seats, tapering, on top of the roof. */
    T.op({ t: 'girder', x, y0: M.back - 1.6, y1: M.roofFront, h: M.roof1 });
  }
  T.box('hyRoof', M.x0 - 1, M.back - 2, M.roof0, M.x1 + 1, M.roofFront, M.roof1, { name: 'stand roof' });
  T.deco('white', M.x0 - 1.02, M.roofFront - 0.02, M.roof0 - 0.3, M.x1 + 1.02, M.roofFront + 0.02, M.roof1 + 0.05);
  T.deco('hyRoofUnder', M.x0 - 1, M.back - 2, M.roof0 - 0.06, M.x1 + 1, M.roofFront, M.roof0, true);
  /* The circuit's name along the fascia, both halves. */
  T.sign('hayateLong', 270, M.roofFront + 0.03, M.roof0 + 0.3, 0, 1, 26, 0.9);
  T.sign('mainStand', 389, M.roofFront + 0.03, M.roof0 + 0.3, 0, 1, 18, 0.9);
  /* The lights hung under the roof's front edge. */
  for (let x = M.x0 + 6; x < M.x1; x += 12) {
    T.deco('lampHead', x - 0.4, M.roofFront - 1.4, M.roof0 - 0.4, x + 0.4, M.roofFront - 0.6, M.roof0, true);
  }
  /* The concourse behind: stalls, vending machines and lamps, and the
   * service road with the town's poles and wires along it. */
  for (let x = M.x0 + 8; x < M.x1 - 8; x += 24) {
    T.op({ t: 'stall', x, y: M.back - 7, k: x });
    T.solid(x - 2, M.back - 9, 0, x + 2, M.back - 6, 2.6, 'stall');
  }
  for (let x = M.x0 + 20; x < M.x1 - 10; x += 24) {
    /* None in front of a tunnel's back or the canyon's. */
    if (M.tunnels.some((t) => Math.abs(x - t) < M.tunnelW) || (x > M.gap0 - 2 && x < M.gap1 + 2)) {
      continue;
    }
    T.op({ t: 'vending', x, y: M.back - 3.6, yaw: Math.PI / 2, k: x });
    T.solid(x - 0.6, M.back - 4.2, 0, x + 0.6, M.back - 3.0, 1.9, 'vending machine');
  }
}
export const STAND_GAP = { x: (MAIN.gap0 + MAIN.gap1) / 2, w: MAIN.gap1 - MAIN.gap0 };

/*
 * THE ICHI STAND on the outside of turn one, facing east up the braking
 * zone: open terraces, eight rows, a flag pole at each end. And the
 * KURENAI STAND on the outside of the top corner, under a hipped roof.
 */
export const ICHI = { x0: 10, x1: 46, y0: 78, y1: 136, rows: 8 };
function openStand(T, S, roof) {
  const depth = (S.x1 - S.x0) / S.rows;
  let k = 101;
  for (let r = 0; r < S.rows; r += 1) {
    const xa = S.x1 - (r + 1) * depth;
    const xb = S.x1 - r * depth;
    const top = 1.0 + r * 0.8;
    T.box('concrete', xa, S.y0, 0, xb, S.y1, top, { name: 'open stand row' });
    T.deco(r % 3 === 2 ? 'white' : 'mxRed', xa + 0.2, S.y0 + 0.6, top, xa + 0.5, S.y1 - 0.6, top + 0.42, true);
    k = crowdRow(T, 'y', S.y0 + 1, S.y1 - 1, xa + depth / 2, top, 1, 0, k + r * 7, 0.7);
  }
  T.box('concrete', S.x1, S.y0, 0, S.x1 + 0.3, S.y1, 1.8, { name: 'open stand front' });
  const top = 1.0 + S.rows * 0.8 + 1.2;
  T.box('white', S.x0 - 0.4, S.y0, 0, S.x0, S.y1, top, { name: 'open stand back' });
  for (const y of [S.y0 - 0.3, S.y1 + 0.3]) {
    T.box('white', S.x0, y - 0.2, 0, S.x1, y + 0.2, 2 + S.rows * 0.8, { name: 'open stand end' });
    T.post('flagMast', S.x1 - 0.6, y, 0, 12, 0.07, { kind: 'pole', name: 'flag pole' });
    T.op({ t: 'flag', x: S.x1 - 0.6, y, h: 12, m: y < S.y0 ? 'mxRed' : 'white' });
  }
  T.sign(S.sign, S.x1 + 0.32, (S.y0 + S.y1) / 2, 1.1, 1, 0, 14, 0.9);
  if (roof) {
    /* Posts at the back and the front, the hipped roof over the rows: a
     * Japanese roof, eaves out past the posts, the ridge along the stand. */
    const h0 = top + 3.2;
    for (let y = S.y0 + 1; y <= S.y1 - 1; y += 9) {
      T.post('hyTimber', S.x1 - 0.5, y, 1.8, h0, 0.18, { kind: 'pole', name: 'stand post' });
      T.post('hyTimber', S.x0 + 0.4, y, top, h0, 0.18, { kind: 'pole', name: 'stand post' });
    }
    T.box('hyRoofTile', S.x0 - 1.2, S.y0 - 1.6, h0, S.x1 + 1.6, S.y1 + 1.6, h0 + 0.3, { name: 'stand roof' });
    const xm = (S.x0 + S.x1) / 2;
    const rise = 3.2;
    T.prism('hyRoofTile', [[S.x0 - 1.4, h0 + 0.3], [S.x1 + 1.8, h0 + 0.3], [xm + 4, h0 + rise], [xm - 4, h0 + rise]], 'y', S.y0 - 1.8, S.y1 + 1.8);
    T.solid(S.x0 - 1, S.y0 - 1.5, h0 + 0.3, S.x1 + 1.4, S.y1 + 1.5, h0 + 1.6, 'stand roof');
    T.deco('hyInk', xm - 4.2, S.y0 - 2.0, h0 + rise - 0.1, xm + 4.2, S.y1 + 2.0, h0 + rise + 0.25);
    /* The ridge's end tiles, curled up. */
    for (const y of [S.y0 - 2.1, S.y1 + 2.1]) {
      T.deco('hyInk', xm - 0.5, y - 0.2, h0 + rise, xm + 0.5, y + 0.2, h0 + rise + 0.9);
    }
  }
}
export const KURENAI = { x0: 14, x1: 44, y0: 330, y1: 372, rows: 6 };

/*
 * THE CHICANE STAND, temporary: seats on a scaffold, open beneath, the
 * way a race weekend's extra seating goes up. The standards are 3 m apart
 * both ways, so a pilot can thread the frame under the higher rows.
 */
export const CHICANE = { x0: 598, x1: 614, y0: 150, y1: 228, rows: 8 };
function scaffoldStand(T) {
  const S = CHICANE;
  const depth = (S.x1 - S.x0) / S.rows;
  const deck = (r) => 1.6 + r * 0.7;
  /* The decks: a slab per row, 0.25 thick, the front row on the frame. */
  let k = 201;
  for (let r = 0; r < S.rows; r += 1) {
    const xa = S.x0 + r * depth;
    const xb = xa + depth;
    T.box('plywood', xa, S.y0, deck(r) - 0.25, xb, S.y1, deck(r), { name: 'scaffold deck' });
    /* The riser under the next row up. */
    if (r > 0) {
      T.box('plywood', xa, S.y0, deck(r - 1), xa + 0.1, S.y1, deck(r), { name: 'scaffold riser' });
    }
    T.deco(r % 2 ? 'mxGreen' : 'white', xa + 0.2, S.y0 + 0.4, deck(r), xa + 0.45, S.y1 - 0.4, deck(r) + 0.4, true);
    k = crowdRow(T, 'y', S.y0 + 1, S.y1 - 1, xa + depth / 2, deck(r), -1, 0, k + r * 5, 0.75);
  }
  const topH = deck(S.rows - 1);
  /* The back rail and its wind net, and the standards. */
  T.box('white', S.x1 - 0.1, S.y0, topH, S.x1, S.y1, topH + 1.4, { name: 'scaffold back' });
  for (let x = S.x0 + 0.1; x <= S.x1; x += 3) {
    for (let y = S.y0 + 0.1; y <= S.y1; y += 3) {
      const r = Math.min(S.rows - 1, Math.floor((x - S.x0) / depth));
      T.post('scaffold', x, y, 0, deck(r) - 0.25, 0.05, { kind: 'pole', name: 'standard' });
    }
  }
  /* The ledgers and braces, drawn only: thin. */
  for (let x = S.x0 + 0.1; x <= S.x1; x += 3) {
    T.cyl('scaffold', [x, S.y0, 0.15], [x, S.y1, 0.15], 0.03, 4, true);
    for (let y = S.y0 + 0.1; y + 3 <= S.y1; y += 6) {
      const r = Math.min(S.rows - 1, Math.floor((x - S.x0) / depth));
      T.cyl('scaffold', [x, y, 0.2], [x, y + 3, deck(r) - 0.3], 0.025, 4, true);
    }
  }
  T.sign('chicaneStand', S.x0 - 0.05, (S.y0 + S.y1) / 2, 1.0, -1, 0, 14, 0.9);
  T.box('white', S.x0 - 0.05, S.y0, 0.6, S.x0, S.y1, 1.45, { name: 'stand skirt', solid: false });
}

/* THE BANK down the esses: grass terraces, picnic rugs, a few
 * umbrellas, the crowd sat on the grass. */
export const BANK = { x0: 4, x1: 46, y0: 168, y1: 298 };
function bank(T) {
  const { x0, x1, y0, y1 } = BANK;
  const steps = 4;
  const d = (x1 - x0) / steps;
  let k = 301;
  for (let i = 0; i < steps; i += 1) {
    const xa = x1 - (i + 1) * d;
    const top = 0.6 + i * 0.9;
    T.box(i % 2 ? 'hyGrassBank' : 'hyGrassBank2', xa, y0, 0, xa + d, y1, top, { name: 'bank terrace' });
    k = crowdRow(T, 'y', y0 + 2, y1 - 2, xa + d * 0.55, top - 0.4, 1, 0, k + i * 11, 0.45);
    for (let y = y0 + 6; y < y1 - 4; y += 13) {
      const j = Math.floor(y + i * 7);
      if (hash(j, 7) < 0.5) {
        T.op({ t: 'rug', x: xa + d * 0.3, y, h: top, m: ['mxRed', 'mxBlue', 'craneYellow', 'white'][j % 4], k: j });
      }
      if (hash(j, 9) < 0.18) {
        T.op({ t: 'parasol', x: xa + d * 0.7, y: y + 4, h: top, m: ['white', 'mxOrange', 'mxBlue'][j % 3] });
      }
    }
  }
}

/*
 * THE FOOTBRIDGE over the straight by the last corner: stairs up on the
 * stands' side and the infield's, a glazed deck 8 m over the track, piers
 * on the verge, the pit wall and the paddock's edge, and over it a steel
 * arch on each side carrying the circuit's name.
 */
export const BRIDGE = { x: 480, w: 5, y0: 24, y1: 106, h: 8.0, t: 0.6, arch: 18, piers: [57.2, 79.0, 96.5] };
function footbridge(T) {
  const B = BRIDGE;
  const xa = B.x - B.w / 2;
  const xb = B.x + B.w / 2;
  T.box('hyBridge', xa, B.y0 + 6, B.h, xb, B.y1 - 6, B.h + B.t, { name: 'footbridge deck' });
  T.box('glassBlue', xa, B.y0 + 6, B.h + B.t, xa + 0.12, B.y1 - 6, B.h + B.t + 1.3, { name: 'footbridge glass' });
  T.box('glassBlue', xb - 0.12, B.y0 + 6, B.h + B.t, xb, B.y1 - 6, B.h + B.t + 1.3, { name: 'footbridge glass' });
  T.deco('metal', xa - 0.03, B.y0 + 6, B.h + B.t + 1.25, xa + 0.15, B.y1 - 6, B.h + B.t + 1.35);
  T.deco('metal', xb - 0.15, B.y0 + 6, B.h + B.t + 1.25, xb + 0.03, B.y1 - 6, B.h + B.t + 1.35);
  for (const y of B.piers) {
    T.post('hyBridge', B.x, y, 0, B.h, 0.45, { kind: 'wall', name: 'footbridge pier', seg: 10 });
    T.deco('hyBridge', xa + 0.6, y - 0.5, B.h - 0.8, xb - 0.6, y + 0.5, B.h);
  }
  /* The stair towers at both ends, solid blocks with their flights drawn. */
  for (const [y0, y1] of [[B.y0, B.y0 + 6], [B.y1 - 6, B.y1]]) {
    T.box('hyBridge', xa - 1, y0, 0, xb + 1, y1, B.h + B.t, { name: 'stair tower' });
    T.box('hyRoof', xa - 1.4, y0 - 0.4, B.h + 3.4, xb + 1.4, y1 + 0.4, B.h + 3.8, { name: 'stair roof' });
    for (const [x, y] of [[xa - 1.2, y0 - 0.2], [xb + 1.2, y0 - 0.2], [xa - 1.2, y1 + 0.2], [xb + 1.2, y1 + 0.2]]) {
      T.post('metal', x, y, B.h + B.t, B.h + 3.4, 0.08, { kind: 'pole', name: 'stair roof post' });
    }
    for (let h = 0.4; h < B.h; h += 0.5) {
      T.deco('white', xa - 1.05, y0 + 0.2, h, xa - 0.98, y1 - 0.2, h + 0.06, true);
    }
  }
  /* The two arches, one each side of the deck, and their hangers. The
   * arch is solid: a pilot flying the deck's length under it meets it. */
  const span = (B.y1 - 6) - (B.y0 + 6);
  const mid = (B.y0 + B.y1) / 2;
  const N = 16;
  const at = (i) => {
    const t = i / N;
    const u = 2 * t - 1;
    return [mid + (u * span) / 2, B.h + B.t + (B.arch - B.h - B.t) * (1 - u * u)];
  };
  for (const x of [xa - 0.2, xb + 0.2]) {
    for (let i = 0; i < N; i += 1) {
      const [ya, ha] = at(i);
      const [yb, hb] = at(i + 1);
      T.cap('hyArch', [x, ya, ha], [x, yb, hb], 0.3, { kind: 'pole', name: 'bridge arch', seg: 8 });
    }
    for (let i = 2; i < N - 1; i += 2) {
      const [y, h] = at(i);
      T.cyl('metal', [x, y, B.h + B.t], [x, y, h], 0.04, 4, true);
    }
  }
  /* The ties between the arches at the crown, over the deck. */
  for (const i of [6, 8, 10]) {
    const [y, h] = at(i);
    T.cap('hyArch', [xa - 0.2, y, h], [xb + 0.2, y, h], 0.2, { kind: 'pole', name: 'arch tie' });
  }
  /* The name on a board hung in each arch, facing up and down the track. */
  const [, hc] = at(N / 2);
  T.box('white', xa - 0.2, 66, hc - 4.4, xb + 0.2, 74, hc - 1.4, { name: 'bridge board' });
  T.sign('hayateBridge', xb + 0.22, 70, hc - 2.9, 1, 0, 7.8, 2.9);
  T.sign('hayateBridge', xa - 0.22, 70, hc - 2.9, -1, 0, 7.8, 2.9);
  for (const y of [67, 73]) {
    T.cyl('metal', [B.x, y, hc - 1.4], [B.x, y, hc - 0.3], 0.04, 4, true);
  }
}

/*
 * THE TYRE BRIDGE over the back straight: two pylons, a deck across, and
 * a giant tyre stood on it, its tread to the track, lettered in a made up
 * brand. The tyre is a ring of capsules, solid, and the hole in it is a
 * line.
 */
export const TYRE = { x: 286, y0: 356, y1: 396, h: 9.0, R: 7.2, r: 1.5 };
function tyreBridge(T) {
  const B = TYRE;
  const yc = (B.y0 + B.y1) / 2;
  for (const y of [B.y0, B.y1]) {
    T.box('hyBridge', B.x - 2.2, y - 2.2, 0, B.x + 2.2, y + 2.2, B.h + 1.0, { name: 'tyre bridge pylon' });
    T.deco('hyKerbRed', B.x - 2.22, y - 2.22, B.h - 1.2, B.x + 2.22, y + 2.22, B.h - 0.6);
  }
  T.box('hyBridge', B.x - 2.0, B.y0 + 2.2, B.h, B.x + 2.0, B.y1 - 2.2, B.h + 1.0, { name: 'tyre bridge deck' });
  T.box('white', B.x - 2.05, B.y0 + 2.2, B.h + 0.2, B.x + 2.05, B.y1 - 2.2, B.h + 0.85, { name: 'tyre bridge board', solid: false });
  T.sign('adTomboBig', B.x + 2.07, yc + 9, B.h + 0.52, 1, 0, 14, 0.6);
  T.sign('adTomboBig', B.x - 2.07, yc - 9, B.h + 0.52, -1, 0, 14, 0.6);
  /* The tyre: stood on the deck in the bridge's middle, facing up and
   * down the track, as a ring of capsules round its middle. */
  const hc = B.h + 1.0 + B.R + B.r;
  const N = 20;
  const sc = { s: 0, c: 0 };
  const pts = [];
  for (let i = 0; i <= N; i += 1) {
    sincos((i / N) * 2 * Math.PI, sc);
    pts.push([B.x, yc + sc.c * B.R, hc + sc.s * B.R]);
  }
  for (let i = 0; i < N; i += 1) {
    T.cap('drTyre', pts[i], pts[i + 1], B.r, { kind: 'wall', name: 'giant tyre', draw: false });
  }
  T.op({
    t: 'giantTyre', x: B.x, y: yc, h: hc, R: B.R, r: B.r,
  });
}
export const TYRE_HOLE = { x: TYRE.x, y: (TYRE.y0 + TYRE.y1) / 2, h: TYRE.h + 1.0 + TYRE.R + TYRE.r, r: TYRE.R - TYRE.r };

/* THE START GANTRY over the line: two legs, a box beam across the track
 * and the pit wall, the five lights in the middle facing the grid, and a
 * board with the line's name on it. */
export const GANTRY = { x: START_X - 1.5, y0: SOUTH_WALL.y1 + 0.5, y1: (PIT_WALL.y0 + PIT_WALL.y1) / 2, h0: 7.0, h1: 8.4 };
function gantry(T) {
  const G = GANTRY;
  for (const y of [G.y0, G.y1]) {
    T.post('hyGantry', G.x, y, 0, G.h1, 0.35, { kind: 'wall', name: 'gantry leg', seg: 8 });
  }
  T.box('hyGantry', G.x - 0.7, G.y0 - 0.4, G.h0, G.x + 0.7, G.y1 + 0.4, G.h1, { name: 'gantry beam' });
  const ym = (G.y0 + G.y1) / 2;
  T.box('hyInk', G.x + 0.7, ym - 3.2, G.h0 - 1.6, G.x + 1.2, ym + 3.2, G.h0, { name: 'start lights' });
  for (let i = -2; i <= 2; i += 1) {
    for (const h of [G.h0 - 0.55, G.h0 - 1.15]) {
      T.cyl('lampRed', [G.x + 1.2, ym + i * 1.2, h], [G.x + 1.28, ym + i * 1.2, h], 0.3, 10, true);
    }
  }
  T.sign('startFinish', G.x - 0.72, ym, (G.h0 + G.h1) / 2, -1, 0, 18, 1.2);
  T.sign('startFinish', G.x + 0.72, ym, (G.h0 + G.h1) / 2, 1, 0, 18, 1.2);
}

export function standsAndBridges(T) {
  mainStand(T);
  openStand(T, { ...ICHI, sign: 'ichiStand' }, false);
  openStand(T, { ...KURENAI, sign: 'kurenaiStand' }, true);
  scaffoldStand(T);
  bank(T);
  footbridge(T);
  tyreBridge(T);
  gantry(T);
}

/* For the checks: a point a little way off the line, beside a corner. */
export function nearCorner(k, off) {
  return beside(sAt(k), off * (HALF + 1));
}
