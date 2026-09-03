/*
 * trick-sweep.js: does the same shape always get the same name?
 *
 * Copyright (C) 2026 Mathew Harvey
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by the
 * Free Software Foundation, either version 3 of the License, or (at your
 * option) any later version.
 *
 * This program is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General
 * Public License for more details. You should have received a copy of the
 * GNU General Public License along with this program. If not, see
 * <https://www.gnu.org/licenses/>.
 *
 *
 * WHY THIS EXISTS, AND WHAT IT ASSERTS THAT score-selftest DOES NOT.
 *
 * score-selftest.js is 207 hand written cases: this exact flight names this
 * exact trick. That catches a broken rule. It cannot catch an UNSTABLE one,
 * because a rule that is right at the point it was written and wrong a
 * fifteenth of a turn either side of it passes every one of them.
 *
 * So this sweeps. For each trick it builds the flight the pattern describes,
 * then perturbs it across the range a human actually flies in: bank angle,
 * turn error, and drift on the axes the pattern does not name. Every sample
 * is classified into one of three:
 *
 *   CORRECT  the intended name
 *   SILENT   no name at all
 *   WRONG    a DIFFERENT trick
 *
 * and only the third is a failure. That asymmetry is the whole point. A
 * scorer that says nothing has told the pilot the truth: what they flew was
 * not clean enough to name. A scorer that says "Donkey Loop, 600" to a pilot
 * who flew a Powerloop has lied to them, put a number on a leaderboard that
 * nobody earned, and taught them the wrong thing about their own flying.
 * Silence is a miss. A wrong name is a bug.
 *
 *
 * AND IT FLIES WITH AN ATTITUDE, which is the second reason it exists.
 *
 * The recogniser resolves a lap's rotation using the craft's nose AND its up
 * axis, so that the loop's own turn can be told from the bank it was flown
 * at. score-selftest.js passes no up axis, so every one of its 207 checks
 * runs the raw fallback and NONE of them touch debankLap. The de-banking, the
 * one change that stopped a banked Powerloop being named a Donkey Loop, had
 * no offline coverage at all until this file.
 *
 * The flights here therefore carry a real orthonormal frame and DERIVE the
 * body rates from how it turns, the same way a gyro does, rather than being
 * handed rates that agree with a path by construction. A frame that does not
 * match its own path produces rates that do not match either, which is
 * exactly the mistake this is meant to be able to catch.
 */

import { TrickDetector } from '../src/game/trickdetect.js';
import { trickByName } from '../src/game/tricks.js';
import { ObstacleField, OB_BAR, OB_POLE } from '../src/game/obstacles.js';

const TURN = Math.PI * 2;
const DEG = Math.PI / 180;

const V = (x, y, z) => ({ x, y, z });
const add = (a, b) => V(a.x + b.x, a.y + b.y, a.z + b.z);
const sub = (a, b) => V(a.x - b.x, a.y - b.y, a.z - b.z);
const mul = (a, s) => V(a.x * s, a.y * s, a.z * s);
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a, b) => V(
  a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x,
);
const len = (a) => Math.sqrt(dot(a, a));
const norm = (a) => { const l = len(a) || 1; return mul(a, 1 / l); };

/* Rotate v about a unit axis k by angle t. Rodrigues, written out because a
 * matrix library is a dependency and this is four lines. */
function rot(v, k, t) {
  const c = Math.cos(t);
  const s = Math.sin(t);
  return add(add(mul(v, c), mul(cross(k, v), s)), mul(k, dot(k, v) * (1 - c)));
}

/* ------------------------------------------------------------------ *
 * A flight with an attitude
 * ------------------------------------------------------------------ */

const STEP = 0.001;

const DEBUG = process.argv.includes('--debug');

