/*
 * shrine.js: the hill side of Kodama Onsen. The approach (sando) from the
 * car park north through the cedar avenue, the great torii at its foot,
 * the line of six torii, the tunnel of small ones the way an Inari shrine
 * has them, the stream across the forest and its two bridges, the stone
 * steps up the walled terrace, and the shrine on it: the hall of worship
 * (haiden), the small sanctuary behind (honden), the sacred cedar with its
 * rope, the two foxes, the water pavilion and the stone lanterns. Pure, as
 * ./frame.js is.
 *
 * WHAT IT IS MODELLED ON. Any of the small mountain shrines that stand
 * above a hot spring village: a myojin torii in vermilion with black feet
 * and a black lintel, 4 to 5 m to the top of the kasagi, as the measured
 * drawings of the type give it; a tunnel of donated torii, about 2.2 m
 * across and 2.9 m tall a metre and a quarter apart, as the Inari tunnels
 * are; stone lanterns (toro) of a lantern's five parts, 1.9 m; a terrace
 * walled in dry stone (ishigaki); a worship hall of six ken with its
 * curved gable and its bell rope. None of it is any one shrine.
 *
 * The approach's line north is the map's first line: the great torii is
 * straight ahead of a pilot who turns left out of the car park, the six
 * torii behind it, and the tunnel behind them, all on one axis.
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

import { W, rng } from './frame.js';
import { AVENUE } from './forest.js';

/* The approach's axis. */
export const SANDO = { px: AVENUE.px, y0: 40.5, y1: 184 };
/* The great torii, the line of six, and the tunnel. */
export const GREAT = { py: 50, H: 5.4, span: 4.0 };
export const LINE = { y0: 64, step: 8, n: 6, H: 4.2, span: 3.2 };
export const TUNNEL = { y0: 122, step: 1.25, n: 25, H: 2.9, span: 2.2 };
/* The stream: its channel, its depth, and its two bridges. */
export const STREAM = { y0: 170, y1: 178, bed: -1.6 };
export const RED_BRIDGE = { x0: 28.2, x1: 31.8, y0: 168.4, y1: 179.6, h0: 0.35, h1: 0.6 };
export const FOREST_BRIDGE = { x0: 206, x1: 214, y0: 168.4, y1: 179.6, h0: 0.3, h1: 0.7 };
/* The terrace, the steps up its front, the shrine on it. */
export const TERRACE = { x0: 8, x1: 52, y0: 184, y1: 234, h: 3.6 };
export const STEPS = { x0: 27, x1: 33, y0: 184, y1: 196 };
export const HAIDEN = { x0: 22, x1: 38, y0: 208, y1: 216, floor: TERRACE.h + 0.9, eave: TERRACE.h + 3.5 };
export const HONDEN = { x0: 27, x1: 33, y0: 220.5, y1: 226 };
export const SHINBOKU = { px: 45, py: 221, H: 46, r: 1.05 };
/* The forestry road's line north across the stream. */
export const FORESTRY = { x0: 207.5, x1: 212.5, y0: 59, y1: 300, ex0: 121, ey0: 58.5, ey1: 63.5 };

/*
 * A MYOJIN TORII across the plan's x axis, so it is flown along y: two
 * posts `span` apart (centre to centre), the tie beam (nuki) through them
 * two thirds of the way up, the lintel (kasagi) on top curving up at its
 * ends, its under beam (shimaki), and the tablet (gakuzuka) between. The
 * posts' feet and the kasagi's top are black. Solid: the posts, the nuki
 * and the kasagi; the tablet and the curl of the ends are drawn only.
 */
