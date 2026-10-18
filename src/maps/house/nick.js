/*
 * nick.js: Nick Burns at his patio table, as a pure function of a clock.
 *
 * The owner's ask of 2026-10-17: an anime Nick sitting at the table out the
 * back where he sits, in his red shoes, who now and then gets up and goes
 * inside, and calls out his famous lines. This file is his life and nothing
 * else: where he is, which way he faces, how every joint is bent and what he
 * is saying, for any time on his own clock, with no state and no three.js,
 * so a Node check can walk every metre of it (scripts/house-check.js). His
 * body and his balloon are ./nickdraw.js.
 *
 * WHERE HE GOES. He sits on the north chair of the black metal set under
 * the red umbrella, facing the house, which is where the stills put him.
 * Every so often he gets up, walks round behind the west chair, across the
 * patio and in through the slider, and goes to one of three places: the
 * kitchen sink, the family room sofa (where he sits and watches the
 * television), or the bay in the breakfast room, where he stands and looks
 * out at the yard. Then he comes back the way he went and sits down again.
 * The walks are lines of plan points, real metres, drawn to keep a person's
 * width clear of every solid in the house (the check sweeps them).
 *
 * THE CLOCK is his own, kept by ./nickdraw.js from the clock the shell hands
 * the map each frame (updateAnim in src/main.js). It is a fixed table of
 * forty visits and three hundred callouts made once from a fixed seed, so
 * the same time is always the same Nick, and it wraps after about an hour
 * at a moment he is in his chair, where it starts.
 *
 * THE LINES are the four the owner chose on 2026-10-18: "Holy Catfish!",
 * his catchphrase, on his own merch (nick-burns.myspreadshop.com) and his
 * stickers, and the Kwadverse podcast opens his episode with it; "Boom
 * Shakala!", a phrase his wife once said, on another of his stickers; the
 * stickers he packs in every giveaway box, a running bit he calls a meme
 * himself; and "motor post to motor post", how he measures a quad. The
 * catfish is said most, and always first.
 *
 * Render only. Nothing here reaches the physics or the plant; he is not
 * solid, and the craft flies through him.
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

import { G_PAVE, FLOOR0, DEP, LEN, UMBRELLA } from './house.js';

/* ------------------------------------------------------------------ */
/* What he says                                                        */
/* ------------------------------------------------------------------ */

/* text, how often against the others, the gesture (one hand, or both up),
 * and where it is his from. */
export const NICK_LINES = [
  { text: 'Holy Catfish!', weight: 4, both: true, from: 'his merch shop\'s designs, his stickers, and the Kwadverse podcast\'s opening for him' },
  { text: 'Boom Shakala!', weight: 2, both: true, from: 'one of his stickers, a phrase his wife once said' },
  { text: 'Stickers in the box!', weight: 2, both: false, from: 'his giveaways, where the stickers he packs are a running bit he calls a meme' },
  { text: 'Motor post to motor post!', weight: 2, both: false, from: 'how he measures a quad, in podcast descriptions and his viewers\' comments' },
];

/* ------------------------------------------------------------------ */
/* His skeleton                                                        */
/* ------------------------------------------------------------------ */

/*
 * Thirteen bones in his own frame, real metres: x to his left, y up, z the
 * way he faces, the three.js handedness, so ./nickdraw.js turns the whole
 * frame into the world with one transform (a yaw, a scale of S and a
 * translation) and nothing in between. A bone's rest offset is from its
 * parent's joint; the pelvis's height is the pose's, from the ground at the
 * world's zero. A bone turns by Ry * Rx * Rz of its three angles: x bends it
 * (a positive x leans a bone that points up forward and swings one that
 * points down backward), y twists it, z swings it out to the side.
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

/* The pelvis over the floor standing (0.04 to the hips, 0.84 of leg, 0.08
 * from ankle to sole), and over a seat sitting. The sole is 0.08 under the
 * foot bone, and ./nickdraw.js draws it there. */
const PELVIS_STAND = 0.96;
const SIT_LIFT = 0.12;
const THIGH = 0.43;
export const SOLE = 0.08;
/* The top of his hair over the head bone, for the balloon: ./nickdraw.js
 * draws his head at 1.4 times a real one. */
export const HEAD_TOP = 0.38;

/* ------------------------------------------------------------------ */
/* Where he goes, plan metres                                          */
/* ------------------------------------------------------------------ */

/* The ground under a plan point: the house's floor inside its walls, the
 * patio's paving outside them. */
function floorAt(x, y) {
  return y < DEP && x > 0 && x < LEN ? FLOOR0 : G_PAVE;
}

