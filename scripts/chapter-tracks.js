/*
 * chapter-tracks.js: six original five inch race tracks at club size, for the builder's shipped list.
 *
 * WHY THESE. A league's club tracks fit a 60 by 30 m field and are built from one small kit: 5 ft gates, a double,
 * a triple stack, a dive gate, a hurdle and a handful of flags. That is why their laps are short, flow, and can be
 * set out on any club's field in an hour. The builder shipped one five inch track (the Nationals qualifier, which is
 * somebody else's design), and most five inch tracks on the board are drills. These are ours: original layouts in
 * that kit and that box, each built around one idea a pilot can name (a sweeper, a crossover, a dive, a slalom,
 * hairpins, a split-S), so the board can mark them official and a club can build them. The owner's pick of
 * 2026-11-03, item 2 of the 5 inch race pass (PROGRESS.md).
 *
 * THE FRAME. Every step is in metres inside the 60 by 30 m box, x east and y north from its south west corner, and
 * the box sits 2 m in from the edge of a 64 by 34 m field. A gate faces along the line, from the step before it to
 * the step after it, and is flown that way unless the step says `back`. A double or a triple stack is flown through
 * the `level` named. A flag is passed on the outside of the turn unless `side` says otherwise. A `wp` is a point the
 * line is held to, with its height. A step with a `name` that comes back is the same structure flown again.
 *
 * Read by scripts/mission-preset.js, which writes them into src/trackbuilder/presets5.js after the Nationals
 * qualifier. Edit here and run that script; do not edit presets5.js by hand.
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

import { createElement, createTrack, toPlain } from '../src/trackbuilder/model.js';
import { addToSequence } from '../src/trackbuilder/sequence.js';
import { applyAutoFaces } from '../src/trackbuilder/faces.js';
import { placeHurdle, setFlags } from '../src/trackbuilder/parts.js';

const FIELD = { width: 64, depth: 34 };
const MARGIN = 2;
const STAMP = '2026-11-03T00:00:00Z';
const TYPE = {
  gate: 'gate', flagged: 'flaggedGate', double: 'doubleStack', ladder: 'ladder', dive: 'diveGate', flag: 'flag',
};

const LAYOUTS = [
  {
    id: 'chapter-1-sweeper', name: 'Chapter 1: Sweeper',
    note: 'The first one to fly: long sweepers, two flag hairpins, a double to climb and a hurdle to skim.',
    pads: [6, 6], lap: [
      { g: 'gate', at: [12, 6], name: 'Start' },
      { g: 'gate', at: [26, 5] },
      { g: 'hurdle', at: [36, 5] },
      { g: 'gate', at: [46, 6] },
      { g: 'flag', at: [56, 11] },
      { g: 'gate', at: [48, 17] },
      { g: 'double', at: [36, 22], level: 1 },
      { g: 'gate', at: [22, 25] },
      { g: 'flag', at: [9, 26] },
      { g: 'gate', at: [6, 16] },
    ],
  },
  {
    id: 'chapter-2-crossover', name: 'Chapter 2: Crossover',
    note: 'A figure of eight. The line crosses itself in the middle: through the bottom of the double on one pass and over its top on the other.',
    pads: [4, 4], lap: [
      { g: 'gate', at: [10, 5], name: 'Start' },
      { g: 'gate', at: [22, 9] },
      { g: 'double', at: [30, 15], level: 0, name: 'Mid double' },
      { g: 'gate', at: [40, 21] },
      { g: 'flag', at: [54, 24] },
      { g: 'gate', at: [56, 13] },
      { g: 'flag', at: [50, 4] },
      { g: 'gate', at: [40, 8] },
      { wp: [30, 15, 4.4], name: 'Over the double' },
      { g: 'gate', at: [21, 22] },
      { g: 'flag', at: [7, 26] },
      { g: 'gate', at: [4, 15] },
    ],
  },

  {
    id: 'chapter-3-tower-dive', name: 'Chapter 3: Tower Dive',
    note: 'Climb the far end, dive the gate on the poles, and carry the speed back down the long side.',
    pads: [5, 25], lap: [
      { g: 'gate', at: [11, 25], name: 'Start' },
      { g: 'gate', at: [25, 26] },
      { g: 'flagged', at: [38, 24], flags: 'right' },
      { wp: [50, 22, 5], name: 'Climb' },
      { wp: [55, 15, 7], name: 'Top' },
      { wp: [49, 9, 7], name: 'Over the dive' },
      { g: 'dive', at: [42, 9] },
      { g: 'gate', at: [30, 5] },
      { g: 'flag', at: [22, 11] },
      { g: 'gate', at: [14, 5] },
      { g: 'flag', at: [4, 6] },
      { g: 'gate', at: [6, 16] },
    ],
  },

  {
    id: 'chapter-4-ladder-slalom', name: 'Chapter 4: Ladder Slalom',
    note: 'Four rows: a double along the bottom, a flag slalom back, the top of the ladder, and a fast run home.',
    pads: [4, 4], lap: [
      { g: 'gate', at: [9, 4], name: 'Start' },
      { g: 'double', at: [24, 4], level: 0 },
      { g: 'gate', at: [40, 4] },
      { g: 'flag', at: [55, 7] },
      { g: 'flag', at: [44, 12] },
      { g: 'flag', at: [36, 10] },
      { g: 'flag', at: [28, 12] },
      { g: 'flag', at: [20, 10] },
      { g: 'flag', at: [10, 14] },
      { g: 'gate', at: [18, 18] },
      { g: 'ladder', at: [33, 18], level: 2 },
      { g: 'gate', at: [46, 18] },
      { g: 'flag', at: [56, 22] },
      { g: 'gate', at: [44, 26] },
      { g: 'gate', at: [28, 27] },
      { g: 'gate', at: [14, 26] },
      { g: 'flag', at: [2, 18] },
    ],
  },

  {
    id: 'chapter-5-hairpins', name: 'Chapter 5: Hairpins',
    note: 'Short and tight: rows joined by hairpins round flags, flagged gates to thread, a hurdle, and one long straight home.',
    pads: [16, 3], padsYaw: 180, lap: [
      { g: 'gate', at: [10, 3], name: 'Start' },
      { g: 'flag', at: [3, 7] },
      { g: 'gate', at: [16, 10] },
      { g: 'flagged', at: [28, 10], flags: 'left' },
      { g: 'flag', at: [38, 13] },
      { g: 'gate', at: [28, 16] },
      { g: 'flagged', at: [16, 16], flags: 'right' },
      { g: 'flag', at: [6, 20] },
      { g: 'gate', at: [18, 24] },
      { g: 'flagged', at: [34, 24], flags: 'right' },
      { g: 'gate', at: [46, 25] },
      { g: 'flag', at: [56, 20] },
      { g: 'hurdle', at: [52, 12] },
      { g: 'flag', at: [54, 4] },
      { g: 'gate', at: [40, 3] },
    ],
  },

  {
    id: 'chapter-6-split-s', name: 'Chapter 6: Split-S',
    note: 'Over the top of the double and back down through its bottom the other way: a split-S, then a fast lap of the field.',
    pads: [4, 6], lap: [
      { g: 'gate', at: [10, 6], name: 'Start' },
      { g: 'gate', at: [24, 6] },
      { g: 'double', at: [40, 8], level: 1, name: 'Split' },
      { wp: [47, 8, 3.6], name: 'Split up' },
      { wp: [51, 9, 2.3], name: 'Split over' },
      { wp: [47, 10, 1.0], name: 'Split down' },
      { g: 'double', at: [40, 8], level: 0, name: 'Split', back: true },
      { g: 'flag', at: [30, 12] },
      { g: 'gate', at: [40, 18] },
      { g: 'flag', at: [56, 22] },
      { g: 'gate', at: [42, 27] },
      { g: 'gate', at: [24, 26] },
      { g: 'flag', at: [8, 25] },
      { g: 'gate', at: [6, 15] },
    ],
  },
];

function build(spec) {
  const doc = createTrack(spec.name, 'full');
  doc.id = spec.id;
  doc.createdUtc = STAMP;
  doc.modifiedUtc = STAMP;
  doc.field.width = FIELD.width;
  doc.field.depth = FIELD.depth;
  /* Held to a metre, as the Nationals qualifier is: a hairpin round a flag, the dive and the split-S are meant, and
   * a club line turns tighter than the 2.5 m a freeform course is warned at. The split-S still turns under it, on
   * purpose, and says so. */
  doc.settings.minCurveRadius = 1;
  doc.credit = {
    designer: 'WebFPV', series: 'WebFPV chapter tracks', sponsor: '', source: '', broughtOverBy: '', note: spec.note,
  };
  const at = (p, z = 0) => ({ x: p[0] + MARGIN, y: p[1] + MARGIN, z });
  const pts = spec.lap.map((s) => s.at || s.wp);
  /* Along the line: from the step before to the step after. Plan geometry, not physics. */
  const heading = (i) => {
    const n = pts.length;
    const a = pts[(i - 1 + n) % n];
    const b = pts[(i + 1) % n];
    return Math.atan2(b[1] - a[1], b[0] - a[0]);
  };
  const named = new Map();
  spec.lap.forEach((s, i) => {
    if (s.wp) {
      const wp = createElement(doc, 'waypoint', at(s.wp, s.wp[2]), 0);
      wp.name = s.name || `Line ${i + 1}`;
      doc.elements.push(wp);
      addToSequence(doc, wp.id, 0);
      return;
    }
    if (s.g === 'hurdle') {
      placeHurdle(doc, at(s.at), { square: false });
      return;
    }
    let el = s.name ? named.get(s.name) : null;
    if (!el) {
      el = createElement(doc, TYPE[s.g], at(s.at), heading(i));
      /* A dive gate's tilt and a flag's side are the builder's own rules (applyAutoFaces); a gate is turned to the
       * line here, by hand, the way the Nationals list does it. */
      if (s.g !== 'flag' && s.g !== 'dive') {
        el.yawOverridden = true;
      }
      el.name = s.name || `${s.g === 'flag' ? 'Flag' : 'Gate'} ${i + 1}`;
      doc.elements.push(el);
      if (s.name) {
        named.set(s.name, el);
      }
      if (s.flags) {
        setFlags(doc, el.id, s.flags);
      }
    }
    const seq = addToSequence(doc, el.id, s.level || 0);
    if (s.g === 'flag') {
      if (s.side) {
        seq.passSide = s.side;
      }
    } else if (s.g !== 'dive') {
      seq.entry = s.back ? -1 : 1;
      seq.overridden = true;
    }
  });
  doc.elements.push(createElement(doc, 'startPads', at(spec.pads), ((spec.padsYaw || 0) * Math.PI) / 180));
  applyAutoFaces(doc);
  return doc;
}

/* The six, as plain documents, in the order the builder lists them. */
export function chapterTracks() {
  return LAYOUTS.map((spec) => toPlain(build(spec)));
}
