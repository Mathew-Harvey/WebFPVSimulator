/*
 * trk.mjs: reading a Velocidrone .trk. Shared by convert.mjs and inspect.mjs
 * so there is exactly one place that knows the file's shape.
 *
 * WHAT THE FILE IS. AES-128-ECB over a fixed key, base64 wrapped, and inside
 * it five newline separated fields:
 *
 *   sceneId \n trackName \n valueJson \n type \n onlineId
 *
 * valueJson holds two arrays. `gates` is the FLYING ORDER: every entry is a
 * checkpoint and its `gate` field is its index in the lap, so gate 0 is the
 * start and finish line. `barriers` is scenery, which is where turn flags,
 * cones, the start grid and the dive gate hoops live. Both were confirmed
 * against dutchdronesquad/trackdraw's exporter rather than guessed.
 *
 * COORDINATES. Unity: left handed, Y up, metres times 100. So pos is
 * [east, up, north]. A rotation about +Y turns +Z toward +X, which is
 * CLOCKWISE seen from above, the opposite sense to this project's document
 * frame. That single fact is what docYaw() exists to get right.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { createDecipheriv } from 'node:crypto';

const TRK_KEY = Buffer.from('VelocidrrdicoleV', 'utf8');

export function decryptTrk(text) {
  const buf = Buffer.from(String(text).trim(), 'base64');
  const dec = createDecipheriv('aes-128-ecb', TRK_KEY, null);
  return Buffer.concat([dec.update(buf), dec.final()]).toString('utf8');
}

export function parseTrk(text) {
  const plain = decryptTrk(text);
  const lines = plain.split(/\n/);
  const at = lines.findIndex((l) => l.trim().startsWith('{'));
  if (at < 0) {
    throw new Error('no track JSON inside that .trk');
  }
  return {
    sceneId: Number(lines[0]),
    name: String(lines[1] || 'Untitled').trim(),
    value: JSON.parse(lines[at]),
    type: Number(lines[at + 1]),
    onlineId: Number(lines[at + 2]),
  };
}

/* Position in metres, named for what each axis is rather than for its index. */
export function metres(pos) {
  return {
    x: Number(pos[0]) / 100,
    height: Number(pos[1]) / 100,
    z: Number(pos[2]) / 100,
  };
}

export function scaleOf(trans) {
  const s = trans?.scale || [100, 100, 100];
  return {
    x: Math.abs(Number(s[0]) || 100) / 100,
    y: Math.abs(Number(s[1]) || 100) / 100,
    z: Math.abs(Number(s[2]) || 100) / 100,
  };
}

function quat(rot) {
  if (!Array.isArray(rot) || rot.length < 4) {
    return { w: 1, x: 0, y: 0, z: 0 };
  }
  return {
    w: Number(rot[0]) / 1000,
    x: Number(rot[1]) / 1000,
    y: Number(rot[2]) / 1000,
    z: Number(rot[3]) / 1000,
  };
}

/*
 * Full orientation, not just a heading. A Velocidrone checkpoint is authored
 * lying flat and stood up with a quarter turn about X, so reading only the
 * yaw term of the quaternion loses the thing that says whether an obstacle is
 * vertical, tilted or a dive gate.
 *
 * Returned angles are Unity's: yaw about +Y clockwise from +Z, pitch about
 * +X, roll about +Z.
 */
export function eulerFromRot(rot) {
  const { w, x, y, z } = quat(rot);
  const sinp = 2 * (w * x - y * z);
  const pitch = Math.abs(sinp) >= 1 ? Math.sign(sinp) * (Math.PI / 2) : Math.asin(sinp);
  return {
    pitch,
    yaw: Math.atan2(2 * (w * y + x * z), 1 - 2 * (x * x + y * y)),
    roll: Math.atan2(2 * (w * z + x * y), 1 - 2 * (x * x + z * z)),
  };
}

/*
 * The object's local axes in world space. This is the honest way to ask
 * "which way does this face", because a checkpoint that has been stood up
 * and then rolled has a yaw term that means nothing on its own.
 */
export function axesFromRot(rot) {
  const { w, x, y, z } = quat(rot);
  const n = Math.hypot(w, x, y, z) || 1;
  const [qw, qx, qy, qz] = [w / n, x / n, y / n, z / n];
  return {
    right: {
      x: 1 - 2 * (qy * qy + qz * qz),
      y: 2 * (qx * qy + qz * qw),
      z: 2 * (qx * qz - qy * qw),
    },
    up: {
      x: 2 * (qx * qy - qz * qw),
      y: 1 - 2 * (qx * qx + qz * qz),
      z: 2 * (qy * qz + qx * qw),
    },
    forward: {
      x: 2 * (qx * qz + qy * qw),
      y: 2 * (qy * qz - qx * qw),
      z: 1 - 2 * (qx * qx + qy * qy),
    },
  };
}

/*
 * Unity heading to document yaw.
 *
 * The document is right handed with +X across the field's width, +Y across
 * its depth and yaw measured counter clockwise from +X. The import maps
 * Unity x to document x and Unity z to document y, so a Unity forward vector
 * (sin t, cos t) lands in the document as (sin t, cos t) and its document
 * angle is atan2(cos t, sin t), which is pi/2 MINUS t.
 *
 * Writing pi/2 plus t instead mirrors every heading about the north axis. It
 * is invisible on a track whose gates are all square to the field, because
 * the two agree whenever t is a multiple of a quarter turn, and it is wrong
 * by twice the angle everywhere else.
 */
export function docYaw(unityYaw) {
  return Math.PI / 2 - unityYaw;
}

/*
 * Prefab ids seen in the tracks under tracks/, with what each one is.
 *
 * PROVENANCE. Velocidrone publishes no prefab table. The six marked
 * "trackdraw" are read off dutchdronesquad/trackdraw's exporter, which
 * writes real files the simulator loads, so they are as good as documented.
 * The rest are inferred from how they behave in these files: what they are
 * scaled to, whether they carry a checkpoint, where they sit relative to the
 * floor, and which physical object they coincide with. Each inference is
 * named so a wrong one can be argued with.
 */
export const PREFAB_NAMES = {
  /* trackdraw, verbatim. */
  42: 'cone',
  90: 'start grid',
  150: 'gate',
  170: 'flag',
  336: 'perimeter barrier',
  619: 'dive gate',

  /* Inferred. See the notes in convert.mjs next to the role tables. */
  14: 'gate',
  86: 'gate',
  88: 'checkpoint',
  98: 'dive gate',
  108: 'gate',
  151: 'gate',
  169: 'flag',
  218: 'gate',
  279: 'gate',
  285: 'gate',
  286: 'gate',
  740: 'flag',
  766: 'gate',
  767: 'gate',
  768: 'gate',
  769: 'flag',
  773: 'gate',
  774: 'gate',
  792: 'gate',
  824: 'cone',
};
