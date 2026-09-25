/*
 * industrial.js: the tall things. A tower crane, a water tower, a lattice
 * mast, a chimney, a power pylon, a stack of containers and a scaffold.
 *
 * WHY MOST OF THESE TURN FREELY. A lattice is made of members, and a member
 * is a capsule, and a capsule has no heading for the physics to care about.
 * So the crane, the water tower, the mast, the chimney and the pylon are
 * built out of nothing but capsules and face any way the author points them.
 * The containers and the scaffold have flat decks you land on, and a deck is
 * a box, so they keep to the four compass headings until the physics learns
 * turned boxes (FREESTYLE-MAPS-PLAN.md, P1).
 *
 * THE LATTICE IS SOLID, every member of it, and that is deliberate: what a
 * pilot sees is what a pilot hits. Where a lattice is a line to be flown
 * through (the crane's mast, the jib, the pylon's lower body) its openings
 * keep the gap rule of ./parts.js, which is what sets the sizes below: a
 * 2.4 m crane mast with panels of at least 3.2 m leaves a clear circle of
 * about 1.45 m in every triangle, and the jib is braced as a Warren truss
 * (diagonals, no verticals) because the right triangles that verticals cut
 * it into would be about 1.2 m, a slot rather than a line.
 *
 * WHAT IS NOT SOLID: wires and fittings a few centimetres thick, ladders,
 * signs, lamps, gratings, and the debris net's weave. A chunky shape that
 * cannot be a capsule (a cab, a counterweight, a hook block, a radome) is
 * drawn as what it is and made solid as capsules that sit inside it, at most
 * a few tenths of a metre shy of the drawn corners. The solid is never
 * outside the drawing: nothing here is an invisible wall.
 *
 * THE LOOK is the town's: cel materials with violet shadows, and enough real
 * detail (sheaves, hoops, corrugation, planks, bolted flanges) that the
 * screen space ink has edges to draw when the pilot is close, while the
 * silhouette alone carries the read at forty metres. Thin members that
 * would shrink below a pixel at that range (hoist ropes, pendants) are drawn
 * a little thicker than life, and their solids match what is drawn.
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

import { Parts, seededRandom, seedOf, around, lerp3 } from './parts.js';
import { CONTAINER_STYLES } from './types.js';
import { canvas } from './textures.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/*
 * A square root for numbers that reach the physics, from + - * / alone.
 * Newton's step from above falls monotonically onto the root, and it stops
 * the first time a step does not fall, so the same argument gives the same
 * bits everywhere. Math.sqrt would too: ECMA-262 (21.3.2.33) makes it
 * correctly rounded, and it is Math.hypot, like the sines ./trig.js
 * replaces, that the language leaves to the engine. This one stays because
 * every layout that reaches the physics was written with it, and swapping
 * it would move the recorded placements by an ulp for nothing. Render code
 * keeps using Math.sqrt.
 */
function rootOf(x) {
  if (!(x > 0)) {
    return 0;
  }
  let y = x > 1 ? x : 1;
  for (let i = 0; i < 64; i += 1) {
    const n = 0.5 * (y + x / y);
    if (!(n < y)) {
      break;
    }
    y = n;
  }
  return y;
}

/* The shadow tints the kit uses, for this family's own colours. */
const TINT = 0x6f6790;
const TINT_DEEP = 0x5c5680;

/*
 * THIS FAMILY'S OWN COLOURS, merged into the kit's table by ./catalog.js.
 * Prefixed so no other family can collide with them.
 */
export const MATERIALS = {
  /* the crane's cab and machinery */
  indCab: { c: 0xf3eee6, tint: 0x7d74a0 },
  indCabTrim: { c: 0x59627a, tint: 0x4a4668 },
  indBallast: { c: 0xcdc7c6, tint: 0x6a6288 },
  indWinch: { c: 0x5c7aa3, tint: 0x4a4a7a },
  indCabinet: { c: 0xe2e4e2, tint: TINT },
  /* the water tank's paint, on the town's high key ramp, the one its
   * blossom wears. A sphere under the town's three lights on the ordinary
   * ramp is cut by three sets of band edges into a cut gem; this keeps it a
   * pale round mass with one soft step to its shadow side. */
  indTank: { c: 0xe9eff4, bands: 'soft3', tint: 0xb9b4d4 },
  /* the mast's radomes and panel antennas */
  indRadome: { c: 0xf1efe9, tint: 0x7d74a0 },
  indRadomeRim: { c: 0xa4acb6, tint: TINT_DEEP },
  indAntenna: { c: 0xe8e7e2, tint: 0x7a72a0 },
  /* the chimney's darker courses, iron hoops and soot */
  indBrickDark: { c: 0x85584a, tint: 0x5a4a70 },
  indHoop: { c: 0x4f4550, tint: 0x3f3a50 },
  indSoot: { c: 0x7a5a52, tint: 0x55465e },
  indSootDeep: { c: 0x5f4a4d, tint: 0x46405a },
  indFlue: { f: 0x2a2632 },
  /* timber: scaffold boards in three tones, the dark between them, sole
   * boards, and a container's plywood floor */
  indPlankA: { c: 0xd4aa70, tint: 0x6f5f7a },
  indPlankB: { c: 0xc4975f, tint: 0x6a5a78 },
  indPlankC: { c: 0xdfbd88, tint: 0x746482 },
  indPlankGap: { c: 0x5a4a44, tint: 0x3f3a50 },
  indSole: { c: 0xa0805c, tint: 0x5f5070 },
  indFloor: { c: 0xa88760, tint: 0x5f5070 },
  /* the debris net's seams and hems */
  indNetSeam: { c: 0x3d7d5c, tint: 0x3a4d62 },
};

/* ------------------------------------------------------------------ *
 * PAINTED SIGNS only this family hangs. Pure functions of the variant,
 * every name invented, drawn in the town's ink and paper.
 * ------------------------------------------------------------------ */

const INK = '#39324f';
const PAPER = '#fbf7ee';
const JP = `'Yu Gothic', 'Yu Gothic UI', 'Meiryo', 'Hiragino Kaku Gothic ProN', 'Noto Sans CJK JP', sans-serif`;
const DISPLAY = `'Arial Black', 'Helvetica Neue', Impact, 'Noto Sans CJK JP', sans-serif`;

function fitFont(g, text, maxW, size, font, weight = '900') {
  let s = size;
  do {
    g.font = `${weight} ${s}px ${font}`;
    if (g.measureText(text).width <= maxW) {
      break;
    }
    s -= 2;
  } while (s > 8);
  return s;
}

/* Lettering with an ink edge, so it reads on any colour of steel. */
function lettered(g, text, x, y, fill, edge) {
  g.lineJoin = 'round';
  g.lineWidth = edge;
  g.strokeStyle = INK;
  g.strokeText(text, x, y);
  g.fillStyle = fill;
  g.fillText(text, x, y);
}

/* The rated load along a crane's jib, heaviest nearest the mast. */
const LOADS = ['4.2t', '3.2t', '2.4t', '1.6t'];

/* The hot spring mark a bathhouse chimney wears, drawn rather than typed so
 * it does not depend on a font having the glyph. */
function onsenMark(g, w, h) {
  g.lineCap = 'round';
  g.lineJoin = 'round';
  /* Drawn twice, ink under paper, so the mark has the same edge as the
   * lettering under it. */
  for (const [col, lw] of [[INK, 17], ['#f6f1e6', 9]]) {
    g.strokeStyle = col;
    g.lineWidth = lw;
    g.beginPath();
    g.ellipse(w / 2, h * 0.7, w * 0.3, h * 0.14, 0, 0, Math.PI);
    g.moveTo(w * 0.8, h * 0.7);
    g.ellipse(w / 2, h * 0.7, w * 0.3, h * 0.07, 0, 0, Math.PI, true);
    g.stroke();
    for (let k = -1; k <= 1; k += 1) {
      const x = w / 2 + k * w * 0.17;
      g.beginPath();
      g.moveTo(x, h * 0.58);
      g.bezierCurveTo(x - w * 0.1, h * 0.45, x + w * 0.1, h * 0.33, x - w * 0.02, h * 0.14);
      g.stroke();
    }
  }
}

/* The bathhouse's name, a character at a time down the stack. */
const BATH = ['ひ', 'ば', 'り', '湯'];

export const PAINTERS = {
  /* A crane's rated load plate, hung on the jib. */
  indLoadPlate: {
    variants: LOADS.length,
    paint(v) {
      const c = canvas(256, 160);
      const g = c.getContext('2d');
      g.fillStyle = PAPER;
      g.fillRect(0, 0, 256, 160);
      g.fillStyle = '#e0453f';
      g.fillRect(0, 0, 256, 16);
      g.fillRect(0, 144, 256, 16);
      g.lineWidth = 8;
      g.strokeStyle = INK;
      g.strokeRect(4, 4, 248, 152);
      g.fillStyle = INK;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `900 ${fitFont(g, LOADS[v % LOADS.length], 220, 96, DISPLAY)}px ${DISPLAY}`;
      g.fillText(LOADS[v % LOADS.length], 128, 76);
      g.font = `700 20px ${JP}`;
      g.fillText('ひばり建設  定格荷重', 128, 128);
      return c;
    },
  },
  /* One character of a bathhouse's name, white on the brick. Variant 0 is
   * the hot spring mark. */
  indChimneyChar: {
    variants: BATH.length + 1,
    paint(v) {
      const c = canvas(128, 128);
      const g = c.getContext('2d');
      g.clearRect(0, 0, 128, 128);
      if (v % (BATH.length + 1) === 0) {
        onsenMark(g, 128, 128);
        return c;
      }
      /* Condensed, the way vertical signage letters a narrow stack, which
       * also keeps the glyph's edges close to the curve of the brick. */
      g.translate(64, 0);
      g.scale(0.85, 1);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `900 104px ${JP}`;
      lettered(g, BATH[(v % (BATH.length + 1)) - 1], 0, 68, '#f6f1e6', 10);
      return c;
    },
  },
  /* A container's door placard: its number, size and type, the weights, and
   * the safety approval plate, stencilled the way a door carries them. */
  indContainerDoor: {
    variants: 6,
    paint(v) {
      const c = canvas(512, 256);
      const g = c.getContext('2d');
      g.clearRect(0, 0, 512, 256);
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.font = `900 46px ${DISPLAY}`;
      lettered(g, `HBRU ${String(400000 + v * 7919).slice(0, 6)} 2`, 16, 40, '#f7f4ee', 6);
      g.font = `900 40px ${DISPLAY}`;
      lettered(g, v % 2 ? '22G1' : '45G1', 16, 96, '#f7f4ee', 6);
      g.font = `800 21px ${DISPLAY}`;
      ['MAX.GROSS  30,480 KG', 'TARE  3,750 KG', 'NET  26,730 KG'].forEach((t, i) => {
        lettered(g, t, 16, 146 + i * 30, '#f7f4ee', 4);
      });
      /* the approval plate, a riveted silver oblong */
      g.fillStyle = '#c9ccd2';
      g.fillRect(352, 150, 140, 88);
      g.lineWidth = 4;
      g.strokeStyle = INK;
      g.strokeRect(352, 150, 140, 88);
      g.lineWidth = 3;
      for (let k = 0; k < 4; k += 1) {
        g.beginPath();
        g.moveTo(366, 174 + k * 16);
        g.lineTo(478 - (k % 2) * 30, 174 + k * 16);
        g.stroke();
      }
      g.fillStyle = INK;
      g.font = `900 16px ${DISPLAY}`;
      g.fillText('CSC', 366, 160);
      return c;
    },
  },
  /* A transmission tower's number plate. */
  indPylonPlate: {
    variants: 1,
    paint() {
      const c = canvas(256, 128);
      const g = c.getContext('2d');
      g.fillStyle = PAPER;
      g.fillRect(0, 0, 256, 128);
      g.lineWidth = 7;
      g.strokeStyle = INK;
      g.strokeRect(4, 4, 248, 120);
      g.fillStyle = INK;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `900 ${fitFont(g, 'ひばり線', 220, 44, JP)}px ${JP}`;
      g.fillText('ひばり線', 128, 40);
      g.font = `900 50px ${DISPLAY}`;
      g.fillText('No.27', 128, 92);
      return c;
    },
  },
  /* The radio mast's site plate. */
  indMastPlate: {
    variants: 1,
    paint() {
      const c = canvas(256, 160);
      const g = c.getContext('2d');
      g.fillStyle = PAPER;
      g.fillRect(0, 0, 256, 160);
      g.fillStyle = '#2f7fd0';
      g.fillRect(0, 0, 256, 44);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = '#ffffff';
      g.font = `900 ${fitFont(g, 'ひばり通信', 220, 30, JP)}px ${JP}`;
      g.fillText('ひばり通信', 128, 23);
      g.fillStyle = INK;
      g.font = `900 ${fitFont(g, '無線基地局', 230, 42, JP)}px ${JP}`;
      g.fillText('無線基地局', 128, 84);
      g.fillStyle = '#e0453f';
      g.font = `900 ${fitFont(g, '関係者以外立入禁止', 236, 22, JP)}px ${JP}`;
      g.fillText('関係者以外立入禁止', 128, 132);
      g.lineWidth = 6;
      g.strokeStyle = INK;
      g.strokeRect(3, 3, 250, 154);
      return c;
    },
  },
};

/* ------------------------------------------------------------------ *
 * Geometry the kit has no word for, made once per page. The kit's bake
 * clones what it is handed, so every crane on a map shares these buffers.
 * Render only: nothing below this line reaches the physics.
 * ------------------------------------------------------------------ */

const GEO = new Map();
function cachedGeo(K, key, make) {
  let g = GEO.get(key);
  if (!g) {
    g = make(K.THREE);
    GEO.set(key, g);
  }
  return g;
}

/* A box turned about +y, for parts that face a lattice's own faces. */
function turnedBox(K, mat, c, w, h, d, yaw) {
  const T = K.THREE;
  const box = cachedGeo(K, 'box', (TH) => new TH.BoxGeometry(1, 1, 1));
  const m = new T.Matrix4().makeRotationY(yaw).scale(new T.Vector3(w, h, d)).setPosition(c[0], c[1], c[2]);
  K.add(mat, box, m);
}

