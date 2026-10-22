/*
 * career-progress.test.js: the rules of the road, held to the ones the
 * briefing screens promise (src/career/progress.js). Pure: a fake storage
 * stands in for localStorage, and no run is flown.
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

import { CHAPTERS, allLessons } from '../../src/career/curriculum.js';
import {
  PROGRESS_KEY, emptyProgress, loadProgress, saveProgress, lessonUnlocked, chapterUnlocked,
  chapterDone, recordRun, totals, lessonDone,
} from '../../src/career/progress.js';

const fakeStorage = (initial = {}) => {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    map: m,
  };
};

const finish = (p, id, medal = 'bronze', extra = {}) => recordRun(p, id, { complete: true, ms: 10000, medal, ...extra });

test('a new pilot has the first chapter and only its first lesson', () => {
  const p = emptyProgress();
  assert.equal(chapterUnlocked(p, 0), true);
  assert.equal(chapterUnlocked(p, 1), false);
  const first = CHAPTERS[0].lessons;
  assert.equal(lessonUnlocked(p, first[0].id), true);
  assert.equal(lessonUnlocked(p, first[1].id), false);
});

test('lessons open one after another, and the next chapter opens on the last lesson of this one', () => {
  const p = emptyProgress();
  const lessons = CHAPTERS[0].lessons;
  lessons.forEach((l, i) => {
    assert.equal(lessonUnlocked(p, l.id), true, `${l.id} open before it is flown`);
    const out = finish(p, l.id);
    assert.equal(out.firstFinish, true);
    if (i < lessons.length - 1) {
      assert.equal(out.opened, null);
      assert.equal(lessonUnlocked(p, lessons[i + 1].id), true);
    } else {
      assert.equal(out.opened, CHAPTERS[1].id);
    }
  });
  assert.equal(chapterDone(p, CHAPTERS[0]), true);
  assert.equal(chapterUnlocked(p, 1), true);
  assert.equal(chapterUnlocked(p, 2), false);
});

test('a lesson of a later chapter stays shut until the chapter before is done', () => {
  const p = emptyProgress();
  assert.equal(lessonUnlocked(p, CHAPTERS[2].lessons[0].id), false);
  assert.equal(lessonUnlocked(p, 'no-such-lesson'), false);
});

test('"I already fly" opens everything and is a choice, not a medal', () => {
  const p = { ...emptyProgress(), openAll: true };
  for (const l of allLessons()) {
    assert.equal(lessonUnlocked(p, l.id), true);
  }
  assert.equal(totals(p).done, 0);
});

test('a medal only ever improves, and a worse run keeps the better one', () => {
  const p = emptyProgress();
  const id = CHAPTERS[0].lessons[0].id;
  finish(p, id, 'silver');
  let out = finish(p, id, 'bronze');
  assert.equal(p.lessons[id].medal, 'silver');
  assert.equal(out.betterMedal, false);
  out = finish(p, id, 'gold');
  assert.equal(p.lessons[id].medal, 'gold');
  assert.equal(out.betterMedal, true);
  assert.equal(out.previous, 'silver');
  assert.equal(p.lessons[id].runs, 3);
});

test('a better time is kept, a slower one is not, and the first finish is not a "better" time', () => {
  const p = emptyProgress();
  const id = CHAPTERS[0].lessons[0].id;
  let out = recordRun(p, id, { complete: true, ms: 9000, medal: 'bronze' });
  assert.equal(out.betterTime, false);
  out = recordRun(p, id, { complete: true, ms: 12000, medal: 'bronze' });
  assert.equal(p.lessons[id].bestMs, 9000);
  assert.equal(out.betterTime, false);
  out = recordRun(p, id, { complete: true, ms: 8000, medal: 'bronze' });
  assert.equal(p.lessons[id].bestMs, 8000);
  assert.equal(out.betterTime, true);
});

test('a failed run counts as a run and finishes nothing', () => {
  const p = emptyProgress();
  const id = CHAPTERS[0].lessons[0].id;
  recordRun(p, id, { complete: false });
  assert.equal(p.runs, 1);
  assert.equal(p.last, id);
  assert.equal(lessonDone(p, id), false);
  assert.equal(p.lessons[id].medal, undefined);
});

test('finishing every lesson records the day and says so once', () => {
  const p = emptyProgress();
  let said = 0;
  for (const l of allLessons()) {
    if (finish(p, l.id, 'gold').careerFinished) {
      said += 1;
    }
  }
  assert.equal(said, 1);
  assert.ok(p.finishedAt);
  const t = totals(p);
  assert.equal(t.done, t.total);
  assert.equal(t.gold, t.total);
  assert.equal(t.chapters, CHAPTERS.length);
});

test('progress survives a save and a load, and a corrupt entry is a fresh career, not a crash', () => {
  const s = fakeStorage();
  const p = emptyProgress();
  finish(p, CHAPTERS[0].lessons[0].id, 'gold');
  assert.equal(saveProgress(p, s), true);
  assert.deepEqual(loadProgress(s).lessons, p.lessons);
  for (const bad of ['{not json', 'null', '{"v":2,"lessons":{}}', '{"v":1}', '[]']) {
    const t = fakeStorage({ [PROGRESS_KEY]: bad });
    assert.deepEqual(loadProgress(t), emptyProgress(), bad);
  }
});

test('no storage at all is not an error', () => {
  assert.deepEqual(loadProgress(null), emptyProgress());
  assert.equal(saveProgress(emptyProgress(), null), true);
  const throwing = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('full'); } };
  assert.deepEqual(loadProgress(throwing), emptyProgress());
  assert.equal(saveProgress(emptyProgress(), throwing), false);
});
