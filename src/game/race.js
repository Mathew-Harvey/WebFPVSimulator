/*
 * race.js: the race. Gate sequencing, lap timing, best lap, and gate
 * frame contact.
 *
 * Scoring aperture is the glowing RING, not the outer frame: the ring is
 * what a pilot aims at. Detection is a swept box in the gate's local
 * frame, the opening extruded a short way along the direction of travel,
 * so a line through the hole at an angle still counts and a dive gate
 * scores against the same plane the mesh stands in.
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
 * The scoring hole is the visible opening, minus a fingernail of margin.
 * Folding the craft radius in on top of that was a second shrink: a 1.75 m
 * gate offered 1.40 m, and a clean line near the stile did not count.
 * Collision already owns a clip of the tube.
 */
import { fastestLap, fastestThreeConsecutive } from './track.js';

/*
 * How far the scoring volume sticks out either side of the opening, metres.
 *
 * A zero-thickness plane is exact when you fly square through the middle
 * and silent when you do not: a dive, a split-S, a line that clips the
 * near edge of a thick hoop, all cross the midplane outside the rectangle
 * even though the craft went through the hole the pilot can see. Half a
 * metre of depth is the frame's own thickness plus a little, enough that
 * a path through the visible opening intersects the box, not enough that
 * flying past the gate to one side can clip it.
 */
const PASS_DEPTH = 0.5;
/* Keep the scoring hole a fingernail inside the PVC so a pass credited
 * here is a pass that did not have to tunnel the tube. Collision already
 * owns a real clip. This is not the craft radius: folding that in stole
 * 35 cm off a 1.75 m opening and made a clean edge line miss. */
const PASS_MARGIN = 0.02;

const DEFAULT_KEY = 'webfpv.bestLapMs';

/*
 * A gate's own frame, from its heading and pitch. Exported because
 * render/scene.js had travelAxis written out again, and the direction of
 * travel through a gate deciding two different things in two files is how a
 * dive gate ends up drawn along one axis and scored along another. The game
 * owns this: the renderer imports it, never the other way round.
 */
export function gateAcross(heading) {
  return { x: -Math.cos(heading), y: 0, z: Math.sin(heading) };
}

export function gateUp(heading, pitch) {
  const sp = Math.sin(pitch);
  return { x: sp * Math.sin(heading), y: Math.cos(pitch), z: sp * Math.cos(heading) };
}

export function travelAxis(heading, pitch) {
  const cp = Math.cos(pitch);
  return { x: -cp * Math.sin(heading), y: Math.sin(pitch), z: -cp * Math.cos(heading) };
}

/* The same shape ui.js formatTime writes: no leading "0:" under a minute.
 * The flash and the results table used to spell one lap two ways. */
function fmt(ms) {
  if (ms == null || !Number.isFinite(ms)) {
    return '--:--.--';
  }
  const total = ms / 1000;
  const m = Math.floor(total / 60);
  const s = total - m * 60;
  if (m > 0) {
    return `${m}:${s.toFixed(2).padStart(5, '0')}`;
  }
  return s.toFixed(2);
}

