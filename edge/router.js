/*
 * router.js: the Cloudflare Worker that makes three deploys look like one site.
 *
 * THE MAP, WRITTEN DOWN ONCE.
 *
 *   https://webfpv.org/          the landing page, from GitHub Pages
 *   https://webfpv.org/sim/      the simulator, from its Render static site
 *   https://webfpv.org/board/    the board, from its Render web service
 *
 * Every request to webfpv.org lands here. This file picks an upstream by the
 * first path segment, takes that segment off, and passes the rest through
 * untouched. The upstreams still serve from their own roots and do not know
 * they are mounted anywhere: /sim/dist/sim.wasm arrives at Render as
 * /dist/sim.wasm, and /board/api/tracks arrives at the board as /api/tracks.
 *
 * WHY A WORKER AND NOT A REDIRECT RULE. A redirect would put onrender.com in
 * the address bar, which is the thing the domain exists to stop. A Cloudflare
 * Origin Rule cannot do it either: stripping a prefix needs regex_replace in a
 * rewrite rule, which is not on the free plan, and both upstreams route by
 * Host, so an origin override alone would land on the wrong site.
 *
 * WHY THE TRAILING SLASH REDIRECT MATTERS MORE THAN IT LOOKS. The three apps
 * now resolve their own files relative to the page rather than from the site
 * root, so that they work at / on Render and at /sim/ here without knowing
 * which. A browser sitting at /sim resolves "src/boot.js" against the site
 * root and asks for /src/boot.js, which is the landing page's namespace, not
 * the simulator's. Sitting at /sim/ it asks for /sim/src/boot.js, which is
 * right. So /sim and /board are permanent redirects to /sim/ and /board/, and
 * that redirect is load bearing rather than tidiness.
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
 * The mounts, longest prefix first so that a future /boardgame could never be
 * swallowed by /board. Each upstream is an origin with no trailing slash.
 *
 * These are constants rather than environment variables on purpose. A Worker
 * is deployed from this file, so an upstream that moves is a commit here, and
 * that keeps the map in the repository that is the copy of record instead of
 * in a dashboard field nobody can diff.
 */
const MOUNTS = [
  { prefix: '/board', upstream: 'https://webfpv-board.onrender.com' },
  { prefix: '/sim', upstream: 'https://webfpvsimulator.onrender.com' },
];

/*
 * Everything that is not a mount is the landing page. GitHub Pages serves a
 * project site out of a subdirectory, so the base carries that path and the
 * request path is appended to it.
 *
 * The landing repository must NOT carry a CNAME file naming webfpv.org. Pages
 * answers a CNAME by redirecting github.io to the custom domain, which would
 * come straight back here and loop until Cloudflare gave up.
 */
const LANDING = 'https://mathew-harvey.github.io/landingpage-WebFPVSimulator-';

/* Every upstream host, for rewriting a Location header that names one. */
const UPSTREAM_ORIGINS = [LANDING, ...MOUNTS.map((m) => m.upstream)]
  .map((u) => new URL(u).origin);

const LANDING_ORIGIN = new URL(LANDING).origin;
const LANDING_BASE = new URL(LANDING).pathname.replace(/\/+$/, '');

function mountFor(pathname) {
  return MOUNTS.find((m) => pathname === m.prefix || pathname.startsWith(`${m.prefix}/`)) || null;
}

/*
 * An upstream that redirects names itself in Location, and a browser that
 * followed it would leave the domain. Put it back in our namespace.
 *
 * The base for a relative Location is the URL WE ASKED FOR, not the one the
 * visitor typed. An upstream writing `/bugs` means its own root, and resolving
 * that against https://webfpv.org/board/tickets produces https://webfpv.org/bugs,
 * which is the landing page. Resolving it against the upstream URL instead
 * gives the board's own /bugs, which then gets the prefix put back on like any
 * other. Anything pointing off the estate, such as a link out, is left alone.
 */
function rewriteLocation(value, upstreamUrl, siteOrigin, prefix) {
  let target;
  try {
    target = new URL(value, upstreamUrl);
  } catch (e) {
    return value;
  }
  if (!UPSTREAM_ORIGINS.includes(target.origin)) {
    return value;
  }
  if (target.origin === LANDING_ORIGIN) {
    /* The landing page's own subdirectory is not part of our address space. */
    const path = target.pathname.startsWith(LANDING_BASE)
      ? target.pathname.slice(LANDING_BASE.length) || '/'
      : target.pathname;
    return `${siteOrigin}${path}${target.search}${target.hash}`;
  }
  return `${siteOrigin}${prefix}${target.pathname}${target.search}${target.hash}`;
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    /*
     * One address, not two. www is attached to this Worker so that it resolves
     * at all, and its whole job on arrival is to become the apex: two hostnames
     * both serving the page is two sets of localStorage, two sets of search
     * results and a ?board= handed between them that does not match the origin
     * it came from.
     */
    if (url.hostname.startsWith('www.')) {
      url.hostname = url.hostname.slice(4);
      return Response.redirect(url.href, 301);
    }

    const mount = mountFor(url.pathname);

    /* Load bearing. See the note at the top of this file. */
    if (mount && url.pathname === mount.prefix) {
      return Response.redirect(`${url.origin}${mount.prefix}/${url.search}`, 301);
    }

    const prefix = mount ? mount.prefix : '';
    const target = mount
      ? `${mount.upstream}${url.pathname.slice(mount.prefix.length)}${url.search}`
      : `${LANDING}${url.pathname}${url.search}`;

    /*
     * Rebuilt rather than forwarded whole, so that fetch sets Host from the
     * target and the upstream sees its own name. Render and Pages both route
     * by Host, and a forwarded Host of webfpv.org is a 404 at either.
     *
     * redirect: 'manual' because a redirect has to be rewritten on the way
     * back rather than followed here, or the browser's address bar and the
     * page it is showing stop agreeing.
     */
    const headers = new Headers(request.headers);
    headers.delete('host');
    headers.set('x-forwarded-host', url.host);
    headers.set('x-forwarded-proto', 'https');

    const init = { method: request.method, headers, redirect: 'manual' };
    /*
     * A body is attached only when the method can carry one, and `duplex` goes
     * with it. Streaming a request body is half duplex and the fetch standard
     * makes saying so mandatory: Node's fetch throws without it, which is how
     * edge/selftest.js can drive this file at all. The Workers runtime does not
     * need to be told and does not mind being told.
     */
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      init.body = request.body;
      init.duplex = 'half';
    }

    const upstream = await fetch(new Request(target, init));

    const out = new Response(upstream.body, upstream);
    const location = out.headers.get('location');
    if (location) {
      out.headers.set('location', rewriteLocation(location, target, url.origin, prefix));
    }
    /*
     * None of the three sets a cookie: the board says so in its own CLAUDE.md
     * and the other two have no server side at all. If one ever does, its Path
     * attribute will be written for the upstream's root and will need the
     * prefix put back on here.
     */
    return out;
  },
};
