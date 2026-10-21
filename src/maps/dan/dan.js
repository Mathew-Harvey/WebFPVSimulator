/*
 * dan.js: Dan, who stands in the corner of every RaceGOW room and judges the
 * pilot, as a few pure functions: what he says about what just happened,
 * and how his body is held to say it. No three.js and no clock of its own,
 * so a Node check can walk every line and every pose (scripts/dan-check.js).
 * His body and his balloon are ./dandraw.js.
 *
 * The owner's ask of 2026-10-21: "for the racegow tracks put dan in the
 * corner of the room watching your quad and judging you, say things like
 * 'Couldn't get a clean exit', 'amazing, this level of pilot is only 150th
 * in the world' and 'missed a gate'. put him in all existing racegow
 * tracks". Those three lines are the owner's words and are kept as he
 * wrote them; the rest are in the same dry voice and each answers
 * something that actually happened.
 *
 * WHAT HE HEARS, from the shell, one call each:
 *   gate    a gate was credited
 *   miss    the quad crossed the target gate's plane outside its hole
 *           (Race.missedGate, src/game/race.js)
 *   crash   a hard hit, the ground's or a frame's
 *   lap     a clean lap was counted
 * and answers each with a line, or with silence when he spoke a moment ago.
 * A crash within CLEAN_EXIT_MS of a gate is the owner's "clean exit".
 *
 * Render only. Nothing here reaches the physics or the plant.
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

import { BONE } from '../heads/man.js';

/* ------------------------------------------------------------------ */
/* What he says                                                        */
/* ------------------------------------------------------------------ */

/*
 * face: which of his six faces it is said with (see FACE in ./dandraw.js),
 * move: how his body goes with it (see danAt). The first line of each list
 * is the owner's own where he gave one.
 */
export const DAN_LINES = {
  /* A hard hit soon after a gate. */
  exit: [
    { text: 'Couldn\'t get a clean exit.', face: 'frown', move: 'hand' },
    { text: 'Great gate. Shame about everything after it.', face: 'laugh', move: 'shrug' },
  ],
  /* A hard hit anywhere else. */
  crash: [
    { text: 'That was not the gate.', face: 'surprised', move: 'hand' },
    { text: 'The floor is not part of the track.', face: 'laugh', move: 'shrug' },
    { text: 'Bold. Wrong, but bold.', face: 'talk', move: 'shrug' },
  ],
  /* The quad went past the target gate's hole. */
  miss: [
    { text: 'Missed a gate.', face: 'shout', move: 'shrug' },
    { text: 'The gate was right there.', face: 'surprised', move: 'shrug' },
    { text: 'It is the round bit you fly through.', face: 'frown', move: 'hand' },
  ],
  /* A lap counted, and not the pilot's best. */
  lap: [
    { text: 'Amazing, this level of pilot is only 150th in the world.', face: 'laugh', move: 'shrug' },
    { text: 'A lap. Technically.', face: 'smile', move: 'shrug' },
    { text: 'My nan flies it faster. In her sleep.', face: 'laugh', move: 'shrug' },
  ],
  /* A lap that is the best so far, or the first. */
  best: [
    { text: 'Fine. That one was good.', face: 'smile', move: 'arms' },
    { text: 'Do that again and I will be impressed.', face: 'talk', move: 'arms' },
  ],
  /* A run of gates with nothing wrong. */
  tidy: [
    { text: 'Tidy. Keep going.', face: 'smile', move: 'arms' },
  ],
};

/* How long he is quiet after a line, and after a lap's line, ms of sim. */
export const QUIET_MS = 4200;
export const QUIET_LAP_MS = 1800;
/* A hard hit this soon after a gate is a failed exit, ms of sim. */
export const CLEAN_EXIT_MS = 1800;
/* Gates in a row, with no hit and no miss, before he says a word of praise. */
export const TIDY_GATES = 6;
/* How long a line is held up, ms. */
export const SAY_MS = 3600;

/*
 * What he has seen of this run and what he has said, so he does not repeat
 * a line until the others have had their turn. `hear` returns a line from
 * DAN_LINES, or null.
 */
