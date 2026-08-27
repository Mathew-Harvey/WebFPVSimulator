import * as THREE from 'three';
import { PAL } from '../core/palette.js';
import { cel, flat } from '../core/toon.js';
import {
  tunnelPlate, tunnelInfo, eastTunnelPlate, eastTunnelInfo,
  railPlate, trailSign, borePlate, maintGatePlate,
} from '../core/textures.js';
import { box, cyl, bake, trs, rngKit } from '../core/util.js';
import { hullOutline } from '../core/outline.js';
import { groundY, TERRAIN_DROP, TRACK_HALF } from './street.js';
import { railing, meshFence, groundMats, pad, steps } from './ground.js';
import {
  TUNNELS, NOTCHES, CELL, fieldAt, hillMats, hillMeshY, hillPath, SITES, TRAILS,
  buildOutcrops, buildTufts, standAt,
} from './hills.js';
import {
  makeBench, makeSignPost, makeCone, makeCrates,
  makeNoticeBoard, makeMilkCrate,
} from './props.js';

/* ------------------------------------------------------------------ *
 * The railway tunnels -- ひばり山トンネル and 東山トンネル.
 *
 * The brief for the hills asked for one thing that is not landscape: the range
 * has to cross the railway, and the railway has to go *through* it.  That is the
 * single most recognisable image in Japanese railway scenery and it is the reason
 * the west arm exists at all -- a range that stops politely at the lineside is
 * scenery behind a town, a range the line disappears into is geography the town
 * sits inside.
 *
 * ------------------------------------------------------------------ *
 * WHY THERE ARE TWO, AND WHY THEY ARE MIRRORS
 *
 * There was one, in the west arm, and the survey that this round started with
 * says it is in the wrong place: sampling `hillAt` along the whole ring, the west
 * arm carries 10-12 m of hill *north* of the track and **0.0 m** in the band
 * south of it, so the line runs along the edge of a hill rather than through one.
 * The only longitude on the planet where both flanks carry mass is the east
 * shoulder's col -- E2 at (124, -48) south of the line, E3 at (122, 20) north --
 * where the two sides read 9.9 and 9.8 at x = 123 and stay above 6 m from
 * x = 108 to 141.  So 東山トンネル goes there.
 *
 * The west bore stays, and the two are deliberately opposite at every point,
 * because two portals on a 1 005 m loop are only worth having if a player who has
 * seen one does not think they have walked back to it:
 *
 *              ひばり山トンネル (W)        東山トンネル (E)
 *   form       a spur, mass north only    a col, hill both sides
 *   approach   片切り: bank N, open S      cut on both banks
 *   bore       36 m, walkway SOUTH        30 m, walkway NORTH
 *   gate       south, x -84.5             north, x 88
 *   railside   south, at the east mouth   north, at the west mouth
 *   overlook   on the north bank          on the south ridge
 *
 * What made the second one possible is one change in `hills.js`: the drainage
 * channel's corridor closes from 14 m to 11 m over a bore's longitude, so the
 * 24 m of ground between the two rings is allowed to stand up.  Everywhere else
 * in the world that band is dead flat, which is why the first survey of it
 * returned zeros on both sides of the planet and why no range could ever have
 * crossed the line.
 *
 * ------------------------------------------------------------------ *
 * WHY THE MOUNTAIN OVER THE TRACK IS NOT PART OF THE HEIGHT FIELD
 *
 * Because a height field cannot have a hole in it.  Remove faces from a
 * heightfield and what you get is a canyon from the crest to the floor, open to
 * the sky, not a tunnel; and you cannot make one vertical either, so there is no
 * way to express a portal face in it.
 *
 * So `hills.js` cuts a rectangle out of itself per bore -- `NOTCHES`, on lattice
 * lines -- and everything inside one is built here as ordinary geometry:
 *
 *   - **the cap**, a swept surface over the bore, which is the mountain;
 *   - **the two portals**, which close the cap's cut edge at each end and carry
 *     the arch;
 *   - **the bore**, an arch liner the train runs through and a player walks in;
 *   - and the cutting, the drainage, the access and the signage round them.
 *
 * Each cap samples `fieldAt` along its own four notch edges, all of which are
 * lattice lines that the notch's boundary test leaves intact, so the two surfaces
 * meet exactly rather than nearly.  Getting that wrong does not throw: it leaves
 * a hairline of sky along a ridge, forty metres long.
 *
 * ------------------------------------------------------------------ *
 * THE CLEARANCE, WHICH WAS WRONG FOR THE WHOLE LIFE OF THE FIRST BORE
 *
 * `boreProfile` used to read
 *
 *     [cos(a) * T.half,  T.spring - T.half + sin(a) * T.arch]
 *                        ^^^^^^^^^^^^^^^^^^
 *
 * and the arch's centre therefore landed at y = -0.1 rather than at the
 * springing line.  The consequences, none of which threw or logged anything:
 * the crown was at **3.20 m** and not 6.5, the side walls had a height of minus
 * ten centimetres, and every one of the train's roof, its pantograph and the two
 * catenary wires ran through solid rock -- the messenger wire by 2.78 m.  It was
 * invisible because a tunnel with a train in it is a dark hole with a dark shape
 * moving in it, and because `CROWN` was computed from the *constants* (6.5) so
 * everything hung off the crown floated 2.75 m above the ceiling, inside the
 * mountain, where nothing can be seen.
 *
 * The profile is a **horseshoe**: a vertical side wall from the invert to the
 * springing at `spring`, then a quarter of an ellipse of semi-axes (`half`,
 * `arch`) centred on `(0, spring)`, so the crown lands at `spring + arch` = 6.5
 * and the two meet tangentially at `(±half, spring)`.  `boreClearance()` checks
 * it numerically against the train's own envelope from the console, and that is
 * the only way to check it -- a rendered frame of a tunnel mouth looks correct
 * whatever the ceiling is doing.
 *
 * ------------------------------------------------------------------ *
 * WHAT THE ARITHMETIC DECIDED
 *
 * **36 m and 30 m of bore, and the train is 60.3 m long.**  So neither is ever
 * entirely inside, and that is the better picture: from the lineside you watch
 * the cab go in while the third car is still in the open, which is the shot.
 *
 * **The crown is at 6.5 m and it is the wires that set it, not the train.**  The
 * roof is at 3.96, the roof pods reach 4.24, the pantograph 4.88, and the
 * messenger wire above it runs at 5.95 -- and the catenary is authored as two
 * tubes right round the equator, so it goes through both tunnels whether or not a
 * real railway would hang it that way.  6.5 clears it by 0.55.  The bore is 6.6 m
 * wide because one side carries a 1.35 m maintenance walkway outside the ballast,
 * which is the brief's maintenance path, the thing that gives the mouth its scale,
 * and -- since this round -- the ground a player actually stands on.
 *
 * **The portal face is a lens, not a rectangle.**  The cap stands above the
 * hillside beside it by 11 m over the track and by nothing at all at the notch's
 * z edges, so what has to be closed at each end is the area between two profiles.
 * It is built as two extrusions split at the coping line, whose top edge is
 * `capAt` sampled at the same spacing the cap mesh uses -- so it cannot leave a
 * gap.  A single rectangular wall big enough to cover the lens would be 39 m of
 * concrete 11 m tall, which is a dam.
 * ------------------------------------------------------------------ */

/**
 * The cap and the portal step at the **hill lattice's own pitch**, and that is a
 * correctness requirement rather than a tessellation preference.
 *
 * A cap has to meet the hill mesh's free edge along all four sides of its notch.
 * It does that by sampling `fieldAt` along those edges — which is exact at every
 * point it samples, and a *chord* everywhere in between.  So the two surfaces
 * agree only where the cap's stations land on lattice nodes, and where they do not
 * the cap's edge cuts the corner off the hillside's and leaves a gap open to the
 * sky along a thirty-metre line.
 *
 * It was `round(depth / 2.0)`, which gave 1.95 m in the west and 2.0 in the east
 * against a 3 m lattice: never on a node except by accident.  Measured, with the
 * lattice at 1.5 m: **1.69 m of gap** at 東山's south edge and 0.96 at ひばり山's
 * east one.  It threw nothing and it is invisible from anywhere except a position
 * that happens to look along the edge, which is why it survived two rounds of the
 * cap being rewritten.
 *
 * Every notch edge is a multiple of `CELL` (that is enforced in `hills.js` and is
 * why the lattice may only be halved, never divided by 2.0), so both counts below
 * are exact integers and every boundary vertex of the cap is a lattice node.
 */
const ZTARGET = CELL;                       // z spacing of cap and portal
const PORTAL_T = 1.15;                      // thickness of the 坑門
const WALL_HALF = 7.0;                      // half-width of the concrete face
const LINER_T = 0.42;                       // the lining's thickness

/** How far the approach cutting reaches out from each portal. */
const CUT = 15.0;

/* --------------------------- the walkable bore --------------------------- */

/** The maintenance walkway: width, and the height of its top over the plane. */
const PATH_W = 1.35;
const PATH_Y = 0.50;
/** A 待避所: how far it is set back into the lining, and its soffit height. */
const REC_D = 0.90;
const REC_H = 2.30;
/** Length of one ring of lining, which is also the joint spacing. */
const RING = 3.0;
/** How far each ring alternates in and out.  See `fullProfile`. */
const RING_STEP = 0.065;
/** The ballast: crown height, shoulder height, and where the shoulder ends. */
const BAL_TOP = 0.26;
const BAL_SHOULDER = 0.13;
const BAL_EDGE = TRACK_HALF + 0.9;

const M = {};
function mats() {
  if (M.face) return M;
  M.face = cel({ color: PAL.tunnelFace, bands: 3, tint: 0x6a6288 });
  M.faceDark = cel({ color: PAL.tunnelFaceDark, bands: 3, tint: 0x655d84 });
  M.ring = cel({ color: 0xb6b0bb, bands: 3, tint: 0x605878 });
  M.coping = cel({ color: 0xd6d2da, bands: 3, tint: 0x6f6790 });
  M.slope = cel({ color: PAL.hillEarth, bands: 3, tint: 0x7a7396 });
  /* The bore is **unlit**, and it has to be.  A cel material inside a tunnel is
   * lit by the sun like everything else -- there is no occlusion in this
   * pipeline beyond the shadow cascade -- so a cel liner comes out as a pale
   * arch painted on a hillside.  Flat and dark reads as a hole, which is the
   * only thing a tunnel mouth has to do.
   *
   * It is also why the lamps below are the only light in here: with no lighting
   * model inside the bore, "lit" means an emissive face and a pale pool under it
   * and nothing else, so the lamps have to be *drawn* rather than computed. */
  M.bore = flat({ color: PAL.tunnelBore });
  M.boreDeep = flat({ color: PAL.tunnelBoreDeep });
  M.boreRib = flat({ color: 0x45415a });
  M.boreFloor = flat({ color: 0x3d3a4e });
  M.boreConc = flat({ color: 0x7c778e });
  M.boreLip = flat({ color: 0x8e889d });
  M.boreRail = flat({ color: 0x8b8698 });
  M.lamp = flat({ color: PAL.lanternLit });
  M.lampBody = flat({ color: 0x2c2a38 });
  M.metal = cel({ color: PAL.metal, bands: 3, tint: 0x666090 });
  M.metalDark = cel({ color: PAL.metalDark, bands: 3, tint: 0x5c5680 });
  M.cabinet = cel({ color: PAL.cabinet, bands: 3, tint: 0x6f6890 });
  M.concrete = cel({ color: PAL.concrete, bands: 3, tint: 0x6f6790 });
  M.concreteMid = cel({ color: PAL.concreteMid, bands: 3, tint: 0x6a6288 });
  M.timber = cel({ color: 0x8a6f52, bands: 3, tint: 0x5c5680 });
  return M;
}

/* ------------------------------------------------------------------ *
 * Per-bore derived geometry.
 * ------------------------------------------------------------------ */

/**
 * Everything about a bore that is arithmetic rather than a decision.
 *
 * The z spacing is **derived from the notch rather than fixed at 2.0**, because
 * the west bore's notch is 39 m deep and 39/2 is not an integer: the cap's own
 * loop ran `nz = round(39/2) = 20` steps of exactly 2.0 from z = -15 and finished
 * at 25, a metre past the notch it was supposed to fill, overlapping the hill
 * mesh.  It never showed.  One division fixes it for every notch depth.
 */
const BORES = TUNNELS.map((T, idx) => {
  const LEN = T.x1 - T.x0;
  const nz = Math.max(2, Math.round((T.zN - T.zS) / ZTARGET));
  const rng = rngKit(51907 + idx * 971);
  const micro = [];
  for (let k = 0; k < 7; k++) {
    micro.push({
      x: rng.range(T.x0 + 3, T.x1 - 3), z: rng.range(T.zS + 4, T.zN - 4),
      rx: rng.range(6, 13), rz: rng.range(5, 11),
      h: rng.range(0.5, 1.35) * (k % 3 === 2 ? -1 : 1),
    });
  }
  return {
    T, idx, LEN, nz,
    CROWN: T.spring + T.arch,
    ZSTEP: (T.zN - T.zS) / nz,
    mid: (T.x0 + T.x1) / 2,
    micro,
    plate: idx === 0 ? tunnelPlate : eastTunnelPlate,
    info: idx === 0 ? tunnelInfo : eastTunnelInfo,
  };
});

/* ------------------------------------------------------------------ *
 * The cap: the mountain over the bore.
 * ------------------------------------------------------------------ */

/** Crown height along the bore -- highest in the middle, lowest at the faces. */
function crestAt(b, x) {
  const t = (x - b.T.x0) / b.LEN;
  const e = 1 - (2 * t - 1) * (2 * t - 1);        // parabolic, 0 at both ends
  return b.T.crestEnd + (b.T.crestMid - b.T.crestEnd) * e;
}

/**
 * The knoll: the hump of mountain that exists *because* there is a bore under it.
 *
 * A bell 30 m across in z, centred on the bore's own crest line, whose height
 * along the bore is `crestAt`.  Zero derivative at both ends, so it lands on the
 * terrain tangentially instead of ending in a crease.
 */
function knollAt(b, x, z) {
  const t = (z - b.T.zCrest) / 15.0;
  if (t <= -1 || t >= 1) return 0;
  const s = 1 - t * t;
  return crestAt(b, x) * s * s;
}

/**
 * The terrain the notch removed, put back: a Coons patch across the hole from its
 * own four edges.
 *
 * This is the fix for the thing that made the first portal look like a dam.  The
 * cap started as two blends from the crest line out to `hillAt` at z = zS and zN,
 * which meant that at the *portal planes* it was still 9.6 m up over the whole
 * 39 m width while the hillside three metres outside was 2.3 m -- so what had to
 * be closed at each end was a lens 39 m wide and 11 m tall, and 39 m of concrete
 * 11 m tall is not a tunnel portal, it is a dam.  Rendered, it was a vast grey
 * buttress with a hill growing out of the top of it.
 *
 * A bilinearly blended Coons patch interpolates all four boundary curves exactly,
 * so along both portal planes the cap *is* the hillside's own edge -- and the lens
 * the portal has to close collapses to nothing but the knoll's excess over the
 * terrain: 22 m wide instead of 39, and zero everywhere the mountain is not
 * actually standing above the ground beside it.  Which is a 坑門.
 *
 * `fieldAt` and not `hillAt`, because the cap has to meet the hill *mesh*, which
 * is drawn at the field and dips below the reference plane at its own toe.
 */
