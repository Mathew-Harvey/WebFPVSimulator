/*
 * scene.js: the world.
 *
 * Art direction, in the order it matters:
 *
 * Value structure. The sky is the brightest thing, the ground sits a clear
 * step below it, and objects sit a step below that, so a silhouette always
 * separates from what is behind it. Everything else is detail.
 *
 * Warm light, cool shadow. Handled by the ramp in celmat.js, but the world
 * has to cooperate: the hemisphere light is sky blue from above and warm
 * green from below so bounce reads as grass light, and the fog is the same
 * hue as the horizon band of the sky so distance dissolves instead of
 * clipping.
 *
 * Ground detail near, silhouettes far. The turf is the terrain's own
 * colour. Grass blades are not drawn: they were scaled to a few
 * centimetres and vanished at racing height while still costing half a
 * million triangles twice a frame. Trees and rocks carry the near
 * parallax, and the mountain rings carry the horizon.
 *
 * All static scenery is authored directly in Three.js space (y up). Only
 * the quad's simulated state crosses frames, and that conversion lives in
 * frame.js and nowhere else.
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
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  celMaterial, outlineHull, updateCelTime, CLOUD_SHADOW_GLSL,
  CLOTH_CHUNK, FLAG_SAIL_CLOTH,
} from './celmat.js';
import { disposeSceneGraph } from './shell.js';
import { SESSION_TEXTURES } from './session-textures.js';
/* The obstacle dimensions come from the track module, which holds MultiGP's
 * published figures and converts from feet exactly once. No dimension in
 * this file is typed twice. */
import { builtObstacle, BUILT_FRAME_TUBE_OD, GATE_SCALE } from '../game/track.js';
import { qualityFor } from './quality.js';
/* The shape of the built in circuit, shared with the map screen's thumbnail
 * so the picture of the course and the course cannot drift apart. */
import { circuitPoint, CIRCUIT_POINTS, CIRCUIT_STATIONS } from '../game/circuit.js';
import { GUIDE, guideFromPolyline } from '../game/guide.js';
/* The gate frame belongs to the scorer, so the mesh and the test agree. */
import { travelAxis } from '../game/race.js';
import { buildGuideMesh } from './marks.js';
/* The printed vinyl a course is dressed in, shared with the track builder's
 * own preview so an author sees the gates they will fly. See src/art/. */
import {
  BANNER_SIZE, bannerCanvas, bannerHex, GATE_BANNER_H, HEADER_NUMBER_ZONE,
  paintGateHeader, paintGateSleeve, paintFlagSailPair, paintGroundLogo, GROUND_TURF,
  flagMast, flagSailProfile,
} from '../art/banners.js';
import {
  assembleStartBlock, startBlockContactHeight, START_BLOCK_WOOD, START_BLOCK_WOOD_DARK,
  START_BLOCK_FOAM, START_BLOCK_LIP,
} from '../art/startblock.js';
/* The club's pavilion. Both race maps get one, because a race field is a
 * club's field; the freestyle city is a different world and does not. */
import {
  assembleClubhouse, assembleCarPark, assembleDriveway, paintPlaque,
  CLUBHOUSE_PAD, CLUBHOUSE_TOP, PLAQUE_PX, CAR_PARK,
} from '../art/clubhouse.js';
import { Colliders } from '../game/collide.js';

/*
 * Static scenery merger. A forest of individual Groups costs a draw call
 * per mesh, twice (once for the view, once for the outline prepass), and
 * that is what turns four hundred trees into four thousand draws. Every
 * static object is instead baked into one merged mesh per distinct
 * material, keyed by the material options, so the whole forest, all the
 * rocks, the cliffs and the mountain rings come down to a couple of dozen
 * draws with pixels identical to the unmerged scene.
 */
function makeBaker() {
  const buckets = new Map();
  function bake(root) {
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      if (!o.isMesh) {
        return;
      }
      let key;
      if (o.material.userData.celKey != null) {
        key = `cel:${o.material.userData.celKey}`;
      } else if (o.material.userData.hullColor != null) {
        key = `hull:${o.material.userData.hullColor}`;
      } else {
        key = `mat:${o.material.uuid}`;
      }
      let b = buckets.get(key);
      if (!b) {
        b = { material: o.material, hull: o.material.userData.hullColor != null, geos: [] };
        buckets.set(key, b);
      }
      /* Non-indexed so polyhedra and cylinders merge into one buffer. */
      const geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      geo.applyMatrix4(o.matrixWorld);
      b.geos.push(geo);
    });
  }
  function flush(scene, layer) {
    const meshes = [];
    for (const b of buckets.values()) {
      const mesh = new THREE.Mesh(mergeGeometries(b.geos, false), b.material);
      if (!b.hull) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
      if (layer) {
        mesh.layers.set(layer);
      }
      scene.add(mesh);
      meshes.push(mesh);
    }
    buckets.clear();
    return meshes;
  }
  return { bake, flush };
}

const SUN_DIR = new THREE.Vector3(0.60, 0.50, 0.62).normalize();
const HORIZON = 0xf2e3cb;
/* Zenith blue. Measured at 0x2e6bb8 the sky's linear luminance was 0.248
 * and the lit meadow's was 0.257, so sky and ground occupied ONE value
 * band and separated by hue alone. Blue carries little luminance, so the
 * fix is a paler zenith rather than a bluer one. */
const SKY_HIGH = 0x6ea3d8;
/*
 * The sky, as a function, because two surfaces need it and they must not
 * disagree. The dome calls it for the direction the eye is looking, and the
 * water calls it for the direction the eye is looking AFTER reflecting off
 * the surface. If the water carried its own sky colours, a reflection would
 * be a different sky from the one overhead, which is the single fastest way
 * to make water read as painted plastic.
 *
 * Everything in here was authored on the dome and is unchanged: the 1.25
 * altitude gain with a 0.06 lift, the nine band posterisation mixed half way
 * back to the smooth gradient, and both sun terms with the ceilings that the
 * clipped sun fix established.
 */
const SKY_GLSL = /* glsl */ `
  vec3 celSkyColor(vec3 dir, vec3 sunDir, vec3 horizonCol, vec3 highCol) {
    /*
     * Re-normalise. On the dome vDir is a unit vector at each vertex, but a
     * varying interpolates linearly through the triangle, so inside a face
     * it is short by up to half a percent on a 40 by 24 dome. That was
     * invisible in the gradient and fatal to the sun, whose disc is a
     * threshold on dot(dir, sun): the old step could only fire where the
     * interpolated length happened to survive, so the disc was not a circle
     * at all but a patchwork following the tessellation.
     */
    vec3 vd = normalize(dir);
    float h = clamp(vd.y * 1.25 + 0.06, 0.0, 1.0);
    /*
     * Posterised, but only part way. At five bands with a hard step the band
     * edge is a single enormous pale arc sweeping across the sky, and in a
     * still that reads as a rendering fault rather than as a style: it was
     * the most visible artefact in every frame. Nine bands, a wider smooth
     * edge, and a mix back toward the smooth gradient keep the poster feel
     * without the arc.
     */
    float b = h * 9.0;
    float stepped = (floor(b) + smoothstep(0.35, 0.95, fract(b))) / 9.0;
    float band = mix(h, stepped, 0.5);
    vec3 col = mix(horizonCol, highCol, band);
    /*
     * Sun: a warm glow, then a disc.
     *
     * Both terms used to be added on top of a sky that was already at 0.59,
     * 0.72, 0.83 at the sun's altitude. The glow alone reached 1.0 in every
     * channel by 7.8 degrees off axis, and the disc, a 4 degree half angle
     * and thirty times the real sun, then added a further 1.0 on top of
     * that: 1.9 percent of the frame pinned at 254 or higher. So a tighter
     * glow in a colour that lifts red and green without pushing the already
     * high blue, and a disc composed by mix() to a ceiling below full white
     * with a soft outer ramp so it resolves instead of stairing. Core 1.0
     * degree half angle, ramp out to 1.6.
     */
    float sd = max(dot(vd, normalize(sunDir)), 0.0);
    col += vec3(1.0, 0.80, 0.42) * pow(sd, 40.0) * 0.30;
    col = mix(col, vec3(0.985, 0.965, 0.905), smoothstep(0.99961, 0.99985, sd));
    return col;
  }
`;
const FOG_NEAR = 130;
/* 2200, not 780. At 780 every piece of terrain past that distance renders
 * as exactly the horizon colour, 0.781 linear, which leaves no room above
 * it for a mountain ladder that also has to stay below the sky. At 2200
 * the terrain's far edge at 850 m lands at 0.428 and the four ridge rings
 * fit above it at 0.49, 0.56, 0.63 and 0.70 with the sky at 0.781. */
const FOG_FAR = 2200;

/* Deterministic hash based noise: the world must be identical every load,
 * so two people comparing notes are describing the same place. */
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/* Smooth value noise for the terrain, built from the same integer hash. */
function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
}
function valueNoise(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}
function fbm(x, y) {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let o = 0; o < 4; o += 1) {
    sum += amp * valueNoise(x * freq, y * freq);
    norm += amp;
    amp *= 0.5;
    freq *= 2.07;
  }
  return sum / norm;
}

/* Figure of eight circuit. */
function trackCurve() {
  const pts = [];
  for (let i = 0; i < CIRCUIT_POINTS; i += 1) {
    const p = circuitPoint(i / CIRCUIT_POINTS);
    pts.push(new THREE.Vector3(p.x, p.y, p.z));
  }
  return new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.4);
}

/*
 * THE GROUND, TRACED OFF THE CLUB'S OWN AERIAL.
 *
 * The world used to be an invented valley with a lake in it. It is the West
 * Coast club's flying ground now: an open paddock ringed by native bush, the
 * pavilion along its southern edge, the car park off its eastern corner, and
 * nothing else out there. The lake is gone.
 *
 * THE SHAPE IS THE PHOTOGRAPH'S, THE SIZE IS NOT, and that is a decision the
 * owner made rather than an approximation that crept in. Measured off the
 * aerial, the clubhouse spans about 61 percent of the paddock's width. In
 * here it spans 22 percent, because the pavilion is built at its real 53 m
 * and the built in circuit is 210 m wide and needs 15 m of scenery standoff
 * all round. Both cannot be true at once: matching the photograph's
 * proportions means either shrinking the circuit to about 90 m, which moves
 * every gate and voids the track record and every time posted against it, or
 * drawing the pavilion at 146 m. So the OUTLINE is traced exactly, in the
 * proportions the aerial gives, and scaled up until the course fits inside
 * it. Every structure stays its real size.
 *
 * The outline below is the paddock's five corners read off the aerial in
 * pixels, normalised by the paddock's own width and by its southern edge,
 * which is the line the pavilion stands on. Keeping them normalised is what
 * lets the one number underneath decide how big the ground is without
 * touching the shape.
 */
/*
 * THE X IS NEGATED AGAINST THE AERIAL'S PIXELS, and that is a compass
 * correction rather than a typo.
 *
 * A pilot on the verandah faces +Z, which is the way the pavilion looks out
 * over the field. In a right handed, Y up world their right hand is
 * cross(forward, up) = cross((0,0,1),(0,1,0)) = (-1,0,0). So EAST, the side
 * the aerial puts the car park on, is NEGATIVE X, and +X is the pilot's left.
 *
 * Read straight off the photograph's pixels the whole ground came out mirrored:
 * the diagonal boundary that runs down the west side of the paddock sat on the
 * pilot's right, and the car park was on the wrong side of the field from
 * anyone who actually flies there. Negating here fixes the outline, and the
 * car park and its road are placed against the corrected outline below.
 */
const SITE_SHAPE = [
  [0.227, 1.222],
  [-0.500, 1.141],
  [-0.500, 0.000],
  [0.406, 0.000],
  [0.500, 0.234],
];

/*
 * How wide the paddock is, in metres.
 *
 * 260, and it is solved rather than chosen. Walked at 2000 points, the
 * circuit's closest approach to the boundary is 15.3 m at (64, -42), which
 * clears the 15 m the scenery rule keeps between anything solid and the
 * racing line. At 240 it is 11.1 m and the trees are inside the course; at
 * 220, 1.8 m. Above 260 nothing improves, because the binding edge is the
 * southern one and that is pinned to the pavilion rather than scaled.
 */
const SITE_W = 260;
/* The pavilion's front wall, which the aerial's southern boundary runs
 * along. Shared with clubhouseSite so the two cannot drift. */
const SITE_SOUTH = -57;

const SITE = SITE_SHAPE.map(([nx, ny]) => ({ x: nx * SITE_W, z: SITE_SOUTH + ny * SITE_W }));

/*
 * The mown rectangle inside the paddock: the green, marked part of the aerial
 * with the goals on it, as opposed to the dry ground north of it. Read off
 * the same photograph in the same normalised units.
 */
const SITE_MOWN = {
  x0: -0.4219 * SITE_W,
  x1: 0.4375 * SITE_W,
  z0: SITE_SOUTH + 0.0469 * SITE_W,
  z1: SITE_SOUTH + 0.6406 * SITE_W,
};

/*
 * The car park, off the paddock's eastern corner and running north from the
 * pavilion, where the aerial has it. Its SIZE is real, about 60 by 16 m for
 * some twenty five bays, rather than the 190 m the paddock's scaling would
 * have stretched it to. Structures keep their own size; only the ground is
 * drawn large.
 */
/*
 * WHERE THE CAR PARK IS.
 *
 * Off the paddock's eastern corner, running north from the pavilion's end,
 * which is where the aerial has it. Its centre is 10 m outside the boundary
 * so the bays back onto the bush and the aisle faces the field, and its
 * SIZE comes from CAR_PARK rather than from the paddock's scaling: 60 by
 * 16 m, about twenty five bays. Stretching it the way the outline is
 * stretched would have drawn a 190 m car park.
 *
 * The rectangle below is derived from that one size, so the patch of ground
 * that gets levelled, the trees that get kept off it and the thing that
 * actually gets drawn cannot drift apart.
 */
const CARPARK_AT = { x: SITE[2].x - 10 - CAR_PARK.w * 0.5, z: -20 };
const SITE_CARPARK = {
  x0: CARPARK_AT.x - CAR_PARK.w * 0.5 - CAR_PARK.kerb,
  x1: CARPARK_AT.x + CAR_PARK.w * 0.5 + CAR_PARK.kerb,
  z0: CARPARK_AT.z - CAR_PARK.len * 0.5 - CAR_PARK.kerb,
  z1: CARPARK_AT.z + CAR_PARK.len * 0.5 + CAR_PARK.kerb,
};
/* The road runs west from the car park's southern end to the pavilion's
 * apron, along the outside of the paddock's southern boundary. */
const DRIVE_Z = SITE_SOUTH - 8;

/* Distance from a point to one segment, for the boundary tests below. */
function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const len = dx * dx + dz * dz;
  let t = len > 0 ? ((px - ax) * dx + (pz - az) * dz) / len : 0;
  t = t < 0 ? 0 : (t > 1 ? 1 : t);
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

/*
 * Signed distance to the paddock boundary: NEGATIVE INSIDE, metres outside.
 * The same sign convention pitchEdge uses, so the two read alike.
 */
function siteEdge(x, z) {
  let d = Infinity;
  let inPoly = false;
  /* The previous corner, written out rather than carried in a second loop
   * variable. `for (let i = 0, j = n - 1; i < n; j = i += 1)` looks like the
   * usual ray casting idiom and is not it: `j = i += 1` assigns the NEW i, so
   * j equals i on every pass, every edge collapses to a point, and the whole
   * polygon reports as a single degenerate segment. It cost a round: the
   * ground came out uniformly dry because nothing was ever inside, and the
   * treeline came out as one diagonal streak because the perimeter walk had
   * one real edge to walk. */
  for (let i = 0; i < SITE.length; i += 1) {
    const a = SITE[i];
    const b = SITE[(i + SITE.length - 1) % SITE.length];
    d = Math.min(d, segDist(x, z, a.x, a.z, b.x, b.z));
    if ((a.z > z) !== (b.z > z)
      && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) {
      inPoly = !inPoly;
    }
  }
  return inPoly ? -d : d;
}

/* Inside the mown rectangle, which is where the grass is green. */
function onMown(x, z) {
  return x >= SITE_MOWN.x0 && x <= SITE_MOWN.x1 && z >= SITE_MOWN.z0 && z <= SITE_MOWN.z1;
}

/* Inside the car park or on its road, neither of which anything grows on. */
function onCarPark(x, z) {
  if (x >= SITE_CARPARK.x0 - 3 && x <= SITE_CARPARK.x1 + 3
    && z >= SITE_CARPARK.z0 - 3 && z <= SITE_CARPARK.z1 + 3) {
    return true;
  }
  return Math.abs(z - DRIVE_Z) < 5.5 && x > SITE_CARPARK.x0 && x < 40;
}

/*
 * THE FENCE.
 *
 * Waist high chain link on the paddock boundary, which is where both of the
 * club's photographs put it: the ground level shot has the wire running dead
 * straight across the far side of the field with the gums behind it, and the
 * aerial has the same line closing the paddock off from the bush.
 *
 * 1.05 m of fabric on posts at 2.6 m centres, which is a real domestic chain
 * link run. Waist high means a pilot can see over it from the pits and a quad
 * has to be low to meet it, so it marks the ground without walling it in.
 *
 * THE FABRIC IS A TEXTURE WITH AN ALPHA TEST, not geometry and not a
 * transparent band. Chain link is mostly holes: drawn as a solid translucent
 * strip it reads as smoked glass, and drawn as real diamonds it is tens of
 * thousands of triangles for a thing that is under a pixel wide most of the
 * time a pilot sees it. An alpha tested map is one draw call, needs no
 * sorting, and still has holes you can see the bush through when a quad is
 * hovering a metre off it.
 */
const FENCE = {
  height: 1.05,
  postH: 1.16,
  postR: 0.028,
  postStep: 2.6,
  /* How far outside the boundary line the fence stands, so it reads as the
   * paddock's edge rather than as a line drawn on the grass. */
  out: 0.6,
};

/*
 * The fabric, painted once. A diamond mesh: two sets of diagonal wires,
 * opaque where the wire is and clear everywhere else.
 *
 * The canvas is one tile 64 px square and the material repeats it, so the
 * whole kilometre of fence carries 16 kB of texture rather than a bitmap of
 * the run. RepeatWrapping in x only, because the fabric is one panel tall.
 */
function chainLinkTexture() {
  const N = 64;
  const cv = bannerCanvas(N, N);
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, N, N);
  ctx.strokeStyle = '#c9ced6';
  ctx.lineWidth = 3.0;
  ctx.lineCap = 'square';
  /* Two diagonals, wrapped, so the tile joins itself on every edge. */
  for (let k = -1; k <= 1; k += 1) {
    ctx.beginPath();
    ctx.moveTo(k * N, 0);
    ctx.lineTo(k * N + N, N);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(k * N, N);
    ctx.lineTo(k * N + N, 0);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 8;
  return tex;
}

/*
 * The fence, as one group: a post soup and a fabric strip, both following the
 * paddock's own boundary so the two cannot drift apart.
 *
 * Returns the group and the capsule runs the collider list needs. The fabric
 * is DOUBLE SIDED because a fence is seen from both sides and a pilot outside
 * the ground looking back in is a normal thing to be.
 */
function siteFence(height, postMat, meshMat) {
  const g = new THREE.Group();
  const runs = [];
  const posts = [];
  /*
   * How much fence one tile of the fabric covers. Two diamonds to a tile, so
   * 0.30 m is a 150 mm mesh: coarser than the 60 mm a real domestic run uses,
   * because at 60 mm the diamonds are under a pixel from anywhere but a
   * hover and the fence turns into a grey haze that shimmers as the quad
   * moves. Drawn at 0.72 first, which read as decorative lattice rather than
   * as wire.
   */
  const TILE = 0.30;

  for (let i = 0; i < SITE.length; i += 1) {
    const a = SITE[i];
    const b = SITE[(i + SITE.length - 1) % SITE.length];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) {
      continue;
    }
    const ux = dx / len;
    const uz = dz / len;
    /* Outward, so the line stands just off the boundary. */
    let nx = -uz;
    let nz = ux;
    if (siteEdge(a.x + ux * len * 0.5 + nx * 2, a.z + uz * len * 0.5 + nz * 2) < 0) {
      nx = -nx;
      nz = -nz;
    }
    const ax = a.x + nx * FENCE.out;
    const az = a.z + nz * FENCE.out;

    /* The fabric, one quad for the whole run, with the map repeating along
     * it so a 300 m side is not a stretched smear. */
    const y0 = height(ax, az);
    const y1 = height(ax + ux * len, az + uz * len);
    const geo = new THREE.BufferGeometry();
    const bx = ax + ux * len;
    const bz = az + uz * len;
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      ax, y0, az, bx, y1, bz, bx, y1 + FENCE.height, bz,
      ax, y0, az, bx, y1 + FENCE.height, bz, ax, y0 + FENCE.height, az,
    ]), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([
      nx, 0, nz, nx, 0, nz, nx, 0, nz,
      nx, 0, nz, nx, 0, nz, nx, 0, nz,
    ]), 3));
    const reps = Math.max(1, Math.round(len / TILE));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([
      0, 0, reps, 0, reps, 1,
      0, 0, reps, 1, 0, 1,
    ]), 2));
    g.add(new THREE.Mesh(geo, meshMat));

    /* Posts, and a collider run every 20 m so the fence is solid without
     * putting four hundred capsules in the broadphase. */
    const n = Math.max(1, Math.round(len / FENCE.postStep));
    for (let k = 0; k <= n; k += 1) {
      const t = (k / n) * len;
      posts.push({ x: ax + ux * t, z: az + uz * t });
    }
    const chunks = Math.max(1, Math.round(len / 20));
    for (let k = 0; k < chunks; k += 1) {
      const t0 = (k / chunks) * len;
      const t1 = ((k + 1) / chunks) * len;
      runs.push({
        ax: ax + ux * t0,
        az: az + uz * t0,
        bx: ax + ux * t1,
        bz: az + uz * t1,
      });
    }
  }

  for (const p of posts) {
    const y = height(p.x, p.z);
    const post = new THREE.Mesh(
      new THREE.BoxGeometry(FENCE.postR * 2, FENCE.postH, FENCE.postR * 2),
      postMat,
    );
    post.position.set(p.x, y + FENCE.postH * 0.5, p.z);
    g.add(post);
  }
  return { group: g, runs, posts: posts.length };
}

/*
 * THE PITCH: the mown, marked, level ground a designed course stands on.
 *
 * A track somebody drew is 60 by 40 m. The valley the race field lives in is
 * 1700 m across, its terrain rolls, and its scenery stands 15 m off the
 * racing line, which on a circuit 210 m wide is a clearing and on a 60 m
 * field is a tree beside a gate. Pushing the scenery further out would fix
 * the collisions and leave the course sitting in an arbitrary bald patch of
 * meadow.
 *
 * So a designed course gets a real arena: a rectangle the size of the field
 * its author drew plus a run off margin, levelled flat, mown, striped the way
 * a groundsman stripes a pitch, and marked with a white line on the field
 * boundary itself. Everything else in the world stays exactly where it was.
 * The course now stands somewhere rather than nowhere, and the reason no tree
 * is on it is a reason you can see.
 *
 * Nothing here touches the rng. The stripes and the line are functions of
 * position, the levelling is a function of position, and the grass, the
 * trees and the mountains draw from the world's one random stream in the one
 * order they always did.
 */
const PITCH = {
  /* Mown run off outside the author's boundary, in metres. */
  margin: 8,
  /* How far the mown edge fades into the meadow. */
  fade: 5,
  /* Stripe period, in metres. A groundsman's mower is about 1.5 m wide and
   * stripes are usually cut in pairs, so 5 m reads right from the air. */
  stripe: 5,
  /* The marking, in metres. Regulation football touchlines are 12 cm; this
   * is wider because it has to survive being seen from 40 m up at speed. */
  lineW: 0.3,
  /* The turf, from src/art/banners.js, because the builder's own preview of
   * a mark painted on the grass has to show it on the same green. Two copies
   * of a colour is how a preview drifts away from the thing it previews. */
  light: new THREE.Color(GROUND_TURF.light),
  dark: new THREE.Color(GROUND_TURF.dark),
  line: new THREE.Color(0xe6efe2),
};

export function makePitch(course) {
  if (!course) {
    return null;
  }
  return {
    halfW: course.field.width * 0.5,
    halfD: course.field.depth * 0.5,
    mownW: course.field.width * 0.5 + PITCH.margin,
    mownD: course.field.depth * 0.5 + PITCH.margin,
  };
}

/* Signed distance to the mown rectangle: negative inside, metres outside. */
function pitchEdge(pitch, x, z) {
  return Math.max(Math.abs(x) - pitch.mownW, Math.abs(z) - pitch.mownD);
}

/* 1 on the pitch, falling to 0 over the fade. */
function pitchCover(pitch, x, z) {
  if (!pitch) {
    return 0;
  }
  const d = pitchEdge(pitch, x, z);
  return Math.min(1, Math.max(0, 1 - d / PITCH.fade));
}

/*
 * WHERE THE CLUBHOUSE STANDS.
 *
 * Beside the field, on its long side, facing in. Which is one rule for both
 * race maps, because both of them ARE a rectangle of playing surface with a
 * racing line inside it: a designed course brings the rectangle with it as
 * its pitch, and the built in circuit's is the 210 by 83 m box its figure
 * eight lives in.
 *
 * The complex is placed by its FRONT WALL, which is the local origin, so the
 * numbers below are the distance from the field's edge to the building rather
 * than to the middle of a car park.
 */
/* Clear meadow between the mown edge and the levelled clubhouse ground, so
 * the two flat rectangles read as two places rather than one big shelf. */
const CLUB_GAP = 3;
/*
 * The built in circuit's site, measured rather than chosen.
 *
 * At z = -57 the pad's own rectangle carries 2.84 m of natural relief, all of
 * it fill, which the terrace's retaining faces and a 22 m graded bank absorb
 * without a cliff. Its apron stops 32.3 m short of the racing line and its
 * front wall 40.3 m, so it is well outside the 15 m the scenery rule keeps
 * clear and a pilot who overshoots a gate has room to sort it out before
 * meeting a wall. Every cliff landmark is at least 169 m away and the lake is
 * 297 m away, so nothing this site displaces was placed on purpose.
 *
 * Further out is worse on both counts: the relief under the pad grows about
 * a metre per three metres of standoff, and the pavilion stops reading as
 * part of the course.
 */
