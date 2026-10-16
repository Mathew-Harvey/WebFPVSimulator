/*
 * windmill.js: a windmill whose sails turn, and the solids that turn with
 * them.
 *
 * The owner asked for "windmill with rotating blades" on 16 October 2026,
 * without messing up the current game. So it is a new piece on a map's
 * palette, under Industrial beside the wind turbine, and nothing that is
 * already on a map changes: a map with no windmill takes none of the paths
 * below.
 *
 * WHAT STANDS STILL is a tower mill: a tapering round tower, white, with a
 * door and windows, a dark cap on top, the windshaft out of the cap's front
 * and the hub on its nose. Capsules, like the turbine's, in the parts
 * (./parts.js), so it is drawn and solid in one line.
 *
 * WHAT TURNS is four sails on two stocks crossing at the hub: a canvas sail
 * on a red lattice on the trailing side of each stock and a narrow leading
 * board on the other, turning anticlockwise as you face them, as a Dutch
 * mill's do. They are not parts, because a part is fixed for the life of
 * the map. The drawing is a group of its own that the map turns
 * (PropKit.turning in ./kit.js, mountTurning in src/maps/built/index.js),
 * and the solids are seated in the physics every step, as the town's train
 * is (sailsOf, below).
 *
 * THE ANGLE IS A PURE FUNCTION OF THE STEP COUNT (rotorAngle). The physics
 * runs at 1 kHz and the shell counts its steps; the sails stand at the same
 * angle at the same step in every engine, at every frame rate, and a
 * recorded input stream meets the same sails wherever it is flown. Drawn
 * and solid read the same function, so the sail a pilot sees is the sail a
 * pilot hits (src/maps/README.md, updateAnim).
 *
 * WHY THE SAILS ARE BOXES NEAR THE CRAFT. The module (src/native/world.c)
 * holds boxes that do not turn and capsules that do not move, and its
 * movers are axis aligned boxes with a surface velocity, set by the shell
 * every step: that is how the train is solid. A sail is a long flat
 * rectangle turning in a vertical plane, which no axis aligned box fits:
 * one box round a sail at 45 degrees is mostly air, and a staircase of
 * boxes along the whole sail that kept within a few centimetres of it would
 * be a hundred boxes a windmill. Teaching the module boxes that turn is a
 * change to its ABI and the owner's call (CLAUDE.md, and FREESTYLE-MAPS-PLAN
 * left it open when the turbine was parked), so this does not.
 *
 * Only the part of a sail the craft can touch in the next millisecond
 * matters. So every step, sailsOf takes the WINDOW, a square WINDOW metres
 * either side of the craft in the plane the sails turn in, cuts it into
 * strips STRIP wide on a grid fixed to the hub, and for each strip a sail
 * crosses seats one box: the strip's width, the sail's extent along the
 * strip's middle line, and the sail's thickness along the axis. Strips run
 * across whichever way a sail is nearer level, so an edge never slopes more
 * than one in one across a strip, and the box is within STRIP / 2 of the
 * drawn edge at worst, 7.5 cm, and on it where the sail is square to the
 * grid. The grid is the hub's and not the craft's, so a craft sliding along
 * a sail meets an edge that stays put, and the edge moves only as the sail
 * does. A craft outside a windmill's reach costs one distance test a step.
 *
 * The window is 0.5 m and the five inch's whole reach (props, lens and
 * hull) is 0.23 m from its CG (reach in src/native/world.c), so what the
 * window leaves out is more than a quarter of a metre from anything the
 * craft can touch: at 270 m/s, a step's flight. A box is seated with the
 * sail's own velocity at its middle, which the contact reads for friction
 * and restitution, as it reads the train's.
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

import { Parts } from './parts.js';
import { coneChain } from './industrial.js';
import { quarterSinCos, quarterTurns, sincos } from './trig.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);

/* The colours only a windmill uses. */
export const MATERIALS = {
  /* the cap, tarred boarding */
  millCap: { c: 0x5d4f4a, tint: 0x463f55 },
  /* the sails: a red lattice and a cream canvas. The lattice casts no
   * shadow of its own, the canvas over it casts the sail's, so a rotor is
   * one draw in the shadow pass and not two. */
  sailFrame: { c: 0xa2473a, tint: 0x6a4060, noCast: true },
  sailCloth: { c: 0xf0e4c8, tint: 0x8a7f9c },
  /* the door, Dutch green */
  millDoor: { c: 0x3e6a56, tint: 0x3f4d60 },
};