function patchAt(b, x, z) {
  const { T } = b;
  const u = (x - T.x0) / b.LEN;
  const v = (z - T.zS) / (T.zN - T.zS);
  const W = fieldAt(T.x0, z), E = fieldAt(T.x1, z);
  const S = fieldAt(x, T.zS), N = fieldAt(x, T.zN);
  const c00 = fieldAt(T.x0, T.zS), c10 = fieldAt(T.x1, T.zS);
  const c01 = fieldAt(T.x0, T.zN), c11 = fieldAt(T.x1, T.zN);
  return (1 - u) * W + u * E
    + (1 - v) * S + v * N
    - ((1 - u) * (1 - v) * c00 + u * (1 - v) * c10 + (1 - u) * v * c01 + u * v * c11);
}

/**
 * The cap's surface: the terrain, with the mountain over the bore added to it.
 *
 * The roughness is not decoration -- same lesson the hill field learned, in
 * miniature: a smooth analytic dome under a cel material lands in one or two
 * bands and reads as a curved sheet of card.  Seven small bumps, two of them
 * hollows, scaled by how far the knoll stands above the terrain -- which is zero
 * along all four edges of the notch, so the cap still meets the hillside exactly
 * and the portal face, which samples this same function, still closes the cap's
 * edge exactly.
 */
export function capAt(b, x, z) {
  const p = patchAt(b, x, z);
  const k = knollAt(b, x, z);
  if (k <= p) return p;
  let r = 0;
  for (const m of b.micro) {
    const dx = (x - m.x) / m.rx;
    const dz = (z - m.z) / m.rz;
    const d2 = dx * dx + dz * dz;
    if (d2 < 1) r += m.h * (1 - d2) * (1 - d2);
  }
  return k + r * Math.min(1, (k - p) / 2.5);
}

/** The drawn y of the cap, in the same relationship to the plane the hills use. */
const capMeshY = (b, x, z) => groundY(z) + capAt(b, x, z) - TERRAIN_DROP;

function buildCap(ctx, b) {
  const { T } = b;
  const hm = hillMats();
  const pos = [[], [], [], []];
  const tri = (list, p, q, r) => list.push(...p, ...q, ...r);
  const P = (x, z) => [x, capMeshY(b, x, z), z];
  // on the lattice, for the reason in the note by `ZTARGET`
  const nx = Math.round(b.LEN / CELL);
  const XSTEP = b.LEN / nx;
  const rng = rngKit(4471 + b.idx * 617);

  for (let i = 0; i < nx; i++) {
    const xa = T.x0 + i * XSTEP;
    const xb = xa + XSTEP;
    for (let j = 0; j < b.nz; j++) {
      const za = T.zS + j * b.ZSTEP;
      const zb = za + b.ZSTEP;
      const A = P(xa, za), B = P(xb, za), C = P(xb, zb), D = P(xa, zb);
      const dhx = (B[1] - A[1]) / XSTEP;
      const dhz = (D[1] - A[1]) / b.ZSTEP;
      const slope = Math.hypot(dhx, dhz);
      const hAvg = (A[1] + B[1] + C[1] + D[1]) / 4;
      const hash = rng.range(-0.5, 0.5);
      /* **1.05 and not 0.78.**  A knoll authored over a bore is intrinsically
       * steeper than a hillside -- it has to rise 11 m in the fifteen metres
       * between the track and the notch's edge -- so at the hill field's own
       * threshold nearly all of it came out in the bare-earth tone, and from the
       * overlook that is a hundred square metres of tan filling half the frame
       * with a portal at the bottom of it.  A wooded mountain with a hole through
       * it is not a landslide; what breaks the tone up here is the planting and
       * the roughness, not the tone table. */
      /* And the deep tone keys off **this bore's own crest**, not off a fixed
       * 8.6 m.  A cap stands 3-5 m above the hillside it grows out of, so a
       * threshold tuned to the hill field put the whole of it in the deep tone
       * and the whole of its surroundings in the turf tone -- from directly above
       * the col the mountain read as a separate dark object sitting on the range
       * rather than as part of it.  Keyed to the crest, only the top of the knoll
       * darkens, which is what the hill field does at altitude anyway. */
      const deepAt = groundY(0) + T.crestEnd + 0.8;
      let tone = slope > 1.05 + hash * 0.2 ? 2 : (hAvg + hash * 5 > deepAt ? 1 : 0);
      /* And the plantation floor, on the same rule the hill field uses: a stand
       * that crosses the notch carries its litter across the cap, so the
       * compartment boundary is one line over two different surfaces.  Tested at
       * the cell's centre and not per triangle, for the same reason. */
      if (tone !== 2 && standAt((xa + xb) / 2, (za + zb) / 2)) tone = 3;
      // wound so the normals are up, and split on alternating diagonals like the
      // hill field for the same reason: a uniform diagonal is a visible grain
      if (((i + j) & 1) === 0) {
        tri(pos[tone], A, D, B);
        tri(pos[tone], B, D, C);
      } else {
        tri(pos[tone], A, D, C);
        tri(pos[tone], A, C, B);
      }
    }
  }

  const mm = [hm.grass, hm.grassDeep, hm.earth, hm.litter];
  pos.forEach((list, k) => {
    if (!list.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(list, 3));
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, mm[k]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = 'tunnelCap' + b.T.id + k;
    ctx.add(mesh);
  });
}

/**
 * The shell: what stops the player walking into the mountain, with the bore left
 * open.
 *
 * **It used to be one box over the whole notch**, and that was right for as long
 * as a tunnel was a thing you looked at: `hillAt` answers with the flat grade
 * inside a notch because the field was cut out of it, so without a collider the
 * walker strolls in at ground level and out the other side.  One box also seals
 * the bore, which is the whole of this round's third task.
 *
 * So it is a frame instead -- the notch's four edges, with the two portal planes
 * broken across the arch -- plus a wall down each flank of the bore itself, since
 * the liner is geometry and stops nobody.  The flank on the walkway side is
 * broken at the 待避所 and stepped back to their rear wall, which is what lets a
 * player stand in one.
 *
 * Nothing carries a `bottom`: every piece of this is the inside of a mountain and
 * blocks at every height, which is what a mountain does.
 */
function buildShell(ctx, b, recesses) {
  const { T } = b;
  const s = T.walk;
  const TOP = groundY(0) + T.crestMid + 2;
  // the notch's south and north edges
  ctx.collide(T.x0 - 0.4, T.zS - 0.4, T.x1 + 0.4, T.zS + 0.4, TOP);
  ctx.collide(T.x0 - 0.4, T.zN - 0.4, T.x1 + 0.4, T.zN + 0.4, TOP);
  // the two portal planes, each split across the arch opening
  for (const px of [T.x0, T.x1]) {
    ctx.collide(px - 0.4, T.zS, px + 0.4, -T.half, TOP);
    ctx.collide(px - 0.4, T.half, px + 0.4, T.zN, TOP);
  }
  // the bore's non-walkway flank: one unbroken wall
  ctx.collide(T.x0, -s * T.half, T.x1, -s * (T.half + 0.6), TOP);
  // and the walkway flank, stepped back at each 待避所
  let cursor = T.x0;
  for (const r of recesses) {
    if (r.x0 - cursor > 0.05) ctx.collide(cursor, s * T.half, r.x0, s * (T.half + 0.6), TOP);
    ctx.collide(r.x0, s * (T.half + REC_D), r.x1, s * (T.half + REC_D + 0.6), TOP);
    cursor = r.x1;
  }
  if (T.x1 - cursor > 0.05) ctx.collide(cursor, s * T.half, T.x1, s * (T.half + 0.6), TOP);
}

/* ------------------------------------------------------------------ *
 * The bore.
 * ------------------------------------------------------------------ */

/**
 * Inside profile of the bore, as a list of (z, y) round one half.
 *
 * **A horseshoe.**  Vertical side wall from the invert to the springing line at
 * `spring`, then a quarter of an ellipse of semi-axes (`half`, `arch`) centred on
 * `(0, spring)`.  For the 3.3 / 3.2 / 3.3 this railway uses that ellipse is a
 * circle and the two meet tangentially, but it is written as an ellipse so a
 * flatter arch stays tangential too.
 *
 * The crown is `spring + arch`, which is what `CROWN` has always said it was and
 * what the arch centre was not: see the header.
 */
function boreProfile(T, seg = 10) {
  const pts = [[T.half, 0]];
  for (let k = 0; k <= seg; k++) {
    const a = (k / seg) * (Math.PI / 2);
    pts.push([Math.cos(a) * T.half, T.spring + Math.sin(a) * T.arch]);
  }
  return pts;
}

/**
 * The full section, left wall foot round to right wall foot, as (z, y).
 *
 * **Every station returns the same number of points**, so the sweep between any
 * two of them is a quad strip and a change of section between neighbours becomes
 * a face for free.  That is what builds three separate things with one loop:
 *
 *  - the **ring joints**, by alternating `inset` band by band, so the step
 *    between two rings is swept as a real vertical face rather than drawn as a
 *    line on a cylinder;
 *  - the **待避所**, by moving one side's wall out by `REC_D` below `REC_H` -- the
 *    recess's back wall, its soffit and both its cheeks all fall out of the
 *    strip, and none of them has to be positioned by hand;
 *  - and the lining itself.
 *
 * Points at the same place (a station with no recess repeats its `REC_H` corner)
 * produce zero-area quads, which the sweep drops -- otherwise
 * `computeVertexNormals` hands back NaN for them and poisons the shading of the
 * whole mesh.
 */
function fullProfile(T, { inset = 0, recess = 0, seg = 14 } = {}) {
  const hi = T.half - inset;
  const ai = T.arch - inset;
  const hwL = recess < 0 ? T.half + REC_D : hi;
  const hwR = recess > 0 ? T.half + REC_D : hi;
  const p = [[-hwL, -0.6], [-hwL, REC_H], [-hi, REC_H], [-hi, T.spring]];
  for (let k = 1; k < seg; k++) {
    const a = Math.PI - (k / seg) * Math.PI;
    p.push([Math.cos(a) * hi, T.spring + Math.sin(a) * ai]);
  }
  p.push([hi, T.spring], [hi, REC_H], [hwR, REC_H], [hwR, -0.6]);
  return p;
}

const triArea = (a, c, d) => {
  const ux = c[0] - a[0], uy = c[1] - a[1], uz = c[2] - a[2];
  const vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
  return Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
};

/**
 * The liner, the walkway, the refuges, the services and the lamps.
 *
 * `THREE.DoubleSide` rather than a chosen winding.  The old liner used
 * `BackSide` with a profile that ran crown -> left foot -> right foot -> crown,
 * i.e. across the invert twice and back over the arch, and the fact that it
 * rendered at all was luck.  A section swept as a quad strip has one honest
 * answer and it is not worth a class of bug to save nothing: the shell is inside
 * a mountain, it casts no shadow, and no camera can be outside it.
 */
