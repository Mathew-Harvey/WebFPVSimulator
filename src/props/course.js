/*
 * course.js: the track builder's own elements, as furniture in a built
 * freestyle map. Gates, flags, cones, poles, barriers, the horizontal pole,
 * the start pads and a named gap.
 *
 * On a race track these are built by src/render/scene.js around the flying
 * order. A freestyle map has no flying order, so a gate is furniture: a
 * thing to fly through for style. It is the SAME OBJECT the race field
 * stands up, the same MultiGP form a pilot knows from a chapter race: a
 * tube frame, printed sleeves outboard of the uprights, a printed header
 * sleeved over the top rail, feather flags, sandbagged feet. What changes is
 * the drawing: every colour is taken into the town's cel palette, and every
 * piece has enough thickness and shape that the town's depth ink has an
 * edge to draw, because a 33 mm tube alone is a hairline at twenty metres
 * and the sleeves and the header are what a pilot actually reads a gate by.
 * The sizes are the document's own, read through the builder's pure
 * modules, so the gate the author placed is the gate that stands here.
 *
 * THE PHYSICS CONTRACT. Everything a quad could hit is a solid capsule in
 * the layout, and a capsule never reaches outside what is drawn: printed
 * panels are drawn six centimetres thick and solid as rows of capsules
 * inside that thickness, a tapered mast is solid at its thinner radius, a
 * sandbag is solid inside its squashed drawing. Every one of these turns
 * freely, so none of them has a solid box. What is drawn and not solid is
 * cloth (a flag's sail), paint, a few centimetres of plate on the ground,
 * fittings and ties a few millimetres proud of the tube they hold, and a
 * barrier's guy ropes: thin, all of it, or down where the ground is.
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

import { Parts, hashString } from './parts.js';
import { sincos } from './trig.js';
import {
  apertureLevels, FRAME_TUBE_OD, GATE_FLAG_POLE_R, flagSideSigns, flagSideOf, flagLeanSign, gateFlagHeight,
  isUnbuilt,
} from '../trackbuilder/elements.js';
import { FLAG, GATE_BANNER_H, BANNER, paintFlagSail, bannerCanvas } from '../art/banners.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const SC = { s: 0, c: 1 };

/* The town's ink, for the painted edges below. */
const INK = '#39324f';

/* ------------------------------------------------------------------ *
 * THE FAMILY'S COLOURS. The race field's language (white vinyl, navy and
 * red, a chequer) is the focal accent set the town's palette keeps for
 * things the eye should find, so it carries over; the metal, rubber and
 * canvas around it are pulled onto the town's greys and violet shadows so
 * a gate beside a house looks drawn by the same hand.
 * ------------------------------------------------------------------ */
export const MATERIALS = {
  /* The frame: pale alloy a step under the vinyl, so the tube reads as a
   * tube against the sleeve beside it rather than as more sleeve. */
  courseTube: { c: 0xb9bfcc, tint: 0x6a6490 },
  /* A gate's frame, which is red: see THE GATE FAMILY below. */
  courseFrame: { c: 0xd9483b, tint: 0x6f3a5c },
  /* Moulded fittings and straps: a darker plastic, the joint a builder
   * assembled, and the dark note that stops a white structure dissolving
   * into a pale sky. */
  courseFitting: { c: 0x5f6679, tint: 0x4a4468 },
  courseStrap: { c: 0x2f3552, tint: 0x3a3450 },
  /* Base plates and the flag's cross foot. */
  courseFoot: { c: 0x565c70, tint: 0x3f3a50 },
  /* Sandbags: the pale woven kind every Japanese site keeps stacked by the
   * gate, with a dark cord at the tied neck. Pale on a dark plate, so the
   * foot reads as a heap and not as more plate. */
  courseBag: { c: 0xd8d1be, tint: 0x7d74a0 },
  courseBagTie: { c: 0x2c2838, tint: 0x2c2838 },
  /* The feather flag's mast is light alloy and its whip dark fibreglass,
   * which is what a real one is and what lets the bend read as a bend. */
  courseMast: { c: 0xd9dce4, tint: 0x7d74a0 },
  courseWhip: { c: 0x4b5064, tint: 0x3a3450 },
  /* The cone: the town's orange, a black rubber base, reflective collars
   * drawn FLAT so they hold their white on the shadow side, which is what
   * retroreflective sheeting does in a photograph and is the cone's tell. */
  courseCone: { c: 0xf07b30, tint: 0x7a4a68 },
  courseConeBase: { c: 0x3a3644, tint: 0x2f2a3a },
  courseReflect: { f: 0xf7f4f2 },
  /* Red and white for the poles, the town's red rather than a pure one. */
  coursePoleRed: { c: 0xde4a3c, tint: 0x6f3a5c },
  coursePoleWhite: { c: 0xf2eeec, tint: 0x7d74a0 },
  /* The inflatable barrier's skin, the print's own navy. */
  courseBarrierNavy: { c: 0x2a3d63, tint: 0x2f2a4a },
  /* Start mats, one pilot colour each, as launch pads are, and white paint. */
  coursePadRed: { c: 0xe0453f, tint: 0x6f3a5c },
  coursePadBlue: { c: 0x3d6ec4, tint: 0x3f3d70 },
  coursePadYellow: { c: 0xf4c033, tint: 0x7a6a78 },
  coursePadTeal: { c: 0x2f9c9a, tint: 0x3f5a70 },
  coursePadEdge: { c: 0x2c2838, tint: 0x2c2838 },
  coursePaint: { f: 0xf4f2f6 },
  courseChequer: { f: 0x2d2a36 },
};

const PAD_COLOURS = ['coursePadRed', 'coursePadBlue', 'coursePadYellow', 'coursePadTeal'];

/* ------------------------------------------------------------------ *
 * THE FAMILY'S PAINT.
 *
 *   courseSail     the race field's feather flag print (src/art/banners.js,
 *                  so the two cannot drift), cut to the feather's outline
 *                  with the swept head transparent, and inked round its
 *                  edge the way an animator outlines cloth. Four variants:
 *                  navy front, navy reverse, red front, red reverse. The
 *                  reverse mirrors the LAYOUT and not the mark, so the
 *                  accent band stays on the mast from both sides and the
 *                  mark still reads, which is the rule banners.js states.
 *   courseGridNo   a start mat's number, white with an ink edge, turned a
 *                  quarter so it reads the right way up to a pilot standing
 *                  behind the mat looking along its heading.
 * ------------------------------------------------------------------ */

/* The sail's outline in the unit flag: x from the mast to the free edge,
 * y up, apex at 1. The same arc as featherMast below, with the same sine,
 * so the cut edge of the cloth and the whip's solid are one curve. */
function sailOutline(steps = 16) {
  const R = 1 - FLAG.bend;
  const pts = [[0, FLAG.foot], [0, FLAG.bend]];
  const sc = { s: 0, c: 1 };
  for (let i = 1; i <= steps; i += 1) {
    sincos((i / steps) * FLAG.sweep, sc);
    pts.push([R * (1 - sc.c), FLAG.bend + R * sc.s]);
  }
  const tip = pts[pts.length - 1];
  pts.push([tip[0], FLAG.foot]);
  return { pts, width: tip[0] };
}

