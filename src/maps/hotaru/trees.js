/*
 * trees.js: the woods of Hotaru Valley, planted the way a satoyama is.
 *
 * WHAT GROWS WHERE, from the forestry and not from a scatter. The cedar
 * (sugi) is PLANTED: in rows on the steep slopes of the west and north
 * ranges, at about four and a half metres in the row and six and a half
 * between rows once thinned, every trunk straight and pruned bare to a
 * third of its height. That is the dark wedge every Japanese hillside has,
 * and its rows are the point here: a plantation is a hall of trunks, and
 * the aisles between the rows are lines a pilot flies at speed. Below the
 * cedar, and on the gentler ground round the village and the shrine, the
 * coppice broadleaf (konara oak and its kind) stands looser and rounder.
 * Black pines lean over the bay and stand on the castle's walls, because
 * that is where they are in every old castle town and every fishing
 * village. Persimmons stand in the yards, bare but for their fruit, which
 * is what an autumn village looks like. Bamboo stands in one thick grove
 * at the foot of the north range, with a lane cut through it.
 *
 * WHAT IS SOLID, and why so little. A tree here is two or three capsules:
 * the trunk, and one or two inside the crown. The cedar's crown solid is
 * a capsule inside its cone at the cone's inscribed radius, so its skirt
 * is soft and its core is hard, which is how a pilot reads one. The
 * world's shapes are a budget (WORLD_MAX_SHAPES in src/native/world.c)
 * and a forest of fifteen a tree would spend a third of it.
 *
 * WHAT IS DRAWN. The cedar is the town's own (src/props/street.js
 * cedarSpec, drawn in its tones): seven sided whorls, about a hundred
 * triangles a tree, so a forest is affordable. The broadleaf and the pine
 * are twenty faced tufts in the town's grove and cedar tones, as the
 * loblolly's pads are. Every tone is a material the kit already has, so a
 * thousand trees add no draw call a chunk does not already make.
 *
 * Pure planting and pure solids: no Three.js, no JS trigonometry. The draw
 * functions take the kit, which carries Three.js, and are called only in
 * the browser.
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

import { rng, hash2, worldAt } from './frame.js';
import { landAt, inCedarStand, BAMBOO, WATER, nearestOnLine, RIVER, RIVER_HALF } from './land.js';
import { sincos } from '../../props/trig.js';

const TAU = Math.PI * 2;
const SC = { s: 0, c: 1 };

/* ------------------------------------------------------------------ */
/* The shapes of the trees, as numbers                                 */
/* ------------------------------------------------------------------ */

/*
 * A CEDAR: the stem, then four whorls of seven sided cone and a leader, the
 * lowest a third of the way up, the radius tapering to the top. Sizes from
 * a planted sugi of forty years: 14 to 20 m, a crown a fifth as wide as it
 * is tall. Shrunk a little (`k`), because a five inch reads a forest by its
 * gaps and a 20 m stand of 3 m whorls is a wall.
 */
export function cedarSpec(t) {
  const r = rng(t.seed);
  const H = 15 * t.k * r.range(0.88, 1.14);
  const base = H * r.range(0.3, 0.38);
  const crown = H - base;
  const rMax = H * 0.14 * r.range(0.9, 1.1);
  const trunkR = 0.13 * t.k * r.range(0.9, 1.15);
  const cones = [];
  const n = 4;
  const taper = [1, 0.8, 0.6, 0.4];
  for (let i = 0; i < n; i += 1) {
    const u = i / n;
    cones.push({
      y: base + crown * (u * 0.86 + r.range(-0.02, 0.02)),
      r: rMax * taper[i] * r.range(0.9, 1.08),
      h: (crown / n) * 2.1 * r.range(0.9, 1.1),
      spin: r.range(0, TAU),
      tone: u > 0.6 ? 0 : u < 0.2 ? 2 : r.chance(0.3) ? 0 : 1,
    });
  }
  cones.push({ y: base + crown * 0.82, r: rMax * 0.26, h: crown * 0.3, spin: r.range(0, TAU), tone: 0 });
  return { H, base, rMax, trunkR, cones };
}

/*
 * A BROADLEAF: a short trunk that forks into three or four limbs, a crown
 * of tufts round their ends, lit on top and deep underneath. 7 to 11 m.
 */
