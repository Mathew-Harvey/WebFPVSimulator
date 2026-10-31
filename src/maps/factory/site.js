/*
 * site.js: what makes Hamakaze Works a place people come to every morning
 * and not only a plant. The roads and their paint, the gate and the guard
 * house, the boundary wall, the safety board and the safety flag, the
 * bicycle shed and the smoking hut, the curve mirror at the corner, the rail
 * siding into the steel shop with its tank wagons, the old sawtooth
 * workshop on the quay, the laydown yard, and the set dressing: drums,
 * pallets under blue tarps, gas bottles in their cages, cones, hydrant
 * boxes, a forklift.
 *
 * Every word on a sign is the generic Japanese a works writes on its own
 * walls (安全第一, safety first; 立入禁止, no entry; 止まれ, stop), and the
 * works' name is our own. The office, the store, the parked cars, the
 * vending machines, the trees, the lamps and the utility poles are the
 * town's own assets, placed in the document (./yard.js); this file draws
 * what the kit has no asset for.
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

import { W, D, rng } from './frame.js';
import { HALL, QUAY } from './works.js';
import { RACK, HOUSE, BUND } from './plant.js';

/* The roads: the plant road from the gate to the quay, the north road
 * along the office front, the yard road south of the rack. */
export const ROADS = {
  plant: { x0: 140, x1: 150, y0: QUAY.road1, y1: D },
  north: { x0: 0, x1: W, y0: 180, y1: 188 },
  yard: { x0: 150, x1: 312, y0: 104, y1: 110 },
};

/* The gate, the guard house, the boundary wall. */
export const GATE = { x0: ROADS.plant.x0, x1: ROADS.plant.x1, y: 236 };
export const GUARD = { x0: 153, x1: 159, y0: 226, y1: 232, h: 3.0 };

/* The old sawtooth workshop between the quay and the steel shop. */
export const WORKSHOP = { x0: 22, x1: 58, y0: 43, y1: 53, eave: 5.5, tooth: 4, rise: 2.2 };

/* The tank wagons on the siding outside the steel shop's west door. */
export const WAGONS = [{ x0: 1.5, x1: 11 }, { x0: 12, x1: 21.5 }];

function roads(T) {
  for (const r of Object.values(ROADS)) {
    T.paint('asphalt', r.x0, r.y0, 0, r.x1, r.y1, 0.012);
  }
  T.wide(() => {
    T.dress(() => {
      /* The plant road's centre line and its edges, the north road's, and
       * the stop line and its kanji at the junction, where every pilot
       * coming from the gate crosses them. */
      const P = ROADS.plant;
      const cx = (P.x0 + P.x1) / 2;
      for (let y = P.y0 + 1; y < P.y1 - 2; y += 6) {
        if (y > ROADS.north.y0 - 3 && y < ROADS.north.y1 + 1) {
          continue;
        }
        T.paint('lineWhite', cx - 0.07, y, 0.012, cx + 0.07, y + 3, 0.016);
      }
      for (const x of [P.x0 + 0.3, P.x1 - 0.45]) {
        T.paint('lineWhite', x, P.y0, 0.012, x + 0.15, P.y1, 0.015);
      }
      const N = ROADS.north;
      for (let x = 1; x < W - 2; x += 6) {
        if (x > P.x0 - 3 && x < P.x1 + 1) {
          continue;
        }
        T.paint('lineWhite', x, (N.y0 + N.y1) / 2 - 0.07, 0.012, x + 3, (N.y0 + N.y1) / 2 + 0.07, 0.016);
      }
      T.paint('lineWhite', P.x0 + 0.5, N.y1 + 1.0, 0.012, cx, N.y1 + 1.35, 0.016);
      /* The yard road's edges. */
      const Y = ROADS.yard;
      T.paint('fkFloorLine', Y.x0, Y.y0 + 0.2, 0.012, Y.x1, Y.y0 + 0.35, 0.016);
      T.paint('fkFloorLine', Y.x0, Y.y1 - 0.35, 0.012, Y.x1, Y.y1 - 0.2, 0.016);
      /* Pedestrian crossings by the steel shop and the control house. */
      for (const y of [74, 96]) {
        for (let x = P.x0 + 0.6; x < P.x1 - 0.6; x += 0.9) {
          T.paint('lineWhite', x, y - 1.6, 0.012, x + 0.45, y + 1.6, 0.016);
        }
      }
    });
  });
  T.sign('tomare', (ROADS.plant.x0 + ROADS.plant.x1) / 2 - 2.4, ROADS.north.y1 + 3.2, 0.018, 2.6, 2.2, 'up');
  T.sign('speed', (ROADS.plant.x0 + ROADS.plant.x1) / 2 + 2.4, 200, 0.018, 2.2, 2.2, 'up');
  T.sign('speed', (ROADS.plant.x0 + ROADS.plant.x1) / 2 - 2.4, 60, 0.018, 2.2, 2.2, 'up');
}

