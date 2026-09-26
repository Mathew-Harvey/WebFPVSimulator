/*
 * cars.js: every car in the freestyle worlds, drawn in the town's cel look.
 *
 * ONE MODEL, THREE CALLERS. The town's own parked cars (the vendored
 * world/traffic.js parks them with makeVehicle, which hands the drawing to
 * townVehicle here through the hook in PATCH-world-vehicles.diff, and the
 * kei trucks through PATCH-world-props.diff), a built map's parked car
 * (src/props/kit.js town('car')) and a built map's moving car (src/maps/
 * built/cars.js) all come out of buildCar, so a kei van in a yard is the kei
 * van outside the conbini and the drift car is the same car parked or
 * sliding. The vendored builders keep their tables and their placement;
 * only the drawing moved, into this file, which is ours and GPLv3, so an
 * upstream update of the town is a re-copy plus two small patches.
 *
 * THE DIMENSIONS ARE THE TOWN'S, TO THE CENTIMETRE, BECAUSE THEY ARE
 * PHYSICS. L, W, R, the axles, sill, waist, roof, cab, the rakes and the box
 * lorry's box come from the vendored SPEC table itself (imported, not
 * copied), which is what the town's colliders (vehicleSize) and the built
 * map's solids and moving boxes (CAR_KINDS in src/props/street.js, VEHICLE_
 * KINDS in src/maps/built/traffic.js) are sized from. What this file adds
 * is SHAPE, never size: the side profile, the arches, the glasshouse's
 * tumblehome, the lamps, the glass, the wheels. The drawn body is built
 * round the solid boxes, not inside them: a flank is on the box's face, a
 * bumper stands out past L / 2 as the vendored bumper bar did, and where a
 * chamfer rounds an edge the solid's corner is at most 3 cm outside the
 * paint (the shoulder, the roof edge and the r32's doors between its
 * flares). The kei truck keeps makeKeiTruck's own sizes, which is what its
 * collider was written from. The r32 is new, and its numbers are the real
 * coupe's: 4.50 by 1.76 by 1.34 m, a 2.615 m wheelbase.
 *
 * HOW A BODY IS MADE. Two bevelled prisms and what is laid on them. The
 * lower body is the car's side profile (bumpers, bonnet, the waist under
 * the glasshouse, the boot or tailgate, and the two wheel arches cut out of
 * its lower edge) extruded across the car with a chamfer round both flanks,
 * deeper at the four plan corners, which is what turns a slab into a car in
 * the cel ramp: the chamfer takes its own band of light, so a white car has
 * a pale rim along its shoulder and a violet one under its sill, and the
 * screen space ink finds a crease there to draw. The glasshouse is a second
 * prism on the waist, narrower than the body by a shoulder and narrowing
 * again to the roof (the tumblehome). Glass, lamps, grilles, shut lines,
 * handles, mirrors and wheels are laid ON those faces, a few millimetres
 * proud, never inside them (the town's rule: depth is built outward).
 *
 * THE ART'S RULES, the town's. Materials are the vendored cel() and flat()
 * with the town's ramps and violet shadow tints, in the looks the vendored
 * cars already used, so the town's bake folds a car into the batches its
 * neighbours are in and a new car costs triangles, not draw calls. Glass is
 * the palette's dark glass with a pale streak or two across it, the way an
 * animator paints a windscreen. The lamps are the two colours the vendored
 * builder lit a car with (LAMP_FRONT, LAMP_REAR), because src/props/kit.js
 * and src/maps/built/cars.js find the lamps by them to keep them lit at
 * dusk. No badge, no maker's name, no model name anywhere: a car in the
 * art style, recognisable from its shapes.
 *
 * TWO LEVELS OF DETAIL. 'parked' (every parked car, the town's and a built
 * map's) draws the wheels at 12 sides with their outer faces only and
 * keeps a car within the vendored model's triangle count; 'full' (the
 * moving cars, a handful on a map) draws 16 sided wheels with both faces
 * and the rim's dish. A moving car's wheels are not in the body at all:
 * src/maps/built/cars.js draws them from carWheelGeometry as instances.
 *
 * THE CONVENTION, the vendored one: nose along +x, origin at ground level in
 * the middle of the footprint, y up; `ry` turns the nose to (cos ry, 0,
 * -sin ry). Render only: nothing here reaches the physics, which reads the
 * tables and never a mesh, so Math.sin and Math.cos are used freely.
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
import { PAL } from '../maps/city/vendored/core/palette.js';
import { cel, flat } from '../maps/city/vendored/core/toon.js';
import { platePlate } from '../maps/city/vendored/core/textures.js';
import { hullOutline } from '../maps/city/vendored/core/outline.js';
import { SPEC as TOWN_SPEC, CAR, vehicleSize } from '../maps/city/vendored/world/vehicles.js';

export { CAR };

/* The two lamp colours, the vendored builder's, which kit.js and the moving
 * cars recognise a lamp by. */
export const LAMP_FRONT = 0xfff2d4;
export const LAMP_REAR = 0xd8564e;

/* ------------------------------------------------------------------ *
 * THE MESHER. Faces written straight into one indexed buffer per material
 * role, with position, normal and uv, which is the attribute set every
 * BoxGeometry in the town has: a car whose buffers matched nothing would
 * open a bucket of its own in the town's merge (src/maps/city/bake.js keys
 * on the attribute list and on indexing) and cost a draw call a cell.
 *
 * A face's points are counter clockwise seen from the side it faces, and
 * its normal is worked out from them (Newell's), so a face cannot be lit
 * from the wrong side by a sign slip. `toward` turns a face whose winding
 * was not known to face a direction instead. Normals may also be handed in
 * a vertex at a time, which is how a tyre is smooth round its axle and
 * still flat across its tread.
 * ------------------------------------------------------------------ */

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _n = new THREE.Vector3();

class Mesher {
  constructor() {
    this.roles = new Map();
    this.matrix = null;
    this.normalMatrix = new THREE.Matrix3();
    this.triangles = 0;
  }

  /* Everything added until the next call is moved by `m` (a Matrix4), or
   * by nothing. */
  at(m) {
    this.matrix = m;
    if (m) {
      this.normalMatrix.getNormalMatrix(m);
    }
    return this;
  }

  buf(role) {
    let b = this.roles.get(role);
    if (!b) {
      b = { p: [], n: [], uv: [], idx: [] };
      this.roles.set(role, b);
    }
    return b;
  }

  /*
   * One planar face. `pts` are [x, y, z]; `tris` a flat list of index
   * triples into them (a fan when omitted, for a convex face); `normals`
   * one [x, y, z] a point when the face is not flat shaded; `uvs` one
   * [u, v] a point for a face that carries a map.
   */
  face(role, pts, { tris = null, normals = null, uvs = null, toward = null } = {}) {
    const k = pts.length;
    if (k < 3) {
      return;
    }
    const P = new Array(k);
    for (let i = 0; i < k; i += 1) {
      _a.set(pts[i][0], pts[i][1], pts[i][2]);
      if (this.matrix) {
        _a.applyMatrix4(this.matrix);
      }
      P[i] = [_a.x, _a.y, _a.z];
    }
    /* Newell's normal, which is right for any planar polygon however it
     * was cut. */
    let nx = 0;
    let ny = 0;
    let nz = 0;
    for (let i = 0; i < k; i += 1) {
      const p = P[i];
      const q = P[(i + 1) % k];
      nx += (p[1] - q[1]) * (p[2] + q[2]);
      ny += (p[2] - q[2]) * (p[0] + q[0]);
      nz += (p[0] - q[0]) * (p[1] + q[1]);
    }
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len < 1e-12) {
      return;
    }
    nx /= len;
    ny /= len;
    nz /= len;
    let flip = false;
    if (toward) {
      _n.set(toward[0], toward[1], toward[2]);
      if (this.matrix) {
        _n.applyMatrix3(this.normalMatrix);
      }
      flip = nx * _n.x + ny * _n.y + nz * _n.z < 0;
      if (flip) {
        nx = -nx;
        ny = -ny;
        nz = -nz;
      }
    }
    const b = this.buf(role);
    const base = b.p.length / 3;
    for (let i = 0; i < k; i += 1) {
      b.p.push(P[i][0], P[i][1], P[i][2]);
      if (normals) {
        _n.set(normals[i][0], normals[i][1], normals[i][2]);
        if (this.matrix) {
          _n.applyMatrix3(this.normalMatrix);
        }
        _n.normalize();
        if (flip) {
          _n.negate();
        }
        b.n.push(_n.x, _n.y, _n.z);
      } else {
        b.n.push(nx, ny, nz);
      }
      if (uvs) {
        b.uv.push(uvs[i][0], uvs[i][1]);
      } else {
        b.uv.push(0, 0);
      }
    }
    const T = tris ?? fan(k);
    for (let i = 0; i < T.length; i += 3) {
      if (flip) {
        b.idx.push(base + T[i], base + T[i + 2], base + T[i + 1]);
      } else {
        b.idx.push(base + T[i], base + T[i + 1], base + T[i + 2]);
      }
    }
    this.triangles += T.length / 3;
  }

  /* An axis aligned box in the current frame: six faces. `skip` names
   * faces nobody can see ('-y' under a thing standing on something). */
  box(role, x0, y0, z0, x1, y1, z1, skip = '') {
    const F = [
      ['+x', [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]]],
      ['-x', [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]]],
      ['+y', [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]]],
      ['-y', [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]]],
      ['+z', [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]],
      ['-z', [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]]],
    ];
    for (const [name, pts] of F) {
      if (!skip.includes(name)) {
        this.face(role, pts);
      }
    }
  }

  /* A box between two points of a side profile, `t` thick across the
   * profile and spanning z0 to z1: a strut, a wiper, a stanchion. */
  bar(role, ax, ay, bx, by, t, z0, z1) {
    const dx = bx - ax;
    const dy = by - ay;
    const l = Math.sqrt(dx * dx + dy * dy);
    if (l < 1e-6) {
      return;
    }
    const ox = (-dy / l) * (t / 2);
    const oy = (dx / l) * (t / 2);
    const q = [[ax - ox, ay - oy], [bx - ox, by - oy], [bx + ox, by + oy], [ax + ox, ay + oy]];
    slab(this, role, q, z0, z1);
  }

  /* One BufferGeometry a role, indexed, with the town's attribute set. */
  geometry(role) {
    const b = this.roles.get(role);
    if (!b || !b.idx.length) {
      return null;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(b.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
    const n = b.p.length / 3;
    g.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(b.idx, 1) : new THREE.Uint16BufferAttribute(b.idx, 1));
    g.computeBoundingSphere();
    return g;
  }
}

function fan(k) {
  const t = [];
  for (let i = 1; i < k - 1; i += 1) {
    t.push(0, i, i + 1);
  }
  return t;
}

/* ------------------------------------------------------------------ *
 * Plane polygons, [x, y] counter clockwise.
 * ------------------------------------------------------------------ */

