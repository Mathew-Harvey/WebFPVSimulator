/*
 * sea.js: everything of Hyoura Island that stands in the sea. The drift ice
 * (a thousand floes, with the leads between them left open, seals hauled
 * out on a few), the icebergs and their arch, the basalt sea stack called
 * the Needle, the sea arch at the foot of the north cliff, and the falls
 * that pour out of the cliff face beside the grotto.
 *
 * THE REAL PLACE behind it is the Shiretoko coast of Hokkaido in February:
 * drift ice that comes down from the Sea of Okhotsk and packs the bays in
 * pans of a few metres to a few tens of metres, with dark leads of open
 * water between them; columnar basalt cliffs of 100 m to 200 m along the
 * north shore; and the falls there that come out of the face of the cliff
 * rather than over its top, because they are ground water seeping out of
 * the lava. The icebergs are our own: the Okhotsk ice is pack ice, not
 * bergs, and the brief asked for arches to fly, so the bergs here are the
 * tabular kind, weathered into tiers and cut through by the sea.
 *
 * EVERY SOLID IS A BOX, and every box is drawn: a floe or an iceberg's tier
 * is drawn as a polygon inscribed in its box with its corners cut (polyOf),
 * and its solid is the box shrunk by half the largest cut, which the
 * polygon contains. So a craft that touches ice touches ice it can see, and
 * a corner it clips was never there. The basalt is columns, each its own
 * box and drawn as one.
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

import { rng } from './frame.js';
import { noise, CELL, GX0, GZ0, isTopCell } from './terrain.js';

/* ---- the named places in the sea ---- */

/* The arch berg: two legs and the span between them, flown north to south. */
export const ARCH = {
  legA: { x0: 306, x1: 320, z0: 48, z1: 74, h: 34 },
  legB: { x0: 340, x1: 354, z0: 46, z1: 72, h: 30 },
  span: { x0: 316, x1: 344, z0: 51, z1: 69, y0: 19, y1: 31 },
};
/* The twin bergs and the slot between them. */
export const TWINS = {
  a: { x0: 282, x1: 296, z0: 130, z1: 146, h: 27 },
  b: { x0: 303, x1: 316, z0: 128, z1: 144, h: 22 },
};
/* The Needle: a stack of basalt columns off the north cliff. */
export const NEEDLE = { x0: -160, x1: -140, z0: -230, z1: -214, h: 74 };
/* The sea arch: a fin of basalt out from the cliff, the sea through it. */
export const SEA_ARCH = { x0: -104, x1: -96, z0: -232, z1: -201, hole0: -226, hole1: -211, holeH: 16 };
/* The falls: x0 to x1 along the face at z = FACE, leaving it at TOP. */
export const FALLS = { x0: -58, x1: -48, face: -204, top: 118 };

/* The other bergs, [x, z, w, d, h, seed]. */
const BERGS = [
  [398, -32, 46, 34, 30, 11], [262, 196, 20, 14, 14, 12], [432, 150, 26, 22, 20, 13],
  [222, -176, 24, 20, 22, 14], [336, -150, 30, 26, 27, 15], [-60, -296, 30, 22, 24, 16],
  [-252, -282, 22, 18, 16, 17], [122, 262, 18, 16, 12, 18], [-180, 230, 26, 18, 15, 19],
  [470, 30, 20, 30, 18, 20],
];

/* Rectangles where no floe floats: the harbour and its mouth, the bergs,
 * the stack and the arch, with room round each. */
