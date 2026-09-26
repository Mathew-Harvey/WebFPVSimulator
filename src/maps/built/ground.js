/*
 * ground.js: a built map's ground. The plot, its kerb, the verge, the
 * terrain out past the fog, and the paint on the plot: the edge line, the
 * lanes under bridges with no road under them, the bays round container
 * stacks, the launch box round the pads, a tarmac yard's repairs and marks,
 * a dirt yard's ruts, and the sponsors' marks from the document's logos.
 *
 * Split out of ./index.js whole, for the landing page. Its freestyle
 * chapter builds this map's showpiece behind its film from the simulator's
 * own code (src/sim there, copied byte for byte), and the built map's
 * index.js cannot be that code: it brings the shell, the loading screen and
 * the builder's storage with it. This brings three.js, the town's palette
 * and toon materials, and the arithmetic the rest of src/maps/built already
 * shares. Nothing in it changed on the way: ./index.js calls buildGround
 * exactly as it did when this was a section of it.
 *
 * THE API.
 *
 *   buildGround(placed, doc, look, cover)
 *     placed   placeDocument(doc) from ./place.js
 *     doc      the normalized document, for its id (the repairs' seed) and
 *              its logos
 *     look     lookOf(doc) from ./looks.js: the ground and its paint
 *     cover    ./roadmesh.js roadCover for the map's roads: no paint of the
 *              yard's goes on a road, and a bridge with a road under it
 *              paints no lane of its own
 *   returns { group, painted, cancelLogos }: the group to add to a scene,
 *   what was painted (for stats), and a way to stop a logo still decoding
 *   from painting into a map that has gone.
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

import * as THREE from 'three';
import { PAL } from '../city/vendored/core/palette.js';
import { cel } from '../city/vendored/core/toon.js';
import { bake } from '../city/vendored/core/util.js';
import { logoForDecal } from '../../trackbuilder/model.js';
import { planBounds } from '../../props/catalog.js';
import { sincos } from '../../props/trig.js';
import { seededRandom, hashString } from '../../props/parts.js';
import { paintGroundLogo } from '../../art/banners.js';

/* The concrete paving's slab, and how many slabs one texture tile holds.
 * Six metres is a sawn joint spacing a yard slab of this kind really has;
 * four by four slabs per tile is what keeps the stains from repeating
 * inside one field of view. */
const SLAB = 6;
const TILE_SLABS = 4;

/* How far the verge and the kerb run round the plot, in metres. */
const KERB_W = 0.3;
const KERB_H = 0.12;
const VERGE_W = 5;

/* The yellow line painted round the plot, in from the kerb. */
const EDGE_LINE_INSET = 1.2;
const LINE_W = 0.14;


function canvasTexture(c, repeatX, repeatY) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

/*
 * THE YARD'S CONCRETE, one tile of four by four slabs.
 *
 * The town's concrete, lifted and dropped a shade slab by slab the way a
 * yard poured in bays weathers, a sawn joint between every slab, a few
 * hairline cracks and oil stains. Low contrast on purpose: this is the
 * ground under everything, and the cel ramp already bands it by the light,
 * so anything louder than this reads as a pattern rather than as paving.
 */
function yardTexture() {
  const S = 512;
  const px = S / TILE_SLABS;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d');
  const rng = seededRandom(0x1b4a7d);
  /* Round the town's concreteMid rather than its concrete: the paler tone
   * is a footway at ten metres, and under a fog that ends in the same
   * near white it took the ground with it, so the yard read as haze. */
  const tones = ['#cdc9d2', '#c8c4ce', '#d1cdd5', '#c5c1cb', '#cbc7d0', '#c3bfc9'];
  for (let i = 0; i < TILE_SLABS; i += 1) {
    for (let k = 0; k < TILE_SLABS; k += 1) {
      g.fillStyle = tones[Math.floor(rng.next() * tones.length)];
      g.fillRect(i * px, k * px, px, px);
    }
  }
  /* Oil and water stains: soft, dark, few. */
  for (let n = 0; n < 16; n += 1) {
    const x = rng.range(0, S);
    const y = rng.range(0, S);
    const r = rng.range(6, 30);
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(96, 90, 116, 0.16)');
    grad.addColorStop(1, 'rgba(96, 90, 116, 0)');
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  /* Hairline cracks, a random walk from a slab edge. */
  g.strokeStyle = 'rgba(112, 106, 132, 0.45)';
  g.lineWidth = 1;
  for (let n = 0; n < 7; n += 1) {
    let x = Math.floor(rng.range(0, TILE_SLABS)) * px;
    let y = rng.range(0, S);
    g.beginPath();
    g.moveTo(x, y);
    const steps = 6 + Math.floor(rng.range(0, 6));
    for (let s = 0; s < steps; s += 1) {
      x += rng.range(2, 9);
      y += rng.range(-6, 6);
      g.lineTo(x, y);
    }
    g.stroke();
  }
  /* The sawn joints, two pixels on every slab boundary. The tile's own
   * edge gets one pixel on each side, so two tiles meet in one joint. */
  g.fillStyle = '#9d98a8';
  for (let i = 0; i <= TILE_SLABS; i += 1) {
    const at = i * px;
    g.fillRect(Math.max(0, at - 1), 0, i === 0 || i === TILE_SLABS ? 1 : 2, S);
    g.fillRect(0, Math.max(0, at - 1), S, i === 0 || i === TILE_SLABS ? 1 : 2);
  }
  return c;
}

/*
 * The ground past the kerb: the town's own terrain colour, 0xc4c4b6 from
 * its street grid, mottled so a pilot high over the plot reads distance off
 * it rather than a flat sheet. The same colour the gallery sits on, which
 * is why it is only ever seen past a verge and a kerb here. A grass or dirt
 * plot stands in land of its own kind (the ground's `terrain` in
 * ./looks.js), since a lawn in a beige plain reads as a carpet.
 */
function terrainTexture(tone) {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = tone.base;
  g.fillRect(0, 0, S, S);
  const rng = seededRandom(0x7e4a11);
  for (let n = 0; n < 40; n += 1) {
    const x = rng.range(0, S);
    const y = rng.range(0, S);
    const r = rng.range(10, 42);
    const light = rng.chance(0.5);
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, light ? tone.light : tone.dark);
    grad.addColorStop(1, 'rgba(196, 196, 182, 0)');
    g.fillStyle = grad;
    /* Drawn at every wrap so the tile has no seam. */
    for (const ox of [-S, 0, S]) {
      for (const oy of [-S, 0, S]) {
        g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      }
    }
  }
  return c;
}

