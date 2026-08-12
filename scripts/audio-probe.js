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
 *   per channel peak frequencies, for the binaural carriers
 *   amplitude modulation at a named frequency in each channel and in the
 *     mono sum, which is what separates a binaural beat from a monaural one
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
 *        [--level=0.5] [--blades=3] [--f0=HZ] [--scream=2000,8000]
 *        [--carrier=80,600] [--beat=6] [--seam=SEC] [--json=PATH]
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
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
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

function bandRmsDb(spec, lo, hi) {
  let sum = 0;
  const k0 = Math.max(0, Math.ceil(lo / spec.binHz));
  const k1 = Math.min(spec.power.length - 1, Math.floor(hi / spec.binHz));
  for (let k = k0; k <= k1; k += 1) {
    sum += spec.power[k];
  }
  return sum > 0 ? 10 * Math.log10(sum) : -Infinity;
}

function thirdOctaves(spec) {
  const rows = [];
  for (let n = 13; n <= 43; n += 1) {
    const fc = 10 ** (n / 10);
    const lo = fc / 2 ** (1 / 6);
    const hi = fc * 2 ** (1 / 6);
    if (lo >= spec.rate / 2) {
      break;
    }
    rows.push({ fc, lo, hi, db: bandRmsDb(spec, lo, Math.min(hi, spec.rate / 2)) });
  }
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
  let peak = 0;
  for (let i = half; i < x.length - half; i += 1) {
    for (let p = 0; p < phases; p += 1) {
      const row = h[p];
      let y = 0;
      for (let m = 0; m < taps; m += 1) {
        y += row[m] * x[i - half + 1 + m];
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
  /* Goertzel style single bin over the whole envelope. */
  let sr = 0;
  let si = 0;
  for (let i = 0; i < env.length; i += 1) {
    const a = (2 * Math.PI * f * i) / rate;
    sr += (env[i] - mean) * Math.cos(a);
    si += (env[i] - mean) * Math.sin(a);
  }
  const amp = (2 * Math.sqrt(sr * sr + si * si)) / env.length;
  return { db: 20 * Math.log10(amp / mean), mean, depth: amp / mean };
}

/* Tempo from the autocorrelation of spectral flux. Reports the top peaks
 * so a reviewer can see whether the strongest one is a half or double of
 * whatever is claimed. */
function tempo(x, rate) {
  const frame = 1024;
  const hop = 256;
  const fps = rate / hop;
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
      for (let k = 0; k < frame / 2; k += 1) {
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
    return { fps, peaks: [] };
  }
  let mean = 0;
  for (const f of flux) {
    mean += f;
  }
  mean /= flux.length;
  const s = flux.map((f) => f - mean);
  const lagMin = Math.max(2, Math.floor((60 * fps) / 220));
  const lagMax = Math.min(s.length - 2, Math.ceil((60 * fps) / 60));
  const ac = [];
  let ac0 = 0;
  for (let i = 0; i < s.length; i += 1) {
    ac0 += s[i] * s[i];
  }
  for (let lag = lagMin; lag <= lagMax; lag += 1) {
    let v = 0;
    for (let i = 0; i + lag < s.length; i += 1) {
      v += s[i] * s[i + lag];
    }
    ac.push({ lag, r: ac0 > 0 ? v / ac0 : 0, bpm: (60 * fps) / lag });
  }
  const peaks = ac.filter((pk, i) => (
    i > 0 && i < ac.length - 1 && ac[i - 1].r < pk.r && ac[i + 1].r < pk.r
  ));
  peaks.sort((a, b) => b.r - a.r);
  return { fps, peaks: peaks.slice(0, 6) };
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
  a.setEnabled(true);
  const rpm = [0, 0, 0, 0];
  for (const row of spec.trace) {
    rpm[0] = row[1]; rpm[1] = row[2]; rpm[2] = row[3]; rpm[3] = row[4];
    a.update(rpm, row[5], row[0]);
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
    trace: 'flight', seconds: 20, rate: 48000, level: 0.5, blades: 3,
    scream: '2000,8000', carrier: '', beat: 0, seam: 0, f0: 0, json: '',
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
  const spec = {
    seconds, rate, level: Number(opts.level), trace,
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

  const meanRpm = trace.reduce((s, r) => s + (r[1] + r[2] + r[3] + r[4]) / 4, 0) / (trace.length || 1);
  const f0 = Number(opts.f0) || (meanRpm / 60) * Number(opts.blades);
  const spec8 = spectrum(mono, rate, 8192);
  const [screamLo, screamHi] = String(opts.scream).split(',').map(Number);
  const fundBand = bandAt(spec8, f0);
  const p = peakOf(mono);
  const tp = truePeakDb(mono);

  const report = {
    trace: String(opts.trace),
    seconds,
    rate: meta.rate,
    channels: meta.channels,
    samples: meta.length,
    nodes: meta.nodes,
    level: Number(opts.level),
    motorSpread: MOTOR_SPREAD,
    traceHz: TRACE_HZ,
    meanRpm,
    blades: Number(opts.blades),
    bladePassHz: f0,
    peakSample: p.peak,
    samplesAtOrOverFullScale: p.clipped,
    rmsDbfs: rmsDb(mono),
    truePeakDbtp: tp,
    centroidHz: centroid(spec8),
    fundamentalBand: { fc: fundBand.fc, lo: fundBand.lo, hi: fundBand.hi, db: fundBand.db },
    screamBand: { lo: screamLo, hi: screamHi, db: bandRmsDb(spec8, screamLo, screamHi) },
    thirds: thirdOctaves(spec8).map((r) => ({ fc: Math.round(r.fc), db: Number(d2(r.db)) })),
    perChannelRmsDbfs: channels.map((c) => rmsDb(c)),
  };
  report.screamMarginDb = report.fundamentalBand.db - report.screamBand.db;

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
  report.tempo = tempo(mono, rate);
  if (Number(opts.seam) > 0) {
    report.seam = seamTest(mono, Math.round(Number(opts.seam) * rate));
  }

  console.log(`trace=${report.trace} ${seconds}s @ ${report.rate} Hz  ${report.channels} ch  nodes=${report.nodes}  level=${report.level}`);
  console.log(`mean commanded RPM ${report.meanRpm.toFixed(0)}  blade pass ${report.bladePassHz.toFixed(1)} Hz at ${report.blades} blades`);
  console.log(`peak sample ${report.peakSample.toFixed(4)}  at or over full scale: ${report.samplesAtOrOverFullScale} samples`);
  console.log(`RMS ${d2(report.rmsDbfs)} dBFS   true peak ${d2(report.truePeakDbtp)} dBTP   centroid ${report.centroidHz.toFixed(0)} Hz`);
  console.log(`fundamental band ${report.fundamentalBand.lo.toFixed(0)} to ${report.fundamentalBand.hi.toFixed(0)} Hz: ${d2(report.fundamentalBand.db)} dB`);
  console.log(`scream band ${screamLo} to ${screamHi} Hz: ${d2(report.screamBand.db)} dB`);
  console.log(`A1 margin, fundamental minus scream: ${d2(report.screamMarginDb)} dB  (needs at least 12)`);
  console.log('one third octave, dB re full scale:');
  for (const r of report.thirds) {
    console.log(`  ${String(r.fc).padStart(6)} Hz  ${d2(r.db).padStart(8)}`);
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
    console.log(`AM at ${report.beatHz} Hz: left ${d2(a.left.db)} dB, right ${d2(a.right.db)} dB, mono sum ${d2(a.monoSum.db)} dB (relative to envelope mean)`);
  }
  console.log(`tempo, flux frames at ${report.tempo.fps.toFixed(1)} per second:`);
  for (const pk of report.tempo.peaks) {
    console.log(`  ${pk.bpm.toFixed(2)} BPM  r=${pk.r.toFixed(4)}  lag=${pk.lag}`);
  }
  if (report.seam) {
    const s = report.seam;
    console.log(`seam at sample ${s.index}: delta ${s.delta.toExponential(3)}, percentile ${(s.percentile * 100).toFixed(2)}, p50 ${s.p50.toExponential(3)}, p99.9 ${s.p999.toExponential(3)}, max ${s.max.toExponential(3)}`);
  }

  if (opts.json) {
    const path = join(root, String(opts.json));
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`wrote ${path}`);
  }
}

main().catch((e) => {
  console.error(`audio-probe: ${e.message}`);
  process.exit(2);
});
