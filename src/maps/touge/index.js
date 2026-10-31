/*
 * index.js: Momiji Pass as a map, built the way Sunnyfield is
 * (../sunny/index.js): the built map's pipeline (../built/index.js) does
 * the sky, the light, the fog, the ink, the shadows, the colliders, the
 * cull, the named gaps, the moving cars and the marks. This file hands it
 * the pass's document (./yard.js) and everything built (./places.js) as
 * one structure of its own, with the ground the plant is given
 * (./terrain.js) as its floor, and draws what parts cannot say: the
 * mountain itself, the road and its paint, the guardrails' beams, the
 * gorge's river, the roofs, the trees, the cables and the signs.
 *
 * THE MOUNTAIN is the ground grid's own triangles, coloured by what they
 * are: the verge by the road, cut slopes and bare rock where it is steep,
 * the car park's gravel, the harvested fields, meadow on the valley floor
 * and forest floor on the mountain. One batch a colour a chunk, so the
 * whole mountain is a few draw calls, and it is inked like everything else
 * by the town's post pass, which is what turns its ridges into lines.
 *
 * FOR THE LATENCY RULE: nothing on any other map (this file loads only when
 * the map is chosen). On this map everything is baked at load into the
 * built map's batches, one draw call a colour a chunk, ten chunks; the
 * signs are one mesh; nothing is animated but the cars, which the physics
 * module drives as on every built map. Per frame on the CPU: the built
 * map's own cull and car poses, nothing more, nothing allocated.
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

import * as THREE from 'three';
import { buildMap as buildBuilt } from '../built/index.js';
import { warmPrograms } from '../../render/warm.js';
import { qualityFor } from '../../render/quality.js';
import { paintMaterial } from '../../art/stf.js';
import { signAspect } from '../../art/partnermark.js';
import { PARTNERS, MAP_ONLY_PARTNERS, PATRON_MAP_BRANDS, shownOn } from '../../partners/roster.js';
import { W, D, wx, wz, worldAt, chunkOf, hash2 } from './frame.js';
import {
  centre, heightAt, nearest, HALF, BENCH, SUMMIT, GORGE, REST, TUNNEL,
} from './route.js';
import {
  ground, worldFloor, inGorge, lipsAt, GORGE_X0, FINE,
} from './terrain.js';
import { places, konexSpot, TEA } from './places.js';
import { FIELDS } from './places.js';
import { shapeOf } from './trees.js';
import { tougeDocument, CAR_SPEED } from './yard.js';
import { paintSigns, signMesh } from './signs.js';

/* ------------------------------------------------------------------ */
/* The mountain                                                        */
/* ------------------------------------------------------------------ */

/* What a ground triangle is, from where it is and how steep. */
function groundMaterial(px, py, h, ny) {
  const near = nearest(px, py, 30);
  const d = near ? near.d : 99;
  if (px > REST.x0 - 1 && px < REST.x1 + 1 && py > REST.y0 - 1 && py < REST.y1 + 1) {
    return 'tgGravel';
  }
  if (d < BENCH + 0.5 && Math.abs(h - heightAt(near.s)) < 0.6) {
    return 'tgVerge';
  }
  if (ny < 0.74) {
    return d < 30 ? 'tgCut' : 'tgRock';
  }
  if (px > FIELDS.x0 && px < FIELDS.x1 && py > FIELDS.y0 && py < FIELDS.y1) {
    return 'tgField';
  }
  if (py > 14 && py < 152 && h < 2) {
    return 'tgGrass';
  }
  const meadow = hash2(Math.floor(px / 24), Math.floor(py / 24), 31) < 0.18;
  return meadow ? 'tgGrass' : 'tgForest';
}

/* Ground triangles, filed by chunk and colour, each list a flat array of
 * world positions. */
