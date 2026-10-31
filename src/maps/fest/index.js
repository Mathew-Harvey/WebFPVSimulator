/*
 * index.js: Tonbo Fest as a map, built the way Drift Matsuri and Sunnyfield
 * are: the built map's pipeline (../built/index.js) does the sky, the
 * ground, the ink, the shadows, the colliders, the cull, the named gaps,
 * the marks. This file hands it the document (./yard.js) and the venue
 * (./venue.js) as one structure, draws what the venue's parts cannot say
 * (the inflatables' tubes, the tent roofs, the stage's truss and vault, the
 * awnings, the lanterns, the nets, the people), hangs the signs on one
 * picture (./signs.js), and names the world.
 *
 * FOR THE LATENCY RULE. Nothing here runs per frame but the near cull,
 * forty eight bounds tests after the pipeline's own cull. Draw calls are
 * kept down the way Sunnyfield keeps them: twelve chunks, and in each chunk
 * every plain colour folded into one batch with the colour on its vertices
 * (../sunny/palette.js). The set dressing (chairs, kit on the pit benches,
 * crates behind the stalls, ripples, bikes) is fine and near: Low draws none
 * of it, Medium and High draw it inside NEAR_R of the camera only. Every
 * sign is one mesh on one texture, every wire one set of lines. Nothing
 * moves, so nothing animates, and nothing is allocated after the build.
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
import { partnerAllowed } from '../../steam/edition.js';
import { mergePalette } from '../sunny/palette.js';
import { venueLayout, w, chunkOf, nearOf, BANNERS, HIDDEN_KONEX } from './venue.js';
import { festDocument } from './yard.js';
import { paintSigns, signMesh } from './signs.js';

const DEG = Math.PI / 180;

/* How near the dressing is drawn, by preset; Low draws none of it. */
const NEAR_R = { medium: 40, high: 55 };

/* The chunk a drawn thing is filed under, from a world point. */
const cellAt = (thing, x, z) => (thing && thing.near ? nearOf(x, z) : chunkOf(x, z));
const cellPlan = (thing, px, py) => {
  const p = w(px, py);
  return cellAt(thing, p[0], p[2]);
};

/* ---- the shapes the kit has no word for ---- */

/* An ellipsoid with its three radii, turned to a plan heading. */
function ellipsoid(kit, m, c, rx, ry, rz, deg = 0) {
  const g = new THREE.SphereGeometry(1, 12, 8);
  const mtx = new THREE.Matrix4().compose(
    new THREE.Vector3(...c),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), deg * DEG),
    new THREE.Vector3(rx, ry, rz),
  );
  kit.add(m, g, mtx);
}