function paintSail(variant) {
  const w = 144;
  const h = 512;
  const c = bannerCanvas(w, h);
  const g = c.getContext('2d');
  const accent = variant >= 2 ? 'red' : 'navy';
  const reverse = variant % 2 === 1;
  const { pts, width } = sailOutline();
  const px = (x) => (x / width) * w;
  const py = (y) => ((1 - y) / (1 - FLAG.foot)) * h;
  g.clearRect(0, 0, w, h);
  g.save();
  if (reverse) {
    g.translate(w, 0);
    g.scale(-1, 1);
  }
  g.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? g.moveTo(px(x), py(y)) : g.lineTo(px(x), py(y))));
  g.closePath();
  g.save();
  g.clip();
  paintFlagSail(g, w, h, { accent, mirrorMark: reverse });
  /* The ink edge, inside the clip so only its inner half lands: a drawn
   * outline that holds the flag's shape past the distance where the depth
   * ink fades into the haze. */
  g.strokeStyle = INK;
  g.lineWidth = 7;
  g.lineJoin = 'round';
  g.stroke();
  g.restore();
  g.restore();
  return c;
}

function paintGridNo(variant) {
  const s = 128;
  const c = bannerCanvas(s, s);
  const g = c.getContext('2d');
  g.clearRect(0, 0, s, s);
  g.save();
  g.translate(s / 2, s / 2);
  /* A quarter turn clockwise puts the glyph's top along the texture's +u,
   * which a '+y' plane lays along the mat's heading. */
  g.rotate(Math.PI / 2);
  g.font = `900 ${Math.round(s * 0.74)}px 'Arial Black', 'Helvetica Neue', Impact, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = s * 0.1;
  g.strokeStyle = INK;
  const t = String(variant + 1);
  g.strokeText(t, 0, s * 0.04);
  g.fillStyle = BANNER.chequerLight;
  g.fillText(t, 0, s * 0.04);
  g.restore();
  return c;
}

/* START, painted on the ground ahead of the grid the way a road marking
 * is: tall narrow letters stretched along the way a pilot looks, so they
 * read from a low eye rather than only from above. Turned a quarter like
 * the numbers, with a thin ink edge so white paint still reads on a pale
 * yard. */
function paintStartText() {
  const w = 256;
  const h = 512;
  const c = bannerCanvas(w, h);
  const g = c.getContext('2d');
  g.clearRect(0, 0, w, h);
  g.save();
  g.translate(w / 2, h / 2);
  g.rotate(Math.PI / 2);
  g.font = `900 ${Math.round(w * 0.86)}px 'Arial Black', 'Helvetica Neue', Impact, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const run = g.measureText('START').width;
  g.scale(Math.min(1, (h * 0.94) / run), 1);
  g.lineJoin = 'round';
  g.lineWidth = w * 0.05;
  g.strokeStyle = INK;
  g.strokeText('START', 0, w * 0.03);
  g.fillStyle = BANNER.chequerLight;
  g.fillText('START', 0, w * 0.03);
  g.restore();
  return c;
}

export const PAINTERS = {
  courseSail: { variants: 4, paint: paintSail },
  courseGridNo: { variants: 12, paint: paintGridNo },
  courseStartText: { variants: 1, paint: paintStartText },
};

/* ------------------------------------------------------------------ *
 * SHARED PIECES
 * ------------------------------------------------------------------ */

const TUBE = FRAME_TUBE_OD;
const TR = TUBE / 2;
/* The MultiGP opening the race field's dress is proportioned for. A
 * narrower gate scales its sleeves and board down with it, so a small gate
 * is not all banner. */
const MULTIGP_W = 1.524;
/* Printed vinyl is drawn this thick and is solid as capsules of PANEL_R
 * inside it, no further apart than PANEL_STEP: a slot of a few centimetres
 * between two of them is far narrower than a five inch's hull, so the panel
 * is closed to a craft and every solid stays inside the drawing. */
const PANEL_T = 0.06;
const PANEL_R = 0.028;
const PANEL_STEP = 0.1;
/* A gate's support post under a tilted frame: 1.6 tubes, the race field's
 * mast, standing one post radius outboard of the opening so its inner face
 * is the opening's own edge (src/trackbuilder/geometry.js). */
const POST_R = TR * 1.6;
/* Whip segments on a feather mast. Five keeps each chord within a
 * centimetre of the true arc, so the solid chords and the drawn chords are
 * one polyline and the sail's cut edge never parts from either. */
const WHIP_SEGS = 5;
/* A base plate's thickness: paint on the ground, not a kerb. */
const FOOT_T = 0.035;

/* Evenly spaced centres from lo to hi, no further apart than step. */
function spread(lo, hi, step) {
  if (!(hi > lo)) {
    return [(lo + hi) / 2];
  }
  const n = Math.max(1, Math.ceil((hi - lo) / step - 1e-9));
  const out = [];
  for (let i = 0; i <= n; i += 1) {
    out.push(lo + ((hi - lo) * i) / n);
  }
  return out;
}

/* A point in the opening's own plane: `a` across (along +w), `b` up it
 * (along +u), about the opening's centre height `cy`. */
function inPlane(p, a, b, cy, out = [0, 0, 0]) {
  out[0] = -p.s * b;
  out[1] = cy + p.c * b;
  out[2] = -a;
  return out;
}

/*
 * A feather flag's mast as one polyline: the straight pole from `base` to
 * the bend, then the whip sweeping toward (dx, 0, dz). Each point carries
 * the mast's radius there. Built with this module's own sine, because the
 * layout turns these chords into solids; the drawing reads the same points,
 * so the whip a pilot sees is the whip they hit.
 */
function featherMast(base, h, r, dx, dz) {
  const bendY = h * FLAG.bend;
  const R = h * (1 - FLAG.bend);
  const pts = [
    { p: [base[0], base[1], base[2]], r },
    { p: [base[0], base[1] + bendY, base[2]], r: r * FLAG.bendRadius },
  ];
  let reach = 0;
  for (let i = 1; i <= WHIP_SEGS; i += 1) {
    const t = i / WHIP_SEGS;
    sincos(t * FLAG.sweep, SC);
    reach = R * (1 - SC.c);
    pts.push({
      p: [base[0] + dx * reach, base[1] + bendY + R * SC.s, base[2] + dz * reach],
      r: r * (FLAG.bendRadius + (FLAG.tipRadius - FLAG.bendRadius) * t),
    });
  }
  return { pts, width: reach, foot: h * FLAG.foot, top: h };
}

/* The mast's solids: every chord a capsule at the thinner of its two
 * radii, so the capsule never stands proud of the taper. */
function mastParts(P, mast, kind) {
  const q = mast.pts;
  for (let i = 0; i + 1 < q.length; i += 1) {
    P.cap(i === 0 ? 'courseMast' : 'courseWhip', q[i].p, q[i + 1].p, Math.min(q[i].r, q[i + 1].r),
      { draw: false, name: i === 0 ? 'mast' : 'whip', kind });
  }
}

/* And its drawing: the pole tapering to the bend, the whip in dark
 * fibreglass, a ferrule where the two join. */
function mastDraw(K, mast) {
  const q = mast.pts;
  K.cyl('courseMast', q[0].p, q[1].p, q[0].r, 7, q[1].r);
  for (let i = 1; i + 1 < q.length; i += 1) {
    K.cyl('courseWhip', q[i].p, q[i + 1].p, q[i].r, 5, q[i + 1].r);
  }
  const b = q[1].p;
  K.cyl('courseFitting', [b[0], b[1] - 0.05, b[2]], [b[0], b[1] + 0.012, b[2]], q[1].r * 1.9, 7);
}

/*
 * A feather sail hanging off `mast`, in the vertical plane that holds the
 * mast. `plane` is 'x' for a sail lying in local x (it sweeps along +x) or
 * 'z' for one lying in local z (it sweeps along `dz`). Two printed planes
 * back to back, each with the print that reads right from its own side.
 */
