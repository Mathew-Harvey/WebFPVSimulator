/*
 * cape.js: the land of Hyoura Island above the hamlet. The road that climbs
 * from the harbour to the cape, with the red and white snow poles that mark
 * its edge under a metre of snow and the curve mirror at its bend; the
 * lighthouse on the cape and its keeper's house; a small shrine and its
 * torii looking out to sea; the lookout deck over the falls; the weather
 * radar on the summit; and the firs, in stands on the southern slopes.
 *
 * THE REAL PLACES behind it: a Japanese cape lighthouse is a white tower of
 * about 20 m with a gallery and a lantern (Shiretoko-misaki's is 9 m on a
 * cliff, Notoro-misaki's 23 m); the snow poles are the yabane of Hokkaido's
 * roads, a striped pole with a down pointing arrow at about 5 m; the firs
 * are the Sakhalin fir and Yezo spruce of the Shiretoko forest, dark cones
 * that carry their snow in shelves.
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

import { rng } from './frame.js';
import {
  groundAt, noise, isLandCell, grid, CELL, GX0, GZ0, NX, NZ, HAMLET, LIGHTHOUSE, LOOKOUT,
} from './terrain.js';
import { gableX, pole, wires } from './hamlet.js';

/* The road from the hamlet to the cape, world [x, z], 5.2 m wide. */
export const CAPE_ROAD = [[134, 77], [150, 70], [168, 58], [186, 44], [202, 28], [216, 12], [228, 2], [236, -4]];
const ROAD_HALF = 2.6;
/* The torii on the cape, flown north to south. */
export const TORII = { x: 222, z: -36, span: 3.6, h: 4.7, nuki: 3.75 };
/* The lighthouse: a tower this tall from its ground, this round. */
export const TOWER = { h: 21, r0: 2.6, r1: 2.05 };

/* Points every `step` metres along a polyline, with the unit across each. */
function along(line, step) {
  const out = [];
  for (let k = 0; k + 1 < line.length; k += 1) {
    const [ax, az] = line[k];
    const [bx, bz] = line[k + 1];
    const L = Math.sqrt((bx - ax) * (bx - ax) + (bz - az) * (bz - az));
    const n = Math.max(1, Math.round(L / step));
    for (let s = 0; s < n || (k === line.length - 2 && s === n); s += 1) {
      const t = s / n;
      out.push({ x: ax + (bx - ax) * t, z: az + (bz - az) * t, ux: -(bz - az) / L, uz: (bx - ax) / L });
    }
  }
  return out;
}

/* Squared distance from (x, z) to the road's centre line. */
function roadD2(x, z) {
  let best = Infinity;
  for (let k = 0; k + 1 < CAPE_ROAD.length; k += 1) {
    const [ax, az] = CAPE_ROAD[k];
    const [bx, bz] = CAPE_ROAD[k + 1];
    const dx = bx - ax;
    const dz = bz - az;
    let t = ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = ax + dx * t - x;
    const pz = az + dz * t - z;
    best = Math.min(best, px * px + pz * pz);
  }
  return best;
}

/* The road: a ribbon on the snow, its edge lines, its snow poles on the
 * sea side, its guard rail, and the poles and wires up to the light. */
