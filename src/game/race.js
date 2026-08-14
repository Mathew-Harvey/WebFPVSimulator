/*
 * race.js: the race. Gate sequencing, lap timing, best lap, and gate
 * frame contact.
 *
 * Scoring aperture is the glowing RING, not the outer frame: the ring is
 * what a pilot aims at, and at 3.3 m effective diameter it demands a
 * line, where the full 6 by 5 frame was a barn door. Detection is a
 * plane crossing test in the gate's local frame, swept over the segment
 * the craft travelled this frame, so speed cannot tunnel a gate.
 *
 * Lap times run on the SIMULATION clock, interpolated to the crossing
 * point, not on the wall clock: a frame hitch freezes the quad, and a
 * scoreboard that keeps counting while the physics stands still would
 * punish slow machines. The whole project is built on deterministic
 * physics; the timing is only honest if it reads the same clock.
 *
 * Touching a gate frame voids the lap rather than destroying the craft:
 * no real race kills you for a gate tap, the penalty is your lap.
 *
 * All of this runs in Three.js world space (y up), downstream of the
 * physics. Nothing here feeds back into the simulation.
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
 * The scoring aperture is the aperture the pilot can SEE, taken from the
 * scene's own measured openings rather than restated here.
 *
 * This file used to carry its own copy of the gate's geometry: GATE_HALF_W
 * 3.0, GATE_H 5.0, RING_R 1.9, CRAFT_R 0.25. Three of those four disagreed
 * with what scene.js drew, and the scoring test subtracted the craft radius
 * from the torus CENTRELINE while ignoring the tube, so a craft could be
 * credited with a clean pass while its body passed through the ring. A gate
 * that scores differently from how it looks is a gate the pilot cannot learn.
 *
 * Frame contact used to live here too and it voided the lap. It does not any
 * more: the frame is solid, collision is src/game/collide.js, and hitting
 * one is a crash. The owner's words were that the gates need to be solid.
 *
 * CRAFT_WORLD_R, not CRAFT_R: the aperture is a world length, measured off
 * the gate the scene drew, so the craft folded into it has to be the craft in
 * the world's metres. Mixing the airframe's own 0.1735 m into a world test
 * would score every gate against a quad a quarter larger than the one flying
 * through it, which is the same class of error as the 0.1885 radius.
 */
import { CRAFT_WORLD_R } from './collide.js';
import { fastestLap, fastestThreeConsecutive } from './track.js';

const DEFAULT_KEY = 'webfpv.bestLapMs';

