/*
 * windows.js: how many tabs this product is allowed to leave open.
 *
 * One simulator, one board. Every link between the three sites carried
 * target="_blank" or window.open(..., '_blank'), so a session spent moving
 * between them ended with a row of tabs, several of them running a physics
 * loop and a WebGL context nobody was looking at. Flying three courses off
 * the board left three simulators.
 *
 * The fix is the oldest one the platform has: a named browsing context.
 * Opening a URL under a name navigates the tab already carrying that name
 * instead of making another, and focuses it. So there are two names, here,
 * written down once:
 *
 *   webfpv-sim     the simulator page and the track builder, which are one
 *                  tab because the simulator navigates to the builder in
 *                  place and the builder navigates back
 *   webfpv-board   the leaderboard
 *
 * Two rules come out of that and both are easy to break by accident.
 *
 * `rel="noopener"` cannot ride along. The HTML spec resolves a noopener
 * link by setting the target name to "_blank" before it looks anything up,
 * so a named link that also asks for noopener silently opens a new tab
 * every time, which is the bug this file exists to fix. Dropping it hands
 * the opened page a cross origin `window.opener`, which can do three things
 * to us: postMessage, close, and set our location. Both ends of every link
 * here are our own sites, so that is a trade worth making. Do not extend
 * a named target to a link that leaves the product.
 *
 * A tab has to claim its name to be found. A name set by whoever opened
 * the tab is not enough: the simulator opened from a bookmark has no name,
 * so the board's Fly this course would not find it and would open a second
 * one. Every page that is one of the two tabs calls claimWindowName as
 * early as it can. window.name survives same origin navigation, so the
 * simulator keeps the claim when it goes to the builder.
 *
 * What this does not do is reach across browsing context groups. A board
 * and a simulator the player opened separately, neither from the other,
 * cannot see each other's names, and the first link between them makes one
 * more tab. From then on the pair is joined and stays a pair.
 *
 * A modifier click still opens a new tab, because the browser overrides the
 * target when the player asks for that. That is deliberate: "open in a new
 * tab" is the player's to say.
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

/* The board repository has these two strings written down again, because
 * it cannot import from here. They have to agree. */
export const SIM_WINDOW = 'webfpv-sim';
export const BOARD_WINDOW = 'webfpv-board';
export const WIKI_WINDOW = 'webfpv-wiki';

/*
 * Say which of the two tabs this page is. Returns the name it took, or ''
 * if it took none, which is what a frame gets: orbit.html is served from
 * this origin and runs inside the board's cards, and a thumbnail is not a
 * tab. Naming it would make every card a candidate for the simulator's
 * links.
 */
export function claimWindowName(name) {
  try {
    if (window.top !== window.self) {
      return '';
    }
    window.name = name;
    return name;
  } catch (e) {
    /* No window, as in Node, or a frame that will not answer. */
    return '';
  }
}

/*
 * Open a URL as one of the two tabs: the one already carrying the name if
 * there is one, a new tab if there is not. No feature string, deliberately,
 * for the noopener reason above. Returns the window, or null when a popup
 * blocker took it, which is the caller's cue that nothing happened.
 */
export function openNamedWindow(url, name) {
  let opened = null;
  try {
    opened = window.open(url, name);
  } catch (e) {
    return null;
  }
  if (opened) {
    /* Reuse without focus looks like the click did nothing: the course
     * loads in a tab behind this one. */
    try {
      opened.focus();
    } catch (e) {
      /* Cross origin, and the browser did not feel like it. */
    }
  }
  return opened;
}