function area2(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

/* Keep the part of a convex polygon where a x + b y + c >= 0
 * (Sutherland and Hodgman, one plane). */
function clip(poly, a, b, c) {
  const out = [];
  for (let i = 0; i < poly.length; i += 1) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const fp = a * p[0] + b * p[1] + c;
    const fq = a * q[0] + b * q[1] + c;
    if (fp >= 0) {
      out.push(p);
    }
    if ((fp >= 0) !== (fq >= 0)) {
      const t = fp / (fp - fq);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return out;
}

/* The polygon moved in by `c[i]` at each corner along its mitre, which is
 * the offset of both edges by the same amount at a corner and a smooth
 * blend where neighbouring corners differ. */
function inset(poly, c) {
  const n = poly.length;
  const out = new Array(n);
  for (let i = 0; i < n; i += 1) {
    const p = poly[(i + n - 1) % n];
    const q = poly[i];
    const r = poly[(i + 1) % n];
    let ax = q[0] - p[0];
    let ay = q[1] - p[1];
    let bx = r[0] - q[0];
    let by = r[1] - q[1];
    const la = Math.sqrt(ax * ax + ay * ay) || 1;
    const lb = Math.sqrt(bx * bx + by * by) || 1;
    ax /= la; ay /= la; bx /= lb; by /= lb;
    /* Inward normals of a counter clockwise polygon are its left normals. */
    const n1x = -ay;
    const n1y = ax;
    const n2x = -by;
    const n2y = bx;
    const d = 1 + n1x * n2x + n1y * n2y;
    const k = d > 0.25 ? c[i] / d : c[i] / 0.25;
    out[i] = [q[0] + (n1x + n2x) * k, q[1] + (n1y + n2y) * k];
  }
  return out;
}

/* Triangles for a simple polygon, as index triples, counter clockwise. */
function triangulate(poly) {
  const contour = poly.map((p) => new THREE.Vector2(p[0], p[1]));
  const faces = THREE.ShapeUtils.triangulateShape(contour, []);
  const out = [];
  for (const [a, b, c] of faces) {
    const s = (poly[b][0] - poly[a][0]) * (poly[c][1] - poly[a][1]) - (poly[c][0] - poly[a][0]) * (poly[b][1] - poly[a][1]);
    if (s >= 0) {
      out.push(a, b, c);
    } else {
      out.push(a, c, b);
    }
  }
  return out;
}

/* A plane polygon of a side profile, extruded from z0 to z1 with square
 * edges: a bumper insert, a lamp housing, a spoiler. */
function slab(M, role, poly, z0, z1, { ends = true } = {}) {
  const q = area2(poly) >= 0 ? poly : poly.slice().reverse();
  const n = q.length;
  for (let i = 0; i < n; i += 1) {
    const p = q[i];
    const r = q[(i + 1) % n];
    M.face(role, [[p[0], p[1], z0], [r[0], r[1], z0], [r[0], r[1], z1], [p[0], p[1], z1]]);
  }
  if (ends) {
    const T = triangulate(q);
    M.face(role, q.map((p) => [p[0], p[1], z1]), { tris: T });
    M.face(role, q.map((p) => [p[0], p[1], z0]), { tris: T, toward: [0, 0, -1] });
  }
}

/*
 * THE BEVELLED PRISM: a side profile extruded across the car, its flanks
 * chamfered. `pts` are { x, y, c, d } counter clockwise seen from +z: c is
 * how far the flank's face is inset in the profile's own plane at that
 * corner, d how deep the chamfer runs across the car there. `hw(x, y)` is
 * the half width at a point, which a glasshouse narrows toward its roof.
 * `edgeRole(i)` names the material of the band face along edge i, so an
 * arch can be dark inside while the bonnet is paint; the flanks and the
 * chamfers take `role`. Returns the flank polygon, inset, for whatever is
 * laid on it.
 */
function prism(M, role, pts, hw, { edgeRole = null, sides = [1, -1] } = {}) {
  const n = pts.length;
  const P = pts.map((p) => [p.x, p.y]);
  const Q = inset(P, pts.map((p) => p.c ?? 0));
  const T = triangulate(Q);
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    const pi = pts[i];
    const pj = pts[j];
    const r = edgeRole ? edgeRole(i) : role;
    if (r) {
      const zi = hw(pi.x, pi.y) - (pi.d ?? 0);
      const zj = hw(pj.x, pj.y) - (pj.d ?? 0);
      M.face(r, [[pi.x, pi.y, -zi], [pj.x, pj.y, -zj], [pj.x, pj.y, zj], [pi.x, pi.y, zi]]);
    }
  }
  for (const s of sides) {
    for (let i = 0; i < n; i += 1) {
      const j = (i + 1) % n;
      const pi = pts[i];
      const pj = pts[j];
      if (!(pi.c || pi.d || pj.c || pj.d)) {
        continue;
      }
      const a = [pi.x, pi.y, s * (hw(pi.x, pi.y) - (pi.d ?? 0))];
      const b = [pj.x, pj.y, s * (hw(pj.x, pj.y) - (pj.d ?? 0))];
      const c = [Q[j][0], Q[j][1], s * hw(Q[j][0], Q[j][1])];
      const d = [Q[i][0], Q[i][1], s * hw(Q[i][0], Q[i][1])];
      const r = edgeRole ? edgeRole(i, true) ?? role : role;
      if (s > 0) {
        M.face(r, [a, b, c, d]);
      } else {
        M.face(r, [d, c, b, a]);
      }
    }
    const cap = Q.map((q) => [q[0], q[1], s * hw(q[0], q[1])]);
    M.face(role, cap, { tris: T, toward: [0, 0, s] });
  }
  return Q;
}

/* ------------------------------------------------------------------ *
 * The materials: the town's own looks, so a car costs no new program and,
 * in the town, no new bucket.
 * ------------------------------------------------------------------ */

/* The streak across the glass, and the indicator amber. */
const GLINT = 0x93aac2;
const AMBER = 0xeaa451;
/* A reversing lamp's clear lens: not LAMP_FRONT, so it is never lit. */
const CLEAR = 0xe9e6e2;

const MAT = {};
function mats() {
  if (MAT.dark) {
    return MAT;
  }
  MAT.dark = cel({ color: 0x36333e, bands: 2, tint: 0x4b4560 });
  MAT.brite = cel({ color: PAL.metal, bands: 3, tint: 0x666090 });
  MAT.briteDark = cel({ color: PAL.metalDark, bands: 3, tint: 0x5c5680 });
  MAT.glass = flat({ color: PAL.glassDark });
  MAT.glint = flat({ color: GLINT });
  MAT.lampF = flat({ color: LAMP_FRONT });
  MAT.lampR = flat({ color: LAMP_REAR });
  MAT.amber = flat({ color: AMBER });
  MAT.clear = flat({ color: CLEAR });
  /* One plate material for every car, as the vendored builder kept one:
   * flat() does not cache a mapped material. */
  MAT.plate = flat({ color: 0xffffff, map: platePlate(), cache: false });
  return MAT;
}
const paint = (c) => cel({ color: c, bands: 3, tint: 0x6a6288 });
const deepOf = (c) => new THREE.Color(c).multiplyScalar(0.76).getHex();
const deepPaint = (c) => cel({ color: deepOf(c), bands: 3, tint: 0x5e5680 });

/* ------------------------------------------------------------------ *
 * THE TABLE. Each kind is the vendored row (its sizes, untouched) and a
 * row of shape here. Shape fields, all metres in the car's frame:
 *
 *   nose, tail   the side profile's two ends. edge: height of the bonnet's
 *                (the boot's, the tailgate's) leading edge; face: where the
 *                lamp face stands against L / 2; out: how far the bumper
 *                stands past L / 2; bumper and dam: the bumper's top and
 *                bottom; lean: how far the face leans back at its top;
 *                tuck: how far the bumper's foot is tucked under.
 *   arch         gap: the arch's radius over the tyre's; lift: its centre
 *                over the axle; lip: the flare's width, 0 for none.
 *   cham         [c, d] of the flank chamfer (e) and of the plan corners
 *                at either end (n), see prism().
 *   cabin        shoulder: the glasshouse's step in from the flank at the
 *                waist; tuck: how much more it narrows by the roof; roof:
 *                the roof edge's chamfer.
 *   glass        belt: the glass's sill over the waist; frame: the pillar
 *                and header round it; pillars: 'dark' for blacked out
 *                pillars, 'body' for painted ones, 'chrome' for a frame.
 *   front, rear  the lamps, grille and bumper furniture, by style.
 *   wheel        the rim: 'cap' a plastic trim, 'steel' a painted steel
 *                wheel and hub cap, 'alloy5', 'alloy6', 'multi', 'truck'.
 * ------------------------------------------------------------------ */

const SHAPE = {
  kei: {
    nose: { edge: 0.95, face: 0.03, out: 0.05, bumper: 0.64, dam: 0.30, lean: 0.08, tuck: 0.06 },
    tail: { edge: 0.99, face: -0.01, out: 0.035, bumper: 0.56, dam: 0.36, lean: 0.03, tuck: 0.05 },
    arch: { gap: 0.05, lift: 0.03, lip: 0.035 },
    cham: { e: [0.035, 0.035], n: [0.10, 0.13] },
    cabin: { shoulder: 0.03, tuck: 0.05, roof: 0.06 },
    glass: { belt: 0.04, frame: 0.055, pillars: 'dark' },
    front: { lamps: 'swept', lampY: [0.80, 0.93], lampW: 0.36, grille: 'slim', intake: [0.36, 0.50, 0.70] },
    rear: { lamps: 'pillar', lampY: [0.64, 1.02], lampW: 0.13, spoiler: true, garnish: false },
    wheel: 'cap', bumpers: 'body',
  },
  keivan: {
    nose: { edge: 1.00, face: 0.01, out: 0.045, bumper: 0.60, dam: 0.32, lean: 0.05, tuck: 0.05 },
    tail: { edge: 1.01, face: -0.005, out: 0.045, bumper: 0.52, dam: 0.36, lean: 0.01, tuck: 0.04 },
    arch: { gap: 0.05, lift: 0.03, lip: 0.03 },
    cham: { e: [0.03, 0.03], n: [0.07, 0.09] },
    cabin: { shoulder: 0.025, tuck: 0.035, roof: 0.05 },
    glass: { belt: 0.04, frame: 0.06, pillars: 'body' },
    front: { lamps: 'rect', lampY: [0.78, 0.92], lampW: 0.30, grille: 'slats', intake: null },
    rear: { lamps: 'low', lampY: [0.56, 0.88], lampW: 0.12, spoiler: false },
    wheel: 'steel', bumpers: 'dark',
  },
  hatch: {
    nose: { edge: 0.93, face: 0.03, out: 0.05, bumper: 0.62, dam: 0.27, lean: 0.08, tuck: 0.08 },
    tail: { edge: 0.97, face: 0.0, out: 0.035, bumper: 0.60, dam: 0.32, lean: 0.05, tuck: 0.06 },
    arch: { gap: 0.05, lift: 0.03, lip: 0.035 },
    cham: { e: [0.035, 0.04], n: [0.12, 0.15] },
    cabin: { shoulder: 0.035, tuck: 0.055, roof: 0.05 },
    glass: { belt: 0.035, frame: 0.05, pillars: 'dark' },
    front: { lamps: 'swept', lampY: [0.76, 0.90], lampW: 0.40, grille: 'slim', intake: [0.34, 0.50, 0.86] },
    rear: { lamps: 'corner', lampY: [0.74, 0.96], lampW: 0.26, spoiler: true },
    wheel: 'alloy5', bumpers: 'body',
  },
  sedan: {
    nose: { edge: 0.93, face: 0.01, out: 0.05, bumper: 0.60, dam: 0.28, lean: 0.05, tuck: 0.07 },
    tail: { edge: 0.95, face: 0.0, out: 0.05, bumper: 0.58, dam: 0.32, lean: 0.05, tuck: 0.06 },
    arch: { gap: 0.05, lift: 0.03, lip: 0.03 },
    cham: { e: [0.03, 0.035], n: [0.07, 0.09] },
    cabin: { shoulder: 0.04, tuck: 0.06, roof: 0.045 },
    glass: { belt: 0.03, frame: 0.05, pillars: 'chrome' },
    front: { lamps: 'rect', lampY: [0.72, 0.86], lampW: 0.40, grille: 'chrome', intake: [0.34, 0.44, 0.90] },
    rear: { lamps: 'wide', lampY: [0.70, 0.86], lampW: 0.46, spoiler: false, garnish: true },
    wheel: 'alloy6', bumpers: 'body', chromeStrip: true,
  },
  wagon: {
    nose: { edge: 0.93, face: 0.02, out: 0.05, bumper: 0.60, dam: 0.28, lean: 0.07, tuck: 0.06 },
    tail: { edge: 0.97, face: -0.005, out: 0.045, bumper: 0.56, dam: 0.34, lean: 0.02, tuck: 0.05 },
    arch: { gap: 0.05, lift: 0.03, lip: 0.03 },
    cham: { e: [0.03, 0.035], n: [0.09, 0.12] },
    cabin: { shoulder: 0.035, tuck: 0.045, roof: 0.045 },
    glass: { belt: 0.035, frame: 0.05, pillars: 'dark' },
    front: { lamps: 'rect', lampY: [0.74, 0.88], lampW: 0.36, grille: 'slats', intake: [0.34, 0.46, 0.80] },
    rear: { lamps: 'pillar', lampY: [0.62, 0.96], lampW: 0.12, spoiler: false },
    wheel: 'steel', bumpers: 'dark',
  },
  minivan: {
    nose: { edge: 1.01, face: 0.03, out: 0.05, bumper: 0.64, dam: 0.30, lean: 0.08, tuck: 0.07 },
    tail: { edge: 1.05, face: -0.01, out: 0.035, bumper: 0.60, dam: 0.36, lean: 0.03, tuck: 0.05 },
    arch: { gap: 0.05, lift: 0.03, lip: 0.035 },
    cham: { e: [0.035, 0.04], n: [0.12, 0.15] },
    cabin: { shoulder: 0.03, tuck: 0.05, roof: 0.06 },
    glass: { belt: 0.04, frame: 0.055, pillars: 'dark' },
    front: { lamps: 'swept', lampY: [0.82, 0.97], lampW: 0.40, grille: 'slats', intake: [0.36, 0.52, 0.84] },
    rear: { lamps: 'pillar', lampY: [0.70, 1.12], lampW: 0.14, spoiler: true },
    wheel: 'alloy5', bumpers: 'body',
  },
  van: {
    nose: { edge: 1.10, face: -0.01, out: 0.045, bumper: 0.66, dam: 0.34, lean: 0.03, tuck: 0.05 },
    tail: { edge: 1.11, face: -0.005, out: 0.05, bumper: 0.58, dam: 0.38, lean: 0.01, tuck: 0.04 },
    arch: { gap: 0.05, lift: 0.03, lip: 0.03 },
    cham: { e: [0.03, 0.03], n: [0.08, 0.10] },
    cabin: { shoulder: 0.025, tuck: 0.03, roof: 0.06 },
    glass: { belt: 0.05, frame: 0.06, pillars: 'body' },
    front: { lamps: 'rect', lampY: [0.84, 0.98], lampW: 0.34, grille: 'slats', intake: null },
    rear: { lamps: 'low', lampY: [0.62, 0.96], lampW: 0.13, spoiler: false },
    wheel: 'steel', bumpers: 'dark',
  },
  boxtruck: {
    nose: { edge: 1.18, face: -0.01, out: 0.06, bumper: 0.74, dam: 0.44, lean: 0.03, tuck: 0.04 },
    tail: null,
    arch: { gap: 0.06, lift: 0.04, lip: 0.035 },
    cham: { e: [0.03, 0.03], n: [0.09, 0.11] },
    cabin: { shoulder: 0.03, tuck: 0.04, roof: 0.07 },
    glass: { belt: 0.06, frame: 0.06, pillars: 'body' },
    front: { lamps: 'bumper', lampY: [0.58, 0.70], lampW: 0.26, grille: 'panel', intake: null },
    rear: { lamps: 'bar' },
    wheel: 'truck', bumpers: 'steel',
  },
  minibus: {
    nose: { edge: 1.24, face: 0.01, out: 0.06, bumper: 0.80, dam: 0.46, lean: 0.06, tuck: 0.05 },
    tail: { edge: 1.24, face: -0.01, out: 0.06, bumper: 0.76, dam: 0.48, lean: 0.02, tuck: 0.05 },
    arch: { gap: 0.06, lift: 0.04, lip: 0.04 },
    cham: { e: [0.04, 0.04], n: [0.14, 0.16] },
    cabin: { shoulder: 0.03, tuck: 0.05, roof: 0.10 },
    glass: { belt: 0.04, frame: 0.07, pillars: 'dark' },
    front: { lamps: 'rect', lampY: [0.88, 1.02], lampW: 0.40, grille: 'slats', intake: null },
    rear: { lamps: 'pillar', lampY: [0.80, 1.20], lampW: 0.14, spoiler: false },
    wheel: 'bus', bumpers: 'dark', band: 0x6f9a8c,
  },
};

/*
 * THE R32, a new kind. Every size is the real coupe's: 4.50 m long, 1.76 m
 * over its flares, 1.34 m high, a 2.615 m wheelbase on 225 section tyres of
 * 0.63 m, lowered and on a touch of negative camber as a drift car stands.
 * src/props/street.js CAR_KINDS carries the same numbers for its solids,
 * including the step down to the bonnet (bonnet), since a solid at the
 * waist over a low bonnet would be an invisible wall over the nose.
 *
 * What says what it is, with no name on it: the long bonnet and short
 * upright glasshouse on a boxy two door body, slim oblong headlamps either
 * side of a narrow grille, the deep front bumper and its lip, the four
 * round tail lamps in a dark panel, the wing on the boot lid, square
 * flared arches over wide multi spoke wheels.
 */
const R32 = {
  L: 4.50, W: 1.76, R: 0.315, axle: [1.30, -1.315],
  sill: 0.30, waist: 0.86, roof: 1.34,
  cab: [-1.45, 0.55], rakeF: 0.62, rakeR: 0.50,
  seams: [-0.52], handles: [-0.42],
  /* The body's own flank, inside the flares, and the cabin's width at the
   * roof: the solids take these. */
  door: 1.71, cw: 1.32,
  bonnet: { x: 0.30, y: 0.80 },
  tw: 0.225, camber: 0.05,
};
const R32_SHAPE = {
  nose: { edge: 0.78, face: 0.0, out: 0.05, bumper: 0.58, dam: 0.16, lean: 0.05, tuck: 0.10 },
  tail: { edge: 0.93, face: 0.01, out: 0.04, bumper: 0.52, dam: 0.28, lean: 0.06, tuck: 0.08 },
  arch: { gap: 0.03, lift: 0.015, lip: 0 },
  cham: { e: [0.03, 0.03], n: [0.05, 0.06] },
  cabin: { shoulder: 0.03, tuck: 0.16, roof: 0.045 },
  glass: { belt: 0.03, frame: 0.045, pillars: 'dark' },
  front: { lamps: 'slim', lampY: [0.655, 0.73], lampW: 0.42, grille: 'narrow', intake: [0.22, 0.44, 0.96] },
  rear: { lamps: 'quad', lampY: [0.66, 0.80], lampW: 0.0, wing: true, garnish: true },
  wheel: 'multi', bumpers: 'body',
};

/* The kei truck: makeKeiTruck's own sizes, which its colliders are. */
const KEITRUCK = {
  L: 3.32, W: 1.46, R: 0.29, axle: [0.94, -1.06],
  sill: 0.51, waist: 0.85, roof: 1.91,
  cab: [0.35, 1.61],
  tw: 0.18,
};

export const MODEL = Object.freeze(Object.fromEntries([
  ...Object.keys(SHAPE).map((k) => [k, Object.freeze({ kind: k, ...TOWN_SPEC[k], ...SHAPE[k] })]),
  ['r32', Object.freeze({ kind: 'r32', ...R32, ...R32_SHAPE })],
  ['keitruck', Object.freeze({ kind: 'keitruck', ...KEITRUCK, wheel: 'steel' })],
]));

/* The tyre's width: the vendored builder's two, and the kinds that carry
 * their own. */
function tyreWidth(s) {
  if (s.tw) {
    return s.tw;
  }
  if (s.kind === 'minibus') {
    return 0.215;
  }
  return s.R < 0.3 ? 0.165 : 0.195;
}

/* Where a wheel's middle stands across the car: its outer face 15 mm in
 * from the widest flank (the r32's flares), as the vendored track put it. */
function wheelZ(s) {
  return s.W / 2 - tyreWidth(s) / 2 - 0.015;
}

/* ------------------------------------------------------------------ *
 * THE LOWER BODY'S SIDE PROFILE, counter clockwise from the foot of the
 * rear bumper: along the underside and over both arches, up the nose, back
 * along the bonnet and the waist, down the tail. Each point carries its
 * chamfer (see prism) and the material of the edge that leaves it.
 * ------------------------------------------------------------------ */

/* The chamfer a point takes, by what it is. */
function chamferOf(s, tag) {
  if (tag === 'n') {
    return s.cham.n;
  }
  if (tag === 'e') {
    return s.cham.e;
  }
  if (tag === 'a') {
    return [0.022, 0.022];
  }
  return [0, 0];
}

/* The arch over one axle: from where it leaves the sill, over the top,
 * back down to the sill. Where the arch's centre stands above the sill (a
 * lowered car) it wraps past a half circle and hugs the tyre. */
function archPoints(s, ax, K) {
  const A = s.R + s.arch.gap;
  const yc = s.R + s.arch.lift;
  let sn = (s.sill - yc) / A;
  sn = sn < -0.5 ? -0.5 : (sn > 0.9 ? 0.9 : sn);
  const t0 = Math.asin(sn);
  const out = [];
  for (let k = 0; k <= K; k += 1) {
    const t = Math.PI - t0 + ((2 * t0 - Math.PI) * k) / K;
    out.push([ax + A * Math.cos(t), yc + A * Math.sin(t)]);
  }
  return out;
}

function lowerProfile(s) {
  const L2 = s.L / 2;
  const n = s.nose;
  const t = s.tail;
  const pts = [];
  const bumper = s.bumpers === 'body' ? 'body' : 'bumper';
  const P = (x, y, tag, edge) => {
    const [c, d] = chamferOf(s, tag);
    pts.push({ x, y, c, d, edge });
  };
  /* The rear bumper's foot, the underside to the rear arch, the arch. */
  P(-L2 - t.out + t.tuck, t.dam, 'n', 'under');
  for (const [x, y] of archPoints(s, s.axle[1], 7)) {
    P(x, y, 'a', 'well');
  }
  pts[pts.length - 1].edge = 'under';
  for (const [x, y] of archPoints(s, s.axle[0], 7)) {
    P(x, y, 'a', 'well');
  }
  pts[pts.length - 1].edge = 'under';
  /* The nose, from the foot of the bumper to the bonnet's leading edge. */
  const f0 = pts.length;
  P(L2 + n.out - n.tuck, n.dam, 'n', bumper);
  P(L2 + n.out, n.dam + Math.min(0.06, (n.bumper - n.dam) / 3), 'n', bumper);
  P(L2 + n.out, n.bumper, 'n', 'body');
  P(L2 + n.face, n.bumper + 0.015, 'n', 'body');
  const noseTop = L2 + n.face - n.lean;
  P(noseTop, n.edge, 'n', 'body');
  const front = pts.slice(f0).map((p) => [p.x, p.y]);
  /* The bonnet rolls over its leading edge, where there is a bonnet. */
  const cowl = s.cab[1] + 0.03;
  if (noseTop - 0.14 > cowl + 0.05) {
    P(noseTop - 0.12, n.edge + 0.022, 'e', 'body');
  }
  P(cowl, s.waist + 0.004, 'e', null);
  const back = s.cab[0] - 0.03;
  P(back, s.waist + 0.004, 'e', 'body');
  const tailTop = -L2 - t.face + t.lean;
  if (tailTop + 0.12 < back - 0.05) {
    P(tailTop + 0.10, t.edge + 0.014, 'e', 'body');
  }
  const r0 = pts.length;
  P(tailTop, t.edge, 'n', 'body');
  P(-L2 - t.face, t.bumper + 0.015, 'n', 'body');
  P(-L2 - t.out, t.bumper, 'n', bumper);
  P(-L2 - t.out, t.dam + Math.min(0.05, (t.bumper - t.dam) / 3), 'n', bumper);
  /* The tail's chain runs bottom up like the nose's, so it starts at the
   * bumper's foot, which is the profile's first point. */
  const rear = [[pts[0].x, pts[0].y], ...pts.slice(r0).reverse().map((p) => [p.x, p.y])];
  pts.front = front;
  pts.rear = rear;
  return pts;
}

/* x of a chain of profile points at height y, the chain rising. */
function chainX(chain, y) {
  if (y <= chain[0][1]) {
    return chain[0][0];
  }
  for (let i = 0; i + 1 < chain.length; i += 1) {
    const a = chain[i];
    const b = chain[i + 1];
    if (y <= b[1]) {
      const u = (y - a[1]) / (b[1] - a[1] || 1);
      return a[0] + (b[0] - a[0]) * u;
    }
  }
  return chain[chain.length - 1][0];
}

/* ------------------------------------------------------------------ *
 * Laying things on a face.
 * ------------------------------------------------------------------ */

/*
 * A face of the body as a frame to draw on: `o` a corner, `u` and `v` its
 * two edge directions (not normalised: u = 1 is the whole edge), `n` its
 * outward unit normal. at(uu, vv, lift) is the point that far across it,
 * `lift` metres off it.
 */
function frame(o, u, v, n) {
  return {
    at(uu, vv, lift = 0) {
      return [
        o[0] + u[0] * uu + v[0] * vv + n[0] * lift,
        o[1] + u[1] * uu + v[1] * vv + n[1] * lift,
        o[2] + u[2] * uu + v[2] * vv + n[2] * lift,
      ];
    },
    n,
  };
}

/* A plane polygon [uu, vv] of a frame, drawn `lift` off it. */
function onFrame(M, role, F, poly, lift) {
  if (poly.length < 3) {
    return;
  }
  const q = area2(poly) >= 0 ? poly : poly.slice().reverse();
  M.face(role, q.map((p) => F.at(p[0], p[1], lift)), { tris: q.length > 4 ? triangulate(q) : null, toward: F.n });
}

/* The front face of the lower body at height y, and the rear: where it is
 * in x, and its outward normal in the side view. */
function faceOf(chain, y, sign) {
  const x = chainX(chain, y);
  let i = 0;
  while (i + 2 < chain.length && y > chain[i + 1][1]) {
    i += 1;
  }
  const a = chain[i];
  const b = chain[i + 1] ?? chain[i];
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = Math.sqrt(dx * dx + dy * dy) || 1;
  let nx = dy / l;
  let ny = -dx / l;
  if (nx * sign < 0) {
    nx = -nx;
    ny = -ny;
  }
  return { x, nx, ny };
}

/*
 * A panel on the nose or the tail: y0 to y1 high, z0 to z1 across (z0 <
 * z1), following the face's rake, `lift` off it. sign +1 is the nose.
 * `raise` lifts the outer top corner, for a lamp that sweeps up round its
 * corner.
 */
function endQuad(chain, sign, y0, y1, z0, z1, lift, raise = 0) {
  const a = faceOf(chain, y0, sign);
  const b = faceOf(chain, y1, sign);
  const p0 = [a.x + a.nx * lift, y0 + a.ny * lift];
  const p1 = [b.x + b.nx * lift, y1 + b.ny * lift];
  const outerIs1 = (sign > 0) === (z1 > 0);
  return {
    pts: [
      [p0[0], p0[1], z0], [p0[0], p0[1], z1],
      [p1[0], p1[1] + (outerIs1 ? raise : 0), z1], [p1[0], p1[1] + (outerIs1 ? 0 : raise), z0],
    ],
    n: [sign * Math.abs(a.nx), a.ny, 0],
  };
}

function onEnd(M, role, chain, sign, y0, y1, z0, z1, lift, raise = 0) {
  /* Cut at every corner of the chain between y0 and y1, so a panel that
   * runs from a bumper up a raked face lies on both. */
  const cuts = [y0, ...chain.map((p) => p[1]).filter((y) => y > y0 + 1e-4 && y < y1 - 1e-4), y1];
  let q = null;
  for (let i = 0; i + 1 < cuts.length; i += 1) {
    const top = i + 2 === cuts.length;
    q = endQuad(chain, sign, cuts[i] + 1e-5, cuts[i + 1] - 1e-5, z0, z1, lift, top ? raise : 0);
    M.face(role, q.pts, { toward: q.n });
  }
  return q;
}

/* A block from a front quad and a back quad, corners in the same order:
 * the front and the four sides, each turned away from the block's middle.
 * A lamp's housing, so it has sides the ink can find. */
function hexa(M, role, f, k, back = false) {
  const c = [0, 0, 0];
  for (const p of [...f, ...k]) {
    c[0] += p[0] / 8;
    c[1] += p[1] / 8;
    c[2] += p[2] / 8;
  }
  const away = (pts) => {
    const m = [0, 0, 0];
    for (const p of pts) {
      m[0] += p[0] / pts.length;
      m[1] += p[1] / pts.length;
      m[2] += p[2] / pts.length;
    }
    return [m[0] - c[0], m[1] - c[1], m[2] - c[2]];
  };
  M.face(role, f, { toward: away(f) });
  if (back) {
    M.face(role, k, { toward: away(k) });
  }
  for (let i = 0; i < 4; i += 1) {
    const j = (i + 1) % 4;
    const side = [k[i], k[j], f[j], f[i]];
    M.face(role, side, { toward: away(side) });
  }
}

/* A housing standing `depth` proud of the nose or the tail. */
function blockOnEnd(M, role, chain, sign, y0, y1, z0, z1, depth, raise = 0) {
  const f = endQuad(chain, sign, y0, y1, z0, z1, depth, raise);
  const k = endQuad(chain, sign, y0, y1, z0, z1, -0.01, raise);
  hexa(M, role, f.pts, k.pts);
  return f;
}

/* ------------------------------------------------------------------ *
 * WHEELS, drawn round the z axis with the outer face toward +z.
 * ------------------------------------------------------------------ */

const TAU = Math.PI * 2;

/* A band of quads round the axle from radius ra at za to rb at zb, `N`
 * sides, lit smooth round the axle and flat across it: (nr, nz) is the
 * normal in the profile's own plane. */
function lathe(M, role, ra, za, rb, zb, N, nr, nz, a0 = 0) {
  for (let k = 0; k < N; k += 1) {
    const t0 = a0 + (k / N) * TAU;
    const t1 = a0 + ((k + 1) / N) * TAU;
    const c0 = Math.cos(t0);
    const s0 = Math.sin(t0);
    const c1 = Math.cos(t1);
    const s1 = Math.sin(t1);
    const pts = [[ra * c0, ra * s0, za], [ra * c1, ra * s1, za], [rb * c1, rb * s1, zb], [rb * c0, rb * s0, zb]];
    const normals = [[nr * c0, nr * s0, nz], [nr * c1, nr * s1, nz], [nr * c1, nr * s1, nz], [nr * c0, nr * s0, nz]];
    M.face(role, pts, { normals, toward: [nr * (c0 + c1), nr * (s0 + s1), nz * 2] });
  }
}

function disc(M, role, r, z, N, nz, a0 = 0) {
  const pts = [];
  for (let k = 0; k < N; k += 1) {
    const t = a0 + (k / N) * TAU;
    pts.push([r * Math.cos(t), r * Math.sin(t), z]);
  }
  M.face(role, pts, { toward: [0, 0, nz] });
}

/* The dark windows between the spokes: n of them, each spanning the face
 * from r0 to r1 less a spoke `spoke` metres wide at every radius. */
function spokeWindows(M, n, r0, r1, spoke, z, a0 = 0) {
  for (let k = 0; k < n; k += 1) {
    const mid = a0 + ((k + 0.5) / n) * TAU;
    const half = Math.PI / n;
    const pts = [];
    const lo0 = mid - half + spoke / (2 * r0);
    const hi0 = mid + half - spoke / (2 * r0);
    const lo1 = mid - half + spoke / (2 * r1);
    const hi1 = mid + half - spoke / (2 * r1);
    if (hi0 <= lo0) {
      pts.push([r0 * Math.cos(mid), r0 * Math.sin(mid), z]);
    } else {
      pts.push([r0 * Math.cos(lo0), r0 * Math.sin(lo0), z], [r0 * Math.cos(hi0), r0 * Math.sin(hi0), z]);
    }
    pts.push([r1 * Math.cos(hi1), r1 * Math.sin(hi1), z]);
    pts.push([r1 * Math.cos(mid), r1 * Math.sin(mid), z]);
    pts.push([r1 * Math.cos(lo1), r1 * Math.sin(lo1), z]);
    M.face('dark', pts, { toward: [0, 0, 1] });
  }
}

/* Small dark openings in a steel wheel's face. */
function holes(M, n, r, size, z, a0 = 0) {
  for (let k = 0; k < n; k += 1) {
    const t = a0 + (k / n) * TAU;
    const cx = r * Math.cos(t);
    const cy = r * Math.sin(t);
    const pts = [];
    for (let j = 0; j < 6; j += 1) {
      const u = (j / 6) * TAU;
      pts.push([cx + size * Math.cos(u), cy + size * 0.8 * Math.sin(u), z]);
    }
    M.face('dark', pts, { toward: [0, 0, 1] });
  }
}

/*
 * One wheel. 'parked' draws what can be seen of a wheel standing under its
 * arch, which is its outer half; 'full' draws both faces and the rim's
 * dish, for a wheel that steers and can be seen from any side.
 */
function wheel(M, s, detail, rimRole) {
  const full = detail === 'full';
  const N = full ? 16 : 12;
  const R = s.R;
  const h = tyreWidth(s) / 2;
  const sh = Math.min(0.04, R * 0.13);
  const style = s.wheel;
  const rimR = R * (style === 'multi' ? 0.68 : (style === 'truck' || style === 'bus' ? 0.6 : 0.63));
  const lip = style === 'multi' ? 0.022 : 0.013;
  /* The tyre: tread, shoulders, sidewalls. */
  lathe(M, 'dark', R, -(h - sh), R, h - sh, N, 1, 0);
  lathe(M, 'dark', R, h - sh, R - sh, h, N, 0.7071, 0.7071);
  lathe(M, 'dark', R - sh, h, rimR, h, N, 0, 1);
  if (full) {
    lathe(M, 'dark', R, -(h - sh), R - sh, -h, N, 0.7071, -0.7071);
    disc(M, 'dark', R - sh, -h, N, -1);
  }
  /* The rim: its lip standing proud of the sidewall, the dish behind it,
   * the face. */
  const lipRole = style === 'steel' ? 'briteDark' : rimRole;
  lathe(M, lipRole, rimR, h + 0.004, rimR - lip, h + 0.004, N, 0, 1);
  const faceZ = full ? h - 0.01 : h + 0.001;
  const fr = rimR - lip;
  if (full) {
    lathe(M, 'briteDark', fr, h + 0.004, fr, faceZ, N, -1, 0);
  }
  const faceRole = {
    cap: 'brite', steel: 'briteDark', alloy5: rimRole, alloy6: rimRole, multi: rimRole, truck: 'brite', bus: 'brite',
  }[style] ?? rimRole;
  disc(M, faceRole, fr, faceZ, N, 1);
  const z = faceZ + 0.003;
  const hub = R * 0.13;
  if (style === 'alloy5') {
    spokeWindows(M, 5, hub + 0.02, fr - 0.012, 0.055, z, 0.3);
  } else if (style === 'alloy6') {
    spokeWindows(M, 6, hub + 0.02, fr - 0.014, 0.045, z, 0.1);
  } else if (style === 'multi') {
    spokeWindows(M, 10, hub + 0.03, fr - 0.01, 0.024, z, 0.15);
  } else if (style === 'cap') {
    /* A plastic trim: short dark slots round its rim. */
    spokeWindows(M, 8, fr * 0.66, fr - 0.012, fr * 0.36, z, 0.2);
  } else if (style === 'steel') {
    holes(M, 5, fr * 0.66, fr * 0.13, z, 0.3);
  } else if (style === 'truck') {
    holes(M, 6, fr * 0.72, fr * 0.1, z, 0);
  } else if (style === 'bus') {
    holes(M, 8, fr * 0.74, fr * 0.08, z, 0);
  }
  /* The hub, or the cap over it. */
  const capR = style === 'steel' ? fr * 0.46 : (style === 'truck' || style === 'bus' ? fr * 0.38 : hub);
  disc(M, style === 'truck' || style === 'bus' ? 'dark' : 'brite', capR, z + 0.004, full ? 10 : 8, 1);
  if (style === 'truck' || style === 'bus') {
    disc(M, 'brite', capR * 0.5, z + 0.008, 8, 1);
  }
}

const _wm = new THREE.Matrix4();
const _wq = new THREE.Quaternion();
const _we = new THREE.Euler();
const _wp = new THREE.Vector3();
const _ws = new THREE.Vector3(1, 1, 1);

/* Every wheel of a car into its body, at its axle, turned out on its
 * side, and cambered if the car carries camber. */
function wheels(M, s, detail, rimRole) {
  const wz = wheelZ(s);
  const camber = s.camber ?? 0;
  for (const ax of s.axle) {
    for (const side of [1, -1]) {
      _we.set(side * -camber, side > 0 ? 0 : Math.PI, 0, 'XYZ');
      _wq.setFromEuler(_we);
      _wp.set(ax, s.R, side * wz);
      M.at(_wm.compose(_wp, _wq, _ws));
      wheel(M, s, detail, rimRole);
    }
    if (s.kind === 'boxtruck' && ax === s.axle[1]) {
      /* The lorry's rear axle is twinned: an inner wheel beside each. */
      for (const side of [1, -1]) {
        _we.set(0, side > 0 ? 0 : Math.PI, 0, 'XYZ');
        _wq.setFromEuler(_we);
        _wp.set(ax, s.R, side * (wz - tyreWidth(s) - 0.02));
        M.at(_wm.compose(_wp, _wq, _ws));
        lathe(M, 'dark', s.R, -tyreWidth(s) / 2, s.R, tyreWidth(s) / 2, 12, 1, 0);
      }
    }
  }
  M.at(null);
}

/* ------------------------------------------------------------------ *
 * GLASS.
 * ------------------------------------------------------------------ */

/*
 * Streaks of reflection across a pane, the way an animator paints glass:
 * a broad one and a thin one, slanting up to the right, clipped to the
 * pane. `poly` in some plane's [u, v] metres; drawn by `draw(poly)`.
 */
function glints(poly, slant, streaks, draw) {
  let u0 = Infinity;
  let u1 = -Infinity;
  for (const p of poly) {
    const u = p[0] - slant * p[1];
    u0 = Math.min(u0, u);
    u1 = Math.max(u1, u);
  }
  const span = u1 - u0;
  for (const [at, width] of streaks) {
    const a = u0 + span * at;
    const b = a + width;
    let q = clip(poly, 1, -slant, -a);
    q = clip(q, -1, slant, b);
    if (q.length >= 3 && Math.abs(area2(q)) > 1e-5) {
      draw(q);
    }
  }
}

/*
 * A screen on one of the glasshouse's raked faces, between two profile
 * points (a at the bottom, b at the top) whose half widths are za and zb.
 * A dark surround, the glass inside it, the streaks on the glass.
 */
function screen(M, a, b, za, zb, out, { frame: fr = 0.05, bottom = 0.05, streaks = [[0.2, 0.2], [0.52, 0.06]], chrome = false } = {}) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.sqrt(dx * dx + dy * dy);
  let nx = dy / len;
  let ny = -dx / len;
  if (nx * out[0] + ny * out[1] < 0) {
    nx = -nx;
    ny = -ny;
  }
  /* The face as a frame: u across the car in metres, v up the slope in
   * metres from a. */
  const P = (u, v, lift) => {
    const t = v / len;
    const x = a[0] + dx * t + nx * lift;
    const y = a[1] + dy * t + ny * lift;
    return [x, y, u];
  };
  const half = (v) => za + (zb - za) * (v / len);
  const pane = (inU, inBottom, inTop) => [
    [-(half(inBottom) - inU), inBottom], [half(inBottom) - inU, inBottom],
    [half(len - inTop) - inU, len - inTop], [-(half(len - inTop) - inU), len - inTop],
  ];
  const draw = (role, poly, lift) => {
    const q = area2(poly) >= 0 ? poly : poly.slice().reverse();
    M.face(role, q.map((p) => P(p[0], p[1], lift)), { toward: [nx, ny, 0] });
  };
  draw(chrome ? 'brite' : 'dark', pane(fr * 0.5, bottom * 0.5, fr * 0.5), 0.006);
  const glass = pane(fr, bottom, fr);
  draw('glass', glass, 0.011);
  glints(glass, -0.55, streaks, (q) => draw('glint', q, 0.014));
}

