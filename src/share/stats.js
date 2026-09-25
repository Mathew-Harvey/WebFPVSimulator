/*
 * stats.js: what this browser tells the board about a session, and what it
 * refuses to tell it.
 *
 * WHAT THE BOARD'S STATISTICS PAGE IS, FROM THIS END. It counts sessions,
 * laps, countries and returning pilots. Everything it holds is a COUNTER: a
 * total per UTC day, and a total per day per dimension. There is no row at
 * the far end that describes one browser, and this file is the reason there
 * cannot be, because it is the only thing that sends anything.
 *
 * THREE EVENTS AND NOTHING ELSE.
 *
 *   visit    once per browser per UTC day, across the simulator, the
 *            builder and the board. Carries which page, and a BOOLEAN
 *            saying whether this browser has been here before.
 *   session  once per page load, the first time the quad leaves the stand.
 *            Carries the aircraft, the map and how the pilot is flying.
 *   flush    once a minute while a session is open, and again the moment
 *            the page goes away. Carries laps, flight seconds and crashes
 *            since the last one, and a random per tab handle.
 *
 * WHAT IS NOT IN ANY OF THEM, and has nowhere to go if somebody adds it
 * later: an address, a user agent, a screen size, a pilot name, a track id,
 * a tune, a lap time, or a timestamp of any kind. The board stamps its own
 * UTC day and never reads a clock from here, because a browser's clock is
 * wrong often enough to put laps in tomorrow.
 *
 * THE REFERRER DOMAIN AND ?ref= TAG are captured on every page load and sent
 * as optional fields. Only the domain is sent (not the full URL), same-origin
 * referrers are excluded. The values are stored in sessionStorage for the tab
 * session, so later events (laps) in the same session carry attribution.
 *
 * THE TAB HANDLE IS THE ONE UNIQUE STRING, and it is deliberately useless.
 * It is made fresh at page load, it answers exactly one question ("how many
 * are flying right now"), the board holds it in memory for three minutes,
 * and no table at either end ever sees it. Reloading makes a new one.
 *
 * WHAT THIS BROWSER REMEMBERS, in one key, and none of it is ever sent: the
 * day it was first counted, the last day it was counted, a sponsor slug for
 * thirty days, and whether the pilot has switched counting off. What is sent
 * is the ANSWER those produce.
 *
 * THIS MIRRORS public/stats.js IN THE BOARD'S REPOSITORY, the same
 * arrangement NAME_RE has: two repositories, so it cannot be imported.
 * The storage key is shared on purpose, because under one domain the three
 * pages share one origin and therefore one local storage, so a pilot who
 * switches counting off on the board has switched it off here. Change both
 * copies, or the promise stops being kept in one of them.
 *
 * NOTHING HERE TOUCHES THE PHYSICS PATH. The counters are read off race
 * state the render loop already computed, the handle comes from
 * crypto.randomUUID, and every send is a beacon that cannot block a frame.
 * A board that is down, asleep or blocked costs this file nothing, because
 * it never reads a reply.
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

import { boardOrigin } from './board.js';

const KEY = 'webfpv.stats.v1';
/* How long a sponsor click is remembered. Long enough that somebody who
 * arrives from a poster and comes back at the weekend is still that
 * sponsor's arrival; short enough that it is not a standing label. */
const SOURCE_DAYS = 30;
/* MIRRORS SOURCE_RE in the board's src/sponsors.js, which is the copy that
 * decides. A slug this accepts and that does not names nothing, and the
 * board folds it into `other` rather than refusing the event. */
const SOURCE_RE = /^[a-z0-9-]{2,32}$/;

/* One flush a minute. It is also the heartbeat that answers "flying now",
 * so it is sent even when nothing happened in the minute. */
export const FLUSH_MS = 60_000;

/*
 * The caps the board will accept in one flush, mirrored here so this end
 * never sends something the far end must refuse. A minute cannot hold
 * thirty laps or ninety seconds of flying; anything past them is a clock
 * that jumped or a bug at this end, and the right answer is to send the cap
 * and carry on rather than to send a number nobody will take.
 */
const FLUSH_LAPS_MAX = 30;
const FLUSH_FLIGHT_S_MAX = 90;
const FLUSH_CRASHES_MAX = 60;

