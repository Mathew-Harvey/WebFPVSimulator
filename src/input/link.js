/*
 * link.js: the radio between the sticks and the flight controller.
 *
 * WHAT WAS MISSING. Until now a stick sample landed on the very next RC
 * slot after its own timestamp, on a mathematically exact 4 ms grid, and
 * every frame arrived. No radio has ever behaved like that. The link is
 * not a detail the controller is insulated from either, because two of the
 * things a pilot feels most are computed FROM the packet cadence:
 *
 *   Feedforward is the derivative of the setpoint across rc frames. A
 *   perfectly regular grid gives it a perfectly regular denominator, so it
 *   is smoother here than on any real radio.
 *
 *   RC smoothing auto-tunes its cutoffs from the measured frame interval.
 *   Given a jitter free interval it picks a filter no real link would get.
 *
 * The result reads as a very slightly uncanny sharpness: the quad is
 * connected to the sticks more tightly than hardware allows. This module
 * puts the radio back.
 *
 * WHERE IT LIVES, AND WHY NOT IN THE MODULE. The determinism contract says
 * the same input stream must produce a bit identical state trace. Shaping
 * the stream is therefore the SHELL's job, not the module's: the module
 * keeps taking timestamped samples and keeps being bit identical for a
 * given stream, and a recorded .rec still replays exactly because it
 * captures what was actually handed to sim_input. Putting the link inside
 * the module would have made the trace depend on a link seed and broken
 * that contract for every existing recording.
 *
 * DETERMINISM. The jitter and loss draws come from a seeded xorshift32,
 * the same generator and the same discipline as the plant's propwash
 * channel: reset with the run, advanced once per frame decision, never
 * from Math.random. A given seed and a given stick stream produce the same
 * link behaviour every time, so a session stays reproducible and the
 * verification harness can run with the link switched off entirely.
 *
 * THE NUMBERS. ELRS at 250 Hz is the reference. Air time plus the
 * receiver's serial handover plus the FC's own read is a few milliseconds,
 * and packet to packet it moves by a fraction of that. The defaults below
 * are the middle of what an ELRS 250 Hz link measures, and every one of
 * them is a setting rather than a constant, because the whole point is
 * that a pilot can dial in the link they actually fly.
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
 * Link presets, in the units the shell needs.
 *
 *   hz       packet rate
 *   delayMs  mean transport delay, transmitter gimbal read to FC rcData
 *   jitterMs peak deviation either side of that delay, uniform
 *   lossPpm  parts per million of packets that never arrive
 *
 * 'perfect' is not a radio. It is the old behaviour, kept as the default
 * for the verification harness and for anyone chasing a record, so that
 * turning the link model on is a choice and never a silent change to a
 * lap time.
 */
export const LINK_PRESETS = {
  perfect: { label: 'Perfect (no radio)', hz: 250, delayMs: 0, jitterMs: 0, lossPpm: 0 },
  elrs500: { label: 'ELRS 500 Hz', hz: 500, delayMs: 3.0, jitterMs: 0.4, lossPpm: 200 },
  elrs250: { label: 'ELRS 250 Hz', hz: 250, delayMs: 4.0, jitterMs: 0.8, lossPpm: 400 },
  elrs150: { label: 'ELRS 150 Hz', hz: 150, delayMs: 6.0, jitterMs: 1.4, lossPpm: 800 },
  crossfire: { label: 'Crossfire 150 Hz', hz: 150, delayMs: 7.5, jitterMs: 1.8, lossPpm: 1200 },
};

export const LINK_DEFAULT = 'perfect';

export function linkPreset(id) {
  return LINK_PRESETS[id] ?? LINK_PRESETS[LINK_DEFAULT];
}

/*
 * The radio.
 *
 * Owns nothing but its own seed and its own next-slot clock, so a reset is
 * a reset and a session is reproducible.
 */
