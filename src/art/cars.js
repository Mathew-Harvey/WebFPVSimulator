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
 * chamfer rounds an edge the solid's corner is at most about 3 cm outside
 * the paint (the shoulder, the roof edge; 5 cm at the top of the steepest
 * noses). The kei truck keeps makeKeiTruck's own sizes, which is what its
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
 * THE SECOND PASS (every kind but the r32 and the e82, whose rows say
 * p2): each kind its own face (FACES), lamps, grilles and intakes set in
 * rims so they read as recessed (pod), bumpers that are pieces of their own
 * wrapping the corners and standing proud (bumperLoft), lips on the arches
 * (archLipP2), shoulders and roof edges lit as rounds (prism's smooth), a
 * reflection band across the glass, wipers lying on it, better mirrors, and
 * a tyre's inner face so a far wheel is a tyre. The flank stands in by the
 * lip's stand so what is proud of it stays within the car's width.
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
function prism(M, role, pts, hw, { edgeRole = null, sides = [1, -1], round = false, smooth = false, segs = 2 } = {}) {
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
  /* The rings the chamfer runs through, from the band to the flank: one
   * flat bevel, or with `round` a quarter round in two facets, which the
   * cel ramp turns into two steps of light along a shoulder instead of
   * one. A ring is [its outline, how much of the depth is left at it]. */
  let K = round ? [[0, 1], [1 - Math.SQRT1_2, 1 - Math.SQRT1_2], [1, 0]] : [[0, 1], [1, 0]];
  if (round && segs !== 2) {
    /* A quarter round in `segs` facets: ring k at angle k / segs of the
     * quarter, as far in and as shallow as a circle through it. */
    K = [];
    for (let k = 0; k <= segs; k += 1) {
      const t = (k / segs) * (Math.PI / 2);
      K.push(k === 0 ? [0, 1] : (k === segs ? [1, 0] : [1 - Math.cos(t), 1 - Math.sin(t)]));
    }
  }
  /* With `smooth` each ring carries the normal of a round through it,
   * turning from the band's to the flank's, so the cel ramp's bands run
   * along a shoulder as smooth lines instead of breaking at each facet. */
  const angle = K.map((_, k) => (k / (K.length - 1)) * (Math.PI / 2));
  const rings = K.map(([ci, di]) => [
    ci === 0 ? P : (ci === 1 ? Q : inset(P, pts.map((p) => (p.c ?? 0) * ci))),
    di,
  ]);
  for (const s of sides) {
    for (let i = 0; i < n; i += 1) {
      const j = (i + 1) % n;
      const pi = pts[i];
      const pj = pts[j];
      if (!(pi.c || pi.d || pj.c || pj.d)) {
        continue;
      }
      const r = edgeRole ? edgeRole(i, true) ?? role : role;
      let ex = 0;
      let ey = 0;
      if (smooth) {
        /* The band's outward normal: the right hand normal of an edge of a
         * counter clockwise outline. */
        const dx = pj.x - pi.x;
        const dy = pj.y - pi.y;
        const l = Math.sqrt(dx * dx + dy * dy) || 1;
        ex = dy / l;
        ey = -dx / l;
      }
      for (let k = 0; k + 1 < rings.length; k += 1) {
        const [A, da] = rings[k];
        const [B, db] = rings[k + 1];
        const at = (R, idx, dk, p) => [R[idx][0], R[idx][1], s * (hw(R[idx][0], R[idx][1]) - (p.d ?? 0) * dk)];
        const a = at(A, i, da, pi);
        const b = at(A, j, da, pj);
        const c = at(B, j, db, pj);
        const d = at(B, i, db, pi);
        if (smooth) {
          const na = [Math.cos(angle[k]) * ex, Math.cos(angle[k]) * ey, Math.sin(angle[k]) * s];
          const nb = [Math.cos(angle[k + 1]) * ex, Math.cos(angle[k + 1]) * ey, Math.sin(angle[k + 1]) * s];
          if (s > 0) {
            M.face(r, [a, b, c, d], { normals: [na, na, nb, nb] });
          } else {
            M.face(r, [d, c, b, a], { normals: [nb, nb, na, na] });
          }
        } else if (s > 0) {
          M.face(r, [a, b, c, d]);
        } else {
          M.face(r, [d, c, b, a]);
        }
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
/* The second pass's reflection band on the glass, between the glass and
 * the glint. */
const GLASS_BAND = 0x6f82a0;
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
  MAT.band = flat({ color: GLASS_BAND });
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
    p2: true, rearWiper: true,
    nose: { edge: 0.95, face: 0.0, out: 0.05, bumper: 0.64, dam: 0.30, lean: 0.07, tuck: 0.06, wrap: { rp: [0.16, 0.18], front: 0.055, side: 0.02 } },
    tail: { edge: 0.99, face: 0.0, out: 0.035, bumper: 0.56, dam: 0.36, lean: 0.03, tuck: 0.05, wrap: { rp: [0.12, 0.16], front: 0.045, side: 0.02 } },
    arch: { gap: 0.05, lift: 0.03, lip: 0.035 },
    lip: { w: 0.04, proud: 0.014 },
    cham: { e: [0.045, 0.045], n: [0.09, 0.12] },
    cabin: { shoulder: 0.03, tuck: 0.05, roof: 0.09 },
    glass: { belt: 0.04, frame: 0.055, pillars: 'dark', band: [0.55, 0.78] },
    front: { lamps: 'swept', lampY: [0.80, 0.93], lampW: 0.36, grille: 'slim', intake: [0.36, 0.50, 0.70] },
    rear: { lamps: 'pillar', lampY: [0.64, 1.02], lampW: 0.13, spoiler: true, garnish: false },
    wheel: 'cap', bumpers: 'body',
  },
  keivan: {
    p2: true, rearWiper: true,
    nose: { edge: 1.00, face: 0.0, out: 0.045, bumper: 0.60, dam: 0.32, lean: 0.05, tuck: 0.05, wrap: { rp: [0.09, 0.10], front: 0.06, side: 0.022 } },
    tail: { edge: 1.01, face: 0.0, out: 0.045, bumper: 0.52, dam: 0.36, lean: 0.01, tuck: 0.04, wrap: { rp: [0.08, 0.09], front: 0.05, side: 0.02 } },
    arch: { gap: 0.05, lift: 0.03, lip: 0.03 },
    lip: { w: 0.035, proud: 0.012 },
    cham: { e: [0.035, 0.035], n: [0.07, 0.09] },
    cabin: { shoulder: 0.025, tuck: 0.035, roof: 0.06 },
    glass: { belt: 0.04, frame: 0.06, pillars: 'body', band: [0.55, 0.78] },
    front: { lamps: 'rect', lampY: [0.78, 0.92], lampW: 0.30, grille: 'slats', intake: null },
    rear: { lamps: 'low', lampY: [0.56, 0.88], lampW: 0.12, spoiler: false },
    wheel: 'steel', bumpers: 'dark',
  },
  hatch: {
    p2: true, rearWiper: true,
    nose: { edge: 0.92, face: 0.0, out: 0.05, bumper: 0.62, dam: 0.27, lean: 0.10, tuck: 0.08, wrap: { rp: [0.22, 0.22], front: 0.05, side: 0.02 } },
    tail: { edge: 0.97, face: 0.0, out: 0.035, bumper: 0.60, dam: 0.32, lean: 0.05, tuck: 0.06, wrap: { rp: [0.16, 0.20], front: 0.045, side: 0.02 } },
    arch: { gap: 0.05, lift: 0.03, lip: 0.035 },
    lip: { w: 0.04, proud: 0.014 },
    cham: { e: [0.05, 0.05], n: [0.12, 0.15] },
    cabin: { shoulder: 0.035, tuck: 0.055, roof: 0.10 },
    glass: { belt: 0.035, frame: 0.05, pillars: 'dark', band: [0.55, 0.78] },
    front: { lamps: 'swept', lampY: [0.76, 0.90], lampW: 0.40, grille: 'slim', intake: [0.34, 0.50, 0.86] },
    rear: { lamps: 'corner', lampY: [0.74, 0.96], lampW: 0.26, spoiler: true },
    wheel: 'alloy5', bumpers: 'body',
  },
  sedan: {
    p2: true,
    nose: { edge: 0.93, face: 0.0, out: 0.05, bumper: 0.60, dam: 0.28, lean: 0.05, tuck: 0.07, wrap: { rp: [0.12, 0.14], front: 0.055, side: 0.022 } },
    tail: { edge: 0.95, face: 0.0, out: 0.05, bumper: 0.58, dam: 0.32, lean: 0.05, tuck: 0.06, wrap: { rp: [0.12, 0.14], front: 0.05, side: 0.022 } },
    arch: { gap: 0.05, lift: 0.03, lip: 0.03 },
    lip: { w: 0.035, proud: 0.014 },
    cham: { e: [0.03, 0.035], n: [0.07, 0.09] },
    cabin: { shoulder: 0.04, tuck: 0.06, roof: 0.05 },
    glass: { belt: 0.03, frame: 0.05, pillars: 'chrome', band: [0.55, 0.78] },
    front: { lamps: 'rect', lampY: [0.72, 0.86], lampW: 0.40, grille: 'chrome', intake: [0.34, 0.44, 0.90] },
    rear: { lamps: 'wide', lampY: [0.70, 0.86], lampW: 0.46, spoiler: false, garnish: true },
    wheel: 'alloy6', bumpers: 'body', chromeStrip: true,
  },
  wagon: {
    p2: true, rearWiper: true,
    nose: { edge: 0.93, face: 0.0, out: 0.05, bumper: 0.60, dam: 0.28, lean: 0.07, tuck: 0.06, wrap: { rp: [0.10, 0.12], front: 0.06, side: 0.022 } },
    tail: { edge: 0.97, face: 0.0, out: 0.045, bumper: 0.56, dam: 0.34, lean: 0.02, tuck: 0.05, wrap: { rp: [0.09, 0.11], front: 0.05, side: 0.02 } },
    arch: { gap: 0.05, lift: 0.03, lip: 0.03 },
    lip: { w: 0.035, proud: 0.012 },
    cham: { e: [0.035, 0.04], n: [0.09, 0.12] },
    cabin: { shoulder: 0.035, tuck: 0.045, roof: 0.06 },
    glass: { belt: 0.035, frame: 0.05, pillars: 'dark', band: [0.55, 0.78] },
    front: { lamps: 'rect', lampY: [0.74, 0.88], lampW: 0.36, grille: 'slats', intake: [0.34, 0.46, 0.80] },
    rear: { lamps: 'pillar', lampY: [0.62, 0.96], lampW: 0.12, spoiler: false },
    wheel: 'steel', bumpers: 'dark',
  },
  minivan: {
    p2: true, rearWiper: true,
    nose: { edge: 1.01, face: 0.0, out: 0.05, bumper: 0.70, dam: 0.28, lean: 0.08, tuck: 0.07, wrap: { rp: [0.20, 0.22], front: 0.06, side: 0.022 } },
    tail: { edge: 1.05, face: 0.0, out: 0.035, bumper: 0.60, dam: 0.36, lean: 0.03, tuck: 0.05, wrap: { rp: [0.14, 0.18], front: 0.045, side: 0.02 } },
    arch: { gap: 0.05, lift: 0.03, lip: 0.035 },
    lip: { w: 0.04, proud: 0.014 },
    cham: { e: [0.05, 0.05], n: [0.12, 0.15] },
    cabin: { shoulder: 0.03, tuck: 0.05, roof: 0.10 },
    glass: { belt: 0.04, frame: 0.055, pillars: 'dark', band: [0.55, 0.78] },
    front: { lamps: 'swept', lampY: [0.82, 0.97], lampW: 0.40, grille: 'slats', intake: [0.36, 0.52, 0.84] },
    rear: { lamps: 'pillar', lampY: [0.70, 1.12], lampW: 0.14, spoiler: true },
    wheel: 'alloy5', bumpers: 'body',
  },
  van: {
    p2: true,
    nose: { edge: 1.10, face: 0.0, out: 0.045, bumper: 0.66, dam: 0.34, lean: 0.03, tuck: 0.05, wrap: { rp: [0.10, 0.12], front: 0.06, side: 0.022 } },
    tail: { edge: 1.11, face: 0.0, out: 0.05, bumper: 0.58, dam: 0.38, lean: 0.01, tuck: 0.04, wrap: { rp: [0.08, 0.10], front: 0.05, side: 0.02 } },
    arch: { gap: 0.05, lift: 0.03, lip: 0.03 },
    lip: { w: 0.035, proud: 0.012 },
    cham: { e: [0.035, 0.035], n: [0.08, 0.10] },
    cabin: { shoulder: 0.025, tuck: 0.03, roof: 0.08 },
    glass: { belt: 0.05, frame: 0.06, pillars: 'body', band: [0.55, 0.78] },
    front: { lamps: 'rect', lampY: [0.84, 0.98], lampW: 0.34, grille: 'slats', intake: null },
    rear: { lamps: 'low', lampY: [0.62, 0.96], lampW: 0.13, spoiler: false },
    wheel: 'steel', bumpers: 'dark',
  },
  boxtruck: {
    p2: true,
    nose: { edge: 1.18, face: 0.0, out: 0.06, bumper: 0.74, dam: 0.44, lean: 0.03, tuck: 0.04, wrap: { rp: [0.08, 0.10], front: 0.07, side: 0.025 } },
    tail: null,
    arch: { gap: 0.06, lift: 0.04, lip: 0.035 },
    lip: { w: 0.04, proud: 0.012 },
    cham: { e: [0.03, 0.03], n: [0.09, 0.11] },
    cabin: { shoulder: 0.03, tuck: 0.04, roof: 0.07 },
    glass: { belt: 0.06, frame: 0.06, pillars: 'body', band: [0.55, 0.78] },
    front: { lamps: 'bumper', lampY: [0.58, 0.70], lampW: 0.26, grille: 'panel', intake: null },
    rear: { lamps: 'bar' },
    wheel: 'truck', bumpers: 'steel',
  },
  minibus: {
    p2: true,
    nose: { edge: 1.24, face: 0.0, out: 0.06, bumper: 0.80, dam: 0.46, lean: 0.06, tuck: 0.05, wrap: { rp: [0.14, 0.16], front: 0.07, side: 0.025 } },
    tail: { edge: 1.24, face: 0.0, out: 0.06, bumper: 0.76, dam: 0.48, lean: 0.02, tuck: 0.05, wrap: { rp: [0.12, 0.14], front: 0.06, side: 0.025 } },
    arch: { gap: 0.06, lift: 0.04, lip: 0.04 },
    lip: { w: 0.045, proud: 0.014 },
    cham: { e: [0.05, 0.05], n: [0.14, 0.16] },
    cabin: { shoulder: 0.03, tuck: 0.05, roof: 0.14 },
    glass: { belt: 0.04, frame: 0.07, pillars: 'dark', band: [0.55, 0.78] },
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

/*
 * THE E82, a new kind: the compact rear drive coupe of the late 2000s in
 * its six cylinder turbo form. The real car's sizes: 4.36 m long, 1.75 m
 * wide, 1.41 m high, a 2.66 m wheelbase with the front axle well forward
 * (0.72 m of overhang) and 0.98 m behind, on 18 inch wheels of 0.315 m
 * radius. src/props/street.js CAR_KINDS carries the same numbers, with its
 * glasshouse's width at the roof and the step down to its bonnet.
 *
 * What says what it is, with no roundel and no name on it: a long bonnet
 * with the glasshouse set back over the rear axle, the glasshouse tall and
 * compact with the rear side window kinked forward at the C pillar (the
 * kink the maker has used since the sixties, drawn here as a shape); a
 * shoulder line rising to the tail and a deep sill; twin round lamps with
 * bright rings under a straight brow; the split twin grille; L shaped tail
 * lamps wrapping onto the boot lid and round the corner; twin tips on one
 * side; double spoke wheels; bumpers with big intakes.
 */
const E82 = {
  L: 4.36, W: 1.75, R: 0.315, axle: [1.46, -1.20],
  sill: 0.33, waist: 0.92, roof: 1.41,
  cab: [-1.27, 0.63], rakeF: 0.50, rakeR: 0.50,
  seams: [-0.55], handles: [-0.40],
  cw: 1.32,
  bonnet: { x: 0.63, y: 0.83 },
  tw: 0.225,
};
const E82_SHAPE = {
  nose: { edge: 0.80, face: 0.01, out: 0.05, bumper: 0.60, dam: 0.22, lean: 0.06, tuck: 0.09 },
  tail: { edge: 0.96, face: 0.01, out: 0.045, bumper: 0.62, dam: 0.30, lean: 0.06, tuck: 0.08 },
  arch: { gap: 0.035, lift: 0.02, lip: 0.03 },
  cham: { e: [0.035, 0.04], n: [0.10, 0.12] },
  cabin: { shoulder: 0.03, tuck: 0.18, roof: 0.05 },
  glass: { belt: 0.03, frame: 0.045, pillars: 'dark', kink: { x: -1.04, top: -0.5, foot: 0.13, at: 0.13 } },
  front: { lamps: 'twin', lampY: [0.64, 0.782], lampW: 0.47, grille: 'kidney', intake: [0.29, 0.45, 0.62], sideIntakes: true, plateY: 0.52 },
  rear: { lamps: 'L', lampY: [0.76, 0.915], lampW: 0.40, lip: true, diffuser: true },
  wheel: 'double', bumpers: 'body', exhaust: 2, sillH: 0.1,
  /* The side's two lines, each [x0, y0, x1, y1]: the shoulder rising from
   * the front arch to the tail lamp, and the lower one rising from behind
   * the front wheel into the rear arch. */
  creases: [[1.02, 0.80, -1.90, 0.87], [0.95, 0.54, -0.72, 0.60, 'concave']],
};

/* The kei truck: makeKeiTruck's own sizes, which its colliders are. */
const KEITRUCK = {
  L: 3.32, W: 1.46, R: 0.29, axle: [0.94, -1.06],
  sill: 0.51, waist: 0.85, roof: 1.91,
  cab: [0.35, 1.61],
  tw: 0.18,
  p2: true,
};

export const MODEL = Object.freeze(Object.fromEntries([
  ...Object.keys(SHAPE).map((k) => [k, Object.freeze({ kind: k, ...TOWN_SPEC[k], ...SHAPE[k] })]),
  ['r32', Object.freeze({ kind: 'r32', ...R32, ...R32_SHAPE })],
  ['e82', Object.freeze({ kind: 'e82', ...E82, ...E82_SHAPE })],
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
  if (s.p2) {
    return lowerProfileP2(s, P, pts);
  }
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

/* The second pass's profile: the same, with no bumper in it, since the
 * bumpers are pieces of their own (bumperLoft) that wrap the corners. The
 * body's end runs down behind the bumper to its foot. */
function lowerProfileP2(s, P, pts) {
  const L2 = s.L / 2;
  const n = s.nose;
  const t = s.tail;
  P(-L2 - t.face + 0.03, t.dam + 0.04, 'n', 'under');
  for (const [x, y] of archPoints(s, s.axle[1], 7)) {
    P(x, y, 'a', 'well');
  }
  pts[pts.length - 1].edge = 'under';
  for (const [x, y] of archPoints(s, s.axle[0], 7)) {
    P(x, y, 'a', 'well');
  }
  pts[pts.length - 1].edge = 'under';
  const f0 = pts.length;
  P(L2 + n.face - 0.03, n.dam + 0.04, 'n', 'body');
  P(L2 + n.face, n.bumper - 0.03, 'n', 'body');
  const noseTop = L2 + n.face - n.lean;
  P(noseTop, n.edge, 'n', 'body');
  const front = pts.slice(f0).map((p) => [p.x, p.y]);
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
  P(-L2 - t.face, t.bumper - 0.03, 'n', 'body');
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

/* A point on the nose (sign 1) or the tail (-1): at height y, across at
 * z, `lift` off the face. */
function endPoint(chain, sign, y, z, lift) {
  const f = faceOf(chain, y, sign);
  return [f.x + f.nx * lift, y + f.ny * lift, z];
}

/* A plane polygon of [z, y] drawn on one face of the nose or the tail. */
function onEndPoly(M, role, chain, sign, poly, lift) {
  const q = area2(poly) >= 0 ? poly : poly.slice().reverse();
  const f = faceOf(chain, q[0][1], sign);
  M.face(role, q.map(([z, y]) => endPoint(chain, sign, y, z, lift)), {
    tris: q.length > 4 ? triangulate(q) : null, toward: [sign * Math.abs(f.nx), f.ny, 0],
  });
}

/* A round lamp's ring (r0 to r1) or disc (r0 0) on the nose or the tail. */
function endRing(M, role, chain, sign, yc, zc, r0, r1, lift, N = 14) {
  const f = faceOf(chain, yc, sign);
  const toward = [sign * Math.abs(f.nx), f.ny, 0];
  if (r0 <= 0) {
    const pts = [];
    for (let k = 0; k < N; k += 1) {
      const t = (k / N) * TAU;
      pts.push(endPoint(chain, sign, yc + r1 * Math.sin(t), zc + r1 * Math.cos(t), lift));
    }
    M.face(role, pts, { toward });
    return;
  }
  for (let k = 0; k < N; k += 1) {
    const t0 = (k / N) * TAU;
    const t1 = ((k + 1) / N) * TAU;
    M.face(role, [
      endPoint(chain, sign, yc + r0 * Math.sin(t0), zc + r0 * Math.cos(t0), lift),
      endPoint(chain, sign, yc + r1 * Math.sin(t0), zc + r1 * Math.cos(t0), lift),
      endPoint(chain, sign, yc + r1 * Math.sin(t1), zc + r1 * Math.cos(t1), lift),
      endPoint(chain, sign, yc + r0 * Math.sin(t1), zc + r0 * Math.cos(t1), lift),
    ], { toward });
  }
}

/* A rounded rectangle [z, y], corners of radius r in three steps. */
function roundRect(z0, y0, z1, y1, r) {
  const out = [];
  const corners = [[z1 - r, y0 + r, -Math.PI / 2], [z1 - r, y1 - r, 0], [z0 + r, y1 - r, Math.PI / 2], [z0 + r, y0 + r, Math.PI]];
  for (const [cz, cy, a0] of corners) {
    for (let k = 0; k <= 2; k += 1) {
      const a = a0 + (k * Math.PI) / 4;
      out.push([cz + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  }
  return out;
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
  const N = full ? 16 : 14;
  const R = s.R;
  const h = tyreWidth(s) / 2;
  const sh = Math.min(0.04, R * 0.13);
  const style = s.wheel;
  const rimR = R * ({ multi: 0.68, double: 0.72, truck: 0.6, bus: 0.6 }[style] ?? 0.63);
  const lip = style === 'multi' ? 0.022 : 0.013;
  /* The tyre: tread, shoulders, sidewalls. */
  lathe(M, 'dark', R, -(h - sh), R, h - sh, N, 1, 0);
  lathe(M, 'dark', R, h - sh, R - sh, h, N, 0.7071, 0.7071);
  lathe(M, 'dark', R - sh, h, rimR, h, N, 0, 1);
  if (full) {
    lathe(M, 'dark', R, -(h - sh), R - sh, -h, N, 0.7071, -0.7071);
    disc(M, 'dark', R - sh, -h, N, -1);
  } else if (s.p2) {
    /* The tyre's inner face, flat, so a wheel seen from the other side of
     * the car or from behind is a tyre and not the edge of its tread. */
    disc(M, 'dark', R, -(h - sh), N, -1);
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
    cap: 'brite', steel: 'briteDark', alloy5: rimRole, alloy6: rimRole, multi: rimRole, double: rimRole, truck: 'brite', bus: 'brite',
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
  } else if (style === 'double') {
    /* Five pairs of spokes: five big windows between the pairs, and a
     * slot down the middle of each pair. */
    spokeWindows(M, 5, hub + 0.025, fr - 0.012, 0.085, z, 0.2);
    for (let k = 0; k < 5; k += 1) {
      const a = 0.2 + (k / 5) * TAU;
      const r0 = hub + 0.045;
      const r1 = fr - 0.02;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      const w0 = 0.004;
      const w1 = 0.011;
      M.face('dark', [
        [r0 * c + w0 * sn, r0 * sn - w0 * c, z], [r1 * c + w1 * sn, r1 * sn - w1 * c, z],
        [r1 * c - w1 * sn, r1 * sn + w1 * c, z], [r0 * c - w0 * sn, r0 * sn + w0 * c, z],
      ], { toward: [0, 0, 1] });
    }
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
function screen(M, a, b, za, zb, out, { frame: fr = 0.05, bottom = 0.05, streaks = [[0.2, 0.2], [0.52, 0.06]], chrome = false, band = null, wipers = null } = {}) {
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
  if (band) {
    /* The sky's reflection, a paler band across the upper glass with a
     * hard edge, as a painted windscreen has it. */
    const q = clip(clip(glass, 0, 1, -len * band[0]), 0, -1, len * band[1]);
    if (q.length >= 3) {
      draw('band', q, 0.0125);
    }
  }
  glints(glass, -0.55, streaks, (q) => draw('glint', q, 0.014));
  /* Wiper blades lying on the glass: each from its pivot at the foot
   * [u, v up the glass] to its tip, a dark blade on a thinner arm. */
  for (const [u0, v0, u1, v1] of wipers ?? []) {
    const du = u1 - u0;
    const dv = v1 - v0;
    const l = Math.sqrt(du * du + dv * dv);
    const nu = (-dv / l) * 0.007;
    const nv = (du / l) * 0.007;
    draw('dark', [[u0 - nu, bottom + v0 - nv], [u1 - nu, bottom + v1 - nv], [u1 + nu, bottom + v1 + nv], [u0 + nu, bottom + v0 + nv]], 0.017);
  }
}

/*
 * The side glass on a glasshouse flank. `cap` is the flank's polygon (the
 * prism's inset outline), `hw(y)` its half width, `s` the kind. The glass
 * reaches from the belt to under the roof's chamfer and between the
 * screens' pillars; pillars stand at the kind's seams; `side` limits it
 * (a van is glazed over its cab only).
 */
function sideGlass(M, s, cap, hw) {
  const g = s.glass;
  let dlo = inset(cap, cap.map(() => g.frame));
  dlo = clip(dlo, 0, 1, -(s.waist + g.belt));
  if (s.side) {
    dlo = clip(dlo, 1, 0, -s.side[0]);
    dlo = clip(dlo, -1, 0, s.side[1]);
  }
  if (g.kink) {
    /* The rear side window's kink: its back edge comes down the C pillar
     * running rearward, and a little above the belt turns sharply forward
     * to meet it, so the pane's rearmost point is a corner at the kink.
     * Two half planes, x at least each of the two lines through it. */
    const yb = s.waist + g.belt;
    const yk = yb + (g.kink.at ?? 0.1);
    const yt = s.roof - g.frame;
    const kx = g.kink.x;
    const m = g.kink.foot / (yk - yb);
    dlo = clip(dlo, 1, m, -(kx + m * yk));
    const sl = (g.kink.top - kx) / (yt - yk);
    dlo = clip(dlo, 1, -sl, -(kx - sl * yk));
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
      if (g.band) {
        let y0 = Infinity;
        let y1 = -Infinity;
        for (const p of glass) {
          y0 = Math.min(y0, p[1]);
          y1 = Math.max(y1, p[1]);
        }
        lay('band', clip(clip(glass, 0, 1, -(y0 + (y1 - y0) * g.band[0])), 0, -1, y0 + (y1 - y0) * g.band[1]), 0.0115);
      }
      glints(glass, 0.9, [[0.3, 0.12]], (gq) => lay('glint', gq, 0.013));
    }
  }
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
    if (f.lamps === 'twin') {
      /* Twin round lamps with bright rings in a housing whose top edge is
       * a straight brow, falling a little toward the grille, and the
       * brow itself in paint across the rings' tops. */
      const zo = side * outer;
      const zi = side * inner;
      const housing = [[zi, ly0 + 0.035], [zo - side * 0.05, ly0 - 0.012], [zo, ly0 + 0.02], [zo, ly1 + 0.004], [zi, ly1 - 0.02]];
      onEndPoly(M, 'dark', ch.front, 1, housing, 0.012);
      const yc = (ly0 + ly1) / 2 - 0.006;
      for (const [dz, r] of [[0.1, 0.064], [0.25, 0.056]]) {
        const zc = side * (outer - dz);
        endRing(M, 'lampF', ch.front, 1, yc, zc, r * 0.7, r, 0.018);
        endRing(M, 'clear', ch.front, 1, yc, zc, 0, r * 0.7, 0.016, 10);
        endRing(M, 'lampF', ch.front, 1, yc, zc, 0, r * 0.22, 0.019, 8);
      }
      /* The indicator along the housing's inner foot. */
      onEndPoly(M, 'amber', ch.front, 1, [[zi + side * 0.02, ly0 + 0.03], [zi + side * 0.13, ly0 + 0.02], [zi + side * 0.13, ly0 + 0.042], [zi + side * 0.02, ly0 + 0.05]], 0.02);
      /* The brow. */
      onEndPoly(M, 'body', ch.front, 1, [[zi, ly1 - 0.03], [zo, ly1 - 0.016], [zo, ly1 + 0.004], [zi, ly1 - 0.01]], 0.022);
    } else if (f.lamps === 'bumper') {
      /* The lorry's: square lamps set in the steel bumper's corners. */
      blockOnEnd(M, 'dark', ch.front, 1, ly0 - 0.015, ly1 + 0.015, z0 - 0.015, z1 + 0.015, 0.02);
      onEnd(M, 'lampF', ch.front, 1, ly0, ly1, side > 0 ? z0 + 0.08 : z0, side > 0 ? z1 : z1 - 0.08, 0.024);
      onEnd(M, 'amber', ch.front, 1, ly0, ly1, side > 0 ? z0 : z1 - 0.07, side > 0 ? z0 + 0.07 : z1, 0.024);
    } else {
      const raise = f.lamps === 'swept' ? 0.028 : 0;
      blockOnEnd(M, 'dark', ch.front, 1, ly0 - 0.012, ly1 + 0.012, z0 - 0.012, z1 + 0.012, 0.016, raise);
      /* The lens, and at its outer end the indicator, in amber. */
      const ind = f.lamps === 'slim' ? 0 : 0.07;
      const lz0 = side > 0 ? z0 : z0 + ind;
      const lz1 = side > 0 ? z1 - ind : z1;
      onEnd(M, 'lampF', ch.front, 1, ly0, ly1, lz0, lz1, 0.02, raise * ((lz1 - lz0) / (z1 - z0)));
      if (ind) {
        onEnd(M, 'amber', ch.front, 1, ly0, ly1, side > 0 ? z1 - ind + 0.008 : z0, side > 0 ? z1 : z0 + ind - 0.008, 0.02, raise);
      }
      if (f.lamps === 'swept') {
        /* The projector's shade: a dark bar along the lens's foot. */
        onEnd(M, 'dark', ch.front, 1, ly0, ly0 + (ly1 - ly0) * 0.28, lz0 + 0.02, lz1 - 0.02, 0.023);
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
  if (f.grille === 'kidney') {
    /* Two tall rounded openings side by side: a bright surround, the dark
     * inside, upright slats. */
    for (const side of [1, -1]) {
      const za = side * 0.016;
      const zb = side * 0.172;
      const y0 = ly0 - 0.02;
      const y1 = ly1 - 0.004;
      const outline = roundRect(Math.min(za, zb), y0, Math.max(za, zb), y1, 0.035);
      onEndPoly(M, 'brite', ch.front, 1, outline, 0.012);
      onEndPoly(M, 'dark', ch.front, 1, inset(outline, outline.map(() => 0.012)), 0.016);
      for (let k = 1; k < 5; k += 1) {
        const z = za + (zb - za) * (k / 5);
        onEnd(M, 'briteDark', ch.front, 1, y0 + 0.02, y1 - 0.02, z - 0.005, z + 0.005, 0.019);
      }
    }
  } else if (f.grille === 'slim' || f.grille === 'narrow') {
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
  if (f.sideIntakes) {
    /* Bumpers with bigger intakes: a tall opening at each corner, a round
     * fog lamp in it, and a painted bar across the middle one. */
    for (const side of [1, -1]) {
      const z = side * (zf - 0.11);
      blockOnEnd(M, 'dark', ch.front, 1, n.dam + 0.07, n.dam + 0.25, z - 0.08, z + 0.08, 0.006);
      endRing(M, 'clear', ch.front, 1, n.dam + 0.2, z, 0, 0.032, 0.012, 10);
    }
    const [iy0, iy1, iw] = f.intake;
    onEnd(M, 'body', ch.front, 1, (iy0 + iy1) / 2 - 0.012, (iy0 + iy1) / 2 + 0.012, -iw / 2 + 0.03, iw / 2 - 0.03, 0.012);
  }
  const py = f.plateY ?? (f.intake ? (f.intake[0] + f.intake[1]) / 2 : (n.dam + n.bumper) / 2);
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

function plate(M, chain, sign, y, clear = false) {
  const a = faceOf(chain, y - 0.0825, sign);
  const b = faceOf(chain, y + 0.0825, sign);
  const lift = 0.02;
  if (clear) {
    /* On a face that bulges between the plate's edges (a bumper's roll),
     * the plate is pushed out, square, to stand clear of all of it. */
    let out = 0;
    for (let k = 0; k <= 8; k += 1) {
      const u = k / 8;
      const x = chainX(chain, y - 0.0825 + 0.165 * u);
      const line = a.x + (b.x - a.x) * u;
      out = Math.max(out, sign * (x - line));
    }
    a.x += sign * out;
    b.x += sign * out;
  }
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
  if (r.lamps === 'bar') {
    return;
  }
  const [ly0, ly1] = r.lampY;
  const outer = zr - 0.015;
  if (r.lamps === 'L') {
    /* L shaped lamps: a leg down the corner and an arm along the boot
     * lid's edge, in dark housings, the leg wrapping round the corner onto
     * the flank. The arm carries the reversing lamp at its inner end and
     * the leg the indicator at its foot. */
    const leg = 0.13;
    const arm = ly1 - 0.075;
    const hw = (s.door ?? s.W) / 2;
    const [cn, dn] = s.cham.n;
    for (const side of [1, -1]) {
      const zo = side * outer;
      const zl = side * (outer - leg);
      const za = side * (outer - r.lampW);
      const shape = [[zo, ly0], [zo, ly1], [za, ly1], [za, arm], [zl, arm], [zl, ly0]];
      onEndPoly(M, 'dark', ch.rear, -1, inset(area2(shape) >= 0 ? shape : shape.slice().reverse(), shape.map(() => -0.012)), 0.012);
      onEndPoly(M, 'lampR', ch.rear, -1, [[zo, ly0 + 0.03], [zo, ly1], [zl, ly1], [zl, ly0 + 0.03]], 0.018);
      onEndPoly(M, 'lampR', ch.rear, -1, [[zl, arm + 0.02], [zl, ly1], [za, ly1], [za, arm + 0.02]], 0.018);
      onEndPoly(M, 'clear', ch.rear, -1, [[za + side * 0.07, arm + 0.02], [za + side * 0.07, arm + 0.045], [za + side * 0.005, arm + 0.045], [za + side * 0.005, arm + 0.02]], 0.021);
      onEndPoly(M, 'amber', ch.rear, -1, [[zo, ly0], [zo, ly0 + 0.026], [zl, ly0 + 0.026], [zl, ly0]], 0.018);
      /* The light guide: a brighter line along the L. */
      onEndPoly(M, 'dark', ch.rear, -1, [[zo - side * 0.02, ly1 - 0.028], [zo - side * 0.02, ly1 - 0.018], [za + side * 0.1, ly1 - 0.018], [za + side * 0.1, ly1 - 0.028]], 0.02);
      /* Round the corner: across the plan chamfer and onto the flank. */
      for (const [y0, y1] of [[ly0 + 0.03, ly1]]) {
        const a0 = endPoint(ch.rear, -1, y0, side * (hw - dn), 0.004);
        const a1 = endPoint(ch.rear, -1, y1, side * (hw - dn), 0.004);
        const b0 = [a0[0] + cn, y0, side * (hw + 0.004)];
        const b1 = [a1[0] + cn, y1, side * (hw + 0.004)];
        M.face('lampR', [a0, b0, b1, a1], { toward: [-1, 0, side] });
        M.face('lampR', [b0, [b0[0] + 0.16, y0 + 0.012, b0[2]], [b1[0] + 0.14, y1, b1[2]], b1], { toward: [0, 0, side] });
      }
      lamps.rear.push([chainX(ch.rear, (ly0 + ly1) / 2) - 0.03, (ly0 + ly1) / 2, side * (outer - leg / 2)]);
    }
    return;
  }
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
  if (s.p2) {
    mirrorsP2(M, s, hw, role);
    return;
  }
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

/* The second pass's door mirrors: a dark foot on the door's top front
 * corner, a dark arm, and a housing in paint that is round at its front
 * and flat at its back, where the glass is, and narrower at its outer end
 * in plan, as a mirror's shell is. */
function mirrorsP2(M, s, hw, role) {
  const mx = s.cab[1] - 0.12;
  const y0 = s.waist + 0.035;
  const y1 = s.waist + 0.14;
  const back = mx - 0.035;
  const front = mx + 0.045;
  /* The shell's side view, the back straight, the front rounded. */
  const prof = [[back, y0], [front - 0.03, y0], [front - 0.008, y0 + 0.02], [front, (y0 + y1) / 2], [front - 0.008, y1 - 0.02], [front - 0.03, y1], [back, y1]];
  for (const side of [1, -1]) {
    M.box('dark', mx - 0.06, s.waist - 0.004, side > 0 ? hw - 0.03 : -(hw + 0.012), mx + 0.05, s.waist + 0.03, side > 0 ? hw + 0.012 : -(hw - 0.03), '-y');
    M.box('dark', mx - 0.02, y0 + 0.005, side > 0 ? hw : -(hw + 0.07), mx + 0.02, y0 + 0.03, side > 0 ? hw + 0.07 : -hw, '-y');
    const zi = side * (hw + 0.05);
    const zo = side * (hw + 0.2);
    /* The inner end full height, the outer end drawn in at the front. */
    const outer = prof.map(([x, y]) => [back + (x - back) * 0.8, y0 + 0.008 + (y - y0) * 0.86]);
    const n = prof.length;
    for (let i = 0; i < n; i += 1) {
      const j = (i + 1) % n;
      const quad = [[prof[i][0], prof[i][1], zi], [prof[j][0], prof[j][1], zi], [outer[j][0], outer[j][1], zo], [outer[i][0], outer[i][1], zo]];
      const mid = [(prof[i][0] + prof[j][0]) / 2 - mx, (prof[i][1] + prof[j][1]) / 2 - (y0 + y1) / 2, 0];
      M.face(i === n - 1 ? 'glass' : role, quad, { toward: mid });
    }
    M.face(role, outer.map(([x, y]) => [x, y, zo]), { tris: triangulate(outer), toward: [0, 0, side] });
  }
}

/* ------------------------------------------------------------------ *
 * THE SECOND PASS: bumpers that wrap, lips on the arches, lamps and
 * grilles set in rims. Every kind but the r32 and the e82 is drawn with
 * these (the kinds whose row says p2); those two are unchanged.
 * ------------------------------------------------------------------ */

/* A quad whose four normals are handed in, wound to face the way they
 * point (the mesher would turn the normals round with the winding). */
function quadN(M, role, pts, normals) {
  const [a, b, c, d] = pts;
  const ux = c[0] - a[0];
  const uy = c[1] - a[1];
  const uz = c[2] - a[2];
  const vx = d[0] - b[0];
  const vy = d[1] - b[1];
  const vz = d[2] - b[2];
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  let sx = 0;
  let sy = 0;
  let sz = 0;
  for (const n of normals) {
    sx += n[0];
    sy += n[1];
    sz += n[2];
  }
  if (nx * sx + ny * sy + nz * sz < 0) {
    M.face(role, [d, c, b, a], { normals: [normals[3], normals[2], normals[1], normals[0]] });
  } else {
    M.face(role, pts, { normals });
  }
}

/* A rounded rectangle [z, y] with `n` facets at each corner. */
function rrect(z0, y0, z1, y1, r, n = 2) {
  const out = [];
  const corners = [[z1 - r, y0 + r, -Math.PI / 2], [z1 - r, y1 - r, 0], [z0 + r, y1 - r, Math.PI / 2], [z0 + r, y0 + r, Math.PI]];
  for (const [cz, cy, a0] of corners) {
    for (let k = 0; k <= n; k += 1) {
      const a = a0 + (k * Math.PI) / (2 * n);
      out.push([cz + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  }
  return out;
}

/* A polygon [z, y] as the other side of the car has it. */
function mirrorZ(poly) {
  return poly.map(([z, y]) => [-z, y]).reverse();
}

/* A convex polygon cut to another convex polygon (both [z, y]). */
function clipTo(poly, bound) {
  const b = area2(bound) >= 0 ? bound : bound.slice().reverse();
  let q = poly;
  for (let i = 0; i < b.length && q.length >= 3; i += 1) {
    const p = b[i];
    const r = b[(i + 1) % b.length];
    /* Left of p to r is inside a counter clockwise bound. */
    const a = -(r[1] - p[1]);
    const c = r[0] - p[0];
    q = clip(q, a, c, -(a * p[0] + c * p[1]));
  }
  return q;
}

/*
 * THE BUMPER, a piece of its own that wraps the corner: a section (how far
 * it stands out at each height, `rows` of [share of its stand, y]) swept
 * along the body's plan from the arch round a rounded corner across the
 * end and back to the other arch. It stands `front` out of the body across
 * the end and `side` out of the flank, its foot tucked under and its top
 * rolling back into the body as a ledge, lit smooth round the corner.
 * Returns the chain of its section across the middle, rising, for what is
 * laid on its face. sign +1 is the nose.
 */
function bumperLoft(M, s, sign, hw, role) {
  const e = sign > 0 ? s.nose : s.tail;
  const b = e.wrap;
  const L2 = s.L / 2;
  const [rx, rz] = b.rp;
  const x0 = L2 + e.face - 0.005;
  const zb = hw - 0.004;
  const A = s.R + s.arch.gap + (s.lip ? s.lip.w : 0);
  const ax = sign > 0 ? s.axle[0] : -s.axle[1];
  const xw = Math.min(ax + A + 0.01, x0 - rx - 0.03);
  const top = e.bumper;
  const dam = e.dam;
  const rows = b.rows ?? [[0.35, dam], [1, dam + 0.07], [1, top - 0.045], [0.78, top - 0.008], [-0.5, top]];
  const m = b.segs ?? 3;
  /* Samples along the plan: [x, z, its normal, how much of the end it
   * is (0 on the flank, 1 across the end), how much of its stand it
   * keeps]. The stand eases off toward the arch, so the bumper dies into
   * the flank rather than stopping square. */
  const half = [[xw, zb, 0, 1, 0, 0.4], [x0 - rx, zb, 0, 1, 0, 1]];
  for (let k = 1; k <= m; k += 1) {
    const t = (k / m) * (Math.PI / 2);
    const nx = Math.sin(t) / rx;
    const nz = Math.cos(t) / rz;
    const l = Math.sqrt(nx * nx + nz * nz);
    half.push([x0 - rx + rx * Math.sin(t), zb - rz + rz * Math.cos(t), nx / l, nz / l, k / m, 1]);
  }
  const S = [...half, ...half.slice().reverse().map(([x, z, nx, nz, w, k]) => [x, -z, nx, -nz, w, k])];
  const stand = (a) => (b.side + (b.front - b.side) * a[4]) * a[5];
  const P = (a, o, y) => {
    const d = o * stand(a);
    return [sign * (a[0] + a[2] * d), y, a[1] + a[3] * d];
  };
  for (let k = 0; k + 1 < rows.length; k += 1) {
    const [o0, y0] = rows[k];
    const [o1, y1] = rows[k + 1];
    const nOf = (a) => {
      const dO = (o1 - o0) * stand(a);
      const dY = y1 - y0;
      const l = Math.sqrt(dO * dO + dY * dY) || 1;
      const no = dY / l;
      const ny = -dO / l;
      return [sign * a[2] * no, ny, a[3] * no];
    };
    for (let i = 0; i + 1 < S.length; i += 1) {
      const a = S[i];
      const c = S[i + 1];
      const na = nOf(a);
      const nc = nOf(c);
      quadN(M, role, [P(a, o0, y0), P(c, o0, y0), P(c, o1, y1), P(a, o1, y1)], [na, nc, nc, na]);
    }
  }
  /* Its two ends, square, facing the arches. */
  const sec = rows.map(([o, y]) => [o, y]);
  const T = triangulate(area2(sec) >= 0 ? sec : sec.slice().reverse());
  const ordered = area2(sec) >= 0 ? rows : rows.slice().reverse();
  for (const a of [S[0], S[S.length - 1]]) {
    M.face(role, ordered.map(([o, y]) => P(a, o, y)), { tris: T, toward: [-sign, 0, 0] });
  }
  /* Its face across the middle, as a chain. */
  return rows.slice(0, -1).map(([o, y]) => [sign * (x0 + o * b.front), y]);
}

/* The lip round an arch: a ring standing `proud` off the flank and `w`
 * wide, its outer edge in paint and its inner one dark where it meets the
 * wheel well. */
function archLipP2(M, s, hw, ax) {
  const A = s.R + s.arch.gap;
  const yc = s.R + s.arch.lift;
  const { w, proud } = s.lip;
  const inner = archPoints(s, ax, 5);
  const Ao = A + w;
  const outer = inner.map(([x, y]) => [ax + ((x - ax) * Ao) / A, yc + ((y - yc) * Ao) / A]);
  const dy = Math.max(0, s.sill - yc);
  const foot = Math.sqrt(Ao * Ao - dy * dy);
  outer[0] = [ax - foot, Math.max(s.sill, outer[0][1])];
  outer[outer.length - 1] = [ax + foot, Math.max(s.sill, outer[outer.length - 1][1])];
  /* The inner edge is left open: the wheel stands in front of it. */
  let pts = [...inner.map(([x, y]) => ({ x, y, edge: null })), ...outer.slice().reverse().map(([x, y]) => ({ x, y, edge: 'body' }))];
  pts[inner.length - 1].edge = 'body';
  if (area2(pts.map((p) => [p.x, p.y])) < 0) {
    /* Reversed, an edge's role moves to the point before it. */
    const rev = pts.slice().reverse();
    pts = rev.map((p, i) => ({ x: p.x, y: p.y, edge: rev[(i + 1) % rev.length].edge }));
  }
  const hwL = (proud + 0.012) / 2;
  const t = new THREE.Matrix4();
  for (const side of [1, -1]) {
    M.at(t.makeTranslation(0, 0, side * (hw - 0.012 + hwL)));
    prism(M, 'body', pts, () => hwL, { sides: [side], edgeRole: (i) => pts[i].edge });
  }
  M.at(null);
}

/*
 * A lamp, a grille or an intake set in a rim, on the nose (sign 1) or the
 * tail: the rim stands `h` off the face and `rim` wide round the outline
 * `poly` ([z, y]), its outer side standing up from the face (`outer`), its
 * inner side going down to the lens at `lens`, so the lens sits in a
 * recess the rim's shadow side reads as depth. `parts` are laid on the lens
 * (discs, rings, polygons), `bars` across it at half the rim's height.
 * Returns the lens outline.
 */
function pod(M, chain, sign, poly, o) {
  const q = area2(poly) >= 0 ? poly : poly.slice().reverse();
  const n = q.length;
  const h = o.h ?? 0.02;
  const lens = o.lens ?? 0.006;
  const I = inset(q, q.map(() => o.rim ?? 0.02));
  let cz = 0;
  let cy = 0;
  for (const [z, y] of q) {
    cz += z / n;
    cy += y / n;
  }
  const f = faceOf(chain, cy, sign);
  const fn = [sign * Math.abs(f.nx), f.ny, 0];
  const C = endPoint(chain, sign, cy, cz, h);
  const at = (p, lift) => endPoint(chain, sign, p[1], p[0], lift);
  const rimRole = o.rimRole ?? 'dark';
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    const oi = at(q[i], h);
    const oj = at(q[j], h);
    const ii = at(I[i], h);
    const ij = at(I[j], h);
    M.face(rimRole, [oi, oj, ij, ii], { toward: fn });
    const mid = [(oi[0] + oj[0]) / 2 - C[0], (oi[1] + oj[1]) / 2 - C[1], (oi[2] + oj[2]) / 2 - C[2]];
    if (o.outer ?? h >= 0.018) {
      M.face(o.wallRole ?? rimRole, [at(q[i], -0.004), at(q[j], -0.004), oj, oi], { toward: mid });
    }
    const li = at(I[i], lens);
    const lj = at(I[j], lens);
    M.face(o.innerRole ?? 'dark', [li, lj, ij, ii], { toward: [-mid[0], -mid[1], -mid[2]] });
  }
  if (o.lensRole) {
    M.face(o.lensRole, I.map((p) => at(p, lens)), { tris: n > 4 ? triangulate(I) : null, toward: fn });
  }
  let lift = lens + 0.002;
  for (const part of o.parts ?? []) {
    if (part.poly) {
      const pp = area2(part.poly) >= 0 ? part.poly : part.poly.slice().reverse();
      M.face(part.role, pp.map((p) => at(p, lift)), { tris: pp.length > 4 ? triangulate(pp) : null, toward: fn });
    } else if (part.disc || part.ring) {
      const [z, y, r0, r1, N = 10] = part.disc ? [part.disc[0], part.disc[1], 0, part.disc[2], part.disc[3]] : part.ring;
      endRing(M, part.role, chain, sign, y, z, r0, r1, lift, N);
    }
    lift += 0.002;
  }
  for (const bars of [].concat(o.bars ?? [])) {
    const { n: k, w, role, dir = 'h' } = bars;
    let z0 = Infinity;
    let z1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const [z, y] of I) {
      z0 = Math.min(z0, z);
      z1 = Math.max(z1, z);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
    const bl = (lens + h) / 2;
    for (let i = 0; i < k; i += 1) {
      let bar;
      if (dir === 'h') {
        const y = y0 + ((y1 - y0) * (i + 1)) / (k + 1);
        bar = [[z0 - 1, y - w / 2], [z1 + 1, y - w / 2], [z1 + 1, y + w / 2], [z0 - 1, y + w / 2]];
      } else {
        const z = z0 + ((z1 - z0) * (i + 1)) / (k + 1);
        bar = [[z - w / 2, y0 - 1], [z + w / 2, y0 - 1], [z + w / 2, y1 + 1], [z - w / 2, y1 + 1]];
      }
      const cut = clipTo(bar, I);
      if (cut.length >= 3) {
        M.face(role, cut.map((p) => at(p, bl)), { toward: fn });
      }
    }
  }
  return { lens: I, centre: [cz, cy] };
}

/*
 * A second pass end: its pods (each mirrored to the other side when
 * `mirror`), its flat pieces, its lamps round the corner onto the flanks,
 * its plate. `spec` is the kind's FACES entry for this end.
 */
function endP2(M, s, chain, sign, hw, spec, lamps) {
  const list = sign > 0 ? lamps.front : lamps.rear;
  for (const p of spec.pods ?? []) {
    const polys = p.mirror ? [p.poly, mirrorZ(p.poly)] : [p.poly];
    polys.forEach((poly, side) => {
      const flip = (list0) => (side === 1 ? list0.map((part) => {
        if (part.poly) {
          return { ...part, poly: mirrorZ(part.poly) };
        }
        if (part.disc) {
          return { ...part, disc: [-part.disc[0], ...part.disc.slice(1)] };
        }
        return { ...part, ring: [-part.ring[0], ...part.ring.slice(1)] };
      }) : list0);
      const r = pod(M, chain, sign, poly, { ...p, parts: flip(p.parts ?? []) });
      if (p.lamp) {
        const [z, y] = p.lampAt ? [side === 1 ? -p.lampAt[0] : p.lampAt[0], p.lampAt[1]] : r.centre;
        list.push([chainX(chain, y) + sign * 0.03, y, z]);
      }
    });
  }
  for (const f of spec.flats ?? []) {
    for (const poly of f.mirror ? [f.poly, mirrorZ(f.poly)] : [f.poly]) {
      onEndPoly(M, f.role, chain, sign, poly, f.lift ?? 0.004);
    }
  }
  /* Round fog lamps, [z, y, r] on the +z side and mirrored. */
  for (const [z, y, r] of spec.fogs ?? []) {
    for (const zz of [z, -z]) {
      endRing(M, 'clear', chain, sign, y, zz, 0, r, 0.008, 8);
    }
  }
  /* A lamp that runs round the corner: a strip along the flank from the
   * corner back, tapering. */
  for (const w of spec.wraps ?? []) {
    const L2 = s.L / 2;
    const [cn, dn] = s.cham.n;
    for (const side of [1, -1]) {
      const z = side * (hw + 0.004);
      const xc = sign * (L2 + (sign > 0 ? s.nose.face : s.tail.face) - cn);
      const x1 = xc - sign * w.len;
      const [y0, y1] = w.y;
      const [t0, t1] = w.back ?? [y0, y1];
      M.face(w.role, [[xc, y0, z], [x1, t0, z], [x1, t1, z], [xc, y1, z]], { toward: [0, 0, side] });
      /* Across the corner's chamfer, from the face to the flank. */
      const a0 = endPoint(chain, sign, y0, side * (hw - dn), 0.004);
      const a1 = endPoint(chain, sign, y1, side * (hw - dn), 0.004);
      M.face(w.role, [a0, [xc, y0, z], [xc, y1, z], a1], { toward: [sign, 0, side] });
    }
  }
  if (spec.plate !== undefined) {
    plate(M, chain, sign, spec.plate, true);
  }
}

/*
 * EACH KIND'S OWN FACE, front and rear, for the second pass: the lamps,
 * grilles, intakes and fog lamps as pods (see pod), in [z, y] on the end,
 * each lamp given for the +z side and mirrored. What tells them apart at
 * ten metres, not only their size:
 *
 *   kei       a tall upright face, small rounded lamps high on its corners
 *             in painted rims, a slim bright ringed slot between them, a big
 *             painted bumper with a wide intake and two little fog lamps.
 *   keivan    a black band right across, square lamps at its ends in grey
 *             bezels and bars between them, a plain black bumper.
 *   hatch     lamps swept up and back round the corners into the flanks, a
 *             slim slot under the bonnet's edge, a big trapezoid mouth in
 *             the bumper with fog lamps in its corners.
 *   sedan     an upright bright framed grille with vertical bars, twin lamps
 *             in bright rims, amber round the corners, a rubbing strip.
 *   wagon     wedge lamps tapering to a painted barred grille, a plain black
 *             bumper: the shop's car.
 *   minivan   wide lamps with twin projectors joined by a bright barred
 *             upper grille, a deep bumper with a big lower grille and upright
 *             fog lamps: the school run's face.
 *   van       lamps sunk in painted rims at the corners, a bright framed
 *             grille between them and a second barred mouth below.
 *   boxtruck  a big black barred grille panel, the lamps in the bright steel
 *             bumper, amber markers on the cab's corners.
 *   minibus   twin square lamps each side in black housings, a bright framed
 *             barred grille, fog lamps in a black bumper.
 */
const FACES = {
  kei: () => ({
    front: {
      pods: [
        {
          poly: rrect(0.355, 0.785, 0.585, 0.915, 0.05, 2), mirror: true, rim: 0.022, h: 0.022, lens: 0.006,
          rimRole: 'body', lensRole: 'clear', lamp: true, lampAt: [0.505, 0.85],
          parts: [{ role: 'lampF', disc: [0.505, 0.85, 0.048, 10] }, { role: 'amber', poly: rrect(0.382, 0.80, 0.418, 0.90, 0.012, 1) }],
        },
        {
          poly: rrect(-0.24, 0.805, 0.24, 0.872, 0.03, 1), rim: 0.012, h: 0.016, lens: 0.004,
          rimRole: 'brite', lensRole: 'dark', bars: { n: 1, w: 0.012, role: 'briteDark' },
        },
        {
          poly: [[-0.30, 0.335], [0.30, 0.335], [0.37, 0.47], [-0.37, 0.47]], rim: 0.018, h: 0.014, lens: 0.003,
          rimRole: 'body', lensRole: 'dark', bars: { n: 2, w: 0.008, role: 'briteDark' },
        },
      ],
      flats: [{ role: 'dark', poly: rrect(0.45, 0.375, 0.55, 0.44, 0.025, 1), mirror: true, lift: 0.004 }],
      fogs: [[0.50, 0.4075, 0.022]],
      plate: 0.555,
    },
    rear: {
      pods: [
        {
          poly: rrect(0.47, 0.64, 0.585, 1.0, 0.035, 1), mirror: true, rim: 0.014, h: 0.016, lens: 0.005,
          rimRole: 'dark', lensRole: 'lampR', lamp: true,
          parts: [{ role: 'clear', poly: rrect(0.49, 0.70, 0.565, 0.76, 0.01, 1) }, { role: 'amber', poly: rrect(0.49, 0.77, 0.565, 0.82, 0.01, 1) }],
        },
      ],
      flats: [{ role: 'brite', poly: rrect(-0.2, 0.745, 0.2, 0.765, 0.008, 1), lift: 0.006 },
        { role: 'lampR', poly: [[0.44, 0.44], [0.55, 0.44], [0.55, 0.465], [0.44, 0.465]], mirror: true, lift: 0.006 }],
      plate: 0.65,
    },
  }),
  keivan: () => ({
    front: {
      pods: [
        { poly: rrect(-0.62, 0.72, 0.62, 0.90, 0.03, 1), rim: 0.014, h: 0.012, lens: 0.004, rimRole: 'dark', lensRole: 'dark' },
        {
          poly: rrect(-0.34, 0.735, 0.34, 0.885, 0.01, 1), rim: 0.006, h: 0.014, lens: 0.008, rimRole: 'briteDark',
          bars: { n: 3, w: 0.018, role: 'briteDark' },
        },
        {
          poly: rrect(0.37, 0.745, 0.60, 0.875, 0.02, 1), mirror: true, rim: 0.012, h: 0.024, lens: 0.016,
          rimRole: 'briteDark', lensRole: 'lampF', lamp: true,
          parts: [{ role: 'amber', poly: rrect(0.525, 0.76, 0.585, 0.86, 0.008, 1) }, { role: 'dark', poly: rrect(0.445, 0.76, 0.452, 0.86, 0.002, 1) }],
        },
      ],
      plate: 0.4725,
    },
    rear: {
      pods: [
        {
          poly: rrect(0.50, 0.56, 0.625, 0.88, 0.02, 1), mirror: true, rim: 0.012, h: 0.016, lens: 0.005,
          rimRole: 'dark', lensRole: 'lampR', lamp: true,
          parts: [{ role: 'clear', poly: rrect(0.515, 0.575, 0.61, 0.62, 0.008, 1) }, { role: 'amber', poly: rrect(0.515, 0.63, 0.61, 0.69, 0.008, 1) }],
        },
      ],
      flats: [{ role: 'dark', poly: rrect(-0.18, 0.745, 0.18, 0.77, 0.01, 1), lift: 0.006 }],
      plate: 0.65,
    },
  }),
  hatch: () => ({
    front: {
      pods: [
        {
          poly: [[0.30, 0.715], [0.60, 0.70], [0.672, 0.745], [0.678, 0.86], [0.62, 0.875], [0.36, 0.785]], mirror: true,
          rim: 0.014, h: 0.02, lens: 0.006, rimRole: 'dark', lensRole: 'clear', lamp: true, lampAt: [0.56, 0.79],
          parts: [{ role: 'lampF', disc: [0.56, 0.79, 0.044, 10] },
            { role: 'lampF', poly: [[0.40, 0.772], [0.62, 0.842], [0.636, 0.852], [0.42, 0.786]] },
            { role: 'amber', poly: [[0.645, 0.76], [0.662, 0.765], [0.665, 0.84], [0.648, 0.84]] }],
        },
        {
          poly: [[-0.26, 0.745], [0.26, 0.745], [0.30, 0.79], [-0.30, 0.79]], rim: 0.01, h: 0.014, lens: 0.004,
          rimRole: 'dark', lensRole: 'dark',
        },
        {
          poly: [[-0.36, 0.30], [0.36, 0.30], [0.44, 0.52], [-0.44, 0.52]], rim: 0.02, h: 0.016, lens: 0.004,
          rimRole: 'body', lensRole: 'dark', bars: { n: 3, w: 0.01, role: 'briteDark' },
        },
      ],
      flats: [{ role: 'brite', poly: rrect(-0.28, 0.80, 0.28, 0.812, 0.005, 1), lift: 0.005 },
        { role: 'dark', poly: [[0.50, 0.33], [0.60, 0.33], [0.60, 0.47]], mirror: true, lift: 0.004 }],
      fogs: [[0.568, 0.37, 0.02]],
      plate: 0.41,
    },
    rear: {
      pods: [
        {
          poly: [[0.44, 0.76], [0.66, 0.74], [0.67, 0.95], [0.52, 0.95], [0.44, 0.84]], mirror: true, rim: 0.014, h: 0.016, lens: 0.005,
          rimRole: 'dark', lensRole: 'lampR', lamp: true,
          parts: [{ role: 'clear', poly: [[0.46, 0.775], [0.60, 0.765], [0.60, 0.80], [0.46, 0.81]] },
            { role: 'amber', poly: [[0.61, 0.765], [0.648, 0.762], [0.65, 0.80], [0.61, 0.80]] }],
        },
      ],
      flats: [{ role: 'dark', poly: rrect(-0.16, 0.785, 0.16, 0.805, 0.008, 1), lift: 0.006 },
        { role: 'lampR', poly: [[0.48, 0.42], [0.60, 0.42], [0.60, 0.445], [0.48, 0.445]], mirror: true, lift: 0.006 }],
      wraps: [{ role: 'lampR', y: [0.76, 0.94], back: [0.80, 0.93], len: 0.16 }],
      plate: 0.69,
    },
  }),
  sedan: () => ({
    front: {
      pods: [
        {
          poly: rrect(-0.29, 0.655, 0.29, 0.865, 0.02, 1), rim: 0.024, h: 0.026, lens: 0.006, rimRole: 'brite', lensRole: 'dark',
          bars: { n: 6, w: 0.012, role: 'brite', dir: 'v' },
        },
        {
          poly: rrect(0.33, 0.675, 0.66, 0.845, 0.012, 1), mirror: true, rim: 0.018, h: 0.022, lens: 0.006,
          rimRole: 'brite', lensRole: 'lampF', lamp: true,
          parts: [{ role: 'dark', poly: rrect(0.49, 0.69, 0.50, 0.83, 0.002, 1) }, { role: 'clear', poly: rrect(0.36, 0.69, 0.475, 0.715, 0.004, 1) }],
        },
        {
          poly: rrect(-0.42, 0.33, 0.42, 0.40, 0.015, 1), rim: 0.012, h: 0.012, lens: 0.003, rimRole: 'body', lensRole: 'dark',
          bars: { n: 1, w: 0.01, role: 'briteDark' },
        },
      ],
      flats: [
        { role: 'dark', poly: rrect(0.50, 0.34, 0.62, 0.39, 0.01, 1), mirror: true, lift: 0.004 },
        { role: 'clear', poly: rrect(0.51, 0.35, 0.61, 0.38, 0.006, 1), mirror: true, lift: 0.008 },
        { role: 'dark', poly: rrect(-0.68, 0.495, 0.68, 0.53, 0.01, 1), lift: 0.006 },
        { role: 'brite', poly: rrect(-0.68, 0.53, 0.68, 0.538, 0.003, 1), lift: 0.007 },
      ],
      wraps: [{ role: 'amber', y: [0.70, 0.80], back: [0.72, 0.79], len: 0.05 }],
      plate: 0.44,
    },
    rear: {
      pods: [
        {
          poly: rrect(0.28, 0.70, 0.725, 0.86, 0.012, 1), mirror: true, rim: 0.016, h: 0.02, lens: 0.005,
          rimRole: 'dark', lensRole: 'lampR', lamp: true, lampAt: [0.62, 0.80],
          parts: [{ role: 'amber', poly: rrect(0.30, 0.715, 0.44, 0.765, 0.004, 1) }, { role: 'clear', poly: rrect(0.45, 0.715, 0.57, 0.765, 0.004, 1) }],
        },
        {
          poly: rrect(-0.27, 0.72, 0.27, 0.85, 0.01, 1), rim: 0.012, h: 0.018, lens: 0.006, rimRole: 'brite', lensRole: 'dark',
          bars: { n: 1, w: 0.012, role: 'brite' },
        },
      ],
      flats: [{ role: 'dark', poly: rrect(0.20, 0.47, 0.68, 0.505, 0.01, 1), mirror: true, lift: 0.006 }],
      wraps: [{ role: 'lampR', y: [0.70, 0.86], back: [0.72, 0.85], len: 0.14 }],
      plate: 0.475,
    },
  }),
  wagon: () => ({
    front: {
      pods: [
        {
          poly: [[0.30, 0.70], [0.67, 0.70], [0.685, 0.835], [0.33, 0.815]], mirror: true, rim: 0.014, h: 0.02, lens: 0.006,
          rimRole: 'dark', lensRole: 'lampF', lamp: true,
          parts: [{ role: 'amber', poly: [[0.60, 0.712], [0.665, 0.712], [0.672, 0.822], [0.605, 0.818]] },
            { role: 'dark', poly: [[0.45, 0.712], [0.458, 0.712], [0.462, 0.82], [0.454, 0.82]] }],
        },
        {
          poly: rrect(-0.27, 0.71, 0.27, 0.815, 0.015, 1), rim: 0.012, h: 0.016, lens: 0.004, rimRole: 'body', lensRole: 'dark',
          bars: { n: 2, w: 0.016, role: 'deep' },
        },
      ],
      plate: 0.4625,
    },
    rear: {
      pods: [
        {
          poly: rrect(0.585, 0.62, 0.705, 0.96, 0.015, 1), mirror: true, rim: 0.012, h: 0.016, lens: 0.005,
          rimRole: 'dark', lensRole: 'lampR', lamp: true,
          parts: [{ role: 'clear', poly: rrect(0.60, 0.635, 0.69, 0.68, 0.006, 1) }, { role: 'amber', poly: rrect(0.60, 0.69, 0.69, 0.74, 0.006, 1) }],
        },
      ],
      flats: [{ role: 'dark', poly: rrect(-0.2, 0.76, 0.2, 0.785, 0.01, 1), lift: 0.006 }],
      plate: 0.66,
    },
  }),
  minivan: () => ({
    front: {
      pods: [
        {
          poly: [[0.31, 0.785], [0.64, 0.765], [0.675, 0.80], [0.678, 0.955], [0.31, 0.93]], mirror: true, rim: 0.016, h: 0.022, lens: 0.006,
          rimRole: 'dark', lensRole: 'clear', lamp: true, lampAt: [0.49, 0.855],
          parts: [{ role: 'lampF', disc: [0.42, 0.855, 0.045, 10] }, { role: 'lampF', disc: [0.55, 0.855, 0.045, 10] },
            { role: 'amber', poly: [[0.62, 0.78], [0.66, 0.775], [0.665, 0.81], [0.622, 0.812]] },
            { role: 'lampF', poly: [[0.33, 0.905], [0.66, 0.925], [0.66, 0.94], [0.33, 0.918]] }],
        },
        {
          poly: rrect(-0.30, 0.785, 0.30, 0.93, 0.02, 1), rim: 0.02, h: 0.024, lens: 0.006, rimRole: 'brite', lensRole: 'dark',
          bars: { n: 3, w: 0.02, role: 'brite' },
        },
        {
          poly: [[-0.42, 0.33], [0.42, 0.33], [0.50, 0.57], [-0.50, 0.57]], rim: 0.022, h: 0.018, lens: 0.004,
          rimRole: 'body', lensRole: 'dark', bars: { n: 4, w: 0.01, role: 'briteDark' },
        },
        {
          poly: rrect(0.54, 0.36, 0.605, 0.60, 0.02, 1), mirror: true, rim: 0.012, h: 0.016, lens: 0.004, rimRole: 'brite', lensRole: 'dark',
          parts: [{ role: 'clear', poly: rrect(0.553, 0.38, 0.592, 0.46, 0.01, 1) }],
        },
      ],
      plate: 0.45,
    },
    rear: {
      pods: [
        {
          poly: rrect(0.54, 0.70, 0.672, 1.06, 0.03, 1), mirror: true, rim: 0.014, h: 0.016, lens: 0.005,
          rimRole: 'dark', lensRole: 'lampR', lamp: true,
          parts: [{ role: 'clear', poly: rrect(0.555, 0.76, 0.657, 0.82, 0.01, 1) }, { role: 'amber', poly: rrect(0.555, 0.83, 0.657, 0.88, 0.01, 1) }],
        },
      ],
      flats: [{ role: 'brite', poly: rrect(-0.25, 0.79, 0.25, 0.815, 0.01, 1), lift: 0.006 },
        { role: 'lampR', poly: [[0.50, 0.46], [0.62, 0.46], [0.62, 0.485], [0.50, 0.485]], mirror: true, lift: 0.006 }],
      plate: 0.69,
    },
  }),
  van: () => ({
    front: {
      pods: [
        {
          poly: rrect(0.40, 0.855, 0.715, 1.00, 0.015, 1), mirror: true, rim: 0.016, h: 0.02, lens: 0.006,
          rimRole: 'body', lensRole: 'lampF', lamp: true,
          parts: [{ role: 'amber', poly: rrect(0.62, 0.87, 0.70, 0.985, 0.006, 1) }, { role: 'dark', poly: rrect(0.52, 0.87, 0.528, 0.985, 0.002, 1) }],
        },
        {
          poly: rrect(-0.37, 0.87, 0.37, 0.985, 0.015, 1), rim: 0.014, h: 0.018, lens: 0.005, rimRole: 'brite', lensRole: 'dark',
          bars: { n: 2, w: 0.014, role: 'briteDark' },
        },
        {
          poly: rrect(-0.52, 0.71, 0.52, 0.80, 0.02, 1), rim: 0.014, h: 0.014, lens: 0.004, rimRole: 'body', lensRole: 'dark',
          bars: { n: 1, w: 0.014, role: 'briteDark' },
        },
      ],
      plate: 0.50,
    },
    rear: {
      pods: [
        {
          poly: rrect(0.585, 0.62, 0.72, 0.96, 0.015, 1), mirror: true, rim: 0.012, h: 0.016, lens: 0.005,
          rimRole: 'dark', lensRole: 'lampR', lamp: true,
          parts: [{ role: 'clear', poly: rrect(0.60, 0.64, 0.705, 0.70, 0.006, 1) }, { role: 'amber', poly: rrect(0.60, 0.72, 0.705, 0.77, 0.006, 1) }],
        },
      ],
      flats: [{ role: 'brite', poly: rrect(-0.2, 0.80, 0.2, 0.822, 0.008, 1), lift: 0.006 }],
      plate: 0.69,
    },
  }),
  boxtruck: () => ({
    front: {
      pods: [
        {
          poly: rrect(0.46, 0.575, 0.70, 0.70, 0.01, 1), mirror: true, rim: 0.014, h: 0.018, lens: 0.006,
          rimRole: 'dark', lensRole: 'lampF', lamp: true,
          parts: [{ role: 'amber', poly: rrect(0.47, 0.585, 0.54, 0.69, 0.004, 1) }],
        },
        {
          poly: rrect(-0.60, 0.84, 0.60, 1.10, 0.02, 1), rim: 0.02, h: 0.02, lens: 0.006, rimRole: 'dark', lensRole: 'dark',
          bars: { n: 5, w: 0.022, role: 'briteDark' },
        },
        { poly: rrect(0.64, 0.98, 0.71, 1.06, 0.01, 1), mirror: true, rim: 0.008, h: 0.012, lens: 0.004, rimRole: 'dark', lensRole: 'amber' },
      ],
      flats: [{ role: 'brite', poly: rrect(-0.62, 1.115, 0.62, 1.13, 0.006, 1), lift: 0.006 }],
      plate: 0.60,
    },
    rear: {},
  }),
  minibus: () => ({
    front: {
      pods: [
        {
          poly: rrect(0.45, 0.85, 0.83, 1.01, 0.015, 1), mirror: true, rim: 0.014, h: 0.02, lens: 0.006,
          rimRole: 'dark', lensRole: 'dark', lamp: true, lampAt: [0.64, 0.93],
          parts: [{ role: 'lampF', poly: rrect(0.48, 0.875, 0.62, 0.985, 0.02, 1) }, { role: 'lampF', poly: rrect(0.645, 0.875, 0.785, 0.985, 0.02, 1) },
            { role: 'amber', poly: rrect(0.798, 0.875, 0.813, 0.985, 0.003, 1) }],
        },
        {
          poly: rrect(-0.42, 0.85, 0.42, 1.03, 0.02, 1), rim: 0.02, h: 0.022, lens: 0.006, rimRole: 'brite', lensRole: 'dark',
          bars: { n: 4, w: 0.016, role: 'brite' },
        },
      ],
      flats: [{ role: 'clear', poly: rrect(0.56, 0.61, 0.67, 0.67, 0.015, 1), mirror: true, lift: 0.006 }],
      plate: 0.635,
    },
    rear: {
      pods: [
        {
          poly: rrect(0.72, 0.80, 0.855, 1.20, 0.02, 1), mirror: true, rim: 0.014, h: 0.016, lens: 0.005,
          rimRole: 'dark', lensRole: 'lampR', lamp: true,
          parts: [{ role: 'clear', poly: rrect(0.735, 0.82, 0.84, 0.88, 0.008, 1) }, { role: 'amber', poly: rrect(0.735, 0.90, 0.84, 0.96, 0.008, 1) }],
        },
      ],
      plate: 0.86,
    },
  }),
};

/* A second pass kind's two ends: the bumpers, then the faces on them and
 * on the body above them, the tailgate's shut line and the exhaust. */
function endsP2(M, s, prof, hw, lamps, ch) {
  const F = FACES[s.kind](s, hw);
  const role = s.bumpers === 'dark' ? 'dark' : (s.bumpers === 'steel' ? 'brite' : 'body');
  const above = (chain, y) => [[chainX(chain, y), y], ...chain.filter((p) => p[1] > y + 1e-4)];
  const fb = bumperLoft(M, s, 1, hw, role);
  ch.front = [...fb, ...above(prof.front, s.nose.bumper + 0.001)];
  endP2(M, s, ch.front, 1, hw, F.front, lamps);
  if (!s.tail) {
    return;
  }
  const rb = bumperLoft(M, s, -1, hw, role);
  ch.rear = [...rb, ...above(prof.rear, s.tail.bumper + 0.001)];
  endP2(M, s, ch.rear, -1, hw, F.rear, lamps);
  const zf = hw - s.cham.n[1] - 0.005;
  const gy = s.tail.bumper + 0.03;
  onEnd(M, 'dark', ch.rear, -1, gy, gy + 0.012, -(zf - 0.2), zf - 0.2, 0.004);
  const L2 = s.L / 2;
  const er = 0.03;
  const ez = -(hw - 0.35);
  const ex = -(L2 + s.tail.face + s.tail.wrap.front) + 0.05;
  _wp.set(ex, s.tail.dam + 0.03, ez);
  _wq.setFromEuler(_we.set(0, -Math.PI / 2, 0));
  M.at(_wm.compose(_wp, _wq, _ws));
  lathe(M, 'brite', er, -0.12, er, 0.02, 10, 1, 0);
  disc(M, 'dark', er * 0.8, 0.021, 10, 1);
  M.at(null);
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

/*
 * THE E82'S COLOURS, by variant: blue first, because blue is the one the
 * owner asked for. A bright mid metallic blue in the manner of the maker's
 * racing blue, lifted into the town's range so its shadow band stays a
 * violet blue rather than going to ink; a deeper blue; a grey blue; a
 * silver; a white. Its wheels are bright alloy in every one.
 */
export const E82_LIVERIES = [
  { name: 'racing blue', body: 0x4675c6 },
  { name: 'deep blue', body: 0x3c5aa2 },
  { name: 'grey blue', body: 0x6c8bb4 },
  { name: 'silver', body: 0xc4c6cc },
  { name: 'white', body: 0xf1efe9 },
];

const LIVERIES = { r32: R32_LIVERIES, e82: E82_LIVERIES };

/* A kind's livery by variant, or null for a kind that takes its colour
 * from its seed like the town's cars. */
export function carLivery(kind, variant) {
  const list = LIVERIES[kind];
  if (!list) {
    return null;
  }
  const v = Math.max(1, Math.round(Number(variant) || 1));
  return list[(v - 1) % list.length];
}

export function r32Livery(variant) {
  return carLivery('r32', variant);
}

function bodyOf(M, s, detail, rimRole) {
  const L2 = s.L / 2;
  /* A second pass body stands its flank a little inside the car's width,
   * so its bumpers and arch lips stand proud of it and not of the solid. */
  const hw = (s.door ?? s.W) / 2 - (s.p2 ? s.lip.proud : 0);
  const lamps = { front: [], rear: [] };
  const box = s.kind === 'boxtruck';

  /* ---- the lower body ---- */
  const prof = box ? truckCabProfile(s) : lowerProfile(s);
  const bumperRole = s.bumpers === 'dark' ? 'dark' : (s.bumpers === 'steel' ? 'brite' : 'body');
  const cap = prism(M, 'body', prof, () => hw, {
    round: true,
    smooth: s.p2 === true,
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
  const ccap = prism(M, 'body', cabPts, (x, y) => hwC(y), {
    round: true, smooth: s.p2 === true, segs: s.p2 ? 3 : 2, edgeRole: (i, ch) => (ch ? 'body' : cabPts[i].edge),
  });

  /* ---- glass ---- */
  const chrome = s.glass.pillars === 'chrome';
  const zs = hwC(s.waist) - 0.015;
  screen(M, [s.cab[1], s.waist], [rf, s.roof], zs, hwC(s.roof) - rc, [1, 1], {
    frame: s.glass.frame, bottom: 0.06, chrome, band: s.glass.band,
    wipers: s.p2 ? [[0.42 * zs, 0.012, -0.3 * zs, 0.06], [-0.26 * zs, 0.012, -0.88 * zs, 0.05]] : null,
  });
  screen(M, [s.cab[0], s.waist], [rr, s.roof], zs, hwC(s.roof) - rc, [-1, 1], {
    frame: s.glass.frame, bottom: s.kind === 'r32' || s.kind === 'sedan' ? 0.05 : 0.08, streaks: [[0.3, 0.14]], chrome, band: s.glass.band,
    wipers: s.rearWiper ? [[0.04, 0.015, 0.62 * zs, 0.04]] : null,
  });
  sideGlass(M, s, ccap, hwC);
  /* Wipers at the screen's foot (the second pass lays them on the glass). */
  for (const z of s.p2 ? [] : [0.3, -0.12]) {
    M.bar('dark', s.cab[1] - 0.02, s.waist + 0.035, s.cab[1] - 0.14, s.waist + 0.1, 0.018, z - 0.25, z + 0.2);
  }

  /* ---- the nose and the tail ---- */
  const zf = hw - s.cham.n[1] - 0.005;
  const ch = { front: prof.front, rear: prof.rear };
  if (s.p2) {
    endsP2(M, s, prof, hw, lamps, ch);
  } else {
    frontEnd(M, s, ch, zf, lamps);
  }
  if (s.tail && !s.p2) {
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
    if (s.rear.diffuser) {
      /* The bumper's lower band in dark, as a sporting bumper has it. */
      onEnd(M, 'dark', ch.rear, -1, s.tail.dam + 0.01, s.tail.dam + 0.13, -(zf - 0.02), zf - 0.02, 0.006);
    }
    if (s.rear.lip) {
      /* A lip along the boot lid's trailing edge. */
      const tx = -L2 - s.tail.face + s.tail.lean;
      slab(M, 'body', [[tx + 0.1, s.tail.edge + 0.012], [tx - 0.01, s.tail.edge + 0.03], [tx - 0.015, s.tail.edge + 0.004]], -(zf - 0.12), zf - 0.12);
    }
    /* The exhaust, low under the bumper: one tip, or twin tips on one side. */
    const tips = s.exhaust ?? 1;
    const er = s.kind === 'r32' ? 0.05 : (tips > 1 ? 0.04 : 0.03);
    for (let k = 0; k < tips; k += 1) {
      const ez = -(hw - 0.35 - k * 0.11);
      const ex = -L2 - s.tail.out + 0.06;
      _wp.set(ex, s.tail.dam + 0.025, ez);
      _wq.setFromEuler(_we.set(0, -Math.PI / 2, 0));
      M.at(_wm.compose(_wp, _wq, _ws));
      lathe(M, 'brite', er, -0.12, er, 0.02, 10, 1, 0);
      disc(M, 'dark', er * 0.8, 0.021, 10, 1);
      M.at(null);
    }
  }

  /* ---- the flanks ---- */
  const A = s.R + s.arch.gap;
  if (s.kind === 'r32') {
    flare(M, s, hw, s.axle[0]);
    flare(M, s, hw, s.axle[1]);
  } else if (s.p2) {
    for (const ax of s.box ? [s.axle[0]] : s.axle) {
      archLipP2(M, s, hw, ax);
    }
  } else if (s.arch.lip) {
    for (const ax of s.axle) {
      archLip(M, s, hw, ax);
    }
  }
  /* The sill: a darker strip from arch to arch. */
  const sillX0 = s.axle[1] + A + 0.02;
  const sillX1 = s.axle[0] - A - 0.02;
  const sillH = s.sillH ?? (s.kind === 'r32' ? 0.08 : 0.06);
  onFlank(M, s.kind === 'r32' ? 'dark' : 'deep', hw, sillX0, s.sill + 0.004, sillX1, s.sill + sillH, 0.004);
  if (s.creases) {
    /* A deep sill's own crease over it, and the kind's lines along the
     * side: each a lit edge over a shadow, which is how a crease reads in
     * the cel ramp at any distance. */
    onFlank(M, 'hi', hw, sillX0 + 0.02, s.sill + sillH, sillX1 - 0.02, s.sill + sillH + 0.014, 0.004);
    for (const [x0, y0, x1, y1, shape] of s.creases) {
      /* A convex line is lit over its shadow, a concave one the other way
       * up: the play of the two is what the flame surfaced side is. */
      const [above, below] = shape === 'concave' ? ['deep', 'hi'] : ['hi', 'deep'];
      polyOnFlank(M, above, hw, [[x0, y0], [x1, y1], [x1, y1 + 0.016], [x0, y0 + 0.016]], 0.005);
      polyOnFlank(M, below, hw, [[x0, y0 - 0.012], [x1, y1 - 0.012], [x1, y1], [x0, y0]], 0.005);
    }
  }
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
  if (s.creases && noseTop - s.cab[1] > 0.8) {
    /* Two lines down the bonnet, converging on the grille. */
    const xa = noseTop - 0.15;
    const xb = s.cab[1] + 0.07;
    const ya = s.nose.edge + 0.022 + ((s.waist + 0.004 - s.nose.edge - 0.022) * (noseTop - 0.12 - xa)) / (noseTop - 0.12 - s.cab[1] - 0.03);
    const yb = s.waist + 0.004 - 0.001;
    for (const side of [1, -1]) {
      const za = side * 0.2;
      const zb = side * 0.33;
      M.face('hi', [[xa, ya + 0.005, za], [xb, yb + 0.005, zb], [xb, yb + 0.005, zb + side * 0.016], [xa, ya + 0.005, za + side * 0.012]], { toward: [0, 1, 0] });
      M.face('deep', [[xa, ya + 0.005, za - side * 0.01], [xb, yb + 0.005, zb - side * 0.012], [xb, yb + 0.005, zb], [xa, ya + 0.005, za]], { toward: [0, 1, 0] });
    }
  }
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
  if (s.p2) {
    /* No bumper in the profile: it is a piece of its own (bumperLoft). */
    P(L2 + n.face - 0.03, n.dam + 0.04, 'n', 'body');
    P(L2 + n.face, n.bumper - 0.03, 'n', 'body');
  } else {
    P(L2 + n.out - n.tuck, n.dam, 'n', 'bumper');
    P(L2 + n.out, n.dam + 0.05, 'n', 'bumper');
    P(L2 + n.out, n.bumper, 'n', 'body');
    P(L2 + n.face, n.bumper + 0.015, 'n', 'body');
  }
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

/* The kei truck's second pass face: its bumper wrapping the corners, the
 * lamps at the corners in painted rims, a black barred grille between
 * them, the plate on the bumper, and a lip on the front arch. */
function keiTruckFrontP2(M, s, hw, front, lamps, arch) {
  const t = {
    ...s,
    nose: { face: -0.005, bumper: 0.575, dam: 0.38, wrap: { rp: [0.07, 0.08], front: 0.045, side: 0.02 } },
    arch: arch.arch, lip: { w: 0.035, proud: 0.012 },
  };
  const fb = bumperLoft(M, t, 1, hw, 'brite');
  const chain = [...fb, [chainX(front, 0.576), 0.576], ...front.filter((p) => p[1] > 0.577)];
  endP2(M, t, chain, 1, hw, {
    pods: [
      {
        poly: rrect(0.37, 0.70, 0.65, 0.86, 0.02, 1), mirror: true, rim: 0.018, h: 0.02, lens: 0.006,
        rimRole: 'body', lensRole: 'lampF', lamp: true, lampAt: [0.47, 0.78],
        parts: [{ role: 'amber', poly: rrect(0.575, 0.716, 0.63, 0.844, 0.006, 1) }, { role: 'dark', poly: rrect(0.47, 0.716, 0.477, 0.844, 0.002, 1) }],
      },
      {
        poly: rrect(-0.31, 0.725, 0.31, 0.835, 0.015, 1), rim: 0.012, h: 0.016, lens: 0.004, rimRole: 'dark', lensRole: 'dark',
        bars: { n: 2, w: 0.014, role: 'briteDark' },
      },
    ],
    plate: 0.47,
  }, lamps);
  archLipP2(M, { ...arch, lip: t.lip }, hw, s.axle[0]);
}

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
  if (s.p2) {
    /* The bumper is a piece of its own (bumperLoft), below. */
    P(L2 - 0.03, 0.42, 0.05, 0.06, 'body');
    P(L2 - 0.005, 0.55, 0.05, 0.06, 'body');
  } else {
    P(L2 + 0.03 - 0.05, 0.38, 0.05, 0.06, 'bumper');
    P(L2 + 0.03, 0.42, 0.05, 0.06, 'bumper');
    P(L2 + 0.03, 0.56, 0.05, 0.06, 'body');
    P(L2 - 0.005, 0.575, 0.05, 0.06, 'body');
  }
  P(L2 - 0.02, 1.0, 0.05, 0.06, 'body');
  const front = prof.slice(f0).map((p) => [p.x, p.y]);
  P(L2 - 0.045, 1.05, 0.04, 0.04, 'body');
  P(L2 - 0.2, s.roof + 0.02, 0.06, 0.06, 'body');
  P(xb + 0.04, s.roof + 0.02, 0.06, 0.06, 'body');
  P(xb, s.roof - 0.06, 0.03, 0.03, 'body');
  const cap = prism(M, 'body', prof, () => hw, {
    smooth: s.p2 === true, edgeRole: (i, ch) => (ch ? 'body' : ({ well: 'dark', under: 'dark', bumper: 'brite' }[prof[i].edge] ?? 'body')),
  });
  /* The roof's lip, a thin cap a touch wider than the cab, where the
   * vendored truck had its own: the one crisp line over the cab. */
  M.box('deep', xb + 0.02, s.roof + 0.005, -(hw + 0.015), L2 - 0.17, s.roof + 0.04, hw + 0.015, '-y');
  /* Glass: the screen on the raked face, the door windows on the flanks. */
  const zs = hw - 0.04;
  screen(M, [L2 - 0.045, 1.05], [L2 - 0.2, s.roof + 0.02], zs, hw - 0.06, [1, 1], {
    frame: 0.06, bottom: 0.05, band: s.p2 ? [0.55, 0.78] : null,
    wipers: s.p2 ? [[0.42 * zs, 0.012, -0.3 * zs, 0.06], [-0.26 * zs, 0.012, -0.88 * zs, 0.05]] : null,
  });
  const dlo = clip(clip(clip(inset(cap, cap.map(() => 0.07)), 0, 1, -1.18), 1, 0, -(xb + 0.12)), -1, 0, L2 - 0.1);
  for (const side of [1, -1]) {
    const lay = (role, poly, lift) => {
      const q = area2(poly) >= 0 ? poly : poly.slice().reverse();
      M.face(role, q.map((p) => [p[0], p[1], side * (hw + lift)]), { toward: [0, 0, side] });
    };
    lay('dark', inset(dlo, dlo.map(() => -0.012)), 0.005);
    const glass = inset(dlo, dlo.map(() => 0.012));
    lay('glass', glass, 0.009);
    if (s.p2) {
      let y0 = Infinity;
      let y1 = -Infinity;
      for (const p of glass) {
        y0 = Math.min(y0, p[1]);
        y1 = Math.max(y1, p[1]);
      }
      lay('band', clip(clip(glass, 0, 1, -(y0 + (y1 - y0) * 0.55)), 0, -1, y0 + (y1 - y0) * 0.78), 0.0105);
    }
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
  if (s.p2) {
    keiTruckFrontP2(M, s, hw, front, lamps, arch);
  }
  for (const side of s.p2 ? [] : [1, -1]) {
    const z0 = side > 0 ? hw - 0.36 : -(hw - 0.08);
    const z1 = side > 0 ? hw - 0.08 : -(hw - 0.36);
    blockOnEnd(M, 'dark', ch.front, 1, 0.7, 0.86, z0 - 0.012, z1 + 0.012, 0.016);
    const lz0 = side > 0 ? z0 : z0 + 0.07;
    const lz1 = side > 0 ? z1 - 0.07 : z1;
    onEnd(M, 'lampF', ch.front, 1, 0.712, 0.848, lz0, lz1, 0.02);
    onEnd(M, 'amber', ch.front, 1, 0.712, 0.848, side > 0 ? z1 - 0.062 : z0, side > 0 ? z1 : z0 + 0.062, 0.02);
    lamps.front.push([L2 + 0.03, 0.78, side * (hw - 0.22)]);
  }
  if (!s.p2) {
    blockOnEnd(M, 'dark', ch.front, 1, 0.74, 0.82, -(hw - 0.42), hw - 0.42, 0.01);
    plate(M, ch.front, 1, 0.47);
  }
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
    if (s.p2) {
      /* On the housing's face, a bright bezel, the tail lamp over the
       * amber. */
      const rc = [[-L2 - 0.02, 0.5], [-L2 - 0.02, 0.9]];
      onEndPoly(M, 'briteDark', rc, -1, rrect(z - 0.118, 0.63, z + 0.118, 0.75, 0.014, 1), 0.003);
      onEndPoly(M, 'lampR', rc, -1, rrect(z - 0.104, 0.668, z + 0.104, 0.738, 0.01, 1), 0.006);
      onEndPoly(M, 'amber', rc, -1, [[z - 0.104, 0.642], [z + 0.104, 0.642], [z + 0.104, 0.66], [z - 0.104, 0.66]], 0.006);
    } else {
      M.face('lampR', [[-L2 - 0.022, 0.66, z + 0.11], [-L2 - 0.022, 0.66, z - 0.11], [-L2 - 0.022, 0.74, z - 0.11], [-L2 - 0.022, 0.74, z + 0.11]], { toward: [-1, 0, 0] });
      M.face('amber', [[-L2 - 0.022, 0.635, z + 0.11], [-L2 - 0.022, 0.635, z - 0.11], [-L2 - 0.022, 0.655, z - 0.11], [-L2 - 0.022, 0.655, z + 0.11]], { toward: [-1, 0, 0] });
    }
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

const NO_CAST = new Set(['glass', 'band', 'glint', 'lampF', 'lampR', 'amber', 'clear', 'plate']);
const ORDER = ['body', 'body2', 'stripe', 'accent', 'hi', 'deep', 'dark', 'brite', 'briteDark', 'rim', 'bed', 'crate', 'crate2', 'sheet', 'rope', 'glass', 'band', 'glint', 'lampF', 'lampR', 'amber', 'clear', 'plate'];

/*
 * One car at the origin, nose along +x, as a Group of one mesh a material.
 *
 *   o.kind     a MODEL key; anything else is a kei
 *   o.color    the body colour (a CAR value); the r32 takes its livery
 *   o.variant  the r32's and the e82's livery, by number (carLivery),
 *              unless o.livery
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
  const livery = LIVERIES[kind] ? (o.livery ?? carLivery(kind, o.variant)) : null;
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
    band: m.band,
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
  if (s.creases) {
    /* The lit edge of a crease: the paint a shade toward white. */
    matFor.hi = paint(new THREE.Color(col).lerp(new THREE.Color(0xffffff), 0.35).getHex());
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
