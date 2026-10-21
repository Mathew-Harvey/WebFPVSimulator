/*
 * dan-check.js: Dan, who judges the pilot from the corner of every RaceGOW
 * room (src/maps/dan/), proved in plain Node. No browser: his picture and his
 * balloon are looked at with scripts/shots.js.
 *
 *   1. lines      the owner's three lines are there as he wrote them, every
 *                 line is plain text with no dash and no dev detail, and
 *                 every face and move a line names exists
 *   2. judge      what he says to each thing he hears: a miss, a hard hit
 *                 soon after a gate and long after one, a lap that is the
 *                 best and one that is not, a run of clean gates; that he is
 *                 quiet for a while after a line, goes through a list before
 *                 he repeats, and starts again when the clock goes back
 *   3. misses     Race.missedGate on every RaceGOW5 preset's first gate: a
 *                 pass through the hole is not a miss, a crossing a little
 *                 outside it is, one far outside it, one backwards and one
 *                 that never reaches the plane are not
 *   4. body       every pose finite; the head follows a quad ahead of him
 *                 and the body only turns for one he cannot see
 *   5. loading    only the RaceGOW series reaches him: all eight presets
 *                 are credited to it and a pilot's own track is not; custom.js
 *                 imports him dynamically, never at boot; his picture is
 *                 small
 *
 * Usage: node scripts/dan-check.js
 *
 * A threshold here is never widened to make a line pass (CLAUDE.md); the
 * argument goes in PROGRESS.md.
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

import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DAN_LINES, QUIET_MS, QUIET_LAP_MS, CLEAN_EXIT_MS, TIDY_GATES, makeJudge, danState, danAt,
} from '../src/maps/dan/dan.js';
import { Race } from '../src/game/race.js';
import { courseFromDocument } from '../src/game/trackdoc.js';
import { presetById } from '../src/trackbuilder/presets.js';
import { normalize } from '../src/trackbuilder/model.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${name}${detail ? `: ${detail}` : ''}`);
  }
}

/* ------------------------------------------------------------------ */
console.log('\n1. lines');
const all = Object.entries(DAN_LINES).flatMap(([kind, list]) => list.map((l) => ({ ...l, kind })));
const plain = (t) => t.toLowerCase().replace(/[.!]+$/, '');
for (const said of ['Couldn\'t get a clean exit', 'Amazing, this level of pilot is only 150th in the world.', 'Missed a gate']) {
  check(`the owner's line is there: ${said}`, all.some((l) => plain(l.text) === plain(said)));
}
check('every line is plain text, no dash', all.every((l) => !/[‒-―-]/.test(l.text.replace(/\w-\w/g, ''))), all.find((l) => /[‒-―]/.test(l.text))?.text);
check('no line says anything about the build', all.every((l) => !/\b(mm|metres?|polygons?|triangles?|px|scale)\b/i.test(l.text)));
const FACES = ['smile', 'laugh', 'shout', 'talk', 'surprised', 'frown'];
const MOVES = ['shrug', 'hand', 'arms'];
check('every face and move a line names exists', all.every((l) => FACES.includes(l.face) && MOVES.includes(l.move)));
check('every kind has a line', ['exit', 'crash', 'miss', 'lap', 'best', 'tidy'].every((k) => DAN_LINES[k] && DAN_LINES[k].length > 0));

/* ------------------------------------------------------------------ */
console.log('\n2. judge');
{
  const j = makeJudge();
  check('a miss is answered with a miss line', j.hear('miss', 1000)?.kind === 'miss');
  check('and then he is quiet', j.hear('miss', 1000 + QUIET_MS - 10) === null);
  check('until the quiet is over', j.hear('miss', 1000 + QUIET_MS + 10)?.kind === 'miss');
}
{
  const j = makeJudge();
  j.hear('gate', 5000);
  check('a hard hit soon after a gate is a failed exit', j.hear('crash', 5000 + CLEAN_EXIT_MS - 100)?.kind === 'exit');
}
{
  const j = makeJudge();
  j.hear('gate', 5000);
  check('a hard hit long after a gate is a plain crash', j.hear('crash', 5000 + CLEAN_EXIT_MS + 100)?.kind === 'crash');
  const k = makeJudge();
  check('a hard hit with no gate before it is a plain crash', k.hear('crash', 100)?.kind === 'crash');
}
{
  const j = makeJudge();
  check('the first lap is praised', j.hear('lap', 20000, { first: true, record: true })?.kind === 'best');
  check('a lap that is not the best is mocked', j.hear('lap', 60000, { first: false, record: false })?.kind === 'lap');
  check('a lap speaks even soon after a line', (() => {
    const k = makeJudge();
    k.hear('crash', 1000);
    return k.hear('lap', 1000 + QUIET_LAP_MS + 10, {})?.kind === 'lap';
  })());
}
{
  const j = makeJudge();
  let said = null;
  for (let g = 0; g < TIDY_GATES; g += 1) {
    said = j.hear('gate', 1000 + g * 800);
  }
  check('a run of clean gates is praised once', said?.kind === 'tidy' && j.hear('gate', 20000) === null);
  const k = makeJudge();
  k.hear('gate', 1000);
  k.hear('crash', 1500);
  let later = null;
  for (let g = 0; g < TIDY_GATES - 1; g += 1) {
    later = k.hear('gate', 10000 + g * 800);
  }
  check('a crash breaks the run', later === null);
}
{
  const j = makeJudge();
  const seen = [];
  for (let n = 0; n < DAN_LINES.miss.length * 2; n += 1) {
    seen.push(j.hear('miss', 10000 * (n + 1)).text);
  }
  const L = DAN_LINES.miss.length;
  check('every miss line is said before one is said again', new Set(seen.slice(0, L)).size === L && seen.slice(0, L).join('|') === seen.slice(L).join('|'));
  const k = makeJudge();
  k.hear('miss', 50000);
  check('a clock that goes back starts him again', k.hear('miss', 100)?.kind === 'miss');
}

