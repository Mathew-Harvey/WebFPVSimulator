/*
 * validate.js: names, times, and the track document this board will store.
 *
 * The document is the same schema.md object the simulator's track builder
 * writes. This file does not import that code. It checks the few things
 * the board must believe before it will keep a copy: a version it knows,
 * a stable id, a flying order, and a logo that is an embedded image or
 * nothing. The simulator is the reader that decides what a gate means.
 *
 * This file is part of WebFPVLeaderboard.
 *
 * WebFPVLeaderboard is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVLeaderboard is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVLeaderboard. If not, see <https://www.gnu.org/licenses/>.
 */

import { createHash } from 'node:crypto';

export const NAME_RE = /^[A-Za-z0-9._\- ]{2,24}$/;
export const TRACK_ID_RE = /^trk-[0-9a-f]{8}$/;
const MAX_DOCUMENT_CHARS = 420_000;
const MAX_LAP_MS = 3_600_000;

export function normaliseName(raw) {
  const name = String(raw ?? '').trim().replace(/\s+/g, ' ');
  return NAME_RE.test(name) ? name : null;
}

export function normaliseLapMs(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1 || n > MAX_LAP_MS) {
    return null;
  }
  return Math.round(n);
}

function isObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function usableLogo(value) {
  return typeof value === 'string' && value.startsWith('data:image/') && value.length < 280_000;
}

export function layoutHash(document) {
  const payload = {
    field: document.field ?? {},
    elements: document.elements ?? [],
    sequence: document.sequence ?? [],
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function hashEditKey(key) {
  return createHash('sha256').update(String(key)).digest('hex');
}

export function planFromDocument(document) {
  const field = isObject(document.field) ? document.field : {};
  const marks = [];
  for (const el of document.elements || []) {
    if (!isObject(el) || !isObject(el.position)) {
      continue;
    }
    if (el.type === 'label') {
      continue;
    }
    marks.push({
      type: String(el.type || 'gate'),
      x: Number(el.position.x) || 0,
      y: Number(el.position.y) || 0,
      yaw: Number(el.yaw) || 0,
    });
  }
  return {
    width: Number(field.width) || 60,
    depth: Number(field.depth) || 40,
    marks,
  };
}

export function inspectDocument(raw) {
  if (typeof raw === 'string' && raw.length > MAX_DOCUMENT_CHARS) {
    return { error: 'That course is too large to publish.' };
  }
  const packed = typeof raw === 'string' ? raw : JSON.stringify(raw);
  if (packed.length > MAX_DOCUMENT_CHARS) {
    return { error: 'That course is too large to publish.' };
  }
  let document = raw;
  if (typeof raw === 'string') {
    try {
      document = JSON.parse(raw);
    } catch (e) {
      return { error: 'That course is not valid JSON.' };
    }
  }
  if (!isObject(document)) {
    return { error: 'That course is not a track document.' };
  }
  if (document.schemaVersion !== 1) {
    return { error: 'This board only accepts schemaVersion 1 courses.' };
  }
  const id = String(document.id || '');
  if (!TRACK_ID_RE.test(id)) {
    return { error: 'That course has no usable id.' };
  }
  const name = String(document.name || '').trim() || 'Untitled track';
  if (!Array.isArray(document.elements) || !Array.isArray(document.sequence)) {
    return { error: 'That course is missing its field or its flying order.' };
  }
  if (document.sequence.length < 1) {
    return { error: 'A published course needs at least one gate in the flying order.' };
  }
  const logo = document.branding && document.branding.logo;
  if (logo != null && !usableLogo(logo)) {
    return { error: 'A logo has to travel inside the course as an embedded image.' };
  }
  return {
    document,
    id,
    name: name.slice(0, 80),
    hasLogo: Boolean(logo),
    gates: document.sequence.length,
    elements: document.elements.length,
    layoutHash: layoutHash(document),
    plan: planFromDocument(document),
  };
}
