/*
 * index.js: Ekimae Drift, a map and a mini game. The owner's ask of 31
 * October 2026: a city map with drift cars to chase, that looks and feels
 * like a manga the way the town does.
 *
 * THE PLACE is ./plan.js (the expressway, the viaduct and the station, the
 * car park, the petrol station, the police box, the footbridge, the shrine,
 * the rotary, the arcade and the barriers) and ./yard.js (the document: the
 * course as a road, the drift cars on it, the town's own buildings along
 * every street, the poles and their wires, the trees and the parked cars),
 * built by the built map's pipeline as Drift Matsuri is, in the town's
 * look at golden hour, ink and all. Every colour it draws is one the kit
 * already has; the signs are one picture (./signs.js).
 *
 * THE CARS are the built map's drift cars, unchanged: three tandem pairs.
 * THE GAME is Drift Matsuri's (src/game/film.js): the pilot is the camera.
 *
 * FOR THE LATENCY RULE: on every other map, nothing (this file loads only
 * when the map is chosen). On this map the city is six chunks, and each
 * chunk's plain colours are folded into one batch by Sunnyfield's palette
 * merge (../sunny/palette.js), so a view of the whole city is a few dozen
 * draw calls before the cars. On Low what the plan marks `fine` is not
 * drawn: the crowd, the window frames, the rails, the lanterns' strings.
 * Nothing fine is solid, so the flight is the same on every preset. Per
 * frame on the CPU: the judge, as on Drift Matsuri, and nothing else.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildMap as buildBuilt } from '../built/index.js';
import { warmPrograms } from '../../render/warm.js';
import { qualityFor } from '../../render/quality.js';
import { paintMaterial } from '../../art/stf.js';
import { Film } from '../../game/film.js';
import { KINDS } from '../../game/collide.js';
import { mergePalette } from '../sunny/palette.js';
import { W, D, w, chunkOf } from './frame.js';
import { ekimaeLayout, ekimaeMarkSpots, CP } from './plan.js';
import { ekimaeDocument, groupIds, GROUPS } from './yard.js';
import { paintSigns, signMesh } from './signs.js';

/* A plan heading, for a block turned onto a run: render only. */
function heading(dx, dy) {
  return Math.atan2(dy, dx);
}

/* Start drawing in the world frame, in the chunk a plan point is in. */
function at(kit, x, y) {
  const p = w(x, y);
  kit.begin(0, 0, 0, 0, chunkOf(p[0], p[2]));
}

/* The barriers over their capsules: concrete blocks with a white top
 * band, or red and white ones on the outside of a corner. */
function drawWalls(kit, walls, low) {
  for (const s of walls) {
    const mx = (s.a[0] + s.b[0]) / 2;
    const my = (s.a[1] + s.b[1]) / 2;
    const dx = s.b[0] - s.a[0];
    const dy = s.b[1] - s.a[1];
    const len = Math.sqrt(dx * dx + dy * dy) + 0.04;
    const p = w(mx, my);
    kit.begin(p[0], 0, p[2], heading(dx, dy), chunkOf(p[0], p[2]));
    if (s.look === 'zone') {
      kit.box(s.i % 2 ? 'white' : 'drNoboriRed', -len / 2, 0, -0.42, len / 2, 0.92, 0.42);
    } else {
      /* A jersey block: a wide foot and a narrow top. */
      kit.box('concrete', -len / 2, 0, -0.42, len / 2, 0.3, 0.42);
      kit.box('concrete', -len / 2, 0.3, -0.26, len / 2, 0.92, 0.26);
      if (!low) {
        kit.box('white', -len / 2, 0.8, -0.27, len / 2, 0.9, 0.27);
      }
    }
  }
}

function lantern(kit, c) {
  kit.cyl('lampRed', [c[0], c[1] - 0.22, c[2]], [c[0], c[1] + 0.22, c[2]], 0.18, 6);
  kit.cyl('drToriiBlack', [c[0], c[1] + 0.22, c[2]], [c[0], c[1] + 0.27, c[2]], 0.12, 6);
  kit.cyl('drToriiBlack', [c[0], c[1] - 0.27, c[2]], [c[0], c[1] - 0.22, c[2]], 0.12, 6);
}

