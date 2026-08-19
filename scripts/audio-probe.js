/*
 * audio-probe.js: render the real audio graph offline and measure it.
 *
 * There are no speakers in this container, so every claim about the mix has
 * to come from a buffer. This launches headless Chromium, imports
 * src/render/audio.js into a blank same origin page, builds that exact graph
 * on an OfflineAudioContext, drives it from a scripted RPM and airspeed
 * trace through the real update() path, renders it to samples, pulls the
 * samples back into Node, and reports:
 *
 *   peak sample and any sample at or above full scale
 *   RMS in dBFS and true peak in dBTP, oversampled four times
 *   one third octave band energies
 *   the energy in any two named bands, which is what the scream test is
 *   spectral centroid
 *   narrowband tonal peaks in a named range, ranked by how far each stands
 *     above the median of its own neighbourhood. A band table says how much
 *     energy is somewhere; this says whether it is a TONE, which is a
 *     different complaint and the one the owner reported
 *   per channel peak frequencies, for the binaural carriers
 *   amplitude modulation at a named frequency in each channel and in the
 *     mono sum, each against a measured floor. A binaural pair beats in the
 *     mono sum: two carriers a few Hz apart summed ARE an amplitude
 *     modulation, so the discriminator is per channel absence, not mono sum
 *     absence. See .loop/threshold-disputes.md entry 5.
 *   tempo by autocorrelation of spectral flux
 *   the sample delta at a named loop seam against the distribution inside
 *     the loop
 *
 * An FFT cannot tell anyone whether the mix is pleasant. A human has to
 * listen. It can tell anyone whether the mix screams, clips, is at the
 * stated tempo, and is genuinely binaural, and those are the claims this
 * project has been making without evidence.
 *
 * Usage:
 *   node scripts/audio-probe.js [--trace=NAME] [--seconds=20] [--rate=48000]
 *        [--level=0.6] [--blades=3] [--f0=HZ] [--scream=2000,8000]
 *        [--carrier=80,600] [--beat=6] [--seam=SEC] [--tones=LO,HI]
 *        [--json=PATH]
 *
 * Traces: hover, full, flight, steady:RPM, idle.
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

import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { startServer } from '../tests/lib/server.js';
import { findChrome } from '../tests/lib/browser.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/* The four motors never run at the same speed on a real quad, and the beat
 * between them is a large part of why a quad sounds like a quad. These are
 * the factors the trace applies to the commanded RPM, published so a
 * reviewer can see that the spread is deliberate and how wide it is. */
const MOTOR_SPREAD = [1.0, 0.9935, 1.0082, 0.9971];
/* The trace is fed at 62.5 Hz, which is 768 samples at 48 kHz, an exact
 * multiple of the 128 sample render quantum. */
const TRACE_HZ = 62.5;

/* ---------- traces ---------- */

/* Each trace returns { rpm, speed } for a time in seconds. RPM is the
 * commanded mean; MOTOR_SPREAD makes the four. */
function traceFn(name) {
  const steady = name.match(/^steady:(\d+(?:\.\d+)?)$/);
  if (steady) {
    const r = Number(steady[1]);
    return () => ({ rpm: r, speed: 0 });
  }
  if (name === 'idle') {
    return () => ({ rpm: 900, speed: 0 });
  }
  if (name === 'hover') {
    return () => ({ rpm: 4200, speed: 0 });
  }
  if (name === 'full') {
    /* A full throttle pass: two seconds of spool up, then held wide open
     * with the airspeed following it. This is the trace A1 names. */
    return (t) => {
      const k = Math.min(1, t / 2);
      return { rpm: 900 + 8100 * k, speed: 32 * Math.min(1, t / 4) };
    };
  }
  /* flight: what a lap actually does. Punches out of corners, coasts
   * through them, one dive. Deterministic, no random. */
  return (t) => {
    const a = 0.5 + 0.5 * Math.sin(t * 1.7);
    const b = 0.5 + 0.5 * Math.sin(t * 0.41 + 1.1);
    const punch = a * a * b;
    const rpm = 2600 + 6000 * punch;
    const speed = 6 + 22 * (0.4 + 0.6 * b);
    return { rpm, speed };
  };
}

function buildTrace(name, seconds) {
  const fn = traceFn(name);
  const n = Math.round(seconds * TRACE_HZ);
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const t = i / TRACE_HZ;
    const { rpm, speed } = fn(t);
    out.push([
      t,
      rpm * MOTOR_SPREAD[0], rpm * MOTOR_SPREAD[1],
      rpm * MOTOR_SPREAD[2], rpm * MOTOR_SPREAD[3],
      speed,
    ]);
  }
  return out;
}

/* ---------- signal analysis ---------- */

/* In place radix 2 FFT with a precomputed twiddle table. The table is
 * exact per bin rather than a recurrence, because a recurrence over 2^19
 * butterflies drifts and the carrier test wants 0.2 Hz. */
function makeFft(n) {
  const cos = new Float64Array(n / 2);
  const sin = new Float64Array(n / 2);
  for (let k = 0; k < n / 2; k += 1) {
    const a = (-2 * Math.PI * k) / n;
    cos[k] = Math.cos(a);
    sin[k] = Math.sin(a);
  }
  return function fft(re, im) {
    for (let i = 1, j = 0; i < n; i += 1) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) {
        j ^= bit;
      }
      j ^= bit;
      if (i < j) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const half = len >> 1;
      const stride = n / len;
      for (let i = 0; i < n; i += len) {
        for (let k = 0; k < half; k += 1) {
          const wr = cos[k * stride];
          const wi = sin[k * stride];
          const xr = re[i + k + half];
          const xi = im[i + k + half];
          const vr = xr * wr - xi * wi;
          const vi = xr * wi + xi * wr;
          const ur = re[i + k];
          const ui = im[i + k];
          re[i + k] = ur + vr;
          im[i + k] = ui + vi;
          re[i + k + half] = ur - vr;
          im[i + k + half] = ui - vi;
        }
      }
    }
  };
}