function sailDraw(K, mast, plane, dz, accent) {
  const base = mast.pts[0].p;
  const w = mast.width;
  const h = mast.top - mast.foot;
  const yc = base[1] + mast.foot + h / 2;
  const off = 0.003;
  const v = accent === 'red' ? 2 : 0;
  if (plane === 'x') {
    const xc = base[0] + w / 2;
    K.sign('courseSail', xc, yc, base[2] + off, w, h, '+z', v);
    K.sign('courseSail', xc, yc, base[2] - off, w, h, '-z', v + 1);
    return;
  }
  /* A '+x' plane's texture runs toward -z and a '-x' plane's toward +z; the
   * face whose texture starts at the mast wears the front print. */
  const zc = base[2] + dz * w / 2;
  K.sign('courseSail', base[0] + off, yc, zc, w, h, '+x', dz < 0 ? v : v + 1);
  K.sign('courseSail', base[0] - off, yc, zc, w, h, '-x', dz < 0 ? v + 1 : v);
}

/*
 * A sandbag lying along local z at (x, y on the plate, z from z0 to z1):
 * drawn as a squashed capsule with a tied neck, solid as the round capsule
 * that fits inside the squash. Race gates are weighted exactly like this,
 * and the lumpy shape is what gives a clean tube frame something to stand
 * on in a drawing.
 */
const BAG_R = 0.095;
const BAG_SQUASH = 0.56;

function bagSolid(P, x, y, z0, z1, k) {
  const r = BAG_R * k;
  const rs = r * BAG_SQUASH * 0.96;
  const za = Math.min(z0, z1) + r;
  const zb = Math.max(z0, z1) - r;
  if (zb <= za) {
    return;
  }
  P.cap('courseBag', [x, y + rs, za], [x, y + rs, zb], rs, { draw: false, name: 'sandbag', kind: 'obstacle' });
}

function bagDraw(K, x, y, z0, z1, k, tie = 1) {
  const r = BAG_R * k;
  const za = Math.min(z0, z1) + r;
  const zb = Math.max(z0, z1) - r;
  if (zb <= za) {
    return;
  }
  const T = K.THREE;
  const g = new T.CapsuleGeometry(r, zb - za, 2, 8);
  const m = new T.Matrix4().makeRotationX(Math.PI / 2);
  m.premultiply(new T.Matrix4().makeScale(1, BAG_SQUASH, 1));
  m.premultiply(new T.Matrix4().makeTranslation(x, y + r * BAG_SQUASH, (za + zb) / 2));
  K.add('courseBag', g, m);
  /* The tied neck at the far end with the gathered cloth past it, and the
   * stitched seam down its back. */
  const cy = y + r * BAG_SQUASH;
  const zt = tie > 0 ? zb : za;
  K.cyl('courseBagTie', [x, cy, zt + tie * r * 0.78], [x, cy, zt + tie * r * 1.08], r * 0.26, 6);
  K.blob('courseBag', [x, cy, zt + tie * r * 1.3], r * 0.34, r * 0.3, [0.4, 0.7, 0.2]);
  K.box('courseBagTie', x - 0.006, y + r * BAG_SQUASH * 1.9, za, x + 0.006, y + r * BAG_SQUASH * 2.02, zb);
}

/* A moulded fitting at a joint: a coupler round the main tube and a stub
 * along the one that meets it. `stub` may be null for a plain coupler. */
function fittingDraw(K, c, main, stub) {
  const L = TR * 1.75;
  const r = TR * 1.3;
  K.cyl('courseFitting', [c[0] - main[0] * L, c[1] - main[1] * L, c[2] - main[2] * L],
    [c[0] + main[0] * L, c[1] + main[1] * L, c[2] + main[2] * L], r, 8);
  if (stub) {
    K.cyl('courseFitting', c, [c[0] + stub[0] * TR * 2.4, c[1] + stub[1] * TR * 2.4, c[2] + stub[2] * TR * 2.4], r, 8);
  }
}

/* ------------------------------------------------------------------ *
 * THE GATE FAMILY.
 *
 * A STANDING GATE is the race field's obstacle(): two uprights from the
 * ground to the top rail, a rail over every opening and under the lowest
 * one when it is off the ground, a printed sleeve outboard of each upright
 * from the lowest sill to the top of the top opening, and the printed
 * header SLEEVED OVER THE TOP RAIL, which is what a real header is: one
 * sheet round the rail, spanning sleeve to sleeve. Its lower edge is the
 * top opening's clear height exactly, so the dress never narrows a hole.
 *
 * A TILTED GATE is the race field's tiltedGate(): each level framed about
 * its own centre (apertureCenter in src/trackbuilder/model.js stacks the
 * centres straight up and tilts each opening about its own), the header
 * riding on the leaning frame in its plane, and posts to the ground. It
 * wears its sleeves too, in its own plane, so a dive gate seen from above
 * is the same printed arch as a standing gate seen from the front, laid
 * down; bare, it was four hairlines and a square at twenty metres. Four
 * posts rather than the race field's two, one under each corner, because a
 * 2.1 m frame held at 4.6 m by two tubes along one edge is a cantilever no
 * rigger would trust. Every post stands outboard of the opening's width,
 * so none of them is ever in the hole.
 *
 * THE FRAME IS RED. On the race field it is alloy, because a dark bar
 * between two pale banners read as a hole in the structure. Here that is
 * the point: the tube is the opening's own edge, and a red edge between
 * white vinyl and the hole is what a pilot aims at. It is the town's red,
 * and a red frame under a white lintel is a shape anybody who has walked
 * a Japanese street has seen before.
 * ------------------------------------------------------------------ */

/* The accent strip bound along the vinyl's edge at the opening, and the
 * drone badge in the header's clear ends, both a hair proud of the print. */
const EDGE_W = 0.045;
const PROUD = 0.004;