/*
 * The side glass on a glasshouse flank. `cap` is the flank's polygon (the
 * prism's inset outline), `hw(y)` its half width, `s` the kind. The glass
 * reaches from the belt to under the roof's chamfer and between the
 * screens' pillars; pillars stand at the kind's seams; `side` limits it
 * (a van is glazed over its cab only).
 */
function sideGlass(M, s, cap, hw, bodyRole) {
  const g = s.glass;
  let dlo = inset(cap, cap.map(() => g.frame));
  dlo = clip(dlo, 0, 1, -(s.waist + g.belt));
  if (s.side) {
    dlo = clip(dlo, 1, 0, -s.side[0]);
    dlo = clip(dlo, -1, 0, s.side[1]);
  }
  if (dlo.length < 3) {
    return;
  }
  let xmin = Infinity;
  let xmax = -Infinity;
  for (const p of dlo) {
    xmin = Math.min(xmin, p[0]);
    xmax = Math.max(xmax, p[0]);
  }
  const pw = g.pillars === 'dark' ? 0.035 : 0.075;
  const cuts = (s.seams ?? []).filter((x) => x > xmin + 0.15 && x < xmax - 0.15).sort((p, q) => p - q);
  const panes = [];
  let from = -Infinity;
  for (const c of [...cuts, Infinity]) {
    let q = dlo;
    if (from > -Infinity) {
      q = clip(q, 1, 0, -(from + pw / 2));
    }
    if (c < Infinity) {
      q = clip(q, -1, 0, c - pw / 2);
    }
    if (q.length >= 3) {
      panes.push(q);
    }
    from = c;
  }
  for (const side of [1, -1]) {
    const at = (p, lift) => [p[0], p[1], side * (hw(p[1]) + lift)];
    const lay = (role, poly, lift) => {
      if (poly.length < 3) {
        return;
      }
      const q = area2(poly) >= 0 ? poly : poly.slice().reverse();
      M.face(role, q.map((p) => at(p, lift)), { tris: q.length > 4 ? triangulate(q) : null, toward: [0, 0, side] });
    };
    if (g.pillars === 'dark') {
      lay('dark', inset(dlo, dlo.map(() => -0.012)), 0.006);
    }
    for (const q of panes) {
      if (g.pillars !== 'dark') {
        lay(g.pillars === 'chrome' ? 'brite' : 'dark', inset(q, q.map(() => -0.014)), 0.006);
      }
      const glass = inset(q, q.map(() => 0.012));
      lay('glass', glass, 0.01);
      glints(glass, 0.9, [[0.3, 0.12]], (gq) => lay('glint', gq, 0.013));
    }
  }
  void bodyRole;
}

