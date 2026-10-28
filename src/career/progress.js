/*
 * progress.js: what the pilot has done in the career, kept.
 *
 * Its own storage key and its own shape, because the shell's settings
 * loader drops any key it does not know (src/ui/ui.js loadSettings), and a
 * career that forgot itself on the next boot would be no career at all. The
 * key starts with "webfpv", so the Steam edition's desktop shell mirrors it
 * to the save file Steam Cloud carries (the repack's desktop/saves.cjs).
 *
 * THE SHAPE, v2, the skill tree's (./tree.js):
 *
 *   lessons    { [lessonId]: { medal, bestMs, bestScore, runs, firstAt } }
 *   known      the parts the pilot said they can already fly (Set my level,
 *              or the tree's own button): they open what grows from them
 *              and earn nothing, so stars stay something flown for
 *   openAll    "Open the whole tree": every part with lessons is open
 *   first      the branch the pilot chose to start with, 'race' or
 *              'freestyle', or null until the Rookie Licence asks
 *   last       the lesson flown last; runs, the runs flown in all
 *   updatedAt  when this save last changed, for a merge to pick `last` by
 *   finishedAt when every lesson on the tree first had a medal
 *
 * A save from before the tree (v1, 'webfpv.career.v1') is read once and
 * converted: every medal and time kept, and the Rookie Licence counted as
 * known for a pilot who had already finished Switching to Acro, so nothing
 * that was open before the tree is shut by it. The v1 key is left where it
 * is, so going back to an older build loses nothing either.
 *
 * THE RULES OF THE ROAD. The trunk is flown in order, lesson by lesson. A
 * branch part is open once every part it grows from is passed: finished,
 * on the trunk, or three of its lessons, in a branch. Inside a branch part
 * every lesson is open. A licence needs every part of its branch finished.
 * A lesson with a medal is always open, whatever the rules say now.
 *
 * TWO MACHINES, ONE CAREER. mergeProgress keeps the better of two saves,
 * lesson by lesson, so a career never loses a medal to a copy that is
 * older. The Steam shell uses it at boot (MERGE_KEY below): when Steam
 * Cloud hands over a save from another machine, the shell keeps this
 * machine's career aside under MERGE_KEY and the next load folds it back
 * in. A save code (encodeSave, decodeSave) is the browser's way to carry a
 * career to another computer, and loading one merges too.
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

import { MEDAL_RANK } from './objectives.js';
import {
  LEVEL_QUESTIONS, PARTS, PASS_COUNT, parentsOf, partById, partOf, partsInOrder, treeLessons,
} from './tree.js';

export const PROGRESS_KEY = 'webfpv.career.v2';
export const PROGRESS_KEY_V1 = 'webfpv.career.v1';
/* Where the Steam shell parks this machine's career when Steam Cloud brings
 * a newer save from another machine. It does not start with "webfpv", so
 * the shell's mirror never carries it anywhere. */
export const MERGE_KEY = 'cloud-merge:webfpv.career.v2';

const MEDALS = ['bronze', 'silver', 'gold'];
/* Stars a medal is worth: finishing is one, silver two, gold three. */
export const STARS = Object.freeze({ bronze: 1, silver: 2, gold: 3 });

export function emptyProgress() {
  return {
    v: 2, lessons: {}, known: [], openAll: false, first: null, last: null, runs: 0, updatedAt: null, finishedAt: null,
  };
}

/* A lesson record, cleaned: only the fields a record has, each its kind. */
function cleanRecord(r) {
  if (!r || typeof r !== 'object') {
    return null;
  }
  const out = { runs: Number.isFinite(r.runs) && r.runs > 0 ? Math.floor(r.runs) : 0 };
  if (MEDALS.includes(r.medal)) {
    out.medal = r.medal;
  }
  if (Number.isFinite(r.bestMs) && r.bestMs > 0) {
    out.bestMs = r.bestMs;
  }
  if (Number.isFinite(r.bestScore) && r.bestScore >= 0) {
    out.bestScore = r.bestScore;
  }
  if (typeof r.firstAt === 'string') {
    out.firstAt = r.firstAt;
  }
  return out;
}

