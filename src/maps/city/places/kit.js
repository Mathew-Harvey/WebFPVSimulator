/*
 * kit.js: one box is a mesh and a collider, written together, for the two
 * places this project adds to the vendored town.
 *
 * WHY THIS IS NOT ./vendored/world/ground.js. That file is Kenton Wang's and
 * it is right for what it does: a walker's town, where a collider is a
 * keep-out volume with a body allowed for and `src/maps/city/index.js` spends
 * six hundred lines afterwards fitting those rectangles back onto the
 * drawing. Nothing new should be authored that way. Industrial bando and
 * Municipal baths already settled the alternative and it is the one this
 * follows (both were freestyle maps of their own until 2026-08-30 and are in
 * the history at 974f4ce; this file and the two beside it are where their
 * lessons still live): a wall is one call that draws it and makes it solid in the same
 * statement, and a GAP IS THE ABSENCE OF A CALL. The fit then has nothing to
 * repair, because there is no standoff to trim.
 *
 * The one adaptation is the collider shape. The town's `ctx.collide` takes a
 * rectangle in plan with a `top` and an optional `bottom`, not a box, so
 * every helper here passes both and gets an exact box out of the far end. A
 * `top` with no `bottom` is a solid from the ground up, which is right for a
 * wall standing on the ground and wrong for anything in the air, and getting
 * that wrong is how a quad meets an invisible wall under a roof.
 *
 * The materials are the town's: `cel()` and `flat()` from the vendored toon
 * kit, tinted the same cool violet the whole district is tinted, out of
 * `PAL`. Two new places that arrive with their own palette read as two models
 * parked next to a town. The four colours below that are NOT in `PAL` are
 * there because the town has no rust and no swimming pool tile, and each one
 * is derived from a colour that is.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import * as THREE from 'three';
import { PAL } from '../vendored/core/palette.js';
import { cel, flat } from '../vendored/core/toon.js';
import { bake, trs } from '../vendored/core/util.js';

/*
 * The ground plane out here.
 *
 * `street.js` gives `groundY(z) = 1.05 * sstep(-13, -32, z) + 0.45 * sstep(28, 48, z)`,
 * which is a constant 0.45 for every z past 48, and both places are past 76.
 * `hillAt` is exactly zero over this land: the hills' keep-out rectangle runs
 * x -68..88, z -80..114 and both sites are inside it. So the whole of this
 * work is authored against one number rather than against a function, and
 * that is worth stating once rather than calling `groundAt` two hundred times
 * for an answer that cannot change.
 */
export const GROUND = 0.45;

/* A deck's underside slab, and the clearance under its top. Same numbers the
 * town uses in src/maps/city/index.js so a roof here lands the same way a
 * roof there does. */
export const SLAB_THICK = 0.25;
export const SLAB_CLEAR = 0.02;
/* Below this a raised surface is a kerb the ground already answers for, and
 * giving it an underside slab puts a step in front of a landing. */
export const PLATFORM_MIN = 0.6;

const M = {};

/**
 * Every material both places use.
 *
 * Cached on first call like every `mats()` in the town, so the two places and
 * the road between them share one set and the merge in ./bake.js buckets
 * them together with the town's own surfaces wherever the colour matches.
 */