function hann(n) {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
  }
  return w;
}

/*
 * Welch power spectrum, normalised so that the sum over every bin is the
 * mean square of the signal. That makes a band sum convertible straight to
 * an RMS in dBFS, which is the unit every loudness claim in the rubric is
 * written in.
 */
function spectrum(x, rate, frame) {
  const w = hann(frame);
  let wsq = 0;
  for (let i = 0; i < frame; i += 1) {
    wsq += w[i] * w[i];
  }
  const fft = makeFft(frame);
  const re = new Float64Array(frame);
  const im = new Float64Array(frame);
  const acc = new Float64Array(frame / 2 + 1);
  const hop = frame / 2;
  let frames = 0;
  for (let off = 0; off + frame <= x.length; off += hop) {
    for (let i = 0; i < frame; i += 1) {
      re[i] = x[off + i] * w[i];
      im[i] = 0;
    }
    fft(re, im);
    for (let k = 0; k <= frame / 2; k += 1) {
      acc[k] += (re[k] * re[k] + im[k] * im[k]) / (frame * wsq);
    }
    frames += 1;
  }
  if (frames === 0) {
    return { power: acc, rate, frame, frames: 0, binHz: rate / frame };
  }
  for (let k = 0; k <= frame / 2; k += 1) {
    acc[k] /= frames;
    /* Fold the negative frequencies onto the positive ones so a band sum
     * is the whole band's mean square, not half of it. */
    if (k > 0 && k < frame / 2) {
      acc[k] *= 2;
    }
  }
  return { power: acc, rate, frame, frames, binHz: rate / frame };
}

/*
 * Band energy over a half open bin range, [lo, hi). Half open deliberately:
 * with an inclusive upper bin, two adjacent one third octave bands share the
 * bin on their common edge, which double counts it. A reviewer measured 13
 * bins counted twice across the table and the whole table under-reading
 * white noise by 0.30 dB, and the error hid because it cancels on a signal
 * with no energy at the band edges. `bins` is returned so a band narrower
 * than the analysis resolution cannot be quoted as though it were measured.
 */
function bandRms(spec, lo, hi) {
  let sum = 0;
  const k0 = Math.max(0, Math.ceil(lo / spec.binHz));
  const k1 = Math.min(spec.power.length, Math.ceil(hi / spec.binHz));
  for (let k = k0; k < k1; k += 1) {
    sum += spec.power[k];
  }
  return { db: sum > 0 ? 10 * Math.log10(sum) : -Infinity, bins: Math.max(0, k1 - k0), k0, k1 };
}

function bandRmsDb(spec, lo, hi) {
  return bandRms(spec, lo, hi).db;
}

function thirdOctaves(spec) {
  const rows = [];
  const nyq = spec.rate / 2;
  for (let n = 13; n <= 43; n += 1) {
    const fc = 10 ** (n / 10);
    const lo = fc / 2 ** (1 / 6);
    let hi = fc * 2 ** (1 / 6);
    if (lo >= nyq) {
      break;
    }
    /* The top band runs to Nyquist. Without this, every bin above 22387 Hz
     * is in no band at all and the table's total is short of the signal. */
    if (n === 43 || fc * 2 ** (1 / 6) * 2 ** (1 / 6) >= nyq) {
      hi = nyq;
    }
    const b = bandRms(spec, lo, hi);
    rows.push({ fc, lo, hi, db: b.db, bins: b.bins });
  }
  return rows;
}

/*
 * Narrowband tonal peaks: every local maximum in [lo, hi) scored by how far
 * it stands above the median of its own neighbourhood.
 *
 * A band table measures how much energy is somewhere. This measures whether
 * that energy is a TONE, and the two answer different complaints. A pad
 * triad that nothing else in the mix sits beside is inaudible in the one
 * third octave table and unmissable in a room, because the ear picks a
 * steady partial out of a broadband floor at a level far below where it
 * would notice the same energy spread over the same band.
 *
 * The neighbourhood is +-NB bins with the peak's own +-SKIP bins excluded,
 * so a wide resonance is not scored against its own skirts. The median
 * rather than the mean, so one strong neighbour cannot hide a peak.
 */
const TONE_NB = 120;
const TONE_SKIP = 6;

function tonePeaks(spec, lo, hi) {
  const pw = spec.power;
  const k0 = Math.max(1, Math.ceil(lo / spec.binHz));
  const k1 = Math.min(pw.length - 1, Math.floor(hi / spec.binHz));
  const rows = [];
  for (let k = k0; k <= k1; k += 1) {
    let top = true;
    for (let j = k - 3; j <= k + 3; j += 1) {
      if (j >= 0 && j < pw.length && pw[j] > pw[k]) {
        top = false;
        break;
      }
    }
    if (!top) {
      continue;
    }
    const nb = [];
    for (let j = k - TONE_NB; j <= k + TONE_NB; j += 1) {
      if (j < 1 || j >= pw.length || Math.abs(j - k) <= TONE_SKIP) {
        continue;
      }
      nb.push(pw[j]);
    }
    if (nb.length === 0) {
      continue;
    }
    nb.sort((a, b) => a - b);
    const med = nb[nb.length >> 1];
    if (!(med > 0) || !(pw[k] > 0)) {
      continue;
    }
    rows.push({
      hz: k * spec.binHz,
      promDb: 10 * Math.log10(pw[k] / med),
      db: 10 * Math.log10(pw[k]),
    });
  }
  rows.sort((a, b) => b.promDb - a.promDb);
  return rows;
}

