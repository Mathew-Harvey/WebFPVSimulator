/*
 * steampage.js: "Browser or Steam?", one magazine page in the menus.
 *
 * The Steam edition went on sale on 2026-11-27. Until this page, every
 * Steam button threw a pilot straight at the store with no reason given.
 * The owner's plan of 2026-11-28 ("ensure we drive sales", then "The whole
 * list" on its card) puts the reason first: what the Steam edition adds to
 * the game a pilot is already flying, as ink panels, with the store's
 * button at the foot.
 *
 * WHAT IT MAY SAY. Only what the Steam build does today: it flies offline,
 * saves go to Steam Cloud, it has the PC to itself and can run with vsync
 * off, it hosts race nights on a LAN, it has an Ultra preset and a music
 * player, it flies in the same rooms as the browser, and it asks for
 * nothing after a flight. Achievements and the Steam times tables are a
 * later patch (the owner, 2026-11-28) and are not named here until they
 * are live. And it says, first, that everything a pilot can fly stays free
 * in the browser, because that is true and it is why they are here.
 *
 * COST. Nothing until it is opened: ui.js imports this module on the press,
 * and the two pictures are asked for when the page is built, not before.
 * It is a menu page. It is never opened from a flight, and nothing in it
 * runs in a frame.
 *
 * NEVER IN THE STEAM EDITION: openSteamPage answers null where
 * wishlistAllowed() is false, as every Steam button does.
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

import { wishlistAllowed } from '../steam/edition.js';
import { wishlistAnchor } from './patreon.js';

/* The panels, in the order they are read. A heading a pilot can take in at
 * a glance, then one plain sentence. */
export const STEAM_PANELS = [
  ['Flies offline', 'No internet needed once it is installed. Fly at the field, on a plane, anywhere.'],
  ['Your career is safe', 'Your career, tunes and builds save to Steam Cloud and follow your account.'],
  ['Lower latency', 'It has the whole PC to itself: no other tabs, no extensions, and vsync off if you want it.'],
  ['Race nights on a LAN', 'One PC hosts and the rest join by code. No internet needed at the club.'],
  ['Ultra graphics', 'A preset for a strong gaming PC, and a music player to pick the songs you fly to.'],
  ['Same rooms', 'Steam pilots and browser pilots fly together. Nobody is left behind.'],
];

export const STEAM_PAGE_TITLE = 'Browser or Steam?';
export const STEAM_PAGE_DECK = 'Everything you can fly is free in your browser, and it stays free. The Steam edition is the same game, made to own.';
export const STEAM_PAGE_FOOT = 'One payment. It backs the sim, and the Steam edition never asks again.';

/* Two pictures of the Steam edition, from its store page. */
const SHOTS = [
  ['race.jpg', 'A five inch quad coming through a start gate on a race track'],
  ['flip.jpg', 'A quad upside down over the yard, halfway through a flip'],
];

let open = null;

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) {
    n.className = cls;
  }
  if (text) {
    n.textContent = text;
  }
  return n;
}

export function closeSteamPage() {
  if (!open) {
    return false;
  }
  const { page, onKey, back } = open;
  open = null;
  document.removeEventListener('keydown', onKey, true);
  page.remove();
  if (back && typeof back.focus === 'function') {
    back.focus();
  }
  return true;
}

export function steamPageOpen() {
  return Boolean(open);
}

/*
 * Open the page. `from` is the button that opened it (a word from
 * STEAM_PLACES in patreon.js), and the store's button at the foot carries
 * it, so a press is counted against the place that brought the pilot here.
 * Returns the page, or null where it may not show.
 */
export function openSteamPage(from = 'about') {
  if (!wishlistAllowed() || !document.body) {
    return null;
  }
  if (open) {
    return open.page;
  }
  const page = el('div', 'steam-page');
  page.setAttribute('role', 'dialog');
  page.setAttribute('aria-modal', 'true');
  page.setAttribute('aria-label', STEAM_PAGE_TITLE);

  const sheet = el('div', 'steam-page-sheet');
  const close = el('button', 'steam-page-close', '×');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close');
  close.addEventListener('click', closeSteamPage);

  const head = el('div', 'steam-page-head');
  head.append(el('span', 'steam-page-kicker', 'Out now on Steam'), el('h2', 'steam-page-title', STEAM_PAGE_TITLE), el('p', 'steam-page-deck', STEAM_PAGE_DECK));

  const shots = el('div', 'steam-page-shots');
  for (const [file, alt] of SHOTS) {
    const img = el('img', 'steam-page-shot');
    img.alt = alt;
    img.width = 720;
    img.height = 405;
    img.decoding = 'async';
    img.src = new URL(`../../assets/steam/${file}`, import.meta.url).href;
    shots.append(img);
  }

  const grid = el('div', 'steam-page-grid');
  STEAM_PANELS.forEach(([name, words], i) => {
    const panel = el('div', 'steam-page-panel');
    panel.append(el('span', 'steam-page-no', String(i + 1).padStart(2, '0')), el('h3', 'steam-page-name', name), el('p', 'steam-page-words', words));
    grid.append(panel);
  });

  const foot = el('div', 'steam-page-foot');
  const buy = wishlistAnchor(from, 'steam-page-buy');
  const stay = el('button', 'steam-page-stay', 'Keep flying free');
  stay.type = 'button';
  stay.addEventListener('click', closeSteamPage);
  foot.append(el('p', 'steam-page-note', STEAM_PAGE_FOOT), buy, stay);

  sheet.append(close, head, shots, grid, foot);
  page.append(sheet);
  /* A press on the dark round the sheet closes it, as it does a dialog. */
  page.addEventListener('click', (e) => {
    if (e.target === page) {
      closeSteamPage();
    }
  });

  /* While the page is up it owns the keyboard: Escape closes it, Tab stays
   * inside it, and no key reaches the menu underneath, which would
   * otherwise step its cursor behind the page. */
  const onKey = (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      closeSteamPage();
      return;
    }
    if (e.key === 'Tab') {
      const stops = [close, buy, stay];
      const at = stops.indexOf(document.activeElement);
      e.preventDefault();
      stops[(at + (e.shiftKey ? stops.length - 1 : 1) + stops.length) % stops.length].focus();
    }
  };
  document.addEventListener('keydown', onKey, true);

  open = { page, onKey, back: document.activeElement };
  document.body.append(page);
  buy.focus();
  return page;
}
