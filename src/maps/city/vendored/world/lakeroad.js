import * as THREE from 'three';
import { PAL } from '../core/palette.js';
import { cel, flat } from '../core/toon.js';
import {
  lakePlate, lakeSign, lakeNotice, lakeMap, lakePanel, damPlate,
  warningPlate, roadSignTex, gaugeBoard,
} from '../core/textures.js';
import { box, cyl, bake, trs, rngKit, shadowify } from '../core/util.js';
import { hullOutline } from '../core/outline.js';
import { groundY } from './street.js';
import { pad, steps, railing, wallRun, groundMats, dapple } from './ground.js';
import {
  makeBench, makeSignPost, makeNoticeBoard, makeGuardrail, makeCone, makeMirror,
  makeStorageShed, makeGuideBoard, makeCrates, makeMilkCrate, makeBucket,
} from './props.js';
import { makeDelineator } from './vehicles.js';
import {
  ROUTES, SITES, hillMeshY, hillMats, hillPath, trailSegs, lakeDepthAt,
} from './hills.js';
import { LEVEL, DAMS, damPoint, channelLine } from './lakeform.js';
import { waterY } from './lake.js';

/* ------------------------------------------------------------------ *
 * ひばり湖 -- the road, the embankment and the way over the hill.
 *
 * The civil half of the lake district.  `kohan.js` builds the places people go;
 * this builds the three things that make them reachable and the one that makes
 * the lake a reservoir rather than a pond.
 *
 * ------------------------------------------------------------------ *
 * WHY THE ROAD MATTERS MORE THAN IT LOOKS
 *
 * A lake nothing can drive to has no cafe, no boats, no campsite and no bins --
 * everything in the brief for this district arrives on wheels.  And there is
 * exactly one way in: the east shoulder is 9 to 12 m high over the whole band
 * z -50..-120, so a road crossing it anywhere south of the railway is a 1-in-3
 * ramp.  At z = -30 it is 3.1 m, because that is where the drainage channel's own
 * corridor holds the ground flat -- and the 用水路's east 暗渠 headwall stands at
 * (106, -24), fifteen metres from where the road leaves.
 *
 * So 湖畔道路 runs *up the outfall valley*: it leaves the top of the school's
 * outer road, follows the 放水路 east for fifty metres, and climbs onto the
 * embankment's crest.  Which means the road to the lake and the channel from it
 * are the same corridor, and the water in the ditch beside you on the way up is
 * the water in the lake at the top.  Nothing in the code depends on that.  It is
 * the reason the district feels attached to the town.
 *
 * ------------------------------------------------------------------ *
 * THE SURFACE IS `hillPath`, NOT `lane`
 *
 * `ground.js`'s `lane()` is a box or a `makeStrip` sweep at `groundY(z)` -- a
 * function of latitude only.  This road climbs 6.3 m and crosses a heightfield,
 * so its surface has to *be* the field, which is what `hillPath` sweeps: a ribbon
 * resampled every metre with a skirt down each side, following `hillMeshY`.  The
 * bench pass in `hills.js` has already graded the ground under it to the profile
 * in `ROUTES.lakeRoad`, so the two agree by construction rather than by tuning.
 *
 * Nothing here registers a `ctx.platform`.  On a hill the height query *is* the
 * ground -- see the long note in `hills.js` -- and a platform is an axis-aligned
 * box that cannot express a slope.
 * ------------------------------------------------------------------ */

const M = {};
function mats() {
  if (M.timber) return M;
  M.timber = cel({ color: 0x9a7f5e, bands: 3, tint: 0x5c5680 });
  M.timberDark = cel({ color: 0x6f5943, bands: 3, tint: 0x554d72 });
  M.log = cel({ color: 0x8a7050, bands: 3, tint: 0x5c5680 });
  M.metal = cel({ color: PAL.metal, bands: 3, tint: 0x666090 });
  M.metalDark = cel({ color: PAL.metalDark, bands: 3, tint: 0x5c5680 });
  M.concrete = cel({ color: PAL.concrete, bands: 3, tint: 0x6f6790 });
  M.concreteMid = cel({ color: PAL.concreteMid, bands: 3, tint: 0x6a6288 });
  M.concreteDark = cel({ color: PAL.concreteDark, bands: 3, tint: 0x655d84 });
  M.asphalt = cel({ color: PAL.roadWorn, bands: 3, tint: 0x6a608f });
  M.white = cel({ color: PAL.lineWhite, bands: 2, tint: 0x8e86ad });
  M.yellow = cel({ color: PAL.lineYellow, bands: 2, tint: 0x8e86ad });
  M.rock = cel({ color: PAL.hillRock, bands: 3, tint: 0x6f6790 });
  M.stone = cel({ color: PAL.stone, bands: 3, tint: 0x655d80 });
  M.stoneDark = cel({ color: PAL.stoneDark, bands: 3, tint: 0x605878 });
  M.rope = cel({ color: PAL.rope, bands: 3, tint: 0x8a83a8 });
  M.torii = cel({ color: PAL.torii, bands: 3, tint: 0x7a4a60 });
  return M;
}

/* ------------------------------------------------------------------ *
 * Shared helpers -- `kohan.js` imports these rather than repeating them.
 * ------------------------------------------------------------------ */

/**
 * A painted line laid *on the hill*, swept along a polyline.
 *
 * `laneLine` in `ground.js` is a box at a fixed y, which on a 6 m climb floats at
 * one end and is buried at the other.  This resamples at a metre and lifts each
 * quad off `hillMeshY`, which is the same thing `hillPath` does one layer down.
 */
export function hillLine(ctx, pts, o = {}) {
  const w = (o.w ?? 0.11) / 2;
  const dash = o.dash ?? 0;
  const off = o.off ?? 0;
  const parts = [];
  let run = 0;
  for (let s = 0; s < pts.length - 1; s++) {
    const [ax, az] = pts[s];
    const [bx, bz] = pts[s + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / 1.1));
    const nx = -(bz - az) / len, nz = (bx - ax) / len;
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n;
      run += len / n;
      if (dash && Math.floor(run / dash) % 2 === 1) continue;
      const p0 = [ax + (bx - ax) * t0 + nx * off, az + (bz - az) * t0 + nz * off];
      const p1 = [ax + (bx - ax) * t1 + nx * off, az + (bz - az) * t1 + nz * off];
      const mid = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
      const seg = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
      parts.push({
        geometry: new THREE.PlaneGeometry(w * 2, seg + 0.04),
        matrix: trs(mid[0], hillMeshY(mid[0], mid[1]) + 0.03, mid[1],
          -Math.PI / 2, Math.atan2(p1[0] - p0[0], p1[1] - p0[1]), 0),
      });
    }
  }
  if (!parts.length) return null;
  const m = new THREE.Mesh(bake(parts), o.mat ?? mats().white);
  m.userData.noOutline = true;
  m.renderOrder = 1;
  m.name = o.name ?? 'hillLine';
  ctx.add(m);
  return m;
}

