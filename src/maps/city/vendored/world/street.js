import * as THREE from 'three';
import { PAL } from '../core/palette.js';
import { cel, flat } from '../core/toon.js';
import { tactileTex, drainTex, alleyPlate, noParking, roadPaint } from '../core/textures.js';
import { sstep, rngKit, box, cyl } from '../core/util.js';
import { cutTrench } from './landform.js';

/* ------------------------------------------------------------------ *
 * The street.
 *
 * Everything in the world is placed relative to a single curved
 * centreline.  The stretch around the railway crossing is kept straight so
 * the crossing reads cleanly, then the road bends and climbs away to the
 * north-west and bends the other way behind the player, which hides both
 * ends of the scene without a visible wall.
 * ------------------------------------------------------------------ */

export const ROAD_HALF = 3.15;
export const WALK_W = 1.55;
export const WALK_H = 0.135;

/**
 * How far below the ground reference plane the graded terrain grid is drawn.
 *
 * `groundY(z) + reliefAt(x, z)` is the plane every builder seats a prop on and
 * the plane `heightAt` walks the player along.  The terrain mesh has to sit a
 * little under it so that the paving laid on top of it -- the carriageway at
 * +0.012, the gutter at +0.004 -- wins the depth test.  It used to be 75 mm,
 * and that is not a clearance, it is a visible gap: measured by raycast
 * against the rendered mesh, every prop standing on bare ground floated
 * 78 mm.  At two metres that is a finger's width of daylight under a bicycle
 * with an ink line drawn round it, and it was reported as exactly that --
 * bicycles, poles and bins hovering over the grass while everything on the
 * road looked fine.  Nothing in the world is authored *against the terrain
 * surface*; everything is authored against `groundY`.  So the terrain sitting
 * 75 mm below `groundY` was simply wrong rather than a convention, and two
 * other modules had quietly grown numbers to match it (`canal.js`'s road
 * bridge, the planet sphere).  Both now derive from this constant.
 *
 * 15 mm is the entire budget now, and the grid is precompensated below so that
 * its *interpolated* surface stays under the plane rather than only its
 * vertices.  That leaves ~18 mm under the lowest paved surface in the world
 * (the gutter, at +0.004) even after the planet bake sags that one down -- two
 * surfaces that get within about 7 mm of each other z-fight once the bake bends
 * them, which is what the green belt in `approach.js` was moved for.
 *
 * What is left under a prop on bare ground is 15 mm plus the terrain's own bake
 * sag, so 15-21 mm, which is the same order as the 7-12 mm a prop on the
 * carriageway is buried by and has never been visible.  Driving it to zero
 * means killing the sag, and that costs tessellation on the largest mesh in the
 * world for something under a millimetre of screen space at walking distance.
 */
export const TERRAIN_DROP = 0.015;
/* The road runs the length of the district.  Z_MIN was extended when the
 * school went in at the top of the hill: the uphill stretch past the crossing
 * *is* the 通学路, so the carriageway has to reach the school gate and stop
 * beyond it at a dead end rather than being cut off mid-slope. */
export const Z_MIN = -66;
export const Z_MAX = 52;

/** Track centre is z = 0; the gates stand just outside the ballast. */
export const TRACK_HALF = 2.2;
export const GATE_Z = 2.95;
export const CROSS_BAND = 3.35;

/** Lateral drift of the road centre. */
export function centerX(z) {
  let x = 0;
  x += 3.0 * sstep(-11, -36, z);
  x -= 3.4 * sstep(16, 44, z);
  return x;
}

/** Ground height along the street: it climbs gently past the crossing. */
export function groundY(z) {
  return 1.05 * sstep(-13, -32, z) + 0.45 * sstep(28, 48, z);
}

/** Signed distance from the road centre. */
export function lateral(x, z) {
  return x - centerX(z);
}

