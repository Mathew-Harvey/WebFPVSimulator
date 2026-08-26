import * as THREE from 'three';
import { PAL } from '../core/palette.js';
import { cel, flat } from '../core/toon.js';
import { bake, trs, rngKit } from '../core/util.js';
import { groundY, TERRAIN_DROP } from './street.js';
import { LEVEL, SHORE, lakeNear, inLakePoly, channelLine } from './lakeform.js';
import { lakeDepthAt, hillMats } from './hills.js';

/* ------------------------------------------------------------------ *
 * ひばり湖 -- the water.
 *
 * `lakeform.js` says where the lake is and `hills.js` builds the ground it sits
 * in.  This is the surface, the things standing in the shallows, and the four
 * animated layers that stop it being a painted floor.
 *
 * ------------------------------------------------------------------ *
 * THE SURFACE IS FIVE FLAT LAYERS AND A CONTOUR, NOT A SHADER
 *
 * The 用水路 gets away with one blue rectangle because it is 5 m wide, always in
 * the shade of its own revetment, and read from directly above.  None of that is
 * true here: this is ten thousand square metres read from a viewpoint twelve
 * metres up, against a pale sky, with a hundred metres of it in frame.  One flat
 * blue plane at that size is a hole in the picture -- and worse, the canal's tone
 * is *darker* than the sky it is meant to be reflecting.
 *
 * So the water is a stack, and every layer is generated from the **depth field**
 * rather than drawn:
 *
 *   `lakeWater`     the body, over the whole wetted area
 *   `lakeShallow`   0.06 to 0.85 m deep -- green, because that is silt seen
 *                   through water rather than water
 *   `lakeDeep`      over 1.75 m -- blue-violet, and it is the *shape* of this
 *                   band that says the basin has a middle
 *   `lakeSky`       hard-edged pale panels, the same stylisation the canal uses
 *   echoes          block reflections of the far rim and of the blossom on the
 *                   near bank, laid *toward* the viewer from the shore they
 *                   belong to, because that is which way a reflection points
 *
 * All of them come out of one function: **marching squares on a scalar field**.
 * `contourFill` meshes the region where `f > 0` over a grid, interpolating the
 * crossing on each cell edge, so a band is expressed as
 * `min(depth - 0.06, 0.85 - depth)` and the shoreline is
 * `min(depth, distanceInsideTheShoreline)`.  The alternative -- a rectangle
 * masked per cell -- gives a stair-stepped waterline, and on a lake the
 * waterline is the one line the eye actually reads.
 *
 * **Why the shoreline term is needed at all**: `depth` is `LEVEL - field`, and
 * `field` is -1.3 over the whole flat world, so "depth > 0" is true from here to
 * the poles.  Without the polygon the lake is the planet.
 *
 * ------------------------------------------------------------------ *
 * WHY THE ANIMATION IS RIGID GROUPS
 *
 * `canal.js` slides its train streak by writing `mesh.position.x` on a baked
 * mesh, which works there for a reason that does not generalise: the channel is
 * at x ≈ 0, where the flat frame and the world frame are within a couple of
 * centimetres of each other.  This lake is at x = 190, a fifth of the way round
 * the planet, where the local +x is nothing like the world +x -- so a baked mesh
 * translated along world X moves sideways *and downward through the surface*.
 *
 * Every moving thing here is therefore a `planetRigid` group with an inner group
 * under it, exactly as `CLAUDE.md` prescribes: the bake re-seats the outer one on
 * the sphere and leaves the inner one at the identity, and the animation drives
 * the inner one.  It costs one draw call per moving layer, and there are nine.
 * ------------------------------------------------------------------ */

/** The water surface, in the same relationship to the plane the hill mesh has. */
export const waterY = (z) => groundY(z) + LEVEL - TERRAIN_DROP;

/* `groundY` is a flat 1.05 for every latitude the lake covers, so one constant
 * serves -- but it is derived rather than written, because the day somebody moves
 * `Z_MIN` this is the line that would silently tilt the lake. */
const WY = waterY(-88);

/* The survey window.  2.0 m cells: the bake splits anything over 4 m and a 2 m
 * cell's diagonal is 2.83, so the water arrives as the ~5 600 triangles it was
 * authored as instead of being subdivided on the way to the sphere. */
const GX0 = 136, GX1 = 256, GZ0 = -142, GZ1 = -34, GSTEP = 2.0;

/**
 * Marching squares: mesh the region where `f > 0`.
 *
 * One cell at a time, walking its four corners in order and emitting the corner
 * if it is inside plus the interpolated crossing wherever the sign changes.  The
 * result is a convex polygon of three to six points, fan-triangulated.  It is
 * exact on the cell edges, which is all that matters: adjacent cells agree on
 * their shared crossing point, so the mesh is watertight and the boundary is a
 * genuine polyline rather than a staircase.
 */
