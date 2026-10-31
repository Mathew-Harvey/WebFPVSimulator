/*
 * paddock.js: the people's side of Tanada RX. Pure, as ./circuit.js is.
 *
 * WHAT IS HERE. The service park in the south west, where each team has an
 * awning, its truck, its tyres and its tools; the spectators' bank along
 * the back straight with the stalls on its crest; the catch fences in
 * front of the stand and the bank; the row of food stalls west of the
 * stand with their red lanterns, and the car park east of it on the
 * gravel; the marshals' posts at the corners; the nobori, the tall
 * banners a Japanese event lines its roads with; and the crowd, in the
 * stand and on the bank, which is set dressing and costs nothing past its
 * near cell.
 *
 * No sign here carries a word anybody could read as a brand: the nobori
 * are colour and a crest, the boards are stripes and shapes, the stalls'
 * curtains are plain. The crowd is ~1,200 people of ~44 triangles each.
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

import { w, turn, origin, hash } from './frame.js';
import {
  STAND, BRIDGE, circuitLayout, beside, hoardings,
} from './circuit.js';
import { ROAD } from './hill.js';

/* The spectators' bank: from the plot's south edge up to its crest, then
 * down to the grass before the catch fence. */
export const BANK = { x0: 112, x1: 392, crest0: 2, crest1: 10, foot: 24, h: 3.6 };
/* The catch fence in front of the bank and the one in front of the stand. */
export const FENCE_BANK = { y: 33.2, x0: 112, x1: 392, h: 3.6 };
export const FENCE_STAND = { y: 200, x0: 136, x1: 264, h: 4.0 };
/* The service park. */
export const PARK = { x0: 8, x1: 92, y0: 10, y1: 118 };

const SHIRTS = ['rxCanvasBlue', 'rxCanvasYellow', 'rxCanvasRed', 'rxCanvasWhite', 'rxIndigo', 'rxCanvasGreen', 'rxLivOrange', 'rxCanvasWhite'];
const HATS = ['rxCanvasWhite', 'rxCanvasYellow', 'rxLivBlack', 'rxCanvasRed'];

/* One spectator standing at a plan point on ground h, k their roll of the
 * dice: a body tapered to the shoulders, a head, some in a cap, a few with
 * an arm up. About 44 triangles. */
function person(K, px, py, h, k) {
  const p = w(px, py, h);
  const tall = 1.45 + (k % 5) * 0.06;
  const shirt = SHIRTS[k % SHIRTS.length];
  K.cyl(k % 3 ? 'rxLivBlack' : 'rxIndigo', [p[0], h, p[2]], [p[0], h + 0.75, p[2]], 0.17, 5, 0.19);
  K.cyl(shirt, [p[0], h + 0.75, p[2]], [p[0], h + tall - 0.25, p[2]], 0.22, 6, 0.2);
  K.blob('rxSkin', [p[0], h + tall - 0.08, p[2]], 0.15, 0.17, [0, k, 0]);
  if (k % 4 === 0) {
    K.cyl(HATS[k % HATS.length], [p[0], h + tall + 0.02, p[2]], [p[0], h + tall + 0.1, p[2]], 0.16, 6);
  }
  if (k % 7 === 0) {
    K.cyl('rxSkin', [p[0] + 0.18, h + tall - 0.35, p[2]], [p[0] + 0.26, h + tall + 0.25, p[2]], 0.045, 4);
  }
}

/* One spectator sitting on a row: shorter, no legs to speak of. */
function sitter(K, px, py, h, k) {
  const p = w(px, py, h);
  const shirt = SHIRTS[(k * 3) % SHIRTS.length];
  K.cyl(shirt, [p[0], h + 0.42, p[2]], [p[0], h + 0.98, p[2]], 0.21, 6, 0.19);
  K.blob('rxSkin', [p[0], h + 1.12, p[2]], 0.14, 0.16, [0, k, 0]);
  if (k % 5 === 0) {
    K.cyl(HATS[k % HATS.length], [p[0], h + 1.24, p[2]], [p[0], h + 1.31, p[2]], 0.15, 6);
  }
  if (k % 9 === 0) {
    K.cyl('rxSkin', [p[0] - 0.18, h + 0.95, p[2]], [p[0] - 0.24, h + 1.55, p[2]], 0.045, 4);
  }
}

/* The crowd in the stand: a seat filled where the dice say so, more in the
 * middle and down the front. */