export function isSidewalk(x, z) {
  /* **Bounded in z, and it was not.**  The footway band is a lateral test, so
   * without this line `streetHeight` answered `groundY + WALK_H` for the two
   * 1.55 m strips at |x - centerX| ∈ (3.13, 4.70) at *every* z in the world --
   * including the open fields north of z = 52 and south of z = -66 where the
   * carriageway does not exist.  That is two invisible 0.135 m ledges running
   * off to the horizon: the player steps up onto one, and every prop a builder
   * seats with `ctx.groundAt` inside the band floats by exactly a kerb height.
   * It never showed because until the six residential blocks went in, nothing
   * was ever built out there.  Measured at (-7.4, 75): 0.585 against a ground
   * of 0.450.
   *
   * Anything that legitimately continues the footway past the ends -- 四丁目's
   * road head is the only one -- lays a real pad, and `pad()` registers a
   * platform, so the height query still finds it. */
  if (z < Z_MIN || z > Z_MAX) return false;
  const d = Math.abs(lateral(x, z));
  if (Math.abs(z) < CROSS_BAND) return false;
  return d > ROAD_HALF - 0.02 && d < ROAD_HALF + WALK_W;
}

/** Height of the walkable surface (road, kerb, crossing deck). */
export function streetHeight(x, z) {
  return groundY(z) + (isSidewalk(x, z) ? WALK_H : 0);
}

/* ----------------------------- strip builder ----------------------------- */

/**
 * Quad strip swept along z.  `a(z)` and `b(z)` return the two edge points;
 * for horizontal surfaces a is the -X edge, for vertical faces a is the
 * bottom edge.
 */