/*
 * THE SIZES.
 *
 *   FOOT       the lowest a sail's corner comes to the windmill's base, m
 *   SAIL_GAP   the clear between the sails and the tower behind them, over
 *              the gap rule's 1.4 m (GAP_MIN in ./parts.js), so the line
 *              between the sails and the tower is a line
 *   SLAB       the sails' thickness along the axis, the stock's and the
 *              lattice's and the canvas's together, m
 *   STOCK      the stock's square section, m
 *   LEAD       the leading board's width, m
 *   HUB_R      the hub's radius, m
 */
const FOOT = 2.0;
const SAIL_GAP = 1.5;
const SLAB = 0.4;
const STOCK = 0.3;
const LEAD = 0.25;
const HUB_R = 0.45;

/* The window and the strip, m, and the most boxes the sails may take at
 * once, from the top of the module's 64 mover slots down. See the header. */
export const WINDOW = 0.5;
export const STRIP = 0.15;
export const SAIL_SLOTS = 32;
/* The doubles sailsOf writes a box as: centre, half extents and velocity,
 * Three.js world metres and metres a second, which is setMover's order. */
export const SAIL_BOX_DOUBLES = 9;

/* The mover slots a document's sails take: SAIL_SLOTS with a windmill on
 * it, none without. src/maps/built/traffic.js keeps its cars below them. */
export function sailSlotsFor(doc) {
  const els = doc && Array.isArray(doc.elements) ? doc.elements : [];
  return els.some((e) => e && e.type === 'windmill') ? SAIL_SLOTS : 0;
}

/*
 * The windmill, worked out from its element. Pure arithmetic, so the tower
 * and the sails are where they are in every engine.
 *
 *   H      the hub's height, the windshaft's middle, over the base
 *   R      a sail's length, the hub's middle to its tip, held to what H
 *          leaves it: its far corner comes no lower than FOOT
 *   reach  the furthest any sail reaches from the axis: its trailing tip
 *   rpm    turns a minute; 0 holds the sails still where `spin` puts them
 *   spin   where the sails stand at step 0, a fraction of a quarter turn,
 *          which is all a four sail rotor has
 *   rb, rt, top   the tower's radius at its foot and its top, and its height
 *   capR   the cap's radius
 *   xb     how far ahead of the tower's axis the sails turn
 *   r0     where the canvas starts along a sail
 *   wl     the canvas's width, on the trailing side of the stock
 *   vLo, vHi   a sail's extent across, trailing side negative
 */
export function windmillShape(el) {
  const d = (el && el.dims) || {};
  const H = clamp(num(d.height, 14), 8, 30);
  const wanted = clamp(num(d.sail, 10), 4, 16);
  const rpm = clamp(num(d.speed, 12), 0, 30);
  const spin = clamp(num(d.spin, 0), 0, 1);
  const width = (r) => clamp(0.19 * r, 0.9, 3.0);
  /* A sail's far corner is sqrt(R^2 + w^2) from the axis, w its trailing
   * width, and has to stay FOOT over the ground. The width falls with the
   * length, so the length that fits with the wanted length's width fits
   * with its own. */
  const room = H - FOOT;
  let R = Math.min(wanted, room);
  const w0 = STOCK / 2 + width(R);
  if (R * R + w0 * w0 > room * room) {
    R = Math.sqrt(room * room - w0 * w0);
  }
  const wl = width(R);
  const vLo = -STOCK / 2 - wl;
  const vHi = STOCK / 2 + LEAD;
  const reach = Math.sqrt(R * R + vLo * vLo);
  const rb = clamp(0.17 * H + 0.5, 1.8, 5.5);
  const rt = 0.62 * rb;
  const capR = 0.82 * rt;
  const top = H - 0.45 * capR;
  /* The tower is widest at its foot, so the widest it is behind the sails
   * is at the lowest a sail comes. */
  const low = Math.max(0, H - reach);
  const rLow = rb + ((rt - rb) * low) / top;
  const xb = Math.max(rLow + SAIL_GAP, 0.5 * rt + capR + 0.6) + SLAB / 2;
  const r0 = Math.max(0.2 * R, HUB_R + 0.9);
  return { H, R, reach, rpm, spin, rb, rt, capR, top, xb, r0, wl, vLo, vHi };
}

