/*
 * card.js: the share card, the picture a link to a published track or map
 * shows when somebody posts it.
 *
 * WHAT IT IS. One 1200 by 630 frame of the thing, in the real renderer,
 * built by src/share/orbit.html from the board's own copy and seen from
 * above and to one side of its middle, with the WebFPV wordmark over the
 * top left exactly as og.png has it over the race field. So a pasted link
 * to somebody's track shows their whole track, and says whose product it
 * is in the same letters the title screen says it in. A RaceGOW room is
 * seen from inside, the way the board's sheet sees it.
 *
 * NO NAME IN THE PICTURE, and that is a decision rather than an omission.
 * The simulator republishes every track a pilot owns, in the background,
 * when they change their name (syncOwnedIdentity in ./listing.js), and no
 * renderer is anywhere near that. A card that printed the author would be
 * wrong from that moment until the next Publish. The name travels in the
 * link's own text instead, which the edge writes fresh from the board every
 * time a crawler asks (edge/preview.js).
 *
 * WHY THE BROWSER THAT PUBLISHES DRAWS IT. The board renders nothing and is
 * not going to: one Node service, one Postgres, no WebGL. And a crawler runs
 * no script, so the picture has to exist before anybody shares the link.
 * The moment after a publish is the only moment when the published copy,
 * the edit key and a GPU are all in one place, which is the reason
 * ./cardgif.js draws a room's animation there too. For everything published
 * before this existed, scripts/boardcards.js draws the same page headless
 * and uploads with the board's admin token.
 *
 * WHY AN IFRAME OF orbit.html. That page already builds a published track
 * or map on its own, from the board's copy, in the renderer the game flies,
 * and tears everything down when it is closed. A card is one frame of it
 * with the wordmark on, so card mode is a dozen lines there rather than a
 * second way of building a world here, and the builder never has the
 * simulator's whole render graph in its own page.
 *
 * NOTHING HERE THROWS. The track is already on the board when this runs. A
 * GPU that refused a context, or a board older than share cards, leaves the
 * author with a published track whose link shows the site's own card, and a
 * sentence saying so. Never with an error in place of a publish.
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

import { postShareCard } from './board.js';

/* 1.91 to 1, which Facebook, X, LinkedIn and WhatsApp all crop to. The
 * board refuses any other size, because its tags promise this one. */
export const CARD_W = 1200;
export const CARD_H = 630;

/*
 * UNDER 300 kB, because WhatsApp is reported to drop a preview picture
 * over about that, and it is the one platform where a big card fails
 * silently rather than slowly. The first quality is the one that looks
 * like the game; each step down is only taken when the one before came out
 * too heavy, which a busy frame with a lot of foliage can.
 */
const CARD_BYTES_AIM = 300_000;
const CARD_QUALITIES = [0.86, 0.8, 0.72, 0.64, 0.56];

/* How long the frame gets to build a world and draw it before the author
 * is told it did not. The town is the slowest thing it builds. */
const CARD_WAIT_MS = 120_000;

/* The shell's own tokens, from :root in index.html. */
const DEEP = '#141c16';
const CREAM = '#f3ead4';
const SAKURA = '#e8a8b8';
const UI_FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/*
 * The wordmark, drawn the way .wordmark in index.html draws it: 800
 * weight, 0.08em of letter spacing, WEB in cream and FPV in sakura, a hard
 * dark shadow three pixels down and right and a soft one ten pixels under.
 * 96 px is what the title's clamp comes to at 1200 wide, which is what it
 * was when scripts/og.js took og.png, so the two cards carry one mark at
 * one size in one place.
 *
 * One glyph at a time rather than with ctx.letterSpacing, which Safari only
 * learned recently: a card drawn on an iPhone must come out the same shape.
 */
const MARK_SIZE = 96;
const MARK_X = 52;
const MARK_BASELINE = 108;

/* Exported for the freestyle run's card (drawRunCard in
 * src/ui/mangapage.js), which carries the same mark in the same place. */
export function drawWordmark(ctx) {
  const glyphs = [
    ...[...'WEB'].map((ch) => [ch, CREAM]),
    ...[...'FPV'].map((ch) => [ch, SAKURA]),
  ];
  ctx.font = `800 ${MARK_SIZE}px ${UI_FONT}`;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  const spacing = MARK_SIZE * 0.08;
  const lay = (fn) => {
    let x = MARK_X;
    for (const [ch, colour] of glyphs) {
      fn(ch, x, colour);
      x += ctx.measureText(ch).width + spacing;
    }
  };

  /* The soft shadow, cast by letters drawn off the canvas so that only the
   * shadow lands: the usual way to get a shadow without its letters. */
  const away = 4 * CARD_W;
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.32)';
  ctx.shadowBlur = 28;
  ctx.shadowOffsetX = away;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = '#000';
  lay((ch, x) => ctx.fillText(ch, x - away, MARK_BASELINE));
  ctx.restore();

  /* The hard shadow, then the letters on it. */
  ctx.fillStyle = 'rgba(20, 28, 20, 0.82)';
  lay((ch, x) => ctx.fillText(ch, x + 3, MARK_BASELINE + 3));
  lay((ch, x, colour) => {
    ctx.fillStyle = colour;
    ctx.fillText(ch, x, MARK_BASELINE);
  });
}