/*
 * THE OTHER GROUNDS, each one tile of paint in the yard's manner: a flat
 * base, broad soft mottling a pilot reads distance off from the air, and
 * a little close detail, all of it low in contrast, because the cel ramp
 * bands the ground by the light already and anything louder than paving
 * reads as a pattern. Every mark is drawn at each wrap of the tile, so
 * tiles meet with no seam.
 */
const GROUND_TILE = { tarmac: 16, grass: 12, dirt: 14 };

function groundCanvas(S, base) {
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, S, S);
  /* Draw at every wrap, so a mark over the tile's edge comes back in on
   * the other side. */
  const wrapped = (draw) => {
    for (const ox of [-S, 0, S]) {
      for (const oy of [-S, 0, S]) {
        draw(ox, oy);
      }
    }
  };
  const blob = (x, y, r, inner, outer) => {
    wrapped((ox, oy) => {
      const grad = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      grad.addColorStop(0, inner);
      grad.addColorStop(1, outer);
      g.fillStyle = grad;
      g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    });
  };
  return { c, g, wrapped, blob };
}

/*
 * TARMAC: a car park's asphalt, dark and a little violet like the town's
 * road, with the fine grain of its stone, the lighter wear where wheels
 * have run, tar sealing wandering along old cracks, and oil. The markings
 * and the cut and filled repairs are laid over it in the world
 * (tarmacMarks, tarmacRepairs), not in the tile.
 */
function tarmacTexture() {
  const S = 512;
  const { c, g, wrapped, blob } = groundCanvas(S, '#6b6978');
  const rng = seededRandom(0x2a7c55);
  for (let n = 0; n < 30; n += 1) {
    const light = rng.chance(0.5);
    blob(rng.range(0, S), rng.range(0, S), rng.range(30, 110),
      light ? 'rgba(146, 142, 158, 0.18)' : 'rgba(76, 74, 90, 0.2)', 'rgba(107, 105, 120, 0)');
  }
  /* The stone in it: single texels, pale and dark, faint. */
  for (let n = 0; n < 2600; n += 1) {
    g.fillStyle = rng.chance(0.5) ? 'rgba(178, 172, 190, 0.3)' : 'rgba(58, 54, 72, 0.3)';
    g.fillRect(Math.floor(rng.range(0, S)), Math.floor(rng.range(0, S)), 1, 1);
  }
  /* Crack sealing: a wandering dark line, and oil where cars stood. Few
   * and faint, because a tile repeats every GROUND_TILE metres and
   * anything that catches the eye in one is a pattern across the plot.
   * The cut and filled repairs, which do catch it, are laid in the world
   * instead (tarmacRepairs), where they do not repeat. */
  for (let n = 0; n < 4; n += 1) {
    const pts = [[rng.range(0, S), rng.range(0, S)]];
    const steps = 8 + Math.floor(rng.range(0, 10));
    let a = rng.range(0, Math.PI * 2);
    for (let k = 0; k < steps; k += 1) {
      a += rng.range(-0.7, 0.7);
      const [px, py] = pts[pts.length - 1];
      pts.push([px + Math.cos(a) * rng.range(6, 16), py + Math.sin(a) * rng.range(6, 16)]);
    }
    const width = rng.range(1.2, 2);
    wrapped((ox, oy) => {
      g.strokeStyle = 'rgba(46, 42, 58, 0.34)';
      g.lineWidth = width;
      g.lineJoin = 'round';
      g.beginPath();
      pts.forEach(([px, py], k) => (k ? g.lineTo(px + ox, py + oy) : g.moveTo(px + ox, py + oy)));
      g.stroke();
    });
  }
  for (let n = 0; n < 8; n += 1) {
    blob(rng.range(0, S), rng.range(0, S), rng.range(8, 22), 'rgba(40, 36, 52, 0.2)', 'rgba(40, 36, 52, 0)');
  }
  return c;
}

/*
 * GRASS: the town's own lawn tone, PAL.grass, painted the way a background
 * painter does a field: broad patches a shade lighter and darker, clover
 * in darker clumps, short strokes of blade in both, and a very few white
 * and yellow flowers. No mowing stripes: from the air they are a second
 * grid.
 */
