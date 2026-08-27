import * as THREE from 'three';
import { PAL } from '../core/palette.js';
import { cel, flat } from '../core/toon.js';
import { chainLinkTex, platePlate } from '../core/textures.js';
import { box, cyl, bake, trs, rngKit, sagCurve } from '../core/util.js';
import { hullOutline } from '../core/outline.js';
import { makeBicycle, skipClutter, strippedGroup } from './props.js';

/* ------------------------------------------------------------------ *
 * Furniture for the residential blocks.
 *
 * Eleven props that a lane of houses needs and `props.js` does not have: the
 * built refuse enclosure, the parcel locker, the scooter on its stand, the
 * grow box, the child's bicycle, the airer, the ball crate, a parking bay's
 * wheel stops, the gas meter, the water meter lid and the chalk on the
 * paving.
 *
 * All of it is seen from two metres in a 3 m lane, which is what sets the
 * detail level: at that range a prop is read from its joints and its
 * silhouette, not from its surface.  And -- as everywhere else in this world
 * -- the story is told by what has been parked, planted, hung out or left
 * behind.  There is nobody in any of it, including the chalk.
 * ------------------------------------------------------------------ */

const M = {};
function mats() {
  if (M.concrete) return M;
  M.concrete = cel({ color: PAL.concrete, bands: 3, tint: 0x6f6790 });
  M.concreteMid = cel({ color: PAL.concreteMid, bands: 3, tint: 0x6a6288 });
  M.metal = cel({ color: PAL.metal, bands: 3, tint: 0x666090 });
  M.metalDark = cel({ color: PAL.metalDark, bands: 3, tint: 0x5c5680 });
  M.dark = cel({ color: PAL.black, bands: 2, tint: 0x4b4560 });
  M.shell = cel({ color: 0xc4c8ce, bands: 3, tint: 0x666090 });     // pressed steel
  M.shellTrim = cel({ color: 0x9aa0a8, bands: 3, tint: 0x5c5680 });
  M.wood = cel({ color: 0x9c7f5e, bands: 3, tint: 0x5c5680 });
  M.woodDark = cel({ color: 0x7d6348, bands: 3, tint: 0x5c5680 });
  M.soil = cel({ color: 0x74624e, bands: 3, tint: 0x615a80 });
  /* Canes and twine get `flat: false`.  At that thickness you only ever see
   * one facet, and a flat-shaded facet turned away from the sun is nearly
   * black -- which is how the first canal reeds came out as a bundle of dark
   * skewers. */
  M.bamboo = cel({ color: PAL.bamboo, bands: 3, flat: false, tint: 0x5b6f8c });
  M.twine = cel({ color: PAL.rope, bands: 3, flat: false, tint: 0x6f6790 });
  M.pale = flat({ color: 0xf6f2e8 });                               // printed panels
  return M;
}

/* ------------------------------ shared helpers ------------------------------ */

const V3 = (x, y, z = 0) => new THREE.Vector3(x, y, z);
const _up = V3(0, 1, 0);
const _unit = new Map();
function unitCyl(seg) {
  if (!_unit.has(seg)) _unit.set(seg, new THREE.CylinderGeometry(1, 1, 1, seg, 1));
  return _unit.get(seg);
}

/**
 * A round member drawn *between two points*, pushed onto a bake list.
 *
 * The scooter, the airer and the grow box's canes are all assemblies of more
 * than three connected members, which is where `props.js` puts the line: both
 * copies of the bicycle placed their tubes by eye and neither of them joined
 * up.  Drawing every member between two named joints makes a shared end
 * shared by construction, so it cannot drift.
 */
function member(arr, a, b, r, seg = 6) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  if (len < 1e-4) return;
  arr.push({
    geometry: unitCyl(seg),
    matrix: new THREE.Matrix4().compose(
      new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5),
      new THREE.Quaternion().setFromUnitVectors(_up, dir.normalize()),
      V3(r, len, r)
    ),
  });
}

/**
 * Bake each bucket of `parts` into one mesh per material.
 *
 * Every prop here is a couple of dozen small members and most of them get
 * placed a dozen times down a lane, so one mesh per material is the
 * difference between a row of clutter costing forty draw calls and costing
 * four.  `noCast` is for the thin overhanging pieces -- a 40 mm coping is
 * about two shadow-map texels at this cascade size, so its own shadow lands
 * as a row of sawtooth triangles along the wall face rather than as a line.
 */
function emit(g, parts, matFor, o = {}) {
  const noCast = o.noCast ?? [];
  for (const key of Object.keys(parts)) {
    if (!parts[key].length) continue;
    const mesh = new THREE.Mesh(bake(parts[key]), matFor[key]);
    mesh.castShadow = !noCast.includes(key);
    mesh.receiveShadow = true;
    g.add(mesh);
    if (key === o.outline) hullOutline(mesh, { thickness: o.thickness ?? 0.0032 });
  }
  return g;
}

/** A lattice panel with genuinely transparent gaps, sized to its own extent. */
function latticePanel(w, h, cell = 0.13, color = 0xc2c8d0) {
  const tex = chainLinkTex().clone();     // clone: the map is shared with the fences
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(w / cell, h / cell);
  tex.needsUpdate = true;
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    flat({
      color, map: tex, transparent: true, opacity: 0.82,
      side: THREE.DoubleSide, depthWrite: false, cache: false,
    })
  );
  panel.userData.noOutline = true;
  panel.userData.noShadow = true;
  return panel;
}

/* =================================================================== *
 * ゴミ集積所 -- the built refuse enclosure.
 * =================================================================== */

/**
 * The block-built refuse point: three low walls, a sheet roof, a mesh gate
 * and the bins behind it.  1.90 x 1.10 m in plan and 1.35 m to the front edge
 * of the roof, which is the size that reads as *built* rather than as three
 * bins with a fence round them.
 *
 * Two things worth knowing before placing one:
 *
 *  - The gate is on **+z** and stands ajar, so its leaf swings 0.6 m out of
 *    the footprint on the hinge side.  A collider sized to the walls alone
 *    leaves the leaf inside the walkable lane, and the player's `RADIUS` is
 *    added to every side of it.
 *  - The collection plate goes flat on the **left-hand wall** (looking at the
 *    gate, so local -x), not on the front: the front is a mesh leaf that
 *    swings, and a rigid notice bolted to it swings away with it.  The caller
 *    turns the whole enclosure with `ry` to put the plate on the approach.
 *    The plate is 0.42 x 0.30, i.e. 7:5, so `o.plateMap` wants drawing to
 *    that -- a map at the wrong aspect renders as an unreadable smear, not as
 *    an error.
 */
