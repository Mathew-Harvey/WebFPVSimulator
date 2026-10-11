/*
 * community-selftest.js: the pure half of the Tunes library and ratings.
 *
 * Covers what runs without a page: share code parsing, the rating helpers
 * and the order they put a list in, the map picker, and, when the board's
 * checkout sits beside this one, that a tune built from the shipped
 * defaults passes the board's own validator. The dialogs and the Ui methods
 * that read and write the settings need a document, so they are not here;
 * they are what "fly it" is for. Run with `npm run check:community`.
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

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { pickMaps, tuneCodeFrom, tuneCodeShown } from '../src/share/board.js';
import { byRating, cleanRating, ratingShort, ratingWords } from '../src/share/rating.js';
import { RATE_DEFAULTS, normaliseRates } from '../configs/rates.js';

const here = path.dirname(fileURLToPath(import.meta.url));
let passed = 0;
function ok(name, fn) {
  fn();
  passed += 1;
  console.log(`ok  ${name}`);
}

ok('share codes parse with dashes, spaces and capitals', () => {
  assert.equal(tuneCodeFrom('K7MQ-2XRT-9VWD'), 'k7mq2xrt9vwd');
  assert.equal(tuneCodeFrom(' k7mq 2xrt 9vwd '), 'k7mq2xrt9vwd');
  assert.equal(tuneCodeShown('k7mq2xrt9vwd'), 'k7mq-2xrt-9vwd');
});

ok('share codes refuse the wrong length and the look-alike letters', () => {
  assert.equal(tuneCodeFrom('k7mq-2xrt'), '');
  assert.equal(tuneCodeFrom('k7mq2xrt9vwdd'), '');
  assert.equal(tuneCodeFrom('l7mq2xrt9vwd'), '');
  assert.equal(tuneCodeFrom('o7mq2xrt9vwd'), '');
  assert.equal(tuneCodeFrom(null), '');
});

ok('a board with no ratings reads as unrated, never as an error', () => {
  for (const raw of [undefined, null, {}, { count: 0 }, { count: 3, avg: NaN }]) {
    const r = cleanRating(raw);
    assert.equal(r.count, 0);
    assert.equal(r.avg, null);
  }
  assert.equal(ratingWords(cleanRating(null)), 'Not rated yet');
  assert.equal(ratingShort(cleanRating(null)), '');
});

ok('rating words and the short form', () => {
  const r = cleanRating({ count: 12, avg: 4.62, score: 4.1 });
  assert.equal(ratingWords(r), '4.6 of 5 from 12 ratings');
  assert.equal(ratingShort(r), '4.6 stars (12)');
  assert.equal(ratingWords(cleanRating({ count: 1, avg: 5, score: 3.6 })), '5.0 of 5 from 1 rating');
});

ok('top rated orders by the damped score, unrated last', () => {
  const list = [
    { id: 'a', rating: cleanRating(null) },
    { id: 'b', rating: cleanRating({ count: 1, avg: 5, score: 3.6 }) },
    { id: 'c', rating: cleanRating({ count: 40, avg: 4.5, score: 4.4 }) },
    { id: 'd', rating: cleanRating({ count: 5, avg: 4.5, score: 4.4 }) },
  ];
  assert.deepEqual(list.slice().sort(byRating).map((x) => x.id), ['c', 'd', 'b', 'a']);
});

ok('the map picker keeps ten, newest or best loved, newest breaking a tie', () => {
  const maps = [];
  for (let i = 0; i < 14; i += 1) {
    maps.push({
      id: `m${i}`,
      publishedUtc: `2026-10-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
      rating: i === 2 ? cleanRating({ count: 9, avg: 5, score: 4.6 }) : cleanRating(null),
    });
  }
  const newest = pickMaps(maps, 'newest');
  assert.equal(newest.length, 10);
  assert.equal(newest[0].id, 'm13');
  const rated = pickMaps(maps, 'rated');
  assert.equal(rated.length, 10);
  assert.equal(rated[0].id, 'm2');
  assert.equal(rated[1].id, 'm13');
});

const boardRoot = path.resolve(here, '..', '..', 'webfpvsimulator-leaderboard');
const boardCommunity = path.join(boardRoot, 'src', 'tunes.js');
if (fs.existsSync(boardCommunity)) {
  const { inspectSetupBody } = await import(pathToFileURL(boardCommunity).href);
  ok('a tune built from the shipped defaults passes the board validator', () => {
    const setup = {
      base: 'betaflight-default',
      rates: JSON.parse(JSON.stringify(normaliseRates(RATE_DEFAULTS))),
      weight: 100,
      airGrip: 100,
      motorKv: 100,
      packVoltage: 4.2,
      cameraFov: 115,
      cameraAngle: 30,
    };
    const checked = inspectSetupBody(setup, '5inch');
    assert.equal(checked.error, undefined);
    assert.deepEqual(checked.setup.rates, setup.rates);
  });
  ok('a board validator refusal names the field', () => {
    const checked = inspectSetupBody({ base: 'betaflight-default', rates: {} }, '5inch');
    assert.ok(checked.error);
  });
} else {
  console.log('skip  board validator (no sibling webfpvsimulator-leaderboard checkout)');
}

console.log(`${passed} passed`);
