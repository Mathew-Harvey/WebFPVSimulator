/*
 * herocraft.js: the 5 inch airframe, for the settings studio and the world.
 *
 * Same published dimensions and motor order as the plant: RR FR RL FL, front
 * at -z, 220 mm diagonal, 5 inch discs. src/render/craft.js is the session
 * wrapper that names it, scales it into the world, and keeps the body box
 * and prop discs as direct children so check 15 can still measure it.
 * Settings passes `lite` so the overlay skips outline hulls and shadow
 * casters; the world craft stays full, including on the title flythrough.
 *
 * WHAT IT IS A MODEL OF. A built freestyle five inch, the way one looks on a
 * bench: a carbon bottom plate with four separate arms bolted to it, a top
 * plate on four anodised standoffs, a 30.5 mm ESC and flight controller
 * stacked on grommets between them, a micro camera pivoting in printed TPU
 * cheeks at the nose, 2306 motors with their windings showing through the
 * bell, triblade props with real twist, a pack strapped under the frame on
 * a grip pad, the XT60 lead and its capacitor out of the back, and the
 * video antenna in a printed mount at the rear. It used to be a box sketch
 * of that: box plates, box arms, a box pack, a faceted pink dome where the
 * camera cage goes and four ghostly coins for props.
 *
 * HOW IT STAYS CHEAP. Every part that does not move is merged, by FINISH
 * rather than by colour: one mesh for everything matte (carbon, the pack,
 * the boards, the wires), one for the machined metal, one for the printed
 * TPU, one for vinyl, each wearing its colours as vertex colours over a
 * white cel material. A part costs triangles, not a draw call, so the
 * screws and the zip ties are close to free. What stays a mesh of its own
 * is what something else drives: the four rotors and the camera, which the
 * shell turns; the four discs and the four lamps, whose materials it
 * fades and colours; the windings, whose glow the studio warms; the glass,
 * which no finish shares; and the antenna, which scripts/craft-check.js
 * leaves out of the measured machine by its name. Twenty one meshes and
 * four ink shells where there were sixty five and sixteen. The triangle
 * counts, before and after, are in PROGRESS.md.
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
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { celMaterial } from './celmat.js';
import { tintMaterial } from './livery.js';
import { CRAFT_ARM, CRAFT_PROP_R } from '../game/collide.js';
import { WORLD_SCALE } from './frame.js';
import { CAMERA_MOUNT_FORWARD, CAMERA_MOUNT_UP } from './lens.js';

const MOTOR_ARM = CRAFT_ARM / Math.SQRT2;

/*
 * THE HEIGHTS, bottom to top, in the craft frame (y up, metres from the CG).
 *
 * Two of them are not free. The strap under the pack is the lowest thing the
 * model draws and it sits at exactly 30.0 mm under the CG, because
 * scripts/craft-check.js pins the gap between the drawn underside and the
 * plant's contact hull at the 15 mm it measured before this model existed:
 * draw it lower and the parked quad sinks into the grass, draw it higher
 * and that check fails, both correctly. And nothing but the antenna may
 * stand higher than the 39.6 mm the old canopy reached, which the same
 * script holds against the collider's 38 mm roof. The rotor plane came down
 * to where a real 2306 on a 5.5 mm arm puts it, so the tallest drawn part is
 * now the prop nut, a few millimetres under that line.
 */
const STRAP_FLOOR = -0.0300;
const PACK_Y0 = -0.0288;
const PACK_Y1 = -0.0060;
const PLATE_Y0 = -0.0045;
const PLATE_Y1 = -0.0020;
const ARM_Y1 = 0.0035;
const TOP_Y0 = 0.0215;
const TOP_Y1 = 0.0240;
const BASE_Y1 = 0.0060;
const BELL_Y0 = 0.0080;
const RING_Y0 = 0.0192;
const BELL_Y1 = 0.0218;
const CAP_Y1 = 0.0230;
const ROTOR_Y = 0.0266;
/* The stack's centre, a little behind the CG, where the old boards were. */
const STACK_Z = 0.004;
/* Where along its diagonal an arm starts, and how wide it is there, at the
 * neck behind the motor, and around the motor. */
const ARM_ROOT = 0.0262;
const ARM_W_ROOT = 0.0105;
const ARM_W_NECK = 0.0078;
const ARM_PAD_R = 0.0142;

/*
 * THE PALETTE. Same one the page and the board paint in CSS: forest carbon,
 * cream vinyl, sakura chrome, mint for a live lamp. Named here once, as
 * colours, because most of the model wears them as vertex colours over a
 * shared finish rather than as a material each.
 *
 * Sakura is the chrome: the camera cage and the antenna mount (printed
 * TPU), the standoffs and the top of every motor bell (anodised), the
 * grommets, and the front props, so the airframe still reads as the
 * wordmark and a pilot can still tell its nose from its tail at fifty
 * metres. It used to be one faceted dome over the camera, which read as a
 * pink blob from every angle and is not a part a five inch carries.
 */
const C = {
  carbon: 0x1c241e,
  carbonEdge: 0x2a342c,
  carbonDeep: 0x121810,
  livery: 0xe8dcc0,
  sakura: 0xe8a8b8,
  sakuraDeep: 0xc47888,
  mint: 0x7dffb4,
  bell: 0x4a534d,
  steel: 0xbcb4a2,
  darkSteel: 0x3a423c,
  motorBase: 0x262e28,
  pcb: 0x2a4a38,
  pcbDeep: 0x223e2e,
  chip: 0x141a16,
  pack: 0x161c18,
  grip: 0x0c100e,
  strap: 0x2c3830,
  wire: 0x161c18,
  wireRed: 0xc0483c,
  xt60: 0xe8c04a,
  capacitor: 0x1e2c2a,
  camBody: 0x141c16,
  camRing: 0x3a4440,
  bezel: 0xb8b09e,
  propFront: 0xe890a8,
  propFrontTip: 0xf8d8e0,
  propRear: 0x4a554c,
  propRearTip: 0xb4beb0,
  copper: 0xb4703c,
  ink: 0x0c120e,
  inkWarm: 0x1a1214,
};

/*
 * PLACING A PART, by hand over its arrays.
 *
 * The model is a hundred and fifty parts, built when the page boots, and at
 * boot every function here and in three.js runs cold, in the interpreter,
 * where a call costs more than the arithmetic inside it. three.js moves a
 * vertex through several calls (read it out, multiply, write it back), all
 * over again for each of rotateX, rotateY, rotateZ and translate, and
 * BufferGeometry.clone() starts by building a throwaway default part of the
 * same kind, a 32 sided cylinder or a bevelled extrusion of a unit square,
 * only to copy over it. In a CPU profile of a cold build in Node, cloning
 * held a fifth of the samples and turning the plates a seventh. So a part
 * is turned and moved here in one pass with no calls in it. That bought
 * less than the profile promised, a profile being slower than the code it
 * watches: a sixth or so of a cold build, measured without one.
 *
 * Turning about x, then y, then z is the matrix Rz Ry Rx, which three.js
 * calls the Euler order ZYX. `turn` reads n vectors from `src`, through
 * `index` when there is one, and writes them turned, and moved by (x, y, z),
 * to `dst`, which may be `src` itself when there is no index. A normal is
 * turned, not moved, and comes out unit length.
 */
const placeEuler = new THREE.Euler();
const placeMatrix = new THREE.Matrix4();
function turn(dst, src, index, n, e, x, y, z, unit) {
  for (let i = 0; i < n; i += 1) {
    const v = (index ? index[i] : i) * 3;
    const px = src[v];
    const py = src[v + 1];
    const pz = src[v + 2];
    let ox = e[0] * px + e[4] * py + e[8] * pz;
    let oy = e[1] * px + e[5] * py + e[9] * pz;
    let oz = e[2] * px + e[6] * py + e[10] * pz;
    if (unit) {
      const l = Math.sqrt(ox * ox + oy * oy + oz * oz) || 1;
      ox /= l;
      oy /= l;
      oz /= l;
    }
    dst[i * 3] = ox + x;
    dst[i * 3 + 1] = oy + y;
    dst[i * 3 + 2] = oz + z;
  }
}

/* A part turned by the matrix elements `e` and moved by (x, y, z) where it
 * lies, for a part built once and used once: a plate, the bezel. */
function transformInPlace(geo, e, x, y, z) {
  const p = geo.getAttribute('position');
  turn(p.array, p.array, null, p.count, e, x, y, z, false);
  const nrm = geo.getAttribute('normal');
  if (nrm) {
    turn(nrm.array, nrm.array, null, nrm.count, e, 0, 0, 0, true);
  }
  return geo;
}

/* Turned about x, then y, then z, then moved. */
function moveInPlace(geo, x, y, z, rx = 0, ry = 0, rz = 0) {
  const e = placeMatrix.makeRotationFromEuler(placeEuler.set(rx, ry, rz, 'ZYX')).elements;
  return transformInPlace(geo, e, x, y, z);
}

/* Lifted `lift` up its own y, stood up along the unit vector `dir`, then
 * moved: a part built standing on its axis, leaned to where it goes, as the
 * antenna mast is. The lift turns with the part, so it is added as the
 * turned y axis, which is the matrix's second column. */
