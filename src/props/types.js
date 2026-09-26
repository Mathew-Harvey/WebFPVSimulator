/*
 * types.js: what each freestyle asset IS, as plain data. Imports nothing.
 *
 * Split out of ./catalog.js so the track builder's src/trackbuilder/
 * elements.js can list the assets without pulling in their layouts. The
 * layouts import the builder's pure modules for the gate furniture, so a
 * table that held both would be an import cycle, and a cycle in an ES module
 * graph is a table that is sometimes undefined depending on which file was
 * asked for first. A leaf cannot be in a cycle.
 *
 * AN ENTRY:
 *
 *   id        the document's `type`
 *   label     what the palette says
 *   key       its hotkey on the freestyle palette, or '' for none
 *   group     which palette heading it sits under
 *   turns     'any'      built of capsules, faces any heading
 *             'quarter'  has boxes, keeps to the four compass headings
 *                        until the physics learns turned boxes
 *                        (FREESTYLE-MAPS-PLAN.md, P1)
 *   dims      default dimensions, copied into a new element
 *   limits    { key: [min, max, kind] }: 'm' a length, 'int' a count,
 *             'frac' a fraction, 'x' a multiplier
 *   labels    what the inspector calls each dimension
 *   styles    optional list of looks; the first is the default
 *   note      one line for the palette's tooltip and the inspector
 *   zone      true for a scoring zone: never solid, never drawn in the air
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

export const BUILDING_STYLES = ['flats', 'office', 'warehouse', 'shop'];
export const CONTAINER_STYLES = ['40ft', '20ft', '40ft open'];
export const SCAFFOLD_STYLES = ['open', 'netted'];
export const BRIDGE_STYLES = ['road', 'footbridge'];
export const CAR_STYLES = ['kei', 'keivan', 'hatch', 'sedan', 'wagon', 'minivan', 'van', 'boxtruck', 'minibus', 'r32', 'e82'];
export const TREE_STYLES = ['sakura', 'street', 'pine'];

/*
 * THE SIZE A STYLE STARTS AT. A warehouse is low and wide, an office is
 * tall, a shop is a narrow two storey front; one default for all four put a
 * twenty metre tall warehouse on the plot. Choosing a style in the inspector
 * applies these, and a new element of that style starts at them. Keys not
 * named keep the type's default.
 */
export const STYLE_DIMS = {
  building: {
    flats: { width: 16, depth: 9, floors: 4 },
    office: { width: 16, depth: 14, floors: 6 },
    warehouse: { width: 26, depth: 18, floors: 2 },
    shop: { width: 8, depth: 11, floors: 3 },
  },
  /* A footbridge is a walkway over a lane, not a road bridge with the
   * sides pulled in: narrower, a shorter span, and no middle pier. */
  bridge: {
    road: { span: 24, width: 8, height: 6, piers: 1 },
    footbridge: { span: 18, width: 2.6, height: 5.6, piers: 0 },
  },
  /*
   * A moving vehicle's top speed on a straight, m/s: ordinary traffic
   * through a yard at 36 to 50 km/h, the little and the heavy ones slower.
   * A vehicle's speed is written in its document; these are only what a new
   * one of each style starts at. src/maps/built/traffic.js holds the rest
   * of what each style drives like.
   */
  vehicle: {
    kei: { speed: 11 },
    keivan: { speed: 10 },
    hatch: { speed: 13 },
    sedan: { speed: 14 },
    wagon: { speed: 13 },
    minivan: { speed: 12 },
    van: { speed: 11 },
    boxtruck: { speed: 10 },
    minibus: { speed: 10 },
    /* The coupe, quicker than the traffic; a drift car is offered
     * src/maps/built/traffic.js DRIFT.speed instead. */
    r32: { speed: 16 },
    e82: { speed: 16 },
  },
};

export function styleDims(type, style) {
  return STYLE_DIMS[type]?.[style] ?? null;
}

/* The points a named gap can be worth, the tiers a skate game uses. */
export const GAP_POINTS = [100, 250, 500, 1000, 2500];

/* The palette's headings, in order. */
export const PROP_GROUPS = [
  { id: 'buildings', label: 'Buildings' },
  { id: 'industrial', label: 'Industrial' },
  { id: 'street', label: 'Street' },
  { id: 'skate', label: 'Skate' },
  { id: 'nature', label: 'Nature' },
  { id: 'scoring', label: 'Scoring' },
];