const CLUB_FIELD_Z = -57;
/*
 * How far the levelling fades into the meadow. Twenty two metres, and the
 * number is set by the TERRAIN MESH rather than by taste: the ground is a
 * 1700 m plane at 230 segments, so its vertices are 7.4 m apart, and a fade
 * narrower than about three of them cannot resolve a bank at all. It comes
 * out as a torn edge with a vertex on the flat and the next one on the
 * hillside. The pitch gets away with a 5 m fade because a painted surface is
 * laid over the top of it; this bank is bare ground and has to be a bank.
 */
const CLUB_PAD_FADE = 22;

/*
 * The site, in world coordinates, plus the quarter turn that points the
 * verandah at the field. A quarter turn is a real constraint and not a
 * convenience: the clubhouse's colliders are axis aligned boxes in its own
 * frame, and only a quarter turn leaves them axis aligned in the world.
 */
export function clubhouseSite(pitch) {
  if (!pitch) {
    return { x: 0, z: CLUB_FIELD_Z, yaw: 0 };
  }
  const out = CLUB_GAP + PITCH.fade + CLUBHOUSE_PAD.z1;
  /* Along the longer side, which is where a pavilion goes: beside the run,
   * not across the end of it. */
  if (pitch.mownW >= pitch.mownD) {
    return { x: 0, z: -(pitch.mownD + out), yaw: 0 };
  }
  return { x: -(pitch.mownW + out), z: 0, yaw: Math.PI / 2 };
}

/*
 * The levelled ground the complex needs, as a world rectangle. Axis aligned,
 * because the yaw is a quarter turn: a quarter turn swaps x and z and negates
 * one of them, which maps a rectangle onto a rectangle.
 */
export function clubhousePad(site) {
  const c = Math.round(Math.cos(site.yaw));
  const sn = Math.round(Math.sin(site.yaw));
  const xs = [];
  const zs = [];
  for (const lx of [CLUBHOUSE_PAD.x0, CLUBHOUSE_PAD.x1]) {
    for (const lz of [CLUBHOUSE_PAD.z0, CLUBHOUSE_PAD.z1]) {
      xs.push(site.x + lx * c + lz * sn);
      zs.push(site.z - lx * sn + lz * c);
    }
  }
  return {
    x0: Math.min(...xs), x1: Math.max(...xs),
    z0: Math.min(...zs), z1: Math.max(...zs),
  };
}

/* Signed distance to the pad: negative inside, metres outside. */
function padEdge(pad, x, z) {
  return Math.max(pad.x0 - x, x - pad.x1, pad.z0 - z, z - pad.z1);
}

/* 1 on the pad, falling to 0 over the fade. */
function padCover(pad, x, z) {
  if (!pad) {
    return 0;
  }
  return Math.min(1, Math.max(0, 1 - padEdge(pad, x, z) / CLUB_PAD_FADE));
}

/*
 * The pitch's surface: mown stripes and a marked boundary, as a texture.
 *
 * NOT as terrain vertex colours, which is where this started. The terrain is
 * a 1700 m plane at 230 segments, so its vertices are 7.4 m apart, and a
 * 0.3 m touchline painted into a vertex colour is a line 25 times finer than
 * the mesh that carries it: it vanished completely and the stripes came out
 * as one smear. Fine markings need their own surface, so the pitch gets a
 * plane of its own with a painted texture, laid on the levelled ground.
 *
 * It is transparent at its own edge, so the mown rectangle fades into the
 * meadow instead of ending on a cut line, and the terrain underneath is
 * tinted the same green so the fade has somewhere to go.
 */
function pitchSurface(pitch, course) {
  const w = pitch.mownW * 2;
  const d = pitch.mownD * 2;
  /* Pixels per metre, so a 0.3 m marking is four pixels wide whatever size
   * of field somebody drew. Capped, because a 400 m field would otherwise
   * ask for a texture no browser will allocate. */
  const ppm = Math.min(16, Math.max(4, 2048 / Math.max(w, d)));
  const cw = Math.round(w * ppm);
  const ch = Math.round(d * ppm);
  const cv = document.createElement('canvas');
  cv.width = cw;
  cv.height = ch;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingQuality = 'high';

  /*
   * The sponsors' marks painted on the turf, and where they land on this
   * canvas.
   *
   * THE CANVAS IS THE FIELD, unflipped, and that is worth writing down
   * because getting it wrong mirrors somebody's logo and nothing else in
   * the scene would show it. The surface is a PlaneGeometry rotated -90
   * about X, so its uv (0, 0) corner sits at scene (-w/2, +d/2), and a
   * CanvasTexture flips Y, so uv (0, 0) is the canvas's BOTTOM left. The
   * two flips cancel: canvas +x runs along scene +x and canvas +y runs
   * along scene +z, both straight through.
   *
   * The heading does not cancel. A Three.js rotation of yaw about Y takes
   * local +x to scene (cos yaw, -sin yaw) in (x, z), and a canvas rotation
   * of phi takes +x to (cos phi, sin phi), so phi is MINUS the yaw.
   */
  const decals = (course && Array.isArray(course.decals)) ? course.decals : [];
  const logos = (course && Array.isArray(course.logos)) ? course.logos : [];
  const images = logos.map(() => null);
  const toPx = (x) => (x / w + 0.5) * cw;
  const toPy = (z) => (z / d + 0.5) * ch;

  const stripePx = PITCH.stripe * ppm;
  const inset = PITCH.margin * ppm;
  const lw = Math.max(2, PITCH.lineW * ppm);
  const alongX = w >= d;
  const span = alongX ? ch : cw;

  const paintTurf = () => {
    /* Stripes down the long axis, the way a mower drives it. */
    for (let i = 0; i * stripePx < span; i += 1) {
      ctx.fillStyle = i % 2 === 0 ? `#${PITCH.light.getHexString()}` : `#${PITCH.dark.getHexString()}`;
      if (alongX) {
        ctx.fillRect(0, i * stripePx, cw, stripePx);
      } else {
        ctx.fillRect(i * stripePx, 0, stripePx, ch);
      }
    }

    /* The marking, on the boundary the author drew rather than on the mown
     * edge: the mown ground outside it is run off. */
    ctx.strokeStyle = `#${PITCH.line.getHexString()}`;
    ctx.lineWidth = lw;
    ctx.strokeRect(inset, inset, cw - inset * 2, ch - inset * 2);

    /* The paint, over the stripes and the line the way real ground paint
     * goes over them. A decal whose mark has not decoded yet is skipped
     * rather than outlined: an empty box on the grass is worse than turf. */
    for (const dec of decals) {
      const mark = images[dec.logo];
      if (!mark) {
        continue;
      }
      const bw = Math.max(1, dec.w * ppm);
      const bd = Math.max(1, dec.d * ppm);
      ctx.save();
      ctx.translate(toPx(dec.x), toPy(dec.z));
      ctx.rotate(-dec.yaw);
      ctx.translate(-bw * 0.5, -bd * 0.5);
      paintGroundLogo(ctx, bw, bd, { logo: mark });
      ctx.restore();
    }

    /*
     * The racing line is NOT stamped here any more.
     *
     * It used to be, as a fallback for the raised mesh losing a depth
     * fight. The mesh has since grown a lift off the terrain,
     * polygonOffset -4 and depthWrite false, so it does not lose that
     * fight, and the fallback had become a second copy of every mark: flat
     * where the mesh follows the ground, and drawn at this canvas's
     * resolution, which is 2048 px across the whole mown area. On a big
     * field that is about 9 px per metre, so the 0.16 m arrow shaft came
     * out one and a half pixels wide. A crisp arrow with a jagged ghost of
     * itself underneath is what "the arrows look messy" turned out to be.
     * If the mesh ever does lose a depth fight, fix the fight rather than
     * painting the marks twice.
     */

    /* Fade the outer edge to nothing so the pitch joins the meadow. The
     * profile is a pure function of the pixel, so it is worked out once and
     * kept: a repaint after a mark decodes re-stamps it rather than running
     * four million smoothsteps again. */
    const img = ctx.getImageData(0, 0, cw, ch);
    for (let i = 0; i < edgeAlpha.length; i += 1) {
      img.data[i * 4 + 3] = edgeAlpha[i];
    }
    ctx.putImageData(img, 0, 0);
  };

  const fadePx = Math.max(2, PITCH.fade * ppm);
  const edgeAlpha = new Uint8Array(cw * ch);
  for (let y = 0; y < ch; y += 1) {
    for (let x = 0; x < cw; x += 1) {
      const e = Math.min(x, y, cw - 1 - x, ch - 1 - y);
      const a = Math.min(1, e / fadePx);
      edgeAlpha[y * cw + x] = Math.round(255 * a * a * (3 - 2 * a));
    }
  }
  paintTurf();

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const geo = new THREE.PlaneGeometry(w, d);
  geo.rotateX(-Math.PI / 2);
  /* Same material family as the terrain, so the pitch takes the same cel
   * ramp and the same cloud shadows and does not read as a decal. */
  const mat = celMaterial({ color: 0xffffff, rim: 0.0, cloudShadow: 0.34, transparent: true });
  mat.map = tex;
  const mesh = new THREE.Mesh(geo, mat);
  /* Two centimetres up. The ground under the pitch is levelled to exactly
   * zero, so this is clear of it without being a step anybody can see, and
   * it is under the 7.5 cm the quad parks at. */
  mesh.position.y = 0.02;
  mesh.receiveShadow = true;

  /*
   * The marks arrive late, the same way the banners' do, and the pitch is
   * repainted ONCE when the last of them has settled rather than once per
   * mark. The banner canvases are a few hundred pixels each so repainting
   * one is free; this one is up to 2048 across, and stamping the edge fade
   * across four million pixels five times over would be a visible hitch on
   * the frame a course loads.
   */
  const wanted = new Set(decals.map((dec) => dec.logo)
    .filter((i) => typeof logos[i] === 'string' && logos[i].startsWith('data:image/')));
  let pending = wanted.size;
  for (const slot of wanted) {
    const img = new Image();
    const settle = (ok) => {
      if (ok) {
        images[slot] = img;
      }
      pending -= 1;
      if (pending === 0) {
        paintTurf();
        tex.needsUpdate = true;
      }
    };
    img.onload = () => settle(true);
    img.onerror = () => settle(false);
    img.src = logos[slot];
  }
  return mesh;
}

/* Terrain height, shared by the mesh and by anything placed on it. */
function makeHeightField(samples, pitch, pad) {
  return (x, z) => {
    const base = (fbm(x * 0.0022, z * 0.0022) - 0.5) * 34;
    const detail = (fbm(x * 0.011, z * 0.011) - 0.5) * 4.5;
    let d = 1e9;
    for (const s of samples) {
      const dx = x - s.x;
      const dz = z - s.z;
      const dd = dx * dx + dz * dz;
      if (dd < d) {
        d = dd;
      }
    }
    d = Math.sqrt(d);
    /* Flatten a corridor along the circuit so the track is flyable, with a
     * soft shoulder so it does not look stamped. */
    const flat = Math.min(1, Math.max(0, (d - 30) / 70));
    const s2 = flat * flat * (3 - 2 * flat);
    let h = (base + detail) * s2;

    /*
     * THE PADDOCK IS LEVEL, because a club's flying ground is a paddock that
     * somebody graded and mows, not a hillside. The aerial shows it flat to
     * the fence on every side and the ground view confirms it: the far fence
     * line runs dead straight across the shot.
     *
     * Levelled to the same datum as the racing corridor, so no gate moves,
     * and faded over 40 m outside the boundary so the bush beyond it rises
     * away rather than ending on a cut line. 40 rather than the pitch's 5
     * because this edge is bare ground carrying a treeline, not a painted
     * surface laid over the join: the terrain is 7.4 m a vertex, so a fade
     * shorter than about five of them cannot draw a bank at all.
     */
    {
      const cover = Math.min(1, Math.max(0, 1 - siteEdge(x, z) / 40));
      const smooth = cover * cover * (3 - 2 * cover);
      h *= (1 - smooth);
    }

    /* The pitch is level. Not nearly level: a course author drew a plan on
     * flat paper and set base heights against it, so a rolling metre under a
     * gate would put their dive gate through the ground. */
    if (pitch) {
      const cover = pitchCover(pitch, x, z);
      const smooth = cover * cover * (3 - 2 * cover);
      h *= (1 - smooth);
    }

    /*
     * So is the clubhouse's ground, and for the same reason one step removed.
     * A 77 by 27 m terrace, a car park and a level verandah stand on this,
     * and the alternative to levelling it is either a building floating over
     * the low corner of its own site or a retaining wall tall enough to be
     * the biggest thing on the field. Levelled to the SAME datum as the
     * racing corridor, so the terrace is genuinely a step and a half up out
     * of the grass rather than a plinth at an arbitrary height.
     */
    if (pad) {
      const cover = padCover(pad, x, z);
      const smooth = cover * cover * (3 - 2 * cover);
      h *= (1 - smooth);
    }

    /* And the car park and its road, for the same reason: a graded sealed
     * surface is graded. Faded over 14 m, which is short because these are
     * small and sit in the trees rather than in the open. */
    {
      const d = Math.max(
        Math.max(SITE_CARPARK.x0 - 3 - x, x - SITE_CARPARK.x1 - 3),
        Math.max(SITE_CARPARK.z0 - 3 - z, z - SITE_CARPARK.z1 - 3),
      );
      const cover = Math.min(1, Math.max(0, 1 - d / 14));
      const smooth = cover * cover * (3 - 2 * cover);
      h *= (1 - smooth);
    }

    return h;
  };
}

/*
 * Ground albedo at a point, shared by the terrain mesh and the grass
 * roots. The single strongest tell that grass and terrain are two
 * disjoint systems is a blade whose root is a different green from the
 * ground it grows out of; sampling one function for both makes the
 * meadow read as one surface with lighter tips.
 */
const GROUND = {
  grassLow: new THREE.Color(0x4f8c3c),
  grassHigh: new THREE.Color(0x86b95a),
  rock: new THREE.Color(0x8b8578),
  patchWarm: new THREE.Color(0x7fa84a),
  patchDark: new THREE.Color(0x3f7a3a),
  earth: new THREE.Color(0x9c8f6e),
  /*
   * The two zones the club's own photographs show, and the reason the ground
   * is not one green any more. Inside the marked rectangle it is watered and
   * mown; north of it, out to the fence, it is the straw the ground level
   * shot is full of; past the fence it is the bush floor, dry sand under the
   * gums with leaf litter on it.
   */
  strawDry: new THREE.Color(0xb8a878),
  bushFloor: new THREE.Color(0x9c8a63),
};
function groundAlbedo(x, z, y, samples, c, pitch) {
  /* Colour by altitude, then three scales of variation: large patches
   * read as different ground cover from the air, a mid scale macro
   * (period about 33 m) breaks the monotone at racing height, and fine
   * speckle keeps it from banding. */
  const t = Math.min(1, Math.max(0, (y + 12) / 34));
  c.copy(GROUND.grassLow).lerp(GROUND.grassHigh, t);
  const patch = fbm(x * 0.0065, z * 0.0065);
  c.lerp(GROUND.patchWarm, Math.max(0, (patch - 0.5) * 1.5));
  c.lerp(GROUND.patchDark, Math.max(0, (0.5 - patch) * 1.1));
  const macro = fbm(x * 0.03, z * 0.03);
  c.multiplyScalar(0.97 + (macro - 0.5) * 0.13);
  const speck = fbm(x * 0.06, z * 0.06);
  c.multiplyScalar(0.94 + speck * 0.12);
  c.lerp(GROUND.rock, Math.min(0.5, Math.max(0, (y - 14) / 22)) * (0.5 + speck * 0.5));
  /* Beaten earth along the racing line, and sand at the waterline. */
  let dTrack = 1e9;
  for (const s of samples) {
    dTrack = Math.min(dTrack, Math.hypot(x - s.x, z - s.z));
  }
  const onPath = 1 - Math.min(1, Math.max(0, (dTrack - 2.5) / 5));
  /* No beaten earth on a mown pitch. A groundsman would have something to
   * say about a dirt track worn across their stripes, and the racing line on
   * a designed course is a line somebody drew this morning rather than one a
   * season of laps wore in. */
  const mown = pitchCover(pitch, x, z);
  c.lerp(GROUND.earth, onPath * 0.42 * (0.7 + speck * 0.6) * (1 - mown));

  /*
   * THE CLUB GROUND'S THREE ZONES, laid over the terrain's own colour.
   *
   * Read straight off the two photographs the owner sent. The aerial has a
   * green, marked rectangle in the southern half of the paddock and dry
   * ground north of it; the shot from the ground has the same straw running
   * from the mown edge to the fence, then bush floor under the gums. Blended
   * rather than stepped, because a mower leaves an edge and a season leaves
   * a gradient, and the terrain is 7.4 m a vertex so a hard step would be a
   * staircase anyway.
   */
  {
    const edge = siteEdge(x, z);
    /*
     * Out past the fence: the bush floor, but only as a BAND at the edge.
     *
     * It rises over the first 30 m and is gone again by 140, because that
     * litter and sand is what you see under the front row of gums where the
     * light still reaches. Further out the canopy closes and what the eye
     * gets is the terrain's own green, which is what the aerial shows: dark
     * green bush to every edge of the frame. Carrying the dry colour all the
     * way out turned the whole 1700 m plane tan and made the world a desert
     * with a paddock in it.
     */
    if (edge > -6) {
      const rise = Math.min(1, Math.max(0, (edge + 6) / 30));
      const fall = Math.min(1, Math.max(0, (140 - edge) / 90));
      c.lerp(GROUND.bushFloor, rise * fall * 0.70);
    }
    /* Inside the fence but outside the mown rectangle: straw. The margin is
     * how far the green fades out past the mown edge. */
    if (edge < 4) {
      const dx = Math.max(SITE_MOWN.x0 - x, x - SITE_MOWN.x1);
      const dz = Math.max(SITE_MOWN.z0 - z, z - SITE_MOWN.z1);
      const outMown = Math.max(dx, dz);
      const dry = Math.min(1, Math.max(0, outMown / 22));
      c.lerp(GROUND.strawDry, dry * 0.66 * Math.min(1, Math.max(0, (4 - edge) / 8)));
    }
  }

  if (mown > 0) {
    /*
     * Stripes across the short axis, so they run the length of the pitch the
     * way a mower drives it. The speckle still modulates them, so the pitch
     * is mown rather than painted.
     */
    const band = Math.floor((z + 1e4) / PITCH.stripe) % 2 === 0;
    const turf = band ? PITCH.light : PITCH.dark;
    c.lerp(turf, mown * 0.85);
    c.multiplyScalar(0.985 + speck * 0.03);
    /* The marking sits on the author's own boundary, not on the mown edge:
     * it is the line their plan drew, and the mown ground outside it is run
     * off. */
    const onLine = Math.abs(Math.max(Math.abs(x) - pitch.halfW, Math.abs(z) - pitch.halfD));
    const inside = Math.abs(x) <= pitch.halfW + PITCH.lineW && Math.abs(z) <= pitch.halfD + PITCH.lineW;
    if (inside && onLine <= PITCH.lineW) {
      c.lerp(PITCH.line, 0.9 * mown);
    }
  }
  return c;
}

function terrain(height, samples, pitch) {
  const size = 1700;
  const seg = 230;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const rockCol = GROUND.rock;
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = height(x, z);
    pos.setY(i, y);
    /* Slope rock is applied after normals exist, below. */
    groundAlbedo(x, z, y, samples, c, pitch);
    colors[i * 3 + 0] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  /* Steep faces go to rock: cheap, and it stops hills looking like felt. */
  const nrm = geo.attributes.normal;
  for (let i = 0; i < pos.count; i += 1) {
    const slope = 1 - nrm.getY(i);
    if (slope > 0.25) {
      const k = Math.min(1, (slope - 0.25) / 0.35);
      colors[i * 3 + 0] += (rockCol.r - colors[i * 3 + 0]) * k;
      colors[i * 3 + 1] += (rockCol.g - colors[i * 3 + 1]) * k;
      colors[i * 3 + 2] += (rockCol.b - colors[i * 3 + 2]) * k;
    }
  }
  geo.attributes.color.needsUpdate = true;
  const mat = celMaterial({ color: 0xffffff, rim: 0.0, cloudShadow: 0.34 });
  mat.vertexColors = true;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

/*
 * Grass blades are not drawn.
 *
 * They used to be a 184000 plus extra merged buffer, two triangles each,
 * submitted in the colour pass and again in the outline prepass, with a
 * custom wind and propwash shader. Successive scale corrections took a
 * blade from 0.26 to 0.68 m down to 0.03 to 0.09 m high and 8 to 18 mm
 * wide. At racing height, without MSAA, that is sub-pixel: High still
 * paid 552,000 triangles twice a frame for a mesh the pilot cannot see.
 * The ground colour is the turf. Near parallax is trees and rocks.
 *
 * The first 184000 draws ARE the world's rng stream. One extra or one
 * fewer here and every tree, rock, cliff, flower and mountain moves.
 * Walk the stream, write no vertices, skip the extra density stream.
 * Blade heights are still measured so the world-scale check reads what
 * this loop authors, not a restated formula.
 */
function grassField(samples, rng, pitch) {
  let bladeMin = Infinity;
  let bladeMax = -Infinity;
  const BLADES_WORLD = 184000;
  for (let i = 0; i < BLADES_WORLD; i += 1) {
    let x;
    let z;
    if (rng() < 0.84) {
      const s = samples[Math.floor(rng() * samples.length)];
      const a = rng() * Math.PI * 2;
      const u = rng();
      const rad = 1 + 41 * u * u * u;
      x = s.x + Math.cos(a) * rad;
      z = s.z + Math.sin(a) * rad;
    } else {
      x = (rng() - 0.5) * 900;
      z = (rng() - 0.5) * 900;
    }
    const hRoll = rng();
    const mown = pitchCover(pitch, x, z);
    const h = mown > 0.35
      ? 0.006 + hRoll * 0.012
      : 0.03 + hRoll * 0.06;
    if (h < bladeMin) {
      bladeMin = h;
    }
    if (h > bladeMax) {
      bladeMax = h;
    }
    rng();
    rng();
    for (let v = 0; v < 5; v += 1) {
      rng();
      rng();
      rng();
      rng();
    }
  }
  return { bladeHeightRange: [bladeMin, bladeMax] };
}

/*
 * caps, when given, collects this tree's colliders. They are pushed from the
 * values the geometry is actually built from, inside the same draw, because
 * the baker merges every instance into one anonymous buffer and a tree's
 * trunk radius cannot be recovered afterwards. Nothing here consumes an
 * extra rng() value: the whole world hangs off one stream in one order, so
 * an extra draw would move every tree, flower and mountain in the valley.
 */
/*
 * `bigness` multiplies the drawn size. It is 1 for anything scattered and
 * about 2 for the boundary, because the trees in the club's own ground level
 * photograph are a wall of mature gums 12 to 18 m tall and this tree at its
 * own scale tops out near 11. Height is free: it is the same geometry with a
 * bigger number in front of it, and a taller tree closes the gaps along a
 * treeline that adding more trunks would have to pay triangles for.
 */
/*
 * `hull` draws the heavy inked outline. It is worth its cost on anything a
 * pilot flies near and it is pure waste on the background: an inverted hull
 * DOUBLES a tree's geometry, and a tree three hundred metres away is a
 * silhouette the post pass already inks from depth. Off for the far scatter
 * and the horizon, which is where most of the trees are.
 */
function tree(rng, height, x, z, caps, bigness = 1, hull = true) {
  const g = new THREE.Group();
  const scale = (0.85 + rng() * 1.5) * bigness;
  const trunkH = (1.5 + rng() * 1.3) * scale;
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13 * scale, 0.24 * scale, trunkH, 6),
    celMaterial({ color: 0x6b4a2f, rim: 0.18 }),
  );
  trunk.position.y = trunkH / 2;
  trunk.castShadow = true;
  if (hull) {
    outlineHull(trunk, 1.1);
  }
  g.add(trunk);

  /* Rounded, slightly irregular canopy masses rather than cones: the
   * silhouette is what sells a stylised tree. */
  const tints = [0x4c9440, 0x5aa348, 0x429038, 0x69ad4e];
  const tint = tints[Math.floor(rng() * tints.length)];
  const blobs = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < blobs; i += 1) {
    const r = (1.05 - i * 0.1 + rng() * 0.35) * scale;
    /* Smooth normals: a flat shaded icosahedron gives every facet its own
     * toon band and its own crease line, which reads as crumpled paper up
     * close. A smooth blob shades as one round mass with a curved band
     * edge, which is how this style draws a canopy. */
    let blobGeo = new THREE.IcosahedronGeometry(r, 1);
    blobGeo = mergeVertices(blobGeo);
    blobGeo.computeVertexNormals();
    const blob = new THREE.Mesh(
      blobGeo,
      celMaterial({ color: tint, rim: 0.3 }),
    );
    const a = rng() * Math.PI * 2;
    const spread = i === 0 ? 0 : (0.35 + rng() * 0.55) * scale;
    blob.position.set(
      Math.cos(a) * spread,
      trunkH + (0.5 + i * 0.42 + rng() * 0.25) * scale,
      Math.sin(a) * spread,
    );
    blob.rotation.set(rng() * 3, rng() * 3, rng() * 3);
    blob.castShadow = true;
    if (hull) {
      outlineHull(blob, 1.055);
    }
    g.add(blob);
  }
  const gy = height(x, z);
  g.position.set(x, gy, z);
  if (caps) {
    /* The trunk, as a vertical capsule at the mean of its two radii. A
     * tapered cylinder is not a capsule, and the difference over a 3 m
     * trunk is a couple of centimetres of radius, which is inside the
     * craft's own 0.19 m. */
    caps.addPost('tree', x, z, gy, gy + trunkH, (0.13 + 0.24) * 0.5 * scale);
    for (const c of g.children) {
      if (c.isMesh && c.geometry.type === 'IcosahedronGeometry') {
        caps.addSphere('canopy', x + c.position.x, gy + c.position.y, z + c.position.z,
          c.geometry.parameters.radius);
      }
    }
  }
  return g;
}

