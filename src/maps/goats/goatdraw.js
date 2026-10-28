/*
 * goatdraw.js: the goats drawn, every one wearing a 90%er's logo on both
 * flanks. Render only; ./herd.js says where they are.
 *
 * FOR THE LATENCY RULE. Two draw calls for the whole herd, whatever its
 * size: the goats are ONE InstancedMesh in the map's cel toon, and their
 * logos are ONE more, two quads a goat, that SHARES the goats' instance
 * matrices (the same buffer, written once a frame and uploaded once), so a
 * logo is carried by its goat on the GPU and costs the CPU nothing. Which
 * logo a goat wears is a number a goat in an instanced attribute, read in
 * the vertex shader to pick its cell of one picture. Neither casts a
 * shadow. Per frame: one matrix a goat, no allocation.
 *
 * The picture is painted once, the logos cut from the Infinity Loops
 * map's two sticker sheets (../specials/infinityloops.js), which Heads'
 * house fetches anyway for its sticker wall, so it downloads nothing. A
 * sheet that does not come leaves those goats plain, and the game plays.
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
import { cel } from '../city/vendored/core/toon.js';

/* A goat's size against Joshua Bardwell's (../bardwell/goats.js), which is
 * a full sized goat: these are a little smaller, so a herd fits Heads'
 * garage. */
export const GOAT_K = 0.85;

/* Where the logo sits on a goat's flank, in its own frame (x forward, y
 * up, z right), before GOAT_K: its middle, its half size, and how far out
 * from the middle of the body. */
export const LOGO = { x: -0.06, y: 0.6, half: 0.22, side: 0.178 };

/* The picture's grid of logos, and the share of each cell left clear
 * round its logo so a mip level does not bleed into the next. */
const COLS = 10;
const CELL_PX = 128;
const PAD = 0.07;

/* Their coats: tints on a cream body (white, cream, tan, brown, grey,
 * black and white, toffee), as Bardwell's goats have. */
const PELTS = [0xfaf6ee, 0xefe4cc, 0xd9b98a, 0x8a6a4a, 0xb4b4b0, 0xe8dcc8, 0x6a5a50, 0xc89a68];

