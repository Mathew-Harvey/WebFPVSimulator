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

/* Gate geometry, matching gate() in scene.js. */
const GATE_HALF_W = 3.0;
const GATE_H = 5.0;
const RING_Y = 2.5; /* ring centre height above the gate base */
const RING_R = 1.9; /* ring centreline radius */
const CRAFT_R = 0.25;
const POST_R = 0.28;
/* Swept collision sampling: finer than the post reach so a fast crossing
 * cannot phase through a post between two frames. */
const SWEEP_STEP = 0.2;

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
    const order = [0];
    for (let i = gates.length - 1; i >= 1; i -= 1) {
      order.push(i);
    }
    this.gates = order.map((idx) => {
      const g = gates[idx];
      return {
        idx,
        x: g.position.x,
        y: g.position.y,
        z: g.position.z,
        cos: -Math.cos(g.heading),
        sin: -Math.sin(g.heading),
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
    this.voided = 0;        /* laps thrown away by a gate touch or a crash */
  }

  /* Number of the lap now being flown, counting voided attempts. */
  lapNumber() {
    return this.log.length + 1;
  }

  /*
   * Throw the running lap away without ending the run. Used by a gate
   * touch and by a crash: neither should cost the laps already flown.
   */
  voidLap(reason, wallMs) {
    if (this.lapStartMs != null) {
      this.log.push({ n: this.lapNumber(), ms: null, reason });
      this.voided += 1;
    }
    this.lapStartMs = null;
    this.next = 0;
    this.flash = { text: reason, untilMs: wallMs + 1800 };
  }

  /* World point into gate g's local frame: x across the opening, y up
   * from the base, z along the direction of travel. */
  local(g, px, py, pz) {
    const dx = px - g.x;
    const dz = pz - g.z;
    return {
      x: dx * g.cos - dz * g.sin,
      y: py - g.y,
      z: dx * g.sin + dz * g.cos,
    };
  }

  /* Segment prev to curr against the next gate's plane. A pass is a
   * crossing in the direction of travel whose interpolated crossing
   * point lies inside the ring, craft radius folded in. Returns the sim
   * time of the crossing, or null. */
  tryPass(prev, curr, prevSimMs, simMs, wallMs) {
    const g = this.gates[this.next];
    const a = this.local(g, prev.x, prev.y, prev.z);
    const b = this.local(g, curr.x, curr.y, curr.z);
    if (!(a.z <= 0 && b.z > 0)) {
      return null;
    }
    const t = a.z / (a.z - b.z);
    const cx = a.x + (b.x - a.x) * t;
    const cy = a.y + (b.y - a.y) * t - RING_Y;
    if (cx * cx + cy * cy > (RING_R - CRAFT_R) * (RING_R - CRAFT_R)) {
      return null;
    }
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

  /* Point test against the frame of any nearby gate: the two posts as
   * vertical capsules, the top bar as a box, craft radius added on. */
  hitsFrame(px, py, pz) {
    for (const g of this.gates) {
      const dx = px - g.x;
      const dz = pz - g.z;
      if (dx * dx + dz * dz > 8 * 8) {
        continue;
      }
      const l = this.local(g, px, py, pz);
      if (l.y < -0.5 || l.y > GATE_H + 1.0) {
        continue;
      }
      const reach = POST_R + CRAFT_R;
      for (const sx of [-GATE_HALF_W, GATE_HALF_W]) {
        const ax = l.x - sx;
        if (l.y >= 0 && l.y <= GATE_H && ax * ax + l.z * l.z < reach * reach) {
          return true;
        }
      }
      if (
        Math.abs(l.x) <= GATE_HALF_W + 0.2 &&
        Math.abs(l.y - GATE_H) < 0.25 + CRAFT_R &&
        Math.abs(l.z) < 0.21 + CRAFT_R
      ) {
        return true;
      }
    }
    return false;
  }

  /* The frame test swept along the travelled segment, sampled finer than
   * the post reach, so a post cannot be phased through between frames. */
  sweepHitsFrame(prev, curr) {
    const dx = curr.x - prev.x;
    const dy = curr.y - prev.y;
    const dz = curr.z - prev.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const n = Math.max(1, Math.ceil(dist / SWEEP_STEP));
    for (let i = 1; i <= n; i += 1) {
      const t = i / n;
      if (this.hitsFrame(prev.x + dx * t, prev.y + dy * t, prev.z + dz * t)) {
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
    const prevSimMs = this.prevSimMs ?? simMs;
    this.prevSimMs = simMs;
    const passed = this.tryPass(prev, curr, prevSimMs, simMs, wallMs);
    const hitFrame = this.sweepHitsFrame(prev, curr);
    if (hitFrame && (this.lapStartMs != null || this.next !== 0)) {
      this.voidLap('Gate touched\nLap void', wallMs);
    }
    return { passed, hitFrame };
  }

  /* Scene index of the gate the race wants next, for highlighting. */
  nextSceneIndex() {
    return this.gates[this.next].idx;
  }

  flashText(wallMs) {
    if (this.flash && wallMs < this.flash.untilMs) {
      return this.flash.text;
    }
    return null;
  }

  /* Running lap time on the sim clock, or null before the first gate. */
  currentLapMs(simMs) {
    return this.lapStartMs != null ? simMs - this.lapStartMs : null;
  }
}
