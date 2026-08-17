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
 * The orbit is also what a designed course asks for. Flying its racing line
 * is the wrong shot on a compact layout: a single triple stack's line is a
 * few metres of wrap, and the camera sprints that knot in a couple of
 * seconds. The map hands over a point, a radius and an eye height framed
 * from the course's own bounds, and this file circles it. Empty custom
 * courses keep the old nine metre spawn circle, because circling nothing is
 * a better shot of an empty pitch than a flight round nothing.
 *
 * TITLE HERO. The camera stays ON that cleared line. The session airframe
 * is posed a couple of metres ahead on the same line, slightly off to the
 * side so the X reads, and the overlay then nudges the frame so the quad
 * sits in the open sky next to the menu rather than under the type. Sticks
 * add a little extra attitude; they do not fly the line. Nothing here is a
 * second scene graph. When Fly is pressed the shell stops calling update,
 * seats the craft at spawn, and the same world is the flight world.
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

/* Radians per millisecond. A full circle is about 57 s, slow enough that
 * the title shot reads as a look rather than as a spin. Thumbnails time
 * scale this so one revolution fits in the clip. */
const ORBIT_RAD_PER_MS = 0.00011;
const ORBIT_PERIOD_MS = (Math.PI * 2) / ORBIT_RAD_PER_MS;

/* Cinematic fov, not the FPV lens. 100 degrees made the airframe a speck
 * and the title read as a landscape wallpaper. */
const ATTRACT_FOV = 44;
const ATTRACT_FOV_NARROW = 50;

/* Metres along the cleared line from the camera to the airframe. Close
 * enough that a 5 inch X fills the open side of the title, far enough that
 * the world behind it still reads. */
const CRAFT_LEAD = 1.62;
/* Metres to the camera's right, so the shot is a three quarter and not a
 * dead chase that hides the arms. */
const CRAFT_SIDE = 0.34;

function applyFov(camera, overlay) {
  const narrow = Boolean(overlay) && camera.aspect < 0.95;
  const fov = narrow ? ATTRACT_FOV_NARROW : ATTRACT_FOV;
  if (Math.abs(camera.fov - fov) > 0.05) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
}

/*
 * Slide the subject into the hole the overlay leaves. Wide: the menu owns
 * the left third, so the camera steps left and the quad sits on the right.
 * Narrow: the menu owns the bottom, so the camera steps down and the quad
 * sits in the upper sky. Applied AFTER lookAt, and lookAt is not called
 * again, or the shift would cancel.
 */
function frameOverlay(camera, lookAt, overlay) {
  if (!overlay) {
    return;
  }
  const narrow = camera.aspect < 0.95;
  const dist = Math.max(0.8, camera.position.distanceTo(lookAt));
  camera.translateX((narrow ? 0 : -0.17) * dist);
  camera.translateY((narrow ? -0.16 : -0.05) * dist);
}

/*
 * A curve parameter, wrapped into [0, 1).
 *
 * JAVASCRIPT'S % KEEPS THE SIGN OF THE DIVIDEND, so `-0.001 % 1` is
 * -0.001 and not 0.999. Every parameter below is a position along a CLOSED
 * loop, where those two are the same place, and the raw operator was being
 * trusted to say so. It does not, and three.js does not defend itself:
 * getPointAt hands a negative u through getUtoTmapping to getPoint, which
 * computes a negative index and reads points[-1], and the failure surfaces
 * as `Cannot read properties of undefined (reading 'distanceToSquared')`
 * once per animation frame.
 *
 * That is not hypothetical. The thumbnail recorder's first frame delta can
 * be negative (see the floor in src/share/orbit.js), so the camera clock
 * started below zero and the very first sample threw. The recorder is an
 * offscreen iframe, so the clip still came out, of a camera that never
 * moved, with nobody watching the console.
 *
 * Fixing the recorder's clock is necessary and is done. This is the other
 * half: a camera that is asked for a position on a loop should answer for
 * any input, not only for inputs that happen to be positive. One of the
 * five call sites below already hand patched its own sign by adding 1
 * before the modulo, which is the same bug noticed once and fixed in one
 * place.
 */
function wrap01(x) {
  if (!Number.isFinite(x)) {
    return 0;
  }
  return ((x % 1) + 1) % 1;
}

function poseCraft(craft, from, toward, bank, flourish) {
  if (!craft) {
    return;
  }
  craft.visible = true;
  craft.position.copy(from);
  craft.up.set(0, 1, 0);
  craft.lookAt(toward);
  let roll = flourish ? flourish.roll : 0;
  let pitch = flourish ? flourish.pitch : 0;
  let yaw = flourish ? flourish.yaw : 0;
  if (Math.abs(roll) < 0.14) {
    roll = 0;
  }
  if (Math.abs(pitch) < 0.14) {
    pitch = 0;
  }
  if (Math.abs(yaw) < 0.14) {
    yaw = 0;
  }
  craft.rotateZ(bank + roll * 0.28);
  craft.rotateX(pitch * 0.18);
  craft.rotateY(-yaw * 0.22);
}

