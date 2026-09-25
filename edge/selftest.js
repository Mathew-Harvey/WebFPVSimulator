/*
 * selftest.js: what the edge router does to a URL, checked without an edge.
 *
 * The router is fifty lines of string handling standing between every visitor
 * and every one of the three deploys, and the way it fails is not a crash: it
 * is a request that lands on the wrong upstream and answers 404, or a missing
 * trailing slash that sends the simulator's own module graph into the landing
 * page's namespace. Neither shows up in a syntax check and both look like the
 * app is broken rather than the mount.
 *
 * So: stub fetch, drive the handler, and assert on the URL it asked for. No
 * network, no wrangler, no account. Run it with `npm run test:edge`.
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

import router from './router.js';
import { PREVIEW_WAIT_MS } from './preview.js';

let asked = null;
let reply = () => new Response('ok', { status: 200 });

/*
 * Two kinds of request leave the router. The page is always a Request
 * object and lands in `asked`, as it always has. A link preview's question
 * to the board is a URL string and lands in `listed`, answered by
 * `listingReply`, so every check above the previews reads exactly as it did
 * before there were any.
 */
let listed = [];
let listingReply = () => new Response('{}', { status: 404 });

globalThis.fetch = async (req, init) => {
  if (typeof req === 'string') {
    listed.push({ url: req, init });
    return listingReply(req, init);
  }
  asked = { url: req.url, method: req.method, headers: req.headers };
  return reply();
};

let failures = 0;
function check(what, got, want) {
  if (got !== want) {
    failures += 1;
    console.error(`FAIL ${what}\n  got  ${got}\n  want ${want}`);
    return;
  }
  console.log(`ok   ${what}`);
}

async function hit(path, init) {
  asked = null;
  const res = await router.fetch(new Request(`https://webfpv.org${path}`, init));
  return res;
}

/* The three mounts reach the three upstreams, with the prefix taken off. */
await hit('/');
check('/ goes to the landing page',
  asked.url, 'https://mathew-harvey.github.io/landingpage-WebFPVSimulator-/');

await hit('/assets/also-by/apphub.png');
check('a landing asset keeps its path',
  asked.url, 'https://mathew-harvey.github.io/landingpage-WebFPVSimulator-/assets/also-by/apphub.png');

await hit('/sim/');
check('/sim/ reaches the simulator root',
  asked.url, 'https://webfpvsimulator.onrender.com/');

await hit('/sim/dist/sim.wasm');
check('the wasm loses the prefix',
  asked.url, 'https://webfpvsimulator.onrender.com/dist/sim.wasm');

await hit('/sim/tests/lib/simmod.js');
check('the module loader loses the prefix',
  asked.url, 'https://webfpvsimulator.onrender.com/tests/lib/simmod.js');

await hit('/sim/src/share/orbit.html?map=custom&share=abc');
check('the orbit thumbnail keeps its query',
  asked.url, 'https://webfpvsimulator.onrender.com/src/share/orbit.html?map=custom&share=abc');

await hit('/sim/assets/music/tarmac-pulse.webm?v=3');
check('a music url keeps its cache buster',
  asked.url, 'https://webfpvsimulator.onrender.com/assets/music/tarmac-pulse.webm?v=3');

await hit('/board/api/tracks');
check('the board api loses the prefix',
  asked.url, 'https://webfpv-board.onrender.com/api/tracks');

await hit('/board/bugs');
check('the bug inbox loses the prefix',
  asked.url, 'https://webfpv-board.onrender.com/bugs');

/* The trailing slash redirect, which every relative url depends on. */
const simBare = await hit('/sim');
check('/sim redirects', String(simBare.status), '301');
check('/sim redirects to /sim/', simBare.headers.get('location'), 'https://webfpv.org/sim/');
check('/sim does not reach an upstream', String(asked), 'null');

const boardBare = await hit('/board?x=1');
check('/board keeps its query across the redirect',
  boardBare.headers.get('location'), 'https://webfpv.org/board/?x=1');