/* The tower's radius at height y. */
function towerR(s, y) {
  return s.rb + ((s.rt - s.rb) * y) / s.top;
}

/*
 * WHERE THE SAILS STAND at `step` of the lap clock, radians anticlockwise
 * as you face them, in [0, pi/2): the first sail's angle from the right,
 * the others a quarter turn on from it each. Plus, times, a divide and a
 * floor, so the same step is the same angle everywhere; the angle is taken
 * as a fraction of a quarter turn first, so a long run never hands the sine
 * a large number. Read by the physics (sailsOf) and the drawing alike.
 */
export function rotorAngle(s, step) {
  const t = s.spin + (s.rpm * step) / 15000;
  return (t - Math.floor(t)) * (Math.PI / 2);
}

/* The sails' turning rate, rad/s, anticlockwise as you face them. */
export function rotorRate(s) {
  return (s.rpm * 2 * Math.PI) / 60;
}

/* ------------------------------------------------------------------ *
 * WHAT STANDS STILL.
 * ------------------------------------------------------------------ */

export function windmillLayout(el) {
  const s = windmillShape(el);
  const P = new Parts();
  /* The tower, a cone of capsules each inside the drawn cone (./industrial.js). */
  coneChain(P, 'wallWhite', 'tower', [0, 0, 0], [0, s.top, 0], s.rb, s.rt, 0.05);
  /* The cap, drawn and solid as the one capsule it is, along the axis. */
  P.cap('millCap', [-0.5 * s.rt, s.H, 0], [0.5 * s.rt, s.H, 0], s.capR, { look: 'capsule', seg: 16, name: 'cap', kind: 'wall' });
  /* The windshaft out of its front, and the hub on its nose: round about
   * the axis, so they stand still while the stocks turn through them. */
  P.cap('metalDark', [0.5 * s.rt, s.H, 0], [s.xb - 0.12, s.H, 0], 0.26, { seg: 10, name: 'windshaft', kind: 'pole' });
  P.cap('metalDark', [s.xb - 0.12, s.H, 0], [s.xb + 0.12, s.H, 0], HUB_R, { look: 'capsule', seg: 14, name: 'hub', kind: 'wall' });
  /* Where the sails sweep, for the plan and the pick box: neither drawn nor
   * solid, since the sails are neither here (./parts.js, sweep). */
  P.box('sailCloth', s.xb - SLAB / 2, s.H - s.reach, -s.reach, s.xb + SLAB / 2, s.H + s.reach, s.reach,
    { solid: false, draw: false, sweep: true, name: 'sails' });
  return P.list;
}

/* A box laid on the tower's face at angle a (from +x toward +z, as
 * ./parts.js `around` counts) and height y: w wide round the tower, h tall,
 * standing `out` proud of the face. Render only. */
const GEO = new Map();
function onTower(K, mat, s, a, y, w, h, out) {
  const T = K.THREE;
  let box = GEO.get('box');
  if (!box) {
    box = new T.BoxGeometry(1, 1, 1);
    GEO.set('box', box);
  }
  const r = towerR(s, y) + out / 2 - 0.02;
  const m = new T.Matrix4().makeRotationY(-a)
    .scale(new T.Vector3(out + 0.04, h, w))
    .setPosition(r * Math.cos(a), y, r * Math.sin(a));
  K.add(mat, box, m);
}

