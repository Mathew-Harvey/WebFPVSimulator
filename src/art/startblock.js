/*
 * startblock.js: the launch stand a 5 inch race actually uses.
 *
 * WHAT THIS IS. A MultiGP start block is not a floor tile. It is a small
 * wooden (or powder coated aluminium) stand with TWO PARALLEL RAILS, a gap
 * down the middle for the battery, foam on the rails so the front arms
 * grip, and a lip at the low end so the craft does not slide off when the
 * pilot pitches it forward. GetFPV's DIY writeup is the n-shaped timber
 * version (two 25 cm rails, about 9 cm apart, foam on top). The printed
 * "start block" stands add a 25 to 30 degree tilt and triangular side
 * plates. This mesh is that object: a plywood base, two wedge cheeks, two
 * foam-topped rails on the slope, a rear brace, and a front lip.
 *
 * WHY IT IS SHARED AND WHY IT LIVES HERE. src/render/scene.js dresses the
 * world with it and src/trackbuilder/view3d.js dresses the author's preview
 * with it, so a stand on the field and a stand in the builder are the same
 * shape. The builder is not allowed to import the simulator, so the mesh
 * cannot live in src/render. It is not a course dimension (those stay in
 * elements.js as pads, spacing, padSize) and it is not the game: it is the
 * art both of them draw from.
 *
 * LOCAL FRAME, Y up, matching Three.js. +X is across the start line, +Y is
 * up, +Z is toward the spawn (behind the line). The low end of the ramp is
 * -Z, which is the way the quad sets off. Callers that live in a Z-up
 * document rotate the returned group once; they do not rebuild the parts.
 *
 * THREE.JS IS PASSED IN. view3d.js loads Three lazily so a dead CDN cannot
 * take the 2D authoring view down with it. This file must not import three.
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

export const START_BLOCK_WOOD = 0xb08958;
export const START_BLOCK_WOOD_DARK = 0x7a5230;
export const START_BLOCK_FOAM = 0x2c2c2c;
export const START_BLOCK_LIP = 0xd2601f;

/*
 * The stand's own sizes, scaled so a default 0.6 m pad footprint still
 * holds a readable object. Real timber is closer to 0.25 m by 0.19 m; at
 * the third person camera that disappears into the grass, so the default
 * is a touch larger with the same proportions.
 */
export function startBlockDims(padSize) {
  const k = Math.max(0.4, (Number(padSize) > 0 ? padSize : 0.6) / 0.6);
  const railLen = 0.38 * k;
  const tilt = 28 * Math.PI / 180;
  const railW = 0.056 * k;
  const gap = 0.10 * k;
  const wedgeT = 0.018 * k;
  return {
    railLen,
    tilt,
    rise: railLen * Math.tan(tilt),
    railW,
    gap,
    wedgeT,
    railT: 0.018 * k,
    foamT: 0.011 * k,
    baseH: 0.016 * k,
    braceT: 0.022 * k,
    braceH: 0.040 * k,
    lipAlong: 0.030 * k,
    lipH: 0.024 * k,
    railX: gap / 2 + railW / 2,
    wedgeX: gap / 2 + railW + wedgeT / 2,
    spanAcross: gap + 2 * railW + 2 * wedgeT,
    slopeLen: railLen / Math.cos(tilt),
  };
}

export function startBlockHeight(padSize) {
  const d = startBlockDims(padSize);
  return d.baseH + d.rise + d.railT + d.foamT;
}

/*
 * Which lane a lone pilot sits on: the pad nearest the middle of the
 * grid. Four pads at 1.5 m are not a single point, and parking at the
 * element's own origin put the craft in the grass between two stands.
 */
export function startBlockLaneOffset(dims) {
  const n = Math.max(1, Math.round(dims.pads || 1));
  const spacing = Number(dims.spacing) > 0 ? dims.spacing : 1.5;
  const i = Math.floor((n - 1) / 2);
  return (i - (n - 1) / 2) * spacing;
}

/*
 * The stand's contact patch, reduced to the six numbers a height query
 * needs and nothing else.
 *
 * WHY THIS EXISTS SEPARATELY FROM startBlockDims. The height query is on
 * the PHYSICS PATH: src/main.js raises the ground plane through it on every
 * 1 ms step and samples the slope through it five more times per pass.
 * startBlockDims computes rise with Math.tan and slopeLen with Math.cos,
 * and CLAUDE.md says in as many words that no JS Math.sin, Math.cos or
 * Math.pow may appear anywhere in the physics path, because they are not
 * specified to bit precision and vary between engines. A start block was
 * putting Math.tan into the trajectory a thousand times a second, and the
 * same trace on two browsers was not guaranteed to match.
 *
 * So the trig runs ONCE, when the stand is placed, and this is what comes
 * out. Callers hold the result and hand it back; nothing here is
 * recomputed per query.
 */
export function startBlockDeck(padSize) {
  const d = startBlockDims(padSize);
  return {
    halfAcross: d.spanAcross * 0.5 + 0.04,
    halfAlong: d.railLen * 0.5 + 0.04,
    /* The foam top at the LOW end of the ramp, and how far it climbs. */
    base: d.baseH + d.railT + d.foamT,
    rise: d.rise,
    originAlong: d.railLen * 0.5,
    invRailLen: 1 / d.railLen,
  };
}