function standCrowd(T) {
  const S = STAND;
  T.dress(() => {
    for (let x0 = S.x0; x0 < S.x1; x0 += 25) {
      T.draw(x0 + 12.5, S.y0 + 5, (K, c) => {
        origin(K, c);
        let k = Math.round(x0);
        for (let r = 0; r < S.rows; r += 1) {
          const y = S.y0 + r * S.tread + 0.62;
          const h = S.front + r * S.rise;
          for (let x = x0 + 0.4; x < Math.min(x0 + 25, S.x1 - 0.4); x += 0.55) {
            k += 1;
            const middle = 1 - Math.abs(x - (S.x0 + S.x1) / 2) / 60;
            if (hash(k, 3) > 0.15 + 0.45 * middle - r * 0.015) {
              continue;
            }
            sitter(K, x, y, h, k);
          }
        }
      });
    }
  });
}

/* The bank: its solid as steps inside its slope, its drawing as one
 * extruded section, and the people standing along it. */
function bank(T) {
  const B = BANK;
  const n = 6;
  T.box('rxGrassBank', B.x0, 0, 0, B.x1, B.crest1, B.h, { draw: false, name: 'bank' });
  for (let k = 0; k < n; k += 1) {
    const ya = B.crest1 + (k * (B.foot - B.crest1)) / n;
    const yb = B.crest1 + ((k + 1) * (B.foot - B.crest1)) / n;
    T.hidden(B.x0, ya, 0, B.x1, yb, B.h * (1 - (k + 1) / n), 'wall', 'bank');
  }
  T.draw((B.x0 + B.x1) / 2, B.foot / 2, (K, c) => {
    turn(K, c, B.x0, 0, 0, Math.PI / 2);
    /* Local x runs north, local z east. */
    K.extrude('rxGrassBank', [[0, 0], [B.foot, 0], [B.crest1, B.h], [0, B.h]], 0, B.x1 - B.x0);
    /* A path of trodden earth along the crest. */
    K.box('rxEarth', B.crest0 + 1, B.h, 0, B.crest1 - 1, B.h + 0.03, B.x1 - B.x0);
  });
  T.dress(() => {
    for (let x0 = B.x0; x0 < B.x1; x0 += 28) {
      T.draw(x0 + 14, 14, (K, c) => {
        origin(K, c);
        let k = Math.round(x0 * 3);
        for (let x = x0 + 0.5; x < Math.min(x0 + 28, B.x1); x += 0.8) {
          if (Math.abs(x - BRIDGE.x) < 4) {
            continue;
          }
          for (let r = 0; r < 4; r += 1) {
            k += 1;
            if (hash(k, 5) > (r === 0 ? 0.55 : 0.32)) {
              continue;
            }
            const y = B.crest1 + 1 + r * 3 + hash(k, 6) * 1.2;
            const h = B.h * (1 - (y - B.crest1) / (B.foot - B.crest1));
            person(K, x + hash(k, 7) * 0.3, y, h, k);
          }
        }
      });
    }
  });
}

/* A catch fence: steel posts every four metres, a net between them with a
 * top rail, solid as one thin wall the height of the net. */
function fence(T, F, skip = null) {
  const pieces = [];
  let a = F.x0;
  for (const [s0, s1] of skip ? [skip] : []) {
    pieces.push([a, s0]);
    a = s1;
  }
  pieces.push([a, F.x1]);
  for (const [x0, x1] of pieces) {
    T.box('net', x0, F.y - 0.03, 0, x1, F.y + 0.03, F.h, { kind: 'obstacle', name: 'catch fence', cast: false });
    for (let x = x0; x <= x1 + 0.01; x += 4) {
      T.post('rxSteelDark', x, F.y + 0.12, 0, F.h + 0.2, 0.06, { kind: 'pole', name: 'fence post' });
    }
    T.draw((x0 + x1) / 2, F.y, (K, c) => {
      origin(K, c);
      K.cyl('rxSteel', w(x0, F.y + 0.1, F.h), w(x1, F.y + 0.1, F.h), 0.035, 5);
      K.cyl('rxSteel', w(x0, F.y + 0.1, F.h * 0.5), w(x1, F.y + 0.1, F.h * 0.5), 0.02, 4);
    });
  }
}

/* A team's awning in the service park: a frame tent in the team colour,
 * open on the side that faces the lane (`face` +1 east, -1 west), its car
 * parked under it nose out (./yard.js), tyres stacked along the back and a
 * tool chest. Its roof is solid; its walls are canvas a quad could tear
 * through, so they are drawn only. */
