import * as THREE from 'three';
import { PAL } from '../core/palette.js';
import { cel, flat } from '../core/toon.js';
import { poster, namePlate, meterBox, cornerPlate } from '../core/textures.js';
import { box, cyl, bake, trs, rngKit } from '../core/util.js';
import { hullOutline } from '../core/outline.js';
import { groundY } from './street.js';
import { pad, wallRun, groundMats } from './ground.js';
import { addVending } from './vending.js';
import {
  makeBench, makeVendBin, makeAircon, makePostBox, makeUmbrellaStand,
  makeCrates, makeLoosePaper, makePlanter, makeBucket,
} from './props.js';

/* ------------------------------------------------------------------ *
 * 自販機の休み処 -- the vending corner.
 *
 * A pocket six metres wide and eight deep, wedged between the blank east
 * flank of 青空商店 and the west flank of the house behind it, opening south
 * onto the lineside fence and north into the alley that leads to the
 * shopping street.  It is the seam between the shops and the housing, and
 * before this it was a dead end nobody had a reason to enter.
 *
 * Three things make it work as a place to stop rather than a place to pass:
 *
 *  - **It is a slot between two tall walls, so it is half in shadow.**  The
 *    sun comes from -x, which lights the shop's east flank down one side and
 *    leaves the other in violet shade.  That band of warm wall above the
 *    machines is the whole lighting idea; do not open the pocket up.
 *  - **The machines face the light.**  Three of them against the low wall on
 *    the east side, facing west, so their glazed fronts catch the sun and the
 *    rows of drinks read as the saturated accent they are meant to be.  Turn
 *    them round and they go dead.
 *  - **You can see the railway from the bench.**  The pocket's south end stops
 *    at the lineside fence, so somebody sitting down is looking at the track
 *    with a train through it every forty seconds.  That is the reason to sit.
 *
 * Everything here is close-range: it is the one part of the district the
 * player can stand two metres from, so the detail level is set by that and
 * not by what reads from the street.
 * ------------------------------------------------------------------ */

/* the pocket */
const X0 = 12.10;              // 青空商店's east flank
const X1 = 18.25;              // the house's west flank
const Z0 = 4.30;               // the lineside fence end
const Z1 = 13.30;              // the alley end
const WALL_X = 17.55;          // the low concrete wall the machines stand against

const M = {};
function mats() {
  if (M.concrete) return M;
  M.concrete = cel({ color: PAL.concrete, bands: 3, tint: 0x6f6790 });
  M.concreteMid = cel({ color: PAL.concreteMid, bands: 3, tint: 0x6a6288 });
  M.metal = cel({ color: PAL.metal, bands: 3, tint: 0x666090 });
  M.metalDark = cel({ color: PAL.metalDark, bands: 3, tint: 0x5c5680 });
  M.drain = cel({ color: PAL.drain, bands: 3, tint: 0x5d5878 });
  /* The canopy: corrugated steel gone chalky, not the crisp pale grey the
   * bridge uses.  This corner is meant to look older than everything round it. */
  M.canopy = cel({ color: 0xbfc4bb, bands: 3, tint: 0x64607f });
  M.canopyFrame = cel({ color: 0x8a8f86, bands: 3, tint: 0x5a5678 });
  M.wood = cel({ color: 0x9a7f5c, bands: 3, tint: 0x5c5680 });
  M.woodWorn = cel({ color: 0x7f6a4e, bands: 3, tint: 0x554e74 });
  return M;
}