const standQuat = new THREE.Quaternion();
const standUp = new THREE.Vector3(0, 1, 0);
function standInPlace(geo, lift, dir, x, y, z) {
  const e = placeMatrix.makeRotationFromQuaternion(standQuat.setFromUnitVectors(standUp, dir)).elements;
  return transformInPlace(geo, e, x + e[4] * lift, y + e[5] * lift, z + e[6] * lift);
}

/* A copy of a part, turned and moved, for a part built once and used many
 * times: an arm, a bell, a screw. The copy is ready to merge, with no index,
 * no uv and no groups (see paint below), so making it so costs nothing more.
 * Every other attribute, a blade's colours, is carried across unchanged. */
function place(geo, x, y, z, rx = 0, ry = 0, rz = 0) {
  const e = placeMatrix.makeRotationFromEuler(placeEuler.set(rx, ry, rz, 'ZYX')).elements;
  const index = geo.index ? geo.index.array : null;
  const n = index ? index.length : geo.getAttribute('position').count;
  const out = new THREE.BufferGeometry();
  for (const name of Object.keys(geo.attributes)) {
    if (name === 'uv') {
      continue;
    }
    const a = geo.getAttribute(name);
    const size = a.itemSize;
    const d = new Float32Array(n * size);
    if (name === 'position') {
      turn(d, a.array, index, n, e, x, y, z, false);
    } else if (name === 'normal') {
      turn(d, a.array, index, n, e, 0, 0, 0, true);
    } else {
      for (let i = 0; i < n; i += 1) {
        const v = (index ? index[i] : i) * size;
        for (let k = 0; k < size; k += 1) {
          d[i * size + k] = a.array[v + k];
        }
      }
    }
    out.setAttribute(name, new THREE.BufferAttribute(d, size));
  }
  return out;
}

/*
 * One colour on every vertex of a part, and the part made mergeable with
 * every other: no index, no uv, no groups. mergeGeometries refuses to mix
 * indexed and unindexed geometry, and an ExtrudeGeometry is unindexed while
 * a box or a cylinder is not, so they all go unindexed here. Colour goes
 * through THREE.Color so it is converted to the working space exactly as a
 * material's `color` is, which is what keeps a vertex coloured part the
 * same colour the old one material per part model painted it.
 */
const tint = new THREE.Color();
function paint(geo, hex, flat = false) {
  /* uv goes first: unindexing copies every attribute, and nothing here
   * reads one. */
  geo.deleteAttribute('uv');
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.clearGroups();
  if (flat) {
    /* Unindexed, every face owns its vertices, so this gives each face its
     * own normal: a knurled ring or a hex nut that shades as facets. */
    g.computeVertexNormals();
  }
  tint.setHex(hex);
  const n = g.getAttribute('position').count;
  const rgb = new Float32Array(n * 3);
  for (let i = 0; i < n; i += 1) {
    rgb[i * 3] = tint.r;
    rgb[i * 3 + 1] = tint.g;
    rgb[i * 3 + 2] = tint.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(rgb, 3));
  return g;
}

/*
 * A cylinder with only the ends that can be seen. Most round parts here
 * stand on something or are capped by something, a standoff between the
 * plates, a grommet between the boards, a screw head against the arm, and
 * three.js draws both ends of every cylinder whether or not anything could
 * ever see them. `ends` says which to keep: 'both', 'top', 'bottom' or
 * 'none'. CylinderGeometry groups its index as the side (material 0), the
 * top (1) and the bottom (2), so dropping an end is dropping its group.
 */
function cyl(rTop, rBottom, h, seg, ends = 'both') {
  const g = new THREE.CylinderGeometry(rTop, rBottom, h, seg, 1, ends === 'none');
  if (ends === 'top' || ends === 'bottom') {
    const drop = ends === 'top' ? 2 : 1;
    const idx = g.index.array;
    const keep = [];
    for (const grp of g.groups) {
      if (grp.materialIndex !== drop) {
        for (let i = grp.start; i < grp.start + grp.count; i += 1) {
          keep.push(idx[i]);
        }
      }
    }
    g.setIndex(keep);
    g.clearGroups();
  }
  return g;
}

/*
 * THE STUDIO LIFT, for lite only. The Settings studio (showcase.js) draws
 * the lite build with no ink pass, on a backdrop of 0x1a241c, and lit
 * carbon there measured (28, 31, 19) to (35, 45, 36) against a backdrop of
 * (26, 36, 28): the same colour, so the frame was not drawn at all and the
 * aircraft was its pink parts floating. A stronger rim did not help, since
 * the rim lights only what turns away from the eye and an arm's top faces
 * it. So a dark colour is lifted: its brightest channel gains up to 48
 * levels, less the brighter it already is and none from 80 up, and the
 * other two are scaled with it, which keeps the hue and keeps the order
 * (the grip still darker than the pack, the pack than the carbon). Lite is
 * drawn by the studio and the ghost, and the ghost replaces every material
 * and ignores vertex colour, so this reaches the studio and nothing else.
 */
function studioLift(hex) {
  const r = (hex >> 16) & 255;
  const g = (hex >> 8) & 255;
  const b = hex & 255;
  const top = Math.max(r, g, b, 1);
  if (top >= 80) {
    return hex;
  }
  const k = (top + 48 * (1 - top / 80)) / top;
  const ch = (v) => Math.min(255, Math.round(v * k));
  return (ch(r) << 16) | (ch(g) << 8) | ch(b);
}

/* A rounded rectangle, as a path, for plates, the pack and the cutouts. */
function roundRect(path, x0, y0, x1, y1, r) {
  path.moveTo(x0 + r, y0);
  path.lineTo(x1 - r, y0);
  path.quadraticCurveTo(x1, y0, x1, y0 + r);
  path.lineTo(x1, y1 - r);
  path.quadraticCurveTo(x1, y1, x1 - r, y1);
  path.lineTo(x0 + r, y1);
  path.quadraticCurveTo(x0, y1, x0, y1 - r);
  path.lineTo(x0, y0 + r);
  path.quadraticCurveTo(x0, y0, x0 + r, y0);
  return path;
}

/*
 * A flat part cut from sheet, lying in the craft's plan view, y0 to y1 thick.
 *
 * The shape is drawn in plan with its y axis pointing FORWARD, which is -z
 * in the craft frame, so a shape's numbers read as "how far forward". The
 * bevel is inset (bevelOffset is minus its size) so the footprint is the
 * outline exactly and the chamfer comes out of the part rather than being
 * added round it: a chamfered plate is the same size as a square edged one.
 * The chamfer is the point. It is what catches the cel spec band and the
 * rim light on a carbon edge, which is most of what makes a dark plate
 * read as machined rather than as a slab.
 */
function slab(shape, y0, y1, bev, curveSegments, bevelSegments = 1) {
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.00001, y1 - y0 - 2 * bev),
    bevelEnabled: bev > 0,
    bevelThickness: bev,
    bevelSize: bev,
    bevelOffset: -bev,
    bevelSegments,
    curveSegments,
  });
  return moveInPlace(geo, 0, y0 + bev, 0, -Math.PI / 2);
}

/*
 * A wire: a tube along a smooth curve through `points`, `rings` rings long.
 * TubeGeometry spaces its rings by arc length, and a curve measures its own
 * length the first time it is asked, with two hundred samples unless it is
 * told otherwise: two hundred points on the curve worked out for a tube of
 * five rings, which made the wiring one of the costliest things in the model
 * to build. Sixty four samples put every ring within nine micrometres of
 * where two hundred did. Twenty four were no faster that a cold build could
 * measure, and moved a ring by a seventh of a millimetre.
 */
function tubeAlong(points, rings, radius, sides) {
  const path = new THREE.CatmullRomCurve3(points);
  path.arcLengthDivisions = 64;
  return new THREE.TubeGeometry(path, rings, radius, sides, false);
}

/*
 * THE INK SHELL, an inverted hull that is the same thickness everywhere.
 *
 * celmat.js's outlineHull scales a copy of the mesh about the mesh's own
 * origin, which is exactly right for a part built round its own centre and
 * wrong for a merged one: a merged frame's origin is the CG, so a 1.07 hull
 * puts 7 mm of ink beyond the end of an arm and almost none down its sides.
 * That is the reason the old model kept every arm and every bell a mesh of
 * its own, and paid a draw call and a hull for each.
 *
 * This pushes each vertex out along the MITRE of the faces that meet at it
 * instead, so every face of every merged part moves out by `width`, and a
 * box corner stays a corner rather than going round. Vertices are welded by
 * position to find their faces, because an unindexed geometry has a copy of
 * a corner for each face that shares it, and offsetting the copies along
 * their own face normals would open the shell at every edge.
 *
 * The shell keeps the part's own face normals. post.js's ink prepass draws
 * every mesh with one override material, hulls included, so the shell is
 * what the edge pass sees: with the part's normals it finds the same creases
 * the part has, and a smoothed shell would erase them. It is marked with
 * hullColor exactly as outlineHull marks its own, so scripts/craft-check.js
 * leaves it out of the measured machine for the same reason: it is paint.
 *
 * `src` is the geometry the shell is grown from, which need not be the
 * mesh's own: a finish merges the screws and the wires with the plates, and
 * a shell round a screw is a hundred triangles drawn twice (once here, once
 * in post.js's prepass) for a line nobody can see. So each finish keeps a
 * second, smaller merge of just the parts that make the silhouette, and the
 * shell is grown from that.
 *
 * Exported because src/render/whoopcraft.js inks the whoop with it. The weld
 * reads the position array three vertices to a triangle, so `src` must be
 * unindexed: herocraft's parts are, and the whoop's primitives are made so
 * on their way in.
 */
