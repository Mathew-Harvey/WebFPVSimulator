/*
 * bundle.js: a track as a folder of files another program can read and a
 * person can build from.
 *
 * WHAT IT IS FOR. A group of friends races a new whoop track every week, each
 * at their own pace, in the style of RaceGOW but whenever they like. The app
 * that holds the week's track needs the track as DATA (so it can draw its own
 * page, count its own pieces and open it in the simulator), as PICTURES (a
 * map, a lap animation and some views of the room with and without the line),
 * and as INSTRUCTIONS (what to buy, where to stand every piece, in what order
 * to fly). This file makes the first and the last and the map; the pictures
 * that need a GL context are views.js and animate.js, and the browser side
 * that puts it all in one zip is app.js's exportBundle.
 *
 * WHAT IT REUSES, and says so because it is the point. The line is the
 * builder's own racing line, buildPath(doc, { closeLoop: true }): the same one
 * the lap animation flies and the builder draws, closed on the first gate
 * flown because that is what a lap is in this discipline. The pieces and the
 * parts list are buildsheet.js's, so the bundle's numbers and the printed
 * build sheet's cannot disagree. Nothing here derives a second line or counts
 * a second pipe.
 *
 * THE FORMAT is documented in BUNDLE-FORMAT.md and versioned here. Every key a
 * reader needs is in bundle.json; a reader that wants more reads track.json,
 * which is the builder's own document and opens in the builder and the
 * simulator as it is.
 *
 * Pure, like the builder's other data modules: no DOM and no Three.js, so the
 * self test builds bundles in Node.
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

import { buildPath } from './path.js';
import {
  buildSheet, sheetHtml, compass, membersOf, mergeMembers,
} from './buildsheet.js';
import { gateNumbers } from './sequence.js';
import { serialize, aperturesOf, elementById } from './model.js';
import { trackClassOf, labelOf } from './elements.js';
import { crc32 } from './zip.js';
import {
  LAPS_COUNTED, PIPE_OD, ROOM_HEIGHT, inches,
} from './racegow.js';

/* The two numbers a reader checks before anything else. */
export const BUNDLE_FORMAT = 'webfpv.track-bundle';
export const BUNDLE_VERSION = 1;

/*
 * THE FILES, by role. A reader finds a file by role in bundle.json's `files`
 * and never by name, so a name can change without a version.
 */
export const FILES = {
  data: 'bundle.json',
  document: 'track.json',
  instructions: 'instructions.html',
  map: 'map.svg',
  lap: 'lap.gif',
};

/*
 * THE STILL VIEWS. Azimuth is the direction FROM the middle of the track TO the
 * camera, counter clockwise from east in the document's own frame (so 45 is the
 * north east corner of the room, looking back at the track), elevation is above
 * the floor. They are fixed to the compass and not to the track's own long axis
 * so that two weeks' tracks are shot from the same corners and a pilot who has
 * learned that "the south west view" is the side nearest the door keeps it.
 * Each view is shot twice, with the line and without it.
 */
export const VIEWS = [
  { id: 'southwest', label: 'From the south west, high', azimuthDeg: 225, elevationDeg: 42 },
  { id: 'northeast', label: 'From the north east, high', azimuthDeg: 45, elevationDeg: 42 },
  { id: 'southeast-low', label: 'From the south east, low', azimuthDeg: 315, elevationDeg: 16 },
];

/* A picture's path inside the bundle. `route` is whether the line is drawn. */
export const viewPath = (view, route) => `views/${view.id}-${route ? 'route' : 'obstacles'}.png`;

/* The size of the stills, wide like the room is. */
export const VIEW_SIZE = { width: 800, height: 500 };

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;',
}[c]));

const mm = (m) => Math.round(m * 1000) / 1000;

/* The track's name reduced to something safe on every platform. The same rule
 * as storage.js's slugOf, kept here because storage.js pulls in every preset
 * and this file is meant to stay light; the self test checks the two agree. */
