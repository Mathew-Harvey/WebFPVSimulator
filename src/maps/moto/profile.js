/*
 * profile.js: the ground the bikes of Ridgeline MX ride over, and how a
 * bike rides it. Pure: no Three.js, no DOM, no JS trigonometry, so the
 * drawn mounds, the solids a quad can hit, the bikes' bodies and the film
 * judge's poses all read the same numbers (scripts/moto-check.js).
 *
 * THE PHYSICS MODULE DRIVES EVERY BIKE ALONG A FLAT LINE (src/native/
 * world.c, section 5): where a bike is, which way it heads and how fast it
 * goes are the module's, from the lap clock, the same on every page. What a
 * bike does on top of that is this file's, a pure function of one number,
 * how far it has driven (the pose's `distance`), and of its slot:
 *
 *   dy       how high it is over the flat line: the mound under its wheels,
 *            or the arc it flies from a lip to a landing
 *   pitch    the nose up or down, rad: the slope under it, or the arc
 *   yaw      how far its tail is out, rad, left positive: a whip
 *   roll     how far it is laid over, rad, left positive: a rail through a
 *            berm on the ground, a whip or a scrub in the air
 *
 * THE FEATURES are written along the centre line, in metres from the start
 * line, each as the ground's profile (a polyline of [s, height]) and the
 * flights a bike takes over it ({ a, b, apex }: it leaves the ground at s =
 * a, lands at s = b and is `apex` metres over the chord between them at the
 * middle). Bikes run in three lines side by side; ./traffic.js maps a
 * line's distance to the centre's, and the features stand on the straights,
 * where the three are the same length.
 *
 * WHAT A BIKE DOES OVER A FLIGHT is picked by a hash of its slot, the lap
 * and the flight, so it is the same on every page and different every lap:
 * a CLEAN one, a WHIP (the tail comes round to one side as it lays the bike
 * over), or a SCRUB (the bike is pushed down and laid flat, a low, long
 * jump). Riders pull a different one each time, as they do.
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

/* Gravity, m/s/s, for the lean a bend asks of a bike. */
const G = 9.81;
/* The most a bike lays over on the ground, rad: about 43 degrees. */
export const LEAN_MAX = 0.75;
/* How far the wheels of a bike are from the ground plane's mound, a
 * little less than the mound, so the tyres sit in the dirt: whoops are
 * skimmed, not followed to the floor. */
const WHOOP_SKIM = 0.7;

/* ------------------------------------------------------------------ */
/* The features                                                        */
/* ------------------------------------------------------------------ */

/* A ramp up from s to s + len, rising h. Pieces are joined by feature(). */
function up(s, len, h) {
  return [[s, 0], [s + len * 0.55, h * 0.3], [s + len * 0.85, h * 0.7], [s + len, h]];
}
function down(s, len, h) {
  return [[s, h], [s + len * 0.15, h * 0.7], [s + len * 0.45, h * 0.3], [s + len, 0]];
}

/*
 * kind: 'table' a flat top between a ramp and a landing, 'double' a gap
 * between two ramps, 'whoops' a run of small bumps, 'step' a short rise
 * with a drop. `lip` is where a bike leaves the ground. `land` where it
 * comes down. `half` is the mound's width, m, either side of the line:
 * wide enough for all three lines and the riders' room.
 */
function table(s, upLen, top, downLen, h) {
  const pts = [...up(s, upLen, h), ...down(s + upLen + top, downLen, h)];
  const lip = s + upLen + top;
  return {
    kind: 'table',
    s0: s,
    s1: s + upLen + top + downLen,
    pts,
    /* The table top is flown: off the lip, down the face. */
    air: [{ a: s + upLen + top * 0.55, b: s + upLen + top + downLen * 0.4, apex: 0.9 }],
    lip,
    h,
  };
}

function double(s, upLen, gap, downLen, h, hLand) {
  const lip = s + upLen;
  const land = lip + gap;
  const pts = [...up(s, upLen, h), ...down(land, downLen, hLand)];
  return {
    kind: 'double',
    s0: s,
    s1: land + downLen,
    pts,
    air: [{ a: lip, b: land + downLen * 0.35, apex: 0.5 + gap * 0.07 }],
    lip,
    h,
    gap,
    hLand,
  };
}