export function mats() {
  if (M.concrete) {
    return M;
  }
  const T = 0x6f6790;          // the town's standard cool violet shadow tint
  const TD = 0x5c5680;         // the deeper one, for metals and dark masses

  /* ---- the town's own surfaces, so a new wall meets an old one ---- */
  M.concrete = cel({ color: PAL.concrete, bands: 3, tint: T });
  M.concreteMid = cel({ color: PAL.concreteMid, bands: 3, tint: 0x6a6288 });
  M.concreteDark = cel({ color: PAL.concreteDark, bands: 3, tint: 0x655d84 });
  M.metal = cel({ color: PAL.metal, bands: 3, tint: 0x666090 });
  M.metalDark = cel({ color: PAL.metalDark, bands: 3, tint: TD });
  M.asphalt = cel({ color: PAL.road, bands: 3, tint: 0x6a608f });
  M.asphaltWorn = cel({ color: PAL.roadWorn, bands: 3, tint: 0x6a608f });
  M.curb = cel({ color: PAL.curb, bands: 3, tint: T });
  M.gravel = cel({ color: PAL.gravel, bands: 3, tint: 0x6a6288 });
  M.dirt = cel({ color: PAL.dirt, bands: 3, tint: 0x7a7396 });
  M.grass = cel({ color: PAL.grass, bands: 3, tint: 0x5b6f8c });
  M.wood = cel({ color: 0x9a7f5e, bands: 3, tint: TD });
  M.woodDark = cel({ color: 0x74563f, bands: 3, tint: 0x554e74 });
  M.wall = cel({ color: PAL.wallGray, bands: 3, tint: T });
  M.wallCream = cel({ color: PAL.wallCream, bands: 3, tint: T });
  M.wallBlue = cel({ color: PAL.wallBlue, bands: 3, tint: T });
  M.trim = cel({ color: PAL.trim, bands: 3, tint: TD });
  M.roof = cel({ color: PAL.roofSlate, bands: 3, tint: 0x514b70 });
  M.white = cel({ color: PAL.lineWhite, bands: 2, tint: 0x8e86ad });
  M.drain = cel({ color: PAL.drain, bands: 3, tint: 0x5d5878 });
  M.stone = cel({ color: PAL.stone, bands: 3, tint: 0x655d80 });
  M.black = cel({ color: PAL.blackSoft, bands: 2, tint: 0x4b4560 });

  /* ---- flats: glazing, paint, anything that must not take a light band ---- */
  M.glass = flat({ color: PAL.glass });
  M.glassDark = flat({ color: PAL.glassDark });
  M.paneOpen = flat({ color: 0x2f2c3d });   // a window with nothing behind it
  M.lineWhite = flat({ color: PAL.lineWhite });
  M.lineBlack = flat({ color: 0x2f2c3d });
  M.yellow = flat({ color: PAL.yellow });
  M.red = flat({ color: PAL.red });
  M.inkFlat = flat({ color: PAL.ink });

  /*
   * ---- the four the town does not have ----
   *
   * RUST, twice. The town's warmest metal is `PAL.metalWarm` at 0xc9c0b4,
   * which is a clean galvanised sheet gone chalky. A works that stopped
   * twenty years ago needs iron oxide, and iron oxide next to this town's
   * pinks has to stay desaturated or the whole site reads as a different
   * painting. Both are `PAL.trunk` (0x9a8082, the town's cherry bark) pushed
   * toward orange by the same amount, so they sit in the family.
   */
  M.rust = cel({ color: 0xa87a5e, bands: 3, tint: 0x6a5a80 });
  M.rustDeep = cel({ color: 0x8a5c46, bands: 3, tint: 0x5f4f74 });
  /* Brick, for the stack and the boiler house flue. Warmer and a shade
   * lighter than the deep rust, because a chimney is the tallest thing at
   * this end of the town and at 15 m it is read against the sky: too dark
   * and it goes to a silhouette, too saturated and it is the only strong
   * colour in a pastel town. */
  M.brick = cel({ color: 0x9c6c54, bands: 3, tint: 0x62527a });
  /* Corrugated sheet that has lost its paint: still grey, but warmer and
   * dirtier than `PAL.metal`, which is what an unpainted profiled sheet
   * weathers to. */
  M.sheet = cel({ color: 0xb2b0aa, bands: 3, tint: 0x64607f });
  M.sheetDark = cel({ color: 0x8b8a86, bands: 3, tint: 0x5a5678 });
  /*
   * POOL TILE. `PAL.water` is the town's canal, seen from above and mostly
   * reflecting sky. A tiled basin seen from INSIDE, with no water in it, is
   * a much paler, greener blue: it is glaze over white, lit from a sky it
   * faces straight up at. `tileDeep` is the same glaze in the deep end where
   * the walls shade it.
   */
  M.tile = cel({ color: 0xb2d4d8, bands: 3, tint: 0x6f7fa0 });
  M.tileDeep = cel({ color: 0x94b9c4, bands: 3, tint: 0x66759a });
  M.tileRim = cel({ color: 0xe6ece8, bands: 3, tint: 0x7d74a0 });   // the white coping
  /*
   * CIVIC RENDER, and it is the town's own school wall rather than a new
   * colour. A municipal pool built the same decade as the school is the same
   * building in a different plan: pale render, a blue band at first floor
   * level, a grey plinth. Drawn out of `PAL.wallCream` the hall came out a
   * warm orange slab 28 m long, which is the one thing this end of the town
   * has nothing else like.
   */
  M.civic = cel({ color: PAL.schoolWall, bands: 3, tint: T });
  M.civicAlt = cel({ color: PAL.schoolWallAlt, bands: 3, tint: T });
  M.civicBand = cel({ color: PAL.schoolWallBlue, bands: 3, tint: T });
  M.civicTrim = cel({ color: PAL.schoolTrim, bands: 3, tint: TD });

  /*
   * ---- the training field ----
   *
   * PADDY WATER is not the canal and not the pool. A flooded 田んぼ in spring
   * is a shallow tray of muddy water with the sky in it and the young rice
   * greening it, so it is `PAL.water` pulled toward the town's own grass:
   * lighter than the canal, greener than the pool, and flat, because it takes
   * its colour from the sky rather than from the sun.
   *
   * THE BUND is the earth wall round it, which is the same wet earth as
   * `PAL.dirt` with the light gone out of it.
   */
  M.paddyWater = flat({ color: 0x9cc0bc });
  M.paddyBund = cel({ color: 0xb2a48f, bands: 3, tint: 0x7a7396 });
  /* The arch gantries. Painted steel, and pale enough that the safety yellow
   * round the opening is the thing the eye lands on: the band is what tells a
   * pilot where the gap is, and it cannot compete with the frame. */
  M.archSteel = cel({ color: 0xa8b6c0, bands: 3, tint: 0x63607f });
  /* Paint on gravel: the orbit rings, the practice box, the centre lines.
   * `ringMid` is the 10 m ring, which is the one a pilot holds, so it is the
   * one that is a different colour. */
  M.ringLine = flat({ color: PAL.lineWhite });
  M.ringMid = flat({ color: PAL.lineYellow });
  /* The wind sock, which is the one thing a flying field has to have. */
  M.orangeSock = flat({ color: PAL.orange });
  /*
   * The town's own terrain colour, byte for byte the arguments `street.js`
   * passes, so `cel`'s cache hands back the SAME material and the training
   * field's apron merges into the same bucket as the grid it continues.
   */
  M.terrain = cel({ color: 0xc4c4b6, bands: 3, tint: 0x7a7396 });
  M.tileLane = flat({ color: 0x2c4c66 });                            // the painted lane line
  /*
   * Water, indoors, seen from above, and it has to be brighter than a
   * reasoning-from-first-principles guess would make it. `flat` is
   * MeshBasicMaterial, so the surface takes no light at all: whatever colour
   * is written here is the colour it is, and inside a hall with a roof on it
   * everything around it is a lit cel surface in shade. Measured against the
   * first pass at 0x86bccb, the pool read as wet asphalt. It is the tile
   * under it that carries the colour of a pool, so this is the tile's own
   * blue opened up rather than the canal's grey green.
   */
  M.poolWater = flat({ color: 0x9ad9e2 });
  M.poolWaterDeep = flat({ color: 0x74b8ca });
  return M;
}