/* Any save shape this file has ever written, made a v2 save, or null. */
export function normaliseProgress(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !raw.lessons || typeof raw.lessons !== 'object' || Array.isArray(raw.lessons)) {
    return null;
  }
  if (raw.v !== 1 && raw.v !== 2) {
    return null;
  }
  const p = emptyProgress();
  for (const [id, r] of Object.entries(raw.lessons)) {
    const rec = cleanRecord(r);
    if (rec && typeof id === 'string' && id.length < 24) {
      p.lessons[id] = rec;
    }
  }
  p.openAll = Boolean(raw.openAll);
  p.last = typeof raw.last === 'string' ? raw.last : null;
  p.runs = Number.isFinite(raw.runs) && raw.runs > 0 ? Math.floor(raw.runs) : 0;
  if (raw.v === 2) {
    p.known = Array.isArray(raw.known) ? [...new Set(raw.known.filter((k) => partById(k)))] : [];
    p.first = raw.first === 'race' || raw.first === 'freestyle' ? raw.first : null;
    p.updatedAt = typeof raw.updatedAt === 'string' ? raw.updatedAt : null;
    p.finishedAt = typeof raw.finishedAt === 'string' ? raw.finishedAt : null;
  } else {
    /* From before the tree. Switching to Acro finished was the door to
     * everything after it, so the licence that is that door now is known. */
    if (partDone(p, partById('c3'))) {
      p.known.push('rk');
    }
  }
  return p;
}

function parse(text) {
  try {
    return text ? normaliseProgress(JSON.parse(text)) : null;
  } catch (e) {
    return null;
  }
}