function lanternString(kit, d) {
  const A = w(d.a[0], d.a[1], d.a[2]);
  const B = w(d.b[0], d.b[1], d.b[2]);
  const pt = (t) => [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t - d.sag * 4 * t * (1 - t), A[2] + (B[2] - A[2]) * t];
  const N = 6;
  for (let i = 0; i < N; i += 1) {
    kit.cyl('rope', pt(i / N), pt((i + 1) / N), 0.012, 4);
  }
  const len = Math.hypot(B[0] - A[0], B[2] - A[2]);
  const n = Math.max(1, Math.floor(len / d.every));
  for (let i = 1; i < n; i += 1) {
    const p = pt(i / n);
    lantern(kit, [p[0], p[1] - 0.35, p[2]]);
  }
}

/* A shape in the plan's x and h, extruded along y from y0 to y1. */
function extrudeY(kit, m, profile, y0, y1) {
  kit.extrude(m, profile.map(([a, h]) => [a - W / 2, h]), D / 2 - y1, D / 2 - y0);
}

/* A roof or a lid: a profile in the plan's y and h, extruded along x. */
function prismX(kit, d) {
  const lo = Math.min(...d.profile.map(([a]) => a));
  const hi = Math.max(...d.profile.map(([a]) => a));
  const p = w((d.e0 + d.e1) / 2, (lo + hi) / 2);
  kit.begin(0, 0, 0, Math.PI / 2, chunkOf(p[0], p[2]));
  kit.extrude(d.m, d.profile.map(([a, h]) => [a - D / 2, h]), d.e0 - W / 2, d.e1 - W / 2);
}

