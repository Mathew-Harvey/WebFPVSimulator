/*
 * mapreel.js: the moving thumbnails on the map screen.
 *
 * WHAT THIS IS. Each map on the map screen shows a short looping flight
 * through it, so a player picks a world by looking at it rather than by
 * reading a sentence about it. The loop is a real flight along the same
 * line the title screen's camera flies, rendered here into a 240 pixel
 * canvas.
 *
 * WHY IT IS NOT THE REAL RENDERER. Three reasons, and the first one is
 * binding:
 *
 *   THE CITY MUST NOT LOAD. src/maps/registry.js exists because the freestyle
 *   town is 63 modules, nineteen thousand meshes and a few hundred canvas
 *   textures, and a player who never flies it must not pay for any of it.
 *   tests/lib/checks.js check 16 asserts that by recording every URL the page
 *   requests with the race field selected. A thumbnail that imported the town
 *   to draw a picture of the town would break the one guarantee the lazy load
 *   was built for. So NOTHING here imports from src/maps/city, and the town
 *   below is a caricature of it drawn from a handful of numbers.
 *
 *   THREE WORLDS CANNOT COEXIST. P5 caps render target bytes at 120 MB for
 *   ONE map. Three live previews plus the world behind the menu is four.
 *
 *   A THUMBNAIL IS NOT A VIEW. At 240 by 135 the thing that has to read is
 *   the SHAPE of the place: a course as a chain of gates, a town as a street
 *   between buildings. Flat filled polygons with a painter's sort say that
 *   better at that size than a shaded render would, and cost a few hundred
 *   fills a frame instead of a GL context.
 *
 * So this is a small painter's algorithm renderer: build a list of flat
 * coloured quads once, project them through a camera walking a closed path,
 * clip against the near plane, sort back to front, fill. No lighting model
 * beyond a fixed sun dot per face and a distance fade into the horizon,
 * which is the same warm light and cool distance rule the real renderer
 * follows.
 *
 * THE FIGURE EIGHT IS NOT RE-TYPED HERE. It comes from src/game/circuit.js,
 * which src/render/scene.js builds the real one from, so the reel and the
 * world cannot disagree about the shape of the course. The designed course
 * comes from the track builder's own data modules, the same one way
 * dependency src/game/trackdoc.js already declares.
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

import { circuitPoint, CIRCUIT_STATIONS } from '../game/circuit.js';
import { bannerHex } from '../art/banners.js';

/* Sun direction, matching src/render/scene.js's SUN_DIR closely enough that
 * a lit face is lit in the same place. */
const SUN = norm3(0.60, 0.50, 0.62);
const NEAR = 0.6;

/* ------------------------------------------------------------------ */
/* Small vector and colour helpers                                     */
/* ------------------------------------------------------------------ */

function norm3(x, y, z) {
  const n = Math.hypot(x, y, z) || 1;
  return [x / n, y / n, z / n];
}

function rgb(hex) {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}

function mixRgb(a, b, t) {
  const k = Math.max(0, Math.min(1, t));
  return [
    Math.round(a[0] + (b[0] - a[0]) * k),
    Math.round(a[1] + (b[1] - a[1]) * k),
    Math.round(a[2] + (b[2] - a[2]) * k),
  ];
}

function scaleRgb(c, k) {
  return [
    Math.max(0, Math.min(255, Math.round(c[0] * k))),
    Math.max(0, Math.min(255, Math.round(c[1] * k))),
    Math.max(0, Math.min(255, Math.round(c[2] * k))),
  ];
}

/* ------------------------------------------------------------------ */
/* Geometry: a face list is the whole scene format                     */
/* ------------------------------------------------------------------ */

/*
 * One axis aligned box, yawed about its own centre, as up to six faces.
 * Faces are pushed with their outward normal so the shader-less shading
 * below has something to dot the sun against.
 */
function pushBox(faces, cx, cy, cz, sx, sy, sz, yaw, color) {
  const hx = sx * 0.5;
  const hy = sy * 0.5;
  const hz = sz * 0.5;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const at = (x, y, z) => [cx + x * c + z * s, cy + y, cz - x * s + z * c];
  const dir = (x, z) => [x * c + z * s, 0, -x * s + z * c];
  const corners = [
    [-hx, -hy, -hz], [hx, -hy, -hz], [hx, hy, -hz], [-hx, hy, -hz],
    [-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz],
  ].map((p) => at(p[0], p[1], p[2]));
  const quads = [
    [[0, 1, 2, 3], dir(0, -1)],
    [[5, 4, 7, 6], dir(0, 1)],
    [[1, 5, 6, 2], dir(1, 0)],
    [[4, 0, 3, 7], dir(-1, 0)],
    [[3, 2, 6, 7], [0, 1, 0]],
    [[4, 5, 1, 0], [0, -1, 0]],
  ];
  for (const [ix, n] of quads) {
    faces.push({ p: ix.map((i) => corners[i]), n, c: color });
  }
}