export function makeJudge() {
  const next = { exit: 0, crash: 0, miss: 0, lap: 0, best: 0, tidy: 0 };
  const st = {
    spokeMs: -Infinity,
    gateMs: -Infinity,
    streak: 0,
    hitsInLap: 0,
    said: 0,
  };
  const pick = (kind) => {
    const list = DAN_LINES[kind];
    const line = list[next[kind] % list.length];
    next[kind] += 1;
    st.said += 1;
    return { ...line, kind };
  };
  return {
    stats: () => ({ said: st.said, streak: st.streak }),
    /* A run that starts again, or a sim clock that went back. */
    reset() {
      st.spokeMs = -Infinity;
      st.gateMs = -Infinity;
      st.streak = 0;
      st.hitsInLap = 0;
    },
    /* kind: 'gate', 'miss', 'crash' or 'lap'; info for a lap is
     * { first, record } as the shell knows them. */
    hear(kind, simMs, info = {}) {
      if (simMs < st.spokeMs || simMs < st.gateMs) {
        this.reset();
      }
      const quiet = (ms) => simMs - st.spokeMs >= ms;
      switch (kind) {
        case 'gate': {
          st.gateMs = simMs;
          st.streak += 1;
          if (st.streak === TIDY_GATES && st.hitsInLap === 0 && quiet(QUIET_MS)) {
            st.spokeMs = simMs;
            return pick('tidy');
          }
          return null;
        }
        case 'miss': {
          st.streak = 0;
          st.hitsInLap += 1;
          if (!quiet(QUIET_MS)) {
            return null;
          }
          st.spokeMs = simMs;
          return pick('miss');
        }
        case 'crash': {
          const exit = simMs - st.gateMs <= CLEAN_EXIT_MS;
          st.streak = 0;
          st.hitsInLap += 1;
          if (!quiet(QUIET_MS)) {
            return null;
          }
          st.spokeMs = simMs;
          return pick(exit ? 'exit' : 'crash');
        }
        case 'lap': {
          st.streak = 0;
          st.hitsInLap = 0;
          if (!quiet(QUIET_LAP_MS)) {
            return null;
          }
          st.spokeMs = simMs;
          return pick(info.record || info.first ? 'best' : 'lap');
        }
        default:
          return null;
      }
    },
  };
}

/* ------------------------------------------------------------------ */
/* His body                                                            */
/* ------------------------------------------------------------------ */

const clamp = (v, a, b) => (v < a ? a : (v > b ? b : v));
const ease = (u) => {
  const v = clamp(u, 0, 1);
  return v * v * (3 - 2 * v);
};

const NB = 13;
const set = (J, b, x, y, z) => {
  J[b * 3] = x;
  J[b * 3 + 1] = y;
  J[b * 3 + 2] = z;
};
/* Blend joint b toward (x, y, z) by k. */
function toward(J, b, k, x, y, z) {
  const i = b * 3;
  J[i] += (x - J[i]) * k;
  J[i + 1] += (y - J[i + 1]) * k;
  J[i + 2] += (z - J[i + 2]) * k;
}

/* Standing at ease, feet together, arms a little out and bent. */
const STAND = new Float64Array(NB * 3);
set(STAND, BONE.armL, 0.05, 0, 0.16);
set(STAND, BONE.armR, 0.05, 0, -0.16);
set(STAND, BONE.foreL, -0.34, 0, 0);
set(STAND, BONE.foreR, -0.34, 0, 0);

/* The pelvis over the floor standing, from ./man.js's skeleton. */
const PELVIS_STAND = 0.96;
/* The head's pivot over the pelvis: spine, then the head's own offset. */
const HEAD_OVER_PELVIS = 0.04 + 0.53;

/* The state that outlives a frame: where he faces and where his head is. */
export function danState(yaw = 0) {
  return {
    yaw,
    headTurn: 0,
    headPitch: 0,
    /* The pose, for ./dandraw.js to hand to headsBones. */
    pose: {
      x: 0, y: 0, floor: 0, yaw, pelvisH: PELVIS_STAND,
      J: new Float64Array(NB * 3), state: 'stand', walk: 0, stride: 0, look: 0, wave: 0,
    },
  };
}

