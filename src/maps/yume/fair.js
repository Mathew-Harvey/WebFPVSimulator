/*
 * fair.js: what stands still about Yumeboshi Land's rides: the big wheel's
 * rims, hub and legs, the carousel's deck, column and canopy, the drop
 * tower, the teacups' deck and pavilion, the swing ride's mast and
 * canopy, the swinging ship's A frames, axle and deck. Written with the
 * land's builder (./frame.js), so each line is drawn and solid in one, and
 * pure, so scripts/yume-check.js builds it in Node. What moves is
 * ./rides.js, drawn by ./drawrides.js.
 *
 * A ROUND SOLID is held by three boxes inside its circle (roundSolid): a
 * wide one, a deep one and a square one, whose corners all lie within half
 * a percent of the circle. The module holds boxes and capsules only, and
 * a capsule stood on end is a dome at the top, not a deck.
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

import { sincos } from '../../props/trig.js';
import {
  WHEEL, CAROUSEL, TOWER, TEACUPS, SWINGS, SHIP,
} from './rides.js';

const TAU = 2 * Math.PI;
const SC = { s: 0, c: 1 };

/* A round solid from h0 to h1, radius r, round (px, py): three boxes
 * inside the circle. Not drawn. */
export function roundSolid(T, px, py, r, h0, h1, name, kind = 'wall') {
  const o = { draw: false, kind, name };
  T.box('ymConcrete', px - r * 0.92, py - r * 0.38, h0, px + r * 0.92, py + r * 0.38, h1, o);
  T.box('ymConcrete', px - r * 0.38, py - r * 0.92, h0, px + r * 0.38, py + r * 0.92, h1, o);
  T.box('ymConcrete', px - r * 0.695, py - r * 0.695, h0, px + r * 0.695, py + r * 0.695, h1, o);
}

/* A cone's solid from h0 (radius r0) to h1 (radius r1), in n round
 * tiers, each inside the cone. */
export function coneSolid(T, px, py, r0, h0, r1, h1, n, name) {
  for (let k = 0; k < n; k += 1) {
    const f = (k + 1) / n;
    roundSolid(T, px, py, r0 + (r1 - r0) * f, h0 + ((h1 - h0) * k) / n, h0 + ((h1 - h0) * (k + 1)) / n, name);
  }
}

/* ---- the big wheel ---- */
function wheel(T) {
  const Wh = WHEEL;
  const { px, py, hub, R } = Wh;
  /* The two rims: drawn as rings, solid as a chain of capsules round
   * each, a ring being the same ring at every angle it turns to. */
  const N = 40;
  for (const side of [-1, 1]) {
    const y = py + side * Wh.rim;
    T.torus('ymWhite', px, y, hub, R, 0.3, 0, 1, 6, 64);
    T.torus('ymPink', px, y, hub, R - 0.7, 0.16, 0, 1, 5, 64);
    let prev = null;
    for (let k = 0; k <= N; k += 1) {
      sincos((TAU * k) / N, SC);
      const pt = [px + R * SC.c, y, hub + R * SC.s];
      if (prev) {
        T.cap('ymWhite', prev, pt, 0.34, { draw: false, kind: 'pole', name: 'wheel rim' });
      }
      prev = pt;
    }
  }
  /* The hub and the axle out to the legs. */
  T.cap('ymSteel', [px, py - Wh.legs, hub], [px, py + Wh.legs, hub], 0.55, { kind: 'pole', name: 'wheel axle' });
  T.cyl('ymWhite', [px, py - Wh.rim - 0.3, hub], [px, py + Wh.rim + 0.3, hub], 1.35, 16);
  T.cap('ymWhite', [px, py - Wh.rim, hub], [px, py + Wh.rim, hub], 1.3, { draw: false, kind: 'wall', name: 'wheel hub' });
  for (const side of [-1, 1]) {
    T.cyl('ymGold', [px, py + side * (Wh.rim + 0.3), hub], [px, py + side * (Wh.rim + 0.55), hub], 0.95, 12);
  }
  /* The legs, an A frame each side, braced. */
  for (const side of [-1, 1]) {
    const y = py + side * Wh.legs;
    for (const s of [-1, 1]) {
      T.cap('ymWhite', [px + s * Wh.legSpread, y, 0], [px, y, hub], 0.55, { kind: 'pole', name: 'wheel leg' });
    }
    T.cap('ymWhite', [px - Wh.legSpread * 0.55, y, hub * 0.45], [px + Wh.legSpread * 0.55, y, hub * 0.45], 0.3, { kind: 'pole', name: 'wheel brace' });
    T.box('ymConcrete', px - Wh.legSpread - 1.2, y - 1.2, 0, px - Wh.legSpread + 1.2, y + 1.2, 0.6, { kind: 'wall', name: 'wheel footing' });
    T.box('ymConcrete', px + Wh.legSpread - 1.2, y - 1.2, 0, px + Wh.legSpread + 1.2, y + 1.2, 0.6, { kind: 'wall', name: 'wheel footing' });
  }
  /* The boarding deck under the lowest gondola, with its steps. */
  const deckH = hub - R - Wh.cab.below - Wh.cab.tall - 0.5;
  T.box('ymWallPink', px - 6, py - 3.4, 0, px + 6, py + 3.4, deckH, { kind: 'wall', name: 'wheel deck' });
  T.box('ymPaveRose', px - 6.2, py - 3.6, deckH, px + 6.2, py + 3.6, deckH + 0.12, { kind: 'wall', name: 'wheel deck top' });
  for (let k = 0; k < 6; k += 1) {
    const h = (deckH * (k + 1)) / 7;
    T.box('ymPave', px + 6.2 + k * 0.6, py - 1.4, 0, px + 6.8 + k * 0.6, py + 1.4, deckH - h + 0.2, { kind: 'wall', name: 'wheel steps' });
  }
  T.sign('ymWheelName', px, py - 3.45, deckH * 0.5, 7, 1.6, 's');
}

