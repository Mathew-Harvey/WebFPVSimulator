/*
 * festival.js: the balloon meet. The launch field in front of the start,
 * its balloons standing, tethered and lying out to be filled, the crew's
 * corner to the west with the meet's tent and a wooden lookout tower, and
 * the sponsors' boards round the field.
 *
 * THE BALLOONS ARE A LINE TO FLY, and it climbs. Two stand on their
 * baskets in front of the start, 26 m apart at the centres, so the first
 * line is up and between them. Then a pair tethered with their baskets
 * 12 m up, then a pair at 26 m, each pair a gate of air between two
 * envelopes, and last a stack: one tethered at 28 m and another straight
 * over it at 58 m, with a slot of sky between the lower one's crown and
 * the upper one's basket. That is the chase line: a pilot who flies it in
 * order climbs from the grass to sixty metres through four gates, and the
 * last is the hardest. A tethered balloon flies on three lines to stakes
 * in the grass, the way a meet's tethered rides are held; the lines are
 * drawn and never solid, as every wire on every map is.
 *
 * THE BALLOONS DO NOT MOVE. A tethered balloon rides a little on its
 * lines; these stand still, because a solid that moved would have to move
 * in the physics too, and a balloon that a pilot hits where it is not
 * drawn is worse than one that never sways. The burners' flames move,
 * and they are only drawn (./index.js).
 *
 * Every number is in the plan's frame (./frame.js): px east, py north, h
 * up, metres.
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
import {
  BASKET, MOUTH_H, ENVELOPE_R, WAIST_H, THROAT_R, THROAT_H, ENVELOPE_H,
} from './envelope.js';
import { sincos } from '../../props/trig.js';

/* Where the pilot starts: on the grass south of the field, facing north. */
export const PADS = { px: 320, py: 112 };

/* The launch field, mown in stripes. */
export const FIELD = { x0: 140, x1: 460, y0: 140, y1: 520 };

/*
 * THE BALLOONS. `hb` is the basket's floor. Pairs are 26 m apart at the
 * centres, so with the envelopes 15.6 m across there are 10.4 m of air
 * between them at the waist. The stack's upper basket is 58 m up and its
 * lower crown 50.25 m, a slot of 7.75 m.
 */
export const BALLOONS = [
  { key: 'gateW', px: 307, py: 200, hb: 0, design: 'sunrise' },
  { key: 'gateE', px: 333, py: 200, hb: 0, design: 'ocean' },
  { key: 'lowW', px: 247, py: 300, hb: 12, design: 'candy' },
  { key: 'lowE', px: 273, py: 300, hb: 12, design: 'harvest' },
  { key: 'skyW', px: 352, py: 392, hb: 26, design: 'forest' },
  { key: 'skyE', px: 378, py: 392, hb: 26, design: 'rainbow' },
  { key: 'stackLo', px: 292, py: 480, hb: 28, design: 'cream' },
  { key: 'stackHi', px: 292, py: 480, hb: 58, design: 'night' },
];

/* The two lying out on the grass with the fan blowing them up: the mouth's
 * plan point, the way the crown lies ('w' or 'e'), and the design. */
export const LYING = [
  { px: 196, py: 228, dir: 'w', design: 'rainbow' },
  { px: 202, py: 372, dir: 'w', design: 'sunrise' },
];

const byKey = (k) => BALLOONS.find((b) => b.key === k);

/* The four gates of the chase line, for the named gaps (./plan.js). */
export function balloonGates() {
  const pair = (a, b) => {
    const A = byKey(a);
    const B = byKey(b);
    const hm = A.hb + MOUTH_H;
    return { px: (A.px + B.px) / 2, py: A.py, w: Math.abs(B.px - A.px) - 2 * 7.8, h0: hm + 8.5, h1: hm + 13.5 };
  };
  const lo = byKey('stackLo');
  const hi = byKey('stackHi');
  return {
    gate: pair('gateW', 'gateE'),
    low: pair('lowW', 'lowE'),
    sky: pair('skyW', 'skyE'),
    stack: { px: lo.px, py: lo.py, w: 12, h0: lo.hb + MOUTH_H + ENVELOPE_H, h1: hi.hb },
  };
}

/* The top basket's north face, where the hidden sign goes (./plan.js). */
export function topBasket() {
  const b = byKey('stackHi');
  return { px: b.px, py: b.py + BASKET.d / 2, h: b.hb + 0.6 };
}

/*
 * A balloon: basket, burner and frame, the load lines to the mouth, the
 * mouth's ring and its skirt, and the envelope's solids. The envelope
 * itself is drawn by ./index.js from T.envelopes.
 */
