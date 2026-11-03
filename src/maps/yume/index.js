/*
 * index.js: Yumeboshi Land as a map, built the way Hinode Park is
 * (../park/index.js): the built map's pipeline (../built/index.js) does
 * the sky, the ground, the ink, the shadows, the colliders, the cull, the
 * named gaps and the marks. This file hands it the park's document
 * (./yard.js) and the park itself (./plan.js) as one structure of its own,
 * draws what the parts cannot say (the roofs, the round things, the rings,
 * the coaster's track as tubes, ./track.js), hangs the signs, and adds
 * what moves: the rides (./drawrides.js), drawn at the step the shell
 * hands updateAnim, and seated as moving solids round the craft every
 * physics step through the map's `sails` (./rides.js ridesSeat), the
 * windmills' road into the plant (src/main.js pushSails), so the train,
 * the gondolas, the horses, the cups, the chairs and the ship are hit
 * where they are drawn.
 *
 * On Low, what the park marks `fine` is not drawn and nothing fine is
 * solid, so the flight is the same; the rides cast no shadow there. The
 * set dressing is drawn in near cells on High and Medium, each switched
 * off past NEAR_R from the camera, and every chunk's colours are folded
 * into one batch a look by Sunnyfield's palette merge (../sunny/
 * palette.js).
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
import { meadowTone } from '../built/ground.js';
import { warmPrograms } from '../../render/warm.js';
import { qualityFor } from '../../render/quality.js';
import { paintMaterial } from '../../art/stf.js';
import { mergeProps } from '../sunny/palette.js';
import {
  yumeLayout, yumeMarkSpots, W, D, worldAt, chunkOf,
} from './plan.js';
import { yumeDocument } from './yard.js';
import { paintSigns, signMesh } from './signs.js';
import { nearOf } from './frame.js';
import { drawTrack } from './track.js';
import { buildRides } from './drawrides.js';
import { ridesSeat } from './rides.js';
import { MOVER_SLOTS } from '../../game/plantworld.js';

/* The grove is the park's trees, every one in one cell of its own: filed
 * by place, each chunk would draw the canopy look, the cone look and the
 * trunk again, a dozen draws for what one draws (Hinode Park's finding,
 * ../park/index.js). */
const GROVE = 'ymGrove';
const cellOf = (thing, x, z) => (thing && thing.grove ? GROVE : thing && thing.near ? nearOf(x, z) : chunkOf(x, z));
const at = (px, py, thing) => cellOf(thing, px - W / 2, D / 2 - py);

/* How near the set dressing is drawn, by preset; Low draws none of it. */
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

/* A level slab over a plan polygon: the shape in the world's x, -z plane,
 * extruded up from h0 to h1. */