/* www is one site, not two. */
asked = null;
const www = await router.fetch(new Request('https://www.webfpv.org/sim/?map=field'));
check('www redirects', String(www.status), '301');
check('www becomes the apex, path and query intact',
  www.headers.get('location'), 'https://webfpv.org/sim/?map=field');
check('www does not reach an upstream', String(asked), 'null');

/* A name that merely starts with a mount is not that mount. */
await hit('/simulator-notes');
check('/simulator-notes is not the simulator',
  asked.url, 'https://mathew-harvey.github.io/landingpage-WebFPVSimulator-/simulator-notes');

/* Host is the upstream's, because Render and Pages both route by it. */
await hit('/board/api/health');
check('host is not forwarded', asked.headers.get('host'), null);
check('the real host is forwarded aside', asked.headers.get('x-forwarded-host'), 'webfpv.org');
check('the scheme is forwarded aside', asked.headers.get('x-forwarded-proto'), 'https');

/*
 * The country, which is the only thing about a visitor's address that ever
 * reaches the board. request.cf is absent outside the Workers runtime, so
 * this file sees the fallback, and 'XX' is what Cloudflare itself sends for
 * an address it cannot place: the board reads both as unknown.
 */
check('the country is put on the request', asked.headers.get('x-webfpv-country'), 'XX');

/*
 * AND IT IS OVERWRITTEN RATHER THAN PASSED THROUGH. A header a visitor can
 * set is a header a visitor can lie in, and this is the line that makes it
 * worth believing at the other end.
 */
await hit('/board/api/stats/events', { headers: { 'x-webfpv-country': 'AQ' } });
check("a client's own country header does not survive",
  asked.headers.get('x-webfpv-country'), 'XX');

/* A method and a body survive, because publishing a course is a POST. */
await hit('/board/api/tracks', { method: 'POST', body: '{"author":"a"}' });
check('a POST stays a POST', asked.method, 'POST');

/* A redirect from an upstream comes back inside our own namespace. */
reply = () => new Response(null, {
  status: 302,
  headers: { location: 'https://webfpv-board.onrender.com/bugs?open=1' },
});
const bounced = await hit('/board/tickets');
check('an absolute upstream Location is remounted',
  bounced.headers.get('location'), 'https://webfpv.org/board/bugs?open=1');

reply = () => new Response(null, { status: 302, headers: { location: '/bugs' } });
const relative = await hit('/board/tickets');
check('a relative upstream Location is remounted',
  relative.headers.get('location'), 'https://webfpv.org/board/bugs');

reply = () => new Response(null, {
  status: 301,
  headers: { location: 'https://mathew-harvey.github.io/landingpage-WebFPVSimulator-/about/' },
});
const landing = await hit('/about');
check('the landing subdirectory is not leaked into our address space',
  landing.headers.get('location'), 'https://webfpv.org/about/');

reply = () => new Response(null, {
  status: 302,
  headers: { location: 'https://github.com/Mathew-Harvey/WebFPVSimulator' },
});
const away = await hit('/sim/elsewhere');
check('a Location pointing off the estate is left alone',
  away.headers.get('location'), 'https://github.com/Mathew-Harvey/WebFPVSimulator');

/* ------------------------------------------------------------------ */
/* Link previews                                                       */
/* ------------------------------------------------------------------ */

/*
 * A head shaped like the simulator's own: its canonical link, its og and
 * twitter tags in the order and spacing index.html writes them, a comment,
 * and a body that must come back untouched.
 */
