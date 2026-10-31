/*
 * quay.js: Kamome Wharf's apron and its edge. The quay wall with its tide
 * stain, its black fenders and its bollards; the crane rails; the three
 * quay cranes; the hatch lids lifted off the ship; the plaza at the west
 * end; and the paint a berth carries.
 *
 * A QUAY CRANE, as the real ones are built (the sizes are in ./site.js): four
 * legs on bogies on two rails 30.5 m apart, tied along the rail at the
 * portal 14 m up, so a tractor and a 40 ft box pass between them, and tied
 * again up the side at 30 m. On the legs' tops, 45 m up, the two box
 * girders run from the backreach over the machinery house to the hinge,
 * and the boom carries them on out over the ship. The A frame stands over
 * the rails, and its stays hold the boom and the backreach. A trolley runs
 * on the girders with the driver's cab hung under it and the spreader on
 * its ropes. One crane has its boom raised for the night, the way a crane
 * with no ship under it is left.
 *
 * Every member that is not on the axes (the A frame, the stays, the raised
 * boom) is a capsule, drawn and solid from the same two points. The raised
 * boom's angle is a sine and a cosine written as numbers, never computed,
 * because the solids reach the physics.
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

import { W, QUAY_Y } from './frame.js';
import {
  CRANES, CR, RAIL_L, RAIL_W, FENDER, HATCH_STACKS, HATCH, BOX, SHIP,
} from './site.js';
import { tractor } from './yard.js';

/* The raised boom's 75 degrees, as numbers (cos, sin). */
const RAISE_C = 0.25881904510252074;
const RAISE_S = 0.9659258262890683;

/* Where a crane's boom ends: down, along the girders' line; raised, up
 * round the hinge. { y, h } of the tip's girder axis. */
export function boomTip(c) {
  const mid = CR.girder + CR.girderD / 2;
  const L = CR.tip - CR.hinge;
  return c.raised ? { y: CR.hinge + L * RAISE_C, h: mid + L * RAISE_S } : { y: CR.tip, h: mid };
}

/* ---- the quay's edge ---- */

const FAR_W = -300;
const FAR_E = W + 300;

function edge(T) {
  /* The wall, its face to the water, its solid deep under the harbour, and
   * the kerb along its top. The face runs on into the fog both ways, so
   * the harbour's shore does not stop at the plot. */
  T.box('dkQuay', FAR_W, QUAY_Y - 1.5, -7, FAR_E, QUAY_Y, -0.01, { solid: false, cast: false });
  T.hidden(FAR_W, QUAY_Y - 1.5, -9, FAR_E, QUAY_Y, 0, 'wall', 'quay wall');
  T.paint('dkTide', FAR_W, QUAY_Y, -2.9, FAR_E, QUAY_Y + 0.02, -1.9);
  T.box('dkEdge', -2, QUAY_Y - 0.55, 0, W + 2, QUAY_Y, 0.22, { name: 'quay kerb', cast: false });
  T.wide(() => T.dress(() => {
    for (let x = -1; x < W + 1; x += 2.4) {
      T.paint('dkIron', x, QUAY_Y - 0.56, 0.0, x + 1.2, QUAY_Y + 0.005, 0.225);
    }
  }));
  /* The fenders, each a black rubber block bolted to the face. */
  for (let x = 7; x < W; x += FENDER.every) {
    T.box('dkFender', x - FENDER.w / 2, QUAY_Y, FENDER.h0, x + FENDER.w / 2, QUAY_Y + FENDER.out, FENDER.h1, { name: 'fender' });
    T.dress(() => {
      T.deco('dkBollard', x - 0.9, QUAY_Y, FENDER.h1 - 0.2, x + 0.9, QUAY_Y + 0.2, FENDER.h1 + 0.1);
      T.deco('dkBollard', x - 0.9, QUAY_Y, FENDER.h0 - 0.1, x + 0.9, QUAY_Y + 0.2, FENDER.h0 + 0.2);
    });
  }
  /* The bollards, a bitt every twenty metres. */
  for (let x = 12; x < W; x += 20) {
    T.post('dkBollard', x, QUAY_Y - 1.4, 0, 0.8, 0.34, { name: 'bollard', seg: 10 });
    T.disc('dkBollard', x, QUAY_Y - 1.4, 0.48, 0.72, 0.86, 12);
    T.dress(() => T.disc('concreteMid', x, QUAY_Y - 1.4, 0.75, 0, 0.08, 12));
  }
  /* The rails and the paint round the berth: the rails' steel in a
   * darker channel, the berth's name and the yellow walk line. */
  T.wide(() => T.dress(() => {
    for (const y of [RAIL_L, RAIL_W]) {
      T.paint('dkTide', 0, y - 0.4, 0, W, y + 0.4, 0.012);
      T.paint('dkRail', 0, y - 0.09, 0.012, W, y + 0.09, 0.04);
    }
    for (let x = 2; x < W; x += 5) {
      T.paint('dkLineYellow', x, QUAY_Y - 3.1, 0, x + 3, QUAY_Y - 2.9, 0.02);
    }
  }));
  T.sign('berth', 160, QUAY_Y - 6.5, 0.03, 9, 4.5, 'up', 0);
  T.sign('berth', 330, QUAY_Y - 6.5, 0.03, 9, 4.5, 'up', 0);
}