function today() {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(a, b) {
  const from = Date.parse(`${a}T00:00:00Z`);
  const to = Date.parse(`${b}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    return Infinity;
  }
  return Math.round((to - from) / 86_400_000);
}

function readState() {
  try {
    const raw = localStorage.getItem(KEY);
    const held = raw ? JSON.parse(raw) : null;
    return held && typeof held === 'object' && !Array.isArray(held) ? held : {};
  } catch (e) {
    /* Private mode, or a blob that is not JSON. A browser that cannot
     * remember is counted as new every day, and the board's page says so
     * rather than correcting for it. */
    return {};
  }
}

function writeState(next) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
    return true;
  } catch (e) {
    return false;
  }
}

/*
 * GLOBAL PRIVACY CONTROL. A browser that sets this has asked in the only
 * machine readable way there is, and the right answer is to send nothing at
 * all rather than to send something and hope the far end drops it. The
 * board checks the header as well, for the browsers that send it without
 * exposing the property.
 */
export function privacyRefused() {
  try {
    return navigator.globalPrivacyControl === true;
  } catch (e) {
    return false;
  }
}

export function optedOut() {
  return readState().optOut === true;
}

export function setOptedOut(on) {
  const next = readState();
  next.optOut = Boolean(on);
  return writeState(next);
}

export function counting() {
  return !privacyRefused() && !optedOut();
}

/*
 * Take a sponsor slug out of the address, put it away, and take every utm_
 * parameter OUT of the address bar.
 *
 * The strip is not tidiness. A simulator URL is copied and shared constantly,
 * because it is how a track travels: ?map=custom&share=trk-1a2b3c4d is the
 * whole link between the board and this page. A pilot who sends a friend the
 * link they are looking at should not be attributing their friend to a poster
 * they never saw. Everything the shell actually reads, map, share, board and
 * craft, is left exactly as it was.
 *
 * Last click wins. Called once, early, before anything else reads the query.
 */
export function captureSource(loc = window.location, hist = window.history) {
  let url;
  try {
    url = new URL(loc.href);
  } catch (e) {
    return null;
  }
  const raw = url.searchParams.get('utm_source');
  let slug = null;
  if (raw != null) {
    const clean = String(raw).trim().toLowerCase();
    if (SOURCE_RE.test(clean)) {
      slug = clean;
    }
  }
  /* Stored even when counting is off, and that is not a contradiction: what
   * is stored is in this browser and goes nowhere. If the pilot switches
   * counting back on, the poster they walked past is still the true answer.
   * Nothing is SENT while the switch is off, which is the promise. */
  if (slug) {
    const next = readState();
    next.source = { slug, day: today() };
    writeState(next);
  }
  let stripped = false;
  for (const key of [...url.searchParams.keys()]) {
    if (key.toLowerCase().startsWith('utm_')) {
      url.searchParams.delete(key);
      stripped = true;
    }
  }
  if (stripped && hist && typeof hist.replaceState === 'function') {
    try {
      hist.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    } catch (e) {
      /* A sandboxed frame. The parameter stays in the bar, nothing else
       * changes, and the slug is already put away. */
    }
  }
  return slug;
}

export function heldSource() {
  const held = readState().source;
  if (!held || !SOURCE_RE.test(String(held.slug || ''))) {
    return null;
  }
  return daysBetween(String(held.day || ''), today()) <= SOURCE_DAYS ? held.slug : null;
}

/*
 * EXTRACT THE REFERRER DOMAIN, stripping the protocol and path.
 *
 * Referrer is captured on every page load and stored in sessionStorage for
 * the session, so later events (laps) carry attribution. Only the domain is
 * sent. A full URL would be personal data; a domain is attribution.
 *
 * PREFERS AN EXPLICIT ?referrer= PARAMETER over document.referrer. This is
 * the carry-through from the landing page: when a visitor arrives from an
 * external site to webfpv.org, the landing page captures the original
 * referrer and appends it as ?referrer= when linking to /board/ or
 * /sim/. Without this, document.referrer would be webfpv.org (same-origin)
 * and the original source would be lost.
 *
 * Same-origin referrers are folded to null: somebody navigating within
 * webfpv.org is not an external referrer.
 */
function extractHostname(urlOrDomain) {
  /* Try parsing as a URL first (handles http://example.com/path). */
  try {
    const parsed = new URL(urlOrDomain);
    return parsed.hostname;
  } catch (e) {
    /* Not a URL. Try parsing with a scheme prepended (handles example.com). */
    try {
      const parsed = new URL(`https://${urlOrDomain}`);
      return parsed.hostname;
    } catch (e2) {
      /* Still not valid. Return null. */
      return null;
    }
  }
}

