/*
 * nature.js: what grows and lies on Raicho Ridge: the forest of the valley
 * and the lower slopes, the dwarf pine (haimatsu) of the high meadows, and
 * the boulders of the scree and the crest.
 *
 * THE ZONES are the Northern Alps' own, by height over the valley: fir and
 * birch forest on the valley floor and the lower slopes, thinning out
 * toward a tree line about 170 m up the face; above it the knee high mats
 * of dwarf pine on everything gentle enough to hold them, to about 430 m;
 * above that rock, scree and the summer snow patches, which are the
 * ground's paint (./index.js). The forest is dense on purpose, the owner's
 * ask of 2026-10-21 for the other maps ("we need much more trees"): the
 * gaps between trunks are the lines.
 *
 * EVERYTHING HERE IS SOLID WHERE IT IS DRAWN, the town's trees' rule
 * (src/props/street.js treeLayout): a trunk is a capsule, a fir's tiers
 * are a capsule up their middle, a broadleaf's canopy is the spheres
 * inside its masses, a dwarf pine's mat is the sphere inside each
 * of its blobs, a boulder is the sphere inside it. Placed from an integer
 * hash and the ground's own heights, with arithmetic only, so the same
 * trees stand in the same places in every engine: they go to the plant.
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

import {
  floorAt, noise, roadNear, PADS, LAKE, DAM_X,
} from './terrain.js';
import { ROPE, SHED, trailPoints } from './places.js';

function hash(i, salt) {
  let h = Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(salt + 7, 0x85ebca77);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

/* The ground's steepness at (x, z): rise over run, the larger way. */
function steep(x, z) {
  const e = 3;
  const gx = (floorAt(x + e, z) - floorAt(x - e, z)) / (2 * e);
  const gz = (floorAt(x, z + e) - floorAt(x, z - e)) / (2 * e);
  return Math.sqrt(gx * gx + gz * gz);
}

/* Rectangles nothing grows in: the pads with a margin, the ropeway's
 * corridor, the dam, the snow shed. */
const KEEP = [
  ...Object.values(PADS).map((p) => ({ x0: p.x0 - 6, x1: p.x1 + 6, z0: p.z0 - 6, z1: p.z1 + 6 })),
  { x0: ROPE.up - 12, x1: ROPE.down + 12, z0: ROPE.zTop - 20, z1: ROPE.zBot + 30 },
  { x0: DAM_X - 14, x1: DAM_X + 70, z0: 110, z1: 290 },
  { x0: SHED.x0 - 8, x1: SHED.x1 + 8, z0: SHED.z - 16, z1: SHED.z + 14 },
  { x0: -240, x1: -80, z0: 140, z1: 205 },
];

function kept(x, z) {
  for (const k of KEEP) {
    if (x > k.x0 && x < k.x1 && z > k.z0 && z < k.z1) {
      return true;
    }
  }
  return false;
}

/* Under the lake, or on its shore's lip. */
function wet(x, z) {
  return x < DAM_X + 2 && x > 50 && floorAt(x, z) < LAKE + 1.2;
}

/* The forest's trees: { x, y, z, size, broad, tone, lean }. */
export function forest() {
  const out = [];
  const STEP = 9;
  let n = 0;
  for (let z = -760; z <= 760; z += STEP) {
    for (let x = -780; x <= 780; x += STEP) {
      n += 1;
      const px = x + (hash(n, 1) - 0.5) * STEP * 0.95;
      const pz = z + (hash(n, 2) - 0.5) * STEP * 0.95;
      const y = floorAt(px, pz);
      /* Up to the tree line, thinning into it. */
      const up = y - 70;
      if (up > 250) {
        continue;
      }
      const thin = up < 150 ? 1 : 1 - (up - 150) / 100;
      const dense = noise(px / 90, pz / 90, 61);
      const want = (0.2 + 0.8 * dense) * thin;
      if (hash(n, 3) > want * want * 1.15) {
        continue;
      }
      if (steep(px, pz) > 0.95 || kept(px, pz) || wet(px, pz) || roadNear(px, pz).d < 8) {
        continue;
      }
      const broad = up < 60 && hash(n, 4) < 0.18;
      /* Smaller toward the tree line, as the real ones are. */
      const size = (0.75 + hash(n, 5) * 0.55) * (up < 120 ? 1 : 1 - (up - 120) / 260);
      out.push({ x: px, y, z: pz, size, broad, tone: Math.floor(hash(n, 6) * 3), spin: hash(n, 7) * 6.283 });
    }
  }
  return out;
}