/* The one third octave band whose centre is nearest f. Returned rather
 * than assumed, so the band edges of any band claim get published. */
function bandAt(spec, f) {
  const rows = thirdOctaves(spec);
  let best = rows[0];
  for (const r of rows) {
    if (Math.abs(Math.log(r.fc / f)) < Math.abs(Math.log(best.fc / f))) {
      best = r;
    }
  }
  return best;
}

function centroid(spec) {
  let num = 0;
  let den = 0;
  for (let k = 1; k < spec.power.length; k += 1) {
    num += k * spec.binHz * spec.power[k];
    den += spec.power[k];
  }
  return den > 0 ? num / den : 0;
}

function rmsDb(x) {
  let s = 0;
  for (let i = 0; i < x.length; i += 1) {
    s += x[i] * x[i];
  }
  return x.length ? 10 * Math.log10(s / x.length) : -Infinity;
}

function peakOf(x) {
  let p = 0;
  let clipped = 0;
  for (let i = 0; i < x.length; i += 1) {
    const a = Math.abs(x[i]);
    if (a > p) {
      p = a;
    }
    if (a >= 1) {
      clipped += 1;
    }
  }
  return { peak: p, clipped };
}

/*
 * True peak: four times oversampled with a 32 tap windowed sinc per phase.
 * A sample peak under full scale says nothing about what the reconstruction
 * filter in a converter will do between two samples, and the rubric asks
 * for dBTP.
 */
function truePeakDb(x) {
  const taps = 32;
  const half = taps / 2;
  const phases = 4;
  const h = [];
  for (let p = 0; p < phases; p += 1) {
    const row = new Float64Array(taps);
    let sum = 0;
    for (let m = 0; m < taps; m += 1) {
      const t = m - half + 1 - p / phases;
      const s = t === 0 ? 1 : Math.sin(Math.PI * t) / (Math.PI * t);
      /* Blackman window over the tap span. */
      const u = m / (taps - 1);
      const win = 0.42 - 0.5 * Math.cos(2 * Math.PI * u) + 0.08 * Math.cos(4 * Math.PI * u);
      row[m] = s * win;
      sum += row[m];
    }
    for (let m = 0; m < taps; m += 1) {
      row[m] /= sum;
    }
    h.push(row);
  }
  /* Every sample, with the signal treated as zero outside its own extent
   * rather than skipped. The first version of this ran from `half` to
   * `length - half` and a reviewer put a 0.99 sample at index 5 of a 4096
   * sample buffer: it reported -19.740 dBTP against a -0.087 dBFS sample
   * peak, a 19.65 dB under-report, and a true peak below the sample peak,
   * which is impossible for a true peak meter. Nothing in the r10 renders
   * was affected because the master gain ramps up from silence, and the
   * first crash or drum transient near a boundary would have inverted the
   * headroom claim silently. */
  let peak = 0;
  const n = x.length;
  for (let i = 0; i < n; i += 1) {
    for (let p = 0; p < phases; p += 1) {
      const row = h[p];
      let y = 0;
      for (let m = 0; m < taps; m += 1) {
        const j = i - half + 1 + m;
        if (j >= 0 && j < n) {
          y += row[m] * x[j];
        }
      }
      const a = Math.abs(y);
      if (a > peak) {
        peak = a;
      }
    }
  }
  return peak > 0 ? 20 * Math.log10(peak) : -Infinity;
}

/* Peak frequency in a range, parabolic interpolation on the log magnitude
 * of one long window. Sub bin, which is what a 0.2 Hz claim needs. */
function peakFreq(x, rate, lo, hi) {
  let n = 1;
  while (n * 2 <= x.length && n < 1 << 20) {
    n *= 2;
  }
  const w = hann(n);
  const fft = makeFft(n);
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    re[i] = x[i] * w[i];
  }
  fft(re, im);
  const binHz = rate / n;
  const k0 = Math.max(1, Math.ceil(lo / binHz));
  const k1 = Math.min(n / 2 - 1, Math.floor(hi / binHz));
  let kb = k0;
  let mb = -Infinity;
  const mag = (k) => Math.log(re[k] * re[k] + im[k] * im[k] + 1e-300);
  for (let k = k0; k <= k1; k += 1) {
    const m = mag(k);
    if (m > mb) {
      mb = m;
      kb = k;
    }
  }
  const a = mag(kb - 1);
  const b = mag(kb);
  const c = mag(kb + 1);
  const d = a - 2 * b + c;
  const delta = d !== 0 ? (0.5 * (a - c)) / d : 0;
  return { hz: (kb + delta) * binHz, binHz, window: n, db: 10 * Math.log10(Math.exp(b)) };
}

/*
 * Amplitude modulation depth at one frequency. Rectify, one pole lowpass
 * at 40 Hz, then measure that envelope's component at f against its mean.
 * A monaural beat shows up here in the mono sum. A binaural beat does not,
 * which is the whole difference.
 */
