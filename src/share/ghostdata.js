/*
 * ghostdata.js: the ghost lap wire format, and nothing else.
 *
 * A ghost is one recorded lap: the craft's pose sampled onto a fixed time
 * grid, plus the gate split times, so another run can chase it and read a
 * gap at every gate. The pose is scene world space, the Three.js frame
 * (y up, metres) that src/game/race.js scores in, sampled downstream of
 * the one physics-to-render conversion in src/render/frame.js. That space
 * is deterministic per course, so a ghost recorded in one browser replays
 * in any other on the same course, and no consumer of this file ever
 * converts a coordinate.
 *
 * Time inside a ghost is milliseconds from its own lap start, which is the
 * timing gate crossing. Sample i sits at i * 1000 / rateHz ms. The player's
 * running lap uses the same zero, so chasing is one subtraction.
 *
 * The format is binary and versioned, deliberately shaped like the .rec
 * stick format in tests/lib/recfile.js: DataView only, little-endian,
 * environment neutral, so the same module encodes in the browser, decodes
 * in the browser, and is exercised by a Node selftest. The board stores the
 * base64 of these bytes beside the lap time; its validate.js mirrors the
 * header check, the same way it mirrors NAME_RE from pilot.js.
 *
 * Layout, little-endian:
 *
 *   bytes 0..7  magic "FPVGHST1"
 *   u32         version = 1
 *   u32         sample rate, Hz
 *   u32         sample count
 *   u32         lap duration, ms
 *   u32         split count, one per gate crossing in the lap, in order,
 *               each u32 ms from lap start; the last one is the finish
 *   u32         reserved, zero
 *   then splitCount x u32
 *   then per sample, 20 bytes:
 *     f32 x 3   position x y z, scene world metres
 *     i16 x 4   attitude quaternion x y z w, each component / 32767
 *
 * The quaternion is quantised because sixteen bits per component is far
 * below what an eye can see on a translucent craft, and it is what keeps a
 * minute of lap under 40 KB. Consecutive samples are hemisphere aligned at
 * encode time (q and -q are the same rotation), so a decoder can nlerp
 * neighbours without checking the sign.
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

export const GHOST_MAGIC = 'FPVGHST1';
export const GHOST_VERSION = 1;
/*
 * 30 Hz. A quad's position is inertia-smooth and splines cleanly from far
 * less; attitude is the fast axis, and at 30 Hz a 720 deg/s roll moves 24
 * degrees between samples, which nlerp renders as exactly the arc it was.
 * Doubling the rate doubles every ghost on the board for a difference
 * nobody has been able to see on a translucent craft two gates ahead.
 */
export const GHOST_RATE_HZ = 30;
export const GHOST_HEADER_BYTES = 32;
export const GHOST_SAMPLE_BYTES = 20;
/* Ten minutes. Longer laps post their time without a ghost: at 30 Hz this
 * cap keeps the biggest possible blob near 360 KB, inside the board's body
 * limit with the envelope on top. */
export const GHOST_MAX_MS = 600_000;
/* One split per gate crossing in a lap. No real course is near this; the
 * cap exists so a hand-built blob cannot claim a header the size of the
 * body. */
export const GHOST_MAX_SPLITS = 256;

const QUAT_SCALE = 32767;

/*
 * Encode a recorded lap. frames is { pos: Float32Array 3n, quat:
 * Float32Array 4n } on the fixed grid; splits is an array of ms, ascending,
 * finishing with the lap itself. Throws on a lap this format cannot carry,
 * because a recorder that produced one has a bug and silence would bury it.
 */
export function encodeGhost({ rateHz, durationMs, splits, count, pos, quat }) {
  if (!Number.isInteger(rateHz) || rateHz < 1 || rateHz > 240) {
    throw new Error(`ghost encode: bad rate ${rateHz}`);
  }
  if (!Number.isInteger(count) || count < 2) {
    throw new Error(`ghost encode: bad sample count ${count}`);
  }
  const dur = Math.round(durationMs);
  if (!(dur > 0) || dur > GHOST_MAX_MS) {
    throw new Error(`ghost encode: bad duration ${durationMs}`);
  }
  if (pos.length !== count * 3 || quat.length !== count * 4) {
    throw new Error('ghost encode: frame arrays disagree with count');
  }
  const splitList = (splits || []).map((s) => Math.round(s));
  if (splitList.length > GHOST_MAX_SPLITS) {
    throw new Error(`ghost encode: ${splitList.length} splits`);
  }
  const bytes = new Uint8Array(
    GHOST_HEADER_BYTES + splitList.length * 4 + count * GHOST_SAMPLE_BYTES,
  );
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < 8; i += 1) {
    bytes[i] = GHOST_MAGIC.charCodeAt(i);
  }
  view.setUint32(8, GHOST_VERSION, true);
  view.setUint32(12, rateHz, true);
  view.setUint32(16, count, true);
  view.setUint32(20, dur, true);
  view.setUint32(24, splitList.length, true);
  view.setUint32(28, 0, true);
  let at = GHOST_HEADER_BYTES;
  for (const s of splitList) {
    view.setUint32(at, Math.max(0, s), true);
    at += 4;
  }
  /* Hemisphere alignment happens here, once, against the previous sample AS
   * WRITTEN, so the stored stream is short-way by construction whatever the
   * recorder handed in. */
  let pw = 1;
  let px = 0;
  let py = 0;
  let pz = 0;
  for (let i = 0; i < count; i += 1) {
    view.setFloat32(at, pos[i * 3], true);
    view.setFloat32(at + 4, pos[i * 3 + 1], true);
    view.setFloat32(at + 8, pos[i * 3 + 2], true);
    let qx = quat[i * 4];
    let qy = quat[i * 4 + 1];
    let qz = quat[i * 4 + 2];
    let qw = quat[i * 4 + 3];
    if (qx * px + qy * py + qz * pz + qw * pw < 0) {
      qx = -qx;
      qy = -qy;
      qz = -qz;
      qw = -qw;
    }
    px = qx;
    py = qy;
    pz = qz;
    pw = qw;
    view.setInt16(at + 12, quantise(qx), true);
    view.setInt16(at + 14, quantise(qy), true);
    view.setInt16(at + 16, quantise(qz), true);
    view.setInt16(at + 18, quantise(qw), true);
    at += GHOST_SAMPLE_BYTES;
  }
  return bytes;
}