/* ------------------------------------------------------------------ *
 * The three primitives. Everything in both places is made of these.
 * ------------------------------------------------------------------ */

/**
 * A box that is drawn AND solid, from (x0, y0, z0) to (x1, y1, z1).
 *
 * `opts.solid: false` draws it and leaves it hollow, for something a quad
 * should pass through. Everything else is shadow flags.
 *
 * SKIPFIT IS ON BY DEFAULT HERE, AND IT HAS TO BE.
 *
 * The slab fit in src/maps/city/index.js exists to repair the town's own
 * walker rectangles, which stand off the drawing they belong to. It trims
 * them, it cuts them where the drawing leaves a hole, and for a rectangle
 * bulky enough to be a building it also lets the box reach ROOF_LIFT_MAX
 * ABOVE its authored top before the cut runs, so a collider authored to the
 * wall plate can grow onto the roof that was drawn over it. That last part is
 * right for a house and catastrophic for a box that was authored to hug in
 * the first place.
 *
 * MEASURED, before this default was set: the empty pool's floor slabs are
 * 10.4 by 9.0 m and 14.6 by 9.0 m in plan, which is bulkier than a house, so
 * the fit lifted both of them from the tile they were authored on up to the
 * coping 0.49 m above the deck, and the drawing it hugged on the way is the
 * tide mark, the lane paint and the springboard. The bowl came out SOLID: a
 * box x 74.00..88.60, y -2.40..0.49, z 87.60..96.60, with the pool it is
 * supposed to be the floor of inside it.
 *
 * So a box written together with its mesh says so, and the fit leaves it
 * alone. There is nothing for it to repair: the drawing and the solid are
 * the same six numbers. `skipFit: false` asks for the fit back, and nothing
 * in these two places wants it.
 */
