/*
 * egg.js: has the pilot found the STF mark? Pure: no Three.js, no DOM, no
 * clock and no JS trigonometry, so it runs in Node against real colliders.
 *
 * WHAT FOUND MEANS. FREESTYLE-MAPS-PLAN.md section 9: the craft within about
 * 4 m of the mark, looking at it, with a clear line to it. Every clause is
 * about what the FPV camera sees, so the shell asks with the camera's own
 * position and the way it points, not with the craft's centre: the lens is
 * forward of the centre and tilted up from the nose (src/render/lens.js),
 * and a pilot looks through it, not through the frame.
 *
 * The mark is `egg` from the map (src/maps/README.md): its centre p, the way
 * it faces n, its up and its size, world metres, Three.js frame, y up. The
 * colliders are the map's own Colliders (src/game/collide.js), the set the
 * plant flies against, so a wall that stops the craft also hides the mark.
 *
 * FOUR TESTS, cheapest first, and the first three are a handful of
 * multiplications, which is what lets the shell ask every few frames for a
 * whole flight: almost every answer stops at the range.
 *
 *   1. RANGE. The eye within FIND_RANGE of the mark's centre.
 *   2. THE PAINTED SIDE. The eye at least FIND_FRONT out in front of the
 *      painted plane, and at least FIND_FACE of its distance out, so the
 *      paint is seen at a slant and not edge on. Behind it, a pilot is
 *      looking at the back of whatever it is sprayed on.
 *   3. LOOKING AT IT. The centre within the cone about the camera's forward
 *      whose half angle has the cosine FIND_COS. Compared squared, so no
 *      angle is ever taken: f.d >= cos |f| |d| with both sides positive.
 *   4. A CLEAR LINE (clearLineTo), from the eye to FIND_LINE_OFF in front
 *      of the centre. Two questions, because each one misses what the other
 *      catches. Colliders.segmentCrossesAny counts a solid only when the
 *      line goes in one face and out of the OPPOSITE one, which catches a
 *      thin wall crossed square on and misses a line that cuts through a
 *      corner, in through the top and out through a side. So the line is
 *      also walked in FIND_STEP steps, eye included, asking whether each
 *      point is inside a solid (Colliders.gapAt with no reach answers 0 for
 *      a point in one), which catches the corner and could step over a
 *      plate thinner than a step, which the first question does not.
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

/*
 * How near, in metres: the plan's "about 4 m". From there the town's 1.7 m
 * mark and a built map's 1.8 m one span about a fifth of the default
 * frame's width, which is near enough to have come looking and far enough
 * that a pilot flying past it, rather than hovering at it, still counts.
 */
export const FIND_RANGE = 4.0;

/*
 * How far out in front of the painted plane the eye has to be, in metres.
 * Within this of the plane a pilot sees the paint edge on, a stripe that
 * cannot be read as anything, and past it on the wrong side sees nothing.
 */
export const FIND_FRONT = 0.2;

/*
 * And at what slant: the least share of the eye's distance from the mark's
 * centre that it stands out in front of the painted plane, the sine of 15
 * degrees, written out for FIND_COS's reason. FIND_FRONT on its own is a
 * distance, and at range a distance is no angle: 0.2 m out at 4 m is 3
 * degrees off the plane, which is the stripe it was written to keep out.
 * Measured flying in through the works shed's broken clerestory, the find
 * fired with the eye 1.6 m from the town's mark and 0.21 m under the
 * ceiling it is on, 7.6 degrees off it. At 15 degrees a quarter of the
 * mark's height still faces the eye, which is lettering; flatter is a line.
 */
export const FIND_FACE = 0.25881904510252074;

/*
 * The cone a pilot is "looking at" the mark in: the cosine of 35 degrees,
 * written out because a cosine is all the test needs and the file takes no
 * angles. 35 because the narrowest field of view Settings offers is 75
 * degrees top to bottom (CAMERA_FOVS in src/render/lens.js), 37.5 from the
 * middle to the edge, so inside this cone the mark's centre is in the
 * picture at every setting on a screen wider than it is tall, and no more
 * than about three quarters of the way out from the middle at the default
 * 85. A mark glimpsed at the edge of the goggles has not been found.
 */