function balloon(T, b) {
  const { px, py, hb } = b;
  const hm = hb + MOUTH_H;
  const bw = BASKET.w / 2;
  const bd = BASKET.d / 2;
  /* The basket: wicker, its leather rim and its four corner posts. */
  T.box('kzWicker', px - bw, py - bd, hb, px + bw, py + bd, hb + BASKET.h, { name: 'basket' });
  T.deco('kzLeather', px - bw - 0.04, py - bd - 0.04, hb + BASKET.h - 0.1, px + bw + 0.04, py + bd + 0.04, hb + BASKET.h + 0.04);
  T.deco('kzLeather', px - bw - 0.03, py - bd - 0.03, hb - 0.02, px + bw + 0.03, py + bd + 0.03, hb + 0.12);
  /* The burner's frame on four rods, and the burner: two coils. */
  const fh = hb + BASKET.h + 1.05;
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    T.cyl('kzSteel', [px + sx * (bw - 0.06), py + sy * (bd - 0.06), hb + BASKET.h], [px + sx * 0.42, py + sy * 0.42, fh], 0.025, 5);
  }
  T.deco('kzSteel', px - 0.48, py - 0.48, fh - 0.04, px + 0.48, py + 0.48, fh + 0.04);
  T.post('kzSteel', px, py, fh - 0.2, fh + 0.25, 0.26, { name: 'burner' });
  T.disc('kzIron', px - 0.14, py, 0.13, fh + 0.25, fh + 0.42, 10);
  T.disc('kzIron', px + 0.14, py, 0.13, fh + 0.25, fh + 0.42, 10);
  /* The load lines, from the basket's corners to the mouth's ring. */
  const SC = { s: 0, c: 1 };
  for (let k = 0; k < 8; k += 1) {
    sincos((k * Math.PI) / 4 + Math.PI / 8, SC);
    const corner = [px + (SC.c > 0 ? bw : -bw), py + (SC.s > 0 ? bd : -bd), hb + BASKET.h];
    T.cyl('kzIron', corner, [px + 2.2 * SC.c, py + 2.2 * SC.s, hm], 0.018, 4);
  }
  /* The mouth's ring and the skirt of fireproof cloth under it. */
  T.torus('kzIron', px, py, hm, 2.2, 0.05, 0, 0, 5, 24);
  T.shell('kzIron', px, py, hm - 0.9, hm, 2.0, 2.2, false, null, 24);
  /* The envelope: drawn by the map, solid as two balls inside it. */
  T.envelopes.push({ px, py, hm, design: b.design });
  T.cap('kzRed', [px, py, hm + WAIST_H], [px, py, hm + WAIST_H], ENVELOPE_R, { draw: false, name: 'envelope' });
  T.cap('kzRed', [px, py, hm + THROAT_H], [px, py, hm + THROAT_H], THROAT_R, { draw: false, name: 'envelope' });
  /* A tethered balloon: three lines to stakes in the grass, a third of a
   * turn apart, far enough out to clear any envelope under it. */
  if (hb > 0) {
    const reach = 10 + hb * 0.55;
    for (let k = 0; k < 3; k += 1) {
      sincos((k * 2 * Math.PI) / 3 + Math.PI / 2, SC);
      const sx = px + reach * SC.c;
      const sy = py + reach * SC.s;
      T.wire('kzIron', [px + bw * Math.sign(SC.c), py + bd * Math.sign(SC.s), hb], [sx, sy, 0.6], 0.6, 0.025);
      T.post('kzSteel', sx, sy, 0, 0.6, 0.05, { solid: false });
      T.deco('kzYellow', sx - 0.35, sy - 0.35, 0, sx + 0.35, sy + 0.35, 0.08);
      T.take(sx, sy, 1.2);
    }
  }
  T.take(px, py, 2.0);
}

/* One lying out with the fan: the envelope on its side, its crown away
 * from the fan, a crew's tarp under it, the fan and the basket on its
 * side at the mouth. */
