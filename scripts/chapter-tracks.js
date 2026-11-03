/*
 * chapter-tracks.js: six original five inch race tracks at club size, for the builder's shipped list.
 *
 * WHY THESE. A league's club tracks fit a 60 by 30 m field and are built from one small kit: 5 ft gates, a double,
 * a triple stack, a tower, a dive gate, a hurdle and a handful of flags. The builder shipped one five inch track (the
 * Nationals qualifier, which is somebody else's design), and most five inch tracks on the board are drills. These
 * are ours: original layouts in that kit and that box, so the board can mark them official and a club can build them.
 * The owner's pick of 2026-11-03, item 2 of the 5 inch race pass (PROGRESS.md).
 *
 * EVERY ELEMENT, AND THE LEAGUE'S RULES FOR A GOOD TRACK. The owner's word of 2026-11-03, on the first six: "make
 * good use of all the elements, slalom, spiral up and down, split S, loops, dives etc etc etc, follow the multi GP
 * guidelines for a good track". So the six between them fly a flag slalom and a gate chicane, a spiral up a double
 * and up a ladder, a spiral down a ladder and down round a flag, a split-S and a reverse split-S through a double, a
 * power loop gate, a launch gate and a dive gate, hairpins and a climbing hairpin round a flagged leg, orbits, a Dutch
 * 8, an over and under crossover, the top of a tower and a ladder, and the hurdle. Each uses six or more of them. The
 * league's design rules, as its track design contests state them: keep the line inside the 200 by 100 ft box, use
 * elevated obstacles so the track is not flat, balance left and right turns, keep the flow from one obstacle to the
 * next, use roughly 20 to 30 obstacles (a gate with a flag counts two), and keep the pilots safe: the start and
 * finish gate a long straight run from the pads, and no lap line over them. Every start here is a straight run of 18
 * to 30 m from the pads down the home straight, and the line comes onto that straight from the field side.
 *
 * THE FRAME. Every step is in metres inside the 60 by 30 m box, x east and y north from its south west corner, and
 * the box sits 2 m in from the edge of a 64 by 34 m field. A gate faces along the line, from the step before it to
 * the step after it, unless the step gives its own `yaw` in degrees, and is flown that way unless the step says
 * `back`. A double, a ladder or a tower is flown through the `level` named, or by the stack figure `fig` names. A
 * flag is passed on the outside of the turn unless `side` says otherwise. `flags` puts a flagged gate's pennant on
 * that side as flown. A `wp` is a point the line is held to, with its height. A step with a `name` that comes back
 * is the same structure flown again. `loop`, `leg`, `around` and `spiral` are the figures laid round a pass.
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
import {
  addSpiral, flagsAsFlown, placeHurdle, setFlags,
} from '../src/trackbuilder/parts.js';
import { applyFigure } from '../src/trackbuilder/figures.js';
import {
  applyAround, applyLeg, applyPowerLoopGate, placeLaunchGate,
} from '../src/trackbuilder/flightpaths.js';

const FIELD = { width: 64, depth: 34 };
const MARGIN = 2;
const STAMP = '2026-11-03T00:00:00Z';
const TYPE = {
  gate: 'gate', flagged: 'flaggedGate', double: 'doubleStack', ladder: 'ladder', dive: 'diveGate', flag: 'flag', tower: 'tower',
};

const LAYOUTS = [
  {
    id: 'chapter-1-first-flight', name: 'Chapter 1: First Flight', pads: [2, 3], 
    note: 'Start here: a hurdle, a spiral up the double, a flag slalom, a hairpin round a flagged gate, the top of the tower and a gate chicane home.',
    lap: [
      { g: 'gate', at: [32, 3], label: 'Start' },
      { g: 'hurdle', at: [43, 3] },
      { g: 'gate', at: [53, 4] },
      { g: 'double', at: [57, 14], fig: 'spiralUp', hand: 'right' },
      { g: 'gate', at: [48, 24] },
      { g: 'flag', at: [40, 24], side: 'left' },
      { g: 'flag', at: [34, 24], side: 'right' },
      { g: 'flag', at: [28, 24], side: 'left' },
      { g: 'flag', at: [22, 24], side: 'right' },
      { g: 'flagged', at: [12, 25], yaw: 180, flags: 'left', leg: { side: 'left', kind: 'hairpin' } },
      { g: 'gate', at: [20, 18] },
      { g: 'tower', at: [32, 17], level: 1 },
      { g: 'gate', at: [42, 15] },
      { g: 'flag', at: [48, 12] },
      { g: 'gate', at: [39, 10] },
      { g: 'gate', at: [32, 8] },
      { g: 'gate', at: [25, 10] },
      { g: 'flag', at: [12, 6.5], around: { id: 'turn', hand: 'left', deg: 180 } },
    ],
  },
  {
    id: 'chapter-2-crossover', name: 'Chapter 2: Crossover', pads: [28, 0], 
    note: 'A figure of eight: through the bottom of the double one way and over its top the other, with an orbit round a flag, a spiral up the ladder and a power loop to finish.',
    lap: [
      { g: 'gate', at: [46, 4], yaw: 0, label: 'Start' },
      { g: 'flag', at: [56, 7] },
      { g: 'flagged', at: [57, 16], yaw: 90, flags: 'left', leg: { side: 'left', kind: 'orbit' } },
      { g: 'flag', at: [55, 25] },
      { g: 'gate', at: [47, 27] },
      { g: 'hurdle', at: [40, 23] },
      { wp: [30, 15, 4.6], name: 'Over the double' },
      { g: 'gate', at: [19, 8] },
      { g: 'flag', at: [13, 4], side: 'left' },
      { g: 'flag', at: [6, 6] },
      { g: 'ladder', at: [5, 15], yaw: 90, fig: 'spiralUp', hand: 'right' },
      { g: 'tower', at: [14, 26], level: 1 },
      { g: 'gate', at: [22, 21] },
      { g: 'double', at: [30, 15], label: 'Crossover' },
      { g: 'gate', at: [38, 9.5], loop: true },
    ],
  },
  {
    id: 'chapter-3-tower-dive', name: 'Chapter 3: Tower Dive', pads: [2, 3], 
    note: 'Punch up through the launch gate, dive the gate on the poles, slalom the flags, climb out of a hairpin and run the top of the ladder and the tower.',
    lap: [
      { g: 'gate', at: [32, 3], label: 'Start' },
      { g: 'hurdle', at: [43, 3] },
      { g: 'gate', at: [53, 4] },
      { g: 'launch', at: [57, 14] },
      { wp: [54, 23, 7.5], name: 'Over the top' },
      { g: 'dive', at: [42, 25] },
      { g: 'flag', at: [32, 25], side: 'left' },
      { g: 'flag', at: [25, 25], side: 'right' },
      { g: 'flagged', at: [12, 25], yaw: 180, flags: 'left', leg: { side: 'left', kind: 'spiralUp' } },
      { g: 'ladder', at: [22, 18], level: 2 },
      { g: 'tower', at: [36, 17], level: 1 },
      { g: 'gate', at: [45, 15] },
      { g: 'flag', at: [50, 12] },
      { g: 'gate', at: [40, 9] },
      { g: 'flag', at: [32, 9], side: 'left' },
      { g: 'flag', at: [26, 9], side: 'right' },
      { g: 'gate', at: [20, 9] },
      { g: 'flag', at: [12, 6.5], around: { id: 'turn', hand: 'left', deg: 180 } },
    ],
  },
  {
    id: 'chapter-4-ladder-slalom', name: 'Chapter 4: Ladder Slalom', pads: [2, 3], 
    note: 'A gate chicane, an orbit, a spiral down the ladder, a long flag slalom and a split-S through the double, then the tower and a hurdle home.',
    lap: [
      { g: 'gate', at: [30, 3], label: 'Start' },
      { g: 'gate', at: [38, 2] },
      { g: 'gate', at: [44, 4.5] },
      { g: 'gate', at: [50, 2] },
      { g: 'flagged', at: [56, 11], yaw: 90, flags: 'right', leg: { side: 'right', kind: 'orbit' } },
      { g: 'ladder', at: [50, 25], fig: 'spiralDown', hand: 'left' },
      { g: 'flag', at: [40, 25], side: 'left' },
      { g: 'flag', at: [34, 25], side: 'right' },
      { g: 'flag', at: [28, 25], side: 'left' },
      { g: 'flag', at: [22, 25], side: 'right' },
      { g: 'double', at: [11, 24], yaw: 180, fig: 'splitS' },
      { g: 'gate', at: [22, 17] },
      { g: 'tower', at: [34, 17], level: 1 },
      { g: 'gate', at: [44, 15] },
      { g: 'flag', at: [50, 12] },
      { g: 'gate', at: [40, 9] },
      { g: 'hurdle', at: [31, 9] },
      { g: 'gate', at: [22, 9] },
      { g: 'flag', at: [12, 6.5], around: { id: 'turn', hand: 'left', deg: 180 } },
    ],
  },
  {
    id: 'chapter-5-hairpins', name: 'Chapter 5: Hairpins', pads: [2, 3], 
    note: 'Hairpins both ways round flagged gates, a spiral down round a flag, a Dutch 8 round two flags and a reverse split-S over the double.',
    lap: [
      { g: 'gate', at: [26, 3], label: 'Start' },
      { g: 'gate', at: [34, 4] },
      { g: 'tower', at: [42, 3], level: 1 },
      { g: 'flagged', at: [56, 9], yaw: 90, flags: 'right', spiral: { side: 'right', turns: 1 } },
      { g: 'gate', at: [55, 19] },
      { g: 'flag', at: [53, 25] },
      { g: 'gate', at: [46, 26] },
      { g: 'flag', at: [37, 25], around: { id: 'turn', hand: 'left', deg: 360 } },
      { g: 'flag', at: [28, 25], around: { id: 'turn', hand: 'right', deg: 360 } },
      { g: 'double', at: [11, 24], yaw: 180, fig: 'revSplitS' },
      { g: 'gate', at: [22, 18] },
      { g: 'gate', at: [33, 17] },
      { g: 'flagged', at: [44, 17], yaw: 0, flags: 'right', leg: { side: 'right', kind: 'hairpin' } },
      { g: 'hurdle', at: [34, 12] },
      { g: 'gate', at: [24, 10] },
      { g: 'flagged', at: [14, 10], yaw: 180, flags: 'left', leg: { side: 'left', kind: 'hairpin' } },
    ],
  },
  {
    id: 'chapter-6-split-s', name: 'Chapter 6: Split-S', pads: [2, 3], 
    note: 'A power loop off the start, the dive gate, a split-S down through the double, a flag slalom, a spiral down round a flag and a hurdle home.',
    lap: [
      { g: 'gate', at: [28, 3], label: 'Start' },
      { g: 'gate', at: [38, 3], loop: true },
      { g: 'gate', at: [48, 3] },
      { g: 'flag', at: [56, 6] },
      { g: 'tower', at: [57, 15], yaw: 90, level: 1 },
      { wp: [54, 23, 6.5], name: 'Climb to the dive' },
      { g: 'dive', at: [45, 26] },
      { g: 'gate', at: [33, 25] },
      { g: 'double', at: [12, 24], yaw: 180, fig: 'splitS' },
      { g: 'flag', at: [22, 18], side: 'left' },
      { g: 'flag', at: [28, 18], side: 'right' },
      { g: 'flag', at: [34, 18], side: 'left' },
      { g: 'flagged', at: [44, 17], yaw: 0, flags: 'right', spiral: { side: 'right', turns: 1 } },
      { g: 'flag', at: [51, 12] },
      { g: 'gate', at: [40, 9] },
      { g: 'hurdle', at: [30, 9] },
      { g: 'gate', at: [20, 9] },
      { g: 'flag', at: [10, 6.5], around: { id: 'turn', hand: 'left', deg: 180 } },
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
  /* Held to 0.8 m. A club line turns far tighter than the 2.5 m a freeform course is warned at, and the Nationals
   * qualifier holds its line to a metre. A hairpin round the leg of a flagged gate is the one turn here tighter than
   * that, because its radius is the leg's own (the half width of the opening and the sleeve, about 1.4 m), and the
   * line's ease into and out of it dips a little under. It is meant, so the warning is set just under it rather than
   * shouting at a turn the track exists to ask for. */
  doc.settings.minCurveRadius = 0.8;
  doc.credit = {
    designer: 'WebFPV', series: 'WebFPV chapter tracks', sponsor: '', source: '', broughtOverBy: '', note: spec.note,
  };
  const at = (p, z = 0) => ({ x: p[0] + MARGIN, y: p[1] + MARGIN, z });
  const pts = spec.lap.map((s) => s.at || s.wp);
  /* Along the line: from the step before to the step after, unless the step names its own heading. Plan geometry,
   * not physics. */
  const heading = (i) => {
    const n = pts.length;
    const a = pts[(i - 1 + n) % n];
    const b = pts[(i + 1) % n];
    return Math.atan2(b[1] - a[1], b[0] - a[0]);
  };
  const named = new Map();
  const figures = [];
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
    if (s.g === 'launch') {
      /* The launch gate comes with its own pull up and push over (flightpaths.js), laid where the order has reached. */
      placeLaunchGate(doc, at(s.at), {});
      return;
    }
    let el = s.name ? named.get(s.name) : null;
    if (!el) {
      const yaw = s.yaw == null ? heading(i) : (s.yaw * Math.PI) / 180;
      el = createElement(doc, TYPE[s.g], at(s.at), yaw);
      /* A dive gate's tilt and a flag's side are the builder's own rules (applyAutoFaces); a gate is turned to the
       * line here, by hand, the way the Nationals list does it. */
      if (s.g !== 'flag' && s.g !== 'dive') {
        el.yawOverridden = true;
      }
      el.name = s.label || `${s.g === 'flag' ? 'Flag' : 'Gate'} ${i + 1}`;
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
        seq.overridden = true;
      }
    } else if (s.g !== 'dive') {
      seq.entry = s.back ? -1 : 1;
      seq.overridden = true;
    }
    /* `flags` is the side as flown. setFlags takes the piece's own side, which is the other one when the gate is
     * flown along its heading, so it is checked against what a pilot sees and turned round if it is wrong. */
    if (s.flags === 'left' || s.flags === 'right') {
      if (!flagsAsFlown(doc, seq.id)[s.flags]) {
        setFlags(doc, el.id, s.flags === 'left' ? 'right' : 'left');
      }
    }
    /* A stack's figure (spiral up, spiral down, split-S, reverse split-S) rewrites its passes in place, now. */
    if (s.fig) {
      applyFigure(doc, el.id, s.fig, { hand: s.hand });
    }
    if (s.loop || s.leg || s.around || s.spiral) {
      figures.push({ s, seqId: seq.id });
    }
  });
  doc.elements.push(createElement(doc, 'startPads', at(spec.pads), ((spec.padsYaw || 0) * Math.PI) / 180));
  applyAutoFaces(doc);
  /*
   * THE FIGURES ROUND A PASS, laid once the whole lap is there and faced, because each is laid from the way the line
   * goes through its pass and a turn round a flag from the piece before it. Every one is the builder's own figure
   * (flightpaths.js, parts.js), named the way the builder names it, so it reads back in the builder as the figure it
   * is and can be changed there: a power loop gate, a hairpin, a climbing hairpin or an orbit round a flagged leg, a
   * turn round a flag, and a spiral down round a flag before its gate.
   */
  for (const { s, seqId } of figures) {
    let made;
    if (s.loop) {
      made = applyPowerLoopGate(doc, seqId);
    } else if (s.leg) {
      made = applyLeg(doc, seqId, s.leg.side, s.leg.kind);
    } else if (s.around) {
      made = applyAround(doc, seqId, s.around);
    } else {
      made = addSpiral(doc, seqId, s.spiral.side, { turns: s.spiral.turns ?? 1 });
    }
    if (!made) {
      throw new Error(`${spec.id}: the figure at ${JSON.stringify(s.at)} could not be laid`);
    }
  }
  applyAutoFaces(doc);
  return doc;
}

/* The six, as plain documents, in the order the builder lists them. */
export function chapterTracks() {
  return LAYOUTS.map((spec) => toPlain(build(spec)));
}
