/*
 * sharelink.js: a track that travels in an address.
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

import { normalize, toPlain } from './model.js';

/* A document out of some text, or null: valid JSON that is an object, and
 * nothing else. normalize accepts anything at all, so without this the text
 * "123" would open as an empty track. */
function readDocument(text) {
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }
  return normalize(parsed).doc;
}

/*
 * The document a ?track= link carries, or null.
 *
 * DECODED ONCE. URLSearchParams has already undone the percent escapes by the
 * time get() returns, so the value is the JSON itself. Decoding it a second
 * time threw on a name with a percent sign in it, so the link silently opened
 * nothing, and quietly rewrote a name that only looked like an escape ("a%41b"
 * became "aAb"). A link somebody encoded twice by hand (a chat app will do it)
 * is not JSON when read the first time, and is tried once more decoded.
 */
export function docFromQuery(search) {
  const raw = new URLSearchParams(search).get('track');
  if (!raw) {
    return null;
  }
  const once = readDocument(raw);
  if (once) {
    return once;
  }
  let twice = null;
  try {
    twice = decodeURIComponent(raw);
  } catch (e) {
    return null;
  }
  return readDocument(twice);
}

/* ------------------------------------------------------------------ */
/* A track in the address fragment                                     */
/* ------------------------------------------------------------------ */

/*
 * THE FRAGMENT LINK, #track=<version>.<payload>. The whole track travels in the
 * part of an address that a browser never sends to a server, so a link to a
 * whoop track needs no account and no server, and cannot be read by anything
 * between two people who share it in a chat. The payload is the document's
 * compact JSON, deflated where the browser can (`z.`, the raw deflate of the
 * standard CompressionStream) and base64url encoded so it is safe in an address
 * and in a message; where the browser cannot compress it is the JSON itself,
 * encoded the same way (`j.`), longer and just as good. Measured on the shipped
 * whoop presets it is about 1.6 to 2.5 thousand characters, which fits a chat
 * message. It opens as a copy: see start.js.
 *
 * READING ONE IS HOSTILE INPUT, because a link is somebody else's text. The
 * result is null, never a throw, for anything that is not a version and a
 * payload this file made; the inflated size is capped while it streams, so a few
 * kilobytes of address cannot ask for gigabytes of memory; and what comes out is
 * read by the same reader a file is, which never throws and repairs what it can.
 * The ?track= link above keeps working exactly as it did.
 */
export const FRAGMENT_KEY = 'track';

/* The most that may come out of a payload, and the most that may go in. A whoop
 * track is tens of kilobytes at the very most; a megabyte is not a track. */
const MAX_TEXT = 1 << 20;
const MAX_PAYLOAD = 1 << 20;

/* Whether this browser (or Node) can deflate and inflate a stream. */
export function canCompress() {
  return typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';
}

function toBase64Url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/* Bytes from base64url, or null for anything that is not that. */
function fromBase64Url(text) {
  if (typeof text !== 'string' || text.length > MAX_PAYLOAD || !/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) {
    return null;
  }
  try {
    const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) {
      bytes[i] = bin.charCodeAt(i);
    }
    return bytes;
  } catch (e) {
    return null;
  }
}

/* Bytes through a transform stream (deflate or inflate), stopping as soon as
 * more than `limit` bytes have come out. */
async function pump(bytes, transform, limit) {
  const source = new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
  const reader = source.pipeThrough(transform).getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    total += value.length;
    if (total > limit) {
      await reader.cancel();
      throw new Error('too big');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/*
 * The payload for a document: a version letter, a dot and base64url. Compressed
 * when the browser can, unless `compress` says not to (the test uses that to
 * prove the plain form reads too).
 */
export async function encodeTrack(doc, { compress = canCompress() } = {}) {
  const text = JSON.stringify(toPlain(doc));
  const bytes = new TextEncoder().encode(text);
  if (compress && canCompress()) {
    return `z.${toBase64Url(await pump(bytes, new CompressionStream('deflate-raw'), MAX_PAYLOAD))}`;
  }
  return `j.${toBase64Url(bytes)}`;
}

/* The text a payload carries, or null. Never throws. The same payload carries a TinyLaps
 * file in a link from their editor (src/share/tinylaps.js), so the text is its own step. */
export async function decodeText(payload) {
  if (typeof payload !== 'string' || payload.length < 3 || payload[1] !== '.') {
    return null;
  }
  const version = payload[0];
  const bytes = fromBase64Url(payload.slice(2));
  if (!bytes || !bytes.length) {
    return null;
  }
  try {
    if (version === 'z') {
      if (!canCompress()) {
        return null;
      }
      return new TextDecoder('utf-8', { fatal: true }).decode(await pump(bytes, new DecompressionStream('deflate-raw'), MAX_TEXT));
    }
    if (version === 'j') {
      if (bytes.length > MAX_TEXT) {
        return null;
      }
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    }
    return null;
  } catch (e) {
    return null;
  }
}

/* The document a payload carries, or null. Never throws. */
export async function decodeTrack(payload) {
  const text = await decodeText(payload);
  return text == null ? null : readDocument(text);
}

/* The link for a document, on `base` (the address of the builder without its
 * query or fragment). */
export async function trackLink(doc, base) {
  return `${base}#${FRAGMENT_KEY}=${await encodeTrack(doc)}`;
}

/* The document a location's fragment carries, or null: `hash` is what
 * location.hash gives, with or without the hash sign. */
export async function docFromHash(hash) {
  if (typeof hash !== 'string' || hash.length > MAX_PAYLOAD + 32) {
    return null;
  }
  const raw = new URLSearchParams(hash.replace(/^#/, '')).get(FRAGMENT_KEY);
  return raw ? decodeTrack(raw) : null;
}