export function torii(T, px, py, H, span, base = 0, fine = false, tablet = true) {
  const r = Math.max(0.09, H * 0.05);
  const xl = px - span / 2;
  const xr = px + span / 2;
  const top = base + H;
  /* The posts lean in a little at the top, as a myojin's do; drawn so,
   * solid straight up inside the lean. */
  const lean = H * 0.015;
  T.cyl('cdVermilion', [xl, py, base], [xl + lean, py, top - 0.32 * r * 4], r, 10, r * 0.9, fine);
  T.cyl('cdVermilion', [xr, py, base], [xr - lean, py, top - 0.32 * r * 4], r, 10, r * 0.9, fine);
  T.cap('cdVermilion', [xl + lean / 2, py, base], [xl + lean / 2, py, top - 0.32 * r * 4], r * 0.88, { draw: false, name: 'torii post', kind: 'pole' });
  T.cap('cdVermilion', [xr - lean / 2, py, base], [xr - lean / 2, py, top - 0.32 * r * 4], r * 0.88, { draw: false, name: 'torii post', kind: 'pole' });
  /* The black feet (kamaki). */
  T.cyl('cdToriiBlack', [xl, py, base], [xl, py, base + H * 0.08], r * 1.18, 10, null, fine);
  T.cyl('cdToriiBlack', [xr, py, base], [xr, py, base + H * 0.08], r * 1.18, 10, null, fine);
  /* The nuki, through both posts and out past them. */
  const nh = base + H * 0.64;
  const nt = Math.max(0.12, H * 0.045);
  const reach = r * 2.6;
  T.box('cdVermilion', xl - reach, py - r * 0.55, nh, xr + reach, py + r * 0.55, nh + nt, { name: 'nuki', fine });
  /* The shimaki and the kasagi over it, the kasagi longer, its ends swept
   * up: drawn as a profile along x, solid as its middle. */
  const sh = top - H * 0.12;
  const over = H * 0.17;
  T.box('cdVermilion', xl - over * 0.7, py - r * 0.7, sh, xr + over * 0.7, py + r * 0.7, sh + H * 0.06, { name: 'shimaki', fine });
  const kb = sh + H * 0.06;
  const kt = top;
  const k0 = xl - over;
  const k1 = xr + over;
  const lift = H * 0.05;
  T.prism('cdToriiBlack', 'y', [
    [k0, kb + lift], [k0 + over * 0.4, kb + lift * 0.3], [px, kb], [k1 - over * 0.4, kb + lift * 0.3], [k1, kb + lift],
    [k1 + 0.05, kt + lift * 1.2], [k1 - over * 0.5, kt + lift * 0.2], [px, kt], [k0 + over * 0.5, kt + lift * 0.2], [k0 - 0.05, kt + lift * 1.2],
  ], py - r * 0.8, py + r * 0.8, fine);
  T.hidden(xl - over * 0.6, py - r * 0.75, sh, xr + over * 0.6, py + r * 0.75, kt, 'pole', 'kasagi');
  /* The tablet between the nuki and the shimaki. */
  if (tablet) {
    T.deco('cdVermilion', px - r * 0.6, py - r * 0.5, nh + nt, px + r * 0.6, py + r * 0.5, sh, fine);
    T.deco('cdToriiBlack', px - H * 0.07, py - r * 0.75, nh + nt + H * 0.04, px + H * 0.07, py + r * 0.75, sh - H * 0.03, true);
  }
  return { r, nh, sh };
}

/* A stone lantern (toro): base, post, the fire box with its windows, the
 * roof and the jewel. Solid as one capsule round the post. */
function lantern(T, px, py, base = 0) {
  T.box('cdStoneDark', px - 0.32, py - 0.32, base, px + 0.32, py + 0.32, base + 0.28, { name: 'lantern', solid: false });
  T.cyl('cdStone', [px, py, base + 0.28], [px, py, base + 1.02], 0.13, 8);
  T.box('cdStone', px - 0.28, py - 0.28, base + 1.02, px + 0.28, py + 0.28, base + 1.12, { solid: false });
  T.box('cdStone', px - 0.22, py - 0.22, base + 1.12, px + 0.22, py + 0.22, base + 1.5, { solid: false });
  T.paint('cdToriiBlack', px - 0.1, py - 0.225, base + 1.22, px + 0.1, py + 0.225, base + 1.42, true);
  T.paint('cdToriiBlack', px - 0.225, py - 0.1, base + 1.22, px + 0.225, py + 0.1, base + 1.42, true);
  T.frustum('cdStoneMoss', { x0: px - 0.42, y0: py - 0.42, x1: px + 0.42, y1: py + 0.42 }, base + 1.5, { x0: px - 0.08, y0: py - 0.08, x1: px + 0.08, y1: py + 0.08 }, base + 1.82);
  T.ball('cdStone', px, py, base + 1.9, 0.09, true);
  T.cap('cdStone', [px, py, base + 0.3], [px, py, base + 1.6], 0.3, { draw: false, name: 'lantern', kind: 'pole' });
}

/* A fox (kitsune), the messenger an Inari shrine keeps, sitting on its
 * pedestal with a red bib. Drawn only, on a solid pedestal. */
