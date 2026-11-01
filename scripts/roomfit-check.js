/*
 * roomfit-check.js: a RaceGOW room holds every piece of its course.
 *
 * THE REPORT THIS ANSWERS. bug-dcc2264f, a whoop on a published course,
 * "weaving practice" (trk-65d4bdcc): "The 8th door is outside the room, the
 * map is wrong." It was. The course's second double stack stands at x 12.34
 * of a 10 m field and a hex gate at 10.82, and the game built RaceGOW's
 * 10 by 12 m hall round the field's middle whatever stood in it, so both
 * stood on the far side of a solid wall and no lap could be finished.
 *
 * THE CAUSE. The room was a constant in every reader (src/render/scene.js,
 * src/game/raceline.js, src/share/orbit.js), and the builder lets a piece
 * stand outside the field: its warnings are advisory by decision, and a
 * room's field can be resized in the inspector. roomOf in
 * src/game/trackdoc.js is the room now, carried on the course as
 * `course.room`: RaceGOW's for every course whose pieces all stand inside
 * it, grown, both walls of an axis alike, for one with a piece outside.
 *
 * WHAT IS CHECKED, in Node, in well under a second:
 *
 *   the ticket's layout                 the room grows across and not along,
 *                                       and every piece stands inside its walls,
 *                                       the two outside with floor to spare
 *   RaceGOW's room for a course that fits   every official and preset whoop course,
 *                                       and every whoop course a career lesson
 *                                       flies, is built in RaceGOW's hall exactly,
 *                                       so nothing that flew before has moved
 *   a banner hung flush on a wall        does not grow the room (the builder's own
 *                                       test is the piece's centre)
 *   a piece past the far end             grows the depth and not the width
 *   a field resized in the inspector     its pieces are inside the walls
 *   the line solver's walls              solidsOf builds them at the course's room
 *   a course without a room             every reader falls back to RaceGOW's
 *
 * With --board it also reads every whoop course published on the board
 * (GET {origin}/api/tracks and each one's document, read only) and checks
 * each piece of each stands inside its room. That needs the network and is
 * not part of the default run.
 *
 * Usage: node scripts/roomfit-check.js [--board[=https://webfpv.org/board]]
 * Exit code is 1 if any check failed.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { createTrack, createElement, createSequenceEntry, normalize, toPlain } from '../src/trackbuilder/model.js';
import { courseFromDocument, roomOf, ROOM_RUNOFF } from '../src/game/trackdoc.js';
import { solidsOf } from '../src/game/raceline.js';
import { MICRO_SCALE } from '../src/game/track.js';
import { ROOM_WIDTH, ROOM_DEPTH, ROOM_HEIGHT } from '../src/trackbuilder/racegow.js';
import { officialDocs, careerTrack } from '../src/career/tracks.js';
import { presetsForClass } from '../src/trackbuilder/presets.js';
import { CHAPTERS } from '../src/career/curriculum.js';

const K = MICRO_SCALE;
const BASE = { width: ROOM_WIDTH * K, depth: ROOM_DEPTH * K, height: ROOM_HEIGHT * K };
const EPS = 1e-9;

let failed = 0;
let passed = 0;
function check(name, ok, note) {
  if (ok) {
    passed += 1;
    console.log(`  ok    ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${note ? `: ${note}` : ''}`);
  }
}

/* A whoop document from a list of [type, x, y, yaw], every aperture
 * sequenced, written and read back the way the board serves one. */
function roomDoc(name, pieces, field = null) {
  const doc = createTrack(name, 'micro');
  if (field) {
    doc.field.width = field.width;
    doc.field.depth = field.depth;
  }
  for (const [type, x, y, yaw] of pieces) {
    const el = createElement(doc, type, { x, y }, yaw);
    doc.elements.push(el);
    try {
      doc.sequence.push(createSequenceEntry(doc, el.id, 0));
    } catch (e) {
      /* An obstacle is not a step, which is the contract. */
    }
  }
  return normalize(JSON.parse(JSON.stringify(toPlain(doc)))).doc;
}

/* Every piece of the course and how far it stands inside the room's walls,
 * less half its opening: negative is a gate through or past a wall. A box
 * (a banner, a barrier) counts from its centre, which is the builder's own
 * test, because a banner is hung flush on a wall on purpose. `only` narrows
 * it to the pieces whose centre is outside RaceGOW's hall, the ones that
 * grew the room. */
