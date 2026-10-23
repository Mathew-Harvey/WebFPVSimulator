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
 * And, on top, the LOGOS (./logos.js says where and why): every roster
 * brand's sign hung once, and only once, and found as on any freestyle
 * map, the Infinity Loops logos and the 90% patch painted on the street,
 * the fence, the walls and the rooms, and eleven 90% patches to be
 * found, the achievement "90%er". With them the garage's four prints: the
 * Infinity Loops banner, the sticker wall, bombed with the 90%ers' own
 * stickers, the WIDE TURNS sign and the flag. All of it is painted on one
 * canvas here, the atlas, and laid as quads in two meshes.
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
import { makeMan } from './mandraw.js';
import {
  SHEETS, SHEET_PX, ACHIEVEMENT, IL_LOGO, IL_OUTLINE, PATCH, WALL_STICKERS,
  ATLAS_W, ATLAS_H, CELLS, placeSigns, placeDecals, placePatches,
} from './logos.js';
import { paintMaterial } from '../../art/stf.js';
import { stfKey } from '../built/egg.js';
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
/* The logos and the prints                                            */
/* ------------------------------------------------------------------ */

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

/* A sheet as a decoded picture, or null when it does not come: the logos
 * cut from it are then left out and the rest of the map flies. */
function loadSheet(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      console.warn(`heads: ${url} did not load; the logos cut from it are left off`);
      resolve(null);
    };
    img.src = url;
  });
}

/*
 * The atlas (CELLS in ./logos.js) painted: the Infinity Loops logos and
 * the 90% patch cut from the 90%ers' sheets, and the garage's four
 * prints. The banner is the Infinity Loops logo on its dark board with
 * the red and white stripes at its end; the sticker wall is the 90%ers'
 * own stickers, every one, bombed over the board with two patches and the
 * logo on top.
 */