function gateGeom(el) {
  const pitch = el.pitch || 0;
  const standing = Math.abs(pitch) < 1e-3;
  /* A standing gate is exactly upright, whatever sliver of pitch it
   * carries, so its uprights, rails and sleeves agree to the bit. */
  const p = { s: 0, c: 1 };
  if (!standing) {
    sincos(pitch, SC);
    p.s = SC.s;
    p.c = SC.c;
  }
  const levels = apertureLevels(el.dims);
  const lv0 = levels[0];
  const top = levels[levels.length - 1];
  const k = Math.min(1, lv0.clearW / MULTIGP_W);
  const hw = lv0.clearW / 2 + TR;
  const sw = 0.42 * k;
  const bh = GATE_BANNER_H * k;
  const bw = Math.max(0.9 * k, 2 * (hw + TR + sw));
  /* The header's extent in the top opening's own plane. */
  const bLo = top.clearH / 2;
  const bHi = bLo + bh;
  const g = { p, standing, levels, lv0, top, k, hw, sw, bh, bw, bLo, bHi, sleeves: [] };
  if (standing) {
    const ys = [];
    for (const lv of levels) {
      if (lv.sillH > TUBE) {
        ys.push(lv.sillH - TR);
      }
      ys.push(lv.sillH + lv.clearH + TR);
    }
    ys.sort((q, r) => q - r);
    g.bars = ys.filter((y, i) => i === 0 || y - ys[i - 1] > 0.004);
    g.upTop = g.bars[g.bars.length - 1] + TR;
    /* One sleeve a side, the whole height of the openings, clear of the
     * ground by the width of a hand. */
    const y0 = Math.max(lv0.sillH, 0.06);
    const y1 = top.sillH + top.clearH;
    if (y1 - y0 > 0.1) {
      g.sleeves.push({ cy: 0, b0: y0, b1: y1 });
    }
  } else {
    /* Every level's four corners, and a post under each that stands clear
     * of the ground. A post shared by two levels of a stack is kept once,
     * at the taller of the two. */
    const posts = new Map();
    for (const lv of levels) {
      const hh = lv.clearH / 2 + TR;
      for (const sa of [-1, 1]) {
        for (const sb of [-1, 1]) {
          const c = inPlane(p, sa * (lv.clearW / 2 + POST_R), sb * hh, lv.centerH);
          if (c[1] <= 0.05) {
            continue;
          }
          const key = `${Math.round(c[0] * 1000)}:${Math.round(c[2] * 1000)}`;
          const had = posts.get(key);
          if (!had || had[1] < c[1]) {
            posts.set(key, c);
          }
        }
      }
      /* This level's sleeves, trimmed where the plane dips to the ground. */
      let b0 = -lv.clearH / 2;
      const b1 = lv.clearH / 2;
      if (p.c > 1e-6 && lv.centerH + p.c * b0 < 0.06) {
        b0 = (0.06 - lv.centerH) / p.c;
      }
      if (b1 - b0 > 0.1) {
        g.sleeves.push({ cy: lv.centerH, b0, b1 });
      }
    }
    g.posts = [...posts.values()];
    /*
     * Rungs between the two posts on each side, which is what turns four
     * stilts into a scaffold tower a rigger would stand a gate on, and gives
     * the ink something to draw at the height a pilot passes. Along the
     * gate's normal, so the way through under the gate stays open, and at
     * least 1.7 m apart and off the ground, so every slot they make is well
     * over the gap rule's 1.4 m.
     */
    g.rungs = [];
    g.skirts = [];
    const bySide = new Map();
    for (const c of g.posts) {
      const key = Math.round(c[2] * 1000);
      bySide.set(key, [...(bySide.get(key) ?? []), c]);
    }
    for (const pair of bySide.values()) {
      if (pair.length !== 2) {
        continue;
      }
      const hMin = Math.min(pair[0][1], pair[1][1]);
      /*
       * A printed skirt across the top of each side, where the frame lies
       * near level: the header's own print, hung on the outside of the
       * posts just under the frame, so a dive gate seen from the side is a
       * white banner on a tower and not four hairlines. Its top is a
       * centimetre under the frame's own dress, which closes the slot.
       */
      let hRung = hMin;
      if (Math.abs(pair[0][1] - pair[1][1]) < 0.3 && hMin > bh + 1.8) {
        const side = Math.sign(pair[0][2]) || 1;
        const top = hMin - PANEL_T / 2 - 0.01;
        g.skirts.push({
          x0: Math.min(pair[0][0], pair[1][0]) - POST_R,
          x1: Math.max(pair[0][0], pair[1][0]) + POST_R,
          z: pair[0][2] + side * (POST_R + PANEL_T / 2 + 0.002),
          y0: top - bh,
          y1: top,
        });
        hRung = top - bh;
      }
      const nR = Math.max(0, Math.floor(hRung / 1.7) - 1);
      for (let i = 1; i <= nR; i += 1) {
        const y = (hRung * i) / (nR + 1);
        g.rungs.push([[pair[0][0], y, pair[0][2]], [pair[1][0], y, pair[1][2]]]);
      }
    }
  }
  return g;
}

export function gateLayout(el) {
  const P = new Parts();
  if (isUnbuilt(el)) {
    return P.list;
  }
  const g = gateGeom(el);
  const { p, levels, k, hw, sw, bw, bLo, bHi, top } = g;
  if (g.standing) {
    /* Uprights to the top of the top rail. The capsule's upper cap ends
     * there too; the lower cap is under the ground. */
    for (const z of [-hw, hw]) {
      P.cap('courseFrame', [0, 0, z], [0, g.upTop - TR, z], TR, { name: 'upright', kind: 'gate', seg: 8 });
    }
    for (const y of g.bars) {
      P.cap('courseFrame', [0, y, -hw], [0, y, hw], TR, { name: 'bar', kind: 'gate', seg: 8 });
    }
    /* Sandbags on each foot plate, fore and aft of the sleeve. */
    for (const s of [-1, 1]) {
      for (const x of [-0.19 * k, 0.19 * k]) {
        bagSolid(P, x, FOOT_T, s * (hw + 0.02), s * (hw + TR + sw + 0.01), k);
      }
    }
  } else {
    for (const lv of levels) {
      const hh = lv.clearH / 2 + TR;
      const at = (a, b) => inPlane(p, a, b, lv.centerH, [0, 0, 0]);
      P.cap('courseFrame', at(-hw, -hh), at(-hw, hh), TR, { name: 'upright', kind: 'gate', seg: 8 });
      P.cap('courseFrame', at(hw, -hh), at(hw, hh), TR, { name: 'upright', kind: 'gate', seg: 8 });
      P.cap('courseFrame', at(-hw, -hh), at(hw, -hh), TR, { name: 'bar', kind: 'gate', seg: 8 });
      P.cap('courseFrame', at(-hw, hh), at(hw, hh), TR, { name: 'bar', kind: 'gate', seg: 8 });
    }
    for (const [a, b] of g.rungs) {
      P.cap('courseFrame', a, b, TR, { name: 'rung', kind: 'gate', seg: 8 });
    }
    for (const sk of g.skirts) {
      for (const y of spread(sk.y0 + PANEL_R, sk.y1 - PANEL_R, PANEL_STEP)) {
        P.cap('courseFrame', [sk.x0 + PANEL_R, y, sk.z], [sk.x1 - PANEL_R, y, sk.z], PANEL_R,
          { draw: false, name: 'skirt', kind: 'obstacle' });
      }
    }
    for (const c of g.posts) {
      P.cap('courseFrame', [c[0], 0, c[2]], [c[0], c[1], c[2]], POST_R, { name: 'leg', kind: 'gate', seg: 8 });
      for (const dx of [-0.14 * k, 0.14 * k]) {
        bagSolid(P, c[0] + dx, FOOT_T, c[2] - 0.2 * k, c[2] + 0.2 * k, k);
      }
    }
  }
  /* The sleeves, solid as columns up them inside their thickness. */
  for (const sl of g.sleeves) {
    for (const s of [-1, 1]) {
      for (const a of spread(hw + TR + PANEL_R, hw + TR + sw - PANEL_R, PANEL_STEP)) {
        P.cap('courseFrame', inPlane(p, s * a, sl.b0 + PANEL_R, sl.cy), inPlane(p, s * a, sl.b1 - PANEL_R, sl.cy),
          PANEL_R, { draw: false, name: 'sleeve', kind: 'obstacle' });
      }
    }
  }
  /* The header board, solid as rows along it inside its thickness. */
  for (const b of spread(bLo + PANEL_R, bHi - PANEL_R, PANEL_STEP)) {
    P.cap('courseFrame', inPlane(p, -(bw / 2 - PANEL_R), b, top.centerH), inPlane(p, bw / 2 - PANEL_R, b, top.centerH),
      PANEL_R, { draw: false, name: 'header', kind: 'obstacle' });
  }
  /* Feather pennants on the header, where the type has them. */
  for (const f of pennants(el, g)) {
    mastParts(P, f.mast, 'obstacle');
  }
  return P.list;
}

/* The pennants a flagged gate carries: each mast stands upright on the
 * header's top edge, outboard at the ends or over the middle, its whip and
 * sail leaning outboard (to the right from the middle), in the gate's plane
 * so the cloth never hangs across the opening. */
