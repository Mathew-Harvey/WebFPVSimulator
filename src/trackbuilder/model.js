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

import {
  ELEMENTS, KIND, TUNING, TRACK_CLASSES, TRACK_CLASS_DEFAULT, FRAME_SIDES, apertureLevels, apertureShapeOf, openingSizesOf,
  defaultDims, defaultPitch, defaultZ, elementHeight, normalizeFlagSide, normalizeUnbuiltSides,
  trackClassOf, tuningFor, docModeOf, POLE_SIDES, PVC_TYPES, isPvcPipe, poleKey, unbuiltPolesOf, isTrafficType, clampByLimits, FLAG_SIDES, GATE_FLAG_H, GATE_STYLES,
  ROAD_NODES_MAX, ROAD_NODE_REACH, SINK_MAX, LETTER_TUBE_OD, isLetterPiece, letterDimsFor, letterOfPiece,
} from './elements.js';
import { apertureFrame, wrapAngle } from './geometry.js';
import {
  LETTER_DEFAULT, layoutLetter, letterOf, nearestOpening, openingCount, primaryOpening,
} from '../props/letters.js';
import {
  styleOf as propStyleOf, clampDim, fitDims, gapPointsOf, styleDims, GAP_POINTS, CAR_STYLES, tiltOf,
} from '../props/types.js';
import { isRoomType, ROOM_SIZE_MIN, ROOM_SIZE_MAX } from '../props/room.js';

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
/*
 * 3 since the micro class landed. A version 2 document has no `trackClass`
 * and normalize defaults it to 'full', which is what every one of them is,
 * so nothing that exists changes meaning. A version 2 READER meeting a
 * version 3 micro document reads it best effort, drops the field it does not
 * know, and draws a RaceGOW course as a full sized one, which is a picture
 * that is wrong rather than a crash: that is the documented behaviour of
 * this schema and the reason the version went up rather than the field being
 * smuggled in at 2.
 */
export const SCHEMA_VERSION = 3;

/* How a pass of a stacked gate is reached from the one before it on the same stack: round the left of it as flown, round
 * the right, or over the front in a loop (figures.js). The default, when none is said, is left for neighbouring
 * levels and over the front for a leap. */
export const WRAPS = ['left', 'right', 'over'];

/* The whoop room before it grew to 10 by 12 m, the only other size it has
 * ever had: see the migration at the foot of normalize(). */
const OLD_ROOM = Object.freeze({ width: 5, depth: 6 });

/* The sizes a gate cannot do without: see the repair in normalize(). */
const GATE_SIZES = ['clearW', 'clearH', 'levelPitch'];

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

/*
 * A STICKER: a decal that wears one piece of its logo rather than the whole
 * of it. `crop` is that piece, { x, y, w, h }, as shares of the logo
 * picture's width and height with y counted down from its top edge, the way
 * a picture is read. It exists because a map carries at most LOGO_SLOTS
 * logos and the board holds each to a size, so a sticker bomb of a hundred
 * stickers is one sheet in one slot and a hundred decals that each say which
 * piece of it they are. src/maps/built/ground.js draws every sticker cut
 * from one sheet as one mesh on one texture.
 *
 * Returns the piece, or null for a decal that wears its whole logo: no
 * crop, or one that is not a rectangle inside the picture. A piece narrower
 * than CROP_MIN of the sheet is not one, because it would be a pixel.
 */
export const CROP_MIN = 0.001;
export function cropOf(el) {
  const c = el?.crop;
  if (!c || typeof c !== 'object') {
    return null;
  }
  const x = Number(c.x);
  const y = Number(c.y);
  const w = Number(c.w);
  const h = Number(c.h);
  if (![x, y, w, h].every(Number.isFinite) || x < 0 || y < 0 || w < CROP_MIN || h < CROP_MIN
    || x + w > 1 + 1e-9 || y + h > 1 + 1e-9) {
    return null;
  }
  return { x, y, w, h };
}

/*
 * WHAT FINDING A DECAL IS CALLED, or '' for one that is only paint. A decal
 * with an achievement is found the way a partner's mark is (seesMark in
 * src/game/egg.js): fly up to it and look at it, and the callout says this
 * word. Short, because it is lettered across the screen.
 */
export const ACHIEVEMENT_MAX = 24;
export function achievementOf(el) {
  const a = typeof el?.achievement === 'string' ? el.achievement.trim() : '';
  return a.length <= ACHIEVEMENT_MAX ? a : a.slice(0, ACHIEVEMENT_MAX);
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
 * A ROAD'S NODES, read. Each is { x, y }, metres from the road's position.
 * A node that is not two finite numbers within ROAD_NODE_REACH of the
 * position is dropped, and past ROAD_NODES_MAX the rest are; `bad` and
 * `over` count them for normalize's note. The same reading on the way out,
 * so a node list edited in memory writes what the next read will keep.
 */
function roadNodesRead(raw) {
  const out = { nodes: [], bad: 0, over: 0 };
  for (const nd of Array.isArray(raw) ? raw : []) {
    const x = nd && typeof nd === 'object' ? Number(nd.x) : NaN;
    const y = nd && typeof nd === 'object' ? Number(nd.y) : NaN;
    if (!Number.isFinite(x) || !Number.isFinite(y)
      || Math.abs(x) > ROAD_NODE_REACH || Math.abs(y) > ROAD_NODE_REACH) {
      out.bad += 1;
      continue;
    }
    if (out.nodes.length >= ROAD_NODES_MAX) {
      out.over += 1;
      continue;
    }
    out.nodes.push({ x: num(x), y: num(y) });
  }
  return out;
}

/* A vehicle's style: one of the town's cars, the first when it names none
 * this build knows. */
function vehicleStyleOf(style) {
  return CAR_STYLES.includes(style) ? style : CAR_STYLES[0];
}

/* How long a new road is, m: two nodes, the second this far east of the
 * first. The road tool lays its own nodes; this is only so that a road made
 * any other way is a road and not a point. */
const NEW_ROAD_LENGTH = 20;

/*
 * A MAP'S SCENE: its time of day and its ground, the two things that change
 * a map's mood more than any one asset does (FREESTYLE-MAPS-PLAN.md, 3.1).
 *
 * The first of each list is the default and is what every built map looked
 * like before the block existed: golden hour over a concrete yard. So a map
 * that never chose one looks as it always did, and toPlain writes the block
 * only when a map has chosen something else, which keeps the bytes of every
 * map saved before this and of the starter. Only a map has a scene: a race
 * track is flown on the race field, which reads none of it, so normalize
 * does not carry one onto a race track and no race track's bytes change.
 *
 * What each value looks like is src/maps/built/looks.js's business. This is
 * only the vocabulary, so the document can be checked without a renderer.
 */
export const SCENE_TIMES = ['golden', 'noon', 'dusk', 'overcast'];
export const SCENE_GROUNDS = ['concrete', 'tarmac', 'grass', 'dirt'];
export const SCENE_DEFAULT = Object.freeze({ time: SCENE_TIMES[0], ground: SCENE_GROUNDS[0] });

/* A map's scene, always both keys and always known values. A race track
 * and a map written before scenes existed both answer the default. */
export function sceneOf(doc) {
  const s = doc && doc.scene && typeof doc.scene === 'object' ? doc.scene : {};
  return {
    time: SCENE_TIMES.includes(s.time) ? s.time : SCENE_DEFAULT.time,
    ground: SCENE_GROUNDS.includes(s.ground) ? s.ground : SCENE_DEFAULT.ground,
  };
}

/* Whether a scene is the default one, which is the one toPlain leaves out. */
export function isDefaultScene(scene) {
  return scene.time === SCENE_DEFAULT.time && scene.ground === SCENE_DEFAULT.ground;
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
  /* A vehicle whose road was deleted still names it, so that id is not
   * free: handed to the next element placed, it would put the car on a
   * road, or a building, nobody put it on. */
  const named = doc.elements.filter((e) => typeof e.road === 'string' && e.road).map((e) => e.road);
  return nextId([...doc.elements.map((e) => e.id), ...named], 'el');
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

/*
 * WHO MADE THE TRACK, AND WHERE IT CAME FROM.
 *
 * Optional, and absent on everything a pilot builds themselves: their own
 * tracks are theirs and the board already knows whose seat published them.
 * It exists for tracks that came from SOMEWHERE ELSE, where the person who
 * brought a layout over is not the person who designed it. The RaceGOW5
 * set is exactly that case: eight tracks by seven different designers,
 * published as one series, and crediting the series to whoever imported
 * them would misstate seven people's work.
 *
 * Every field is a plain string and every one is optional. Nothing here is
 * trusted or rendered as markup: `designer` and the rest are drawn as text.
 */
function creditOf(src) {
  const c = src && typeof src === 'object' ? src : null;
  if (!c) {
    return null;
  }
  const s = (v) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 120) : '');
  const out = {
    designer: s(c.designer),
    series: s(c.series),
    sponsor: s(c.sponsor),
    source: s(c.source),
    broughtOverBy: s(c.broughtOverBy),
    note: s(c.note),
  };
  /* An object with nothing in it is worse than no object: it would put an
   * empty byline on a card. */
  return Object.values(out).some(Boolean) ? out : null;
}

