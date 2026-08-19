/*
 * figures.js: how a stacked gate is flown.
 *
 * A double or triple stack is one structure and several openings. Each
 * opening is a pass of its own. The AUTHOR chooses the figure, and this
 * file writes the flying order that figure means: which hole, in which
 * order, from which face.
 *
 *   spiral up     bottom to top, wrapping around the stack, each pass from
 *                 the SAME face. You climb; you do not reverse.
 *   spiral down   top to bottom, wrapping around, each pass from the
 *                 opposite face of the one before. That is what makes it
 *                 a different figure from flying a spiral up in reverse.
 *   split-S       through the top, invert, back through the bottom the
 *                 other way. On a triple the middle opening is skipped.
 *   one opening   a single hole, which is how a stack is placed
 *
 * The sequence is the source of truth. A figure is detected by reading the
 * entries, not stored as a second copy of them, so a track file from before
 * this file existed still round trips and a hand edit that leaves the plan
 * still matches the button.
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

import { KIND, TUNING } from './elements.js';
import {
  aperturesOf, apertureCenter, createSequenceEntry, elementById, elementNormal, kindOf,
} from './model.js';
import { applyAutoFaces } from './faces.js';
import { add, leftOf, lerp, normalize, scale, sub } from './geometry.js';

export const FIGURES = {
  single: {
    id: 'single',
    label: 'One opening',
    hint: 'One hole counts. The others are scenery. Pick which hole below.',
  },
  spiralUp: {
    id: 'spiralUp',
    label: 'Spiral up',
    hint: 'Each hole is its own gate. Bottom first, wrap around the side, then the next hole from the same face.',
  },
  spiralDown: {
    id: 'spiralDown',
    label: 'Spiral down',
    hint: 'Each hole is its own gate. Top first, wrap around the side, then the next hole down from the other face.',
  },
  splitS: {
    id: 'splitS',
    label: 'Split-S',
    hint: 'Two gates. Through the top, invert, back through the bottom the other way. A triple skips the middle.',
  },
};

export function defaultFigure(el) {
  return aperturesOf(el).length >= 2 ? 'spiralUp' : 'single';
}

export function figureBlurb(el, figureId) {
  const n = aperturesOf(el).length;
  if (figureId === 'spiralUp') {
    return n === 2
      ? 'Two gates. Fly the bottom, wrap around the side, then the top from the same face.'
      : 'Three gates. Bottom, wrap, middle from the same face, wrap, then the top.';
  }
  if (figureId === 'spiralDown') {
    return 'Three gates. Top, wrap, middle from the other face, wrap, then the bottom.';
  }
  if (figureId === 'splitS') {
    return n === 2
      ? 'Two gates. Through the top, flip, back through the bottom the other way.'
      : 'Two gates. Through the top, flip, back through the bottom. The middle hole does not count.';
  }
  return n > 1
    ? 'One gate. Only the hole you pick below counts; the rest are just the frame.'
    : '';
}

export function figuresFor(el) {
  const n = aperturesOf(el).length;
  if (n < 2) {
    return [FIGURES.single];
  }
  const out = [FIGURES.spiralUp, FIGURES.splitS];
  if (n >= 3) {
    out.push(FIGURES.spiralDown);
  }
  out.push(FIGURES.single);
  return out;
}

export function levelName(el, index) {
  const n = aperturesOf(el).length;
  const i = Math.max(0, Math.min(n - 1, Math.round(index ?? 0)));
  if (n === 2) {
    return i === 0 ? 'bottom' : 'top';
  }
  if (n === 3) {
    return ['bottom', 'middle', 'top'][i];
  }
  return `level ${i + 1}`;
}

/*
 * The openings and faces a figure writes, given which way the FIRST pass
 * should go. approach +1 is along the structure's normal.
 */
export function figurePlan(el, figureId, approach = 1) {
  const n = aperturesOf(el).length;
  const sign = approach < 0 ? -1 : 1;
  if (figureId === 'spiralUp' && n >= 2) {
    const out = [];
    for (let i = 0; i < n; i += 1) {
      out.push({ apertureIndex: i, entry: sign });
    }
    return out;
  }
  if (figureId === 'spiralDown' && n >= 3) {
    const out = [];
    for (let k = 0; k < n; k += 1) {
      out.push({ apertureIndex: n - 1 - k, entry: k % 2 === 0 ? sign : -sign });
    }
    return out;
  }
  if (figureId === 'splitS' && n >= 2) {
    return [
      { apertureIndex: n - 1, entry: sign },
      { apertureIndex: 0, entry: -sign },
    ];
  }
  return [{ apertureIndex: 0, entry: sign }];
}

