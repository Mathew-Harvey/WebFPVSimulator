/*
 * starter.js: Hibari Yard, the freestyle map a pilot who has built nothing
 * flies first.
 *
 * It is a plain track document in the builder's schema (schema.md, with
 * mode 'freestyle'), so it is exactly what somebody could have made in the
 * track builder by hand, and the builder can open it and change it. It is
 * built here as data rather than stored as a file so it needs no fetch and
 * cannot go missing.
 *
 * COMPOSED FOR LINES, NOT FOR A PLAN VIEW. The pads are south west of the
 * middle facing north east, so the first thing in the goggles is the bando
 * with the crane over its left shoulder and the wires on its right. Everything
 * else is arranged round the lines a pilot will look for:
 *
 *   the bando         the centrepiece. Its ground floor is always open in
 *                     the middle bays of every face, so a straight run
 *                     through it exists whatever the ruin rolls.
 *   the crane         over a half built office with a scaffold climbing past
 *                     its roof. CRANE GAP is the slot between the roof and
 *                     the jib, 1000 because the jib is the ceiling.
 *   the container yard  an open container lined up east with a billboard, so
 *                     CONTAINER TUNNEL and BILLBOARD GAP are one straight
 *                     line out toward the lane.
 *   the lane          a footbridge over it with two parked cars and a line
 *                     of utility poles, wired, and FOOTBRIDGE under the deck.
 *   the water tower   in the north east, WATER TOWER through its legs under
 *                     the tank.
 *   the skate corner  a quarter pipe, a ledge, a rail and a stair set beside
 *                     the pads, for the first ten seconds at ground level.
 *   the chimney       the tall landmark on the north edge.
 *
 * THE IDS ARE FIXED because every seeded asset (the bando's ruin, the
 * containers' colours, the trees' limbs) takes its seed from its element's
 * id. A starter that rolled new ids would be a different yard every load.
 *
 * Checked in Node through src/maps/built/place.js: no two elements' solids
 * touch, the spawn is clear, and every named gap's window is clear of every
 * solid. The positions below are in the document's own frame: metres, x
 * east, y north, origin at the plot's south west corner, yaw counter
 * clockwise from east.
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

/* Headings, as fractions of a turn, so the table below reads as compass
 * directions. Plain constants: no trigonometry is taken here. */
const EAST = 0;
const NORTH = Math.PI / 2;
const WEST = Math.PI;
const SOUTH = -Math.PI / 2;
const NORTH_EAST = Math.PI / 4;

export const STARTER_NAME = 'Hibari Yard';

/* The starter's own document id, fixed for the reason in the header. */
export const STARTER_ID = 'trk-1b4a7d00';

/*
 * Every element, as [type, x, y, yaw, dims, extra]. `extra` carries style,
 * height above the ground (z), a gap's name and points. Ids are given in
 * order, so the first row is el-1.
 */
