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
 * the hover text: the four memberships, in the order Patreon lists them.
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

import { counting, eventsUrl } from './stats.js';
import { wishlistAllowed } from '../steam/edition.js';

/* The public page. Same address in the landing config and the board app. */
export const PATREON_URL = 'https://www.patreon.com/cw/webfpv/membership';

/* Stripe tip link for one-off donations */
/* The US$1 a month "Buy Mat a coffee" tier's join link, which the support
 * prompt's Patreon button opens (Patreon tier id 29846312). */
export const COFFEE_TIER_URL = 'https://www.patreon.com/checkout/webfpv?rid=29846312';

export const TIP_URL = 'https://donate.stripe.com/6oU6oHcIKdj85iW0FC8so0s';

export const PATREON_NOTE = 'Support WebFPV on Patreon. Keep the lights on, $3. Hosting + runway, $8. Build the sim, $20. Your sign in the sim, $25. USD a month.';

/* The public page. Opened from script only, so no ?ref= or utm is added. */
export const INSTAGRAM_URL = 'https://www.instagram.com/webfpv_org/';

export const INSTAGRAM_NOTE = 'WebFPV on Instagram: clips, maps and updates. Opens in a new tab.';

/* The Steam store page, for the Get it on Steam buttons. Gated by
 * wishlistAllowed(), so the Steam edition never shows one. They read
 * "Wishlist on Steam" until the game went on sale on 2026-11-27; the
 * function names keep the old word so the callers did not all move. */
export const STEAM_URL = 'https://store.steampowered.com/app/4944190/webFPV/';

export const STEAM_NOTE = 'WebFPV is out on Steam. Fly offline, keep your career in Steam Cloud, race on a LAN. Opens the store page in a new tab.';

/* The About row's note: the row opens the Browser or Steam page in the
 * menus (src/share/steampage.js), not a tab. */
export const STEAM_PAGE_NOTE = 'WebFPV is out on Steam. See what the Steam edition adds to the game you are flying.';

/* The button's words, one place for all of them. No price: a sale or a
 * regional price must never make a button wrong. */
export const STEAM_LABEL = 'Get it on Steam';

/* Where a Steam link stands, as the board counts it: STEAM_PLACES in its
 * src/validate.js is a closed list and a word not on it is refused, so a
 * new place is added there first. */
export const STEAM_PLACES = ['title', 'about', 'prompt', 'page', 'note', 'licence'];

/*
 * PayPal donations, any amount. PayPal's own no-script donate address takes
 * the account as `business`, so nothing of PayPal's is loaded until a pilot
 * presses the button: no SDK, no hosted button image, no iframe. The address
 * is held as character codes and joined on the press, so it is not in the
 * page as text for a scraper (the same reason the board's partner contact is
 * assembled on a click). PAYPAL_MARK is Simple Icons' path of PayPal's
 * monogram (CC0; the mark is PayPal's trade mark), in PayPal's own blue.
 */
const PAYPAL_ACCOUNT = [109,97,116,104,101,119,104,97,114,118,101,121,64,103,109,97,105,108,46,99,111,109];

export const PAYPAL_MARK = 'M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.42 1.012 4.287-.023.143-.047.288-.077.437-.983 5.05-4.349 6.797-8.647 6.797h-2.19c-.524 0-.968.382-1.05.9l-1.12 7.106zm14.146-14.42a3.35 3.35 0 0 0-.607-.541c-.013.076-.026.175-.041.254-.93 4.778-4.005 7.201-9.138 7.201h-2.19a.563.563 0 0 0-.556.479l-1.187 7.527h-.506l-.24 1.516a.56.56 0 0 0 .554.647h3.882c.46 0 .85-.334.922-.788.06-.26.76-4.852.816-5.09a.932.932 0 0 1 .923-.788h.58c3.76 0 6.705-1.528 7.565-5.946.36-1.847.174-3.388-.777-4.471z';

export const PAYPAL_BLUE = '#0070BA';

export const PAYPAL_NOTE = 'Donate any amount with PayPal. Opens PayPal in a new tab.';

