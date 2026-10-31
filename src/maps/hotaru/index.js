/*
 * index.js: Hotaru Valley, a countryside of Japan flown on a five inch: a
 * river valley of rice paddies under cedar hills, a village of thatched
 * farmhouses with its kura and barn, a water mill, a shrine on a knoll
 * with a tunnel of torii up its steps, rice terraces up the east side,
 * the ruin of a castle on the hill in the north west, and a fishing hamlet
 * on the bay with a torii standing in the sea. Every bit of it is original
 * and drawn from the real countryside (Shirakawa-go's gassho houses, the
 * stone walls of Japan's castles, the water wheels of Asakura, the boat
 * houses of Ine), in the town's own cel colours and ink, so it reads as
 * the same comic as The town.
 *
 * Built by the built map's pipeline (../built/index.js), as Sunnyfield is
 * (../sunny/index.js): one document for the plot, the light, the start and
 * the named gaps (./yard.js), and the valley as one structure of its own
 * (./plan.js) whose boxes are drawn and solid from the same numbers. What
 * no box can be (roofs, the land, the water, the wheel, the trees) is
 * drawn here over the parts.
 *
 * THE LAND is one grid (./land.js), drawn here as one mesh and handed to
 * the shell as the floor (extra.floor) from the same triangles, so the
 * hill a pilot sees is the hill the craft lands on: the shell already
 * hands the plant the ground's plane under the craft every step, as it
 * does on The town's hills. The built pipeline's flat plot and its far
 * terrain are hidden.
 *
 * On Low, what the valley marks `fine` is not drawn, and the set dressing
 * is drawn on High and Medium only, within NEAR_R of the camera (the near
 * cull, as Sunnyfield's). Nothing fine is solid, so the flight is the same.
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
import { markGround } from '../../render/comic.js';
import { PropKit } from '../../props/kit.js';
import { PAL } from '../city/vendored/core/palette.js';
import { cel } from '../city/vendored/core/toon.js';
import { hotaruLayout, hotaruFloor, hotaruMarkSpots, W, D, worldAt, chunkOf } from './plan.js';
import { hotaruDocument } from './yard.js';
import { mergePalette } from '../sunny/palette.js';
import { nearOf, hash2 } from './frame.js';
import { heights, GX, GY, WATER, shoreAt, inCedarStand, QUAY, HARBOUR_EAST } from './land.js';
import { drawTree } from './trees.js';
import { WHEEL } from './houses.js';

/* The chunk a drawn thing is filed under, or its near cell if it is set
 * dressing (./frame.js dress). */
const cellOf = (thing, x, z) => (thing && thing.near ? nearOf(x, z) : chunkOf(x, z));
const at = (px, py, thing) => cellOf(thing, px - W / 2, D / 2 - py);

/* How near the dressing is drawn, by preset, as Sunnyfield's NEAR_R; Low
 * draws none of it. */
const NEAR_R = { medium: 40, high: 50 };

/* Prisms along x are drawn turned a quarter, so the kit's extrusion along
 * its local z runs east; along y they are drawn unturned and run south. */
function drawPrisms(kit, prisms, low) {
  for (const p of prisms) {
    if (low && p.fine) {
      continue;
    }
    const lo = Math.min(...p.profile.map(([a]) => a));
    const hi = Math.max(...p.profile.map(([a]) => a));
    if (p.axis === 'x') {
      kit.begin(0, 0, 0, Math.PI / 2, at((p.e0 + p.e1) / 2, (lo + hi) / 2, p));
      kit.extrude(p.m, p.profile.map(([a, h]) => [a - D / 2, h]), p.e0 - W / 2, p.e1 - W / 2);
    } else {
      kit.begin(0, 0, 0, 0, at((lo + hi) / 2, (p.e0 + p.e1) / 2, p));
      kit.extrude(p.m, p.profile.map(([a, h]) => [a - W / 2, h]), D / 2 - p.e1, D / 2 - p.e0);
    }
  }
}