/* ------------------------------------------------------------------ *
 * THE NOSE AND THE TAIL.
 * ------------------------------------------------------------------ */

function frontEnd(M, s, ch, zf, lamps) {
  const f = s.front;
  const n = s.nose;
  const [ly0, ly1] = f.lampY;
  const outer = zf - 0.02;
  const inner = Math.max(0.12, outer - f.lampW);
  for (const side of [1, -1]) {
    const z0 = side > 0 ? inner : -outer;
    const z1 = side > 0 ? outer : -inner;
    if (f.lamps === 'bumper') {
      /* The lorry's: square lamps set in the steel bumper's corners. */
      blockOnEnd(M, 'dark', ch.front, 1, ly0 - 0.015, ly1 + 0.015, z0 - 0.015, z1 + 0.015, 0.02);
      onEnd(M, 'lampF', ch.front, 1, ly0, ly1, side > 0 ? z0 + 0.08 : z0, side > 0 ? z1 : z1 - 0.08, 0.024);
      onEnd(M, 'amber', ch.front, 1, ly0, ly1, side > 0 ? z0 : z1 - 0.07, side > 0 ? z0 + 0.07 : z1, 0.024);
    } else {
      const raise = f.lamps === 'swept' ? 0.05 : 0;
      blockOnEnd(M, 'dark', ch.front, 1, ly0 - 0.012, ly1 + 0.012, z0 - 0.012, z1 + 0.012, 0.016, raise);
      /* The lens, and at its outer end the indicator, in amber. */
      const ind = f.lamps === 'slim' ? 0 : 0.07;
      const lz0 = side > 0 ? z0 : z0 + ind;
      const lz1 = side > 0 ? z1 - ind : z1;
      onEnd(M, 'lampF', ch.front, 1, ly0, ly1, lz0, lz1, 0.02, raise * ((lz1 - lz0) / (z1 - z0)));
      if (ind) {
        onEnd(M, 'amber', ch.front, 1, ly0, ly1, side > 0 ? z1 - ind + 0.008 : z0, side > 0 ? z1 : z0 + ind - 0.008, 0.02, raise);
      }
      if (f.lamps === 'rect') {
        /* The inner reflector: a darker division across the lens. */
        const dz = side > 0 ? z0 + (z1 - z0) * 0.45 : z1 - (z1 - z0) * 0.45;
        onEnd(M, 'dark', ch.front, 1, ly0, ly1, dz - 0.006, dz + 0.006, 0.023);
      }
    }
    lamps.front.push([chainX(ch.front, (ly0 + ly1) / 2) + 0.03, (ly0 + ly1) / 2, side * (inner + outer) / 2]);
  }
  /* The grille, between the lamps. */
  const gz = inner - 0.03;
  if (f.grille === 'slim' || f.grille === 'narrow') {
    const gy0 = f.grille === 'narrow' ? ly0 + 0.005 : ly0 + 0.02;
    const gy1 = f.grille === 'narrow' ? ly1 - 0.012 : ly1 - 0.02;
    blockOnEnd(M, 'dark', ch.front, 1, gy0, gy1, -gz, gz, 0.012);
    if (f.grille === 'narrow') {
      onEnd(M, 'brite', ch.front, 1, gy1 - 0.008, gy1, -gz, gz, 0.014);
      for (let k = 1; k < 3; k += 1) {
        const y = gy0 + ((gy1 - gy0) * k) / 3;
        onEnd(M, 'briteDark', ch.front, 1, y - 0.004, y + 0.004, -gz + 0.02, gz - 0.02, 0.014);
      }
    }
  } else if (f.grille === 'slats' || f.grille === 'chrome' || f.grille === 'panel') {
    const gy0 = f.grille === 'panel' ? n.bumper + 0.06 : ly0 - 0.01;
    const gy1 = f.grille === 'panel' ? n.edge - 0.08 : ly1;
    blockOnEnd(M, f.grille === 'chrome' ? 'brite' : 'dark', ch.front, 1, gy0, gy1, -gz, gz, 0.012);
    const role = f.grille === 'chrome' ? 'dark' : (f.grille === 'panel' ? 'briteDark' : 'deep');
    const k = f.grille === 'panel' ? 5 : 3;
    for (let i = 0; i < k; i += 1) {
      const y = gy0 + ((gy1 - gy0) * (i + 0.5)) / k;
      onEnd(M, role, ch.front, 1, y - 0.012, y + 0.012, -gz + 0.02, gz - 0.02, 0.015);
    }
  }
  /* The bumper's lower intake, and the plate on it. */
  if (f.intake) {
    const [iy0, iy1, iw] = f.intake;
    blockOnEnd(M, 'dark', ch.front, 1, iy0, iy1, -iw / 2, iw / 2, 0.006);
  }
  const py = f.intake ? (f.intake[0] + f.intake[1]) / 2 : (n.dam + n.bumper) / 2;
  plate(M, ch.front, 1, py);
  if (s.bumpers === 'dark' || s.bumpers === 'steel') {
    const role = s.bumpers === 'steel' ? 'brite' : 'dark';
    blockOnEnd(M, role, ch.front, 1, n.dam + 0.02, n.bumper - 0.005, -(zf + 0.005), zf + 0.005, 0.004);
  }
  /* Fog lamps and the corner indicators, low on the bumper. */
  if (s.kind === 'r32') {
    for (const side of [1, -1]) {
      const z = side * (zf - 0.1);
      blockOnEnd(M, 'dark', ch.front, 1, 0.5, 0.555, z - 0.085, z + 0.085, 0.008);
      onEnd(M, 'amber', ch.front, 1, 0.508, 0.547, side > 0 ? z + 0.005 : z - 0.075, side > 0 ? z + 0.075 : z - 0.005, 0.012);
      onEnd(M, 'lampF', ch.front, 1, 0.508, 0.547, side > 0 ? z - 0.075 : z + 0.005, side > 0 ? z - 0.005 : z + 0.075, 0.012);
    }
    /* The lip under the bumper: a dark blade standing out past its foot. */
    const lx = s.L / 2 + n.out - n.tuck;
    M.box('dark', lx - 0.2, n.dam - 0.018, -(zf + 0.02), lx + 0.035, n.dam + 0.006, zf + 0.02);
  }
}

