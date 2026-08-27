import * as THREE from 'three';
import { PAL } from '../core/palette.js';
import { cel, flat } from '../core/toon.js';
import {
  warningPlate, shrinePlate, platePlate, corkBoard, paperSheet, mirrored,
  phoneBoxSign, phoneNotice, guideBoard, returnPlate, chainLinkTex,
} from '../core/textures.js';
import { box, cyl, bake, trs, rngKit, sagCurve, shadowify } from '../core/util.js';
import { hullOutline } from '../core/outline.js';
import { centerX, groundY, ROAD_HALF, WALK_W, WALK_H } from './street.js';

/* ------------------------------------------------------------------ *
 * Street furniture.
 *
 * Utility poles and their web of overhead cable, a convex mirror, a kei
 * truck, bicycles, a post box, a roadside shrine, a cat, cones,
 * guardrails, planters.  Each one is placed to do a job in the frame --
 * break a silhouette, lead the eye, or fill a dead corner -- rather than
 * to fill space.
 * ------------------------------------------------------------------ */

const M = {};
function mats() {
  if (M.pole) return M;
  M.pole = cel({ color: 0xd6d2d8, bands: 3, tint: 0x6a6288 });
  M.metal = cel({ color: PAL.metal, bands: 3, tint: 0x666090 });
  M.metalDark = cel({ color: PAL.metalDark, bands: 3, tint: 0x5c5680 });
  M.dark = cel({ color: PAL.black, bands: 2, tint: 0x4b4560 });
  M.wire = cel({ color: 0x4c4658, bands: 2, tint: 0x413c58 });
  M.red = cel({ color: PAL.red, bands: 3, tint: 0x7a4060 });
  M.white = cel({ color: PAL.wallWhite, bands: 3, tint: 0x6f6790 });
  M.concrete = cel({ color: PAL.concrete, bands: 3, tint: 0x6f6790 });
  M.concreteMid = cel({ color: PAL.concreteMid, bands: 3, tint: 0x6a6288 });
  M.terracotta = cel({ color: 0xc57a5a, bands: 3, tint: 0x6f5680 });
  M.leaf = cel({ color: PAL.leaf, bands: 3, tint: 0x5b6f8c });
  M.leafDeep = cel({ color: PAL.leafDeep, bands: 3, tint: 0x5b6f8c });
  return M;
}

/** A local member after yaw. skipFit so a post cannot grow into a bay. */
function yawCollide(ctx, ox, oz, y, ry, lx, lz, hw, hh, top, bot) {
  const ca = Math.cos(ry);
  const sa = Math.sin(ry);
  const px = ox + ca * lx - sa * lz;
  const pz = oz + sa * lx + ca * lz;
  ctx.collide(px - hw, pz - hh, px + hw, pz + hh, y + top, y + bot, true);
}

/** World AABB of a local-x slab after yaw. Height-only so the bay under it stays air. */
function yawSlab(ctx, ox, oz, y, ry, halfAlong, halfThick, top, bot) {
  const ca = Math.cos(ry);
  const sa = Math.sin(ry);
  const hw = Math.abs(ca) * halfAlong + Math.abs(sa) * halfThick;
  const hd = Math.abs(sa) * halfAlong + Math.abs(ca) * halfThick;
  ctx.collide(ox - hw, oz - hd, ox + hw, oz + hd, y + top, y + bot, true);
}

/*
 * Freestyle strip. Ornaments that closed gaps a quad should fly: planters,
 * crates, buckets, bikes against a wall, cones, laundry, kerb benches,
 * bike racks and recycle bins. A corridor with furniture in it is a
 * corridor you cannot thread. Pass keep: true to opt one instance back
 * in (the school bike shed). Empty group so every call site still
 * compiles and the cover pass sees no mesh, so no phantom box.
 */
export function skipClutter(o) {
  return !o || o.keep !== true;
}
export function strippedGroup() {
  const g = new THREE.Group();
  g.name = 'strippedClutter';
  return g;
}

/* ------------------------------- utility pole ------------------------------- */

export function makePole(o = {}) {
  const m = mats();
  const rng = rngKit(o.seed ?? 5);
  const g = new THREE.Group();
  const H = o.h ?? 9.2;
  const parts = { pole: [], metal: [], dark: [], white: [] };
  const push = (k, geo, mx) => parts[k].push({ geometry: geo, matrix: mx });

  push('pole', new THREE.CylinderGeometry(0.11, 0.19, H, 8), trs(0, H / 2, 0));
  push('pole', new THREE.CylinderGeometry(0.24, 0.28, 0.22, 8), trs(0, 0.11, 0));

  // crossarms with insulators
  const armYs = o.armYs ?? [H - 0.55, H - 1.5];
  const armDir = o.armDir ?? 1;
  armYs.forEach((y, ai) => {
    const len = ai === 0 ? 2.1 : 1.7;
    push('dark', new THREE.BoxGeometry(0.09, 0.1, len), trs(0, y, 0));
    push('metal', new THREE.BoxGeometry(0.06, 0.5, 0.06), trs(0, y - 0.3, 0));
    for (let i = -1; i <= 1; i++) {
      if (i === 0 && ai === 1) continue;
      push('white', new THREE.CylinderGeometry(0.06, 0.075, 0.16, 7),
        trs(0, y + 0.13, (i * len) / 2.4));
      push('metal', new THREE.CylinderGeometry(0.02, 0.02, 0.14, 5), trs(0, y + 0.04, (i * len) / 2.4));
    }
  });

  // transformer cans
  if (o.transformer !== false) {
    const ty = H - 2.9;
    push('metal', new THREE.BoxGeometry(0.5, 0.14, 1.5), trs(armDir * 0.34, ty + 0.62, 0));
    for (const dz of [-0.42, 0.42]) {
      push('metal', new THREE.CylinderGeometry(0.24, 0.24, 0.72, 10), trs(armDir * 0.34, ty + 0.24, dz));
      push('metal', new THREE.CylinderGeometry(0.26, 0.26, 0.06, 10), trs(armDir * 0.34, ty + 0.62, dz));
    }
    push('dark', new THREE.BoxGeometry(0.28, 0.5, 0.28), trs(-armDir * 0.24, ty + 1.1, 0));
  }

  // cable bundle running up the street-facing side of the pole
  push('dark', new THREE.CylinderGeometry(0.045, 0.045, H - 1.4, 5),
    trs(armDir * 0.135, (H - 1.4) / 2, 0.06));

  /* A warning plate strapped to the pole.  Two things matter here: the radius
   * has to clear the pole at that height (the taper runs 0.19 -> 0.11, so a
   * 0.16 plate only shows as slivers), and it has to face the road -- which is
   * +X for a pole on the left kerb and -X for one on the right. */
  const plate = new THREE.Mesh(
    new THREE.CylinderGeometry(0.205, 0.21, 0.62, 12, 1, true, -1.0, 2.0),
    flat({ color: 0xffffff, map: warningPlate(rng.int(0, 2)), cache: false, side: THREE.DoubleSide })
  );
  plate.position.set(0, 2.45, 0);
  plate.rotation.y = o.plateFace ?? (armDir > 0 ? Math.PI / 2 : -Math.PI / 2);
  plate.castShadow = true;
  g.add(plate);

  // street lamp arm
  if (o.lamp) {
    push('metal', new THREE.CylinderGeometry(0.05, 0.05, 1.3, 6), trs(armDir * 0.65, H - 3.9, 0, 0, 0, Math.PI / 2));
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.26, 12, 1, true), m.metal);
    shade.position.set(armDir * 1.28, H - 4.02, 0);
    g.add(shade);
    const bulb = box(0.26, 0.05, 0.26, flat({ color: 0xfff2d0 }), armDir * 1.28, H - 4.16, 0);
    g.add(bulb);
  }

  const matFor = { pole: m.pole, metal: m.metal, dark: m.dark, white: m.white };
  for (const key of Object.keys(parts)) {
    if (!parts[key].length) continue;
    const mesh = new THREE.Mesh(bake(parts[key]), matFor[key]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
    if (key === 'pole') hullOutline(mesh, { thickness: 0.0034 });
  }

  g.position.set(o.x, o.y ?? 0, o.z);
  g.userData.top = (o.y ?? 0) + H;
  return g;
}

/** Sagging cable runs between a list of world-space anchor points. */
export function makeWires(ctx, runs) {
  const m = mats();
  const geos = [];
  for (const run of runs) {
    const { points, sag = 0.5, r = 0.026 } = run;
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const dist = a.distanceTo(b);
      const curve = sagCurve(a, b, sag * Math.min(1.6, dist / 14), 12);
      geos.push(new THREE.TubeGeometry(curve, 14, r, 4, false));
    }
  }
  if (!geos.length) return null;
  const merged = geos.length === 1 ? geos[0] : bake(geos.map((geometry) => ({ geometry })));
  const mesh = new THREE.Mesh(merged, m.wire);
  mesh.name = 'wires';
  // thin geometry: keep it out of the depth buffer so the ink pass ignores it
  mesh.material = m.wire;
  ctx.add(mesh);
  geos.forEach((gg) => gg !== merged && gg.dispose());
  return mesh;
}

/* -------------------------------- kei truck -------------------------------- */

/**
 * 軽トラック -- the flatbed.
 *
 * The hero one stands beyond the crossing in the opening frame and is yellow;
 * `vehicles.js` calls this for every other one in the world, which is why the
 * colour and the load are options rather than constants.  One construction:
 * a second copy of an assembly is how both copies of the bicycle ended up with
 * the fork 0.3 m short of the front hub.
 *
 * `hero` is the inverted-hull shell.  It is on by default because the original
 * caller is one of the four hero props the README names, and off for the
 * parked ones -- fifty extra shells is fifty extra draw calls.
 *
 * `load`: 'crates' (the default), 'sheet' for a strapped-down tarpaulin, or
 * 'empty' for an open bed.
 */
export function makeKeiTruck(o = {}) {
  const m = mats();
  const g = new THREE.Group();
  const base = o.color ?? PAL.taxiYellow;
  const body = cel({ color: base, bands: 3, tint: 0x8f7050 });
  const bodyDeep = cel({
    color: o.color === undefined
      ? PAL.taxiYellowDeep
      : new THREE.Color(base).multiplyScalar(0.78).getHex(),
    bands: 3, tint: 0x8f7050,
  });
  const glass = flat({ color: PAL.glassDark });
  const L = 3.32, W = 1.46;
  const hero = o.hero !== false;

  // chassis + flatbed
  const chassis = box(L, 0.34, W, bodyDeep, 0, 0.68, 0);
  chassis.castShadow = chassis.receiveShadow = true;
  g.add(chassis);
  if (hero) hullOutline(chassis, { thickness: 0.0036 });

  // cab: forward control, so it sits over the front axle
  const cab = box(1.26, 1.06, W, body, L / 2 - 0.68, 1.38, 0);
  cab.castShadow = cab.receiveShadow = true;
  g.add(cab);
  if (hero) hullOutline(cab, { thickness: 0.0036 });
  // windscreen and side glass
  g.add(box(0.06, 0.62, W - 0.16, glass, L / 2 - 0.06, 1.62, 0));
  for (const s of [-1, 1]) {
    g.add(box(1.0, 0.56, 0.06, glass, L / 2 - 0.7, 1.6, s * (W / 2 - 0.02)));
  }
  g.add(box(1.3, 0.1, W + 0.06, bodyDeep, L / 2 - 0.68, 1.9, 0));   // roof lip
  g.add(box(0.08, 0.62, 0.07, bodyDeep, L / 2 - 0.08, 1.62, 0));    // centre pillar

  // load bed with drop sides
  const bedZ = -0.42;
  g.add(box(1.86, 0.06, W, cel({ color: 0xbba98c, bands: 3, tint: 0x6f6790 }), -0.62, 0.88, 0));
  for (const s of [-1, 1]) {
    g.add(box(1.86, 0.42, 0.07, body, -0.62, 1.06, s * (W / 2 - 0.03)));
  }
  g.add(box(0.07, 0.42, W, body, -1.55, 1.06, 0));
  /* What is on the bed.  An empty flatbed is a truck that has finished for the
   * day and a loaded one is a truck at work, so the two are worth having: the
   * hero keeps its crates, the one behind the bakery carries a sheet, and the
   * one on the allotment lane is empty. */
  const load = o.load ?? 'crates';
  if (load === 'crates') {
    for (let i = 0; i < 3; i++) {
      const c = box(0.42, 0.26, 0.34, cel({ color: i === 1 ? PAL.crate : PAL.crateAlt, bands: 3, tint: 0x4a4a92 }),
        -0.35 - i * 0.15, 1.04 + i * 0.26, i % 2 ? 0.08 : -0.08);
      c.castShadow = true;
      g.add(c);
    }
  } else if (load === 'sheet') {
    /* A tarpaulin over something, roped down: one low mass with a slightly
     * wider skirt reads as sheeted, where a plain box on the bed reads as a
     * box on the bed. */
    const sheet = cel({ color: 0x8fa2b4, bands: 3, tint: 0x5c5680 });
    const s1 = box(1.5, 0.4, W - 0.18, sheet, -0.62, 1.11, 0);
    s1.castShadow = s1.receiveShadow = true;
    g.add(s1);
    g.add(box(1.62, 0.07, W - 0.06, cel({ color: 0x7e8fa0, bands: 3, tint: 0x5c5680 }), -0.62, 0.94, 0));
    for (const dx of [-1.12, -0.62, -0.12]) {
      g.add(box(0.05, 0.44, W - 0.14, cel({ color: PAL.rope, bands: 3, tint: 0x6f6790 }), dx, 1.11, 0));
    }
  }

  // wheels
  const wheelGeo = new THREE.CylinderGeometry(0.29, 0.29, 0.2, 12);
  wheelGeo.rotateX(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.22, 10);
  hubGeo.rotateX(Math.PI / 2);
  for (const wx of [L / 2 - 0.72, -L / 2 + 0.6]) {
    for (const s of [-1, 1]) {
      const w = new THREE.Mesh(wheelGeo, m.dark);
      w.position.set(wx, 0.29, s * (W / 2 - 0.06));
      w.castShadow = true;
      g.add(w);
      const h = new THREE.Mesh(hubGeo, cel({ color: 0xe8e6ea, bands: 2, tint: 0x6f6790 }));
      h.position.set(wx, 0.29, s * (W / 2 - 0.02));
      g.add(h);
      // wheel arch
      g.add(box(0.72, 0.1, 0.1, bodyDeep, wx, 0.62, s * (W / 2 + 0.01)));
    }
  }

  // lights, bumper, mirrors, plate
  for (const s of [-1, 1]) {
    g.add(box(0.06, 0.16, 0.26, flat({ color: 0xfff4d8 }), L / 2 + 0.01, 1.0, s * 0.48));
    g.add(box(0.06, 0.13, 0.2, flat({ color: 0xf06050 }), -L / 2 - 0.01, 1.0, s * 0.48));
    const mir = box(0.05, 0.16, 0.11, m.dark, L / 2 - 0.5, 1.92, s * (W / 2 + 0.16));
    g.add(mir);
    g.add(box(0.04, 0.04, 0.2, m.metalDark, L / 2 - 0.5, 1.86, s * (W / 2 + 0.08)));
  }
  g.add(box(0.1, 0.16, W - 0.1, m.metal, L / 2 + 0.03, 0.78, 0));
  g.add(box(0.1, 0.16, W - 0.1, m.metal, -L / 2 - 0.03, 0.78, 0));
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.2),
    flat({ color: 0xffffff, map: platePlate(), cache: false }));
  plate.position.set(-L / 2 - 0.05, 0.95, 0);
  plate.rotation.y = -Math.PI / 2;
  g.add(plate);

  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  return g;
}

