/*
 * career-progress.test.js: the rules of the skill tree, held to the ones
 * the screens promise (src/career/progress.js, src/career/tree.js). Pure: a
 * fake storage stands in for localStorage, and no run is flown.
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

import { CHAPTERS, allLessons, lessonById } from '../../src/career/curriculum.js';
import {
  BRANCHES, LEVEL_QUESTIONS, PARTS, PASS_COUNT, parentsOf, partById, partOf, partsInOrder, treeLessons,
} from '../../src/career/tree.js';
import {
  MERGE_KEY, PROGRESS_KEY, PROGRESS_KEY_V1, chapterDone, clearKnown, decodeSave, emptyProgress, encodeSave,
  levelAnswers, lessonDone, lessonUnlocked, loadProgress, markKnown, mergeProgress, nextUp, normaliseProgress,
  liveriesEarned, partOpen, partPassed, partStats, recordRun, saveProgress, setLevel, titleOf, totals,
} from '../../src/career/progress.js';
import {
  TITLES, TITLE_IDS, TITLE_KEY, savedTitleNumber, titleNumber, titleWords,
} from '../../src/career/titles.js';
import { LIVERIES, liveryById } from '../../src/render/livery.js';

const fakeStorage = (initial = {}) => {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    map: m,
  };
};

const finish = (p, id, medal = 'bronze', extra = {}) => recordRun(p, id, { complete: true, ms: 10000, medal, ...extra });
const flyPart = (p, partId, medal = 'gold') => partById(partId).lessons.forEach((id) => finish(p, id, medal));
const trunk = (p, medal = 'gold') => ['c1', 'c2', 'c3', 'rk'].forEach((id) => flyPart(p, id, medal));

/* ---------------- the tree itself ---------------- */

test('the tree shows every lesson in the curriculum exactly once', () => {
  const shown = treeLessons();
  assert.equal(new Set(shown).size, shown.length, 'a lesson is on the tree twice');
  assert.deepEqual([...shown].sort(), allLessons().map((l) => l.id).sort());
  for (const id of shown) {
    assert.ok(lessonById(id), `${id} is on the tree and not in the curriculum`);
    assert.equal(partOf(id).lessons.includes(id), true);
  }
});

test('every part names real parts to grow from, sits on the grid, and no two overlap', () => {
  const cells = new Map();
  for (const part of PARTS) {
    assert.ok(BRANCHES[part.branch], `${part.id} is on no branch`);
    assert.ok(part.col >= 0 && part.col + (part.span || 1) <= 5, `${part.id} is off the grid`);
    assert.ok(part.row >= 0 && part.row <= 6, `${part.id} is off the grid`);
    for (let c = part.col; c < part.col + (part.span || 1); c += 1) {
      const key = `${c},${part.row}`;
      assert.equal(cells.has(key), false, `${part.id} is drawn over ${cells.get(key)}`);
      cells.set(key, part.id);
    }
    if (part.after !== 'branch') {
      for (const id of part.after) {
        assert.ok(partById(id), `${part.id} grows from ${id}, which is not a part`);
      }
    }
    assert.equal(Boolean(part.soon), part.lessons.length === 0, `${part.id}: soon means no lessons yet`);
  }
});

test('a branch licence grows from every part of its branch that has lessons', () => {
  const race = parentsOf(partById('race-licence')).map((x) => x.id).sort();
  assert.deepEqual(race, ['c7', 'c8', 'race-craft', 'real-tracks', 'whoop-league']);
  const free = parentsOf(partById('freestyle-licence')).map((x) => x.id).sort();
  assert.deepEqual(free, ['c4', 'c5', 'c6', 'c9', 'lines', 'proximity']);
});

test('the order a pilot is led through starts at the trunk and puts the chosen branch first', () => {
  const race = partsInOrder('race').map((x) => x.id);
  assert.deepEqual(race.slice(0, 4), ['c1', 'c2', 'c3', 'rk']);
  assert.equal(race[4], 'c7');
  assert.equal(race.at(-1), 'pro');
  const free = partsInOrder('freestyle').map((x) => x.id);
  assert.ok(['c4', 'c5'].includes(free[4]), free[4]);
  assert.ok(free.indexOf('c4') < free.indexOf('c7'));
});