function lying(T, l) {
  const s = l.dir === 'w' ? -1 : 1;
  const { px, py } = l;
  T.lying.push(l);
  /* The tarp the envelope is laid out on. */
  T.paint('kzCanvas', px + s * 2, py - 9, 0.01, px + s * 26, py + 9, 0.03);
  /* Solid: a capsule along the axis, inside the half filled cloth. */
  T.cap('kzRed', [px + s * 7, py, 3.6], [px + s * 14, py, 3.6], 3.0, { draw: false, name: 'envelope' });
  /* The basket on its side at the mouth, the burner toward the crown. */
  T.box('kzWicker', px - s * 0.2 - 0.6, py - 0.65, 0, px - s * 0.2 + 0.6, py + 0.65, 1.1, { name: 'basket' });
  T.deco('kzLeather', px - s * 0.2 - 0.62, py - 0.67, 0.92, px - s * 0.2 + 0.62, py + 0.67, 1.12);
  /* The inflator fan: a ring in a frame on wheels, its engine behind. */
  const fx = px - s * 3.2;
  T.torus('kzSteel', fx, py, 0.95, 0.85, 0.07, s, 0, 6, 20);
  T.disc('kzIron', fx - s * 0.1, py, 0.12, 0.85, 1.05, 8);
  T.box('kzOrange', fx - s * 0.55 - 0.35, py - 0.3, 0.2, fx - s * 0.55 + 0.35, py + 0.3, 0.75, { name: 'fan engine' });
  T.box('kzIron', fx - 0.6, py - 0.75, 0.1, fx + 0.6, py + 0.75, 0.2, { solid: false });
  T.take(fx, py, 1.5);
}

/*
 * THE CREW'S CORNER, west of the field: the meet's tent, the trailers the
 * balloons came in, a windsock, and the lookout tower, a yagura of logs
 * whose deck a pilot flies under, between its legs, north and south.
 */
export const YAGURA = { px: 104, py: 300, half: 1.8, deck: 7.6, roof: 11.0 };
export const TENT = { x0: 40, x1: 76, y0: 180, y1: 196 };