export function oakSpec(t) {
  const r = rng(t.seed);
  const S = t.k * r.range(0.85, 1.15);
  const trunkH = 3.0 * S;
  const trunkR = 0.2 * S;
  const crownR = 2.6 * S;
  const top = trunkH + crownR * 0.9;
  const limbs = [];
  const tufts = [];
  const nl = 3 + r.int(0, 1);
  let a = r.range(0, TAU);
  for (let i = 0; i < nl; i += 1) {
    a += TAU / nl + r.range(-0.4, 0.4);
    sincos(a, SC);
    const reach = crownR * r.range(0.45, 0.7);
    const end = [SC.c * reach, trunkH + crownR * r.range(0.4, 0.8), SC.s * reach];
    limbs.push({ a: [0, trunkH * 0.85, 0], b: end, r: trunkR * 0.5, rTop: trunkR * 0.25 });
    for (let k = 0; k < 2; k += 1) {
      const rr = crownR * r.range(0.42, 0.6);
      tufts.push({ c: [end[0] + r.range(-0.6, 0.6) * S, end[1] + r.range(-0.2, 0.9) * S, end[2] + r.range(-0.6, 0.6) * S], r: rr, ry: rr * r.range(0.68, 0.85), tone: k === 0 ? 1 : 2, spin: [r.range(0, 3), r.range(0, 3), r.range(0, 3)] });
    }
  }
  /* The crown's lit top. */
  for (let k = 0; k < 2; k += 1) {
    const rr = crownR * r.range(0.45, 0.6);
    tufts.push({ c: [r.range(-0.7, 0.7) * S, top + r.range(-0.2, 0.4) * S, r.range(-0.7, 0.7) * S], r: rr, ry: rr * 0.78, tone: 0, spin: [r.range(0, 3), r.range(0, 3), r.range(0, 3)] });
  }
  return { S, trunkH, trunkR, crownR, top, limbs, tufts };
}

/*
 * A BLACK PINE: a trunk that leans and kinks twice, and flat pads of
 * needles at the ends of its limbs, laid level the way a gardener trains
 * them and the sea wind leaves them. 6 to 10 m.
 */
export function pineSpec(t) {
  const r = rng(t.seed);
  const S = t.k * r.range(0.85, 1.15);
  const lean = r.range(0, TAU);
  sincos(lean, SC);
  const dx = SC.c;
  const dz = SC.s;
  const pts = [[0, 0, 0]];
  let x = 0;
  let z = 0;
  let y = 0;
  for (let i = 0; i < 3; i += 1) {
    const step = [2.4, 2.2, 1.8][i] * S;
    const out = [0.35, 0.55, 0.2][i] * S * r.range(0.7, 1.3);
    x += dx * out + r.range(-0.3, 0.3) * S;
    z += dz * out + r.range(-0.3, 0.3) * S;
    y += step;
    pts.push([x, y, z]);
  }
  const trunkR = 0.2 * S;
  const pads = [];
  const np = 4 + r.int(0, 2);
  for (let i = 0; i < np; i += 1) {
    const from = pts[1 + Math.min(2, Math.floor((i * 3) / np))];
    sincos(lean + r.range(-1.6, 1.6), SC);
    const reach = r.range(0.8, 2.2) * S;
    const rr = r.range(1.1, 1.6) * S;
    pads.push({ from, c: [from[0] + SC.c * reach, from[1] + r.range(0.1, 0.8) * S, from[2] + SC.s * reach], r: rr, ry: rr * r.range(0.32, 0.42), tone: i === np - 1 ? 0 : r.chance(0.5) ? 1 : 2 });
  }
  const tip = pts[3];
  pads.push({ from: tip, c: [tip[0], tip[1] + 0.5 * S, tip[2]], r: 1.3 * S, ry: 0.5 * S, tone: 0 });
  return { S, pts, trunkR, pads };
}

/* A PERSIMMON: a small broadleaf, its few leaves turned gold, hung with
 * orange fruit. 5 to 6 m. */
export function kakiSpec(t) {
  const o = oakSpec({ ...t, k: t.k * 0.68 });
  const r = rng(t.seed + 99);
  const fruit = [];
  for (const tf of o.tufts) {
    for (let k = 0; k < 4; k += 1) {
      sincos(r.range(0, TAU), SC);
      const rr = tf.r * r.range(0.75, 1.05);
      fruit.push([tf.c[0] + SC.c * rr, tf.c[1] + r.range(-0.5, 0.2) * tf.ry, tf.c[2] + SC.s * rr]);
    }
  }
  return { ...o, fruit };
}

/* A BAMBOO CLUMP: five to seven culms from one root, leaning out a little,
 * tufts of leaf on their upper thirds. 9 to 13 m. */