/* A rectangle rising to a smaller one, closed on top: Sunnyfield's. */
function frustumGeometry(f) {
  const [ox0, , oz1] = worldAt(f.o.x0, f.o.y0);
  const [ox1, , oz0] = worldAt(f.o.x1, f.o.y1);
  const [ix0, , iz1] = worldAt(f.i.x0, f.i.y0);
  const [ix1, , iz0] = worldAt(f.i.x1, f.i.y1);
  const b = [[ox0, f.h0, oz0], [ox1, f.h0, oz0], [ox1, f.h0, oz1], [ox0, f.h0, oz1]];
  const t = [[ix0, f.h1, iz0], [ix1, f.h1, iz0], [ix1, f.h1, iz1], [ix0, f.h1, iz1]];
  const pos = [];
  const quad = (a, c, d, e) => pos.push(...a, ...c, ...d, ...a, ...d, ...e);
  quad(b[1], b[0], t[0], t[1]);
  quad(b[2], b[1], t[1], t[2]);
  quad(b[3], b[2], t[2], t[3]);
  quad(b[0], b[3], t[3], t[0]);
  quad(t[3], t[2], t[1], t[0]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/* A plan polygon stood up: the shape in the ground's plane, extruded up. */
function slabGeometry(s) {
  const shape = new THREE.Shape(s.pts.map(([px, py]) => new THREE.Vector2(px - W / 2, py - D / 2)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: s.h1 - s.h0, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  g.translate(0, s.h0, 0);
  return g;
}

/* A box turned to its run, from a to b (world), w across and t up. */
const RX = new THREE.Vector3();
const RY = new THREE.Vector3();
const RZ = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
function rodMatrix(r, m) {
  RX.set(r.b[0] - r.a[0], r.b[1] - r.a[1], r.b[2] - r.a[2]);
  RX.normalize();
  RZ.crossVectors(RX, UP);
  if (RZ.lengthSq() < 1e-6) {
    RZ.set(1, 0, 0);
  }
  RZ.normalize();
  RY.crossVectors(RZ, RX).normalize();
  m.makeBasis(RX, RY, RZ).setPosition((r.a[0] + r.b[0]) / 2, (r.a[1] + r.b[1]) / 2, (r.a[2] + r.b[2]) / 2);
  return m;
}

/* A cable's curve, hanging `sag` at its middle: Sunnyfield's. */
const WIRE_SEGMENTS = 10;
function wireCurve(w) {
  const a = new THREE.Vector3(...worldAt(w.a[0], w.a[1], w.a[2]));
  const b = new THREE.Vector3(...worldAt(w.b[0], w.b[1], w.b[2]));
  const c = a.clone().add(b).multiplyScalar(0.5);
  c.y -= 2 * w.sag;
  return new THREE.QuadraticBezierCurve3(a, c, b);
}

/* The cables again as one set of lines, so a wire is a pixel at any range. */
function wireLines(T) {
  const pts = [];
  for (const w of T.wires) {
    const p = wireCurve(w).getPoints(WIRE_SEGMENTS);
    for (let i = 0; i < WIRE_SEGMENTS; i += 1) {
      pts.push(p[i].x, p[i].y, p[i].z, p[i + 1].x, p[i + 1].y, p[i + 1].z);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.computeBoundingSphere();
  const lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x2c2a33 }));
  lines.name = 'hotaru wire lines';
  return lines;
}

/* The near cull: Sunnyfield's, on the valley's near cells. */
function nearCull(props, r) {
  const cells = [];
  const bb = new THREE.Box3();
  for (const g of props.children) {
    if (!g.name.startsWith('props:hn')) {
      continue;
    }
    bb.makeEmpty();
    for (const m of g.children) {
      if (!m.geometry) {
        continue;
      }
      if (!m.geometry.boundingBox) {
        m.geometry.computeBoundingBox();
      }
      bb.union(m.geometry.boundingBox);
    }
    if (!bb.isEmpty()) {
      cells.push({ group: g, x0: bb.min.x, x1: bb.max.x, z0: bb.min.z, z1: bb.max.z, on: true });
    }
  }
  const r2 = r * r;
  return {
    to(eye) {
      for (let i = 0; i < cells.length; i += 1) {
        const c = cells[i];
        const dx = Math.max(0, c.x0 - eye.x, eye.x - c.x1);
        const dz = Math.max(0, c.z0 - eye.z, eye.z - c.z1);
        c.on = dx * dx + dz * dz <= r2;
        c.group.visible = c.on;
      }
    },
    stats: () => ({ cells: cells.length, on: cells.filter((c) => c.on).length, radius: r }),
  };
}

const BEAD_SPIN = [0, 0, 0];
const ROD = new THREE.Matrix4();

function drawValley(kit, T, trees, low) {
  drawPrisms(kit, T.prisms, low);
  for (const d of T.discs) {
    if (low && d.fine) {
      continue;
    }
    const [x, , z] = worldAt(d.px, d.py, 0);
    kit.begin(0, 0, 0, 0, cellOf(d, x, z));
    kit.cyl(d.m, [x, d.h0, z], [x, d.h1, z], d.r, d.seg);
  }
  for (const c of T.cyls) {
    if (low && c.fine) {
      continue;
    }
    kit.begin(0, 0, 0, 0, cellOf(c, (c.a[0] + c.b[0]) / 2, (c.a[2] + c.b[2]) / 2));
    kit.cyl(c.m, c.a, c.b, c.r, c.seg, c.rTop);
  }
  for (const b of T.balls) {
    if (low && b.fine) {
      continue;
    }
    const [x, y, z] = worldAt(b.px, b.py, b.h);
    kit.begin(0, 0, 0, 0, cellOf(b, x, z));
    if (b.bead) {
      kit.blob(b.m, [x, y, z], b.r, b.r, BEAD_SPIN);
    } else {
      kit.ball(b.m, [x, y, z], b.r);
    }
  }
  for (const c of T.cones) {
    if (low && c.fine) {
      continue;
    }
    const [x, y, z] = worldAt(c.px, c.py, c.h);
    kit.begin(0, 0, 0, 0, cellOf(c, x, z));
    kit.cone(c.m, [x, y, z], c.r, c.height, c.seg);
  }
  for (const f of T.frusta) {
    if (low && f.fine) {
      continue;
    }
    const [x, , z] = worldAt((f.i.x0 + f.i.x1) / 2, (f.i.y0 + f.i.y1) / 2);
    kit.begin(0, 0, 0, 0, cellOf(f, x, z));
    kit.add(f.m, frustumGeometry(f));
  }
  for (const r of T.rods) {
    if (low && r.fine) {
      continue;
    }
    const dx = r.b[0] - r.a[0];
    const dy = r.b[1] - r.a[1];
    const dz = r.b[2] - r.a[2];
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 1e-4) {
      continue;
    }
    kit.begin(0, 0, 0, 0, cellOf(r, (r.a[0] + r.b[0]) / 2, (r.a[2] + r.b[2]) / 2));
    kit.add(r.m, new THREE.BoxGeometry(len, r.t, r.w), rodMatrix(r, ROD));
  }
  for (const s of T.slabs) {
    if (low && s.fine) {
      continue;
    }
    const [px, py] = s.pts[0];
    kit.begin(0, 0, 0, 0, at(px, py, s));
    kit.add(s.m, slabGeometry(s));
  }
  for (const w of T.wires) {
    const curve = wireCurve(w);
    const mid = curve.getPoint(0.5);
    kit.begin(0, 0, 0, 0, chunkOf(mid.x, mid.z));
    kit.add(w.m, new THREE.TubeGeometry(curve, WIRE_SEGMENTS, w.r, 3, false));
  }
  for (const a of T.scaled) {
    const [x, y, z] = worldAt(a.px, a.py, a.h);
    kit.begin(x, y, z, a.yaw, chunkOf(x, z));
    if (a.k !== 1) {
      kit.place.multiply(new THREE.Matrix4().makeScale(a.k, a.k, a.k));
    }
    kit.element(a.el);
  }
  for (const t of trees) {
    const [x, , z] = worldAt(t.px, t.py, 0);
    drawTree(kit, t, chunkOf(x, z), low);
  }
}

/* ------------------------------------------------------------------ */
/* The land and the water                                              */
/* ------------------------------------------------------------------ */

const lerpHex = (a, b, t, out) => {
  const k = t <= 0 ? 0 : t >= 1 ? 1 : t;
  const A = new THREE.Color(a);
  const B = new THREE.Color(b);
  out.copy(A).lerp(B, k);
  return out;
};

/*
 * THE LAND, one mesh over the grid, its colours on its vertices from the
 * town's hillside ladder (../city/vendored/core/palette.js): sunlit turf on
 * the floor and the gentle slopes, the mid green and the deep green as the
 * hills steepen, bracken high in the sun, needle litter under the cedar
 * stands, sand on the beach and the river's bed, paving behind the quay.
 * Smooth normals, so the cel bands draw the hills' contours as the town's
 * hills do. One draw call, and it casts no shadow: hills a few degrees
 * steep throw none worth a pass.
 */
function landMesh() {
  const H = heights();
  const nx = GX.length;
  const ny = GY.length;
  const pos = new Float32Array(nx * ny * 3);
  const col = new Float32Array(nx * ny * 3);
  const c = new THREE.Color();
  for (let i = 0; i < nx; i += 1) {
    for (let j = 0; j < ny; j += 1) {
      const k = i * ny + j;
      const px = GX[i];
      const py = GY[j];
      const h = H[k];
      const [x, , z] = worldAt(px, py, 0);
      pos[k * 3] = x;
      pos[k * 3 + 1] = h;
      pos[k * 3 + 2] = z;
      /* The slope, from the neighbours either side. */
      const hx0 = H[Math.max(0, i - 1) * ny + j];
      const hx1 = H[Math.min(nx - 1, i + 1) * ny + j];
      const hy0 = H[i * ny + Math.max(0, j - 1)];
      const hy1 = H[i * ny + Math.min(ny - 1, j + 1)];
      const sx = (hx1 - hx0) / (GX[Math.min(nx - 1, i + 1)] - GX[Math.max(0, i - 1)]);
      const sy = (hy1 - hy0) / (GY[Math.min(ny - 1, j + 1)] - GY[Math.max(0, j - 1)]);
      const slope = Math.sqrt(sx * sx + sy * sy);
      const n = hash2(i, j + 900);
      const harbour = px > QUAY.x0 - 12 && px < HARBOUR_EAST && py > QUAY.py && py < 84 && h > 0.2;
      if (harbour) {
        c.set(PAL.gravel);
      } else if (h < WATER + 0.6 || (py < shoreAt(px) + 7 && h < 2.5)) {
        c.set(PAL.lakeShore);
      } else if (inCedarStand(px, py) && h > 1) {
        lerpHex(PAL.hillLitter, PAL.hillGrassDeep, n * 0.6, c);
      } else if (slope > 0.55) {
        lerpHex(PAL.hillGrassDeep, PAL.hillEarth, n * 0.5, c);
      } else if (slope > 0.22) {
        lerpHex(PAL.hillGrass, PAL.hillGrassDeep, (slope - 0.22) * 2 + n * 0.25, c);
      } else if (h > 24) {
        lerpHex(PAL.hillGrass, PAL.hillBracken, n, c);
      } else {
        lerpHex(PAL.hillGrassSun, PAL.hillGrass, n * 0.45 + slope * 2, c);
      }
      c.toArray(col, k * 3);
    }
  }
  /* The cells, each split corner (i, j) to (i + 1, j + 1) as ./land.js
   * landAt splits them, wound counter clockwise from above. */
  const index = [];
  for (let i = 0; i + 1 < nx; i += 1) {
    for (let j = 0; j + 1 < ny; j += 1) {
      const a = i * ny + j;
      const b = (i + 1) * ny + j;
      const cc = (i + 1) * ny + j + 1;
      const d = i * ny + j + 1;
      index.push(a, b, cc, a, cc, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(index);
  /* Counter clockwise in the plan is counter clockwise from above in
   * the world, so every cell faces up. */
  g.computeVertexNormals();
  g.computeBoundingSphere();
  const mesh = new THREE.Mesh(g, cel({ color: 0xffffff, vertexColors: true, bands: 3, tint: 0x6f6790, cache: false }));
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.name = 'hotaru land';
  return mesh;
}

/*
 * THE WATER: one sheet at the river's, the pond's and the sea's one level,
 * over every cell the land dips under it, coloured by the depth under each
 * corner (the town's lake ladder): pale where it shelves to the shore, the
 * lake blue, deep blue out in the bay.
 */
function waterMesh() {
  const H = heights();
  const nx = GX.length;
  const ny = GY.length;
  const pos = [];
  const col = [];
  const c = new THREE.Color();
  const vert = (i, j) => {
    const h = H[i * ny + j];
    const [x, , z] = worldAt(GX[i], GY[j], 0);
    pos.push(x, WATER, z);
    const d = WATER - h;
    if (d < 0.25) {
      c.set(PAL.lakeSky);
    } else if (d < 1.4) {
      lerpHex(PAL.lakeShallow, PAL.lakeWater, (d - 0.25) / 1.15, c);
    } else {
      lerpHex(PAL.lakeWater, PAL.lakeDeep, (d - 1.4) / 4, c);
    }
    col.push(c.r, c.g, c.b);
  };
  for (let i = 0; i + 1 < nx; i += 1) {
    for (let j = 0; j + 1 < ny; j += 1) {
      const lo = Math.min(H[i * ny + j], H[(i + 1) * ny + j], H[(i + 1) * ny + j + 1], H[i * ny + j + 1]);
      if (lo >= WATER - 0.02) {
        continue;
      }
      /* Two triangles, counter clockwise in the plan, which is counter
       * clockwise seen from above in the world: they face up. */
      vert(i, j);
      vert(i + 1, j);
      vert(i + 1, j + 1);
      vert(i, j);
      vert(i + 1, j + 1);
      vert(i, j + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  const mesh = new THREE.Mesh(g, cel({ color: 0xffffff, vertexColors: true, bands: 2, tint: 0x6f86a8, cache: false }));
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.name = 'hotaru water';
  return mesh;
}

/* ------------------------------------------------------------------ */
/* The wheel                                                           */
/* ------------------------------------------------------------------ */

/* The water wheel, drawn about its axle on local x at the origin: two rims,
 * eight spokes a side, the paddles between the rims. */
function wheelGroup() {
  const K = new PropKit();
  K.begin(0, 0, 0, 0, 'wheel');
  const { r, t, paddles } = WHEEL;
  const ht = t / 2;
  for (const s of [-1, 1]) {
    for (let k = 0; k < 24; k += 1) {
      const a0 = (k / 24) * Math.PI * 2;
      const a1 = ((k + 1) / 24) * Math.PI * 2;
      K.cyl('hvWoodWet', [s * ht, r * Math.cos(a0), r * Math.sin(a0)], [s * ht, r * Math.cos(a1), r * Math.sin(a1)], 0.09, 4);
      K.cyl('hvWoodWet', [s * ht, (r - 0.55) * Math.cos(a0), (r - 0.55) * Math.sin(a0)], [s * ht, (r - 0.55) * Math.cos(a1), (r - 0.55) * Math.sin(a1)], 0.06, 4);
    }
    for (let k = 0; k < 8; k += 1) {
      const a = (k / 8) * Math.PI * 2;
      K.cyl('hvWoodWet', [s * ht, 0, 0], [s * ht, (r - 0.5) * Math.cos(a), (r - 0.5) * Math.sin(a)], 0.07, 4);
    }
  }
  K.cyl('hvWoodDark', [-ht - 0.6, 0, 0], [ht + 0.2, 0, 0], 0.2, 8);
  for (let k = 0; k < paddles; k += 1) {
    const a = (k / paddles) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const m = new THREE.Matrix4().makeRotationX(a).setPosition(0, (r - 0.2) * ca, (r - 0.2) * sa);
    K.add('hvWoodPale', new THREE.BoxGeometry(t, 0.06, 0.7).rotateX(Math.PI / 2), m);
  }
  return K.finish();
}

export async function buildMap(shell, onProgress, options) {
  const quality = qualityFor(options && options.quality).id;
  const low = quality === 'low';
  const { parts, T, trees, info } = hotaruLayout();
  const extra = {
    el: { id: 'hotaru', type: 'hotaru' },
    parts: low ? parts.filter((p) => !(p.fine && !p.solid)) : parts,
    draw: (kit) => drawValley(kit, T, trees, low),
    floor: hotaruFloor,
    chunkOf: (x, z, p) => cellOf(p, x, z),
  };
  const doc = hotaruDocument(info);
  const map = await buildBuilt(shell, onProgress, {
    ...(options || {}), document: doc, extra, sponsorMarks: false, markSpots: hotaruMarkSpots(),
  });
  map.id = 'hotaru';
  map.source = 'hotaru';
  const props = map.scene.getObjectByName('props');
  /* The set dressing casts no shadow, as Sunnyfield's. */
  if (props) {
    for (const g of props.children) {
      if (!g.name.startsWith('props:hn')) {
        continue;
      }
      for (const m of [...g.children]) {
        if (m.userData.shadowProxy) {
          g.remove(m);
          m.geometry.dispose();
        }
      }
    }
  }
  const palette = props ? mergePalette(props) : { from: 0, to: 0 };
  const stats = map.stats;
  const near = props && !low ? nearCull(props, NEAR_R[quality] || NEAR_R.high) : null;
  if (near) {
    const focus = map.updateShadowFocus;
    map.updateShadowFocus = (target) => {
      focus(target);
      near.to(shell.camera.position);
    };
    near.to(shell.camera.position);
  }
  map.stats = () => ({ ...(stats ? stats() : {}), palette, near: near ? near.stats() : null });
  /* The pipeline's flat ground is the valley's land instead. */
  for (const name of ['plot', 'kerb', 'verge', 'terrain']) {
    const m = map.scene.getObjectByName(name);
    if (m) {
      m.visible = false;
    }
  }
  const roads = map.scene.getObjectByName('roads');
  if (roads) {
    roads.visible = false;
  }
  const land = landMesh();
  const water = waterMesh();
  markGround(land);
  map.scene.add(land);
  map.scene.add(water);
  map.scene.add(wireLines(T));
  /* The wheel, turned on the map's clock: about one turn in seven
   * seconds, which is a mill wheel's pace in a good stream. */
  const m = info.village.mill;
  const pivot = new THREE.Group();
  pivot.name = 'hotaru wheel';
  const [hx, hy, hz] = worldAt(m.hub[0], m.hub[1], m.hub[2]);
  pivot.position.set(hx, hy, hz);
  if (Math.abs(m.axis[1]) > Math.abs(m.axis[0])) {
    pivot.rotation.y = Math.PI / 2;
  }
  const wheel = wheelGroup();
  pivot.add(wheel);
  map.scene.add(pivot);
  await warmPrograms(shell.renderer, map.scene, shell.camera, map.post.rtScene);
  const anim = map.updateAnim;
  map.updateAnim = (step) => {
    anim(step);
    wheel.rotation.x = -((step % 7000) / 7000) * Math.PI * 2;
  };
  return map;
}