const PAGE = [
  '<!doctype html>',
  '<html lang="en">',
  '  <head>',
  '    <title>WebFPV, a browser FPV racing simulator</title>',
  '    <!-- og.png is a frame of the real shell. -->',
  '    <link rel="canonical" href="https://webfpv.org/sim/" />',
  '    <meta property="og:type" content="website" />',
  '    <meta property="og:site_name" content="WebFPV" />',
  '    <meta property="og:url" content="https://webfpv.org/sim/" />',
  '    <meta property="og:title" content="WebFPV, fly a quad in your browser" />',
  '    <meta property="og:description" content="A real Betaflight control loop." />',
  '    <meta property="og:image" content="https://webfpv.org/sim/og.png" />',
  '    <meta property="og:image:type" content="image/png" />',
  '    <meta property="og:image:width" content="1200" />',
  '    <meta property="og:image:height" content="630" />',
  '    <meta property="og:image:alt" content="The race field." />',
  '    <meta name="twitter:card" content="summary_large_image" />',
  '    <meta name="twitter:title" content="WebFPV, fly a quad in your browser" />',
  '    <meta name="twitter:description" content="A real Betaflight control loop." />',
  '    <meta name="twitter:image" content="https://webfpv.org/sim/og.png" />',
  '    <meta name="twitter:image:alt" content="The race field." />',
  '  </head>',
  '  <body><p>The shell, which a crawler never runs.</p></body>',
  '</html>',
].join('\n');
const BODY = '<body><p>The shell, which a crawler never runs.</p></body>';

const pageReply = () => new Response(PAGE, {
  status: 200,
  headers: { 'content-type': 'text/html; charset=utf-8', 'content-length': String(PAGE.length), etag: '"page"' },
});

/* The board's own listings, as GET /api/tracks/:id and /api/maps/:id answer. */
const TRACK = {
  id: 'trk-1a2b3c4d',
  name: 'Ladder Loop',
  author: 'Ada Rook',
  designer: '',
  times: [{ name: 'Bo Kite', lapMs: 23456 }, { name: 'Ada Rook', lapMs: 25010 }],
  best: { name: 'Bo Kite', lapMs: 23456 },
  hasCard: true,
  cardUtc: '2026-09-25T10:00:00.000Z',
};
const MAP = {
  id: 'trk-5eed0010',
  name: 'Hibari Yard',
  author: 'Mat',
  pieces: 51,
  gaps: 5,
  hasCard: true,
  cardUtc: '2026-09-25T11:00:00.000Z',
};
const json = (body) => () => new Response(JSON.stringify(body), {
  status: 200, headers: { 'content-type': 'application/json' },
});

/* The meta tag with this property or name, read back out of the head. */
function meta(html, key) {
  const found = html.match(new RegExp(`<meta (?:property|name)="${key.replace(/[.:]/g, '\\$&')}" content="([^"]*)"`));
  return found ? found[1] : null;
}

const FACEBOOK = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';
const PERSON = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';

async function preview(path, ua = FACEBOOK, init = {}) {
  asked = null;
  listed = [];
  const res = await router.fetch(new Request(`https://webfpv.org${path}`, {
    ...init, headers: { 'user-agent': ua, ...(init.headers || {}) },
  }));
  return { res, html: await res.text() };
}

reply = pageReply;
listingReply = json(TRACK);

/* A person is never slowed by any of this. */
const person = await preview('/sim/?map=custom&share=trk-1a2b3c4d', PERSON);
check('a person on a track link does not wait on the board', String(listed.length), '0');
check('and gets the page exactly as it came', person.html, PAGE);

/* A crawler on the same link gets the track. */
const fb = await preview('/sim/?map=custom&share=trk-1a2b3c4d&board=https%3A%2F%2Fwebfpv.org%2Fboard');
check('a crawler on a track link asks the board about that track',
  listed.map((l) => l.url).join(), 'https://webfpv-board.onrender.com/api/tracks/trk-1a2b3c4d');
check('the page itself is still fetched from the simulator',
  asked.url, 'https://webfpvsimulator.onrender.com/?map=custom&share=trk-1a2b3c4d&board=https%3A%2F%2Fwebfpv.org%2Fboard');
check('the title names the track and who made it',
  meta(fb.html, 'og:title'), 'Ladder Loop, a WebFPV track by Ada Rook');
