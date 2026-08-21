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

let asked = null;
let reply = () => new Response('ok', { status: 200 });

globalThis.fetch = async (req) => {
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

console.log(failures ? `\n${failures} failed` : '\nedge router: all checks passed');
process.exit(failures ? 1 : 0);