/* A flat quad, given four world points and a normal. */
function pushQuad(faces, pts, n, color) {
  faces.push({ p: pts, n, c: color });
}

/*
 * A race gate, in the shape the world builds: a square frame, printed side
 * banners, and a header board across the top. Drawn from the same figures
 * src/game/track.js publishes, at the same 1.15 the world builds them at.
 */
function pushGate(faces, x, z, yaw, isStart, clearW = 1.7526, clearH = 1.7526, sill = 0) {
  const tube = 0.038;
  /* The world's own dress: aluminium frame, white printed sleeves and a
   * white header with the mark on it. The start gate is the mint ring, not
   * a green board. */
  const vinyl = bannerHex('vinyl');
  const frame = 0x9aa2b0;
  const upX = clearW * 0.5 + tube;
  const top = sill + clearH + 2 * tube;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const at = (lx, ly) => [x + lx * c, ly, z - lx * s];
  for (const sx of [-1, 1]) {
    const p = at(sx * upX, 0);
    pushBox(faces, p[0], top * 0.5, p[2], tube * 2, top, tube * 2, yaw, frame);
    const q = at(sx * (upX + tube + 0.21), 0);
    pushBox(faces, q[0], sill + (top - sill) * 0.5, q[2], 0.42, top - sill, 0.03, yaw, vinyl);
  }
  for (const my of [sill + clearH + tube, sill > 0 ? sill - tube : null]) {
    if (my == null) {
      continue;
    }
    pushBox(faces, x, my, z, clearW + 4 * tube, tube * 2, tube * 2, yaw, frame);
  }
  /* The header board, which is what makes a gate read as a gate at 240 px:
   * a horizontal bar of colour above a square hole. */
  pushBox(faces, x, top + 0.58 * 0.5 + 0.03, z, 2 * (upX + tube + 0.42), 0.58, 0.06, yaw, vinyl);
  pushBox(faces, x, top + 0.03, z, 2 * (upX + tube + 0.42), 0.09, 0.07, yaw, 0xe4d9bf);
  /* The lit opening. Four thin bars just inside the frame, in the same mint
   * and amber the world lights them with. */
  /* The lit opening, in the colours the world lights them with: mint at the
   * start line, amber everywhere else, and magenta on the one the race
   * wants next. */
  const ring = isStart ? 0x7dffb4 : 0xffd45c;
  const bar = 0.16;
  const cy = sill + clearH * 0.5;
  pushBox(faces, x, cy + clearH * 0.5 - bar * 0.5, z, clearW, bar, bar, yaw, ring);
  pushBox(faces, x, cy - clearH * 0.5 + bar * 0.5, z, clearW, bar, bar, yaw, ring);
  for (const sx of [-1, 1]) {
    const p = at(sx * (clearW * 0.5 - bar * 0.5), 0);
    pushBox(faces, p[0], cy, p[2], bar, clearH, bar, yaw, ring);
  }
}

/* A course marker flag: mast and a teardrop sail, as one quad. At this size
 * the outline and the vinyl are the whole of it. */
function pushFlag(faces, x, z, yaw, color) {
  const h = 2.9;
  pushBox(faces, x, h * 0.5, z, 0.036, h, 0.036, 0, 0xd7dbe0);
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const w = h * 0.30;
  const at = (lx, ly) => [x + lx * c, ly, z - lx * s];
  pushQuad(faces, [
    at(0.02, h * 0.16), at(w, h * 0.38), at(w * 0.55, h * 0.95), at(0.02, h * 0.96),
  ], [-s, 0, -c], color);
}

/* A stylised tree: a trunk and two stacked canopy blocks. Cheap, and at
 * thumbnail size a green mass with a dark stem under it is a tree. */
function pushTree(faces, x, z, scale) {
  pushBox(faces, x, 1.1 * scale, z, 0.3 * scale, 2.2 * scale, 0.3 * scale, 0, 0x5d4630);
  pushBox(faces, x, 3.1 * scale, z, 2.6 * scale, 2.4 * scale, 2.6 * scale, 0.4, 0x3f7a44);
  pushBox(faces, x, 4.6 * scale, z, 1.7 * scale, 1.6 * scale, 1.7 * scale, 0.9, 0x4a8a4c);
}