export function bambooSpec(t) {
  const r = rng(t.seed);
  const culms = [];
  const n = 5 + r.int(0, 2);
  for (let i = 0; i < n; i += 1) {
    sincos(r.range(0, TAU), SC);
    const at = r.range(0.05, 0.55);
    const H = r.range(9, 13) * t.k;
    const lean = r.range(0.04, 0.12) * H;
    sincos(r.range(0, TAU), SC);
    const base = [SC.c * at, 0, SC.s * at];
    const tip = [base[0] + SC.c * lean, H, base[2] + SC.s * lean];
    culms.push({ base, tip, r: r.range(0.045, 0.07) });
  }
  const tufts = [];
  for (const c of culms) {
    for (let k = 0; k < 2; k += 1) {
      const f = 0.7 + k * 0.2;
      const rr = r.range(0.9, 1.4);
      tufts.push({
        c: [c.base[0] + (c.tip[0] - c.base[0]) * f, c.tip[1] * f, c.base[2] + (c.tip[2] - c.base[2]) * f],
        r: rr, ry: rr * r.range(1.3, 1.8), tone: k, spin: [r.range(-0.3, 0.3), r.range(0, 3), r.range(-0.3, 0.3)],
      });
    }
  }
  return { culms, tufts };
}

const SPECS = { cedar: cedarSpec, oak: oakSpec, pine: pineSpec, kaki: kakiSpec, bamboo: bambooSpec };
export function specOf(t) {
  if (!t.spec) {
    t.spec = SPECS[t.kind](t);
  }
  return t.spec;
}

/* ------------------------------------------------------------------ */
/* The solids                                                          */
/* ------------------------------------------------------------------ */

/* A tree's solids into the builder, in its plan frame: a hidden capsule
 * for the trunk and one or two inside its crown. */
export function treeSolids(T, t) {
  const s = specOf(t);
  const at = (p) => [t.px + p[0], t.py - p[2], t.h + p[1]];
  const hidden = (a, b, r, kind) => T.cap('hvWood', at(a), at(b), r, { draw: false, kind, name: t.kind });
  if (t.kind === 'cedar') {
    hidden([0, 0, 0], [0, s.base + 0.6, 0], s.trunkR, 'tree');
    /* The capsule inside the lowest whorl's cone, which sits from the
     * whorl's base to its tip: radius its inscribed circle at the middle,
     * eight tenths in. */
    const c0 = s.cones[0];
    const rc = c0.r * 0.42;
    hidden([0, c0.y + rc, 0], [0, s.H - rc * 2.2, 0], rc, 'canopy');
  } else if (t.kind === 'oak' || t.kind === 'kaki') {
    hidden([0, 0, 0], [0, s.trunkH, 0], s.trunkR, 'tree');
    const cy = (s.trunkH + s.top) / 2 + 0.3 * s.S;
    hidden([0, cy, 0], [0, cy + 0.6 * s.S, 0], s.crownR * 0.62, 'canopy');
  } else if (t.kind === 'pine') {
    for (let i = 0; i + 1 < s.pts.length; i += 1) {
      hidden(s.pts[i], s.pts[i + 1], s.trunkR * (1 - i * 0.2), 'tree');
    }
    for (const p of s.pads) {
      hidden(p.c, p.c, Math.min(p.r * 0.6, p.ry * 0.9), 'canopy');
    }
  } else if (t.kind === 'bamboo') {
    /* The clump as one post: its culms stand inside 0.6 m of the root. */
    const top = Math.min(...s.culms.map((c) => c.tip[1])) * 0.8;
    hidden([0, 0, 0], [0, top, 0], 0.45, 'tree');
  }
}

/* ------------------------------------------------------------------ */
/* The drawing                                                         */
/* ------------------------------------------------------------------ */

const CEDAR_TONES = ['stCedar0', 'stCedar1', 'stCedar2'];
const GROVE_TONES = ['stGrove0', 'stGrove1', 'stGrove2'];
const BAMBOO_TONES = ['hvBambooLeaf0', 'hvBambooLeaf1'];

/* The two shared shapes: the cedar's whorl and the twenty faced tuft,
 * indexed as street.js's are so the shadow proxies batch them together. */
