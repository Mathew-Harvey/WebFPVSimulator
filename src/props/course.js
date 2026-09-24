/*
 * course.js: the track builder's own elements, as furniture in a built
 * freestyle map. Gates, flags, cones, poles, barriers, the horizontal pole,
 * the start pads and a named gap.
 *
 * On a race track these are built by src/render/scene.js around the flying
 * order. A freestyle map has no flying order, so a gate is furniture: a
 * thing to fly through for style, drawn in the town's palette so it belongs
 * to the same picture as the buildings, solid on every tube. The sizes are
 * the document's own, read through the builder's pure modules, so the gate
 * the author placed is the gate that stands here.
 *
 * FRAME. An aperture's heading is its plane NORMAL, which in the local frame
 * of src/props/parts.js is +x. The opening spans local z and up, tilted about
 * its own centre by the element's pitch, the same way
 * src/trackbuilder/geometry.js tilts it:
 *
 *   normal   n = ( cos p, sin p, 0 )
 *   width    w = ( 0, 0, -1 )          the document's left is local -z
 *   height   u = ( -sin p, cos p, 0 )
 *
 * Every other element's heading is a heading about up, the same as a prop.
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

import { Parts } from './parts.js';
import { sincos } from './trig.js';
import { apertureLevels, FRAME_TUBE_OD, flagSideSigns, flagSideOf, gateFlagHeight, isUnbuilt } from '../trackbuilder/elements.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const SC = { s: 0, c: 1 };

/* A point in the opening's own plane: `a` across (along +w), `b` up it
 * (along +u), about the opening's centre height `cy`. */
function inPlane(p, a, b, cy, out = [0, 0, 0]) {
  out[0] = -p.s * b;
  out[1] = cy + p.c * b;
  out[2] = -a;
  return out;
}

/* ------------------------------------------------------------------ *
 * THE GATE FAMILY. One frame per level, four tubes round each opening; a
 * stack shares the bar between two levels. A printed header board over the
 * top opening, vinyl sleeves on the legs, a pennant where the type has one.
 * ------------------------------------------------------------------ */

export function gateLayout(el) {
  const P = new Parts();
  if (isUnbuilt(el)) {
    return P.list;
  }
  sincos(el.pitch || 0, SC);
  const p = { s: SC.s, c: SC.c };
  const levels = apertureLevels(el.dims);
  const r = FRAME_TUBE_OD / 2;
  const tube = FRAME_TUBE_OD;
  const pipe = 'gatePipe';
  const hw = levels[0].clearW / 2 + tube / 2;
  /*
   * EACH LEVEL IS FRAMED ABOUT ITS OWN CENTRE, which is how the builder
   * places them: apertureCenter in src/trackbuilder/model.js stacks the
   * centres straight up and tilts each opening about its own, so a tilted
   * stack is a column of tilted frames rather than one leaning ladder. For a
   * single dive gate, which is nearly every tilted gate, the two readings
   * are the same; for a stack only this one agrees with the plan.
   */
  let topLv = null;
  for (const lv of levels) {
    const hh = lv.clearH / 2 + tube / 2;
    const at = (a, b) => inPlane(p, a, b, lv.centerH, [0, 0, 0]);
    P.cap(pipe, at(-hw, -hh), at(-hw, hh), r, { name: 'upright', kind: 'gate' });
    P.cap(pipe, at(hw, -hh), at(hw, hh), r, { name: 'upright', kind: 'gate' });
    P.cap(pipe, at(-hw, -hh), at(hw, -hh), r, { name: 'bar', kind: 'gate' });
    P.cap(pipe, at(-hw, hh), at(hw, hh), r, { name: 'bar', kind: 'gate' });
    topLv = lv;
  }
  const lv0 = levels[0];
  const hh0 = lv0.clearH / 2 + tube / 2;
  /* Legs from the lowest bar's ends to the ground under them, for a gate
   * whose lowest bar is in the air: a tilted gate, or one on a sill. */
  for (const s of [-1, 1]) {
    const foot = inPlane(p, s * hw, -hh0, lv0.centerH, [0, 0, 0]);
    if (foot[1] > 0.05) {
      P.cap(pipe, [foot[0], 0, foot[2]], foot, r, { name: 'leg', kind: 'gate' });
    }
  }
  /* The header board over the top opening, solid as a stack of thin
   * capsules across it. */
  const hhT = topLv.clearH / 2 + tube / 2;
  const board = headerHeight(levels);
  const rows = 5;
  for (let i = 0; i < rows; i += 1) {
    const b = hhT + tube / 2 + ((i + 0.5) / rows) * board;
    P.cap('gateVinyl', inPlane(p, -hw + 0.06, b, topLv.centerH), inPlane(p, hw - 0.06, b, topLv.centerH), 0.06,
      { draw: false, name: 'header', kind: 'gate' });
  }
  /* Pennants on the header, where the type has them. */
  const side = flagSideOf(el);
  if (side) {
    const fh = gateFlagHeight(el.dims);
    for (const sign of flagSideSigns(side)) {
      const a = sign * hw;
      P.cap('flagMast', inPlane(p, a, hhT + board, topLv.centerH), inPlane(p, a, hhT + board + fh, topLv.centerH), 0.012,
        { name: 'pennantMast', kind: 'obstacle' });
    }
  }
  return P.list;
}