/* ------------------------------------------------------------------ */
/* The reels                                                           */
/* ------------------------------------------------------------------ */

const FIELD_SKY = { high: 0x6ea3d8, horizon: 0xf2e3cb, ground: 0x5c8a46 };
const CITY_SKY = { high: 0x8fb6d9, horizon: 0xf6e2c8, ground: 0x7d8a63 };

/* The built in circuit: fourteen stations on the figure eight, flags down
 * both sides, trees standing off the line, and the camera flying a lap. */
function fieldReel() {
  const faces = [];
  const line = [];
  const n = 220;
  for (let i = 0; i < n; i += 1) {
    line.push(circuitPoint(i / n));
  }
  const tangentAt = (i) => {
    const a = line[(i - 1 + n) % n];
    const b = line[(i + 1) % n];
    return Math.atan2(b.x - a.x, b.z - a.z);
  };
  for (let g = 0; g < CIRCUIT_STATIONS; g += 1) {
    const i = Math.round((g / CIRCUIT_STATIONS) * n) % n;
    const p = line[i];
    /* Every fourth station is a tower, which is what gives the course its
     * up and down in the real world and its variety of silhouette here. */
    const tower = g > 0 && g % 4 === 0;
    pushGate(faces, p.x, p.z, tangentAt(i), g === 0, 1.7526, 1.7526, tower ? 1.7526 : 0);
  }
  const flagColors = [0xdcd6ca, 0x1e3566, 0xdcd6ca, 0xb8332c];
  for (let f = 0; f < 44; f += 1) {
    const i = Math.round((f / 44) * n) % n;
    const p = line[i];
    const yaw = tangentAt(i);
    const side = f % 2 === 0 ? 8.5 : -8.5;
    pushFlag(faces, p.x + Math.cos(yaw) * side, p.z - Math.sin(yaw) * side, yaw + 1.2,
      flagColors[f % flagColors.length]);
  }
  /* Trees, well off the racing line, on a fixed lattice rather than a random
   * one: a thumbnail that reshuffles its scenery every time the screen opens
   * reads as a bug. */
  for (let t = 0; t < 40; t += 1) {
    const a = (t / 40) * Math.PI * 2;
    const r = 118 + (t % 5) * 22;
    pushTree(faces, Math.cos(a) * r, Math.sin(a) * (r * 1.05), 1 + (t % 3) * 0.35);
  }
  /* The horizon. The valley the field sits in is ringed with mountains and
   * a thumbnail with a bare straight skyline does not read as that valley.
   * Quads with a doubled apex, because a face list of quads is the whole
   * scene format and a triangle is a quad that agrees with itself. */
  for (let m = 0; m < 26; m += 1) {
    const a = (m / 26) * Math.PI * 2 + 0.11;
    /* Inside the fog, on purpose. The reel drops anything past the fog
     * distance outright, so a ring drawn where the real mountains stand
     * would be a ring nobody ever sees; put where the haze can reach them
     * they read as the far side of a valley, which is what they are. */
    const r = 430 + (m % 4) * 70;
    const w = 105 + (m % 3) * 46;
    const hgt = 66 + (m % 5) * 30;
    const cxm = Math.cos(a) * r;
    const czm = Math.sin(a) * r;
    const nx = -Math.sin(a);
    const nz = Math.cos(a);
    pushQuad(faces, [
      [cxm - nx * w, 0, czm - nz * w],
      [cxm + nx * w, 0, czm + nz * w],
      [cxm, hgt, czm],
      [cxm, hgt, czm],
    ], [-Math.cos(a), 0, -Math.sin(a)], m % 2 === 0 ? 0x8a9a6d : 0x7d8fa8);
  }

  const path = line.filter((_, i) => i % 4 === 0).map((p) => ({ x: p.x, y: 4.6, z: p.z }));
  return {
    faces, path, sky: FIELD_SKY, speed: 19, fog: 560, lookAhead: 22, drop: 2.4, lens: 1.15,
  };
}

/*
 * The freestyle town, as a caricature.
 *
 * NOT the town. The town is 63 modules this file is forbidden to import, so
 * what is drawn is the five things that make its opening frame recognisable:
 * a road that bends, a footway either side, shophouses hard up against both
 * kerbs, the level crossing with its booms down, and the utility poles that
 * carry the eye up out of frame. The road's own bend is the shape the real
 * one has, and the crossing is at z = 0 where the real one is.
 */
