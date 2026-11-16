/*
 * thomas.js: Thomas More in his shop, as a pure function of a clock.
 *
 * The owner's ask of 2026-11-16, relaying Thomas: "Then we need me walking
 * around yelling Canadian stereotypes". This file is his life and nothing
 * else: where he is, which way he faces, how every joint is bent and what
 * he is shouting, for any time on his own clock, with no state and no
 * three.js, so a Node check can walk every metre of it
 * (scripts/warehouse-check.js, "Thomas"). His body and his balloon are
 * ./thomasdraw.js.
 *
 * WHERE HE GOES. The south end of the workshop, round where the pilot
 * starts: six spots (STOPS) joined by straight walks that keep a person's
 * width clear of every bench, cart, column and pallet under head height,
 * and never cross the start pad, so a pilot sitting on it is not walked
 * through. Every so often he walks to the next. He is not solid and the
 * craft flies through him.
 *
 * THE LINES are Thomas's to pick (THOMAS_LINES below). These are the
 * stand ins sent to the owner on 16 November 2026, kept because nobody has
 * changed them yet: what this file decides is the timing, a line the moment
 * the craft comes close and another once it has gone away and come back.
 *
 * His skeleton, the way it is posed and the walk are Heads'
 * (../heads/man.js), written again here the way Heads' were written again
 * from Nick Burns', so the shop does not load Heads' house.
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

/* ------------------------------------------------------------------ */
/* What he shouts                                                      */
/* ------------------------------------------------------------------ */

/*
 * text, and whether both hands go up. STAND INS, sent to the owner on 16
 * November 2026 for Thomas to cut, change or add to. Everything a pilot
 * of eight may read: no insult, nobody named.
 */
export const THOMAS_LINES = [
  { text: 'Sorry!', both: false },
  { text: 'Beauty, eh!', both: true },
  { text: 'Take off, eh!', both: false },
  { text: "Give 'er!", both: true },
  { text: 'Double double, bud!', both: false },
  { text: "It's a toque, not a beanie!", both: false },
  { text: 'Mind the veneer, bud!', both: false },
  { text: 'Sorry, eh?', both: false },
  { text: 'Watch out for the moose!', both: true },
  { text: 'Is it hockey night yet?', both: false },
];

/* ------------------------------------------------------------------ */
/* His skeleton                                                        */
/* ------------------------------------------------------------------ */

/*
 * Thirteen bones in his own frame, real metres: x to his left, y up, z the
 * way he faces, the three.js handedness, so ./thomasdraw.js turns the whole
 * frame into the world with one transform. A bone's rest offset is from its
 * parent's joint; the pelvis's height is the pose's. A bone turns by
 * Ry * Rx * Rz of its three angles: x bends it (a positive x leans a bone
 * that points up forward and swings one that points down backward), y twists
 * it, z swings it out to the side.
 */
export const BONES = [
  ['pelvis', -1, [0, 0, 0]],
  ['spine', 0, [0, 0.04, 0]],
  ['head', 1, [0, 0.53, 0]],
  ['armL', 1, [0.2, 0.44, 0]],
  ['foreL', 3, [0, -0.29, 0]],
  ['armR', 1, [-0.2, 0.44, 0]],
  ['foreR', 5, [0, -0.29, 0]],
  ['thighL', 0, [0.095, -0.04, 0]],
  ['shinL', 7, [0, -0.43, 0]],
  ['footL', 8, [0, -0.41, 0]],
  ['thighR', 0, [-0.095, -0.04, 0]],
  ['shinR', 10, [0, -0.43, 0]],
  ['footR', 11, [0, -0.41, 0]],
];
export const BONE = Object.fromEntries(BONES.map((b, i) => [b[0], i]));
const NB = BONES.length;
/* The pelvis over the floor standing. */
const PELVIS_STAND = 0.96;

/* ------------------------------------------------------------------ */
/* Where he goes, plan metres                                          */
/* ------------------------------------------------------------------ */

/* The slab's top, as ./warehouse.js has it (FLOOR0). Written here, not
 * imported, so his life does not load the shop's layout. */
export const THOMAS_FLOOR = 0.05;

/*
 * His six spots and which way he looks at each, plan metres (x east, y
 * north). The start pad is at (24.2, 14.6). `bench` north of it, looking
 * at it; `aisle` and `north` up the workshop's middle; `pallet` by the
 * pallet at the Digital Department's corner; `racking` in the lane along
 * the flat wall; `grey door` at the Digital Department's door.
 */