function worstInside(course, only = null) {
  const room = course.room || BASE;
  let worst = Infinity;
  let who = '';
  for (const p of [...course.structures, ...(course.loose || [])]) {
    if (only === 'outside' && Math.abs(p.x) <= BASE.width / 2 && Math.abs(p.z) <= BASE.depth / 2) {
      continue;
    }
    const d = p.dims || (p.structure && p.structure.dims) || {};
    const half = Math.max(d.clearW || 0, p.clearW || 0) / 2;
    const inX = room.width / 2 - Math.abs(p.x) - half;
    const inZ = room.depth / 2 - Math.abs(p.z) - half;
    const inside = Math.min(inX, inZ);
    if (inside < worst) {
      worst = inside;
      who = `${p.type || (p.structure && p.structure.type)} ${p.id || p.elementId} at ${p.x.toFixed(2)}, ${p.z.toFixed(2)}`;
    }
  }
  return { worst, who };
}

const same = (a, b) => Math.abs(a - b) < 1e-6;
const isBase = (r) => r && same(r.width, BASE.width) && same(r.depth, BASE.depth) && same(r.height, BASE.height);
const metres = (r) => `${(r.width / K).toFixed(2)} by ${(r.depth / K).toFixed(2)} by ${(r.height / K).toFixed(2)} m`;

console.log('\n--- the ticket: two gates past the 10 m wall (bug-dcc2264f) ---');
/* The ticket's layout as published, the apertures in their order at their
 * own positions and headings, in the document's metres. The second double
 * stack and the first hex gate are the two outside. */
const WEAVING = [
  ['tower', 7.5692, 5.5118, Math.PI],
  ['tower', 4.5212, 8.4074, Math.PI],
  ['hoop', 2.2098, 9.271, Math.PI],
  ['hoop', 1.397, 7.5438, -Math.PI / 2],
  ['hoop', 3.2512, 5.207, -Math.PI / 2],
  ['gate', 3.2512, 4.7498, -Math.PI / 2],
  ['gate', 3.2512, 4.2418, -Math.PI / 2],
  ['banner', 3.8862, 0.0762, 0],
  ['barrier', 7.3914, 2.159, 0.72799],
  ['doubleStack', 8.2804, 3.937, Math.PI / 2],
  ['doubleStack', 12.3444, 3.5052, 0],
  ['hexGate', 10.8204, 7.6708, Math.PI / 2],
  ['hexGate', 8.0264, 9.1186, Math.PI],
  ['hexGate', 6.0198, 10.4902, Math.PI],
];
{
  const course = courseFromDocument(roomDoc('weaving practice, as reported', WEAVING));
  const r = course.room;
  console.log(`        the room: ${r ? metres(r) : 'none'}`);
  check('a whoop course carries its room', Boolean(r));
  check('the room grows across, past RaceGOW\'s 10 m', r && r.width > BASE.width + EPS, r && metres(r));
  check('and not along: no piece is past the 12 m ends', r && same(r.depth, BASE.depth), r && metres(r));
  check('nor up', r && same(r.height, BASE.height));
  const all = worstInside(course);
  check('every piece stands inside the walls', all.worst >= 0, `${(all.worst / K).toFixed(2)} m, ${all.who}`);
  const out = worstInside(course, 'outside');
  check('the two that were outside have their half opening and a metre and a half of floor to spare',
    out.worst >= 1.5 * K, `${(out.worst / K).toFixed(2)} m, ${out.who}`);
  /* And in RaceGOW's hall, which is what the game built before: the two
   * gates stood through the wall. This is the bug, held in place so the
   * check above is seen to be the one that would catch it. */
  const before = worstInside({ ...course, room: BASE });
  check('in RaceGOW\'s hall the same layout has a gate past the wall (the bug)', before.worst < 0,
    `${(before.worst / K).toFixed(2)} m, ${before.who}`);
  const { boxes } = solidsOf(course);
  const east = Math.max(...boxes.map((b) => b.lo[0]));
  check('the line solver\'s east wall is the room\'s', same(east, r.width / 2), `${east} against ${r.width / 2}`);
}

