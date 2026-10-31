/*
 * index.js: Kazahana Plain as a map, built the way Sunnyfield is
 * (../sunny/index.js): the built map's pipeline (../built/index.js) does
 * the sky, the ground, the ink, the shadows, the colliders, the cull, the
 * named gaps and the marks. This file hands it the plain's document
 * (./yard.js) and the plain itself (./plan.js) as one structure of its
 * own, draws what the parts cannot say, hangs the signs, strings the
 * lights, and names the world.
 *
 * WHAT THE DRAW ADDS, in the world frame, after the kit has drawn every
 * part the plan marks as drawn: the roofs' slopes (prisms), the round
 * things, the balloons' envelopes in their gores (./envelope.js), the
 * vinyl houses' and the potato store's vaults, the viaduct's faces with
 * their arches cut out, the trees' leaf clumps, the cables, and the bulbs
 * on the strings of lights. Each in the chunk ./frame.js files its place
 * under, so the plain is twenty four cull cells and, once ./palette.js has
 * folded each cell's colours together, a few batches a cell.
 *
 * THE LIGHTS ON LOW. A bulb is a small thing and there are a few thousand
 * of them, so Low draws none, and Medium and High draw each as an
 * octahedron of eight faces. Every preset draws each string as a line in
 * its bulbs' colour along its cable, one draw call for all of them, so the
 * market is lit on Low too.
 *
 * THE TURBINES are drawn out of the fog. The pipeline's fog ends at about
 * 420 m and they stand a mile north of the start, so in the pipeline's
 * batches they would never be seen from the meet. They are a mesh of their
 * own, unfogged, tinted toward the fog's colour by their distance from the
 * camera every frame (aerial perspective, one colour write a frame for
 * each of two materials), the long run's landmark from anywhere on the
 * plain. Their solids are the builder's turbine's, placed by ./plan.js.
 *
 * FOR THE LATENCY RULE: on every other map, nothing (this file loads only
 * when the map is chosen). Per frame here: the near cull's walk over the
 * dressing cells and the turbines' two colour writes, a few microseconds.
 * The draw calls and triangles are measured and written in the PR.
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
import { turbineShape } from '../../props/industrial.js';
import { cel } from '../city/vendored/core/toon.js';
import { mergePalette } from '../sunny/palette.js';
import { kazaLayout, kazaMarkSpots, W, D, worldAt, chunkOf } from './plan.js';
import { kazaDocument } from './yard.js';
import { paintSigns, signMesh } from './signs.js';
import { nearOf } from './frame.js';
import { drawEnvelope, ENVELOPE_H } from './envelope.js';
import { TURBINE_YAW } from './far.js';
import { MATERIALS } from '../../props/kaza.js';

const cellOf = (thing, x, z) => (thing && thing.near ? nearOf(x, z) : chunkOf(x, z));
const at = (px, py, thing) => cellOf(thing, px - W / 2, D / 2 - py);

/* How near the dressing is drawn, by preset; Low draws none of it. */
const NEAR_R = { medium: 40, high: 55 };

/* Prisms, as Sunnyfield draws them. */
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

/* A cable's curve: straight in plan, hanging `sag` at its middle. */
const WIRE_SEGMENTS = 10;
function wireCurve(w) {
  const a = new THREE.Vector3(...worldAt(w.a[0], w.a[1], w.a[2]));
  const b = new THREE.Vector3(...worldAt(w.b[0], w.b[1], w.b[2]));
  const c = a.clone().add(b).multiplyScalar(0.5);
  c.y -= 2 * w.sag;
  return new THREE.QuadraticBezierCurve3(a, c, b);
}

/*
 * THE LINES: every cable as one set of dark lines, and every string of
 * lights as a line in its bulbs' colour, one LineSegments a colour. A line
 * is a pixel at any range, which a 3 cm tube is not.
 */
function lineSets(T) {
  const sets = new Map();
  const push = (hex, w, n) => {
    if (!sets.has(hex)) {
      sets.set(hex, []);
    }
    const pts = wireCurve(w).getPoints(n);
    const list = sets.get(hex);
    for (let i = 0; i < n; i += 1) {
      list.push(pts[i].x, pts[i].y, pts[i].z, pts[i + 1].x, pts[i + 1].y, pts[i + 1].z);
    }
  };
  for (const w of T.wires) {
    push(0x2c2a33, w, WIRE_SEGMENTS);
  }
  for (const s of T.strings) {
    push(MATERIALS[s.m].f, s, s.sag > 0 ? WIRE_SEGMENTS : 1);
  }
  const out = [];
  for (const [hex, pts] of sets) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    g.computeBoundingSphere();
    const lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: hex }));
    lines.name = 'kaza lines';
    out.push(lines);
  }
  return out;
}

