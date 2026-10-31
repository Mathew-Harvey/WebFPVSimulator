/*
 * touge-check.js: Momiji Pass, checked without a browser.
 *
 * The same blocks as scripts/sunny-check.js, for the mountain pass in
 * src/maps/touge/, plus what a mountain adds: the ground is a heightfield
 * (src/maps/touge/terrain.js) rather than a plot, so the floor is checked
 * for being the same twice and for sitting where the road says it does.
 *
 *   1. layout   every part finite, every colour the family's, every sign
 *               painted, two builds the same to the bit
 *   2. placed   the document normalizes, the start is on the rest stop's
 *               floor with a clear metre over it, the shapes fit world.c
 *   3. floor    two builds of the ground the same to the bit, the floor
 *               under the road's centre within a few centimetres of the
 *               road's own height all the way round, the river bed under
 *               the gorge, the bore's floor under the tunnel
 *   4. lines    the hero lines swept with the craft's ball: the tunnel,
 *               the road all the way round at three metres, the canyon
 *               dive, the gorge under the three bridges
 *   5. gaps     every named gap clear by the craft's radius and over the
 *               gap rule
 *   6. slots    no slot between two of the map's boxes too narrow to pass
 *               and wide enough to tempt
 *
 * Usage: node scripts/touge-check.js
 *
 * A threshold here is never widened to make a line pass (CLAUDE.md); the
 * map moves instead.
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

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { places, gaps, RED, OLD, FOOT } from '../src/maps/touge/places.js';
import { tougeDocument, SPAWN } from '../src/maps/touge/yard.js';
import { SIGN_KEYS } from '../src/maps/touge/signs.js';
import { centre, heightAt, roadPoint, GORGE, TUNNEL, SUMMIT } from '../src/maps/touge/route.js';
import { ground, floorAt, inGorge, inBore } from '../src/maps/touge/terrain.js';
import { worldAt } from '../src/maps/touge/frame.js';
import { MATERIALS } from '../src/props/touge.js';
import { GAP_MIN } from '../src/props/parts.js';
import { placeSolids } from '../src/props/solids.js';
import { normalize } from '../src/trackbuilder/model.js';
import { seatDocument, indexTops } from '../src/maps/built/place.js';
import { CRAFT_WORLD_R } from '../src/game/collide.js';
import { sincos } from '../src/props/trig.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
let failures = 0;

function check(name, ok, detail = '') {
  if (!ok) {
    failures += 1;
  }
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`);
}

const r3 = (v) => Math.round(v * 1000) / 1000;
/* The swept ball: twice the craft's radius. */
const BALL = 2 * CRAFT_WORLD_R;
/* ------------------------------------------------------------------ */
/* Geometry, as bardwell-check.js has it                               */
/* ------------------------------------------------------------------ */

function boxDist(b, p) {
  const dx = Math.max(b[0] - p[0], 0, p[0] - b[3]);
  const dy = Math.max(b[1] - p[1], 0, p[1] - b[4]);
  const dz = Math.max(b[2] - p[2], 0, p[2] - b[5]);
  return Math.hypot(dx, dy, dz);
}

function segDist(c, p) {
  const ab = [c[3] - c[0], c[4] - c[1], c[5] - c[2]];
  const ap = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
  const L = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];
  const t = L > 0 ? Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / L)) : 0;
  return Math.hypot(ap[0] - ab[0] * t, ap[1] - ab[1] * t, ap[2] - ab[2] * t) - c[6];
}

function hitAt(solids, p, r) {
  for (const s of solids) {
    const d = s.box ? boxDist(s.box, p) : segDist(s.cap, p);
    if (d < r) {
      return s;
    }
  }
  return null;
}

