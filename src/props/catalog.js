/*
 * catalog.js: every asset a built freestyle map can hold, with the code
 * that lays it out and the code that paints it.
 *
 * What each asset IS lives in ./types.js, which imports nothing, so the
 * track builder can list the assets without this file. This file adds the
 * two functions per asset:
 *
 *   layout(el) -> parts          pure: what is solid (./parts.js)
 *   draw(el, parts, kit)         the paint on top, in the browser only;
 *                                `kit` is src/props/kit.js and carries
 *                                Three.js, so nothing here imports it
 *
 * The map reads this to build the world, the builder's 3D preview reads it
 * to draw the same world, and the checks read it to prove every asset is
 * drawn and solid. One table, so the three cannot disagree.
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

import { PROP_TYPES, styleOf, tiltOf } from './types.js';
import { tiltParts } from './solids.js';
import * as BUILDINGS from './buildings.js';
import * as INDUSTRIAL from './industrial.js';
import * as STREET from './street.js';
import * as SKATE from './skate.js';
import * as COURSE from './course.js';
import * as WINDMILL from './windmill.js';
import * as HOMES from './homes.js';
import * as SUNNY from './sunny.js';
import * as DOCK from './dock.js';
import * as FACTORY from './factory.js';
import * as ALPINE from './alpine.js';
import * as TOWERS from './towers.js';
import * as SHIOKAZE from './shiokaze.js';
import * as CEDAR from './cedar.js';
import * as OFFICE from './office.js';
import * as KAZA from './kaza.js';
import * as SANATORIUM from './sanatorium.js';
import * as RALLY from './rally.js';
import * as AIRFIELD from './airfield.js';
import * as HOTARU from './hotaru.js';
import { buildingLayout, buildingDraw, bandoLayout, bandoDraw } from './buildings.js';
import {
  craneLayout, craneDraw, waterLayout, waterDraw, mastLayout, mastDraw, chimneyLayout, chimneyDraw,
  hollowChimneyLayout, hollowChimneyDraw, pylonLayout, pylonDraw, turbineLayout, turbineDraw,
  containerLayout, containerDraw, scaffoldLayout, scaffoldDraw,
} from './industrial.js';
import {
  bridgeLayout, bridgeDraw, billboardLayout, billboardDraw, poleLayout, poleDraw, lampLayout, lampDraw,
  vendingLayout, vendingDraw, carLayout, carDraw, treeLayout, treeDraw,
} from './street.js';
import { windmillLayout, windmillDraw } from './windmill.js';
import {
  railLayout, railDraw, ledgeLayout, ledgeDraw, stairsLayout, stairsDraw, pipeLayout, pipeDraw,
} from './skate.js';
import {
  gateLayout, gateDraw, flagLayout, flagDraw, coneLayout, coneDraw, poleMarkerLayout,
  barrierLayout, barrierDraw, hpoleLayout, padsLayout, padsDraw, gapLayout, decalLayout,
  balloonChaseLayout,
} from './course.js';

const CODE = {
  building: [buildingLayout, buildingDraw],
  bando: [bandoLayout, bandoDraw],
  crane: [craneLayout, craneDraw],
  waterTower: [waterLayout, waterDraw],
  mast: [mastLayout, mastDraw],
  chimney: [chimneyLayout, chimneyDraw],
  hollowChimney: [hollowChimneyLayout, hollowChimneyDraw],
  pylon: [pylonLayout, pylonDraw],
  turbine: [turbineLayout, turbineDraw],
  containers: [containerLayout, containerDraw],
  scaffold: [scaffoldLayout, scaffoldDraw],
  bridge: [bridgeLayout, bridgeDraw],
  billboard: [billboardLayout, billboardDraw],
  utilityPole: [poleLayout, poleDraw],
  lamp: [lampLayout, lampDraw],
  vending: [vendingLayout, vendingDraw],
  car: [carLayout, carDraw],
  rail: [railLayout, railDraw],
  ledge: [ledgeLayout, ledgeDraw],
  stairs: [stairsLayout, stairsDraw],
  quarterPipe: [pipeLayout, pipeDraw],
  tree: [treeLayout, treeDraw],
  windmill: [windmillLayout, windmillDraw],
  gap: [gapLayout, null],
  balloonChase: [balloonChaseLayout, null],
};

/* Every prop, its data and its code, keyed by type. */
export const PROPS = {};
for (const [id, t] of Object.entries(PROP_TYPES)) {
  const code = CODE[id];
  if (!code) {
    throw new Error(`props: ${id} is in types.js with no layout in catalog.js`);
  }
  PROPS[id] = { id, ...t, layout: code[0], draw: code[1] };
}
for (const id of Object.keys(CODE)) {
  if (!PROPS[id]) {
    throw new Error(`props: ${id} has a layout in catalog.js and no entry in types.js`);
  }
}

/*
 * The course furniture a freestyle map may also hold: the builder's own
 * element types, drawn and made solid by ./course.js. Every one of them is
 * built of capsules, so every one turns freely.
 */