function amAtDb(x, rate, f) {
  const rc = 1 - Math.exp((-2 * Math.PI * 40) / rate);
  const env = new Float64Array(x.length);
  let y = 0;
  for (let i = 0; i < x.length; i += 1) {
    y += rc * (Math.abs(x[i]) - y);
    env[i] = y;
  }
  let mean = 0;
  for (let i = 0; i < env.length; i += 1) {
    mean += env[i];
  }
  mean /= env.length || 1;
  if (mean <= 0) {
    return { db: -Infinity, mean };
  }
  /*
   * Windowed single bin over the whole envelope, scanned over a small range
   * around f, with a noise floor measured away from f.
   *
   * The first version was a bare rectangular window Goertzel at exactly f,
   * and a reviewer showed it is a knife edge: with 50 percent true
   * modulation at 6.00 Hz it read -6.11 dB at 6.00 Hz, -12.07 dB at 6.05 Hz
   * and -24.15 dB at 6.20 Hz. Over a 12 second envelope the bin is 0.083 Hz
   * wide, so a 0.05 Hz slip in an operator's hand calculation halved the
   * answer. A Hann window widens the mainlobe and kills the leakage, and
   * scanning takes the hand calculation out of the result.
   *
   * The floor matters as much as the peak. A4 asks for a beat to be shown
   * ABSENT in a channel, and absent has no meaning without a floor: this
   * function's floor is about -64 dB on a clean tone and about -50 dB on
   * broadband noise, so a -21 dB reading is not absence. `floorDb` is now
   * measured on the same envelope at an unrelated frequency and published
   * with every result.
   */
  const w = hann(env.length);
  let wsum = 0;
  for (let i = 0; i < env.length; i += 1) {
    wsum += w[i];
  }
  const at = (hz) => {
    let sr = 0;
    let si = 0;
    for (let i = 0; i < env.length; i += 1) {
      const a = (2 * Math.PI * hz * i) / rate;
      const v = (env[i] - mean) * w[i];
      sr += v * Math.cos(a);
      si += v * Math.sin(a);
    }
    return (2 * Math.sqrt(sr * sr + si * si)) / wsum;
  };
  const span = 0.5;
  const steps = 21;
  let amp = 0;
  let atHz = f;
  for (let s = 0; s < steps; s += 1) {
    const hz = f - span + (2 * span * s) / (steps - 1);
    const a = at(hz);
    if (a > amp) {
      amp = a;
      atHz = hz;
    }
  }
  /* Floor: the same measurement at a frequency with no arithmetic relation
   * to f, so a real modulation cannot land on it. */
  const floor = at(f * 1.7 + 3.3);
  return {
    db: 20 * Math.log10(amp / mean),
    floorDb: floor > 0 ? 20 * Math.log10(floor / mean) : -Infinity,
    mean,
    depth: amp / mean,
    peakAtHz: atHz,
    scanned: [f - span, f + span],
  };
}

/*
 * Tempo from the autocorrelation of spectral flux.
 *
 * Three things a reviewer proved wrong about the first version of this, all
 * fixed here, because between them they made the function more confident
 * about music that does not exist than about music that does.
 *
 * It had no null hypothesis. Fed pure white noise it returned 137.20 BPM at
 * r = 0.823, and fed one steady 400 Hz sine it returned 187.50 BPM at
 * r = 0.984, which is a hop artefact and not a tempo. Meanwhile a real
 * synthetic 173 BPM breakbeat reported 173.08 at only r = 0.349, behind its
 * own half tempo. So `nullP95` is now measured, not assumed: the flux
 * sequence is shuffled with a fixed seed and the whole lag search rerun, and
 * the 95th percentile of the shuffled peaks is published beside the real
 * one. An r below that floor means the function found nothing.
 *
 * The lag axis was too coarse to answer the question A5 asks. At hop 256 and
 * 48 kHz the only BPM values reachable inside the 170 to 176 window were
 * 170.455, 173.077 and 175.781, so a genuine 177.0 BPM reported as 175.78
 * and would have PASSED a bar it fails. The hop is now 128 and the peak lag
 * is refined by parabolic interpolation, which makes the reported figure
 * continuous.
 *
 * And the flux was computed over the whole spectrum including the motor's
 * own band, so the motors drove the tempo estimate. It is now band limited
 * to 60 Hz to 10 kHz, which is where a kick, a snare and a hat live.
 */
const FLUX_LO = 60;
const FLUX_HI = 10000;
const NULL_TRIALS = 24;

function tempo(x, rate) {
  const frame = 1024;
  const hop = 128;
  const fps = rate / hop;
  const kLo = Math.max(1, Math.round((FLUX_LO * frame) / rate));
  const kHi = Math.min(frame / 2 - 1, Math.round((FLUX_HI * frame) / rate));
  const w = hann(frame);
  const fft = makeFft(frame);
  const re = new Float64Array(frame);
  const im = new Float64Array(frame);
  let prev = null;
  const flux = [];
  for (let off = 0; off + frame <= x.length; off += hop) {
    for (let i = 0; i < frame; i += 1) {
      re[i] = x[off + i] * w[i];
      im[i] = 0;
    }
    fft(re, im);
    const mag = new Float64Array(frame / 2);
    for (let k = 0; k < frame / 2; k += 1) {
      mag[k] = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
    }
    if (prev) {
      let f = 0;
      for (let k = kLo; k <= kHi; k += 1) {
        const d = mag[k] - prev[k];
        if (d > 0) {
          f += d;
        }
      }
      flux.push(f);
    }
    prev = mag;
  }
  if (flux.length < 32) {
    return { fps, fluxBandHz: [FLUX_LO, FLUX_HI], peaks: [], nullP95: null };
  }

  /* The lag search, factored out so the shuffled null can reuse it. */
  const search = (seq) => {
    let mean = 0;
    for (const f of seq) {
      mean += f;
    }
    mean /= seq.length;
    const s = seq.map((f) => f - mean);
    let ac0 = 0;
    for (let i = 0; i < s.length; i += 1) {
      ac0 += s[i] * s[i];
    }
    const lagMin = Math.max(2, Math.floor((60 * fps) / 220));
    const lagMax = Math.min(s.length - 2, Math.ceil((60 * fps) / 60));
    const ac = [];
    for (let lag = lagMin; lag <= lagMax; lag += 1) {
      let v = 0;
      for (let i = 0; i + lag < s.length; i += 1) {
        v += s[i] * s[i + lag];
      }
      ac.push({ lag, r: ac0 > 0 ? v / ac0 : 0 });
    }
    return ac;
  };

  const ac = search(flux);
  const peaks = [];
  for (let i = 1; i < ac.length - 1; i += 1) {
    if (ac[i - 1].r < ac[i].r && ac[i + 1].r < ac[i].r) {
      /* Parabolic refinement on the lag axis. The integer lag grid is what
       * made a true 177 BPM report as 175.78. */
      const a = ac[i - 1].r;
      const b = ac[i].r;
      const c = ac[i + 1].r;
      const d = a - 2 * b + c;
      const delta = d !== 0 ? (0.5 * (a - c)) / d : 0;
      const lag = ac[i].lag + delta;
      peaks.push({ lag, r: b, bpm: (60 * fps) / lag });
    }
  }
  peaks.sort((p, q) => q.r - p.r);

  /* The null. Shuffle the flux with a fixed seed, rerun the search, take the
   * best r, repeat, and publish the 95th percentile. Deterministic: the seed
   * is a constant and the generator is the same LCG the noise buffer uses,
   * so two runs of the probe give the same floor. */
  const bests = [];
  let seed = 20260812;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let trial = 0; trial < NULL_TRIALS; trial += 1) {
    const sh = Array.from(flux);
    for (let i = sh.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rnd() * (i + 1));
      const t = sh[i];
      sh[i] = sh[j];
      sh[j] = t;
    }
    let best = -Infinity;
    for (const p of search(sh)) {
      if (p.r > best) {
        best = p.r;
      }
    }
    bests.push(best);
  }
  bests.sort((p, q) => p - q);
  const nullP95 = bests[Math.min(bests.length - 1, Math.floor(0.95 * bests.length))];
  return {
    fps,
    fluxBandHz: [FLUX_LO, FLUX_HI],
    nullP95,
    nullTrials: NULL_TRIALS,
    peaks: peaks.slice(0, 6),
  };
}