/*
 * Dan at time T (ms on his clock), `dt` ms after the last call, into
 * st.pose. `aim` is where the quad is in HIS frame at the moment, real
 * metres { x, y, z } with x to his left, y up and z the way he faces, or null.
 * `gest` is 0 to 1, how far into a line's move he is, and `move` which:
 * 'shrug' both hands out and up, 'hand' a hand to his face, 'arms' both
 * arms raised.
 *
 * He watches. His head follows the aim within what a neck does; past that
 * his shoulders turn, and past that his whole body does, slowly, so he is
 * always facing the quad a little behind it. The turn the body wants is
 * returned for ./dandraw.js to add to his yaw.
 */
export function danAt(T, dt, aim, gest, move, st) {
  const out = st.pose;
  const J = out.J;
  for (let i = 0; i < J.length; i += 1) {
    J[i] = STAND[i];
  }
  /* He breathes, and shifts his weight about. */
  const sway = Math.sin(T / 1700);
  J[BONE.spine * 3] += 0.012 * Math.sin(T / 650);
  J[BONE.spine * 3 + 2] += 0.012 * sway;
  J[BONE.pelvis * 3 + 2] -= 0.02 * sway;
  let pelvisH = PELVIS_STAND;

  let turn = 0;
  let pitch = 0;
  if (aim) {
    const flat = Math.hypot(aim.x, aim.z);
    turn = Math.atan2(aim.x, aim.z);
    pitch = Math.atan2(aim.y - (pelvisH + HEAD_OVER_PELVIS + 0.13), flat);
  } else {
    /* Nothing to watch: he looks about the room. */
    turn = 0.4 * Math.sin(T / 2900);
    pitch = 0.05 * Math.sin(T / 2300);
  }
  /* The head and the shoulders, eased, and the body's share of the turn. */
  const k = 1 - Math.exp(-dt / 140);
  const headWant = clamp(turn, -1.0, 1.0);
  st.headTurn += (headWant - st.headTurn) * k;
  st.headPitch += (clamp(pitch, -0.45, 0.5) - st.headPitch) * k;
  const bodyWant = turn - headWant;
  const spine = clamp(st.headTurn * 0.3, -0.35, 0.35);
  const rate = 1 - Math.exp(-dt / 420);
  const turned = bodyWant * rate;
  J[BONE.head * 3 + 1] += st.headTurn - spine;
  J[BONE.head * 3] += -st.headPitch;
  J[BONE.spine * 3 + 1] += spine;

  if (gest > 0) {
    const g = ease(gest);
    const wob = 0.12 * Math.sin(T * 0.011);
    switch (move) {
      case 'hand':
        toward(J, BONE.armR, g, -0.55, 0, -0.18);
        toward(J, BONE.foreR, g, -2.05 + 0.04 * wob, 0, 0);
        J[BONE.head * 3] += 0.14 * g;
        break;
      case 'arms':
        toward(J, BONE.armL, g, -0.2, 0, 1.9);
        toward(J, BONE.armR, g, -0.2, 0, -1.9);
        toward(J, BONE.foreL, g, -0.2 + wob, 0, 0);
        toward(J, BONE.foreR, g, -0.2 - wob, 0, 0);
        break;
      default:
        /* The shrug: elbows in, forearms out, palms up, shoulders up. */
        toward(J, BONE.armL, g, -0.15, 0, 0.55);
        toward(J, BONE.armR, g, -0.15, 0, -0.55);
        toward(J, BONE.foreL, g, -1.15, 0, 0);
        toward(J, BONE.foreR, g, -1.15, 0, 0);
        J[BONE.head * 3 + 2] += 0.09 * g * Math.sin(T * 0.004);
        pelvisH -= 0.012 * g;
    }
  }
  out.pelvisH = pelvisH;
  out.headH = pelvisH + HEAD_OVER_PELVIS + 0.13;
  out.state = 'stand';
  out.look = aim ? 1 : 0;
  return turned;
}