/* The donate address for one placement. Built only when pressed. */
export function paypalUrl(placement = 'menu') {
  const business = String.fromCharCode(...PAYPAL_ACCOUNT);
  const params = new URLSearchParams({
    business,
    no_recurring: '0',
    item_name: 'WebFPV',
    currency_code: 'USD',
    custom: `sim-${placement}`,
  });
  return `https://www.paypal.com/donate/?${params.toString()}`;
}

export function openPaypal(placement = 'menu') {
  const tab = window.open(paypalUrl(placement), '_blank', 'noopener,noreferrer');
  if (tab) {
    tab.opener = null;
  }
}

export const TIP_NOTE = 'Buy Mat a battery with a one-off $5 tip. Opens Stripe, amount can be changed.';

/*
 * Steam's logo, the steam engine's piston in a circle, as Valve supply it in
 * one colour: Simple Icons' path, which is the official mark traced, under
 * CC0 (the path; the mark itself is Valve's trade mark). Valve allow it to
 * say a game is on Steam, in white or black and unaltered, beside words
 * that are not their wordmark. So it is drawn white on Steam's own navy,
 * #1b2838, with their light blue, #66c0f4, for the edge a pointer or the
 * cursor gives it, and the words "Wishlist on Steam" are set in this
 * product's hand. Do not restyle the path.
 */
export const STEAM_MARK = 'M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.605 0 11.979 0zM7.54 18.21l-1.473-.61c.262.543.714.999 1.314 1.25 1.297.539 2.793-.076 3.332-1.375.263-.63.264-1.319.005-1.949s-.75-1.121-1.377-1.383c-.624-.26-1.29-.249-1.878-.03l1.523.63c.956.4 1.409 1.5 1.009 2.455-.397.957-1.497 1.41-2.454 1.012H7.54zm11.415-9.303c0-1.662-1.353-3.015-3.015-3.015-1.665 0-3.015 1.353-3.015 3.015 0 1.665 1.35 3.015 3.015 3.015 1.663 0 3.015-1.35 3.015-3.015zm-5.273-.005c0-1.252 1.013-2.266 2.265-2.266 1.249 0 2.266 1.014 2.266 2.266 0 1.251-1.017 2.265-2.266 2.265-1.253 0-2.265-1.014-2.265-2.265z';

/* A brand mark as an inline SVG element, for a button to carry. */
export function markSvg(d, fill) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('fill', fill);
  path.setAttribute('d', d);
  svg.append(path);
  return svg;
}

/* Patreon's symbol. Do not restyle the path. */
export const PATREON_MARK = 'M15.386.524c-4.764 0-8.64 3.876-8.64 8.64 0 4.75 3.876 8.613 8.64 8.613 4.75 0 8.614-3.864 8.614-8.613C24 4.4 20.136.524 15.386.524M.003 23.537h4.22V.524H.003';