function fox(T, px, py, base, face) {
  T.box('cdStoneDark', px - 0.42, py - 0.42, base, px + 0.42, py + 0.42, base + 1.1, { name: 'pedestal' });
  T.box('cdStone', px - 0.48, py - 0.48, base + 1.1, px + 0.48, py + 0.48, base + 1.22, { name: 'pedestal' });
  const b = base + 1.22;
  T.cyl('cdFox', [px, py, b], [px, py + face * 0.08, b + 0.62], 0.21, 8, 0.15);
  T.ball('cdFox', px, py + face * 0.12, b + 0.78, 0.17);
  T.cone('cdFox', px, py + face * 0.26, b + 0.74, 0.08, 0.2, 6);
  T.cone('cdFox', px - 0.09, py + face * 0.08, b + 0.88, 0.05, 0.2, 5);
  T.cone('cdFox', px + 0.09, py + face * 0.08, b + 0.88, 0.05, 0.2, 5);
  T.cyl('cdFox', [px + 0.18, py - face * 0.15, b + 0.05], [px + 0.25, py - face * 0.3, b + 0.6], 0.07, 6, 0.04, true);
  T.box('cdVermilion', px - 0.17, py + face * 0.14 - 0.03, b + 0.42, px + 0.17, py + face * 0.14 + 0.03, b + 0.62, { solid: false, fine: true });
}

/* Shide: the zigzag paper strips that hang from a sacred rope, a few
 * strokes each. Drawn only. */
function shide(T, px, py, h, along) {
  const pts = [[0, 0], [0.07, -0.08], [0, -0.16], [0.07, -0.24], [0, -0.32]];
  for (let i = 0; i + 1 < pts.length; i += 1) {
    const [a0, h0] = pts[i];
    const [a1, h1] = pts[i + 1];
    if (along === 'x') {
      T.stroke('cdPaper', [px + a0, py, h + h0], [px + a1, py, h + h1], 0.035, true);
    } else {
      T.stroke('cdPaper', [px, py + a0, h + h0], [px, py + a1, h + h1], 0.035, true);
    }
  }
}

function approach(T) {
  const S = SANDO;
  /* The paving, stone flags in two tones, with moss in the joints. */
  T.paint('cdPaving', S.px - 1.5, S.y0, 0, S.px + 1.5, STREAM.y0 - 1.8, 0.03);
  for (let py = S.y0 + 1.2; py < STREAM.y0 - 2; py += 2.4) {
    T.paint('cdStoneDark', S.px - 1.5, py, 0.03, S.px + 1.5, py + 0.08, 0.034, true);
    T.paint('cdMoss', S.px - 1.55, py + 0.1, 0.03, S.px - 1.45, py + 2.3, 0.034, true);
  }
  /* The great torii at the approach's foot, and the post with the
   * shrine's name in strokes beside it. */
  torii(T, S.px, GREAT.py, GREAT.H, GREAT.span);
  T.box('cdStoneDark', S.px - 3.5, GREAT.py - 2.2, 0, S.px - 3.0, GREAT.py - 1.7, 2.6, { name: 'name post' });
  /* The six. */
  for (let i = 0; i < LINE.n; i += 1) {
    torii(T, S.px, LINE.y0 + i * LINE.step, LINE.H, LINE.span, 0, false, i % 2 === 0);
  }
  /* The tunnel: small torii a metre and a quarter apart, nearly touching,
   * the dedication strokes down every post. */
  for (let i = 0; i < TUNNEL.n; i += 1) {
    const py = TUNNEL.y0 + i * TUNNEL.step;
    torii(T, S.px, py, TUNNEL.H, TUNNEL.span, 0, false, false);
  }
  /* Lanterns in pairs. */
  for (const py of [56, 114, 160]) {
    lantern(T, S.px - 3.4, py);
    lantern(T, S.px + 3.4, py);
  }
}

