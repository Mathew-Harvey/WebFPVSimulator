/*
 * trees.js: the forest of Momiji Pass. Pure, as ./frame.js is.
 *
 * THREE TREES, drawn by ./index.js and solid here:
 *   sugi     Japanese cedar, the dark, tall, narrow cone that covers
 *            Japan's mountain sides in planted blocks: three tiers of cone
 *            on a straight trunk, ten to sixteen metres. Solid as two
 *            capsules up its middle, the lower one fatter, so the branch
 *            tips are brushed through and the body is not
 *   momiji   the maple the pass is named for, in its autumn reds, a low
 *            spreading crown of four or five clumps, by the road and round
 *            the rest stop where people come to look at them
 *   icho     the ginkgo, a gold column, by the shrine and the hamlet
 *
 * WHERE: the cedars in plantation blocks on the high slopes and the hills
 * round the valley, close set in rows as plantations are, and more loosely
 * between the hairpin legs, where the maples are too; never on the road or
 * its verge, the pads, the gorge or its lip, the fields, a building, or a
 * line a named gap is flown along.
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

import { W, D, hash2, rng } from './frame.js';
import { nearest, BENCH, REST, TUNNEL, SHED, SHRINE, GORGE, VALLEY_Y } from './route.js';
import { floorAt, inGorge, LOOKOUT } from './terrain.js';

/* Rectangles nothing grows in: { x0, y0, x1, y1 }. */
function keepOut(houses, fields, extra) {
  return [
    { x0: REST.x0 - 3, x1: REST.x1 + 3, y0: REST.y0 - 3, y1: REST.y1 + 4 },
    { x0: SHRINE.x - 9, x1: SHRINE.x + 9, y0: SHRINE.y0 - 2, y1: SHRINE.y1 + 11 },
    { x0: LOOKOUT.x0 - 3, x1: LOOKOUT.x1 + 3, y0: LOOKOUT.y0 - 6, y1: LOOKOUT.y1 + 3 },
    { x0: TUNNEL.x0 - 14, x1: TUNNEL.x0 + 2, y0: TUNNEL.y - 16, y1: TUNNEL.y + 16 },
    { x0: TUNNEL.x1 - 2, x1: TUNNEL.x1 + 14, y0: TUNNEL.y - 16, y1: TUNNEL.y + 16 },
    { x0: SHED.x0 - 2, x1: SHED.x1 + 2, y0: SHED.y - 8, y1: SHED.y + 10 },
    { x0: fields.x0 - 2, x1: fields.x1 + 2, y0: fields.y0 - 2, y1: fields.y1 + 2 },
    ...houses.map((h) => ({ x0: h.x - 4, x1: h.x + h.w + 4, y0: h.y - 4, y1: h.y + h.d + 5 })),
    ...extra,
  ];
}

/*
 * The trees: [{ kind, x, y, g, size, tone, k }], g the ground under it.
 * `B` takes their solids.
 */