/* ---- a quay crane ---- */

function crane(T, c) {
  const { cx } = c;
  const g0 = CR.girder;
  const g1 = g0 + CR.girderD;
  const lx = CR.legX;
  const name = `crane ${c.n}`;
  const rails = [RAIL_L, RAIL_W];
  for (const y of rails) {
    for (const s of [-1, 1]) {
      const x = cx + s * lx;
      /* The bogie under the leg, along the rail, and its wheels. */
      T.box('dkCraneDeep', x - CR.bogie, y - 0.9, 0.35, x + CR.bogie, y + 0.9, CR.bogieH, { name: `${name} bogie` });
      T.dress(() => {
        for (let k = -2; k <= 2; k += 1) {
          T.cyl('dkTyre', [x + k * 1.2, y - 0.95, 0.38], [x + k * 1.2, y + 0.95, 0.38], 0.36, 8);
        }
        for (const e of [-1, 1]) {
          T.deco('mastRed', x + e * CR.bogie - 0.03, y - 0.92, 0.5, x + e * CR.bogie + 0.03, y + 0.92, CR.bogieH - 0.1);
        }
      });
      /* The leg, from the bogie to the girders' cross beam. */
      T.box('dkCrane', x - CR.legW / 2, y - CR.legD / 2, CR.bogieH, x + CR.legW / 2, y + CR.legD / 2, g0 - 2, { name: `${name} leg` });
    }
    /* The portal tie along the rail, and the cross beam on the legs' tops
     * that the girders sit on. */
    T.box('dkCrane', cx - lx - 0.8, y - 1.0, CR.portal, cx + lx + 0.8, y + 1.0, CR.portal + CR.tie, { name: `${name} portal tie` });
    T.box('dkCraneDeep', cx - lx - 0.8, y - 1.0, g0 - 2, cx + lx + 0.8, y + 1.0, g0, { name: `${name} cross beam` });
  }
  /* Up each side: the portal beam and the mid tie between the rails. */
  for (const s of [-1, 1]) {
    const x = cx + s * lx;
    T.box('dkCrane', x - 0.8, RAIL_L + 1.0, CR.portal, x + 0.8, RAIL_W - 1.0, CR.portal + CR.tie, { name: `${name} portal beam` });
    T.box('dkCrane', x - 0.6, RAIL_L + 1.0, CR.mid, x + 0.6, RAIL_W - 1.0, CR.mid + CR.midT, { name: `${name} mid tie` });
  }
  /* The girders, the backreach and the boom. */
  const tip = boomTip(c);
  const hingeEnd = c.raised ? CR.hinge : CR.tip;
  for (const s of [-1, 1]) {
    const x = cx + s * CR.girderX;
    T.box('dkCrane', x - CR.girderW / 2, CR.back, g0, x + CR.girderW / 2, hingeEnd, g1, { name: `${name} girder` });
    if (c.raised) {
      T.cap('dkCrane', [x, CR.hinge, (g0 + g1) / 2], [x, tip.y, tip.h], 0.85, { name: `${name} boom`, seg: 4 });
    }
  }
  /* The ends of the girders: the backreach's, and the boom tip's. */
  T.box('dkCraneDeep', cx - CR.girderX - 0.7, CR.back, g0, cx + CR.girderX + 0.7, CR.back + 1.2, g1, { name: `${name} back end` });
  if (c.raised) {
    T.cap('dkCraneDeep', [cx - CR.girderX, tip.y, tip.h], [cx + CR.girderX, tip.y, tip.h], 0.7, { name: `${name} boom tip`, seg: 6 });
    T.ball('lampRed', cx, tip.y, tip.h + 1.0, 0.2);
  } else {
    T.box('dkCraneDeep', cx - CR.girderX - 0.7, CR.tip - 1.2, g0, cx + CR.girderX + 0.7, CR.tip, g1, { name: `${name} boom tip` });
    T.ball('lampRed', cx - CR.girderX, CR.tip - 0.6, g1 + 0.35, 0.18);
    T.ball('lampRed', cx + CR.girderX, CR.tip - 0.6, g1 + 0.35, 0.18);
    /* The lamps under the boom that light the ship's deck. */
    for (let y = 252; y < CR.tip - 2; y += 12) {
      for (const s of [-1, 1]) {
        T.box('lampGlow', cx + s * CR.girderX - 0.3, y - 0.35, g0 - 0.3, cx + s * CR.girderX + 0.3, y + 0.35, g0, { solid: false, cast: false });
      }
    }
  }
  /* The A frame: on each side, a leg up from over each rail to the apex,
   * the apex beam across, striped for the aircraft; the stays. */
  const apex = CR.apex;
  for (const s of [-1, 1]) {
    const ax = cx + s * CR.apexX;
    T.cap('dkCrane', [cx + s * (lx - 0.6), RAIL_L, g1], [ax, CR.apexY, apex], 0.6, { name: `${name} a frame`, seg: 6 });
    T.cap('dkCrane', [cx + s * (lx - 0.6), RAIL_W, g1], [ax, CR.apexY, apex], 0.6, { name: `${name} a frame`, seg: 6 });
    /* The forestays to the boom, the backstay to the backreach. */
    T.cap('metalDark', [ax, CR.apexY + 0.6, apex + 0.6], [cx + s * CR.girderX, tip.y - 1, tip.h + 0.6], 0.14, { name: `${name} stay`, seg: 4 });
    if (!c.raised) {
      T.cap('metalDark', [ax, CR.apexY + 0.6, apex + 0.6], [cx + s * CR.girderX, 274, g1], 0.14, { name: `${name} stay`, seg: 4 });
    }
    T.cap('metalDark', [ax, CR.apexY - 0.6, apex + 0.6], [cx + s * CR.girderX, CR.back + 1.5, g1], 0.14, { name: `${name} stay`, seg: 4 });
  }
  T.box('mastRed', cx - CR.apexX - 0.8, CR.apexY - 1.0, apex - 0.6, cx + CR.apexX + 0.8, CR.apexY + 1.0, apex + 1.6, { name: `${name} apex` });
  T.dress(() => T.wide(() => {
    for (let i = -3; i <= 3; i += 2) {
      T.deco('mastWhite', cx + i * 1.1 - 0.55, CR.apexY - 1.03, apex - 0.6, cx + i * 1.1 + 0.55, CR.apexY + 1.03, apex + 1.6);
    }
  }));
  T.ball('lampRed', cx - CR.apexX - 0.6, CR.apexY, apex + 1.9, 0.2);
  T.ball('lampRed', cx + CR.apexX + 0.6, CR.apexY, apex + 1.9, 0.2);
  /* The machinery house on the backreach, its roof, its louvres and its
   * number. */
  const [h0y, h1y] = CR.house;
  T.box('dkCraneCream', cx - 7, h0y, g1, cx + 7, h1y, g1 + CR.houseH, { name: `${name} machinery house` });
  T.box('dkCraneDeep', cx - 7.3, h0y - 0.3, g1 + CR.houseH, cx + 7.3, h1y + 0.3, g1 + CR.houseH + 0.4, { name: `${name} house roof` });
  T.dress(() => T.wide(() => {
    for (let y = h0y + 1; y < h1y - 1; y += 1.6) {
      T.paint('metalDark', cx - 7.03, y, g1 + 3.4, cx - 7.0, y + 1.0, g1 + 4.6);
      T.paint('metalDark', cx + 7.0, y, g1 + 3.4, cx + 7.03, y + 1.0, g1 + 4.6);
    }
    T.paint('dkCraneDeep', cx - 7.03, h1y - 3.2, g1 + 0.2, cx - 7.0, h1y - 2.0, g1 + 2.4);
  }));
  for (const [face, x] of [['w', cx - 7], ['e', cx + 7]]) {
    T.sign(`crane${c.n}`, x, (h0y + h1y) / 2 - 2.5, g1 + 3.0, 5.0, 2.8, face);
  }
  T.sign(`crane${c.n}`, cx, h0y, g1 + 3.0, 5.0, 2.8, 's');
  /* The trolley, its cab, the spreader, and a box on it if it is loading. */
  const ty = c.trolley;
  T.box('dkCraneCream', cx - CR.girderX - 0.7, ty - 2.5, g1, cx + CR.girderX + 0.7, ty + 2.5, g1 + 2.2, { name: `${name} trolley` });
  T.box('dkCraneCream', cx + 1.0, ty - 1.4, g0 - 3.6, cx + 4.0, ty + 1.4, g0, { name: `${name} cab` });
  T.paint('glassDark', cx + 0.98, ty - 1.2, g0 - 3.3, cx + 4.02, ty - 1.38, g0 - 1.0);
  T.paint('glassDark', cx + 0.98, ty + 1.38, g0 - 3.3, cx + 4.02, ty + 1.2, g0 - 1.0);
  T.paint('glassLit', cx + 3.98, ty - 1.2, g0 - 3.3, cx + 4.02, ty + 1.2, g0 - 1.2);
  const sp = c.load ? 21.0 : g0 - 6;
  T.box('dkGantry', cx - 6.1, ty - 1.25, sp, cx + 6.1, ty + 1.25, sp + 0.6, { name: `${name} spreader` });
  for (const x of [cx - 4.8, cx + 4.8]) {
    for (const y of [ty - 0.9, ty + 0.9]) {
      T.cyl('rope', [x, y, sp + 0.6], [x, y, g1], 0.035, 3, null, true);
    }
  }
  if (c.load) {
    T.box(c.load === true ? 'dkBoxMustard' : c.load, cx - BOX.l40 / 2, ty - BOX.w / 2, sp - BOX.h, cx + BOX.l40 / 2, ty + BOX.w / 2, sp, { name: 'container' });
    T.dress(() => {
      T.flute('dkBoxMustard', cx - 5.9, ty - BOX.w / 2, cx + 5.9, ty - BOX.w / 2, sp - BOX.h + 0.18, sp - 0.14, 's', 14);
      T.flute('dkBoxMustard', cx - 5.9, ty + BOX.w / 2, cx + 5.9, ty + BOX.w / 2, sp - BOX.h + 0.18, sp - 0.14, 'n', 14);
    });
    T.sign('line2', cx, ty - BOX.w / 2, sp - BOX.h / 2, 5.6, 1.1, 's', 0.09);
    /* The tractor waiting under it. */
    tractor(T, cx + 6.3, ty, 1, 'dkTractorB', null);
  }
  /* The dressing that makes it a machine: the stair cage up the landside
   * west leg, a landing at each tie, the walkways and hand rails along the
   * girders, the festoon of cable trolleys under the backreach, the cable
   * reel by the landside east leg, the girders' stiffeners. */
  T.dress(() => {
    const sx = cx - lx - 0.8;
    for (const h of [CR.portal + CR.tie, CR.mid + CR.midT, g0]) {
      T.deco('grating', sx - 1.6, RAIL_L - 1.2, h - 0.12, sx, RAIL_L + 1.2, h);
    }
    for (let h = 2; h < g0 - 2; h += 0.5) {
      T.cyl('metalDark', [sx - 0.05, RAIL_L - 0.25, h], [sx - 0.05, RAIL_L + 0.25, h], 0.015, 3);
    }
    T.cyl('metalDark', [sx - 0.05, RAIL_L - 0.25, 1.5], [sx - 0.05, RAIL_L - 0.25, g0 - 2], 0.03, 3);
    T.cyl('metalDark', [sx - 0.05, RAIL_L + 0.25, 1.5], [sx - 0.05, RAIL_L + 0.25, g0 - 2], 0.03, 3);
    for (let i = 0; i < 8; i += 1) {
      const y = CR.back + 4 + i * 2.2;
      T.box('metalDark', cx - 0.6, y - 0.2, g0 - 1.2 - (i % 2) * 0.4, cx + 0.6, y + 0.2, g0, { solid: false });
    }
    T.cyl('metalDark', [cx, CR.back + 2, g0 - 0.3], [cx, hingeEnd - 2, g0 - 0.3], 0.05, 3);
    for (const s of [-1, 1]) {
      const x = cx + s * CR.girderX;
      for (const out of [-1, 1]) {
        T.cyl('mastWhite', [x + out * 1.1, CR.back, g1 + 1.0], [x + out * 1.1, hingeEnd, g1 + 1.0], 0.025, 3);
      }
    }
  });
  T.wide(() => T.dress(() => {
    for (const s of [-1, 1]) {
      const x = cx + s * CR.girderX;
      for (let y = CR.back + 3; y < hingeEnd - 1; y += 4) {
        T.paint('dkCraneDeep', x - CR.girderW / 2 - 0.03, y, g0 + 0.1, x - CR.girderW / 2, y + 0.18, g1 - 0.1);
        T.paint('dkCraneDeep', x + CR.girderW / 2, y, g0 + 0.1, x + CR.girderW / 2 + 0.03, y + 0.18, g1 - 0.1);
      }
    }
    /* The striped hazard skirts round each leg's foot. */
    for (const y of rails) {
      for (const s of [-1, 1]) {
        const x = cx + s * lx;
        for (let k = 0; k < 4; k += 1) {
          T.paint(k % 2 ? 'dkLineYellow' : 'dkIron', x - CR.bogie - 1.2 + k * 0.3, y - 1.6, 0, x - CR.bogie - 1.05 + k * 0.3, y + 1.6, 0.02);
          T.paint(k % 2 ? 'dkLineYellow' : 'dkIron', x + CR.bogie + 0.15 + k * 0.3, y - 1.6, 0, x + CR.bogie + 0.3 + k * 0.3, y + 1.6, 0.02);
        }
      }
    }
  }));
  /* The cable reel, drawn round and solid as the box inside it. */
  const rx = cx + lx;
  const ry = RAIL_L - 4.2;
  T.cyl('dkCraneDeep', [rx, ry - 0.45, 2.6], [rx, ry + 0.45, 2.6], 1.9, 16);
  T.hidden(rx - 1.3, ry - 0.45, 1.3, rx + 1.3, ry + 0.45, 3.9, 'wall', `${name} cable reel`);
  T.box('dkCraneDeep', rx - 0.5, ry - 0.5, 0, rx + 0.5, ry + 0.5, 1.3, { name: `${name} reel stand` });
  T.dress(() => T.cyl('dkTyre', [rx, ry - 0.5, 2.6], [rx, ry + 0.5, 2.6], 1.1, 12));
}

