/*
 * patreon.js: the support link, one control, three sites.
 *
 * The mark is Patreon's symbol, the vertical bar and the circle, used to
 * say this product has a Patreon page. Their brand notes allow that, and
 * they do not allow a redrawn wordmark or the symbol dropped into a
 * sentence, so the visible word beside it is the name set in this page's
 * own type. The coral is theirs (#FF424D). Everything around the control
 * stays in this product's palette. A black mark, which is how the symbol
 * is often supplied, would disappear on these dark pages.
 *
 * PATREON_URL is the public page. The same string, and the same note, have
 * to be set in the landing page's src/config.js and the board's
 * public/app.js, because those sites cannot import this file. The note is
 * the hover text: the three memberships, in the order Patreon lists them.
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

/* The public page. Same address in the landing config and the board app. */
export const PATREON_URL = 'https://www.patreon.com/cw/webfpv';

export const PATREON_NOTE = 'Support WebFPV on Patreon. Keep the lights on, $3. Hosting + runway, $8. Build the sim, $20. USD a month.';

/* Patreon's symbol. Do not restyle the path. */
const MARK = 'M15.386.524c-4.764 0-8.64 3.876-8.64 8.64 0 4.75 3.876 8.613 8.64 8.613 4.75 0 8.614-3.864 8.614-8.613C24 4.4 20.136.524 15.386.524M.003 23.537h4.22V.524H.003';

export function bindPatreon(anchor) {
  anchor.title = PATREON_NOTE;
  anchor.setAttribute('aria-label', PATREON_NOTE);
  if (PATREON_URL) {
    anchor.href = PATREON_URL;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    delete anchor.dataset.patreonPending;
    return;
  }
  anchor.href = '#';
  anchor.removeAttribute('target');
  anchor.dataset.patreonPending = '1';
  anchor.addEventListener('click', (event) => {
    event.preventDefault();
  });
}

/* One anchor. The caller places it. External on purpose: windows.js keeps
 * named tabs for our own sites, and Patreon is not one of them. */
export function patreonAnchor() {
  const a = document.createElement('a');
  a.className = 'patreon';
  a.title = PATREON_NOTE;
  a.setAttribute('aria-label', PATREON_NOTE);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('fill', '#FF424D');
  path.setAttribute('d', MARK);
  svg.append(path);
  const word = document.createElement('span');
  word.textContent = 'Patreon';
  a.append(svg, word);
  bindPatreon(a);
  return a;
}