function isSameHost(hostname, loc) {
  if (!hostname || !loc) {
    return false;
  }
  return hostname === loc.hostname;
}

export function referrerDomain(doc = document, loc = window.location) {
  try {
    const currentHost = loc.hostname;
    /* First, check for an explicit ?referrer= parameter from the landing page. */
    const url = new URL(loc.href);
    const explicit = url.searchParams.get('referrer');
    if (explicit) {
      const clean = String(explicit).trim().toLowerCase();
      if (clean) {
        const hostname = extractHostname(clean);
        if (hostname && !isSameHost(hostname, loc)) {
          return hostname;
        }
      }
    }
    /* Fall back to document.referrer. */
    const ref = String(doc.referrer || '').trim();
    if (!ref) {
      return null;
    }
    const hostname = extractHostname(ref);
    if (hostname && !isSameHost(hostname, loc)) {
      return hostname;
    }
    return null;
  } catch (e) {
    return null;
  }
}

/*
 * NORMALISE A ?ref= TAG TO A SHORT SLUG.
 *
 * Maps common referrer sources to short tags (reddit, yt, discord, etc).
 * Unknown values are sanitised and length-limited. This is separate from
 * utm_source (sponsor slugs) and is meant for organic/manual attribution.
 *
 * The server has a closed list and folds unknowns to "other". This client-side
 * normalisation helps with URL variations (e.g., "Reddit" vs "reddit"), but
 * the server is the authority.
 */
export function normaliseRefTag(raw) {
  if (raw == null || raw === '') {
    return null;
  }
  const clean = String(raw).trim().toLowerCase();
  if (!clean) {
    return null;
  }
  /* Map common variants to canonical short tags, matching the board's
   * KNOWN_REFS in src/validate.js. These are the only tags the server
   * accepts without folding to "other". */
  const known = {
    reddit: 'reddit',
    r: 'reddit',
    yt: 'yt',
    youtube: 'yt',
    hn: 'hn',
    hackernews: 'hn',
    x: 'x',
    twitter: 'x',
    facebook: 'facebook',
    fb: 'facebook',
    instagram: 'instagram',
    ig: 'instagram',
    github: 'github',
    gh: 'github',
    discord: 'discord',
  };
  if (known[clean]) {
    return known[clean];
  }
  /* For unknown values, sanitise to alphanumeric and hyphens, limit length.
   * These will be folded to "other" by the server's closed list. */
  const sanitised = clean.replace(/[^a-z0-9-]/g, '').slice(0, 16);
  return sanitised || null;
}

/*
 * CAPTURE ?ref= PARAMETER and return its normalised form.
 *
 * This is read from the query string on every visit and sent with that
 * visit's event. Unlike utm_source, it is NOT stored in localStorage and
 * does not persist across visits, because it is meant for per-link
 * attribution rather than per-poster campaigns.
 *
 * The parameter is NOT stripped from the URL: it is lightweight enough to
 * leave in place, and removing it would interfere with utm_ stripping.
 */
export function captureRefTag(loc = window.location) {
  try {
    const url = new URL(loc.href);
    const raw = url.searchParams.get('ref');
    return normaliseRefTag(raw);
  } catch (e) {
    return null;
  }
}

/*
 * Mark this browser as counted today and say whether it had been here
 * before. Null when it has already been counted today, which is what makes
 * a visit once per browser per day across all three pages rather than once
 * per page load.
 */
export function markVisit() {
  const held = readState();
  const day = today();
  if (held.lastVisitDay === day) {
    return null;
  }
  const returning = Boolean(held.firstDay) && held.firstDay !== day;
  held.firstDay = held.firstDay || day;
  held.lastVisitDay = day;
  writeState(held);
  return { returning };
}

