/*
 * index.js: Heads' house as a map, built the way Nick Burns' house is
 * (../house/index.js): the built map's pipeline (../built/index.js) does
 * all of it, the sky, the ground, the ink, the shadows, the colliders, the
 * cull, the named gaps, the marks. This file hands it the house's document
 * (./yard.js) and the house itself (./heads.js) as one structure of its
 * own, draws what the parts cannot say, and names the world.
 *
 * WHAT THE DRAW ADDS, in the world frame, after the kit has drawn every
 * part the house marks as drawn:
 *
 *   prisms   the roofs' slopes, gables and fascias: a profile extruded
 *            along one axis. Drawn only; their solids are the roofs' bands.
 *   flats    paving that is not a rectangle: the patio's curve, the walks
 *            and the asphalt round each corner's kerb return. Drawn only.
 *   discs    the manhole lid. cyls: the stop sign's octagon, the
 *            trampoline. cones: the red tree, Santa's hat.
 *   scaled   the town's own trees and cars drawn through a frame S times
 *            their size; their solids are the same parts scaled the same
 *            way (./heads.js), drawn nowhere.
 *
 * And, on top, the PRINTS: the Infinity Loops banner, the sticker wall,
 * the WIDE TURNS sign and the flag in the garage, painted on one canvas
 * here and laid on their walls as four quads in one mesh. The banner's
 * lettering is drawn here, not copied from Heads' artwork, and the
 * stickers are made up, not his.
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
import { buildMap as buildBuilt } from '../built/index.js';
import { warmPrograms } from '../../render/warm.js';
import { headsLayout, basementFloorAt, BASEMENT_HOLE, FRAME, worldAt, PRINTS } from './heads.js';
import { headsDocument } from './yard.js';
import { INK_COLOR } from '../../render/comic.js';

const CHUNK = 'extra';

/* Prisms along x are drawn turned a quarter, so the kit's extrusion along
 * its local z runs east; along y they are drawn unturned and run south. */
function drawPrisms(kit, prisms) {
  const { OX, OZ, S } = FRAME;
  kit.begin(0, 0, 0, Math.PI / 2, CHUNK);
  for (const p of prisms) {
    if (p.axis === 'x') {
      kit.extrude(p.m, p.profile.map(([a, h]) => [S * a - OZ, S * h]), OX + S * p.e0, OX + S * p.e1);
    }
  }
  kit.begin(0, 0, 0, 0, CHUNK);
  for (const p of prisms) {
    if (p.axis === 'y') {
      kit.extrude(p.m, p.profile.map(([a, h]) => [OX + S * a, S * h]), OZ - S * p.e1, OZ - S * p.e0);
    }
  }
}

/* A flat is a plan polygon extruded up: the kit's extrusion runs along its
 * local z, so the frame is turned a quarter about x first, which takes a
 * profile point (x, -z) to the ground and the extrusion to the height. */
function drawFlats(kit, flats) {
  const { S } = FRAME;
  kit.begin(0, 0, 0, 0, CHUNK);
  kit.place.multiply(new kit.THREE.Matrix4().makeRotationX(-Math.PI / 2));
  for (const f of flats) {
    const pts = f.pts.map(([px, py]) => {
      const [x, , z] = worldAt(px, py, 0);
      return [x, -z];
    });
    kit.extrude(f.m, pts, S * f.h0, S * f.h1);
  }
}

function drawDiscs(kit, discs) {
  const { S } = FRAME;
  kit.begin(0, 0, 0, 0, CHUNK);
  for (const d of discs) {
    const [x, y, z] = worldAt(d.px, d.py, d.h);
    kit.cyl(d.m, [x, 0, z], [x, y, z], S * d.r, 24);
  }
}

function drawScaled(kit, scaled) {
  const T = kit.THREE;
  for (const a of scaled) {
    const [x, y, z] = worldAt(a.px, a.py, a.h);
    kit.begin(x, y, z, a.yaw, a.chunk);
    kit.place.multiply(new T.Matrix4().makeScale(a.k, a.k, a.k));
    kit.element(a.el);
  }
}