/**
 * A railing or guard fence that follows the ground along a polyline.
 *
 * Each span is drawn between two *sampled* points, so it steps down a slope
 * instead of floating at one end -- the same construction `urayama.js`'s trail
 * rail uses and for the same reason the tunnel's crest fence is in five pieces.
 *
 * One collider per span, and the top clears the ground by the full height: a
 * barrier whose top is within `STEP` of the feet is skipped outright by
 * `_resolve`, which is the trap that left the 用水路 guarded by nothing but its
 * handrail for twelve years.
 */
export function groundRail(ctx, pts, o = {}) {
  const m = mats();
  const h = o.h ?? 1.05;
  const spacing = o.spacing ?? 1.9;
  const yAt = o.yAt ?? hillMeshY;
  const parts = [];
  const line = [];
  for (let s = 0; s < pts.length - 1; s++) {
    const [ax, az] = pts[s];
    const [bx, bz] = pts[s + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / spacing));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      line.push([ax + (bx - ax) * t, az + (bz - az) * t]);
    }
  }
  line.push(pts[pts.length - 1]);
  for (let k = 0; k < line.length; k++) {
    const [px, pz] = line[k];
    const y = yAt(px, pz);
    parts.push({
      geometry: new THREE.CylinderGeometry(0.045, 0.055, h + 0.3, o.round === false ? 4 : 7),
      matrix: trs(px, y + (h + 0.3) / 2 - 0.3, pz),
    });
    if (o.collide !== false) {
      ctx.collide(px - 0.06, pz - 0.06, px + 0.06, pz + 0.06, y + h, y, true);
    }
    if (k === line.length - 1) break;
    const [qx, qz] = line[k + 1];
    const qy = yAt(qx, qz);
    const dx = qx - px, dz = qz - pz, dy = qy - y;
    const L = Math.hypot(dx, dy, dz);
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx, dy, dz).normalize());
    for (const hy of o.rails ?? [h - 0.03, h * 0.52]) {
      parts.push({
        geometry: new THREE.CylinderGeometry(0.04, 0.04, L, 6),
        matrix: new THREE.Matrix4().compose(
          new THREE.Vector3((px + qx) / 2, (y + qy) / 2 + hy, (pz + qz) / 2),
          q, new THREE.Vector3(1, 1, 1)),
      });
      if (o.collide !== false) {
        const span = Math.hypot(dx, dz);
        const n = Math.max(1, Math.ceil(span / 0.16));
        for (let s = 0; s < n; s++) {
          const t0 = s / n;
          const t1 = (s + 1) / n;
          const ax = px + dx * t0, az = pz + dz * t0;
          const bx = px + dx * t1, bz = pz + dz * t1;
          const ySeg = y + dy * ((t0 + t1) / 2);
          ctx.collide(Math.min(ax, bx) - 0.06, Math.min(az, bz) - 0.06,
            Math.max(ax, bx) + 0.06, Math.max(az, bz) + 0.06,
            ySeg + hy + 0.05, ySeg + hy - 0.05, true);
        }
      }
    }
  }
  const mesh = new THREE.Mesh(bake(parts), o.mat ?? m.white);
  mesh.castShadow = true;
  mesh.name = 'openFrame';
  ctx.add(mesh);
  return mesh;
}

/**
 * 丸太階段 -- half-round logs pinned across a path, earth between them.
 *
 * The only way to draw a stair on this ground: `ctx.platform` is an axis-aligned
 * box and cannot express a diagonal tread, so these are decoration over ground
 * the player already walks.  Which is exactly what they are on a real path.
 */
export function logSteps(ctx, a, b, o = {}) {
  const m = mats();
  const w = o.w ?? 1.5;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.max(2, Math.round(len / (o.pitch ?? 0.62)));
  const tx = (b[0] - a[0]) / len, tz = (b[1] - a[1]) / len;
  const parts = [];
  const pin = [];
  for (let k = 1; k < n; k++) {
    const t = k / n;
    const px = a[0] + (b[0] - a[0]) * t;
    const pz = a[1] + (b[1] - a[1]) * t;
    const y = hillMeshY(px, pz);
    const ry = Math.atan2(tx, tz);
    parts.push({
      geometry: new THREE.CylinderGeometry(0.1, 0.105, w, 7, 1, false, 0, Math.PI),
      matrix: trs(px, y + 0.03, pz, Math.PI / 2, ry, 0),
    });
    for (const s of [-1, 1]) {
      pin.push({
        geometry: new THREE.CylinderGeometry(0.038, 0.032, 0.4, 5),
        matrix: trs(px - tz * s * (w / 2 - 0.12), y - 0.05, pz + tx * s * (w / 2 - 0.12)),
      });
    }
  }
  const lm = new THREE.Mesh(bake(parts), m.log);
  lm.castShadow = lm.receiveShadow = true;
  ctx.add(lm);
  ctx.add(new THREE.Mesh(bake(pin), m.timberDark));
}

/** A fingerpost with one or two plates, seated on the hill. */
export function finger(ctx, x, z, ry, plates, o = {}) {
  const m = mats();
  const y = (o.yAt ?? hillMeshY)(x, z);
  ctx.add(makeSignPost({
    x, z, y, ry, h: o.h ?? 2.25, postMat: o.mat ?? m.timber,
    plates: plates.map((p, i) => ({
      map: typeof p === 'number' ? lakeSign(p) : p,
      w: 1.05, h: 0.26, y: (o.h ?? 2.25) - 0.3 - i * 0.34, double: true,
    })),
  }));
  ctx.collide(x - 0.16, z - 0.16, x + 0.16, z + 0.16, y + (o.h ?? 2.25));
}

/* ------------------------------------------------------------------ *
 * 湖畔道路.
 * ------------------------------------------------------------------ */

/** Concatenate the three road routes into one polyline. */
function roadLine() {
  const a = ROUTES.lakeRoad.pts.map((p) => [p[0], p[1]]);
  const b = ROUTES.damRoad.pts.map((p) => [p[0], p[1]]).slice(1);
  const c = ROUTES.shoreRoad.pts.map((p) => [p[0], p[1]]);
  return { climb: a, crest: b, shore: c };
}