export const FURNITURE = {
  gate: { layout: gateLayout, draw: gateDraw, turns: 'any' },
  flaggedGate: { layout: gateLayout, draw: gateDraw, turns: 'any' },
  doubleStack: { layout: gateLayout, draw: gateDraw, turns: 'any' },
  flaggedDoubleStack: { layout: gateLayout, draw: gateDraw, turns: 'any' },
  ladder: { layout: gateLayout, draw: gateDraw, turns: 'any' },
  tower: { layout: gateLayout, draw: gateDraw, turns: 'any' },
  diveGate: { layout: gateLayout, draw: gateDraw, turns: 'any' },
  flag: { layout: flagLayout, draw: flagDraw, turns: 'any' },
  cone: { layout: coneLayout, draw: coneDraw, turns: 'any' },
  pole: { layout: poleMarkerLayout, draw: null, turns: 'any' },
  barrier: { layout: barrierLayout, draw: barrierDraw, turns: 'any' },
  horizontalPole: { layout: hpoleLayout, draw: null, turns: 'any' },
  startPads: { layout: padsLayout, draw: padsDraw, turns: 'any' },
  groundLogo: { layout: decalLayout, draw: null, turns: 'any' },
};

/*
 * WHAT EACH FAMILY BRINGS BESIDES ITS ASSETS. A family file may export
 *
 *   MATERIALS   { name: spec }      extra materials, in ./kit.js's spec
 *                                   format ({ c, tint, bands } lit, { f }
 *                                   flat), for colours only it uses
 *   PAINTERS    { key: { variants, paint(variant) -> canvas } }
 *                                   painted signs only it hangs, drawn with
 *                                   K.sign(key, ...)
 *
 * so a family's look lives in its own file and two families can be worked on
 * at once without touching the same line. A name two families both claim is
 * a mistake, and it throws here rather than one silently winning.
 */
const FAMILIES = {
  buildings: BUILDINGS, industrial: INDUSTRIAL, street: STREET, skate: SKATE, course: COURSE, windmill: WINDMILL, homes: HOMES, sunny: SUNNY, factory: FACTORY, cedar: CEDAR, dock: DOCK, towers: TOWERS, alpine: ALPINE, office: OFFICE, kaza: KAZA,
  sanatorium: SANATORIUM,
  shiokaze: SHIOKAZE, rally: RALLY,
  airfield: AIRFIELD, hotaru: HOTARU,
};
export const FAMILY_MATERIALS = {};
export const FAMILY_PAINTERS = {};
for (const [fname, mod] of Object.entries(FAMILIES)) {
  for (const [k, v] of Object.entries(mod.MATERIALS ?? {})) {
    if (FAMILY_MATERIALS[k]) {
      throw new Error(`props: material ${k} is claimed by two families (${fname})`);
    }
    FAMILY_MATERIALS[k] = v;
  }
  for (const [k, v] of Object.entries(mod.PAINTERS ?? {})) {
    if (FAMILY_PAINTERS[k]) {
      throw new Error(`props: painter ${k} is claimed by two families (${fname})`);
    }
    FAMILY_PAINTERS[k] = v;
  }
}

/* An element's asset: a prop's entry, or furniture's, or null. */
export function assetOf(el) {
  const type = el && el.type;
  return PROPS[type] ?? FURNITURE[type] ?? null;
}

/* The parts of an element, with its style resolved first, so a layout never
 * sees a style it does not know. */
export function partsOf(el) {
  const a = assetOf(el);
  if (!a || !a.layout) {
    return [];
  }
  const style = styleOf(el);
  const view = style && style !== el.style ? { ...el, style } : el;
  return a.layout(view);
}

/*
 * An element's parts AS IT STANDS: partsOf, stood on end if it is (tiltOf
 * and tiltParts in ./solids.js). Everything that asks where the solids are,
 * how much ground the element covers or how tall it stands reads this, so a
 * container stood on its end is a tall thin footprint to the plan, the
 * warnings and the physics alike. The DRAWING reads partsOf and turns the
 * whole of what it paints with the kit's matrix instead (PropKit.element),
 * because an asset's draw() puts its paint on in the upright frame.
 */
export function placedPartsOf(el) {
  const parts = partsOf(el);
  const q = tiltOf(el);
  return q ? tiltParts(parts, q) : parts;
}

/* An element's plan rectangle in its own frame, { x0, x1, z0, z1 }: the
 * bounds of its parts, for the plan view's pick box. */
export function planBounds(parts) {
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  const eat = (x, z, pad) => {
    x0 = Math.min(x0, x - pad);
    x1 = Math.max(x1, x + pad);
    z0 = Math.min(z0, z - pad);
    z1 = Math.max(z1, z + pad);
  };
  for (const p of parts) {
    if (p.t === 'box') {
      eat(p.lo[0], p.lo[2], 0);
      eat(p.hi[0], p.hi[2], 0);
    } else {
      eat(p.a[0], p.a[2], p.r);
      eat(p.b[0], p.b[2], p.r);
    }
  }
  if (!Number.isFinite(x0)) {
    return { x0: -0.5, x1: 0.5, z0: -0.5, z1: 0.5 };
  }
  return { x0, x1, z0, z1 };
}
