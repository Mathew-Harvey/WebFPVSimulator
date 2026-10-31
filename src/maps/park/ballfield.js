/*
 * ballfield.js: Hinode Park's ball ground, the 野球場 of a ward park, built
 * from the regulation diamond and from how the grounds of Tokyo's ward
 * parks are put together (Yoyogi's softball fields, the grounds along the
 * Arakawa), never from any game's map.
 *
 * THE DIAMOND IS THE RULE BOOK'S. Bases 27.43 m apart (90 ft), the pitcher's
 * plate 18.44 m from home (60 ft 6 in) on a mound 5.49 m across, the grass
 * line 28.95 m round the plate, a 0.38 m base. The foul lines run down the
 * plan's axes from home, first base east and third base north, so every
 * wall of the ground is square to the plot and a box stays a box. Down the
 * lines it is 82 m to the fence, a municipal ground's 両翼, and the fence
 * follows the park's own edge, as a ground squeezed into a ward park does.
 *
 * WHAT MAKES IT A JAPANESE GROUND and not a pro park: the backstop is a tall
 * net on dark green steel with a hood leaning over home and a concrete wall
 * at its foot; the dugouts are concrete benches under a slab roof, open at
 * both ends; and behind the outfield fence stands the 防球ネット, a ball
 * stop net fourteen metres high on steel masts, which is what the
 * neighbours' windows see. There is a hand turned scoreboard on legs in the
 * corner, four floodlight masts, and three rows of concrete steps for the
 * parents.
 *
 * THE LINES THIS GROUND IS BUILT FOR (named gaps, ./plan.js): the gate
 * between the backstop and the first base dugout, and its twin on the third
 * base side; a strafe down the inside of each dugout, open end to open
 * end; and under the scoreboard.
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

/* The regulation numbers, metres. */
export const BASE = 27.43;
export const MOUND_AT = 18.44;
export const GRASS_R = 28.95;
const MOUND_R = 2.745;

/* Home plate, and the ground's fence: first base runs east, third north. */
export const HOME = { px: 150, py: 90 };
export const FENCE = { x0: 136, x1: 232, y0: 78, y1: 172, h: 2.2 };
export const PITCH = { px: HOME.px + MOUND_AT / Math.SQRT2, py: HOME.py + MOUND_AT / Math.SQRT2 };

/* The backstop: an L of two wings meeting behind home, a net on poles. */
export const BACKSTOP = { x: 140, y: 80, east: 158, north: 98, h: 9, wall: 0.9 };

/* The gates between the backstop and each dugout: the backstop gap. */
export const GATE_1B = { x0: 158, x1: 162, py: BACKSTOP.y, h: 3.8 };
export const GATE_3B = { y0: 98, y1: 102, px: BACKSTOP.x, h: 3.8 };

/* The dugouts: concrete back and front, a slab roof, open at both ends.
 * `y0` is the back wall's face, `y1` the front wall's back. */
export const DUGOUT_1B = { x0: 162.6, x1: 173.6, y0: 79.4, y1: 82.9, roof: 2.45, front: 0.95, bench: 0.45 };
export const DUGOUT_3B = { y0: 102.6, y1: 113.6, x0: 137.1, x1: 140.6, roof: 2.45, front: 0.95, bench: 0.45 };

/* The ball stop net behind the outfield, and the scoreboard. */
export const BIG_NET = { x: 233.7, y: 173.7, h: 14 };
export const SCOREBOARD = { x0: 212, x1: 222, py: 168, lift: 2.4, h: 3.6, t: 0.5 };

/* The floodlight masts. */
export const MASTS = [
  { px: 133, py: 72, face: 'ne' },
  { px: 228.5, py: 81, face: 'nw' },
  { px: 139.5, py: 168.5, face: 'se' },
  { px: 228.5, py: 162, face: 'sw' },
];

const POLE_R = 0.12;