export function slab(ctx, mat, x0, y0, z0, x1, y1, z1, opts = {}) {
  const xa = Math.min(x0, x1);
  const xb = Math.max(x0, x1);
  const ya = Math.min(y0, y1);
  const yb = Math.max(y0, y1);
  const za = Math.min(z0, z1);
  const zb = Math.max(z0, z1);
  /* Two millimetres, the same floor Industrial bando uses. A wall panel
   * computed to zero width by a hole that reaches the end of a run is a
   * legitimate result and must not become a degenerate mesh. */
  if (xb - xa < 0.002 || yb - ya < 0.002 || zb - za < 0.002) {
    return null;
  }
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(xb - xa, yb - ya, zb - za), mat);
  mesh.position.set((xa + xb) * 0.5, (ya + yb) * 0.5, (za + zb) * 0.5);
  mesh.castShadow = opts.cast !== false;
  mesh.receiveShadow = opts.receive !== false;
  if (opts.name) {
    mesh.name = opts.name;
  }
  if (opts.noOutline) {
    mesh.userData.noOutline = true;
  }
  ctx.add(mesh);
  if (opts.solid !== false) {
    ctx.collide(xa, za, xb, zb, yb, ya, opts.skipFit !== false);
  }
  return mesh;
}

/*
 * Drawn and not solid: paint, glazing, a rib, a stain, a sign board.
 *
 * THE NAME IS LOAD BEARING AND IT ENDS IN `Trim`. Two passes over the built
 * town read mesh names to decide what a drawn thing means. The cover pass in
 * src/maps/city/index.js hands a collider to anything drawn that has none,
 * which for a 20 mm pane of paint standing off a wall would be a second box
 * in the same place; and the audit in src/maps/city/scan.js counts a drawn
 * thing that is not inside something solid as a HOLE, which is the number
 * check 15 gates on. Both take a regular expression of names to leave alone,
 * `Trim` is in both, and every non solid mesh these two places make carries
 * it. A SOLID mesh must never be given this name: the fit would then stop
 * seeing the drawing its collider stands for.
 */
export function decal(ctx, mat, x0, y0, z0, x1, y1, z1, opts = {}) {
  return slab(ctx, mat, x0, y0, z0, x1, y1, z1, {
    ...opts,
    name: `${opts.name ?? 'place'}Trim`,
    solid: false,
    cast: false,
    receive: false,
    noOutline: opts.noOutline !== false,
  });
}

/** Solid and not drawn. Used where one mesh covers several collider boxes.
 * Held out of the fit for the same reason `slab` is. */
export function hit(ctx, x0, y0, z0, x1, y1, z1, skipFit) {
  ctx.collide(
    Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1),
    Math.max(y0, y1), Math.min(y0, y1), skipFit !== false,
  );
}

/**
 * A landable surface: the slab, its collider, and a platform so
 * `world.heightAt` puts a quad on top of it.
 *
 * `top` is the walking surface. The slab hangs `thick` below it, and the
 * collider stops `SLAB_CLEAR` under the top so a craft descending onto the
 * deck meets the landing judgement first and the box only ever catches
 * something arriving from underneath. That is the same rule
 * `src/maps/city/index.js` applies to the town's own platforms, written here
 * rather than left to it, because the pass there only fires on platforms
 * that have no collider of their own.
 */
export function deck(ctx, mat, x0, z0, x1, z1, top, opts = {}) {
  const thick = opts.thick ?? SLAB_THICK;
  const xa = Math.min(x0, x1);
  const xb = Math.max(x0, x1);
  const za = Math.min(z0, z1);
  const zb = Math.max(z0, z1);
  slab(ctx, mat, xa, top - thick, za, xb, top, zb, { ...opts, solid: false });
  if (opts.solid !== false && top - GROUND >= PLATFORM_MIN) {
    hit(ctx, xa, top - thick, za, xb, top - SLAB_CLEAR, zb, opts.skipFit);
  }
  ctx.platform({ x0: xa, z0: za, x1: xb, z1: zb, top });
  return { x0: xa, z0: za, x1: xb, z1: zb, top };
}

