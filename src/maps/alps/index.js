/*
 * index.js: Raicho Ridge, a freestyle map of a Japanese Alps ridge and
 * valley, built by the built map's pipeline (../built/index.js) as
 * Sunnyfield and Ridgeline MX are: the sky, the four lights, the ink, the
 * comic layer, the shadows, the colliders, the cull, the named gaps and
 * the marks are the pipeline's, in the town's golden hour. This file hands
 * it the document (./yard.js) and everything that stands on the ridge as
 * one structure (./places.js, ./nature.js), gives it the ground
 * (./terrain.js) as the floor the plant stands on, and draws what the
 * pipeline has no word for:
 *
 *   THE GROUND, the terrain lattice as twenty five meshes of one cel
 *   material, each triangle painted by what it is (valley grass, forest
 *   floor, alpine meadow, scree, rock in strata, the summer snow patches)
 *   with the ground's smooth normals, so the cel ramp bands the slopes the
 *   way the town's hills are banded and the ink pass draws the ridges.
 *   Each mesh is switched off past the fog's end as the pipeline's cells
 *   are.
 *
 *   THE LAKE, one flat sheet at the water's level, and its glints.
 *
 *   THE FAR RANGES, two rings of painted peaks with their snow, unlit and
 *   out of the fog, in the fog's own colours: the town's painted ridges,
 *   at the height of the Alps rather than a town's hills.
 *
 * THE VIEW IS LONGER THAN A YARD'S. The pipeline sizes its fog to the plot
 * and holds it under 420 m; a ridge 360 m over its valley needs to see the
 * valley from the col, so the fog is set here, longer, and the cull radius
 * with it (FOG below). Its cost is the ground's meshes and the forest's
 * cells inside that radius, which the PR measures.
 *
 * FOR THE LATENCY RULE: on every other map, nothing (this loads only when
 * the map is chosen). On this map nothing is animated and nothing runs per
 * step but the ground's lookup (floorAt: one cell, one triangle, a few
 * multiplies) and, per frame, the cull of twenty five meshes.
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
import { qualityFor } from '../../render/quality.js';
import { markGround } from '../../render/comic.js';
import { cel, flat } from '../city/vendored/core/toon.js';
import { propMaterial } from '../../props/kit.js';
import {
  heights, floorAt, noise, crestShare, smooth, HALF, CELL, N, LAKE, DAM_X,
} from './terrain.js';
import { layout, KONEX_SPOT } from './places.js';
import { plant } from './nature.js';
import { chunkOf } from './build.js';
import { alpsDocument } from './yard.js';
import { mergePalette } from '../sunny/palette.js';

/* How far the pilot sees on each preset, metres: the fog's start and end,
 * and how far out the structures and the forest are drawn. The ground is
 * drawn to the fog's end, so the ridges stand clear to the far side of
 * the valley, and the forest stops short of it where a fir is a few
 * pixels tall and already half in the haze. */
const FOG = {
  high: { near: 560, far: 2000, props: 1100 },
  medium: { near: 440, far: 1600, props: 820 },
  low: { near: 300, far: 1050, props: 560 },
};

/* The ground's colours, sRGB, the town's hill palette carried up. */
const PAINT = {
  grass: 0x9fbc90,
  grassSun: 0xaec793,
  forest: 0x86a882,
  meadow: 0xa9bb8c,
  meadowDry: 0xbab694,
  scree: 0xc6c0c8,
  rock: 0xb4aeb6,
  rockDark: 0x9a93a5,
  snow: 0xf4f6fb,
  bed: 0x9ab3a8,
  shore: 0xd2c9b8,
};

/* The meshes are cut in five by five, 50 cells (400 m) a side. */
const CUT = 50;

const _a = new THREE.Color();
const _b = new THREE.Color();
const _c = new THREE.Color();

/* 0 at e0, 1 at e1, smoothly between (either way round). */
function band(e0, e1, v) {
  return smooth((v - e0) / (e1 - e0));
}

/* Mix two colours by t into `out`. */
function mix(out, c0, c1, t) {
  return out.setHex(c0).lerp(_a.setHex(c1), t);
}

/*
 * What colour the ground is at a lattice point: by height over the valley,
 * by how steep it is (ny, the up share of the smooth normal), by which way
 * it faces (nz < 0 faces north) and by two low noises, so the zones meet in
 * wandering lines rather than contours. Each zone is one flat colour and
 * the cel ramp does the shading, as on the town's hills; only the edges
 * between zones blend, over a cell, so they ink as shapes and not as a
 * checkerboard of triangles.
 */
