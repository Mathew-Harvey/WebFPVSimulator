/*
 * pose.js: the live pose wire format, and nothing else.
 *
 * A sibling of src/share/ghostdata.js. A ghost is a whole lap sampled onto
 * a grid; a live pose is one sample, sent the moment it is taken, to a room
 * of other pilots. Like a ghost it is scene world space, the Three.js frame
 * (y up, metres), read downstream of the one physics to render conversion
 * in src/render/frame.js, so no consumer of this file ever converts a
 * coordinate and nothing here is on the physics path.
 *
 * THE BOARD'S HALF IS FIXED. src/rooms.js in the leaderboard's repository
 * reads the kind byte and the three position numbers, to choose who is
 * near whom, and passes every other byte through untouched. So everything
 * after the position is this file's to define, and a new flag needs no
 * change on the board.
 *
 * Up, client to board, 16 bytes, little endian:
 *
 *   u8   kind = 1
 *   u8   flags
 *          bits 0 and 1  which quaternion component was dropped (x y z w)
 *          bit 2         props spinning, so the discs are drawn
 *          bits 3 and 4  reset count, modulo four: it moves when the craft
 *                        is put somewhere it did not fly to, so a far
 *                        pilot's teleport is never smoothed into a sweep
 *                        through the scenery, even when the one pose that
 *                        said so was replaced before the board sent it
 *          bits 5 to 7   zero, kept for later
 *   u16  sender clock, ms, wrapping every 65.536 s
 *   i16  x, y, z in pose units (SCALES: 50, 100 or 200 a metre)
 *   i16  three of the attitude quaternion's four components, the largest
 *        dropped and made positive, each times 32767 times root two
 *
 * Down, board to client, one frame per relay tick: u8 kind = 1, then per
 * pilot u8 id and the 15 bytes that pilot sent after its kind byte.
 *
 * SMALLEST THREE. A unit quaternion's largest component is at least a half
 * and the other three lie within plus or minus one over root two, so
 * dropping the largest and scaling the rest to fill sixteen bits gives
 * about 0.0025 degrees of grain, against 0.0035 for four plain components,
 * in six bytes instead of eight. The dropped one is rebuilt from the unit
 * length. q and minus q are the same rotation, which is why it can always
 * be sent positive.
 *
 * Plain arrays and DataView, no three.js, so scripts/net-selftest.js drives
 * it in Node exactly as the browser does.
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

export const KIND_POSE = 1;
export const POSE_UP_BYTES = 16;
export const POSE_ENTRY_BYTES = 16;
/* The board's list, in the same order: src/rooms.js SCALES. */
export const SCALES = Object.freeze([50, 100, 200]);

export const FLAG_SPIN = 0x04;
const DROP_MASK = 0x03;
const RESET_SHIFT = 3;
const RESET_MASK = 0x18;

const I16_MAX = 32767;
const QUAT_SCALE = I16_MAX * Math.SQRT2;

function clampI16(v) {
  const r = Math.round(v);
  return r > I16_MAX ? I16_MAX : (r < -I16_MAX ? -I16_MAX : r);
}

/*
 * The flags byte from its parts. resets is any whole number; only its
 * last two bits travel.
 */
export function poseFlags(spinning = false, resets = 0) {
  return (spinning ? FLAG_SPIN : 0) | ((resets & 3) << RESET_SHIFT);
}

/*
 * One pose into out, a Uint8Array of POSE_UP_BYTES. units is the room's
 * pose units per metre. A position past the reach of sixteen bits is held
 * at the edge rather than wrapped, so a pilot who flies off the map is seen
 * at its edge and not on the far side of it.
 */