function buildRoad(ctx, rng, out) {
  const m = mats();
  const gm = groundMats();
  const R = roadLine();

  /* --- the three surfaces.  4.0 m: a 農道 that serves a reservoir, a cafe and a
   * campsite, and nothing else.  The shore leg is 3.6, because past the boat
   * house it is a lane rather than a road and the narrowing is the point. --- */
  const climb = hillPath(ctx, {
    pts: R.climb.concat(R.crest), w: 4.0, lift: 0.05, drop: 0.42, step: 1.0,
    mat: m.asphalt, edgeMat: gm.gravel, name: 'lakeRoadClimb',
  });
  const shore = hillPath(ctx, {
    pts: R.shore, w: 3.6, lift: 0.05, drop: 0.40, step: 1.0,
    mat: m.asphalt, edgeMat: gm.gravel, name: 'lakeRoadShore',
  });

  /* --- markings.  White edge lines both sides the whole way, and a broken yellow
   * centre line only on the climb, which is the stretch with the bends and the
   * only one where anything would meet anything. --- */
  for (const [pts, w] of [[R.climb.concat(R.crest), 4.0], [R.shore, 3.6]]) {
    for (const s of [-1, 1]) {
      hillLine(ctx, pts, { off: s * (w / 2 - 0.28), w: 0.11, name: 'lakeEdgeLine' });
    }
  }
  hillLine(ctx, R.climb.slice(4).concat(R.crest), {
    off: 0, w: 0.13, dash: 2.4, mat: m.yellow, name: 'lakeCentreLine',
  });

  /* --- the cutting.  The road is in 1.5 to 2 m of cut from x 118 to 136, which
   * is where the shoulder's own gradient is 0.48 -- so the bank above it gets a
   * retaining kerb, a channel and a rockfall sign, and the drop below it gets
   * guardrail.  Both are what a 林道 has and neither is decoration. --- */
  {
    const kerb = [];
    for (let k = 0; k < 22; k++) {
      const t = k / 21;
      const x = 116 + t * 22;
      const z = -31.4 - t * 0.6 + 3.1;      // the uphill (north) side
      const y = hillMeshY(x, z);
      kerb.push({
        geometry: new THREE.BoxGeometry(1.1, 0.55, 0.34),
        matrix: trs(x, y + 0.16, z, 0, 0.06, 0),
      });
    }
    const km = new THREE.Mesh(bake(kerb), m.concreteMid);
    km.castShadow = km.receiveShadow = true;
    km.name = 'lakeRoadKerb';
    ctx.add(km);
    // the channel at its foot -- a run of open concrete U-section
    const ch = [];
    for (let k = 0; k < 30; k++) {
      const t = k / 29;
      const x = 116 + t * 22;
      const z = -31.4 - t * 0.6 + 2.6;
      const y = hillMeshY(x, z);
      ch.push({ geometry: new THREE.BoxGeometry(0.78, 0.2, 0.42), matrix: trs(x, y + 0.02, z) });
      ch.push({ geometry: new THREE.BoxGeometry(0.78, 0.26, 0.09), matrix: trs(x, y + 0.1, z - 0.2) });
      ch.push({ geometry: new THREE.BoxGeometry(0.78, 0.26, 0.09), matrix: trs(x, y + 0.1, z + 0.2) });
    }
    const cm = new THREE.Mesh(bake(ch), m.concrete);
    cm.receiveShadow = true;
    ctx.add(cm);
  }

  /* --- guardrail on the outside of the two bends, and on the whole crest --- */
  groundRail(ctx, [[112, -33.4], [120, -33.2], [130, -33.8], [139, -34.8]],
    { h: 0.82, spacing: 2.2, mat: m.metal, name: 'lakeRoadGuard' });
  groundRail(ctx, [[132.4, -66.0], [131.0, -73.0], [131.0, -80.0], [132.6, -87.0]],
    { h: 0.82, spacing: 2.2, mat: m.metal, name: 'lakeRoadGuardW' });

  /* --- signage.  A 急カーブ diamond and a 落石注意 at the cutting, a 徐行 at the
   * park's entrance, a convex mirror on each blind bend, and delineator wands on
   * the outside of both -- the wands go in without colliders, because a 0.11 m
   * post carrying one seals a 1.55 m verge (the `street.js` trap). --- */
  const signAt = (x, z, ry, map, w = 0.62) => {
    const y = hillMeshY(x, z);
    ctx.add(makeSignPost({
      x, z, y, ry, h: 2.3, postMat: m.metalDark,
      plates: [{ map, w, h: w, y: 1.72, double: false }],
    }));
    ctx.collide(x - 0.14, z - 0.14, x + 0.14, z + 0.14, y + 2.3);
  };
  signAt(122, -34.4, -1.62, roadSignTex('chui'));
  signAt(133, -35.0, -1.62, warningPlate(2), 0.5);
  signAt(140.6, -50.6, 1.52, roadSignTex('chui'));
  ctx.add(makeMirror({ x: 138.2, z: -33.4, y: hillMeshY(138.2, -33.4), ry: -2.3 }));
  ctx.add(makeMirror({ x: 133.4, z: -62.0, y: hillMeshY(133.4, -62.0), ry: 0.9 }));
  for (const [x, z] of [
    [118, -33.6], [124, -33.6], [130, -34.2], [136, -34.8],
    [131.4, -70.0], [131.4, -77.0], [132.2, -84.0],
    [147.4, -112.0], [153.0, -118.4], [161.0, -124.4],
  ]) {
    ctx.add(makeDelineator({ x, z, y: hillMeshY(x, z), lean: rng.range(-0.06, 0.06) }));
  }

  /* --- the name plates: one at the junction with the school's outer road, one at
   * the head of the crest.  Both double-sided, because both are read from two
   * directions -- and `mirrored()` is what would put mirror writing on them. --- */
  finger(ctx, 91.4, -37.6, -1.05, [lakePlate(10), lakeSign(8)], { h: 2.5, mat: m.metalDark });
  finger(ctx, 155.2, -39.6, 2.2, [lakePlate(0), lakeSign(0)], { h: 2.5, mat: m.metalDark });

  /* --- a pull-off at the top of the climb: two spaces of gravel with wheel stops,
   * where somebody stops to look at the water for the first time.  It is the one
   * place on the road with a view *into* the basin. --- */
  {
    const px = 152.4, pz = -32.4;
    const y = ctx.groundAt(px, pz);
    pad(ctx, { x: px, z: pz, w: 6.4, d: 4.6, y: y - 0.07, h: 0.07, mat: gm.gravel, name: 'lakeLayby' });
    for (const s of [-1, 1]) {
      ctx.add(box(1.5, 0.14, 0.16, m.concreteDark, px + s * 1.6, y + 0.07, pz - 1.7));
    }
    ctx.add(makeBench({ x: px + 1.2, z: pz - 1.0, y, ry: Math.PI, len: 1.7 }));
    ctx.add(makeGuideBoard({ ctx,
      x: px - 1.8, z: pz - 1.9, y, ry: Math.PI, w: 2.0, h: 1.3,
      map: lakeMap(), post: m.metalDark,
    }));
    out.grove.push({ x: px + 4.6, z: pz + 1.4, y: ctx.groundAt(px + 4.6, pz + 1.4), scale: 1.4, seed: 9101, spread: 1.1 });
  }

  /* --- and the gutter/verge dressing that makes it a road somebody maintains --- */
  ctx.add(makeCone({ x: 143.2, z: -34.6, y: hillMeshY(143.2, -34.6), ry: 0.3 }));
  ctx.add(makeCone({ x: 144.6, z: -35.2, y: hillMeshY(144.6, -35.2), ry: -0.4, tilt: 0.07 }));

  return { climb, shore };
}