function gate(T) {
  const G = GATE;
  /* The boundary wall, block on a footing, either side of the gate. */
  T.box('block', 0, G.y + 1.6, 0, G.x0 - 1.4, G.y + 1.9, 2.0, { name: 'boundary wall' });
  T.box('block', G.x1 + 1.4, G.y + 1.6, 0, W, G.y + 1.9, 2.0, { name: 'boundary wall' });
  /* The gate posts and the sliding gate run back along the wall. */
  for (const [x0, x1] of [[G.x0 - 1.4, G.x0], [G.x1, G.x1 + 1.4]]) {
    T.box('concreteMid', x0, G.y + 1.2, 0, x1, G.y + 2.3, 2.6, { name: 'gate post' });
  }
  T.box('fkSteel', G.x1 + 1.4, G.y + 1.0, 0, G.x1 + 11.4, G.y + 1.3, 1.8, { name: 'gate leaf' });
  T.dress(() => {
    for (let x = G.x1 + 1.6; x < G.x1 + 11.4; x += 0.25) {
      T.deco('fkSteelDark', x, G.y + 0.98, 0.1, x + 0.04, G.y + 1.32, 1.7);
    }
    T.wide(() => {
      for (let x = 0.2; x < W; x += 2.2) {
        if (x > G.x0 - 1.6 && x < G.x1 + 1.4) {
          continue;
        }
        T.paint('concreteWorn', x, G.y + 1.58, 0.05, x + 2.0, G.y + 1.6, 1.95);
      }
    });
  });
  T.sign('works', G.x0 - 0.7, G.y + 1.18, 1.6, 1.0, 1.9, 's', 0.02);
  T.sign('worksPlate', G.x1 + 0.7, G.y + 1.18, 1.7, 1.0, 1.4, 's', 0.02);
  /* The guard house, its window toward the road and the boom out over it. */
  const H = GUARD;
  T.box('wallWhite', H.x0, H.y0, 0, H.x1, H.y1, H.h, { name: 'guard house' });
  T.box('fkSteelDark', H.x0 - 0.4, H.y0 - 0.4, H.h, H.x1 + 0.4, H.y1 + 0.4, H.h + 0.25, { name: 'guard roof' });
  T.dress(() => {
    T.paint('glassDark', H.x0 - 0.03, H.y0 + 0.8, 1.0, H.x0, H.y1 - 0.8, 2.4);
    T.paint('glassDark', H.x0 + 0.8, H.y0 - 0.03, 1.0, H.x1 - 0.8, H.y0, 2.4);
    T.deco('fkWhite', H.x0 - 0.8, H.y1 - 0.5, 0, H.x0 - 0.2, H.y1, 1.1);
    T.cyl('fkRed', [H.x0 - 0.5, H.y1 - 0.25, 1.0], [H.x0 - 0.5 - 5.2, H.y1 - 0.25, 1.0 + 2.6], 0.07, 6);
    T.cyl('fkWhite', [H.x0 - 1.8, H.y1 - 0.25, 1.65], [H.x0 - 3.1, H.y1 - 0.25, 2.3], 0.075, 6);
    T.cyl('fkWhite', [H.x0 - 4.1, H.y1 - 0.25, 2.8], [H.x0 - 5.0, H.y1 - 0.25, 3.25], 0.075, 6);
    T.deco('acUnit', H.x1, H.y0 + 1, 0.2, H.x1 + 0.4, H.y0 + 2.0, 0.9);
  });
  T.sign('guard', (H.x0 + H.x1) / 2, H.y0 - 0.02, H.h - 0.35, 2.6, 0.5, 's');
}

