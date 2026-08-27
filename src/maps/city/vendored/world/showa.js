import * as THREE from 'three';
import { PAL } from '../core/palette.js';
import { cel, flat } from '../core/toon.js';
import {
  shopBlade, chalkNotice, sleeveTex, poster, showaInterior, warningPlate,
} from '../core/textures.js';
import { box, cyl, bake, trs, rngKit } from '../core/util.js';
import { hullOutline } from '../core/outline.js';
import { groundY } from './street.js';
import { makeCrates, makeAircon, makePlanter, makeBucket, makeSignPost, makeLoosePaper } from './props.js';

/* ------------------------------------------------------------------ *
 * The two Showa units on さくら坂商店街.
 *
 * 「レコード ほしぞら」 and 「電器 たかの」, on the six metres of west-row
 * frontage the coin parking used to hold.  (It moved to the north block; see
 * the note at the top of `northblock.js`.)
 *
 * The point of both is *age*, and age in this look cannot come from texture --
 * the whole art direction rules out high-frequency detail, so there is no dirt
 * to add and no paint to crack.  It has to come from four things instead:
 *
 *  - **Faded pairs of tones.**  Both fascias are drawn low-contrast against the
 *    crisp modern signs either side of them, and the fascia grounds have gone
 *    yellow-green.  Put a saturated sign between two faded ones and the faded
 *    ones read as old rather than as badly drawn.
 *  - **Stock in the window, right up to the glass.**  The seven modern units on
 *    this street all have air around their goods.  These two are full, which is
 *    the single clearest difference between an old shop and a new one.
 *  - **Goods out on the pavement that are themselves old objects.**  A wood-cased
 *    television, a pedestal fan, a valve radio, a crate of LPs.  Each one is
 *    built rather than painted, because they are all within two metres of the
 *    player and each one is a silhouette people know.
 *  - **A hand-written board.**  Nothing says a person runs this shop, and has for
 *    thirty years, like chalk.
 *
 * The photo studio the brief offers as the alternative was drafted and dropped:
 * a Showa 写真館 window is portraits, and there are no people anywhere in this
 * world -- and a photographer's window with nobody in it reads as a mistake
 * rather than as a choice.
 * ------------------------------------------------------------------ */

const M = {};
function mats() {
  if (M.metal) return M;
  M.metal = cel({ color: PAL.metal, bands: 3, tint: 0x666090 });
  M.metalDark = cel({ color: PAL.metalDark, bands: 3, tint: 0x5c5680 });
  M.dark = cel({ color: PAL.blackSoft, bands: 2, tint: 0x4b4560 });
  M.wood = cel({ color: 0x9c7f5e, bands: 3, tint: 0x5c5680 });
  M.woodDark = cel({ color: 0x74563f, bands: 3, tint: 0x554e74 });
  M.card = cel({ color: 0xc9a878, bands: 3, tint: 0x6f6790 });
  M.cream = cel({ color: 0xefe6d2, bands: 3, tint: 0x6f6790 });
  M.concrete = cel({ color: PAL.concrete, bands: 3, tint: 0x6f6790 });
  return M;
}

/**
 * Dress both units' frontages.
 *
 * `x` is the frontage line and props stand *east* of it, so everything faces +x.
 * Getting that backwards is the mistake the gachapon bank made -- a shopfront
 * addressing its own wall.
 */
export function dressShowa(ctx, { x, record, denki }) {
  const m = mats();
  const rng = rngKit(9301);
  const edge = x + 0.15;                    // the pavement, a hand's width off

  buildDenki(ctx, m, rng, x, edge, denki);
  buildRecord(ctx, m, rng, x, edge, record);
}

/* ------------------------------------------------------------------ *
 * 電器 たかの.
 * ------------------------------------------------------------------ */