/* His chair: the north one of the four round the patio table in house.js
 * (backYard), its seat 0.45 over the paving, facing south at the house. */
const PATIO = { at: [UMBRELLA.x, 11.88], top: G_PAVE + 0.45, face: [0, -1] };

/* Out from beside his chair, round behind the west chair, across the patio
 * and in through the slider (x 5.0 to 6.6, into the breakfast room), to
 * just inside it. */
const OUT = [[8.25, 11.76], [7.55, 12.05], [6.55, 11.9], [5.8, 10.4], [5.8, 9.15], [5.8, 8.6], [5.8, 7.85]];

/*
 * Then on to one of these. `face` is where he looks when he gets there;
 * `seat` is a seat he sits on, the last point of `path` being where he
 * stands in front of it. The sofa is the long run of the sectional, facing
 * the fireplace and the television, reached round its south end because
 * the return closes its north end, in through the wide opening and down
 * between the console behind it and the wall to the stair;
 * its seat is 0.45 over the floor.
 */
const PLACES = [
  {
    id: 'kitchen',
    path: [[6.0, 5.6], [9.35, 5.6], [9.6, 7.1], [12.1, 7.1]],
    face: [0, 1],
    dwell: [12000, 26000],
  },
  {
    id: 'sofa',
    path: [[5.3, 6.3], [3.95, 6.3], [3.95, 4.47], [3.47, 4.47], [3.47, 3.75], [1.95, 3.75], [2.0, 5.8]],
    seat: { at: [2.62, 5.8], top: FLOOR0 + 0.45 },
    face: [-1, 0],
    dwell: [22000, 42000],
  },
  {
    id: 'bay',
    path: [[6.0, 5.6], [9.35, 5.6], [9.35, 7.3], [9.05, 8.5], [8.7, 8.75]],
    face: [0, 1],
    dwell: [12000, 24000],
  },
];

/* A walking pace, m/s, and the length of one stride (two steps), m. */
const SPEED = 1.25;
const STRIDE = 1.44;
/* Getting up, sitting down, turning on the spot, the walk's own ease in
 * and out and its turn into the path, ms. */
const RISE_MS = 1300;
const SIT_MS = 1600;
const TURN_MS = 700;
const EASE_MS = 350;
const STEER_MS = 700;

/* For the check: the routes, his chair and the places. */
export const NICK_PLACES = PLACES.map((p) => ({ id: p.id, route: [...OUT, ...p.path], seat: p.seat || null }));
export const NICK_SEAT = PATIO;

/* ------------------------------------------------------------------ */
/* The tables                                                          */
/* ------------------------------------------------------------------ */

/* mulberry32: a small fixed generator, so the tables are the same in every
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

function prepPath(points) {
  const p = points.map(([x, y]) => [x, y, floorAt(x, y)]);
  const cum = [0];
  for (let i = 1; i < p.length; i += 1) {
    cum.push(cum[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
  }
  return { p, cum, len: cum[cum.length - 1] };
}

const yawOf = (dx, dy) => Math.atan2(dx, -dy);

function pathPoint(path, d, out) {
  const { p, cum } = path;
  const dd = d < 0 ? 0 : (d > path.len ? path.len : d);
  let i = 1;
  while (i < p.length - 1 && cum[i] < dd) {
    i += 1;
  }
  const seg = cum[i] - cum[i - 1];
  const t = seg > 0 ? (dd - cum[i - 1]) / seg : 0;
  out[0] = p[i - 1][0] + (p[i][0] - p[i - 1][0]) * t;
  out[1] = p[i - 1][1] + (p[i][1] - p[i - 1][1]) * t;
  out[2] = p[i - 1][2] + (p[i][2] - p[i - 1][2]) * t;
  return out;
}

/* The heading at d, from the chord a quarter metre either side, so a
 * corner is turned over half a metre rather than in one frame. */
const A = [0, 0, 0];
const B = [0, 0, 0];
function pathYaw(path, d) {
  pathPoint(path, d - 0.25, A);
  pathPoint(path, d + 0.25, B);
  return yawOf(B[0] - A[0], B[1] - A[1]);
}

const PHASES = [];
let PERIOD = 0;
const CALLS = [];
let CALL_PERIOD = 0;