function rock(rng, height, x, z, caps) {
  const r = 0.6 + rng() * 2.4;
  const m = new THREE.Mesh(
    new THREE.DodecahedronGeometry(r, 0),
    celMaterial({ color: 0x8e8b82, rim: 0.26 }),
  );
  m.rotation.set(rng() * 3, rng() * 3, rng() * 3);
  m.scale.set(1, 0.7 + rng() * 0.5, 1);
  m.castShadow = true;
  outlineHull(m, 1.05);
  m.position.set(x, height(x, z) + r * 0.35, z);
  if (caps) {
    /* A dodecahedron scaled flat in y. The collider is a sphere at the
     * mesh's own centre, using the y scale so a squashed rock is not a
     * boulder to fly into: the horizontal radius is the one that matters
     * and it is r. */
    caps.addSphere('rock', x, m.position.y, z, r * 0.92);
  }
  return m;
}

/*
 * The obstacle library, built to MultiGP dimensions.
 *
 * This used to be one function called gate() that built a 6.0 by 5.0 m frame
 * around a torus of radius 1.9, giving a clear span of 3.5 m. The MultiGP
 * standard gate opening is 5 ft square, 1.524 m, so the old gate was 2.30
 * times regulation, and because every judgement about how big this valley is
 * was anchored to it, a 250 mm quad read as a toy in a stadium. Every
 * dimension here now comes from src/game/track.js, which holds the published
 * figures and converts from feet once.
 *
 * What makes it read as a MultiGP gate rather than a hoop: a SQUARE opening,
 * a PVC tube frame of four members, mesh side panels outboard of the
 * uprights, and a top panel carrying the gate number. A photograph of a
 * chapter gate and a screenshot of this should be recognisably the same
 * object.
 *
 * Materials are created ONCE and shared by every obstacle, so the baker's
 * celKey buckets merge all eight obstacles' static parts into a handful of
 * draw calls. The old gate made a new celMaterial per gate and a new
 * MeshBasicMaterial per pip, which is most of why 636 of 698 draw calls
 * carried half a percent of the triangles.
 *
 * Only the parts that animate stay per obstacle: the aperture outline, its
 * halo, its additive glow, and the green target pane, whose gains are
 * driven per frame so the pilot always has a target.
 */
let SHARED = null;
function sharedObstacleMats() {
  if (SHARED) {
    return SHARED;
  }
  const vinyl = celMaterial({ color: bannerHex('vinyl'), rim: 0.22 });
  SHARED = {
    /*
     * The frame. Aluminium rather than the navy this used to be: on a real
     * course the tube is the least of the gate and the printed sleeves are
     * the whole of it, and a dark bar between two pale banners reads as a
     * hole in the middle of the structure. Light enough to be a tube in
     * sunlight, well under the sky, which is the rule everything in this
     * file obeys.
     */
    frame: celMaterial({ color: 0x9aa2b0, rim: 0.26 }),
    /* The moulded corner at every junction of upright and cross member. A
     * shade darker than the tube, because on a real gate it is a separate
     * fitting and the joint is what says the thing was assembled. */
    fitting: celMaterial({ color: 0x767f8f, rim: 0.26 }),
    /* Plain white vinyl, for the gate boards, the sleeves' substrate, and
     * the barrier walls. The start gate is identified by its mint ring, not
     * by painting the board a different colour: a green sandwich behind a
     * white print is a board that is not white. One material, so the baker
     * folds every board and every wall into the same draw. */
    panel: vinyl,
    panelStart: vinyl,
    panelRace: vinyl,
    /* The bound edge of a printed banner, and the roundel the gate number
     * is painted in. One material for both because they are the same
     * webbing tape on a real gate. */
    hem: celMaterial({ color: 0xe4d9bf, rim: 0.18 }),
    /* The numeral, DARK on the pale roundel, unlit so distance and shadow
     * cannot take the gate's number away from a pilot counting them down.
     * It used to be cream pips straight onto the dark panel, which is the
     * lower contrast pairing of the two and is not what a gate carries. */
    number: new THREE.MeshBasicMaterial({ color: 0x18202f }),
  };
  return SHARED;
}

/*
 * The course's printed dress: the gate header, the upright sleeves and the
 * flag sails, as materials, with the author's marks composited into them.
 *
 * ONE DRESS PER MARK, made once. A course carries up to five sponsors'
 * marks, and every gate wearing a given mark wears exactly the same print,
 * so the scenery merger still folds all the headers that share a sponsor
 * into one draw call. An unbranded course has one plain dress and is
 * therefore exactly what it was before any of this: a header, two sleeves
 * and two sails. Five sponsors cost five headers, ten sleeves and ten
 * sails, which is twenty draw calls for the whole of a course's dressing
 * and is the price of the feature.
 *
 * WHICH GATE WEARS WHICH is not decided here. `forGate(i)` is asked for the
 * dress of the i'th dressed structure in flying order and answers round
 * robin, so fifteen gates and five marks put each mark on three gates spread
 * down the lap rather than on three gates in a row.
 *
 * THE SAILS ALTERNATE TWO WAYS AT ONCE. A teardrop flag's sweep is navy or
 * red so a line of them down a course reads as a run rather than a repeat,
 * and now it also has to cycle through the sponsors. `sails` is the run a
 * line of flags wears: sail i carries mark i mod n with the accent i mod 2,
 * which needs lcm(n, 2) entries before it repeats. A gate's own header
 * pennants are not part of that run: both of them wear THAT GATE'S mark, in
 * the two accents, because a gate flying two sponsors' pennants over one
 * sponsor's board is not what a sponsor bought.
 *
 * THE MARKS ARRIVE LATE AND THAT IS FINE. They are data URLs out of local
 * storage, so there is no network fetch to fail, but the decode is still
 * asynchronous. Every canvas is painted at once WITHOUT them, so the world
 * is complete and correct from the first frame, and each is repainted the
 * moment its own mark decodes. Nothing waits and nothing pops except a mark
 * appearing on vinyl that was already there.
 */
function bannerKit(logoUrls, key) {
  /*
   * Mapped rather than filtered, so a slot that carries something this will
   * not put in a texture becomes an empty slot and every mark after it keeps
   * its number. Filtering would renumber them, and the decals painted on the
   * grass index the same list from src/game/trackdoc.js: a course would come
   * out with gate 3 wearing one sponsor and the paint beside it wearing
   * another. normalize() already refuses anything that is not an embedded
   * image, so this is the belt to that document rule's braces.
   */
  const urls = (Array.isArray(logoUrls) ? logoUrls : (logoUrls == null ? [] : [logoUrls]))
    .map((u) => (typeof u === 'string' && u.startsWith('data:image/') ? u : null));
  /* One plain slot when the course carries nothing, so every path below is
   * the same path and the unbranded case is not a special case. */
  const n = Math.max(1, urls.length);
  const jobs = [];
  const paint = (slot, size, painter, opts) => {
    const canvas = bannerCanvas(size[0], size[1]);
    const ctx = canvas.getContext('2d');
    painter(ctx, size[0], size[1], opts);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    jobs.push({
      slot,
      run: (logo) => {
        painter(ctx, size[0], size[1], { ...opts, logo });
        tex.needsUpdate = true;
      },
    });
    return tex;
  };
  const printed = (tex, id) => celMaterial({
    color: 0xffffff,
    /* Almost no rim on printed vinyl. The rim term is one minus the dot of
     * normal and view, and a flat banner is edge on across its whole face,
     * so any real strength washes the print out to one cool tint. */
    rim: 0.06,
    map: tex,
    /* FrontSide. Each printed face is a separate plane facing outward with
     * the substrate behind it, so a viewer never needs the reverse of one,
     * and DoubleSide is what the outline prepass cannot see. */
    side: THREE.FrontSide,
    key: `${id}:${key}`,
  });
  /* Memoised, so the run of sails and the gates' own pennants share one
   * material per mark and accent instead of painting the same canvas twice. */
  const sailCache = new Map();
  const sailOf = (slot, accent) => {
    const id = `${slot}:${accent}`;
    let mat = sailCache.get(id);
    if (!mat) {
      mat = sailMaterial(paint(slot, BANNER_SIZE.sailSheet, paintFlagSailPair, { accent }), `sail${id}:${key}`);
      sailCache.set(id, mat);
    }
    return mat;
  };

  const dress = [];
  for (let i = 0; i < n; i += 1) {
    dress.push({
      header: printed(paint(i, BANNER_SIZE.header, paintGateHeader, {}), `hdr${i}`),
      sleeve: printed(paint(i, BANNER_SIZE.sleeve, paintGateSleeve, {}), `slv${i}`),
      /* The far leg's, painted mirrored rather than scaled onto the mesh. */
      sleeveFlipped: printed(paint(i, BANNER_SIZE.sleeve, paintGateSleeve, { flip: true }), `slvf${i}`),
      /* This gate's own header pennants: its mark, both accents. */
      sails: [sailOf(i, 'navy'), sailOf(i, 'red')],
    });
  }

  const runLength = n % 2 === 0 ? n : n * 2;
  const sails = [];
  for (let i = 0; i < runLength; i += 1) {
    sails.push(sailOf(i % n, i % 2 === 1 ? 'red' : 'navy'));
  }

  const kit = {
    marks: n,
    sails,
    dress,
    forGate: (i) => dress[((Math.round(i) % n) + n) % n],
  };

  for (let slot = 0; slot < urls.length; slot += 1) {
    if (!urls[slot]) {
      continue;
    }
    const img = new Image();
    img.onload = () => {
      for (const job of jobs) {
        if (job.slot === slot) {
          job.run(img);
        }
      }
    };
    img.src = urls[slot];
  }
  return kit;
}

/*
 * Gate numbers as a 3 by 5 dot matrix. A count of pip marks was readable as
 * a quantity but not as a number, and a real gate carries a numeral, so this
 * builds one out of small boxes. Rows are top to bottom, one string per row
 * group, three characters wide.
 */
const DIGITS = {
  0: ['111', '101', '101', '101', '111'],
  1: ['010', '110', '010', '010', '111'],
  2: ['111', '001', '111', '100', '111'],
  3: ['111', '001', '111', '001', '111'],
  4: ['101', '101', '111', '001', '001'],
  5: ['111', '100', '111', '001', '111'],
  6: ['111', '100', '111', '101', '111'],
  7: ['111', '001', '010', '010', '010'],
  8: ['111', '101', '111', '101', '111'],
  9: ['111', '101', '111', '001', '111'],
};

/*
 * The three colours a gate's lit opening is ever painted.
 *
 * GATE_COLOUR is every gate at rest, START_COLOUR is the start and finish
 * line so the timing plane is identifiable before anything is lit, and
 * NEXT_COLOUR is THE ONE THE RACE WANTS NEXT: a lit pane in the opening,
 * pulsing. WRONG_COLOUR is the same pane seen from the other face, so the
 * hole reads on line one way and not the other.
 *
 * NEXT_COLOUR went green to magenta and back to green, and both moves
 * were the owner's. The magenta round answered a report that three greens
 * (start, grass, target) were being graded at 30 m/s. The owner then
 * settled it differently: the target stays a SUBTLE green glow with red
 * for the wrong direction, and every other gate carries no markings at
 * all, which removes the ambiguity at its root, there is exactly one lit
 * thing on the course at a time. The calmed gain levels from the magenta
 * round are kept; only the hue went back.
 */
const GATE_COLOUR = 0xffd45c;
const START_COLOUR = 0x7dffb4;
const NEXT_COLOUR = 0x39ff8b;
const WRONG_COLOUR = 0xff5a5a;

/*
 * The lit markers on an obstacle's openings: the outline the pilot aims at,
 * its halo, and the additive glow that says which gate the race wants next.
 *
 * Extracted from obstacle() so the TILTED gate below can carry exactly the
 * same target. A dive gate whose ring were a hand copy of this one would
 * drift the first time the legibility numbers below were retuned, and the
 * whole point of those numbers is that they were measured once.
 *
 * Adds the outline, halo, glow and the green target pane to `group` in
 * the obstacle's own local frame and returns them, along with which
 * opening ended up carrying the glow.
 */
function apertureMarkers(group, sills, clearW, clearH, stack, isStart, primaryWanted) {
  /*
   * The aperture markers. Square now, because the opening is square, and
   * built as one merged geometry per obstacle so a stacked obstacle still
   * costs one draw call for all of its outlines.
   *
   * The glow sits on the PRIMARY opening, which for a stack is the named
   * hole, so a spiral lights bottom then middle then top rather than all
   * three at once.
   */
  const ringColor = isStart ? START_COLOUR : GATE_COLOUR;
  /* The middle opening by default; a course document may name a different
   * one, because a ladder flown at its top level wants the top level lit. */
  const primary = primaryWanted == null
    ? Math.floor(stack / 2)
    : Math.max(0, Math.min(stack - 1, Math.round(primaryWanted)));
  /*
   * ONE MESH PER OPENING, NOT ONE PER STRUCTURE, and that is this round's
   * change. The four bars of every level used to merge into a single ring
   * mesh, so a double or a triple stack lit ALL of its holes the moment the
   * race named any one of them and the pilot had to read a badge to find
   * out which. The owner's words: "for double and triple stacked gates only
   * the next gate you go through should be highlighted." A merged mesh
   * cannot say that; separate meshes can, by being hidden.
   *
   * The MATERIAL is still one per structure. Colour, the target hue and the
   * wrong side red all drive the material, so keeping one of it means
   * dressGate, setTargetSide and the pulse are unchanged; only visibility
   * is per opening. The cost is one draw call per level instead of one per
   * structure, which on a three hole ladder is two more.
   */
  const ringMat = new THREE.MeshBasicMaterial({ color: ringColor, fog: true });
  const haloMat = new THREE.MeshBasicMaterial({
    color: ringColor, transparent: true, opacity: 0.5, fog: true,
  });
  const rings = [];
  const halos = [];
  for (let k = 0; k < stack; k += 1) {
    const outlineGeos = [];
    const haloGeos = [];
    const cy = sills[k] + clearH * 0.5;
    /*
     * The lit bar's thickness, and it is a LEGIBILITY number.
     *
     * 0.045 m was invisible at 20 m once the opening shrank to regulation.
     * 0.075 m was measured by a pilot at 1.4 px at 20 m and 0.9 px at 30 m,
     * still sub pixel at the distance a racer has to commit to a line: at 25 m
     * the target read as a 23 px green tick dimmer than the banner flags and
     * the trees beside it. 0.16 m is 3 px at 20 m and 2 px at 30 m, the
     * smallest that survives commit range on a 900 px frame.
     *
     * The cost, stated: at 7 m the bar covers about 10 percent of the opening
     * instead of 5, so a gate right in front of the camera reads chunkier. A
     * target you cannot see until 7 m is not a target, so that is the trade.
     */
    const bar = 0.16;
    const halfW = clearW * 0.5;
    const halfH = clearH * 0.5;
    /* Four thin bars just inside the frame, so the lit line the pilot aims
     * at is the clear opening itself and not the tube around it. */
    const parts = [
      [0, cy + halfH - bar * 0.5, clearW, bar],
      [0, cy - halfH + bar * 0.5, clearW, bar],
      [-halfW + bar * 0.5, cy, bar, clearH],
      [halfW - bar * 0.5, cy, bar, clearH],
    ];
    for (const [px, py, sw, sh] of parts) {
      const geo = new THREE.BoxGeometry(sw, sh, bar);
      geo.translate(px, py, 0);
      outlineGeos.push(geo);
      const hg = new THREE.BoxGeometry(sw * 1.06 + 0.05, sh * 1.06 + 0.05, bar * 0.7);
      hg.translate(px, py, 0);
      haloGeos.push(hg);
    }
    const lvlRing = new THREE.Mesh(mergeGeometries(outlineGeos, false), ringMat);
    /* No ink on the emissive outline: the depth edge pass draws a ghost line
     * inside it, which reads as a rendering defect on the one prop the pilot
     * stares at all lap. Layer 1 skips the prepass. */
    lvlRing.layers.set(1);
    group.add(lvlRing);
    rings.push(lvlRing);
    const lvlHalo = new THREE.Mesh(mergeGeometries(haloGeos, false), haloMat);
    lvlHalo.layers.set(1);
    group.add(lvlHalo);
    halos.push(lvlHalo);
  }
  const ring = rings[0];
  const halo = halos[0];

  /* Additive glow across the primary opening. Additive so it reads as light
   * rather than paint, in the gate plane so it does not need to billboard,
   * and unlit and unfogged so distance cannot take the target away from the
   * pilot. uGain is driven per frame: bright and pulsing on the gate the
   * race wants next, nearly off on the rest. */
  const glowSize = Math.max(clearW, clearH) * 2.6;
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(glowSize, glowSize),
    new THREE.ShaderMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
      side: THREE.DoubleSide,
      uniforms: {
        uFront: { value: new THREE.Color(ringColor) },
        uBack: { value: new THREE.Color(ringColor) },
        uGain: { value: 0.1 },
        /* Half the clear opening as a fraction of the plane, so the lit
         * band lands on the frame whatever size the opening is. */
        uEdge: { value: (clearW * 0.5) / glowSize },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        uniform vec3 uFront;
        uniform vec3 uBack;
        uniform float uGain;
        uniform float uEdge;
        void main() {
          /* A square band, because the opening is square. The Chebyshev
           * distance is the square's own radius. */
          vec2 d = abs(vUv - 0.5);
          float r = max(d.x, d.y);
          float band = exp(-pow((r - uEdge) / 0.055, 2.0));
          /* A wash across the opening, on top of the band. The solid
           * transparent pane (gateCue) is what you aim at up close; this
           * is what still reads at fifty metres. Green from the entry
           * face, red from the other, so a reverse approach is obvious. */
          float fill = smoothstep(uEdge, 0.0, r) * 0.16;
          vec3 col = gl_FrontFacing ? uFront : uBack;
          gl_FragColor = vec4(col * (band + fill) * uGain, 1.0);
        }
      `,
    }),
  );
  glow.position.y = sills[primary] + clearH * 0.5;
  glow.layers.set(1);
  group.add(glow);
  /* The pane the pilot actually aims at: green from the entry face, red
   * from the other. Hidden until the race names this gate as next, then
   * it jumps with the target. */
  const cue = gateCue(clearW, clearH);
  cue.position.y = sills[primary] + clearH * 0.5;
  group.add(cue);
  return {
    ring, halo, rings, halos, glow, cue, fillMat: cue.userData.fillMat, ringColor, primary,
  };
}

/*
 * The target mark in an opening: a pane across the hole, hidden until the
 * race names this gate as next.
 *
 * It is double sided and it does not care which way round it is built. The
 * colour is written from outside, once a frame, off the camera's own half
 * space against the direction of travel, so a split-S, a reverse or a dive
 * all read the same way with no mesh to turn round.
 */
/*
 * The direction of travel through an opening, in scene axes.
 *
 * The same expression race.js builds its aperture frame from, so the paint
 * on a gate and the test that scores it cannot disagree about which way
 * through it goes. Kept as one function because that agreement is the whole
 * value of it: a gate that scores differently from how it looks is a gate the
 * pilot cannot learn.
 */
function gateCue(clearW, clearH) {
  const cue = new THREE.Group();
  cue.visible = false;
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    uniforms: {
      uFront: { value: new THREE.Color(NEXT_COLOUR) },
      uBack: { value: new THREE.Color(WRONG_COLOUR) },
      uOpacity: { value: 0.22 },
      /* 1 when the pilot is on the wrong side of this gate's plane, which
       * is what draws the bar. Driven per frame from the camera's own half
       * space, not from gl_FrontFacing: see setTargetSide. */
      uWrong: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      uniform vec3 uFront;
      uniform vec3 uBack;
      uniform float uOpacity;
      uniform float uWrong;
      void main() {
        vec3 col = gl_FrontFacing ? uFront : uBack;
        float a = uOpacity;
        /*
         * WRONG WAY IS A SHAPE, NOT ONLY A COLOUR.
         *
         * Red against green is the one axis about eight percent of men
         * cannot read, and this pane carries the single most important bit
         * on the course. So the wrong face also wears a bar across the
         * opening: two diagonals, thick enough to survive the distance the
         * pane first resolves at. The correct face stays clear, because
         * the thing the pilot has to see through it is the line beyond it.
         */
        vec2 d = vUv - 0.5;
        float x = min(abs(d.x - d.y), abs(d.x + d.y)) * 1.41421356;
        float bar = smoothstep(0.055, 0.028, x) * step(max(abs(d.x), abs(d.y)), 0.44);
        a = mix(a, min(0.72, a + 0.42 * bar), uWrong);
        gl_FragColor = vec4(col, a);
      }
    `,
  });
  const fill = new THREE.Mesh(
    new THREE.PlaneGeometry(clearW * 0.94, clearH * 0.94),
    mat,
  );
  cue.add(fill);
  cue.traverse((o) => o.layers.set(1));
  cue.userData.fillMat = mat;
  return cue;
}

/*
 * THE NEXT FLAG CARRIES ITS OWN LIGHT. The scoring square is not drawn.
 *
 * A flag or cone still scores through the virtual aperture at the knot:
 * the swept test, the width, the inner edge on the pole, none of that
 * moves, because moving the scoring would change what every posted lap
 * time means. What used to be painted was a box the size of that
 * aperture. Shrinking the box still left a box: two additive planes at
 * right angles read as a volume. The owner asked for the graphic to go,
 * and for the NEXT flag itself to glow, brightest on the pole, fading
 * out across the cloth, with the print still readable.
 *
 * Three live meshes, all on layer 1 so they take no ink:
 *
 *   the core   an additive copy of the mast (or the cone), the bright
 *              column on the pole. ringMat, so dressGate and
 *              setTargetSide drive it with every other target.
 *   the halo   a modest additive shell around the same centreline.
 *              haloMat, target only, opacity rides the pulse.
 *   the sail   an additive copy of the FLAG'S OWN MESH, not a rectangle.
 *              aCloth.x is distance from the pole, the cloth wave is
 *              the same chunk the print uses, and the same glowMat a
 *              gate uses (uFront/uBack/uGain) drives it, so the wrong
 *              side turns red exactly as a gate's pane does. A cone has
 *              no sail; the cone meshes carry the light.
 *
 * The holder is parented onto the flag or cone the pilot can see, so
 * the overlay shares that object's origin and yaw. setPole() is the
 * fallback when that host is missing: it puts the holder on the pole
 * in the scoring square's frame.
 */
function markerGlowMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uFront: { value: new THREE.Color(NEXT_COLOUR) },
      uBack: { value: new THREE.Color(NEXT_COLOUR) },
      uGain: { value: 0.0 },
      uCelTime: { value: 0.0 },
      uCloth: { value: FLAG_SAIL_CLOTH },
    },
    vertexShader: /* glsl */ `
      attribute vec2 aCloth;
      uniform float uCelTime;
      uniform float uCloth;
      varying float vFromPole;
      void main() {
        vec3 transformed = position;
        ${CLOTH_CHUNK}
        vFromPole = aCloth.x;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uFront;
      uniform float uGain;
      varying float vFromPole;
      /* Modest: additive light on top of an opaque print. High enough to
       * read as the target at thirty metres, low enough that a chequer
       * and a logo still hold their own colour. */
      const float WASH_TEMPER = 0.42;
      void main() {
        /* Bright on the mast, about a fifth at the trailing edge, and
         * the mesh IS the sail so there is no rectangle to read. */
        float fall = exp(-vFromPole * vFromPole * 2.8);
        gl_FragColor = vec4(uFront, 1.0) * (uGain * fall * WASH_TEMPER);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    /* FrontSide: the sail geometry already emits both windings, and
     * DoubleSide on that would paint the glow twice. */
    side: THREE.FrontSide,
    fog: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
}

function virtualGate(clearW, clearH, marker = {}) {
  const g = new THREE.Group();
  const isCone = marker.type === 'cone';
  const flagH = Math.max(0.4, marker.height ?? clearH);
  const poleR = Math.max(0.008, marker.poleRadius ?? 0.02);
  const coneR = Math.max(0.05, marker.baseRadius ?? 0.18);
  const markerYaw = marker.yaw ?? 0;

  const ringMat = new THREE.MeshBasicMaterial({
    color: NEXT_COLOUR,
    transparent: true,
    opacity: 0.62,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const haloMat = new THREE.MeshBasicMaterial({
    color: NEXT_COLOUR,
    transparent: true,
    opacity: 0.22,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const glowMat = markerGlowMaterial();

  const holder = new THREE.Group();
  g.add(holder);

  let core;
  let halo;
  if (isCone) {
    core = new THREE.Mesh(new THREE.ConeGeometry(coneR * 1.08, flagH * 1.02, 10), ringMat);
    core.position.y = flagH * 0.5;
    halo = new THREE.Mesh(new THREE.ConeGeometry(coneR * 1.45, flagH * 1.06, 10), haloMat);
    halo.position.y = flagH * 0.5;
  } else {
    core = new THREE.Mesh(flagMastGeometry(poleR * 2.2, flagH), ringMat);
    halo = new THREE.Mesh(flagMastGeometry(poleR * 4.6, flagH), haloMat);
  }
  core.layers.set(1);
  halo.layers.set(1);
  holder.add(core);
  holder.add(halo);

  let sailGlow = null;
  if (!isCone) {
    sailGlow = new THREE.Mesh(flagSailGeometry(poleR, flagH), glowMat);
    sailGlow.layers.set(1);
    holder.add(sailGlow);
  }

  const setPole = (localX, localZ, localY, gateYaw = 0) => {
    holder.position.set(localX, localY, localZ);
    holder.rotation.y = markerYaw - gateYaw;
  };

  return {
    group: g,
    kindName: 'virtualGate',
    top: clearH,
    markerH: flagH,
    animate: [holder],
    holder,
    ringMat,
    haloMat,
    ringMeshes: [core],
    haloMeshes: [halo],
    glowMat,
    glowMesh: sailGlow,
    cueGroup: null,
    fillMat: null,
    ringColor: NEXT_COLOUR,
    setPole,
    apertures: [{
      shape: 'square', index: 0, sillH: 0, centreY: clearH * 0.5, clearW, clearH,
    }],
    primary: 0,
    aperture: { shape: 'square', index: 0, sillH: 0, centreY: clearH * 0.5, clearW, clearH },
    colliders: [],
  };
}

/*
 * A library obstacle's BUILT dimensions, named.
 *
 * src/game/track.js keeps MultiGP's figures as citations and GATE_SCALE is
 * the declared departure from them. Reading OBSTACLES directly anywhere in
 * this file would draw the rulebook and score the course, which is exactly
 * the disagreement the T1 assertion exists to catch.
 */
function specFor(kindName) {
  const spec = builtObstacle(kindName);
  if (!spec) {
    throw new Error(`scene: unknown obstacle ${kindName}`);
  }
  spec.kindName = kindName;
  return spec;
}

/*
 * The gate's top banner: the printed header board a race gate wears, with
 * the number in a roundel and the event's logo beside it.
 *
 * WHAT CHANGED AND WHY. This used to be a plate 0.92 of the CLEAR OPENING
 * wide with cream pips straight onto it, which is narrower than the frame it
 * sat on and reads as a sign screwed to a hoop. A race gate's header spans
 * the whole structure, side banner to side banner, because it is one printed
 * sheet sleeved over the top rail. So the width comes from the frame's outer
 * edge and the board carries the three things a real one carries: a bound
 * hem top and bottom, a pale roundel with the number in it, and the space to
 * the right of the roundel where the logo goes.
 *
 * Extracted from obstacle() so a tilted gate wears the same banner. The
 * caller positions the group and pushes the collider it hands back, because
 * a dive gate's banner rides on the leaning frame while a standing gate's
 * sits on top of the uprights, and those are two different heights in two
 * different frames.
 */
/*
 * A printed panel: a vinyl substrate with the print on both faces.
 *
 * NOT A TEXTURED BOX, and the difference matters. A BoxGeometry maps the
 * same [0,1] square onto all six of its faces, so a banner built as one
 * textured box wears its whole design squashed across its 60 mm top edge as
 * well, which is exactly the face a pilot looks down on from above. So the
 * substrate is plain and the print is a plane on each side, the back one
 * turned so the design reads the right way round from behind, the way a
 * double sided banner is actually printed.
 */
function printedPanel(w, h, depth, mat, substrate) {
  const g = new THREE.Group();
  const board = new THREE.Mesh(new THREE.BoxGeometry(w, h, depth), substrate);
  board.castShadow = true;
  g.add(board);
  for (const sz of [-1, 1]) {
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    face.position.z = sz * (depth * 0.5 + 0.004);
    if (sz < 0) {
      face.rotation.y = Math.PI;
    }
    g.add(face);
  }
  return g;
}

/*
 * The gate's header: the printed banner sleeved over the top rail, with the
 * number in a roundel at one end of it.
 *
 * WHAT CHANGED AND WHY. This used to be a plate 0.92 of the CLEAR OPENING
 * wide with cream pips straight onto it, which is narrower than the frame it
 * sat on and reads as a sign screwed to a hoop. A race gate's header spans
 * the whole structure, side banner to side banner, because it is one printed
 * sheet sleeved over the top rail. So the width comes from the frame's outer
 * edge, and what is printed on it comes from src/art/banners.js, which is
 * also what the track builder's preview draws, so an author sees the gate
 * they will fly.
 *
 * THE NUMBER IS GEOMETRY, NOT PRINT. A numeral in the texture would mean one
 * texture per gate and fourteen gates would be fourteen draw calls where
 * there is now one, so the print leaves both ends clear and a pale roundel
 * with raised pips sits in one of them.
 *
 * Extracted from obstacle() so a tilted gate wears the same banner. The
 * caller positions the group and pushes the collider it hands back, because
 * a dive gate's banner rides on the leaning frame while a standing gate's
 * sits on top of the uprights, and those are two different heights in two
 * different frames.
 */


/*
 * A flat printed panel, as a ROW of capsules rather than one fat one.
 *
 * The collision system speaks capsules, and the obvious way to wrap a panel
 * in one is to give it a radius that covers the panel's large dimension.
 * That is what the sleeves and the header board used to do, and it buys the
 * coverage by inflating the THIN axis to match: a 3 cm sleeve got a 21 cm
 * radius and the 58 cm header board got 29 cm, so a third of a metre of
 * solid nothing stood in front of a printed sheet and a line that visibly
 * cleared it did not. Same fault as the barriers, same fix: spend capsules
 * across the long axis so each one's radius can stay near the real
 * thickness. PANEL_CAP_R is the compromise, comfortably thicker than any
 * panel here so the sheet is never porous, and a third of what a single
 * capsule cost in the direction pilots actually approach from.
 *
 * `span` is the panel's long axis half length, `axis` is 'x' or 'y' for
 * which way it runs, and the returned capsules are in the gate's own frame.
 */
const PANEL_CAP_R = 0.08;

function panelCaps(kind, cx, cy, halfLong, halfShort, axis) {
  const out = [];
  const rows = Math.max(1, Math.ceil((halfShort * 2) / (PANEL_CAP_R * 2)));
  for (let i = 0; i < rows; i += 1) {
    const off = (i + 0.5) * ((halfShort * 2) / rows) - halfShort;
    if (axis === 'y') {
      out.push({
        kind,
        ax: cx + off, ay: cy - halfLong, az: 0,
        bx: cx + off, by: cy + halfLong, bz: 0,
        r: PANEL_CAP_R,
      });
    } else {
      out.push({
        kind,
        ax: cx - halfLong, ay: cy + off, az: 0,
        bx: cx + halfLong, by: cy + off, bz: 0,
        r: PANEL_CAP_R,
      });
    }
  }
  return out;
}

function gateBanner(index, outerW, headerMat, substrate) {
  const mats = sharedObstacleMats();
  const group = new THREE.Group();
  const boardH = GATE_BANNER_H;
  const boardW = Math.max(0.9, outerW);
  group.add(printedPanel(boardW, boardH, 0.05, headerMat, substrate));

  /*
   * The number, as many digits as it takes. This used to be
   * DIGITS[index % 10], which is correct for one digit and paints a lie for
   * two: gate 13 came out as a 3 and gate 10 as a 0, so with more than ten
   * stations two different gates would carry the same plate and a pilot
   * counting them down would be reading fiction.
   */
  const glyphs = String(Math.max(0, Math.round(index))).split('').map((d) => DIGITS[Number(d)]);
  const dot = 0.048;
  const step = 0.058;
  /*
   * The roundel has to HOLD the numeral, so it is sized from the numeral
   * rather than picked: a 3 by 5 matrix at this step is 2 steps tall from
   * the centre and 1.5 steps per glyph wide, and the circle that contains
   * that has to reach its corner. Sized by eye instead, the second digit of
   * gate 13 hung out over the edge of the disc.
   */
  const halfGlyphW = ((glyphs.length * 4 - 1) - 1) * 0.5 * step + dot * 0.5;
  const roundelR = Math.min(
    boardH * 0.40,
    Math.hypot(halfGlyphW, 2 * step + dot * 0.5) + 0.03,
  );
  /* In the clear zone the print left at the end of the banner. */
  const roundelX = -(boardW * (0.5 - HEADER_NUMBER_ZONE * 0.5));
  const roundel = new THREE.Mesh(new THREE.CylinderGeometry(roundelR, roundelR, 0.062, 20), mats.hem);
  roundel.rotation.x = Math.PI * 0.5;
  roundel.position.set(roundelX, 0, 0);
  group.add(roundel);
  /* A navy ring just proud of the disc. A pale circle on a white board
   * reads as a hole punched in it at any distance; a circle with an edge
   * reads as a number plate, which is what it is. */
  const rim = new THREE.Mesh(
    new THREE.CylinderGeometry(roundelR * 1.14, roundelR * 1.14, 0.05, 20),
    mats.number,
  );
  rim.rotation.x = Math.PI * 0.5;
  rim.position.set(roundelX, 0, 0);
  group.add(rim);

  /* 3 columns per glyph plus a one column gap, centred on the roundel, on
   * BOTH faces: a gate is read from whichever side you arrive on. */
  const glyphW = 4;
  const originX = -((glyphs.length * glyphW - 1) - 1) * 0.5;
  for (let gi = 0; gi < glyphs.length; gi += 1) {
    const rows = glyphs[gi];
    for (let ry = 0; ry < rows.length; ry += 1) {
      for (let rx = 0; rx < 3; rx += 1) {
        if (rows[ry][rx] !== '1') {
          continue;
        }
        for (const sz of [-1, 1]) {
          const pip = new THREE.Mesh(new THREE.BoxGeometry(dot, dot, 0.03), mats.number);
          /*
           * MIRRORED ON THE BACK FACE, which is what a printed banner does:
           * the reverse is printed reversed so the number reads the right
           * way round from whichever side the pilot arrives on. Drawn at the
           * same offset on both faces, gate 12 reads as 21 from behind.
           */
          pip.position.set(
            roundelX + sz * (originX + gi * glyphW + rx) * step,
            (2 - ry) * step,
            sz * 0.046,
          );
          group.add(pip);
        }
      }
    }
  }

  group.userData.halfW = boardW * 0.5;
  group.userData.r = boardH * 0.5;
  return group;
}

/*
 * A small number on one opening of a stacked gate. The header still carries
 * the first station's plate; this is how the pilot sees that the hole they
 * are flying at is gate 5 and the one above it is gate 6.
 */
function openingBadge(n) {
  const mats = sharedObstacleMats();
  const group = new THREE.Group();
  const r = 0.15;
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.04, 16), mats.hem);
  disc.rotation.x = Math.PI * 0.5;
  group.add(disc);
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.14, r * 1.14, 0.03, 16), mats.number);
  rim.rotation.x = Math.PI * 0.5;
  group.add(rim);
  const glyphs = String(Math.max(0, Math.round(n))).split('').map((d) => DIGITS[Number(d)]);
  const dot = 0.028;
  const step = 0.034;
  const glyphW = 4;
  const originX = -((glyphs.length * glyphW - 1) - 1) * 0.5;
  for (let gi = 0; gi < glyphs.length; gi += 1) {
    const rows = glyphs[gi];
    for (let ry = 0; ry < rows.length; ry += 1) {
      for (let rx = 0; rx < 3; rx += 1) {
        if (rows[ry][rx] !== '1') {
          continue;
        }
        for (const sz of [-1, 1]) {
          const pip = new THREE.Mesh(new THREE.BoxGeometry(dot, dot, 0.02), mats.number);
          pip.position.set(
            sz * (originX + gi * glyphW + rx) * step,
            (2 - ry) * step,
            sz * 0.028,
          );
          group.add(pip);
        }
      }
    }
  }
  return group;
}

/*
 * The elbow fittings at the four corners of one opening.
 *
 * Cheap and worth every triangle: a square of four tubes butted together is
 * an abstraction, and a square of four tubes with a moulded corner at each
 * junction is a thing somebody assembled out of a parts list. Boxes rather
 * than cylinders on purpose, because obstacle() recovers the clear opening
 * by finding its own vertical cylinders and a fifth one would change what it
 * measures.
 */
function cornerFittings(group, sills, clearW, clearH, tubeR) {
  const mats = sharedObstacleMats();
  const s = tubeR * 2.9;
  for (const sillY of sills) {
    for (const sy of [sillY - tubeR, sillY + clearH + tubeR]) {
      for (const sx of [-1, 1]) {
        const f = new THREE.Mesh(new THREE.BoxGeometry(s, s, s * 0.92), mats.fitting);
        f.position.set(sx * (clearW * 0.5 + tubeR), sy, 0);
        f.castShadow = true;
        group.add(f);
      }
    }
  }
}

/*
 * A designed course's racing line as a curve, for the things that want one:
 * the terrain's flat corridor and the scenery's exclusion test.
 *
 * Thinned before it is fitted. The line arrives as thousands of samples and
 * a CatmullRom through all of them is both slow to evaluate and wobbly,
 * because the control points are closer together than the spline's own
 * tension wants.
 */
function courseCurve(course) {
  const pts = [];
  let last = null;
  for (const p of course.line) {
    if (!last || Math.hypot(p.x - last.x, p.z - last.z) >= 6) {
      pts.push(new THREE.Vector3(p.x, p.y, p.z));
      last = p;
    }
  }
  if (pts.length < 3) {
    /* Not enough of a course to fit anything to. A tiny loop round the
     * spawn keeps every consumer working rather than making each one test
     * for a curve that is not there. */
    const cx = course.spawn ? course.spawn.x : 0;
    const cz = course.spawn ? course.spawn.z : 0;
    for (let i = 0; i < 4; i += 1) {
      const a = (i / 4) * Math.PI * 2;
      pts.push(new THREE.Vector3(cx + Math.cos(a) * 12, 0, cz + Math.sin(a) * 12));
    }
    return new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.4);
  }
  return new THREE.CatmullRomCurve3(pts, Boolean(course.closed), 'catmullrom', 0.4);
}

/*
 * The built in circuit, sampled the way it is FLYING, not the way it is
 * parameterised. Scene index i is flown as gateCount - i, so the paint
 * has to run against the curve parameter or every arrow points at the
 * previous gate.
 */
function circuitGuidePoints(curve) {
  const n = 220;
  const pts = [];
  for (let i = 0; i <= n; i += 1) {
    let u = -i / n;
    u -= Math.floor(u);
    const p = curve.getPointAt(u);
    pts.push({ x: p.x, z: p.z });
  }
  return pts;
}

/* Fly height of a station's scored opening, for the ground-arrow cue. */
function stationFlyHeight(spec, apertureIndex) {
  const clearH = spec.clearH || 0;
  const sill = spec.sillH || 0;
  const stack = Math.max(1, spec.stack || 1);
  const pitch = spec.levelPitch || (clearH + BUILT_FRAME_TUBE_OD);
  let idx = 0;
  if (apertureIndex != null) {
    idx = Math.min(Math.max(0, apertureIndex), stack - 1);
  }
  return sill + idx * pitch + clearH * 0.5;
}

function circuitGuideCues(placements) {
  return placements
    .map((st) => ({
      x: st.x,
      z: st.z,
      y: stationFlyHeight(st.spec, st.primary),
      kind: st.isStart ? 'start' : 'gate',
      order: st.plateIndex,
    }))
    .sort((a, b) => a.order - b.order);
}

/*
 * Everything on a designed course that is NOT flown through: barriers, turn
 * flags and cones.
 *
 * They are solid. A barrier the racing line has to go round is worth nothing
 * if a quad can fly through it, and the track builder's own warning pass
 * already tells the author when their line clips one, so the two halves
 * agree about what a barrier is.
 */
function courseProps(course, height, scene, colliders, baker, kit, padDecks = []) {
  const mats = sharedObstacleMats();
  /* Live groups the next-flag glow can parent onto, keyed by element id.
   * A glow that lives on the scoring square, even a small one, is still
   * a box beside the flag. The overlay has to share the flag's origin. */
  const markerHosts = new Map();
  /* Which sail print each marker gets, so a course's flags alternate the
   * way the field's do rather than all being the same one. */
  let markerIndex = 0;
  for (const s of course.structures) {
    const y = height(s.x, s.z) + s.baseY;
    if (s.kind === 'obstacle') {
      const w = s.dims.width;
      const d = s.dims.depth;
      const h = s.dims.height;
      const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats.panel);
      box.position.set(s.x, y + h * 0.5, s.z);
      box.rotation.y = s.yaw;
      box.castShadow = true;
      box.receiveShadow = true;
      outlineHull(box, 1.02);
      baker.bake(box);
      /*
       * Capsules along the barrier's long axis, radius half the SHORT one,
       * stacked up the height. A box collider would be exact and the
       * collision system speaks capsules, so each one is inscribed: it
       * under covers the two ends by the corner radius, which is the safe
       * direction to be wrong in for a thing you are trying not to hit.
       *
       * It used to be a single capsule at mid height with a radius of
       * max(d, h) / 2, because one horizontal capsule of radius d / 2
       * cannot reach the top and bottom of a barrier taller than it is
       * deep. Taking the height instead bought that coverage by inflating
       * the DEPTH to match: the stock 4 by 1 by 2 m barrier got a 1 m
       * radius against a 1 m deep panel, so half a metre of solid nothing
       * stood in front of each face and a line that visibly cleared the
       * barrier hit it. Stacking is how you get the height without paying
       * for it sideways. ceil(h / d) rows keeps the spacing at or under
       * one diameter, so the capsules touch and the face has no gap in it.
       */
      const rowR = d * 0.5;
      const rows = Math.max(1, Math.ceil(h / Math.max(d, 1e-6)));
      const rowH = h / rows;
      const half = Math.max(0, w * 0.5 - rowR);
      const cs = Math.cos(s.yaw);
      const sn = Math.sin(s.yaw);
      for (let i = 0; i < rows; i += 1) {
        const cy = y + (i + 0.5) * rowH;
        colliders.add(
          'wall',
          s.x - half * cs, cy, s.z + half * sn,
          s.x + half * cs, cy, s.z - half * sn,
          rowR,
        );
      }
      continue;
    }
    if (s.type === 'cone') {
      const r = s.dims.baseRadius;
      const h = s.dims.height;
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(r, h, 10),
        celMaterial({ color: 0xd2601f, rim: 0.24 }),
      );
      cone.position.set(s.x, y + h * 0.5, s.z);
      cone.castShadow = true;
      baker.bake(cone);
      colliders.add('obstacle', s.x, y, s.z, s.x, y + h, s.z, r);
      const host = new THREE.Group();
      host.position.set(s.x, y, s.z);
      scene.add(host);
      markerHosts.set(s.id, host);
      continue;
    }
    if (s.type === 'flag') {
      /*
       * The course marker flag the field already draws, at the author's
       * position, pointing the way they pointed it, and at the HEIGHT AND
       * MAST THICKNESS THEIR DOCUMENT CARRIES. It used to be drawn at the
       * field's own dressing size whatever the document said, so an author
       * who set a flag to 2.5 m got a 1.6 m one and the collider they were
       * warned about was not the object they could see.
       */
      const made = bannerFlag(
        kit, () => 0.5, height, s.x, s.z, markerIndex,
        Math.max(0.5, s.dims.height), Math.max(0.008, s.dims.poleRadius),
        s.baseY,
      );
      markerIndex += 1;
      made.group.rotation.y = s.yaw;
      made.group.updateMatrixWorld(true);
      /* The mast and its spike are static and bake; only the sail is left
       * live, and even that is only because it carries its own attribute. */
      baker.bake(made.pole);
      baker.bake(made.foot);
      made.group.remove(made.pole);
      made.group.remove(made.foot);
      scene.add(made.group);
      markerHosts.set(s.id, made.group);
      const flagR = Math.max(0.05, s.dims.poleRadius);
      /* The straight pole, then the whip that leans off it. See
       * mastWhipCollider: one vertical post stops covering the mast the
       * moment the mast stops being vertical. */
      colliders.add('obstacle', s.x, y, s.z, s.x, y + made.mast.bendY, s.z, flagR);
      const whip = mastWhipCollider(made.mast, s.x, y, s.z, s.yaw, flagR);
      colliders.add('obstacle', whip.ax, whip.ay, whip.az, whip.bx, whip.by, whip.bz, flagR);
      continue;
    }
    if (s.type === 'startPads') {
      /*
       * A row of launch stands, not floor tiles. Real 5 inch start blocks
       * are two foam-topped rails on a short wedge so the front arms can
       * catch when the pilot pitches forward. padSize is the grid cell the
       * stand sits in; the mesh is the stand.
       */
      const n = Math.max(1, Math.round(s.dims.pads));
      const mats = {
        wood: celMaterial({ color: START_BLOCK_WOOD, rim: 0.18 }),
        base: celMaterial({ color: START_BLOCK_WOOD_DARK, rim: 0.16 }),
        foam: celMaterial({ color: START_BLOCK_FOAM, rim: 0.12 }),
        lip: celMaterial({ color: START_BLOCK_LIP, rim: 0.24 }),
      };
      for (let i = 0; i < n; i += 1) {
        const off = (i - (n - 1) / 2) * s.dims.spacing;
        const stand = assembleStartBlock(THREE, s.dims.padSize, mats);
        /* Across the pads' own heading, which is the start line. */
        stand.position.set(s.x + Math.cos(s.yaw) * off, y, s.z - Math.sin(s.yaw) * off);
        stand.rotation.y = s.yaw;
        baker.bake(stand);
        padDecks.push({
          x: stand.position.x,
          z: stand.position.z,
          yaw: s.yaw,
          padSize: s.dims.padSize,
        });
      }
    }
  }
  return markerHosts;
}

/*
 * A designed course's stations, in the shape the placement loop wants.
 *
 * src/game/trackdoc.js has already done the hard half: it converted the
 * document's frame into the scene's, folded the entry sign into a direction
 * of travel, and applied the game's obstacle scale. What is left is naming
 * the dimensions the way obstacle() names them and picking which station is
 * the start and finish line.
 *
 * THE FIRST SEQUENCED APERTURE IS THE START LINE. A track document's start
 * pads are a place to park and a heading, not a hole, so the lap is timed
 * across the first gate in the flying order, exactly as the built in circuit
 * times it across station zero. The pads are where the quad begins, which is
 * the other half of the same arrangement.
 */
function coursePlacements(course) {
  const byElement = new Map();
  const out = [];
  course.stations.forEach((st, i) => {
    if (st.virtual) {
      const structure = st.structure;
      out.push({
        virtual: true,
        spec: {
          kindName: st.type,
          clearW: st.clearW,
          clearH: st.clearH,
          sillH: 0,
          stack: 1,
        },
        x: st.x,
        z: st.z,
        poleX: st.poleX,
        poleZ: st.poleZ,
        baseY: st.baseY,
        yaw: st.yaw,
        pitch: 0,
        isStart: false,
        plateIndex: i,
        primary: 0,
        elementId: st.elementId,
        marker: structure ? {
          type: st.type,
          yaw: structure.yaw,
          height: structure.dims.height,
          poleRadius: structure.dims.poleRadius,
          baseRadius: structure.dims.baseRadius,
        } : { type: st.type, yaw: st.yaw, height: st.clearH },
        stations: [{
          flyOrder: i,
          apertureIndex: 0,
          yaw: st.yaw,
          pitch: 0,
          cue: st.cue ?? '',
          elementId: st.elementId,
          virtual: true,
        }],
      });
      return;
    }
    let pl = byElement.get(st.elementId);
    if (!pl) {
      const structure = st.structure;
      pl = {
        spec: {
          kindName: st.type,
          clearW: st.clearW,
          clearH: st.clearH,
          sillH: structure.dims.sillH ?? 0,
          stack: structure.dims.stack ?? 1,
          levelPitch: structure.dims.levelPitch,
        },
        x: st.x,
        z: st.z,
        baseY: st.baseY,
        /* The MESH takes the first station's heading and the SCORING takes
         * each station's own. A vertical frame drawn at a heading and at
         * that heading plus half a turn is the same object, so a ladder
         * flown north early and south late is one structure with two gate
         * planes, which is what it is on a real field. */
        yaw: st.yaw,
        pitch: st.pitch,
        isStart: course.stations.findIndex((s) => !s.virtual) === i,
        plateIndex: i,
        primary: st.apertureIndex,
        elementId: st.elementId,
        /* Which of the course's marks this structure wears, read off the
         * document by trackdoc rather than counted here, so the builder's
         * preview and the world deal the sponsors out the same way. */
        dress: structure.dress,
        flagSigns: structure.flagSigns,
        flagLeans: structure.flagLeans,
        flagH: structure.flagH,
        flagPoleR: structure.flagPoleR,
        stations: [],
      };
      byElement.set(st.elementId, pl);
      out.push(pl);
    }
    pl.stations.push({
      flyOrder: i,
      apertureIndex: st.apertureIndex,
      yaw: st.yaw,
      pitch: st.pitch,
      cue: st.cue ?? '',
      elementId: st.elementId,
    });
  });
  return out;
}

/*
 * A TILTED aperture: a dive gate.
 *
 * WHY THIS IS NOT obstacle() WITH AN ANGLE. obstacle() builds a structure
 * that stands on the ground: two uprights from the grass to the top rail,
 * feet, mesh panels, a number plate. Rotating all of that about the opening
 * lays the uprights over and puts the feet in the air, and a gate whose legs
 * point sideways is not a gate somebody built, it is a gate somebody
 * knocked over. A real dive gate is a frame carried on a mast, so that is
 * what this makes: four tubes round the opening, tilted, on one vertical
 * post, with the same lit target obstacle() uses so the pilot reads it the
 * same way.
 *
 * The tilt is `pitch`, the angle the DIRECTION OF TRAVEL through the opening
 * dips below the horizontal, which is the same number src/game/trackdoc.js
 * hands the placement code and the same one src/game/race.js scores against.
 * At zero this degenerates to an ordinary elevated gate, which is a legal
 * thing to build and is exactly what a launch gate is.
 *
 * Local frame, and colliders, match obstacle(): x across the opening, y up
 * from the base, z through the opening.
 */
function tiltedGate(spec, index, isStart, pitch, opts = {}) {
  const g = new THREE.Group();
  const mats = sharedObstacleMats();
  const tubeR = BUILT_FRAME_TUBE_OD * 0.5;
  const clearW = spec.clearW;
  const clearH = spec.clearH;
  const centreY = spec.sillH + clearH * 0.5;
  const caps = [];

  /* The mast, from the grass to the middle of the opening, offset to the
   * back of the frame so it never stands in the hole. */
  const mastOff = clearH * 0.5 + tubeR * 3;
  const mastR = tubeR * 1.6;
  const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(mastR, mastR, centreY, 8),
    mats.frame,
  );
  mast.position.set(0, centreY * 0.5, mastOff);
  mast.castShadow = true;
  outlineHull(mast, 1.06);
  g.add(mast);
  caps.push({ kind: 'gate', ax: 0, ay: 0, az: mastOff, bx: 0, by: centreY, bz: mastOff, r: mastR });

  const foot = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.09, 0.7), mats.frame);
  foot.position.set(0, 0.045, mastOff);
  foot.castShadow = true;
  g.add(foot);
  caps.push({ kind: 'obstacle', ax: -0.3, ay: 0.045, az: mastOff, bx: 0.3, by: 0.045, bz: mastOff, r: 0.2 });

  /*
   * The frame and its target, built flat in a pivot and then tilted about
   * the opening's own centre. The pivot is what keeps the aperture centre
   * where the document put it however far the frame leans: rotating about
   * the base instead would swing the hole across the field.
   */
  const pivot = new THREE.Group();
  pivot.position.set(0, centreY, 0);
  /*
   * Sign. The station's pitch is the dip of the direction of travel, and
   * travel is minus the frame's own normal. Rotating the pivot about its
   * local x by +pitch takes local +z to the document's aperture normal,
   * which is the same plane race.js scores against. The previous minus
   * sign leaned the hoop the other way: a 55 degree dive gate's mesh and
   * its scoring plane were 110 degrees apart, so flying the green square
   * never crossed the test.
   */
  pivot.rotation.x = pitch;
  g.add(pivot);

  const halfW = clearW * 0.5;
  const halfH = clearH * 0.5;
  /* Two rails across and two up, their INNER surfaces the clear opening. */
  for (const sy of [-1, 1]) {
    const rail = new THREE.Mesh(
      new THREE.CylinderGeometry(tubeR, tubeR, clearW + 4 * tubeR, 8),
      mats.frame,
    );
    rail.rotation.z = Math.PI * 0.5;
    rail.position.set(0, sy * (halfH + tubeR), 0);
    rail.castShadow = true;
    outlineHull(rail, 1.06);
    pivot.add(rail);
  }
  for (const sx of [-1, 1]) {
    const stile = new THREE.Mesh(
      new THREE.CylinderGeometry(tubeR, tubeR, clearH + 4 * tubeR, 8),
      mats.frame,
    );
    stile.position.set(sx * (halfW + tubeR), 0, 0);
    stile.castShadow = true;
    outlineHull(stile, 1.06);
    pivot.add(stile);
  }
  /* The same moulded corners the standing gate has. The pivot's own origin
   * is the opening's centre, so the sill this asks for is minus half the
   * clear height rather than zero. */
  cornerFittings(pivot, [-halfH], clearW, clearH, tubeR);

  /*
   * Colliders for the tilted frame, in the OBSTACLE's frame rather than the
   * pivot's, because the placement code transforms one frame and knows
   * nothing about pivots. Rotating a point (0, y, 0) about x by +pitch gives
   * (0, y cos p, y sin p); adding the pivot height is the rest.
   */
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const at = (x, y) => ({ x, y: centreY + y * cp, z: y * sp });
  for (const sy of [-1, 1]) {
    const a = at(-(halfW + tubeR), sy * (halfH + tubeR));
    const b = at(halfW + tubeR, sy * (halfH + tubeR));
    caps.push({ kind: 'gate', ax: a.x, ay: a.y, az: a.z, bx: b.x, by: b.y, bz: b.z, r: tubeR });
  }
  for (const sx of [-1, 1]) {
    const a = at(sx * (halfW + tubeR), -(halfH + tubeR));
    const b = at(sx * (halfW + tubeR), halfH + tubeR);
    caps.push({ kind: 'gate', ax: a.x, ay: a.y, az: a.z, bx: b.x, by: b.y, bz: b.z, r: tubeR });
  }

  /* The lit target, in the pivot so it leans with the frame. Built at a sill
   * of zero because the pivot already sits at the opening's centre. */
  const marks = apertureMarkers(pivot, [-clearH * 0.5], clearW, clearH, 1, isStart, 0);

  /* The header rides on the leaning frame, above the opening in the frame's
   * own plane, so a pilot approaching from above reads it square on. */
  if (index > 0) {
    const plate = gateBanner(
      index,
      clearW + 4 * tubeR,
      opts.kit.header,
      isStart ? mats.panelStart : mats.panelRace,
    );
    plate.position.set(0, halfH + tubeR * 3 + GATE_BANNER_H * 0.5 + 0.03, 0);
    pivot.add(plate);
  }

  return {
    group: g,
    kindName: spec.kindName ?? 'diveGate',
    /* The highest structure on this obstacle, in its own frame. The banner
     * rides on the pivot, so its height above the opening's centre is
     * foreshortened by the tilt. */
    top: centreY + (halfH + tubeR * 3 + GATE_BANNER_H + 0.03) * Math.cos(pitch),
    /* The whole leaning frame stays live rather than baking, because its
     * parts sit inside a pivot whose rotation the baker would have to flatten
     * and the lit target has to keep its per obstacle materials anyway. A
     * course has a handful of dive gates, not a hundred, so the draw calls
     * are affordable and the alternative is a baked gate that cannot pulse. */
    animate: [pivot],
    ringMat: marks.ring.material,
    haloMat: marks.halo.material,
    /* A dive gate is one opening, so the per opening lists are one long. */
    ringMeshes: marks.rings,
    haloMeshes: marks.halos,
    glowMat: marks.glow.material,
    glowMesh: marks.glow,
    cueGroup: marks.cue,
    fillMat: marks.fillMat,
    ringColor: marks.ringColor,
    apertures: [{
      shape: 'square', index: 0, sillH: spec.sillH, centreY, clearW, clearH,
    }],
    primary: 0,
    aperture: { shape: 'square', index: 0, sillH: spec.sillH, centreY, clearW, clearH },
    colliders: caps,
  };
}

/*
 * One obstacle, at its BUILT dimensions.
 *
 * `spec` is a set of built dimensions: clearW, clearH, sillH, an optional
 * stack, and a kindName for the assertion and the scoring to name it by. The
 * race field passes builtObstacle('standardGate') and friends; a custom
 * course passes the dimensions its own document carries. Taking a spec
 * rather than a library key is what lets one builder serve both, and it is
 * the only reason this signature changed.
 *
 * index is the gate's number in FLYING order, painted on the top panel.
 * isStart makes it the start and finish gate, which is green. opts.primary
 * names which opening carries the glow, for a stack flown at a stated level.
 *
 * Returns the group, the per obstacle animated materials, the apertures (one
 * per opening, so a ladder returns three), and the colliders in the group's
 * OWN local frame, for the placement code to transform. Local frame: x
 * across the opening, y up from the base, z through the opening.
 */
function obstacle(spec, index, isStart, opts = {}) {
  if (!spec) {
    throw new Error('scene: obstacle called without a spec');
  }
  const kindName = spec.kindName ?? 'standardGate';
  const g = new THREE.Group();
  const mats = sharedObstacleMats();
  const tubeR = BUILT_FRAME_TUBE_OD * 0.5;
  const clearW = spec.clearW;
  const clearH = spec.clearH;
  const stack = spec.stack ?? 1;
  const caps = [];

  /*
   * Where each opening's sill sits.
   *
   * MultiGP publishes the opening and the elevation but NOT the spacing
   * between the openings of a stacked obstacle, so the spacing is derived:
   * two openings share one cross member, so the pitch is one clear height
   * plus one tube diameter. That rests on the tube diameter, which
   * track.js marks as an assumption (1 inch nominal schedule 40 PVC) and
   * not as a citation, so the ladder's overall height is an assumption too.
   * The openings themselves are published and exact.
   */
  /* A caller with its own figure wins. A track document carries the level
   * spacing it was authored with, and defaulting over the top of it would
   * quietly rebuild somebody's ladder at a spacing they did not choose. */
  const pitch = spec.levelPitch ?? (clearH + BUILT_FRAME_TUBE_OD);
  const sills = [];
  for (let k = 0; k < stack; k += 1) {
    sills.push(spec.sillH + k * pitch);
  }
  const topSurface = sills[stack - 1] + clearH;

  /* Uprights. Their INNER surfaces are the opening's width, so their
   * centres sit half a tube outboard of the clear span. They run from the
   * ground to just above the topmost cross member, which is what makes a
   * tower or a dive gate a tower rather than a floating hoop. */
  const upX = clearW * 0.5 + tubeR;
  const upTop = topSurface + 2 * tubeR;
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(tubeR, tubeR, upTop, 8),
      mats.frame,
    );
    post.position.set(sx * upX, upTop * 0.5, 0);
    post.castShadow = true;
    outlineHull(post, 1.06);
    g.add(post);
    caps.push({ kind: 'gate', ax: sx * upX, ay: 0, az: 0, bx: sx * upX, by: upTop, bz: 0, r: tubeR });

    /* A foot, so it looks like it is standing on the grass rather than
     * growing out of it. */
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.08, 0.62), mats.frame);
    foot.position.set(sx * upX, 0.04, 0);
    foot.castShadow = true;
    g.add(foot);
    caps.push({ kind: 'obstacle', ax: sx * upX, ay: 0.04, az: -0.31, bx: sx * upX, by: 0.04, bz: 0.31, r: 0.17 });
  }

  /* Cross members. One above every opening, and one below the lowest
   * opening only when that opening is off the ground: a gate standing on
   * grass has the ground as its sill, which is how a 5 ft opening is
   * measured on a chapter gate. */
  const memberLen = clearW + 4 * tubeR;
  const members = [];
  for (let k = 0; k < stack; k += 1) {
    members.push(sills[k] + clearH + tubeR);
  }
  if (spec.sillH > 0) {
    members.push(spec.sillH - tubeR);
  }
  for (const my of members) {
    const bar = new THREE.Mesh(
      new THREE.CylinderGeometry(tubeR, tubeR, memberLen, 8),
      mats.frame,
    );
    bar.rotation.z = Math.PI * 0.5;
    bar.position.set(0, my, 0);
    bar.castShadow = true;
    outlineHull(bar, 1.06);
    g.add(bar);
    caps.push({ kind: 'gate', ax: -memberLen * 0.5, ay: my, az: 0, bx: memberLen * 0.5, by: my, bz: 0, r: tubeR });
  }

  /* The moulded corner at every junction of upright and cross member. */
  cornerFittings(g, sills, clearW, clearH, tubeR);

  /*
   * The printed sleeves, outboard of each upright. They are what a pilot
   * actually reads the gate's plane from at speed, and they are solid, so
   * their collider sits entirely outboard of the clear span. The print is
   * the same one the track builder draws on its own preview.
   */
  const panelW = 0.42;
  const kit = opts.kit;
  const substrate = isStart ? mats.panelStart : mats.panelRace;
  const panelBottom = sills[0];
  const panelH = topSurface - panelBottom;
  for (const sx of [-1, 1]) {
    const cx = sx * (upX + tubeR + panelW * 0.5);
    /* Mirrored on the far leg, so the chequer column runs down the OUTSIDE
     * of the gate on both sides rather than down the outside of one and the
     * inside of the other. Mirrored in the PAINT, so nothing about the mesh
     * or its winding changes. */
    const sleeve = printedPanel(panelW, panelH, 0.03,
      sx < 0 ? kit.sleeveFlipped : kit.sleeve, substrate);
    sleeve.position.set(cx, panelBottom + panelH * 0.5, 0);
    g.add(sleeve);
    caps.push(...panelCaps(
      'obstacle', cx, panelBottom + panelH * 0.5, panelH * 0.5, panelW * 0.5, 'y',
    ));
  }

  /* The header banner, spanning the whole structure. */
  const outerW = 2 * (upX + tubeR + panelW);
  const plateGroup = gateBanner(index, outerW, kit.header, substrate);
  const plateY = upTop + GATE_BANNER_H * 0.5 + 0.03;
  plateGroup.position.set(0, plateY, 0);
  g.add(plateGroup);
  caps.push(...panelCaps(
    'obstacle', 0, plateY, plateGroup.userData.halfW, plateGroup.userData.r, 'x',
  ));

  /* The lit target, shared with the tilted gate builder. */
  const marks = apertureMarkers(g, sills, clearW, clearH, stack, isStart, opts.primary);
  const { ring, halo, glow, cue, ringColor, primary } = marks;

  /*
   * The apertures, MEASURED out of the geometry that was just built rather
   * than restated from the spec. The clear width is the gap between the two
   * uprights' inner surfaces and the clear height is the gap between the
   * cross members', both recovered from the meshes' own positions and their
   * own geometry parameters. T1 asserts the standard gate at 1.524 m within
   * 10 mm, and an assertion against a number somebody typed twice asserts
   * nothing at all.
   */
  const postMeshes = g.children.filter((c) => c.isMesh && c.geometry.type === 'CylinderGeometry'
    && Math.abs(c.rotation.z) < 1e-6);
  const measuredW = postMeshes.length >= 2
    ? Math.abs(postMeshes[1].position.x - postMeshes[0].position.x)
      - 2 * postMeshes[0].geometry.parameters.radiusTop
    : clearW;
  const apertures = [];
  for (let k = 0; k < stack; k += 1) {
    /* The clear height of opening k is its sill to the underside of the
     * member above it, both of which are positions in this group. */
    const memberY = sills[k] + clearH + tubeR;
    const measuredH = (memberY - tubeR) - sills[k];
    apertures.push({
      shape: 'square',
      index: k,
      sillH: sills[k],
      centreY: sills[k] + measuredH * 0.5,
      clearW: measuredW,
      clearH: measuredH,
    });
  }

  const headerTop = plateY + plateGroup.userData.r;
  const flags = attachHeaderFlags(g, opts, {
    headerTop,
    halfW: plateGroup.userData.halfW,
  });
  caps.push(...flags.colliders);

  return {
    group: g,
    kindName,
    /* The top of the header board, or of a header pennant if this gate
     * carries one, in this obstacle's own frame. */
    top: Math.max(headerTop, flags.top),
    /* The lit parts have per obstacle materials driven every frame, so they
     * stay live; everything else bakes. Header sails wave, so they stay live
     * too. */
    animate: [...marks.rings, ...marks.halos, glow, cue, ...flags.animate],
    ringMat: ring.material,
    haloMat: halo.material,
    /* One per opening, so a stack can light the hole the race wants and
     * leave the others dark. The material above is still shared. */
    ringMeshes: marks.rings,
    haloMeshes: marks.halos,
    glowMat: glow.material,
    glowMesh: glow,
    cueGroup: cue,
    fillMat: marks.fillMat,
    ringColor,
    apertures,
    primary,
    aperture: apertures[primary],
    colliders: caps,
  };
}

/*
 * Pennants on a gate header. Left is local -X, right is +X and TOP is 0, the
 * centre of the board, as seen facing the gate. The mast stands on the
 * board; the sail extends outboard so it does not cover the opening or the
 * number roundel, and a centre mast hangs its cloth to the right, which is
 * where a single flag hangs by convention. Poles bake with the frame; sails
 * stay live because they carry the cloth attribute.
 */
function attachHeaderFlags(g, opts, layout) {
  const signs = opts.flagSigns;
  if (!signs || !signs.length) {
    return { top: 0, animate: [], colliders: [] };
  }
  const flagH = Math.max(0.2, opts.flagH ?? 1.45);
  const mast = Math.max(0.008, opts.flagPoleR ?? 0.012);
  const headerTop = layout.headerTop;
  const halfW = layout.halfW;
  const kit = opts.kit;
  const mats = sharedObstacleMats();
  const animate = [];
  const colliders = [];
  const flags = new THREE.Group();
  g.add(flags);
  const curve = flagMast(flagH);
  let i = 0;
  for (const sx of signs) {
    const x = sx * halfW;
    /* Outboard, on both ends, and to the right from the centre. The pennant
     * is the same feather flag the course is lined with at a pennant's
     * size, so the mast bends the way the big ones do and the whole thing
     * turns as one: the mast and the sail take the same position and the
     * same half turn, because the geometry of both starts at the mast's
     * butt. The LEAN is a separate reading of the sign, because zero means
     * the middle of the board rather than no offset at all. */
    const lean = opts.flagLeans && opts.flagLeans[i] ? opts.flagLeans[i] : (sx < 0 ? -1 : 1);
    const turn = lean < 0 ? Math.PI : 0;
    const pole = new THREE.Mesh(flagMastGeometry(mast, flagH), mats.frame);
    pole.position.set(x, headerTop, 0);
    pole.rotation.y = turn;
    pole.castShadow = true;
    flags.add(pole);
    if (kit && kit.sails && kit.sails.length) {
      const sail = new THREE.Mesh(
        flagSailGeometry(mast, flagH),
        kit.sails[i % kit.sails.length],
      );
      sail.position.set(x, headerTop, 0);
      sail.rotation.y = turn;
      sail.castShadow = true;
      flags.add(sail);
      animate.push(sail);
    }
    /* Straight pole, then the whip, in this obstacle's own frame. The whip
     * leans outboard, which is the same direction the sail hangs. */
    const r = Math.max(0.05, mast);
    colliders.push({
      kind: 'obstacle',
      ax: x, ay: headerTop, az: 0,
      bx: x, by: headerTop + curve.bendY, bz: 0,
      r,
    });
    colliders.push({
      kind: 'obstacle',
      ax: x, ay: headerTop + curve.bendY, az: 0,
      bx: x + lean * curve.tip.x, by: headerTop + curve.tip.y, bz: 0,
      r,
    });
    i += 1;
  }
  return { top: headerTop + flagH, animate, colliders };
}

/*
 * A course marker flag: the feather banner that lines a race course.
 *
 * WHAT WAS WRONG WITH THE OLD ONE, in the order a pilot notices it. The
 * cloth was a 0.55 m plane whose CENTRE sat 0.58 m out from the pole, so
 * its near edge was 0.305 m clear of the mast: the flag was not attached to
 * anything, it hovered beside its own pole. The pole itself was a 1.6 m
 * cylinder whose centre was pushed to y = 1.7, so it spanned 0.9 to 2.5 m
 * and floated 0.9 m off the grass, while the collider ran from the ground
 * to 1.6 m and agreed with neither. And a rectangle on a stick is not what
 * a race course is lined with.
 *
 * WHAT WAS WRONG WITH THE ONE AFTER THAT. It was a teardrop on a straight
 * mast, which is a real product and is not the one the owner's reference
 * photograph shows. A race course is lined with FEATHER flags: the top of
 * the mast is a fibreglass whip that sweeps forward, the sail is a tall
 * narrow panel hanging off it, and the mast side of its head is swept away
 * by the bend. No outline cut on a straight mast makes that silhouette. The
 * shape now comes from `flagMast` and `flagSailProfile` in src/art/banners.js,
 * so the world, the builder's preview and the print cannot disagree about
 * it.
 *
 * WHAT THIS IS. A ground spike, a mast that bends, and a sail whose LEADING
 * EDGE IS THE MAST: every vertex of the seam sits on the pole's own surface
 * all the way round the bend, which is what makes it a flag rather than a
 * poster near a pole.
 *
 * SIZE, and it is a compromise between two things that both matter. On a
 * real course the flags stand over the gates, which is what the reference
 * photographs show and what the owner asked for. But the note the previous
 * build left is still binding: the flags were once 3.4 m on a 0.106 m pole,
 * 2.23 times the gate's aperture and 3.2 times the thickness of the gate's
 * own structural tube, and at 30 m the target gate subtended 23 px while a
 * nearby flag pole gave 435. The mistake there was the POLE, not the
 * height: an 18 mm mast carries a 2.9 m sail without ever being the widest
 * thing beside the gate, so the flag can stand over a 2.4 m gate the way it
 * does on a field and still not out measure it.
 *
 * The sail does not move from JavaScript. Its motion is in the cel
 * material's cloth term, driven by the clock every cel material already
 * carries, so all 72 sails merge into one draw call and still fly. See
 * CLOTH_CHUNK in celmat.js.
 */
const FLAG_H = 2.9;

/*
 * The mast, as a tapered tube along the bent centreline.
 *
 * NOT a TubeGeometry, and the reason is the taper: a feather flag's whip is
 * visibly thinner than the pole under it, and TubeGeometry carries one
 * radius. Building the rings by hand is a dozen lines and gets both.
 *
 * The centreline is planar, in xy, so the frame at every point is exact
 * rather than swept: the in plane normal is the tangent turned a quarter,
 * and the out of plane one is z. A Frenet frame on a curve this shallow
 * would twist for no reason.
 *
 * The mesh's ORIGIN IS THE BUTT, at y = 0, so a caller positions it where
 * the mast enters the ground and the sail shares that origin exactly. The
 * old straight cylinder was centred and every call site carried its own
 * half height to correct for it.
 */
function flagMastGeometry(poleR, h, radial = 5) {
  const { points } = flagMast(h);
  const pos = [];
  const uvs = [];
  const idx = [];
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    let tx = next.x - prev.x;
    let ty = next.y - prev.y;
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl;
    ty /= tl;
    /* The tangent turned a quarter, in the flag's own plane. */
    const nx = -ty;
    const ny = tx;
    const r = poleR * p.r;
    for (let a = 0; a < radial; a += 1) {
      const th = (a / radial) * Math.PI * 2;
      const ca = Math.cos(th);
      const sa = Math.sin(th);
      pos.push(p.x + nx * ca * r, p.y + ny * ca * r, sa * r);
      /*
       * A uv nothing samples, and it is not optional. The scenery merger
       * folds this mesh in with everything else that shares its material,
       * and BufferGeometryUtils.mergeGeometries refuses a set whose members
       * do not carry the SAME attributes: a mast with no uv beside a gate
       * tube with one drops the whole bucket and takes the frame with it.
       */
      uvs.push(a / radial, i / (points.length - 1));
    }
  }
  for (let i = 0; i < points.length - 1; i += 1) {
    for (let a = 0; a < radial; a += 1) {
      const a0 = i * radial + a;
      const a1 = i * radial + ((a + 1) % radial);
      idx.push(a0, a0 + radial, a1, a1, a0 + radial, a1 + radial);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

function flagSailGeometry(poleR, h) {
  /* Rows up the mast, columns out from it. The rows come from
   * flagSailProfile, which splits them across the rectangular body and the
   * swept corner so the print has the same metres per row in both; five
   * columns is what the cloth wave needs to read as a wave. */
  const { rows: profile } = flagSailProfile(h);
  const rows = profile.length;
  const cols = 5;
  const pos = [];
  const uvMinusZ = [];
  const uvPlusZ = [];
  const cloth = [];
  const idx = [];
  for (let r = 0; r < rows; r += 1) {
    const row = profile[r];
    const t = row.t;
    for (let c = 0; c < cols; c += 1) {
      const s = c / (cols - 1);
      /* The seam is ON the mast, not near it, and it stays there round the
       * bend because the leading point IS a point of the mast's centreline. */
      pos.push(poleR + row.lx + (row.tx - row.lx) * s, row.ly + (row.ty - row.ly) * s, 0);
      /*
       * One half of the printed sheet per sheet of cloth, and WHICH HALF IS
       * DECIDED BY WHICH WAY THE SHEET FACES. The winding below settles
       * that: the triangles in `idx` come out clockwise seen from +z, so
       * they face -z, and it is the ones in `back` that a viewer standing on
       * the +z side sees. u runs with the sail's own +x, which is to the
       * RIGHT of that +z viewer, so the +z facing sheet is the one that
       * reads the sheet's left half straight and the -z facing one reads the
       * right half BACKWARDS. That is what puts the accent band on the mast
       * for a viewer on either side and the mark the right way round for
       * both. Swap this pair and the mark is mirrored on BOTH sides instead
       * of neither, which is what a capture of it looked like.
       * See paintFlagSailPair in src/art/banners.js.
       */
      uvMinusZ.push(1 - s * 0.5, t);
      uvPlusZ.push(s * 0.5, t);
      cloth.push(s, t);
    }
  }
  /*
   * BOTH WINDINGS, and this is the fix for the flags reading as see through.
   *
   * A sail is one sheet, so it was drawn with side: DoubleSide. That is
   * right for the colour pass and WRONG for everything else in this
   * renderer, because the outline prepass in src/render/post.js overrides
   * every material in the scene with one of its own, and that override is
   * FrontSide. A flag turned so the camera sees its back therefore wrote no
   * depth and no normal into the prepass at all, so the composite resolved
   * that region against the background and blended the sail into whatever
   * was behind it. Every flag is yawed at random, so about half of them were
   * transparent and half were solid, which is exactly what it looked like.
   *
   * Emitting the reversed triangles here makes the sail an ordinary opaque
   * two sided SURFACE that every pass agrees about: the prepass sees front
   * faces from either side, the shadow map does too, and the material can go
   * back to FrontSide.
   *
   * The normals are NOT flipped with the winding, deliberately. The cloth
   * displacement in celmat.js moves each vertex along its own normal, so
   * flipping them would drive the two sheets apart by twice the wave
   * amplitude and split the flag down the middle. Sharing the normal costs
   * the reverse face its own lighting, which on a flat cel shaded banner is
   * a difference nobody can see.
   *
   * THE REVERSE HAS ITS OWN VERTICES NOW, and only because it has to have
   * its own texture coordinates: it reads the other half of the sheet. It
   * shares everything else with the front, position, wave and normal alike,
   * so the two sheets still move as one piece of cloth and the paragraph
   * above still holds. Fourteen rows of five is seventy vertices; doubling
   * that is nothing, and it is what stops every mark on the course reading
   * in a mirror from behind.
   */
  const n = rows * cols;
  const back = [];
  for (let r = 0; r < rows - 1; r += 1) {
    for (let c = 0; c < cols - 1; c += 1) {
      const a = r * cols + c;
      idx.push(a, a + cols, a + 1, a + 1, a + cols, a + cols + 1);
      back.push(
        n + a + 1, n + a + cols, n + a,
        n + a + cols + 1, n + a + cols, n + a + 1,
      );
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos.concat(pos), 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvMinusZ.concat(uvPlusZ), 2));
  geo.setAttribute('aCloth', new THREE.Float32BufferAttribute(cloth.concat(cloth), 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  /*
   * The reverse block is not in that index, so it came out of
   * computeVertexNormals with no normal at all. Copy the front's across
   * rather than computing over both sheets, which would average each pair
   * of opposed faces to nothing.
   */
  const nrm = geo.getAttribute('normal');
  for (let i = 0; i < n; i += 1) {
    nrm.setXYZ(n + i, nrm.getX(i), nrm.getY(i), nrm.getZ(i));
  }
  nrm.needsUpdate = true;
  geo.setIndex(idx.concat(back));
  return geo;
}

/*
 * A sail material. Takes the PAINTED TEXTURE rather than a colour, because a
 * race flag is a printed thing and not a coloured one, and one material per
 * print is what keeps the whole set of them inside two draw calls.
 */
function sailMaterial(tex, key) {
  return celMaterial({
    color: 0xffffff,
    /* No rim on the cloth. The rim term is one minus dot(normal, view), and
     * a near flat sail seen at any angle is edge on across its whole
     * surface, so the cool rim colour covered the entire flag: measured on
     * the old plain cloth, a dark red flag came out rgb 151 93 113, a dusty
     * pink nothing in the palette holds. */
    rim: 0.0,
    map: tex,
    /* FrontSide, with the reverse faces in the geometry. See
     * flagSailGeometry: DoubleSide is invisible to the outline prepass's
     * override material and made half the flags transparent. */
    side: THREE.FrontSide,
    cloth: FLAG_SAIL_CLOTH,
    key,
  });
}

function bannerFlag(kit, rng, height, x, z, index, h = FLAG_H, poleR = 0.018, baseY = 0) {
  const g = new THREE.Group();
  const mast = Math.max(0.008, poleR);
  const pole = new THREE.Mesh(
    /* Standing ON the ground, from the spike to the whip's tip, so the mesh
     * and the collider describe the same object. The geometry's origin is
     * the butt, so there is no half height to carry here. */
    flagMastGeometry(mast, h),
    celMaterial({ color: 0xd7dbe0, rim: 0.2 }),
  );
  g.add(pole);
  /* The spike plate. Without it a 36 mm mast reads as growing out of the
   * grass rather than as driven into it. */
  const foot = new THREE.Mesh(
    new THREE.CylinderGeometry(mast * 3.4, mast * 4.2, 0.035, 6),
    celMaterial({ color: 0x4a5364, rim: 0.2 }),
  );
  foot.position.y = 0.018;
  g.add(foot);
  const sail = new THREE.Mesh(
    flagSailGeometry(mast, h),
    kit.sails[Math.abs(Math.round(index)) % kit.sails.length],
  );
  sail.castShadow = true;
  g.add(sail);
  g.position.set(x, height(x, z) + baseY, z);
  g.rotation.y = rng() * Math.PI;
  const curve = flagMast(h);
  return {
    group: g,
    sail,
    pole,
    foot,
    height: h,
    /*
     * The two segments the mast occupies, in the flag's OWN frame: the
     * straight pole and then the whip that leans forward off it. A caller
     * that collides the mast has to collide both, because the tip is most of
     * a metre downwind of the butt on a 2.9 m flag and a single vertical
     * post would leave the part a pilot can see standing in clear air. The
     * caller applies the group's yaw, which it may have replaced.
     */
    mast: { bendY: curve.bendY, tipX: curve.tip.x, tipY: curve.tip.y },
  };
}

/*
 * The bent half of a mast as a world space capsule, given where the flag
 * stands, how high its base sits and which way it is turned. Shared by the
 * two callers that collide a marker flag so they cannot disagree about the
 * sign of the yaw.
 */
function mastWhipCollider(m, x, y, z, yaw, r) {
  const c = Math.cos(yaw);
  const sn = Math.sin(yaw);
  return {
    ax: x, ay: y + m.bendY, az: z,
    bx: x + m.tipX * c, by: y + m.tipY, bz: z - m.tipX * sn,
    r,
  };
}

/*
 * The title screen's flythrough, as a closed line of points.
 *
 * THE BUILT IN CIRCUIT'S TITLE SHOT. On a map with a course that covers a
 * field, orbiting a point is the wrong shot: it framed the start gate and
 * nothing else, so a player choosing between two tracks was shown the same
 * nine metre circle whichever one they picked. What that course looks like
 * IS the course, so the camera flies it. A designed course does not use
 * this line; see attractOrbit.
 *
 * It flies ABOVE the racing line rather than along it, and the clearance is
 * derived rather than picked. A fixed height cannot work on this field: a
 * standard gate tops out about 2.4 m, a two level tower about 4.2 m and the
 * dive gate's frame hangs at 15 ft, so any constant either buries the camera
 * in a tower or leaves the course a distant smudge. So each sample takes the
 * tallest structure within LOOKOUT metres of it and clears that, and the
 * profile is then smoothed, because a camera that steps up at every gate
 * reads as a lift rather than as a flight.
 */
const ATTRACT_LOOKOUT = 13;
const ATTRACT_CLEAR = 2.6;
const ATTRACT_FLOOR = 3.0;

function attractPath(curve, tops, height) {
  const len = Math.max(1, curve.getLength());
  const n = Math.max(24, Math.min(180, Math.round(len / 6)));
  const pts = [];
  for (let i = 0; i < n; i += 1) {
    const p = curve.getPointAt(i / n);
    let y = height(p.x, p.z) + ATTRACT_FLOOR;
    for (const t of tops) {
      const dx = t.x - p.x;
      const dz = t.z - p.z;
      if (dx * dx + dz * dz < ATTRACT_LOOKOUT * ATTRACT_LOOKOUT) {
        y = Math.max(y, t.top + ATTRACT_CLEAR);
      }
    }
    pts.push({ x: p.x, y, z: p.z });
  }
  /* Three passes of a [1, 2, 1] kernel, wrapped because the line closes.
   * Enough to turn the staircase into a swell without losing the clearance:
   * the kernel never lowers a sample below the mean of its neighbours, and
   * the neighbours are already clear of the same structure. */
  for (let pass = 0; pass < 3; pass += 1) {
    const src = pts.map((p) => p.y);
    for (let i = 0; i < n; i += 1) {
      const a = src[(i - 1 + n) % n];
      const b = src[i];
      const c = src[(i + 1) % n];
      pts[i].y = (a + 2 * b + c) * 0.25;
    }
  }
  return pts;
}

/*
 * Title shot for a designed course: orbit the layout, looking at it.
 *
 * Flying the racing line is the right establishing shot on a circuit that
 * covers a field. On a custom track it is often the wrong one. A single
 * triple stack's line is a few metres of wrap around one structure, and the
 * camera sprints that knot in a couple of seconds. What a compact course
 * looks like is the structure standing on the pitch, so the camera circles
 * it, framed from the course's own bounds rather than from the start gate.
 *
 * Empty courses keep the old nine metre spawn circle: circling nothing is
 * still a better shot of an empty pitch than a flight round nothing.
 */
function attractOrbit(course, gates, tops, heightFn) {
  const spawn = course.spawn || { x: 0, z: 0 };
  if (!course.structures.length && !gates.length) {
    return {
      x: spawn.x,
      y: heightFn(spawn.x, spawn.z),
      z: spawn.z,
      radius: 9,
      eye: 2.4,
      aim: 0.85,
      path: null,
    };
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  const include = (x, z, r) => {
    minX = Math.min(minX, x - r);
    maxX = Math.max(maxX, x + r);
    minZ = Math.min(minZ, z - r);
    maxZ = Math.max(maxZ, z + r);
  };
  for (const s of course.structures) {
    const d = s.dims || {};
    const r = Math.max(2.2, (d.clearW ?? d.width ?? 0) * 0.5, (d.depth ?? 0) * 0.5);
    include(s.x, s.z, r);
  }
  for (const g of gates) {
    include(g.position.x, g.position.z, 2.2);
  }
  include(spawn.x, spawn.z, 2.2);
  const cx = (minX + maxX) * 0.5;
  const cz = (minZ + maxZ) * 0.5;
  const ground = heightFn(cx, cz);
  let top = ground + 2.4;
  for (const t of tops) {
    top = Math.max(top, t.top);
  }
  const span = Math.hypot((maxX - minX) * 0.5, (maxZ - minZ) * 0.5);
  const rise = Math.max(1.6, top - ground);
  /* Radius floors at 16 m so a single stack is not a tight fidget around
   * its own frame, and caps at 80 m so a pitch-filling layout still reads
   * as a course rather than as a smudge on the horizon. */
  const radius = Math.min(80, Math.max(16, span * 1.4 + 4, rise * 1.1 + 8));
  const eye = Math.max(3.4, rise * 0.38 + span * 0.12 + 2.0);
  const aim = Math.max(0.7, Math.min(rise * 0.35, eye - 1.4));
  return {
    x: cx,
    y: ground,
    z: cz,
    radius,
    eye,
    aim,
    path: null,
  };
}

function skyDome() {
  const geo = new THREE.SphereGeometry(1500, 40, 24);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uHigh: { value: new THREE.Color(SKY_HIGH) },
      uHorizon: { value: new THREE.Color(HORIZON) },
      uSun: { value: SUN_DIR.clone() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      ${SKY_GLSL}
      varying vec3 vDir;
      uniform vec3 uHigh;
      uniform vec3 uHorizon;
      uniform vec3 uSun;
      void main() {
        gl_FragColor = vec4(celSkyColor(vDir, uSun, uHorizon, uHigh), 1.0);
      }
    `,
  });
  return new THREE.Mesh(geo, mat);
}