/* ---- the carousel ---- */
function carousel(T) {
  const C = CAROUSEL;
  const { px, py } = C;
  T.disc('ymCream', px, py, C.R, 0, C.deck - 0.12, 40);
  T.disc('ymWood', px, py, C.R - 0.15, C.deck - 0.12, C.deck, 40);
  T.torus('ymGold', px, py, C.deck - 0.1, C.R + 0.02, 0.1, 0, 0, 5, 48);
  roundSolid(T, px, py, C.R, 0, C.deck, 'carousel deck', 'wall');
  /* The column, mirrored panels round it. */
  T.cyl('ymPink', [px, py, C.deck], [px, py, C.canopy], C.post, 16);
  T.cyl('ymGold', [px, py, C.deck], [px, py, C.deck + 0.5], C.post + 0.15, 16);
  T.cap('ymPink', [px, py, C.deck], [px, py, C.canopy], C.post, { draw: false, kind: 'wall', name: 'carousel column' });
  /* The canopy: a valance band, a striped cone, a crown and a flag. */
  const v0 = C.canopy;
  const v1 = C.canopy + 0.75;
  T.disc('ymCream', px, py, C.R + 0.6, v0, v1, 40);
  T.torus('ymGold', px, py, v0, C.R + 0.62, 0.12, 0, 0, 5, 48);
  T.torus('ymRed', px, py, v1, C.R + 0.62, 0.14, 0, 0, 5, 48);
  T.cone('ymRed', px, py, v1, C.R + 0.9, 3.4, 20);
  T.cone('ymCream', px, py, v1 + 0.02, C.R + 0.5, 3.15, 10);
  T.cyl('ymGold', [px, py, v1 + 2.6], [px, py, v1 + 4.2], 0.9, 12);
  T.cone('ymRed', px, py, v1 + 4.2, 1.2, 1.8, 12);
  T.ball('ymGold', px, py, v1 + 6.2, 0.35);
  roundSolid(T, px, py, C.R + 0.6, v0, v1, 'carousel canopy');
  coneSolid(T, px, py, C.R + 0.9, v1, 1.6, v1 + 3.2, 4, 'carousel roof');
  T.post('ymGold', px, py, v1 + 3.2, v1 + 6.0, 0.9, { draw: false, kind: 'pole', name: 'carousel crown' });
  /* The lamps round the valance: drawn only, still, evenly spaced. */
  T.dress(() => {
    for (let k = 0; k < 32; k += 1) {
      sincos((TAU * k) / 32, SC);
      T.ball('ymLamp', px + (C.R + 0.66) * SC.c, py + (C.R + 0.66) * SC.s, v0 + 0.38, 0.09);
    }
  });
  T.sign('ymCarouselName', px, py - C.R - 0.64, (v0 + v1) / 2, 5.5, 0.62, 's');
  T.sign('ymCarouselName', px, py + C.R + 0.64, (v0 + v1) / 2, 5.5, 0.62, 'n');
}

