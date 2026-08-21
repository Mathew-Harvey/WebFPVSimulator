/*
 * model.js: the track document. Creation, repair, and the JSON round trip.
 *
 * THE DOCUMENT IS THE DELIVERABLE. The simulator will read it one day and
 * this tool will not be in the room when it does, so the rules here are:
 * every field has one meaning, no field is derived from another field at
 * read time, and the file is readable by a person with no tooling. The
 * fields are documented one by one in schema.md next to a worked example.
 *
 * Two invariants the rest of the tool relies on:
 *
 *   normalize() ALWAYS returns a valid document. It never throws on bad
 *   input; it repairs what it can, drops what it cannot, and returns a list
 *   of what it did. Importing a file somebody hand edited must not be able
 *   to leave the tool in a state it cannot draw.
 *
 *   serialize() is STABLE. Keys are written in a fixed order and every
 *   number is rounded once, so export, import, export is byte identical and
 *   a saved track diffs cleanly.
 *
 * This module imports elements.js for defaults and geometry.js for the
 * aperture frame. It imports nothing else, and in particular nothing from
 * the simulator.
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

import { ELEMENTS, KIND, TUNING, apertureLevels, elementHeight, normalizeFlagSide } from './elements.js';
import { apertureFrame, wrapAngle } from './geometry.js';

/*
 * The schema version. Bump it when a change to the document cannot be read
 * by a consumer written against the previous number, and add a migration in
 * migrate() at the same time. Adding an OPTIONAL field with a documented
 * default is not a bump; removing or re-meaning a field is.
 *
 * 2, because `branding.logo` is no longer written. A course can carry five
 * logos now, and the only two honest ways to say so were to write the first
 * one twice, once in the old field and once in the new list, or to stop
 * writing the old field. Writing a 256 kB data URL twice doubles the file
 * for the single logo case that is most of them, so the old field went, and
 * removing a field is exactly what the rule above says to bump for.
 *
 * A version 1 document still reads: normalize() below promotes its
 * `branding.logo` into the list as the first logo. It is a one way upgrade,
 * which is what a schema version is for.
 */
export const SCHEMA_VERSION = 2;

/*
 * ONE MARK, as a data URL, and the cap on it. The list they live in, and the
 * budget they share, are below.
 *
 * WHY THE IMAGE ITSELF IS IN THE DOCUMENT. A track is one file that a person
 * can send to another person, and a branding that lived in a second file
 * beside it would arrive stripped every time. So a logo travels inside the
 * track, which means it has to be small enough that a track is still a file
 * rather than a payload.
 *
 * 256 kB of data URL is about 190 kB of image, which is a generous PNG at
 * the 1200 by 400 box the builder fits an upload inside, and local storage's
 * usual quota is 5 MB for the whole origin. The builder resizes and
 * re-encodes before it ever gets here, so this cap is the backstop against a
 * hand edited file rather than the thing a user meets: what a user meets is
 * BRANDING_MAX_CHARS below, the budget all five share.
 *
 * Anything that is not a data URL of an image is dropped on read, and that
 * is a security property as much as a validation one: a document is
 * untrusted input, this string ends up in a texture loader, and an http URL
 * in there would make opening somebody's track a network request to their
 * server.
 */
export const LOGO_MAX_CHARS = 256 * 1024;
const LOGO_PREFIX = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;

export function isUsableLogo(value) {
  return typeof value === 'string'
    && value.length <= LOGO_MAX_CHARS
    && LOGO_PREFIX.test(value);
}

/*
 * FIVE MARKS, AND WHY FIVE.
 *
 * A course is sold to sponsors, and a sponsor wants their logo on gates a
 * pilot passes rather than on a board in a corner. So the logos are spread
 * round robin over the structures in flying order: with fifteen gates and
 * five logos each one is on three of them, and each one is on gates spread
 * down the lap rather than on the first three. Five is the number past which
 * a pilot stops being able to tell one sponsor's gate from another's at
 * commit range, and it is also about as many as the size budget below can
 * carry.
 *
 * THE TOTAL IS THE REAL CAP, not the per logo one. LOGO_MAX_CHARS still
 * bounds any single logo, so a course written before this existed, with one
 * logo of 256 kB, still reads. What actually has to hold is the whole
 * document: it lives in local storage next to every other track an author
 * has, it is posted to the board in one request, and it is a file people
 * send each other. 384 kB of data URL across all five is about 96 kB of PNG
 * each, which is a generous flat logo, and it leaves the published document
 * under the board's own cap with room for the course itself.
 */
