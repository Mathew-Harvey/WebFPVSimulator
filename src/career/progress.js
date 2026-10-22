/*
 * progress.js: what the pilot has done in the career, kept.
 *
 * Its own storage key and its own shape, because the shell's settings
 * loader drops any key it does not know (src/ui/ui.js loadSettings), and a
 * career that forgot itself on the next boot would be no career at all. The
 * key starts with "webfpv", so the desktop shell mirrors it to the save file
 * Steam Cloud carries (desktop/saves.cjs).
 *
 * THE RULES OF THE ROAD. Chapter one is open. A chapter opens when every
 * lesson of the chapter before has been finished. Inside a chapter the
 * lessons open one after another. A pilot who already flies can open every
 * chapter at once from the hub; that choice is kept here too, and it is a
 * choice, not a cheat: medals are still earned one run at a time.
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

import { CHAPTERS } from './curriculum.js';
import { MEDAL_RANK } from './objectives.js';

export const PROGRESS_KEY = 'webfpv.career.v1';

export function emptyProgress() {
  return { v: 1, lessons: {}, openAll: false, last: null, runs: 0, finishedAt: null };
}

/* Read, never throwing: a corrupt entry is a fresh career, not a crash. */
export function loadProgress(storage = globalThis.localStorage) {
  try {
    const raw = storage ? storage.getItem(PROGRESS_KEY) : null;
    if (!raw) {
      return emptyProgress();
    }
    const p = JSON.parse(raw);
    if (!p || p.v !== 1 || typeof p.lessons !== 'object') {
      return emptyProgress();
    }
    return { ...emptyProgress(), ...p };
  } catch (e) {
    return emptyProgress();
  }
}

export function saveProgress(p, storage = globalThis.localStorage) {
  try {
    if (storage) {
      storage.setItem(PROGRESS_KEY, JSON.stringify(p));
    }
    return true;
  } catch (e) {
    return false;
  }
}

export function lessonRecord(p, id) {
  return p.lessons[id] || null;
}

export function lessonDone(p, id) {
  const r = p.lessons[id];
  return Boolean(r && r.medal);
}

export function chapterDone(p, chapter) {
  return chapter.lessons.every((l) => lessonDone(p, l.id));
}

export function chapterUnlocked(p, index) {
  if (index <= 0 || p.openAll) {
    return true;
  }
  return chapterDone(p, CHAPTERS[index - 1]);
}

export function lessonUnlocked(p, lessonId) {
  for (let ci = 0; ci < CHAPTERS.length; ci += 1) {
    const lessons = CHAPTERS[ci].lessons;
    const li = lessons.findIndex((l) => l.id === lessonId);
    if (li < 0) {
      continue;
    }
    if (!chapterUnlocked(p, ci)) {
      return false;
    }
    if (p.openAll || li === 0) {
      return true;
    }
    return lessonDone(p, lessons[li - 1].id) || lessonDone(p, lessonId);
  }
  return false;
}

/* Medal counts and how far through the career the pilot is. */
export function totals(p) {
  const out = { gold: 0, silver: 0, bronze: 0, done: 0, total: 0, chapters: 0 };
  for (const c of CHAPTERS) {
    let all = true;
    for (const l of c.lessons) {
      out.total += 1;
      const r = p.lessons[l.id];
      if (r && r.medal) {
        out.done += 1;
        out[r.medal] += 1;
      } else {
        all = false;
      }
    }
    if (all) {
      out.chapters += 1;
    }
  }
  return out;
}

/*
 * Record a finished or failed run. Returns what changed, for the results
 * screen and the achievements: whether this was the first finish, a better
 * medal, a better time, and which chapter it opened, if any.
 */
export function recordRun(p, lessonId, { complete, ms, medal, score }, now = new Date()) {
  p.runs = (p.runs || 0) + 1;
  p.last = lessonId;
  const prev = p.lessons[lessonId] || { runs: 0 };
  const rec = { ...prev, runs: (prev.runs || 0) + 1 };
  const out = {
    firstFinish: false, betterMedal: false, betterTime: false, betterScore: false, opened: null, previous: prev.medal || null,
  };
  if (complete && medal) {
    const ci = CHAPTERS.findIndex((c) => c.lessons.some((l) => l.id === lessonId));
    const openedBefore = ci + 1 < CHAPTERS.length ? chapterUnlocked(p, ci + 1) : true;
    if (!prev.medal) {
      out.firstFinish = true;
      rec.firstAt = now.toISOString();
    }
    if (!prev.medal || MEDAL_RANK[medal] > MEDAL_RANK[prev.medal]) {
      out.betterMedal = Boolean(prev.medal);
      rec.medal = medal;
    }
    if (Number.isFinite(ms) && (!Number.isFinite(prev.bestMs) || ms < prev.bestMs)) {
      out.betterTime = Number.isFinite(prev.bestMs);
      rec.bestMs = ms;
    }
    if (Number.isFinite(score) && (!Number.isFinite(prev.bestScore) || score > prev.bestScore)) {
      out.betterScore = Number.isFinite(prev.bestScore);
      rec.bestScore = score;
    }
    p.lessons[lessonId] = rec;
    if (!openedBefore && ci + 1 < CHAPTERS.length && chapterUnlocked(p, ci + 1)) {
      out.opened = CHAPTERS[ci + 1].id;
    }
    if (!p.finishedAt && totals(p).done === totals(p).total) {
      p.finishedAt = now.toISOString();
      out.careerFinished = true;
    }
  } else {
    p.lessons[lessonId] = rec;
  }
  return out;
}
