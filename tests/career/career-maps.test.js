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
  const doc = lesson.world.doc;
  const key = `${doc.id}:${doc.elements.length}`;
  if (seen.has(key)) {
    continue;
  }
  seen.add(key);
  test(`world for ${lesson.id} (${doc.name}) has no builder warnings`, () => {
    assert.deepEqual(problems(doc).map((w) => `${w.code}: ${w.message}`), []);
  });
}

test('every gap a lesson names is a gap on its map', () => {
  for (const lesson of allLessons()) {
    const names = lesson.objectives.filter((o) => o.kind === 'gap').flatMap((o) => o.names);
    if (!names.length) {
      continue;
    }
    const { doc } = normalize(lesson.world.doc);
    const zones = placeDocument(doc).zones.map((z) => z.name);
    for (const n of names) {
      assert.ok(zones.includes(n), `${lesson.id} names ${n}, which ${doc.name} does not have`);
    }
  }
});

test('lesson ids are unique and chapters are in order', () => {
  const ids = allLessons().map((l) => l.id);
  assert.equal(new Set(ids).size, ids.length);
  CHAPTERS.forEach((c, i) => assert.equal(c.id, `c${i + 1}`));
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