function fmt(ms) {
  if (ms == null || !Number.isFinite(ms)) {
    return '--:--.--';
  }
  const s = ms / 1000;
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(2).padStart(5, '0')}`;
}

export class Race {
  /* gates: [{ position: Vector3 (base, on terrain), heading: rad }] in
   * scene order along the curve, gate 0 the start and finish line.
   *
   * The craft spawns facing opposite the curve's parameter direction
   * (verified numerically: spawn forward dot tangent = -1), so the course
   * as flown runs 0, 7, 6, ... 1, 0. The gates are stored in that flying
   * order, and each heading is flipped so local +z is the direction of
   * travel. */
  constructor(gates) {
    /*
     * A map with no gates is a freestyle map, and it is not an error.
     *
     * This constructor used to dereference gates[0] unconditionally, which is
     * why the shell could not boot a gateless map: `new Race([])` threw before
     * the first frame. Every method below already reads this.gates, so making
     * an empty course a real state costs one flag and a handful of guards, and
     * it means the shell has ONE run object rather than a race and a null
     * object that have to be kept in step. Nothing in a freestyle run is
     * scored: there is no next gate, no lap, no clock and no record.
     */
    this.freestyle = gates.length === 0;
    if (this.freestyle) {
      this.gates = [];
      this.key = DEFAULT_KEY;
      this.bestMs = null;
      this.reset();
      return;
    }
    /*
     * FLYING ORDER COMES FROM THE GATES, NOT FROM AN ASSUMPTION.
     *
     * This used to be `[0, n-1, n-2, ... 1]`, which is right for the built in
     * circuit and right for nothing else. It is right there because that
     * circuit lays its stations along a curve and the craft spawns facing
     * against the curve's parameter, so array order happens to BE reverse
     * flying order. A course somebody designed has its own order, written
     * down in the document, and inferring one from an array index would fly
     * it backwards.
     *
     * The scene has always stamped `flyOrder` on every gate. Sorting by it
     * produces exactly the old sequence for the built in field, which
     * tests/lib/checks.js asserts rather than takes on trust, and the right
     * one everywhere else.
     */
    const order = gates
      .map((g, idx) => ({ idx, flyOrder: g.flyOrder ?? (idx === 0 ? 0 : gates.length - idx) }))
      .sort((a, b) => a.flyOrder - b.flyOrder)
      .map((e) => e.idx);
    this.gates = order.map((idx) => {
      const g = gates[idx];
      /*
       * THE APERTURE FRAME.
       *
       * A gate's plane is fixed by a heading and, on a dive gate, a tilt.
       * The frame below is the gate's own axes in world space, with the
       * direction of travel as local +z, which is MINUS the plane normal:
       * that convention is the field's, set by stations whose heading is the
       * curve tangent, and every consumer of it is here.
       *
       *   yaw h alone gives normal (sin h, 0, cos h).
       *   tilting by p about the gate's own x takes it to
       *   (cos p sin h, -sin p, cos p cos h).
       *
       * At p = 0 every term below collapses to the two cosines and sines
       * this used to carry, so the built in circuit is scored by identical
       * arithmetic and the same lap times come out.
       */
      const h = g.heading;
      const p = g.pitch ?? 0;
      const cp = Math.cos(p);
      const sp = Math.sin(p);
      /* Across the opening. Unaffected by the tilt, which is about this axis. */
      const ax = { x: -Math.cos(h), y: 0, z: Math.sin(h) };
      /* Up the opening, in its own plane. */
      const ay = { x: sp * Math.sin(h), y: cp, z: sp * Math.cos(h) };
      /* Along the direction of travel. */
      const az = { x: -cp * Math.sin(h), y: sp, z: -cp * Math.cos(h) };
      return {
        idx,
        x: g.position.x,
        y: g.position.y,
        z: g.position.z,
        ax,
        ay,
        az,
        /* Every opening this STATION scores. A standard gate has one. The
         * built in circuit's ladders pass every opening and count the
         * structure as one gate. A designed stack names the hole, so the
         * scene hands one aperture per station and a double stack flown as
         * a spiral is two gates, not one. */
        apertures: g.apertures ?? [g.aperture],
        kindName: g.kindName ?? 'standardGate',
        /* Same structure id on every station of a stacked gate. Null on the
         * built in circuit, which has one station per obstacle. */
        elementId: g.elementId ?? null,
        apertureIndex: g.apertureIndex ?? null,
      };
    });
    this.key = DEFAULT_KEY;
    this.bestMs = this.loadBest();
    this.reset();
  }

  loadBest() {
    try {
      const v = Number(localStorage.getItem(this.key));
      return Number.isFinite(v) && v > 0 ? v : null;
    } catch (e) {
      return null;
    }
  }

  /* Best laps are only comparable on the same config and pack voltage;
   * the shell keys the record accordingly and swaps it here. */
  setRecordKey(key) {
    if (this.freestyle) {
      return;
    }
    this.key = key;
    this.bestMs = this.loadBest();
  }

  reset() {
    this.next = 0;
    this.lap = 0;
    this.lapStartMs = null; /* sim clock */
    this.lastLapMs = null;
    this.prevSimMs = null;
    this.flash = null; /* { text, untilMs } on the wall clock */
    /* Every attempt at a lap, in order: { n, ms } for a clean lap and
     * { n, ms: null, reason } for one thrown away. The results screen
     * needs the thrown away ones too, or a run whose second lap was
     * voided reports its third lap as lap two, which is a lie about what
     * the player just did. */
    this.log = [];
    this.laps = [];         /* completed clean lap times, in order */
    this.voided = 0;        /* laps thrown away by a crash */
    this.lastOpening = -1;  /* which opening of a stacked obstacle was used */
  }

  /* Number of the lap now being flown, counting voided attempts. */
  lapNumber() {
    return this.log.length + 1;
  }

  /*
   * Throw the running lap away without ending the run. Used by a gate
   * touch and by a crash: neither should cost the laps already flown.
   */
  /*
   * A crash the pilot flies out of rather than a lap thrown away.
   *
   * WHAT CHANGED AND WHY. Hitting something used to void the lap AND send
   * the craft to the start line with `next` reset to zero, so one clipped
   * upright cost the whole lap and put you back at the timing gate to fly it
   * again. The owner asked for the racing sim behaviour instead: you are put
   * back on the course in front of the gate you were flying at, and you
   * carry on. The clock never stops, so the crash costs exactly what it
   * costs, which is the lockout plus the time to get moving again.
   *
   * The lap is NOT voided, and that is a rule changing rather than a rule
   * bending: the note beside GRAZE_SPEED_MAX in src/game/collide.js already
   * observed that voiding for obstacle contact is harsher than the physics
   * and harsher than the MultiGP rulebook, which does not invalidate a lap
   * for touching a gate. Time is the penalty now.
   *
   * `next` is untouched, which is what makes the respawn honest: you are put
   * behind a gate you have NOT flown, so you still have to fly it. The
   * distance the respawn skips is roughly what the lockout and the standing
   * start cost you, so crashing on purpose to shortcut a long leg is
   * break even at best.
   */
  recover(reason, wallMs) {
    this.flash = { text: reason, untilMs: wallMs + 1800 };
  }

  voidLap(reason, wallMs) {
    if (this.freestyle) {
      /* Nothing to void, but a crash still says so. The shell calls this from
       * one place for both maps on purpose: two crash paths is how the two
       * drift apart. */
      this.flash = { text: reason, untilMs: wallMs + 1800 };
      return;
    }
    if (this.lapStartMs != null) {
      this.log.push({ n: this.lapNumber(), ms: null, reason });
      this.voided += 1;
    }
    this.lapStartMs = null;
    this.next = 0;
    this.flash = { text: reason, untilMs: wallMs + 1800 };
  }

  /*
   * World point into an OPENING's local frame: x across it, y up it in its
   * own plane, z along the direction of travel, with the origin at the
   * opening's centre.
   *
   * The origin moved from the gate's base to the opening's centre when the
   * tilt arrived, because a tilted plane pivots about the hole rather than
   * about the ground under it. For an upright gate the two frames differ by
   * a shift along y that the caller used to make itself, so the test is the
   * same one.
   */
  local(g, centreY, px, py, pz) {
    const dx = px - g.x;
    const dy = py - (g.y + centreY);
    const dz = pz - g.z;
    return {
      x: dx * g.ax.x + dy * g.ax.y + dz * g.ax.z,
      y: dx * g.ay.x + dy * g.ay.y + dz * g.ay.z,
      z: dx * g.az.x + dy * g.az.y + dz * g.az.z,
    };
  }

  /* Segment prev to curr against the next gate's plane. A pass is a
   * crossing in the direction of travel whose interpolated crossing
   * point lies inside the ring, craft radius folded in. Returns the sim
   * time of the crossing, or null. */
  tryPass(prev, curr, prevSimMs, simMs, wallMs) {
    const g = this.gates[this.next];
    /*
     * Every opening is tested in ITS OWN frame. On an upright stack all of
     * them share one plane, so this is the single crossing test it always
     * was, run once per opening against identical arithmetic. On a tilted
     * one the planes are parallel but offset, because each hole leans about
     * its own centre, and testing them against a plane through the base
     * would score a dive gate against a hole that is not where it is.
     *
     * A square opening scores as a square, with the craft's own radius
     * folded in on both axes, so a pass the game credits is a pass the
     * craft's body actually fits through.
     */
    let used = -1;
    let t = 0;
    for (let k = 0; k < g.apertures.length; k += 1) {
      const ap = g.apertures[k];
      const a = this.local(g, ap.centreY, prev.x, prev.y, prev.z);
      const b = this.local(g, ap.centreY, curr.x, curr.y, curr.z);
      if (!(a.z <= 0 && b.z > 0)) {
        continue;
      }
      const tk = a.z / (a.z - b.z);
      const cx = a.x + (b.x - a.x) * tk;
      const cy = a.y + (b.y - a.y) * tk;
      const halfW = ap.clearW * 0.5 - CRAFT_WORLD_R;
      const halfH = ap.clearH * 0.5 - CRAFT_WORLD_R;
      if (Math.abs(cx) <= halfW && Math.abs(cy) <= halfH) {
        used = k;
        t = tk;
        break;
      }
    }
    if (used < 0) {
      return null;
    }
    this.lastOpening = used;
    const crossMs = prevSimMs + (simMs - prevSimMs) * t;
    const passed = this.next;
    this.next = (this.next + 1) % this.gates.length;
    if (passed === 0) {
      if (this.lapStartMs != null) {
        this.lastLapMs = crossMs - this.lapStartMs;
        this.lap += 1;
        this.laps.push(this.lastLapMs);
        this.log.push({ n: this.lapNumber(), ms: this.lastLapMs });
        let msgText = `Lap ${this.log.length}   ${fmt(this.lastLapMs)}`;
        if (this.bestMs == null || this.lastLapMs < this.bestMs) {
          this.bestMs = this.lastLapMs;
          msgText += '\nNew track record';
          /* Off the flight frame. This runs from the render loop, and a
           * synchronous localStorage write lands on exactly the frame the
           * pilot is watching their personal best appear. */
          const record = String(Math.round(this.bestMs));
          const store = () => {
            try {
              localStorage.setItem(this.key, record);
            } catch (e) {
              /* private mode: best lap simply does not persist */
            }
          };
          if (typeof requestIdleCallback === 'function') {
            requestIdleCallback(store, { timeout: 2000 });
          } else {
            setTimeout(store, 0);
          }
        }
        this.flash = { text: msgText, untilMs: wallMs + 2600 };
      }
      this.lapStartMs = crossMs;
    }
    return passed;
  }

  /*
   * Did the segment cross THIS gate's opening in the direction of travel? The
   * same test tryPass makes, without the scoring side effects, so the sequence
   * rule and the scoring cannot disagree about what a crossing is.
   */
  crossesGate(g, prev, curr) {
    /* Opening by opening in its own frame, the same walk tryPass makes. */
    for (let k = 0; k < g.apertures.length; k += 1) {
      const ap = g.apertures[k];
      const a = this.local(g, ap.centreY, prev.x, prev.y, prev.z);
      const b = this.local(g, ap.centreY, curr.x, curr.y, curr.z);
      if (!(a.z <= 0 && b.z > 0)) {
        continue;
      }
      const t = a.z / (a.z - b.z);
      const cx = a.x + (b.x - a.x) * t;
      const cy = a.y + (b.y - a.y) * t;
      if (Math.abs(cx) <= ap.clearW * 0.5 - CRAFT_WORLD_R
        && Math.abs(cy) <= ap.clearH * 0.5 - CRAFT_WORLD_R) {
        return true;
      }
    }
    return false;
  }

  /* Per frame. simMs is the simulation clock at the rendered state,
   * wallMs the wall clock (flash expiry only). Returns
   * { passed: gateIndex|null, hitFrame: bool }; a frame hit voids the
   * running lap, it does not crash the craft. */
  update(prev, curr, simMs, wallMs) {
    if (this.freestyle) {
      return { passed: null, hitFrame: false, opening: -1 };
    }
    const prevSimMs = this.prevSimMs ?? simMs;
    this.prevSimMs = simMs;
    const passed = this.tryPass(prev, curr, prevSimMs, simMs, wallMs);
    /*
     * MultiGP's own rule, which track.js quotes verbatim and this file did not
     * enforce: "If any obstacle is entered out of sequence or direction at any
     * time the run is invalid." Crossing a gate that is not the one the race
     * wants now voids the lap. It costs no time to do, so it was never an
     * exploit, but a file that quotes a rule should obey it.
     */
    if (passed == null && this.lapStartMs != null) {
      const want = this.gates[this.next];
      for (let gi = 0; gi < this.gates.length; gi += 1) {
        if (gi === this.next) {
          continue;
        }
        const other = this.gates[gi];
        /* Other holes of the stack you are flying at. Going through the
         * top while the bottom is next is a miss, not a lap void: they
         * share a plane, and a void for the unused opening would make a
         * double stack unflyable. A different structure still voids. */
        if (want.elementId != null && other.elementId === want.elementId) {
          continue;
        }
        if (this.crossesGate(other, prev, curr)) {
          this.voidLap('Out of sequence\nLap void', wallMs);
          break;
        }
      }
    }
    /* hitFrame is gone. The frame is solid geometry now and touching it is a
     * crash, decided by src/game/collide.js in the shell, not a lap penalty
     * decided here. The return shape keeps its second field so the shell's
     * call site does not have to care which round it is. */
    return { passed, hitFrame: false, opening: this.lastOpening };
  }

  /* UTT is scored on one lap and chapter racing on three consecutive, so
   * both are reported. A voided lap breaks a run of three, which is what
   * the word consecutive means, and fastestThreeConsecutive enforces it by
   * reading the log rather than the clean list. */
  bestLapMs() {
    return fastestLap(this.laps);
  }

  bestThreeMs() {
    return fastestThreeConsecutive(this.log);
  }

  /* Scene index of the gate the race wants next, for highlighting. */
  nextSceneIndex() {
    return this.freestyle ? -1 : this.gates[this.next].idx;
  }

  flashText(wallMs) {
    if (this.flash && wallMs < this.flash.untilMs) {
      return this.flash.text;
    }
    return null;
  }

  /* Running lap time on the sim clock, or null before the first gate. */
  currentLapMs(simMs) {
    if (this.freestyle) {
      return null;
    }
    return this.lapStartMs != null ? simMs - this.lapStartMs : null;
  }
}