export class RcLink {
  constructor(presetId = LINK_DEFAULT, seed = 0x9E3779B9) {
    this.seed0 = seed >>> 0;
    this.setPreset(presetId);
    this.reset(0);
  }

  setPreset(presetId) {
    const p = linkPreset(presetId);
    this.id = LINK_PRESETS[presetId] ? presetId : LINK_DEFAULT;
    this.hz = p.hz;
    this.delayMs = p.delayMs;
    this.jitterMs = p.jitterMs;
    this.lossPpm = p.lossPpm;
    this.periodMs = 1000 / p.hz;
  }

  /* Back to a known state at a given point on the sim clock. */
  reset(atMs) {
    this.seed = this.seed0;
    this.nextMs = atMs;
    /* Packets decided but not yet arrived. See pump. */
    this.pending = [];
    this.dropped = 0;
    this.sent = 0;
  }

  /* xorshift32, the plant's own generator. Never Math.random: a link that
   * cannot be replayed makes a lap time unreproducible. */
  rand() {
    let x = this.seed >>> 0;
    x ^= x << 13;
    x >>>= 0;
    x ^= x >> 17;
    x ^= x << 5;
    x >>>= 0;
    this.seed = x;
    return x / 4294967296;
  }

  /* Is this link the identity? The shell skips the whole path when so, and
   * the harness relies on that being exact rather than approximate. */
  isPerfect() {
    return this.delayMs === 0 && this.jitterMs === 0 && this.lossPpm === 0;
  }

  /*
   * Emit the packets whose moment has arrived, up to blockEndMs on the sim
   * clock.
   *
   * `pick(atMs)` is asked for the stick values the transmitter would have
   * sampled at that moment; the shell holds the pending queue, so this
   * module never has to know how sticks are polled. Returns an array of
   * { tMs, rc } ready for sim_input, in non decreasing tMs order, which
   * the ABI requires.
   *
   * A packet is SAMPLED at its slot and ARRIVES delayMs plus jitter later,
   * which is the real ordering: the delay is transport, so the stick value
   * is the old one and the timestamp is the new one. Getting that backwards
   * would model a radio that predicts the future.
   */
  pump(blockEndMs, pick) {
    /*
     * Each slot is DECIDED exactly once, then held until it arrives.
     *
     * The first version rewound the slot clock when a packet's arrival fell
     * past the end of the block and re-decided it next time. That drew a
     * fresh loss and jitter sample for a packet that had already been
     * decided, counted it twice, and made the whole model depend on how the
     * render happened to batch its frames: 276 packets sent in a second at
     * 250 Hz, and a different stream at 33 ms blocks than at 4 ms. The
     * link's own selftest caught all three. A decided packet is now
     * buffered in flight, which is also what it physically is.
     */
    let guard = 0;
    while (this.nextMs < blockEndMs && guard < 4096) {
      guard += 1;
      const sampledAt = this.nextMs;
      this.nextMs += this.periodMs;
      this.sent += 1;
      if (this.lossPpm > 0 && this.rand() * 1e6 < this.lossPpm) {
        /* Lost. The receiver holds its last value, which is what the
         * shell's held sample already does by not being replaced, so a
         * drop is simply a packet that is never emitted. */
        this.dropped += 1;
        continue;
      }
      const jitter = this.jitterMs > 0 ? (this.rand() * 2 - 1) * this.jitterMs : 0;
      const rc = pick(sampledAt);
      if (!rc) {
        continue;
      }
      this.pending.push({ tMs: sampledAt + this.delayMs + jitter, rc });
    }
    /* The ABI takes samples in non decreasing timestamp order, and jitter
     * can reorder two adjacent packets. A real receiver hands the FC frames
     * in arrival order, which is exactly this sort. */
    this.pending.sort((a, b) => a.tMs - b.tMs);
    const out = [];
    while (this.pending.length > 0 && this.pending[0].tMs < blockEndMs) {
      out.push(this.pending.shift());
    }
    return out;
  }
}
