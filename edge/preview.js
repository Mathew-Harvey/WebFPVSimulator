/*
 * preview.js: what a link to one track or one map says when it is posted.
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

/* The share card's size, which the board holds every card to. */
const CARD_W = 1200;
const CARD_H = 630;

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
    if (params.get('share')) {
      kind = 'track';
      id = params.get('share');
    } else if (params.get('mapshare')) {
      kind = 'map';
      id = params.get('mapshare');
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
  const route = subject.kind === 'map' ? 'maps' : 'tracks';
  try {
    const res = await fetch(`${boardUpstream}/api/${route}/${subject.id}`, {
      headers: { accept: 'application/json' },
      signal,
    });
    if (!res.ok) {
      return null;
    }
    const item = await res.json();
    return item && typeof item === 'object' && item.id === subject.id ? item : null;
  } catch (e) {
    return null;
  }
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
  const map = subject.kind === 'map';
  const name = clean(item.name) || (map ? 'Untitled map' : 'Untitled track');
  const by = clean(item.designer) || clean(item.author);
  const what = map ? 'freestyle map' : 'track';
  const title = by ? `${name}, a WebFPV ${what} by ${by}` : `${name}, a WebFPV ${what}`;

  let lead;
  if (map) {
    const pieces = Number(item.pieces) || 0;
    const gaps = Number(item.gaps) || 0;
    lead = gaps
      ? `A freestyle map of ${plural(pieces, 'piece', 'pieces')} with ${plural(gaps, 'named gap', 'named gaps')}.`
      : `A freestyle map of ${plural(pieces, 'piece', 'pieces')}.`;
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
  const image = item.hasCard && item.cardUtc
    ? `${site}/board/api/${route}/${subject.id}/card?v=${encodeURIComponent(item.cardUtc)}`
    : null;
  const imageAlt = `${name}, as it looks in the WebFPV simulator, with the WebFPV wordmark over it.`;
  return {
    url: pageUrl, title, description, image, imageAlt,
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
    want.set('og:image:width', ['property', String(CARD_W)]);
    want.set('og:image:height', ['property', String(CARD_H)]);
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