/*
 * A run of net on dark green poles along a plan axis, solid as the net is:
 * `along` 'x' runs from a to b at py = at, 'y' from a to b at px = at.
 * The net is a sheet 6 cm thick between the poles, and the poles stand
 * every `step` metres; `wall`, if given, is a concrete foot that high.
 */
function netRun(T, along, at, a, b, h0, h1, step, name, wall = 0, poleR = POLE_R) {
  const t = 0.03;
  if (along === 'x') {
    T.box('pkNet', a, at - t, h0 + wall, b, at + t, h1, { kind: 'wall', name, cast: false });
    if (wall > 0) {
      T.box('pkConcreteMid', a, at - 0.12, h0, b, at + 0.12, h0 + wall, { kind: 'wall', name: `${name} wall` });
    }
  } else {
    T.box('pkNet', at - t, a, h0 + wall, at + t, b, h1, { kind: 'wall', name, cast: false });
    if (wall > 0) {
      T.box('pkConcreteMid', at - 0.12, a, h0, at + 0.12, b, h0 + wall, { kind: 'wall', name: `${name} wall` });
    }
  }
  const n = Math.max(1, Math.round((b - a) / step));
  for (let i = 0; i <= n; i += 1) {
    const s = a + ((b - a) * i) / n;
    const [px, py] = along === 'x' ? [s, at] : [at, s];
    T.post('pkNetPole', px, py, 0, h1 + 0.15, poleR, { kind: 'pole', name: `${name} pole` });
  }
  /* The top rope and the mid rail, drawn: the net sags between them. */
  const ends = along === 'x' ? [[a, at], [b, at]] : [[at, a], [at, b]];
  T.cyl('pkNetPole', [ends[0][0], ends[0][1], h1], [ends[1][0], ends[1][1], h1], 0.035, 4, null, true);
  if (h1 - h0 > 4) {
    T.cyl('pkNetPole', [ends[0][0], ends[0][1], h0 + 2.4], [ends[1][0], ends[1][1], h0 + 2.4], 0.03, 4, null, true);
  }
}

/* A low fence of chain link: kick plate, mesh, posts and a top rail. */
function lowFence(T, along, at, a, b, h, name) {
  const t = 0.03;
  if (along === 'x') {
    T.box('pkFenceGreen', a, at - 0.05, 0, b, at + 0.05, 0.35, { kind: 'wall', name });
    T.box('pkNet', a, at - t, 0.35, b, at + t, h, { kind: 'wall', name, cast: false });
  } else {
    T.box('pkFenceGreen', at - 0.05, a, 0, at + 0.05, b, 0.35, { kind: 'wall', name });
    T.box('pkNet', at - t, a, 0.35, at + t, b, h, { kind: 'wall', name, cast: false });
  }
  const n = Math.max(1, Math.round((b - a) / 3));
  for (let i = 0; i <= n; i += 1) {
    const s = a + ((b - a) * i) / n;
    const [px, py] = along === 'x' ? [s, at] : [at, s];
    T.post('pkFenceGreen', px, py, 0, h + 0.05, 0.05, { kind: 'pole', name: `${name} post` });
  }
  const ends = along === 'x' ? [[a, at], [b, at]] : [[at, a], [at, b]];
  T.cyl('pkFenceGreen', [ends[0][0], ends[0][1], h + 0.03], [ends[1][0], ends[1][1], h + 0.03], 0.045, 6);
}

/* The ground's paint and dirt: the infield skin, the turf's mowing
 * stripes, the lines, the boxes, the bases and the mound. Paint only. */
