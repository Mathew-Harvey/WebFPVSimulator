import * as THREE from 'three';
import { PAL } from '../core/palette.js';
import { cel, flat } from '../core/toon.js';
import { bridgeSign, bridgeAd, warningPlate } from '../core/textures.js';
import { box, cyl, bake, trs, rngKit } from '../core/util.js';
import { hullOutline } from '../core/outline.js';
import { groundY, TRACK_HALF } from './street.js';
import { pad, lane, meshFence, groundMats } from './ground.js';
import { makeSignPost, makeBins } from './props.js';

/* ------------------------------------------------------------------ *
 * 跨線橋 -- the pedestrian overbridge.
 *
 * The district had no vertical viewpoint at all: everything was seen from
 * eye height on flat ground, and the railway -- the thing the whole place is
 * organised around -- could only ever be looked at from beside it.  From
 * 7.2 m up you look *down* the track: the platform and its canopy in the
 * middle distance, the level crossing beyond it, the lineside cherries in
 * plan, the shop roofs to the north, and the train passing underneath.
 *
 * Three things fix the geometry, and all three are worth knowing before
 * moving anything.
 *
 *  - **The deck height is set by the catenary, not by taste.**  The messenger
 *    wire runs at 5.95 m and the contact wire at 4.88 (`railway.js`), so the
 *    soffit has to clear 5.95 with something to spare.  Deck at 7.20, slab
 *    0.28, girders 0.60 deep -> the lowest steel is at 6.32, which is 0.37
 *    over the messenger.  That is what makes this a 40-riser climb; a shorter
 *    bridge would be a bridge through the wires.
 *
 *  - **`heightAt` is single-valued**, so no two walkable levels can share a
 *    footprint.  That rules out the compact form where a flight doubles back
 *    directly over the one below it: the player standing underneath would be
 *    lifted onto the flight above.  Both towers are therefore *quarter*-turns
 *    -- flight, corner landing, flight at ninety degrees -- which never
 *    overlap in plan.  Everything that *is* overhead (the deck ends, the head
 *    landings, the upper flights) has its undercroft closed off with a
 *    collider, which is also what a real stair tower does.
 *
 *  - **x = 41 is the only place both banks are clear.**  The near side is
 *    boxed in by 青空商店 (to x = 12), a house at x 15.8-24.2 and another at
 *    26.6-34.4; the far side by the platform (x 15.4-38.1) and the row of
 *    background houses at z -9 to -19.  East of the platform both banks open
 *    out at once, and it is still inside the 51 m ground horizon from deck
 *    eye height, so the crossing reads.
 * ------------------------------------------------------------------ */

/* ------------------------------ dimensions ------------------------------ */
const DECK_Y = 7.20;          // walking surface
const SLAB = 0.28;            // deck slab
const GIRDER = 0.60;          // side girder depth below the slab
const DECK_W = 2.30;          // overall deck width; 1.90 clear between rails
const HEAD_W = 2.60;          // the head landings widen slightly
const RISE = 0.18;            // 40 risers to 7.20 exactly
const GOING = 0.28;
const N_FLIGHT = 20;          // per flight, two flights per tower
const FLIGHT_W = 2.40;
const RAIL_H = 1.15;          // balustrade
const BAR_GAP = 0.11;         // vertical bar centres
const CANOPY_H = 2.55;        // clear height under the roof

const X_C = 41.00;                       // deck centre line
const XD0 = X_C - DECK_W / 2;            // 39.85
const XD1 = X_C + DECK_W / 2;            // 42.15
const Z_N = 4.40;                        // near end of the span
const Z_F = -5.40;                       // far end of the span

const M = {};
function mats() {
  if (M.steel) return M;
  /* Pale grey structure, blue-grey balustrades.  The two have to separate
   * tonally or the whole thing reads as one grey mass against a pale sky. */
  M.steel = cel({ color: 0xd0d5dd, bands: 3, tint: 0x6a6590 });
  M.steelDark = cel({ color: 0x9aa2ae, bands: 3, tint: 0x605a80 });
  M.rail = cel({ color: 0x8b9cb2, bands: 3, tint: 0x5c5a84 });
  M.railDark = cel({ color: 0x6d7c92, bands: 3, tint: 0x54527a });
  M.tread = cel({ color: 0xc4c8d0, bands: 3, tint: 0x6a6288 });
  M.nosing = cel({ color: 0xe6d9a8, bands: 2, tint: 0x8f7050 });
  M.concrete = cel({ color: PAL.concrete, bands: 3, tint: 0x6f6790 });
  M.concreteMid = cel({ color: PAL.concreteMid, bands: 3, tint: 0x6a6288 });
  /* The roof: a high-key translucent sheet.  `depthWrite: false` because the
   * ink pass reads the depth buffer and would otherwise outline every panel
   * joint into speckle, and no shadow because a transparent sheet casting a
   * hard shadow is what made the vending displays look muddy. */
  /* Tinted rather than clear.  A near-white sheet at low opacity is invisible
   * against a pale sky, which is exactly what the roof is seen against from
   * everywhere that matters -- it has to be a cool band you read *as* glazing,
   * not a hint of one. */
  M.canopy = flat({ color: 0x9db4c6, transparent: true, opacity: 0.6, depthWrite: false, cache: false });
  M.canopyRib = cel({ color: 0x9aa2ad, bands: 3, tint: 0x5a5678 });
  return M;
}

/* A rail box as wide as the capping (0.10), with a floor so it is a
 * parapet on the deck and not a wall from the tracks up. */
function railCollide(ctx, o) {
  const a = Math.min(o.from, o.to);
  const b = Math.max(o.from, o.to);
  const h = o.h ?? RAIL_H;
  const y = o.y;
  /* Half-width of the capping rail (0.10), not a 0.18 m wall the
   * bars do not fill. The stair throat is where a fatter box reads
   * as stuck-on-nothing. */
  const hw = 0.05;
  if (o.axis === 'z') {
    ctx.collide(o.at - hw, a, o.at + hw, b, y + h, y);
  } else {
    ctx.collide(a, o.at - hw, b, o.at + hw, y + h, y);
  }
}

