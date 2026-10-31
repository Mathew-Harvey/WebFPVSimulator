/*
 * yard.js: the document Shiroyama FMX flies in, as ../moto/yard.js is
 * Ridgeline MX's. The show itself (the ramps, the stands, the yagura, the
 * screen, the castle) comes from ./arena.js as one structure and the riders
 * from ./traffic.js; this is what the built map's document already says
 * well: the plot, the time of day, the pilot's start, the named gaps, the
 * town round the park, its poles and wires, its vending machines and cars,
 * and the trees.
 *
 * THE TOWN is the town's own kit (src/props/buildings.js): two streets of
 * shops with flats over them, blocks of flats and a few offices, north and
 * south of the park, with the concrete poles and their wires down both
 * streets. So the place a pilot climbs out of the stadium into is the same
 * Japan as The town, drawn by the same hand.
 *
 * THE TREES are placed from a fixed integer hash, so the map is the same
 * every time: cherries and pines in the castle park, a belt of them round
 * the moat, and street trees along the pavements, none in the arena, on a
 * path or in a building.
 *
 * Built fresh on every call and the same every call, with a fixed id, so
 * the map keys its marks and stamps as one place, and the id is the
 * registry's, where src/share/stamps.js can read it without loading this.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { FMX_DOC_ID } from '../registry.js';
import {
  FIELD_W, FIELD_D, ARENA, STAND, STANDS, ROOF, YAGURA, SCREEN, CASTLE, BOOTH, PIT_TENTS, SET_X, SET, LANE_N, LANE_S,
  STAND_POST_X, treadH,
} from './arena.js';

export const FMX_NAME = 'Shiroyama FMX';

/* The pilot's start: on the dirt at the east end, past the riders' turn,
 * looking west down the middle at the landings, the yagura and the keep. */
export const SPAWN = { x: 241, y: 110 };

const EAST = 0;
const NORTH = Math.PI / 2;