const GEO = {};
function geo(K, key) {
  if (!GEO[key]) {
    const T3 = K.THREE;
    if (key === 'cone7' || key === 'cone7o') {
      /* Low's has no base: from above, which is where Low is flown from
       * over a forest, it is never seen, and it is a third of the cone. */
      GEO[key] = new T3.ConeGeometry(1, 1, 7, 1, key === 'cone7o');
      GEO[key].translate(0, 0.5, 0);
    } else {
      GEO[key] = new T3.IcosahedronGeometry(1, 0);
      GEO[key].setIndex(Array.from({ length: GEO[key].attributes.position.count }, (_, i) => i));
    }
  }
  return GEO[key];
}

/*
 * Draw one tree into the kit at its place. `chunk` is the cull chunk its
 * root is filed under. `low` draws a cedar with three whorls on a three
 * sided stem, a broadleaf with half its tufts and no limbs, a pine without
 * the stems to its pads, and no fruit: the same outline from
 * the air for fewer triangles, and the solids are the same on every preset.
 */
export function drawTree(K, t, chunk, low) {
  const s = specOf(t);
  const [x, y, z] = worldAt(t.px, t.py, t.h);
  K.begin(x, y, z, 0, chunk);
  const T3 = K.THREE;
  const m = new T3.Matrix4();
  const q = new T3.Quaternion();
  const e = new T3.Euler();
  const v = new T3.Vector3();
  const sc = new T3.Vector3();
  if (t.kind === 'cedar') {
    K.cyl('stCedarWood', [0, 0, 0], [0, s.H * 0.9, 0], s.trunkR, low ? 3 : 5, s.trunkR * 0.35);
    s.cones.forEach((c, i) => {
      if (low && i === 1) {
        return;
      }
      e.set(0, c.spin, 0);
      q.setFromEuler(e);
      m.compose(v.set(0, c.y, 0), q, sc.set(c.r, c.h, c.r));
      K.add(CEDAR_TONES[c.tone], geo(K, low ? 'cone7o' : 'cone7'), m.clone());
    });
    return;
  }
  if (t.kind === 'oak' || t.kind === 'kaki') {
    K.cyl('stGroveWood', [0, 0, 0], [0, s.trunkH, 0], s.trunkR, low ? 4 : 6, s.trunkR * 0.7);
    /* The limbs are inside the crown from any range Low is played at. */
    for (const l of low ? [] : s.limbs) {
      K.cyl('stGroveWood', l.a, l.b, l.r, 4, l.rTop);
    }
    const tones = t.kind === 'kaki' ? ['hvKakiLeaf', 'hvKakiLeaf', 'stGrove1'] : GROVE_TONES;
    s.tufts.forEach((tf, i) => {
      if (low && i % 2 === 1 && i < s.tufts.length - 2) {
        return;
      }
      e.set(tf.spin[0], tf.spin[1], tf.spin[2]);
      q.setFromEuler(e);
      m.compose(v.set(tf.c[0], tf.c[1], tf.c[2]), q, sc.set(tf.r, tf.ry, tf.r));
      K.add(tones[tf.tone], geo(K, 'tuft'), m.clone());
    });
    if (t.kind === 'kaki' && !low) {
      for (const f of s.fruit) {
        m.compose(v.set(f[0], f[1], f[2]), q.identity(), sc.set(0.11, 0.1, 0.11));
        K.add('hvKaki', geo(K, 'tuft'), m.clone());
      }
    }
    return;
  }
  if (t.kind === 'pine') {
    for (let i = 0; i + 1 < s.pts.length; i += 1) {
      const r0 = s.trunkR * (1 - i * 0.2);
      K.cyl('stCedarWood', s.pts[i], s.pts[i + 1], r0, low ? 3 : 5, r0 * 0.8);
    }
    for (const p of s.pads) {
      if (!low) {
        K.cyl('stCedarWood', p.from, p.c, s.trunkR * 0.35, 4, s.trunkR * 0.2);
      }
      e.set(0, (p.c[0] * 7.1 + p.c[2] * 3.3) % TAU, 0);
      q.setFromEuler(e);
      m.compose(v.set(p.c[0], p.c[1], p.c[2]), q, sc.set(p.r, p.ry, p.r));
      K.add(CEDAR_TONES[p.tone], geo(K, 'tuft'), m.clone());
    }
    return;
  }
  if (t.kind === 'bamboo') {
    for (const c of s.culms) {
      K.cyl('hvBamboo', c.base, c.tip, c.r, low ? 3 : 4, c.r * 0.6);
    }
    s.tufts.forEach((tf, i) => {
      if (low && i % 2 === 1) {
        return;
      }
      e.set(tf.spin[0], tf.spin[1], tf.spin[2]);
      q.setFromEuler(e);
      m.compose(v.set(tf.c[0], tf.c[1], tf.c[2]), q, sc.set(tf.r, tf.ry, tf.r));
      K.add(BAMBOO_TONES[tf.tone], geo(K, 'tuft'), m.clone());
    });
  }
}