export function buildRestCorner(ctx) {
  const m = mats();
  const gm = groundMats();
  const rng = rngKit(8801);
  const sakura = [];
  const shrubs = [];
  const grove = [];
  const petals = [];
  const Y = groundY((Z0 + Z1) / 2);

  /* ------------------------------- the ground -------------------------------
   * Two surfaces, not one: worn concrete slabs where people stand and a strip
   * of coarser asphalt patch along the west side where the shop's downpipes
   * discharge.  A single flat pad over eight metres reads as a car park. */
  pad(ctx, {
    x: (X0 + X1) / 2 + 0.1, z: (Z0 + Z1) / 2, w: X1 - X0 - 0.2, d: Z1 - Z0,
    y: Y, h: 0.08, mat: gm.concrete, name: 'restCornerPad',
  });
  pad(ctx, {
    x: X0 + 0.85, z: (Z0 + Z1) / 2 + 0.6, w: 1.5, d: Z1 - Z0 - 2.4,
    y: Y, h: 0.09, mat: gm.asphaltWorn, name: 'restCornerPatch',
  });
  // slab joints, so the paving has a grain
  {
    const parts = [];
    for (let z = Z0 + 1.2; z < Z1; z += 1.2) {
      parts.push({ geometry: new THREE.BoxGeometry(X1 - X0 - 0.2, 0.02, 0.05), matrix: trs((X0 + X1) / 2 + 0.1, 0, z) });
    }
    const jm = new THREE.Mesh(bake(parts), m.concreteMid);
    jm.position.y = Y + 0.085;
    jm.userData.noOutline = true;
    ctx.add(jm);
  }

  /* -------------------------------- the drain --------------------------------
   * A slotted channel down the middle-west, falling to a gully at the south
   * end.  It is the single most useful thing you can put on a small paved
   * area: it explains the fall, it gives the ground a dark line, and it is
   * where the water stain has somewhere to go. */
  {
    const dx = X0 + 1.9;
    const parts = [];
    const n = Math.round((Z1 - Z0 - 1.0) / 0.62);
    for (let i = 0; i < n; i++) {
      parts.push({
        geometry: new THREE.BoxGeometry(0.26, 0.04, 0.5),
        matrix: trs(dx, 0, Z0 + 0.7 + i * 0.62),
      });
    }
    const ch = new THREE.Mesh(bake(parts), m.drain);
    ch.position.y = Y + 0.075;
    ch.receiveShadow = true;
    ctx.add(ch);
    // the kerb either side of the channel, and the gully at the bottom
    for (const s of [-1, 1]) {
      ctx.add(box(0.07, 0.06, Z1 - Z0 - 1.0, m.concreteMid, dx + s * 0.165, Y + 0.09, (Z0 + Z1) / 2 + 0.35));
    }
    const gully = box(0.4, 0.05, 0.4, m.metalDark, dx, Y + 0.075, Z0 + 0.45);
    ctx.add(gully);
    for (let i = 0; i < 4; i++) {
      ctx.add(box(0.34, 0.03, 0.04, m.drain, dx, Y + 0.095, Z0 + 0.32 + i * 0.09));
    }
    /* The water stain: a flat darker patch spreading from the gully.  Flat, and
     * only just darker -- the brief wants used, not dirty. */
    const stain = new THREE.Mesh(new THREE.CircleGeometry(0.78, 12),
      flat({ color: 0x9a94a8, transparent: true, opacity: 0.34, depthWrite: false, cache: false }));
    stain.rotation.x = -Math.PI / 2;
    stain.scale.set(1, 0.62, 1);
    stain.position.set(dx + 0.1, Y + 0.092, Z0 + 0.75);
    stain.userData.noOutline = true;
    ctx.add(stain);
  }

  /* -------------------------- the low concrete wall --------------------------
   * The machines need a back, and the house behind is 0.7 m further east than
   * they are, so the wall is what they stand against.  1.15 m: high enough to
   * back a machine, low enough that the house's flank shows over it, which is
   * what gives the corner two planes of wall instead of one. */
  wallRun(ctx, {
    axis: 'z', at: WALL_X, from: Z0 + 0.6, to: Z1 - 0.4, y: Y, h: 1.15, t: 0.2, panel: 2.4,
    mat: m.concreteMid, capMat: m.concrete,
  });
  ctx.collide(WALL_X - 0.16, Z0 + 0.6, WALL_X + 0.16, Z1 - 0.4, Y + 1.15);

  /* ---------------------------- the vending machines ----------------------------
   * Three, in the order a real bank of them ends up: the big white one that
   * pays the rent, the red one beside it, and an older teal one squeezed in at
   * the end.  Facing west (`ry = -PI/2`) into the pocket and into the light.
   *
   * `addVending` gives each one its collider, its hitbox and the can that
   * drops, so they are all interactable exactly like the other eight. */
  const MX = WALL_X - 0.52;
  const zs = [Z0 + 2.15, Z0 + 3.35, Z0 + 4.55];
  [0, 1, 2].forEach((v, i) => {
    addVending(ctx, { x: MX, z: zs[i], y: Y + 0.08, ry: -Math.PI / 2, variant: v, seed: 60 + i });
    /* Contact shadow.  The machines stand on four levelling feet with a 30 mm
     * gap under the plinth, and at this cascade size the shadow map cannot
     * resolve that gap -- without a patch on the paving the machine reads as
     * hovering a centimetre off it. */
    const patch = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.18),
      flat({ color: 0x6f6889, transparent: true, opacity: 0.42, depthWrite: false, cache: false }));
    patch.rotation.x = -Math.PI / 2;
    patch.position.set(MX + 0.05, Y + 0.087, zs[i]);
    patch.userData.noOutline = true;
    ctx.add(patch);
  });

  /* ------------------------------- the canopy -------------------------------
   * A lean-to over the machines: four posts, a head beam, purlins, a
   * corrugated sheet falling west, and a gutter with a downpipe at the south
   * end.  The fall and the downpipe are the point -- a flat roof with no way
   * for the water to leave is the thing that makes a shelter look drawn rather
   * than built. */
  {
    const zA = Z0 + 1.45, zB = Z0 + 5.30;
    const xHigh = WALL_X - 0.1, xLow = WALL_X - 2.55;
    const yHigh = Y + 2.72, yLow = Y + 2.46;
    const parts = { frame: [], sheet: [] };

    // posts: two tall against the wall, two short out in the pocket
    for (const pz of [zA, zB]) {
      parts.frame.push({
        geometry: new THREE.CylinderGeometry(0.045, 0.05, yHigh - Y - 0.02, 7),
        matrix: trs(xHigh, (Y + yHigh) / 2, pz),
      });
      parts.frame.push({
        geometry: new THREE.CylinderGeometry(0.05, 0.055, yLow - Y - 0.02, 7),
        matrix: trs(xLow, (Y + yLow) / 2, pz),
      });
      // base plates, so the posts sit on something
      parts.frame.push({ geometry: new THREE.BoxGeometry(0.16, 0.03, 0.16), matrix: trs(xLow, Y + 0.1, pz) });
    }
    // head beams along both edges
    parts.frame.push({ geometry: new THREE.BoxGeometry(0.08, 0.1, zB - zA + 0.5), matrix: trs(xHigh, yHigh, (zA + zB) / 2) });
    parts.frame.push({ geometry: new THREE.BoxGeometry(0.09, 0.11, zB - zA + 0.5), matrix: trs(xLow, yLow, (zA + zB) / 2) });
    // purlins across the fall
    const runX = xHigh - xLow;
    const dropY = yHigh - yLow;
    const slope = Math.atan2(dropY, runX);
    const sheetLen = Math.hypot(runX, dropY) + 0.3;
    const np = Math.round((zB - zA) / 1.25);
    for (let i = 0; i <= np; i++) {
      const pz = zA + ((zB - zA) / np) * i;
      parts.frame.push({
        geometry: new THREE.BoxGeometry(sheetLen - 0.2, 0.06, 0.06),
        matrix: trs((xHigh + xLow) / 2, (yHigh + yLow) / 2 - 0.06, pz, 0, 0, slope),
      });
    }

    /* The sheet, with a real thickness.  Corrugation as geometry rather than a
     * map: under cel shading a painted rib flattens out and a modelled one
     * keeps its edge, the same reason the shop awnings are built this way. */
    const nrib = Math.round((zB - zA + 0.5) / 0.19);
    for (let i = 0; i < nrib; i++) {
      const pz = zA - 0.25 + (i + 0.5) * ((zB - zA + 0.5) / nrib);
      parts.sheet.push({
        geometry: new THREE.BoxGeometry(sheetLen, i % 2 ? 0.05 : 0.035, ((zB - zA + 0.5) / nrib) * 0.86),
        matrix: trs((xHigh + xLow) / 2, (yHigh + yLow) / 2 + 0.03, pz, 0, 0, slope),
      });
    }

    const fm = new THREE.Mesh(bake(parts.frame), m.canopyFrame);
    fm.name = 'openFrame';
    const sm = new THREE.Mesh(bake(parts.sheet), m.canopy);
    sm.name = 'canopy';
    fm.castShadow = sm.castShadow = true;
    sm.receiveShadow = true;
    ctx.add(fm);
    ctx.add(sm);
    hullOutline(sm, { thickness: 0.003 });

    // gutter along the low edge, and the downpipe that drops into the channel
    ctx.add(box(0.13, 0.09, zB - zA + 0.5, m.metal, xLow - 0.12, yLow - 0.07, (zA + zB) / 2));
    const dp = cyl(0.035, 0.035, yLow - Y - 0.15, 6, m.metal, xLow - 0.12, (Y + yLow) / 2 - 0.02, zA - 0.18);
    ctx.add(dp);
    ctx.add(box(0.16, 0.06, 0.16, m.metalDark, xLow - 0.12, Y + 0.13, zA - 0.18));
    for (const pz of [zA, zB]) {
      ctx.collide(xLow - 0.06, pz - 0.06, xLow + 0.06, pz + 0.06, yLow);
      ctx.collide(xHigh - 0.06, pz - 0.06, xHigh + 0.06, pz + 0.06, yHigh);
    }
    ctx.collide(xLow - 0.05, zA - 0.2, xHigh + 0.05, zB + 0.2, yHigh + 0.12, yLow - 0.08, true);
  }

  /* --------------------------------- the bench ---------------------------------
   * Against the shop's flank, facing the machines and the track.  It gets its
   * own worn colour blocks rather than the district's standard bench: this one
   * has been out here a long time. */
  {
    const bx = X0 + 0.62, bz = Z0 + 3.4;
    const g = new THREE.Group();
    g.name = 'openFrame';
    // three seat boards with a gap, which is what a slatted bench actually is
    for (let i = 0; i < 3; i++) {
      const s = box(0.42, 0.05, 1.86, i === 1 ? m.woodWorn : m.wood, 0, 0.44, 0);
      s.position.set(i * 0.16 - 0.16, 0.44, 0);
      s.castShadow = s.receiveShadow = true;
      g.add(s);
    }
    // back rail, two boards on cast ends
    for (let i = 0; i < 2; i++) {
      const b = box(0.045, 0.16, 1.86, i ? m.wood : m.woodWorn, -0.24, 0.66 + i * 0.2, 0);
      b.castShadow = true;
      g.add(b);
    }
    for (const s of [-1, 1]) {
      const leg = box(0.5, 0.44, 0.07, m.metalDark, 0, 0.22, s * 0.82);
      leg.castShadow = true;
      g.add(leg);
      g.add(box(0.06, 0.42, 0.07, m.metalDark, -0.24, 0.6, s * 0.82));
      g.add(box(0.56, 0.05, 0.12, m.metalDark, 0, 0.03, s * 0.82));
    }
    g.position.set(bx, Y + 0.08, bz);
    ctx.add(g);
    hullOutline(g.children[1], { thickness: 0.003 });
    for (const s of [-1, 1]) {
      ctx.collide(bx - 0.28, bz + s * 0.82 - 0.06, bx + 0.28, bz + s * 0.82 + 0.06, Y + 0.52, Y + 0.08, true);
    }
    ctx.collide(bx - 0.24, bz - 0.95, bx + 0.24, bz + 0.95, Y + 0.55, Y + 0.47, true);
  }

  /* ------------------------------- the lamp -------------------------------
   * One bracket lamp on the shop's flank rather than a post: there is no room
   * for a post, and a bracket is what a back alley gets.  It is off -- it is
   * the middle of the afternoon -- but the shade and the conduit read. */
  {
    const lx = X0 + 0.14, lz = Z0 + 6.4;
    ctx.add(box(0.1, 0.5, 0.1, m.metalDark, lx, Y + 3.3, lz));
    ctx.add(box(0.62, 0.07, 0.07, m.metal, lx + 0.32, Y + 3.52, lz));
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.2, 12, 1, true), m.canopyFrame);
    shade.position.set(lx + 0.6, Y + 3.42, lz);
    shade.castShadow = true;
    ctx.add(shade);
    ctx.add(cyl(0.2, 0.2, 0.02, 12, flat({ color: 0xf2ead6 }), lx + 0.6, Y + 3.31, lz));
    // the conduit down the wall to a switch box
    ctx.add(box(0.045, 2.0, 0.045, m.metal, lx, Y + 2.3, lz + 0.1));
    ctx.add(box(0.16, 0.22, 0.09, m.metalDark, lx + 0.05, Y + 1.35, lz + 0.1));
  }

  /* ------------------------- the shop's flank, dressed -------------------------
   * The west side of the pocket is eight metres of blank cream render five and
   * a half metres tall, and that is the largest single surface in the corner.
   * It gets what the back of a shop gets: the outdoor unit, the gas meter and
   * its pipe run, a name plate, two posters nobody has taken down, and the
   * umbrella stand that lives by the back door. */
  {
    const wx = X0 + 0.1;
    /* Both units hang on the render, which is at x = 12.02 -- 0.18 west of `wx`.
     * They were at wx + 0.36 and wx + 0.3, so their backs stood 0.39 and 0.33 m
     * off the wall, and the lower one was on *feet* two metres up: a box in the
     * air with its own shadow on the render behind it.  On brackets now, with
     * the back face 90 mm off the wall, which is what the brackets span. */
    const acx = 12.02 + 0.15 + 0.09;
    ctx.add(makeAircon({ x: acx, z: Z0 + 8.0, y: Y + 1.55, ry: Math.PI / 2, w: 0.84, h: 0.6, feet: false }));
    ctx.add(makeAircon({ x: acx, z: Z0 + 1.5, y: Y + 2.35, ry: Math.PI / 2, w: 0.7, h: 0.5, feet: false }));
    // the gas meter and its pipe: up the wall, along, and down to the ground
    const meter = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.46, 0.32),
      [flat({ color: 0xd8d4cc }), flat({ color: 0xd8d4cc }), flat({ color: 0xd8d4cc }),
       flat({ color: 0xd8d4cc }), flat({ color: 0xd8d4cc }),
       flat({ color: 0xffffff, map: meterBox(), cache: false })]
    );
    meter.position.set(wx + 0.06, Y + 1.15, Z0 + 5.3);
    ctx.add(meter);
    const pipe = [];
    pipe.push({ geometry: new THREE.CylinderGeometry(0.03, 0.03, 1.0, 6), matrix: trs(wx + 0.06, Y + 0.55, Z0 + 5.12) });
    pipe.push({ geometry: new THREE.CylinderGeometry(0.03, 0.03, 3.1, 6), matrix: trs(wx + 0.06, Y + 1.9, Z0 + 5.12, Math.PI / 2, 0, 0) });
    pipe.push({ geometry: new THREE.CylinderGeometry(0.03, 0.03, 1.4, 6), matrix: trs(wx + 0.06, Y + 2.6, Z0 + 6.66) });
    for (let i = 0; i < 5; i++) {
      pipe.push({ geometry: new THREE.BoxGeometry(0.07, 0.05, 0.07), matrix: trs(wx + 0.08, Y + 0.7 + i * 0.42, Z0 + 5.12) });
    }
    // and the shop's two downpipes, which is why there is a drain here at all
    for (const pz of [Z0 + 0.9, Z0 + 7.4]) {
      pipe.push({ geometry: new THREE.CylinderGeometry(0.055, 0.055, 5.3, 6), matrix: trs(wx + 0.08, Y + 2.65, pz) });
      pipe.push({ geometry: new THREE.BoxGeometry(0.14, 0.09, 0.14), matrix: trs(wx + 0.1, Y + 0.18, pz) });
    }
    const pm = new THREE.Mesh(bake(pipe), m.metal);
    pm.castShadow = true;
    ctx.add(pm);

    // paper: a name plate by the back door and two faded posters
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.17),
      flat({ color: 0xffffff, map: namePlate(1), cache: false }));
    plate.position.set(wx + 0.03, Y + 1.62, Z0 + 6.9);
    plate.rotation.y = Math.PI / 2;
    ctx.add(plate);
    for (const [pz, py, v, op] of [[Z0 + 2.5, 1.72, 0, 0.82], [Z0 + 2.98, 1.6, 3, 0.7]]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.55),
        flat({ color: 0xffffff, map: poster(v), transparent: true, opacity: op, cache: false }));
      p.position.set(wx + 0.03, Y + py, pz);
      p.rotation.set(0, Math.PI / 2, rng.range(-0.03, 0.03));
      p.userData.noOutline = true;
      ctx.add(p);
    }
    ctx.add(makeUmbrellaStand({ x: wx + 0.42, z: Z0 + 7.0, y: Y + 0.08, n: 3, seed: 8811 }));
    ctx.add(makePostBox({ x: wx + 0.44, z: Z0 + 6.1, y: Y + 0.08, ry: Math.PI / 2 }));
  }

  /* ----------------------- the corner's own signage ----------------------- *
   * One invented plate on the low wall, naming the place.  It is the thing
   * that turns a gap between two buildings into somewhere with a name. */
  {
    const art = cornerPlate();
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 0.34, 1.15),
      // one map, both faces -- BoxGeometry already reverses udir on -x
      [flat({ color: 0xffffff, map: art, cache: false }),
       flat({ color: 0xffffff, map: art, cache: false }),
       flat({ color: PAL.wallGray }), flat({ color: PAL.wallGray }),
       flat({ color: PAL.wallGray }), flat({ color: PAL.wallGray })]
    );
    board.position.set(WALL_X - 0.14, Y + 1.42, Z1 - 2.1);
    board.castShadow = true;
    ctx.add(board);
    hullOutline(board, { thickness: 0.003 });
    for (const s of [-1, 1]) {
      ctx.add(box(0.05, 0.34, 0.05, m.metalDark, WALL_X - 0.11, Y + 1.15, Z1 - 2.1 + s * 0.5));
    }
  }

  /* ------------------------------- the clutter ------------------------------- */
  ctx.add(makeVendBin({ x: MX - 0.05, z: Z0 + 5.55, y: Y + 0.08, ry: -Math.PI / 2, color: PAL.bin }));
  ctx.add(makeCrates({ x: WALL_X - 0.5, z: Z0 + 7.4, y: Y + 0.08, n: 3, seed: 8821, ry: 0.16 }));
  ctx.add(makeCrates({ x: WALL_X - 0.55, z: Z0 + 8.2, y: Y + 0.08, n: 2, seed: 8822, ry: -0.22 }));
  ctx.add(makeBucket({ x: X0 + 1.0, z: Z0 + 1.3, y: Y + 0.09, ry: 0.6, tilt: 0.06 }));
  ctx.add(makePlanter({ x: X0 + 0.7, z: Z0 + 5.2, y: Y + 0.08, r: 0.24, flower: true, seed: 8823, n: 5 }));
  ctx.add(makePlanter({ x: X0 + 0.66, z: Z0 + 5.85, y: Y + 0.08, r: 0.19, flower: false, seed: 8824, n: 4 }));
  makeLoosePaper(ctx, [
    { x: X0 + 2.6, z: Z0 + 6.8, y: Y + 0.1, ry: 0.8 },
    { x: X0 + 3.4, z: Z0 + 1.9, y: Y + 0.1, ry: -0.5 },
  ]);

  /* ------------------------------- the cherry -------------------------------
   * At the north end, where the pocket opens into the alley, so it is seen
   * against the sky from inside the corner and it frames the way out.  Its
   * fallen blossom is what the bench is under. */
  sakura.push({ x: X0 + 2.5, z: Z1 - 1.1, y: Y, scale: 1.06, seed: 8831, lean: 0.13, leanDir: 1.1 });
  shrubs.push({ x: WALL_X - 0.7, z: Z1 - 1.4, y: Y + 0.08, r: 0.34, count: 3, spread: 0.9, seed: 8832 });

  /* Fallen petals and a scatter of dry leaves, kept to the edges: the middle
   * of the pocket is swept, because somebody sweeps it. */
  petals.push({ x: (X0 + X1) / 2, z: Z1 - 2.4, w: 4.6, d: 3.4, y: Y + 0.09, n: 90 });
  petals.push({ x: X0 + 1.1, z: Z0 + 2.6, w: 1.6, d: 4.0, y: Y + 0.1, n: 45 });
  {
    const leafGeo = new THREE.CircleGeometry(0.055, 5);
    const parts = [];
    for (let i = 0; i < 22; i++) {
      const lx = rng.range(X0 + 0.4, X1 - 0.7);
      const lz = rng.range(Z0 + 0.5, Z1 - 0.5);
      // only near the walls, where they collect
      const edge = Math.min(lx - X0, X1 - lx) < 1.4 || Math.min(lz - Z0, Z1 - lz) < 1.2;
      if (!edge) continue;
      parts.push({ geometry: leafGeo, matrix: trs(lx, 0, lz, -Math.PI / 2, rng.range(0, 3), 0) });
    }
    const lm = new THREE.Mesh(bake(parts), flat({ color: 0xbfa478 }));
    lm.position.y = Y + 0.093;
    lm.userData.noOutline = true;
    ctx.add(lm);
    leafGeo.dispose();
  }

  return { sakura, shrubs, grove, petals };
}