/* The header board's height: the race field's 0.58 m on a MultiGP gate,
 * scaled down with a narrower one so a whoop gate is not all board. */
function headerHeight(levels) {
  return 0.58 * Math.min(1, levels[0].clearW / 1.524);
}

export function gateDraw(el, parts, K) {
  if (isUnbuilt(el)) {
    return;
  }
  sincos(el.pitch || 0, SC);
  const p = { s: SC.s, c: SC.c };
  const levels = apertureLevels(el.dims);
  const tube = FRAME_TUBE_OD;
  const hw = levels[0].clearW / 2 + tube / 2;
  const top = levels[levels.length - 1];
  const hhT = top.clearH / 2 + tube / 2;
  const board = headerHeight(levels);
  const n = [p.c, p.s, 0];
  const across = [0, 0, -1];
  /* The header board: a thin slab in the plane, printed on both faces. */
  K.panel('gateHeader', inPlane(p, 0, hhT + tube / 2 + board / 2, top.centerH), n, across, hw * 2 - 0.1, board, 0.02);
  /* Vinyl sleeves on every level's uprights. */
  for (const lv of levels) {
    for (const s of [-1, 1]) {
      K.panel('gateSleeve', inPlane(p, s * hw, 0, lv.centerH), n, across, 0.14, lv.clearH * 0.9, 0.05);
    }
  }
  /* Base plates under a vertical gate standing on the ground. */
  if (Math.abs(el.pitch || 0) <= 0.05 && levels[0].sillH < 0.05) {
    for (const s of [-1, 1]) {
      K.box('gatePipe', -0.22, 0, -s * hw - 0.08, 0.22, 0.03, -s * hw + 0.08);
    }
  }
  /* Pennants: a sail off each mast. */
  const side = flagSideOf(el);
  if (side) {
    const fh = gateFlagHeight(el.dims);
    for (const sign of flagSideSigns(side)) {
      K.pennant(inPlane(p, sign * hw, hhT + board, top.centerH), fh, sign < 0 ? 1 : -1);
    }
  }
}

/* ------------------------------------------------------------------ *
 * MARKERS AND OBSTACLES, sized the way src/render/scene.js sizes them.
 * ------------------------------------------------------------------ */

export function flagLayout(el) {
  const h = Math.max(0.5, el.dims.height ?? 2.5);
  const r = Math.max(0.02, el.dims.poleRadius ?? 0.025);
  const P = new Parts();
  P.post('flagMast', 0, 0, 0, h, r, { name: 'mast', kind: 'obstacle' });
  return P.list;
}

export function flagDraw(el, parts, K) {
  const h = Math.max(0.5, el.dims.height ?? 2.5);
  K.pennant([0, 0.4, 0], h - 0.4, 1);
  K.cyl('metalDark', [0, 0, 0], [0, 0.12, 0], 0.08, 6);
}

export function coneLayout(el) {
  const h = el.dims.height ?? 0.7;
  const r = el.dims.baseRadius ?? 0.18;
  const P = new Parts();
  /* Solid as a post of the cone's middle radius, as the race field does. */
  P.post('cone', 0, 0, 0, h, r * 0.6, { draw: false, name: 'cone', kind: 'obstacle' });
  return P.list;
}

export function coneDraw(el, parts, K) {
  const h = el.dims.height ?? 0.7;
  const r = el.dims.baseRadius ?? 0.18;
  K.cone('cone', [0, 0.04, 0], r, h - 0.04, 12);
  K.cyl('lineWhite', [0, h * 0.45, 0], [0, h * 0.62, 0], r * 0.52, 12, r * 0.42);
  K.box('cone', -r * 1.15, 0, -r * 1.15, r * 1.15, 0.04, r * 1.15);
}