/* ------------------------------------------------------------------ *
 * 堰堤 -- the embankment and its works.
 * ------------------------------------------------------------------ */

/**
 * The dam, and everything on it.
 *
 * The *bank* is the height field (`lakeform.js`'s `DAMS`), so what this builds is
 * the cladding and the four pieces of apparatus that say what it is for:
 *
 *   **riprap** on the upstream face -- a scatter of stone on the 1-in-2 slope
 *     from the crest down into the water.  Without it the face is a smooth green
 *     ramp and the dam is a grassy bank that happens to be straight.
 *   **the 余水吐** -- the spillway notch through the crest at its north-east end,
 *     with a weir, wing walls, a raked chute and the slab bridge the management
 *     road crosses it on.  Dry: its crest is 0.30 m above the water, which is
 *     what a 満水位 weir is in April.
 *   **the 斜樋 and the 底樋** -- the inclined intake standing in the water with a
 *     catwalk out to it, and the pipe outlet at the downstream toe that the
 *     outfall stream actually comes out of.  This is where a ため池's water
 *     leaves, and it is the piece most models of one leave out.
 *   **the 量水標** -- the staff gauge on the upstream face.  One board, and it is
 *     the only thing in the district that tells you the level moves.
 */
function buildDam(ctx, rng, out) {
  const m = mats();
  const gm = groundMats();
  const D = DAMS[0];
  const dir = [D.b[0] - D.a[0], D.b[1] - D.a[1]];
  const dl = Math.hypot(dir[0], dir[1]);
  const ux = dir[0] / dl, uz = dir[1] / dl;
  const nx = uz, nz = -ux;                       // toward the lake (south-east)
  const g = new THREE.Group();
  g.name = 'lakeDam';
  ctx.add(g);
  const WY = waterY(-44);

  /* --- riprap: stone on the upstream face, thinning out under the water --- */
  {
    const stone = [];
    for (let k = 0; k < 520; k++) {
      const t = rng.range(-0.06, 1.06);
      const s = rng.range(D.half - 0.4, D.half + 6.4);
      const px = D.a[0] + dir[0] * t + nx * s;
      const pz = D.a[1] + dir[1] * t + nz * s;
      const y = hillMeshY(px, pz);
      if (y < WY - 0.9) continue;
      const r = rng.range(0.16, 0.44);
      stone.push({
        geometry: new THREE.DodecahedronGeometry(r, 0),
        matrix: trs(px, y + r * 0.3, pz, rng.range(-0.4, 0.4), rng.range(0, 3), rng.range(-0.4, 0.4),
          1, rng.range(0.45, 0.72), 1),
      });
    }
    const sm = new THREE.Mesh(bake(stone), m.rock);
    sm.castShadow = sm.receiveShadow = true;
    sm.name = 'damRiprap';
    g.add(sm);
  }

  /* --- the crest's two kerbs, and a railing on the *downstream* side only.
   * Upstream you want to be able to look at the water; downstream is a 3.3 m drop
   * onto a concrete chute, which is what a railing is for. --- */
  {
    /**
     * **At the road's own edge, and overlapping.**
     *
     * Written at `half - 0.35` = 3.05 m from the centreline first, which is a metre
     * outside a 4.0 m carriageway -- so what the frame showed was two rows of
     * separate concrete blocks sitting on the grass either side of the road with a
     * gap between each.  Twice wrong: a kerb is *at* the edge of the metalling, and
     * a run of 1.2 m units at 1.12 m centres has to overlap or it is a row of
     * blocks.  2.15 puts them against the road and 1.35 m units at 1.04 m centres
     * read as one continuous run.
     */
    const kerb = [];
    const n = 15;
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      for (const s of [1, -1]) {
        const px = D.a[0] + dir[0] * t + nx * s * 2.15;
        const pz = D.a[1] + dir[1] * t + nz * s * 2.15;
        const y = hillMeshY(px, pz);
        kerb.push({
          geometry: new THREE.BoxGeometry(1.35, 0.34, 0.26),
          matrix: trs(px, y + 0.08, pz, 0, Math.atan2(ux, uz), 0),
        });
      }
    }
    const km = new THREE.Mesh(bake(kerb), m.concreteMid);
    km.castShadow = km.receiveShadow = true;
    g.add(km);
  }
  {
    const rl = [];
    for (let k = 0; k <= 6; k++) {
      const t = k / 6;
      rl.push([D.a[0] + dir[0] * t - nx * 2.7, D.a[1] + dir[1] * t - nz * 2.7]);
    }
    groundRail(ctx, rl, { h: 1.1, spacing: 2.4, mat: m.white, name: 'damRail' });
  }

  /* --- 余水吐: the weir, its wing walls, the chute and the road's slab over it --- */
  {
    const { pts } = channelLine('spill', 1.4);
    const parts = [];
    const deck = [];
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k], b = pts[k + 1];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 0.05) continue;
      const ry = Math.atan2(b[0] - a[0], b[1] - a[1]);
      const cx = (a[0] + b[0]) / 2, cz = (a[1] + b[1]) / 2;
      const cy = groundY(cz) + (a[2] + b[2]) / 2;
      // the invert slab
      parts.push({
        geometry: new THREE.BoxGeometry(3.0, 0.22, len + 0.1),
        matrix: trs(cx, cy + 0.05, cz, 0, ry, 0),
      });
      // and the two side walls, standing up to whatever the ground is beside them
      for (const s of [-1, 1]) {
        const wx = cx + Math.cos(ry) * s * 1.62;
        const wz = cz - Math.sin(ry) * s * 1.62;
        const top = Math.max(hillMeshY(wx, wz), cy + 0.7);
        parts.push({
          geometry: new THREE.BoxGeometry(0.26, top - cy + 0.3, len + 0.1),
          matrix: trs(wx, (top + cy) / 2, wz, 0, ry, 0),
        });
      }
    }
    // the weir itself: a 0.3 m lip across the head of the chute
    {
      const a = pts[0];
      const ry = Math.atan2(pts[1][0] - a[0], pts[1][1] - a[1]);
      parts.push({
        geometry: new THREE.BoxGeometry(3.2, 0.42, 0.34),
        matrix: trs(a[0], groundY(a[1]) + a[2] + 0.05, a[1], 0, ry, 0),
      });
    }
    const sm = new THREE.Mesh(bake(parts), m.concrete);
    sm.castShadow = sm.receiveShadow = true;
    sm.name = 'damSpillway';
    g.add(sm);
    hullOutline(sm, { thickness: 0.0025 });

    /* the slab the road crosses on.  Its deck is the crest, so the clearance is
     * the notch's own depth -- 2.6 m, which is what a 満水位 weir under a crest
     * road actually leaves. */
    const bx = 155.6, bz = -34.6;
    const by = hillMeshY(bx - 2.4, bz - 2.4);
    deck.push({ geometry: new THREE.BoxGeometry(5.6, 0.34, 4.6), matrix: trs(bx, by - 0.17, bz, 0, 0.6, 0) });
    const dm = new THREE.Mesh(bake(deck), m.concreteMid);
    dm.castShadow = dm.receiveShadow = true;
    g.add(dm);
    ctx.platform({ x0: bx - 2.6, x1: bx + 2.6, z0: bz - 2.2, z1: bz + 2.2, top: by });
    for (const s of [-1, 1]) {
      railing(ctx, {
        axis: 'x', at: bz + s * 2.0, from: bx - 2.4, to: bx + 2.4,
        y: by, h: 0.95, spacing: 1.2, mat: m.white,
      });
    }
    const pl = (x, z, ry, v) => {
      const y = hillMeshY(x, z);
      ctx.add(makeSignPost({
        x, z, y, ry, h: 1.5, postMat: m.metalDark,
        plates: [{ map: damPlate(v), w: 0.86, h: 0.22, y: 1.16, double: false }],
      }));
    };
    pl(158.4, -40.4, 2.5, 0);
  }

  /* --- 斜樋 -- the inclined intake, standing in the water with a catwalk to it.
   * The most recognisable single object at a Japanese ため池, and the reason the
   * water leaves at all: a stack of plugs up a raked timber column, one pulled for
   * each 0.3 m the level is drawn down. --- */
  {
    const ix = D.a[0] + dir[0] * 0.62 + nx * 8.6;
    const iz = D.a[1] + dir[1] * 0.62 + nz * 8.6;
    const bed = WY - Math.max(0.2, lakeDepthAt(ix, iz));
    const parts = [];
    const dark = [];
    // the raked column
    const H = WY + 1.15 - bed;
    parts.push({
      geometry: new THREE.BoxGeometry(0.52, H, 0.52),
      matrix: trs(ix, bed + H / 2, iz, 0.30, Math.atan2(nx, nz), 0),
    });
    for (let k = 0; k < 6; k++) {
      dark.push({
        geometry: new THREE.CylinderGeometry(0.085, 0.085, 0.2, 8),
        matrix: trs(ix - nx * (k * 0.16), bed + 0.5 + k * 0.42, iz - nz * (k * 0.16), Math.PI / 2, 0, 0),
      });
    }
    // the concrete block it stands on
    parts.push({
      geometry: new THREE.BoxGeometry(1.5, 0.7, 1.5),
      matrix: trs(ix, bed + 0.2, iz, 0, Math.atan2(nx, nz), 0),
    });
    const im = new THREE.Mesh(bake(parts), m.timberDark);
    im.castShadow = im.receiveShadow = true;
    g.add(im);
    g.add(new THREE.Mesh(bake(dark), m.metalDark));
    hullOutline(im, { thickness: 0.003 });

    /* the catwalk out to it: five bays of timber on paired piles, with a handrail
     * on one side.  It is a *maintenance* walk, so it is 0.9 m wide and it has a
     * gate plate at its root saying so. */
    const rootX = D.a[0] + dir[0] * 0.62 + nx * (D.half + 0.2);
    const rootZ = D.a[1] + dir[1] * 0.62 + nz * (D.half + 0.2);
    const walkY = WY + 0.55;
    const bays = 5;
    const wparts = [];
    for (let k = 0; k <= bays; k++) {
      const t = k / bays;
      const px = rootX + (ix - rootX) * t, pz = rootZ + (iz - rootZ) * t;
      for (const s of [-1, 1]) {
        const qx = px + ux * s * 0.38, qz = pz + uz * s * 0.38;
        const fy = hillMeshY(qx, qz);
        wparts.push({
          geometry: new THREE.BoxGeometry(0.13, walkY - fy + 0.1, 0.13),
          matrix: trs(qx, (walkY + fy) / 2, qz),
        });
      }
    }
    const wl = Math.hypot(ix - rootX, iz - rootZ);
    for (let k = 0; k < Math.round(wl / 0.2); k++) {
      const t = (k + 0.5) / Math.round(wl / 0.2);
      wparts.push({
        geometry: new THREE.BoxGeometry(0.95, 0.055, 0.17),
        matrix: trs(rootX + (ix - rootX) * t, walkY, rootZ + (iz - rootZ) * t, 0, Math.atan2(nx, nz), 0),
      });
    }
    const wm = new THREE.Mesh(bake(wparts), m.timber);
    wm.castShadow = wm.receiveShadow = true;
    g.add(wm);
    ctx.platform({
      x0: Math.min(rootX, ix) - 0.6, x1: Math.max(rootX, ix) + 0.6,
      z0: Math.min(rootZ, iz) - 0.6, z1: Math.max(rootZ, iz) + 0.6, top: walkY + 0.03,
    });
    groundRail(ctx, [[rootX + ux * 0.5, rootZ + uz * 0.5], [ix + ux * 0.5, iz + uz * 0.5]],
      { h: 0.95, spacing: 1.4, mat: m.metal, yAt: () => walkY, name: 'damCatwalkRail' });
    /* …and the gate that keeps the public off it.  A 立入禁止 plate and a chain,
     * which is what is actually there -- a locked gate on a catwalk somebody has
     * to reach four times a year is a gate that gets left open. */
    {
      const gy = hillMeshY(rootX, rootZ);
      for (const s of [-1, 1]) {
        ctx.add(cyl(0.05, 0.055, 1.0, 7, m.metalDark, rootX + ux * s * 0.6, gy + 0.5, rootZ + uz * s * 0.6));
      }
      const ch = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 1.2, 5), m.metalDark);
      ch.rotation.set(0, Math.atan2(ux, uz), Math.PI / 2);
      ch.position.set(rootX, gy + 0.62, rootZ);
      g.add(ch);
      ctx.collide(rootX + ux * 0.6 - 0.06, rootZ + uz * 0.6 - 0.06,
        rootX + ux * 0.6 + 0.06, rootZ + uz * 0.6 + 0.06, gy + 1.0, gy, true);
      ctx.collide(rootX - ux * 0.6 - 0.06, rootZ - uz * 0.6 - 0.06,
        rootX - ux * 0.6 + 0.06, rootZ - uz * 0.6 + 0.06, gy + 1.0, gy, true);
      const p = makeSignPost({
        x: rootX - ux * 1.4, z: rootZ - uz * 1.4, y: gy, ry: Math.atan2(-nx, -nz), h: 1.6,
        postMat: m.metalDark,
        plates: [{ map: warningPlate(1), w: 0.4, h: 0.8, y: 1.05, double: false }],
      });
      ctx.add(p);
    }
  }

  /* --- 量水標: the staff gauge, bolted to the upstream face where the water
   * meets it.  Same board `canal.js` uses on its 吐口, for the same reason. --- */
  {
    const gx = D.a[0] + dir[0] * 0.86 + nx * (D.half + 3.4);
    const gz = D.a[1] + dir[1] * 0.86 + nz * (D.half + 3.4);
    const gy = hillMeshY(gx, gz);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.4, 0.1), [
      m.metal, m.metal, m.metal, m.metal,
      flat({ color: 0xffffff, map: gaugeBoard(), cache: false }), m.metal,
    ]);
    post.position.set(gx, gy + 1.05, gz);
    post.rotation.y = Math.atan2(nx, nz);
    post.castShadow = true;
    g.add(post);
    hullOutline(post, { thickness: 0.003 });
  }

  /* --- 底樋: the outlet at the downstream toe, and the stilling basin the stream
   * starts in.  `lake.js` draws the water; this is the concrete round it. --- */
  {
    const ox = 150.6, oz = -30.2;
    const oy = groundY(oz) + 2.95;
    const parts = [];
    parts.push({ geometry: new THREE.BoxGeometry(3.6, 0.9, 3.0), matrix: trs(ox, oy - 0.3, oz) });
    for (const s of [-1, 1]) {
      parts.push({ geometry: new THREE.BoxGeometry(3.6, 0.9, 0.26), matrix: trs(ox, oy + 0.3, oz + s * 1.4) });
    }
    parts.push({ geometry: new THREE.BoxGeometry(0.3, 1.4, 3.0), matrix: trs(ox + 1.8, oy + 0.35, oz) });
    const pm = new THREE.Mesh(bake(parts), m.concrete);
    pm.castShadow = pm.receiveShadow = true;
    g.add(pm);
    // the pipe mouth and its dark
    const pipe = cyl(0.34, 0.34, 0.7, 12, m.concreteDark, ox + 1.7, oy + 0.34, oz);
    pipe.rotation.z = Math.PI / 2;
    g.add(pipe);
    const dark = cyl(0.27, 0.27, 0.3, 12, flat({ color: 0x2b2833 }), ox + 1.9, oy + 0.34, oz);
    dark.rotation.z = Math.PI / 2;
    dark.userData.noOutline = true;
    g.add(dark);
    ctx.collide(ox - 1.9, oz - 1.6, ox + 2.0, oz + 1.6, oy + 0.75);
  }

  /* --- the management hut, its yard, and the plates.  A 3.4 x 2.6 block hut with
   * a shutter, a switch box, a warning lamp and a hose reel: the whole visible
   * apparatus of somebody being responsible for this. --- */
  {
    const Y = SITES.mgmtYard;
    const yy = ctx.groundAt(Y.x, Y.z);
    pad(ctx, { x: Y.x, z: Y.z, w: 11.0, d: 7.2, y: yy - 0.07, h: 0.07, mat: gm.gravel, name: 'damYard' });
    const hx = Y.x - 2.6, hz = Y.z - 1.2;
    const hut = new THREE.Group();
    hut.add(box(3.4, 2.5, 2.7, m.concrete, 0, 1.25, 0));
    hut.add(box(3.8, 0.16, 3.1, cel({ color: PAL.roofSlate, bands: 3, tint: 0x514b70 }), 0, 2.6, 0));
    hut.add(box(1.5, 1.9, 0.08, cel({ color: PAL.shutter, bands: 3, tint: 0x5c5680 }), 0.2, 0.95, 1.38));
    hut.add(box(0.42, 0.56, 0.16, m.metal, -1.2, 1.5, 1.4));
    // the warning lamp
    const lamp = cyl(0.11, 0.11, 0.16, 10, flat({ color: PAL.red }), 1.3, 2.76, 0);
    lamp.userData.noOutline = true;
    hut.add(lamp);
    hut.add(cyl(0.05, 0.05, 0.36, 7, m.metalDark, 1.3, 2.6, 0));
    hut.position.set(hx, yy, hz);
    hut.rotation.y = 0.1;
    shadowify(hut, true, true);
    ctx.add(hut);
    ctx.collide(hx - 1.9, hz - 1.5, hx + 1.9, hz + 1.5, yy + 2.6);
    ctx.add(makeSignPost({
      x: hx + 2.3, z: hz + 1.5, y: yy, ry: Math.PI, h: 1.7, postMat: m.metalDark,
      plates: [{ map: damPlate(4), w: 0.9, h: 0.23, y: 1.34, double: false }],
    }));
    ctx.add(makeNoticeBoard({ ctx,
      x: Y.x + 2.4, z: Y.z + 2.2, y: yy, ry: Math.PI, w: 1.9, h: 1.25, y0: 0.95, wood: 0x8a6f52,
      sheets: [{ map: lakeNotice(5), x: 0, y: 0, w: 0.82, h: 0.62, tilt: 0 }],
    }));
    ctx.add(makeCrates({ x: Y.x + 3.6, z: Y.z - 1.6, y: yy, n: 3, seed: 9211, ry: 0.2 }));
    ctx.add(makeMilkCrate({ x: Y.x + 4.2, z: Y.z - 2.6, y: yy, ry: -0.3, n: 2 }));
    ctx.add(makeBucket({ x: hx + 2.1, z: hz - 1.4, y: yy, ry: 0.4 }));
    // the yard's mesh gate, which is why the yard reads as a yard
    ctx.add(makeCone({ x: Y.x - 5.0, z: Y.z + 2.4, y: yy, ry: 0.2 }));
    out.shrubs.push({ x: Y.x + 5.4, z: Y.z + 2.6, y: yy, r: 0.5, count: 4, spread: 1.6, seed: 9221 });
  }

  /* --- planting: nothing on the embankment itself, which is correct (a dam is
   * mown, and roots in a bank are how a bank fails) and is also what makes it
   * read as engineered against the wooded shores either side of it. --- */
  out.grove.push(
    { x: 138.0, z: -39.0, y: ctx.groundAt(138.0, -39.0), scale: 1.45, seed: 9231, spread: 1.1 },
    { x: 162.6, z: -34.6, y: ctx.groundAt(162.6, -34.6), scale: 1.5, seed: 9232, spread: 1.15 }
  );
  out.sakura.push({
    x: 159.6, z: -47.4, y: ctx.groundAt(159.6, -47.4), scale: 1.2, seed: 9241,
    lean: 0.12, leanDir: 2.0,
  });

  shadowify(g, true, true);
}