const AWN = { wd: 9, dp: 7, h: 3.1 };
function awning(T, x0, y0, colour, k, face) {
  const { wd, dp, h } = AWN;
  T.box(colour, x0, y0, h, x0 + wd, y0 + dp, h + 0.25, { name: 'awning roof' });
  for (const [px, py] of [[x0, y0], [x0 + wd, y0], [x0, y0 + dp], [x0 + wd, y0 + dp]]) {
    T.post('rxSteel', px, py, 0, h, 0.05, { kind: 'pole', name: 'awning leg' });
  }
  const back = face > 0 ? x0 : x0 + wd;
  const front = face > 0 ? x0 + wd : x0;
  T.draw(x0 + wd / 2, y0 + dp / 2, (K, c) => {
    origin(K, c);
    /* The back wall, the two side walls cut away at the front, a white
     * valance round the open front, and the floor mat. */
    const box = (m, px0, py0, h0, px1, py1, h1) => {
      const p = w(Math.min(px0, px1), Math.max(py0, py1), h0);
      const q = w(Math.max(px0, px1), Math.min(py0, py1), h1);
      K.box(m, p[0], h0, p[2], q[0], h1, q[2]);
    };
    box(colour, back - 0.02, y0, 0, back + 0.02, y0 + dp, h);
    box(colour, back, y0 - 0.02, 0.9, back + face * wd * 0.55, y0 + 0.02, h);
    box(colour, back, y0 + dp - 0.02, 0.9, back + face * wd * 0.55, y0 + dp + 0.02, h);
    box('rxCanvasWhite', front - 0.03, y0, h - 0.4, front + 0.03, y0 + dp, h);
    box('rxCanvasWhite', x0, y0 - 0.03, h - 0.4, x0 + wd, y0 + 0.03, h);
    box('rxCanvasWhite', x0, y0 + dp - 0.03, h - 0.4, x0 + wd, y0 + dp + 0.03, h);
    box('rxRubber', x0 + 0.3, y0 + 0.3, 0.01, x0 + wd - 0.3, y0 + dp - 0.3, 0.03);
  });
  T.dress(() => {
    T.draw(x0 + wd / 2, y0 + dp / 2, (K, c) => {
      origin(K, c);
      /* Stacks of wheels along the back, a tool chest, a fuel can. */
      for (let s2 = 0; s2 < 3; s2 += 1) {
        const p = w(back + face * 0.6, y0 + 1.2 + s2 * 2.2, 0);
        for (let j = 0; j < 3 + ((k + s2) % 2); j += 1) {
          K.cyl('rxTyre', [p[0], j * 0.24, p[2]], [p[0], j * 0.24 + 0.22, p[2]], 0.32, 10);
        }
      }
      const t = w(back + face * 1.4, y0 + dp - 0.6, 0);
      K.box('rxCanvasRed', t[0] - 0.6, 0, t[2] - 0.3, t[0] + 0.6, 1.0, t[2] + 0.3);
      K.box('rxSteel', t[0] - 0.6, 1.0, t[2] - 0.3, t[0] + 0.6, 1.04, t[2] + 0.3);
      const f = w(back + face * 2.6, y0 + 0.5, 0);
      K.box('rxCanvasRed', f[0] - 0.15, 0, f[2] - 0.11, f[0] + 0.15, 0.45, f[2] + 0.11);
      /* Two crew in the team's colour, one at the bench, one out front. */
      for (const [dx, dy] of [[1.6, dp - 1.6], [wd + 0.8, dp * 0.5]]) {
        const p = w(back + face * dx, y0 + dy, 0);
        K.cyl('rxLivBlack', [p[0], 0, p[2]], [p[0], 0.8, p[2]], 0.15, 5);
        K.cyl(colour, [p[0], 0.8, p[2]], [p[0], 1.45, p[2]], 0.21, 6);
        K.blob('rxSkin', [p[0], 1.62, p[2]], 0.15, 0.17, [0, k + dx, 0]);
      }
    });
  });
}

/* Where the awnings stand, for ./yard.js to park a car under each. */
export function awnings() {
  const TEAM = ['rxLivBlue', 'rxLivYellow', 'rxLivRed', 'rxLivGreen', 'rxLivWhite', 'rxLivOrange'];
  const out = [];
  let k = 0;
  for (const [x0, face] of [[12, 1], [58, -1]]) {
    for (let y0 = 16; y0 < PARK.y1 - 10; y0 += 18) {
      out.push({
        x0, y0, face, colour: TEAM[k % TEAM.length], k, car: [x0 + AWN.wd / 2 + face * 0.6, y0 + AWN.dp / 2],
      });
      k += 1;
    }
  }
  return out;
}