/*
 * A FIR, the comic's way: a thin trunk and three tiers of cone, each a
 * little narrower and darker than the one under it, which is how the
 * Northern Alps' Veitch's fir and Maries' fir read from a hundred metres
 * and how a manga background draws a forest. About sixty triangles a tree,
 * which is what lets the forest be as dense as it is (the owner's "we
 * need much more trees", 2026-10-21) at less than the town's frame cost.
 *
 * Solid as two capsules inside what is drawn: the trunk, and a spine
 * through the tiers no wider than the narrowest of them is at that height,
 * so the gaps between trees are as wide as they look.
 */
const FIR_TONES = [['alPine0', 'alPine1', 'alPine2'], ['alPine1', 'alPine2', 'alPine2'], ['alPine0', 'alPine0', 'alPine1']];

function firSpec(t) {
  const H = 13 * t.size;
  const R = H * 0.23;
  const tiers = [];
  for (let k = 0; k < 3; k += 1) {
    tiers.push({ y: H * (0.18 + 0.22 * k), h: H * (0.5 - 0.08 * k), r: R * (1 - 0.24 * k) });
  }
  return { H, R, tiers };
}

/* A broadleaf of the valley floor: a trunk and two round masses. */
function broadSpec(t) {
  const H = 10 * t.size;
  return { H, blobs: [{ c: [0, H * 0.62, 0], r: H * 0.3, ry: H * 0.26 }, { c: [H * 0.12, H * 0.82, -H * 0.06], r: H * 0.2, ry: H * 0.17 }] };
}

/* The dwarf pine: { x, z, blobs: [{ c, r, ry }] }, mats of a few blobs. */
export function dwarfPine() {
  const out = [];
  const trail = trailPoints();
  let n = 0;
  for (let z = -760; z <= 760; z += 14) {
    for (let x = -760; x <= 760; x += 14) {
      n += 1;
      const px = x + (hash(n, 11) - 0.5) * 12;
      const pz = z + (hash(n, 12) - 0.5) * 12;
      const y = floorAt(px, pz);
      if (y < 290 || y > 450) {
        continue;
      }
      if (hash(n, 13) > 0.25 + 0.5 * noise(px / 60, pz / 60, 63)) {
        continue;
      }
      if (steep(px, pz) > 0.7 || kept(px, pz)) {
        continue;
      }
      let near = false;
      for (let i = 0; i < trail.length; i += 2) {
        const dx = trail[i][0] - px;
        const dz = trail[i][2] - pz;
        if (dx * dx + dz * dz < 36) {
          near = true;
          break;
        }
      }
      if (near) {
        continue;
      }
      const k = 3 + Math.floor(hash(n, 14) * 3);
      const blobs = [];
      for (let b = 0; b < k; b += 1) {
        const bx = px + (hash(n * 7 + b, 15) - 0.5) * 4.5;
        const bz = pz + (hash(n * 7 + b, 16) - 0.5) * 4.5;
        const r = 1.1 + hash(n * 7 + b, 17) * 0.9;
        const ry = r * 0.5;
        blobs.push({ c: [bx, floorAt(bx, bz) + ry * 0.55, bz], r, ry, tone: Math.floor(hash(n * 7 + b, 18) * 3) });
      }
      out.push({ x: px, z: pz, blobs });
    }
  }
  return out;
}

