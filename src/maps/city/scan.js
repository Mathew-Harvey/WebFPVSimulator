/*
 * scan.js: does the solid world hug the drawn one, and does it hug it
 * without opening a hole.
 *
 * WHY THIS IS A FILE AND NOT A COMMENT. The city's contact model is built by
 * a fit (src/maps/city/index.js) that trims the town's walker keep-out
 * rectangles onto the geometry they stand for, and the two ways it can be
 * wrong point in opposite directions. Trim too little and a barrier stands
 * off the wall it belongs to, which a pilot flying the gaps reads as an
 * invisible wall. Trim too much and the box stops reaching into something
 * that is drawn, dense and on screen, which is a hole through the scenery.
 * Every previous round of this work was argued from anecdote in one
 * direction and from a hand run scan in the other, and the scan was never
 * committed, so the next round could not reproduce it.
 *
 * TWO MEASUREMENTS, ONE PER FAILURE DIRECTION.
 *
 *   PHANTOM. Every collider's footprint is rasterised at SCAN_CELL and each
 *   cell is asked how high the drawn world reaches there. The solid volume
 *   above that answer is volume a quad meets and a pilot cannot see. It is
 *   reported per collider and summed, so "the collisions hug the graphics"
 *   becomes a cubic metre count that can go down between rounds.
 *
 *   HOLES. Every compact drawn object is probed with the same segment query
 *   the frame loop makes, driven through the object half a metre below its
 *   own top. Anything the query misses is drawn scenery a quad flies
 *   through. A trim that opens one of these is worse than the wall it
 *   removed, so this is the gate on the other measurement.
 *
 * BOTH READ THE TOWN BEFORE THE BAKE. src/maps/city/bake.js merges every
 * static mesh sharing a material inside a cell, and applies each instance's
 * matrix into its vertices while doing it, so afterwards a wall is anonymous
 * floats in a shared buffer and its own extent is unrecoverable. This runs
 * between colliders.build() and bakeCity() for that reason, which is the one
 * window where both the per mesh geometry and the finished collider set
 * exist at the same time.
 *
 * IT IS OFF UNLESS ASKED FOR. globalThis.__CITY_SCAN gates it, because the
 * rasterisation is seconds rather than the fit's hundred milliseconds and no
 * player's load should pay for a diagnostic. scripts/collider-audit.js sets
 * the flag and prints the result.
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

import { drawnBoxes } from './drawn.js';

/*
 * The rasterisation step, in metres. Half a metre is finer than the craft's
 * 0.347 m sweep, so a gap this scan calls open is a gap the quad fits
 * through, and coarse enough that the largest collider in the town rasters
 * in a few thousand cells rather than a hundred thousand.
 */
const SCAN_CELL = 0.5;
/*
 * And the floor under it, because the raster has to be finer than the thing
 * being measured or it cannot see it.
 *
 * The first version of this rastered every collider at half a metre and
 * reported 162 m3 of phantom across the whole town, which is a number that
 * says the problem does not exist. It does exist: the complaint is a
 * barrier 0.24 m thick standing off its wall by 0.1 m, and a 0.5 m cell
 * straddling that barrier finds the barrier's own mesh in it and calls the
 * cell honest. So the step is the thinner of SCAN_CELL and a quarter of the
 * collider's own thinnest horizontal extent, down to SCAN_MIN, which puts
 * at least two cells of clear air either side of anything the town draws.
 */
const SCAN_MIN = 0.05;
/* Broadphase over the drawn meshes for the raster. Build time only. */
const INDEX_CELL = 4;
/* A collider bigger than this many cells is sampled on a coarser stride
 * rather than skipped, so the lake edge and the hills still get an answer
 * and the scan still finishes. */
const MAX_CELLS = 20000;
/* Slack on "the drawn world reaches the top of this box" and "nothing is
 * drawn inside this box at all". A centimetre either way is modelling
 * noise, not a phantom. */
const EPS = 0.05;

/*
 * Every drawn mesh in the town, as world space boxes, with nothing excluded.
 *
 * The FIT deliberately drops meshes with a footprint over 1400 m2, because
 * the terrain and the lake are not what a 7 m plot rectangle stands for and
 * letting one vote would hold every collider at full size. The SCAN wants
 * the opposite: the road under a barrier is exactly the answer to "how high
 * does the drawn world reach here", and dropping it would report the whole
 * barrier as phantom. So this keeps everything, and it reads the same
 * subdivided picture the fit does, so the two cannot disagree about where
 * a roof slope is.
 */
export function drawnWorldBoxes(root) {
  return drawnBoxes(root);
}