function buildBore(ctx, b) {
  const { T } = b;
  const m = mats();
  const s = T.walk;                                  // +1 north, -1 south
  const n = Math.max(4, Math.round(b.LEN / RING));
  const step = b.LEN / n;
  /* Which bands carry a 待避所.  Two, and on ring boundaries so each recess is
   * exactly one lining ring long -- which is where a real one is, and which is
   * also what lets the sweep build it.
   *
   * Band 2 and not band 1: at band 1 the recess is three metres from the mouth,
   * so standing in it you are looking straight out at daylight and it reads as a
   * nook by the door rather than as a refuge inside a mountain. */
  const recBands = [2, n - 3];
  const recesses = recBands.map((k) => ({
    x0: T.x0 + step * k, x1: T.x0 + step * (k + 1), mid: T.x0 + step * (k + 0.5),
  }));

  /* ------------------------------- the liner ------------------------------- */
  {
    const stations = [];
    for (let k = 0; k < n; k++) {
      const p = fullProfile(T, {
        inset: (k % 2) * RING_STEP,
        recess: recBands.includes(k) ? s : 0,
      });
      stations.push([T.x0 + step * k, p], [T.x0 + step * (k + 1), p]);
    }
    // reach into the concrete of both 坑門, so the lining is never a free edge
    stations.unshift([T.x0 - PORTAL_T - 0.1, stations[0][1]]);
    stations.push([T.x1 + PORTAL_T + 0.1, stations[stations.length - 1][1]]);

    /* Two tones along the length, so the mouth is not the same value as the far
     * end -- the deep tone starts two rings in, which is about where a real bore
     * stops being lit by the sky behind you.
     *
     * **Two rings and not "5 m"**, which is what it was: a tonal step in the
     * middle of a ring is a hard vertical edge on a smooth wall with nothing to
     * explain it, and from a metre away -- which is where a player now stands --
     * it reads as a pale panel stuck to the lining.  On a joint it reads as the
     * joint it is standing on. */
    const lists = [[], []];
    for (let k = 0; k < stations.length - 1; k++) {
      const [xa, pa] = stations[k];
      const [xb, pb] = stations[k + 1];
      const xm = (xa + xb) / 2;
      const deep = xm > T.x0 + step * 2 && xm < T.x1 - step * 2;
      const list = lists[deep ? 1 : 0];
      for (let i = 0; i < pa.length - 1; i++) {
        const A = [xa, pa[i][1], pa[i][0]];
        const B = [xb, pb[i][1], pb[i][0]];
        const C = [xb, pb[i + 1][1], pb[i + 1][0]];
        const D = [xa, pa[i + 1][1], pa[i + 1][0]];
        if (triArea(A, B, C) < 1e-6 && triArea(A, C, D) < 1e-6) continue;
        list.push(...A, ...B, ...C, ...A, ...C, ...D);
      }
    }
    [m.bore, m.boreDeep].forEach((mat, k) => {
      if (!lists[k].length) return;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(lists[k], 3));
      g.computeVertexNormals();
      const mesh = new THREE.Mesh(g, mat.clone());
      mesh.material.side = THREE.DoubleSide;
      mesh.userData.noOutline = true;
      mesh.castShadow = false;
      mesh.name = 'tunnelBore' + T.id + k;
      ctx.add(mesh);
    });
  }

  /* ------------------------------ the floor -------------------------------
   * The ballast, as two platforms rather than as the geometry it already is.
   *
   * `heightAt` answers with the flat grade in here, so before this the player
   * walked the bore *inside* the ballast prism with the railheads at ankle level
   * -- which nobody had ever seen because until this round there was no way in.
   * Two steps, 0.26 over the sleepers and 0.13 on the shoulder, is the honest
   * shape of a prism a query built out of axis-aligned boxes can hold. */
  for (const [z0, z1, top] of [
    [-TRACK_HALF, TRACK_HALF, BAL_TOP],
    [-BAL_EDGE, -TRACK_HALF + 0.05, BAL_SHOULDER],
    [TRACK_HALF - 0.05, BAL_EDGE, BAL_SHOULDER],
  ]) {
    ctx.platform({ x0: T.x0 - CUT, x1: T.x1 + CUT, z0, z1, top });
  }

  /* ----------------------------- the walkway -----------------------------
   * 1.35 m of it, 0.50 m up, running 3 m past each portal onto the approach so
   * there is somewhere to arrive.  A player standing on it is at |z| >= 2.29
   * after their own 0.34 m radius, against a train body half-width of 1.43 -- so
   * they are 0.86 m clear of it, which is what makes a train passing a metre away
   * the shot it is meant to be rather than a train passing through them. */
  const pw0 = T.x0 - 3.0, pw1 = T.x1 + 3.0;
  const zIn = s * (T.half - PATH_W);          // the track edge of the walkway
  {
    /* Three slabs, and the middle one is **`flat()` and darker**.
     *
     * The liner is unlit on purpose and everything else in here is not, so the
     * first walkway came out as the brightest surface in the frame -- a strip of
     * near-white concrete running through a black hole, brighter than the
     * pavement outside.  There is no occlusion in this pipeline, so a surface
     * inside a mountain has to be *painted* dark or it is lit by the sun.  The
     * two aprons stay `cel()` because they really are in daylight, and the change
     * lands exactly on the portal plane, where a change of light belongs. */
    for (const [a, c, mat] of [
      [pw0, T.x0, m.concreteMid], [T.x0, T.x1, m.boreConc], [T.x1, pw1, m.concreteMid],
    ]) {
      const slab = box(c - a, PATH_Y, PATH_W, mat, (a + c) / 2, PATH_Y / 2, s * (T.half - PATH_W / 2));
      slab.receiveShadow = true;
      slab.name = 'boreWalkway' + T.id;
      ctx.add(slab);
    }
    ctx.platform({
      x0: pw0, x1: pw1,
      z0: Math.min(zIn, s * T.half), z1: Math.max(zIn, s * T.half), top: PATH_Y,
    });
    // the upstand along its track edge -- drawn, not collided: a 1.35 m walkway
    // with 0.34 m taken off each side by a kerb collider is 0.67 m of it left
    for (const [a, c, mat] of [
      [pw0, T.x0, m.concrete], [T.x0, T.x1, m.boreLip], [T.x1, pw1, m.concrete],
    ]) {
      const lip = box(c - a, 0.12, 0.11, mat, (a + c) / 2, PATH_Y + 0.03, zIn + s * 0.055);
      lip.receiveShadow = true;
      ctx.add(lip);
    }

    // 待避所 floors, out to the recess's back wall
    for (const r of recesses) {
      ctx.add(box(r.x1 - r.x0, PATH_Y, REC_D, m.boreConc,
        r.mid, PATH_Y / 2, s * (T.half + REC_D / 2)));
      ctx.platform({
        x0: r.x0, x1: r.x1,
        z0: Math.min(s * T.half, s * (T.half + REC_D)),
        z1: Math.max(s * T.half, s * (T.half + REC_D)), top: PATH_Y,
      });
    }
  }

  /* three treads down to the lineside at each end, so the walkway is reachable
   * from the ballast without a 0.5 m hop */
  for (const side of [-1, 1]) {
    // 1.0 and not 1.05: three 0.35 m treads take exactly 1.05, so the top tread
    // would *meet* the walkway platform rather than overlap it, and a few
    // centimetres of gap between two platforms is a hole the player falls through
    const foot = side < 0 ? pw0 - 1.0 : pw1 + 1.0;
    steps(ctx, {
      x: foot, z: s * (T.half - PATH_W / 2), axis: 'x', dir: -side,
      n: 3, rise: PATH_Y / 3, run: 0.35, w: PATH_W, y: 0, mat: m.concreteMid,
    });
  }

  /* -------------------------- handrail and services -------------------------- */
  {
    const parts = [];
    const zRail = s * (T.half - 0.20);
    // the handrail, broken at each refuge so you can step into one
    const spans = [];
    let cursor = pw0 + 0.4;
    for (const r of recesses) { spans.push([cursor, r.x0 - 0.2]); cursor = r.x1 + 0.2; }
    spans.push([cursor, pw1 - 0.4]);
    for (const [a, c] of spans) {
      if (c - a < 0.8) continue;
      for (let x = a; x <= c + 1e-6; x += 2.6) {
        parts.push({ geometry: new THREE.CylinderGeometry(0.035, 0.035, 1.05, 6), matrix: trs(x, PATH_Y + 0.52, zRail) });
        ctx.collide(x - 0.05, zRail - 0.05, x + 0.05, zRail + 0.05, PATH_Y + 1.05, PATH_Y, true);
      }
      parts.push({
        geometry: new THREE.CylinderGeometry(0.04, 0.04, c - a, 6),
        matrix: trs((a + c) / 2, PATH_Y + 1.02, zRail, 0, 0, Math.PI / 2),
      });
      /* 0.20 m, not 0.18: check 15's handrail median is the 0.18 m
       * street rails, and this walkway sits 0.5 m up. */
      ctx.collide(a, zRail - 0.05, c, zRail + 0.05, PATH_Y + 1.07, PATH_Y + 0.97, true);
    }
    // flat, for the same reason the walkway is: a `cel()` handrail inside an
    // unlit bore is the brightest thing in the frame
    const r = new THREE.Mesh(bake(parts), m.boreRail);
    r.castShadow = false;
    ctx.add(r);
  }
  {
    /* Cable troughing and ducting on the **non-walkway** wall, where you see it
     * across the bore rather than walk into it, and the drainage channel at its
     * foot.  Both are what a lining actually carries, and both give the far wall
     * two horizontal lines -- which is the only thing stopping 30 m of dark
     * plaster reading as a painted backdrop. */
    const zw = -s * (T.half - 0.09);
    const parts = [];
    for (const y of [1.52, 1.78]) {
      parts.push({ geometry: new THREE.BoxGeometry(b.LEN - 0.4, 0.16, 0.13), matrix: trs(b.mid, y, zw) });
    }
    for (let x = T.x0 + 1.2; x < T.x1; x += 3.0) {
      parts.push({ geometry: new THREE.BoxGeometry(0.07, 0.42, 0.2), matrix: trs(x, 1.65, zw - s * 0.05) });
    }
    const t = new THREE.Mesh(bake(parts), m.metalDark);
    t.castShadow = false;
    t.userData.noOutline = true;
    ctx.add(t);

    const zc = -s * (T.half - 0.3);
    const ch = box(b.LEN, 0.14, 0.42, m.boreFloor, b.mid, 0.07, zc);
    ctx.add(ch);
    const cov = [];
    for (let x = T.x0 + 0.5; x < T.x1 - 0.3; x += 1.2) {
      cov.push({ geometry: new THREE.BoxGeometry(0.9, 0.05, 0.44), matrix: trs(x, 0.16, zc) });
    }
    const cm = new THREE.Mesh(bake(cov), m.boreRib);
    cm.userData.noOutline = true;
    ctx.add(cm);
  }

  /* ------------------------------- the lamps -------------------------------
   * Nine metres apart, alternating walls, at 2.95 -- just under the springing so
   * the shade sits on the vertical wall and not on the curve.  Each one is a
   * dark hood, an emissive face under it and a pale pool on the wall below,
   * because there is no lighting model in here at all: the liner is `flat()` and
   * unlit on purpose, so light has to be drawn. */
  {
    const hoods = [];
    const faces = [];
    const pools = [];
    const disc = new THREE.CircleGeometry(1, 14);
    disc.rotateX(-Math.PI / 2);
    const wallGlow = new THREE.CircleGeometry(0.62, 14);
    let side = 1;
    /* Every 6 m, not every 9, and the fitting is 0.66 m rather than 0.42.
     * The `crow` lesson at the other end of the scale: a 0.42 m warm strip seen
     * down a 30 m unlit bore is two pixels, so the first pass rendered as an
     * empty black tube with one yellow speck in it.  What has to read at twenty
     * metres is the *lit fitting*, so it is sized for twenty metres. */
    for (let x = T.x0 + 3.0; x < T.x1 - 1.0; x += 6.0) {
      const zw = side * s * (T.half - 0.06);
      const nrm = -side * s;                            // inward, toward the track
      hoods.push({ geometry: new THREE.BoxGeometry(0.78, 0.16, 0.3), matrix: trs(x, 3.05, zw + nrm * 0.15) });
      hoods.push({ geometry: new THREE.BoxGeometry(0.12, 0.2, 0.2), matrix: trs(x, 3.13, zw + nrm * 0.06) });
      faces.push({ geometry: new THREE.BoxGeometry(0.66, 0.1, 0.22), matrix: trs(x, 2.92, zw + nrm * 0.16) });
      /* Spill, and it goes on the **floor**, not on the wall.
       *
       * The first version was a 1.5 x 2.1 quad of 16 % warm hung on the lining
       * under each fitting, and from ten metres away that is a tan card taped to
       * the wall -- the `makeBins` crow-net mistake, in light instead of mesh: a
       * translucent rectangle with nothing behind it to explain its shape reads
       * as an object.  A pool on the ground under a lamp explains itself, and a
       * short 0.9 x 0.55 patch right at the fitting is all the wall needs. */
      pools.push({
        geometry: disc,
        matrix: trs(x, side * s > 0 ? PATH_Y + 0.02 : BAL_SHOULDER + 0.02,
          zw + nrm * 0.9, 0, 0, 0, 1.5, 1, 0.95),
      });
      // a **disc** on the wall, not a rectangle: at a metre a translucent
      // rectangle with nothing behind it reads as a poster taped to the lining
      pools.push({
        geometry: wallGlow,
        matrix: trs(x, 2.5, zw + nrm * 0.03, 0, nrm > 0 ? 0 : Math.PI, 0, 1, 0.8, 1),
      });
      side = -side;
    }
    const h = new THREE.Mesh(bake(hoods), m.lampBody);
    h.castShadow = false;
    ctx.add(h);
    const f = new THREE.Mesh(bake(faces), m.lamp);
    f.userData.noOutline = true;
    ctx.add(f);
    const p = new THREE.Mesh(bake(pools), flat({
      color: PAL.lanternLit, transparent: true, opacity: 0.17,
      depthWrite: false, side: THREE.DoubleSide, cache: false,
    }));
    p.userData.noOutline = true;
    p.renderOrder = 1;
    ctx.add(p);
    disc.dispose();
    wallGlow.dispose();
  }

  /* --------------------------- plates on the lining ---------------------------
   * Read from two metres, which is a distance nothing in this world was signed
   * for until a player could walk in here.  距離標, a lining-ring number, the
   * 保守用通路 plate at the walkway's head, and a 待避所 plate in each refuge. */
  {
    const plateAt = (x, z, ry, map, w, h, y) => {
      const g = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, 0.04),
        [flat({ color: PAL.wallGray }), flat({ color: PAL.wallGray }),
         flat({ color: PAL.wallGray }), flat({ color: PAL.wallGray }),
         flat({ color: 0xffffff, map, cache: false }), flat({ color: PAL.wallGray })]
      );
      g.position.set(x, y, z);
      g.rotation.y = ry;
      ctx.add(g);
    };
    const inward = -s;                                  // the wall faces the track
    const zw = s * (T.half - 0.05);
    const ry = inward > 0 ? 0 : Math.PI;
    plateAt(T.x0 + 2.2, zw, ry, borePlate(2), 0.72, 0.36, 1.95);
    plateAt(b.mid, zw, ry, borePlate(0), 0.58, 0.29, 1.72);
    plateAt(b.mid + RING, zw, ry, borePlate(1), 0.46, 0.23, 1.72);
    for (const r of recesses) {
      // in the recess, on its back wall, so it is read from inside
      plateAt(r.mid, s * (T.half + REC_D - 0.05), ry, railPlate(2), 0.54, 0.4, 1.9);
      plateAt(r.mid + 0.75, s * (T.half + REC_D - 0.05), ry, borePlate(3), 0.5, 0.25, 1.45);
    }
  }

  /* -------------------------- the overhead line --------------------------
   * A real electrified tunnel does not hang a messenger wire from the crown on
   * droppers, it carries it on cantilever brackets off the arch -- and there is a
   * wire coming through here regardless, because the catenary circles the planet.
   *
   * **The brackets are at the wire, not under the crown.**  They used to be at
   * `CROWN - 0.55` and `CROWN - 0.32`, which was 5.95 and 6.18 -- correct numbers
   * derived from a crown that the profile bug had actually put at 3.20, so the
   * whole assembly hung 2.75 m inside solid rock.  With the section fixed they
   * land where they were always meant to: an arm rising to an insulator that
   * holds the messenger at 5.95, with 0.55 m of crown above it. */
  {
    const parts = [];
    const zw = -s * (T.half - 0.12);              // the wall the bracket is fixed to
    const zEnd = -s * 0.35;                       // where it hands over to the insulator
    const armLen = Math.abs(zw - zEnd);
    for (let x = T.x0 + 3.0; x < T.x1; x += 6.0) {
      /* `rx = PI/2`, not `rz`.  A `CylinderGeometry`'s axis is +y, so an arm
       * running along z is turned about X -- turned about Z it becomes a 2.8 m
       * column standing across the bore, which is exactly what the trolley bay's
       * guide rails did in 七丁目. */
      parts.push({
        geometry: new THREE.CylinderGeometry(0.05, 0.06, armLen, 6),
        matrix: trs(x, 5.44, (zw + zEnd) / 2, Math.PI / 2, 0, 0),
      });
      parts.push({ geometry: new THREE.BoxGeometry(0.1, 0.7, 0.1), matrix: trs(x, 5.1, zw) });
      parts.push({ geometry: new THREE.CylinderGeometry(0.07, 0.07, 0.4, 8), matrix: trs(x, 5.72, zEnd) });
      parts.push({ geometry: new THREE.BoxGeometry(0.16, 0.08, 0.5), matrix: trs(x, 5.93, -s * 0.18) });
    }
    const br = new THREE.Mesh(bake(parts), m.metalDark);
    br.userData.noOutline = true;
    br.castShadow = false;
    ctx.add(br);
  }

  return recesses;
}

/* ------------------------------------------------------------------ *
 * The clearance check.
 * ------------------------------------------------------------------ */

/**
 * Minimum gap between the lining and the train's own envelope, in metres.
 *
 * The only way to check this.  A rendered frame of a tunnel mouth looks exactly
 * the same whatever the ceiling is doing, and for the whole life of the first
 * bore the ceiling was at 3.20 m with the messenger wire 2.78 m inside it.
 *
 * The envelope is read off `train.js` and `railway.js` rather than assumed:
 * body 2.86 wide to y 3.96, roof pods 1.5 wide to 4.24, the pantograph's base
 * plate 1.5 wide at 4.03, its pan head 1.34 wide at 4.88, and the contact and
 * messenger wires on the centre line at 4.88 and 5.95 with their own radii.
 *
 *     window.__scene.world && (await import('/src/world/tunnel.js')).boreClearance()
 */