check('and so does the twitter title', meta(fb.html, 'twitter:title'), 'Ladder Loop, a WebFPV track by Ada Rook');
check('the description gives the record',
  meta(fb.html, 'og:description'),
  'Track record 23.46 s by Bo Kite, 2 times posted. Fly it in your browser on a real Betaflight control loop. No install, no account.');
check('the picture is the track\'s share card, at an address that changes when the card does',
  meta(fb.html, 'og:image'), 'https://webfpv.org/board/api/tracks/trk-1a2b3c4d/card?v=2026-09-25T10%3A00%3A00.000Z');
check('and twitter is shown the same picture', meta(fb.html, 'twitter:image'), meta(fb.html, 'og:image'));
check('the picture is said to be a JPEG', meta(fb.html, 'og:image:type'), 'image/jpeg');
check('of the size the board holds every card to',
  `${meta(fb.html, 'og:image:width')}x${meta(fb.html, 'og:image:height')}`, '1200x630');
/* Facebook follows og:url and draws what it finds there, so leaving the
 * site's front door in it would undo every line above. */
check('og:url is the address that was asked for, not the front door',
  meta(fb.html, 'og:url'), 'https://webfpv.org/sim/?map=custom&amp;share=trk-1a2b3c4d&amp;board=https%3A%2F%2Fwebfpv.org%2Fboard');
check('and so is the canonical link',
  (fb.html.match(/<link rel="canonical" href="([^"]*)"/) || [])[1],
  'https://webfpv.org/sim/?map=custom&amp;share=trk-1a2b3c4d&amp;board=https%3A%2F%2Fwebfpv.org%2Fboard');
check('the tags nobody asked to change are left alone',
  `${meta(fb.html, 'og:site_name')} ${meta(fb.html, 'twitter:card')} ${meta(fb.html, 'og:type')}`,
  'WebFPV summary_large_image website');
check('no tag is written twice', String((fb.html.match(/property="og:image"/g) || []).length), '1');
check('the body is untouched', fb.html.includes(BODY) && fb.html.endsWith('</html>') ? 'yes' : 'no', 'yes');
check('the length the simulator sent is not kept for a different body', fb.res.headers.get('content-length'), null);
check('nor its etag', fb.res.headers.get('etag'), null);
check('and the rewritten page is not cached', fb.res.headers.get('cache-control'), 'no-store');
check('because it varies on who asked', /user-agent/i.test(fb.res.headers.get('vary') || '') ? 'yes' : 'no', 'yes');

/* Every preview fetcher that matters, by the name it sends. */
for (const [who, ua] of [
  ['X', 'Twitterbot/1.0'],
  ['WhatsApp, and Signal as it', 'WhatsApp/2.23.20.0'],
  ['Discord', 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)'],
  ['Slack', 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)'],
  ['LinkedIn', 'LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)'],
  ['Telegram', 'TelegramBot (like TwitterBot)'],
  ['iMessage', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_1) AppleWebKit/601.2.4 (KHTML, like Gecko) Version/9.0.1 Safari/601.2.4 facebookexternalhit/1.1 Facebot Twitterbot/1.0'],
]) {
  const seen = await preview('/sim/?map=custom&share=trk-1a2b3c4d', ua);
  check(`${who} is shown the track`, meta(seen.html, 'og:title'), 'Ladder Loop, a WebFPV track by Ada Rook');
}
const google = await preview('/sim/?map=custom&share=trk-1a2b3c4d', 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)');
check('a search crawler indexes the page a person gets', google.html, PAGE);

/* The designer's credit comes first, as it does on the board's sheet. */
listingReply = json({ ...TRACK, designer: 'Skittles' });
const credited = await preview('/sim/?map=custom&share=trk-1a2b3c4d');
check('a credited designer is named rather than the publisher',
  meta(credited.html, 'og:title'), 'Ladder Loop, a WebFPV track by Skittles');

