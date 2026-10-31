/*
 * index.js: Kamome Wharf as a map, built the way Sunnyfield is
 * (../sunny/index.js): the built map's pipeline (../built/index.js) does the
 * sky, the ground, the ink, the shadows, the colliders, the cull, the named
 * gaps, the drift cars and the marks. This file hands it the port's
 * document (./doc.js) and the port itself (./plan.js) as one structure of
 * its own, draws what the parts cannot say, lays the harbour, hangs the
 * signs (./signs.js) and names the world.
 *
 * WHAT THE DRAW ADDS, in the world frame, after the kit has drawn every
 * part the port marks as drawn: the profiles (prisms: the brick
 * warehouse's roof, the ship's sheer and the hatch lids' crowns), the plan
 * polygons stood up (slabs: the ship's bow, the forecastle), the round
 * things (cylinders, discs, cones, balls), the corrugation of every
 * container's walls (flutes) and the cables (wires). Each in the chunk
 * ./frame.js files its place under.
 *
 * THE HARBOUR is cut out of the ground's planes (openGround, as Sunnyfield's
 * gorge is) from the quay's edge north, and a plane of water is laid at
 * WATER_H under it, which is also the ground the plant is given there
 * (extra.floor). Water is a floor, not a wall: a quad that touches it lands
 * on it, as it would land on the gorge's floor.
 *
 * On Low, what the port marks `fine` is not drawn: the containers'
 * corrugation, their doors and castings, the crane's stiffeners and
 * stairs, the lashing gear. Nothing fine is solid, so the flight is the
 * same. THE SET DRESSING (`near`) is drawn on High and Medium only, in the
 * forty eight cells of ./frame.js nearOf, each switched off past NEAR_R
 * from the camera every frame, and folded one batch a look a cell by the
 * palette merge (../sunny/palette.js).
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
import { dockLayout, dockFloor, dockMarkSpots, WATER_HOLE, W, D, worldAt, chunkOf } from './plan.js';
import { dockDocument } from './doc.js';
import { paintSigns, signMesh } from './signs.js';
import { mergePalette } from '../sunny/palette.js';
import { nearOf, WATER_H } from './frame.js';

/* The chunk a drawn thing is filed under, or its near cell if it is set
 * dressing. */
const cellOf = (thing, x, z) => (thing && thing.near ? nearOf(x, z) : chunkOf(x, z));
const at = (px, py, thing) => cellOf(thing, px - W / 2, D / 2 - py);

/* How near the dressing is drawn, by preset, as Sunnyfield's; Low draws
 * none of it. */
const NEAR_R = { medium: 40, high: 50 };

/* The harbour's water, a plane of its own cull cell: its bounds hold every
 * camera, so the cull never switches it off. */
const WATER_CHUNK = 'dkwater';
const WATER_SIZE = 2400;

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

/*
 * Quads into a position list, each wound so its front faces `out`: the
 * slabs' walls and lids and the flutes' ribs are all built of them, flat
 * shaded, each quad its own four corners.
 */
const _e1 = new THREE.Vector3();
const _e2 = new THREE.Vector3();
const _n = new THREE.Vector3();
function quad(pos, a, b, c, d, out) {
  _e1.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  _e2.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
  _n.crossVectors(_e1, _e2);
  if (_n.x * out[0] + _n.y * out[1] + _n.z * out[2] >= 0) {
    pos.push(...a, ...b, ...c, ...a, ...c, ...d);
  } else {
    pos.push(...a, ...c, ...b, ...a, ...d, ...c);
  }
}

function geometryOf(pos) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/* A convex plan polygon stood from h0 to h1: its walls and its lid, and its
 * floor only where a floor can be seen from under it. */