function buildDenki(ctx, m, rng, fx, edge, u) {
  const zc = (u.z0 + u.z1) / 2;
  const y = groundY(zc) + 0.13;             // the pavement level

  // the lit vertical box beside the door, at head height where you read it
  ctx.add(makeVertSign({ x: fx + 0.22, z: u.z1 - 0.5, y: y + 1.55, kind: 'denki', h: 1.25, ry: 0 }));

  /* the goods on the pavement: a television on a crate, a fan, a radio on a box.
   * Three objects, three heights, three silhouettes -- which is what makes a
   * pavement display read at eight metres. */
  ctx.add(makeCrates({ x: edge + 0.36, z: u.z0 + 0.55, y, n: 2, seed: 9311, ry: Math.PI / 2 }));
  ctx.add(makeOldTv({ x: edge + 0.4, z: u.z0 + 0.55, y: y + 0.56, ry: Math.PI / 2 - 0.18 }));
  ctx.add(makeFan({ x: edge + 0.34, z: u.z0 + 1.5, y, ry: Math.PI / 2 + 0.3 }));
  ctx.add(makeCrates({ x: edge + 0.3, z: u.z1 - 1.5, y, n: 1, seed: 9312, ry: Math.PI / 2 - 0.1 }));
  ctx.add(makeRadio({ x: edge + 0.32, z: u.z1 - 1.5, y: y + 0.28, ry: Math.PI / 2 + 0.24 }));

  // the boxed bulbs, stacked the way a stockroom overflow always is
  ctx.add(makeBulbBoxes({ x: edge + 0.3, z: u.z0 + 2.2, y, ry: Math.PI / 2, seed: 9313 }));

  // the repair board: the shop's actual trade, chalked
  ctx.add(makeChalkBoard({ x: edge + 0.5, z: u.z1 - 0.75, y, ry: Math.PI / 2 + 0.1, variant: 1 }));

  // and the shop's own kit: an outdoor unit high on the pier, a bucket, a poster
  // fx + 0.24, not fx - 0.3: the frontage face is fx, so the old x buried the
  // unit half a metre inside the pier it was supposed to be bracketed to
  ctx.add(makeAircon({ x: fx + 0.24, z: u.z0 + 0.35, y: y + 1.85, ry: Math.PI / 2, w: 0.74, h: 0.52, feet: false }));
  ctx.add(makeBucket({ x: edge + 0.16, z: u.z0 + 2.9, y, ry: -0.7, tilt: 0.08 }));
  {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.5),
      flat({ color: 0xffffff, map: poster(1), cache: false }));
    p.position.set(fx + 0.04, y + 1.6, u.z0 + 0.34);
    p.rotation.y = Math.PI / 2;
    p.rotation.z = 0.02;
    p.userData.noOutline = true;
    ctx.add(p);
  }
  makeLoosePaper(ctx, [{ x: edge + 0.7, z: u.z0 + 2.7, y: y + 0.01, ry: 0.6 }]);
}

/* ------------------------------------------------------------------ *
 * レコード ほしぞら.
 * ------------------------------------------------------------------ */

function buildRecord(ctx, m, rng, fx, edge, u) {
  const zc = (u.z0 + u.z1) / 2;
  const y = groundY(zc) + 0.13;

  ctx.add(makeVertSign({ x: fx + 0.22, z: u.z0 + 0.5, y: y + 1.55, kind: 'record', h: 1.25, ry: 0 }));

  /* the crate of second-hand sleeves out front, which is the whole shop in one
   * prop: you can see what it sells from across the street */
  ctx.add(makeLpCrate({ x: edge + 0.93, z: u.z1 - 0.9, y, ry: Math.PI / 2 - 0.12, seed: 9321 }));
  ctx.add(makeLpCrate({ x: edge + 0.93, z: u.z1 - 1.9, y, ry: Math.PI / 2 + 0.08, seed: 9322 }));

  // the glazed case with three sleeves propped in it, at eye height
  ctx.add(makeDisplayCase({ ctx, x: edge + 0.44, z: u.z0 + 1.1, y, ry: Math.PI / 2, seed: 9323 }));

  ctx.add(makeChalkBoard({ x: edge + 0.5, z: u.z0 + 0.34, y, ry: Math.PI / 2 - 0.14, variant: 0 }));
  ctx.add(makePlanter({ x: edge + 0.97, z: u.z1 - 2.6, y, r: 0.23, flower: false, seed: 9324, n: 4 }));
  ctx.add(makeAircon({ x: fx + 0.24, z: u.z1 - 0.35, y: y + 1.9, ry: Math.PI / 2, w: 0.7, h: 0.5, feet: false }));
  ctx.add(makeCrates({ x: edge + 0.28, z: u.z0 + 2.35, y, n: 3, seed: 9325, ry: Math.PI / 2 + 0.15 }));
  {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.48),
      flat({ color: 0xffffff, map: poster(2), cache: false }));
    p.position.set(fx - 0.03, y + 1.58, u.z0 + 1.98);
    p.rotation.y = Math.PI / 2;
    p.rotation.z = -0.025;
    p.userData.noOutline = true;
    ctx.add(p);
  }
}