/* --------------------------------- bicycle --------------------------------- */

/* ------------------------------------------------------------------ *
 * The bicycle.
 *
 * One definition, shared by `makeBicycle` for a single parked bike and by
 * `makeBikeRack` for a row of them.  It used to be two independent lists of
 * five cylinders positioned by eye, and neither of them joined up: the fork
 * stopped 0.3 m short of the front hub and behind it, the "seat stay" was
 * centred on the rear hub so it ran straight through the wheel and out the
 * far side, and there were no chain stays at all.  Two of these are parked in
 * the opening frame.
 *
 * Building it from *joints* rather than from bar positions makes that class of
 * mistake impossible: every member is drawn between two named points, so a
 * shared end is shared by construction and cannot drift.
 *
 * A 26" city frame -- 1.07 m wheelbase, 68 degree head angle -- because that
 * is what every bicycle in a Japanese suburb is.
 * ------------------------------------------------------------------ */
const V3 = (x, y, z = 0) => new THREE.Vector3(x, y, z);
// The faceted tyre sits about 16 mm below the authored ground plane.  The rear
// wheel is the visible offender in long rows, so lift that assembly just enough
// to clear without floating the front contact patch or changing the silhouette.
const BIKE_REAR_LIFT = 0.018;
const BIKE = {
  R: 0.33,               // wheel radius
  A: V3(-0.52, 0.33 + BIKE_REAR_LIFT), // rear hub
  B: V3(0.55, 0.33),     // front hub
  BB: V3(-0.10, 0.28),   // bottom bracket
  SC: V3(-0.27, 0.86),   // seat cluster: seat tube / top tube / seat stays
  HB: V3(0.44, 0.60),    // fork crown = head tube bottom
  HT: V3(0.49, 0.86),    // head tube top
  BAR: V3(0.46, 0.97),   // handlebar centre
  SAD: V3(-0.31, 1.00),  // saddle
};

let bikeCache = null;
/** Baked bicycle geometry, split by material: `{ dark, frame, brite }`. */
export function bicycleGeometry() {
  if (bikeCache) return bikeCache;
  const P = BIKE, R = P.R;
  const unit = new THREE.CylinderGeometry(1, 1, 1, 6, 1);
  const up = V3(0, 1, 0);
  const dark = [], frame = [], brite = [], briteTwoSide = [];
  /** A tube between two joints. Shared endpoints are literally the same point. */
  const tube = (arr, a, b, r) => {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    if (len < 1e-4) return;
    arr.push({
      geometry: unit,
      matrix: new THREE.Matrix4().compose(
        new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5),
        new THREE.Quaternion().setFromUnitVectors(up, dir.clone().normalize()),
        V3(r, len, r)
      ),
    });
  };
  const at = (arr, geo, p, rx = 0, ry = 0, rz = 0) => arr.push({
    geometry: geo, matrix: trs(p.x, p.y, p.z, rx, ry, rz),
  });

  /* ------------------------------- wheels ------------------------------- */
  const rim = new THREE.TorusGeometry(R, 0.021, 5, 18);
  const guard = new THREE.TorusGeometry(R + 0.055, 0.018, 4, 10, Math.PI * 0.78);
  for (const hub of [P.A, P.B]) {
    at(dark, rim, hub);
    at(dark, new THREE.CylinderGeometry(0.035, 0.035, 0.085, 6), hub, Math.PI / 2);
    // mudguard: the arc is swept from +x, so it needs backing off to sit on top
    at(frame, guard, hub, 0, 0, Math.PI * 0.11);
  }

  /* -------------------------------- frame -------------------------------- */
  tube(frame, P.BB, P.SC, 0.026);      // seat tube
  tube(frame, P.BB, P.HB, 0.028);      // down tube
  tube(frame, P.HB, P.HT, 0.030);      // head tube
  tube(frame, P.SC, P.HT, 0.024);      // top tube
  for (const s of [-1, 1]) {
    const rear = V3(P.A.x, P.A.y, s * 0.052);
    tube(frame, P.BB, rear, 0.019);    // chain stays, to the hub and no further
    tube(frame, P.SC, rear, 0.017);    // seat stays
    tube(brite, V3(P.HB.x, P.HB.y, s * 0.045), V3(P.B.x, P.B.y, s * 0.05), 0.017);  // fork blades
  }

  /* --------------------------- bars and saddle --------------------------- */
  tube(brite, P.SC, P.SAD, 0.019);     // seat post, out of the seat cluster
  at(dark, new THREE.BoxGeometry(0.23, 0.055, 0.12), V3(P.SAD.x - 0.02, P.SAD.y + 0.04));
  tube(brite, P.HT, P.BAR, 0.021);     // stem
  at(brite, new THREE.CylinderGeometry(0.019, 0.019, 0.54, 6), P.BAR, Math.PI / 2);
  for (const s of [-1, 1]) {           // grips
    at(dark, new THREE.CylinderGeometry(0.023, 0.023, 0.1, 6), V3(P.BAR.x, P.BAR.y, s * 0.22), Math.PI / 2);
  }
  at(dark, new THREE.CylinderGeometry(0.028, 0.028, 0.03, 8), V3(P.BAR.x - 0.05, P.BAR.y + 0.03, -0.12));  // bell

  /* ---------------------------- drive and stand ---------------------------- */
  at(dark, new THREE.CylinderGeometry(0.075, 0.075, 0.012, 12), P.BB, Math.PI / 2);   // chainring
  for (const s of [-1, 1]) {
    const crank = V3(P.BB.x + s * 0.02, P.BB.y - s * 0.15, s * 0.075);
    tube(brite, V3(P.BB.x, P.BB.y, s * 0.075), crank, 0.013);
    at(dark, new THREE.BoxGeometry(0.09, 0.02, 0.05), V3(crank.x, crank.y, s * 0.105));  // pedal
  }
  tube(brite, V3(-0.16, 0.26, 0.06), V3(-0.30, 0.015, 0.13), 0.014);                 // kickstand

  /* ------------------------------ rear rack ------------------------------
   * Clear of the mudguard, not through the wheel.  The tyre crown is at
   * hub + R + 0.021 = 0.681 and the guard reaches 0.055 + 0.018 beyond that,
   * so anything below 0.755 cuts straight through the back wheel -- which is
   * exactly what a rack at R + 0.30 = 0.63 did. */
  const rackY = R + 0.43;
  at(brite, new THREE.BoxGeometry(0.29, 0.022, 0.15), V3(P.A.x + 0.02, rackY));
  for (const s of [-1, 1]) {
    tube(brite, V3(P.A.x + 0.13, rackY, s * 0.068), V3(P.SC.x + 0.03, P.SC.y - 0.09, s * 0.03), 0.011);
    tube(brite, V3(P.A.x - 0.11, rackY, s * 0.068), V3(P.A.x + 0.02, P.A.y + 0.04, s * 0.055), 0.011);
  }

  /* ------------------------- basket and front light -------------------------
   * Ahead of the bars and clear above the mudguard.  At (0.60, 0.80) it had the
   * stem passing through its rim and the front guard poking up through its
   * floor; at (0.69, 0.87) the floor sits at 0.77, which is 0.04 over the guard
   * crown, and the rim is forward of the stem.
   *
   * `DoubleSide` and a floor, because an open-ended cylinder with backface
   * culling is a basket you can see straight through to the scene behind. */
  const BX = 0.69, BY = 0.87;
  at(briteTwoSide, new THREE.CylinderGeometry(0.16, 0.12, 0.2, 8, 1, true), V3(BX, BY));
  at(brite, new THREE.CylinderGeometry(0.12, 0.12, 0.016, 8), V3(BX, BY - 0.095));
  at(brite, new THREE.TorusGeometry(0.16, 0.012, 4, 10), V3(BX, BY + 0.1), Math.PI / 2);
  // two stays back to the bars and the fork crown, so it is carried by something
  tube(brite, V3(BX - 0.12, BY + 0.08), V3(P.BAR.x + 0.02, P.BAR.y - 0.03), 0.012);
  tube(brite, V3(BX - 0.05, BY - 0.1), V3(P.HB.x + 0.02, P.HB.y + 0.02), 0.012);
  at(dark, new THREE.BoxGeometry(0.06, 0.05, 0.07), V3(0.52, 0.54));

  bikeCache = {
    dark: bake(dark), frame: bake(frame), brite: bake(brite), mesh: bake(briteTwoSide),
  };
  [unit, rim, guard].forEach((x) => x.dispose());
  return bikeCache;
}

/**
 * One parked bicycle.  Three baked meshes plus the spoke discs, instead of the
 * twenty separate ones this used to cost -- which is most of the draw-call win
 * `NEXT.md` had been asking for, since these are placed all over the district.
 *
 * `lean` rolls it about its own length, on an inner group.  It used to be set
 * on `rotation.z` of the outer group, which -- after the yaw -- pitched the
 * bicycle nose-up instead of leaning it over.
 */
export function makeBicycle(o = {}) {
  if (skipClutter(o)) return strippedGroup();
  const m = mats();
  const geo = bicycleGeometry();
  const g = new THREE.Group();
  const inner = new THREE.Group();
  g.add(inner);

  const frameMat = cel({ color: o.color ?? 0x3f6f9c, bands: 3, tint: 0x4a4a92 });
  const basketMat = cel({ color: PAL.metal, bands: 3, side: THREE.DoubleSide, tint: 0x666090 });
  for (const [key, mat] of [
    ['dark', m.dark], ['frame', frameMat], ['brite', m.metal], ['mesh', basketMat],
  ]) {
    const mesh = new THREE.Mesh(geo[key], mat);
    mesh.castShadow = true;
    inner.add(mesh);
  }
  // spokes as a faint disc: cheaper than spokes and reads right in silhouette
  for (const hub of [BIKE.A, BIKE.B]) {
    const sp = new THREE.Mesh(new THREE.CircleGeometry(BIKE.R - 0.035, 12),
      flat({ color: 0xc9c6d0, transparent: true, opacity: 0.32, depthWrite: false, cache: false }));
    sp.position.set(hub.x, hub.y, 0.002);
    sp.userData.noOutline = true;
    inner.add(sp);
  }

  inner.rotation.x = o.lean ?? 0;
  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  return g;
}

/* ------------------------------ convex mirror ------------------------------ */

export function makeMirror(o = {}) {
  const m = mats();
  const g = new THREE.Group();
  const H = o.h ?? 2.55;
  const post = cyl(0.055, 0.07, H, 8, m.metalDark, 0, H / 2, 0);
  post.castShadow = true;
  g.add(post);
  g.add(cyl(0.14, 0.16, 0.16, 8, m.concreteMid, 0, 0.08, 0));
  hullOutline(post, { thickness: 0.0032 });

  const R = o.r ?? 0.46;
  const backMat = cel({ color: PAL.mirrorBack, bands: 3, tint: 0x8f7050 });
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.1, 20), backMat);
  rim.rotation.x = Math.PI / 2;
  rim.position.set(0, H - 0.1, 0.06);
  rim.castShadow = true;
  g.add(rim);
  hullOutline(rim, { thickness: 0.0034 });
  // slightly convex face
  const face = new THREE.Mesh(
    new THREE.SphereGeometry(R * 2.1, 20, 10, 0, Math.PI * 2, 0, 0.24),
    cel({ color: PAL.mirrorFace, bands: 2, tint: 0x7d8fb0 })
  );
  face.rotation.x = -Math.PI / 2;
  face.position.set(0, H - 0.1, 0.11);
  g.add(face);
  // a sun glint
  const glint = new THREE.Mesh(new THREE.CircleGeometry(R * 0.3, 12),
    flat({ color: 0xffffff, transparent: true, opacity: 0.4, depthWrite: false, cache: false }));
  glint.position.set(-R * 0.3, H + 0.05, 0.2);
  glint.userData.noOutline = true;
  g.add(glint);
  // sun hood
  const hood = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.04, R + 0.04, 0.2, 20, 1, true, 0.6, 1.95), backMat);
  hood.rotation.x = Math.PI / 2;
  hood.position.set(0, H - 0.1, 0.12);
  g.add(hood);

  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  return g;
}

/* --------------------------------- post box --------------------------------- */

export function makePostBox(o = {}) {
  const m = mats();
  const g = new THREE.Group();
  const red = cel({ color: PAL.redDeep, bands: 3, tint: 0x7a4060 });
  g.add(cyl(0.28, 0.3, 0.16, 12, m.concreteMid, 0, 0.08, 0));
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 1.15, 14), red);
  body.position.set(0, 0.74, 0);
  body.castShadow = body.receiveShadow = true;
  g.add(body);
  hullOutline(body, { thickness: 0.0036 });
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), red);
  cap.position.set(0, 1.31, 0);
  cap.castShadow = true;
  g.add(cap);
  g.add(cyl(0.26, 0.26, 0.05, 14, cel({ color: PAL.red, bands: 3, tint: 0x7a4060 }), 0, 1.3, 0));
  // slot + collection door
  g.add(box(0.3, 0.07, 0.06, m.dark, 0, 1.14, 0.21));
  g.add(box(0.26, 0.34, 0.04, cel({ color: 0xb02c28, bands: 3, tint: 0x7a4060 }), 0, 0.62, 0.22));
  g.add(box(0.16, 0.1, 0.03, flat({ color: 0xf6f2e8 }), 0, 0.42, 0.235));
  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  return g;
}

