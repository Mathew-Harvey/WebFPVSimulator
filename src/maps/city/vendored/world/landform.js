/* ------------------------------------------------------------------ *
 * Landform.
 *
 * Almost everything in this world sits *on* the ground.  The drainage
 * channel across the tracks is the one thing that goes *into* it, and that
 * turns out to need cooperation from three separate layers:
 *
 *   - the graded terrain grid in `street.js`
 *   - the planet sphere in `planet.js`, which sits 65 mm under it
 *   - the concrete that lines the channel, in `canal.js`
 *
 * Displacing the first two downward does not work: both are tessellated at
 * about two and a half metres, so a five-metre trench comes out as a coarse
 * V whose sloping sides climb back up through the channel bed.  Instead the
 * faces inside the footprint are *removed* from both, leaving a clean hole
 * whose remaining edges are all still at natural grade -- and the channel's
 * own concrete, which reaches well past the hole on both sides, seals it.
 *
 * The one rule: `FOOTPRINT_HALF` must stay comfortably inside the width of
 * concrete `canal.js` lays down, or you get a view straight through the
 * planet.
 *
 * **The channel no longer circles the planet: it runs between the two ranges.**
 *
 * It used to, exactly like the railway -- authored as a straight line of constant
 * z spanning one full circumference in x, so the equirectangular bake closed it
 * into a seamless latitude circle.  What that produced, once `hills.js` existed,
 * was a flat corridor 28 m wide cut clean through ひばり山 at both tunnel
 * longitudes: the range's mass stopped dead at the channel's valley on one side
 * and picked up again on the other, with a strip of level field and a bare
 * concrete channel between them.  From inside the channel looking along it you
 * saw a hill, a gap, and a hill.
 *
 * So the channel is bounded now.  It starts at the east toe of the west arm and
 * ends at the west toe of the east shoulder, and `hills.js` closes its corridor
 * everywhere else -- which lets the range join over the line it used to be cut
 * by.  Three consequences, and all three are why this file looks the way it does:
 *
 *  - **the corridor and the channel have to have the same bounds.**  `hills.js`
 *    reads `CANAL_X0`/`CANAL_X1` from here for exactly that reason: the hills are
 *    held off the channel over precisely the longitudes the channel exists at,
 *    so there is no stretch of made ground with a hillside growing through it and
 *    no stretch of closed range with a ditch in it.
 *  - the hole is still a continuous band over that stretch, so `canal.js` must
 *    still lay its bank slabs the whole way along it, or the gap shows through
 *    to space;
 *  - where the street crosses the band the slabs *have* to stop, because the
 *    made ground is flat at `groundY(CANAL.z)` and the road is not.  The
 *    crossing is a real bridge, and it is what seals the hole there.
 *
 * **The ends are sealed by `canal.js`'s two 暗渠 headwalls and not by this file.**
 * The grid's columns are 2 m apart and the planet sphere's facets are 5.4 m, and
 * `cutTrench` drops a triangle if *any* corner is inside -- so each hole
 * overshoots its bound by up to one facet.  On the grid that overshoot is nothing
 * (the bound is on a column line); on the sphere it is up to 5.4 m, and what
 * covers it is the grid itself, which is intact out there and sits 65 mm above.
 * ------------------------------------------------------------------ */

import * as THREE from 'three';

/** Channel centreline, in flat authoring coordinates. */
export const CANAL = {
  z: -24.0,
  half: 2.5,          // half the top width of the water channel
  depth: 1.75,
};

/**
 * The stretch the channel runs over, and the two numbers are measured rather
 * than chosen.
 *
 * With the corridor lifted, `shapeAt` in `hills.js` carries the range across
 * z = -24 as a genuine saddle at both tunnel longitudes -- 2.36 m at its crest at
 * x = -116 and 2.25 m at x = 124 -- and the field's zero contour on the channel's
 * own centreline lands at x = -97.5 on the west arm's east toe and x = 106.0 on
 * the east shoulder's west toe.  Those are the points where the ground stops
 * being flat, which is where a channel has to stop: one metre further and the
 * hillside would be standing in the made ground.
 *
 * -98 rather than -97.5 because the terrain grid's columns are 2 m apart and on
 * an even column the hole starts exactly at the bound instead of overshooting a
 * cell into the concrete.
 */
export const CANAL_X0 = -98.0;
export const CANAL_X1 = 106.0;

/** Half-width of the hole cut in the ground layers. */
export const FOOTPRINT_HALF = 3.4;

/**
 * Is this flat point inside the excavation?
 *
 * Bounded in x now, and it is the only place either ground surface is told
 * where the channel is -- `street.js` hands it grid vertices and `planet.js`
 * hands it sphere vertices mapped back to flat coordinates, so one test serves
 * both.  The bounds do not straddle the seam at ±CIRCUMFERENCE/2, so a plain
 * range test is exact and no wrapping is needed.
 */
export function inTrench(x, z) {
  return x > CANAL_X0 && x < CANAL_X1 && Math.abs(z - CANAL.z) < FOOTPRINT_HALF;
}

/**
 * Drop every triangle with a vertex inside the excavation.
 *
 * "Any vertex" rather than "the centroid" on purpose: it guarantees that no
 * surviving triangle reaches into the footprint, so nothing pokes up through
 * the channel bed.  The cost is that the hole is up to one cell wider than
 * asked for, which is why the concrete apron is generous.
 *
 * Works on indexed and non-indexed geometry alike -- the terrain is a plane
 * grid, the planet is an icosahedron, and they differ.
 */
export function cutTrench(geo) {
  const pos = geo.attributes.position;
  const index = geo.index;
  const inside = (i) => inTrench(pos.getX(i), pos.getZ(i));

  if (index) {
    const src = index.array;
    const keep = [];
    for (let t = 0; t < src.length; t += 3) {
      if (inside(src[t]) || inside(src[t + 1]) || inside(src[t + 2])) continue;
      keep.push(src[t], src[t + 1], src[t + 2]);
    }
    geo.setIndex(keep);
    return src.length / 3 - keep.length / 3;
  }

  const names = Object.keys(geo.attributes);
  const out = names.map((n) => ({ name: n, size: geo.attributes[n].itemSize, dst: [] }));
  let dropped = 0;
  for (let t = 0; t < pos.count; t += 3) {
    if (inside(t) || inside(t + 1) || inside(t + 2)) { dropped++; continue; }
    for (const a of out) {
      const src = geo.attributes[a.name].array;
      for (let e = 0; e < 3; e++) {
        for (let k = 0; k < a.size; k++) a.dst.push(src[(t + e) * a.size + k]);
      }
    }
  }
  for (const a of out) {
    geo.setAttribute(a.name, new THREE.BufferAttribute(Float32Array.from(a.dst), a.size));
  }
  return dropped;
}