/* ------------------------------------------------------------------ *
 * 見晴台 -- the hill route and the overlook.
 * ------------------------------------------------------------------ */

/**
 * The link from ひばり山's own trail system over the east shoulder, and the
 * platform at the top of it.
 *
 * This is the route the brief for this district is really about: you should come
 * *over* a hill and find water.  It leaves the 山裾の道 where that path meets the
 * school's outer road, zigzags up between the shoulder's three shelves, and drops
 * down the east flank to the boat house.
 *
 * The overlook is 11.5 m of hill plus a 1.1 m timber platform, so the eye is
 * 14.3 m above the town's datum -- a 68 m ground horizon, which is exactly where
 * the peninsula's tip is.  That is not a coincidence: `SITES.lakeDeck` was placed
 * against the curvature, because a viewpoint on a 160 m planet either has an
 * object at its horizon or it has haze.
 */
function buildMiharashi(ctx, rng, out) {
  const m = mats();
  const gm = groundMats();
  const R = ROUTES.mikaharashi.pts;

  const path = hillPath(ctx, {
    pts: R, w: 1.5, lift: 0.045, drop: 0.32, step: 1.0,
    mat: hillMats().path, edgeMat: hillMats().pathEdge, name: 'miharashiPath',
  });

  /* 丸太階段 where the *ground* says, not where a list says.  Four pitches over
   * 0.34 on this route; a hand-written list goes stale the moment a summit
   * moves. */
  let flights = 0;
  for (const s of trailSegs(R)) {
    if (s.grade < 0.34) continue;
    logSteps(ctx, s.a, s.b, { w: 1.4, pitch: 0.6 });
    flights++;
  }

  /* a timber rail on the downhill side of the two exposed traverses */
  groundRail(ctx, [[102.6, -95.6], [106.0, -98.0], [109.0, -95.4]],
    { h: 0.9, spacing: 1.6, mat: m.timber, collide: false, name: 'miharashiRail' });
  groundRail(ctx, [[136.6, -111.0], [140.4, -112.4], [143.4, -110.6]],
    { h: 0.9, spacing: 1.6, mat: m.timber, collide: false, name: 'miharashiRailE' });

  /* the 林間休息台 on the middle shelf: a plank platform, a bench and a post.
   * The brief asks for a rest stop on this route and the ground chose where -- the
   * shelf at x = 112 is the one flat spot between the toe and the crest. */
  {
    const rx = 113.4, rz = -94.2;
    const ry0 = ctx.groundAt(rx, rz);
    pad(ctx, { x: rx, z: rz, w: 3.4, d: 3.0, y: ry0 - 0.06, h: 0.06, mat: hillMats().pathEdge, name: 'restPad' });
    ctx.add(makeBench({ x: rx, z: rz - 0.8, y: ry0, ry: 0, len: 1.8 }));
    finger(ctx, rx + 1.5, rz + 1.2, -1.2, [7, 8], { h: 2.1 });
    dapple(ctx, { x: rx, z: rz, y: ry0, r: 1.5, spread: 2.6, n: 5, rng });
    out.grove.push({ x: rx - 3.0, z: rz + 2.2, y: ctx.groundAt(rx - 3.0, rz + 2.2), scale: 1.5, seed: 9301, spread: 1.1 });
  }

  /* fingerposts at both ends and at the crest */
  finger(ctx, 87.6, -96.6, -1.4, [7, 8], { h: 2.25 });
  finger(ctx, 125.8, -109.2, 2.0, [0, 2], { h: 2.25 });
  finger(ctx, 144.2, -107.4, 1.2, [7, 1], { h: 2.25 });

  /* --- the platform.  1.1 m, on four corner posts, with the rail on the side it looks
   * *at* -- the north-east, over the water.  `makeBench`'s back is at local -z,
   * so a bench facing the lake from here needs `ry` derived from where it stands
   * and not written as a constant: both of the 展望台's benches faced away from
   * the view the first time round for exactly that reason. --- */
  {
    const V = SITES.lakeDeck;
    const gy = hillMeshY(V.x, V.z);
    const W = 5.0, Dd = 4.2, H = 1.1;
    const DY = gy + H;
    const g = new THREE.Group();
    g.name = 'lakeMiharashidai';
    ctx.add(g);

    const posts = [];
    const foot = [];
    for (const i of [-1, 1]) {
      for (const j of [-1, 1]) {
        const px = V.x + i * (W / 2 - 0.35);
        const pz = V.z + j * (Dd / 2 - 0.35);
        const py = hillMeshY(px, pz);
        foot.push({ geometry: new THREE.BoxGeometry(0.55, 0.28, 0.55), matrix: trs(px, py + 0.07, pz) });
        posts.push({
          geometry: new THREE.BoxGeometry(0.19, DY - py - 0.1, 0.19),
          matrix: trs(px, (DY + py + 0.1) / 2 - 0.05, pz),
        });
        ctx.collide(px - 0.10, pz - 0.10, px + 0.10, pz + 0.10, DY, py, true);
      }
    }
    const fm = new THREE.Mesh(bake(foot), m.concreteMid);
    g.add(fm);
    const pm = new THREE.Mesh(bake(posts), m.timberDark);
    pm.name = 'openFrame';
    g.add(pm);

    const boards = [];
    for (const s of [-1, 1]) {
      boards.push({ geometry: new THREE.BoxGeometry(W + 0.2, 0.2, 0.15), matrix: trs(V.x, DY - 0.11, V.z + s * (Dd / 2 - 0.1)) });
    }
    boards.push({ geometry: new THREE.BoxGeometry(W + 0.2, 0.18, 0.13), matrix: trs(V.x, DY - 0.12, V.z) });
    const n = Math.round(Dd / 0.19);
    for (let k = 0; k < n; k++) {
      boards.push({
        geometry: new THREE.BoxGeometry(W + 0.24, 0.055, 0.165),
        matrix: trs(V.x, DY + 0.03, V.z - Dd / 2 + 0.1 + k * (Dd - 0.2) / (n - 1)),
      });
    }
    const bm = new THREE.Mesh(bake(boards), m.timber);
    bm.castShadow = bm.receiveShadow = true;
    g.add(bm);
    hullOutline(bm, { thickness: 0.003 });
    ctx.platform({ x0: V.x - W / 2, x1: V.x + W / 2, z0: V.z - Dd / 2, z1: V.z + Dd / 2, top: DY + 0.06 });

    /* the balustrade.  A parapet, not a flush edge: `_resolve` skips any collider
     * whose top is within a step of the feet, so a rail at deck level lets the
     * player stroll off it. */
    const RH = 1.02;
    const rp = [];
    const x0 = V.x - W / 2, x1 = V.x + W / 2, z0 = V.z - Dd / 2, z1 = V.z + Dd / 2;
    const rail = (ax, az, bx, bz, gap) => {
      const len = Math.hypot(bx - ax, bz - az);
      const ry = Math.atan2(bx - ax, bz - az);
      const nn = Math.max(2, Math.round(len / 1.3));
      for (let k = 0; k <= nn; k++) {
        const t = k / nn;
        if (gap && t > gap[0] && t < gap[1]) continue;
        const px = ax + (bx - ax) * t;
        const pz = az + (bz - az) * t;
        rp.push({
          geometry: new THREE.BoxGeometry(0.1, RH, 0.1),
          matrix: trs(px, DY + RH / 2, pz),
        });
        ctx.collide(px - 0.06, pz - 0.06, px + 0.06, pz + 0.06, DY + RH, DY, true);
      }
      for (const hy of [RH - 0.05, RH * 0.5]) {
        if (gap) {
          for (const [p, q] of [[0, gap[0]], [gap[1], 1]]) {
            if (q - p < 0.02) continue;
            const sx = ax + (bx - ax) * p, sz = az + (bz - az) * p;
            const ex = ax + (bx - ax) * q, ez = az + (bz - az) * q;
            rp.push({
              geometry: new THREE.BoxGeometry(0.075, 0.075, Math.hypot(ex - sx, ez - sz)),
              matrix: trs((sx + ex) / 2, DY + hy, (sz + ez) / 2, 0, ry, 0),
            });
            ctx.collide(Math.min(sx, ex) - 0.06, Math.min(sz, ez) - 0.06,
              Math.max(sx, ex) + 0.06, Math.max(sz, ez) + 0.06,
              DY + hy + 0.05, DY + hy - 0.05, true);
          }
        } else {
          rp.push({
            geometry: new THREE.BoxGeometry(0.075, 0.075, len),
            matrix: trs((ax + bx) / 2, DY + hy, (az + bz) / 2, 0, ry, 0),
          });
          ctx.collide(Math.min(ax, bx) - 0.06, Math.min(az, bz) - 0.06,
            Math.max(ax, bx) + 0.06, Math.max(az, bz) + 0.06,
            DY + hy + 0.05, DY + hy - 0.05, true);
        }
      }
    };
    /* The lake is **east and north-east** of here, so the open side is the
     * **south**, which is where the 遊歩道 now passes.  Rail the other three.
     *
     * It was the west, with the trail running under the deck to reach it, and the
     * flood fill said no -- see the note on `ROUTES.mikaharashi`.  A railed
     * platform is solid from below, so the way on has to be a flight off the side
     * the path goes past. */
    rail(x1, z0, x1, z1);                  // east: the view side, unbroken
    rail(x0, z1, x1, z1);                  // north
    rail(x0, z0, x0, z1);                  // west
    /* 0.32..0.78, i.e. 2.3 m of opening.  At 0.40..0.72 it is 1.6 m, and the
     * player's own radius on each side of the two rail colliders takes that to
     * 0.32 m of walkable ground -- the 1.8 m minimum `plotWall`'s gate posts
     * taught this project, at the top of a five-tread flight. */
    rail(x0, z0, x1, z0, [0.32, 0.78]);    // south: the way in
    const rm = new THREE.Mesh(bake(rp), m.timber);
    rm.name = 'openFrame';
    rm.castShadow = true;
    g.add(rm);

    /* the flight up from the 遊歩道, in the gap in the south rail.  Five treads
     * along z, so `dir` is +1 and the top tread lands on the deck's own edge. */
    steps(ctx, {
      x: V.x + 0.25, z: V.z - Dd / 2 - 1.9, n: 5, rise: H / 5, run: 0.42, w: 1.9,
      y: gy, dir: 1, axis: 'z', mat: gm.stone,
    });

    /* the 眺望案内 panel, on the *east* rail with its map on the west face so it
     * is read from inside the deck rather than from over the drop -- the mistake
     * the 展望台's panel made first time round. */
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.85, 1.8), [
      flat({ color: 0xffffff, map: lakePanel(), cache: false }),
      flat({ color: PAL.wallGray }), flat({ color: PAL.wallGray }),
      flat({ color: PAL.wallGray }), flat({ color: PAL.wallGray }), flat({ color: PAL.wallGray }),
    ]);
    /* **On the south end of the east rail, not the middle of it.**  Written at
     * `V.z - 0.2` first, which is dead centre: the establishing shot from this deck
     * came back as a 1.8 m grey board filling half the frame with the lake showing
     * past one corner of it.  Same note the 展望台's panel carries -- a 2.4 m panel
     * centred on a 5 m deck *is* the view -- and the fix is the same, offset it to
     * one end and leave the other two thirds of the rail clear. */
    panel.position.set(x1 - 0.34, DY + 0.9, V.z - 1.45);
    panel.rotation.z = -0.4;
    panel.castShadow = true;
    g.add(panel);
    hullOutline(panel, { thickness: 0.003 });
    for (const s of [-1, 1]) {
      g.add(box(0.1, 0.82, 0.1, m.timberDark, x1 - 0.5, DY + 0.44, V.z - 1.45 + s * 0.78));
    }
    /* Benches facing the water: `ry = -PI/2` puts the back at +x, i.e. you sit
     * looking east down the basin.  Derived from which side of the deck they are
     * on, per the note above. */
    ctx.add(makeBench({ x: V.x - 1.1, z: V.z + 1.3, y: DY + 0.06, ry: -Math.PI / 2, len: 1.6 }));
    ctx.add(makeBench({ x: V.x - 1.1, z: V.z - 1.3, y: DY + 0.06, ry: -Math.PI / 2, len: 1.6 }));

    /* the map board at the foot of the steps, and the name plate */
    const bx = V.x - 4.4, bz = V.z + 1.6;
    const by = hillMeshY(bx, bz);
    ctx.add(makeGuideBoard({ ctx, x: bx, z: bz, y: by, ry: -1.3, w: 2.0, h: 1.3, map: lakeMap(), post: m.timber }));
    finger(ctx, V.x - 3.2, V.z - 2.4, -1.9, [lakePlate(7)], { h: 2.2 });

    /* planting: a frame, and **all of it west and on the flanks**.  East is the
     * view; anything on that side is in the picture the deck exists for. */
    for (const [dx, dz, sc, sd] of [
      [-6.6, 4.4, 1.5, 9401], [-7.4, -3.6, 1.44, 9402], [-3.0, 5.6, 1.38, 9403], [-2.4, -6.0, 1.5, 9404],
    ]) {
      out.grove.push({
        x: V.x + dx, z: V.z + dz, y: hillMeshY(V.x + dx, V.z + dz),
        scale: sc, seed: sd, spread: 1.12, lean: 0.05, leanDir: sd % 6,
      });
    }
    out.sakura.push({ x: V.x - 5.4, z: V.z + 1.0, y: hillMeshY(V.x - 5.4, V.z + 1.0), scale: 1.22, seed: 9411, lean: 0.11, leanDir: 4.2 });
    out.petals.push({ x: V.x - 3.6, z: V.z + 0.6, y: hillMeshY(V.x - 3.6, V.z + 0.6), r: 2.0, seed: 9421 });
    dapple(ctx, { x: V.x - 4.0, z: V.z, y: hillMeshY(V.x - 4.0, V.z), r: 1.8, spread: 3.2, n: 7, rng });
    shadowify(g, true, true);
  }

  return { flights, path };
}

/* ------------------------------------------------------------------ *
 * Builder.
 * ------------------------------------------------------------------ */

export function buildLakeRoad(ctx) {
  const rng = rngKit(90211);
  const out = { sakura: [], grove: [], shrubs: [], bamboo: [], petals: [] };
  buildRoad(ctx, rng, out);
  buildDam(ctx, rng, out);
  const mi = buildMiharashi(ctx, rng, out);
  out.stats = { logFlights: mi.flights };
  return out;
}
