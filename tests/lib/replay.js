/*
 * replay.js: drive a Sim through a recorded input stream or a scripted
 * stick program, collect a state trace, and hash it.
 *
 * Environment-neutral module, runs unchanged in Node and the browser.
 * Hashing uses WebCrypto SHA-256 over the raw little-endian state block
 * bytes, so no number formatting is involved anywhere near the hash.
 *
 * Input delivery rule, identical everywhere: an input sample with
 * timestamp tUs is delivered to sim_input before the 1 ms step covering
 * [floor(tUs / 1000), floor(tUs / 1000) + 1) ms executes. The render rate
 * only changes how many whole steps are batched into one sim_step call.
 * By construction the harness delivers the same samples before the same
 * steps at every render rate; a sim that honours the ABI therefore
 * produces bit-identical traces.
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

import { SIM_OK, simErrorName } from './simmod.js';

export class SimError extends Error {
  constructor(code, where) {
    super(`${where}: sim returned ${simErrorName(code)} (${code})`);
    this.code = code;
    this.errorName = simErrorName(code);
    this.where = where;
  }
}

export function must(code, where) {
  if (code !== SIM_OK) {
    throw new SimError(code, where);
  }
}

export async function sha256Hex(chunks) {
  let total = 0;
  for (const c of chunks) {
    total += c.length;
  }
  const all = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    all.set(c, off);
    off += c.length;
  }
  const digest = await crypto.subtle.digest('SHA-256', all);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/*
 * Replay a decoded .rec through the sim, batching steps as a render loop
 * running at renderHz would, and return the SHA-256 of the state trace.
 *
 * opts:
 *   configText     Betaflight diff text for sim_init
 *   renderHz       simulated render rate driving the accumulator
 *   traceStrideMs  state sampled into the trace every this many ms
 *   cellVoltage    optional open-circuit per-cell voltage to set after init
 */
export async function replayTrace(sim, rec, opts) {
  const { configText, renderHz, traceStrideMs } = opts;
  must(sim.init(configText), 'sim_init');
  if (opts.cellVoltage !== undefined && opts.cellVoltage !== null) {
    must(sim.setCellVoltage(opts.cellVoltage), 'sim_set_cell_voltage');
  }
  const durationMs = Math.round((rec.count * 1000) / rec.rateHz);
  const chunks = [];
  const capture = () => {
    const { code, bytes } = sim.readStateBytes();
    must(code, 'sim_state');
    chunks.push(bytes);
  };

  capture();
  let curMs = 0;
  let nextSample = 0;
  let frame = 0;
  let nextTraceMs = traceStrideMs;
  while (curMs < durationMs) {
    frame += 1;
    let frameEndMs = Math.floor((frame * 1000) / renderHz);
    if (frameEndMs > durationMs) {
      frameEndMs = durationMs;
    }
    while (curMs < frameEndMs) {
      // Deliver every sample whose timestamp falls inside a step that has
      // not executed yet but starts at or before curMs.
      while (
        nextSample < rec.count &&
        Math.floor(rec.samples[nextSample].tUs / 1000) <= curMs
      ) {
        const s = rec.samples[nextSample];
        must(
          sim.input(s.tUs / 1e6, s.roll, s.pitch, s.yaw, s.throttle),
          'sim_input',
        );
        nextSample += 1;
      }
      let chunkEndMs = frameEndMs;
      if (nextSample < rec.count) {
        const boundary = Math.floor(rec.samples[nextSample].tUs / 1000);
        if (boundary < chunkEndMs) {
          chunkEndMs = boundary;
        }
      }
      if (nextTraceMs < chunkEndMs) {
        chunkEndMs = nextTraceMs;
      }
      if (chunkEndMs <= curMs) {
        chunkEndMs = curMs + 1;
      }
      must(sim.step(chunkEndMs - curMs), 'sim_step');
      curMs = chunkEndMs;
      if (curMs === nextTraceMs) {
        capture();
        nextTraceMs += traceStrideMs;
      }
    }
  }
  return sha256Hex(chunks);
}

/*
 * Run a scripted stick program: segments of constant stick values, stepping
 * 1 ms at a time. onStep(tMs, state) is called after every step with the
 * decoded state block. Assumes the sim is already initialised and reset.
 */
export function runScript(sim, segments, onStep) {
  let tMs = 0;
  for (const seg of segments) {
    must(
      sim.input(tMs / 1000, seg.roll ?? 0, seg.pitch ?? 0, seg.yaw ?? 0, seg.throttle ?? 0),
      'sim_input',
    );
    const end = tMs + seg.durMs;
    while (tMs < end) {
      must(sim.step(1), 'sim_step');
      tMs += 1;
      if (onStep) {
        const { code, state } = sim.readState();
        must(code, 'sim_state');
        onStep(tMs, state);
      }
    }
  }
  return tMs;
}

/* State block indices, mirroring sim_abi.h. */
export const ST = {
  T: 0,
  PX: 1,
  PY: 2,
  PZ: 3,
  VX: 4,
  VY: 5,
  VZ: 6,
  QW: 7,
  QX: 8,
  QY: 9,
  QZ: 10,
  P: 11,
  Q: 12,
  R: 13,
  RPM0: 14,
  RPM1: 15,
  RPM2: 16,
  RPM3: 17,
  VBAT: 18,
  AMPS: 19,
};
