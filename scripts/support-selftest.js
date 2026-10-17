/*
 * support-selftest.js: the Support link against a stub browser: where it
 * goes, how its tab is opened, and the one beacon a press sends. And the
 * support prompt (src/share/supportprompt.js): no weekly gate, trigger
 * 'exit', both opt-outs respected, one beacon a show and none when off.
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
import { readFileSync } from 'node:fs';
import { TIP_URL } from '../src/share/supportprompt.js';
import { INSTAGRAM_NOTE, INSTAGRAM_URL, PATREON_NOTE, PATREON_URL, bindPatreon, openInstagram, openSupport } from '../src/share/patreon.js';

const PAGE = 'https://www.patreon.com/cw/webfpv/membership';
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
check('$3, $8, $20 and $25 USD a month, no GST', /\$3\..*\$8\..*\$20\..*\$25\. USD a month\.$/.test(PATREON_NOTE) && !/GST/.test(PATREON_NOTE), PATREON_NOTE);

/* The anchor under the wordmark and in the builder. */
const a = { dataset: {}, setAttribute() {} };
bindPatreon(a);
check('Patreon link: href', a.href === `${PAGE}?utm_source=sim&ref=sim`, a.href);
check('Patreon link: target', a.target === '_blank', a.target);
check('Patreon link: rel', a.rel === 'noopener noreferrer', a.rel);

/* The menu row, opened from script: the same three as window.open takes them. */
press();
const o = opened[0] || {};
const b = beacons[0] || {};
const body = b.blob ? await b.blob.text() : '';
check('Support: one tab', opened.length === 1, `${opened.length} opened`);
check('Support: href', o.url === `${PAGE}?utm_source=sim&ref=sim`, o.url);
check('Support: target', o.target === '_blank', o.target);
check('Support: rel, as window features', o.features === 'noopener,noreferrer', o.features);
check('Support: opener nulled', Boolean(o.tab) && o.tab.opener === null, o.tab && o.tab.opener);
check('beacon: one a press', beacons.length === 1, `${beacons.length} sent`);
check('beacon: the visit ping endpoint', b.url === 'https://webfpv.org/board/api/stats/events', b.url);
check('beacon: body', body === '{"v":1,"kind":"support_click","source":"sim","target":"patreon"}', body);
check('beacon: text/plain', /^text\/plain(;|$)/.test(b.blob && b.blob.type), b.blob && b.blob.type);

/* The Instagram row: same window features, no query, no beacon, no dashes. */
opened.length = 0;
beacons.length = 0;
openInstagram();
const ig = opened[0] || {};
check('Instagram: one tab', opened.length === 1, `${opened.length} opened`);
check('Instagram: href, no ref or utm', ig.url === 'https://www.instagram.com/webfpv_org/' && INSTAGRAM_URL === ig.url, ig.url);
check('Instagram: target', ig.target === '_blank', ig.target);
check('Instagram: rel, as window features', ig.features === 'noopener,noreferrer', ig.features);
check('Instagram: opener nulled', Boolean(ig.tab) && ig.tab.opener === null, ig.tab && ig.tab.opener);
check('Instagram: no beacon', beacons.length === 0, `${beacons.length} sent`);
check('Instagram: note has no dash', !/[\u2013\u2014]/.test(INSTAGRAM_NOTE), INSTAGRAM_NOTE);

nav.globalPrivacyControl = true;
press();
check('Global Privacy Control: opens, sends nothing', opened.length === 1 && beacons.length === 0, `${opened.length} opened, ${beacons.length} sent`);
delete nav.globalPrivacyControl;
nav.sendBeacon = () => {
  throw new Error('refused');
};
press();
check('a beacon that throws does not stop the link', opened.length === 1, `${opened.length} opened`);

/* The prompt. A store that remembers, and a document that builds nodes. */
const { showSupportPrompt, canShowPrompt, isPromptDisabled, disablePrompt } = await import('../src/share/supportprompt.js');
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
const node = (tag) => {
  const n = { tag, children: [], attrs: {}, listeners: {}, removed: false };
  n.append = (...c) => n.children.push(...c);
  n.setAttribute = (k, v) => { n.attrs[k] = v; };
  n.addEventListener = (k, f) => { n.listeners[k] = f; };
  n.remove = () => { n.removed = true; };
  return n;
};
const docBody = node('body');
globalThis.document = { body: docBody, createElement: node };
const textOf = (n) => [n.textContent || '', ...n.children.map(textOf)].join(' ');
const links = (n) => (n.tag === 'a' ? [n] : []).concat(...n.children.map(links));
nav.sendBeacon = (url, blob) => beacons.push({ url, blob }) > 0;
delete nav.globalPrivacyControl;
beacons.length = 0;
store.set('webfpv.support.prompt.v1', JSON.stringify({ lastShownMs: Date.now() }));
check('prompt: a show a moment ago does not gate the next one', canShowPrompt() === true, '');
const first = showSupportPrompt('exit');
const second = showSupportPrompt('exit');
check('prompt: two exits in a row show twice', Boolean(first) && Boolean(second), '');
const pBeacons = await Promise.all(beacons.map((b) => b.blob.text()));
check('prompt: one beacon a show, source sim-exit',
  pBeacons.length === 2 && pBeacons.every((t) => /"kind":"support_prompt_shown","source":"sim-exit"/.test(t)), pBeacons[0]);
check('prompt: the message is the agreed words',
  textOf(first).includes('I build WebFPV in my spare time. If you\'re enjoying it, buy me a $1 coffee on Patreon or a one-off battery to help keep it free.'), '');
const ls = links(first);
check('prompt: the two buttons', ls.map((l) => l.textContent).join('|') === 'Buy Mat a coffee $1/mo|One-off $5', ls.map((l) => l.textContent).join('|'));
check('prompt: the coffee button is the coffee tier, tagged',
  ls[0].href === 'https://www.patreon.com/checkout/webfpv?rid=29846312&utm_source=sim-prompt&ref=sim-prompt', ls[0].href);
check('prompt: the tip link is the tip URL, tagged exit',
  ls[1].href.startsWith(TIP_URL) && /client_reference_id=prompt-exit/.test(ls[1].href), ls[1].href);
check('prompt: new tab, no opener', ls.every((l) => l.target === '_blank' && l.rel === 'noopener noreferrer'), '');
check('prompt: no early-access, perks or unlock wording', !/early.access|perk|unlock/i.test(textOf(first)), '');
beacons.length = 0;
disablePrompt();
check('prompt: the disabled key is read', isPromptDisabled() === true && canShowPrompt() === false, '');
check('prompt: disabled shows nothing and sends no beacon', showSupportPrompt('exit') === null && beacons.length === 0, `${beacons.length} sent`);
store.delete('webfpv.support.disabled.v1');
store.set('webfpv.settings.v3', JSON.stringify({ supportPrompts: false }));
check('prompt: Settings Off shows nothing and sends no beacon', showSupportPrompt('exit') === null && beacons.length === 0, `${beacons.length} sent`);
store.set('webfpv.settings.v3', JSON.stringify({ supportPrompts: true }));
check('prompt: back On shows again', Boolean(showSupportPrompt('exit')), '');
const src = readFileSync(new URL('../src/share/supportprompt.js', import.meta.url), 'utf8');
check('prompt: no weekly gate left in the module', !/ONE_WEEK_MS|readPromptState/.test(src), '');

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