export function makeGomiHouse(o = {}) {
  const m = mats();
  const g = new THREE.Group();
  g.name = 'openFrame';
  const W = o.w ?? 1.9;                  // plan, x
  const D = o.d ?? 1.1;                  // plan, z
  const H = o.h ?? 1.05;                 // block height above the slab
  const T = 0.12;                        // block thickness
  const SLAB = 0.09;
  const TOP = SLAB + H + 0.06;           // top of the coping
  const parts = { block: [], cap: [], sheet: [], metal: [], lid: [] };
  const push = (k, geo, mx) => parts[k].push({ geometry: geo, matrix: mx });

  /* ---------------------------- slab and three walls ---------------------------- */
  push('block', new THREE.BoxGeometry(W + 0.12, SLAB, D + 0.12), trs(0, SLAB / 2, 0));
  push('block', new THREE.BoxGeometry(W, H, T), trs(0, SLAB + H / 2, -(D / 2 - T / 2)));
  for (const sx of [-1, 1]) {
    push('block', new THREE.BoxGeometry(T, H, D), trs(sx * (W / 2 - T / 2), SLAB + H / 2, 0));
    push('cap', new THREE.BoxGeometry(T + 0.08, 0.06, D + 0.08), trs(sx * (W / 2 - T / 2), TOP - 0.03, 0));
  }
  push('cap', new THREE.BoxGeometry(W + 0.08, 0.06, T + 0.08), trs(0, TOP - 0.03, -(D / 2 - T / 2)));

  /* -------------------------------- the roof --------------------------------
   * One mono-pitch sheet falling to the back, so the high edge is the one you
   * stand in front of.  A box along z rotated by +t about X sends its +z end
   * *down*, so the fall to -z is a negative rotation -- the sign the
   * overbridge stringers got wrong in both directions. */
  const RAKE = -0.10;
  push('sheet', new THREE.BoxGeometry(W + 0.14, 0.05, D + 0.22), trs(0, TOP + 0.05, 0.02, RAKE, 0, 0));
  push('sheet', new THREE.BoxGeometry(W + 0.14, 0.05, 0.06), trs(0, TOP + 0.11, D / 2 + 0.11));  // front lip
  for (const sx of [-1, 1]) {                                                     // bearers
    push('metal', new THREE.BoxGeometry(0.05, 0.05, D + 0.1), trs(sx * (W / 2 - T), TOP + 0.01, 0.02, RAKE, 0, 0));
  }

  /* --------------------------------- the bins ---------------------------------
   * The same three colours the loose `makeBins` uses, so a house with an
   * enclosure and a house with a kerbside pile read as the same district. */
  [PAL.bin, 0x7fae6a, 0xd8c34a].forEach((c, i) => {
    const bx = -0.52 + i * 0.52;
    const b = box(0.44, 0.62, 0.4, cel({ color: c, bands: 3, tint: 0x6f6790 }), bx, SLAB + 0.31, -0.06);
    b.castShadow = b.receiveShadow = true;
    g.add(b);
    push('lid', new THREE.BoxGeometry(0.47, 0.05, 0.43), trs(bx, SLAB + 0.64, -0.06));
  });

  /* --------------------------------- the gate ---------------------------------
   * Hinged on the -x jamb and standing a little open.  Rotating a leaf that
   * runs out along +x by a *negative* ry swings its free end toward +z, i.e.
   * out of the enclosure; a positive one would fold it into the bins. */
  {
    const LW = W - 2 * T - 0.04;
    const LH = 0.92;
    const gate = new THREE.Group();
    gate.position.set(-(W / 2 - T), SLAB, D / 2 - 0.06);
    gate.rotation.y = o.gateOpen ?? -0.42;
    const gp = [];
    for (const t of [0.025, LW - 0.025]) {
      gp.push({ geometry: new THREE.BoxGeometry(0.05, LH, 0.05), matrix: trs(t, LH / 2, 0) });
    }
    for (const y of [0.025, LH / 2, LH - 0.025]) {
      gp.push({ geometry: new THREE.BoxGeometry(LW, 0.045, 0.045), matrix: trs(LW / 2, y, 0) });
    }
    const frame = new THREE.Mesh(bake(gp), m.metal);
    frame.castShadow = true;
    gate.add(frame);
    const panel = latticePanel(LW - 0.08, LH - 0.1, 0.11);
    panel.position.set(LW / 2, LH / 2, 0);
    gate.add(panel);
    g.add(gate);
    // the hinge knuckles it hangs on, and the keeper on the far jamb
    for (const y of [SLAB + 0.16, SLAB + LH - 0.16]) {
      push('metal', new THREE.CylinderGeometry(0.028, 0.028, 0.09, 6), trs(-(W / 2 - T), y, D / 2 - 0.06));
    }
    push('metal', new THREE.BoxGeometry(0.05, 0.1, 0.06), trs(W / 2 - T + 0.02, SLAB + 0.5, D / 2 - 0.05));
  }

  emit(g, parts, {
    block: m.concreteMid, cap: m.concrete, sheet: m.shellTrim,
    metal: m.metalDark, lid: m.dark,
  }, { outline: 'block', thickness: 0.0034, noCast: ['cap'] });

  /* The collection plate.  A box, not a plane: at 0.03 thick it inks along its
   * edge from a grazing angle, and it stands 0.015 clear of the wall face so
   * the two are not coplanar. */
  {
    const side = flat({ color: PAL.wallGray });
    const face = o.plateMap
      ? flat({ color: 0xffffff, map: o.plateMap, cache: false })
      : flat({ color: 0xf2efe4 });
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.3, 0.42),
      [side, face, side, side, side, side]);
    plate.position.set(-(W / 2 + 0.005), SLAB + H * 0.6, 0.06);
    plate.castShadow = true;
    g.add(plate);
  }

  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  // local height, the way `buildings.js` and `housing.js` report it: callers
  // add their own ground Y when they size the collider
  g.userData.top = TOP + 0.14;
  const ctx = o.ctx;
  if (ctx && o.x != null && o.z != null) {
    const y = o.y ?? 0;
    const ca = Math.cos(o.ry ?? 0);
    const sa = Math.sin(o.ry ?? 0);
    const put = (lx, lz, hw, hd, top, bot, skip) => {
      const px = o.x + ca * lx - sa * lz;
      const pz = o.z + sa * lx + ca * lz;
      const hx = Math.abs(ca) * hw + Math.abs(sa) * hd;
      const hz = Math.abs(sa) * hw + Math.abs(ca) * hd;
      ctx.collide(px - hx, pz - hz, px + hx, pz + hz, y + top, y + bot, skip);
    };
    put(0, 0, (W + 0.12) / 2, (D + 0.12) / 2, SLAB, 0, true);
    put(0, -(D / 2 - T / 2), W / 2, T / 2 + 0.02, TOP, SLAB, true);
    for (const sx of [-1, 1]) {
      put(sx * (W / 2 - T / 2), 0, T / 2 + 0.02, D / 2, TOP, SLAB, true);
    }
    put(0, 0, (W + 0.14) / 2, (D + 0.22) / 2, TOP + 0.14, TOP - 0.02, true);
    for (const bx of [-0.52, 0, 0.52]) {
      put(bx, -0.06, 0.24, 0.22, SLAB + 0.66, SLAB, true);
    }
  }
  return g;
}

/* =================================================================== *
 * 宅配ロッカー -- the public parcel locker.
 * =================================================================== */

/**
 * A parcel locker: plinth, cabinet, four unequal doors, a control panel and a
 * drip roof.  1.25 m wide, 1.75 m to the ridge, 0.50 m deep.
 *
 * The doors are on **+z**, so `ry` is `atan2(nx, nz)` of the outward normal of
 * whatever it backs onto and the caller puts the origin at
 * `wall + (0.25 + clearance)` along that normal -- the same convention as
 * `makeAircon` and every name plate in the world.  A locker addressing the
 * building instead of the street is four blank grey panels.
 *
 * The doors are *unequal* on purpose: one large, two medium, one small, large
 * at the bottom where a parcel actually goes.  Four equal doors is a bank of
 * letterboxes, which is a different prop.
 */