/*
 * Broadphase over the drawn meshes.
 *
 * A mesh that spans a quarter of the town lands in thousands of cells and
 * every one of them then has to be walked. The terrain tiles are exactly
 * that, and they are the reason the FIT has a footprint cap at all. They are
 * also useless as an answer to "how high is the drawn world here", because
 * one bounding box cannot say anything about one point on a hill, so they
 * are dropped from the index entirely and world.heightAt answers instead.
 * The list of what was dropped is returned so nothing is silently missing.
 */
export function buildIndex(boxes) {
  const grid = new Map();
  const wide = [];
  for (let i = 0; i < boxes.length; i += 1) {
    const g = boxes[i];
    const a0 = Math.floor(g.x0 / INDEX_CELL);
    const a1 = Math.floor(g.x1 / INDEX_CELL);
    const b0 = Math.floor(g.z0 / INDEX_CELL);
    const b1 = Math.floor(g.z1 / INDEX_CELL);
    if ((a1 - a0 + 1) * (b1 - b0 + 1) > 400) {
      wide.push(i);
      continue;
    }
    for (let a = a0; a <= a1; a += 1) {
      for (let b = b0; b <= b1; b += 1) {
        const k = `${a},${b}`;
        const bucket = grid.get(k);
        if (bucket === undefined) {
          grid.set(k, [i]);
        } else {
          bucket.push(i);
        }
      }
    }
  }
  return { grid, wide };
}

/*
 * What the drawn world OCCUPIES over one cell, as a column of 32 slices
 * between the collider's floor and its top.
 *
 * TWO EARLIER VERSIONS OF THIS WERE BOTH WRONG, IN OPPOSITE DIRECTIONS, AND
 * BOTH WERE WRONG BECAUSE THEY ASKED FOR A SINGLE HEIGHT.
 *
 * "How high does the drawing reach here" counts the whole column under a
 * roof as justified, which is right for a house and wrong for a tree: a
 * canopy collider hanging eighteen metres up over a stand of cedars read as
 * five metres of solid with nothing under it, when what is under it is the
 * rest of the canopy.
 *
 * "Where is the lowest and highest thing here" fixes the tree and breaks the
 * barrier: a fence post at ground level and a wire at four metres would
 * between them justify the four metres of air in the middle.
 *
 * A column of slices answers both. Each mesh sets the slices it actually
 * spans, and the phantom is the slices nothing set. 32 slices over the
 * collider's own reachable height is finer than the craft for anything up to
 * 11 m tall, which is every collider in this town a pilot meets at speed.
 *
 * THE WIDE LIST IS DELIBERATELY NOT READ HERE. A terrain tile is one mesh
 * spanning hundreds of metres, and its bounding box's top is the highest
 * point anywhere on the tile, so asking that box "how high is the ground
 * here" answers with the hill on the far side of town. The first version of
 * this scan did read it and reported 162 m3 of phantom across the whole map,
 * which is a number that says the problem does not exist. The ground is
 * answered by world.heightAt instead, which is the same query the flight
 * loop makes and is exact.
 */
const SLICES = 32;

function cellColumn(boxes, grid, cx0, cz0, cx1, cz1, floor, top) {
  let mask = 0;
  let anyTop = -Infinity;
  const span = top - floor;
  if (!(span > 0)) {
    return { mask: -1, anyTop };
  }
  const a0 = Math.floor(cx0 / INDEX_CELL);
  const a1 = Math.floor(cx1 / INDEX_CELL);
  const b0 = Math.floor(cz0 / INDEX_CELL);
  const b1 = Math.floor(cz1 / INDEX_CELL);
  for (let a = a0; a <= a1; a += 1) {
    for (let b = b0; b <= b1; b += 1) {
      const bucket = grid.get(`${a},${b}`);
      if (bucket === undefined) {
        continue;
      }
      for (let k = 0; k < bucket.length; k += 1) {
        const g = boxes[bucket[k]];
        if (g.x1 <= cx0 || g.x0 >= cx1 || g.z1 <= cz0 || g.z0 >= cz1) {
          continue;
        }
        if (g.y1 <= floor || g.y0 >= top) {
          continue;
        }
        if (g.y1 > anyTop) {
          anyTop = g.y1;
        }
        let s0 = Math.floor(((g.y0 - floor) / span) * SLICES);
        let s1 = Math.ceil(((g.y1 - floor) / span) * SLICES) - 1;
        if (s0 < 0) { s0 = 0; }
        if (s1 > SLICES - 1) { s1 = SLICES - 1; }
        if (s1 < s0) { s1 = s0; }
        for (let sIdx = s0; sIdx <= s1; sIdx += 1) {
          mask |= (1 << sIdx);
        }
        if (mask === -1) {
          return { mask, anyTop };
        }
      }
    }
  }
  return { mask, anyTop };
}

