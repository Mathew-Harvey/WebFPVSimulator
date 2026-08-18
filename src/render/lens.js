/*
 * lens.js: the camera's field of view, and the argument for it.
 *
 * One file, no imports, because three things need this number and none of
 * them should have to depend on the others to get it: the shell builds the
 * camera, the settings screen offers the list, and the shared orbit clip is
 * shot on the same lens so a course does not look like a different course in
 * the clip somebody posts of it.
 *
 * WHY THESE ARE NOT THE NUMBERS ON THE SIDE OF AN FPV CAMERA.
 *
 * The list used to be 90 to 120 with a note that real cameras run 135 to 160
 * degrees diagonal, as though the job were to type the lens's figure in. It
 * is not, and doing it is what made a regulation gate read as a distant hoop
 * and produced the report that started this: "the gates feel small".
 *
 * An FPV lens is a fisheye. A 2.1 mm lens on a 1/1.8 in sensor is close to
 * equidistant, r = f * theta, and its published 150 to 160 degrees is the
 * TOTAL COVERAGE of that projection. Three.js is rectilinear, r = f * tan
 * theta, which spends its image on the periphery: at a wide angle the edges
 * are stretched and the middle, which is the part a pilot flies a gate with,
 * is squeezed. Feeding a fisheye's coverage figure to a rectilinear camera
 * therefore matches the one property nobody looks at and gets wrong the one
 * they do.
 *
 * What has to match is the magnification at the CENTRE of the frame:
 *
 *   equidistant   half height h = f  * thetaV      so centre scale = f
 *   rectilinear   half height h = f' * tan(v / 2)  so centre scale = f'
 *   equal centres  =>  tan(v / 2) = thetaV in radians
 *
 * A 155 degree diagonal lens on a 4:3 sensor has a vertical half angle of
 * 77.5 * 3/5 = 46.5 degrees = 0.8116 rad, so tan(v/2) = 0.8116 and v = 78
 * degrees. The old default of 100 was showing the middle of the frame
 * tan(50)/tan(39.05) = 1.47 times too small.
 *
 * 85 is the default rather than 78 because the trade is real: a rectilinear
 * projection cannot have both a fisheye's centre magnification and its
 * peripheral coverage, and a racer needs to see the next gate before they are
 * pointed at it. At 85 on a 16:9 panel the view is still 117 degrees wide,
 * against 129 at the old 100, and the middle of the frame is 1.30 times
 * larger. The list brackets it so a pilot can take the honest 75 or give it
 * back for width, which is a lens choice on a real quad too.
 *
 * NOT THE SAME LEVER AS EITHER SCALE. GATE_SCALE in src/game/track.js makes a
 * gate bigger in metres and WORLD_SCALE in src/render/frame.js used to make
 * the aircraft smaller. Neither can change how big a gate looks, because a
 * bigger gate seen from proportionally further away is the same picture.
 * Apparent size is this file's, and only this file's.
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

/* Vertical field of view, degrees, for a rectilinear projection. */
export const CAMERA_FOVS = [75, 85, 95, 105];

export const CAMERA_FOV_DEFAULT = 85;

/*
 * CAMERA TILT, degrees up from the airframe.
 *
 * This is the TPU mount angle, not a look-at. Zero is flat: the lens looks
 * along the craft's nose, horizon in the middle of a level hover. 30 is a
 * typical cruise. 45 to 55 is race. The list used to stop at 40 because it
 * was a six-step menu, not because the airframe ran out of room, and a
 * ticket on 2026-08-18 reported exactly that cap.
 *
 * The FPV quaternion and the model mount share this number. Both rotate
 * about the craft's body X, so what Settings shows on the quad is what the
 * goggles see. The viewpoint stays at the mount pivot (below). Sliding it
 * out to the glass would move the picture at the default 30 as well as at
 * 55, and a range change is not a reason to move the nodal point.
 */
export const CAMERA_ANGLE_MIN = 0;
export const CAMERA_ANGLE_MAX = 55;
export const CAMERA_ANGLE_DEFAULT = 30;

export function clampCameraAngle(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return CAMERA_ANGLE_DEFAULT;
  }
  const n = Math.round(value);
  if (n < CAMERA_ANGLE_MIN) {
    return CAMERA_ANGLE_MIN;
  }
  if (n > CAMERA_ANGLE_MAX) {
    return CAMERA_ANGLE_MAX;
  }
  return n;
}

export function cameraTiltRad(degrees) {
  return (degrees * Math.PI) / 180;
}

/*
 * WHERE THE CAMERA IS BOLTED, in metres in the body frame.
 *
 * The FPV view was placed 7.75 cm in front of the centre of gravity and at
 * exactly its height, while the airframe model in herocraft.js mounts the
 * camera 8.0 cm forward and 1.8 cm UP. The forward offset is the one that
 * matters most and it was there; the vertical one was missing, and it is not
 * nothing. A roll is about the body x axis through the CG, so a camera above
 * that axis swings sideways as the craft rolls, and at a 670 deg/s roll rate
 * 1.8 cm of arm is 0.21 m/s of lateral camera motion. That is the parallax
 * that tells a pilot the lens is on a machine rather than floating at its
 * centre of mass.
 *
 * These live here rather than being typed again in main.js or herocraft.js
 * so the view and the model cannot drift apart, which is how the 7.75
 * against 8.0 happened. herocraft.js places the mount at
 * (0, CAMERA_MOUNT_UP, -CAMERA_MOUNT_FORWARD) in the Three.js craft frame.
 */