const M = 'm';
const INT = 'int';
const FRAC = 'frac';
const X = 'x';

export const PROP_TYPES = {
  building: {
    label: 'Building',
    key: '1',
    group: 'buildings',
    turns: 'quarter',
    styles: BUILDING_STYLES,
    note: 'A block of flats, an office, a warehouse or a shop with a flat over it. The roof lands. Give it a passage to punch an arcade through the ground floor.',
    dims: { width: 16, depth: 9, floors: 4, passage: 0, variant: 1 },
    limits: { width: [4, 80, M], depth: [4, 60, M], floors: [1, 30, INT], passage: [0, 20, M], variant: [1, 99, INT] },
    labels: { width: 'Width', depth: 'Depth', floors: 'Floors', passage: 'Passage', variant: 'Variant' },
  },
  bando: {
    label: 'Bando',
    key: '3',
    group: 'buildings',
    turns: 'quarter',
    note: 'A derelict concrete frame: columns, floors with whole bays gone, walls with holes, a stair core. Every missing piece is a line. Ruin sets how much is gone; Variant rolls a different wreck.',
    dims: { width: 24, depth: 18, floors: 3, ruin: 0.5, variant: 1 },
    limits: { width: [8, 80, M], depth: [8, 60, M], floors: [1, 8, INT], ruin: [0, 1, FRAC], variant: [1, 99, INT] },
    labels: { width: 'Width', depth: 'Depth', floors: 'Floors', ruin: 'Ruin', variant: 'Variant' },
  },
  crane: {
    label: 'Tower crane',
    key: '4',
    group: 'industrial',
    turns: 'any',
    note: 'A hammerhead tower crane. The jib points the way you face it. Every member of the lattice is solid, and so are the hoist ropes.',
    dims: { height: 30, jib: 36, counterJib: 11, hook: 12, trolley: 0.6 },
    limits: { height: [10, 80, M], jib: [12, 70, M], counterJib: [6, 24, M], hook: [2, 70, M], trolley: [0.15, 0.95, FRAC] },
    labels: { height: 'Mast height', jib: 'Jib length', counterJib: 'Counter jib', hook: 'Hook drop', trolley: 'Trolley out' },
  },
  waterTower: {
    label: 'Water tower',
    key: '5',
    group: 'industrial',
    turns: 'any',
    note: 'A tank on four braced legs with a walkway round it. Fly between the legs, orbit the tank.',
    dims: { height: 16, radius: 3.6, tank: 0.8 },
    limits: { height: [6, 40, M], radius: [1.5, 7, M], tank: [0, 10, M] },
    labels: { height: 'Leg height', radius: 'Tank radius', tank: 'Tank length' },
  },
  mast: {
    label: 'Lattice mast',
    key: '6',
    group: 'industrial',
    turns: 'any',
    note: 'A red and white radio mast, triangular lattice, antennas at the top.',
    dims: { height: 32, width: 1.8 },
    limits: { height: [8, 90, M], width: [1, 4, M] },
    labels: { height: 'Height', width: 'Face width' },
  },
  chimney: {
    label: 'Chimney',
    key: '7',
    group: 'industrial',
    turns: 'any',
    note: 'A tapering brick stack. The one tall thing to fly round.',
    dims: { height: 24, radius: 1.3 },
    limits: { height: [6, 80, M], radius: [0.5, 5, M] },
    labels: { height: 'Height', radius: 'Base radius' },
  },
  pylon: {
    label: 'Power pylon',
    key: 'Y',
    group: 'industrial',
    turns: 'any',
    note: 'A lattice transmission tower. Wires run to the nearest other pylon and are not solid; the tower is.',
    dims: { height: 28 },
    limits: { height: [12, 60, M] },
    labels: { height: 'Height' },
  },
  containers: {
    label: 'Containers',
    key: '8',
    group: 'industrial',
    turns: 'quarter',
    styles: CONTAINER_STYLES,
    note: 'A stack of shipping containers. The open style leaves the bottom one empty with both ends off: a tunnel.',
    dims: { stack: 2, variant: 1 },
    limits: { stack: [1, 5, INT], variant: [1, 99, INT] },
    labels: { stack: 'Stack', variant: 'Variant' },
  },
  scaffold: {
    label: 'Scaffold',
    key: 'K',
    group: 'industrial',
    turns: 'quarter',
    styles: SCAFFOLD_STYLES,
    note: 'Tube and board, a lift every two metres. Between the boards is a tunnel the length of it.',
    /* 1.55 m is the shallowest src/props/industrial.js builds
     * (SCAFFOLD_MIN_DEPTH): anything less leaves the tunnel between the
     * boards under the gap rule. A default or a limit under it offered a
     * size the asset silently refused. */
    dims: { width: 10, height: 10, depth: 1.55 },
    limits: { width: [2.5, 40, M], height: [2, 40, M], depth: [1.55, 2.5, M] },
    labels: { width: 'Length', height: 'Height', depth: 'Depth' },
  },
  bridge: {
    label: 'Bridge',
    key: '9',
    group: 'street',
    turns: 'quarter',
    styles: BRIDGE_STYLES,
    note: 'An overpass on piers, or a footbridge with steps at each end. The deck lands; the air under it is the line.',
    dims: { span: 24, width: 8, height: 6, piers: 1 },
    limits: { span: [6, 80, M], width: [2, 20, M], height: [3, 20, M], piers: [0, 6, INT] },
    labels: { span: 'Span', width: 'Width', height: 'Deck height', piers: 'Middle piers' },
  },
  billboard: {
    label: 'Billboard',
    key: '0',
    group: 'street',
    turns: 'any',
    note: 'A hoarding on two legs, with a catwalk. The gap under the board is a line. Variant changes the advert.',
    dims: { width: 8, height: 3.2, lift: 5, variant: 1 },
    limits: { width: [2, 20, M], height: [1.2, 8, M], lift: [1.5, 30, M], variant: [1, 99, INT] },
    labels: { width: 'Width', height: 'Board height', lift: 'Clearance', variant: 'Variant' },
  },
  utilityPole: {
    label: 'Utility pole',
    key: '',
    group: 'street',
    turns: 'any',
    note: 'The town’s concrete pole. Wires run to the nearest other pole within 45 m; they are not solid.',
    dims: { height: 10 },
    limits: { height: [5, 16, M] },
    labels: { height: 'Height' },
  },
  lamp: {
    label: 'Street lamp',
    key: 'W',
    group: 'street',
    turns: 'any',
    note: 'A lamp post with its arm out the way it faces.',
    dims: { height: 7 },
    limits: { height: [3, 12, M] },
    labels: { height: 'Height' },
  },
  vending: {
    label: 'Vending machine',
    key: '',
    group: 'street',
    turns: 'quarter',
    note: 'The town’s own drinks machines, facing the way you point them.',
    dims: { count: 2, variant: 1 },
    limits: { count: [1, 4, INT], variant: [1, 99, INT] },
    labels: { count: 'Machines', variant: 'Variant' },
  },
  car: {
    label: 'Parked car',
    key: '',
    group: 'street',
    turns: 'quarter',
    styles: CAR_STYLES,
    note: 'A parked vehicle from the town, nose the way you point it. Variant changes the colour, or the r32\u2019s and the e82\u2019s livery.',
    dims: { variant: 1 },
    limits: { variant: [1, 99, INT] },
    labels: { variant: 'Variant' },
  },
  rail: {
    label: 'Rail',
    key: 'N',
    group: 'skate',
    turns: 'any',
    note: 'A round bar on posts. Skim it.',
    dims: { length: 6, height: 0.7 },
    limits: { length: [1.5, 30, M], height: [0.3, 3, M] },
    labels: { length: 'Length', height: 'Height' },
  },
  ledge: {
    label: 'Ledge',
    key: 'M',
    group: 'skate',
    turns: 'quarter',
    note: 'A concrete ledge with a steel edge on its front.',
    dims: { length: 6, height: 0.5, depth: 0.9 },
    limits: { length: [1, 30, M], height: [0.2, 2, M], depth: [0.3, 4, M] },
    labels: { length: 'Length', height: 'Height', depth: 'Depth' },
  },
  stairs: {
    label: 'Stair set',
    key: 'H',
    group: 'skate',
    turns: 'quarter',
    note: 'A flight of steps with handrails and a landing. The bottom step faces the way you point it.',
    dims: { steps: 7, width: 4, landing: 3 },
    limits: { steps: [2, 24, INT], width: [1.2, 12, M], landing: [0.8, 12, M] },
    labels: { steps: 'Steps', width: 'Width', landing: 'Landing' },
  },
  quarterPipe: {
    label: 'Quarter pipe',
    key: 'I',
    group: 'skate',
    turns: 'quarter',
    note: 'A transition and a deck, the curve facing the way you point it.',
    dims: { height: 2.4, width: 6, deck: 1.4 },
    limits: { height: [0.8, 5, M], width: [2, 20, M], deck: [0.6, 6, M] },
    labels: { height: 'Height', width: 'Width', deck: 'Deck' },
  },
  tree: {
    label: 'Tree',
    key: 'T',
    group: 'nature',
    turns: 'any',
    styles: TREE_STYLES,
    note: 'A cherry, a street tree or a pine, drawn the way the town draws them. The canopy is solid.',
    dims: { size: 1, variant: 1 },
    limits: { size: [0.5, 3, X], variant: [1, 99, INT] },
    labels: { size: 'Size', variant: 'Variant' },
  },
  gap: {
    label: 'Named gap',
    key: 'J',
    group: 'scoring',
    turns: 'any',
    zone: true,
    note: 'An invisible scoring window, like a skate game’s gap. Name it, pick its points, and put it where the line is. Flying through it scores.',
    dims: { width: 4, height: 3 },
    limits: { width: [1, 40, M], height: [1, 40, M] },
    labels: { width: 'Width', height: 'Height' },
  },
};

