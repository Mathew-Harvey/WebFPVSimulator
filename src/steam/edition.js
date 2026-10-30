/*
 * edition.js: which edition of WebFPV this is, and what it may contain.
 *
 * The same game ships two ways. The browser edition at webfpv.org is free,
 * talks to the public board and shows its partners. The Steam edition is a
 * paid desktop game that must work with no network, sends nothing anywhere,
 * and ships only what the owner has cleared for sale (PLAN.md section 2).
 * Every place the two differ asks this module, and nothing else, so the
 * difference is one list a person can read.
 *
 * HOW THE EDITION IS DECIDED, first match wins:
 *   ?edition=web or ?edition=steam    for a check that needs the other one
 *   window.webfpvDesktop              the Electron preload: always Steam
 *   <html data-edition="steam">       this repository's index.html, so the
 *                                     game served from a checkout behaves
 *                                     like the build a buyer gets
 *   otherwise the browser edition, which is also what Node sees.
 *
 * WHAT IT MAY CONTAIN comes from steam/content.json, which the desktop
 * shell hands over through the preload and scripts/stage.js applies when it
 * copies the files. Outside Electron the defaults below are the same file's
 * values, so a checkout served by a plain server is no more permissive than
 * the shipped game.
 *
 * THE NETWORK GUARD. The desktop shell already cancels every request that
 * leaves the machine, and the page's CSP refuses them too. But a refused
 * fetch still costs a console error and a stall while it fails, and the game
 * has a dozen places that reach for the board at boot. So in the Steam
 * edition fetch() and sendBeacon() answer at once, offline, for anything not
 * on the game's own origin. The game already handles an unreachable board,
 * because the web has always been allowed to be down.
 *
 * This file is part of WebFPV.
 *
 * WebFPV is free software: you can redistribute it and/or modify it under
 * the terms of the GNU General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option)
 * any later version.
 *
 * WebFPV is distributed in the hope that it will be useful, but WITHOUT ANY
 * WARRANTY, without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE. See the GNU General Public License for more
 * details.
 *
 * You should have received a copy of the GNU General Public License along
 * with WebFPV. If not, see <https://www.gnu.org/licenses/>.
 */

/* steam/content.json's values. Kept identical by tests/stage.test.js. */
export const STEAM_CONTENT_DEFAULTS = Object.freeze({
  edition: 'steam',
  music: 'generated',
  partners: Object.freeze([]),
  creditPictures: false,
  betaflightLogo: false,
  eventCourses: false,
  /* The owner, 2026-10-14: the RaceGOW layouts ship, as Ultra Tiny Tracks
   * (UTT). See uttName below and PLAN.md B3. */
  racegowRooms: true,
  /* The owner, 2026-10-20: "we also want all existing maps brought over".
   * Nick Burns' house is his house and his likeness, shipped on the
   * owner's word that he has Nick's permission (PLAN.md B15), and the
   * board's maps and tracks ship as a snapshot (src/steam/shelf.js, PLAN.md
   * B14). */
  likenesses: Object.freeze(['nickburns']),
  boardShelf: true,
  communityAllowed: false,
  boardOrigin: 'https://webfpv.org/board',
  sourceUrl: 'https://github.com/Mathew-Harvey/webFPV-SteamRepack',
});

function detect() {
  if (typeof window === 'undefined') {
    return { steam: false, desktop: null, content: null };
  }
  const desktop = window.webfpvDesktop || null;
  let steam = Boolean(desktop);
  try {
    const asked = new URLSearchParams(window.location.search).get('edition');
    if (asked === 'web') {
      steam = false;
    } else if (asked === 'steam') {
      steam = true;
    } else if (!desktop && document.documentElement.dataset.edition === 'steam') {
      steam = true;
    }
  } catch (e) {
    /* No location or no document: keep what the preload said. */
  }
  const given = desktop && desktop.content && typeof desktop.content === 'object' ? desktop.content : {};
  const content = steam ? Object.freeze({ ...STEAM_CONTENT_DEFAULTS, ...given }) : null;
  return { steam, desktop, content };
}

const D = detect();

/* True in the Steam edition, in Electron or served from this checkout. */
export const STEAM_EDITION = D.steam;
/* The preload's bridge, or null outside Electron. */
export const DESKTOP = D.desktop;
/* The content profile, or null in the browser edition. */
export const CONTENT = D.content;

/* May a partner's mark be shown? Always on the web; in the Steam edition
 * only for a partner the profile names, each one cleared by the owner. */
export function partnerAllowed(slug) {
  return !STEAM_EDITION || (CONTENT.partners || []).includes(slug);
}

/* May a real person's likeness and name ship? Always on the web; in the
 * Steam edition only for a person the profile names (PLAN.md B15). */
export function likenessAllowed(slug) {
  return !STEAM_EDITION || (CONTENT.likenesses || []).includes(slug);
}

/* "Wishlist on Steam" buttons. They advertise the Steam edition, so they
 * show in the browser edition only: a player who already owns the game on
 * Steam has nothing to wishlist. */
export function wishlistAllowed() {
  return !STEAM_EDITION;
}

/* Is the public board part of this game? The Steam edition keeps it off. */
export function boardEnabled() {
  return !STEAM_EDITION;
}

/* The recorded music, or the generated score the Steam edition plays until
 * the recordings' licence is on record (PLAN.md B1). */
export function recordedMusicAllowed() {
  return !STEAM_EDITION || CONTENT.music === 'recorded';
}

