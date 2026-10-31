/*
 * play.js: Hinode Park's playground, the 児童遊園 every Japanese ward park
 * keeps in a corner: the concrete octopus mountain (タコの山, cast by the
 * hundred for Tokyo's parks since the sixties, legs for slides and tunnels
 * through its belly), a swing set, a climbing frame, a steel slide, iron
 * bars at three heights, a sandpit with a wooden kerb, a seesaw and the
 * spring riders, on a floor of decomposed granite.
 *
 * THE WHOOP LINE runs through it: the octopus's tunnel west to east, then
 * a bay of the swing set; both are named gaps (./plan.js). The tunnel is
 * a little bigger than a child's, 2.2 m wide and 2.1 high, so a five inch
 * fits it the way a whoop fits the real one.
 *
 * THE KONEX DRONE SIGN hides in the octopus: a short tunnel runs in from
 * its south face and meets the through tunnel in a T, and the sign is on
 * the wall the pilot faces at the T (HIDDEN_SIGN, read by ./plan.js). It
 * can only be seen from inside the stub, so the pilot who finds it has
 * already committed to the turn at the T.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { rng } from './frame.js';

/* The playground's plot, plan metres. */
export const PLAYGROUND = { x0: 140, x1: 232, y0: 27, y1: 58 };

/* The octopus: its middle, its base's half width, the tunnel's half width
 * and height, the tiers' tops. */
export const OCTOPUS = { px: 172, py: 42, half: 6, tunnel: 1.1, tunnelH: 2.1, tier1: 2.4, tier2: 3.9, tier2Half: 4.2 };

/* The swing set: its frame's west end, its bays, the top bar's height. */
export const SWINGS = { x0: 190, py: 51, bay: 2.8, bays: 2, h: 2.8, splay: 0.9 };

/* The climbing frame: its south west corner, cell size, cells. */
export const CLIMBER = { x0: 205, y0: 34, cell: 1.8, n: 3, levels: 2 };

/* Where the hidden sign is: on the through tunnel's north wall, facing
 * south down the stub, plan metres. */
export const HIDDEN_SIGN = { px: OCTOPUS.px, py: OCTOPUS.py + OCTOPUS.tunnel, h: 1.05, w: 1.0 };