/* ---------------- opening the tree ---------------- */

test('a new pilot has the first lesson and nothing else', () => {
  const p = emptyProgress();
  assert.equal(lessonUnlocked(p, '1-1'), true);
  assert.equal(lessonUnlocked(p, '1-2'), false);
  assert.equal(partOpen(p, partById('c2')), false);
  assert.equal(partOpen(p, partById('c7')), false);
  assert.equal(lessonUnlocked(p, 'no-such-lesson'), false);
});

test('the trunk is flown in order, and each part opens on the last lesson of the one before', () => {
  const p = emptyProgress();
  for (const id of ['c1', 'c2', 'c3']) {
    const lessons = partById(id).lessons;
    lessons.forEach((l, i) => {
      assert.equal(lessonUnlocked(p, l), true, `${l} open before it is flown`);
      if (i + 1 < lessons.length) {
        assert.equal(lessonUnlocked(p, lessons[i + 1]), false, `${lessons[i + 1]} open too soon`);
      }
      const out = finish(p, l);
      assert.equal(out.firstFinish, true);
    });
  }
  assert.equal(partOpen(p, partById('rk')), true);
  assert.equal(partOpen(p, partById('c7')), false, 'a branch before the licence');
});

test('the Rookie Licence opens both branches at once, and says what it opened', () => {
  const p = emptyProgress();
  ['c1', 'c2', 'c3'].forEach((id) => flyPart(p, id));
  const out = finish(p, 'rk-1', 'silver');
  assert.deepEqual([...out.opened].sort(), ['c4', 'c5', 'c7']);
  assert.equal(out.licence, 'rk');
  assert.equal(titleOf(p), 'rookie');
  for (const id of ['c4', 'c5', 'c7']) {
    for (const l of partById(id).lessons) {
      assert.equal(lessonUnlocked(p, l), true, `${l}: a branch part opens all its lessons`);
    }
  }
});

test(`${PASS_COUNT} lessons of a branch part open the parts that grow from it`, () => {
  const p = emptyProgress();
  trunk(p);
  const gates = partById('c7').lessons;
  for (let i = 0; i < PASS_COUNT - 1; i += 1) {
    finish(p, gates[i]);
  }
  assert.equal(partPassed(p, partById('c7')), false);
  assert.equal(partOpen(p, partById('c8')), false);
  const out = finish(p, gates[PASS_COUNT - 1]);
  assert.deepEqual(out.opened.slice().sort(), ['c8', 'race-craft']);
  assert.equal(partOpen(p, partById('c8')), true);
  assert.equal(partOpen(p, partById('race-craft')), true);
  assert.equal(partOpen(p, partById('whoop-league')), false, 'Whoop League grows from Race Craft');
});

test('Hibari Yard Tricks wants both Segmented and Big Gaps passed', () => {
  const p = emptyProgress();
  trunk(p);
  flyPart(p, 'c5');
  flyPart(p, 'c6');
  assert.equal(partOpen(p, partById('c9')), false);
  partById('c4').lessons.slice(0, PASS_COUNT).forEach((id) => finish(p, id));
  assert.equal(partOpen(p, partById('c9')), true);
});

test('a licence wants every lesson of every part of its branch, and the crown wants both', () => {
  const p = emptyProgress();
  trunk(p);
  ['c7', 'c8', 'race-craft', 'whoop-league'].forEach((id) => flyPart(p, id));
  partById('real-tracks').lessons.slice(0, -1).forEach((id) => finish(p, id));
  assert.equal(partOpen(p, partById('race-licence')), false);
  finish(p, partById('real-tracks').lessons.at(-1));
  assert.equal(partOpen(p, partById('race-licence')), true);
  const out = finish(p, '10-4', 'gold');
  assert.equal(out.licence, 'race-licence');
  assert.equal(titleOf(p), 'racer');
  assert.equal(partOpen(p, partById('pro')), false);
  ['c4', 'c5', 'c6', 'c9', 'proximity', 'lines'].forEach((id) => flyPart(p, id));
  flyPart(p, 'freestyle-licence');
  assert.equal(titleOf(p), 'both');
  assert.equal(partOpen(p, partById('pro')), true);
  finish(p, '10-1', 'gold');
  assert.equal(titleOf(p), 'pro');
});