function stream(T) {
  const St = STREAM;
  /* The banks, dry stone faces down to the bed, solid; the bed and the
   * water; boulders in it. The ground over the channel is cut away by
   * ./index.js (STREAM_HOLE in ./plan.js). */
  T.box('cdStoneDark', 0, St.y0 - 0.45, St.bed, W, St.y0, 0.02, { name: 'bank' });
  T.box('cdStoneDark', 0, St.y1, St.bed, W, St.y1 + 0.45, 0.02, { name: 'bank' });
  T.box('cdStoneDark', -0.4, St.y0, St.bed, 0, St.y1, 0.02, { name: 'bank' });
  T.box('cdStoneDark', W, St.y0, St.bed, W + 0.4, St.y1, 0.02, { name: 'bank' });
  T.paint('cdStoneMoss', 0, St.y0 - 0.47, St.bed + 0.9, W, St.y0 - 0.45, 0.02, true);
  T.paint('cdStoneMoss', 0, St.y1 + 0.45, St.bed + 0.9, W, St.y1 + 0.47, 0.02, true);
  T.paint('cdWater', 0, St.y0, St.bed, W, St.y1, St.bed + 0.06);
  const R = rng(0x57e4);
  for (let i = 0; i < 46; i += 1) {
    const px = R.range(3, W - 3);
    if (Math.abs(px - SANDO.px) < 4 || Math.abs(px - (FOREST_BRIDGE.x0 + FOREST_BRIDGE.x1) / 2) < 6) {
      continue;
    }
    const py = R.range(St.y0 + 0.8, St.y1 - 0.8);
    const r = R.range(0.35, 0.9);
    T.ball(R.chance(0.4) ? 'cdStoneMoss' : 'cdStone', px, py, St.bed + r * 0.35, r);
    T.cap('cdStone', [px, py, St.bed + r * 0.35], [px, py, St.bed + r * 0.35], r * 0.85, { draw: false, name: 'boulder', kind: 'wall' });
  }

  /* THE RED BRIDGE, the shrine's: a timber deck, vermilion rails on posts
   * with brass knobs (giboshi) at the ends, two girders under it. */
  const B = RED_BRIDGE;
  T.box('cdShrineWood', B.x0, B.y0, B.h0, B.x1, B.y1, B.h1, { name: 'bridge deck' });
  for (const px of [B.x0 + 0.5, B.x1 - 0.5]) {
    T.box('cdVermilion', px - 0.15, B.y0, B.h0 - 0.35, px + 0.15, B.y1, B.h0, { name: 'girder' });
  }
  for (const px of [B.x0 + 0.08, B.x1 - 0.08]) {
    for (let py = B.y0 + 0.1; py <= B.y1; py += 1.86) {
      T.post('cdVermilion', px, py, B.h1, B.h1 + 1.0, 0.07, { name: 'rail post' });
    }
    T.box('cdVermilion', px - 0.07, B.y0, B.h1 + 0.86, px + 0.07, B.y1, B.h1 + 1.0, { name: 'rail' });
    T.box('cdVermilion', px - 0.05, B.y0, B.h1 + 0.4, px + 0.05, B.y1, B.h1 + 0.48, { name: 'rail' });
    for (const py of [B.y0 + 0.1, B.y1 - 0.1]) {
      T.ball('cdBrass', px, py, B.h1 + 1.12, 0.11, true);
      T.cone('cdBrass', px, py, B.h1 + 1.2, 0.06, 0.12, 6, true);
    }
  }
  /* THE FOREST BRIDGE, the forestry road's: plain concrete, low parapets. */
  const F = FOREST_BRIDGE;
  T.box('cdConcrete', F.x0, F.y0, F.h0, F.x1, F.y1, F.h1, { name: 'bridge deck' });
  T.box('cdConcrete', F.x0, F.y0, F.h1, F.x0 + 0.25, F.y1, F.h1 + 0.55, { name: 'parapet' });
  T.box('cdConcrete', F.x1 - 0.25, F.y0, F.h1, F.x1, F.y1, F.h1 + 0.55, { name: 'parapet' });
  T.paint('cdRustDark', F.x0 - 0.01, F.y0 + 2, F.h0 + 0.1, F.x0, F.y1 - 2, F.h1 + 0.4, true);
}

function terrace(T) {
  const Tr = TERRACE;
  const Sp = STEPS;
  const h = Tr.h;
  /* The terrace, solid to its top, in three pieces round the steps' cut. */
  T.box('cdStone', Tr.x0, Tr.y0, 0, Sp.x0, Tr.y1, h, { name: 'terrace' });
  T.box('cdStone', Sp.x1, Tr.y0, 0, Tr.x1, Tr.y1, h, { name: 'terrace' });
  T.box('cdStone', Sp.x0, Sp.y1, 0, Sp.x1, Tr.y1, h, { name: 'terrace' });
  T.paint('cdGravel', Tr.x0, Tr.y0, h, Tr.x1, Tr.y1, h + 0.02);
  /* The dry stone face: courses of blocks, proud, in three tones, and the
   * moss that grows in the shade of it. Fine. */
  const R = rng(0x15a6a);
  const course = 0.6;
  for (const [x0, x1] of [[Tr.x0, Sp.x0], [Sp.x1, Tr.x1]]) {
    for (let k = 0; k * course < h; k += 1) {
      let x = x0 + (k % 2) * 0.5;
      while (x < x1 - 0.2) {
        const w = R.range(0.8, 1.5);
        const e = Math.min(x1, x + w);
        const m = R.chance(0.22) ? 'cdStoneMoss' : R.chance(0.4) ? 'cdStoneDark' : 'cdStone';
        T.paint(m, x + 0.04, Tr.y0 - 0.06, k * course + 0.04, e - 0.04, Tr.y0, Math.min(h, (k + 1) * course) - 0.04, true);
        x = e;
      }
    }
  }
  for (const px of [Sp.x0, Sp.x1]) {
    T.paint('cdStoneMoss', px - 0.03, Sp.y0, 0, px + 0.03, Sp.y1, h * 0.5, true);
  }
  /* The steps, each solid to the ground. */
  const n = 12;
  for (let i = 0; i < n; i += 1) {
    const y0 = Sp.y0 + (i * (Sp.y1 - Sp.y0)) / n;
    T.box(i % 2 ? 'cdStone' : 'cdStoneDark', Sp.x0, y0, 0, Sp.x1, Sp.y1, ((i + 1) * h) / n, { name: 'step' });
  }
  /* The path from the red bridge to the steps. */
  T.paint('cdPaving', SANDO.px - 1.5, RED_BRIDGE.y1, 0, SANDO.px + 1.5, Sp.y0, 0.03);
  /* The second torii at the top of the steps, the two foxes. */
  torii(T, SANDO.px, Sp.y1 + 1.2, 4.6, 3.4, h);
  fox(T, Sp.x0 - 1.4, Sp.y1 + 2.4, h, -1);
  fox(T, Sp.x1 + 1.4, Sp.y1 + 2.4, h, -1);
  for (const py of [200, 204.5]) {
    lantern(T, SANDO.px - 3.6, py, h);
    lantern(T, SANDO.px + 3.6, py, h);
  }
  T.paint('cdPaving', SANDO.px - 1.4, Sp.y1, h, SANDO.px + 1.4, HAIDEN.y0, h + 0.04);
}