/* A polyline of thin cylinders. */
function polyline(K, mat, pts, r, seg = 4) {
  for (let i = 0; i + 1 < pts.length; i += 1) {
    K.cyl(mat, pts[i], pts[i + 1], r, seg);
  }
}

/*
 * A run of corrugation: `n` raised trapezoid flutes along +x from 0 to
 * `len`, `h` tall, standing `dep` proud toward +z, each a web up, a flat and
 * a web down with its own normal, so the cel ramp gives every flute a lit
 * edge and a shaded one the way a painter strokes them. No backs and no
 * ends: the rails and the body hide both. Six triangles a flute.
 */
function fluteGeo(K, len, h, n, dep) {
  return cachedGeo(K, `flutes:${len.toFixed(3)}:${h.toFixed(3)}:${n}:${dep}`, (T) => {
    const p = len / n;
    const web = p * 0.1;
    const flat = p * 0.46;
    const pos = [];
    const nor = [];
    const uv = [];
    const idx = [];
    const quad = (x0, z0, x1, z1) => {
      const dx = x1 - x0;
      const dz = z1 - z0;
      const l = Math.hypot(dx, dz);
      const nx = -dz / l;
      const nz = dx / l;
      const b = pos.length / 3;
      pos.push(x0, 0, z0, x1, 0, z1, x1, h, z1, x0, h, z0);
      for (let k = 0; k < 4; k += 1) {
        nor.push(nx, 0, nz);
      }
      uv.push(0, 0, 1, 0, 1, 1, 0, 1);
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    };
    for (let i = 0; i < n; i += 1) {
      const x = i * p + (p - flat - 2 * web) / 2;
      quad(x, 0, x + web, dep);
      quad(x + web, dep, x + web + flat, dep);
      quad(x + web + flat, dep, x + flat + 2 * web, 0);
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  });
}

/* ------------------------------------------------------------------ *
 * THE TOWER CRANE. A hammerhead with a cat head: a square lattice mast,
 * slewing ring, a cab on the right of the jib root, a triangular jib braced
 * as a Warren truss, a flat counter jib carrying the winch and a stack of
 * ballast slabs, a lattice cat head with pendant bars down to both, and a
 * trolley with a striped hook block on two falls of rope. The jib points
 * along +x.
 * ------------------------------------------------------------------ */

/* The mast: 2.4 m square, panels no shorter than 3.2 m, for the gap rule
 * (see the header). The jib: a triangle 1.7 m across the bottom and 2 m
 * tall, panels no shorter than 2.6 m. */
const MAST_HALF = 1.2;
const MAST_PANEL = 3.2;
const JIB_HALF = 0.85;
const JIB_TOP = 2.0;
const JIB_PANEL = 2.6;
/* The cat head: its foot, its top and its height over the jib. */
const CAT_FOOT = 0.95;
const CAT_TOP = 0.28;
const CAT_H = 5.7;
/* The counter jib's chords, either side of the middle. */
const COUNTER_HALF = 0.95;

function craneSpec(el) {
  const d = el.dims;
  const H = clamp(d.height, 10, 80);
  const L = clamp(d.jib, 12, 70);
  const Lc = clamp(d.counterJib, 6, 24);
  const hook = clamp(d.hook, 2, H - 2);
  const at = clamp(Number(d.trolley) || 0.6, 0.15, 0.95);
  /* The jib's bottom chords sit 1.2 m over the mast top. A built map's
   * lines are measured from here (src/maps/built/starter.js). */
  const yj = H + 1.2;
  const n = Math.max(3, Math.floor((L - 1.0) / JIB_PANEL));
  const p = (L - 1.0) / n;
  /* Ballast slabs: four on a long counter jib, fewer on a short one, so
   * they never reach the winch. */
  const slabs = clamp(Math.floor((Lc - 3.6) / 0.72), 2, 4);
  return { H, L, Lc, hook, at, yj, n, p, slabs, tx: 2 + at * (L - 4), hy: yj - hook };
}

/* A square lattice between two heights: four chords, a zigzag brace and a
 * horizontal at every panel on each face, and a frame at both ends. */
function squareLattice(P, m, half, y0, y1, panel, chordR, braceR) {
  const panels = Math.max(1, Math.floor((y1 - y0) / panel));
  const corners = [[-half, -half], [half, -half], [half, half], [-half, half]];
  for (const [x, z] of corners) {
    P.post(m, x, z, y0, y1, chordR, { name: 'chord' });
  }
  for (let i = 0; i < 4; i += 1) {
    const [ax, az] = corners[i];
    const [bx, bz] = corners[(i + 1) % 4];
    const a0 = [ax, y0, az];
    const a1 = [ax, y1, az];
    const b0 = [bx, y0, bz];
    const b1 = [bx, y1, bz];
    P.zigzag(m, a0, a1, b0, b1, panels, braceR, { name: 'brace' });
    P.rungs(m, a0, a1, b0, b1, panels, braceR, { name: 'rung' });
    P.cap(m, a0, b0, braceR * 1.2, { name: 'frame' });
    P.cap(m, a1, b1, braceR * 1.2, { name: 'frame' });
  }
  return panels;
}

export function craneLayout(el) {
  const s = craneSpec(el);
  const { H, L, Lc, yj, n, p, tx, hy } = s;
  const P = new Parts();
  const Y = 'craneYellow';
  const D = 'craneYellowDeep';

  /* The mast, from its base frame to the slewing ring. */
  squareLattice(P, Y, MAST_HALF, 0.25, H, MAST_PANEL, 0.1, 0.05);

  /* The slewing drum (drawn in craneDraw, 1.3 m round and 0.95 m tall):
   * solid as a star of four capsules inside it, which reaches within about
   * 0.2 m of its drawn edge all the way round. */
  for (const [ax, az] of [[0.8, 0], [0, 0.8], [0.566, 0.566], [0.566, -0.566]]) {
    P.cap(D, [-ax, H + 0.5, -az], [ax, H + 0.5, az], 0.45, { draw: false, name: 'slew', kind: 'wall' });
  }
  /* The turntable over it (drawn as a slab 4 m by 2.5 m, 0.25 m thick):
   * solid as five girders along it, a quarter metre apart, so the slab
   * has no slot in it a quad could find. */
  for (const z of [-1.0, -0.5, 0, 0.5, 1.0]) {
    P.cap(D, [-1.88, H + 1.075, z], [1.88, H + 1.075, z], 0.12, { draw: false, name: 'turntable' });
  }

  /* The cab, on the right of the jib root: drawn as a cab in craneDraw
   * (x 0.1 to 2.45, z 1.3 to 2.9, H - 0.1 to H + 2.0, the front leaning
   * out); solid as capsules inside it, a big one through the middle, one
   * at each upright corner and one along the top of the windscreen, which
   * keep within about 0.25 m of every drawn corner. */
  for (const x of [0.9, 1.3]) {
    P.cap('indCab', [x, H + 0.66, 2.1], [x, H + 1.24, 2.1], 0.75, { draw: false, name: 'cab', kind: 'wall' });
  }
  for (const [x, z] of [[0.46, 1.66], [0.46, 2.54], [1.72, 1.66], [1.72, 2.54]]) {
    P.cap('indCab', [x, H + 0.26, z], [x, H + 1.64, z], 0.35, { draw: false, name: 'cab', kind: 'wall' });
  }
  P.cap('indCab', [2.1, H + 1.7, 1.6], [2.1, H + 1.7, 2.6], 0.28, { draw: false, name: 'cab', kind: 'wall' });
  /* The air conditioner on the cab's back wall. */
  P.cap('acUnit', [-0.075, H + 0.6, 2.07], [-0.075, H + 0.6, 2.43], 0.17, { draw: false, name: 'cab', kind: 'wall' });

  /* The cat head: four legs tapering to a head, rings and zigzags. */
  const cc = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const catAt = (c, t) => {
    const w = CAT_FOOT + (CAT_TOP - CAT_FOOT) * t;
    return [c[0] * w, yj + CAT_H * t, c[1] * w];
  };
  for (const c of cc) {
    P.cap(Y, catAt(c, 0), catAt(c, 1), 0.08, { name: 'catHead' });
  }
  for (let i = 0; i < 4; i += 1) {
    const a = cc[i];
    const b = cc[(i + 1) % 4];
    for (const t of [0, 0.36, 0.7, 1]) {
      P.cap(Y, catAt(a, t), catAt(b, t), 0.045, { name: 'catRing' });
    }
    P.cap(Y, catAt(a, 0), catAt(b, 0.36), 0.035, { name: 'catBrace' });
    P.cap(Y, catAt(b, 0.36), catAt(a, 0.7), 0.035, { name: 'catBrace' });
    P.cap(Y, catAt(a, 0.7), catAt(b, 1), 0.035, { name: 'catBrace' });
  }
  /* The pendant head on top, drawn as a block; solid inside it. */
  P.cap(D, [0, yj + CAT_H + 0.1, 0], [0, yj + CAT_H + 0.2, 0], 0.25, { draw: false, name: 'catTop', kind: 'wall' });

  /*
   * The jib: two bottom chords and a top chord, a Warren truss on all three
   * faces (see the header), closing to a sloped nose over its last panel.
   */
  const jb = JIB_HALF;
  const x0 = 1.0;
  const xn = L - p;
  const bl0 = [x0, yj, -jb];
  const bl1 = [L, yj, -jb];
  const br0 = [x0, yj, jb];
  const br1 = [L, yj, jb];
  const tp0 = [x0, yj + JIB_TOP, 0];
  const tp1 = [xn, yj + JIB_TOP, 0];
  P.cap(Y, bl0, bl1, 0.08, { name: 'jibChord' });
  P.cap(Y, br0, br1, 0.08, { name: 'jibChord' });
  P.cap(Y, tp0, tp1, 0.075, { name: 'jibChord' });
  P.cap(Y, tp1, bl1, 0.06, { name: 'jibNose' });
  P.cap(Y, tp1, br1, 0.06, { name: 'jibNose' });
  P.cap(Y, bl1, br1, 0.05, { name: 'jibNose' });
  /* The root frame, and the link from the top chord to the cat head. */
  P.cap(Y, bl0, br0, 0.05, { name: 'jibRoot' });
  P.cap(Y, bl0, tp0, 0.06, { name: 'jibRoot' });
  P.cap(Y, br0, tp0, 0.06, { name: 'jibRoot' });
  const catFront = CAT_FOOT + (CAT_TOP - CAT_FOOT) * (JIB_TOP / CAT_H);
  P.cap(Y, tp0, [catFront, yj + JIB_TOP, 0], 0.06, { name: 'jibRoot' });
  P.zigzag(Y, bl0, [xn, yj, -jb], tp0, tp1, n - 1, 0.04, { name: 'jibBrace' });
  P.zigzag(Y, br0, [xn, yj, jb], tp0, tp1, n - 1, 0.04, { name: 'jibBrace' });
  P.zigzag(Y, bl0, bl1, br0, br1, n, 0.035, { name: 'jibBrace' });

  /* The counter jib: flat, two chords and cross members, no diagonals, so
   * its openings are rectangles well over the gap rule. */
  const cz = COUNTER_HALF;
  const c0 = -1.0;
  const cl0 = [c0, yj, -cz];
  const cl1 = [-Lc, yj, -cz];
  const cr0 = [c0, yj, cz];
  const cr1 = [-Lc, yj, cz];
  P.cap(Y, cl0, cl1, 0.085, { name: 'counterChord' });
  P.cap(Y, cr0, cr1, 0.085, { name: 'counterChord' });
  const cpanels = Math.max(2, Math.round((Lc - 1) / 2.2));
  P.rungs(Y, cl0, cl1, cr0, cr1, cpanels, 0.045, { name: 'counterRung' });
  P.cap(Y, cl0, cr0, 0.05, { name: 'counterRung' });
  P.cap(Y, cl1, cr1, 0.06, { name: 'counterRung' });
  /* Hand rails along both sides, solid: they are what a pilot skims. */
  for (const z of [-cz - 0.05, cz + 0.05]) {
    P.cap('white', [c0, yj + 1.05, z], [-Lc, yj + 1.05, z], 0.03, { name: 'rail' });
  }

  /* The ballast slabs at the end (drawn x from -Lc + 0.12, 0.72 each,
   * y from yj - 1.35 to yj + 0.75, z within 0.88): solid as capsules along
   * x inside them, two fat ones through the middle and a thinner one down
   * each of the four long edges, so the block is solid to within about
   * 0.3 m of its corners. */
  const bx0 = -Lc + 0.12;
  const bx1 = bx0 + s.slabs * 0.72 - 0.04;
  for (const dy of [-0.47, -0.13]) {
    P.cap('indBallast', [bx0 + 0.86, yj + dy, 0], [bx1 - 0.86, yj + dy, 0], 0.86, { draw: false, name: 'ballast', kind: 'wall' });
  }
  for (const dy of [-0.95, 0.35]) {
    for (const z of [-0.48, 0.48]) {
      P.cap('indBallast', [bx0 + 0.4, yj + dy, z], [bx1 - 0.4, yj + dy, z], 0.4, { draw: false, name: 'ballast', kind: 'wall' });
    }
  }
  /* The walkway down the counter jib, from the ballast to the mast, SOLID:
   * drawn in craneDraw as a grating deck between the chords, 0.2 m deep,
   * and filled with capsules along it that overlap and meet the chords. */
  for (const z of [-0.74, -0.49, -0.245, 0, 0.245, 0.49, 0.74]) {
    P.cap('grating', [bx1 + 0.15, yj + 0.015, z], [-1.1, yj + 0.015, z], 0.1, { draw: false, name: 'walkway', kind: 'wall' });
  }
  /* The hoist winch (a drum 0.47 m round between flanges 1.1 m apart), its
   * motor, and the electrical cabinet, all drawn in craneDraw, all solid
   * inside what is drawn. */
  P.cap('metalDark', [-2.9, yj + 0.62, -0.08], [-2.9, yj + 0.62, 0.08], 0.47, { draw: false, name: 'winch', kind: 'wall' });
  for (const x of [-3.1, -2.7]) {
    P.cap('indWinch', [x, yj + 0.3, 0.73], [x, yj + 0.8, 0.73], 0.15, { draw: false, name: 'winch', kind: 'wall' });
  }
  P.cap('indCabinet', [-1.7, yj + 0.56, 0], [-1.7, yj + 1.06, 0], 0.44, { draw: false, name: 'cabinet', kind: 'wall' });

  /* The pendants: bars from the cat head down to the jib's top chord and
   * to the counter jib's end. Drawn thicker than a real bar so they hold
   * together as a line at range; solid as drawn. */
  const head = [0, yj + CAT_H + 0.3, 0];
  P.cap('metalDark', [0.3, head[1], 0], [L * 0.62, yj + JIB_TOP, 0], 0.045, { name: 'pendant' });
  P.cap('metalDark', [0.3, head[1], 0], [L * 0.3, yj + JIB_TOP, 0], 0.04, { name: 'pendant' });
  for (const z of [-cz, cz]) {
    P.cap('metalDark', [-0.3, head[1], 0], [-Lc + 0.3, yj + 0.12, z], 0.045, { name: 'pendant' });
  }

  /* The trolley under the jib (drawn as a frame 1.4 m long between the
   * chords): solid as two capsules across it. */
  for (const dx of [-0.45, 0.45]) {
    P.cap('craneYellowDeep', [tx + dx, yj - 0.33, -0.51], [tx + dx, yj - 0.33, 0.51], 0.21, { draw: false, name: 'trolley', kind: 'wall' });
  }
  /* Two falls of hoist rope, SOLID: a crane's rope is the thing every pilot
   * who has flown near one remembers. 8 cm, and a hand apart, so at forty
   * metres the pair draws as one unbroken line instead of a dotted one. */
  for (const z of [-0.13, 0.13]) {
    P.cap('rope', [tx, yj - 0.55, z], [tx, hy + 0.85, z], 0.04, { name: 'rope', seg: 5 });
  }
  /* The hook block (a striped body 0.4 x 0.8 x 0.72 between yellow cheek
   * plates, a sheave over it): capsules inside the body. */
  for (const z of [-0.23, 0.23]) {
    P.cap('hazard', [tx, hy + 0.1, z], [tx, hy + 0.6, z], 0.19, { draw: false, name: 'hookBlock', kind: 'obstacle' });
  }
  /* The hook: its shank, and its C as a chain of short capsules inside the
   * drawn tube (see hookArc), so a quad that clips the hook clips it where
   * it is drawn and not in its empty throat. */
  P.cap('metalDark', [tx, hy - 0.16, 0], [tx, hy - 0.44, 0], 0.07, { draw: false, name: 'hook', kind: 'obstacle' });
  const arc = hookArc(tx, hy);
  for (let i = 0; i + 1 < arc.length; i += 1) {
    P.cap('metalDark', arc[i], arc[i + 1], 0.05, { draw: false, name: 'hook', kind: 'obstacle' });
  }
  return P.list;
}

/*
 * The hook's J: an arc of radius 0.2 round (tx + 0.1, hy - 0.62), from the
 * shank at the upper left, down round the bowl and up to the tip at the
 * right, leaving the throat open between them the way a hook's is. The
 * layout's capsules and the drawn tube both come from here; the points are
 * turned with ./parts.js's around(), whose sine is the same bits in every
 * engine, because they reach the physics.
 */
const HOOK_R = 0.2;
const HOOK_TUBE = 0.065;
const HOOK_A0 = (2 / 3) * Math.PI;
const HOOK_SWEEP = (13 / 9) * Math.PI;
function hookArc(tx, hy) {
  const pts = [];
  const n = 7;
  for (let k = 0; k <= n; k += 1) {
    const a = HOOK_A0 + (k / n) * HOOK_SWEEP;
    const [c, sn] = around(HOOK_R, a);
    pts.push([tx + 0.1 + c, hy - 0.62 + sn, 0]);
  }
  return pts;
}

export function craneDraw(el, parts, K) {
  const s = craneSpec(el);
  const { H, L, Lc, yj, tx, hy } = s;
  const T = K.THREE;
  const h = MAST_HALF;

  /* The foundation, the base frame and the anchor shoes. Kept low: a
   * crane is capsules only, so nothing at its foot can be a solid block,
   * and a knee high slab a quad skims through would be a ghost. */
  K.box('concrete', -2.9, 0, -2.9, 2.9, 0.15, 2.9);
  K.box('craneYellowDeep', -1.45, 0.15, -1.45, 1.45, 0.25, 1.45);
  for (const [x, z] of [[-h, -h], [h, -h], [h, h], [-h, h]]) {
    K.box('metalDark', x - 0.2, 0.25, z - 0.2, x + 0.2, 0.52, z + 0.2);
    /* Bolted section joints up the chords, every two panels. */
    for (let y = 0.25 + MAST_PANEL * 2; y < H - 1; y += MAST_PANEL * 2) {
      K.box('metalDark', x - 0.15, y - 0.07, z - 0.15, x + 0.15, y + 0.07, z + 0.15);
    }
  }

  /* The slewing drum, its ring gear, and the turntable over it. */
  K.cyl('craneYellowDeep', [0, H + 0.02, 0], [0, H + 0.95, 0], 1.3, 20);
  K.cyl('metalDark', [0, H + 0.3, 0], [0, H + 0.42, 0], 1.4, 20);
  K.box('craneYellow', -2.0, H + 0.95, -1.25, 2.0, H + 1.2, 1.25);

  /* The cab: a leaning windscreen, side glass, a floor window for looking
   * down the hook, a door at the back, a roof lip and a beacon, and an air
   * conditioner hung off the back wall. */
  const cz0 = 1.3;
  const cz1 = 2.9;
  const cy0 = H - 0.1;
  const cy1 = H + 2.0;
  const f0 = [2.05, cy0];
  const f1 = [2.45, cy1];
  K.extrude('indCab', [[0.1, cy0], f0, f1, [0.1, cy1]], cz0, cz1);
  const fl = Math.hypot(f1[0] - f0[0], f1[1] - f0[1]);
  const dir = [(f1[0] - f0[0]) / fl, (f1[1] - f0[1]) / fl];
  const nrm = [dir[1], -dir[0]];
  const on = (t, o) => [f0[0] + dir[0] * fl * t + nrm[0] * o, f0[1] + dir[1] * fl * t + nrm[1] * o];
  K.extrude('glassDark', [on(0.1, 0.005), on(0.93, 0.005), on(0.93, 0.035), on(0.1, 0.035)], cz0 + 0.12, cz1 - 0.12);
  K.box('glassDark', 0.55, H + 0.75, cz1, 2.0, H + 1.85, cz1 + 0.03);
  K.box('glassDark', 1.35, H + 0.05, cz1, 2.0, H + 0.6, cz1 + 0.03);
  K.box('glassDark', 0.6, H + 0.9, cz0 - 0.03, 1.9, H + 1.8, cz0);
  K.box('indCabTrim', 0.07, H + 0.1, 1.72, 0.1, H + 1.85, 2.42);
  K.box('glassDark', 0.05, H + 1.15, 1.86, 0.07, H + 1.7, 2.28);
  K.box('craneYellowDeep', 0.0, cy1, cz0 - 0.06, 2.55, cy1 + 0.12, cz1 + 0.06);
  K.box('acUnit', -0.25, H + 0.3, 1.9, 0.1, H + 0.9, 2.6);
  K.ball('lampRed', [0.5, cy1 + 0.24, cz1 - 0.3], 0.11);

  /* The pendant head, its sheaves, an anemometer, and the apex lamp. */
  const top = yj + CAT_H;
  K.box('craneYellowDeep', -0.32, top - 0.02, -0.32, 0.32, top + 0.45, 0.32);
  for (const x of [-0.34, 0.34]) {
    K.cyl('metalDark', [x, top + 0.3, -0.18], [x, top + 0.3, 0.18], 0.16, 10);
  }
  K.cyl('metalDark', [0, top + 0.45, 0], [0, top + 1.1, 0], 0.025, 5);
  for (let k = 0; k < 3; k += 1) {
    const a = (k / 3) * Math.PI * 2;
    const tip = [Math.cos(a) * 0.2, top + 1.1, Math.sin(a) * 0.2];
    K.cyl('metalDark', [0, top + 1.1, 0], tip, 0.012, 3);
    K.ball('white', tip, 0.05);
  }
  K.ball('lampRed', [0, top + 1.2, 0], 0.1);

  /* The jib's load plates, both sides, and its tip lamp. */
  [0.3, 0.55, 0.8].forEach((f, k) => {
    K.sign('indLoadPlate', L * f, yj + 0.34, JIB_HALF + 0.1, 1.3, 0.8, '+z', k);
    K.sign('indLoadPlate', L * f, yj + 0.34, -JIB_HALF - 0.1, 1.3, 0.8, '-z', k);
  });
  K.ball('lampRed', [L + 0.05, yj + 0.25, 0], 0.12);

  /* The counter jib: a walkway down the middle, rail posts and a mid rail,
   * the builder's banner, the winch, the cabinet and the ballast. */
  const cz = COUNTER_HALF;
  const bx0 = -Lc + 0.12;
  const bx1 = bx0 + s.slabs * 0.72 - 0.04;
  K.box('grating', bx1 + 0.05, yj - 0.085, -0.85, -1.0, yj + 0.115, 0.85);
  for (const z of [-cz - 0.05, cz + 0.05]) {
    for (let x = -1.0; x > -Lc - 0.01; x -= 1.6) {
      K.cyl('white', [x, yj, z], [x, yj + 1.05, z], 0.025, 5);
    }
    K.cyl('white', [-1.0, yj + 0.55, z], [-Lc, yj + 0.55, z], 0.02, 5);
  }
  const bw = Math.max(0, -2.35 - (bx1 + 0.25));
  if (bw > 0.8) {
    const bm = (-2.35 + bx1 + 0.25) / 2;
    K.sign('craneBanner', bm, yj + 0.72, cz + 0.09, Math.min(bw, 7), 0.62, '+z', 0);
    K.sign('craneBanner', bm, yj + 0.72, -cz - 0.09, Math.min(bw, 7), 0.62, '-z', 0);
  }
  K.box('craneYellowDeep', -3.5, yj + 0.08, -0.7, -2.3, yj + 0.14, 0.7);
  K.cyl('rope', [-2.9, yj + 0.62, -0.45], [-2.9, yj + 0.62, 0.45], 0.47, 14);
  for (const z of [-0.5, 0.5]) {
    K.cyl('craneYellowDeep', [-2.9, yj + 0.62, z - 0.05], [-2.9, yj + 0.62, z + 0.05], 0.56, 14);
  }
  K.box('indWinch', -3.3, yj + 0.14, 0.58, -2.5, yj + 0.95, 0.88);
  K.box('indCabinet', -2.15, yj + 0.12, -0.45, -1.25, yj + 1.5, 0.45);
  K.box('indCabTrim', -2.2, yj + 1.5, -0.5, -1.2, yj + 1.58, 0.5);
  K.box('metalDark', -1.26, yj + 0.3, -0.3, -1.23, yj + 1.3, -0.02);
  for (let k = 0; k < s.slabs; k += 1) {
    const x = bx0 + k * 0.72;
    K.box('indBallast', x, yj - 1.35, -0.88, x + 0.68, yj + 0.75, 0.88);
  }
  K.box('hazard', bx0 - 0.02, yj + 0.75, -0.9, bx1 + 0.02, yj + 0.88, 0.9);
  K.cyl('metalDark', [-Lc - 0.05, yj + 0.88, 0], [-Lc - 0.05, yj + 1.3, 0], 0.025, 5);
  K.ball('lampRed', [-Lc - 0.05, yj + 1.35, 0], 0.12);

  /* The trolley: a frame between the chords, hanger plates outside them,
   * wheels on the chords, a sheave peeping out underneath. */
  K.box('craneYellowDeep', tx - 0.7, yj - 0.55, -0.72, tx + 0.7, yj - 0.12, 0.72);
  for (const sz of [-1, 1]) {
    const zp = sz * (JIB_HALF + 0.12);
    K.box('craneYellowDeep', tx - 0.6, yj - 0.5, zp - 0.02, tx + 0.6, yj + 0.28, zp + 0.02);
    K.box('craneYellowDeep', tx - 0.6, yj - 0.5, Math.min(sz * 0.72, zp), tx + 0.6, yj - 0.4, Math.max(sz * 0.72, zp));
    for (const dx of [-0.42, 0.42]) {
      K.cyl('metalDark', [tx + dx, yj + 0.17, sz * (JIB_HALF - 0.1)], [tx + dx, yj + 0.17, sz * (JIB_HALF + 0.1)], 0.1, 10);
    }
  }
  K.cyl('metalDark', [tx, yj - 0.42, -0.3], [tx, yj - 0.42, 0.3], 0.2, 12);

  /* The hook block: a striped body between two rounded yellow cheeks, a
   * sheave showing over the top, and a forged hook on a swivel. */
  K.box('hazard', tx - 0.2, hy - 0.1, -0.36, tx + 0.2, hy + 0.7, 0.36);
  const cheek = [];
  for (let k = 0; k <= 8; k += 1) {
    const a = (k / 8) * Math.PI;
    cheek.push([tx + 0.23 * Math.cos(a), hy + 0.62 + 0.23 * Math.sin(a)]);
  }
  cheek.push([tx - 0.23, hy - 0.15], [tx + 0.23, hy - 0.15]);
  K.extrude('craneYellow', cheek, -0.45, -0.36);
  K.extrude('craneYellow', cheek, 0.36, 0.45);
  K.cyl('metalDark', [tx, hy + 0.62, -0.36], [tx, hy + 0.62, 0.36], 0.2, 12);
  K.cyl('metalDark', [tx, hy - 0.1, 0], [tx, hy - 0.5, 0], 0.075, 8);
  K.cyl('metalDark', [tx, hy - 0.18, 0], [tx, hy - 0.3, 0], 0.12, 8);
  const hookGeo = cachedGeo(K, 'hookJ', (TH) => new TH.TorusGeometry(HOOK_R, HOOK_TUBE, 6, 14, HOOK_SWEEP));
  const hm = new T.Matrix4().makeRotationZ(HOOK_A0).setPosition(tx + 0.1, hy - 0.62, 0);
  K.add('metalDark', hookGeo, hm);
  K.ball('metalDark', hookArc(tx, hy).at(-1), 0.075);
}

/* ------------------------------------------------------------------ *
 * THE WATER TOWER. A round tank on four splayed legs that meet it at its
 * widest ring, the way a spherical elevated tank is carried, with two rings
 * of struts and tension rods, a walkway round the tank's lower shoulder, a
 * ladder up a leg and a curved one over the top to a railed hatch and vent.
 * The tank IS its solid, a capsule, drawn as the same capsule (a little
 * proud, never inside it).
 *
 * THE MIDDLE IS EMPTY ON PURPOSE. A real tank of this kind often has a
 * riser pipe down its axis, and this one does not: the line under the tank
 * and between the legs is the tower's flagship line (Hibari Yard names it
 * WATER TOWER), and a pipe down the middle would close it.
 * ------------------------------------------------------------------ */

function waterSpec(el) {
  const d = el.dims;
  const h = clamp(d.height, 6, 40);
  const r = clamp(d.radius, 1.5, 7);
  const len = clamp(d.tank, 0, 10);
  /* y0 is the tank's lower widest ring, where the legs meet it; y1 the
   * upper one; the walkway is a quarter radius below y0. */
  const y0 = h + r;
  const y1 = y0 + len;
  const drop = 0.25 * r;
  const rt = Math.min(1.3, 0.4 * r);
  return {
    h, r, len, y0, y1, top: y1 + r,
    foot: r + 1.2 + h * 0.04,
    legR: 0.14 + 0.025 * r,
    yb: y0 - drop,
    rb: rootOf(r * r - drop * drop),
    rt,
    yt: y1 + rootOf(r * r - rt * rt),
  };
}

/*
 * A walkway deck round a round thing, SOLID: a deck is something a quad
 * flying up under a tank or a gallery hits, so it cannot be paint. The
 * deck is drawn DECK_DEPTH deep (the channel frame a real one stands on)
 * and filled with rings of capsules of that diameter, spaced so they
 * overlap, from just outside r0 to just inside r1, all inside the drawn
 * deck: its top at y, its bottom DECK_DEPTH below.
 */
const DECK_DEPTH = 0.2;
function deckRings(P, m, y, r0, r1, n, name) {
  const rr = DECK_DEPTH / 2;
  const count = Math.max(1, Math.ceil((r1 - r0 - 2 * rr) / (2 * rr - 0.02)) + 1);
  for (let k = 0; k < count; k += 1) {
    const rad = r0 + rr + ((r1 - r0 - 2 * rr) * k) / Math.max(1, count - 1);
    for (let i = 0; i < n; i += 1) {
      const [ax, az] = around(rad, (i / n) * Math.PI * 2);
      const [bx, bz] = around(rad, ((i + 1) / n) * Math.PI * 2);
      P.cap(m, [ax, y - rr, az], [bx, y - rr, bz], rr, { draw: false, name, kind: 'wall' });
    }
  }
}

/* How far out a leg is at height y. */
function legRadius(s, y) {
  return s.foot + (s.r - 0.05 - s.foot) * (y / s.y0);
}

export function waterLayout(el) {
  const s = waterSpec(el);
  const P = new Parts();
  const legs = [];
  for (let i = 0; i < 4; i += 1) {
    const a = Math.PI / 4 + i * (Math.PI / 2);
    const [fx, fz] = around(s.foot, a);
    const [tx, tz] = around(s.r - 0.05, a);
    legs.push({ b: [fx, 0, fz], t: [tx, s.y0, tz] });
    P.cap('towerSteel', [fx, 0, fz], [tx, s.y0, tz], s.legR, { name: 'leg', kind: 'wall', seg: 10 });
  }
  /* Two rings of struts, and a pair of crossed rods in every panel under
   * them. The panels are six metres and more across, far over the gap
   * rule, which is what makes flying through the legs the line. */
  const rings = [0, 0.36, 0.7];
  for (let k = 1; k < rings.length; k += 1) {
    for (let i = 0; i < 4; i += 1) {
      const A = lerp3(legs[i].b, legs[i].t, rings[k]);
      const B = lerp3(legs[(i + 1) % 4].b, legs[(i + 1) % 4].t, rings[k]);
      P.cap('towerSteel', A, B, 0.1, { name: 'strut' });
    }
  }
  for (let k = 0; k < rings.length - 1; k += 1) {
    for (let i = 0; i < 4; i += 1) {
      const a0 = lerp3(legs[i].b, legs[i].t, rings[k]);
      const a1 = lerp3(legs[i].b, legs[i].t, rings[k + 1]);
      const b0 = lerp3(legs[(i + 1) % 4].b, legs[(i + 1) % 4].t, rings[k]);
      const b1 = lerp3(legs[(i + 1) % 4].b, legs[(i + 1) % 4].t, rings[k + 1]);
      P.cap('rod', a0, b1, 0.035, { name: 'rod' });
      P.cap('rod', b0, a1, 0.035, { name: 'rod' });
    }
  }
  /* The tank: a capsule, solid; drawn in waterDraw as a smooth lathe of
   * the same shape. */
  P.cap('tankPaint', [0, s.y0, 0], [0, s.y1, 0], s.r, { draw: false, name: 'tank', kind: 'wall' });
  /* The walkway: its deck (see deckRings), its edge and its hand rail. */
  deckRings(P, 'grating', s.yb, s.rb - 0.02, s.rb + 0.9, 16, 'walkDeck');
  const wr = s.rb + 0.9;
  const n = 16;
  for (let i = 0; i < n; i += 1) {
    const [ax, az] = around(wr, (i / n) * Math.PI * 2);
    const [bx, bz] = around(wr, ((i + 1) / n) * Math.PI * 2);
    P.cap('towerSteel', [ax, s.yb, az], [bx, s.yb, bz], 0.06, { name: 'walk' });
    P.cap('towerSteel', [ax, s.yb + 1.0, az], [bx, s.yb + 1.0, bz], 0.035, { name: 'walkRail' });
  }
  /* The rail round the hatch on top, and the vent pipe. */
  for (let i = 0; i < 8; i += 1) {
    const [ax, az] = around(s.rt, (i / 8) * Math.PI * 2);
    const [bx, bz] = around(s.rt, ((i + 1) / 8) * Math.PI * 2);
    P.cap('towerSteel', [ax, s.yt + 1.0, az], [bx, s.yt + 1.0, bz], 0.03, { name: 'topRail' });
  }
  P.cap('towerSteel', [0, s.top - 0.1, 0], [0, s.top + 0.5, 0], 0.16, { name: 'vent', seg: 8 });
  P.post('towerSteel', 0, 0, s.top + 0.7, s.top + 1.05, 0.03, { name: 'finial' });
  return P.list;
}

export function waterDraw(el, parts, K) {
  const s = waterSpec(el);
  const T = K.THREE;
  /* Feet, each with a base plate where the leg lands. */
  for (let i = 0; i < 4; i += 1) {
    const [fx, fz] = around(s.foot, Math.PI / 4 + i * (Math.PI / 2));
    K.box('concrete', fx - 0.55, 0, fz - 0.55, fx + 0.55, 0.18, fz + 0.55);
    K.box('metalDark', fx - 0.36, 0.18, fz - 0.36, fx + 0.36, 0.24, fz + 0.36);
  }

  /* The tank, a smooth lathe of the capsule, drawn 3.5 cm proud so the
   * facets between its vertices never fall inside the solid. */
  const R = s.r + 0.035;
  const pts = [];
  const N = 8;
  for (let k = 0; k <= N; k += 1) {
    const a = -Math.PI / 2 + (k / N) * (Math.PI / 2);
    pts.push(new T.Vector2(Math.max(0.001, R * Math.cos(a)), s.y0 + R * Math.sin(a)));
  }
  for (let k = s.len > 0.01 ? 0 : 1; k <= N; k += 1) {
    const a = (k / N) * (Math.PI / 2);
    pts.push(new T.Vector2(Math.max(0.001, R * Math.cos(a)), s.y1 + R * Math.sin(a)));
  }
  K.add('indTank', new T.LatheGeometry(pts, 32));

  /* The painted band with the town's name, where the tank is upright. */
  const e = Math.min(0.55, 0.3 * s.r);
  K.wrap('tankBand', [0, (s.y0 + s.y1) / 2, 0], s.r + 0.06, s.len + 2 * e);

  /* The walkway: a ring of grating, posts, a mid rail, a toe plate, and
   * brackets back to the tank under it. */
  K.ring('grating', [0, s.yb, 0], s.rb - 0.06, s.rb + 0.95, DECK_DEPTH);
  const wr = s.rb + 0.9;
  const toe = new T.CylinderGeometry(wr + 0.02, wr + 0.02, 0.14, 32, 1, true);
  toe.translate(0, s.yb + 0.07, 0);
  K.add('towerSteel', toe);
  const mid = [];
  for (let i = 0; i <= 16; i += 1) {
    const a = (i / 16) * Math.PI * 2;
    const [x, z] = [Math.cos(a) * wr, Math.sin(a) * wr];
    mid.push([x, s.yb + 0.5, z]);
    if (i < 16) {
      K.cyl('towerSteel', [x, s.yb, z], [x, s.yb + 1.0, z], 0.025, 4);
    }
  }
  polyline(K, 'towerSteel', mid, 0.02, 4);
  const yk = s.yb - 0.9;
  const rk = Math.sqrt(Math.max(0.01, s.r * s.r - (s.y0 - yk) * (s.y0 - yk)));
  for (let i = 0; i < 16; i += 1) {
    const a = ((i + 0.5) / 16) * Math.PI * 2;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    K.cyl('towerSteel', [c * rk, yk, sn * rk], [c * (wr - 0.05), s.yb - 0.06, sn * (wr - 0.05)], 0.035, 4);
  }

  /* A ladder up the first leg, through the walkway. */
  const la = Math.PI / 4;
  const lx = (r, y) => [Math.cos(la) * (r + 0.4), y, Math.sin(la) * (r + 0.4)];
  K.ladder('rod', lx(legRadius(s, 0.4), 0.4), lx(legRadius(s, s.yb + 1.0), s.yb + 1.0), 0.45);

  /* And a curved one over the tank, from the walkway to the hatch: its
   * rails follow the tank a hand's width off, so it bends with it. */
  const ca = la + 0.32;
  const out = [Math.cos(ca), Math.sin(ca)];
  const side = [-Math.sin(ca), Math.cos(ca)];
  const path = [];
  const Ro = s.r + 0.28;
  const tb = Math.asin((s.yb - s.y0) / s.r);
  for (let k = 0; k <= 2; k += 1) {
    const t = tb * (1 - k / 2);
    path.push([Ro * Math.cos(t), s.y0 + Ro * Math.sin(t)]);
  }
  const tt = Math.acos(Math.min(1, (s.rt + 0.2) / s.r));
  for (let k = 0; k <= 7; k += 1) {
    const t = (k / 7) * tt;
    path.push([Ro * Math.cos(t), s.y1 + Ro * Math.sin(t)]);
  }
  for (const sd of [-0.22, 0.22]) {
    polyline(K, 'rod', path.map(([rr, y]) => [out[0] * rr + side[0] * sd, y, out[1] * rr + side[1] * sd]), 0.025, 4);
  }
  for (let k = 0; k + 1 < path.length; k += 1) {
    const [r0, y0] = path[k];
    const [r1, y1] = path[k + 1];
    const steps = Math.max(1, Math.round(Math.hypot(r1 - r0, y1 - y0) / 0.32));
    for (let j = 0; j < steps; j += 1) {
      const t = j / steps;
      const rr = r0 + (r1 - r0) * t;
      const y = y0 + (y1 - y0) * t;
      K.cyl('rod', [out[0] * rr - side[0] * 0.22, y, out[1] * rr - side[1] * 0.22], [out[0] * rr + side[0] * 0.22, y, out[1] * rr + side[1] * 0.22], 0.015, 3);
    }
  }

  /* The top: hatch, rail posts, the vent's cap, the finial lamp. */
  K.box('metalDark', -0.4, s.top - 0.15, -0.4, 0.4, s.top + 0.1, 0.4);
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    K.cyl('towerSteel', [Math.cos(a) * s.rt, s.yt - 0.1, Math.sin(a) * s.rt], [Math.cos(a) * s.rt, s.yt + 1.0, Math.sin(a) * s.rt], 0.025, 4);
  }
  K.cone('towerSteel', [0, s.top + 0.45, 0], 0.42, 0.28, 10);
  K.ball('lampRed', [0, s.top + 1.12, 0], 0.11);
  /* A keep out plate on the ladder's leg, facing out. */
  const pl = lx(legRadius(s, 1.9) + 0.02, 1.9);
  K.townSign('warningPlate', 1, pl[0] + 0.06, 1.9, pl[2] - 0.5, 0.3, 0.6, '+x');
}