/* The near cull, Sunnyfield's: each dressing cell switched off past r. */
function nearCull(props, r) {
  const cells = [];
  const bb = new THREE.Box3();
  for (const g of props.children) {
    if (!g.name.startsWith('props:kn')) {
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

const BULB = new THREE.OctahedronGeometry(1, 0);

/* A geometry turned inside out, every triangle wound the other way and
 * every normal reversed, so its inside is a front face. */
function insideOut(g) {
  const geo = g.index ? g.toNonIndexed() : g;
  const p = geo.attributes.position;
  const n = geo.attributes.normal;
  for (let i = 0; i < p.count; i += 3) {
    for (const a of [p, n]) {
      const x = a.getX(i + 1);
      const y = a.getY(i + 1);
      const z = a.getZ(i + 1);
      a.setXYZ(i + 1, a.getX(i + 2), a.getY(i + 2), a.getZ(i + 2));
      a.setXYZ(i + 2, x, y, z);
    }
  }
  for (let i = 0; i < n.count; i += 1) {
    n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  }
  return geo;
}
const SPIN = [0, 0, 0];

/* The plain's own shapes, drawn into the kit. */
function drawPlain(kit, T, low) {
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
      kit.blob(b.m, [x, y, z], b.r, b.r, SPIN);
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
  /* Rings: the frame's z along the plan's (nx, ny), or up when both are 0;
   * the hoops of the light tunnel are half rings, the arc over the top. */
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
    const half = t.half === true;
    kit.add(t.m, new THREE.TorusGeometry(t.R, t.t, t.seg, half ? Math.ceil(t.round / 2) : t.round, half ? Math.PI : Math.PI * 2));
  }
  for (const f of T.frusta) {
    if (low && f.fine) {
      continue;
    }
    const [x, , z] = worldAt((f.i.x0 + f.i.x1) / 2, (f.i.y0 + f.i.y1) / 2);
    kit.begin(0, 0, 0, 0, cellOf(f, x, z));
    kit.add(f.m, frustumGeometry(f));
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
    kit.element(a.el);
  }
  /* The balloons standing, and the two lying out, on their sides with the
   * crown away from the fan, half full: squashed to 0.48 of their height
   * and 0.85 of their width. */
  for (const e of T.envelopes) {
    const [x, y, z] = worldAt(e.px, e.py, e.hm);
    kit.begin(0, 0, 0, 0, chunkOf(x, z));
    drawEnvelope(kit, x, y, z, e.design, null, low ? 1 : 2);
  }
  for (const l of T.lying) {
    const s = l.dir === 'w' ? -1 : 1;
    const [x, , z] = worldAt(l.px, l.py, 0);
    kit.begin(0, 0, 0, 0, chunkOf(x, z));
    const m = new THREE.Matrix4().makeRotationZ(-s * Math.PI / 2);
    m.premultiply(new THREE.Matrix4().makeScale(1, 0.48, 0.85));
    m.premultiply(new THREE.Matrix4().makeTranslation(0, 7.8 * 0.48 - 0.1, 0));
    drawEnvelope(kit, x + s * 0.4, 0, z, l.design, m, low ? 1 : 2);
  }
  /* The vaults: a half round along py, open or closed at the ends. */
  for (const v of T.vaults) {
    const [x, , z0] = worldAt(v.cx, v.y1, 0);
    const len = v.y1 - v.y0;
    kit.begin(0, 0, 0, 0, chunkOf(x, z0 + len / 2));
    const g = new THREE.CylinderGeometry(v.r, v.r, len, low ? 12 : 20, 1, !v.closed, -Math.PI / 2, Math.PI);
    g.rotateX(-Math.PI / 2);
    g.translate(x, v.h, z0 + len / 2);
    kit.add(v.m || 'kzVinyl', g);
    /* An open one is flown through, so its inside is drawn too. */
    if (!v.closed) {
      kit.add(v.m || 'kzVinyl', insideOut(g.clone()));
    }
    if (!v.closed && !low) {
      /* The hoops' steel, every 1.5 m. */
      for (let y = v.y0; y <= v.y1 + 1e-6; y += 1.5) {
        const [, , zz] = worldAt(v.cx, y, 0);
        const hoop = new THREE.TorusGeometry(v.r + 0.02, 0.025, 3, 12, Math.PI);
        hoop.translate(x, v.h, zz);
        kit.add('kzSteel', hoop);
      }
    }
  }
  /* The viaduct's faces: one outline with every arch cut out, extruded
   * across the deck's width. */
  for (const v of T.viaducts) {
    const shape = new THREE.Shape();
    const xa = v.x0 - W / 2;
    const xb = v.x1 - W / 2;
    shape.moveTo(xa, -0.4);
    shape.lineTo(xb, -0.4);
    shape.lineTo(xb, v.deck);
    shape.lineTo(xa, v.deck);
    shape.closePath();
    for (let i = 0; i < v.n; i += 1) {
      const cx = v.x0 + v.pier + i * v.pitch + v.span / 2 - W / 2;
      const R = v.span / 2;
      const hole = new THREE.Path();
      hole.moveTo(cx - R, 0);
      hole.lineTo(cx - R, v.spring);
      hole.absarc(cx, v.spring, R, Math.PI, 0, true);
      hole.lineTo(cx + R, 0);
      hole.closePath();
      shape.holes.push(hole);
    }
    const g = new THREE.ExtrudeGeometry(shape, { depth: v.y1 - v.y0, bevelEnabled: false, curveSegments: low ? 8 : 14 });
    const [, , zn] = worldAt(0, v.y1, 0);
    g.translate(0, 0, zn);
    kit.begin(0, 0, 0, 0, chunkOf((xa + xb) / 2, zn));
    kit.add(v.m, g);
  }
  /* Canopies as the kit's leaf clumps, n round each crown's middle. */
  for (const L of T.leaves) {
    const [x, y, z] = worldAt(L.c[0], L.c[1], L.c[2]);
    kit.begin(0, 0, 0, 0, chunkOf(x, z));
    for (let k = 0; k < L.n; k += 1) {
      const a = (k / L.n) * Math.PI * 2 + L.seed;
      const off = L.n > 1 ? L.r * 0.45 : 0;
      kit.leaf(L.m, [x + off * Math.cos(a), y + (k % 2) * L.ry * 0.3, z + off * Math.sin(a)], L.r * (L.n > 1 ? 0.75 : 1), L.ry * (L.n > 1 ? 0.75 : 1), [0, a, 0]);
    }
  }
  /* The bulbs, on Medium and High. */
  if (!low) {
    const m = new THREE.Matrix4();
    for (const s of T.strings) {
      const curve = wireCurve(s);
      const len = curve.getLength();
      const n = Math.max(1, Math.round(len / s.step));
      const mid = curve.getPoint(0.5);
      kit.begin(0, 0, 0, 0, chunkOf(mid.x, mid.z));
      for (let i = 0; i <= n; i += 1) {
        const p = curve.getPoint(i / n);
        m.makeScale(0.07, 0.07, 0.07).setPosition(p.x, p.y - 0.06, p.z);
        kit.add(s.m, BULB, m.clone());
      }
    }
  }
}

/*
 * THE TURBINES, out of the fog: tower, nacelle, hub and blades, the
 * builder's turbine's shape (src/props/industrial.js turbineShape), in two
 * materials of their own that ignore the fog, tinted toward the fog's
 * colour by distance every frame. Returns { group, update(eye) }.
 */
const HAZE = [150, 1700];
const HAZE_MAX = 0.55;
function buildTurbines(T, fogColor) {
  const white = cel({ color: 0xf2f2ee, tint: 0x8a83a8, fog: false, cache: false });
  const red = cel({ color: 0xd2463e, tint: 0x6a3a5e, fog: false, cache: false });
  const base = { white: white.color.clone(), red: red.color.clone() };
  const group = new THREE.Group();
  group.name = 'kaza turbines';
  const where = [];
  for (const t of T.turbines) {
    const s = turbineShape(t.el);
    const g = new THREE.Group();
    const [x, , z] = worldAt(t.px, t.py, 0);
    g.position.set(x, 0, z);
    g.rotation.y = TURBINE_YAW;
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(s.rt, s.rb, s.ht, 20), white);
    tower.position.y = s.ht / 2;
    g.add(tower);
    const nacelle = new THREE.Mesh(new THREE.CapsuleGeometry(s.rn, s.xb - s.rn + 1.9 * s.rn, 4, 14), white);
    nacelle.rotation.z = Math.PI / 2;
    nacelle.position.set((s.xb - s.rn - 1.9 * s.rn) / 2, s.H, 0);
    g.add(nacelle);
    const hub = new THREE.Mesh(new THREE.CapsuleGeometry(s.rh, 0.5 * s.rh, 4, 12), white);
    hub.rotation.z = Math.PI / 2;
    hub.position.set(s.xb, s.H, 0);
    g.add(hub);
    for (const b of s.blades) {
      const A = new THREE.Vector3(...b.a);
      const B = new THREE.Vector3(...b.b);
      const M = A.clone().lerp(B, 6 / 7);
      const rm = s.rootR - (s.rootR - s.tipR) * (6 / 7);
      for (const [p, q, r0, r1, mat] of [[A, M, s.rootR, rm, white], [M, B, rm, s.tipR, red]]) {
        const len = p.distanceTo(q);
        const blade = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, 8), mat);
        blade.position.copy(p).lerp(q, 0.5);
        blade.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), q.clone().sub(p).normalize());
        blade.scale.set(1, 1, 0.45);
        g.add(blade);
      }
    }
    g.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    group.add(g);
    where.push(g.position);
  }
  let last = -1;
  return {
    group,
    update(eye) {
      let d = Infinity;
      for (const p of where) {
        d = Math.min(d, Math.hypot(p.x - eye.x, p.z - eye.z));
      }
      const u = Math.min(1, Math.max(0, (d - HAZE[0]) / (HAZE[1] - HAZE[0])));
      const k = Math.round(HAZE_MAX * u * (3 - 2 * u) * 100) / 100;
      if (k === last) {
        return;
      }
      last = k;
      white.color.copy(base.white).lerp(fogColor, k);
      red.color.copy(base.red).lerp(fogColor, k);
    },
    dispose() {
      group.traverse((o) => {
        if (o.isMesh) {
          o.geometry.dispose();
        }
      });
      white.dispose();
      red.dispose();
    },
  };
}