function popcount(v) {
  let x = v - ((v >> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >> 2) & 0x33333333);
  x = (x + (x >> 4)) & 0x0f0f0f0f;
  return (x * 0x01010101) >> 24;
}

/*
 * The longest run of empty slices at the TOP of a column, in metres. This is
 * the number a pilot meets first: solid above everything drawn, with clear
 * air under it, is the invisible ceiling over a low roof or a short barrier.
 */
function topRun(mask, sliceH) {
  let n = 0;
  for (let s = SLICES - 1; s >= 0; s -= 1) {
    if ((mask & (1 << s)) !== 0) {
      break;
    }
    n += 1;
  }
  return n * sliceH;
}

/*
 * One collider against the drawn world.
 *
 * Returns the phantom volume, which is the solid volume with nothing drawn in
 * it at all, the fraction of the footprint with nothing drawn in the box, and
 * the fraction where the drawing reaches the box's own top. The first is what
 * a pilot flies into; the second says the box is standing over air; the third
 * says the box is honest.
 *
 * Everything is measured from the GROUND up, not from the box's own bottom: a
 * rectangle with no authored bottom starts sixty metres down and solid rock
 * below the terrain is not something anyone can fly into.
 */
export function scanOne(boxes, grid, groundAt, b) {
  const sx = b.x1 - b.x0;
  const sz = b.z1 - b.z0;
  const sy = b.y1 - b.y0;
  if (!(sx > 0 && sz > 0 && sy > 0)) {
    return null;
  }
  let step = Math.max(SCAN_MIN, Math.min(SCAN_CELL, Math.min(sx, sz) * 0.25));
  while ((sx / step) * (sz / step) > MAX_CELLS) {
    step *= 2;
  }
  const nx = Math.max(1, Math.ceil(sx / step));
  const nz = Math.max(1, Math.ceil(sz / step));
  const dx = sx / nx;
  const dz = sz / nz;
  const cellArea = dx * dz;
  let phantom = 0;
  let reachable = 0;
  let empty = 0;
  let full = 0;
  let worstGap = 0;
  let worstX = 0;
  let worstZ = 0;
  for (let i = 0; i < nx; i += 1) {
    const cx0 = b.x0 + i * dx;
    for (let j = 0; j < nz; j += 1) {
      const cz0 = b.z0 + j * dz;
      const floor = Math.max(b.y0, Math.min(b.y1, groundAt(cx0 + dx * 0.5, cz0 + dz * 0.5, b.y1)));
      const span = b.y1 - floor;
      if (!(span > 0)) {
        continue;
      }
      reachable += span * cellArea;
      const col = cellColumn(boxes, grid, cx0, cz0, cx0 + dx, cz0 + dz, floor, b.y1);
      const sliceH = span / SLICES;
      const setSlices = col.mask === -1 ? SLICES : popcount(col.mask);
      phantom += (SLICES - setSlices) * sliceH * cellArea;
      if (setSlices === 0) {
        empty += 1;
      }
      if (col.anyTop !== -Infinity && col.anyTop >= b.y1 - EPS) {
        full += 1;
      }
      const gap = topRun(col.mask, sliceH);
      if (gap > worstGap) {
        worstGap = gap;
        worstX = cx0 + dx * 0.5;
        worstZ = cz0 + dz * 0.5;
      }
    }
  }
  const cells = nx * nz;
  return {
    phantom,
    emptyFrac: empty / cells,
    fullFrac: full / cells,
    worstGap,
    worstAt: [worstX, worstZ],
    volume: reachable,
  };
}

/*
 * The phantom half of the scan, over every collider in the finished set.
 *
 * `colliders` is a built src/game/collide.js set, read through its flat
 * arrays. Moving boxes are not scanned: the train's box is measured off the
 * car's own meshes and then only translated, so it hugs by construction and
 * has no fixed place to raster against.
 */