/* The boulders: { c, r, ry, dark }. */
export function boulders() {
  const out = [];
  let n = 0;
  for (let z = -620; z <= 300; z += 22) {
    for (let x = -760; x <= 760; x += 22) {
      n += 1;
      const px = x + (hash(n, 21) - 0.5) * 20;
      const pz = z + (hash(n, 22) - 0.5) * 20;
      const y = floorAt(px, pz);
      if (y < 150 || kept(px, pz) || wet(px, pz) || roadNear(px, pz).d < 8) {
        continue;
      }
      const s = steep(px, pz);
      if (s > 1.4 || hash(n, 23) > 0.18 + 0.35 * (y > 300 ? 1 : 0)) {
        continue;
      }
      const r = 0.7 + hash(n, 24) * hash(n, 25) * 2.6;
      const ry = r * (0.6 + hash(n, 26) * 0.3);
      out.push({ c: [px, y + ry * 0.35, pz], r, ry, dark: hash(n, 27) < 0.35, spin: [hash(n, 28) * 3, hash(n, 29) * 3, 0] });
    }
  }
  return out;
}

/* Their solids, world frame, into a Plan; their drawing as paint. */
export function plant(B) {
  const trees = forest();
  for (const t of trees) {
    const at = (p) => [p[0] + t.x, p[1] + t.y, p[2] + t.z];
    if (t.broad) {
      const sp = broadSpec(t);
      B.cap('alTimberDark', at([0, 0, 0]), at([0, sp.H * 0.55, 0]), 0.18 * t.size, { draw: false, name: 'trunk', kind: 'tree' });
      for (const b of sp.blobs) {
        B.cap('alPine0', at(b.c), at(b.c), 0.75 * Math.min(b.r, b.ry), { draw: false, name: 'canopy', kind: 'canopy' });
      }
      B.draw(t.x, t.z, (K) => {
        K.begin(t.x, t.y, t.z, t.spin, K.chunk);
        K.cyl('alTimberDark', [0, 0, 0], [0, sp.H * 0.6, 0], 0.2 * t.size, 5, 0.12 * t.size);
        sp.blobs.forEach((b, k) => K.blob(k ? 'alBroad1' : 'alBroad0', b.c, b.r, b.ry, [0, t.spin, 0]));
        K.begin(0, 0, 0, 0, K.chunk);
      });
      continue;
    }
    const sp = firSpec(t);
    const top = sp.tiers[2];
    B.cap('alTimberDark', at([0, 0, 0]), at([0, sp.tiers[0].y + 0.4, 0]), 0.16 * t.size, { draw: false, name: 'trunk', kind: 'tree' });
    /* The spine: from the bottom tier's middle, as wide as the top tier is
     * halfway up it, to near the top. */
    B.cap('alPine1', at([0, sp.tiers[0].y + sp.tiers[0].h * 0.35, 0]), at([0, top.y + top.h * 0.45, 0]),
      Math.min(sp.tiers[0].r * 0.55, top.r * 0.55), { draw: false, name: 'canopy', kind: 'canopy' });
    const tones = FIR_TONES[t.tone];
    B.draw(t.x, t.z, (K) => {
      K.begin(t.x, t.y, t.z, t.spin, K.chunk);
      K.cyl('alTimberDark', [0, 0, 0], [0, sp.tiers[0].y + 0.6, 0], 0.17 * t.size, 5, 0.12 * t.size);
      sp.tiers.forEach((q, k) => K.cone(tones[k], [0, q.y, 0], q.r, q.h, 7));
      K.begin(0, 0, 0, 0, K.chunk);
    });
  }
  const mats = dwarfPine();
  const TONES = ['alPine0', 'alPine1', 'alPine2'];
  for (const m of mats) {
    for (const b of m.blobs) {
      B.cap('alPine1', b.c, b.c, 0.78 * Math.min(b.r, b.ry), { draw: false, name: 'dwarf pine', kind: 'canopy' });
    }
    B.draw(m.x, m.z, (K) => {
      for (const b of m.blobs) {
        K.blob(TONES[b.tone], b.c, b.r, b.ry, [0, b.tone, 0]);
      }
    });
  }
  const rocks = boulders();
  for (const r of rocks) {
    B.cap('alRock', r.c, r.c, 0.78 * Math.min(r.r, r.ry), { draw: false, name: 'boulder' });
    B.draw(r.c[0], r.c[2], (K) => {
      K.blob(r.dark ? 'alRockDark' : 'alRock', r.c, r.r, r.ry, r.spin);
    });
  }
  return { trees: trees.length, mats: mats.length, rocks: rocks.length };
}