export const STOPS = [
  { id: 'bench', at: [24.0, 19.5], face: [0, -1], dwell: [7000, 13000], next: [1, 3, 5] },
  { id: 'aisle', at: [24.0, 25.0], face: [1, 0.2], dwell: [6000, 11000], next: [0, 2] },
  { id: 'north', at: [24.0, 29.0], face: [-0.4, -1], dwell: [6000, 10000], next: [1] },
  { id: 'pallet', at: [28.0, 17.5], face: [-1, -0.3], dwell: [7000, 12000], next: [0, 4] },
  { id: 'racking', at: [27.5, 14.2], face: [-1, 0], dwell: [7000, 13000], next: [3, 5] },
  { id: 'grey door', at: [31.0, 14.2], face: [0.3, 1], dwell: [6000, 11000], next: [4, 0] },
];

/* A walking pace, m/s, and the length of one stride (two steps), m. */
const SPEED = 1.2;
const STRIDE = 1.44;
/* A turn takes as long as its angle needs, at about 2.6 rad/s on average. */
const TURN_RATE = 2.6;
const TURN_MIN_MS = 400;
const EASE_MS = 350;

/* ------------------------------------------------------------------ */
/* The table                                                           */
/* ------------------------------------------------------------------ */

/* mulberry32: a small fixed generator, so the table is the same in every
 * browser and in Node. */
