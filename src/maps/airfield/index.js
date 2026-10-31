/*
 * index.js: Kazami Airfield as a map, built the way Sunnyfield is
 * (../sunny/index.js, whose drawing this mostly is): the built map's
 * pipeline (../built/index.js) does the sky, the ground, the ink, the
 * hatching, the shadows, the colliders, the cull, the named gaps, the
 * poles and their wires, the marks. This file hands it the field's
 * document (./yard.js) and the place itself (./plan.js) as one structure
 * of its own, draws what the parts cannot say (the hangar's arch, the
 * terraces, round things), raises the mountains round the valley, hangs
 * the signs and names the world.
 *
 * THE TOWN'S LOOK. Golden hour, the town's fog, four lights, sky and
 * clouds, the comic layer's hatching and the ink pass, all the pipeline's
 * and all the town's numbers; the colours beside the town's
 * (../../props/airfield.js). The one thing of its own is the mountains:
 * the town's two painted ridge rings stand low and fade from 25 m up, which
 * reads as hills round a town and not as a valley in mountains, so they
 * are hidden here and the mountains are a lit mesh of the valley's own
 * profile carried on out (./valley.js smoothTop), unfogged so they stand
 * over the fog as a manga background's do, with the haze painted into
 * their colour by distance instead.
 *
 * FOR THE LATENCY RULE: this file loads only when the map is chosen. The
 * place is drawn in the chunks' batches, one a look after the palette
 * merge (../sunny/palette.js); the mountains are one draw; the signs one;
 * the wires one. On Low what is fine is not drawn; the dressing is drawn
 * near only on Medium and High, as Sunnyfield's is. Nothing animates, so
 * nothing runs per frame but the near cull's walk of 48 cells.
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

import * as THREE from 'three';
import { buildMap as buildBuilt } from '../built/index.js';
import { warmPrograms } from '../../render/warm.js';
import { qualityFor } from '../../render/quality.js';
import { paintMaterial } from '../../art/stf.js';
import { cel } from '../city/vendored/core/toon.js';
import { airfieldLayout, airfieldFloor, airfieldMarkSpots, CHANNEL_HOLE, W, D, worldAt, chunkOf } from './plan.js';
import { airfieldDocument } from './yard.js';
import { paintSigns, signMesh } from './signs.js';
import { mergePalette } from '../sunny/palette.js';
import { nearOf } from './frame.js';
import { smoothTop, OUTER } from './valley.js';

/* The chunk a drawn thing is filed under, or its near cell if it is set
 * dressing (./frame.js). */
/* On Low the whole place is one chunk, the one the hidden sign is filed
 * in: a chunk is a draw call for each look in it, and on Low a draw call
 * costs more than the triangles a chunk's cull would save. Set by
 * buildMap for the build in hand. */
let one = null;
const cellOf = (thing, x, z) => (one || (thing && thing.near ? nearOf(x, z) : chunkOf(x, z)));
const at = (px, py, thing) => cellOf(thing, px - W / 2, D / 2 - py);

/* How near the dressing is drawn, by preset; Low draws none of it. As
 * Sunnyfield's. */
const NEAR_R = { medium: 40, high: 50 };

/* A triangle of the valley's, wound so it shows the side a pilot sees:
 * a top faces up, a wall or a bank faces the valley's middle line (the
 * plan's py = 183, world z = -3). ./valley.js says where its corners are
 * and not which way round, and a face seen from its back is not drawn. */
const MID_Z = -3;
function facing(p, i, out) {
  const ax = p[i + 3] - p[i];
  const ay = p[i + 4] - p[i + 1];
  const az = p[i + 5] - p[i + 2];
  const bx = p[i + 6] - p[i];
  const by = p[i + 7] - p[i + 1];
  const bz = p[i + 8] - p[i + 2];
  const nx = ay * bz - az * by;
  const ny = az * bx - ax * bz;
  const nz = ax * by - ay * bx;
  const len = Math.hypot(nx, ny, nz) || 1;
  let ok;
  if (Math.abs(ny) / len >= 0.5) {
    ok = ny > 0;
  } else {
    const cx = (p[i] + p[i + 3] + p[i + 6]) / 3;
    const cz = (p[i + 2] + p[i + 5] + p[i + 8]) / 3;
    ok = nx * (0 - cx) + nz * (MID_Z - cz) > 0;
  }
  if (ok) {
    for (let k = 0; k < 9; k += 1) {
      out.push(p[i + k]);
    }
  } else {
    out.push(p[i], p[i + 1], p[i + 2], p[i + 6], p[i + 7], p[i + 8], p[i + 3], p[i + 4], p[i + 5]);
  }
}