/* ------------------------------------------------------------------ *
 * THE LATTICE MAST. A triangular radio mast in the red and white bands an
 * aviation authority asks for, with a railed triangular head frame, six
 * panel antennas, two drum radomes on the legs, a cable tray, a ladder, and
 * a fenced foot with its site plate. Every band of every leg is its own
 * solid, so the paint and the physics are the same pieces.
 *
 * The faces are a Warren truss, diagonals with no horizontals: that leaves
 * every opening a triangle of at least 1.4 m, so a mast wide enough to fly
 * into is wide enough to fly through.
 * ------------------------------------------------------------------ */

function mastSpec(el) {
  const d = el.dims;
  const H = clamp(d.height, 8, 90);
  const w = clamp(d.width, 1.0, 4);
  /* The legs' circle: a face of width w is a chord of it, w / sqrt(3). */
  const R = w * 0.5773502691896258;
  return { H, w, R, bands: 7, yh: H - 1.2, Rh: R + 1.0 };
}

/* The legs' azimuths, and the radome positions. */
const MAST_LEG = (i) => (i / 3) * Math.PI * 2;

function mastBandMat(s, y) {
  const b = clamp(Math.floor(y / (s.H / s.bands)), 0, s.bands - 1);
  return b % 2 === 0 ? 'mastRed' : 'mastWhite';
}

