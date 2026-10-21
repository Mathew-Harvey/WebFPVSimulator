/*
 * index.js: Nick Burns' house as a map. The built map's pipeline
 * (../built/index.js) does all of it: the sky, the ground, the ink, the
 * shadows, the colliders, the cull, the named gaps, the marks. This file
 * hands it the house's document (./yard.js) and the house itself
 * (./house.js) as one structure of its own, draws what the parts cannot
 * say, and names the world.
 *
 * WHAT THE DRAW ADDS, in the world frame, after the kit has drawn every
 * part the house marks as drawn:
 *
 *   prisms   the roofs' slopes, gables and fascias, the slide: a profile
 *            extruded along one axis. Drawn only; their solids are the
 *            roofs' bands, which are parts.
 *   discs    the cul de sac's paving, its kerb and island, the mulch
 *            round the trees: level discs and rings, drawn only.
 *   cones    the patio umbrella.
 *   scaled   the town's own trees and cars, drawn through a frame k times
 *            their size, so a street tree is a tree over a house S
 *            times life size and a car is a car on its drive. Their solids
 *            are the same parts scaled the same way (scaledParts in
 *            ./house.js), drawn nowhere.
 *
 * The trees and the cars go in chunks of their own, so the house's own
 * batch is the house and nothing else, and a tree behind the pilot culls.
 *
 * Nick himself is added after the pipeline has built the rest: his life
 * in ./nick.js, his figure and his speech balloon in ./nickdraw.js. He is
 * drawn and never solid.
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
import { houseLayout, basementFloorAt, STAIR_HOLE, FRAME, worldAt } from './house.js';
import { houseDocument } from './yard.js';
import { makeNick } from './nickdraw.js';
import { placeStickers, stickerMesh, STICKER_URL, STICKER_WORD } from './stickers.js';
import { placeSupporters, seesRoom } from './supporters.js';
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

function drawDiscs(kit, discs) {
  const { S } = FRAME;
  kit.begin(0, 0, 0, 0, CHUNK);
  for (const d of discs) {
    const [x, y, z] = worldAt(d.px, d.py, d.h);
    if (d.r0) {
      kit.ring(d.m, [x, y, z], S * d.r0, S * d.r, y);
    } else {
      kit.cyl(d.m, [x, 0, z], [x, y, z], S * d.r, 48);
    }
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
  drawDiscs(kit, L.discs);
  kit.begin(0, 0, 0, 0, CHUNK);
  for (const c of L.cones) {
    kit.cone(c.m, c.base, c.r, c.h, 12);
  }
  drawScaled(kit, L.scaled);
}

/* A level plane of the ground's (../built/ground.js) with the basement
 * stair's hole cut out of it, so the stair is open from the landing. Two of
 * them lie across it: the field's 'plot' at zero and the 'terrain' five
 * centimetres under it. Every triangle that reaches into the hole is
 * clipped by the hole's four sides in turn and keeps what lies outside
 * each, every attribute interpolated along the cut edges, so the grass,
 * its tint and its light are exactly what the GPU drew there before. The
 * ground's own file is the landing page's too and stays as it is; this is
 * the house's, done once at build. */
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
  /* Splits a convex polygon by d(v) >= 0: the side kept, the side left. */
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

/*
 * THE HOUSE'S PEN, a manga artist's: black, heavier, and drawing every
 * inside corner as hard as an outside one. The owner, 2026-10-18: "Let's
 * make the house interior less blocky, less like Roblox more like a manga
 * comic book with cell shading." A room is all inside corners, where the
 * wall meets the floor, the ceiling and the next wall, and the town's pen
 * draws those at a fraction of its weight (uConcaveAmount), which is right
 * for a street seen from the air and leaves a room as unlined blocks of
 * colour. Here they are drawn full, in the comic layer's near black
 * (INK_COLOR) rather than the look's violet, a pen HOUSE_PEN times the
 * comic layer's, and a grade a little short of the look's saturation, so
 * the colours sit on paper rather than on plastic. The two band shading is
 * the other half (src/props/homes.js).
 *
 * Uniforms on this world's own copies of the ink and grade (paintPost in
 * ../built/looks.js), so nothing shared is touched and the cost is
 * nothing: the same passes, the same taps, the same programs. The convex
 * threshold goes up with the pen, a tenth keener, as comicPipeline's does,
 * so a heavier pen does not find new lines in every round thing's facets;
 * the inside corner's goes up only half as far, which is what draws the
 * line where a wall meets the floor. Judged on the same nine rooms shot
 * before and after: at a pen of 1.3 with both thresholds raised in step
 * the rooms were barely changed. The pilot's Manga switch still takes the
 * ink off (setInkLines in src/render/quality.js): this only changes how it
 * draws.
 */
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
  const g = post.grade && post.grade.mat && post.grade.mat.uniforms;
  if (g && g.uSaturation) {
    g.uSaturation.value = HOUSE_SATURATION;
  }
}