function groundPaint(T) {
  const { px: hx, py: hy } = HOME;
  /* The fenced ground's turf over the park's lawn, in stripes. */
  T.paint('pkTurf', FENCE.x0, FENCE.y0, 0.004, FENCE.x1, FENCE.y1, 0.012);
  T.wide(() => {
    T.dress(() => {
      for (let x = FENCE.x0 + 6; x < FENCE.x1; x += 12) {
        T.paint('pkTurfDeep', x, FENCE.y0 + 0.5, 0.012, Math.min(FENCE.x1 - 0.5, x + 6), FENCE.y1 - 0.5, 0.016);
      }
    });
  });
  /* The skin: the grass line's circle round the plate, the clay it leaves,
   * and the home plate circle behind the plate. */
  T.disc('pkClay', PITCH.px, PITCH.py, GRASS_R, 0.016, 0.03, 64);
  T.disc('pkClay', hx, hy, 9, 0.016, 0.03, 40);
  /* The foul ground between the lines and the backstop is clay too, as a
   * ward ground's is. */
  T.paint('pkClay', BACKSTOP.x + 0.2, BACKSTOP.y + 0.2, 0.016, GATE_1B.x1 + 12, hy - 1, 0.03);
  T.paint('pkClay', BACKSTOP.x + 0.2, BACKSTOP.y + 0.2, 0.0165, hx - 1, GATE_3B.y1 + 12, 0.0305);
  /* The infield grass, inside the base paths, and the mound on it. */
  const path = 1.85;
  T.paint('pkTurf', hx + path, hy + path, 0.03, hx + BASE - path, hy + BASE - path, 0.04);
  T.disc('pkClayWorn', PITCH.px, PITCH.py, MOUND_R, 0.04, 0.2, 32);
  T.paint('pkLime', PITCH.px - 0.3, PITCH.py - 0.08, 0.2, PITCH.px + 0.3, PITCH.py + 0.08, 0.215);
  /* The cut outs round each base and the plate, worn darker. */
  for (const [bx, by] of [[hx + BASE, hy], [hx + BASE, hy + BASE], [hx, hy + BASE]]) {
    T.disc('pkClayWorn', bx, by, 2.7, 0.03, 0.036, 24);
  }
  T.disc('pkClayWorn', hx, hy, 3.96, 0.03, 0.036, 32);
  /* The lines, 8 cm of lime: down each foul line to its pole. */
  const L = 0.04;
  T.paint('pkLime', hx, hy - L, 0.036, FENCE.x1, hy + L, 0.042);
  T.paint('pkLime', hx - L, hy, 0.036, hx + L, FENCE.y1, 0.042);
  /* The batter's boxes, either side of the plate, and the catcher's box. */
  const outline = (x0, y0, x1, y1, h = 0.037) => {
    T.paint('pkLime', x0, y0, h, x1, y0 + 0.08, h + 0.006);
    T.paint('pkLime', x0, y1 - 0.08, h, x1, y1, h + 0.006);
    T.paint('pkLime', x0, y0, h, x0 + 0.08, y1, h + 0.006);
    T.paint('pkLime', x1 - 0.08, y0, h, x1, y1, h + 0.006);
  };
  /* The plate faces up the diagonal; on these axes its boxes stand off
   * the diagonal's two sides. */
  outline(hx + 0.4, hy - 1.75, hx + 1.6, hy + 0.35);
  outline(hx - 1.75, hy + 0.4, hx + 0.35, hy + 1.6);
  outline(hx - 2.6, hy - 2.6, hx - 0.6, hy - 0.6);
  /* The coaches' boxes and the on deck circles. */
  outline(hx + BASE + 2, hy - 7, hx + BASE + 8, hy - 4.5);
  outline(hx - 7, hy + BASE + 2, hx - 4.5, hy + BASE + 8);
  T.disc('pkLime', hx + 9, hy - 7, 0.8, 0.036, 0.04, 20);
  T.disc('pkTurfDeep', hx + 9, hy - 7, 0.72, 0.04, 0.042, 20);
  T.disc('pkLime', hx - 7, hy + 9, 0.8, 0.036, 0.04, 20);
  T.disc('pkTurfDeep', hx - 7, hy + 9, 0.72, 0.04, 0.042, 20);
  /* The plate, a pentagon as a square and a point, and the three bags. */
  T.paint('pkLime', hx - 0.22, hy - 0.22, 0.036, hx + 0.22, hy + 0.22, 0.06);
  for (const [bx, by] of [[hx + BASE, hy], [hx + BASE, hy + BASE], [hx, hy + BASE]]) {
    T.deco('pkLime', bx - 0.19, by - 0.19, 0.03, bx + 0.19, by + 0.19, 0.11);
  }
}