/* ------------------------------ roadside shrine ------------------------------ */

export function makeShrine(o = {}) {
  const m = mats();
  const g = new THREE.Group();
  g.name = 'openFrame';
  // Mid-tone grey stone rather than near-white: a pale figure against a pale
  // plinth reads as one blank block from any distance.
  const stone = cel({ color: 0xada7b6, bands: 3, tint: 0x655d80 });
  const stoneDark = cel({ color: 0x8d8798, bands: 3, tint: 0x605878 });
  g.add(box(1.05, 0.16, 0.85, stoneDark, 0, 0.08, 0));
  g.add(box(0.85, 0.3, 0.68, stone, 0, 0.31, 0));
  g.add(box(0.9, 0.05, 0.72, stoneDark, 0, 0.48, 0));
  // the little figure
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.16, 0.4, 10), stone);
  body.position.set(0, 0.7, 0);
  body.castShadow = true;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.125, 12, 9), stone);
  head.position.set(0, 1.0, 0);
  head.castShadow = true;
  g.add(head);
  // a small stone halo behind the head, and the closed eyes
  const halo = new THREE.Mesh(new THREE.CircleGeometry(0.17, 14), stoneDark);
  halo.position.set(0, 1.0, -0.05);
  halo.rotation.y = Math.PI;
  g.add(halo);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.012, 0.01), cel({ color: 0x5f5768, bands: 2 }));
    eye.position.set(s * 0.04, 1.01, 0.122);
    g.add(eye);
  }
  // red bib, the offering that makes it unmistakably a jizo
  const bib = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.3),
    cel({ color: PAL.shrineBib, bands: 2, side: THREE.DoubleSide, tint: 0x7a4060 }));
  bib.position.set(0, 0.76, 0.14);
  bib.rotation.x = 0.16;
  bib.castShadow = true;
  g.add(bib);
  g.add(box(0.22, 0.035, 0.035, cel({ color: PAL.redDeep, bands: 2, tint: 0x7a4060 }), 0, 0.9, 0.1));
  // shelter
  const postMat = cel({ color: 0x8a6f5c, bands: 3, tint: 0x5c5680 });
  for (const sx of [-0.42, 0.42]) {
    for (const sz of [-0.3, 0.3]) {
      g.add(box(0.07, 1.24, 0.07, postMat, sx, 0.625, sz));
    }
  }
  for (const s of [-1, 1]) {
    const slab = box(0.72, 0.07, 0.78, cel({ color: PAL.roofSlate, bands: 3, tint: 0x514b70 }),
      s * 0.26, 1.32, 0);
    slab.rotation.z = -s * 0.42;
    slab.castShadow = true;
    g.add(slab);
  }
  g.add(box(0.14, 0.08, 0.84, cel({ color: PAL.roofSlate, bands: 3, tint: 0x514b70 }), 0, 1.44, 0));
  // offerings
  for (const sx of [-0.26, 0.26]) {
    g.add(cyl(0.06, 0.05, 0.11, 8, cel({ color: 0xe8e4d8, bands: 2 }), sx, 0.51, 0.2));
  }
  const flower = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09, 0),
    cel({ color: PAL.blossomDeep, bands: 2, tint: 0x8f7aa8 }));
  flower.position.set(-0.26, 0.63, 0.2);
  g.add(flower);
  // name plate
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.36),
    flat({ color: 0xffffff, map: shrinePlate(), cache: false }));
  plate.position.set(0.43, 0.75, 0.32);
  plate.rotation.y = 0.3;
  g.add(plate);

  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  const ctx = o.ctx;
  if (ctx && o.x != null && o.z != null) {
    const y = o.y ?? 0;
    const ca = Math.cos(o.ry ?? 0);
    const sa = Math.sin(o.ry ?? 0);
    const put = (lx, lz, hw, hh, top, bot, skip) => {
      const px = o.x + ca * lx - sa * lz;
      const pz = o.z + sa * lx + ca * lz;
      ctx.collide(px - hw, pz - hh, px + hw, pz + hh, y + top, y + bot, skip);
    };
    put(0, 0, 0.54, 0.44, 0.48, 0, true);
    for (const sx of [-0.42, 0.42]) {
      for (const sz of [-0.3, 0.3]) {
        put(sx, sz, 0.05, 0.05, 1.26, 0, true);
      }
    }
    put(0, 0, 0.55, 0.48, 1.48, 1.22, true);
  }
  return g;
}

/* ----------------------------------- cat ----------------------------------- */

export function makeCat(o = {}) {
  if (skipClutter(o)) return strippedGroup();
  const g = new THREE.Group();
  g.userData.planetRigid = true;   // idle animation drives its head and tail
  const fur = cel({ color: PAL.cat, bands: 3, tint: 0x7a6f96 });
  const furDark = cel({ color: PAL.catDark, bands: 3, tint: 0x6a5f86 });

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 9), fur);
  body.scale.set(1.0, 0.92, 1.35);
  body.position.set(0, 0.19, 0);
  body.castShadow = true;
  g.add(body);
  // dark saddle patch
  const patch = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), furDark);
  patch.scale.set(0.92, 0.6, 1.15);
  patch.position.set(0, 0.27, -0.03);
  g.add(patch);

  const head = new THREE.Group();
  head.position.set(0, 0.38, 0.18);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.115, 12, 9), fur);
  skull.scale.set(1, 0.95, 0.95);
  skull.castShadow = true;
  head.add(skull);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.09, 4), fur);
    ear.position.set(s * 0.062, 0.11, -0.01);
    ear.rotation.z = s * 0.2;
    head.add(ear);
  }
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), furDark);
    eye.position.set(s * 0.045, 0.015, 0.098);
    head.add(eye);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 5), cel({ color: 0xe0a0a8, bands: 2 }));
  nose.position.set(0, -0.022, 0.11);
  head.add(nose);
  g.add(head);

  // front legs
  for (const s of [-1, 1]) {
    g.add(cyl(0.035, 0.04, 0.16, 7, fur, s * 0.07, 0.08, 0.16));
  }
  // curled tail
  const tail = new THREE.Group();
  const tailCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.2, -0.2),
    new THREE.Vector3(0.06, 0.28, -0.3),
    new THREE.Vector3(0.16, 0.34, -0.26),
    new THREE.Vector3(0.2, 0.3, -0.14),
  ]);
  const tailMesh = new THREE.Mesh(new THREE.TubeGeometry(tailCurve, 14, 0.028, 5, false), furDark);
  tailMesh.castShadow = true;
  tail.add(tailMesh);
  g.add(tail);

  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  g.userData.head = head;
  g.userData.tail = tail;
  g.userData.body = body;
  return g;
}

/* ------------------------------ smaller props ------------------------------ */

export function makeCone(o = {}) {
  if (skipClutter(o)) return strippedGroup();
  const m = mats();
  const g = new THREE.Group();
  const orange = cel({ color: PAL.orange, bands: 3, tint: 0x8f6050 });
  g.add(box(0.34, 0.035, 0.34, cel({ color: 0xd8763c, bands: 3, tint: 0x8f6050 }), 0, 0.018, 0));
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.6, 10), orange);
  cone.position.set(0, 0.32, 0);
  cone.castShadow = true;
  g.add(cone);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.105, 0.09, 10), m.white);
  band.position.set(0, 0.36, 0);
  g.add(band);
  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.set(o.tilt ?? 0, o.ry ?? 0, 0);
  return g;
}

export function makeBarrier(o = {}) {
  const m = mats();
  const g = new THREE.Group();
  g.name = 'openFrame';
  const red = cel({ color: PAL.red, bands: 3, tint: 0x7a4060 });
  const len = o.len ?? 1.6;
  for (const s of [-1, 1]) {
    const post = cyl(0.045, 0.05, 1.0, 8, m.white, (s * len) / 2, 0.5, 0);
    post.castShadow = true;
    g.add(post);
    g.add(box(0.16, 0.05, 0.24, m.dark, (s * len) / 2, 0.025, 0));
    for (const y of [0.34, 0.72]) {
      g.add(cyl(0.052, 0.052, 0.2, 8, red, (s * len) / 2, y, 0));
    }
  }
  const bar = box(len, 0.09, 0.05, red, 0, 0.86, 0);
  bar.castShadow = true;
  g.add(bar);
  g.add(box(len - 0.1, 0.07, 0.04, m.white, 0, 0.62, 0));
  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  const ctx = o.ctx;
  if (ctx && o.x != null && o.z != null) {
    const y = o.y ?? 0;
    const ca = Math.cos(o.ry ?? 0);
    const sa = Math.sin(o.ry ?? 0);
    const put = (lx, lz, hw, hh, top, bot, skip) => {
      const px = o.x + ca * lx - sa * lz;
      const pz = o.z + sa * lx + ca * lz;
      ctx.collide(px - hw, pz - hh, px + hw, pz + hh, y + top, y + bot, skip);
    };
    const half = (o.len ?? 1.6) / 2;
    put(-half, 0, 0.06, 0.06, 1.0, 0, true);
    put(half, 0, 0.06, 0.06, 1.0, 0, true);
    put(0, 0, half + 0.04, 0.05, 0.92, 0.80, true);
    put(0, 0, half, 0.04, 0.68, 0.56, true);
  }
  return g;
}

export function makeGuardrail(o = {}) {
  const m = mats();
  const g = new THREE.Group();
  g.name = 'openFrame';
  const len = o.len ?? 6;
  const n = Math.max(2, Math.round(len / 2.0));
  const parts = [];
  for (let i = 0; i <= n; i++) {
    const t = -len / 2 + (len / n) * i;
    parts.push({ geometry: new THREE.BoxGeometry(0.11, 0.82, 0.11), matrix: trs(t, 0.41, 0) });
  }
  const beam = new THREE.Mesh(bake(parts), m.metalDark);
  beam.castShadow = true;
  g.add(beam);
  const rail = box(len, 0.26, 0.07, m.white, 0, 0.72, 0.02);
  rail.castShadow = true;
  g.add(rail);
  g.add(box(len, 0.05, 0.1, m.metal, 0, 0.72, 0.01));
  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  const ctx = o.ctx;
  if (ctx && o.x != null && o.z != null) {
    const y = o.y ?? 0;
    const ry = o.ry ?? 0;
    for (let i = 0; i <= n; i++) {
      const t = -len / 2 + (len / n) * i;
      yawCollide(ctx, o.x, o.z, y, ry, t, 0, 0.07, 0.07, 0.82, 0);
    }
    yawSlab(ctx, o.x, o.z, y, ry, len / 2 + 0.04, 0.06, 0.86, 0.58);
  }
  return g;
}

export function makePlanter(o = {}) {
  if (skipClutter(o)) return strippedGroup();
  const m = mats();
  const rng = rngKit(o.seed ?? 3);
  const g = new THREE.Group();
  const r = o.r ?? 0.2;
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.78, r * 1.5, 10), m.terracotta);
  pot.position.set(0, r * 0.75, 0);
  pot.castShadow = pot.receiveShadow = true;
  g.add(pot);
  g.add(cyl(r * 1.08, r * 1.08, r * 0.14, 10, cel({ color: 0xb06a4c, bands: 3, tint: 0x6f5680 }), 0, r * 1.46, 0));
  g.add(cyl(r * 0.86, r * 0.86, r * 0.1, 10, cel({ color: 0x6b5a4a, bands: 2 }), 0, r * 1.46, 0));
  const n = o.n ?? 4;
  for (let i = 0; i < n; i++) {
    const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(r * rng.range(0.5, 0.85), 0),
      i % 3 === 0 ? m.leafDeep : m.leaf);
    blob.position.set(rng.range(-r * 0.6, r * 0.6), r * 1.7 + rng.range(0, r * 0.7), rng.range(-r * 0.6, r * 0.6));
    blob.rotation.set(rng.range(0, 3), rng.range(0, 3), rng.range(0, 3));
    blob.castShadow = true;
    g.add(blob);
  }
  if (o.flower) {
    for (let i = 0; i < 3; i++) {
      const f = new THREE.Mesh(new THREE.IcosahedronGeometry(r * 0.2, 0),
        cel({ color: rng.pick([PAL.red, PAL.yellow, PAL.blossomDeep]), bands: 2, tint: 0x8f7aa8 }));
      f.position.set(rng.range(-r * 0.5, r * 0.5), r * 2.1, rng.range(-r * 0.5, r * 0.5));
      g.add(f);
    }
  }
  g.position.set(o.x, o.y ?? 0, o.z);
  return g;
}

export function makeUmbrella(o = {}) {
  if (skipClutter(o)) return strippedGroup();
  const m = mats();
  const g = new THREE.Group();
  const canopy = new THREE.Mesh(
    new THREE.ConeGeometry(0.2, 0.62, 8, 1, true),
    flat({ color: PAL.umbrella, transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false, cache: false })
  );
  canopy.position.set(0, 0.72, 0);
  canopy.userData.noOutline = true;
  g.add(canopy);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    // Join the cone's tip to its rim exactly. Three's positive Y rotation
    // points local +X toward -Z, so the azimuth must be negated here.
    const rib = box(Math.hypot(0.2, 0.62), 0.012, 0.012, m.metal);
    rib.rotation.set(0, -a, -Math.atan2(0.62, 0.2));
    rib.position.set(Math.cos(a) * 0.1, 0.72, Math.sin(a) * 0.1);
    g.add(rib);
  }
  g.add(cyl(0.014, 0.014, 1.0, 6, m.metal, 0, 0.5, 0));
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.014, 4, 8, Math.PI), cel({ color: 0x6a5a5e, bands: 2 }));
  handle.position.set(0.05, 0.02, 0);
  handle.rotation.set(Math.PI / 2, 0, 0);
  g.add(handle);
  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.set(o.tilt ?? 0.22, o.ry ?? 0, o.roll ?? 0.16);
  return g;
}

