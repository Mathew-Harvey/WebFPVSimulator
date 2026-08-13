import * as THREE from 'three';
import { PAL, DRINKS } from '../core/palette.js';
import { cel, flat } from '../core/toon.js';
import { vendHeader, vendPrice, vendCold, vendSlot } from '../core/textures.js';
import { box, cyl, bake, trs, rngKit, shadowify } from '../core/util.js';
import { hullOutline } from '../core/outline.js';

/* ------------------------------------------------------------------ *
 * Vending machines.
 *
 * The shelves are real geometry -- instanced bottles and cans behind a
 * sheet of glass -- because those rows of saturated colour are the single
 * best accent the middle ground has.  The lit panels use emissive toon
 * material rather than bloom, so they glow without hazing the frame.
 * ------------------------------------------------------------------ */

const BODY_W = 1.12;
const BODY_H = 1.95;
const BODY_D = 0.72;

const VARIANTS = [
  { body: PAL.vendWhite, accent: PAL.red, header: 0, shelfBack: 0x2d3140 },
  { body: PAL.vendRed, accent: 0xfdf6ec, header: 1, shelfBack: 0x2a2c38 },
  { body: PAL.vendTeal, accent: 0xfdf6ec, header: 2, shelfBack: 0x27313a },
];

/**
 * Place a machine in the world and wire up its interaction.
 *
 * The corner shop drives its two machines through `shopState`; everything
 * else in the district just wants a machine that works, so the dispense
 * animation gets its own little updater here.
 */
export function addVending(ctx, o = {}) {
  const v = makeVendingMachine(o.variant ?? 0, o.seed ?? 1);
  v.position.set(o.x, o.y ?? 0, o.z);
  v.rotation.y = o.ry ?? 0;
  shadowify(v, true, true);
  ctx.add(v);
  const half = 0.56;
  ctx.collide(o.x - half, o.z - half, o.x + half, o.z + half, (o.y ?? 0) + BODY_H);
  const anims = [];
  ctx.interact({
    hitbox: v.userData.hitbox,
    label: o.label ?? '自動販売機  ·  buy a drink',
    action: () => anims.push(v.userData.dispense()),
  });
  ctx.update((dt) => {
    for (let i = anims.length - 1; i >= 0; i--) if (anims[i](dt)) anims.splice(i, 1);
  });
  return v;
}

/**
 * @param variant 0 white / 1 red / 2 teal
 * @param facing  outward normal in radians about Y (0 = faces +Z)
 */
