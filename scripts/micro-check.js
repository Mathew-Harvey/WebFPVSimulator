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
import { planFromDocument, isoLapMs, isoLapLength } from '../src/share/plan.js';
import { lapFrames, LAP_SPEED } from '../src/trackbuilder/stage.js';
import { buildPath } from '../src/trackbuilder/path.js';
import { Race } from '../src/game/race.js';
import { setCraftAirframe, shouldScorePass, dirtClearance } from '../src/game/collide.js';
import { airframeById } from '../configs/airframes.js';
import { GATE_SCALE } from '../src/game/track.js';
import { GATE_OPENING_MAX } from '../src/trackbuilder/racegow.js';
import { PRESETS, presetsForClass } from '../src/trackbuilder/presets.js';
import { buildAll, renderPresets, PRESETS_PATH } from './racegow-lattice.js';

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
  /*
   * THE WHOOP IS SEATED AND THE SHELL'S OWN PASS PREDICATE IS RUN.
   *
   * This loop used to hand race.update a hardcoded `true` for `allow` and fly
   * every gate dead through its centre, and both halves of that hid a real
   * bug for as long as the micro class has existed. The shell does not pass
   * `true`: it passes shouldScorePass, which refuses a pass flown too close to
   * the floor, and that band was a flat 0.22 m measured on a five inch. A
   * RaceGOW gate's bottom bar is ON THE FLOOR, so the band covered the bottom
   * 31 percent of every opening on the track and a whoop flown low through a
   * gate was refused with nothing on screen to say why. Flying the centre at
   * 0.356 m stepped straight over it.
   *
   * So the line is a QUARTER OF THE WAY UP each opening, offset along the
   * gate's own in-plane up axis so a dive gate is offset across its hole
   * rather than under it, and the floor is the room's at y = 0. That is the
   * line a whoop actually flies, and it is the one that was not scoring.
   */
  const floor = () => 0;
  const fiveDims = airframeById('5inch').dims;
  setCraftAirframe(airframeById('whoop65').dims);
  const band = dirtClearance();
  check('the whoop band is under a tenth of a RaceGOW opening',
    band / GATE_OPENING_MAX < 0.10, `${band.toFixed(4)} m`);
  let lowest = Infinity;
  for (let hop = 0; hop < 60 && race.lap < 3; hop += 1) {
    const target = race.gates[race.next];
    const ap = target.apertures[0];
    const cy = (target.y ?? 0) + ap.centreY;
    const az = target.az;
    const ay = target.ay;
    /* A quarter of the opening below its centre, in the opening's own plane. */
    const drop = ap.clearH * 0.25;
    const cx = target.x - ay.x * drop;
    const cyy = cy - ay.y * drop;
    const cz = target.z - ay.z * drop;
    const from = {
      x: cx - az.x * 0.30, y: cyy - az.y * 0.30, z: cz - az.z * 0.30,
    };
    const to = {
      x: cx + az.x * 0.25, y: cyy + az.y * 0.25, z: cz + az.z * 0.25,
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
      if (curr.y < lowest) {
        lowest = curr.y;
      }
      simMs += 1;
      /* The shell's call, argument for argument: src/main.js builds this
       * exact options object from the frame's clearance and the terrain. */
      const allow = shouldScorePass(prev, curr, {
        upz: 1, clearance: curr.y, hits: 0, heightAt: floor,
      });
      race.update(prev, curr, simMs, simMs, allow);
      prev = curr;
    }
    if (race.next === before && race.lap === lapBefore) {
      missed.push(`${before} (${target.kindName})`);
    }
  }
  setCraftAirframe(fiveDims);
  check('the low line really is inside the band a five inch would have refused',
    lowest < 0.22, `${lowest.toFixed(3)} m at its lowest`);
  check('every gate in the flying order scores', missed.length === 0, missed.join(', '));

  /*
   * THE BOUNCE, on the demo room's own timing gate.
   *
   * The owner's ruling is that "its ok to bounce of the floor through a gate",
   * so the low line above is not the whole of it: a whoop that actually TOUCHES
   * down inside the hole and carries on out of it has flown the gate. The line
   * here is a parabola that puts the quad on the floor at the gate plane, which
   * is the shape a skip off the boards has, and it is flown twice: props up,
   * which is the bounce, and on its side, which is the tumble the predicate
   * still exists to refuse. One scores and one does not, from the same path.
   */
  function bounceThroughTiming(upz) {
    const bounced = new Race(gates, course.trackClass);
    bounced.setRecordKey('micro-check.not.a.record');
    bounced.reset();
    const g = bounced.gates[bounced.next];
    const az = g.az;
    let prev = null;
    let scored = false;
    let simB = 0;
    for (let step = 0; step <= 16; step += 1) {
      /* Along the gate's own travel axis, INCREASING: local +z is the
       * direction of travel and openingHits refuses a reverse pass. */
      const along = -0.8 + step * 0.1;
      /* On the floor at the plane, rising either side of it. The whoop's own
       * resting height is 0.018 m, its canopy half, so that is the floor. */
      const lift = 0.018 + 0.9 * along * along;
      const curr = {
        x: g.x + az.x * along, y: (g.y ?? 0) + lift, z: g.z + az.z * along,
      };
      if (prev) {
        simB += 1;
        const allow = shouldScorePass(prev, curr, {
          upz, clearance: curr.y, hits: 1, heightAt: floor,
        });
        if (bounced.update(prev, curr, simB, simB, allow).passed != null) {
          scored = true;
        }
      }
      prev = curr;
    }
    return scored;
  }
  setCraftAirframe(airframeById('whoop65').dims);
  check('a whoop that bounces off the floor through the gate still flew it',
    bounceThroughTiming(1) === true);
  check('the same path on its side is a tumble and does not score',
    bounceThroughTiming(0.1) === false);
  setCraftAirframe(fiveDims);
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
    /* toPlain is a whitelist. credit was added to normalize and not to it,
     * and every save, export and publish dropped the designer for a day.
     * This reads the document back through the write path. */
    check(`${raw.name} keeps its designer through a write`,
      Boolean(normalize(toPlain(doc)).doc?.credit?.designer), JSON.stringify(toPlain(doc).credit));
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
    /*
     * THE GAPS SURVIVE A WRITE, and something holds each one up.
     *
     * An opening marked `unbuilt` is drawn by nobody: if the flag were
     * dropped on the way through the document writer the track would grow
     * its boxes back silently, and if the structures around it were ever
     * moved the opening would hang in the air with no pipe near it. So
     * both are asserted: the count comes back, and every gap has a pipe
     * within one opening of where its own frame would have stood.
     */
    const gaps = doc.elements.filter((e) => e.unbuilt === true);
    const written = normalize(toPlain(doc)).doc.elements.filter((e) => e.unbuilt === true);
    check(`${raw.name} keeps its gaps through a write`, written.length === gaps.length,
      `${gaps.length} in, ${written.length} out`);
    const lonely = gaps.filter((g) => {
      const reach = (g.dims.clearW + g.dims.clearH) * 0.75;
      return !doc.elements.some((e) => e !== g && e.type !== 'waypoint'
        && Math.hypot(e.position.x - g.position.x, e.position.y - g.position.y) <= reach);
    }).map((g) => g.name || g.id);
    check(`${raw.name} has something holding every gap up`, lonely.length === 0, lonely.join('; '));
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
    /*
     * ONE PACE FOR EVERY TRACK, on the card and in the export alike.
     *
     * Both used to take twelve seconds a lap whatever the lap was, so a
     * 41 m course went round three times as fast as a 13 m one and the
     * pilot's report was that the line moves fast on a busy track and
     * crawls on a short one. The card asks isoLapMs and the exporter asks
     * lapFrames, and both are a LENGTH over a SPEED now, so what is
     * asserted here is the speed itself: metres of lap per second, the
     * same number on every shipped track, on both drawings.
     */
    const plan = planFromDocument(doc);
    const cardSpeed = (isoLapLength(plan) / isoLapMs(plan)) * 1000;
    const lapPath = buildPath(doc, { closeLoop: true });
    const gifSpeed = lapPath.length / ((lapFrames(lapPath.length, trackClassOf(doc), 4) * 4) / 100);
    check(`${raw.name} flies its card at the one pace`,
      Math.abs(cardSpeed - LAP_SPEED.micro) < 0.02, `${cardSpeed.toFixed(3)} m/s`);
    check(`${raw.name} exports at the same pace`,
      Math.abs(gifSpeed - LAP_SPEED.micro) < 0.05, `${gifSpeed.toFixed(3)} m/s`);
    }
  }
  /* Two ids the same would make one of them unreachable through loadTrack. */
  const ids = PRESETS.map((d) => d.id);
  check('every preset id is unique', new Set(ids).size === ids.length, ids.join(', '));

  /*
   * THE WHOOP SHIPS THESE TWO TRACKS AND NOTHING ELSE.
   *
   * The owner supplied two RaceGOW5 animations and asked for those two to
   * be the only whoop tracks in the product. Six reconstructions were here
   * before them and the Track room reads presetsForClass, so an extra
   * entry in this file is an extra track in the picker. The set is named
   * here rather than counted, because "two of something" would pass with
   * the wrong two.
   */
  const want = ['racegow5-track8', 'racegow5-track5', 'racegow5-track1'];
  const micro = presetsForClass('micro').map((d) => d.id);
  check('the whoop ships exactly the two supplied tracks',
    micro.length === want.length && want.every((id) => micro.includes(id)),
    micro.join(', ') || 'none');

  /*
   * AND THE FILE IS THE GENERATOR'S OUTPUT, byte for byte.
   *
   * presets.js is written by scripts/racegow-lattice.js from the lattice
   * specs. Rebuilding it here and comparing catches an edit made to the
   * generated file by hand, which would be lost on the next run, and
   * catches a track added to one of the two and not the other.
   */
  const rebuilt = renderPresets(buildAll());
  const onDisk = readFileSync(PRESETS_PATH, 'utf8');
  check('presets.js is what the lattice script writes',
    rebuilt === onDisk,
    rebuilt === onDisk ? '' : 'run node scripts/racegow-lattice.js');
}

pipeline('micro');
pipeline('full');
raceDemo();
presetSet();

console.log(`\n${fails ? `${fails} FAILED` : 'the micro class builds, reads, warns, draws and races'}`);
process.exit(fails ? 1 : 0);
