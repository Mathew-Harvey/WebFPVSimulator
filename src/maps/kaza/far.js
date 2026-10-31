/*
 * far.js: the far end of the plain, a mile and a bit north of the start.
 * An old concrete arch viaduct that carried a branch line across the
 * plain until the line closed, eighteen arches long and left to the grass,
 * and three wind turbines standing in the pasture beyond it.
 *
 * THE VIADUCT is our own, after the kind of thing the Tokachi plain is
 * known for: the plain's closed lines left their mass concrete arch bridges
 * standing in the fields and the lakes. Ours is 18 arches of 10 m spans on
 * 1.6 m piers, springing at 7.5 m, the crown at 12.5 m and the deck at
 * 13.2 m, 210 m long, the farm road through its eighth arch. Its faces are
 * drawn as one shape with the arches cut out (./index.js); its solid is the
 * piers, the deck, and between each pair of arches a stack of boxes stepped
 * up the curve, each kept outside the opening at its lower edge, so a quad
 * in an arch meets the arch.
 *
 * THE TURBINES are the builder's turbine (src/props/industrial.js), parked,
 * at 70 m to the hub with 36 m blades, which is a two megawatt machine of
 * the plain's wind farms. Their solids are the turbine's own. They are
 * drawn by ./index.js out of the fog, so they stand on the horizon from the
 * start, and in the haze of the distance they are: the pilot's landmark for
 * the long run north.
 *
 * Every number is in the plan's frame (./frame.js).
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

import { rng } from './frame.js';
import { turbineShape } from '../../props/industrial.js';

/* The viaduct: `x0` is the first pier's west face. */
export const VIADUCT = {
  x0: 34.2, n: 18, span: 10, pier: 1.6, y0: 1548, y1: 1552.4, spring: 7.5, crown: 12.5, deck: 13.2, road: 7,
};
const PITCH = VIADUCT.span + VIADUCT.pier;

/* The middle of arch i, and the viaduct's east end. */
export const archX = (i) => VIADUCT.x0 + VIADUCT.pier + i * PITCH + VIADUCT.span / 2;
export const VIADUCT_X1 = VIADUCT.x0 + VIADUCT.n * PITCH + VIADUCT.pier;

/* The opening's half width at a height, 0 above the crown. */
export function archHalf(h) {
  const V = VIADUCT;
  const R = V.span / 2;
  if (h <= V.spring) {
    return R;
  }
  const d = h - V.spring;
  return d >= R ? 0 : Math.sqrt(R * R - d * d);
}

/*
 * THE TURBINES: plan point, and the element the builder would hold for
 * each. They face south, down the plain to the start, parked.
 */
export const TURBINES = [
  { px: 168, py: 1690, el: { id: 'kaza-turbine-1', type: 'turbine', dims: { height: 66, blade: 34, spin: 0.12 } } },
  { px: 330, py: 1712, el: { id: 'kaza-turbine-2', type: 'turbine', dims: { height: 70, blade: 36, spin: 0.5 } } },
  { px: 492, py: 1684, el: { id: 'kaza-turbine-3', type: 'turbine', dims: { height: 68, blade: 35, spin: 0.31 } } },
];
/* They face south: the element's +x is the plan's -py. */
export const TURBINE_YAW = -Math.PI / 2;

/* The viaduct: piers, deck, stepped spandrels, and the shape ./index.js
 * draws. */