test('a lesson with a medal stays open whatever the tree says', () => {
  const p = emptyProgress();
  p.lessons['9-3'] = { runs: 1, medal: 'bronze' };
  assert.equal(lessonUnlocked(p, '9-3'), true);
  assert.equal(lessonUnlocked(p, '9-4'), true, 'a part with a medal in it is open');
  assert.equal(lessonUnlocked(p, '10-1'), false);
});

test('Open the whole tree opens everything and is a choice, not a medal', () => {
  const p = { ...emptyProgress(), openAll: true };
  for (const l of allLessons()) {
    assert.equal(lessonUnlocked(p, l.id), true, l.id);
  }
  assert.equal(totals(p).done, 0);
  assert.equal(titleOf(p), 'student');
});

/* ---------------- what a pilot already knows ---------------- */

test('a part marked known opens what grows from it, and earns no stars', () => {
  const p = emptyProgress();
  assert.equal(markKnown(p, 'c1', true), true);
  assert.equal(markKnown(p, 'c1', true), false, 'twice is once');
  assert.equal(lessonUnlocked(p, '2-1'), true);
  assert.equal(partStats(p, partById('c1')).state, 'known');
  assert.equal(totals(p).stars, 0);
  assert.equal(markKnown(p, 'no-such-part', true), false, 'a part the tree does not have cannot be known');
  assert.equal(markKnown(p, 'c1', false), true);
  assert.equal(lessonUnlocked(p, '2-1'), false);
});

test('Set my level marks the trunk with any yes, and the branch a yes names', () => {
  const p = emptyProgress();
  const q = Object.fromEntries(LEVEL_QUESTIONS.map((x) => [x.id, false]));
  assert.deepEqual(setLevel(p, q), []);
  const marked = setLevel(p, { ...q, flips: true });
  assert.deepEqual(marked.sort(), ['c1', 'c2', 'c3', 'c5', 'rk']);
  assert.equal(titleOf(p), 'rookie');
  assert.equal(partOpen(p, partById('c6')), true);
  assert.equal(partOpen(p, partById('c8')), false, 'flips says nothing about racing');
  assert.deepEqual(levelAnswers(p), { hover: true, acro: true, flips: true, race: false });
  assert.equal(clearKnown(p), true);
  assert.equal(partOpen(p, partById('c2')), false);
});

/* ---------------- where to next ---------------- */

test('Continue leads a beginner lesson by lesson, then offers the fork once', () => {
  const p = emptyProgress();
  assert.deepEqual(nextUp(p), { lesson: '1-1' });
  finish(p, '1-1');
  assert.deepEqual(nextUp(p), { lesson: '1-2' });
  const tried = { ...emptyProgress(), openAll: true };
  recordRun(tried, '5-3', { complete: false });
  assert.deepEqual(nextUp(tried), { lesson: '5-3' }, 'the lesson the pilot was on, unfinished');
  recordRun(p, '1-3', { complete: false });
  assert.deepEqual(nextUp(p), { lesson: '1-2' }, 'never a lesson that is not open');
  trunk(p);
  assert.deepEqual(nextUp(p), { fork: true });
  p.first = 'freestyle';
  const n = nextUp(p);
  assert.ok(['c4', 'c5'].includes(partOf(n.lesson).id), n.lesson);
  p.first = 'race';
  assert.equal(partOf(nextUp(p).lesson).id, 'c7');
});