export function makeBins(o = {}) {
  if (skipClutter(o)) return strippedGroup();
  const m = mats();
  const g = new THREE.Group();
  const colors = [PAL.bin, 0x7fae6a, 0xd8c34a];
  colors.forEach((c, i) => {
    const b = box(0.44, 0.62, 0.4, cel({ color: c, bands: 3, tint: 0x6f6790 }), i * 0.5, 0.31, 0);
    b.castShadow = b.receiveShadow = true;
    g.add(b);
    g.add(box(0.47, 0.05, 0.43, cel({ color: PAL.metalDark, bands: 3 }), i * 0.5, 0.64, 0));
  });
  /* The crow net over the pile, a very Japanese detail -- but it has to be
   * *over* the pile.  It used to be a 1.6 x 0.7 plane at 0.3 opacity standing
   * up in front of the bins at a slight tilt, which is the trap `chainLinkTex`
   * exists for: a pale translucent sheet reads as tinted glass, not as mesh.
   * With nothing behind it to explain the shape it read as an unidentified
   * green rectangle beside every refuse point in the world.
   *
   * It is a drape now -- a shallow open box over the three lids with a skirt
   * down all four sides -- and it uses the lattice map, so the gaps are
   * genuinely transparent and you see the bin lids through it. */
  {
    const mesh = chainLinkTex().clone();     // clone: the map is shared with the fences
    mesh.wrapS = mesh.wrapT = THREE.RepeatWrapping;
    mesh.repeat.set(11, 2.4);
    mesh.needsUpdate = true;
    const net = new THREE.Mesh(
      new THREE.BoxGeometry(1.58, 0.3, 0.58),
      flat({
        color: 0x5f8f6a, map: mesh, transparent: true, opacity: 0.9,
        side: THREE.DoubleSide, depthWrite: false, cache: false,
      })
    );
    net.position.set(0.5, 0.56, 0);
    net.userData.noOutline = true;
    g.add(net);
  }
  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  return g;
}

/* ================================================================== *
 * Furniture for the wider district.
 *
 * Same rule as everything above: each one exists to do a job in a frame.
 * Nothing here depicts a person -- the story is told by what has been left
 * behind, parked, pinned up or knocked over.
 * ================================================================== */

/**
 * A row of parked bicycles.
 *
 * A bicycle is a couple of dozen small meshes, and a school bike shed wants
 * sixteen of them, so one bike is baked into three geometries (dark parts,
 * frame, brightwork) and each is instanced along the row.  Frame colour
 * varies per instance, which is what stops the row reading as a copy-paste.
 */
export function makeBikeRack(o = {}) {
  if (skipClutter(o)) return strippedGroup();
  const m = mats();
  const rng = rngKit(o.seed ?? 17);
  const g = new THREE.Group();
  const n = o.n ?? 8;
  const spacing = o.spacing ?? 0.62;

  /* The same bicycle `makeBicycle` uses, so the two cannot drift apart.  This
   * function used to carry its own copy of the frame -- with the same
   * disconnected members -- which is exactly how both ended up wrong. */
  const shared = bicycleGeometry();

  const FRAMES = [0x3f6f9c, 0xd8a03c, 0x9c5a4a, 0x4f8f6a, 0x8f6fb5, 0x4a4a92, 0xc7c2d0, 0x2f9c9a];
  const instDark = new THREE.InstancedMesh(shared.dark, m.dark, n);
  const instFrame = new THREE.InstancedMesh(shared.frame, cel({ color: 0xffffff, bands: 3, tint: 0x4a4a92, cache: false }), n);
  const instBrite = new THREE.InstancedMesh(shared.brite, m.metal, n);
  // the basket has to be two-sided or you see through it into the scene behind
  const instMesh = new THREE.InstancedMesh(shared.mesh,
    cel({ color: PAL.metal, bands: 3, side: THREE.DoubleSide, tint: 0x666090 }), n);
  const d = new THREE.Object3D();
  const col = new THREE.Color();
  const ry = o.ry ?? 0;
  for (let i = 0; i < n; i++) {
    const t = -((n - 1) * spacing) / 2 + i * spacing;
    d.position.set(-Math.sin(ry) * t, 0, Math.cos(ry) * t);
    /* 'YXZ' so the roll happens in the bicycle's own frame and the yaw turns
     * the already-rolled bike.  In the default XYZ order the roll is about the
     * world X axis, which pitches rather than leans any rack not aligned to X
     * -- and half of them are turned a quarter circle. */
    d.rotation.set(rng.range(-0.07, 0.07), ry + rng.range(-0.05, 0.05), 0, 'YXZ');
    d.updateMatrix();
    instDark.setMatrixAt(i, d.matrix);
    instFrame.setMatrixAt(i, d.matrix);
    instBrite.setMatrixAt(i, d.matrix);
    instMesh.setMatrixAt(i, d.matrix);
    col.set(FRAMES[(i * 3 + (o.seed ?? 0)) % FRAMES.length]);
    instFrame.setColorAt(i, col);
    /* One box per bike on the school shed. Corridor racks are
     * skipClutter, so this only runs where keep: true passed a ctx.
     * A merged row AABB would wall the aisle; each frame is 1.4 m by
     * 0.4 m, which is the drawing. */
    if (o.ctx && o.keep === true) {
      const hx = 0.70;
      const hz = 0.20;
      const y0 = o.y ?? 0;
      const y1 = y0 + 1.02;
      const c = Math.cos(ry);
      const s = Math.sin(ry);
      const px = (o.x ?? 0) - s * t;
      const pz = (o.z ?? 0) + c * t;
      const lx = Math.abs(c) * hx + Math.abs(s) * hz;
      const lz = Math.abs(s) * hx + Math.abs(c) * hz;
      o.ctx.collide(px - lx, pz - lz, px + lx, pz + lz, y1, y0, true);
    }
  }
  instFrame.instanceColor.needsUpdate = true;
  for (const inst of [instDark, instFrame, instBrite, instMesh]) {
    inst.castShadow = true;
    inst.receiveShadow = true;
    g.add(inst);
  }
  g.position.set(o.x, o.y ?? 0, o.z);
  return g;
}

/**
 * A notice board: posts, a shallow roof, a cork panel and pinned paper.
 * The posters are the point -- a shut school with a board full of club
 * recruitment is a school that is running.
 */
export function makeNoticeBoard(o = {}) {
  const m = mats();
  const g = new THREE.Group();
  g.name = 'openFrame';
  const w = o.w ?? 2.2;
  const h = o.h ?? 1.25;
  const y0 = o.y0 ?? 0.85;
  const woodMat = cel({ color: o.wood ?? 0x8a6f52, bands: 3, tint: 0x5c5680 });

  for (const s of [-1, 1]) {
    const p = box(0.11, y0 + h + 0.1, 0.11, woodMat, (s * (w - 0.2)) / 2, (y0 + h + 0.1) / 2, 0);
    p.castShadow = true;
    g.add(p);
  }
  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, 0.09),
    [woodMat, woodMat, woodMat, woodMat,
     flat({ color: 0xffffff, map: corkBoard(), cache: false }), woodMat]
  );
  panel.position.set(0, y0 + h / 2, 0);
  panel.castShadow = panel.receiveShadow = true;
  g.add(panel);
  hullOutline(panel, { thickness: 0.003 });
  // frame and a shallow rain hood
  g.add(box(w + 0.1, 0.09, 0.14, woodMat, 0, y0 + h + 0.04, 0));
  const hood = box(w + 0.24, 0.06, 0.34, cel({ color: PAL.roofSlate, bands: 3, tint: 0x514b70 }), 0, y0 + h + 0.16, 0.1);
  hood.rotation.x = -0.2;
  hood.castShadow = true;
  g.add(hood);

  const sheets = o.sheets ?? [];
  sheets.forEach((s, i) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(s.w ?? 0.42, s.h ?? 0.58),
      flat({ color: 0xffffff, map: s.map, cache: false }));
    p.position.set(s.x, y0 + h / 2 + (s.y ?? 0), 0.052);
    p.rotation.z = s.tilt ?? 0;
    p.userData.noOutline = true;
    g.add(p);
    // a drawing pin
    g.add(box(0.03, 0.03, 0.02, flat({ color: i % 2 ? PAL.red : PAL.yellow }), s.x, y0 + h / 2 + (s.y ?? 0) + (s.h ?? 0.58) / 2 - 0.04, 0.062));
  });

  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  const ctx = o.ctx;
  if (ctx && o.x != null && o.z != null) {
    const y = o.y ?? 0;
    const ry = o.ry ?? 0;
    for (const s of [-1, 1]) {
      yawCollide(ctx, o.x, o.z, y, ry, (s * (w - 0.2)) / 2, 0, 0.07, 0.07, y0 + h + 0.12, 0);
    }
    yawSlab(ctx, o.x, o.z, y, ry, w / 2 + 0.06, 0.08, y0 + h + 0.08, y0);
    yawSlab(ctx, o.x, o.z, y, ry, w / 2 + 0.14, 0.16, y0 + h + 0.22, y0 + h + 0.06);
  }
  return g;
}

/** Timber slat bench. Park, canal bank, station forecourt. */
export function makeBench(o = {}) {
  if (skipClutter(o)) return strippedGroup();
  const m = mats();
  const g = new THREE.Group();
  if (o.ctx) g.name = 'openFrame';
  const len = o.len ?? 1.7;
  const slat = cel({ color: o.wood ?? 0xc0a582, bands: 3, tint: 0x6f6790 });
  const leg = o.legMat ?? m.metalDark;
  for (let i = 0; i < 3; i++) {
    g.add(box(len, 0.05, 0.13, slat, 0, 0.44, -0.16 + i * 0.16));
  }
  if (o.back !== false) {
    for (let i = 0; i < 2; i++) {
      const b = box(len, 0.13, 0.05, slat, 0, 0.66 + i * 0.17, -0.22);
      b.castShadow = true;
      g.add(b);
    }
    for (const s of [-1, 1]) {
      const up = box(0.07, 0.52, 0.07, leg, (s * (len - 0.3)) / 2, 0.66, -0.24);
      up.rotation.x = 0.12;
      g.add(up);
    }
  }
  for (const s of [-1, 1]) {
    g.add(box(0.08, 0.44, 0.42, leg, (s * (len - 0.3)) / 2, 0.22, -0.04));
  }
  g.traverse((n) => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; } });
  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  const ctx = o.ctx;
  if (ctx && o.x != null && o.z != null) {
    const y = o.y ?? 0;
    const ry = o.ry ?? 0;
    for (const s of [-1, 1]) {
      yawCollide(ctx, o.x, o.z, y, ry, (s * (len - 0.3)) / 2, -0.04, 0.06, 0.22, 0.44, 0);
    }
    yawSlab(ctx, o.x, o.z, y, ry, len / 2, 0.22, 0.48, 0.40);
  }
  return g;
}

/**
 * A metal post carrying one or two sign plates.  `plates` entries are
 * { map, w, h, y, ry, double } -- `double` mirrors the art onto the back so
 * the sign reads from either side.
 */
export function makeSignPost(o = {}) {
  const m = mats();
  const g = new THREE.Group();
  const H = o.h ?? 2.4;
  const post = cyl(0.045, 0.05, H, 8, o.postMat ?? m.metal, 0, H / 2, 0);
  post.castShadow = true;
  g.add(post);
  g.add(cyl(0.1, 0.12, 0.14, 8, m.concreteMid, 0, 0.07, 0));
  for (const p of o.plates ?? []) {
    const side = flat({ color: p.back ?? PAL.wallGray });
    const face = flat({ color: 0xffffff, map: p.map, cache: false });
    /* The *same* map on the back, not a mirrored clone.
     *
     * `BoxGeometry` already reverses `udir` on the negative face of each axis,
     * so both sides of a plate read correctly from one texture; adding
     * `mirrored()` is what produced mirror writing.  Every two-sided sign in
     * the world was wrong on its back face -- which, for a direction plate at
     * the foot of a stair, is the face you read walking towards it. */
    const back = p.double ? face : side;
    /* Thick enough to swallow the post, and centred on it when the plate is
     * two-sided.  At 0.04 thick sitting 0.03 forward, the 0.09 post came
     * through the printed face and took a couple of characters out of every
     * two-sided plate in the world -- most obviously the direction plates at
     * the foot of the overbridge stairs, where the post landed dead centre.
     * A single-sided plate still sits in front of the post, which is how one
     * is actually clamped on. */
    const t = p.double ? 0.12 : 0.05;
    const board = new THREE.Mesh(new THREE.BoxGeometry(p.w ?? 0.5, p.h ?? 0.5, t),
      [side, side, side, side, face, back]);
    board.position.set(0, p.y ?? H - 0.4, p.double ? 0 : 0.058);
    board.rotation.y = p.ry ?? 0;
    board.castShadow = true;
    g.add(board);
    hullOutline(board, { thickness: 0.0028 });
  }
  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  return g;
}

/** The wire recycling cage that stands beside every vending machine. */
export function makeVendBin(o = {}) {
  if (skipClutter(o)) return strippedGroup();
  const m = mats();
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.22, 0.86, 10, 1, true),
    cel({ color: o.color ?? PAL.vendTeal, bands: 3, side: THREE.DoubleSide, tint: 0x5c5680 }));
  body.position.set(0, 0.43, 0);
  body.castShadow = true;
  g.add(body);
  g.add(cyl(0.26, 0.26, 0.06, 10, m.metalDark, 0, 0.89, 0));
  // two openings punched in the lid, the way the can/bottle split is marked
  for (const s of [-1, 1]) {
    g.add(cyl(0.08, 0.08, 0.03, 8, cel({ color: 0x2f3140, bands: 2 }), s * 0.1, 0.92, 0));
  }
  g.add(box(0.3, 0.11, 0.02, flat({ color: 0xf6f2e8 }), 0, 0.62, 0.235));
  // a couple of cans dropped in
  for (let i = 0; i < 3; i++) {
    g.add(cyl(0.031, 0.031, 0.11, 8,
      cel({ color: [0xe0453f, 0x3d6ec4, 0xf4c033][i], bands: 2, tint: 0x6f6790 }),
      -0.08 + i * 0.08, 0.72, -0.04 + (i % 2) * 0.07));
  }
  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  return g;
}

/**
 * Outdoor air-conditioning unit, on feet or on a wall bracket.
 *
 * Two things about placing one, both of which were wrong all over the world
 * until they were checked with a ray fired out of the back of every unit:
 *
 *  - **The grille is on local +z**, so `ry` has to be `atan2(nx, nz)` of the
 *    wall's *outward* normal -- exactly the convention the name plates and the
 *    shop clutter use.  Half of these were a half turn out and had their fan
 *    pointing into the render they were bolted to.
 *  - **The back face has to touch the wall.**  `standoff` is the gap the caller
 *    leaves between the wall face and the back of the unit, so the group origin
 *    belongs at `wall + (d / 2 + standoff)` along that normal.  A unit with
 *    `feet: false` gets a pair of angle brackets spanning exactly that gap;
 *    without them, and at the 0.3-1.3 m some of these were left at, an outdoor
 *    unit is a box hanging in the air with its own shadow on the wall behind it.
 */