function paintAtlas(sheets) {
  const c = document.createElement('canvas');
  c.width = ATLAS_W;
  c.height = ATLAS_H;
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  /* A crop of a sheet into a box, or nothing when its sheet did not come. */
  const cut = (cr, x, y, w, h) => {
    const img = sheets[cr.sheet];
    if (!img) {
      return false;
    }
    const W = img.naturalWidth;
    const H = img.naturalHeight;
    g.drawImage(img, cr.x * W, cr.y * H, cr.w * W, cr.h * H, x, y, w, h);
    return true;
  };
  const aspect = (cr) => (cr.w * SHEET_PX[cr.sheet][0]) / (cr.h * SHEET_PX[cr.sheet][1]);
  /* The banner. */
  {
    const { x, y, w, h } = CELLS.banner;
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
    const lh = h * 0.86;
    const lw = lh * aspect(IL_LOGO);
    if (!cut(IL_LOGO, x + (w * 0.78 - lw) / 2, y + (h - lh) / 2, lw, lh)) {
      g.font = 'italic bold 104px Georgia, "Times New Roman", serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineWidth = 12;
      g.strokeStyle = '#f4f4f4';
      g.fillStyle = '#d42a33';
      g.strokeText('Infinity Loops', x + w * 0.39, y + h * 0.52);
      g.fillText('Infinity Loops', x + w * 0.39, y + h * 0.52);
    }
  }
  /* The sticker wall: the 90%ers' stickers in a shuffled, jittered grid,
   * each turned and overlapping the next, then two patches and the logo. */
  {
    const { x, y, w, h } = CELLS.stickers;
    const r = stream(23);
    g.fillStyle = '#2b2d33';
    g.fillRect(x, y, w, h);
    g.save();
    g.beginPath();
    g.rect(x, y, w, h);
    g.clip();
    const order = WALL_STICKERS.map((s) => ({ s, k: r() })).sort((a, b) => a.k - b.k).map((o) => o.s);
    const cols = 14;
    const rows = Math.ceil(order.length / cols);
    const put = (cr, cx, cy, size, turn) => {
      const a = aspect(cr);
      const sw = a >= 1 ? size : size * a;
      const sh = a >= 1 ? size / a : size;
      g.save();
      g.translate(cx, cy);
      g.rotate(turn);
      cut(cr, -sw / 2, -sh / 2, sw, sh);
      g.restore();
    };
    order.forEach((s, i) => {
      const cx = x + ((i % cols) + 0.5 + (r() - 0.5) * 0.5) * (w / cols);
      const cy = y + (Math.floor(i / cols) + 0.5 + (r() - 0.5) * 0.5) * (h / rows);
      put(s, cx, cy, 78 + r() * 16, (r() - 0.5) * 0.9);
    });
    put(PATCH, x + w * 0.22, y + h * 0.62, 118, -0.2);
    put(PATCH, x + w * 0.83, y + h * 0.3, 104, 0.25);
    put(IL_LOGO, x + w * 0.52, y + h * 0.45, 190, -0.08);
    g.restore();
  }
  /* The yellow WIDE TURNS sign. */
  {
    const { x, y, w, h } = CELLS.sign;
    g.fillStyle = '#f2c214';
    g.fillRect(x, y, w, h);
    g.lineWidth = 5;
    g.strokeStyle = '#141414';
    g.strokeRect(x + 5, y + 5, w - 10, h - 10);
    g.fillStyle = '#141414';
    g.font = 'bold 38px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('WIDE TURNS', x + w / 2, y + h / 2 + 2);
  }
  /* The flag. */
  {
    const { x, y, w, h } = CELLS.flag;
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
        g.arc(x + 6 + j * 11.5 + (i % 2) * 5.75, y + 4 + i * 5.6, 1.4, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  /* The two Infinity Loops logos and the patch. */
  for (const [name, cr] of [['il', IL_LOGO], ['ilOutline', IL_OUTLINE], ['patch', PATCH]]) {
    const { x, y, w, h } = CELLS[name];
    cut(cr, x, y, w, h);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/* The garage's four prints (PRINTS in ./heads.js) in the shape a logo
 * has: a middle, a normal and an up. A wall facing +x is read looking
 * west, so its picture runs toward -z; one facing +z runs toward +x. */
function printQuads() {
  return Object.entries(PRINTS).map(([cell, p]) => {
    const along = (p.a0 + p.a1) / 2;
    return {
      cell,
      p: p.face === 'x+' ? [p.at, (p.h0 + p.h1) / 2, along] : [along, (p.h0 + p.h1) / 2, p.at],
      n: p.face === 'x+' ? [1, 0, 0] : [0, 0, 1],
      up: [0, 1, 0],
      w: Math.abs(p.a1 - p.a0),
      h: p.h1 - p.h0,
    };
  });
}

/*
 * Every logo in `items` as a quad on its cell of the atlas, one mesh:
 * each { cell, p, n, up, w, h, turn } in the world, `p` its middle and
 * `turn` how far it is turned in its face, radians. Normals for the lit
 * one outside, whose paint is black without them.
 */
function logoMesh(items, material, name) {
  const pos = [];
  const nor = [];
  const uv = [];
  const idx = [];
  const n = new THREE.Vector3();
  const up = new THREE.Vector3();
  const right = new THREE.Vector3();
  const r = new THREE.Vector3();
  const u = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (const q of items) {
    const cell = CELLS[q.cell];
    const u0 = cell.x / ATLAS_W;
    const u1 = (cell.x + cell.w) / ATLAS_W;
    const v0 = 1 - (cell.y + cell.h) / ATLAS_H;
    const v1 = 1 - cell.y / ATLAS_H;
    n.fromArray(q.n);
    up.fromArray(q.up);
    right.crossVectors(up, n).normalize();
    up.crossVectors(n, right).normalize();
    const a = q.turn || 0;
    r.copy(right).multiplyScalar(Math.cos(a)).addScaledVector(up, Math.sin(a));
    u.copy(up).multiplyScalar(Math.cos(a)).addScaledVector(right, -Math.sin(a));
    const base = pos.length / 3;
    for (const [sx, sy, tu, tv] of [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]]) {
      c.fromArray(q.p).addScaledVector(r, (sx * q.w) / 2).addScaledVector(u, (sy * q.h) / 2);
      pos.push(c.x, c.y, c.z);
      nor.push(n.x, n.y, n.z);
      uv.push(u0 + tu * (u1 - u0), v0 + tv * (v1 - v0));
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = name;
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
  /* The pictures the logos are cut from, asked for first so they come
   * while the world builds: the two sheets. The roster's signs are hung
   * by the built map (`markSpots`), which draws their own artwork. */
  const sheetsCame = Promise.all(SHEETS.map((s) => loadSheet(s.url)));
  const L = headsLayout();
  const extra = {
    el: { id: 'heads', type: 'heads' },
    parts: L.parts,
    draw: (kit) => drawHouse(kit, L),
    floor: basementFloorAt,
  };
  const doc = headsDocument();
  /* Every roster brand's sign hung by hand (./logos.js), the chooser's
   * spots off: it sees the yard and not the house. */
  const markSpots = placeSigns(L.parts, CHUNK).filter(Boolean);
  const map = await buildBuilt(shell, onProgress, {
    ...(options || {}), document: doc, extra, sponsorMarks: false, markSpots,
  });
  /* Its own world: the shell keys the world, the results and the board's
   * refusal by this id (src/main.js, src/ui/ui.js), and `source` is the word
   * the board counts its partner signs under (MARK_MAP_WORDS in src/main.js). */
  map.id = 'heads';
  map.source = 'heads';
  openGround(map.scene, 'plot', BASEMENT_HOLE);
  openGround(map.scene, 'terrain', BASEMENT_HOLE);
  /* The logos all over it and the garage's prints, two meshes on one
   * picture: unlit indoors as the prints always were, lit paint outside
   * as a partner's sign is (paintMaterial in src/art/stf.js). */
  const sheets = await sheetsCame;
  const atlas = paintAtlas(sheets);
  const decals = placeDecals(L.parts).filter(Boolean);
  const patches = placePatches(L.parts).filter(Boolean).map((s) => ({ ...s, cell: 'patch' }));
  const indoor = new THREE.MeshBasicMaterial({
    map: atlas, alphaTest: 0.5, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  map.scene.add(logoMesh([...printQuads(), ...decals.filter((d) => d.inside), ...patches.filter((s) => s.inside)], indoor, 'heads prints'));
  const outdoor = logoMesh([...decals.filter((d) => !d.inside), ...patches.filter((s) => !s.inside)], paintMaterial(THREE, atlas), 'heads logos');
  outdoor.receiveShadow = true;
  map.scene.add(outdoor);
  /* The 90% patches to be found, called out every time each comes back
   * into sight, under the house's key, as the Infinity Loops map's are. */
  map.stickers = [
    ...map.stickers,
    ...patches.map((s) => ({
      id: `ninety-${s.id}`,
      key: `${stfKey(doc, 'heads')}#sticker:ninety-${s.id}`,
      name: s.name,
      achievement: ACHIEVEMENT,
      crop: { x: PATCH.x, y: PATCH.y, w: PATCH.w, h: PATCH.h },
      sheet: sheets[PATCH.sheet] ? { image: sheets[PATCH.sheet] } : null,
      p: s.p,
      n: s.n,
      up: s.up,
      w: s.w,
      h: s.h,
    })),
  ];
  map.stickersEverySighting = true;
  /* Drawn near first: see nearFirstSort in src/main.js. */
  map.nearFirst = true;
  houseInk(map.post);
  /* Heads in his garage (./man.js, ./mandraw.js): in the map's scene, so its
   * dispose frees him, and added before the programs are warmed so his is
   * linked with the rest. */
  const man = makeMan(shell.camera, () => (shell.quad ? shell.quad.position : null));
  map.scene.add(man.group);
  await warmPrograms(shell.renderer, map.scene, shell.camera, map.post.rtScene);
  const anim = map.updateAnim;
  map.updateAnim = (step) => {
    anim(step);
    man.update(step);
  };
  const stats = map.stats;
  map.stats = () => ({ ...stats(), heads: man.stats() });
  return map;
}