/* ---- the drop tower ---- */
function tower(T) {
  const Tw = TOWER;
  const { px, py, half } = Tw;
  T.box('ymWhite', px - half, py - half, 0, px + half, py + half, Tw.H, { kind: 'wall', name: 'drop tower' });
  /* Red bands up it, a hand's breadth proud, drawn only. */
  for (let h = 6; h < Tw.H - 4; h += 8) {
    T.paint('ymRed', px - half - 0.03, py - half - 0.03, h, px + half + 0.03, py + half + 0.03, h + 1.2);
  }
  /* The rails the seats run on, a yellow stripe each face. */
  for (const [a, b, c, d] of [[-0.25, -half - 0.05, 0.25, -half], [-0.25, half, 0.25, half + 0.05], [-half - 0.05, -0.25, -half, 0.25], [half, -0.25, half + 0.05, 0.25]]) {
    T.paint('ymYellow', px + a, py + b, 1, px + c, py + d, Tw.H - 3);
  }
  /* The crown and the star on it. */
  T.box('ymPurple', px - half - 0.8, py - half - 0.8, Tw.H, px + half + 0.8, py + half + 0.8, Tw.H + 2.2, { kind: 'wall', name: 'tower crown' });
  T.box('ymGold', px - half - 0.9, py - half - 0.9, Tw.H + 2.2, px + half + 0.9, py + half + 0.9, Tw.H + 2.5, { kind: 'wall', name: 'tower crown' });
  T.post('ymSteel', px, py, Tw.H + 2.5, Tw.H + 8, 0.15, { kind: 'pole', name: 'tower mast' });
  T.ball('ymYellow', px, py, Tw.H + 8.6, 0.7);
  T.sign('ymTowerName', px, py - half - 0.82, Tw.H + 1.1, 4.6, 1.5, 's');
  T.sign('ymTowerName', px, py + half + 0.82, Tw.H + 1.1, 4.6, 1.5, 'n');
  /* The base: a round deck the seats come down to. */
  T.disc('ymPaveRose', px, py, 5.2, 0, 0.3, 28);
  roundSolid(T, px, py, 5.2, 0, 0.3, 'tower base', 'wall');
}

/* ---- the teacups ---- */
function teacups(T) {
  const C = TEACUPS;
  const { px, py } = C;
  T.disc('ymWallLemon', px, py, C.R, 0, C.deck, 40);
  T.torus('ymPink', px, py, C.deck, C.R, 0.12, 0, 0, 5, 48);
  roundSolid(T, px, py, C.R, 0, C.deck, 'teacup deck', 'wall');
  /* The pavilion: posts on a circle, a gap facing south between two. */
  for (let k = 0; k < C.posts; k += 1) {
    sincos((TAU * (k + 0.5)) / C.posts + Math.PI / 2, SC);
    const x = px + C.postR * SC.c;
    const y = py + C.postR * SC.s;
    T.post('ymWhite', x, y, 0, C.roof, 0.26, { kind: 'pole', name: 'teacup post' });
    T.ball('ymGold', x, y, C.roof + 0.3, 0.32);
  }
  T.torus('ymWhite', px, py, C.roof, C.postR, 0.28, 0, 0, 6, 48);
  T.disc('ymWallPink', px, py, C.postR + 0.9, C.roof, C.roof + 0.6, 40);
  T.cone('ymRoofTeal', px, py, C.roof + 0.6, C.postR + 1.3, 3.6, 24);
  roundSolid(T, px, py, C.postR + 0.9, C.roof, C.roof + 0.6, 'teacup roof');
  coneSolid(T, px, py, C.postR + 1.2, C.roof + 0.6, 2.4, C.roof + 3.6, 4, 'teacup roof');
  /* The teapot on the top. */
  const top = C.roof + 4.0;
  T.ball('ymWhite', px, py, top + 1.0, 1.4);
  T.cyl('ymPink', [px, py, top - 0.4], [px, py, top + 0.2], 1.1, 16);
  T.cyl('ymWhite', [px + 1.2, py, top + 0.9], [px + 2.6, py, top + 1.9], 0.25, 8, 0.15);
  T.torus('ymWhite', px - 1.4, py, top + 1.1, 0.6, 0.14, 0, 1, 5, 16);
  T.ball('ymPink', px, py, top + 2.5, 0.35);
  T.post('ymWhite', px, py, top - 0.4, top + 2.2, 1.35, { draw: false, kind: 'wall', name: 'teapot' });
  T.sign('ymTeacupName', px, py - C.postR - 0.92, C.roof + 0.3, 6, 0.5, 's');
}