function slabGeometry(s) {
  const pts = s.poly.map(([px, py]) => worldAt(px, py, 0));
  const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
  const cz = pts.reduce((a, p) => a + p[2], 0) / pts.length;
  const pos = [];
  for (let i = 0; i < pts.length; i += 1) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    const mx = (p[0] + q[0]) / 2 - cx;
    const mz = (p[2] + q[2]) / 2 - cz;
    quad(pos, [p[0], s.h0, p[2]], [q[0], s.h0, q[2]], [q[0], s.h1, q[2]], [p[0], s.h1, p[2]], [mx, 0, mz]);
  }
  for (let i = 1; i + 1 < pts.length; i += 1) {
    const a = pts[0];
    const b = pts[i];
    const c = pts[i + 1];
    quad(pos, [a[0], s.h1, a[2]], [b[0], s.h1, b[2]], [c[0], s.h1, c[2]], [c[0], s.h1, c[2]], [0, 1, 0]);
    if (s.h0 > WATER_H + 0.5) {
      quad(pos, [a[0], s.h0, a[2]], [b[0], s.h0, b[2]], [c[0], s.h0, c[2]], [c[0], s.h0, c[2]], [0, -1, 0]);
    }
  }
  return geometryOf(pos);
}

/*
 * A corrugated wall's ribs: `n` of them, each the outer face and its two
 * cheeks, proud of the face by `out`, a rib's width a little under half
 * the pitch, which is the look of a container's side seen from across the
 * yard. No tops or bottoms: nobody sees a rib's end grain at speed.
 */
const FACE_OUT = { n: [0, 0, -1], s: [0, 0, 1], e: [1, 0, 0], w: [-1, 0, 0] };
function fluteGeometry(flutes) {
  const pos = [];
  for (const f of flutes) {
    const o = FACE_OUT[f.face];
    const a = worldAt(f.px0, f.py0, 0);
    const b = worldAt(f.px1, f.py1, 0);
    const dx = b[0] - a[0];
    const dz = b[2] - a[2];
    const half = 0.22 / f.n;
    for (let i = 0; i < f.n; i += 1) {
      const t = (i + 0.5) / f.n;
      const x0 = a[0] + dx * (t - half);
      const z0 = a[2] + dz * (t - half);
      const x1 = a[0] + dx * (t + half);
      const z1 = a[2] + dz * (t + half);
      const ox = o[0] * f.out;
      const oz = o[2] * f.out;
      quad(pos, [x0 + ox, f.h0, z0 + oz], [x1 + ox, f.h0, z1 + oz], [x1 + ox, f.h1, z1 + oz], [x0 + ox, f.h1, z0 + oz], o);
      const side = [dx, 0, dz];
      quad(pos, [x1, f.h0, z1], [x1 + ox, f.h0, z1 + oz], [x1 + ox, f.h1, z1 + oz], [x1, f.h1, z1], side);
      quad(pos, [x0, f.h0, z0], [x0 + ox, f.h0, z0 + oz], [x0 + ox, f.h1, z0 + oz], [x0, f.h1, z0], [-dx, 0, -dz]);
    }
  }
  return geometryOf(pos);
}

const WIRE_SEGMENTS = 10;
function wireCurve(w) {
  const a = new THREE.Vector3(...worldAt(w.a[0], w.a[1], w.a[2]));
  const b = new THREE.Vector3(...worldAt(w.b[0], w.b[1], w.b[2]));
  const c = a.clone().add(b).multiplyScalar(0.5);
  c.y -= 2 * w.sag;
  return new THREE.QuadraticBezierCurve3(a, c, b);
}

/* The cables again as lines, as Sunnyfield's: a tube three centimetres
 * thick is under a pixel from forty metres, and a line is always one. */
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
  lines.name = 'dock wire lines';
  return lines;
}

/* The near cull, Sunnyfield's (../sunny/index.js nearCull), on this map's
 * cells. */