function whoops(s, n, pitch, h) {
  const pts = [[s, 0]];
  for (let i = 0; i < n; i += 1) {
    const c = s + pitch * (i + 0.5);
    pts.push([c - pitch * 0.25, h * 0.55], [c, h], [c + pitch * 0.25, h * 0.55], [c + pitch * 0.5, 0]);
  }
  /* The valleys between the crests at height 0: a point at each crest's
   * foot, so the polyline is crest, valley, crest. */
  return {
    kind: 'whoops',
    s0: s,
    s1: s + n * pitch,
    pts,
    air: [],
    h,
    skim: true,
  };
}

function step(s, upLen, top, h) {
  return {
    kind: 'step',
    s0: s,
    s1: s + upLen + top + 4,
    pts: [...up(s, upLen, h), [s + upLen + top, h], [s + upLen + top + 0.3, 0.1], [s + upLen + top + 4, 0]],
    air: [{ a: s + upLen + top - 0.5, b: s + upLen + top + 4, apex: 0.35 }],
    lip: s + upLen + top,
    h,
  };
}

/* The course, in order of s, all on the straights of ./circuit.js. */
export const FEATURES = [
  table(60, 7.5, 8, 8, 2.1),
  double(114, 8, 14, 9, 2.4, 1.9),
  double(432, 5.5, 6, 6.5, 1.7, 1.4),
  double(452, 5.5, 6.5, 6.5, 1.8, 1.5),
  whoops(486, 16, 2.6, 0.42),
  table(630, 7, 7, 7.5, 1.9),
  double(758, 7.5, 12, 8.5, 2.0, 1.7),
];

/* Every flight in order, with the feature it belongs to. */
export const FLIGHTS = [];
FEATURES.forEach((f, fi) => {
  f.air.forEach((a, k) => {
    FLIGHTS.push({
      feature: fi, a: a.a, b: a.b, apex: a.apex, id: FLIGHTS.length, k,
    });
  });
});

/* ------------------------------------------------------------------ */
/* The ground                                                          */
/* ------------------------------------------------------------------ */

/* The height of the ground at s in one feature's polyline. */
function polyAt(pts, s) {
  if (s <= pts[0][0] || s >= pts[pts.length - 1][0]) {
    return 0;
  }
  let lo = 0;
  let hi = pts.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (pts[mid][0] <= s) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  const a = pts[lo];
  const b = pts[hi];
  const f = b[0] > a[0] ? (s - a[0]) / (b[0] - a[0]) : 0;
  return a[1] + (b[1] - a[1]) * f;
}

/* The ground's height at centre arc length s. */
export function groundAt(s) {
  for (let i = 0; i < FEATURES.length; i += 1) {
    const f = FEATURES[i];
    if (s > f.s0 && s < f.s1) {
      return polyAt(f.pts, s);
    }
  }
  return 0;
}

/* ------------------------------------------------------------------ */
/* The bike                                                            */
/* ------------------------------------------------------------------ */

/* A small integer hash to [0, 1). */
export function hash01(a, b, c) {
  let h = Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b | 0, 0x85ebca77) ^ Math.imul(c | 0, 0xc2b2ae3d);
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export const STYLE_CLEAN = 0;
export const STYLE_WHIP = 1;
export const STYLE_SCRUB = 2;

/* The style a bike pulls on a flight this lap: 40% clean, 35% whip, 25%
 * scrub, and for a whip which side and how hard (0.45 to 1). */
export function styleOf(slot, lap, flight, out) {
  const h = hash01(slot * 131 + 7, lap, flight);
  out.style = h < 0.4 ? STYLE_CLEAN : (h < 0.75 ? STYLE_WHIP : STYLE_SCRUB);
  const g = hash01(slot * 17 + 3, lap + 11, flight);
  out.side = g < 0.5 ? -1 : 1;
  out.amount = 0.45 + 0.55 * hash01(slot + 29, lap * 3 + 1, flight + 5);
  return out;
}