(function buildTables() {
  const rnd = generator(0x4e42);
  const lerp = (a, b) => a + (b - a) * rnd();
  const seatYaw = yawOf(PATIO.face[0], PATIO.face[1]);
  let t = 0;
  let last = -1;
  const push = (kind, dur, o) => {
    PHASES.push({ kind, t0: t, t1: t + dur, ...o });
    t += dur;
  };
  for (let k = 0; k < 40; k += 1) {
    /* The first sit is short, so a pilot who has just arrived sees him go
     * in before long; after that, half a minute to a minute and a quarter. */
    push('seated', Math.round(k === 0 ? lerp(14000, 24000) : lerp(32000, 75000)), { seat: PATIO, yaw: seatYaw });
    let n = Math.floor(rnd() * PLACES.length);
    if (n === last) {
      n = (n + 1 + Math.floor(rnd() * (PLACES.length - 1))) % PLACES.length;
    }
    last = n;
    const place = PLACES[n];
    const there = prepPath([...OUT, ...place.path]);
    const back = prepPath([...place.path].reverse().concat([...OUT].reverse()));
    const end = there.p[there.p.length - 1];
    const placeYaw = yawOf(place.face[0], place.face[1]);
    push('rise', RISE_MS, { seat: PATIO, stand: OUT[0], yaw: seatYaw });
    push('walk', Math.round((there.len / SPEED) * 1000), { path: there, yaw0: seatYaw });
    const arriveYaw = pathYaw(there, there.len);
    if (place.seat) {
      push('sit', SIT_MS, { seat: place.seat, stand: [end[0], end[1]], yaw0: arriveYaw, yaw: placeYaw });
      push('seated', Math.round(lerp(...place.dwell)), { seat: place.seat, yaw: placeYaw });
      push('rise', RISE_MS, { seat: place.seat, stand: [end[0], end[1]], yaw: placeYaw });
    } else {
      push('turn', TURN_MS, { at: end, yaw0: arriveYaw, yaw: placeYaw });
      push('stand', Math.round(lerp(...place.dwell)), { at: end, yaw: placeYaw });
      push('turn', TURN_MS, { at: end, yaw0: placeYaw, yaw: pathYaw(back, 0) });
    }
    push('walk', Math.round((back.len / SPEED) * 1000), { path: back, yaw0: place.seat ? placeYaw : pathYaw(back, 0) });
    push('sit', SIT_MS, { seat: PATIO, stand: OUT[0], yaw0: pathYaw(back, back.len), yaw: seatYaw });
  }
  PERIOD = t;

  /* The callouts: a line every seven to seventeen seconds, the catfish
   * first, never the same line twice running, held long enough to read. */
  const total = NICK_LINES.reduce((s, l) => s + l.weight, 0);
  const crnd = generator(0xca7f15);
  let c = 4000;
  let prev = -1;
  for (let k = 0; k < 300; k += 1) {
    let i = k === 0 ? 0 : prev;
    while (i === prev) {
      let w = crnd() * total;
      i = 0;
      while (w >= NICK_LINES[i].weight) {
        w -= NICK_LINES[i].weight;
        i += 1;
      }
    }
    prev = i;
    const dur = Math.min(4200, 2400 + 60 * NICK_LINES[i].text.length);
    CALLS.push({ t0: c, t1: c + dur, line: i });
    c += Math.round(7000 + crnd() * 10000);
  }
  CALL_PERIOD = c;
}());

export const NICK_PERIOD_MS = PERIOD;
export const NICK_CALL_PERIOD_MS = CALL_PERIOD;
export const NICK_PHASES = PHASES;
export const NICK_CALLS = CALLS;

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

/* Standing at ease, arms a little out and a little bent. */
const STAND = new Float64Array(NB * 3);
set(STAND, BONE.armL, 0.06, 0, 0.12);
set(STAND, BONE.armR, 0.06, 0, -0.12);
set(STAND, BONE.foreL, -0.3, 0, 0);
set(STAND, BONE.foreR, -0.3, 0, 0);

/* Sitting back in a chair: thighs level and a little apart, shins down,
 * one hand on the table or a knee, the other in his lap. */
const SIT = new Float64Array(NB * 3);
set(SIT, BONE.spine, -0.07, 0, 0);
set(SIT, BONE.head, 0.06, 0, 0);
set(SIT, BONE.thighL, -1.5, 0, 0.1);
set(SIT, BONE.thighR, -1.5, 0, -0.1);
set(SIT, BONE.shinL, 1.5, 0, -0.1);
set(SIT, BONE.shinR, 1.5, 0, 0.1);
set(SIT, BONE.armL, -0.45, 0, 0.12);
set(SIT, BONE.foreL, -1.0, 0, 0);
set(SIT, BONE.armR, -0.3, 0, -0.14);
set(SIT, BONE.foreR, -1.2, 0, 0);

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

