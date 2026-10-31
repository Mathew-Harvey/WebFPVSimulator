/*
 * index.js: Shiokaze Point, a resort on a rock island gone to ruin: five
 * hotel blocks of seven storeys on a cliff over the sea, the back street
 * behind them, the shrine steps up the hill, the park and its race on the
 * west end, the quays and the harbour under the east. Built by the built
 * map's pipeline, as Sunnyfield is (../sunny/index.js): the island is one
 * structure (./plan.js), the document says the rest (./yard.js), and the
 * pipeline's town look is its look.
 *
 * THE GROUND IS THE SEA. The plant's floor is 0 everywhere (extra.floor),
 * which is the water's face, and every terrace is a box top the plant and
 * the shell both find (indexTops in ../built/index.js), so the island
 * needs no floor function of its own. The field's plane, its kerb, its
 * verge and the far terrain are hidden; the sea is drawn in their place,
 * one plane on one small picture of the comic's wave strokes, which
 * drifts on the map's clock.
 *
 * THE TERRACES' TOPS are one mesh for the whole island in the comic
 * pass's ground look (markGround), so the grass takes the town's turf and
 * the quays its stones: the grass on the field's own painted material,
 * the paving on a cel of its own, each coloured by its vertices.
 *
 * On Low, what the island marks `fine` is not drawn, and the set dressing
 * (fine and near) is drawn in near cells switched off by range on Medium
 * and High, Sunnyfield's cut (../sunny/index.js NEAR_R).
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
import { cel } from '../city/vendored/core/toon.js';
import { loblollyDraw } from '../../props/street.js';
import { paintMaterial } from '../../art/stf.js';
import { shiokazeLayout, shiokazeMarkSpots, W, D, worldAt, chunkOf } from './plan.js';
import { shiokazeDocument } from './yard.js';
import { paintSigns, signMesh } from './signs.js';
import { mergePalette } from '../sunny/palette.js';
import { nearOf } from './frame.js';
import { TOP, GRASS, DRY } from './terrain.js';

const cellOf = (thing, x, z) => (thing && thing.near ? nearOf(x, z) : chunkOf(x, z));
const at = (px, py, thing) => cellOf(thing, px - W / 2, D / 2 - py);

/* How near the dressing is drawn, by preset, as Sunnyfield's. */
const NEAR_R = { medium: 40, high: 50 };

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

/* Plan triangles, wound counter clockwise from outside, into world
 * positions: plan to world is a turn, so the winding holds. Each triangle
 * its own vertices, so it shades flat as a cel face should. */
