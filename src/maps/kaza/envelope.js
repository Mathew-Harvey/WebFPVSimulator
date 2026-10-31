/*
 * envelope.js: a hot air balloon, its shape and its solids, and the
 * drawing of its envelope in gores.
 *
 * THE SIZE is a sport balloon of about 2,200 cubic metres, the size most
 * of a balloon meet flies: the envelope 18.65 m from the mouth to the
 * crown and 15.6 m across at its widest, 11 m up from the mouth, the
 * mouth 4.4 m across, the basket 1.3 by 1.1 m and 1.15 m deep, the burner
 * over it and the mouth 3.6 m over the basket's floor (PROGRESS.md,
 * 2026-10-31, for where each figure came from). PROFILE is the envelope's
 * half section, [radius, height over the mouth].
 *
 * THE SOLIDS are two balls, which the physics holds as capsules of no
 * length: one of ENVELOPE_R round the waist and a smaller one in the
 * throat. Each is inside the drawn shape at every height (checked point by
 * point against PROFILE in scripts/kaza-check.js), so a quad that touches
 * an envelope has touched the cloth. A crown is fabric and gives; a ball is
 * a wall. That is the one liberty taken, and it is the safe one.
 *
 * THE DRAWING is a lathe cut into GORES panels round and into the bands a
 * design names up the height, each piece a colour of the plain's family
 * (src/props/kaza.js), so a balloon is a few of the map's batches and,
 * once the palette has folded a chunk's batches together, no draw call of
 * its own. Render only; the solids above are all the physics sees.
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

/* The envelope's half section, [radius, height over the mouth], metres. */
export const PROFILE = [
  [2.2, 0], [3.4, 1.6], [5.2, 4.0], [6.6, 6.5], [7.5, 9.0], [7.8, 11.0],
  [7.6, 13.0], [6.8, 15.0], [5.3, 16.8], [3.2, 18.0], [1.6, 18.5], [0, 18.65],
];
export const ENVELOPE_H = 18.65;
export const ENVELOPE_W = 7.8;

/* The solids, over the mouth: the waist's ball and the throat's. */
export const ENVELOPE_R = 7.6;
export const WAIST_H = 11.0;
export const THROAT_R = 3.0;
export const THROAT_H = 3.2;

/* The basket and the mouth, over the basket's floor. */
export const BASKET = { w: 1.3, d: 1.1, h: 1.15 };
export const MOUTH_H = 3.6;

/* The drawn radius at a height over the mouth, read off PROFILE. */
export function profileAt(h) {
  if (h <= 0) {
    return PROFILE[0][0];
  }
  for (let i = 1; i < PROFILE.length; i += 1) {
    const [r1, h1] = PROFILE[i];
    const [r0, h0] = PROFILE[i - 1];
    if (h <= h1) {
      return r0 + ((r1 - r0) * (h - h0)) / (h1 - h0);
    }
  }
  return 0;
}

/*
 * THE DESIGNS. `gores` is the colour of each panel round, repeated to fill
 * GORES; `bands`, if any, overrides it between two heights over the mouth,
 * each [h0, h1, colours], so a balloon can wear a belt or a crown. Our own:
 * stripes, a sunburst crown, a chequer and a belt, in the family's colours.
 */
export const GORES = 16;
export const DESIGNS = {
  sunrise: { gores: ['kzRed', 'kzYellow'], bands: [[15.0, 18.65, ['kzYellow']], [0, 3.0, ['kzNavy']]] },
  ocean: { gores: ['kzBlue', 'kzTeal', 'kzCream', 'kzTeal'], bands: [[0, 3.0, ['kzNavy']]] },
  candy: { gores: ['kzPink', 'kzCream'], bands: [[8.5, 12.5, ['kzPurple']]] },
  harvest: { gores: ['kzOrange', 'kzYellow', 'kzRed', 'kzYellow'], bands: [[16.8, 18.65, ['kzRed']]] },
  forest: { gores: ['kzGreen', 'kzCream'], bands: [[9.0, 13.0, ['kzRed', 'kzCream']]] },
  night: { gores: ['kzNavy', 'kzPurple'], bands: [[13.0, 16.8, ['kzYellow', 'kzNavy']], [0, 3.0, ['kzIron']]] },
  rainbow: { gores: ['kzRed', 'kzOrange', 'kzYellow', 'kzGreen', 'kzBlue', 'kzPurple', 'kzRed', 'kzOrange'] },
  cream: { gores: ['kzCream', 'kzRed'], bands: [[4.0, 9.0, ['kzRed', 'kzRed', 'kzCream', 'kzCream']]] },
};

/* The colour of one gore at one band's middle height. */
function goreColour(design, g, h) {
  for (const [h0, h1, cols] of design.bands || []) {
    if (h >= h0 && h <= h1) {
      return cols[g % cols.length];
    }
  }
  return design.gores[g % design.gores.length];
}

/*
 * The envelope drawn into a kit: at world (x, y, z) for the mouth, its axis
 * up, or turned by `axis` (a THREE.Matrix4) for one lying on its side.
 * Each gore is cut where a band begins or ends, so the bands are crisp.
 * `steps` is the gore's width in lathe segments.
 */
export function drawEnvelope(kit, x, y, z, designName, local = null, steps = 2) {
  const THREE = kit.THREE;
  const design = DESIGNS[designName] || DESIGNS.sunrise;
  const cuts = new Set([0, ENVELOPE_H]);
  for (const [h0, h1] of design.bands || []) {
    cuts.add(Math.max(0, h0));
    cuts.add(Math.min(ENVELOPE_H, h1));
  }
  const hs = [...cuts].sort((a, b) => a - b);
  const place = new THREE.Matrix4().makeTranslation(x, y, z);
  if (local) {
    place.multiply(local);
  }
  const dphi = (Math.PI * 2) / GORES;
  for (let b = 0; b + 1 < hs.length; b += 1) {
    const h0 = hs[b];
    const h1 = hs[b + 1];
    /* The profile between the two cuts, its own points kept. */
    const pts = [new THREE.Vector2(Math.max(0.001, profileAt(h0)), h0)];
    for (const [r, h] of PROFILE) {
      if (h > h0 + 1e-6 && h < h1 - 1e-6) {
        pts.push(new THREE.Vector2(Math.max(0.001, r), h));
      }
    }
    pts.push(new THREE.Vector2(Math.max(0.001, profileAt(h1)), h1));
    const mid = (h0 + h1) / 2;
    for (let g = 0; g < GORES; g += 1) {
      const geo = new THREE.LatheGeometry(pts, steps, g * dphi, dphi);
      kit.add(goreColour(design, g, mid), geo, place);
    }
  }
}
