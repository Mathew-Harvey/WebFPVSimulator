/*
 * parts.js: how an asset is written down. Pure data, no Three.js.
 *
 * AN ASSET IS A LIST OF PARTS, AND A PART IS DRAWN AND SOLID IN ONE LINE.
 * The town learned this the expensive way (src/maps/city/places/kit.js): a
 * wall authored as a mesh here and a collider somewhere else drifts, and the
 * drift is an invisible wall or a building a quad flies through. So every
 * asset in src/props/ is written as a list of boxes and capsules, each of
 * which says whether it is drawn, whether it is solid, and what it is made
 * of. The drawing and the physics then read the SAME six numbers, and a gap
 * is the absence of a part rather than a hole somebody hoped a fit would
 * find.
 *
 * Decoration that is not solid (window paint, a sign, a railing's infill,
 * wires) is added by the asset's own draw() on top of the parts. Anything a
 * quad could hit belongs here.
 *
 * WHY NO THREE.JS. The parts decide what is solid, and what is solid goes to
 * the physics. Keeping this file and the layouts that use it free of any
 * renderer means the solids of every asset can be built and checked in plain
 * Node, and it is what lets the track builder warn about a gap between two
 * props without loading a 3D engine.
 *
 * THE LOCAL FRAME, for every asset:
 *
 *   +x   the asset's heading: the way it faces, the way its jib points, the
 *        long side of a container. The document's yaw turns this.
 *   +y   up. Three.js's convention, because the art is drawn in it.
 *   +z   to the asset's RIGHT, seen facing +x. (The document's left is +y,
 *        which becomes -z in the scene, so right is +z.)
 *
 * The origin is the asset's base, on its footprint's centre unless the asset
 * says otherwise. Units are metres.
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

import { sincos } from './trig.js';

/*
 * THE SMALLEST PART THAT MEANS ANYTHING. A panel computed to zero width by a
 * hole that reaches the end of a run is a legitimate result and must not
 * become a degenerate box. Two millimetres, the same floor the town's kit
 * uses.
 */
const MIN_EXTENT = 0.002;

/*
 * THE GAP RULE, which every asset keeps and the builder's warnings check: a
 * space between two solids is either closed, or at least this wide. Anything
 * narrower is a slot a five inch aims at and cannot fit through, which is a
 * trap rather than a line. Taken from Industrial bando's kit by way of
 * src/maps/city/places/works.js.
 */
export const GAP_MIN = 1.4;

/*
 * A list of parts under construction.
 *
 *   box(m, x0, y0, z0, x1, y1, z1, opts)   an axis aligned box in the local
 *                                          frame, any two opposite corners
 *   cap(m, a, b, r, opts)                  a capsule from point a to point b,
 *                                          both [x, y, z], radius r
 *   post(m, x, z, y0, y1, r, opts)         a vertical capsule, drawn as a
 *                                          cylinder: a post, a leg, a trunk
 *
 * opts:
 *   solid   default true. false draws it and lets a quad through.
 *   draw    default true. false makes it solid and invisible, for where one
 *           drawn shape is covered by several solids.
 *   kind    the collider kind, one of src/game/collide.js's KINDS. Decides
 *           the contact material. Boxes default to 'wall', capsules to
 *           'pole', and a capsule thicker than 0.3 m to 'wall'.
 *   look    how a capsule is drawn: 'cyl' (default, a cylinder between the
 *           two ends, which is what a pole or a lattice member is) or
 *           'capsule' (the whole rounded shape, which is what a tank is).
 *   seg     radial segments when drawn. Cel shading wants few.
 *   name    for debugging and the collider audit.
 *   cast    casts a shadow, default true.
 */
export class Parts {
  constructor() {
    this.list = [];
  }