/* The octopus mountain. */
function octopus(T) {
  const O = OCTOPUS;
  const { px: cx, py: cy, half: H, tunnel: t, tunnelH: th } = O;
  const box = (m, x0, y0, h0, x1, y1, h1, name, opts = {}) => T.box(m, cx + x0, cy + y0, h0, cx + x1, cy + y1, h1, { kind: 'wall', name, ...opts });
  /* The first tier, round the tunnels: the north half whole, the two
   * south corners either side of the stub, and the tunnels' roofs. */
  box('pkOctopus', -H, t, 0, H, H, O.tier1, 'octopus');
  box('pkOctopus', -H, -H, 0, -t, -t, O.tier1, 'octopus');
  box('pkOctopus', t, -H, 0, H, -t, O.tier1, 'octopus');
  box('pkOctopus', -H, -t, th, H, t, O.tier1, 'octopus');
  box('pkOctopus', -t, -H, th, t, -t, O.tier1, 'octopus');
  /* The tunnels' floors and walls, a shade deeper, drawn on the solids'
   * faces so the tunnel reads as a tunnel and not a slot in a block. */
  T.paint('pkOctopusDeep', cx - H, cy - t, 0.004, cx + H, cy + t, 0.012);
  T.paint('pkOctopusDeep', cx - t, cy - H, 0.004, cx + t, cy - t, 0.012);
  /* The second tier and its lip. */
  const h2 = O.tier2Half;
  box('pkOctopusDeep', -h2, -h2, O.tier1, h2, h2, O.tier2, 'octopus');
  for (const [a, b] of [[[-H, -H], [H, -H]], [[H, -H], [H, H]], [[H, H], [-H, H]], [[-H, H], [-H, -H]]]) {
    T.cyl('pkOctopusDeep', [cx + a[0], cy + a[1], O.tier1], [cx + b[0], cy + b[1], O.tier1], 0.16, 8);
  }
  for (const [a, b] of [[[-h2, -h2], [h2, -h2]], [[h2, -h2], [h2, h2]], [[h2, h2], [-h2, h2]], [[-h2, h2], [-h2, -h2]]]) {
    T.cyl('pkPlayYellow', [cx + a[0], cy + a[1], O.tier2], [cx + b[0], cy + b[1], O.tier2], 0.14, 8);
  }
  /* The tunnel mouths' rims, yellow, so each reads as a door. */
  /* Set just outside the opening, so the rim frames the door and never
   * narrows it. */
  const rt = t + 0.13;
  for (const [x, y, along] of [[-H - 0.05, 0, 'y'], [H + 0.05, 0, 'y'], [0, -H - 0.05, 'x']]) {
    const [ax, ay] = along === 'y' ? [cx + x, cy - rt] : [cx - rt, cy + y];
    const [bx, by] = along === 'y' ? [cx + x, cy + rt] : [cx + rt, cy + y];
    T.cyl('pkPlayYellow', [ax, ay, th + 0.13], [bx, by, th + 0.13], 0.12, 8);
    T.cyl('pkPlayYellow', [ax, ay, 0], [ax, ay, th], 0.12, 8);
    T.cyl('pkPlayYellow', [bx, by, 0], [bx, by, th], 0.12, 8);
  }
  /* The head: a ball on the second tier, solid as a box inside it, with
   * its eyes, its brow and its pursed mouth facing south. */
  const hr = 2.5;
  const hz = O.tier2 + hr * 0.75;
  T.ball('pkOctopus', cx, cy + 0.6, hz, hr);
  box('pkOctopus', -1.75, -1.15, O.tier2, 1.75, 2.35, hz + 1.7, 'octopus head', { draw: false });
  for (const sx of [-1, 1]) {
    T.ball('pkSwan', cx + sx * 0.9, cy - 1.55, hz + 0.35, 0.55);
    T.ball('pkWoodDark', cx + sx * 0.9, cy - 2.0, hz + 0.3, 0.26);
    T.cyl('pkOctopusDeep', [cx + sx * 0.35, cy - 1.9, hz + 1.0], [cx + sx * 1.4, cy - 1.7, hz + 1.25], 0.12, 6);
  }
  T.torus('pkOctopusDeep', cx, cy - 2.35, hz - 0.75, 0.38, 0.16, 0, -1, 8, 16);
  /* Two legs for slides, west and east, from the second tier to the
   * ground, and the steps up the back. */
  for (const s of [-1, 1]) {
    const x0 = cx + s * h2;
    const x1 = cx + s * (H + 5.5);
    const y0 = cy + 1.4;
    const y1 = cy + 3.2;
    const lo = Math.min(x0, x1);
    const hi = Math.max(x0, x1);
    const top = O.tier2 - 0.05;
    const prof = s < 0
      ? [[lo, 0.2], [lo + 0.8, 0.25], [hi, top], [hi, top + 0.3], [lo + 0.8, 0.55], [lo, 0.5]]
      : [[hi, 0.2], [hi, 0.5], [hi - 0.8, 0.55], [lo, top + 0.3], [lo, top], [hi - 0.8, 0.25]];
    T.prism('pkOctopusDeep', 'y', prof, y0, y1);
    T.prism('pkSteel', 'y', prof.map(([x, h]) => [x, h + 0.04]), y0 + 0.25, y1 - 0.25);
    /* Its lips, and the leg's suckers along the side. */
    for (const y of [y0 + 0.08, y1 - 0.08]) {
      T.cyl('pkOctopus', [x1 - s * 0.6, y, 0.6], [x0, y, top + 0.35], 0.1, 6);
    }
    T.dress(() => {
      for (let k = 1; k < 6; k += 1) {
        const f = k / 6;
        T.bead('pkSwan', x1 + (x0 - x1) * f, y0 - 0.02, 0.35 + (top - 0.1) * f, 0.13);
      }
    });
    /* Its solid in steps under the chute. */
    const N = 6;
    for (let k = 0; k < N; k += 1) {
      const f0 = k / N;
      const f1 = (k + 1) / N;
      const xa = x1 + (x0 - x1) * f0;
      const xb = x1 + (x0 - x1) * f1;
      T.hidden(Math.min(xa, xb), y0, 0, Math.max(xa, xb), y1, 0.3 + (top - 0.3) * f0, 'wall', 'octopus slide');
    }
  }
  /* The steps up its back, solid. */
  for (let k = 0; k < 5; k += 1) {
    const h = ((k + 1) * O.tier2) / 5;
    const y = cy + H + 3.5 - k * 0.7;
    T.box('pkOctopusDeep', cx - 1.0, y - 0.7, 0, cx + 1.0, y, Math.min(h, O.tier1 + 0.01) > O.tier1 ? O.tier1 : h, { kind: 'wall', name: 'octopus steps' });
  }
  /* Its spots, painted on the lower tier, near only. */
  const r = rng(7201);
  T.dress(() => {
    for (let k = 0; k < 18; k += 1) {
      const side = r.int(0, 3);
      const along = r.range(-H + 0.8, H - 0.8);
      const h = r.range(0.5, O.tier1 - 0.4);
      if (side < 2 && Math.abs(along) < t + 0.6 && h < th + 0.3) {
        continue;
      }
      const d = 0.03;
      if (side === 0) {
        T.box('pkPlayYellow', cx + along - 0.22, cy - H - d, h - 0.22, cx + along + 0.22, cy - H, h + 0.22);
      } else if (side === 1) {
        T.box('pkPlayTeal', cx + H, cy + along - 0.22, h - 0.22, cx + H + d, cy + along + 0.22, h + 0.22);
      } else if (side === 2) {
        T.box('pkPlayYellow', cx + along - 0.22, cy + H, h - 0.22, cx + along + 0.22, cy + H + d, h + 0.22);
      } else {
        T.box('pkPlayTeal', cx - H - d, cy + along - 0.22, h - 0.22, cx - H, cy + along + 0.22, h + 0.22);
      }
    }
  });
}

