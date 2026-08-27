import * as THREE from 'three';
import { PAL } from '../core/palette.js';
import { cel, flat } from '../core/toon.js';
import { gomiPlate, laneNamePlate, warningPlate, meterBox, litWindowTex } from '../core/textures.js';
import { box, cyl, bake, trs, rngKit, sagCurve } from '../core/util.js';
import { hullOutline } from '../core/outline.js';
import { groundY } from './street.js';
import { groundMats, meshFence } from './ground.js';
import { makeWall, makeTimberFence, makeBlockFence } from './buildings.js';
import {
  makeBicycle, makeBins, makePlanter, makeLaundryPole, makeAircon, makePostBox,
  makeUmbrellaStand, makeDeliveryBox, makeDoormat, makePotShelf, makeStorageShed,
  makeTapPost, makeIvy, makeBucket, makeSignPost, makeMirror, makeCrates,
} from './props.js';
import {
  makeGomiHouse, makeScooter, makeKitchenGarden, makeKidBike, makeDryingRack,
  makeGasMeter, makeWaterMeter,
} from './streetprops.js';

/* ------------------------------------------------------------------ *
 * Plots, boundaries and the things that say somebody lives here.
 *
 * Six new residential blocks went in at once, and the previous rounds are very
 * clear about where the bugs in work like this actually are.  They are never in
 * the buildings.  They are in the ground around them:
 *
 *   - a prop placed by its clearance to a wall rather than by its own length,
 *     so half of it is inside the render (thirty-seven of eighty-seven bicycles)
 *   - a prop turned to face the building it belongs to instead of the street
 *     (half the outdoor units in the world, fans pointing into the wall)
 *   - a prop seated from `groundY(z)` when a footway, a slab or a cut is under
 *     it, so it floats or is buried by exactly that thickness
 *   - a boundary wall standing in the lane because the plot had no setback
 *   - an offset given in the unit's frame and applied in world space, which for
 *     a building turned a half circle puts everything on the wrong side
 *
 * Every one of those is a *frame* problem, so this file owns the frames.
 * `plotBox` turns a building's own `{x, z, w, d, face}` -- the same numbers you
 * handed the generator -- into a world AABB plus an `at(u, v)` that maps the
 * unit's local axes into world space.  Nothing in the six blocks does that
 * arithmetic by hand, and `dressPlot` places the whole life of a house through
 * it: correct side, correct facing, seated on `ctx.groundAt`, and never twice in
 * the same place.
 * ------------------------------------------------------------------ */

const M = {};
function mats() {
  if (M.concrete) return M;
  M.concrete = cel({ color: PAL.concrete, bands: 3, tint: 0x6f6790 });
  M.concreteMid = cel({ color: PAL.concreteMid, bands: 3, tint: 0x6a6288 });
  M.concreteDark = cel({ color: PAL.concreteDark, bands: 3, tint: 0x655d84 });
  M.metal = cel({ color: PAL.metal, bands: 3, tint: 0x666090 });
  M.metalDark = cel({ color: PAL.metalDark, bands: 3, tint: 0x5c5680 });
  M.drain = cel({ color: PAL.drain, bands: 3, tint: 0x5d5878 });
  M.stone = cel({ color: PAL.stone, bands: 3, tint: 0x655d80 });
  M.wood = cel({ color: 0x9c7f5e, bands: 3, tint: 0x5c5680 });
  M.woodDark = cel({ color: 0x74563f, bands: 3, tint: 0x554e74 });
  M.leaf = cel({ color: PAL.leaf, bands: 3, tint: 0x5b6f8c });
  M.leafDeep = cel({ color: PAL.leafDeep, bands: 3, tint: 0x5b6f8c });
  return M;
}

const FACE_RY = { 'z+': 0, 'z-': Math.PI, 'x+': Math.PI / 2, 'x-': -Math.PI / 2 };

/* ------------------------------------------------------------------ *
 * The frame of a plot.
 * ------------------------------------------------------------------ */

/**
 * Turn a building's own placement into everything a caller needs around it.
 *
 * `w` and `d` are as the generators take them -- frontage width along the
 * unit's local X, depth along its local Z -- and `face` is which way the
 * frontage looks.  So `w` and `d` swap in world space for a unit turned a
 * quarter circle, which is the arithmetic that put a walk-up's collider across
 * a lane and a ryokan's porch beside its own door.
 *
 * `at(u, v)` is the useful part: `u` runs along the frontage (local +X) and `v`
 * out of it (local +Z, so `v > d/2` is in front of the building).  Both in
 * metres, both in the unit's frame, converted here once.
 */
export function plotBox(o) {
  const ry = FACE_RY[o.face ?? 'z+'];
  const c = Math.cos(ry), s = Math.sin(ry);
  // local +X and local +Z, expressed in world XZ
  const lx = c, lz = -s;
  const fx = s, fz = c;
  const w = o.w ?? 6.0, d = o.d ?? 6.0;
  const halfX = Math.abs(lx) * (w / 2) + Math.abs(fx) * (d / 2);
  const halfZ = Math.abs(lz) * (w / 2) + Math.abs(fz) * (d / 2);
  return {
    ry, lx, lz, fx, fz, w, d,
    halfW: w / 2, halfD: d / 2,
    x: o.x, z: o.z,
    x0: o.x - halfX, x1: o.x + halfX,
    z0: o.z - halfZ, z1: o.z + halfZ,
    /** World point at local offset (u along the frontage, v out of it). */
    at: (u, v) => [o.x + lx * u + fx * v, o.z + lz * u + fz * v],
    /** `ry` for anything whose own +Z must point away from this frontage. */
    outRy: ry,
    /** `ry` for anything on the -X or +X flank, pointing away from the wall. */
    flankRy: (side) => ry + side * Math.PI / 2,
  };
}