export function bindPatreon(anchor) {
  anchor.title = PATREON_NOTE;
  anchor.setAttribute('aria-label', PATREON_NOTE);
  if (PATREON_URL) {
    anchor.href = `${PATREON_URL}?utm_source=sim&ref=sim`;
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
  path.setAttribute('d', PATREON_MARK);
  svg.append(path);
  const word = document.createElement('span');
  word.textContent = 'Patreon';
  a.append(svg, word);
  bindPatreon(a);
  return a;
}

/*
 * The menu's Support row, opened from script like the wiki and board rows
 * but never under a named target (see windows.js): no opener, no referrer.
 * Then one first-party beacon, after the open so it can never stand in its
 * way, with no cookie and no ID. Not sendEvent, which would overwrite
 * `source` with the sponsor slug and add the referrer. Nothing is sent under
 * Global Privacy Control or with counting switched off, as for every event.
 */
export function openSupport() {
  const url = `${PATREON_URL}?utm_source=sim&ref=sim`;
  const tab = window.open(url, '_blank', 'noopener,noreferrer');
  if (tab) {
    /* Only a browser that ignored noopener hands the tab back. */
    tab.opener = null;
  }
  try {
    if (counting()) {
      const body = JSON.stringify({ v: 1, kind: 'support_click', source: 'sim', target: 'patreon' });
      navigator.sendBeacon(eventsUrl(), new Blob([body], { type: 'text/plain;charset=UTF-8' }));
    }
  } catch (e) {
    /* No beacon in this browser, or it refused. The page is already open. */
  }
}

/*
 * Open the Stripe tip link for a one-off battery donation.
 */
export function openTip() {
  const url = `${TIP_URL}?utm_source=sim&client_reference_id=menu&ref=sim`;
  const tab = window.open(url, '_blank', 'noopener,noreferrer');
  if (tab) {
    tab.opener = null;
  }
  try {
    if (counting()) {
      const body = JSON.stringify({ v: 1, kind: 'support_click', source: 'sim', target: 'tip' });
      navigator.sendBeacon(eventsUrl(), new Blob([body], { type: 'text/plain;charset=UTF-8' }));
    }
  } catch (e) {
    /* No beacon */
  }
}

/*
 * The Get it on Steam buttons. Same shape as the tip: opened from script,
 * no opener, a utm tag saying which button, and one beacon a press that
 * says where the button stood (the board's steam_click, a total per day per
 * place and nothing about the pilot). Never called from the flight loop.
 */
export function steamUrl(placement) {
  return `${STEAM_URL}?utm_source=sim&utm_campaign=${placement}`;
}

/* Count one press. Not sendEvent, for the reason openSupport gives.
 * Nothing is sent under Global Privacy Control or with counting off, and a
 * beacon that throws never stops the link. */
export function recordSteamClick(placement) {
  if (!STEAM_PLACES.includes(placement)) {
    return;
  }
  try {
    if (counting()) {
      const body = JSON.stringify({ v: 1, kind: 'steam_click', place: `sim-${placement}` });
      navigator.sendBeacon(eventsUrl(), new Blob([body], { type: 'text/plain;charset=UTF-8' }));
    }
  } catch (e) {
    /* No beacon in this browser, or it refused. The page is already open. */
  }
}

export function openWishlist(placement = 'about') {
  const tab = window.open(steamUrl(placement), '_blank', 'noopener,noreferrer');
  if (tab) {
    tab.opener = null;
  }
  recordSteamClick(placement);
}

/*
 * One Get it on Steam button, or null where it may not show. The same
 * sticker everywhere it goes: Steam's navy plate, their mark in white, the
 * words in the shell's heavy italic capitals, an ink rule and a hard ink
 * shadow, leaning like the gate's buttons (index.html, .steam-wishlist).
 * `placement` tags the link, so Steam's traffic report says which one a
 * visitor came from; `extra` is a class for where it sits. `onPress`,
 * when given, is what a plain press does instead of leaving for the store
 * (the title's sticker opens the Browser or Steam page): the address stays
 * on the link, so a middle click or "open in new tab" still reaches the
 * store, and that press is not counted, because nobody has left yet.
 */
export function wishlistAnchor(placement = 'title', extra = '', onPress = null) {
  if (!wishlistAllowed()) {
    return null;
  }
  const a = document.createElement('a');
  a.className = extra ? `steam-wishlist ${extra}` : 'steam-wishlist';
  const note = typeof onPress === 'function' ? STEAM_PAGE_NOTE : STEAM_NOTE;
  a.title = note;
  a.setAttribute('aria-label', note);
  a.href = steamUrl(placement);
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  const word = document.createElement('span');
  word.className = 'steam-wishlist-word';
  word.textContent = STEAM_LABEL;
  a.append(markSvg(STEAM_MARK, '#ffffff'), word);
  a.addEventListener('click', (event) => {
    if (typeof onPress === 'function') {
      event.preventDefault();
      onPress();
      return;
    }
    recordSteamClick(placement);
  });
  return a;
}

/*
 * The Instagram row. No beacon: the board's events endpoint records a
 * support click by source only and has no target to carry "instagram", so
 * there is nothing for it to count.
 */
export function openInstagram() {
  const tab = window.open(INSTAGRAM_URL, '_blank', 'noopener,noreferrer');
  if (tab) {
    tab.opener = null;
  }
}