/* ================================================================== *
 * The props.  All of them are within two metres of the player, which is why
 * every one is built rather than painted.
 * ================================================================== */

/**
 * A small internally-lit vertical box sign.
 *
 * The case is the effect, exactly as it is on the shopping street's fascias:
 * `flat()` is unlit so the face cannot be made brighter, only the frame around
 * it darker.  Mapped on both faces because you read it walking either way, and
 * `BoxGeometry` reverses `udir` on the negative face of every axis, so one map
 * serves both -- adding a mirrored clone is what used to produce mirror writing.
 */
function makeVertSign(o = {}) {
  const m = mats();
  const g = new THREE.Group();
  const h = o.h ?? 1.2;
  const art = shopBlade(o.kind ?? 'record');
  const face = () => flat({ color: 0xfff2d8, map: art, cache: false });
  const side = flat({ color: 0x3a3744 });
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, h, 0.38),
    [side, side, side, side, face(), face()]
  );
  board.castShadow = true;
  g.add(board);
  hullOutline(board, { thickness: 0.003 });
  g.add(box(0.26, h + 0.14, 0.46, m.metalDark, -0.04, 0, 0));
  // the two brackets back to the frontage
  for (const dy of [h / 2 - 0.1, -h / 2 + 0.1]) {
    g.add(box(0.3, 0.05, 0.05, m.metalDark, -0.24, dy, 0));
  }
  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  return g;
}

/**
 * A wood-cased television.
 *
 * What identifies one at four metres is the proportion -- a deep box, much
 * deeper than it is wide -- plus the rounded dark screen inset in a lighter
 * bezel, the knob column down one side, and four splayed legs.  Get any of
 * those wrong and it is a crate.
 */
function makeOldTv(o = {}) {
  const m = mats();
  const g = new THREE.Group();
  const W = 0.5, H = 0.42, D = 0.42;
  const caseMat = cel({ color: 0x8a6a4c, bands: 3, tint: 0x5c5680 });
  const body = box(W, H, D, caseMat, 0, H / 2 + 0.12, 0);
  body.castShadow = body.receiveShadow = true;
  g.add(body);
  hullOutline(body, { thickness: 0.0034 });
  // the bezel, the screen, and the one pale highlight that says "glass"
  g.add(box(0.4, 0.34, 0.03, cel({ color: 0xd8cdb8, bands: 3, tint: 0x6a6288 }), -0.04, H / 2 + 0.13, D / 2 + 0.015));
  const scr = box(0.33, 0.27, 0.02, cel({ color: 0x4a4b58, bands: 2, tint: 0x413c58 }), -0.04, H / 2 + 0.13, D / 2 + 0.03);
  g.add(scr);
  const gl = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.24),
    flat({ color: 0xd8e4ee, transparent: true, opacity: 0.3, depthWrite: false, cache: false }));
  gl.position.set(-0.12, H / 2 + 0.14, D / 2 + 0.042);
  gl.rotation.z = 0.24;
  gl.userData.noOutline = true;
  g.add(gl);
  // the knob column, the speaker grille and the brand strip
  for (let i = 0; i < 3; i++) {
    g.add(cyl(0.035, 0.035, 0.03, 10, m.dark, 0.19, H / 2 + 0.26 - i * 0.09, D / 2 + 0.025).rotateX(Math.PI / 2));
  }
  g.add(box(0.09, 0.1, 0.02, cel({ color: 0x6a5f52, bands: 2, tint: 0x554e74 }), 0.19, H / 2 - 0.03, D / 2 + 0.02));
  g.add(box(0.16, 0.03, 0.015, flat({ color: 0xd8cdb8 }), -0.06, 0.16, D / 2 + 0.02));
  // four splayed legs
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const l = cyl(0.016, 0.022, 0.14, 6, m.woodDark, sx * (W / 2 - 0.06), 0.06, sz * (D / 2 - 0.06));
      l.rotation.set(sz * 0.16, 0, -sx * 0.16);
      g.add(l);
    }
  }
  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  return g;
}