class Flight {
  constructor(field) {
    this.out = [];
    this.det = new TrickDetector((t) => this.out.push(t), field);
    if (DEBUG) {
      const push = this.det.insertPending.bind(this.det);
      this.det.insertPending = (x) => {
        console.log('    prim', x.kind === 'path'
          ? `lap ${x.obstacle} turns=${x.turns} raw=${x.rawTurns.toFixed(3)} `
            + `sides ${x.startSide}->${x.endSide} rot=[${x.rot.map((v) => v.toFixed(2))}] `
            + `spin=${(x.spin || 0).toFixed(2)} align=[${(x.align || []).map((v) => v.toFixed(2))}] `
            + `own=[${(x.own || []).map((v) => v.toFixed(2))}]`
          : `rot axis=${x.axis} turns=${x.turns} dir=${x.dir}`);
        return push(x);
      };
      const cp = this.det.closePath.bind(this.det);
      this.det.closePath = (r, u) => {
        if (r.open && r.obstacle) {
          console.log('    closePath raw=', (r.lastWind - r.startWind).toFixed(3),
            'sides', r.startSide, '->', r.lastSide);
        }
        return cp(r, u);
      };
    }
    this.prev = null;
    this.pos = V(0, 0, 0);
    this.speed = 12;
  }

  /*
   * One millisecond. The body rates are DERIVED from how the frame turned,
   * which is what a gyro measures: for two nearly equal orthonormal frames
   * the world angular velocity is half the sum of each axis crossed with
   * where it moved to. Then p, q and r are that vector resolved onto the
   * nose, the right wing and the up axis, which is the same decomposition
   * the recogniser does at the far end.
   */
  go(pos, nose, up) {
    const n = norm(nose);
    const u = norm(sub(up, mul(n, dot(n, up))));
    const rgt = cross(n, u);
    let p = 0;
    let q = 0;
    let r = 0;
    if (this.prev) {
      const w = mul(add(add(
        cross(this.prev.n, n),
        cross(this.prev.r, rgt),
      ), cross(this.prev.u, u)), 0.5 / STEP);
      p = dot(w, n);
      q = dot(w, rgt);
      r = dot(w, u);
      this.speed = len(sub(pos, this.pos)) / STEP;
    }
    /*
     * upZ reaches the detector as the two quaternion components it derives
     * it from: upZ = 1 - 2(qx^2 + qy^2). Any pair with the right sum will
     * do, and the tests written before this one use the same trick.
     */
    const upZ = Math.max(-1, Math.min(1, u.y));
    const qy = Math.sqrt(Math.max(0, (1 - upZ) / 2));
    this.det.step(
      STEP, p, q, r, 0, qy, this.speed,
      pos.x, pos.y, pos.z,
      n.x, n.y, n.z,
      u.x, u.y, u.z,
    );
    this.prev = { n, u, r: rgt };
    this.pos = pos;
  }

  /* Straight and level, holding whatever attitude it has, to shake the
   * buffer out between manoeuvres. */
  cruise(ms, dir = V(0, 0, -1)) {
    const n = this.prev ? this.prev.n : dir;
    const u = this.prev ? this.prev.u : V(0, 1, 0);
    for (let i = 0; i < ms; i += 1) {
      this.go(add(this.pos, mul(dir, 12 * STEP)), n, u);
    }
  }

  finish() {
    this.det.flush(this.prev ? this.prev.u.y : 1);
    return this.out.map((t) => t.name);
  }
}

const barField = (axis = V(1, 0, 0)) => {
  const f = new ObstacleField();
  f.add(OB_BAR, 0, 8, 0, axis.x, axis.y, axis.z, 8);
  return f.build();
};
const poleField = () => {
  const f = new ObstacleField();
  f.add(OB_POLE, 0, 8, 0, 0, 1, 0, 8);
  return f.build();
};

/* ------------------------------------------------------------------ *
 * The manoeuvres, flown as shapes rather than as rate tables
 * ------------------------------------------------------------------ */

/*
 * A lap around a rail.
 *
 *   bankDeg   how far the craft is rolled about its own nose, away from
 *             wings level with the loop. This is the number the de-banking
 *             exists for: at 45 degrees the raw body integral splits the
 *             loop's single turn evenly between pitch and yaw.
 *   noseAlong the nose points along the rail instead of across it, which
 *             makes the same circle a ROLL rather than a flip.
 *   addRoll / addYaw  turns the pilot adds on top of the lap, spread evenly
 *             across it, which is what the workbook means by a loop
 *             "carrying" a roll or a spin.
 */