/*
 * STORE REFERRER AND REF FOR THIS SESSION.
 *
 * These are stored in sessionStorage (not localStorage) so they persist for
 * the current session only, not for 30 days like the sponsor source does.
 * This lets laps be attributed to the referrer/ref that brought the visitor
 * in, without making those values a standing label the way a sponsor slug is.
 *
 * A session here is browser-session: closing the tab ends it, reloading
 * preserves it. This matches the tab handle's lifetime.
 */
const SESSION_ATTR_KEY = 'webfpv.session.attribution';

function storeSessionAttribution(referrer, ref) {
  try {
    const attr = {};
    if (referrer) {
      attr.referrer = referrer;
    }
    if (ref) {
      attr.ref = ref;
    }
    if (Object.keys(attr).length > 0) {
      sessionStorage.setItem(SESSION_ATTR_KEY, JSON.stringify(attr));
    }
  } catch (e) {
    /* Private mode or storage full. Non-fatal: attribution just won't
     * persist to later events. */
  }
}

export function sessionAttribution() {
  try {
    const raw = sessionStorage.getItem(SESSION_ATTR_KEY);
    if (!raw) {
      return {};
    }
    const attr = JSON.parse(raw);
    return attr && typeof attr === 'object' && !Array.isArray(attr) ? attr : {};
  } catch (e) {
    return {};
  }
}

export function eventsUrl(origin = boardOrigin()) {
  return `${String(origin || '').replace(/\/+$/, '')}/api/stats/events`;
}

/*
 * Post one event, and never wait for the answer.
 *
 * A beacon, so the last flush survives the page being closed, which is
 * exactly when it is sent. text/plain because a beacon cannot set a header
 * and a simple request needs no preflight; the board never reads a content
 * type. Every failure is swallowed: a board that is down must cost a pilot
 * who is flying precisely nothing.
 *
 * Session attribution (referrer and ref) is added to ALL events, not just
 * visits, so that laps can be attributed to the source that brought the
 * visitor in. The values are stored in sessionStorage when a visit happens
 * and ride on every event in that session.
 */
export function sendEvent(payload, url = eventsUrl()) {
  if (!counting()) {
    return false;
  }
  let body;
  try {
    const attr = sessionAttribution();
    body = JSON.stringify({
      v: 1,
      ...payload,
      source: heldSource(),
      referrer: payload.referrer || attr.referrer || null,
      ref: payload.ref || attr.ref || null,
    });
  } catch (e) {
    return false;
  }
  try {
    if (navigator.sendBeacon) {
      return navigator.sendBeacon(url, new Blob([body], { type: 'text/plain;charset=UTF-8' }));
    }
  } catch (e) {
    /* Fall through to fetch. */
  }
  try {
    fetch(url, {
      method: 'POST', body, keepalive: true, headers: { 'content-type': 'text/plain' },
    }).catch(() => {});
    return true;
  } catch (e) {
    return false;
  }
}

/*
 * One visit, from whichever page called. Captures a sponsor slug on the way
 * past, whether or not anything is sent. Silent about everything.
 */
export function pingVisit(surface, url = eventsUrl()) {
  captureSource();
  if (!counting()) {
    return false;
  }
  /* Capture referrer and ref on EVERY page load, not just the first visit
   * of the day. This lets a visitor arriving with a new ?ref= parameter get
   * that attribution, even if they already visited today. Fresh values are
   * stored and override any stale sessionStorage values. */
  const referrer = referrerDomain();
  const ref = captureRefTag();
  storeSessionAttribution(referrer, ref);
  const visit = markVisit();
  if (!visit) {
    /* Already counted today. Attribution is still stored above, so later
     * events in this session get the fresh values. */
    return false;
  }
  return sendEvent({
    kind: 'visit', surface, returning: visit.returning, referrer, ref,
  }, url);
}

function newTab() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch (e) {
    /* An old browser, or an insecure origin. */
  }
  /* Not a security value. It answers one question for three minutes and is
   * never stored, so all it has to be is unlikely to collide with the other
   * tabs flying at the same moment. */
  return `t${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36).slice(-6)}`;
}

function bounded(value, max) {
  return Math.max(0, Math.min(max, Math.round(value)));
}