/* A four sided roof rising from a rectangle to a point. */
function pyramid(o) {
  const a = w(o.x0, o.y0, o.h0);
  const b = w(o.x1, o.y1, o.h0);
  const top = w((o.x0 + o.x1) / 2, (o.y0 + o.y1) / 2, o.h1);
  const c = [[a[0], o.h0, a[2]], [b[0], o.h0, a[2]], [b[0], o.h0, b[2]], [a[0], o.h0, b[2]]];
  const pos = [];
  for (let i = 0; i < 4; i += 1) {
    const p = c[i];
    const q = c[(i + 1) % 4];
    pos.push(...q, ...p, ...top);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  /* Wound one way round in plan, which with the plan's y flipped is the
   * other way in the world: draw both faces rather than guess. */
  const back = g.clone();
  const arr = back.attributes.position.array;
  for (let i = 0; i < arr.length; i += 9) {
    for (let k = 0; k < 3; k += 1) {
      const t = arr[i + 3 + k];
      arr[i + 3 + k] = arr[i + 6 + k];
      arr[i + 6 + k] = t;
    }
  }
  back.computeVertexNormals();
  return [g, back];
}

/* A sheet of net between two plan points, its squares a quarter metre
 * whatever its size: the net texture repeats ten by six over a unit. */
function netSheet(o) {
  const a = w(o.a[0], o.a[1]);
  const b = w(o.b[0], o.b[1]);
  const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
  const ht = o.h1 - o.h0;
  const pos = [a[0], o.h0, a[2], b[0], o.h0, b[2], b[0], o.h1, b[2], a[0], o.h1, a[2]];
  const u = len / 2.5;
  const v = ht / 1.5;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, u, 0, u, v, 0, v], 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

/* A lantern hung at a world point, Drift Matsuri's. */
function lantern(kit, c) {
  kit.cyl('lampRed', [c[0], c[1] - 0.2, c[2]], [c[0], c[1] + 0.2, c[2]], 0.17, 6);
  kit.cyl('drToriiBlack', [c[0], c[1] + 0.2, c[2]], [c[0], c[1] + 0.25, c[2]], 0.11, 6);
  kit.cyl('drToriiBlack', [c[0], c[1] - 0.25, c[2]], [c[0], c[1] - 0.2, c[2]], 0.11, 6);
}

/* A point along a hanging string from A to B (world), sagging `sag`. */
function sagAt(A, B, sag, t) {
  return [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t - sag * 4 * t * (1 - t), A[2] + (B[2] - A[2]) * t];
}

/* Bunting: a cord and a pennant every `every` metres, three colours. */
const PENNANTS = ['mxRed', 'white', 'mxBlue', 'craneYellow'];
function bunting(kit, o) {
  const A = w(...o.a);
  const B = w(...o.b);
  const N = 12;
  for (let i = 0; i < N; i += 1) {
    kit.cyl('rope', sagAt(A, B, o.sag, i / N), sagAt(A, B, o.sag, (i + 1) / N), 0.01, 3);
  }
  const len = Math.hypot(B[0] - A[0], B[2] - A[2]);
  const n = Math.max(2, Math.floor(len / o.every));
  const dir = new THREE.Vector3(B[0] - A[0], 0, B[2] - A[2]).normalize();
  for (let i = 1; i < n; i += 1) {
    const p = sagAt(A, B, o.sag, i / n);
    const half = o.every * 0.4;
    const pos = [
      p[0] - dir.x * half, p[1], p[2] - dir.z * half,
      p[0] + dir.x * half, p[1], p[2] + dir.z * half,
      p[0], p[1] - 0.32, p[2],
    ];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([...pos, pos[3], pos[4], pos[5], pos[0], pos[1], pos[2], pos[6], pos[7], pos[8]], 3));
    g.computeVertexNormals();
    kit.add(PENNANTS[i % PENNANTS.length], g);
  }
}

/* A person, Drift Matsuri's fan with a seat and goggles: a body narrowing
 * to the shoulders, a head, an arm up if cheering; sat, the knees forward. */
function person(kit, f, low) {
  const [x, , z] = w(f.x, f.y);
  const h = f.h;
  const tall = f.sit ? 0.95 : 1.65;
  const top = h + tall;
  const body0 = f.sit ? h + 0.42 : h;
  kit.cyl(f.shirt, [x, body0, z], [x, top - 0.3, z], f.sit ? 0.21 : 0.23, 6, 0.16);
  kit.blob('drSkin', [x, top - 0.12, z], 0.16, 0.17, [0, f.x, 0]);
  const c = Math.cos(f.face * DEG);
  const s = -Math.sin(f.face * DEG);
  if (f.sit) {
    kit.cyl('drIndigo', [x, h + 0.45, z], [x + c * 0.45, h + 0.45, z + s * 0.45], 0.09, 4);
    kit.cyl('drIndigo', [x + c * 0.45, h + 0.45, z + s * 0.45], [x + c * 0.5, h, z + s * 0.5], 0.07, 4);
  }
  if (low) {
    return;
  }
  if (f.goggles) {
    kit.box('drToriiBlack', x + c * 0.1 - 0.12, top - 0.17, z + s * 0.1 - 0.12, x + c * 0.1 + 0.12, top - 0.07, z + s * 0.1 + 0.12);
  }
  if (f.cheer) {
    kit.cyl('drSkin', [x + 0.15, top - 0.38, z], [x + 0.24, top + 0.22, z + 0.05], 0.05, 4);
  }
}

