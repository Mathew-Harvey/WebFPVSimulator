/*
 * bits.js: the few shapes every building on the estate is made of, in the
 * plan's frame (./frame.js): a wall with holes in it, a slab with holes in
 * it, a flight of stairs, a slab that has come down and leans, a bar of
 * rebar. Pure, as ./frame.js is, so the solids build and check in Node.
 *
 * A HOLE IS A LINE. The same rule src/props/parts.js keeps for its wall: a
 * rectangle with rectangles cut out of it becomes the boxes that are left,
 * cut on every hole's edges and merged back along each band, so a wall with
 * two windows is five boxes and not thirty, and a slab with a hole in it is
 * four. The gap rule (src/props/parts.js GAP_MIN) is the caller's: every
 * hole on the estate is either at least 1.4 m each way or not there.
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

/*
 * The pieces of the rectangle [a0, a1] by [b0, b1] that no hole covers,
 * each [a0, a1, b0, b1], merged along a. Holes are { a0, a1, b0, b1 }.
 */
export function cutRect(a0, a1, b0, b1, holes) {
  const hs = holes.filter((h) => h.a1 > a0 && h.a0 < a1 && h.b1 > b0 && h.b0 < b1);
  const A = new Set([a0, a1]);
  const B = new Set([b0, b1]);
  for (const h of hs) {
    A.add(Math.max(a0, h.a0));
    A.add(Math.min(a1, h.a1));
    B.add(Math.max(b0, h.b0));
    B.add(Math.min(b1, h.b1));
  }
  const as = [...A].sort((p, q) => p - q);
  const bs = [...B].sort((p, q) => p - q);
  const out = [];
  for (let j = 0; j + 1 < bs.length; j += 1) {
    const bc = (bs[j] + bs[j + 1]) / 2;
    let run = null;
    for (let i = 0; i + 1 < as.length; i += 1) {
      const ac = (as[i] + as[i + 1]) / 2;
      const open = hs.some((h) => ac > h.a0 && ac < h.a1 && bc > h.b0 && bc < h.b1);
      if (open) {
        if (run) {
          out.push(run);
          run = null;
        }
        continue;
      }
      if (run && Math.abs(run[1] - as[i]) < 1e-9) {
        run[1] = as[i + 1];
      } else {
        if (run) {
          out.push(run);
        }
        run = [as[i], as[i + 1], bs[j], bs[j + 1]];
      }
    }
    if (run) {
      out.push(run);
    }
  }
  /* Merge runs that stack exactly into one taller piece. */
  const merged = [];
  for (const r of out) {
    const m = merged.find((q) => Math.abs(q[0] - r[0]) < 1e-9 && Math.abs(q[1] - r[1]) < 1e-9 && Math.abs(q[3] - r[2]) < 1e-9);
    if (m) {
      m[3] = r[3];
    } else {
      merged.push([...r]);
    }
  }
  return merged.filter((r) => r[1] - r[0] > 0.002 && r[3] - r[2] > 0.002);
}

/*
 * A wall standing on a plan line. axis 'x' runs along px at py = `at`,
 * axis 'y' along py at px = `at`; t thick, from..to along it, h0..h1 up.
 * Holes are { from, to, h0, h1 } in the same terms. Returns the parts.
 */
export function wall(T, m, axis, at, t, from, to, h0, h1, holes = [], opts = {}) {
  const pieces = cutRect(Math.min(from, to), Math.max(from, to), h0, h1, holes.map((h) => ({ a0: h.from, a1: h.to, b0: h.h0, b1: h.h1 })));
  const out = [];
  for (const [a0, a1, b0, b1] of pieces) {
    out.push(axis === 'x'
      ? T.box(m, a0, at - t / 2, b0, a1, at + t / 2, b1, opts)
      : T.box(m, at - t / 2, a0, b0, at + t / 2, a1, b1, opts));
  }
  return out;
}

/* A level slab from (x0, y0) to (x1, y1), h0..h1 up, with plan holes
 * { x0, x1, y0, y1 } cut out of it. */
export function slab(T, m, x0, y0, x1, y1, h0, h1, holes = [], opts = {}) {
  const pieces = cutRect(x0, x1, y0, y1, holes.map((h) => ({ a0: h.x0, a1: h.x1, b0: h.y0, b1: h.y1 })));
  return pieces.map(([a0, a1, b0, b1]) => T.box(m, a0, b0, h0, a1, b1, h1, opts));
}