/* What nickAt fills, so a frame allocates nothing. */
export function nickPose() {
  return {
    x: 0, y: 0, floor: 0, yaw: 0, pelvisH: 0, headH: 0,
    J: new Float64Array(NB * 3),
    state: 'seated', indoors: false, cover: false, sit: 1, walk: 0,
    line: -1, lineAge: 0, lineDur: 0,
    look: 0, wave: 0,
  };
}

const P = [0, 0, 0];

/*
 * Nick at time T (ms on his clock), into `out`. `eye` is the camera in plan
 * metres { x, y, h } or null: he turns his head to it when it comes close,
 * and waves at it now and then when it is closer still.
 */
export function nickAt(T, eye, out) {
  const t = ((T % PERIOD) + PERIOD) % PERIOD;
  const ph = find(PHASES, t);
  const age = t - ph.t0;
  const u = (t - ph.t0) / (ph.t1 - ph.t0);
  const J = out.J;
  let sit = 0;
  let walk = 0;
  let theta = 0;
  let lean = 0;
  let floor = 0;
  let pelvisH = 0;
  switch (ph.kind) {
    case 'seated': {
      sit = 1;
      out.x = ph.seat.at[0];
      out.y = ph.seat.at[1];
      floor = floorAt(out.x, out.y);
      pelvisH = ph.seat.top + SIT_LIFT;
      out.yaw = ph.yaw;
      break;
    }
    case 'rise':
    case 'sit': {
      /* Sitting down turns him first, then lowers him; getting up is the
       * lowering backwards. Either way the pelvis travels between the seat
       * and the spot in front of it, and he leans forward over his knees
       * on the way, as a person does. */
      let e;
      if (ph.kind === 'rise') {
        e = 1 - ease(u);
        out.yaw = ph.yaw;
      } else {
        out.yaw = turnTo(ph.yaw0, ph.yaw, band(u, 0, 0.35));
        e = band(u, 0.3, 1);
      }
      sit = e;
      out.x = ph.stand[0] + (ph.seat.at[0] - ph.stand[0]) * e;
      out.y = ph.stand[1] + (ph.seat.at[1] - ph.stand[1]) * e;
      floor = floorAt(ph.stand[0], ph.stand[1]);
      /* The pelvis at the height his bending legs put it, so his feet stay
       * on the floor all the way down, and on the seat at the end. */
      const legs = floor + PELVIS_STAND - THIGH * (1 - Math.cos(SIT[BONE.thighL * 3] * e));
      pelvisH = legs + (ph.seat.top + SIT_LIFT - floor - PELVIS_STAND + THIGH * (1 - Math.cos(SIT[BONE.thighL * 3]))) * e;
      lean = 0.6 * Math.sin(Math.PI * e);
      break;
    }
    case 'walk': {
      const d = (age / 1000) * SPEED;
      pathPoint(ph.path, d, P);
      out.x = P[0];
      out.y = P[1];
      floor = P[2];
      out.yaw = turnTo(ph.yaw0, pathYaw(ph.path, d), band(age, 0, STEER_MS));
      walk = Math.min(1, age / EASE_MS, (ph.t1 - t) / EASE_MS);
      theta = (2 * Math.PI * d) / STRIDE;
      pelvisH = floor + PELVIS_STAND;
      break;
    }
    case 'turn': {
      out.x = ph.at[0];
      out.y = ph.at[1];
      floor = ph.at[2];
      out.yaw = turnTo(ph.yaw0, ph.yaw, ease(u));
      /* A shuffle on the spot while he turns. */
      walk = 0.3 * Math.sin(Math.PI * u);
      theta = 2 * Math.PI * u;
      pelvisH = floor + PELVIS_STAND;
      break;
    }
    default: {
      out.x = ph.at[0];
      out.y = ph.at[1];
      floor = ph.at[2];
      out.yaw = ph.yaw;
      pelvisH = floor + PELVIS_STAND;
    }
  }

  for (let i = 0; i < J.length; i += 1) {
    J[i] = STAND[i] + (SIT[i] - STAND[i]) * sit;
  }

  /*
   * THE WALK. One stride is a turn of theta. The left thigh is forward at a
   * quarter turn (heel strike) and back at three quarters (toe off); its
   * knee bends from late stance through toe off and is straight again
   * before the next heel strike, which is the shape of a real knee's curve
   * near enough to read at a glance. Each foot is kept level with the
   * ground. The arms swing against the legs, the pelvis turns with the
   * stepping leg and the shoulders against it, and he dips a little at each
   * heel strike.
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
    J[BONE.footL * 3] = -(J[BONE.thighL * 3] + J[BONE.shinL * 3]);
    J[BONE.footR * 3] = -(J[BONE.thighR * 3] + J[BONE.shinR * 3]);
    J[BONE.armL * 3] += 0.3 * s * w;
    J[BONE.armR * 3] -= 0.3 * s * w;
    J[BONE.foreL * 3] -= 0.12 * (1 - s) * w;
    J[BONE.foreR * 3] -= 0.12 * (1 + s) * w;
    J[BONE.pelvis * 3 + 1] -= 0.08 * s * w;
    J[BONE.spine * 3 + 1] += 0.14 * s * w;
    J[BONE.spine * 3] += 0.05 * w;
    J[BONE.head * 3 + 1] -= 0.06 * s * w;
    pelvisH -= 0.045 * s * s * w;
  } else {
    J[BONE.footL * 3] = -(J[BONE.thighL * 3] + J[BONE.shinL * 3]);
    J[BONE.footR * 3] = -(J[BONE.thighR * 3] + J[BONE.shinR * 3]);
  }
  J[BONE.spine * 3] += lean;
  J[BONE.head * 3] -= lean * 0.5;

  /* Idle: he breathes, and looks round slowly while he is not walking. */
  const idle = 1 - walk;
  J[BONE.spine * 3] += 0.012 * Math.sin(T / 650);
  J[BONE.head * 3 + 1] += idle * (0.3 * Math.sin(T / 2900) + 0.12 * Math.sin(T / 1130));
  J[BONE.head * 3] += idle * 0.05 * Math.sin(T / 2300);

  out.floor = floor;
  out.pelvisH = pelvisH;
  out.headH = pelvisH + 0.04 + 0.53 + 0.13;
  out.sit = sit;
  out.walk = walk;
  out.state = ph.kind;
  out.indoors = floor > (FLOOR0 + G_PAVE) / 2;
  out.cover = !out.indoors && Math.hypot(out.x - UMBRELLA.x, out.y - UMBRELLA.y) < UMBRELLA.r + 0.2;

  /* THE LINE he is saying, if any, and the hand that goes with it. */
  const ct = ((T % CALL_PERIOD) + CALL_PERIOD) % CALL_PERIOD;
  const call = find(CALLS, ct);
  out.line = -1;
  let gest = 0;
  if (ct >= call.t0 && ct < call.t1) {
    out.line = call.line;
    out.lineAge = ct - call.t0;
    out.lineDur = call.t1 - call.t0;
    gest = band(out.lineAge, 0, 260) * (1 - band(out.lineAge, out.lineDur - 450, out.lineDur));
  }

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
    /* Three seconds of every nine while it hangs about within a few
     * metres, so a pilot who hovers by him is waved at, not semaphored. */
    const cyc = ((T % 9000) + 9000) % 9000;
    wave = band(-dist, -7, -4) * band(cyc, 0, 300) * (1 - band(cyc, 2700, 3000));
  }
  out.look = look;
  out.wave = wave;
  if (look > 0) {
    J[BONE.head * 3 + 1] += (clamp(turn * 0.7, -1.0, 1.0) - J[BONE.head * 3 + 1]) * look;
    J[BONE.spine * 3 + 1] += clamp(turn * 0.3, -0.45, 0.45) * look;
    J[BONE.head * 3] += (clamp(-pitch, -0.5, 0.4) - J[BONE.head * 3]) * look;
  }

  if (gest > 0) {
    const shake = 0.18 * Math.sin(out.lineAge * 0.012);
    const both = NICK_LINES[out.line].both;
    toward(J, BONE.armR, gest, -0.95, 0, -0.35);
    toward(J, BONE.foreR, gest, -1.25 + shake, 0, 0);
    if (both) {
      toward(J, BONE.armL, gest, -0.95, 0, 0.35);
      toward(J, BONE.foreL, gest, -1.25 - shake, 0, 0);
    }
    J[BONE.head * 3] -= 0.12 * gest;
    J[BONE.head * 3 + 2] += 0.08 * gest * Math.sin(out.lineAge * 0.006);
  }
  if (wave > 0) {
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
 * Every bone's transform in his frame, from a pose: 12 numbers a bone in
 * M, a 3 by 3 rotation row by row and then the translation, so a point p of
 * that bone's part goes to R p + t and a normal n to R n. ./nickdraw.js
 * moves his vertices with these and the check stands him on the floor with
 * them.
 */
const L = new Float64Array(12);
export function nickBones(pose, M) {
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