export function makeAircon(o = {}) {
  if (skipClutter(o)) return strippedGroup();
  const m = mats();
  const g = new THREE.Group();
  const w = o.w ?? 0.82;
  const hh = o.h ?? 0.58;
  const d = o.d ?? 0.3;
  const shell = cel({ color: o.color ?? 0xe2e0e4, bands: 3, tint: 0x6f6790 });
  const b = box(w, hh, d, shell, 0, hh / 2, 0);
  b.castShadow = b.receiveShadow = true;
  g.add(b);
  hullOutline(b, { thickness: 0.003 });
  // grille: a ring plus louvres, so it reads as a fan not a blank box
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.28, w * 0.28, 0.03, 14), m.metalDark);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(w * 0.06, hh * 0.52, d / 2 + 0.015);
  g.add(ring);
  for (let i = 0; i < 5; i++) {
    g.add(box(w * 0.5, 0.02, 0.02, m.metalDark, w * 0.06, hh * 0.52 - 0.12 + i * 0.06, d / 2 + 0.03));
  }
  g.add(box(w, 0.05, d + 0.04, cel({ color: 0xcac7cf, bands: 3, tint: 0x6a6288 }), 0, hh + 0.02, 0));
  if (o.feet !== false) {
    for (const s of [-1, 1]) {
      g.add(box(0.1, 0.14, d, m.metalDark, (s * (w - 0.2)) / 2, -0.07, 0));
    }
  } else {
    // the pair of angle brackets it hangs on: an arm under it, a leg up the
    // wall, and the bolt pad.  The arm reaches back over `standoff`, so a
    // correctly placed unit is visibly carried rather than floating.
    const so = o.standoff ?? 0.09;
    for (const s of [-1, 1]) {
      const bx = (s * (w - 0.18)) / 2;
      g.add(box(0.05, 0.04, d + so, m.metalDark, bx, -0.02, -so / 2));
      g.add(box(0.05, hh * 0.66, 0.035, m.metalDark, bx, hh * 0.31, -(d / 2 + so) + 0.018));
      g.add(box(0.09, 0.09, 0.02, m.metalDark, bx, hh * 0.55, -(d / 2 + so) + 0.008));
    }
  }
  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  return g;
}

/** Laundry pole with washing on it -- the fastest way to say "lived in". */
export function makeLaundryPole(o = {}) {
  if (skipClutter(o)) return strippedGroup();
  const m = mats();
  const rng = rngKit(o.seed ?? 31);
  const g = new THREE.Group();
  g.name = 'openFrame';
  const len = o.len ?? 2.4;
  const H = o.h ?? 1.75;
  for (const s of [-1, 1]) {
    g.add(cyl(0.035, 0.04, H, 6, m.metal, (s * len) / 2, H / 2, 0));
    g.add(cyl(0.1, 0.12, 0.1, 8, m.concreteMid, (s * len) / 2, 0.05, 0));
  }
  const bar = cyl(0.028, 0.028, len + 0.16, 6, m.metal, 0, H, 0);
  bar.rotation.z = Math.PI / 2;
  bar.castShadow = true;
  g.add(bar);
  const COLS = [PAL.wallBlue, PAL.blossom, PAL.wallWhite, PAL.yellow, PAL.wallCream, 0xa8cfe0];
  const n = o.n ?? 4;
  for (let i = 0; i < n; i++) {
    const w = rng.range(0.3, 0.5);
    const h = rng.range(0.5, 0.8);
    const t = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      cel({ color: rng.pick(COLS), bands: 2, side: THREE.DoubleSide, tint: 0x6f6790 }));
    t.position.set(-len / 2 + 0.3 + (i * (len - 0.6)) / Math.max(1, n - 1), H - h / 2 - 0.04, 0);
    // a slight twist, so the row is not a picket fence
    t.rotation.set(0, rng.range(-0.14, 0.14), rng.range(-0.05, 0.05));
    t.castShadow = true;
    g.add(t);
    g.add(box(0.05, 0.03, 0.03, flat({ color: 0xd8d4dc }), t.position.x - w / 2 + 0.04, H, 0));
  }
  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  const ctx = o.ctx;
  if (ctx && o.x != null && o.z != null) {
    const y = o.y ?? 0;
    const ry = o.ry ?? 0;
    for (const s of [-1, 1]) {
      yawCollide(ctx, o.x, o.z, y, ry, (s * len) / 2, 0, 0.05, 0.05, H, 0);
    }
    yawSlab(ctx, o.x, o.z, y, ry, len / 2 + 0.08, 0.04, H + 0.04, H - 0.04);
  }
  return g;
}

/**
 * A crow on a wire.
 *
 * This was a 0.15 m sphere with a 0.045 m head, and at the eight to twenty
 * metres you actually see it from that is not a bird -- it is a black dot.  Up
 * on the wires over the crossing there were three of them in a row, and what
 * they read as was three unexplained black circles hanging above the train.
 *
 * A crow is legible at distance from exactly two things: the long wedge tail
 * held up off the wire, and the beak sticking forward of a flat head.  So the
 * body is longer and lower, the tail is a third of the whole length, and the
 * top surface is a shade lighter than the underside so the silhouette has a
 * spine rather than being one flat blob.  Half again the old size, which at
 * 0.34 m nose to tail is a real crow rather than a large one.
 */
export function makeCrow(o = {}) {
  const g = new THREE.Group();
  const dark = cel({ color: 0x33303e, bands: 2, tint: 0x413c58 });
  const back = cel({ color: 0x4a4557, bands: 2, tint: 0x453f5c });
  const beakMat = cel({ color: 0x5e5768, bands: 2, tint: 0x453f5c });

  // body: long and low, tapering back into the tail
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.075, 9, 7), dark);
  body.scale.set(0.85, 0.82, 1.75);
  body.position.set(0, 0.095, 0.01);
  g.add(body);
  // the lighter line along the back, which is what gives it a spine
  const spine = new THREE.Mesh(new THREE.SphereGeometry(0.062, 9, 6), back);
  spine.scale.set(0.66, 0.5, 1.55);
  spine.position.set(0, 0.135, 0.0);
  g.add(spine);

  // head, set forward and slightly down, with the beak clear of it
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.052, 9, 7), dark);
  head.scale.set(0.9, 0.85, 1.05);
  head.position.set(0, 0.165, 0.115);
  g.add(head);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.019, 0.085, 5), beakMat);
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 0.158, 0.20);
  g.add(beak);

  /* Tail: a flat wedge, a third of the length, angled up off the wire.  This is
   * the single most recognisable part of a perched crow at distance. */
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.016, 0.2), dark);
  tail.position.set(0, 0.115, -0.185);
  tail.rotation.x = -0.42;
  g.add(tail);
  const tailTip = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.014, 0.075), back);
  tailTip.position.set(0, 0.155, -0.275);
  tailTip.rotation.x = -0.42;
  g.add(tailTip);
  // a folded wing on each flank, so the body is not a smooth ellipsoid
  for (const s of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.055, 0.17), dark);
    wing.position.set(s * 0.056, 0.1, -0.02);
    wing.rotation.x = -0.12;
    g.add(wing);
  }
  // feet, gripping the wire
  for (const s of [-1, 1]) {
    g.add(cyl(0.008, 0.008, 0.055, 4, beakMat, s * 0.026, 0.028, 0.03));
  }
  g.traverse((n) => { if (n.isMesh) n.castShadow = true; });
  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  return g;
}

/** A cardboard box someone left out, with a cat asleep in it. */
export function makeCatBox(o = {}) {
  if (skipClutter(o)) return strippedGroup();
  const g = new THREE.Group();
  const card = cel({ color: 0xc9a878, bands: 3, tint: 0x6f6790 });
  const cardIn = cel({ color: 0xb08f62, bands: 3, tint: 0x6a6288 });
  const W = 0.62, D = 0.46, H = 0.28;
  g.add(box(W, 0.04, D, cardIn, 0, 0.02, 0));
  for (const s of [-1, 1]) {
    g.add(box(W, H, 0.03, card, 0, H / 2, (s * D) / 2));
    g.add(box(0.03, H, D, card, (s * W) / 2, H / 2, 0));
  }
  // one flap folded out, so the box has a silhouette
  const flap = box(W, 0.03, 0.2, card, 0, H, D / 2 + 0.09);
  flap.rotation.x = -0.7;
  flap.castShadow = true;
  g.add(flap);
  // the cat, curled
  const fur = cel({ color: o.cat ?? 0xd8c9b4, bands: 3, tint: 0x7a6f96 });
  const curl = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), fur);
  curl.scale.set(1.15, 0.7, 0.95);
  curl.position.set(0, 0.16, -0.02);
  curl.castShadow = true;
  g.add(curl);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), fur);
  head.position.set(0.12, 0.16, 0.08);
  g.add(head);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.06, 4), fur);
    ear.position.set(0.12, 0.23, 0.08 + s * 0.045);
    ear.rotation.z = -0.3;
    g.add(ear);
  }
  const tail = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.022, 4, 10, Math.PI * 1.1),
    cel({ color: 0xa8977f, bands: 3, tint: 0x6a5f86 }));
  tail.rotation.set(Math.PI / 2, 0, 0.4);
  tail.position.set(-0.06, 0.19, 0.07);
  g.add(tail);
  g.traverse((n) => { if (n.isMesh) n.receiveShadow = true; });
  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  return g;
}

/** Loose printed sheets, blown off a board and pinned against a kerb. */
export function makeLoosePaper(ctx, spots) {
  return null;
  const geo = new THREE.PlaneGeometry(0.21, 0.29);
  geo.rotateX(-Math.PI / 2);
  const mat = flat({ color: 0xfbfaf4, map: paperSheet(), cache: false });
  const inst = new THREE.InstancedMesh(geo, mat, spots.length);
  const d = new THREE.Object3D();
  spots.forEach((s, i) => {
    d.position.set(s.x, (s.y ?? 0) + 0.022, s.z);
    d.rotation.set(s.tilt ?? 0, s.ry ?? 0, 0);
    d.updateMatrix();
    inst.setMatrixAt(i, d.matrix);
  });
  inst.userData.noOutline = true;
  inst.renderOrder = 2;
  ctx.add(inst);
  return inst;
}

/** Umbrella stand with a few clear vinyl umbrellas left to dry. */
export function makeUmbrellaStand(o = {}) {
  if (skipClutter(o)) return strippedGroup();
  const m = mats();
  const rng = rngKit(o.seed ?? 51);
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.18, 0.52, 10, 1, true),
    cel({ color: 0xcfcbd4, bands: 3, side: THREE.DoubleSide, tint: 0x6a6288 }));
  body.position.y = 0.26;
  body.castShadow = true;
  g.add(body);
  g.add(cyl(0.19, 0.19, 0.03, 10, m.metalDark, 0, 0.03, 0));
  const n = o.n ?? 3;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.6;
    const lean = rng.range(0.1, 0.22);
    const u = new THREE.Group();
    u.add(cyl(0.013, 0.013, 0.94, 5, m.metal, 0, 0.47, 0));
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.42, 7, 1, true),
      flat({
        color: rng.pick([PAL.umbrella, PAL.umbrella, 0xd8d4e4, 0xe4d8e0]),
        transparent: true, opacity: 0.46, side: THREE.DoubleSide, depthWrite: false, cache: false,
      }));
    canopy.position.y = 0.72;
    canopy.userData.noOutline = true;
    u.add(canopy);
    u.add(cyl(0.014, 0.014, 0.1, 5, cel({ color: 0x6a5a5e, bands: 2 }), 0, 0.98, 0));
    u.position.set(Math.cos(a) * 0.09, 0.06, Math.sin(a) * 0.09);
    u.rotation.set(Math.sin(a) * lean, 0, -Math.cos(a) * lean);
    g.add(u);
  }
  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  return g;
}

/** Wall-mounted fire hose box, red and small and everywhere in Japan. */
export function makeHoseBox(o = {}) {
  if (skipClutter(o)) return strippedGroup();
  const m = mats();
  const g = new THREE.Group();
  const red = cel({ color: PAL.redDeep, bands: 3, tint: 0x7a4060 });
  const b = box(o.w ?? 0.16, 0.72, 0.5, red, 0, 0.36, 0);
  b.castShadow = true;
  g.add(b);
  g.add(box(0.02, 0.6, 0.4, cel({ color: 0xb02c28, bands: 3, tint: 0x7a4060 }), (o.w ?? 0.16) / 2 + 0.01, 0.36, 0));
  g.add(box(0.03, 0.07, 0.24, flat({ color: 0xf6f2e8 }), (o.w ?? 0.16) / 2 + 0.02, 0.58, 0));
  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  return g;
}

/** Planting bed with a timber edge, soil and a scatter of flowers. */
export function makeFlowerBed(o = {}) {
  if (skipClutter(o)) return strippedGroup();
  const m = mats();
  const rng = rngKit(o.seed ?? 61);
  const g = new THREE.Group();
  const w = o.w ?? 1.4;
  const d = o.d ?? 4.0;
  const edge = cel({ color: o.edge ?? 0x9c7f5e, bands: 3, tint: 0x5c5680 });
  const soil = cel({ color: 0x8f7a62, bands: 3, tint: 0x615a80 });
  g.add(box(w, 0.16, d, soil, 0, 0.08, 0));
  for (const s of [-1, 1]) {
    g.add(box(w + 0.1, 0.22, 0.09, edge, 0, 0.11, (s * d) / 2));
    g.add(box(0.09, 0.22, d + 0.1, edge, (s * w) / 2, 0.11, 0));
  }
  const leafMat = [
    cel({ color: PAL.leaf, bands: 3, tint: 0x5b6f8c }),
    cel({ color: PAL.leafDeep, bands: 3, tint: 0x5b6f8c }),
    cel({ color: PAL.leafPale, bands: 3, tint: 0x5b6f8c }),
  ];
  const n = o.n ?? Math.round(d * 3.4);
  const blob = new THREE.IcosahedronGeometry(1, 0);
  for (let i = 0; i < n; i++) {
    const r = rng.range(0.09, 0.16);
    const b = new THREE.Mesh(blob, leafMat[i % 3]);
    b.position.set(rng.range(-w * 0.33, w * 0.33), 0.18 + r * 0.7, rng.range(-d * 0.45, d * 0.45));
    b.scale.set(r, r * 0.8, r);
    b.rotation.set(rng.range(0, 3), rng.range(0, 3), rng.range(0, 3));
    b.castShadow = true;
    g.add(b);
    if (i % 3 === 0) {
      const f = new THREE.Mesh(blob, cel({ color: rng.pick([PAL.red, PAL.yellow, PAL.blossomDeep, PAL.orange, PAL.purple]), bands: 2, tint: 0x8f7aa8 }));
      f.position.set(b.position.x + rng.range(-0.1, 0.1), 0.18 + r * 1.5, b.position.z + rng.range(-0.1, 0.1));
      f.scale.setScalar(rng.range(0.045, 0.07));
      g.add(f);
    }
  }
  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  return g;
}