function plate(M, chain, sign, y) {
  const a = faceOf(chain, y - 0.0825, sign);
  const b = faceOf(chain, y + 0.0825, sign);
  const lift = 0.02;
  /* u runs left to right as the plate is read: seen from ahead the
   * reader's right is -z, from behind it is +z. */
  const pz = sign > 0 ? [0.165, -0.165] : [-0.165, 0.165];
  const pts = [
    [a.x + a.nx * lift, y - 0.0825 + a.ny * lift, pz[0]],
    [a.x + a.nx * lift, y - 0.0825 + a.ny * lift, pz[1]],
    [b.x + b.nx * lift, y + 0.0825 + b.ny * lift, pz[1]],
    [b.x + b.nx * lift, y + 0.0825 + b.ny * lift, pz[0]],
  ];
  M.face('plate', pts, { uvs: [[0, 0], [1, 0], [1, 1], [0, 1]], toward: [sign * Math.abs(a.nx), a.ny, 0] });
}

function rearEnd(M, s, ch, zr, lamps) {
  const r = s.rear;
  const t = s.tail;
  if (r.lamps === 'bar') {
    return;
  }
  const [ly0, ly1] = r.lampY;
  const outer = zr - 0.015;
  if (r.lamps === 'quad') {
    /* The four round lamps, in a dark panel the width of the tail. */
    blockOnEnd(M, 'dark', ch.rear, -1, ly0 - 0.035, ly1 + 0.035, -outer, outer, 0.012);
    const ry = (ly0 + ly1) / 2;
    const rr = (ly1 - ly0) / 2 + 0.012;
    for (const side of [1, -1]) {
      for (const k of [0, 1]) {
        const z = side * (outer - 0.1 - k * 0.22);
        const f = faceOf(ch.rear, ry, -1);
        const x = f.x - 0.022;
        const ring = [];
        const lens = [];
        const core = [];
        for (let j = 0; j < 12; j += 1) {
          const u = (j / 12) * TAU;
          ring.push([x, ry + (rr + 0.012) * Math.sin(u), z + (rr + 0.012) * Math.cos(u)]);
          lens.push([x - 0.006, ry + rr * Math.sin(u), z + rr * Math.cos(u)]);
          core.push([x - 0.009, ry + rr * 0.42 * Math.sin(u), z + rr * 0.42 * Math.cos(u)]);
        }
        M.face('deep', ring, { toward: [-1, 0, 0] });
        M.face('lampR', lens, { toward: [-1, 0, 0] });
        if (k === 1) {
          /* The inner pair carry the reversing lamps at their middles. */
          M.face('clear', core, { toward: [-1, 0, 0] });
        }
        lamps.rear.push([x - 0.02, ry, z]);
      }
    }
    return;
  }
  for (const side of [1, -1]) {
    let z0;
    let z1;
    if (r.lamps === 'wide') {
      z0 = side > 0 ? outer - r.lampW : -outer;
      z1 = side > 0 ? outer : -(outer - r.lampW);
    } else {
      z0 = side > 0 ? outer - r.lampW : -outer;
      z1 = side > 0 ? outer : -(outer - r.lampW);
    }
    blockOnEnd(M, 'dark', ch.rear, -1, ly0 - 0.012, ly1 + 0.012, z0 - 0.012, z1 + 0.012, 0.016);
    /* The lamp: tail and brake above, a clear reversing lamp below, an
     * amber indicator between, as a Japanese cluster is stacked. */
    const h = ly1 - ly0;
    const cut = r.lamps === 'wide' ? ly0 + h * 0.34 : ly0 + h * 0.3;
    onEnd(M, 'lampR', ch.rear, -1, cut, ly1, z0, z1, 0.02);
    if (r.lamps === 'wide') {
      const inner = side > 0 ? z0 : z1;
      const w = (z1 - z0) * 0.35;
      onEnd(M, 'amber', ch.rear, -1, ly0, cut - 0.008, side > 0 ? inner + w : inner - w * 2 + 0.0, side > 0 ? z1 : inner - w, 0.02);
      onEnd(M, 'clear', ch.rear, -1, ly0, cut - 0.008, side > 0 ? z0 : z1 - w, side > 0 ? z0 + w : z1, 0.02);
    } else {
      const mid = ly0 + (cut - ly0) * 0.5;
      onEnd(M, 'amber', ch.rear, -1, mid + 0.004, cut - 0.008, z0, z1, 0.02);
      onEnd(M, 'clear', ch.rear, -1, ly0, mid - 0.004, z0, z1, 0.02);
    }
    lamps.rear.push([chainX(ch.rear, (cut + ly1) / 2) - 0.03, (cut + ly1) / 2, side * (Math.abs(z0) + Math.abs(z1)) / 2]);
  }
  if (r.garnish && r.lamps === 'wide') {
    /* A dark panel between the lamps, and a bright strip across it. */
    const g = outer - r.lampW - 0.01;
    blockOnEnd(M, 'dark', ch.rear, -1, ly0 + 0.02, ly1 - 0.01, -g, g, 0.014);
    onEnd(M, 'brite', ch.rear, -1, ly1 - 0.03, ly1 - 0.012, -g + 0.02, g - 0.02, 0.017);
  }
  void t;
}

/* ------------------------------------------------------------------ *
 * THE FLANKS: arch lips, sills, shut lines, handles, mirrors.
 * ------------------------------------------------------------------ */

/* A flat strip on a flank, x0 to x1 and y0 to y1, `lift` off it. */
function onFlank(M, role, hw, x0, y0, x1, y1, lift) {
  for (const side of [1, -1]) {
    const z = side * (hw + lift);
    M.face(role, [[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]], { toward: [0, 0, side] });
  }
}

/* A plane polygon of the side profile laid on both flanks. */
function polyOnFlank(M, role, hw, poly, lift) {
  if (poly.length < 3) {
    return;
  }
  const q = area2(poly) >= 0 ? poly : poly.slice().reverse();
  const T = q.length > 4 ? triangulate(q) : null;
  for (const side of [1, -1]) {
    M.face(role, q.map((p) => [p[0], p[1], side * (hw + lift)]), { tris: T, toward: [0, 0, side] });
  }
}

/* The arch's lip: a ring round the arch on the flank, darker than the
 * paint, which is what makes a wheel read as sitting in its arch from
 * twenty metres. */
function archLip(M, s, hw, ax) {
  const A = s.R + s.arch.gap;
  const yc = s.R + s.arch.lift;
  const inner = archPoints(s, ax, 7);
  const w = s.arch.lip;
  for (const side of [1, -1]) {
    const z = side * (hw + 0.004);
    for (let k = 0; k + 1 < inner.length; k += 1) {
      const a = inner[k];
      const b = inner[k + 1];
      const oa = [ax + (a[0] - ax) * (A + w) / A, yc + (a[1] - yc) * (A + w) / A];
      const ob = [ax + (b[0] - ax) * (A + w) / A, yc + (b[1] - yc) * (A + w) / A];
      M.face('deep', [[a[0], a[1], z], [b[0], b[1], z], [ob[0], ob[1], z], [oa[0], oa[1], z]], { toward: [0, 0, side] });
    }
  }
}

/* The r32's flare over one axle: a blister standing out from the door
 * line to the car's full width round the arch, its top squared off, as the
 * coupe's arches are. */
function flare(M, s, hwDoor, ax) {
  const A = s.R + s.arch.gap;
  const yc = s.R + s.arch.lift;
  const inner = archPoints(s, ax, 7);
  const w = 0.07;
  const cap = yc + A + 0.045;
  const outer = inner.map(([x, y]) => {
    const k = (A + w) / A;
    return [ax + (x - ax) * k, Math.min(cap, yc + (y - yc) * k)];
  });
  outer[0] = [outer[0][0] - 0.03, s.sill + 0.004];
  outer[outer.length - 1] = [outer[outer.length - 1][0] + 0.03, s.sill + 0.004];
  const poly = [...outer, ...inner.slice().reverse()];
  const n = outer.length;
  const pts = poly.map(([x, y], i) => ({ x, y, c: i < n ? 0.02 : 0.008, d: i < n ? 0.016 : 0.006 }));
  const hwF = (s.W / 2 - hwDoor + 0.01) / 2;
  const t = new THREE.Matrix4();
  for (const side of [1, -1]) {
    M.at(t.makeTranslation(0, 0, side * (hwDoor - 0.01 + hwF)));
    prism(M, 'body', pts, () => hwF, { sides: [side], edgeRole: (i, ch) => (!ch && i >= n && i < poly.length - 1 ? 'dark' : 'body') });
  }
  M.at(null);
}