function paintAt(out, h, ny, nz, x, z) {
  const n1 = noise(x / 55, z / 55, 71);
  const n2 = noise(x / 19, z / 19, 72);
  const up = h - 70;
  const crest = crestShare(x, z);
  if (x < DAM_X + 1 && x > 50 && h < LAKE + 0.01) {
    return out.setHex(PAINT.bed);
  }
  if (x < DAM_X + 1 && x > 50 && h < LAKE + 2) {
    return out.setHex(PAINT.shore);
  }
  /* The base: valley grass, forest floor, then the alpine meadow. */
  const wood = noise(x / 90, z / 90, 61);
  mix(out, PAINT.grass, PAINT.grassSun, band(0.5, 0.62, n2));
  out.lerp(_b.setHex(PAINT.forest), band(0.45, 0.6, wood) * (1 - band(140, 200, up)));
  const meadow = mix(_c, PAINT.meadow, PAINT.meadowDry, band(0.5, 0.62, n1));
  out.lerp(meadow, band(160, 220, up + n1 * 30));
  /* Scree on the high ground where it starts to steepen. */
  out.lerp(_b.setHex(PAINT.scree), band(0.9, 0.8, ny) * band(180, 240, up));
  /* Rock where it is steep, and along the crest. */
  const rocky = Math.max(band(0.8, 0.7, ny), crest > 0.88 && up > 250 ? band(0.95, 0.88, ny) : 0);
  out.lerp(_b.setHex(ny < 0.55 ? PAINT.rockDark : PAINT.rock), rocky);
  /* The summer snow: the highest ground, and the north facing hollows
   * higher up, in patches. */
  const north = band(-0.1, -0.35, nz);
  const snow = Math.max(
    band(480, 500, h + n1 * 40) * band(0.5, 0.6, ny),
    north * band(395, 415, h + n1 * 50) * band(0.48, 0.56, n2) * band(0.45, 0.55, ny),
  );
  /* Never on the summit's own flat, which is trodden scree round the
   * shrine. */
  const trodden = band(30, 18, Math.hypot(x - 120, z + 344));
  out.lerp(_b.setHex(PAINT.snow), snow * (1 - trodden));
  return out.lerp(_b.setHex(PAINT.scree), trodden);
}

/* The ground's meshes, one per piece of the cut, and what each covers. */
function buildGround(material) {
  const g = heights();
  const NV = N + 1;
  /* Smooth normals at every lattice point, from the heights round it. */
  const nrm = new Float32Array(NV * NV * 3);
  for (let j = 0; j < NV; j += 1) {
    for (let i = 0; i < NV; i += 1) {
      const hl = g[j * NV + Math.max(0, i - 1)];
      const hr = g[j * NV + Math.min(N, i + 1)];
      const hu = g[Math.max(0, j - 1) * NV + i];
      const hd = g[Math.min(N, j + 1) * NV + i];
      const nx = (hl - hr) / (2 * CELL);
      const nz = (hu - hd) / (2 * CELL);
      const l = Math.hypot(nx, 1, nz);
      nrm.set([nx / l, 1 / l, nz / l], (j * NV + i) * 3);
    }
  }
  const col = new THREE.Color();
  const pieces = [];
  const PV = CUT + 1;
  /* One index list serves every piece: each cell's two triangles, cut
   * (i, j) to (i + 1, j + 1), the cut floorAt reads, wound up. */
  const index = [];
  for (let j = 0; j < CUT; j += 1) {
    for (let i = 0; i < CUT; i += 1) {
      const v00 = j * PV + i;
      const v10 = v00 + 1;
      const v01 = v00 + PV;
      const v11 = v01 + 1;
      index.push(v00, v11, v10, v00, v01, v11);
    }
  }
  for (let cj = 0; cj < N / CUT; cj += 1) {
    for (let ci = 0; ci < N / CUT; ci += 1) {
      const pos = new Float32Array(PV * PV * 3);
      const nor = new Float32Array(PV * PV * 3);
      const rgb = new Float32Array(PV * PV * 3);
      for (let b = 0; b < PV; b += 1) {
        for (let a = 0; a < PV; a += 1) {
          const i = ci * CUT + a;
          const j = cj * CUT + b;
          const idx = j * NV + i;
          const k = (b * PV + a) * 3;
          const x = -HALF + i * CELL;
          const z = -HALF + j * CELL;
          pos[k] = x;
          pos[k + 1] = g[idx];
          pos[k + 2] = z;
          nor[k] = nrm[idx * 3];
          nor[k + 1] = nrm[idx * 3 + 1];
          nor[k + 2] = nrm[idx * 3 + 2];
          paintAt(col, g[idx], nrm[idx * 3 + 1], nrm[idx * 3 + 2], x, z);
          rgb[k] = col.r;
          rgb[k + 1] = col.g;
          rgb[k + 2] = col.b;
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(rgb, 3));
      geo.setIndex(index);
      geo.computeBoundingBox();
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, material);
      mesh.name = `ground ${ci},${cj}`;
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      const bb = geo.boundingBox;
      pieces.push({ mesh, x0: bb.min.x, x1: bb.max.x, z0: bb.min.z, z1: bb.max.z });
    }
  }
  return pieces;
}