export function mastLayout(el) {
  const s = mastSpec(el);
  const P = new Parts();
  const legs = [0, 1, 2].map((i) => around(s.R, MAST_LEG(i)));
  const bandH = s.H / s.bands;
  for (let b = 0; b < s.bands; b += 1) {
    const m = b % 2 === 0 ? 'mastRed' : 'mastWhite';
    for (const [x, z] of legs) {
      P.cap(m, [x, b * bandH, z], [x, (b + 1) * bandH, z], 0.1, { name: 'leg' });
    }
  }
  /* The braces, one continuous Warren zigzag per face, each diagonal in
   * the colour of the band its middle is in. */
  const panels = Math.max(2, Math.round(s.H / (s.w * 1.15)));
  for (let i = 0; i < 3; i += 1) {
    const [ax, az] = legs[i];
    const [bx, bz] = legs[(i + 1) % 3];
    for (let k = 0; k < panels; k += 1) {
      const y0 = (k / panels) * s.H;
      const y1 = ((k + 1) / panels) * s.H;
      const p = k % 2 === 0 ? [ax, y0, az] : [ax, y1, az];
      const q = k % 2 === 0 ? [bx, y1, bz] : [bx, y0, bz];
      P.cap(mastBandMat(s, (y0 + y1) / 2), p, q, 0.042, { name: 'brace' });
    }
  }
  /* The head frame: a triangle a metre outside the legs, tied back to
   * them level and from below, with a hand rail round it. */
  const corners = [0, 1, 2].map((i) => around(s.Rh, MAST_LEG(i)));
  for (let i = 0; i < 3; i += 1) {
    const [cx, cz] = corners[i];
    const [dx, dz] = corners[(i + 1) % 3];
    const [lx, lz] = legs[i];
    P.cap('mastWhite', [cx, s.yh, cz], [dx, s.yh, dz], 0.05, { name: 'headFrame' });
    P.cap('mastWhite', [cx, s.yh + 1.0, cz], [dx, s.yh + 1.0, dz], 0.035, { name: 'headRail' });
    P.cap('mastWhite', [lx, s.yh, lz], [cx, s.yh, cz], 0.05, { name: 'headFrame' });
    P.cap('mastWhite', [lx, s.yh - 1.4, lz], [cx, s.yh, cz], 0.04, { name: 'headFrame' });
    P.cap('mastWhite', [cx, s.yh, cz], [cx, s.yh + 1.0, cz], 0.035, { name: 'headRail' });
  }
  /* The head frame's deck, SOLID: drawn DECK_DEPTH deep in mastDraw, from
   * the triangle just inside the legs to just outside the frame, and
   * filled here with two capsules along each side, parallel to it. A line
   * parallel to a side of an equilateral triangle at a distance d from its
   * centre runs between the corners of the triangle of circumradius 2d. */
  const hole = mastDeckHole(s);
  for (const d of [hole / 2 + 0.12, hole / 2 + 0.33]) {
    const c = [0, 1, 2].map((i) => around(2 * d, MAST_LEG(i)));
    for (let i = 0; i < 3; i += 1) {
      const a = c[i];
      const b = c[(i + 1) % 3];
      P.cap('grating', [a[0], s.yh - 0.08, a[1]], [b[0], s.yh - 0.08, b[1]], 0.1, { draw: false, name: 'headDeck', kind: 'wall' });
    }
  }
  /* Six panel antennas, two on each side of the head frame, facing out:
   * drawn as panels 0.32 x 1.5 x 0.12 in mastDraw, solid as a thin upright
   * capsule inside each. */
  for (const a of mastPanels(s)) {
    P.cap('indAntenna', [a.x, s.yh + 0.72, a.z], [a.x, s.yh + 1.88, a.z], 0.055, { draw: false, name: 'antenna' });
  }
  /* The two radomes: drums 0.5 m round and 0.45 deep, solid as a cross of
   * capsules in the plane of the drum. */
  for (const d of mastDishes(s)) {
    const up = [0, 0.28, 0];
    const across = [-d.dir[1] * 0.28, 0, d.dir[0] * 0.28];
    P.cap('indRadome', [d.c[0] - up[0], d.c[1] - up[1], d.c[2] - up[2]], [d.c[0] + up[0], d.c[1] + up[1], d.c[2] + up[2]], 0.21, { draw: false, name: 'dish', kind: 'obstacle' });
    P.cap('indRadome', [d.c[0] - across[0], d.c[1], d.c[2] - across[2]], [d.c[0] + across[0], d.c[1], d.c[2] + across[2]], 0.21, { draw: false, name: 'dish', kind: 'obstacle' });
  }
  P.post('mastWhite', 0, 0, s.H - 0.2, s.H + 3.0, 0.05, { name: 'lightningRod' });
  for (const [x, z] of legs) {
    P.cap('mastWhite', [x, s.H, z], [0, s.H - 0.2, 0], 0.05, { name: 'crown' });
  }
  return P.list;
}