function addGrid(bins, g, skip, chunkFor) {
  const n = g.nx;
  const P = (i, j) => [g.x0 + i * g.step, g.y0 + j * g.step, g.h[j * n + i]];
  const put = (a, b, c) => {
    const cx = (a[0] + b[0] + c[0]) / 3;
    const cy = (a[1] + b[1] + c[1]) / 3;
    if (skip(cx, cy)) {
      return;
    }
    /* The face's normal, in the plan frame with h up, for its slope. */
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uh = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vh = c[2] - a[2];
    const nx = uy * vh - uh * vy;
    const nyp = uh * vx - ux * vh;
    const nh = ux * vy - uy * vx;
    const len = Math.sqrt(nx * nx + nyp * nyp + nh * nh) || 1;
    const up = Math.abs(nh / len);
    const m = groundMaterial(cx, cy, (a[2] + b[2] + c[2]) / 3, up);
    const ch = chunkFor(wx(cx), wz(cy));
    const key = `${ch}|${m}`;
    let list = bins.get(key);
    if (!list) {
      list = { chunk: ch, m, pos: [] };
      bins.set(key, list);
    }
    /* Wound counter clockwise from above in the world frame: the plan's
     * y flips to the world's -z, so the plan's clockwise is kept. */
    for (const p of nh > 0 ? [a, c, b] : [a, b, c]) {
      list.pos.push(wx(p[0]), p[2], wz(p[1]));
    }
  };
  for (let j = 0; j + 1 < g.ny; j += 1) {
    for (let i = 0; i + 1 < n; i += 1) {
      const p00 = P(i, j);
      const p10 = P(i + 1, j);
      const p01 = P(i, j + 1);
      const p11 = P(i + 1, j + 1);
      /* Split along (i, j) to (i + 1, j + 1), as terrain.js samples. */
      put(p00, p10, p11);
      put(p00, p11, p01);
    }
  }
}

function drawMountain(kit) {
  const { fine, far } = ground();
  const bins = new Map();
  addGrid(bins, fine, (x, y) => inGorge(x, y), chunkOf);
  const inside = (x, y) => x > FINE.x0 + 8 && x < FINE.x1 - 8 && y > FINE.y0 + 8 && y < FINE.y1 - 8;
  addGrid(bins, far, inside, () => 'tgFar');
  for (const b of bins.values()) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    const merged = mergeVertices(g);
    merged.computeVertexNormals();
    kit.begin(0, 0, 0, 0, b.chunk);
    kit.add(b.m, merged);
  }
}

/* Shared corners welded, so the ground shades smooth within a colour. */
function mergeVertices(g) {
  const pos = g.attributes.position.array;
  const map = new Map();
  const out = [];
  const index = [];
  for (let i = 0; i < pos.length; i += 3) {
    const key = `${Math.round(pos[i] * 100)},${Math.round(pos[i + 1] * 100)},${Math.round(pos[i + 2] * 100)}`;
    let k = map.get(key);
    if (k === undefined) {
      k = out.length / 3;
      map.set(key, k);
      out.push(pos[i], pos[i + 1], pos[i + 2]);
    }
    index.push(k);
  }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  m.setIndex(index);
  g.dispose();
  return m;
}

