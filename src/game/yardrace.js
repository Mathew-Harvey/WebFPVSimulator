/*
 * yardrace.js: the timing of a track standing in a house map's yard
 * (src/maps/yardtrack/), the owner's ask of 2026-10-24: "i should be able
 * to just fly through the start gate and see a timer start with gate
 * sensors, if i fly too far away from the track the timer goes away and the
 * track resets".
 *
 * It is a Race (./race.js) on the track's gates, the same scoring every
 * RaceGOW track is flown on, with three things round it that a race on a
 * track map does not need, because here the track is one thing in a map a
 * pilot is free to fly all of:
 *
 *   NEAR     whether the craft is near enough to the track to be racing
 *            it (leftTrack below). Flying out
 *            of it resets the race, so the next run starts at the start
 *            gate again, and the shell takes the timer off the screen.
 *   ARMED    whether this craft may be timed here at all. Bardwell's place
 *            is a five inch map with a whoop's track in it, and the owner's
 *            rule is that it times the whoop only ("if i don't then the
 *            track doesn't start recording"). Disarmed, nothing scores.
 *   STARTED  whether the clock is running, which is the first pass of the
 *            start gate: until then the screen says to fly through it.
 *
 * Pure: no DOM, no Three.js, so scripts/yardtrack-check.js flies it.
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

import { Race } from './race.js';

/* Whether a craft at (x, y, z) has left the track: past leaveR of its
 * middle, or over its top. */
export function leftTrack(t, x, y, z) {
  const dx = x - t.centre.x;
  const dz = z - t.centre.z;
  return dx * dx + dz * dz > t.leaveR * t.leaveR || y - t.y > t.top;
}

/* Whether (x, z) is in the landing zone. */
export function inAskZone(t, x, z) {
  const a = t.ask;
  return x >= a.x0 && x <= a.x1 && z >= a.z0 && z <= a.z1;
}

export class YardRace {
  constructor(track) {
    this.track = track;
    this.race = new Race(track.gates, 'micro');
    this.near = false;
    this.armed = true;
  }

  /* The record this track's best lap is kept under, per map and per
   * machine: the shell's own key with the track's and the map's ids on. */
  setRecordKey(key) {
    this.race.setRecordKey(`${key}.yard.${this.track.courseId}.${this.track.id}`);
  }

  /* The weight and the tuning the laps are flown at, stamped as a track
   * map's laps are. */
  setWeight(w) {
    this.race.setWeight(w);
  }

  setTuned(t) {
    this.race.setTuned(t);
  }

  /* Back to before the start gate. */
  reset() {
    this.race.reset();
  }

  get started() {
    return this.race.lapStartMs != null;
  }

  /*
   * One frame's travel from `prev` to `curr` (the world, metres), ending at
   * `simMs` on the sim clock. `allow` is the shell's judgement that it was
   * flown (shouldScorePass). Returns { passed, lap, left }: the station
   * passed or null, whether a lap was counted, and whether this frame took
   * the craft out of the track's reach, which reset it.
   */
  step(prev, curr, simMs, wallMs, allow) {
    const out = { passed: null, lap: false, left: false };
    const near = !leftTrack(this.track, curr.x, curr.y, curr.z);
    if (!near) {
      if (this.near || this.race.next !== 0 || this.started) {
        this.race.reset();
        out.left = this.near;
      }
      this.near = false;
      return out;
    }
    this.near = true;
    if (!this.armed) {
      return out;
    }
    const lapsBefore = this.race.laps.length;
    const res = this.race.update(prev, curr, simMs, wallMs, allow);
    out.passed = res.passed;
    out.lap = this.race.laps.length > lapsBefore;
    return out;
  }
}