export function windmillDraw(el, parts, K) {
  const s = windmillShape(el);
  K.cyl('wallWhite', [0, 0, 0], [0, s.top, 0], s.rb, 28, s.rt);
  /* A tarred plinth and a trim band under the cap, each a few centimetres
   * proud of the white: paint, not a ledge. */
  K.cyl('concreteDark', [0, 0, 0], [0, 0.55, 0], s.rb + 0.03, 28, towerR(s, 0.55) + 0.03);
  K.rim('trim', s.top - 0.35, towerR(s, s.top - 0.35) + 0.02, 0.07, 32);
  /* The door, at the back, out of the sails' way, and its frame. */
  onTower(K, 'trim', s, Math.PI, 1.15, 1.25, 2.4, 0.05);
  onTower(K, 'millDoor', s, Math.PI, 1.1, 1.0, 2.15, 0.08);
  /* Windows round and up the tower, each a dark pane in a white frame. */
  const wins = [[0.4, 0.3], [-Math.PI / 2, 0.42], [Math.PI / 2, 0.55], [Math.PI, 0.66], [0.25, 0.78]];
  for (const [a, f] of wins) {
    const y = f * s.top;
    if (y < 3 || y > s.top - 1.2) {
      continue;
    }
    onTower(K, 'trim', s, a, y, 0.78, 1.05, 0.05);
    onTower(K, 'glassDark', s, a, y, 0.56, 0.82, 0.07);
  }
  /* The sails, turning about the axis through the hub. */
  K.turning([s.xb, s.H, 0], rotorAngle(s, 0), (R) => drawRotor(s, R), s);
}

/* ------------------------------------------------------------------ *
 * WHAT TURNS, drawn in the rotor's own frame: the hub's middle at the
 * origin, +x the axis toward the front, y up, and a sail at angle a lying
 * along (h, y) = (cos a, sin a) where h = -z is the right of somebody
 * facing the sails. At the four quarter turns every sail is square to the
 * frame, so the whole rotor is axis aligned boxes, and the map turns it.
 * ------------------------------------------------------------------ */

const SC = { s: 0, c: 1 };

/* A box in a sail's own (u along, v across, x along the axis) at quarter
 * turn q. */
function sailBox(K, mat, q, u0, u1, v0, v1, x0, x1) {
  quarterSinCos(q, SC);
  const ya = u0 * SC.s + v0 * SC.c;
  const yb = u1 * SC.s + v1 * SC.c;
  const za = -(u0 * SC.c - v0 * SC.s);
  const zb = -(u1 * SC.c - v1 * SC.s);
  K.box(mat, x0, Math.min(ya, yb), Math.min(za, zb), x1, Math.max(ya, yb), Math.max(za, zb));
}

function drawRotor(s, K) {
  const half = SLAB / 2;
  const sw = STOCK / 2;
  /* Bars across the canvas, as many as keep them about 0.6 m apart. */
  const span = s.R - s.r0;
  const bars = Math.max(3, Math.round(span / 0.6));
  for (let q = 0; q < 4; q += 1) {
    /* The stock, hub to tip, the full depth of the slab's middle. */
    sailBox(K, 'sailFrame', q, 0, s.R, -sw, sw, -sw, sw);
    /* The leading board, on the leading side, flush with the stock's back. */
    sailBox(K, 'sailFrame', q, s.r0, s.R, sw, s.vHi, -sw, -sw + 0.06);
    /* The lattice behind the canvas: the hemlath along the trailing edge,
     * two laths between it and the stock, and the bars across. */
    sailBox(K, 'sailFrame', q, s.r0, s.R, s.vLo, s.vLo + 0.09, -half, half - 0.08);
    for (const f of [1 / 3, 2 / 3]) {
      const v = -sw + (s.vLo + sw) * f;
      sailBox(K, 'sailFrame', q, s.r0, s.R, v - 0.03, v + 0.03, -half, -0.04);
    }
    for (let i = 0; i <= bars; i += 1) {
      const u = s.r0 + (span * i) / bars;
      const a = i === 0 ? u : (i === bars ? u - 0.07 : u - 0.035);
      sailBox(K, 'sailFrame', q, a, a + 0.07, s.vLo, s.vHi, -half, -0.04);
    }
    /* The canvas, spread on the lattice's front, between the bars at either end. */
    sailBox(K, 'sailCloth', q, s.r0 + 0.07, s.R - 0.07, s.vLo + 0.09, -sw, -0.04, -0.01);
  }
  /* No poll end of its own: the static hub (HUB_R) is round about the axis
   * and covers where the stocks cross, so the rotor is two materials, two
   * draws, and one in the shadow pass. */
}