/* The gorge: its river bed, the river, and the fall at its head. */
function drawGorge(kit) {
  const bed = new Map();
  const water = new Map();
  const quad = (bins, x0, y0, x1, y1, h) => {
    const ch = chunkOf(wx((x0 + x1) / 2), wz((y0 + y1) / 2));
    let list = bins.get(ch);
    if (!list) {
      list = [];
      bins.set(ch, list);
    }
    const a = [wx(x0), h, wz(y0)];
    const b = [wx(x1), h, wz(y0)];
    const c = [wx(x1), h, wz(y1)];
    const d = [wx(x0), h, wz(y1)];
    list.push(...a, ...b, ...c, ...a, ...c, ...d);
  };
  for (let sx = GORGE_X0; sx < W + 20; sx += 8) {
    const [a, b] = lipsAt(sx);
    quad(bed, sx, a, sx + 8, b, GORGE.floor);
    /* The river wanders a little inside its bed. */
    const mid = (GORGE.y0 + GORGE.y1) / 2 + (hash2(Math.floor(sx / 8), 1, 51) - 0.5) * 6;
    const half = 5 + hash2(Math.floor(sx / 8), 2, 52) * 3;
    quad(water, sx, Math.max(a + 1, mid - half), sx + 8, Math.min(b - 1, mid + half), GORGE.water);
  }
  for (const [bins, m] of [[bed, 'tgRiverBed'], [water, 'tgWater']]) {
    for (const [ch, list] of bins) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(list, 3));
      g.computeVertexNormals();
      kit.begin(0, 0, 0, 0, ch);
      kit.add(m, g);
    }
  }
  /* The fall: a sheet of white water down the head wall, and its spray. */
  const [a0, b0] = lipsAt(GORGE_X0);
  const mid = (a0 + b0) / 2;
  kit.begin(0, 0, 0, 0, chunkOf(wx(GORGE_X0), wz(mid)));
  kit.box('tgFoam', wx(GORGE_X0) + 0.05, GORGE.floor + 0.2, wz(mid + 3), wx(GORGE_X0) + 0.6, 0.2, wz(mid - 3));
  kit.box('tgWater', wx(GORGE_X0) + 0.02, GORGE.floor + 0.2, wz(mid + 4), wx(GORGE_X0) + 0.3, 0.1, wz(mid - 4));
  for (let k = 0; k < 7; k += 1) {
    kit.blob('tgFoam', [wx(GORGE_X0) + 1.5 + (k % 3), GORGE.floor + 0.6, wz(mid - 3 + k)], 1.1, 0.6, [0, k, 0]);
  }
  /* The stream that feeds it, across the valley floor from the west. */
  kit.box('tgWater', wx(-20), 0.02, wz(mid + 2.5), wx(GORGE_X0 - 6), 0.06, wz(mid - 2.5));
}

/* ------------------------------------------------------------------ */
/* The road                                                            */
/* ------------------------------------------------------------------ */

/* Strips along the road, filed by chunk: each [off0, off1] metres from the
 * centre to its left, `lift` over the road, every `every` points. */
function drawRoad(kit, low) {
  const line = centre();
  const n = line.points.length;
  const strips = [
    { m: 'tgAsphalt', a: -HALF - 0.3, b: HALF + 0.3, lift: 0.04 },
    { m: 'tgLineWhite', a: -HALF + 0.05, b: -HALF + 0.2, lift: 0.055 },
    { m: 'tgLineWhite', a: HALF - 0.2, b: HALF - 0.05, lift: 0.055 },
    { m: 'tgLineYellow', a: -0.075, b: 0.075, lift: 0.055 },
  ];
  for (const st of strips) {
    const bins = new Map();
    for (let i = 0; i < n; i += 1) {
      const j = (i + 1) % n;
      const p = line.points[i];
      const q = line.points[j];
      const tp = line.tangents[i];
      const tq = line.tangents[j];
      const hp = heightAt(line.s[i]) + st.lift;
      const hq = heightAt(j === 0 ? line.length : line.s[j]) + st.lift;
      const ch = chunkOf(wx((p.x + q.x) / 2), wz((p.y + q.y) / 2));
      let list = bins.get(ch);
      if (!list) {
        list = [];
        bins.set(ch, list);
      }
      const A = [wx(p.x - tp.y * st.a), hp, wz(p.y + tp.x * st.a)];
      const B = [wx(p.x - tp.y * st.b), hp, wz(p.y + tp.x * st.b)];
      const C = [wx(q.x - tq.y * st.b), hq, wz(q.y + tq.x * st.b)];
      const Dd = [wx(q.x - tq.y * st.a), hq, wz(q.y + tq.x * st.a)];
      /* Left of the line is +a; seen from above the strip A B C D runs
       * right to left then forward, which in the world (z flipped) winds
       * counter clockwise from above. */
      list.push(...A, ...Dd, ...C, ...A, ...C, ...B);
    }
    for (const [ch, list] of bins) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(list, 3));
      g.computeVertexNormals();
      fixUp(g);
      kit.begin(0, 0, 0, 0, ch);
      kit.add(st.m, g);
    }
  }
  void low;
}