/* ---- the hatch lids ---- */

function hatchStack(T, st) {
  const { w, d, t } = HATCH;
  for (let k = 0; k < st.n; k += 1) {
    const h0 = k * (t + 0.08);
    T.box('dkHatch', st.x - w / 2 + (k % 2) * 0.12, st.y - d / 2, h0, st.x + w / 2 + (k % 2) * 0.12, st.y + d / 2, h0 + t, { solid: false });
    T.dress(() => T.wide(() => {
      for (const y of [st.y - d / 2, st.y + d / 2]) {
        const o = y < st.y ? -0.02 : 0.02;
        T.paint('dkLineYellow', st.x - w / 2 + 0.3, Math.min(y, y + o), h0 + 0.3, st.x - w / 2 + 1.0, Math.max(y, y + o), h0 + 0.6);
        T.paint('dkLineYellow', st.x + w / 2 - 1.0, Math.min(y, y + o), h0 + 0.3, st.x + w / 2 - 0.3, Math.max(y, y + o), h0 + 0.6);
      }
    }));
  }
  const top = st.n * (t + 0.08) - 0.08;
  T.hidden(st.x - w / 2, st.y - d / 2, 0, st.x + w / 2, st.y + d / 2, top, 'wall', 'hatch lids');
  T.dress(() => {
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      T.box('metalDark', st.x + dx * (w / 2 - 1.2) - 0.2, st.y + dy * (d / 2 - 1.0) - 0.2, top, st.x + dx * (w / 2 - 1.2) + 0.2, st.y + dy * (d / 2 - 1.0) + 0.2, top + 0.35, { solid: false });
    }
  });
}