function shrine(T) {
  const Hd = HAIDEN;
  const base = TERRACE.h;
  /* The hall of worship on its posts, its floor a deck over the terrace,
   * open at the front, a doorway through the back to the sanctuary. */
  T.box('cdShrineWood', Hd.x0, Hd.y0, base, Hd.x1, Hd.y1, Hd.floor, { name: 'haiden floor' });
  T.box('cdStone', Hd.x0 + 5, Hd.y0 - 1.6, base, Hd.x1 - 5, Hd.y0, base + 0.45, { name: 'haiden step' });
  T.box('cdStone', Hd.x0 + 5.6, Hd.y0 - 0.8, base + 0.45, Hd.x1 - 5.6, Hd.y0, Hd.floor, { name: 'haiden step' });
  /* The posts in bays of 2.6 m either side of the middle, so the middle
   * bay, front and back, is the way through and has no post in it. */
  const mid0 = (Hd.x0 + Hd.x1) / 2;
  const posts = [Hd.x0 + 0.2, Hd.x1 - 0.2];
  for (let d = 1.3; d < (Hd.x1 - Hd.x0) / 2 - 1; d += 2.6) {
    posts.push(mid0 - d, mid0 + d);
  }
  for (const px of posts) {
    for (const py of [Hd.y0 + 0.2, Hd.y1 - 0.2]) {
      T.post('cdShrineWood', px, py, Hd.floor, Hd.eave, 0.15, { name: 'haiden post' });
    }
  }
  const back = [[(Hd.x0 + Hd.x1) / 2 - 1.1, (Hd.x0 + Hd.x1) / 2 + 1.1, Hd.floor, Hd.eave - 0.4]];
  T.wall('cdShoji', 'x', Hd.y1 - 0.2, Hd.x0 + 0.2, Hd.x1 - 0.2, Hd.floor, Hd.eave, 0.12, back, { name: 'haiden wall' });
  T.wall('cdShoji', 'y', Hd.x0 + 0.2, Hd.y0 + 0.2, Hd.y1 - 0.2, Hd.floor, Hd.eave, 0.12, [], { name: 'haiden wall' });
  T.wall('cdShoji', 'y', Hd.x1 - 0.2, Hd.y0 + 0.2, Hd.y1 - 0.2, Hd.floor, Hd.eave, 0.12, [], { name: 'haiden wall' });
  T.box('cdShrineWood', Hd.x0, Hd.y0, Hd.eave - 0.35, Hd.x1, Hd.y1, Hd.eave, { name: 'haiden beam', solid: false });
  /* The roof: its section swept in a curve (the irimoya's) and drawn as
   * one prism; solid as the gable's boxes inside it. */
  const a0 = Hd.y0 - 1.8;
  const a1 = Hd.y1 + 1.8;
  const e = Hd.eave;
  const mid = (a0 + a1) / 2;
  const top = e + 3.8;
  T.prism('cdKawaraDark', 'x', [
    [a0, e - 0.2], [a0 - 0.1, e + 0.2], [a0 + 1.6, e + 0.65], [a0 + 3.2, e + 1.45], [mid - 1.1, top - 0.6], [mid, top],
    [mid + 1.1, top - 0.6], [a1 - 3.2, e + 1.45], [a1 - 1.6, e + 0.65], [a1 + 0.1, e + 0.2], [a1, e - 0.2],
  ], Hd.x0 - 1.4, Hd.x1 + 1.4);
  for (let k = 0; k < 6; k += 1) {
    const f = (k + 1) / 6;
    const h0 = e + ((top - 0.6 - e) * k) / 6;
    const h1 = e + (top - 0.6 - e) * f;
    const w = (mid - Hd.y0) * (1 - f) + 0.3;
    T.hidden(Hd.x0 - 1, mid - w, h0, Hd.x1 + 1, mid + w, h1, 'wall', 'haiden roof');
  }
  T.box('cdKawaraDark', Hd.x0 - 1.6, mid - 0.3, top - 0.1, Hd.x1 + 1.6, mid + 0.3, top + 0.45, { name: 'ridge' });
  /* The gable's triangle, in the shrine's wood, at both ends. */
  for (const px of [Hd.x0 - 1.0, Hd.x1 + 1.0]) {
    T.prism('cdShrineWood', 'x', [[mid - 3.2, e + 1.3], [mid, top - 0.4], [mid + 3.2, e + 1.3]], px - 0.08, px + 0.08, true);
  }
  /* The offertory box, the bell rope and its bell, the sacred rope across
   * the front with its paper strips. */
  const cx = (Hd.x0 + Hd.x1) / 2;
  T.box('cdTimberDark', cx - 1.0, Hd.y0 - 0.9, Hd.floor - 0.45, cx + 1.0, Hd.y0 - 0.1, Hd.floor + 0.25, { name: 'offertory box' });
  T.cyl('cdRope', [cx, Hd.y0 + 0.3, e], [cx, Hd.y0 + 0.3, Hd.floor + 0.5], 0.06, 6, null, true);
  T.ball('cdBrass', cx, Hd.y0 + 0.3, e - 0.25, 0.22);
  T.wire('cdRope', [Hd.x0 + 0.5, Hd.y0 - 0.05, e - 0.45], [Hd.x1 - 0.5, Hd.y0 - 0.05, e - 0.45], 0.55, 0.13);
  for (const f of [0.2, 0.4, 0.6, 0.8]) {
    const px = Hd.x0 + 0.5 + (Hd.x1 - Hd.x0 - 1) * f;
    const sag = 0.55 * 4 * f * (1 - f);
    shide(T, px, Hd.y0 - 0.12, e - 0.5 - sag, 'x');
  }

  /* The sanctuary behind, on a stone base, closed, its ridge crossed by
   * the forked boards (chigi) and laid with logs (katsuogi). */
  const Ho = HONDEN;
  const hb = base + 1.2;
  T.box('cdStone', Ho.x0 - 0.4, Ho.y0 - 0.4, base, Ho.x1 + 0.4, Ho.y1 + 0.4, hb, { name: 'honden base' });
  T.box('cdShrineWood', Ho.x0, Ho.y0, hb, Ho.x1, Ho.y1, hb + 2.6, { name: 'honden' });
  T.gable('cdKawaraDark', 'x', Ho.y0 - 0.9, Ho.y1 + 0.9, hb + 2.6, hb + 4.6, Ho.x0 - 0.7, Ho.x1 + 0.7, 0.22, 4, 'honden roof');
  const hm = (Ho.y0 + Ho.y1) / 2;
  for (const px of [Ho.x0 - 0.5, Ho.x1 + 0.5]) {
    T.cyl('cdShrineWood', [px, hm - 0.8, hb + 4.0], [px, hm + 0.6, hb + 5.6], 0.06, 4, null, true);
    T.cyl('cdShrineWood', [px, hm + 0.8, hb + 4.0], [px, hm - 0.6, hb + 5.6], 0.06, 4, null, true);
  }
  for (let px = Ho.x0 + 0.6; px < Ho.x1; px += 1.2) {
    T.cyl('cdBrass', [px, hm - 0.45, hb + 4.9], [px, hm + 0.45, hb + 4.9], 0.11, 6, null, true);
  }
  T.deco('cdBrass', (Ho.x0 + Ho.x1) / 2 - 0.5, Ho.y0 - 0.03, hb + 0.3, (Ho.x0 + Ho.x1) / 2 + 0.5, Ho.y0, hb + 2.1, true);
  /* A red fence (tamagaki) round the sanctuary. */
  const F = { x0: Ho.x0 - 1.6, x1: Ho.x1 + 1.6, y0: Ho.y0 - 1.6, y1: Ho.y1 + 1.4 };
  for (const [axis, at, a0, a1] of [['x', F.y0, F.x0, F.x1], ['x', F.y1, F.x0, F.x1], ['y', F.x0, F.y0, F.y1], ['y', F.x1, F.y0, F.y1]]) {
    const n = Math.round((a1 - a0) / 0.9);
    for (let i = 0; i <= n; i += 1) {
      const a = a0 + ((a1 - a0) * i) / n;
      if (axis === 'x') {
        T.post('cdVermilion', a, at, base, base + 1.2, 0.05, { name: 'tamagaki', fine: true, solid: false });
      } else {
        T.post('cdVermilion', at, a, base, base + 1.2, 0.05, { name: 'tamagaki', fine: true, solid: false });
      }
    }
    if (axis === 'x') {
      T.box('cdVermilion', a0, at - 0.06, base + 1.05, a1, at + 0.06, base + 1.2, { name: 'tamagaki' });
    } else {
      T.box('cdVermilion', at - 0.06, a0, base + 1.05, at + 0.06, a1, base + 1.2, { name: 'tamagaki' });
    }
  }

  /* THE SACRED CEDAR, older than the shrine, roped. */
  const Sb = SHINBOKU;
  T.ring('cdRope', Sb.px, Sb.py, base + 2.2, Sb.r + 0.12, 0.14);
  T.ring('cdRope', Sb.px, Sb.py, base + 2.5, Sb.r + 0.1, 0.1);
  for (let i = 0; i < 6; i += 1) {
    const d = [[1, 0], [0.5, 0.87], [-0.5, 0.87], [-1, 0], [-0.5, -0.87], [0.5, -0.87]][i];
    shide(T, Sb.px + d[0] * (Sb.r + 0.2), Sb.py + d[1] * (Sb.r + 0.2), base + 2.1, i % 2 ? 'x' : 'y');
  }
  T.box('cdStoneDark', Sb.px - 2.4, Sb.py - 2.4, base, Sb.px + 2.4, Sb.py - 2.2, base + 0.5, { name: 'curb' });
  T.box('cdStoneDark', Sb.px - 2.4, Sb.py + 2.2, base, Sb.px + 2.4, Sb.py + 2.4, base + 0.5, { name: 'curb' });
  T.box('cdStoneDark', Sb.px - 2.4, Sb.py - 2.2, base, Sb.px - 2.2, Sb.py + 2.2, base + 0.5, { name: 'curb' });
  T.box('cdStoneDark', Sb.px + 2.2, Sb.py - 2.2, base, Sb.px + 2.4, Sb.py + 2.2, base + 0.5, { name: 'curb' });

  /* THE WATER PAVILION (chozuya) on the west side of the path: a stone
   * basin under a roof on four posts, the dipper laid across it. */
  const C = { x0: 13.5, x1: 17.5, y0: 199, y1: 202 };
  for (const [px, py] of [[C.x0, C.y0], [C.x1, C.y0], [C.x0, C.y1], [C.x1, C.y1]]) {
    T.post('cdShrineWood', px, py, base, base + 2.5, 0.1, { name: 'chozuya post' });
  }
  T.gable('cdKawara', 'x', C.y0 - 0.6, C.y1 + 0.6, base + 2.5, base + 3.5, C.x0 - 0.5, C.x1 + 0.5, 0.16, 3, 'chozuya roof');
  T.box('cdStone', C.x0 + 0.6, C.y0 + 0.5, base, C.x1 - 0.6, C.y1 - 0.5, base + 0.8, { name: 'basin' });
  T.paint('cdWater', C.x0 + 0.75, C.y0 + 0.65, base + 0.8, C.x1 - 0.75, C.y1 - 0.65, base + 0.81);
  T.cyl('cdBamboo', [C.x0 + 1.0, (C.y0 + C.y1) / 2, base + 0.84], [C.x1 - 1.0, (C.y0 + C.y1) / 2, base + 0.84], 0.03, 5, null, true);
  /* A rack of wooden prayer plaques (ema) on the east side. */
  T.post('cdShrineWood', 42, 201, base, base + 1.8, 0.06, { name: 'ema rack' });
  T.post('cdShrineWood', 46, 201, base, base + 1.8, 0.06, { name: 'ema rack' });
  T.box('cdShrineWood', 41.9, 200.9, base + 1.55, 46.1, 201.1, base + 1.65, { name: 'ema rack' });
  T.gable('cdKawara', 'x', 200.4, 201.6, base + 1.8, base + 2.15, 41.6, 46.4, 0.1, 2, 'ema roof');
  for (let px = 42.3; px < 45.8; px += 0.3) {
    T.paint(px % 0.9 < 0.3 ? 'cdShoji' : 'cdShrineWood', px, 200.86, base + 0.9 + (px % 0.6), px + 0.24, 200.9, base + 1.08 + (px % 0.6), true);
  }
}

