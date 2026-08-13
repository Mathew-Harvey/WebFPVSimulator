import * as THREE from 'three';
import { PAL } from '../core/palette.js';
import { cel } from '../core/toon.js';
import { groundY, centerX, TERRAIN_DROP } from './street.js';
import { inTrench, CANAL } from './landform.js';

/* ------------------------------------------------------------------ *
 * The planet.
 *
 * The whole scene is still *authored* on a flat XZ plane -- every builder,
 * every collider, every height query works exactly as before.  This module
 * is the projection layer that wraps that plane onto a sphere, plus the
 * sphere itself.
 *
 * The mapping is equirectangular, with the railway deliberately placed on
 * the equator:
 *
 *     x -> longitude   (wraps at exactly one circumference)
 *     z -> latitude    (poles a quarter-circumference along the street)
 *
 * The railway is authored along X at z = 0, so it lands on a great circle
 * and closes into a single seamless loop with zero distortion -- that is
 * the whole reason for choosing this mapping over any other.  The cost is
 * that longitude lines converge at the two poles, so content far along the
 * street gets squeezed in x.  The district spans |z| < 60, which at this
 * radius is under 5% compression, and the poles themselves sit in bare
 * terrain a quarter of the way around.
 * ------------------------------------------------------------------ */

/** Planet radius in metres. Everything else derives from this one number. */
export const R = 160;

export const CIRCUMFERENCE = 2 * Math.PI * R;
/** Sphere centre, chosen so the flat origin sits on the surface with +Y up. */
export const CENTER = new THREE.Vector3(0, -R, 0);

/** Visible ground horizon for an eye at height h -- useful for framing. */
export const horizonFor = (h) => Math.sqrt(2 * R * h + h * h);

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _m = new THREE.Matrix4();

/* ------------------------------- mapping ------------------------------- */

/** Outward surface normal ("up") at flat coordinates (x, z). */
export function normalAt(x, z, out = new THREE.Vector3()) {
  const la = x / R;
  const ph = z / R;
  const cp = Math.cos(ph);
  return out.set(Math.sin(la) * cp, Math.cos(la) * cp, Math.sin(ph));
}

/** World position of the flat point (x, z) raised y metres above the surface. */
export function positionAt(x, y, z, out = new THREE.Vector3()) {
  normalAt(x, z, out).multiplyScalar(R + y).add(CENTER);
  return out;
}

/**
 * Orthonormal tangent frame: east is +x, north is +z, up is the normal.
 * At the origin this is the identity, which is why district content near
 * the crossing needs almost no correction.
 */
export function basisAt(x, z, up = new THREE.Vector3(), east = new THREE.Vector3(), north = new THREE.Vector3()) {
  const la = x / R;
  const ph = z / R;
  const sl = Math.sin(la), cl = Math.cos(la);
  const sp = Math.sin(ph), cp = Math.cos(ph);
  up.set(sl * cp, cl * cp, sp);
  east.set(cl, -sl, 0);
  north.set(-sl * sp, -cl * sp, cp);
  return { up, east, north };
}

/** Full placement matrix for the flat point (x, z) at height y. */
export function frameAt(x, z, y = 0, out = new THREE.Matrix4()) {
  const b = basisAt(x, z);
  out.makeBasis(b.east, b.up, b.north);
  out.setPosition(positionAt(x, y, z, _v));
  return out;
}

/** Inverse mapping: a point (or direction) on the sphere back to flat (x, z). */
export function flatAt(worldPos, out = { x: 0, z: 0, y: 0 }) {
  _v.copy(worldPos).sub(CENTER);
  const r = _v.length() || 1;
  _v.multiplyScalar(1 / r);
  out.z = R * Math.asin(THREE.MathUtils.clamp(_v.z, -1, 1));
  out.x = R * Math.atan2(_v.x, _v.y);
  out.y = r - R;
  return out;
}