export const LOGO_SLOTS = 5;
export const BRANDING_MAX_CHARS = 384 * 1024;

/* Total characters the logos on this document already spend. */
export function brandingBytes(doc) {
  return (doc?.branding?.logos ?? []).reduce((n, l) => n + (l?.image?.length ?? 0), 0);
}

/* The logos, always an array, so no caller has to write the `?? []`. */
export function logosOf(doc) {
  return doc?.branding?.logos ?? [];
}

/*
 * The logo a decal wears: the one it names, or the course's first logo when
 * it names nothing. Returns null when the course has no logos at all, or
 * when the one it named has since been removed, and both of those are
 * states the builder draws rather than repairs. Repairing would mean
 * silently moving somebody's sponsor onto a different sponsor's decal.
 */
export function logoForDecal(doc, el) {
  const logos = logosOf(doc);
  if (!logos.length) {
    return null;
  }
  const id = typeof el?.logoId === 'string' ? el.logoId : '';
  if (!id) {
    return logos[0];
  }
  return logos.find((l) => l.id === id) ?? null;
}

/* Every number in the file is written to this many decimal places. Six is a
 * micrometre on a 60 m field, which is far past any dimension that matters
 * and short enough that a float never prints seventeen digits of noise. */
const PLACES = 6;

function num(x, fallback = 0) {
  const n = Number(x);
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Number(n.toFixed(PLACES));
}

function int(x, fallback, lo, hi) {
  const n = Math.round(Number(x));
  if (!Number.isFinite(n)) {
    return fallback;
  }
  if (lo != null && n < lo) {
    return lo;
  }
  if (hi != null && n > hi) {
    return hi;
  }
  return n;
}

function str(x, fallback = '') {
  return typeof x === 'string' ? x : fallback;
}

function bool(x, fallback = false) {
  return typeof x === 'boolean' ? x : fallback;
}

export function deepClone(o) {
  return JSON.parse(JSON.stringify(o));
}

/*
 * Ids. Derived from what is already in the document rather than from a
 * counter held somewhere, so an id is never reused after an undo and the
 * document carries no hidden state.
 */
function nextId(existing, prefix) {
  let max = 0;
  for (const id of existing) {
    const m = String(id).match(new RegExp(`^${prefix}-(\\d+)$`));
    if (m) {
      max = Math.max(max, Number(m[1]));
    }
  }
  return `${prefix}-${max + 1}`;
}

export function newElementId(doc) {
  return nextId(doc.elements.map((e) => e.id), 'el');
}

export function newSequenceId(doc) {
  return nextId(doc.sequence.map((s) => s.id), 'sq');
}

/*
 * A logo's id. Decals name the logo they wear by id rather than by position,
 * so removing the second of three sponsors leaves the third one's painted
 * grass wearing the third one's logo instead of quietly repainting it with
 * somebody else's.
 */
export function newLogoId(doc) {
  return nextId(logosOf(doc).map((l) => l.id), 'logo');
}

/* A track id, for local storage. Not derived from the contents, because two
 * tracks are allowed to be identical and still be two tracks. */
export function newTrackId() {
  const n = Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
  return `trk-${n}`;
}

function nowUtc() {
  return new Date().toISOString().replace(/\.\d+Z$/, 'Z');
}

/* ------------------------------------------------------------------ */
/* Creation                                                            */
/* ------------------------------------------------------------------ */