function crew(T) {
  const r = rng(4101);
  /* The meet's marquee: white canvas on poles, its walls rolled up on the
   * field side, a peaked roof on top. */
  const { x0, x1, y0, y1 } = TENT;
  const eave = 3.0;
  const ridge = 5.4;
  for (let x = x0; x <= x1 + 1e-6; x += 4) {
    for (const y of [y0, y1]) {
      T.post('kzWhite', x, y, 0, eave, 0.06);
    }
  }
  /* The back wall is canvas to the ground, the front open. */
  T.box('kzCanvas', x0, y1 - 0.05, 0, x1, y1, eave, { name: 'tent wall' });
  T.box('kzCanvas', x0, y0, 0, x0 + 0.05, y1, eave, { name: 'tent wall' });
  T.box('kzCanvas', x1 - 0.05, y0, 0, x1, y1, eave, { name: 'tent wall' });
  /* The roof: two slopes along x, solid as steps inside them. */
  const mid = (y0 + y1) / 2;
  T.prism('kzCanvas', 'x', [[y0 - 0.3, eave - 0.05], [mid, ridge], [y1 + 0.3, eave - 0.05], [y1 + 0.3, eave - 0.2], [mid, ridge - 0.15], [y0 - 0.3, eave - 0.2]], x0 - 0.3, x1 + 0.3);
  for (let k = 0; k < 4; k += 1) {
    const f = (k + 1) / 4;
    const hh = eave + (ridge - eave) * f;
    const inset = ((y1 - y0) / 2) * f;
    T.hidden(x0, y0 + inset - 0.2, eave + ((ridge - eave) * k) / 4, x1, y1 - inset + 0.2, hh - 0.3, 'wall', 'tent roof');
  }
  /* The red scallop along the eaves on the field side. */
  for (let x = x0; x < x1; x += 2) {
    T.deco(x % 4 === 0 ? 'kzRed' : 'kzWhite', x, y0 - 0.32, eave - 0.6, x + 2, y0 - 0.28, eave - 0.05);
  }
  /* Inside: trestle tables, folding chairs, a tea urn, a map board. */
  T.dress(() => {
    for (let x = x0 + 3; x < x1 - 3; x += 7) {
      T.box('kzWhite', x, y0 + 7, 0.72, x + 4, y0 + 8.2, 0.78);
      for (const lx of [x + 0.2, x + 3.8]) {
        T.post('kzSteel', lx, y0 + 7.6, 0, 0.72, 0.03);
      }
      for (let c = 0; c < 3; c += 1) {
        T.box('kzBlue', x + 0.4 + c * 1.3, y0 + 6.1, 0.42, x + 0.9 + c * 1.3, y0 + 6.6, 0.46);
        T.box('kzBlue', x + 0.4 + c * 1.3, y0 + 6.05, 0.46, x + 0.9 + c * 1.3, y0 + 6.1, 0.9);
      }
    }
    T.post('kzSteel', x1 - 2, y1 - 1.5, 0, 0.9, 0.22);
    T.box('kzWhite', x0 + 1, y1 - 0.4, 0.8, x0 + 4, y1 - 0.1, 2.4);
  });
  T.take((x0 + x1) / 2, (y0 + y1) / 2, 18);

  /* The trailers the balloons came in, and the crew's vans beside them. */
  for (let i = 0; i < 5; i += 1) {
    const ty = 222 + i * 16;
    const tx = 44;
    T.box('kzWhite', tx, ty, 0.55, tx + 2.3, ty + 5.2, 2.4, { name: 'trailer' });
    T.box(r.pick(['kzRed', 'kzBlue', 'kzOrange', 'kzTeal']), tx - 0.02, ty + 0.3, 1.5, tx + 2.32, ty + 4.9, 1.75, { solid: false });
    T.box('kzIron', tx + 0.2, ty + 5.2, 0.45, tx + 2.1, ty + 6.6, 0.6, { solid: false });
    for (const wy of [ty + 2.0, ty + 3.0]) {
      T.cyl('kzTyre', [tx - 0.05, wy, 0.33], [tx + 2.35, wy, 0.33], 0.33, 10);
    }
    T.asset({ type: 'car', style: r.pick(['keivan', 'kei', 'van', 'minivan']), dims: { variant: r.int(1, 12) } }, 1, tx + 6.5, ty + 2.6, 0, Math.PI / 2);
  }
  /* The windsock on its mast, by the field's edge. */
  T.post('kzWhite', 130, 152, 0, 8, 0.06, { name: 'windsock mast' });
  T.cyl('kzOrange', [130, 152, 7.6], [130 + 0.7, 152 + 0.5, 7.4], 0.32, 10, 0.26);
  T.cyl('kzWhite', [130.7, 152.5, 7.4], [131.4, 153.0, 7.2], 0.26, 10, 0.2);
  T.cyl('kzOrange', [131.4, 153.0, 7.2], [132.1, 153.5, 7.0], 0.2, 10, 0.14);
  T.take(130, 152, 1.0);

  /* The yagura: four log legs leaning in, a deck, a rail, a roof of bark,
   * braced across east and west only so north and south stay open. */
  const Y = YAGURA;
  const legs = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const [sx, sy] of legs) {
    T.cap('kzWoodDark', [Y.px + sx * (Y.half + 0.5), Y.py + sy * (Y.half + 0.5), 0], [Y.px + sx * Y.half, Y.py + sy * Y.half, Y.roof - 0.4], 0.16, { name: 'yagura leg' });
  }
  for (const sx of [-1, 1]) {
    for (const [h0, h1] of [[0.6, 3.8], [3.8, 7.2]]) {
      T.cap('kzWood', [Y.px + sx * (Y.half + 0.4), Y.py - Y.half - 0.4, h0], [Y.px + sx * (Y.half + 0.3), Y.py + Y.half + 0.3, h1], 0.07, { name: 'yagura brace' });
    }
  }
  T.box('kzWood', Y.px - Y.half - 0.6, Y.py - Y.half - 0.6, Y.deck, Y.px + Y.half + 0.6, Y.py + Y.half + 0.6, Y.deck + 0.25, { name: 'yagura deck' });
  for (const [sx, sy, ex, ey] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]]) {
    const ax = Y.px + sx * (Y.half + 0.55);
    const ay = Y.py + sy * (Y.half + 0.55);
    const bx = Y.px + ex * (Y.half + 0.55);
    const by = Y.py + ey * (Y.half + 0.55);
    T.cap('kzWood', [ax, ay, Y.deck + 1.05], [bx, by, Y.deck + 1.05], 0.05, { name: 'yagura rail' });
  }
  T.box('kzWoodDark', Y.px - Y.half - 1.0, Y.py - Y.half - 1.0, Y.roof - 0.4, Y.px + Y.half + 1.0, Y.py + Y.half + 1.0, Y.roof - 0.15, { name: 'yagura roof' });
  T.frustum('kzWoodDark', { x0: Y.px - Y.half - 1.0, y0: Y.py - Y.half - 1.0, x1: Y.px + Y.half + 1.0, y1: Y.py + Y.half + 1.0 }, Y.roof - 0.15, { x0: Y.px - 0.3, y0: Y.py - 0.3, x1: Y.px + 0.3, y1: Y.py + 0.3 }, Y.roof + 1.4);
  T.frustumSolid({ x0: Y.px - Y.half - 0.6, y0: Y.py - Y.half - 0.6, x1: Y.px + Y.half + 0.6, y1: Y.py + Y.half + 0.6 }, Y.roof - 0.15, { x0: Y.px - 0.5, y0: Y.py - 0.5, x1: Y.px + 0.5, y1: Y.py + 0.5 }, Y.roof + 1.0, 3, 'yagura roof');
  /* The meet's banner hung from the deck rail, and a lantern at each corner. */
  T.sign('meetBanner', Y.px, Y.py - Y.half - 0.62, Y.deck - 0.55, 3.6, 0.9, 's');
  for (const [sx, sy] of legs) {
    T.ball('kzLantern', Y.px + sx * (Y.half + 0.6), Y.py + sy * (Y.half + 0.6), Y.deck - 0.4, 0.22);
  }
  T.take(Y.px, Y.py, 4);
}