/* Read, never throwing: a corrupt entry is a fresh career, not a crash. */
export function loadProgress(storage = globalThis.localStorage) {
  let p = null;
  try {
    if (!storage) {
      return emptyProgress();
    }
    p = parse(storage.getItem(PROGRESS_KEY));
    let changed = false;
    if (!p) {
      p = parse(storage.getItem(PROGRESS_KEY_V1));
      changed = Boolean(p);
    }
    p = p || emptyProgress();
    const parked = storage.getItem(MERGE_KEY);
    if (parked != null) {
      const other = parse(parked);
      if (other) {
        p = mergeProgress(p, other);
      }
      changed = true;
      if (typeof storage.removeItem === 'function') {
        storage.removeItem(MERGE_KEY);
      }
    }
    if (changed) {
      saveProgress(p, storage);
    }
    return p;
  } catch (e) {
    return p || emptyProgress();
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

/* ---------------------------------------------------------------- *
 * Lessons and parts.
 * ---------------------------------------------------------------- */

export function lessonRecord(p, id) {
  return p.lessons[id] || null;
}

export function lessonDone(p, id) {
  const r = p.lessons[id];
  return Boolean(r && r.medal);
}

export function partKnown(p, part) {
  return Boolean(part && p.known && p.known.includes(part.id));
}

function doneCount(p, part) {
  return part.lessons.filter((id) => lessonDone(p, id)).length;
}

/* Every lesson flown, or the part known. A part with no lessons yet is
 * never done. */
export function partDone(p, part) {
  if (!part || part.soon) {
    return false;
  }
  return partKnown(p, part) || (part.lessons.length > 0 && doneCount(p, part) === part.lessons.length);
}

/* Enough of a part to open what grows from it: the whole of a trunk part
 * or a licence, three lessons of any other. */
export function partPassed(p, part) {
  if (!part || part.soon) {
    return false;
  }
  if (partKnown(p, part)) {
    return true;
  }
  const need = part.strict ? part.lessons.length : Math.min(PASS_COUNT, part.lessons.length);
  return part.lessons.length > 0 && doneCount(p, part) >= need;
}

export function partOpen(p, part) {
  if (!part || part.soon) {
    return false;
  }
  if (p.openAll || partKnown(p, part) || part.lessons.some((id) => lessonDone(p, id))) {
    return true;
  }
  const parents = parentsOf(part);
  if (part.after === 'branch') {
    return parents.every((x) => partDone(p, x));
  }
  return parents.every((x) => partPassed(p, x));
}

export function lessonUnlocked(p, lessonId) {
  const part = partOf(lessonId);
  if (!part) {
    return false;
  }
  if (lessonDone(p, lessonId)) {
    return true;
  }
  if (!partOpen(p, part)) {
    return false;
  }
  if (!part.strict || p.openAll || partKnown(p, part)) {
    return true;
  }
  const i = part.lessons.indexOf(lessonId);
  return i === 0 || lessonDone(p, part.lessons[i - 1]);
}

/* ---------------------------------------------------------------- *
 * Stars, counts and the pilot's title.
 * ---------------------------------------------------------------- */

export function starsOf(medal) {
  return STARS[medal] || 0;
}

/* A part's numbers for the tree: lessons flown, stars, and its state. */
export function partStats(p, part) {
  let stars = 0;
  let done = 0;
  const medals = [];
  for (const id of part.lessons) {
    const r = p.lessons[id];
    const m = r && r.medal ? r.medal : null;
    medals.push(m);
    if (m) {
      done += 1;
      stars += starsOf(m);
    }
  }
  const open = partOpen(p, part);
  const complete = part.lessons.length > 0 && done === part.lessons.length;
  let state = 'locked';
  if (part.soon) {
    state = 'soon';
  } else if (complete) {
    state = 'done';
  } else if (partKnown(p, part)) {
    state = 'known';
  } else if (open) {
    state = done > 0 ? 'started' : 'open';
  }
  return {
    done, total: part.lessons.length, stars, maxStars: part.lessons.length * 3, medals, open, state,
    known: partKnown(p, part), passed: partPassed(p, part),
  };
}

/* Medal counts, stars and how far through the tree the pilot is. */
export function totals(p) {
  const out = {
    gold: 0, silver: 0, bronze: 0, done: 0, total: 0, stars: 0, maxStars: 0, parts: 0, partsTotal: 0,
  };
  for (const part of PARTS) {
    if (part.soon) {
      continue;
    }
    out.partsTotal += 1;
    let all = true;
    for (const id of part.lessons) {
      out.total += 1;
      out.maxStars += 3;
      const r = p.lessons[id];
      if (r && r.medal) {
        out.done += 1;
        out[r.medal] += 1;
        out.stars += starsOf(r.medal);
      } else {
        all = false;
      }
    }
    if (all) {
      out.parts += 1;
    }
  }
  return out;
}

/* A branch's numbers, for the cover and the fork. */
export function branchStats(p, branch) {
  const out = {
    done: 0, total: 0, stars: 0, maxStars: 0, open: false, licence: false,
  };
  for (const part of PARTS) {
    if (part.branch !== branch || part.soon) {
      continue;
    }
    const s = partStats(p, part);
    out.done += s.done;
    out.total += s.total;
    out.stars += s.stars;
    out.maxStars += s.maxStars;
    out.open = out.open || s.open;
    if (part.licence && s.state === 'done') {
      out.licence = true;
    }
  }
  return out;
}

/* Whether a licence part has been flown, every lesson of it, by the pilot
 * (a known licence is not a licence). */
function licensed(p, partId) {
  const part = partById(partId);
  return Boolean(part) && part.lessons.length > 0 && part.lessons.every((id) => lessonDone(p, id));
}

/*
 * The pilot's title, from the licences: the word on the licence card,
 * on the cover and in the results. A closed list, written here.
 */
export const TITLES = Object.freeze({
  student: 'Student pilot',
  rookie: 'Rookie',
  racer: 'Pro Racer',
  freestyler: 'Pro Freestyler',
  both: 'Pro Racer and Freestyler',
  pro: 'WebFPV Pro',
});

export function titleOf(p) {
  if (licensed(p, 'pro')) {
    return 'pro';
  }
  const race = licensed(p, 'race-licence');
  const free = licensed(p, 'freestyle-licence');
  if (race && free) {
    return 'both';
  }
  if (race) {
    return 'racer';
  }
  if (free) {
    return 'freestyler';
  }
  /* The Rookie Licence is the trunk's last part, so a pilot who said they
   * fly Acro (or finished the old Switching to Acro) is a rookie without
   * flying it; the pro titles above are flown or not at all. */
  return partDone(p, partById('rk')) ? 'rookie' : 'student';
}

/* ---------------------------------------------------------------- *
 * A run, recorded.
 * ---------------------------------------------------------------- */

function openSet(p) {
  return new Set(PARTS.filter((x) => partOpen(p, x)).map((x) => x.id));
}

/*
 * Record a finished or failed run. Returns what changed, for the results
 * screen and the platform: whether this was the first finish, a better
 * medal, time or score, the stars it added, the parts it opened, and the
 * licence it earned, if any.
 */
export function recordRun(p, lessonId, { complete, ms, medal, score }, now = new Date()) {
  p.runs = (p.runs || 0) + 1;
  p.last = lessonId;
  p.updatedAt = now.toISOString();
  const prev = p.lessons[lessonId] || { runs: 0 };
  const rec = { ...prev, runs: (prev.runs || 0) + 1 };
  const out = {
    firstFinish: false,
    betterMedal: false,
    betterTime: false,
    betterScore: false,
    opened: [],
    stars: 0,
    licence: null,
    previous: prev.medal || null,
    careerFinished: false,
  };
  if (complete && MEDALS.includes(medal)) {
    const before = openSet(p);
    const part = partOf(lessonId);
    const wasLicensed = part && part.licence ? licensed(p, part.id) : true;
    if (!prev.medal) {
      out.firstFinish = true;
      rec.firstAt = now.toISOString();
    }
    if (!prev.medal || MEDAL_RANK[medal] > MEDAL_RANK[prev.medal]) {
      out.betterMedal = Boolean(prev.medal);
      out.stars = starsOf(medal) - starsOf(prev.medal);
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
    const after = openSet(p);
    out.opened = [...after].filter((id) => !before.has(id));
    if (part && part.licence && !wasLicensed && licensed(p, part.id)) {
      out.licence = part.id;
    }
    const t = totals(p);
    if (!p.finishedAt && t.done === t.total) {
      p.finishedAt = now.toISOString();
      out.careerFinished = true;
    }
  } else {
    p.lessons[lessonId] = rec;
  }
  return out;
}

/* ---------------------------------------------------------------- *
 * Where to next.
 * ---------------------------------------------------------------- */

/* The branch the pilot is led through first: the one they chose, else the
 * one they have flown more of (a save from before the tree), else race. */
export function firstBranch(p) {
  if (p.first) {
    return p.first;
  }
  const flown = (b) => PARTS.filter((x) => x.branch === b).reduce((n, x) => n + x.lessons.filter((id) => lessonDone(p, id)).length, 0);
  return flown('freestyle') > flown('race') ? 'freestyle' : 'race';
}

/*
 * The one lesson the cover's Continue goes to: the lesson the pilot was
 * last on, if it is not finished; else the first lesson with no medal, in
 * the order the tree leads a pilot (the trunk, the branch they chose first,
 * the other, the crown), skipping parts they said they know; else the open
 * lesson whose medal could most improve. { fork: true } once the Rookie
 * Licence is passed and no branch is chosen yet; null when everything is
 * gold.
 */
export function nextUp(p) {
  if (p.last && partOf(p.last) && lessonUnlocked(p, p.last) && !lessonDone(p, p.last)) {
    return { lesson: p.last };
  }
  if (!p.first && partPassed(p, partById('rk'))) {
    const chosen = (b) => PARTS.some((x) => x.branch === b && !x.soon && x.lessons.some((id) => lessonDone(p, id)));
    if (!chosen('race') && !chosen('freestyle')) {
      return { fork: true };
    }
  }
  const order = partsInOrder(firstBranch(p));
  for (const part of order) {
    if (partKnown(p, part) || !partOpen(p, part)) {
      continue;
    }
    const id = part.lessons.find((x) => !lessonDone(p, x) && lessonUnlocked(p, x));
    if (id) {
      return { lesson: id };
    }
  }
  for (const want of ['bronze', 'silver']) {
    for (const part of order) {
      const id = part.lessons.find((x) => p.lessons[x] && p.lessons[x].medal === want);
      if (id) {
        return { lesson: id, polish: true };
      }
    }
  }
  return null;
}

/* ---------------------------------------------------------------- *
 * Filling the tree in by hand.
 * ---------------------------------------------------------------- */

export function markKnown(p, partId, on = true) {
  const part = partById(partId);
  if (!part || part.soon) {
    return false;
  }
  const has = p.known.includes(partId);
  if (on && !has) {
    p.known.push(partId);
  } else if (!on && has) {
    p.known = p.known.filter((k) => k !== partId);
  } else {
    return false;
  }
  return true;
}

/* Set my level: every yes marks its parts known. Returns the parts newly
 * marked, for the screen to say so. */
export function setLevel(p, answers) {
  const marked = [];
  for (const q of LEVEL_QUESTIONS) {
    if (!answers || !answers[q.id]) {
      continue;
    }
    for (const id of q.parts) {
      if (markKnown(p, id, true)) {
        marked.push(id);
      }
    }
  }
  return marked;
}

/* The answers that would give the tree as it stands, for the screen to
 * start from. */
export function levelAnswers(p) {
  const out = {};
  for (const q of LEVEL_QUESTIONS) {
    out[q.id] = q.parts.every((id) => partDone(p, partById(id)));
  }
  return out;
}

export function clearKnown(p) {
  const had = p.known.length > 0;
  p.known = [];
  return had;
}

/* ---------------------------------------------------------------- *
 * Two saves, one career.
 * ---------------------------------------------------------------- */

function laterOf(a, b) {
  return String(a || '') >= String(b || '') ? a : b;
}

export function mergeProgress(a, b) {
  const x = normaliseProgress(a) || emptyProgress();
  const y = normaliseProgress(b) || emptyProgress();
  const out = emptyProgress();
  const ids = new Set([...Object.keys(x.lessons), ...Object.keys(y.lessons)]);
  for (const id of ids) {
    const r = x.lessons[id] || { runs: 0 };
    const s = y.lessons[id] || { runs: 0 };
    const rec = { runs: Math.max(r.runs || 0, s.runs || 0) };
    const medal = (MEDAL_RANK[r.medal] || 0) >= (MEDAL_RANK[s.medal] || 0) ? r.medal : s.medal;
    if (medal) {
      rec.medal = medal;
    }
    const ms = [r.bestMs, s.bestMs].filter(Number.isFinite);
    if (ms.length) {
      rec.bestMs = Math.min(...ms);
    }
    const sc = [r.bestScore, s.bestScore].filter(Number.isFinite);
    if (sc.length) {
      rec.bestScore = Math.max(...sc);
    }
    const first = [r.firstAt, s.firstAt].filter(Boolean).sort();
    if (first.length) {
      rec.firstAt = first[0];
    }
    out.lessons[id] = rec;
  }
  out.known = [...new Set([...x.known, ...y.known])];
  out.openAll = x.openAll || y.openAll;
  out.runs = Math.max(x.runs, y.runs);
  const newer = laterOf(x.updatedAt, y.updatedAt) === x.updatedAt ? x : y;
  const older = newer === x ? y : x;
  out.last = newer.last || older.last;
  out.first = newer.first || older.first;
  out.updatedAt = laterOf(x.updatedAt, y.updatedAt) || null;
  const done = [x.finishedAt, y.finishedAt].filter(Boolean).sort();
  out.finishedAt = done.length ? done[0] : null;
  return out;
}

/* ---------------------------------------------------------------- *
 * Save codes: a career as one line of text a pilot can copy.
 * ---------------------------------------------------------------- */

const CODE_PREFIX = 'WFPV2';

function fnv(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36).padStart(7, '0');
}

function b64url(text) {
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unb64url(text) {
  const s = text.replace(/-/g, '+').replace(/_/g, '/');
  return atob(s + '='.repeat((4 - (s.length % 4)) % 4));
}

/* Lessons as [id, medal letter, best ms, best score, runs], and the rest
 * as short keys: small enough to paste into a chat. */
export function encodeSave(p) {
  const rows = Object.entries(p.lessons)
    .filter(([, r]) => r && (r.medal || r.runs))
    .map(([id, r]) => [id, r.medal ? r.medal[0] : '', Math.round(r.bestMs || 0), Math.round(r.bestScore || 0), r.runs || 0]);
  const body = JSON.stringify({
    l: rows, k: p.known, o: p.openAll ? 1 : 0, f: p.first || '', a: p.last || '', r: p.runs || 0,
  });
  const data = b64url(body);
  return `${CODE_PREFIX}-${data}-${fnv(data)}`;
}

/* A pasted code, made a save, or null for anything that is not one. Spaces
 * and line breaks a chat app put in are ignored. */
export function decodeSave(code) {
  try {
    const text = String(code || '').replace(/\s+/g, '');
    const m = /^WFPV2-([A-Za-z0-9_-]+)-([0-9a-z]{7})$/.exec(text);
    if (!m || fnv(m[1]) !== m[2]) {
      return null;
    }
    const body = JSON.parse(unb64url(m[1]));
    if (!body || !Array.isArray(body.l)) {
      return null;
    }
    const letter = { b: 'bronze', s: 'silver', g: 'gold' };
    const lessons = {};
    const known = new Set(treeLessons());
    for (const row of body.l) {
      if (!Array.isArray(row) || typeof row[0] !== 'string' || !known.has(row[0])) {
        continue;
      }
      const [id, medal, ms, score, runs] = row;
      lessons[id] = {
        runs: Number(runs) || 0,
        ...(letter[medal] ? { medal: letter[medal] } : {}),
        ...(Number(ms) > 0 ? { bestMs: Number(ms) } : {}),
        ...(Number(score) > 0 ? { bestScore: Number(score) } : {}),
      };
    }
    return normaliseProgress({
      v: 2,
      lessons,
      known: Array.isArray(body.k) ? body.k : [],
      openAll: Boolean(body.o),
      first: body.f || null,
      last: body.a || null,
      runs: Number(body.r) || 0,
      updatedAt: null,
    });
  } catch (e) {
    return null;
  }
}

/* The numbered chapters a pilot reads in the old order, kept for the Steam
 * shell's chapter achievements, which count by chapter id. */
export function chapterDone(p, chapter) {
  return chapter.lessons.every((l) => lessonDone(p, l.id));
}