/* The door mirrors: a short arm off the door's top front corner and a
 * housing rounded at its front, the glass on its back. */
function mirrors(M, s, hw, role) {
  const mx = s.cab[1] - 0.1;
  const y0 = s.waist + 0.02;
  const y1 = s.waist + 0.125;
  const housing = [[mx - 0.035, y0], [mx + 0.03, y0], [mx + 0.06, y0 + 0.035], [mx + 0.06, y1 - 0.03], [mx + 0.03, y1], [mx - 0.035, y1]];
  for (const side of [1, -1]) {
    const z0 = side > 0 ? hw - 0.02 : -(hw + 0.06);
    const z1 = side > 0 ? hw + 0.06 : -(hw - 0.02);
    M.box(role, mx - 0.02, y0 + 0.02, z0, mx + 0.04, y0 + 0.05, z1);
    const h0 = side > 0 ? hw + 0.04 : -(hw + 0.19);
    const h1 = side > 0 ? hw + 0.19 : -(hw + 0.04);
    slab(M, role, housing, h0, h1);
    M.face('glass', [[mx - 0.038, y0 + 0.012, h1 - 0.012], [mx - 0.038, y0 + 0.012, h0 + 0.012], [mx - 0.038, y1 - 0.012, h0 + 0.012], [mx - 0.038, y1 - 0.012, h1 - 0.012]], { toward: [-1, 0, 0] });
  }
}

/* ------------------------------------------------------------------ *
 * THE CAR.
 * ------------------------------------------------------------------ */

/*
 * THE R32'S LIVERIES, by the vehicle's variant: solid colours from the
 * town's car palette and a few two tones, none with a word on it. `lower`
 * paints the body under `split`, `stripe` is a pinstripe along the join,
 * `rim` the wheels' colour.
 */
export const R32_LIVERIES = [
  { name: 'gun grey', body: 0x8d8f98, rim: 0x8d8f98 },
  { name: 'white', body: 0xf2eee6, rim: 0x9aa0aa },
  { name: 'midnight', body: 0x5a7093, rim: 0xb8bcc6 },
  { name: 'red over charcoal', body: 0xb94a48, lower: 0x55535e, split: 0.46, stripe: 0xf0e7d2, rim: 0xc9a45c },
  { name: 'white, blue stripe', body: 0xf2eee6, stripe: 0x4d6fa8, stripeY: [0.5, 0.58], rim: 0x63626e },
  { name: 'silver over gun grey', body: 0xc9c8cc, lower: 0x7a7c86, split: 0.48, rim: 0xb8bcc6 },
  { name: 'mustard', body: 0xd9b45f, rim: 0x55535e },
];

export function r32Livery(variant) {
  const v = Math.max(1, Math.round(Number(variant) || 1));
  return R32_LIVERIES[(v - 1) % R32_LIVERIES.length];
}

function bodyOf(M, s, detail, rimRole) {
  const L2 = s.L / 2;
  const hw = (s.door ?? s.W) / 2;
  const lamps = { front: [], rear: [] };
  const box = s.kind === 'boxtruck';

  /* ---- the lower body ---- */
  const prof = box ? truckCabProfile(s) : lowerProfile(s);
  const bumperRole = s.bumpers === 'dark' ? 'dark' : (s.bumpers === 'steel' ? 'brite' : 'body');
  const cap = prism(M, 'body', prof, () => hw, {
    edgeRole: (i, ch) => {
      const e = prof[i].edge;
      if (e === null) {
        return ch ? 'body' : null;
      }
      if (e === 'well') {
        return ch ? 'body' : 'dark';
      }
      if (e === 'under') {
        return ch ? 'body' : 'dark';
      }
      if (e === 'bumper') {
        return bumperRole;
      }
      return 'body';
    },
  });
  /* The underside between the wheels, so a car seen low is not hollow. */
  const ux0 = s.axle[1] + s.R * 0.6;
  const ux1 = s.axle[0] - s.R * 0.6;
  M.box('dark', ux0, 0.13, -(hw - 0.08), ux1, s.sill + 0.01, hw - 0.08, '+y');

  /* ---- the glasshouse ---- */
  const cabBase = s.waist - 0.03;
  const rf = s.cab[1] - s.rakeF;
  const rr = s.cab[0] + s.rakeR;
  const run = s.roof - s.waist;
  const xFront = s.cab[1] + (0.03 * s.rakeF) / run;
  const xBack = s.cab[0] - (0.03 * s.rakeR) / run;
  const hwB = hw - s.cabin.shoulder;
  const hwC = (y) => hwB - s.cabin.tuck * Math.max(0, (y - s.waist) / run);
  const rc = s.cabin.roof;
  const cabPts = [
    { x: xBack, y: cabBase, c: 0.015, d: 0.015, edge: null },
    { x: xFront, y: cabBase, c: 0.015, d: 0.015, edge: 'body' },
    { x: rf, y: s.roof, c: rc, d: rc, edge: 'body' },
    { x: rr, y: s.roof, c: rc, d: rc, edge: 'body' },
  ];
  const ccap = prism(M, 'body', cabPts, (x, y) => hwC(y), { edgeRole: (i, ch) => (ch ? 'body' : cabPts[i].edge) });

  /* ---- glass ---- */
  const chrome = s.glass.pillars === 'chrome';
  screen(M, [s.cab[1], s.waist], [rf, s.roof], hwC(s.waist) - 0.015, hwC(s.roof) - rc, [1, 1], {
    frame: s.glass.frame, bottom: 0.06, chrome,
  });
  screen(M, [s.cab[0], s.waist], [rr, s.roof], hwC(s.waist) - 0.015, hwC(s.roof) - rc, [-1, 1], {
    frame: s.glass.frame, bottom: s.kind === 'r32' || s.kind === 'sedan' ? 0.05 : 0.08, streaks: [[0.3, 0.14]], chrome,
  });
  sideGlass(M, s, ccap, hwC, 'body');
  /* Wipers at the screen's foot. */
  for (const z of [0.3, -0.12]) {
    M.bar('dark', s.cab[1] - 0.02, s.waist + 0.035, s.cab[1] - 0.14, s.waist + 0.1, 0.018, z - 0.25, z + 0.2);
  }

  /* ---- the nose and the tail ---- */
  const zf = hw - s.cham.n[1] - 0.005;
  const ch = { front: prof.front, rear: prof.rear };
  frontEnd(M, s, ch, zf, lamps);
  if (s.tail) {
    rearEnd(M, s, ch, zf, lamps);
    /* The rear plate, on the tailgate or the boot lid's panel. */
    const py = s.rear.lamps === 'quad' ? s.tail.bumper + 0.13 : (s.tail.bumper + s.rear.lampY[0]) / 2 + 0.04;
    plate(M, ch.rear, -1, py);
    if (s.bumpers === 'dark') {
      blockOnEnd(M, 'dark', ch.rear, -1, s.tail.dam + 0.02, s.tail.bumper - 0.005, -(zf + 0.005), zf + 0.005, 0.004);
    }
    /* A tailgate's shut line across the back, or a boot lid's. */
    const gy = s.tail.bumper + 0.03;
    onEnd(M, 'dark', ch.rear, -1, gy, gy + 0.014, -(zf - 0.2), zf - 0.2, 0.012);
    /* The exhaust, low under the bumper. */
    const ez = -(hw - 0.35);
    const ex = -L2 - s.tail.out + 0.06;
    _wp.set(ex, s.tail.dam + 0.02, ez);
    _wq.setFromEuler(_we.set(0, -Math.PI / 2, 0));
    M.at(_wm.compose(_wp, _wq, _ws));
    const er = s.kind === 'r32' ? 0.05 : 0.03;
    lathe(M, 'briteDark', er, -0.12, er, 0.02, 8, 1, 0);
    disc(M, 'dark', er * 0.8, 0.021, 8, 1);
    M.at(null);
  }

  /* ---- the flanks ---- */
  const A = s.R + s.arch.gap;
  if (s.kind === 'r32') {
    flare(M, s, hw, s.axle[0]);
    flare(M, s, hw, s.axle[1]);
  } else if (s.arch.lip) {
    for (const ax of s.axle) {
      archLip(M, s, hw, ax);
    }
  }
  /* The sill: a darker strip from arch to arch. */
  const sillX0 = s.axle[1] + A + 0.02;
  const sillX1 = s.axle[0] - A - 0.02;
  onFlank(M, s.kind === 'r32' ? 'dark' : 'deep', hw, sillX0, s.sill + 0.004, sillX1, s.sill + (s.kind === 'r32' ? 0.08 : 0.06), 0.004);
  /* Shut lines: the front door's leading edge, then the kind's seams. */
  const top = s.waist - 0.015;
  const doorFront = Math.min(s.cab[1] - 0.03, s.axle[0] - A - 0.05);
  const lines = [doorFront, ...(s.seams ?? [])].filter((x) => x < s.axle[0] - A - 0.02 && x > s.axle[1] + A + 0.02 || x === doorFront);
  for (const x of lines) {
    onFlank(M, 'dark', hw, x - 0.009, s.sill + 0.07, x + 0.009, top, 0.005);
  }
  for (const x of s.handles ?? []) {
    onFlank(M, 'dark', hw, x - 0.08, s.waist - 0.15, x + 0.08, s.waist - 0.095, 0.005);
    onFlank(M, chrome ? 'brite' : 'body', hw, x - 0.07, s.waist - 0.135, x + 0.07, s.waist - 0.11, 0.009);
  }
  if (s.slider !== undefined) {
    onFlank(M, 'dark', hw, s.slider - 0.55, s.waist - 0.05, s.slider + 0.55, s.waist - 0.03, 0.006);
  }
  /* The side repeater behind the front arch. */
  onFlank(M, 'amber', hw, s.axle[0] - A - 0.13, s.waist - 0.2, s.axle[0] - A - 0.07, s.waist - 0.175, 0.006);
  if (s.chromeStrip) {
    onFlank(M, 'brite', hw, sillX0 + 0.05, s.waist - 0.3, sillX1 - 0.05, s.waist - 0.28, 0.007);
  }
  mirrors(M, s, hw, s.bumpers === 'dark' || s.bumpers === 'steel' ? 'dark' : 'body');

  /* ---- the bonnet's shut lines, where there is a bonnet ---- */
  const noseTop = L2 + s.nose.face - s.nose.lean;
  if (noseTop - s.cab[1] > 0.4) {
    for (const side of [1, -1]) {
      const z = side * (hw - 0.14);
      const y0 = s.nose.edge + 0.027;
      const y1 = s.waist + 0.009;
      M.face('dark', [[noseTop - 0.13, y0, z - 0.009], [noseTop - 0.13, y0, z + 0.009], [s.cab[1] + 0.04, y1, z + 0.009], [s.cab[1] + 0.04, y1, z - 0.009]], { toward: [0, 1, 0] });
    }
  }
  return { lamps, prof, cap, hwC, rf, rr };
}

/* The box lorry's cab: the lower body from the box's front to the nose. */
function truckCabProfile(s) {
  const x0 = s.box.x1 + 0.02;
  const pts = [];
  const P = (x, y, tag, edge) => {
    const [c, d] = chamferOf(s, tag);
    pts.push({ x, y, c, d, edge });
  };
  P(x0, s.sill, 's', 'under');
  for (const [x, y] of archPoints(s, s.axle[0], 7)) {
    P(x, y, 'a', 'well');
  }
  pts[pts.length - 1].edge = 'under';
  const L2 = s.L / 2;
  const n = s.nose;
  const f0 = pts.length;
  P(L2 + n.out - n.tuck, n.dam, 'n', 'bumper');
  P(L2 + n.out, n.dam + 0.05, 'n', 'bumper');
  P(L2 + n.out, n.bumper, 'n', 'body');
  P(L2 + n.face, n.bumper + 0.015, 'n', 'body');
  P(L2 + n.face - n.lean, n.edge, 'n', 'body');
  const front = pts.slice(f0).map((p) => [p.x, p.y]);
  P(s.cab[1] + 0.03, s.waist + 0.004, 'e', null);
  P(x0, s.waist + 0.004, 'e', 'body');
  pts.front = front;
  pts.rear = [[x0, s.sill], [x0, s.waist]];
  return pts;
}

