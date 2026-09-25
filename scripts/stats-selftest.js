/*
 * stats-selftest.js: the stats module, driven in Node against synthetic
 * environments, covering the priority rules, sanitisation, normalisation
 * and privacy controls that have no browser test otherwise.
 *
 * Usage:
 *   npm run stats:selftest
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

/* Shim the browser environment so the module can load in Node. */
const localStorage = (() => {
  const store = new Map();
  return {
    getItem: (k) => store.get(k) || null,
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k),
  };
})();

const sessionStorage = (() => {
  const store = new Map();
  return {
    getItem: (k) => store.get(k) || null,
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k),
  };
})();

const mockNavigator = {
  globalPrivacyControl: undefined,
  sendBeacon: () => true,
};

globalThis.localStorage = localStorage;
globalThis.sessionStorage = sessionStorage;
Object.defineProperty(globalThis, 'navigator', {
  value: mockNavigator,
  writable: true,
  configurable: true,
});
globalThis.Blob = class Blob {
  constructor(parts) {
    this.parts = parts;
  }
};

/* Import the module under test. */
const {
  referrerDomain,
  normaliseRefTag,
  captureRefTag,
  sessionAttribution,
  privacyRefused,
  counting,
  setOptedOut,
  pingVisit,
  sendEvent,
} = await import('../src/share/stats.js');

let passed = 0;
let failed = 0;

function check(name, condition, got) {
  if (condition) {
    passed += 1;
  } else {
    failed += 1;
    console.log(`FAIL: ${name}`);
    if (got !== undefined) {
      console.log(`  got: ${JSON.stringify(got)}`);
    }
  }
}

function mockDoc(referrer) {
  return { referrer };
}

function mockLoc(href) {
  const url = new URL(href);
  return { href, hostname: url.hostname };
}

console.log('\nstats-selftest: referrerDomain()\n');

/* Same-origin referrer returns null. */
check(
  'same-origin referrer returns null',
  referrerDomain(mockDoc('https://webfpv.org/'), mockLoc('https://webfpv.org/sim/')) === null,
);

/* External referrer returns domain only. */
check(
  'external referrer returns domain only',
  referrerDomain(mockDoc('https://news.ycombinator.com/item?id=123'), mockLoc('https://webfpv.org/sim/')) === 'news.ycombinator.com',
);

/* Empty referrer returns null. */
check(
  'empty referrer returns null',
  referrerDomain(mockDoc(''), mockLoc('https://webfpv.org/sim/')) === null,
);

/* ?referrer= parameter takes priority over document.referrer. */
check(
  '?referrer= parameter takes priority',
  referrerDomain(mockDoc('https://webfpv.org/'), mockLoc('https://webfpv.org/sim/?referrer=reddit.com')) === 'reddit.com',
);

/* ?referrer= with full URL is sanitised to domain only. */
check(
  '?referrer= full URL sanitised to domain',
  referrerDomain(mockDoc(''), mockLoc('https://webfpv.org/sim/?referrer=https://reddit.com/r/fpv')) === 'reddit.com',
);

/* ?referrer= with http:// protocol. */
check(
  '?referrer= with http:// protocol',
  referrerDomain(mockDoc(''), mockLoc('https://webfpv.org/sim/?referrer=http://example.com/path')) === 'example.com',
);

/* ?referrer= with bare domain. */
check(
  '?referrer= with bare domain',
  referrerDomain(mockDoc(''), mockLoc('https://webfpv.org/sim/?referrer=example.com')) === 'example.com',
);

/* ?referrer= with subdomain. */
check(
  '?referrer= with subdomain',
  referrerDomain(mockDoc(''), mockLoc('https://webfpv.org/sim/?referrer=news.ycombinator.com')) === 'news.ycombinator.com',
);

/* ?referrer= with single-label hostname (no TLD) - accepted by client, will be rejected by server. */
check(
  '?referrer=localhost accepted by client (server validates)',
  referrerDomain(mockDoc(''), mockLoc('https://webfpv.org/sim/?referrer=localhost')) === 'localhost',
);

/* ?referrer= with junk returns null. */
check(
  '?referrer= with junk returns null',
  referrerDomain(mockDoc(''), mockLoc('https://webfpv.org/sim/?referrer=<script>alert(1)</script>')) === null,
);