let upView = null;
export function encodePose(out, units, clockMs, flags, px, py, pz, qx, qy, qz, qw) {
  /* One view for the buffer it was last given, which is the session's one
   * scratch buffer, so a pose a frame allocates nothing. */
  if (!upView || upView.buffer !== out.buffer || upView.byteOffset !== out.byteOffset) {
    upView = new DataView(out.buffer, out.byteOffset, POSE_UP_BYTES);
  }
  const view = upView;
  /* The largest component, by magnitude, is the one rebuilt on arrival. */
  const ax = Math.abs(qx);
  const ay = Math.abs(qy);
  const az = Math.abs(qz);
  const aw = Math.abs(qw);
  let drop = 3;
  let big = aw;
  if (ax > big) { drop = 0; big = ax; }
  if (ay > big) { drop = 1; big = ay; }
  if (az > big) { drop = 2; big = az; }
  const n = Math.sqrt(qx * qx + qy * qy + qz * qz + qw * qw) || 1;
  const big0 = drop === 0 ? qx : (drop === 1 ? qy : (drop === 2 ? qz : qw));
  const sign = big0 < 0 ? -1 / n : 1 / n;
  out[0] = KIND_POSE;
  out[1] = (flags & ~DROP_MASK & 0xff) | drop;
  view.setUint16(2, clockMs & 0xffff, true);
  view.setInt16(4, clampI16(px * units), true);
  view.setInt16(6, clampI16(py * units), true);
  view.setInt16(8, clampI16(pz * units), true);
  /* The three that are left, in x y z w order. */
  const a = drop === 0 ? qy : qx;
  const b = drop <= 1 ? qz : qy;
  const c = drop <= 2 ? qw : qz;
  view.setInt16(10, clampI16(a * sign * QUAT_SCALE), true);
  view.setInt16(12, clampI16(b * sign * QUAT_SCALE), true);
  view.setInt16(14, clampI16(c * sign * QUAT_SCALE), true);
  return out;
}

/*
 * The 15 bytes after a kind or an id, at offset `at` of view, into out =
 * { flags, clock, spinning, resets, px, py, pz, qx, qy, qz, qw }.
 */
export function decodePoseAt(view, at, units, out) {
  const flags = view.getUint8(at);
  const drop = flags & DROP_MASK;
  out.flags = flags;
  out.spinning = (flags & FLAG_SPIN) !== 0;
  out.resets = (flags & RESET_MASK) >> RESET_SHIFT;
  out.clock = view.getUint16(at + 1, true);
  out.px = view.getInt16(at + 3, true) / units;
  out.py = view.getInt16(at + 5, true) / units;
  out.pz = view.getInt16(at + 7, true) / units;
  const a = view.getInt16(at + 9, true) / QUAT_SCALE;
  const b = view.getInt16(at + 11, true) / QUAT_SCALE;
  const c = view.getInt16(at + 13, true) / QUAT_SCALE;
  const d = Math.sqrt(Math.max(0, 1 - a * a - b * b - c * c));
  if (drop === 0) {
    out.qx = d; out.qy = a; out.qz = b; out.qw = c;
  } else if (drop === 1) {
    out.qx = a; out.qy = d; out.qz = b; out.qw = c;
  } else if (drop === 2) {
    out.qx = a; out.qy = b; out.qz = d; out.qw = c;
  } else {
    out.qx = a; out.qy = b; out.qz = c; out.qw = d;
  }
  return out;
}

/*
 * One frame from the board: calls onPose(id, pose) for each pilot in it,
 * with one scratch object reused for every call, so a caller copies what it
 * keeps. Returns the number of poses, or -1 for a frame that is not one.
 */
const scratch = {
  flags: 0, clock: 0, spinning: false, resets: 0, px: 0, py: 0, pz: 0, qx: 0, qy: 0, qz: 0, qw: 1,
};
export function decodeFrame(bytes, units, onPose) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (u8.length < 1 || u8[0] !== KIND_POSE || (u8.length - 1) % POSE_ENTRY_BYTES !== 0) {
    return -1;
  }
  const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const n = (u8.length - 1) / POSE_ENTRY_BYTES;
  for (let i = 0; i < n; i += 1) {
    const at = 1 + i * POSE_ENTRY_BYTES;
    onPose(u8[at], decodePoseAt(view, at + 1, units, scratch));
  }
  return n;
}