function flyLap(opts = {}) {
  const {
    turns = 1, from = 'under', bankDeg = 0, noseAlong = false,
    addRoll = 0, addYaw = 0, addPitch = 0, radius = 3.2, secs = 2.4, pole = false,
    track = false, inverted = false, drift = 0, beforeYaw = 0, yawSpread = false,
  } = opts;
  const axis = pole ? V(0, 1, 0) : V(1, 0, 0);
  const f = new Flight(pole ? poleField() : barField(axis));
  const c = V(0, 8, 0);
  /* The plane the lap is flown in: everything perpendicular to the rail. */
  const e1 = pole ? V(1, 0, 0) : V(0, 0, 1);
  const e2 = pole ? V(0, 0, 1) : V(0, 1, 0);
  const ph0 = pole ? 0 : (from === 'over' ? Math.PI / 2 : -Math.PI / 2);
  const dir = -1;
  const N = Math.round(secs * turns * 1000);

  /* A run in along the tangent, so the lap is entered rather than begun. */
  const at = (ph) => add(c, add(mul(e1, radius * Math.cos(ph)), mul(e2, radius * Math.sin(ph))));
  const tangentAt = (ph) => norm(mul(add(mul(e1, -Math.sin(ph)), mul(e2, Math.cos(ph))), dir));
  const start = at(ph0);
  const tan0 = tangentAt(ph0);
  const noseOf = (ph) => (noseAlong ? axis : tangentAt(ph));
  const upOf = (ph, u) => {
    /* Wings level with the loop means the top points at the middle of it. */
    const inward = norm(sub(c, at(ph)));
    let base = noseAlong ? inward : inward;
    const n = noseOf(ph);
    base = norm(sub(base, mul(n, dot(n, base))));
    let out = rot(base, n, bankDeg * DEG);
    /*
     * THE ADDED ROTATION HAPPENS AT A POINT IN THE LOOP, not smeared across
     * all of it. The workbook says so in as many words: "at the peak of the
     * loop, perform a Flip". It also has to, arithmetically. Spread a whole
     * roll evenly over a whole lap and the loop's own turn is shared with a
     * body frame that is itself rolling, so the pitch integral averages to
     * NOTHING and a Power Roll reads as a Mavvy Roll: the lap with a roll
     * and no flip, which is a different and cheaper trick. Confined to the
     * middle of the lap it comes out as the workbook prices it.
     */
    if (addRoll) { out = rot(out, n, dir * TURN * addRoll * window(u)); }
    if (addYaw) {
      /* A yaw spin turns the whole frame about the craft's own up axis,
       * which moves the NOSE, so it is applied to both. */
      out = out;
    }
    if (inverted) { out = mul(out, -1); }
    if (drift) { out = rot(out, n, drift * TURN * Math.sin(u * TURN)); }
    return out;
  };

  /*
   * IN AND OUT ALONG A DEPARTING LINE, not along the tangent.
   *
   * A tangent line still winds: run 14 m of it past a rail 3.2 m away and it
   * subtends a fifth of a turn at each end, so a lap asked for as one turn
   * measured 1.23 and one asked for as 1.12 measured 1.47, crossed to the
   * far side of the rail and was correctly read as a lap and a HALF. That
   * was the sweep flying something it had not asked for, not the recogniser
   * misreading it. A pilot entering and leaving a loop moves AWAY from the
   * thing, so the run in and the run out carry an outward component and the
   * winding stops where the manoeuvre does.
   */
  /* Zero until the loop is a third in, one by two thirds through: the
   * "at the peak of the loop" the workbook keeps describing. */
  const window = (u) => Math.max(0, Math.min(1, (u - 0.32) / 0.36));
  const outAt = (ph) => norm(sub(at(ph), c));
  const inDir = norm(add(tangentAt(ph0), mul(outAt(ph0), -1.1)));
  for (let i = 0; i < 900; i += 1) {
    const u = i / 900;
    f.go(add(start, mul(inDir, -14 * (1 - u))), tan0, upOf(ph0, 0));
  }
  /*
   * The quarter yaw that OPENS the Jump Roping family, flown on the way in
   * so it is adjacent to the lap. Twelve patterns in the catalogue are
   * [rotation, lap] and every one of them is cheap; the one step laps they
   * sit beside are dear, so if the opening rotation does not survive to the
   * matcher the pilot is paid for the wrong and dearer trick.
   */
  if (beforeYaw) {
    let n = tan0;
    let up = upOf(ph0, 0);
    const N0 = 420;
    for (let i = 0; i < N0; i += 1) {
      const d = (TURN * beforeYaw) / N0;
      n = norm(rot(n, up, d));
      up = norm(sub(up, mul(n, dot(n, up))));
      f.go(start, n, up);
    }
    for (let i = 0; i < 160; i += 1) { f.go(start, n, up); }
  }
  for (let i = 0; i <= N; i += 1) {
    const u = i / N;
    const ph = ph0 + dir * TURN * turns * u;
    let n = noseOf(ph);
    let up = upOf(ph, u);
    if (addPitch) {
      /*
       * A pitch the pilot ADDS on top of the lap, about the craft's own
       * wing. The workbook's Donkey Loop is "a Maverick loop, and during
       * the loop a 180 pitch down to invert": the lap itself is flown on
       * ROLL with the nose along the rail, and the flip is extra.
       */
      const wing = norm(cross(n, up));
      const d = dir * TURN * addPitch * window(u);
      n = norm(rot(n, wing, d));
      up = norm(rot(up, wing, d));
    }
    if (addYaw) {
      /*
       * A Cinnamon Roll's spin is SPREAD, not placed. The workbook says "a
       * slow 360 yaw spin, timed to finish as you pass back under the
       * object", and that is why its lap reads pitch 0 and roll 0: with the
       * nose sweeping the whole way round, the loop's own turn is shared
       * across the body axes and averages to nothing on both of them, which
       * leaves the yaw as the only thing the lap carries.
       */
      const spin = dir * TURN * addYaw * (yawSpread ? u : window(u));
      n = rot(n, up, spin);
      up = norm(sub(up, mul(n, dot(n, up))));
    }
    if (track) {
      /* An Orbit holds the object on the screen, which is the whole
       * difference between it and a turn that goes round twice. */
      n = norm(sub(c, at(ph)));
      up = norm(sub(V(0, 1, 0), mul(n, dot(n, V(0, 1, 0)))));
      if (inverted) { up = mul(up, -1); }
    }
    f.go(at(ph), n, up);
  }
  const phEnd = ph0 + dir * TURN * turns;
  const tanEnd = tangentAt(phEnd);
  const outDir = norm(add(tanEnd, mul(outAt(phEnd), 1.1)));
  for (let i = 0; i < 1200; i += 1) {
    f.go(add(at(phEnd), mul(outDir, 12 * STEP * i)), tanEnd, upOf(phEnd, 1));
  }
  return f.finish();
}