function generator(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const yawOf = (dx, dy) => Math.atan2(dx, -dy);
const turnMs = (a, b) => {
  const d = Math.abs(b - a) % (2 * Math.PI);
  return Math.round(Math.max(TURN_MIN_MS, (Math.min(d, 2 * Math.PI - d) / TURN_RATE) * 1000));
};

const PHASES = [];
let PERIOD = 0;

(function buildTable() {
  const rnd = generator(0x7c0ae);
  const lerp = (a, b) => a + (b - a) * rnd();
  let t = 0;
  let at = 0;
  const push = (kind, dur, o) => {
    PHASES.push({ kind, t0: t, t1: t + dur, ...o });
    t += dur;
  };
  for (let k = 0; k < 40; k += 1) {
    const s = STOPS[at];
    const yaw = yawOf(s.face[0], s.face[1]);
    /* The first stand is short, so a pilot who has just arrived sees him
     * set off before long. */
    push('stand', Math.round(k === 0 ? lerp(5000, 8000) : lerp(...s.dwell)), { at: s.at, yaw });
    const to = s.next[Math.floor(rnd() * s.next.length)];
    const d = STOPS[to];
    const dx = d.at[0] - s.at[0];
    const dy = d.at[1] - s.at[1];
    const len = Math.hypot(dx, dy);
    const heading = yawOf(dx, dy);
    const arrive = yawOf(d.face[0], d.face[1]);
    push('turn', turnMs(yaw, heading), { at: s.at, yaw0: yaw, yaw: heading });
    push('walk', Math.round((len / SPEED) * 1000), { from: s.at, to: d.at, len, yaw: heading });
    push('turn', turnMs(heading, arrive), { at: d.at, yaw0: heading, yaw: arrive });
    at = to;
  }
  PERIOD = t;
}());

export const THOMAS_PERIOD_MS = PERIOD;
export const THOMAS_PHASES = PHASES;

function find(list, t) {
  let lo = 0;
  let hi = list.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (list[mid].t0 <= t) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return list[lo];
}

/* ------------------------------------------------------------------ */
/* Poses                                                               */
/* ------------------------------------------------------------------ */

const set = (J, b, x, y, z) => {
  J[b * 3] = x;
  J[b * 3 + 1] = y;
  J[b * 3 + 2] = z;
};

/* Standing at ease, arms a little out and a little bent, as the sheet's
 * walking poses carry them. */
const STAND = new Float64Array(NB * 3);
set(STAND, BONE.armL, 0.06, 0, 0.1);
set(STAND, BONE.armR, 0.06, 0, -0.1);
set(STAND, BONE.foreL, -0.25, 0, 0);
set(STAND, BONE.foreR, -0.25, 0, 0);

const clamp = (v, a, b) => (v < a ? a : (v > b ? b : v));
const ease = (u) => {
  const v = clamp(u, 0, 1);
  return v * v * (3 - 2 * v);
};
const band = (v, a, b) => ease((v - a) / (b - a));
function turnTo(a, b, u) {
  let d = b - a;
  while (d > Math.PI) {
    d -= 2 * Math.PI;
  }
  while (d < -Math.PI) {
    d += 2 * Math.PI;
  }
  return a + d * u;
}

/* Blend joint b's three angles toward (x, y, z) by k. */
function toward(J, b, k, x, y, z) {
  const i = b * 3;
  J[i] += (x - J[i]) * k;
  J[i + 1] += (y - J[i + 1]) * k;
  J[i + 2] += (z - J[i + 2]) * k;
}

/* What thomasAt fills, so a frame allocates nothing. */
export function thomasPose() {
  return {
    x: 0, y: 0, floor: THOMAS_FLOOR, yaw: 0, pelvisH: 0, headH: 0,
    J: new Float64Array(NB * 3),
    state: 'stand', walk: 0, stride: 0, look: 0, wave: 0,
  };
}

/*
 * Thomas at time T (ms on his clock), into `out`. `eye` is the camera in
 * plan metres { x, y, h } or null: he turns his head to it when it comes
 * close and waves at it now and then. `gest` is 0 to 1, how far into a
 * shout he is, and `both` whether it takes both hands.
 */
export function thomasAt(T, eye, gest, both, out) {
  const t = ((T % PERIOD) + PERIOD) % PERIOD;
  const ph = find(PHASES, t);
  const age = t - ph.t0;
  const u = (t - ph.t0) / (ph.t1 - ph.t0);
  const J = out.J;
  let walk = 0;
  let theta = 0;
  switch (ph.kind) {
    case 'walk': {
      const d = (age / 1000) * SPEED;
      const f = clamp(d / ph.len, 0, 1);
      out.x = ph.from[0] + (ph.to[0] - ph.from[0]) * f;
      out.y = ph.from[1] + (ph.to[1] - ph.from[1]) * f;
      out.yaw = ph.yaw;
      walk = Math.min(1, age / EASE_MS, (ph.t1 - t) / EASE_MS);
      theta = (2 * Math.PI * d) / STRIDE;
      break;
    }
    case 'turn': {
      out.x = ph.at[0];
      out.y = ph.at[1];
      out.yaw = turnTo(ph.yaw0, ph.yaw, ease(u));
      /* A shuffle on the spot while he turns. */
      walk = 0.3 * Math.sin(Math.PI * u);
      theta = 2 * Math.PI * u;
      break;
    }
    default: {
      out.x = ph.at[0];
      out.y = ph.at[1];
      out.yaw = ph.yaw;
    }
  }
  const floor = THOMAS_FLOOR;
  let pelvisH = floor + PELVIS_STAND;
  for (let i = 0; i < J.length; i += 1) {
    J[i] = STAND[i];
  }

  /*
   * THE WALK, Heads' (../heads/man.js says how): one stride is a turn of
   * theta, the legs swing and the knees bend through it, each foot is kept
   * level, the arms swing against the legs and he dips at each heel strike.
   */
  if (walk > 0) {
    const s = Math.sin(theta);
    const kneeL = 0.08 + 0.9 * Math.max(0, Math.cos(theta + 0.9));
    const kneeR = 0.08 + 0.9 * Math.max(0, Math.cos(theta + 0.9 + Math.PI));
    const w = walk;
    J[BONE.thighL * 3] += -0.4 * s * w;
    J[BONE.thighR * 3] += 0.4 * s * w;
    J[BONE.shinL * 3] += kneeL * w;
    J[BONE.shinR * 3] += kneeR * w;
    J[BONE.armL * 3] += 0.3 * s * w;
    J[BONE.armR * 3] -= 0.3 * s * w;
    J[BONE.foreL * 3] -= 0.12 * (1 - s) * w;
    J[BONE.foreR * 3] -= 0.12 * (1 + s) * w;
    J[BONE.pelvis * 3 + 1] -= 0.08 * s * w;
    J[BONE.spine * 3 + 1] += 0.14 * s * w;
    J[BONE.spine * 3] += 0.05 * w;
    J[BONE.head * 3 + 1] -= 0.06 * s * w;
    pelvisH -= 0.045 * s * s * w;
  }
  J[BONE.footL * 3] = -(J[BONE.thighL * 3] + J[BONE.shinL * 3]);
  J[BONE.footR * 3] = -(J[BONE.thighR * 3] + J[BONE.shinR * 3]);

  /* Idle: he breathes, and looks about while he is not walking. */
  const idle = 1 - walk;
  J[BONE.spine * 3] += 0.012 * Math.sin(T / 650);
  J[BONE.head * 3 + 1] += idle * (0.3 * Math.sin(T / 2900) + 0.12 * Math.sin(T / 1130));
  J[BONE.head * 3] += idle * 0.05 * Math.sin(T / 2300);

  out.floor = floor;
  out.pelvisH = pelvisH;
  out.headH = pelvisH + 0.04 + 0.53 + 0.13;
  out.walk = walk;
  out.stride = theta;
  out.state = ph.kind;

  /* THE CAMERA, if it is near: where it is from his head, in his frame. */
  let look = 0;
  let wave = 0;
  let turn = 0;
  let pitch = 0;
  if (eye) {
    const wx = eye.x - out.x;
    const wz = -(eye.y - out.y);
    const cy = Math.cos(out.yaw);
    const sy = Math.sin(out.yaw);
    const lx = wx * cy - wz * sy;
    const lz = wx * sy + wz * cy;
    const flat = Math.hypot(lx, lz);
    const dist = Math.hypot(flat, eye.h - out.headH);
    turn = Math.atan2(lx, lz);
    pitch = Math.atan2(eye.h - out.headH, flat);
    look = band(-dist, -10, -6) * band(-Math.abs(turn), -2.4, -1.9);
    const cyc = ((T % 9000) + 9000) % 9000;
    wave = band(-dist, -5, -3) * band(cyc, 0, 300) * (1 - band(cyc, 2700, 3000));
  }
  out.look = look;
  out.wave = wave;
  if (look > 0) {
    J[BONE.head * 3 + 1] += (clamp(turn * 0.7, -1.0, 1.0) - J[BONE.head * 3 + 1]) * look;
    J[BONE.spine * 3 + 1] += clamp(turn * 0.3, -0.45, 0.45) * look;
    J[BONE.head * 3] += (clamp(-pitch, -0.5, 0.4) - J[BONE.head * 3]) * look;
  }

  if (gest > 0) {
    const shake = 0.18 * Math.sin(T * 0.012);
    toward(J, BONE.armR, gest, -0.95, 0, -0.35);
    toward(J, BONE.foreR, gest, -1.25 + shake, 0, 0);
    if (both) {
      toward(J, BONE.armL, gest, -0.95, 0, 0.35);
      toward(J, BONE.foreL, gest, -1.25 - shake, 0, 0);
    }
    J[BONE.head * 3] -= 0.12 * gest;
    J[BONE.head * 3 + 2] += 0.08 * gest * Math.sin(T * 0.006);
  }
  if (wave > 0 && gest === 0) {
    const flap = 0.45 * Math.sin(T * 0.016);
    toward(J, BONE.armR, wave, -0.15, 0, -2.55);
    toward(J, BONE.foreR, wave, -0.25, 0, flap);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Bones                                                               */
/* ------------------------------------------------------------------ */

/*
 * Every bone's transform in his frame, from a pose: 12 numbers a bone in M,
 * a 3 by 3 rotation row by row and then the translation, so a point p of
 * that bone's part goes to R p + t and a normal n to R n.
 */
const L = new Float64Array(12);
export function thomasBones(pose, M) {
  const J = pose.J;
  for (let b = 0; b < NB; b += 1) {
    const [, parent, off] = BONES[b];
    const ax = J[b * 3];
    const ay = J[b * 3 + 1];
    const az = J[b * 3 + 2];
    const sx = Math.sin(ax);
    const cx = Math.cos(ax);
    const sy = Math.sin(ay);
    const cy = Math.cos(ay);
    const sz = Math.sin(az);
    const cz = Math.cos(az);
    /* Rx Rz, then Ry over it. */
    const a00 = cz;
    const a01 = -sz;
    const a02 = 0;
    const a10 = cx * sz;
    const a11 = cx * cz;
    const a12 = -sx;
    const a20 = sx * sz;
    const a21 = sx * cz;
    const a22 = cx;
    L[0] = cy * a00 + sy * a20;
    L[1] = cy * a01 + sy * a21;
    L[2] = cy * a02 + sy * a22;
    L[3] = a10;
    L[4] = a11;
    L[5] = a12;
    L[6] = -sy * a00 + cy * a20;
    L[7] = -sy * a01 + cy * a21;
    L[8] = -sy * a02 + cy * a22;
    L[9] = off[0];
    L[10] = b === 0 ? pose.pelvisH : off[1];
    L[11] = off[2];
    const o = b * 12;
    if (parent < 0) {
      for (let i = 0; i < 12; i += 1) {
        M[o + i] = L[i];
      }
      continue;
    }
    const q = parent * 12;
    for (let r = 0; r < 3; r += 1) {
      for (let c = 0; c < 3; c += 1) {
        M[o + r * 3 + c] = M[q + r * 3] * L[c] + M[q + r * 3 + 1] * L[3 + c] + M[q + r * 3 + 2] * L[6 + c];
      }
      M[o + 9 + r] = M[q + r * 3] * L[9] + M[q + r * 3 + 1] * L[10] + M[q + r * 3 + 2] * L[11] + M[q + 9 + r];
    }
  }
  return M;
}