/* A bell on 0..1: 0 at both ends, 1 in the middle, no trigonometry. */
const bell = (u) => 4 * u * (1 - u);
/* A softer one for the whip: it comes round fast, holds, and goes back. */
const whipBell = (u) => {
  const b = bell(u);
  return b * b * (3 - 2 * b);
};

/* The flight s is in, or null. A scan, there are seven. */
function flightAt(s) {
  for (let i = 0; i < FLIGHTS.length; i += 1) {
    const f = FLIGHTS[i];
    if (s >= f.a && s < f.b) {
      return f;
    }
  }
  return null;
}

const STYLE_SCRATCH = { style: 0, side: 1, amount: 0 };

/*
 * How the bike with `slot` rides at centre arc length `s` on lap `lap`,
 * going `speed` m/s round a bend of `curvature` (1/m, left positive), into
 * `out`: { dy, pitch, yaw, roll, air }. `air` is 0 on the ground and the
 * share of the flight flown (0..1) in the air.
 */
export function rideAt(slot, lap, s, speed, curvature, out) {
  const flight = flightAt(s);
  let dy = 0;
  let pitch = 0;
  let yaw = 0;
  let roll = 0;
  let air = 0;
  /* The lean a bend asks of it: the angle at which gravity and the bend's
   * centrifugal pull line up with the bike, atan(v v k / g), the rider
   * holding it a little under. Without trigonometry: x / (1 + x x / 2)
   * is within a few percent of atan out to the lean limit. */
  const x = speed * speed * curvature / G;
  let lean = x / (1 + 0.5 * x * x * 0.8);
  lean *= 0.95;
  lean = lean > LEAN_MAX ? LEAN_MAX : (lean < -LEAN_MAX ? -LEAN_MAX : lean);
  if (flight) {
    const u = (s - flight.a) / (flight.b - flight.a);
    const fa = FEATURES[flight.feature];
    const ga = polyAt(fa.pts, flight.a);
    const gb = polyAt(fa.pts, flight.b);
    styleOf(slot, lap, flight.id, STYLE_SCRATCH);
    const scrub = STYLE_SCRATCH.style === STYLE_SCRUB;
    const apex = flight.apex * (scrub ? 0.4 : 1);
    dy = ga + (gb - ga) * u + apex * bell(u);
    /* The arc's slope, per metre of s, over the flight's length. */
    const span = flight.b - flight.a;
    const slope = ((gb - ga) + apex * 4 * (1 - 2 * u)) / span;
    pitch = slope / (1 + 0.28 * slope * slope);
    if (scrub) {
      pitch -= 0.1 * bell(u);
      roll = STYLE_SCRATCH.side * 1.05 * STYLE_SCRATCH.amount * whipBell(u);
    } else if (STYLE_SCRATCH.style === STYLE_WHIP) {
      yaw = STYLE_SCRATCH.side * 0.95 * STYLE_SCRATCH.amount * whipBell(u);
      roll = STYLE_SCRATCH.side * 0.8 * STYLE_SCRATCH.amount * whipBell(u);
    }
    /* Whatever lean it had on the lip is let go over the first third. */
    const keep = u < 0.33 ? 1 - u * 3 : 0;
    roll += lean * keep;
    air = u > 0 ? u : 0.001;
  } else {
    const g0 = groundAt(s);
    const g1 = groundAt(s + 0.8);
    const g2 = groundAt(s - 0.8);
    const k = inWhoops(s) ? WHOOP_SKIM : 1;
    dy = g0 * k;
    const slope = (g1 - g2) / 1.6;
    pitch = (slope / (1 + 0.28 * slope * slope)) * k;
    roll = lean;
  }
  out.dy = dy;
  out.pitch = pitch;
  out.yaw = yaw;
  out.roll = roll;
  out.air = air;
  return out;
}

function inWhoops(s) {
  for (let i = 0; i < FEATURES.length; i += 1) {
    const f = FEATURES[i];
    if (f.skim && s > f.s0 && s < f.s1) {
      return true;
    }
  }
  return false;
}