/* The builder's own types a freestyle palette also offers, in order. */
export const FURNITURE_PALETTE = ['gate', 'flaggedGate', 'doubleStack', 'ladder', 'diveGate', 'barrier', 'horizontalPole', 'flag', 'cone', 'pole'];

export function isPropType(type) {
  return Object.prototype.hasOwnProperty.call(PROP_TYPES, type);
}

/* A prop's style, repaired: an unknown style is the first one. */
export function styleOf(el) {
  const def = PROP_TYPES[el?.type];
  if (!def || !def.styles) {
    return null;
  }
  return def.styles.includes(el.style) ? el.style : def.styles[0];
}

/* A dimension, clamped into its limits, a count rounded. Never throws. */
export function clampDim(type, key, value) {
  const def = PROP_TYPES[type];
  const lim = def?.limits?.[key];
  const fallback = def?.dims?.[key] ?? 0;
  let v = Number(value);
  if (!Number.isFinite(v)) {
    v = fallback;
  }
  if (!lim) {
    return v;
  }
  if (lim[2] === INT) {
    v = Math.round(v);
  }
  return Math.min(lim[1], Math.max(lim[0], v));
}

/* A named gap's points, snapped to the nearest tier. */
export function gapPointsOf(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return GAP_POINTS[1];
  }
  let best = GAP_POINTS[0];
  for (const p of GAP_POINTS) {
    if (Math.abs(p - n) < Math.abs(best - n)) {
      best = p;
    }
  }
  return best;
}

