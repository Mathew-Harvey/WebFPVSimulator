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

import { PATTERNS, TrickDetector } from '../src/game/trickdetect.js';
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
    /*
     * Every primitive the detector buffers, kept for --show. Three times
     * this session a sweep result that looked like a scorer bug was the
     * rig flying the wrong shape, and each time it cost a round of reading
     * the recogniser before the flight was checked. The measured vector is
     * the thing that settles it, so it is one flag away.
     */
    this.prims = [];
    const insert = this.det.insertPending.bind(this.det);
    this.det.insertPending = (prim) => { this.prims.push(prim); insert(prim); };
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
    lastFlight = this;
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
    afterSteps = [],
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
    /* Negative for the same reason addPitch is: see below. A Mavvy Roll
     * asks for the lap's own roll and one more, and flown the other way
     * the two cancelled and it measured a bare 3/4 roll. */
    if (addRoll) { out = rot(out, n, -dir * TURN * addRoll * window(u)); }
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
      /*
       * NEGATIVE, because a rotation about +wing runs against the way the
       * tangent already turns through the loop. Every other user of
       * addPitch flies a lap whose own pitch is zero, so the sign never
       * showed until a Power Flip asked for the loop's flip AND one more
       * and the two cancelled to nothing: the lap measured rot [0,0,0] and
       * was named a Maverick Loop, 100 points for a 350 point trick.
       */
      const d = -dir * TURN * addPitch * window(u);
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
  let ep = at(phEnd);
  let en = tanEnd;
  let eu = upOf(phEnd, 1);
  /*
   * The steps that FOLLOW the lap, flown on the way out: an Immelmann is
   * half a loop and then the roll that finishes it, and a pattern's steps
   * are a sequence, so a sweep that only ever flies the lap can never reach
   * any of them.
   */
  for (const st of afterSteps) {
    const ms = Math.round(Math.max(380, Math.abs(st.turns) * 720));
    for (let i = 0; i < ms; i += 1) {
      const axis = st.axis === 'roll' ? en : (st.axis === 'yaw' ? eu : cross(en, eu));
      const d = (TURN * st.turns) / ms;
      en = norm(rot(en, axis, d));
      eu = norm(rot(eu, axis, d));
      ep = add(ep, mul(outDir, 12 * STEP));
      f.go(ep, en, eu);
    }
  }
  for (let i = 0; i < 1200; i += 1) {
    f.go(add(ep, mul(outDir, 12 * STEP * i)), en, eu);
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
 * FLYING AN ARBITRARY PATTERN, from its own steps
 *
 * The hand written cases above cover fourteen families and there are
 * sixty four scoreable tricks. A sweep that only visits the ones somebody
 * remembered to write down is exactly the hole score-selftest already has,
 * one level up: a new pattern can be added and never flown.
 *
 * So this reads a pattern and works out how a pilot would fly it. The rules
 * are not guesses; each one is the arithmetic of the shape:
 *
 *   A lap's own turn goes on ROLL if the nose is along the rail and on PITCH
 *   if it is across, because holding a circle points the thrust at the
 *   middle of it and that IS a rotation. So a pattern asking for roll equal
 *   to the lap is flown nose along, one asking for pitch equal to the lap is
 *   flown nose across, and anything left over is what the pilot ADDS.
 *
 *   An added rotation happens AT THE PEAK, which the workbook says in as
 *   many words. The exception is a spin the workbook calls slow, which is
 *   spread, and a lap asking for no flip and no roll can only be flown that
 *   way: the nose has to sweep the whole way round or the loop's turn lands
 *   on one axis and the pattern is refused.
 *
 *   A rotation BEFORE a lap is flown on the way in, far enough out that the
 *   winding gate has not opened, because that is where a pilot does it.
 * ------------------------------------------------------------------ */

const AX = { roll: 0, pitch: 1, yaw: 2 };

/* Which way each step turns, resolving sameAs and oppTo against the steps
 * they name. */
function directions(steps) {
  const dirs = steps.map(() => 1);
  for (let i = 0; i < steps.length; i += 1) {
    const s = steps[i];
    if (s.oppTo !== undefined) { dirs[i] = -dirs[s.oppTo]; }
    if (s.sameAs !== undefined) { dirs[i] = dirs[s.sameAs]; }
  }
  return dirs;
}

function axisOf(step, steps) {
  if (step.axis) { return step.axis; }
  if (step.axisIn && step.axisIn.length) { return step.axisIn[0]; }
  if (step.axisAs !== undefined) { return axisOf(steps[step.axisAs], steps); }
  return 'roll';
}

/*
 * Can this pattern be flown by the generic planner, and if not, why not?
 * Saying so out loud matters: a sweep that silently skips what it cannot fly
 * reports a coverage it does not have.
 */
function whyNotFlyable(steps) {
  if (steps.some((s) => s.tap)) {
    return 'needs a contact, which wants a wall and a collider';
  }
  if (steps.some((s) => s.nearest !== undefined || s.near !== undefined)) {
    return 'needs proximity to a solid';
  }
  if (steps.filter((s) => s.path !== undefined).length > 1) {
    return 'two laps, which this planner does not sequence yet';
  }
  /*
   * A lap that must carry NEITHER a flip NOR a roll, and no spin either, is
   * not a shape a quadcopter can fly: holding a circle points the thrust at
   * the middle of it, and that is a rotation about one axis or the other.
   * The catalogue prices Jump Rope and Beginner Matty this way and the
   * workbook describes them as laps flown "flat", which a pilot achieves by
   * yawing through them, so the pattern is arguably short a yaw. Either way
   * this planner will not pretend to fly one.
   */
  const lap = steps.find((s) => s.path !== undefined);
  if (lap && lap.rot) {
    const z = (v) => v !== undefined && Math.abs(v) < 0.26;
    if (z(lap.rot.pitch) && z(lap.rot.roll) && !((lap.rot.yaw ?? 0) >= 0.9)) {
      return 'a lap carrying no rotation at all, which cannot be flown';
    }
  }
  const lapAt = steps.findIndex((s) => s.path !== undefined);
  if (lapAt > 0 && steps.slice(0, lapAt).some((s) => s.path !== undefined)) {
    return 'a lap before a lap';
  }
  return null;
}

/* Turn a lap step into the way it is flown. */
function planLap(step) {
  const turns = step.turnsAtLeast !== undefined ? step.turnsAtLeast : (step.turns ?? 1);
  const r = step.rot || {};
  const near = (a, b) => Math.abs((a ?? 0) - b) < 0.26;
  /*
   * The lap's own turn belongs to whichever axis the pattern says carries
   * it, and a pattern asking for NO flip is asking for a roll loop: a lap
   * has to rotate about something, because holding a circle points the
   * thrust at the middle of it. Flown the other way, as a pitch loop with a
   * cancelling negative flip on top, a Maverick Loop came out a Power Flip:
   * 350 points for a 100 point trick, on every sample, and it was the
   * planner's nonsense rather than the scorer's.
   */
  /*
   * WHERE THE LAP'S OWN TURN GOES.
   *
   * A lap is always a rotation, because holding a circle points the thrust
   * at the middle of it. The only question is which body axis carries it,
   * and the pattern answers that by how much FLIP it asks for against how
   * far round it goes: a nose that follows the path all the way round a
   * whole lap has pitched a whole turn, so pitch == turns is a Powerloop
   * and the lap's turn is a flip. Ask for LESS flip than that and the nose
   * cannot be following the path, so it is lying along the rail and the
   * lap's turn is a ROLL: that is the whole Maverick family, and it is
   * true of a Donkey Loop's half flip as much as a Maverick Loop's none.
   * Ask for more and it is a Powerloop with extra on top.
   *
   * Keying off roll instead, which is what this did first, gets Mavvy Roll
   * wrong: roll 2 is not near turns 1, so it flew a Powerloop with two
   * added rolls and measured a half roll and a flip.
   */
  const noseAlong = r.pitch !== undefined
    ? r.pitch < turns - 0.01
    : (r.roll !== undefined && near(r.roll, turns));
  const ownPitch = noseAlong ? 0 : turns;
  const ownRoll = noseAlong ? turns : 0;
  const plan = {
    turns,
    from: step.from || 'under',
    noseAlong,
    addPitch: r.pitch === undefined ? 0 : r.pitch - ownPitch,
    addRoll: r.roll === undefined ? 0 : r.roll - ownRoll,
    addYaw: r.yaw === undefined ? 0 : r.yaw,
    pole: step.path === 'pole',
    track: step.track === true,
    inverted: step.inverted === true,
    yawSpread: false,
  };
  /*
   * A lap that must carry NEITHER a flip nor a roll can only be flown with
   * the nose sweeping: that is the only way the loop's own turn ends up on
   * no axis at all. The workbook calls the spin "slow" for exactly this.
   */
  if (near(r.pitch, 0) && (r.roll === undefined || near(r.roll, 0)) && (r.yaw ?? 0) >= 0.9) {
    plan.noseAlong = false;
    plan.addPitch = 0;
    plan.addRoll = 0;
    plan.yawSpread = true;
  }
  if (plan.pole) {
    /* A post's lap is flown in the horizontal plane, and its own turn is a
     * yaw, so nothing is added for it. */
    plan.addPitch = 0;
    plan.addRoll = 0;
    plan.addYaw = 0;
  }
  return plan;
}

/*
 * Fly a whole pattern. Rotations before the lap go on the run in, the lap is
 * flown as its plan says, and rotations after it go on the way out.
 */
function flyPattern(steps, opts = {}) {
  const { bankDeg = 0, de = 0, drift = 0 } = opts;
  const dirs = directions(steps);
  const lapAt = steps.findIndex((s) => s.path !== undefined);
  if (lapAt < 0) {
    /* Pure rotations, in open air. */
    const f = new Flight(barField());
    const fly = V(0, 0, -1);
    let pos = V(200, 20, 200);
    let n = fly;
    let up = V(0, 1, 0);
    const settle = (ms) => {
      for (let i = 0; i < ms; i += 1) {
        pos = add(pos, mul(fly, 12 * STEP));
        f.go(pos, n, up);
      }
    };
    const hover = (ms) => { for (let i = 0; i < ms; i += 1) { f.go(pos, n, up); } };
    settle(1500);
    for (let i = 0; i < steps.length; i += 1) {
      const st = steps[i];
      if (st.stallMs) { hover(Math.round(st.stallMs * 1.4)); }
      const name = axisOf(st, steps);
      const t = (st.turns ?? 1) * (1 + de) * dirs[i];
      const ms = Math.round(Math.max(420, Math.abs(t) * 780));
      for (let k = 0; k < ms; k += 1) {
        const axis = name === 'roll' ? n : (name === 'yaw' ? up : cross(n, up));
        const d = (TURN * t) / ms;
        n = norm(rot(n, axis, d));
        up = norm(rot(up, axis, d));
        pos = add(pos, mul(fly, 12 * STEP));
        f.go(pos, n, up);
      }
      if (i < steps.length - 1) { settle(180); }
    }
    settle(1500);
    return f.finish();
  }
  const plan = planLap(steps[lapAt]);
  const beforeRot = steps.slice(0, lapAt);
  return flyLap({
    ...plan,
    turns: plan.turns * (1 + de),
    bankDeg,
    drift,
    beforeYaw: beforeRot.length && axisOf(beforeRot[0], steps) === 'yaw'
      ? (beforeRot[0].turns ?? 0.25)
      : 0,
    afterSteps: steps.slice(lapAt + 1).map((st, j) => ({
      axis: axisOf(st, steps),
      turns: (st.turns ?? 1) * dirs[lapAt + 1 + j],
    })),
  });
}

/*
 * Fly one pattern from its own steps and print what the detector measured.
 * This is the debugger for the rig, not a check: it says what was flown and
 * what came back, and leaves the judging to a person.
 */
function show(name, opts = {}) {
  const pat = PATTERNS.find((p) => p.name === name);
  if (!pat) { console.log(`no pattern named ${name}`); return; }
  const why = whyNotFlyable(pat.steps);
  console.log(`${name}  ${pointsOf(name)} points`);
  console.log(`  asks   ${JSON.stringify(pat.steps)}`);
  if (why) { console.log(`  cannot fly: ${why}`); return; }
  const lapAt = pat.steps.findIndex((s) => s.path !== undefined);
  if (lapAt >= 0) { console.log(`  plan   ${JSON.stringify(planLap(pat.steps[lapAt]))}`); }
  const f = flyPatternProbe(pat.steps, opts);
  const fmt = (v) => (v === null || v === undefined ? 'null'
    : Array.isArray(v) ? `[${v.map((x) => x.toFixed(2)).join(', ')}]` : v.toFixed(2));
  for (const pr of f.prims) {
    if (pr.turns !== undefined && pr.rot) {
      console.log(`  LAP    turns ${fmt(pr.turns)} dir ${pr.dir} from ${pr.startSide}`
        + ` rot ${fmt(pr.rot)} spin ${fmt(pr.spin)} align ${fmt(pr.align)} own ${fmt(pr.own)}`);
    } else {
      console.log(`  ROT    ${pr.axis !== undefined ? `axis ${pr.axis} ` : ''}`
        + `${fmt(pr.turns ?? pr.amount ?? 0)} ${JSON.stringify(Object.keys(pr))}`);
    }
  }
  console.log(`  named  ${f.names.length ? f.names.join(', ') : '(nothing)'}`);
}

/* flyPattern, but handing back the flight so --show can read the prims. */
let lastFlight = null;
function flyPatternProbe(steps, opts) {
  const names = flyPattern(steps, opts);
  return { names, prims: lastFlight ? lastFlight.prims : [] };
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

/*
 * EVERY SCOREABLE PATTERN, flown from its own steps.
 *
 * The hand written cases cover the families that were argued about. This
 * covers the CATALOGUE, so a pattern cannot be added without being flown,
 * and it reports honestly on the ones the planner cannot fly rather than
 * quietly leaving them out of the denominator.
 */
function sweepEverything() {
  const BLOCK = /^(1\/4|1\/2|3\/4|1) (Flip|Roll|Yaw)/;
  const seen = new Set();
  const rows = [];
  let skipped = 0;
  const skipWhy = new Map();
  for (const pat of PATTERNS) {
    if (seen.has(pat.name) || BLOCK.test(pat.name)) { continue; }
    seen.add(pat.name);
    if (!trickByName(pat.name)) { continue; }
    const why = whyNotFlyable(pat.steps);
    if (why) {
      skipped += 1;
      skipWhy.set(why, (skipWhy.get(why) || 0) + 1);
      continue;
    }
    const samples = [];
    for (const bankDeg of [0, 25, 45]) {
      for (const de of [-0.08, 0, 0.08]) {
        samples.push({ bankDeg, de, drift: 0, names: flyPattern(pat.steps, { bankDeg, de }) });
      }
    }
    rows.push({ name: pat.name, res: classify(pat.name, samples) });
  }
  return { rows, skipped, skipWhy };
}

async function main() {
  const only = (process.argv.find((a) => a.startsWith('--only=')) || '').split('=')[1] || '';
  const showing = (process.argv.find((a) => a.startsWith('--show=')) || '').split('=')[1] || '';
  if (showing) {
    const bank = Number((process.argv.find((a) => a.startsWith('--bank=')) || '=0').split('=')[1]);
    for (const nm of showing.split(',')) { show(nm.trim(), { bankDeg: bank }); }
    return;
  }
  if (process.argv.includes('--all')) {
    const { rows, skipped, skipWhy } = sweepEverything();
    let over = 0;
    let named = 0;
    const misses = [];
    for (const r of rows) {
      const o = [...r.res.over.values()].reduce((a, b) => a + b.n, 0);
      over += o;
      if (r.res.correct === r.res.total) { named += 1; }
      if (o > 0 || r.res.correct < r.res.total) {
        misses.push({ name: r.name, res: r.res, over: o });
      }
    }
    console.log(`Every scoreable pattern, flown from its own steps.\n`);
    console.log(`  ${rows.length} patterns flown, ${named} named on every sample.`);
    console.log(`  ${skipped} could not be flown by the planner:`);
    for (const [why, n] of skipWhy) { console.log(`      ${n} ${why}`); }
    console.log('');
    for (const m of misses.sort((a, b) => b.over - a.over)) {
      report(m.name, m.res);
    }
    console.log(over === 0
      ? `\nAll ${rows.length} flown: nothing was ever paid more than it was worth.`
      : `\n${over} samples were paid MORE than the trick they flew.`);
    process.exit(over === 0 ? 0 : 1);
  }
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
    /*
     * Was ['Mavvy Roll', 'Maverick Loop'], accepting either, because with
     * Maverick Loop's roll unnamed the two patterns described the same
     * motion and there was no right answer to insist on. Now that a Mavvy
     * Roll is the lap's own roll AND one more, a bare rolled lap is a
     * Maverick Loop and nothing else.
     */
    ['roll loop', () => sweepLap('Maverick Loop', { turns: 1, from: 'under', noseAlong: true }, {})],
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
    /*
     * The lap's own roll AND one more. This case used to fly a bare
     * nose-along lap and call it a Mavvy Roll, which was only ever right
     * because Maverick Loop left its roll unnamed and the dearer of two
     * identical patterns won. It is a Maverick Loop, and a Mavvy Roll is
     * that plus the 360 the workbook asks for at the peak.
     */
    ['Mavvy Roll', () => sweepLap('Mavvy Roll', {
      turns: 1, from: 'under', noseAlong: true, addRoll: 1,
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