/** A square section post, column or bollard. */
export function post(ctx, mat, x, z, y0, y1, r, opts = {}) {
  return slab(ctx, mat, x - r, y0, z - r, x + r, y1, z + r, opts);
}

/* ------------------------------------------------------------------ *
 * Walls with holes in them, which is the whole reason this file exists.
 * ------------------------------------------------------------------ */

/**
 * A flat wall with rectangular openings cut out of it.
 *
 * THE OPENING IS THE POINT. Every door, every window, every missing sheet of
 * cladding in both places is a line a quad is meant to fly. Authoring the
 * wall as one box and hoping the collider fit finds the hole is exactly the
 * failure mode the town spent a round of PROGRESS.md on: the fit can only
 * cut where the DRAWING has a hole, and a single box has none. So the hole
 * is cut here, in the authoring, and the wall arrives as the four or five
 * pieces that are actually there.
 *
 * The cut is a guillotine over the coordinates the holes introduce: every
 * hole edge becomes a grid line, every cell that no hole covers becomes a
 * piece, and runs of cells along the wall in the same band merge back into
 * one piece so a wall with two windows is five boxes and not thirty.
 *
 *   axis   'x' spans along x with thickness along z (a wall you see from
 *          +z or -z); 'z' spans along z with thickness along x.
 *   at     the wall's centreline on its thickness axis.
 *   t      thickness.
 *   from,to  the span.
 *   y0,y1  the wall's own top and bottom.
 *   holes  [{ from, to, y0, y1 }] in the same coordinates.
 */
export function wallPanel(ctx, mat, o) {
  const axis = o.axis ?? 'x';
  const t = o.t ?? 0.22;
  const a0 = Math.min(o.from, o.to);
  const a1 = Math.max(o.from, o.to);
  const p0 = o.at - t / 2;
  const p1 = o.at + t / 2;
  const holes = (o.holes ?? []).filter(
    (h) => h.to > a0 && h.from < a1 && h.y1 > o.y0 && h.y0 < o.y1,
  );

  const xs = new Set([a0, a1]);
  const ys = new Set([o.y0, o.y1]);
  for (const h of holes) {
    xs.add(Math.max(a0, h.from));
    xs.add(Math.min(a1, h.to));
    ys.add(Math.max(o.y0, h.y0));
    ys.add(Math.min(o.y1, h.y1));
  }
  const A = [...xs].sort((m, n) => m - n);
  const Y = [...ys].sort((m, n) => m - n);

  const pieces = [];
  for (let j = 0; j < Y.length - 1; j += 1) {
    const yc = (Y[j] + Y[j + 1]) / 2;
    let run = null;
    for (let i = 0; i < A.length - 1; i += 1) {
      const ac = (A[i] + A[i + 1]) / 2;
      const open = holes.some((h) => ac > h.from && ac < h.to && yc > h.y0 && yc < h.y1);
      if (open) {
        if (run) {
          pieces.push(run);
          run = null;
        }
        continue;
      }
      if (run && Math.abs(run.a1 - A[i]) < 1e-6) {
        run.a1 = A[i + 1];
      } else {
        if (run) {
          pieces.push(run);
        }
        run = { a0: A[i], a1: A[i + 1], y0: Y[j], y1: Y[j + 1] };
      }
    }
    if (run) {
      pieces.push(run);
    }
  }

  const made = [];
  for (const p of pieces) {
    const m = axis === 'z'
      ? slab(ctx, mat, p0, p.y0, p.a0, p1, p.y1, p.a1, o)
      : slab(ctx, mat, p.a0, p.y0, p0, p.a1, p.y1, p1, o);
    if (m) {
      made.push(m);
    }
  }
  return { pieces, meshes: made };
}

