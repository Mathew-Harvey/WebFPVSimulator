/*
 * mission-preset.js: writes src/trackbuilder/presets5.js, the five inch tracks that ship with the builder.
 *
 * THE NATIONALS QUALIFIER, AND SINCE 2026-11-03 THE SIX CLUB SIZE TRACKS OF scripts/chapter-tracks.js AFTER IT.
 *
 * ONE TRACK, FROM A SHORT LIST. The 2026 Australian Drone Nationals qualifying track, the plan Wilf (the 2025
 * National Champion) drew, laid out the way the builder lays a track and not copied out of a picture: every
 * distance below is a whole metre read off the plan's own dimensions, so the numbers can be argued with and the
 * file can be written again. It is here for two reasons. A pilot who wants to practise the lap can open it, fly it
 * and change it, and the builder has to be able to make it, so it is also what TRACK-BUILDER-5IN-PLAN.md's
 * acceptance run builds from an empty canvas and compares itself to (scripts/builder-flow-check.js).
 *
 * THE FRAME. The plan is 40 m by 29 m inside a 5 m grid with its origin at the bottom left. Here every plan metre
 * is a field metre moved five east and five north, so the loop that swings out to the west of the left hand
 * column stays on a 45 by 55 m field with a margin, and the start gate is at (20, 19).
 *
 * WHAT IS ON IT, by the plan's own materials list: seven gates (the start gate, two on the left hand column, one
 * on the right, and the three bays of the wall), nine flags (two on each of the gates on the right and the lower
 * left, one on the upper left, one at the end of the wall, two on the hurdle, and the turn flag), a hurdle and an
 * up gate. The lap goes:
 *
 *   start gate, over the hurdle, a spiral down round the south flag of the gate on the right and through it east,
 *   up through the up gate, round the flag on the wall's east end and through its bays north, south and north,
 *   a spiral down round the north flag of the upper left hand gate and through it east, the swing out west, the
 *   lower left hand gate east, round the turn flag, the lower left hand gate east again, and home.
 *
 * THE FIRST READING WAS WRONG, and the owner said so on 2026-10-01: the two spirals were built as loops out of a
 * gate and back through it, which is two passes, where the plan means a spiral down round the flag on the gate and
 * then one pass; and the wall was flown south, north, south, where it is entered round its flag and flown north,
 * south, north. The upper left hand gate turned round with it: the plan's line crosses it going east, as it does
 * every other gate on the left. The plan draws each gate folded flat towards the side it is flown out of, which
 * is how the faces were read the second time.
 *
 * Every gate on it is 2 m between uprights, which is the bay the plan draws once the world builds a gate fifteen
 * percent larger than the document (GATE_SCALE), so the wall's bays are 2 m apart and its uprights meet. The
 * credit names the designer and the event, and the sponsor's mark is not on it: it is theirs and not ours to
 * ship. The line the plan draws is a suggestion and the plan's spirals are a couple of metres across, so the track
 * holds its curve warning to a metre and not to the 2.5 m a freeform course is held to.
 *
 * Run `node scripts/mission-preset.js` to write the file, and `--check` to fail when the file is not what this
 * would write now.
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

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createElement, createTrack, toPlain } from '../src/trackbuilder/model.js';
import { addToSequence } from '../src/trackbuilder/sequence.js';
import { applyAutoFaces } from '../src/trackbuilder/faces.js';
import {
  addSpiral, placeHurdle, placeUpGate, placeWall, reverseWall, setFlags,
} from '../src/trackbuilder/parts.js';
import { ELEMENTS, GATE_PRESETS, applyGatePreset } from '../src/trackbuilder/elements.js';
import { chapterTracks } from './chapter-tracks.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = join(root, 'src', 'trackbuilder', 'presets5.js');

/* ---------------------------------------------------------------- */
/* The list. Plan metres, east and north of the plan's bottom left.   */
/* ---------------------------------------------------------------- */

const SHIFT = 5;
const FIELD = { width: 45, depth: 55 };