/**
 * Register the collider for a building placed with `plotBox`.
 *
 * `pad` used to be walker slop, 0.1 m outside the walls. The fit pass
 * already shrinks onto drawn meshes; leaving pad in for a 5 inch quad
 * made every house 10 cm fatter than it looks. Default is flush.
 */
export function plotCollide(ctx, p, top, pad = 0) {
  ctx.collide(p.x0 - pad, p.z0 - pad, p.x1 + pad, p.z1 + pad, top);
}

/* ------------------------------------------------------------------ *
 * Boundaries.
 * ------------------------------------------------------------------ */

const FENCE_KIND = { timber: makeTimberFence, block: makeBlockFence, wall: makeWall };

/**
 * A boundary round a plot, with a gap where the gate is.
 *
 * `sides` names the edges to build: 'z-' is the low-z edge, 'x+' the high-x
 * edge, and so on -- world axes, because a boundary follows the plot and not
 * the building.  `gate: { side, at, w }` leaves an opening `w` wide centred on
 * `at` (a world coordinate along that edge) and stands a post either side of
 * it; anything narrower than 0.9 m is not a gate, it is a mistake, because the
 * player's own radius is added to *both* posts.
 *
 * Two things this gets right that hand-written runs kept getting wrong:
 *  - a run shorter than 0.4 m is skipped rather than emitted as a stub,
 *  - the collider follows the actual boundary height the fence reports, not an
 *    assumed one, so a 0.36 m wall with a 0.5 m fence on top blocks correctly.
 */
export function plotWall(ctx, o) {
  const m = mats();
  const kind = o.kind ?? 'block';
  const y = o.y ?? 0;
  const sides = o.sides ?? ['x-', 'x+', 'z-', 'z+'];
  const gate = o.gate;
  const out = [];

  for (const side of sides) {
    const axis = side[0] === 'x' ? 'z' : 'x';          // the run's own direction
    const at = side === 'x-' ? o.x0 : side === 'x+' ? o.x1 : side === 'z-' ? o.z0 : o.z1;
    const from = axis === 'z' ? o.z0 : o.x0;
    const to = axis === 'z' ? o.z1 : o.x1;
    // split the run either side of the gate, if the gate is on this edge
    const runs = [];
    if (gate && gate.side === side) {
      const gw = Math.max(0.9, gate.w ?? 1.2) / 2;
      runs.push([from, gate.at - gw], [gate.at + gw, to]);
    } else {
      runs.push([from, to]);
    }
    for (const [a, b] of runs) {
      if (b - a < 0.4) continue;
      if (kind === 'hedge') {
        out.push(hedgeRun(ctx, { axis, at, from: a, to: b, y, h: o.h ?? 0.95, seed: (o.seed ?? 7) + out.length }));
        continue;
      }
      if (kind === 'mesh') {
        out.push(meshFence(ctx, {
          axis, at, from: a, to: b, y, h: o.h ?? 1.5, spacing: 2.0, mid: true,
        }));
        continue;
      }
      const make = FENCE_KIND[kind] ?? makeBlockFence;
      const g = make({
        x: axis === 'z' ? at : (a + b) / 2,
        z: axis === 'z' ? (a + b) / 2 : at,
        len: b - a, axis, y,
        h: o.h ?? (kind === 'timber' ? 0.36 : 0.62),
        fenceH: o.fenceH ?? 0.86,
        blockH: o.blockH ?? 0.4,
        fence: o.fence,
      });
      ctx.add(g);
      const t = 0.14;
      /* Block 透かし voids are ~0.23 m, over GAP_MIN. Collide the solid
       * coursing only so a knife-edge can thread the pierced course. */
      const top = y + (kind === 'block' ? (o.h ?? 0.62) : (g.userData.top ?? 0.9));
      if (axis === 'z') ctx.collide(at - t, a, at + t, b, top);
      else ctx.collide(a, at - t, b, at + t, top);
      out.push(g);
    }
  }

  /* the gate posts.  A gap with nothing at its ends reads as a broken fence;
   * the same lesson as ending a `wallRun` in a pier. */
  if (gate) {
    const gw = Math.max(0.9, gate.w ?? 1.2) / 2;
    const axis = gate.side[0] === 'x' ? 'z' : 'x';
    const at = gate.side === 'x-' ? o.x0 : gate.side === 'x+' ? o.x1 : gate.side === 'z-' ? o.z0 : o.z1;
    const postMat = kind === 'timber' ? m.woodDark : m.concreteMid;
    const H = (o.postH ?? 1.34);
    for (const s of [-1, 1]) {
      const px = axis === 'z' ? at : gate.at + s * gw;
      const pz = axis === 'z' ? gate.at + s * gw : at;
      const p = box(0.15, H, 0.15, postMat, px, y + H / 2, pz);
      p.castShadow = true;
      ctx.add(p);
      ctx.add(box(0.2, 0.05, 0.2, m.concrete, px, y + H + 0.02, pz));
    }
  }
  return out;
}

