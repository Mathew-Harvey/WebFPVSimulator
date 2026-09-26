/*
 * roadmesh.js: a built map's roads, drawn. The asphalt, the kerb along each
 * edge, and the lane paint, in the built map's cel look, merged into three
 * batches for every road on the map however many there are.
 *
 * WHAT IS DRAWN IS THE ROAD THE CARS DRIVE. Every road comes from
 * trafficOf(doc) in ./traffic.js, the same call the physics is handed its
 * lanes by, as the centre line ./road.js eased out of the author's nodes
 * (`drawn`, one entry for every road element with a line, driven or not).
 * The ribbon is that line moved to each side by half the road's width with
 * road.js laneLine, point for point, so the paint lies where a car's line
 * does. A plan point reaches the world through place.js docToWorld, the one
 * conversion every element of a built map goes through.
 *
 * FLAT AND NOT SOLID. The built map's ground is flat at zero and the
 * plant's ground plane is that ground; a road is paint on it. So nothing
 * here is a collider and nothing stands proud of the paving: the kerb is a
 * flush band of kerb stones, not a step, because a drift car's tail swings
 * half a metre past the road's edge in a bend (src/maps/built/traffic.js,
 * THE BODY) and a raised kerb would have its wheels through it. Each layer
 * is lifted a few millimetres and polygon offset toward the eye, so it never
 * fights the paving or the paving's own paint (./index.js paints its lines
 * at 4 to 10 mm), at the grazing angles where depth is thinnest.
 *
 *   asphalt   the road's width, the town's grey violet road (PAL.road)
 *   kerb      KERB_W either side of it, flush
 *   paint     edge lines EDGE_INSET in from each edge, and on a road of two
 *             lanes a dashed centre line, DASH on and DASH off, the period
 *             stretched a little on a loop so the dashes meet evenly
 *
 * All three are lit cel materials, so they take every time of day's light
 * the way the paving's own paint does, with nothing to dim at dusk.
 *
 * A TIGHT BEND NEVER FOLDS the ribbon: where the inside edge would run
 * backwards (a bend tighter than half the road's width), it waits at its
 * last point until the centre has come round, so the asphalt is a fan, not
 * a bow tie. road.js never eases a lane tighter than a metre, so on any
 * road a car can drive this is the inner kerb of a hairpin at most.
 *
 * THE API. Plain arguments in, a group out; nothing is kept at module level,
 * so every call owns what it made and dispose() frees all of it.
 *
 *   buildRoadMesh(THREE, look, traffic, opts)
 *     THREE     the three.js namespace the caller renders with
 *     look      lookOf(doc) from ./looks.js; its ground picks the kerb's
 *               stone (a darker one on a concrete yard, where the town's
 *               kerb colour is the paving's own)
 *     traffic   trafficOf(doc) from ./traffic.js: `drawn` and `field` are
 *               read, nothing else
 *     opts.y    the ground's height in world metres, 0 on a built map
 *   returns { group, roads, triangles, batches, dispose() }: a THREE.Group
 *     named 'roads' holding at most three meshes (none for a map with no
 *     road), how many roads and triangles and meshes it drew, and a dispose
 *     that frees its geometry and materials. The meshes take shadow and
 *     cast none.
 *
 *   roadCover(traffic, pad)
 *     A test for paint that must not lie on a road: returns a function
 *     (x0, x1, z0, z1) that is true when that world rectangle comes within
 *     `pad` of any drawn road's surface, kerbs included. Pure, no Three.js.
 *     ./index.js keeps its car park bays, repairs and ruts off the roads
 *     with it, and leaves out the lane it paints under a footbridge where a
 *     road already runs there.
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

import { PAL } from '../city/vendored/core/palette.js';
import { cel } from '../city/vendored/core/toon.js';
import { laneLine } from './road.js';
import { docToWorld } from './place.js';

/* The kerb band outside each edge, m: a kerb stone's width. */
export const KERB_W = 0.25;
/* Lane paint: the line's width, how far in from the road's edge an edge
 * line's middle is, and a centre dash and its gap, m. The same numbers the
 * map paints the lane under a footbridge with (./index.js). */