function trisGeometry(tris) {
  const pos = new Float32Array(tris.length * 9);
  let k = 0;
  for (const t of tris) {
    for (const [px, py, h] of t) {
      const [x, y, z] = worldAt(px, py, h);
      pos[k] = x;
      pos[k + 1] = y;
      pos[k + 2] = z;
      k += 3;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

const centreOf = (tris) => {
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const t of tris) {
    for (const p of t) {
      sx += p[0];
      sy += p[1];
      n += 1;
    }
  }
  return [sx / n, sy / n];
};

const WIRE_SEGMENTS = 10;
function wireCurve(w) {
  const a = new THREE.Vector3(...worldAt(w.a[0], w.a[1], w.a[2]));
  const b = new THREE.Vector3(...worldAt(w.b[0], w.b[1], w.b[2]));
  const c = a.clone().add(b).multiplyScalar(0.5);
  c.y -= 2 * w.sag;
  return new THREE.QuadraticBezierCurve3(a, c, b);
}

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
  lines.name = 'shiokaze wire lines';
  return lines;
}

/* The near cull, Sunnyfield's (../sunny/index.js nearCull), on this map's
 * near cells. */
function nearCull(props, r) {
  const cells = [];
  const bb = new THREE.Box3();
  for (const g of props.children) {
    if (!g.name.startsWith('props:sq')) {
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

function drawIsland(kit, T, low) {
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
  /* The cliffs, the rocks, the stairs' flights: plan triangles, each list
   * filed under the cell of its middle. */
  for (const m of T.meshes) {
    if ((low && m.fine) || !m.tris.length) {
      continue;
    }
    const [px, py] = centreOf(m.tris);
    kit.begin(0, 0, 0, 0, at(px, py, m));
    kit.add(m.m, trisGeometry(m.tris));
  }
  /* The turned boxes: the fallen slabs, the planks, the boats' thwarts. A
   * box's local x is turned onto the plan direction (ux, uy), which in the
   * world is (ux, 0, -uy), a turn of atan2(uy, ux) about the vertical. */
  for (const o of T.oboxes) {
    if (low && o.fine) {
      continue;
    }
    const [x, y, z] = worldAt(o.px, o.py, (o.h0 + o.h1) / 2);
    kit.begin(x, y, z, Math.atan2(o.uy, o.ux), at(o.px, o.py, o));
    kit.add(o.m, new THREE.BoxGeometry(o.len, o.h1 - o.h0, o.wid));
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
    if (a.el.style === 'loblolly' || a.el.style === 'broad') {
      loblollyDraw(a.el, kit);
    } else {
      kit.element(a.el);
    }
  }
}

/*
 * THE TERRACES' TOPS, one mesh. A triangle longer than twelve metres a
 * side is halved until it is not: headless Chromium's rasteriser loses
 * depth across a big triangle clipped by the near plane (the terrain's
 * note in ../built/ground.js), and the plateau's ear clip makes long
 * slivers. The grass is drawn on the plot's own material, so it is the
 * field's grass picture at the field's scale, its colour a tint; the
 * paving and the rock tops on a plain cel of their colour.
 */
const SPLIT = 12;
function splitTri(t, out) {
  const d = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  const e = [d(t[0], t[1]), d(t[1], t[2]), d(t[2], t[0])];
  const i = e.indexOf(Math.max(...e));
  if (e[i] <= SPLIT) {
    out.push(t);
    return;
  }
  const a = t[i];
  const b = t[(i + 1) % 3];
  const c = t[(i + 2) % 3];
  const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  splitTri([a, m, c], out);
  splitTri([m, b, c], out);
}

const TINT = { [GRASS]: [1, 1, 1], [DRY]: [1, 0.95, 0.74] };

function groundMesh(T, grassMat) {
  const build = (list, tinted) => {
    const tris = [];
    const cols = [];
    for (const g of list) {
      const col = tinted ? TINT[g.c] : new THREE.Color(g.c).toArray();
      for (const t of g.tris) {
        const n = tris.length;
        splitTri(t, tris);
        for (let k = n; k < tris.length; k += 1) {
          cols.push(col);
        }
      }
    }
    if (!tris.length) {
      return null;
    }
    const g = trisGeometry(tris);
    const c = new Float32Array(tris.length * 9);
    const uv = new Float32Array(tris.length * 6);
    const pos = g.attributes.position.array;
    for (let i = 0; i < tris.length; i += 1) {
      for (let v = 0; v < 3; v += 1) {
        c.set(cols[i], i * 9 + v * 3);
        /* The plot's own mapping: 0 to 1 across the field. */
        uv[i * 6 + v * 2] = pos[i * 9 + v * 3] / W + 0.5;
        uv[i * 6 + v * 2 + 1] = 0.5 - pos[i * 9 + v * 3 + 2] / D;
      }
    }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return g;
  };
  const group = new THREE.Group();
  group.name = 'shiokaze ground';
  const grass = build(T.grounds.filter((g) => TINT[g.c]), true);
  const paving = build(T.grounds.filter((g) => !TINT[g.c]), false);
  if (grass) {
    const mat = grassMat || cel({ color: GRASS, bands: 3, cache: false });
    mat.vertexColors = true;
    mat.needsUpdate = true;
    const m = new THREE.Mesh(grass, mat);
    m.receiveShadow = true;
    m.name = 'shiokaze grass';
    group.add(m);
  }
  if (paving) {
    const m = new THREE.Mesh(paving, cel({ color: 0xffffff, bands: 3, tint: 0x6f6790, vertexColors: true, cache: false }));
    m.receiveShadow = true;
    m.name = 'shiokaze paving';
    group.add(m);
  }
  markGround(group);
  return group;
}

/*
 * THE SEA, one plane on one picture. The picture is the comic's water: the
 * town's canal blue (PAL.water, 0x93b8ce) with hard edged pale panels of
 * sky in it and short ink strokes of the swell, the strokes a manga
 * artist lays on open water, 256 pixels across and tiled every 24 m. Cut
 * into 48 m cells for the same reason the field's terrain is (the
 * rasteriser's note in ../built/ground.js). Unlit, so it is the same blue
 * under any light, as a flat tone on a page is, and the fog takes it to
 * the horizon. One draw call; it drifts with the swell on the map's clock.
 */
const SEA = { size: 1920, cells: 40, tile: 24, y: -0.03 };

function seaTexture() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#93b8ce';
  g.fillRect(0, 0, S, S);
  /* A seeded walk, so the picture is the same on every load. */
  let seed = 0x5e1a;
  const rand = () => {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    return seed / 4294967296;
  };
  /* The deeper patches, a shade down, soft edged by being drawn twice. */
  g.fillStyle = '#86adc6';
  for (let i = 0; i < 6; i += 1) {
    const x = rand() * S;
    const y = rand() * S;
    for (const [dx, dy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S]]) {
      g.beginPath();
      g.ellipse(x + dx, y + dy, 40 + rand() * 30, 14 + rand() * 8, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  /* The sky's panels: long pale slivers across the swell. */
  g.fillStyle = '#c5dbe6';
  for (let i = 0; i < 9; i += 1) {
    const x = rand() * S;
    const y = rand() * S;
    const w = 22 + rand() * 40;
    for (const dx of [0, S, -S]) {
      g.beginPath();
      g.moveTo(x + dx, y);
      g.lineTo(x + dx + w, y - 1.5);
      g.lineTo(x + dx + w * 0.8, y + 2.5);
      g.lineTo(x + dx + w * 0.1, y + 3);
      g.closePath();
      g.fill();
    }
  }
  /* The swell's strokes: short curved ink lines, thick in the middle and
   * thin at the ends, in the sea's own dark. */
  g.strokeStyle = '#4f6f8d';
  g.lineCap = 'round';
  for (let i = 0; i < 26; i += 1) {
    const x = rand() * S;
    const y = rand() * S;
    const w = 10 + rand() * 16;
    for (const dx of [0, S, -S]) {
      for (const dy of [0, S, -S]) {
        g.lineWidth = 1.6;
        g.beginPath();
        g.moveTo(x + dx - w / 2, y + dy);
        g.quadraticCurveTo(x + dx, y + dy - 3.5, x + dx + w / 2, y + dy);
        g.stroke();
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(SEA.size / SEA.tile, SEA.size / SEA.tile);
  tex.anisotropy = 4;
  return tex;
}

function seaMesh() {
  const tex = seaTexture();
  const geo = new THREE.PlaneGeometry(SEA.size, SEA.size, SEA.cells, SEA.cells).rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, fog: true }));
  mesh.position.y = SEA.y;
  mesh.name = 'shiokaze sea';
  mesh.userData.noOutline = true;
  mesh.receiveShadow = false;
  return { mesh, tex };
}

/* The swell's drift, metres a second along each axis of the picture. */
const DRIFT = [0.35, 0.12];

export async function buildMap(shell, onProgress, options) {
  const q = qualityFor(options && options.quality);
  const low = q.id === 'low';
  const { parts, T } = shiokazeLayout();
  const extra = {
    el: { id: 'shiokaze', type: 'shiokaze' },
    parts: low ? parts.filter((p) => !(p.fine && !p.solid)) : parts,
    draw: (kit) => drawIsland(kit, T, low),
    floor: () => 0,
    chunkOf: (x, z, p) => cellOf(p, x, z),
    /* The pads are seated on the plateau, not the field's zero. */
    padBase: TOP + 1,
  };
  const doc = shiokazeDocument();
  const map = await buildBuilt(shell, onProgress, {
    ...(options || {}), document: doc, extra, sponsorMarks: false, markSpots: shiokazeMarkSpots(),
  });
  map.id = 'shiokaze';
  map.source = 'shiokaze';
  const props = map.scene.getObjectByName('props');
  if (props) {
    for (const g of props.children) {
      if (!g.name.startsWith('props:sq')) {
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
  const near = props && !low ? nearCull(props, NEAR_R[q.id] || NEAR_R.high) : null;
  if (near) {
    const focus = map.updateShadowFocus;
    map.updateShadowFocus = (target) => {
      focus(target);
      near.to(shell.camera.position);
    };
    near.to(shell.camera.position);
  }
  map.stats = () => ({ ...(stats ? stats() : {}), palette, near: near ? near.stats() : null });
  /* The field's plane, its kerb and verge and the far terrain are the sea's
   * place; the roads are none. The plot's material is the grass's. */
  const plot = map.scene.getObjectByName('plot');
  for (const name of ['plot', 'kerb', 'verge', 'terrain', 'roads']) {
    const o = map.scene.getObjectByName(name);
    if (o) {
      o.visible = false;
    }
  }
  map.scene.add(groundMesh(T, plot ? plot.material.clone() : null));
  const sea = seaMesh();
  map.scene.add(sea.mesh);
  const atlas = paintSigns(T.signs);
  const tex = new THREE.CanvasTexture(atlas.canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  map.scene.add(signMesh(THREE, T.signs, atlas, paintMaterial(THREE, tex)));
  map.scene.add(wireLines(T));
  await warmPrograms(shell.renderer, map.scene, shell.camera, map.post.rtScene);
  /* The swell, on the map's clock: the step is the physics' fixed one, so
   * a replay drifts the same. Wrapped at a tile, so it never loses bits. */
  const anim = map.updateAnim;
  let t = 0;
  map.updateAnim = (step) => {
    anim(step);
    t += step || 0;
    sea.tex.offset.set((t * DRIFT[0] / SEA.tile) % 1, (t * DRIFT[1] / SEA.tile) % 1);
  };
  return map;
}