export function createTrack(name = 'Untitled track') {
  const stamp = nowUtc();
  return {
    schemaVersion: SCHEMA_VERSION,
    id: newTrackId(),
    name,
    createdUtc: stamp,
    modifiedUtc: stamp,
    field: {
      width: TUNING.fieldWidth,
      depth: TUNING.fieldDepth,
      gridSize: TUNING.gridSize,
    },
    settings: {
      tangentScale: TUNING.tangentScale,
      minCurveRadius: TUNING.minCurveRadius,
      samplesPerSegment: TUNING.samplesPerSegment,
    },
    /*
     * What the course is dressed in: up to five sponsors' logos, in the
     * order they are handed out round the gates. Empty by default, so a
     * track costs nothing until somebody uploads something.
     */
    branding: { logos: [] },
    elements: [],
    sequence: [],
  };
}

/*
 * A new element of `type` at `position`. The dimensions are copied out of
 * elements.js rather than referenced, because the document has to stay
 * readable on its own and because editing a default must not silently
 * resize a track somebody already flew.
 */
export function createElement(doc, type, position, yaw = 0) {
  const def = ELEMENTS[type];
  if (!def) {
    throw new Error(`unknown element type: ${type}`);
  }
  const el = {
    id: newElementId(doc),
    type,
    name: '',
    position: { x: num(position.x), y: num(position.y), z: num(position.z ?? 0) },
    yaw: num(yaw),
    pitch: num(def.pitch ?? 0),
    yawOverridden: false,
    dims: { ...def.dims },
  };
  if (def.kind === KIND.ANNOTATION) {
    el.text = 'Label';
  }
  if (def.flagSide) {
    el.flagSide = def.flagSide;
  }
  if (def.kind === KIND.DECAL) {
    /*
     * NAMED AT BIRTH where there is anything to name, so a decal dropped on
     * a course that already has sponsors is finished the moment it lands AND
     * stays pointed at that sponsor when the list is reordered around it.
     * Empty only ever means the course had no logos yet, and then it follows
     * whichever logo becomes the first one.
     */
    el.logoId = logosOf(doc)[0]?.id ?? '';
  }
  return el;
}

/*
 * A new sequence entry pointing at an element, and at one aperture of it.
 *
 * THE PAIR IS THE POINT. A ladder is one element with three openings and can
 * legitimately appear at sequence positions 5 and 9 on different levels with
 * different faces, so what the sequence holds is (elementId, apertureIndex)
 * and never just an element.
 */
export function createSequenceEntry(doc, elementId, apertureIndex = 0) {
  const el = elementById(doc, elementId);
  if (!el) {
    throw new Error(`no such element: ${elementId}`);
  }
  const def = ELEMENTS[el.type];
  const entry = {
    id: newSequenceId(doc),
    elementId,
    /* Clamped at BOTH ends. int(x, 0, 0) pins the floor at zero and leaves
     * the ceiling open, so an index past the last hole of a stack was stored
     * as given and every reader after it had to clamp again. */
    apertureIndex: def.kind === KIND.APERTURE
      ? int(apertureIndex, 0, 0, Math.max(0, aperturesOf(el).length - 1))
      : null,
    /* 0 means the face has not been decided. The auto-defaulting pass in
     * faces.js normally sets it the moment the element is placed, and the
     * results panel warns about any that survive. */
    entry: def.kind === KIND.APERTURE ? 0 : null,
    passSide: def.kind === KIND.MARKER ? 'left' : null,
    clearance: def.kind === KIND.MARKER ? num(def.dims.clearance) : null,
    overridden: false,
  };
  return entry;
}

/* ------------------------------------------------------------------ */
/* Accessors                                                           */
/* ------------------------------------------------------------------ */

export function elementById(doc, id) {
  return doc.elements.find((e) => e.id === id);
}

export function defOf(el) {
  return ELEMENTS[el.type];
}

export function kindOf(el) {
  return ELEMENTS[el.type]?.kind;
}

export function isSequenceable(el) {
  const k = kindOf(el);
  return k === KIND.APERTURE || k === KIND.MARKER;
}