/* The swing set: two A frames and a top bar, solid; chains and seats
 * drawn, a quad passes through them. */
function swings(T) {
  const S = SWINGS;
  const x1 = S.x0 + S.bay * S.bays;
  for (let k = 0; k <= S.bays; k += 1) {
    const x = S.x0 + k * S.bay;
    for (const s of [-1, 1]) {
      T.cap('pkPlayBlue', [x, S.py + s * S.splay, 0], [x, S.py, S.h], 0.07, { kind: 'pole', name: 'swing frame' });
    }
  }
  T.cap('pkPlayRed', [S.x0 - 0.15, S.py, S.h], [x1 + 0.15, S.py, S.h], 0.08, { kind: 'pole', name: 'swing bar' });
  for (let k = 0; k < S.bays; k += 1) {
    for (const f of [0.3, 0.7]) {
      const x = S.x0 + (k + f) * S.bay;
      T.cyl('pkSteelDark', [x - 0.22, S.py, 0.48], [x - 0.22, S.py, S.h], 0.015, 3, null, true);
      T.cyl('pkSteelDark', [x + 0.22, S.py, 0.48], [x + 0.22, S.py, S.h], 0.015, 3, null, true);
      T.box('pkPlayYellow', x - 0.26, S.py - 0.1, 0.42, x + 0.26, S.py + 0.1, 0.48, { solid: false });
    }
  }
  /* The worn hollows under the seats, and the safety rail in front. */
  T.paint('pkClayWorn', S.x0 + 0.3, S.py - 2.2, 0.014, x1 - 0.3, S.py + 2.2, 0.02);
  T.cap('pkFenceGreen', [S.x0 - 0.5, S.py - 3.2, 0.6], [x1 + 0.5, S.py - 3.2, 0.6], 0.04, { kind: 'pole', name: 'swing rail' });
  for (const x of [S.x0 - 0.5, (S.x0 + x1) / 2, x1 + 0.5]) {
    T.post('pkFenceGreen', x, S.py - 3.2, 0, 0.6, 0.04, { kind: 'pole', name: 'swing rail' });
  }
}