/* ------------------------------------------------------------------ */
console.log('\n3. misses');
function raceOf(id) {
  const doc = normalize(JSON.parse(JSON.stringify(presetById(id)))).doc;
  const course = courseFromDocument(doc);
  const gates = course.stations.map((st, i) => ({
    flyOrder: st.flyOrder ?? i,
    position: { x: st.x, y: st.baseY ?? 0, z: st.z },
    heading: st.yaw,
    pitch: st.pitch ?? 0,
    apertures: [{
      shape: 'square', index: 0, sillH: 0, centreY: st.centreY, clearW: st.clearW, clearH: st.clearH,
    }],
    kindName: st.type,
    elementId: st.elementId,
    apertureIndex: 0,
    virtual: Boolean(st.virtual),
  }));
  const race = new Race(gates, course.trackClass);
  race.setRecordKey('dan-check.not.a.record');
  race.reset();
  return { race, course };
}
const IDS = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `racegow5-track${n}`);
for (const id of IDS) {
  const { race } = raceOf(id);
  const g = race.gates[race.next];
  const ap = g.apertures[0];
  const at = (x, y, z) => ({
    x: g.x + x * g.ax.x + y * g.ay.x + z * g.az.x,
    y: g.y + ap.centreY + x * g.ax.y + y * g.ay.y + z * g.az.y,
    z: g.z + x * g.ax.z + y * g.ay.z + z * g.az.z,
  });
  const hw = ap.clearW / 2;
  const miss = (x, zFrom, zTo) => race.missedGate(race.next, at(x, 0, zFrom), at(x, 0, zTo));
  check(`${id}: through the hole is not a miss`, miss(0, -0.3, 0.3) === false);
  check(`${id}: a crossing just outside the hole is a miss`, miss(hw * 1.4, -0.3, 0.3) === true);
  check(`${id}: a crossing far outside it is not`, miss(hw * 4, -0.3, 0.3) === false);
  check(`${id}: a crossing backwards is not`, miss(hw * 1.4, 0.3, -0.3) === false);
  check(`${id}: a travel that stops short of the plane is not`, miss(hw * 1.4, -0.6, -0.2) === false);
  check(`${id}: no such gate is not`, race.missedGate(999, at(0, 0, -1), at(0, 0, 1)) === false);
}

/* ------------------------------------------------------------------ */
console.log('\n4. body');
{
  const finite = (a) => Array.from(a).every(Number.isFinite);
  const st = danState(0);
  let ok = true;
  for (const move of ['', ...MOVES]) {
    for (const aim of [null, { x: 0, y: 1.2, z: 8 }, { x: 5, y: 3, z: -4 }, { x: -9, y: 0.2, z: 0.1 }]) {
      for (let T = 0; T < 6000; T += 37) {
        danAt(T, 16, aim, (T % 1000) / 1000, move, st);
        ok = ok && finite(st.pose.J) && Number.isFinite(st.pose.pelvisH) && Number.isFinite(st.headTurn);
      }
    }
  }
  check('every pose is finite, every move, every aim', ok);
  const ahead = danState(0);
  let turned = 0;
  for (let T = 0; T < 3000; T += 16) {
    turned += Math.abs(danAt(T, 16, { x: 0.5, y: 1.5, z: 10 }, 0, '', ahead));
  }
  check('a quad ahead of him turns his head and not his body', turned < 1e-9 && Math.abs(ahead.headTurn) < 0.2, `${turned} ${ahead.headTurn}`);
  const behind = danState(0);
  let spin = 0;
  for (let T = 0; T < 3000; T += 16) {
    spin += danAt(T, 16, { x: 6, y: 1.5, z: -6 }, 0, '', behind);
  }
  check('one behind his shoulder turns his body toward it', spin > 0.5, `${spin}`);
  check('and his head stays inside what a neck does', Math.abs(behind.headTurn) <= 1.0 + 1e-9);
}

/* ------------------------------------------------------------------ */
console.log('\n5. loading');
{
  check('all eight presets are credited to a RaceGOW series', IDS.every((id) => /^racegow/i.test(raceOf(id).course.series)));
  const own = normalize(JSON.parse(readFileSync(join(root, 'tracks/json/micro-livingroom-1.json'), 'utf8'))).doc;
  check('a track nobody credited is not', courseFromDocument(own).series === '');
  const custom = readFileSync(join(root, 'src/maps/custom.js'), 'utf8');
  check('custom.js reaches him by a dynamic import only', /await import\('\.\/dan\/index\.js'\)/.test(custom) && !/^import .*\/dan\//m.test(custom));
  const main = readFileSync(join(root, 'src/main.js'), 'utf8');
  check('main.js never imports him', !/^import .*\/dan\//m.test(main));
  const size = statSync(join(root, 'assets/dan/dan-manga.webp')).size;
  check('his picture is under 100 kB', size > 10000 && size < 100000, `${size} bytes`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