export function boreClearance() {
  const out = [];
  for (const b of BORES) {
    const { T } = b;
    const prof = boreProfile(T, 96);
    // the highest lining y available at a given |z|, or -Infinity outside the bore
    const roof = (z) => {
      z = Math.abs(z);
      if (z > T.half + 1e-9) return -Infinity;
      let best = -Infinity;
      for (let k = 0; k < prof.length - 1; k++) {
        const [z0, y0] = prof[k];
        const [z1, y1] = prof[k + 1];
        const lo = Math.min(z0, z1), hi = Math.max(z0, z1);
        if (z < lo - 1e-9 || z > hi + 1e-9) continue;
        const t = Math.abs(z1 - z0) < 1e-9 ? 0 : (z - z0) / (z1 - z0);
        best = Math.max(best, y0 + (y1 - y0) * t);
      }
      return best;
    };
    const env = [];
    const span = (halfW, y, what, dz = 0.04) => {
      for (let z = -halfW; z <= halfW + 1e-9; z += dz) env.push([z, y, what]);
      env.push([halfW, y, what]);
    };
    span(1.43, 3.96, 'body roof');
    for (const z of [-1.43, 1.43]) for (let y = 0.3; y <= 3.96; y += 0.08) env.push([z, y, 'body side']);
    span(0.93, 4.24, 'roof pod');
    span(0.75, 4.03, 'pantograph base');
    span(0.67, 4.905, 'pantograph head');
    for (const z of [-0.026, 0.026]) env.push([z, 5.976, 'messenger wire']);
    for (const z of [-0.042, 0.042]) env.push([z, 4.902, 'contact wire']);
    let worst = Infinity, at = null;
    for (const [z, y, what] of env) {
      const lim = roof(z);
      const gap = lim - y;
      if (gap < worst) { worst = gap; at = { z: +z.toFixed(3), y: +y.toFixed(3), what, lining: +lim.toFixed(3) }; }
    }
    out.push({
      bore: T.id, crown: +roof(0).toFixed(3), springing: T.spring,
      minGap: +worst.toFixed(3), at,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * The portals.
 * ------------------------------------------------------------------ */

/**
 * One portal.
 *
 * `side` is -1 for the west face (its outer surface at `T.x0`, body inward
 * toward +x) and +1 for the east.
 *
 * The face is one `ExtrudeGeometry`: the outline's top edge is `capAt` sampled at
 * the same spacing the cap mesh uses, so the two share their vertices in z and
 * the cap's cut edge is closed by construction rather than by a wall being
 * generously oversized.  The hole is the bore profile plus the lining thickness.
 *
 * Shape space is (a, b) = (z, y) and the extrusion runs along the shape's own +z,
 * so `rotateY(-PI/2)` maps a -> world z and the extrusion -> world -x.  The
 * geometry therefore lands in x ∈ [-depth, 0] and is translated from there,
 * which is the only reason the two portals differ by more than a sign.
 */
function buildPortal(ctx, b, side) {
  const { T } = b;
  const m = mats();
  const px = side < 0 ? T.x0 : T.x1;
  const g = new THREE.Group();
  g.name = 'tunnelPortal' + T.id + (side < 0 ? 'W' : 'E');
  ctx.add(g);

  /* --- the face ---
   * Clipped in z to where the knoll actually stands above the terrain, extended
   * one step each side.  Beyond that the cap and the hill mesh share an edge
   * exactly (the Coons patch reproduces the boundary curve) so there is nothing
   * to close and nothing to build: the mountain simply continues. */
  const zs = [];
  {
    let zA = T.zN, zB = T.zS;
    for (let k = 0; k <= b.nz; k++) {
      const z = T.zS + k * b.ZSTEP;
      if (capAt(b, px, z) - patchAt(b, px, z) > 0.12) { zA = Math.min(zA, z); zB = Math.max(zB, z); }
    }
    zA = Math.max(T.zS, zA - b.ZSTEP);
    zB = Math.min(T.zN, zB + b.ZSTEP);
    for (let z = zA; z <= zB + 1e-6; z += b.ZSTEP) zs.push(z);
  }
  /* Where the coping sits, which is also where the concrete stops and the cut
   * slope starts.  The first version ran the concrete all the way up to the cap's
   * own edge, and because that edge is the knoll's bell the portal came out as a
   * 13 m grey tent -- a shape no portal has ever had.  A 坑門 is a wall with a
   * horizontal top and an earth slope above it, so the face is built as two
   * extrusions from the same two profiles, split at this line.
   *
   * **`CROWN + 2.6` and not `+ 1.9`.**  With the section bug in place the crown
   * was at 3.20, so 1.9 above it was a comfortable 5.1 and the 扁額 had room; with
   * the arch where it belongs, 1.9 puts the coping 1.48 m over the extrados and
   * the name stone overlapping the arch ring.  2.6 gives 2.18 m of wall above the
   * ring, which is the proportion a 坑門 actually has. */
  const copeY = Math.min(groundY(0) + capAt(b, px, T.zCrest) - 0.55, b.CROWN + 2.6);
  const outX = side < 0 ? px - 0.02 : px + 0.02;      // just proud of the face
  const nrm = side < 0 ? -1 : 1;
  /* How far the coping runs: to where the wall actually *reaches* it, not to a
   * fixed half-width.  The lens narrows with height, so a 14 m coping on a wall
   * that is only 9 m wide up there hangs a metre and a half out into thin air at
   * each end -- which it did, and it read as a diving board. */
  const copeHalf = (() => {
    let h = 0;
    // sampled at 0.4 m, not at the face's own 2 m: quantising this to the shape's
    // z spacing put the coping's end up to two metres past the wall
    for (let z = T.zS; z <= T.zN; z += 0.4) {
      if (groundY(z) + capAt(b, px, z) > copeY + 0.03) h = Math.max(h, Math.abs(z));
    }
    return Math.min(WALL_HALF, h);
  })();

  {
    /* The bottom edge follows the *hillside's* profile half a metre under it, so
     * the wall is buried where the mountain already covers it and only shows
     * where it is doing work.  A straight bottom edge is what turned the first
     * version into 39 m of exposed concrete. */
    const botRaw = (z) => groundY(z) + Math.min(patchAt(b, px, z), 0) - 0.55;
    const top = (z) => groundY(z) + capAt(b, px, z);
    const base = botRaw(0);
    /* **The outer contour is held 0.45 m below the arch hole's own base**, and
     * that is not tidiness -- it is the whole of a bug that put a wedge of stray
     * concrete across the mouth of all four portals.
     *
     * `base` is `botRaw(0)`, and `botRaw` is flat at that value right across the
     * railway corridor, so the hole's bottom edge lay *exactly on* the shape's
     * bottom edge over the whole 7.4 m of the arch.  `ShapeUtils.triangulateShape`
     * cannot separate a hole from a contour it is coincident with: it emitted four
     * triangles spanning from (y -1.8, z -5) to (y 3.7, z 11), i.e. straight across
     * the opening.  From outside it is a sliver at the foot of the arch and easy
     * to read as the cutting beyond; from *inside* -- which is new this round --
     * it is a pale wedge filling half the frame.
     *
     * The extra 0.45 m of wall is below the invert and buried. */
    const bot = (z) => Math.min(botRaw(z), base) - 0.45;
    const hw = T.half + LINER_T;
    const hr = T.arch + LINER_T;

    const emit = (lo, hi, mat, name, hole) => {
      const zz = zs.filter((z) => hi(z) - lo(z) > 0.05);
      if (zz.length < 2) return null;
      const shape = new THREE.Shape();
      shape.moveTo(zz[0], lo(zz[0]));
      for (const z of zz) shape.lineTo(z, lo(z));
      for (let k = zz.length - 1; k >= 0; k--) shape.lineTo(zz[k], hi(zz[k]));
      shape.closePath();
      if (hole) shape.holes.push(hole);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: PORTAL_T, bevelEnabled: false });
      geo.rotateY(-Math.PI / 2);
      geo.translate(side < 0 ? px + PORTAL_T : px, 0, 0);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.name = name;
      g.add(mesh);
      return mesh;
    };

    /* The arch, as a hole in the concrete: side walls up to the springing, then
     * the arch on the *springing line*.  Same fix as `boreProfile` and the same
     * bug -- this path had the identical `T.spring - T.half` expression in it, so
     * the opening was 3.62 m tall and the lining behind it 3.20.  A train fits
     * through neither. */
    const hole = new THREE.Path();
    hole.moveTo(-hw, base);
    hole.lineTo(-hw, T.spring);
    for (let k = 0; k <= 14; k++) {
      const a = Math.PI - (k / 14) * Math.PI;
      hole.lineTo(Math.cos(a) * hw, T.spring + Math.sin(a) * hr);
    }
    hole.lineTo(hw, base);
    hole.closePath();

    const wall = emit(bot, (z) => Math.min(top(z), copeY), m.face, 'portalFace', hole);
    if (wall) hullOutline(wall, { thickness: 0.0028 });
    /* The 法面 above the coping.
     *
     * **In the hills' own green, not in concrete or in earth.**  Both were tried:
     * concrete makes the portal a 13 m grey monolith, and bare earth makes it a
     * sand dune sitting on a green hill.  What the brief actually asks for is for
     * the mouth to be *set into the hillside*, so the slope above the coping is
     * the hillside -- the same tone the cap is drawn in -- and its shape comes
     * from the cap's own roughness rather than from bands drawn across it. */
    emit((z) => copeY, top, hillMats().grassDeep, 'portalSlope', null);
  }

  /* --- the arch ring (迫石), proud of the face ---
   * Overlapping voussoirs, not abutting ones: at 16 stones round a 12.4 m
   * half-arch a 0.62 m stone leaves 0.16 m of daylight between each pair and the
   * ring reads as a row of separate blocks floating off the face.  0.92 long at
   * the same spacing overlaps by a sixth, which is what a ring of dressed stone
   * actually looks like. */
  {
    const parts = [];
    const hw = T.half + LINER_T;
    const hr = T.arch + LINER_T;
    const N = 18;
    for (let k = 0; k < N; k++) {
      const a = Math.PI - ((k + 0.5) / N) * Math.PI;
      const zz = Math.cos(a) * (hw + 0.2);
      const yy = T.spring + Math.sin(a) * (hr + 0.2);
      parts.push({
        geometry: new THREE.BoxGeometry(0.2, 0.46, 0.92),
        matrix: trs(outX + nrm * 0.1, yy, zz, -a + Math.PI / 2, 0, 0),
      });
    }
    // the springing courses, down each side wall to the invert
    for (const sgn of [-1, 1]) {
      parts.push({
        geometry: new THREE.BoxGeometry(0.2, T.spring + 0.2, 0.46),
        matrix: trs(outX + nrm * 0.1, (T.spring + 0.2) / 2, sgn * (hw + 0.2)),
      });
    }
    const ring = new THREE.Mesh(bake(parts), m.ring);
    ring.castShadow = ring.receiveShadow = true;
    g.add(ring);
  }

  /* --- 笠石: the coping across the top of the concrete face, and the 扁額 --- */
  {
    const cape = box(0.94, 0.32, copeHalf * 2, m.coping, outX + nrm * 0.2, copeY, 0);
    // a 0.2 m overhang is two texels of this cascade; its own shadow would be
    // sawtooth along the face rather than a line -- the `wallRun` lesson
    cape.castShadow = false;
    cape.receiveShadow = true;
    g.add(cape);
    g.add(box(0.66, 0.14, copeHalf * 2 - 0.6, m.faceDark, outX + nrm * 0.16, copeY - 0.24, 0));

    // the name stone, set into the face just under the coping
    const map = b.plate();
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(0.13, 0.66, 2.7),
      [flat({ color: 0xffffff, map, cache: false }),
       flat({ color: 0xffffff, map, cache: false }),
       flat({ color: PAL.wallGray }), flat({ color: PAL.wallGray }),
       flat({ color: PAL.wallGray }), flat({ color: PAL.wallGray })]
    );
    plate.position.set(outX + nrm * 0.07, copeY - 0.72, 0);
    plate.castShadow = true;
    g.add(plate);
    hullOutline(plate, { thickness: 0.003 });
  }

  /* --- the pilasters either side of the arch, and the weep holes ---
   * Two proud piers rather than a field of horizontal bands.  The bands were the
   * first attempt and at any distance they aliased into a field of speckle over
   * the whole face; two 0.6 m piers and four weep holes give the same "this is
   * cast concrete, not a card" reading and survive being twenty metres away. */
  {
    const parts = [];
    for (const sgn of [-1, 1]) {
      const pz = sgn * (T.half + LINER_T + 1.05);
      parts.push({
        geometry: new THREE.BoxGeometry(0.24, copeY - 0.3, 0.62),
        matrix: trs(outX + nrm * 0.12, (copeY - 0.3) / 2, pz),
      });
      parts.push({
        geometry: new THREE.BoxGeometry(0.34, 0.18, 0.78),
        matrix: trs(outX + nrm * 0.17, copeY - 0.36, pz),
      });
    }
    for (const dz of [-5.6, -4.6, 4.6, 5.6]) {
      parts.push({
        geometry: new THREE.CylinderGeometry(0.085, 0.085, 0.34, 8),
        matrix: trs(outX + nrm * 0.06, 0.78, dz, 0, 0, Math.PI / 2),
      });
    }
    const pil = new THREE.Mesh(bake(parts), m.faceDark);
    pil.castShadow = pil.receiveShadow = true;
    g.add(pil);
  }

  /* --- wing walls (翼壁), splaying back into the cutting from each end of the
   * face.  Stepped tops, because a wing wall follows the slope it retains and a
   * raked one would need its own geometry for nothing. */
  for (const sgn of [-1, 1]) {
    const parts = [];
    for (let k = 0; k < 3; k++) {
      const wz = sgn * (WALL_HALF + 0.55 + k * 1.5);
      const wx = px - nrm * (0.55 + k * 1.2);
      const h = Math.max(1.5, 4.4 - k * 1.0);
      parts.push({
        geometry: new THREE.BoxGeometry(1.35, h, 1.62),
        matrix: trs(wx, groundY(wz) + h / 2 - 0.45, wz),
      });
      parts.push({
        geometry: new THREE.BoxGeometry(1.55, 0.15, 1.8),
        matrix: trs(wx, groundY(wz) + h - 0.38, wz),
      });
      ctx.collide(wx - 0.78, wz - 0.9, wx + 0.78, wz + 0.9, groundY(wz) + h - 0.3);
    }
    const wall = new THREE.Mesh(bake(parts), m.faceDark);
    wall.castShadow = wall.receiveShadow = true;
    g.add(wall);
  }

  return g;
}

/* ------------------------------------------------------------------ *
 * The approach cuttings.
 * ------------------------------------------------------------------ */

/**
 * What the notch leaves behind outside the portals, and the drainage that goes
 * with it.
 *
 * The hill field's own cells stop at |z| = 9.5 through an approach, because the
 * railway corridor holds the ground flat inside that -- so the ground beside the
 * track already falls away to the flat, and what a cutting actually needs is not
 * earthworks but the things that make it read as one: a retaining kerb at the toe
 * of each bank, a channel with gully covers, cable troughing, and a fence on the
 * crest.
 *
 * **Which banks get one is per-bore.**  ひばり山's spur has its mass entirely
 * north, so a kerb on the south side is a 0.7 m wall standing on a flat field
 * with nothing behind it to retain -- from the railside viewpoint it read as a
 * long grey slab across the bottom of every frame, in front of the portal.  東山
 * is a col and is cut on both banks, and there the same kerb is correct on both.
 */
function buildCuttings(ctx, b) {
  const { T } = b;
  const m = mats();
  const gm = groundMats();

  /* The lineside fence on the bore's *outer* approach, which `railway.js` does
   * not reach: its runs are cut by every bore, so the ground beyond the far
   * portal has no fence of its own and a player can walk onto the running line
   * from it.  A real railway fences its cuttings. */
  {
    // outward from the town, which is the end `railway.js`'s runs never reach
    const dir = Math.sign(b.mid);
    const from = dir < 0 ? T.x0 - 18 : T.x1 + 0.6;
    const to = dir < 0 ? T.x0 - 0.6 : T.x1 + 18;
    const parts = [];
    for (const zf of [TRACK_HALF + 1.05, -(TRACK_HALF + 1.05)]) {
      for (let x = from; x <= to; x += 2.4) {
        parts.push({ geometry: new THREE.BoxGeometry(0.07, 1.12, 0.07), matrix: trs(x, 0.56, zf) });
        ctx.collide(x - 0.05, zf - 0.05, x + 0.05, zf + 0.05, 1.12, 0, true);
      }
      for (const yy of [0.55, 1.02]) {
        parts.push({ geometry: new THREE.BoxGeometry(to - from, 0.06, 0.06), matrix: trs((from + to) / 2, yy, zf) });
        ctx.collide(from, zf - 0.04, to, zf + 0.04, yy + 0.05, yy - 0.05, true);
      }
      for (let x = from + 0.3; x <= to; x += 0.32) {
        parts.push({ geometry: new THREE.BoxGeometry(0.035, 0.5, 0.035), matrix: trs(x, 0.78, zf) });
      }
    }
    const f = new THREE.Mesh(bake(parts), m.metal);
    f.castShadow = true;
    f.name = 'tunnelOuterFence' + T.id;
    ctx.add(f);
  }

  const banks = T.bank === 0 ? [1, -1] : [T.bank];
  for (const side of [-1, 1]) {
    const px = side < 0 ? T.x0 : T.x1;
    const dir = side < 0 ? -1 : 1;                 // outward from the mountain
    const x0 = Math.min(px, px + dir * CUT);
    const x1 = Math.max(px, px + dir * CUT);

    for (const bz of banks) {
      const zf = bz * (TRACK_HALF + 3.5);
      /* The kerb is broken wherever the bore's own access path crosses it.  A
       * 0.65 m collider on flat ground is over the 0.38 m step limit and is
       * therefore a wall, which is fine when it is retaining a bank and fatal
       * when it is standing between the field and the only gate. */
      const kerb = box(x1 - x0, 0.55, 0.34, m.faceDark, (x0 + x1) / 2, 0.28, zf);
      kerb.castShadow = kerb.receiveShadow = true;
      ctx.add(kerb);
      ctx.add(box(x1 - x0, 0.1, 0.48, m.concrete, (x0 + x1) / 2, 0.6, zf));
      ctx.collide(x0, zf - 0.23, x1, zf + 0.23, 0.65);

      // the channel behind it, with covers
      const ch = box(x1 - x0, 0.16, 0.44, gm.concreteMid, (x0 + x1) / 2, 0.08, zf + bz * 0.5);
      ch.receiveShadow = true;
      ctx.add(ch);
      const covers = [];
      for (let x = x0 + 0.6; x < x1 - 0.4; x += 1.4) {
        covers.push({ geometry: new THREE.BoxGeometry(1.1, 0.06, 0.46), matrix: trs(x, 0.19, zf + bz * 0.5) });
      }
      const cm = new THREE.Mesh(bake(covers), cel({ color: PAL.drain, bands: 3, tint: 0x5d5878 }));
      cm.receiveShadow = true;
      ctx.add(cm);

      /* the fence on the crest of the bank.  It follows the hill field rather
       * than a fixed height, because the bank is 10 m at the portal and nothing
       * fifteen metres out -- one straight run would float at one end and be
       * buried at the other.
       *
       * **12.8 and not 10.5.**  Measured off the profile rather than assumed: the
       * west bore's north bank rises from z = 7 to its crest at 12.4 and then
       * flattens, so 10.5 stood the fence two thirds of the way *up the face*.
       * Nothing showed it while the face was a bare tan plane -- a fence on an
       * unmarked slope has no line to be off -- and the moment the crib went on
       * it was a crest fence with three rows of concrete frame above it.  A
       * cutting fences its crest, which is where the ground stops falling into
       * the railway. */
      const cz = bz * 12.8;
      for (let k = 0; k < 5; k++) {
        const fa = x0 + ((x1 - x0) * k) / 5;
        const fb = x0 + ((x1 - x0) * (k + 1)) / 5;
        const y = ctx.groundAt((fa + fb) / 2, cz);
        if (y < 1.2) continue;
        meshFence(ctx, {
          axis: 'x', at: cz, from: fa, to: fb, y, h: 1.3, spacing: 1.6,
          meshColor: 0xa8b4bc, collide: false,
        });
      }
    }
    // cable troughing, the concrete boxes that follow every line in Japan
    for (const sz of [-1, 1]) {
      const tr = [];
      const zt = sz * (TRACK_HALF + (sz > 0 ? 4.65 : 3.2));
      for (let x = x0 + 0.4; x < x1 - 0.2; x += 1.0) {
        tr.push({ geometry: new THREE.BoxGeometry(0.94, 0.26, 0.34), matrix: trs(x, 0.13, zt) });
      }
      const tm = new THREE.Mesh(bake(tr), gm.concreteMid);
      tm.castShadow = tm.receiveShadow = true;
      ctx.add(tm);
    }
  }
}

/* ------------------------------------------------------------------ *
 * 法枠工 -- the crib on the cut faces.
 * ------------------------------------------------------------------ */

/**
 * The one thing every Japanese railway cutting has and this one did not.
 *
 * The measurement that asks for it: `plantRange` rejects any candidate on ground
 * steeper than 0.9, and **every engineered face in this world is steeper than
 * that by construction** -- `slopeLimitAt` allows 1.9 inside the two ring
 * corridors on purpose, because a cutting is steep and that is what a cutting is.
 * So the approach banks, the col's ridge and the knoll's flanks were the only
 * places in the world with nothing on them at all, and `faceTone` painted the lot
 * `hillEarth`: 45 % of the overlook's frame, 60 % of the gate's and a third of the
 * railside spot's, in one flat tan.
 *
 * `dressFaces` scatters scrub over them and it is not the answer, for the reason
 * the brief gives: the problem is not that the face is empty, it is that the face
 * has **no scale and no evidence of anybody** on it.  Sixty more shrubs is sixty
 * more objects of unknown size on an unknown slope.  A 2 m grid of shallow
 * concrete beams with grass in the cells gives it both at once -- a module the eye
 * can count, and the unmistakable mark of a cutting that was cut rather than a
 * hillside that happens to be steep.
 *
 * Three things are load-bearing and none of them is obvious:
 *
 *   - **The rows are spaced along the slope, not in plan.**  A face here runs at
 *     1.55-1.9, so a 2.2 m plan spacing is 3.6-4.4 m of actual concrete and the
 *     grid comes out as letterbox cells that get taller as the bank steepens.
 *     Each column is *marched* outward from the toe accumulating arc length, and a
 *     row goes in every 2.2 m of it.  Which also means a column carries as many
 *     rows as its own bank is long, so the frame simply stops where the bank dies
 *     instead of being stretched over it.
 *   - **A beam that runs across the slope is not as wide as its plan width.**  Lay
 *     a contour beam 0.34 m wide in plan on a 1.9 face and it is 0.74 m wide on
 *     the ground -- twice the section, and the cells shrink to match.  The plan
 *     half-width is divided by `hypot(1, g·n)`, the directional derivative across
 *     the beam, so every member is 0.34 m on the slope whichever way it runs.
 *     Exactly the same class of error as a raked stair's `rake`: the geometry has
 *     to be derived from the surface, not written in the plane and hoped for.
 *   - **The cells are re-skinned green.**  The crib is `植生基材吹付` -- the cells
 *     are seeded, and the whole point of a green face inside a concrete frame is
 *     that it is not tan.  Laying the infill as one lifted surface with a skirt is
 *     the same construction `hillPath` uses, for the same reason: 45 mm of
 *     clearance and a 0.30 m skirt is honest where a facet bulges, and a bare
 *     plane at the same height would z-fight.
 *
 * Deliberately **not** here: the 練石積み / ブロック積み toe wall the brief offers
 * as an option.  There is already 0.55 m of retaining kerb and a lined channel
 * along the foot of every one of these faces, so a two-metre block band above it
 * would read as a wall with a hillside behind it -- and it would eat the bottom
 * third of the very area the crib is here to stop being tan.  What the toe gets
 * instead is a heavier 小口止め beam, which is what actually holds a crib down.
 *
 * Nothing here casts a shadow.  A 0.19 m step is one or two texels at this
 * cascade and its own shadow lands as a row of sawtooth triangles along the face
 * rather than as a line -- the same call `wallRun` makes for a thin coping.  The
 * beams read entirely off their own side faces, which are near vertical against a
 * 1.6 slope and therefore two cel bands away from it.
 */
const CRIB = {
  /** Where the toe sits, as an offset outside `TRACK_HALF`.  5.2 clears the
   *  retaining kerb (3.5), its channel (4.0) and the north cable trough (4.65). */
  toeOff: 5.2,
  row: 2.2,             // frame spacing, measured *along the slope*
  cell: 1.875,          // and across it, in plan -- CUT / 8, so the cells close
  beamW: 0.34,
  toeW: 0.46,           // the 小口止め at the foot is heavier than the frame
  beamH: 0.19,
  /**
   * 0.11, and it is set by `cribClearance()` rather than chosen.
   *
   * The cells have to clear the worst height the hillside reaches above them
   * (0.084 m at sub 0.18) or the terrain comes up through the crib -- and the
   * residual stops falling as fast as the chord model says it should, because the
   * worst points are lattice *nodes* where several creases meet and a cone's error
   * falls only linearly with the sample spacing.  So the lift covers it, and the
   * gap that leaves at the edge of the treated area is closed by the skirt below,
   * exactly the way `hillPath` closes the same gap along a trail.
   */
  lift: 0.11,
  /**
   * How finely a cell and a member are sub-divided onto the surface.
   *
   * Chosen against the measurement, not by eye.  `cribClearance()` reports the
   * worst height the hillside reaches above the flat quad laid over it, and the
   * cells have to stay above that or the terrain comes up through the crib:
   *
   *     one quad per cell    0.446 m      -- the hillside straight through it
   *     sub 0.40             0.121 m
   *     sub 0.25             0.113 m      -- still over a 0.11 lift, by 3 mm
   *     sub 0.18             0.084 m
   *
   * It is a chord error over a piecewise-linear surface, so it *should* fall with
   * the square of the span, and past about 0.3 it stops doing that: the worst
   * points are lattice **nodes** rather than edges, and a cone's error falls only
   * linearly with the spacing.  Which is why this was measured at four values
   * rather than derived at one.
   *
   * 0.18 costs about 30 k triangles against 16 k at 0.25, and that is the right
   * trade here: the whole crib is four baked, frustum-culled draw calls, and this
   * scene is draw-call bound by a wide margin -- the two rings alone submit 900 k
   * triangles on every frame no matter where the camera points.
   */
  sub: 0.18,
  drop: 0.30,
  minRise: 2.2,         // a bank shorter than this is a verge, not a face
  minSlope: 0.72,       // and gentler than this is a slope, not a cut
  zLimit: 13.5,
};

/**
 * Filled at build time, read from the console.
 *
 * `worstDip` is how far the hillside stands above the flat quad of the cell over
 * it, at the worst point of the worst cell -- so `CRIB.lift` has to beat it or
 * the terrain comes up through the crib.  There is nothing to reason about here:
 * the cells are laid on a surface that is piecewise linear over a 3 m lattice at
 * row spacings the arc-length march chose, so the chord error is whatever it is
 * and the only way to know is to sample it.
 */
export const CRIB_STATS = {};
export const cribClearance = () => ({ lift: CRIB.lift, ...CRIB_STATS });

/** The surface of a cell, for anything that stands *on* the crib rather than on
 *  the hillside it is laid over. */
const cribSurfaceY = (x, z) => hillMeshY(x, z) + CRIB.lift;

/**
 * March one column outward from the toe and return the z of every frame line.
 *
 * Returns `null` for a column that is not a face: too short, too gentle, or
 * already over a crest -- which is the case that matters on 東山, where the
 * south bank *is* E2b's ridge and the ground starts falling again toward the
 * drainage channel about seven metres out.  Testing the signed outward gradient
 * rather than its magnitude is what stops the frame carrying on over the top and
 * down the far side.
 */
function cribColumn(x, zStart, sgn, zStop, yAt, minRise, blocked) {
  const STEP = 0.2 * sgn;
  const grad = (zz) => (yAt(x, zz + sgn * 0.3) - yAt(x, zz - sgn * 0.3)) / 0.6;
  /**
   * Find the real toe first.
   *
   * A face does not begin where the caller says it does.  On the approaches the
   * nominal toe is a fixed offset outside the retaining kerb and the ground there
   * is still the flat cess for a metre or two; on a cap flank the nominal toe is
   * the notch's own edge, where the knoll's bell has barely started and the
   * gradient measures 0.7 against a threshold of 0.72.  Breaking on that gave
   * **twenty-six triangles** of crib across two cap flanks and looked, in the
   * frame, exactly like the feature not existing.
   *
   * So the column seeks forward up to 6 m for ground that is actually steep, and
   * only then starts laying frame.  A column that never finds any is not a face.
   */
  let z0 = zStart;
  for (let k = 0; k < 30; k++) {
    if ((z0 - zStop) * sgn > 0) return null;
    if (grad(z0) >= CRIB.minSlope && !blocked(x, z0)) break;
    z0 += STEP;
    if (k === 29) return null;
  }
  const plane = groundY(0) - TERRAIN_DROP;
  let z = z0;
  let y = yAt(x, z);
  if (y - plane < 0.4) return null;
  const rows = [z];
  let s = 0;
  for (let k = 1; k < 220; k++) {
    const zn = z0 + k * STEP;
    if ((zn - zStop) * sgn > 0) break;
    const yn = yAt(x, zn);
    /* The gradient *along the march*, over a 0.6 m window, so one rough facet
     * cannot end a column and a crest ends it immediately -- which is the case
     * that matters on 東山, where the south bank is E2b's ridge and the ground
     * starts falling again toward the drainage channel about seven metres out.
     * 0.62 rather than the 0.72 the toe was sought at: a frame already started
     * runs on to the crest rather than stopping in the middle of a face. */
    if (grad(zn) < CRIB.minSlope - 0.1) break;
    if (blocked(x, zn)) break;
    s += Math.abs(Math.hypot(STEP, yn - y));
    while (s >= rows.length * CRIB.row && rows.length <= 9) rows.push(zn);
    z = zn; y = yn;
    if (rows.length > 9) break;
  }
  if (rows.length < 2) return null;
  if (y - yAt(x, z0) < minRise) return null;
  return rows;
}

/**
 * Lay the crib over one cut face and append its triangles to the two soups.
 *
 * `yAt` is the *drawn* surface, so it is `hillMeshY` for a bank in the hill field
 * and `capMeshY` for a flank of a tunnel cap -- the same distinction
 * `buildOutcrops` needs its `yAt` for, and for the same reason: `ctx.groundAt`
 * answers with the flat grade inside a notch.
 */
function cribFace(o) {
  const { xa, xb, zToe, sgn, zStop, yAt, beams, infill } = o;
  const minRise = o.minRise ?? CRIB.minRise;
  const blocked = o.blocked ?? (() => false);
  const dir = Math.sign(xb - xa) || 1;
  const nCells = Math.max(3, Math.round(Math.abs(xb - xa) / CRIB.cell));
  const nCol = nCells * 2;                     // two stations per cell
  const step = Math.abs(xb - xa) / nCol;

  const cols = [];
  for (let c = 0; c <= nCol; c++) {
    const x = xa + dir * c * step;
    cols.push({ x, rows: cribColumn(x, zToe, sgn, zStop, yAt, minRise, blocked) });
  }
  if (!cols.some((c) => c.rows)) return { columns: 0, box: null };

  const P = (x, z, lift) => [x, yAt(x, z) + lift, z];
  const push3 = (a, p) => a.push(p[0], p[1], p[2]);
  const quad = (a, p, q, r, s) => {
    push3(a, p); push3(a, q); push3(a, r); push3(a, p); push3(a, r); push3(a, s);
  };
  /**
   * Emit a quad wound so its normal points along `ref`, **derived rather than
   * written**.
   *
   * This exists because the first version wrote the winding out by hand with the
   * bank side and the approach direction folded into one comparison, and it was
   * inverted -- so every cell in the world was facing into the hillside and
   * `cel()` is single-sided, which means the crib rendered as a bare frame with
   * `hillEarth` showing through it.  It looked *almost* right, which is the worst
   * kind of wrong: the beams were there, the cells were the tan they were
   * supposed to be replacing, and a raycast on a cell is the only thing that said
   * so.  Same family as `makeStrip` assuming ascending z.
   *
   * Four surfaces here each want a different outward direction -- the cells and
   * the beam's top face want up, its two flanks want the plan normal either way
   * -- so there is nothing to write down consistently and the cross product
   * settles it in one line.
   */
  const quadTo = (a, p, q, r, s, rx, ry, rz) => {
    const ux = q[0] - p[0], uy = q[1] - p[1], uz = q[2] - p[2];
    const vx = r[0] - q[0], vy = r[1] - q[1], vz = r[2] - q[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (nx * rx + ny * ry + nz * rz >= 0) quad(a, p, q, r, s);
    else quad(a, s, r, q, p);
  };

  /**
   * The cells, as one lifted surface following the frame's own grid -- and
   * **measured while it is laid**.
   *
   * A cell is a flat quad over ground that is piecewise linear on a 3 m lattice,
   * so wherever a lattice crease runs through a cell the quad chords under the
   * real surface and the hillside comes up through the crib.  It is exactly the
   * failure `hillPath` carries a 0.30 m skirt for, except that a grid has no
   * perimeter to skirt: the poke-through is in the middle.  There is no arithmetic
   * bound worth trusting either, because the row spacing is whatever the arc-length
   * march produced.  So every cell samples its own interior on a 3 x 3 and the
   * worst dip is reported by `cribClearance()`, the same way `boreClearance()`
   * reports the one number that matters about the lining.
   */
  for (let c = 0; c < nCol; c++) {
    const A = cols[c].rows, B = cols[c + 1].rows;
    if (!A || !B) continue;
    const n = Math.min(A.length, B.length);
    const xa2 = cols[c].x, xb2 = cols[c + 1].x;
    for (let r = 0; r < n - 1; r++) {
      const za = A[r], zb = A[r + 1], zc = B[r], zd = B[r + 1];
      /* Sub-divided onto the surface at `CRIB.sub`, **not** laid as one quad.
       * One quad per cell put the hillside 0.30 m (west) and 0.45 m (east)
       * through the crib at the worst point, measured -- which is what a flat
       * lozenge over a lattice crease does, and no lift small enough to look
       * like a crib is big enough to hide it. */
      const nu = Math.max(1, Math.ceil(Math.abs(xb2 - xa2) / CRIB.sub));
      const nv = Math.max(1, Math.ceil(
        Math.max(Math.abs(zb - za), Math.abs(zd - zc)) / CRIB.sub));
      const at2 = (u, v) => {
        const px = xa2 + (xb2 - xa2) * u;
        const pz = (za + (zb - za) * v) * (1 - u) + (zc + (zd - zc) * v) * u;
        return [px, pz];
      };
      /* Which sides of this cell are the outside of the treated area, so the
       * skirt goes only there.  A cell whose neighbour exists needs none. */
      const edgeL = c === 0 || !cols[c - 1].rows;
      const edgeR = c === nCol - 1 || !cols[c + 2] || !cols[c + 2].rows;
      const skirt = (p, q, rx, rz) => {
        const a1 = P(p[0], p[1], CRIB.lift), b1 = P(q[0], q[1], CRIB.lift);
        const a2 = [a1[0], a1[1] - CRIB.drop, a1[2]], b2 = [b1[0], b1[1] - CRIB.drop, b1[2]];
        quadTo(infill, a1, b1, b2, a2, rx, 0, rz);
      };
      for (let i = 0; i < nu; i++) {
        for (let j = 0; j < nv; j++) {
          const p00 = at2(i / nu, j / nv), p10 = at2((i + 1) / nu, j / nv);
          const p11 = at2((i + 1) / nu, (j + 1) / nv), p01 = at2(i / nu, (j + 1) / nv);
          quadTo(infill,
            P(p00[0], p00[1], CRIB.lift), P(p10[0], p10[1], CRIB.lift),
            P(p11[0], p11[1], CRIB.lift), P(p01[0], p01[1], CRIB.lift), 0, 1, 0);
          if (edgeL && i === 0) skirt(p00, p01, -dir, 0);
          if (edgeR && i === nu - 1) skirt(p10, p11, dir, 0);
          if (r === 0 && j === 0) skirt(p00, p10, 0, -sgn);
          if (r === n - 2 && j === nv - 1) skirt(p01, p11, 0, sgn);
          // measure the residual on the sub-quad that was actually emitted
          const h00 = yAt(p00[0], p00[1]), h10 = yAt(p10[0], p10[1]);
          const h11 = yAt(p11[0], p11[1]), h01 = yAt(p01[0], p01[1]);
          for (let u = 0.25; u < 1; u += 0.25) {
            for (let v = 0.25; v < 1; v += 0.25) {
              const q = at2((i + u) / nu, (j + v) / nv);
              const flat = h00 * (1 - u) * (1 - v) + h10 * u * (1 - v)
                + h01 * (1 - u) * v + h11 * u * v;
              const dip = yAt(q[0], q[1]) - flat;
              if (dip > o.stats.worstDip) {
                o.stats.worstDip = dip;
                o.stats.at = [+q[0].toFixed(2), +q[1].toFixed(2)];
              }
            }
          }
        }
      }
      o.stats.cells++;
    }
  }

  /**
   * One member, swept along a plan polyline.
   *
   * The half-width is corrected per station by the surface's own gradient across
   * the member -- see the header.  Emitted as a prism: top, two flanks and two
   * ends, so a beam that stops in the middle of a face is closed.
   */
  const member = (raw, halfW) => {
    if (raw.length < 2) return;
    /* Resampled at `CRIB.sub` for the same reason the cells are sub-divided: a
     * member's stations are one per cell -- 0.94 m along a contour, up to 1.4 m
     * down the fall line -- and a 0.24 m deep beam chorded over that much of a
     * lattice crease is a beam with a hole bitten out of it. */
    const pts = [];
    for (let k = 0; k < raw.length - 1; k++) {
      const [ax, az] = raw[k], [bx, bz] = raw[k + 1];
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / CRIB.sub));
      for (let t = 0; t < n; t++) pts.push([ax + (bx - ax) * t / n, az + (bz - az) * t / n]);
    }
    pts.push(raw[raw.length - 1]);
    const rim = [];
    for (let k = 0; k < pts.length; k++) {
      const p = pts[k];
      const q = pts[Math.min(pts.length - 1, k + 1)];
      const r = pts[Math.max(0, k - 1)];
      let tx = q[0] - r[0], tz = q[1] - r[1];
      const tl = Math.hypot(tx, tz) || 1;
      tx /= tl; tz /= tl;
      const nx = -tz, nz = tx;
      // directional derivative across the member, so the width is on the slope
      const gn = (yAt(p[0] + nx * 0.35, p[1] + nz * 0.35)
        - yAt(p[0] - nx * 0.35, p[1] - nz * 0.35)) / 0.7;
      const hw = halfW / Math.hypot(1, gn);
      const L = [p[0] + nx * hw, p[1] + nz * hw];
      const R = [p[0] - nx * hw, p[1] - nz * hw];
      rim.push({
        n: [nx, nz], t: [tx, tz],
        lu: P(L[0], L[1], CRIB.lift + CRIB.beamH), ru: P(R[0], R[1], CRIB.lift + CRIB.beamH),
        ld: P(L[0], L[1], CRIB.lift - 0.02), rd: P(R[0], R[1], CRIB.lift - 0.02),
      });
    }
    for (let k = 0; k < rim.length - 1; k++) {
      const a = rim[k], b2 = rim[k + 1];
      quadTo(beams, a.lu, b2.lu, b2.ru, a.ru, 0, 1, 0);                       // top
      quadTo(beams, a.lu, a.ld, b2.ld, b2.lu, a.n[0], 0, a.n[1]);             // flank
      quadTo(beams, a.ru, a.rd, b2.rd, b2.ru, -a.n[0], 0, -a.n[1]);           // the other
    }
    const f = rim[0], e = rim[rim.length - 1];
    quadTo(beams, f.lu, f.ru, f.rd, f.ld, -f.t[0], 0, -f.t[1]);
    quadTo(beams, e.lu, e.ru, e.rd, e.ld, e.t[0], 0, e.t[1]);
  };

  // the frame lines that follow the contour, in contiguous runs
  let maxR = 0;
  for (const c of cols) if (c.rows) maxR = Math.max(maxR, c.rows.length);
  for (let r = 0; r < maxR; r++) {
    let run = [];
    for (let c = 0; c <= nCol; c++) {
      const rows = cols[c].rows;
      if (rows && r < rows.length) run.push([cols[c].x, rows[r]]);
      else { if (run.length > 1) member(run, r === 0 ? CRIB.toeW : CRIB.beamW); run = []; }
    }
    if (run.length > 1) member(run, r === 0 ? CRIB.toeW : CRIB.beamW);
  }
  // and the fall-line members, one per cell boundary
  for (let c = 0; c <= nCol; c += 2) {
    const rows = cols[c].rows;
    if (!rows || rows.length < 2) continue;
    member(rows.map((z) => [cols[c].x, z]), CRIB.beamW);
  }
  /* The footprint, handed back so `dressFaces` can keep its boulders off it.
   * Grass tussocks in the cells are exactly right and stay; a 0.9 m rock sitting
   * on a concrete frame is not, and there were four of them on the first render. */
  let zEnd = zToe;
  for (const c of cols) {
    if (!c.rows) continue;
    const last = c.rows[c.rows.length - 1];
    if ((last - zEnd) * sgn > 0) zEnd = last;
  }
  return {
    columns: cols.filter((c) => c.rows).length,
    box: {
      x0: Math.min(xa, xb) - 0.6, x1: Math.max(xa, xb) + 0.6,
      z0: Math.min(zToe, zEnd) - 0.6, z1: Math.max(zToe, zEnd) + 0.6,
    },
  };
}