export function plantTrees(B, houses, fields, extra = []) {
  const out = [];
  const no = keepOut(houses, fields, extra);
  const blocked = (x, y) => no.some((r) => x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1);
  const nearLip = (x, y) => inGorge(x, y) || inGorge(x, y + 4) || inGorge(x, y - 4) || inGorge(x + 4, y) || inGorge(x - 4, y);
  const taken = new Map();
  const free = (x, y, r) => {
    const cx = Math.floor(x / 8);
    const cy = Math.floor(y / 8);
    for (let i = cx - 1; i <= cx + 1; i += 1) {
      for (let j = cy - 1; j <= cy + 1; j += 1) {
        const list = taken.get(i * 4096 + j);
        if (!list) {
          continue;
        }
        for (const t of list) {
          const dx = t.x - x;
          const dy = t.y - y;
          if (dx * dx + dy * dy < (t.r + r) * (t.r + r)) {
            return false;
          }
        }
      }
    }
    return true;
  };
  const take = (t, r) => {
    const key = Math.floor(t.x / 8) * 4096 + Math.floor(t.y / 8);
    let list = taken.get(key);
    if (!list) {
      list = [];
      taken.set(key, list);
    }
    list.push({ x: t.x, y: t.y, r });
    out.push(t);
  };
  const rd = rng(5150);
  /* Candidates on a jittered 4.6 m lattice over the plot. */
  const step = 4.6;
  for (let gy = 0; gy * step < D; gy += 1) {
    for (let gx = 0; gx * step < W; gx += 1) {
      const x = gx * step + (hash2(gx, gy, 1) - 0.5) * 3.2;
      const y = gy * step + (hash2(gx, gy, 2) - 0.5) * 3.2;
      if (x < 2 || y < 2 || x > W - 2 || y > D - 2) {
        continue;
      }
      if (blocked(x, y) || nearLip(x, y)) {
        continue;
      }
      const near = nearest(x, y, 40);
      const d = near ? near.d : 99;
      if (d < BENCH + 2.2) {
        continue;
      }
      /* The valley floor and the strip by the gorge are open ground, but
       * for a line of maples along the valley road and the gorge's rim. */
      const valley = y > 18 && y < 150;
      const roadside = d < BENCH + 7;
      const rim = (y > GORGE.y1 + 3 && y < GORGE.y1 + 12) || (y < GORGE.y0 - 3 && y > GORGE.y0 - 12);
      const face = y >= 150 && y < 290 && x > 18 && x < W - 18;
      /* Plantation blocks: a coarse noise picks which ground is planted. */
      const block = hash2(Math.floor(x / 40), Math.floor(y / 40), 7);
      let want = 0;
      let kind = 'sugi';
      if (valley) {
        if ((roadside && Math.abs(y - VALLEY_Y) < 16) || rim) {
          want = 0.18;
          kind = 'momiji';
        }
      } else if (face) {
        want = roadside ? 0.42 : 0.5;
        kind = roadside || hash2(gx, gy, 5) < 0.35 ? 'momiji' : 'sugi';
      } else {
        want = block < 0.72 ? 0.95 : 0.4;
        kind = hash2(gx, gy, 6) < (block < 0.72 ? 0.05 : 0.3) ? 'momiji' : 'sugi';
      }
      if (hash2(gx, gy, 3) > want) {
        continue;
      }
      const g = floorAt(x, y);
      const size = kind === 'sugi' ? 0.8 + hash2(gx, gy, 8) * 0.5 : 0.85 + hash2(gx, gy, 9) * 0.4;
      const r = kind === 'sugi' ? 1.9 * size : 3.0 * size;
      if (!free(x, y, r * 0.55)) {
        continue;
      }
      take({ kind, x, y, g, size, tone: Math.floor(hash2(gx, gy, 10) * 3), k: out.length }, r * 0.55);
    }
  }
  /* The ginkgos by the shrine's stair and in the hamlet. */
  for (const [x, y] of [[141, 322], [159, 322], [142, 350], [158, 350], [196, 44], [300, 46]]) {
    const g = floorAt(x, y);
    take({ kind: 'icho', x, y, g, size: 1 + rd.next() * 0.2, tone: 0, k: out.length }, 2.4);
  }
  /* And maples round the car park and the tea house, where people stop. */
  for (const [x, y] of [[124, 330], [204, 330], [214, 318], [120, 312], [168, 330], [200, 296]]) {
    const g = floorAt(x, y);
    take({ kind: 'momiji', x, y, g, size: 1.1, tone: Math.floor(rd.next() * 3), k: out.length }, 2.4);
  }
  for (const t of out) {
    solidOf(B, t);
  }
  return out;
}

/* A tree's shape, shared by its solid and its drawing: heights from its
 * ground, metres. */
export function shapeOf(t) {
  if (t.kind === 'sugi') {
    const H = 13 * t.size;
    return { H, trunk: 0.28 * t.size, crown0: 2.2 * t.size, r: 1.9 * t.size };
  }
  if (t.kind === 'icho') {
    const H = 11 * t.size;
    return { H, trunk: 0.3 * t.size, crown0: 2.4, r: 2.4 * t.size };
  }
  const H = 6.5 * t.size;
  return { H, trunk: 0.22 * t.size, crown0: 2.0 * t.size, r: 3.0 * t.size };
}

function solidOf(B, t) {
  const s = shapeOf(t);
  const g = t.g;
  if (t.kind === 'sugi') {
    B.post('tgTrunk', t.x, t.y, g - 0.3, g + s.H * 0.45, s.r * 0.55, { draw: false, kind: 'tree', name: 'cedar' });
    B.post('tgTrunk', t.x, t.y, g + s.H * 0.45, g + s.H * 0.85, s.r * 0.3, { draw: false, kind: 'tree', name: 'cedar' });
    return;
  }
  B.post('tgTrunk', t.x, t.y, g - 0.3, g + s.crown0 + 0.4, s.trunk, { draw: false, kind: 'tree', name: 'trunk' });
  const cy = g + (s.crown0 + s.H) / 2;
  const rr = Math.min(s.r, (s.H - s.crown0) / 2) * 0.72;
  B.post('tgTrunk', t.x, t.y, cy - rr * 0.3, cy + rr * 0.3, rr, { draw: false, kind: 'canopy', name: 'crown' });
}
