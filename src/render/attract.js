/*
 * attract.js: the camera behind the title screen.
 *
 * WHAT WAS WRONG WITH THE OLD ONE. It orbited a point. On the race field
 * that framed the start gate and nothing else, so a player choosing between
 * two tracks was shown the same nine metre circle whichever one they picked;
 * in the city it swung a 11 m circle round the spawn, straight through the
 * shopfronts on both sides of the road, because a circle drawn on a street
 * plan does not know there are buildings on it.
 *
 * So a map now hands over a LINE to fly instead of a point to circle, and it
 * is the map's business to make sure the line is flyable: the race field
 * derives one from its own racing line and lifts it clear of the tallest
 * structure near each sample, and the city walks its own road centreline and
 * comes back over the roofs. Neither can clip anything, because in both
 * cases the line is drawn from the same data the world was built out of.
 *
 * The orbit stays as the fallback, for a map with nothing to fly around:
 * an empty custom course is a real state, and circling nothing is a better
 * shot of it than flying round nothing.
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

import * as THREE from 'three';

/* The most the shot will bank, in radians, about 13 degrees. A flythrough
 * that stays wings level reads as a camera on rails; a pilot rolls into a
 * turn and the eye reads the roll as commitment. Held well under a racing
 * bank because this is an establishing shot, not a lap: at 0.30 the figure
 * eight's crossover put the horizon far enough over that the title type sat
 * at an angle to it. */
const MAX_BANK = 0.22;

export function makeAttractCamera(view) {
  const spec = view && view.attract ? view.attract : null;
  const pts = spec && Array.isArray(spec.path) ? spec.path : null;

  if (!pts || pts.length < 4) {
    /* The orbit, kept verbatim so a map without a line behaves exactly as
     * every map did before there were lines. */
    const target = new THREE.Vector3();
    const at = spec ?? { x: 0, y: 0, z: 0, radius: 9, eye: 2.4, aim: 0.85 };
    return {
      kind: 'orbit',
      update(nowMs, camera) {
        const ang = nowMs * 0.00011;
        camera.up.set(0, 1, 0);
        camera.position.set(
          at.x + Math.sin(ang) * at.radius,
          at.y + at.eye,
          at.z + Math.cos(ang) * at.radius,
        );
        target.set(at.x, at.y + at.aim, at.z);
        camera.lookAt(target);
      },
    };
  }

  /*
   * CENTRIPETAL, not the uniform 0.4 tension the world's own curves use, and
   * the difference matters here in a way it does not there. The map hands
   * over a line whose height was computed to clear the structures NEAR EACH
   * SAMPLE; a uniform Catmull-Rom through unevenly spaced samples overshoots
   * between them, and an overshoot is exactly the camera leaving the corridor
   * whose clearance was checked. Centripetal parameterisation is the one
   * choice that provably cannot cusp or self intersect, which is the property
   * this needs rather than the smoothness.
   */
  const curve = new THREE.CatmullRomCurve3(
    pts.map((p) => new THREE.Vector3(p.x, p.y, p.z)),
    true,
    'centripetal',
  );
  const length = Math.max(1, curve.getLength());
  const speed = spec.speed ?? 12;
  const lookAhead = Math.min(length * 0.2, spec.lookAhead ?? 16);
  const aimDrop = spec.aimDrop ?? 2.0;

  const pos = new THREE.Vector3();
  const aim = new THREE.Vector3();
  const back = new THREE.Vector3();
  let bank = 0;
  let lastMs = null;

  return {
    kind: 'path',
    length,
    update(nowMs, camera) {
      /*
       * The parameter comes from the WALL clock, not from an accumulator, so
       * a tab that was backgrounded for a minute resumes where the clock
       * says it is rather than sprinting to catch up. Nothing here reaches
       * the simulation, so there is no determinism claim to break.
       */
      const u = ((nowMs * 0.001 * speed) / length) % 1;
      curve.getPointAt(u, pos);
      curve.getPointAt((u + lookAhead / length) % 1, aim);
      /*
       * Bank, from the heading change between where the camera is and where
       * it is looking. Taken as a turn RATE by dividing by the look ahead,
       * so the same corner banks the same amount whether the shot is flown
       * fast or slow, and smoothed, because the aim point stepping between
       * spline segments would otherwise flick the horizon.
       */
      curve.getPointAt((u - lookAhead / length + 1) % 1, back);
      const h0 = Math.atan2(pos.x - back.x, pos.z - back.z);
      const h1 = Math.atan2(aim.x - pos.x, aim.z - pos.z);
      let d = h1 - h0;
      while (d > Math.PI) {
        d -= Math.PI * 2;
      }
      while (d < -Math.PI) {
        d += Math.PI * 2;
      }
      const want = Math.max(-MAX_BANK, Math.min(MAX_BANK, d * 0.9));
      /* Time constant on the wall clock, so the roll settles at the same
       * rate whatever the frame rate is. */
      const dt = lastMs == null ? 0 : Math.min(0.1, (nowMs - lastMs) * 0.001);
      lastMs = nowMs;
      bank += (want - bank) * Math.min(1, dt * 2.2);

      camera.up.set(0, 1, 0);
      camera.position.copy(pos);
      aim.y -= aimDrop;
      camera.lookAt(aim);
      camera.rotateZ(bank);
    },
  };
}