/*
 * HOW TALL AN ASSET STANDS, for the builder: the 3D view's height drag and
 * the inspector's readout. Not a physics number (the solids are the truth,
 * and src/props/catalog.js can measure them exactly), but it must NEVER come
 * out under what is drawn: the drag's handle would sit inside the roof, and
 * the readout would promise air over a sign that is not there. A little
 * over costs nothing.
 *
 * So every number here is measured rather than guessed, the top of every
 * part (partsOf, in Node) and of the drawn batches (the gallery, in the
 * browser) over each asset's limits, and each formula sits at or above the
 * worst of the two. The comment on a line says what reaches that high.
 *
 * Buildings: the ground storey, every storey over it, and the most the
 * roof carries over the last one. The storeys are src/props/buildings.js's
 * own table and must move with it.
 */
const BUILDING_H = {
  flats: { g: 2.9, fh: 2.9, roof: 3.6 }, /* the aerial, to 3.54 over the roof */
  office: { g: 4.2, fh: 3.6, roof: 5.75 }, /* the rooftop sign on its legs, 5.7 */
  warehouse: { g: 5.0, fh: 5.0, roof: 1.3 }, /* the ventilators, drawn to 1.23 */
  shop: { g: 3.4, fh: 2.9, roof: 3.1 }, /* the aerial, 3.04 */
};
/* A parked car's roof, from the town's table; what the town's builder
 * draws on top reaches up to 7 cm over it. */