export function makeLockerBank(o = {}) {
  const m = mats();
  const g = new THREE.Group();
  const W = 1.25, D = 0.5;
  const PL = 0.1;                        // plinth
  const BH = 1.42;                       // cabinet
  const TOPB = PL + BH;                  // 1.52, top of the cabinet
  const HEAD = 0.16;                      // header board
  const RIDGE = 1.75;
  const parts = { panel: [], metal: [], dark: [], card: [] };
  const push = (k, geo, mx) => parts[k].push({ geometry: geo, matrix: mx });

  push('metal', new THREE.BoxGeometry(W + 0.08, PL, D + 0.08), trs(0, PL / 2, 0));
  const body = box(W, BH, D, cel({ color: o.color ?? 0xbfc6c2, bands: 3, tint: 0x666090 }), 0, PL + BH / 2, 0);
  body.castShadow = body.receiveShadow = true;
  g.add(body);
  hullOutline(body, { thickness: 0.0034 });

  /* ------------------------------- the doors -------------------------------
   * Heights 0.22 / 0.31 / 0.31 / 0.46 top to bottom with 0.02 shadow gaps and
   * a 0.04 head and 0.02 sill margin, which is exactly the 1.42 of the
   * cabinet.  The column takes 0.86 of the width and the control panel the
   * rest. */
  const DW = 0.86;
  const dcx = -W / 2 + 0.04 + DW / 2;
  let top = TOPB - 0.04;
  for (const dh of [0.22, 0.31, 0.31, 0.46]) {
    const cy = top - dh / 2;
    push('panel', new THREE.BoxGeometry(DW, dh - 0.02, 0.022), trs(dcx, cy, D / 2 + 0.011));
    // a pull bar over on the opening side, and the number card on the hinge side
    push('metal', new THREE.BoxGeometry(0.14, 0.03, 0.035), trs(dcx + DW / 2 - 0.11, cy, D / 2 + 0.036));
    push('card', new THREE.BoxGeometry(0.055, 0.032, 0.008), trs(dcx - DW / 2 + 0.06, cy + dh / 2 - 0.06, D / 2 + 0.028));
    push('dark', new THREE.BoxGeometry(0.022, 0.022, 0.02), trs(dcx + DW / 2 - 0.04, cy - dh / 2 + 0.05, D / 2 + 0.03));
    top -= dh + 0.02;
  }

  /* ----------------------------- the control panel -----------------------------
   * Narrow, on the +x side, and dark against the shell so it reads as the one
   * part of the box you are meant to touch. */
  {
    const px = dcx + DW / 2 + 0.02 + 0.13;
    push('dark', new THREE.BoxGeometry(0.26, 0.94, 0.02), trs(px, PL + 0.94, D / 2 + 0.01));
    const screen = box(0.19, 0.13, 0.014, flat({ color: 0x9fb8c4 }), px, PL + 1.3, D / 2 + 0.027);
    g.add(screen);
    for (let r = 0; r < 4; r++) {
      for (let k = 0; k < 3; k++) {
        push('card', new THREE.BoxGeometry(0.05, 0.036, 0.014),
          trs(px - 0.07 + k * 0.07, PL + 1.12 - r * 0.05, D / 2 + 0.026));
      }
    }
    push('metal', new THREE.BoxGeometry(0.16, 0.02, 0.02), trs(px, PL + 0.84, D / 2 + 0.026));   // card slot
    push('card', new THREE.BoxGeometry(0.2, 0.14, 0.008), trs(px, PL + 0.6, D / 2 + 0.024));     // instructions
  }

  /* ------------------------- header board and drip roof ------------------------- */
  {
    const side = cel({ color: 0x8f9aa0, bands: 3, tint: 0x5c5680 });
    const face = o.plateMap
      ? flat({ color: 0xffffff, map: o.plateMap, cache: false })
      : flat({ color: 0xeae6da });
    const head = new THREE.Mesh(new THREE.BoxGeometry(W, HEAD, D - 0.04),
      [side, side, side, side, face, side]);
    head.position.set(0, TOPB + HEAD / 2, 0);
    head.castShadow = true;
    g.add(head);
    // two slabs to a ridge: a box along z rotated +t about X sends its +z end
    // down, so the far slope takes the negative angle
    const EAVE = RIDGE - 0.07;
    for (const sz of [-1, 1]) {
      push('metal', new THREE.BoxGeometry(W + 0.12, 0.04, 0.32),
        trs(0, (RIDGE + EAVE) / 2, sz * 0.15, sz * 0.24, 0, 0));
    }
    push('metal', new THREE.BoxGeometry(W + 0.14, 0.05, 0.07), trs(0, RIDGE, 0));
  }

  emit(g, parts, {
    panel: cel({ color: 0xd2d8d4, bands: 3, tint: 0x666090 }),
    metal: m.metalDark, dark: m.dark, card: m.pale,
  });

  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  g.userData.top = RIDGE;
  return g;
}

/* =================================================================== *
 * 原付 -- the 50 cc scooter.
 * =================================================================== */

/**
 * A step-through 50, 1.65 m long, 0.62 m to the seat, leant about five
 * degrees onto its side stand.
 *
 * Authored **along +x with its nose at +x**, which is the vehicle convention
 * in this world rather than the +z one the wall-mounted props use:
 * `makeBicycle` and `makeKeiTruck` are both built that way, and a scooter is
 * parked in the same rows as the bicycles, so one shared `ry` has to nose
 * them the same way.  `lean` then rolls it about its own length on an inner
 * group -- set on the outer group it would pitch the machine nose-up instead,
 * which is the mistake `makeBicycle` records.
 *
 * Everything structural is drawn between named joints.  The silhouette is
 * carried by five things and it is worth not losing any of them: the
 * stepped-through gap between the legshield and the seat, the front apron, the
 * round headlamp, the mirrors up on stalks, and the rear carrier.
 */