test('Continue skips what is known, and offers a better medal once everything is flown', () => {
  const p = emptyProgress();
  setLevel(p, { acro: true });
  p.first = 'race';
  assert.equal(nextUp(p).lesson, partById('c7').lessons[0]);
  const all = emptyProgress();
  for (const l of allLessons()) {
    finish(all, l.id, 'gold');
  }
  assert.equal(nextUp(all), null);
  all.lessons['5-2'].medal = 'silver';
  assert.deepEqual(nextUp(all), { lesson: '5-2', polish: true });
});

/* ---------------- medals and times ---------------- */

test('a medal only ever improves, and a worse run keeps the better one', () => {
  const p = emptyProgress();
  let out = finish(p, '1-1', 'silver');
  assert.equal(out.stars, 2);
  out = finish(p, '1-1', 'bronze');
  assert.equal(p.lessons['1-1'].medal, 'silver');
  assert.equal(out.betterMedal, false);
  assert.equal(out.stars, 0);
  out = finish(p, '1-1', 'gold');
  assert.equal(p.lessons['1-1'].medal, 'gold');
  assert.equal(out.betterMedal, true);
  assert.equal(out.stars, 1);
  assert.equal(out.previous, 'silver');
  assert.equal(p.lessons['1-1'].runs, 3);
});

test('a better time is kept, a slower one is not, and the first finish is not a "better" time', () => {
  const p = emptyProgress();
  let out = recordRun(p, '1-1', { complete: true, ms: 9000, medal: 'bronze' });
  assert.equal(out.betterTime, false);
  out = recordRun(p, '1-1', { complete: true, ms: 12000, medal: 'bronze' });
  assert.equal(p.lessons['1-1'].bestMs, 9000);
  assert.equal(out.betterTime, false);
  out = recordRun(p, '1-1', { complete: true, ms: 8000, medal: 'bronze' });
  assert.equal(p.lessons['1-1'].bestMs, 8000);
  assert.equal(out.betterTime, true);
});

test('a failed run counts as a run and finishes nothing', () => {
  const p = emptyProgress();
  recordRun(p, '1-1', { complete: false });
  assert.equal(p.runs, 1);
  assert.equal(p.last, '1-1');
  assert.equal(lessonDone(p, '1-1'), false);
  assert.equal(p.lessons['1-1'].medal, undefined);
});

test('finishing every lesson records the day and says so once, and every part is counted', () => {
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
  assert.equal(t.total, allLessons().length);
  assert.equal(t.stars, t.maxStars);
  assert.equal(t.parts, t.partsTotal);
  assert.equal(t.partsTotal, PARTS.filter((x) => !x.soon).length);
  for (const c of CHAPTERS) {
    assert.equal(chapterDone(p, c), true, c.id);
  }
});

/* ---------------- the save ---------------- */

test('progress survives a save and a load, and a corrupt entry is a fresh career, not a crash', () => {
  const s = fakeStorage();
  const p = emptyProgress();
  finish(p, '1-1', 'gold');
  markKnown(p, 'c2', true);
  p.first = 'freestyle';
  assert.equal(saveProgress(p, s), true);
  const back = loadProgress(s);
  assert.deepEqual(back.lessons, p.lessons);
  assert.deepEqual(back.known, ['c2']);
  assert.equal(back.first, 'freestyle');
  for (const bad of ['{not json', 'null', '{"v":3,"lessons":{}}', '{"v":2}', '[]', '{"v":2,"lessons":[]}']) {
    const t = fakeStorage({ [PROGRESS_KEY]: bad });
    assert.deepEqual(loadProgress(t), emptyProgress(), bad);
  }
});