const CAR_H = { kei: 1.7, keivan: 1.88, hatch: 1.52, sedan: 1.44, wagon: 1.54, minivan: 1.8, van: 1.98, boxtruck: 2.46, minibus: 2.6, r32: 1.34, e82: 1.41 };
/*
 * A tree's top per unit of size, over EVERY seed, because this is not told
 * which tree it is. These are the layouts' own bounds, every random draw at
 * its top at once (src/props/street.js): a cherry's trunk, limb, fork, the
 * blossom's lift and its radius, 2.8 + 2.0 + 1.82 + 0.95 + 0.73; a street
 * tree's 4.14 + 1.76 + 1.5 + 0.9; a pine's tallest tier 1.224 times its
 * 12.51 m. Sampled trees stand at 5 to 7.5 and 9 to 12.9, so the readout is
 * generous for most of them and short for none.
 */
const TREE_H = { sakura: 8.35, street: 8.35, pine: 15.35 };

export function approxHeight(type, dims, style) {
  const d = dims || {};
  switch (type) {
    case 'building': {
      const b = BUILDING_H[style] ?? BUILDING_H.flats;
      return b.g + (Math.max(1, d.floors ?? 1) - 1) * b.fh + b.roof;
    }
    /* The rooftop sign over the stair core, 4.4 over the top slab. */
    case 'bando': return (d.floors ?? 1) * 3.4 + 4.5;
    /* The cathead and its pendants, 7.35 over the mast, drawn to 8.2. */
    case 'crane': return (d.height ?? 30) + 8.3;
    /* The finial over the vent, drawn 1.23 over the tank's top. */
    case 'waterTower': return (d.height ?? 16) + 2 * (d.radius ?? 3.6) + (d.tank ?? 0) + 1.3;
    /* The lightning rod, 3.05 over the lattice, drawn to 3.19. */
    case 'mast': return (d.height ?? 32) + 3.3;
    /* The corbel and the flue, drawn 0.9 over the brick. */
    case 'chimney': return (d.height ?? 24) + 1;
    /* The peak's capsule, 0.25 over the lattice. */
    case 'pylon': return (d.height ?? 28) + 0.3;
    /* Drawn 5 cm over the pole's height. */
    case 'utilityPole': return (d.height ?? 10) + 0.1;
    /* Drawn 2 cm over the top box. */
    case 'containers': return (d.stack ?? 1) * 2.591 + 0.05;
    /* The standards, which run on past the top lift as its guard rail's
     * posts: 1.03, drawn to 1.05. */
    case 'scaffold': return (d.height ?? 10) + 1.1;
    /* The road bridge's gantry sign, to 7.65 over the deck; a footbridge's
     * sign, 1.25. */
    case 'bridge': return (d.height ?? 6) + (style === 'footbridge' ? 1.3 : 7.7);
    /* The lamps over the board, 0.63. */
    case 'billboard': return (d.lift ?? 5) + (d.height ?? 3.2) + 0.7;
    /* The head, drawn to 0.41 over the height. */
    case 'lamp': return (d.height ?? 7) + 0.45;
    /* The town's machine, drawn to 2.04 with its header. */
    case 'vending': return 2.05;
    case 'car': return (CAR_H[style] ?? CAR_H.kei) + 0.1;
    /* The rail's bar, the ledge's edge and the pipe's coping, drawn up to
     * 3.5 cm over the height. */
    case 'rail': case 'ledge': case 'quarterPipe': return (d.height ?? 1) + 0.05;
    case 'gap': return d.height ?? 1;
    /* The hand rail, 0.88 over the top step. */
    case 'stairs': return (d.steps ?? 7) * 0.17 + 0.95;
    case 'tree': return (TREE_H[style] ?? TREE_H.sakura) * (d.size ?? 1);
    default: return 1;
  }
}