/** Galvanised bucket, on its own or upended. */
export function makeBucket(o = {}) {
  if (skipClutter(o)) return strippedGroup();
  const m = mats();
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.11, 0.24, 10, 1, true),
    cel({ color: o.color ?? 0xb8bcc6, bands: 3, side: THREE.DoubleSide, tint: 0x666090 }));
  body.position.y = 0.12;
  body.castShadow = true;
  g.add(body);
  g.add(cyl(0.11, 0.11, 0.02, 10, m.metalDark, 0, 0.01, 0));
  g.add(cyl(0.145, 0.145, 0.02, 10, m.metal, 0, 0.24, 0));
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.012, 4, 9, Math.PI), m.metalDark);
  handle.rotation.y = Math.PI / 2;
  handle.position.y = 0.24;
  g.add(handle);
  if (o.water) {
    const wat = new THREE.Mesh(new THREE.CircleGeometry(0.115, 10), flat({ color: PAL.water }));
    wat.rotation.x = -Math.PI / 2;
    wat.position.y = 0.19;
    g.add(wat);
  }
  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.set(o.tilt ?? 0, o.ry ?? 0, o.roll ?? 0);
  return g;
}

/** Bamboo broom leaning where it was left. */
export function makeBroom(o = {}) {
  if (skipClutter(o)) return strippedGroup();
  const m = mats();
  const g = new THREE.Group();
  const handle = cyl(0.022, 0.026, 1.5, 6, cel({ color: 0xc2a874, bands: 3, tint: 0x6f6790 }), 0, 0.75, 0);
  handle.castShadow = true;
  g.add(handle);
  /* The bundle fans out at the sweeping end and is bound narrow at the top,
   * so the cone sits apex up.  It was upside down, which at three metres reads
   * as a closed umbrella or a trowel rather than a broom -- easy to miss at
   * the shrine, where the only one stood against a dark fence, and impossible
   * to miss once there was one outside a shopfront in daylight. */
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.44, 7, 1, true),
    cel({ color: 0xa88a5e, bands: 3, side: THREE.DoubleSide, tint: 0x6f6790 }));
  head.position.y = 0.22;
  head.castShadow = true;
  g.add(head);
  g.add(cyl(0.055, 0.05, 0.08, 7, cel({ color: 0x8a6f52, bands: 2 }), 0, 0.43, 0));
  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.set(o.tilt ?? 0.24, o.ry ?? 0, o.roll ?? 0.1);
  return g;
}

/** A stack of milk crates, and the bottle box outside a bathhouse. */
export function makeMilkCrate(o = {}) {
  if (skipClutter(o)) return strippedGroup();
  const g = new THREE.Group();
  const crate = cel({ color: o.color ?? 0xd8d4dc, bands: 3, tint: 0x6a6288 });
  const n = o.n ?? 2;
  for (let i = 0; i < n; i++) {
    const c = box(0.44, 0.24, 0.32, crate, 0, 0.12 + i * 0.24, 0);
    c.castShadow = c.receiveShadow = true;
    g.add(c);
    g.add(box(0.38, 0.04, 0.26, cel({ color: 0x9a94a6, bands: 2 }), 0, 0.23 + i * 0.24, 0));
  }
  // bottles in the top crate
  for (let i = 0; i < 4; i++) {
    g.add(cyl(0.032, 0.032, 0.14, 8, cel({ color: 0xf6f2ea, bands: 'soft', tint: 0x9c93b8 }),
      -0.14 + (i % 2) * 0.1, 0.24 * n + 0.07, -0.07 + ((i / 2) | 0) * 0.14));
  }
  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  return g;
}

/* ================================================================== *
 * Back-street furniture.
 *
 * The things that make a two-metre gap between two houses read as somewhere
 * people live rather than as a modelling gap: the shared tap, the tin store,
 * the shelf of pots, the bank of letterboxes, the parcel locker, the mat at
 * the door and the vine over the wall.  All of them small, all of them
 * ordinary, and every one of them a reason for the space to exist.
 * ================================================================== */

/**
 * 共用水栓 -- the shared outdoor tap.
 *
 * A galvanised riser off a stop-cock box, a brass spigot with a hose collar,
 * and the shallow concrete dish under it that stops the ground washing away.
 * The dish is what makes it read: a tap on a pipe is a pipe.
 */
export function makeTapPost(o = {}) {
  if (skipClutter(o)) return strippedGroup();
  const m = mats();
  const g = new THREE.Group();
  const H = o.h ?? 0.86;
  // the dish, its lip, and the darker wet patch in the bottom of it
  const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.26, 0.1, 12), m.concreteMid);
  dish.position.y = 0.05;
  dish.receiveShadow = true;
  g.add(dish);
  g.add(new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.028, 4, 14), m.concrete)
    .translateY(0.1).rotateX(Math.PI / 2));
  const wet = new THREE.Mesh(new THREE.CircleGeometry(0.2, 12),
    flat({ color: 0x8e94a8, transparent: true, opacity: 0.45, depthWrite: false, cache: false }));
  wet.rotation.x = -Math.PI / 2;
  wet.position.y = 0.101;
  wet.userData.noOutline = true;
  g.add(wet);
  // riser, stop-cock box, spigot and hose collar
  const riser = cyl(0.028, 0.032, H, 8, m.metal, 0, H / 2, 0);
  riser.castShadow = true;
  g.add(riser);
  g.add(box(0.12, 0.16, 0.1, m.metalDark, 0, 0.26, 0.06));
  const spout = cyl(0.02, 0.02, 0.16, 6, cel({ color: 0xa8925e, bands: 3, tint: 0x6a5a80 }), 0, H - 0.05, 0.08);
  spout.rotation.x = Math.PI / 2 - 0.5;
  g.add(spout);
  g.add(cyl(0.035, 0.035, 0.05, 8, cel({ color: 0xa8925e, bands: 3, tint: 0x6a5a80 }), 0, H, 0));
  // the cross handle, two bars
  for (const r of [0, Math.PI / 2]) {
    const bar = box(0.14, 0.018, 0.018, cel({ color: 0x9c5a4a, bands: 3, tint: 0x7a4060 }), 0, H + 0.05, 0);
    bar.rotation.y = r;
    g.add(bar);
  }
  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  return g;
}

/**
 * 物置 -- the pressed-steel garden store.
 *
 * Every back garden and half of every alley in Japan has one of these.  The
 * ribs are the whole prop: a plain box is a crate, and a box with a run of
 * shallow vertical ribs and a sliding door with two handles is unmistakable.
 */
export function makeStorageShed(o = {}) {
  const m = mats();
  const g = new THREE.Group();
  const w = o.w ?? 1.3, d = o.d ?? 0.72, h = o.h ?? 1.62;
  const shell = cel({ color: o.color ?? 0xcdd2cf, bands: 3, tint: 0x6a6288 });
  const trim = cel({ color: 0x8f9a96, bands: 3, tint: 0x5c5680 });

  g.add(box(w + 0.1, 0.09, d + 0.1, m.concreteMid, 0, 0.045, 0));
  const body = box(w, h, d, shell, 0, 0.09 + h / 2, 0);
  body.castShadow = body.receiveShadow = true;
  g.add(body);
  hullOutline(body, { thickness: 0.0034 });
  // ribs down the two flanks and the back
  {
    const ribs = [];
    const n = Math.round(w / 0.14);
    for (let i = 0; i < n; i++) {
      ribs.push({
        geometry: new THREE.BoxGeometry(0.05, h - 0.24, d + 0.03),
        matrix: trs(-w / 2 + 0.07 + i * ((w - 0.14) / (n - 1)), 0.09 + h / 2, 0),
      });
    }
    const rm = new THREE.Mesh(bake(ribs), trim);
    rm.castShadow = true;
    g.add(rm);
  }
  // the roof, pitched a little to the back, with a drip edge
  const roof = box(w + 0.12, 0.06, d + 0.14, trim, 0, 0.09 + h + 0.05, -0.02);
  roof.rotation.x = 0.06;
  roof.castShadow = true;
  g.add(roof);
  g.add(box(w + 0.14, 0.05, 0.05, trim, 0, 0.09 + h + 0.015, d / 2 + 0.06));
  // the two sliding leaves and their handles
  for (const s of [-1, 1]) {
    g.add(box(w / 2 - 0.03, h - 0.3, 0.03, shell, s * (w / 4), 0.09 + h / 2 - 0.02, d / 2 + 0.02));
    g.add(box(0.04, 0.24, 0.05, m.metalDark, s * 0.07, 0.09 + h * 0.55, d / 2 + 0.045));
  }
  g.add(box(w, 0.05, 0.06, trim, 0, 0.09 + h - 0.13, d / 2 + 0.03));
  g.add(box(w, 0.05, 0.06, trim, 0, 0.24, d / 2 + 0.03));
  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  g.userData.top = 0.09 + h + 0.08;
  return g;
}

/** A two-tier steel shelf of plant pots, the alley's window box. */
export function makePotShelf(o = {}) {
  if (skipClutter(o)) return strippedGroup();
  const m = mats();
  const rng = rngKit(o.seed ?? 91);
  const g = new THREE.Group();
  const w = o.w ?? 1.1, d = 0.34;
  const frame = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      frame.push({
        geometry: new THREE.CylinderGeometry(0.016, 0.016, 0.78, 5),
        matrix: trs(sx * (w / 2 - 0.05), 0.39, sz * (d / 2 - 0.04)),
      });
    }
  }
  for (const y of [0.36, 0.74]) {
    for (const sz of [-1, 1]) {
      frame.push({
        geometry: new THREE.BoxGeometry(w, 0.022, 0.022),
        matrix: trs(0, y, sz * (d / 2 - 0.04)),
      });
    }
    const n = Math.round(w / 0.09);
    for (let i = 0; i <= n; i++) {
      frame.push({
        geometry: new THREE.BoxGeometry(0.014, 0.014, d - 0.08),
        matrix: trs(-w / 2 + (w / n) * i, y, 0),
      });
    }
  }
  const fm = new THREE.Mesh(bake(frame), m.metal);
  fm.castShadow = true;
  g.add(fm);
  // the pots, alternating tiers, a few of them empty
  const n = o.n ?? 6;
  for (let i = 0; i < n; i++) {
    const y = i % 2 ? 0.75 : 0.37;
    const r = rng.range(0.07, 0.1);
    const t = -w / 2 + 0.14 + (i % 3) * ((w - 0.28) / 2) + rng.range(-0.03, 0.03);
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.76, r * 1.5, 9), m.terracotta);
    pot.position.set(t, y + r * 0.75, rng.range(-0.05, 0.05));
    pot.castShadow = true;
    g.add(pot);
    if (rng.chance(0.78)) {
      for (let k = 0; k < 3; k++) {
        const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(r * rng.range(0.5, 0.85), 0),
          k === 0 ? m.leafDeep : m.leaf);
        blob.position.set(pot.position.x + rng.range(-r * 0.6, r * 0.6),
          y + r * 1.7 + rng.range(0, r * 0.6), pot.position.z + rng.range(-r * 0.5, r * 0.5));
        blob.rotation.set(rng.range(0, 3), rng.range(0, 3), rng.range(0, 3));
        blob.castShadow = true;
        g.add(blob);
      }
    }
  }
  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  return g;
}

/** A bank of apartment letterboxes on a stand, with the newspaper slots. */
export function makeMailboxBank(o = {}) {
  if (skipClutter(o)) return strippedGroup();
  const m = mats();
  const g = new THREE.Group();
  const cols = o.cols ?? 4;
  const rows = o.rows ?? 2;
  const cw = 0.19, ch = 0.16;
  const w = cols * cw + 0.06;
  const h = rows * ch + 0.06;
  const y0 = o.y0 ?? 0.85;
  const shell = cel({ color: 0xb9bec6, bands: 3, tint: 0x666090 });

  for (const s of [-1, 1]) {
    const p = box(0.05, y0 + 0.06, 0.05, m.metalDark, s * (w / 2 - 0.05), (y0 + 0.06) / 2, 0);
    p.castShadow = true;
    g.add(p);
  }
  const body = box(w, h, 0.24, shell, 0, y0 + h / 2, 0);
  body.castShadow = body.receiveShadow = true;
  g.add(body);
  hullOutline(body, { thickness: 0.003 });
  g.add(box(w + 0.06, 0.04, 0.3, cel({ color: 0x8f9aa6, bands: 3, tint: 0x5c5680 }), 0, y0 + h + 0.02, 0.02));
  // the doors: a slot, a lock and a number card on each
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      const dx = -w / 2 + 0.03 + cw * (k + 0.5);
      const dy = y0 + 0.03 + ch * (rows - 1 - r) + ch / 2;
      g.add(box(cw - 0.022, ch - 0.022, 0.02, cel({ color: 0xcfd4da, bands: 3, tint: 0x666090 }), dx, dy, 0.125));
      g.add(box(cw - 0.07, 0.016, 0.014, cel({ color: 0x5f5768, bands: 2 }), dx, dy + 0.038, 0.135));
      g.add(cyl(0.011, 0.011, 0.014, 6, m.metalDark, dx + cw / 2 - 0.045, dy - 0.035, 0.135).rotateX(Math.PI / 2));
      g.add(box(0.045, 0.026, 0.008, flat({ color: 0xf6f2e8 }), dx - cw / 2 + 0.045, dy - 0.035, 0.136));
    }
  }
  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  return g;
}