/** Shortest signed difference between two longitudes, in metres of arc. */
export function wrapDelta(a, b) {
  let d = a - b;
  while (d > CIRCUMFERENCE / 2) d -= CIRCUMFERENCE;
  while (d < -CIRCUMFERENCE / 2) d += CIRCUMFERENCE;
  return d;
}

/** Fold a longitude into [-C/2, C/2). */
export function wrapX(x) {
  const c = CIRCUMFERENCE;
  return ((((x + c / 2) % c) + c) % c) - c / 2;
}

/* ---------------------------- geometry wrapping ---------------------------- */

/**
 * Split any triangle with an edge longer than `maxEdge`.
 *
 * This is what makes wrapping arbitrary geometry safe.  A 1000-metre rail
 * is authored as a box with two vertices along its length; bending only
 * those two vertices would chord straight through the planet.  Bisecting
 * the long edge until every span is short means the same flat builders can
 * produce planet-scale geometry with no changes.
 */
function subdivideLongEdges(geo, maxEdge) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  const max2 = maxEdge * maxEdge;

  const attrNames = Object.keys(g.attributes);
  let arrays = attrNames.map((n) => ({
    name: n,
    size: g.attributes[n].itemSize,
    src: g.attributes[n].array,
  }));
  let count = g.attributes.position.count;

  /* The material index of every triangle, carried through all the passes.
   *
   * This has to be tracked explicitly because both ends of this function
   * throw `geometry.groups` away: `toNonIndexed()` does not copy them, and
   * the geometry rebuilt at the bottom starts empty.  A mesh with a material
   * *array* and no groups contributes nothing at all to the render list -- it
   * does not fall back to material[0], it simply stops being drawn.  Every
   * sign in this world is a box with one mapped face and five plain ones, so
   * losing this took out all of them at once: nine shop fascias, the blade
   * signs, the arch over the alley mouth, the school gate notice, the
   * bathhouse name, the apartment plate.  Fifty-four meshes, and true from
   * the moment the planet went in.  Nothing threw and the console was clean;
   * what it looked like was a district where nobody had put their sign up.
   *
   * Group boundaries survive the passes for free because triangles are
   * processed in order and each one emits either one or two triangles, so the
   * per-triangle array below stays aligned with the vertex output. */
  const srcGroups = geo.groups && geo.groups.length ? geo.groups : null;
  let gid = new Int32Array(count / 3);
  if (srcGroups) {
    for (const grp of srcGroups) {
      const t0 = Math.floor(grp.start / 3);
      const t1 = Math.min(gid.length, t0 + Math.floor(grp.count / 3));
      for (let t = t0; t < t1; t++) gid[t] = grp.materialIndex ?? 0;
    }
  }

  // bounded pass count: each pass at least halves the longest edge
  for (let pass = 0; pass < 12; pass++) {
    const pos = arrays.find((a) => a.name === 'position').src;
    let splits = 0;
    const out = arrays.map((a) => ({ name: a.name, size: a.size, dst: [] }));
    const gidOut = [];

    for (let t = 0; t < count; t += 3) {
      // longest edge of this triangle
      let worst = -1, wi = 0;
      for (let e = 0; e < 3; e++) {
        const a = t + e, b = t + ((e + 1) % 3);
        const dx = pos[a * 3] - pos[b * 3];
        const dy = pos[a * 3 + 1] - pos[b * 3 + 1];
        const dz = pos[a * 3 + 2] - pos[b * 3 + 2];
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > worst) { worst = d2; wi = e; }
      }
      if (worst <= max2) {
        for (const a of out) {
          const src = arrays.find((x) => x.name === a.name).src;
          for (let e = 0; e < 3; e++) {
            for (let k = 0; k < a.size; k++) a.dst.push(src[(t + e) * a.size + k]);
          }
        }
        gidOut.push(gid[t / 3]);
        continue;
      }
      splits++;
      gidOut.push(gid[t / 3], gid[t / 3]);
      // corner indices: i0-i1 is the long edge, i2 the opposite corner
      const i0 = t + wi, i1 = t + ((wi + 1) % 3), i2 = t + ((wi + 2) % 3);
      for (const a of out) {
        const src = arrays.find((x) => x.name === a.name).src;
        const mid = [];
        for (let k = 0; k < a.size; k++) {
          mid.push((src[i0 * a.size + k] + src[i1 * a.size + k]) * 0.5);
        }
        const push = (idx) => {
          for (let k = 0; k < a.size; k++) a.dst.push(src[idx * a.size + k]);
        };
        // (i0, mid, i2) and (mid, i1, i2) preserve winding
        push(i0); a.dst.push(...mid); push(i2);
        a.dst.push(...mid); push(i1); push(i2);
      }
    }

    arrays = out.map((a) => ({ name: a.name, size: a.size, src: Float32Array.from(a.dst) }));
    gid = Int32Array.from(gidOut);
    count = arrays.find((a) => a.name === 'position').src.length / 3;
    if (!splits) break;
  }

  const result = new THREE.BufferGeometry();
  for (const a of arrays) {
    result.setAttribute(a.name, new THREE.BufferAttribute(a.src, a.size));
  }
  // one group per run of triangles sharing a material; single-material
  // geometry is left group-free, exactly as it arrived
  if (srcGroups) {
    let start = 0;
    for (let t = 1; t <= gid.length; t++) {
      if (t === gid.length || gid[t] !== gid[start]) {
        result.addGroup(start * 3, (t - start) * 3, gid[start]);
        start = t;
      }
    }
  }
  if (g !== geo) g.dispose();
  return result;
}