/* The forestry road: gravel through the plantations, from the car park's
 * east side across the stream and north to the plot's edge. */
function forestry(T) {
  const F = FORESTRY;
  T.paint('cdGravel', F.ex0, F.ey0, 0, F.x1, F.ey1, 0.02);
  T.paint('cdGravel', F.x0, F.y0, 0, F.x1, STREAM.y0 - 0.45, 0.02);
  T.paint('cdGravel', F.x0, STREAM.y1 + 0.45, 0, F.x1, F.y1, 0.02);
  const R = rng(0xf0e57);
  for (let i = 0; i < 40; i += 1) {
    const py = R.range(F.y0, F.y1 - 2);
    if (py > STREAM.y0 - 2 && py < STREAM.y1 + 2) {
      continue;
    }
    const left = R.chance(0.5);
    const px = left ? F.x0 + 0.2 : F.x1 - 1.4;
    T.paint('cdMoss', px, py, 0.02, px + 1.2, py + R.range(1, 4), 0.026, true);
  }
  /* A gate across the road where it leaves the car park, swung open. */
  T.post('cdTin', F.ex0 + 6, F.ey1 + 0.4, 0, 1.1, 0.06, { name: 'gate post' });
  T.cyl('cdSignRed', [F.ex0 + 6, F.ey1 + 0.4, 1.0], [F.ex0 + 8.5, F.ey1 + 3.6, 1.0], 0.05, 6);
  T.cap('cdSignRed', [F.ex0 + 6, F.ey1 + 0.4, 1.0], [F.ex0 + 8.5, F.ey1 + 3.6, 1.0], 0.05, { draw: false, name: 'gate bar', kind: 'pole' });
}

