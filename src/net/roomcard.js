/*
 * roomcard.js: the picture a room link shows when it is posted.
 *
 * WHAT IT IS. The room's map, from the same picture the room's own share
 * sheet shows beside its code, with the host's pilot standing in a manga
 * panel down the right, FLY TOGETHER lettered down the left in the menus'
 * hand, and the wordmark where every other card carries it (src/share/
 * card.js). 1200 by 630, a JPEG, so the board checks it exactly as it
 * checks a track's share card. The owner's ask of 2026-10-27: a room link
 * posted on social media shows "the host's avatar and the map in the
 * background".
 *
 * NO NAME AND NO CODE IN THE PICTURE. The host's handle is the pilot's
 * own word in a private room, and the youngest pilots are eight: a picture
 * goes wherever the link goes, and is cached there long after the room has
 * closed. The face is a drawn pilot, which is the point of having one. The
 * map's name travels in the link's own text, which the edge writes from
 * the board (edge/preview.js), and the code is already in the link.
 *
 * WHY THE HOST'S BROWSER DRAWS IT. The board renders nothing (one Node
 * service, one Postgres), and a crawler runs no script, so the picture has
 * to exist before anybody shares the link. The host's browser is the one
 * place where the pilot's look, the map's picture and the key that proves
 * it is the host are all together, the same reason a track's card is drawn
 * by the browser that publishes it.
 *
 * WHAT IT COSTS. Nothing in flight: src/net/together.js only asks for one
 * while the host is on a menu, and once per room, new host or new look.
 * Nothing new downloaded: the map's picture is the one the share sheet has
 * just shown, and the pilot is drawn by src/net/avatar.js from the atlas
 * every room sheet already uses. One upload of about a hundred kilobytes,
 * held by the board in memory with the room and fetched only by the
 * crawlers of the sites it is posted to. This module itself is imported the
 * first time a card is drawn, so a pilot who never hosts never fetches it.
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

import { liveryCss, loadAvatarAtlas, paintAvatar } from './avatar.js';
import {
  CARD_H, CARD_W, base64Of, drawWordmark, encodeCard,
} from '../share/card.js';
import {
  INK, INKS, PAPER, drawRuns, wordWidth,
} from '../ui/lettering.js';

const DEEP = '#141c16';
const UI_FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/* The panel the pilot stands in, its four corners clockwise from the top
 * left, a little off square the way a manga page cuts a panel. Clear of
 * the wordmark, which is 96 px type from x 52 and reaches about 540. */
const PANEL = [[738, 40], [1160, 56], [1146, 590], [716, 600]];
/* The pilot: the 'card' crop, 4 wide by 5 tall, standing on the panel's
 * foot with room over the head for the tallest hair and hat. */
const PILOT_W = 412;
const PILOT_X = 734;
const PILOT_FOOT = 604;

/* The left half's words. The kicker is the map, small, in the shell's
 * type; the lettering is the menus' hand, as large as the room allows. */
const LEFT = 56;
const ROOM_W = 620;
const KICKER_Y = 206;
const LETTER_MAX = 132;

