/*
 * support-selftest.js: the Support link against a stub browser: where it
 * goes, how its tab is opened, and the one beacon a press sends.
 *
 * Usage:
 *   npm run support:selftest
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

import { execFileSync } from 'node:child_process';
import { PATREON_NOTE, PATREON_URL, bindPatreon, openSupport } from '../src/share/patreon.js';

const PAGE = 'https://www.patreon.com/cw/webfpv';
const rows = [];
let failed = 0;

function check(name, ok, detail) {
  rows.push([name, ok ? 'ok' : 'FAIL', detail]);
  if (!ok) {
    failed += 1;
  }
}

/* As much of a browser as patreon.js, stats.js and board.js touch. Node
 * has its own Blob. */
const opened = [];
const beacons = [];
const nav = { sendBeacon: (url, blob) => beacons.push({ url, blob }) > 0 };
Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true });
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.window = {
  location: { hostname: 'webfpv.org', search: '' },
  open: (url, target, features) => {
    const tab = { opener: 'the simulator' };
    opened.push({ url, target, features, tab });
    return tab;
  },
};

function press() {
  opened.length = 0;
  beacons.length = 0;
  openSupport();
}

check('the page is /cw/webfpv, no query', PATREON_URL === PAGE, PATREON_URL);
check('$3, $8 and $20 USD a month, no GST', /\$3\..*\$8\..*\$20\. USD a month\.$/.test(PATREON_NOTE) && !/GST/.test(PATREON_NOTE), PATREON_NOTE);

/* The anchor under the wordmark and in the builder. */
const a = { dataset: {}, setAttribute() {} };
bindPatreon(a);
check('Patreon link: href', a.href === PAGE, a.href);
check('Patreon link: target', a.target === '_blank', a.target);
check('Patreon link: rel', a.rel === 'noopener noreferrer', a.rel);

/* The menu row, opened from script: the same three as window.open takes them. */
press();
const o = opened[0] || {};
const b = beacons[0] || {};
const body = b.blob ? await b.blob.text() : '';
check('Support: one tab', opened.length === 1, `${opened.length} opened`);
check('Support: href', o.url === PAGE, o.url);
check('Support: target', o.target === '_blank', o.target);
check('Support: rel, as window features', o.features === 'noopener,noreferrer', o.features);
check('Support: opener nulled', Boolean(o.tab) && o.tab.opener === null, o.tab && o.tab.opener);
check('beacon: one a press', beacons.length === 1, `${beacons.length} sent`);
check('beacon: the visit ping endpoint', b.url === 'https://webfpv.org/board/api/stats/events', b.url);
check('beacon: body', body === '{"v":1,"kind":"support_click","source":"sim"}', body);
check('beacon: text/plain', /^text\/plain(;|$)/.test(b.blob && b.blob.type), b.blob && b.blob.type);

nav.globalPrivacyControl = true;
press();
check('Global Privacy Control: opens, sends nothing', opened.length === 1 && beacons.length === 0, `${opened.length} opened, ${beacons.length} sent`);
delete nav.globalPrivacyControl;
nav.sendBeacon = () => {
  throw new Error('refused');
};
press();
check('a beacon that throws does not stop the link', opened.length === 1, `${opened.length} opened`);

/* Every file git has or would add, but PROGRESS.md, which records what was
 * true when it was written, and this file, which names what it looks for. */
let stale = '';
try {
  stale = execFileSync('git', ['grep', '--untracked', '-n', '-I', '-F', '/c/webfpv', '--', '.',
    ':!PROGRESS.md', ':!scripts/support-selftest.js'], { cwd: new URL('..', import.meta.url), encoding: 'utf8' });
} catch (e) {
  /* git grep exits 1 when nothing matches, which is the pass. */
  stale = e.status === 1 ? '' : `git grep failed: ${e.message}`;
}
check('no /c/webfpv address remains', stale === '', stale.trim() || 'none');

const w = Math.max(...rows.map((r) => r[0].length));
console.log('support-selftest: the Support link, its tab, and its one beacon\n');
for (const [name, status, detail] of rows) {
  console.log(`${status === 'ok' ? ' ok ' : 'FAIL'}  ${name.padEnd(w)}  ${detail}`);
}
console.log(`\n${rows.length - failed} of ${rows.length} checks clean`);
process.exit(failed === 0 ? 0 : 1);