function welfare(T) {
  /* The safety board at the corner, facing the gate, the first sign every
   * worker passes, on two legs high enough to fly under. */
  T.box('fkWhite', 152, 190.8, 2.6, 164, 191.1, 5.6, { name: 'safety board' });
  for (const x of [153.5, 162.5]) {
    T.post('fkSteel', x, 190.95, 0, 2.6, 0.1, { name: 'board leg', kind: 'pole' });
  }
  T.sign('safetyFirst', 158, 191.12, 4.1, 11.6, 2.8, 'n');
  T.sign('safetyFirst', 158, 190.78, 4.1, 11.6, 2.8, 's');
  /* The safety flag, the green cross every Japanese site flies. */
  T.post('fkSteel', 136.5, 192, 0, 9, 0.07, { name: 'flag pole', kind: 'pole' });
  T.sign('safetyFlag', 136.5 + 1.2, 192, 8.0, 2.2, 1.5, 'n');
  T.sign('safetyFlag', 136.5 + 1.2, 192, 8.0, 2.2, 1.5, 's');
  /* The bicycle shed: a roof on posts and a row of bikes. */
  T.box('sheetBlue', 160, 195, 2.4, 182, 199.5, 2.55, { name: 'bike shed roof' });
  for (const x of [160.3, 167.6, 174.9, 181.7]) {
    T.post('fkSteel', x, 199.2, 0, 2.4, 0.08, { name: 'shed post', kind: 'pole' });
  }
  T.dress(() => {
    const R = rng(11);
    for (let x = 161; x < 181; x += 0.75) {
      const m = R.pick(['fkSteelDark', 'fkRed', 'fkWaterPipe', 'fkWhite', 'fkCross']);
      T.torus('fkSteelDark', x, 196.4, 0.35, 0.33, 0.03, 1, 0, 3, 10);
      T.torus('fkSteelDark', x, 197.6, 0.35, 0.33, 0.03, 1, 0, 3, 10);
      T.cyl(m, [x, 196.4, 0.35], [x, 197.3, 0.8], 0.03, 4);
      T.cyl(m, [x, 197.6, 0.35], [x, 197.0, 0.85], 0.03, 4);
      T.cyl('fkSteelDark', [x - 0.2, 197.0, 0.95], [x + 0.2, 197.0, 0.95], 0.02, 3);
    }
  });
  /* The smoking hut, glass on a frame, and its can. */
  T.box('glassBlue', 186, 195, 0, 190, 198.5, 2.3, { name: 'smoking hut', kind: 'wall' });
  T.box('fkSteelDark', 185.8, 194.8, 2.3, 190.2, 198.7, 2.45, { name: 'smoking hut roof' });
  T.dress(() => {
    T.cyl('fkRed', [188, 196.7, 0], [188, 196.7, 0.8], 0.22, 8);
  });
  T.sign('smoking', 188, 194.97, 1.9, 1.4, 0.4, 's');
  /* The curve mirror at the corner, orange on its post. */
  T.post('fkOil', 151.4, 189.6, 0, 2.9, 0.05, { name: 'mirror post', kind: 'pole' });
  T.sign('mirror', 151.4, 189.6 - 0.12, 3.1, 0.9, 0.9, 's');
  T.sign('mirror', 151.4 + 0.1, 189.6, 3.1, 0.9, 0.9, 'w');
}