function pennants(el, g) {
  const side = flagSideOf(el);
  if (!side) {
    return [];
  }
  const fh = gateFlagHeight(el.dims);
  const out = [];
  for (const sign of flagSideSigns(side)) {
    const a = sign * (g.bw / 2 - 0.04);
    const base = inPlane(g.p, a, g.bHi, g.top.centerH);
    /* Outboard along +w is along -z. */
    const dz = -flagLeanSign(sign);
    out.push({ mast: featherMast(base, fh, GATE_FLAG_POLE_R, 0, dz), dz });
  }
  return out;
}

/* A thin box on an arbitrary basis: `across` and `up` span its face, `n`
 * is its thickness. For strips and badges that ride on a tilted frame. */
function slab(K, mat, c, n, across, up, w, h, t) {
  const T = K.THREE;
  const m = new T.Matrix4().makeBasis(
    new T.Vector3(across[0], across[1], across[2]),
    new T.Vector3(up[0], up[1], up[2]),
    new T.Vector3(n[0], n[1], n[2]),
  );
  m.setPosition(c[0], c[1], c[2]);
  K.add(mat, new T.BoxGeometry(w, h, t), m);
}

/*
 * THE BADGE in each clear end of the header, where the race field puts the
 * gate's number. A freestyle gate has no number, so it carries a mark: a
 * quad seen from above, four rotor rings on an X, white on a navy disc in a
 * red ring, on both faces. It is the one silhouette every pilot reads as
 * their own sport, and it belongs to nobody. Geometry rather than print, so
 * it is crisp at half a metre and costs no texture per gate.
 */
function badgeDraw(K, c, n, across, up, R, thick) {
  const T = K.THREE;
  const basis = new T.Matrix4().makeBasis(
    new T.Vector3(across[0], across[1], across[2]),
    new T.Vector3(up[0], up[1], up[2]),
    new T.Vector3(n[0], n[1], n[2]),
  );
  const at = (dz, turn) => {
    const m = basis.clone();
    m.setPosition(c[0] + n[0] * dz, c[1] + n[1] * dz, c[2] + n[2] * dz);
    if (turn) {
      m.multiply(new T.Matrix4().makeRotationY(Math.PI));
    }
    return m;
  };
  /* The ring and the disc: cylinders along the board's normal. */
  const ring = new T.CylinderGeometry(R * 1.16, R * 1.16, thick + PROUD * 1.5, 16, 1);
  ring.rotateX(Math.PI / 2);
  K.add('coursePoleRed', ring, at(0, false));
  const disc = new T.CylinderGeometry(R, R, thick + PROUD * 3, 16, 1);
  disc.rotateX(Math.PI / 2);
  K.add('courseBarrierNavy', disc, at(0, false));
  /* The quad, painted on each face: an X of arms, a rotor ring at each
   * end, a body plate in the middle. */
  const face = (thick + PROUD * 3) / 2 + 0.0015;
  const arm = R * 0.5;
  for (const back of [false, true]) {
    const m = at(back ? -face : face, back);
    for (const turn of [Math.PI / 4, -Math.PI / 4]) {
      const g = new T.PlaneGeometry(arm * 2 * 1.414, R * 0.1);
      g.rotateZ(turn);
      K.add('coursePaint', g, m);
    }
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        const g = new T.RingGeometry(R * 0.2, R * 0.29, 9, 1);
        g.translate(sx * arm, sy * arm, 0);
        K.add('coursePaint', g, m);
      }
    }
    const body = new T.PlaneGeometry(R * 0.26, R * 0.4);
    K.add('coursePaint', body, m);
  }
}

export function gateDraw(el, parts, K) {
  if (isUnbuilt(el)) {
    return;
  }
  const g = gateGeom(el);
  const { p, levels, k, hw, sw, bw, bh, bLo, top } = g;
  const n = [p.c, p.s, 0];
  const u = [-p.s, p.c, 0];
  const across = [0, 0, -1];
  const face = PANEL_T / 2 + PROUD / 2;
  const onFace = (q, side) => [q[0] + n[0] * face * side, q[1] + n[1] * face * side, q[2] + n[2] * face * side];
  /* The header, printed both faces, sleeved over the top rail, with a red
   * edge along its lower hem where it meets the opening. */
  K.panel('gateHeader', inPlane(p, 0, bLo + bh / 2, top.centerH), n, across, bw, bh, PANEL_T);
  const hem = inPlane(p, 0, bLo + EDGE_W * k / 2, top.centerH);
  for (const side of [-1, 1]) {
    slab(K, 'coursePoleRed', onFace(hem, side), n, across, u, bw, EDGE_W * k, PROUD);
  }
  /* The badges, in the clear zone at each end of the print. */
  const zone = 0.22;
  for (const s of [-1, 1]) {
    const c = inPlane(p, s * bw * (0.5 - zone / 2), bLo + bh * 0.52, top.centerH);
    badgeDraw(K, c, n, across, u, Math.min(bh * 0.34, bw * zone * 0.4), PANEL_T);
  }
  /* The sleeves. The far one is laid upside down so its chequer column
   * runs down the OUTSIDE edge like the near one's, which is what the race
   * field's mirrored print does; the mark on a sleeve is a flag on a staff
   * and reads either way up. Each carries a red edge down the side that
   * faces the opening. */
  for (const sl of g.sleeves) {
    const bm = (sl.b0 + sl.b1) / 2;
    const len = sl.b1 - sl.b0;
    for (const s of [-1, 1]) {
      K.panel('gateSleeve', inPlane(p, s * (hw + TR + sw / 2), bm, sl.cy), n, [0, 0, -s], sw, len, PANEL_T);
      const edge = inPlane(p, s * (hw + TR + EDGE_W * k / 2), bm, sl.cy);
      for (const side of [-1, 1]) {
        slab(K, 'coursePoleRed', onFace(edge, side), n, across, u, EDGE_W * k, len, PROUD);
      }
      /* Cable ties round the tube and the sleeve's hem, tight. */
      const nTie = Math.max(2, Math.round(len / 0.75) + 1);
      for (const b of spread(sl.b0 + 0.12, sl.b1 - 0.12, (len - 0.24) / Math.max(1, nTie - 1))) {
        /* Flush with the tube's inner face, so not even a tie narrows the
         * opening. */
        const tw = TUBE + 0.025 * k;
        slab(K, 'courseStrap', inPlane(p, s * (hw - TR + tw / 2), b, sl.cy), n, across, u, tw, 0.022, PANEL_T + 0.008);
      }
    }
  }
  if (g.standing) {
    /* Fittings wherever a rail meets an upright: a tee on a middle rail,
     * an elbow at the top, where the header hides most of it. */
    for (const y of g.bars) {
      for (const s of [-1, 1]) {
        fittingDraw(K, [0, y, s * hw], [0, 1, 0], [0, 0, -s]);
      }
    }
    /* Foot plates, under the upright and its sleeve, with the bags on. */
    for (const s of [-1, 1]) {
      const zi = s * (hw - 0.12 * k);
      const zo = s * (hw + TR + sw + 0.05 * k);
      K.box('courseFoot', -0.31 * k, 0, Math.min(zi, zo), 0.31 * k, FOOT_T, Math.max(zi, zo));
      for (const x of [-0.19 * k, 0.19 * k]) {
        bagDraw(K, x, FOOT_T, s * (hw + 0.02), s * (hw + TR + sw + 0.01), k, s);
      }
    }
  } else {
    for (const lv of levels) {
      const hh = lv.clearH / 2 + TR;
      for (const sa of [-1, 1]) {
        for (const sb of [-1, 1]) {
          const c = inPlane(p, sa * hw, sb * hh, lv.centerH);
          fittingDraw(K, c, u, [0, 0, sa]);
        }
      }
    }
    for (const sk of g.skirts) {
      const side = Math.sign(sk.z) || 1;
      /* Printed outward; the panel's up is its normal crossed with across. */
      K.panel('gateHeader', [(sk.x0 + sk.x1) / 2, (sk.y0 + sk.y1) / 2, sk.z], [0, 0, side], [side, 0, 0],
        sk.x1 - sk.x0, sk.y1 - sk.y0, PANEL_T);
      const hemAt = [(sk.x0 + sk.x1) / 2, sk.y0 + EDGE_W * k / 2, sk.z];
      for (const f of [-1, 1]) {
        slab(K, 'coursePoleRed', [hemAt[0], hemAt[1], hemAt[2] + f * (PANEL_T / 2 + PROUD / 2)], [0, 0, 1], [1, 0, 0], [0, 1, 0],
          sk.x1 - sk.x0, EDGE_W * k, PROUD);
      }
    }
    for (const [a, b] of g.rungs) {
      for (const q of [a, b]) {
        K.cyl('courseFitting', [q[0], q[1] - 0.045, q[2]], [q[0], q[1] + 0.045, q[2]], POST_R * 1.3, 8);
      }
    }
    for (const c of g.posts) {
      /* A collar where the post takes the frame, and a plate with its bags. */
      K.cyl('courseFitting', [c[0], c[1] - 0.09, c[2]], [c[0], c[1] + POST_R + 0.004, c[2]], POST_R * 1.35, 8);
      K.box('courseFoot', c[0] - 0.25 * k, 0, c[2] - 0.25 * k, c[0] + 0.25 * k, FOOT_T, c[2] + 0.25 * k);
      K.cyl('courseFitting', [c[0], FOOT_T, c[2]], [c[0], FOOT_T + 0.12, c[2]], POST_R * 1.35, 8);
      for (const dx of [-0.14 * k, 0.14 * k]) {
        bagDraw(K, c[0] + dx, FOOT_T, c[2] - 0.2 * k, c[2] + 0.2 * k, k);
      }
    }
  }
  /* Pennants: the mast, its whip, and the sail, alternating navy and red
   * when there are two. */
  pennants(el, g).forEach((f, i) => {
    mastDraw(K, f.mast);
    sailDraw(K, f.mast, 'z', f.dz, i % 2 === 0 ? 'navy' : 'red');
  });
}