/**
 * Every cribbed face of one bore: the four approach quadrants, plus the two cap
 * flanks either side of the crest where the knoll is steep enough to have been
 * cut rather than grown.
 *
 * Two meshes for the whole bore -- one for the concrete, one for the cells --
 * because the scene is draw-call bound and this is thirty separate members.
 */
function buildCribs(ctx, b, keepOut = []) {
  const { T } = b;
  const m = mats();
  const hm = hillMats();
  const beams = [];
  const infill = [];
  let columns = 0;
  const boxes = [];
  const blocked = (x, z) => keepOut.some(
    (k) => (x - k.x) * (x - k.x) + (z - k.z) * (z - k.z) < k.r * k.r);
  const stats = { worstDip: 0, at: null, cells: 0 };

  const add = (o) => {
    const r = cribFace({ ...o, blocked, beams, infill, stats });
    columns += r.columns;
    if (r.columns) boxes.push(r.box);
  };

  // the four approach quadrants, marching outward from the toe of the cut
  const banks = T.bank === 0 ? [1, -1] : [T.bank];
  for (const side of [-1, 1]) {
    const px = side < 0 ? T.x0 : T.x1;
    const dir = side < 0 ? -1 : 1;
    for (const bz of banks) {
      add({
        xa: px, xb: px + dir * CUT, yAt: hillMeshY,
        zToe: bz * (TRACK_HALF + CRIB.toeOff), sgn: bz, zStop: bz * CRIB.zLimit,
      });
    }
  }

  /**
   * And the 坑口法面 -- the cap's own flanks either side of the portal.
   *
   * This one was found by raycast rather than by reasoning.  The `higOver` frame
   * came back 40 % flat tan after the approach banks were cribbed, and the shape
   * of it was not the shape of a cutting; a ray into the middle of it returned
   * `tunnelCapE2`, which is the cap's *earth* tone.  `buildCap` paints anything
   * over 1.05 of slope bare, and the knoll has to rise eleven metres in the
   * fifteen between the track and the notch's edge, so both flanks of both caps
   * are over that threshold for their whole length -- and the cap is outside the
   * hill field, so neither `plantRange` nor the approach crib had ever touched it.
   *
   * Only the **eight metres nearest each portal** get a frame.  That band is the
   * slope the portal is set into and it is engineered by definition; carry it
   * further along the bore and the mountain the railway goes through has a
   * concrete grid over the whole of it, which is a retained embankment and not a
   * mountain.  The march runs from the notch's own edge *up toward* the crest and
   * stops 3 m short of it, so nothing is laid over the crown.
   *
   * `minRise` is lower here (1.6) because the flank at the notch edge starts from
   * whatever the hillside outside happens to be, which on the west arm's south
   * side is nearly nothing.
   */
  const capY = (x, z) => capMeshY(b, x, z);
  for (const side of [-1, 1]) {
    const px = side < 0 ? T.x0 : T.x1;
    const dir = side < 0 ? 1 : -1;             // inward, along the bore
    for (const edge of [T.zS, T.zN]) {
      const sgn = Math.sign(T.zCrest - edge) || 1;
      add({
        xa: px + dir * 0.5, xb: px + dir * 8.0, yAt: capY, minRise: 1.6,
        zToe: edge + sgn * 0.6, sgn, zStop: T.zCrest - sgn * 3.0,
      });
    }
  }

  CRIB_STATS[T.id] = { ...stats, worstDip: +stats.worstDip.toFixed(3) };
  if (!beams.length) return { columns: 0, boxes };

  const mk = (list, mat, name, receive) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(list, 3));
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, mat);
    // see the header: a 0.19 m step is two shadow texels and casts a sawtooth
    mesh.castShadow = false;
    mesh.receiveShadow = receive;
    mesh.name = name;
    ctx.add(mesh);
  };
  mk(infill, hm.grass, 'cribCells' + T.id, true);
  mk(beams, m.concreteMid, 'cribFrame' + T.id, true);
  return { columns, boxes };
}