export function makeScooter(o = {}) {
  if (skipClutter(o)) return strippedGroup();
  const m = mats();
  const g = new THREE.Group();
  const inner = new THREE.Group();
  g.add(inner);

  const R = 0.2;                          // wheel radius, 10 inch plus tyre
  /* 1.17 m wheelbase and a fork raked back to the headstock, so the front wheel
   * sits *under* the legshield.  At 1.20 with a near-vertical fork it stood far
   * enough forward to read as a separate wheel with a gap to the machine -- and
   * because every member is drawn between joints, pulling the axle back moves
   * the fork blades, the guard, the rim and the hub with it. */
  const P = {
    RA: V3(-0.6, R), FA: V3(0.57, R),     // axles
    ENG: V3(-0.3, 0.28),                  // swingarm pivot
    RS: V3(-0.22, 0.3), FS: V3(0.3, 0.28),// floor, back and front
    HS: V3(0.48, 0.62),                   // fork crown = headstock bottom
    HT: V3(0.4, 0.96),                    // headstock top
    BAR: V3(0.38, 1.0),
    SHK: V3(-0.44, 0.5),                  // top shock mount
  };
  const parts = { dark: [], metal: [], body: [], amber: [], dial: [] };
  const push = (k, geo, mx) => parts[k].push({ geometry: geo, matrix: mx });
  /* A blue-grey rather than the cream a scooter is usually painted: against the
   * pale paving of a lane, cream bodywork is the same tonal value as the ground
   * and the whole machine collapses into its own ink outline. */
  const bodyMat = cel({ color: o.color ?? 0xc9d4dc, bands: 3, tint: 0x6f6790 });

  /* -------------------------------- wheels --------------------------------
   * Solid tyre with a rim disc standing 10 mm proud of each sidewall.  A rim
   * *inside* a solid tyre is not drawn at all, and a plain dark cylinder at
   * eight metres is a dot rather than a wheel. */
  for (const hub of [P.RA, P.FA]) {
    push('dark', new THREE.CylinderGeometry(R, R, 0.09, 14), trs(hub.x, hub.y, 0, Math.PI / 2));
    push('metal', new THREE.CylinderGeometry(0.125, 0.125, 0.11, 12), trs(hub.x, hub.y, 0, Math.PI / 2));
    push('dark', new THREE.CylinderGeometry(0.038, 0.038, 0.13, 8), trs(hub.x, hub.y, 0, Math.PI / 2));
  }
  /* Mudguards: a torus arc scaled 2.2 in z, so the round tube becomes a wide
   * flat fender instead of a length of pipe over the tyre. */
  push('body', new THREE.TorusGeometry(R + 0.04, 0.026, 4, 14, Math.PI * 0.85),
    trs(P.FA.x, P.FA.y, 0, 0, 0, -0.72, 1, 1, 2.2));
  /* The rear guard sits in the 0.14 m slot between the two side panels, so it
   * has to be narrower than they are set out or it is simply inside them. */
  push('body', new THREE.TorusGeometry(R + 0.05, 0.032, 4, 12, Math.PI * 0.62),
    trs(P.RA.x, P.RA.y, 0, 0, 0, 0.55, 1, 1, 1.9));

  /* --------------------------------- frame --------------------------------- */
  for (const s of [-1, 1]) {
    member(parts.metal, V3(P.HS.x, P.HS.y, s * 0.055), V3(P.FA.x, P.FA.y, s * 0.055), 0.019);  // fork
    member(parts.metal, V3(P.ENG.x, P.ENG.y, s * 0.062), V3(P.RA.x, P.RA.y, s * 0.062), 0.022); // swingarm
  }
  member(parts.metal, P.HS, P.HT, 0.026);          // steering column
  member(parts.metal, P.HS, P.FS, 0.026);          // front down spar
  member(parts.metal, P.FS, P.RS, 0.024);          // floor spine
  member(parts.metal, P.RS, P.SHK, 0.024);         // rear frame rail
  member(parts.metal, V3(P.SHK.x, P.SHK.y, 0.07), V3(P.RA.x + 0.02, P.RA.y + 0.04, 0.07), 0.024); // shock
  member(parts.metal, V3(-0.14, 0.26, -0.09), V3(-0.24, 0.015, -0.19), 0.016);  // side stand, on the left

  /* -------------------------------- bodywork --------------------------------
   * The side panels run to z = +-0.125 with the rear tyre between them, the way
   * it is on the real thing.  A single full-width tail box at seat height goes
   * straight through the tyre instead -- which does not throw and cannot be
   * seen, because the part of the tyre it eats is inside the box.
   *
   * They have to reach *back over* the axle, too.  At 0.36 long they stopped
   * level with the front of the rear wheel and the machine came out as a bare
   * frame with a toolbox floating over the back tyre -- no mass between the
   * seat and the wheel at all, which is most of a scooter's silhouette. */
  for (const s of [-1, 1]) {
    push('body', new THREE.BoxGeometry(0.5, 0.24, 0.11), trs(-0.4, 0.4, s * 0.125));
  }
  push('body', new THREE.BoxGeometry(0.46, 0.09, 0.34), trs(-0.4, 0.505, 0));       // deck over the wheel
  /* The seat in two pieces: the cushion, and the nose that runs forward over
   * the step-through.  One flat slab reads as a plank laid on a box. */
  push('dark', new THREE.BoxGeometry(0.34, 0.08, 0.3), trs(-0.46, 0.59, 0));
  push('dark', new THREE.BoxGeometry(0.16, 0.065, 0.2), trs(-0.24, 0.575, 0));
  push('body', new THREE.BoxGeometry(0.56, 0.03, 0.36), trs(0.06, 0.275, 0));       // footboard
  push('dark', new THREE.BoxGeometry(0.46, 0.014, 0.28), trs(0.04, 0.297, 0));      // rubber mat
  /* Front apron and legshield, raked back off the vertical, with the skirt that
   * carries it down to the floor.  At 0.10 thick the apron read as a blade
   * standing on edge rather than as the front of anything. */
  push('body', new THREE.BoxGeometry(0.16, 0.46, 0.42), trs(0.38, 0.68, 0, 0, 0, 0.22));
  push('body', new THREE.BoxGeometry(0.16, 0.16, 0.38), trs(0.3, 0.4, 0));
  push('body', new THREE.BoxGeometry(0.16, 0.18, 0.3), trs(0.4, 0.94, 0));          // bar cowl
  // exhaust and silencer, out on the right where the tyre is not
  member(parts.metal, V3(-0.28, 0.28, 0.09), V3(-0.5, 0.245, 0.13), 0.024);
  push('metal', new THREE.CylinderGeometry(0.045, 0.045, 0.24, 10), trs(-0.62, 0.24, 0.14, 0, 0, Math.PI / 2));

  /* ---------------------------- carrier and plate ---------------------------- */
  push('metal', new THREE.BoxGeometry(0.28, 0.025, 0.26), trs(-0.66, 0.655, 0));
  for (const s of [-1, 1]) {
    member(parts.metal, V3(-0.56, 0.65, s * 0.11), V3(-0.5, 0.55, s * 0.13), 0.014);
    member(parts.metal, V3(-0.78, 0.65, s * 0.11), V3(-0.68, 0.55, s * 0.12), 0.014);
    // the grab rail, up off the carrier -- the one thing that breaks the tail's
    // flat top and reads from behind
    member(parts.metal, V3(-0.54, 0.6, s * 0.145), V3(-0.72, 0.7, s * 0.115), 0.013);
  }
  member(parts.metal, V3(-0.72, 0.7, -0.115), V3(-0.72, 0.7, 0.115), 0.013);
  {
    const side = flat({ color: PAL.wallGray });
    const face = flat({ color: 0xffffff, map: platePlate(), cache: false });
    // 0.24 x 0.13 on the -x face, which is 1.85:1 against the map's 2:1 -- close
    // enough not to crush the type, which is what a mismatch reads as
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.13, 0.24),
      [side, face, side, side, side, side]);
    plate.position.set(-0.77, 0.42, 0);
    plate.castShadow = true;
    inner.add(plate);
  }

  /* ---------------------------- bars and mirrors ---------------------------- */
  push('metal', new THREE.CylinderGeometry(0.018, 0.018, 0.56, 6), trs(P.BAR.x, P.BAR.y, 0, Math.PI / 2));
  member(parts.metal, P.HT, P.BAR, 0.022);
  for (const s of [-1, 1]) {
    push('dark', new THREE.CylinderGeometry(0.024, 0.024, 0.11, 6), trs(P.BAR.x, P.BAR.y, s * 0.22, Math.PI / 2));
    member(parts.metal, V3(0.36, 1.02, s * 0.18), V3(0.32, 1.24, s * 0.24), 0.012);
    push('dark', new THREE.BoxGeometry(0.03, 0.11, 0.14), trs(0.31, 1.26, s * 0.25));
    inner.add(box(0.008, 0.09, 0.12, flat({ color: PAL.mirrorFace }), 0.294, 1.26, s * 0.25));
    push('amber', new THREE.BoxGeometry(0.06, 0.05, 0.05), trs(0.45, 0.86, s * 0.19));
  }

  /* -------------------------------- headlamp --------------------------------
   * Round, and standing proud of the cowl rather than flush in it: at eight
   * metres the lamp is one of only two circles on the whole machine and it has
   * to survive being read as a silhouette. */
  push('metal', new THREE.CylinderGeometry(0.095, 0.095, 0.06, 14), trs(0.48, 0.9, 0, 0, 0, Math.PI / 2));
  inner.add(cyl(0.082, 0.082, 0.02, 14, flat({ color: 0xfff4d8 }), 0.514, 0.9, 0).rotateZ(Math.PI / 2));

  /* ----------------------------- the rider's side -----------------------------
   * Everything above is authored to be read from *outside* at eight metres,
   * which is where every scooter in this world is seen from -- except one.  The
   * machine `ebike.js` summons is seen from 0.8 m, from behind, and from that
   * seat it is a cowl, a legshield and two mirrors: three blank faces, because
   * nothing on this side of it was ever going to be looked at.
   *
   * Opt-in, so the twelve parked ones stay exactly as they were, and merged
   * into the same bake, so it costs no draw call.  The rider faces +x with up
   * at +y, so their *right* is +z -- which is what decides where the needle
   * rests and which way round the levers go. */
  if (o.cockpit) {
    /* The dial is raked back at the rider: a +z rotation tips the top toward
     * -x.  Its face plane is spanned by the rotated +x ("up" on the dial) and
     * by z (the rider's right), so a needle at rest -- lower left -- is 135
     * degrees round from the first toward the second, going the short way. */
    const TILT = 0.52;
    const C = V3(0.392, 1.06, 0);
    const qd = new THREE.Quaternion().setFromAxisAngle(V3(0, 0, 1), TILT);
    const axis = V3(0, 1, 0).applyQuaternion(qd);
    const inPlane = (phi) => qd.clone()
      .multiply(new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), -phi));
    const onFace = (geo, key, phi, along, lift) => {
      const q = inPlane(phi);
      const p = C.clone().addScaledVector(axis, lift)
        .add(V3(along, 0, 0).applyQuaternion(q));
      push(key, geo, new THREE.Matrix4().compose(p, q, V3(1, 1, 1)));
    };
    push('dark', new THREE.CylinderGeometry(0.062, 0.062, 0.05, 14),
      trs(C.x, C.y, C.z, 0, 0, TILT));
    onFace(new THREE.CylinderGeometry(0.05, 0.05, 0.008, 14), 'dial', 0, 0, 0.026);
    onFace(new THREE.BoxGeometry(0.042, 0.004, 0.005), 'dark', -2.36, 0.021, 0.032);
    onFace(new THREE.CylinderGeometry(0.007, 0.007, 0.006, 8), 'dark', 0, 0, 0.032);
    // the one warning lamp that is ever lit on a 50, off to the rider's left
    onFace(new THREE.CylinderGeometry(0.009, 0.009, 0.005, 8), 'amber', 1.9, 0.033, 0.031);
    /* Brake levers, raked forward off the bar just inboard of the grips.
     * `|z| > 0.15` is not a style choice: the bar cowl is 0.30 wide and a
     * lever written inboard of that is *inside* it -- the same "you cannot
     * carve a recess into a box" the onsen street's 格子 screens record, and
     * from the seat it reads as a machine with no brakes at all. */
    for (const s of [-1, 1]) {
      member(parts.metal, V3(0.40, 1.0, s * 0.163), V3(0.468, 0.988, s * 0.248), 0.009);
    }
    // the ignition barrel, under the cowl where a thumb finds it
    push('metal', new THREE.CylinderGeometry(0.026, 0.026, 0.05, 10),
      trs(0.315, 0.88, -0.05, 0, 0, Math.PI / 2));
    /* And the 荷物フック on the legshield, which is the one thing on the back
     * of that panel every rider of a 50 looks at.  Its face is raked with the
     * shield, so the peg is laid along the face's own outward normal rather
     * than along -x -- the same rule the outdoor units and the sign plates
     * follow. */
    {
      const n = V3(-1, 0, 0).applyEuler(new THREE.Euler(0, 0, 0.22));
      const a = V3(0.38, 0.68, 0).addScaledVector(n, 0.081);
      const b = a.clone().addScaledVector(n, 0.05);
      member(parts.metal, a, b, 0.009);
      member(parts.metal, b, b.clone().add(V3(0, 0.035, 0)), 0.009);
    }
  }

  emit(inner, parts, {
    dark: m.dark, metal: m.metal, body: bodyMat,
    amber: cel({ color: PAL.orange, bands: 2, tint: 0x8f6050 }),
    dial: flat({ color: 0xe9e6da }),
  }, { outline: 'body', thickness: 0.0034 });

  /* Onto the stand.  A negative roll about x drops the top toward -z, which is
   * the side the stand is on; rotating about the origin at ground level leaves
   * both tyres in contact, so nothing needs re-seating. */
  inner.rotation.x = o.lean ?? -0.09;
  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  /* Handed out so the one machine that is *ridden* can bank into its turns
   * (`ebike.js`).  It has to be this group and not the outer one: the outer
   * one carries the heading, so a roll written there would pitch the machine
   * nose-up instead -- which is the mistake the note at the top records. */
  g.userData.inner = inner;
  return g;
}