/* A food stall: a timber counter, a canopy, a curtain, red lanterns. */
function stall(T, x0, y0, k, g = 0) {
  const wd = 4.2;
  const dp = 2.6;
  T.box('rxTimberPale', x0, y0, g, x0 + wd, y0 + dp, g + 1.0, { name: 'stall' });
  T.box(k % 2 ? 'rxCanvasRed' : 'rxCanvasWhite', x0 - 0.3, y0 - 0.6, g + 2.5, x0 + wd + 0.3, y0 + dp + 0.2, g + 2.7, { name: 'stall roof' });
  for (const px of [x0 + 0.1, x0 + wd - 0.1]) {
    T.post('rxTimber', px, y0 + 0.1, g, g + 2.5, 0.06, { kind: 'pole', name: 'stall post' });
  }
  T.draw(x0 + wd / 2, y0, (K, c) => {
    K.begin(0, g, 0, 0, c);
    /* The curtain across the front under the canopy, in panels. */
    for (let j = 0; j < 5; j += 1) {
      const p = w(x0 + j * (wd / 5) + 0.04, y0 - 0.58, 2.0);
      K.box(k % 2 ? 'rxIndigo' : 'rxCanvasRed', p[0], 2.0, p[2] - 0.02, p[0] + wd / 5 - 0.08, 2.5, p[2]);
    }
    /* Red paper lanterns along the front edge. */
    for (let j = 0; j < 4; j += 1) {
      const p = w(x0 + 0.5 + j * 1.05, y0 - 0.65, 2.15);
      K.cyl('rxLivBlack', [p[0], 2.42, p[2]], [p[0], 2.5, p[2]], 0.05, 6);
      K.blob('lampRed', [p[0], 2.25, p[2]], 0.18, 0.22, [0, j, 0]);
    }
    /* What is on the counter. */
    const q = w(x0 + 0.4, y0 + 0.3, 1.0);
    K.box('rxSteel', q[0], 1.0, q[2] - 0.5, q[0] + 1.4, 1.12, q[2]);
    K.box('rxStraw', q[0] + 1.8, 1.0, q[2] - 0.5, q[0] + 2.6, 1.2, q[2]);
  });
}

/* A portable toilet: a tall box with a roof. */
function loo(T, px, py, colour) {
  T.box(colour, px, py, 0, px + 1.1, py + 1.1, 2.3, { name: 'portable toilet' });
  T.box('rxCanvasWhite', px - 0.05, py - 0.05, 2.3, px + 1.15, py + 1.15, 2.42, { name: 'portable toilet' });
}

/* A marshal's post: a small raised platform with a rail and a flag. */
function marshal(T, px, py, k) {
  T.box('rxSteel', px - 1, py - 1, 0, px + 1, py + 1, 1.2, { name: 'marshal post' });
  T.draw(px, py, (K, c) => {
    origin(K, c);
    const p = w(px, py, 1.2);
    for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      K.cyl('rxSteel', [p[0] + dx * 0.95, 1.2, p[2] + dz * 0.95], [p[0] + dx * 0.95, 2.2, p[2] + dz * 0.95], 0.03, 4);
    }
    K.box('rxLivOrange', p[0] - 1.0, 1.95, p[2] - 1.0, p[0] + 1.0, 2.2, p[2] + 1.0);
    K.cyl('rxSteel', [p[0] + 0.9, 2.2, p[2] + 0.9], [p[0] + 0.9, 3.4, p[2] + 0.9], 0.02, 4);
    K.box(k % 2 ? 'rxLivYellow' : 'rxLivBlue', p[0] + 0.9, 2.8, p[2] + 0.88, p[0] + 1.6, 3.35, p[2] + 0.92);
    /* The marshal, in orange. */
    K.cyl('rxLivOrange', [p[0], 1.2, p[2]], [p[0], 2.6, p[2]], 0.22, 6, 0.2);
    K.blob('rxSkin', [p[0], 2.78, p[2]], 0.15, 0.17, [0, k, 0]);
  });
}

/* A nobori: a tall narrow banner on a pole with a crossbar at its head,
 * in two colours with a crest. Drawn only, the pole thin enough to pass. */