export function makeStrip({ z0, z1, step = 1.2, a, b, uv = [1, 1], flip = false }) {
  const rows = Math.max(2, Math.round(Math.abs(z1 - z0) / step) + 1);
  const pos = [];
  const uvs = [];
  const idx = [];
  for (let i = 0; i < rows; i++) {
    const t = i / (rows - 1);
    const z = z0 + (z1 - z0) * t;
    const pa = a(z);
    const pb = b(z);
    pos.push(pa.x, pa.y, z, pb.x, pb.y, z);
    uvs.push(0, t * uv[1], uv[0], t * uv[1]);
  }
  for (let i = 0; i < rows - 1; i++) {
    const o = i * 2;
    if (flip) idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
    else idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Two strips, one on each side of the road, offset from the centre. */
function sideStrips(ctx, { from, to, mat, off0, off1, y, uv, receive = true, name }) {
  for (const s of [1, -1]) {
    const a = (z) => ({ x: centerX(z) + s * (s > 0 ? off0 : off1), y: groundY(z) + y });
    const b = (z) => ({ x: centerX(z) + s * (s > 0 ? off1 : off0), y: groundY(z) + y });
    const g = makeStrip({ z0: from, z1: to, a, b, uv, flip: s < 0 });
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = receive;
    m.name = (name || 'strip') + (s > 0 ? '_r' : '_l');
    ctx.add(m);
  }
}

/* -------------------------------- builder -------------------------------- */

export function buildStreet(ctx) {
  const rng = rngKit(9137);

  const matTerrain = cel({ color: 0xc4c4b6, bands: 3, tint: 0x7a7396 });
  const matRoad = cel({ color: PAL.road, bands: 3, tint: 0x6a608f });
  const matRoadPatch = cel({ color: PAL.roadWorn, bands: 3, tint: 0x6a608f });
  const matWalk = cel({ color: PAL.sidewalk, bands: 3, tint: 0x7d74a0 });
  const matWalkAlt = cel({ color: PAL.sidewalkAlt, bands: 3, tint: 0x7d74a0 });
  const matCurb = cel({ color: PAL.curb, bands: 3, tint: 0x6f6790 });
  const matLine = cel({ color: PAL.lineWhite, bands: 2, tint: 0x8e86ad });
  const matGutter = cel({ color: PAL.gutter, bands: 3, tint: 0x6f6790 });
  const matDrain = cel({ color: PAL.drain, bands: 3, map: drainTex(), tint: 0x5d5878 });
  const matTactile = cel({ color: 0xffffff, bands: 2, map: tactileTex(), tint: 0x9a7f4a });

  /* --- terrain: one displaced grid so the whole valley follows the slope --- */
  {
    /* 160 rather than 128, and it is *cheaper*: at 2.5 m the cell diagonal is
     * 3.54 m, so `subdivideLongEdges` bisects every triangle in the grid on the
     * way to the sphere and 32k becomes 65k.  At 2.0 m the diagonal is 2.83 m,
     * under the 3.0 m limit, so nothing is split and the mesh arrives as the
     * 51k it was authored as.  The shorter chord also sags 6 mm on the sphere
     * instead of 10 mm, and that sag is most of what is left under a prop. */
    const w = 320, d = 320, seg = 160;
    const OFF = -20;
    const ROW = d / seg;                          // 2.0 m between grid rows in z
    /* The grid samples the profile at its rows and *chords* between them, and a
     * chord across the convex half of a smoothstep runs above the curve -- by
     * f''h²/8, which is 9 mm on the climb past the crossing and so most of a
     * 15 mm budget.  Dropping each row by its own chord excess, measured at the
     * midpoint of the row either side, puts the interpolated surface under the
     * plane everywhere instead of only at the vertices.  The bake can only sag
     * it further down from there, never up. */
    const plane = (z) => groundY(z) - TERRAIN_DROP;
    const rowY = (z) => {
      let excess = 0;
      for (const s of [-1, 1]) {
        const chordMid = (plane(z) + plane(z + s * ROW)) / 2;
        excess = Math.max(excess, chordMid - plane(z + (s * ROW) / 2));
      }
      return plane(z) - excess;
    };
    const g = new THREE.PlaneGeometry(w, d, seg, seg);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      // the mesh is offset in z, so the slope must be sampled in world space
      p.setY(i, rowY(p.getZ(i) + OFF));
    }
    // the drainage channel is cut out of the graded ground, not pressed into
    // it -- see landform.js for why
    g.translate(0, 0, OFF);
    cutTrench(g);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, matTerrain);
    m.receiveShadow = true;
    m.name = 'terrain';
    ctx.add(m);
  }

  /* --- asphalt --- */
  {
    const a = (z) => ({ x: centerX(z) - ROAD_HALF, y: groundY(z) + 0.012 });
    const b = (z) => ({ x: centerX(z) + ROAD_HALF, y: groundY(z) + 0.012 });
    const m = new THREE.Mesh(makeStrip({ z0: Z_MIN, z1: Z_MAX, a, b, step: 1.1 }), matRoad);
    m.receiveShadow = true;
    m.name = 'road';
    ctx.add(m);
  }

  /* --- a few flat repair patches so the asphalt is not a dead field --- */
  {
    const patches = [
      [-0.9, 8.4, 2.6, 3.2], [1.6, 19.5, 2.0, 4.4], [-1.4, -8.5, 3.0, 2.4],
      [0.8, 27.0, 2.4, 5.0], [-1.9, 34.0, 2.2, 3.6], [2.0, -20.0, 2.2, 3.0],
    ];
    for (const [dx, z, w, d] of patches) {
      const g = new THREE.PlaneGeometry(w, d);
      g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, matRoadPatch);
      m.position.set(centerX(z) + dx, groundY(z) + 0.018, z);
      m.receiveShadow = true;
      m.userData.noOutline = true;
      ctx.add(m);
    }
  }

  /* --- white edge lines, broken by the crossing --- */
  for (const [z0, z1] of [[Z_MIN, -CROSS_BAND], [CROSS_BAND, Z_MAX]]) {
    sideStrips(ctx, {
      from: z0, to: z1, mat: matLine, off0: 2.72, off1: 2.86, y: 0.024, name: 'edgeline',
    });
  }

  /* --- painted road text and crossing-ahead diamonds ---
   * These do double duty: they are correct Japanese road furniture, and they
   * keep a wide sweep of near-camera asphalt from reading as a dead field. */
  {
    const paint = (kind, dx, z, size, ry = 0) => {
      const g = new THREE.PlaneGeometry(size, size * 1.9);
      g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, flat({
        color: 0xffffff, map: roadPaint(kind), transparent: true,
        depthWrite: false, cache: false,
      }));
      m.position.set(centerX(z) + dx, groundY(z) + 0.022, z);
      m.rotation.y = ry;
      m.userData.noOutline = true;
      m.renderOrder = 1;
      ctx.add(m);
    };
    paint('stop', 1.45, 8.5, 1.5);
    paint('stop', -1.5, -9.6, 1.5, Math.PI);
    paint('diamond', 1.5, 16.5, 1.35);
    paint('diamond', -1.55, -17.5, 1.35, Math.PI);
    paint('diamond', 1.6, 25.0, 1.3);
  }

  /* --- stop bars either side of the crossing --- */
  for (const s of [1, -1]) {
    const z = s * (CROSS_BAND + 0.85);
    const g = new THREE.PlaneGeometry(2.55, 0.42);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, matLine);
    m.position.set(centerX(z) + s * 1.35, groundY(z) + 0.026, z);
    m.userData.noOutline = true;
    ctx.add(m);
  }

  /* --- kerbs and pavement --- */
  for (const [z0, z1] of [[Z_MIN, -CROSS_BAND], [CROSS_BAND, Z_MAX]]) {
    sideStrips(ctx, {
      from: z0, to: z1, mat: matWalk,
      off0: ROAD_HALF, off1: ROAD_HALF + WALK_W, y: WALK_H, name: 'walk',
    });
    // kerb face
    for (const s of [1, -1]) {
      const a = (z) => ({ x: centerX(z) + s * ROAD_HALF, y: groundY(z) + 0.0 });
      const b = (z) => ({ x: centerX(z) + s * ROAD_HALF, y: groundY(z) + WALK_H });
      const g = makeStrip({ z0, z1, a, b, flip: s < 0 });
      const m = new THREE.Mesh(g, matCurb);
      m.receiveShadow = true;
      ctx.add(m);
    }
    // outer edge of the pavement, slightly warmer tone
    sideStrips(ctx, {
      from: z0, to: z1, mat: matWalkAlt,
      off0: ROAD_HALF + WALK_W, off1: ROAD_HALF + WALK_W + 0.22, y: WALK_H, name: 'walkedge',
    });
    // tactile paving -- the yellow line that runs the length of the street
    sideStrips(ctx, {
      from: z0, to: z1, mat: matTactile,
      off0: ROAD_HALF + 0.44, off1: ROAD_HALF + 0.78, y: WALK_H + 0.014,
      uv: [1, Math.abs(z1 - z0) / 0.34], name: 'tactile',
    });
  }

  /* --- drainage channel along the kerb, with grates --- */
  for (const [z0, z1] of [[Z_MIN, -CROSS_BAND], [CROSS_BAND, Z_MAX]]) {
    sideStrips(ctx, {
      from: z0, to: z1, mat: matGutter,
      off0: ROAD_HALF - 0.30, off1: ROAD_HALF - 0.02, y: 0.004, name: 'gutter',
    });
  }
  {
    const grateDepth = 0.62;
    const g = new THREE.BoxGeometry(0.26, 0.05, grateDepth);
    const count = 26;
    const inst = new THREE.InstancedMesh(g, matDrain, count);
    let i = 0;
    const dummy = new THREE.Object3D();
    for (let z = -44; z <= 46 && i < count; z += 7.4) {
      if (Math.abs(z) < CROSS_BAND + 1.2) continue;
      const s = i % 2 === 0 ? 1 : -1;
      dummy.position.set(centerX(z) + s * (ROAD_HALF - 0.16), groundY(z) + 0.03, z);
      dummy.rotation.set(0,
        Math.atan2(centerX(z + grateDepth / 2) - centerX(z - grateDepth / 2), grateDepth), 0);
      dummy.updateMatrix();
      inst.setMatrixAt(i++, dummy.matrix);
    }
    inst.count = i;
    inst.receiveShadow = true;
    ctx.add(inst);
  }

  /* --- manhole covers --- */
  {
    const g = new THREE.CylinderGeometry(0.32, 0.32, 0.04, 12);
    const inst = new THREE.InstancedMesh(g, cel({ color: PAL.metalDark, bands: 3 }), 7);
    const dummy = new THREE.Object3D();
    const spots = [[-1.1, 6.2], [1.4, 15.0], [-0.6, -9.5], [1.9, 24.0], [-1.7, 31.5], [0.4, -19.0], [2.2, 41.0]];
    spots.forEach(([dx, z], i) => {
      dummy.position.set(centerX(z) + dx, groundY(z) + 0.024, z);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    });
    inst.receiveShadow = true;
    ctx.add(inst);
  }

  /* --- side alley: a level gap in the left-hand frontage --- */
  {
    const zc = 17.6;
    const xc = centerX(zc) - (ROAD_HALF + WALK_W + 1.9);
    const g = new THREE.Group();
    const alleyMat = cel({ color: PAL.concrete, bands: 3, tint: 0x6f6790 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 3.0), alleyMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(xc - 1.2, groundY(zc) + WALK_H + 0.005, zc);
    floor.receiveShadow = true;
    g.add(floor);
    // street-name plate at the mouth of the alley
    const post = cyl(0.045, 0.045, 2.1, 8, cel({ color: PAL.metalDark, bands: 3 }),
      xc + 1.6, groundY(zc) + WALK_H + 1.05, zc + 1.5);
    post.castShadow = true;
    g.add(post);
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.28, 0.04),
      [
        flat({ color: PAL.wallWhite }), flat({ color: PAL.wallWhite }),
        flat({ color: PAL.wallWhite }), flat({ color: PAL.wallWhite }),
        flat({ color: 0xffffff, map: alleyPlate(), cache: false }),
        flat({ color: PAL.wallGray }),
      ]
    );
    plate.position.set(xc + 1.6, groundY(zc) + WALK_H + 1.98, zc + 1.53);
    plate.castShadow = true;
    g.add(plate);
    ctx.add(g);
    /* This gap is level: the former three steps climbed sideways into the
     * neighbouring house, while a broad collider treated the whole paving as
     * a wall.  Register the visible slab as a low walkable continuation of
     * the footway instead. */
    ctx.platform({
      x0: xc - 3.3, x1: xc + 0.9,
      z0: zc - 1.5, z1: zc + 1.5,
      top: groundY(zc) + WALK_H + 0.005,
    });
  }

  /* --- no-parking sign on the near right --- */
  {
    const z = 22.0;
    const x = centerX(z) + ROAD_HALF + 1.2;
    const y = groundY(z) + WALK_H;
    const post = cyl(0.045, 0.05, 2.4, 8, cel({ color: PAL.metal, bands: 3 }), x, y + 1.2, z);
    post.castShadow = true;
    ctx.add(post);
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.3, 0.035, 20),
      [cel({ color: PAL.wallWhite, bands: 2 }),
       flat({ color: 0xffffff, map: noParking(), cache: false }),
       cel({ color: PAL.wallGray, bands: 2 })]
    );
    disc.rotation.set(0, -0.28, Math.PI / 2);
    disc.position.set(x, y + 2.15, z);
    disc.castShadow = true;
    ctx.add(disc);
  }

  return { rng };
}
