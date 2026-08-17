/*
 * orbitcache.js: one looping thumbnail per world, recorded once.
 *
 * Map cards used to keep a live WebGL copy of every world they showed. That
 * is a second (and third) renderer, a second post chain and, for the town,
 * a second copy of nineteen thousand meshes, on a page that is already
 * drawing the world behind the menu. A Steam Deck with other tabs open
 * cannot afford that.
 *
 * So a thumbnail is a short video. The first visit that needs one records
 * one full camera cycle at 480p, 10 fps, into IndexedDB. Every visit after
 * that is a <video> element, which is a hardware decoder and not a scene
 * graph. The cache key includes the capture size so bumping CLIP_VERSION
 * is how a later change to the shot invalidates old clips. The board's
 * featured card is about 670 by 340 CSS pixels, so 240p read as a smear.
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

import { readShareImport } from './session.js';
import { readAutosave } from '../trackbuilder/storage.js';

/* 4: the racing line stopped being painted twice. Every clip recorded
 * before that shows the old doubled, ghosted ground paint, and the shot is
 * the only thing that changed, so nothing else in the key would have
 * invalidated them. Bumping this is how a change to the SHOT reaches
 * thumbnails that are already in IndexedDB. */
export const CLIP_VERSION = 4;
export const CLIP_W = 854;
export const CLIP_H = 480;
export const CLIP_FPS = 10;
export const CLIP_BITRATE = 800000;
export const CLIP_MS_MAX = 12000;
export const CLIP_MS_MIN = 8000;

const DB_NAME = 'webfpv.orbitclips.v1';
const STORE = 'clips';
const MAX_CLIPS = 12;
const LOCK_NAME = 'webfpv-orbit-capture';

const mem = new Map();
let dbPromise = null;
let lockChain = Promise.resolve();

function clipPrefix() {
  return `v${CLIP_VERSION}:${CLIP_W}x${CLIP_H}@${CLIP_FPS}`;
}

export function clipKeyForShare(shareId, stamp = '') {
  return `${clipPrefix()}:custom:share:${shareId}:${stamp}`;
}

/*
 * The key for a published course, stamped with the version of it this
 * browser is holding.
 *
 * The share branch used to key on the id alone, while the autosave branch
 * below already carried a modifiedUtc. So a course that was republished
 * with a new layout kept serving the shot of the old one, for as long as
 * the cache lived, and the only way out was clearing storage. The stamp
 * comes from the seat rather than from the caller because BOTH readers,
 * the map screen through clipKeyForMap and the orbit page itself, have to
 * arrive at the same string or one records under a key the other never
 * looks up.
 */
export function clipKeyForSeatedShare(shareId) {
  try {
    const share = readShareImport();
    if (share && share.id === shareId) {
      return clipKeyForShare(shareId, (share.document && share.document.modifiedUtc) || '');
    }
  } catch (e) {
    /* Private mode, or a corrupt seat: fall through to the bare id. */
  }
  return clipKeyForShare(shareId);
}

/*
 * Built in maps are one clip each. A designed course is keyed by the share
 * id if this browser is flying a published one, otherwise by the working
 * document's id and modified stamp, so editing the track records a new
 * shot instead of showing yesterday's layout.
 */
export function clipKeyForMap(mapId) {
  if (mapId === 'custom') {
    try {
      const share = readShareImport();
      if (share && share.id) {
        return clipKeyForShare(share.id, (share.document && share.document.modifiedUtc) || '');
      }
      const saved = readAutosave();
      const doc = saved && saved.doc;
      if (doc && doc.id) {
        return `${clipPrefix()}:custom:${doc.id}:${doc.modifiedUtc || ''}`;
      }
    } catch (e) {
      /* Private mode, or a corrupt seat: treat as empty. */
    }
    return `${clipPrefix()}:custom:empty`;
  }
  return `${clipPrefix()}:${mapId}`;
}

function openDb() {
  if (dbPromise) {
    return dbPromise;
  }
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    let req;
    try {
      req = indexedDB.open(DB_NAME, 1);
    } catch (e) {
      resolve(null);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
  return dbPromise;
}

export async function getClip(key) {
  if (mem.has(key)) {
    return mem.get(key);
  }
  const db = await openDb();
  if (!db) {
    return null;
  }
  const blob = await new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => {
        const row = req.result;
        resolve(row && row.blob instanceof Blob ? row.blob : null);
      };
      req.onerror = () => resolve(null);
    } catch (e) {
      resolve(null);
    }
  });
  if (blob) {
    mem.set(key, blob);
  }
  return blob;
}