/* A track with no record yet, and no card yet. */
listingReply = json({
  ...TRACK, times: [], best: null, hasCard: false, cardUtc: null,
});
const bare = await preview('/sim/?map=custom&share=trk-1a2b3c4d');
check('a track with no time says the record is open',
  meta(bare.html, 'og:description'),
  'No time posted yet, so the record is open. Fly it in your browser on a real Betaflight control loop. No install, no account.');
check('a track with no card of its own keeps the site\'s card', meta(bare.html, 'og:image'), 'https://webfpv.org/sim/og.png');
check('and its type and size, which are the site card\'s',
  `${meta(bare.html, 'og:image:type')} ${meta(bare.html, 'og:image:width')}`, 'image/png 1200');
check('but still carries its own name', meta(bare.html, 'og:title'), 'Ladder Loop, a WebFPV track by Ada Rook');

/* A minute and more. */
listingReply = json({ ...TRACK, best: { name: 'Bo Kite', lapMs: 62350 } });
const long = await preview('/sim/?map=custom&share=trk-1a2b3c4d');
check('a lap over a minute reads as the board prints it',
  /Track record 1:02\.35 by Bo Kite/.test(meta(long.html, 'og:description')) ? 'yes' : meta(long.html, 'og:description'), 'yes');

/* A name is somebody's words, and it goes into an attribute. */
listingReply = json({ ...TRACK, name: 'The "Big" <Loop> & co' });
const odd = await preview('/sim/?map=custom&share=trk-1a2b3c4d');
check('a name with quotes and angle brackets is escaped, not injected',
  meta(odd.html, 'og:title'), 'The &quot;Big&quot; &lt;Loop&gt; &amp; co, a WebFPV track by Ada Rook');

/* A map, from the board's Fly this map. */
listingReply = json(MAP);
const map = await preview('/sim/?map=built&mapshare=trk-5eed0010&board=https%3A%2F%2Fwebfpv.org%2Fboard&craft=5inch&fly=1');
check('a crawler on a map link asks the board about the map',
  listed.map((l) => l.url).join(), 'https://webfpv-board.onrender.com/api/maps/trk-5eed0010');
check('and the title calls it a map', meta(map.html, 'og:title'), 'Hibari Yard, a WebFPV freestyle map by Mat');
check('the description counts its pieces and its gaps',
  meta(map.html, 'og:description'),
  'A freestyle map of 51 pieces with 5 named gaps. Fly it in your browser on a real Betaflight control loop. No install, no account.');
check('and the picture is the map\'s card',
  meta(map.html, 'og:image'), 'https://webfpv.org/board/api/maps/trk-5eed0010/card?v=2026-09-25T11%3A00%3A00.000Z');

/* A track wins when a hand made link names both, the rule in boot.js. */
listingReply = json(TRACK);
await preview('/sim/?share=trk-1a2b3c4d&mapshare=trk-5eed0010');
check('a link naming a track and a map is the track',
  listed.map((l) => l.url).join(), 'https://webfpv-board.onrender.com/api/tracks/trk-1a2b3c4d');

/* The builder's Remix link is a page too. */
const remix = await preview('/sim/src/trackbuilder/index.html?share=trk-1a2b3c4d&board=https%3A%2F%2Fwebfpv.org%2Fboard');
check('the builder page on a track link is described as the track',
  meta(remix.html, 'og:title'), 'Ladder Loop, a WebFPV track by Ada Rook');

/* The board's own links, which Copy link now writes as a query. */
const boardTrack = await preview('/board/?track=trk-1a2b3c4d');
check('a board link to a track asks the board about it',
  listed.map((l) => l.url).join(), 'https://webfpv-board.onrender.com/api/tracks/trk-1a2b3c4d');
check('while the page comes from the board as always', asked.url, 'https://webfpv-board.onrender.com/?track=trk-1a2b3c4d');
check('and is described as the track', meta(boardTrack.html, 'og:title'), 'Ladder Loop, a WebFPV track by Ada Rook');
check('at its own address', meta(boardTrack.html, 'og:url'), 'https://webfpv.org/board/?track=trk-1a2b3c4d');
listingReply = json(MAP);
const boardMap = await preview('/board/?map=trk-5eed0010');
check('a board link to a map is described as the map',
  meta(boardMap.html, 'og:title'), 'Hibari Yard, a WebFPV freestyle map by Mat');