export const CAMERA_MOUNT_FORWARD = 0.080;
export const CAMERA_MOUNT_UP = 0.018;

/*
 * LENS SHAKE.
 *
 * The plant now has a vibration model, but it lives on the gyro reading,
 * because the airframe really is a rigid body and what shakes is the plate
 * the flight controller is bolted to. The camera is bolted to the same plate,
 * so the pilot should SEE it, and until now the view was perfectly steady
 * while the controller fought a spectrum of noise.
 *
 * THE BAND IS DELIBERATELY LOW. Real vibration is at the prop fundamental,
 * 130 to 430 Hz, and no display can show that: at 60 frames per second
 * anything above 30 Hz aliases. What a real FPV feed actually shows is the
 * beat between the prop frequency and the camera's own frame rate, which is
 * low frequency and looks random, plus frame flex. So the model is a 3 to 14
 * Hz band, which is what survives to the screen, rather than a pretend 200 Hz
 * that would only ever alias into hash.
 *
 * Amplitude goes as rotor speed squared, the same imbalance law the gyro
 * model uses, so it is invisible on the pad, present on the power, and it
 * grows through a punch. 0.22 degrees RMS at full throttle was about two
 * and a half pixels of swim at 1080p and 85 degrees of vertical field, and
 * a pilot flying this build called it too much, the same report as the
 * gyro injection it is paired with. 0.06 degrees is about two thirds of a
 * pixel: a hint that the motors are spinning, not a feed you fly through.
 *
 * FRAME RATE INDEPENDENCE IS NOT FREE AND ONE CONSTANT WILL NOT DO IT. Both
 * poles are exact exponentials of the frame's own dt, which handles the
 * spectrum, but the band's GAIN still moves: measured over four million
 * samples, the RMS of (fast - slow) runs 0.601 at 30 fps, 0.755 at 60, 0.846
 * at 144 and 0.871 at 240. That is a 45 percent swing, so a hardcoded divisor
 * would make the shake grow with the frame rate, which is precisely the class
 * of bug this project spends its comments on.
 *
 * It has a closed form. For an AR(1) f with coefficient a and unit variance,
 * low passed by an AR(1) s with coefficient b,
 *
 *   var(s)     = (1 - b)(1 + ab) / ((1 + b)(1 - ab))
 *   cov(f, s)  = (1 - b) / (1 - ab)
 *   var(f - s) = 1 + var(s) - 2 cov(f, s)
 *
 * which reproduces the measured 0.7552 at 60 fps exactly. It is evaluated per
 * frame, which is a dozen flops, and the shake then measures the same at any
 * rate. Nothing here reaches the simulation, so there is no determinism claim
 * to break and Math.random is fine.
 */
const SHAKE_FAST_HZ = 14;
const SHAKE_SLOW_HZ = 3;
const SHAKE_FULL_RAD = 0.06 * Math.PI / 180;

export function makeLensShake() {
  const fast = [0, 0, 0];
  const slow = [0, 0, 0];
  const out = { x: 0, y: 0, z: 0 };
  return {
    /*
     * dtMs is the frame's own wall delta. rpmFraction is mean rotor speed
     * over its full throttle value, 0 to 1. Returns a small rotation in
     * radians about the camera's own axes.
     */
    update(dtMs, rpmFraction) {
      const dt = Math.min(Math.max(dtMs, 0), 100) / 1000;
      const a = Math.exp(-dt * 2 * Math.PI * SHAKE_FAST_HZ);
      const b = Math.exp(-dt * 2 * Math.PI * SHAKE_SLOW_HZ);
      const kFast = a;
      const kSlow = b;
      const drive = Math.sqrt(1 - a * a);
      const ab = a * b;
      const varS = ((1 - b) * (1 + ab)) / ((1 + b) * (1 - ab));
      const covFS = (1 - b) / (1 - ab);
      const bandVar = 1 + varS - 2 * covFS;
      const bandRms = bandVar > 1e-6 ? Math.sqrt(bandVar) : 1;
      const r = rpmFraction > 0 ? (rpmFraction > 1 ? 1 : rpmFraction) : 0;
      const amp = (SHAKE_FULL_RAD * r * r) / bandRms;
      for (let a = 0; a < 3; a += 1) {
        /* Box-Muller would be tidier; the sum of three uniforms is close
         * enough to normal for a two pixel effect and is cheaper. */
        const n = (Math.random() + Math.random() + Math.random() - 1.5) * 2;
        fast[a] = fast[a] * kFast + drive * n;
        slow[a] = slow[a] * kSlow + (1 - kSlow) * fast[a];
      }
      /* Yaw shakes less than pitch and roll, as on the gyro: the frame is
       * stiffer about that axis. */
      out.x = (fast[0] - slow[0]) * amp;
      out.y = (fast[1] - slow[1]) * amp * 0.6;
      out.z = (fast[2] - slow[2]) * amp;
      return out;
    },
  };
}