function drawDecor(kit, decor, low) {
  for (const d of decor) {
    if (low && d.fine) {
      continue;
    }
    switch (d.t) {
      case 'fan': {
        at(kit, d.x, d.y);
        const p = w(d.x, d.y, d.h);
        const top = d.h + d.tall;
        kit.cyl(d.shirt, [p[0], d.h, p[2]], [p[0], top - 0.3, p[2]], 0.24, 6, 0.17);
        kit.blob('drSkin', [p[0], top - 0.12, p[2]], 0.17, 0.18, [0, d.x, 0]);
        if (d.cheer) {
          kit.cyl('drSkin', [p[0] + 0.15, top - 0.38, p[2]], [p[0] + 0.24, top + 0.22, p[2] + 0.05], 0.05, 4);
        }
        break;
      }
      case 'fence': {
        at(kit, d.a[0], d.a[1]);
        for (const t of [0.3, 0.55, 0.8]) {
          kit.cyl('rope', w(d.a[0], d.a[1], d.h * t), w(d.b[0], d.b[1], d.h * t), 0.012, 4);
        }
        kit.cyl('metal', w(d.a[0], d.a[1], d.h - 0.03), w(d.b[0], d.b[1], d.h - 0.03), 0.035, 4);
        break;
      }
      case 'lantern':
        at(kit, d.x, d.y);
        lantern(kit, w(d.x, d.y, d.h));
        break;
      case 'string':
        at(kit, d.a[0], d.a[1]);
        lanternString(kit, d);
        break;
      case 'cloth': {
        at(kit, d.x, d.y);
        const p = w(d.x, d.y);
        kit.box(d.m, p[0] - 0.02, d.h0, p[2] - 0.35, p[0] + 0.02, d.h1, p[2] + 0.35);
        kit.box('white', p[0] - 0.025, d.h1 - 0.35, p[2] - 0.35, p[0] + 0.025, d.h1 - 0.2, p[2] + 0.35);
        break;
      }
      case 'cyl':
        at(kit, d.a[0], d.a[1]);
        kit.cyl(d.m, w(...d.a), w(...d.b), d.r, d.seg ?? 6);
        break;
      case 'span':
        at(kit, (d.a[0] + d.b[0]) / 2, d.a[1]);
        kit.cyl(d.m, w(...d.a), w(...d.b), d.r, 3);
        break;
      case 'ball':
        at(kit, d.c[0], d.c[1]);
        kit.ball(d.m, w(...d.c), d.r);
        break;
      case 'disc': {
        at(kit, d.x, d.y);
        const p = w(d.x, d.y);
        kit.cyl(d.m, [p[0], d.h0, p[2]], [p[0], d.h1, p[2]], d.r, d.seg ?? 16);
        break;
      }
      case 'prism':
        prismX(kit, d);
        break;
      case 'arch': {
        /* The curve of a brick arch: the two haunches under the lintel,
         * so the bay's opening reads round and not square. */
        at(kit, (d.x0 + d.x1) / 2, d.y0);
        const span = d.x1 - d.x0;
        const rise = Math.min(1.6, span * 0.2);
        const curve = [];
        for (let i = 0; i <= 8; i += 1) {
          const t = i / 8;
          const a = t * Math.PI;
          curve.push([d.x0 + span * (1 - Math.cos(a)) / 2, d.h0 - rise + rise * Math.sin(a)]);
        }
        const left = [[d.x0, d.h0], ...curve.slice(0, 5)];
        const right = [...curve.slice(4), [d.x1, d.h0]];
        extrudeY(kit, 'brick', [...left, [curve[4][0], d.h0]], d.y0 - 0.02, d.y1 + 0.02);
        extrudeY(kit, 'brick', [[curve[4][0], d.h0], ...right], d.y0 - 0.02, d.y1 + 0.02);
        break;
      }
      case 'arc': {
        /* A steel arch over the arcade's lane, in segments. */
        at(kit, d.x, d.y0);
        const n = 6;
        let prev = null;
        for (let i = 0; i <= n; i += 1) {
          const t = i / n;
          const q = w(d.x, d.y0 + (d.y1 - d.y0) * t, d.h + d.rise * Math.sin(t * Math.PI));
          if (prev) {
            kit.cyl(d.m, prev, q, 0.08, 4);
          }
          prev = q;
        }
        break;
      }
      case 'tanuki': {
        /* A bronze tanuki: belly, head, straw hat, the bottle he carries. */
        at(kit, d.x, d.y);
        const p = w(d.x, d.y, d.h);
        kit.blob('rustDeep', [p[0], d.h + 0.45, p[2]], 0.42, 0.48, [0, 1, 0]);
        kit.blob('rustDeep', [p[0], d.h + 1.08, p[2]], 0.3, 0.27, [0, 2, 0]);
        kit.cyl('rustDeep', [p[0], d.h + 1.28, p[2]], [p[0], d.h + 1.34, p[2]], 0.42, 10);
        kit.cyl('rustDeep', [p[0], d.h + 1.34, p[2]], [p[0], d.h + 1.52, p[2]], 0.2, 8, 0.08);
        kit.cyl('rustDeep', [p[0] + 0.42, d.h + 0.3, p[2] + 0.1], [p[0] + 0.42, d.h + 0.7, p[2] + 0.1], 0.1, 6);
        break;
      }
      case 'bike': {
        at(kit, d.x, d.y);
        for (const dx of [-0.52, 0.52]) {
          kit.cyl('metalDark', w(d.x + dx, d.y - 0.02, 0.33), w(d.x + dx, d.y + 0.02, 0.33), 0.32, 10);
        }
        kit.cyl('metal', w(d.x - 0.52, d.y, 0.36), w(d.x + 0.1, d.y, 0.85), 0.025, 4);
        kit.cyl('metal', w(d.x + 0.52, d.y, 0.36), w(d.x + 0.4, d.y, 0.95), 0.025, 4);
        kit.cyl('metal', w(d.x + 0.1, d.y, 0.85), w(d.x + 0.4, d.y, 0.8), 0.025, 4);
        kit.box('craneYellow', ...w(d.x + 0.35, d.y - 0.14, 0.95), ...w(d.x + 0.6, d.y + 0.14, 1.05));
        break;
      }
      case 'tyres': {
        at(kit, d.x, d.y);
        const p = w(d.x, d.y);
        for (let i = 0; i < d.n; i += 1) {
          kit.cyl('drTyre', [p[0], i * 0.26, p[2]], [p[0], i * 0.26 + 0.24, p[2]], 0.34, 8);
        }
        break;
      }
      case 'car': {
        at(kit, d.x, d.y);
        kit.town('car', { kind: d.kind, colour: d.colour, variant: d.variant }, w(d.x, d.y, d.h), d.yaw);
        break;
      }
      case 'vend': {
        at(kit, d.x, d.y);
        kit.town('vending', { variant: 0, seed: Math.round(d.seed) }, w(d.x, d.y, d.h), d.yaw);
        break;
      }
      default:
        break;
    }
  }
}

/*
 * THE SHADOWS FROM THE SOLIDS. The built map casts each chunk's shadow from
 * one proxy that is the chunk's drawn geometry again (proxyCasters in
 * ../built/index.js), every window frame, sill and pipe of a hundred and
 * sixty buildings: as many triangles in the shadow pass as in the colour
 * pass, on a map this full of buildings. A shadow at the shadow map's
 * resolution is the shape of the solid it falls from, so here each chunk's
 * one sided proxy is redrawn from the chunk's colliders instead: a box for
 * a box, a four sided prism along a capsule, an octahedron for a ball. Still
 * one mesh a chunk, so the draw calls are as they were. A proxy drawn on
 * both sides (a card the proxy stood for) is left as it was.
 */