/* The valley's own triangles (./valley.js), batched by look and cell: one
 * geometry for each, flat shaded. */
function drawSurfaces(kit, T, low) {
  const groups = new Map();
  for (const s of T.surfaces) {
    if (low && s.fine) {
      continue;
    }
    const cell = cellOf(s, s.x, s.z);
    const key = `${s.m}|${cell}`;
    let g = groups.get(key);
    if (!g) {
      g = { m: s.m, cell, pos: [] };
      groups.set(key, g);
    }
    for (let i = 0; i < s.pos.length; i += 9) {
      facing(s.pos, i, g.pos);
    }
  }
  for (const g of groups.values()) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3));
    geo.computeVertexNormals();
    kit.begin(0, 0, 0, 0, g.cell);
    kit.add(g.m, geo);
  }
}

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

/* A rectangle rising to a smaller one, closed on top: four sloped faces
 * and a lid, each face its own vertices so it shades flat. */
function frustumGeometry(f) {
  const [ox0, , oz1] = worldAt(f.o.x0, f.o.y0);
  const [ox1, , oz0] = worldAt(f.o.x1, f.o.y1);
  const [ix0, , iz1] = worldAt(f.i.x0, f.i.y0);
  const [ix1, , iz0] = worldAt(f.i.x1, f.i.y1);
  const b = [[ox0, f.h0, oz0], [ox1, f.h0, oz0], [ox1, f.h0, oz1], [ox0, f.h0, oz1]];
  const t = [[ix0, f.h1, iz0], [ix1, f.h1, iz0], [ix1, f.h1, iz1], [ix0, f.h1, iz1]];
  const pos = [];
  const quad = (a, c, d, e) => pos.push(...a, ...c, ...d, ...a, ...d, ...e);
  /* Wound counter clockwise seen from outside: the far (north) face, the
   * east, the near (south), the west, the lid. */
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

/* A cable's curve: straight between its ends in plan, hanging `sag` at
 * its middle, a parabola as near a catenary as a span this short needs. */
const WIRE_SEGMENTS = 10;
function wireCurve(w) {
  const a = new THREE.Vector3(...worldAt(w.a[0], w.a[1], w.a[2]));
  const b = new THREE.Vector3(...worldAt(w.b[0], w.b[1], w.b[2]));
  const c = a.clone().add(b).multiplyScalar(0.5);
  c.y -= 2 * w.sag;
  return new THREE.QuadraticBezierCurve3(a, c, b);
}

/*
 * The cables again as one set of lines, which the builder draws beside its
 * tubes for the same reason: a tube three centimetres thick is under a
 * pixel from forty metres, and a line is always one.
 */
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
  lines.name = 'airfield wire lines';
  return lines;
}

/*
 * THE NEAR CULL: the near cells' bounds, measured as the pipeline measures
 * its chunks', and the test to the nearest point of them, so a piece of
 * dressing inside the radius is never off. Set every frame, after the
 * pipeline's own cull, which switches these groups on again whenever the
 * camera comes inside its far wider radius.
 */