test('a save from before the tree is read, kept, and a finished Switching to Acro is the licence', () => {
  const v1 = { v: 1, lessons: {}, openAll: false, last: '3-5', runs: 30 };
  for (const c of CHAPTERS.slice(0, 3)) {
    for (const l of c.lessons) {
      v1.lessons[l.id] = { runs: 1, medal: 'silver', bestMs: 20000 };
    }
  }
  v1.lessons['7-1'] = { runs: 2, medal: 'gold', bestMs: 15000 };
  const s = fakeStorage({ [PROGRESS_KEY_V1]: JSON.stringify(v1) });
  const p = loadProgress(s);
  assert.equal(p.v, 2);
  assert.deepEqual(p.known, ['rk']);
  assert.equal(p.lessons['7-1'].medal, 'gold');
  assert.equal(p.runs, 30);
  assert.equal(partOpen(p, partById('c7')), true);
  assert.equal(partOpen(p, partById('c4')), true);
  assert.equal(titleOf(p), 'rookie');
  assert.ok(s.map.has(PROGRESS_KEY), 'the converted save is written');
  assert.ok(s.map.has(PROGRESS_KEY_V1), 'the old one is left where it was');
  const half = { v: 1, lessons: { '1-1': { runs: 1, medal: 'gold' } }, runs: 1 };
  assert.deepEqual(loadProgress(fakeStorage({ [PROGRESS_KEY_V1]: JSON.stringify(half) })).known, []);
});

test('a career parked by the Steam shell is merged in once, and never takes a medal away', () => {
  const here = emptyProgress();
  finish(here, '1-1', 'gold', { ms: 9000 }, new Date('2026-10-01T00:00:00Z'));
  here.updatedAt = '2026-10-01T00:00:00.000Z';
  const cloud = emptyProgress();
  finish(cloud, '1-1', 'silver', { ms: 8000 });
  finish(cloud, '1-2', 'bronze');
  cloud.updatedAt = '2026-10-20T00:00:00.000Z';
  const s = fakeStorage({ [PROGRESS_KEY]: JSON.stringify(cloud), [MERGE_KEY]: JSON.stringify(here) });
  const p = loadProgress(s);
  assert.equal(p.lessons['1-1'].medal, 'gold');
  assert.equal(p.lessons['1-1'].bestMs, 8000);
  assert.equal(p.lessons['1-2'].medal, 'bronze');
  assert.equal(p.last, '1-2', 'the newer save says where the pilot was');
  assert.equal(s.map.has(MERGE_KEY), false, 'merged once');
  assert.equal(JSON.parse(s.map.get(PROGRESS_KEY)).lessons['1-1'].medal, 'gold');
  const junk = fakeStorage({ [PROGRESS_KEY]: JSON.stringify(cloud), [MERGE_KEY]: '{broken' });
  assert.equal(loadProgress(junk).lessons['1-2'].medal, 'bronze');
  assert.equal(junk.map.has(MERGE_KEY), false, 'a parked save that does not read is let go');
});

test('merging is the best of both, whichever way round', () => {
  const a = emptyProgress();
  finish(a, '1-1', 'gold', { ms: 12000 });
  markKnown(a, 'c4', true);
  const b = emptyProgress();
  finish(b, '1-1', 'bronze', { ms: 9000 });
  finish(b, '1-2', 'silver');
  b.openAll = true;
  const ab = mergeProgress(a, b);
  const ba = mergeProgress(b, a);
  for (const m of [ab, ba]) {
    assert.equal(m.lessons['1-1'].medal, 'gold');
    assert.equal(m.lessons['1-1'].bestMs, 9000);
    assert.equal(m.lessons['1-2'].medal, 'silver');
    assert.deepEqual(m.known, ['c4']);
    assert.equal(m.openAll, true);
  }
  assert.deepEqual(ab.lessons, ba.lessons);
});

test('a save code carries a career to another browser, and a mangled one is refused', () => {
  const p = emptyProgress();
  trunk(p, 'silver');
  finish(p, '5-1', 'gold', { ms: 7000 });
  recordRun(p, '5-2', { complete: false });
  markKnown(p, 'c7', true);
  p.first = 'freestyle';
  const code = encodeSave(p);
  assert.match(code, /^WFPV2-[A-Za-z0-9_-]+-[0-9a-z]{7}$/);
  const back = decodeSave(`  ${code.slice(0, 20)}\n${code.slice(20)} `);
  assert.ok(back, 'line breaks a chat app adds are ignored');
  assert.equal(back.lessons['5-1'].medal, 'gold');
  assert.equal(back.lessons['5-1'].bestMs, 7000);
  assert.equal(back.lessons['5-2'].runs, 1);
  assert.equal(back.lessons['5-2'].medal, undefined);
  assert.deepEqual(back.known, ['c7']);
  assert.equal(back.first, 'freestyle');
  assert.deepEqual(normaliseProgress(back), back);
  const flipped = code.replace(/-(.)/, (m, c) => `-${c === 'A' ? 'B' : 'A'}`);
  for (const bad of [flipped, 'WFPV2-abc-0000000', '', 'hello', null, `${code}x`]) {
    assert.equal(decodeSave(bad), null, String(bad));
  }
});