/**
 * Scrub, boulders and tussocks over every cut face round a bore.
 *
 * **`plantRange` will not touch any of this.**  It rejects a candidate whose
 * ground is steeper than 0.9, and every face here is 1.3-1.9 by construction --
 * the corridors' own slope allowance -- so the banks, the ridge and the knoll's
 * flanks all came out as large unbroken areas of the `earth` tone.  Measured off
 * three rendered frames: 45 % of the overlook's frame, 60 % of the gate's, and
 * about a third of the railside spot's, all of it one flat tan plane.  It is the
 * same failure the massif's toe had two rounds ago for a completely different
 * reason, and the fix is the same one: it is not a tone problem, it is a
 * *nothing on it* problem.
 *
 * Scrub is also what actually grows on a cutting nobody maintains, which is why
 * it goes on the faces rather than on the crests.
 */
function dressFaces(ctx, b, cribBoxes = []) {
  const { T } = b;
  const rng = rngKit(9311 + b.idx * 271);
  /** True on ground the crib has already taken.  A tussock in a cell is right --
   *  the cells are seeded and that is what grows in them -- but a 0.9 m boulder
   *  and a shrub clump standing on a concrete frame are not, and both were there
   *  on the first render of it. */
  const onCrib = (x, z) => cribBoxes.some(
    (k) => x > k.x0 && x < k.x1 && z > k.z0 && z < k.z1);
  const shrubs = [];
  const rocks = [];
  const tufts = [];
  /* The envelope: both approaches and the ground either side of the bore, out to
   * where the range's own planting takes over.  Inside the notch the cap has its
   * own trees, so the *drawn* faces there are the cap's, not the field's. */
  const X0 = T.x0 - CUT - 8, X1 = T.x1 + CUT + 8;
  for (let k = 0; k < 620; k++) {
    const x = rng.range(X0, X1);
    const z = rng.range(-19, 22);
    if (Math.abs(z) < 6.4) continue;                 // the running line
    if (Math.abs(z + 24) < 6.4) continue;            // the drainage channel
    const y = ctx.groundAt(x, z);
    if (y < 0.9) continue;
    // only the steep faces: the gentle ground is already planted and toned
    const e = 1.5;
    const g = Math.hypot(
      (ctx.groundAt(x + e, z) - ctx.groundAt(x - e, z)) / (2 * e),
      (ctx.groundAt(x, z + e) - ctx.groundAt(x, z - e)) / (2 * e)
    );
    if (g < 0.45) continue;
    const roll = rng.next();
    if (onCrib(x, z)) {
      // only the grass, and less of it: the cells are seeded, not derelict
      if (roll < 0.62) continue;
      tufts.push({
        x, z, n: rng.int(3, 6), spread: rng.range(0.8, 1.6),
        seed: 9960 + b.idx * 400 + k,
        /* Seated on the **cell**, not on the hillside under it.  The cells stand
         * `CRIB.lift` proud so they clear the terrain's own creases, and a tuft
         * placed from `hillMeshY` is buried by exactly that -- a fifth of its
         * height, which reads as grass sunk into concrete.  Same class as
         * `groundY(z)` not being the ground. */
        yAt: cribSurfaceY,
      });
      continue;
    }
    if (roll < 0.42) {
      shrubs.push({
        x, z, y, r: rng.range(0.40, 0.66), count: rng.int(3, 5),
        spread: rng.range(1.0, 1.9), seed: 9400 + b.idx * 400 + k,
      });
    } else if (roll < 0.74) {
      rocks.push({
        x, z, n: rng.int(2, 4), r: rng.range(0.45, 0.95),
        spread: rng.range(1.1, 2.2), seed: 9700 + b.idx * 400 + k,
      });
    } else {
      tufts.push({
        x, z, n: rng.int(4, 8), spread: rng.range(1.2, 2.4),
        seed: 9900 + b.idx * 400 + k,
      });
    }
  }
  /* And the same again on the **cap**, which needs its own pass: `ctx.groundAt`
   * answers with the flat grade inside a notch, so everything above would be
   * seated at zero and buried under fifteen metres of mountain.  The rock and
   * tuft builders take a `yAt` for exactly this. */
  const capY = (x, z) => capMeshY(b, x, z);
  for (let k = 0; k < 120; k++) {
    const x = rng.range(T.x0 + 1.5, T.x1 - 1.5);
    const z = rng.range(T.zS + 1.5, T.zN - 1.5);
    const h = capAt(b, x, z);
    if (h < 1.5) continue;
    const e = 1.5;
    const g = Math.hypot(
      (capAt(b, x + e, z) - capAt(b, x - e, z)) / (2 * e),
      (capAt(b, x, z + e) - capAt(b, x, z - e)) / (2 * e)
    );
    if (g < 0.4) continue;
    const roll = rng.next();
    if (roll < 0.4) {
      shrubs.push({
        x, z, y: groundY(z) + h, r: rng.range(0.40, 0.66), count: rng.int(3, 5),
        spread: rng.range(1.0, 1.9), seed: 9500 + b.idx * 400 + k,
      });
    } else if (roll < 0.72) {
      rocks.push({
        x, z, n: rng.int(2, 4), r: rng.range(0.45, 0.95),
        spread: rng.range(1.1, 2.0), seed: 9800 + b.idx * 400 + k, yAt: capY,
      });
    } else {
      tufts.push({
        x, z, n: rng.int(4, 8), spread: rng.range(1.2, 2.4),
        seed: 9950 + b.idx * 400 + k, yAt: capY,
      });
    }
  }
  buildOutcrops(ctx, rocks);
  buildTufts(ctx, tufts);
  return shrubs;
}