/* The climbing frame: a cube of bars, every one solid, in four colours. */
function climber(T) {
  const C = CLIMBER;
  const n = C.n;
  const top = C.cell * C.levels;
  const colours = ['pkPlayRed', 'pkPlayYellow', 'pkPlayBlue', 'pkPlayTeal'];
  for (let i = 0; i <= n; i += 1) {
    for (let j = 0; j <= n; j += 1) {
      T.post(colours[(i + j) % 4], C.x0 + i * C.cell, C.y0 + j * C.cell, 0, top, 0.035, { kind: 'pole', name: 'climbing frame' });
    }
  }
  for (let l = 1; l <= C.levels; l += 1) {
    const h = l * C.cell;
    for (let i = 0; i <= n; i += 1) {
      T.cap(colours[(i + l) % 4], [C.x0 + i * C.cell, C.y0, h], [C.x0 + i * C.cell, C.y0 + n * C.cell, h], 0.035, { kind: 'pole', name: 'climbing frame' });
      T.cap(colours[(i + l + 2) % 4], [C.x0, C.y0 + i * C.cell, h], [C.x0 + n * C.cell, C.y0 + i * C.cell, h], 0.035, { kind: 'pole', name: 'climbing frame' });
    }
  }
}

/* A steel slide: a platform on legs, a ladder, a chute. */
function slide(T, px, py) {
  const h = 1.9;
  T.box('pkSteel', px - 0.6, py - 0.6, h - 0.08, px + 0.6, py + 0.6, h, { kind: 'wall', name: 'slide deck' });
  for (const [dx, dy] of [[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]]) {
    T.post('pkPlayTeal', px + dx, py + dy, 0, h + 0.9, 0.04, { kind: 'pole', name: 'slide leg' });
  }
  for (const dx of [-0.55, 0.55]) {
    T.cyl('pkPlayTeal', [px + dx, py - 0.55, h + 0.85], [px + dx, py + 0.55, h + 0.85], 0.035, 5);
  }
  /* The chute runs west, down to the ground in 3.6 m. */
  const prof = [[px - 4.4, 0.25], [px - 3.8, 0.3], [px - 0.6, h], [px - 0.6, h + 0.08], [px - 3.8, 0.38], [px - 4.4, 0.33]];
  T.prism('pkSteel', 'y', prof, py - 0.4, py + 0.4);
  T.prism('pkPlayTeal', 'y', prof.map(([x, hh]) => [x, hh + 0.18]), py - 0.42, py - 0.36);
  T.prism('pkPlayTeal', 'y', prof.map(([x, hh]) => [x, hh + 0.18]), py + 0.36, py + 0.42);
  for (let k = 0; k < 4; k += 1) {
    const xa = px - 4.0 + k * 0.85;
    T.hidden(xa, py - 0.4, 0, xa + 0.85, py + 0.4, 0.3 + (k * (h - 0.4)) / 4, 'wall', 'slide');
  }
  /* The ladder up its east side. */
  for (let k = 0; k < 6; k += 1) {
    T.cyl('pkSteelDark', [px + 1.2 - k * 0.1, py - 0.4, 0.3 + k * 0.3], [px + 1.2 - k * 0.1, py + 0.4, 0.3 + k * 0.3], 0.025, 4, null, true);
  }
  for (const dy of [-0.42, 0.42]) {
    T.cap('pkPlayTeal', [px + 1.35, py + dy, 0], [px + 0.6, py + dy, h + 0.9], 0.04, { kind: 'pole', name: 'slide ladder' });
  }
}