/*
 * A FLIGHT OF STAIRS rising along a plan axis: 'y+' climbs north, 'y-'
 * south, 'x+' east, 'x-' west. (s0) is where its foot is along that axis,
 * `run` its length, (c0, c1) its width across, h0 to h1 its rise, n its
 * steps. Drawn as one sawtooth extruded across it with a waist under it;
 * solid as `n / 2` boxes each under the nosings it carries, so the stair a
 * quad lands on is never above the stair it sees.
 */
export function flight(T, m, dir, s0, run, c0, c1, h0, h1, n = 10) {
  const sgn = dir.endsWith('+') ? 1 : -1;
  const rise = (h1 - h0) / n;
  const go = run / n;
  const prof = [];
  /* Along the axis from the foot, the nosings up, then the waist back. */
  prof.push([s0, h0]);
  for (let k = 0; k < n; k += 1) {
    prof.push([s0 + sgn * k * go, h0 + (k + 1) * rise]);
    prof.push([s0 + sgn * (k + 1) * go, h0 + (k + 1) * rise]);
  }
  prof.push([s0 + sgn * run, h1 - 0.22]);
  prof.push([s0, h0 - 0.22]);
  const along = dir[0] === 'y' ? 'x' : 'y';
  /* A profile must wind one way: if it runs backward along a, reverse. */
  T.prism(m, along, sgn > 0 ? prof : prof.slice().reverse(), Math.min(c0, c1), Math.max(c0, c1));
  const boxes = Math.max(2, Math.round(n / 2));
  for (let k = 0; k < boxes; k += 1) {
    const a = s0 + (sgn * run * k) / boxes;
    const b = s0 + (sgn * run * (k + 1)) / boxes;
    const top = h0 + ((h1 - h0) * k) / boxes + rise;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const bottom = Math.max(h0 - 0.22, top - 0.6);
    if (dir[0] === 'y') {
      T.box(m, Math.min(c0, c1), lo, bottom, Math.max(c0, c1), hi, top, { draw: false, name: 'stair' });
    } else {
      T.box(m, lo, Math.min(c0, c1), bottom, hi, Math.max(c0, c1), top, { draw: false, name: 'stair' });
    }
  }
}

/*
 * A SLOPED PLATE, a slab that came down and leans or a balustrade that
 * follows a flight: along 'x' it runs over px from a0, where its top is
 * hA, to a1, where its top is hB, and spans b0..b1 of py; along 'y' the
 * same with px and py swapped. Drawn as one plate `t` deep; solid, unless
 * `solid` is false, as `n` boxes each with its top at the lower end of
 * the slope over it, so what a quad skims is never above what it sees.
 */
export function sloped(T, m, axis, a0, a1, hA, hB, b0, b1, t = 0.25, n = 4, solid = true, name = 'fallen slab') {
  const prof = [[a0, hA], [a1, hB], [a1, hB - t], [a0, hA - t]];
  T.prism(m, axis === 'x' ? 'y' : 'x', prof, Math.min(b0, b1), Math.max(b0, b1));
  if (!solid) {
    return;
  }
  for (let k = 0; k < n; k += 1) {
    const s0 = a0 + ((a1 - a0) * k) / n;
    const s1 = a0 + ((a1 - a0) * (k + 1)) / n;
    const top = Math.min(hA + ((hB - hA) * k) / n, hA + ((hB - hA) * (k + 1)) / n) - 0.02;
    const bot = top - t - 0.3;
    const lo = Math.min(s0, s1);
    const hi = Math.max(s0, s1);
    if (axis === 'x') {
      T.box(m, lo, Math.min(b0, b1), bot, hi, Math.max(b0, b1), top, { draw: false, name });
    } else {
      T.box(m, Math.min(b0, b1), lo, bot, Math.max(b0, b1), hi, top, { draw: false, name });
    }
  }
}

/*
 * REBAR along a broken edge: bars out of the edge of a hole every `pitch`
 * metres, each bent down a little at its end, drawn only and fine. The
 * edge runs from (x0, y0) to (x1, y1) at h; (ox, oy) is the way out of the
 * concrete into the hole, a unit plan vector.
 */
export function rebar(T, x0, y0, x1, y1, h, ox, oy, rng, pitch = 0.3) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.max(1, Math.floor(len / pitch));
  for (let k = 0; k < n; k += 1) {
    if (rng.chance(0.35)) {
      continue;
    }
    const f = (k + 0.5) / n;
    const px = x0 + (x1 - x0) * f;
    const py = y0 + (y1 - y0) * f;
    const out = rng.range(0.25, 0.9);
    const droop = rng.range(0.05, 0.45);
    T.cyl('bandoRebar', [px, py, h], [px + ox * out, py + oy * out, h - droop], 0.012, 3, null, true);
  }
}