/* A tank wagon: frame, bogies, the tank and its dome and walkway. */
function tankWagon(T, x0, x1, y) {
  const xm = (x0 + x1) / 2;
  T.box('fkSteelDark', x0 + 1, y - 0.9, 0, x0 + 3, y + 0.9, 0.8, { name: 'bogie' });
  T.box('fkSteelDark', x1 - 3, y - 0.9, 0, x1 - 1, y + 0.9, 0.8, { name: 'bogie' });
  T.box('fkSteelDark', x0, y - 1.2, 0.8, x1, y + 1.2, 1.2, { name: 'wagon frame' });
  T.cap('fkSoot', [x0 + 1.4, y, 2.5], [x1 - 1.4, y, 2.5], 1.25, { name: 'wagon tank', kind: 'wall', look: 'capsule', seg: 14 });
  T.dress(() => {
    T.cyl('fkSoot', [xm, y, 3.4], [xm, y, 4.0], 0.5, 10);
    T.deco('fkRail', x0 + 0.4, y - 1.25, 1.2, x0 + 0.5, y + 1.25, 2.2);
    for (const s of [-1, 1]) {
      T.cyl('fkSteelDark', [x0 + 1.4, y + s * 1.0, 1.2], [x1 - 1.4, y + s * 1.0, 1.2], 0.05, 4);
    }
    T.paint('fkGas', x0 + 3, y - 1.26, 2.2, x1 - 3, y + 1.26, 2.45);
  });
}

function siding(T) {
  const y = (HALL.doorY0 + HALL.doorY1) / 2;
  T.wide(() => {
    T.dress(() => {
      for (let x = 0.3; x < HALL.x0; x += 0.7) {
        T.paint('fkPallet', x, y - 1.2, 0.006, x + 0.22, y + 1.2, 0.03);
      }
    });
  });
  for (const w of WAGONS) {
    tankWagon(T, w.x0, w.x1, y);
  }
  /* The buffer stop at the plot's edge. */
  T.box('fkRed', 0, y - 1.3, 0, 0.8, y + 1.3, 1.2, { name: 'buffer stop' });
}

/* The sawtooth workshop: its teeth face north, as they always do, so the
 * glass takes the even light. Its east and west ends are open: a shed you
 * fly straight through under the teeth. */
function workshop(T) {
  const S = WORKSHOP;
  const e = S.eave;
  T.box('block', S.x0, S.y0, 0, S.x1, S.y0 + 0.3, e, { name: 'workshop wall' });
  T.box('block', S.x0, S.y1 - 0.3, 0, S.x1, S.y1, e, { name: 'workshop wall' });
  /* The ends: block to the eaves either side of a wide opening. */
  for (const [x0, x1] of [[S.x0, S.x0 + 0.3], [S.x1 - 0.3, S.x1]]) {
    T.box('block', x0, S.y0 + 0.3, 0, x1, S.y0 + 2.5, e, { name: 'workshop end' });
    T.box('block', x0, S.y1 - 2.5, 0, x1, S.y1 - 0.3, e, { name: 'workshop end' });
    T.box('block', x0, S.y0 + 2.5, 4.4, x1, S.y1 - 2.5, e, { name: 'workshop end' });
  }
  /* The teeth: each rises south to north and drops in glass. */
  for (let y = S.y0; y < S.y1 - 1e-6; y += S.tooth / 2) {
    const y1 = Math.min(S.y1, y + S.tooth / 2);
    const k = ((y - S.y0) % S.tooth) / S.tooth;
    const h0 = e + S.rise * k;
    const h1 = e + S.rise * Math.min(1, k + 0.5);
    T.hidden(S.x0, y, e, S.x1, y1, Math.max(h0, h1) - 0.6, 'wall', 'workshop roof');
  }
  for (let y = S.y0; y < S.y1 - 1e-6; y += S.tooth) {
    const y1 = Math.min(S.y1, y + S.tooth);
    T.prism('sheet', 'x', [[y, e], [y1, e + S.rise], [y1, e + S.rise - 0.2], [y, e - 0.2]], S.x0 - 0.3, S.x1 + 0.3);
    T.prism('glassDark', 'x', [[y1 - 0.06, e], [y1, e], [y1, e + S.rise - 0.15], [y1 - 0.06, e + S.rise - 0.15]], S.x0, S.x1);
  }
  T.wide(() => {
    T.dress(() => {
      for (let x = S.x0 + 1; x < S.x1 - 1; x += 3) {
        T.paint('glassDark', x, S.y0 - 0.03, 2.2, x + 1.8, S.y0, 3.6);
      }
    });
  });
  /* Inside: a lathe, a press, a workbench, solid; slabs and billets
   * stacked outside along its south wall. */
  T.box('fkWaterPipe', 30, S.y0 + 0.3, 0, 34, S.y0 + 1.5, 1.4, { name: 'lathe' });
  T.box('fkCross', 44, S.y1 - 2.3, 0, 46.5, S.y1 - 0.3, 3.0, { name: 'press' });
  T.box('fkPallet', 50, S.y0 + 0.9, 0.85, 56, S.y0 + 1.8, 0.95, { name: 'bench' });
  for (let k = 0; k < 4; k += 1) {
    T.box('fkRust', 24 + k * 7, 40.0, 0, 29 + k * 7, 41.4, 0.5 + (k % 2) * 0.5, { name: 'slab stack' });
  }
  T.sign('workshop', (S.x0 + S.x1) / 2, S.y0 - 0.04, 4.4, 7.2, 1.0, 's');
}