/* Third party pictures in the credits: logos and the testers' avatars. */
export function creditPicturesAllowed() {
  return !STEAM_EDITION || Boolean(CONTENT.creditPictures);
}

/* The Betaflight logo. The words stay everywhere they are attribution. */
export function betaflightLogoAllowed() {
  return !STEAM_EDITION || Boolean(CONTENT.betaflightLogo);
}

/* RaceGOW's rooms in the builder's presets (PLAN.md B3). */
export function racegowRoomsAllowed() {
  return !STEAM_EDITION || Boolean(CONTENT.racegowRooms);
}

/*
 * May a shipped layout ship? A layout with a credit names somebody else's
 * design: a RaceGOW room, or an event's track rebuilt from its plan. The
 * Steam edition carries those only when the profile allows them (PLAN.md
 * B2, B3). Its own courses carry a credit whose series starts with WebFPV.
 */
export function presetAllowed(doc) {
  if (!STEAM_EDITION || !doc || !doc.credit) {
    return true;
  }
  const series = String(doc.credit.series || '');
  if (/^WebFPV\b/.test(series)) {
    return true;
  }
  if (/RaceGOW/i.test(series) || /^UTT\b/.test(series)) {
    return Boolean(CONTENT.racegowRooms);
  }
  return Boolean(CONTENT.eventCourses);
}

/*
 * THE ULTRA TINY TRACKS. The owner, 2026-10-14: RaceGOW's layouts are not
 * copyrighted, and the Steam edition ships them called Ultra Tiny Tracks,
 * UTT (PLAN.md B3). The layouts are unchanged and so are their builders'
 * names in the credit; the series' name, its sponsor and the link to its
 * animations do not ride along.
 */
export const UTT_SERIES = 'UTT';

export function uttName(name) {
  const m = /^RaceGOW\s*\d*\s*Track\s*(\d+)$/i.exec(String(name || '').trim());
  return m ? `UTT Track ${m[1]}` : String(name || '');
}

/* A shipped layout as this edition shows it: a RaceGOW room as a UTT
 * track in the Steam edition, anything else as it is. A fresh object for a
 * renamed one; the caller's copy rules are unchanged. */
export function steamPreset(doc) {
  if (!STEAM_EDITION || !doc || !doc.credit || !/RaceGOW/i.test(String(doc.credit.series || ''))) {
    return doc;
  }
  return {
    ...doc,
    name: uttName(doc.name),
    credit: {
      ...doc.credit,
      series: UTT_SERIES,
      sponsor: '',
      source: 'an ultra tiny track',
      note: '',
    },
  };
}

/*
 * The builder's whoop rule checks measure against RaceGOW's published
 * dimensions and say so by name. The numbers are facts and stay; the Steam
 * edition calls the same rule book UTT's, the name its ultra tiny tracks
 * carry (the owner, 2026-10-14, PLAN.md B3).
 */
export function plainSeries(text) {
  if (!STEAM_EDITION || !text || !/RaceGOW/.test(text)) {
    return text;
  }
  return String(text)
    .replace(/RaceGOW's minimum gate/g, "The UTT minimum gate")
    .replace(/: RaceGOW, for/g, ': UTT, for')
    .replace(/RaceGOW tracks/g, 'UTT tracks')
    .replace(/A RaceGOW (gate|track)/g, 'A UTT $1')
    .replace(/a RaceGOW (gate|track)/g, 'a UTT $1')
    .replace(/RaceGOW5?/g, 'UTT');
}

/* Where the GPL's source for this build is, for the credits screen. */
export function sourceUrl() {
  return (CONTENT && CONTENT.sourceUrl) || STEAM_CONTENT_DEFAULTS.sourceUrl;
}

/* ---------------------------------------------------------------- *
 * The network guard.
 * ---------------------------------------------------------------- */

let guarded = false;

/*
 * What the player has let the game reach, by address prefix. Empty until
 * they say yes to going online for Fly together (src/net/together.js),
 * which adds the board's rooms and nothing else: the board's other routes
 * (times, publishing, statistics) stay answered offline, because the yes
 * was to rooms. The desktop's own gate keeps the same list
 * (desktop/main.cjs in the Steam repository), so this is the fast answer
 * and not the fence.
 */
const reachable = new Set();

export function allowReach(prefix, on = true) {
  const p = String(prefix || '');
  if (!/^https?:\/\/[^/]+/.test(p)) {
    return false;
  }
  if (on) {
    reachable.add(p);
  } else {
    reachable.delete(p);
  }
  return true;
}

function offOrigin(url) {
  try {
    const u = new URL(String(url), window.location.href);
    if (u.origin === window.location.origin) {
      return false;
    }
    for (const p of reachable) {
      if (u.href.startsWith(p)) {
        return false;
      }
    }
    return true;
  } catch (e) {
    return false;
  }
}

export function installNetworkGuard() {
  if (guarded || !STEAM_EDITION || typeof window === 'undefined') {
    return false;
  }
  guarded = true;
  const realFetch = window.fetch ? window.fetch.bind(window) : null;
  if (realFetch) {
    window.fetch = (input, init) => {
      const url = input && typeof input === 'object' && 'url' in input ? input.url : input;
      if (offOrigin(url)) {
        return Promise.reject(new TypeError('Offline: the Steam edition does not use the network.'));
      }
      return realFetch(input, init);
    };
  }
  if (navigator.sendBeacon) {
    const realBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = (url, data) => (offOrigin(url) ? false : realBeacon(url, data));
  }
  return true;
}

installNetworkGuard();