/* The forest floor where a pilot flies low: needle litter drifted along
 * the approach's edges, and ferns on both banks of the stream, away from
 * the bridges. Drawn only, and left off on Low. */
function understorey(T) {
  const R = rng(0xf3e7);
  for (let i = 0; i < 22; i += 1) {
    const side = i % 2 ? 1 : -1;
    const x = SANDO.px + side * R.range(1.9, 4.5);
    const y = R.range(SANDO.y0 + 2, STREAM.y0 - 3);
    T.paint('cdLitter', x - R.range(0.4, 1.2), y, 0.02, x + R.range(0.4, 1.2), y + R.range(1, 3.5), 0.03, true);
  }
  const bridges = [[RED_BRIDGE.x0 - 2, RED_BRIDGE.x1 + 2], [FOREST_BRIDGE.x0 - 2, FOREST_BRIDGE.x1 + 2]];
  for (let i = 0; i < 46; i += 1) {
    const x = R.range(2, W - 2);
    if (bridges.some(([a, b]) => x > a && x < b)) {
      continue;
    }
    const y = i % 2 ? STREAM.y0 - R.range(0.7, 1.1) : STREAM.y1 + R.range(0.7, 1.1);
    T.cone('cdFern', x, y, 0, R.range(0.45, 0.8), R.range(0.4, 0.7), 6, true);
  }
}

export function buildShrine(T) {
  approach(T);
  stream(T);
  understorey(T);
  terrace(T);
  shrine(T);
  forestry(T);
  /* What the forest keeps out of. The avenue's giants are planted on
   * purpose in the approach's margin (./forest.js), so the approach's own
   * clearing is wide enough to keep the wild trees off their line. */
  T.clearing(SANDO.px - 9.5, SANDO.y0 - 3, SANDO.px + 9.5, STREAM.y0, 0);
  T.clearing(0, STREAM.y0 - 1.2, W, STREAM.y1 + 1.2, 0);
  T.clearing(TERRACE.x0, TERRACE.y0, TERRACE.x1, 228, 1);
  T.clearing(HONDEN.x0 - 3, 226, HONDEN.x1 + 3, 230, 0);
  T.clearing(SHINBOKU.px - 3.5, SHINBOKU.py - 3.5, SHINBOKU.px + 3.5, SHINBOKU.py + 3.5, 0);
  T.clearing(FORESTRY.ex0, FORESTRY.ey0, FORESTRY.x1, FORESTRY.ey1, 1.2);
  T.clearing(FORESTRY.x0, FORESTRY.y0, FORESTRY.x1, FORESTRY.y1, 1.2);
}
