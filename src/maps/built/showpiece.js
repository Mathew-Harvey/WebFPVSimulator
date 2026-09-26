/*
 * showpiece.js: Hibari Yard Tandem, the starter's yard with a drift course
 * north of it and two cars sliding round it door to door.
 *
 * It is the map the front door's freestyle chapter flies and the one it
 * sends a visitor to, published on the board under its fixed id, and it
 * ships in the builder's library beside the starter, so anybody can open
 * it and change it. Like the starter it is a plain track document in the
 * builder's schema (schema.md, mode 'freestyle'), built here as data.
 *
 * THE STARTER IS UNDER IT, UNCHANGED. Every element of starterMap() is
 * here with its own id, so the bando falls down the same way, the
 * containers are the same colours and the yard loop's traffic drives the
 * same laps. What changes is the plot, 94 m deeper to the north to hold the
 * course, which moves every world coordinate of the yard and is why this
 * is a second document rather than the starter grown: scripts/lib/
 * worldruns.js flies the starter for the world golden, and a starter
 * whose field moved would be a golden moved for a drift course.
 *
 * THE COURSE is one lane, 10 m wide, eased into 22 m bends, and driven
 * counter clockwise from its first node, the north east corner:
 *
 *   the main straight   west along the north edge, 122 m corner to corner,
 *                       under the overpass, the fastest part of the lap.
 *   the entry           the north west corner, a left at the end of the
 *                       straight, round the outside of a wall of stacked
 *                       containers: the clipping zone, where a D1 driver
 *                       puts the rear bumper as near the wall as they
 *                       dare. Here the wall stands at least 2 m off every
 *                       car at every step, which is the rule the yard
 *                       loop's traffic keeps and not a driver's nerve.
 *   the transition      on the south straight, a hump into the infield,
 *                       a left, a right over the top and a left down: the
 *                       cars flick from one lock to the other twice.
 *   the return          the south east corner and the east side, back to
 *                       the straight.
 *
 * Every node is chosen so the road keeps 1.5 m from every solid a car could
 * reach and every car's box 2 m, the sliding tails included, at every step
 * of a lap; scripts/roads-check.js measures both on the module's own poses,
 * for this map as for the starter.
 *
 * THE TANDEM IS IN SYNC BY CONSTRUCTION. Both cars drive the same road at
 * the same top speed and both drift, and the physics module keys a car's
 * speed profile on its road, top speed and cornering (src/native/world.c
 * section 5), so the chase car is the lead car 450 ms later, exactly, every
 * lap, for ever. Nothing tunes it and nothing can drift it apart. The gap
 * is set in metres, the chase car 8 m behind the lead along the centre
 * line at step zero, and it closes to about 5.4 m through the bends as
 * the two slow in them, which is what a tandem looks like. Over a lap the
 * nearest their footprints come is 0.84 m, in the transition, where the
 * chase car's nose swings across toward the lead's tail; 7 m apart put it
 * at 0.32 m and 6 m drove one through the other (the physics lets cars
 * pass through each other, so the map has to keep them apart, and
 * scripts/roads-check.js holds that too).
 *
 * THE PAINT is seeded from each car's id and variant (carColourOf in
 * src/props/street.js), and the variants are the ones that give a white
 * lead and a mustard chase: the two read apart at any range, and neither is
 * the yard loop's wine red drift car.
 *
 * THE IDS ARE FIXED, and continue the starter's, for the reason the
 * starter gives: every seeded asset takes its seed from its element's id.
 * They are the ids the builder would have given the same elements added by
 * hand, el-57 on.
 *
 * The positions below are in the document's own frame: metres, x east, y
 * north, origin at the plot's south west corner, yaw counter clockwise from
 * east.
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

import { starterMap } from './starter.js';

const EAST = 0;
const NORTH = Math.PI / 2;
const WEST = Math.PI;
const SOUTH = -Math.PI / 2;

export const SHOWPIECE_NAME = 'Hibari Yard Tandem';

/* The showpiece's own document id, fixed: it is the id the board publishes
 * it under, and the front door links to it by this id. */
export const SHOWPIECE_ID = 'trk-1b4a7d7a';

/* The plot: the starter's 160 m square, 94 m deeper to the north. */
const DEPTH = 254;

/* The course's two long sides, and its half width. */
const Y_TOP = 234;
const Y_LOW = 176;
const HALF = 5;

/* The tandem's places along the centre line at step zero, m, and its top
 * speed on a straight, m/s. See THE TANDEM above. */
const LEAD_AT = 44;
const CHASE_AT = 36;
const TANDEM_SPEED = 20;

/*
 * The clipping wall, 40 ft containers two high, their inner faces 1.8 m
 * past the road's edge, which is the road's 1.5 m keep and the 0.3 m the
 * kit draws a container's doors and ribs proud of its box: a container's
 * box is 2.44 m deep, so its middle is 1.22 m further out again.
 */
const WALL_OFF = HALF + 1.5 + 0.3 + 1.25;