/* The backstop: two wings of net on a concrete foot, the hood over them,
 * and the corner mast where they meet. */
function backstop(T) {
  const { x, y, east, north, h, wall } = BACKSTOP;
  netRun(T, 'x', y, x, east, 0, h, 3, 'backstop', wall, 0.16);
  netRun(T, 'y', x, y, north, 0, h, 3, 'backstop', wall, 0.16);
  /* The hood: a roof of net on struts leaning in over home, drawn as a
   * slab of lacquered steel framing and a skin of net. Solid as a thin
   * slab, so a quad that climbs into it meets it. */
  const lean = 2.6;
  const drop = 1.1;
  T.prism('pkNetPole', 'x', [[y - 0.1, h], [y + lean, h - drop], [y + lean, h - drop - 0.18], [y - 0.1, h - 0.18]], x, east);
  T.prism('pkNetPole', 'y', [[x - 0.1, h], [x + lean, h - drop], [x + lean, h - drop - 0.18], [x - 0.1, h - 0.18]], y, north);
  /* Its solid in three steps down the slope, each inside the drawn slab's
   * band, so nothing solid stands where nothing is drawn. */
  for (let k = 0; k < 3; k += 1) {
    const a = (lean * k) / 3;
    const b = (lean * (k + 1)) / 3;
    const hi = h - 0.02 - (drop * a) / lean;
    const lo = h - 0.16 - (drop * b) / lean;
    T.hidden(x, y + a, lo, east, y + b, hi, 'wall', 'backstop hood');
    T.hidden(x + a, y + lean, lo, x + b, north, hi, 'wall', 'backstop hood');
  }
  /* The pads on the foot's inside face, and its name in the concrete. */
  T.deco('pkFenceGreen', x + 0.12, y + 0.12, 0.05, east, y + 0.22, wall - 0.05);
  T.deco('pkFenceGreen', x + 0.12, y + 0.22, 0.05, x + 0.22, north, wall - 0.05);
  T.sign('pkGround', x + 9, y + 0.23, wall / 2, 5.2, 0.62, 'n');
  /* Over each gate: the header beam, and the net on up to the backstop's
   * height, so the gate is a window in the net and not a notch in it. */
  T.box('pkNetPole', GATE_1B.x0, y - 0.1, GATE_1B.h, GATE_1B.x1, y + 0.1, GATE_1B.h + 0.22, { kind: 'pole', name: 'gate header' });
  T.box('pkNet', GATE_1B.x0, y - 0.03, GATE_1B.h + 0.22, GATE_1B.x1, y + 0.03, h, { kind: 'wall', name: 'gate net', cast: false });
  T.post('pkNetPole', GATE_1B.x1, y, 0, h + 0.15, 0.16, { kind: 'pole', name: 'gate pole' });
  T.box('pkNetPole', x - 0.1, GATE_3B.y0, GATE_3B.h, x + 0.1, GATE_3B.y1, GATE_3B.h + 0.22, { kind: 'pole', name: 'gate header' });
  T.box('pkNet', x - 0.03, GATE_3B.y0, GATE_3B.h + 0.22, x + 0.03, GATE_3B.y1, h, { kind: 'wall', name: 'gate net', cast: false });
  T.post('pkNetPole', x, GATE_3B.y1, 0, h + 0.15, 0.16, { kind: 'pole', name: 'gate pole' });
  /* The side nets over the dugouts, lower than the backstop. */
  netRun(T, 'x', DUGOUT_1B.y0 - 0.35, GATE_1B.x1, 186, 0, 7, 4, 'side net');
  netRun(T, 'y', DUGOUT_3B.x0 - 0.35, GATE_3B.y1, 126, 0, 7, 4, 'side net');
}