/* The lake: one sheet at its level over the basin, and its glints. */
function buildLake() {
  const group = new THREE.Group();
  group.name = 'lake';
  const sheet = new THREE.PlaneGeometry(DAM_X - 56, 470);
  sheet.rotateX(-Math.PI / 2);
  sheet.translate((DAM_X + 56) / 2, LAKE + 0.05, 290);
  const water = new THREE.Mesh(sheet, propMaterial('alWater'));
  water.name = 'lake water';
  group.add(water);
  /* Glints: short pale strokes lying on the water, the comic's way of
   * saying the surface is moving. Render only. */
  const pos = [];
  let s = 1;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  for (let i = 0; i < 260; i += 1) {
    const x = 70 + rnd() * (DAM_X - 80);
    const z = 70 + rnd() * 440;
    if (floorAt(x, z) > LAKE + 0.01) {
      continue;
    }
    const L = 1.5 + rnd() * 5;
    const w = 0.12 + rnd() * 0.12;
    const y = LAKE + 0.07;
    pos.push(x - L, y, z - w, x + L, y, z - w, x + L, y, z + w, x - L, y, z - w, x + L, y, z + w, x - L, y, z + w);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const glints = new THREE.Mesh(g, flat({ color: 0xeef6fa, side: THREE.DoubleSide }));
  glints.name = 'lake glints';
  group.add(glints);
  return group;
}

/*
 * The far ranges: two rings of peaks out past the fog, each a silhouette
 * and a snow cap over it, flat and in the haze's colours, the town's
 * painted ridges at the height of the Alps. A peak is the sharper of a few
 * rounded humps raised to a power, so the tops come to points and the
 * saddles between them stay broad; the snow is the top of every peak over
 * the ring's snow line, ragged at its foot where the couloirs run down.
 * Every height comes from Math here, which is render only.
 */
function buildRanges(fogColor) {
  const group = new THREE.Group();
  group.name = 'ranges';
  const haze = new THREE.Color(fogColor);
  const rings = [
    { r: 2300, h: 560, base: 0xbcc5de, snow: 0xf1f3f9, mix: 0.5, seed: 3, peaks: [5, 9, 14, 23] },
    { r: 1750, h: 430, base: 0x9eaacb, snow: 0xf4f6fb, mix: 0.3, seed: 7, peaks: [4, 7, 11, 19] },
  ];
  const steps = 480;
  for (const R of rings) {
    const prof = [];
    for (let i = 0; i <= steps; i += 1) {
      const a = (i / steps) * Math.PI * 2;
      let y = 0;
      R.peaks.forEach((f, k) => {
        const c = 0.5 + 0.5 * Math.cos(a * f + R.seed * (k + 1.3));
        y = Math.max(y, Math.pow(c, 3 + k) * (1 - k * 0.17));
      });
      prof.push(R.h * (0.22 + 0.78 * y));
    }
    const make = (top, bottom, color) => {
      const pos = [];
      const idx = [];
      for (let i = 0; i <= steps; i += 1) {
        const a = (i / steps) * Math.PI * 2;
        const x = Math.cos(a) * R.r;
        const z = Math.sin(a) * R.r;
        pos.push(x, top(i), z, x, bottom(i), z);
        if (i < steps) {
          const v = i * 2;
          idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      const c = new THREE.Color(color).lerp(haze, R.mix);
      const mesh = new THREE.Mesh(g, flat({ color: c.getHex(), fog: false, side: THREE.DoubleSide, cache: false }));
      mesh.renderOrder = -7;
      mesh.frustumCulled = false;
      group.add(mesh);
      return mesh;
    };
    make((i) => prof[i], () => -300, R.base);
    const line = R.h * 0.6;
    make((i) => prof[i] + 0.3, (i) => {
      if (prof[i] <= line) {
        return prof[i] + 0.3;
      }
      const ragged = 0.5 + 0.5 * Math.sin(i * 1.7 + R.seed) * Math.sin(i * 0.43);
      return Math.max(line, prof[i] - (prof[i] - line) * (0.55 + 0.35 * ragged));
    }, R.snow);
  }
  return group;
}

/* The title camera's loop: round the col and over the face, well clear of
 * the ground. */
function attractPath() {
  const pts = [];
  const N2 = 48;
  for (let i = 0; i < N2; i += 1) {
    const a = (i / N2) * Math.PI * 2;
    const x = -120 + Math.cos(a) * 280;
    const z = -110 + Math.sin(a) * 240;
    let top = 0;
    for (let k = -3; k <= 3; k += 1) {
      top = Math.max(top, floorAt(x + k * 12, z), floorAt(x, z + k * 12));
    }
    pts.push({ x, y: top + 55, z });
  }
  for (let pass = 0; pass < 4; pass += 1) {
    const prev = pts.map((p) => p.y);
    for (let i = 0; i < N2; i += 1) {
      pts[i].y = Math.max(prev[i], (prev[(i + N2 - 1) % N2] + prev[i] + prev[(i + 1) % N2]) / 3);
    }
  }
  return pts;
}

export async function buildMap(shell, onProgress, options) {
  const q = qualityFor(options && options.quality);
  const L = layout();
  const counts = plant(L.plan);
  const B = L.plan;
  const extra = {
    el: { id: 'alps', type: 'alps' },
    parts: B.parts,
    draw: (kit) => {
      for (const p of B.paint) {
        kit.begin(0, 0, 0, 0, chunkOf(p.x, p.z));
        p.fn(kit);
      }
    },
    floor: floorAt,
    chunkOf: (x, z) => chunkOf(x, z),
    padBase: L.heliTop,
  };
  const doc = alpsDocument(L.heliTop, B.gaps);
  /* The one hidden Konex Drone sign (the owner's promise of a logo hidden
   * in every map): on the dam, inside the spillway gap, on the pier that
   * walls its north side, a few metres over the weir. A pilot threading the
   * spillway passes it at arm's length and at speed; one who stops in the
   * bay and looks left reads it. The
   * partners' own marks are not placed here: the pipeline's default puts
   * them on its flat ground, which this map hides. */
  const markSpots = [{
    slug: 'konexdrone', key: 'alps#konexdrone~hidden', ...KONEX_SPOT, chunk: chunkOf(KONEX_SPOT.p[0], KONEX_SPOT.p[2]),
  }];
  const map = await buildBuilt(shell, onProgress, {
    ...(options || {}), document: doc, extra, sponsorMarks: false, markSpots,
  });
  map.id = 'alps';
  map.source = 'alps';
  const scene = map.scene;
  /* The pipeline's flat ground, its painted hills and its road mesh give
   * way to the ridge's own. */
  for (const name of ['ground', 'backdrop', 'roads']) {
    const o = scene.getObjectByName(name);
    if (o) {
      o.visible = false;
    }
  }
  const fog = FOG[q.id] || FOG.high;
  scene.fog.near = fog.near;
  scene.fog.far = fog.far;
  if (map.setCullRadius) {
    map.setCullRadius(fog.props);
  }
  /* One batch a look in each cell rather than one a colour, Sunnyfield's
   * way (../sunny/palette.js). */
  const props = scene.getObjectByName('props');
  const palette = props ? mergePalette(props) : { from: 0, to: 0 };
  const groundMat = cel({ color: 0xffffff, vertexColors: true, bands: 3, tint: 0x6f6790, cache: false });
  const pieces = buildGround(groundMat);
  const groundGroup = new THREE.Group();
  groundGroup.name = 'alps ground';
  for (const p of pieces) {
    groundGroup.add(p.mesh);
  }
  markGround(groundGroup);
  scene.add(groundGroup);
  const lake = buildLake();
  scene.add(lake);
  const ranges = buildRanges(scene.fog.color.getHex());
  scene.add(ranges);
  map.attract = { path: attractPath(), speed: 10, lookAhead: 30, aimDrop: 6 };
  /* The ground's pieces switched off past the fog's end, every frame after
   * the pipeline's own cull, and the ranges kept round the camera. */
  const reach2 = (fog.far + 4) * (fog.far + 4);
  const focus = map.updateShadowFocus;
  map.updateShadowFocus = (target) => {
    focus(target);
    const e = shell.camera.position;
    for (const p of pieces) {
      const dx = Math.max(0, p.x0 - e.x, e.x - p.x1);
      const dz = Math.max(0, p.z0 - e.z, e.z - p.z1);
      p.mesh.visible = dx * dx + dz * dz <= reach2;
    }
    ranges.position.set(e.x, 0, e.z);
  };
  const baseStats = map.stats;
  map.stats = () => ({
    ...baseStats(),
    palette,
    alps: {
      ...counts,
      groundPieces: pieces.length,
      groundOn: pieces.filter((p) => p.mesh.visible).length,
      groundTriangles: N * N * 2,
      fog,
    },
  });
  const baseDispose = map.dispose;
  map.dispose = () => {
    for (const p of pieces) {
      p.mesh.geometry.dispose();
    }
    groundMat.dispose();
    baseDispose();
  };
  await warmPrograms(shell.renderer, scene, shell.camera, map.post.rtScene);
  return map;
}
