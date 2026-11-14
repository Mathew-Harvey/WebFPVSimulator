/*
 * blackbox-fit.js: what a real quad's blackbox log says the plant should be,
 * beside what the sim's plant is, stock and with Realistic physics on.
 *
 * WHY THIS EXISTS. The plant was reviewed against a critic on 2026-11-14 and
 * the honest finding was that none of its numbers had ever been held against
 * a flight. The Realistic physics switch (src/native/plant.c, THE REALISTIC
 * MODEL) replaces the tuned numbers with derived ones, and a derived number
 * is still not a measured one. This is the measuring half: it reads a log
 * off a real five inch, estimates the handful of constants a log can see,
 * runs the SAME estimator over the sim flying the SAME sticks, and prints
 * the three side by side. Where the columns disagree is where the plant is
 * wrong, and by how much.
 *
 * It fits nothing into the plant. It is an instrument: it changes no file,
 * and a number moves in plant.c only by the owner's word.
 *
 * WHAT A LOG CAN AND CANNOT SEE
 *
 *   motor lag       how fast rpm follows the command. Needs eRPM, which
 *                   needs bidirectional DShot on the quad.
 *   pack            resistance a cell from sag against current, and how far
 *                   the resting voltage fell over the flight. Needs voltage
 *                   and current.
 *   thrust          metres a second squared of lift per unit of summed rpm
 *                   squared, from the accelerometer. Needs eRPM and acc.
 *                   This is thrust over mass, the number that decides where
 *                   hover sits; it reads a little low on a log flown fast,
 *                   because props lose thrust at speed, and the sim replay
 *                   is biased the same way.
 *   agility         radians a second squared of roll and pitch per unit of
 *                   rpm squared difference, from the gyro. With the thrust
 *                   line above, their ratio is inertia over mass and arm,
 *                   which is the test of the derived inertia and needs no
 *                   scale, no thrust stand and no string.
 *   wash            how hard the gyro shakes at low throttle against mid
 *                   throttle, above the stick band. The nearest thing a log
 *                   without GPS holds to "how bad is prop wash".
 *   rear over front how much harder the rear motors work, which is the rear
 *                   props flying in the front props' wake, and also where
 *                   the battery sits. Needs eRPM.
 *
 * It cannot see airspeed, so it cannot fit drag or the inflow curve
 * directly. A log with GPS speed would; that is the next tool, not this.
 *
 * THE LOG. A CSV, from either `blackbox_decode` or Blackbox Explorer's
 * "Export CSV". Columns are found by name: `time`, `gyroADC[0..2]`,
 * `motor[0..3]`, `eRPM[0..3]`, `rcCommand[0..3]`, `accSmooth[0..2]`,
 * `vbatLatest`, `amperageLatest`. Explorer's header rows above the column
 * row are read for `motorOutput`, `acc_1G` and `motor_poles`. A missing
 * column loses the lines that need it and nothing else.
 *
 * THE BEST LOG TO SEND: a five inch on 6S with bidirectional DShot and a
 * current sensor, blackbox at 1 kHz or more, one pack flown from full: a
 * steady hover for ten seconds, a few hard roll and pitch snaps, three
 * punch outs from hover with a chop at the top, a dive back through its own
 * wash, a fast straight run, then freestyle until the pack is done.
 *
 * THE STRING HANG, for the one number no log gives cleanly: `--bifilar`
 * turns a kitchen measurement into a moment of inertia. Hang the quad level
 * from two parallel threads of equal length L, a distance d apart, tied at
 * equal distances either side of the centre of gravity, so the axis you want
 * is vertical and passes between them. Twist it a few degrees about that
 * axis, let go, time twenty swings and divide by twenty for the period T.
 * Then I = m g d^2 T^2 / (16 pi^2 L). Do it three times, once per axis:
 * hung flat for yaw, on its side for pitch, on its nose for roll.
 *
 * Usage:
 *   node scripts/blackbox-fit.js flight.csv
 *   node scripts/blackbox-fit.js flight.csv --poles=14 --motor-range=48,2047
 *   node scripts/blackbox-fit.js flight.csv --replay   the sim on the log's sticks
 *   node scripts/blackbox-fit.js --bifilar --mass=0.68 --d=0.20 --length=1.0 --period=0.71
 *   node scripts/blackbox-fit.js --sim-log=/tmp/sim.csv [--real]
 *       write the sim's own scripted flight as a log, for a look at the format
 *   node scripts/blackbox-fit.js --selftest
 *       the estimator against the sim, whose constants are known
 *
 * Math.sin and friends are used freely here: this is an offline tool, not
 * the physics path, and nothing in it reaches a trace.
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

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadSim, SIM_OK } from '../tests/lib/simmod.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const G = 9.80665;
const RPM = Math.PI / 30;
const REAL_ALL = 255;

function arg(name) {
  const a = process.argv.slice(2).find((x) => x === `--${name}` || x.startsWith(`--${name}=`));
  if (!a) {
    return null;
  }
  return a.includes('=') ? a.split('=').slice(1).join('=') : true;
}

/* ------------------------------------------------------------------ */
/* Reading a log.                                                      */

function cells(line) {
  return line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
}

