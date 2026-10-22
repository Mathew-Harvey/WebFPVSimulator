/*
 * career-wiring.test.js: the career's seams with the rest of the game, read
 * from source. The career is lesson code that main.js fetches when a pilot
 * opens it, so the seams that matter are the ones no lesson test can see:
 * that nothing loads it at boot, that every hook copes with it not being
 * there, and that the shell main.js hands it has every call it makes.
 *
 * A source read is a weak test and this file knows it. It is here because
 * the failures it catches (a static import that puts 280 kB back on every
 * page load, an unguarded `career.x()` that throws before the first lesson,
 * a shell call that is not answered) are exactly the ones that a headless
 * flight of one lesson passes, and each cost a bug during the port.
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

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { PROGRESS_KEY } from '../../src/career/progress.js';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const main = read('src/main.js');
const ui = read('src/ui/ui.js');
const controller = read('src/career/controller.js');

test('nothing statically imports the career at boot', () => {
  for (const [name, src] of [['src/main.js', main], ['src/ui/ui.js', ui]]) {
    const hits = src.split('\n').filter((l) => /^\s*import\b.*['"][./]+\/?career\//.test(l) || /from ['"]\.\.?\/career\//.test(l));
    assert.deepEqual(hits, [], `${name} imports the career eagerly`);
  }
  assert.match(main, /import\('\.\/career\/controller\.js'\)/, 'main.js fetches the controller on demand');
});

test('every use of `career` in main.js copes with it not being loaded yet', () => {
  const lines = main.split('\n');
  /* Harness-only entry points are called after loadCareer() by the harness. */
  const harness = /^\s*(fly|leave): \(\) => career\./;
  const bad = [];
  lines.forEach((line, i) => {
    if (!/\bcareer\.[a-zA-Z]+\(/.test(line) || /^\s*(\*|\/\/|\/\*)/.test(line) || harness.test(line)) {
      return;
    }
    /* A guard on this line, or in the three lines above it. */
    const window = lines.slice(Math.max(0, i - 3), i + 1).join('\n');
    if (!/\bcareer (&&|\?)|if \(career\)|\(career \?|!\(career &&|else if \(career/.test(window)) {
      bad.push(`${i + 1}: ${line.trim()}`);
    }
  });
  /* The controller's own handlers, run once loadCareer has resolved. */
  const allowed = bad.filter((b) => !/loadCareer|\(c\) => c\.|career\.frame\(r\)/.test(b));
  assert.deepEqual(allowed, []);
  /* careerFrame calls career.frame on its caller's word, so the one caller
   * is the guard. */
  const callers = lines.filter((l) => /\bcareerFrame\(/.test(l) && !/function careerFrame/.test(l));
  assert.equal(callers.length, 1);
  const at = lines.findIndex((l) => /\bcareerFrame\(/.test(l) && !/function careerFrame/.test(l));
  assert.match(lines.slice(Math.max(0, at - 2), at + 1).join('\n'), /career && career\.owns\(\)/);
});

test('the shell main.js hands the career answers every call the controller makes', () => {
  const used = new Set([...controller.matchAll(/\bshell\.([A-Za-z]+)/g)].map((m) => m[1]));
  const start = main.indexOf('const careerShell = {');
  assert.ok(start > 0, 'careerShell is defined');
  const end = main.indexOf('\n  };', start);
  const body = main.slice(start, end);
  const given = new Set([...body.matchAll(/^\s{4}(?:get\s+)?([A-Za-z]+)\s*[:(,]/gm)].map((m) => m[1]));
  /* The Steam edition adds `achievements`; the controller asks for it only
   * through a guard, so a shell without it shows no Achievements button. */
  const optional = new Set(['achievements']);
  const missing = [...used].filter((n) => !given.has(n) && !optional.has(n));
  assert.deepEqual(missing, [], `the controller calls shell.${missing.join(', shell.')}`);
  assert.match(controller, /shell\.achievements \? shell\.achievements\(\)/, 'achievements stay optional');
  assert.match(controller, /!shell\.achievements/, 'the hub opens no achievements page without them');
});

test('the gate\'s Career card keys the same storage the career writes', () => {
  assert.match(ui, new RegExp(`const CAREER_PROGRESS_KEY = '${PROGRESS_KEY.replace(/\./g, '\\.')}'`));
});

test('the Career card is the gate\'s first card and its picture is there', () => {
  assert.match(ui, /art: 'assets\/gate\/career\.jpg'/);
  const first = ui.indexOf('...WAYS.map(');
  const card = ui.indexOf('label: CAREER_CARD.label');
  assert.ok(card > 0 && card < first, 'the card is listed before the ways in');
  readFileSync(new URL('../../assets/gate/career.jpg', import.meta.url));
});

test('a career hook never reads a lesson world that is not wanted', () => {
  /* worldDocument gives a lesson its own document only while careerWorld is
   * set, and leaving the career clears it, so the pilot's own map is what a
   * rebuild after the career gets. */
  assert.match(main, /careerWorld = null;\s*\n\s*careerFlightMode = null;\s*\n\s*careerCamera = null;/);
});