export const FIND_COS = 0.8191520442889918;

/*
 * Where the sight line ends, this far out in front of the mark's centre, in
 * metres. The paint has no solid, but the face it is sprayed on does, and
 * the paint is only a centimetre or two off it (src/maps/README.md), so a
 * line that went all the way would end on or in that face.
 */
export const FIND_LINE_OFF = 0.02;

/*
 * The walk along the sight line, in metres. A tenth of a metre is 40 points
 * at the full range, a fraction of a millisecond, and nothing a craft can
 * be hidden behind is thinner than that except a plate, which the opposite
 * faces question catches.
 */
export const FIND_STEP = 0.1;

/*
 * Does the eye see the mark? True when it is within FIND_RANGE, in front of
 * the paint, looking at it, and nothing solid is between.
 *
 *   eye       { x, y, z }: the FPV camera's position, world metres
 *   forward   { x, y, z }: the way the camera points, world frame; any length
 *   egg       the map's `egg`, { p: [x, y, z], n: [nx, ny, nz], ... }, or null
 *   colliders the map's Colliders, or null for a map with nothing solid
 *
 * Never throws on a bad number: a NaN fails the comparisons and answers
 * false, which is what a craft that has gone to NaN deserves.
 */
export function seesMark(eye, forward, egg, colliders) {
  if (!egg || !egg.p || !egg.n || !eye || !forward) {
    return false;
  }
  const [px, py, pz] = egg.p;
  const [nx, ny, nz] = egg.n;
  /* From the eye to the mark's centre. */
  const dx = px - eye.x;
  const dy = py - eye.y;
  const dz = pz - eye.z;
  const d2 = dx * dx + dy * dy + dz * dz;
  if (!(d2 <= FIND_RANGE * FIND_RANGE)) {
    return false;
  }
  /* (eye - p) . n: how far out in front of the painted plane the eye is. */
  const front = -(dx * nx + dy * ny + dz * nz);
  if (!(front > FIND_FRONT)) {
    return false;
  }
  /* At a slant: front >= FIND_FACE |d|, both sides positive, so squared. */
  if (!(front * front >= FIND_FACE * FIND_FACE * d2)) {
    return false;
  }
  const fx = forward.x;
  const fy = forward.y;
  const fz = forward.z;
  const along = fx * dx + fy * dy + fz * dz;
  const f2 = fx * fx + fy * fy + fz * fz;
  if (!(along > 0 && along * along >= FIND_COS * FIND_COS * f2 * d2)) {
    return false;
  }
  return clearLineTo(eye, egg, colliders);
}

/*
 * Test 4 on its own: is nothing solid between the eye and the mark, at any
 * range? seesMark asks it last. It is exported because "hidden from the
 * pads" is this question asked from the pads, where the range alone would
 * already say no and prove nothing.
 */
export function clearLineTo(eye, egg, colliders) {
  if (!egg || !egg.p || !egg.n || !eye) {
    return false;
  }
  if (!colliders) {
    return true;
  }
  const ex = egg.p[0] + egg.n[0] * FIND_LINE_OFF;
  const ey = egg.p[1] + egg.n[1] * FIND_LINE_OFF;
  const ez = egg.p[2] + egg.n[2] * FIND_LINE_OFF;
  if (colliders.segmentCrossesAny(eye.x, eye.y, eye.z, ex, ey, ez)) {
    return false;
  }
  const lx = ex - eye.x;
  const ly = ey - eye.y;
  const lz = ez - eye.z;
  const steps = Math.ceil(Math.sqrt(lx * lx + ly * ly + lz * lz) / FIND_STEP);
  if (!(steps < Infinity)) {
    return false;
  }
  for (let k = 0; k < steps; k += 1) {
    const t = k / steps;
    if (colliders.gapAt(eye.x + lx * t, eye.y + ly * t, eye.z + lz * t, 0) === 0) {
      return false;
    }
  }
  return true;
}