const PLAN = {
  start: { x: 15, y: 14, facing: 0 },
  hurdle: { x: 22, y: 23 },
  /* Flown east, a flag on each upright, and the spiral goes down round the south one, on the right as flown. */
  eastSpiral: { x: 25, y: 30, facing: 0, flags: 'both', round: 'right' },
  upGate: { x: 28, y: 38, facing: 90 },
  /* Where the plan's line tops out after the up gate and turns west, in front of it, so the line leaves it forwards. */
  overTop: { x: 26, y: 43, height: 3.5 },
  /* The wall's four posts, first flown to last: the bays between them are at 18, 16 and 14, on one line. The flag is
   * on the east end, and the line goes round it into the first bay, which is flown north. */
  wall: { from: { x: 19, y: 38 }, to: { x: 13, y: 38 }, flags: 'first', round: 'right' },
  /* Out of the last bay north and away west, where the plan draws it, before the line turns down to the left. */
  outOfWall: { x: 11, y: 40, height: 2 },
  /* Flown east, its one flag on the north upright (its right, seen facing it), on the left as flown. */
  westSpiral: { x: 0, y: 24, facing: 0, flags: 'right', round: 'left' },
  /* Out of it east and round to the south, then the swing out west, which lines up the lower gate. */
  turnSouth: { x: 2, y: 21, height: 0.9 },
  swingOut: { x: -2, y: 18, height: 0.9 },
  lower: { x: 0, y: 14, facing: 0, flags: 'both' },
  turnFlag: { x: 0, y: 0, passedOn: -90, clearance: 2.5 },
  pads: { x: 12, y: 14 },
};

const DEG = Math.PI / 180;
const at = (p) => ({ x: p.x + SHIFT, y: p.y + SHIFT, z: 0 });

function build() {
  const WIDE = GATE_PRESETS.find((p) => p.id === 'wide');
  const wideDims = () => {
    const d = { ...ELEMENTS.gate.dims };
    applyGatePreset(d, WIDE);
    return d;
  };
  const doc = createTrack('Drone Nationals 2026 qualifier', 'full');
  doc.id = 'nationals-2026-qualifier';
  doc.createdUtc = '2026-10-01T00:00:00Z';
  doc.modifiedUtc = '2026-10-01T00:00:00Z';
  doc.field.width = FIELD.width;
  doc.field.depth = FIELD.depth;
  doc.settings.minCurveRadius = 1;
  doc.credit = {
    designer: 'Wilf',
    series: '2026 Mission Foods Australian Drone Nationals, official qualifying track',
    sponsor: '',
    source: 'the official layout and dimensions plan',
    broughtOverBy: '',
    note: "Rebuilt in the builder from the plan, for practice. It is not the organisers' file.",
  };

  /* A gate of the plan's width, facing a way, flown the way it faces, one pass. */
  const gate = (type, spot, name, flags) => {
    const el = createElement(doc, type, at(spot), spot.facing * DEG);
    Object.assign(el.dims, wideDims());
    el.yawOverridden = true;
    el.name = name;
    doc.elements.push(el);
    if (flags) {
      setFlags(doc, el.id, flags);
    }
    const seq = addToSequence(doc, el.id, 0);
    seq.entry = 1;
    seq.overridden = true;
    return { el, seq };
  };

  /* A point the line is held to, at a height, at the end of the flying order. */
  const waypoint = (spot, name) => {
    const wp = createElement(doc, 'waypoint', { ...at(spot), z: spot.height }, 0);
    wp.name = name;
    doc.elements.push(wp);
    addToSequence(doc, wp.id, 0);
    return wp;
  };

  const start = gate('gate', PLAN.start, 'Start and finish');
  placeHurdle(doc, at(PLAN.hurdle), { square: true });

  const east = gate('flaggedGate', PLAN.eastSpiral, 'East spiral gate', PLAN.eastSpiral.flags);
  addSpiral(doc, east.seq.id, PLAN.eastSpiral.round);

  const up = placeUpGate(doc, at(PLAN.upGate));
  up.yaw = Math.round(PLAN.upGate.facing * DEG * 1e6) / 1e6;
  up.yawOverridden = true;
  Object.assign(up.dims, { clearW: wideDims().clearW, clearH: wideDims().clearH });
  up.name = 'Up gate';
  waypoint(PLAN.overTop, 'Over the top');

  /* Laid the way the tool lays it, which flies the first bay away from the side the course comes from, then turned
   * round, as the wall's Reverse does, because the plan goes round the flag on its end first. */
  const bays = placeWall(doc, at(PLAN.wall.from), at(PLAN.wall.to), { dims: wideDims(), flags: PLAN.wall.flags });
  reverseWall(doc, bays[0]);
  addSpiral(doc, doc.sequence.find((q) => q.elementId === bays[0]).id, PLAN.wall.round, { turns: 0 });
  waypoint(PLAN.outOfWall, 'Out of the wall');

  const west = gate('flaggedGate', PLAN.westSpiral, 'West spiral gate', PLAN.westSpiral.flags);
  addSpiral(doc, west.seq.id, PLAN.westSpiral.round);
  waypoint(PLAN.turnSouth, 'Turn south');
  waypoint(PLAN.swingOut, 'Swing out');

  const lower = gate('flaggedGate', PLAN.lower, 'Lower gate', PLAN.lower.flags);
  {
    const flag = createElement(doc, 'flag', at(PLAN.turnFlag), PLAN.turnFlag.passedOn * DEG);
    flag.yawOverridden = true;
    flag.name = 'Turn flag';
    doc.elements.push(flag);
    const seq = addToSequence(doc, flag.id, 0);
    seq.clearance = PLAN.turnFlag.clearance;
  }
  {
    const seq = addToSequence(doc, lower.el.id, 0);
    seq.entry = 1;
    seq.overridden = true;
  }
  doc.elements.push(createElement(doc, 'startPads', at(PLAN.pads), 0));
  applyAutoFaces(doc);
  /* The start gate is the first pass and the lap closes on it. */
  start.el.name = 'Start and finish';
  return doc;
}