function keepOut() {
  const out = [
    { x0: 12, x1: 145, z0: 96, z1: 190 },
    { x0: ARCH.legA.x0 - 6, x1: ARCH.legB.x1 + 6, z0: 40, z1: 80 },
    { x0: TWINS.a.x0 - 6, x1: TWINS.b.x1 + 6, z0: 122, z1: 152 },
    { x0: NEEDLE.x0 - 8, x1: NEEDLE.x1 + 8, z0: NEEDLE.z0 - 8, z1: -200 },
    { x0: SEA_ARCH.x0 - 10, x1: SEA_ARCH.x1 + 10, z0: SEA_ARCH.z0 - 8, z1: -200 },
    { x0: FALLS.x0 - 12, x1: -28, z0: -224, z1: -200 },
  ];
  for (const [x, z, w, d] of BERGS) {
    out.push({ x0: x - w / 2 - 6, x1: x + w / 2 + 6, z0: z - d / 2 - 6, z1: z + d / 2 + 6 });
  }
  return out;
}

/*
 * A POLYGON INSCRIBED IN A BOX, its four corners cut by their own share of
 * the shorter side, and the solid box it contains: [pts, inner].
 */
function polyOf(r, x0, z0, x1, z1, cut = [0.12, 0.34]) {
  const s = Math.min(x1 - x0, z1 - z0);
  const c = [0, 1, 2, 3].map(() => r.range(cut[0], cut[1]) * s);
  const pts = [
    [x0 + c[0], z0], [x1 - c[1], z0], [x1, z0 + c[1]], [x1, z1 - c[2]],
    [x1 - c[2], z1], [x0 + c[3], z1], [x0, z1 - c[3]], [x0, z0 + c[0]],
  ];
  const m = Math.max(...c) / 2;
  return [pts, { x0: x0 + m, z0: z0 + m, x1: x1 - m, z1: z1 - m }];
}

/* A tier of ice: drawn as its polygon, solid as the box inside it. */
function iceTier(I, r, b, y0, y1, top, name) {
  const [pts, inner] = polyOf(r, b.x0, b.z0, b.x1, b.z1);
  I.poly(top, 'arIce', pts, y0, y1);
  I.box('arIce', inner.x0, y0, inner.z0, inner.x1, y1, inner.z1, { draw: false, kind: 'rock', name });
  return { pts, inner };
}

/* The blue of a berg's cracks and melt lines, down a wall: paint, fine. */
function crevasses(I, r, b, y0, y1) {
  const n = r.int(2, 4);
  for (let k = 0; k < n; k += 1) {
    const side = r.int(0, 3);
    const t = r.range(0.25, 0.75);
    const w = r.range(0.5, 1.4);
    const top = y0 + (y1 - y0) * r.range(0.55, 0.95);
    if (side < 2) {
      const x = b.x0 + (b.x1 - b.x0) * t;
      const z = side === 0 ? b.z0 - 0.06 : b.z1 + 0.06;
      I.paint('arIceBlue', x - w / 2, y0 + 0.4, z - 0.05, x + w / 2, top, z + 0.05, true);
    } else {
      const z = b.z0 + (b.z1 - b.z0) * t;
      const x = side === 2 ? b.x0 - 0.06 : b.x1 + 0.06;
      I.paint('arIceBlue', x - 0.05, y0 + 0.4, z - w / 2, x + 0.05, top, z + w / 2, true);
    }
  }
}

/*
 * AN ICEBERG: tiers stepping in as they rise, a cap of snow, the sea line
 * worn into a darker band at its foot, and its cracks.
 */
function berg(I, x, z, w, d, h, seed) {
  const r = rng(seed);
  let b = { x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 };
  const tiers = h > 18 ? 3 : 2;
  let y = -2.5;
  for (let k = 0; k < tiers; k += 1) {
    const y1 = k === tiers - 1 ? h : y + (h - y) * r.range(0.45, 0.62);
    iceTier(I, r, b, y, y1, k === tiers - 1 ? 'arSnow' : 'arIce', 'iceberg');
    crevasses(I, r, b, Math.max(0, y), y1);
    y = y1;
    const ix = (b.x1 - b.x0) * r.range(0.1, 0.22);
    const iz = (b.z1 - b.z0) * r.range(0.1, 0.22);
    const sx = r.range(-0.5, 0.5) * ix;
    const sz = r.range(-0.5, 0.5) * iz;
    b = { x0: b.x0 + ix + sx, x1: b.x1 - ix + sx, z0: b.z0 + iz + sz, z1: b.z1 - iz + sz };
  }
  /* The wave cut at the water line, a dark band a little inside the foot. */
  const foot = { x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 };
  const [pts] = polyOf(r, foot.x0 + 0.5, foot.z0 + 0.5, foot.x1 - 0.5, foot.z1 - 0.5);
  I.poly('arIceDeep', 'arIceDeep', pts, -0.5, 1.1, true);
}