function road(I) {
  const pts = along(CAPE_ROAD, 3);
  const L = [];
  const R = [];
  const lineL = [];
  const lineR = [];
  for (const p of pts) {
    const lx = p.x + p.ux * ROAD_HALF;
    const lz = p.z + p.uz * ROAD_HALF;
    const rx = p.x - p.ux * ROAD_HALF;
    const rz = p.z - p.uz * ROAD_HALF;
    L.push([lx, groundAt(lx, lz) + 0.1, lz]);
    R.push([rx, groundAt(rx, rz) + 0.1, rz]);
    lineL.push([lx - p.ux * 0.35, groundAt(lx, lz) + 0.12, lz - p.uz * 0.35]);
    lineR.push([lx - p.ux * 0.5, groundAt(lx, lz) + 0.12, lz - p.uz * 0.5]);
  }
  I.ribbon('arAsphalt', L, R);
  I.ribbon('arLine', lineL, lineR);
  /* The yabane: on the sea side (right going up), every 15 m. */
  along(CAPE_ROAD, 15).forEach((p, k) => {
    const x = p.x - p.ux * (ROAD_HALF + 0.8);
    const z = p.z - p.uz * (ROAD_HALF + 0.8);
    const g = groundAt(x, z);
    I.post('arWhite', x, z, g, g + 5.2, 0.05, { kind: 'pole', name: 'snow pole' });
    I.dress(() => {
      for (let s = 0; s < 5; s += 1) {
        I.cyl('arPoleRed', [x, g + 0.5 + s * 0.9, z], [x, g + 0.95 + s * 0.9, z], 0.055, 5);
      }
      /* The arrow, pointing down at the road's edge. */
      I.deco('arPoleRed', x - p.ux * 0.05, g + 4.6, z - p.uz * 0.05, x + p.ux * 0.55 + 0.02, g + 5.0, z + p.uz * 0.55 + 0.02);
      I.cone('arWhite', x + p.ux * 0.3, g + 4.6, z + p.uz * 0.3, 0.16, -0.32, 4);
    });
    /* A short run of guard rail on the bends. */
    if (k % 2 === 1) {
      I.dress(() => {
        const ax = x + p.ux * 0.3;
        const az = z + p.uz * 0.3;
        const dx = p.uz * 6;
        const dz = -p.ux * 6;
        I.cyl('arWhite', [ax - dx, groundAt(ax - dx, az - dz) + 0.75, az - dz], [ax + dx, groundAt(ax + dx, az + dz) + 0.75, az + dz], 0.12, 5);
        for (const s of [-1, 0, 1]) {
          const px = ax + dx * s * 0.9;
          const pz = az + dz * s * 0.9;
          I.cyl('arSteel', [px, groundAt(px, pz), pz], [px, groundAt(px, pz) + 0.8, pz], 0.05, 4);
        }
      });
    }
  });
  /* The curve mirror at the hairpin, orange on its post. */
  const [mx, mz] = [205, 34];
  const mg = groundAt(mx, mz);
  I.post('arMirror', mx, mz, mg, mg + 2.8, 0.05, { kind: 'pole', name: 'mirror post' });
  I.cyl('arMirror', [mx, mg + 3.1, mz], [mx - 0.12, mg + 3.1, mz + 0.12], 0.42, 12, null, true);
  I.cyl('arMirrorFace', [mx - 0.12, mg + 3.1, mz + 0.12], [mx - 0.14, mg + 3.1, mz + 0.14], 0.36, 12, null, true);
  /* Poles up to the light, on the land side. */
  const tops = [];
  along(CAPE_ROAD, 30).forEach((p) => {
    const x = p.x + p.ux * (ROAD_HALF + 2.2);
    const z = p.z + p.uz * (ROAD_HALF + 2.2);
    tops.push(pole(I, x, z, groundAt(x, z)));
  });
  for (let k = 0; k + 1 < tops.length; k += 1) {
    wires(I, tops[k], tops[k + 1], 0.8);
  }
}