/*
 * A dugout in its own frame: `F` is a face frame whose u runs along the
 * bench and v from the back wall out to the field.
 */
function dugout(F, len, depth, d, team) {
  const wallT = 0.2;
  /* The back wall, the slab roof on it and on the front posts, the front
   * wall: concrete, the town's. */
  F.box('pkConcrete', 0, -wallT, 0, len, 0, d.roof + 0.15, { kind: 'wall', name: 'dugout back' });
  F.box('pkConcreteMid', -0.25, -wallT, d.roof, len + 0.25, depth + 0.35, d.roof + 0.18, { kind: 'wall', name: 'dugout roof' });
  F.box('pkConcrete', 0, depth - wallT, 0, len, depth, d.front, { kind: 'wall', name: 'dugout front' });
  for (let k = 0; k <= 4; k += 1) {
    const u = 0.15 + ((len - 0.3) * k) / 4;
    F.post('pkFenceGreen', u, depth - wallT / 2, d.front, d.roof, 0.07, { kind: 'pole', name: 'dugout post' });
  }
  /* The bench along the back wall, solid; the slats on it drawn. */
  F.box('pkWood', 0.2, 0, 0, len - 0.2, 0.42, d.bench, { kind: 'wall', name: 'dugout bench' });
  /* The fascia, in the team's colour, and its lettering on the roof's edge. */
  F.deco(team, -0.25, depth + 0.33, d.roof - 0.05, len + 0.25, depth + 0.4, d.roof + 0.2);
  /* The floor, a step down in colour. */
  F.paint('pkConcreteDark', 0, 0, 0.005, len, depth - wallT, 0.02);
}

function dugouts(T, frame) {
  const d1 = DUGOUT_1B;
  dugout(frame(T, d1.x0, d1.y0, 's'), d1.x1 - d1.x0, d1.y1 - d1.y0 + 0.2, d1, 'pkPlayBlue');
  const d3 = DUGOUT_3B;
  /* u runs south from its north end, v east from the back wall. */
  dugout(frame(T, d3.x0, d3.y1, 'w'), d3.y1 - d3.y0, d3.x1 - d3.x0 + 0.2, d3, 'pkPlayRed');
  T.dress(() => {
    /* Inside: a bat rack, a helmet box, a water cooler, a broom, a bucket. */
    const kit = (x, y, alongX) => {
      if (alongX) {
        T.box('pkWoodDark', x, y, 0, x + 1.2, y + 0.3, 1.0);
        for (let k = 0; k < 6; k += 1) {
          T.cyl('pkSteel', [x + 0.12 + k * 0.18, y + 0.15, 0.1], [x + 0.14 + k * 0.18, y + 0.24, 0.95], 0.03, 5);
        }
        T.box('pkPlayYellow', x + 1.5, y, 0.45, x + 1.9, y + 0.35, 0.8);
        T.cyl('pkPlayBlue', [x + 2.4, y + 0.2, 0.45], [x + 2.4, y + 0.2, 0.9], 0.16, 10);
        T.cyl('pkBlue', [x + 3.0, y + 0.2, 0], [x + 3.0, y + 0.2, 0.3], 0.14, 8);
      } else {
        T.box('pkWoodDark', x, y - 1.2, 0, x + 0.3, y, 1.0);
        for (let k = 0; k < 6; k += 1) {
          T.cyl('pkSteel', [x + 0.15, y - 0.12 - k * 0.18, 0.1], [x + 0.24, y - 0.14 - k * 0.18, 0.95], 0.03, 5);
        }
        T.box('pkPlayYellow', x, y - 1.9, 0.45, x + 0.35, y - 1.5, 0.8);
        T.cyl('pkPlayRed', [x + 0.2, y - 2.4, 0.45], [x + 0.2, y - 2.4, 0.9], 0.16, 10);
        T.cyl('pkBlue', [x + 0.2, y - 3.0, 0], [x + 0.2, y - 3.0, 0.3], 0.14, 8);
      }
    };
    kit(d1.x0 + 6.5, d1.y0 + 0.45, true);
    kit(d3.x0 + 0.45, d3.y1 - 6.5, false);
  });
}