/* The arch berg: its two legs as bergs of their own, and the span. */
function archBerg(I) {
  const r = rng(41);
  for (const leg of [ARCH.legA, ARCH.legB]) {
    const mid = (leg.x0 + leg.x1) / 2;
    const lo = { x0: leg.x0, x1: leg.x1, z0: leg.z0, z1: leg.z1 };
    iceTier(I, r, lo, -2.5, ARCH.span.y1 + 0.5, 'arIce', 'arch leg');
    crevasses(I, r, lo, 0, ARCH.span.y0);
    const up = { x0: mid - (leg.x1 - leg.x0) * 0.36, x1: mid + (leg.x1 - leg.x0) * 0.36, z0: leg.z0 + 3, z1: leg.z1 - 3 };
    iceTier(I, r, up, ARCH.span.y1 + 0.5, leg.h, 'arSnow', 'arch leg');
  }
  const s = ARCH.span;
  iceTier(I, r, { x0: s.x0, x1: s.x1, z0: s.z0, z1: s.z1 }, s.y0, s.y1, 'arSnow', 'arch span');
  /* The span's underside, hung with icicles: fine. */
  I.dress(() => {
    for (let k = 0; k < 14; k += 1) {
      const x = r.range(ARCH.legA.x1 + 1, ARCH.legB.x0 - 1);
      const z = r.range(s.z0 + 2, s.z1 - 2);
      I.cone('arIcicle', x, s.y0 - r.range(0.8, 2.6), z, r.range(0.18, 0.4), -r.range(0.8, 2.6), 5);
    }
  });
}

/*
 * THE BASALT: a stack of columns, each a box from under the sea to its own
 * height, with a cap of snow. `w` is a column's width.
 */
function columns(I, b, h0, h1, w, seed, name, carve = null) {
  const r = rng(seed);
  const nx = Math.max(1, Math.round((b.x1 - b.x0) / w));
  const nz = Math.max(1, Math.round((b.z1 - b.z0) / w));
  const cw = (b.x1 - b.x0) / nx;
  const cd = (b.z1 - b.z0) / nz;
  for (let i = 0; i < nx; i += 1) {
    for (let j = 0; j < nz; j += 1) {
      const x0 = b.x0 + i * cw;
      const z0 = b.z0 + j * cd;
      const edge = Math.min(i, j, nx - 1 - i, nz - 1 - j);
      const top = (typeof h1 === 'function' ? h1(x0 + cw / 2, z0 + cd / 2) : h1) - (edge === 0 ? r.range(0, 9) : r.range(0, 3));
      const foot = carve ? carve(x0 + cw / 2, z0 + cd / 2) : h0;
      if (top - foot < 1) {
        continue;
      }
      I.box(r.chance(0.3) ? 'arBasaltPale' : 'arBasalt', x0, foot, z0, x0 + cw, top, z0 + cd, { kind: 'cliff', name });
      I.deco('arSnow', x0 - 0.08, top, z0 - 0.08, x0 + cw + 0.08, top + 0.45, z0 + cd + 0.08);
    }
  }
}

/* The falls: three strands from the slot in the face, out and down, the
 * spray at the foot and the ice on the face beside them. Drawn only. */