/*
 * The new elements, as [type, x, y, yaw, dims, extra], in the starter's
 * form. Their ids follow the starter's last, el-56, so the first row is
 * el-57. Written down rather than counted: a starter that grew would
 * otherwise renumber these and repaint the tandem, and as it is, its new
 * element would take el-57 too, normalize would rename the duplicate, and
 * the checks that want no repairs would say so.
 */
const FIRST = 57;
function rows() {
  return [
    /* ---- the course ----
     * Its position is its first node, the north east corner, and its nodes
     * are relative to it: west along the main straight, south, east to
     * the transition's hump and down again, east, and north to close. */
    ['road', 146, Y_TOP, EAST, { width: 2 * HALF, lanes: 1, radius: 22 }, {
      name: 'Drift course',
      closed: true,
      nodes: [[0, 0], [-122, 0], [-122, Y_LOW - Y_TOP], [-86, Y_LOW - Y_TOP], [-61, Y_LOW - Y_TOP + 28], [-36, Y_LOW - Y_TOP], [0, Y_LOW - Y_TOP]],
    }],
    /* ---- the tandem, in the node order ---- */
    ['vehicle', 0, 0, EAST, { offset: LEAD_AT, speed: TANDEM_SPEED, variant: 17 }, {
      name: 'Tandem lead', style: 'sedan', road: 'el-57', drift: true,
    }],
    ['vehicle', 0, 0, EAST, { offset: CHASE_AT, speed: TANDEM_SPEED, variant: 10 }, {
      name: 'Tandem chase', style: 'sedan', road: 'el-57', drift: true,
    }],

    /* ---- the overpass, north to south across the main straight ----
     * Its piers stand 7 m clear of the road's edges; the road is the
     * something under it, so the map paints no lane of its own there. */
    ['bridge', 88, Y_TOP, NORTH, { span: 26, width: 9, height: 7, piers: 0 }, { style: 'road' }],
    /* Along the straight, under the deck, between the piers. The girders'
     * bottom flanges are at 5.36 m. */
    ['gap', 88, Y_TOP, EAST, { width: 16, height: 4.4 }, { z: 0.5, name: 'OVERPASS', points: 500 }],

    /* ---- the clipping wall, round the outside of the entry ---- */
    ['containers', 36, Y_TOP + WALL_OFF, EAST, { stack: 2, variant: 11 }, { style: '40ft' }],
    ['containers', 52, Y_TOP + WALL_OFF, EAST, { stack: 2, variant: 12 }, { style: '40ft' }],
    ['containers', 24 - WALL_OFF, 222, NORTH, { stack: 2, variant: 13 }, { style: '40ft' }],
    ['containers', 24 - WALL_OFF, 206, NORTH, { stack: 2, variant: 14 }, { style: '40ft' }],

    /* ---- lamps down the outside of the main straight, facing it, 20 m
     * apart east of the overpass and one past the clipping wall's end (the
     * overpass lights its own deck), and two on the south straight ---- */
    ['lamp', 64, Y_TOP + HALF + 3, SOUTH, { height: 8 }],
    ['lamp', 104, Y_TOP + HALF + 3, SOUTH, { height: 8 }],
    ['lamp', 124, Y_TOP + HALF + 3, SOUTH, { height: 8 }],
    ['lamp', 144, Y_TOP + HALF + 3, SOUTH, { height: 8 }],
    ['lamp', 40, Y_LOW - HALF - 3, NORTH, { height: 8 }],
    ['lamp', 136, Y_LOW - HALF - 3, NORTH, { height: 8 }],

    /* ---- a sponsor board facing the east side ---- */
    ['billboard', 157, 200, WEST, { width: 12, height: 3.2, lift: 3, variant: 5 }],

    /* ---- sakura in the infield ---- */
    ['tree', 44, 210, EAST, { size: 1.1, variant: 21 }, { style: 'sakura' }],
    ['tree', 66, 222, EAST, { size: 1.1, variant: 22 }, { style: 'sakura' }],
    ['tree', 112, 214, EAST, { size: 1.1, variant: 23 }, { style: 'sakura' }],
    ['tree', 128, 196, EAST, { size: 1.1, variant: 24 }, { style: 'sakura' }],
  ];
}

/* A fresh copy of the showpiece document, every call. */
export function showpieceMap() {
  const doc = starterMap();
  const added = rows().map(([type, x, y, yaw, dims, extra = {}], i) => {
    const el = {
      id: `el-${FIRST + i}`,
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
    if (type === 'road') {
      el.nodes = extra.nodes.map(([nx, ny]) => ({ x: nx, y: ny }));
      el.closed = extra.closed === true;
    }
    if (type === 'vehicle') {
      el.road = extra.road;
      el.reverse = extra.reverse === true;
      el.drift = extra.drift === true;
    }
    return el;
  });
  return {
    ...doc,
    id: SHOWPIECE_ID,
    name: SHOWPIECE_NAME,
    createdUtc: '2026-09-26T00:00:00Z',
    modifiedUtc: '2026-09-26T00:00:00Z',
    field: { ...doc.field, depth: DEPTH },
    elements: [...doc.elements, ...added],
  };
}