/* ------------------------------------------------------------------ *
 * Balustrade: posts, a top rail, a mid rail and vertical infill.
 *
 * The bar spacing is the one dimension you cannot fudge.  At 0.11 m centres
 * it reads as a screen you can see the railway through; at 0.3 it reads as a
 * fence and the view is gone, and at 0.05 it aliases into a grey band.
 * ------------------------------------------------------------------ */
function balustrade(parts, o) {
  const { axis, at, from, to, y, h = RAIL_H } = o;
  const a = Math.min(from, to), b = Math.max(from, to);
  const len = b - a;
  const along = (t) => (axis === 'z' ? trs(at, 0, t) : trs(t, 0, at));
  const alongY = (t, yy) => (axis === 'z' ? trs(at, yy, t) : trs(t, yy, at));
  // newel posts about every 1.8 m, always one at each end
  const np = Math.max(1, Math.round(len / 1.8));
  for (let i = 0; i <= np; i++) {
    parts.rail.push({
      geometry: new THREE.BoxGeometry(axis === 'z' ? 0.07 : 0.07, h, 0.07),
      matrix: alongY(a + (len / np) * i, y + h / 2),
    });
  }
  // top rail (a flat capping), and the mid rail the bars are welded to
  parts.rail.push({
    geometry: new THREE.BoxGeometry(axis === 'z' ? 0.1 : len + 0.07, 0.06, axis === 'z' ? len + 0.07 : 0.1),
    matrix: alongY((a + b) / 2, y + h),
  });
  parts.railDark.push({
    geometry: new THREE.BoxGeometry(axis === 'z' ? 0.06 : len, 0.05, axis === 'z' ? len : 0.06),
    matrix: alongY((a + b) / 2, y + 0.13),
  });
  const nb = Math.max(2, Math.round(len / BAR_GAP));
  for (let i = 0; i <= nb; i++) {
    parts.railDark.push({
      geometry: new THREE.BoxGeometry(0.022, h - 0.19, 0.022),
      matrix: alongY(a + (len / nb) * i, y + 0.13 + (h - 0.19) / 2),
    });
  }
  if (o.ctx) {
    railCollide(o.ctx, { axis, at, from: a, to: b, y, h });
  }
}

/** Lineside equipment cabinet: a grey box on a plinth with a hinged lid. */
function cabinet(o) {
  const m = mats();
  const g = new THREE.Group();
  const w = o.w ?? 0.62, h = o.h ?? 0.95, d = o.d ?? 0.4;
  const body = box(w, h, d, cel({ color: PAL.cabinet, bands: 3, tint: 0x6f6890 }), 0, h / 2 + 0.06, 0);
  body.castShadow = body.receiveShadow = true;
  g.add(body);
  hullOutline(body, { thickness: 0.0034 });
  g.add(box(w + 0.16, 0.12, d + 0.16, m.concreteMid, 0, 0.06, 0));
  g.add(box(w + 0.06, 0.05, d + 0.07, cel({ color: PAL.cabinetTop, bands: 3, tint: 0x6a6288 }), 0, h + 0.1, 0));
  // the door line and the two latches, which is all that says it opens
  g.add(box(0.025, h - 0.18, 0.02, m.steelDark, 0, h / 2 + 0.06, d / 2 + 0.005));
  for (const s of [-1, 1]) {
    g.add(box(0.05, 0.09, 0.04, m.steelDark, s * (w / 2 - 0.09), h * 0.34, d / 2 + 0.02));
  }
  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  return g;
}

/* A raking balustrade, following a flight. */
function rakeBalustrade(parts, o) {
  const { axis, at, from, to, y0, dir, n } = o;
  const step = GOING * dir;
  for (let i = 0; i <= n; i++) {
    const t = from + step * i;
    const yy = y0 - RISE * i;
    if (i % 6 === 0 || i === n) {
      parts.rail.push({
        geometry: new THREE.BoxGeometry(0.07, RAIL_H, 0.07),
        matrix: axis === 'z' ? trs(at, yy + RAIL_H / 2, t) : trs(t, yy + RAIL_H / 2, at),
      });
    }
    parts.railDark.push({
      geometry: new THREE.BoxGeometry(0.022, RAIL_H - 0.16, 0.022),
      matrix: axis === 'z' ? trs(at, yy + 0.1 + (RAIL_H - 0.16) / 2, t) : trs(t, yy + 0.1 + (RAIL_H - 0.16) / 2, at),
    });
    if (i === n) continue;
    // the handrail and the bottom stringer rail, one short sloping piece per
    // step: a single long box would not follow the pitch
    const mid = t + step / 2;
    const midY = yy - RISE / 2;
    const pitch = Math.atan2(RISE, GOING) * (axis === 'z' ? dir : -dir);
    const segLen = Math.hypot(GOING, RISE) + 0.01;
    for (const [dy, key, thick] of [[RAIL_H, 'rail', 0.09], [0.1, 'railDark', 0.05]]) {
      parts[key].push({
        geometry: new THREE.BoxGeometry(axis === 'z' ? thick : segLen, thick === 0.09 ? 0.06 : 0.05, axis === 'z' ? segLen : thick),
        matrix: axis === 'z'
          ? trs(at, midY + dy, mid, pitch, 0, 0)
          : trs(mid, midY + dy, at, 0, 0, pitch),
      });
    }
  }
  /* One box per step, at that step's rail. A band of two is an AABB
   * that stands 0.36 m of air above the lower handrail; contact then
   * walks the craft into the next band and the pose glitches. */
  if (o.ctx) {
    const hw = 0.05;
    for (let i = 0; i < n; i++) {
      const t0 = from + step * i;
      const t1 = from + step * (i + 1);
      const a = Math.min(t0, t1);
      const b = Math.max(t0, t1);
      const yTread = y0 - RISE * (i + 1);
      const yLo = yTread;
      const yHi = yTread + RAIL_H;
      if (axis === 'z') {
        o.ctx.collide(at - hw, a, at + hw, b, yHi, yLo);
      } else {
        o.ctx.collide(a, at - hw, b, at + hw, yHi, yLo);
      }
    }
  }
}