function plansMatch(seqs, plan) {
  if (seqs.length !== plan.length) {
    return false;
  }
  for (let i = 0; i < plan.length; i += 1) {
    if ((seqs[i].apertureIndex ?? 0) !== plan[i].apertureIndex) {
      return false;
    }
    const got = seqs[i].entry;
    if (got !== 1 && got !== -1) {
      return false;
    }
    if (got !== plan[i].entry) {
      return false;
    }
  }
  return true;
}

/*
 * Tracks written when spiral up meant alternating faces. Those files still
 * load; this rewrites a run that is the old plan into the current one, same
 * holes, same first-pass sign, every hole now entered from that face.
 *
 * Spiral down was briefly written as the same face too, which made it a
 * spiral up flown backwards. Those runs are rewritten to alternating faces.
 *
 * IT LEAVES A RUN ALONE IF THE AUTHOR HAS TOUCHED ANY OF ITS FACES, and that
 * is not a nicety, it is the whole difference between a migration and data
 * loss.
 *
 * This recognises an old file by its SHAPE, because the old spelling was
 * never given a schema version to key off. The trouble is that the shape it
 * looks for, a stack whose passes alternate faces, is also exactly what an
 * author gets by building a spiral up and then pressing Flip face on one
 * pass. Reported: a triple stack with the middle pass reversed by hand read
 * correctly in the builder, "enter from the front", and flew from the back
 * in the game. src/game/trackdoc.js runs this on EVERY conversion of a
 * document into a course, so the rewrite happened again on every single
 * load and the author could never make it stick.
 *
 * `overridden` separates the two cleanly. An old file's stack was sequenced
 * with addNextLevel and its faces were derived by applyAutoFaces, which
 * leaves the flag false. Every deliberate face in this build carries it:
 * applyFigure sets it on every pass it writes, and flipFace sets it on the
 * pass it turns. So a run with the flag anywhere in it is a statement, not a
 * spelling, and this leaves it exactly as the author wrote it.
 */
export function upgradeStackedFigures(doc) {
  let i = 0;
  let changed = false;
  while (i < doc.sequence.length) {
    const seq = doc.sequence[i];
    const el = elementById(doc, seq.elementId);
    if (!el || kindOf(el) !== KIND.APERTURE) {
      i += 1;
      continue;
    }
    const run = [];
    while (i < doc.sequence.length && doc.sequence[i].elementId === seq.elementId) {
      run.push(doc.sequence[i]);
      i += 1;
    }
    const n = aperturesOf(el).length;
    if (n < 2 || run.length < 2) {
      continue;
    }
    /* The author has said which way through at least one of these holes.
     * Whatever this run looks like, it is not an old file's spelling. */
    if (run.some((s) => s.overridden)) {
      continue;
    }
    const approach = run[0].entry === -1 ? -1 : 1;
    const oldUp = [];
    for (let k = 0; k < n; k += 1) {
      oldUp.push({ apertureIndex: k, entry: k % 2 === 0 ? approach : -approach });
    }
    if (plansMatch(run, oldUp)) {
      for (const s of run) {
        s.entry = approach;
      }
      changed = true;
      continue;
    }
    if (n >= 3) {
      const sameDown = [];
      for (let k = 0; k < n; k += 1) {
        sameDown.push({ apertureIndex: n - 1 - k, entry: approach });
      }
      if (plansMatch(run, sameDown)) {
        for (let k = 0; k < run.length; k += 1) {
          run[k].entry = k % 2 === 0 ? approach : -approach;
        }
        changed = true;
      }
    }
  }
  return changed;
}

/*
 * Which named figure the consecutive sequence entries on this element
 * already are, or null when they are a hand mix. Split-S is tested before
 * spiral down because on a double stack they are the same two holes and
 * Split-S is the name a pilot uses for that dive.
 */
export function matchingFigureOf(el, seqs) {
  if (!seqs.length) {
    return null;
  }
  const approach = seqs[0].entry === -1 ? -1 : 1;
  const order = ['splitS', 'spiralUp', 'spiralDown', 'single'];
  for (const id of order) {
    if (plansMatch(seqs, figurePlan(el, id, approach))) {
      return id;
    }
  }
  return null;
}

export function matchingFigure(doc, el) {
  return matchingFigureOf(el, consecutiveEntries(doc, el.id));
}