function falls(I) {
  const r = rng(51);
  const strands = [[FALLS.x0, FALLS.x0 + 3.2], [FALLS.x0 + 3.6, FALLS.x1 - 3.2], [FALLS.x1 - 2.8, FALLS.x1]];
  strands.forEach(([a, b], k) => {
    const out = 6.5 + k * 0.6;
    const left = [];
    const right = [];
    for (let s = 0; s <= 12; s += 1) {
      const t = s / 12;
      const y = FALLS.top - 2 - (FALLS.top - 2) * t;
      /* Out from the face fast, then near straight down. */
      const zz = FALLS.face - 0.6 - out * (1 - (1 - t) * (1 - t) * (1 - t) * (1 - t)) - 1.2 * t;
      left.push([a, y, zz]);
      right.push([b, y, zz]);
    }
    I.ribbon('arFall', left, right);
    I.ribbon('arFall', right, left);
  });
  /* The slot the water leaves by, dark, in the face. */
  I.paint('arIron', FALLS.x0 - 0.4, FALLS.top - 4, FALLS.face - 0.08, FALLS.x1 + 0.4, FALLS.top + 1.2, FALLS.face - 0.02);
  /* The spray: white heaps on the water. */
  for (let k = 0; k < 9; k += 1) {
    I.ball('arFoam', r.range(FALLS.x0 - 2, FALLS.x1 + 2), r.range(0.3, 1.6), r.range(FALLS.face - 15, FALLS.face - 9), r.range(1.4, 3.2), 0.6, true);
  }
  /* The ice on the face either side: curtains of icicles. */
  I.dress(() => {
    for (let k = 0; k < 40; k += 1) {
      const side = k % 2 === 0 ? r.range(FALLS.x0 - 14, FALLS.x0 - 1) : r.range(FALLS.x1 + 1, FALLS.x1 + 6);
      const y = r.range(20, FALLS.top);
      I.cone('arIcicle', side, y, FALLS.face - 0.5, r.range(0.4, 1.1), -r.range(3, 12), 5);
    }
  });
}

/*
 * THE DRIFT ICE. Three bands of it, south, east and north of the island,
 * on a jittered lattice: a floe where the noise says there is ice, open
 * water in the leads and the polynyas, nothing in the harbour, at the
 * foot of a cliff or round a berg. A few seals.
 */
function driftIce(I) {
  const r = rng(61);
  const bands = [
    { x0: -280, x1: 470, z0: 112, z1: 430, step: 15 },
    { x0: 288, x1: 480, z0: -300, z1: 112, step: 15 },
    { x0: -340, x1: 288, z0: -430, z1: -214, step: 16 },
  ];
  const out = keepOut();
  let seals = 0;
  let floes = 0;
  for (const band of bands) {
    for (let z = band.z0; z < band.z1; z += band.step) {
      for (let x = band.x0; x < band.x1; x += band.step) {
        const cx = x + r.range(0, band.step);
        const cz = z + r.range(0, band.step);
        const w = r.range(5, 13.5);
        const d = r.range(5, 13.5);
        r.next();
        if (cx * cx + cz * cz > 560 * 560) {
          continue;
        }
        const lead = noise(cx, cz, 95, 31);
        if (lead > 0.47 && lead < 0.55) {
          continue;
        }
        if (noise(cx, cz, 70, 32) < 0.33) {
          continue;
        }
        const b = { x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2 };
        if (out.some((o) => b.x1 > o.x0 && b.x0 < o.x1 && b.z1 > o.z0 && b.z0 < o.z1)) {
          continue;
        }
        if (nearLand(b, 5)) {
          continue;
        }
        const top = r.range(0.3, 0.6);
        const [pts, inner] = polyOf(r, b.x0, b.z0, b.x1, b.z1);
        I.poly(r.chance(0.7) ? 'arSnow' : 'arIce', 'arIceDeep', pts, -0.4, top);
        I.box('arIce', inner.x0, -0.4, inner.z0, inner.x1, top, inner.z1, { draw: false, kind: 'rock', name: 'floe' });
        floes += 1;
        /* A pressure ridge on some: broken blocks along one side, fine. */
        if (w * d > 70 && r.chance(0.25)) {
          I.dress(() => {
            for (let k = 0; k < 4; k += 1) {
              const bx = inner.x0 + (inner.x1 - inner.x0) * (0.15 + 0.22 * k);
              const bz = inner.z0 + (inner.z1 - inner.z0) * r.range(0.2, 0.8);
              const s = r.range(0.6, 1.2);
              I.deco('arIce', bx - s, top, bz - s * 0.7, bx + s, top + r.range(0.4, 1.1), bz + s * 0.7);
            }
          });
        }
        if (seals < 14 && w * d > 60 && r.chance(0.06)) {
          seal(I, r, (inner.x0 + inner.x1) / 2, top, (inner.z0 + inner.z1) / 2);
          seals += 1;
        }
      }
    }
  }
  return { floes, seals };
}

