/*
 * micro-check.js: the RaceGOW class, end to end, in Node.
 *
 * Two halves, both cheap enough to run on any change that touches the
 * builder, the document, the course reader or the race.
 *
 * THE PIPELINE. Every element the micro palette offers is placed, sequenced,
 * written, read back, warned about, turned into a course and drawn as a
 * plan. It exists because the micro class threads a track class through nine
 * modules, and the failure mode of a threading bug is not an exception: it
 * is a full sized default arriving somewhere quiet, which looks like a room
 * with 5 ft gates in it and no error anywhere.
 *
 * THE RACE. The demo course is flown through the real Race object, gate by
 * gate along each gate's own travel axis, in the 5 mm steps a whoop at
 * 5 m/s produces at 1 kHz. It checks that a 45 mm scoring volume still
 * catches a gate that a full sized 500 mm one would have caught, that three
 * laps close, and that the RaceGOW metric, the fastest three consecutive,
 * is the sum of the three laps that were flown.
 *
 * The full sized class is run through the same pipeline in the same pass,
 * because half of what this file is for is proving the micro work did not
 * move the field.
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

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createTrack, createElement, createSequenceEntry, normalize, toPlain, SCHEMA_VERSION,
} from '../src/trackbuilder/model.js';
import {
  paletteFor, trackClassOf, MICRO_GATE_PRESETS, applyGatePreset,
} from '../src/trackbuilder/elements.js';
import { collectWarnings } from '../src/trackbuilder/warnings.js';
import { courseFromDocument } from '../src/game/trackdoc.js';
import { planFromDocument } from '../src/share/plan.js';
import { Race } from '../src/game/race.js';
import { GATE_SCALE } from '../src/game/track.js';
import { GATE_OPENING_MAX } from '../src/trackbuilder/racegow.js';
import { PRESETS } from '../src/trackbuilder/presets.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

let fails = 0;
function check(name, ok, extra) {
  if (ok) {
    console.log(`  pass  ${name}`);
    return;
  }
  fails += 1;
  console.log(`  FAIL  ${name}${extra === undefined ? '' : `  ${extra}`}`);
}

function pipeline(cls) {
  console.log(`\n--- the ${cls} pipeline ---`);
  const doc = createTrack(`Check ${cls}`, cls);
  check('createTrack stamps the class', trackClassOf(doc) === cls, trackClassOf(doc));

  const placed = [];
  const types = paletteFor(cls);
  let i = 0;
  for (const type of types) {
    /* Spread out enough that the elements do not overlap on either field:
     * a RaceGOW room is 5 by 6 m and a MultiGP field is 60 by 40. */
    const step = cls === 'micro' ? 0.9 : 12;
    const el = createElement(doc, type, {
      x: -1.5 * step + (i % 4) * step,
      y: -1.0 * step + Math.floor(i / 4) * step,
    }, 0);
    doc.elements.push(el);
    placed.push(el);
    const bad = Object.entries(el.dims || {})
      .filter(([, v]) => typeof v === 'number' && !Number.isFinite(v));
    check(`place a ${type}`, bad.length === 0, JSON.stringify(el.dims));
    i += 1;
  }

  for (const el of placed) {
    try {
      doc.sequence.push(createSequenceEntry(doc, el.id, 0));
    } catch (e) {
      /* An obstacle refusing to be a step is the contract. See
       * createSequenceEntry: it refuses rather than making an entry the next
       * reload would silently delete. */
    }
  }

  const plain = toPlain(doc);
  const back = normalize(JSON.parse(JSON.stringify(plain))).doc;
  check('the class survives a write and a read', trackClassOf(back) === cls, trackClassOf(back));
  check('every element survives', back.elements.length === doc.elements.length,
    `${back.elements.length} of ${doc.elements.length}`);
  check('every step survives', back.sequence.length === doc.sequence.length,
    `${back.sequence.length} of ${doc.sequence.length}`);
  check('the schema version is written', plain.schemaVersion === SCHEMA_VERSION, plain.schemaVersion);

  const warns = collectWarnings(back);
  check('the warnings run', Array.isArray(warns));
  check('every warning has something to say',
    warns.every((w) => typeof w.message === 'string' && w.message.length > 0));
  console.log(`        ${warns.length} warning(s): ${[...new Set(warns.map((w) => w.code))].join(', ')}`);

  const course = courseFromDocument(back);
  check('the course reads', Boolean(course));
  check('the course carries the class', course.trackClass === cls, course.trackClass);
  const finite = (v) => typeof v === 'number' && Number.isFinite(v);
  const badStation = (course.stations || []).find((st) => !finite(st.x) || !finite(st.z)
    || !finite(st.clearW) || !finite(st.clearH) || !finite(st.centreY));
  check('every station is a number', !badStation, badStation && JSON.stringify(badStation).slice(0, 120));

  const gate = (course.stations || []).find((st) => st.type === 'gate');
  const want = cls === 'micro' ? GATE_OPENING_MAX : 1.524 * GATE_SCALE;
  check(cls === 'micro'
    ? 'a RaceGOW gate is built one to one'
    : 'a MultiGP gate keeps the 15 percent',
  gate && Math.abs(gate.clearW - want) < 1e-9, gate ? `${gate.clearW} wanted ${want}` : 'no gate');

  const plan = planFromDocument(back);
  check('the plan builds', Boolean(plan));
  check('the plan carries the class', plan.trackClass === cls, plan.trackClass);
  check('every mark is a number',
    plan.marks.every((m) => Number.isFinite(m.x) && Number.isFinite(m.y)));

  if (cls === 'micro') {
    for (const preset of MICRO_GATE_PRESETS) {
      const dims = { ...(placed.find((e) => e.type === 'gate').dims) };
      applyGatePreset(dims, preset);
      check(`the ${preset.id} preset gives a gate`, dims.clearW > 0 && dims.clearH > 0,
        JSON.stringify(dims));
    }
  }
}