const LINE_W = 0.15;
const EDGE_INSET = 0.3;
const DASH = 3;

/* How far each layer is lifted off the ground, m, and how hard it is pushed
 * toward the eye: over the paving's paint (4 to 10 mm), the paint over the
 * asphalt. The offset does the work at a grazing angle, where a few
 * millimetres of lift is a few metres of depth. */
const ASPHALT_Y = 0.012;
const KERB_Y = 0.012;
const PAINT_Y = 0.018;
const ASPHALT_OFFSET = -2;
const PAINT_OFFSET = -4;

/* The kerb's stone on each ground: the town's kerb reads against grass,
 * dirt and tarmac, and on a concrete yard is the yard's own colour. */
const KERB_STONE = { concrete: PAL.concreteDark };

/* A point `o` to the left of p, facing t, in the plan (as road.js
 * laneLine moves one). */
function leftOf(p, t, o) {
  return { x: p.x - o * t.y, y: p.y + o * t.x };
}

/*
 * One layer's triangles, in world metres, gathered for one merged mesh.
 * Every quad is wound to face up whichever way its road runs.
 */
class Layer {
  constructor() {
    this.pos = [];
    this.idx = [];
  }

  vertex(p) {
    this.pos.push(p.x, p.y, p.z);
    return this.pos.length / 3 - 1;
  }

  tri(a, b, c) {
    const P = this.pos;
    const ux = P[3 * b] - P[3 * a];
    const uz = P[3 * b + 2] - P[3 * a + 2];
    const vx = P[3 * c] - P[3 * a];
    const vz = P[3 * c + 2] - P[3 * a + 2];
    /* The y of (b - a) x (c - a): positive faces up. */
    if (uz * vx - ux * vz >= 0) {
      this.idx.push(a, b, c);
    } else {
      this.idx.push(a, c, b);
    }
  }

  /* A strip between two rows of world points, pairwise. */
  strip(left, right) {
    const n = Math.min(left.length, right.length);
    let pl = -1;
    let pr = -1;
    for (let i = 0; i < n; i += 1) {
      const l = this.vertex(left[i]);
      const r = this.vertex(right[i]);
      if (pl >= 0) {
        this.tri(pl, pr, l);
        this.tri(pr, r, l);
      }
      pl = l;
      pr = r;
    }
  }

  get triangles() {
    return this.idx.length / 3;
  }
}

/*
 * A row of plan points at `offset` to the line's left, the whole line, the
 * first repeated at the end of a closed one, with the fold held (see the
 * header), in the world at height y.
 */
function row(line, offset, W, D, y) {
  const lane = offset === 0 ? line : laneLine(line, offset);
  const n = lane.points.length;
  const out = [];
  let kept = null;
  const count = line.closed ? n + 1 : n;
  for (let k = 0; k < count; k += 1) {
    const i = k % n;
    let p = lane.points[i];
    if (kept && k > 0) {
      const c0 = line.points[(k - 1) % n];
      const c1 = line.points[i];
      const dot = (p.x - kept.x) * (c1.x - c0.x) + (p.y - kept.y) * (c1.y - c0.y);
      if (!(dot > 0)) {
        p = kept;
      }
    }
    kept = p;
    out.push(docToWorld(W, D, p.x, p.y, y));
  }
  return out;
}

/*
 * The line between arc lengths s0 and s1 (s0 < s1, both within [0, L], or
 * past L round a closed line), as plan points with the way the line goes at
 * each: the two ends interpolated, every point of the line between them.
 */
