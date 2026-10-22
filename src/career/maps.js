/*
 * maps.js: the worlds the career is flown in, as documents.
 *
 * Every lesson world is an ordinary map document, the same format the
 * builder writes and the game builds (src/trackbuilder/schema.md), so the
 * career adds no world code: the freestyle maps are built by
 * src/maps/built/index.js and the race tracks by src/maps/custom.js. Being
 * documents, they are checked by the builder's own warnings
 * (tests/career-maps.test.js), and a pilot can open any of them in the
 * builder and make it their own.
 *
 * THE FRAME is the documents' own: metres, x east, y north, z up, origin at
 * the plot's south west corner, yaw counter clockwise from east. The lessons
 * in ./curriculum.js place their rings and zones in the same frame.
 *
 * THE IDS ARE FIXED because a built map seeds every prop's look from its
 * element's id: a map that rolled new ids would be a different place every
 * time it loaded. A lesson's own pieces get ids after the base's.
 *
 * This file is part of WebFPV.
 *
 * WebFPV is free software: you can redistribute it and/or modify it under
 * the terms of the GNU General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option)
 * any later version.
 *
 * WebFPV is distributed in the hope that it will be useful, but WITHOUT ANY
 * WARRANTY, without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE. See the GNU General Public License for more
 * details.
 *
 * You should have received a copy of the GNU General Public License along
 * with WebFPV. If not, see <https://www.gnu.org/licenses/>.
 */

import { normalize, toPlain } from '../trackbuilder/model.js';

/*
 * EVERY DOCUMENT HERE LEAVES IN THE BUILDER'S OWN FORM: normalised and made
 * plain, as a saved track is. The game fills in what a row leaves out (a
 * gate's level pitch, a flag's pass side and clearance) when it builds a
 * world, but the builder's 3D view draws a document as it is handed one, and
 * a gate with no level pitch drew as NaN there. A pilot opens these in the
 * builder (the Tracks room's Open in the builder, the career's worlds), so
 * they have to be the same document both ways.
 */
function canonical(doc) {
  return JSON.parse(JSON.stringify(toPlain(normalize(doc).doc)));
}

export const EAST = 0;
export const NORTH = Math.PI / 2;
export const WEST = Math.PI;
export const SOUTH = -Math.PI / 2;

/* The credit every shipped WebFPV layout carries, which steam/edition.js's
 * presetAllowed reads as the game's own work. */
export const WEBFPV_CREDIT = Object.freeze({
  designer: 'WebFPV',
  series: 'WebFPV career',
  sponsor: '',
  source: 'designed for the WebFPV career',
  broughtOverBy: '',
  note: '',
});

/* One element from a row: [type, x, y, yaw, dims, extra]. */
function element(id, [type, x, y, yaw, dims = {}, extra = {}], aimed = false) {
  const el = {
    id,
    type,
    name: extra.name ?? '',
    position: { x, y, z: extra.z ?? 0 },
    yaw,
    pitch: extra.pitch ?? 0,
    /* Aimed by hand: the builder re-aims a gate that is not along the line
     * when it opens the document (src/trackbuilder/faces.js), which in a
     * whoop room turns square gates off square. */
    yawOverridden: aimed,
    dims: { ...dims },
  };
  if (extra.style) {
    el.style = extra.style;
  }
  if (extra.points) {
    el.points = extra.points;
  }
  return el;
}

/* A freestyle map: the built world, no gates, no clock of its own.
 * `scene` is its time of day and ground (sceneOf in
 * src/trackbuilder/model.js); left out, the built world's own default. */
export function freestyleDoc(id, name, rows, scene = null) {
  return canonical({
    ...(scene ? { scene: { ...scene } } : {}),
    schemaVersion: 3,
    id,
    name,
    createdUtc: '2026-10-14T00:00:00Z',
    modifiedUtc: '2026-10-14T00:00:00Z',
    trackClass: 'full',
    mode: 'freestyle',
    field: { width: 160, depth: 160, gridSize: 1 },
    settings: { tangentScale: 1.1, minCurveRadius: 2.5, samplesPerSegment: 48 },
    branding: { logos: [] },
    credit: { ...WEBFPV_CREDIT },
    elements: rows.map((r, i) => element(`el-${i + 1}`, r)),
    sequence: [],
  });
}

/*
 * A race track: the race field, gates in a flying order. `gates` are rows
 * whose types are race pieces; `order` lists each flown opening as
 * [row index, aperture index, entry]. Start pads come first so the spawn is
 * on them and the lap is a closed circuit (schema.md). A whoop room passes
 * its own field: ten by twelve metres, a grid in inches, trackClass micro.
 */
export function raceDoc(id, name, {
  width = 60, depth = 40, trackClass = 'full', gridSize = 1, minCurveRadius = 1,
} = {}, rows, order) {
  /* A room's gates face along its two axes, as built (the UTT rules), so
   * they are marked aimed; a field's are left to the builder's line. */
  const elements = rows.map((r, i) => element(`el-${i + 1}`, r, trackClass === 'micro'));
  return canonical({
    schemaVersion: 3,
    id,
    name,
    createdUtc: '2026-10-14T00:00:00Z',
    modifiedUtc: '2026-10-14T00:00:00Z',
    trackClass,
    field: { width, depth, gridSize },
    settings: { tangentScale: 1.1, minCurveRadius, samplesPerSegment: 48 },
    branding: { logos: [] },
    credit: { ...WEBFPV_CREDIT },
    elements,
    sequence: order.map(([row, aperture = 0, entry = 1], i) => ({
      id: `sq-${i + 1}`,
      elementId: elements[row].id,
      apertureIndex: aperture,
      entry,
    })),
  });
}

