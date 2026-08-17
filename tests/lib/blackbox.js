/*
 * blackbox.js: read a real quad's flight log into the shapes this simulator
 * speaks.
 *
 * WHY THIS EXISTS. Every flight feel constant in src/native/plant.c was
 * tuned until the closed loop landed inside a verification band, and the
 * bands measure ratios and SI kinematics, not feel. PROGRESS.md says so in
 * as many words, more than once: "flight feel itself is not verifiable
 * here". So the propwash gain has been 0.60, 0.12, 0.30 and 0.08, each move
 * decided by one pilot flying it and remembering the last one.
 *
 * There is a way out that is open to this project and closed to almost every
 * other simulator: the controller here is not a model of Betaflight, it IS
 * Betaflight, the same 4.5.1 source a real quad runs. Feed a real quad's
 * logged stick stream into this build with that quad's own diff loaded, and
 * the two systems differ ONLY in the plant. The residual between the logged
 * gyro and the simulated gyro is therefore not a mystery, it is this
 * project's plant error, and it can be decomposed per axis.
 *
 * INPUT FORMAT. Betaflight logs are a packed binary .BBL and this file does
 * not parse them. Run the standard tool first:
 *
 *   blackbox_decode --unit-gyro deg --unit-vbat V --merge-gps 0 LOG.BBL
 *
 * which writes LOG.01.csv beside it. That tool is maintained by the
 * Betaflight project and gets the frame packing, the predictors and the
 * unit scaling right; reimplementing it here would be a second decoder to
 * keep in sync with a format this project does not own.
 *
 * THE TWO CONVENTIONS THAT MATTER, both taken from the code rather than
 * from memory, because getting either backwards produces a plausible
 * looking report that is worthless:
 *
 *   Gyro. src/native/bf/bf_glue.c:731-740 documents the polarity it feeds
 *   the firmware: "internal positive roll is roll right (+p here), internal
 *   positive pitch is nose DOWN (+q here), internal positive yaw is nose
 *   LEFT (+r here)", written straight from s->omega with no sign changes.
 *   Blackbox gyroADC[] is that same internal array, so the log's three gyro
 *   columns map onto the state block's P, Q and R one for one, in deg/s.
 *   No flips.
 *
 *   Sticks. bf_glue.c:751-761 builds rcData from the ABI channels:
 *     rcData[ROLL]     = 1500 + 500 * rc[0]
 *     rcData[PITCH]    = 1500 - 500 * rc[1]      <- note the minus
 *     rcData[YAW]      = 1500 + 500 * rc[2]
 *     rcData[THROTTLE] = 1000 + 1000 * rc[3]
 *   Blackbox rcCommand[] is rcData carried through rc.c, so it keeps
 *   rcData's polarity. Inverting the above is what parseBlackboxCsv does,
 *   and the PITCH minus is the one that would otherwise flip every
 *   comparison on that axis while still looking like a tracking error.
 *
 * WHAT THE GYRO COLUMN ACTUALLY IS. Betaflight logs gyroADC after the
 * filter chain, so a comparison against it carries that chain's group
 * delay on the real side. This is honest for a whole-loop comparison and
 * slightly pessimistic for a plant one. A log flown with debug_mode =
 * GYRO_SCALED carries the pre-filter rate in debug[], and readGyroColumns
 * prefers those when they are present.
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

/* Betaflight stick units. rcCommand roll/pitch/yaw span plus and minus this
 * about centre; throttle is a PWM microsecond value. */
const RC_SPAN = 500;
const THR_MIN = 1000;
const THR_SPAN = 1000;

/*
 * Split one CSV line. blackbox_decode quotes any field containing a comma
 * and doubles an embedded quote, which is ordinary CSV; the header row is
 * the one that needs it, since field names carry brackets and spaces.
 */
function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur.trim());
  return out;
}

/*
 * Column names vary with the decoder version and the flags it was given:
 * "time (us)" or "time", "gyroADC[0]" or "gyroADCs[0]", "vbatLatest (V)" or
 * "vbatLatest". Match on a normalised name so the harness does not fail on
 * a decoder upgrade.
 */
function normaliseName(name) {
  return name.toLowerCase().replace(/\s*\(.*?\)\s*/g, '').replace(/[^a-z0-9[\]]/g, '');
}

function findColumn(names, candidates) {
  for (const want of candidates) {
    const i = names.indexOf(want);
    if (i >= 0) {
      return i;
    }
  }
  return -1;
}

/*
 * The gyro triple, preferring an unfiltered debug trace when the log has
 * one. debug_mode = GYRO_SCALED writes the scaled pre-filter rate into
 * debug[0..2], which is the closer comparison for a PLANT residual: the
 * filtered gyroADC carries the tune's own group delay, which is a property
 * of the config both sides already share but still shows up as a lag in the
 * residual if only one side has been through it.
 */
function readGyroColumns(names) {
  const scaled = [0, 1, 2].map((a) => findColumn(names, [`debug[${a}]`]));
  const filtered = [0, 1, 2].map((a) => findColumn(names, [`gyroadc[${a}]`, `gyroadcs[${a}]`]));
  if (filtered.every((i) => i >= 0)) {
    return { cols: filtered, filtered: true, hasDebug: scaled.every((i) => i >= 0) };
  }
  if (scaled.every((i) => i >= 0)) {
    return { cols: scaled, filtered: false, hasDebug: true };
  }
  return { cols: null, filtered: false, hasDebug: false };
}