/* ?referrer= empty falls back to document.referrer. */
check(
  '?referrer= empty falls back to document.referrer',
  referrerDomain(mockDoc('https://reddit.com/'), mockLoc('https://webfpv.org/sim/?referrer=')) === 'reddit.com',
);

/* ?referrer= with same host returns null. */
check(
  '?referrer=webfpv.org returns null (same-host)',
  referrerDomain(mockDoc(''), mockLoc('https://webfpv.org/sim/?referrer=webfpv.org')) === null,
);

check(
  '?referrer=https://webfpv.org returns null (same-host)',
  referrerDomain(mockDoc(''), mockLoc('https://webfpv.org/sim/?referrer=https://webfpv.org')) === null,
);

/* Bare hostnames that start with 'http' should still work. */
check(
  'bare httpbin.org works',
  referrerDomain(mockDoc(''), mockLoc('https://webfpv.org/sim/?referrer=httpbin.org')) === 'httpbin.org',
);

check(
  'bare httpexample.com works',
  referrerDomain(mockDoc(''), mockLoc('https://webfpv.org/sim/?referrer=httpexample.com')) === 'httpexample.com',
);

/* www. stripping in same-host check. */
check(
  '?referrer=www.webfpv.org returns null (same-host with www)',
  referrerDomain(mockDoc(''), mockLoc('https://webfpv.org/sim/?referrer=www.webfpv.org')) === null,
);

check(
  '?referrer=webfpv.org returns null when loc has www',
  referrerDomain(mockDoc(''), mockLoc('https://www.webfpv.org/sim/?referrer=webfpv.org')) === null,
);

check(
  'document.referrer with www.webfpv.org returns null',
  referrerDomain(mockDoc('https://www.webfpv.org/'), mockLoc('https://webfpv.org/sim/')) === null,
);

console.log('\nstats-selftest: normaliseRefTag()\n');

/* Known aliases are normalised. */
check('reddit -> reddit', normaliseRefTag('reddit') === 'reddit');
check('r -> reddit', normaliseRefTag('r') === 'reddit');
check('youtube -> yt', normaliseRefTag('youtube') === 'yt');
check('yt -> yt', normaliseRefTag('yt') === 'yt');
check('hn -> hn', normaliseRefTag('hn') === 'hn');
check('hackernews -> hn', normaliseRefTag('hackernews') === 'hn');
check('twitter -> x', normaliseRefTag('twitter') === 'x');
check('x -> x', normaliseRefTag('x') === 'x');
check('facebook -> facebook', normaliseRefTag('facebook') === 'facebook');
check('fb -> facebook', normaliseRefTag('fb') === 'facebook');
check('instagram -> instagram', normaliseRefTag('instagram') === 'instagram');
check('ig -> instagram', normaliseRefTag('ig') === 'instagram');
check('github -> github', normaliseRefTag('github') === 'github');
check('gh -> github', normaliseRefTag('gh') === 'github');
check('discord -> discord', normaliseRefTag('discord') === 'discord');

/* Case insensitive. */
check('Reddit -> reddit', normaliseRefTag('Reddit') === 'reddit');
check('YOUTUBE -> yt', normaliseRefTag('YOUTUBE') === 'yt');

/* Unknown values are sanitised. */
check('unknown alphanumeric', normaliseRefTag('mysite') === 'mysite');
check('unknown with hyphens', normaliseRefTag('my-site') === 'my-site');

/* Non-alphanumeric characters stripped. */
check('spaces stripped', normaliseRefTag('my site') === 'mysite');
check('special chars stripped', normaliseRefTag('my@site!') === 'mysite');
check('email stripped', normaliseRefTag('bob@example.com') === 'bobexamplecom');

/* Length cap at 16 chars. */
check('length capped at 16', normaliseRefTag('this-is-a-very-long-ref-tag') === 'this-is-a-very-l');

/* Empty and null return null. */
check('empty string -> null', normaliseRefTag('') === null);
check('null -> null', normaliseRefTag(null) === null);
check('whitespace only -> null', normaliseRefTag('   ') === null);
check('only special chars -> null', normaliseRefTag('!!!') === null);

console.log('\nstats-selftest: captureRefTag()\n');

/* Reads ?ref= from query string. */
check(
  '?ref=hn',
  captureRefTag(mockLoc('https://webfpv.org/sim/?ref=hn')) === 'hn',
);