const CAST_KINDS = new Set(['obstacle', 'tree', 'canopy', 'pole', 'wall', 'train']);
function solidShadows(props, colliders) {
  const per = new Map();
  const add = (x, z) => {
    const k = `props:${chunkOf(x, z)}`;
    let a = per.get(k);
    if (!a) {
      a = { pos: [], idx: [] };
      per.set(k, a);
    }
    return a;
  };
  const quad = (a, p0, p1, p2, p3) => {
    const n = a.pos.length / 3;
    a.pos.push(...p0, ...p1, ...p2, ...p3);
    a.idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
  };
  /* The built colliders' packed arrays (build() in src/game/collide.js). */
  const C = colliders;
  for (let i = 0; i < C.count; i += 1) {
    if (!CAST_KINDS.has(KINDS[C.fkind[i]])) {
      continue;
    }
    const ax = C.fax[i];
    const ay = C.fay[i];
    const az = C.faz[i];
    const bx = C.fbx[i];
    const by = C.fby[i];
    const bz = C.fbz[i];
    const r = C.fr[i];
    const a = add((ax + bx) / 2, (az + bz) / 2);
    if (C.fbox[i]) {
      const c = (x, y, z) => [x ? bx : ax, y ? by : ay, z ? bz : az];
      quad(a, c(0, 0, 0), c(1, 0, 0), c(1, 1, 0), c(0, 1, 0));
      quad(a, c(1, 0, 1), c(0, 0, 1), c(0, 1, 1), c(1, 1, 1));
      quad(a, c(0, 0, 1), c(0, 0, 0), c(0, 1, 0), c(0, 1, 1));
      quad(a, c(1, 0, 0), c(1, 0, 1), c(1, 1, 1), c(1, 1, 0));
      quad(a, c(0, 1, 0), c(1, 1, 0), c(1, 1, 1), c(0, 1, 1));
      quad(a, c(0, 0, 1), c(1, 0, 1), c(1, 0, 0), c(0, 0, 0));
      continue;
    }
    let dx = bx - ax;
    let dy = by - ay;
    let dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-6) {
      /* A ball: an octahedron through its poles. */
      const v = [[r, 0, 0], [-r, 0, 0], [0, r, 0], [0, -r, 0], [0, 0, r], [0, 0, -r]].map(([x, y, z]) => [ax + x, ay + y, az + z]);
      const n = a.pos.length / 3;
      for (const p of v) {
        a.pos.push(...p);
      }
      for (const [p, q, t] of [[0, 2, 4], [4, 2, 1], [1, 2, 5], [5, 2, 0], [4, 3, 0], [1, 3, 4], [5, 3, 1], [0, 3, 5]]) {
        a.idx.push(n + p, n + q, n + t);
      }
      continue;
    }
    dx /= len;
    dy /= len;
    dz /= len;
    /* Two directions across the axis, and the prism's four long faces,
     * its ends carried out by the radius as the capsule's are. */
    const up = Math.abs(dy) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    let ux = up[1] * dz - up[2] * dy;
    let uy = up[2] * dx - up[0] * dz;
    let uz = up[0] * dy - up[1] * dx;
    const ul = Math.hypot(ux, uy, uz);
    ux = (ux / ul) * r;
    uy = (uy / ul) * r;
    uz = (uz / ul) * r;
    const vx = (dy * uz - dz * uy);
    const vy = (dz * ux - dx * uz);
    const vz = (dx * uy - dy * ux);
    const e0 = [ax - dx * r, ay - dy * r, az - dz * r];
    const e1 = [bx + dx * r, by + dy * r, bz + dz * r];
    const ring = (e) => [
      [e[0] + ux, e[1] + uy, e[2] + uz], [e[0] + vx, e[1] + vy, e[2] + vz],
      [e[0] - ux, e[1] - uy, e[2] - uz], [e[0] - vx, e[1] - vy, e[2] - vz],
    ];
    const p = ring(e0);
    const q = ring(e1);
    for (let k = 0; k < 4; k += 1) {
      quad(a, p[k], p[(k + 1) % 4], q[(k + 1) % 4], q[k]);
    }
    quad(a, p[3], p[2], p[1], p[0]);
    quad(a, q[0], q[1], q[2], q[3]);
  }
  const stats = { from: 0, to: 0 };
  for (const chunk of props.children) {
    const proxy = chunk.children.find((m) => m.userData.shadowProxy && m.material.side === THREE.FrontSide);
    const a = per.get(chunk.name);
    if (!proxy || !a) {
      continue;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(a.pos, 3));
    g.setIndex(a.idx);
    g.computeBoundingSphere();
    stats.from += proxy.geometry.index ? proxy.geometry.index.count / 3 : proxy.geometry.attributes.position.count / 3;
    stats.to += a.idx.length / 3;
    proxy.geometry.dispose();
    proxy.geometry = g;
  }
  return stats;
}

