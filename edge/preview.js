/*
 * preview.js: what a link to one track, one map or one multiplayer room
 * says when it is posted.
 *
 * Facebook, X, WhatsApp, Discord, Slack, LinkedIn and iMessage all do the
 * same thing with a pasted link: fetch the page, read the og: and twitter:
 * tags in its head, and draw a card from them. None of them runs a line of
 * script. The simulator is a static site and the board serves one static
 * page, so every link to either, whichever track it named, was drawn as the
 * site's own card: the same picture of the race field, the same title.
 *
 * This is the one place on the estate that knows which track a link names
 * before the page's script runs, because it is the one place every request
 * passes through. So for a link preview it asks the board about the track,
 * and writes that track's name, its record and its share card into the head
 * on the way past. The picture itself is drawn by the browser that
 * published the track (src/share/card.js) and kept by the board.
 *
 * ONLY FOR THE PREVIEW BOTS, and that is load bearing rather than tidy.
 * Asking the board costs a round trip, and the board is a free Render
 * service that sleeps after a quiet quarter of an hour and takes most of a
 * minute to wake. The simulator is a static site precisely so that the
 * thing people fly never waits on that. A person's browser therefore gets
 * the page exactly as it always has, and only a crawler waits, and never
 * longer than the page took plus PREVIEW_WAIT_MS. A board that has not
 * answered by then is asleep, and the crawler gets the untouched page, which
 * is the site's own card: what every link got before this existed. A bot
 * this list does not know gets the same.
 *
 * NOTHING ABOUT THE PAGE CHANGES BUT ITS PREVIEW TAGS. og:url and the
 * canonical link move to the address that was asked for, because both
 * pages name their own front door there, and Facebook follows og:url and
 * draws whatever it finds at the other end: leaving it would send the
 * crawler straight back to the site's own card. The title, the description
 * and, when the board holds one, the picture, follow.
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

/*
 * The link preview fetchers, by the name each puts in its user agent.
 * iMessage sends facebookexternalhit and Twitterbot from the phone that is
 * composing the message, and Signal sends WhatsApp, so both are covered by
 * names already here. Googlebot and Bingbot are deliberately not: they
 * index the page, and a search result should be the page a person gets.
 */
const PREVIEW_BOTS = new RegExp([
  'facebookexternalhit', 'facebot', 'twitterbot', 'linkedinbot', 'slackbot',
  'discordbot', 'whatsapp', 'telegrambot', 'skypeuripreview', 'pinterest',
  'redditbot', 'embedly', 'iframely', 'vkshare', 'mastodon', 'bluesky',
  'cardyb', 'snap url preview', 'viber', 'kakaotalk-scrap', 'google-pagerenderer',
].join('|'), 'i');

export function isPreviewBot(userAgent) {
  return PREVIEW_BOTS.test(String(userAgent || ''));
}

/* How much longer than the page the board gets to answer. See above. */
export const PREVIEW_WAIT_MS = 4000;

/* The board's id rule, TRACK_ID_RE in its src/validate.js. A map is kept
 * under the same shape of id. Anything else is not asked about, so a
 * crafted query never reaches the board or the page. */
const ID_RE = /^trk-[0-9a-f]{8}$/;

/* A multiplayer room's code, CODE_RE in the board's src/rooms.js and the
 * simulator's src/net/roomlinks.js, exactly as a room link writes it. */
const ROOM_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;

/* A room's kind, as its link's words say it. */
const ROOM_WAYS = { freestyle: 'freestyle', '5inch': 'five inch racing', whoop: 'whoop racing' };

/* The share card's size, which the board holds every card to. */
const CARD_W = 1200;
const CARD_H = 630;

/* The picker's thumbnail, which the board holds every thumbnail to. It is
 * what a link shows for a map that was published before cards existed. */
const THUMB_W = 960;
const THUMB_H = 540;

/*
 * The maps that ship inside the simulator, by the id the picker's Copy link
 * puts after ?map=, with the name the picker shows and the picture it shows
 * beside it (assets/thumbs, the same files). They are not on the board, so
 * there is nothing to ask: a link to one is described from this table. The
 * ids and names are src/maps/registry.js's, and `built` is the starter yard
 * whose picture is the yard's. A link to any other ?map= is the site's own.
 */