/* ------------------------------------------------------------------ *
 * THE SOLID SAILS, for the shell. See the header.
 * ------------------------------------------------------------------ */

/*
 * A sail is two rectangles in its own (u along, v across): the stock from
 * the hub out to where the canvas starts, and the canvas with the stock and
 * the leading board beside it from there to the tip. Listed once; every
 * sail is the same.
 */
function rectsOf(s) {
  const sw = STOCK / 2;
  return [
    [0, s.r0, -sw, sw],
    [s.r0, s.R, s.vLo, s.vHi],
  ];
}

/*
 * Whether an axis aligned box [x0, y0, z0, x1, y1, z1], Three.js world
 * metres, reaches into the disc a windmill's sails turn through: the slab
 * along its axis, within the sails' reach of the hub. `m` is one of
 * sailsOf's mills, whose heading is a whole quarter, so the axis is along
 * world x or world z. The builder's warning reads it (fs-sails in
 * src/trackbuilder/warnings.js), because nothing else would: the sails are
 * not solids, so the overlap test never meets them.
 */
export function sweepTouches(m, b) {
  const alongX = m.c !== 0;
  const a0 = alongX ? b[0] : b[2];
  const a1 = alongX ? b[3] : b[5];
  const ac = alongX ? m.X : m.Z;
  if (a1 < ac - SLAB / 2 || a0 > ac + SLAB / 2) {
    return false;
  }
  const h0 = alongX ? b[2] : b[0];
  const h1 = alongX ? b[5] : b[3];
  const hc = alongX ? m.Z : m.X;
  const dh = hc < h0 ? h0 - hc : (hc > h1 ? hc - h1 : 0);
  const dy = m.Y < b[1] ? b[1] - m.Y : (m.Y > b[4] ? m.Y - b[4] : 0);
  return dh * dh + dy * dy < m.shape.reach * m.shape.reach;
}

/*
 * Where lo <= a + b t <= hi, as [t0, t1] in `out`, or false when nowhere.
 */
function span(a, b, lo, hi, out) {
  if (b > 0) {
    out[0] = (lo - a) / b;
    out[1] = (hi - a) / b;
    return true;
  }
  if (b < 0) {
    out[0] = (hi - a) / b;
    out[1] = (lo - a) / b;
    return true;
  }
  if (a >= lo && a <= hi) {
    out[0] = -Infinity;
    out[1] = Infinity;
    return true;
  }
  return false;
}

/*
 * The sails of every windmill a placed document holds, as the shell seats
 * them in the physics, or null when it holds none. `placed` is
 * src/maps/built/place.js placeDocument's answer, and each windmill's
 * world place is worked out here once, with a quarter turn's exact sine.
 *
 *   slots            SAIL_SLOTS, the mover slots the sails take
 *   doubles          SAIL_BOX_DOUBLES, what seat() writes a box as
 *   base             the first of them: MOVER_SLOTS - SAIL_SLOTS
 *   seat(step, x, y, z, out)
 *                    the boxes the sails need at `step` of the lap clock
 *                    for a craft at (x, y, z), Three.js world metres, into
 *                    `out` (a Float64Array of SAIL_SLOTS * SAIL_BOX_DOUBLES)
 *                    as setMover takes them; returns how many. Allocates
 *                    nothing: it runs every millisecond of a flight.
 *   gapAt(x, y, z, reach, step)
 *                    how far (x, y, z) is from the nearest sail as drawn at
 *                    `step`, or `reach` when further: the lens's near plane
 *                    (fpvNear in src/main.js). Render only.
 *   mills            per windmill { el, shape, X, Y, Z, s, c } (the hub in
 *                    the world, the heading's sine and cosine)
 */