/* The laydown yard east of the plant road: pipe spools, beams, a site
 * cabin up its own stair. */
function laydown(T) {
  for (let k = 0; k < 4; k += 1) {
    const y = 128 + k * 5;
    T.box('fkPallet', 154, y, 0, 166, y + 0.3, 0.3, { name: 'dunnage' });
    T.cap(k % 2 ? 'fkSteel' : 'fkRust', [154.5, y + 1.0, 0.95], [165.5, y + 1.0, 0.95], 0.65, { name: 'pipe spool', kind: 'wall', seg: 12 });
    T.cap(k % 2 ? 'fkRust' : 'fkSteel', [154.5, y + 2.6, 0.95], [165.5, y + 2.6, 0.95], 0.65, { name: 'pipe spool', kind: 'wall', seg: 12 });
  }
  /* Two cabins stacked, the upper reached by a stair, the site office of
   * whatever is always being built. */
  T.box('fkPanel', 168, 150, 0, 180, 152.5, 2.7, { name: 'site cabin' });
  T.box('fkPanel', 168, 150, 2.7, 180, 152.5, 5.4, { name: 'site cabin' });
  T.dress(() => {
    T.wide(() => {
      for (let x = 169; x < 179; x += 2.5) {
        for (const h of [1.0, 3.7]) {
          T.paint('glassDark', x, 149.97, h, x + 1.2, 150, h + 0.9);
        }
      }
    });
    T.prism('grating', 'y', [[166.4, 0.1], [168, 2.7], [168, 2.5], [166.4, -0.1]], 152.6, 153.6);
    T.deco('fkRail', 166.4, 153.6, 1.0, 168, 153.65, 1.05);
  });
  T.sign('siteOffice', 174, 149.98, 4.8, 3.6, 0.6, 's');
}

/* The set dressing: drums, pallets and tarps, bottles, cones, hydrants, a
 * forklift, the clutter a works collects along every wall. None of it is
 * solid and Low draws none of it. */