/* =================================================================== *
 * 家庭菜園 -- the raised grow box.
 * =================================================================== */

/**
 * A timber grow box, 1.6 x 0.9 m and 0.30 m high: two courses of board
 * between corner posts, dark soil, three rows of shoots, a cane X with a bean
 * line off it, and the watering can leant on the frame.
 *
 * The shoots are one instanced mesh with two greens written per instance --
 * thirty separate blobs would cost thirty draw calls in a scene that is
 * measurably draw-call bound, and a single flat green reads as moss.
 */
export function makeKitchenGarden(o = {}) {
  if (skipClutter(o)) return strippedGroup();
  const m = mats();
  const rng = rngKit(o.seed ?? 131);
  const g = new THREE.Group();
  const W = o.w ?? 1.6, D = o.d ?? 0.9, H = o.h ?? 0.3;
  const parts = { wood: [], post: [], bamboo: [] };
  const push = (k, geo, mx) => parts[k].push({ geometry: geo, matrix: mx });

  /* ------------------------------ frame and soil ------------------------------ */
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      push('post', new THREE.BoxGeometry(0.08, H + 0.06, 0.08),
        trs(sx * (W / 2 - 0.04), (H + 0.06) / 2, sz * (D / 2 - 0.04)));
    }
  }
  for (const y of [H * 0.25, H * 0.72]) {
    for (const sz of [-1, 1]) {
      push('wood', new THREE.BoxGeometry(W, 0.13, 0.028), trs(0, y, sz * (D / 2 - 0.014)));
    }
    for (const sx of [-1, 1]) {
      push('wood', new THREE.BoxGeometry(0.028, 0.13, D - 0.05), trs(sx * (W / 2 - 0.014), y, 0));
    }
  }
  const soil = box(W - 0.06, H - 0.04, D - 0.06, m.soil, 0, (H - 0.04) / 2, 0);
  soil.receiveShadow = true;
  g.add(soil);
  const SOIL = H - 0.04;

  /* -------------------------------- the shoots -------------------------------- */
  {
    const geo = new THREE.IcosahedronGeometry(1, 0);
    const rows = [-0.24, 0, 0.24];
    const per = 9;
    const inst = new THREE.InstancedMesh(geo,
      cel({ color: 0xffffff, bands: 3, tint: 0x5b6f8c, cache: false }), rows.length * per);
    const d = new THREE.Object3D();
    const col = new THREE.Color();
    let i = 0;
    for (const rz of rows) {
      for (let k = 0; k < per; k++) {
        const r = rng.range(0.05, 0.08);
        d.position.set(-W / 2 + 0.16 + (k * (W - 0.32)) / (per - 1) + rng.range(-0.03, 0.03),
          SOIL + r * 0.9, rz + rng.range(-0.05, 0.05));
        d.rotation.set(rng.range(-0.2, 0.2), rng.range(0, 3), rng.range(-0.2, 0.2));
        d.scale.set(r, r * 1.6, r);
        d.updateMatrix();
        inst.setMatrixAt(i, d.matrix);
        col.set(k % 3 === 0 ? PAL.leafDeep : PAL.leaf);
        inst.setColorAt(i, col);
        i++;
      }
    }
    inst.instanceColor.needsUpdate = true;
    inst.castShadow = true;
    g.add(inst);
  }

  /* ------------------------------- canes and twine -------------------------------
   * The X has to open in **x**, along the bed, not across it.  Splayed in z the
   * two canes are almost edge-on from the front -- which is the way the bed is
   * authored to be seen -- and they project onto each other as a single stick:
   * a bean frame with one leg.
   *
   * Each cane is the other rotated a half turn about the crossing point, which
   * is the only arrangement whose intersection is the *midpoint of both*, so the
   * lashing sits on a joint the geometry guarantees.  Feet at -+0.26 and tips at
   * +-0.26 crossed at two-thirds of their length instead, and the wrap hung in
   * mid-air between them. */
  const A0 = V3(0.4, SOIL - 0.04, -0.06), A1 = V3(0.78, 0.92, 0.06);
  const B0 = V3(0.78, SOIL - 0.04, 0.06), B1 = V3(0.4, 0.92, -0.06);
  member(parts.bamboo, A0, A1, 0.021, 7);
  member(parts.bamboo, B0, B1, 0.021, 7);
  const cross = new THREE.Vector3().addVectors(A0, A1).multiplyScalar(0.5);
  {
    const lash = new THREE.Mesh(new THREE.TorusGeometry(0.038, 0.009, 4, 10), m.twine);
    lash.position.copy(cross);
    lash.rotation.set(Math.PI / 2, 0, 0.4);
    g.add(lash);
    /* The bean line, tied off on the far corner post -- a line running to
     * nowhere over the middle of the bed is a floating thread.  Slack, the way
     * a strung line always is. */
    const line = new THREE.Mesh(
      new THREE.TubeGeometry(sagCurve(
        cross.clone().add(V3(0, -0.03, 0)),
        V3(-(W / 2 - 0.04), H + 0.02, -(D / 2 - 0.04)), 0.06, 12), 12, 0.008, 4, false),
      m.twine);
    g.add(line);
  }

  /* ------------------------------ the watering can ------------------------------
   * Leant against the outside of the frame.  A positive roll about z takes the
   * top toward -x, so leaning it *onto* a box that is to its +x is negative --
   * and the spout has to be on the -x side or it goes through the boards it is
   * propped against. */
  {
    const cp = [
      { geometry: new THREE.BoxGeometry(0.19, 0.24, 0.16), matrix: trs(0, 0.12, 0) },
      { geometry: new THREE.BoxGeometry(0.2, 0.03, 0.17), matrix: trs(0, 0.25, 0) },
      { geometry: new THREE.CylinderGeometry(0.022, 0.03, 0.3, 8), matrix: trs(-0.15, 0.2, 0, 0, 0, 0.7) },
      { geometry: new THREE.CylinderGeometry(0.05, 0.032, 0.05, 8), matrix: trs(-0.25, 0.31, 0, 0, 0, 0.7) },
      { geometry: new THREE.TorusGeometry(0.06, 0.014, 4, 9, Math.PI * 1.1), matrix: trs(0.07, 0.26, 0, Math.PI / 2, 0, -1.4) },
    ];
    const can = new THREE.Mesh(bake(cp),
      cel({ color: o.canColor ?? 0x3f9c86, bands: 3, tint: 0x4a6a80 }));
    can.castShadow = can.receiveShadow = true;
    /* Lifted by the amount the lean tips its base corner under the paving.  The
     * roll is about the base *centre*, so a can leant 0.3 rad on a 0.19 m base
     * buries the low corner 0.028 m -- the same arithmetic that sank a bicycle
     * to its axles outside a house. */
    can.position.set(-(W / 2 + 0.13), 0.028, 0.16);
    can.rotation.z = -0.3;
    g.add(can);
  }

  emit(g, parts, { wood: m.wood, post: m.woodDark, bamboo: m.bamboo });

  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  g.userData.top = H + 0.06;
  return g;
}

/* =================================================================== *
 * A child's bicycle.
 * =================================================================== */

/**
 * The same bicycle everything else in the world parks, scaled down inside a
 * container -- the planet bake reads world matrices, so a scaled group bakes
 * correctly and there is no reason to carry a second frame that can drift out
 * of step with the first.  That drift is exactly what made both original
 * copies of `makeBicycle` wrong.
 *
 * Scaling alone is not enough to read, though: at 0.62 it is just a bicycle
 * further away.  The stabilisers are what say *child* at eight metres, so they
 * go on the container rather than inside the lean -- a bike on stabilisers
 * stands square, which is also why `lean` defaults to nothing.
 */