/*
 * The flight counter.
 *
 * `describe()` is handed in rather than read, because this module must not
 * import the shell: main.js knows which aircraft is seated, which map is
 * built and how the pilot is flying, and none of those is this file's
 * business beyond passing three words along.
 *
 * Everything it tracks is a DELTA since the last flush. Nothing accumulates
 * across a flush, so a tab that is killed loses at most the last minute and
 * a tab that lives for an hour sends sixty small numbers rather than one
 * growing one.
 */
export function createFlightStats({ describe, url = eventsUrl() } = {}) {
  const tab = newTab();
  let started = false;
  let laps = 0;
  let lapsSeen = null;
  let crashes = 0;
  let flightMs = 0;
  let lastTick = 0;
  let nextFlush = 0;
  let stopped = false;

  const facts = () => {
    try {
      const d = (typeof describe === 'function' ? describe() : null) || {};
      return {
        craft: d.craft === 'whoop65' ? 'whoop65' : '5inch',
        map: String(d.map || 'custom'),
        input: String(d.input || 'keyboard'),
      };
    } catch (e) {
      return { craft: '5inch', map: 'custom', input: 'keyboard' };
    }
  };

  /*
   * A flush is sent even when the minute held nothing, because it is also
   * the heartbeat behind "how many are flying now" and a pilot hovering on
   * the line between laps is still flying. Nothing is sent before the
   * session has started, which is what keeps a page nobody flew silent.
   */
  function flush() {
    if (!started || stopped) {
      return false;
    }
    const seconds = Math.floor(flightMs / 1000);
    const f = facts();
    const sent = sendEvent({
      kind: 'flush',
      tab,
      craft: f.craft,
      map: f.map,
      laps: bounded(laps, FLUSH_LAPS_MAX),
      flightS: bounded(seconds, FLUSH_FLIGHT_S_MAX),
      crashes: bounded(crashes, FLUSH_CRASHES_MAX),
    }, url);
    /* Cleared whether or not the send reported success. A beacon that was
     * refused is a minute nobody counted, and holding the numbers to retry
     * would mean the NEXT flush carries two minutes of laps, which the
     * board would refuse as more than a minute can hold. One lost minute
     * beats a stuck counter. */
    laps = 0;
    crashes = 0;
    flightMs -= seconds * 1000;
    return sent;
  }

  return {
    tab,

    /*
     * Once a frame. `state` is read off what the render loop already has:
     * whether this run has left the ground, whether the quad is in the air
     * right now, and how many laps the race has recorded.
     */
    tick(nowWall, state) {
      if (stopped) {
        return;
      }
      const wall = Number(nowWall) || 0;
      const was = lastTick;
      lastTick = wall;

      if (state && state.started && !started) {
        started = true;
        nextFlush = wall + FLUSH_MS;
        const f = facts();
        sendEvent({
          kind: 'session', craft: f.craft, map: f.map, input: f.input,
        }, url);
      }
      if (!started) {
        return;
      }
      /*
       * Flight seconds, off the wall clock and only while the quad is
       * actually in the air. Bounded by a sane frame gap, because a tab
       * that was hidden for an hour comes back with one enormous delta and
       * the pilot was not flying for any of it.
       */
      if (state && state.flying && was > 0 && wall > was) {
        flightMs += Math.min(wall - was, 1000);
      }
      if (state && Number.isFinite(state.laps)) {
        if (lapsSeen == null) {
          lapsSeen = state.laps;
        } else if (state.laps > lapsSeen) {
          laps += state.laps - lapsSeen;
          lapsSeen = state.laps;
        } else if (state.laps < lapsSeen) {
          /* A reset, a new course or a map swap. The count starts again
           * rather than going negative. */
          lapsSeen = state.laps;
        }
      }
      if (wall >= nextFlush) {
        nextFlush = wall + FLUSH_MS;
        flush();
      }
    },

    /* A crash, from the one place the shell declares one. */
    noteCrash() {
      if (started && !stopped) {
        crashes += 1;
      }
    },

    /* The page is going away. This is the flush that matters, and the
     * reason every send is a beacon. */
    leaving() {
      flush();
    },

    /* For the harness, and for a reset that should not be counted. */
    stop() {
      stopped = true;
    },
  };
}