async function prune(db) {
  const rows = await new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    } catch (e) {
      resolve([]);
    }
  });
  if (rows.length <= MAX_CLIPS) {
    return;
  }
  rows.sort((a, b) => (a.t || 0) - (b.t || 0));
  const drop = rows.slice(0, rows.length - MAX_CLIPS);
  await new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      for (const row of drop) {
        tx.objectStore(STORE).delete(row.key);
        mem.delete(row.key);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch (e) {
      resolve();
    }
  });
}

export async function putClip(key, blob) {
  if (!key || !(blob instanceof Blob) || !blob.size) {
    return false;
  }
  mem.set(key, blob);
  const db = await openDb();
  if (!db) {
    return true;
  }
  await new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ key, blob, t: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch (e) {
      resolve();
    }
  });
  await prune(db);
  return true;
}

/*
 * Only one world is built for a thumbnail at a time, including across
 * iframes of this origin. Two city builds at once is how a Steam Deck
 * dropped the tab.
 */
export async function withCaptureLock(fn) {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : null;
  if (locks && typeof locks.request === 'function') {
    return locks.request(LOCK_NAME, fn);
  }
  const run = lockChain.then(fn, fn);
  lockChain = run.then(() => {}, () => {});
  return run;
}

export function pickRecorderMime() {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) {
    return '';
  }
  for (const type of ['video/webm;codecs=vp8', 'video/webm', 'video/mp4']) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return '';
}

function waitMs(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) {
      reject(new DOMException('aborted', 'AbortError'));
      return;
    }
    const t = setTimeout(resolve, ms);
    if (!signal) {
      return;
    }
    const onAbort = () => {
      clearTimeout(t);
      reject(new DOMException('aborted', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export function whenVisible(signal) {
  if (typeof document === 'undefined' || !document.hidden) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const done = (ok) => {
      document.removeEventListener('visibilitychange', onVis);
      if (signal) {
        signal.removeEventListener('abort', onAbort);
      }
      if (ok) {
        resolve();
      } else {
        reject(new DOMException('aborted', 'AbortError'));
      }
    };
    const onAbort = () => done(false);
    const onVis = () => {
      if (!document.hidden) {
        done(true);
      }
    };
    if (signal && signal.aborted) {
      onAbort();
      return;
    }
    document.addEventListener('visibilitychange', onVis);
    if (signal) {
      signal.addEventListener('abort', onAbort);
    }
  });
}

function findBytes(hay, needle, start, end) {
  const last = end - needle.length;
  outer: for (let i = start; i <= last; i += 1) {
    for (let j = 0; j < needle.length; j += 1) {
      if (hay[i + j] !== needle[j]) {
        continue outer;
      }
    }
    return i;
  }
  return -1;
}

function readVint(bytes, offset) {
  if (offset >= bytes.length) {
    return null;
  }
  const first = bytes[offset];
  if (first === 0) {
    return null;
  }
  let length = 1;
  let mask = 0x80;
  while (length <= 8 && (first & mask) === 0) {
    length += 1;
    mask >>= 1;
  }
  if ((first & mask) === 0 || offset + length > bytes.length) {
    return null;
  }
  let value = first & (mask - 1);
  for (let i = 1; i < length; i += 1) {
    value = value * 256 + bytes[offset + i];
  }
  return { length, value };
}

function readUint(bytes, offset, size) {
  let value = 0;
  for (let i = 0; i < size; i += 1) {
    value = value * 256 + bytes[offset + i];
  }
  return value;
}

/*
 * Chrome's MediaRecorder writes a WebM whose Duration is 0 or missing.
 * A <video loop> then restarts after a few frames, which is the board
 * thumbnail that glitched. Stamp the real length in the header so the
 * element loops at the end of the shot.
 */
function writeWebmDuration(bytes, durationMs) {
  const headEnd = Math.min(bytes.length, 16384);
  const cluster = findBytes(bytes, [0x1F, 0x43, 0xB6, 0x75], 0, headEnd);
  const end = cluster < 0 ? headEnd : cluster;
  let scale = 1000000;
  const scaleAt = findBytes(bytes, [0x2A, 0xD7, 0xB1], 0, end);
  if (scaleAt >= 0) {
    const size = readVint(bytes, scaleAt + 3);
    if (size && size.value > 0 && scaleAt + 3 + size.length + size.value <= end) {
      const n = readUint(bytes, scaleAt + 3 + size.length, size.value);
      if (n > 0) {
        scale = n;
      }
    }
  }
  const durationValue = (durationMs * 1e6) / scale;
  const durAt = findBytes(bytes, [0x44, 0x89], 0, end);
  if (durAt < 0) {
    return false;
  }
  const size = readVint(bytes, durAt + 2);
  if (!size || (size.value !== 4 && size.value !== 8)) {
    return false;
  }
  const dataAt = durAt + 2 + size.length;
  if (dataAt + size.value > end) {
    return false;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset + dataAt, size.value);
  if (size.value === 4) {
    view.setFloat32(0, durationValue);
  } else {
    view.setFloat64(0, durationValue);
  }
  return true;
}

async function stampClipDuration(blob, durationMs) {
  const type = blob.type || '';
  if (!type.includes('webm') || !(durationMs > 0)) {
    return blob;
  }
  const copy = new Uint8Array(await blob.arrayBuffer());
  if (!writeWebmDuration(copy, durationMs)) {
    return blob;
  }
  return new Blob([copy], { type });
}

export async function recordCanvasStream(canvas, durationMs, signal) {
  const mime = pickRecorderMime();
  if (!mime) {
    await waitMs(Math.min(400, durationMs), signal);
    const still = await new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.72);
    });
    if (!still) {
      throw new Error('Could not capture a still.');
    }
    return still;
  }
  const stream = canvas.captureStream(CLIP_FPS);
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: CLIP_BITRATE });
  const chunks = [];
  rec.addEventListener('dataavailable', (e) => {
    if (e.data && e.data.size) {
      chunks.push(e.data);
    }
  });
  const stopped = new Promise((resolve, reject) => {
    rec.addEventListener('stop', () => resolve());
    rec.addEventListener('error', () => reject(new Error('Recording failed.')));
  });
  rec.start();
  try {
    /* Two extra frames so the encoder has the pose at the loop point.
     * Duration stamped below is the intended length, so playback cuts
     * there and the pad is not shown. */
    await waitMs(durationMs + (2000 / CLIP_FPS), signal);
    if (typeof rec.requestData === 'function' && rec.state === 'recording') {
      rec.requestData();
    }
  } finally {
    if (rec.state === 'recording') {
      rec.stop();
    }
    try {
      await stopped;
    } catch (e) {
      /* The blob is checked below. */
    }
    for (const track of stream.getTracks()) {
      track.stop();
    }
  }
  if (signal && signal.aborted) {
    throw new DOMException('aborted', 'AbortError');
  }
  if (!chunks.length) {
    throw new Error('Recording produced no data.');
  }
  const blob = new Blob(chunks, { type: mime });
  return stampClipDuration(blob, durationMs);
}

