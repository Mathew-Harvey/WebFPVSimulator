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
 *   the lane          a footbridge over it, a line of utility poles, wired,
 *                     FOOTBRIDGE under the deck, and two cars parked on its
 *                     east verge.
 *   the yard loop     a two lane road the traffic drives, round the east of
 *                     the yard: south down the lane under the footbridge,
 *                     west past the pylon's foot, north between the
 *                     billboard and the street trees, a chicane west, and
 *                     north past the water tower to come back east along
 *                     the north edge. The drift car laps it in 26 s, and two
 *                     working vehicles come the other way. See THE YARD
 *                     LOOP below.
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
 * THE YARD LOOP. Its nodes are the corners of the route, the lane's two
 * ends at x = 140 (y = 139 and 18), x = 120 between the billboard's legs
 * and the street trees, the chicane at y = 72, and x = 101.5 between the
 * container yard's north end, the street tree at (94, 104) and the water
 * tower; src/maps/built/road.js eases each corner into a bend of 7 to 12 m.
 * Every node is chosen so the road's 6 m keep at least 1.5 m from every
 * solid a car could reach, and every car's box at least 2 m, the drift
 * car's sliding tail included, at every step of a lap
 * (scripts/roads-check.js measures both on the poses the physics module
 * drives). The drift car drives the loop in the node order, alone in its
 * lane: nothing in the physics stops one car driving through another, so a
 * faster car must not share a lane with a slower one. The box truck and the
 * kei van come the other way, half a lap apart, the van's top speed set so
 * its lap matches the truck's to within 5 ms, so the two keep their spacing
 * for days. The two parked cars that stood on the lane moved to its east
 * verge when the loop came, clear of it, of the footbridge's stair and of
 * the pylons.
 *
 * Checked in Node through src/maps/built/place.js, by scripts/props-check.js
 * and by the builder's own warnings: no two elements' solids overlap, no two
 * elements leave a slot under the gap rule's 1.4 m between them (the one
 * pair closer than that is the scaffold, 2 cm off the office wall, which is
 * closed), the spawn is clear, and every named gap's window is clear of
 * every solid. The positions below are in the document's own frame: metres, x
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

/* The kei van's top speed, m/s: the one that makes its lap round the yard
 * loop, against the node order, as long as the box truck's at 10 m/s, 40.29
 * s, so the two, half a lap apart, stay half a lap apart. It corners harder
 * than the truck (3 m/s/s against 2.5), so on the same top speed it would
 * gain 0.9 s a lap and drive through it in about ten minutes. At 8.81 the
 * two laps differ by 4 ms, and closing half a lap takes two days. Found by
 * halving on the module's own poses; scripts/roads-check.js holds the two
 * laps together. */