export function createTrack(name, cls = TRACK_CLASS_DEFAULT, mode = 'race') {
  const freestyle = mode === 'freestyle';
  /* Defaulted here rather than in the signature so a caller that only wants
   * to name the class can pass undefined for the name, which every one of
   * app.js's six call sites does. */
  name = name ?? (freestyle ? 'Untitled map' : 'Untitled track');
  /* A freestyle map is always the full sized class. */
  if (freestyle) {
    cls = 'full';
  }
  const stamp = nowUtc();
  const T = tuningFor(cls, freestyle ? 'freestyle' : 'race');
  const doc = {
    schemaVersion: SCHEMA_VERSION,
    id: newTrackId(),
    name,
    createdUtc: stamp,
    modifiedUtc: stamp,
    /*
     * WHAT KIND OF TRACK THIS IS, and it is a property of the track rather
     * than of the pilot. 'full' is the sixty metre field flown on a 5 inch;
     * 'micro' is a RaceGOW room flown on a 65 mm whoop. The two are
     * different objects: different element sizes, a different field, a
     * different grid, different warnings and a lap that is three seconds
     * rather than thirty.
     */
    trackClass: TRACK_CLASSES.includes(cls) ? cls : TRACK_CLASS_DEFAULT,
    field: {
      width: T.fieldWidth,
      depth: T.fieldDepth,
      gridSize: T.gridSize,
    },
    settings: {
      tangentScale: T.tangentScale,
      minCurveRadius: T.minCurveRadius,
      samplesPerSegment: T.samplesPerSegment,
    },
    /*
     * What the course is dressed in: up to five sponsors' logos, in the
     * order they are handed out round the gates. Empty by default, so a
     * track costs nothing until somebody uploads something.
     */
    branding: { logos: [] },
    /* A track a pilot builds is their own and carries no byline. */
    credit: null,
    elements: [],
    sequence: [],
  };
  if (freestyle) {
    /* Only written when it is freestyle: see DOC_MODES in elements.js. */
    doc.mode = 'freestyle';
    /* Held on every map in memory, so the builder's controls always have
     * something to show; written only once it is not the default. */
    doc.scene = { ...SCENE_DEFAULT };
  }
  return doc;
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
  /* The dimensions, the tilt and the starting height all come from the
   * TRACK'S class, so a gate dropped on a RaceGOW room is 711 mm across and
   * one dropped on a field is 1524. Copied out of elements.js rather than
   * referenced, because the document has to stay readable on its own and
   * because editing a default must not silently resize a track somebody
   * already flew. */
  const cls = trackClassOf(doc);
  const el = {
    id: newElementId(doc),
    type,
    name: '',
    position: {
      x: num(position.x),
      y: num(position.y),
      z: num(position.z ?? defaultZ(type, cls)),
    },
    yaw: num(yaw),
    pitch: num(defaultPitch(type, cls)),
    yawOverridden: false,
    dims: defaultDims(type, cls),
  };
  if (def.kind === KIND.ANNOTATION) {
    el.text = 'Label';
  }
  if (isLetterPiece(type)) {
    /* A letter is named for its letter, which is how the card, the warnings and the strip call it; the name is
     * the author's to change, and changing the letter keeps it in step only while it is still this one. */
    el.letter = LETTER_DEFAULT;
    el.name = letterName(LETTER_DEFAULT);
  }
  if (def.flagSide) {
    el.flagSide = def.flagSide;
  }
  if (def.kind === KIND.STRUCTURE || def.kind === KIND.ZONE) {
    /* A freestyle asset: its look, and the size that look starts at. */
    if (def.styles) {
      el.style = def.styles[0];
      Object.assign(el.dims, styleDims(type, el.style) ?? {});
    }
    if (def.kind === KIND.ZONE) {
      el.points = GAP_POINTS[1];
      el.name = 'GAP';
    }
  }
  if (def.kind === KIND.ROAD) {
    /* Paint on the ground, turned by its nodes and not by a heading. */
    el.position.z = 0;
    el.yaw = 0;
    el.pitch = 0;
    el.nodes = [{ x: 0, y: 0 }, { x: NEW_ROAD_LENGTH, y: 0 }];
    el.closed = false;
  }
  if (def.kind === KIND.VEHICLE) {
    /* Where it is comes from its road and its offset: see schema.md. */
    el.position = { x: 0, y: 0, z: 0 };
    el.yaw = 0;
    el.pitch = 0;
    el.style = def.styles[0];
    Object.assign(el.dims, styleDims(type, el.style) ?? {});
    el.road = '';
    el.reverse = false;
    el.drift = false;
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
  /*
   * AN OBSTACLE CANNOT BE A STEP, and this refuses one rather than making an
   * entry the next reload will delete. normalize keeps only sequenceable
   * elements, so a step on a barrier or a horizontal pole survived until the
   * document was written and read back and then silently vanished, taking
   * the author's flying order with it. Refusing here means the caller finds
   * out at the moment it asks.
   */
  if (!isSequenceable(el)) {
    throw new Error(`${el.type} is not something a lap can pass through or round`);
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
    /*
     * FROM THE PLACED ELEMENT, not from the type's default, and the micro
     * class is what made this matter.
     *
     * A pole on a RaceGOW track carries a clearance of 14 inches, which is
     * the distance the diagrams dimension between a pole and a gate. Read
     * off the TYPE it was 1.5 m, the five inch flag's, which on a five metre
     * room is a scoring square wider than the course. It was also already
     * wrong in the small way: an author who widened a flag's clearance and
     * then added a second pass through it got the factory number back.
     *
     * The type stays as the fallback for an element whose dims have somehow
     * lost the field.
     */
    clearance: def.kind === KIND.MARKER
      ? num(el?.dims?.clearance ?? def.dims.clearance)
      : null,
    overridden: false,
  };
  return entry;
}

/* What a letter piece is called until its author calls it something else. */
export function letterName(letter) {
  return `Letter ${letter}`;
}

/* A letter piece that has just been made, made the letter asked for: its own size, and its name. */
export function initLetter(el, letter) {
  const next = letterOf(letter);
  el.letter = next;
  Object.assign(el.dims, letterDimsFor(next));
  el.name = letterName(next);
  return el;
}

/*
 * TURN A LETTER INTO ANOTHER LETTER, in place: the same piece, standing where it stood and facing the way it faced,
 * as another letter. It keeps the author's scale (a letter stretched half as wide again again is another letter
 * stretched the same, see letterDimsFor), keeps its name if the name was the one it was given, and keeps its
 * place in the flying order: a pass through the old letter's primary hole is a pass through the new letter's
 * primary hole, and a pass through any other is the nearest hole the new letter has. Returns true when the
 * document changed.
 */
export function setLetter(doc, elementId, letter) {
  const el = elementById(doc, elementId);
  if (!el || !isLetterPiece(el)) {
    return false;
  }
  const next = letterOf(letter);
  const was = letterOfPiece(el);
  if (next === was && el.letter === next) {
    return false;
  }
  const wasPrimary = primaryOpening(was);
  Object.assign(el.dims, letterDimsFor(next, el));
  if (!el.name || el.name === letterName(was)) {
    el.name = letterName(next);
  }
  el.letter = next;
  const count = openingCount(next);
  for (const s of doc.sequence) {
    if (s.elementId === elementId) {
      const index = s.apertureIndex ?? 0;
      s.apertureIndex = index === wasPrimary ? primaryOpening(next) : Math.min(index, count - 1);
    }
  }
  return true;
}

/*
 * Build or take away one side of an aperture's frame. See FRAME_SIDES in
 * elements.js. Returns true when the document changed.
 *
 * Putting a side back on a gap in the lattice turns the gap into a gate
 * with the other three sides missing, which is the same opening with one
 * pipe more: the two spellings mean one thing, and this keeps only the one
 * that can say it.
 */
export function setSideBuilt(doc, elementId, side, built) {
  const el = elementById(doc, elementId);
  if (!el || kindOf(el) !== KIND.APERTURE || !FRAME_SIDES.includes(side)) {
    return false;
  }
  if (el.unbuilt === true) {
    if (!built) {
      return false;
    }
    delete el.unbuilt;
    el.unbuiltSides = FRAME_SIDES.filter((s) => s !== side);
    return true;
  }
  const missing = normalizeUnbuiltSides(el.unbuiltSides);
  const has = missing.includes(side);
  if (has !== Boolean(built)) {
    return false;
  }
  const next = built ? missing.filter((s) => s !== side) : normalizeUnbuiltSides([...missing, side]);
  if (next.length) {
    el.unbuiltSides = next;
  } else {
    delete el.unbuiltSides;
  }
  /* Taking a whole side away covers every stretch of it, so none is written beside it. */
  if (Array.isArray(el.unbuiltPoles) && !built) {
    const rest = el.unbuiltPoles.filter((k) => !k.startsWith(`${side}:`));
    if (rest.length) {
      el.unbuiltPoles = rest;
    } else {
      delete el.unbuiltPoles;
    }
  }
  return true;
}

/*
 * Build or take away one opening's stretch of one upright of a stack. See unbuiltPolesOf in elements.js.
 * Returns true when the document changed. A stretch of a whole upright that is already gone is nothing to
 * take away, so it answers false; putting one back on a whole upright that is gone gives back the other stretches
 * and leaves just the ones that were not asked for missing, which is the same thing said the finer way. When every
 * stretch of an upright is gone the upright is, and is written as that.
 */
export function setPoleBuilt(doc, elementId, side, index, built) {
  const el = elementById(doc, elementId);
  if (!el || kindOf(el) !== KIND.APERTURE || !POLE_SIDES.includes(side) || isLetterPiece(el)
    || el.unbuilt === true || apertureShapeOf(el) !== 'square') {
    return false;
  }
  const count = apertureLevels(el.dims).length;
  if (count < 2 || !Number.isInteger(index) || index < 0 || index >= count) {
    return false;
  }
  const whole = normalizeUnbuiltSides(el.unbuiltSides);
  const wasWhole = whole.includes(side);
  const wasGone = wasWhole || unbuiltPolesOf(el).includes(poleKey(side, index));
  if (wasGone === !built) {
    return false;
  }
  /* The stretches of this upright that are gone after the change, by opening. */
  const gone = new Set();
  for (let i = 0; i < count; i += 1) {
    if (wasWhole || unbuiltPolesOf(el).includes(poleKey(side, i))) {
      gone.add(i);
    }
  }
  if (built) {
    gone.delete(index);
  } else {
    gone.add(index);
  }
  const keep = unbuiltPolesOf(el).filter((k) => !k.startsWith(`${side}:`));
  let sides = whole.filter((s) => s !== side);
  if (gone.size === count) {
    sides = normalizeUnbuiltSides([...sides, side]);
  } else {
    for (const i of gone) {
      keep.push(poleKey(side, i));
    }
  }
  if (sides.length) {
    el.unbuiltSides = sides;
  } else {
    delete el.unbuiltSides;
  }
  el.unbuiltPoles = keep;
  const cleaned = unbuiltPolesOf(el);
  if (cleaned.length) {
    el.unbuiltPoles = cleaned;
  } else {
    delete el.unbuiltPoles;
  }
  return true;
}

/*
 * Set one opening of a stack to a size of its own, or give it back the stack's. `patch` is `{ clearW?, clearH? }`: a
 * length sets that side of the opening, `null` takes the override away. A size that is no length (not a number, or
 * not above zero) is refused and the document is not touched, so nothing downstream is ever handed a NaN. Returns
 * true when the document changed. The list is kept only while some opening differs (openingSizesOf in elements.js).
 */
export function setOpeningSize(doc, elementId, index, patch) {
  const el = elementById(doc, elementId);
  if (!el || kindOf(el) !== KIND.APERTURE || isLetterPiece(el) || apertureShapeOf(el) !== 'square') {
    return false;
  }
  const count = Math.max(1, Math.round(el.dims.levels));
  if (count < 2 || !Number.isInteger(index) || index < 0 || index >= count) {
    return false;
  }
  for (const key of ['clearW', 'clearH']) {
    if (patch[key] !== undefined && patch[key] !== null
      && !(typeof patch[key] === 'number' && Number.isFinite(patch[key]) && patch[key] > 0)) {
      return false;
    }
  }
  const before = JSON.stringify(el.dims.openings ?? null);
  const list = [];
  for (let i = 0; i < count; i += 1) {
    list.push({ ...(Array.isArray(el.dims.openings) && el.dims.openings[i] ? el.dims.openings[i] : {}) });
  }
  for (const key of ['clearW', 'clearH']) {
    if (patch[key] === null) {
      delete list[index][key];
    } else if (patch[key] !== undefined) {
      list[index][key] = patch[key];
    }
  }
  const kept = openingSizesOf({ ...el.dims, openings: list });
  if (kept) {
    el.dims.openings = kept;
  } else {
    delete el.dims.openings;
  }
  return JSON.stringify(el.dims.openings ?? null) !== before;
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

/* The longest a group's name is kept. It is an id the builder makes ("grp-3"), and this is only a bound. */
const GROUP_NAME_MAX = 40;

/*
 * PIECES THAT ARE ONE PIECE. A cube is five or six gates, one for each face, that share their pipe, and
 * moving one face of it is not a thing anybody means, so the faces carry a `group` and a selection of one
 * is a selection of all. Nothing else in the document knows: every face is an ordinary gate to the path,
 * the course, the race and the views, which is the reason a cube can be made of them.
 *
 * The members of the group an element is in, itself among them, or just itself when it is in none. An id
 * that is not in the document has no members.
 */
export function groupMembers(doc, id) {
  const el = elementById(doc, id);
  if (!el) {
    return [];
  }
  return el.group ? doc.elements.filter((e) => e.group === el.group) : [el];
}

/* A selection, grown to every piece of every group it touches. An id that is not in the document is kept as
 * it came, and nothing is added for it. */
export function expandGroups(doc, ids) {
  const out = new Set();
  for (const id of ids) {
    out.add(id);
    const el = elementById(doc, id);
    if (el && el.group) {
      for (const e of doc.elements) {
        if (e.group === el.group) {
          out.add(e.id);
        }
      }
    }
  }
  return out;
}

/* A name for a new group that no piece in the document has. */
export function newGroupId(doc) {
  const taken = new Set(doc.elements.map((e) => e.group).filter(Boolean));
  let n = taken.size + 1;
  while (taken.has(`grp-${n}`)) {
    n += 1;
  }
  return `grp-${n}`;
}

export function startPadsOf(doc) {
  return doc.elements.find((e) => kindOf(e) === KIND.START);
}

/* The openings of one element, bottom to top. Empty for anything that is not
 * an aperture element.
 *
 * An opening says what SHAPE it is only when it is not a square (a hoop's is
 * 'circle', a hex gate's is 'hex'), so a gate's opening has the keys it has
 * always had and nothing that reads one is handed a word it does not know. */
export function aperturesOf(el) {
  if (kindOf(el) !== KIND.APERTURE) {
    return [];
  }
  if (isLetterPiece(el)) {
    return letterLayoutOf(el).apertures;
  }
  const levels = apertureLevels(el.dims);
  const shape = apertureShapeOf(el);
  return shape === 'square' ? levels : levels.map((ap) => ({ ...ap, shape }));
}

/*
 * THE LETTER'S LAYOUT, in the document's frame: where each tube, joint and hole is for this piece's letter and
 * its size, with x along the piece's widthAxis and y up from its base. One layout for every reader, which is
 * what keeps the room, the plan, the card and the game from each drawing a W of their own. It is cached by
 * letter and size, because the views ask for it on every frame and it is the same until the piece is edited.
 * READ ONLY: what comes back is shared.
 *
 * A letter reads the right way round from the side a pilot approaches it, flying along its normal, and
 * widthAxis is the pilot's LEFT from there, so the layout is the mirror of the one the pilot sees.
 *
 * `apertures` is the same holes in the shape aperturesOf gives every opening: each hole's polygon is relative
 * to its own point (centerX across, centerH up), which is where the racing line goes through it.
 */
const LETTER_LAYOUTS = new Map();

export function letterLayoutOf(el) {
  const letter = letterOfPiece(el);
  const key = `${letter}|${el.dims.clearW}|${el.dims.clearH}`;
  let laid = LETTER_LAYOUTS.get(key);
  if (!laid) {
    laid = layoutLetter(letter, el.dims.clearW, el.dims.clearH, LETTER_TUBE_OD / 2, { mirror: true });
    laid.apertures = Object.freeze(laid.openings.map((o) => Object.freeze({
      index: o.index,
      sillH: o.sillH,
      centerH: o.cy,
      centerX: o.cx,
      clearW: o.clearW,
      clearH: o.clearH,
      shape: 'poly',
      /* A hole too small for its pipe has no area, and is a hole with no corners: nothing scores. */
      poly: o.ok ? o.poly.map(([x, y]) => [x - o.cx, y - o.cy]) : [],
    })));
    if (LETTER_LAYOUTS.size > 256) {
      LETTER_LAYOUTS.clear();
    }
    LETTER_LAYOUTS.set(key, laid);
  }
  return laid;
}

/* The point of an opening the racing line goes through: the piece's position, across by centerX and up by
 * centerH. Only a letter's openings have an across, so for everything else this is what it always was. */
function openingPoint(el, ap) {
  if (!ap.centerX) {
    return { x: el.position.x, y: el.position.y, z: el.position.z + ap.centerH };
  }
  const f = apertureFrame(el.yaw, el.pitch);
  return {
    x: el.position.x + f.widthAxis.x * ap.centerX,
    y: el.position.y + f.widthAxis.y * ap.centerX,
    z: el.position.z + ap.centerH + f.widthAxis.z * ap.centerX,
  };
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
    return openingPoint(el, ap);
  }
  return { x: el.position.x, y: el.position.y, z: el.position.z };
}

/* How wide a piece stands across, for the readers that want one width of a stack whose openings may differ: the
 * widest opening, or, with `top`, the top one, which is what the header board and the pennants sit on. */
export function gateWidthOf(el, top = false) {
  const aps = aperturesOf(el);
  if (!aps.length) {
    return el.dims?.clearW ?? 0;
  }
  return top ? aps[aps.length - 1].clearW : Math.max(...aps.map((ap) => ap.clearW));
}

/* The world centre of one opening, by index. Used by both views. */
export function apertureCenter(el, index) {
  const aps = aperturesOf(el);
  const ap = aps[Math.min(Math.max(0, index), aps.length - 1)];
  if (!ap) {
    return { ...el.position };
  }
  return openingPoint(el, ap);
}

/*
 * WHICH HOLE A POINT IS NEAREST, for the Fly order tool and a click on a letter: the hole the point is in,
 * else the one whose racing line point is nearest. `point` is a world point (x, y, z). For a gate that is
 * decided by height alone (apertureAt in passes.js); a letter's holes can stand side by side at one height,
 * so this looks across as well.
 */
export function openingNearest(el, point) {
  const aps = aperturesOf(el);
  if (aps.length < 2) {
    return 0;
  }
  if (!isLetterPiece(el)) {
    let best = 0;
    let gap = Infinity;
    aps.forEach((ap, i) => {
      const d = Math.abs(el.position.z + ap.centerH - (point?.z ?? 0));
      if (d < gap) {
        gap = d;
        best = i;
      }
    });
    return best;
  }
  const f = apertureFrame(el.yaw, el.pitch);
  const across = (point.x - el.position.x) * f.widthAxis.x + (point.y - el.position.y) * f.widthAxis.y;
  return nearestOpening(letterLayoutOf(el), across, (point.z ?? 0) - el.position.z);
}

/* The unsigned normal of an element's aperture plane. Every opening on one
 * structure shares it, because they share the structure. */
export function elementNormal(el) {
  return apertureFrame(el.yaw, el.pitch).normal;
}

export function topOf(el) {
  /* Style and tilt, for the assets: a container stood on end is as tall as it
   * is long, and which length depends on its style. */
  return el.position.z + elementHeight(defOf(el), el.dims, isLetterPiece(el) ? el.letter : propStyleOf(el), tiltOf(el));
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

  /* The class is settled first because it decides what a size that is not
   * there means. `base` is a five inch track, so a whoop document with no
   * field, or one whose field was damaged, would come back as a room sixty
   * metres across with its gates in one corner of it. It is the room. (Until
   * the room migration below was narrowed to the old 5 by 6 alone, every
   * whoop document whose field was not 10 by 12 was forced to the room, and
   * this case was covered by accident. It is covered on purpose now, and
   * without the shift that used to come with it.) Every other class keeps
   * the defaults it always had. */
  const cls = src.mode === 'freestyle' ? 'full'
    : (TRACK_CLASSES.includes(src.trackClass) ? src.trackClass : TRACK_CLASS_DEFAULT);
  const room = cls === 'micro' ? tuningFor('micro') : null;

  const doc = {
    schemaVersion: SCHEMA_VERSION,
    id: str(src.id, base.id),
    name: str(src.name, 'Untitled track'),
    createdUtc: str(src.createdUtc, base.createdUtc),
    modifiedUtc: str(src.modifiedUtc, base.modifiedUtc),
    /* Defaulted to 'full' rather than repaired, because a document without
     * one is a document written before micro tracks existed and every one of
     * those IS full sized. A repair note here would cry wolf on every track
     * in the repository. */
    trackClass: TRACK_CLASSES.includes(src.trackClass) ? src.trackClass : TRACK_CLASS_DEFAULT,
    field: {
      width: Math.max(5, num(src.field?.width, room ? room.fieldWidth : base.field.width)),
      depth: Math.max(5, num(src.field?.depth, room ? room.fieldDepth : base.field.depth)),
      /* 0.005 rather than 0.1: a RaceGOW grid is one inch, 0.0254, and a
       * floor of a tenth of a metre is a MultiGP field's assumption. */
      gridSize: Math.max(0.005, num(src.field?.gridSize, room ? room.gridSize : base.field.gridSize)),
    },
    settings: {
      tangentScale: Math.max(0.01, num(src.settings?.tangentScale, base.settings.tangentScale)),
      minCurveRadius: Math.max(0.1, num(src.settings?.minCurveRadius, base.settings.minCurveRadius)),
      samplesPerSegment: int(src.settings?.samplesPerSegment, base.settings.samplesPerSegment, 4, 512),
    },
    branding: { logos: [] },
    /* Null for anything a pilot built. See creditOf. */
    credit: creditOf(src.credit),
    elements: [],
    sequence: [],
  };
  /* A freestyle map, which is always full sized. Anything else is a race
   * track, which is what every document written before maps existed is. */
  if (src.mode === 'freestyle') {
    doc.mode = 'freestyle';
    doc.trackClass = 'full';
    /* The scene, repaired to the default one key at a time: a map asking
     * for a time this build has never heard of still keeps the ground it
     * asked for. No block at all is silent, because that is every map
     * written before scenes existed. */
    doc.scene = sceneOf(src);
    if (src.scene !== undefined) {
      const raw = src.scene && typeof src.scene === 'object' ? src.scene : null;
      if (!raw) {
        repairs.push(`the scene was not an object, read as ${SCENE_DEFAULT.time} over ${SCENE_DEFAULT.ground}.`);
      } else {
        if (raw.time !== undefined && raw.time !== doc.scene.time) {
          repairs.push(`the scene's time of day "${String(raw.time).slice(0, 40)}" is not one this build knows, read as ${SCENE_DEFAULT.time}.`);
        }
        if (raw.ground !== undefined && raw.ground !== doc.scene.ground) {
          repairs.push(`the scene's ground "${String(raw.ground).slice(0, 40)}" is not one this build knows, read as ${SCENE_DEFAULT.ground}.`);
        }
      }
    }
  }

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
      repairs.push(`dropped ${overflowed} logo${overflowed === 1 ? '' : 's'} past the ${LOGO_SLOTS} a track carries or past the ${Math.round(BRANDING_MAX_CHARS / 1024)} kB they share.`);
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
    /* Cars drive on maps and nowhere else (FREESTYLE-MAPS-PLAN.md decision
     * 9), so a race track carries neither a road nor a vehicle, and no race
     * track's bytes change for their existing. */
    const traffic = isTrafficType(type);
    if (traffic && doc.mode !== 'freestyle') {
      repairs.push(`dropped a ${def.label.toLowerCase()}: roads and vehicles are a map's only.`);
      continue;
    }
    /* A letter is a five inch race piece: the whoop palette and a map's do not have one, and nothing on either
     * would build it. */
    if (isLetterPiece(type) && (doc.mode === 'freestyle' || doc.trackClass === 'micro')) {
      repairs.push(`dropped a letter: letters are a five inch track's, and this is ${doc.mode === 'freestyle' ? 'a map' : 'a whoop track'}.`);
      continue;
    }
    let id = str(rawEl.id);
    if (!id || seenIds.has(id)) {
      id = nextId([...seenIds, ...rawIds], 'el');
      repairs.push(`an element had a missing or duplicate id, renamed to ${id}.`);
    }
    seenIds.add(id);

    const dims = {};
    const isProp = def.kind === KIND.STRUCTURE || def.kind === KIND.ZONE;
    /* The letter a letter piece is, read before its sizes because a size that is missing or is no size is the one
     * THAT letter starts at. A word that is not one of the twenty six is the default, and says so. */
    const letter = isLetterPiece(type) ? letterOf(rawEl.letter) : null;
    if (letter && rawEl.letter !== undefined && String(rawEl.letter).trim().toUpperCase() !== letter) {
      repairs.push(`${id}: letter "${String(rawEl.letter).slice(0, 20)}" is not one of A to Z, so it is ${letter}.`);
    }
    for (const key of Object.keys(def.dims)) {
      const wanted = num(rawEl.dims?.[key], def.dims[key]);
      /* Levels is a count and everything else is a length. Both have to be
       * positive or the structure has no geometry at all. A freestyle
       * asset's dimensions are clamped into its own limits, which is what
       * keeps a hand edited ninety storey warehouse out of the physics. */
      dims[key] = isProp
        ? num(clampDim(type, key, wanted))
        : (traffic ? num(clampByLimits(def, key, wanted))
          : (key === 'levels' ? int(wanted, def.dims[key], 1, 24) : Math.max(0, wanted)));
      /*
       * A GATE OF NO SIZE HAS NO OPENING. The clamp above stops a length going
       * negative and lets it stay zero, so a document with a gate 0 m wide was
       * read back as exactly that: nothing could be flown through it and
       * nothing in the builder could say why. These three are the sizes a gate
       * cannot do without; a sill height of zero is a gate on the floor and a
       * flag's clearance of zero is a waypoint, so they are left alone. What a
       * new gate of this class starts at is the size it is repaired to, and the
       * note names the gate and the size so the author can put it right.
       */
      if (def.kind === KIND.APERTURE && GATE_SIZES.includes(key) && !(dims[key] > 0)) {
        const fallback = letter ? letterDimsFor(letter)[key] : defaultDims(type, doc.trackClass)[key];
        repairs.push(`${id}: ${key} was ${wanted}, which is not a size a gate can have, so it is ${fallback} m, what a new ${def.label.toLowerCase()} starts at.`);
        dims[key] = fallback;
      }
      /*
       * A TABLE NOTHING WIDE HAS NO TOP, and one 400 m long is not in a room. The
       * three sizes of a piece of furniture are held to what a room can have
       * (src/props/room.js), so the drawing, the solids and the warnings never
       * meet a box that is not one. A size that is not a length is what a new
       * piece starts at; one that is too large is the most a room takes.
       */
      if (isRoomType(type) && !(dims[key] >= ROOM_SIZE_MIN && dims[key] <= ROOM_SIZE_MAX)) {
        const fallback = dims[key] > ROOM_SIZE_MAX ? ROOM_SIZE_MAX : defaultDims(type, doc.trackClass)[key];
        repairs.push(`${id}: ${key} was ${wanted}, which is not a size a ${def.label.toLowerCase()} can have, so it is ${fallback} m.`);
        dims[key] = fallback;
      }
    }
    /* Dimensions that hold one another to a limit, now each is in its own. */
    if (isProp) {
      fitDims(type, dims);
    }

    /*
     * A HOOP AND A HEX GATE HAVE ONE OPENING. There is no such thing as a stack of hoops, and
     * the builder and the game draw one frame each, so a document that says otherwise is read
     * as the one it can draw, and says so.
     */
    if (def.kind === KIND.APERTURE && apertureShapeOf(type) !== 'square' && !letter && dims.levels !== 1) {
      repairs.push(`${id}: a ${def.label.toLowerCase()} has one opening, so its levels was ${dims.levels} and is 1.`);
      dims.levels = 1;
    }
    /* Each opening of a stack its own size: see openingSizesOf in elements.js. Only a stack of square openings has the
     * list, and it is kept only when some opening differs, so every gate that has ever been saved reads as it was. */
    if (def.kind === KIND.APERTURE && rawEl.dims?.openings !== undefined) {
      const kept = apertureShapeOf(type) === 'square' && !letter && dims.levels > 1 ? openingSizesOf({ ...dims, openings: rawEl.dims.openings }) : null;
      if (kept) {
        dims.openings = kept;
      } else if (rawEl.dims.openings !== null && (!Array.isArray(rawEl.dims.openings) || rawEl.dims.openings.some((o) => o && typeof o === 'object' && Object.keys(o).length))) {
        repairs.push(`${id}: its openings list named no size that differs from the stack's, so every opening is the stack's size.`);
      }
    }
    /*
     * A LETTER HAS AS MANY HOLES AS ITS LETTER DOES, and stands on the ground. Its `levels` is that count and is
     * not the author's to set, so it is read from the letter without a word (a document this builder wrote has it
     * right), and a sill height is the one thing a letter has no use for: the pipe is on the floor.
     */
    if (letter) {
      dims.levels = openingCount(letter);
      if (dims.sillH !== 0) {
        repairs.push(`${id}: a letter stands on the ground, so its sill height was ${dims.sillH} and is 0.`);
        dims.sillH = 0;
      }
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
    if (letter) {
      /* Upright: the pipe of a letter is a plane that stands on the ground. */
      if (el.pitch !== 0) {
        repairs.push(`${id}: a letter stands upright, so its tilt was ${Math.round((el.pitch * 180) / Math.PI)} degrees and is 0.`);
        el.pitch = 0;
      }
      el.letter = letter;
    }
    /* An asset that stands on end holds the pitch it is built at: upright or a
     * quarter turn either way, so the inspector never shows 50 degrees for a
     * container that is flat, the way the heading of a building is read to the
     * compass. (tiltOf reads the pitch to the nearest quarter.) */
    if (def.kind === KIND.STRUCTURE && ELEMENTS[type]?.tilt) {
      el.pitch = tiltOf({ type, pitch: el.pitch }) * (Math.PI / 2) + 0;
    }
    /* An asset may be sunk, to hide some of it, but not out of reach of its
     * own inspector: see SINK_MAX in elements.js. Nothing else is held to a
     * floor here, as it never was. */
    if (def.kind === KIND.STRUCTURE && el.position.z < -SINK_MAX) {
      repairs.push(`${id}: its base was ${el.position.z} m, further under the ground than the ${SINK_MAX} m an asset may be sunk, so it is -${SINK_MAX} m.`);
      el.position.z = -SINK_MAX;
    }
    if (isProp && def.styles) {
      el.style = propStyleOf({ type, style: rawEl.style });
    }
    if (def.kind === KIND.ZONE) {
      el.points = gapPointsOf(rawEl.points);
    }
    if (def.kind === KIND.DECAL) {
      /* Kept even when no logo carries this id, because the logos are read
       * above and a decal naming one that was dropped for size should say
       * so in the builder rather than silently repaint itself with the
       * first sponsor's logo. logoForDecal returns null for it. */
      el.logoId = str(rawEl.logoId, '');
      /* A sticker's piece of its sheet and what finding it is called (see
       * cropOf and achievementOf), kept only when they are one. */
      const crop = cropOf(rawEl);
      if (crop) {
        el.crop = crop;
      }
      const achievement = achievementOf(rawEl);
      if (achievement) {
        el.achievement = achievement;
      }
    }
    if (def.kind === KIND.ROAD) {
      /* Paint: on the ground, and turned by its nodes. Written 0. */
      el.position.z = 0;
      el.yaw = 0;
      el.pitch = 0;
      const read = roadNodesRead(rawEl.nodes);
      if (rawEl.nodes !== undefined && !Array.isArray(rawEl.nodes)) {
        repairs.push(`road ${id}'s nodes were not a list, read as none.`);
      }
      if (read.bad) {
        repairs.push(`road ${id}: dropped ${read.bad} node${read.bad === 1 ? '' : 's'} that ${read.bad === 1 ? 'was' : 'were'} not a point within ${ROAD_NODE_REACH / 1000} km of the road.`);
      }
      if (read.over) {
        repairs.push(`road ${id}: dropped ${read.over} node${read.over === 1 ? '' : 's'} past the ${ROAD_NODES_MAX} a road keeps.`);
      }
      el.nodes = read.nodes;
      el.closed = rawEl.closed === true;
      el.yawOverridden = false;
    }
    if (def.kind === KIND.VEHICLE) {
      /* Where it is comes from its road and offset alone. Written 0. A
       * vehicle whose road is not in the document is KEPT: the builder says
       * so, and src/maps/built/traffic.js leaves it parked with a problem. */
      el.position = { x: 0, y: 0, z: 0 };
      el.yaw = 0;
      el.pitch = 0;
      el.style = vehicleStyleOf(rawEl.style);
      el.road = str(rawEl.road, '');
      el.reverse = rawEl.reverse === true;
      el.drift = rawEl.drift === true;
      el.yawOverridden = false;
    }
    if (def.flagSide) {
      el.flagSide = normalizeFlagSide(rawEl.flagSide, def.flagSide);
    }
    /* A piece that may carry flags and does not by default, a hurdle: only when it says so, and
     * then with the mast height beside it, so a barrier with none is the bytes it was. */
    if (def.flagsOptional && rawEl.flagSide !== undefined) {
      if (FLAG_SIDES.includes(rawEl.flagSide)) {
        el.flagSide = rawEl.flagSide;
        const mast = num(rawEl.dims?.flagH, GATE_FLAG_H);
        el.dims.flagH = mast > 0 ? mast : GATE_FLAG_H;
      } else {
        repairs.push(`${id}: flagSide was not left, right, both or top, so it has no flags.`);
      }
    }
    /* An opening with no frame of its own: see isUnbuilt in elements.js.
     * Carried only on apertures, because nothing else has a frame to
     * leave off, and only when true, so an ordinary gate's JSON is the
     * same shape it was before this existed. */
    if (def.kind === KIND.APERTURE && rawEl.unbuilt === true) {
      el.unbuilt = true;
    }
    /* A length of frame pipe rather than a race piece: see isPvcPipe in elements.js. */
    if (PVC_TYPES.includes(el.type) && rawEl.pvc === true) {
      el.pvc = true;
    }
    /* The sides taken away one at a time: see FRAME_SIDES in elements.js.
     * Kept only on apertures and only when something is missing, so an
     * ordinary gate reads back the same shape it was written. A name that
     * is not a side is dropped and said, because it is somebody's edit. */
    if (def.kind === KIND.APERTURE && rawEl.unbuiltSides !== undefined && !letter) {
      const sides = normalizeUnbuiltSides(rawEl.unbuiltSides);
      const raw = Array.isArray(rawEl.unbuiltSides) ? rawEl.unbuiltSides : [rawEl.unbuiltSides];
      if (raw.some((side) => !FRAME_SIDES.includes(side))) {
        repairs.push(`${id} named a frame side that is not top, bottom, left or right, and it was dropped.`);
      }
      if (sides.length) {
        el.unbuiltSides = sides;
      }
    }
    /* One opening's stretch of an upright, on a stack: see unbuiltPolesOf in elements.js. Cleaned against the piece
     * as it stands, so a stretch of an opening it does not have, or of an upright that is already gone, is dropped. */
    if (def.kind === KIND.APERTURE && rawEl.unbuiltPoles !== undefined && !letter) {
      const poles = unbuiltPolesOf({ ...el, unbuiltPoles: Array.isArray(rawEl.unbuiltPoles) ? rawEl.unbuiltPoles : [] });
      const named = Array.isArray(rawEl.unbuiltPoles) ? rawEl.unbuiltPoles.length : 1;
      if (poles.length !== named) {
        repairs.push(`${id} named an upright stretch it does not have, and it was dropped.`);
      }
      if (poles.length) {
        el.unbuiltPoles = poles;
      }
    }
    /* A group: elements that are one piece and are edited together, which is what a cube is (five or six
     * gates, each a face). Kept on apertures, and only when it is a name, so an ordinary gate's JSON is
     * the shape it was and nothing can put a number or an object there. What a group means lives in
     * groupMembers, above. */
    if (def.kind === KIND.APERTURE && rawEl.group !== undefined) {
      if (typeof rawEl.group === 'string') {
        if (rawEl.group.trim() !== '') {
          el.group = rawEl.group.slice(0, GROUP_NAME_MAX);
        }
      } else {
        repairs.push(`${id}: group was not a name, so it is on its own.`);
      }
    }
    /* The dress a gate wears besides the MultiGP one: see GATE_STYLES in elements.js. Only on an
     * aperture and only when it is one this build knows. A style this build has never heard of is
     * the usual dress and is said, because it is somebody's edit or a newer build's. */
    if (def.kind === KIND.APERTURE && rawEl.style !== undefined && !letter) {
      if (GATE_STYLES.includes(rawEl.style)) {
        el.style = rawEl.style;
      } else {
        repairs.push(`${id}: style "${String(rawEl.style).slice(0, 40)}" is not a dress this build knows, so it wears the usual one.`);
      }
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
      repairs.push(`dropped a sequence entry for a ${def.label}, which is never part of the track.`);
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
      const count = aperturesOf(el).length;
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
      /* Same rule as createSequenceEntry: the element's own, then the
       * type's. A document that stores a clearance keeps it either way; this
       * is only the fallback for one that does not. */
      const owner = doc.elements.find((e) => e.id === elementId);
      clearance = Math.max(0, num(rawSeq.clearance, owner?.dims?.clearance ?? def.dims.clearance));
    }

    /* HOW THE LINE GETS HERE FROM THE PASS BEFORE, when that was another opening of the same stack: round its left,
     * round its right, or looping out over the front. Written only when it was said, so a document that never
     * said keeps the bytes it had, and a reader that does not know the word flies the default wrap. */
    const wrap = def.kind === KIND.APERTURE && WRAPS.includes(rawSeq.wrap) ? rawSeq.wrap : null;

    doc.sequence.push({
      id,
      elementId,
      apertureIndex,
      entry,
      passSide,
      clearance,
      overridden: bool(rawSeq.overridden),
      ...(wrap ? { wrap } : {}),
    });
  }

  /*
   * A MICRO DOCUMENT FOLLOWS THE ROOM, AND KEEPS ITS LAYOUT WHILE IT DOES.
   *
   * The room is one place, src/trackbuilder/racegow.js, and it changed size:
   * 5 by 6 m became 10 by 12. Every micro document written before that
   * carries the old field, and a document's field is not decoration. It is
   * the frame the builder draws, the boundary its warnings test against, and
   * the ORIGIN: trackdoc.js maps a stored position to the world as
   * `x - field.width / 2`, so the field is what centres a track in the room.
   *
   * Leaving the old field alone would put a 5 by 6 boundary inside 10 by 12
   * walls in the builder while the game centred the track anyway. Growing it
   * without moving anything would shove the whole layout 2.5 m left and 3 m
   * back, because every position is measured from a corner that just moved.
   * So both happen together: the field becomes the room's and every element
   * shifts by half the growth, which is exactly the offset that leaves the
   * track where its author put it relative to the middle of the floor.
   *
   * Silent, with no repair note. The author did nothing wrong and their
   * track has not been damaged; the room grew underneath it.
   *
   * ONCE, ON THE OLD ROOM AND NOTHING ELSE. This used to run for any micro
   * document whose field was not 10 by 12, which is every document an author
   * had resized in the inspector, so the size they typed was thrown away on
   * the next read and their track shifted by half the difference. Only 5 by 6
   * was ever the room (racegow.js has had no other), so only 5 by 6 is
   * brought up. A room resized to exactly 5 by 6 is brought up as well, which
   * is harmless: the shift keeps the track where it stood about the middle,
   * and the game centres on the field either way.
   */
  if (doc.trackClass === 'micro' && doc.field.width === OLD_ROOM.width && doc.field.depth === OLD_ROOM.depth) {
    const T = tuningFor('micro');
    const dx = (T.fieldWidth - doc.field.width) * 0.5;
    const dy = (T.fieldDepth - doc.field.depth) * 0.5;
    if (dx !== 0 || dy !== 0) {
      for (const el of doc.elements) {
        el.position.x += dx;
        el.position.y += dy;
      }
      doc.field.width = T.fieldWidth;
      doc.field.depth = T.fieldDepth;
    }
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
  const freestyle = docModeOf(doc) === 'freestyle';
  const scene = sceneOf(doc);
  return {
    schemaVersion: SCHEMA_VERSION,
    id: doc.id,
    name: doc.name,
    createdUtc: doc.createdUtc,
    modifiedUtc: doc.modifiedUtc,
    /* WRITTEN, not derived. It was missing from the first version of this
     * and the failure was invisible in every unit test and obvious the
     * moment a micro track was flown: the document round tripped, the
     * builder kept drawing a room because it held the live object, and the
     * GAME read the saved file, found no class, defaulted to full, and put a
     * RaceGOW course on a sixty metre paddock. A field that is not written
     * is a field that does not exist. */
    trackClass: trackClassOf(doc),
    ...(freestyle ? { mode: 'freestyle' } : {}),
    /* A map's scene, and only once it is not the default: see SCENE_TIMES. */
    ...(freestyle && !isDefaultScene(scene) ? { scene } : {}),
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
    /*
     * WRITTEN, for the same reason trackClass is. This function is a
     * whitelist, and credit was added to normalize and to createTrack and
     * not here, so every save, every export and every publish to the board
     * dropped the designer's name on the floor: a pilot who opened a
     * RaceGOW5 track and saved it had a copy credited to nobody, and one
     * who published it put it on the public board that way. Found by
     * driving the builder, saving a preset, and reading the library back.
     * Filtered through creditOf on the way out as on the way in, so a hand
     * edit between a normalize and a save cannot write anything else.
     */
    credit: creditOf(doc.credit),
    /* A race track carries no roads and no vehicles, even ones added in
     * memory, so no race track's bytes change for their existing. */
    elements: doc.elements.filter((el) => freestyle || !isTrafficType(el.type)).map((el) => {
      const def = ELEMENTS[el.type];
      /* A road is paint turned by its nodes, a vehicle is wherever its road
       * puts it: what normalize writes 0, this writes 0, so what is written
       * is what the next read keeps. */
      const road = def.kind === KIND.ROAD;
      const vehicle = def.kind === KIND.VEHICLE;
      const out = {
        id: el.id,
        type: el.type,
        name: el.name ?? '',
        position: vehicle
          ? { x: 0, y: 0, z: 0 }
          : { x: num(el.position.x), y: num(el.position.y), z: road ? 0 : num(el.position.z) },
        yaw: road || vehicle ? 0 : num(el.yaw),
        pitch: road || vehicle ? 0 : num(el.pitch),
        yawOverridden: road || vehicle ? false : Boolean(el.yawOverridden),
        dims: {},
      };
      /* Dimension keys in the order elements.js declares them, so two
       * elements of the same type always print the same shape. */
      const isProp = def.kind === KIND.STRUCTURE || def.kind === KIND.ZONE;
      for (const key of Object.keys(def.dims)) {
        out.dims[key] = isProp
          ? num(clampDim(el.type, key, el.dims[key]))
          : (road || vehicle ? num(clampByLimits(def, key, el.dims[key]))
            : (key === 'levels' ? int(el.dims[key], def.dims[key], 1, 24) : num(el.dims[key], def.dims[key])));
      }
      if (isProp) {
        fitDims(el.type, out.dims);
      }
      if (def.kind === KIND.APERTURE && Array.isArray(el.dims.openings)) {
        const kept = apertureShapeOf(el.type) === 'square' && !isLetterPiece(el) ? openingSizesOf({ ...el.dims, ...out.dims, openings: el.dims.openings }) : null;
        if (kept) {
          out.dims.openings = kept;
        }
      }
      /* A letter says which one it is, has the holes that letter has, stands on the ground and upright. */
      const letter = isLetterPiece(el) ? letterOfPiece(el) : null;
      if (letter) {
        out.letter = letter;
        out.dims.levels = openingCount(letter);
        out.dims.sillH = 0;
        out.pitch = 0;
      }
      if (road) {
        out.nodes = roadNodesRead(el.nodes).nodes;
        out.closed = el.closed === true;
      }
      if (vehicle) {
        out.style = vehicleStyleOf(el.style);
        out.road = str(el.road, '');
        out.reverse = el.reverse === true;
        out.drift = el.drift === true;
      }
      if (def.kind === KIND.ANNOTATION) {
        out.text = el.text ?? '';
      }
      if (isProp && def.styles) {
        out.style = propStyleOf(el);
      }
      if (def.kind === KIND.ZONE) {
        out.points = gapPointsOf(el.points);
      }
      if (def.kind === KIND.DECAL) {
        out.logoId = str(el.logoId, '');
        /* Written only on a sticker, so every other decal is the JSON it
         * was. */
        const crop = cropOf(el);
        if (crop) {
          out.crop = { x: num(crop.x), y: num(crop.y), w: num(crop.w), h: num(crop.h) };
        }
        const achievement = achievementOf(el);
        if (achievement) {
          out.achievement = achievement;
        }
      }
      if (def.flagSide) {
        out.flagSide = normalizeFlagSide(el.flagSide, def.flagSide);
      }
      if (def.flagsOptional && FLAG_SIDES.includes(el.flagSide)) {
        out.flagSide = el.flagSide;
        out.dims.flagH = num(el.dims?.flagH > 0 ? el.dims.flagH : GATE_FLAG_H);
      }
      if (el.unbuilt === true && def.kind === KIND.APERTURE) {
        out.unbuilt = true;
      }
      if (isPvcPipe(el)) {
        out.pvc = true;
      }
      if (def.kind === KIND.APERTURE) {
        const sides = normalizeUnbuiltSides(el.unbuiltSides);
        if (sides.length && !letter) {
          out.unbuiltSides = sides;
        }
        const poles = unbuiltPolesOf(el);
        if (poles.length && !letter) {
          out.unbuiltPoles = poles;
        }
        if (typeof el.group === 'string' && el.group.trim() !== '') {
          out.group = el.group.slice(0, GROUP_NAME_MAX);
        }
        if (GATE_STYLES.includes(el.style) && !letter) {
          out.style = el.style;
        }
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
      ...(WRAPS.includes(s.wrap) ? { wrap: s.wrap } : {}),
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