function cityReel() {
  const faces = [];
  /* The road centre's lateral drift, matching the shape of the town's own
   * centreline: it eases one way north of the crossing and the other way
   * south of it. */
  const smooth = (a, b, z) => {
    const t = Math.max(0, Math.min(1, (z - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const centre = (z) => 3.0 * smooth(-11, -36, z) - 3.4 * smooth(16, 44, z);
  const ground = (z) => 1.05 * smooth(-13, -32, z) + 0.45 * smooth(28, 48, z);
  const Z0 = -60;
  const Z1 = 46;
  const ROAD = 3.15;
  const WALK = 1.55;

  /* Carriageway and footways, as a strip of quads. */
  for (let z = Z0; z < Z1; z += 4) {
    const z2 = Math.min(Z1, z + 4);
    const c0 = centre(z);
    const c1 = centre(z2);
    const y0 = ground(z);
    const y1 = ground(z2);
    pushQuad(faces, [
      [c0 - ROAD, y0 + 0.01, z], [c0 + ROAD, y0 + 0.01, z],
      [c1 + ROAD, y1 + 0.01, z2], [c1 - ROAD, y1 + 0.01, z2],
    ], [0, 1, 0], 0x565a5e);
    for (const s of [-1, 1]) {
      pushQuad(faces, [
        [c0 + s * ROAD, y0 + 0.14, z], [c0 + s * (ROAD + WALK), y0 + 0.14, z],
        [c1 + s * (ROAD + WALK), y1 + 0.14, z2], [c1 + s * ROAD, y1 + 0.14, z2],
      ], [0, 1, 0], 0x9c968b);
    }
    /* The centre line, dashed, which is most of what says "road" at speed. */
    if (Math.abs(z) > 5 && Math.round(z / 4) % 2 === 0) {
      pushQuad(faces, [
        [c0 - 0.09, y0 + 0.02, z], [c0 + 0.09, y0 + 0.02, z],
        [c1 + 0.09, y1 + 0.02, z2], [c1 - 0.09, y1 + 0.02, z2],
      ], [0, 1, 0], 0xd8d2c2);
    }
  }

  /* Shophouses. Two storeys, hard against the footway, alternating in a
   * fixed rhythm so the street has a grain without a random stream. */
  const walls = [0xd9cdb8, 0xc8b9a2, 0xb9c3bd, 0xd2c0ae, 0xa9b3ad];
  const roofs = [0x53565c, 0x6a5a4e, 0x47505a];
  let k = 0;
  for (let z = Z0 + 3; z < Z1 - 3; z += 7.5) {
    for (const s of [-1, 1]) {
      k += 1;
      if (Math.abs(z) < 9) {
        continue; /* the crossing keeps its corners clear */
      }
      const c = centre(z);
      const y = ground(z);
      const h = 5.4 + (k % 3) * 1.6;
      const d = 6.2 + (k % 2) * 1.4;
      const x = c + s * (ROAD + WALK + d * 0.5);
      pushBox(faces, x, y + h * 0.5, z + 0.4, d, h, 6.4, 0, walls[k % walls.length]);
      pushBox(faces, x, y + h + 0.28, z + 0.4, d + 0.7, 0.56, 7.1, 0, roofs[k % roofs.length]);
      /* A shop awning over the footway: the one thing that makes a street
       * read as a shopping street rather than as a corridor of blocks. */
      if (k % 2 === 0) {
        pushBox(faces, c + s * (ROAD + WALK * 0.5), y + 2.65, z + 0.4, WALK, 0.1, 5.0, 0,
          [0xc4452f, 0x3f6fa8, 0x2f7a5a][k % 3]);
      }
    }
  }

  /* The level crossing: ballast, four rails, the gate posts and the booms
   * down across both approaches. */
  pushQuad(faces, [[-70, 0.005, -3.2], [70, 0.005, -3.2], [70, 0.005, 3.2], [-70, 0.005, 3.2]],
    [0, 1, 0], 0x6b6156);
  for (const rz of [-1.07, -0.6, 0.6, 1.07]) {
    pushQuad(faces, [[-70, 0.14, rz - 0.04], [70, 0.14, rz - 0.04], [70, 0.14, rz + 0.04], [-70, 0.14, rz + 0.04]],
      [0, 1, 0], 0x8d8378);
  }
  for (const s of [-1, 1]) {
    for (const side of [-1, 1]) {
      const px = centre(0) + side * (ROAD + 0.5);
      pushBox(faces, px, 1.6, s * 2.95, 0.16, 3.2, 0.16, 0, 0x2f3540);
      /* The boom, down, in the black and yellow every crossing in the world
       * uses. Four blocks is enough to read as banded. */
      for (let b = 0; b < 4; b += 1) {
        pushBox(faces, px - side * (0.7 + b * 1.4), 1.24, s * 2.95, 1.3, 0.14, 0.14, 0,
          b % 2 === 0 ? 0xe8c33c : 0x22262e);
      }
    }
  }
  /* A train standing in the crossing's middle distance, which is the town's
   * own establishing image. */
  for (let car = 0; car < 3; car += 1) {
    pushBox(faces, 26 + car * 19.6, 2.4, 0, 19.4, 2.68, 2.86, 0, 0xdfe3e6);
    pushBox(faces, 26 + car * 19.6, 3.85, 0, 19.3, 0.22, 2.62, 0, 0x9aa2a8);
    pushBox(faces, 26 + car * 19.6, 2.9, 0, 19.4, 0.7, 2.9, 0, 0x2f6fa8);
  }

  /* Utility poles, alternating sides, with the crossarms that make them
   * read as poles rather than as posts. */
  for (let z = Z0 + 6; z < Z1; z += 13) {
    const s = Math.round(z / 13) % 2 === 0 ? 1 : -1;
    const x = centre(z) + s * (ROAD + WALK + 0.5);
    const y = ground(z);
    pushBox(faces, x, y + 4.6, z, 0.26, 9.2, 0.26, 0, 0x6d6560);
    pushBox(faces, x, y + 8.65, z, 0.1, 0.1, 2.1, 0, 0x3a3f47);
    pushBox(faces, x, y + 7.7, z, 0.1, 0.1, 1.7, 0, 0x3a3f47);
  }

  /* Up the street, over the crossing, and back. The same shape the map's own
   * attract path flies, at the same heights, for the same reasons. */
  const path = [];
  for (let z = Z1 - 4; z > Z0 + 4; z -= 4) {
    const hop = Math.max(0, 1 - Math.abs(z) / 15);
    const eye = 3.3 + 3.6 * hop * hop * (3 - 2 * hop);
    path.push({ x: centre(z), y: ground(z) + eye, z });
  }
  /*
   * The two turns that join the street to the roof line, and the height has
   * to EASE across them rather than jump. Starting the climb at rooftop
   * height put the camera skimming the roofs it was meant to be climbing
   * over, which is the same class of mistake the old orbit made: a shot
   * that assumes the space above a street is empty when the space above a
   * street is roofs.
   */
  const turn = (z0, from, to, y0, y1) => {
    for (let i = 1; i <= 7; i += 1) {
      const t = i / 7;
      const a = from + (to - from) * t;
      const ease = t * t * (3 - 2 * t);
      path.push({
        x: centre(z0) + 11 + Math.cos(a) * 11,
        y: y0 + (y1 - y0) * ease,
        z: z0 + Math.sin(a) * 11,
      });
    }
  };
  turn(Z0 + 4, Math.PI, Math.PI * 2, ground(Z0 + 4) + 3.3, ground(Z0 + 4) + 14);
  for (let z = Z0 + 4; z < Z1 - 4; z += 5) {
    path.push({ x: centre(z) + 22, y: ground(z) + 14, z });
  }
  turn(Z1 - 4, 0, Math.PI, ground(Z1 - 4) + 14, ground(Z1 - 4) + 3.3);
  return {
    faces, path, sky: CITY_SKY, speed: 11, fog: 105, lookAhead: 13, drop: 1.6, lens: 0.62,
  };
}

/*
 * The course open in the track builder, drawn from its own document.
 *
 * Reads the builder's data modules and nothing else, which is the same one
 * way dependency src/game/trackdoc.js declares: the game may read the
 * builder's pure data, the builder may not read the game.
 */
async function customReel() {
  const [{ readAutosave }, { buildPath }, { ELEMENTS, KIND, apertureLevels }] = await Promise.all([
    import('../trackbuilder/storage.js'),
    import('../trackbuilder/path.js'),
    import('../trackbuilder/elements.js'),
  ]);
  const saved = readAutosave();
  const doc = saved && saved.doc ? saved.doc : null;
  if (!doc || !doc.sequence.length) {
    return null;
  }
  const path = buildPath(doc);
  if (!path.samples.length) {
    return null;
  }
  /* Document frame to the reel's frame, the same conversion trackdoc.js
   * makes: the field is centred on the origin and y is up. */
  const toReel = (p) => ({ x: p.x - doc.field.width / 2, z: -(p.y - doc.field.depth / 2) });

  const faces = [];
  /* The pitch a designed course stands on: mown, level, and marked on the
   * author's own boundary, exactly as src/render/scene.js lays it. */
  const hw = doc.field.width * 0.5;
  const hd = doc.field.depth * 0.5;
  pushQuad(faces, [
    [-hw - 8, 0.002, -hd - 8], [hw + 8, 0.002, -hd - 8],
    [hw + 8, 0.002, hd + 8], [-hw - 8, 0.002, hd + 8],
  ], [0, 1, 0], 0x4e7b3c);
  for (const [a, b] of [[[-hw, -hd], [hw, -hd]], [[hw, -hd], [hw, hd]], [[hw, hd], [-hw, hd]], [[-hw, hd], [-hw, -hd]]]) {
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.hypot(dx, dz) || 1;
    const nx = (-dz / len) * 0.08;
    const nz = (dx / len) * 0.08;
    pushQuad(faces, [
      [a[0] - nx, 0.012, a[1] - nz], [b[0] - nx, 0.012, b[1] - nz],
      [b[0] + nx, 0.012, b[1] + nz], [a[0] + nx, 0.012, a[1] + nz],
    ], [0, 1, 0], 0xe8e2d2);
  }

  let order = 0;
  for (const seq of doc.sequence) {
    const el = doc.elements.find((e) => e.id === seq.elementId);
    if (!el) {
      continue;
    }
    const def = ELEMENTS[el.type];
    const p = toReel(el.position);
    if (def.kind === KIND.APERTURE) {
      const levels = apertureLevels(el.dims);
      const ap = levels[Math.min(Math.max(0, seq.apertureIndex ?? 0), levels.length - 1)];
      /* GATE_SCALE, the game's declared 15 percent departure from the
       * published dimensions, applied here for the same reason the world
       * applies it: the same 5 ft gate has to be the same size on both. */
      const k = 1.15;
      pushGate(faces, p.x, p.z, -el.yaw, order === 0,
        ap.clearW * k, ap.clearH * k, (el.position.z + ap.sillH) * k);
      order += 1;
    } else if (def.kind === KIND.MARKER) {
      pushFlag(faces, p.x, p.z, -el.yaw, order === 0 ? 0x7dffb4 : 0xc4452f);
    }
  }
  for (const el of doc.elements) {
    const def = ELEMENTS[el.type];
    const p = toReel(el.position);
    if (def.kind === KIND.OBSTACLE) {
      pushBox(faces, p.x, el.position.z + el.dims.height * 0.5, p.z,
        el.dims.width, el.dims.height, el.dims.depth, -el.yaw, bannerHex('vinyl'));
    } else if (def.kind === KIND.START) {
      const n = Math.max(1, Math.round(el.dims.pads));
      for (let i = 0; i < n; i += 1) {
        const off = (i - (n - 1) / 2) * el.dims.spacing;
        pushBox(faces, p.x + Math.cos(-el.yaw) * off, 0.03, p.z - Math.sin(-el.yaw) * off,
          el.dims.padSize, 0.05, el.dims.padSize, -el.yaw, 0x2f4f3a);
      }
    }
  }
  for (let t = 0; t < 22; t += 1) {
    const a = (t / 22) * Math.PI * 2;
    pushTree(faces, Math.cos(a) * (hw + 26), Math.sin(a) * (hd + 26), 1 + (t % 3) * 0.3);
  }

  /* The camera flies the author's own racing line, lifted clear of the
   * tallest thing on the course, which is the same rule the world's title
   * camera follows. */
  let tallest = 2.6;
  for (const el of doc.elements) {
    const def = ELEMENTS[el.type];
    if (def.kind === KIND.APERTURE) {
      const levels = apertureLevels(el.dims);
      const top = levels[levels.length - 1];
      tallest = Math.max(tallest, (el.position.z + top.sillH + top.clearH) * 1.15 + 0.8);
    }
  }
  const eye = tallest + 2.6;
  const camPath = [];
  const stride = Math.max(1, Math.round(path.samples.length / 90));
  for (let i = 0; i < path.samples.length; i += stride) {
    const q = toReel(path.samples[i].pos);
    camPath.push({ x: q.x, y: eye, z: q.z });
  }
  if (camPath.length < 4) {
    return null;
  }
  return {
    faces, path: camPath, sky: FIELD_SKY, speed: 11, fog: 150, lookAhead: 14, drop: 2.2, lens: 0.85,
  };
}

/* ------------------------------------------------------------------ */
/* The renderer                                                        */
/* ------------------------------------------------------------------ */

/*
 * A closed Catmull-Rom through the camera path, evaluated by arc length so
 * the flight does not speed up through the tight corners. Sampled to a
 * polyline once and then walked, because a thumbnail wants the arithmetic
 * done at build time.
 */
function walkable(points) {
  const n = points.length;
  const at = (i) => points[((i % n) + n) % n];
  const pts = [];
  const per = 6;
  for (let i = 0; i < n; i += 1) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    for (let s = 0; s < per; s += 1) {
      const t = s / per;
      const t2 = t * t;
      const t3 = t2 * t;
      const h = (a, b, c, d) => 0.5 * (
        2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3
      );
      pts.push({
        x: h(p0.x, p1.x, p2.x, p3.x),
        y: h(p0.y, p1.y, p2.y, p3.y),
        z: h(p0.z, p1.z, p2.z, p3.z),
      });
    }
  }
  const cum = [0];
  for (let i = 1; i <= pts.length; i += 1) {
    const a = pts[i - 1];
    const b = pts[i % pts.length];
    cum.push(cum[i - 1] + Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z));
  }
  const total = cum[pts.length] || 1;
  return {
    total,
    at(distance) {
      let d = distance % total;
      if (d < 0) {
        d += total;
      }
      let lo = 0;
      let hi = pts.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (cum[mid] <= d) {
          lo = mid + 1;
        } else {
          hi = mid;
        }
      }
      const i = Math.max(0, lo - 1);
      const seg = cum[i + 1] - cum[i] || 1;
      const t = (d - cum[i]) / seg;
      const a = pts[i % pts.length];
      const b = pts[(i + 1) % pts.length];
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        z: a.z + (b.z - a.z) * t,
      };
    },
  };
}