const WORLDS = {
  city: { name: 'The town', thumb: 'city' },
  house: { name: "Nick Burns' house", thumb: 'house' },
  heads: { name: "Heads' house", thumb: 'heads' },
  bardwell: { name: "Joshua Bardwell's house", thumb: 'bardwell' },
  warehouse: { name: "Thomas More's Shop", thumb: 'warehouse' },
  goats: { name: '90%er goat herding', thumb: 'goats' },
  sunny: { name: 'Sunnyfield', thumb: 'sunny' },
  factory: { name: 'Hamakaze Works', thumb: 'factory' },
  drift: { name: 'Drift Matsuri', thumb: 'drift' },
  ball: { name: 'Quad Ball', thumb: 'ball' },
  arctic: { name: 'Hyoura Island', thumb: 'arctic' },
  towers: { name: 'Kumoi Towers', thumb: 'towers' },
  shiokaze: { name: 'Shiokaze Point', thumb: 'shiokaze' },
  cedar: { name: 'Kodama Onsen', thumb: 'cedar' },
  office: { name: 'Hoshino Shoji', thumb: 'office' },
  built: { name: 'Hibari Yard', thumb: 'yard' },
};

function trim(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

/*
 * Which published thing a request names, or null.
 *
 * `prefix` is the mount, '/sim' or '/board', and `rest` the path under it.
 * Only a page is a subject: a path ending in a slash or in .html. The
 * simulator names a track with ?share= and a map with ?mapshare=, and a
 * track wins when both are there, the rule boot.js, main.js and orbit.js
 * keep. The board names them with ?track= and ?map=, which is what its
 * Copy link hands out (courseShareHref in its public/app.js).
 *
 * A ROOM LINK (roomUrl in src/net/roomlinks.js) names a world in the same
 * words and a room with ?room=. It is the room first, with the world it
 * names as `fallback`, because a room lives only while somebody is in it
 * and its link outlives it: a link to a room that has closed is described
 * as the map it was on.
 *
 * A simulator link that carries ?board= for some other board is not this
 * board's track, so it is not described as one. `boards` is every address
 * this board answers at.
 */
export function subjectOf(prefix, rest, params, boards) {
  if (!(rest === '' || rest.endsWith('/') || rest.endsWith('.html'))) {
    return null;
  }
  let kind = '';
  let id = '';
  if (prefix === '/sim') {
    const elsewhere = params.get('board');
    if (elsewhere && !boards.includes(trim(elsewhere))) {
      return null;
    }
    if (ROOM_RE.test(params.get('room') || '')) {
      const world = new URLSearchParams(params);
      world.delete('room');
      return { kind: 'room', id: params.get('room'), fallback: subjectOf(prefix, rest, world, boards) };
    }
    if (params.get('share')) {
      kind = 'track';
      id = params.get('share');
    } else if (params.get('mapshare')) {
      kind = 'map';
      id = params.get('mapshare');
    } else if (Object.hasOwn(WORLDS, params.get('map') || '')) {
      return { kind: 'world', id: params.get('map') };
    }
  } else if (prefix === '/board') {
    if (params.get('track')) {
      kind = 'track';
      id = params.get('track');
    } else if (params.get('map')) {
      kind = 'map';
      id = params.get('map');
    }
  }
  if (!kind || !ID_RE.test(id)) {
    return null;
  }
  return { kind, id };
}

/*
 * The board's listing for the subject, or null for anything but a clean
 * answer: a 404, a board that is down, a body that is not JSON. `signal`
 * is how the router gives up on it.
 */
export async function fetchSubject(subject, boardUpstream, signal) {
  if (subject.kind === 'room') {
    return fetchRoom(subject, boardUpstream, signal);
  }
  if (subject.kind === 'world') {
    return { id: subject.id, ...WORLDS[subject.id] };
  }
  const route = subject.kind === 'map' ? 'maps' : 'tracks';
  const item = await boardJson(`${boardUpstream}/api/${route}/${subject.id}`, signal);
  return item && item.id === subject.id ? item : null;
}

async function boardJson(url, signal) {
  try {
    const res = await fetch(url, { headers: { accept: 'application/json' }, signal });
    if (!res.ok) {
      return null;
    }
    const body = await res.json();
    return body && typeof body === 'object' ? body : null;
  } catch (e) {
    return null;
  }
}

/*
 * A room's Join card, the board's GET /api/rooms/:code, which is public to
 * anybody with the code and the code is in the link. A room with no
 * picture of its own (its host's browser has not sent one yet, or cannot)
 * is shown with its map's, so its world is asked about too, as `under`. A
 * room that has closed is not a room, and the answer is the world's own
 * listing, described as that world by previewOf.
 */
async function fetchRoom(subject, boardUpstream, signal) {
  const room = await boardJson(`${boardUpstream}/api/rooms/${subject.id}`, signal);
  const under = subject.fallback && !(room && room.code === subject.id && room.hasCard && room.cardUtc)
    ? await fetchSubject(subject.fallback, boardUpstream, signal)
    : null;
  if (room && room.code === subject.id) {
    return { ...room, under };
  }
  return under;
}

function clean(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

/* A lap as the board prints it: 23.45 under a minute, 1:02.35 over. */
function lapText(ms) {
  const total = Number(ms) / 1000;
  if (!Number.isFinite(total) || total <= 0) {
    return '';
  }
  const m = Math.floor(total / 60);
  const s = total - m * 60;
  return m > 0 ? `${m}:${s.toFixed(2).padStart(5, '0')}` : `${s.toFixed(2)} s`;
}

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

/*
 * The words and the picture for one track or map. `item` is the board's
 * own listing, `pageUrl` the address that was asked for, `site` the origin
 * it was asked at, which is where the board is mounted.
 *
 * The designer, when the track carries a credit, rather than whoever
 * pressed Publish: it is the credit the board's sheet prints first. The
 * record, when there is one, because the one thing a pilot shown a track
 * wants to know is what it takes. The last sentence is the product's, in
 * the words the simulator's own og:description uses.
 */
export function previewOf(subject, item, { pageUrl, site }) {
  if (subject.kind === 'room') {
    return item.code === subject.id
      ? roomPreviewOf(subject, item, { pageUrl, site })
      : previewOf(subject.fallback, item, { pageUrl, site });
  }
  const world = subject.kind === 'world';
  const map = world || subject.kind === 'map';
  const name = clean(item.name) || (map ? 'Untitled map' : 'Untitled track');
  const by = world ? '' : clean(item.designer) || clean(item.author);
  const what = map ? 'freestyle map' : 'track';
  const title = by ? `${name}, a WebFPV ${what} by ${by}` : `${name}, a WebFPV ${what}`;

  /* What a player reads says what there is to do and no more: a map's piece
   * count is a builder's number, not a reason to click. */
  let lead;
  if (world) {
    lead = `Fly ${name} on a five inch quad.`;
  } else if (map) {
    const gaps = Number(item.gaps) || 0;
    lead = gaps
      ? `A freestyle map with ${plural(gaps, 'named gap', 'named gaps')} to find.`
      : 'A freestyle map to fly and trick on.';
  } else {
    const times = Array.isArray(item.times) ? item.times.length : Number(item.times) || 0;
    const lap = item.best ? lapText(item.best.lapMs) : '';
    /* best.lapMs is the time the board ranks: three laps on a RaceGOW room,
     * one lap on the field. The words have to say which, or a 15 second
     * room record reads as one very slow lap. */
    const metric = item.trackClass === 'micro' ? 'Three lap record' : 'Track record';
    lead = lap && clean(item.best.name)
      ? `${metric} ${lap} by ${clean(item.best.name)}, ${plural(times, 'time', 'times')} posted.`
      : 'No time posted yet, so the record is open.';
  }
  const description = `${lead} Fly it in your browser on a real Betaflight control loop. No install, no account.`;

  const route = map ? 'maps' : 'tracks';
  /* The picture, best first: the share card the publishing browser drew, then
   * the picker's thumbnail (maps published before cards existed have one
   * and no card), then nothing, which leaves the site's own card. */
  let image = null;
  let width = CARD_W;
  let height = CARD_H;
  if (world) {
    image = `${site}/sim/assets/thumbs/${item.thumb}.jpg`;
    width = THUMB_W;
    height = THUMB_H;
  } else if (item.hasCard && item.cardUtc) {
    image = `${site}/board/api/${route}/${subject.id}/card?v=${encodeURIComponent(item.cardUtc)}`;
  } else if (item.hasThumb && item.thumbUtc) {
    image = `${site}/board/api/${route}/${subject.id}/thumb?v=${encodeURIComponent(item.thumbUtc)}`;
    width = THUMB_W;
    height = THUMB_H;
  }
  const imageAlt = world
    ? `${name}, as it looks in the WebFPV simulator.`
    : `${name}, as it looks in the WebFPV simulator, with the WebFPV wordmark over it.`;
  return {
    url: pageUrl, title, description, image, imageAlt, width, height,
  };
}

/*
 * The words and the picture for a room that is open. The picture is the
 * one the host's browser drew (src/net/roomcard.js): their pilot over the
 * map. Without one, the map's own picture, as a link to the map shows.
 *
 * NO NAMES. Not the host's handle and not the room's name, both of which
 * are a pilot's own words in a private room and the youngest pilots are
 * eight; a preview goes wherever the link is posted and is cached there
 * after the room has closed. The map's name is public already, and is what
 * a pilot deciding whether to come wants to know.
 */
function roomPreviewOf(subject, item, { pageUrl, site }) {
  const map = clean(item.mapName) || 'a map';
  const way = ROOM_WAYS[item.way] || ROOM_WAYS.freestyle;
  const title = `Fly together on ${map} in WebFPV`;
  const description = `A ${way} room, open now. Follow the link to join it and fly in your browser on a real Betaflight control loop. No install, no account.`;
  let image = null;
  let width = CARD_W;
  let height = CARD_H;
  let imageAlt = `A pilot in front of ${map}, with the WebFPV wordmark and the words Fly together.`;
  if (item.hasCard && item.cardUtc) {
    image = `${site}/board/api/rooms/${subject.id}/card?v=${encodeURIComponent(item.cardUtc)}`;
  } else if (item.under && subject.fallback) {
    const own = previewOf(subject.fallback, item.under, { pageUrl, site });
    ({
      image, width, height, imageAlt,
    } = own);
  }
  return {
    url: pageUrl, title, description, image, imageAlt, width, height,
  };
}

function attr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/*
 * The page with its preview tags swapped, and nothing else touched.
 *
 * Every <meta> in the head whose property or name is one of these is
 * rewritten whole, so the attribute order and spacing of the page's own
 * copy do not matter; one the page does not carry is added before </head>.
 * The picture's six tags are only written when there is a card: without
 * one, the page's own og.png and its size stay, which is the right picture
 * for a track that has no picture of its own.
 */
export function withPreview(html, p) {
  const end = html.search(/<\/head>/i);
  if (end < 0) {
    return html;
  }
  const want = new Map([
    ['og:url', ['property', p.url]],
    ['og:title', ['property', p.title]],
    ['og:description', ['property', p.description]],
    ['twitter:title', ['name', p.title]],
    ['twitter:description', ['name', p.description]],
  ]);
  if (p.image) {
    want.set('og:image', ['property', p.image]);
    want.set('og:image:type', ['property', 'image/jpeg']);
    want.set('og:image:width', ['property', String(p.width || CARD_W)]);
    want.set('og:image:height', ['property', String(p.height || CARD_H)]);
    want.set('og:image:alt', ['property', p.imageAlt]);
    want.set('twitter:image', ['name', p.image]);
    want.set('twitter:image:alt', ['name', p.imageAlt]);
  }
  const tag = (key) => {
    const [kind, value] = want.get(key);
    return `<meta ${kind}="${key}" content="${attr(value)}" />`;
  };
  const seen = new Set();
  let head = html.slice(0, end).replace(/<meta\b[^>]*>/gi, (found) => {
    const key = found.match(/\b(?:property|name)\s*=\s*"([^"]*)"/i);
    if (!key || !want.has(key[1])) {
      return found;
    }
    seen.add(key[1]);
    return tag(key[1]);
  });
  head = head.replace(/<link\b[^>]*\brel\s*=\s*"canonical"[^>]*>/i, `<link rel="canonical" href="${attr(p.url)}" />`);
  const missing = [...want.keys()].filter((key) => !seen.has(key));
  const added = missing.map((key) => `    ${tag(key)}\n`).join('');
  return `${head}${added}${html.slice(end)}`;
}
