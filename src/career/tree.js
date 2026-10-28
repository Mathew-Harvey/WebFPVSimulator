/*
 * tree.js: the career's skill tree, as data.
 *
 * The owner, 2026-10-28: "design a skill tree around this that you build
 * out, freestyle or race focus once the beginner skills are complete ...
 * the main game should be a satisfying progression for beginners". So the
 * lessons (./curriculum.js, which stays the one place a lesson is written)
 * are laid out here as PARTS on a tree:
 *
 *   THE TRUNK, Learn to fly: First Hover, Angle Navigation and Switching to
 *   Acro, flown in order, then the Rookie Licence, one checkride.
 *
 *   TWO BRANCHES that the licence opens together, Race and Freestyle. A
 *   branch's parts open when the parts they grow from are passed (three
 *   lessons of a part flown), so nobody is stuck behind one lesson they do
 *   not like, and each branch ends in a licence of its own.
 *
 *   THE CROWN, WebFPV Pro, the old Checkride, which both licences open.
 *
 * A part names its lessons by id, so a lesson's id, its medal and its best
 * time mean the same thing they always did, and a save from before the tree
 * still reads. A part marked `soon` is drawn on the tree as the next issue
 * (the manga's "to be continued") and holds no lessons yet: it opens
 * nothing and nothing waits for it.
 *
 * WHERE A PART SITS: `col` and `row` on a five by seven grid, column 2 the
 * trunk, 0 and 1 the race side, 3 and 4 the freestyle side, row 0 the top.
 * The screens draw the tree from these and nothing else.
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

/* The branches, in the order the tree and the cover name them. `ink` is the
 * colour a branch's parts wear along their top edge. */
export const BRANCHES = Object.freeze({
  trunk: { id: 'trunk', title: 'Learn to fly', ink: '#7dffb4' },
  race: { id: 'race', title: 'Race', ink: '#ffd45c' },
  freestyle: { id: 'freestyle', title: 'Freestyle', ink: '#e8a8b8' },
  crown: { id: 'crown', title: 'WebFPV Pro', ink: '#f3ead4' },
});

/* How many lessons of a part open the parts that grow from it. A part with
 * fewer lessons than this has to be flown whole. */
export const PASS_COUNT = 3;

const lessonsOf = (chapterId) => {
  const c = CHAPTERS.find((x) => x.id === chapterId);
  return c ? c.lessons.map((l) => l.id) : [];
};

const blurbOf = (chapterId) => {
  const c = CHAPTERS.find((x) => x.id === chapterId);
  return c ? c.blurb : '';
};

/*
 * THE PARTS. `after` is what a part grows from: every one of them passed
 * (or, on the trunk, finished) opens it. `strict` parts open their lessons
 * one after another, the way the beginner lessons build on each other; in
 * any other part every lesson is open once the part is. `livery` is the
 * paint a part earns when every lesson of it has been flown
 * (src/render/livery.js, and the Paint Shop in ./screens.js).
 */