/* A log as columns of numbers: { t (s), gyro[3] (rad/s), motor[4] (0..1),
 * rpm[4] (rad/s) or null, rc[4] or null, acc[3] (m/s^2) or null, v, i }. */
export function parseLog(text, opts = {}) {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const head = {};
  let at = 0;
  for (; at < lines.length; at += 1) {
    const c = cells(lines[at]);
    if (c.some((x) => /^loopIteration$|^time( \(us\))?$/.test(x))) {
      break;
    }
    if (c.length >= 2) {
      head[c[0]] = c.slice(1).join(',');
    }
  }
  if (at >= lines.length) {
    throw new Error('no column row found: expected one naming loopIteration or time');
  }
  const names = cells(lines[at]).map((n) => n.replace(/ \(.*\)$/, ''));
  const col = (n) => names.indexOf(n);
  const need = (n) => {
    const i = col(n);
    if (i < 0) {
      throw new Error(`the log has no ${n} column`);
    }
    return i;
  };
  const iT = need('time');
  const iG = [0, 1, 2].map((k) => need(`gyroADC[${k}]`));
  const iM = [0, 1, 2, 3].map((k) => need(`motor[${k}]`));
  const opt = (list) => (list.every((i) => i >= 0) ? list : null);
  const iE = opt([0, 1, 2, 3].map((k) => col(`eRPM[${k}]`)));
  const iR = opt([0, 1, 2, 3].map((k) => col(`rcCommand[${k}]`)));
  const iA = opt([0, 1, 2].map((k) => col(`accSmooth[${k}]`)));
  const iV = col('vbatLatest');
  const iI = col('amperageLatest');
  const rows = [];
  for (let k = at + 1; k < lines.length; k += 1) {
    const c = lines[k].split(',');
    if (c.length < names.length) {
      continue;
    }
    const t = Number(c[iT]);
    if (Number.isFinite(t)) {
      rows.push(c);
    }
  }
  const n = rows.length;
  if (n < 2000) {
    throw new Error(`only ${n} rows: too short a log to fit anything`);
  }
  const take = (i, scale = 1) => {
    const out = new Float64Array(n);
    for (let k = 0; k < n; k += 1) {
      out[k] = Number(rows[k][i]) * scale;
    }
    return out;
  };
  const t = take(iT, 1e-6);
  const t0 = t[0];
  for (let k = 0; k < n; k += 1) {
    t[k] -= t0;
  }
  /* Motor range: the header's if it has one, else guessed from the data. */
  const raw = iM.map((i) => take(i));
  let lo = 1000;
  let hi = 2000;
  const mo = String(opts.motorRange || head.motorOutput || '').split(',').map(Number);
  if (mo.length === 2 && mo[1] > mo[0]) {
    [lo, hi] = mo;
  } else {
    /* blackbox_decode writes no header rows. DShot values start at 48 and
     * an analogue ESC's at 1000, so anything seen under 900 is DShot. */
    let min = Infinity;
    let max = 0;
    for (const m of raw) {
      for (let k = 0; k < n; k += 7) {
        min = Math.min(min, m[k]);
        max = Math.max(max, m[k]);
      }
    }
    if (max > 2000 || min < 900) {
      lo = 48;
      hi = 2047;
    }
  }
  const motor = raw.map((m) => m.map((x) => (x - lo) / (hi - lo)));
  const poles = Number(opts.poles || head.motor_poles || 14);
  /* eRPM is logged in hundreds; mechanical rpm is that over the pole pairs. */
  const rpm = iE ? iE.map((i) => take(i, (100 / (poles / 2)) * RPM)) : null;
  const acc1g = Number(opts.acc1g || head.acc_1G || 2048);
  return {
    head,
    n,
    t,
    gyro: iG.map((i) => take(i, Math.PI / 180)),
    motor,
    rpm,
    rc: iR ? iR.map((i) => take(i)) : null,
    acc: iA ? iA.map((i) => take(i, G / acc1g)) : null,
    v: iV >= 0 ? take(iV) : null,
    i: iI >= 0 ? take(iI) : null,
    poles,
    /* A sim log says what world it flew in; a real one flew in this one. */
    gravity: Number(head.sim_gravity) || G,
  };
}

/* ------------------------------------------------------------------ */
/* Least squares, small and dense. Rows of regressors against a target. */

function solve(a, b) {
  const n = b.length;
  const m = a.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c += 1) {
    let p = c;
    for (let r = c + 1; r < n; r += 1) {
      if (Math.abs(m[r][c]) > Math.abs(m[p][c])) {
        p = r;
      }
    }
    [m[c], m[p]] = [m[p], m[c]];
    if (Math.abs(m[c][c]) < 1e-300) {
      return null;
    }
    for (let r = 0; r < n; r += 1) {
      if (r !== c) {
        const f = m[r][c] / m[c][c];
        for (let k = c; k <= n; k += 1) {
          m[r][k] -= f * m[c][k];
        }
      }
    }
  }
  return m.map((r, i) => r[n] / r[i]);
}

class Fit {
  constructor(k) {
    this.k = k;
    this.ata = Array.from({ length: k }, () => new Array(k).fill(0));
    this.atb = new Array(k).fill(0);
    this.n = 0;
  }