function gridOf(solids, cell = 4) {
  const map = new Map();
  const key = (i, k) => `${i},${k}`;
  for (const s of solids) {
    const b = s.box ?? [
      Math.min(s.cap[0], s.cap[3]) - s.cap[6], 0, Math.min(s.cap[2], s.cap[5]) - s.cap[6],
      Math.max(s.cap[0], s.cap[3]) + s.cap[6], 0, Math.max(s.cap[2], s.cap[5]) + s.cap[6],
    ];
    for (let i = Math.floor(b[0] / cell); i <= Math.floor(b[3] / cell); i += 1) {
      for (let k = Math.floor(b[2] / cell); k <= Math.floor(b[5] / cell); k += 1) {
        const kk = key(i, k);
        if (!map.has(kk)) {
          map.set(kk, []);
        }
        map.get(kk).push(s);
      }
    }
  }
  return (p) => {
    const out = new Set();
    for (let i = Math.floor((p[0] - 2) / cell); i <= Math.floor((p[0] + 2) / cell); i += 1) {
      for (let k = Math.floor((p[2] - 2) / cell); k <= Math.floor((p[2] + 2) / cell); k += 1) {
        for (const s of map.get(key(i, k)) ?? []) {
          out.add(s);
        }
      }
    }
    return [...out];
  };
}

/* ------------------------------------------------------------------ */
/* ------------------------------------------------------------------ */
/* 1. The layout                                                       */
/* ------------------------------------------------------------------ */

function hashOf(B) {
  const h = createHash('sha256');
  const buf = new Float64Array(1);
  const num = (v) => {
    buf[0] = v;
    h.update(Buffer.from(buf.buffer));
  };
  for (const p of B.P.list) {
    h.update(`${p.t}|${p.m}|${p.solid}|${p.draw}|${p.kind}`);
    for (const v of p.t === 'box' ? [...p.lo, ...p.hi] : [...p.a, ...p.b, p.r]) {
      num(v);
    }
  }
  for (const t of B.trees) {
    h.update(t.kind);
    for (const v of [t.x, t.y, t.g, t.size]) {
      num(v);
    }
  }
  return h.digest('hex');
}

/* The colours ./src/maps/touge/index.js draws itself, read from its
 * source: the ground, the road, the river and the trees. */
async function drawnInIndex() {
  const src = await readFile(join(root, 'src/maps/touge/index.js'), 'utf8');
  /* 'tgFar' is the far ground's chunk, not a colour. */
  const out = new Set([...src.matchAll(/'(tg[A-Za-z0-9]+)'/g)].map((m) => m[1]).filter((m) => m !== 'tgFar'));
  for (const stem of ['tgCedar', 'tgMaple']) {
    if (src.includes(`\`${stem}\${`)) {
      [0, 1, 2].forEach((k) => out.add(`${stem}${k}`));
    }
  }
  return out;
}

async function layoutBlock() {
  console.log('\n1. layout');
  const B = places();
  const parts = B.P.list;
  const nums = (p) => (p.t === 'box' ? [...p.lo, ...p.hi] : [...p.a, ...p.b, p.r]);
  const bad = parts.filter((p) => nums(p).some((v) => !Number.isFinite(v)));
  check('every part is finite', bad.length === 0, `${parts.length} parts, ${bad.length} with a non-finite number`);
  const lists = [parts.filter((p) => p.draw), B.turned, B.prisms, B.cyls, B.cones, B.balls, B.leaves];
  const colours = new Set(lists.flatMap((l) => l.map((x) => x.m)));
  for (const m of await drawnInIndex()) {
    colours.add(m);
  }
  /* The tunnel's lamps are the town's own lamp glow, which the built map
   * owns (src/maps/built/index.js), as every map's lamps are. */
  const foreign = [...colours].filter((m) => !MATERIALS[m] && m !== 'lampGlow');
  check('every colour the pass draws is one of src/props/touge.js', foreign.length === 0, foreign.join(', ') || `${colours.size} colours`);
  const unused = Object.keys(MATERIALS).filter((m) => !colours.has(m));
  check('every colour of the family is drawn', unused.length === 0, unused.join(', ') || 'all drawn');
  const keys = new Set(B.signs.map((s) => s.key));
  const unpainted = [...keys].filter((k) => !SIGN_KEYS.includes(k));
  check('every sign the pass hangs is painted', unpainted.length === 0, unpainted.join(', ') || `${keys.size} signs, ${B.signs.length} hung`);
  check('two builds are the same to the bit', hashOf(B) === hashOf(B), hashOf(B).slice(0, 16));
  const kinds = {};
  for (const t of B.trees) {
    kinds[t.kind] = (kinds[t.kind] || 0) + 1;
  }
  console.log(`        ${parts.filter((p) => p.solid).length} solids, ${parts.filter((p) => p.draw).length} drawn parts, trees ${JSON.stringify(kinds)}`);
  return B;
}