/** 宅配ボックス -- the parcel locker beside a front door. */
export function makeDeliveryBox(o = {}) {
  if (skipClutter(o)) return strippedGroup();
  const m = mats();
  const g = new THREE.Group();
  const w = 0.44, d = 0.4, h = 0.6;
  const shell = cel({ color: o.color ?? 0x6f7a70, bands: 3, tint: 0x5b6f8c });
  g.add(box(w + 0.06, 0.05, d + 0.06, m.concreteMid, 0, 0.025, 0));
  const b = box(w, h, d, shell, 0, 0.05 + h / 2, 0);
  b.castShadow = b.receiveShadow = true;
  g.add(b);
  hullOutline(b, { thickness: 0.003 });
  // the drop lid, its pull, the seal-stamp hatch and the printed panel
  const lid = box(w - 0.04, 0.24, 0.03, cel({ color: 0x5f6a62, bands: 3, tint: 0x5b6f8c }), 0, 0.05 + h - 0.16, d / 2 + 0.015);
  g.add(lid);
  g.add(box(0.16, 0.025, 0.03, m.metalDark, 0, 0.05 + h - 0.06, d / 2 + 0.03));
  g.add(box(0.12, 0.1, 0.02, cel({ color: 0x8f9a92, bands: 2, tint: 0x5b6f8c }), -0.12, 0.05 + h * 0.42, d / 2 + 0.012));
  g.add(box(0.2, 0.09, 0.01, flat({ color: 0xf2efe4 }), 0.08, 0.05 + h * 0.42, d / 2 + 0.008));
  g.add(box(w + 0.03, 0.04, d + 0.03, cel({ color: 0x5f6a62, bands: 3, tint: 0x5b6f8c }), 0, 0.05 + h + 0.02, 0));
  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  return g;
}

/** The coir mat at a front door, and the two bricks holding its corner down. */
export function makeDoormat(o = {}) {
  if (skipClutter(o)) return strippedGroup();
  const g = new THREE.Group();
  const w = o.w ?? 0.6, d = o.d ?? 0.36;
  const mat0 = box(w, 0.022, d, cel({ color: o.color ?? 0x8a7f6a, bands: 2, tint: 0x615a80 }), 0, 0.011, 0);
  mat0.receiveShadow = true;
  g.add(mat0);
  g.add(box(w - 0.09, 0.026, d - 0.08, cel({ color: 0x9c9078, bands: 2, tint: 0x615a80 }), 0, 0.014, 0));
  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  return g;
}

/**
 * A vine over a wall or a fence.
 *
 * Instanced leaf blobs on a slack line, thickest at the top and thinning as it
 * comes down the face -- which is how ivy actually grows and, more to the
 * point, is what stops a long low wall reading as an extruded rectangle.
 */
export function makeIvy(o = {}) {
  if (skipClutter(o)) return strippedGroup();
  const rng = rngKit(o.seed ?? 77);
  const g = new THREE.Group();
  const len = o.len ?? 3.0;
  const top = o.top ?? 0.9;
  const drop = o.drop ?? 0.6;
  const n = o.n ?? Math.round(len * 16);
  const geo = new THREE.IcosahedronGeometry(1, 0);
  const lists = [[], []];
  for (let i = 0; i < n; i++) {
    const t = rng.range(-len / 2, len / 2);
    // thickest along the coping, thinning down the face
    const u = Math.pow(rng.next(), 1.7);
    const y = top - u * drop;
    const r = rng.range(0.055, 0.1) * (1 - u * 0.35);
    lists[rng.chance(0.62) ? 0 : 1].push(trs(
      t + rng.range(-0.06, 0.06), y, rng.range(-0.04, 0.04) + (o.face ?? 0) * (0.02 + u * 0.03),
      rng.range(0, 3), rng.range(0, 3), rng.range(0, 3), r, r * 0.7, r
    ));
  }
  const cols = [PAL.leafDeep, PAL.leaf];
  lists.forEach((list, i) => {
    if (!list.length) return;
    const inst = new THREE.InstancedMesh(geo, cel({ color: cols[i], bands: 3, tint: 0x5b6f8c }), list.length);
    list.forEach((mx, k) => inst.setMatrixAt(k, mx));
    inst.castShadow = true;
    g.add(inst);
  });
  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  return g;
}

/** The library's after-hours book drop. */
export function makeReturnPost(o = {}) {
  const m = mats();
  const g = new THREE.Group();
  const w = 0.62, d = 0.46, h = 1.0;
  const shell = cel({ color: 0x3f7a6a, bands: 3, tint: 0x4a6a80 });
  g.add(box(w + 0.12, 0.08, d + 0.12, m.concreteMid, 0, 0.04, 0));
  const b = box(w, h, d, shell, 0, 0.08 + h / 2, 0);
  b.castShadow = b.receiveShadow = true;
  g.add(b);
  hullOutline(b, { thickness: 0.0034 });
  /* The sloped top with the slot in it, the hood over the slot, and -- on the
   * *same* face -- the plate and the collection door.  The slot on one side and
   * the lettering on the other is a box you cannot tell the front of. */
  const top0 = box(w + 0.06, 0.1, d + 0.06, cel({ color: 0x356656, bands: 3, tint: 0x4a6a80 }), 0, 0.08 + h + 0.05, 0);
  top0.rotation.x = 0.16;
  top0.castShadow = true;
  g.add(top0);
  g.add(box(w - 0.18, 0.045, 0.1, cel({ color: PAL.black, bands: 2, tint: 0x4b4560 }), 0, 0.08 + h + 0.08, -0.1));
  g.add(box(w - 0.1, 0.03, 0.16, cel({ color: 0x356656, bands: 3, tint: 0x4a6a80 }), 0, 0.08 + h + 0.14, -0.15));
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.25),
    flat({ color: 0xffffff, map: returnPlate(), cache: false }));
  plate.position.set(0, 0.08 + h * 0.72, -(d / 2 + 0.005));
  plate.rotation.y = Math.PI;
  plate.userData.noOutline = true;
  g.add(plate);
  g.add(box(w - 0.12, 0.4, 0.02, cel({ color: 0x356656, bands: 3, tint: 0x4a6a80 }), 0, 0.08 + h * 0.3, -(d / 2 + 0.005)));
  g.add(cyl(0.022, 0.022, 0.02, 8, m.metalDark, 0.16, 0.08 + h * 0.3, -(d / 2 + 0.02)).rotateX(Math.PI / 2));
  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  return g;
}

/** A pet bowl and a saucer of water, left by a wall. */
export function makePetBowl(o = {}) {
  if (skipClutter(o)) return strippedGroup();
  const g = new THREE.Group();
  for (const [dx, c] of [[0, 0xe0574a], [0.22, 0x4a7fae]]) {
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.06, 0.05, 10),
      cel({ color: c, bands: 3, tint: 0x6f6790 }));
    bowl.position.set(dx, 0.025, 0);
    bowl.castShadow = true;
    g.add(bowl);
    const fill = new THREE.Mesh(new THREE.CircleGeometry(0.065, 10),
      flat({ color: dx ? PAL.water : 0xc8a878 }));
    fill.rotation.x = -Math.PI / 2;
    fill.position.set(dx, 0.045, 0);
    g.add(fill);
  }
  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  return g;
}

/* ================================================================== *
 * The corner.
 *
 * A public telephone box, and the guide board and recycling box that stand
 * with it.  The box is the smallest thing in the world that is built like a
 * hero prop, and deliberately so: it is one metre square and it has to carry a
 * street corner on its own, which means the frame, the glazing, the light box,
 * the instrument, the directory shelf and the plinth all have to be real.  A
 * green rectangle with a light on top would read as a vending machine.
 * ================================================================== */

/**
 * 公衆電話ボックス.
 *
 * A 1.0 m square in plan, 2.30 m to the head of the glazing, a 0.30 m light
 * box above that and a cap over it -- so 2.66 m overall, which is about a
 * storey and a half and exactly why it holds a corner.
 *
 * Built from joints rather than by eye, the same rule as the bicycle: the
 * corner posts define the plan, the transom and the sill rail define the pane,
 * and every panel is cut to the space between two of them.  The one thing that
 * has to be got right for it to read at ten metres is the *proportion of frame
 * to glass* -- too much frame and it is a shed, too little and it is a
 * greenhouse.
 */