/** A pedestal fan: a heavy base, a column, and a cage you can see through. */
function makeFan(o = {}) {
  const m = mats();
  const g = new THREE.Group();
  const cream = cel({ color: 0xe4dcc8, bands: 3, tint: 0x6f6790 });
  g.add(cyl(0.16, 0.19, 0.05, 12, cream, 0, 0.025, 0));
  g.add(cyl(0.05, 0.06, 0.02, 10, m.metalDark, 0, 0.06, 0));
  const col = cyl(0.026, 0.03, 0.72, 8, m.metal, 0, 0.42, 0);
  col.castShadow = true;
  g.add(col);
  g.add(cyl(0.05, 0.05, 0.06, 8, cream, 0, 0.78, 0));
  // the motor can, then the cage: two rings and a spider of spokes
  const can = cyl(0.075, 0.075, 0.16, 10, cream, 0, 0.9, -0.07);
  can.rotation.x = Math.PI / 2;
  can.castShadow = true;
  g.add(can);
  for (const [r, dz] of [[0.21, 0.02], [0.2, 0.09]]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.011, 4, 16), m.metal);
    ring.position.set(0, 0.9, dz);
    g.add(ring);
  }
  for (let i = 0; i < 8; i++) {
    const sp = box(0.4, 0.012, 0.012, m.metal, 0, 0.9, 0.055);
    sp.rotation.z = (i / 8) * Math.PI;
    g.add(sp);
  }
  // the blades, behind the cage, as three pale wedges
  for (let i = 0; i < 3; i++) {
    const bl = box(0.3, 0.09, 0.012, cel({ color: 0xd8d2c0, bands: 2, tint: 0x6a6288 }), 0, 0.9, 0.0);
    bl.rotation.z = (i / 3) * Math.PI * 2;
    g.add(bl);
  }
  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  return g;
}

/** A valve radio: a case, a cloth grille, a dial scale and a whip aerial. */
function makeRadio(o = {}) {
  const m = mats();
  const g = new THREE.Group();
  const caseMat = cel({ color: 0x7d5f44, bands: 3, tint: 0x5c5680 });
  const b = box(0.34, 0.2, 0.16, caseMat, 0, 0.1, 0);
  b.castShadow = b.receiveShadow = true;
  g.add(b);
  hullOutline(b, { thickness: 0.003 });
  g.add(box(0.14, 0.13, 0.01, cel({ color: 0x8f7a5e, bands: 2, tint: 0x554e74 }), -0.07, 0.11, 0.085));
  g.add(box(0.12, 0.05, 0.01, flat({ color: 0xe8dcbc }), 0.08, 0.15, 0.085));
  for (const dx of [0.05, 0.13]) {
    g.add(cyl(0.024, 0.024, 0.02, 10, m.dark, dx, 0.06, 0.085).rotateX(Math.PI / 2));
  }
  const wh = cyl(0.006, 0.006, 0.34, 4, m.metal, 0.15, 0.34, -0.05);
  wh.rotation.z = -0.24;
  g.add(wh);
  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  return g;
}