export function makeKidBike(o = {}) {
  if (skipClutter(o)) return strippedGroup();
  const m = mats();
  const g = new THREE.Group();
  const k = o.scale ?? 0.62;
  const scaled = new THREE.Group();
  scaled.scale.setScalar(k);
  g.add(scaled);

  // x/z passed explicitly: `makeBicycle` writes o.x straight into position, so
  // omitting them puts the frame at NaN and it vanishes without an error
  scaled.add(makeBicycle({
    x: 0, z: 0, color: o.color ?? 0xd8563c, lean: o.lean ?? 0,
  }));

  /* Stabilisers, in the bicycle's own units so they scale with it: an arm out of
   * the rear hub and a small solid wheel on the end of each.  Baked into one
   * mesh -- four parts on every child's bike in the district is not worth four
   * draw calls.
   *
   * Held well outboard and given a real radius.  At 0.10 in bicycle units they
   * came out 0.06 m across in the world, tucked against the back tyre, and read
   * as a dark speck rather than as a wheel -- the crow's mistake -- which left
   * the bike reading as an adult one seen from further away. */
  {
    const parts = [];
    for (const s of [-1, 1]) {
      member(parts, V3(-0.52, 0.31, s * 0.06), V3(-0.44, 0.15, s * 0.3), 0.018);
      parts.push({
        geometry: new THREE.CylinderGeometry(0.15, 0.15, 0.06, 10),
        matrix: trs(-0.44, 0.14, s * 0.335, Math.PI / 2),
      });
    }
    const mesh = new THREE.Mesh(bake(parts), m.dark);
    mesh.castShadow = true;
    scaled.add(mesh);
  }

  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  return g;
}

/* =================================================================== *
 * 物干しスタンド -- the folding airer.
 * =================================================================== */

/**
 * The A-frame airer: two frames, three cross bars, and four or five cloths
 * hung over them.  1.2 m wide, 1.05 m tall, and 0.92 m across the feet --
 * open, because an airer folded flat against a wall is a stick.
 *
 * The cloths are double-sided cel quads with a twist each, the way
 * `makeLaundryPole` hangs its washing: one quad per towel, no back face to
 * draw, and the twist is what stops the row reading as a picket fence.
 */
export function makeDryingRack(o = {}) {
  if (skipClutter(o)) return strippedGroup();
  const m = mats();
  const rng = rngKit(o.seed ?? 137);
  const g = new THREE.Group();
  const W = o.w ?? 1.2;
  const H = o.h ?? 1.05;
  const SPREAD = 0.46;                   // half the distance across the feet
  const parts = { metal: [], foot: [] };
  const push = (k, geo, mx) => parts[k].push({ geometry: geo, matrix: mx });

  /* The two A-frames.  Every leg runs foot to apex, so the apex is one point
   * shared by four legs and the two bars that sit on it. */
  for (const sx of [-1, 1]) {
    const apex = V3(sx * (W / 2 - 0.04), H, 0);
    for (const sz of [-1, 1]) {
      const foot = V3(sx * (W / 2 - 0.04), 0.02, sz * SPREAD);
      member(parts.metal, foot, apex, 0.017);
      push('foot', new THREE.BoxGeometry(0.06, 0.04, 0.07), trs(foot.x, 0.02, foot.z));
    }
    // the spreader, at the width the legs have opened to by that height
    const sy = 0.45;
    const sw = SPREAD * (1 - sy / H);
    member(parts.metal, V3(apex.x, sy, -sw), V3(apex.x, sy, sw), 0.014);
  }
  /* Three cross bars: the ridge, and one part-way down each wing.  At 0.58 the
   * wings have opened to +-0.20, which is the least that keeps the cloth on one
   * bar off the cloth on the next. */
  const BARS = [{ y: H, z: 0 }, { y: 0.58, z: -0.2 }, { y: 0.58, z: 0.2 }];
  for (const b of BARS) {
    push('metal', new THREE.CylinderGeometry(0.014, 0.014, W, 6), trs(0, b.y, b.z, 0, 0, Math.PI / 2));
  }

  /* -------------------------------- the washing -------------------------------- */
  const COLS = [PAL.wallBlue, PAL.blossom, PAL.wallWhite, PAL.yellow, PAL.wallCream, 0xa8cfe0];
  const n = o.n ?? 5;
  for (let i = 0; i < n; i++) {
    const b = BARS[i % BARS.length];
    const w = rng.range(0.28, 0.42);
    const h = rng.range(0.38, 0.56);
    const t = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      cel({ color: rng.pick(COLS), bands: 2, side: THREE.DoubleSide, tint: 0x6f6790 }));
    t.position.set(rng.range(-W / 2 + 0.24, W / 2 - 0.24), b.y - h / 2 - 0.03, b.z + Math.sign(b.z) * 0.03);
    // hung along the wing rather than dead vertical, and given a twist
    t.rotation.set(Math.sign(b.z) * 0.14, rng.range(-0.16, 0.16), rng.range(-0.06, 0.06));
    t.castShadow = true;
    g.add(t);
    push('metal', new THREE.BoxGeometry(0.04, 0.03, 0.03), trs(t.position.x - w / 2 + 0.03, b.y, b.z));
  }

  emit(g, parts, { metal: m.metal, foot: m.dark });

  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  g.userData.top = H;
  return g;
}

/* =================================================================== *
 * The ball crate.
 * =================================================================== */

/**
 * A slatted timber crate, 0.70 x 0.50 x 0.45 m, with two balls in it and one
 * that has got out.
 *
 * The gaps between the slats are real gaps.  A box with light lines painted on
 * it is a box, and the whole reason for a crate here rather than a bin is that
 * you can see the balls through the side of it.
 */
export function makeBallBox(o = {}) {
  const m = mats();
  const rng = rngKit(o.seed ?? 149);
  const g = new THREE.Group();
  const W = 0.7, D = 0.5, H = 0.45;
  const parts = { wood: [], band: [] };
  const push = (k, geo, mx) => parts[k].push({ geometry: geo, matrix: mx });

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      push('wood', new THREE.BoxGeometry(0.05, H, 0.05), trs(sx * (W / 2 - 0.025), H / 2, sz * (D / 2 - 0.025)));
    }
  }
  // three courses a side, 85 mm boards with 55 mm of daylight between them
  for (const y of [0.06, 0.2, 0.34]) {
    for (const sz of [-1, 1]) {
      push('wood', new THREE.BoxGeometry(W - 0.04, 0.085, 0.02), trs(0, y, sz * (D / 2 - 0.01)));
    }
    for (const sx of [-1, 1]) {
      push('wood', new THREE.BoxGeometry(0.02, 0.085, D - 0.06), trs(sx * (W / 2 - 0.01), y, 0));
    }
  }
  for (const sz of [-1, 1]) {
    push('wood', new THREE.BoxGeometry(W, 0.03, 0.06), trs(0, H - 0.015, sz * (D / 2 - 0.03)));
  }
  for (const sx of [-1, 1]) {
    push('wood', new THREE.BoxGeometry(0.06, 0.03, D - 0.12), trs(sx * (W / 2 - 0.03), H - 0.015, 0));
  }
  for (const z of [-0.16, 0, 0.16]) {
    push('wood', new THREE.BoxGeometry(W - 0.06, 0.02, 0.1), trs(0, 0.05, z));      // floor slats
  }

  /* Three balls: two in the crate and one that has got out, each with a painted
   * band round it.  A plain sphere at this size reads as a blob; the band is
   * what makes it a ball, and all three bands bake into one mesh.
   *
   * Both of the pair sit on the floor slats -- 0.3 m apart in plan against a
   * combined radius of 0.21, so they are clear of each other -- rather than one
   * stacked on the other, which at these radii left the top one floating 0.13 m
   * over the ball it was supposed to be resting on. */
  const COLS = [PAL.red, PAL.blue, PAL.yellow, 0x4f9d6a, PAL.orange];
  const FLOOR = 0.06;                    // top of the floor slats
  const spots = [
    { x: -0.15, z: 0.0, r: 0.11, y: FLOOR + 0.11 },
    { x: 0.15, z: 0.03, r: 0.1, y: FLOOR + 0.1 },
    { x: o.loose ?? 0.58, z: 0.12, r: 0.11, y: 0.11 },
  ];
  spots.forEach((p, i) => {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(p.r, 12, 9),
      cel({ color: COLS[(i * 2 + (o.seed ?? 0)) % COLS.length], bands: 3, tint: 0x6f6790 }));
    ball.position.set(p.x, p.y, p.z);
    ball.castShadow = true;
    g.add(ball);
    push('band', new THREE.TorusGeometry(p.r * 0.99, 0.012, 4, 14),
      trs(p.x, p.y, p.z, rng.range(0, 3), rng.range(0, 3), rng.range(0, 3)));
  });

  emit(g, parts, { wood: m.wood, band: cel({ color: PAL.lineWhite, bands: 3, tint: 0x6f6790 }) });

  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  g.userData.top = H;
  return g;
}