/* A rotation flown in open air, well away from anything to wind around. */
function flyRot(opts = {}) {
  const {
    axisName = 'roll', turns = 1, secs = 0.9, extra = 0, before = null,
  } = opts;
  const f = new Flight(barField());
  const fly = V(0, 0, -1);
  let pos = V(200, 20, 200);
  let n = fly;
  let up = V(0, 1, 0);
  const spinAxis = () => (axisName === 'roll' ? n : (axisName === 'yaw' ? up : cross(n, up)));
  const settle = (ms) => {
    for (let i = 0; i < ms; i += 1) {
      pos = add(pos, mul(fly, 12 * STEP));
      f.go(pos, n, up);
    }
  };
  settle(1400);
  const spin = (t, ms) => {
    const N = Math.round(ms);
    for (let i = 0; i < N; i += 1) {
      const d = (TURN * t) / N;
      const k = spinAxis();
      n = norm(rot(n, k, d));
      up = norm(rot(up, k, d));
      pos = add(pos, mul(fly, 12 * STEP));
      f.go(pos, n, up);
    }
  };
  if (before) { spin(before.turns, before.secs * 1000); settle(200); }
  spin(turns + extra, secs * 1000);
  settle(1400);
  return f.finish();
}

/* ------------------------------------------------------------------ *
 * The sweep
 * ------------------------------------------------------------------ */