/*
 * THE SPONSORS' BOARDS, round the field the way a meet hangs them: a
 * printed board on two posts, high enough to fly under, facing the field.
 * The pipeline paints a brand on each (`markSpots`, ./plan.js).
 */
export const BOARD = { w: 4.8, h: 2.4, t: 0.12, lift: 2.4 };
export const BOARDS = [
  { px: 150, py: 250, face: 'e' },
  { px: 150, py: 330, face: 'e' },
  { px: 150, py: 410, face: 'e' },
  { px: 452, py: 250, face: 'w' },
  { px: 452, py: 330, face: 'w' },
  { px: 452, py: 410, face: 'w' },
  { px: 250, py: 150, face: 'n' },
  { px: 390, py: 150, face: 'n' },
];

function board(T, b) {
  const alongX = b.face === 'n' || b.face === 's';
  const hw = BOARD.w / 2;
  const ht = BOARD.t / 2;
  const top = BOARD.lift + BOARD.h;
  if (alongX) {
    T.box('kzWhite', b.px - hw, b.py - ht, BOARD.lift, b.px + hw, b.py + ht, top, { name: 'sponsor board' });
    for (const s of [-1, 1]) {
      T.post('kzSteel', b.px + s * (hw - 0.3), b.py - (b.face === 'n' ? 0.12 : -0.12), 0, top - 0.1, 0.05);
    }
  } else {
    T.box('kzWhite', b.px - ht, b.py - hw, BOARD.lift, b.px + ht, b.py + hw, top, { name: 'sponsor board' });
    for (const s of [-1, 1]) {
      T.post('kzSteel', b.px - (b.face === 'e' ? 0.12 : -0.12), b.py + s * (hw - 0.3), 0, top - 0.1, 0.05);
    }
  }
  T.take(b.px, b.py, hw + 0.5);
}

/*
 * The field: mown in stripes (paint, at every range), its edge of rope on
 * short stakes, the boards, the balloons, the crew's corner.
 */
export function festival(T) {
  const { x0, x1, y0, y1 } = FIELD;
  T.dress(() => T.wide(() => {
    for (let x = x0; x < x1; x += 10) {
      if ((x - x0) % 20 === 0) {
        T.paint('kzMown', x, y0, 0.006, x + 10, y1, 0.012);
      }
    }
  }));
  /* The rope round the field on stakes every 10 m, drawn only. */
  const stakes = [];
  for (let x = x0; x <= x1; x += 10) {
    stakes.push([x, y0]);
  }
  for (let y = y0 + 10; y <= y1; y += 10) {
    stakes.push([x1, y]);
  }
  for (let x = x1 - 10; x >= x0; x -= 10) {
    stakes.push([x, y1]);
  }
  for (let y = y1 - 10; y > y0; y -= 10) {
    stakes.push([x0, y]);
  }
  T.dress(() => {
    stakes.forEach(([sx, sy], i) => {
      /* No stake on the start's line in, nor on the farm road's. */
      if (Math.abs(sx - PADS.px) < 14 && sy === y0) {
        return;
      }
      T.post('kzWhite', sx, sy, 0, 0.9, 0.035);
      const [nx, ny] = stakes[(i + 1) % stakes.length];
      if (!(Math.abs(nx - PADS.px) < 14 && ny === y0)) {
        T.cyl(i % 2 ? 'kzRed' : 'kzWhite', [sx, sy, 0.85], [nx, ny, 0.85], 0.015, 4);
      }
    });
  });
  for (const b of BOARDS) {
    board(T, b);
  }
  for (const b of BALLOONS) {
    balloon(T, b);
  }
  for (const l of LYING) {
    lying(T, l);
  }
  crew(T);
  /* The start's mats sit on a square of matting, and a crew's chase
   * truck and its trailer wait by the field's south edge. */
  T.dress(() => T.wide(() => {
    T.paint('kzGravel', PADS.px - 5, PADS.py - 3.5, 0.006, PADS.px + 5, PADS.py + 3.5, 0.012);
  }));
}