/* The consecutive entries around this one that share its structure. A
 * ladder flown early as a spiral and again late as a single opening is two
 * figures; this returns the run the given entry belongs to. */
export function runContaining(doc, seq) {
  const at = doc.sequence.findIndex((s) => s.id === seq.id);
  if (at < 0) {
    return [];
  }
  const id = seq.elementId;
  let i = at;
  while (i > 0 && doc.sequence[i - 1].elementId === id) {
    i -= 1;
  }
  const out = [];
  for (; i < doc.sequence.length && doc.sequence[i].elementId === id; i += 1) {
    out.push(doc.sequence[i]);
  }
  return out;
}

/* The run of sequence entries on this element that sit next to each other,
 * starting at the first one. A ladder flown early and again late is two
 * figures, and only the first run is the one the inspector is editing. */
export function consecutiveEntries(doc, elementId) {
  const first = doc.sequence.find((s) => s.elementId === elementId);
  return first ? runContaining(doc, first) : [];
}

export function figureCueOf(el, seq, seqs) {
  const fig = matchingFigureOf(el, seqs);
  const level = levelName(el, seq.apertureIndex);
  if (!fig || fig === 'single') {
    const n = aperturesOf(el).length;
    return n > 1 ? level : '';
  }
  return `${FIGURES[fig].label}, ${level}`;
}

export function figureCue(doc, el, seq) {
  return figureCueOf(el, seq, runContaining(doc, seq));
}

/*
 * Rewrite this element's run in the flying order to match a figure.
 * Returns true when it did.
 */
export function applyFigure(doc, elementId, figureId) {
  const el = elementById(doc, elementId);
  if (!el || kindOf(el) !== KIND.APERTURE) {
    return false;
  }
  if (!figuresFor(el).some((f) => f.id === figureId)) {
    return false;
  }
  const existing = [];
  doc.sequence.forEach((s, i) => {
    if (s.elementId === elementId) {
      existing.push({ s, i });
    }
  });
  /* A stack flown twice, early and late, should only rewrite the FIRST run.
   * Replacing every entry would collapse the second pass. */
  const run = [];
  if (existing.length) {
    const start = existing[0].i;
    for (const row of existing) {
      if (row.i === start + run.length) {
        run.push(row);
      } else {
        break;
      }
    }
  }
  const insertAt = run.length ? run[0].i : doc.sequence.length;
  const keepLevel = run[0]?.s.apertureIndex ?? 0;
  const approach = run[0]?.s.entry === -1 ? -1 : 1;
  for (let k = run.length - 1; k >= 0; k -= 1) {
    doc.sequence.splice(run[k].i, 1);
  }
  const plan = figureId === 'single'
    ? [{ apertureIndex: Math.min(keepLevel, aperturesOf(el).length - 1), entry: approach }]
    : figurePlan(el, figureId, approach);
  /* Insert one at a time so newSequenceId sees the previous id. Building
   * the batch off to the side reused sq-N for every pass. */
  let at = insertAt;
  for (const step of plan) {
    const entry = createSequenceEntry(doc, elementId, step.apertureIndex);
    entry.entry = step.entry;
    entry.overridden = figureId !== 'single';
    doc.sequence.splice(at, 0, entry);
    at += 1;
  }
  applyAutoFaces(doc);
  return true;
}

/*
 * Where the racing line goes BETWEEN two stacked passes, so it wraps around
 * the structure instead of climbing through the PVC.
 *
 * A split-S (a leap from the top to the bottom, or a double stack flown
 * downward) loops out in front, along the first pass's travel. A spiral
 * step between neighbouring levels loops out to the left of that travel,
 * which is the helix.
 */
export function wrapBetween(el, seqA, seqB) {
  const a = apertureCenter(el, seqA.apertureIndex ?? 0);
  const b = apertureCenter(el, seqB.apertureIndex ?? 0);
  const mid = lerp(a, b, 0.5);
  const travel = scale(elementNormal(el), seqA.entry === -1 ? -1 : 1);
  const i0 = seqA.apertureIndex ?? 0;
  const i1 = seqB.apertureIndex ?? 0;
  const n = aperturesOf(el).length;
  const leap = Math.abs(i0 - i1) > 1 || (n === 2 && i0 > i1);
  const reach = TUNING.stackWrap;
  const offset = leap ? scale(normalize(travel), reach) : scale(leftOf(travel), reach);
  const pos = add(mid, offset);
  const tangent = normalize(sub(b, a), travel);
  return { pos, tangent };
}