/*
 * Clip a view space polygon against the near plane. One plane is all that is
 * needed: everything else is handled by the canvas's own clipping, and a
 * polygon behind the eye is the only case that projects to nonsense rather
 * than to something off screen.
 */
function clipNear(poly) {
  const out = [];
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const ain = a.d >= NEAR;
    const bin = b.d >= NEAR;
    if (ain) {
      out.push(a);
    }
    if (ain !== bin) {
      const t = (NEAR - a.d) / (b.d - a.d);
      out.push({
        s: a.s + (b.s - a.s) * t,
        u: a.u + (b.u - a.u) * t,
        d: NEAR,
      });
    }
  }
  return out;
}

export function makeReel(canvas, reel) {
  const track = walkable(reel.path);
  const horizon = rgb(reel.sky.horizon);
  const high = rgb(reel.sky.high);
  const groundCol = rgb(reel.sky.ground);
  const cols = reel.faces.map((f) => rgb(f.c));
  const view = reel.faces.map(() => [{ s: 0, u: 0, d: 0 }, { s: 0, u: 0, d: 0 }, { s: 0, u: 0, d: 0 }, { s: 0, u: 0, d: 0 }]);
  const order = reel.faces.map((_, i) => i);
  let bank = 0;
  let last = null;

  return {
    frame(seconds) {
      const w = canvas.width;
      const h = canvas.height;
      if (!(w > 0 && h > 0)) {
        return;
      }
      const ctx = canvas.getContext('2d');
      const eye = track.at(seconds * reel.speed);
      const aim = track.at(seconds * reel.speed + reel.lookAhead);
      const back = track.at(seconds * reel.speed - reel.lookAhead);
      const yaw = Math.atan2(aim.x - eye.x, aim.z - eye.z);
      const yaw0 = Math.atan2(eye.x - back.x, eye.z - back.z);
      let turn = yaw - yaw0;
      while (turn > Math.PI) {
        turn -= Math.PI * 2;
      }
      while (turn < -Math.PI) {
        turn += Math.PI * 2;
      }
      const dt = last == null ? 0 : Math.min(0.12, seconds - last);
      last = seconds;
      bank += (Math.max(-0.20, Math.min(0.20, turn * 0.85)) - bank) * Math.min(1, dt * 2.4);
      /* Pitch, as a screen shear rather than a rotation: the aim point is a
       * fixed drop below the camera, which is the same framing rule the
       * title camera uses, and at these angles a shear and a rotation are
       * indistinguishable at 240 pixels. */
      const aimDist = Math.max(1, Math.hypot(aim.x - eye.x, aim.z - eye.z));
      const pitch = Math.atan2((aim.y - reel.drop) - eye.y, aimDist);

      /*
       * The lens, per reel. A thumbnail of a 570 m circuit and a thumbnail
       * of a 6 m street are not the same shot: on the wide lens the town's
       * walls fill the frame and the field's gates are four pixels of amber
       * on an acre of grass. So the course gets a long lens that compresses
       * the run of gates into something readable and the street keeps the
       * wide one that makes it a street.
       */
      const focal = h * reel.lens;
      const cx = w * 0.5;
      const cy = h * 0.5;
      const cyaw = Math.cos(yaw);
      const syaw = Math.sin(yaw);
      const cb = Math.cos(bank);
      const sb = Math.sin(bank);

      /* Sky and ground, split at the projected horizon. */
      const hy = cy + Math.tan(pitch) * focal;
      const grad = ctx.createLinearGradient(0, 0, 0, Math.max(1, hy));
      grad.addColorStop(0, `rgb(${high[0]},${high[1]},${high[2]})`);
      grad.addColorStop(1, `rgb(${horizon[0]},${horizon[1]},${horizon[2]})`);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-bank);
      ctx.translate(-cx, -cy);
      const over = Math.hypot(w, h);
      ctx.fillStyle = grad;
      ctx.fillRect(-over, -over, w + over * 2, Math.max(0, hy) + over);
      ctx.fillStyle = `rgb(${groundCol[0]},${groundCol[1]},${groundCol[2]})`;
      ctx.fillRect(-over, hy, w + over * 2, h + over * 2);
      ctx.restore();

      /* Project once per vertex, then sort the faces that survive. */
      let live = 0;
      for (let i = 0; i < reel.faces.length; i += 1) {
        const f = reel.faces[i];
        const v = view[i];
        let maxD = -1e9;
        let minD = 1e9;
        for (let k = 0; k < 4; k += 1) {
          const p = f.p[k];
          const dx = p[0] - eye.x;
          const dz = p[2] - eye.z;
          const d = dx * syaw + dz * cyaw;
          v[k].d = d;
          v[k].s = dx * cyaw - dz * syaw;
          v[k].u = p[1] - eye.y;
          if (d > maxD) {
            maxD = d;
          }
          if (d < minD) {
            minD = d;
          }
        }
        if (maxD < NEAR || minD > reel.fog) {
          continue;
        }
        /* Back face cull, in world space against the view direction. A face
         * whose outward normal points away cannot be seen and its fill is
         * the single biggest cost here. */
        const mid = (f.p[0][0] + f.p[2][0]) * 0.5 - eye.x;
        const midY = (f.p[0][1] + f.p[2][1]) * 0.5 - eye.y;
        const midZ = (f.p[0][2] + f.p[2][2]) * 0.5 - eye.z;
        if (f.n[0] * mid + f.n[1] * midY + f.n[2] * midZ > 0) {
          continue;
        }
        order[live] = i;
        view[i].depth = (maxD + minD) * 0.5;
        live += 1;
      }
      const drawn = order.slice(0, live);
      drawn.sort((a, b) => view[b].depth - view[a].depth);

      for (const i of drawn) {
        const f = reel.faces[i];
        const poly = clipNear(view[i]);
        if (poly.length < 3) {
          continue;
        }
        /* Warm light, cool distance: a flat lambert step against the sun,
         * then a fade into the horizon band, which is the same pair of rules
         * the world renders by. */
        const lit = f.n[0] * SUN[0] + f.n[1] * SUN[1] + f.n[2] * SUN[2];
        const shade = lit > 0.15 ? 1.0 : (lit > -0.25 ? 0.82 : 0.68);
        const fade = Math.max(0, Math.min(1, (view[i].depth - reel.fog * 0.25) / (reel.fog * 0.75)));
        const c = mixRgb(scaleRgb(cols[i], shade), horizon, fade * fade);
        ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
        ctx.beginPath();
        for (let k = 0; k < poly.length; k += 1) {
          const p = poly[k];
          const inv = focal / p.d;
          const sx = p.s * inv;
          const sy = -(p.u * inv) + Math.tan(pitch) * focal;
          /* The bank is applied as a screen rotation, which is what a
           * camera rolling actually does to the image. */
          const rx = sx * cb - sy * sb;
          const ry = sx * sb + sy * cb;
          if (k === 0) {
            ctx.moveTo(cx + rx, cy + ry);
          } else {
            ctx.lineTo(cx + rx, cy + ry);
          }
        }
        ctx.closePath();
        ctx.fill();
      }
    },
  };
}

/*
 * Build the reel for one map id, or null when there is nothing to show.
 * Async because the designed course's data arrives through a dynamic import,
 * which is what keeps the track builder's modules off the boot path.
 */
export async function reelFor(id) {
  if (id === 'field') {
    return fieldReel();
  }
  if (id === 'city') {
    return cityReel();
  }
  if (id === 'custom') {
    return customReel();
  }
  return null;
}