export function makePhoneBooth(o = {}) {
  const m = mats();
  const g = new THREE.Group();
  g.name = 'openFrame';
  const W = o.w ?? 1.0;                  // plan, x
  const D = o.d ?? 1.0;                  // plan, z
  const H = 2.30;                        // head of the glazing
  const SILL = 0.56;                     // top of the solid lower panel
  const TRAN = 1.98;                      // transom over the pane
  const PLINTH = 0.14;
  const POST = 0.075;

  const green = cel({ color: o.color ?? 0x4f8f6a, bands: 3, tint: 0x4a6a80 });
  const greenDeep = cel({ color: 0x3a6b52, bands: 3, tint: 0x46647c });
  const cream = cel({ color: 0xf2efe4, bands: 3, tint: 0x6f6790 });
  /* 0.42, not the 0.24 a shopfront uses.  A shop pane has a dark interior
   * behind it doing the work; a phone box has sky behind it on three sides, and
   * at shopfront opacity the glazing simply is not there -- what you get is a
   * green frame standing open to the air.  The two angled highlights below are
   * the other half of it: in this look glass is *drawn*, not simulated. */
  const glassMat = flat({
    color: 0xd8e8f0, transparent: true, opacity: 0.42, depthWrite: false,
    side: THREE.DoubleSide, cache: false,
  });

  const parts = { green: [], deep: [], cream: [], metal: [], dark: [] };
  const push = (k, geo, mx) => parts[k].push({ geometry: geo, matrix: mx });

  /* ------------------------------ plinth and frame ------------------------------ */
  push('deep', new THREE.BoxGeometry(W + 0.12, PLINTH, D + 0.12), trs(0, PLINTH / 2, 0));
  push('metal', new THREE.BoxGeometry(W + 0.14, 0.035, D + 0.14), trs(0, PLINTH + 0.015, 0));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      push('green', new THREE.BoxGeometry(POST, H - PLINTH, POST),
        trs(sx * (W / 2 - POST / 2), PLINTH + (H - PLINTH) / 2, sz * (D / 2 - POST / 2)));
    }
  }
  // head rail all round, plus the sill rail and the transom on three sides
  for (const [w0, d0, x0, z0] of [[W, POST, 0, D / 2 - POST / 2], [W, POST, 0, -(D / 2 - POST / 2)],
    [POST, D, W / 2 - POST / 2, 0], [POST, D, -(W / 2 - POST / 2), 0]]) {
    push('green', new THREE.BoxGeometry(w0, 0.09, d0), trs(x0, H - 0.045, z0));
  }
  /* The three glazed sides.  The door is the -z face, so it gets its own
   * treatment below and is skipped here. */
  const SIDES = [
    { n: [0, 1], w: W - POST * 2, x: 0, z: D / 2 - 0.035 },      // back, +z
    { n: [1, 0], w: D - POST * 2, x: W / 2 - 0.035, z: 0 },      // east, +x
    { n: [-1, 0], w: D - POST * 2, x: -(W / 2 - 0.035), z: 0 },  // west, -x
  ];
  for (const s of SIDES) {
    const along = s.n[0] !== 0;          // panel runs along z
    const gx = along ? 0.07 : s.w;
    const gz = along ? s.w : 0.07;
    /* Solid lower panel in the *deep* green, with a cream capping rail over it
     * and a skirting under it.  Two tones, not one: at a single tone the panel
     * is the same value as the frame it sits in and the bottom half of the box
     * reads as empty air -- which is exactly how it came out first time. */
    push('deep', new THREE.BoxGeometry(gx, SILL - PLINTH - 0.06, gz), trs(s.x, (SILL + PLINTH) / 2 + 0.03, s.z));
    push('green', new THREE.BoxGeometry(gx + 0.02, 0.07, gz + 0.02), trs(s.x, PLINTH + 0.035, s.z));
    push('cream', new THREE.BoxGeometry(gx + 0.02, 0.05, gz + 0.02), trs(s.x, SILL + 0.02, s.z));
    push('green', new THREE.BoxGeometry(gx, 0.07, gz), trs(s.x, TRAN + 0.035, s.z));
    // the pane, and the hopper light over the transom
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(s.w, TRAN - SILL - 0.06), glassMat);
    pane.position.set(s.x, (SILL + TRAN) / 2, s.z);
    if (along) pane.rotation.y = Math.PI / 2;
    pane.userData.noOutline = true;
    pane.userData.noShadow = true;
    g.add(pane);
    const hop = new THREE.Mesh(new THREE.PlaneGeometry(s.w, H - TRAN - 0.12), glassMat);
    hop.position.set(s.x, (TRAN + 0.07 + H - 0.09) / 2, s.z);
    if (along) hop.rotation.y = Math.PI / 2;
    hop.userData.noOutline = true;
    hop.userData.noShadow = true;
    g.add(hop);
  }

  /* --------------------------------- the door --------------------------------- *
   * Shut.  A door left ajar is a person who has just walked away, and there is
   * nobody in this world -- but it still has to read as a door, so it gets its
   * own leaf inside the opening, a hinge stile, a kick panel and a pull. */
  {
    const zf = -(D / 2 - 0.035);
    const LW = W - POST * 2 - 0.06;
    // the leaf's own frame
    for (const sx of [-1, 1]) {
      push('green', new THREE.BoxGeometry(0.06, TRAN - PLINTH, 0.06), trs(sx * LW / 2, (TRAN + PLINTH) / 2, zf));
    }
    push('green', new THREE.BoxGeometry(LW, 0.06, 0.06), trs(0, TRAN - 0.03, zf));
    push('deep', new THREE.BoxGeometry(LW, SILL - PLINTH - 0.06, 0.055), trs(0, (SILL + PLINTH) / 2 + 0.03, zf));
    push('green', new THREE.BoxGeometry(LW + 0.02, 0.07, 0.07), trs(0, PLINTH + 0.035, zf));
    push('cream', new THREE.BoxGeometry(LW + 0.02, 0.045, 0.07), trs(0, SILL + 0.02, zf));
    const leaf = new THREE.Mesh(new THREE.PlaneGeometry(LW - 0.08, TRAN - SILL - 0.1), glassMat);
    leaf.position.set(0, (SILL + TRAN) / 2, zf);
    leaf.userData.noOutline = true;
    leaf.userData.noShadow = true;
    g.add(leaf);
    const hop = new THREE.Mesh(new THREE.PlaneGeometry(LW, H - TRAN - 0.12), glassMat);
    hop.position.set(0, (TRAN + 0.07 + H - 0.09) / 2, zf);
    hop.userData.noOutline = true;
    hop.userData.noShadow = true;
    g.add(hop);
    // hinge knuckles and the vertical pull
    for (const y of [0.72, 1.42, 1.88]) {
      push('metal', new THREE.CylinderGeometry(0.022, 0.022, 0.07, 6), trs(-LW / 2, y, zf - 0.045));
    }
    push('metal', new THREE.CylinderGeometry(0.018, 0.018, 0.46, 6), trs(LW / 2 - 0.09, 1.24, zf - 0.075));
    for (const y of [1.02, 1.46]) {
      push('metal', new THREE.BoxGeometry(0.06, 0.03, 0.06), trs(LW / 2 - 0.09, y, zf - 0.055));
    }
  }

  /* -------------------------------- the light box -------------------------------- */
  {
    const art = phoneBoxSign();
    const face = () => flat({ color: 0xfff6e2, map: art, cache: false });
    const side = flat({ color: 0x3a6b52 });
    const box0 = new THREE.Mesh(
      new THREE.BoxGeometry(W + 0.04, 0.3, D + 0.04),
      [face(), face(), side, side, face(), face()]
    );
    box0.position.set(0, H + 0.15, 0);
    box0.castShadow = true;
    g.add(box0);
    hullOutline(box0, { thickness: 0.003 });
    push('deep', new THREE.BoxGeometry(W + 0.16, 0.07, D + 0.16), trs(0, H + 0.335, 0));
    push('deep', new THREE.BoxGeometry(W + 0.1, 0.05, D + 0.1), trs(0, H + 0.02, 0));
  }

  /* ------------------------------- the instrument ------------------------------- *
   * Against the back wall on a shelf, with the directory rack under it.  The
   * handset is on its hook and the cord hangs -- that pair is most of what makes
   * a telephone read as a telephone from outside the glass. */
  {
    const zb = D / 2 - 0.16;
    push('cream', new THREE.BoxGeometry(0.78, 0.05, 0.28), trs(0, 1.02, zb));
    for (const sx of [-1, 1]) {
      push('metal', new THREE.BoxGeometry(0.05, 0.05, 0.26), trs(sx * 0.34, 0.98, zb));
    }
    // the body, its dark fascia, keypad, coin slot and card slot
    push('cream', new THREE.BoxGeometry(0.34, 0.46, 0.17), trs(0.04, 1.28, zb + 0.02));
    push('dark', new THREE.BoxGeometry(0.24, 0.2, 0.03), trs(0.04, 1.24, zb - 0.08));
    for (let r = 0; r < 4; r++) {
      for (let k = 0; k < 3; k++) {
        push('cream', new THREE.BoxGeometry(0.05, 0.032, 0.015),
          trs(-0.03 + k * 0.07, 1.31 - r * 0.045, zb - 0.096));
      }
    }
    push('metal', new THREE.BoxGeometry(0.1, 0.02, 0.02), trs(0.13, 1.46, zb - 0.09));
    push('dark', new THREE.BoxGeometry(0.09, 0.012, 0.02), trs(-0.06, 1.46, zb - 0.09));
    push('metal', new THREE.BoxGeometry(0.12, 0.05, 0.03), trs(0.04, 1.09, zb - 0.09));
    /* The handset on its hook.  What makes it read at two metres is not the
     * shape of the grip but the two fat ends either side of a thin bar, held
     * clear of the body -- the same rule as the crow's tail.  So it stands 60 mm
     * proud of the fascia rather than flush with it. */
    push('dark', new THREE.BoxGeometry(0.05, 0.04, 0.06), trs(-0.21, 1.45, zb - 0.06));
    push('cream', new THREE.BoxGeometry(0.045, 0.2, 0.04), trs(-0.21, 1.29, zb - 0.1));
    for (const dy of [-0.095, 0.095]) {
      push('cream', new THREE.BoxGeometry(0.075, 0.06, 0.085), trs(-0.21, 1.29 + dy, zb - 0.1));
    }
    {
      const cord = new THREE.Mesh(
        new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3([
            new THREE.Vector3(-0.21, 1.19, zb - 0.1),
            new THREE.Vector3(-0.19, 1.07, zb - 0.06),
            new THREE.Vector3(-0.12, 1.05, zb - 0.09),
            new THREE.Vector3(-0.05, 1.1, zb - 0.04),
          ]), 12, 0.011, 4, false),
        cel({ color: 0x5f5768, bands: 2, tint: 0x453f5c }));
      g.add(cord);
    }
    // the directory rack: a sloping shelf with two fat books in it
    push('metal', new THREE.BoxGeometry(0.6, 0.035, 0.24), trs(0, 0.74, zb - 0.02, -0.26, 0, 0));
    push('metal', new THREE.BoxGeometry(0.6, 0.16, 0.03), trs(0, 0.68, zb - 0.13));
    for (const [dx, c] of [[-0.14, 0xd8cdb8], [0.12, 0xc9b89c]]) {
      push('cream', new THREE.BoxGeometry(0.2, 0.07, 0.2), trs(dx, 0.79, zb - 0.02, -0.26, 0, 0));
      push('dark', new THREE.BoxGeometry(0.2, 0.012, 0.2), trs(dx, 0.825, zb - 0.02, -0.26, 0, 0));
    }
    // and the ceiling light, which is the only warm thing inside
    push('cream', new THREE.BoxGeometry(0.5, 0.05, 0.2), trs(0, H - 0.13, 0.06));
    g.add(box(0.44, 0.02, 0.16, flat({ color: 0xfff1d4 }), 0, H - 0.16, 0.06));
  }

  /* the two notices taped inside the glass */
  {
    const n0 = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.23),
      flat({ color: 0xffffff, map: phoneNotice(0), cache: false }));
    n0.position.set(-(W / 2 - 0.055), 1.62, 0.16);
    n0.rotation.y = -Math.PI / 2;
    n0.userData.noOutline = true;
    g.add(n0);
    const n1 = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.2),
      flat({ color: 0xffffff, map: phoneNotice(1), cache: false }));
    n1.position.set(0.24, 1.66, -(D / 2 - 0.09));
    n1.rotation.y = Math.PI;
    n1.userData.noOutline = true;
    g.add(n1);
  }

  /* the two painted highlights, one on the door and one on the west pane */
  for (const [dx, dz, ry, gw] of [
    [0.16, -(D / 2 - 0.05), Math.PI, 0.26],
    [-(W / 2 - 0.05), -0.1, -Math.PI / 2, 0.22],
  ]) {
    const hi = new THREE.Mesh(new THREE.PlaneGeometry(gw, (TRAN - SILL) * 1.02),
      flat({ color: 0xf4fbff, transparent: true, opacity: 0.3, depthWrite: false, cache: false }));
    hi.position.set(dx, (SILL + TRAN) / 2, dz);
    hi.rotation.set(0, ry, 0.26);
    hi.userData.noOutline = true;
    g.add(hi);
  }

  /* Use, as tonal blocks rather than as texture: two faded panels low on the
   * frame where a thousand shoulders have gone past, and a scuff at the base.
   * Nothing here is dirt -- the whole look forbids high-frequency detail. */
  for (const [dx, dz, w0, h0] of [[-(W / 2 - 0.035), 0.18, 0.3, 0.16], [(W / 2 - 0.035), -0.1, 0.22, 0.12]]) {
    const fade = new THREE.Mesh(new THREE.PlaneGeometry(w0, h0),
      flat({ color: 0x7fae90, transparent: true, opacity: 0.4, depthWrite: false, cache: false }));
    fade.position.set(dx + Math.sign(dx) * 0.005, 0.4, dz);
    fade.rotation.y = dx < 0 ? -Math.PI / 2 : Math.PI / 2;
    fade.userData.noOutline = true;
    g.add(fade);
  }

  const matFor = { green, deep: greenDeep, cream, metal: m.metal, dark: m.dark };
  for (const key of Object.keys(parts)) {
    if (!parts[key].length) continue;
    const mesh = new THREE.Mesh(bake(parts[key]), matFor[key]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
    if (key === 'green') hullOutline(mesh, { thickness: 0.0034 });
  }

  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  g.userData.top = H + 0.37;
  const ctx = o.ctx;
  if (ctx && o.x != null && o.z != null) {
    const y = o.y ?? 0;
    const ca = Math.cos(o.ry ?? 0);
    const sa = Math.sin(o.ry ?? 0);
    const put = (lx, lz, hw, hh, top, bot, skip) => {
      const px = o.x + ca * lx - sa * lz;
      const pz = o.z + sa * lx + ca * lz;
      ctx.collide(px - hw, pz - hh, px + hw, pz + hh, y + top, y + bot, skip);
    };
    put(0, 0, W / 2 + 0.08, D / 2 + 0.08, PLINTH + 0.04, 0, true);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        put(sx * (W / 2 - POST / 2), sz * (D / 2 - POST / 2), 0.06, 0.06, H, PLINTH, true);
      }
    }
    put(0, 0, W / 2 + 0.08, D / 2 + 0.08, H + 0.38, H - 0.04, true);
    put(0, D / 2 - 0.04, W / 2 - 0.02, 0.05, SILL, PLINTH, true);
    put(0, -(D / 2 - 0.04), W / 2 - 0.02, 0.05, SILL, PLINTH, true);
    put(W / 2 - 0.04, 0, 0.05, D / 2 - 0.02, SILL, PLINTH, true);
    put(-(W / 2 - 0.04), 0, 0.05, D / 2 - 0.02, SILL, PLINTH, true);
  }
  return g;
}

/** The 街区案内図 board: two posts, a raked panel and a shallow hood. */
export function makeGuideBoard(o = {}) {
  const m = mats();
  const g = new THREE.Group();
  g.name = 'openFrame';
  const w = o.w ?? 1.5;
  const h = o.h ?? 1.05;
  const y0 = o.y0 ?? 0.95;
  const frame = cel({ color: 0x6f7a86, bands: 3, tint: 0x5c5680 });

  for (const s of [-1, 1]) {
    const p = box(0.09, y0 + h, 0.09, frame, s * (w / 2 - 0.12), (y0 + h) / 2, 0);
    p.castShadow = true;
    g.add(p);
    g.add(cyl(0.11, 0.13, 0.12, 8, m.concreteMid, s * (w / 2 - 0.12), 0.06, 0));
  }
  /* **The panel does not lean.**  It had `rotation.x = -0.12` and sat at z 0.02,
   * which is a 7° tilt about its own centre on a 1.05 m board: the bottom edge
   * swung back to z = -0.043 -- *inside* the two 0.09 m posts at z 0 -- and the
   * top edge swung forward past the hood's leading edge.  So every 街区案内図 in
   * the world had its own frame growing through its map, at the school and at the
   * library both.  A guide board is bolted flat to its posts; the depth that
   * makes it read is the hood over it, which does tilt. */
  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, 0.08),
    [frame, frame, frame, frame,
     flat({ color: 0xffffff, map: guideBoard(), cache: false }), frame]
  );
  panel.position.set(0, y0 + h / 2, 0.09);
  panel.castShadow = panel.receiveShadow = true;
  g.add(panel);
  hullOutline(panel, { thickness: 0.003 });
  // hood over the top, and the rail under it
  const hood = box(w + 0.16, 0.05, 0.3, frame, 0, y0 + h + 0.11, 0.14);
  hood.rotation.x = -0.16;
  g.add(hood);
  g.add(box(w + 0.06, 0.07, 0.14, frame, 0, y0 - 0.03, 0.07));
  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  const ctx = o.ctx;
  if (ctx && o.x != null && o.z != null) {
    const y = o.y ?? 0;
    const ry = o.ry ?? 0;
    for (const s of [-1, 1]) {
      yawCollide(ctx, o.x, o.z, y, ry, s * (w / 2 - 0.12), 0, 0.07, 0.07, y0 + h + 0.12, 0);
    }
    yawSlab(ctx, o.x, o.z, y, ry, w / 2 + 0.08, 0.1, y0 + h + 0.08, y0);
    yawSlab(ctx, o.x, o.z, y, ry, w / 2 + 0.1, 0.16, y0 + h + 0.18, y0 + h + 0.04);
  }
  return g;
}

/** The lidded resource box a neighbourhood keeps on its corner. */
export function makeRecycleBox(o = {}) {
  if (skipClutter(o)) return strippedGroup();
  const m = mats();
  const g = new THREE.Group();
  const w = o.w ?? 0.86, d = o.d ?? 0.54, h = o.h ?? 0.66;
  const body = cel({ color: o.color ?? 0x4a7fae, bands: 3, tint: 0x4a4a92 });
  const b = box(w, h, d, body, 0, h / 2, 0);
  b.castShadow = b.receiveShadow = true;
  g.add(b);
  hullOutline(b, { thickness: 0.0032 });
  // the lid, cracked open at the front, and the two catches
  const lid = box(w + 0.05, 0.07, d + 0.05, cel({ color: 0x3f6f9c, bands: 3, tint: 0x4a4a92 }),
    0, h + 0.05, -0.02);
  lid.rotation.x = -0.07;
  lid.castShadow = true;
  g.add(lid);
  for (const s of [-1, 1]) {
    g.add(box(0.09, 0.11, 0.03, m.metalDark, s * (w / 2 - 0.14), h - 0.02, d / 2 + 0.02));
  }
  // the ribs every moulded box has, and the stencil panel
  for (let i = 0; i < 3; i++) {
    g.add(box(w + 0.02, 0.025, d + 0.02, cel({ color: 0x3f6f9c, bands: 2, tint: 0x4a4a92 }),
      0, 0.16 + i * 0.18, 0));
  }
  g.add(box(0.42, 0.16, 0.02, flat({ color: 0xf2efe4 }), 0, h * 0.56, d / 2 + 0.015));
  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  return g;
}

/** Vending-machine-style crate stack, used to dress dead corners. */
export function makeCrates(o = {}) {
  if (skipClutter(o)) return strippedGroup();
  const rng = rngKit(o.seed ?? 4);
  const g = new THREE.Group();
  const n = o.n ?? 4;
  for (let i = 0; i < n; i++) {
    const c = box(0.5, 0.28, 0.34,
      cel({ color: rng.pick([PAL.crate, PAL.crateAlt, 0x4f9d6a]), bands: 3, tint: 0x4a4a92 }),
      rng.range(-0.05, 0.05), 0.14 + i * 0.28, rng.range(-0.05, 0.05));
    c.rotation.y = rng.range(-0.1, 0.1);
    c.castShadow = c.receiveShadow = true;
    g.add(c);
  }
  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  return g;
}