export function poleMarkerLayout(el) {
  const h = Math.max(0.1, el.dims.height ?? 1.5);
  const r = Math.max(0.004, el.dims.poleRadius ?? 0.02);
  const P = new Parts();
  P.post('poleRed', 0, 0, 0, h, r, { name: 'pole', kind: 'pole' });
  /* The foot, as a short fat post rather than the race field's box, so the
   * marker can face any way. It is round, so which way hardly matters. */
  P.post('poleRed', 0, 0, 0, r * 1.6, r * 2, { name: 'foot', kind: 'pole' });
  return P.list;
}

/*
 * The barrier: a vinyl covered box. Drawn as the box; solid as capsules
 * stacked up it, the race field's arrangement, so it can face any way.
 */
export function barrierLayout(el) {
  const w = Math.max(0.2, el.dims.width);
  const d = Math.max(0.05, el.dims.depth);
  const h = Math.max(0.05, el.dims.height);
  const P = new Parts();
  const rowR = d * 0.5;
  const rows = Math.max(1, Math.ceil(h / Math.max(d, 1e-6)));
  const rowH = h / rows;
  const half = Math.max(0, w * 0.5 - rowR);
  for (let i = 0; i < rows; i += 1) {
    const y = (i + 0.5) * rowH;
    P.cap('barrier', [-half, y, 0], [half, y, 0], rowR, { draw: false, name: 'barrier', kind: 'wall' });
  }
  return P.list;
}

export function barrierDraw(el, parts, K) {
  const w = Math.max(0.2, el.dims.width);
  const d = Math.max(0.05, el.dims.depth);
  const h = Math.max(0.05, el.dims.height);
  K.panel('barrierVinyl', [0, h / 2, 0], [0, 0, 1], [1, 0, 0], w, h, d);
}

/* The horizontal pole: a bar across, along the element's heading, at its
 * base height, carried on two legs. */
export function hpoleLayout(el) {
  const w = Math.max(0.2, el.dims.width);
  const t = Math.max(0.02, Math.min(el.dims.depth, el.dims.height));
  const P = new Parts();
  /* The bar is at the element's own base height, which the map already
   * lifts the whole element to; so in the local frame it is at the bottom,
   * and the legs reach DOWN to the ground. The map passes the lift. */
  const lift = el.position?.z ?? 1.6;
  P.cap('poleRed', [-w / 2, 0, 0], [w / 2, 0, 0], t / 2, { name: 'bar', kind: 'pole' });
  for (const s of [-1, 1]) {
    P.cap('gatePipe', [s * w / 2, 0, 0], [s * w / 2, -lift, 0], 0.017, { name: 'leg', kind: 'gate' });
  }
  return P.list;
}

/*
 * The start pads: a row of foam mats across the heading, which is the way
 * the craft faces. Drawn and NOT solid: the spawn can face any way, a pad is
 * a box, and a box cannot turn, so a mat three centimetres thick is paint on
 * the ground and the craft sits on the ground through it.
 */
export function padsLayout(el) {
  const n = clamp(Math.round(el.dims.pads ?? 1), 1, 12);
  const spacing = Math.max(0.3, el.dims.spacing ?? 1.5);
  const size = Math.max(0.1, el.dims.padSize ?? 0.6);
  const P = new Parts();
  for (let i = 0; i < n; i += 1) {
    const z = (i - (n - 1) / 2) * spacing;
    P.box('startWood', -size / 2, 0, z - size / 2, size / 2, 0.025, z + size / 2, { name: 'pad', solid: false });
  }
  return P.list;
}

export function padsDraw(el, parts, K) {
  for (const p of parts) {
    const [ax, , az] = p.lo;
    const [bx, by, bz] = p.hi;
    K.box('startFoam', ax + 0.04, by, az + 0.04, bx - 0.04, by + 0.008, bz - 0.04);
    K.box('startLip', bx - 0.03, 0, az, bx, by + 0.012, bz);
  }
}

/* A named gap is a scoring zone and nothing in the air: no parts. */
export function gapLayout() {
  return [];
}

/* Ground paint: nothing solid, drawn by the map from the course's logos. */
export function decalLayout() {
  return [];
}
