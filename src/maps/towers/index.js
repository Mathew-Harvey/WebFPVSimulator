/*
 * index.js: Kumoi Towers as a map, built the way Sunnyfield is
 * (../sunny/index.js): the built map's pipeline (../built/index.js) does
 * all of it, the sky, the ground, the ink, the shadows, the colliders, the
 * cull, the named gaps, the cars and cranes, the marks. This file hands it
 * the district's document (./yard.js) and the district itself (./plan.js)
 * as one structure of its own, draws what the parts cannot say, hangs the
 * towers' skins (./facade.js), and names the world.
 *
 * WHAT THE DRAW ADDS, in the world frame, after the kit has drawn every
 * part the plan marks as drawn: the roofs' slopes (prisms), the round
 * things (cyls, discs, balls, cones, the red ring), the pyramids and the
 * shrine's roof (frusta), the cables, and the town's own painted plates
 * (lanterns' noren, shop boards, blade signs, the hall's name), each in
 * the chunk ./frame.js files its place under.
 *
 * THE FACADES are drawn after the pipeline has built the map: a mesh a
 * style a chunk, put in that chunk's group so the cull takes them with it.
 *
 * On Low, what the plan marks `fine` is not drawn: window paint, lanterns,
 * crates, rails, the lane cables. Nothing fine is solid, so the flight is
 * the same. The set dressing is near as well as fine, drawn on High and
 * Medium only within NEAR_R of the camera (nearCull), as Sunnyfield's is,
 * and its batches are folded one a look a cell by Sunnyfield's palette
 * merge (../sunny/palette.js).
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
import { towersLayout, towersMarkSpots, W, D, worldAt, chunkOf } from './plan.js';
import { towersDocument } from './yard.js';
import { nearOf, WORLD_FACE } from './frame.js';
import { facadeMeshes } from './facade.js';
import { mergePalette } from '../sunny/palette.js';

/* The chunk a drawn thing is filed under, or its near cell if it is set
 * dressing. */
const cellOf = (thing, x, z) => (thing && thing.near ? nearOf(x, z) : chunkOf(x, z));
const at = (px, py, thing) => cellOf(thing, px - W / 2, D / 2 - py);

/* How near the dressing is drawn, by preset; Low draws none of it. */
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

const WIRE_SEGMENTS = 8;
function wireCurve(w) {
  const a = new THREE.Vector3(...worldAt(w.a[0], w.a[1], w.a[2]));
  const b = new THREE.Vector3(...worldAt(w.b[0], w.b[1], w.b[2]));
  const c = a.clone().add(b).multiplyScalar(0.5);
  c.y -= 2 * w.sag;
  return new THREE.QuadraticBezierCurve3(a, c, b);
}

/* The cables as one set of lines: a tube a few centimetres thick is under
 * a pixel from forty metres, and a line is always one. */
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
  const lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x39324f }));
  lines.name = 'towers wire lines';
  return lines;
}

/* The near cull, as ../sunny/index.js: each near cell's bounds, and the
 * test to the nearest point of them, set every frame after the
 * pipeline's own cull. */
function nearCull(props, r) {
  const cells = [];
  const bb = new THREE.Box3();
  for (const g of props.children) {
    if (!g.name.startsWith('props:tn')) {
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

/* A plan face's world offset out of its wall, for a plate. */
const OUT = { n: [0, 0, -1], s: [0, 0, 1], e: [1, 0, 0], w: [-1, 0, 0] };

function drawDistrict(kit, T, low) {
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
      kit.blob(b.m, [x, y, z], b.r, b.r, [0, 0, 0]);
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
    kit.add(t.m, new THREE.TorusGeometry(t.R, t.t, t.seg, t.round));
  }
  for (const f of T.frusta) {
    if (low && f.fine) {
      continue;
    }
    const [x, , z] = worldAt((f.i.x0 + f.i.x1) / 2, (f.i.y0 + f.i.y1) / 2);
    kit.begin(0, 0, 0, 0, cellOf(f, x, z));
    kit.add(f.m, frustumGeometry(f));
  }
  /* The town's own painted plates, a hair off the wall they hang on. */
  for (const p of T.plates) {
    if (low && p.fine) {
      continue;
    }
    const o = OUT[p.face];
    const [x, y, z] = worldAt(p.px, p.py, p.h);
    kit.begin(0, 0, 0, 0, cellOf(p, x, z));
    kit.townSign(p.fn, p.arg, x + o[0] * 0.01, y, z + o[2] * 0.01, p.w, p.ht, WORLD_FACE[p.face]);
  }
  for (const a of T.scaled) {
    const [x, y, z] = worldAt(a.px, a.py, a.h);
    kit.begin(x, y, z, a.yaw, chunkOf(x, z));
    if (a.k !== 1) {
      kit.place.multiply(new THREE.Matrix4().makeScale(a.k, a.k, a.k));
    }
    kit.element(a.el);
  }
}

export async function buildMap(shell, onProgress, options) {
  const q = qualityFor(options && options.quality);
  const low = q.id === 'low';
  const { parts, T } = towersLayout();
  const extra = {
    el: { id: 'towers', type: 'towers' },
    /* On Low the fine parts are left out of what is drawn; none is solid. */
    parts: low ? parts.filter((p) => !(p.fine && !p.solid)) : parts,
    draw: (kit) => drawDistrict(kit, T, low),
    chunkOf: (x, z, p) => cellOf(p, x, z),
  };
  const map = await buildBuilt(shell, onProgress, {
    ...(options || {}), document: towersDocument(), extra, sponsorMarks: false, markSpots: towersMarkSpots(),
  });
  map.id = 'towers';
  map.source = 'towers';
  const props = map.scene.getObjectByName('props');
  /* The set dressing casts no shadow: its pieces are small and stand in
   * the shade of the shacks and towers beside them. */
  if (props) {
    for (const g of props.children) {
      if (!g.name.startsWith('props:tn')) {
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
  /* The towers' skins, each in its chunk's group. */
  const skins = facadeMeshes(T.facades);
  for (const { mesh, chunk } of skins) {
    const group = props && props.getObjectByName(`props:${chunk}`);
    (group || map.scene).add(mesh);
    mesh.updateMatrixWorld(true);
  }
  map.scene.add(wireLines(T));
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
  map.stats = () => ({ ...(stats ? stats() : {}), palette, facades: skins.length, near: near ? near.stats() : null });
  /* The roads are paint of the district's own; the loop is lanes only. */
  const roads = map.scene.getObjectByName('roads');
  if (roads) {
    roads.visible = false;
  }
  await warmPrograms(shell.renderer, map.scene, shell.camera, map.post.rtScene);
  return map;
}
