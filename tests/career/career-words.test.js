/*
 * career-words.test.js: lesson text names the stick the pilot holds, and on
 * the keyboard, the keys that stand in for it.
 *
 * This file is part of WebFPV.
 *
 * WebFPV is free software: you can redistribute it and/or modify it under
 * the terms of the GNU General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option)
 * any later version.
 *
 * WebFPV is distributed in the hope that it will be useful, but WITHOUT ANY
 * WARRANTY, without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE. See the GNU General Public License for more
 * details.
 *
 * You should have received a copy of the GNU General Public License along
 * with WebFPV. If not, see <https://www.gnu.org/licenses/>.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { sticksIn } from '../../src/career/words.js';
import { CHAPTERS } from '../../src/career/curriculum.js';

test('a radio pilot reads sticks, not keys', () => {
  assert.equal(sticksIn('Push {throttle} up, slowly.', 2), 'Push the left stick up, slowly.');
  assert.equal(sticksIn('{Tilt} forward.', 2), 'The right stick forward.');
  assert.equal(sticksIn('Push {throttle} up.', 1), 'Push the right stick up.');
});

test('a keyboard pilot reads the keys after the stick, by channel', () => {
  const keys = { keys: true };
  assert.equal(sticksIn('Push {throttle} up, slowly.', 2, keys), 'Push the left stick (W and S) up, slowly.');
  assert.equal(sticksIn('Turn with {yaw}.', 2, keys), 'Turn with the left stick (A and D).');
  assert.equal(sticksIn('Lean with {roll}.', 2, keys), 'Lean with the right stick (the left and right arrows).');
  assert.equal(sticksIn('{Pitch} forward.', 2, keys), 'The right stick (the up and down arrows) forward.');
  assert.equal(sticksIn('{Tilt} forward.', 2, keys), 'The right stick (the arrows) forward.');
  /* Mode 1 swaps the sides; the keys follow the side, so throttle is on
   * the arrows and tilt is split across both hands. */
  assert.equal(sticksIn('Push {throttle} up.', 1, keys), 'Push the right stick (the up and down arrows) up.');
});

test('every lesson line survives both readings without a stray brace', () => {
  const lines = [];
  for (const c of CHAPTERS) {
    for (const l of c.lessons) {
      lines.push(l.briefing.goal, l.briefing.why, ...l.briefing.steps, l.briefing.note, l.crashTip);
      for (const o of l.objectives) {
        lines.push(o.text, o.hint);
      }
    }
  }
  for (const line of lines.filter(Boolean)) {
    for (const mode of [1, 2]) {
      for (const keys of [false, true]) {
        assert.doesNotMatch(sticksIn(line, mode, { keys }), /[{}]/, line);
      }
    }
  }
});

/* src/ui/ui.js counts the lessons for the gate's card without loading the
 * curriculum (CAREER_LESSONS), so the two are held together here. */
test('the gate card\'s lesson count is the curriculum\'s', async () => {
  const { readFileSync } = await import('node:fs');
  const ui = readFileSync(new URL('../../src/ui/ui.js', import.meta.url), 'utf8');
  const m = /const CAREER_LESSONS = (\d+);/.exec(ui);
  const total = CHAPTERS.reduce((n, c) => n + c.lessons.length, 0);
  assert.equal(Number(m && m[1]), total);
});

/*
 * A SPREAD BETWEEN LAPS READS AS ONE, NEVER AS A TOTAL (bug-b5a946be).
 *
 * Steady Laps asked for "Five laps inside 0.8 s", and a pilot read it the
 * way anybody would, as five laps flown in eight tenths of a second, and
 * filed it as a bug: "NO ONE CAN DO 5 laps in point 8 seconds". The rule
 * (objectives.js, gates.steady) is that the last laps sit within that many
 * ms of each other. So every steady objective has to say what the time is
 * between, and the seconds it quotes have to be the ones it scores.
 */
test('a steady objective says its time is between the laps, and quotes the time it scores', () => {
  let steady = 0;
  for (const c of CHAPTERS) {
    for (const l of c.lessons) {
      for (const o of l.objectives) {
        if (o.steady == null) {
          continue;
        }
        steady += 1;
        assert.match(o.text, /of each other|apart/, `${l.id}: "${o.text}" reads as a total time`);
        const quoted = /(\d+(?:\.\d+)?) s\b/.exec(o.text);
        assert.ok(quoted, `${l.id}: "${o.text}" quotes no time`);
        assert.equal(Number(quoted[1]) * 1000, o.steady, `${l.id}: "${o.text}" quotes a time it does not score`);
      }
    }
  }
  assert.ok(steady > 0, 'the curriculum has a steady objective to check');
});

test('no lesson line puts a count of laps in a number of seconds without saying of what', () => {
  for (const c of CHAPTERS) {
    for (const l of c.lessons) {
      const lines = [l.briefing.goal, l.briefing.why, ...l.briefing.steps, l.briefing.note, l.crashTip, l.lapsTip];
      for (const o of l.objectives) {
        lines.push(o.text, o.hint);
      }
      for (const line of lines.filter(Boolean)) {
        if (/\blaps? (in|inside|within) (\d|one|two|three|four|five|six|seven|eight|nine|ten)\b/i.test(line)) {
          assert.match(line, /of each other|apart/, `${l.id}: "${line}" reads as laps flown in that time`);
        }
      }
    }
  }
});