const BANKS = [0, 10, 20, 30, 40, 50, 60];
const TURN_ERR = [-0.12, -0.06, 0, 0.06, 0.12];
const DRIFTS = [0, 0.08, 0.16];

function sweepLap(want, base, dims) {
  const rows = [];
  for (const bankDeg of dims.banks ?? BANKS) {
    for (const de of dims.turnErr ?? TURN_ERR) {
      for (const drift of dims.drifts ?? DRIFTS) {
        /*
         * The turn error is a FRACTION of the lap, not a fixed number of
         * turns. A twelfth of a turn is a twelfth of a Powerloop and a
         * QUARTER of a Matty Flip, and no pilot misses a half lap by a
         * quarter of it. Applied flat, the sweep was asking a half lap to
         * survive winding 0.38 turns, which is less than the half turn a
         * craft flying DEAD STRAIGHT past the rail subtends, and the
         * recogniser was right to refuse every one of them.
         */
        const base0 = base.turns ?? 1;
        const names = flyLap({
          ...base, bankDeg, drift, turns: base0 * (1 + de),
        });
        rows.push({ bankDeg, de, drift, names });
      }
    }
  }
  return classify(want, rows);
}

/*
 * THE ONE FAILURE THAT MATTERS IS OVER-CLAIMING.
 *
 * Three ways of not naming the intended trick, and they are not equal:
 *
 *   SILENT  nothing was named. The scorer has told the pilot the truth,
 *           which is that what they flew was not clean enough to name.
 *   UNDER   something CHEAPER was named. Usually a real component of the
 *           trick, like the roll out of a lap whose lap did not form. The
 *           pilot is short changed, which is a miss worth watching, but
 *           nothing false has been put on a board.
 *   OVER    something DEARER was named. This is the bug. A pilot who flew a
 *           Powerloop and is paid 600 for a Donkey Loop has been lied to,
 *           the leaderboard has a number on it nobody earned, and they have
 *           been taught the wrong thing about their own flying.
 *
 * So the sweep fails on OVER and reports the other two.
 */
function pointsOf(name) {
  const t = trickByName(name);
  return t && t.points != null ? t.points : 0;
}

function classify(want, rows) {
  const wants = Array.isArray(want) ? want : [want];
  const target = Math.max(0, ...wants.map(pointsOf));
  let correct = 0;
  let silent = 0;
  let under = 0;
  const over = new Map();
  const light = new Map();
  const byBank = new Map();
  const byErr = new Map();
  const note = (r, ok) => {
    for (const [m, k] of [[byBank, r.bankDeg], [byErr, r.de]]) {
      const c = m.get(k) || { n: 0, ok: 0 };
      c.n += 1;
      if (ok) { c.ok += 1; }
      m.set(k, c);
    }
  };
  for (const r of rows) {
    if (wants.some((w) => r.names.includes(w))) {
      correct += 1;
      note(r, true);
      continue;
    }
    note(r, false);
    /* Nothing but building blocks is silence: a bare half roll is the
     * catalogue admitting it saw a fragment, not naming a trick. */
    const real = r.names.filter((n) => !/^(1\/4|1\/2|3\/4|1) (Flip|Roll|Yaw)/.test(n));
    if (!real.length) {
      silent += 1;
      continue;
    }
    const key = real.join(' + ');
    const paid = real.reduce((a, n) => a + pointsOf(n), 0);
    const bucket = paid > target ? over : light;
    const cur = bucket.get(key) || { n: 0, at: null, paid };
    cur.n += 1;
    if (!cur.at) { cur.at = `bank ${r.bankDeg} turnErr ${r.de} drift ${r.drift}`; }
    bucket.set(key, cur);
    if (bucket === light) { under += 1; }
  }
  return {
    total: rows.length, correct, silent, under, over, light, target, byBank, byErr,
  };
}