/* The lighthouse, its gallery and lantern, the keeper's house and fence. */
function lighthouse(I) {
  const { x, z } = LIGHTHOUSE;
  const g = groundAt(x, z);
  const top = g + TOWER.h;
  /* The tower is solid as a capsule a little inside its taper. */
  I.post('arWhite', x, z, g, top, TOWER.r1, { kind: 'wall', name: 'lighthouse', draw: false });
  I.cyl('arWhite', [x, g - 0.5, z], [x, top, z], TOWER.r0, 12, TOWER.r1);
  /* The plinth and the door. */
  I.box('arConcrete', x - 3.4, g - 0.6, z - 3.4, x + 3.4, g + 0.6, z + 3.4, { kind: 'wall', name: 'plinth' });
  I.paint('arIron', x - 0.6, g + 0.6, z + TOWER.r0 - 0.05, x + 0.6, g + 2.6, z + TOWER.r0 + 0.02);
  /* The gallery: a deck all round and its rail, drawn only. */
  I.cyl('arConcreteDark', [x, top, z], [x, top + 0.35, z], 3.3, 16);
  I.cyl('arIron', [x, top + 1.25, z], [x, top + 1.33, z], 3.25, 16, null, true);
  /* The lantern: glass in a frame, its lamp, the red dome and the vane. */
  I.cyl('arIron', [x, top + 0.35, z], [x, top + 0.9, z], 1.7, 12);
  I.cyl('arGlass', [x, top + 0.9, z], [x, top + 3.0, z], 1.55, 12);
  I.ball('arLamp', x, top + 1.9, z, 0.6);
  I.cone('arRed', x, top + 3.0, z, 1.85, 1.3, 12);
  I.ball('arIron', x, top + 4.4, z, 0.22);
  I.post('arIron', x, z, top + 3.0, top + 5.6, 0.04, { kind: 'pole', name: 'vane' });
  /* Windows up the tower. */
  for (const h of [6, 11, 16]) {
    I.paint('arGlassDark', x - 0.3, g + h, z + TOWER.r0 - 0.35 - h * 0.025, x + 0.3, g + h + 1.0, z + TOWER.r0 - 0.25 - h * 0.025);
  }
  /* The keeper's house. */
  const hx = x - 18;
  const hz = z + 2;
  const hg = Math.max(groundAt(hx, hz), groundAt(hx + 10, hz + 7), groundAt(hx, hz + 7), groundAt(hx + 10, hz));
  const hlo = Math.min(groundAt(hx, hz), groundAt(hx + 10, hz + 7), groundAt(hx, hz + 7), groundAt(hx + 10, hz));
  I.box('arConcreteDark', hx, hlo - 0.5, hz, hx + 10, hg + 0.3, hz + 7, { kind: 'wall', name: 'keeper footing' });
  I.box('arWhite', hx, hg + 0.3, hz, hx + 10, hg + 3.4, hz + 7, { kind: 'wall', name: 'keeper house' });
  gableX(I, 'arTinRed', hx, hx + 10, hz, hz + 7, hg + 3.4, 1.4, 0.45);
  for (const xe of [hx, hx + 9.99]) {
    I.prism('arWhite', 'x', [[hz, hg + 3.4], [hz + 3.5, hg + 4.75], [hz + 7, hg + 3.4]], xe, xe + 0.01);
  }
  I.dress(() => {
    for (const wx of [hx + 1.2, hx + 4.2, hx + 7.4]) {
      I.paint('arGlass', wx, hg + 1.3, hz + 7, wx + 1.4, hg + 2.5, hz + 7.05);
    }
    /* The fence round the light. */
    for (let k = 0; k < 16; k += 1) {
      const t = k / 16;
      const fx = x - 9 + 18 * (k < 8 ? t * 2 : 1 - (t - 0.5) * 2);
      const fz = z + (k < 8 ? -9 : 9);
      I.cyl('arWhite', [fx, groundAt(fx, fz), fz], [fx, groundAt(fx, fz) + 1.1, fz], 0.05, 4);
    }
  });
}

/* The torii and the little shrine behind it, looking out to sea. */
function shrine(I) {
  const t = TORII;
  const g = groundAt(t.x, t.z);
  const hs = t.span / 2;
  for (const s of [-1, 1]) {
    I.post('arTorii', t.x + s * hs, t.z, g - 0.3, g + t.h, 0.21, { kind: 'pole', name: 'torii post' });
    I.cyl('arIron', [t.x + s * hs, g - 0.3, t.z], [t.x + s * hs, g + 0.35, t.z], 0.27, 8);
  }
  I.box('arTorii', t.x - hs - 0.35, g + t.nuki, t.z - 0.12, t.x + hs + 0.35, g + t.nuki + 0.24, t.z + 0.12, { kind: 'wall', name: 'nuki' });
  I.box('arTorii', t.x - hs - 0.9, g + t.h, t.z - 0.2, t.x + hs + 0.9, g + t.h + 0.32, t.z + 0.2, { kind: 'wall', name: 'kasagi' });
  I.box('arIron', t.x - hs - 1.05, g + t.h + 0.32, t.z - 0.24, t.x + hs + 1.05, g + t.h + 0.5, t.z + 0.24, { kind: 'wall', name: 'kasagi top' });
  I.paint('arSnow', t.x - hs - 1.0, g + t.h + 0.5, t.z - 0.22, t.x + hs + 1.0, g + t.h + 0.62, t.z + 0.22);
  /* The plaque between the beams. */
  I.deco('arIron', t.x - 0.3, g + t.nuki + 0.24, t.z - 0.06, t.x + 0.3, g + t.h, t.z + 0.06);
  /* The shrine, north of the torii (the land side), facing south. */
  const sz = t.z - 7;
  const sg = groundAt(t.x, sz);
  I.box('arConcrete', t.x - 1.2, sg - 0.4, sz - 1.0, t.x + 1.2, sg + 0.6, sz + 1.0, { kind: 'wall', name: 'shrine base' });
  I.box('arWood', t.x - 0.7, sg + 0.6, sz - 0.55, t.x + 0.7, sg + 1.7, sz + 0.55, { kind: 'wall', name: 'shrine' });
  gableX(I, 'arIron', t.x - 0.8, t.x + 0.8, sz - 0.65, sz + 0.65, sg + 1.7, 0.6, 0.25);
  I.paint('arWhite', t.x - 0.25, sg + 0.9, sz + 0.55, t.x + 0.25, sg + 1.5, sz + 0.58);
  /* Stone lanterns either side of the path. */
  for (const s of [-1, 1]) {
    const lx = t.x + s * 2.4;
    const lz = t.z - 3.5;
    const lg = groundAt(lx, lz);
    I.post('arConcrete', lx, lz, lg, lg + 1.3, 0.16, { kind: 'pole', name: 'lantern' });
    I.box('arConcrete', lx - 0.35, lg + 1.3, lz - 0.35, lx + 0.35, lg + 1.7, lz + 0.35, { kind: 'wall', name: 'lantern' });
    I.cone('arConcreteDark', lx, lg + 1.7, lz, 0.5, 0.45, 4);
    I.paint('arSnow', lx - 0.3, lg + 2.0, lz - 0.3, lx + 0.3, lg + 2.12, lz + 0.3);
  }
}