export function makeAttractCamera(view) {
  const spec = view && view.attract ? view.attract : null;
  const pts = spec && Array.isArray(spec.path) ? spec.path : null;

  if (!pts || pts.length < 4) {
    /* The orbit, kept verbatim so a map without a line behaves exactly as
     * every map did before there were lines. The airframe, when asked for,
     * hovers at the look-at so the same circle is a product shot of the
     * layout rather than an empty spin. */
    const target = new THREE.Vector3();
    const craftPos = new THREE.Vector3();
    const toward = new THREE.Vector3();
    const at = spec ?? { x: 0, y: 0, z: 0, radius: 9, eye: 2.4, aim: 0.85 };
    return {
      kind: 'orbit',
      periodMs: ORBIT_PERIOD_MS,
      update(nowMs, camera, opts) {
        const overlay = Boolean(opts && opts.overlay);
        const craft = opts && opts.craft;
        const ang = nowMs * ORBIT_RAD_PER_MS;
        applyFov(camera, overlay);
        camera.up.set(0, 1, 0);
        camera.position.set(
          at.x + Math.sin(ang) * at.radius,
          at.y + at.eye,
          at.z + Math.cos(ang) * at.radius,
        );
        craftPos.set(at.x, at.y + Math.min(1.15, at.eye * 0.42), at.z);
        toward.set(
          craftPos.x - Math.cos(ang),
          craftPos.y,
          craftPos.z + Math.sin(ang),
        );
        poseCraft(craft, craftPos, toward, 0, opts);
        if (craft) {
          target.copy(craftPos);
          target.y += 0.04;
        } else {
          target.set(at.x, at.y + at.aim, at.z);
        }
        camera.lookAt(target);
        frameOverlay(camera, target, overlay);
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
  const lead = Math.min(lookAhead * 0.45, CRAFT_LEAD);

  const pos = new THREE.Vector3();
  const aim = new THREE.Vector3();
  const back = new THREE.Vector3();
  const craftPos = new THREE.Vector3();
  const craftAim = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  const right = new THREE.Vector3();
  const worldUp = new THREE.Vector3(0, 1, 0);
  let bank = 0;
  let lastMs = null;

  return {
    kind: 'path',
    length,
    periodMs: (length / speed) * 1000,
    update(nowMs, camera, opts) {
      /*
       * The parameter comes from the WALL clock, not from an accumulator, so
       * a tab that was backgrounded for a minute resumes where the clock
       * says it is rather than sprinting to catch up. Nothing here reaches
       * the simulation, so there is no determinism claim to break.
       */
      const overlay = Boolean(opts && opts.overlay);
      const craft = opts && opts.craft;
      const u = wrap01((nowMs * 0.001 * speed) / length);
      curve.getPointAt(u, pos);
      curve.getPointAt(wrap01(u + lookAhead / length), aim);
      curve.getPointAt(wrap01(u + lead / length), craftPos);
      curve.getPointAt(wrap01(u + (lead + lookAhead * 0.35) / length), craftAim);
      /*
       * Bank, from the heading change between where the camera is and where
       * it is looking. Taken as a turn RATE by dividing by the look ahead,
       * so the same corner banks the same amount whether the shot is flown
       * fast or slow, and smoothed, because the aim point stepping between
       * spline segments would otherwise flick the horizon.
       */
      curve.getPointAt(wrap01(u - lookAhead / length), back);
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
      /* Time constant on the clock the caller passes. Capture rewinds that
       * clock to the start of a loop; treat a backwards step as a new take
       * rather than a huge negative dt that yanks the bank. */
      const dt = lastMs == null || nowMs < lastMs
        ? 0
        : Math.min(0.1, (nowMs - lastMs) * 0.001);
      lastMs = nowMs;
      bank += (want - bank) * Math.min(1, dt * 2.2);

      fwd.copy(aim).sub(pos);
      fwd.y = 0;
      if (fwd.lengthSq() < 1e-8) {
        fwd.set(0, 0, 1);
      } else {
        fwd.normalize();
      }
      right.crossVectors(fwd, worldUp);
      if (right.lengthSq() < 1e-8) {
        right.set(1, 0, 0);
      } else {
        right.normalize();
      }
      craftPos.addScaledVector(right, CRAFT_SIDE);

      applyFov(camera, overlay);
      camera.up.set(0, 1, 0);
      camera.position.copy(pos);
      aim.y -= aimDrop;
      camera.lookAt(aim);
      camera.rotateZ(bank);
      poseCraft(craft, craftPos, craftAim, bank, opts);
      frameOverlay(camera, aim, overlay);
    },
  };
}