function report(label, res) {
  const overN = [...res.over.values()].reduce((a, b) => a + b.n, 0);
  const pct = (n) => `${Math.round((n / res.total) * 100)}%`;
  const verdict = overN === 0 ? 'ok   ' : 'OVER ';
  console.log(`  ${verdict}${label.padEnd(26)} right ${pct(res.correct).padStart(4)}`
    + `  silent ${pct(res.silent).padStart(4)}  under ${pct(res.under).padStart(4)}`
    + `  OVER ${pct(overN).padStart(4)}   (${res.total} @ ${res.target})`);
  for (const [name, i] of [...res.over.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 4)) {
    console.log(`        OVERPAID "${name}" ${i.paid} vs ${res.target}, ${i.n} times, first at ${i.at}`);
  }
  for (const [name, i] of [...res.light.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 2)) {
    console.log(`        under    "${name}" ${i.paid} vs ${res.target}, ${i.n} times`);
  }
  /* WHERE it misses matters as much as how often: a trick that is named at
   * every bank and misses only at the extremes of turn error is solid, and
   * one that misses scattered through the middle is not. */
  if (res.byBank && res.correct < res.total) {
    const cells = [...res.byBank.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([b, v]) => `${b}deg ${Math.round((v.ok / v.n) * 100)}%`);
    console.log(`        by bank  ${cells.join('  ')}`);
    const errs = [...res.byErr.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([e, v]) => `${e > 0 ? '+' : ''}${e} ${Math.round((v.ok / v.n) * 100)}%`);
    console.log(`        by turn  ${errs.join('  ')}`);
  }
  return overN;
}