function polygon(ctx, points) {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

/* The map's picture over the whole card, scaled to cover and cut from its
 * middle, a little high, because a thumbnail's sky is the part to lose. */
function drawPicture(ctx, picture) {
  ctx.fillStyle = DEEP;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  const w = picture && (picture.naturalWidth || picture.width);
  const h = picture && (picture.naturalHeight || picture.height);
  if (!w || !h) {
    /* No picture: the run card's paper tone in ink, so the card is still
     * the same book. */
    ctx.fillStyle = 'rgba(243, 234, 212, 0.05)';
    for (let j = 0; j * 9 < CARD_H; j += 1) {
      for (let i = 0; i * 9 < CARD_W; i += 1) {
        ctx.beginPath();
        ctx.arc(i * 9 + (j % 2 ? 4.5 : 0), j * 9, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    return;
  }
  const k = Math.max(CARD_W / w, CARD_H / h);
  const dw = w * k;
  const dh = h * k;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(picture, (CARD_W - dw) / 2, (CARD_H - dh) * 0.4, dw, dh);
}

/* composeCard's shade (src/share/card.js), heavier on the left, where the
 * words are, than a track's card is. */
function drawShade(ctx) {
  const across = ctx.createLinearGradient(0, 0, CARD_W, 0);
  across.addColorStop(0, 'rgba(12, 18, 14, 0.66)');
  across.addColorStop(0.42, 'rgba(12, 18, 14, 0.36)');
  across.addColorStop(0.62, 'rgba(12, 18, 14, 0.08)');
  across.addColorStop(1, 'rgba(12, 18, 14, 0.04)');
  ctx.fillStyle = across;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  const down = ctx.createLinearGradient(0, 0, 0, CARD_H);
  down.addColorStop(0, 'rgba(12, 18, 14, 0.42)');
  down.addColorStop(0.24, 'rgba(12, 18, 14, 0)');
  down.addColorStop(0.7, 'rgba(12, 18, 14, 0)');
  down.addColorStop(1, 'rgba(12, 18, 14, 0.34)');
  ctx.fillStyle = down;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
}

/*
 * The panel: a hard ink shadow, paper, a dot tone in the pilot's livery
 * rising from the foot, focus lines from behind the head, the pilot, and
 * the ink border last, over the pilot's shoulders, so the pilot is in the
 * panel rather than pasted on it.
 */
function drawPanel(ctx, pilot, livery) {
  ctx.save();
  polygon(ctx, PANEL.map(([x, y]) => [x + 12, y + 14]));
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fill();
  polygon(ctx, PANEL);
  ctx.fillStyle = PAPER;
  ctx.fill();
  ctx.clip();

  /* Focus lines, a manga's way of saying look here, from a point behind
   * the pilot's head. Fixed, not random: the same look draws the same
   * card. */
  const cx = 948;
  const cy = 250;
  ctx.fillStyle = 'rgba(11, 17, 22, 0.1)';
  for (let i = 0; i < 48; i += 1) {
    const a = (i / 48) * Math.PI * 2;
    const spread = 0.022 + 0.014 * ((i * 7) % 5) / 4;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * 150, cy + Math.sin(a) * 150);
    ctx.lineTo(cx + Math.cos(a - spread) * 700, cy + Math.sin(a - spread) * 700);
    ctx.lineTo(cx + Math.cos(a + spread) * 700, cy + Math.sin(a + spread) * 700);
    ctx.closePath();
    ctx.fill();
  }

  /* The dot tone: the livery's colour, the dots growing toward the foot. */
  ctx.fillStyle = livery;
  ctx.globalAlpha = 0.5;
  for (let j = 0; j * 12 < 600; j += 1) {
    const y = 40 + j * 12;
    const r = Math.max(0, (y - 300) / 300) * 5.2;
    if (r < 0.4) {
      continue;
    }
    for (let i = 0; i * 12 < 470; i += 1) {
      ctx.beginPath();
      ctx.arc(700 + i * 12 + (j % 2 ? 6 : 0), y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  if (pilot) {
    const tall = PILOT_W * (pilot.height / pilot.width);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(pilot, PILOT_X, PILOT_FOOT - tall, PILOT_W, tall);
  }
  ctx.restore();

  polygon(ctx, PANEL);
  ctx.lineJoin = 'miter';
  ctx.lineWidth = 8;
  ctx.strokeStyle = INK;
  ctx.stroke();
}

/* The map's name over the lettering, as the run card sets its own. Cut
 * with an ellipsis rather than run under the panel. */
function drawKicker(ctx, mapName) {
  const name = String(mapName || '').replace(/\s+/g, ' ').trim().toUpperCase();
  if (!name) {
    return;
  }
  ctx.font = `700 26px ${UI_FONT}`;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  let text = name;
  if (ctx.measureText(text).width > ROOM_W) {
    while (text.length > 1 && ctx.measureText(`${text}…`).width > ROOM_W) {
      text = text.slice(0, -1).trimEnd();
    }
    text = `${text}…`;
  }
  ctx.fillStyle = 'rgba(11, 17, 22, 0.8)';
  ctx.fillText(text, LEFT + 2, KICKER_Y + 2);
  ctx.fillStyle = '#e4ddc8';
  ctx.fillText(text, LEFT, KICKER_Y);
  ctx.fillStyle = INKS.sakura;
  ctx.fillRect(LEFT, KICKER_Y + 16, 48, 4);
}

/* FLY over TOGETHER!, in cream and mint, the menus' title colours, both
 * lines at the one size that lets the longer fit. */
function drawLettering(ctx) {
  const lines = [['FLY', INKS.cream], ['TOGETHER!', INKS.mint]];
  let px = LETTER_MAX;
  const widest = Math.max(...lines.map(([t]) => wordWidth(ctx, t, px)));
  if (widest > ROOM_W) {
    px *= ROOM_W / widest;
  }
  let y = KICKER_Y + 36 + px * 0.86;
  for (const [text, fill] of lines) {
    drawRuns(ctx, [{ text, fill }], LEFT, y, px, { seed: `room ${text}` });
    y += px * 1.02;
  }
}

/*
 * The card, on a canvas of its own. picture: the map's, anything
 * drawImage takes, or null for none. avatar: the host's look. pilot is
 * drawn by the caller (pilotOf below) so this stays a pure drawing that
 * scripts/together-shots.js can call with a picture of its choosing.
 */
export function drawRoomCard({ picture = null, pilot = null, avatar = {}, mapName = '' }) {
  const card = document.createElement('canvas');
  card.width = CARD_W;
  card.height = CARD_H;
  const ctx = card.getContext('2d');
  drawPicture(ctx, picture);
  drawShade(ctx);
  drawPanel(ctx, pilot, liveryCss(avatar, 0));
  drawWordmark(ctx);
  drawKicker(ctx, mapName);
  drawLettering(ctx);
  return card;
}

/* The host's pilot, waving, in the pilot card's crop and at twice the
 * size it is laid at, so the card's JPEG has detail to keep. */
export async function pilotOf(avatar) {
  await loadAvatarAtlas();
  const c = document.createElement('canvas');
  return paintAvatar(c, avatar, { expr: 'hello', crop: 'card', size: PILOT_W }) ? c : null;
}

/*
 * One picture, or null. Same origin is the live site (the board is at
 * /board on webfpv.org) and the shipped worlds; anything else is asked for
 * with CORS, which the board grants, so the canvas can still be read. The
 * share sheet has just shown the first address, so that is a cache hit.
 */
export function loadPicture(src) {
  if (!src) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const img = new Image();
    try {
      if (new URL(src, window.location.href).origin !== window.location.origin) {
        img.crossOrigin = 'anonymous';
      }
    } catch (e) {
      resolve(null);
      return;
    }
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/* The first of the addresses that answers with a picture: the next is
 * only asked for when the one before has none. */
async function firstPicture(srcs) {
  for (const src of srcs) {
    const got = await loadPicture(src);
    if (got) {
      return got;
    }
  }
  return null;
}

/*
 * Draw the card and give it to the board, which keeps it only for the
 * host. Answers the board's { cardUtc } or throws with its sentence.
 * key: the browser's key the room knows the host by (src/share/rating.js).
 * pictures: the map's picture's addresses, best first.
 */
export async function sendRoomCard({
  board, code, key, avatar, mapName, pictures = [], fetchImpl = fetch,
}) {
  const [picture, pilot] = await Promise.all([firstPicture(pictures.filter(Boolean)), pilotOf(avatar)]);
  const bytes = await encodeCard(drawRoomCard({
    picture, pilot, avatar, mapName,
  }));
  const res = await fetchImpl(`${board}/api/rooms/${encodeURIComponent(code)}/card`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ key, card: base64Of(bytes) }),
  });
  let body = null;
  try {
    body = await res.json();
  } catch (e) {
    body = null;
  }
  if (!res.ok) {
    throw new Error((body && body.error) || `The board answered ${res.status}.`);
  }
  return body;
}