/* A strip laid on the ground faces up whichever way it was wound. */
function fixUp(g) {
  const nrm = g.attributes.normal;
  if (nrm.count && nrm.getY(0) < 0) {
    const pos = g.attributes.position.array;
    for (let i = 0; i < pos.length; i += 9) {
      for (let c = 0; c < 3; c += 1) {
        const t = pos[i + 3 + c];
        pos[i + 3 + c] = pos[i + 6 + c];
        pos[i + 6 + c] = t;
      }
    }
    g.computeVertexNormals();
  }
}

/* The guardrails' beams: a band along each run, both faces. */
function drawRails(kit, rails) {
  const bins = new Map();
  for (const r of rails) {
    for (let k = 0; k + 1 < r.pts.length; k += 1) {
      const p = r.pts[k];
      const q = r.pts[k + 1];
      const ch = chunkOf(wx((p[0] + q[0]) / 2), wz((p[1] + q[1]) / 2));
      let list = bins.get(ch);
      if (!list) {
        list = [];
        bins.set(ch, list);
      }
      const a0 = [wx(p[0]), p[2] + 0.5, wz(p[1])];
      const a1 = [wx(p[0]), p[2] + 0.82, wz(p[1])];
      const b0 = [wx(q[0]), q[2] + 0.5, wz(q[1])];
      const b1 = [wx(q[0]), q[2] + 0.82, wz(q[1])];
      list.push(...a0, ...b0, ...b1, ...a0, ...b1, ...a1);
      list.push(...a0, ...b1, ...b0, ...a0, ...a1, ...b1);
      /* The beam's fold, a darker line along its middle, as a W beam's
       * two ridges read from the road. */
    }
  }
  for (const [ch, list] of bins) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(list, 3));
    g.computeVertexNormals();
    kit.begin(0, 0, 0, 0, ch);
    kit.add('tgRail', g);
  }
}

/* ------------------------------------------------------------------ */
/* Everything else the builder holds                                   */
/* ------------------------------------------------------------------ */

function drawTurned(kit, list, low) {
  for (const t of list) {
    if (low && t.fine) {
      continue;
    }
    const [x, y, z] = worldAt(t.x, t.y, t.h);
    kit.begin(x, y, z, Math.atan2(t.dir[1], t.dir[0]), chunkOf(x, z));
    const [u0, v0, h0, u1, v1, h1] = t.b;
    kit.box(t.m, u0, h0, -v1, u1, h1, -v0);
  }
}

function drawPrisms(kit, prisms, low) {
  for (const p of prisms) {
    if (low && p.fine) {
      continue;
    }
    const lo = Math.min(...p.profile.map(([a]) => a));
    const hi = Math.max(...p.profile.map(([a]) => a));
    if (p.axis === 'x') {
      kit.begin(0, 0, 0, Math.PI / 2, chunkOf(wx((p.e0 + p.e1) / 2), wz((lo + hi) / 2)));
      kit.extrude(p.m, p.profile.map(([a, h]) => [a - D / 2, h]), p.e0 - W / 2, p.e1 - W / 2);
    } else {
      kit.begin(0, 0, 0, 0, chunkOf(wx((lo + hi) / 2), wz((p.e0 + p.e1) / 2)));
      kit.extrude(p.m, p.profile.map(([a, h]) => [a - W / 2, h]), D / 2 - p.e1, D / 2 - p.e0);
    }
  }
}