/* ------------------------------------------------------------------ *
 * One flight of stairs.
 *
 * Closed risers on a pair of raking stringers -- a steel pan stair with a
 * concrete fill, which is what these are built from.  Every tread registers
 * a platform so a walker stays on the pans.  The fly colliders are the
 * stringers at the edges and a soffit under the pans: a box the width of
 * the flight on every going is taller than the going, so consecutive pans
 * overlap and a craft on the climb line hits the next pan in empty air.
 *
 * `axis` is the direction of travel, `dir` its sign, and the flight always
 * descends: `y0` is the level of the *top* landing.
 * ------------------------------------------------------------------ */
function flight(ctx, o) {
  const m = mats();
  const { axis, at, from, y0, dir, w = FLIGHT_W, n = N_FLIGHT } = o;
  const parts = { tread: [], nosing: [], steel: [], steelDark: [], rail: [], railDark: [] };
  const half = w / 2;

  for (let i = 0; i < n; i++) {
    const t = from + GOING * dir * (i + 0.5);
    const y = y0 - RISE * (i + 1);
    const put = (arr, geo, yy, tt) => arr.push({
      geometry: geo,
      matrix: axis === 'z' ? trs(at, yy, tt) : trs(tt, yy, at),
    });
    // the tread pan, and the riser plate that closes the step in front of it
    put(parts.tread, new THREE.BoxGeometry(axis === 'z' ? w : GOING, 0.055, axis === 'z' ? GOING : w), y + 0.028, t);
    put(parts.steelDark, new THREE.BoxGeometry(axis === 'z' ? w - 0.02 : 0.04, RISE - 0.05, axis === 'z' ? 0.04 : w - 0.02),
      y + RISE / 2 + 0.03, t + GOING * dir * 0.5);
    // the nosing strip: a warm line on each step, which is what separates
    // forty treads tonally when they are all the same concrete
    put(parts.nosing, new THREE.BoxGeometry(axis === 'z' ? w : 0.05, 0.02, axis === 'z' ? 0.05 : w),
      y + 0.066, t + GOING * dir * 0.42);

    /* Treads are registered 30 mm long at each end so consecutive ones -- and
     * the landings above and below -- overlap rather than meet.  `heightAt`
     * takes the max over platforms, so a few millimetres of gap between two
     * treads is a hole the player drops through. */
    const p0 = t - GOING / 2 - 0.03, p1 = t + GOING / 2 + 0.03;
    ctx.platform(axis === 'z'
      ? { x0: at - half, x1: at + half, z0: Math.min(p0, p1), z1: Math.max(p0, p1), top: y, solid: false }
      : { x0: Math.min(p0, p1), x1: Math.max(p0, p1), z0: at - half, z1: at + half, top: y, solid: false });
  }

  /* Stringers: one sloping plate each side, built as a sheared box.  A
   * rotated box leaves its ends cut square to the rake rather than plumb,
   * which at 33 degrees is a 0.1 m sliver nobody sees, and it costs two
   * triangles instead of an extruded profile. */
  const run = GOING * n;
  const drop = RISE * n;
  const slope = Math.atan2(drop, run);
  const slabLen = Math.hypot(run, drop);
  const midT = from + dir * run / 2;
  const midY = y0 - drop / 2 - 0.16;

  /* The rake, and it has to be derived rather than guessed.
   *
   * The flight always descends toward `dir`, so the far end of the underside
   * has to be the low one.  A box lying along Z rotated by t about X sends its
   * +z end down for t > 0, so a flight running toward +z wants +slope; a box
   * lying along X rotated by t about Z sends its +x end *up* for t > 0, so a
   * flight running toward +x wants -slope.  Both were inverted here, which
   * tilted every stringer, soffit and bicycle channel the wrong way while the
   * handrails -- which happen to compute the same thing correctly a few lines
   * down -- stayed right.  The result was a stair whose underside climbed away
   * from the treads it was supposed to be carrying.
   *
   * `rakeBalustrade` uses exactly this expression; keep the two in step. */
  const rake = axis === 'z' ? slope * dir : -slope * dir;
  const rakeAt = (t, yy, cross) => (axis === 'z'
    ? trs(cross, yy, t, rake, 0, 0)
    : trs(t, yy, cross, 0, 0, rake));

  for (const s of [-1, 1]) {
    const off = s * (half - 0.05);
    parts.steel.push({
      geometry: new THREE.BoxGeometry(axis === 'z' ? 0.1 : slabLen, 0.42, axis === 'z' ? slabLen : 0.1),
      matrix: rakeAt(midT, midY, at + off),
    });
  }
  // soffit plate, so the underside of the stair is a surface and not a comb
  parts.steel.push({
    geometry: new THREE.BoxGeometry(axis === 'z' ? w - 0.16 : slabLen, 0.06, axis === 'z' ? slabLen : w - 0.16),
    matrix: rakeAt(midT, midY + 0.02, at),
  });

  /* 自転車スロープ -- the push channel.  A 0.34 m ramp beside the steps with a
   * raised kerb, so a bicycle can be walked up without being carried.  Real
   * ones are a pair of narrow rails; at this scale one channel reads and two
   * disappear. */
  {
    const off = (o.ramp ?? 1) * (half - 0.19);
    parts.tread.push({
      geometry: new THREE.BoxGeometry(axis === 'z' ? 0.34 : slabLen, 0.07, axis === 'z' ? slabLen : 0.34),
      matrix: rakeAt(midT, midY + 0.28, at + off),
    });
    for (const k of [-1, 1]) {
      parts.steelDark.push({
        geometry: new THREE.BoxGeometry(axis === 'z' ? 0.045 : slabLen, 0.075, axis === 'z' ? slabLen : 0.045),
        matrix: rakeAt(midT, midY + 0.33, at + off + k * 0.185),
      });
    }
  }

  rakeBalustrade(parts, { axis, at: at - half + 0.05, from, to: from + dir * run, y0, dir, n, ctx });
  rakeBalustrade(parts, { axis, at: at + half - 0.05, from, to: from + dir * run, y0, dir, n, ctx });

  const matFor = {
    tread: m.tread, nosing: m.nosing, steel: m.steel,
    steelDark: m.steelDark, rail: m.rail, railDark: m.railDark,
  };
  for (const key of Object.keys(parts)) {
    if (!parts[key].length) continue;
    const mesh = new THREE.Mesh(bake(parts[key]), matFor[key]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    ctx.add(mesh);
    if (key === 'steel') {
      /* Same COVER_SOFT name as the roof cage: a baked stringer-plus-soffit
       * AABB is a wall across the flight if the fit is allowed to own it. */
      mesh.name = 'overbridgeCage';
      hullOutline(mesh, { thickness: 0.003 });
    }
  }

  /* Stringers at the rake rails, soffit under the pans. skipFit so a
   * 2.4 m tread envelope cannot grow back into the channel. */
  {
    const stringerHw = 0.06;
    const soffitPad = 0.16;
    for (let i = 0; i < n; i++) {
      const t0 = from + GOING * dir * i;
      const t1 = from + GOING * dir * (i + 1);
      const a = Math.min(t0, t1);
      const b = Math.max(t0, t1);
      const yTread = y0 - RISE * (i + 1);
      const yLo = yTread - 0.42;
      /* Top 0.28 m under the pan, below a neighbour-step craft (rise 0.18,
       * 0.10 m fly height, 0.12 m pitched vHalf). A soffit to -0.08 m is
       * still inside that envelope, and the going is only 0.28 m. */
      if (axis === 'z') {
        ctx.collide(at - half + soffitPad, a, at + half - soffitPad, b,
          yTread - 0.28, yLo, true);
      } else {
        ctx.collide(a, at - half + soffitPad, b, at + half - soffitPad,
          yTread - 0.28, yLo, true);
      }
      for (const s of [-1, 1]) {
        const edge = at + s * (half - 0.05);
        if (axis === 'z') {
          ctx.collide(edge - stringerHw, a, edge + stringerHw, b,
            yTread + 0.03, yLo, true);
        } else {
          ctx.collide(a, edge - stringerHw, b, edge + stringerHw,
            yTread + 0.03, yLo, true);
        }
      }
    }
  }

  /* No skirt collider under the flight.
   *
   * There used to be one per band of four treads, to stop the treads'
   * platforms making the ground beneath the stair walkable at stair height.
   * `world.heightAt` now takes the height the query is made from and will only
   * offer a platform within a step of it, so the undercroft looks after itself
   * -- and walking under a 跨線橋 is half the point of having one. */
  return { endT: from + dir * run, endY: y0 - drop };
}

/* ------------------------------------------------------------------ *
 * A landing: slab, edge beams, four columns, and a balustrade on whichever
 * sides are named in `rails` -- the sides a flight or the deck arrives on are
 * left out, because a balustrade there would wall the stair off.
 * ------------------------------------------------------------------ */
function landing(ctx, o) {
  const m = mats();
  const { x0, x1, z0, z1, y, rails = [], canopy = false } = o;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const w = x1 - x0, d = z1 - z0;

  const slab = box(w, SLAB, d, m.tread, cx, y - SLAB / 2, cz);
  slab.castShadow = slab.receiveShadow = true;
  ctx.add(slab);
  hullOutline(slab, { thickness: 0.003 });
  // padded so it overlaps the flight and deck platforms rather than meeting them
  ctx.platform({ x0: x0 - 0.05, x1: x1 + 0.05, z0: z0 - 0.05, z1: z1 + 0.05, top: y, solid: false });
  /* Underside only, and pulled back from sides that are not railed.
   * A prism to the walking surface is a lip: the first pan is GOING/2
   * (0.14 m) from the edge and the craft is 0.17 m across, so a descent
   * always overlaps the landing in plan. Open sides are flights or the
   * deck. skipFit so the slab mesh cannot roof-lift this back to `y`. */
  {
    const lip = 0.32;
    const closed = (side) => rails.indexOf(side) >= 0;
    const cx0 = closed('x-') ? x0 : x0 + lip;
    const cx1 = closed('x+') ? x1 : x1 - lip;
    const cz0 = closed('z-') ? z0 : z0 + lip;
    const cz1 = closed('z+') ? z1 : z1 - lip;
    ctx.collide(cx0, cz0, cx1, cz1, y - SLAB, y - SLAB - 0.34, true);
  }

  const parts = { steel: [], steelDark: [], rail: [], railDark: [] };
  // edge beams all round, and a cross beam under the middle
  parts.steel.push({ geometry: new THREE.BoxGeometry(w, 0.34, 0.1), matrix: trs(cx, y - SLAB - 0.17, z0 + 0.05) });
  parts.steel.push({ geometry: new THREE.BoxGeometry(w, 0.34, 0.1), matrix: trs(cx, y - SLAB - 0.17, z1 - 0.05) });
  parts.steel.push({ geometry: new THREE.BoxGeometry(0.1, 0.34, d), matrix: trs(x0 + 0.05, y - SLAB - 0.17, cz) });
  parts.steel.push({ geometry: new THREE.BoxGeometry(0.1, 0.34, d), matrix: trs(x1 - 0.05, y - SLAB - 0.17, cz) });
  // columns down to the ground, on pad footings -- and each one gets its own
  // small collider, so you walk *round* them under the bridge rather than
  // through them or into a wall across the whole undercroft
  for (const px of [x0 + 0.28, x1 - 0.28]) {
    for (const pz of [z0 + 0.28, z1 - 0.28]) {
      const gy = groundY(pz);
      const hCol = y - SLAB - 0.34 - gy;
      parts.steelDark.push({
        geometry: new THREE.CylinderGeometry(0.11, 0.13, hCol, 8),
        matrix: trs(px, gy + hCol / 2, pz),
      });
      parts.steel.push({
        geometry: new THREE.BoxGeometry(0.44, 0.16, 0.44),
        matrix: trs(px, gy + 0.08, pz),
      });
      ctx.collide(px - 0.12, pz - 0.12, px + 0.12, pz + 0.12, gy + hCol, undefined, true);
    }
  }
  for (const side of rails) {
    if (side === 'z-') balustrade(parts, { axis: 'x', at: z0 + 0.05, from: x0, to: x1, y, ctx });
    if (side === 'z+') balustrade(parts, { axis: 'x', at: z1 - 0.05, from: x0, to: x1, y, ctx });
    if (side === 'x-') balustrade(parts, { axis: 'z', at: x0 + 0.05, from: z0, to: z1, y, ctx });
    if (side === 'x+') balustrade(parts, { axis: 'z', at: x1 - 0.05, from: z0, to: z1, y, ctx });
  }

  const matFor = { steel: m.steel, steelDark: m.steelDark, rail: m.rail, railDark: m.railDark };
  for (const key of Object.keys(parts)) {
    if (!parts[key].length) continue;
    const mesh = new THREE.Mesh(bake(parts[key]), matFor[key]);
    mesh.castShadow = mesh.receiveShadow = true;
    /* Same COVER_SOFT name as the flight stringers. Four columns, or
     * edge beams plus the pad footings, baked into one mesh have a
     * union AABB that fills the undercroft; cover would put a wall
     * in the gaps. Authored column boxes stay. */
    mesh.name = 'overbridgeCage';
    ctx.add(mesh);
  }
  /* The undercroft is deliberately left open -- see the note in `flight()`.
   * Only the columns above are solid. */
  if (canopy) {
    /* Pad eaves over railed sides only. An opening is a flight or the
     * deck: hanging the roof AABB 16 cm into it put a gutter, and its
     * corner posts, in the throat. */
    const pad = 0.16;
    const closed = (side) => rails.indexOf(side) >= 0;
    roof(ctx, {
      x0: closed('x-') ? x0 - pad : x0,
      x1: closed('x+') ? x1 + pad : x1,
      z0: closed('z-') ? z0 - pad : z0,
      z1: closed('z+') ? z1 + pad : z1,
      y: y + CANOPY_H,
    });
  }
  return slab;
}

/* ------------------------------------------------------------------ *
 * The translucent roof. A shallow double pitch. Intermediate hoop
 * ribs used to stand in the tunnel every two metres; they are gone
 * because that is the line. Ridge, eaves and four corner posts stay.
 * ------------------------------------------------------------------ */
function roof(ctx, o) {
  const m = mats();
  const { x0, x1, z0, z1, y } = o;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const w = x1 - x0, d = z1 - z0;
  const alongZ = d >= w;
  const span = alongZ ? w : d;
  const runLen = alongZ ? d : w;
  const camber = 0.26;
  const parts = { rib: [] };

  // two sloping sheets meeting on a ridge
  const slope = Math.atan2(camber, span / 2);
  const sheetLen = Math.hypot(span / 2, camber) + 0.04;
  for (const s of [-1, 1]) {
    const geo = new THREE.BoxGeometry(
      alongZ ? sheetLen : runLen, 0.035, alongZ ? runLen : sheetLen
    );
    const sheet = new THREE.Mesh(geo, m.canopy);
    sheet.name = 'overbridgeCanopy';
    sheet.position.set(alongZ ? cx + s * span / 4 : cx, y + camber / 2, alongZ ? cz : cz + s * span / 4);
    if (alongZ) sheet.rotation.z = -s * slope;
    else sheet.rotation.x = s * slope;
    sheet.userData.noOutline = true;
    sheet.userData.noShadow = true;
    ctx.add(sheet);
  }
  // ridge and eaves gutters
  parts.rib.push({
    geometry: new THREE.BoxGeometry(alongZ ? 0.12 : runLen, 0.1, alongZ ? runLen : 0.12),
    matrix: trs(cx, y + camber + 0.03, cz),
  });
  for (const s of [-1, 1]) {
    parts.rib.push({
      geometry: new THREE.BoxGeometry(alongZ ? 0.1 : runLen, 0.11, alongZ ? runLen : 0.1),
      matrix: alongZ ? trs(cx + s * span / 2, y - 0.02, cz) : trs(cx, y - 0.02, cz + s * span / 2),
    });
  }
  /* Corner posts only, inset from the roof AABB so they stand on the
   * deck rather than in the stair throat. A hoop at each end of the
   * AABB used to sit 16 cm onto the flight. */
  const inset = 0.22;
  const cpx0 = x0 + inset, cpx1 = x1 - inset;
  const cpz0 = z0 + inset, cpz1 = z1 - inset;
  for (const px of [cpx0, cpx1]) {
    for (const pz of [cpz0, cpz1]) {
      parts.rib.push({
        geometry: new THREE.BoxGeometry(0.075, CANOPY_H - 0.02, 0.075),
        matrix: trs(px, y - CANOPY_H / 2, pz),
      });
    }
  }
  const mesh = new THREE.Mesh(bake(parts.rib), m.canopyRib);
  mesh.name = 'overbridgeCage';
  mesh.castShadow = true;
  ctx.add(mesh);
  /* Ridge, eaves and the four posts, not a lid and not a hoop. skipFit
   * keeps a 10 m beam from growing to the envelope. The sheets are air. */
  const hit = (ax, az, bx, bz, top, bot) => {
    ctx.collide(ax, az, bx, bz, top, bot, true);
  };
  const hw = 0.06;
  if (alongZ) {
    hit(cx - hw, z0, cx + hw, z1, y + camber + 0.08, y + camber - 0.04);
    for (const s of [-1, 1]) {
      const ex = cx + s * span / 2;
      hit(ex - hw, z0, ex + hw, z1, y + 0.06, y - 0.08);
    }
  } else {
    hit(x0, cz - hw, x1, cz + hw, y + camber + 0.08, y + camber - 0.04);
    for (const s of [-1, 1]) {
      const ez = cz + s * span / 2;
      hit(x0, ez - hw, x1, ez + hw, y + 0.06, y - 0.08);
    }
  }
  const ph = 0.04;
  for (const px of [cpx0, cpx1]) {
    for (const pz of [cpz0, cpz1]) {
      hit(px - ph, pz - ph, px + ph, pz + ph, y, y - CANOPY_H);
    }
  }
  return mesh;
}

/* ------------------------------------------------------------------ *
 * The deck: the span itself, on two girders, with cross beams and a pier
 * pair each side of the track.
 * ------------------------------------------------------------------ */
function deck(ctx) {
  const m = mats();
  const cz = (Z_N + Z_F) / 2;
  const len = Z_N - Z_F;

  const slab = box(DECK_W, SLAB, len, m.tread, X_C, DECK_Y - SLAB / 2, cz);
  slab.castShadow = slab.receiveShadow = true;
  ctx.add(slab);
  hullOutline(slab, { thickness: 0.0032 });
  ctx.platform({ x0: XD0, x1: XD1, z0: Z_F, z1: Z_N, top: DECK_Y });

  const parts = { steel: [], steelDark: [], rail: [], railDark: [] };
  // the two main girders, web plates with a bottom flange
  for (const s of [-1, 1]) {
    const gx = X_C + s * (DECK_W / 2 - 0.06);
    parts.steel.push({
      geometry: new THREE.BoxGeometry(0.12, GIRDER, len),
      matrix: trs(gx, DECK_Y - SLAB - GIRDER / 2, cz),
    });
    parts.steelDark.push({
      geometry: new THREE.BoxGeometry(0.3, 0.07, len),
      matrix: trs(gx, DECK_Y - SLAB - GIRDER, cz),
    });
  }
  // cross beams between them, and the K-bracing that shows from underneath
  const nb = Math.round(len / 1.4);
  for (let i = 0; i <= nb; i++) {
    const z = Z_F + (len / nb) * i;
    parts.steelDark.push({
      geometry: new THREE.BoxGeometry(DECK_W - 0.1, 0.14, 0.09),
      matrix: trs(X_C, DECK_Y - SLAB - GIRDER + 0.14, z),
    });
  }
  /* A drainage channel down one edge with a spout at midspan.  A flat deck
   * with no fall is the detail that gives away a bridge nobody built. */
  parts.steelDark.push({
    geometry: new THREE.BoxGeometry(0.14, 0.05, len - 0.2),
    matrix: trs(XD0 + 0.16, DECK_Y - 0.02, cz),
  });
  parts.steelDark.push({
    geometry: new THREE.CylinderGeometry(0.045, 0.045, 0.55, 6),
    matrix: trs(XD0 + 0.16, DECK_Y - SLAB - 0.3, cz + 1.2),
  });

  balustrade(parts, { axis: 'z', at: XD0 + 0.05, from: Z_F, to: Z_N, y: DECK_Y, ctx });
  balustrade(parts, { axis: 'z', at: XD1 - 0.05, from: Z_F, to: Z_N, y: DECK_Y, ctx });

  /* The two girders, as themselves, not a wall across the tracks. */
  for (const s of [-1, 1]) {
    const gx = X_C + s * (DECK_W / 2 - 0.06);
    ctx.collide(gx - 0.16, Z_F, gx + 0.16, Z_N, DECK_Y - SLAB, DECK_Y - SLAB - GIRDER);
  }

  /* Piers just outside each lineside fence.  They also close the undercroft:
   * the deck is a platform, so the strip of walkable ground between the fence
   * and the head landing has to be too narrow to stand in. */
  for (const pz of [TRACK_HALF + 1.5, -(TRACK_HALF + 1.5)]) {
    const gy = groundY(pz);
    const hCol = DECK_Y - SLAB - GIRDER - gy;
    for (const s of [-1, 1]) {
      const px = X_C + s * (DECK_W / 2 - 0.2);
      parts.steelDark.push({
        geometry: new THREE.CylinderGeometry(0.15, 0.19, hCol, 10),
        matrix: trs(px, gy + hCol / 2, pz),
      });
    }
    // pier cap and footing
    parts.steel.push({ geometry: new THREE.BoxGeometry(DECK_W + 0.1, 0.2, 0.5), matrix: trs(X_C, DECK_Y - SLAB - GIRDER - 0.1, pz) });
    const foot = box(DECK_W + 0.5, 0.3, 0.9, m.concreteMid, X_C, gy + 0.15, pz);
    foot.receiveShadow = true;
    ctx.add(foot);
    /* Columns to the girder, not a 1 m stub you fly through, and not a wall
     * across the tracks at deck height. */
    for (const s of [-1, 1]) {
      const px = X_C + s * (DECK_W / 2 - 0.2);
      ctx.collide(px - 0.19, pz - 0.19, px + 0.19, pz + 0.19, gy + hCol);
    }
    ctx.collide(XD0 - 0.25, pz - 0.45, XD1 + 0.25, pz + 0.45, gy + 0.35);
  }

  const matFor = { steel: m.steel, steelDark: m.steelDark, rail: m.rail, railDark: m.railDark };
  for (const key of Object.keys(parts)) {
    if (!parts[key].length) continue;
    const mesh = new THREE.Mesh(bake(parts[key]), matFor[key]);
    mesh.castShadow = mesh.receiveShadow = true;
    /* Piers in the steelDark bake reach the ground. Naming the
     * girder bake keeps FIT from owning a wall across the tracks. */
    mesh.name = 'overbridgeCage';
    ctx.add(mesh);
    if (key === 'steel') hullOutline(mesh, { thickness: 0.003 });
  }

  roof(ctx, { x0: XD0 - 0.18, x1: XD1 + 0.18, z0: Z_F - 0.1, z1: Z_N + 0.1, y: DECK_Y + CANOPY_H });
}

/* ------------------------------------------------------------------ */

export function buildOverbridge(ctx) {
  const m = mats();
  const gm = groundMats();
  const rng = rngKit(7701);
  const sakura = [];
  const shrubs = [];
  const grove = [];
  const petals = [];

  deck(ctx);

  /* ------------------------------- near tower -------------------------------
   * Quarter turn: north off the deck head, then east off the corner landing,
   * so the foot of the stair comes out on open ground rather than back in the
   * strip beside the fence. */
  const nMidY = DECK_Y - RISE * N_FLIGHT;                  // 3.60
  // head: the deck arrives on z-, the flight leaves on z+, so rails go on x
  landing(ctx, {
    x0: X_C - HEAD_W / 2, x1: X_C + HEAD_W / 2, z0: Z_N, z1: Z_N + 2.40,
    y: DECK_Y, rails: ['x-', 'x+'], canopy: true,
  });
  flight(ctx, { axis: 'z', at: X_C, from: Z_N + 2.40, y0: DECK_Y, dir: 1, ramp: 1 });
  const nMidZ = Z_N + 2.40 + GOING * N_FLIGHT;             // 12.40
  // corner: flight 1 arrives on z-, flight 2 leaves on x+
  landing(ctx, {
    x0: X_C - HEAD_W / 2, x1: X_C + HEAD_W / 2 + 0.3, z0: nMidZ, z1: nMidZ + 2.50,
    y: nMidY, rails: ['x-', 'z+'], canopy: true,
  });
  flight(ctx, { axis: 'x', at: nMidZ + 1.25, from: X_C + HEAD_W / 2 + 0.3, y0: nMidY, dir: 1, ramp: -1 });
  const nFootX = X_C + HEAD_W / 2 + 0.3 + GOING * N_FLIGHT;  // 48.20

  /* -------------------------------- far tower --------------------------------
   * Mirrored, but turning the other way: east off the head then south, because
   * due south is the row of background houses at z -9 to -19 and the strip
   * behind the platform is only five metres deep. */
  landing(ctx, {
    x0: X_C - HEAD_W / 2, x1: X_C + HEAD_W / 2, z0: Z_F - 2.40, z1: Z_F,
    y: DECK_Y, rails: ['x-', 'z-'], canopy: true,
  });
  flight(ctx, { axis: 'x', at: Z_F - 1.20, from: X_C + HEAD_W / 2, y0: DECK_Y, dir: 1, ramp: 1 });
  const fMidX = X_C + HEAD_W / 2 + GOING * N_FLIGHT;        // 47.90
  landing(ctx, {
    x0: fMidX, x1: fMidX + 2.50, z0: Z_F - 2.60, z1: Z_F,
    y: nMidY, rails: ['z+', 'x+'], canopy: true,
  });
  flight(ctx, { axis: 'z', at: fMidX + 1.25, from: Z_F - 2.60, y0: nMidY, dir: -1, ramp: 1 });
  const fFootZ = Z_F - 2.60 - GOING * N_FLIGHT;             // -13.60

  /* ------------------------------- the aprons -------------------------------
   * A paved landing at the foot of each stair, so the last tread lands on
   * something rather than in the grass. */
  pad(ctx, {
    x: nFootX + 1.1, z: nMidZ + 1.25, w: 2.6, d: FLIGHT_W + 0.4,
    y: groundY(nMidZ), h: 0.08, mat: gm.concrete, name: 'obNearApron',
  });
  pad(ctx, {
    x: fMidX + 1.25, z: fFootZ - 1.1, w: FLIGHT_W + 0.4, d: 2.6,
    y: groundY(fFootZ), h: 0.08, mat: gm.concrete, name: 'obFarApron',
  });

  /* --------------------------- signage and notices --------------------------- *
   * Direction plates at both feet and on the deck, plus the two ad boards a
   * bridge like this always carries on its balustrade. */
  ctx.add(makeSignPost({
    x: nFootX + 2.3, z: nMidZ + 3.1, y: groundY(nMidZ), ry: -Math.PI / 2, h: 2.5, postMat: m.steelDark,
    plates: [{ map: bridgeSign(0), w: 0.9, h: 0.52, y: 2.0, double: true }],
  }));
  ctx.add(makeSignPost({
    x: fMidX + 3.1, z: fFootZ - 2.2, y: groundY(fFootZ), ry: Math.PI, h: 2.5, postMat: m.steelDark,
    plates: [{ map: bridgeSign(1), w: 0.9, h: 0.52, y: 2.0, double: true }],
  }));
  // ad boards hung on the outside of the deck balustrade, facing the street
  for (const [z, v] of [[Z_N - 2.1, 0], [Z_F + 3.4, 1]]) {
    const art = bridgeAd(v);
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.78, 1.9),
      // one map, both faces -- BoxGeometry already reverses udir on -x
      [flat({ color: 0xffffff, map: art, cache: false }),
       flat({ color: 0xffffff, map: art, cache: false }),
       flat({ color: PAL.wallGray }), flat({ color: PAL.wallGray }),
       flat({ color: PAL.wallGray }), flat({ color: PAL.wallGray })]
    );
    board.position.set(XD0 - 0.09, DECK_Y + 0.52, z);
    board.castShadow = true;
    ctx.add(board);
    hullOutline(board, { thickness: 0.003 });
  }
  // and the plate that tells you not to drop things on the railway
  ctx.add(makeSignPost({
    x: XD1 + 0.14, z: Z_N + 1.2, y: DECK_Y, ry: -Math.PI / 2, h: 1.0, postMat: m.railDark,
    plates: [{ map: warningPlate(1), w: 0.3, h: 0.6, y: 0.78 }],
  }));

  /* ------------------------------ under the bridge ------------------------------ *
   * The strip between the fence and the piers is the one place the structure
   * meets the railway, and leaving it as bare grass is what makes a bridge
   * look dropped in.  Ballast spilling out from under the fence, an equipment
   * cabinet against each pier, weeds in the corners, and mesh across the
   * undercroft of the head landings. */
  {
    const ballast = cel({ color: PAL.ballast, bands: 3, tint: 0x655d84 });
    for (const pz of [TRACK_HALF + 1.5, -(TRACK_HALF + 1.5)]) {
      const gy = groundY(pz);
      const strip = box(DECK_W + 3.4, 0.07, 1.5, ballast, X_C, gy + 0.035, pz);
      strip.receiveShadow = true;
      ctx.add(strip);
      // loose stones along its edge, so the boundary is not a ruled line
      const stones = [];
      for (let i = 0; i < 14; i++) {
        const r = rng.range(0.05, 0.1);
        stones.push({
          geometry: new THREE.IcosahedronGeometry(r, 0),
          matrix: trs(X_C + rng.range(-2.4, 2.4), gy + r * 0.5, pz + rng.sign() * rng.range(0.72, 0.95)),
        });
      }
      const sm = new THREE.Mesh(bake(stones), ballast);
      sm.castShadow = true;
      ctx.add(sm);
    }
    ctx.add(cabinet({ x: XD0 - 1.15, z: TRACK_HALF + 1.5, y: groundY(4), ry: Math.PI / 2, w: 0.66, h: 1.0, d: 0.42 }));
    ctx.add(cabinet({ x: XD1 + 1.2, z: -(TRACK_HALF + 1.5), y: groundY(-4), ry: -Math.PI / 2, w: 0.5, h: 0.8, d: 0.36 }));
    ctx.add(makeBins({ x: nFootX + 2.4, z: nMidZ - 0.4, y: groundY(nMidZ), ry: -Math.PI / 2 }));

    /* No mesh across the undercroft.
     *
     * There were four panels boxing in both head landings, which turned the
     * space under the bridge into a sealed pen and stopped the new lineside
     * path -- it runs at z = 5.1, straight beneath the near head -- from
     * continuing past it.  The undercroft is meant to be walked through, and
     * the thing that actually needs fencing off, the drop to the ballast, is
     * already fenced: `railway.js` runs the lineside fence at z = ±3.25 the
     * whole length of the district, right past here.  A second fence 0.13 m
     * inside it would have been two fences interpenetrating. */
    // weeds in the corners the mower never reaches
    for (let i = 0; i < 7; i++) {
      shrubs.push({
        x: X_C + rng.range(-2.6, 2.6), z: (i % 2 ? 1 : -1) * (TRACK_HALF + rng.range(2.4, 3.2)),
        y: 0, r: rng.range(0.22, 0.34), count: 3, spread: 0.9, seed: 7710 + i,
      });
    }
  }

  /* ------------------------ the lineside path to the crossing ------------------------
   * The near bank east of the crossing had no path at all -- the district's
   * only lineside walk is the one on the west side -- so the bridge would have
   * been reached across grass.  This runs below the row of houses and above
   * the row of cherries, which is the one line clear of both, and it is what
   * ties the rest corner, the bridge and the crossing into a single walk. */
  lane(ctx, {
    axis: 'x', at: 5.10, from: 12.40, to: XD0 - 0.2, w: 1.5,
    mat: gm.concrete, kerb: false, rise: 0.05, y: groundY(5.1), name: 'linesideEast',
  });
  for (let i = 0; i < 9; i++) {
    // expansion joints, the same trick the west path uses
    ctx.add(box(0.06, 0.09, 1.5, gm.concreteMid, 15.0 + i * 3.0, groundY(5.1) + 0.04, 5.10));
  }

  /* ------------------------------- planting ------------------------------- *
   * Two cherries at the near foot so the stair is seen through blossom, and a
   * dark grove ring behind the far foot -- from the deck you look straight out
   * over it, and without something tall the view east is bare sky. */
  sakura.push({ x: nFootX + 3.6, z: nMidZ + 4.4, y: groundY(nMidZ + 4.4), scale: 1.2, seed: 7721, lean: 0.11, leanDir: 2.2, keep: true });
  sakura.push({ x: XD0 - 3.2, z: 8.6, y: groundY(8.6), scale: 1.14, seed: 7722, lean: 0.09, leanDir: 4.6, keep: true });
  sakura.push({ x: fMidX + 4.2, z: fFootZ + 2.2, y: groundY(fFootZ), scale: 1.1, seed: 7723, lean: 0.1, leanDir: 1.4 });
  for (let i = 0; i < 5; i++) {
    grove.push({
      x: 52.0 + (i % 2) * 3.2, z: -6.0 - i * 3.4, y: 0,
      scale: 1.3 + (i % 3) * 0.14, seed: 7730 + i, spread: 1.1,
    });
  }
  shrubs.push({ x: XD0 - 2.2, z: 12.0, y: groundY(12), r: 0.5, count: 4, spread: 1.5, seed: 7741 });
  shrubs.push({ x: fMidX + 3.0, z: fFootZ - 1.0, y: groundY(fFootZ), r: 0.48, count: 3, spread: 1.3, seed: 7742 });
  petals.push({ x: nFootX + 1.1, z: nMidZ + 1.25, w: 4.0, d: 3.6, y: groundY(nMidZ) + 0.09, n: 70 });
  petals.push({ x: X_C, z: 6.0, w: 3.2, d: 3.0, y: groundY(6) + 0.02, n: 50 });

  return { sakura, shrubs, grove, petals, deckY: DECK_Y, x: X_C };
}