/* Iron bars at three heights, the sandpit, the seesaw, the riders. */
function small(T) {
  /* 鉄棒: three bars, low, middle, high, on four posts. */
  const bx = 146;
  const by = 32;
  const heights = [0.9, 1.15, 1.45];
  for (let k = 0; k <= 3; k += 1) {
    T.post('pkPlayRed', bx + k * 1.6, by, 0, k === 0 ? heights[0] : heights[Math.min(2, k - 1)] + (k === 3 ? 0 : 0), 0.05, { kind: 'pole', name: 'iron bars' });
  }
  for (let k = 0; k < 3; k += 1) {
    T.cap('pkSteel', [bx + k * 1.6, by, heights[k]], [bx + (k + 1) * 1.6, by, heights[k]], 0.03, { kind: 'pole', name: 'iron bar' });
  }
  /* The sandpit, its wooden kerb solid and low. */
  const s = { x0: 150, x1: 159, y0: 46, y1: 54 };
  T.paint('pkSand', s.x0, s.y0, 0.004, s.x1, s.y1, 0.03);
  T.box('pkWood', s.x0 - 0.3, s.y0 - 0.3, 0, s.x1 + 0.3, s.y0, 0.3, { kind: 'wall', name: 'sandpit' });
  T.box('pkWood', s.x0 - 0.3, s.y1, 0, s.x1 + 0.3, s.y1 + 0.3, 0.3, { kind: 'wall', name: 'sandpit' });
  T.box('pkWood', s.x0 - 0.3, s.y0, 0, s.x0, s.y1, 0.3, { kind: 'wall', name: 'sandpit' });
  T.box('pkWood', s.x1, s.y0, 0, s.x1 + 0.3, s.y1, 0.3, { kind: 'wall', name: 'sandpit' });
  T.dress(() => {
    /* A bucket, a spade, a half dug castle. */
    T.cyl('pkPlayRed', [s.x0 + 2, s.y0 + 2, 0.03], [s.x0 + 2, s.y0 + 2, 0.28], 0.12, 8, 0.16);
    T.cyl('pkPlayBlue', [s.x0 + 2.4, s.y0 + 2.3, 0.05], [s.x0 + 2.9, s.y0 + 2.5, 0.08], 0.03, 4);
    T.cone('pkSand', s.x0 + 5, s.y0 + 4, 0.03, 0.6, 0.45, 8);
    T.cone('pkSand', s.x0 + 5.6, s.y0 + 4.4, 0.03, 0.4, 0.3, 8);
  });
  /* The seesaw. */
  const sx = 148;
  const sy = 40;
  T.box('pkPlayYellow', sx - 0.3, sy - 0.2, 0, sx + 0.3, sy + 0.2, 0.45, { kind: 'wall', name: 'seesaw' });
  T.cap('pkPlayBlue', [sx - 1.9, sy, 0.25], [sx + 1.9, sy, 0.65], 0.09, { kind: 'pole', name: 'seesaw' });
  T.dress(() => {
    for (const d of [-1.6, 1.6]) {
      T.cyl('pkPlayRed', [sx + d, sy - 0.25, 0.75 + d * 0.1], [sx + d, sy + 0.25, 0.75 + d * 0.1], 0.04, 5);
    }
  });
  /* The spring riders: a panda, a rabbit, a horse, each on its spring. */
  T.dress(() => {
    const riders = [[186, 36, 'pkSwan', 'pkWoodDark'], [189, 36, 'pkAzalea', 'pkSwan'], [192, 36, 'pkPlayYellow', 'pkWoodDark']];
    for (const [x, y, body, trim] of riders) {
      T.disc('pkConcreteMid', x, y, 0.4, 0, 0.06, 12);
      T.cyl('pkSteelDark', [x, y, 0.06], [x, y, 0.4], 0.09, 8);
      T.ball(body, x, y, 0.62, 0.3);
      T.ball(body, x, y - 0.32, 0.95, 0.22);
      T.bead(trim, x - 0.14, y - 0.32, 1.15, 0.08);
      T.bead(trim, x + 0.14, y - 0.32, 1.15, 0.08);
      T.cyl(trim, [x - 0.2, y - 0.2, 0.85], [x + 0.2, y - 0.2, 0.85], 0.025, 4);
    }
  });
}

export function playground(T) {
  const P = PLAYGROUND;
  /* The floor: decomposed granite, raked. */
  T.paint('pkPath', P.x0, P.y0, 0.003, P.x1, P.y1, 0.011);
  octopus(T);
  swings(T);
  climber(T);
  slide(T, 220, 48);
  small(T);
  /* The rules board at its gate. */
  T.post('pkSteelDark', P.x0 + 1.4, P.y1 - 0.8, 0, 1.6, 0.05, { kind: 'pole', name: 'sign post' });
  T.post('pkSteelDark', P.x0 + 3.0, P.y1 - 0.8, 0, 1.6, 0.05, { kind: 'pole', name: 'sign post' });
  T.box('pkSwan', P.x0 + 1.3, P.y1 - 0.85, 0.85, P.x0 + 3.1, P.y1 - 0.75, 1.75, { kind: 'wall', name: 'rules board' });
  T.sign('pkPlayRules', P.x0 + 2.2, P.y1 - 0.74, 1.3, 1.7, 0.85, 'n');
  T.sign('pkPlayRules', P.x0 + 2.2, P.y1 - 0.86, 1.3, 1.7, 0.85, 's');
}