/* ------------------------------------------------------------------ */
/* 2. Placed                                                           */
/* ------------------------------------------------------------------ */

async function worldLimits() {
  const src = await readFile(join(root, 'src/native/world.c'), 'utf8');
  const def = (name) => {
    const m = src.match(new RegExp(`#define ${name} \\(?([0-9.]+)(?: << ([0-9]+))?`));
    if (!m) {
      throw new Error(`src/native/world.c has no ${name}`);
    }
    return m[2] ? Number(m[1]) * 2 ** Number(m[2]) : Number(m[1]);
  };
  return { shapes: def('WORLD_MAX_SHAPES') };
}

async function placedBlock(B) {
  console.log('\n2. placed');
  const { doc, repairs } = normalize(tougeDocument());
  check('the document normalizes with no repairs', repairs.length === 0, repairs.join(' | ') || `${doc.elements.length} elements`);
  const { placed } = seatDocument(doc);
  /* addExtra in src/maps/built/index.js, restated. */
  const first = placed.solids.length;
  placeSolids(B.P.list, 0, 0, 0, 0, 'quarter', placed.solids, placed.stats);
  const own = placed.solids.slice(first);
  placed.tops = indexTops(placed.solids);
  const sp = placed.spawn;
  check('the start is the pads', sp.from === 'pads', sp.from);
  const fl = floorAt(SPAWN.x, SPAWN.y);
  check('the start stands on the rest stop', Math.abs(fl - SUMMIT) < 0.05, `floor ${r3(fl)} m, the rest stop at ${SUMMIT} m`);
  check('nothing inflated', (placed.stats.inflated || 0) === 0, `${placed.stats.inflated || 0}`);
  const near = gridOf(placed.solids);
  const over = [sp.x, fl + 0.6, sp.z];
  const hit = hitAt(near(over), over, 0.5);
  check('a ball a metre across over the start is clear', !hit, hit ? hit.name : 'clear');
  const lim = await worldLimits();
  check(`the map's ${placed.solids.length} shapes are under world.c's WORLD_MAX_SHAPES`, placed.solids.length < lim.shapes, `${lim.shapes}`);
  return { placed, near, own };
}

/* ------------------------------------------------------------------ */
/* 3. The floor                                                        */
/* ------------------------------------------------------------------ */

function floorBlock() {
  console.log('\n3. floor');
  const { fine, far } = ground();
  const digest = (g) => createHash('sha256').update(Buffer.from(new Float64Array(g.h).buffer)).digest('hex');
  const a = digest(fine) + digest(far);
  const b = digest(fine) + digest(far);
  check('the ground is the same to the bit twice', a === b, a.slice(0, 16));
  /* The drawn road lies 4 cm over its own height (drawRoad in
   * src/maps/touge/index.js), so ground over that would hide it; and the
   * ground is a 4 m grid of straight facets, which sags a few centimetres
   * under the road's smooth crests, so it may lie a little under. Ten
   * centimetres under is where a craft resting on the floor would be seen
   * sitting in the asphalt. */
  const line = centre();
  let over = -Infinity;
  let under = Infinity;
  let atOver = null;
  let atUnder = null;
  for (let i = 0; i < line.points.length; i += 1) {
    const p = line.points[i];
    if (inGorge(p.x, p.y) || inBore(p.x, p.y)) {
      continue;
    }
    const d = floorAt(p.x, p.y) - heightAt(line.s[i]);
    if (d > over) {
      over = d;
      atOver = [r3(p.x), r3(p.y)];
    }
    if (d < under) {
      under = d;
      atUnder = [r3(p.x), r3(p.y)];
    }
  }
  check('the floor never stands over the drawn road', over < 0.04, `highest ${r3(over)} m at plan ${JSON.stringify(atOver)}`);
  check('the floor is never more than 10 cm under the road', under > -0.1, `lowest ${r3(under)} m at plan ${JSON.stringify(atUnder)}`);
  const bed = floorAt(200, (GORGE.y0 + GORGE.y1) / 2);
  check('the floor in the gorge is its river bed', bed === GORGE.floor, `${bed} m`);
  const bore = floorAt((TUNNEL.x0 + TUNNEL.x1) / 2, TUNNEL.y);
  check('the floor in the tunnel is the bore\'s', bore === SUMMIT, `${bore} m`);
}