/**
 * 生垣 -- a clipped hedge as a boundary.
 *
 * The world had concrete-and-mesh, 板塀 and ブロック塀 and nothing green, and a
 * street of only hard boundaries reads as an industrial estate.  Instanced leaf
 * blobs in two tones over a low kerb, which is how the shrubs are built -- and
 * like the shrubs it keeps `receiveShadow`, because a hedge sits on the ground
 * where being in a building's shade reads correctly.  (A tree canopy must not:
 * see the note in CLAUDE.md about dark circles hanging in the sky.)
 */
export function hedgeRun(ctx, o) {
  const m = mats();
  const rng = rngKit(o.seed ?? 31);
  const axis = o.axis ?? 'x';
  const from = Math.min(o.from, o.to);
  const to = Math.max(o.from, o.to);
  const len = to - from;
  const y = o.y ?? 0;
  const h = o.h ?? 0.95;
  const t = o.t ?? 0.44;
  const g = new THREE.Group();

  // the kerb the hedge is planted behind, and the soil strip
  const kx = axis === 'z' ? o.at : (from + to) / 2;
  const kz = axis === 'z' ? (from + to) / 2 : o.at;
  const kerb = box(axis === 'z' ? t + 0.1 : len, 0.12, axis === 'z' ? len : t + 0.1, m.concreteMid, kx, y + 0.06, kz);
  kerb.receiveShadow = true;
  g.add(kerb);

  /* **A hedge is a solid body with a broken surface, not a row of blobs.**  The
   * first pass was instanced blobs alone, the way `makeIvy` and the shrubs are
   * built, and it came out as a scatter of separate dark faceted balls sitting
   * on the path -- a shrub border, not a boundary.  The reason is the ink pass:
   * it fires on every blob's own silhouette, so however densely they are packed
   * each one is drawn as a ball.  So there is a real body underneath, in the
   * deep tone, and the blobs only sit on its top and its outer face to break the
   * outline where the light catches it. */
  const body = box(axis === 'z' ? t : len - 0.06, h - 0.14, axis === 'z' ? len - 0.06 : t,
    m.leafDeep, kx, y + 0.12 + (h - 0.14) / 2, kz);
  body.castShadow = body.receiveShadow = true;
  g.add(body);

  const geo = new THREE.IcosahedronGeometry(1, 0);
  const lists = [[], []];
  const n = Math.max(12, Math.round(len * 12));
  for (let i = 0; i < n; i++) {
    const u = from + 0.1 + rng.range(0, len - 0.2);
    // half along the clipped top, half down the two faces
    const onTop = rng.chance(0.5);
    const by = onTop ? y + h - rng.range(0.0, 0.12) : y + rng.range(0.3, h - 0.2);
    const off = onTop ? rng.range(-t * 0.4, t * 0.4) : (rng.sign() * t) / 2;
    const r = rng.range(0.14, 0.22);
    lists[rng.chance(0.5) ? 0 : 1].push(trs(
      axis === 'z' ? o.at + off : u,
      by,
      axis === 'z' ? u : o.at + off,
      rng.range(0, 3), rng.range(0, 3), rng.range(0, 3),
      r, r * 0.7, r
    ));
  }
  const cols = [m.leaf, cel({ color: PAL.leafPale, bands: 3, tint: 0x5b6f8c })];
  lists.forEach((list, i) => {
    if (!list.length) return;
    const inst = new THREE.InstancedMesh(geo, cols[i], list.length);
    list.forEach((mx, k) => inst.setMatrixAt(k, mx));
    inst.castShadow = true;
    inst.receiveShadow = true;
    g.add(inst);
  });
  ctx.add(g);
  if (o.collide !== false) {
    if (axis === 'z') ctx.collide(o.at - t / 2, from, o.at + t / 2, to, y + h);
    else ctx.collide(from, o.at - t / 2, to, o.at + t / 2, y + h);
  }
  g.userData.top = h;
  return g;
}

/** Stepping stones from a gate to a door. Both ends are world points. */
export function stepStones(ctx, o) {
  const m = mats();
  const rng = rngKit(o.seed ?? 41);
  const n = o.n ?? 5;
  const parts = [];
  const [ax, az] = o.from;
  const [bx, bz] = o.to;
  // the sideways wobble is across the path, not along it
  const dx = bx - ax, dz = bz - az;
  const L = Math.hypot(dx, dz) || 1;
  const px = -dz / L, pz = dx / L;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const s = rng.range(-0.16, 0.16);
    const r = 0.22 + rng.range(0, 0.05);
    parts.push({
      geometry: new THREE.CylinderGeometry(r, r, 0.08, 7),
      matrix: trs(ax + dx * t + px * s, 0.04, az + dz * t + pz * s, 0, rng.range(0, 3), 0),
    });
  }
  const mesh = new THREE.Mesh(bake(parts), m.stone);
  mesh.position.y = o.y ?? 0;
  mesh.receiveShadow = true;
  ctx.add(mesh);
  return mesh;
}

/* ------------------------------------------------------------------ *
 * Refuse points.
 * ------------------------------------------------------------------ */

/**
 * The neighbourhood refuse point.
 *
 * `kind: 'house'` is the built enclosure a block of flats or a corner gets;
 * `'bins'` is the three bins and a plate on a post that a lane corner gets.
 * `ry` faces the way it is used from, and for the enclosure that matters --
 * its gate is on local +z.
 */