function spanOf(line, s0, s1) {
  const n = line.points.length;
  const L = line.length;
  const out = [];
  /* Arc length of point k, counting on round a closed line. */
  const sOf = (k) => {
    const lap = Math.floor(k / n);
    return line.s[k % n] + lap * L;
  };
  const at = (s) => {
    /* The segment [k, k + 1] that holds s, walked for from the start: a
     * dash is a few metres, and this runs once a dash at load. */
    let k = 0;
    const kMax = line.closed ? 2 * n : n - 1;
    while (k + 1 < kMax && sOf(k + 1) <= s) {
      k += 1;
    }
    const a = line.points[k % n];
    const b = line.points[(k + 1) % n];
    const sa = sOf(k);
    const sb = sOf(k + 1);
    const f = sb > sa ? Math.min(1, Math.max(0, (s - sa) / (sb - sa))) : 0;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l = Math.sqrt(dx * dx + dy * dy) || 1;
    return { k, p: { x: a.x + dx * f, y: a.y + dy * f }, t: { x: dx / l, y: dy / l } };
  };
  const a = at(s0);
  const b = at(s1);
  out.push({ p: a.p, t: a.t });
  for (let k = a.k + 1; k <= b.k; k += 1) {
    out.push({ p: line.points[k % n], t: line.tangents[k % n] });
  }
  out.push({ p: b.p, t: b.t });
  return out;
}

/* A painted band along part of a line: `o` to its left, `w` wide. */
function band(layer, pts, o, w, W, D, y) {
  const left = [];
  const right = [];
  for (const q of pts) {
    const l = leftOf(q.p, q.t, o + w / 2);
    const r = leftOf(q.p, q.t, o - w / 2);
    left.push(docToWorld(W, D, l.x, l.y, y));
    right.push(docToWorld(W, D, r.x, r.y, y));
  }
  layer.strip(left, right);
}

/* One road into the three layers. */
function drawRoad(d, W, D, y0, asphalt, kerb, paint) {
  const line = d.line;
  const h = d.width / 2;
  asphalt.strip(row(line, h, W, D, y0 + ASPHALT_Y), row(line, -h, W, D, y0 + ASPHALT_Y));
  kerb.strip(row(line, h + KERB_W, W, D, y0 + KERB_Y), row(line, h, W, D, y0 + KERB_Y));
  kerb.strip(row(line, -h, W, D, y0 + KERB_Y), row(line, -h - KERB_W, W, D, y0 + KERB_Y));
  /* The edge lines, the whole length. */
  const e = h - EDGE_INSET;
  for (const side of [1, -1]) {
    const o = side * e;
    paint.strip(row(line, o + LINE_W / 2, W, D, y0 + PAINT_Y), row(line, o - LINE_W / 2, W, D, y0 + PAINT_Y));
  }
  /* The centre line, dashed, on a road of two lanes. A loop's period is
   * stretched to fit it a whole number of times; an open road starts and
   * ends on a gap. */
  if (d.lanes === 2 && line.length > 2 * DASH) {
    const L = line.length;
    const count = Math.max(1, Math.round(L / (2 * DASH)));
    const period = line.closed ? L / count : 2 * DASH;
    const dash = period / 2;
    const first = line.closed ? 0 : dash / 2;
    for (let s = first; s + (line.closed ? 0 : dash) <= L + 1e-9 && s < L - 1e-9; s += period) {
      const s1 = line.closed ? s + dash : Math.min(L, s + dash);
      band(paint, spanOf(line, s, s1), 0, LINE_W, W, D, y0 + PAINT_Y);
    }
  }
}

function meshOf(THREE, layer, material, name) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(layer.pos, 3));
  const normals = new Float32Array(layer.pos.length);
  for (let i = 1; i < normals.length; i += 3) {
    normals[i] = 1;
  }
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setIndex(layer.idx);
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = name;
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  return mesh;
}