/* One goat facing +x, standing on y 0, a box a part with a colour each. */
function goatGeometry() {
  const pos = [];
  const nor = [];
  const col = [];
  const idx = [];
  const FACES = [
    [[1, 0, 0], [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]]],
    [[-1, 0, 0], [[-1, -1, 1], [-1, 1, 1], [-1, 1, -1], [-1, -1, -1]]],
    [[0, 1, 0], [[-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1]]],
    [[0, -1, 0], [[-1, -1, 1], [-1, -1, -1], [1, -1, -1], [1, -1, 1]]],
    [[0, 0, 1], [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]],
    [[0, 0, -1], [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]]],
  ];
  const c = new THREE.Color();
  const k = GOAT_K;
  const box = (cx, cy, cz, sx, sy, sz, hex) => {
    c.set(hex);
    for (const [n, quad] of FACES) {
      const base = pos.length / 3;
      for (const [x, y, z] of quad) {
        pos.push(k * (cx + (x * sx) / 2), k * (cy + (y * sy) / 2), k * (cz + (z * sz) / 2));
        nor.push(n[0], n[1], n[2]);
        col.push(c.r, c.g, c.b);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  };
  const FUR = 0xffffff;
  const DARK = 0x4a3c34;
  const HORN = 0xd8cdb4;
  const PINK = 0xe3a3a0;
  /* The barrel, a belly under it, the rump. */
  box(0, 0.6, 0, 0.9, 0.42, 0.34, FUR);
  box(0.02, 0.43, 0, 0.7, 0.12, 0.28, FUR);
  box(-0.4, 0.64, 0, 0.16, 0.36, 0.3, FUR);
  /* The neck up and forward, the head, the muzzle, the nose. */
  box(0.48, 0.84, 0, 0.2, 0.44, 0.17, FUR);
  box(0.6, 1.06, 0, 0.3, 0.18, 0.16, FUR);
  box(0.76, 1.0, 0, 0.12, 0.12, 0.12, FUR);
  box(0.825, 1.0, 0, 0.02, 0.06, 0.08, PINK);
  /* The eyes, a bar each side. */
  box(0.66, 1.1, 0.081, 0.05, 0.035, 0.01, DARK);
  box(0.66, 1.1, -0.081, 0.05, 0.035, 0.01, DARK);
  /* The beard. */
  box(0.68, 0.89, 0, 0.06, 0.14, 0.06, FUR);
  /* The horns, swept back, and the ears out to the sides. */
  box(0.53, 1.2, 0.05, 0.06, 0.18, 0.04, HORN);
  box(0.53, 1.2, -0.05, 0.06, 0.18, 0.04, HORN);
  box(0.47, 1.28, 0.05, 0.1, 0.04, 0.035, HORN);
  box(0.47, 1.28, -0.05, 0.1, 0.04, 0.035, HORN);
  box(0.54, 1.09, 0.13, 0.08, 0.04, 0.14, FUR);
  box(0.54, 1.09, -0.13, 0.08, 0.04, 0.14, FUR);
  /* The tail, up. */
  box(-0.5, 0.82, 0, 0.06, 0.16, 0.05, FUR);
  /* The legs, and dark hooves. */
  for (const [lx, lz] of [[0.32, 0.1], [0.32, -0.1], [-0.33, 0.1], [-0.33, -0.1]]) {
    box(lx, 0.24, lz, 0.08, 0.38, 0.08, FUR);
    box(lx, 0.03, lz, 0.09, 0.06, 0.09, DARK);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/* The two flank quads in a goat's own frame: the right one facing +z, the
 * left facing -z, each reading the right way round from its own side. */
function logoGeometry() {
  const k = GOAT_K;
  const { x, y, half, side } = LOGO;
  const pos = [];
  const nor = [];
  const uv = [];
  const idx = [];
  for (const s of [1, -1]) {
    const base = pos.length / 3;
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      /* Seen from +z, +x is to the right; from -z it is to the left. */
      pos.push(k * (x + s * a * half), k * (y + b * half), k * s * side);
      nor.push(0, 0, s);
      uv.push((a + 1) / 2, (b + 1) / 2);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/*
 * The logos as one picture: `crops` { sheet, x, y, w, h } in shares of a
 * sheet, y down from the top, `sheets` the decoded sheets (or null). Each
 * logo fitted in its cell keeping its shape, cell i at column i % COLS,
 * row i / COLS from the top.
 */
function paintLogos(crops, sheets) {
  const rows = Math.ceil(crops.length / COLS);
  const cv = document.createElement('canvas');
  cv.width = COLS * CELL_PX;
  cv.height = rows * CELL_PX;
  const g = cv.getContext('2d');
  g.imageSmoothingQuality = 'high';
  crops.forEach((c, i) => {
    const img = sheets[c.sheet];
    if (!img) {
      return;
    }
    const W = img.naturalWidth;
    const H = img.naturalHeight;
    const sw = c.w * W;
    const sh = c.h * H;
    const room = CELL_PX * (1 - 2 * PAD);
    const s = Math.min(room / sw, room / sh);
    const cx = (i % COLS) * CELL_PX + CELL_PX / 2;
    const cy = Math.floor(i / COLS) * CELL_PX + CELL_PX / 2;
    g.drawImage(img, c.x * W, c.y * H, sw, sh, cx - (sw * s) / 2, cy - (sh * s) / 2, sw * s, sh * s);
  });
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return { texture: t, rows };
}

/*
 * The herd drawn: { group, update(), dispose } for `herd` (./herd.js),
 * `crops` its logos in the herd's order, `sheets` the decoded sheets, and
 * `worldAt(px, py, h)` the plan to the world. `S` is world metres a real
 * metre.
 */
export function makeGoatDraw(herd, crops, sheets, worldAt, S) {
  const N = herd.count;
  const group = new THREE.Group();
  group.name = 'goats';
  const material = cel({ color: 0xffffff, vertexColors: true, bands: 3, tint: 0x6c5f8c });
  const body = new THREE.InstancedMesh(goatGeometry(), material, N);
  body.name = 'goats';
  body.castShadow = false;
  body.receiveShadow = false;
  body.frustumCulled = false;
  body.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const tint = new THREE.Color();
  for (let i = 0; i < N; i += 1) {
    body.setColorAt(i, tint.set(PELTS[(i * 5) % PELTS.length]));
  }
  body.instanceColor.needsUpdate = true;
  group.add(body);

  const { texture, rows } = paintLogos(crops, sheets);
  const logoMat = new THREE.MeshBasicMaterial({
    map: texture, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  /* The cell a goat's logo is in, from its number: a few lines after the
   * picture's own lookup, before anything reads it. */
  logoMat.onBeforeCompile = (shader) => {
    shader.uniforms.uGrid = { value: new THREE.Vector2(COLS, rows) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aCell;\nuniform vec2 uGrid;')
      .replace('#include <uv_vertex>', [
        '#include <uv_vertex>',
        '#ifdef USE_MAP',
        'vec2 goatCell = vec2(mod(aCell, uGrid.x), uGrid.y - 1.0 - floor(aCell / uGrid.x));',
        'vMapUv = (goatCell + vec2(0.07) + uv * 0.86) / uGrid;',
        '#endif',
      ].join('\n'));
  };
  logoMat.customProgramCacheKey = () => 'goat-logos';
  const logoGeo = logoGeometry();
  const cells = new Float32Array(N);
  for (let i = 0; i < N; i += 1) {
    cells[i] = i;
  }
  logoGeo.setAttribute('aCell', new THREE.InstancedBufferAttribute(cells, 1));
  const logos = new THREE.InstancedMesh(logoGeo, logoMat, N);
  logos.name = 'goat logos';
  logos.castShadow = false;
  logos.receiveShadow = false;
  logos.frustumCulled = false;
  /* The goats' own matrices: one buffer, one upload. */
  logos.instanceMatrix = body.instanceMatrix;
  group.add(logos);

  const m = new THREE.Matrix4();
  const k = S;
  /* Each goat placed: its plan point and facing, turned into the world's
   * x, y, z (plan y north is the world's -z), its bounce, its size. */
  function update() {
    const { X, Y, FX, FY, HOP } = herd;
    const e = m.elements;
    for (let i = 0; i < N; i += 1) {
      const [x, , z] = worldAt(X[i], Y[i], 0);
      /* The goat's +x is its facing, plan (fx, fy), world (fx, 0, -fy);
       * its +z is to its right, world (fy, 0, fx); y is up. */
      const fx = FX[i];
      const fz = -FY[i];
      e[0] = fx * k; e[1] = 0; e[2] = fz * k; e[3] = 0;
      e[4] = 0; e[5] = k; e[6] = 0; e[7] = 0;
      e[8] = -fz * k; e[9] = 0; e[10] = fx * k; e[11] = 0;
      e[12] = x; e[13] = HOP[i] * k; e[14] = z; e[15] = 1;
      body.setMatrixAt(i, m);
    }
    body.instanceMatrix.needsUpdate = true;
  }
  update();

  return {
    group,
    update,
    dispose() {
      texture.dispose();
    },
  };
}

/*
 * Where goat i's logo is, for the shell's sticker hunt: the flank facing
 * `eye` (world), its middle `p` and normal `n` written in place, and its
 * size `w` in world metres.
 */
export function logoPose(herd, i, eye, worldAt, S, out) {
  const [x, , z] = worldAt(herd.X[i], herd.Y[i], 0);
  const fx = herd.FX[i];
  const fz = -herd.FY[i];
  /* The right flank faces (fy, 0, fx) in plan terms: world (-fz, 0, fx). */
  const rx = -fz;
  const rz = fx;
  const side = rx * (eye.x - x) + rz * (eye.z - z) < 0 ? -1 : 1;
  const k = GOAT_K * S;
  out.n[0] = rx * side;
  out.n[1] = 0;
  out.n[2] = rz * side;
  out.p[0] = x + fx * LOGO.x * k + out.n[0] * (LOGO.side * k + 0.01);
  out.p[1] = (LOGO.y + herd.HOP[i]) * k;
  out.p[2] = z + fz * LOGO.x * k + out.n[2] * (LOGO.side * k + 0.01);
  out.w = 2 * LOGO.half * k;
  out.h = out.w;
}