/* The lookout deck over the falls: a deck, its rail, a coin telescope. */
function lookout(I) {
  const { x, z } = LOOKOUT;
  const g = groundAt(x, z);
  const x0 = x - 5;
  const x1 = x + 5;
  const z0 = z - 6;
  const z1 = z + 1;
  I.box('arBoardPale', x0, g - 0.4, z0, x1, g + 0.35, z1, { kind: 'wall', name: 'lookout deck' });
  for (let px = x0 + 0.2; px <= x1; px += 2.4) {
    I.post('arWood', px, z0 + 0.2, g + 0.35, g + 1.4, 0.06, { kind: 'pole', name: 'lookout rail' });
  }
  I.cap('arWood', [x0, g + 1.35, z0 + 0.2], [x1, g + 1.35, z0 + 0.2], 0.06, { kind: 'pole', name: 'lookout rail' });
  I.post('arIron', x + 2.5, z0 + 1.2, g + 0.35, g + 1.4, 0.07, { kind: 'pole', name: 'telescope' });
  I.dress(() => {
    I.cyl('arIron', [x + 2.5, g + 1.5, z0 + 1.0], [x + 2.5, g + 1.6, z0 + 1.6], 0.16, 8);
    I.cyl('arWood', [x0, g + 0.85, z0 + 0.2], [x1, g + 0.85, z0 + 0.2], 0.05, 4);
    I.paint('arSnow', x0 + 0.1, g + 0.35, z0 + 0.6, x1 - 0.1, g + 0.4, z1 - 0.1);
  });
  I.post('arWood', x - 3.5, z1 - 0.3, g + 0.35, g + 2.4, 0.07, { kind: 'pole', name: 'lookout sign' });
  I.sign('falls', x - 3.5, g + 2.1, z1 - 0.22, 1.6, 0.8, '+z');
}

/* The weather radar on the summit: a block, its dome, a mast. */
function radar(I, x, z) {
  const g = Math.min(groundAt(x - 5, z - 5), groundAt(x + 5, z - 5), groundAt(x - 5, z + 5), groundAt(x + 5, z + 5));
  const gt = Math.max(groundAt(x - 5, z - 5), groundAt(x + 5, z - 5), groundAt(x - 5, z + 5), groundAt(x + 5, z + 5), groundAt(x, z));
  I.box('arWallWhite', x - 5, g - 0.5, z - 5, x + 5, gt + 5, z + 5, { kind: 'wall', name: 'radar block' });
  I.cyl('arConcreteDark', [x, gt + 5, z], [x, gt + 6.2, z], 3.6, 16);
  I.cap('arWhite', [x, gt + 9.2, z], [x, gt + 9.2, z], 4.2, { kind: 'wall', name: 'radar dome', draw: false });
  I.ball('arWhite', x, gt + 9.2, z, 4.6);
  I.post('arSteel', x + 3.8, z + 3.8, gt + 5, gt + 13, 0.08, { kind: 'pole', name: 'radar mast' });
  I.dress(() => {
    I.paint('arBand', x - 5.03, gt + 3.6, z - 5.03, x + 5.03, gt + 4.0, z + 5.03);
    I.paint('arGlassDark', x - 1, gt - 0.1 + 0.0 + 0.1, z + 5, x + 1, gt + 2.2, z + 5.05);
  });
}