function contourFill(f, y, step = GSTEP, x0 = GX0, x1 = GX1, z0 = GZ0, z1 = GZ1) {
  const out = [];
  const nx = Math.ceil((x1 - x0) / step);
  const nz = Math.ceil((z1 - z0) / step);
  const row = new Float32Array(nz + 1);
  const next = new Float32Array(nz + 1);
  for (let j = 0; j <= nz; j++) row[j] = f(x0, z0 + j * step);
  for (let i = 0; i < nx; i++) {
    const xa = x0 + i * step, xb = xa + step;
    for (let j = 0; j <= nz; j++) next[j] = f(xb, z0 + j * step);
    for (let j = 0; j < nz; j++) {
      const za = z0 + j * step, zb = za + step;
      const v = [row[j], next[j], next[j + 1], row[j + 1]];
      const p = [[xa, za], [xb, za], [xb, zb], [xa, zb]];
      if (v[0] <= 0 && v[1] <= 0 && v[2] <= 0 && v[3] <= 0) continue;
      const poly = [];
      for (let e = 0; e < 4; e++) {
        const a = e, b = (e + 1) % 4;
        if (v[a] > 0) poly.push(p[a]);
        if ((v[a] > 0) !== (v[b] > 0)) {
          const t = v[a] / (v[a] - v[b]);
          poly.push([p[a][0] + (p[b][0] - p[a][0]) * t, p[a][1] + (p[b][1] - p[a][1]) * t]);
        }
      }
      for (let k = 1; k + 1 < poly.length; k++) {
        // wound so the normal is up
        out.push(
          poly[0][0], y, poly[0][1],
          poly[k + 1][0], y, poly[k + 1][1],
          poly[k][0], y, poly[k][1]
        );
      }
    }
    row.set(next);
  }
  return out;
}