function raceDemo() {
  console.log('\n--- three laps of the demo room ---');
  const raw = JSON.parse(readFileSync(join(root, 'tracks/json/micro-livingroom-1.json'), 'utf8'));
  const doc = normalize(raw).doc;
  const course = courseFromDocument(doc);
  check('the demo track is a room', course.trackClass === 'micro', course.trackClass);

  /* The same shape src/render/scene.js hands Race. */
  const gates = course.stations.map((st, i) => ({
    flyOrder: st.flyOrder ?? i,
    position: { x: st.x, y: st.baseY ?? 0, z: st.z },
    heading: st.yaw,
    pitch: st.pitch ?? 0,
    apertures: [{
      shape: 'square',
      index: 0,
      sillH: 0,
      centreY: st.centreY,
      clearW: st.clearW,
      clearH: st.clearH,
    }],
    kindName: st.type,
    elementId: st.elementId,
    apertureIndex: 0,
    virtual: Boolean(st.virtual),
  }));

  const race = new Race(gates, course.trackClass);
  race.setRecordKey('micro-check.not.a.record');
  race.reset();

  /*
   * Approached ALONG EACH GATE'S OWN TRAVEL AXIS, which is what a pilot does
   * and what tryPass reads. Walking from the last gate's centre to this one's
   * does not work and the reason is worth keeping: the demo's fifth station
   * is a tower directly above its fourth, so that line runs parallel to both
   * planes and crosses neither.
   */
  const STEP = 0.005;
  let simMs = 0;
  const missed = [];
  for (let hop = 0; hop < 60 && race.lap < 3; hop += 1) {
    const target = race.gates[race.next];
    const ap = target.apertures[0];
    const cy = (target.y ?? 0) + ap.centreY;
    const az = target.az;
    const from = {
      x: target.x - az.x * 0.30, y: cy - az.y * 0.30, z: target.z - az.z * 0.30,
    };
    const to = {
      x: target.x + az.x * 0.25, y: cy + az.y * 0.25, z: target.z + az.z * 0.25,
    };
    const total = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
    const steps = Math.max(2, Math.ceil(total / STEP));
    const before = race.next;
    const lapBefore = race.lap;
    let prev = { ...from };
    for (let s = 1; s <= steps; s += 1) {
      const t = s / steps;
      const curr = {
        x: from.x + (to.x - from.x) * t,
        y: from.y + (to.y - from.y) * t,
        z: from.z + (to.z - from.z) * t,
      };
      simMs += 1;
      race.update(prev, curr, simMs, simMs, true);
      prev = curr;
    }
    if (race.next === before && race.lap === lapBefore) {
      missed.push(`${before} (${target.kindName})`);
    }
  }
  check('every gate in the flying order scores', missed.length === 0, missed.join(', '));
  check('three laps close', race.lap === 3, race.lap);
  const clean = race.log.filter((l) => l.ms != null);
  check('three clean laps are logged', clean.length === 3, clean.length);
  const three = race.bestThreeMs();
  const best = race.bestLapMs();
  const sum = clean.reduce((a, l) => a + l.ms, 0);
  check('the fastest three consecutive is those three laps',
    three != null && Math.abs(three - sum) < 1e-6, `${three} against ${sum}`);
  check('the best lap is the smallest of them',
    best != null && best === Math.min(...race.laps), `${best} of ${race.laps.join(', ')}`);
  console.log(`        laps ${race.laps.map((m) => (m / 1000).toFixed(2)).join(', ')}`
    + `  best ${(best / 1000).toFixed(2)}  three ${(three / 1000).toFixed(2)}`);
}