export function sailsOf(placed, moverSlots) {
  const mills = [];
  for (const it of placed.items) {
    if (it.el.type !== 'windmill') {
      continue;
    }
    const shape = windmillShape(it.el);
    const sc = quarterSinCos(quarterTurns(it.yaw), { s: 0, c: 1 });
    mills.push({
      el: it.el,
      shape,
      rects: rectsOf(shape),
      rate: rotorRate(shape),
      /* The hub: the element's frame point (xb, H, 0), turned as
       * Object3D.rotation.y turns it (turnY in ./trig.js). */
      X: it.x + shape.xb * sc.c,
      Y: it.y + shape.H,
      Z: it.z - shape.xb * sc.s,
      s: sc.s,
      c: sc.c,
    });
  }
  if (!mills.length) {
    return null;
  }
  const base = moverSlots - SAIL_SLOTS;
  const T = [0, 0];
  const SN = { s: 0, c: 1 };
  /* The sails' (cos, sin), the first from the angle and each next one a
   * quarter turn on: exact. */
  const cs = new Float64Array(8);

  function aim(m, step) {
    sincos(rotorAngle(m.shape, step), SN);
    cs[0] = SN.c;
    cs[1] = SN.s;
    cs[2] = -SN.s;
    cs[3] = SN.c;
    cs[4] = -SN.c;
    cs[5] = -SN.s;
    cs[6] = SN.s;
    cs[7] = -SN.c;
  }

  /*
   * One box into out at slot k, from its extent in the rotor's frame (h
   * across to the right as you face the sails, y up, both from the hub;
   * along the axis it is the slab), with the sail's velocity at its middle.
   */
  function put(m, out, k, h0, h1, y0, y1) {
    const o = k * SAIL_BOX_DOUBLES;
    const hc = 0.5 * (h0 + h1);
    const yc = 0.5 * (y0 + y1);
    /* In the element's frame: x along the axis (the slab's middle is the
     * hub), y up, z = -h. Then turned by the quarter heading: a swap of x
     * and z and their signs, exact. */
    const zc = -hc;
    const hx = SLAB / 2;
    const hz = 0.5 * (h1 - h0);
    out[o] = m.X + zc * m.s;
    out[o + 1] = m.Y + yc;
    out[o + 2] = m.Z + zc * m.c;
    out[o + 3] = m.c !== 0 ? hx : hz;
    out[o + 4] = 0.5 * (y1 - y0);
    out[o + 5] = m.c !== 0 ? hz : hx;
    /* Anticlockwise as you face them: (dh, dy) = rate * (-y, h); z = -h. */
    const vz = m.rate * yc;
    out[o + 6] = vz * m.s;
    out[o + 7] = m.rate * hc;
    out[o + 8] = vz * m.c;
  }

  function seat(step, x, y, z, out) {
    let n = 0;
    /* The union of what did not fit, kept as one more box at the last
     * slot: a bigger solid where the sails crowd round the craft, rather
     * than a sail it passes through. */
    let spill = false;
    let sh0 = 0;
    let sh1 = 0;
    let sy0 = 0;
    let sy1 = 0;
    let spillMill = null;
    for (const m of mills) {
      /* The craft in the windmill's frame: q along the axis from the sails'
       * middle, h across, y up, from the hub. The heading's inverse turn. */
      const dx = x - m.X;
      const dz = z - m.Z;
      const lx = dx * m.c - dz * m.s;
      const lz = dx * m.s + dz * m.c;
      if (lx > SLAB / 2 + WINDOW || lx < -SLAB / 2 - WINDOW) {
        continue;
      }
      const ch = -lz;
      const cy = y - m.Y;
      const far = m.shape.reach + WINDOW;
      if (ch * ch + cy * cy > far * far) {
        continue;
      }
      aim(m, step);
      const wh0 = ch - WINDOW;
      const wh1 = ch + WINDOW;
      const wy0 = cy - WINDOW;
      const wy1 = cy + WINDOW;
      for (let q = 0; q < 4; q += 1) {
        const c = cs[2 * q];
        const sn = cs[2 * q + 1];
        /* Strips across whichever way the sail is nearer level. */
        const upright = (sn < 0 ? -sn : sn) > (c < 0 ? -c : c);
        const a0 = upright ? wy0 : wh0;
        const a1 = upright ? wy1 : wh1;
        const k0 = Math.floor(a0 / STRIP);
        const k1 = Math.floor(a1 / STRIP);
        for (const r of m.rects) {
          for (let k = k0; k <= k1; k += 1) {
            const mid = (k + 0.5) * STRIP;
            let t0;
            let t1;
            if (upright) {
              /* The strip's middle line y = mid: u = mid s + c h, v = mid c - s h. */
              if (!span(mid * sn, c, r[0], r[1], T)) {
                continue;
              }
              t0 = T[0];
              t1 = T[1];
              if (!span(mid * c, -sn, r[2], r[3], T)) {
                continue;
              }
            } else {
              /* The middle line h = mid: u = mid c + s y, v = -mid s + c y. */
              if (!span(mid * c, sn, r[0], r[1], T)) {
                continue;
              }
              t0 = T[0];
              t1 = T[1];
              if (!span(-mid * sn, c, r[2], r[3], T)) {
                continue;
              }
            }
            if (T[0] > t0) {
              t0 = T[0];
            }
            if (T[1] < t1) {
              t1 = T[1];
            }
            const w0 = upright ? wh0 : wy0;
            const w1 = upright ? wh1 : wy1;
            if (t0 < w0) {
              t0 = w0;
            }
            if (t1 > w1) {
              t1 = w1;
            }
            if (!(t1 > t0)) {
              continue;
            }
            const s0 = k * STRIP;
            const s1 = s0 + STRIP;
            const h0 = upright ? t0 : s0;
            const h1 = upright ? t1 : s1;
            const y0 = upright ? s0 : t0;
            const y1 = upright ? s1 : t1;
            if (n < SAIL_SLOTS - 1) {
              put(m, out, n, h0, h1, y0, y1);
              n += 1;
            } else if (!spill || spillMill !== m) {
              /* A second windmill's spill would make one box of two
               * windmills: it takes the first's place only if it is
               * nearer, which it cannot be told here, so the first stays. */
              if (!spill) {
                spill = true;
                spillMill = m;
                sh0 = h0;
                sh1 = h1;
                sy0 = y0;
                sy1 = y1;
              }
            } else {
              sh0 = h0 < sh0 ? h0 : sh0;
              sh1 = h1 > sh1 ? h1 : sh1;
              sy0 = y0 < sy0 ? y0 : sy0;
              sy1 = y1 > sy1 ? y1 : sy1;
            }
          }
        }
      }
    }
    if (spill) {
      put(spillMill, out, n, sh0, sh1, sy0, sy1);
      n += 1;
    }
    return n;
  }

  /* The distance from a point to a sail as drawn, for the lens's near plane. */
  function gapAt(x, y, z, reach, step) {
    let best = reach;
    for (const m of mills) {
      const dx = x - m.X;
      const dz = z - m.Z;
      const lx = dx * m.c - dz * m.s;
      const lz = dx * m.s + dz * m.c;
      const out = (lx < 0 ? -lx : lx) - SLAB / 2;
      const dq = out > 0 ? out : 0;
      if (dq >= best) {
        continue;
      }
      const ch = -lz;
      const cy = y - m.Y;
      const far = m.shape.reach + best;
      if (ch * ch + cy * cy > far * far) {
        continue;
      }
      aim(m, step);
      for (let q = 0; q < 4; q += 1) {
        const c = cs[2 * q];
        const sn = cs[2 * q + 1];
        const u = ch * c + cy * sn;
        const v = -ch * sn + cy * c;
        for (const r of m.rects) {
          const du = u < r[0] ? r[0] - u : (u > r[1] ? u - r[1] : 0);
          const dv = v < r[2] ? r[2] - v : (v > r[3] ? v - r[3] : 0);
          const d = Math.sqrt(du * du + dv * dv + dq * dq);
          if (d < best) {
            best = d;
          }
        }
      }
    }
    return best;
  }

  return { slots: SAIL_SLOTS, doubles: SAIL_BOX_DOUBLES, base, mills, seat, gapAt };
}