function surfaceMesh(ctx, list, mat, name, order) {
  if (!list.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(list, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat);
  m.userData.noOutline = true;
  m.name = name;
  if (order) m.renderOrder = order;
  ctx.add(m);
  return m;
}

/** Distance inside the shoreline: positive in the water, and −∞ far from it. */
function insideness(x, z) {
  const n = lakeNear(x, z);
  return n ? n.d : -99;
}

/* ------------------------------------------------------------------ *
 * The surface.
 * ------------------------------------------------------------------ */

function buildSurface(ctx) {
  /* The body.  `min(depth, insideness + 1.2)` -- the depth term draws the
   * waterline and the insideness term is what stops the "lake" being every
   * square metre of buried apron on the planet.  The +1.2 lets the depth term
   * win everywhere the two agree, which is everywhere except the spillway
   * chute, where the ground is below `LEVEL` and is emphatically not lake. */
  const body = contourFill((x, z) => Math.min(lakeDepthAt(x, z), insideness(x, z) + 1.2), WY);
  surfaceMesh(ctx, body, flat({
    color: PAL.lakeWater, transparent: true, opacity: 0.94, cache: false,
  }), 'lakeWater');

  /* The shallow margin.  Green rather than blue, and it is the layer that makes
   * the lake read as *clear*: what you see in the first three metres is silt
   * through water, not water. */
  const shallow = contourFill((x, z) => {
    const d = lakeDepthAt(x, z);
    return Math.min(d - 0.06, 0.85 - d, insideness(x, z) + 1.0);
  }, WY + 0.012);
  surfaceMesh(ctx, shallow, flat({
    color: PAL.lakeShallow, transparent: true, opacity: 0.7,
    depthWrite: false, cache: false,
  }), 'lakeShallow', 2);

  /* And the deep middle.  Its *shape* is the point: an irregular blue-violet area
   * two thirds of the way out says the basin has a floor that falls away, which
   * no amount of surface detail can. */
  const deep = contourFill((x, z) => Math.min(lakeDepthAt(x, z) - 1.75, insideness(x, z)), WY + 0.008);
  surfaceMesh(ctx, deep, flat({
    color: PAL.lakeDeep, transparent: true, opacity: 0.62,
    depthWrite: false, cache: false,
  }), 'lakeDeep', 1);
}

/* ------------------------------------------------------------------ *
 * Reflections: block colour, deliberately broken.
 * ------------------------------------------------------------------ */

/**
 * The echoes.
 *
 * Not a mirror -- a set of hard-edged blocks laid on the surface, which is what a
 * cel background does with water and is the same decision `canal.js` made for its
 * sky panels.  Two things make it read as reflection rather than as litter:
 *
 *   - **direction.**  A reflection lies along the line from the object to the
 *     viewer, so every block here is extruded from its own stretch of shore
 *     *toward the middle of the lake*, and its length is a function of how tall
 *     the thing being reflected is.  Blocks scattered at random read as scum.
 *   - **breaks.**  Each echo is three or four separate slabs with gaps, not one
 *     long one, because the surface is never still enough to carry an unbroken
 *     image and a continuous streak reads as ice.
 *
 * The far rim gets `lakeHillEcho`, a desaturated blue-green that is the rim's own
 * tone taken most of the way to the water's; the near bank's cherries get
 * `lakeBloomEcho`.  Nothing else is reflected, because at this scale two kinds of
 * echo is a language and four is noise.
 */
function buildEchoes(ctx, rng) {
  const CX = 190, CZ = -88;                       // the middle of the basin
  const hills = [];
  const bloom = [];
  const at = (list, x, z, ax, az, len, wide) => {
    const n = Math.hypot(ax, az) || 1;
    const ux = ax / n, uz = az / n;
    let run = 0;
    while (run < len) {
      const seg = rng.range(1.6, 4.4);
      const px = x + ux * (run + seg / 2), pz = z + uz * (run + seg / 2);
      if (lakeDepthAt(px, pz) > 0.12 && inLakePoly(px, pz)) {
        list.push({
          geometry: new THREE.PlaneGeometry(wide * rng.range(0.7, 1.15), seg),
          matrix: trs(px, 0, pz, -Math.PI / 2, Math.atan2(ux, uz), 0),
        });
      }
      run += seg + rng.range(0.5, 2.0);
    }
  };

  /* the far rim, from the north and east shores inward.  These are the stretches
   * the park, the 桟橋 and the cafe all look at. */
  for (const [x, z] of [
    [172, -41.4], [182, -40.2], [192, -39.6], [202, -39.8], [212, -40.6],
    [222, -43.4], [231, -48.4], [239, -55.0], [245, -63.0], [248, -72.0],
    [249, -82.0], [248, -92.0], [245, -102.0], [241, -112.0],
  ]) {
    at(hills, x, z, CX - x, CZ - z, rng.range(9, 19), rng.range(2.2, 5.0));
  }
  /* the peninsula, which is the one piece of far shore near enough to have a
   * legible reflection at all */
  for (const [x, z] of [[188, -104], [193, -100.4], [198, -104]]) {
    at(hills, x, z, x - 176, z + 96, rng.range(5, 9), rng.range(1.6, 3.0));
  }
  /* and the blossom on the near bank, north-east into the water */
  for (const [x, z] of [
    [143.4, -71.6], [142.4, -85.0], [147.0, -97.6], [161.0, -125.4],
    [173.6, -132.0], [204.4, -134.0], [215.6, -136.4], [228.0, -134.6],
  ]) {
    at(bloom, x, z, CX - x, CZ - z, rng.range(4, 8), rng.range(1.2, 2.6));
  }

  for (const [list, color, order, name] of [
    [hills, PAL.lakeHillEcho, 3, 'lakeEchoHill'],
    [bloom, PAL.lakeBloomEcho, 4, 'lakeEchoBloom'],
  ]) {
    if (!list.length) continue;
    const m = new THREE.Mesh(bake(list), flat({
      color, transparent: true, opacity: 0.5, depthWrite: false, cache: false,
    }));
    m.position.y = WY + 0.016 + order * 0.002;
    m.userData.noOutline = true;
    m.renderOrder = order;
    m.name = name;
    ctx.add(m);
  }

  /* Sky panels: long, pale, hard-edged, and *across* the reflections rather than
   * along them, so the two layers read as different things.  Same stylisation as
   * the channel's, three times the count because it is forty times the area.
   *
   * **Wider and fewer than the first pass, and the render is why.**  At 150 panels
   * of 2.2-7.0 x 0.22-0.6 they read, from the park at twenty metres, as *dashed
   * road markings* -- a hundred short pale ticks in rows, which together with the
   * glint bands looked like lane paint on the water.  A reflection of sky is a
   * broad soft area; at 0.5-1.5 m across and ninety of them it is one. */
  {
    const parts = [];
    for (let k = 0; k < 96; k++) {
      const x = rng.range(GX0 + 4, GX1 - 4);
      const z = rng.range(GZ0 + 4, GZ1 - 4);
      if (lakeDepthAt(x, z) < 0.3 || !inLakePoly(x, z)) continue;
      parts.push({
        geometry: new THREE.PlaneGeometry(rng.range(2.6, 8.0), rng.range(0.5, 1.5)),
        matrix: trs(x, 0, z, -Math.PI / 2, rng.range(-0.22, 0.22), 0),
      });
    }
    if (parts.length) {
      const m = new THREE.Mesh(bake(parts), flat({
        color: PAL.lakeSky, transparent: true, opacity: 0.72, depthWrite: false, cache: false,
      }));
      m.position.y = WY + 0.026;
      m.userData.noOutline = true;
      m.renderOrder = 5;
      m.name = 'lakeSkyBlocks';
      ctx.add(m);
    }
  }

  /* and the horizontal glint bands the brief asks for: very few, very pale, very
   * long.  Two per cent of the surface -- any more and this stops being a quiet
   * lake, which is the one thing the brief is explicit about. */
  {
    const parts = [];
    for (const [x, z, len] of [
      [166, -62, 26], [182, -74, 34], [196, -96, 30], [212, -66, 22], [226, -104, 18],
    ]) {
      for (let k = 0; k < 3; k++) {
        parts.push({
          geometry: new THREE.PlaneGeometry(len * rng.range(0.5, 1.0), rng.range(0.10, 0.22)),
          matrix: trs(x + rng.range(-4, 4), 0, z + rng.range(-2.6, 2.6),
            -Math.PI / 2, rng.range(-0.1, 0.1), 0),
        });
      }
    }
    const m = new THREE.Mesh(bake(parts), flat({
      color: PAL.lakeGlint, transparent: true, opacity: 0.66, depthWrite: false, cache: false,
    }));
    m.position.y = WY + 0.032;
    m.userData.noOutline = true;
    m.renderOrder = 6;
    m.name = 'lakeGlint';
    ctx.add(m);
  }
}

/* ------------------------------------------------------------------ *
 * The moving layers.
 * ------------------------------------------------------------------ */

/**
 * A rigid quad on the water whose *inner* group is animated.
 *
 * See the header: the bake folds a mesh's geometry into root space and clears its
 * transform, so writing `position` or `rotation` on it afterwards moves it about
 * the world origin rather than about itself.  A `planetRigid` group is re-seated
 * on the sphere with its rig intact and its children left at the identity, which
 * is the only way anything a fifth of the way round the planet can move.
 */
function rigidQuad(ctx, x, z, geo, mat, name) {
  const hub = new THREE.Group();
  hub.userData.planetRigid = true;
  hub.position.set(x, WY, z);
  hub.name = name;
  const pivot = new THREE.Group();
  hub.add(pivot);
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = -Math.PI / 2;
  m.userData.noOutline = true;
  m.renderOrder = 7;
  pivot.add(m);
  ctx.add(hub);
  return { hub, pivot, mesh: m, mat };
}

/**
 * Wind lanes and ripple rings -- the four things the brief asks the surface to do
 * that a static mesh cannot: 缓慢移动的简化波纹, 风吹过时轻微变化的亮面, and the
 * 圆形波纹 a水鳥 or a boat leaves.
 *
 * Deliberately slow.  A lake surface that moves at a speed the eye can follow is
 * a swimming pool; these are 0.5 to 1.1 m/s of drift and a ten-second ripple
 * cycle, which is under the threshold where you notice motion and over the one
 * where the water looks frozen.
 */
function buildMotion(ctx, rng) {
  const lanes = [];
  for (const [x, z, len, w, spd, dir] of [
    [176, -58, 30, 2.6, 0.62, 0.28],
    [196, -84, 38, 3.4, 0.48, -0.12],
    [212, -110, 26, 2.2, 0.74, 0.42],
  ]) {
    const q = rigidQuad(ctx, x, z,
      new THREE.PlaneGeometry(len, w),
      flat({ color: PAL.lakeGlint, transparent: true, opacity: 0.0, depthWrite: false, cache: false }),
      'lakeWindLane');
    lanes.push({ ...q, len, spd, dir, phase: rng.range(0, 6.28) });
  }

  const rings = [];
  for (const [x, z, per] of [
    [158, -74, 5.4], [170, -92, 7.2], [186, -66, 6.1],
    [200, -78, 8.4], [208, -122, 4.6], [232, -96, 9.0],
  ]) {
    const geo = new THREE.RingGeometry(0.72, 1.0, 18, 1);
    const q = rigidQuad(ctx, x, z, geo,
      flat({ color: PAL.lakeGlint, transparent: true, opacity: 0.0, depthWrite: false, cache: false }),
      'lakeRipple');
    rings.push({ ...q, per, phase: rng.range(0, 1) });
  }

  let t = 0;
  return (dt) => {
    t += dt;
    for (const l of lanes) {
      /* Drift *and* breathe.  A lane that only slides reads as an object moving
       * across the water; one that fades in and out at a different period reads
       * as a gust crossing it, which is what it is. */
      const u = ((t * l.spd) / (l.len * 2.2)) % 1;
      l.pivot.position.set((u - 0.5) * l.len * 2.2, 0, Math.sin(t * 0.11 + l.phase) * 1.4);
      l.pivot.rotation.y = l.dir;
      l.mat.opacity = 0.20 * Math.max(0, Math.sin(u * Math.PI)) * (0.6 + 0.4 * Math.sin(t * 0.23 + l.phase));
    }
    for (const r of rings) {
      const u = ((t / r.per) + r.phase) % 1;
      const s = 0.4 + u * 3.4;
      r.pivot.scale.set(s, 1, s);
      r.mat.opacity = 0.34 * (1 - u) * (1 - u);
    }
  };
}

/* ------------------------------------------------------------------ *
 * What stands in the shallows.
 * ------------------------------------------------------------------ */

const M = {};
function mats() {
  if (M.reed) return M;
  /* Lifted, and `bands: 'soft'` -- the high-key two-stop ramp.  A reed bed is read
   * against water that is *lighter* than the hillside, so a blade on the normal
   * three-band ramp puts its shadow side at 36 % and the bed goes to a dark fringe;
   * `soft` bottoms out at 70 % and keeps a blade legible all the way round, which
   * is what `flat: false` is here for as well. */
  M.reed = cel({ color: 0xa8c884, bands: 'soft', tint: 0x8a9cb0, flat: false });
  M.reedDeep = cel({ color: 0x8cae6c, bands: 'soft', tint: 0x8a9cb0, flat: false });
  M.reedHead = cel({ color: 0xd4c79a, bands: 'soft', tint: 0x9c93b8, flat: false });
  M.pad = cel({ color: 0x6f9a72, bands: 2, tint: 0x5b6f8c });
  M.padAlt = cel({ color: 0x84ab7c, bands: 2, tint: 0x5b6f8c });
  M.lily = cel({ color: 0xf4e4ea, bands: 'soft', tint: 0x9c93b8 });
  M.wood = cel({ color: 0x9a7f5e, bands: 3, tint: 0x5c5680 });
  M.woodDark = cel({ color: 0x6f5943, bands: 3, tint: 0x554d72 });
  M.drift = cel({ color: 0xb6ada0, bands: 3, tint: 0x7a7396 });
  M.duck = cel({ color: 0x6e6a62, bands: 3, tint: 0x6f6790 });
  M.duckPale = cel({ color: 0xe4dccc, bands: 3, tint: 0x8a83a8 });
  M.duckBill = cel({ color: PAL.yellowDeep, bands: 3, tint: 0x7a7396 });
  return M;
}

/**
 * 葦 -- the reeds, and they are the single most important thing standing in this
 * water.
 *
 * Two jobs.  They are the only object in the lake with a *known* size, so they
 * are what tells you the reed flat is thirty metres across rather than five --
 * the same argument `buildOutcrops` exists for on the hillside, one scale down.
 * And they are the barrier: the natural shore has no railing and no kerb, and two
 * metres of reed is a shore you cannot walk into -- and they are what makes
 * `SHORE_BARRIER` below read as vegetation rather than as an invisible wall.
 *
 * They carry no colliders of their own: 424 clumps is 424 boxes on a list
 * `_resolve` walks for every sub-step of every frame, for a job one ring of 130
 * does completely and the reeds only do on the four shallow stretches.
 *
 * Placed off `lakeDepthAt` rather than off the shoreline polygon, so they follow
 * the actual waterline into every bay: 0.02 to 0.55 m of water, which on the reed
 * flat's 1-in-10 bank is a band five metres wide and on the boat house's
 * revetment is nothing at all.
 */
function buildReeds(ctx, rng) {
  const m = mats();
  /* **0.055 and five sides, not 0.03 and four.**  The first pass came out as a
   * bundle of dark skewers, which is the exact failure `CLAUDE.md` records against
   * the channel's first reeds: at 0.03 m a blade is one facet wide, so it is either
   * edge-on (invisible) or turned from the sun (nearly black), and the whole bed
   * read as a scatter of dark spikes standing in pale water.  Nearly twice the
   * radius, an odd facet count so a blade is never exactly edge-on, and the tone
   * lifted -- see `mats()`. */
  const blade = new THREE.ConeGeometry(0.038, 1, 5, 1);
  blade.translate(0, 0.5, 0);
  const head = new THREE.ConeGeometry(0.06, 0.4, 5, 1);
  head.translate(0, 0.2, 0);
  const lists = [[], []];
  const heads = [];
  let clumps = 0;
  for (let k = 0; k < 9000 && clumps < 620; k++) {
    const x = rng.range(GX0, GX1);
    const z = rng.range(GZ0, GZ1);
    const d = lakeDepthAt(x, z);
    if (d < 0.02 || d > 0.55) continue;
    if (!inLakePoly(x, z)) continue;
    /* the reed beds are the *natural* shores: dense in the south-east flat and
     * the two bays, thinned right out in front of the park and the boat house,
     * which are revetted and mown */
    const near = lakeNear(x, z);
    const dense = near.bank < 0.2 ? 0.85 : near.bank < 0.3 ? 0.45 : 0.12;
    if (!rng.chance(dense)) continue;
    clumps++;
    /* Nine to sixteen blades in a 0.34 m radius, not five to eleven in 0.42: a
     * clump has to read as a *tuft* at ten metres, and at the first density the
     * blades were far enough apart to be read individually. */
    const n = rng.int(9, 16);
    const y = WY - d;
    for (let b = 0; b < n; b++) {
      const a = rng.range(0, 6.283);
      const rr = rng.range(0, 0.34);
      const px = x + Math.cos(a) * rr, pz = z + Math.sin(a) * rr;
      const hh = rng.range(1.45, 2.35);
      const lean = rng.range(0.06, 0.26);
      const la = rng.range(0, 6.283);
      lists[b % 2].push(trs(px, y, pz,
        lean * Math.sin(la), 0, -lean * Math.cos(la), 1, hh, 1));
      if (rng.chance(0.34)) {
        heads.push(trs(px + Math.sin(la) * lean * hh * 0.5, y + hh * 0.98,
          pz - Math.cos(la) * lean * hh * 0.5,
          lean * Math.sin(la), rng.range(0, 3), -lean * Math.cos(la)));
      }
    }
  }
  lists.forEach((list, i) => {
    if (!list.length) return;
    const inst = new THREE.InstancedMesh(blade, i ? m.reedDeep : m.reed, list.length);
    list.forEach((mx, k) => inst.setMatrixAt(k, mx));
    inst.castShadow = true;
    inst.name = 'lakeReed' + i;
    ctx.add(inst);
  });
  if (heads.length) {
    const inst = new THREE.InstancedMesh(head, m.reedHead, heads.length);
    heads.forEach((mx, k) => inst.setMatrixAt(k, mx));
    inst.name = 'lakeReedHead';
    ctx.add(inst);
  }
  return clumps;
}

/**
 * 睡蓮 -- lily pads, in the two sheltered bays only.
 *
 * Pads are discs *on* the surface and get `depthWrite: false` for the reason
 * every thin sheet in this world does -- the ink pass reads the depth buffer and
 * would outline each one into speckle.  The flowers are the only saturated thing
 * in the water and there are eleven of them.
 */
function buildLilies(ctx, rng) {
  const m = mats();
  const pad = new THREE.CircleGeometry(1, 9);
  pad.rotateX(-Math.PI / 2);
  const lists = [[], []];
  const flowers = [];
  /* the two bays: the north-east one behind the peninsula, and the sheltered
   * pocket between the peninsula's west side and the cafe's shore */
  for (const [cx, cz, rad, n] of [[218, -50, 13, 46], [184, -118, 11, 38], [206, -128, 12, 34]]) {
    for (let k = 0; k < n * 6; k++) {
      const a = rng.range(0, 6.283), rr = Math.sqrt(rng.next()) * rad;
      const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
      const d = lakeDepthAt(x, z);
      if (d < 0.22 || d > 1.15 || !inLakePoly(x, z)) continue;
      const r = rng.range(0.26, 0.52);
      lists[k % 2].push(trs(x, WY + 0.018, z, 0, rng.range(0, 3), 0, r, 1, r * rng.range(0.82, 1.0)));
      if (rng.chance(0.045)) flowers.push([x, z]);
    }
  }
  lists.forEach((list, i) => {
    if (!list.length) return;
    const inst = new THREE.InstancedMesh(pad, flat({
      color: i ? 0x84ab7c : 0x6f9a72, transparent: true, opacity: 0.95,
      depthWrite: false, cache: false,
    }), list.length);
    list.forEach((mx, k) => inst.setMatrixAt(k, mx));
    inst.userData.noOutline = true;
    inst.renderOrder = 8;
    inst.name = 'lakeLily' + i;
    ctx.add(inst);
  });
  const parts = [];
  for (const [x, z] of flowers) {
    parts.push({ geometry: new THREE.ConeGeometry(0.075, 0.13, 6, 1), matrix: trs(x, WY + 0.09, z) });
    parts.push({ geometry: new THREE.SphereGeometry(0.055, 6, 4), matrix: trs(x, WY + 0.15, z) });
  }
  if (parts.length) {
    const f = new THREE.Mesh(bake(parts), m.lily);
    f.castShadow = true;
    f.name = 'lakeLilyFlower';
    ctx.add(f);
  }
  return flowers.length;
}

/**
 * 水鳥 -- and the count is the whole design.
 *
 * Four.  The brief says "水鸟数量要少，以环境点缀为主", and it is right for a
 * reason this project already knows: a prop under 0.3 m reads as a dot (the crows
 * on the wires), so a bird on water has to be big enough to carry a silhouette
 * and there is no such thing as a distant flock.  These are 0.42 m long with the
 * three features that make a duck a duck at fifteen metres -- the body's
 * waterline wedge, the neck held up clear of it, and the bill -- plus a wake, and
 * the wake is doing half the work.
 *
 * Not animated.  Everything else on this surface moves slowly and continuously;
 * four birds tracking across the lake would be the loudest thing in every frame,
 * and a bird that moves is a bird you watch instead of the water.
 */
function buildBirds(ctx, rng) {
  const m = mats();
  const body = [];
  const pale = [];
  const bill = [];
  const wake = [];
  for (const [x, z, ry, kind] of [
    [163.0, -70.0, 0.9, 0], [166.4, -73.2, 1.7, 1],
    [204.0, -120.0, -2.1, 0], [227.0, -58.0, 2.6, 1],
  ]) {
    const d = lakeDepthAt(x, z);
    if (d < 0.15) continue;
    const y = WY - 0.055;
    const c = Math.cos(ry), s = Math.sin(ry);
    // the hull: a wedge sitting on the waterline, tail up
    body.push({
      geometry: new THREE.SphereGeometry(0.155, 7, 5),
      matrix: trs(x, y + 0.06, z, 0, ry, 0, 1.32, 0.78, 1.0),
    });
    body.push({
      geometry: new THREE.ConeGeometry(0.085, 0.24, 5, 1),
      matrix: trs(x - c * 0.21, y + 0.13, z + s * 0.21, 0, ry, -0.9 - (kind ? 0.1 : 0)),
    });
    // the neck, held clear of the body -- this is what makes it read
    body.push({
      geometry: new THREE.CylinderGeometry(0.036, 0.05, 0.2, 6),
      matrix: trs(x + c * 0.13, y + 0.19, z - s * 0.13, 0, ry, -0.2),
    });
    (kind ? pale : body).push({
      geometry: new THREE.SphereGeometry(0.062, 7, 5),
      matrix: trs(x + c * 0.155, y + 0.3, z - s * 0.155),
    });
    bill.push({
      geometry: new THREE.BoxGeometry(0.085, 0.024, 0.038),
      matrix: trs(x + c * 0.215, y + 0.285, z - s * 0.215, 0, ry, 0),
    });
    /* The wake: two slabs trailing behind, widening.  A duck with no wake is a
     * duck-shaped object placed on a blue floor. */
    for (let k = 0; k < 3; k++) {
      const off = 0.5 + k * 0.9;
      wake.push({
        geometry: new THREE.PlaneGeometry(0.7 + k * 0.55, 0.07),
        matrix: trs(x - c * off, 0, z + s * off, -Math.PI / 2, ry + Math.PI / 2, 0),
      });
    }
  }
  if (!body.length) return 0;
  const bm = new THREE.Mesh(bake(body), m.duck);
  bm.castShadow = true;
  bm.name = 'lakeBird';
  ctx.add(bm);
  if (pale.length) {
    const pm = new THREE.Mesh(bake(pale), m.duckPale);
    pm.castShadow = true;
    ctx.add(pm);
  }
  const blm = new THREE.Mesh(bake(bill), m.duckBill);
  ctx.add(blm);
  const wm = new THREE.Mesh(bake(wake), flat({
    color: PAL.lakeGlint, transparent: true, opacity: 0.42, depthWrite: false, cache: false,
  }));
  wm.position.y = WY + 0.03;
  wm.userData.noOutline = true;
  wm.renderOrder = 7;
  ctx.add(wm);
  return 4;
}

/**
 * 流木 ・ 杭 ・ 石 -- driftwood, old posts and stones at the waterline.
 *
 * The cheapest possible way to say a water level moves: a post whose bottom
 * 0.3 m is a different colour, a log lying half in, and a few stones the ink pass
 * can draw a line round.  All of them seated off `lakeDepthAt`, so they sit *in*
 * the water at the depth they are placed at rather than on a nominal shore.
 */
function buildFlotsam(ctx, rng) {
  const m = mats();
  const wood = [];
  const dark = [];
  const stone = [];
  /* the old fence line out into the reed flat -- a row of posts nobody has taken
   * out, which is the most recognisable single object at a Japanese ため池 */
  for (let k = 0; k < 9; k++) {
    const t = k / 8;
    const x = 206 + t * 18, z = -138.6 + t * 3.4;
    const d = lakeDepthAt(x, z);
    if (d < -0.2) continue;
    const h = rng.range(0.9, 1.45);
    const y = WY - Math.max(0, d);
    wood.push({
      geometry: new THREE.CylinderGeometry(0.062, 0.075, h, 6),
      matrix: trs(x, y + h / 2, z, rng.range(-0.05, 0.05), 0, rng.range(-0.09, 0.09)),
    });
    dark.push({
      geometry: new THREE.CylinderGeometry(0.078, 0.09, 0.3, 6),
      matrix: trs(x, y + Math.max(0, d) * 0.5, z),
    });
  }
  // driftwood, half in the water, on the two natural shores
  for (const [x, z, len, ry] of [
    [162.4, -128.0, 2.4, 0.7], [196.0, -140.0, 3.1, -0.4],
    [232.0, -136.0, 1.9, 1.2], [250.0, -104.0, 2.6, 0.2], [244.0, -118.0, 2.1, -1.0],
  ]) {
    const d = Math.max(0, lakeDepthAt(x, z));
    wood.push({
      geometry: new THREE.CylinderGeometry(0.11, 0.15, len, 6),
      matrix: trs(x, WY - d + 0.09, z, Math.PI / 2, ry, 0.04),
    });
    for (let k = 0; k < 2; k++) {
      wood.push({
        geometry: new THREE.CylinderGeometry(0.03, 0.055, rng.range(0.3, 0.6), 5),
        matrix: trs(x + Math.sin(ry) * rng.range(-0.7, 0.7), WY - d + 0.2,
          z + Math.cos(ry) * rng.range(-0.7, 0.7), rng.range(0.3, 1.1), rng.range(0, 3), 0),
      });
    }
  }
  // stones, biased to the two revetted shores where they are riprap
  for (let k = 0; k < 260; k++) {
    const x = rng.range(GX0, GX1), z = rng.range(GZ0, GZ1);
    const d = lakeDepthAt(x, z);
    if (d < -0.55 || d > 0.3) continue;
    const near = lakeNear(x, z);
    if (!near || !rng.chance(near.bank > 0.3 ? 0.55 : 0.2)) continue;
    const r = rng.range(0.16, 0.42);
    stone.push({
      geometry: new THREE.DodecahedronGeometry(r, 0),
      matrix: trs(x, WY - Math.max(0, d) + r * 0.36, z,
        rng.range(-0.3, 0.3), rng.range(0, 3), rng.range(-0.3, 0.3), 1, rng.range(0.5, 0.8), 1),
    });
  }
  const add = (list, mat, name) => {
    if (!list.length) return;
    const mesh = new THREE.Mesh(bake(list), mat);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.name = name;
    ctx.add(mesh);
  };
  add(wood, m.wood, 'lakeFlotsamWood');
  add(dark, m.woodDark, 'lakeFlotsamWet');
  add(stone, hillMats().rock, 'lakeStones');
}

/** Blossom riding the surface, exactly as the channel does it. */
function buildPetals(ctx, rng) {
  const N = 620;
  const geo = new THREE.PlaneGeometry(0.17, 0.13);
  geo.rotateX(-Math.PI / 2);
  const list = [];
  for (let k = 0; k < N * 4 && list.length < N; k++) {
    const x = rng.range(GX0, GX1), z = rng.range(GZ0, GZ1);
    const d = lakeDepthAt(x, z);
    if (d < 0.05 || !inLakePoly(x, z)) continue;
    /* Petals collect where the wind puts them: against the lee shore and in the
     * corners, not spread evenly.  A uniform scatter over ten thousand square
     * metres reads as dust. */
    if (!rng.chance(d < 0.9 ? 0.8 : 0.14)) continue;
    const s = rng.range(0.8, 1.5);
    list.push(trs(x, WY + 0.022, z, 0, rng.range(0, 6.28), 0, s, 1, s));
  }
  const inst = new THREE.InstancedMesh(geo, flat({
    color: PAL.waterPetal, transparent: true, opacity: 0.9, depthWrite: false, cache: false,
  }), list.length);
  list.forEach((mx, k) => inst.setMatrixAt(k, mx));
  inst.userData.noOutline = true;
  inst.renderOrder = 9;
  inst.name = 'lakePetals';
  ctx.add(inst);
  return list.length;
}

/* ------------------------------------------------------------------ *
 * The one thing that keeps the player out of the water.
 * ------------------------------------------------------------------ */

/**
 * Where the barrier is broken, because these are the places you are *meant* to
 * reach the water.  `kohan.js` builds a structure at every one of them and reads
 * the same coordinates, so a gap cannot end up somewhere there is nothing to
 * walk onto.
 */
export const SHORE_GAPS = [
  { x: 142.2, z: -80.0, r: 3.4, what: '見晴らし桟橋' },
  { x: 146.4, z: -101.0, r: 4.2, what: '浮桟橋 -- the boat station' },
  { x: 214.0, z: -139.4, r: 4.0, what: 'the reed-bay boardwalk' },
  { x: 251.4, z: -92.4, r: 3.0, what: "水神様's stone steps" },
];

/**
 * **The shore barrier, and it is the one piece of this district that is honestly
 * a compromise.**
 *
 * The player walks `hillAt`, and inside the lake `hillAt` is the *bed* -- 0.8 to
 * 2.6 m of field -- so without something in the way you walk straight out into
 * the middle, at which point the water plane is at your knees, the camera is
 * above it, and single-sided `flat()` materials mean the surface you are standing
 * in is invisible from below.  There are three honest fixes and this project has
 * already used all three somewhere: a `ctx.cut` bowl (which cannot express a
 * curved floor, and puts you standing *in* the water, which looks worse), a
 * railing everywhere (which is what the 用水路 does, and is wrong for a natural
 * shore), or a barrier.
 *
 * So: a barrier, but placed and justified so that it is never the thing you
 * notice.  It runs 0.6 m *inside* the waterline, so with the player's own 0.34 m
 * radius you can stand a quarter of a metre from the edge -- close enough to look
 * straight down into the shallows.  It is broken at all four places there is
 * something to step onto.  And on every stretch that has no railing it stands
 * inside two metres of reed, which is why `buildReeds` runs first.
 *
 * 130 boxes at 3.4 m centres, against ~1 500 already in the world.
 */
function buildBarrier(ctx) {
  let n = 0;
  for (let i = 0; i < SHORE.length; i++) {
    const a = SHORE[i], b = SHORE[(i + 1) % SHORE.length];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.max(1, Math.round(len / 3.4));
    for (let k = 0; k < steps; k++) {
      const t = (k + 0.5) / steps;
      const px = a.x + (b.x - a.x) * t, pz = a.z + (b.z - a.z) * t;
      // inward normal: whichever of the two points into the water
      let nx = (b.z - a.z) / len, nz = -(b.x - a.x) / len;
      if (!inLakePoly(px + nx * 0.8, pz + nz * 0.8)) { nx = -nx; nz = -nz; }
      const cx = px + nx * 0.6, cz = pz + nz * 0.6;
      if (SHORE_GAPS.some((g) => Math.hypot(cx - g.x, cz - g.z) < g.r)) continue;
      const half = (len / steps) / 2 + 0.35;
      const ax = Math.abs(nx) > Math.abs(nz);
      ctx.collide(
        cx - (ax ? 0.5 : half), cz - (ax ? half : 0.5),
        cx + (ax ? 0.5 : half), cz + (ax ? half : 0.5),
        WY + 0.95
      );
      n++;
    }
  }
  return n;
}

/* ------------------------------------------------------------------ *
 * The outfall stream: the one place water is actually moving.
 * ------------------------------------------------------------------ */

/**
 * 放水路 -- the channel from the 底樋 at the foot of the embankment down to the
 * 用水路's east headwall.
 *
 * A ribbon of water swept along the channel's own centreline at its own inverts,
 * 0.6 m wide and 0.1 m deep, with a lighter streak down the middle.  It is the
 * only moving water in the world outside the onsen street's channel, and it
 * matters out of all proportion to its size: it is what makes the lake a *source*
 * rather than a pond, and it is the physical link between this district and the
 * one at the level crossing four hundred metres away.
 *
 * The 余水吐 above it is deliberately dry -- see the note in `lakeform.js`.
 */
function buildOutfall(ctx) {
  const { pts } = channelLine('outfall', 1.6);
  const water = [];
  const streak = [];
  for (let k = 0; k < pts.length - 1; k++) {
    const a = pts[k], b = pts[k + 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 0.05) continue;
    const ry = Math.atan2(b[0] - a[0], b[1] - a[1]);
    const cy = groundY((a[1] + b[1]) / 2) + (a[2] + b[2]) / 2 + 0.10;
    water.push({
      geometry: new THREE.PlaneGeometry(0.62, len + 0.1),
      matrix: trs((a[0] + b[0]) / 2, cy, (a[1] + b[1]) / 2, -Math.PI / 2, ry, 0),
    });
    streak.push({
      geometry: new THREE.PlaneGeometry(0.16, len + 0.1),
      matrix: trs((a[0] + b[0]) / 2, cy + 0.006, (a[1] + b[1]) / 2, -Math.PI / 2, ry, 0),
    });
  }
  const w = new THREE.Mesh(bake(water), flat({
    color: PAL.lakeWater, transparent: true, opacity: 0.9, depthWrite: false, cache: false,
  }));
  w.userData.noOutline = true;
  w.renderOrder = 2;
  w.name = 'outfallWater';
  ctx.add(w);
  const s = new THREE.Mesh(bake(streak), flat({
    color: PAL.lakeGlint, transparent: true, opacity: 0.5, depthWrite: false, cache: false,
  }));
  s.userData.noOutline = true;
  s.renderOrder = 3;
  ctx.add(s);
}

/* ------------------------------------------------------------------ *
 * Builder.
 * ------------------------------------------------------------------ */

export function buildLake(ctx) {
  const rng = rngKit(70211);
  buildSurface(ctx);
  buildEchoes(ctx, rng);
  const update = buildMotion(ctx, rng);
  const reeds = buildReeds(ctx, rng);
  const lilies = buildLilies(ctx, rng);
  const birds = buildBirds(ctx, rng);
  buildFlotsam(ctx, rng);
  /* Surface blossom is off. A freestyle line over the lake does not want
   * 620 cards on the water. */
  const petals = 0;
  buildOutfall(ctx);
  /* Last, so its 130 boxes land at the end of a list that already has the reeds
   * standing in front of them. */
  const barrier = buildBarrier(ctx);
  return { update, stats: { reeds, lilies, birds, petals, barrier } };
}