/* A square box truss between two plan points with heights, side s:
 * four chords and a zigzag on each face, as a stage's is. */
function truss(kit, o, low) {
  const A = new THREE.Vector3(...w(...o.a));
  const B = new THREE.Vector3(...w(...o.b));
  const d = B.clone().sub(A);
  const len = d.length();
  d.normalize();
  const ref = Math.abs(d.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const u = new THREE.Vector3().crossVectors(d, ref).normalize().multiplyScalar(o.s / 2);
  const v = new THREE.Vector3().crossVectors(d, u).normalize().multiplyScalar(o.s / 2);
  const corners = [u.clone().add(v), u.clone().sub(v), u.clone().negate().sub(v), u.clone().negate().add(v)];
  for (const k of corners) {
    kit.cyl('fsTrussSilver', A.clone().add(k).toArray(), B.clone().add(k).toArray(), 0.025, 4);
  }
  if (low) {
    return;
  }
  const n = Math.max(1, Math.round(len / o.s));
  for (let f = 0; f < 4; f += 1) {
    const k0 = corners[f];
    const k1 = corners[(f + 1) % 4];
    for (let i = 0; i < n; i += 1) {
      const p = A.clone().addScaledVector(d, (len * i) / n).add(i % 2 ? k0 : k1);
      const q = A.clone().addScaledVector(d, (len * (i + 1)) / n).add(i % 2 ? k1 : k0);
      kit.cyl('fsTrussSilver', p.toArray(), q.toArray(), 0.014, 3);
    }
  }
}

/* ---- the ops ---- */

function drawOp(kit, o, low) {
  if (low && (o.fine || o.near)) {
    return;
  }
  switch (o.t) {
    case 'obox': {
      const p = w(o.c[0], o.c[1], o.c[2]);
      kit.begin(p[0], p[1], p[2], o.deg * DEG, cellAt(o, p[0], p[2]));
      kit.box(o.m, -o.size[0] / 2, 0, -o.size[1] / 2, o.size[0] / 2, o.size[2], o.size[1] / 2);
      break;
    }
    case 'blob': {
      const p = w(...o.c);
      kit.begin(0, 0, 0, 0, cellAt(o, p[0], p[2]));
      kit.blob(o.m, p, o.r, o.ry, [0, o.c[0], 0]);
      break;
    }
    case 'ball': {
      const p = w(...o.c);
      kit.begin(0, 0, 0, 0, cellAt(o, p[0], p[2]));
      kit.ball(o.m, p, o.r);
      break;
    }
    case 'tube': {
      const pts = o.pts.map((q) => new THREE.Vector3(...w(...q)));
      const mid = pts[Math.floor(pts.length / 2)];
      kit.begin(0, 0, 0, 0, cellAt(o, mid.x, mid.z));
      const curve = pts.length === 2 ? new THREE.LineCurve3(pts[0], pts[1]) : new THREE.CatmullRomCurve3(pts, false, 'centripetal');
      kit.add(o.m, new THREE.TubeGeometry(curve, Math.max(2, pts.length * (low ? 2 : 5)), o.r, low ? 6 : o.seg, false));
      /* The end caps, so a tube on the ground is not open. */
      for (const e of [pts[0], pts[pts.length - 1]]) {
        kit.ball(o.m, e.toArray(), o.r);
      }
      if (o.stripe && !low) {
        kit.add(o.stripe, new THREE.TubeGeometry(curve, Math.max(2, pts.length * 5), o.r * 0.35, 4, false),
          new THREE.Matrix4().makeTranslation(0, o.r * 0.75, 0));
      }
      break;
    }
    case 'ladder': {
      const a = w(...o.a);
      kit.begin(0, 0, 0, 0, cellAt(o, a[0], a[2]));
      kit.ladder(o.m, a, w(...o.b), 0.45);
      break;
    }
    case 'pyr': {
      kit.begin(0, 0, 0, 0, cellPlan(o, (o.x0 + o.x1) / 2, (o.y0 + o.y1) / 2));
      for (const g of pyramid(o)) {
        kit.add(o.m, g);
      }
      break;
    }
    case 'net':
      kit.begin(0, 0, 0, 0, cellPlan(o, (o.a[0] + o.b[0]) / 2, (o.a[1] + o.b[1]) / 2));
      kit.add('net', netSheet(o));
      break;
    case 'cylv': {
      const p = w(o.x, o.y);
      kit.begin(0, 0, 0, 0, cellAt(o, p[0], p[2]));
      kit.cyl(o.m, [p[0], o.h0, p[2]], [p[0], o.h1, p[2]], o.r, o.seg ?? 8);
      break;
    }
    case 'cylx': {
      const p = w(o.x, o.y, o.h);
      kit.begin(0, 0, 0, 0, cellAt(o, p[0], p[2]));
      kit.cyl(o.m, p, [p[0] - (o.len ?? 0.1), p[1], p[2]], o.r, 8);
      break;
    }
    case 'truss': {
      const p = w(...o.a);
      kit.begin(0, 0, 0, 0, cellAt(o, p[0], p[2]));
      truss(kit, o, low);
      break;
    }
    case 'vault': {
      /* An arched skin across x, extruded along the plan's y. */
      kit.begin(0, 0, 0, 0, cellPlan(o, (o.x0 + o.x1) / 2, (o.y0 + o.y1) / 2));
      const N = 10;
      const prof = [];
      for (let i = 0; i <= N; i += 1) {
        const t = i / N;
        prof.push([w(o.x0 + (o.x1 - o.x0) * t, 0)[0], o.h0 + o.rise * Math.sin(Math.PI * t)]);
      }
      for (let i = N; i >= 0; i -= 1) {
        prof.push([prof[i][0], prof[i][1] + 0.18]);
      }
      kit.extrude(o.m, prof, w(0, o.y1)[2], w(0, o.y0)[2]);
      break;
    }
    case 'awning': {
      kit.begin(0, 0, 0, 0, cellPlan(o, (o.x0 + o.x1) / 2, (o.y0 + o.y1) / 2));
      const xa = w(o.x0, 0)[0];
      const xb = w(o.x1, 0)[0];
      const hA = o.hLow < o.hHigh ? o.hHigh : o.hLow;
      const prof = [[xa, o.hHigh], [xb, o.hLow], [xb, o.hLow + 0.05], [xa, o.hHigh + 0.05]];
      void hA;
      const n = Math.max(2, Math.round((o.y1 - o.y0) / 0.55));
      for (let i = 0; i < n; i += 1) {
        const z0 = w(0, o.y0 + ((i + 1) * (o.y1 - o.y0)) / n)[2];
        const z1 = w(0, o.y0 + (i * (o.y1 - o.y0)) / n)[2];
        kit.extrude(i % 2 ? 'white' : o.m, prof, z0, z1);
      }
      break;
    }
    case 'lantern':
      kit.begin(0, 0, 0, 0, cellPlan(o, o.c[0], o.c[1]));
      lantern(kit, w(...o.c));
      break;
    case 'lanterns': {
      const A = w(...o.a);
      const B = w(...o.b);
      kit.begin(0, 0, 0, 0, cellPlan(o, (o.a[0] + o.b[0]) / 2, (o.a[1] + o.b[1]) / 2));
      for (let i = 0; i < 6; i += 1) {
        kit.cyl('rope', sagAt(A, B, o.sag, i / 6), sagAt(A, B, o.sag, (i + 1) / 6), 0.012, 3);
      }
      const n = Math.max(2, Math.floor(Math.hypot(B[0] - A[0], B[2] - A[2]) / o.every));
      for (let i = 1; i < n; i += 1) {
        const p = sagAt(A, B, o.sag, i / n);
        lantern(kit, [p[0], p[1] - 0.35, p[2]]);
      }
      break;
    }
    case 'bunting':
      kit.begin(0, 0, 0, 0, cellPlan(o, (o.a[0] + o.b[0]) / 2, (o.a[1] + o.b[1]) / 2));
      bunting(kit, o);
      break;
    case 'parasol': {
      const p = w(...o.c);
      kit.begin(0, 0, 0, 0, cellAt(o, p[0], p[2]));
      kit.cone(o.m, p, o.r, o.h, 8);
      break;
    }
    case 'cable':
      kit.begin(0, 0, 0, 0, cellPlan({ near: true }, o.pts[0][0], o.pts[0][1]));
      if (!low) {
        for (let i = 0; i + 1 < o.pts.length; i += 1) {
          kit.cyl(o.m, w(...o.pts[i]), w(...o.pts[i + 1]), 0.025, 4);
        }
      }
      break;
    case 'balloons': {
      const mid = w(...o.pts[Math.floor(o.pts.length / 2)]);
      kit.begin(0, 0, 0, 0, cellAt(o, mid[0], mid[2]));
      const cols = ['fsBalloonA', 'white', 'mxBlue', 'craneYellow'];
      o.pts.forEach((q, i) => {
        const p = w(...q);
        for (let k = 0; k < (low ? 1 : 4); k += 1) {
          const a = (k * Math.PI) / 2 + i * 0.6;
          kit.ball(cols[(i + k) % 4], [p[0] + Math.cos(a) * 0.18, p[1] + Math.sin(a) * 0.18, p[2] + (k % 2 ? 0.16 : -0.16)], o.r);
        }
      });
      break;
    }
    case 'wing': {
      const p = w(...o.c);
      kit.begin(0, 0, 0, 0, cellAt(o, p[0], p[2]));
      ellipsoid(kit, o.m, p, o.len / 2, 0.07, o.wd / 2, o.side * 6);
      break;
    }
    case 'bike': {
      const p = w(o.x, o.y);
      kit.begin(0, 0, 0, 0, nearOf(p[0], p[2]));
      for (const dz of [-0.5, 0.5]) {
        kit.cyl('drTyre', [p[0] - 0.02, 0.33, p[2] + dz], [p[0] + 0.02, 0.33, p[2] + dz], 0.33, 10);
      }
      kit.cyl(o.m, [p[0], 0.35, p[2] - 0.5], [p[0], 0.75, p[2] + 0.1], 0.025, 4);
      kit.cyl(o.m, [p[0], 0.75, p[2] + 0.1], [p[0], 0.75, p[2] - 0.45], 0.025, 4);
      kit.cyl(o.m, [p[0], 0.35, p[2] + 0.5], [p[0], 0.95, p[2] + 0.42], 0.025, 4);
      kit.box('metal', p[0] - 0.25, 0.95, p[2] + 0.38, p[0] + 0.25, 0.98, p[2] + 0.44);
      kit.box('drToriiBlack', p[0] - 0.08, 0.8, p[2] - 0.5, p[0] + 0.08, 0.85, p[2] - 0.25);
      break;
    }
    case 'cone': {
      const p = w(o.x, o.y);
      kit.begin(0, 0, 0, 0, chunkOf(p[0], p[2]));
      kit.cyl('drNoboriRed', [p[0], 0, p[2]], [p[0], 0.5, p[2]], 0.16, 6, 0.03);
      kit.cyl('white', [p[0], 0.22, p[2]], [p[0], 0.3, p[2]], 0.115, 6, 0.1);
      break;
    }
    case 'stairs': {
      kit.begin(0, 0, 0, 0, cellPlan(o, o.x0, o.y0));
      const n = 3;
      for (let i = 0; i < n; i += 1) {
        const a = w(o.x0 + (i * (o.x1 - o.x0)) / n, o.y0, 0);
        const b = w(o.x1, o.y1, (o.h * (i + 1)) / n - 0.05);
        kit.box(o.m, a[0], a[1], a[2], b[0], b[1], b[2]);
      }
      break;
    }
    default:
      break;
  }
}

/* The cables as one set of lines: a tube three centimetres thick is under
 * a pixel from forty metres, and a line is always one. */
function wireLines(wires) {
  const pts = [];
  for (const wi of wires) {
    const A = w(...wi.a);
    const B = w(...wi.b);
    const N = wi.sag > 0 ? 8 : 1;
    for (let i = 0; i < N; i += 1) {
      pts.push(...sagAt(A, B, wi.sag, i / N), ...sagAt(A, B, wi.sag, (i + 1) / N));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.computeBoundingSphere();
  const lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x2c2a33 }));
  lines.name = 'fest wire lines';
  return lines;
}