  box(m, x0, y0, z0, x1, y1, z1, opts = {}) {
    const lo = [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)];
    const hi = [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)];
    if (hi[0] - lo[0] < MIN_EXTENT || hi[1] - lo[1] < MIN_EXTENT || hi[2] - lo[2] < MIN_EXTENT) {
      return null;
    }
    const part = {
      t: 'box',
      m,
      lo,
      hi,
      solid: opts.solid !== false,
      draw: opts.draw !== false,
      kind: opts.kind ?? 'wall',
      name: opts.name ?? '',
      cast: opts.cast !== false,
    };
    this.list.push(part);
    return part;
  }

  cap(m, a, b, r, opts = {}) {
    if (!(r > 0)) {
      return null;
    }
    const part = {
      t: 'cap',
      m,
      a: [a[0], a[1], a[2]],
      b: [b[0], b[1], b[2]],
      r,
      solid: opts.solid !== false,
      draw: opts.draw !== false,
      kind: opts.kind ?? (r > 0.3 ? 'wall' : 'pole'),
      look: opts.look ?? 'cyl',
      seg: opts.seg ?? (r > 0.5 ? 12 : r > 0.12 ? 8 : 6),
      /* A cylinder drawn with a different radius at each end, for a tapered
       * chimney or a trunk. The solid is the capsule at `r`. */
      rTop: opts.rTop ?? null,
      name: opts.name ?? '',
      cast: opts.cast !== false,
    };
    this.list.push(part);
    return part;
  }

  post(m, x, z, y0, y1, r, opts = {}) {
    return this.cap(m, [x, y0, z], [x, y1, z], r, opts);
  }

  /*
   * A flat wall with rectangular openings in it, as the boxes that are left.
   *
   * THE OPENING IS THE POINT, the same way it is in the town's own kit: every
   * door, window and missing panel in a freestyle asset is a line a quad is
   * meant to fly, and a wall authored as one box has no hole for anything to
   * find. So the cut happens here. Every hole edge becomes a grid line, every
   * cell no hole covers becomes a piece, and runs along the wall in the same
   * band merge back, so a wall with two windows is five boxes and not thirty.
   *
   *   axis   'x' runs along x with its thickness along z, 'z' the other way
   *   at     the centre of the thickness
   *   t      the thickness
   *   from, to, y0, y1   the wall's extent
   *   holes  [{ from, to, y0, y1 }] in the same coordinates
   */
  wall(m, o, opts = {}) {
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
    const A = [...xs].sort((p, q) => p - q);
    const Y = [...ys].sort((p, q) => p - q);
    const made = [];
    for (let j = 0; j < Y.length - 1; j += 1) {
      const yc = (Y[j] + Y[j + 1]) / 2;
      let run = null;
      const flush = () => {
        if (run) {
          made.push(axis === 'z'
            ? this.box(m, p0, run.y0, run.a0, p1, run.y1, run.a1, opts)
            : this.box(m, run.a0, run.y0, p0, run.a1, run.y1, p1, opts));
          run = null;
        }
      };
      for (let i = 0; i < A.length - 1; i += 1) {
        const ac = (A[i] + A[i + 1]) / 2;
        const open = holes.some((h) => ac > h.from && ac < h.to && yc > h.y0 && yc < h.y1);
        if (open) {
          flush();
          continue;
        }
        if (run && Math.abs(run.a1 - A[i]) < 1e-9) {
          run.a1 = A[i + 1];
        } else {
          flush();
          run = { a0: A[i], a1: A[i + 1], y0: Y[j], y1: Y[j + 1] };
        }
      }
      flush();
    }
    return made.filter(Boolean);
  }

  /*
   * A straight lattice member between two points, and the zigzag braces of a
   * lattice face. Every tower in the library is made of these, and they are
   * solid: a lattice is a thing a quad hits, and threading one is a trick.
   */
  zigzag(m, a0, a1, b0, b1, panels, r, opts = {}) {
    /* Two rails a0 to a1 and b0 to b1, divided into `panels`, with one
     * diagonal per panel alternating in direction. The rails themselves are
     * not added: the caller owns them, because two faces share each one. */
    for (let i = 0; i < panels; i += 1) {
      const t0 = i / panels;
      const t1 = (i + 1) / panels;
      const p = lerp3(a0, a1, i % 2 === 0 ? t0 : t1);
      const q = lerp3(b0, b1, i % 2 === 0 ? t1 : t0);
      this.cap(m, p, q, r, opts);
    }
  }

  /* Horizontal rungs across two rails, at the panel boundaries. */
  rungs(m, a0, a1, b0, b1, panels, r, opts = {}) {
    for (let i = 1; i < panels; i += 1) {
      const t = i / panels;
      this.cap(m, lerp3(a0, a1, t), lerp3(b0, b1, t), r, opts);
    }
  }
}

export function lerp3(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/*
 * A deterministic random stream for an asset, from its identity.
 *
 * A bando's missing floor panels and a stack of containers' colours are
 * random, and they must be THE SAME random every time the map loads, in the
 * builder and in the air, or the hole an author lined up a dive through
 * moves. So the stream is seeded from the element's id and its variant, and
 * it is mulberry32, which is integer arithmetic JavaScript specifies to the
 * bit. It is the town's own generator (vendored core/util.js), restated here
 * so this file needs nothing that imports a renderer.
 */
export function seededRandom(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (lo, hi) => lo + (hi - lo) * next(),
    int: (lo, hi) => Math.floor(lo + (hi - lo + 1) * next()),
    pick: (arr) => arr[Math.floor(next() * arr.length) % arr.length],
    chance: (p) => next() < p,
  };
}

/* FNV-1a over a string, as an unsigned 32 bit seed. */
export function hashString(s) {
  let h = 0x811c9dc5;
  const str = String(s ?? '');
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/* The seed of an element: its id, and the variant the author picked, so
 * pressing Reroll changes the layout and nothing else does. */
export function seedOf(el) {
  const v = Math.round(Number(el?.dims?.variant) || 1);
  return hashString(`${el?.id ?? 'el'}#${v}`);
}

/*
 * A point on a circle, with this module's own sine, for layouts that place
 * things round an axis (a tree's limbs, a tank's legs). Pure arithmetic, so
 * a leg's solid is where it is in every engine.
 */
const SC = { s: 0, c: 1 };
export function around(r, a) {
  sincos(a, SC);
  return [r * SC.c, r * SC.s];
}