/* ------------------------------------------------------------------ *
 * Getting in.
 * ------------------------------------------------------------------ */

/**
 * 保守用通路 -- the maintenance gate, and the reason a player believes they may
 * walk into a railway tunnel.
 *
 * The bore was sealed by a single collider until this round, so none of this
 * existed; and simply deleting that collider would have produced a tunnel you
 * walk into by climbing a lineside fence, which reads as a hole in the world
 * rather than as a route.  What makes it a route is that there is a gate, it is
 * standing open, it has a plate on it saying whose it is, and the path beyond it
 * goes somewhere -- up three treads onto the walkway.
 *
 * `T.gateX` is chosen per bore and both choices are constrained rather than
 * arbitrary: the west one clears its own viewing platform's railing, and the east
 * one is outside its cutting's retaining kerb, which is a wall.  Both are in
 * `hills.js` with the reasoning.
 */
function buildAccess(ctx, b) {
  const { T } = b;
  const m = mats();
  const gm = groundMats();
  const s = T.walk;
  const gx = T.gateX;
  const zf = s * (TRACK_HALF + 1.05);            // the lineside fence's own line
  const y = groundY(0);

  // the two gate posts, in the 1.8 m opening `railway.js` leaves here
  const parts = [];
  for (const dx of [-0.9, 0.9]) {
    parts.push({ geometry: new THREE.CylinderGeometry(0.06, 0.07, 1.5, 8), matrix: trs(gx + dx, 0.75, zf) });
  }
  // the leaf, swung back against the fence rather than shut: it is a path
  const leafX = gx - 0.9;
  for (const yy of [0.42, 1.06]) {
    parts.push({ geometry: new THREE.BoxGeometry(1.5, 0.06, 0.05), matrix: trs(leafX - 0.75, yy, zf + s * 0.18, 0, 0.22, 0) });
  }
  for (let k = 0; k < 5; k++) {
    parts.push({
      geometry: new THREE.BoxGeometry(0.035, 0.62, 0.035),
      matrix: trs(leafX - 0.2 - k * 0.32, 0.74, zf + s * (0.18 + k * 0.07), 0, 0.22, 0),
    });
  }
  const gate = new THREE.Mesh(bake(parts), m.metal);
  gate.castShadow = true;
  gate.name = 'openFrame';
  ctx.add(gate);
  for (const dx of [-0.9, 0.9]) {
    ctx.collide(gx + dx - 0.07, zf - 0.07, gx + dx + 0.07, zf + 0.07, y + 1.5, y, true);
  }
  {
    const leafCx = leafX - 0.75;
    const leafCz = zf + s * 0.18;
    const ca = Math.cos(0.22);
    const sa = Math.sin(0.22);
    const hw = Math.abs(ca) * 0.75 + Math.abs(sa) * 0.04;
    const hd = Math.abs(sa) * 0.75 + Math.abs(ca) * 0.04;
    for (const yy of [0.42, 1.06]) {
      ctx.collide(leafCx - hw, leafCz - hd, leafCx + hw, leafCz + hd,
        y + yy + 0.05, y + yy - 0.05, true);
    }
  }

  // the plate on the leaf, facing whoever is walking up to it
  const map = maintGatePlate();
  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.38, 0.05),
    [flat({ color: PAL.wallGray }), flat({ color: PAL.wallGray }),
     flat({ color: PAL.wallGray }), flat({ color: PAL.wallGray }),
     flat({ color: 0xffffff, map, cache: false }), flat({ color: PAL.wallGray })]
  );
  plate.position.set(leafX - 0.72, y + 0.86, zf + s * 0.24);
  plate.rotation.y = s > 0 ? 0.22 : Math.PI + 0.22;
  plate.castShadow = true;
  ctx.add(plate);
  hullOutline(plate, { thickness: 0.003 });

  /* The path: a strip of gravel from the field, through the opening, and a worn
   * line along the lineside toward the portal.  It is a `pad` rather than a lane
   * because it registers a platform, which is what keeps the feet on it. */
  pad(ctx, {
    x: gx, z: zf + s * 2.2, w: 2.4, d: 4.0, y, h: 0.06, mat: gm.gravel,
    name: 'tunnelGatePad' + T.id,
  });
  // the portal this gate serves is the one nearer the town
  const px = Math.abs(T.x0) < Math.abs(T.x1) ? T.x0 : T.x1;
  const walkFrom = Math.min(gx, px), walkTo = Math.max(gx, px);
  pad(ctx, {
    x: (walkFrom + walkTo) / 2, z: s * (TRACK_HALF + 0.55), w: walkTo - walkFrom, d: 1.2,
    y, h: 0.05, mat: gm.gravel, name: 'tunnelCessPath' + T.id,
  });
  // facing whoever is walking up to the gate, which is from outside the fence
  ctx.add(makeSignPost({
    x: gx + 1.6, z: zf + s * 1.1, y, ry: s > 0 ? 0 : Math.PI, h: 1.9, postMat: m.metal,
    plates: [{ map: railPlate(1), w: 0.5, h: 0.38, y: 1.45, double: true }],
  }));
  ctx.collide(gx + 1.45, zf + s * 1.1 - 0.15, gx + 1.75, zf + s * 1.1 + 0.15, y + 1.9);
  ctx.add(makeCone({ x: gx - 1.9, z: zf + s * 0.9, y, ry: 0.4 }));
}

/* ------------------------------------------------------------------ *
 * The places you watch it from.
 * ------------------------------------------------------------------ */

/** A short run of 丸太階段 up a pitch too steep to be a path. */
function logSteps(ctx, from, to, n) {
  const m = hillMats();
  const parts = [];
  for (let k = 1; k <= n; k++) {
    const t = k / (n + 1);
    const x = from[0] + (to[0] - from[0]) * t;
    const z = from[1] + (to[1] - from[1]) * t;
    const ry = Math.atan2(-(to[0] - from[0]), -(to[1] - from[1]));
    parts.push({
      geometry: new THREE.CylinderGeometry(0.11, 0.11, 1.25, 7),
      matrix: trs(x, hillMeshY(x, z) + 0.05, z, 0, ry, Math.PI / 2),
    });
    /* No `ctx.platform` here, and that is deliberate rather than the trap table's
     * "steps without a platform are scenery".  These logs are pinned across a path
     * that `hills.js` has already **benched into the slope** — the ground under
     * them is the graded path profile, which is what carries the walker — so a
     * tread would be a second surface 0.16 m above the one that already works.
     * They were tried, and an axis-aligned box cannot express a 0.2 m tread on a
     * diagonal flight anyway: its AABB is a metre deep, five of them overlap, and
     * `heightAt` takes the max, so the "staircase" comes out as the same ramp
     * shifted half a metre up-slope. */
  }
  const g = new THREE.Mesh(bake(parts), m.timberDark);
  g.castShadow = true;
  g.receiveShadow = true;
  ctx.add(g);
}

/**
 * Two per bore, and they are why each tunnel is at the longitude it is.
 *
 * On a 160 m planet the ground horizon from eye height is 23 m, so a portal is
 * only *visible* from within about that distance -- which rules out seeing either
 * of them from the 展望台 whatever the brief would like, and rules in putting them
 * where a player can already stand.
 *
 * The pair is mirrored bore to bore, and the mirroring is what stops the second
 * tunnel reading as the first one again: ひばり山's spot is on the **south** at
 * its **east** mouth with the overlook on the **north** bank; 東山's is on the
 * **north** at its **west** mouth with the overlook on the **south** ridge.  The
 * mouth each pair watches is the lit one -- the sun is at (-52, 62, 56), so a
 * face whose normal is -x is lit every hour of the day and one whose normal is
 * +x never is.
 */