/*
 * WHICH SPONSOR'S MARK EACH STRUCTURE WEARS, as a map from element id to a
 * position in the round robin.
 *
 * ONE RULE, ONE PLACE. The world deals the logos out, the builder's 3D
 * preview deals them out, and the two have to agree or an author dresses a
 * course that flies wearing something else. So the rule lives here, on the
 * document, rather than being written once in each renderer.
 *
 * THE ORDER IS THE FLYING ORDER, and it counts STRUCTURES rather than
 * passes. A ladder flown three times is one frame with one header board, so
 * it takes one slot; a flag or a cone is scored through a square in the air
 * beside it and carries no vinyl at all, so it takes none. An element that
 * is not in the flying order does not stand on the race field, so it is not
 * in here either.
 *
 * The result modulo the number of logos is the logo: fifteen structures and
 * five logos put each logo on three of them, spread down the lap.
 */
export function dressOrder(doc) {
  const slots = new Map();
  for (const seq of doc.sequence ?? []) {
    const el = elementById(doc, seq.elementId);
    if (!el || kindOf(el) !== KIND.APERTURE || slots.has(seq.elementId)) {
      continue;
    }
    slots.set(seq.elementId, slots.size);
  }
  return slots;
}

export function startPadsOf(doc) {
  return doc.elements.find((e) => kindOf(e) === KIND.START);
}

/* The openings of one element, bottom to top. Empty for anything that is not
 * an aperture element. */
export function aperturesOf(el) {
  if (kindOf(el) !== KIND.APERTURE) {
    return [];
  }
  return apertureLevels(el.dims);
}

/*
 * Where a sequence entry puts a knot, before the marker offset is applied.
 * For an aperture that is the opening's centre. For a marker it is the
 * marker itself, and path.js pushes it sideways by the clearance.
 */
export function entryAnchor(doc, seq) {
  const el = elementById(doc, seq.elementId);
  if (!el) {
    return null;
  }
  if (kindOf(el) === KIND.APERTURE) {
    const aps = aperturesOf(el);
    const ap = aps[Math.min(Math.max(0, seq.apertureIndex ?? 0), aps.length - 1)];
    if (!ap) {
      return null;
    }
    return { x: el.position.x, y: el.position.y, z: el.position.z + ap.centerH };
  }
  return { x: el.position.x, y: el.position.y, z: el.position.z };
}

/* The world centre of one opening, by index. Used by both views. */
export function apertureCenter(el, index) {
  const aps = aperturesOf(el);
  const ap = aps[Math.min(Math.max(0, index), aps.length - 1)];
  if (!ap) {
    return { ...el.position };
  }
  return { x: el.position.x, y: el.position.y, z: el.position.z + ap.centerH };
}

/* The unsigned normal of an element's aperture plane. Every opening on one
 * structure shares it, because they share the structure. */
export function elementNormal(el) {
  return apertureFrame(el.yaw, el.pitch).normal;
}

export function topOf(el) {
  return el.position.z + elementHeight(defOf(el), el.dims);
}

/* How many sequence entries point at an element. Multi referenced elements
 * are the ones the auto face rule has to leave alone. */
export function sequenceRefCount(doc, elementId) {
  return doc.sequence.filter((s) => s.elementId === elementId).length;
}

/* ------------------------------------------------------------------ */
/* Repair                                                              */
/* ------------------------------------------------------------------ */

/*
 * Bring any object at all up to the current schema, reporting what changed.
 * Returns { doc, repairs }. Never throws.
 */