/*
 * THE SHIPPED TRACKS, every one of them, every time.
 *
 * src/trackbuilder/presets.js is the only copy of the RaceGOW5 set and the
 * builder offers it in the Load dialog, so a preset that stops normalising
 * or stops producing a course is a track a pilot opens to an error. None of
 * them is reachable from any other check: the demo room is a file, and the
 * presets are a module.
 *
 * The envelope note is allowed and the reason is arithmetic rather than
 * indulgence. Two gates side by side at RaceGOW's own nominal 30 in centres
 * span 30 + 28 = 58 in, which is 1.47 m, and RaceGOW's own envelope at that
 * gate size is 1.42 m. The two published rules do not fit each other, and
 * tracks/json/micro-livingroom-1.json trips the same note at the same
 * 1.47 m. Anything that is not that note is a real finding and fails here.
 */
function presetSet() {
  console.log('\n--- the shipped tracks ---');
  check('there are presets at all', PRESETS.length > 0, PRESETS.length);
  for (const raw of PRESETS) {
    const { doc, repairs } = normalize(raw);
    check(`${raw.name} needs no repair`, repairs.length === 0,
      repairs.map((r) => r.text ?? r).join('; '));
    check(`${raw.name} names a designer`,
      Boolean(doc.credit && doc.credit.designer), JSON.stringify(doc.credit));
    const warns = collectWarnings(doc).map((w) => w.text ?? w.message ?? '');
    const hard = warns.filter((t) => !t.includes('A RaceGOW track fits'));
    check(`${raw.name} breaks no RaceGOW rule`, hard.length === 0, hard.join('; '));
    /*
     * A GATE STANDS UP OR IT LIES FLAT, and there is nothing in between.
     *
     * Every RaceGOW aperture is vertical except the Horizontal Gate, which
     * the rules also call a Cube Gate: the same square opening laid flat,
     * at 900 mm for a whoop, flown down through. elements.js carries
     * pitch 0 for gate, tower and doubleStack and PI/2 for diveGate, and
     * those two numbers are the whole vocabulary.
     *
     * This exists because a pass over these tracks invented leaning gates
     * at 0.34 to 0.40 rad, from reading an isometric render wrong: a
     * vertical gate turned in yaw draws as a parallelogram and looks like
     * it leans. Nothing caught it, because nothing was looking. Now
     * something is.
     */
    const tilts = doc.elements
      .filter((e) => Math.abs(e.pitch) > 1e-6)
      .map((e) => `${e.type} at ${e.pitch.toFixed(4)}`);
    const flatOnly = doc.elements.every(
      (e) => Math.abs(e.pitch) < 1e-6
        || (e.type === 'diveGate' && Math.abs(e.pitch - Math.PI / 2) < 1e-6),
    );
    check(`${raw.name} stands its gates up or lays them flat`, flatOnly, tilts.join('; '));
    let course = null;
    try {
      course = courseFromDocument(doc);
    } catch (e) {
      course = null;
      check(`${raw.name} builds a course`, false, e.message);
    }
    if (course) {
      check(`${raw.name} is a room`, course.trackClass === 'micro', course.trackClass);
      check(`${raw.name} has a lap to fly`, course.stations.length >= 3,
        `${course.stations.length} station(s)`);
      check(`${raw.name} plans`, Boolean(planFromDocument(doc)), 'planFromDocument');
    }
  }
  /* Two ids the same would make one of them unreachable through loadTrack. */
  const ids = PRESETS.map((d) => d.id);
  check('every preset id is unique', new Set(ids).size === ids.length, ids.join(', '));
}

pipeline('micro');
pipeline('full');
raceDemo();
presetSet();

console.log(`\n${fails ? `${fails} FAILED` : 'the micro class builds, reads, warns, draws and races'}`);
process.exit(fails ? 1 : 0);