function buildViewpoints(ctx, b) {
  const { T } = b;
  const m = mats();
  const gm = groundMats();
  const hm = hillMats();
  const sakura = [];
  const grove = [];
  const shrubs = [];
  /**
   * Ground the crib must not be laid on.
   *
   * Both overlooks stand on the crest of a cut bank -- which is the whole idea --
   * so both of them are *inside* the footprint the crib works out for itself, and
   * so is most of 東山's zigzag approach, which traverses the very face the frame
   * goes on.  A concrete grid through a timber viewing deck and up a stepped
   * footpath is not a thing, and neither is coplanar with the other's slab.
   *
   * So the viewpoints declare their own footprint and `buildCribs` runs *after*
   * them and reads it, which also means the paths keep their own measured grades:
   * this list is built from the route `hillPath` actually laid, not from the
   * polyline it was asked for.
   */
  const keepOut = [];
  const west = b.idx === 0;

  /* --- the railside spot --- */
  {
    const V = west ? SITES.tview : SITES.tviewE;
    const s = T.walk;
    const y = groundY(V.z);
    pad(ctx, { x: V.x, z: V.z, w: 5.6, d: 3.4, y, h: 0.07, mat: gm.gravel, name: 'tunnelViewPad' + T.id });
    keepOut.push({ x: V.x, z: V.z, r: 4.2 });
    // the safety rail, on the track side of the spot
    railing(ctx, {
      axis: 'x', at: V.z - s * 1.5, from: V.x - 2.8, to: V.x + 2.8, y: y + 0.07, h: 1.05, spacing: 1.4,
      mat: m.metal,
    });
    ctx.add(makeBench({ x: V.x - 1.1, z: V.z + s * 0.7, y: y + 0.07, ry: s > 0 ? Math.PI : 0, len: 1.8 }));
    ctx.add(makeBench({ x: V.x + 1.3, z: V.z + s * 0.7, y: y + 0.07, ry: s > 0 ? Math.PI : 0, len: 1.4 }));
    // the fingerpost that says what the spot is for, facing the field
    const fx = west ? V.x + 3.2 : V.x - 3.2;
    ctx.add(makeSignPost({
      x: fx, z: V.z + s * 1.2, y, ry: west ? -Math.PI / 2 : Math.PI / 2, h: 2.3, postMat: m.timber,
      plates: [{ map: trailSign(5), w: 1.15, h: 0.29, y: 1.9, double: true }],
    }));
    ctx.collide(fx - 0.2, V.z + s * 1.2 - 0.2, fx + 0.2, V.z + s * 1.2 + 0.2, y + 2.3);
    ctx.add(makeCone({ x: V.x - 3.2, z: V.z - s * 1.0, y, ry: 0.3 }));

    /* A cherry on the field side of it, so the classic shot -- a train coming out
     * of a hillside past blossom -- has its foreground.  Held 6 m back: at three
     * metres its own canopy would be the whole frame. */
    for (const [dx, dz, sc, sd, ln, ld] of [
      [west ? 5.6 : -5.6, 4.6, 1.24, 8811, 0.11, 1.5],
      [west ? -6.4 : 6.4, 5.4, 1.10, 8812, 0.09, 4.2],
    ]) {
      const zz = V.z + s * dz;
      sakura.push({ x: V.x + dx, z: zz, y: groundY(zz), scale: sc, seed: sd + b.idx * 40, lean: ln, leanDir: ld });
    }
    shrubs.push({ x: V.x - 4.4, z: V.z - s * 1.2, y, r: 0.5, count: 4, spread: 1.6, seed: 8813 + b.idx * 40 });
    shrubs.push({ x: V.x + 4.6, z: V.z - s * 1.4, y, r: 0.48, count: 3, spread: 1.4, seed: 8814 + b.idx * 40 });
  }

  /* --- the overlook, on the bank opposite the spot --- */
  {
    const V = west ? SITES.tover : SITES.toverE;
    /* The way up.  Both banks are 1-in-1 straight off the flat, so the path
     * traverses them, and both were measured off the field rather than drawn on a
     * plan.  ひばり山's runs out onto the north shoulder and back west along the
     * crest; 東山's climbs the ridge between the railway and the drainage channel
     * from the channel's own bank, which is walkable right round the planet. */
    /**
     * **Both routes live in `hills.js`'s `TRAILS` now**, and they had to move.
     *
     * They were written out here, which was fine while the ground was the ground —
     * but the hill field damps its own roughness under every trail (a made path is
     * graded), and it does that when the lattice is built, at module load, long
     * before this function exists.  A route the field has never heard of gets the
     * full texture: the third octave took the west one's local gradient to 1.975
     * against a designed worst leg of 0.95, and the flood fill lost the overlook.
     *
     * The reasoning for their shapes is with them, in the table.
     */
    const route = west ? TRAILS.toverW : TRAILS.toverE;
    const laid = hillPath(ctx, {
      pts: route, w: 1.15, name: 'tunnelOverlookPath' + T.id, mat: hm.path,
    });
    // the deck, and the path as it was actually laid -- 2.0 m clear either side,
    // which is the 1.15 m ribbon plus room for its log steps and their ends
    keepOut.push({ x: V.x, z: V.z, r: 4.4 });
    for (let k = 0; k < laid.line.length; k += 2) {
      keepOut.push({ x: laid.line[k][0], z: laid.line[k][1], r: 2.0 });
    }
    /* 丸太階段 wherever the **measured** grade says, not wherever a list says --
     * the rule `urayama.js` uses, and the reason `hillPath` hands its segments
     * back.  東山's ridge climbs 7.6 m in 17 m of path because the town's keep-out
     * ramp compresses its whole west toe into thirteen metres, so most of this
     * route is over 0.28 and most of it is a stair.  That is what a path up a
     * 隘路's shoulder is. */
    for (const sg of laid.segs) {
      if (sg.grade <= 0.28) continue;
      /* **26 and not 14.**  The count is `rise / 0.22`, which is the riser a
       * 丸太階段 actually has — but the old cap bit at 3.1 m of rise, and both of
       * these legs climb about five.  Capped, the treads came out 0.39 m apart in
       * height: over the 0.38 step limit, so the staircase would have been a
       * staircase nobody could climb even once it registered platforms. */
      logSteps(ctx, sg.a, sg.b, Math.min(26, Math.max(2, Math.round((sg.len * sg.grade) / 0.22))));
    }
    /* A small railed platform on the lip, built as a **plinth rather than a
     * slab**: on a crest the ground falls away 1.5-2 m across the platform's own
     * 2.6 m depth, so a 0.22 m slab sits on the ground at its back and hangs in
     * the air at its front.  1.6 m deep it is buried uphill and shows a cut face
     * downhill, which is what a platform notched into a ridge looks like. */
    const dy = ctx.groundAt(V.x, V.z);
    const slab = box(3.6, 1.6, 2.6, gm.concreteMid, V.x, dy + 0.22 - 0.8, V.z);
    slab.receiveShadow = slab.castShadow = true;
    ctx.add(slab);
    ctx.platform({ x0: V.x - 1.8, x1: V.x + 1.8, z0: V.z - 1.3, z1: V.z + 1.3, top: dy + 0.22 });
    /* `look` is the way the deck faces: -z for ひばり山 (south, down onto its
     * mouth) and +z for 東山 (north).  The rail goes **on that side** -- it is
     * the drop -- and the long side behind it is the way in.
     *
     * Written `V.z - look * 1.25` first, which puts the rail across the arrival
     * side and leaves the deck open over the bank, and the flood fill reported
     * 東山's overlook unreachable in one run.  It renders identically either way:
     * a railed platform with a rail on it. */
    const look = west ? -1 : 1;
    railing(ctx, {
      axis: 'x', at: V.z + look * 1.25, from: V.x - 1.8, to: V.x + 1.8, y: dy + 0.22, h: 1.1, spacing: 1.2,
      mat: m.metal,
    });
    /* **Which side is left open is not the same for the two decks**, and it is
     * decided by where the ground lets you walk up rather than by symmetry.
     *
     * ひばり山's bank rises from the field behind the deck, so its back is the way
     * in and both flanks are railed.  東山's ridge is the other way round: its
     * face is 1.5 and its *crest* is 0.25, so the only route is along the crest
     * from the west -- and with both flanks railed the deck came back unreachable
     * from the flood fill with the ground one cell outside it fully walkable.  A
     * railing 0.09 m thick takes 0.86 m of ground once the player's radius is on
     * both sides of it, which is the whole width of a ridge top.
     */
    if (!west) {
      railing(ctx, {
        axis: 'x', at: V.z - look * 1.25, from: V.x - 1.8, to: V.x + 1.8, y: dy + 0.22, h: 1.1, spacing: 1.2,
        mat: m.metal,
      });
    }
    for (const sgn of (west ? [-1, 1] : [1])) {
      railing(ctx, {
        axis: 'z', at: V.x + sgn * 1.75, from: V.z - 1.25, to: V.z + 1.2, y: dy + 0.22, h: 1.1, spacing: 1.2,
        mat: m.metal,
      });
    }
    // the bench sits on the *back* of the deck and faces the view across it
    ctx.add(makeBench({ x: V.x, z: V.z - look * 0.7, y: dy + 0.22, ry: look > 0 ? 0 : Math.PI, len: 1.6 }));
    ctx.add(makeNoticeBoard({ ctx,
      x: V.x + 2.9, z: V.z - look * 0.4, y: dy, ry: -Math.PI / 2 - 0.25, w: 1.3, h: 0.9, y0: 0.9,
      wood: 0x8a6f52,
      sheets: [{ map: railPlate(1), x: 0, y: 0, w: 0.5, h: 0.38, tilt: 0.02 }],
    }));
    // evergreens framing it, on both flanks but never in the fan
    for (const [dx, dz, sc, sd] of [[-6.5, 2.4, 1.35, 8821], [-4.4, 6.0, 1.5, 8822],
      [6.8, 3.2, 1.4, 8823], [9.0, 7.0, 1.55, 8824]]) {
      const zz = V.z - look * dz;
      const xx = V.x + dx;
      grove.push({
        x: xx, z: zz, y: ctx.groundAt(xx, zz),
        scale: sc, seed: sd + b.idx * 40, spread: 1.1, lean: 0.05, leanDir: sd % 6,
      });
    }
    const sz = V.z - look * 3.4;
    sakura.push({
      x: V.x - 3.0, z: sz, y: ctx.groundAt(V.x - 3.0, sz),
      scale: 1.16, seed: 8825 + b.idx * 40, lean: 0.1, leanDir: 2.2,
    });
  }

  return { sakura, grove, shrubs, keepOut };
}

/* ------------------------------------------------------------------ *
 * The lineside furniture, once, at the bore this world's town can reach.
 * ------------------------------------------------------------------ */

function buildLineside(ctx, b) {
  const { T } = b;
  const m = mats();
  const zc = -(TRACK_HALF + 2.6);
  const outward = -Math.sign(b.mid);                // from the bore toward the town
  const px = Math.abs(T.x0) < Math.abs(T.x1) ? T.x0 : T.x1;

  // relay cabinets, clear of the walkway
  const cx = px + outward * 6.4;
  const c1 = box(0.84, 1.4, 0.54, m.cabinet, cx, groundY(0) + 0.7, zc - 0.6);
  c1.castShadow = c1.receiveShadow = true;
  ctx.add(c1);
  hullOutline(c1, { thickness: 0.003 });
  ctx.add(box(0.92, 0.09, 0.62, cel({ color: PAL.cabinetTop, bands: 3 }), cx, groundY(0) + 1.44, zc - 0.6));
  ctx.collide(cx - 0.5, zc - 0.95, cx + 0.5, zc - 0.25, groundY(0) + 1.5);
  const c2 = box(0.56, 0.98, 0.44, m.cabinet, cx + outward * 1.15, groundY(0) + 0.49, zc - 0.5);
  c2.castShadow = c2.receiveShadow = true;
  ctx.add(c2);
  ctx.collide(cx + outward * 1.15 - 0.32, zc - 0.78, cx + outward * 1.15 + 0.32, zc - 0.22, groundY(0) + 1.02);

  /* A colour-light signal on the approach.  Sited where a driver would want it --
   * outside the bore, on the left of the direction of travel -- and it is the one
   * saturated accent in this whole district. */
  {
    const sx = px + outward * 12.0;
    const sz = -(TRACK_HALF + 1.9);
    const post = cyl(0.09, 0.11, 4.6, 8, m.metalDark, sx, groundY(0) + 2.3, sz);
    post.castShadow = true;
    ctx.add(post);
    const head = new THREE.Group();
    head.position.set(sx, groundY(0) + 4.5, sz);
    head.add(box(0.46, 1.5, 0.3, cel({ color: PAL.gateBlack, bands: 2, tint: 0x4b4560 }), 0, 0, 0));
    const lampCol = [PAL.signalOff, PAL.signalOff, 0x2f9c5a];
    lampCol.forEach((col, k) => {
      const hood = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15, 0.17, 0.14, 12, 1, true),
        cel({ color: PAL.gateBlack, bands: 2, tint: 0x4b4560 })
      );
      hood.rotation.x = Math.PI / 2;
      hood.position.set(0, 0.5 - k * 0.5, 0.2);
      head.add(hood);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.13, 14), flat({ color: col, cache: false }));
      lens.position.set(0, 0.5 - k * 0.5, 0.28);
      head.add(lens);
    });
    head.rotation.y = Math.PI;
    ctx.add(head);
    ctx.collide(sx - 0.3, sz - 0.3, sx + 0.3, sz + 0.3, groundY(0) + 4.8);
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.5, 0.36),
      [flat({ color: 0xffffff, map: railPlate(3), cache: false }),
       flat({ color: 0xffffff, map: railPlate(3), cache: false }),
       flat({ color: PAL.wallGray }), flat({ color: PAL.wallGray }),
       flat({ color: PAL.wallGray }), flat({ color: PAL.wallGray })]
    );
    plate.position.set(sx - 0.09, groundY(0) + 3.5, sz);
    ctx.add(plate);
  }

  /* The works plate, on a short post against the wing wall -- where a maintenance
   * gang arriving on foot from the town would read it. */
  {
    const ix = px + outward * 2.2;
    const iz = -(TRACK_HALF + 3.0);
    const post = cyl(0.05, 0.055, 1.7, 8, m.metal, ix, groundY(0) + 0.85, iz);
    post.castShadow = true;
    ctx.add(post);
    const map = b.info();
    const p = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.62, 0.82),
      [flat({ color: 0xffffff, map, cache: false }),
       flat({ color: PAL.wallGray }), flat({ color: PAL.wallGray }),
       flat({ color: PAL.wallGray }), flat({ color: PAL.wallGray }),
       flat({ color: PAL.wallGray })]
    );
    p.position.set(ix + 0.05, groundY(0) + 1.42, iz);
    p.rotation.y = -0.25;
    p.castShadow = true;
    ctx.add(p);
    hullOutline(p, { thickness: 0.003 });
  }

  // a 徐行 / 立入禁止 pair at the mouths of the two cuttings
  ctx.add(makeSignPost({
    x: px + outward * 9.2, z: -(TRACK_HALF + 4.6), y: groundY(0), ry: Math.PI / 2, h: 2.0,
    postMat: m.metal,
    plates: [{ map: railPlate(0), w: 0.62, h: 0.48, y: 1.5, double: true }],
  }));
  ctx.add(makeSignPost({
    x: (px === T.x0 ? T.x1 : T.x0) - outward * 9.6, z: -(TRACK_HALF + 4.6), y: groundY(0), ry: Math.PI / 2, h: 2.0,
    postMat: m.metal,
    plates: [{ map: railPlate(1), w: 0.58, h: 0.44, y: 1.5, double: true }],
  }));

  // gravel and a small works store outside the near cutting
  ctx.add(makeCrates({ x: px + outward * 7.4, z: -(TRACK_HALF + 5.4), y: groundY(0), n: 3, seed: 8801 + b.idx * 40, ry: 0.24 }));
  ctx.add(makeMilkCrate({ x: px + outward * 8.6, z: -(TRACK_HALF + 5.9), y: groundY(0), ry: -0.3, n: 2, seed: 8802 + b.idx * 40 }));
}

/* ------------------------------------------------------------------ *
 * Builder.
 * ------------------------------------------------------------------ */

export function buildTunnel(ctx) {
  const sakura = [];
  const grove = [];
  const cedar = [];
  const shrubs = [];

  for (const b of BORES) {
    const { T } = b;
    const rng = rngKit(6417 + b.idx * 733);
    buildCap(ctx, b);
    const recesses = buildBore(ctx, b);
    buildShell(ctx, b, recesses);
    buildPortal(ctx, b, -1);
    buildPortal(ctx, b, 1);
    buildCuttings(ctx, b);
    buildAccess(ctx, b);
    buildLineside(ctx, b);
    const v = buildViewpoints(ctx, b);
    sakura.push(...v.sakura);
    grove.push(...v.grove);
    shrubs.push(...v.shrubs);
    /* **The crib runs after the viewpoints and before the scrub**, and both halves
     * of that are load-bearing.  After, because both overlooks stand on the crest
     * of a cut bank and 東山's approach zigzags up the face itself, so the crib has
     * to be told where they are (`v.keepOut`) rather than discovering it in a
     * render.  Before, because `dressFaces` then scatters over a face that already
     * has a frame on it and can keep its boulders off the concrete. */
    const cribs = buildCribs(ctx, b, v.keepOut);
    shrubs.push(...dressFaces(ctx, b, cribs.boxes));

    /* Planting on the mountain itself.  A cap is outside the hill field, so the
     * range's own planting pass never sees it -- without this the two hills in
     * the world with holes through them are also the only bald ones. */
    for (let k = 0; k < 62; k++) {
      const x = rng.range(T.x0 + 2, T.x1 - 2);
      const z = rng.range(T.zS + 2, T.zN - 1);
      const h = capAt(b, x, z);
      if (h < 3.0) continue;
      /* Nothing on the crown directly over the bore: the cover is a few metres of
       * rock and a cedar rooted in it reads as a tree growing out of the tunnel.
       *
       * **4.5 m either side of the crest line, not 5.5.**  With 5.5 the exclusion
       * covered the whole band the portal is seen against from the overlook, so
       * the flank right over the mouth was the one bare part of the mountain --
       * which is the part every frame of it has in the middle. */
      if (Math.abs(z - T.zCrest) < 4.5 && h > T.crestMid - 2.5) continue;
      const y = groundY(z) + h;
      /* **A plantation block does not stop at the notch.**  Two of `hills.js`'s
       * five stands were placed to overlap a cap on purpose -- D across the west
       * arm at z = 24 and E across the col at z = 21 -- because the mountain the
       * railway goes through is the one piece of hillside every frame of a portal
       * has in it, and a compartment boundary that ends in mid-air exactly along
       * an invisible rectangle is the tell that the cap is not the hill.  Asking
       * the same function the range asks means the edge runs across both surfaces
       * as one line. */
      if (standAt(x, z)) {
        cedar.push({
          x, z, y, scale: rng.range(0.86, 1.18), seed: 8300 + k + b.idx * 60,
          lean: rng.range(0, 0.04), leanDir: rng.range(0, 6.3), collide: false,
        });
        continue;
      }
      if (rng.chance(0.22)) {
        sakura.push({ x, z, y, scale: rng.range(0.92, 1.15), seed: 8900 + k + b.idx * 60, lean: rng.range(0.04, 0.14), leanDir: rng.range(0, 6.3), collide: false });
      } else {
        grove.push({
          x, z, y, scale: rng.range(1.05, 1.5), seed: 8900 + k + b.idx * 60,
          spread: rng.range(0.9, 1.15), lean: rng.range(0.02, 0.1), leanDir: rng.range(0, 6.3),
          collide: false,
        });
      }
    }
  }

  return { sakura, grove, cedar, shrubs };
}

/* Kept so a console session can reach the notch list without importing hills. */
export const boreNotches = () => NOTCHES;