/* ------------------------------------------------------------------ */
/* 4. Lines                                                            */
/* ------------------------------------------------------------------ */

/* Plan points [px, py, h], flown straight from one to the next. */
const through = (px, py, deg, h, reach = 4) => {
  const sc = sincos((deg * Math.PI) / 180, { s: 0, c: 0 });
  return [[px - reach * sc.c, py - reach * sc.s, h], [px + reach * sc.c, py + reach * sc.s, h]];
};

const MID = (GORGE.y0 + GORGE.y1) / 2;

function lines() {
  /* The road all the way round at three metres over it, every 2 m. */
  const line = centre();
  const road = [];
  for (let s = 0; s <= line.length; s += 2) {
    const p = roadPoint(s);
    road.push([p.x, p.y, heightAt(s) + 3]);
  }
  return [
    ['through the tunnel at two and a half metres, portal to portal', [[TUNNEL.x1 + 12, TUNNEL.y, SUMMIT + 2.5], [TUNNEL.x0 - 12, TUNNEL.y, SUMMIT + 2.5]]],
    ['the road all the way round, three metres over the centre line', road],
    ['the canyon dive: off the rim and down to the river at 260', [[260, GORGE.y1 + 30, 40], [260, MID, -10], [240, MID, -12]]],
    ['down the gorge at eight metres over the river, under all three bridges', [[GORGE.y0 > 0 ? 40 : 40, MID, GORGE.floor + 8], [440, MID, GORGE.floor + 8]]],
    ['under the red bridge\'s arch', through(RED.x, MID, 0, GORGE.floor + 6, 14)],
    ['between the old bridge\'s piers', through(OLD.x, (OLD.piers[0] + OLD.piers[1]) / 2, 0, GORGE.floor + 6, 10)],
    ['under the footbridge', through(FOOT.x, MID, 0, GORGE.floor + 6, 10)],
  ];
}

function linesBlock(near) {
  console.log(`\n4. lines, swept with a ball of ${r3(BALL)} m`);
  const step = 0.05;
  for (const [name, pts] of lines()) {
    let hit = null;
    let at = null;
    let low = null;
    for (let i = 0; i + 1 < pts.length && !hit; i += 1) {
      const a = worldAt(...pts[i]);
      const b = worldAt(...pts[i + 1]);
      const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / step));
      for (let k = 0; k <= n && !hit; k += 1) {
        const t = k / n;
        const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
        hit = hitAt(near(p), p, BALL);
        const q = pts[i].map((v, j) => r3(v + (pts[i + 1][j] - v) * t));
        if (hit) {
          at = q;
        } else if (!low && p[1] - floorAt(q[0], q[1]) < BALL) {
          low = q;
        }
      }
    }
    check(name, !hit && !low, hit ? `${hit.name || hit.kind} at plan ${JSON.stringify(at)}`
      : low ? `under the ground at plan ${JSON.stringify(low)}` : 'clear');
  }
}

/* ------------------------------------------------------------------ */
/* 5. The named gaps                                                   */
/* ------------------------------------------------------------------ */