/* ------------------------------------------------------------------ *
 * MARKERS AND OBSTACLES, sized the way src/render/scene.js sizes them.
 * ------------------------------------------------------------------ */

/*
 * THE FLAG: the race field's feather flag, not a teardrop on a stick. A
 * straight alloy pole to four fifths of its height, a dark fibreglass whip
 * sweeping forward a hundred degrees so the apex is the stated height, a
 * tall narrow sail hanging from the whip, and a cross foot on the ground.
 * The sail sweeps along the element's heading. Solid on the pole and the
 * whip, chord for chord what is drawn; the cloth is cloth.
 */
function flagMastOf(el) {
  const h = Math.max(0.5, el.dims.height ?? 2.5);
  const r = Math.max(0.012, el.dims.poleRadius ?? 0.025);
  return featherMast([0, 0, 0], h, r, 1, 0);
}

export function flagLayout(el) {
  const P = new Parts();
  mastParts(P, flagMastOf(el), 'obstacle');
  return P.list;
}

export function flagDraw(el, parts, K) {
  const mast = flagMastOf(el);
  const r = mast.pts[0].r;
  mastDraw(K, mast);
  /* Navy or red, from the flag's own identity, so a line of them
   * alternates the way the race field's do and never reshuffles. */
  sailDraw(K, mast, 'x', 0, hashString(el.id) % 2 === 0 ? 'navy' : 'red');
  /* The cross foot: two flat legs and a socket, a few centimetres high. */
  const L = 0.3;
  K.box('courseFoot', -L, 0, -0.022, L, 0.03, 0.022);
  K.box('courseFoot', -0.022, 0, -L, 0.022, 0.03, L);
  K.cyl('courseFitting', [0, 0, 0], [0, 0.16, 0], r * 1.9, 8);
}

/*
 * THE CONE: a 28 inch highway cone on its square rubber base, with the two
 * reflective collars a real one wears. Solid as a stack of capsules that
 * follow the taper, each inside the cone at its own height: one post the
 * width of the middle stood a tenth of a metre proud of the drawn cone
 * round its whole top third.
 */
function coneShape(el) {
  const h = Math.max(0.1, el.dims.height ?? 0.7);
  const R = Math.max(0.03, el.dims.baseRadius ?? 0.18);
  const base = Math.min(0.035, h * 0.05);
  return { h, R, base, rb: R * 0.76, rt: R * 0.15 };
}

function coneRadiusAt(c, y) {
  const t = clamp((y - c.base) / (c.h - c.base), 0, 1);
  return c.rb + (c.rt - c.rb) * t;
}

export function coneLayout(el) {
  const c = coneShape(el);
  const P = new Parts();
  const n = 3;
  for (let i = 0; i < n; i += 1) {
    const ya = c.base + ((c.h - c.base) * i) / n;
    const yb = c.base + ((c.h - c.base) * (i + 1)) / n;
    const r = coneRadiusAt(c, yb) * 0.97;
    /* The top cap ends at the cone's own tip height, never above it. */
    const top = Math.max(ya, Math.min(yb, c.h - r));
    P.cap('courseCone', [0, i === 0 ? 0 : ya, 0], [0, top, 0], r, { draw: false, name: 'cone', kind: 'obstacle' });
  }
  return P.list;
}

export function coneDraw(el, parts, K) {
  const c = coneShape(el);
  const seg = 14;
  /* The square rubber base, with a raised collar the body sits in. */
  const R = c.R;
  K.box('courseConeBase', -R, 0, -R, R, c.base, R);
  K.cyl('courseConeBase', [0, c.base, 0], [0, c.base + 0.02, 0], c.rb * 1.08, seg, c.rb * 1.02);
  K.cyl('courseCone', [0, c.base, 0], [0, c.h, 0], c.rb, seg, c.rt);
  /* A rolled lip at the top, the opening a real cone has. */
  K.cyl('courseCone', [0, c.h - 0.012, 0], [0, c.h, 0], c.rt * 1.18, seg, c.rt * 1.05);
  /* The collars: a wide one high, a narrow one under it. */
  const band = (y0, y1) => {
    const a = c.base + (c.h - c.base) * y0;
    const b = c.base + (c.h - c.base) * y1;
    K.cyl('courseReflect', [0, a, 0], [0, b, 0], coneRadiusAt(c, a) * 1.035, seg, coneRadiusAt(c, b) * 1.035);
  };
  band(0.60, 0.80);
  band(0.38, 0.49);
}

/*
 * THE POLE: RaceGOW's upright, a red pipe flown round. Red with white
 * bands, as a slalom pole is, because a plain red line is a hairline at
 * thirty metres and a banded one is a rhythm the eye finds; a rounded cap,
 * and a weighted rubber base. The catalogue draws no paint for a pole, so
 * the dress is here, as parts that are drawn and not solid.
 */