/**
 * Profiled steel sheet: the ribs, drawn over whatever wall is behind them.
 *
 * Corrugated cladding is the single strongest read the works has, and under
 * this town's ink pass it is nearly free: the pass draws a line at every
 * depth step, so a row of 40 mm ribs standing 30 mm off the wall becomes a
 * ruled field of vertical lines for the price of one merged mesh with no
 * collider. `holes` skips the ribs where the sheet is missing, so the gap
 * reads as a gap rather than as a hole in a striped wall.
 */
export function ribs(ctx, mat, o) {
  const axis = o.axis ?? 'x';
  const a0 = Math.min(o.from, o.to);
  const a1 = Math.max(o.from, o.to);
  const pitch = o.pitch ?? 0.42;
  const w = o.w ?? 0.08;
  const depth = o.depth ?? 0.035;
  const face = o.face ?? 1;         // which side of `at` the ribs stand on
  const holes = o.holes ?? [];
  const parts = [];
  const n = Math.floor((a1 - a0) / pitch);
  for (let i = 0; i <= n; i += 1) {
    const a = a0 + (a1 - a0) * (i / Math.max(1, n));
    if (holes.some((h) => a > h.from - w && a < h.to + w && o.y1 > h.y0 && o.y0 < h.y1)) {
      continue;
    }
    const geo = axis === 'z'
      ? new THREE.BoxGeometry(depth, o.y1 - o.y0, w)
      : new THREE.BoxGeometry(w, o.y1 - o.y0, depth);
    const cy = (o.y0 + o.y1) / 2;
    parts.push({
      geometry: geo,
      matrix: axis === 'z'
        ? trs(o.at + face * depth / 2, cy, a)
        : trs(a, cy, o.at + face * depth / 2),
    });
  }
  if (!parts.length) {
    return null;
  }
  const mesh = new THREE.Mesh(bake(parts), mat);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.name = `${o.name ?? 'cladRib'}Trim`;
  ctx.add(mesh);
  return mesh;
}

/**
 * A flat sign, poster or painted panel hung on a wall. Never solid: a sign
 * standing 20 mm off a wall that is already solid would be a second box in
 * the same place, and the collider audit counts that as overlap.
 */
export function board(ctx, tex, o) {
  const g = new THREE.PlaneGeometry(o.w, o.h);
  const mesh = new THREE.Mesh(g, flat({
    map: tex, transparent: o.transparent === true, alphaTest: o.transparent ? 0.4 : 0,
    side: THREE.FrontSide, cache: false,
  }));
  mesh.position.set(o.x, o.y, o.z);
  if (o.ry) {
    mesh.rotation.y = o.ry;
  }
  if (o.rx) {
    mesh.rotation.x = o.rx;
  }
  mesh.userData.noOutline = true;
  mesh.renderOrder = 1;
  mesh.name = `${o.name ?? 'board'}Trim`;
  ctx.add(mesh);
  return mesh;
}

/**
 * Weeds through a crack, an oil stain, a puddle: a flat patch lying on a
 * surface. Out of the depth buffer, so the ink pass does not draw a line
 * round every one of them.
 */
export function patch(ctx, color, o) {
  const g = o.round
    ? new THREE.CircleGeometry(o.r ?? 1, o.seg ?? 12)
    : new THREE.PlaneGeometry(o.w ?? 1, o.d ?? 1);
  g.rotateX(-Math.PI / 2);
  /*
   * `cache: true`, unlike the town's own `dapple`, and it matters. Every
   * patch in these two places with the same colour and opacity then shares
   * ONE material, so the merge in ./bake.js puts the whole lot into a single
   * bucket. Cached the other way each stain is its own material, its own
   * bucket and its own draw call, which is how Industrial bando ends up
   * spending a quarter of its draw calls on stickers. Draw calls are the
   * scarce thing in this town, not materials.
   */
  const mesh = new THREE.Mesh(g, flat({
    color, transparent: true, opacity: o.opacity ?? 0.35, depthWrite: false,
  }));
  mesh.position.set(o.x, o.y, o.z);
  if (o.ry) {
    mesh.rotation.y = o.ry;
  }
  if (o.sx || o.sz) {
    mesh.scale.set(o.sx ?? 1, 1, o.sz ?? 1);
  }
  mesh.userData.noOutline = true;
  mesh.renderOrder = 1;
  mesh.name = `${o.name ?? 'patch'}Trim`;
  ctx.add(mesh);
  return mesh;
}