test('no storage at all is not an error', () => {
  assert.deepEqual(loadProgress(null), emptyProgress());
  assert.equal(saveProgress(emptyProgress(), null), true);
  const throwing = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('full'); } };
  assert.deepEqual(loadProgress(throwing), emptyProgress());
  assert.equal(saveProgress(emptyProgress(), throwing), false);
});

/* ---------------- rewards: liveries and titles ---------------- */

test('every part earns a livery of its own, and every livery but the house paint is earned by one part', () => {
  const named = PARTS.map((x) => x.livery);
  assert.equal(new Set(named).size, named.length, 'two parts earn the same livery');
  for (const part of PARTS) {
    assert.equal(liveryById(part.livery).id, part.livery, `${part.id} earns ${part.livery}, which is not a livery`);
  }
  assert.deepEqual(LIVERIES.slice(1).map((l) => l.id).sort(), [...named].sort());
  assert.equal(named.includes(LIVERIES[0].id), false, 'the house paint is earned, not given');
  for (const l of LIVERIES) {
    assert.ok(Number.isInteger(l.vinyl) && l.vinyl >= 0 && l.vinyl <= 0xffffff, `${l.id} vinyl`);
    assert.ok(Number.isInteger(l.chrome) && l.chrome >= 0 && l.chrome <= 0xffffff, `${l.id} chrome`);
  }
});

test('a part flown whole earns its livery once, and a part marked known earns none', () => {
  const p = emptyProgress();
  const c1 = partById('c1');
  const said = c1.lessons.map((id) => finish(p, id, 'bronze').livery);
  assert.deepEqual(said, [...c1.lessons.slice(0, -1).map(() => null), 'hover']);
  assert.equal(finish(p, c1.lessons[0], 'gold').livery, null, 'a better medal earns it again');
  assert.deepEqual(liveriesEarned(p), ['hover']);
  markKnown(p, 'c2');
  assert.deepEqual(liveriesEarned(p), ['hover'], 'known is not flown');
  flyPart(p, 'c2');
  assert.deepEqual(liveriesEarned(p), ['hover', 'navigator']);
  const failed = recordRun(p, 'c3-1', { complete: false });
  assert.equal(failed.livery, null);
});

test('the title is kept on a key of its own when the career saves, as a number a room can send', () => {
  assert.deepEqual([...TITLE_IDS].sort(), Object.keys(TITLES).sort());
  for (const id of TITLE_IDS) {
    assert.equal(titleWords(titleNumber(id)), TITLES[id]);
    assert.ok(titleNumber(id) >= 1 && titleNumber(id) <= 31, 'a room carries 0 to 31');
  }
  for (const n of [0, -1, 99, 2.5, null, undefined, '2']) {
    assert.equal(titleWords(n), '', `${n} is no title`);
  }
  const s = fakeStorage();
  assert.equal(savedTitleNumber(s), 0, 'never opened is no title');
  const p = emptyProgress();
  saveProgress(p, s);
  assert.equal(s.getItem(TITLE_KEY), 'student');
  trunk(p);
  saveProgress(p, s);
  assert.equal(s.getItem(TITLE_KEY), titleOf(p));
  assert.equal(titleWords(savedTitleNumber(s)), 'Rookie');
  assert.equal(savedTitleNumber(fakeStorage({ [TITLE_KEY]: 'admiral' })), 0, 'a word this build does not know');
  assert.equal(savedTitleNumber({ getItem: () => { throw new Error('no'); } }), 0);
});