/* =================================================================== *
 * 車止め -- a parking bay's wheel stops.
 * =================================================================== */

/**
 * `o.n` bays at `o.pitch` centres: two 0.6 m concrete wheel stops per bay at
 * `o.gauge` centres, and a bay-number plate on a 0.35 m stake behind them.
 *
 * The two stops of one bay sit end to end on the *cross-bay* axis with the
 * track width between their centres, so a 1.4 m gauge leaves 0.8 m of clear
 * paving down the middle of the bay -- which is what a parking bay actually
 * looks like from the road, and the thing that goes wrong if the pair is set
 * out along the direction of travel instead.
 *
 * Authored with the bays side by side along **x** and the car nosing in from
 * **+z**, so the stake plates face the approach.
 */
export function makeWheelStops(o = {}) {
  if (skipClutter(o)) return strippedGroup();
  const m = mats();
  const g = new THREE.Group();
  const n = o.n ?? 2;
  const pitch = o.pitch ?? 2.5;
  const gauge = o.gauge ?? 1.4;
  const LEN = 0.6;
  const parts = { concrete: [], chamfer: [], dark: [], metal: [] };
  const push = (k, geo, mx) => parts[k].push({ geometry: geo, matrix: mx });

  for (let i = 0; i < n; i++) {
    const bx = -((n - 1) * pitch) / 2 + i * pitch;
    for (const s of [-1, 1]) {
      const sx = bx + (s * gauge) / 2;
      /* 0.16 m to the top of the chamfer.  At 0.125 the pair read as a pencil
       * line on the paving from anywhere but directly alongside -- and a real
       * one is 150 mm, so the height was wrong as well as invisible. */
      push('concrete', new THREE.BoxGeometry(LEN, 0.12, 0.16), trs(sx, 0.06, 0));
      // the chamfered top, and the two anchor pins through it
      push('chamfer', new THREE.BoxGeometry(LEN - 0.04, 0.04, 0.11), trs(sx, 0.14, 0));
      for (const t of [-0.18, 0.18]) {
        push('dark', new THREE.CylinderGeometry(0.018, 0.018, 0.03, 6), trs(sx + t, 0.165, 0));
      }
    }
    // the stake, set back out of the way of the tyre
    push('metal', new THREE.BoxGeometry(0.045, 0.35, 0.045), trs(bx, 0.175, -0.26));
    const side = cel({ color: 0xe8e4da, bands: 3, tint: 0x6f6790 });
    const map = o.plateMaps && o.plateMaps[i];
    const face = map ? flat({ color: 0xffffff, map, cache: false }) : side;
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.022),
      [side, side, side, side, face, side]);
    plate.position.set(bx, 0.36, -0.24);
    plate.castShadow = true;
    g.add(plate);
    push('metal', new THREE.BoxGeometry(0.18, 0.026, 0.026), trs(bx, 0.425, -0.24));   // the painted cap rail
  }

  emit(g, parts, {
    concrete: m.concreteMid, chamfer: m.concrete, dark: m.dark, metal: m.metalDark,
  }, { noCast: ['chamfer'] });

  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  g.userData.top = 0.16;
  return g;
}

/* =================================================================== *
 * The gas meter cabinet.
 * =================================================================== */

/**
 * The grey box on the flank of every house: a 0.34 x 0.46 x 0.20 m cabinet on
 * two bracket arms, with the service pipe elbowed into its underside and run
 * down the wall to a stub at the ground.
 *
 * Placed exactly the way `makeAircon` is, and for the same reasons:
 *
 *  - the door and the dial are on local **+z**, so `ry` is `atan2(nx, nz)` of
 *    the wall's *outward* normal;
 *  - the **back has to touch the wall**, so the origin belongs at
 *    `wall + (0.10 + standoff)` along that normal, at ground level.  The
 *    brackets span exactly `standoff`, which is what makes it visibly carried;
 *    left a third of a metre off, a wall box is a box hanging in the air with
 *    its own shadow behind it.
 *
 * Verify one by firing a ray out of its back.  Never verify from behind the
 * wall coming forward -- inside a house that hits an interior face and reports
 * a metre of clearance that is not there.
 */
export function makeGasMeter(o = {}) {
  if (skipClutter(o)) return strippedGroup();
  const m = mats();
  const g = new THREE.Group();
  const W = 0.34, HH = 0.46, D = 0.2;
  const so = o.standoff ?? 0.06;
  const Y0 = o.y0 ?? 0.72;               // underside of the cabinet
  const WALL = -(D / 2 + so);            // the wall face, in local z
  const parts = { shell: [], door: [], metal: [], dark: [], pipe: [] };
  const push = (k, geo, mx) => parts[k].push({ geometry: geo, matrix: mx });

  const body = box(W, HH, D, m.shell, 0, Y0 + HH / 2, 0);
  body.castShadow = body.receiveShadow = true;
  g.add(body);
  hullOutline(body, { thickness: 0.003 });
  push('shell', new THREE.BoxGeometry(W + 0.03, 0.035, D + 0.03), trs(0, Y0 + HH + 0.015, 0));   // drip top

  /* the door, its handle and two louvre slots */
  push('door', new THREE.BoxGeometry(W - 0.04, HH - 0.06, 0.02), trs(0, Y0 + HH / 2, D / 2 + 0.01));
  push('metal', new THREE.BoxGeometry(0.05, 0.09, 0.03), trs(W / 2 - 0.05, Y0 + HH / 2, D / 2 + 0.03));
  for (const y of [Y0 + HH - 0.07, Y0 + HH - 0.11]) {
    push('dark', new THREE.BoxGeometry(W - 0.14, 0.014, 0.016), trs(0, y, D / 2 + 0.026));
  }
  /* The dial: rim, then face, then hand, each layer clear of the last.  Two
   * sheets at the same depth are a coin toss rather than a layer, and the door
   * panel this is set on already stands 20 mm out -- so the rim starts 35 mm
   * out and the hand ends at 58 mm. */
  push('metal', new THREE.CylinderGeometry(0.062, 0.062, 0.016, 14), trs(-0.06, Y0 + 0.28, D / 2 + 0.035, Math.PI / 2));
  g.add(cyl(0.052, 0.052, 0.014, 14, m.pale, -0.06, Y0 + 0.28, D / 2 + 0.048).rotateX(Math.PI / 2));
  push('dark', new THREE.BoxGeometry(0.048, 0.006, 0.006), trs(-0.048, Y0 + 0.29, D / 2 + 0.058));
  g.add(box(0.13, 0.06, 0.008, m.pale, 0.06, Y0 + 0.11, D / 2 + 0.026));

  /* ------------------------------- the brackets -------------------------------
   * An arm under the cabinet reaching back over the standoff, a leg up the
   * wall and the bolt pad -- the same three pieces `makeAircon` hangs on. */
  for (const s of [-1, 1]) {
    const bx = (s * (W - 0.1)) / 2;
    push('metal', new THREE.BoxGeometry(0.04, 0.035, D + so), trs(bx, Y0 - 0.018, -so / 2));
    push('metal', new THREE.BoxGeometry(0.04, 0.17, 0.03), trs(bx, Y0 + 0.07, WALL + 0.015));
    push('metal', new THREE.BoxGeometry(0.07, 0.07, 0.018), trs(bx, Y0 + 0.14, WALL + 0.009));
  }

  /* --------------------------------- the pipe ---------------------------------
   * Up the wall clear of the cabinet on the -x side, two elbows across and
   * into the underside, and a fatter capped stub where it comes out of the
   * ground.  It hugs the wall (z = WALL + 0.06) rather than running down the
   * middle of the cabinet's depth, which is where a riser actually is. */
  {
    const px = -(W / 2 + 0.05);
    const pz = WALL + 0.075;             // clear of the cabinet's back plane
    const ELB = Y0 - 0.06;
    member(parts.pipe, V3(px, 0.14, pz), V3(px, ELB, pz), 0.022, 8);
    member(parts.pipe, V3(px, ELB, pz), V3(-0.08, ELB, pz), 0.022, 8);
    member(parts.pipe, V3(-0.08, ELB, pz), V3(-0.08, Y0 + 0.02, pz), 0.022, 8);
    for (const p of [V3(px, ELB, pz), V3(-0.08, ELB, pz)]) {
      push('pipe', new THREE.SphereGeometry(0.026, 8, 6), trs(p.x, p.y, p.z));
    }
    push('pipe', new THREE.CylinderGeometry(0.032, 0.032, 0.14, 8), trs(px, 0.07, pz));
    push('metal', new THREE.BoxGeometry(0.11, 0.03, 0.11), trs(px, 0.015, pz));
    push('metal', new THREE.BoxGeometry(0.05, 0.028, 0.075), trs(px, 0.46, WALL + 0.038));  // wall clip
  }

  emit(g, parts, {
    shell: m.shellTrim, door: cel({ color: 0xd2d6da, bands: 3, tint: 0x666090 }),
    metal: m.metalDark, dark: m.dark, pipe: m.metal,
  });

  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  g.userData.top = Y0 + HH + 0.03;
  return g;
}