function grassTexture() {
  const S = 512;
  const { c, g, blob } = groundCanvas(S, '#86ab84');
  const rng = seededRandom(0x3b8d21);
  for (let n = 0; n < 46; n += 1) {
    const light = rng.chance(0.55);
    blob(rng.range(0, S), rng.range(0, S), rng.range(24, 90),
      light ? 'rgba(160, 196, 146, 0.34)' : 'rgba(104, 146, 110, 0.32)', 'rgba(134, 171, 132, 0)');
  }
  for (let n = 0; n < 70; n += 1) {
    const x = rng.range(0, S);
    const y = rng.range(0, S);
    for (let k = 0; k < 9; k += 1) {
      blob(x + rng.range(-9, 9), y + rng.range(-9, 9), rng.range(2, 4.5), 'rgba(92, 132, 98, 0.5)', 'rgba(92, 132, 98, 0)');
    }
  }
  g.lineWidth = 1;
  for (let n = 0; n < 4200; n += 1) {
    const x = rng.range(0, S);
    const y = rng.range(0, S);
    g.strokeStyle = rng.chance(0.5) ? 'rgba(176, 206, 158, 0.28)' : 'rgba(94, 132, 96, 0.28)';
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + rng.range(-1.2, 1.2), y - rng.range(2.5, 5));
    g.stroke();
  }
  for (let n = 0; n < 36; n += 1) {
    g.fillStyle = rng.chance(0.6) ? 'rgba(250, 248, 238, 0.85)' : 'rgba(246, 212, 96, 0.85)';
    g.fillRect(Math.floor(rng.range(1, S - 2)), Math.floor(rng.range(1, S - 2)), 2, 2);
  }
  return c;
}

/*
 * DIRT: a worked earth yard, warm and held back from ochre the way the
 * town's clay is, dry and pale where it is packed, darker where the damp
 * sits, gravel and a few stones through it. The ruts are laid over it as
 * their own paint (dirtRuts), because a rut runs across the whole plot and
 * a tile would repeat it.
 */