/* The circumradius of the head deck's hole, which the mast passes up. */
function mastDeckHole(s) {
  return Math.max(0.2, s.R - 0.12);
}

/* Where the panel antennas stand: a third and two thirds along each side
 * of the head frame, 0.15 m out, facing out. */
function mastPanels(s) {
  const out = [];
  for (let i = 0; i < 3; i += 1) {
    const [cx, cz] = around(s.Rh, MAST_LEG(i));
    const [dx, dz] = around(s.Rh, MAST_LEG(i + 1));
    const face = MAST_LEG(i) + Math.PI / 3;
    const [nx, nz] = around(1, face);
    for (const t of [0.33, 0.67]) {
      out.push({ x: cx + (dx - cx) * t + nx * 0.15, z: cz + (dz - cz) * t + nz * 0.15, face });
    }
  }
  return out;
}

/* The radomes: on the second and third legs, facing out along them. */
function mastDishes(s) {
  return [[1, 0.62], [2, 0.45]].map(([leg, f]) => {
    const [dx, dz] = around(1, MAST_LEG(leg));
    const rr = s.R + 0.56;
    return { c: [dx * rr, s.H * f, dz * rr], dir: [dx, dz], leg };
  });
}

export function mastDraw(el, parts, K) {
  const s = mastSpec(el);
  const T = K.THREE;
  const legs = [0, 1, 2].map((i) => around(s.R, MAST_LEG(i)));
  /* The pad and a pier under each leg. */
  K.box('concrete', -s.R - 1.0, 0, -s.R - 1.0, s.R + 1.0, 0.1, s.R + 1.0);
  for (const [x, z] of legs) {
    K.box('concrete', x - 0.3, 0.1, z - 0.3, x + 0.3, 0.22, z + 0.3);
    /* Bolted flanges where the leg sections meet, at every band. */
    for (let b = 1; b < s.bands; b += 1) {
      const y = (b * s.H) / s.bands;
      K.cyl('metalDark', [x, y - 0.06, z], [x, y + 0.06, z], 0.13, 6);
    }
  }
  /* The head frame's deck, a triangle with the mast up through it, as
   * deep as its solid (see mastLayout). The shape is drawn in (x, -z) and
   * extruded up, which a quarter turn about x lays flat. */
  const tri = (rad) => [0, 1, 2].map((i) => around(rad, MAST_LEG(i)));
  const shape = new T.Shape();
  const o = tri(s.Rh + 0.08);
  shape.moveTo(o[0][0], -o[0][1]);
  shape.lineTo(o[1][0], -o[1][1]);
  shape.lineTo(o[2][0], -o[2][1]);
  shape.closePath();
  const hole = new T.Path();
  const hi = tri(mastDeckHole(s));
  hole.moveTo(hi[0][0], -hi[0][1]);
  hole.lineTo(hi[2][0], -hi[2][1]);
  hole.lineTo(hi[1][0], -hi[1][1]);
  hole.closePath();
  shape.holes.push(hole);
  const deckGeo = new T.ExtrudeGeometry(shape, { depth: DECK_DEPTH, bevelEnabled: false });
  deckGeo.rotateX(-Math.PI / 2);
  deckGeo.translate(0, s.yh + 0.02 - DECK_DEPTH, 0);
  K.add('grating', deckGeo);
  /* The antennas on their pipes, each with a radio unit behind it. */
  for (const a of mastPanels(s)) {
    const yaw = Math.PI / 2 - a.face;
    const [nx, nz] = [Math.cos(a.face), Math.sin(a.face)];
    K.cyl('rod', [a.x - nx * 0.14, s.yh, a.z - nz * 0.14], [a.x - nx * 0.14, s.yh + 2.3, a.z - nz * 0.14], 0.04, 6);
    turnedBox(K, 'indAntenna', [a.x, s.yh + 1.3, a.z], 0.32, 1.5, 0.12, yaw);
    turnedBox(K, 'indRadomeRim', [a.x - nx * 0.24, s.yh + 0.95, a.z - nz * 0.24], 0.26, 0.42, 0.14, yaw);
  }
  /* The radomes: a grey drum, a white face, a housing behind, two arms
   * back to the leg. */
  for (const d of mastDishes(s)) {
    const f = [d.dir[0], 0, d.dir[1]];
    const at = (o) => [d.c[0] + f[0] * o, d.c[1], d.c[2] + f[2] * o];
    K.cyl('indRadomeRim', at(-0.225), at(0.2), 0.5, 18);
    K.cyl('indRadome', at(0.2), at(0.235), 0.47, 18);
    K.dish('indRadomeRim', at(-0.225), 0.36, [-f[0], 0, -f[2]]);
    const [lx, lz] = legs[d.leg];
    for (const dy of [-0.3, 0.3]) {
      K.cyl('rod', [lx, d.c[1] + dy, lz], [d.c[0] - f[0] * 0.2, d.c[1] + dy, d.c[2] - f[2] * 0.2], 0.035, 5);
    }
  }
  /* The cable tray up the inside of the first face. */
  const trayAt = around(s.R / 2 - 0.14, Math.PI / 3);
  turnedBox(K, 'rod', [trayAt[0], s.yh / 2 + 0.3, trayAt[1]], 0.18, s.yh - 0.6, 0.025, Math.PI / 6);
  /* A ladder up the third leg, outside it. */
  const [ax, az] = around(s.R + 0.3, MAST_LEG(2));
  K.ladder('rod', [ax, 0.22, az], [ax, s.yh, az], 0.42);
  /* Obstruction lamps: the top, halfway on each leg, the head frame. */
  K.ball('lampRed', [0, s.H + 3.05, 0], 0.14);
  for (const [x, z] of legs) {
    K.ball('lampRed', [x * (1 + 0.12 / s.R), s.H * 0.5, z * (1 + 0.12 / s.R)], 0.1);
  }
  for (const [x, z] of tri(s.Rh)) {
    K.ball('lampRed', [x, s.yh + 1.12, z], 0.08);
  }
  /* The site plate and a keep out plate on the first leg, facing +x. */
  K.sign('indMastPlate', s.R + 0.1, 1.5, 0, 0.64, 0.4, '+x', 0);
  K.townSign('warningPlate', 1, s.R + 0.1, 2.35, 0, 0.26, 0.52, '+x');
}

/* ------------------------------------------------------------------ *
 * THE CHIMNEY. A tapering brick stack on a darker foot course, iron hoops
 * up it, a corbelled cap with a dark flue, a caged ladder, a lightning
 * conductor. A short one is a bathhouse's, with its name down the stack in
 * white under the hot spring mark; a tall one wears the red and white
 * rings and a railed gallery with lamps.
 *
 * SOLID AS THE BRICK IS DRAWN, to within a few centimetres, and never over
 * the rim. It turns freely, so it is all capsules (chimneyLayout says how).
 * ------------------------------------------------------------------ */

/* The steepest a stack tapers, in metres of radius a metre. The town's
 * stacks narrow to 0.7 of their base; on a short fat stack that is a lean
 * no upright capsule can follow closely without its round top standing
 * out of the brick above it, and a real stack's batter is a few
 * centimetres a metre, so a squat one tapers less rather than more. Every
 * stack of the default's proportions is untouched by it. */
const CHIMNEY_TAPER_MAX = 0.06;
/* The drawn stack's sides. At 32 its flats stand at cos(pi / 32), 0.9952
 * of its radius, which is where CHIMNEY_FIT keeps the solids. */
const CHIMNEY_SEG = 32;
const CHIMNEY_FIT = 0.995;
/* The foot course, 5 cm proud at the plinth and 3 at its top; the corbel,
 * 0.14 proud over its top 0.9 m on a 45 degree underside. */
const FOOT_Y0 = 0.18;
const FOOT_Y1 = 1.9;
const FOOT_OUT0 = 0.05;
const FOOT_OUT1 = 0.03;
const CORBEL_OUT = 0.14;

function chimneySpec(el) {
  const d = el.dims;
  const H = clamp(d.height, 6, 80);
  const r0 = clamp(d.radius, 0.5, 5);
  return {
    H, r0, r1: 0.3 * r0 <= CHIMNEY_TAPER_MAX * H ? r0 * 0.7 : r0 - CHIMNEY_TAPER_MAX * H,
    banded: H >= 30,
    named: H >= 12 && H < 40,
    gallery: H >= 16,
    yg: H - 4.5,
  };
}

function chimneyR(s, y) {
  return s.r0 + (s.r1 - s.r0) * (y / s.H);
}

/* The brick's outer radius at height y as chimneyDraw draws it: the foot
 * course, the shaft, the corbel's underside and the corbel. */
function chimneyOuter(s, y) {
  const R = chimneyR(s, y);
  if (y < FOOT_Y1) {
    const t = y < FOOT_Y0 ? 0 : (y - FOOT_Y0) / (FOOT_Y1 - FOOT_Y0);
    return R + FOOT_OUT0 + (FOOT_OUT1 - FOOT_OUT0) * t;
  }
  const flare = s.H - 0.9 - CORBEL_OUT;
  if (y <= flare) {
    return R;
  }
  return R + (y < s.H - 0.9 ? y - flare : CORBEL_OUT);
}