  add(x, y) {
    for (let i = 0; i < this.k; i += 1) {
      for (let j = 0; j < this.k; j += 1) {
        this.ata[i][j] += x[i] * x[j];
      }
      this.atb[i] += x[i] * y;
    }
    this.n += 1;
  }

  solve() {
    return this.n > this.k * 20 ? solve(this.ata, this.atb) : null;
  }
}

function median(list) {
  if (!list.length) {
    return NaN;
  }
  const s = Float64Array.from(list).sort();
  return s[s.length >> 1];
}

/* ------------------------------------------------------------------ */
/* The estimator. One log in, one row of numbers out.                   */

export function estimate(log) {
  const { n, t } = log;
  const dt = (t[n - 1] - t[0]) / (n - 1);
  /* Derivatives over about four milliseconds either side, which is wide
   * enough to sit above the gyro's noise and narrow against a motor's lag. */
  const h = Math.max(1, Math.round(0.004 / dt));
  const d = (x, k) => (x[k + h] - x[k - h]) / (t[k + h] - t[k - h]);
  const out = { seconds: t[n - 1] - t[0], hz: 1 / dt };

  /* Motor lag: rpm' = (a + b x + c x^2 - rpm) / tau, x the command times
   * the pack voltage, fitted as one linear regression per motor. */
  if (log.rpm) {
    const taus = [];
    for (let m = 0; m < 4; m += 1) {
      const u = log.motor[m];
      if (u.every((x) => x === u[0])) {
        continue; /* a column the writer did not have */
      }
      const f = new Fit(4);
      for (let k = h; k < n - h; k += 1) {
        const x = u[k] * (log.v ? log.v[k] : 1);
        f.add([1, x, x * x, -log.rpm[m][k]], d(log.rpm[m], k));
      }
      const s = f.solve();
      if (s && s[3] > 0) {
        taus.push(1 / s[3]);
      }
    }
    out.motorTauMs = taus.length ? 1000 * median(taus) : null;
  }

  /* Pack: V = V0 - R I - c Q, with Q the charge drawn so far. */
  if (log.v && log.i) {
    const f = new Fit(3);
    let q = 0;
    let vmax = 0;
    for (let k = 1; k < n; k += 1) {
      q += log.i[k] * (t[k] - t[k - 1]) / 3600;
      vmax = Math.max(vmax, log.v[k]);
      f.add([1, -log.i[k], -q], log.v[k]);
    }
    const s = f.solve();
    const cellsN = Math.max(1, Math.round(vmax / 4.2 + 0.2));
    out.cells = cellsN;
    out.usedAh = q;
    if (s) {
      out.cellMilliohm = 1000 * s[1] / cellsN;
      out.restDropPerAh = s[2] / cellsN;
    }
  }

  /* Hover. In a hover the lift is the weight whatever the accelerometer
   * says, so the calm airborne samples give lift per rpm squared with no
   * sensor but the rpm: not rolling or pitching, rpm steady, off the idle.
   * (The first version read the accelerometer, which on a real frame shakes
   * by several g and sat 6 and 11 percent high on the first two real logs.) */
  let sumW2 = null;
  let sumW3 = null;
  if (log.rpm) {
    sumW2 = new Float64Array(n);
    sumW3 = new Float64Array(n);
    for (let k = 0; k < n; k += 1) {
      for (let m = 0; m < 4; m += 1) {
        const w = log.rpm[m][k];
        sumW2[k] += w * w;
        sumW3[k] += w * w * w;
      }
    }
    const sorted = Float64Array.from(sumW2.filter((_, k) => k % 8 === 0)).sort();
    /* Off the idle: four times the quietest the props ever turned. */
    const floor = 4 * sorted[Math.floor(0.01 * (sorted.length - 1))];
    const span = Math.max(h, Math.round(0.1 / dt));
    /* And not accelerating, where there is an accelerometer: its length
     * averaged over a fifth of a second, within a fifth of gravity. That is
     * what tells a hover from a steady pull, and the average is what makes
     * a shaking sensor usable for it. */
    let accLen = null;
    if (log.acc) {
      accLen = new Float64Array(n);
      let run = 0;
      const len = (k) => Math.hypot(log.acc[0][k], log.acc[1][k], log.acc[2][k]);
      for (let k = 0; k < n; k += 1) {
        run += len(k) - (k >= 2 * span ? len(k - 2 * span) : 0);
        if (k >= 2 * span) {
          accLen[k - span] = run / (2 * span);
        }
      }
    }
    const w2 = [];
    const stick = [];
    const cmd = [];
    const volts = [];
    const amps = [];
    for (let k = span; k < n - span; k += 2) {
      const steady = Math.abs(sumW2[k + span] - sumW2[k - span]) < 0.06 * sumW2[k];
      const level = !accLen || Math.abs(accLen[k] - log.gravity) < 0.2 * log.gravity;
      if (sumW2[k] > floor && steady && level && Math.abs(log.gyro[0][k]) < 0.5 && Math.abs(log.gyro[1][k]) < 0.5) {
        w2.push(sumW2[k]);
        cmd.push((log.motor[0][k] + log.motor[1][k]) / 2);
        if (log.rc) {
          stick.push((log.rc[3][k] - 1000) / 10);
        }
        if (log.v) {
          volts.push(log.v[k]);
        }
        if (log.i) {
          amps.push(log.i[k]);
        }
      }
    }
    if (w2.length > 300) {
      const hoverW2 = median(w2);
      out.hoverSamples = w2.length;
      out.thrustPerW2 = log.gravity / hoverW2;
      out.hoverRpm = Math.sqrt(hoverW2 / 4) / RPM;
      out.hoverMotorPct = 100 * median(cmd);
      out.hoverStickPct = stick.length ? median(stick) : null;
      out.hoverVolts = volts.length ? median(volts) : null;
      out.hoverAmps = amps.length ? median(amps) : null;
      /* Sag with no current sensor: V = V0 - k (sum of rpm cubed) - c t.
       * Shaft power goes as rpm cubed, so k times the hover's own sum is
       * the volts the pack gives up to hold a hover. */
      if (log.v) {
        const f = new Fit(3);
        for (let k = 0; k < n; k += 1) {
          f.add([1, -sumW3[k], -t[k]], log.v[k]);
        }
        const s = f.solve();
        if (s) {
          let w3 = 0;
          let cnt = 0;
          for (let k = span; k < n - span; k += 2) {
            if (Math.abs(sumW2[k] - hoverW2) < 0.1 * hoverW2) {
              w3 += sumW3[k];
              cnt += 1;
            }
          }
          out.hoverSagVolts = cnt ? s[1] * (w3 / cnt) : null;
          out.sagCells = Math.max(1, Math.round(s[0] / 4.2 + 0.2));
        }
      }
    }
  }

  /* Agility: gyro' = A (difference of rpm squared) + c, ON THE SNAPS ONLY.
   * Betaflight order: 0 rear right, 1 front right, 2 rear left, 3 front left.
   *
   * The first version regressed over the whole flight, and on four real
   * logs rpm explained under a quarter of the gyro's acceleration, flips
   * and all: between snaps the acceleration is noise and the rpm
   * difference sits at the telemetry's own step (57 rpm on a 14 pole
   * motor), so the slope collapsed toward zero. A snap is where the signal
   * is, a hundred times the noise. So: both sides smoothed over the same
   * 16 ms window, only the samples where the gyro is accelerating past 60
   * rad/s2 with the props off the idle, and the rpm allowed to arrive up
   * to 12 ms late, which telemetry does. The share explained is printed,
   * and a fit explaining under half prints no number. */
  if (log.rpm) {
    const half = Math.max(2, Math.round(0.008 / dt));
    const kern = [];
    let ksum = 0;
    for (let j = -half; j <= half; j += 1) {
      const v = 0.5 + 0.5 * Math.cos(Math.PI * j / (half + 1));
      kern.push(v);
      ksum += v;
    }
    const smooth = (x) => {
      const y = new Float64Array(n);
      for (let k = half; k < n - half; k += 1) {
        let s = 0;
        for (let j = -half; j <= half; j += 1) {
          s += kern[j + half] * x[k + j];
        }
        y[k] = s / ksum;
      }
      return y;
    };
    const sorted = Float64Array.from(sumW2.filter((_, k) => k % 8 === 0)).sort();
    const floor = 4 * sorted[Math.floor(0.01 * (sorted.length - 1))];
    const sq = (m, k) => log.rpm[m][k] * log.rpm[m][k];
    const axes = [
      ['roll', 0, (k) => sq(2, k) + sq(3, k) - sq(0, k) - sq(1, k)],
      ['pitch', 1, (k) => sq(0, k) + sq(2, k) - sq(1, k) - sq(3, k)],
    ];
    const maxLag = Math.round(0.012 / dt);
    for (const [name, ax, diff] of axes) {
      const gs = smooth(log.gyro[ax]);
      const raw = new Float64Array(n);
      for (let k = 0; k < n; k += 1) {
        raw[k] = diff(k);
      }
      const ds = smooth(raw);
      const ev = [];
      for (let k = half + maxLag + 1; k < n - half - 1; k += 1) {
        const acc = (gs[k + 1] - gs[k - 1]) / (t[k + 1] - t[k - 1]);
        if (Math.abs(acc) > 60 && sumW2[k] > floor) {
          ev.push([k, acc]);
        }
      }
      out[`${name}Snaps`] = ev.length;
      if (ev.length < 150) {
        continue;
      }
      let best = null;
      for (let lag = 0; lag <= maxLag; lag += 1) {
        let sx = 0;
        let sy = 0;
        let sxx = 0;
        let sxy = 0;
        let syy = 0;
        for (const [k, acc] of ev) {
          const x = ds[k - lag];
          sx += x; sy += acc; sxx += x * x; sxy += x * acc; syy += acc * acc;
        }
        const m = ev.length;
        const cov = sxy - sx * sy / m;
        const vx = sxx - sx * sx / m;
        const vy = syy - sy * sy / m;
        const r2 = vx > 0 && vy > 0 ? (cov * cov) / (vx * vy) : 0;
        if (!best || r2 > best.r2) {
          best = { r2, slope: cov / vx };
        }
      }
      out[`${name}Fit`] = best.r2;
      if (best.r2 >= 0.5 && best.slope > 0) {
        out[`${name}PerW2`] = best.slope;
        if (out.thrustPerW2) {
          /* Inertia over (mass times arm): thrust per w^2 over mass, divided
           * by torque per w^2 over inertia. Metres. */
          out[`${name}Gyration`] = out.thrustPerW2 / best.slope;
        }
      }
    }
  }

  /* Wash: gyro above 25 Hz, rms, at low throttle against mid throttle. */
  {
    const w = Math.max(2, Math.round(0.02 / dt));
    const bins = { low: [0, 0], mid: [0, 0] };
    const run = [0, 0, 0];
    for (let k = 0; k < n; k += 1) {
      let e = 0;
      for (let a = 0; a < 3; a += 1) {
        run[a] += log.gyro[a][k] - (k >= 2 * w ? log.gyro[a][k - 2 * w] : 0);
        if (k >= 2 * w) {
          const hp = log.gyro[a][k - w] - run[a] / (2 * w);
          e += hp * hp;
        }
      }
      if (k >= 2 * w) {
        const u = (log.motor[0][k - w] + log.motor[1][k - w]) / 2;
        const b = u < 0.12 ? bins.low : (u > 0.2 && u < 0.5 ? bins.mid : null);
        if (b) {
          b[0] += e;
          b[1] += 1;
        }
      }
    }
    const rms = (b) => (b[1] > 200 ? (180 / Math.PI) * Math.sqrt(b[0] / b[1]) : null);
    out.shakeLow = rms(bins.low);
    out.shakeMid = rms(bins.mid);
  }

  /* Rear over front, where the quad is working. */
  if (log.rpm) {
    let rear = 0;
    let front = 0;
    for (let k = 0; k < n; k += 1) {
      if (log.motor[0][k] > 0.25) {
        rear += log.rpm[0][k] + log.rpm[2][k];
        front += log.rpm[1][k] + log.rpm[3][k];
      }
    }
    out.rearOverFront = front > 0 ? rear / front : null;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* The sim, flown on a stick script and written down as a log.          */

/* Stick frames: [seconds, roll, pitch, yaw, throttle]. Around a hover, so
 * the quad stays slow: doublets on each axis, throttle steps, a long pull.
 * Gentle leaves out the punch outs and the pull, for the one line (lift)
 * that only a slow flight reads true. */
function scriptedSticks(hover, gentle = false) {
  const f = [];
  let t = 0;
  const hold = (s, r, p, y, th) => { f.push([t, r, p, y, th]); t += s; };
  hold(2, 0, 0, 0, hover);
  for (let rep = 0; rep < 6; rep += 1) {
    const a = 0.15 + 0.05 * rep;
    hold(0.12, a, 0, 0, hover); hold(0.24, -a, 0, 0, hover); hold(0.12, a, 0, 0, hover); hold(0.5, 0, 0, 0, hover);
    hold(0.12, 0, a, 0, hover); hold(0.24, 0, -a, 0, hover); hold(0.12, 0, a, 0, hover); hold(0.5, 0, 0, 0, hover);
    hold(0.4, 0, 0, 0, hover + 0.25); hold(0.4, 0, 0, 0, hover - 0.12); hold(0.5, 0, 0, 0, hover);
    if (!gentle) {
      hold(0.25, 0, 0, 0, 0.9); hold(0.35, 0, 0, 0, 0.02); hold(0.6, 0, 0, 0, hover + 0.05);
    }
  }
  if (gentle) {
    return { frames: f, seconds: t };
  }
  hold(1.5, 0, 0, 0, 0.75);
  hold(1, 0, 0, 0, hover);
  return { frames: f, seconds: t };
}

function sticksFromLog(log) {
  const frames = [];
  for (let k = 0; k < log.n; k += 4) {
    frames.push([log.t[k], log.rc[0][k] / 500, log.rc[1][k] / 500, log.rc[2][k] / 500,
      Math.min(1, Math.max(0, (log.rc[3][k] - 1000) / 1000))]);
  }
  return { frames, seconds: log.t[log.n - 1] };
}

const clamp1 = (x) => Math.min(1, Math.max(-1, x));

/* Where the sim hovers on the throttle, by bisection: the stick at which a
 * level quad neither climbs nor sinks over the second half of a second. */
async function simHover(real) {
  let lo = 0.1;
  let hi = 0.6;
  for (let it = 0; it < 12; it += 1) {
    const mid = (lo + hi) / 2;
    const { log } = await simLog({ frames: [[0, 0, 0, 0, mid]], seconds: 1.2 }, real);
    let up = 0;
    for (let k = 600; k < log.n; k += 1) {
      up += log.acc[2][k] - log.gravity;
    }
    if (up > 0) {
      hi = mid;
    } else {
      lo = mid;
    }
  }
  return (lo + hi) / 2;
}

/* Fly the sticks and return a log of the same shape parseLog gives. Motor
 * commands are the two the module's debug tap carries, 0 and 1. */
export async function simLog(sticks, real) {
  const sim = await loadSim(await readFile(join(root, 'dist/sim.wasm')));
  const config = await readFile(join(root, 'configs/betaflight-default.diff'), 'utf8');
  if (sim.init(config) !== SIM_OK) {
    throw new Error('sim_init failed');
  }
  if (real) {
    if (typeof sim.e.sim_set_realism !== 'function') {
      throw new Error('dist/sim.wasm has no sim_set_realism: rebuild it');
    }
    sim.e.sim_set_realism(real);
  }
  const gScale = real ? 1.0 : 1.62;
  sim.e.sim_set_gravity(gScale);
  sim.e.sim_set_air(1.1);
  sim.reset();
  sim.setCellVoltage(4.2);
  const n = Math.floor(sticks.seconds * 1000);
  const log = {
    head: {}, n, poles: 14, gravity: G * gScale,
    t: new Float64Array(n),
    gyro: [0, 1, 2].map(() => new Float64Array(n)),
    motor: [0, 1, 2, 3].map(() => new Float64Array(n)),
    rpm: [0, 1, 2, 3].map(() => new Float64Array(n)),
    rc: [0, 1, 2, 3].map(() => new Float64Array(n)),
    acc: [0, 1, 2].map(() => new Float64Array(n)),
    v: new Float64Array(n),
    i: new Float64Array(n),
  };
  const st = new Float64Array(20);
  let fi = 0;
  let pv = [0, 0, 0];
  let m0 = Infinity;
  let m1 = -Infinity;
  for (let k = 0; k < n; k += 1) {
    const now = k / 1000;
    while (fi + 1 < sticks.frames.length && sticks.frames[fi + 1][0] <= now) {
      fi += 1;
    }
    if (k % 4 === 0) {
      const f = sticks.frames[fi];
      sim.input(now, clamp1(f[1]), clamp1(f[2]), clamp1(f[3]), f[4]);
    }
    sim.step(1);
    sim.readStateInto(st);
    log.t[k] = now;
    for (let a = 0; a < 3; a += 1) {
      log.rc[a][k] = 500 * clamp1(sticks.frames[fi][1 + a]);
    }
    log.rc[3][k] = 1000 + 1000 * sticks.frames[fi][4];
    for (let a = 0; a < 3; a += 1) {
      log.gyro[a][k] = st[11 + a];
    }
    for (let m = 0; m < 4; m += 1) {
      log.rpm[m][k] = st[14 + m] * RPM;
    }
    log.v[k] = st[18];
    log.i[k] = st[19];
    log.motor[0][k] = sim.e.sim_bf_debug(6);
    log.motor[1][k] = sim.e.sim_bf_debug(7);
    m0 = Math.min(m0, log.motor[0][k], log.motor[1][k]);
    m1 = Math.max(m1, log.motor[0][k], log.motor[1][k]);
    /* Specific force on the body's up axis: the world acceleration less
     * gravity, turned into the body by the attitude quaternion. */
    const ax = (st[4] - pv[0]) * 1000;
    const ay = (st[5] - pv[1]) * 1000;
    const az = (st[6] - pv[2]) * 1000 + G * gScale;
    pv = [st[4], st[5], st[6]];
    const [qw, qx, qy, qz] = [st[7], st[8], st[9], st[10]];
    log.acc[0][k] = (1 - 2 * (qy * qy + qz * qz)) * ax + 2 * (qx * qy + qw * qz) * ay + 2 * (qx * qz - qw * qy) * az;
    log.acc[1][k] = 2 * (qx * qy - qw * qz) * ax + (1 - 2 * (qx * qx + qz * qz)) * ay + 2 * (qy * qz + qw * qx) * az;
    log.acc[2][k] = 2 * (qx * qz + qw * qy) * ax + 2 * (qy * qz - qw * qx) * ay + (1 - 2 * (qx * qx + qy * qy)) * az;
  }
  /* The tap is Betaflight's motor value; put it on 0..1 over the range the
   * flight used from idle, and give the two motors it lacks their mean. */
  const lo = Math.min(m0, 1000);
  const hi = Math.max(m1, 2000);
  for (let k = 0; k < n; k += 1) {
    log.motor[0][k] = (log.motor[0][k] - lo) / (hi - lo);
    log.motor[1][k] = (log.motor[1][k] - lo) / (hi - lo);
  }
  log.motor[2].fill(log.motor[0][0]);
  log.motor[3].fill(log.motor[0][0]);
  log.acc[2][0] = log.acc[2][1];
  const truth = {
    kt: sim.e.sim_bf_debug(10), mass: sim.e.sim_bf_debug(51), rCell: sim.e.sim_bf_debug(63),
    ixx: sim.e.sim_bf_debug(55),
  };
  return { log, truth };
}

function logCsv(log) {
  const rows = ['loopIteration,time (us),gyroADC[0],gyroADC[1],gyroADC[2],motor[0],motor[1],motor[2],motor[3],'
    + 'eRPM[0],eRPM[1],eRPM[2],eRPM[3],rcCommand[0],rcCommand[1],rcCommand[2],rcCommand[3],accSmooth[0],accSmooth[1],accSmooth[2],vbatLatest (V),amperageLatest (A)'];
  const e = (x) => (x / RPM * (log.poles / 2) / 100).toFixed(2);
  for (let k = 0; k < log.n; k += 1) {
    rows.push([k, Math.round(log.t[k] * 1e6),
      ...[0, 1, 2].map((a) => (log.gyro[a][k] * 180 / Math.PI).toFixed(3)),
      ...[0, 1, 2, 3].map((m) => (1000 + 1000 * log.motor[m][k]).toFixed(1)),
      ...[0, 1, 2, 3].map((m) => e(log.rpm[m][k])),
      ...[0, 1, 2, 3].map((a) => log.rc[a][k].toFixed(0)),
      ...[0, 1, 2].map((a) => (log.acc[a][k] * 2048 / G).toFixed(2)),
      log.v[k].toFixed(3), log.i[k].toFixed(3)].join(','));
  }
  return `"motorOutput","1000,2000"\n"acc_1G","2048"\n"motor_poles","${log.poles}"\n"sim_gravity","${log.gravity}"\n${rows.join('\n')}\n`;
}

/* ------------------------------------------------------------------ */
/* The report.                                                         */

const LINES = [
  ['hoverStickPct', 'throttle stick at hover, percent', 1],
  ['hoverMotorPct', 'motor output at hover, percent', 1],
  ['hoverRpm', 'rpm a motor at hover', 0],
  ['thrustPerW2', 'lift per rpm squared, m/s2 per (rad/s)2', 9],
  ['motorTauMs', 'motor lag, ms', 1],
  ['hoverVolts', 'pack volts at hover', 2],
  ['hoverSagVolts', 'volts the pack sags to hold a hover', 2],
  ['hoverAmps', 'amps at hover, as the sensor reads', 2],
  ['cellMilliohm', 'pack resistance, milliohm a cell', 2],
  ['restDropPerAh', 'resting volts lost a cell per Ah', 3],
  ['rollFit', 'roll snaps: share explained by rpm', 2],
  ['rollPerW2', 'roll kick per rpm squared difference', 9],
  ['rollGyration', 'roll inertia over mass and arm, mm', 1, 1000],
  ['pitchFit', 'pitch snaps: share explained by rpm', 2],
  ['pitchPerW2', 'pitch kick per rpm squared difference', 9],
  ['pitchGyration', 'pitch inertia over mass and arm, mm', 1, 1000],
  ['shakeLow', 'shake at low throttle, deg/s rms', 2],
  ['shakeMid', 'shake at mid throttle, deg/s rms', 2],
  ['rearOverFront', 'rear rpm over front rpm', 3],
];

function table(cols) {
  const names = Object.keys(cols);
  console.log(`  ${''.padEnd(42)}${names.map((c) => c.padStart(16)).join('')}`);
  for (const [key, label, digits, scale = 1] of LINES) {
    const cell = (c) => {
      const v = cols[c][key];
      if (v == null || !Number.isFinite(v)) {
        return '-'.padStart(16);
      }
      return (digits === 9 ? (v * scale).toExponential(3) : (v * scale).toFixed(digits)).padStart(16);
    };
    console.log(`  ${label.padEnd(42)}${names.map(cell).join('')}`);
  }
}

function bifilar() {
  const m = Number(arg('mass'));
  const dd = Number(arg('d'));
  const len = Number(arg('length'));
  const period = Number(arg('period'));
  if (![m, dd, len, period].every((x) => Number.isFinite(x) && x > 0)) {
    throw new Error('--bifilar needs --mass (kg) --d (m between threads) --length (m of thread) --period (s a swing)');
  }
  const inertia = m * G * dd * dd * period * period / (16 * Math.PI * Math.PI * len);
  console.log(`bifilar: I = ${inertia.toExponential(4)} kg m2`);
  console.log('  the plant holds, roll pitch yaw:  stock 3.50e-3 3.80e-3 6.80e-3,  Realistic 2.35e-3 2.46e-3 3.90e-3');
}

async function selftest() {
  let failures = 0;
  const check = (name, ok, detail) => {
    console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}  (${detail})`);
    failures += ok ? 0 : 1;
  };
  const near = (a, b, tol) => Math.abs(a / b - 1) <= tol;
  const hs = await simHover(0);
  const hr = await simHover(REAL_ALL);
  const stock = await simLog(scriptedSticks(hs), 0);
  const real = await simLog(scriptedSticks(hr), REAL_ALL);
  /* Through the writer and the reader, so the file format is in the test. */
  const es = estimate(parseLog(logCsv(stock.log)));
  const er = estimate(parseLog(logCsv(real.log)));
  table({ 'sim stock': es, 'sim Realistic': er });
  const kts = stock.truth.kt / stock.truth.mass;
  check('stock: lift per rpm squared is the plant kt over mass', near(es.thrustPerW2, kts, 0.10),
    `${es.thrustPerW2.toExponential(3)} against ${kts.toExponential(3)}`);
  check('Realistic: and the same, in its own lighter world', near(er.thrustPerW2, kts, 0.10),
    `${er.thrustPerW2.toExponential(3)}`);
  check('stock: the hover it reads is the hover the sim holds', Math.abs(es.hoverStickPct - 100 * hs) < 1.5,
    `${es.hoverStickPct.toFixed(1)} against ${(100 * hs).toFixed(1)}`);
  check('Realistic: the hover it reads is the hover the sim holds', Math.abs(er.hoverStickPct - 100 * hr) < 1.5,
    `${er.hoverStickPct.toFixed(1)} against ${(100 * hr).toFixed(1)}`);
  check('stock: pack resistance is the plant r_cell', near(es.cellMilliohm, 1000 * stock.truth.rCell, 0.20),
    `${es.cellMilliohm.toFixed(2)} against ${(1000 * stock.truth.rCell).toFixed(2)}`);
  check('stock: motor lag is a real motor, 15 to 80 ms', es.motorTauMs > 15 && es.motorTauMs < 80, `${es.motorTauMs.toFixed(1)}`);
  const want = stock.truth.ixx / real.truth.ixx;
  check('roll kick rises by the inertia ratio with Realistic on', near(er.rollPerW2 / es.rollPerW2, want, 0.15),
    `${(er.rollPerW2 / es.rollPerW2).toFixed(2)} against ${want.toFixed(2)}`);
  /* And the alignment itself: Realistic reads inside what the owner's four
   * flights of 2026-11-14 read on the same lines (PROGRESS.md). */
  check('Realistic: motor lag is inside the logged 37 to 42 ms', er.motorTauMs >= 37 && er.motorTauMs <= 42, `${er.motorTauMs.toFixed(1)}`);
  check('Realistic: roll and pitch inertia over mass and arm are inside the logged 45 to 57 mm',
    [er.rollGyration, er.pitchGyration].every((x) => x >= 0.045 && x <= 0.057),
    `${(1000 * er.rollGyration).toFixed(1)} and ${(1000 * er.pitchGyration).toFixed(1)}`);
  check('Realistic: the volts given up to hover are inside the logged 0.16 to 0.37', er.hoverSagVolts >= 0.16 && er.hoverSagVolts <= 0.37,
    `${er.hoverSagVolts.toFixed(2)}`);
  check('Realistic: the pack rests lower as it is used, stock does not',
    er.restDropPerAh > 0.05 && Math.abs(es.restDropPerAh) < 0.05,
    `${er.restDropPerAh.toFixed(3)} and ${es.restDropPerAh.toFixed(3)} V a cell per Ah`);
  console.log(failures ? `\n${failures} failed` : '\nall passed');
  process.exitCode = failures ? 1 : 0;
}

async function main() {
  if (arg('bifilar')) {
    bifilar();
    return;
  }
  if (arg('selftest')) {
    await selftest();
    return;
  }
  const simOut = arg('sim-log');
  if (simOut) {
    const real = arg('real') ? REAL_ALL : 0;
    const { log } = await simLog(scriptedSticks(await simHover(real)), real);
    await writeFile(simOut, logCsv(log));
    console.log(`wrote ${simOut}: ${log.n} rows, ${real ? 'Realistic physics' : 'stock'}`);
    return;
  }
  const file = process.argv.slice(2).find((a) => !a.startsWith('--'));
  if (!file) {
    console.log('usage: node scripts/blackbox-fit.js flight.csv [--poles=14]   (see the top of this file)');
    process.exitCode = 2;
    return;
  }
  const log = parseLog(await readFile(file, 'utf8'),
    { poles: arg('poles'), acc1g: arg('acc1g'), motorRange: arg('motor-range') });
  const mine = estimate(log);
  console.log(`blackbox-fit: ${file}, ${mine.seconds.toFixed(1)} s at ${mine.hz.toFixed(0)} Hz, ${mine.sagCells || mine.cells || '?'} cells`
    + `${log.rpm ? '' : ', NO eRPM (most lines need bidirectional DShot)'}`);
  /* The sim flies its own scripted flight around its own hover, unless
   * --replay asks for the log's sticks. A replay is open loop: the sim is
   * not the pilot's quad, so on the same sticks it flies somewhere else and
   * usually into a tumble, which the first real logs showed at once. */
  const replay = Boolean(arg('replay')) && log.rc;
  const fly = async (real) => estimate((await simLog(
    replay ? sticksFromLog(log) : scriptedSticks(await simHover(real)), real)).log);
  const stock = await fly(0);
  const real = await fly(REAL_ALL);
  console.log(replay ? '  the sim columns fly this log\'s own sticks, open loop' : '  the sim columns fly the sim\'s own scripted flight around its own hover');
  if (mine.hoverAmps != null && mine.hoverVolts != null && mine.hoverAmps * mine.hoverVolts < 45) {
    console.log(`  NOTE: ${(mine.hoverAmps * mine.hoverVolts).toFixed(0)} W at hover is less than the air itself needs to hold a five inch up,`
      + ' so the current sensor reads low and the two lines that use it mean nothing.');
  }
  for (const ax of ['roll', 'pitch']) {
    if (mine[`${ax}Snaps`] != null && mine[`${ax}Snaps`] < 150) {
      console.log(`  NOTE: ${ax} inertia not read: under a sixth of a second of hard ${ax} acceleration in the whole flight. It needs snaps.`);
    } else if (mine[`${ax}Fit`] != null && mine[`${ax}Fit`] < 0.5) {
      console.log(`  NOTE: ${ax} inertia not read: on the snaps, rpm explains only ${(100 * mine[`${ax}Fit`]).toFixed(0)} percent of the gyro. Check the motor order and each motor's rpm.`);
    }
  }
  table({ 'this log': mine, 'sim stock': stock, 'sim Realistic': real });
  console.log('  Read across: the sim column nearer the log is the truer plant on that line.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(String(e && e.message ? e.message : e));
    process.exit(99);
  });
}