export function scanPhantom(colliders, boxes, grid, groundAt, keep = 60) {
  const worst = [];
  let total = 0;
  let solidVolume = 0;
  let overFive = 0;
  let overOne = 0;
  let standingOnAir = 0;
  const byKind = {};
  const n = colliders.fkind.length;
  for (let i = 0; i < n; i += 1) {
    if (!colliders.fbox[i]) {
      continue;
    }
    const b = {
      x0: colliders.fax[i],
      y0: colliders.fay[i],
      z0: colliders.faz[i],
      x1: colliders.fbx[i],
      y1: colliders.fby[i],
      z1: colliders.fbz[i],
    };
    const r = scanOne(boxes, grid, groundAt, b);
    if (r === null) {
      continue;
    }
    const kind = colliders.kindName(colliders.fkind[i]);
    total += r.phantom;
    solidVolume += r.volume;
    if (byKind[kind] === undefined) {
      byKind[kind] = { count: 0, phantom: 0 };
    }
    byKind[kind].count += 1;
    byKind[kind].phantom += r.phantom;
    if (r.worstGap > 5) {
      overFive += 1;
    }
    if (r.worstGap > 1) {
      overOne += 1;
    }
    if (r.emptyFrac > 0.9) {
      standingOnAir += 1;
    }
    worst.push({
      i,
      kind,
      phantom: +r.phantom.toFixed(1),
      gap: +r.worstGap.toFixed(2),
      empty: +r.emptyFrac.toFixed(2),
      full: +r.fullFrac.toFixed(2),
      size: [+(b.x1 - b.x0).toFixed(2), +(b.y1 - b.y0).toFixed(2), +(b.z1 - b.z0).toFixed(2)],
      at: [+((b.x0 + b.x1) / 2).toFixed(1), +b.y1.toFixed(1), +((b.z0 + b.z1) / 2).toFixed(1)],
      worstAt: [+r.worstAt[0].toFixed(1), +r.worstAt[1].toFixed(1)],
    });
  }
  worst.sort((a, c) => c.phantom - a.phantom);
  for (const k of Object.keys(byKind)) {
    byKind[k].phantom = +byKind[k].phantom.toFixed(0);
  }
  return {
    boxes: n,
    totalPhantom: +total.toFixed(0),
    solidVolume: +solidVolume.toFixed(0),
    overFive,
    overOne,
    standingOnAir,
    byKind,
    worst: worst.slice(0, keep),
  };
}

/*
 * The hole half: is every drawn thing actually solid.
 *
 * THE FIRST VERSION DROVE A SEGMENT THROUGH EACH OBJECT AND IT WAS THE WRONG
 * INSTRUMENT. A segment misses a collider that is real but thin, or offset by
 * a few centimetres, or split into two boxes with the probe line running down
 * the join, so it reported holes that were not holes and its count moved for
 * reasons that had nothing to do with the fit. What the question actually is:
 * how much of this drawn object has solid in it. So each object is sampled on
 * a 4 by 4 by 4 lattice inside its own box and each sample is asked whether it
 * is inside any collider. The answer is a fraction, and a fraction is
 * something a change can be measured against.
 *
 * Foliage is measured but reported apart. A blossom blob is drawn and is not
 * meant to stop a quad; a wall is. Mixing them makes the number useless.
 */
const HOLE_MIN_SIZE = 0.3;
const HOLE_MAX_SPAN = 30;
const HOLE_SAMPLES = 4;
/* Below this share of an object inside something solid, the object is a
 * hole: a pilot who aims at it goes through it. */
const HOLE_COVER = 0.5;
/* Named the way the town names its soft furnishings. These are drawn and
 * deliberately not solid, or solid as one mass elsewhere. */
/* `Trim` is ./places/kit.js's suffix for a mesh that is drawn and not solid.
 * Same list, same reason as COVER_SOFT in ./index.js: paint on a wall is
 * not a hole in the world. Case sensitive on that one token so it cannot
 * collide with a word inside another name. */
const HOLE_SOFT = /canopy|blossom|petal|reed|tuft|moss|leaf|flower|grass|ivy|lily|ripple|chalk|crow|cat|paper|doormat|wire|cable|rope|banner|noren|flag/i;
const HOLE_SOFT_EXACT = /Trim/;

function colliderIndex(colliders) {
  const cell = 8;
  const grid = new Map();
  const n = colliders.fkind.length;
  for (let i = 0; i < n; i += 1) {
    if (!colliders.fbox[i]) {
      continue;
    }
    const a0 = Math.floor(colliders.fax[i] / cell);
    const a1 = Math.floor(colliders.fbx[i] / cell);
    const b0 = Math.floor(colliders.faz[i] / cell);
    const b1 = Math.floor(colliders.fbz[i] / cell);
    if ((a1 - a0 + 1) * (b1 - b0 + 1) > 4000) {
      continue;
    }
    for (let a = a0; a <= a1; a += 1) {
      for (let b = b0; b <= b1; b += 1) {
        const k = `${a},${b}`;
        const bucket = grid.get(k);
        if (bucket === undefined) {
          grid.set(k, [i]);
        } else {
          bucket.push(i);
        }
      }
    }
  }
  return { grid, cell };
}