/* The name's characters: their size and the height of each centre. */
function chimneyName(s) {
  if (!s.named) {
    return [];
  }
  /* Under the gallery, or under the soot on a stack too short for one. */
  const top = s.gallery ? s.yg - 0.8 : s.H - 3.7;
  const out = [];
  for (let k = 0; k < 5; k += 1) {
    /* As big as a flat plate on a round stack allows: 1.2 radii tall and
     * 0.8 of that wide. A flat plate cannot curve with the stack, so the
     * outer edges of a condensed glyph stand about 0.08 radii off the
     * brick, eight centimetres on a metre radius: invisible at the range
     * a name is read from, visible only skimming past at a metre. */
    const cs = clamp(1.2 * chimneyR(s, top), 0.7, 2.8);
    const y = top - cs * 0.55 - k * cs * 1.06;
    if (y - cs / 2 < 2.4) {
      break;
    }
    out.push({ k, y, cs });
  }
  return out.length >= 3 ? out : [];
}

/* A horizontal ring of `n` capsules round the axis at height y. */
function ringOf(P, rad, y, rc, n, name) {
  for (let i = 0; i < n; i += 1) {
    const [ax, az] = around(rad, (i / n) * Math.PI * 2);
    const [bx, bz] = around(rad, ((i + 1) / n) * Math.PI * 2);
    P.cap('brick', [ax, y, az], [bx, y, bz], rc, { draw: false, name, kind: 'wall' });
  }
}

/* Sides for a ring of radius rad whose chords sag at most 2 cm inside its
 * circle: 1 - cos(pi / n) is under (pi / n)^2 / 2, so n >= pi sqrt(25 rad). */
function ringSides(rad) {
  return Math.max(8, Math.ceil(Math.PI * rootOf(25 * rad)));
}

export function chimneyLayout(el) {
  const s = chimneySpec(el);
  const P = new Parts();
  const H = s.H;
  const k = (s.r0 - s.r1) / H;
  P.cap('brick', [0, 0, 0], [0, H - 0.05, 0], s.r0, { rTop: chimneyR(s, H - 0.05), solid: false, seg: CHIMNEY_SEG, name: 'stackDraw' });

  /*
   * THE SHAFT: upright capsules on the axis, chained end to end, each as
   * thick as the stack is at the section's top, where it is thinnest. Its
   * round top then sits against the leaning wall over it, so the radius is
   * also drawn in by that lean, 1 / sqrt(1 + k^2), or the dome would stand
   * out of the brick a metre up. A section is as long as keeps its foot,
   * where the drawn brick stands furthest out of it, within SHORT: 7 cm,
   * where three long sections left half a metre. The last one stops where
   * its dome meets the underside of the rim, rather than collapsing to a
   * ball that stood two metres over a squat stack.
   */
  const SHORT = 0.07;
  const fit = CHIMNEY_FIT / rootOf(1 + k * k);
  const cap = H - 0.02;
  const topAt = (cap - fit * s.r0) / (1 - fit * k);
  let ya = 0;
  for (let n = 0; n < 400; n += 1) {
    const proud = chimneyOuter(s, ya < FOOT_Y0 ? FOOT_Y0 : ya) - fit * chimneyR(s, ya);
    let yb = ya + clamp((SHORT - proud) / (fit * k), 0.1, H);
    const last = yb >= topAt;
    if (last) {
      yb = topAt > ya + 0.1 ? topAt : ya + 0.1;
    }
    const r = Math.min(fit * chimneyR(s, yb), cap - yb);
    P.cap('brick', [0, ya, 0], [0, yb, 0], r, { draw: false, name: 'stack', kind: 'wall' });
    if (last) {
      break;
    }
    ya = yb;
  }

  /*
   * THE CAP. The top metre, the corbel and its underside, is rings of
   * capsules round the axis, 0.2 m round and 0.2 m apart, so the groove
   * between two is 2.7 cm and no slot at all, with the shaft's last dome
   * filling the middle under them. Each ring stands as far out as the
   * brick lets it over its whole height, so the ones in the corbel are
   * the corbel's size: a pilot skimming up the stack or over the cap meets
   * the corbel where it is drawn rather than sinking into it.
   */
  const rc = 0.2;
  const reach = (yc, r) => {
    let out = Infinity;
    for (let i = 0; i <= 12; i += 1) {
      const t = i / 6 - 1;
      out = Math.min(out, CHIMNEY_FIT * chimneyOuter(s, yc + t * r) - r * rootOf(1 - t * t));
    }
    return out;
  };
  const rings = 5;
  const lowest = H - rc * rings;
  let rimRad = 0;
  for (let j = 0; j < rings; j += 1) {
    const yc = H - rc * (j + 1);
    const rad = reach(yc, rc);
    ringOf(P, rad, yc, rc, ringSides(rad), 'rim');
    if (j === 0) {
      rimRad = rad;
    }
  }
  /* And two thin ones where a 0.2 m ring cannot reach into the brick's
   * corners: the rim's outer edge, which it rounds off by 8 cm, and the
   * corbel's underside, where the one below it is held in by the shaft's
   * wall and the one above by the corbel's face. */
  for (const [yc, r] of [[H - 0.08, 0.08], [H - 0.95, 0.1]]) {
    const rad = reach(yc, r);
    ringOf(P, rad, yc, r, ringSides(rad), 'rim');
  }
  /*
   * A wide stack's shaft stops well under the corbel, its radius under the
   * rim, and the wall between is held by staves: capsules up the wall
   * that lean with it, as many round as keeps the groove between two to
   * 4 cm. One stave a line of wall rather than one ring a hand's height,
   * which on a stack ten metres across is seventy capsules and not seven
   * hundred.
   */
  if (topAt < lowest - rc) {
    const rs = clamp(0.12 * chimneyR(s, topAt), 0.2, 0.5);
    const ys0 = topAt - rs;
    const ys1 = lowest;
    const lean = rs * rootOf(1 + k * k);
    const in0 = CHIMNEY_FIT * chimneyR(s, ys0) - lean;
    const in1 = CHIMNEY_FIT * chimneyR(s, ys1) - lean;
    const gap = 2 * rootOf(rs * rs - (rs - 0.04) * (rs - 0.04));
    const n = Math.max(8, Math.ceil((Math.PI * 2 * in0) / gap));
    for (let i = 0; i < n; i += 1) {
      const [c0, s0] = around(1, (i / n) * Math.PI * 2);
      P.cap('brick', [c0 * in0, ys0, s0 * in0], [c0 * in1, ys1, s0 * in1], rs, { draw: false, name: 'stave', kind: 'wall' });
    }
  }
  /*
   * THE FLUE IS LIDDED, on purpose: bars across the top ring, their tops
   * level with the rim, so a pilot who lands on the chimney sits on the
   * dark disc drawn there. Left open it would drop a craft into a stack
   * nothing is drawn inside.
   */
  const rl = clamp(0.08 * rimRad, 0.2, 0.4);
  const ends = rimRad + rc - rl;
  const bars = Math.max(1, Math.ceil((2 * ends) / rl));
  for (let i = 0; i < bars; i += 1) {
    const z = (i - (bars - 1) / 2) * rl;
    const half = rootOf(Math.max(0, ends * ends - z * z));
    P.cap('brick', [-half, H - rl, z], [half, H - rl, z], rl, { draw: false, name: 'lid', kind: 'wall' });
  }

  if (s.gallery) {
    const rs = chimneyR(s, s.yg);
    const rg = rs + 0.85;
    const n = 12;
    deckRings(P, 'grating', s.yg + 0.05, rs - 0.02, rg, n, 'galleryDeck');
    for (let i = 0; i < n; i += 1) {
      const [ax, az] = around(rg, (i / n) * Math.PI * 2);
      const [bx, bz] = around(rg, ((i + 1) / n) * Math.PI * 2);
      P.cap('towerSteel', [ax, s.yg, az], [bx, s.yg, bz], 0.045, { name: 'gallery' });
      P.cap('towerSteel', [ax, s.yg + 1.0, az], [bx, s.yg + 1.0, bz], 0.03, { name: 'galleryRail' });
    }
  }
  return P.list;
}

export function chimneyDraw(el, parts, K) {
  const s = chimneySpec(el);
  const R = (y) => chimneyR(s, y);
  /* Every band as many sided as the stack, so a band 2 cm proud of it is
   * 2 cm proud at every corner. */
  const band = (mat, y0, y1, out) => K.cyl(mat, [0, y0, 0], [0, y1, 0], R(y0) + out, CHIMNEY_SEG, R(y1) + out);
  /* The plinth and the foot course, chimneyOuter's. */
  K.box('concrete', -s.r0 - 0.7, 0, -s.r0 - 0.7, s.r0 + 0.7, 0.18, s.r0 + 0.7);
  K.cyl('indBrickDark', [0, FOOT_Y0, 0], [0, FOOT_Y1, 0], R(FOOT_Y0) + FOOT_OUT0, CHIMNEY_SEG, R(FOOT_Y1) + FOOT_OUT1);
  /* The name, or nothing, where the hoops would cross it. */
  const name = chimneyName(s);
  const clear = (y) => !name.some((c) => Math.abs(c.y - y) < c.cs * 0.6);
  const hoopTop = s.banded ? s.H - 4.8 : s.H - 3.6;
  for (let y = 3.2; y < hoopTop; y += 3.2) {
    if (clear(y)) {
      band('indHoop', y, y + 0.16, 0.05);
    }
  }
  /* Down all four faces, so it faces the pilot from wherever they come. */
  for (const c of name) {
    const o = R(c.y) + 0.03;
    const w = c.cs * 0.8;
    K.sign('indChimneyChar', o, c.y, 0, w, c.cs, '+x', c.k);
    K.sign('indChimneyChar', -o, c.y, 0, w, c.cs, '-x', c.k);
    K.sign('indChimneyChar', 0, c.y, o, w, c.cs, '+z', c.k);
    K.sign('indChimneyChar', 0, c.y, -o, w, c.cs, '-z', c.k);
  }
  /* The top: soot, or the warning rings; then the corbel and the flue. */
  if (s.banded) {
    for (let k = 0; k < 3; k += 1) {
      const y = s.H - 4.5 + k * 1.2;
      band(k % 2 === 0 ? 'mastRed' : 'mastWhite', y, y + 1.2, 0.035);
    }
  } else {
    band('indSoot', s.H - 3.0, s.H - 2.0, 0.02);
    band('indSootDeep', s.H - 2.0, s.H - 0.9 - CORBEL_OUT, 0.02);
  }
  /* The corbel's 45 degree underside and the corbel. The stack itself
   * stops 5 cm inside the corbel (the stackDraw part), so the corbel's
   * top is the only surface at the rim: level with it, the two tops fought
   * over the whole disc. The flue sinks a centimetre into the corbel's top
   * for the same reason. */
  const flare = s.H - 0.9 - CORBEL_OUT;
  K.cyl('indBrickDark', [0, flare, 0], [0, s.H - 0.9, 0], R(flare) + 0.005, CHIMNEY_SEG, R(s.H - 0.9) + CORBEL_OUT);
  band('indBrickDark', s.H - 0.9, s.H, CORBEL_OUT);
  K.cyl('indFlue', [0, s.H - 0.01, 0], [0, s.H + 0.02, 0], s.r1 - 0.12, 20);
  /* Three lightning spikes on the rim, and the conductor down the back. */
  for (let k = 0; k < 3; k += 1) {
    const a = (k / 3) * Math.PI * 2 + 0.5;
    const rr = s.r1 + 0.05;
    K.cyl('metalDark', [Math.cos(a) * rr, s.H - 0.2, Math.sin(a) * rr], [Math.cos(a) * rr, s.H + 0.9, Math.sin(a) * rr], 0.02, 4);
  }
  /* The conductor down one diagonal, and on the opposite one the ladder,
   * clear of the name, with a safety cage from head height. */
  const cd = [-Math.SQRT1_2, -Math.SQRT1_2];
  K.cyl('indHoop', [cd[0] * (R(0.18) + 0.08), 0.18, cd[1] * (R(0.18) + 0.08)], [cd[0] * (R(1.9) + 0.06), 1.9, cd[1] * (R(1.9) + 0.06)], 0.02, 4);
  K.cyl('indHoop', [cd[0] * (R(1.9) + 0.06), 1.9, cd[1] * (R(1.9) + 0.06)], [cd[0] * (R(s.H - 0.2) + 0.16), s.H - 0.2, cd[1] * (R(s.H - 0.2) + 0.16)], 0.02, 4);
  const out = [Math.SQRT1_2, Math.SQRT1_2];
  const across = [-Math.SQRT1_2, Math.SQRT1_2];
  const lad = (y, o, a) => [out[0] * (R(y) + 0.3 + o) + across[0] * a, y, out[1] * (R(y) + 0.3 + o) + across[1] * a];
  K.ladder('rod', lad(0.2, 0.05, 0), lad(s.H - 0.3, 0, 0), 0.42);
  const cageTop = s.H - 1.2;
  const bars = [0.35, 0.9, 1.57, 2.24, 2.79];
  for (let y = 2.6; y < cageTop; y += 1.1) {
    const hoop = [];
    for (let k = 0; k <= 4; k += 1) {
      const a = (k / 4) * Math.PI;
      hoop.push(lad(y, Math.sin(a) * 0.36, Math.cos(a) * 0.36));
    }
    polyline(K, 'rod', hoop, 0.016, 3);
  }
  for (const a of bars) {
    K.cyl('rod', lad(2.6, Math.sin(a) * 0.36, Math.cos(a) * 0.36), lad(cageTop, Math.sin(a) * 0.36, Math.cos(a) * 0.36), 0.013, 3);
  }
  /* The gallery: grating, posts, mid rail, brackets, and its lamps. */
  if (s.gallery) {
    const rs = R(s.yg);
    const rg = rs + 0.85;
    K.ring('grating', [0, s.yg + 0.05, 0], rs - 0.05, rg + 0.08, DECK_DEPTH);
    const mid = [];
    for (let i = 0; i <= 12; i += 1) {
      const a = (i / 12) * Math.PI * 2;
      const [x, z] = [Math.cos(a) * rg, Math.sin(a) * rg];
      mid.push([x, s.yg + 0.5, z]);
      if (i < 12) {
        K.cyl('towerSteel', [x, s.yg, z], [x, s.yg + 1.0, z], 0.025, 4);
        const b = (a + Math.PI / 12);
        K.cyl('towerSteel', [Math.cos(b) * (R(s.yg - 0.8) + 0.02), s.yg - 0.8, Math.sin(b) * (R(s.yg - 0.8) + 0.02)], [Math.cos(b) * (rg - 0.05), s.yg - 0.03, Math.sin(b) * (rg - 0.05)], 0.03, 4);
      }
    }
    polyline(K, 'towerSteel', mid, 0.02, 4);
    for (let k = 0; k < 3; k += 1) {
      const a = (k / 3) * Math.PI * 2 + Math.PI / 2;
      K.ball('lampRed', [Math.cos(a) * rg, s.yg + 1.1, Math.sin(a) * rg], 0.1);
    }
  }
}