/* ---------------------------------------------------------------- */
/* The file                                                           */
/* ---------------------------------------------------------------- */

function render() {
  /* The Nationals qualifier first, because the builder's acceptance run and its self test read it as [0], then the
   * six club size tracks of scripts/chapter-tracks.js. */
  const json = [toPlain(build()), ...chapterTracks()]
    .map((plain) => JSON.stringify(plain, null, 2).replace(/^/gm, '  ').trimStart())
    .join(',\n  ');
  return `/*
 * presets5.js: the five inch tracks that ship with the builder, and nothing else.
 *
 * GENERATED by scripts/mission-preset.js from the short list in that file. Edit the list and run the script; do not
 * edit this file by hand. It is the builder's alone: src/trackbuilder/app.js hands it to storage.js (shipTracks),
 * so the simulator's own boot graph does not carry it.
 *
 * Copyright (C) 2026 WebFPVSimulator contributors
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

/*
 * THE 2026 AUSTRALIAN DRONE NATIONALS QUALIFYING TRACK, laid out from the designer's plan. Credit goes to the
 * designer and the event, as the plan names them; the sponsor's mark is not on it. After it, the six WebFPV chapter
 * tracks of scripts/chapter-tracks.js: original layouts on a 60 by 30 m club field.
 */
export const FIVE_INCH_PRESETS = [
  ${json},
];
`;
}

const text = render();
if (process.argv.includes('--check')) {
  let held = '';
  try {
    held = await readFile(OUT, 'utf8');
  } catch (e) {
    held = '';
  }
  if (held !== text) {
    console.error('src/trackbuilder/presets5.js is not what scripts/mission-preset.js writes now. Run it.');
    process.exit(1);
  }
  console.log('presets5.js is what mission-preset.js writes.');
} else {
  await writeFile(OUT, text);
  console.log(`wrote ${OUT}`);
}
