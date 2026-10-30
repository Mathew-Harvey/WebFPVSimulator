/*
 * patrons.js: the patrons whose goats run on the 90%er goat herding map,
 * one extra goat for each entry, wearing the patron's logo on both flanks
 * or, with no logo (or one that does not load), their name in plain text.
 * Pure data and one small tidy-up, no Three.js and no DOM, so check:goats
 * can read it.
 *
 * REAL PATRONS ARE ADDED BY HAND, here, in PATRONS. The three below are
 * EXAMPLES, made up, and are to be replaced.
 *
 *   name   plain text, shown on the goat and called out when it is home.
 *          Cut at NAME_MAX letters and cleaned of anything but letters,
 *          numbers, spaces and . ' & ! - _ (see tidy).
 *   logo   optional, a path under assets/patrons/, png, webp or jpg and
 *          never svg (a server may send it with the wrong type). Square or
 *          near it and small: it is cut to a 128 pixel cell. It is fetched
 *          only when the goat map is chosen, and a name is drawn if it
 *          fails.
 *   tier   'bronze', 'silver' or 'gold': the colour of the plate a name is
 *          written on. It changes nothing else.
 *
 * THE CAP. MAX_PATRON_GOATS is how many patron goats the map will spawn,
 * the first ones in this list, whatever it grows to. The 90%er herd is 98
 * goats already, so the cap is on the patrons and not on the herd: a cap
 * on the whole herd of 40 would take 58 of the 90%ers' goats out.
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

export const MAX_PATRON_GOATS = 40;
export const NAME_MAX = 24;
export const TIERS = ['bronze', 'silver', 'gold'];

export const PATRONS = [
  { name: 'EXAMPLE Gold Patron', logo: 'assets/patrons/example-logo.png', tier: 'gold' },
  { name: 'EXAMPLE Silver Patron', tier: 'silver' },
  { name: 'EXAMPLE Bronze Patron', tier: 'bronze' },
];

/* The list as the map uses it: entries with a name, in order, at most
 * MAX_PATRON_GOATS, each { name, logo (a safe path or ''), tier }. Anything
 * else is dropped and not an error, so a slip in the list cannot take the
 * map down. */
export function tidy(list = PATRONS, cap = MAX_PATRON_GOATS) {
  const out = [];
  for (const p of Array.isArray(list) ? list : []) {
    if (out.length >= cap) {
      break;
    }
    const name = p && typeof p.name === 'string'
      ? p.name.replace(/[^\p{L}\p{N} .'&!_-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX).trim()
      : '';
    if (!name) {
      continue;
    }
    const logo = p.logo;
    const safe = typeof logo === 'string' && /^assets\/patrons\/[\w.-]+\.(png|webp|jpe?g)$/i.test(logo) ? logo : '';
    out.push({ name, logo: safe, tier: TIERS.includes(p.tier) ? p.tier : 'bronze' });
  }
  return out;
}