/* ------------------------------------------------------------------ *
 * THE POWER PYLON. A tapering four legged lattice with three pairs of
 * lattice cross arms and insulator strings. The wires between pylons are
 * drawn by the map, which knows where the neighbours are, from the bottom
 * of each insulator string and the peak (src/maps/built/index.js reads
 * those points off this layout: keep them where they are).
 * ------------------------------------------------------------------ */

function pylonSpec(el) {
  const d = el.dims;
  const H = clamp(d.height, 12, 60);
  return { H, b0: H * 0.11, b1: 0.9, arms: [0.62, 0.76, 0.9] };
}

function pylonAt(s, c, y) {
  const t = y / s.H;
  const h = s.b0 + (s.b1 - s.b0) * t;
  return [c[0] * h, y, c[1] * h];
}

const PYLON_CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

export function pylonLayout(el) {
  const s = pylonSpec(el);
  const P = new Parts();
  const m = 'pylon';
  const at = (c, y) => pylonAt(s, c, y);
  const top = s.H * 0.92;
  for (const c of PYLON_CORNERS) {
    P.cap(m, at(c, 0), at(c, top), 0.1, { name: 'leg' });
  }
  /* The body: a zigzag and a horizontal at every panel. The lower panels
   * are the widest openings on the map, and the line through the body. */
  const panels = Math.max(3, Math.round(top / 3.2));
  for (let i = 0; i < 4; i += 1) {
    const a0 = at(PYLON_CORNERS[i], 0);
    const a1 = at(PYLON_CORNERS[i], top);
    const b0 = at(PYLON_CORNERS[(i + 1) % 4], 0);
    const b1 = at(PYLON_CORNERS[(i + 1) % 4], top);
    P.zigzag(m, a0, a1, b0, b1, panels, 0.045, { name: 'brace' });
    P.rungs(m, a0, a1, b0, b1, panels, 0.04, { name: 'rung' });
  }
  /* The peak, carrying the earth wire. */
  const peak = [0, s.H, 0];
  for (const c of PYLON_CORNERS) {
    P.cap(m, at(c, top), peak, 0.06, { name: 'peak' });
  }
  /* The cross arms, out along x both ways: two bottom chords and a top
   * chord meeting at the tip, braced on their three faces, with a string
   * of insulators hanging from the tip. */
  s.arms.forEach((f, k) => {
    const y = s.H * f;
    const reach = k === 1 ? 5.2 : 4.2;
    const h = at([1, 1], y)[0];
    for (const side of [-1, 1]) {
      const tip = [side * reach, y, 0];
      const lo0 = [side * h, y, -h];
      const lo1 = [side * h, y, h];
      const hi = [side * h, y + 1.4, 0];
      P.cap(m, lo0, tip, 0.06, { name: 'arm' });
      P.cap(m, lo1, tip, 0.06, { name: 'arm' });
      P.cap(m, hi, tip, 0.05, { name: 'arm' });
      for (const [u, v] of [[lo0, hi], [lo1, hi], [lo0, lo1]]) {
        const pa = lerp3(u, tip, 0.34);
        const pb = lerp3(v, tip, 0.34);
        const pc = lerp3(u, tip, 0.67);
        P.cap(m, u, pb, 0.035, { name: 'armBrace' });
        P.cap(m, pa, pb, 0.03, { name: 'armBrace' });
        P.cap(m, pb, pc, 0.035, { name: 'armBrace' });
      }
      P.cap('insulator', [side * (reach - 0.1), y - 0.05, 0], [side * (reach - 0.1), y - 1.9, 0], 0.09, { name: 'insulator' });
    }
  });
  return P.list;
}

export function pylonDraw(el, parts, K) {
  const s = pylonSpec(el);
  /* Round concrete footings, kept low for the reason the crane's are. */
  for (const c of PYLON_CORNERS) {
    const [x, , z] = pylonAt(s, c, 0);
    K.cyl('concrete', [x, 0, z], [x, 0.22, z], 0.5, 10);
  }
  /* The discs on each insulator string, a yoke at the top, the clamp and
   * two arcing horns at the bottom where the wire hangs. */
  for (const p of parts) {
    if (p.name !== 'insulator') {
      continue;
    }
    const x = p.a[0];
    for (let k = 0; k < 7; k += 1) {
      const y = p.a[1] - 0.2 - k * 0.24;
      K.cyl('insulator', [x, y, 0], [x, y + 0.06, 0], 0.17, 10);
    }
    K.box('metalDark', x - 0.1, p.a[1] - 0.12, -0.14, x + 0.1, p.a[1] + 0.02, 0.14);
    K.box('metalDark', x - 0.07, p.b[1] - 0.12, -0.16, x + 0.07, p.b[1] + 0.02, 0.16);
    for (const z of [-0.2, 0.2]) {
      K.cyl('metalDark', [x, p.b[1] + 0.05, z * 0.6], [x, p.b[1] + 0.35, z], 0.015, 3);
      K.cyl('metalDark', [x, p.a[1] - 0.15, z * 0.6], [x, p.a[1] - 0.4, z], 0.015, 3);
    }
  }
  /* The earth wire's clamp on the peak. */
  K.box('metalDark', -0.12, s.H - 0.05, -0.12, 0.12, s.H + 0.12, 0.12);
  /* Anti climbing spikes round each leg at three metres. */
  for (const c of PYLON_CORNERS) {
    const [x, y, z] = pylonAt(s, c, 3.1);
    for (let k = 0; k < 6; k += 1) {
      const a = (k / 6) * Math.PI * 2;
      K.cyl('metalDark', [x, y, z], [x + Math.cos(a) * 0.45, y + 0.12, z + Math.sin(a) * 0.45], 0.012, 3);
      K.cyl('metalDark', [x, y + 0.3, z], [x + Math.cos(a + 0.5) * 0.45, y + 0.42, z + Math.sin(a + 0.5) * 0.45], 0.012, 3);
    }
  }
  /* The danger plate and the line's number plate, on the two +z legs,
   * where a person walking up to the tower would read them. */
  const [px, , pz] = pylonAt(s, [1, 1], 2.3);
  K.sign('dangerPlate', px, 2.3, pz + 0.12, 0.6, 0.45, '+z', 0);
  K.sign('indPylonPlate', -px, 2.3, pz + 0.12, 0.6, 0.3, '+z', 0);
}

/* ------------------------------------------------------------------ *
 * CONTAINERS. A stack of one to five shipping containers, each a little
 * off square on the one below, in whatever colours the seed deals. The
 * open style is empty with both ends open: a tunnel 2.3 m wide and tall,
 * which is the classic container line, with its doors swung back flat.
 *
 * The walls are corrugated the way the real ones are, trapezoid flutes a
 * third of a metre apart: few enough that at thirty metres they are a
 * clear stripe and not a shimmer, real enough that at half a metre each
 * one has a lit web and a shaded one.
 * ------------------------------------------------------------------ */

const CONTAINER_W = 2.438;
const CONTAINER_H = 2.591;
const CONTAINER_COLOURS = ['containerRed', 'containerBlue', 'containerGreen', 'containerOrange', 'containerTeal', 'containerGrey', 'containerWhite'];
const FLUTE_PITCH = 0.36;
const FLUTE_DEPTH = 0.035;

function containerSpec(el) {
  const style = CONTAINER_STYLES.includes(el.style) ? el.style : '40ft';
  const L = style === '20ft' ? 6.058 : 12.192;
  const open = style === '40ft open';
  const stack = clamp(Math.round(el.dims.stack), 1, 5);
  const rng = seededRandom(seedOf(el));
  const boxes = [];
  for (let i = 0; i < stack; i += 1) {
    /* The bottom one sits true; the ones above are set down by a crane and
     * are never quite square. */
    const ox = i === 0 ? 0 : rng.range(-0.35, 0.35);
    const oz = i === 0 ? 0 : rng.range(-0.12, 0.12);
    const colour = rng.pick(CONTAINER_COLOURS);
    boxes.push({
      x0: -L / 2 + ox,
      x1: L / 2 + ox,
      z0: -CONTAINER_W / 2 + oz,
      z1: CONTAINER_W / 2 + oz,
      y0: i * CONTAINER_H,
      y1: (i + 1) * CONTAINER_H,
      colour,
      logo: rng.int(0, 5),
      /* Only the bottom one of an open stack is open: an open box with a
       * closed one on it is the tunnel, and a stack of open boxes would be
       * a stack of tunnels nobody asked for. */
      open: open && i === 0,
    });
  }
  return { L, boxes };
}

export function containerLayout(el) {
  const s = containerSpec(el);
  const P = new Parts();
  for (const b of s.boxes) {
    /* The body is drawn in the darker tone: it is the recess between the
     * flutes, which containerDraw raises in the paint colour. */
    const rib = `${b.colour}Rib`;
    if (!b.open) {
      P.box(rib, b.x0, b.y0, b.z0, b.x1, b.y1, b.z1, { name: 'container' });
      continue;
    }
    const t = 0.06;
    P.box(rib, b.x0, b.y0, b.z0, b.x1, b.y0 + 0.16, b.z1, { name: 'containerFloor' });
    P.box(rib, b.x0, b.y1 - 0.1, b.z0, b.x1, b.y1, b.z1, { name: 'containerRoof' });
    P.box(rib, b.x0, b.y0 + 0.16, b.z0, b.x1, b.y1 - 0.1, b.z0 + t, { name: 'containerSide' });
    P.box(rib, b.x0, b.y0 + 0.16, b.z1 - t, b.x1, b.y1 - 0.1, b.z1, { name: 'containerSide' });
  }
  return P.list;
}

/* One container's corrugated wall, placed with a turn and an origin. */
function fluteWall(K, mat, len, h, yaw, x, y, z) {
  const n = Math.max(2, Math.round(len / FLUTE_PITCH));
  const m = new K.THREE.Matrix4().makeRotationY(yaw).setPosition(x, y, z);
  K.add(mat, fluteGeo(K, len, h, n, FLUTE_DEPTH), m);
}