function clutter(T) {
  const R = rng(2026);
  const drums = (x, y, n) => {
    for (let i = 0; i < n; i += 1) {
      const dx = (i % 3) * 0.65;
      const dy = Math.floor(i / 3) * 0.65;
      T.cyl(R.pick(['fkTarp', 'fkRed', 'fkOil', 'fkGas']), [x + dx, y + dy, 0], [x + dx, y + dy, 0.9], 0.29, 10);
      T.torus('fkSteelDark', x + dx, y + dy, 0.3, 0.3, 0.02, 0, 0, 3, 10);
    }
  };
  const pallets = (x, y, tarp) => {
    T.deco('fkPallet', x, y, 0, x + 1.2, y + 1.0, 0.14);
    T.deco(tarp ? 'fkTarp' : 'fkPallet', x + 0.05, y + 0.05, 0.14, x + 1.15, y + 0.95, 1.0 + (tarp ? 0.1 : 0));
  };
  const bottles = (x, y) => {
    T.deco('fkSteel', x, y, 0, x + 1.6, y + 0.6, 0.05);
    for (let i = 0; i < 6; i += 1) {
      T.cyl(i % 3 === 0 ? 'fkGas' : 'fkCross', [x + 0.15 + i * 0.25, y + 0.3, 0.05], [x + 0.15 + i * 0.25, y + 0.3, 1.45], 0.1, 6);
    }
    T.deco('fkSteel', x, y + 0.58, 1.0, x + 1.6, y + 0.62, 1.05);
  };
  const cone = (x, y) => {
    T.cone('fkOil', x, y, 0, 0.18, 0.7, 8);
    T.cyl('fkWhite', [x, y, 0.3], [x, y, 0.42], 0.11, 8);
  };
  const hydrant = (x, y, face) => {
    T.deco('fkRed', x - 0.35, y - 0.12, 0.3, x + 0.35, y + 0.12, 1.5);
    T.sign('hydrant', x, y + (face === 'n' ? 0.13 : -0.13), 1.05, 0.6, 0.6, face, 0.01);
  };
  T.dress(() => {
    /* Along the steel shop's south wall, facing the quay. */
    drums(30, HALL.y0 - 3.0, 6);
    drums(98, HALL.y0 - 3.4, 5);
    pallets(62, HALL.y0 - 2.2, true);
    pallets(63.6, HALL.y0 - 2.2, false);
    pallets(65.2, HALL.y0 - 2.2, true);
    bottles(80, HALL.y0 - 1.6);
    /* Along its north wall, by the stack. */
    pallets(40, HALL.y1 + 1.2, true);
    pallets(41.6, HALL.y1 + 1.2, true);
    drums(54, HALL.y1 + 1.4, 9);
    bottles(70, HALL.y1 + 0.9);
    /* At the control house and the tower. */
    drums(HOUSE.x0 - 4, HOUSE.y1 - 3, 4);
    pallets(HOUSE.x1 + 2, HOUSE.y0 + 1, true);
    bottles(196, 68);
    /* On the quay. */
    for (let x = 130; x < 165; x += 2.6) {
      cone(x, QUAY.y1 - 1.2);
    }
    pallets(120, QUAY.y1 - 3, true);
    pallets(121.6, QUAY.y1 - 3, true);
    drums(188, QUAY.y1 - 3, 6);
    /* Under the rack, where nobody is meant to leave anything. */
    drums(100, RACK.y0 + 2, 3);
    pallets(250, RACK.y0 + 3, false);
    /* By the tank farm. */
    for (let x = BUND.x0 + 2; x < BUND.x0 + 14; x += 2.4) {
      cone(x, BUND.y0 - 2);
    }
    /* A forklift parked by the shop's east door, forks down. */
    const fx = HALL.x1 + 4;
    const fy = HALL.doorY1 + 4;
    T.deco('fkYellow', fx, fy, 0.25, fx + 2.2, fy + 1.1, 1.3);
    T.deco('fkSteelDark', fx + 0.2, fy + 0.05, 1.3, fx + 1.2, fy + 1.05, 2.2);
    T.deco('fkSteelDark', fx - 1.0, fy + 0.2, 0.02, fx, fy + 0.35, 0.1);
    T.deco('fkSteelDark', fx - 1.0, fy + 0.75, 0.02, fx, fy + 0.9, 0.1);
    T.deco('fkSteelDark', fx - 0.05, fy + 0.15, 0, fx + 0.05, fy + 0.95, 2.6);
    for (const [dx, dy] of [[0.4, 0], [1.8, 0], [0.4, 1.1], [1.8, 1.1]]) {
      T.cyl('fkFender', [fx + dx, fy + dy - 0.1, 0.28], [fx + dx, fy + dy + 0.1, 0.28], 0.28, 8);
    }
  });
  T.dress(() => {
    hydrant(HALL.x0 + 6, HALL.y0 - 0.5, 's');
    hydrant(HALL.x1 - 6, HALL.y1 + 0.5, 'n');
    hydrant(ROADS.plant.x1 + 1.2, 160, 's');
    hydrant(HOUSE.x0 + 2, HOUSE.y0 - 0.5, 's');
  });
}

/* Everything in this file. */
export function site(T) {
  roads(T);
  gate(T);
  welfare(T);
  siding(T);
  workshop(T);
  laydown(T);
  clutter(T);
}