/*
 * THE FIRS: a jittered lattice over the land, a fir where the noise makes a
 * stand, on ground low and gentle enough to hold one, clear of the hamlet,
 * the road, the cape's buildings and the cliff edge. Each is solid as a
 * trunk and a capsule inside its cones, and drawn as three tiers, each
 * capped with its shelf of snow.
 */
function firs(I) {
  const r = rng(101);
  const step = 7;
  let n = 0;
  for (let z = -200; z < 120; z += step) {
    for (let x = -340; x < 200; x += step) {
      const fx = x + r.range(0, step);
      const fz = z + r.range(0, step);
      const k = r.next();
      const i = Math.floor((fx - GX0) / CELL);
      const j = Math.floor((fz - GZ0) / CELL);
      let inland = true;
      for (let dj = -3; dj <= 3 && inland; dj += 1) {
        for (let di = -3; di <= 3; di += 1) {
          if (!isLandCell(i + di, j + dj)) {
            inland = false;
            break;
          }
        }
      }
      if (!inland) {
        continue;
      }
      const g = groundAt(fx, fz);
      if (g < 4 || g > 135) {
        continue;
      }
      const slope = Math.abs(groundAt(fx + 2, fz) - groundAt(fx - 2, fz)) + Math.abs(groundAt(fx, fz + 2) - groundAt(fx, fz - 2));
      if (slope > 3.2) {
        continue;
      }
      if (fx > HAMLET.x0 - 30 && fx < HAMLET.x1 + 6 && fz > HAMLET.z0 - 28 && fz < 100) {
        continue;
      }
      if (roadD2(fx, fz) < 81) {
        continue;
      }
      /* Stands: dense in the valley and low down, thinning upward. */
      const want = noise(fx, fz, 45, 41) + 0.35 * (1 - g / 135) - 0.15;
      if (k > want) {
        continue;
      }
      const h = r.range(6.5, 13);
      fir(I, fx, g, fz, h, r);
      n += 1;
    }
  }
  return n;
}

function fir(I, x, g, z, h, r) {
  const R = h * r.range(0.26, 0.32);
  I.post('arBark', x, z, g - 0.2, g + 1.6, 0.22, { kind: 'tree', name: 'fir trunk' });
  I.cap('arFir', [x, g + 1.6, z], [x, g + h * 0.62, z], R * 0.42, { kind: 'canopy', name: 'fir', draw: false });
  const m = r.chance(0.5) ? 'arFir' : 'arFirDark';
  for (let k = 0; k < 3; k += 1) {
    const rk = R * (1 - 0.26 * k);
    const base = g + 1.1 + k * h * 0.27;
    const th = h * (k === 2 ? 0.5 : 0.42);
    I.cone(m, x, base, z, rk, th, 7);
    I.cone('arSnow', x, base + th * 0.42, z, rk * 0.66, th * 0.6, 7);
  }
}

export function capeLayout(I) {
  road(I);
  lighthouse(I);
  shrine(I);
  lookout(I);
  /* The radar stands on the highest corner of the land. */
  const G = grid();
  let best = -1;
  let at = [0, 0];
  for (let j = 0; j <= NZ; j += 1) {
    for (let i = 0; i <= NX; i += 1) {
      const h = G.h[j * (NX + 1) + i];
      if (h > best && isLandCell(i, j) && isLandCell(i - 1, j - 1) && isLandCell(i + 3, j + 3) && isLandCell(i - 3, j - 3)) {
        best = h;
        at = [GX0 + i * CELL, GZ0 + j * CELL];
      }
    }
  }
  radar(I, at[0], at[1]);
  const trees = firs(I);
  return { trees, radar: at, summit: best };
}