export function inkShell(mesh, width, color, fog, src = mesh.geometry) {
  const pos = src.getAttribute('position');
  const p = pos.array;
  const n = pos.count;
  /* Weld to 5 micrometres. The key is one integer per position and a face
   * normal is three numbers in a flat list: the first version made a string
   * for every vertex and a vector for every face, garbage the size of the
   * model made at boot, and this one makes none. */
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < n * 3; i += 1) {
    const q = Math.round(p[i] * 2e5);
    lo = Math.min(lo, q);
    hi = Math.max(hi, q);
  }
  const base = hi - lo + 1;
  if (base * base * base > Number.MAX_SAFE_INTEGER) {
    throw new Error('herocraft: an ink shell too big to weld');
  }
  const id = new Int32Array(n);
  const seen = new Map();
  for (let i = 0; i < n; i += 1) {
    const key = ((Math.round(p[i * 3] * 2e5) - lo) * base
      + (Math.round(p[i * 3 + 1] * 2e5) - lo)) * base
      + (Math.round(p[i * 3 + 2] * 2e5) - lo);
    let k = seen.get(key);
    if (k === undefined) {
      k = seen.size;
      seen.set(key, k);
    }
    id[i] = k;
  }
  /* The distinct face normals at each welded vertex, flat, three numbers
   * a normal. */
  const faces = Array.from({ length: seen.size }, () => []);
  for (let t = 0; t + 2 < n; t += 3) {
    const o = t * 3;
    const ux = p[o + 3] - p[o];
    const uy = p[o + 4] - p[o + 1];
    const uz = p[o + 5] - p[o + 2];
    const vx = p[o + 6] - p[o];
    const vy = p[o + 7] - p[o + 1];
    const vz = p[o + 8] - p[o + 2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-12) {
      continue;
    }
    nx /= len;
    ny /= len;
    nz /= len;
    for (let k = 0; k < 3; k += 1) {
      const list = faces[id[t + k]];
      let dup = false;
      for (let j = 0; j < list.length; j += 3) {
        if (list[j] * nx + list[j + 1] * ny + list[j + 2] * nz > 0.996) {
          dup = true;
          break;
        }
      }
      if (!dup) {
        list.push(nx, ny, nz);
      }
    }
  }
  const push = new Float64Array(seen.size * 3);
  for (let v = 0; v < faces.length; v += 1) {
    const list = faces[v];
    if (list.length === 0) {
      continue;
    }
    let mx = 0;
    let my = 0;
    let mz = 0;
    for (let j = 0; j < list.length; j += 3) {
      mx += list[j];
      my += list[j + 1];
      mz += list[j + 2];
    }
    if (mx * mx + my * my + mz * mz < 1e-10) {
      mx = list[0];
      my = list[1];
      mz = list[2];
    }
    const ml = Math.hypot(mx, my, mz);
    mx /= ml;
    my /= ml;
    mz /= ml;
    let least = 1;
    for (let j = 0; j < list.length; j += 3) {
      least = Math.min(least, mx * list[j] + my * list[j + 1] + mz * list[j + 2]);
    }
    /* Clamped, so a needle sharp vertex gets a spike three widths long and
     * not one a metre long. */
    const s = width / Math.max(least, 0.34);
    push[v * 3] = mx * s;
    push[v * 3 + 1] = my * s;
    push[v * 3 + 2] = mz * s;
  }
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i += 1) {
    const v = id[i] * 3;
    out[i * 3] = p[i * 3] + push[v];
    out[i * 3 + 1] = p[i * 3 + 1] + push[v + 1];
    out[i * 3 + 2] = p[i * 3 + 2] + push[v + 2];
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(out, 3));
  geo.setAttribute('normal', src.getAttribute('normal').clone());
  const hull = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ color, side: THREE.BackSide, fog }),
  );
  hull.material.userData.hullColor = color;
  hull.castShadow = false;
  hull.receiveShadow = false;
  mesh.add(hull);
  return mesh;
}

/*
 * A five inch triblade, lofted rather than extruded.
 *
 * The old blade was a flat outline extruded 1.7 mm and laid in the disc
 * plane, which is a propeller with no pitch: a fan cut from card. A real
 * 5 inch has about 4.3 inches of geometric pitch, so its blade is steep at
 * the root and nearly flat at the tip, and that twist is the thing the eye
 * reads as "propeller". So each blade is a run of airfoil sections out
 * along the span, each one turned to the angle a 4.3 inch helix has at its
 * radius (capped near the hub, where the true angle passes 60 degrees and
 * the hub hides it anyway), with a flat bottomed section that is thickest a
 * third of the way back, a mid chord that sweeps back toward the tip, and a
 * rounded tip.
 *
 * THE TWIST HAS A HAND. A prop that spins counter clockwise seen from above
 * leads with the edge on its +x side at the blade that points to +z, and a
 * blade lifts when the edge it leads with is the higher one, so the two
 * hands are mirror images. `dir` is the rotor's PROP_SPIN, the same number
 * the shell spins the rotor by, so a rotor can never be drawn with the
 * pitch of the other hand.
 *
 * Station rows: radius, chord, sweep of the mid chord toward the trailing
 * edge, thickness. All metres. The tip band starts at 0.0555, which is where
 * the colour changes: the last tenth of a blade is the part that draws the
 * ring a spinning prop leaves, so it is painted lighter, the way a lot of
 * real props are. The two rows either side of that line are a millimetre
 * apart so the colour changes there rather than fading over a centimetre.
 * The station at 12 mm is narrower than a real blade is there on purpose:
 * it is over the bell, and at the capped pitch a wider chord puts its
 * trailing edge into the bell's top. From 22 mm out the blade is clear of
 * the motor and takes its full width.
 *
 * The section is four points, leading edge, crown, trailing edge and belly,
 * with the normals smoothed round it. At a millimetre and a half thick that
 * shades as an airfoil from any distance the chase camera gets to, and a
 * finer one was twice the triangles for nothing a picture could show.
 */
const BLADE_ROWS = [
  [0.0050, 0.0074, 0.0000, 0.0016],
  [0.0120, 0.0120, 0.0003, 0.0016],
  [0.0220, 0.0146, 0.0009, 0.0014],
  [0.0340, 0.0140, 0.0017, 0.0012],
  [0.0460, 0.0118, 0.0025, 0.0010],
  [0.0548, 0.0095, 0.0030, 0.0009],
  [0.0560, 0.0091, 0.0031, 0.0009],
  [0.0604, 0.0066, 0.0034, 0.0008],
  [0.0625, 0.0022, 0.0034, 0.0006],
];
const BLADE_ROWS_LITE = [0, 2, 4, 6, 8].map((i) => BLADE_ROWS[i]);
const BLADE_TIP_START = 0.0555;
/* 4.3 inches of geometric pitch, and the steepest the root is drawn. */
const BLADE_PITCH = 0.109;
const BLADE_PITCH_CAP = 0.60;