/* A fixed integer hash to [0, 1), so the trees are the same every build. */
function hash(i, salt) {
  let h = Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(salt + 7, 0x85ebca77);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

/*
 * THE TOWN, a row a side: [x, width, style, floors, variant], each row at
 * its own street line. The near row is shops and low flats, the far row
 * taller, so the skyline steps up away from the park.
 */
const NORTH_NEAR = 186;
const NORTH_FAR = 210;
const SOUTH_NEAR = 38;
const SOUTH_FAR = 15;
const ROW_NEAR = [
  [18, 14, 'shop', 2, 1], [36, 16, 'shop', 3, 2], [55, 14, 'flats', 4, 3], [74, 16, 'shop', 2, 4], [94, 18, 'flats', 5, 5],
  [116, 14, 'shop', 2, 6], [134, 16, 'shop', 3, 7], [154, 18, 'office', 5, 8], [176, 16, 'shop', 2, 9], [195, 14, 'shop', 3, 10],
  [214, 18, 'flats', 4, 11], [236, 16, 'shop', 2, 12], [256, 18, 'flats', 5, 13], [278, 16, 'shop', 3, 14], [298, 14, 'shop', 2, 15],
  [316, 16, 'flats', 4, 16],
];
const ROW_FAR = [
  [22, 22, 'flats', 7, 21], [50, 20, 'office', 8, 22], [78, 24, 'flats', 6, 23], [108, 22, 'office', 9, 24], [136, 20, 'flats', 7, 25],
  [164, 24, 'office', 10, 26], [194, 20, 'flats', 6, 27], [222, 22, 'office', 8, 28], [250, 24, 'flats', 7, 29], [280, 20, 'office', 9, 30],
  [308, 22, 'flats', 6, 31],
];

function townRows(out, solidsOut) {
  const put = (row, y, depth, yaw, salt) => {
    for (const [x, wd, style, floors, variant] of row) {
      out.push({
        type: 'building', style, x, y, yaw, dims: { width: wd, depth, floors, passage: 0, variant: variant + salt },
      });
      solidsOut.push({ x0: x - wd / 2 - 1, x1: x + wd / 2 + 1, y0: y - depth / 2 - 1, y1: y + depth / 2 + 1 });
    }
  };
  put(ROW_NEAR, NORTH_NEAR, 12, Math.PI, 0);
  put(ROW_FAR, NORTH_FAR, 16, Math.PI, 0);
  put(ROW_NEAR, SOUTH_NEAR, 12, 0, 40);
  put(ROW_FAR, SOUTH_FAR, 16, 0, 40);
}

/* Rectangles in the plan no tree may stand in. */
function keepOut(town) {
  const pitBoxes = PIT_TENTS.map(([x, y]) => ({ x0: x - 2, x1: x + 14, y0: y - 1.5, y1: y + 7.5 }));
  return [
    /* The arena, its stands, the stage and the towers. */
    { x0: ARENA.x0 - 8, x1: SCREEN.stage.x1 + 6, y0: STANDS[1].front - STAND.rows * STAND.rowD - 6, y1: ROOF.back + 6 },
    /* The moat, wall and all, and the castle in it. */
    { x0: CASTLE.moat.x0 - 1.5, x1: CASTLE.moat.x1 + 1.5, y0: CASTLE.moat.y0 - 1.5, y1: CASTLE.moat.y1 + 1.5 },
    /* The castle path, the booth and the stalls along the path. */
    { x0: CASTLE.moat.x1, x1: ARENA.x0, y0: 102, y1: 118 },
    { x0: BOOTH.x0 - 2, x1: ARENA.x0, y0: BOOTH.y0 - 2, y1: BOOTH.y1 + 2 },
    ...pitBoxes,
    /* The streets and the vans behind the stage. */
    { x0: 0, x1: FIELD_W, y0: 166, y1: 177 },
    { x0: 0, x1: FIELD_W, y0: 46, y1: 56 },
    { x0: 270, x1: 312, y0: 88, y1: 132 },
    ...town,
  ];
}

function trees(town) {
  const boxes = keepOut(town);
  const out = [];
  const clear = (x, y, r) => {
    if (x < 4 || y < 4 || x > FIELD_W - 4 || y > FIELD_D - 4) {
      return false;
    }
    for (const b of boxes) {
      if (x > b.x0 - r && x < b.x1 + r && y > b.y0 - r && y < b.y1 + r) {
        return false;
      }
    }
    for (const t of out) {
      const dx = t.x - x;
      const dy = t.y - y;
      if (dx * dx + dy * dy < t.gap * t.gap) {
        return false;
      }
    }
    return true;
  };
  /* The park round the castle and the arena: cherries and pines, the
   * pines thicker by the moat, where a castle park plants them. */
  for (let i = 0; i < 3200 && out.length < 230; i += 1) {
    const x = 4 + hash(i, 11) * (FIELD_W - 8);
    const y = 57 + hash(i, 12) * (165 - 57);
    const nearMoat = x < CASTLE.moat.x1 + 18;
    const pine = hash(i, 15) < (nearMoat ? 0.6 : 0.3);
    const size = pine ? 0.95 + hash(i, 14) * 0.5 : 1 + hash(i, 14) * 0.4;
    if (clear(x, y, pine ? 2.5 : 3.2)) {
      out.push({
        style: pine ? 'pine' : 'sakura', x, y, size, gap: pine ? 6 : 7.5,
      });
    }
  }
  /* Street trees down the pavements, a regular row. */
  for (const y of [168.5, 53.5]) {
    for (let x = 8; x < FIELD_W - 4; x += 13) {
      if (clear(x, y, 1)) {
        out.push({
          style: 'street', x, y, size: 0.85 + hash(Math.round(x), Math.round(y)) * 0.2, gap: 6,
        });
      }
    }
  }
  return out;
}

function rows() {
  const out = [];
  const town = [];
  out.push({
    type: 'startPads', x: SPAWN.x, y: SPAWN.y, yaw: Math.PI, z: 0, dims: { pads: 1, spacing: 1.5, padSize: 0.9 },
  });
  townRows(out, town);
  /* The poles down both streets: every 26 m, the wires the pipeline hangs
   * between them. */
  for (const y of [171, 51]) {
    for (let x = 12; x < FIELD_W - 6; x += 26) {
      out.push({
        type: 'utilityPole', x, y, yaw: y > 100 ? Math.PI : 0, dims: { height: 10 + (Math.round(x) % 3) },
      });
    }
  }
  /* Lamps down the castle path. */
  for (let x = CASTLE.moat.x1 + 4; x < BOOTH.x0 - 2; x += 7) {
    out.push({
      type: 'lamp', x, y: 104.6, yaw: NORTH, dims: { height: 4.5 },
    });
    out.push({
      type: 'lamp', x: x + 3.5, y: 115.4, yaw: -NORTH, dims: { height: 4.5 },
    });
  }
  /* Vending machines at the stands' ends and on the path. */
  for (const [x, y, yaw, count] of [
    [116, 161, -NORTH, 3], [244, 161, -NORTH, 2], [116, 59, NORTH, 2], [244, 59, NORTH, 3], [92, 118.5, -NORTH, 2], [272, 140, Math.PI, 2],
  ]) {
    out.push({
      type: 'vending', x, y, yaw, dims: { count, variant: 1 + (Math.round(x + y) % 7) },
    });
  }
  /* The broadcast vans and the riders' trucks behind the stage, and cars
   * parked along both streets. */
  [['boxtruck', 280, 94], ['van', 280, 102], ['minibus', 280, 118], ['boxtruck', 280, 126], ['keivan', 292, 98], ['van', 292, 122]].forEach(([style, x, y], i) => {
    out.push({
      type: 'car', style, x, y, yaw: Math.PI, dims: { variant: 3 + i },
    });
  });
  const parked = ['kei', 'hatch', 'keivan', 'sedan', 'wagon', 'minivan', 'kei', 'hatch'];
  for (let i = 0; i < 9; i += 1) {
    out.push({
      type: 'car', style: parked[i % parked.length], x: 20 + i * 34 + (i % 3) * 3, y: 174.5, yaw: i % 2 ? 0 : Math.PI, dims: { variant: 10 + i },
    });
    out.push({
      type: 'car', style: parked[(i + 3) % parked.length], x: 30 + i * 33 + (i % 2) * 5, y: 48.5, yaw: i % 2 ? Math.PI : 0, dims: { variant: 20 + i },
    });
  }
  for (const t of trees(town)) {
    out.push({
      type: 'tree', style: t.style, x: t.x, y: t.y, yaw: hash(Math.round(t.x * 10), Math.round(t.y)) * 6.28, dims: { size: t.size, variant: 1 + Math.floor(hash(Math.round(t.y * 10), 5) * 9) },
    });
  }
  /*
   * THE NAMED GAPS. Each window's position is the middle of its sill, its
   * yaw its normal, `width` across it and `height` up from `z`.
   */
  const gap = (x, y, yaw, width, height, z, name, points) => {
    out.push({
      type: 'gap', x, y, z, yaw, dims: { width, height }, name, points,
    });
  };
  /* The riders' lines: the air between each lip and its knuckle, where
   * the bikes fly, a window as wide as the kicker and as tall as the arc. */
  gap(SET_X.n + SET.lip + 13, LANE_N, EAST, 6, 5, 4.2, 'NORTH KICKER LINE', 500);
  gap(SET_X.s - SET.lip - 13, LANE_S, EAST, 6, 5, 4.2, 'SOUTH KICKER LINE', 500);
  /* Between the yagura's legs, under its deck. */
  gap(YAGURA.x, YAGURA.y, EAST, 2 * YAGURA.half - 0.9, YAGURA.deckY - YAGURA.skirt - 0.7, 0.35, 'YAGURA', 500);
  /* Under both grandstands, between two posts, where the treads are high
   * enough over the dirt. */
  for (const S of STANDS) {
    const rowA = 3;
    const yA = S.front + S.dir * rowA * STAND.rowD;
    const yB = S.front + S.dir * (STAND.rows * STAND.rowD - 0.4);
    const sill = 0.35;
    const top = treadH(rowA) - STAND.slab - 0.35;
    const xs = STAND_POST_X;
    const x = (xs[14] + xs[15]) / 2;
    gap(x, (yA + yB) / 2, EAST, Math.abs(yB - yA), top - sill, sill, S.id === 'north' ? 'UNDER THE NORTH STAND' : 'UNDER THE SOUTH STAND', 500);
  }
  /* Under the north stand's roof, out over the back row. */
  {
    const back = STANDS[0].front + STAND.rows * STAND.rowD;
    const xa = ROOF.colX[1];
    const xb = ROOF.colX[2];
    const sill = treadH(STAND.rows - 1) + 1.5;
    gap((xa + xb) / 2, back + 0.6, NORTH, xb - xa - 1.2, ROOF.chordLo - 0.4 - sill, sill, 'UNDER THE ROOF', 250);
  }
  /* Under the big screen, over the stage. */
  gap(SCREEN.x, (SCREEN.y0 + SCREEN.y1) / 2, EAST, SCREEN.y1 - SCREEN.y0 - 2.2, SCREEN.z0 - SCREEN.stage.h - 0.8, SCREEN.stage.h + 0.4, 'UNDER THE SCREEN', 250);
  /* Under the commentary box, the riders' way in. */
  gap(BOOTH.x0 + 0.6, 110, EAST, 11, BOOTH.legH - 0.8, 0.35, 'RIDERS GATE', 250);
  /* Under the castle's red bridge, along the moat. */
  {
    const b = CASTLE.bridge;
    gap((b.x0 + b.x1) / 2, b.y, NORTH, 5.5, 1.5, 0.3, 'MOAT BRIDGE', 1000);
  }
  return out;
}

export function fmxDocument() {
  const elements = rows().map((r, i) => {
    const el = {
      id: `el-${i + 1}`,
      type: r.type,
      name: r.name ?? '',
      position: { x: r.x ?? 0, y: r.y ?? 0, z: r.z ?? 0 },
      yaw: r.yaw ?? 0,
      pitch: 0,
      yawOverridden: r.yaw !== undefined,
      dims: { ...r.dims },
    };
    if (r.style !== undefined) {
      el.style = r.style;
    }
    if (r.points !== undefined) {
      el.points = r.points;
    }
    return el;
  });
  return {
    schemaVersion: 3,
    id: FMX_DOC_ID,
    name: FMX_NAME,
    createdUtc: '2026-10-31T00:00:00Z',
    modifiedUtc: '2026-10-31T00:00:00Z',
    trackClass: 'full',
    mode: 'freestyle',
    field: { width: FIELD_W, depth: FIELD_D, gridSize: 1 },
    settings: { tangentScale: 1.1, minCurveRadius: 2.5, samplesPerSegment: 48 },
    scene: { time: 'golden', ground: 'grass' },
    branding: { logos: [] },
    credit: null,
    elements,
    sequence: [],
  };
}