function solidAt(colliders, index, x, y, z) {
  const bucket = index.grid.get(`${Math.floor(x / index.cell)},${Math.floor(z / index.cell)}`);
  if (bucket === undefined) {
    return false;
  }
  for (let k = 0; k < bucket.length; k += 1) {
    const i = bucket[k];
    if (x >= colliders.fax[i] && x <= colliders.fbx[i]
      && y >= colliders.fay[i] && y <= colliders.fby[i]
      && z >= colliders.faz[i] && z <= colliders.fbz[i]) {
      return true;
    }
  }
  return false;
}

export function scanHoles(colliders, boxes, keep = 40) {
  const index = colliderIndex(colliders);
  const holes = [];
  const soft = [];
  let probed = 0;
  let softProbed = 0;
  let coveredTotal = 0;
  for (let i = 0; i < boxes.length; i += 1) {
    const g = boxes[i];
    const sx = g.x1 - g.x0;
    const sy = g.y1 - g.y0;
    const sz = g.z1 - g.z0;
    if (sy < HOLE_MIN_SIZE || Math.min(sx, sz) < HOLE_MIN_SIZE) {
      continue;
    }
    if (Math.max(sx, sz) > HOLE_MAX_SPAN) {
      continue;
    }
    let inside = 0;
    for (let a = 0; a < HOLE_SAMPLES; a += 1) {
      const x = g.x0 + sx * (a + 0.5) / HOLE_SAMPLES;
      for (let b = 0; b < HOLE_SAMPLES; b += 1) {
        const y = g.y0 + sy * (b + 0.5) / HOLE_SAMPLES;
        for (let c = 0; c < HOLE_SAMPLES; c += 1) {
          const z = g.z0 + sz * (c + 0.5) / HOLE_SAMPLES;
          if (solidAt(colliders, index, x, y, z)) {
            inside += 1;
          }
        }
      }
    }
    const frac = inside / (HOLE_SAMPLES * HOLE_SAMPLES * HOLE_SAMPLES);
    const isSoft = HOLE_SOFT.test(g.name || '') || HOLE_SOFT_EXACT.test(g.name || '');
    if (isSoft) {
      softProbed += 1;
      if (frac < HOLE_COVER) {
        soft.push({ name: g.name || '?', frac: +frac.toFixed(2) });
      }
      continue;
    }
    probed += 1;
    coveredTotal += frac;
    if (frac < HOLE_COVER) {
      holes.push({
        name: g.name || '?',
        frac: +frac.toFixed(2),
        at: [+((g.x0 + g.x1) / 2).toFixed(1), +((g.y0 + g.y1) / 2).toFixed(1), +((g.z0 + g.z1) / 2).toFixed(1)],
        size: [+sx.toFixed(2), +sy.toFixed(2), +sz.toFixed(2)],
        vol: +(sx * sy * sz).toFixed(2),
      });
    }
  }
  const byName = {};
  for (const h of holes) {
    byName[h.name] = (byName[h.name] ?? 0) + 1;
  }
  const softByName = {};
  for (const h of soft) {
    softByName[h.name] = (softByName[h.name] ?? 0) + 1;
  }
  holes.sort((a, b) => b.vol - a.vol);
  return {
    probed,
    count: holes.length,
    meanCovered: probed ? +(coveredTotal / probed).toFixed(3) : 0,
    byName,
    softProbed,
    softCount: soft.length,
    softByName,
    worst: holes.slice(0, keep),
  };
}

/*
 * The ground, cached. world.heightAt is exact and it is also the town's own
 * terrain query, which is not free, and the raster asks it once per cell
 * across every collider in the map. Rounded to a decimetre, which is under
 * the raster's own finest step and far under any slope the town has.
 */
function groundCache(world) {
  const seen = new Map();
  return (x, z, fromY) => {
    const k = `${Math.round(x * 10)},${Math.round(z * 10)},${Math.round(fromY)}`;
    let v = seen.get(k);
    if (v === undefined) {
      v = world.heightAt(x, z, fromY);
      seen.set(k, v);
    }
    return v;
  };
}

export function scanCity(world, colliders) {
  const t0 = (typeof performance !== 'undefined' ? performance.now() : 0);
  const boxes = drawnWorldBoxes(world.root);
  const { grid } = buildIndex(boxes);
  const groundAt = groundCache(world);
  const phantom = scanPhantom(colliders, boxes, grid, groundAt);
  const holes = scanHoles(colliders, boxes);
  return {
    drawnMeshes: boxes.length,
    phantom,
    holes,
    ms: +((typeof performance !== 'undefined' ? performance.now() : 0) - t0).toFixed(0),
  };
}
