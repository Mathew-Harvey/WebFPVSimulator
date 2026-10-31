/*
 * index.js: Kodama Onsen as a map, built the way Sunnyfield is
 * (../sunny/index.js): the built map's pipeline (../built/index.js) does
 * the sky, the ground, the ink, the shadows, the colliders, the cull, the
 * named gaps and the marks. This file hands it the place's document
 * (./yard.js) and the place itself (./plan.js) as one structure, draws what
 * the parts cannot say, cuts the stream out of the ground, closes the fog
 * in to a forest's, and names the world.
 *
 * WHAT THE DRAW ADDS, in the world frame, after the kit has drawn every
 * part the place marks as drawn: the roofs and the torii's lintels
 * (prisms), the posts, rails and brush strokes (cyls), the bath's water
 * (discs), the lanterns' roofs (frusta), the foxes' ears (cones), the rocks
 * (balls), the sacred rope (rings and wires), and the cedars. Each in the
 * chunk ./frame.js files its place under, which the pipeline also files
 * the parts and the document's assets by (chunkOf).
 *
 * THE CEDARS are the town's: its bark and its three crown tones
 * (stCedarWood and stCedar0 to 2, ../../props/street.js), a straight stem
 * and stacked six sided whorls. Drawn here from ./forest.js's numbers with
 * four shared geometries, so three thousand trees are a handful of batches
 * a chunk once ../sunny/palette.js has merged the colours. A tree is 48
 * triangles on Low and 60 on Medium and High, which add the root flare.
 *
 * THE FOG is a forest's, closer than the pipeline sizes it for an open
 * plot (FOG below), and the cull radius follows it. Under the canopy a
 * pilot sees a few hundred trunks and no further, and a chunk past the
 * fog is never drawn.
 *
 * On Low, what the place marks `fine` is not drawn: the timber frames,
 * the stone courses, the brush strokes, the moss. Nothing fine is solid,
 * so the flight is the same.
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
import {
  cedarLayout, cedarFloor, cedarMarkSpots, STREAM_HOLE, W, D, worldAt, chunkOf,
} from './plan.js';
import { cedarDocument } from './yard.js';
import { setChunkCut } from './frame.js';
import { mergePalette } from '../sunny/palette.js';

/* Chunks across on Low (./frame.js): measured against The town at the
 * start on 31 October 2026, see PROGRESS.md. */
const LOW_CUT = 1;

const at = (px, py) => chunkOf(px - W / 2, D / 2 - py);

/*
 * THE FOG, by preset, metres: where it starts and where it ends. The
 * pipeline sizes its fog to the plot's diagonal, 420 m here, which is an
 * open yard's; a forest a pilot flies inside is a few hundred trunks deep
 * at most, and the town's own fog ends at 65 m. These keep the inn in
 * sight from the shrine's steps on High and the far rows as a soft wall.
 */
const FOG = {
  high: { near: 30, far: 230 },
  medium: { near: 28, far: 200 },
  low: { near: 24, far: 170 },
};

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
      kit.begin(0, 0, 0, Math.PI / 2, at((p.e0 + p.e1) / 2, (lo + hi) / 2));
      kit.extrude(p.m, p.profile.map(([a, h]) => [a - D / 2, h]), p.e0 - W / 2, p.e1 - W / 2);
    } else {
      kit.begin(0, 0, 0, 0, at((lo + hi) / 2, (p.e0 + p.e1) / 2));
      kit.extrude(p.m, p.profile.map(([a, h]) => [a - W / 2, h]), D / 2 - p.e1, D / 2 - p.e0);
    }
  }
}

/* A rectangle rising to a smaller one, closed on top. */
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

const WIRE_SEGMENTS = 10;
function wireCurve(w) {
  const a = new THREE.Vector3(...worldAt(w.a[0], w.a[1], w.a[2]));
  const b = new THREE.Vector3(...worldAt(w.b[0], w.b[1], w.b[2]));
  const c = a.clone().add(b).multiplyScalar(0.5);
  c.y -= 2 * w.sag;
  return new THREE.QuadraticBezierCurve3(a, c, b);
}

/*
 * THE CEDAR'S SHARED SHAPES, made once: a six sided stem tapering to a
 * third, open at both ends (its foot is in the ground and its top in the
 * crown); a six sided cone with its base, standing on the origin; and the
 * root flare, a short cone frustum. Every tree is these at a scale.
 */
const GEO = {};
function geo(key) {
  if (!GEO[key]) {
    if (key === 'stem') {
      GEO[key] = new THREE.CylinderGeometry(0.34, 1, 1, 6, 1, true);
    } else if (key === 'whorl') {
      GEO[key] = new THREE.ConeGeometry(1, 1, 6, 1);
    } else {
      GEO[key] = new THREE.CylinderGeometry(1, 1.7, 1, 6, 1, true);
    }
    GEO[key].translate(0, 0.5, 0);
  }
  return GEO[key];
}

const TONES = ['stCedar0', 'stCedar1', 'stCedar2'];
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