/** Boxed light bulbs, stacked and one box open. */
function makeBulbBoxes(o = {}) {
  const m = mats();
  const rng = rngKit(o.seed ?? 21);
  const g = new THREE.Group();
  const cols = [0xdcd2b0, 0xc9bfa0, 0xe2dcc0];
  for (let i = 0; i < 4; i++) {
    const b = box(0.26, 0.14, 0.2, cel({ color: cols[i % 3], bands: 3, tint: 0x6f6790 }),
      rng.range(-0.03, 0.03), 0.07 + i * 0.14, rng.range(-0.03, 0.03));
    b.rotation.y = rng.range(-0.12, 0.12);
    b.castShadow = b.receiveShadow = true;
    g.add(b);
    g.add(box(0.2, 0.012, 0.14, cel({ color: 0x9c8f6e, bands: 2 }), b.position.x, 0.142 + i * 0.14, b.position.z));
  }
  // two bulbs out of the top box
  for (const dx of [-0.06, 0.05]) {
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6),
      flat({ color: 0xf2ecd8, transparent: true, opacity: 0.85, cache: false }));
    bulb.position.set(dx, 0.63, 0.04);
    g.add(bulb);
    g.add(cyl(0.017, 0.017, 0.03, 7, m.metal, dx, 0.6, 0.04));
  }
  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  return g;
}

/** A crate of second-hand LPs, sleeves standing up in it. */
function makeLpCrate(o = {}) {
  const m = mats();
  const rng = rngKit(o.seed ?? 31);
  const g = new THREE.Group();
  const W = 0.66, D = 0.38, H = 0.34, LEG = 0.42;
  // the trestle it stands on
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(box(0.05, LEG, 0.05, m.woodDark, sx * (W / 2 - 0.05), LEG / 2, sz * (D / 2 - 0.05)));
    }
  }
  g.add(box(W, 0.04, D, m.woodDark, 0, LEG, 0));
  // the crate: four sides and a base, open at the top
  for (const sz of [-1, 1]) {
    g.add(box(W, H, 0.035, m.wood, 0, LEG + H / 2, sz * (D / 2 - 0.018)));
  }
  for (const sx of [-1, 1]) {
    g.add(box(0.035, H, D, m.wood, sx * (W / 2 - 0.018), LEG + H / 2, 0));
  }
  g.add(box(W - 0.07, 0.03, D - 0.07, m.wood, 0, LEG + 0.02, 0));
  g.traverse((n) => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; } });
  // the sleeves, leaning back in a run -- the tilt is what makes them read
  const n = 9;
  for (let i = 0; i < n; i++) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(0.31, 0.31),
      flat({ color: 0xffffff, map: sleeveTex(rng.int(0, 3)), side: THREE.DoubleSide, cache: false }));
    s.position.set(0, LEG + 0.2, -D / 2 + 0.07 + i * ((D - 0.16) / (n - 1)));
    s.rotation.x = -0.3 + rng.range(-0.05, 0.05);
    s.castShadow = true;
    g.add(s);
  }
  // a hand-written divider card near the front
  {
    const c = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.34), flat({ color: 0xe8dcc0 }));
    c.position.set(0, LEG + 0.23, -D / 2 + 0.04);
    c.rotation.x = -0.3;
    g.add(c);
  }
  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  return g;
}

