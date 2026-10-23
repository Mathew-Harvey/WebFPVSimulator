/*
 * supporters.js: the supporters' signs, hung in Nick Burns' garage and in
 * the workshop his drones live in.
 *
 * The owner's ask of 2026-10-18: "don't forget to add our supporters logo
 * to the map." Until then the house had none (`sponsorMarks: false`), so
 * this is every brand every other map shows: the partners and the map only
 * partners, which are found and stamped as anywhere, and the patrons, which
 * are paint (src/partners/roster.js). The house's walls are its own
 * structure, which the map's chooser (choosePartnerSpots in
 * src/maps/built/egg.js) cannot see, so each sign is hung by hand, the
 * town's way (PARTNER_SPOTS in src/maps/city/places/index.js), and painted
 * by the built map as a chosen one is (`markSpots` in
 * src/maps/built/index.js). Hung where a team's signs hang: three on the
 * garage's walls round the open middle bay a whoop flies in by and one
 * over its shelving, three in the workshop over the desk, the bench and
 * between its doors.
 *
 * Each is aimed as a sticker is (aimAt in ./stickers.js), from a point in
 * a room the way to look, so a wall that moves takes its sign with it, and
 * check:house says where each one landed. A roster brand with no line here
 * is hung nowhere in the house: a guessed spot is how paint ends up inside
 * a wall.
 *
 * THE COST: a draw call a sign drawn, each its own panel with its own
 * texture (src/art/partnermark.js). On another map a sign out of sight
 * behind a building is drawn anyway and costs its call, and here all seven
 * are inside rooms, so from the back garden or the kitchen all seven were
 * in the picture behind the walls: seven calls more in the busiest views
 * (99 to 106), for signs nobody could see. So each is drawn only from
 * where its room can be seen (seesRoom): the garage's from inside it and
 * from the front of the house, where its open bay looks out; the
 * workshop's from the basement east of the stair. A few comparisons a
 * frame.
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

import { FRAME, BF, FRONT } from './house.js';
import { aimAt, drawnBoxes } from './stickers.js';

/* How wide each sign is drawn, a share of the width its spot names: a
 * quarter narrower than they were hung (the owner, 2026-10-23, "make the
 * sponsors logos a bit smaller, and only once"; each brand was already
 * here once). One number, so smaller still is one edit. Heads' house has
 * its own (SIGN_SCALE in ../heads/logos.js). */
export const SIGN_SCALE = 0.75;

/* Each sign: the brand's slug, where it is aimed from (plan x, plan y,
 * height, real metres), which way, and how wide it was hung in real
 * metres, before SIGN_SCALE. Its height is its artwork's. */
export const SUPPORTER_SPOTS = [
  /* The garage, its floor at 0. Straight ahead through the open bay, over
   * the workbench. */
  { slug: 'gds', room: 'garage', from: [18.75, 2.0, 1.7], dir: 'n', w: 1.4 },
  /* Its east wall, over the car. */
  { slug: 'mantisfpv', room: 'garage', from: [21.5, 3.6, 1.95], dir: 'e', w: 1.6 },
  /* Over the shut west bay, inside, seen on the way out. */
  { slug: 'wcmrc', room: 'garage', from: [15.75, 2.0, 2.55], dir: 's', w: 1.3 },
  /* The garage's back wall again, right of GDS: the USA micro drone partner. */
  { slug: 'webleedfpv', room: 'garage', from: [20.3, 2.0, 1.85], dir: 'n', w: 1.2 },
  /* Over the shelving on its west wall. */
  { slug: 'konexdrone', room: 'garage', from: [16.0, 1.7, 2.35], dir: 'w', w: 1.1 },
  /* The workshop, its floor at BF. Over the desk and its two monitors. */
  { slug: 'yourfpv', room: 'workshop', from: [12.05, 6.5, BF + 1.75], dir: 'n', w: 0.85 },
  /* Over the pegboard and the bench. */
  { slug: 'mattsflooring', room: 'workshop', from: [12.35, 3.0, BF + 2.05], dir: 's', w: 1.2 },
  /* Between its two doors. */
  { slug: 'quadconfig', room: 'workshop', from: [12.0, 2.8, BF + 1.5], dir: 'w', w: 1.2 },
];

/*
 * Whether a camera at plan (x, y) and height h, real metres, can see into
 * `room`. Generous on purpose, because a sign that is drawn and hidden
 * costs a call and a sign that is hidden and in sight is a hole: the
 * garage from anywhere in it or anywhere in front of the house's front
 * line, which is the street, the drive and the lawn its open bay faces;
 * the workshop from anywhere in the basement east of the stair's foot, its
 * two halls included, whose doors open into it.
 */
const GARAGE = { x0: 13.9, x1: 23.6, y1: 5.5, top: 3.2 };
const WORKSHOP_X0 = 6.5;
export function seesRoom(room, x, y, h) {
  if (room === 'garage') {
    return y < FRONT || (x > GARAGE.x0 && x < GARAGE.x1 && y < GARAGE.y1 && h < GARAGE.top);
  }
  return h < 0 && x > WORKSHOP_X0;
}

/*
 * Each sign on the first drawn face its line meets, as `markSpots` wants
 * it: { slug, p, n, up, w, chunk, hit } in the world, `p` on the face and
 * `chunk` the chunk the house is drawn in, so the built map stands the
 * paint in front of anything drawn proud there. Null for a line that meets
 * nothing.
 */
export function placeSupporters(parts, chunk) {
  const boxes = drawnBoxes(parts);
  return SUPPORTER_SPOTS.map((spot) => {
    const at = aimAt(boxes, spot.from, spot.dir);
    if (!at) {
      return null;
    }
    return { slug: spot.slug, room: spot.room, p: at.p, n: at.n, up: [0, 1, 0], w: FRAME.S * SIGN_SCALE * spot.w, chunk, hit: at.hit };
  });
}