/* ------------------------------------------------------------------ */
/* The planting                                                        */
/* ------------------------------------------------------------------ */

/*
 * The woods, as a list of trees { kind, px, py, h, k, seed }, each standing
 * on the land. `clear(px, py, r)` is the plan's say over where nothing may
 * grow: buildings, roads, the castle, the fields, the gaps' approaches.
 */
export function plantWoods(clear) {
  const out = [];
  const put = (kind, px, py, k, seed) => {
    const h = landAt(px, py);
    out.push({ kind, px, py, h, k, seed });
  };
  /* Nothing grows in the water or on its banks. */
  const dry = (px, py) => landAt(px, py) > WATER + 0.6 && nearestOnLine(RIVER, px, py).d > RIVER_HALF + 3.5;

  /* THE PLANTATIONS: rows six and a half metres apart, a tree every four
   * and a half in the row, a few missing where they were thinned or blew
   * down, which is what opens a plantation's aisles into rooms. The rows
   * all run east and west: across the north range's fall, so its stands
   * are tiers, and down the west range's, so its aisles run up the hill. */
  let n = 0;
  for (let py = 114; py < 420; py += 6.5) {
    for (let px = -40; px < 470; px += 4.5) {
      n += 1;
      const jx = (hash2(n, 3) - 0.5) * 1.4;
      const jy = (hash2(n, 5) - 0.5) * 1.0;
      const x = px + jx;
      const y = py + jy;
      const inPlot = x > -40 && x < 500 && y < 420;
      if (!inPlot || !(inCedarStand(x, y) || (x < 0 && y > 112 && y < 300))) {
        continue;
      }
      if (hash2(n, 7) < 0.1 || !dry(x, y) || !clear(x, y, 2.2)) {
        continue;
      }
      put('cedar', x, y, 1 + (hash2(n, 9) - 0.5) * 0.2, 1000 + n);
    }
  }

  /*
   * THE COPPICE: broadleaf on the rest of the hills, one tree in each eight
   * metre cell that its dice and its ground allow, thicker on the hillsides
   * and thinning down to the floor, where a few stand at the field edges.
   */
  n = 0;
  for (let py = -30; py < 410; py += 8) {
    for (let px = -40; px < 500; px += 8) {
      n += 1;
      const x = px + hash2(n, 11) * 7;
      const y = py + hash2(n, 13) * 7;
      if (inCedarStand(x, y) || (x < 0 && y > 112 && y < 300)) {
        continue;
      }
      const h = landAt(x, y);
      const edge = x < -30 || x > 490 || y > 400;
      const keep = edge ? 0.5 : h > 6 ? 0.62 : h > 1.5 ? 0.45 : 0;
      if (hash2(n, 17) > keep || !dry(x, y) || !clear(x, y, 3.2)) {
        continue;
      }
      /* Pines on the headland and over the bay, broadleaf elsewhere. */
      const coast = y < 92 && (x < 170 || x > 430);
      put(coast && hash2(n, 19) < 0.7 ? 'pine' : 'oak', x, y, 1 + (hash2(n, 23) - 0.5) * 0.35, 5000 + n);
    }
  }

  /* THE BAMBOO, clumps three and a half metres apart, with the lane cut
   * north to south through the middle of the grove. */
  n = 0;
  const lane = (BAMBOO.x0 + BAMBOO.x1) / 2;
  for (let py = BAMBOO.y0; py <= BAMBOO.y1; py += 3.4) {
    for (let px = BAMBOO.x0; px <= BAMBOO.x1; px += 3.4) {
      n += 1;
      const x = px + (hash2(n, 29) - 0.5) * 1.6;
      const y = py + (hash2(n, 31) - 0.5) * 1.6;
      if (Math.abs(x - lane) < 2.6 || !dry(x, y) || !clear(x, y, 1)) {
        continue;
      }
      put('bamboo', x, y, 1, 9000 + n);
    }
  }
  return out;
}

/* The bamboo lane, for the named gap: its middle and its width. */
export const BAMBOO_LANE = { px: (BAMBOO.x0 + BAMBOO.x1) / 2, w: 2.6 * 2 };