/* The seam test. index is where one loop period ends and the next begins;
 * a click there is the loudest tell of cheap generated audio. */
function seamTest(x, index) {
  const d = [];
  for (let i = 1; i < x.length; i += 1) {
    d.push(Math.abs(x[i] - x[i - 1]));
  }
  if (index < 1 || index >= d.length) {
    return null;
  }
  const at = d[index - 1];
  const sorted = Array.from(d).sort((a, b) => a - b);
  let below = 0;
  for (const v of sorted) {
    if (v < at) {
      below += 1;
    } else {
      break;
    }
  }
  const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  return {
    index,
    delta: at,
    percentile: below / sorted.length,
    p50: q(0.5),
    p999: q(0.999),
    max: sorted[sorted.length - 1],
  };
}

/* ---------- the browser side ---------- */

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.dead = null;
    const fail = (e) => {
      if (this.dead) {
        return;
      }
      this.dead = e;
      for (const { reject } of this.pending.values()) {
        reject(e);
      }
      this.pending.clear();
    };
    ws.addEventListener('close', () => fail(new Error('Chrome closed the DevTools connection')));
    ws.addEventListener('error', () => fail(new Error('DevTools connection errored')));
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : new TextDecoder().decode(ev.data));
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) {
          reject(new Error(`CDP ${msg.error.message}`));
        } else {
          resolve(msg.result);
        }
      }
    });
  }

  send(method, params = {}, sessionId) {
    if (this.dead) {
      return Promise.reject(this.dead);
    }
    const id = this.nextId;
    this.nextId += 1;
    const payload = { id, method, params };
    if (sessionId) {
      payload.sessionId = sessionId;
    }
    this.ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
}

/* The page side driver, as source. Builds the real graph on an
 * OfflineAudioContext and drives it through the real update(). */
const DRIVER = `async (spec) => {
  const mod = await import('/src/render/audio.js');
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const ctx = new OAC(2, Math.round(spec.seconds * spec.rate), spec.rate);
  const a = new mod.MotorAudio();
  a.attach(ctx);
  a.setLevel(spec.level);
  if (spec.mix && typeof a.setMix === 'function') {
    a.setMix(spec.mix);
  }
  if (typeof a.setMusicEnabled === 'function') {
    a.setMusicEnabled(spec.music !== 0);
  }
  if (spec.track && typeof a.setMusicTrack === 'function') {
    a.setMusicTrack(spec.track);
  }
  if (typeof a.setFocusEnabled === 'function') {
    a.setFocusEnabled(spec.focus === 1);
  }
  a.setEnabled(true);
  const rpm = [0, 0, 0, 0];
  /* Cues are scheduled through the real event() at the real time, from inside
   * the same loop that drives update(), so what the probe measures is what a
   * gate pass or a crash actually does to the mix. */
  let cueAt = -1;
  let cueKind = '';
  if (spec.cue) {
    const bits = String(spec.cue).split('@');
    cueKind = bits[0];
    cueAt = Number(bits[1]);
  }
  let cueFired = false;
  for (const row of spec.trace) {
    rpm[0] = row[1]; rpm[1] = row[2]; rpm[2] = row[3]; rpm[3] = row[4];
    a.update(rpm, row[5], row[0]);
    if (!cueFired && cueAt >= 0 && row[0] >= cueAt && typeof a.event === 'function') {
      a.event(cueKind, cueAt);
      cueFired = true;
    }
  }
  const buf = await ctx.startRendering();
  const chans = [];
  for (let c = 0; c < buf.numberOfChannels; c += 1) {
    chans.push(buf.getChannelData(c));
  }
  window.__probe = chans;
  return {
    rate: buf.sampleRate,
    length: buf.length,
    channels: buf.numberOfChannels,
    nodes: a.nodeCount(),
  };
}`;

const CHUNK = `(c, off, n) => {
  const src = window.__probe[c];
  const sub = src.subarray(off, Math.min(off + n, src.length));
  const bytes = new Uint8Array(sub.buffer, sub.byteOffset, sub.byteLength);
  let out = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    out += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + 8192, bytes.length)));
  }
  return btoa(out);
}`;