export const PARTS = Object.freeze([
  /* The trunk. */
  {
    id: 'c1', livery: 'hover', branch: 'trunk', title: 'First Hover', short: 'Angle mode, lift off to touchdown',
    lessons: lessonsOf('c1'), blurb: blurbOf('c1'), after: [], strict: true, col: 2, row: 6,
  },
  {
    id: 'c2', livery: 'navigator', branch: 'trunk', title: 'Angle Navigation', short: 'Rings, poles and a first lap',
    lessons: lessonsOf('c2'), blurb: blurbOf('c2'), after: ['c1'], strict: true, col: 2, row: 5,
  },
  {
    id: 'c3', livery: 'acro', branch: 'trunk', title: 'Switching to Acro', short: 'No more self levelling',
    lessons: lessonsOf('c3'), blurb: blurbOf('c3'), after: ['c2'], strict: true, col: 2, row: 4,
  },
  {
    id: 'rk', livery: 'rookie', branch: 'trunk', title: 'Rookie Licence', short: 'One checkride, then pick a way',
    lessons: lessonsOf('rk'), blurb: blurbOf('rk'), after: ['c3'], strict: true, licence: true, col: 2, row: 3,
  },

  /* Race. */
  {
    id: 'c7', livery: 'gatekeeper', branch: 'race', title: 'Gates', short: 'Out and back to hairpins',
    lessons: lessonsOf('c7'), blurb: blurbOf('c7'), after: ['rk'], col: 1, row: 3,
  },
  {
    id: 'c8', livery: 'podium', branch: 'race', title: 'Racing', short: 'Three laps of the official tracks',
    lessons: lessonsOf('c8'), blurb: blurbOf('c8'), after: ['c7'], col: 1, row: 2,
  },
  {
    id: 'race-craft', livery: 'holeshot', branch: 'race', title: 'Race Craft', short: 'Starts, lines and a ghost to beat',
    lessons: lessonsOf('rc'), blurb: blurbOf('rc'), after: ['c7'], col: 0, row: 2,
  },
  {
    id: 'real-tracks', livery: 'race-night', branch: 'race', title: 'Real Tracks', short: 'Race nights from the board',
    lessons: lessonsOf('rt'), blurb: blurbOf('rt'), after: ['c8'], col: 1, row: 1,
  },
  {
    id: 'whoop-league', livery: 'tiny-whoop', branch: 'race', title: 'Whoop League', short: 'Tiny gates, indoors',
    lessons: lessonsOf('wl'), blurb: blurbOf('wl'), after: ['race-craft'], col: 0, row: 1,
  },
  {
    id: 'race-licence', livery: 'pro-racer', branch: 'race', title: 'Pro Race Licence', short: 'The Championship',
    lessons: ['10-4'], blurb: 'Five laps of the Grand Prix, the longest official track. Fly it clean and you race for a living.',
    after: 'branch', licence: true, col: 0, row: 0, span: 2,
  },

  /* Freestyle. */
  {
    id: 'c4', livery: 'gap-hunter', branch: 'freestyle', title: 'Big Gaps', short: 'Containers, bridges, a building',
    lessons: lessonsOf('c4'), blurb: blurbOf('c4'), after: ['rk'], col: 3, row: 3,
  },
  {
    id: 'c5', livery: 'flipper', branch: 'freestyle', title: 'Flips and Rolls', short: 'First flip to doubles',
    lessons: lessonsOf('c5'), blurb: blurbOf('c5'), after: ['rk'], col: 4, row: 3,
  },
  {
    id: 'c6', livery: 'segment', branch: 'freestyle', title: 'Segmented', short: 'Knife edges and hangs',
    lessons: lessonsOf('c6'), blurb: blurbOf('c6'), after: ['c5'], col: 4, row: 2,
  },
  {
    id: 'proximity', livery: 'proximity', branch: 'freestyle', title: 'Proximity', short: 'Trees, gardens and the town',
    lessons: lessonsOf('px'), blurb: blurbOf('px'), after: ['c4'], col: 3, row: 2,
  },
  {
    id: 'c9', livery: 'hibari', branch: 'freestyle', title: 'Hibari Yard Tricks', short: 'Powerloop, Split-S, Matty Flip',
    lessons: lessonsOf('c9'), blurb: blurbOf('c9'), after: ['c6', 'c4'], col: 4, row: 1,
  },
  {
    id: 'lines', livery: 'lines', branch: 'freestyle', title: 'Lines', short: 'Combos, and your own line',
    lessons: lessonsOf('ln'), blurb: blurbOf('ln'), after: ['proximity'], col: 3, row: 1,
  },
  {
    id: 'freestyle-licence', livery: 'pro-freestyler', branch: 'freestyle', title: 'Pro Freestyle Licence', short: 'Gap Final and Freestyle Final',
    lessons: ['10-2', '10-3'], blurb: 'Two finals: every gap at Gap School against the clock, then a Powerloop, a Split-S and the container tunnel in one run.',
    after: 'branch', licence: true, col: 3, row: 0, span: 2,
  },

  /* The crown. */
  {
    id: 'pro', livery: 'pro', branch: 'crown', title: 'WebFPV Pro', short: 'The checkride, both licences',
    lessons: ['10-1'], blurb: 'Rings high and low, a flip, a roll, a knife edge and the pad, with no crashes. Both licences open it.',
    after: ['race-licence', 'freestyle-licence'], strict: true, licence: true, col: 2, row: 0,
  },
]);

const BY_ID = new Map(PARTS.map((p) => [p.id, p]));
const PART_OF = new Map();
for (const p of PARTS) {
  for (const id of p.lessons) {
    PART_OF.set(id, p);
  }
}

export function partById(id) {
  return BY_ID.get(id) || null;
}

/* The part a lesson is on the tree in, or null for a lesson the tree does
 * not show. */
export function partOf(lessonId) {
  return PART_OF.get(lessonId) || null;
}

/* The parts a part grows from. A licence grows from every part of its
 * branch that has lessons. */
export function parentsOf(part) {
  if (part.after === 'branch') {
    return PARTS.filter((p) => p.branch === part.branch && !p.soon && !p.licence);
  }
  return part.after.map((id) => BY_ID.get(id)).filter(Boolean);
}

/* The parts with lessons, in the order a pilot is led through them: the
 * trunk, then the branch they chose first, then the other, then the crown. */
export function partsInOrder(first = 'race') {
  const other = first === 'freestyle' ? 'race' : 'freestyle';
  const branch = (b) => PARTS.filter((p) => p.branch === b && !p.soon).sort((a, z) => (z.row - a.row) || (Math.abs(a.col - 2) - Math.abs(z.col - 2)));
  return [...branch('trunk'), ...branch(first), ...branch(other), ...branch('crown')];
}

/* Every lesson the tree shows, once each. */
export function treeLessons() {
  return PARTS.flatMap((p) => p.lessons);
}

/*
 * SET MY LEVEL: the four questions a pilot who already flies answers, and
 * the parts each yes marks as known. A yes to a branch question takes the
 * trunk with it, because nobody flips without Acro.
 */
export const LEVEL_QUESTIONS = Object.freeze([
  { id: 'hover', text: 'Can you take off, hover and land in Angle mode?', parts: ['c1', 'c2'] },
  { id: 'acro', text: 'Do you fly in Acro?', parts: ['c1', 'c2', 'c3', 'rk'] },
  { id: 'flips', text: 'Can you flip and roll?', parts: ['c1', 'c2', 'c3', 'rk', 'c5'] },
  { id: 'race', text: 'Do you race laps through gates?', parts: ['c1', 'c2', 'c3', 'rk', 'c7', 'c8'] },
]);