export async function buildMap(shell, onProgress, options) {
  const qid = qualityFor(options && options.quality).id;
  const low = qid === 'low';
  const { parts, T } = kazaLayout();
  const extra = {
    el: { id: 'kaza', type: 'kaza' },
    parts: low ? parts.filter((p) => !(p.fine && !p.solid)) : parts,
    draw: (kit) => drawPlain(kit, T, low),
    chunkOf: (x, z, p) => cellOf(p, x, z),
  };
  const doc = kazaDocument();
  const map = await buildBuilt(shell, onProgress, {
    ...(options || {}), document: doc, extra, sponsorMarks: false, markSpots: kazaMarkSpots(),
  });
  map.id = 'kaza';
  map.source = 'kaza';
  const props = map.scene.getObjectByName('props');
  /* The dressing casts no shadow, as Sunnyfield's does not. */
  if (props) {
    for (const g of props.children) {
      if (!g.name.startsWith('props:kn')) {
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
  /* A plain has no kerb: the plot runs on into the land round it. */
  for (const name of ['kerb', 'verge']) {
    const o = map.scene.getObjectByName(name);
    if (o) {
      o.visible = false;
    }
  }
  const atlas = paintSigns(T.signs);
  const tex = new THREE.CanvasTexture(atlas.canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  map.scene.add(signMesh(THREE, T.signs, atlas, paintMaterial(THREE, tex)));
  for (const l of lineSets(T)) {
    map.scene.add(l);
  }
  const turbines = buildTurbines(T, map.scene.fog ? map.scene.fog.color : new THREE.Color(0xffffff));
  map.scene.add(turbines.group);
  const near = props && !low ? nearCull(props, NEAR_R[qid] || NEAR_R.high) : null;
  const focus = map.updateShadowFocus;
  map.updateShadowFocus = (target) => {
    focus(target);
    if (near) {
      near.to(shell.camera.position);
    }
    turbines.update(shell.camera.position);
  };
  if (near) {
    near.to(shell.camera.position);
  }
  turbines.update(shell.camera.position);
  const stats = map.stats;
  map.stats = () => ({ ...(stats ? stats() : {}), palette, near: near ? near.stats() : null, envelopes: T.envelopes.length + T.lying.length, envelopeH: ENVELOPE_H });
  const dispose = map.dispose;
  map.dispose = () => {
    turbines.dispose();
    dispose();
  };
  await warmPrograms(shell.renderer, map.scene, shell.camera, map.post.rtScene);
  return map;
}