export function containerDraw(el, parts, K) {
  const s = containerSpec(el);
  for (const b of s.boxes) {
    const C = b.colour;
    const rib = `${C}Rib`;
    const zc = (b.z0 + b.z1) / 2;
    const fy0 = b.y0 + 0.2;
    const fh = (b.y1 - 0.14) - fy0;
    const fl = (b.x1 - b.x0) - 0.4;
    /* Both long walls, fluted. */
    fluteWall(K, C, fl, fh, 0, b.x0 + 0.2, fy0, b.z1);
    fluteWall(K, C, fl, fh, Math.PI, b.x1 - 0.2, fy0, b.z0);
    /* Top and bottom side rails, proud of the flutes. */
    for (const [za, zb] of [[b.z1 - 0.01, b.z1 + 0.05], [b.z0 - 0.05, b.z0 + 0.01]]) {
      K.box(C, b.x0, b.y1 - 0.14, za, b.x1, b.y1, zb);
      K.box(C, b.x0, b.y0, za, b.x1, b.y0 + 0.2, zb);
    }
    /* Corner posts and the castings at all eight corners. An open box's
     * posts stay inside its walls' own thickness, clear of the tunnel. */
    const inset = b.open ? 0.07 : 0.18;
    for (const x of [b.x0, b.x1]) {
      const xi = x === b.x0 ? x + inset : x - inset;
      const xo = x === b.x0 ? x - 0.05 : x + 0.05;
      for (const z of [b.z0, b.z1]) {
        const zi = z === b.z0 ? z + inset : z - inset;
        const zo = z === b.z0 ? z - 0.05 : z + 0.05;
        K.box(C, xi, b.y0 + 0.12, zi, xo, b.y1 - 0.12, zo);
        const xci = x === b.x0 ? x + 0.18 : x - 0.18;
        const zci = z === b.z0 ? z + 0.18 : z - 0.18;
        /* A closed box's door end carries its header and sill out to
         * 0.06, and a casting there at 0.06 shared their face plane. */
        const xco = x === b.x0 ? x - 0.06 : x + (b.open ? 0.06 : 0.07);
        const zco = z === b.z0 ? z - 0.06 : z + 0.06;
        K.box('cornerCasting', xci, b.y0, zci, xco, b.y0 + 0.13, zco);
        K.box('cornerCasting', xci, b.y1 - 0.13, zci, xco, b.y1 + 0.01, zco);
      }
    }
    /* The roof, a plain paint coloured panel inside the rails. A real roof
     * has shallow ribs, but a rib a couple of centimetres high throws a
     * shadow the size of a shadow map texel, and from above that striped
     * the roof like a barcode. */
    K.box(C, b.x0 + 0.05, b.y1 - 0.02, b.z0 + 0.05, b.x1 - 0.05, b.y1 + 0.02, b.z1 - 0.05);
    /* The line's name on both sides. */
    const w = Math.min(b.x1 - b.x0 - 1.2, 7.5);
    K.sign('containerLogo', (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2 + 0.1, b.z1 + 0.055, w, 1.2, '+z', b.logo);
    K.sign('containerLogo', (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2 + 0.1, b.z0 - 0.055, w, 1.2, '-z', b.logo);
    if (b.open) {
      /* Header and sill only as deep as the solid roof and floor, so the
       * mouth of the tunnel is drawn exactly as big as it flies. */
      for (const x of [b.x0, b.x1]) {
        const xa = x === b.x0 ? x - 0.04 : x - 0.01;
        const xb = x === b.x0 ? x + 0.01 : x + 0.04;
        K.box(C, xa, b.y1 - 0.1, b.z0, xb, b.y1, b.z1);
        K.box(C, xa, b.y0, b.z0, xb, b.y0 + 0.16, b.z1);
      }
      /* A timber floor inside. */
      K.box('indFloor', b.x0 + 0.02, b.y0 + 0.16, b.z0 + 0.06, b.x1 - 0.02, b.y0 + 0.175, b.z1 - 0.06);
      /* The doors, swung right round and pinned flat to the walls. */
      for (const sz of [-1, 1]) {
        const zw = sz > 0 ? b.z1 : b.z0;
        const za = zw + sz * 0.065;
        const zb = zw + sz * 0.1;
        K.box(C, b.x1 - 1.2, b.y0 + 0.22, Math.min(za, zb), b.x1 - 0.04, b.y1 - 0.3, Math.max(za, zb));
        for (const x of [b.x1 - 0.95, b.x1 - 0.3]) {
          K.cyl('metalDark', [x, b.y0 + 0.3, zw + sz * 0.13], [x, b.y1 - 0.38, zw + sz * 0.13], 0.024, 5);
        }
      }
      continue;
    }
    /* The blind end, fluted across. */
    fluteWall(K, C, (b.z1 - b.z0) - 0.36, fh, -Math.PI / 2, b.x0, fy0, b.z0 + 0.18);
    K.box(C, b.x0 - 0.05, b.y1 - 0.14, b.z0, b.x0 + 0.01, b.y1, b.z1);
    K.box(C, b.x0 - 0.05, b.y0, b.z0, b.x0 + 0.01, b.y0 + 0.2, b.z1);
    /* The door end: header, sill, two leaves with their own corrugation,
     * four locking bars with cam keepers and handles, and the placard. */
    K.box(C, b.x1 - 0.01, b.y1 - 0.3, b.z0, b.x1 + 0.06, b.y1, b.z1);
    K.box(C, b.x1 - 0.01, b.y0, b.z0, b.x1 + 0.06, b.y0 + 0.22, b.z1);
    const leaves = [[b.z0 + 0.19, zc - 0.008], [zc + 0.008, b.z1 - 0.19]];
    for (const [za, zb] of leaves) {
      K.box(C, b.x1, b.y0 + 0.22, za, b.x1 + 0.035, b.y1 - 0.3, zb);
      for (let k = 1; k <= 3; k += 1) {
        const z = za + ((zb - za) * k) / 4;
        K.box(rib, b.x1 + 0.035, b.y0 + 0.32, z - 0.045, b.x1 + 0.05, b.y1 - 0.4, z + 0.045);
      }
      for (const t of [0.22, 0.74]) {
        const z = za + (zb - za) * t;
        K.cyl('metalDark', [b.x1 + 0.1, b.y0 + 0.12, z], [b.x1 + 0.1, b.y1 - 0.18, z], 0.024, 5);
        K.box('metalDark', b.x1 + 0.035, b.y0 + 0.1, z - 0.05, b.x1 + 0.13, b.y0 + 0.2, z + 0.05);
        K.box('metalDark', b.x1 + 0.035, b.y1 - 0.26, z - 0.05, b.x1 + 0.13, b.y1 - 0.16, z + 0.05);
        const toward = z < zc ? 1 : -1;
        K.box('metalDark', b.x1 + 0.09, b.y0 + 1.12, Math.min(z, z + toward * 0.36), b.x1 + 0.13, b.y0 + 1.17, Math.max(z, z + toward * 0.36));
      }
    }
    K.sign('indContainerDoor', b.x1 + 0.056, b.y1 - 0.72, zc + 0.56, 0.92, 0.46, '+x', b.logo);
  }
}

/* ------------------------------------------------------------------ *
 * THE SCAFFOLD. Tube and fitting, timber boards at every lift, a toe board
 * and two guard rails on the outer face, face bracing zigzagging up it, and
 * in the netted style a debris net over the outside with the builder's
 * banner on it. The inner face (-z) is the one set against a wall.
 *
 * BETWEEN ANY TWO LIFTS IS A TUNNEL THE LENGTH OF THE SCAFFOLD, and it is
 * the line, so it keeps the gap rule whatever the author asks for:
 *
 *   wide    the standards either side are at least 1.55 m apart, so the
 *           clear width is 1.49 m, and 1.44 m beside the toe board. A
 *           shallower depth is honoured at the inner face, where an author
 *           lines the scaffold up against a wall, and the scaffold grows
 *           outward from it, so the origin is on the inner face's line plus
 *           half the depth asked for, not on the middle of the footprint.
 *   tall    no lift is shorter than 1.8 m, which leaves 1.68 m clear
 *           between a board and the transoms over it.
 *   open    its ends have no rail and no ladder in them.
 * ------------------------------------------------------------------ */

const TUBE = 0.03;
const SCAFFOLD_MIN_DEPTH = 1.55;
const SCAFFOLD_MIN_LIFT = 1.8;
/* The deck: its slab's top over the lift line, and the toe board. */
const BOARD_TOP = TUBE + 0.05;
const TOE_TOP = 0.24;
const TOE_IN = 0.075;
const TOE_OUT = 0.045;

function scaffoldSpec(el) {
  const d = el.dims;
  const W = clamp(d.width, 2.5, 40);
  const H = clamp(d.height, 2, 40);
  const asked = clamp(d.depth, 1.0, 2.5);
  const D = Math.max(asked, SCAFFOLD_MIN_DEPTH);
  const bays = Math.max(1, Math.round(W / 2.5));
  const lifts = Math.max(1, Math.floor(H / SCAFFOLD_MIN_LIFT));
  const zf = -asked / 2;
  return {
    W, H, D, bays, lifts, bay: W / bays, lift: H / lifts,
    zf, zb: zf + D, netted: el.style === 'netted',
  };
}

export function scaffoldLayout(el) {
  const s = scaffoldSpec(el);
  const P = new Parts();
  const r = TUBE;
  const { zf, zb } = s;
  const xAt = (i) => -s.W / 2 + i * s.bay;
  /* Standards. */
  for (let i = 0; i <= s.bays; i += 1) {
    P.post('scaffold', xAt(i), zf, 0, s.H + 1.0, r, { name: 'standard' });
    P.post('scaffold', xAt(i), zb, 0, s.H + 1.0, r, { name: 'standard' });
  }
  /* Ledgers, transoms, the guard rails, a boarded deck and its toe board
   * at every lift. The deck is solid as one slab and drawn in scaffoldDraw
   * as the planks that cover it, so it lands where it is drawn. */
  for (let j = 1; j <= s.lifts; j += 1) {
    const y = j * s.lift;
    P.cap('scaffold', [-s.W / 2, y, zf], [s.W / 2, y, zf], r, { name: 'ledger' });
    P.cap('scaffold', [-s.W / 2, y, zb], [s.W / 2, y, zb], r, { name: 'ledger' });
    P.cap('scaffold', [-s.W / 2, y + 1.0, zb], [s.W / 2, y + 1.0, zb], r, { name: 'guard' });
    P.cap('scaffold', [-s.W / 2, y + 0.5, zb], [s.W / 2, y + 0.5, zb], r * 0.85, { name: 'guard' });
    for (let i = 0; i <= s.bays; i += 1) {
      P.cap('scaffold', [xAt(i), y, zf], [xAt(i), y, zb], r, { name: 'transom' });
    }
    P.box('indPlankA', -s.W / 2, y + r, zf + 0.05, s.W / 2, y + BOARD_TOP, zb - 0.05, { name: 'board', draw: false });
    P.box('indPlankB', -s.W / 2, y + BOARD_TOP, zb - TOE_IN, s.W / 2, y + TOE_TOP, zb - TOE_OUT, { name: 'toeBoard', draw: false });
  }
  /* Face bracing on the outer face, zigzagging up every other bay. */
  for (let i = 0; i < s.bays; i += 2) {
    for (let j = 0; j < s.lifts; j += 1) {
      const ya = j === 0 ? 0.15 : j * s.lift;
      const yb = (j + 1) * s.lift;
      const [xa, xb] = j % 2 === 0 ? [xAt(i), xAt(i + 1)] : [xAt(i + 1), xAt(i)];
      P.cap('scaffold', [xa, ya, zb + 0.06], [xb, yb, zb + 0.06], r * 0.85, { name: 'brace' });
    }
  }
  if (s.netted) {
    /* The net: soft, solid, and on the outside of the outer standards,
     * drawn in scaffoldDraw a centimetre inside this box's faces. */
    P.box('net', -s.W / 2 - 0.05, 0.4, zb + 0.11, s.W / 2 + 0.05, s.H + 0.9, zb + 0.13, { name: 'net', kind: 'canopy', cast: false, draw: false });
  }
  return P.list;
}

export function scaffoldDraw(el, parts, K) {
  const s = scaffoldSpec(el);
  const T = K.THREE;
  const { zf, zb } = s;
  const xAt = (i) => -s.W / 2 + i * s.bay;
  const rng = seededRandom(seedOf(el) ^ 0x5caf);
  const tones = ['indPlankA', 'indPlankB', 'indPlankC'];
  /* Sole boards under each pair of standards, base plates and jacks. */
  for (let i = 0; i <= s.bays; i += 1) {
    const x = xAt(i);
    K.box('indSole', x - 0.12, 0, zf - 0.12, x + 0.12, 0.045, zb + 0.12);
    for (const z of [zf, zb]) {
      K.box('metalDark', x - 0.08, 0.045, z - 0.08, x + 0.08, 0.06, z + 0.08);
      K.cyl('metalDark', [x, 0.06, z], [x, 0.3, z], 0.02, 5);
    }
  }
  /* The boards: timber planks two bays long, their joints staggered like
   * brickwork, in three tones, over a dark layer that only shows through
   * the finger gaps between them. Together they cover the solid deck to
   * its edges and a few millimetres over its top. The toe board along the
   * outer edge is drawn exactly as its solid. */
  const deck0 = zf + 0.05;
  const deck1 = zb - 0.05;
  const nPl = Math.max(3, Math.round((deck1 - deck0) / 0.24));
  const pw = (deck1 - deck0) / nPl;
  for (let j = 1; j <= s.lifts; j += 1) {
    const y = j * s.lift + TUBE;
    K.box('indPlankGap', -s.W / 2, y + 0.018, deck0 + 0.005, s.W / 2, y + BOARD_TOP - TUBE + 0.002, deck1 - 0.005);
    for (let k = 0; k < nPl; k += 1) {
      const za = deck0 + k * pw + (k > 0 ? 0.01 : 0);
      const zb2 = deck0 + (k + 1) * pw - (k < nPl - 1 ? 0.01 : 0);
      const joints = [0];
      for (let i = (k % 2 === 0 ? 2 : 1); i < s.bays; i += 2) {
        joints.push(i);
      }
      joints.push(s.bays);
      for (let q = 0; q + 1 < joints.length; q += 1) {
        const xa = xAt(joints[q]) + (q > 0 ? 0.008 : 0);
        const xb = xAt(joints[q + 1]) - (q + 2 < joints.length ? 0.008 : 0);
        K.box(rng.pick(tones), xa, y, za, xb, y + 0.058, zb2);
      }
    }
    for (let i = 0; i < s.bays; i += 2) {
      const tone = (i / 2) % 2 === 0 ? 'indPlankB' : 'indPlankA';
      K.box(tone, xAt(i), j * s.lift + BOARD_TOP, zb - TOE_IN, xAt(Math.min(s.bays, i + 2)), j * s.lift + TOE_TOP, zb - TOE_OUT);
    }
  }
  /* Couplers where the ledgers and rails meet the standards: small dark
   * knuckles the ink picks up. */
  for (let i = 0; i <= s.bays; i += 1) {
    const x = xAt(i);
    for (let j = 1; j <= s.lifts; j += 1) {
      const y = j * s.lift;
      for (const [yy, z] of [[y, zb], [y + 1.0, zb], [y, zf]]) {
        K.box('metalDark', x - 0.045, yy - 0.045, z - 0.045, x + 0.045, yy + 0.045, z + 0.045);
      }
    }
  }
  const top = s.lifts * s.lift;
  if (s.netted) {
    /* The net, with its weave repeated fine enough to read as mesh up
     * close and melt into a green veil at range; seams where its sheets
     * are laced together, and hems, all within the net's solid. */
    const w = s.W + 0.1;
    const h = s.H + 0.5;
    const g = new T.PlaneGeometry(w, h);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i += 1) {
      uv.setXY(i, uv.getX(i) * (w / 2.4), uv.getY(i) * (h / 1.44));
    }
    K.add('net', g, new T.Matrix4().makeTranslation(0, 0.4 + h / 2, zb + 0.12));
    for (let x = -s.W / 2 + 1.8; x < s.W / 2 - 0.3; x += 1.8) {
      K.box('indNetSeam', x - 0.03, 0.4, zb + 0.122, x + 0.03, s.H + 0.9, zb + 0.13);
    }
    for (const y of [0.4, s.H + 0.84]) {
      K.box('indNetSeam', -s.W / 2 - 0.05, y, zb + 0.122, s.W / 2 + 0.05, y + 0.06, zb + 0.13);
    }
  } else {
    /* A ladder on the outer face of the first bay, clear of the tunnel. */
    K.ladder('scaffold', [xAt(0) + s.bay / 2, 0.06, zb + 0.24], [xAt(0) + s.bay / 2, top + 1.0, zb + 0.24], 0.42);
  }
  /* The builder's banner on the top guard rail. */
  K.sign('craneBanner', 0, top + 0.55, zb + (s.netted ? 0.135 : 0.1), Math.min(s.W - 1, 9), 0.72, '+z', 0);
}