async function renderGraph(spec) {
  const chrome = findChrome();
  if (!chrome) {
    throw new Error('no Chromium found');
  }
  const server = await startServer(root);
  const userDataDir = await mkdtemp(join(tmpdir(), 'sim-audio-'));
  const proc = spawn(chrome, [
    '--headless=new',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--no-default-browser-check',
    '--mute-audio',
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ]);
  let stderrBuf = '';
  const wsUrl = await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`no DevTools endpoint: ${stderrBuf.slice(-1200)}`)), 30000);
    proc.on('error', (e) => { clearTimeout(t); reject(e); });
    proc.stderr.on('data', (d) => {
      stderrBuf += d.toString();
      const m = stderrBuf.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) {
        clearTimeout(t);
        resolve(m[1]);
      }
    });
  });
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error('DevTools websocket failed')), { once: true });
  });
  const cdp = new Cdp(ws);
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  await cdp.send('Runtime.enable', {}, sessionId);
  await cdp.send('Page.enable', {}, sessionId);
  await cdp.send('Page.navigate', { url: `${server.origin}/scripts/audio-probe.html` }, sessionId);
  /* Wait for the document, then run the driver. */
  for (let i = 0; i < 200; i += 1) {
    const r = await cdp.send('Runtime.evaluate', {
      expression: 'document.readyState === "complete"', returnByValue: true,
    }, sessionId).catch(() => null);
    if (r && r.result && r.result.value) {
      break;
    }
    await new Promise((r2) => setTimeout(r2, 50));
  }

  const call = async (fnSource, args) => {
    const r = await cdp.send('Runtime.evaluate', {
      expression: `(${fnSource})(${args.map((a) => JSON.stringify(a)).join(',')})`,
      returnByValue: true,
      awaitPromise: true,
    }, sessionId);
    if (r.exceptionDetails) {
      const d = r.exceptionDetails;
      throw new Error(`page: ${d.exception ? (d.exception.description || d.exception.value) : d.text}`);
    }
    return r.result.value;
  };

  const meta = await call(DRIVER, [spec]);
  const channels = [];
  const per = 1 << 18;
  for (let c = 0; c < meta.channels; c += 1) {
    const arr = new Float32Array(meta.length);
    for (let off = 0; off < meta.length; off += per) {
      const b64 = await call(CHUNK, [c, off, per]);
      const buf = Buffer.from(b64, 'base64');
      const view = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
      arr.set(view, off);
    }
    channels.push(arr);
  }

  ws.close();
  proc.kill('SIGKILL');
  await server.close();
  await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  return { meta, channels };
}

/* ---------- report ---------- */

function d2(v) {
  return Number.isFinite(v) ? v.toFixed(2) : String(v);
}