export function poleMarkerLayout(el) {
  const h = Math.max(0.1, el.dims.height ?? 1.5);
  const r = Math.max(0.004, el.dims.poleRadius ?? 0.02);
  const P = new Parts();
  /* The pipe, and its rounded cap drawn as the solid capsule's own end: a
   * ball at the top of the axis, drawn and not solid, since the capsule
   * already is. */
  const top = Math.max(0, h - r);
  P.post('coursePoleRed', 0, 0, 0, top, r, { name: 'pole', kind: 'pole', seg: 10 });
  P.cap('coursePoleRed', [0, top, 0], [0, top, 0], r, { solid: false, look: 'capsule', name: 'cap' });
  const bands = Math.max(1, Math.floor(h / 0.5));
  for (let i = 0; i < bands; i += 1) {
    const y = (i + 0.5) * (h / bands);
    P.post('coursePoleWhite', 0, 0, y - 0.11, y + 0.11, r * 1.12, { solid: false, name: 'band', seg: 10 });
  }
  /* The weighted base: a rubber disc and a collar, a few centimetres high. */
  const br = Math.max(r * 4.5, 0.06);
  P.post('courseConeBase', 0, 0, 0, Math.min(0.045, h * 0.1), br, { solid: false, name: 'base', seg: 12 });
  P.post('courseFitting', 0, 0, 0, Math.min(0.12, h * 0.2), r * 1.6, { solid: false, name: 'collar', seg: 10 });
  return P.list;
}

/*
 * THE BARRIER: an inflatable air barrier, the kind a race lines its field
 * with. Its round top and round ends are not a style choice, they are what
 * the physics can hold at any heading: a turning asset is capsules, and a
 * stack of capsules along the barrier IS a slab with a round top and round
 * ends. So the drawing is exactly that union (a flat printed slab, a round
 * top, round ends, domed corners) and the rows sit inside it, spaced so the
 * scallop between two rows is under three centimetres anywhere on the face.
 */
function barrierShape(el) {
  const w = Math.max(0.2, el.dims.width);
  const d = Math.max(0.05, el.dims.depth);
  const h = Math.max(0.05, el.dims.height);
  /* L is the long half extent, S the short one; swap puts the long axis on
   * local z when the barrier is deeper than it is wide. */
  const swap = d > w;
  const L = Math.max(w, d) / 2;
  const S = Math.min(w, d) / 2;
  const r = Math.min(S, h / 2);
  const tol = Math.min(0.03, r * 0.5);
  const step = 2 * Math.sqrt(Math.max(1e-6, r * r - (r - tol) * (r - tol)));
  const yLo = Math.min(h - r, Math.sqrt(Math.max(0, 2 * r * tol - tol * tol)));
  return { w, d, h, swap, L, S, r, step, yLo };
}

export function barrierLayout(el) {
  const b = barrierShape(el);
  const P = new Parts();
  const map = (l, y, s) => (b.swap ? [s, y, l] : [l, y, s]);
  const ys = spread(b.yLo, b.h - b.r, b.step);
  /* A barrier so thin and tall that the rows would run into dozens keeps
   * two dozen: the slots between them are still a few centimetres, far
   * under a craft's hull. */
  const rows = ys.length > 24 ? spread(b.yLo, b.h - b.r, (b.h - b.r - b.yLo) / 23) : ys;
  const ss = spread(-(b.S - b.r), b.S - b.r, b.step);
  for (const y of rows) {
    for (const s of ss) {
      P.cap('courseBarrierNavy', map(-(b.L - b.r), y, s), map(b.L - b.r, y, s), b.r * 0.995,
        { draw: false, name: 'barrier', kind: 'wall' });
    }
  }
  return P.list;
}

export function barrierDraw(el, parts, K) {
  const b = barrierShape(el);
  const T = K.THREE;
  const mat = 'courseBarrierNavy';
  const { L, S, r, h } = b;
  const map = (l, y, s) => (b.swap ? [s, y, l] : [l, y, s]);
  const box = (l0, y0, s0, l1, y1, s1, m = mat) => {
    const a = map(l0, y0, s0);
    const c = map(l1, y1, s1);
    K.box(m, a[0], a[1], a[2], c[0], c[1], c[2]);
  };
  const Li = L - r;
  const Si = S - r;
  const H = h - r;
  const seg = r > 0.25 ? 22 : 14;
  /* The printed faces: the slab between the round ends, under the round
   * top. The kit's printed panel draws the slab and prints both faces. */
  if (Li > 0.02 && H > 0.02) {
    const c = map(0, H / 2, 0);
    /* Across runs toward -z when the long axis is z, so the print's up is
     * still up (the panel's up is its normal crossed with across). */
    K.panel('barrierVinyl', c, map(0, 0, 1), b.swap ? [0, 0, -1] : [1, 0, 0], 2 * Li, H, 2 * S);
  }
  if (Si > 0.005) {
    box(-L, 0, -Si, L, H, Si);
    box(-Li, H, -Si, Li, h, Si);
  }
  for (const ls of [-1, 1]) {
    for (const ss of Si > 0.005 ? [-1, 1] : [0]) {
      K.cyl(mat, map(ls * Li, 0, ss * Si), map(ls * Li, H, ss * Si), r, seg);
      /* A domed corner: the top half of a sphere is all that shows. */
      const dome = new T.SphereGeometry(r, seg, Math.max(4, Math.round(seg / 3)), 0, Math.PI * 2, 0, Math.PI / 2);
      const at = map(ls * Li, H, ss * Si);
      K.add(mat, dome, new T.Matrix4().makeTranslation(at[0], at[1], at[2]));
    }
  }
  /* The round top along the long axis, and across it when the slab is
   * deeper than the rounding. */
  for (const ss of Si > 0.005 ? [-1, 1] : [0]) {
    K.cyl(mat, map(-Li, H, ss * Si), map(Li, H, ss * Si), r, seg);
  }
  if (Si > 0.005) {
    for (const ls of [-1, 1]) {
      K.cyl(mat, map(ls * Li, H, -Si), map(ls * Li, H, Si), r, seg);
    }
  }
  /* The baffle seams an inflatable is welded along, over the top and down
   * both faces about every metre: the thing that says air and not foam,
   * and a line for the ink across an otherwise plain skin. */
  if (Si <= 0.005 && Li > 0.3) {
    const nSeam = Math.max(1, Math.round((2 * Li) / 1.1) - 1);
    for (let i = 1; i <= nSeam; i += 1) {
      const l = -Li + (2 * Li * i) / (nSeam + 1);
      const arc = new T.TorusGeometry(r + 0.003, 0.012, 4, seg, Math.PI);
      /* The torus lies in its own xy plane; turned a quarter about y it
       * arches over the top from one face to the other, and when the long
       * axis is z the arch is already across it. */
      if (!b.swap) {
        arc.rotateY(Math.PI / 2);
      }
      const at = map(l, H, 0);
      K.add('courseBagTie', arc, new T.Matrix4().makeTranslation(at[0], at[1], at[2]));
      for (const ss of [-1, 1]) {
        box(l - 0.012, 0, ss * (S + 0.001), l + 0.012, H, ss * (S + 0.006), 'courseBagTie');
      }
    }
  }
  /* A guy rope from each end to a stake, the way an air barrier is held
   * down: thin, so it is dress and not a solid. */
  for (const ls of [-1, 1]) {
    const from = map(ls * (L - r * 0.25), h * 0.62, 0);
    const to = map(ls * (L + Math.min(0.7, h * 0.4)), 0.02, 0);
    K.cyl('courseBagTie', from, to, 0.006, 4);
    K.cyl('courseFitting', [to[0], 0, to[2]], [to[0], 0.07, to[2]], 0.012, 5);
  }
}