export function refusePoint(ctx, o) {
  const m = mats();
  const y = o.y ?? 0;
  if ((o.kind ?? 'bins') === 'house') {
    const gh = makeGomiHouse({ ctx, x: o.x, z: o.z, y, ry: o.ry ?? 0, plateMap: gomiPlate(o.plate ?? 0), seed: o.seed });
    ctx.add(gh);
    return gh;
  }
  ctx.add(makeBins({ x: o.x, z: o.z, y, ry: o.ry ?? 0 }));
  if (o.plateOn !== false) {
    // the plate stands beside the bins, along the same line, not in front of them
    const dx = Math.cos(o.ry ?? 0), dz = -Math.sin(o.ry ?? 0);
    ctx.add(makeSignPost({
      x: o.x - dx * 0.95, z: o.z - dz * 0.95, y, ry: o.ry ?? 0, h: 1.5, postMat: m.metal,
      plates: [{ map: gomiPlate(o.plate ?? 0), w: 0.44, h: 0.34, y: 1.25 }],
    }));
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * The life of a house.
 * ------------------------------------------------------------------ */

/**
 * Put the things outside a building that say somebody lives in it.
 *
 * Everything is placed in the *unit's* frame through `plotBox().at()`, so a
 * building turned a half circle gets its clutter on the street side rather than
 * inside itself, and everything that stands on the ground is seated with
 * `ctx.groundAt` rather than `groundY(z)` -- a footway is 0.135 m, a lane slab
 * 0.09, a forecourt 0.07 and the canal's bank a third of a metre *below*
 * natural, and a prop placed from the street profile alone is out by exactly
 * that.
 *
 * Slots along the frontage are allocated once and never reused, because two
 * props at the same lateral offset is how two bicycles ended up inside each
 * other under one shelter.
 *
 * @param o.x,o.z,o.w,o.d,o.face  the same numbers the generator was given
 * @param o.doorAt   the door's offset along the frontage in the unit's own
 *                   frame (`userData.doorAt`), so the mat, the umbrella stand
 *                   and the parcel box land beside the door and not beside the
 *                   window
 * @param o.gap      how much clear ground there is in front of the frontage;
 *                   items that need more than this are skipped rather than
 *                   pushed into the road
 * @param o.clear    predicate (x, z) -- return false where the carriageway is
 * @param o.airconAt optional local frontage offset for a constrained unit
 * @param o.tapBucketOffset optional [frontage, outward] offset from its tap
 */
export function dressPlot(ctx, o) {
  const m = mats();
  const p = plotBox(o);
  const rng = rngKit(o.seed ?? 8801);
  const gy = (x, z) => ctx.groundAt(x, z);
  const clear = o.clear ?? (() => true);
  const GAP = o.gap ?? 1.8;
  const doorAt = o.doorAt ?? 0;

  /* --- slot allocation along the frontage --- */
  const used = [];
  /* Reserve the gate.  Without this the bicycle takes whichever slot the seed
   * hands it, and about one plot in four parks it squarely in the only opening
   * in its own boundary -- which does not block anything (loose props carry no
   * collider) but reads as a mistake, because it is one. */
  if (o.gateAt !== undefined) used.push([o.gateAt - 0.75, o.gateAt + 0.75]);
  const free = (u, half) => !used.some((r) => u + half > r[0] && u - half < r[1]);
  const take = (half, prefer = 0) => {
    const span = p.halfW - 0.35;
    // walk outward from the preferred offset in 0.3 m steps, both ways
    for (let step = 0; step <= span * 2 / 0.3; step++) {
      for (const s of step === 0 ? [0] : [-1, 1]) {
        const u = prefer + s * step * 0.3;
        if (Math.abs(u) > span - half * 0.5) continue;
        if (free(u, half)) { used.push([u - half, u + half]); return u; }
      }
    }
    return null;
  };
  /** place a ground prop in front of the frontage; returns false if there is no room */
  const front = (half, standoff, prefer, build) => {
    if (standoff + half * 0 > GAP) return false;
    const u = take(half, prefer);
    if (u === null) return false;
    const [x, z] = p.at(u, p.halfD + standoff);
    if (!clear(x, z)) return false;
    build(x, z, gy(x, z), u);
    return true;
  };

  /* Freestyle: skip ornaments that close a gap. Aircon, pots, bikes,
   * laundry, taps and crates used to stand in the flight line. A shed is
   * a volume and stays. A lit window sits on the wall. */
  const DRESS_CLUTTER = false;

  /* --------------------------- against the frontage --------------------------- *
   * The wall items are the ones that were wrong everywhere: `ry` has to be the
   * wall's outward normal (`atan2(nx, nz)`, which for a unit authored facing +z
   * is simply its own `ry`), and the back of the unit has to touch the wall. */
  if (DRESS_CLUTTER && o.aircon !== false) {
    const side = rng.sign();
    const u = o.airconAt ?? side * (p.halfW - 0.75);
    const AC_D = 0.3;                        // makeAircon's depth
    const [x, z] = p.at(u, p.halfD + AC_D / 2 + (o.airconOut ?? 0.09));
    if (clear(x, z)) {
      ctx.add(makeAircon({
        x, z, y: gy(x, z) + (o.airconUp ?? 0), ry: p.outRy, w: 0.8, h: 0.58, feet: o.airconUp ? false : true,
      }));
      used.push([u - 0.5, u + 0.5]);
    }
  }
  if (DRESS_CLUTTER && o.gas) {
    const u = -Math.sign(doorAt || 1) * (p.halfW - 0.45);
    // 0.16 = half the cabinet's 0.2 m depth plus the 0.06 m standoff its bracket
    // arms span, so the back of it touches the wall.  Seated on the ground: the
    // prop carries its own riser down to the stub, so lifting it lifts the pipe.
    const [x, z] = p.at(u, p.halfD + 0.16);
    ctx.add(makeGasMeter({ x, z, y: gy(x, z), ry: p.outRy }));
    used.push([u - 0.3, u + 0.3]);
  }
  if (o.lit) {
    // a warm window, high on the frontage.  Nothing behind the glass but
    // shelves and a lampshade: there is nobody in this world.
    const u = rng.range(-p.halfW * 0.4, p.halfW * 0.4);
    const [x, z] = p.at(u, p.halfD + 0.06);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(1.24, 1.04),
      flat({ color: 0xffffff, map: litWindowTex(rng.int(0, 2)), cache: false }));
    win.position.set(x, (o.y ?? groundY(o.z)) + (o.litY ?? 4.2), z);
    win.rotation.y = p.outRy;
    win.userData.noOutline = true;
    ctx.add(win);
  }

  /* ------------------------------ the front garden ------------------------------ */
  if (DRESS_CLUTTER && o.mat !== false) {
    const [x, z] = p.at(doorAt, p.halfD + 0.55);
    if (clear(x, z)) ctx.add(makeDoormat({ x, z, y: gy(x, z), ry: p.outRy, w: 0.58, d: 0.35 }));
    used.push([doorAt - 0.4, doorAt + 0.4]);
  }
  if (DRESS_CLUTTER && o.pots !== false) {
    const u = take(0.3, doorAt + (rng.chance(0.5) ? 0.95 : -0.95));
    if (u !== null) {
      const placedU = u + (o.potShift ?? 0);
      const [x, z] = p.at(placedU, p.halfD + (o.potOut ?? 0.45));
      if (clear(x, z)) {
        ctx.add(makePlanter({ x, z, y: gy(x, z), r: rng.range(0.19, 0.26), flower: rng.chance(0.65), seed: (o.seed ?? 1) + 11, n: 5 }));
        const [x2, z2] = p.at(placedU + 0.42, p.halfD + (o.potOut ?? 0.42));
        if (clear(x2, z2)) ctx.add(makePlanter({ x: x2, z: z2, y: gy(x2, z2), r: 0.19, flower: false, seed: (o.seed ?? 1) + 12, n: 4 }));
      }
    }
  }
  if (DRESS_CLUTTER && o.umbrella) {
    const u = take(0.28, doorAt - 1.05);
    if (u !== null) {
      const [x, z] = p.at(u, p.halfD + 0.4);
      if (clear(x, z)) ctx.add(makeUmbrellaStand({ x, z, y: gy(x, z), n: rng.int(2, 4), seed: (o.seed ?? 1) + 13 }));
    }
  }
  if (DRESS_CLUTTER && o.parcel) {
    const u = take(0.3, doorAt + 1.15);
    if (u !== null) {
      const [x, z] = p.at(u, p.halfD + 0.42);
      if (clear(x, z)) ctx.add(makeDeliveryBox({ x, z, y: gy(x, z), ry: p.outRy }));
    }
  }
  if (DRESS_CLUTTER && o.shelf) {
    const u = take(0.7, -p.halfW * 0.55);
    if (u !== null) {
      const [x, z] = p.at(u, p.halfD + 0.32);
      if (clear(x, z)) ctx.add(makePotShelf({ x, z, y: gy(x, z), ry: p.outRy, w: 1.2, n: 6, seed: (o.seed ?? 1) + 14 }));
    }
  }

  /* -------------------------------- the bicycle -------------------------------- *
   * A bicycle is 1.73 m long and 0.55 m wide and it is parked *along* the
   * frontage, standing off it by half a handlebar.  Turned across a 1.8 m front
   * garden it goes through the boards at one end and into the render at the
   * other, which is what thirty-seven of them were doing. */
  /* `ry = p.ry`, and this is the whole bug.  `makeBicycle`, `makeKidBike` and
   * `makeScooter` are all authored along **+x** -- the wheelbase runs in x and
   * the machine is 0.55 m wide in z -- so a group turned by the plot's own `ry`
   * has its length along the plot's local X, which is the frontage.  Turning it
   * a further quarter circle points the wheelbase at the wall, and a 1.73 m
   * bicycle on a 0.42 m standoff then has its back wheel and half its rack
   * inside the render.  That was true of thirty-seven of the eighty-seven
   * bicycles in the world and none of it shows in a frame, because the buried
   * half is behind the wall it is buried in. */
  if (DRESS_CLUTTER && o.bike !== false) {
    const u = take(0.95, rng.range(-p.halfW * 0.5, p.halfW * 0.5));
    if (u !== null && GAP > 0.8) {
      const [x, z] = p.at(u, p.halfD + 0.42);
      if (clear(x, z)) {
        ctx.add(makeBicycle({
          x, z, y: gy(x, z), ry: p.ry + rng.range(-0.06, 0.06),
          lean: rng.range(-0.09, 0.09),
          color: rng.pick([0x3f6f9c, 0xd8a03c, 0x9c5a4a, 0x4f8f6a, 0x8f6fb5]),
        }));
      }
    }
  }
  if (DRESS_CLUTTER && o.kidBike) {
    const u = take(0.65, p.halfW * 0.5);
    if (u !== null) {
      const [x, z] = p.at(u, p.halfD + 0.38);
      if (clear(x, z)) ctx.add(makeKidBike({ x, z, y: gy(x, z), ry: p.ry + rng.range(-0.3, 0.3) }));
    }
  }
  if (DRESS_CLUTTER && o.scooter) {
    const u = take(0.9, -p.halfW * 0.45);
    if (u !== null) {
      const [x, z] = p.at(u, p.halfD + 0.48);
      if (clear(x, z)) ctx.add(makeScooter({ x, z, y: gy(x, z), ry: p.ry, seed: (o.seed ?? 1) + 15 }));
    }
  }

  /* --------------------------------- the flanks --------------------------------- *
   * Washing, the store and the vegetable box go where they actually go: down the
   * side or round the back, out of the street elevation. */
  const flank = (side, v, build) => {
    const [x, z] = p.at(side * (p.halfW + (o.flank ?? 0.85)), v);
    build(x, z, gy(x, z), side);
  };
  /* A drying pole's bar runs along **x**, so on a flank it wants `p.ry + PI/2`
   * to lie parallel to the wall it is beside.  At `p.ry` the bar points straight
   * out of the flank and a 2.2 m run of washing crosses whatever is next door. */
  if (DRESS_CLUTTER && o.laundry !== false) {
    const s = rng.sign();
    flank(s, rng.range(-p.halfD * 0.3, p.halfD * 0.5), (x, z, y) => {
      ctx.add(makeLaundryPole({ ctx,
        x, z, y, ry: p.ry + Math.PI / 2, len: 2.2, n: rng.int(3, 4), seed: (o.seed ?? 1) + 16,
      }));
    });
  }
  if (DRESS_CLUTTER && o.rack) {
    flank(o.rack < 0 ? -1 : 1, -p.halfD * 0.1, (x, z, y) => {
      // authored facing +z with its bars along x, so the same quarter turn the
      // drying pole needs puts it parallel to the flank
      ctx.add(makeDryingRack({ x, z, y, ry: p.ry + Math.PI / 2, seed: (o.seed ?? 1) + 17 }));
    });
  }
  if (o.shed) {
    flank(o.shed < 0 ? -1 : 1, -p.halfD * 0.55, (x, z, y, s) => {
      const sh = makeStorageShed({ x, z, y, ry: p.flankRy(s), w: 1.3, d: 0.7, h: 1.62 });
      ctx.add(sh);
      const ry = p.flankRy(s);
      const ca = Math.abs(Math.cos(ry));
      const sa = Math.abs(Math.sin(ry));
      const hw = (ca * 1.3 + sa * 0.7) / 2;
      const hd = (sa * 1.3 + ca * 0.7) / 2;
      ctx.collide(x - hw, z - hd, x + hw, z + hd, y + (sh.userData.top ?? 1.7));
    });
  }
  if (DRESS_CLUTTER && o.garden) {
    flank(o.garden < 0 ? -1 : 1, -p.halfD * 0.05, (x, z, y) => {
      // the bed runs along the flank, so its 0.9 m depth is what stands off the
      // wall -- at `p.ry` its 1.5 m length points out of the plot instead
      ctx.add(makeKitchenGarden({ x, z, y, ry: p.ry + Math.PI / 2, w: 1.5, d: 0.9, seed: (o.seed ?? 1) + 18 }));
    });
  }
  if (DRESS_CLUTTER && o.tap) {
    flank(o.tap < 0 ? -1 : 1, p.halfD * 0.55, (x, z, y, s) => {
      ctx.add(makeTapPost({ x, z, y, ry: p.flankRy(s) }));
      const [du, dv] = o.tapBucketOffset ?? [0.34, 0];
      ctx.add(makeBucket({
        x: x + du * p.lx + dv * p.fx,
        z: z + du * p.lz + dv * p.fz,
        y, ry: rng.range(0, 3), water: rng.chance(0.5),
      }));
    });
  }
  if (DRESS_CLUTTER && o.crates) {
    flank(o.crates < 0 ? -1 : 1, -p.halfD * 0.75, (x, z, y) => {
      ctx.add(makeCrates({ x, z, y, n: rng.int(2, 3), seed: (o.seed ?? 1) + 19, ry: rng.range(-0.3, 0.3) }));
    });
  }
  if (DRESS_CLUTTER && o.meterLid) {
    const [x, z] = p.at(doorAt + 1.5, p.halfD + 0.7);
    if (clear(x, z)) ctx.add(makeWaterMeter({ x, z, y: gy(x, z), ry: p.outRy }));
  }
  return p;
}

/* ------------------------------------------------------------------ *
 * Lane furniture.
 * ------------------------------------------------------------------ */

/**
 * What a lane too narrow for kerbs has instead of gutters: a slotted channel
 * down one side, a manhole or two, and the patched squares left by whoever dug
 * the water main up.
 */
export function laneGutter(ctx, o) {
  const m = mats();
  const gm = groundMats();
  const axis = o.axis ?? 'z';
  const from = Math.min(o.from, o.to);
  const to = Math.max(o.from, o.to);
  const at = o.at;
  const y = o.y;
  const parts = [];
  const n = Math.max(2, Math.round((to - from) / (o.pitch ?? 0.9)));
  for (let i = 0; i < n; i++) {
    const u = from + (i + 0.5) * ((to - from) / n);
    const yy = (y !== undefined ? y : groundY(axis === 'z' ? u : at)) + 0.055;
    parts.push({
      geometry: new THREE.BoxGeometry(axis === 'z' ? 0.3 : 0.7, 0.04, axis === 'z' ? 0.7 : 0.3),
      matrix: axis === 'z' ? trs(at, yy, u) : trs(u, yy, at),
    });
  }
  const ch = new THREE.Mesh(bake(parts), m.drain);
  ch.receiveShadow = true;
  ctx.add(ch);
  for (const u of o.manholes ?? []) {
    const x = axis === 'z' ? at + (o.manholeOff ?? 0.5) : u;
    const z = axis === 'z' ? u : at + (o.manholeOff ?? 0.5);
    const mh = cyl(0.3, 0.3, 0.04, 12, cel({ color: PAL.metalDark, bands: 3 }),
      x, (y !== undefined ? y : groundY(z)) + 0.07, z);
    mh.receiveShadow = true;
    ctx.add(mh);
  }
  for (const [px, pz, pw, pd] of o.patches ?? []) {
    const s = box(pw, 0.02, pd, gm.asphalt, px, (y !== undefined ? y : groundY(pz)) + 0.065, pz);
    s.receiveShadow = true;
    s.userData.noOutline = true;
    ctx.add(s);
  }
  return ch;
}

/** The bollards at a lane mouth -- what stops a lane being a road. */
export function bollardRow(ctx, o) {
  const m = mats();
  const n = o.n ?? 3;
  const axis = o.axis ?? 'x';
  for (let i = 0; i < n; i++) {
    const t = o.from + (o.to - o.from) * (n === 1 ? 0.5 : i / (n - 1));
    const x = axis === 'x' ? t : o.at;
    const z = axis === 'x' ? o.at : t;
    const y = o.y !== undefined ? o.y : groundY(z);
    const b = cyl(0.055, 0.065, 0.78, 8, m.metal, x, y + 0.39, z);
    b.castShadow = true;
    ctx.add(b);
    ctx.add(cyl(0.06, 0.06, 0.12, 8, cel({ color: PAL.red, bands: 3, tint: 0x7a4060 }), x, y + 0.7, z));
  }
}

/**
 * A street-name plate at the mouth of a lane, plus the convex mirror and the
 * 徐行 plate that go with a blind corner.
 *
 * The plate is 1.1 x 0.28 m because `laneNamePlate` is 512 x 128 and a decal
 * whose aspect does not match the face it lands on renders as a smear, not as
 * an error -- see the `alleyPlate` note in CLAUDE.md.
 */
export function laneSign(ctx, o) {
  const m = mats();
  const y = o.y !== undefined ? o.y : groundY(o.z);
  const H = o.h ?? 2.1;
  const post = cyl(0.045, 0.045, H, 8, m.metalDark, o.x, y + H / 2, o.z);
  post.castShadow = true;
  ctx.add(post);
  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 0.28, 0.05),
    [flat({ color: PAL.wallWhite }), flat({ color: PAL.wallWhite }),
     flat({ color: PAL.wallWhite }), flat({ color: PAL.wallWhite }),
     flat({ color: 0xffffff, map: laneNamePlate(o.variant ?? 0), cache: false }),
     flat({ color: PAL.wallGray })]
  );
  /* The stand-off has to be taken along the plate's *own* normal, not along
   * world z.  Written as `o.z + 0.03` it only cleared the post at ry ~ 0: turn
   * the plate a quarter and the offset slides it sideways instead of forward,
   * so the 0.045 m post comes through the printed face and takes a vertical bar
   * out of the middle of the name -- the same trap `makeSignPost` records.
   * 0.05 m of stand-off puts the mapped face 0.075 m off the axis against a
   * 0.045 m post, which clears at every yaw. */
  const ry = o.ry ?? 0;
  plate.position.set(o.x + Math.sin(ry) * 0.05, y + H - 0.14, o.z + Math.cos(ry) * 0.05);
  plate.rotation.y = ry;
  plate.castShadow = true;
  ctx.add(plate);
  hullOutline(plate, { thickness: 0.0028 });
  ctx.collide(o.x - 0.16, o.z - 0.16, o.x + 0.16, o.z + 0.16, y + H);
  if (o.mirror) {
    ctx.add(makeMirror({ x: o.x + (o.mirrorAt?.[0] ?? 0.4), z: o.z + (o.mirrorAt?.[1] ?? 0), y, ry: o.mirrorRy ?? 0 }));
  }
  if (o.slow) {
    ctx.add(makeSignPost({
      x: o.x + (o.slowAt?.[0] ?? -0.9), z: o.z + (o.slowAt?.[1] ?? 0), y, ry: o.slowRy ?? 0,
      h: 2.1, postMat: m.metal,
      plates: [{ map: warningPlate(2), w: 0.44, h: 0.6, y: 1.7, double: true }],
    }));
  }
}

