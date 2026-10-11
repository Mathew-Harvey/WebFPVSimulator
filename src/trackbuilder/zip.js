/*
 * zip.js: a zip writer, so a track can leave the builder as one file.
 *
 * WHY HAND ROLLED, AND WHY IT STORES. The bundle holds a PNG and a GIF, which
 * are compressed already, and a few text files that are small, so deflating
 * would buy a few kilobytes and cost a dependency or the browser's
 * CompressionStream, which is not everywhere a weak laptop's browser is. A zip
 * entry may simply be stored, and every unzip tool and every zip library reads
 * one. What is left is a CRC and two headers, which is the same size of job
 * gif.js did and has the same precedent: scripts/icons.js writes PNG on node's
 * own zlib rather than buying an image library.
 *
 * WHY IT IS DETERMINISTIC. The timestamp is the caller's, never the clock's,
 * and the entries go in the order they are given, so the same track makes the
 * same bytes and a bundle can be diffed or hashed.
 *
 * LIMITS, said once. Plain zip, not zip64: no entry and no archive over 4 GB
 * and no more than 65535 entries, which is a thousand times what a bundle holds
 * and is refused with a sentence if it ever were not. Names are UTF-8, flagged.
 *
 * No DOM and no node API, so the builder and the self test run the same code.
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

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[n] = c >>> 0;
  }
  return t;
})();

/* The CRC-32 every zip reader checks an entry against. */
export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

const utf8 = new TextEncoder();

/* A zip's date and time are two 16 bit DOS words, local time and no zone, with
 * a two second step. A date before 1980 cannot be said, so it is clamped. */
function dosStamp(date) {
  const d = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date(Date.UTC(1980, 0, 1));
  const year = Math.max(1980, d.getUTCFullYear());
  return {
    time: (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | (d.getUTCSeconds() >> 1),
    date: ((year - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate(),
  };
}

/*
 * entries is [{ name, data }], data a Uint8Array or a string (written as
 * UTF-8). Names are paths with forward slashes and no leading one. `date` is
 * the one stamp every entry carries. Returns the archive as a Uint8Array.
 */
export function zipStore(entries, { date = null } = {}) {
  if (entries.length > 0xffff) {
    throw new Error('A zip made here holds at most 65535 files.');
  }
  const stamp = dosStamp(date);
  const seen = new Set();
  const prepared = entries.map((e) => {
    const name = String(e.name);
    if (!name || name.startsWith('/') || name.includes('\\') || name.split('/').includes('..')) {
      throw new Error(`"${name}" is not a path that is safe to put in a zip.`);
    }
    if (seen.has(name)) {
      throw new Error(`"${name}" is in the zip twice.`);
    }
    seen.add(name);
    const data = typeof e.data === 'string' ? utf8.encode(e.data) : e.data;
    return { name: utf8.encode(name), data, crc: crc32(data) };
  });

  let size = 22;
  for (const p of prepared) {
    size += 30 + p.name.length + p.data.length + 46 + p.name.length;
  }
  if (size > 0xffffffff) {
    throw new Error('This bundle is over 4 GB, which a plain zip cannot hold.');
  }
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  let at = 0;
  const u16 = (v) => { view.setUint16(at, v, true); at += 2; };
  const u32 = (v) => { view.setUint32(at, v, true); at += 4; };
  const put = (bytes) => { out.set(bytes, at); at += bytes.length; };

  const offsets = [];
  for (const p of prepared) {
    offsets.push(at);
    u32(0x04034b50);
    u16(20); /* version needed */
    u16(0x0800); /* general flags: names are UTF-8 */
    u16(0); /* stored */
    u16(stamp.time);
    u16(stamp.date);
    u32(p.crc);
    u32(p.data.length);
    u32(p.data.length);
    u16(p.name.length);
    u16(0);
    put(p.name);
    put(p.data);
  }
  const centralAt = at;
  prepared.forEach((p, i) => {
    u32(0x02014b50);
    u16(20); /* made by */
    u16(20); /* version needed */
    u16(0x0800);
    u16(0);
    u16(stamp.time);
    u16(stamp.date);
    u32(p.crc);
    u32(p.data.length);
    u32(p.data.length);
    u16(p.name.length);
    u16(0); /* extra */
    u16(0); /* comment */
    u16(0); /* disk */
    u16(0); /* internal attributes */
    u32(0); /* external attributes */
    u32(offsets[i]);
    put(p.name);
  });
  const centralSize = at - centralAt;
  u32(0x06054b50);
  u16(0);
  u16(0);
  u16(prepared.length);
  u16(prepared.length);
  u32(centralSize);
  u32(centralAt);
  u16(0);
  return out;
}