/* The outfield fence along the park's edge, its foul poles, the low fences
 * that close the foul ground, and the ball stop net behind it all. */
function fences(T) {
  const { x0, x1, y0, y1, h } = FENCE;
  lowFence(T, 'y', x1, y0, y1, h, 'outfield fence');
  lowFence(T, 'x', y1, x0, x1, h, 'outfield fence');
  lowFence(T, 'x', y0, 186, x1, h, 'foul fence');
  lowFence(T, 'y', x0, 126, y1, h, 'foul fence');
  /* The foul poles, yellow, eight metres: solid. */
  T.post('pkPlayYellow', x1 - 0.4, HOME.py + 0.25, 0, 8, 0.11, { kind: 'pole', name: 'foul pole' });
  T.post('pkPlayYellow', HOME.px + 0.25, y1 - 0.4, 0, 8, 0.11, { kind: 'pole', name: 'foul pole' });
  T.deco('pkPlayYellow', x1 - 0.42, HOME.py + 0.3, 3, x1 - 0.38, HOME.py + 1.4, 7.6);
  T.deco('pkPlayYellow', HOME.px + 0.3, y1 - 0.42, 3, HOME.px + 1.4, y1 - 0.38, 7.6);
  /* The ball stop net, fourteen metres, round the outfield. */
  netRun(T, 'y', BIG_NET.x, 70, BIG_NET.y, 0, BIG_NET.h, 8, 'ball net', 0, 0.2);
  netRun(T, 'x', BIG_NET.y, 128, BIG_NET.x, 0, BIG_NET.h, 8, 'ball net', 0, 0.2);
  /* The yardage boards, painted on the fence. */
  T.sign('pkDist82', x1 - 0.06, HOME.py + 3, 1.5, 1.4, 0.7, 'w');
  T.sign('pkDist82', HOME.px + 3, y1 - 0.06, 1.5, 1.4, 0.7, 's');
}

/* The scoreboard on its legs: a board, its frame, its catwalk, its lamps. */
function scoreboard(T) {
  const { x0, x1, py, lift, h, t } = SCOREBOARD;
  const top = lift + h;
  T.box('pkBoard', x0, py - t / 2, lift, x1, py + t / 2, top, { kind: 'wall', name: 'scoreboard' });
  T.deco('pkSteelDark', x0 - 0.1, py - t / 2 - 0.06, top - 0.05, x1 + 0.1, py + t / 2 + 0.06, top + 0.12);
  T.deco('pkSteelDark', x0 - 0.1, py - t / 2 - 0.06, lift - 0.12, x1 + 0.1, py + t / 2 + 0.06, lift + 0.05);
  for (const x of [x0 + 1.2, x1 - 1.2]) {
    T.post('pkSteelDark', x, py + 0.1, 0, lift, 0.18, { kind: 'pole', name: 'scoreboard leg' });
  }
  T.sign('pkScore', (x0 + x1) / 2, py - t / 2, lift + h / 2, x1 - x0 - 0.3, h - 0.3, 's');
  /* The catwalk behind and the ladder up to it. */
  T.deco('pkSteel', x0, py + t / 2, lift - 0.1, x1, py + t / 2 + 0.8, lift, true);
  for (let k = 0; k < 9; k += 1) {
    T.cyl('pkSteel', [x1 - 0.6, py + t / 2 + 0.7, 0.3 + k * 0.25], [x1 - 0.1, py + t / 2 + 0.7, 0.3 + k * 0.25], 0.02, 4, null, true);
  }
  T.cyl('pkSteel', [x1 - 0.6, py + t / 2 + 0.7, 0], [x1 - 0.6, py + t / 2 + 0.7, lift], 0.03, 4, null, true);
  T.cyl('pkSteel', [x1 - 0.1, py + t / 2 + 0.7, 0], [x1 - 0.1, py + t / 2 + 0.7, lift], 0.03, 4, null, true);
}