function drawRound(kit, B, low) {
  for (const c of B.cyls) {
    if (low && c.fine) {
      continue;
    }
    kit.begin(0, 0, 0, 0, chunkOf(c.a[0], c.a[2]));
    kit.cyl(c.m, c.a, c.b, c.r, c.seg, c.rTop);
  }
  for (const c of B.cones) {
    if (low && c.fine) {
      continue;
    }
    kit.begin(0, 0, 0, 0, chunkOf(c.c[0], c.c[2]));
    kit.cone(c.m, c.c, c.r, c.height, c.seg);
  }
  for (const b of B.balls) {
    if (low && b.fine) {
      continue;
    }
    kit.begin(0, 0, 0, 0, chunkOf(b.c[0], b.c[2]));
    kit.ball(b.m, b.c, b.r);
  }
  for (const l of B.leaves) {
    kit.begin(0, 0, 0, 0, chunkOf(l.c[0], l.c[2]));
    kit.leaf(l.m, l.c, l.r, l.ry, l.spin);
  }
  for (const w of B.wires) {
    const a = new THREE.Vector3(...w.a);
    const b = new THREE.Vector3(...w.b);
    const c = a.clone().add(b).multiplyScalar(0.5);
    c.y -= 2 * w.sag;
    kit.begin(0, 0, 0, 0, chunkOf(c.x, c.z));
    kit.add(w.m, new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, c, b), 12, w.r, 3, false));
  }
}

/* The trees: a cedar is a trunk under three cones, a maple a trunk under
 * four red clumps, a ginkgo a gold column of three. */
function drawTrees(kit, trees) {
  const cone = new THREE.ConeGeometry(1, 1, 7, 1);
  cone.translate(0, 0.5, 0);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  for (const t of trees) {
    const sh = shapeOf(t);
    const [x, , z] = worldAt(t.x, t.y, 0);
    const g = t.g;
    kit.begin(0, 0, 0, 0, chunkOf(x, z));
    if (t.kind === 'sugi') {
      kit.cyl('tgTrunk', [x, g - 0.2, z], [x, g + sh.crown0 + 1, z], sh.trunk, 5);
      const tiers = [[sh.crown0, sh.r, sh.H * 0.42], [sh.crown0 + sh.H * 0.26, sh.r * 0.78, sh.H * 0.38], [sh.crown0 + sh.H * 0.5, sh.r * 0.52, sh.H * 0.5 - sh.crown0 * 0.2]];
      tiers.forEach(([h0, r, h], k) => {
        v.set(x, g + h0, z);
        q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, t.k * 0.7 + k);
        s.set(r, h, r);
        m4.compose(v, q, s);
        kit.add(`tgCedar${(t.tone + k) % 3}`, cone, m4.clone());
      });
      continue;
    }
    kit.cyl('tgTrunk', [x, g - 0.2, z], [x, g + sh.crown0 + 0.8, z], sh.trunk, 5, sh.trunk * 0.7);
    if (t.kind === 'icho') {
      for (let k = 0; k < 3; k += 1) {
        const r = sh.r * (1 - k * 0.22);
        kit.leaf('tgGinkgo', [x, g + sh.crown0 + 1.6 + k * 2.6, z], r, r * 0.9, [0, t.k + k, 0]);
      }
      continue;
    }
    const cy = g + (sh.crown0 + sh.H) / 2 + 0.4;
    const r = sh.r;
    for (let k = 0; k < 4; k += 1) {
      const a = t.k * 1.7 + k * 1.57;
      const ox = Math.cos(a) * r * 0.42;
      const oz = Math.sin(a) * r * 0.42;
      kit.leaf(`tgMaple${(t.tone + k) % 3}`, [x + ox, cy + (k % 2) * 0.6, z + oz], r * 0.6, r * 0.42, [0, a, 0]);
    }
    kit.leaf(`tgMaple${t.tone}`, [x, cy + 1.0, z], r * 0.55, r * 0.45, [0, t.k, 0]);
  }
}

/* ------------------------------------------------------------------ */
/* The marks                                                           */
/* ------------------------------------------------------------------ */

/* Each brand's sign: on the rest stop's stone wall, then on the tunnel's
 * portal faces, and the one hidden Konex Drone sign under the red bridge. */