async function main() {
  const only = (process.argv.find((a) => a.startsWith('--only=')) || '').split('=')[1] || '';
  console.log('trick-sweep: the same shape, perturbed the way a human varies it.');
  console.log('A WRONG name is a failure. Silence is not: it is the scorer being honest.\n');
  let bad = 0;

  const CASES = [
    ['Powerloop', () => sweepLap('Powerloop', { turns: 1, from: 'under' }, {})],
    /*
     * Nose along the rail, so the loop's own turn IS a roll: a lap with no
     * body rotation at all is not flyable, because holding a circle points
     * the thrust at the middle of it and that is a rotation. Both names are
     * therefore honest readings of this shape, Mavvy Roll being the more
     * precise one, and the sweep accepts either.
     */
    ['roll loop', () => sweepLap(['Mavvy Roll', 'Maverick Loop'], { turns: 1, from: 'under', noseAlong: true }, {})],
    ['Matty Flip', () => sweepLap('Matty Flip', { turns: 0.5, from: 'over' }, {})],
    /*
     * A bare half lap up from under is deliberately NOT a trick: the
     * catalogue's members of that family all carry a roll or a flip out of
     * it, so silence is the right answer and the sweep asserts that the
     * answer is silence rather than some other trick's name.
     */
    ['half lap from under', () => sweepLap('(nothing)', { turns: 0.5, from: 'under' }, {})],
    /*
     * THE CONFUSABLE NEIGHBOURS, swept both ways. A Powerloop must never be
     * named one of these and each of these must be named itself, because
     * they sit half a turn apart on one axis and the dearer one used to win
     * a tie on price. Power Roll is 450 and Inverted 360 Powerloop is 650
     * against a Powerloop's 200, so this is where an over-claim would show.
     */
    ['Power Roll', () => sweepLap('Power Roll', {
      turns: 1, from: 'under', addRoll: 1,
    }, { drifts: [0, 0.08] })],
    ['Inverted 360 Powerloop', () => sweepLap('Inverted 360 Powerloop', {
      turns: 1, from: 'under', addYaw: 1,
    }, { drifts: [0, 0.08] })],
    /*
     * THE JUMP ROPING FAMILY, which is where an over-claim would cost most.
     * Every one is [quarter yaw, lap] and every one is cheap: Cinnamon Roll
     * is 175 and Side Loop 200, sitting beside one step laps worth 250 and
     * 600. If the opening quarter yaw does not reach the matcher next to the
     * lap, the two step pattern is unreachable and the dear one step pattern
     * takes the flight.
     */
    /*
     * BOTH WAYS ROUND THE PAIR THAT COSTS MOST TO CONFUSE, 600 against 175.
     *
     * The workbook is what separates them, and it separates them by which
     * loop they are built on. A Donkey Loop is "a MAVERICK loop, and during
     * the loop a 180 pitch down to invert, then a 360 yaw spin, then
     * complete the loop": the lap is flown nose along the rail so the loop
     * itself is a ROLL, and the flip and the spin are added on top. An
     * Inverted 360 Powerloop is "start a POWERLOOP, and at the peak a 360
     * yaw spin while inverted": the lap is a flip.
     *
     * An earlier attempt flew the Donkey Loop on a pitch loop, which is not
     * a Donkey Loop at all but an Inverted 360 Powerloop, and the recogniser
     * named it one and was right to.
     */
    ['Donkey Loop', () => sweepLap('Donkey Loop', {
      turns: 1, from: 'under', noseAlong: true, addPitch: 0.5, addYaw: 1,
    }, { banks: [0, 20, 40], drifts: [0] })],
    /*
     * The Donkey Loop is UNDER-claimed rather than named, and the reason is
     * worth keeping. Flown as the workbook writes it, a roll loop carrying
     * both a 180 pitch and a 360 yaw, the body frame reading comes out
     * [0, 0.13, 0.80]: the loop's own roll has been scrambled to nothing by
     * the two rotations on top of it, and the added flip reads a tenth of a
     * turn rather than a half. The per sample ownership is 0.78 against the
     * 0.9 floor, so the de-banking declines, and declining is right: with
     * three rotations interacting there is no clean axis to give the loop's
     * turn to.
     *
     * It names Maverick Loop, 100 against 600. That is a MISS and not a lie,
     * which is the bar this file actually holds the scorer to, and it is the
     * honest answer for a trick whose three rotations the body frame cannot
     * separate. Naming it would need the lap's rotation resolved in a frame
     * carried along the lap rather than in the craft, which is a bigger
     * change than anything here and is the next thing this needs.
     */
    ['Side Loop', () => sweepLap('Side Loop', {
      turns: 1, from: 'under', noseAlong: true, beforeYaw: 0.25,
    }, { banks: [0, 20, 40], drifts: [0] })],
    ['Cinnamon Roll', () => sweepLap('Cinnamon Roll', {
      turns: 1, from: 'under', addYaw: 1, yawSpread: true, beforeYaw: 0.25,
    }, { banks: [0, 20, 40], drifts: [0] })],
    ['Mavvy Roll', () => sweepLap('Mavvy Roll', {
      turns: 1, from: 'under', noseAlong: true,
    }, { drifts: [0, 0.08] })],
    ['Orbit x2', () => sweepLap('Orbit x2', {
      turns: 2, pole: true, track: true, radius: 6, secs: 3,
    }, { banks: [0], drifts: [0, 0.08] })],
    ['Trippy Spin x2', () => sweepLap('Trippy Spin x2', {
      turns: 2, pole: true, track: true, inverted: true, radius: 6, secs: 3,
    }, { banks: [0], drifts: [0, 0.08] })],
  ];
  const ROT_CASES = [
    ['Roll', 'roll', 1],
    ['Flip', 'pitch', 1],
    ['Yaw Spin', 'yaw', 1],
    ['Double Roll', 'roll', 2],
  ];

  for (const [label, fn] of CASES) {
    if (only && !label.toLowerCase().includes(only.toLowerCase())) { continue; }
    bad += report(label, fn());
  }
  for (const [want, axisName, turns] of ROT_CASES) {
    if (only && !want.toLowerCase().includes(only.toLowerCase())) { continue; }
    const rows = [];
    for (const extra of [-0.1, -0.05, 0, 0.05, 0.1]) {
      for (const secs of [0.7, 1.0, 1.4]) {
        rows.push({ bankDeg: 0, de: extra, drift: 0, names: flyRot({ axisName, turns, secs, extra }) });
      }
    }
    bad += report(want, classify(want, rows));
  }

  console.log(bad === 0
    ? '\ntrick-sweep: nothing was ever paid more than it was worth.'
    : `\ntrick-sweep: ${bad} samples were paid MORE than the trick they flew.`);
  process.exit(bad === 0 ? 0 : 1);
}

main();