console.log('\n--- RaceGOW\'s hall for every course that fits ---');
{
  const docs = [];
  for (const d of officialDocs('micro')) {
    docs.push([`official ${d.name || d.id}`, d]);
  }
  for (const p of presetsForClass('micro')) {
    docs.push([`preset ${p.name || p.id}`, JSON.parse(JSON.stringify(p))]);
  }
  const seen = new Set();
  for (const c of CHAPTERS) {
    for (const l of c.lessons) {
      const id = l.world && l.world.track;
      if (typeof id === 'string' && !seen.has(id)) {
        seen.add(id);
        try {
          const d = careerTrack(id);
          if (d.trackClass === 'micro') {
            docs.push([`career ${id}`, d]);
          }
        } catch (e) {
          /* Not a career track id; the world is something else. */
        }
      }
    }
  }
  let base = 0;
  const moved = [];
  const through = [];
  for (const [name, d] of docs) {
    const course = courseFromDocument(d);
    if (course.trackClass !== 'micro') {
      continue;
    }
    if (isBase(course.room)) {
      base += 1;
    } else {
      moved.push(`${name}: ${course.room ? metres(course.room) : 'no room'}`);
    }
    const { worst, who } = worstInside(course);
    if (worst < -1e-6) {
      through.push(`${name}: ${who}`);
    }
  }
  console.log(`        ${docs.length} whoop documents read, ${base} in RaceGOW's hall`);
  check('there are whoop courses to read', docs.length >= 10, `${docs.length}`);
  check('every one is built in RaceGOW\'s hall exactly, so nothing that flew before has moved',
    moved.length === 0, moved.join('; '));
  check('and none has a piece through a wall', through.length === 0, through.join('; '));
}

console.log('\n--- the edges of the rule ---');
{
  const flush = courseFromDocument(roomDoc('a banner on the wall', [
    ['gate', 5, 6, 0], ['gate', 3, 4, 0], ['banner', 5, 0.05, 0],
  ]));
  check('a banner hung flush on a wall does not grow the room', isBase(flush.room), metres(flush.room));

  const far = courseFromDocument(roomDoc('a gate past the far end', [
    ['gate', 5, 6, 0], ['gate', 3, 4, 0], ['gate', 5, 13.5, 0],
  ]));
  check('a gate past the far end grows the depth', far.room.depth > BASE.depth + EPS, metres(far.room));
  check('and not the width', same(far.room.width, BASE.width), metres(far.room));
  const farIn = worstInside(far, 'outside');
  check('and stands inside the far wall', farIn.worst >= 1.5 * K, `${(farIn.worst / K).toFixed(2)} m, ${farIn.who}`);
  check('the room is a whole half metre, measured', Math.abs((far.room.depth / K) * 2 - Math.round((far.room.depth / K) * 2)) < 1e-6,
    `${(far.room.depth / K).toFixed(4)} m`);

  const wide = courseFromDocument(roomDoc('a field resized to 16 by 12', [
    ['gate', 2, 6, 0], ['gate', 8, 6, 0], ['gate', 14.5, 6, 0],
  ], { width: 16, depth: 12 }));
  const wideIn = worstInside(wide, 'outside');
  check('a field resized in the inspector has its pieces inside the walls', wideIn.worst >= 1.5 * K,
    `${(wideIn.worst / K).toFixed(2)} m, ${wideIn.who}, room ${metres(wide.room)}`);

  const legacy = courseFromDocument(roomDoc('a course from before rooms', [['gate', 5, 6, 0], ['gate', 3, 4, 0]]));
  delete legacy.room;
  const { boxes } = solidsOf(legacy);
  const east = Math.max(...boxes.map((b) => b.lo[0]));
  check('a course without a room is walled at RaceGOW\'s', same(east, BASE.width / 2), `${east}`);
  check('roomOf is pure and answers again the same', JSON.stringify(roomOf(far)) === JSON.stringify(far.room));
  check('the run off is the two metres the comment says', ROOM_RUNOFF === 2);

  const field = courseFromDocument(JSON.parse(JSON.stringify(officialDocs('full')[0])));
  check('a field course has no room', field.room === undefined);
}

const boardArg = process.argv.find((a) => a.startsWith('--board'));
if (boardArg) {
  const origin = (boardArg.split('=')[1] || 'https://webfpv.org/board').replace(/\/$/, '');
  console.log(`\n--- every whoop course on ${origin} (read only) ---`);
  const list = await (await fetch(`${origin}/api/tracks`)).json();
  const micro = (list.tracks || []).filter((t) => t.trackClass === 'micro');
  const through = [];
  let grown = 0;
  for (const t of micro) {
    const res = await fetch(`${origin}/api/tracks/${encodeURIComponent(t.id)}/document`);
    if (!res.ok) {
      through.push(`${t.id}: HTTP ${res.status}`);
      continue;
    }
    const body = await res.json();
    const course = courseFromDocument(body.document || body);
    if (!isBase(course.room)) {
      grown += 1;
      console.log(`        ${t.id} "${t.name}": ${metres(course.room)}`);
    }
    const { worst, who } = worstInside(course);
    if (worst < -1e-6) {
      through.push(`${t.id} "${t.name}": ${who}`);
    }
  }
  console.log(`        ${micro.length} whoop courses, ${grown} in a grown room`);
  check('every published whoop course has every piece inside its walls', through.length === 0, through.join('; '));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