/* =================================================================== *
 * 水道メーター -- the water meter lid.
 * =================================================================== */

/**
 * The lid in the paving outside every gate: a 0.32 x 0.24 m plate in a raised
 * rim, with a lift slot and a cast panel on it.
 *
 * It stands 20 mm proud in total so its edge inks and it reads as an object
 * rather than as a stain -- and it must not cast, because the shadow of
 * something 20 mm high is a fraction of a shadow-map texel at this cascade
 * size and lands as a row of sawtooth triangles rather than as a line.
 *
 * The rim is four bars, not a slab with the lid on top: a lid *on* its frame
 * is a paving block, and a box cannot have a recess cut into it.
 */
export function makeWaterMeter(o = {}) {
  if (skipClutter(o)) return strippedGroup();
  const m = mats();
  const g = new THREE.Group();
  const W = o.w ?? 0.32, D = o.d ?? 0.24;
  const RIM = 0.03;
  const parts = { rim: [], lid: [], panel: [] };
  const push = (k, geo, mx) => parts[k].push({ geometry: geo, matrix: mx });

  for (const sz of [-1, 1]) {
    push('rim', new THREE.BoxGeometry(W + RIM * 2, 0.026, RIM), trs(0, 0.008, sz * (D / 2 + RIM / 2)));
  }
  for (const sx of [-1, 1]) {
    push('rim', new THREE.BoxGeometry(RIM, 0.026, D), trs(sx * (W / 2 + RIM / 2), 0.008, 0));
  }
  // the lid itself, 2.5 mm shy of the rim on each side so there is a shadow gap
  push('lid', new THREE.BoxGeometry(W - 0.005, 0.022, D - 0.005), trs(0, 0.005, 0));
  for (const sz of [-1, 1]) {
    push('lid', new THREE.BoxGeometry(W - 0.08, 0.006, 0.022), trs(0, 0.018, sz * 0.05));   // cast ribs
  }
  push('lid', new THREE.BoxGeometry(0.06, 0.008, 0.024), trs(W / 2 - 0.05, 0.019, 0));      // lift slot lip
  push('panel', new THREE.BoxGeometry(0.11, 0.006, 0.042), trs(-0.05, 0.019, 0));

  const rimMesh = new THREE.Mesh(bake(parts.rim), m.concreteMid);
  const lidMesh = new THREE.Mesh(bake(parts.lid), cel({ color: 0x6f7480, bands: 3, tint: 0x5c5680 }));
  const panelMesh = new THREE.Mesh(bake(parts.panel), m.pale);
  for (const mesh of [rimMesh, lidMesh, panelMesh]) {
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    g.add(mesh);
  }
  // the slot is the one dark thing on it, and it is what tells you it lifts
  g.add(box(0.05, 0.01, 0.016, m.dark, W / 2 - 0.085, 0.021, 0));

  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  g.userData.top = 0.021;
  return g;
}

/* =================================================================== *
 * Chalk on the paving.
 * =================================================================== */

/**
 * Faint chalk where children have been playing: hopscotch, a circle and a few
 * loose lines, one instanced mesh for the whole world's worth of it.
 *
 * Everything is drawn as *strokes* -- a filled pale square at low opacity is a
 * patch of light, not a chalk line -- so a motif is a list of thin quads laid
 * flat and the instanced mesh carries all of them at once.  `renderOrder = 1`
 * with `depthWrite` off and `noOutline` for the usual reason: the ink pass
 * reads the depth buffer, and a translucent sheet written into it comes back
 * as speckle.
 *
 * `y` must come from `ctx.groundAt(x, z)` and not from `groundY(z)`.  The marks
 * sit 20 mm up, so a spot seated from the street profile where a footway slab or
 * a forecourt has since been laid is not faint -- it is *gone*, with no error
 * and nothing in the frame to explain it.  Verified the hard way: an opaque
 * control box at the same height on the same spot vanished too.
 *
 * Marks only.  Chalk is the most tempting place in this world to draw a
 * figure, and the rule has no exception: no people, and no letters or numbers
 * either -- a hopscotch grid with numbers in it is signage.
 */
export function makeChalkMarks(ctx, spots, o = {}) {
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.rotateX(-Math.PI / 2);

  /* A stroke between two points in the motif's own frame.  The quad runs along
   * local +x, and rotating by `ry` about y sends +x to (cos, -sin) in (x, z),
   * so the angle that lays it along (dx, dz) is atan2(-dz, dx). */
  const strokes = [];
  const line = (arr, x0, z0, x1, z1, w) => {
    const dx = x1 - x0, dz = z1 - z0;
    arr.push({
      x: (x0 + x1) / 2, z: (z0 + z1) / 2,
      len: Math.hypot(dx, dz), w, ang: Math.atan2(-dz, dx),
    });
  };
  const rect = (arr, cx, cz, w, d, t) => {
    line(arr, cx - w / 2, cz - d / 2, cx + w / 2, cz - d / 2, t);
    line(arr, cx - w / 2, cz + d / 2, cx + w / 2, cz + d / 2, t);
    line(arr, cx - w / 2, cz - d / 2, cx - w / 2, cz + d / 2, t);
    line(arr, cx + w / 2, cz - d / 2, cx + w / 2, cz + d / 2, t);
  };

  for (const s of spots) {
    const rng = rngKit(s.seed ?? 7);
    const local = [];
    if (rng.chance(0.55)) {
      // a hopscotch ladder: three or four squares up the local +z axis
      const n = rng.int(3, 4);
      const side = rng.range(0.4, 0.5);
      for (let i = 0; i < n; i++) rect(local, 0, -0.3 + i * (side + 0.02), side, side, 0.03);
    } else {
      // a ring, as chords: twelve of them read as a circle and none of them is
      // a filled disc
      const r = rng.range(0.4, 0.6);
      const n = 12;
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
        line(local, Math.cos(a0) * r, Math.sin(a0) * r, Math.cos(a1) * r, Math.sin(a1) * r, 0.028);
      }
    }
    for (let i = 0; i < rng.int(2, 4); i++) {
      const a = rng.range(0, Math.PI * 2);
      const len = rng.range(0.25, 0.7);
      const cx = rng.range(-0.7, 0.7), cz = rng.range(-0.7, 0.7);
      line(local, cx, cz, cx + Math.cos(a) * len, cz + Math.sin(a) * len, rng.range(0.02, 0.035));
    }

    const k = s.scale ?? 1;
    const ry = s.ry ?? 0;
    const c = Math.cos(ry), sn = Math.sin(ry);
    for (const st of local) {
      const lx = st.x * k, lz = st.z * k;
      strokes.push({
        x: s.x + lx * c + lz * sn,
        z: s.z - lx * sn + lz * c,
        y: (s.y ?? 0) + 0.02,
        len: st.len * k, w: st.w, ang: ry + st.ang,
      });
    }
  }
  if (!strokes.length) return null;

  const inst = new THREE.InstancedMesh(geo,
    flat({
      color: o.color ?? 0xf6f4ee, transparent: true, opacity: o.opacity ?? 0.3,
      depthWrite: false, cache: false,
    }), strokes.length);
  const d = new THREE.Object3D();
  strokes.forEach((st, i) => {
    d.position.set(st.x, st.y, st.z);
    d.rotation.set(0, st.ang, 0);
    d.scale.set(st.len, 1, st.w);
    d.updateMatrix();
    inst.setMatrixAt(i, d.matrix);
  });
  inst.userData.noOutline = true;
  inst.renderOrder = 1;
  ctx.add(inst);
  return inst;
}