async function main() {
  const opts = {
    /* 0.6 is what the shell actually runs at: ui.js defaults volume to 6 and
     * main.js divides by 10. Rendering at 0.5 put every published loudness
     * figure 1.58 dB below what a player hears. */
    trace: 'flight', seconds: 20, rate: 48000, level: 0.6, blades: 3,
    scream: '2000,8000', carrier: '', beat: 0, seam: 0, f0: 0, json: '',
    /*
     * Which stems to render. A1 is a property of the MOTOR model, and A8
     * explicitly requires the bed to occupy bands the motors do not, so the
     * scream test is measured on the motors and wind with the bed muted, and
     * the full mix is measured separately. A4 needs the carriers findable, so
     * it renders the focus tone alone. A11 needs a level to make a measured
     * difference, which means rendering one stem at a time. None of that is
     * possible with a fixed mix, so the mix is an argument.
     */
    motors: -1, wind: -1, musiclevel: -1, ambience: -1, music: 0, focus: 0,
    /* Which music track the render plays, by id from src/render/tracks.js.
     * Empty keeps the player's default, which is rotation. Offline
     * renders have no media element, so this only names the selection. */
    track: '',
    /*
     * A7 asks for a cue's level advantage "at the moment it plays" and for a
     * measurable duck. Every other figure this probe reports is a Welch
     * average over the whole render, which cannot answer either question, so
     * --cue fires a real event through the real event() and --window
     * restricts the spectrum and the RMS to a slice of the render.
     */
    cue: '', window: '',
    /*
     * --tones=LO,HI lists the narrowband peaks in a range, loudest by
     * PROMINENCE rather than by level, where prominence is a peak's power
     * over the median of its own neighbourhood.
     *
     * The one third octave table cannot answer the question this exists for.
     * The owner reported a high pitched annoying overtone and the table
     * showed nothing unusual anywhere: a sustained pad triad was spread over
     * three bands 15 dB under the loudest one and looked like a gentle hump.
     * What made it audible was that it was a TONE with nothing beside it,
     * which is a peak to neighbourhood ratio and not a band energy. Run with
     * a stem muted to attribute a peak to a stem.
     */
    tones: '',
  };
  for (const a of process.argv.slice(2)) {
    const m = a.match(/^--([a-z0-9]+)=(.*)$/);
    if (!m) {
      throw new Error(`unknown argument ${a}`);
    }
    opts[m[1]] = /^-?\d+(\.\d+)?$/.test(m[2]) ? Number(m[2]) : m[2];
  }
  const seconds = Number(opts.seconds);
  const rate = Number(opts.rate);
  const trace = buildTrace(String(opts.trace), seconds);
  const mix = {};
  if (Number(opts.motors) >= 0) {
    mix.motors = Number(opts.motors);
  }
  if (Number(opts.wind) >= 0) {
    mix.wind = Number(opts.wind);
  }
  if (Number(opts.musiclevel) >= 0) {
    mix.music = Number(opts.musiclevel);
  }
  if (Number(opts.ambience) >= 0) {
    mix.ambience = Number(opts.ambience);
  }
  const spec = {
    seconds, rate, level: Number(opts.level), trace, cue: String(opts.cue),
    mix: Object.keys(mix).length ? mix : null,
    music: Number(opts.music),
    focus: Number(opts.focus),
    track: String(opts.track),
  };
  const { meta, channels } = await renderGraph(spec);

  /* Mono sum for everything that is not per channel. Half sum, so a
   * correlated stereo pair does not gain 6 dB on its way to the analyser. */
  const mono = new Float64Array(meta.length);
  for (let i = 0; i < meta.length; i += 1) {
    let s = 0;
    for (const c of channels) {
      s += c[i];
    }
    mono[i] = s / channels.length;
  }

  /* The analysis slice. Everything downstream of this sees only the window,
   * so a band figure inside it is a band figure at that moment. */
  let anaMono = mono;
  let winFrom = 0;
  let winTo = meta.length;
  if (opts.window) {
    const wb = String(opts.window).split(',').map(Number);
    winFrom = Math.max(0, Math.round(wb[0] * rate));
    winTo = Math.min(meta.length, Math.round(wb[1] * rate));
    anaMono = mono.subarray(winFrom, winTo);
  }

  const meanRpm = trace.reduce((s, r) => s + (r[1] + r[2] + r[3] + r[4]) / 4, 0) / (trace.length || 1);
  const f0 = Number(opts.f0) || (meanRpm / 60) * Number(opts.blades);
  /*
   * The analysis frame has to fit inside the window. A 0.16 s window at
   * 48 kHz is 7680 samples, so a fixed 8192 point frame fits zero frames and
   * every band came back as -Infinity with a centroid of 0, which looks like
   * silence and is really an instrument that could not see. The frame is the
   * largest power of two that fits, floored at 256 so a band figure still
   * means something.
   */
  let frame8 = 8192;
  while (frame8 > 256 && frame8 > anaMono.length) {
    frame8 /= 2;
  }
  const spec8 = spectrum(anaMono, rate, frame8);
  const [screamLo, screamHi] = String(opts.scream).split(',').map(Number);
  const fundBand = bandAt(spec8, f0);
  const p = peakOf(anaMono);
  const tp = truePeakDb(anaMono);

  /* A digest of the rendered samples. Without one, a render that is not
   * reproducible looks exactly like one that is, because every figure in the
   * report is a reduction printed to fifteen digits. Two OfflineAudioContext
   * renders of this identical graph inside one page differ in about half
   * their samples by one float32 ULP, so A9's byte for byte bar is not
   * reachable in Chromium and the digest is what makes that visible rather
   * than a matter of opinion. */
  const digests = channels.map((c) => createHash('sha256')
    .update(Buffer.from(c.buffer, c.byteOffset, c.byteLength)).digest('hex').slice(0, 16));

  const report = {
    trace: String(opts.trace),
    seconds,
    rate: meta.rate,
    channels: meta.channels,
    samples: meta.length,
    nodes: meta.nodes,
    level: Number(opts.level),
    stems: { mix: spec.mix, music: spec.music, focus: spec.focus, track: spec.track || null },
    motorSpread: MOTOR_SPREAD,
    traceHz: TRACE_HZ,
    meanRpm,
    blades: Number(opts.blades),
    bladePassHz: f0,
    peakSample: p.peak,
    samplesAtOrOverFullScale: p.clipped,
    rmsDbfs: rmsDb(anaMono),
    window: opts.window ? { from: winFrom / rate, to: winTo / rate, samples: anaMono.length } : null,
    cue: spec.cue || null,
    truePeakDbtp: tp,
    centroidHz: centroid(spec8),
    analysisFrame: frame8,
    fundamentalBand: { fc: fundBand.fc, lo: fundBand.lo, hi: fundBand.hi, db: fundBand.db },
    screamBand: { lo: screamLo, hi: screamHi, db: bandRmsDb(spec8, screamLo, screamHi) },
    thirds: thirdOctaves(spec8).map((r) => ({ fc: Math.round(r.fc), db: Number(d2(r.db)) })),
    perChannelRmsDbfs: channels.map((c) => rmsDb(c)),
  };
  report.screamMarginDb = report.fundamentalBand.db - report.screamBand.db;
  report.channelDigests = digests;
  /* A1 as the rubric words it compares a 92 Hz band against a 6000 Hz band,
   * so 18 dB of the published margin is bandwidth and not loudness. The bar
   * is the bar and it is measured above; this is the same comparison on
   * equal bandwidth, loudest third octave overall against loudest third
   * octave inside the scream band, published beside it so nobody has to
   * argue about which one they meant. */
  const rows = thirdOctaves(spec8);
  let loudest = -Infinity;
  let loudestScream = -Infinity;
  for (const r of rows) {
    if (r.db > loudest) {
      loudest = r.db;
    }
    if (r.fc >= screamLo && r.fc <= screamHi && r.db > loudestScream) {
      loudestScream = r.db;
    }
  }
  report.equalBandwidth = {
    loudestThirdOctaveDb: loudest,
    loudestThirdOctaveInScreamBandDb: loudestScream,
    marginDb: loudest - loudestScream,
  };

  if (opts.carrier) {
    const [lo, hi] = String(opts.carrier).split(',').map(Number);
    report.carriers = channels.map((c) => peakFreq(c, rate, lo, hi));
    if (report.carriers.length === 2) {
      report.carrierDiffHz = Math.abs(report.carriers[0].hz - report.carriers[1].hz);
    }
  }
  if (Number(opts.beat) > 0) {
    const f = Number(opts.beat);
    report.beatHz = f;
    report.amAtBeat = {
      left: amAtDb(channels[0], rate, f),
      right: amAtDb(channels[Math.min(1, channels.length - 1)], rate, f),
      monoSum: amAtDb(mono, rate, f),
    };
  }
  if (opts.tones) {
    const [tLo, tHi] = String(opts.tones).split(',').map(Number);
    /*
     * Its own spectrum at a finer frame than the band table's. A pad partial
     * is a few Hz wide and the 8192 point frame the bands use puts it inside
     * one 5.9 Hz bin along with whatever else is there; 16384 halves that and
     * still averages enough frames over a 16 s render to be steady.
     */
    let frameT = 16384;
    while (frameT > 1024 && frameT > anaMono.length) {
      frameT /= 2;
    }
    const specT = spectrum(anaMono, rate, frameT);
    report.tones = {
      band: [tLo, tHi],
      frame: frameT,
      binHz: specT.binHz,
      neighbourhoodBins: TONE_NB,
      peaks: tonePeaks(specT, tLo, tHi).slice(0, 12),
    };
  }
  report.tempo = tempo(mono, rate);
  if (Number(opts.seam) > 0) {
    report.seam = seamTest(mono, Math.round(Number(opts.seam) * rate));
  }

  console.log(`trace=${report.trace} ${seconds}s @ ${report.rate} Hz  ${report.channels} ch  nodes=${report.nodes}  level=${report.level}`);
  console.log(`stems: mix=${JSON.stringify(spec.mix)} music=${spec.music} focus=${spec.focus}`);
  if (report.window) {
    console.log(`window ${report.window.from.toFixed(3)} to ${report.window.to.toFixed(3)} s, ${report.window.samples} samples, cue=${report.cue ?? 'none'}`);
  }
  console.log(`mean commanded RPM ${report.meanRpm.toFixed(0)}  blade pass ${report.bladePassHz.toFixed(1)} Hz at ${report.blades} blades`);
  console.log(`peak sample ${report.peakSample.toFixed(4)}  at or over full scale: ${report.samplesAtOrOverFullScale} samples`);
  console.log(`RMS ${d2(report.rmsDbfs)} dBFS   true peak ${d2(report.truePeakDbtp)} dBTP   centroid ${report.centroidHz.toFixed(0)} Hz   frame ${report.analysisFrame}`);
  console.log(`fundamental band ${report.fundamentalBand.lo.toFixed(0)} to ${report.fundamentalBand.hi.toFixed(0)} Hz: ${d2(report.fundamentalBand.db)} dB`);
  console.log(`scream band ${screamLo} to ${screamHi} Hz: ${d2(report.screamBand.db)} dB`);
  console.log(`A1 margin, fundamental minus scream: ${d2(report.screamMarginDb)} dB  (needs at least 12)`);
  console.log(`equal bandwidth, loudest third octave ${d2(report.equalBandwidth.loudestThirdOctaveDb)} dB minus loudest inside the scream band ${d2(report.equalBandwidth.loudestThirdOctaveInScreamBandDb)} dB: ${d2(report.equalBandwidth.marginDb)} dB`);
  console.log(`channel digests, sha256 truncated: ${report.channelDigests.join(' ')}`);
  console.log('one third octave, dB re full scale:');
  for (const r of report.thirds) {
    console.log(`  ${String(r.fc).padStart(6)} Hz  ${d2(r.db).padStart(8)}`);
  }
  if (report.tones) {
    const t = report.tones;
    console.log(`narrowband peaks ${t.band[0]} to ${t.band[1]} Hz, by prominence over a ${t.neighbourhoodBins} bin neighbourhood, frame ${t.frame}, bin ${t.binHz.toFixed(2)} Hz:`);
    for (const pk of t.peaks) {
      console.log(`  ${pk.hz.toFixed(1).padStart(9)} Hz  prominence ${d2(pk.promDb).padStart(7)} dB  bin ${d2(pk.db).padStart(8)} dB`);
    }
  }
  if (report.carriers) {
    report.carriers.forEach((c, i) => {
      console.log(`carrier ch${i}: ${c.hz.toFixed(3)} Hz  (bin ${c.binHz.toFixed(4)} Hz, window ${c.window})`);
    });
    if (report.carrierDiffHz != null) {
      console.log(`carrier difference: ${report.carrierDiffHz.toFixed(3)} Hz`);
    }
  }
  if (report.amAtBeat) {
    const a = report.amAtBeat;
    console.log(`AM at ${report.beatHz} Hz: left ${d2(a.left.db)} dB (floor ${d2(a.left.floorDb)}), right ${d2(a.right.db)} dB (floor ${d2(a.right.floorDb)}), mono sum ${d2(a.monoSum.db)} dB (floor ${d2(a.monoSum.floorDb)})`);
  }
  console.log(`tempo, flux ${report.tempo.fluxBandHz[0]} to ${report.tempo.fluxBandHz[1]} Hz, frames at ${report.tempo.fps.toFixed(1)} per second, shuffled null p95 r=${report.tempo.nullP95 == null ? 'n/a' : report.tempo.nullP95.toFixed(4)} over ${report.tempo.nullTrials} trials:`);
  for (const pk of report.tempo.peaks) {
    console.log(`  ${pk.bpm.toFixed(2)} BPM  r=${pk.r.toFixed(4)}  lag=${pk.lag}`);
  }
  if (report.seam) {
    const s = report.seam;
    console.log(`seam at sample ${s.index}: delta ${s.delta.toExponential(3)}, percentile ${(s.percentile * 100).toFixed(2)}, p50 ${s.p50.toExponential(3)}, p99.9 ${s.p999.toExponential(3)}, max ${s.max.toExponential(3)}`);
  }

  if (opts.json) {
    const rel = String(opts.json);
    const path = isAbsolute(rel) ? rel : join(root, rel);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`wrote ${path}`);
  }
}

main().catch((e) => {
  console.error(`audio-probe: ${e.message}`);
  process.exit(2);
});