function markSpots() {
  const brands = [...PARTNERS, ...MAP_ONLY_PARTNERS, ...PATRON_MAP_BRANDS].filter((p) => shownOn(p, 'touge'));
  const e = SUMMIT;
  const wall = [139, 161, 167, 201, 208].map((x) => ({ p: [wx(x), e + 1.75, wz(REST.y1) + 0.02], n: [0, 0, 1], maxH: 2.4 }));
  const hw = TUNNEL.w / 2;
  const portal = [];
  for (const [px, out] of [[TUNNEL.x1 + 1.2, 1], [TUNNEL.x0 - 1.2, -1]]) {
    for (const s of [-1, 1]) {
      portal.push({ p: [wx(px) + out * 0.02, e + 3.2, wz(TUNNEL.y + s * (hw + 2.2))], n: [out, 0, 0], maxH: 2.2 });
    }
  }
  const spots = [...wall, ...portal];
  const out = brands.slice(0, spots.length).map((brand, i) => {
    const sp = spots[i];
    const a = signAspect(brand);
    const w = Math.min(2.2, sp.maxH * a, 1.8 * a);
    return { slug: brand.slug, p: sp.p, n: sp.n, up: [0, 1, 0], w, chunk: chunkOf(sp.p[0], sp.p[2]) };
  });
  if (brands.some((b) => b.slug === 'konexdrone')) {
    const k = konexSpot();
    out.push({ slug: 'konexdrone', key: 'touge#konexdrone~hidden', p: k.p, n: k.n, up: k.up, w: k.w, chunk: chunkOf(k.p[0], k.p[2]) });
  }
  return out;
}

/* ------------------------------------------------------------------ */

export async function buildMap(shell, onProgress, options) {
  const low = qualityFor(options && options.quality).id === 'low';
  const B = places();
  const parts = low ? B.P.list.filter((p) => !(p.fine && !p.solid)) : B.P.list;
  const extra = {
    el: { id: 'touge', type: 'touge' },
    parts,
    draw: (kit) => {
      drawMountain(kit);
      drawGorge(kit);
      drawRoad(kit, low);
      drawRails(kit, B.rails);
      drawTurned(kit, B.turned, low);
      drawPrisms(kit, B.prisms, low);
      drawRound(kit, B, low);
      drawTrees(kit, B.trees);
    },
    floor: worldFloor,
    chunkOf: (x, z) => chunkOf(x, z),
  };
  const doc = tougeDocument();
  const map = await buildBuilt(shell, onProgress, {
    ...(options || {}), document: doc, extra, sponsorMarks: false, markSpots: markSpots(),
  });
  map.id = 'touge';
  map.source = 'touge';
  /* The built map's level ground and its road mesh: the mountain and the
   * road above stand in for both. */
  for (const name of ['plot', 'terrain', 'roads']) {
    const o = map.scene.getObjectByName(name);
    if (o) {
      o.visible = false;
    }
  }
  /* The cars climb: every lane point at the road's height, which the
   * module carries to the car (world.c section 5), and every car at the
   * one speed and the one cornering, so none runs into the one ahead. */
  if (map.traffic) {
    for (const r of map.traffic.roads) {
      for (const p of r.points) {
        const near = nearest(p.x + W / 2, D / 2 - p.z, 12);
        p.y = near ? heightAt(near.s) : 0;
      }
    }
    for (const v of map.traffic.vehicles) {
      v.topSpeed = CAR_SPEED;
      v.lateral = 3.2;
    }
  }
  /* The signs, one mesh on one picture. */
  const atlas = paintSigns(B.signs.map((s) => s.key));
  const tex = new THREE.CanvasTexture(atlas.canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  map.scene.add(signMesh(THREE, low ? B.signs.filter((s) => !s.near) : B.signs, atlas, paintMaterial(THREE, tex), worldAt));
  const stats = map.stats;
  map.stats = () => ({ ...(stats ? stats() : {}), trees: B.trees.length, parts: B.P.list.length });
  await warmPrograms(shell.renderer, map.scene, shell.camera, map.post.rtScene);
  void TEA;
  return map;
}