function rows() {
  return [
    /* ---- the pads: south west of the bando, facing it ----
     * Forty metres from the bando's middle and twenty five from its near
     * corner, so it is inside the fog on every graphics tier and fills the
     * first frame. */
    ['startPads', 44, 56, NORTH_EAST, { pads: 4, spacing: 1.5, padSize: 0.6 }],

    /* ---- the centrepiece ---- */
    ['bando', 72, 88, EAST, { width: 24, depth: 18, floors: 3, ruin: 0.55, variant: 3 }],

    /* ---- the half built block, its scaffold, and the crane over it ---- */
    ['building', 40, 124, EAST, { width: 16, depth: 14, floors: 4, passage: 0, variant: 2 }, { style: 'office' }],
    /* Up the west wall, facing the crane, inner face 0.2 m off the wall and
     * a lift past the roof: the block is still going up. On the west
     * because the crane gap is flown north and south across the roof, and
     * a scaffold on either of those faces ended the line in its net. Sixteen
     * metres so the jib passes 1.6 m over its top rail. */
    ['scaffold', 31.12, 124, SOUTH, { width: 14, height: 16, depth: 1.3 }, { style: 'netted' }],
    /* West of the block, jib east over its roof. The jib's underside is at
     * 18.6 m and the roof at 14.4, which is the crane gap. The hook hangs
     * past the block's front, clear of its canopy by two metres. */
    ['crane', 24, 124, EAST, { height: 17.5, jib: 32, counterJib: 11, hook: 12, trolley: 0.95 }],

    /* ---- the container yard ---- */
    /* The tunnel: open both ends, running east at the billboard. */
    ['containers', 92, 40, EAST, { stack: 2, variant: 4 }, { style: '40ft open' }],
    ['containers', 92, 47, EAST, { stack: 3, variant: 2 }, { style: '40ft' }],
    ['containers', 92, 33, EAST, { stack: 2, variant: 7 }, { style: '40ft' }],
    ['containers', 92, 54, EAST, { stack: 1, variant: 5 }, { style: '40ft' }],
    ['containers', 106, 22, NORTH, { stack: 2, variant: 3 }, { style: '20ft' }],
    ['containers', 76, 24, EAST, { stack: 1, variant: 9 }, { style: '20ft' }],
    ['containers', 108, 57, NORTH, { stack: 2, variant: 6 }, { style: '40ft' }],
    /* Facing back down the line, so the pilot leaving the tunnel reads the
     * advert, and the gap under it is the tunnel's own line. */
    ['billboard', 114, 40, WEST, { width: 10, height: 3.6, lift: 3.2, variant: 2 }],

    /* ---- the lane, north to south on the east side ---- */
    /* Spanning east west across the lane; the map paints the lane under
     * every bridge, square to its span. */
    ['bridge', 140, 92, EAST, { span: 14, width: 3, height: 5.2, piers: 0 }, { style: 'footbridge' }],
    ['car', 142.2, 78, NORTH, { variant: 3 }, { style: 'kei' }],
    ['car', 137.8, 106, SOUTH, { variant: 5 }, { style: 'hatch' }],
    /* Poles on the lane's west verge, 34 m apart, so the wires run the
     * lane's length. */
    ['utilityPole', 133.5, 12, NORTH, { height: 10 }],
    ['utilityPole', 133.5, 46, NORTH, { height: 10 }],
    ['utilityPole', 133.5, 80, NORTH, { height: 10 }],
    ['utilityPole', 133.5, 114, NORTH, { height: 10 }],
    ['utilityPole', 133.5, 148, NORTH, { height: 10 }],
    /* Two pylons past the lane, with the power line between them. */
    ['pylon', 152, 22, EAST, { height: 28 }],
    ['pylon', 152, 132, EAST, { height: 28 }],

    /* ---- the north ---- */
    ['waterTower', 112, 128, EAST, { height: 15, radius: 3.4, tank: 1.0 }],
    ['chimney', 84, 146, EAST, { height: 34, radius: 1.6 }],

    /* ---- the skate corner, off the pads' right shoulder ---- */
    ['quarterPipe', 44, 30, NORTH, { height: 2.4, width: 6, deck: 1.4 }],
    ['ledge', 56, 34, EAST, { length: 8, height: 0.5, depth: 0.9 }],
    ['rail', 56, 40, EAST, { length: 8, height: 0.7 }],
    ['stairs', 68, 34, NORTH, { steps: 7, width: 4, landing: 3 }],
    ['vending', 33, 30, NORTH, { count: 2, variant: 2 }],

    /* ---- trees, sakura among them ---- */
    ['tree', 12, 60, EAST, { size: 1.1, variant: 1 }, { style: 'sakura' }],
    ['tree', 17, 75, EAST, { size: 1.0, variant: 2 }, { style: 'sakura' }],
    ['tree', 10, 90, EAST, { size: 1.2, variant: 3 }, { style: 'sakura' }],
    ['tree', 34, 44, EAST, { size: 1.0, variant: 4 }, { style: 'sakura' }],
    ['tree', 52, 74, EAST, { size: 1.1, variant: 5 }, { style: 'sakura' }],
    ['tree', 94, 104, EAST, { size: 1.0, variant: 6 }, { style: 'street' }],
    ['tree', 52, 102, EAST, { size: 1.0, variant: 7 }, { style: 'street' }],
    ['tree', 80, 8, EAST, { size: 1.0, variant: 8 }, { style: 'street' }],
    ['tree', 96, 8, EAST, { size: 1.0, variant: 9 }, { style: 'street' }],
    ['tree', 127.5, 30, EAST, { size: 1.0, variant: 10 }, { style: 'street' }],
    ['tree', 127.5, 64, EAST, { size: 1.0, variant: 11 }, { style: 'street' }],
    ['tree', 127.5, 132, EAST, { size: 1.1, variant: 12 }, { style: 'sakura' }],
    ['tree', 124, 146, EAST, { size: 1.0, variant: 13 }, { style: 'sakura' }],
    ['tree', 8, 146, EAST, { size: 1.0, variant: 14 }, { style: 'pine' }],
    ['tree', 16, 153, EAST, { size: 1.1, variant: 15 }, { style: 'pine' }],
    ['tree', 27, 149, EAST, { size: 0.9, variant: 16 }, { style: 'pine' }],
    ['tree', 64, 150, EAST, { size: 1.0, variant: 17 }, { style: 'pine' }],

    /*
     * ---- the named gaps ----
     *
     * A gap's position is the middle of its window's SILL, `z` is the sill's
     * height, and its yaw is the window's normal, the way an aperture's is:
     * the window is `width` across that normal and `height` up from the sill.
     */
    /* Across the office roof, under the jib: 0.5 m over the roof, 0.4 m
     * under the jib's bottom chords. */
    ['gap', 40, 124, NORTH, { width: 6, height: 3.3 }, { z: 14.9, name: 'CRANE GAP', points: 1000 }],
    /* Down the middle of the open container, inside its walls and roof. */
    ['gap', 92, 40, EAST, { width: 2, height: 1.9 }, { z: 0.4, name: 'CONTAINER TUNNEL', points: 500 }],
    /* Under the board, between its legs, below the catwalk. */
    ['gap', 114, 40, EAST, { width: 5, height: 2.6 }, { z: 0.3, name: 'BILLBOARD GAP', points: 250 }],
    /* Along the lane, under the deck, between the end piers. */
    ['gap', 140, 92, NORTH, { width: 10, height: 3.8 }, { z: 0.5, name: 'FOOTBRIDGE', points: 100 }],
    /* Through the legs, in the open panel between the top struts and the
     * tank. */
    ['gap', 112, 128, EAST, { width: 2.6, height: 3.1 }, { z: 11.3, name: 'WATER TOWER', points: 250 }],
  ];
}

/* A fresh copy of the starter document, every call. */
export function starterMap() {
  const elements = rows().map(([type, x, y, yaw, dims, extra = {}], i) => {
    const el = {
      id: `el-${i + 1}`,
      type,
      name: extra.name ?? '',
      position: { x, y, z: extra.z ?? 0 },
      yaw,
      pitch: 0,
      yawOverridden: false,
      dims: { ...dims },
    };
    if (extra.style) {
      el.style = extra.style;
    }
    if (extra.points) {
      el.points = extra.points;
    }
    return el;
  });
  return {
    schemaVersion: 3,
    id: STARTER_ID,
    name: STARTER_NAME,
    createdUtc: '2026-09-24T00:00:00Z',
    modifiedUtc: '2026-09-24T00:00:00Z',
    trackClass: 'full',
    mode: 'freestyle',
    field: { width: 160, depth: 160, gridSize: 1 },
    settings: { tangentScale: 1.1, minCurveRadius: 2.5, samplesPerSegment: 48 },
    branding: { logos: [] },
    credit: null,
    elements,
    sequence: [],
  };
}