/*
 * THE SHOP SIGNS ON ONE PICTURE. Every painted plate the catalog's
 * buildings carry (a fascia, a blade sign, a curtain, a name board, a
 * poster) is its own picture, so each one in each chunk is a draw call of
 * its own: three hundred of them on this street, more than everything else
 * the map draws. Here every such picture is copied, once, onto one atlas,
 * each plate's corners are moved onto its cell, and a chunk's plates are
 * merged into one mesh: one draw a chunk. The plates are clamped, never
 * tiled (the cells would bleed into each other otherwise), so only those
 * are taken. Each cell carries a two pixel border of its own edge, so a
 * far mip does not pull its neighbour in. The copy is at half size, which
 * on a plate a few metres across is still more texels than pixels from
 * anywhere a pilot flies, and the originals are never drawn, so never
 * uploaded.
 */
function signAtlas(props) {
  const batches = [];
  const textures = new Map();
  for (const chunk of props.children) {
    for (const m of chunk.children) {
      const mat = m.material;
      if (!m.isMesh || m.isInstancedMesh || m.userData.shadowProxy || !mat || Array.isArray(mat) || !mat.isMeshBasicMaterial
        || !mat.map || !(mat.alphaTest > 0) || mat.transparent || mat.map.wrapS !== THREE.ClampToEdgeWrapping
        || mat.map.wrapT !== THREE.ClampToEdgeWrapping || !m.geometry.attributes.uv || !mat.map.image || !mat.map.image.width) {
        continue;
      }
      batches.push({ chunk, m });
      textures.set(mat.map.uuid, mat.map);
    }
  }
  if (batches.length < 2) {
    return { from: 0, to: 0 };
  }
  /* Shelf packing, tallest first, into an atlas 2048 wide; smaller until it
   * fits 2048 tall. */
  const PAD = 2;
  const SIZE = 2048;
  const list = [...textures.values()].sort((a, b) => b.image.height - a.image.height);
  let cells;
  for (let scale = 0.5; ; scale *= 0.9) {
    cells = new Map();
    let x = 0;
    let y = 0;
    let row = 0;
    for (const t of list) {
      const cw = Math.max(4, Math.round(t.image.width * scale));
      const ch = Math.max(4, Math.round(t.image.height * scale));
      if (x + cw + 2 * PAD > SIZE) {
        x = 0;
        y += row;
        row = 0;
      }
      cells.set(t.uuid, { x: x + PAD, y: y + PAD, w: cw, h: ch });
      x += cw + 2 * PAD;
      row = Math.max(row, ch + 2 * PAD);
    }
    if (y + row <= SIZE || scale < 0.1) {
      break;
    }
  }
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const g = canvas.getContext('2d');
  for (const t of list) {
    const c = cells.get(t.uuid);
    g.drawImage(t.image, c.x - PAD, c.y - PAD, c.w + 2 * PAD, c.h + 2 * PAD);
    g.clearRect(c.x, c.y, c.w, c.h);
    g.drawImage(t.image, c.x, c.y, c.w, c.h);
  }
  const atlas = new THREE.CanvasTexture(canvas);
  atlas.colorSpace = list[0].colorSpace;
  atlas.anisotropy = 4;
  /* One merged mesh a chunk for each way a plate is drawn. */
  const groups = new Map();
  for (const b of batches) {
    const mat = b.m.material;
    const key = `${b.chunk.uuid}|${mat.color.getHexString()}|${mat.alphaTest}|${mat.side}|${b.m.castShadow}|${b.m.receiveShadow}`;
    let gr = groups.get(key);
    if (!gr) {
      gr = { chunk: b.chunk, mat, cast: b.m.castShadow, receive: b.m.receiveShadow, list: [] };
      groups.set(key, gr);
    }
    gr.list.push(b.m);
  }
  const mats = new Map();
  let to = 0;
  for (const gr of groups.values()) {
    const geos = [];
    for (const m of gr.list) {
      const c = cells.get(m.material.map.uuid);
      const src = m.geometry;
      const geo = new THREE.BufferGeometry();
      for (const name of ['position', 'normal', 'uv']) {
        if (src.attributes[name]) {
          geo.setAttribute(name, src.attributes[name].clone());
        }
      }
      if (src.index) {
        geo.setIndex(src.index.clone());
      }
      if (!geo.attributes.normal) {
        geo.computeVertexNormals();
      }
      m.updateMatrix();
      geo.applyMatrix4(m.matrix);
      /* The atlas is drawn as a canvas texture is, v up from the bottom. */
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i += 1) {
        uv.setXY(i, (c.x + uv.getX(i) * c.w) / SIZE, 1 - (c.y + (1 - uv.getY(i)) * c.h) / SIZE);
      }
      geos.push(geo);
    }
    const indexed = geos.every((x) => x.index);
    const merged = mergeGeometries(indexed ? geos : geos.map((x) => (x.index ? x.toNonIndexed() : x)), false);
    for (const x of geos) {
      x.dispose();
    }
    if (!merged) {
      continue;
    }
    const mk = `${gr.mat.color.getHexString()}|${gr.mat.alphaTest}|${gr.mat.side}`;
    let mat = mats.get(mk);
    if (!mat) {
      mat = gr.mat.clone();
      mat.map = atlas;
      mat.name = 'ekimaeSigns';
      mats.set(mk, mat);
    }
    const mesh = new THREE.Mesh(merged, mat);
    mesh.name = 'ekimaeSigns';
    mesh.castShadow = gr.cast;
    mesh.receiveShadow = gr.receive;
    mesh.matrixAutoUpdate = false;
    merged.computeBoundingSphere();
    for (const m of gr.list) {
      gr.chunk.remove(m);
      m.geometry.dispose();
    }
    gr.chunk.add(mesh);
    to += 1;
  }
  return { from: batches.length, to, textures: list.length };
}