/* ---------------------------------------------------------------- *
 * The Training Field: open grass in the middle, scenery at the edges for a
 * horizon a beginner can read. The pads are at (80, 25) facing north, so
 * every lesson on it is flown into the open plot ahead.
 * ---------------------------------------------------------------- */

export const FIELD_SPAWN = Object.freeze({ x: 80, y: 25, yaw: NORTH });

function fieldScenery() {
  const rows = [
    /* The pad, one mat, so the craft sits exactly on FIELD_SPAWN. */
    ['startPads', FIELD_SPAWN.x, FIELD_SPAWN.y, FIELD_SPAWN.yaw, { pads: 1, spacing: 1.5, padSize: 0.6 }],
    /* Far landmarks: something to read the horizon and the heading by. */
    ['waterTower', 140, 146, EAST, { height: 15, radius: 3.4, tank: 1.0 }],
    ['chimney', 18, 148, EAST, { height: 30, radius: 1.5 }],
    ['containers', 60, 152, EAST, { stack: 2, variant: 2 }, { style: '40ft' }],
    ['containers', 100, 152, EAST, { stack: 1, variant: 5 }, { style: '40ft' }],
  ];
  /* A line of trees down each side, sakura on the west, street on the east. */
  for (let k = 0; k < 8; k += 1) {
    rows.push(['tree', 8 + (k % 2) * 4, 20 + k * 17, EAST, { size: 1 + (k % 3) * 0.1, variant: k + 1 }, { style: k % 3 === 0 ? 'pine' : 'sakura' }]);
    rows.push(['tree', 152 - (k % 2) * 4, 18 + k * 17, EAST, { size: 1 + (k % 2) * 0.1, variant: k + 11 }, { style: 'street' }]);
  }
  return rows;
}

/* The field plus a lesson's own pieces. Grass at golden hour: a flying
 * field, not a car park, and the light the game is known by. */
export function trainingField(id, name, extra = []) {
  return freestyleDoc(id, name, [...fieldScenery(), ...extra], { time: 'golden', ground: 'grass' });
}

/* ---------------------------------------------------------------- *
 * Gap School: container stacks, a footbridge, a billboard and an office
 * with an arcade, set out down the plot from the pads at (80, 18). Every
 * gap is a named window the map's own gap counter pays (src/game/gaps.js).
 * ---------------------------------------------------------------- */

export const GAP_SPAWN = Object.freeze({ x: 80, y: 18, yaw: NORTH });

/* A 40 ft container is 2.44 m wide; two stacks running north with `gap`
 * metres of air between them, centred on x = cx. */
function containerPair(cx, cy, gap, stack, variantA, variantB) {
  const off = gap / 2 + 1.22;
  return [
    ['containers', cx - off, cy, NORTH, { stack, variant: variantA }, { style: '40ft' }],
    ['containers', cx + off, cy, NORTH, { stack, variant: variantB }, { style: '40ft' }],
  ];
}

export function gapSchool() {
  const rows = [
    ['startPads', GAP_SPAWN.x, GAP_SPAWN.y, GAP_SPAWN.yaw, { pads: 1, spacing: 1.5, padSize: 0.6 }],
    /* The wide gap: 8 m between two stacks three high. */
    ...containerPair(80, 45, 8, 3, 2, 7),
    ['gap', 80, 45, NORTH, { width: 7.2, height: 6.8 }, { z: 0.3, name: 'WIDE GAP', points: 250 }],
    /* The footbridge across the plot, flown under. */
    ['bridge', 80, 72, EAST, { span: 20, width: 3, height: 5.6, piers: 0 }, { style: 'footbridge' }],
    ['gap', 80, 72, NORTH, { width: 12, height: 4.2 }, { z: 0.5, name: 'UNDER THE BRIDGE', points: 100 }],
    /* Six metres. */
    ...containerPair(80, 98, 6, 3, 4, 9),
    ['gap', 80, 98, NORTH, { width: 5.2, height: 6.8 }, { z: 0.3, name: 'SIX METRE GAP', points: 250 }],
    /* Four metres. */
    ...containerPair(80, 122, 4, 3, 3, 6),
    ['gap', 80, 122, NORTH, { width: 3.4, height: 6.8 }, { z: 0.3, name: 'FOUR METRE GAP', points: 500 }],
    /* The billboard, east of the line, flown under between its legs. */
    ['billboard', 118, 70, WEST, { width: 10, height: 3.6, lift: 3.4, variant: 3 }],
    ['gap', 118, 70, EAST, { width: 5, height: 2.7 }, { z: 0.3, name: 'BILLBOARD GAP', points: 250 }],
    /* The office with an arcade, west of the line, flown through. */
    ['building', 40, 96, EAST, { width: 16, depth: 12, floors: 4, passage: 6, variant: 3 }, { style: 'office' }],
    ['gap', 40, 96, EAST, { width: 5, height: 5 }, { z: 0.3, name: 'THE ARCADE', points: 500 }],
    /* Scenery. */
    ['tree', 20, 30, EAST, { size: 1.1, variant: 1 }, { style: 'sakura' }],
    ['tree', 140, 30, EAST, { size: 1.0, variant: 2 }, { style: 'street' }],
    ['tree', 138, 120, EAST, { size: 1.1, variant: 3 }, { style: 'sakura' }],
    ['tree', 22, 140, EAST, { size: 1.0, variant: 4 }, { style: 'pine' }],
    ['waterTower', 132, 148, EAST, { height: 15, radius: 3.4, tank: 1.0 }],
  ];
  return freestyleDoc('trk-c4a90001', 'Gap School', rows, { time: 'noon', ground: 'tarmac' });
}
