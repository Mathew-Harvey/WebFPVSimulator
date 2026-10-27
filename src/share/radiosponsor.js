/*
 * radiosponsor.js: the radio sponsor's buy link, opened from Settings.
 *
 * MOCK-UP (branch mockup/helloradiosky). One row under Sticks in Settings,
 * "Hello Radio V12", that opens the retailer's address in a new tab. It is
 * opened from script on a pilot's own press, so there is no popup, no
 * overlay and nothing that appears by itself. The address is the roster's
 * (RADIO_SPONSOR), tagged with the sim as the place, so the sponsor sees it
 * in their own analytics. No beacon is sent: the board has no word for it
 * yet, so counting these presses needs a board change first.
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

import { RADIO_SPONSOR, partnerHref } from '../partners/roster.js';

export const RADIO_ROW_NOTE = `${RADIO_SPONSOR.heading}: HelloRadioSky. Opens their shop in a new tab.`;

export function openRadioShop() {
  const tab = window.open(partnerHref(RADIO_SPONSOR.buyHref, 'sim_settings'), '_blank', 'noopener,noreferrer');
  if (tab) {
    /* Only a browser that ignored noopener hands the tab back. */
    tab.opener = null;
  }
}