/*
 * The frame with the mark on it. `frame` is anything drawImage takes: the
 * orbit page's WebGL canvas, read in the same task it was drawn in, or an
 * image when this is tried out by hand.
 *
 * The shade is the title screen's own, from .screen-title in index.html,
 * lighter across the width: the title darkens its left third for a menu,
 * and there is no menu here, only a track somebody wants seen. What is left
 * is enough to hold cream letters over a bright sky, which is its job.
 */
export function composeCard(frame) {
  const card = document.createElement('canvas');
  card.width = CARD_W;
  card.height = CARD_H;
  const ctx = card.getContext('2d');
  ctx.fillStyle = DEEP;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  ctx.drawImage(frame, 0, 0, CARD_W, CARD_H);

  const across = ctx.createLinearGradient(0, 0, CARD_W, 0);
  across.addColorStop(0, 'rgba(12, 18, 14, 0.46)');
  across.addColorStop(0.26, 'rgba(12, 18, 14, 0.2)');
  across.addColorStop(0.52, 'rgba(12, 18, 14, 0.04)');
  across.addColorStop(1, 'rgba(12, 18, 14, 0.06)');
  ctx.fillStyle = across;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  const down = ctx.createLinearGradient(0, 0, 0, CARD_H);
  down.addColorStop(0, 'rgba(12, 18, 14, 0.4)');
  down.addColorStop(0.24, 'rgba(12, 18, 14, 0)');
  down.addColorStop(0.64, 'rgba(12, 18, 14, 0)');
  down.addColorStop(1, 'rgba(12, 18, 14, 0.3)');
  ctx.fillStyle = down;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  drawWordmark(ctx);
  return card;
}

function jpegOf(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('This browser could not encode the share card.'));
        return;
      }
      blob.arrayBuffer().then((buf) => resolve(new Uint8Array(buf)), reject);
    }, 'image/jpeg', quality);
  });
}

/*
 * The card as JPEG bytes, as light as it has to be and no lighter. A
 * browser that does not do JPEG hands toBlob's default back instead, which
 * is PNG; that is caught here with a sentence rather than by the board
 * with a refusal.
 */
export async function encodeCard(canvas) {
  let bytes = null;
  for (const quality of CARD_QUALITIES) {
    bytes = await jpegOf(canvas, quality);
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) {
      throw new Error('This browser does not write JPEG, so it cannot make a share card.');
    }
    if (bytes.length <= CARD_BYTES_AIM) {
      break;
    }
  }
  return bytes;
}

/*
 * Base64, chunked, because String.fromCharCode over two hundred thousand
 * arguments overflows the stack. The same stride ./cardgif.js uses.
 */
export function base64Of(bytes) {
  let raw = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    raw += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(raw);
}

/*
 * The orbit page's address for one card. `kind` is 'track' or 'map'; the
 * page reads ?share= for a track and ?mapshare= for a map, as the board's
 * own sheet sends it, and ?card=1 makes it draw a card instead of a clip.
 */
export function cardPageUrl({ kind, id, board }) {
  const url = new URL('./orbit.html', import.meta.url);
  if (kind === 'map') {
    url.searchParams.set('map', 'built');
    url.searchParams.set('mapshare', id);
  } else {
    url.searchParams.set('map', 'custom');
    url.searchParams.set('share', id);
  }
  if (board) {
    url.searchParams.set('board', board);
  }
  url.searchParams.set('card', '1');
  return url.href;
}

/*
 * Draw the card in a frame nobody sees, and hand back its bytes.
 *
 * The frame is laid out at the card's own size and moved off the page,
 * not display:none: a document that is not rendered at all is one some
 * browsers stop running timers in. It is removed however this ends, which
 * takes its WebGL context and its copy of the world with it.
 */
export function renderShareCard({ kind, id, board }) {
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.title = 'Drawing the share card';
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    frame.style.cssText = [
      'position: fixed', `left: -${CARD_W + 200}px`, 'top: 0',
      `width: ${CARD_W}px`, `height: ${CARD_H}px`,
      'border: 0', 'opacity: 0', 'pointer-events: none',
    ].join('; ');

    let timer = 0;
    const finish = (fn, value) => {
      clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      frame.remove();
      fn(value);
    };
    function onMessage(event) {
      if (event.source !== frame.contentWindow) {
        return;
      }
      const data = event.data || {};
      if (data.type === 'webfpv-card' && data.buffer) {
        finish(resolve, new Uint8Array(data.buffer));
      } else if (data.type === 'webfpv-card-error') {
        finish(reject, new Error(data.error || 'The share card could not be drawn.'));
      }
    }
    timer = setTimeout(() => {
      finish(reject, new Error('Drawing the share card took too long.'));
    }, CARD_WAIT_MS);
    window.addEventListener('message', onMessage);
    frame.src = cardPageUrl({ kind, id, board });
    document.body.append(frame);
  });
}

/*
 * Draw it and put it on the board. `editKey` is the one the publish just
 * used: a track's from readEditKey, a map's from readMapListing.
 *
 * Returns { ok, bytes } when the board took it, and { error } with a
 * sentence when anything on the way did not. Never throws.
 */
export async function sendShareCard({ kind, id, board, editKey }) {
  if (!id || !board) {
    return { error: 'There is no published copy to draw.' };
  }
  try {
    const bytes = await renderShareCard({ kind, id, board });
    await postShareCard({
      kind, id, card: base64Of(bytes), editKey, origin: board,
    });
    return { ok: true, bytes: bytes.length };
  } catch (e) {
    return { error: e && e.message ? e.message : String(e) };
  }
}