/* ---- the quay ---- */

export function quay(T) {
  edge(T);
  for (const c of CRANES) {
    crane(T, c);
  }
  for (const st of HATCH_STACKS) {
    hatchStack(T, st);
  }
  /* The lashing gear cages and a stevedores' hut on the apron, by the
   * crane rails, out of every line the cranes are flown on. */
  T.box('containerOrange', 150, 236.0, 0, 150 + BOX.l20, 236.0 + BOX.w, BOX.h, { name: 'gear box' });
  T.dress(() => {
    T.flute('containerOrange', 150.2, 236.0, 150 + BOX.l20 - 0.2, 236.0, 0.18, BOX.h - 0.14, 's', 7);
    T.flute('containerOrange', 150.2, 236.0 + BOX.w, 150 + BOX.l20 - 0.2, 236.0 + BOX.w, 0.18, BOX.h - 0.14, 'n', 7);
  });
  T.sign('safety', 150 + BOX.l20 / 2, 236.0, 1.4, 4.4, 1.3, 's', 0.05);
  for (const [x, y] of [[246.4, 237], [251, 237], [255.6, 237]]) {
    T.box('grating', x - 1.5, y - 1.0, 0, x + 1.5, y + 1.0, 1.8, { name: 'lashing cage' });
  }
  T.dress(() => {
    for (const [x, y] of [[246.4, 237], [251, 237], [255.6, 237]]) {
      for (let k = 0; k < 5; k += 1) {
        T.cyl('dkRust', [x - 1.3 + k * 0.6, y - 0.6, 1.85], [x - 1.3 + k * 0.6, y + 0.6, 1.85], 0.06, 4);
      }
    }
  });
  /* The gangway from the quay to the ship's deck, by the house. */
  T.dress(() => {
    const x = 98;
    T.cyl('metal', [x, QUAY_Y - 1.0, 0.3], [x, SHIP.y0 - 0.2, SHIP.deck + 0.8], 0.06, 4);
    T.cyl('metal', [x + 0.9, QUAY_Y - 1.0, 0.3], [x + 0.9, SHIP.y0 - 0.2, SHIP.deck + 0.8], 0.06, 4);
    T.cyl('metal', [x, QUAY_Y - 1.0, 1.3], [x, SHIP.y0 - 0.2, SHIP.deck + 1.8], 0.03, 3);
    T.cyl('metal', [x + 0.9, QUAY_Y - 1.0, 1.3], [x + 0.9, SHIP.y0 - 0.2, SHIP.deck + 1.8], 0.03, 3);
  });
}