function bladeGeometry(rows, dir, bodyHex, tipHex) {
  /* Chord stations, leading edge (0) to trailing edge (1), and the section's
   * top and bottom at each, as a fraction of the thickness: the crown a
   * third of the way back, the belly nearly flat. */
  const us = [0, 0.33, 1];
  const top = [0, 1.0, 0];
  const bot = [0, -0.25, 0];
  const ringLen = us.length * 2 - 2;
  const positions = [];
  const colours = [];
  const body = new THREE.Color(bodyHex);
  const tip = new THREE.Color(tipHex);
  for (const [s, chord, sweep, thick] of rows) {
    const phi = Math.min(BLADE_PITCH_CAP, Math.atan2(BLADE_PITCH, 2 * Math.PI * s));
    const cs = Math.cos(phi);
    const sn = Math.sin(phi);
    const ring = [];
    /* Round the section: leading edge, along the top to the trailing edge,
     * and back along the bottom. */
    for (let k = 0; k < us.length; k += 1) {
      ring.push([us[k], top[k]]);
    }
    for (let k = us.length - 2; k > 0; k -= 1) {
      ring.push([us[k], bot[k]]);
    }
    const col = s >= BLADE_TIP_START ? tip : body;
    for (const [u, h] of ring) {
      const p = chord * (0.5 - u) - sweep;
      const y = h * thick;
      const xr = p * cs - y * sn;
      const yr = p * sn + y * cs;
      positions.push(dir * xr, yr, s);
      colours.push(col.r, col.g, col.b);
    }
  }
  const index = [];
  const flip = dir < 0;
  const tri = (i, j, k) => {
    if (flip) {
      index.push(i, k, j);
    } else {
      index.push(i, j, k);
    }
  };
  for (let r = 0; r + 1 < rows.length; r += 1) {
    for (let k = 0; k < ringLen; k += 1) {
      const a0 = r * ringLen + k;
      const b0 = r * ringLen + ((k + 1) % ringLen);
      const a1 = a0 + ringLen;
      const b1 = b0 + ringLen;
      tri(a0, b0, b1);
      tri(a0, b1, a1);
    }
  }
  /* Close the tip with a fan from the last section's middle. The root is
   * left open: it is inside the hub. */
  const last = (rows.length - 1) * ringLen;
  let cx = 0;
  let cy = 0;
  for (let k = 0; k < ringLen; k += 1) {
    cx += positions[(last + k) * 3];
    cy += positions[(last + k) * 3 + 1];
  }
  const centre = positions.length / 3;
  positions.push(cx / ringLen, cy / ringLen, rows[rows.length - 1][0] + 0.0004);
  colours.push(tip.r, tip.g, tip.b);
  for (let k = 0; k < ringLen; k += 1) {
    tri(centre, last + k, last + ((k + 1) % ringLen));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  const out = geo.toNonIndexed();
  geo.dispose();
  return out;
}

/*
 * One rotor: three blades, the hub they are moulded into, and the prop nut.
 * All of it spins together, so it is one mesh, one draw, per rotor.
 */
function rotorGeometry(dir, front, lite) {
  const bodyHex = front ? C.propFront : C.propRear;
  const tipHex = front ? C.propFrontTip : C.propRearTip;
  const seg = lite ? 8 : 12;
  const parts = [];
  const blade = bladeGeometry(lite ? BLADE_ROWS_LITE : BLADE_ROWS, dir, bodyHex, tipHex);
  for (let b = 0; b < 3; b += 1) {
    parts.push(place(blade, 0, 0, 0, 0, (b * Math.PI * 2) / 3, 0));
  }
  blade.dispose();
  /* The hub, bottom to top, so LatheGeometry faces outward. Its underside
   * sits a tenth of a millimetre over the bell's cap and is never seen, so
   * the profile starts at the hub's bottom edge rather than its axis. */
  const hub = new THREE.LatheGeometry([
    new THREE.Vector2(0.0062, -0.0035),
    new THREE.Vector2(0.0065, 0.0026),
    new THREE.Vector2(0.0050, 0.0035),
    new THREE.Vector2(0.0001, 0.0035),
  ], seg);
  parts.push(paint(hub, bodyHex));
  /* The M5 lock nut: a hex, faceted, with its nylon dome. */
  parts.push(paint(place(cyl(0.0040, 0.0040, 0.0034, 6, 'top'), 0, 0.0052, 0), C.steel, true));
  parts.push(paint(place(cyl(0.0024, 0.0033, 0.0013, lite ? 6 : 8, 'top'), 0, 0.00755, 0), C.steel));
  const geo = mergeGeometries(parts, false);
  for (const p of parts) {
    p.dispose();
  }
  if (!geo) {
    throw new Error('herocraft: rotor merge failed');
  }
  return geo;
}

/*
 * The arm, in its own frame: across is x, up is y, and it runs out along -z
 * from ARM_ROOT to the motor at CRAFT_ARM, a 5.5 mm carbon blade that
 * narrows to a neck and ends in a round pad the motor bolts to. The chamfer
 * on its top edges is what makes it read as cut carbon from the chase
 * camera.
 */
function armShape() {
  const s = new THREE.Shape();
  const a = CRAFT_ARM;
  const neck = a - Math.sqrt(ARM_PAD_R * ARM_PAD_R - ARM_W_NECK * ARM_W_NECK);
  const t1 = Math.atan2(neck - a, -ARM_W_NECK);
  const t2 = Math.atan2(neck - a, ARM_W_NECK);
  s.moveTo(-ARM_W_ROOT, ARM_ROOT);
  s.lineTo(-ARM_W_NECK, neck);
  s.absarc(0, a, ARM_PAD_R, t1, t2, true);
  s.lineTo(ARM_W_ROOT, ARM_ROOT);
  s.lineTo(-ARM_W_ROOT, ARM_ROOT);
  return s;
}

/* Half the arm's width at a distance u along it, for the zip ties. */
function armHalfWidth(u) {
  const neck = CRAFT_ARM - Math.sqrt(ARM_PAD_R * ARM_PAD_R - ARM_W_NECK * ARM_W_NECK);
  const k = Math.min(1, Math.max(0, (u - ARM_ROOT) / (neck - ARM_ROOT)));
  return ARM_W_ROOT + (ARM_W_NECK - ARM_W_ROOT) * k;
}

/* A point in an arm's frame, into the craft's: across, up, and out along
 * the arm, turned by the arm's yaw. */
function armPoint(psi, across, y, u) {
  const c = Math.cos(psi);
  const s = Math.sin(psi);
  return new THREE.Vector3(across * c - u * s, y, -across * s - u * c);
}

/*
 * Props-in as seen from above: RR and FL clockwise, FR and RL counter
 * clockwise. Right-hand rotation about +Y is counter clockwise, so clockwise
 * is a negative spin.
 */
export const PROP_SPIN = [-1, 1, 1, -1];

export function buildHeroCraft(opts = {}) {
  const fog = opts.fog !== false;
  /*
   * Lite is the Settings overlay and the ghost: same silhouette, fewer
   * rings, no ink shells, no shadow casters, and none of the parts too small
   * to see in a 400 pixel preview or through a translucent ghost (the
   * screws, the wiring, the chips on the boards). The world craft stays
   * full. Settings already pays for a second WebGL context; that context has
   * to stay cheap.
   */
  const lite = Boolean(opts.lite);
  const inkOn = !lite;
  const shade = !lite;
  const detail = !lite;
  /* Segments round a big round part (a bell, the barrel) and round a small
   * one (a screw head, a grommet), and how finely a flat part's corners are
   * cut. These three numbers are most of the triangle budget. */
  const seg = lite ? 10 : 16;
  const segSmall = lite ? 6 : 8;
  const curve = lite ? 2 : 3;
  /* Chamfers, which are what catch the rim light on a cut edge, and which
   * a 400 pixel preview cannot show; lite draws its edges square. */
  const bev = (b) => (lite ? 0 : b);
  /* Every colour a part is painted, through the studio lift in lite. */
  const hue = (hex) => (lite ? studioLift(hex) : hex);
  const cel = (o) => celMaterial({ fog, cloudShadow: 0, ...o });
  /* A finish: a white cel material that takes its colour from the vertices
   * of whatever is merged into it. vertexColors is set after construction
   * because celMaterial's options do not carry it; it is a standard material
   * flag, so three folds it into the program key without help. */
  const finish = (o) => {
    const m = cel({ color: 0xffffff, ...o });
    m.vertexColors = true;
    return m;
  };
  const group = new THREE.Group();
  group.name = opts.name ?? 'hero-craft';
  if (opts.worldScale) {
    group.scale.setScalar(1 / WORLD_SCALE);
  }

  /*
   * Four finishes for everything that does not move, and what each is for.
   * body: matte, carbon and everything that is not metal, TPU or vinyl.
   * metal: machined and plated, the bells, the standoffs and the hardware.
   * tpu: printed sakura TPU and the rubber grommets, a satin sheen.
   * vinyl: the cream decals, the pack's label and the zip ties.
   */
  const bodyMat = finish({ rim: 0.28, spec: 0.20, specWidth: 0.012 });
  const metalMat = finish({ rim: 0.32, spec: 0.72, specWidth: 0.022, specColor: 0xf3ead4 });
  const tpuMat = finish({ rim: 0.40, spec: 0.34, specWidth: 0.016 });
  const vinylMat = finish({ rim: 0.26, spec: 0.28 });
  const propMat = finish({ rim: 0.34, spec: 0.30, specWidth: 0.014 });
  const camMat = finish({ rim: 0.26, spec: 0.35 });
  /* The windings. Returned as `stator`: craftpose.js warms its emissive
   * with throttle in the studio, so it is the copper that glows. */
  const stator = cel({ color: C.copper, rim: 0.24, spec: 0.40, specWidth: 0.016 });
  const lens = cel({
    color: 0x101610,
    rim: 0.40,
    spec: 0.95,
    specWidth: 0.03,
    specColor: 0xf3ead4,
    side: THREE.DoubleSide,
  });
  const antenna = cel({ color: hue(0x1a241c), rim: 0.22 });
  const antennaTip = cel({ color: C.mint, rim: 0.20, spec: 0.4 });

  /*
   * `how` is a few words: 'flat' shades the part as facets (a hex nut, a
   * knurled ring), 'ink' puts it in the finish's ink shell. Only the parts
   * that make the silhouette are inked: the plates and arms, the motors,
   * the pack and its strap, the cage, the plug and the capacitor. A screw
   * or a wire on a dark plate needs no line of its own, and every inked
   * triangle is drawn twice more, once in the shell and once again in the
   * ink prepass.
   */
  const parts = { body: [], metal: [], tpu: [], vinyl: [] };
  const inked = { body: [], metal: [], tpu: [], vinyl: [] };
  const add = (finishName, geo, hex, how = '') => {
    const g = paint(geo, hue(hex), how.includes('flat'));
    parts[finishName].push(g);
    if (inkOn && how.includes('ink')) {
      inked[finishName].push(g);
    }
  };

  const a = MOTOR_ARM;
  const motors = [
    [a, a],
    [a, -a],
    [-a, a],
    [-a, -a],
  ];

  /*
   * Check 15 reads a direct child BoxGeometry whose depth is the body
   * length. The visible plates are merged BufferGeometry, so this box is
   * the published airframe, hidden, and the only thing that measurement
   * is allowed to see.
   */
  if (opts.measure) {
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.088, 0.034, 0.155),
      bodyMat,
    );
    box.visible = false;
    box.castShadow = false;
    group.add(box);
  }

  /*
   * THE FRAME. A bottom plate that runs forward under the camera, four
   * arms on it, the top plate on four standoffs. Plate numbers are a
   * typical 5 inch freestyle frame's: a 2.5 mm bottom and top, 5.5 mm arms,
   * a 32 mm wide body and a 35 mm wide top.
   */
  {
    const bottom = roundRect(new THREE.Shape(), -0.0170, -0.056, 0.0170, 0.094, 0.006);
    add('body', slab(bottom, PLATE_Y0, PLATE_Y1, bev(0.0005), curve), C.carbon, 'ink');

    /* The pad round the motor is the arm's one curve a chase camera sees
     * whole, so it is cut finer than the plates' corners. */
    const arm = slab(armShape(), PLATE_Y1, ARM_Y1, bev(0.0007), lite ? 4 : 6);
    for (const [mx, mz] of motors) {
      const psi = Math.atan2(-mx, -mz);
      add('body', place(arm, 0, 0, 0, 0, psi, 0), C.carbon, 'ink');
    }
    arm.dispose();

    /* The top plate, with the window the flight controller shows through,
     * which is what stops it reading as a lid. It had two lightening slots
     * as well, and they cost more triangles than the rest of the plate:
     * a dark slot over a dark stack, they did not show in any picture. */
    const top = roundRect(new THREE.Shape(), -0.0175, -0.056, 0.0175, 0.066, 0.006);
    top.holes.push(roundRect(new THREE.Path(), -0.0085, -0.014, 0.0085, 0.012, 0.003));
    add('body', slab(top, TOP_Y0, TOP_Y1, bev(0.0006), 2), C.carbon, 'ink');

    /* Anodised standoffs, hex, and the button heads on the top plate. A
     * standoff's ends are under a plate at both ends, and a head's
     * underside is on the plate. */
    const post = cyl(0.0025, 0.0025, TOP_Y0 - PLATE_Y1, 6, 'none');
    const head = cyl(0.0029, 0.0030, 0.0012, segSmall, 'top');
    for (const sz of [-0.059, 0.049]) {
      for (const sx of [-0.013, 0.013]) {
        add('metal', place(post, sx, (PLATE_Y1 + TOP_Y0) / 2, sz), C.sakura, 'flat');
        add('metal', place(head, sx, TOP_Y1 + 0.0006, sz), C.steel);
      }
    }
    post.dispose();
    head.dispose();

    /* Cream vinyl: a chevron on the nose of the top plate, which is the
     * cheapest way there is to tell a chase camera which end is the front,
     * and a stripe down the back. */
    const chev = new THREE.Shape();
    chev.moveTo(-0.0090, 0.0500);
    chev.lineTo(0, 0.0580);
    chev.lineTo(0.0090, 0.0500);
    chev.lineTo(0.0090, 0.0465);
    chev.lineTo(0, 0.0545);
    chev.lineTo(-0.0090, 0.0465);
    chev.closePath();
    add('vinyl', slab(chev, TOP_Y1 - 0.0001, TOP_Y1 + 0.0003, 0, 1), C.livery);
    const stripe = roundRect(new THREE.Shape(), -0.0025, -0.040, 0.0025, -0.020, 0.0008);
    add('vinyl', slab(stripe, TOP_Y1 - 0.0001, TOP_Y1 + 0.0003, 0, 1), C.livery);
  }

  /*
   * THE MOTORS. 2306s: a dark base on the arm pad, the copper windings
   * showing in the gap under the bell and through the windows in its top,
   * a gunmetal bell with a sakura anodised band and top. Static, all four
   * merged: the bell of a real motor spins, but a round bell spinning looks
   * like a round bell standing still, and the four of them as one mesh is
   * three draw calls cheaper than four that turn.
   *
   * The bell was silver first, the old model's 0xd8d0c4. Under the field's
   * warm sun a light bell read as a cream cup, and a dark one with the
   * metal finish's hard highlight down its side reads as machined.
   */
  const windingGeo = (() => {
    if (lite) {
      const g = cyl(0.0118, 0.0118, BELL_Y1 - BASE_Y1, 8, 'top');
      moveInPlace(g, 0, (BELL_Y1 - BASE_Y1) / 2, 0);
      return g;
    }
    /* Twelve teeth, each a wound pole, which is what a stator looks like
     * through the windows. Only its top is drawn as a star: from the side
     * the windings show through a 2 mm gap under the bell, where a round
     * copper band and a toothed one are the same picture. */
    const h = BELL_Y1 - BASE_Y1;
    const s = new THREE.Shape();
    const teeth = 12;
    for (let k = 0; k < teeth * 2; k += 1) {
      const ang = (k / (teeth * 2)) * Math.PI * 2;
      const r = k % 2 === 0 ? 0.0120 : 0.0098;
      const x = Math.cos(ang) * r;
      const y = Math.sin(ang) * r;
      if (k === 0) {
        s.moveTo(x, y);
      } else {
        s.lineTo(x, y);
      }
    }
    s.closePath();
    const star = new THREE.ShapeGeometry(s, 1);
    moveInPlace(star, 0, h, 0, -Math.PI / 2);
    const side = cyl(0.0116, 0.0116, h, 12, 'none');
    moveInPlace(side, 0, h / 2, 0);
    for (const p of [star, side]) {
      p.deleteAttribute('uv');
    }
    const g = mergeGeometries([star.toNonIndexed(), side.toNonIndexed()], false);
    star.dispose();
    side.dispose();
    return g;
  })();
  const windings = [];
  {
    /* The base stands on the arm's pad and the bell hangs over its top. */
    const base = cyl(0.0134, 0.0138, BASE_Y1 - ARM_Y1, seg, 'top');
    /* Bottom to top, so the lathe faces outward: the silver skin, then the
     * sakura band, which rolls over the shoulder to the rim of the top. */
    const skin = new THREE.LatheGeometry([
      new THREE.Vector2(0.0131, BELL_Y0),
      new THREE.Vector2(0.0140, BELL_Y0 + 0.0009),
      new THREE.Vector2(0.0140, RING_Y0),
    ], seg);
    const band = new THREE.LatheGeometry([
      new THREE.Vector2(0.0140, RING_Y0),
      new THREE.Vector2(0.0140, BELL_Y1 - 0.0006),
      new THREE.Vector2(0.0132, BELL_Y1 + 0.0003),
      new THREE.Vector2(0.0127, CAP_Y1),
    ], seg);
    /*
     * The bell's top: five windows between five spokes, the way a 2306's
     * bell is cut, with the windings showing copper through them. It is
     * one flat face rather than a plate: a plate with five round holes in
     * it was six hundred triangles a motor, and the walls of a hole 1.2 mm
     * deep are not a thing a chase camera can see. The rim of the face is
     * the band's last ring exactly, `seg` points on the same circle, so
     * there is no seam: a lathe puts its first point at a quarter turn from
     * where a shape's circle starts once the shape is laid flat, so the
     * circle starts a quarter turn early. The hub of the prop covers the
     * middle.
     */
    const capShape = new THREE.Shape();
    capShape.absarc(0, 0, 0.0127, -Math.PI / 2, Math.PI * 1.5, false);
    for (let k = 0; k < 5; k += 1) {
      const mid = (k / 5) * Math.PI * 2 + Math.PI / 10;
      const win = new THREE.Path();
      const r0 = 0.0069;
      const r1 = 0.0109;
      const outer = [-0.42, 0, 0.42];
      const inner = [0.30, -0.30];
      outer.forEach((d, i) => {
        const x = Math.cos(mid + d) * r1;
        const y = Math.sin(mid + d) * r1;
        if (i === 0) {
          win.moveTo(x, y);
        } else {
          win.lineTo(x, y);
        }
      });
      for (const d of inner) {
        win.lineTo(Math.cos(mid + d) * r0, Math.sin(mid + d) * r0);
      }
      win.closePath();
      capShape.holes.push(win);
    }
    const cap = new THREE.ShapeGeometry(capShape, seg / 2);
    moveInPlace(cap, 0, CAP_Y1, 0, -Math.PI / 2);
    /* The four motor screws under the pad, the 16 mm pattern, for the
     * shots from below: a hexagon each, face down, a millimetre under the
     * arm. They are only ever seen from underneath, where a head is its
     * face, and a prism each was three times the triangles. */
    const screw = new THREE.CircleGeometry(0.0027, 6);
    moveInPlace(screw, 0, 0, 0, Math.PI / 2);
    for (const [mx, mz] of motors) {
      add('body', place(base, mx, (ARM_Y1 + BASE_Y1) / 2, mz), C.motorBase);
      add('metal', place(skin, mx, 0, mz), C.bell, 'ink');
      add('metal', place(band, mx, 0, mz), C.sakura, 'ink');
      add('metal', place(cap, mx, 0, mz), C.sakura);
      windings.push(place(windingGeo, mx, BASE_Y1, mz));
      if (detail) {
        for (let k = 0; k < 4; k += 1) {
          const ang = Math.PI / 4 + (k * Math.PI) / 2;
          add('metal', place(screw, mx + Math.cos(ang) * 0.0113, PLATE_Y1 - 0.0010, mz + Math.sin(ang) * 0.0113), C.darkSteel);
        }
      }
    }
    base.dispose();
    skin.dispose();
    band.dispose();
    cap.dispose();
    screw.dispose();
    windingGeo.dispose();
  }
  {
    for (const g of windings) {
      g.deleteAttribute('uv');
      g.clearGroups();
    }
    const geo = mergeGeometries(windings.map((g) => (g.index ? g.toNonIndexed() : g)), false);
    const mesh = new THREE.Mesh(geo, stator);
    group.add(mesh);
  }

  /*
   * THE WIRING AND THE LAMPS ON EACH ARM. Three motor leads run down the
   * arm to the ESC's corner pad, held by a cream zip tie, and a lamp sits on
   * the arm's rear edge. The lamp is a mesh of its own because the studio
   * drives each one's colour from its motor's speed; the dark housing under
   * it is merged with the frame.
   *
   * The tie goes round arm and leads 59 mm out, with its lock on the outer
   * edge, in a square section because a tie is a flat band. The four arms
   * are one arm turned, so the tie, its lock and the lamp's housing are cut
   * once, in the arm's frame, and placed on each.
   */
  const tieU = 0.0590;
  const tieHalf = armHalfWidth(tieU) + 0.0003;
  const tieGeo = detail ? (() => {
    const y0 = PLATE_Y1 - 0.0006;
    const y1 = ARM_Y1 + 0.0022;
    const tie = new THREE.Shape();
    tie.moveTo(-tieHalf - 0.0006, y0);
    tie.lineTo(tieHalf + 0.0006, y0);
    tie.lineTo(tieHalf + 0.0006, y1);
    tie.lineTo(-tieHalf - 0.0006, y1);
    tie.closePath();
    const gap = new THREE.Path();
    gap.moveTo(-tieHalf, PLATE_Y1);
    gap.lineTo(-tieHalf, ARM_Y1 + 0.0016);
    gap.lineTo(tieHalf, ARM_Y1 + 0.0016);
    gap.lineTo(tieHalf, PLATE_Y1);
    gap.closePath();
    tie.holes.push(gap);
    const g = new THREE.ExtrudeGeometry(tie, { depth: 0.0024, bevelEnabled: false, curveSegments: 1 });
    return moveInPlace(g, 0, 0, -tieU - 0.0012);
  })() : null;
  const lockGeo = new THREE.BoxGeometry(0.0020, 0.0032, 0.0036);
  const housingGeo = new THREE.BoxGeometry(0.0042, 0.0010, 0.0106);
  const ledMeshes = [];
  for (let m = 0; m < 4; m += 1) {
    const [mx, mz] = motors[m];
    const psi = Math.atan2(-mx, -mz);
    const side = mx > 0 ? 1 : -1;
    if (detail) {
      for (let w = -1; w <= 1; w += 1) {
        const off = w * 0.0017;
        const curvePts = [
          armPoint(psi, off, ARM_Y1 + 0.0008, 0.0960),
          armPoint(psi, off, ARM_Y1 + 0.0008, 0.0700),
          armPoint(psi, off, ARM_Y1 + 0.0009, 0.0440),
          armPoint(psi, off * 0.8, ARM_Y1 + 0.0030, 0.0330),
          new THREE.Vector3(
            Math.sign(mx) * 0.0150 + off * 0.5,
            0.0090,
            STACK_Z + Math.sign(mz) * 0.0150 - off * 0.5,
          ),
        ];
        add('body', tubeAlong(curvePts, 5, 0.0008, 4), C.wire);
      }
      add('vinyl', place(tieGeo, 0, 0, 0, 0, psi, 0), C.livery);
      const lockAt = armPoint(psi, side * (tieHalf + 0.0014), (PLATE_Y1 + ARM_Y1) / 2, tieU);
      add('vinyl', place(lockGeo, lockAt.x, lockAt.y, lockAt.z, 0, psi, 0), C.livery);
    }
    const housing = armPoint(psi, side * 0.0048, ARM_Y1 + 0.0005, 0.0710);
    add('body', place(housingGeo, housing.x, housing.y, housing.z, 0, psi, 0), C.carbonDeep);
    const ledMat = new THREE.MeshBasicMaterial({
      color: mz < 0 ? C.sakura : C.mint,
      fog,
    });
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.0030, 0.0012, 0.0094), ledMat);
    const at = armPoint(psi, side * 0.0048, ARM_Y1 + 0.0016, 0.0710);
    led.position.copy(at);
    led.rotation.y = psi;
    ledMeshes.push({ led, ledMat });
  }
  if (tieGeo) {
    tieGeo.dispose();
  }
  lockGeo.dispose();
  housingGeo.dispose();

  /*
   * THE STACK, seen from the side between the plates: the ESC on its
   * grommets, the flight controller above it, the MOSFETs, the MCU and the
   * USB port, and the four stack screws. The MCU and the two status lamps
   * are what shows through the top plate's window.
   */
  {
    const board = new THREE.BoxGeometry(0.0360, 0.0016, 0.0360);
    add('body', place(board, 0, 0.0078, STACK_Z), C.pcb);
    add('body', place(board, 0, 0.0148, STACK_Z), C.pcbDeep);
    board.dispose();
    /* Each grommet is pinched between two boards or a board and the plate,
     * so neither of its ends can be seen. */
    const grommet = cyl(0.0026, 0.0026, 0.0054, segSmall, 'none');
    const lower = cyl(0.0024, 0.0026, 0.0090, segSmall, 'none');
    const nut = cyl(0.0028, 0.0028, 0.0018, 6, 'top');
    for (const sx of [-0.01525, 0.01525]) {
      for (const sz of [-0.01525, 0.01525]) {
        add('tpu', place(grommet, sx, 0.0113, STACK_Z + sz), C.sakuraDeep);
        add('tpu', place(lower, sx, 0.0025, STACK_Z + sz), C.sakuraDeep);
        if (detail) {
          add('vinyl', place(nut, sx, 0.0165, STACK_Z + sz), C.livery, 'flat');
        }
      }
    }
    grommet.dispose();
    lower.dispose();
    nut.dispose();
    if (detail) {
      const fet = new THREE.BoxGeometry(0.0050, 0.0011, 0.0040);
      for (const sx of [-0.0118, 0.0118]) {
        for (const sz of [-0.0100, -0.0040, 0.0040, 0.0100]) {
          add('body', place(fet, sx, 0.0091, STACK_Z + sz), C.chip);
        }
      }
      fet.dispose();
      const pad = new THREE.BoxGeometry(0.0050, 0.0005, 0.0050);
      for (const sx of [-0.0150, 0.0150]) {
        for (const sz of [-0.0150, 0.0150]) {
          add('metal', place(pad, sx, 0.0088, STACK_Z + sz), C.steel);
        }
      }
      pad.dispose();
      add('body', place(new THREE.BoxGeometry(0.0072, 0.0012, 0.0072), 0, 0.0162, STACK_Z - 0.002), C.chip);
      add('body', place(new THREE.BoxGeometry(0.0030, 0.0010, 0.0030), 0.0048, 0.0161, STACK_Z + 0.006), C.chip);
      add('body', place(new THREE.BoxGeometry(0.0016, 0.0008, 0.0012), -0.0052, 0.0160, STACK_Z + 0.0075), C.mint);
      add('body', place(new THREE.BoxGeometry(0.0016, 0.0008, 0.0012), -0.0030, 0.0160, STACK_Z + 0.0075), C.sakura);
      add('metal', place(new THREE.BoxGeometry(0.0070, 0.0030, 0.0090), -0.0160, 0.0171, STACK_Z - 0.004), C.steel);
    }
  }

  /*
   * OUT OF THE BACK: the XT60 pigtail from the ESC's battery pads, red and
   * black, down behind the frame to the plug; the big low ESR capacitor on
   * the same pads, lying back between the rear arms; and the XT60 itself,
   * mated, behind the pack.
   */
  {
    for (const [dx, hex] of [[-0.0040, C.wireRed], [-0.0076, C.wire]]) {
      const lead = [
        new THREE.Vector3(dx, 0.0080, 0.0200),
        new THREE.Vector3(dx, 0.0050, 0.0400),
        new THREE.Vector3(dx, 0.0015, 0.0600),
        new THREE.Vector3(dx, -0.0050, 0.0790),
        new THREE.Vector3(dx, -0.0130, 0.0800),
        new THREE.Vector3(dx, -0.0140, 0.0760),
      ];
      add('body', tubeAlong(lead, lite ? 6 : 9, 0.0016, lite ? 4 : 5), hex);
    }
    const plug = roundRect(new THREE.Shape(), -0.0140, -0.0760, 0.0020, -0.0500, 0.0014);
    add('body', slab(plug, -0.0180, -0.0100, bev(0.0008), 2), C.xt60, 'ink');
    /* Lying along z, so the cylinder's top is its back end, which wears
     * the steel end disc. */
    const capBody = cyl(0.0050, 0.0050, 0.0190, lite ? 8 : 12, 'bottom');
    add('body', place(capBody, 0.0052, 0.0032, 0.0510, Math.PI / 2, 0, 0), C.capacitor, 'ink');
    capBody.dispose();
    add('metal', place(cyl(0.0046, 0.0046, 0.0008, lite ? 8 : 12, 'top'), 0.0052, 0.0032, 0.0608, Math.PI / 2, 0, 0), C.steel);
    if (detail) {
      add('vinyl', place(cyl(0.00515, 0.00515, 0.0040, 12, 'none'), 0.0052, 0.0032, 0.0470, Math.PI / 2, 0, 0), C.livery);
    }
  }

  /*
   * THE PACK, under the frame where the old model hung it, on a rubber grip
   * pad, with its label on the sides (across the back it was a cream slab
   * as wide as the aircraft and read as a part), and a strap round it with
   * a buckle. The strap's underside is the lowest point of the model and is
   * STRAP_FLOOR exactly: see the heights above.
   */
  {
    const packShape = roundRect(new THREE.Shape(), -0.0175, -0.048, 0.0175, 0.026, 0.004);
    add('body', slab(packShape, PACK_Y0, PACK_Y1, 0.0028, curve, lite ? 1 : 2), C.pack, 'ink');
    /* A millimetre and a half of rubber between pack and plate: its edge is
     * all that shows, so it is square. */
    const gripShape = roundRect(new THREE.Shape(), -0.0165, -0.045, 0.0165, 0.023, 0.003);
    add('body', slab(gripShape, PACK_Y1, PLATE_Y0, 0, 2), C.grip);
    for (const sx of [-1, 1]) {
      const label = new THREE.BoxGeometry(0.0004, 0.0140, 0.0240);
      add('vinyl', place(label, sx * 0.01765, -0.0175, -0.0100), C.livery);
      label.dispose();
      const line = new THREE.BoxGeometry(0.0004, 0.0016, 0.0240);
      add('vinyl', place(line, sx * 0.01780, -0.0175, -0.0100), C.sakura);
      line.dispose();
    }
    /*
     * The strap, as a U round the pack's section, extruded along the pack.
     * Drawn outer edge first, round the bottom, then back along the inner
     * edge, which follows the pack's own rounded corner.
     */
    const t = 0.0012;
    const xi = 0.0175;
    const xo = xi + t;
    const yb = PACK_Y0;
    const ri = 0.0028;
    const ro = ri + t;
    const yTop = PLATE_Y0;
    const u = new THREE.Shape();
    u.moveTo(-xo, yTop);
    u.lineTo(-xo, yb + ri);
    u.absarc(-xi + ri, yb + ri, ro, Math.PI, Math.PI * 1.5, false);
    u.lineTo(xi - ri, yb - t);
    u.absarc(xi - ri, yb + ri, ro, Math.PI * 1.5, Math.PI * 2, false);
    u.lineTo(xo, yTop);
    u.lineTo(xi, yTop);
    u.lineTo(xi, yb + ri);
    u.absarc(xi - ri, yb + ri, ri, 0, -Math.PI / 2, true);
    u.lineTo(-xi + ri, yb);
    u.absarc(-xi + ri, yb + ri, ri, -Math.PI / 2, -Math.PI, true);
    u.lineTo(-xi, yTop);
    u.closePath();
    const strapGeo = new THREE.ExtrudeGeometry(u, { depth: 0.0180, bevelEnabled: false, curveSegments: lite ? 1 : 2 });
    moveInPlace(strapGeo, 0, 0, 0.0060);
    add('body', strapGeo, C.strap, 'ink');
    if (yb - t !== STRAP_FLOOR && Math.abs(yb - t - STRAP_FLOOR) > 1e-9) {
      throw new Error('herocraft: the strap is not the floor the plant parks on');
    }
    /* The buckle on the right side, and the strap's tail through it. */
    const buckle = roundRect(new THREE.Shape(), -0.0110, -0.0240, 0.0110, -0.0110, 0.0015);
    buckle.holes.push(roundRect(new THREE.Path(), -0.0080, -0.0205, 0.0080, -0.0180, 0.0008));
    const bg = new THREE.ExtrudeGeometry(buckle, { depth: 0.0011, bevelEnabled: false, curveSegments: 1 });
    moveInPlace(bg, xo, 0, 0.0150, 0, Math.PI / 2, 0);
    add('metal', bg, C.steel);
    if (detail) {
      add('body', place(new THREE.BoxGeometry(0.0010, 0.0090, 0.0170), xo + 0.0015, -0.0140, 0.0150), C.strap);
      /* The balance lead's plug, tucked on the back of the pack. */
      add('vinyl', place(new THREE.BoxGeometry(0.0110, 0.0045, 0.0050), 0.0080, -0.0120, 0.0505), C.livery);
    }
  }

  /*
   * THE CAMERA CAGE, printed TPU, sakura: two side plates the camera
   * pivots between, standing on the nose of the bottom plate, and a chin
   * bar across their feet in front of the lens. Each plate is a tombstone
   * round the pivot with a lightening hole under it, which is the shape
   * a printed mount has and what lets the camera's own dark body show from
   * the side. It is the nose of the aircraft from every angle a pilot sees
   * it from, which is the job the dome used to do, done by the part a real
   * five inch puts there. A first cut was a closed box, two solid cheeks
   * joined by a bridge over the camera, and from the chase camera that was
   * a pink brick with a lens in it.
   */
  {
    const fwd = CAMERA_MOUNT_FORWARD;
    const up = CAMERA_MOUNT_UP;
    const r = 0.0105;
    const cheek = new THREE.Shape();
    cheek.moveTo(fwd - r, PLATE_Y1);
    cheek.lineTo(fwd + r - 0.0020, PLATE_Y1);
    cheek.lineTo(fwd + r, PLATE_Y1 + 0.0020);
    cheek.lineTo(fwd + r, up);
    cheek.absarc(fwd, up, r, 0, Math.PI, false);
    cheek.lineTo(fwd - r, PLATE_Y1);
    const hole = new THREE.Path();
    hole.absarc(fwd, 0.0058, 0.0032, 0, Math.PI * 2, true);
    cheek.holes.push(hole);
    /* Lite has no chamfer, so its plate is extruded the full 2.2 mm and
     * moved to where the chamfered one starts, the same slab either way. */
    const cg = new THREE.ExtrudeGeometry(cheek, {
      depth: lite ? 0.0022 : 0.0012,
      bevelEnabled: !lite,
      bevelThickness: 0.0005,
      bevelSize: 0.0005,
      bevelOffset: -0.0005,
      bevelSegments: 1,
      curveSegments: curve,
    });
    if (lite) {
      moveInPlace(cg, 0, 0, -0.0005);
    }
    /* Shape x is "how far forward", so turned a quarter about y the shape's
     * x lands on -z and the extrusion on +x. */
    moveInPlace(cg, 0, 0, 0, 0, Math.PI / 2, 0);
    for (const sx of [-1, 1]) {
      add('tpu', place(cg, sx > 0 ? 0.0105 : -0.0117, 0, 0), C.sakura, 'ink');
      /* The pivot screw, where the camera turns: its head shows on the
       * outside of the plate, so that is the end it keeps. Turned a quarter
       * about z the cylinder's top points along -x, its bottom along +x. */
      const screw = cyl(0.0021, 0.0021, 0.0010, segSmall, sx > 0 ? 'bottom' : 'top');
      add('metal', place(screw, sx * 0.0127, up, -fwd, 0, 0, Math.PI / 2), C.steel);
      screw.dispose();
    }
    cg.dispose();
    const chin = roundRect(new THREE.Shape(), -0.0122, fwd + r - 0.0045, 0.0122, fwd + r - 0.0005, 0.0012);
    add('tpu', slab(chin, PLATE_Y1, 0.0040, bev(0.0005), 2), C.sakura, 'ink');
  }

  /*
   * THE ANTENNA MOUNT, printed TPU on the back of the top plate, with the
   * boss the mast is clamped in. The mast leans back the way a pilot sets
   * one, clear of the props' wash.
   *
   * The antenna is a stubby, a 21 mm mast under a 10 mm cap, for height and
   * not for looks. It is the tallest thing on the model, and because
   * scripts/craft-check.js leaves it out of the measured machine by its
   * name, nothing but this comment keeps it under the 59.2 mm the old
   * model's mast reached. A first cut with a 36 mm mast stood at 72 mm.
   */
  const mastDir = new THREE.Vector3(-0.14, 1, 0.40).normalize();
  const mastFoot = new THREE.Vector3(0, 0.0300, 0.0490);
  {
    const block = roundRect(new THREE.Shape(), -0.0060, -0.0560, 0.0060, -0.0420, 0.0020);
    add('tpu', slab(block, TOP_Y1, 0.0290, bev(0.0008), 2), C.sakura, 'ink');
    const boss = cyl(0.0030, 0.0035, 0.0070, segSmall, 'top');
    standInPlace(boss, 0.0035, mastDir, mastFoot.x, mastFoot.y - 0.0035, mastFoot.z);
    add('tpu', boss, C.sakura);
  }

  /*
   * Merge each finish into one mesh, and grow its ink shell from the parts
   * marked 'ink' in it. The vinyl lies flat on other parts and has none.
   */
  const merged = (name, mat, castShadow, width, color = C.ink) => {
    const geo = mergeGeometries(parts[name], false);
    const line = inked[name].length ? mergeGeometries(inked[name], false) : null;
    for (const p of parts[name]) {
      p.dispose();
    }
    if (!geo) {
      throw new Error(`herocraft: ${name} merge failed`);
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = castShadow && shade;
    group.add(mesh);
    if (line) {
      inkShell(mesh, width, color, fog, line);
      line.dispose();
    }
    return mesh;
  };
  merged('body', bodyMat, true, 0.0008);
  merged('metal', metalMat, true, 0.0006);
  merged('tpu', tpuMat, true, 0.0007, C.inkWarm);
  merged('vinyl', vinylMat, false, 0);

  /*
   * THE CAMERA, on the mount the shell tilts by the pilot's camera angle.
   * A 19 mm micro: the body, the barrel and its knurled focus ring, the
   * front bezel, and the glass a quarter of a millimetre short of where
   * lens.js says it is (CAMERA_LENS_FORWARD), so the picture and the model
   * agree about where the pilot is looking from.
   */
  const cameraMount = new THREE.Group();
  cameraMount.position.set(0, CAMERA_MOUNT_UP, -CAMERA_MOUNT_FORWARD);
  group.add(cameraMount);
  {
    /* The body, the barrel and the bezel make the outline; the knurled
     * ring sits on the barrel and is drawn inside that line. The barrel's
     * back is inside the body and its front behind the bezel, and the knurl
     * is a ring on it, so none of the three has an end that shows. */
    const bodyShape = roundRect(new THREE.Shape(), -0.0095, -0.0080, 0.0095, 0.0080, 0.0022);
    const camBody = paint(slab(bodyShape, -0.0095, 0.0095, bev(0.0012), 2), hue(C.camBody));
    const barrel = paint(place(cyl(0.0068, 0.0072, 0.0145, lite ? 10 : 14, 'none'), 0, 0, -0.01525, Math.PI / 2, 0, 0), hue(C.camBody));
    const knurl = paint(place(cyl(0.0077, 0.0077, 0.0032, lite ? 10 : 14, 'none'), 0, 0, -0.0150, Math.PI / 2, 0, 0), hue(C.camRing), true);
    /* The bezel, a lathe turned to face forward: its back face, its rim,
     * and the lip the glass sits in. */
    const bezelGeo = new THREE.LatheGeometry([
      new THREE.Vector2(0.0060, -0.0011),
      new THREE.Vector2(0.0074, -0.0009),
      new THREE.Vector2(0.0073, 0.0006),
      new THREE.Vector2(0.0062, 0.0011),
    ], lite ? 10 : 14);
    moveInPlace(bezelGeo, 0, 0, -0.0228, -Math.PI / 2);
    const bezel = paint(bezelGeo, C.bezel);
    const geo = mergeGeometries([camBody, barrel, knurl, bezel], false);
    const housing = new THREE.Mesh(geo, camMat);
    housing.castShadow = shade;
    if (inkOn) {
      const line = mergeGeometries([camBody, barrel, bezel], false);
      inkShell(housing, 0.0005, C.ink, fog, line);
      line.dispose();
    }
    for (const p of [camBody, barrel, knurl, bezel]) {
      p.dispose();
    }
    cameraMount.add(housing);
    /* The glass: a shallow dome whose crown is the lens point. */
    const dome = new THREE.SphereGeometry(0.0090, lite ? 10 : 14, lite ? 2 : 3, 0, Math.PI * 2, 0, 0.70);
    moveInPlace(dome, 0, 0, -0.0242 + 0.0090, -Math.PI / 2);
    const glass = new THREE.Mesh(dome, lens);
    cameraMount.add(glass);
  }

  /* NAMED, both of them, because they are wire and not aircraft: the mast
   * is the tallest thing on the model and no contact hull covers it, nor
   * should one. See the same name in src/render/whoopcraft.js and the
   * measurement in scripts/craft-check.js. The receiver's two antenna
   * tubes are wire too, so they ride in the mast's mesh and its name. */
  {
    const mastLen = 0.0210;
    const wire = [];
    const mastGeo = new THREE.CylinderGeometry(0.0015, 0.0016, mastLen, lite ? 6 : 8);
    standInPlace(mastGeo, mastLen / 2, mastDir, mastFoot.x, mastFoot.y, mastFoot.z);
    wire.push(mastGeo);
    for (const sx of [-1, 1]) {
      const d = new THREE.Vector3(sx * 0.62, 0.38, 0.69).normalize();
      const tube = new THREE.CylinderGeometry(0.0010, 0.0010, 0.0300, lite ? 5 : 6);
      standInPlace(tube, 0.0150, d, sx * 0.0040, 0.0170, 0.0520);
      wire.push(tube);
    }
    for (const g of wire) {
      g.deleteAttribute('uv');
    }
    const mast = new THREE.Mesh(mergeGeometries(wire, false), antenna);
    for (const g of wire) {
      g.dispose();
    }
    mast.name = 'antenna';
    group.add(mast);
    /* The cap: a stubby circular polarised antenna's housing, mint. Its
     * top end is under the dome. */
    const capGeo = cyl(0.0032, 0.0028, 0.0072, lite ? 6 : 8, 'bottom');
    const top = new THREE.SphereGeometry(0.0032, lite ? 6 : 8, lite ? 2 : 3, 0, Math.PI * 2, 0, Math.PI / 2);
    moveInPlace(top, 0, 0.0036, 0);
    capGeo.deleteAttribute('uv');
    top.deleteAttribute('uv');
    const capMerged = mergeGeometries([capGeo.toNonIndexed(), top.toNonIndexed()], false);
    capGeo.dispose();
    top.dispose();
    const capAt = mastFoot.clone().addScaledVector(mastDir, mastLen - 0.0010);
    standInPlace(capMerged, 0.0036, mastDir, capAt.x, capAt.y, capAt.z);
    const tip = new THREE.Mesh(capMerged, antennaTip);
    tip.name = 'antenna';
    group.add(tip);
  }

  /*
   * THE ROTORS AND THE DISCS. Each rotor is one mesh, its own hand of
   * twist, spun by the shell about its own y; the hub sits on the bell's
   * cap and the blades at ROTOR_Y.
   */
  const discs = [];
  const blades = [];
  const leds = [];
  for (let m = 0; m < 4; m += 1) {
    const [mx, mz] = motors[m];
    const front = mz < 0;
    const rotor = new THREE.Group();
    rotor.position.set(mx, ROTOR_Y, mz);
    group.add(rotor);
    const prop = new THREE.Mesh(rotorGeometry(PROP_SPIN[m], front, lite), propMat);
    prop.castShadow = shade;
    rotor.add(prop);
    blades.push(rotor);

    /*
     * The blur disc, a direct child of the craft group, not of the motor.
     * Check 15 walks g.children for CylinderGeometry with radius >= 0.05,
     * and a nested disc is invisible to that walk.
     *
     * Clear at the hub and densest at the rim, from an alpha ramp in its
     * vertex colours, because that is what a spinning prop leaves: the root
     * of a blade sweeps a small circle slowly, the tip a big one fast, and
     * it is the tip band that draws the ring. A flat 0.12 over the whole
     * disc was a tinted coin, which is what made the old props ghostly. The
     * ramp multiplies whatever opacity the caller sets, so the studio's
     * throttle linked opacity and the ghost's own material still work.
     */
    const discGeo = new THREE.CylinderGeometry(CRAFT_PROP_R, CRAFT_PROP_R, 0.0012, lite ? 12 : 24);
    {
      const p = discGeo.getAttribute('position');
      const rgba = new Float32Array(p.count * 4);
      for (let i = 0; i < p.count; i += 1) {
        const r = Math.hypot(p.getX(i), p.getZ(i)) / CRAFT_PROP_R;
        rgba[i * 4] = 1;
        rgba[i * 4 + 1] = 1;
        rgba[i * 4 + 2] = 1;
        rgba[i * 4 + 3] = r > 0.5 ? 1 : 0;
      }
      discGeo.setAttribute('color', new THREE.BufferAttribute(rgba, 4));
    }
    const disc = new THREE.Mesh(
      discGeo,
      new THREE.MeshBasicMaterial({
        color: front ? 0xe8a8b8 : 0x5a6558,
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
        vertexColors: true,
        fog,
      }),
    );
    disc.position.set(mx, ROTOR_Y, mz);
    disc.renderOrder = 1;
    group.add(disc);
    discs.push(disc);

    const { led, ledMat } = ledMeshes[m];
    group.add(led);
    leds.push({ mesh: led, mat: ledMat, front, base: front ? 0xe8a8b8 : 0x7dffb4 });
  }

  return {
    group,
    discs,
    blades,
    leds,
    cameraMount,
    stator,
    propSpin: PROP_SPIN,
    /* A career livery (src/render/livery.js): the vinyl and the chrome
     * finishes retinted through their materials' colours, so a paint job
     * costs no geometry and no draw call. The lite craft (the ghost, the
     * Settings preview) is drawn through the studio lift and keeps the
     * house paint. */
    paint(livery) {
      if (lite || !livery) {
        return;
      }
      tintMaterial(vinylMat, C.livery, livery.vinyl);
      tintMaterial(tpuMat, C.sakura, livery.chrome);
    },
  };
}