export function normalize(raw) {
  const repairs = [];
  const src = (raw && typeof raw === 'object') ? raw : {};
  const base = createTrack(str(src.name, 'Untitled track'));

  const version = int(src.schemaVersion, 0, 0);
  if (version > SCHEMA_VERSION) {
    repairs.push(`document says schemaVersion ${version}, this build understands ${SCHEMA_VERSION}. Unknown fields were dropped.`);
  }
  /* The one migration there is, from 1 to 2, is the branding read below:
   * a version 1 document's single `branding.logo` becomes the first entry
   * of `branding.logos`. It is written inline rather than in a migrate()
   * of its own because normalize already reads every field with a default,
   * and that is most of what a migration is. */

  const doc = {
    schemaVersion: SCHEMA_VERSION,
    id: str(src.id, base.id),
    name: str(src.name, 'Untitled track'),
    createdUtc: str(src.createdUtc, base.createdUtc),
    modifiedUtc: str(src.modifiedUtc, base.modifiedUtc),
    field: {
      width: Math.max(5, num(src.field?.width, base.field.width)),
      depth: Math.max(5, num(src.field?.depth, base.field.depth)),
      gridSize: Math.max(0.1, num(src.field?.gridSize, base.field.gridSize)),
    },
    settings: {
      tangentScale: Math.max(0.01, num(src.settings?.tangentScale, base.settings.tangentScale)),
      minCurveRadius: Math.max(0.1, num(src.settings?.minCurveRadius, base.settings.minCurveRadius)),
      samplesPerSegment: int(src.settings?.samplesPerSegment, base.settings.samplesPerSegment, 4, 512),
    },
    branding: { logos: [] },
    elements: [],
    sequence: [],
  };

  /*
   * The logos. A version 2 document carries `branding.logos`; a version 1
   * one carries a single `branding.logo`, and it is promoted to the first
   * entry of the list. Promotion is silent: it is an upgrade, not damage,
   * and a repair note for it would cry wolf on every track written before
   * this feature.
   *
   * Anything that is not an embedded image is dropped, and that is a
   * security property as much as a validation one: a document is untrusted
   * input, these strings end up in a texture loader, and an http URL in one
   * would make opening somebody's track a request to their server.
   */
  {
    const rawList = Array.isArray(src.branding?.logos)
      ? src.branding.logos
      : (src.branding?.logo != null && src.branding.logo !== ''
        ? [{ image: src.branding.logo, name: src.branding?.logoName }]
        : []);
    let spent = 0;
    let dropped = 0;
    let overflowed = 0;
    for (const raw of rawList) {
      /* A bare string is accepted as well as an object, because a hand
       * written list of data URLs is the obvious thing somebody would try
       * and refusing it teaches nothing. */
      const image = typeof raw === 'string' ? raw : (raw && typeof raw === 'object' ? raw.image : null);
      const name = typeof raw === 'object' && raw ? str(raw.name, '') : '';
      if (!isUsableLogo(image)) {
        dropped += 1;
        continue;
      }
      if (doc.branding.logos.length >= LOGO_SLOTS) {
        overflowed += 1;
        continue;
      }
      if (spent + image.length > BRANDING_MAX_CHARS) {
        overflowed += 1;
        continue;
      }
      spent += image.length;
      /* Ids are repaired against what is already in the list, so a file with
       * two logos claiming the same id cannot make a decal ambiguous. */
      const wanted = typeof raw === 'object' && raw ? str(raw.id, '') : '';
      const taken = doc.branding.logos.map((l) => l.id);
      const id = wanted && !taken.includes(wanted) ? wanted : nextId(taken, 'logo');
      doc.branding.logos.push({ id, image, name });
    }
    if (dropped) {
      repairs.push(`dropped ${dropped} logo${dropped === 1 ? '' : 's'} that ${dropped === 1 ? 'was' : 'were'} not an embedded image under ${Math.round(LOGO_MAX_CHARS / 1024)} kB. A track carries its pictures inside itself, never a link to one.`);
    }
    if (overflowed) {
      repairs.push(`dropped ${overflowed} logo${overflowed === 1 ? '' : 's'} past the ${LOGO_SLOTS} a course carries or past the ${Math.round(BRANDING_MAX_CHARS / 1024)} kB they share.`);
    }
  }

  const seenIds = new Set();
  /*
   * Every id the file carries, including the ones this loop has not reached
   * yet. Repairing an id against seenIds alone let a renamed element take an
   * id that belonged to an element further down the list: that element then
   * looked like the duplicate and was renamed in its turn, and every
   * sequence entry naming the id now pointed at the wrong gate. Renaming
   * has to dodge the whole file, not just the part already read.
   */
  const rawIds = (Array.isArray(src.elements) ? src.elements : []).map((e) => str(e?.id));
  let startSeen = false;
  for (const rawEl of Array.isArray(src.elements) ? src.elements : []) {
    const type = str(rawEl?.type);
    const def = ELEMENTS[type];
    if (!def) {
      repairs.push(`dropped an element of unknown type "${type}".`);
      continue;
    }
    if (def.kind === KIND.START) {
      if (startSeen) {
        repairs.push('dropped a second set of start pads. A track has exactly one.');
        continue;
      }
      startSeen = true;
    }
    let id = str(rawEl.id);
    if (!id || seenIds.has(id)) {
      id = nextId([...seenIds, ...rawIds], 'el');
      repairs.push(`an element had a missing or duplicate id, renamed to ${id}.`);
    }
    seenIds.add(id);

    const dims = {};
    for (const key of Object.keys(def.dims)) {
      const wanted = num(rawEl.dims?.[key], def.dims[key]);
      /* Levels is a count and everything else is a length. Both have to be
       * positive or the structure has no geometry at all. */
      dims[key] = key === 'levels' ? int(wanted, def.dims[key], 1, 24) : Math.max(0, wanted);
    }

    const el = {
      id,
      type,
      name: str(rawEl.name, ''),
      position: {
        x: num(rawEl.position?.x),
        y: num(rawEl.position?.y),
        z: num(rawEl.position?.z),
      },
      yaw: num(wrapAngle(num(rawEl.yaw))),
      /* CLAMPED, not wrapped, which is what schema.md documents and what
       * setPitch does. Wrapping turned a nonsense 100 degree dive into a
       * legal looking 80 degree one pointing the other way instead of
       * pinning it at vertical. */
      pitch: num(Math.max(-Math.PI / 2, Math.min(Math.PI / 2, num(rawEl.pitch, def.pitch ?? 0)))),
      yawOverridden: bool(rawEl.yawOverridden),
      dims,
    };
    if (def.kind === KIND.ANNOTATION) {
      el.text = str(rawEl.text, 'Label');
    }
    if (def.kind === KIND.DECAL) {
      /* Kept even when no logo carries this id, because the logos are read
       * above and a decal naming one that was dropped for size should say
       * so in the builder rather than silently repaint itself with the
       * first sponsor's logo. logoForDecal returns null for it. */
      el.logoId = str(rawEl.logoId, '');
    }
    if (def.flagSide) {
      el.flagSide = normalizeFlagSide(rawEl.flagSide, def.flagSide);
    }
    doc.elements.push(el);
  }

  const seenSeq = new Set();
  for (const rawSeq of Array.isArray(src.sequence) ? src.sequence : []) {
    const elementId = str(rawSeq?.elementId);
    const el = doc.elements.find((e) => e.id === elementId);
    if (!el) {
      repairs.push(`dropped a sequence entry pointing at missing element "${elementId}".`);
      continue;
    }
    const def = ELEMENTS[el.type];
    if (def.kind !== KIND.APERTURE && def.kind !== KIND.MARKER) {
      repairs.push(`dropped a sequence entry for a ${def.label}, which is never part of the course.`);
      continue;
    }
    let id = str(rawSeq.id);
    if (!id || seenSeq.has(id)) {
      id = nextId([...seenSeq], 'sq');
      repairs.push(`a sequence entry had a missing or duplicate id, renamed to ${id}.`);
    }
    seenSeq.add(id);

    let apertureIndex = null;
    if (def.kind === KIND.APERTURE) {
      const count = apertureLevels(el.dims).length;
      const wanted = int(rawSeq.apertureIndex, 0, 0);
      apertureIndex = Math.min(wanted, count - 1);
      if (apertureIndex !== wanted) {
        repairs.push(`sequence entry ${id} asked for level ${wanted + 1} of a ${count} level ${def.label}, clamped to ${apertureIndex + 1}.`);
      }
    }

    let entry = null;
    if (def.kind === KIND.APERTURE) {
      const e = int(rawSeq.entry, 0);
      entry = e > 0 ? 1 : (e < 0 ? -1 : 0);
    }

    let passSide = null;
    let clearance = null;
    if (def.kind === KIND.MARKER) {
      passSide = rawSeq.passSide === 'right' ? 'right' : 'left';
      clearance = Math.max(0, num(rawSeq.clearance, def.dims.clearance));
    }

    doc.sequence.push({
      id,
      elementId,
      apertureIndex,
      entry,
      passSide,
      clearance,
      overridden: bool(rawSeq.overridden),
    });
  }

  return { doc, repairs };
}