/* The box lorry's chassis under its box, the box, its shutter and rails. */
function lorry(M, s, lamps) {
  const b = s.box;
  const hw = s.W / 2;
  const chassis = [{ x: b.x0 + 0.04, y: s.sill, c: 0, d: 0, edge: 'dark' }];
  for (const [x, y] of archPoints(s, s.axle[1], 7)) {
    chassis.push({ x, y, c: 0, d: 0, edge: 'dark' });
  }
  chassis.push({ x: b.x1 + 0.02, y: s.sill, c: 0, d: 0, edge: 'dark' });
  chassis.push({ x: b.x1 + 0.02, y: b.y0 + 0.01, c: 0, d: 0, edge: 'dark' });
  chassis.push({ x: b.x0 + 0.04, y: b.y0 + 0.01, c: 0, d: 0, edge: 'dark' });
  prism(M, 'dark', chassis, () => hw - 0.02);
  /* The side guard, a rail along the flank between the axles. */
  onFlank(M, 'brite', hw - 0.02, s.axle[1] + 0.5, 0.56, b.x1 - 0.05, 0.63, 0.012);
  /* Mudguards over the rear wheels. */
  const A = s.R + s.arch.gap;
  for (const side of [1, -1]) {
    M.box('dark', s.axle[1] - A, b.y0 - 0.04, side > 0 ? hw - 0.3 : -hw + 0.02, s.axle[1] + A, b.y0, side > 0 ? hw - 0.02 : -hw + 0.3);
  }
  /* The box, square with a small chamfer round both flanks. */
  const bw = (s.W + 0.06) / 2;
  const boxPts = [
    { x: b.x0, y: b.y0, c: 0.02, d: 0.02, edge: 'dark' },
    { x: b.x1, y: b.y0, c: 0.02, d: 0.02, edge: 'body' },
    { x: b.x1, y: b.y1, c: 0.03, d: 0.03, edge: 'body' },
    { x: b.x0, y: b.y1, c: 0.03, d: 0.03, edge: 'deep' },
  ];
  prism(M, 'body', boxPts, () => bw, { edgeRole: (i, ch) => (ch ? 'body' : boxPts[i].edge) });
  /* The ribs down each flank, the cant rail round the top, the floor rail. */
  for (let i = 0; i < 7; i += 1) {
    const x = b.x0 + 0.2 + i * ((b.x1 - b.x0 - 0.4) / 6);
    onFlank(M, 'deep', bw, x - 0.025, b.y0 + 0.08, x + 0.025, b.y1 - 0.08, 0.006);
  }
  onFlank(M, 'deep', bw, b.x0 + 0.03, b.y1 - 0.08, b.x1 - 0.03, b.y1 - 0.035, 0.006);
  onFlank(M, 'dark', bw, b.x0 + 0.03, b.y0 + 0.02, b.x1 - 0.03, b.y0 + 0.07, 0.006);
  /* The roller shutter at the back, its slats and its pull. */
  const sx = b.x0 - 0.012;
  M.face('deep', [[sx, b.y0 + 0.06, bw - 0.06], [sx, b.y0 + 0.06, -(bw - 0.06)], [sx, b.y1 - 0.06, -(bw - 0.06)], [sx, b.y1 - 0.06, bw - 0.06]], { toward: [-1, 0, 0] });
  for (let i = 1; i < 9; i += 1) {
    const y = b.y0 + 0.06 + ((b.y1 - b.y0 - 0.12) * i) / 9;
    M.face('dark', [[sx - 0.003, y - 0.006, bw - 0.08], [sx - 0.003, y - 0.006, -(bw - 0.08)], [sx - 0.003, y + 0.006, -(bw - 0.08)], [sx - 0.003, y + 0.006, bw - 0.08]], { toward: [-1, 0, 0] });
  }
  M.box('brite', sx - 0.04, b.y0 + 0.12, -0.3, sx, b.y0 + 0.17, 0.3);
  /* Marker lamps at the box's top corners. */
  for (const side of [1, -1]) {
    M.box('amber', b.x1 - 0.12, b.y1 - 0.06, side > 0 ? bw : -bw - 0.02, b.x1 - 0.04, b.y1 - 0.02, side > 0 ? bw + 0.02 : -bw);
  }
  /* The rear under run bar, and the lamps and plate on it. */
  const rx = b.x0 - 0.02;
  M.box('dark', rx - 0.08, 0.5, -(hw - 0.05), rx, 0.62, hw - 0.05);
  for (const side of [1, -1]) {
    const z = side * (hw - 0.2);
    M.face('lampR', [[rx - 0.082, 0.52, z + 0.12], [rx - 0.082, 0.52, z - 0.12], [rx - 0.082, 0.6, z - 0.12], [rx - 0.082, 0.6, z + 0.12]], { toward: [-1, 0, 0] });
    lamps.rear.push([rx - 0.1, 0.56, z]);
  }
  M.face('plate', [[rx - 0.083, 0.64, -0.165], [rx - 0.083, 0.64, 0.165], [rx - 0.083, 0.805, 0.165], [rx - 0.083, 0.805, -0.165]], { uvs: [[0, 0], [1, 0], [1, 1], [0, 1]], toward: [-1, 0, 0] });
}

/* Roof rails on their feet. */
function rails(M, s, rf, rr, hwC) {
  const z = hwC(s.roof) - 0.12;
  for (const side of [1, -1]) {
    M.bar(s.bumpers === 'body' ? 'deep' : 'dark', rr + 0.12, s.roof + 0.055, rf - 0.12, s.roof + 0.055, 0.03, side * z - 0.02, side * z + 0.02);
    for (const x of [rr + 0.16, rf - 0.16]) {
      M.box('dark', x - 0.04, s.roof - 0.01, side * z - 0.025, x + 0.04, s.roof + 0.05, side * z + 0.025);
    }
  }
}

/* A small spoiler over the tailgate glass, at the roof's rear edge. */
function roofSpoiler(M, s, rr, hwC) {
  const z = hwC(s.roof) - 0.03;
  const poly = [[rr - 0.1, s.roof - 0.055], [rr + 0.14, s.roof - 0.01], [rr + 0.14, s.roof + 0.012], [rr - 0.06, s.roof - 0.015]];
  slab(M, 'body', poly, -z, z);
}

/* The r32's wing on its boot lid: a blade on two stays. */
function wing(M, s) {
  const L2 = s.L / 2;
  const deckX = -L2 + 0.16;
  const deckY = s.tail.edge + 0.012;
  for (const side of [1, -1]) {
    const z = side * 0.55;
    M.bar('body', deckX + 0.06, deckY - 0.01, deckX + 0.02, deckY + 0.1, 0.035, z - 0.012, z + 0.012);
  }
  const blade = [[deckX - 0.1, deckY + 0.095], [deckX + 0.13, deckY + 0.105], [deckX + 0.14, deckY + 0.125], [deckX - 0.11, deckY + 0.13]];
  slab(M, 'body', blade, -0.8, 0.8);
  /* Its trailing edge, a dark gurney strip the ink can find. */
  M.box('dark', deckX - 0.115, deckY + 0.128, -0.8, deckX - 0.095, deckY + 0.145, 0.8);
}

/* The minibus's furniture: its doors, the destination box, the roof unit. */
function bus(M, s, hw) {
  for (const dx of s.doors ?? []) {
    const z = hw + 0.006;
    M.face('dark', [[dx - 0.45, s.sill + 0.04, z], [dx + 0.45, s.sill + 0.04, z], [dx + 0.45, s.waist + 0.62, z], [dx - 0.45, s.waist + 0.62, z]], { toward: [0, 0, 1] });
    for (const side of [-1, 1]) {
      const x0 = dx + (side < 0 ? -0.42 : 0.015);
      const x1 = dx + (side < 0 ? -0.015 : 0.42);
      M.face('glass', [[x0, s.sill + 0.3, z + 0.004], [x1, s.sill + 0.3, z + 0.004], [x1, s.waist + 0.58, z + 0.004], [x0, s.waist + 0.58, z + 0.004]], { toward: [0, 0, 1] });
    }
  }
  const rf = s.cab[1] - s.rakeF;
  M.box('dark', rf - 0.1, s.roof - 0.3, -0.62, rf + 0.08, s.roof - 0.1, 0.62);
  M.face('lampF', [[rf + 0.082, s.roof - 0.28, 0.58], [rf + 0.082, s.roof - 0.28, -0.58], [rf + 0.082, s.roof - 0.12, -0.58], [rf + 0.082, s.roof - 0.12, 0.58]], { toward: [1, 0, 0] });
  M.box('brite', -1.4, s.roof - 0.02, -0.55, -0.2, s.roof + 0.09, 0.55, '-y');
  /* The band along the flanks under the windows. */
  onFlank(M, 'accent', hw, -s.L / 2 + 0.12, s.waist - 0.26, s.L / 2 - 0.2, s.waist - 0.12, 0.004);
}

/* A two tone and its pinstripe, laid over the lower body. */
function liveryOn(M, s, info, lv) {
  const hw = (s.door ?? s.W) / 2;
  const ch = { front: info.prof.front, rear: info.prof.rear };
  const zf = hw - s.cham.n[1] - 0.005;
  if (lv.lower) {
    const poly = clip(info.cap, 0, -1, lv.split);
    polyOnFlank(M, 'body2', hw, poly, 0.003);
    onEnd(M, 'body2', ch.front, 1, s.nose.dam + 0.02, Math.min(lv.split, s.nose.bumper - 0.01), -zf, zf, 0.004);
    onEnd(M, 'body2', ch.rear, -1, s.tail.dam + 0.02, Math.min(lv.split, s.tail.bumper - 0.01), -zf, zf, 0.004);
  }
  if (lv.stripe) {
    const [y0, y1] = lv.stripeY ?? [lv.split - 0.012, lv.split + 0.012];
    const poly = clip(clip(info.cap, 0, -1, y1), 0, 1, -y0);
    polyOnFlank(M, 'stripe', hw, poly, 0.005);
  }
}

/* ------------------------------------------------------------------ *
 * THE KEI TRUCK. makeKeiTruck's own sizes (3.32 by 1.46, the cab over
 * the front wheels to 1.91, the bed floor at 0.85 to 0.91 with its drop
 * sides to 1.27), drawn the same way as the cars.
 * ------------------------------------------------------------------ */

