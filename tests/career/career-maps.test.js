/*
 * career-maps.test.js: every career world and WebFPV track passes the
 * builder's own checks, so nothing ships that the builder would warn about.
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

import test from 'node:test';
import assert from 'node:assert/strict';

import { normalize } from '../../src/trackbuilder/model.js';
import { collectWarnings, freestyleReport } from '../../src/trackbuilder/warnings.js';
import { courseFromDocument } from '../../src/game/trackdoc.js';
import { placeDocument } from '../../src/maps/built/place.js';
import { CHAPTERS, allLessons } from '../../src/career/curriculum.js';
import { CAREER_TRACK_IDS, OFFICIAL_TRACKS, OFFICIAL_ROOMS, careerTrack } from '../../src/career/tracks.js';
import { buildPath } from '../../src/trackbuilder/path.js';
import { applyAutoFaces } from '../../src/trackbuilder/faces.js';
import { MAPS } from '../../src/maps/registry.js';
import { houseDocument } from '../../src/maps/house/yard.js';
import { headsDocument } from '../../src/maps/heads/yard.js';
import { bardwellDocument } from '../../src/maps/bardwell/yard.js';
import { warehouseDocument } from '../../src/maps/warehouse/yard.js';

/* The game's own maps bring their own documents (src/maps/<id>/yard.js),
 * so a lesson in one names none; these are what they bring. The town has
 * no named gaps, and its lessons name none. */
const FIXED = { house: houseDocument, heads: headsDocument, bardwell: bardwellDocument, warehouse: warehouseDocument };

/* Every world a lesson can be flown in: its own, and its fallback's, which
 * the Steam edition flies where it carries no such map and the web flies
 * when the board does not answer. */
function flownWorlds(lesson) {
  const out = [{ lesson, world: lesson.world }];
  if (lesson.fallback) {
    const f = { ...lesson, ...lesson.fallback };
    out.push({ lesson: f, world: f.world });
  }
  return out;
}

function problems(raw) {
  const { doc } = normalize(raw);
  if (doc.mode === 'freestyle') {
    return freestyleReport(doc).warnings.filter((w) => w.level === 'warn');
  }
  return collectWarnings(doc).filter((w) => w.level === 'warn');
}

for (const id of CAREER_TRACK_IDS) {
  test(`track ${id} has no builder warnings and a lap`, () => {
    const raw = careerTrack(id);
    const warns = problems(raw);
    assert.deepEqual(warns.map((w) => `${w.code}: ${w.message}`), []);
    const { doc } = normalize(raw);
    const course = courseFromDocument(doc);
    assert.equal(course.stations.length, raw.sequence.length, 'every sequence entry is a station');
    assert.ok(course.closed !== false, 'the lap closes');
  });
}

const seen = new Set();
for (const lesson of allLessons()) {
  for (const { world } of flownWorlds(lesson)) {
    const doc = world.doc;
    if (!doc) {
      continue;
    }
    const key = `${doc.id}:${doc.elements.length}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    test(`world for ${lesson.id} (${doc.name}) has no builder warnings`, () => {
      assert.deepEqual(problems(doc).map((w) => `${w.code}: ${w.message}`), []);
    });
  }
}

test('every gap a lesson names is a gap on its map', () => {
  for (const lesson of allLessons()) {
    for (const { lesson: l, world } of flownWorlds(lesson)) {
      const names = l.objectives.filter((o) => o.kind === 'gap').flatMap((o) => o.names);
      if (!names.length) {
        continue;
      }
      assert.ok(!world.board, `${l.id} names gaps on a board map, which the test cannot see`);
      const raw = world.doc || (FIXED[world.map] && FIXED[world.map]());
      assert.ok(raw, `${l.id} names gaps on ${world.map}, which brings no document here`);
      const { doc } = normalize(raw);
      const zones = placeDocument(doc).zones.map((z) => z.name);
      for (const n of names) {
        assert.ok(zones.includes(n), `${l.id} names ${n}, which ${doc.name} does not have`);
      }
    }
  }
});

test('every lesson is flown in a map the game has, with a document or one of its own', () => {
  const ids = MAPS.map((m) => m.id);
  for (const lesson of allLessons()) {
    for (const { lesson: l, world } of flownWorlds(lesson)) {
      assert.ok(ids.includes(world.map), `${l.id} flies ${world.map}, which is not a map`);
      if (world.board) {
        assert.ok(['map', 'track'].includes(world.board.kind), `${l.id}: a board world is a map or a track`);
        assert.match(world.board.id, /^trk-[0-9a-f]{8}$/, `${l.id}: a board id`);
        assert.equal(world.map, world.board.kind === 'track' ? 'custom' : 'built', `${l.id}: a board ${world.board.kind} is built by its own world`);
        assert.ok(lesson.fallback && lesson.fallback.world && !lesson.fallback.world.board,
          `${l.id} is on the board and needs a fallback the game carries, for the Steam edition and for a board that is down`);
      } else if (!world.doc) {
        assert.ok(['house', 'heads', 'bardwell', 'warehouse', 'city', 'drift'].includes(world.map),
          `${l.id} flies ${world.map} with no document, which only a map with its own can do`);
      }
    }
  }
});

test('a lesson the Steam edition cannot fly has a fallback that keeps its stars honest', () => {
  for (const lesson of allLessons()) {
    if (!lesson.fallback) {
      continue;
    }
    const f = { ...lesson, ...lesson.fallback };
    assert.ok(f.medals && f.medals.gold != null && f.medals.silver != null, `${lesson.id}'s fallback has medals`);
    assert.equal(Boolean(f.medals.metric === 'score'), Boolean(lesson.medals.metric === 'score'), `${lesson.id}: the fallback is judged the same way`);
    assert.ok(f.briefing && f.briefing.goal && f.briefing.steps.length, `${lesson.id}'s fallback says what it flies`);
  }
});

test('lesson ids are unique and the numbered chapters are in order', () => {
  const ids = allLessons().map((l) => l.id);
  assert.equal(new Set(ids).size, ids.length);
  /* The numbered chapters keep their ids and their order, because the
   * Steam edition's chapter achievements count by them; the Rookie Licence
   * the skill tree added comes after them (src/career/tree.js). */
  const numbered = CHAPTERS.filter((c) => /^c\d+$/.test(c.id));
  numbered.forEach((c, i) => assert.equal(c.id, `c${i + 1}`));
  assert.deepEqual(CHAPTERS.slice(numbered.length).map((c) => c.id), ['rk', 'rc', 'wl', 'rt', 'px', 'ln']);
});

/*
 * THE OFFICIAL COURSES AS THE BUILDER OPENS THEM: re-aimed where a gate is
 * not marked as aimed by hand (src/trackbuilder/faces.js, which the builder
 * runs on every document it opens) and checked against the racing line as
 * well, which is how the builder counts its warnings. The checks above stop
 * short of the line; a room whose gates the builder re-aimed off square
 * passed them and opened with five warnings.
 */
for (const t of [...OFFICIAL_TRACKS, ...OFFICIAL_ROOMS]) {
  test(`official ${t.id} opens in the builder with no warnings, line included`, () => {
    const { doc } = normalize(careerTrack(t.id));
    applyAutoFaces(doc);
    const warns = collectWarnings(doc, buildPath(doc)).filter((w) => w.level === 'warn');
    assert.deepEqual(warns.map((w) => `${w.code}: ${w.message}`), []);
  });
}