function quantise(v) {
  const q = Math.round(Math.max(-1, Math.min(1, v)) * QUAT_SCALE);
  return q;
}

/*
 * Why the ghost cannot be decoded, as a sentence, or null when it can.
 * Split out of decodeGhost so a consumer that only needs to judge a blob,
 * which is what the board does before storing one, does not build the
 * arrays.
 */
export function inspectGhostBytes(bytes) {
  if (!(bytes instanceof Uint8Array)) {
    return 'not a byte array';
  }
  if (bytes.length < GHOST_HEADER_BYTES) {
    return 'shorter than the header';
  }
  for (let i = 0; i < 8; i += 1) {
    if (bytes[i] !== GHOST_MAGIC.charCodeAt(i)) {
      return 'wrong magic';
    }
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint32(8, true);
  if (version !== GHOST_VERSION) {
    return `version ${version} is not ${GHOST_VERSION}`;
  }
  const rateHz = view.getUint32(12, true);
  if (rateHz < 1 || rateHz > 240) {
    return `rate ${rateHz} Hz`;
  }
  const count = view.getUint32(16, true);
  if (count < 2) {
    return `${count} samples`;
  }
  const durationMs = view.getUint32(20, true);
  if (durationMs < 1 || durationMs > GHOST_MAX_MS) {
    return `duration ${durationMs} ms`;
  }
  const splitCount = view.getUint32(24, true);
  if (splitCount > GHOST_MAX_SPLITS) {
    return `${splitCount} splits`;
  }
  const want = GHOST_HEADER_BYTES + splitCount * 4 + count * GHOST_SAMPLE_BYTES;
  if (bytes.length !== want) {
    return `${bytes.length} bytes for a header that describes ${want}`;
  }
  /* The grid has to actually cover the lap: the last sample sits at or past
   * the duration, within one grid step, or sampling near the finish reads
   * held air. */
  const lastMs = ((count - 1) * 1000) / rateHz;
  const stepMs = 1000 / rateHz;
  if (lastMs + stepMs < durationMs) {
    return 'grid ends before the lap does';
  }
  return null;
}

export function decodeGhost(bytes) {
  const bad = inspectGhostBytes(bytes);
  if (bad) {
    throw new Error(`ghost decode: ${bad}`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const rateHz = view.getUint32(12, true);
  const count = view.getUint32(16, true);
  const durationMs = view.getUint32(20, true);
  const splitCount = view.getUint32(24, true);
  const splits = new Array(splitCount);
  let at = GHOST_HEADER_BYTES;
  for (let i = 0; i < splitCount; i += 1) {
    splits[i] = view.getUint32(at, true);
    at += 4;
  }
  const pos = new Float32Array(count * 3);
  const quat = new Float32Array(count * 4);
  for (let i = 0; i < count; i += 1) {
    pos[i * 3] = view.getFloat32(at, true);
    pos[i * 3 + 1] = view.getFloat32(at + 4, true);
    pos[i * 3 + 2] = view.getFloat32(at + 8, true);
    let qx = view.getInt16(at + 12, true) / QUAT_SCALE;
    let qy = view.getInt16(at + 14, true) / QUAT_SCALE;
    let qz = view.getInt16(at + 16, true) / QUAT_SCALE;
    let qw = view.getInt16(at + 18, true) / QUAT_SCALE;
    /* Quantisation shortens the vector a hair; renormalise so consumers can
     * treat every stored quaternion as unit. A zero quaternion can only come
     * from a hand-built blob, and identity is the honest reading of it. */
    const n = Math.sqrt(qx * qx + qy * qy + qz * qz + qw * qw);
    if (n > 1e-6) {
      qx /= n;
      qy /= n;
      qz /= n;
      qw /= n;
    } else {
      qx = 0;
      qy = 0;
      qz = 0;
      qw = 1;
    }
    quat[i * 4] = qx;
    quat[i * 4 + 1] = qy;
    quat[i * 4 + 2] = qz;
    quat[i * 4 + 3] = qw;
    at += GHOST_SAMPLE_BYTES;
  }
  return { rateHz, durationMs, count, splits, pos, quat };
}

/*
 * Base64 for the wire. btoa exists in every browser and in Node 16+, but it
 * takes a binary STRING, so the bytes go through chunks of fromCharCode;
 * one chunk per 32 KB keeps the argument list under engine limits.
 */
export function ghostToBase64(bytes) {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

export function ghostFromBase64(text) {
  const bin = atob(text);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}