export async function buildMap(shell, onProgress, options) {
  const L = houseLayout();
  const extra = {
    el: { id: 'house', type: 'house' },
    parts: L.parts,
    draw: (kit) => drawHouse(kit, L),
    floor: basementFloorAt,
  };
  const doc = houseDocument();
  /* The supporters' signs hung by hand (./supporters.js), the chooser's
   * spots off: it sees the yard and not the house. */
  const markSpots = placeSupporters(L.parts, CHUNK).filter(Boolean);
  const map = await buildBuilt(shell, onProgress, {
    ...(options || {}), document: doc, extra, sponsorMarks: false, markSpots,
  });
  /* Its own world, not Your map: the shell keys the world, the results and
   * the board's refusal by this id (src/main.js, src/ui/ui.js), and `source`
   * keeps its marks out of the board's counters, which have no word for it. */
  map.id = 'house';
  map.source = 'house';
  openGround(map.scene, 'plot', STAIR_HOLE);
  openGround(map.scene, 'terrain', STAIR_HOLE);
  /* Nick at his patio table (./nick.js, ./nickdraw.js): in the map's scene,
   * so its dispose frees him, posed at the clock the map is handed, and his
   * two programs linked now beside the rest, since the map warmed its own
   * before he was there (render/warm.js). */
  const nick = makeNick(shell.camera, () => (shell.quad ? shell.quad.position : null));
  map.scene.add(nick.group);
  /* Nick's NB sticker round the house (./stickers.js): one mesh, shown
   * when its texture has come, and each one a sticker the shell looks for
   * and calls out every time it is framed, under the house's key. */
  const sheet = new THREE.TextureLoader().load(STICKER_URL, () => {
    nb.visible = true;
  });
  sheet.colorSpace = THREE.SRGBColorSpace;
  sheet.anisotropy = 4;
  const placed = placeStickers(L.parts).filter(Boolean);
  const nb = stickerMesh(THREE, placed, sheet);
  nb.visible = false;
  map.scene.add(nb);
  map.stickers = [
    ...map.stickers,
    ...placed.map((s) => ({
      id: `nb-${s.id}`,
      key: `${stfKey(doc, 'house')}#sticker:nb-${s.id}`,
      name: s.name,
      achievement: STICKER_WORD,
      crop: { x: 0, y: 0, w: 1, h: 1 },
      sheet,
      p: s.p,
      n: s.n,
      w: s.w,
      h: s.w,
    })),
  ];
  map.stickersEverySighting = true;
  houseInk(map.post);
  /* The supporters' signs, each drawn only from where its room can be
   * seen (seesRoom in ./supporters.js), found by the slug the sign's
   * panel carries (src/art/partnermark.js). The first showSigns runs
   * after warmPrograms, so every sign's program is linked while it is
   * still visible. */
  const roomOf = new Map(markSpots.map((m) => [m.slug, m.room]));
  const signs = [];
  map.scene.traverse((o) => {
    if (o.isMesh && o.userData.partner && roomOf.has(o.userData.partner)) {
      signs.push({ mesh: o, room: roomOf.get(o.userData.partner) });
    }
  });
  const showSigns = () => {
    const c = shell.camera.position;
    const x = (c.x - FRAME.OX) / FRAME.S;
    const y = (FRAME.OZ - c.z) / FRAME.S;
    const h = c.y / FRAME.S;
    const garage = seesRoom('garage', x, y, h);
    const workshop = seesRoom('workshop', x, y, h);
    for (const s of signs) {
      s.mesh.visible = s.room === 'garage' ? garage : workshop;
    }
  };
  await warmPrograms(shell.renderer, map.scene, shell.camera, map.post.rtScene);
  const anim = map.updateAnim;
  map.updateAnim = (step) => {
    anim(step);
    nick.update(step);
    showSigns();
  };
  /* Drawn near first: see nearFirstSort in src/main.js. */
  map.nearFirst = true;
  const stats = map.stats;
  map.stats = () => ({ ...stats(), nick: nick.stats() });
  return map;
}