/*
 * Motor columns, normalised to 0..1 duty.
 *
 * The raw range depends on the protocol the quad flew: DShot logs 0..2047,
 * PWM logs 1000..2000. Guessing per row would be fragile, so the range is
 * decided once from the whole column: anything at or above 1000 for its
 * minimum is a PWM style range. A quad idling at DShot 100 and a quad
 * idling at PWM 1050 are not otherwise distinguishable from one sample.
 */
function motorScaler(rows, cols) {
  let lo = Infinity;
  let hi = -Infinity;
  for (const r of rows) {
    for (const c of cols) {
      const v = r[c];
      if (Number.isFinite(v)) {
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
    }
  }
  if (!Number.isFinite(lo)) {
    return { scale: (v) => v, kind: 'none' };
  }
  if (lo >= 900 && hi <= 2100) {
    return { scale: (v) => (v - THR_MIN) / THR_SPAN, kind: 'pwm' };
  }
  return { scale: (v) => v / 2047, kind: 'dshot' };
}

/*
 * Parse blackbox_decode CSV text into the simulator's own conventions.
 *
 * Returns { rows, meta }. Every row carries:
 *   tUs      microseconds from the log's own zero
 *   rc       [roll, pitch, yaw, throttle] in ABI channel units, so it can
 *            be handed to sim_input unchanged
 *   gyroDps  [p, q, r] in deg/s, state block polarity
 *   motor    [0..3] duty 0..1, or null when the log has no motor columns
 *   vbat     pack volts, or null
 */
export function parseBlackboxCsv(text) {
  const lines = String(text).split(/\r?\n/);
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i += 1) {
    /* blackbox_decode may emit comment lines before the header. The header
     * is the first row that names a time column. */
    if (/(^|,)\s*"?time/i.test(lines[i])) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) {
    throw new Error('blackbox: no header row with a time column. Decode with blackbox_decode first.');
  }
  const names = splitCsvLine(lines[headerIdx]).map(normaliseName);
  const tCol = findColumn(names, ['time', 'timeus']);
  if (tCol < 0) {
    throw new Error('blackbox: no time column');
  }
  const rcCols = [0, 1, 2, 3].map((a) => findColumn(names, [`rccommand[${a}]`]));
  if (rcCols.some((i) => i < 0)) {
    throw new Error('blackbox: rcCommand[0..3] columns are required and one is missing');
  }
  const gyro = readGyroColumns(names);
  const motorCols = [0, 1, 2, 3].map((a) => findColumn(names, [`motor[${a}]`]));
  const hasMotor = motorCols.every((i) => i >= 0);
  const vbatCol = findColumn(names, ['vbatlatest', 'vbat']);

  const raw = [];
  for (let i = headerIdx + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line || !line.trim()) {
      continue;
    }
    const parts = splitCsvLine(line);
    if (parts.length < names.length) {
      continue;
    }
    raw.push(parts.map((p) => Number(p)));
  }
  if (!raw.length) {
    throw new Error('blackbox: header found but no data rows');
  }

  const motorScale = hasMotor ? motorScaler(raw, motorCols) : { scale: null, kind: 'none' };
  const t0 = raw[0][tCol];
  const rows = raw.map((r) => ({
    tUs: r[tCol] - t0,
    /*
     * Inverted from bf_glue.c:751-761. The PITCH minus is real: the bridge
     * builds rcData[PITCH] as 1500 MINUS the channel, so a log's positive
     * rcCommand[1] is the simulator's negative pitch channel.
     */
    rc: [
      r[rcCols[0]] / RC_SPAN,
      -r[rcCols[1]] / RC_SPAN,
      r[rcCols[2]] / RC_SPAN,
      (r[rcCols[3]] - THR_MIN) / THR_SPAN,
    ],
    gyroDps: gyro.cols ? [r[gyro.cols[0]], r[gyro.cols[1]], r[gyro.cols[2]]] : null,
    motor: hasMotor ? motorCols.map((c) => motorScale.scale(r[c])) : null,
    vbat: vbatCol >= 0 ? r[vbatCol] : null,
  }));

  const durationS = (rows[rows.length - 1].tUs - rows[0].tUs) / 1e6;
  return {
    rows,
    meta: {
      count: rows.length,
      durationS,
      rateHz: durationS > 0 ? (rows.length - 1) / durationS : 0,
      gyro: gyro.cols ? (gyro.filtered ? 'gyroADC (filtered)' : 'debug[] (GYRO_SCALED, unfiltered)') : 'none',
      gyroIsFiltered: gyro.filtered,
      motorUnits: motorScale.kind,
      hasVbat: vbatCol >= 0,
    },
  };
}

/*
 * The writer lives in src/share/flightlog.js, because the BROWSER is what
 * produces a log and src must not import from tests. It is re-exported here
 * so a reader of this file finds both halves of the format in one place,
 * and so the round trip that proves the parser above agrees with the writer
 * (scripts/replay-log.js --selftest) imports one module rather than two.
 */
export { toBlackboxCsv } from '../../src/share/flightlog.js';