/*
 * THE HORIZONTAL POLE: a bar across, along the element's heading, at its
 * base height, carried on two legs, flown over or under. Red and white
 * bands, as a high jump bar or a crossing arm is, so its height reads from
 * across a field. The bar's rounded ends are drawn, so the solid's caps are
 * inside the document's width. The catalogue draws no paint for this one
 * either, so its dress is parts that are drawn and not solid.
 */
export function hpoleLayout(el) {
  const w = Math.max(0.2, el.dims.width);
  const t = Math.max(0.02, Math.min(el.dims.depth, el.dims.height));
  const rb = t / 2;
  const P = new Parts();
  /* The bar is at the element's own base height, which the map already
   * lifts the whole element to; so in the local frame it is at the bottom,
   * and the legs reach DOWN to the ground. The map passes the lift. */
  const lift = el.position?.z ?? 1.6;
  const half = Math.max(0, w / 2 - rb);
  P.cap('coursePoleWhite', [-half, 0, 0], [half, 0, 0], rb, { name: 'bar', kind: 'pole', seg: 12 });
  /* The rounded ends, red, drawn as the capsule's own caps. */
  for (const x of [-half, half]) {
    P.cap('coursePoleRed', [x, 0, 0], [x, 0, 0], rb, { solid: false, look: 'capsule', name: 'end' });
  }
  /* The red bands, a hair proud of the bar. */
  /* An odd count, so both ends of the bar are red. */
  const nb = Math.max(1, 2 * Math.round((w / 0.45 - 1) / 2) + 1);
  const bl = w / nb;
  for (let i = 0; i < nb; i += 2) {
    const x0 = -w / 2 + i * bl + (i === 0 ? rb : 0);
    const x1 = Math.min(w / 2 - rb, -w / 2 + (i + 1) * bl);
    if (x1 - x0 > 0.02) {
      P.cap('coursePoleRed', [x0, 0, 0], [x1, 0, 0], rb * 1.06, { solid: false, name: 'band', seg: 12 });
    }
  }
  const legR = Math.max(0.012, Math.min(0.02, rb * 0.5));
  const lx = Math.max(0, w / 2 - Math.min(0.14, w * 0.1));
  if (lift > rb + 0.05) {
    for (const s of [-1, 1]) {
      P.cap('courseTube', [s * lx, -lift, 0], [s * lx, -rb, 0], legR, { name: 'leg', kind: 'gate', seg: 8 });
      /* A cradle under the bar and a T foot on the ground: drawn only, a
       * few centimetres each. */
      P.post('courseFitting', s * lx, 0, -rb - 0.07, -rb * 0.4, legR * 1.6, { solid: false, name: 'cradle', seg: 8 });
      P.box('courseFoot', s * lx - 0.035, -lift, -0.26, s * lx + 0.035, -lift + 0.035, 0.26, { solid: false, name: 'foot' });
      P.post('courseFitting', s * lx, 0, -lift, -lift + 0.1, legR * 1.6, { solid: false, name: 'socket', seg: 8 });
    }
  }
  return P.list;
}

/*
 * THE START PADS: a row of launch mats across the heading, which is the
 * way the craft faces. Drawn and NOT solid: the spawn can face any way, a
 * mat is a box, and a box cannot turn, so a mat three centimetres thick is
 * paint on the ground and the craft sits on the ground through it. Each mat
 * is a pilot's colour with its number and a chevron along the heading, and
 * a chequered start line runs across the row in front of them.
 */
export function padsLayout(el) {
  const n = clamp(Math.round(el.dims.pads ?? 1), 1, 12);
  const spacing = Math.max(0.3, el.dims.spacing ?? 1.5);
  const size = Math.max(0.1, el.dims.padSize ?? 0.6);
  const P = new Parts();
  for (let i = 0; i < n; i += 1) {
    const z = (i - (n - 1) / 2) * spacing;
    P.box(PAD_COLOURS[i % PAD_COLOURS.length], -size / 2, 0, z - size / 2, size / 2, 0.02, z + size / 2,
      { name: 'pad', solid: false });
  }
  return P.list;
}

export function padsDraw(el, parts, K) {
  const T = K.THREE;
  let zMin = Infinity;
  let zMax = -Infinity;
  let size = 0.6;
  parts.forEach((p, i) => {
    const [ax, , az] = p.lo;
    const [bx, by, bz] = p.hi;
    size = bx - ax;
    zMin = Math.min(zMin, az);
    zMax = Math.max(zMax, bz);
    const e = Math.max(0.012, size * 0.035);
    /* A dark bound edge, a few millimetres proud, so the mat has an edge
     * for the ink and a hem for the eye. */
    K.box('coursePadEdge', ax, 0, az, bx, by + 0.004, az + e);
    K.box('coursePadEdge', ax, 0, bz - e, bx, by + 0.004, bz);
    K.box('coursePadEdge', ax, 0, az + e, ax + e, by + 0.004, bz - e);
    K.box('coursePadEdge', bx - e, 0, az + e, bx, by + 0.004, bz - e);
    /* The heading chevron, painted toward the front of the mat. */
    const zc = (az + bz) / 2;
    const s = size;
    const shape = new T.Shape();
    shape.moveTo(0.34 * s, 0);
    shape.lineTo(0.08 * s, 0.24 * s);
    shape.lineTo(-0.04 * s, 0.24 * s);
    shape.lineTo(0.2 * s, 0);
    shape.lineTo(-0.04 * s, -0.24 * s);
    shape.lineTo(0.08 * s, -0.24 * s);
    shape.closePath();
    const chev = new T.ShapeGeometry(shape);
    /* The shape is drawn in (x, y); a quarter turn back about x lays it
     * flat facing up, and it is symmetric across, so y landing on -z does
     * not matter. */
    const m = new T.Matrix4().makeRotationX(-Math.PI / 2);
    m.premultiply(new T.Matrix4().makeTranslation(ax + s / 2, by + 0.003, zc));
    K.add('coursePaint', chev, m);
    /* The number, at the back of the mat. */
    K.sign('courseGridNo', ax + s * 0.26, by + 0.003, zc, s * 0.4, s * 0.4, '+y', i);
  });
  if (!Number.isFinite(zMin)) {
    return;
  }
  /* The start line: a chequer two cells deep across the whole row, in
   * front of the mats, painted a hair above the ground. */
  const cell = clamp(size * 0.22, 0.06, 0.16);
  const x0 = size / 2 + cell * 0.6;
  const z0 = zMin - size * 0.3;
  const z1 = zMax + size * 0.3;
  const cols = Math.max(2, Math.round((z1 - z0) / cell));
  const cw = (z1 - z0) / cols;
  K.box('coursePaint', x0, 0, z0, x0 + 2 * cell, 0.004, z1);
  for (let j = 0; j < cols; j += 1) {
    for (let i = 0; i < 2; i += 1) {
      if ((i + j) % 2 === 0) {
        K.box('courseChequer', x0 + i * cell, 0, z0 + j * cw, x0 + (i + 1) * cell, 0.006, z0 + (j + 1) * cw);
      }
    }
  }
  /* The word, ahead of the line, as long as most of the row. */
  const run = Math.min((z1 - z0) * 0.62, 3.2);
  const tall = run / 2;
  K.sign('courseStartText', x0 + 2 * cell + size * 0.35 + tall / 2, 0.005, (z0 + z1) / 2, tall, run, '+y', 0);
}

/* A named gap is a scoring zone and nothing in the air: no parts. */
export function gapLayout() {
  return [];
}

/* Ground paint: nothing solid, drawn by the map from the course's logos. */
export function decalLayout() {
  return [];
}