/* Normalises the value. */
check(
  '?ref=reddit normalised',
  captureRefTag(mockLoc('https://webfpv.org/sim/?ref=reddit')) === 'reddit',
);

/* No ref param returns null. */
check(
  'no ?ref= returns null',
  captureRefTag(mockLoc('https://webfpv.org/sim/')) === null,
);

console.log('\nstats-selftest: sessionAttribution()\n');

/* Clear session storage first. */
sessionStorage.removeItem('webfpv.session.attribution');

/* Empty session returns empty object. */
check(
  'empty session returns {}',
  Object.keys(sessionAttribution()).length === 0,
);

/* Store and retrieve referrer. */
sessionStorage.setItem('webfpv.session.attribution', JSON.stringify({ referrer: 'reddit.com' }));
check(
  'retrieve referrer',
  sessionAttribution().referrer === 'reddit.com',
);

/* Store and retrieve ref. */
sessionStorage.setItem('webfpv.session.attribution', JSON.stringify({ ref: 'hn' }));
check(
  'retrieve ref',
  sessionAttribution().ref === 'hn',
);

/* Store and retrieve both. */
sessionStorage.setItem('webfpv.session.attribution', JSON.stringify({ referrer: 'reddit.com', ref: 'hn' }));
const both = sessionAttribution();
check(
  'retrieve both referrer and ref',
  both.referrer === 'reddit.com' && both.ref === 'hn',
);

/* Clear session by calling storeSessionAttribution with null. */
sessionStorage.setItem('webfpv.session.attribution', JSON.stringify({ referrer: 'reddit.com', ref: 'hn' }));
/* Simulate the internal storeSessionAttribution behavior */
sessionStorage.setItem('webfpv.session.attribution', JSON.stringify({ referrer: null, ref: null }));
const cleared = sessionAttribution();
check(
  'null clears session (referrer)',
  cleared.referrer === null,
);
check(
  'null clears session (ref)',
  cleared.ref === null,
);

console.log('\nstats-selftest: privacy controls\n');

/* GPC off, not opted out -> counting. */
mockNavigator.globalPrivacyControl = false;
setOptedOut(false);
check('GPC off, not opted out -> counting', counting() === true);

/* GPC on -> not counting. */
mockNavigator.globalPrivacyControl = true;
check('GPC on -> not counting', counting() === false);
check('privacyRefused() with GPC on', privacyRefused() === true);

/* Opted out -> not counting. */
mockNavigator.globalPrivacyControl = false;
setOptedOut(true);
check('opted out -> not counting', counting() === false);

/* GPC on AND opted out -> not counting. */
mockNavigator.globalPrivacyControl = true;
setOptedOut(true);
check('GPC on AND opted out -> not counting', counting() === false);

/* Reset to counting state for next tests. */
mockNavigator.globalPrivacyControl = false;
setOptedOut(false);

console.log('\nstats-selftest: sendEvent/pingVisit send nothing under GPC and opt-out\n');

/* sendEvent returns false under GPC. */
mockNavigator.globalPrivacyControl = true;
const gpcSent = sendEvent({ kind: 'test', value: 100 });
check('sendEvent returns false under GPC', gpcSent === false);

/* sendEvent returns false under opt-out. */
mockNavigator.globalPrivacyControl = false;
setOptedOut(true);
const optOutSent = sendEvent({ kind: 'test', value: 101 });
check('sendEvent returns false under opt-out', optOutSent === false);

/* Mock window for pingVisit tests. */
globalThis.window = {
  location: mockLoc('https://webfpv.org/sim/'),
  history: { replaceState: () => {} },
};
globalThis.document = mockDoc('');

/* pingVisit returns false under GPC. */
mockNavigator.globalPrivacyControl = true;
setOptedOut(false);
const gpcVisit = pingVisit('sim');
check('pingVisit returns false under GPC', gpcVisit === false);

/* pingVisit returns false under opt-out. */
mockNavigator.globalPrivacyControl = false;
setOptedOut(true);
const optOutVisit = pingVisit('sim');
check('pingVisit returns false under opt-out', optOutVisit === false);

/* Clean up globals. */
delete globalThis.window;
delete globalThis.document;

/* Reset to counting state for next tests. */
mockNavigator.globalPrivacyControl = false;
setOptedOut(false);

console.log('\nstats-selftest: sendEvent with session attribution\n');

/* Clear session storage. */
sessionStorage.removeItem('webfpv.session.attribution');