/* ------------------------------------------------------------------ */
/* Serialisation                                                       */
/* ------------------------------------------------------------------ */

/*
 * Write the document with a fixed key order and one rounding pass, so that
 * export, import, export produces the same bytes. JSON.stringify follows
 * insertion order for string keys, which is what makes this work.
 */
export function toPlain(doc) {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: doc.id,
    name: doc.name,
    createdUtc: doc.createdUtc,
    modifiedUtc: doc.modifiedUtc,
    field: {
      width: num(doc.field.width),
      depth: num(doc.field.depth),
      gridSize: num(doc.field.gridSize),
    },
    settings: {
      tangentScale: num(doc.settings.tangentScale),
      minCurveRadius: num(doc.settings.minCurveRadius),
      samplesPerSegment: int(doc.settings.samplesPerSegment, TUNING.samplesPerSegment, 4, 512),
    },
    branding: {
      /*
       * The logos, in the order they are dealt out round the gates. Filtered
       * once more on the way out, so a document that was hand edited between
       * a normalize and a save cannot write a link to somebody's server into
       * a file another person will open.
       */
      logos: logosOf(doc)
        .filter((l) => l && isUsableLogo(l.image))
        .slice(0, LOGO_SLOTS)
        .map((l, i) => ({ id: str(l.id, `logo-${i + 1}`), image: l.image, name: str(l.name, '') })),
    },
    elements: doc.elements.map((el) => {
      const def = ELEMENTS[el.type];
      const out = {
        id: el.id,
        type: el.type,
        name: el.name ?? '',
        position: { x: num(el.position.x), y: num(el.position.y), z: num(el.position.z) },
        yaw: num(el.yaw),
        pitch: num(el.pitch),
        yawOverridden: Boolean(el.yawOverridden),
        dims: {},
      };
      /* Dimension keys in the order elements.js declares them, so two
       * elements of the same type always print the same shape. */
      for (const key of Object.keys(def.dims)) {
        out.dims[key] = key === 'levels' ? int(el.dims[key], def.dims[key], 1, 24) : num(el.dims[key], def.dims[key]);
      }
      if (def.kind === KIND.ANNOTATION) {
        out.text = el.text ?? '';
      }
      if (def.kind === KIND.DECAL) {
        out.logoId = str(el.logoId, '');
      }
      if (def.flagSide) {
        out.flagSide = normalizeFlagSide(el.flagSide, def.flagSide);
      }
      return out;
    }),
    sequence: doc.sequence.map((s) => ({
      id: s.id,
      elementId: s.elementId,
      apertureIndex: s.apertureIndex == null ? null : int(s.apertureIndex, 0, 0),
      entry: s.entry == null ? null : int(s.entry, 0),
      passSide: s.passSide ?? null,
      clearance: s.clearance == null ? null : num(s.clearance),
      overridden: Boolean(s.overridden),
    })),
  };
}

export function serialize(doc) {
  return `${JSON.stringify(toPlain(doc), null, 2)}\n`;
}

/*
 * Read a document back. Returns { doc, repairs, error }. A parse failure is
 * an error and yields a fresh empty track rather than throwing, because the
 * caller is a file input and the user wants to be told, not crashed at.
 */
export function deserialize(text) {
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { doc: createTrack(), repairs: [], error: `not valid JSON: ${e.message}` };
  }
  const { doc, repairs } = normalize(parsed);
  return { doc, repairs, error: null };
}

/* Round trip check, used by the self test in tests.js and by the import
 * path to tell the user their file survived intact. */
export function roundTripsCleanly(doc) {
  const a = serialize(doc);
  const b = serialize(deserialize(a).doc);
  return a === b;
}

/* A copy of a track under a new id and name, for Duplicate. */
export function duplicateTrack(doc, name) {
  const copy = deepClone(doc);
  copy.id = newTrackId();
  copy.name = name ?? `${doc.name} copy`;
  copy.createdUtc = nowUtc();
  copy.modifiedUtc = copy.createdUtc;
  return copy;
}

export function touch(doc) {
  doc.modifiedUtc = nowUtc();
  return doc;
}