/* ------------------------------------------------------------------ *
 * Poles and cabling.
 * ------------------------------------------------------------------ */

/**
 * A cut-down utility pole: no transformer bank, no lamp arm, no plate wrap.
 *
 * `makePole` in `props.js` is the *crossing's* pole and it is big -- a
 * transformer pair and a plate wrap, which is right on a main street and much
 * too much furniture for a three-metre residential lane.  This is a shaft, two
 * crossarms and their insulators, which is all a lane like this has.
 *
 * Lives here rather than in `northblock.js` because six new blocks need it and
 * two copies of the same assembly is exactly how both copies of the bicycle
 * ended up with the fork 0.3 m short of the front hub.
 */
export function makePoleLite(o = {}) {
  const m = mats();
  const g = new THREE.Group();
  const H = o.h ?? 8.4;
  const parts = { pole: [], dark: [], white: [], metal: [] };
  const push = (k, geo, mx) => parts[k].push({ geometry: geo, matrix: mx });
  push('pole', new THREE.CylinderGeometry(0.1, 0.17, H, 8), trs(0, H / 2, 0));
  push('pole', new THREE.CylinderGeometry(0.22, 0.26, 0.2, 8), trs(0, 0.1, 0));
  const dir = o.armDir ?? 1;
  [H - 0.6, H - 1.5].forEach((y, ai) => {
    const len = ai === 0 ? 1.9 : 1.5;
    push('dark', new THREE.BoxGeometry(0.08, 0.09, len), trs(0, y, 0));
    push('metal', new THREE.BoxGeometry(0.05, 0.44, 0.05), trs(0, y - 0.27, 0));
    for (let i = -1; i <= 1; i++) {
      if (i === 0 && ai === 1) continue;
      push('white', new THREE.CylinderGeometry(0.055, 0.07, 0.15, 7), trs(0, y + 0.12, (i * len) / 2.4));
    }
  });
  push('dark', new THREE.CylinderGeometry(0.04, 0.04, H - 1.6, 5), trs(dir * 0.125, (H - 1.6) / 2, 0.055));
  if (o.lamp) {
    // the one-arm street lamp a lane gets, on the side the arm points
    push('metal', new THREE.BoxGeometry(0.06, 0.06, 0.8), trs(0, H - 2.6, dir * 0.4));
    push('metal', new THREE.CylinderGeometry(0.055, 0.055, 0.5, 8), trs(0, H - 2.6, dir * 0.78));
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.2, 12, 1, true), m.metal);
    shade.position.set(0, H - 2.72, dir * 0.78);
    g.add(shade);
    const lens = box(0.2, 0.05, 0.2, flat({ color: 0xfff2d0 }), 0, H - 2.84, dir * 0.78);
    lens.userData.noOutline = true;
    g.add(lens);
  }
  const matFor = {
    pole: cel({ color: 0xd6d2d8, bands: 3, tint: 0x6a6288 }),
    dark: cel({ color: PAL.black, bands: 2, tint: 0x4b4560 }),
    white: cel({ color: PAL.wallWhite, bands: 3, tint: 0x6f6790 }),
    metal: m.metal,
  };
  for (const key of Object.keys(parts)) {
    if (!parts[key].length) continue;
    const mesh = new THREE.Mesh(bake(parts[key]), matFor[key]);
    mesh.castShadow = true;
    g.add(mesh);
    if (key === 'pole') hullOutline(mesh, { thickness: 0.0034 });
  }
  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  return g;
}