function viaduct(T) {
  const V = VIADUCT;
  const r = rng(1551);
  T.viaducts.push({ ...V, pitch: PITCH, x1: VIADUCT_X1, m: 'kzConcreteOld' });
  /* The piers, to the springing. */
  for (let i = 0; i <= V.n; i += 1) {
    const x = V.x0 + i * PITCH;
    T.hidden(x, V.y0, 0, x + V.pier, V.y1, V.spring, 'wall', 'pier');
  }
  /* The spandrels, stepped: between arch i - 1 and arch i, from the
   * springing to the crown, each box as wide as the opening leaves at its
   * lower edge. The two ends close against the abutments the same way. */
  const bands = 8;
  for (let k = 0; k < bands; k += 1) {
    const h0 = V.spring + ((V.crown - V.spring) * k) / bands;
    const h1 = V.spring + ((V.crown - V.spring) * (k + 1)) / bands;
    const hw = archHalf(h0);
    for (let i = 0; i <= V.n; i += 1) {
      const xa = i === 0 ? V.x0 : archX(i - 1) + hw;
      const xb = i === V.n ? VIADUCT_X1 : archX(i) - hw;
      if (xb > xa + 1e-6) {
        T.hidden(xa, V.y0, h0, xb, V.y1, h1, 'wall', 'spandrel');
      }
    }
  }
  /* The deck, over the crowns. */
  T.hidden(V.x0, V.y0, V.crown, VIADUCT_X1, V.y1, V.deck, 'wall', 'deck');
  /* The deck's top: moss and grass, and the old ballast showing. */
  T.paint('kzMoss', V.x0, V.y0, V.deck, VIADUCT_X1, V.y1, V.deck + 0.03);
  T.dress(() => T.wide(() => {
    for (let x = V.x0 + 2; x < VIADUCT_X1 - 3; x += r.range(3, 7)) {
      T.paint('kzGravel', x, V.y0 + 1.2, V.deck + 0.03, x + r.range(1, 3), V.y1 - 1.2, V.deck + 0.05);
    }
    /* Water stains down the faces under each crown, and the line of the
     * pour lifts, both faces. */
    for (let i = 0; i < V.n; i += 1) {
      const cx = archX(i);
      for (const [y, s] of [[V.y0, -1], [V.y1, 1]]) {
        T.paint('kzConcrete', cx - 0.5, y + s * 0.01, V.crown + 0.1, cx + 0.5, y + s * 0.03, V.deck - 0.05);
        T.paint('kzMoss', cx - 1.4, y + s * 0.01, V.crown - 0.2, cx - 0.9, y + s * 0.03, V.deck - 0.1);
      }
    }
    for (const [y, s] of [[V.y0, -1], [V.y1, 1]]) {
      T.paint('kzConcrete', V.x0, y + s * 0.005, 3.8, VIADUCT_X1, y + s * 0.02, 3.86);
    }
  }));
  /* Saplings on the deck, and the grass growing out of the joints. */
  for (let k = 0; k < 9; k += 1) {
    const x = V.x0 + 8 + k * 23 + r.range(-4, 4);
    const y = (V.y0 + V.y1) / 2 + r.range(-1, 1);
    const h = 2 + r.range(0, 2.5);
    T.post('kzBirch', x, y, V.deck, V.deck + h * 0.6, 0.06, { solid: false });
    T.leaves.push({ m: k % 3 ? 'kzBirchLeaf' : 'kzLarch', c: [x, y, V.deck + h * 0.75], r: 0.9 + h * 0.15, ry: 1.0 + h * 0.15, n: 2, seed: k * 31 });
  }
  /* The old line's sign, half fallen, at the road. */
  T.post('kzSteel', archX(V.road) - 6.2, V.y0 - 1.4, 0, 2.6, 0.05, { name: 'sign post' });
  T.sign('oldLine', archX(V.road) - 6.2, V.y0 - 1.43, 2.25, 1.4, 0.6, 's');
  for (let i = 0; i <= V.n; i += 1) {
    T.take(V.x0 + i * PITCH + V.pier / 2, (V.y0 + V.y1) / 2, 2);
  }
}

/* The turbines' footings, the track to them, and the turbines themselves
 * (drawn by ./index.js, solid in ./plan.js). */
function turbines(T) {
  for (const t of TURBINES) {
    T.turbines.push(t);
    const s = turbineShape(t.el);
    T.box('kzConcrete', t.px - s.rb - 1.5, t.py - s.rb - 1.5, 0, t.px + s.rb + 1.5, t.py + s.rb + 1.5, 0.35, { name: 'footing' });
    T.box('kzWhite', t.px + s.rb - 0.1, t.py - 0.6, 0.35, t.px + s.rb + 0.05, t.py + 0.6, 2.6, { solid: false });
    T.take(t.px, t.py, s.rb + 2);
  }
  T.paint('kzGravel', 160, 1676, 0.009, 500, 1680, 0.015);
  T.paint('kzGravel', 120, 1676, 0.009, 160, 1680, 0.015);
  T.paint('kzGravel', 326, 1680, 0.009, 334, 1700, 0.015);
  T.paint('kzGravel', 119.5, 1552.4, 0.009, 124.5, 1676, 0.015);
  /* The wind farm's small substation by the track. */
  T.box('kzConcrete', 230, 1660, 0, 246, 1672, 0.3, { name: 'pad' });
  T.box('kzSilo', 233, 1662, 0.3, 238, 1666, 2.8, { name: 'switch house' });
  T.prism('kzRoofGreen', 'x', [[1661.6, 2.75], [1664, 3.4], [1666.4, 2.75], [1666.4, 2.6], [1664, 3.25], [1661.6, 2.6]], 232.6, 238.4);
  for (const [x, y] of [[241, 1663], [243.5, 1663], [241, 1669], [243.5, 1669]]) {
    T.box('kzSteel', x - 0.5, y - 0.5, 0.3, x + 0.5, y + 0.5, 2.2, { name: 'transformer' });
    T.post('kzIron', x, y, 2.2, 3.4, 0.06, { solid: false });
  }
}

export function far(T) {
  viaduct(T);
  turbines(T);
}