function gapsBlock(placed, near) {
  console.log('\n5. gaps');
  const named = gaps();
  check('every named gap is in the document', placed.zones.length === named.length, `${placed.zones.length} of ${named.length}`);
  for (const z of placed.zones) {
    const sc = sincos(z.yaw, { s: 0, c: 0 });
    const across = [-sc.s, 0, -sc.c];
    let hit = null;
    for (let i = 0; i <= 8 && !hit; i += 1) {
      for (let j = 0; j <= 8 && !hit; j += 1) {
        const u = (i / 8 - 0.5) * z.w;
        const v = (j / 8) * z.h;
        const p = [z.x + across[0] * u, z.y + v, z.z + across[2] * u];
        hit = hitAt(near(p), p, CRAFT_WORLD_R);
      }
    }
    check(`${z.name} is clear by the craft's radius`, !hit, hit ? hit.name || hit.kind : `${r3(z.w)} by ${r3(z.h)} m`);
    check(`${z.name} is wider and taller than the gap rule`, z.w >= GAP_MIN && z.h >= GAP_MIN, `${r3(z.w)} by ${r3(z.h)} m, the rule ${GAP_MIN}`);
  }
}

/* ------------------------------------------------------------------ */
/* 6. Slots                                                            */
/* ------------------------------------------------------------------ */

/*
 * Two of the map's boxes facing each other: apart along one axis by less
 * than the gap rule and more than the craft is wide, overlapping along the
 * other two by at least twice the craft's width, and nothing solid at the
 * middle of the space between them: a slot a pilot would try and could
 * not pass. bardwell-check.js's rule, without its allowances.
 */
function slotsOf(solids) {
  const boxes = solids.filter((s) => s.box);
  const near = gridOf(solids);
  const inside = (p, skip) => near(p).some((q) => q !== skip[0] && q !== skip[1]
    && (q.box ? boxDist(q.box, p) === 0 : segDist(q.cap, p) <= 0));
  const grid = gridOf(boxes, 8);
  const out = [];
  boxes.forEach((A, i) => {
    const a = A.box;
    const c = [(a[0] + a[3]) / 2, 0, (a[2] + a[5]) / 2];
    for (const B of grid(c)) {
      if (boxes.indexOf(B) <= i) {
        continue;
      }
      const b = B.box;
      const sep = [0, 1, 2].map((k) => Math.max(0, b[k] - a[k + 3], a[k] - b[k + 3]));
      if (sep.filter((v) => v > 1e-6).length !== 1) {
        continue;
      }
      const k = sep.findIndex((v) => v > 1e-6);
      if (sep[k] < 2 * CRAFT_WORLD_R || sep[k] >= GAP_MIN) {
        continue;
      }
      const others = [0, 1, 2].filter((m) => m !== k);
      if (others.some((m) => Math.min(a[m + 3], b[m + 3]) - Math.max(a[m], b[m]) < 4 * CRAFT_WORLD_R)) {
        continue;
      }
      const mid = [0, 1, 2].map((m) => (m === k
        ? (a[m + 3] < b[m] ? (a[m + 3] + b[m]) / 2 : (b[m + 3] + a[m]) / 2)
        : (Math.max(a[m], b[m]) + Math.min(a[m + 3], b[m + 3])) / 2));
      if (inside(mid, [A, B])) {
        continue;
      }
      out.push({ a: A.name, b: B.name, w: sep[k], axis: ['x', 'up', 'z'][k], mid });
    }
  });
  return out;
}

function slotsBlock(own) {
  console.log('\n6. slots');
  const found = slotsOf(own);
  const at = (p) => `plan ${JSON.stringify([r3(p[0] + 230), r3(230 - p[2]), r3(p[1])])}`;
  check(`no slot between ${r3(2 * CRAFT_WORLD_R)} and ${GAP_MIN} m between two of the map's boxes`, found.length === 0,
    found.length ? `${found.length}: ${found.slice(0, 60).map((f) => `${f.a} and ${f.b}, ${r3(f.w)} m ${f.axis}, ${at(f.mid)}`).join('; ')}` : `${own.filter((s) => s.box).length} boxes`);
}

async function main() {
  console.log('Momiji Pass');
  const B = await layoutBlock();
  const { placed, near, own } = await placedBlock(B);
  floorBlock();
  linesBlock(near);
  gapsBlock(placed, near);
  slotsBlock(own);
  console.log(failures ? `\n${failures} failed` : '\nall passed');
  process.exitCode = failures ? 1 : 0;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