const NOBORI = [['rxCanvasBlue', 'rxCanvasWhite'], ['rxCanvasRed', 'rxCanvasWhite'], ['rxCanvasYellow', 'rxCanvasRed'], ['rxCanvasGreen', 'rxCanvasWhite'], ['rxCanvasWhite', 'rxIndigo']];
function nobori(T, px, py, a, k) {
  T.dress(() => {
    T.draw(px, py, (K, c) => {
      turn(K, c, px, py, 0, a);
      const [m, band] = NOBORI[k % NOBORI.length];
      K.cyl('rxTimberPale', [0, 0, 0], [0, 4.2, 0], 0.03, 4);
      K.cyl('rxTimberPale', [0, 4.15, 0], [0, 4.15, 0.62], 0.02, 4);
      K.box(m, -0.01, 1.2, 0.04, 0.01, 4.12, 0.6);
      K.box(band, -0.015, 3.6, 0.04, 0.015, 3.8, 0.6);
      K.box(band, -0.015, 1.3, 0.04, 0.015, 1.42, 0.6);
      K.cyl(band, [-0.02, 2.8, 0.32], [0.02, 2.8, 0.32], 0.2, 10);
    });
  });
}

/* The paddock's whole layout. */
export function paddockParts(T) {
  standCrowd(T);
  bank(T);
  fence(T, FENCE_BANK, [BRIDGE.x - BRIDGE.w / 2 - 0.8, BRIDGE.x + BRIDGE.w / 2 + 0.8]);
  fence(T, FENCE_STAND);
  hoardings(T, FENCE_BANK, 1, [BRIDGE.x - BRIDGE.w / 2 - 0.8, BRIDGE.x + BRIDGE.w / 2 + 0.8]);
  hoardings(T, FENCE_STAND, -1);
  /* The service park: three rows of awnings on the gravel, a lane down
   * the middle. */
  T.paint('rxGravelDark', PARK.x0, PARK.y0, 0, PARK.x1, PARK.y1, 0.025);
  for (const a of awnings()) {
    awning(T, a.x0, a.y0, a.colour, a.k, a.face);
  }
  /* The row of stalls west of the stand, the toilets by them. */
  for (let i = 0; i < 6; i += 1) {
    stall(T, 44 + i * 15, 206, i);
  }
  for (let i = 0; i < 4; i += 1) {
    loo(T, 132 - i * 1.4, 218, i % 2 ? 'rxCanvasBlue' : 'rxCanvasGreen');
  }
  for (let i = 0; i < 5; i += 1) {
    stall(T, 140 + i * 50, 3.2, i + 1, BANK.h);
  }
  /* The car park east of the stand on the gravel. */
  T.paint('rxGravel', 262, 201, 0, 414, 226, 0.025);
  /* The marshals at the corners. */
  const { line, clearOf, barriers } = circuitLayout();
  /* Each as near its corner as stands clear of every track and every
   * barrier, or not at all. */
  const offBarrier = (x, y) => Math.min(...barriers.map((b) => {
    const dx = b.b[0] - b.a[0];
    const dy = b.b[1] - b.a[1];
    const t = Math.max(0, Math.min(1, ((x - b.a[0]) * dx + (y - b.a[1]) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(x - b.a[0] - dx * t, y - b.a[1] - dy * t);
  }));
  for (const [s, side, j] of [[350, -1, 0], [470, -1, 1], [700, 1, 2], [960, -1, 3], [1235, 1, 4], [90, -1, 5]]) {
    for (let off = 13; off <= 22; off += 1) {
      const q = beside(line, s, side * off);
      if (clearOf(q.x, q.y) >= 12.5 && offBarrier(q.x, q.y) >= 2.5 && q.x > 3 && q.y > BANK.foot + 2) {
        marshal(T, q.x, q.y, j);
        break;
      }
    }
  }
  /* Nobori along the farm road, both ends of the stand, and the bank's
   * crest. */
  let n = 0;
  for (let x = 6; x < 414; x += 9) {
    if (x > 146 && x < 254) {
      continue;
    }
    nobori(T, x, ROAD.y0 - 1.2, 0, n);
    n += 1;
  }
  for (let x = BANK.x0 + 4; x < BANK.x1; x += 11) {
    nobori(T, x, BANK.crest0 + 0.5, 0, n);
    n += 1;
  }
  for (let y = PARK.y0 + 4; y < PARK.y1; y += 9) {
    nobori(T, PARK.x1 + 2, y, Math.PI / 2, n);
    n += 1;
  }
}