export function trackSlug(doc) {
  return String(doc.name || 'track')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'track';
}

export const bundleFilename = (doc) => `${trackSlug(doc)}.webfpv.zip`;

/* ------------------------------------------------------------------ */
/* The line                                                            */
/* ------------------------------------------------------------------ */

/*
 * THE LINE AS EVENLY SPACED POINTS, step metres apart along it, from the first
 * gate round to the first gate again. The builder's own samples are denser
 * where the line bends and sparser where it runs straight, which is right for
 * drawing and wrong for a reader that wants "where is the quad after 3 m".
 * Even spacing means the index IS the distance: point i is at i * step.
 */
export function evenRoute(path, step = 0.1) {
  const s = path.samples;
  if (s.length < 2 || path.length <= 0) {
    return [];
  }
  const n = Math.max(1, Math.round(path.length / step));
  const out = [];
  let at = 0;
  for (let i = 0; i <= n; i += 1) {
    const want = (path.length * i) / n;
    while (at < s.length - 2 && s[at + 1].s < want) {
      at += 1;
    }
    const a = s[at];
    const b = s[at + 1];
    const span = b.s - a.s;
    const t = span > 1e-9 ? Math.min(1, Math.max(0, (want - a.s) / span)) : 0;
    out.push([
      mm(a.pos.x + (b.pos.x - a.pos.x) * t),
      mm(a.pos.y + (b.pos.y - a.pos.y) * t),
      mm(a.pos.z + (b.pos.z - a.pos.z) * t),
    ]);
  }
  return out;
}