/* A lit cel material pushed toward the eye by `offset`. */
function paintMaterial(color, bands, tint, offset) {
  const m = cel({ color, bands, tint, cache: false });
  m.polygonOffset = true;
  m.polygonOffsetFactor = offset;
  m.polygonOffsetUnits = offset;
  return m;
}

/*
 * Every road on the map, drawn. See the header.
 */
export function buildRoadMesh(THREE, look, traffic, opts = {}) {
  const group = new THREE.Group();
  group.name = 'roads';
  const drawn = (traffic && traffic.drawn) || [];
  const field = traffic && traffic.field;
  const made = { geometries: [], materials: [] };
  const result = {
    group,
    roads: 0,
    triangles: 0,
    batches: 0,
    dispose() {
      for (const g of made.geometries) {
        g.dispose();
      }
      for (const m of made.materials) {
        m.dispose();
      }
      made.geometries.length = 0;
      made.materials.length = 0;
      group.clear();
    },
  };
  if (!drawn.length || !field) {
    return result;
  }
  const W = field.width;
  const D = field.depth;
  const y0 = Number.isFinite(opts.y) ? opts.y : 0;
  const asphalt = new Layer();
  const kerb = new Layer();
  const paint = new Layer();
  for (const d of drawn) {
    if (!d.line || d.line.points.length < 2 || !(d.width > 0)) {
      continue;
    }
    drawRoad(d, W, D, y0, asphalt, kerb, paint);
    result.roads += 1;
  }
  const stone = KERB_STONE[look && look.groundId] ?? PAL.curb;
  const layers = [
    [asphalt, paintMaterial(PAL.road, 3, 0x6a608f, ASPHALT_OFFSET), 'roadAsphalt'],
    [kerb, paintMaterial(stone, 3, 0x6f6790, ASPHALT_OFFSET), 'roadKerb'],
    [paint, paintMaterial(PAL.lineWhite, 2, 0x8e86ad, PAINT_OFFSET), 'roadPaint'],
  ];
  for (const [layer, material, name] of layers) {
    if (!layer.idx.length) {
      material.dispose();
      continue;
    }
    const mesh = meshOf(THREE, layer, material, name);
    made.geometries.push(mesh.geometry);
    made.materials.push(material);
    group.add(mesh);
    result.triangles += layer.triangles;
    result.batches += 1;
  }
  return result;
}

/*
 * The paint keep out test: see the header. Each road's centre line in the
 * world, with its reach (half its width, its kerb and `pad`) and its bounds,
 * so a rectangle far from a road costs four comparisons. A point of the line
 * is within a metre of the next on a straight (road.js STRAIGHT_STEP), so
 * half a metre more reach covers the line between them.
 */
export function roadCover(traffic, pad = 0) {
  const drawn = (traffic && traffic.drawn) || [];
  const field = traffic && traffic.field;
  if (!drawn.length || !field) {
    return () => false;
  }
  const roads = drawn.filter((d) => d.line && d.line.points.length >= 2).map((d) => {
    const pts = d.line.points.map((p) => docToWorld(field.width, field.depth, p.x, p.y, 0));
    const reach = d.width / 2 + KERB_W + pad + 0.5;
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (const p of pts) {
      x0 = Math.min(x0, p.x);
      x1 = Math.max(x1, p.x);
      z0 = Math.min(z0, p.z);
      z1 = Math.max(z1, p.z);
    }
    return { pts, reach, x0: x0 - reach, x1: x1 + reach, z0: z0 - reach, z1: z1 + reach };
  });
  return (x0, x1, z0, z1) => roads.some((r) => {
    if (r.x0 > x1 || r.x1 < x0 || r.z0 > z1 || r.z1 < z0) {
      return false;
    }
    const rr = r.reach * r.reach;
    return r.pts.some((p) => {
      const dx = Math.max(x0 - p.x, 0, p.x - x1);
      const dz = Math.max(z0 - p.z, 0, p.z - z1);
      return dx * dx + dz * dz <= rr;
    });
  });
}