/* ---- the swing ride ---- */
function swings(T) {
  const S = SWINGS;
  const { px, py } = S;
  T.disc('ymPaveRose', px, py, 3.2, 0, 0.35, 24);
  roundSolid(T, px, py, 3.2, 0, 0.35, 'swing base', 'wall');
  T.cyl('ymSky', [px, py, 0.35], [px, py, S.mast], 0.7, 14);
  T.cap('ymSky', [px, py, 0.35], [px, py, S.mast], 0.7, { draw: false, kind: 'pole', name: 'swing mast' });
  for (let h = 1.5; h < S.hang - 1; h += 2.2) {
    T.torus('ymWhite', px, py, h, 0.72, 0.08, 0, 0, 4, 18);
  }
  /* The canopy: a scalloped band where the chains hang, then a cone. */
  T.disc('ymWhite', px, py, S.top + 0.5, S.hang, S.hang + 0.6, 32);
  T.torus('ymBlue', px, py, S.hang, S.top + 0.5, 0.12, 0, 0, 5, 40);
  T.cone('ymBlue', px, py, S.hang + 0.6, S.top + 0.8, 2.4, 20);
  T.cone('ymWhite', px, py, S.hang + 0.62, S.top + 0.4, 2.2, 10);
  T.ball('ymYellow', px, py, S.hang + 3.3, 0.45);
  roundSolid(T, px, py, S.top + 0.5, S.hang, S.hang + 0.6, 'swing canopy');
  coneSolid(T, px, py, S.top + 0.8, S.hang + 0.6, 0.8, S.hang + 2.8, 3, 'swing roof');
  T.sign('ymSwingName', px, py - S.top - 0.52, S.hang + 0.3, 5, 0.5, 's');
}

/* ---- the swinging ship ---- */
function ship(T) {
  const S = SHIP;
  const { px, py } = S;
  const legY = S.beam + 1.5;
  for (const side of [-1, 1]) {
    const y = py + side * legY;
    for (const s of [-1, 1]) {
      T.cap('ymRed', [px + s * S.foot, y, 0], [px, y, S.axle], 0.42, { kind: 'pole', name: 'ship frame' });
    }
    T.cap('ymRed', [px - S.foot * 0.5, y, S.axle * 0.5], [px + S.foot * 0.5, y, S.axle * 0.5], 0.24, { kind: 'pole', name: 'ship brace' });
  }
  T.cap('ymSteelDark', [px, py - legY - 0.4, S.axle], [px, py + legY + 0.4, S.axle], 0.38, { kind: 'pole', name: 'ship axle' });
  for (const side of [-1, 1]) {
    T.cyl('ymGold', [px, py + side * (legY + 0.35), S.axle], [px, py + side * (legY + 0.6), S.axle], 0.7, 12);
  }
  /* The boarding deck under it, low enough to fly under the ship at
   * rest. */
  T.box('ymWood', px - 4.5, py - 4.2, 0, px + 4.5, py + 4.2, 0.9, { kind: 'wall', name: 'ship deck' });
  T.sign('ymShipName', px, py - 4.25, 0.45, 5.2, 0.7, 's');
}

/* Every ride's still parts. */
export function fair(T) {
  wheel(T);
  carousel(T);
  tower(T);
  teacups(T);
  swings(T);
  ship(T);
}