/* The near cull, Sunnyfield's (../sunny/index.js nearCull), for this
 * map's near cells. */
function nearCull(props, r) {
  const cells = [];
  const bb = new THREE.Box3();
  for (const g of props.children) {
    if (!g.name.startsWith('props:fn')) {
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

/*
 * THE MARKS. The partners' and patrons' banners on the arena's nets, one
 * each in the roster's order, and the one hidden Konex Drone sign in the
 * sluice. The Steam edition hangs only the partners its profile clears
 * (partnerAllowed), which is none, so it shows no sponsor at all.
 */
const BRANDS = [...PARTNERS, ...MAP_ONLY_PARTNERS, ...PATRON_MAP_BRANDS]
  .filter((p) => shownOn(p, 'fest') && partnerAllowed(p.slug));

export function festMarkSpots() {
  const out = BRANDS.slice(0, BANNERS.length).map((brand, i) => {
    const b = BANNERS[i];
    const n = { n: [0, 1], s: [0, -1], e: [1, 0], w: [-1, 0] }[b.face];
    const px = b.x + n[0] * 0.07;
    const py = b.y + n[1] * 0.07;
    const [x, y, z] = w(px, py, 0.75);
    const wd = Math.min(3.2, 0.95 * signAspect(brand));
    return { slug: brand.slug, p: [x, y, z], n: [n[0], 0, -n[1]], up: [0, 1, 0], w: wd, chunk: chunkOf(x, z) };
  });
  if (BRANDS.some((b) => b.slug === 'konexdrone')) {
    const [x, y, z] = w(HIDDEN_KONEX.x, HIDDEN_KONEX.y, HIDDEN_KONEX.h);
    out.push({ slug: 'konexdrone', key: 'fest#konexdrone~hidden', p: [x, y, z], n: [1, 0, 0], up: [0, 1, 0], w: HIDDEN_KONEX.w, chunk: chunkOf(x, z) });
  }
  return out;
}

export async function buildMap(shell, onProgress, options) {
  const qid = qualityFor(options && options.quality).id;
  const low = qid === 'low';
  const L = venueLayout();
  const doc = festDocument(L.gaps);
  const extra = {
    el: { id: 'fest', type: 'fest' },
    /* On Low the fine parts are left out of what is drawn; none is solid. */
    parts: low ? L.parts.filter((p) => !(p.fine && !p.solid)) : L.parts,
    draw: (kit) => {
      for (const o of L.ops) {
        drawOp(kit, o, low);
      }
      for (const f of L.fans) {
        const p = w(f.x, f.y);
        kit.begin(0, 0, 0, 0, chunkOf(p[0], p[2]));
        person(kit, f, low);
      }
    },
    chunkOf: (x, z, p) => cellAt(p, x, z),
  };
  const map = await buildBuilt(shell, onProgress, {
    ...(options || {}), document: doc, extra, sponsorMarks: false, markSpots: festMarkSpots(),
  });
  /* Its own world: the shell keys the world, the results and the board's
   * refusal by this id (src/main.js, src/ui/ui.js). */
  map.id = 'fest';
  map.source = 'fest';
  const props = map.scene.getObjectByName('props');
  /* The dressing casts no shadow: the pipeline gave each near cell its own
   * casters, and they go, as Sunnyfield's do. */
  if (props) {
    for (const g of props.children) {
      if (!g.name.startsWith('props:fn')) {
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
  /* The signs, one mesh on one picture, and the wires, one set of lines. */
  const atlas = paintSigns(L.signs);
  const tex = new THREE.CanvasTexture(atlas.canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  map.scene.add(signMesh(THREE, L.signs, atlas, paintMaterial(THREE, tex), low));
  map.scene.add(wireLines(L.wires));
  await warmPrograms(shell.renderer, map.scene, shell.camera, map.post.rtScene);
  return map;
}