/* A floodlight mast: a tapered pole, a platform and a frame of lamps
 * turned toward the infield. The head is solid. */
function mast(T, m) {
  const top = 18;
  T.cap('pkSteel', [m.px, m.py, 0], [m.px, m.py, top], 0.3, { kind: 'pole', name: 'floodlight mast', rTop: 0.18, seg: 10 });
  T.disc('pkConcreteMid', m.px, m.py, 0.7, 0, 0.35, 12);
  const sx = m.face.includes('e') ? 1 : -1;
  const sy = m.face.includes('n') ? 1 : -1;
  /* The head: a frame 3.6 by 2.4, set off the pole toward the field. */
  const cx = m.px + sx * 0.5;
  const cy = m.py + sy * 0.5;
  T.box('pkSteelDark', cx - 1.8, cy - 0.35, top, cx + 1.8, cy + 0.35, top + 2.4, { kind: 'wall', name: 'floodlight head' });
  T.box('pkSteel', m.px - 1.2, m.py - 1.0, top - 0.25, m.px + 1.2, m.py + 1.0, top - 0.1, { kind: 'wall', name: 'floodlight deck' });
  const face = sy > 0 ? 'n' : 's';
  const fy = cy + sy * 0.36;
  for (let r = 0; r < 3; r += 1) {
    for (let c = 0; c < 5; c += 1) {
      T.sign('pkFlood', cx - 1.44 + c * 0.72, fy, top + 0.4 + r * 0.8, 0.62, 0.62, face, 0.01);
    }
  }
  /* The rungs up the pole, drawn. */
  for (let k = 1; k < 30; k += 1) {
    T.cyl('pkSteelDark', [m.px - 0.15, m.py - sy * 0.33, k * 0.58], [m.px + 0.15, m.py - sy * 0.33, k * 0.58], 0.018, 4, null, true);
  }
}

/* Three rows of concrete steps behind the first base side net, for the
 * parents, with the shade of a tin roof over them. */
function stands(T) {
  const x0 = 175;
  const x1 = 198;
  const y = 77.2;
  for (let k = 0; k < 3; k += 1) {
    T.box('pkConcreteMid', x0, y - 2.4 + k * 0.8, 0, x1, y - 2.4 + (k + 1) * 0.8, 0.42 * (3 - k), { kind: 'wall', name: 'stand step' });
  }
  T.dress(() => {
    for (let k = 0; k < 3; k += 1) {
      T.box('pkPlayBlue', x0 + 0.4, y - 2.4 + k * 0.8 + 0.2, 0.42 * (3 - k), x1 - 0.4, y - 2.4 + k * 0.8 + 0.5, 0.42 * (3 - k) + 0.05);
    }
  });
}

/* The whole ground. `frame` is ./frame.js faceFrame. */
export function ballfield(T, frame) {
  groundPaint(T);
  backstop(T);
  dugouts(T, frame);
  fences(T);
  scoreboard(T);
  for (const m of MASTS) {
    mast(T, m);
  }
  stands(T);
  /* The team names over the dugouts. */
  T.sign('pkTeam1', (DUGOUT_1B.x0 + DUGOUT_1B.x1) / 2, DUGOUT_1B.y1 + 0.61, DUGOUT_1B.roof + 0.07, 4.2, 0.24, 'n');
  T.sign('pkTeam3', DUGOUT_3B.x1 + 0.61, (DUGOUT_3B.y0 + DUGOUT_3B.y1) / 2, DUGOUT_3B.roof + 0.07, 4.2, 0.24, 'e');
}
