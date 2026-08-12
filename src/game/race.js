/*
 * race.js: the race. Gate sequencing, lap timing, best lap, and collision
 * with the gate frames.
 *
 * Detection is a plane crossing test in each gate's local frame: the
 * segment the craft travelled this frame is intersected with the gate
 * plane, and the crossing point must fall inside the aperture. That is a
 * swept test of the craft centre, so a gate cannot be skipped through at
 * speed no matter how few frames the crossing spans. The craft's own
 * radius is folded into the aperture margin.
 *
 * All of this runs in Three.js world space (y up), downstream of the
 * physics. Nothing here feeds back into the simulation; the only outputs
 * are HUD state and a crash flag the shell treats exactly like a ground
 * strike.
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

/* Gate geometry, matching gate() in scene.js. Aperture is the full frame
 * opening, tightened by the craft radius so clipping a post with an arm
 * counts as hitting it, not passing it. */
const GATE_HALF_W = 3.0;
const GATE_H = 5.0;
const CRAFT_R = 0.25;
const POST_R = 0.28;

const BEST_KEY = 'webfpv.bestLapMs';

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
    let best = null;
    try {
      const v = Number(localStorage.getItem(BEST_KEY));
      best = Number.isFinite(v) && v > 0 ? v : null;
    } catch (e) {
      best = null;
    }
    this.bestMs = best;
    this.reset();
  }

  reset() {
    this.next = 0;
    this.lap = 0;
    this.lapStartMs = null;
    this.lastLapMs = null;
    this.flash = null; /* { text, untilMs } for the centre message */
  }

  /* World point into gate g's local frame: x across the opening, y up
   * from the base, z along the course tangent. */
  local(g, px, py, pz) {
    const dx = px - g.x;
    const dz = pz - g.z;
    return {
      x: dx * g.cos - dz * g.sin,
      y: py - g.y,
      z: dx * g.sin + dz * g.cos,
    };
  }

  /* Segment prev to curr against the next gate's plane. Returns true and
   * advances the sequence when the crossing point is inside the aperture,
   * travelling in the course direction. */
  tryPass(prev, curr, nowMs) {
    const g = this.gates[this.next];
    const a = this.local(g, prev.x, prev.y, prev.z);
    const b = this.local(g, curr.x, curr.y, curr.z);
    if (!(a.z <= 0 && b.z > 0)) {
      return false;
    }
    const t = a.z / (a.z - b.z);
    const cx = a.x + (b.x - a.x) * t;
    const cy = a.y + (b.y - a.y) * t;
    if (Math.abs(cx) > GATE_HALF_W - CRAFT_R || cy < 0 || cy > GATE_H - CRAFT_R) {
      return false;
    }
    const passed = this.next;
    this.next = (this.next + 1) % this.gates.length;
    if (passed === 0) {
      if (this.lapStartMs != null) {
        this.lastLapMs = nowMs - this.lapStartMs;
        this.lap += 1;
        let msgText = `LAP ${this.lap}  ${fmt(this.lastLapMs)}`;
        if (this.bestMs == null || this.lastLapMs < this.bestMs) {
          this.bestMs = this.lastLapMs;
          msgText += '\nNEW BEST';
          try {
            localStorage.setItem(BEST_KEY, String(Math.round(this.bestMs)));
          } catch (e) {
            /* private mode: best lap simply does not persist */
          }
        }
        this.flash = { text: msgText, untilMs: nowMs + 2600 };
      }
      this.lapStartMs = nowMs;
    }
    return true;
  }

  /* Collision with the frame of any nearby gate: the two posts as
   * vertical cylinders, and the top bar as a box. Distances are against
   * the craft centre with the craft radius added on. */
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

  /* Per frame: swept gate test then frame collision. Returns
   * { passed: gateIndex|null, crashed: bool }. */
  update(prev, curr, nowMs) {
    const before = this.next;
    const passed = this.tryPass(prev, curr, nowMs) ? before : null;
    const crashed = this.hitsFrame(curr.x, curr.y, curr.z);
    return { passed, crashed };
  }

  /* Scene index of the gate the race wants next, for highlighting. */
  nextSceneIndex() {
    return this.gates[this.next].idx;
  }

  flashText(nowMs) {
    if (this.flash && nowMs < this.flash.untilMs) {
      return this.flash.text;
    }
    return null;
  }

  hudLine(nowMs) {
    const cur = this.lapStartMs != null ? nowMs - this.lapStartMs : null;
    return (
      `gate ${this.next + 1}/${this.gates.length}  lap ${fmt(cur)}  ` +
      `last ${fmt(this.lastLapMs)}  best ${fmt(this.bestMs)}`
    );
  }
}