function nearCull(props, r) {
  const cells = [];
  const bb = new THREE.Box3();
  for (const g of props.children) {
    if (!g.name.startsWith('props:dn')) {
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

function drawPort(kit, T, low) {
  drawPrisms(kit, T.prisms, low);
  for (const s of T.slabs) {
    if (low && s.fine) {
      continue;
    }
    const [px, py] = s.poly[0];
    kit.begin(0, 0, 0, 0, at(px, py, s));
    kit.add(s.m, slabGeometry(s));
  }
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
    kit.ball(b.m, [x, y, z], b.r);
  }
  for (const c of T.cones) {
    if (low && c.fine) {
      continue;
    }
    const [x, y, z] = worldAt(c.px, c.py, c.h);
    kit.begin(0, 0, 0, 0, cellOf(c, x, z));
    kit.cone(c.m, [x, y, z], c.r, c.height, c.seg);
  }
  /* The corrugation, one geometry per colour per near cell: Low draws
   * none, and the rest is switched off with its cell past NEAR_R. */
  if (!low) {
    const groups = new Map();
    for (const f of T.flutes) {
      const [x, , z] = worldAt((f.px0 + f.px1) / 2, (f.py0 + f.py1) / 2, 0);
      const key = `${f.m}|${nearOf(x, z)}`;
      if (!groups.has(key)) {
        groups.set(key, { m: f.m, cell: nearOf(x, z), list: [] });
      }
      groups.get(key).list.push(f);
    }
    for (const g of groups.values()) {
      kit.begin(0, 0, 0, 0, g.cell);
      kit.add(g.m, fluteGeometry(g.list));
    }
  }
  for (const w of T.wires) {
    const curve = wireCurve(w);
    const mid = curve.getPoint(0.5);
    kit.begin(0, 0, 0, 0, chunkOf(mid.x, mid.z));
    kit.add(w.m, new THREE.TubeGeometry(curve, WIRE_SEGMENTS, w.r, 3, false));
  }
  /* The harbour. */
  kit.begin(0, 0, 0, 0, WATER_CHUNK);
  const water = new THREE.PlaneGeometry(WATER_SIZE, WATER_SIZE).rotateX(-Math.PI / 2);
  water.translate(0, WATER_H, -WATER_SIZE / 2 + WATER_HOLE.z1);
  kit.add('dkWater', water);
}

/* A level plane of the ground's with a rectangle cut out of it: Sunnyfield's
 * openGround, which is Heads' house's. */
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

export async function buildMap(shell, onProgress, options) {
  const qid = qualityFor(options && options.quality).id;
  const low = qid === 'low';
  const { parts, T } = dockLayout();
  const extra = {
    el: { id: 'dock', type: 'dock' },
    parts: low ? parts.filter((p) => !(p.fine && !p.solid)) : parts,
    draw: (kit) => drawPort(kit, T, low),
    floor: dockFloor,
    chunkOf: (x, z, p) => cellOf(p, x, z),
  };
  const map = await buildBuilt(shell, onProgress, {
    ...(options || {}), document: dockDocument(), extra, sponsorMarks: false, markSpots: dockMarkSpots(),
  });
  /* Its own world: the shell keys the world, the results and the board's
   * refusal by this id (src/main.js, src/ui/ui.js). */
  map.id = 'dock';
  map.source = 'dock';
  const props = map.scene.getObjectByName('props');
  /* The set dressing casts no shadow, as Sunnyfield's does not. */
  if (props) {
    for (const g of props.children) {
      if (!g.name.startsWith('props:dn')) {
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
  const near = props && !low ? nearCull(props, NEAR_R[qid] || NEAR_R.high) : null;
  if (near) {
    const focus = map.updateShadowFocus;
    map.updateShadowFocus = (target) => {
      focus(target);
      near.to(shell.camera.position);
    };
    near.to(shell.camera.position);
  }
  map.stats = () => ({ ...(stats ? stats() : {}), palette, near: near ? near.stats() : null });
  /* The harbour, cut out of the ground and its kerb. */
  for (const name of ['plot', 'terrain', 'kerb', 'verge']) {
    openGround(map.scene, name, WATER_HOLE);
  }
  /* The apron's lanes are paint of the port's own; the road is the drift
   * cars' line only. */
  const roads = map.scene.getObjectByName('roads');
  if (roads) {
    roads.visible = false;
  }
  const atlas = paintSigns(T.signs);
  const tex = new THREE.CanvasTexture(atlas.canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  map.scene.add(signMesh(THREE, T.signs, atlas, paintMaterial(THREE, tex)));
  map.scene.add(wireLines(T));
  await warmPrograms(shell.renderer, map.scene, shell.camera, map.post.rtScene);
  return map;
}