/**
 * Bend a geometry whose vertices are flat *world* coordinates onto the
 * sphere. Returns a new geometry; the input is left alone.
 */
export function wrapGeometry(geo, maxEdge = 3.0) {
  const g = subdivideLongEdges(geo, maxEdge);
  const pos = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    positionAt(pos.getX(i), pos.getY(i), pos.getZ(i), v);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  pos.needsUpdate = true;
  g.deleteAttribute('normal');
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/* -------------------------------- baking -------------------------------- */

/**
 * Project an already-built flat world onto the planet.
 *
 * Runs once, after every builder has finished, and only touches geometry
 * and transforms -- which is the point: none of the twenty-odd world
 * modules need to know the planet exists.
 *
 *  - InstancedMesh          -> each instance is re-seated rigidly on the
 *                              surface (they are all small props)
 *  - userData.planetRigid   -> left in flat space; used for animated rigs
 *                              near the origin, where the mapping is
 *                              within a couple of centimetres of identity
 *  - userData.planetSpin    -> geometry bent, then driven at runtime by a
 *                              rotation about the planet axis (the train)
 *  - everything else        -> subdivided and bent vertex by vertex
 */
export function bakeToPlanet(root, { maxEdge = 3.0 } = {}) {
  root.updateMatrixWorld(true);

  const underRigid = (o) => {
    for (let p = o.parent; p && p !== root.parent; p = p.parent) {
      if (p.userData.planetRigid) return true;
    }
    return false;
  };

  // Groups whose children sit relative to their own origin, and which are
  // driven at runtime (gate booms, shutter, cat, vending). Their pivots have
  // to survive the bake, so instead of bending their geometry we re-seat the
  // group itself onto the surface and leave the rig intact.
  const rigid = [];
  root.traverse((o) => {
    if (o.userData.planetRigid && !underRigid(o)) {
      rigid.push({ obj: o, world: o.matrixWorld.clone() });
    }
  });

  const jobs = [];
  root.traverse((o) => {
    if (!o.isMesh && !o.isLine) return;
    if (o.userData.planetRigid || underRigid(o)) return;
    jobs.push({ obj: o, world: o.matrixWorld.clone() });
  });

  const stats = { wrapped: 0, instanced: 0, rigid: rigid.length, tris: 0 };

  for (const { obj, world } of jobs) {
    if (obj.isInstancedMesh) {
      const n = obj.count;
      const im = obj.instanceMatrix;
      for (let i = 0; i < n; i++) {
        _m.fromArray(im.array, i * 16).premultiply(world);
        _m.decompose(_v, _q, _s);
        const b = basisAt(_v.x, _v.z);
        const fq = new THREE.Quaternion().setFromRotationMatrix(
          new THREE.Matrix4().makeBasis(b.east, b.up, b.north)
        );
        const p = positionAt(_v.x, _v.y, _v.z, new THREE.Vector3());
        _m.compose(p, fq.multiply(_q), _s);
        _m.toArray(im.array, i * 16);
      }
      im.needsUpdate = true;
      /* Instanced meshes stay unculled.  Their bound would have to come from
       * the instance cloud rather than the source geometry, and most of them
       * (sleepers, petals, blossom) span the district anyway -- so there is
       * nothing to win and a moving petal field to get wrong. */
      obj.frustumCulled = false;
      stats.instanced += n;
    } else {
      const flat = obj.geometry.clone().applyMatrix4(world);
      const bent = wrapGeometry(flat, maxEdge);
      flat.dispose();
      obj.geometry = bent;
      /* Everything else *is* culled, and this matters: the bake leaves every
       * mesh with an identity transform and its geometry in root space, so the
       * geometry's own bounding sphere is already a world-space bound and the
       * frustum test is exact.  The district grew to about five thousand
       * meshes, and drawing all of them every frame regardless of where the
       * camera is pointing cost roughly 8 ms -- most of a frame. */
      obj.frustumCulled = true;
      stats.wrapped++;
      stats.tris += bent.attributes.position.count / 3;
    }
    // geometry (or instance matrices) are now in root space
    obj.position.set(0, 0, 0);
    obj.quaternion.identity();
    obj.scale.set(1, 1, 1);
    obj.matrixAutoUpdate = true;
  }

  // Baked geometry is in root space now, so every container above it must
  // become the identity or its transform would apply a second time.
  root.traverse((o) => {
    if (o === root || o.isMesh || o.isLine) return;
    if (o.userData.planetRigid || underRigid(o)) return;
    o.position.set(0, 0, 0);
    o.quaternion.identity();
    o.scale.set(1, 1, 1);
  });

  // Re-seat the rigid rigs. Their parents are identity by now, so the local
  // transform is the world transform.
  const fm = new THREE.Matrix4();
  for (const { obj, world } of rigid) {
    world.decompose(_v, _q, _s);
    const b = basisAt(_v.x, _v.z);
    fm.makeBasis(b.east, b.up, b.north);
    obj.position.copy(positionAt(_v.x, _v.y, _v.z, new THREE.Vector3()));
    obj.quaternion.setFromRotationMatrix(fm).multiply(_q);
    obj.scale.copy(_s);
  }

  return stats;
}

/* ------------------------------- the sphere ------------------------------- */

/**
 * Graded pads for the outlying districts.
 *
 * **Inert while `RELIEF` is 0**, which it now is -- see the note on it below.
 * Kept because they are the record of which ground each district needed flat,
 * and because turning the relief back on without them puts a hillside through
 * six of the twenty-two districts.
 *
 * The radial district mask below keeps the ground flat around the crossing,
 * but the school, the shrine, the canal and the east block all sit outside
 * it -- far enough out that the low hills would come up through their
 * paving.  Each pad is a soft-edged rectangle over which relief is
 * suppressed; because `buildPlanet` samples the same function, the visible
 * sphere and the height query agree.
 */
const PADS = [
  { x: 32, z: -50, rx: 28, rz: 28 },   // the high school and its ground
  { x: -37, z: -27, rx: 30, rz: 15 },  // the canal and its banks
  { x: -31, z: 30, rx: 20, rz: 21 },   // the shrine wood, and the matsuri ground west of it
  { x: -32, z: 50, rx: 22, rz: 18 },   // 湯の坂: the shelf behind the shrine and its wood
  { x: 30, z: 31, rx: 21, rz: 22 },    // shotengai, park, bathhouse, apartment
  { x: 22, z: 54, rx: 26, rz: 13 },    // the library and the north housing block
  /* Added with the six residential blocks that filled in the land between the
   * districts.  Three of them sit in the band the two corridors do *not* damp
   * -- z -17..-7 and z 7..17 -- where the relief mask reaches 0.2 to 0.3, and a
   * quarter of a metre of hill under a lane is a visible ripple in the paving
   * even though it is nothing on a hillside.  The last two are simply outside
   * the district ellipse: 一丁目 runs out to x = -62 and 二丁目 to x = 62. */
  { x: -46, z: -11, rx: 22, rz: 11 },  // ひばり台一丁目, west along the lineside
  { x: 54, z: 22, rx: 16, rz: 26 },    // ひばり台二丁目, east of the overbridge
  { x: 20, z: 70, rx: 26, rz: 12 },    // ひばり台四丁目, north of the library
  { x: -13, z: -48, rx: 15, rz: 14 },  // 通学路の家並み, west of the school road
  { x: -14, z: 54, rx: 12, rz: 12 },   // 桜守裏町, between the shrine and the road
  /* ひばり台六丁目 and its bus turnaround, north-east of 三丁目.  The one pad
   * that was *cut into a hill* rather than laid on flat ground: the shoulder
   * rising north-east of 二丁目 reached 2.4 m by z = 64, and its north edge was
   * deliberately short of the block so the ground climbed again behind the back
   * lane.  With `RELIEF` at 0 there is no hill to cut into and no pad to need,
   * and the block's retaining wall is simply a boundary wall -- which is what
   * most 1.15 m walls with a fence on them are anyway. */
  { x: 62, z: 55, rx: 17, rz: 11 },    // ひばり台六丁目, at the foot of the east rise
];

/**
 * How much of the low-hill relief below is applied.  **Zero: the planet is a
 * true sphere.**
 *
 * The relief existed to give the outward views some background mass, and it was
 * never applied consistently.  `buildPlanet` displaced the *sphere* by it;
 * `street.js`'s terrain grid is a pure `groundY` profile and never carried it at
 * all.  The two surfaces are 65 mm apart, so anywhere the relief rose past that
 * the sphere came **up through the flat grid** -- and with it up through
 * everything laid flat on the grid: road slabs, lane strips, pads, kerbs, and
 * the tyres of anything parked on them.  Measured before this was switched off:
 * 7 346 square metres of the walkable bounds were above the grid, and 21 of the
 * world's colliders were standing on ground the sphere had risen through,
 * worst of them the school's east fence at 0.87 m and 六丁目's back edge at
 * 1.68 m.  Green cutting through asphalt, in other words, which is what it
 * looked like.
 *
 * Two ways to fix that.  Give the terrain grid the same displacement -- which
 * does not work, because the *road*, the lanes and every pad in the world are
 * authored against `groundY` alone and would still be cut through; or take the
 * relief out, which is what this does.  The masks below (the railway corridor,
 * the channel corridor, the district ellipse and every graded pad) exist only
 * to hold the relief *off* built ground, so with the relief gone they are inert
 * and the whole thing collapses to a sphere of radius `R + groundY(z)`.
 *
 * The cost is the background: the low hills behind the school and north-east of
 * 二丁目 are gone, and outward-facing views end in a clean horizon curve.  That
 * makes NEXT.md's "empty skies" note sharper, and the honest answer to it is
 * distant *mass* that is not terrain -- a tree line, a ridge in `sky.js` -- not
 * turning this back on.
 *
 * Everything below is kept intact and behind one number: set `RELIEF` back to 1
 * and the old landscape returns exactly as it was, along with the clipping.
 */
const RELIEF = 0;

/**
 * Low hills everywhere the masks allow.  Suppressed along the railway corridor,
 * along the drainage channel, across the district and over the graded pads.
 *
 * The channel needs its own corridor for the same reason the railway does:
 * both circle the planet, and both are dead flat in z, so a hill rising
 * anywhere along either ring would come up through the revetment.  Its corridor
 * is deliberately tighter than the railway's (7-20 m against 7-26) -- the
 * made ground only reaches 6 m either side of the centreline.
 */
export function reliefAt(x, z) {
  if (RELIEF <= 0) return 0;
  const corridor = THREE.MathUtils.smoothstep(Math.abs(z), 7, 26);
  const channel = THREE.MathUtils.smoothstep(Math.abs(z - CANAL.z), 7, 20);
  const district = THREE.MathUtils.smoothstep(
    Math.hypot(wrapDelta(x, 0) * 0.55, z * 0.5), 26, 70
  );
  let mask = Math.min(corridor, channel, 1) * district;
  for (const p of PADS) {
    if (mask <= 0.001) break;
    const d = Math.max(Math.abs(wrapDelta(x, p.x)) / p.rx, Math.abs(z - p.z) / p.rz);
    mask *= THREE.MathUtils.smoothstep(d, 1.0, 1.5);
  }
  if (mask <= 0.001) return 0;

  const la = x / R, ph = z / R;
  let h = 0;
  h += Math.sin(la * 3.1 + 0.7) * Math.cos(ph * 2.3) * 6.0;
  h += Math.sin(la * 7.3 - 1.9) * Math.cos(ph * 5.1 + 0.4) * 2.6;
  h += Math.sin(la * 13.7 + 2.4) * Math.cos(ph * 11.3) * 1.1;
  return Math.max(0, h + 2.2) * mask * RELIEF;
}

/**
 * Drop the sphere's faces under the canal excavation.
 *
 * Same rule as `cutTrench`: a triangle goes if *any* of its corners is inside
 * the footprint, so nothing survives that could rise through the channel bed.
 * The sphere is non-indexed, and its vertices are already spherical, so each
 * corner is mapped back to flat coordinates before the test.
 */
function cutSphereTrench(geo) {
  const pos = geo.attributes.position;
  const flat = { x: 0, z: 0, y: 0 };
  const p = new THREE.Vector3();
  const inside = (i) => {
    p.set(pos.getX(i), pos.getY(i), pos.getZ(i));
    flatAt(p, flat);
    return inTrench(flat.x, flat.z);
  };
  const keep = [];
  for (let t = 0; t < pos.count; t += 3) {
    if (inside(t) || inside(t + 1) || inside(t + 2)) continue;
    for (let e = 0; e < 3; e++) {
      keep.push(pos.getX(t + e), pos.getY(t + e), pos.getZ(t + e));
    }
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(keep, 3));
}

export function buildPlanet(scene) {
  const group = new THREE.Group();
  group.name = 'planet';

  /* An icosphere rather than a UV sphere: even triangles and no pole pinching.
   *
   * **Detail 30, not 6, and the number is derived.**  `PolyhedronGeometry`
   * splits each icosahedron edge into `detail + 1`, so at R = 160 the edge is
   * 168 / (d + 1) metres and a facet's centre sags below the true sphere by
   * about `e² / (6R)`.  At detail 6 that is a **24 m triangle sagging 0.60 m**,
   * which was measured and not guessed: a radial ray fired at (0, 0) hit the
   * sphere at y = -0.700 against the -0.080 the arithmetic above asks for.
   *
   * Inside the terrain grid that sag is harmless -- it only pushes the sphere
   * further under a surface that already hides it.  Outside it, where the
   * sphere *is* the ground, it is the same class of fault the relief was: the
   * two rings that circle the planet are authored at a fixed height, so on the
   * far side the ballast and the revetment stood over ground that dropped away
   * half a metre between one facet vertex and the next.  Detail 30 is a 5.4 m
   * triangle sagging 30 mm, comfortably inside the 65 mm the grid clears by, so
   * the ground under the far half of both rings is now flat to a rail's
   * thickness.  It costs 19 220 triangles against 980 -- 1.4 % of the scene, in
   * one draw call, on a mesh that is never culled anyway. */
  const geo = new THREE.IcosahedronGeometry(R, 30);
  const pos = geo.attributes.position;
  const n = new THREE.Vector3();
  const flat = { x: 0, z: 0, y: 0 };
  const p = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    n.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
    // icosphere vertices are centred on the origin; shift into planet space
    p.copy(n).multiplyScalar(R).add(CENTER);
    flatAt(p, flat);
    // 65 mm under the graded terrain grid, wherever the grid reaches; out past
    // it the sphere *is* the ground and `reliefAt` is the whole shape of it
    const h = reliefAt(flat.x, flat.z) + groundY(flat.z) * 0.999 - TERRAIN_DROP - 0.065;
    p.copy(n).multiplyScalar(R + h).add(CENTER);
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  pos.needsUpdate = true;
  geo.deleteAttribute('normal');
  /* The sphere sits 65 mm under the graded terrain grid, so it has to lose
   * the same faces the terrain does or it simply fills the channel back in.
   * Its vertices are in world space by now, which is exactly what `cutTrench`
   * wants -- but they are spherical, so the test has to run on the flat
   * coordinates instead. */
  cutSphereTrench(geo);
  /* **Normals taken from the sphere, not from the faces.**  `IcosahedronGeometry`
   * is non-indexed and `cutSphereTrench` rebuilds it as a bare position list, so
   * `computeVertexNormals()` hands every vertex of a triangle the *face* normal
   * -- flat shading whatever the material asks for.  On a 5.4 m facet that is
   * invisible as shape and very visible as tone: the toon ramp quantises per
   * facet, so the terminator came out as a staircase of triangles marching round
   * the planet, which is precisely the "bumpy" it is supposed to have stopped
   * being.  Every vertex here is on a sphere about `CENTER`, so its normal is
   * simply the radial direction, and one line of arithmetic buys a terminator
   * that is a clean curve. */
  {
    /* Re-read the attribute: `cutSphereTrench` *replaces* it, so the `pos`
     * captured at the top of this function is the pre-cut one and is both the
     * wrong length and the wrong data.  Written that way first, and what it
     * produced was a normal buffer shorter than the position buffer -- which
     * three.js does not complain about, it just shades the tail of the mesh
     * with whatever is there.  The symptom was a band of stepped stripes across
     * the far hemisphere that looked exactly like the faceting this was meant
     * to remove. */
    const vp = geo.attributes.position;
    const nrm = new Float32Array(vp.count * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < vp.count; i++) {
      v.set(vp.getX(i), vp.getY(i), vp.getZ(i)).sub(CENTER).normalize();
      nrm[i * 3] = v.x;
      nrm[i * 3 + 1] = v.y;
      nrm[i * 3 + 2] = v.z;
    }
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  }

  /* 4 bands rather than 3: on a whole sphere the terminator sweeps through every
   * angle, and three bands make it read as a coarse polyhedron.  `flat: false`
   * for the same reason the reeds need it -- this is the one mesh in the world
   * whose facets are bigger than the light changes across them. */
  const land = new THREE.Mesh(geo, cel({ color: 0xc4c4b6, bands: 4, tint: 0x7a7396, flat: false }));
  land.receiveShadow = true;
  // Must NOT cast: a planet-sized closed sphere renders its far hemisphere
  // into the shadow map and drops the entire surface into its own shadow.
  land.castShadow = false;
  land.frustumCulled = false;
  land.name = 'planetLand';
  group.add(land);

  scene.add(group);
  return { group, land };
}