listingReply = json(TRACK);

/* A page with no preview tags of its own gains them, before </head>. */
const orbit = await preview('/sim/src/share/orbit.html?share=trk-1a2b3c4d');
check('the tags a page lacks are added rather than dropped', meta(orbit.html, 'og:title'), 'Ladder Loop, a WebFPV track by Ada Rook');

/* Nothing is asked of the board that is not a page naming one of its ids. */
const refusals = [
  ['a link for some other board', '/sim/?map=custom&share=trk-1a2b3c4d&board=http%3A%2F%2F127.0.0.1%3A3100'],
  ['an id that is not an id', '/sim/?map=custom&share=..%2F..%2Fapi%2Fbugs'],
  ['a link that names nothing', '/sim/?map=field'],
  ['a file rather than a page', '/sim/dist/sim.wasm?share=trk-1a2b3c4d'],
  ['the landing page', '/?share=trk-1a2b3c4d'],
  ['a board route that is not its page', '/board/api/tracks?track=trk-1a2b3c4d'],
];
for (const [what, path] of refusals) {
  const r = await preview(path);
  check(`${what} does not ask the board anything`, String(listed.length), '0');
  check(`${what} is sent as it came`, r.html, PAGE);
}
const head = await preview('/sim/?map=custom&share=trk-1a2b3c4d', FACEBOOK, { method: 'HEAD' });
check('a HEAD is not a preview', String(listed.length), '0');
check('and is passed through', String(head.res.status), '200');

/* A board that answers badly leaves the page as it was. */
for (const [what, answer] of [
  ['a track the board does not have', () => new Response('{"error":"That track is not on the board."}', { status: 404 })],
  ['a board that is down', () => Promise.reject(new TypeError('fetch failed'))],
  ['an answer that is not JSON', () => new Response('<html>Bad gateway</html>', { status: 200 })],
  ['an answer about some other track', json({ ...TRACK, id: 'trk-ffffffff' })],
]) {
  listingReply = answer;
  const r = await preview('/sim/?map=custom&share=trk-1a2b3c4d');
  check(`${what}: the page is sent untouched`, r.html, PAGE);
}

/* A page that is not a 200 page is not described. */
listingReply = json(TRACK);
reply = () => new Response('not found', { status: 404, headers: { 'content-type': 'text/html' } });
const missing = await preview('/sim/?map=custom&share=trk-1a2b3c4d');
check('an upstream 404 is passed through as a 404', `${missing.res.status} ${missing.html}`, '404 not found');
reply = pageReply;

/*
 * A SLEEPING BOARD, which is the case all of this is shaped around. The
 * board does not answer; the crawler is sent the untouched page once
 * PREVIEW_WAIT_MS has passed, and the question to the board is withdrawn.
 */
let withdrawn = false;
listingReply = (u, init) => new Promise((resolve, reject) => {
  init.signal.addEventListener('abort', () => {
    withdrawn = true;
    reject(new DOMException('aborted', 'AbortError'));
  });
});
const t0 = Date.now();
const asleep = await preview('/sim/?map=custom&share=trk-1a2b3c4d');
const waited = Date.now() - t0;
check('a sleeping board: the crawler gets the untouched page', asleep.html, PAGE);
check(`and gets it within the wait, not the board's minute (${waited} ms)`,
  waited >= PREVIEW_WAIT_MS - 50 && waited < PREVIEW_WAIT_MS + 1500 ? 'yes' : 'no', 'yes');
check('and the question to the board is withdrawn', withdrawn ? 'yes' : 'no', 'yes');

console.log(failures ? `\n${failures} failed` : '\nedge router: all checks passed');
process.exit(failures ? 1 : 0);