export async function buildMap(shell, onProgress, options) {
  const low = qualityFor(options && options.quality).id === 'low';
  const L = ekimaeLayout();
  const doc = ekimaeDocument();
  const extra = {
    el: { id: 'ekimae', type: 'ekimae' },
    /* On Low the fine parts are left out of what is drawn; none is solid. */
    parts: low ? L.parts.filter((p) => !(p.fine && !p.solid)) : L.parts,
    /* The pilot starts on the car park's roof (./plan.js START), which the
     * document does not hold, so the pipeline is told the roof's height. */
    padBase: CP.roof,
    chunkOf: (x, z) => chunkOf(x, z),
    draw: (kit) => {
      drawWalls(kit, L.walls, low);
      drawDecor(kit, L.decor, low);
    },
  };
  const map = await buildBuilt(shell, onProgress, {
    ...(options || {}), document: doc, extra, markSpots: ekimaeMarkSpots(),
  });
  map.id = 'ekimae';
  map.source = 'ekimae';
  /* One batch a look in each chunk rather than one a colour. */
  const props = map.scene.getObjectByName('props');
  const palette = props ? mergePalette(props) : { from: 0, to: 0 };
  const signs = props ? signAtlas(props) : { from: 0, to: 0 };
  const shadows = props && map.colliders ? solidShadows(props, map.colliders) : { from: 0, to: 0 };
  const stats = map.stats;
  map.stats = () => ({ ...(stats ? stats() : {}), palette, shadows, signs });
  /* The signs, one mesh on one picture. */
  const atlas = paintSigns(L.signs);
  const tex = new THREE.CanvasTexture(atlas.canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  map.scene.add(signMesh(THREE, L.signs, atlas, paintMaterial(THREE, tex)));
  /* THE GAME, for the shell (filmStep in src/main.js), as Drift Matsuri's. */
  const film = new Film();
  const bySlot = new Map((map.traffic ? map.traffic.vehicles : []).map((v) => [v.element, v]));
  const groups = groupIds(doc);
  const cars = [];
  groups.forEach((g, gi) => {
    for (const id of g.ids) {
      const v = bySlot.get(id);
      if (v) {
        cars.push({ slot: v.slot, group: gi, height: v.height, label: v.style.toUpperCase() });
      }
    }
  });
  film.setCars(cars);
  film.setGroups(groups.map((g, gi) => ({ name: g.name, size: GROUPS[gi].cars.length })));
  film.setZones(L.zones);
  map.filmGame = { film, zones: L.zones };
  await warmPrograms(shell.renderer, map.scene, shell.camera, map.post.rtScene);
  return map;
}