function polyGeometry(p) {
  const shape = new THREE.Shape();
  p.pts.forEach(([px, py], i) => {
    const [x, , z] = worldAt(px, py);
    if (i === 0) {
      shape.moveTo(x, -z);
    } else {
      shape.lineTo(x, -z);
    }
  });
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: p.h1 - p.h0, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  g.translate(0, p.h0, 0);
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

/* The near cull: Sunnyfield's (../sunny/index.js nearCull). */
function nearCull(props, r) {
  const cells = [];
  const bb = new THREE.Box3();
  for (const g of props.children) {
    if (!g.name.startsWith('props:yn')) {
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
const LEAF_SPIN = [0, 0, 0];

function drawLand(kit, T, low) {
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
    kit.crownCone(c.m, [x, y, z], c.r, c.height, c.seg);
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
  for (const p of T.polys) {
    if (low && p.fine) {
      continue;
    }
    const [x, , z] = worldAt(p.pts[0][0], p.pts[0][1]);
    kit.begin(0, 0, 0, 0, cellOf(p, x, z));
    kit.add(p.m, polyGeometry(p));
  }
  for (const w of T.wires) {
    const curve = wireCurve(w);
    const mid = curve.getPoint(0.5);
    kit.begin(0, 0, 0, 0, chunkOf(mid.x, mid.z));
    kit.add(w.m, new THREE.TubeGeometry(curve, WIRE_SEGMENTS, w.r, 3, false));
  }
  /* The park's trees' canopies, as the kit's leaf puffs. */
  for (const l of T.leaves) {
    const [x, y, z] = worldAt(l.px, l.py, l.h);
    kit.begin(0, 0, 0, 0, GROVE);
    LEAF_SPIN[1] = l.spin;
    kit.leaf(l.m, [x, y, z], l.r, l.ry, LEAF_SPIN);
  }
  /* The town's own trees, all in one chunk of their own: each brings the
   * town's painted materials, and filed by place every chunk would draw
   * each of them again (Hinode Park's finding, ../park/index.js). */
  for (const a of T.scaled) {
    const [x, y, z] = worldAt(a.px, a.py, a.h);
    kit.begin(x, y, z, a.yaw, 'ymTown');
    if (a.k !== 1) {
      kit.place.multiply(new THREE.Matrix4().makeScale(a.k, a.k, a.k));
    }
    kit.element(a.el);
  }
}

export async function buildMap(shell, onProgress, options) {
  const qid = qualityFor(options && options.quality).id;
  const low = qid === 'low';
  const { parts, T } = yumeLayout();
  const extra = {
    el: { id: 'yume', type: 'yume' },
    parts: low ? parts.filter((p) => !(p.fine && !p.solid)) : parts,
    draw: (kit) => {
      drawLand(kit, T, low);
      drawTrack(kit, low);
    },
    chunkOf: (x, z, p) => cellOf(p, x, z),
  };
  const map = await buildBuilt(shell, onProgress, {
    /* Dry and lush patches on the ground itself, no cost (../built/ground.js). */
    plotTone: meadowTone(0x7e3b),
    ...(options || {}), inkFacets: false, document: yumeDocument(), extra, sponsorMarks: false, markSpots: yumeMarkSpots(),
  });
  /* Its own world: the shell keys the world, the results and the board's
   * refusal by this id (src/main.js, src/ui/ui.js). */
  map.id = 'yume';
  map.source = 'yume';
  const props = map.scene.getObjectByName('props');
  /* The set dressing casts no shadow: its near cells' shadow proxies go
   * before the merge, as Hinode Park's do. */
  if (props) {
    for (const g of props.children) {
      if (!g.name.startsWith('props:yn')) {
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
  const palette = props ? mergeProps(props, map, shell) : { from: 0, to: 0 };
  const near = props && !low ? nearCull(props, NEAR_R[qid] || NEAR_R.high) : null;
  if (near) {
    const focus = map.updateShadowFocus;
    map.updateShadowFocus = (target) => {
      focus(target);
      near.to(shell.camera.position);
    };
    near.to(shell.camera.position);
  }
  const roads = map.scene.getObjectByName('roads');
  if (roads) {
    roads.visible = false;
  }
  /* The signs, one mesh on one picture. */
  const atlas = paintSigns(T.signs);
  const tex = new THREE.CanvasTexture(atlas.canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const signMat = paintMaterial(THREE, tex);
  map.scene.add(signMesh(THREE, T.signs, atlas, signMat));

  /* THE RIDES: drawn at the step, seated at the step. */
  const rides = buildRides({ shadows: !low });
  map.scene.add(rides.group);
  rides.pose(0);
  const baseAnim = map.updateAnim;
  map.updateAnim = (step) => {
    baseAnim(step);
    rides.pose(step);
  };
  map.sails = ridesSeat(MOVER_SLOTS);

  const stats = map.stats;
  map.stats = () => ({
    ...(stats ? stats() : {}), palette, near: near ? near.stats() : null, rides: rides.stats(),
  });
  const baseDispose = map.dispose;
  map.dispose = () => {
    rides.dispose();
    tex.dispose();
    signMat.dispose();
    baseDispose();
  };
  await warmPrograms(shell.renderer, map.scene, shell.camera, map.post.rtScene);
  return map;
}