function drawTrees(kit, trees, low) {
  for (const t of trees) {
    const [x, , z] = worldAt(t.px, t.py, 0);
    kit.begin(0, 0, 0, 0, chunkOf(x, z));
    _q.identity();
    _p.set(x, 0, z);
    _s.set(t.r, t.H * 0.93, t.r);
    kit.add('stCedarWood', geo('stem'), _m.compose(_p, _q, _s).clone());
    if (!low) {
      _s.set(t.r * 1.05, t.big ? 1.6 : 0.9, t.r * 1.05);
      kit.add('stCedarWood', geo('flare'), _m.compose(_p, _q, _s).clone());
    }
    for (const w of [...t.tiers, t.leader]) {
      _q.setFromAxisAngle(_up, w.spin);
      _p.set(x, w.y, z);
      _s.set(w.r, w.h, w.r * w.ell);
      kit.add(TONES[w.tone], geo('whorl'), _m.compose(_p, _q, _s).clone());
    }
  }
}

function drawPlace(kit, T, low) {
  drawPrisms(kit, T.prisms, low);
  for (const d of T.discs) {
    if (low && d.fine) {
      continue;
    }
    const [x, , z] = worldAt(d.px, d.py, 0);
    kit.begin(0, 0, 0, 0, chunkOf(x, z));
    kit.cyl(d.m, [x, d.h0, z], [x, d.h1, z], d.r, d.seg);
  }
  for (const c of T.cyls) {
    if (low && c.fine) {
      continue;
    }
    kit.begin(0, 0, 0, 0, chunkOf((c.a[0] + c.b[0]) / 2, (c.a[2] + c.b[2]) / 2));
    kit.cyl(c.m, c.a, c.b, c.r, c.seg, c.rTop);
  }
  for (const b of T.balls) {
    if (low && b.fine) {
      continue;
    }
    const [x, y, z] = worldAt(b.px, b.py, b.h);
    kit.begin(0, 0, 0, 0, chunkOf(x, z));
    kit.ball(b.m, [x, y, z], b.r);
  }
  for (const c of T.cones) {
    if (low && c.fine) {
      continue;
    }
    const [x, y, z] = worldAt(c.px, c.py, c.h);
    kit.begin(0, 0, 0, 0, chunkOf(x, z));
    kit.cone(c.m, [x, y, z], c.r, c.height, c.seg);
  }
  for (const f of T.frusta) {
    if (low && f.fine) {
      continue;
    }
    const [x, , z] = worldAt((f.i.x0 + f.i.x1) / 2, (f.i.y0 + f.i.y1) / 2);
    kit.begin(0, 0, 0, 0, chunkOf(x, z));
    kit.add(f.m, frustumGeometry(f));
  }
  /* The ropes, level rings round a trunk. */
  for (const r of T.tori) {
    const [x, y, z] = worldAt(r.px, r.py, r.h);
    kit.begin(x, y, z, 0, chunkOf(x, z));
    const g = new THREE.TorusGeometry(r.R, r.t, r.seg, r.round);
    g.rotateX(Math.PI / 2);
    kit.add(r.m, g);
  }
  /* The hanging ropes and cables, thin tubes along their sag. */
  for (const w of T.wires) {
    const curve = wireCurve(w);
    const mid = curve.getPoint(0.5);
    kit.begin(0, 0, 0, 0, chunkOf(mid.x, mid.z));
    kit.add(w.m, new THREE.TubeGeometry(curve, WIRE_SEGMENTS, w.r, 5, false));
  }
  drawTrees(kit, T.trees, low);
}

/*
 * A level plane of the ground's with a rectangle cut out of it: the
 * stream's, so the ground does not lie across the channel at the grass's
 * height. Sunnyfield's openGround (../sunny/index.js), the same way.
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

export async function buildMap(shell, onProgress, options) {
  const qid = qualityFor(options && options.quality).id;
  const low = qid === 'low';
  setChunkCut(low ? LOW_CUT : 4);
  const { parts, T } = cedarLayout();
  const extra = {
    el: { id: 'cedar', type: 'cedar' },
    /* On Low the fine parts are left out of what is drawn; none is solid. */
    parts: low ? parts.filter((p) => !(p.fine && !p.solid)) : parts,
    draw: (kit) => drawPlace(kit, T, low),
    floor: cedarFloor,
    chunkOf: (x, z) => chunkOf(x, z),
  };
  const doc = cedarDocument();
  const map = await buildBuilt(shell, onProgress, {
    ...(options || {}), document: doc, extra, sponsorMarks: false, markSpots: cedarMarkSpots(),
  });
  /* Its own world: the shell keys the world, the results and the board's
   * refusal by this id (src/main.js, src/ui/ui.js). */
  map.id = 'cedar';
  map.source = 'cedar';
  /* One batch a look in each chunk rather than one a colour. */
  const props = map.scene.getObjectByName('props');
  const palette = props ? mergePalette(props) : { from: 0, to: 0 };
  /* The stream, cut out of the ground. */
  openGround(map.scene, 'plot', STREAM_HOLE);
  openGround(map.scene, 'terrain', STREAM_HOLE);
  /* The forest's fog, and the cull that follows it. */
  const fog = FOG[qid] || FOG.high;
  if (map.scene.fog) {
    map.scene.fog.near = fog.near;
    map.scene.fog.far = fog.far;
  }
  const setCull = map.setCullRadius;
  map.setCullRadius = (r) => setCull(r == null ? fog.far + 4 : r);
  map.setCullRadius(null);
  const stats = map.stats;
  map.stats = () => ({ ...(stats ? stats() : {}), palette, trees: T.trees.length, forestFog: fog });
  await warmPrograms(shell.renderer, map.scene, shell.camera, map.post.rtScene);
  return map;
}