export class Race {
  /* gates: [{ position: Vector3 (base, on terrain), heading: rad }] in
   * scene order along the curve. The first non-virtual gate times the lap.
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
      /* g.flyOrder, with no fallback. It used to default to
       * `idx === 0 ? 0 : gates.length - idx`, which is scene.js's built in
       * circuit ordering written out a second time, in the one file that
       * must not have its own opinion about flying order. Every caller has
       * supplied flyOrder for a while; a course that does not is a bug in
       * the caller and should read as one rather than being silently
       * scored in an order nobody chose. */
      .map((g, idx) => ({ idx, flyOrder: g.flyOrder }))
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
      const ax = gateAcross(h);
      const ay = gateUp(h, p);
      const az = travelAxis(h, p);
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
        /* A flag or a cone scores as a square on its pass side, with no
         * PVC. The first real opening is still the timing gate. */
        virtual: Boolean(g.virtual),
      };
    });
    this.timingIdx = 0;
    for (let i = 0; i < this.gates.length; i += 1) {
      if (!this.gates[i].virtual) {
        this.timingIdx = i;
        break;
      }
    }
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
    /* The record as this run began. The live best updates on a faster
     * lap, and the results screen needs the old figure to say whether
     * this run beat it and by how much. */
    this.recordAtStart = this.bestMs;
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

  /*
   * Throw the running lap away and send the order back to the timing gate.
   *
   * NOTHING CALLS THIS ANY MORE and that is a statement of the rules rather
   * than an oversight. A gate tap is a crash and costs time, not the lap;
   * flying a gate out of sequence costs nothing at all, by the owner's
   * instruction; see update(). It stays because voiding a lap is a real
   * operation on the run, the results screen still knows how to show one, and
   * the next rule that needs it should not have to reinvent the bookkeeping.
   */
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

  /*
   * Does the travel from local point a to local point b hit this opening?
   * The opening is an AABB: the visible rectangle extruded PASS_DEPTH either
   * side of the plane. Forward motion only, so a reverse pass does not
   * count. Returns the parameter t in [0, 1] at first contact, or -1.
   */
  openingHits(a, b, halfW, halfH) {
    if (!(halfW > 0) || !(halfH > 0)) {
      return -1;
    }
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    if (dz <= 1e-9) {
      return -1;
    }
    let t0 = 0;
    let t1 = 1;
    const clip = (p, d, lo, hi) => {
      if (Math.abs(d) < 1e-12) {
        return p >= lo && p <= hi;
      }
      let u0 = (lo - p) / d;
      let u1 = (hi - p) / d;
      if (u0 > u1) {
        const tmp = u0;
        u0 = u1;
        u1 = tmp;
      }
      if (u0 > t0) {
        t0 = u0;
      }
      if (u1 < t1) {
        t1 = u1;
      }
      return t0 <= t1;
    };
    if (!clip(a.x, dx, -halfW, halfW)) {
      return -1;
    }
    if (!clip(a.y, dy, -halfH, halfH)) {
      return -1;
    }
    if (!clip(a.z, dz, -PASS_DEPTH, PASS_DEPTH)) {
      return -1;
    }
    /* Prefer the midplane if the clipped segment actually crosses it, so a
     * square-on pass times the hole the pilot can see. An angled line that
     * only clips the thick volume, never z = 0 inside the rectangle, still
     * counts at first contact. */
    const tz = -a.z / dz;
    if (tz >= t0 && tz <= t1) {
      return tz;
    }
    return t0;
  }

  /* Segment prev to curr against the next gate. A pass is the travel
   * intersecting the opening's box in the direction of travel. Returns
   * the sim time of first contact, or null. */
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
     * A square opening scores as a square. The test is a swept box, the
     * visible hole extruded a short way along travel, so a line through
     * the opening at an angle still counts. The craft radius is not
     * folded in: collision already owns a clip of the tube, and shrinking
     * the hole by that radius made a clean edge line miss.
     */
    let used = -1;
    let t = 0;
    for (let k = 0; k < g.apertures.length; k += 1) {
      const ap = g.apertures[k];
      const a = this.local(g, ap.centreY, prev.x, prev.y, prev.z);
      const b = this.local(g, ap.centreY, curr.x, curr.y, curr.z);
      const halfW = ap.clearW * 0.5 - PASS_MARGIN;
      const halfH = ap.clearH * 0.5 - PASS_MARGIN;
      const tk = this.openingHits(a, b, halfW, halfH);
      if (tk < 0) {
        continue;
      }
      used = k;
      t = tk;
      break;
    }
    if (used < 0) {
      return null;
    }
    const crossMs = prevSimMs + (simMs - prevSimMs) * t;
    const passed = this.next;
    this.next = (this.next + 1) % this.gates.length;
    if (passed === this.timingIdx) {
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

  /* Per frame. simMs is the simulation clock at the rendered state,
   * wallMs the wall clock (flash expiry only). Returns
   * { passed: gateIndex|null, hitFrame: bool }; a frame hit voids the
   * running lap, it does not crash the craft. */
  update(prev, curr, simMs, wallMs) {
    if (this.freestyle) {
      return { passed: null, hitFrame: false };
    }
    const prevSimMs = this.prevSimMs ?? simMs;
    this.prevSimMs = simMs;
    const passed = this.tryPass(prev, curr, prevSimMs, simMs, wallMs);
    /*
     * FLYING THROUGH A GATE THAT IS NOT THE TARGET COSTS NOTHING.
     *
     * This used to void the lap, on MultiGP's own rule, which track.js quotes
     * verbatim: "If any obstacle is entered out of sequence or direction at
     * any time the run is invalid." The owner has overruled it: "if i go
     * through other gates that are not the target gate, then that is fine, no
     * penalty, the lap can still be completed, assuming i run through the
     * correct gate."
     *
     * It is the right call for this simulator even though it departs from the
     * rulebook. These courses are imported from Velocidrone and several of
     * them are dense: 2025 WA States has a five gate tunnel the lap crosses
     * on the way to somewhere else, and WCMRC Round 5 flies one gate five
     * times in a lap. On a course like that an incidental crossing is a
     * feature of the geometry rather than a shortcut, and voiding for it
     * punishes the pilot for the layout. Nothing is gained by cutting a gate
     * either: the sequence still has to be flown in order, so an out of
     * sequence pass advances nothing and only costs the time it took.
     *
     * The rule stays quoted in track.js because it is a citation of what
     * MultiGP says, and this is a citation of what we do instead.
     */
    /* hitFrame is gone. The frame is solid geometry now and touching it is a
     * crash, decided by src/game/collide.js in the shell, not a lap penalty
     * decided here. The return shape keeps its second field so the shell's
     * call site does not have to care which round it is. */
    return { passed, hitFrame: false };
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
