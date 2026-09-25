/*
 * support.js: the Support link and its first-party click tracking.
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

import { boardOrigin } from './board.js';
import { privacyRefused, optedOut } from './stats.js';

/* The Support page URL. */
export const SUPPORT_URL = 'https://www.patreon.com/cw/webfpv';

/*
 * Send a support_click event. Never blocks: uses sendBeacon or fetch with
 * keepalive. The event body is exactly as specified: no source, referrer or
 * ref fields are added by this function, unlike the shared sendEvent helper.
 */
export function trackSupportClick() {
  if (privacyRefused() || optedOut()) {
    return false;
  }
  const url = `${String(boardOrigin() || '').replace(/\/+$/, '')}/api/stats/events`;
  const body = JSON.stringify({ v: 1, kind: 'support_click', source: 'sim' });
  try {
    if (navigator.sendBeacon) {
      return navigator.sendBeacon(url, new Blob([body], { type: 'text/plain;charset=UTF-8' }));
    }
  } catch (e) {
    /* Fall through to fetch. */
  }
  try {
    fetch(url, {
      method: 'POST', body, keepalive: true, headers: { 'content-type': 'text/plain' },
    }).catch(() => {});
    return true;
  } catch (e) {
    return false;
  }
}