const VAN_SPEED = 8.81;

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
    /* Facing east, so its roof carries, from the back: the plant room and
     * the cooling tower in the south half, clear air in the north half, and
     * the sign on legs along the front parapet, 17.5 to 20.7 m up. The roof
     * itself is at 15.0 m and the parapet's top at 16.1. */
    ['building', 40, 124, EAST, { width: 16, depth: 14, floors: 4, passage: 0, variant: 2 }, { style: 'office' }],
    /* Up the north half of the west wall, facing the crane, a lift past the
     * roof: the block is still going up. Two centimetres off the wall, so
     * the space between is closed rather than a slot a quad aims at, and
     * 6.4 m long, so both ends stand the gap rule's 1.4 m clear of what is
     * beside them: the plant room over the parapet at its south end, the
     * emergency stair round the corner at its north end. On the west
     * because the crane gap is flown north and south across the roof, and
     * a scaffold on either of those faces ended the line in its net.
     * 16.6 m so the jib passes 1.6 m over its top rail. 1.55 m deep, the
     * shallowest the scaffold builds and so the least the document allows:
     * a shallower depth is clamped up on load, which would move the inner
     * face into the wall. */
    ['scaffold', 32.175, 127.3, SOUTH, { width: 6.4, height: 16.6, depth: 1.55 }, { style: 'netted' }],
    /*
     * West of the block, jib east over the clear north half of its roof.
     * The jib's underside is at 19.2 m and the roof at 15.0, which is the
     * crane gap.
     *
     * THE JIB STOPS SHORT OF THE FRONT. The office's sign stands on its
     * front parapet up to 20.7 m, right in the height band the crane gap is
     * flown in, so a jib that crossed the front had to run through it or
     * stand a gap rule over its top, 7 m above the roof, which is a window
     * and not a slot. At 21 m the nose ends 1.6 m short of the sign's back,
     * open to the sky above and the roof below. The trolley is run in to
     * the root, so the hook hangs in the yard behind the block, about 3 m
     * from the mast and 2.4 m from the scaffold's net, and never over the
     * roof, where it would leave a slot above it.
     */
    ['crane', 24, 127, EAST, { height: 18.1, jib: 21, counterJib: 11, hook: 12, trolley: 0.15 }],

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
    /* Parked on the east verge, 4.8 m off the loop's edge: south of the
     * footbridge's east stair and north of it, clear of both pylons. They
     * stood on the lane itself until the loop came to drive it. */
    ['car', 148.5, 62, NORTH, { variant: 3 }, { style: 'kei' }],
    ['car', 148.5, 116, SOUTH, { variant: 5 }, { style: 'hatch' }],
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
     * under the jib's bottom chords. Its west edge is 0.2 m east of the
     * cooling tower's line, so a straight run from the south through any
     * of it is clear at roof height, and its east edge is 0.4 m in from the
     * jib's nose, so all of it is under the jib. */
    ['gap', 42.4, 127, NORTH, { width: 4.4, height: 3.3 }, { z: 15.5, name: 'CRANE GAP', points: 1000 }],
    /* Down the middle of the open container, inside its walls and roof. */
    ['gap', 92, 40, EAST, { width: 2, height: 1.9 }, { z: 0.4, name: 'CONTAINER TUNNEL', points: 500 }],
    /* Under the board, between its legs, below the catwalk. */
    ['gap', 114, 40, EAST, { width: 5, height: 2.6 }, { z: 0.3, name: 'BILLBOARD GAP', points: 250 }],
    /* Along the lane, under the deck, between the end piers. */
    ['gap', 140, 92, NORTH, { width: 10, height: 3.8 }, { z: 0.5, name: 'FOOTBRIDGE', points: 100 }],
    /* Through the legs, in the open panel between the top struts and the
     * tank. */
    ['gap', 112, 128, EAST, { width: 2.6, height: 3.1 }, { z: 11.3, name: 'WATER TOWER', points: 250 }],

    /*
     * ---- the yard loop and its traffic ----
     *
     * Appended after everything else, so no id above moved. The road's
     * position is its first node, the north end of the lane, and its nodes
     * are relative to it: south down the lane, west, north, the chicane
     * west, north, and back east along the north edge. A vehicle's place is
     * its road and its offset, metres along the centre line from the first
     * node, so its x, y and heading are written 0.
     */
    ['road', 140, 139, EAST, { width: 6, lanes: 2, radius: 12 }, {
      name: 'Yard loop',
      closed: true,
      nodes: [[0, 0], [0, -121], [-20, -121], [-20, -67], [-38.5, -67], [-38.5, 0]],
    }],
    /* The drift car, wine red, in the node order: south down the lane from
     * the north east bend, 25 m down it at step 0. */
    ['vehicle', 0, 0, EAST, { offset: 25, speed: 20, variant: 4 }, {
      name: 'Drift car', style: 'hatch', road: 'el-53', drift: true,
    }],
    /* The working traffic, against the node order, half a lap apart. */
    ['vehicle', 0, 0, EAST, { offset: 60, speed: 10, variant: 1 }, {
      style: 'boxtruck', road: 'el-53', reverse: true,
    }],
    ['vehicle', 0, 0, EAST, { offset: 207.5, speed: VAN_SPEED, variant: 1 }, {
      style: 'keivan', road: 'el-53', reverse: true,
    }],
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