/** A glazed display case on legs, with three sleeves propped in it. */
function makeDisplayCase(o = {}) {
  const m = mats();
  const rng = rngKit(o.seed ?? 41);
  const g = new THREE.Group();
  g.name = 'openFrame';
  const W = 1.0, D = 0.44, H = 0.62, LEG = 0.5;
  const frame = cel({ color: 0x7a6a58, bands: 3, tint: 0x5c5680 });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(box(0.06, LEG, 0.06, frame, sx * (W / 2 - 0.06), LEG / 2, sz * (D / 2 - 0.06)));
    }
  }
  g.add(box(W, 0.05, D, frame, 0, LEG, 0));
  g.add(box(W, 0.06, D, frame, 0, LEG + H, 0));
  for (const sx of [-1, 1]) g.add(box(0.06, H, D, frame, sx * (W / 2 - 0.03), LEG + H / 2, 0));
  for (const sz of [-1, 1]) g.add(box(W, 0.05, 0.06, frame, 0, LEG + H - 0.03, sz * (D / 2 - 0.03)));
  g.traverse((n) => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; } });
  // the back panel, the glass, and one highlight
  g.add(box(W - 0.1, H - 0.1, 0.03, cel({ color: 0xcfc2a8, bands: 3, tint: 0x6f6790 }), 0, LEG + H / 2, -D / 2 + 0.03));
  const pane = box(W - 0.1, H - 0.12, 0.02,
    flat({ color: 0xdfeaf2, transparent: true, opacity: 0.32, depthWrite: false, cache: false }),
    0, LEG + H / 2, D / 2 - 0.03);
  pane.userData.noOutline = true;
  pane.userData.noShadow = true;
  g.add(pane);
  const hi = new THREE.Mesh(new THREE.PlaneGeometry(0.2, H),
    flat({ color: 0xf6fbff, transparent: true, opacity: 0.2, depthWrite: false, cache: false }));
  hi.position.set(-0.2, LEG + H / 2, D / 2 - 0.015);
  hi.rotation.z = 0.3;
  hi.userData.noOutline = true;
  g.add(hi);
  // three sleeves on a rail, leaning back
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.28),
      flat({ color: 0xffffff, map: sleeveTex(i + 1), cache: false }));
    s.position.set(-0.3 + i * 0.3, LEG + 0.22, -0.02);
    s.rotation.x = -0.26;
    g.add(s);
  }
  g.add(box(W - 0.16, 0.03, 0.03, frame, 0, LEG + 0.08, 0.06));
  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  const ctx = o.ctx;
  if (ctx && o.x != null && o.z != null) {
    const y = o.y ?? 0;
    const ry = o.ry ?? 0;
    const ca = Math.cos(ry);
    const sa = Math.sin(ry);
    const put = (lx, lz, hw, hd, top, bot) => {
      const px = o.x + ca * lx - sa * lz;
      const pz = o.z + sa * lx + ca * lz;
      const hx = Math.abs(ca) * hw + Math.abs(sa) * hd;
      const hz = Math.abs(sa) * hw + Math.abs(ca) * hd;
      ctx.collide(px - hx, pz - hz, px + hx, pz + hz, y + top, y + bot, true);
    };
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        put(sx * (W / 2 - 0.06), sz * (D / 2 - 0.06), 0.04, 0.04, LEG, 0);
      }
    }
    put(0, 0, W / 2, D / 2, LEG + H + 0.06, LEG);
  }
  return g;
}

/** A small A-frame blackboard, chalked. */
function makeChalkBoard(o = {}) {
  const m = mats();
  const g = new THREE.Group();
  const art = chalkNotice(o.variant ?? 0);
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.62, 0.05),
    [m.wood, m.wood, m.wood, m.wood, flat({ color: 0xffffff, map: art, cache: false }), m.wood]
  );
  board.position.set(0, 0.56, 0);
  board.rotation.x = -0.18;
  board.castShadow = true;
  g.add(board);
  hullOutline(board, { thickness: 0.003 });
  for (const s of [-1, 1]) {
    const leg = box(0.05, 0.72, 0.05, m.wood, s * 0.2, 0.36, -0.13);
    leg.rotation.x = 0.22;
    leg.castShadow = true;
    g.add(leg);
  }
  g.add(box(0.42, 0.04, 0.04, m.wood, 0, 0.24, -0.1));
  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  return g;
}