/* The arc length of the line at a knot: the sample nearest to it. */
function arcAt(path, pos) {
  let best = 0;
  let bestD = Infinity;
  for (const sm of path.samples) {
    const d = (sm.pos.x - pos.x) ** 2 + (sm.pos.y - pos.y) ** 2 + (sm.pos.z - pos.z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = sm.s;
    }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* The data                                                            */
/* ------------------------------------------------------------------ */

/*
 * Everything a reader needs, as one JSON-safe object. `files` is left for the
 * caller to fill in once the other files exist (bundleManifest below).
 *
 * `now` is an ISO time, the caller's, so the same track made twice at one
 * instant is the same bytes; it defaults to the clock only here.
 */
export function bundleData(doc, { now = new Date().toISOString(), step = 0.1, sheet = null, path = null } = {}) {
  const cls = trackClassOf(doc);
  const line = path || buildPath(doc, { closeLoop: true });
  const sh = sheet || buildSheet(doc);
  const numbers = gateNumbers(doc);

  /* The passes, in flying order: one per numbered entry of the sequence. A
   * waypoint pins the line and scores nothing, so it has no number and no row. */
  const gates = [];
  for (const knot of line.knots) {
    if (!knot.seq || (knot.role !== 'aperture' && knot.role !== 'marker')) {
      continue;
    }
    const number = numbers.get(knot.seq.id);
    const el = elementById(doc, knot.seq.elementId);
    if (number == null || !el) {
      continue;
    }
    const levels = aperturesOf(el);
    const ap = levels[Math.min(Math.max(0, knot.seq.apertureIndex ?? 0), levels.length - 1)];
    const t = knot.tangent;
    const tl = Math.hypot(t.x, t.y, t.z) || 1;
    gates.push({
      number,
      elementId: el.id,
      type: el.type,
      label: labelOf(el.type, cls),
      /* 'aperture' is a pass through an opening, 'marker' is a pass round a pole or cone. */
      pass: knot.role,
      apertureIndex: knot.seq.apertureIndex ?? 0,
      position: { x: mm(el.position.x), y: mm(el.position.y), z: mm(el.position.z) },
      yawRad: mm(el.yaw),
      pitchRad: mm(el.pitch),
      /* The opening this pass goes through, in metres. Null for a marker. */
      opening: ap && knot.role === 'aperture'
        ? { widthM: mm(ap.clearW), heightM: mm(ap.clearH), sillM: mm(ap.sillH) }
        : null,
      /* Where the line crosses it, which way the quad is going there, and how
       * far round the lap that is. */
      passPoint: { x: mm(knot.pos.x), y: mm(knot.pos.y), z: mm(knot.pos.z) },
      direction: { x: mm(t.x / tl), y: mm(t.y / tl), z: mm(t.z / tl) },
      lapDistanceM: mm(arcAt(line, knot.pos)),
    });
  }

  let tightest = null;
  if (line.tightest && Number.isFinite(line.tightest.radius)) {
    tightest = { radiusM: mm(line.tightest.radius), lapDistanceM: mm(line.tightest.s) };
  }

  const pieces = sh.pieces.map((p) => ({
    key: p.key,
    numbers: p.numbers,
    type: p.type,
    label: p.label,
    xM: mm(p.x),
    yM: mm(p.y),
    heights: p.heights.map((h) => ({ bottomM: mm(h.bottom), topM: mm(h.top) })),
    faces: p.faces,
    frameRuns: p.runs,
    note: p.note,
    elementIds: p.elementIds,
  }));

  return {
    format: BUNDLE_FORMAT,
    formatVersion: BUNDLE_VERSION,
    createdUtc: now,
    generator: 'WebFPVSimulator builder',
    track: {
      id: doc.id,
      name: doc.name || 'Untitled track',
      class: cls,
      schemaVersion: doc.schemaVersion,
      modifiedUtc: doc.modifiedUtc,
      credit: doc.credit || null,
    },
    units: {
      length: 'metre',
      angle: 'radian',
      frame: 'x east, y north, z up, right handed. A yaw is counter clockwise from east.',
      origin: 'The document frame, unless a key says it is measured from the build corner.',
    },
    room: {
      widthM: mm(doc.field.width),
      depthM: mm(doc.field.depth),
      heightM: cls === 'micro' ? ROOM_HEIGHT : null,
    },
    lap: {
      closed: line.closed,
      lengthM: mm(line.length),
      gateCount: gates.length,
      /* RaceGOW's metric, and so the natural one for a weekly time trial: the
       * fastest three consecutive laps. Null on a class that has no such rule. */
      lapsCounted: cls === 'micro' ? LAPS_COUNTED : null,
      tightest,
    },
    gates,
    route: {
      closed: line.closed,
      spacingM: step,
      lengthM: mm(line.length),
      points: evenRoute(line, step),
    },
    build: {
      cornerFrom: sh.cornerLabel,
      /* Subtract this from a document coordinate to get a build sheet one. */
      originM: { x: mm(sh.origin.x), y: mm(sh.origin.y) },
      boundsM: { width: mm(sh.bounds.width), depth: mm(sh.bounds.depth) },
      gateOpeningM: mm(sh.opening),
      pipeOutsideDiameterM: mm(PIPE_OD),
      pieces,
      parts: {
        sections: { count: sh.parts.sections.count, lengthM: mm(sh.parts.sections.length) },
        cuts: sh.parts.cuts.map((c) => ({ lengthM: mm(c.length), count: c.count })),
        fittings: sh.parts.fittings,
        poles: sh.parts.poles.map((p) => ({ heightM: mm(p.height), count: p.count })),
        bars: sh.parts.bars.map((b) => ({ lengthM: mm(b.length), heightM: mm(b.height), count: b.count })),
        other: sh.parts.other,
      },
      notes: sh.notes,
    },
    views: VIEWS.map((v) => ({
      id: v.id,
      label: v.label,
      azimuthDeg: v.azimuthDeg,
      elevationDeg: v.elevationDeg,
      route: viewPath(v, true),
      obstacles: viewPath(v, false),
    })),
    files: [],
  };
}

/* ------------------------------------------------------------------ */
/* The map                                                             */
/* ------------------------------------------------------------------ */

/* The line's colour by height: blue at the floor to red at the top of the
 * line. Two flat colours blended by hand, so the map needs no colour library. */
const LOW = [59, 130, 246];
const HIGH = [239, 68, 68];
const ramp = (t) => {
  const k = Math.min(1, Math.max(0, t));
  return `rgb(${LOW.map((c, i) => Math.round(c + (HIGH[i] - c) * k)).join(',')})`;
};

/*
 * THE 2D MAP, north up, as a standalone SVG: the pieces where they stand, the
 * line drawn through them coloured by height, an arrow along it every so often
 * for the way round, the start, and the number of every pass. It is in the
 * document's frame and fitted to the track, not to the 10 by 12 m room, so a
 * track a few metres across fills the picture. A scale bar and a north arrow
 * say what the picture is, because it travels without its page.
 */
export function mapSvg(doc, { sheet = null, path = null, data = null } = {}) {
  const line = path || buildPath(doc, { closeLoop: true });
  const sh = sheet || buildSheet(doc);
  const info = data || bundleData(doc, { sheet: sh, path: line });
  const pts = info.route.points;

  /* The box that holds the pieces and the line. */
  let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
  const grow = (x, y) => {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  };
  for (const p of sh.pieces) {
    for (const s of p.shape) { grow(s.x + sh.origin.x, s.y + sh.origin.y); }
  }
  for (const p of pts) { grow(p[0], p[1]); }
  if (!Number.isFinite(minX)) {
    minX = 0; maxX = 1; minY = 0; maxY = 1;
  }
  const margin = 0.6;
  minX -= margin; maxX += margin; minY -= margin; maxY += margin;
  const wM = Math.max(1, maxX - minX);
  const hM = Math.max(1, maxY - minY);
  const SCALE = 900 / Math.max(wM, hM);
  const W = Math.round(wM * SCALE);
  const H = Math.round(hM * SCALE);
  const X = (x) => Math.round((x - minX) * SCALE * 10) / 10;
  const Y = (y) => Math.round((maxY - y) * SCALE * 10) / 10;

  const out = [];
  out.push(`<rect width="${W}" height="${H}" fill="#0b1620"/>`);

  /* A grid every half metre, heavier every metre, on the room's own floor so a
   * square on the map is a square of the floor. */
  const gridOut = [];
  for (let x = Math.ceil(minX * 2) / 2; x <= maxX; x += 0.5) {
    const major = Math.abs(x - Math.round(x)) < 1e-6;
    gridOut.push(`<path d="M${X(x)} 0V${H}" stroke="#1d3144" stroke-width="${major ? 1.4 : 0.7}"/>`);
  }
  for (let y = Math.ceil(minY * 2) / 2; y <= maxY; y += 0.5) {
    const major = Math.abs(y - Math.round(y)) < 1e-6;
    gridOut.push(`<path d="M0 ${Y(y)}H${W}" stroke="#1d3144" stroke-width="${major ? 1.4 : 0.7}"/>`);
  }
  out.push(`<g>${gridOut.join('')}</g>`);

  /*
   * The pieces. Pipe is drawn as the pipe there is: every straight run between
   * two fittings, seen from above, so a gate is the line its frame makes and a
   * stack is one line, and an upright is a dot. What is not pipe (a hoop, a
   * cone, a table) is drawn from the sheet's footprint, moved back out of the
   * sheet's frame.
   */
  const pieceOut = [];
  for (const m of mergeMembers(membersOf(doc))) {
    if (Math.hypot(m.b.x - m.a.x, m.b.y - m.a.y) < 0.02) {
      pieceOut.push(`<circle cx="${X(m.a.x)}" cy="${Y(m.a.y)}" r="4.5" fill="#f08a3c"/>`);
    } else {
      pieceOut.push(`<path d="M${X(m.a.x)} ${Y(m.a.y)}L${X(m.b.x)} ${Y(m.b.y)}" stroke="#f08a3c" stroke-width="5" stroke-linecap="round"/>`);
    }
  }
  for (const p of sh.pieces) {
    if (p.kind === 'aperture' && p.shape.length && !p.type.includes('hoop')) {
      continue;
    }
    if (p.type === 'pole' || p.type === 'horizontalPole') {
      continue;
    }
    const poly = p.shape.map((s2) => `${X(s2.x + sh.origin.x)},${Y(s2.y + sh.origin.y)}`).join(' ');
    if (p.type === 'cone') {
      pieceOut.push(`<polygon points="${poly}" fill="#f0b03c" stroke="#f0b03c" stroke-width="2"/>`);
    } else {
      pieceOut.push(`<polygon points="${poly}" fill="#5b6b7a" fill-opacity="0.45" stroke="#8a9aaa" stroke-width="2"/>`);
    }
  }
  out.push(`<g>${pieceOut.join('')}</g>`);

  /* The line, a short stretch at a time so each takes its height's colour. */
  let zMax = 0.3;
  for (const p of pts) { zMax = Math.max(zMax, p[2]); }
  const lineOut = [];
  for (let i = 0; i + 1 < pts.length; i += 1) {
    const a = pts[i];
    const b = pts[i + 1];
    lineOut.push(`<path d="M${X(a[0])} ${Y(a[1])}L${X(b[0])} ${Y(b[1])}" stroke="${ramp(((a[2] + b[2]) / 2) / zMax)}" stroke-width="5" stroke-linecap="round"/>`);
  }
  out.push(`<g fill="none">${lineOut.join('')}</g>`);

  /* An arrow about every 1.5 m for the way round. */
  const every = Math.max(2, Math.round(1.5 / info.route.spacingM));
  const arrows = [];
  for (let i = every; i + 1 < pts.length; i += every) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = X(b[0]) - X(a[0]);
    const dy = Y(b[1]) - Y(a[1]);
    const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
    arrows.push(`<path d="M-6 -6L7 0L-6 6Z" transform="translate(${X(a[0])} ${Y(a[1])}) rotate(${Math.round(ang)})" fill="#e8f1f8"/>`);
  }
  out.push(`<g>${arrows.join('')}</g>`);

  /* The start: where the lap begins and ends, and the way it goes. Drawn under
   * the numbers, because gate 1 is usually on it. */
  if (pts.length > 1) {
    const a = pts[0];
    const b = pts[Math.min(3, pts.length - 1)];
    const ang = (Math.atan2(Y(b[1]) - Y(a[1]), X(b[0]) - X(a[0])) * 180) / Math.PI;
    out.push(`<g transform="translate(${X(a[0])} ${Y(a[1])}) rotate(${Math.round(ang)})"><path d="M0 0H44M34 -8L46 0L34 8" stroke="#34d399" stroke-width="4" fill="none"/></g>`);
    out.push(`<text x="${X(a[0])}" y="${Y(a[1]) + 40}" font-size="13" font-weight="700" text-anchor="middle" fill="#34d399" font-family="system-ui,sans-serif">START</text>`);
  }

  /* The number of every pass, where the line goes through. Passes that fall on
   * one spot seen from above (a stack flown twice) share one label. */
  const spots = [];
  for (const g of info.gates) {
    const cx = X(g.passPoint.x);
    const cy = Y(g.passPoint.y);
    const near = spots.find((q) => Math.hypot(q.cx - cx, q.cy - cy) < 9);
    if (near) {
      near.numbers.push(g.number);
    } else {
      spots.push({ cx, cy, numbers: [g.number] });
    }
  }
  const nums = spots.map((q) => {
    /* A gate flown many times would print a paragraph: the first three, then how many more. */
    const text = q.numbers.length > 3 ? `${q.numbers.slice(0, 3).join(',')} +${q.numbers.length - 3}` : q.numbers.join(',');
    const w = Math.max(26, 11 * text.length + 12);
    return `<rect x="${q.cx - w / 2}" y="${q.cy - 13}" width="${w}" height="26" rx="13" fill="#0b1620" stroke="#e8f1f8" stroke-width="2"/>`
      + `<text x="${q.cx}" y="${q.cy + 5}" font-size="14" font-weight="700" text-anchor="middle" fill="#e8f1f8" font-family="system-ui,sans-serif">${text}</text>`;
  });
  out.push(`<g>${nums.join('')}</g>`);

  /* A scale bar of one metre, a north arrow, and what the colour means. */
  out.push(`<g font-family="system-ui,sans-serif" font-size="13" fill="#8aa0b4">`
    + `<path d="M24 ${H - 24}H${24 + Math.round(SCALE)}M24 ${H - 30}V${H - 18}M${24 + Math.round(SCALE)} ${H - 30}V${H - 18}" stroke="#8aa0b4" stroke-width="2"/>`
    + `<text x="24" y="${H - 38}">1 m</text>`
    + `<path d="M${W - 30} 58V22M${W - 30} 22l-6 12M${W - 30} 22l6 12" stroke="#8aa0b4" stroke-width="2" fill="none"/>`
    + `<text x="${W - 30}" y="76" text-anchor="middle">N</text>`
    + `<defs><linearGradient id="h" x1="0" x2="1"><stop offset="0" stop-color="${ramp(0)}"/><stop offset="1" stop-color="${ramp(1)}"/></linearGradient></defs>`
    + `<rect x="${W - 150}" y="${H - 34}" width="120" height="8" fill="url(#h)"/>`
    + `<text x="${W - 150}" y="${H - 40}">line height</text>`
    + `<text x="${W - 150}" y="${H - 8}">0 m</text>`
    + `<text x="${W - 30}" y="${H - 8}" text-anchor="end">${Math.round(zMax * 100) / 100} m</text>`
    + `</g>`);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Map of ${esc(info.track.name)}, north up">`
    + `<title>${esc(info.track.name)}, route map</title>${out.join('')}</svg>`;
}

/* ------------------------------------------------------------------ */
/* The instructions                                                    */
/* ------------------------------------------------------------------ */

const CSS = `
:root { color-scheme: light dark; }
body { font: 15px/1.5 system-ui, sans-serif; margin: 0; background: #f6f4ef; color: #1b1b1b; }
main { max-width: 210mm; margin: 0 auto; padding: 16px; box-sizing: border-box; background: #fff; }
h1 { margin: 0 0 4px; font-size: 26px; }
h2 { margin: 26px 0 6px; font-size: 18px; border-bottom: 1px solid #ccc; padding-bottom: 2px; }
.meta { color: #444; margin: 0 0 10px; }
.facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px; margin: 12px 0; }
.facts div { border: 1px solid #ccc; border-radius: 6px; padding: 6px 8px; }
.facts b { display: block; font-size: 20px; }
.facts span { color: #555; font-size: 12px; }
img { max-width: 100%; height: auto; display: block; border: 1px solid #ccc; border-radius: 6px; background: #0b1620; }
.pics { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 8px; margin: 8px 0; }
.pics figure { margin: 0; }
.pics figcaption { font-size: 12px; color: #555; margin-top: 2px; }
.tb-sheet-page { max-width: none; margin: 0; padding: 0; }
.tb-sheet-page h1 { display: none; }
.tb-sheet-page h2 { margin: 22px 0 6px; font-size: 18px; border-bottom: 1px solid #ccc; }
.tb-sheet-meta { margin: 0 0 8px; color: #333; }
.tb-sheet-plan { display: block; width: 100%; height: auto; max-height: 150mm; margin: 8px 0; border: 1px solid #999; background: #fff; }
.tb-sheet-table, .order { border-collapse: collapse; width: 100%; margin: 6px 0 14px; font-size: 13px; }
.tb-sheet-table th, .tb-sheet-table td, .order th, .order td { border: 1px solid #999; padding: 3px 6px; text-align: left; vertical-align: top; }
.tb-sheet-table th, .order th { background: #eee; }
.tb-sheet-buy { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 0 14px; align-items: start; }
.tb-sheet-notes { margin: 4px 0; padding-left: 20px; font-size: 12px; color: #333; }
@media print { body { background: #fff; } main { padding: 0; } .tb-sheet-plan, table { break-inside: avoid; } img { border: 0; } }
`;

/*
 * THE INSTRUCTIONS PAGE, one standalone HTML file that opens from the unzipped
 * folder with nothing else: what you are building, the lap in the order it is
 * flown, the pictures, then the build sheet exactly as the builder prints it.
 * `has` says which pictures are in the zip, so the page never points at one
 * that is not there. Every name in it is escaped, because a track's name is
 * text somebody typed.
 */
export function instructionsHtml(doc, data, sheet, has = {}) {
  const t = data.track;
  const lap = data.lap;
  const b = data.build;
  const rows = data.gates.map((g) => {
    const open = g.opening ? `${inches(g.opening.widthM)} by ${inches(g.opening.heightM)}, bottom ${g.opening.sillM < 0.005 ? 'on the floor' : `${inches(g.opening.sillM)} up`}` : 'go round it';
    const dir = compass(Math.atan2(g.direction.y, g.direction.x));
    return `<tr><td>${g.number}</td><td>${esc(g.label)}</td><td>${esc(open)}</td><td>${esc(dir)}</td><td>${esc(inches(g.passPoint.z))}</td><td>${esc(g.lapDistanceM.toFixed(1))} m</td></tr>`;
  }).join('');

  const pics = [];
  if (has.map) {
    pics.push(`<figure><img src="${FILES.map}" alt="Map of the route, north up" width="450"><figcaption>The route from above, north up. Blue is low, red is high.</figcaption></figure>`);
  }
  if (has.lap) {
    pics.push(`<figure><img src="${FILES.lap}" alt="One lap, animated" width="384"><figcaption>One lap.</figcaption></figure>`);
  }
  const stills = [];
  for (const v of data.views) {
    if (v.route) {
      stills.push(`<figure><img src="${v.route}" alt="${esc(v.label)}, with the route" width="400"><figcaption>${esc(v.label)}, with the route.</figcaption></figure>`);
    }
    if (v.obstacles) {
      stills.push(`<figure><img src="${v.obstacles}" alt="${esc(v.label)}, obstacles only" width="400"><figcaption>${esc(v.label)}, obstacles only.</figcaption></figure>`);
    }
  }

  const credit = t.credit && (t.credit.designer || t.credit.series)
    ? `<p class="meta">${esc([t.credit.series, t.credit.designer && `designed by ${t.credit.designer}`].filter(Boolean).join(', '))}</p>`
    : '';

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(t.name)}, build instructions</title><style>${CSS}</style></head>
<body><main>
<h1>${esc(t.name)}</h1>
${credit}<p class="meta">A whoop track for a room. Made with WebFPVSimulator. This folder holds everything needed to build it and to read it back by machine: see bundle.json.</p>
<div class="facts">
<div><b>${lap.gateCount}</b><span>passes a lap</span></div>
<div><b>${esc(lap.lengthM.toFixed(1))} m</b><span>lap length</span></div>
<div><b>${esc(inches(b.boundsM.width))} by ${esc(inches(b.boundsM.depth))}</b><span>floor space the track fills</span></div>
<div><b>${esc(inches(b.gateOpeningM))}</b><span>gate opening</span></div>
${lap.lapsCounted ? `<div><b>${lap.lapsCounted} laps</b><span>fastest ${lap.lapsCounted} in a row counts</span></div>` : ''}
</div>
<h2>How to build it</h2>
<ol>
<li>Clear a floor the size above, plus a metre round it. Mark its south west corner. Every measurement below starts there: X runs east and Y runs north.</li>
<li>Buy and cut what "What to buy" lists, at the end of this page.</li>
<li>Build the pieces in the order of the numbers, putting each where the table says, at the height and facing the way it says.</li>
<li>Dry fit one gate first: fittings differ by maker, and a gate that comes out the wrong size is the wrong size in every place it is built.</li>
<li>Fly the lap in the order below. The lap starts and ends on gate 1.</li>
</ol>
<h2>The lap</h2>
<table class="order"><thead><tr><th>No.</th><th>Piece</th><th>Opening</th><th>Fly it going</th><th>Height of the line</th><th>Round the lap</th></tr></thead><tbody>${rows}</tbody></table>
${pics.length ? `<div class="pics">${pics.join('')}</div>` : ''}
${stills.length ? `<h2>The room</h2><div class="pics">${stills.join('')}</div>` : ''}
${sheetHtml(sheet)}
</main></body></html>
`;
}

/* ------------------------------------------------------------------ */
/* Putting it together                                                 */
/* ------------------------------------------------------------------ */

const TEXT = new TextEncoder();

/* bundle.json as text: indented so a person can read it, with each point of the
 * line on one row rather than three, which is what keeps a long lap legible. */
export function dataText(data) {
  const rows = data.route.points.map((p) => `   [${p.join(', ')}]`).join(',\n');
  const marker = '"@@POINTS@@"';
  const text = JSON.stringify({ ...data, route: { ...data.route, points: '@@POINTS@@' } }, null, 1);
  return `${text.replace(marker, `[\n${rows}\n  ]`)}\n`;
}

/*
 * THE LIST OF FILES for zipStore, in a fixed order, and the manifest written
 * into bundle.json last. `images` is { path: Uint8Array } for the stills the
 * browser rendered, `lap` the GIF's bytes or null. Either may be missing and
 * the bundle is still whole: the data, the document, the map and the page
 * need no GL context, which is what lets a weak machine skip the pictures.
 *
 * Returns { entries, data }, entries ready for zipStore.
 */
export function bundleEntries(doc, { images = {}, lap = null, now = new Date().toISOString() } = {}) {
  const sheet = buildSheet(doc);
  const path = buildPath(doc, { closeLoop: true });
  if (path.knots.length < 2 || path.length <= 0) {
    throw new Error('This track has no lap yet. Sequence at least two elements, then export it.');
  }
  const data = bundleData(doc, { now, sheet, path });
  const has = { map: true, lap: Boolean(lap), views: Object.keys(images).length > 0 };

  const files = [];
  const add = (role, name, bytes, type) => {
    files.push({ role, path: name, type, bytes: bytes.length, crc32: crc32(bytes).toString(16).padStart(8, '0') });
    return { name, data: bytes };
  };
  const entries = [];
  entries.push(add('document', FILES.document, TEXT.encode(serialize(doc)), 'application/json'));
  entries.push(add('map', FILES.map, TEXT.encode(mapSvg(doc, { sheet, path, data })), 'image/svg+xml'));
  for (const v of VIEWS) {
    for (const route of [true, false]) {
      const name = viewPath(v, route);
      if (images[name]) {
        entries.push(add(route ? 'view-route' : 'view-obstacles', name, images[name], 'image/png'));
      }
    }
  }
  if (lap) {
    entries.push(add('lap', FILES.lap, lap, 'image/gif'));
  }
  /* The views the data names are only those that exist. */
  data.views = data.views
    .map((v) => ({ ...v, route: images[v.route] ? v.route : null, obstacles: images[v.obstacles] ? v.obstacles : null }))
    .filter((v) => v.route || v.obstacles);
  entries.push(add('instructions', FILES.instructions, TEXT.encode(instructionsHtml(doc, data, sheet, has)), 'text/html'));
  data.files = files;
  /* bundle.json goes first in the archive so a reader that streams finds it at once. */
  entries.unshift({ name: FILES.data, data: TEXT.encode(dataText(data)) });
  return { entries, data };
}