export function clipDurationMs(loopMs) {
  const n = Number(loopMs);
  if (!Number.isFinite(n) || n <= 0) {
    return CLIP_MS_MAX;
  }
  return Math.min(CLIP_MS_MAX, Math.max(CLIP_MS_MIN, n));
}

function armVideoLoop(node) {
  const play = () => node.play().catch(() => {});
  const durationOk = () => Number.isFinite(node.duration) && node.duration > 0.2 && node.duration < 1e6;

  const restart = () => {
    try {
      node.currentTime = 0;
    } catch (e) {
      /* A codec that cannot seek still fires play. */
    }
    play();
  };

  node.addEventListener('ended', restart);

  const forceDuration = () => {
    if (durationOk()) {
      play();
      return;
    }
    const onTick = () => {
      if (!durationOk()) {
        return;
      }
      node.removeEventListener('timeupdate', onTick);
      restart();
    };
    node.addEventListener('timeupdate', onTick);
    try {
      node.currentTime = 1e101;
    } catch (e) {
      play();
    }
  };

  node.addEventListener('loadedmetadata', forceDuration);
  node.addEventListener('canplay', play, { once: true });
  if (node.readyState >= 1) {
    forceDuration();
  }
  if (node.readyState >= 2) {
    play();
  }
}

export function makeClipElement(blob, className) {
  const url = URL.createObjectURL(blob);
  const video = (blob.type || '').startsWith('video/');
  const node = document.createElement(video ? 'video' : 'img');
  if (className) {
    node.className = className;
  }
  node.setAttribute('aria-hidden', 'true');
  if (video) {
    node.muted = true;
    node.defaultMuted = true;
    node.loop = true;
    node.playsInline = true;
    node.autoplay = true;
    node.preload = 'auto';
    node.setAttribute('playsinline', '');
    node.setAttribute('webkit-playsinline', '');
    node.setAttribute('muted', '');
    node.disablePictureInPicture = true;
    node.disableRemotePlayback = true;
    node.controlsList = 'nodownload nofullscreen noremoteplayback';
    node.volume = 0;
    node.src = url;
    armVideoLoop(node);
  } else {
    node.src = url;
    node.alt = '';
  }
  return { node, url };
}