/*
 * Foam-top height above the stand's own base, at a point in the stand's
 * local frame (across the start line, along toward spawn). Null if the
 * point is not on the block. Arithmetic only, so it is safe at 1 kHz.
 */
export function startBlockDeckHeight(deck, across, along) {
  if ((across < 0 ? -across : across) > deck.halfAcross) {
    return null;
  }
  if ((along < 0 ? -along : along) > deck.halfAlong) {
    return null;
  }
  const t = (along + deck.originAlong) * deck.invRailLen;
  const u = t < 0 ? 0 : t > 1 ? 1 : t;
  return deck.base + u * deck.rise;
}

/*
 * A right-triangle prism, the side cheek of a starting block. Built as an
 * ordinary non-indexed BufferGeometry with position, normal and uv so it
 * merges with the BoxGeometry rails when the scene baker buckets by
 * material. ExtrudeGeometry carries a different attribute set and would
 * make mergeGeometries return null, which is a missing stand.
 *
 * Local frame matches the rest of the group: X across, Y up, Z along.
 * Sharp end at z = -length/2 (launch), tall back at +length/2 (spawn).
 */
function wedgeGeometry(THREE, length, height, thickness) {
  const z0 = -length / 2;
  const z1 = length / 2;
  const x0 = -thickness / 2;
  const x1 = thickness / 2;
  const pos = [];
  const nrm = [];
  const uv = [];
  function tri(ax, ay, az, bx, by, bz, cx, cy, cz, nx, ny, nz) {
    pos.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    nrm.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    uv.push(0, 0, 1, 0, 0, 1);
  }
  function quad(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, nx, ny, nz) {
    tri(ax, ay, az, bx, by, bz, cx, cy, cz, nx, ny, nz);
    tri(ax, ay, az, cx, cy, cz, dx, dy, dz, nx, ny, nz);
  }
  /* Bottom, back, hypotenuse, then the two triangular cheeks. */
  quad(x0, 0, z0, x1, 0, z0, x1, 0, z1, x0, 0, z1, 0, -1, 0);
  quad(x0, 0, z1, x1, 0, z1, x1, height, z1, x0, height, z1, 0, 0, 1);
  const hx = length;
  const hy = height;
  const hn = Math.hypot(hy, hx);
  quad(x0, 0, z0, x0, height, z1, x1, height, z1, x1, 0, z0, 0, hx / hn, -hy / hn);
  tri(x1, 0, z0, x1, 0, z1, x1, height, z1, 1, 0, 0);
  tri(x0, 0, z0, x0, 0, z1, x0, height, z1, -1, 0, 0);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return geo;
}

function box(THREE, group, mat, sx, sy, sz, x, y, z, rx) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
  mesh.position.set(x, y, z);
  if (rx) {
    mesh.rotation.x = rx;
  }
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

/*
 * One stand, as a Group in the local frame above. `mats` is
 * { wood, base, foam, lip }; missing keys fall back to wood.
 */
export function assembleStartBlock(THREE, padSize, mats) {
  const d = startBlockDims(padSize);
  const wood = mats.wood;
  const base = mats.base || wood;
  const foam = mats.foam || wood;
  const lip = mats.lip || wood;
  const group = new THREE.Group();

  box(THREE, group, base,
    d.spanAcross + 0.02, d.baseH, d.railLen + 0.024,
    0, d.baseH / 2, 0, 0);

  const wedgeGeo = wedgeGeometry(THREE, d.railLen, d.rise, d.wedgeT);
  for (const side of [-1, 1]) {
    const w = new THREE.Mesh(wedgeGeo, wood);
    w.position.set(side * d.wedgeX, d.baseH, 0);
    w.castShadow = true;
    w.receiveShadow = true;
    group.add(w);
  }

  box(THREE, group, wood,
    d.gap + 2 * d.railW, d.braceH, d.braceT,
    0, d.baseH + d.braceH / 2, d.railLen / 2 - d.braceT / 2, 0);

  /* Slope normal, pointing out of the ramp. rotation.x = -tilt lifts +Z
   * (the spawn end) and takes the box's local Y onto this normal. */
  const ny = Math.cos(d.tilt);
  const nz = -Math.sin(d.tilt);
  const pitch = -d.tilt;
  const midY = d.baseH + d.rise / 2;

  for (const side of [-1, 1]) {
    const x = side * d.railX;
    box(THREE, group, wood,
      d.railW, d.railT, d.slopeLen,
      x, midY + ny * (d.railT / 2), nz * (d.railT / 2), pitch);
    box(THREE, group, foam,
      d.railW * 0.92, d.foamT, d.slopeLen * 0.96,
      x, midY + ny * (d.railT + d.foamT / 2), nz * (d.railT + d.foamT / 2), pitch);

    const along = d.lipAlong / 2;
    const n = d.railT + d.foamT + d.lipH / 2;
    const lipZ = -d.railLen / 2 + along * Math.cos(d.tilt) + n * nz;
    const lipY = d.baseH + along * Math.sin(d.tilt) + n * ny;
    box(THREE, group, lip,
      d.railW, d.lipH, d.lipAlong,
      x, lipY, lipZ, pitch);
  }

  return group;
}