function drawHouse(kit, L) {
  drawPrisms(kit, L.prisms);
  drawFlats(kit, L.flats);
  drawDiscs(kit, L.discs);
  kit.begin(0, 0, 0, 0, CHUNK);
  for (const c of L.cyls) {
    kit.cyl(c.m, c.a, c.b, c.r, c.seg);
  }
  for (const c of L.cones) {
    kit.cone(c.m, c.base, c.r, c.h, 12);
  }
  drawScaled(kit, L.scaled);
}

/*
 * A level plane of the ground's with a rectangle cut out of it: the
 * basement's footprint, so the field's plane does not cross the room at the
 * lawn's height. ../house/index.js's openGround, which cuts the stair's
 * hole out of Nick's ground the same way and says how.
 */
function openGround(scene, name, rect) {
  const mesh = scene.getObjectByName(name);
  if (!mesh) {
    return;
  }
  const { x, z } = mesh.position;
  const hole = { x0: rect.x0 - x, x1: rect.x1 - x, z0: rect.z0 - z, z1: rect.z1 - z };
  const old = mesh.geometry;
  const names = Object.keys(old.attributes);
  const sizes = names.map((n) => old.attributes[n].itemSize);
  const at = names.indexOf('position');
  const off = sizes.slice(0, at).reduce((a, b) => a + b, 0);
  const read = (i) => {
    const v = [];
    names.forEach((n, k) => {
      const a = old.attributes[n].array;
      for (let c = 0; c < sizes[k]; c += 1) {
        v.push(a[i * sizes[k] + c]);
      }
    });
    return v;
  };
  const count = old.attributes.position.count;
  const verts = [];
  for (let i = 0; i < count; i += 1) {
    verts.push(read(i));
  }
  const X = (v) => v[off];
  const Z = (v) => v[off + 2];
  const lerp = (p, q, t) => p.map((a, k) => a + (q[k] - a) * t);
  const split = (poly, d) => {
    const keep = [];
    const rest = [];
    for (let i = 0; i < poly.length; i += 1) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const dp = d(p);
      const dq = d(q);
      (dp >= 0 ? keep : rest).push(p);
      if (dp >= 0 !== dq >= 0) {
        const v = lerp(p, q, dp / (dp - dq));
        keep.push(v);
        rest.push(v);
      }
    }
    return [keep, rest];
  };
  const sides = [(v) => hole.x0 - X(v), (v) => X(v) - hole.x1, (v) => hole.z0 - Z(v), (v) => Z(v) - hole.z1];
  const src = old.index ? old.index.array : Array.from({ length: count }, (_, i) => i);
  const index = [];
  for (let t = 0; t < src.length; t += 3) {
    const tri = [src[t], src[t + 1], src[t + 2]];
    const xs = tri.map((i) => X(verts[i]));
    const zs = tri.map((i) => Z(verts[i]));
    if (Math.max(...xs) <= hole.x0 || Math.min(...xs) >= hole.x1 || Math.max(...zs) <= hole.z0 || Math.min(...zs) >= hole.z1) {
      index.push(...tri);
      continue;
    }
    let rest = tri.map((i) => verts[i]);
    for (const d of sides) {
      const [keep, left] = split(rest, d);
      for (let k = 1; k + 1 < keep.length; k += 1) {
        for (const v of [keep[0], keep[k], keep[k + 1]]) {
          index.push(verts.length);
          verts.push(v);
        }
      }
      rest = left;
      if (rest.length < 3) {
        break;
      }
    }
  }
  const G = new THREE.BufferGeometry();
  names.forEach((n, k) => {
    const start = sizes.slice(0, k).reduce((a, b) => a + b, 0);
    const a = new Float32Array(verts.length * sizes[k]);
    verts.forEach((v, i) => {
      for (let c = 0; c < sizes[k]; c += 1) {
        a[i * sizes[k] + c] = v[start + c];
      }
    });
    G.setAttribute(n, new THREE.BufferAttribute(a, sizes[k]));
  });
  G.setIndex(index);
  G.computeBoundingBox();
  G.computeBoundingSphere();
  old.dispose();
  mesh.geometry = G;
}