function nearCull(props, r) {
  const cells = [];
  const bb = new THREE.Box3();
  for (const g of props.children) {
    if (!g.name.startsWith('props:an')) {
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

function drawTown(kit, T, low) {
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
  for (const s of T.shells) {
    const [x, , z] = worldAt(s.px, s.py, 0);
    kit.begin(x, 0, z, 0, chunkOf(x, z));
    kit.shell(s.m, s.y0, s.y1, s.r0, s.r1, s.arc, s.inward, s.seg);
  }
  /* A ring: its frame's z along its axis, which is the plan's (nx, ny) on
   * edge or straight up when both are 0, so a torus drawn in its x y plane
   * stands where it should. `scale` squashes it along the axis. */
  const ax = new THREE.Vector3();
  const ay = new THREE.Vector3();
  const az = new THREE.Vector3();
  for (const t of T.tori) {
    if (low && t.fine) {
      continue;
    }
    const [x, y, z] = worldAt(t.px, t.py, t.h);
    kit.begin(x, y, z, 0, cellOf(t, x, z));
    if (t.nx === 0 && t.ny === 0) {
      ax.set(1, 0, 0);
      ay.set(0, 0, -1);
      az.set(0, 1, 0);
    } else {
      const n = Math.hypot(t.nx, t.ny);
      ax.set(-t.ny / n, 0, -t.nx / n);
      ay.set(0, 1, 0);
      az.set(t.nx / n, 0, -t.ny / n);
    }
    kit.place.makeBasis(ax, ay, az).setPosition(x, y, z);
    const g = new THREE.TorusGeometry(t.R, t.t, t.seg, t.round);
    if (t.scale) {
      g.scale(1, 1, t.scale);
    }
    kit.add(t.m, g);
  }
  for (const f of T.frusta) {
    if (low && f.fine) {
      continue;
    }
    const [x, , z] = worldAt((f.i.x0 + f.i.x1) / 2, (f.i.y0 + f.i.y1) / 2);
    kit.begin(0, 0, 0, 0, cellOf(f, x, z));
    kit.add(f.m, frustumGeometry(f));
  }
  /* The cables: each a thin tube along its sag, three sided, as the
   * builder's are (../built/index.js buildWires). */
  for (const w of T.wires) {
    const curve = wireCurve(w);
    const mid = curve.getPoint(0.5);
    kit.begin(0, 0, 0, 0, chunkOf(mid.x, mid.z));
    kit.add(w.m, new THREE.TubeGeometry(curve, WIRE_SEGMENTS, w.r, 3, false));
  }
  drawSurfaces(kit, T, low);
}

/*
 * A level plane of the ground's with a rectangle cut out of it: the
 * channel's, so the field's plane does not lie across the channel at
 * the grass's height. Heads' house's openGround (../heads/index.js), which is
 * the house's (../house/index.js), the same way.
 */
function openGround(scene, name, rect) {
  const mesh = scene.getObjectByName(name);
  if (!mesh) {
    return;
  }
  const { x, z } = mesh.position;
  const hole = { x0: rect.x0 - x, x1: rect.x1 - x, z0: rect.z0 - z, z1: rect.z1 - z };
  const old = mesh.geometry;
  const names = Object.keys(old.attributes);
  const sizes = names.map((n) => old.attributes[n].itemSize);
  const atPos = names.indexOf('position');
  const off = sizes.slice(0, atPos).reduce((a, b) => a + b, 0);
  const read = (i) => {
    const v = [];
    names.forEach((n, k) => {
      const a = old.attributes[n].array;
      for (let c = 0; c < sizes[k]; c += 1) {
        v.push(a[i * sizes[k] + c]);
      }
    });
    return v;
  };
  const count = old.attributes.position.count;
  const verts = [];
  for (let i = 0; i < count; i += 1) {
    verts.push(read(i));
  }
  const X = (v) => v[off];
  const Z = (v) => v[off + 2];
  const lerp = (p, q, t) => p.map((a, k) => a + (q[k] - a) * t);
  const split = (poly, d) => {
    const keep = [];
    const rest = [];
    for (let i = 0; i < poly.length; i += 1) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const dp = d(p);
      const dq = d(q);
      (dp >= 0 ? keep : rest).push(p);
      if (dp >= 0 !== dq >= 0) {
        const v = lerp(p, q, dp / (dp - dq));
        keep.push(v);
        rest.push(v);
      }
    }
    return [keep, rest];
  };
  const sides = [(v) => hole.x0 - X(v), (v) => X(v) - hole.x1, (v) => hole.z0 - Z(v), (v) => Z(v) - hole.z1];
  const src = old.index ? old.index.array : Array.from({ length: count }, (_, i) => i);
  const index = [];
  for (let t = 0; t < src.length; t += 3) {
    const tri = [src[t], src[t + 1], src[t + 2]];
    const xs = tri.map((i) => X(verts[i]));
    const zs = tri.map((i) => Z(verts[i]));
    if (Math.max(...xs) <= hole.x0 || Math.min(...xs) >= hole.x1 || Math.max(...zs) <= hole.z0 || Math.min(...zs) >= hole.z1) {
      index.push(...tri);
      continue;
    }
    let rest = tri.map((i) => verts[i]);
    for (const d of sides) {
      const [keep, left] = split(rest, d);
      for (let k = 1; k + 1 < keep.length; k += 1) {
        for (const v of [keep[0], keep[k], keep[k + 1]]) {
          index.push(verts.length);
          verts.push(v);
        }
      }
      rest = left;
      if (rest.length < 3) {
        break;
      }
    }
  }
  const G = new THREE.BufferGeometry();
  names.forEach((n, k) => {
    const start = sizes.slice(0, k).reduce((a, b) => a + b, 0);
    const a = new Float32Array(verts.length * sizes[k]);
    verts.forEach((v, i) => {
      for (let c = 0; c < sizes[k]; c += 1) {
        a[i * sizes[k] + c] = v[start + c];
      }
    });
    G.setAttribute(n, new THREE.BufferAttribute(a, sizes[k]));
  });
  G.setIndex(index);
  G.computeBoundingBox();
  G.computeBoundingSphere();
  old.dispose();
  mesh.geometry = G;
}

/*
 * THE MOUNTAINS: the valley's profile carried on out past the plot and up
 * into ridges, one mesh, faceted, lit as the town is lit and inked by the
 * ink pass. Each face is coloured by what grows at its height (paddy green
 * low, cedar, then bare rock, then the snow left on the peaks in spring)
 * and pushed toward the haze by its distance from the valley, so the near
 * ridges are dark and the far ones pale, the way a manga background layers
 * them. Unfogged: the fog ends inside the plot's reach and would have
 * eaten them.
 */
function mountains(fogColor, sunDir) {
  const S = OUTER.step;
  const nx = Math.round((OUTER.x1 - OUTER.x0) / S);
  const ny = Math.round((OUTER.y1 - OUTER.y0) / S);
  const H = new Float32Array((nx + 1) * (ny + 1));
  for (let j = 0; j <= ny; j += 1) {
    for (let i = 0; i <= nx; i += 1) {
      H[j * (nx + 1) + i] = smoothTop(OUTER.x0 + i * S, OUTER.y0 + j * S);
    }
  }
  const pos = [];
  const col = [];
  const haze = new THREE.Color(fogColor);
  const band = [
    [0, new THREE.Color(0x9cbd80)],
    [10, new THREE.Color(0x6f9a72)],
    [26, new THREE.Color(0x4f7d5e)],
    [150, new THREE.Color(0x587060)],
    [205, new THREE.Color(0x9a93a4)],
    [262, new THREE.Color(0xf4f1ea)],
  ];
  const c = new THREE.Color();
  const tint = (h, d, steep) => {
    let k = 0;
    while (k + 1 < band.length && band[k + 1][0] <= h) {
      k += 1;
    }
    c.copy(band[k][1]);
    if (k + 1 < band.length) {
      const f = (h - band[k][0]) / (band[k + 1][0] - band[k][0]);
      c.lerp(band[k + 1][1], f * f * f);
    }
    /* A steep face is rock whatever its height. */
    if (steep > 1.3 && h > 30) {
      c.lerp(band[4][1], Math.min(1, (steep - 1.3) * 0.8));
    }
    const far = Math.min(0.62, Math.max(0, (d - 230) / 520));
    return c.lerp(haze, far);
  };
  /* One vertex a grid point, shared by the faces round it, so the slopes
   * shade smooth and the ink draws the ridges rather than every facet. */
  const at2 = (i, j) => H[Math.max(0, Math.min(ny, j)) * (nx + 1) + Math.max(0, Math.min(nx, i))];
  for (let j = 0; j <= ny; j += 1) {
    for (let i = 0; i <= nx; i += 1) {
      const h = at2(i, j);
      const [x, y, z] = worldAt(OUTER.x0 + i * S, OUTER.y0 + j * S, h);
      pos.push(x, y, z);
      const steep = Math.hypot(at2(i + 1, j) - at2(i - 1, j), at2(i, j + 1) - at2(i, j - 1)) / (2 * S);
      tint(h, Math.hypot(x, z), steep);
      col.push(c.r, c.g, c.b);
    }
  }
  const index = [];
  const V = (i, j) => j * (nx + 1) + i;
  for (let j = 0; j < ny; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      const px0 = OUTER.x0 + i * S;
      const py0 = OUTER.y0 + j * S;
      if (px0 >= 0 && px0 + S <= W && py0 >= 0 && py0 + S <= D) {
        continue;
      }
      /* py grows north, z falls: wound so the faces look up. */
      index.push(V(i, j), V(i + 1, j), V(i, j + 1), V(i + 1, j), V(i + 1, j + 1), V(i, j + 1));
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const mat = cel({ color: 0xffffff, tint: 0x5c5680, fog: false, vertexColors: true, cache: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'airfield mountains';
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.frustumCulled = true;
  void sunDir;
  return mesh;
}

export async function buildMap(shell, onProgress, options) {
  const quality = qualityFor(options && options.quality);
  const low = quality.id === 'low';
  one = low ? airfieldMarkSpots()[0].chunk : null;
  const { parts, T } = airfieldLayout();
  const extra = {
    el: { id: 'airfield', type: 'airfield' },
    /* On Low the fine parts are left out of what is drawn; none is solid. */
    parts: low ? parts.filter((p) => !(p.fine && !p.solid)) : parts,
    draw: (kit) => drawTown(kit, T, low),
    floor: airfieldFloor,
    chunkOf: (x, z, p) => cellOf(p, x, z),
  };
  const doc = airfieldDocument();
  const map = await buildBuilt(shell, onProgress, {
    ...(options || {}), document: doc, extra, markSpots: airfieldMarkSpots(),
  });
  /* Its own world: the shell keys the world, the results and the board's
   * refusal by this id, and `source` is the word the board counts its
   * partner signs under. */
  map.id = 'airfield';
  map.source = 'airfield';
  const props = map.scene.getObjectByName('props');
  /* The set dressing casts no shadow, as Sunnyfield's does not. */
  if (props) {
    for (const g of props.children) {
      if (!g.name.startsWith('props:an')) {
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
  const near = props && !low ? nearCull(props, NEAR_R[quality.id] || NEAR_R.high) : null;
  if (near) {
    const focus = map.updateShadowFocus;
    map.updateShadowFocus = (target) => {
      focus(target);
      near.to(shell.camera.position);
    };
    near.to(shell.camera.position);
  }
  map.stats = () => ({ ...(stats ? stats() : {}), palette, near: near ? near.stats() : null });
  /* The channel, cut out of the ground. */
  openGround(map.scene, 'plot', CHANNEL_HOLE);
  /* Beyond the plot the mountains' mesh is the ground, valley floor and
   * all, so the pipeline's own ground out there is not drawn under it. */
  const terrain = map.scene.getObjectByName('terrain');
  if (terrain) {
    terrain.visible = false;
  }
  /* The mountains in place of the town's low ridge rings. */
  const backdrop = map.scene.getObjectByName('backdrop');
  if (backdrop) {
    backdrop.visible = false;
  }
  map.scene.add(mountains(map.scene.fog ? map.scene.fog.color : 0xe8dcd8));
  /* The signs, one mesh on one picture; the poles' and guys' wires. */
  const atlas = paintSigns(T.signs);
  const tex = new THREE.CanvasTexture(atlas.canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  map.scene.add(signMesh(THREE, T.signs, atlas, paintMaterial(THREE, tex)));
  if (T.wires.length) {
    map.scene.add(wireLines(T));
  }
  await warmPrograms(shell.renderer, map.scene, shell.camera, map.post.rtScene);
  return map;
}