/* sendEvent with no session attribution. */
let sentBody = null;
mockNavigator.sendBeacon = (url, blob) => {
  sentBody = blob.parts[0];
  return true;
};

sendEvent({ kind: 'test', value: 1 });
let parsed = JSON.parse(sentBody);
check('sendEvent without session attr: no referrer', parsed.referrer === null);
check('sendEvent without session attr: no ref', parsed.ref === null);

/* sendEvent with session attribution. */
sessionStorage.setItem('webfpv.session.attribution', JSON.stringify({ referrer: 'reddit.com', ref: 'hn' }));
sendEvent({ kind: 'test', value: 2 });
parsed = JSON.parse(sentBody);
check('sendEvent with session attr: referrer included', parsed.referrer === 'reddit.com');
check('sendEvent with session attr: ref included', parsed.ref === 'hn');

/* sendEvent with payload override. */
sendEvent({ kind: 'test', value: 3, referrer: 'github.com', ref: 'gh' });
parsed = JSON.parse(sentBody);
check('sendEvent payload override: referrer from payload', parsed.referrer === 'github.com');
check('sendEvent payload override: ref from payload', parsed.ref === 'gh');

/* sendEvent with partial session + partial payload. */
sessionStorage.setItem('webfpv.session.attribution', JSON.stringify({ referrer: 'reddit.com' }));
sendEvent({ kind: 'test', value: 4, ref: 'hn' });
parsed = JSON.parse(sentBody);
check('sendEvent mixed: referrer from session', parsed.referrer === 'reddit.com');
check('sendEvent mixed: ref from payload', parsed.ref === 'hn');

/* sendEvent with explicit null in payload should clear stale session value. */
sessionStorage.setItem('webfpv.session.attribution', JSON.stringify({ referrer: 'reddit.com', ref: 'hn' }));
sendEvent({ kind: 'test', value: 5, referrer: null, ref: null });
parsed = JSON.parse(sentBody);
check('sendEvent explicit null: referrer cleared', parsed.referrer === null);
check('sendEvent explicit null: ref cleared', parsed.ref === null);

console.log('\nstats-selftest: attribution stored on every page load\n');

/* Clear storage and localStorage first. */
sessionStorage.removeItem('webfpv.session.attribution');
localStorage.removeItem('webfpv.stats.v1');

/* First pingVisit on a new day - should store attribution. */
globalThis.document = mockDoc('https://github.com/');
globalThis.window = {
  location: mockLoc('https://webfpv.org/sim/?ref=gh'),
  history: { replaceState: () => {} },
};
let visitSent = pingVisit('sim');
check('first pingVisit succeeds (new day)', visitSent === true);
let stored = sessionAttribution();
check(
  'first pingVisit stores attribution',
  stored.referrer === 'github.com' && stored.ref === 'github',
  `got referrer=${stored.referrer}, ref=${stored.ref}`,
);

/* Second pingVisit on same day with different params - visit should be skipped but attribution should update. */
globalThis.document = mockDoc('https://reddit.com/');
globalThis.window = {
  location: mockLoc('https://webfpv.org/sim/?ref=reddit'),
  history: { replaceState: () => {} },
};
visitSent = pingVisit('sim');
check('second pingVisit on same day returns false (already counted)', visitSent === false);
stored = sessionAttribution();
check('second pingVisit still stores fresh attribution', stored.referrer === 'reddit.com' && stored.ref === 'reddit');

/* Test that a direct visit (no params, no referrer) clears stale session attribution. */
sessionStorage.setItem('webfpv.session.attribution', JSON.stringify({ referrer: 'github.com', ref: 'gh' }));
globalThis.document = mockDoc('');
globalThis.window = {
  location: mockLoc('https://webfpv.org/sim/'),
  history: { replaceState: () => {} },
};
let directVisitBody = null;
mockNavigator.sendBeacon = (url, blob) => {
  directVisitBody = blob.parts[0];
  return true;
};
/* Simulate a new day so pingVisit actually sends */
localStorage.removeItem('webfpv.stats.v1');
pingVisit('sim');
const directParsed = JSON.parse(directVisitBody);
check('direct visit clears stale referrer', directParsed.referrer === null);
check('direct visit clears stale ref', directParsed.ref === null);

/* Clean up globals. */
delete globalThis.document;
delete globalThis.window;

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