/* ------------------------------------------------------------------ */
/* The prints                                                          */
/* ------------------------------------------------------------------ */

/* Where each print is on the canvas, in pixels: x, y (down), w, h. */
const ATLAS = 1024;
const CELLS = {
  banner: [0, 0, 1024, 256],
  stickers: [0, 256, 1024, 512],
  sign: [0, 768, 512, 128],
  flag: [512, 768, 512, 256],
};

/* A small seeded stream, so the sticker wall is the same every build. */
function stream(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function paintAtlas() {
  const c = document.createElement('canvas');
  c.width = ATLAS;
  c.height = ATLAS;
  const g = c.getContext('2d');
  /* The banner: dark, red and white stripes at its end, the name in red
   * edged white. */
  {
    const [x, y, w, h] = CELLS.banner;
    g.fillStyle = '#141a2e';
    g.fillRect(x, y, w, h);
    g.save();
    g.beginPath();
    g.rect(x, y, w, h);
    g.clip();
    g.translate(x + w * 0.8, y);
    g.rotate(0.35);
    for (let i = 0; i < 6; i += 1) {
      g.fillStyle = i % 2 ? '#f1f1f1' : '#c8232c';
      g.fillRect(i * 40, -80, 40, h * 1.8);
    }
    g.restore();
    g.fillStyle = '#141a2e';
    g.fillRect(x, y, w * 0.78, h);
    g.font = 'italic bold 104px Georgia, "Times New Roman", serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 12;
    g.strokeStyle = '#f4f4f4';
    g.fillStyle = '#d42a33';
    g.strokeText('Infinity Loops', x + w * 0.39, y + h * 0.52);
    g.fillText('Infinity Loops', x + w * 0.39, y + h * 0.52);
  }
  /* The sticker wall: three hundred stickers, round and square, words
   * on some. Made up here. */
  {
    const [x, y, w, h] = CELLS.stickers;
    const r = stream(23);
    g.fillStyle = '#2b2d33';
    g.fillRect(x, y, w, h);
    g.save();
    g.beginPath();
    g.rect(x, y, w, h);
    g.clip();
    const cols = ['#e63b2e', '#f2c230', '#2fa4e7', '#38c172', '#9b59d0', '#ff7a1a', '#f5f5f5', '#ff4fa3', '#1d1d1d', '#21c7c7'];
    const words = ['FPV', 'SEND IT', '90%', 'LOOPS', 'WHOOP', 'RIP', 'AIR', 'TINY', 'GO FLY', 'BIND', 'ARM', 'PROPS ON', 'DVR'];
    for (let i = 0; i < 320; i += 1) {
      g.save();
      g.translate(x + r() * w, y + r() * h);
      g.rotate((r() - 0.5) * 1.2);
      const s = 18 + r() * 46;
      const col = cols[(r() * cols.length) | 0];
      g.fillStyle = '#ffffff';
      if (r() < 0.35) {
        g.beginPath();
        g.arc(0, 0, s * 0.62, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = col;
        g.beginPath();
        g.arc(0, 0, s * 0.54, 0, Math.PI * 2);
        g.fill();
      } else {
        g.fillRect(-s * 0.8, -s * 0.42, s * 1.6, s * 0.84);
        g.fillStyle = col;
        g.fillRect(-s * 0.74, -s * 0.36, s * 1.48, s * 0.72);
      }
      if (r() < 0.6) {
        g.fillStyle = col === '#f5f5f5' || col === '#f2c230' ? '#1d1d1d' : '#ffffff';
        g.font = `bold ${(s * 0.32) | 0}px system-ui, sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(words[(r() * words.length) | 0], 0, 0, s * 1.4);
      }
      g.restore();
    }
    g.restore();
  }
  /* The yellow WIDE TURNS sign. */
  {
    const [x, y, w, h] = CELLS.sign;
    g.fillStyle = '#f2c214';
    g.fillRect(x, y, w, h);
    g.lineWidth = 8;
    g.strokeStyle = '#141414';
    g.strokeRect(x + 8, y + 8, w - 16, h - 16);
    g.fillStyle = '#141414';
    g.font = 'bold 64px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('WIDE TURNS', x + w / 2, y + h / 2 + 3);
  }
  /* The flag. */
  {
    const [x, y, w, h] = CELLS.flag;
    for (let i = 0; i < 13; i += 1) {
      g.fillStyle = i % 2 ? '#f4f4f4' : '#b22234';
      g.fillRect(x, y + (i * h) / 13, w, h / 13 + 1);
    }
    g.fillStyle = '#3c3b6e';
    g.fillRect(x, y, w * 0.4, (h * 7) / 13);
    g.fillStyle = '#ffffff';
    for (let i = 0; i < 9; i += 1) {
      for (let j = 0; j < (i % 2 ? 5 : 6); j += 1) {
        g.beginPath();
        g.arc(x + 14 + j * 34 + (i % 2) * 17, y + 10 + i * 15, 3.5, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/* The four prints as quads on their walls, one mesh. A wall facing +x is
 * read looking west, so its texture runs toward -z; one facing +z, looking
 * north, runs toward +x. */
function printMesh(map) {
  const pos = [];
  const uv = [];
  const idx = [];
  for (const [name, p] of Object.entries(PRINTS)) {
    const [cx, cy, cw, ch] = CELLS[name];
    const u0 = cx / ATLAS;
    const u1 = (cx + cw) / ATLAS;
    const v0 = 1 - (cy + ch) / ATLAS;
    const v1 = 1 - cy / ATLAS;
    const base = pos.length / 3;
    const corner = (s, t) => (p.face === 'x+'
      ? [p.at, p.h0 + t * (p.h1 - p.h0), p.a1 - s * (p.a1 - p.a0)]
      : [p.a0 + s * (p.a1 - p.a0), p.h0 + t * (p.h1 - p.h0), p.at]);
    for (const [s, t] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      pos.push(...corner(s, t));
      uv.push(u0 + s * (u1 - u0), v0 + t * (v1 - v0));
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map, fog: false }));
  mesh.name = 'heads prints';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

/* The house's pen and grade, Nick Burns' house's (../house/index.js
 * houseInk says why), so the two houses read alike inside. */
const HOUSE_PEN = 1.6;
const HOUSE_KEEN = 0.9;
const HOUSE_CORNER_KEEN = 0.5;
const HOUSE_SATURATION = 0.96;
function houseInk(post) {
  const u = post && post.ink && post.ink.mat && post.ink.mat.uniforms;
  if (!u) {
    return;
  }
  u.uInk.value.setHex(INK_COLOR);
  u.uConcaveAmount.value = 1;
  u.uSens.value *= HOUSE_PEN * HOUSE_KEEN;
  u.uConcave.value *= HOUSE_PEN * HOUSE_CORNER_KEEN;
  u.uThickness.value *= HOUSE_PEN;
  post.inkWeight = (post.inkWeight || 1) * HOUSE_PEN;
  const gr = post.grade && post.grade.mat && post.grade.mat.uniforms;
  if (gr && gr.uSaturation) {
    gr.uSaturation.value = HOUSE_SATURATION;
  }
}

export async function buildMap(shell, onProgress, options) {
  const L = headsLayout();
  const extra = {
    el: { id: 'heads', type: 'heads' },
    parts: L.parts,
    draw: (kit) => drawHouse(kit, L),
    floor: basementFloorAt,
  };
  const doc = headsDocument();
  const map = await buildBuilt(shell, onProgress, {
    ...(options || {}), document: doc, extra, sponsorMarks: false,
  });
  /* Its own world: the shell keys the world, the results and the board's
   * refusal by this id (src/main.js, src/ui/ui.js), and `source` keeps its
   * marks out of the board's counters. */
  map.id = 'heads';
  map.source = 'heads';
  openGround(map.scene, 'plot', BASEMENT_HOLE);
  openGround(map.scene, 'terrain', BASEMENT_HOLE);
  map.scene.add(printMesh(paintAtlas()));
  houseInk(map.post);
  await warmPrograms(shell.renderer, map.scene, shell.camera, map.post.rtScene);
  return map;
}