/* Whether a rectangle comes within `pad` of a land cell. */
function nearLand(b, pad) {
  const i0 = Math.floor((b.x0 - pad - GX0) / CELL);
  const i1 = Math.floor((b.x1 + pad - GX0) / CELL);
  const j0 = Math.floor((b.z0 - pad - GZ0) / CELL);
  const j1 = Math.floor((b.z1 + pad - GZ0) / CELL);
  for (let j = j0; j <= j1; j += 1) {
    for (let i = i0; i <= i1; i += 1) {
      if (isTopCell(i, j)) {
        return true;
      }
    }
  }
  return false;
}

/* A spotted seal hauled out on a floe: a body, a head, two flippers. */
function seal(I, r, x, y, z) {
  const along = r.chance(0.5);
  const L = 0.8;
  const [dx, dz] = along ? [L, 0] : [0, L];
  I.dress(() => {
    I.ball('arSeal', x, y + 0.25, z, 0.42, 0.62);
    I.ball('arSeal', x + dx * 0.7, y + 0.28, z + dz * 0.7, 0.32, 0.8);
    I.ball('arSealDark', x + dx * 1.15, y + 0.4, z + dz * 1.15, 0.2, 1);
    I.ball('arSeal', x - dx * 0.75, y + 0.18, z - dz * 0.75, 0.24, 0.6);
  });
}

/* Everything in the sea. Returns counts for the check. */
export function seaLayout(I) {
  archBerg(I);
  for (const t of [TWINS.a, TWINS.b]) {
    const r = rng(t.x0 | 0);
    iceTier(I, r, t, -2.5, t.h * 0.55, 'arIce', 'twin berg');
    crevasses(I, r, t, 0, t.h * 0.55);
    const up = { x0: t.x0 + 2, x1: t.x1 - 2, z0: t.z0 + 2.5, z1: t.z1 - 2.5 };
    iceTier(I, r, up, t.h * 0.55, t.h, 'arSnow', 'twin berg');
  }
  for (const [x, z, w, d, h, seed] of BERGS) {
    berg(I, x, z, w, d, h, seed);
  }
  /* The Needle: tallest in the middle, columns of four metres. */
  const nx = (NEEDLE.x0 + NEEDLE.x1) / 2;
  const nz = (NEEDLE.z0 + NEEDLE.z1) / 2;
  columns(I, NEEDLE, -3, (x, z) => NEEDLE.h - 0.9 * (Math.abs(x - nx) + Math.abs(z - nz)), 4, 71, 'needle');
  /* The sea arch: a fin of three metre columns, falling from the cliff to
   * the sea, the hole through its foot. */
  const a = SEA_ARCH;
  columns(I, a, -3, (x, z) => 66 - (a.z1 - z) * 1.25, 3, 72, 'sea arch',
    (x, z) => (z > a.hole0 && z < a.hole1 ? a.holeH : -3));
  falls(I);
  return driftIce(I);
}