function dirtTexture() {
  const S = 512;
  const { c, g, blob } = groundCanvas(S, '#c2ad95');
  const rng = seededRandom(0x5d19e3);
  for (let n = 0; n < 40; n += 1) {
    const light = rng.chance(0.55);
    blob(rng.range(0, S), rng.range(0, S), rng.range(26, 100),
      light ? 'rgba(214, 198, 172, 0.26)' : 'rgba(164, 142, 118, 0.22)', 'rgba(194, 173, 149, 0)');
  }
  for (let n = 0; n < 2200; n += 1) {
    g.fillStyle = rng.chance(0.5) ? 'rgba(150, 140, 150, 0.45)' : 'rgba(120, 100, 86, 0.4)';
    const r = rng.chance(0.8) ? 1 : 2;
    g.fillRect(Math.floor(rng.range(0, S)), Math.floor(rng.range(0, S)), r, r);
  }
  /* Stones: a pale top and a dark lower edge, so the light reads on them. */
  for (let n = 0; n < 70; n += 1) {
    const x = rng.range(4, S - 4);
    const y = rng.range(4, S - 4);
    const r = rng.range(1.5, 3.5);
    g.fillStyle = 'rgba(112, 96, 88, 0.6)';
    g.beginPath();
    g.ellipse(x, y + 0.8, r * 1.3, r, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(214, 204, 198, 0.8)';
    g.beginPath();
    g.ellipse(x, y, r * 1.2, r * 0.85, 0, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

/*
 * A PLOT THAT DOES NOT REPEAT. A tile of tarmac, grass or dirt is a dozen
 * metres, and over a 160 m plot its broad patches line up into a grid a
 * pilot sees from the air at once. So the plot's own vertices carry a
 * second, slower variation, laid in world space and never repeating: two
 * octaves of smoothed value noise, one on a lattice of LATTICE metres and
 * one at a third of that, multiplying the texture by a few percent. A
 * lawn's also leans its hue, yellower where it is drier and bluer where it
 * is lush, because that is what a real one does. Concrete keeps the one
 * flat plane it always had.
 */
const LATTICE = 30;
const PLOT_VARY = { tarmac: [0.07, 0, 0], grass: [0.08, 0.05, 0.06], dirt: [0.09, 0.03, 0] };

function plotGeometry(W, D, groundId, seed) {
  const vary = PLOT_VARY[groundId];
  /* Four metre cells, well inside the noise's lattice, and no more than a
   * hundred a side, so a plot of a kilometre is 20,000 triangles and not
   * half a million. */
  const nx = Math.min(100, Math.max(1, Math.round(W / 4)));
  const nz = Math.min(100, Math.max(1, Math.round(D / 4)));
  const geo = new THREE.PlaneGeometry(W, D, nx, nz).rotateX(-Math.PI / 2);
  if (!vary) {
    return geo;
  }
  const lattice = (i, j, k) => seededRandom((Math.imul(i, 73856093) ^ Math.imul(j, 19349663) ^ Math.imul(k, 83492791) ^ seed) >>> 0).next() * 2 - 1;
  const smooth = (t) => t * t * (3 - 2 * t);
  const noise = (x, z, cell, k) => {
    const fx = x / cell;
    const fz = z / cell;
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const u = smooth(fx - i);
    const v = smooth(fz - j);
    const a = lattice(i, j, k) + (lattice(i + 1, j, k) - lattice(i, j, k)) * u;
    const b = lattice(i, j + 1, k) + (lattice(i + 1, j + 1, k) - lattice(i, j + 1, k)) * u;
    return a + (b - a) * v;
  };
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let n = 0; n < pos.count; n += 1) {
    const x = pos.getX(n);
    const z = pos.getZ(n);
    const value = 0.7 * noise(x, z, LATTICE, 1) + 0.3 * noise(x, z, LATTICE / 3, 2);
    const hue = noise(x, z, LATTICE * 1.4, 3);
    const k = 1 + vary[0] * value;
    col[n * 3] = k * (1 + vary[1] * hue);
    col[n * 3 + 1] = k;
    col[n * 3 + 2] = k * (1 - vary[2] * hue);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

/* The lanes buildGround paints under bridges, as world rectangles at their
 * widest, for paint that must not lie on a road. A bridge with one of the
 * map's roads under it paints no lane (see roadUnder), so it has none here
 * either: the road's own cover keeps the paint off. */
function lanesOf(placed, cover) {
  const { W, D } = placed;
  const out = [];
  const S = { s: 0, c: 1 };
  for (const it of placed.items) {
    if (it.el.type === 'bridge' && !roadUnder(it, cover)) {
      sincos(it.yaw, S);
      const hw = 4;
      out.push(Math.abs(S.s) > 0.5
        ? { x0: -W / 2, x1: W / 2, z0: it.z - hw, z1: it.z + hw }
        : { x0: it.x - hw, x1: it.x + hw, z0: -D / 2, z1: D / 2 });
    }
  }
  return out;
}

/*
 * WHETHER A ROAD RUNS UNDER A BRIDGE: one of the map's roads (./roadmesh.js
 * roadCover) within a metre of the middle of its span. The bridge's own
 * lane is painted through that middle, so a road there is running along
 * where the lane would be, and the lane is left out rather than drawn under
 * the road.
 */
function roadUnder(it, cover) {
  return Boolean(cover) && cover(it.x - 1, it.x + 1, it.z - 1, it.z + 1);
}

/*
 * TARMAC REPAIRS, cut and filled: a few rectangles a shade fresher or
 * older than the rest, laid in the world where the plot's tile cannot
 * repeat them, at quarter turns the way a crew cuts them, seeded by the
 * document so each car park has its own.
 */
function tarmacRepairs(paint, placed, doc, cover) {
  const rng = seededRandom(hashString(doc.id) ^ 0x7ea1c0);
  const fresh = cel({ color: 0x625e72, bands: 3, tint: 0x5a5480, cache: false });
  const old = cel({ color: 0x7a768a, bands: 3, tint: 0x5a5480, cache: false });
  const lanes = lanesOf(placed, cover);
  const n = Math.max(4, Math.round((placed.W * placed.D) / 1400));
  let laid = 0;
  for (let i = 0; i < n; i += 1) {
    const w = rng.range(1.6, 7);
    const d = rng.range(1.2, 4.5);
    const x = rng.range(-0.46, 0.46) * placed.W;
    const z = rng.range(-0.46, 0.46) * placed.D;
    const turn = rng.chance(0.5);
    const fromFresh = rng.chance(0.6);
    const hx = (turn ? d : w) / 2 + 0.5;
    const hz = (turn ? w : d) / 2 + 0.5;
    if (!clearOf(lanes, x - hx, x + hx, z - hz, z + hz) || cover(x - hx, x + hx, z - hz, z + hz)) {
      continue;
    }
    paint.rect(fromFresh ? fresh : old, x, z, w, d, turn ? Math.PI / 2 : 0, 0.003);
    laid += 1;
  }
  return laid;
}

/*
 * One tyre rut, across a strip of texture: the width of a tyre's track,
 * soft at both edges, packed darker in the middle, with the tread's
 * chevrons pressed into it every few texels along the length.
 */
function rutTexture() {
  const W = 32;
  const H = 128;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const across = g.createLinearGradient(0, 0, W, 0);
  across.addColorStop(0, 'rgba(120, 96, 76, 0)');
  across.addColorStop(0.25, 'rgba(120, 96, 76, 0.42)');
  across.addColorStop(0.5, 'rgba(110, 88, 70, 0.5)');
  across.addColorStop(0.75, 'rgba(120, 96, 76, 0.42)');
  across.addColorStop(1, 'rgba(120, 96, 76, 0)');
  g.fillStyle = across;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(86, 66, 54, 0.4)';
  g.lineWidth = 2;
  for (let y = 0; y < H; y += 8) {
    g.beginPath();
    g.moveTo(8, y + 4);
    g.lineTo(W / 2, y);
    g.lineTo(W - 8, y + 4);
    g.stroke();
  }
  return c;
}


/*
 * Flat paint on the ground, batched by material. Every mark is a level
 * rectangle: centre, size along its own x and z, a heading and a height a
 * few millimetres off the paving.
 */
class Paint {
  constructor() {
    this.byMat = new Map();
    this.unit = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  }

  rect(mat, cx, cz, w, d, yaw, y) {
    if (!(w > 1e-3 && d > 1e-3)) {
      return;
    }
    const m = new THREE.Matrix4().makeRotationY(yaw);
    m.multiply(new THREE.Matrix4().makeScale(w, 1, d));
    m.setPosition(cx, y, cz);
    let list = this.byMat.get(mat);
    if (!list) {
      list = [];
      this.byMat.set(mat, list);
    }
    list.push({ geometry: this.unit, matrix: m });
  }

  /* A rectangle's outline, `t` wide, in an element's frame. */
  outline(mat, cx, cz, yaw, x0, x1, z0, z1, t, y) {
    const S = { s: 0, c: 1 };
    sincos(yaw, S);
    const at = (lx, lz) => [cx + lx * S.c + lz * S.s, cz - lx * S.s + lz * S.c];
    const [ax, az] = at((x0 + x1) / 2, z0 + t / 2);
    this.rect(mat, ax, az, x1 - x0, t, yaw, y);
    const [bx, bz] = at((x0 + x1) / 2, z1 - t / 2);
    this.rect(mat, bx, bz, x1 - x0, t, yaw, y);
    const [lx, lz] = at(x0 + t / 2, (z0 + z1) / 2);
    this.rect(mat, lx, lz, t, z1 - z0 - 2 * t, yaw, y);
    const [rx, rz] = at(x1 - t / 2, (z0 + z1) / 2);
    this.rect(mat, rx, rz, t, z1 - z0 - 2 * t, yaw, y);
  }

  finish(group) {
    for (const [mat, list] of this.byMat) {
      const geo = bake(list);
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      mesh.name = 'groundPaint';
      group.add(mesh);
    }
    this.unit.dispose();
    this.byMat.clear();
  }
}

/*
 * Where the author's things stand, as world rectangles grown by `pad`, for
 * paint that should go round them. A car is left out, since a car may
 * stand in a painted bay, and so is anything with no footprint.
 */
function footprints(placed, pad) {
  const out = [];
  const S = { s: 0, c: 1 };
  for (const it of placed.items) {
    const type = it.el.type;
    if (type === 'car' || !it.parts || !it.parts.length) {
      continue;
    }
    const b = planBounds(it.parts);
    sincos(it.yaw, S);
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (const lx of [b.x0, b.x1]) {
      for (const lz of [b.z0, b.z1]) {
        const wx = it.x + lx * S.c + lz * S.s;
        const wz = it.z - lx * S.s + lz * S.c;
        x0 = Math.min(x0, wx);
        x1 = Math.max(x1, wx);
        z0 = Math.min(z0, wz);
        z1 = Math.max(z1, wz);
      }
    }
    /* The pads' launch box is painted out past their mats. */
    const p = type === 'startPads' ? pad + 1.6 : pad;
    out.push({ x0: x0 - p, x1: x1 + p, z0: z0 - p, z1: z1 + p });
  }
  return out;
}

function clearOf(rects, x0, x1, z0, z1) {
  return !rects.some((r) => r.x0 < x1 && r.x1 > x0 && r.z0 < z1 && r.z1 > z0);
}

/*
 * A CAR PARK'S MARKINGS, on a tarmac plot: a row of bays along each side,
 * in from the yard's edge line, open onto an aisle that runs round the plot
 * one way, with an arrow painted in the aisle every so often. A bay is left
 * out wherever something stands on it (a car is allowed to), so the lines
 * go round the author's map rather than under it, and an arrow the same.
 * Bays 2.5 by 5 m and a 6 m aisle, the proportions of a real one.
 */
const BAY_W = 2.5;
const BAY_D = 5;
const BAY_GAP = 0.4;
const AISLE = 6;
const BAY_LINE = 0.1;
const ARROW_EVERY = 24;

function tarmacMarks(paint, mat, placed, painted, cover) {
  const ex = placed.W / 2 - EDGE_LINE_INSET;
  const ez = placed.D / 2 - EDGE_LINE_INSET;
  /* A bridge's road runs the plot's whole depth under it, and a bay or an
   * arrow painted across it is a car park laid over a road. The map's own
   * roads are the same, through `cover`. */
  const lanes = [
    ...footprints(placed, 0.3),
    ...lanesOf(placed, cover).map((l) => ({ x0: l.x0 - 0.3, x1: l.x1 + 0.3, z0: l.z0 - 0.3, z1: l.z1 + 0.3 })),
  ];
  const clearOfBusy = (x0, x1, z0, z1) => clearOf(lanes, x0, x1, z0, z1) && !cover(x0, x1, z0, z1);
  /* Each side as a frame: `along` runs the way the aisle's traffic goes
   * (anticlockwise seen from above), `inward` points into the plot, and
   * `e` is how far the edge line is from the middle. */
  const sides = [
    { along: [1, 0], inward: [0, -1], e: ez, len: ex },
    { along: [0, -1], inward: [-1, 0], e: ex, len: ez },
    { along: [-1, 0], inward: [0, 1], e: ez, len: ex },
    { along: [0, 1], inward: [1, 0], e: ex, len: ez },
  ];
  const corner = BAY_GAP + BAY_D + AISLE + 1;
  const y = 0.008;
  for (const s of sides) {
    const [ax, az] = s.along;
    const [nx, nz] = s.inward;
    const alongX = Math.abs(ax) > 0.5;
    /* A point `t` along the side and `u` in from its edge line. */
    const at = (t, u) => [-nx * s.e + ax * t + nx * u, -nz * s.e + az * t + nz * u];
    const rect = (t0, t1, u0, u1) => {
      const [px, pz] = at(t0, u0);
      const [qx, qz] = at(t1, u1);
      return [Math.min(px, qx), Math.max(px, qx), Math.min(pz, qz), Math.max(pz, qz)];
    };
    const n = Math.floor((2 * (s.len - corner)) / BAY_W);
    const t0 = -(n * BAY_W) / 2;
    const free = [];
    for (let i = 0; i < n; i += 1) {
      free.push(clearOfBusy(...rect(t0 + i * BAY_W, t0 + (i + 1) * BAY_W, BAY_GAP, BAY_GAP + BAY_D)));
    }
    for (let i = 0; i <= n; i += 1) {
      if (!free[i - 1] && !free[i]) {
        continue;
      }
      const [cx, cz] = at(t0 + i * BAY_W, BAY_GAP + BAY_D / 2);
      paint.rect(mat, cx, cz, alongX ? BAY_LINE : BAY_D, alongX ? BAY_D : BAY_LINE, 0, y);
    }
    painted.parking += free.filter(Boolean).length;
    /* The arrows, down the middle of the aisle: a shaft, and a head of two
     * bars folded back from its tip. Headings from atan2, which is render
     * only: nothing here is solid. */
    const u = BAY_GAP + BAY_D + AISLE / 2;
    for (let t = -s.len + corner + ARROW_EVERY / 2; t < s.len - corner; t += ARROW_EVERY) {
      if (!clearOfBusy(...rect(t - 2, t + 2, u - 1.2, u + 1.2))) {
        continue;
      }
      const [cx, cz] = at(t, u);
      const yaw = Math.atan2(-az, ax);
      paint.rect(mat, cx, cz, 2.6, 0.2, yaw, y);
      const [tx, tz] = at(t + 1.25, u);
      for (const side of [-1, 1]) {
        const a = yaw + Math.PI + side * 0.62;
        const dx = Math.cos(a);
        const dz = -Math.sin(a);
        paint.rect(mat, tx + dx * 0.5, tz + dz * 0.5, 1.1, 0.2, a, y);
      }
      painted.arrows += 1;
    }
  }
}

/*
 * TYRE RUTS over a dirt plot: the tracks of whatever worked the yard, a
 * few long sweeps from one side of the plot to another, each a pair of
 * ruts a truck's track apart. Seeded by the document's id, so every map
 * has its own and keeps them. They run under whatever stands on them, as
 * ruts in a yard do, but not across a painted lane, which is paved.
 */
const RUT_TRACK = 1.8;
const RUT_W = 0.42;
const RUT_REPEAT = 1.6;

function dirtRuts(placed, doc, cover) {
  const { W, D } = placed;
  const rng = seededRandom(hashString(doc.id) ^ 0x5eed17);
  const lanes = lanesOf(placed, cover);
  const onEdge = (side) => {
    const t = rng.range(-0.4, 0.4);
    return [
      [t * W, -D / 2 + 2], [W / 2 - 2, t * D], [t * W, D / 2 - 2], [-W / 2 + 2, t * D],
    ][side];
  };
  /* The start's paint on the paving, the launch box and the chevron ahead
   * of it (buildGround), in each pads' own frame and grown by half a rut:
   * a rut is transparent and drawn after the paint, so it printed over the
   * START text, the chequer and the box line. It breaks there as it does
   * at a lane. */
  const starts = placed.items.filter((it) => it.el.type === 'startPads' && it.y === 0).map((it) => {
    const b = planBounds(it.parts);
    const S = { s: 0, c: 1 };
    sincos(it.yaw, S);
    const g = RUT_W / 2;
    return { x: it.x, z: it.z, s: S.s, c: S.c, x0: b.x0 - 1.0 - g, x1: b.x1 + 4.2 + g, z0: b.z0 - 0.8 - g, z1: b.z1 + 0.8 + g };
  });
  const inStart = (x, z) => starts.some((r) => {
    const dx = x - r.x;
    const dz = z - r.z;
    const lx = dx * r.c - dz * r.s;
    const lz = dx * r.s + dz * r.c;
    return lx > r.x0 && lx < r.x1 && lz > r.z0 && lz < r.z1;
  });
  const pos = [];
  const uv = [];
  const index = [];
  const paths = Math.max(3, Math.min(9, Math.round((W * D) / 5000)));
  for (let p = 0; p < paths; p += 1) {
    const a = rng.int(0, 3);
    const b = (a + rng.int(1, 3)) % 4;
    const pts = [onEdge(a), [rng.range(-0.3, 0.3) * W, rng.range(-0.3, 0.3) * D],
      [rng.range(-0.3, 0.3) * W, rng.range(-0.3, 0.3) * D], onEdge(b)]
      .map(([x, z]) => new THREE.Vector3(x, 0, z));
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const len = curve.getLength();
    const steps = Math.max(8, Math.ceil(len / 0.8));
    for (const off of [-RUT_TRACK / 2, RUT_TRACK / 2]) {
      let prev = -1;
      for (let i = 0; i <= steps; i += 1) {
        const f = i / steps;
        const c = curve.getPointAt(f);
        const tg = curve.getTangentAt(f);
        const nx = -tg.z;
        const nz = tg.x;
        const mx = c.x + nx * off;
        const mz = c.z + nz * off;
        const inLane = lanes.some((l) => mx > l.x0 && mx < l.x1 && mz > l.z0 && mz < l.z1)
          || cover(mx - RUT_W / 2, mx + RUT_W / 2, mz - RUT_W / 2, mz + RUT_W / 2);
        if (inLane || inStart(mx, mz) || Math.abs(mx) > W / 2 - 0.4 || Math.abs(mz) > D / 2 - 0.4) {
          prev = -1;
          continue;
        }
        const v = (f * len) / RUT_REPEAT;
        const base = pos.length / 3;
        pos.push(mx - nx * (RUT_W / 2), 0.003, mz - nz * (RUT_W / 2), mx + nx * (RUT_W / 2), 0.003, mz + nz * (RUT_W / 2));
        uv.push(0, v, 1, v);
        if (prev >= 0) {
          index.push(prev, prev + 1, base, prev + 1, base + 1, base);
        }
        prev = base;
      }
    }
  }
  if (!index.length) {
    return null;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(index);
  geo.computeBoundingSphere();
  const tex = canvasTexture(rutTexture(), 1, 1);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  const mat = cel({ color: 0xffffff, map: tex, bands: 3, tint: 0x6f5f86, transparent: true, depthWrite: false, cache: false });
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -1;
  mat.polygonOffsetUnits = -1;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'ruts';
  return { mesh, count: paths };
}

/*
 * The plot, its kerb, the verge, the terrain, and the paint on the plot.
 * `cover` is ./roadmesh.js roadCover for the map's roads: no paint of the
 * yard's goes on a road, and a bridge with a road under it paints no lane
 * of its own. Returns the group, what it painted for stats(), and a way to
 * stop a logo still decoding from painting into a map that has gone.
 */
export function buildGround(placed, doc, look, cover) {
  const { W, D } = placed;
  const G = look.ground;
  const groundId = look.groundId;
  const group = new THREE.Group();
  group.name = 'ground';

  /* The plot: a plane the size of the field, at exactly zero, which is the
   * height the plant flies over, painted with the map's ground. Whatever
   * it is painted as, it is the same flat plane: a ground is paint. */
  const painter = { tarmac: tarmacTexture, grass: grassTexture, dirt: dirtTexture }[groundId];
  const tile = painter ? GROUND_TILE[groundId] : SLAB * TILE_SLABS;
  const yard = canvasTexture(painter ? painter() : yardTexture(), W / tile, D / tile);
  const plot = new THREE.Mesh(
    painter ? plotGeometry(W, D, groundId, hashString(doc.id)) : new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2),
    cel({ color: 0xffffff, map: yard, bands: 3, tint: G.tint, vertexColors: Boolean(painter), cache: false }),
  );
  plot.receiveShadow = true;
  plot.name = 'plot';
  group.add(plot);

  /* The kerb, one box a side, so the ink draws the plot's edge. Paint, not
   * a solid: it is twelve centimetres high and the plant's ground is flat. */
  const kerbMat = cel({ color: PAL.curb, bands: 3, tint: 0x6f6790, cache: false });
  const kerbs = [];
  const kw = KERB_W;
  const addBox = (list, x0, z0, x1, z1, y0, y1) => {
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    list.push({ geometry: g });
  };
  addBox(kerbs, -W / 2 - kw, -D / 2 - kw, W / 2 + kw, -D / 2, -0.3, KERB_H);
  addBox(kerbs, -W / 2 - kw, D / 2, W / 2 + kw, D / 2 + kw, -0.3, KERB_H);
  addBox(kerbs, -W / 2 - kw, -D / 2, -W / 2, D / 2, -0.3, KERB_H);
  addBox(kerbs, W / 2, -D / 2, W / 2 + kw, D / 2, -0.3, KERB_H);
  const kerb = new THREE.Mesh(bake(kerbs), kerbMat);
  kerb.receiveShadow = true;
  kerb.castShadow = true;
  kerb.name = 'kerb';
  group.add(kerb);
  for (const k of kerbs) {
    k.geometry.dispose();
  }

  /* The verge: a band of the town's grass between the kerb and the
   * terrain, two centimetres under the paving. */
  const verges = [];
  const vw = VERGE_W + kw;
  addBox(verges, -W / 2 - vw, -D / 2 - vw, W / 2 + vw, -D / 2 - kw, -0.3, -0.02);
  addBox(verges, -W / 2 - vw, D / 2 + kw, W / 2 + vw, D / 2 + vw, -0.3, -0.02);
  addBox(verges, -W / 2 - vw, -D / 2 - kw, -W / 2 - kw, D / 2 + kw, -0.3, -0.02);
  addBox(verges, W / 2 + kw, -D / 2 - kw, W / 2 + vw, D / 2 + kw, -0.3, -0.02);
  const verge = new THREE.Mesh(bake(verges), cel({ color: PAL.grass, bands: 3, tint: 0x5b6f8c, cache: false }));
  verge.receiveShadow = true;
  verge.name = 'verge';
  group.add(verge);
  for (const v of verges) {
    v.geometry.dispose();
  }

  /*
   * The terrain, out past the fog.
   *
   * IN FORTY METRE CELLS, NOT ONE QUAD. Five centimetres under the paving,
   * a two kilometre quad came out IN FRONT of it: from 3 m up on High at
   * 1280 by 720 the whole yard, paint and all, was the terrain's beige
   * (headless Chromium's software rasteriser; it was there before the fog
   * moved, and the same frame at 960 by 540 was clean). Its two triangles
   * are clipped by a near plane 0.2 m from the eye, and the depth across
   * what is left of a triangle that size is the likely culprit: the same
   * frame with the terrain hidden, dropped to -0.3 m, or cut into these
   * cells shows the yard every time. Cells cost 5,000 triangles and no
   * draw call.
   */
  const TERRAIN = 2000;
  const TERRAIN_CELLS = 50;
  const terrainTex = canvasTexture(terrainTexture(G.terrain), TERRAIN / 40, TERRAIN / 40);
  const terrain = new THREE.Mesh(
    new THREE.PlaneGeometry(TERRAIN, TERRAIN, TERRAIN_CELLS, TERRAIN_CELLS).rotateX(-Math.PI / 2),
    cel({ color: 0xffffff, map: terrainTex, bands: 3, tint: 0x7a7396, cache: false }),
  );
  terrain.position.y = -0.05;
  terrain.receiveShadow = true;
  terrain.name = 'terrain';
  group.add(terrain);

  /* ---- paint ---- */
  const white = cel({ color: PAL.lineWhite, bands: 2, tint: 0x8e86ad, cache: false });
  const yellow = cel({ color: PAL.lineYellow, bands: 2, tint: 0x8a7a70, cache: false });
  const asphalt = cel({ color: PAL.road, bands: 3, tint: 0x6a608f, cache: false });
  const paint = new Paint();
  const painted = { lanes: 0, bays: 0, startBox: 0, logos: 0, parking: 0, arrows: 0, ruts: 0 };

  /* The line round the plot, on a ground anybody would paint one on. */
  const ex = W / 2 - EDGE_LINE_INSET;
  const ez = D / 2 - EDGE_LINE_INSET;
  if (G.edgeLine) {
    paint.outline(yellow, 0, 0, 0, -ex, ex, -ez, ez, LINE_W, 0.008);
  }
  if (groundId === 'tarmac') {
    painted.repairs = tarmacRepairs(paint, placed, doc, cover);
    tarmacMarks(paint, white, placed, painted, cover);
  }

  for (const it of placed.items) {
    const type = it.el.type;
    /*
     * A BRIDGE MEANS A ROAD UNDER IT. The lane is painted square to the
     * span, through the middle of it, from kerb to kerb, so a footbridge is
     * a footbridge over something. A bridge only ever stands at a quarter
     * turn (it has boxes), so the lane is always along a world axis. Where
     * one of the map's own roads runs under it, that road is the something,
     * and a second lane painted beneath it would be two roads in one place.
     */
    if (type === 'bridge' && roadUnder(it, cover)) {
      painted.lanesUnderRoads = (painted.lanesUnderRoads || 0) + 1;
    } else if (type === 'bridge') {
      const span = it.el.dims.span;
      const foot = it.el.style === 'footbridge';
      const col = foot ? 0.18 : 0.6;
      const laneW = Math.max(3, Math.min(7, span - 2 * (0.8 + col + 0.6)));
      const S = { s: 0, c: 1 };
      sincos(it.yaw, S);
      /* The lane runs along the bridge's local z. */
      const alongX = Math.abs(S.s) > 0.5;
      const len = alongX ? W : D;
      const cx = alongX ? 0 : it.x;
      const cz = alongX ? it.z : 0;
      const lw = alongX ? len : laneW;
      const ld = alongX ? laneW : len;
      paint.rect(asphalt, cx, cz, lw, ld, 0, 0.004);
      /* Edge lines, and a dashed centre line: three metres on, three off. */
      const off = laneW / 2 - 0.3;
      for (const s of [-1, 1]) {
        if (alongX) {
          paint.rect(white, 0, it.z + s * off, len, 0.12, 0, 0.01);
        } else {
          paint.rect(white, it.x + s * off, 0, 0.12, len, 0, 0.01);
        }
      }
      for (let a = -len / 2 + 1.5; a < len / 2 - 3; a += 6) {
        if (alongX) {
          paint.rect(white, a + 1.5, it.z, 3, 0.12, 0, 0.01);
        } else {
          paint.rect(white, it.x, a + 1.5, 0.12, 3, 0, 0.01);
        }
      }
      painted.lanes += 1;
    }
    /* A container stack gets its bay painted round it, half a metre out. */
    if (type === 'containers' && G.bays) {
      const b = planBounds(it.parts);
      paint.outline(yellow, it.x, it.z, it.yaw, b.x0 - 0.6, b.x1 + 0.6, b.z0 - 0.6, b.z1 + 0.6, LINE_W, 0.008);
      painted.bays += 1;
    }
    /* The launch box round the pads, and an arrow the way they face, when
     * the pads stand on the paving. Pads raised onto a roof are seated on
     * it (it.y, see placeDocument), and this paint is the paving's, so it
     * would lie at 0 inside the building under them. */
    if (type === 'startPads' && it.y === 0) {
      const b = planBounds(it.parts);
      paint.outline(white, it.x, it.z, it.yaw, b.x0 - 1.0, b.x1 + 1.6, b.z0 - 0.8, b.z1 + 0.8, 0.12, 0.009);
      const S = { s: 0, c: 1 };
      sincos(it.yaw, S);
      const at = (lx, lz) => [it.x + lx * S.c + lz * S.s, it.z - lx * S.s + lz * S.c];
      /* A chevron ahead of the box, pointing the way the pads face: two
       * bars from 0.9 m either side up to a tip on the heading. */
      const tip = b.x1 + 3.6;
      for (const side of [-1, 1]) {
        const [mx, mz] = at(tip - 0.45, side * 0.45);
        paint.rect(white, mx, mz, 1.27, 0.16, it.yaw + side * (Math.PI / 4), 0.009);
      }
      painted.startBox += 1;
    }
  }
  paint.finish(group);
  if (groundId === 'dirt') {
    const ruts = dirtRuts(placed, doc, cover);
    if (ruts) {
      group.add(ruts.mesh);
      painted.ruts = ruts.count;
    }
  }

  /* ---- the sponsors' marks, from the document's own logos ---- */
  const logos = [];
  for (const it of placed.items) {
    if (it.el.type !== 'groundLogo') {
      continue;
    }
    const mark = logoForDecal(doc, it.el);
    if (!mark || typeof mark.image !== 'string' || !mark.image.startsWith('data:image/')) {
      continue;
    }
    logos.push(groundLogo(it, mark.image));
    painted.logos += 1;
  }
  for (const l of logos) {
    group.add(l.mesh);
  }
  return {
    group,
    painted,
    cancelLogos() {
      for (const l of logos) {
        l.cancel();
      }
    },
  };
}

/*
 * ONE GROUND LOGO: a plane the size of the decal's footprint, carrying a
 * canvas the mark is fitted into once it has decoded.
 *
 * The canvas is the footprint's own shape, and it is laid on the plane the
 * way src/render/scene.js lays its pitch: a PlaneGeometry turned down about
 * X puts canvas right along the decal's local x and canvas down along its
 * local z, and the element's heading then turns the plane exactly as it
 * turns the element. Painted with paintGroundLogo at the same ink the race
 * field uses, so a sponsor's mark on a yard reads as paint, not a sticker.
 */
function groundLogo(it, dataUrl) {
  const w = Math.max(0.1, it.el.dims.width);
  const d = Math.max(0.1, it.el.dims.depth);
  const long = 512;
  const cw = w >= d ? long : Math.max(8, Math.round((long * w) / d));
  const ch = w >= d ? Math.max(8, Math.round((long * d) / w)) : long;
  const cv = document.createElement('canvas');
  cv.width = cw;
  cv.height = ch;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const mat = cel({ color: 0xffffff, map: tex, bands: 3, tint: 0x6f6790, transparent: true, depthWrite: false, cache: false });
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -2;
  mat.polygonOffsetUnits = -2;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), mat);
  mesh.position.set(it.x, 0.014, it.z);
  mesh.rotation.y = it.yaw;
  mesh.receiveShadow = true;
  mesh.name = 'groundLogo';
  let live = true;
  const img = new Image();
  img.onload = () => {
    if (!live) {
      return;
    }
    const g = cv.getContext('2d');
    g.imageSmoothingQuality = 'high';
    paintGroundLogo(g, cw, ch, { logo: img });
    tex.needsUpdate = true;
  };
  img.src = dataUrl;
  return {
    mesh,
    cancel() {
      live = false;
      img.onload = null;
    },
  };
}