function keiTruckBody(M, s, o, lamps) {
  const L2 = s.L / 2;
  const hw = s.W / 2;
  const xb = s.cab[0];
  /* The cab: one profile from its back, over the front arch, up the flat
   * front and the screen, along the roof. */
  const prof = [];
  const P = (x, y, c, d, edge) => prof.push({ x, y, c, d, edge });
  P(xb, 0.44, 0, 0, 'under');
  const arch = { ...s, R: s.R, sill: 0.44, arch: { gap: 0.04, lift: 0.02 } };
  for (const [x, y] of archPoints(arch, s.axle[0], 7)) {
    P(x, y, 0.02, 0.02, 'well');
  }
  prof[prof.length - 1].edge = 'under';
  const f0 = prof.length;
  P(L2 + 0.03 - 0.05, 0.38, 0.05, 0.06, 'bumper');
  P(L2 + 0.03, 0.42, 0.05, 0.06, 'bumper');
  P(L2 + 0.03, 0.56, 0.05, 0.06, 'body');
  P(L2 - 0.005, 0.575, 0.05, 0.06, 'body');
  P(L2 - 0.02, 1.0, 0.05, 0.06, 'body');
  const front = prof.slice(f0).map((p) => [p.x, p.y]);
  P(L2 - 0.045, 1.05, 0.04, 0.04, 'body');
  P(L2 - 0.2, s.roof + 0.02, 0.06, 0.06, 'body');
  P(xb + 0.04, s.roof + 0.02, 0.06, 0.06, 'body');
  P(xb, s.roof - 0.06, 0.03, 0.03, 'body');
  const cap = prism(M, 'body', prof, () => hw, { edgeRole: (i, ch) => (ch ? 'body' : ({ well: 'dark', under: 'dark', bumper: 'brite' }[prof[i].edge] ?? 'body')) });
  /* The roof's lip, a thin cap a touch wider than the cab, where the
   * vendored truck had its own: the one crisp line over the cab. */
  M.box('deep', xb + 0.02, s.roof + 0.005, -(hw + 0.015), L2 - 0.17, s.roof + 0.04, hw + 0.015, '-y');
  /* Glass: the screen on the raked face, the door windows on the flanks. */
  screen(M, [L2 - 0.045, 1.05], [L2 - 0.2, s.roof + 0.02], hw - 0.04, hw - 0.06, [1, 1], { frame: 0.06, bottom: 0.05 });
  const dlo = clip(clip(clip(inset(cap, cap.map(() => 0.07)), 0, 1, -1.18), 1, 0, -(xb + 0.12)), -1, 0, L2 - 0.1);
  for (const side of [1, -1]) {
    const lay = (role, poly, lift) => {
      const q = area2(poly) >= 0 ? poly : poly.slice().reverse();
      M.face(role, q.map((p) => [p[0], p[1], side * (hw + lift)]), { toward: [0, 0, side] });
    };
    lay('dark', inset(dlo, dlo.map(() => -0.012)), 0.005);
    const glass = inset(dlo, dlo.map(() => 0.012));
    lay('glass', glass, 0.009);
    glints(glass, 0.9, [[0.35, 0.12]], (q) => lay('glint', q, 0.012));
  }
  /* The door's shut lines and handle, the step under it. */
  const doorX0 = xb + 0.08;
  const doorX1 = s.axle[0] + 0.34;
  for (const x of [doorX0, doorX1]) {
    onFlank(M, 'dark', hw, x - 0.009, 0.62, x + 0.009, 1.16, 0.005);
  }
  onFlank(M, 'dark', hw, doorX0 + 0.08, 1.03, doorX0 + 0.22, 1.07, 0.005);
  onFlank(M, 'brite', hw, doorX0 + 0.09, 1.04, doorX0 + 0.21, 1.06, 0.008);
  /* The front: lamps at the corners, the grille slot, the plate. */
  const ch = { front };
  for (const side of [1, -1]) {
    const z0 = side > 0 ? hw - 0.36 : -(hw - 0.08);
    const z1 = side > 0 ? hw - 0.08 : -(hw - 0.36);
    blockOnEnd(M, 'dark', ch.front, 1, 0.7, 0.86, z0 - 0.012, z1 + 0.012, 0.016);
    const lz0 = side > 0 ? z0 : z0 + 0.07;
    const lz1 = side > 0 ? z1 - 0.07 : z1;
    onEnd(M, 'lampF', ch.front, 1, 0.712, 0.848, lz0, lz1, 0.02);
    onEnd(M, 'amber', ch.front, 1, 0.712, 0.848, side > 0 ? z1 - 0.062 : z0, side > 0 ? z1 : z0 + 0.062, 0.02);
    lamps.front.push([L2 + 0.03, 0.78, side * (hw - 0.22)]);
  }
  blockOnEnd(M, 'dark', ch.front, 1, 0.74, 0.82, -(hw - 0.42), hw - 0.42, 0.01);
  plate(M, ch.front, 1, 0.47);
  mirrors(M, { ...s, cab: [xb, L2 - 0.1], waist: 1.08 }, hw, 'dark');
  /* The chassis under the bed, with the rear arch cut in it. */
  const cz = hw - 0.04;
  const chassis = [{ x: -L2 + 0.08, y: 0.5, c: 0, d: 0, edge: 'dark' }];
  const rearArch = { ...s, sill: 0.5, arch: { gap: 0.04, lift: 0.02 } };
  for (const [x, y] of archPoints(rearArch, s.axle[1], 7)) {
    chassis.push({ x, y, c: 0, d: 0, edge: 'dark' });
  }
  chassis.push({ x: xb + 0.02, y: 0.5, c: 0, d: 0, edge: 'dark' });
  chassis.push({ x: xb + 0.02, y: 0.85, c: 0, d: 0, edge: 'dark' });
  chassis.push({ x: -L2 + 0.08, y: 0.85, c: 0, d: 0, edge: 'dark' });
  prism(M, 'dark', chassis, () => cz);
  /* The bed: floor, headboard, drop sides and the tailgate, each a panel
   * with a pressed rib along it, and the guard frame over the cab's back. */
  const bx0 = -L2;
  const bx1 = xb - 0.02;
  M.box('bed', bx0, 0.85, -hw + 0.06, bx1, 0.91, hw - 0.06, '-y');
  const top = 1.27;
  for (const side of [1, -1]) {
    const z0 = side > 0 ? hw - 0.06 : -hw;
    const z1 = side > 0 ? hw : -hw + 0.06;
    M.box('body', bx0 + 0.06, 0.85, z0, bx1, top, z1);
    onFlank(M, 'deep', hw, bx0 + 0.1, 1.05, bx1 - 0.04, 1.08, 0.004);
    onFlank(M, 'dark', hw, bx0 + 0.1, 0.87, bx1 - 0.04, 0.885, 0.004);
    for (const x of [bx0 + 0.55, bx1 - 0.55]) {
      onFlank(M, 'dark', hw, x - 0.02, 0.9, x + 0.02, 0.97, 0.007);
    }
  }
  M.box('body', bx0, 0.85, -hw, bx0 + 0.06, top, hw);
  M.face('deep', [[bx0 - 0.004, 1.05, hw - 0.06], [bx0 - 0.004, 1.05, -hw + 0.06], [bx0 - 0.004, 1.08, -hw + 0.06], [bx0 - 0.004, 1.08, hw - 0.06]], { toward: [-1, 0, 0] });
  M.box('body', bx1 - 0.05, 0.91, -hw + 0.06, bx1, top + 0.08, hw - 0.06);
  /* The guard frame: two posts and three rails up to the roof. */
  for (const z of [hw - 0.08, -(hw - 0.08)]) {
    M.box('dark', bx1 - 0.04, top, z - 0.025, bx1 + 0.01, s.roof - 0.12, z + 0.025);
  }
  for (const y of [top + 0.18, top + 0.36, s.roof - 0.14]) {
    M.box('dark', bx1 - 0.04, y - 0.02, -(hw - 0.08), bx1 + 0.01, y + 0.02, hw - 0.08);
  }
  /* The rear: lamps and plate under the tailgate. */
  for (const side of [1, -1]) {
    const z = side * (hw - 0.2);
    M.box('dark', -L2 - 0.02, 0.62, z - 0.13, -L2 + 0.02, 0.76, z + 0.13);
    M.face('lampR', [[-L2 - 0.022, 0.66, z + 0.11], [-L2 - 0.022, 0.66, z - 0.11], [-L2 - 0.022, 0.74, z - 0.11], [-L2 - 0.022, 0.74, z + 0.11]], { toward: [-1, 0, 0] });
    M.face('amber', [[-L2 - 0.022, 0.635, z + 0.11], [-L2 - 0.022, 0.635, z - 0.11], [-L2 - 0.022, 0.655, z - 0.11], [-L2 - 0.022, 0.655, z + 0.11]], { toward: [-1, 0, 0] });
    lamps.rear.push([-L2 - 0.05, 0.7, z]);
  }
  M.face('plate', [[-L2 - 0.01, 0.95, -0.2], [-L2 - 0.01, 0.95, 0.2], [-L2 - 0.01, 1.15, 0.2], [-L2 - 0.01, 1.15, -0.2]], { uvs: [[0, 0], [1, 0], [1, 1], [0, 1]], toward: [-1, 0, 0] });
  M.box('brite', -L2 + 0.04, 0.44, -(hw - 0.06), -L2 + 0.1, 0.52, hw - 0.06);
  /* What is on the bed. */
  const load = o.load ?? 'crates';
  if (load === 'crates') {
    for (let i = 0; i < 3; i += 1) {
      const x = -0.35 - i * 0.15 - 0.3;
      const y = 0.91 + i * 0.26;
      const z = i % 2 ? 0.08 : -0.08;
      M.box(i === 1 ? 'crate' : 'crate2', x - 0.21, y, z - 0.17, x + 0.21, y + 0.25, z + 0.17);
      M.box('dark', x - 0.212, y + 0.2, z - 0.172, x + 0.212, y + 0.215, z + 0.172, '-y');
    }
  } else if (load === 'sheet') {
    const cx = (bx0 + bx1) / 2;
    M.box('sheet', cx - 0.75, 0.91, -hw + 0.1, cx + 0.75, 1.32, hw - 0.1, '-y');
    for (const dx of [-0.5, 0, 0.5]) {
      M.box('rope', cx + dx - 0.025, 0.91, -hw + 0.08, cx + dx + 0.025, 1.335, hw - 0.08, '-y');
    }
  }
}

/* ------------------------------------------------------------------ *
 * BUILDING ONE.
 * ------------------------------------------------------------------ */

const NO_CAST = new Set(['glass', 'glint', 'lampF', 'lampR', 'amber', 'clear', 'plate']);
const ORDER = ['body', 'body2', 'stripe', 'accent', 'deep', 'dark', 'brite', 'briteDark', 'rim', 'bed', 'crate', 'crate2', 'sheet', 'rope', 'glass', 'glint', 'lampF', 'lampR', 'amber', 'clear', 'plate'];

/*
 * One car at the origin, nose along +x, as a Group of one mesh a material.
 *
 *   o.kind     a MODEL key; anything else is a kei
 *   o.color    the body colour (a CAR value); the r32 takes its livery
 *   o.variant  the r32's livery, by number (r32Livery), unless o.livery
 *   o.wheels   false leaves the wheels out, for a caller that draws its
 *              own that turn (src/maps/built/cars.js)
 *   o.detail   'parked' (the default) or 'full'
 *   o.hero     an inverted hull ink shell on the body as well
 *   o.load     the kei truck's: 'crates', 'sheet' or 'empty'
 *
 * g.userData.lamps holds where the lamps are, { front, rear }, each a
 * list of [x, y, z] in the car's frame, for whatever draws their light.
 */
export function buildCar(o = {}) {
  const kind = MODEL[o.kind] ? o.kind : 'kei';
  const s = MODEL[kind];
  const m = mats();
  const detail = o.detail === 'full' ? 'full' : 'parked';
  const livery = kind === 'r32' ? (o.livery ?? r32Livery(o.variant)) : null;
  const truck = kind === 'keitruck';
  const col = livery ? livery.body : (o.color ?? (truck ? PAL.taxiYellow : CAR.white));
  const rimRole = livery && livery.rim ? 'rim' : 'brite';
  const M = new Mesher();
  let lamps = { front: [], rear: [] };
  if (truck) {
    keiTruckBody(M, s, o, lamps);
  } else {
    const info = bodyOf(M, s, detail, rimRole);
    lamps = info.lamps;
    const hw = (s.door ?? s.W) / 2;
    if (s.rails) {
      rails(M, s, info.rf, info.rr, info.hwC);
    }
    if (s.rear && s.rear.spoiler) {
      roofSpoiler(M, s, info.rr, info.hwC);
    }
    if (s.rear && s.rear.wing) {
      wing(M, s);
    }
    if (s.box) {
      lorry(M, s, lamps);
    }
    if (s.bus) {
      bus(M, s, hw);
    }
    if (livery) {
      liveryOn(M, s, info, livery);
    }
  }
  if (o.wheels !== false) {
    wheels(M, s, detail, rimRole);
  }
  const bodyMat = truck
    ? cel({ color: col, bands: 3, tint: 0x8f7050 })
    : paint(col);
  const matFor = {
    body: bodyMat,
    deep: truck ? cel({ color: deepOf(col), bands: 3, tint: 0x8f7050 }) : deepPaint(col),
    dark: m.dark,
    brite: m.brite,
    briteDark: m.briteDark,
    glass: m.glass,
    glint: m.glint,
    lampF: m.lampF,
    lampR: m.lampR,
    amber: m.amber,
    clear: m.clear,
    plate: m.plate,
  };
  if (livery) {
    if (livery.lower) {
      matFor.body2 = paint(livery.lower);
    }
    if (livery.stripe) {
      matFor.stripe = paint(livery.stripe);
    }
    if (livery.rim) {
      matFor.rim = cel({ color: livery.rim, bands: 3, tint: 0x666090 });
    }
  }
  if (s.band) {
    matFor.accent = paint(s.band);
  }
  if (truck) {
    matFor.bed = cel({ color: 0xbba98c, bands: 3, tint: 0x6f6790 });
    matFor.crate = cel({ color: PAL.crate, bands: 3, tint: 0x4a4a92 });
    matFor.crate2 = cel({ color: PAL.crateAlt, bands: 3, tint: 0x4a4a92 });
    matFor.sheet = cel({ color: 0x8fa2b4, bands: 3, tint: 0x5c5680 });
    matFor.rope = cel({ color: PAL.rope, bands: 3, tint: 0x6f6790 });
  }
  const g = new THREE.Group();
  let bodyMesh = null;
  for (const role of ORDER) {
    const geo = M.geometry(role);
    if (!geo) {
      continue;
    }
    const mesh = new THREE.Mesh(geo, matFor[role] ?? m.dark);
    mesh.castShadow = !NO_CAST.has(role);
    mesh.receiveShadow = true;
    g.add(mesh);
    if (role === 'body') {
      bodyMesh = mesh;
    }
  }
  if (o.hero && bodyMesh) {
    hullOutline(bodyMesh, { thickness: 0.0034 });
  }
  g.userData.lamps = lamps;
  g.userData.kind = kind;
  g.userData.triangles = M.triangles;
  return g;
}

/* ------------------------------------------------------------------ *
 * THE TOWN'S HOOKS. The vendored makeVehicle and makeKeiTruck hand their
 * drawing here (setVehicleModel, setKeiTruckModel, registered by
 * src/maps/city/index.js before the town is built), and these place and
 * name the car exactly as the vendored builders did, so nothing that reads
 * a town car by its group changes.
 * ------------------------------------------------------------------ */

export function townVehicle(o) {
  if (o.kind === 'keitruck') {
    return townKeiTruck({ x: o.x, y: o.y, z: o.z, ry: o.ry, color: o.color, load: o.load, hero: o.hero });
  }
  const g = buildCar({ kind: o.kind, color: o.color, hero: o.hero === true });
  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = (o.ry ?? 0) + (o.skew ?? 0);
  g.name = 'vehicle_' + (o.kind ?? 'kei');
  g.userData.vehicle = { kind: o.kind, ...vehicleSize(o.kind) };
  return g;
}

/* The kei truck. The one at the crossing is makeKeiTruck's default: the
 * taxi yellow hero with its ink shell. A parked one names its colour and
 * says hero: false, or leaves hero unset, which the vendored builder took
 * as a shell too; here only the crossing's truck, the one the town's
 * opening frame is built round, keeps one. */
export function townKeiTruck(o) {
  const hero = o.hero === true || (o.hero === undefined && o.color === undefined);
  const g = buildCar({ kind: 'keitruck', color: o.color, load: o.load, hero });
  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  return g;
}

/* ------------------------------------------------------------------ *
 * A MOVING CAR'S WHEEL, for src/maps/built/cars.js: one wheel of a kind at
 * 'full' detail, centred on its axle, the axle along z and its outer face
 * toward +z, every material painted into a vertex colour so a whole set of
 * wheels is one batch (cel, white, vertexColors). `rim` is the r32
 * livery's wheel colour, or nothing for the kind's own.
 * ------------------------------------------------------------------ */

const WHEEL_PAINT = { dark: 0x36333e, brite: PAL.metal, briteDark: PAL.metalDark };

export function carWheelGeometry(kind, { rim = null } = {}) {
  const s = MODEL[MODEL[kind] ? kind : 'kei'];
  const M = new Mesher();
  wheel(M, s, 'full', rim ? 'rim' : 'brite');
  const pos = [];
  const nor = [];
  const uv = [];
  const col = [];
  const idx = [];
  const c = new THREE.Color();
  for (const [role, b] of M.roles) {
    c.setHex(role === 'rim' ? rim : (WHEEL_PAINT[role] ?? WHEEL_PAINT.dark));
    const base = pos.length / 3;
    for (let i = 0; i < b.p.length; i += 3) {
      col.push(c.r, c.g, c.b);
    }
    pos.push(...b.p);
    nor.push(...b.n);
    uv.push(...b.uv);
    for (const k of b.idx) {
      idx.push(base + k);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/* Where a kind's wheels are, for a caller drawing them: the axles, the
 * wheel's radius, its middle across the car and its camber (rad, the top
 * in). */
export function carWheelBase(kind) {
  const s = MODEL[MODEL[kind] ? kind : 'kei'];
  const z = wheelZ(s);
  /* The box lorry's rear axle carries a twin inside each wheel. */
  const twins = s.kind === 'boxtruck'
    ? [1, -1].map((side) => ({ x: s.axle[1], z: side * (z - tyreWidth(s) - 0.02) }))
    : [];
  return { axle: s.axle.slice(), R: s.R, z, camber: s.camber ?? 0, width: tyreWidth(s), twins };
}
