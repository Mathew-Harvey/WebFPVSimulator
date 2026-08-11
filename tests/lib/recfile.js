/*
 * recfile.js: the .rec recorded stick input format.
 *
 * Environment-neutral module, runs unchanged in Node and the browser. Uses
 * DataView only, no platform APIs.
 *
 * Format, all little-endian:
 *   bytes 0..7    magic, ASCII "FPVREC01"
 *   u32           version, 1
 *   u32           channel count, 4
 *   u32           sample rate, Hz
 *   u32           sample count
 *   u32 x 2       reserved, zero
 *   then per sample, 20 bytes:
 *     u32         timestamp, microseconds from stream start
 *     f32 x 4     roll, pitch, yaw, throttle
 *
 * Channel conventions match sim_abi.h: roll, pitch, yaw in -1..+1 with
 * +roll a right roll command, +pitch nose up, +yaw nose right; throttle in
 * 0..1.
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

export const REC_MAGIC = 'FPVREC01';
export const REC_VERSION = 1;
export const REC_CHANNELS = 4;
export const REC_HEADER_BYTES = 32;
export const REC_SAMPLE_BYTES = 20;

export function encodeRec(rateHz, samples) {
  const bytes = new Uint8Array(REC_HEADER_BYTES + samples.length * REC_SAMPLE_BYTES);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < REC_MAGIC.length; i += 1) {
    bytes[i] = REC_MAGIC.charCodeAt(i);
  }
  view.setUint32(8, REC_VERSION, true);
  view.setUint32(12, REC_CHANNELS, true);
  view.setUint32(16, rateHz, true);
  view.setUint32(20, samples.length, true);
  view.setUint32(24, 0, true);
  view.setUint32(28, 0, true);
  let off = REC_HEADER_BYTES;
  for (const s of samples) {
    view.setUint32(off, s.tUs, true);
    view.setFloat32(off + 4, s.roll, true);
    view.setFloat32(off + 8, s.pitch, true);
    view.setFloat32(off + 12, s.yaw, true);
    view.setFloat32(off + 16, s.throttle, true);
    off += REC_SAMPLE_BYTES;
  }
  return bytes;
}

export function decodeRec(bytes) {
  if (bytes.length < REC_HEADER_BYTES) {
    throw new Error('rec: file shorter than header');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let magic = '';
  for (let i = 0; i < REC_MAGIC.length; i += 1) {
    magic += String.fromCharCode(bytes[i]);
  }
  if (magic !== REC_MAGIC) {
    throw new Error(`rec: bad magic "${magic}"`);
  }
  const version = view.getUint32(8, true);
  if (version !== REC_VERSION) {
    throw new Error(`rec: unsupported version ${version}`);
  }
  const channels = view.getUint32(12, true);
  if (channels !== REC_CHANNELS) {
    throw new Error(`rec: expected ${REC_CHANNELS} channels, got ${channels}`);
  }
  const rateHz = view.getUint32(16, true);
  if (rateHz < 1 || rateHz > 1000000) {
    throw new Error(`rec: implausible sample rate ${rateHz} Hz`);
  }
  const count = view.getUint32(20, true);
  const expected = REC_HEADER_BYTES + count * REC_SAMPLE_BYTES;
  if (bytes.length !== expected) {
    throw new Error(`rec: expected ${expected} bytes for ${count} samples, got ${bytes.length}`);
  }
  const samples = new Array(count);
  let off = REC_HEADER_BYTES;
  for (let i = 0; i < count; i += 1) {
    samples[i] = {
      tUs: view.getUint32(off, true),
      roll: view.getFloat32(off + 4, true),
      pitch: view.getFloat32(off + 8, true),
      yaw: view.getFloat32(off + 12, true),
      throttle: view.getFloat32(off + 16, true),
    };
    off += REC_SAMPLE_BYTES;
  }
  return { version, rateHz, count, samples };
}