export function makeVendingMachine(variant = 0, seed = 1) {
  const V = VARIANTS[variant % VARIANTS.length];
  const rng = rngKit(1000 + seed * 37);
  const g = new THREE.Group();
  g.name = 'vending';
  // holds the animated dispensed can, so it is re-seated rather than bent
  g.userData.planetRigid = true;

  const matBody = cel({ color: V.body, bands: 3, tint: 0x6f6790 });
  const matAccent = cel({ color: V.accent, bands: 3, tint: 0x6f6790 });
  const matDark = cel({ color: 0x30333f, bands: 2, tint: 0x4b4560 });
  const matPlinth = cel({ color: PAL.metalDark, bands: 3, tint: 0x5c5680 });
  const matShelf = cel({ color: 0xf3f0ea, bands: 2, tint: 0x7d74a0 });

  const front = BODY_D / 2 + 0.001;
  const yBase = 0.09;

  /* The 取出口, as a rectangle taken out of the front of the body.
   *
   * It was a *printed panel* for the whole life of this machine -- a plate with
   * a painted black bar on the front face -- and the can `dispense()` drops was
   * released at `front - 0.14`, which is 0.14 m inside a solid box.  So the one
   * interaction nineteen machines share played a perfectly good animation
   * entirely within opaque geometry: nothing threw, nothing logged, and
   * pressing E did nothing anybody could see.  Same family as the onsen
   * street's 格子 screens -- **you cannot carve a recess into a box** -- except
   * that here the answer cannot be "build it outward", because a delivery port
   * is a hole.  The body is therefore five boxes with a notch out of the front.
   */
  /* 0.165 tall against 0.11 deep, and that ratio is the whole design.
   *
   * A pocket is only visible from a sight line shallower than
   * `atan(height / depth)` -- steeper than that and the port's own head cuts the
   * tray off.  The first cut was 0.135 over 0.17, i.e. 38 degrees, and the
   * player's collider stops them 0.54 m from the face: at that range the eye
   * looks down at 70 degrees and **the can cannot be seen from the only place
   * you can stand to press E**.  0.165 over 0.11 is 56.3 degrees, so the mouth
   * is open to a standing eye from about a metre out; the translucent flap
   * covers everything nearer, because a can behind smoked plastic still reads
   * as a can. */
  const PORT = { x0: -0.50, x1: 0.10, y0: 0.125, y1: 0.29, z: front - 0.11 };
  const PORT_W = PORT.x1 - PORT.x0;
  const PORT_MX = (PORT.x0 + PORT.x1) / 2;

  /* Plinth + body.  The plinth is inset and stops 30 mm short of the paving so
   * the levelling feet below it have something to be: see the base note lower
   * down.  It still reads as sitting on the ground because the body overhangs
   * it on all four sides and the gap is in its own shadow. */
  const plinth = box(BODY_W - 0.05, 0.06, BODY_D - 0.05, matPlinth, 0, 0.06, 0);
  g.add(plinth);
  /* One mesh, not five: `hullOutline` draws a contour per mesh, so five boxes
   * would put a heavy ink line across the front of the machine along every
   * seam between them.  Merged, the only edges left to ink are the outside of
   * the machine and the mouth of the port -- which is exactly what should be
   * inked. */
  const BX = BODY_W / 2, BZ = BODY_D / 2, BY1 = yBase + BODY_H;
  const bodyParts = [];
  const slab = (x0, x1, y0, y1, z0, z1) => bodyParts.push({
    geometry: new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0),
    matrix: trs((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2),
  });
  slab(-BX, BX, PORT.y1, BY1, -BZ, BZ);                     // over the port
  slab(-BX, BX, yBase, PORT.y0, -BZ, BZ);                   // the lip under it
  slab(-BX, PORT.x0, PORT.y0, PORT.y1, -BZ, BZ);            // left of it
  slab(PORT.x1, BX, PORT.y0, PORT.y1, -BZ, BZ);             // right of it
  slab(PORT.x0, PORT.x1, PORT.y0, PORT.y1, -BZ, PORT.z);    // behind it
  const body = new THREE.Mesh(bake(bodyParts), matBody);
  body.castShadow = body.receiveShadow = true;
  g.add(body);
  hullOutline(body, { thickness: 0.0036 });

  // lit header
  const header = box(BODY_W - 0.06, 0.3, 0.03, flat({ color: 0xffffff, map: vendHeader(V.header), cache: false }),
    0, yBase + BODY_H - 0.22, front + 0.015);
  g.add(header);
  g.add(box(BODY_W - 0.02, 0.36, 0.03, matAccent, 0, yBase + BODY_H - 0.22, front));

  /* --------------------------- product display ---------------------------
   * The body is a solid block, so the display is built *forward* of its face
   * as a glazed cabinet.  Modelling it as a recess just buries the bottles
   * inside opaque geometry and the machine loses the one thing that makes it
   * worth having in frame.                                                */
  const dispW = BODY_W - 0.22;
  const dispH = 0.94;
  const dispY = yBase + 0.86;
  const dz = front + 0.004;      // back plane of the cabinet
  const zShelf = dz + 0.055;
  const zGlass = dz + 0.125;
  g.add(box(dispW, dispH, 0.02, cel({ color: V.shelfBack, bands: 2, tint: 0x413c58 }), 0, dispY, dz));
  // cabinet sides, so the protruding box reads as a fitted unit
  for (const s of [-1, 1]) {
    g.add(box(0.03, dispH, 0.13, matBody, s * (dispW / 2 + 0.015), dispY, dz + 0.065));
  }
  g.add(box(dispW + 0.06, 0.03, 0.13, matBody, 0, dispY + dispH / 2 + 0.015, dz + 0.065));
  g.add(box(dispW + 0.06, 0.03, 0.13, matBody, 0, dispY - dispH / 2 - 0.015, dz + 0.065));

  const shelves = 4;
  const bottleGeoTall = new THREE.CylinderGeometry(0.032, 0.032, 0.165, 8);
  const bottleGeoCan = new THREE.CylinderGeometry(0.03, 0.03, 0.11, 8);
  const perShelf = 6;
  const total = shelves * perShelf;
  const drinkMat = cel({ color: 0xffffff, bands: 'soft3', tint: 0x9c93b8, cache: false });
  const inst = new THREE.InstancedMesh(bottleGeoTall, drinkMat, total);
  const instCan = new THREE.InstancedMesh(bottleGeoCan, drinkMat, total);
  const d = new THREE.Object3D();
  const col = new THREE.Color();
  let nT = 0, nC = 0;
  for (let s = 0; s < shelves; s++) {
    const sy = dispY - dispH / 2 + 0.13 + s * 0.225;
    // shelf board
    g.add(box(dispW - 0.02, 0.018, 0.11, matShelf, 0, sy - 0.095, zShelf));
    // price strip on the front lip of each shelf
    const strip = box(dispW - 0.02, 0.055, 0.012,
      flat({ color: 0xffffff, map: vendPrice(), cache: false }), 0, sy - 0.075, zGlass + 0.004);
    g.add(strip);
    const tall = s % 2 === 0;
    for (let i = 0; i < perShelf; i++) {
      const px = -dispW / 2 + 0.09 + (i * (dispW - 0.16)) / (perShelf - 1);
      col.set(DRINKS[(s * perShelf + i + variant * 3) % DRINKS.length]);
      d.position.set(px, sy + (tall ? 0.085 : 0.06), zShelf + 0.008);
      d.rotation.set(0, rng.range(0, 3), 0);
      d.updateMatrix();
      if (tall) {
        inst.setMatrixAt(nT, d.matrix);
        inst.setColorAt(nT, col);
        nT++;
      } else {
        instCan.setMatrixAt(nC, d.matrix);
        instCan.setColorAt(nC, col);
        nC++;
      }
    }
  }
  inst.count = nT;
  instCan.count = nC;
  inst.instanceColor.needsUpdate = true;
  instCan.instanceColor.needsUpdate = true;
  inst.userData.noOutline = true;
  instCan.userData.noOutline = true;
  g.add(inst, instCan);

  // glass over the display, with one flat highlight
  const glass = box(dispW + 0.03, dispH + 0.03, 0.012,
    flat({ color: 0xd8e8f2, transparent: true, opacity: 0.13, depthWrite: false, cache: false }),
    0, dispY, zGlass);
  glass.userData.noOutline = true;
  g.add(glass);
  const hi = new THREE.Mesh(
    new THREE.PlaneGeometry(dispW * 0.22, dispH * 0.98),
    flat({ color: 0xf2f8ff, transparent: true, opacity: 0.13, depthWrite: false, cache: false })
  );
  hi.position.set(-dispW * 0.24, dispY, zGlass + 0.009);
  hi.rotation.z = 0.22;
  hi.userData.noOutline = true;
  g.add(hi);
  // glass frame
  for (const [w, h, x, y] of [
    [dispW + 0.09, 0.038, 0, dispY + dispH / 2 + 0.032],
    [dispW + 0.09, 0.038, 0, dispY - dispH / 2 - 0.032],
    [0.038, dispH + 0.1, -dispW / 2 - 0.032, dispY],
    [0.038, dispH + 0.1, dispW / 2 + 0.032, dispY],
  ]) {
    g.add(box(w, h, 0.05, matAccent, x, y, zGlass - 0.01));
  }

  /* ------------------------- controls and openings ------------------------- */
  // cold / hot label
  const cold = box(0.42, 0.1, 0.012, flat({ color: 0xffffff, map: vendCold(false), cache: false }),
    -0.28, yBase + 0.36, front + 0.008);
  g.add(cold);
  const hot = box(0.3, 0.1, 0.012, flat({ color: 0xffffff, map: vendCold(true), cache: false }),
    0.2, yBase + 0.36, front + 0.008);
  g.add(hot);

  /* Selection buttons.
   *
   * Moved up and drawn narrower, because the port they used to share the front
   * face with is a hole now.  They were at y 0.16..0.35 across x -0.45..0.59
   * and the printed port panel was at y 0.10..0.34 across x -0.51..0.11 -- the
   * same plane, overlapping -- so **three of the five in each row had been
   * invisible behind it** since the machine was built.  This band, y 0.285..0.395,
   * is the only one that is clear: the port tops out at 0.28 below it and the
   * つめたい / あたたかい plates start at 0.40 above it. */
  const btnLit = cel({ color: 0xfff2cf, bands: 2, emissive: 0xffd98a, emissiveIntensity: 0.55, tint: 0x8f86ad });
  for (let r = 0; r < 2; r++) {
    for (let i = 0; i < 5; i++) {
      const bx = -0.45 + i * 0.16;
      const by = 0.37 - r * 0.06;
      g.add(box(0.15, 0.05, 0.015, r === 0 ? btnLit : matAccent, bx, by, front + 0.008));
    }
  }

  // coin slot + electronic payment pad
  g.add(box(0.2, 0.34, 0.02, matDark, 0.4, yBase + 0.62, front + 0.008));
  g.add(box(0.12, 0.02, 0.025, cel({ color: 0xe8e4dc, bands: 2 }), 0.4, yBase + 0.72, front + 0.014));
  g.add(box(0.13, 0.05, 0.025, flat({ color: 0x8fd4c8 }), 0.4, yBase + 0.52, front + 0.014));

  /* Change return: the cup, the coin-return lever above it, and the little
   * chrome flap.  It is 0.16 m across and nobody will read it from the far
   * kerb, but it is the difference between a machine and a box with drinks
   * painted on it -- and the corner these now stand in is looked at close up. */
  g.add(box(0.17, 0.12, 0.03, matDark, 0.4, yBase + 0.4, front + 0.005));
  g.add(box(0.13, 0.075, 0.02, cel({ color: 0x1d2029, bands: 2, tint: 0x3f3a55 }), 0.4, yBase + 0.385, front + 0.02));
  g.add(box(0.15, 0.022, 0.028, cel({ color: 0xc8ccd4, bands: 2, tint: 0x6a6288 }), 0.4, yBase + 0.455, front + 0.02));
  g.add(box(0.05, 0.05, 0.03, matPlinth, 0.29, yBase + 0.47, front + 0.02));

  /* Condenser grille, low on the front beside the delivery port.  Every one of
   * these has one and it is always filthy; here it is just a run of slats, but
   * it is what stops the bottom of the machine being a blank panel.  Its band
   * is the port's, so the two line up along the bottom of the machine. */
  for (let i = 0; i < 3; i++) {
    g.add(box(0.34, 0.022, 0.018, matDark, 0.33, PORT.y0 + 0.03 + i * 0.038, front + 0.006));
  }
  g.add(box(0.38, PORT.y1 - PORT.y0, 0.012, cel({ color: V.body, bands: 3, tint: 0x6f6790 }),
    0.33, (PORT.y0 + PORT.y1) / 2, front + 0.001));

  /* ---------------------------- inside the port ----------------------------
   * The notch's own faces are the machine's colour, which is what the outside
   * of a machine is made of and not the inside of a delivery bin.  Lined:
   * dark back, sides and head, and a lighter tray floor -- the floor has to
   * come up a value or the can lands on black and stops being a can. */
  const matPort = cel({ color: 0x35373f, bands: 2, tint: 0x3f3a55 });
  const matTray = cel({
    color: 0x6e7280, bands: 2, tint: 0x4b4560,
    emissive: 0x2b2e38, emissiveIntensity: 0.7,     // same reason as the can
  });
  const pocketD = front - 0.016 - (PORT.z + 0.006);
  const pocketZ = PORT.z + 0.006 + pocketD / 2;
  const pocketH = PORT.y1 - PORT.y0 - 0.02;
  const pocketY = (PORT.y0 + PORT.y1) / 2;
  g.add(box(PORT_W - 0.012, PORT.y1 - PORT.y0, 0.012, matPort, PORT_MX, pocketY, PORT.z + 0.007));
  g.add(box(PORT_W - 0.012, 0.012, pocketD, matTray, PORT_MX, PORT.y0 + 0.007, pocketZ));
  g.add(box(PORT_W - 0.012, 0.01, pocketD, matPort, PORT_MX, PORT.y1 - 0.006, pocketZ));
  for (const s of [-1, 1]) {
    g.add(box(0.01, pocketH, pocketD, matPort, PORT_MX + s * (PORT_W / 2 - 0.007), pocketY, pocketZ));
  }

  /* The flap over it: smoked plastic, and it does not move.
   *
   * A swinging one was built first and it cannot work here.  Hinged at the top
   * it sweeps the whole pocket, and the pocket is 0.11 m deep against a can
   * 0.066 m across -- so an inward flap long enough to cover the opening ends
   * up either through the back liner or through the can.  Deepening the pocket
   * to make room is exactly what the note on `PORT` says not to do.
   *
   * A fixed translucent one is better than a moving opaque one anyway: it is
   * what the real thing is made of, it never fights the can, and it means the
   * drink can be seen from *any* distance rather than only from far enough back
   * to see past the head.  The motion the interaction needs is the can falling,
   * which is what was asked for.  It carries the 取出口 lettering because that
   * is where a real machine puts it once the plate it used to be printed on is
   * an opening. */
  {
    /* 0.40 and not higher.  The whole point of the flap being translucent is
     * that the can behind it reads from close up, where the port's own head
     * hides the mouth -- at 0.62 the drink came out as a faint disturbance in
     * the 取出口 lettering rather than as a drink. */
    const tint = { transparent: true, opacity: 0.40, depthWrite: false, cache: false };
    const edge = flat({ color: 0x2e2c38, ...tint });
    const face = flat({ color: 0xffffff, map: vendSlot(), ...tint });
    // face index 4 is +z on a BoxGeometry, which is the side the street sees
    const flap = new THREE.Mesh(new THREE.BoxGeometry(PORT_W - 0.03, PORT.y1 - PORT.y0 - 0.014, 0.008),
      [edge, edge, edge, edge, face, edge]);
    flap.position.set(PORT_MX, pocketY, front - 0.012);
    flap.userData.noOutline = true;
    g.add(flap);
  }

  /* Base: a recessed kick plate on four levelling feet.  A machine sitting
   * flush on the paving looks stuck to it; the 35 mm gap with feet in it is
   * what makes it read as a thing that was wheeled in and levelled up. */
  g.add(box(BODY_W - 0.06, 0.055, BODY_D - 0.06, matDark, 0, 0.062, 0));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(cyl(0.028, 0.032, 0.035, 6, matPlinth,
        sx * (BODY_W / 2 - 0.09), 0.018, sz * (BODY_D / 2 - 0.09)));
    }
  }

  // side seams
  for (const s of [-1, 1]) {
    g.add(box(0.02, BODY_H - 0.1, 0.02, matPlinth, s * (BODY_W / 2 + 0.002), yBase + BODY_H / 2, front - 0.02));
  }

  /* --------------------- the can that drops when used ---------------------
   * Authored on +y like every cylinder, so a quarter turn about z lays it
   * along the machine's width -- which is how one arrives in the tray, and the
   * only way a 0.12 m can fits under a 0.155 m opening. */
  const CAN_R = 0.033;
  /* Not `DRINKS[...]` like the shelves, and for the reason the parked cars'
   * bottle green was lifted: the port is a pocket the sun never reaches, so
   * everything in it is on the cel ramp's bottom band under a violet tint, and
   * half that palette lands within a few per cent of the ink colour there.  A
   * can has to read against a dark tray from a metre away, so these three are
   * chosen light. */
  const CAN_COL = [0xf0c34a, 0xe4776a, 0x74c8dc][variant % 3];
  /* And emissive, which is the part that took two passes to work out: the
   * pocket is a hole the sun never enters, so *everything* in it sits on the
   * cel ramp's bottom band under a violet tint -- a light can and a dark liner
   * come out within a few per cent of each other, and the drink read as a smudge
   * behind the lettering rather than as a drink.  Lifting the emissive keeps the
   * cylinder's shading and takes the value out of the floor; the same trick the
   * lit selection buttons use. */
  const can = new THREE.Mesh(
    new THREE.CylinderGeometry(CAN_R, CAN_R, 0.12, 10),
    cel({
      color: CAN_COL, bands: 2, tint: 0x6f6790,
      emissive: CAN_COL, emissiveIntensity: 0.42,
    })
  );
  can.visible = false;
  can.castShadow = true;
  g.add(can);

  const CAN_X = PORT_MX;
  const CAN_Z = PORT.z + 0.055;
  const CAN_TOP = PORT.y1 + 0.09;                       // in the chute, out of sight
  const CAN_REST = PORT.y0 + 0.013 + CAN_R;             // on the tray floor
  const T_FALL = Math.sqrt((CAN_TOP - CAN_REST) / 4.9); // g/2, so it reads as a drop
  /* It sits in the tray for two and a half seconds before it is gone -- long
   * enough that somebody who pressed E and then looked down sees a drink
   * there.  A headless line-of-sight check from a player two metres off put an
   * earlier 0.9 s hold at 44 % of the animation visible; this is most of it. */
  const T_GONE = 2.6;

  /* One can, so one animation.  Both callers keep a list of live steppers and
   * push a new one per press, and two of them driving the same mesh fight:
   * the older one reaches its end first and hides a can the newer one is
   * still dropping.  A press supersedes the press before it. */
  let token = 0;

  g.userData.dispense = (onDone) => {
    const mine = ++token;
    can.visible = true;
    can.position.set(CAN_X, CAN_TOP, CAN_Z);
    can.rotation.set(0, 0, Math.PI / 2);
    let t = 0;
    return (dt) => {
      if (mine !== token) return true;
      t += dt;
      if (t < T_FALL) {
        can.position.y = CAN_TOP - 4.9 * t * t;
        // rocking rather than spinning: it is falling a fifth of a metre
        can.rotation.z = Math.PI / 2 + Math.sin(t * 26) * 0.42;
      } else {
        // one small bounce off the tray, damped out in about a third of a second
        const u = t - T_FALL;
        can.position.y = CAN_REST + Math.abs(Math.sin(u * 17)) * 0.03 * Math.exp(-u * 7);
        can.rotation.z = Math.PI / 2;
      }
      if (t > T_GONE) {
        can.visible = false;
        onDone?.();
        return true;
      }
      return false;
    };
  };

  // interaction hitbox
  const hit = box(BODY_W, BODY_H, BODY_D + 0.7, flat({ color: 0xff0000, cache: false }), 0, yBase + BODY_H / 2, 0.35);
  hit.visible = false;
  g.add(hit);
  g.userData.hitbox = hit;

  return g;
}