/* Chunky stylised clouds: clustered flattened icospheres, unlit, so they
 * stay bright and flat like painted shapes. */
function clouds(rng) {
  const g = new THREE.Group();
  /* One mesh per puff with a hard painted terminator keyed to world up,
   * plus a warm sun side rim. The previous build overlaid a second,
   * slightly smaller offset sphere for the underside, and the two
   * surfaces intersected and stippled: that speckling was a z fighting
   * artefact, not shading. */
  const mat = new THREE.ShaderMaterial({
    fog: false,
    uniforms: { uSun: { value: SUN_DIR.clone() } },
    vertexShader: `
      varying vec3 vN;
      void main() {
        vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vN;
      uniform vec3 uSun;
      void main() {
        vec3 n = normalize(vN);
        vec3 col = mix(vec3(0.70, 0.77, 0.91), vec3(1.0, 0.98, 0.94), step(0.12, n.y));
        /* Sun side warmth, but not enough to clip. Measured, cloud tops
         * reached 255 255 253, luminance 0.999, so a piece of dressing in
         * the corner of the frame was brighter than the gate the pilot is
         * meant to be looking at, and carried 78 percent of the frame's
         * bright area. */
        /* Held under the gate. Measured after the last attempt at this, a
         * cloud top still clipped at rgb 255 255 255, luminance 1.000, and
         * clouds carried 63 percent of the frame's bright area against the
         * gate ring's 32 percent. Dressing does not get to be the brightest
         * thing on screen, and a clipped pixel has no hue left either. */
        col *= 0.68;
        col += vec3(1.0, 0.86, 0.60) * pow(max(dot(n, normalize(uSun)), 0.0), 3.0) * 0.08;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  for (let i = 0; i < 26; i += 1) {
    const cluster = new THREE.Group();
    const puffs = 4 + Math.floor(rng() * 5);
    for (let p = 0; p < puffs; p += 1) {
      const r = 16 + rng() * 26;
      const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), mat);
      puff.position.set((rng() - 0.5) * 70, (rng() - 0.5) * 12, (rng() - 0.5) * 40);
      puff.scale.y = 0.52;
      cluster.add(puff);
    }
    const a = rng() * Math.PI * 2;
    const rad = 260 + rng() * 780;
    cluster.position.set(Math.cos(a) * rad, 190 + rng() * 190, Math.sin(a) * rad);
    g.add(cluster);
  }
  return g;
}

/*
 * The race field's world. The renderer, the camera and the airframe are the
 * session's, not this map's, and arrive in `shell`; everything built here
 * belongs to this map and dies with it. See src/maps/README.md for the
 * contract and src/render/shell.js for what the session keeps.
 *
 * `onProgress(fraction)` is called as construction advances, so the loading
 * screen reports work that actually happened rather than a timer. It is
 * optional and the map builds identically without it.
 */
/*
 * The race field.
 *
 * `course` is optional. Without it this builds the built in figure eight
 * exactly as it always has: same curve, same fourteen stations, same terrain,
 * same rng stream. With it, the same world is built around a DESIGNED course
 * instead, from a track document that src/game/trackdoc.js has already turned
 * into scene coordinates. Everything that is not the course, the sky, the
 * ridges, the lake, the grass, the light, the post chain, is shared, because
 * the point of flying your own track is to fly it in this world rather than
 * in a grey box.
 */
export function buildFieldScene(shell, onProgress, course = null, quality = null) {
  const q = quality && quality.field ? quality : qualityFor(quality);
  const renderer = shell.renderer;
  const camera = shell.camera;
  const progress = onProgress ?? (() => {});
  /* PCF soft, not PCF, when High or Medium ask for it. The field's shadow
   * map covers 144 m at 2048, so the softer filter is what keeps a tree's
   * cast edge from reading as a staircase. The city sets its own. Low
   * turns the map off: a Deck's fill rate cannot pay for a 2048 cascade. */
  renderer.shadowMap.enabled = q.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(HORIZON);
  scene.fog = new THREE.Fog(HORIZON, FOG_NEAR, FOG_FAR);
  const sky = skyDome();
  sky.layers.set(1);
  scene.add(sky);

  const rng = makeRng(20260811);

  const sun = new THREE.DirectionalLight(0xffe9c4, 1.45);
  sun.position.copy(SUN_DIR).multiplyScalar(120);
  sun.castShadow = q.shadows;
  const shadowMap = q.field.shadowMap || 2048;
  sun.shadow.mapSize.set(shadowMap, shadowMap);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 320;
  sun.shadow.bias = -0.0012;
  sun.shadow.normalBias = 0.03;
  const shadowExtent = q.field.shadowHalf || 72;
  sun.shadow.camera.left = -shadowExtent;
  sun.shadow.camera.right = shadowExtent;
  sun.shadow.camera.top = shadowExtent;
  sun.shadow.camera.bottom = -shadowExtent;
  scene.add(sun);
  scene.add(sun.target);
  /* Sky above, warm grass bounce below: this is what keeps shadowed faces
   * from going dead grey. */
  scene.add(new THREE.HemisphereLight(0x8fb8e8, 0x4a6b34, 0.42));

  /*
   * The curve is the spine of the world: the terrain flattens a corridor
   * along it and the scenery keeps clear of it. A designed course has one
   * too, its own racing line, so the same two things happen for it and a
   * custom track lands on flat mown ground with the trees kept off it
   * rather than in a forest. The built in circuit's title camera also
   * flies this line; a designed course orbits the layout instead.
   */
  /* A designed course stands on a marked pitch; the built in circuit is a
   * cross country loop through a valley and has never had one. */
  const pitch = makePitch(course);
  const curve = course ? courseCurve(course) : trackCurve();
  /* A course brings its own corridor samples. Computing them here would mean
   * importing the track document reader, and the reader pulls in the
   * builder's data modules, which the plain race field must not pay for:
   * check 16 measures exactly that. The course object is plain data and this
   * file knows nothing about where it came from. */
  const samples = course ? course.samples : curve.getPoints(180);
  /*
   * The clubhouse's site is worked out BEFORE the height field, because the
   * height field has to level the ground under it. It depends on nothing but
   * the pitch and is therefore not a chicken and egg problem: where the
   * pavilion stands is a function of the rectangle the author drew, not of
   * anything the world builds later.
   */
  const clubSite = clubhouseSite(pitch);
  const clubPad = clubhousePad(clubSite);
  const height = makeHeightField(samples, pitch, clubPad);

  const ground = terrain(height, samples, pitch);
  scene.add(ground);
  if (pitch) {
    scene.add(pitchSurface(pitch, course));
  }
  const occluders = [];
  /* Walks the world rng so the valley does not move. No mesh. */
  const grass = grassField(samples, rng, pitch);
  const noInkBaker = makeBaker();
  noInkBaker.bake(clouds(rng));
  /* Layer 0, not the no ink layer. Clouds used to write no depth into the
   * outline prepass, so the ink pass drew mountain silhouettes ACROSS the
   * cloud that the colour pass had correctly hidden: a two pixel ink line
   * lying on a continuous cloud surface. They occlude now, and their own
   * silhouette inks, which suits the painted shapes. */
  const cloudMeshes = noInkBaker.flush(scene);
  for (const m of cloudMeshes) {
    m.castShadow = false;
    m.receiveShadow = false;
  }

  /*
   * Solid things. Built here rather than recovered from the scene later,
   * because the baker applies each instance's matrix into the vertices and
   * merges every bucket, so after the flush a tree is anonymous floats in a
   * shared buffer. A collider has to be recorded where the geometry is made.
   */
  const colliders = new Colliders();
  /* Hoisted above the obstacles so their static parts can bake into the same
   * buckets as the scenery. It is flushed once, far below. */
  const baker = makeBaker();

  const gates = [];
  /*
   * FOURTEEN stations, not eight.
   *
   * The circuit is 569.6 m of arc, measured by walking __trackPoint at
   * 4000 samples. At eight stations that is 71.2 m of empty air between
   * gates. Measured from the spawn frame with __nextGate at 1600 by 900,
   * eight stations put the next gate 67.7 m out at 15.4 px of aperture and
   * 436 px left of centre, and the one after it 96.1 m out at screen
   * x = -1356, entirely off the side of the frame. So the pilot could see
   * exactly one gate, near the edge, and had to fly the rest from memory.
   * Fourteen stations put the next gate 46.3 m out at 17.8 px and 195 px
   * off centre, and the one after it 74.0 m out at 16.6 px and IN FRAME.
   * Two gates readable at once is the whole point: that is what tells you
   * which way the course turns before you commit to the one in front.
   *
   * The alternative was to shrink the circuit, which is what the spacing
   * complaint superficially suggests. Rejected on measurement: the
   * tightest radius of curvature on this figure eight is already 11.16 m,
   * at u=0 where the timing gate stands, which costs 3.7 g of lateral
   * acceleration at 20 m/s. Scaling the curve to put eight gates 40 m
   * apart means scaling that radius to 4.7 m, or 8.7 g at the same speed,
   * and the course stops being flyable at racing pace. More gates on the
   * same geometry changes the spacing without touching the flight feel.
   *
   * Even spacing is also now correct on its own. At eight, stations 2 and
   * 6 landed exactly on the figure eight's crossover at the origin, where
   * each one's posts stood in the other branch's racing line, so those two
   * were shifted by hand. Fourteen divides so that the nearest stations to
   * the crossover sit at u=0.2143 and u=0.2857, which is 20.3 m of clear
   * air either side of it: the crossing is open, framed by a gate on each
   * approach, with no hand tuning.
   */
  const gateCount = CIRCUIT_STATIONS;
  const gateU = Array.from({ length: gateCount }, (_, i) => i / gateCount);
  /*
   * THE COURSE IS AN ORIGINAL CHAPTER STYLE LAYOUT built from regulation
   * MultiGP obstacles, and it is labelled as one in the interface. It is
   * deliberately not a Universal Time Trial, for two reasons that pull the
   * same way. UTT 3 Bessel Run, whose full layout is recovered in
   * .loop/evidence/r10/utt3-layout.md and sits in src/game/track.js as data,
   * needs a 91.44 by 36.58 m field, and this figure eight is 210 by 236 m,
   * so laying UTT 3 here would mean rebuilding the terrain, the height
   * field's corridor and the whole racing line. And no published UTT uses
   * more than two obstacle types, while a course wants the vertical variety
   * that towers and dive gates give it.
   *
   * Stations, in scene order. Station 0 stays a ground level timing gate
   * because the craft spawns behind it and the start and finish plane has to
   * be somewhere a stationary quad can be pointed at.
   *
   * Scene index i is flown as position gateCount - i, so the list below
   * reads BACKWARDS from the pilot's point of view. Flown, the order is
   * timing, standard, standard, tower, standard, ladder, standard, dive,
   * championship, standard, tower, ladder, championship, standard: a
   * ground level opening between each elevated one, so the line climbs and
   * drops rather than sitting at one height, and never two tall obstacles
   * back to back except the dive into the championship gate, which is the
   * one place the drop is the point.
   */
  const stationKinds = [
    'timingGate',       /* 0,  start and finish, on the ground, flown 1st */
    'standardGate',     /* 1,  flown 14th */
    'championshipGate', /* 2,  flown 13th */
    'ladder',           /* 3,  flown 12th, the triple stack: three openings */
    'tower5x5',         /* 4,  flown 11th, a standard opening elevated 5 ft */
    'standardGate',     /* 5,  flown 10th */
    'championshipGate', /* 6,  flown 9th, the wider 7x6 */
    'diveGate',         /* 7,  flown 8th, a 7x6 at 15 ft, entered from above */
    'standardGate',     /* 8,  flown 7th */
    'ladder',           /* 9,  flown 6th, the second triple stack */
    'standardGate',     /* 10, flown 5th */
    'tower5x5',         /* 11, flown 4th, the second tower */
    'standardGate',     /* 12, flown 3rd */
    'standardGate',     /* 13, flown 2nd */
  ];
  /*
   * WHERE THE STATIONS ARE, as data, before anything is built.
   *
   * This list used to be computed inside the placement loop off the figure
   * eight's own parameter, which meant the loop could only ever place a
   * figure eight. Separating the two is the whole of what let a designed
   * course be flown: the list below is the built in circuit, a custom course
   * builds the same list out of a track document, and the loop underneath
   * does not know or care which it was handed.
   */
  const placements = course ? coursePlacements(course, height) : gateU.map((u, i) => {
    const p = curve.getPointAt(u);
    const tan = curve.getTangentAt(u);
    return {
      spec: specFor(stationKinds[i]),
      x: p.x,
      z: p.z,
      baseY: 0,
      yaw: Math.atan2(tan.x, tan.z),
      pitch: 0,
      /* Number plates count in FLYING order. The craft spawns facing
       * opposite the curve parameter direction, so the course as flown is
       * gate 0 then 13, 12, down to 1; scene index i is flown as position
       * gateCount - i. */
      isStart: i === 0,
      plateIndex: i === 0 ? 0 : gateCount - i,
      /* The field's own circuit carries no marks, so any slot does; the
       * scene index keeps the rule the same shape as a course's. */
      dress: i,
      primary: null,
      /* One station per structure, scoring every opening: MultiGP counts a
       * ladder as one gate however high you take it. */
      stations: [{ flyOrder: i === 0 ? 0 : gateCount - i, apertureIndex: null, yaw: Math.atan2(tan.x, tan.z) }],
    };
  });

  /*
   * The course's printed dress, made once and shared out over every gate and
   * every flag on it: one set of banners per sponsor's mark the document
   * carries, and one plain set when it carries none.
   */
  const kit = bannerKit(
    course ? course.logos : null,
    course ? (course.documentId ?? course.id ?? 'course') : 'field',
  );

  /*
   * Flags and cones have to exist before their scoring stations, because
   * the next-flag glow is parented onto the marker the pilot can see.
   * Building the glow on the scoring square, even a small one, is how
   * the last round still drew a box.
   */
  const padDecks = [];
  const markerHosts = course
    ? courseProps(course, height, scene, colliders, baker, kit, padDecks)
    : new Map();

  /*
   * How high a structure stands, at the point it stands, so the title
   * screen's flythrough can clear it. Filled from each obstacle's own world
   * bounding box rather than from its spec, because a tilted gate on a mast
   * and a three level ladder do not report their height the same way.
   */
  const obstacleTops = [];

  for (let i = 0; i < placements.length; i += 1) {
    const st = placements[i];
    const flyOrder = st.plateIndex;
    /* Null for a virtual gate: a scoring square beside a flag has no vinyl
     * on it at all, and the slot it would have taken belongs to a structure
     * that actually prints something. */
    const dress = st.virtual ? null : kit.forGate(st.dress ?? i);
    const made = st.virtual
      ? virtualGate(st.spec.clearW, st.spec.clearH, st.marker)
      : (Math.abs(st.pitch) > 1e-6
        ? tiltedGate(st.spec, flyOrder, st.isStart, st.pitch, { kit: dress })
        : obstacle(st.spec, flyOrder, st.isStart, {
          primary: st.primary,
          kit: dress,
          flagSigns: st.flagSigns,
          flagLeans: st.flagLeans,
          flagH: st.flagH,
          flagPoleR: st.flagPoleR,
        }));
    const g = made.group;
    const y = height(st.x, st.z) + st.baseY;
    const yaw = st.yaw;
    const p = { x: st.x, z: st.z };
    g.position.set(st.x, y, st.z);
    g.rotation.y = yaw;
    const host = st.virtual && st.elementId ? markerHosts.get(st.elementId) : null;
    if (host && made.holder) {
      /* Same origin and yaw as the flag or cone. The overlay is then the
       * marker's own mesh, not a copy aimed from the scoring square. */
      made.holder.removeFromParent();
      made.holder.position.set(0, 0, 0);
      made.holder.rotation.set(0, 0, 0);
      host.add(made.holder);
      made.animate.length = 0;
    } else if (st.virtual && made.setPole && st.poleX != null) {
      /* Fallback when the marker has no live host: put the holder on the
       * pole in the scoring square's frame, including the ground-height
       * difference so a slope does not leave the glow hanging. */
      const dx = st.poleX - st.x;
      const dz = st.poleZ - st.z;
      const cs = Math.cos(yaw);
      const sn = Math.sin(yaw);
      const poleY = height(st.poleX, st.poleZ)
        + ((st.structure && st.structure.baseY != null) ? st.structure.baseY : st.baseY);
      made.setPole(cs * dx - sn * dz, sn * dx + cs * dz, poleY - y, yaw);
    }
    const scored = st.stations.filter((s) => s.apertureIndex != null);
    if (scored.length > 1) {
      /* One number per hole that is a gate, so a spiral reads 4 then 5 then
       * 6 instead of one plate on a three hole frame. Matches the OSD. */
      for (const station of scored) {
        const ap = made.apertures[Math.min(
          made.apertures.length - 1,
          Math.max(0, station.apertureIndex),
        )];
        if (!ap) {
          continue;
        }
        const badge = openingBadge(station.flyOrder + 1);
        badge.position.set(st.spec.clearW * 0.5 + 0.22, ap.centreY, 0);
        g.add(badge);
      }
    }
    /*
     * Split the obstacle in two. The aperture outline, its halo and its
     * glow have per obstacle materials because their gains are driven every
     * frame, so they stay live meshes on their own group. Everything else is
     * static and shares its material with every other obstacle, so it goes
     * into the baker and merges: eight obstacles' frames, panels, feet and
     * numbers come out as a handful of draw calls instead of about two
     * hundred.
     */
    const anim = new THREE.Group();
    anim.position.copy(g.position);
    anim.rotation.y = yaw;
    /* The builder says which of its parts have to stay live. It used to be
     * found by matching materials against g's DIRECT children, which a
     * tilted gate breaks: its lit parts hang off a pivot, so the search
     * missed them and the baker swallowed a ShaderMaterial. */
    for (const part of made.animate) {
      part.removeFromParent();
      anim.add(part);
    }
    scene.add(anim);
    /*
     * How high this one stands, from the builder rather than from a bounding
     * box. A box would be measured after the lit parts have been moved out,
     * so a dive gate's whole leaning frame would be missing from it, and it
     * would include the additive glow quad, which is 2.6 openings across and
     * is light rather than structure.
     */
    obstacleTops.push({ x: st.x, z: st.z, top: y + made.top });
    baker.bake(g);
    /* Colliders, transformed from the obstacle's own frame into the world by
     * the same position and yaw the meshes got. The obstacle is solid: the
     * owner's words were that the gates need to be solid, so every frame
     * member, panel, foot and top plate is in here. */
    const cs = Math.cos(yaw);
    const sn = Math.sin(yaw);
    for (const c of made.colliders) {
      colliders.add(
        c.kind,
        p.x + c.ax * cs + c.az * sn, y + c.ay, p.z - c.ax * sn + c.az * cs,
        p.x + c.bx * cs + c.bz * sn, y + c.by, p.z - c.bx * sn + c.bz * cs,
        c.r,
      );
    }
    /*
     * ONE STRUCTURE, ONE GATE PER STATION.
     *
     * WHICH OPENINGS SCORE. MultiGP counts a ladder as one gate however high
     * you take it, so the built in circuit offers all of a stack's openings
     * and records which one was used: its station carries apertureIndex
     * null. A designed course is different, because its document names the
     * level, and a ladder flown low early and high late is two gates.
     * Crediting either opening for both would let a pilot fly the same hole
     * twice and call it a lap.
     *
     * Both gates on such a structure share its lit target. A designed stack
     * also gets a number on each scored hole, so a spiral is not one plate
     * on a three hole frame.
     */
    for (const station of st.stations) {
      const named = station.apertureIndex == null
        ? null
        : Math.min(made.apertures.length - 1, Math.max(0, station.apertureIndex));
      const scoring = named == null
        ? made.apertures
        : [made.apertures[named]];
      /*
       * Which openings LIGHT UP when this station is the target. A designed
       * stack names its hole, so exactly one lights and the pilot can see
       * which of a ladder's three they are being sent through; the built in
       * circuit offers all of a stack's openings and any of them scores, so
       * all of them light, which is still the honest picture of the rule.
       */
      const litApertures = named == null
        ? made.apertures.map((_, k) => k)
        : [named];
      gates.push({
        position: new THREE.Vector3(p.x, y, p.z),
        heading: station.yaw,
        /* The tilt of the direction of travel. Zero everywhere on the built
         * in circuit, which is why race.js's frame reduces to the old one
         * there exactly. */
        pitch: station.pitch ?? st.pitch,
        ringMat: made.ringMat,
        haloMat: made.haloMat,
        ringMeshes: made.ringMeshes,
        haloMeshes: made.haloMeshes,
        litApertures,
        ringColor: made.ringColor,
        glowMat: made.glowMat,
        glowMesh: made.glowMesh,
        cueGroup: made.cueGroup,
        fillMat: made.fillMat,
        /*
         * meshYaw and meshPitch used to be carried here, so setNextGate
         * could compare the station's direction of travel against the
         * STRUCTURE's own facing and work out which of a double sided
         * pane's faces the pilot approaches from. Nothing needs that any
         * more: the side is decided against the camera's half space, which
         * the mesh's orientation has no part in. Two fields that nothing
         * reads are two fields that go quietly wrong.
         */
        aperture: scoring[0],
        apertures: scoring,
        primary: made.primary,
        kindName: made.kindName,
        cue: station.cue ?? '',
        trackGlow: station.apertureIndex != null && (st.spec.stack ?? 1) > 1,
        elementId: station.elementId ?? st.elementId ?? null,
        apertureIndex: station.apertureIndex,
        /* What the T1 assertion below checks this gate's measured opening
         * against. A library obstacle is checked against the library; a
         * designed one against the dimensions its own document carried,
         * which is the same discipline applied to a different source of
         * truth. */
        wantW: st.spec.clearW,
        wantH: st.spec.clearH,
        flyOrder: station.flyOrder,
        virtual: Boolean(st.virtual),
        poleX: st.poleX,
        poleZ: st.poleZ,
        markerH: made.markerH,
      });
    }
  }

  /* Athletic paint on the ground: a dashed taut-string line, arrows only
   * at a height decision (two side by side: go up, one: stay low), and a
   * wrap on an isolated flag. Designed courses bring the guide already
   * converted; the built in circuit samples its own curve in the direction
   * it is flown, which is against the parameter, so a mark in front of
   * gate 13 is in front of the gate the pilot actually meets second.
   */
  {
    const guide = course
      ? (course.guide || null)
      : guideFromPolyline(circuitGuidePoints(curve), {
        holes: placements.map((st) => ({ x: st.x, z: st.z, r: GUIDE.holeGate, kind: 'gate' })),
        cues: circuitGuideCues(placements),
      });
    const marks = guide ? buildGuideMesh(guide, height, pitch) : null;
    if (marks) {
      scene.add(marks);
    }
  }

  /*
   * T1, asserted rather than asserted about. The standard MultiGP gate
   * opening is 5 ft square, 1.524 m, and every aperture above was measured
   * out of the built geometry's own positions and radii. If a change to the
   * frame ever moves an upright, this throws on load instead of quietly
   * shipping a barn door, which is what the old 3.5 m torus was.
   */
  for (const gt of gates) {
    if (gt.virtual) {
      continue;
    }
    for (const ap of gt.apertures) {
      if (Math.abs(ap.clearW - gt.wantW) > 0.01 || Math.abs(ap.clearH - gt.wantH) > 0.01) {
        throw new Error(
          `scene: ${gt.kindName} opening measured ${ap.clearW.toFixed(4)} by `
          + `${ap.clearH.toFixed(4)} m, wanted ${gt.wantW.toFixed(4)} by `
          + `${gt.wantH.toFixed(4)} m at gate scale ${GATE_SCALE}, `
          + 'outside the 10 mm tolerance',
        );
      }
    }
  }

  /*
   * WHICH OBSTACLE COMES NEXT, AS THREE TIERS AND NOT AS A BRIGHTNESS RAMP.
   *
   * Reported by a pilot: "it is easy to lose track of which obstacle comes
   * next". Every gate used to wear a lit ring, a halo and a glow at rest,
   * so a fourteen station course was fourteen lit targets and the one that
   * mattered was only the brightest of them. An earlier round already wrote
   * down that three rings at three levels of one amber read as a corridor
   * rather than a target, and the answer it reached then was to give the
   * next gate a different hue. That was not enough either: a hue separates
   * two objects a pilot is already looking at, and the report is about not
   * knowing where to look.
   *
   * The tiers then collapsed to two, owner's call: the TARGET is lit, a
   * subtle green glow that turns red from the wrong side, and EVERY other
   * obstacle carries no markings at all. A PVC frame in printed vinyl is
   * what a gate on a real field looks like when nobody is aiming at it,
   * and the follow tier's dim ring turned out to be one more thing
   * competing for the eye. A flag's glow follows the same rule: lit as
   * the target, dark otherwise, sitting on the pole and the cloth rather
   * than as a square beside them, and the print stays visible because the
   * light is additive and modest.
   */
  const FOLLOW_RING = 0.42;
  let nextGateIdx = -1;
  /* Where the target is, and which way round the pilot is to it. One
   * object, filled in place, read by the frame loop and by the shell's
   * screen mark, so neither of them allocates per frame. */
  const aim = {
    active: false,
    sceneIndex: -1,
    centre: new THREE.Vector3(),
    travel: { x: 0, y: 0, z: 1 },
    clearH: 0,
    /* True when the camera is on the side the gate is flown FROM. */
    correct: true,
    distance: 0,
    /* True when the target is a flag or a cone. The shell hides the
     * in-frame lock box on those, because that box was the scoring
     * square drawn on the display, and the glow on the marker is the
     * illustration now. */
    virtual: false,
  };
  function dressGate(gt, tier) {
    /* Material.visible, not a colour near black: the ring is opaque
     * geometry just inside the opening, so a dark ring is a dark bar across
     * the hole rather than an absent one. */
    gt.ringMat.visible = tier !== 'dark';
    gt.haloMat.visible = tier === 'target';
    gt.glowMat.visible = tier === 'target';
    /*
     * WHICH OPENING OF A STACK, and it is the mesh that says so rather than
     * the material, because every opening on one structure shares the
     * material that carries the colour. A ladder used to light all three
     * holes at once and leave the pilot to read a badge for the one they
     * were actually being sent through. Now only the named hole lights.
     */
    if (gt.ringMeshes) {
      for (let k = 0; k < gt.ringMeshes.length; k += 1) {
        const lit = tier !== 'dark' && gt.litApertures.indexOf(k) >= 0;
        gt.ringMeshes[k].visible = lit;
        if (gt.haloMeshes && gt.haloMeshes[k]) {
          gt.haloMeshes[k].visible = lit && tier === 'target';
        }
      }
    }
    if (tier === 'follow') {
      gt.ringMat.color.set(gt.ringColor).multiplyScalar(FOLLOW_RING);
    } else {
      gt.ringMat.color.set(gt.ringColor);
    }
    gt.haloMat.color.set(gt.ringColor);
    gt.glowMat.uniforms.uFront.value.set(gt.ringColor);
    gt.glowMat.uniforms.uBack.value.set(gt.ringColor);
    gt.haloMat.opacity = 0.34;
    gt.glowMat.uniforms.uGain.value = 0.08;
    if (gt.cueGroup) {
      gt.cueGroup.visible = Boolean(gt.virtual) && tier !== 'dark';
    }
    if (gt.fillMat) {
      gt.fillMat.uniforms.uWrong.value = 0;
      gt.fillMat.uniforms.uOpacity.value = tier === 'target' ? 0.22 : 0.10;
    }
  }
  function setNextGate(i, follow) {
    for (const gt of gates) {
      dressGate(gt, 'dark');
    }
    nextGateIdx = i;
    /* follow still arrives from race.js and is deliberately unused: the
     * owner asked for no markings on anything but the target. The
     * parameter stays so the callers and the harness readback keep their
     * shape while the decision is fresh enough to be reversed cheaply. */
    void follow;
    const target = i >= 0 && i < gates.length ? gates[i] : null;
    if (!target) {
      aim.active = false;
      aim.sceneIndex = -1;
      aim.virtual = false;
      return;
    }
    dressGate(target, 'target');
    target.ringMat.color.set(NEXT_COLOUR);
    target.haloMat.color.set(NEXT_COLOUR);
    target.glowMat.uniforms.uFront.value.set(NEXT_COLOUR);
    target.glowMat.uniforms.uBack.value.set(WRONG_COLOUR);
    /* 0.55, down from 0.95. The report: the target glow was bright enough
     * to obscure the gate's own dressing, a flag gate read as a glowing
     * box with the pennant washed out. The edge band stays legible at
     * 0.55; what goes is the interior bloom that painted over the frame. */
    target.glowMat.uniforms.uGain.value = 0.55;
    /* A stacked figure shares one glow across its openings. Put that
     * glow, and the pane, on the hole this station names. */
    if (target.trackGlow && target.aperture) {
      if (target.glowMesh) {
        target.glowMesh.position.y = target.aperture.centreY;
      }
      if (target.cueGroup) {
        target.cueGroup.position.y = target.aperture.centreY;
      }
    }
    /*
     * WHERE THE PILOT HAS TO COME FROM, AS A HALF SPACE.
     *
     * The direction of travel through the opening, from race.js's own
     * aperture frame, so the paint on a gate and the test that scores it
     * cannot disagree about which way through it goes. The approach side is
     * the half space BEHIND that direction, and setTargetSide below reads
     * the camera against it every frame.
     *
     * This replaces a comparison against the STRUCTURE's facing axis, which
     * existed only to work out which of a double sided pane's two faces was
     * the entry one. Deciding the side on the camera instead makes the mesh's
     * own orientation irrelevant, which is worth saying plainly: the previous
     * round of this bug was a dive gate wearing red on the way in, because a
     * horizontal aperture has no meaningful front face to pick. A half space
     * has no faces at all.
     */
    aim.travel = travelAxis(target.heading, target.pitch ?? 0);
    aim.virtual = Boolean(target.virtual);
    if (target.virtual && target.poleX != null) {
      /* Aim at the FLAG, not at the centre of the invisible scoring
       * square beside it. The half space test is unchanged: the pole
       * sits on the width axis, perpendicular to travel, so moving
       * the origin along that axis does not flip the side. */
      const h = target.markerH || target.aperture.clearH;
      aim.centre.set(target.poleX, target.position.y + h * 0.55, target.poleZ);
      aim.clearH = h;
    } else {
      aim.centre.set(
        target.position.x,
        target.position.y + target.aperture.centreY,
        target.position.z,
      );
      aim.clearH = target.aperture.clearH;
    }
    aim.sceneIndex = i;
    aim.active = true;
    if (target.cueGroup) {
      target.cueGroup.visible = true;
    }
    /* Colour it once here so the first frame after a gate is scored is
     * already right, rather than carrying the previous target's side for
     * however long it takes the frame loop to come round. */
    setTargetSide();
  }

  /*
   * The lit target's colour, decided against the camera, every frame.
   *
   * WHY THIS IS NOT LEFT TO gl_FrontFacing. The pane and the glow are
   * double sided planes that already chose green or red per fragment, and
   * that worked, but only on the pane and the glow. The RING does not have
   * a front and a back: it is four opaque boxes just inside the opening, so
   * every face a pilot can see is a front face. The ring is also the loudest
   * and longest ranged mark on the gate, measured at 3 px across at 20 m
   * while the pane is a 16 percent wash that does not resolve until the gate
   * is close. So the answer to "which way through" was carried entirely by
   * the part of the target that arrives last, which is exactly the report:
   * "sometimes you can't tell until you are right up to the obstacle".
   *
   * Reading the camera's own half space instead lets the ring, the halo, the
   * glow and the pane all say it, so the answer arrives with the first pixel
   * of the target rather than with the last.
   */
  /*
   * Is a point on the side the target is flown FROM?
   *
   * Its own function because it is the one claim this whole change rests
   * on, and a check has to be able to hold it against race.js's scoring
   * frame rather than against a second copy of the formula. Null when
   * nothing is the target.
   */
  function approachSide(x, y, z) {
    if (!aim.active) {
      return null;
    }
    return (x - aim.centre.x) * aim.travel.x
      + (y - aim.centre.y) * aim.travel.y
      + (z - aim.centre.z) * aim.travel.z < 0;
  }
  function setTargetSide() {
    if (!aim.active || nextGateIdx < 0 || nextGateIdx >= gates.length) {
      return;
    }
    const target = gates[nextGateIdx];
    const dx = camera.position.x - aim.centre.x;
    const dy = camera.position.y - aim.centre.y;
    const dz = camera.position.z - aim.centre.z;
    aim.distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    aim.correct = approachSide(camera.position.x, camera.position.y, camera.position.z);
    const col = aim.correct ? NEXT_COLOUR : WRONG_COLOUR;
    target.ringMat.color.set(col);
    target.haloMat.color.set(col);
    /* Both faces, because the side is now the camera's and not the
     * fragment's. A pane seen edge on used to flicker between the two. */
    target.glowMat.uniforms.uFront.value.set(col);
    target.glowMat.uniforms.uBack.value.set(col);
    if (target.fillMat) {
      target.fillMat.uniforms.uFront.value.set(col);
      target.fillMat.uniforms.uBack.value.set(col);
      target.fillMat.uniforms.uWrong.value = aim.correct ? 0 : 1;
    }
  }

  /*
   * Where the target is and which way round the pilot is to it, for the
   * shell's own screen mark. Returned by reference and never rebuilt, so
   * reading it every frame allocates nothing.
   */
  function targetAim() {
    return aim;
  }

  /*
   * How far scenery has to stand off the course.
   *
   * Fifteen metres from the racing line, which is right for a 570 m circuit
   * that sprawls over 210 by 236 m of valley. It is WRONG for a designed
   * course: a 60 by 40 m field is smaller than the built in circuit's
   * clearance, so the same rule stood trees inside the arena, one of them a
   * few metres off a gate. An author's field is an arena, and the rule that
   * says so is the rectangle they drew rather than a distance from a line
   * that happens to wander near its edge.
   */
  function onTheCourse(x, z) {
    /* Nothing stands on the pitch or in its fade, which is the whole point
     * of having one: the rule that keeps the arena clear is now the same
     * rectangle the player can see mown into the ground. */
    if (pitch && pitchEdge(pitch, x, z) < PITCH.fade) {
      return true;
    }
    let d = 1e9;
    for (const smp of samples) {
      d = Math.min(d, Math.hypot(x - smp.x, z - smp.z));
    }
    return d < 15;
  }

  /*
   * THE TREELINE.
   *
   * This used to be 420 objects thrown at a disc between 30 and 670 m of the
   * origin, which is an even scatter and reads as parkland: trees in ones and
   * twos, standing on the course, with sky between them. The club's ground is
   * not that and neither photograph allows it. The paddock is EMPTY, right
   * out to the fence, and the bush starts at the fence as a wall. The ground
   * level shot is the whole argument: a solid ragged band of gums across the
   * far side with nothing in front of it but straw.
   *
   * So the same budget of objects is spent along the boundary rather than
   * over the whole valley. Each one takes a random position along the
   * perimeter and a random distance out from it, biased hard toward the edge
   * so the band is dense where it meets the paddock and thins into the
   * distance, which is what a bush edge does: the trees that get the light
   * are the ones on the front row.
   *
   * COUNT IS UNCHANGED AT 420. Density here is not more trees, it is the same
   * trees in a band about a fortieth of the area, so the field's triangle and
   * draw budget barely moves and the frame stays where it was.
   */
  const SITE_PERIM = [];
  {
    let total = 0;
    for (let i = 0; i < SITE.length; i += 1) {
      const a = SITE[i];
      const b = SITE[(i + SITE.length - 1) % SITE.length];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      SITE_PERIM.push({ a, b, len, at: total });
      total += len;
    }
    SITE_PERIM.total = total;
  }
  /* A point that far along the boundary, and the outward normal there. */
  function perimAt(u) {
    const want = u * SITE_PERIM.total;
    let seg = SITE_PERIM[SITE_PERIM.length - 1];
    for (const s of SITE_PERIM) {
      if (want >= s.at && want < s.at + s.len) {
        seg = s;
        break;
      }
    }
    const t = seg.len > 0 ? (want - seg.at) / seg.len : 0;
    const px = seg.a.x + (seg.b.x - seg.a.x) * t;
    const pz = seg.a.z + (seg.b.z - seg.a.z) * t;
    /* Outward is whichever side of the edge is not the paddock. */
    let nx = -(seg.b.z - seg.a.z) / (seg.len || 1);
    let nz = (seg.b.x - seg.a.x) / (seg.len || 1);
    if (siteEdge(px + nx * 2, pz + nz * 2) < 0) {
      nx = -nx;
      nz = -nz;
    }
    return { px, pz, nx, nz };
  }

  for (let i = 0; i < 420; i += 1) {
    const u = rng();
    const along = rng();
    const outRoll = rng();
    const p = perimAt(u);
    /*
     * How far out from the fence. Cubed, so most of them are in the first
     * few metres and the tail reaches back into the scrub. Two metres inside
     * the line to start, because the gums in both photographs lean over the
     * fence rather than standing politely behind it.
     */
    const out = -2 + 150 * outRoll * outRoll * outRoll;
    /* Jitter along the boundary as well, or a straight edge draws a hedge. */
    const slide = (along - 0.5) * 26;
    const x = p.px + p.nx * out - p.nz * slide;
    const z = p.pz + p.nz * out + p.nx * slide;
    const isTree = rng() < 0.92;
    /*
     * Nothing stands on the paddock, on the pavilion's ground, or in the car
     * park. It is a DISCARD rather than a skip, the same as it always was:
     * every object is built first, from the same draws in the same order,
     * and then thrown away, because everything after this hangs off one rng
     * stream and skipping a draw would move all of it.
     */
    const cut = siteEdge(x, z) < -1
      || padEdge(clubPad, x, z) < 2
      || onCarPark(x, z)
      || onTheCourse(x, z);
    const obj = isTree
      ? tree(rng, height, x, z, cut ? null : colliders, 2.05)
      : rock(rng, height, x, z, cut ? null : colliders);
    if (cut) {
      continue;
    }
    baker.bake(obj);
    occluders.push({ x, z, r: isTree ? 4.2 : 1.4 });
  }

  /*
   * And the bush behind the bush. A hundred and ten more, scattered thinly
   * from the treeline out to 600 m, drawn WITHOUT the inked hull because at
   * that range it is geometry nobody can see.
   *
   * The front row alone left a hedge with daylight behind it and the sky
   * starting immediately above. Neither photograph has an edge: the aerial is
   * unbroken canopy to all four sides of the frame and the ground shot has
   * layers of it going back. These are what the eye reads as depth once the
   * front row stops.
   */
  for (let i = 0; i < 110; i += 1) {
    const a = rng() * Math.PI * 2;
    const rad = 150 + rng() * 450;
    const x = Math.cos(a) * rad;
    const z = SITE_SOUTH + 120 + Math.sin(a) * rad;
    const isTree = rng() < 0.9;
    const cut = siteEdge(x, z) < 25 || onCarPark(x, z);
    const obj = isTree
      ? tree(rng, height, x, z, cut ? null : colliders, 1.7, false)
      : rock(rng, height, x, z, cut ? null : colliders);
    if (cut) {
      continue;
    }
    baker.bake(obj);
    occluders.push({ x, z, r: isTree ? 3.4 : 1.4 });
  }

  /*
   * The cliff landmarks are gone with the lake. They were a valley's
   * furniture, six tiers of rock 9 to 24 m high standing around the course,
   * and there is nothing like them on a graded paddock in the Perth bush.
   * Neither photograph has so much as an outcrop in it.
   */

  /*
   * THE FENCE on the paddock boundary. Waist high chain link, which is what
   * both of the club's photographs show closing the ground off from the bush.
   */
  {
    const postMat = celMaterial({ color: 0x9aa1a8, rim: 0.2 });
    const meshTex = chainLinkTexture();
    const meshMat = celMaterial({
      color: 0xffffff,
      map: meshTex,
      /* Alpha tested rather than blended: chain link is mostly holes, and a
       * tested cutout needs no depth sorting and no second pass. */
      alphaTest: 0.45,
      transparent: false,
      side: THREE.DoubleSide,
      rim: 0.0,
      key: 'chainlink',
    });
    const fence = siteFence(height, postMat, meshMat);
    fence.group.updateMatrixWorld(true);
    baker.bake(fence.group);
    /*
     * Solid, in 20 m runs rather than post by post. A capsule at half the
     * fabric's height with a radius that covers it is the honest shape for a
     * thin wall the collision system has no plane primitive for, and 53 of
     * them is a broadphase cost worth paying for a fence a pilot will clip.
     */
    for (const r of fence.runs) {
      const y = height((r.ax + r.bx) * 0.5, (r.az + r.bz) * 0.5);
      colliders.add(
        'wall',
        r.ax, y + FENCE.height * 0.5, r.az,
        r.bx, y + FENCE.height * 0.5, r.bz,
        FENCE.height * 0.5,
      );
    }
  }

  /*
   * THE CLUBHOUSE.
   *
   * One mesh, one bucket, so the whole pavilion, its terrace, its apron, its
   * car park and its pit tables cost the field one merged mesh and the two
   * draw calls that go with it, once for the view and once for the outline
   * prepass. See src/art/clubhouse.js for why it is authored in vertex
   * colours rather than in eight materials.
   */
  const clubY = height(clubSite.x, clubSite.z);
  const clubDecks = [];
  let clubVerandahClear = 0;
  {
    const clubMat = celMaterial({
      color: 0xffffff, rim: 0.2, cloudShadow: 0.3, key: 'clubhouse',
    });
    clubMat.vertexColors = true;
    /*
     * The engraved plate, painted once into a canvas the same way the gate
     * banners are. No cloud shadow on it: a cloud crossing a plaque under a
     * verandah roof is a shadow that could not fall there, and the whole
     * point of this surface is that it stays legible.
     */
    const plaqueCanvas = bannerCanvas(PLAQUE_PX.w, PLAQUE_PX.h);
    paintPlaque(plaqueCanvas.getContext('2d'), PLAQUE_PX.w, PLAQUE_PX.h);
    const plaqueTex = new THREE.CanvasTexture(plaqueCanvas);
    plaqueTex.colorSpace = THREE.SRGBColorSpace;
    plaqueTex.anisotropy = 8;
    const plaqueMat = celMaterial({
      color: 0xffffff, map: plaqueTex, rim: 0.12, key: 'clubhousePlaque',
    });
    const club = assembleClubhouse(THREE, clubMat, plaqueMat);
    clubVerandahClear = club.verandahClear;
    club.mesh.position.set(clubSite.x, clubY, clubSite.z);
    club.mesh.rotation.y = clubSite.yaw;
    baker.bake(club.mesh);
    /* ADDED, NOT BAKED. The merger stamps receiveShadow on every bucket it
     * flushes, and this is the one mesh in the world that must not have it.
     * It is its own material and therefore its own bucket either way, so
     * baking it would have cost the same and bought nothing. */
    club.plaque.position.copy(club.mesh.position);
    club.plaque.rotation.y = clubSite.yaw;
    scene.add(club.plaque);

    /* Local frame to world, by the same convention the obstacles use. The yaw
     * is a quarter turn, so cos and sin are exactly 0 or +/-1 and a box stays
     * a box. */
    const cs = Math.round(Math.cos(clubSite.yaw));
    const sn = Math.round(Math.sin(clubSite.yaw));
    const wx = (lx, lz) => clubSite.x + lx * cs + lz * sn;
    const wz = (lx, lz) => clubSite.z - lx * sn + lz * cs;
    for (const solid of club.colliders) {
      if (solid.post) {
        const [lx, lz, y0, y1, r] = solid.post;
        colliders.addPost(solid.kind, wx(lx, lz), wz(lx, lz), clubY + y0, clubY + y1, r);
        continue;
      }
      const [x0, y0, z0, x1, y1, z1] = solid.box;
      const ax = wx(x0, z0);
      const az = wz(x0, z0);
      const bx = wx(x1, z1);
      const bz = wz(x1, z1);
      colliders.addBox(
        solid.kind,
        Math.min(ax, bx), clubY + y0, Math.min(az, bz),
        Math.max(ax, bx), clubY + y1, Math.max(az, bz),
      );
    }
    for (const d of club.decks) {
      const ax = wx(d.x0, d.z0);
      const az = wz(d.x0, d.z0);
      const bx = wx(d.x1, d.z1);
      const bz = wz(d.x1, d.z1);
      clubDecks.push({
        x0: Math.min(ax, bx), x1: Math.max(ax, bx),
        z0: Math.min(az, bz), z1: Math.max(az, bz),
        top: clubY + d.top,
      });
    }
    /*
     * THE CAR PARK AND ITS ROAD, in the SAME material the pavilion wears.
     *
     * That is deliberate and it is the whole cost story: the merger buckets
     * by material, so these bake into the clubhouse's existing bucket and
     * cost no extra mesh and no extra draw call. They are separate objects
     * because they belong to the GROUND, placed against the paddock's own
     * eastern edge, rather than to the building whose frame they used to sit
     * in and be dragged around by.
     */
    {
      const park = assembleCarPark(THREE, clubMat);
      const py = height(CARPARK_AT.x, CARPARK_AT.z);
      park.mesh.position.set(CARPARK_AT.x, py, CARPARK_AT.z);
      baker.bake(park.mesh);
      clubDecks.push({
        x0: CARPARK_AT.x + park.deck.x0,
        x1: CARPARK_AT.x + park.deck.x1,
        z0: CARPARK_AT.z + park.deck.z0,
        z1: CARPARK_AT.z + park.deck.z1,
        top: py + park.deck.top,
      });
      /* The kerb is solid; the bitumen is not, because a quad that meets a
       * flat surface has landed rather than crashed and height() already
       * offers it as a deck. */
      for (const k of park.kerbs) {
        colliders.addBox(
          'wall',
          CARPARK_AT.x + k.x0, py - 0.2, CARPARK_AT.z + k.z0,
          CARPARK_AT.x + k.x1, py + k.y, CARPARK_AT.z + k.z1,
        );
      }

      /*
       * The road, from the car park's southern end west to the pavilion's
       * apron. It runs along the OUTSIDE of the paddock's southern boundary,
       * threading the treeline, which is where the aerial's road goes and
       * which keeps it off the flying ground entirely.
       */
      const driveFrom = CARPARK_AT.x + CAR_PARK.w * 0.5;
      const driveTo = clubSite.x - 26.0;
      const drive = assembleDriveway(THREE, clubMat, Math.max(4, driveTo - driveFrom));
      const dy = height((driveFrom + driveTo) * 0.5, DRIVE_Z);
      drive.mesh.position.set(driveFrom, dy, DRIVE_Z);
      baker.bake(drive.mesh);
      clubDecks.push({
        x0: driveFrom,
        x1: driveTo,
        z0: DRIVE_Z - drive.halfWidth,
        z1: DRIVE_Z + drive.halfWidth,
        top: dy + CAR_PARK.top,
      });
      /* Nothing grows on the road either. */
      occluders.push({ x: CARPARK_AT.x, z: CARPARK_AT.z, r: 9 });
    }

    /*
     * Contact shading, as four circles down the building's spine rather than
     * one over the whole complex. The apron and the car park are already
     * covered by their own slabs, so an occluder over them would tint terrain
     * nobody can see; what needs grounding is the bank around the terrace.
     */
    for (let i = 0; i < 4; i += 1) {
      const lx = -18 + i * 12;
      occluders.push({ x: wx(lx, -5), z: wz(lx, -5), r: 7 });
    }
    /*
     * How high it stands, into the same list the obstacles report to. The
     * title camera sums its orbit radius and its eye height off this list, so
     * a 7.15 m ridge that is not in it is a ridge the establishing shot flies
     * through on a course whose own structures are shorter.
     */
    obstacleTops.push({ x: wx(0, -5.6), z: wz(0, -5.6), top: clubY + CLUBHOUSE_TOP });
  }

  /* Flowers: a few thousand tiny saturated quads. They cost almost
   * nothing and they are the difference between a green field and a
   * meadow, because they give the ground a second colour at a second
   * scale. */
  {
    const N = 2600;
    const pos = new Float32Array(N * 4 * 3);
    const col = new Float32Array(N * 4 * 3);
    const idx = new Uint32Array(N * 6);
    /* No white: at distance a white quad on grass reads as debris, not a
     * flower. Warm saturated petals stay in the meadow's colour family. */
    /* Warm petals only. The old list held 0xff7fb0 pink and 0xb98cff
     * violet, and on an unlit material they measured 0.378 luminance
     * against grass at 0.301: the most saturated pixels in the lower half
     * of the frame were cool magenta, in a meadow the comment above calls
     * warm. */
    const petals = [0xffd94a, 0xffb347, 0xf58a3c, 0xffe38a];
    const cc = new THREE.Color();
    let v = 0;
    let ii = 0;
    let n = 0;
    for (let i = 0; i < N; i += 1) {
      const s0 = samples[Math.floor(rng() * samples.length)];
      const a = rng() * Math.PI * 2;
      const r = 6 + rng() * 40;
      const x = s0.x + Math.cos(a) * r;
      const z = s0.z + Math.sin(a) * r;
      /* Hug the dirt. These used to sit 6 to 16 cm up so they poked out of
       * the grass canopy. Blades are not drawn, so that lift is a field of
       * floating chips. A centimetre or two clears the terrain without
       * z fighting. Same rng draw, shorter lift. */
      const y = height(x, z) + 0.012 + rng() * 0.018;
      const w = 0.045 + rng() * 0.035;
      cc.set(petals[Math.floor(rng() * petals.length)]);
      const base = v / 3;
      for (const [ox, oz] of [[-w, -w], [w, -w], [w, w], [-w, w]]) {
        pos[v] = x + ox; pos[v + 1] = y; pos[v + 2] = z + oz;
        col[v] = cc.r; col[v + 1] = cc.g; col[v + 2] = cc.b;
        v += 3;
      }
      idx[ii++] = base; idx[ii++] = base + 1; idx[ii++] = base + 2;
      idx[ii++] = base; idx[ii++] = base + 2; idx[ii++] = base + 3;
      n += 1;
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, n * 12), 3));
    fg.setAttribute('color', new THREE.BufferAttribute(col.subarray(0, n * 12), 3));
    /*
     * Normals, all straight up, because the petals are horizontal quads.
     *
     * This geometry had none, which was harmless while the material was
     * unlit. Putting a lit material on it turned the whole frame into flat
     * fog cream: a missing attribute reads as (0,0,0), normalize of that is
     * NaN, and the NaN spread out of these 2600 quads across the frame on
     * this software rasteriser. Nothing in the console, no shader error,
     * just a washed out world. Any lit material needs normals.
     */
    const fnorm = new Float32Array(n * 12);
    for (let i = 1; i < fnorm.length; i += 3) {
      fnorm[i] = 1;
    }
    fg.setAttribute('normal', new THREE.BufferAttribute(fnorm, 3));
    fg.setIndex(new THREE.BufferAttribute(idx.subarray(0, n * 6), 1));
    /* Cel shaded, not unlit. An unlit petal is byte identical in sun and
     * in shadow, which is the one thing the colour rule forbids, and it
     * made the flowers the most saturated thing in the lower frame. No rim:
     * a flat quad is edge on across its whole surface, so a rim term
     * floods it, the same trap the flag cloth fell into. */
    const fm = celMaterial({ color: 0xffffff, rim: 0.0, side: THREE.DoubleSide });
    fm.vertexColors = true;
    const flowers = new THREE.Mesh(fg, fm);
    flowers.layers.set(1);
    scene.add(flowers);
  }

  /*
   * Baked ambient occlusion into the terrain vertex colours. Contact
   * shading is the cheapest and highest yield spatial cue there is, and a
   * stylised render needs it MORE than a photoreal one, because there is
   * no texture detail or specular variation to fall back on: without it
   * every tree, rock and gate foot floats on the grass instead of sitting
   * in it. The scatter is deterministic so this can be done once at load
   * and costs nothing at runtime, and unlike the shadow map it reaches
   * the full draw distance.
   *
   * Occlusion tints toward the shadow blue rather than multiplying toward
   * black, so it stays inside the same warm light, cool shadow logic as
   * the ramp and the cloud shadows.
   */
  {
    const CELL = 8;
    const grid = new Map();
    for (const o of occluders) {
      const key = `${Math.floor(o.x / CELL)},${Math.floor(o.z / CELL)}`;
      let bucket = grid.get(key);
      if (!bucket) {
        bucket = [];
        grid.set(key, bucket);
      }
      bucket.push(o);
    }
    const gpos = ground.geometry.attributes.position;
    const gcol = ground.geometry.attributes.color;
    const aoTint = new THREE.Color(0x707fb8);
    for (let i = 0; i < gpos.count; i += 1) {
      const x = gpos.getX(i);
      const z = gpos.getZ(i);
      let occ = 0;
      const cx = Math.floor(x / CELL);
      const cz = Math.floor(z / CELL);
      for (let ax = cx - 2; ax <= cx + 2; ax += 1) {
        for (let az = cz - 2; az <= cz + 2; az += 1) {
          const bucket = grid.get(`${ax},${az}`);
          if (!bucket) {
            continue;
          }
          for (const o of bucket) {
            const d = Math.hypot(x - o.x, z - o.z);
            const k = 1 - Math.min(1, d / (2.6 * o.r));
            if (k > 0) {
              occ += Math.pow(k, 1.7);
            }
          }
        }
      }
      occ = Math.min(0.75, occ);
      if (occ > 0.001) {
        gcol.setXYZ(
          i,
          gcol.getX(i) * (1 - occ) + gcol.getX(i) * aoTint.r * occ,
          gcol.getY(i) * (1 - occ) + gcol.getY(i) * aoTint.g * occ,
          gcol.getZ(i) * (1 - occ) + gcol.getZ(i) * aoTint.b * occ,
        );
      }
    }
    gcol.needsUpdate = true;
  }

  /* Course markers along the circuit: close range speed reference.
   *
   * Designed courses do not get these. The author places flags in the
   * builder, and courseProps already stands those. Lining the racing line
   * as well put a ring of sails around a one-gate track: a short lap still
   * asked for at least eight flags, 8.5 m off a line that was itself a
   * twelve metre loop around the only obstacle. */
  if (!course) {
    const poleBaker = makeBaker();
    const sailBaker = makeBaker();
    /*
     * 72 flags round 570 m is one every 8 m, alternating sides, which is
     * what a taped course looks like. The built in figure is left as the
     * literal 72 rather than recovered from the length, and that is
     * deliberate. Every flag draws from the shared rng stream, so changing
     * how many there are shifts every random number after them and rebuilds
     * the whole valley. A world that is bit identical to the one that
     * shipped is worth more than one fewer magic number.
     */
    const flagCount = 72;
    for (let i = 0; i < flagCount; i += 1) {
      const u = i / flagCount;
      const p = curve.getPointAt(u);
      const tan = curve.getTangentAt(u);
      const nx = -tan.z;
      const nz = tan.x;
      const side = i % 2 === 0 ? 8.5 : -8.5;
      const fx = p.x + nx * side;
      const fz = p.z + nz * side;
      const f = bannerFlag(kit, rng, height, fx, fz, i);
      /* The mast is solid. It is a metre and a bit of aluminium beside the
       * racing line and a quad that clips one is finished, so it collides,
       * over the WHOLE mast the pilot can see. The cloth does not: a flag
       * brushing a prop is not a crash. */
      const fy = height(fx, fz);
      colliders.addPost('pole', fx, fz, fy, fy + f.mast.bendY, 0.018);
      const whip = mastWhipCollider(f.mast, fx, fy, fz, f.group.rotation.y, 0.018);
      colliders.add('pole', whip.ax, whip.ay, whip.az, whip.bx, whip.by, whip.bz, 0.018);
      f.group.updateMatrixWorld(true);
      poleBaker.bake(f.pole);
      poleBaker.bake(f.foot);
      sailBaker.bake(f.sail);
    }
    poleBaker.flush(scene);
    sailBaker.flush(scene);
  }

  /*
   * THE HORIZON, WHICH IS BUSH AND NOT MOUNTAINS.
   *
   * Four rings of cones used to stand here at 560, 830, 1080 and 1330 m,
   * 110 to 320 m tall, on a measured aerial perspective ladder. They were
   * good and they are gone, because the club's ground has nothing like them:
   * the aerial is unbroken canopy to every edge of the frame and the ground
   * level shot has bare sky straight above the treeline. A range of alps
   * behind a Perth flying field was the largest thing left in the picture
   * that is not there.
   *
   * What replaces them is the same idea one order smaller: rings of TREES,
   * far enough out to read as a band rather than as individuals, keeping the
   * ladder's job of telling the eye how far away the distance is. The value
   * ladder itself is inherited rather than re-derived, so the ordering the
   * old comment measured still holds, each ring paler and cooler than the one
   * in front of it and all of them under the sky.
   *
   * They are unlit for the same reason the mountains were: at this distance a
   * lit canopy lands in the ramp's shadow band and the far ring comes out
   * darker than the near one, which puts aerial perspective in reverse.
   */
  const HORIZON_DIST = [430, 620, 850];
  /*
   * Measured against the same two anchors the ridge ladder was solved for,
   * the fogged terrain at 0.192 and the sky behind it at 0.487, and sitting
   * lower in the band because bush is darker than rock: 0.235, 0.300, 0.365.
   * The tints narrow as they climb, because haze desaturates what it covers.
   */
  const HORIZON_TONE = [0x6f8352, 0x86956d, 0x9ba58b];
  const horizonMats = HORIZON_TONE.map((hex) => new THREE.MeshBasicMaterial({ color: hex, fog: false }));
  for (let ring = 0; ring < HORIZON_DIST.length; ring += 1) {
    const dist = HORIZON_DIST[ring];
    /* Enough of them that the ring closes at this radius: a gap in a treeline
     * a kilometre out reads as a hole in the world. */
    const n = 130 + ring * 40;
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2 + ring * 0.31 + (rng() - 0.5) * 0.05;
      const h = 14 + rng() * 16;
      const r = 9 + rng() * 9;
      /* A squashed sphere on no trunk. At 430 m and beyond a trunk is under
       * a pixel and the canopy is the whole silhouette. */
      const geo = new THREE.SphereGeometry(r, 6, 4);
      const m = new THREE.Mesh(geo, horizonMats[ring]);
      m.position.set(
        Math.cos(a) * dist,
        h * 0.45,
        SITE_SOUTH + 120 + Math.sin(a) * dist,
      );
      m.scale.set(1, h / (r * 2), 1);
      baker.bake(m);
    }
  }

  baker.flush(scene, 0);

  /* The craft is the session's, built once in src/render/shell.js and
   * re-parented into whichever map is active. */
  const quad = shell.quad;
  const discs = shell.discs;
  scene.add(quad);

  /*
   * COMPILE EVERY SHADER NOW, RATHER THAN THE FIRST TIME SOMETHING IS LOOKED
   * AT.
   *
   * Three compiles a material lazily, on the first frame that draws it. On a
   * world where every material is on screen within a second or two of the
   * spawn that is invisible. It stopped being invisible when the clubhouse
   * arrived: the pavilion stands 40 m off the racing line and a pilot can fly
   * a third of a lap before it first enters the frustum, and the frame that
   * finally does is the frame that pays for its program. A stall at a random
   * point in a timed lap is the one kind of frame drop a racing simulator
   * cannot have, and it is a stall the player earns by turning their head.
   *
   * It is also what made check 16's cel clock assertion stop meaning
   * anything. That check reads the size of the per frame clock walk at boot
   * and again after a map round trip and fails if it GREW, on the reasoning
   * that growth is a disposed material's uniform kept alive. With lazy
   * compilation the size is really a measure of how much of the world has
   * been looked at, so the clubhouse compiling somewhere between the two
   * measurements read as a leak: 44 at boot against 45 after, with the
   * meshes, the draw calls, the render target bytes and the attribute bytes
   * all identical. Measured, and the second reading was the honest one.
   * Compiling here makes the count a property of the world instead of a
   * property of where the camera has been.
   *
   * This is deliberately NOT eager registration inside celMaterial. Scenery
   * makes a material per tree and per canopy blob and throws all but one of
   * each bucket away unreferenced without disposing them, so registering at
   * construction would put about two thousand dead uniforms in the walk and
   * turn a bookkeeping question into the actual leak the check is looking
   * for. Only materials that reached the scene graph are compiled here.
   */
  renderer.compile(scene, camera);
  progress(1);

  /*
   * The field's far plane. 2600 m covers the valley and its ridge ladder out
   * to 1330 m. The near plane is the session's and is 0.2 m: the camera sits
   * inside a 150 mm airframe, so 4 cm buys nothing, and a 0.04 to 2600 range
   * left the outline prepass's depth buffer with under one depth code of
   * separation past about 500 m.
   */
  camera.far = 2600;
  camera.updateProjectionMatrix();

  /* Shadows follow the craft. shadowExtent is a half width, so the box is
   * 144 m across at 2048, which is 7.0 cm per texel: crisp enough for
   * contact shadows where the pilot is looking, instead of mush over
   * 1.7 km. This comment said 58 m until a reviewer read the constant. */
  function updateShadowFocus(target) {
    sun.position.copy(target).addScaledVector(SUN_DIR, 130);
    sun.target.position.copy(target);
    sun.target.updateMatrixWorld();
  }

  function updateWind(t) {
    /* This is what flies the flags now. Every sail's wave is a function of
     * this clock and the vertex's own world position, computed in the cel
     * material's vertex shader, so there is no per flag work here at all. */
    updateCelTime(t);
    /* Which side of the target the pilot is on can change at 30 m/s, and
     * the whole point of it is that the answer is on the gate before the
     * gate is close, so it is read every frame rather than on a pass. */
    setTargetSide();
    if (nextGateIdx >= 0 && nextGateIdx < gates.length) {
      const gt = gates[nextGateIdx];
      const pulse = 0.5 + 0.5 * Math.sin(t * 4.4);
      /* Pulse the glow, not the ring's hue. Lerping the ring toward white
       * made the target lose the one colour that identifies it. The levels
       * came down with the board report about the glow obscuring the gate:
       * rest 0.55 peak 0.73 against the old 0.95 to 1.25, halo 0.40 to
       * 0.62, pane 0.12 to 0.20, a transparency gradient rather than a
       * floodlight, and the flag above the header stays visible. */
      gt.glowMat.uniforms.uGain.value = 0.55 + 0.18 * pulse;
      if (gt.glowMat.uniforms.uCelTime) {
        gt.glowMat.uniforms.uCelTime.value = t;
      }
      gt.haloMat.opacity = 0.40 + 0.22 * pulse;
      if (gt.ringMat.transparent) {
        gt.ringMat.opacity = 0.58 + 0.22 * pulse;
      }
      if (gt.fillMat && gt.fillMat.uniforms && gt.fillMat.uniforms.uOpacity) {
        gt.fillMat.uniforms.uOpacity.value = 0.12 + 0.08 * pulse;
      }
    }
  }

  /* Every collider is in by now, so freeze the flat arrays and build the
   * broadphase grid. Nothing may be added after this. */
  colliders.build();

  progress(1);

  /*
   * Where a run starts, and what the title screen looks at. Both used to be
   * computed in main.js out of gates[0], which is exactly why a map with no
   * gates crashed the shell before its first frame. They belong to the map:
   * a map knows where its start line is and a shell does not.
   *
   * A few metres BEHIND the start line, facing down the circuit. Parked
   * exactly on the timing plane, the first millimetre of drift would arm the
   * lap clock at zero airspeed. The craft faces opposite the course tangent,
   * so behind the line is along +tangent.
   */
  const start = gates.length ? gates[0] : null;
  const SPAWN_BACK = 7;
  /* A designed course parks the quad on its own start pads. The built in
   * circuit has no pads, so it stands the quad back from its timing gate. */
  const spawn = course
    ? { x: course.spawn.x, z: course.spawn.z, yaw: course.spawn.yaw, pitch: course.spawn.pitch || 0 }
    : {
      x: start.position.x + Math.sin(start.heading) * SPAWN_BACK,
      z: start.position.z + Math.cos(start.heading) * SPAWN_BACK,
      yaw: start.heading,
    };
  /*
   * What the title screen looks at.
   *
   * The built in circuit flies a lap: what that course looks like IS the
   * course, and the line is long enough that a cruise along it reads as a
   * flight rather than as a fidget. A designed course orbits its own
   * bounds instead. The orbit's fallback framing (empty pitch, or the
   * built-in start-gate circle) is unchanged and still earns its comment:
   * the opening is 1.524 m square with its centre at 0.762 m, so 9 m out
   * and 2.4 m up, aimed at the aperture centre. 19 m out aimed 2.5 m up was
   * framed for a 5 m gate and pointed at empty air above one too small to
   * see.
   */
  const attract = course
    ? attractOrbit(course, gates, obstacleTops, height)
    : {
      x: start ? start.position.x : spawn.x,
      y: start ? start.position.y : height(spawn.x, spawn.z),
      z: start ? start.position.z : spawn.z,
      radius: 9,
      eye: 2.4,
      aim: 0.85,
      path: gates.length ? attractPath(curve, obstacleTops, height) : null,
      /* Metres per second along the line, and metres of look ahead. 13 m/s
       * is a cruising lap rather than a racing one, which is what a title
       * screen wants: fast enough to read as flight, slow enough to read
       * the course. */
      speed: 13,
      lookAhead: 17,
      /* How far below the camera the aim point sits, so the shot looks
       * along the course and slightly down at it rather than at the
       * horizon. */
      aimDrop: 2.6,
    };

  return {
    id: course ? 'custom' : 'field',
    name: course ? course.name : 'Race field',
    /* A designed course with no stations is freestyle: no lap, no gate
     * HUD. The built in field always has a circuit, so it stays a race. */
    mode: course && !(course.stations && course.stations.length) ? 'freestyle' : 'race',
    scene, gates, curve, colliders, spawn, attract,
    /* Anything the reader could not honour, for the shell to show once. */
    notes: course ? course.warnings : [],
    /*
     * Reference objects, measured off the built world rather than restated.
     * The gate aperture is read out of the torus the scene actually drew, and
     * grass blade height is still measured off the world rng walk even though
     * blades are not drawn: a 0.26 to 0.68 m blade beside a 1.524 m opening
     * is the scale error this project has already shipped once, and the
     * check has to keep seeing the authored size. tests/lib/checks.js check
     * 15 asserts them.
     */
    references: {
      /* 1.524 is MultiGP's published 5 ft opening; the course is BUILT at
       * GATE_SCALE times that, which src/game/track.js declares and explains.
       * The reference states the built figure because that is the hole the
       * pilot flies and the one a scale check has to band. */
      gateOpeningW: { measured: (gates[0] ?? { aperture: { clearW: 0, clearH: 0, centreY: 0 } }).aperture.clearW, unit: 'm', real: `${(1.524 * GATE_SCALE).toFixed(4)}, MultiGP standard gate 1.524 at gate scale ${GATE_SCALE}` },
      gateOpeningH: { measured: (gates[0] ?? { aperture: { clearW: 0, clearH: 0, centreY: 0 } }).aperture.clearH, unit: 'm', real: `${(1.524 * GATE_SCALE).toFixed(4)}, MultiGP standard gate 1.524 at gate scale ${GATE_SCALE}` },
      gateApertureCentreY: { measured: (gates[0] ?? { aperture: { clearW: 0, clearH: 0, centreY: 0 } }).aperture.centreY, unit: 'm', real: '0.762, half the opening' },
      grassBladeHeight: { measured: grass.bladeHeightRange, unit: 'm', real: '0.03 to 0.09, mown' },
      /*
       * The clubhouse's verandah, measured as the gap a pilot actually has:
       * the underside of the roof taken off the COLLIDER the craft would hit,
       * minus the deck top taken off the LANDABLE surface it would stand on.
       * Neither number is restated from the dimension table, so a change to
       * either that closes the gap is caught here rather than by somebody
       * flying into a soffit. A pavilion verandah is the one object on this
       * map built to a human rather than to a rulebook, which is exactly the
       * kind of thing this check exists to band.
       */
      clubhouseVerandahClear: {
        measured: clubVerandahClear,
        unit: 'm',
        real: '2.4 to 2.7, an Australian pavilion verandah at its outer edge',
      },
    },
    updateShadowFocus, updateWind, setNextGate, targetAim, approachSide,
    graphics: q.id,
    /* Kept as no-ops so the shell has one call shape. The racing line is
     * a planner tool now; the target in the air is the green glow. */
    setRacingLine() {},
    hasRacingLine: false,
    updateRacingLine() { return null; },
    /*
     * The contact surface. The third argument is the height the query is made
     * FROM, which the city needs so a quad can fly under the overbridge and
     * land on its deck. The field's dirt is one surface; a designed course
     * also offers each launch stand as a short deck, so the craft can rest
     * on the rails. A query from well below the stand still sees grass,
     * matching the city's step rule, so scenery placed with height(x, z)
     * stays on the dirt and the stands do not sit on themselves.
     */
    height: (x, z, fromY) => {
      const g = height(x, z);
      if (!padDecks.length && !clubDecks.length) {
        return g;
      }
      /*
       * THE HIGHEST SURFACE WITHIN A STEP OF WHERE THE QUERY WAS MADE FROM,
       * not the highest surface there is.
       *
       * The difference did not exist while the only platforms were launch
       * stands, because a start block is one deck over bare grass and there
       * is nothing to be between. The clubhouse is a STACK: grass at 0, the
       * apron at 0.12, the terrace at 0.45 and a pit table top at 1.19, all
       * over the same square metre. Taking the maximum and then asking
       * whether it was in reach dropped a quad hovering half a metre over a
       * table straight through the terrace to the grass, because the table
       * was out of reach and the terrace never got considered. Each candidate
       * is now tested for reach on its own and the best of the reachable ones
       * wins, with the dirt as the floor that is always reachable.
       */
      let best = g;
      const STEP = 0.55;
      const offer = (top) => {
        if (fromY != null && fromY + STEP < top) {
          return;
        }
        if (top > best) {
          best = top;
        }
      };
      /* The clubhouse's terrace, its apron, its car park and every pit table
       * top. Flat rectangles, axis aligned because the complex is only ever
       * yawed by a quarter turn, so the test is a rectangle test. */
      for (const deck of clubDecks) {
        if (x < deck.x0 || x > deck.x1 || z < deck.z0 || z > deck.z1) {
          continue;
        }
        offer(deck.top);
      }
      for (const pad of padDecks) {
        const dx = x - pad.x;
        const dz = z - pad.z;
        const c = Math.cos(pad.yaw);
        const s = Math.sin(pad.yaw);
        const across = dx * c - dz * s;
        const along = dx * s + dz * c;
        const deck = startBlockContactHeight(pad.padSize, across, along);
        if (deck == null) {
          continue;
        }
        offer(g + deck);
      }
      return best;
    },
    /* No animation on the field depends on the physics clock: the flags and
     * the glow pulse are wall clock decoration and updateWind already drives
     * them. Present so the shell has one call shape. */
    updateAnim: () => {},
    dispose() {
      scene.remove(quad);
      disposeSceneGraph(scene, SESSION_TEXTURES);
    },
  };
}