/**
 * A run of lane poles with the cables strung between them.
 *
 * A residential lane with no wires over it looks like a render rather than a
 * street, and the cables are cheap: every run in the district is baked into one
 * mesh.  `chains` are index paths through `defs`; `drops` are service cables
 * into a building, each `[index, [x, y, z]]` with the target in world space.
 */
export function poleRun(ctx, o) {
  const wires = [];
  const tops = (o.defs ?? []).map((d) => {
    const y = d.y !== undefined ? d.y : groundY(d.z);
    ctx.add(makePoleLite({ ...d, y }));
    ctx.collide(d.x - 0.2, d.z - 0.2, d.x + 0.2, d.z + 0.2, y + (d.h ?? 8.4));
    return new THREE.Vector3(d.x, y + (d.h ?? 8.4) - 0.7, d.z);
  });
  for (const chain of o.chains ?? []) {
    for (const [dy, dz] of o.offsets ?? [[0, -0.5], [-0.45, 0.3]]) {
      for (let i = 0; i < chain.length - 1; i++) {
        const a = tops[chain[i]], b = tops[chain[i + 1]];
        if (!a || !b) continue;
        wires.push({
          a: a.clone().add(new THREE.Vector3(0, dy, dz)),
          b: b.clone().add(new THREE.Vector3(0, dy, dz)),
        });
      }
    }
  }
  for (const [i, target] of o.drops ?? []) {
    if (!tops[i]) continue;
    wires.push({ a: tops[i].clone().add(new THREE.Vector3(0, -1.6, 0)), b: new THREE.Vector3(...target) });
  }
  if (wires.length) {
    const geos = wires.map((r) => new THREE.TubeGeometry(sagCurve(r.a, r.b, o.sag ?? 0.5, 14), 16, 0.022, 4, false));
    const mesh = new THREE.Mesh(bake(geos.map((geometry) => ({ geometry }))),
      cel({ color: 0x4c4658, bands: 2, tint: 0x413c58 }));
    ctx.add(mesh);
    geos.forEach((g) => g.dispose());
  }
  return tops;
}
