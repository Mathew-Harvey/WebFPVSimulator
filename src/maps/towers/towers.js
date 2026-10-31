/*
 * towers.js: the towers of Kumoi Towers, each after a real kind of tower
 * and none of them a copy of one. Pure, as ./frame.js is: what is solid
 * (each block's box, hidden), what is drawn over it (./facade.js paints
 * the skin, ./index.js the roofs and the round things) and where the
 * named gaps between them are.
 *
 * THE KINDS, and the real measures each is held to:
 *   THE HALL, after the twin crowned city halls of the 1990s (Tokyo's is
 *     243 m, 48 floors, and splits into two towers at its 33rd floor, about
 *     160 m up): a podium, a body to 160 m, and two towers on it to 243 m
 *     with 22 m of sky between them.
 *   THE SKY GARDEN, after the paired towers joined at the top by a ring
 *     deck (Osaka's Umeda Sky Building is 173 m, 40 floors, its towers
 *     about 50 m apart centre to centre, the deck two floors deep with a
 *     round opening over the gap): two towers of 173 m, a bridge at 72 m,
 *     two escalator tubes across the gap and the garden deck with its hole.
 *   THE STEPPED TOWER, after the three stepped blocks under glass pyramids
 *     of the early 1990s (Shinjuku Park Tower is 235 m, its blocks stepping
 *     down to about 190 m): three blocks of 235, 210 and 186 m.
 *   THE HOTEL SLAB, after the first generation of Japanese high rise (the
 *     Keio Plaza is 178 m and 47 floors): a slab of 178 m on a low wing.
 *   THE SLOT, two office slabs of 212 and 226 m with 8 m between them, the
 *     kind of service gap two towers on one superblock leave.
 * Office floors are 4.0 m and a bay 3.2 m, the usual Japanese grid; the
 * hotel's are 3.4 m (the Keio Plaza's 178 m over 47 floors is 3.8 m with
 * its plant, 3.4 m a guest floor).
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

import { block as plotBlock } from './streets.js';

/* A plan rectangle. */
const R = (x0, y0, x1, y1) => ({ x0, y0, x1, y1 });

/* ---- the roofs, the same furniture on every tower ---- */

/* A tower's roof: the slab, its parapet (solid, so a pilot can perch on
 * it), and the plant a roof carries: boxed units, a cooling tower or two,
 * the window cleaning rig's rail round the edge, and a red light on each
 * corner. */
function roof(T, r, h, seed, opts = {}) {
  const { x0, y0, x1, y1 } = r;
  T.box('twRoof', x0, y0, h, x1, y1, h + 0.4, { name: 'roof' });
  const p = 0.5;
  T.box('twParapet', x0, y0, h + 0.4, x1, y0 + p, h + 1.5, { name: 'parapet' });
  T.box('twParapet', x0, y1 - p, h + 0.4, x1, y1, h + 1.5, { name: 'parapet' });
  T.box('twParapet', x0, y0 + p, h + 0.4, x0 + p, y1 - p, h + 1.5, { name: 'parapet' });
  T.box('twParapet', x1 - p, y0 + p, h + 0.4, x1, y1 - p, h + 1.5, { name: 'parapet' });
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const w = x1 - x0;
  const d = y1 - y0;
  if (opts.heli) {
    /* A helipad: the raised square deck, its yellow ring and its H. The
     * deck is solid, and the best place on the district to start a dive. */
    const s = Math.min(w, d) * 0.36;
    T.box('twHeliPad', cx - s, cy - s, h + 0.4, cx + s, cy + s, h + 1.2, { name: 'helipad' });
    T.dress(() => T.wide(() => {
      T.paint('twHeli', cx - s + 0.4, cy - s + 0.4, h + 1.2, cx + s - 0.4, cy - s + 0.7, h + 1.21);
      T.paint('twHeli', cx - s + 0.4, cy + s - 0.7, h + 1.2, cx + s - 0.4, cy + s - 0.4, h + 1.21);
      T.paint('twHeli', cx - s + 0.4, cy - s + 0.4, h + 1.2, cx - s + 0.7, cy + s - 0.4, h + 1.21);
      T.paint('twHeli', cx + s - 0.7, cy - s + 0.4, h + 1.2, cx + s - 0.4, cy + s - 0.4, h + 1.21);
      const k = s * 0.45;
      T.paint('white', cx - k, cy - k, h + 1.2, cx - k + 0.8, cy + k, h + 1.215);
      T.paint('white', cx + k - 0.8, cy - k, h + 1.2, cx + k, cy + k, h + 1.215);
      T.paint('white', cx - k, cy - 0.4, h + 1.2, cx + k, cy + 0.4, h + 1.215);
    }));
  } else {
    /* The plant: two rows of units and a pair of round cooling towers. */
    T.box('acUnit', cx - w * 0.3, cy - d * 0.3, h + 0.4, cx - w * 0.05, cy - d * 0.12, h + 2.6, { name: 'roof plant' });
    T.box('acUnit', cx + w * 0.05, cy + d * 0.08, h + 0.4, cx + w * 0.32, cy + d * 0.3, h + 3.2, { name: 'roof plant' });
    T.box('twRoofDark', cx - w * 0.2, cy + d * 0.12, h + 0.4, cx - w * 0.02, cy + d * 0.34, h + 5.0, { name: 'lift motor room' });
    for (const s of [-1, 1]) {
      const tx = cx + s * w * 0.18;
      const ty = cy - d * 0.05;
      T.post('tank', tx, ty, h + 0.4, h + 3.4, 1.4, { name: 'cooling tower' });
      T.dress(() => T.wide(() => {
        T.disc('twGirder', tx, ty, 1.1, h + 3.4, h + 3.5, 12, true);
        T.cyl('metalDark', [tx, ty, h + 3.5], [tx, ty, h + 3.7], 0.7, 10, null, true);
      }));
    }
  }
  /* The window cleaning rig's rail just inside the parapet, and the rig
   * itself parked on it, its arm out over the edge. */
  T.dress(() => T.wide(() => {
    T.deco('metal', x0 + 1.0, y0 + 1.0, h + 0.4, x1 - 1.0, y0 + 1.25, h + 0.65, true);
    T.deco('metal', x0 + 1.0, y1 - 1.25, h + 0.4, x1 - 1.0, y1 - 1.0, h + 0.65, true);
  }));
  const gx = x0 + w * (0.25 + (seed % 5) * 0.1);
  T.box('white', gx - 1.2, y0 + 0.7, h + 0.65, gx + 1.2, y0 + 3.0, h + 2.4, { name: 'gondola rig' });
  T.cap('white', [gx, y0 + 1.8, h + 2.2], [gx, y0 - 2.4, h + 3.4], 0.18, { name: 'gondola arm' });
  T.dress(() => {
    T.cyl('rope', [gx, y0 - 2.4, h + 3.4], [gx, y0 - 2.4, h - 2.0], 0.02, 3);
    T.box('white', gx - 1.6, y0 - 2.9, h - 2.6, gx + 1.6, y0 - 1.9, h - 1.6, { solid: false });
  });
  /* The red lights on the corners, as the aviation rules ask of anything
   * this tall. */
  for (const [lx, ly] of [[x0 + 0.3, y0 + 0.3], [x1 - 0.3, y0 + 0.3], [x0 + 0.3, y1 - 0.3], [x1 - 0.3, y1 - 0.3]]) {
    T.ball('lampRed', lx, ly, h + 1.75, 0.22, true);
  }
}

/* A mast on a roof: a lattice drawn as a tapering cylinder, its rungs,
 * the red light on top. Solid as a pole. */
function mast(T, px, py, h, tall, r = 0.35) {
  T.post('mastWhite', px, py, h, h + tall, r, { name: 'antenna mast' });
  T.dress(() => T.wide(() => {
    for (let k = 1; k < 6; k += 1) {
      const z = h + (tall * k) / 6;
      T.cyl(k % 2 ? 'mastRed' : 'mastWhite', [px, py, z - tall / 12], [px, py, z], r + 0.06, 6, null, true);
    }
  }));
  T.ball('lampRed', px, py, h + tall + 0.25, 0.3, true);
}

/* The setback band where a tower steps in: a ledge a pilot can land on. */
function ledge(T, r, h, inset) {
  T.box('twRoof', r.x0, r.y0, h, r.x1, r.y1, h + 0.5, { name: 'setback' });
  T.box('twParapet', r.x0, r.y0, h + 0.5, r.x1, r.y0 + 0.3, h + 1.3, { name: 'setback rail' });
  T.box('twParapet', r.x0, r.y1 - 0.3, h + 0.5, r.x1, r.y1, h + 1.3, { name: 'setback rail' });
  T.box('twParapet', r.x0, r.y0, h + 0.5, r.x0 + 0.3, r.y1, h + 1.3, { name: 'setback rail' });
  T.box('twParapet', r.x1 - 0.3, r.y0, h + 0.5, r.x1, r.y1, h + 1.3, { name: 'setback rail' });
  return R(r.x0 + inset, r.y0 + inset, r.x1 - inset, r.y1 - inset);
}

/* A tower's foot: the lobby's glass to 8 m, then its own skin, so every
 * tower meets the street with a lit lobby rather than an office floor. */
function tower(T, style, r, h0, h1, seed, name) {
  T.block('lobby', r, h0, h0 + 8, seed, `${name} lobby`);
  T.block(style, r, h0 + 8, h1, seed + 3, name);
}

/* ---- THE HALL ---- */

export const HALL = (() => {
  const b = plotBlock(1, 2);
  const mid = (b.x0 + b.x1) / 2;
  return {
    podium: R(b.x0 + 4, b.y0 + 8, b.x1 - 4, b.y0 + 44),
    terrace: R(b.x0 + 4, b.y0, b.x1 - 4, b.y0 + 8),
    body: R(mid - 39, b.y0 + 38, mid + 39, b.y0 + 80),
    west: R(mid - 39, b.y0 + 42, mid - 11, b.y0 + 76),
    east: R(mid + 11, b.y0 + 42, mid + 39, b.y0 + 76),
    podiumH: 36,
    terraceH: 6.2,
    bodyH: 160,
    crownH: 222,
    topH: 243,
    mid,
  };
})();

function hall(T) {
  const H = HALL;
  /* The terrace the deck lands on, over an arcade of columns. */
  T.box('twStone', H.terrace.x0, H.terrace.y0, H.terraceH - 0.6, H.terrace.x1, H.terrace.y1, H.terraceH, { name: 'terrace' });
  T.box('twParapet', H.terrace.x0, H.terrace.y0, H.terraceH, H.terrace.x1, H.terrace.y0 + 0.3, H.terraceH + 1.1, { name: 'terrace rail' });
  for (let x = H.terrace.x0 + 2; x < H.terrace.x1 - 1; x += 7.6) {
    if (x > 211 && x < 239) {
      continue;
    }
    T.box('twStone', x - 0.5, H.terrace.y0 + 1, 0, x + 0.5, H.terrace.y0 + 2, H.terraceH - 0.6, { name: 'arcade column' });
  }
  /* The podium and its roof garden. */
  tower(T, 'granite', H.podium, 0, H.podiumH, 11, 'hall podium');
  T.box('twRoof', H.podium.x0, H.podium.y0, H.podiumH, H.podium.x1, H.podium.y1, H.podiumH + 0.4, { name: 'podium roof' });
  T.box('twParapet', H.podium.x0, H.podium.y0, H.podiumH + 0.4, H.podium.x1, H.podium.y0 + 0.5, H.podiumH + 1.5, { name: 'parapet' });
  for (let x = H.podium.x0 + 6; x < H.podium.x1 - 4; x += 10) {
    if (x > H.body.x0 - 4 && x < H.body.x1 + 4) {
      continue;
    }
    T.box('twHedge', x - 3, H.podium.y0 + 4, H.podiumH + 0.4, x + 3, H.podium.y0 + 6, H.podiumH + 1.3, { name: 'roof garden hedge' });
  }
  /* The body to 160 m. */
  tower(T, 'granite', H.body, 0, H.bodyH, 23, 'hall body');
  roof(T, H.body, H.bodyH, 4);
  /* The twin towers, each with a setback, a crown and its own roof: the
   * west one a helipad, the east one the masts. */
  for (const [r, heli, s] of [[H.west, true, 31], [H.east, false, 37]]) {
    T.block('granite', r, H.bodyH + 0.4, H.crownH, s, 'hall tower');
    const crown = ledge(T, r, H.crownH, 2.4);
    T.block('crown', crown, H.crownH + 0.5, H.topH, s + 1, 'hall crown');
    roof(T, crown, H.topH, s, { heli });
    if (!heli) {
      const cx = (crown.x0 + crown.x1) / 2;
      mast(T, cx - 4, (crown.y0 + crown.y1) / 2 + 3, H.topH + 0.4, 22);
      mast(T, cx + 5, (crown.y0 + crown.y1) / 2 - 4, H.topH + 0.4, 14, 0.28);
    }
  }
  /* The hall's name over the arcade, in the town's own sign hand. */
  T.plate('stationSign', 0, H.mid, H.podium.y0 - 0.02, 16, 22, 2.6, 's');
}

/* ---- THE SKY GARDEN ---- */

export const SKY = (() => {
  const b = plotBlock(0, 2);
  return {
    west: R(b.x0 + 16, b.y0 + 26, b.x0 + 50, b.y0 + 64),
    east: R(b.x0 + 84, b.y0 + 26, b.x0 + 118, b.y0 + 64),
    h: 173,
    deck0: 160,
    deck1: 167,
    bridge: { h0: 72, h1: 76, y0: b.y0 + 42, y1: b.y0 + 48 },
    hole: { px: b.x0 + 67, py: b.y0 + 45, r: 11 },
  };
})();

function skyGarden(T) {
  const S = SKY;
  for (const [r, s] of [[S.west, 41], [S.east, 43]]) {
    tower(T, 'glass', r, 0, S.deck0, s, 'sky tower');
  }
  /* The garden deck, the whole width of both towers, with its round
   * opening over the gap. Solid as strips a metre deep, each stopping at
   * the circle, so the hole is a hole for the physics too. */
  const { west: wr, east: er, deck0, deck1, hole } = S;
  const y0 = Math.min(wr.y0, er.y0);
  const y1 = Math.max(wr.y1, er.y1);
  T.block('glass', R(wr.x0, y0, wr.x1, y1), deck0, deck1, 47, 'garden deck');
  T.block('glass', R(er.x0, y0, er.x1, y1), deck0, deck1, 49, 'garden deck');
  for (let yy = y0; yy < y1; yy += 1) {
    const dy = Math.max(0, Math.min(Math.abs(yy - hole.py), Math.abs(yy + 1 - hole.py)) - 0);
    const near = yy <= hole.py && yy + 1 >= hole.py ? 0 : dy;
    const c = near < hole.r ? Math.sqrt(hole.r * hole.r - near * near) : 0;
    if (c <= 0) {
      T.box('twGlassRoof', wr.x1, yy, deck0, er.x0, yy + 1, deck1, { name: 'garden deck' });
    } else {
      T.box('twGlassRoof', wr.x1, yy, deck0, hole.px - c, yy + 1, deck1, { name: 'garden deck' });
      T.box('twGlassRoof', hole.px + c, yy, deck0, er.x0, yy + 1, deck1, { name: 'garden deck' });
    }
  }
  /* The rim of the opening, and the deck's own roof walk. */
  T.disc('twParapet', hole.px, hole.py, hole.r + 0.6, deck1, deck1 + 1.2, 40);
  T.disc('twGlassRoof', hole.px, hole.py, hole.r, deck1 - 0.1, deck1 + 1.3, 40);
  T.box('twRoof', wr.x0, y0, deck1, er.x1, y0 + 4, deck1 + 0.4, { name: 'garden walk' });
  T.box('twRoof', wr.x0, y1 - 4, deck1, er.x1, y1, deck1 + 0.4, { name: 'garden walk' });
  T.box('twRoof', wr.x0, y0 + 4, deck1, wr.x1, y1 - 4, deck1 + 0.4, { name: 'garden roof' });
  T.box('twRoof', er.x0, y0 + 4, deck1, er.x1, y1 - 4, deck1 + 0.4, { name: 'garden roof' });
  T.box('twParapet', wr.x0, y0, deck1 + 0.4, er.x1, y0 + 0.4, deck1 + 1.6, { name: 'garden rail' });
  T.box('twParapet', wr.x0, y1 - 0.4, deck1 + 0.4, er.x1, y1, deck1 + 1.6, { name: 'garden rail' });
  /* The top floors over each tower's half, to 173 m. */
  for (const [r, s] of [[wr, 51], [er, 53]]) {
    const top = R(r.x0 + 3, r.y0 + 3, r.x1 - 3, r.y1 - 3);
    T.block('glass', top, deck1 + 0.4, S.h, s, 'garden top');
    roof(T, top, S.h, s, { heli: r === er });
  }
  /* The sky bridge at 72 m. */
  const B = S.bridge;
  T.box('twBridge', wr.x1, B.y0, B.h0, er.x0, B.y1, B.h0 + 0.8, { name: 'sky bridge' });
  T.box('glassBlue', wr.x1, B.y0, B.h0 + 0.8, er.x0, B.y0 + 0.2, B.h1, { name: 'sky bridge glass' });
  T.box('glassBlue', wr.x1, B.y1 - 0.2, B.h0 + 0.8, er.x0, B.y1, B.h1, { name: 'sky bridge glass' });
  T.box('twBridge', wr.x1, B.y0, B.h1, er.x0, B.y1, B.h1 + 0.6, { name: 'sky bridge roof' });
  /* The two escalator tubes, crossing the gap the other way to each other,
   * a glass tube on steel rings. Solid as capsules. */
  for (const [ya, yb, ha, hb] of [[S.west.y0 + 10, S.west.y0 + 14, 96, 112], [S.west.y1 - 10, S.west.y1 - 14, 112, 98]]) {
    T.cap('glassBlue', [wr.x1, ya, ha], [er.x0, yb, hb], 2.0, { name: 'escalator tube', seg: 12 });
    T.dress(() => T.wide(() => {
      for (let k = 1; k < 8; k += 1) {
        const t = k / 8;
        const px = wr.x1 + (er.x0 - wr.x1) * t;
        const py = ya + (yb - ya) * t;
        const hh = ha + (hb - ha) * t;
        const dx = er.x0 - wr.x1;
        const dy = yb - ya;
        T.cyl('twGirder', [px - dx * 0.004, py - dy * 0.004, hh - (hb - ha) * 0.004], [px + dx * 0.004, py + dy * 0.004, hh + (hb - ha) * 0.004], 2.12, 12, null, true);
      }
    }));
  }
}

/* ---- THE STEPPED TOWER ---- */

export const STEPPED = (() => {
  const b = plotBlock(0, 1);
  return [
    { r: R(b.x0 + 12, b.y0 + 10, b.x0 + 54, b.y0 + 54), h: 235, style: 'grid' },
    { r: R(b.x0 + 54, b.y0 + 22, b.x0 + 92, b.y0 + 64), h: 210, style: 'grid' },
    { r: R(b.x0 + 92, b.y0 + 34, b.x0 + 124, b.y0 + 72), h: 186, style: 'grid' },
  ];
})();

function stepped(T) {
  STEPPED.forEach((s, i) => {
    tower(T, s.style, s.r, 0, s.h, 61 + i * 5, 'stepped tower');
    /* The glass pyramid on top, its solid stepped inside it, and a ledge
     * round its foot. */
    const ins = ledge(T, s.r, s.h, 1.4);
    const top = 0.18 * Math.min(ins.x1 - ins.x0, ins.y1 - ins.y0);
    const apex = R((ins.x0 + ins.x1) / 2 - 1, (ins.y0 + ins.y1) / 2 - 1, (ins.x0 + ins.x1) / 2 + 1, (ins.y0 + ins.y1) / 2 + 1);
    T.frustum('twGlassRoof', ins, s.h + 0.5, apex, s.h + 0.5 + top * 2.2);
    T.frustumSolid(ins, s.h + 0.5, apex, s.h + 0.5 + top * 2.2, 6, 'pyramid');
    T.ball('lampRed', (ins.x0 + ins.x1) / 2, (ins.y0 + ins.y1) / 2, s.h + 0.7 + top * 2.2, 0.3, true);
    /* Its glazing bars, up each slope. */
    T.dress(() => T.wide(() => {
      const cx = (ins.x0 + ins.x1) / 2;
      const cy = (ins.y0 + ins.y1) / 2;
      const hh = s.h + 0.5 + top * 2.2;
      for (const [ax, ay] of [[ins.x0, ins.y0], [ins.x1, ins.y0], [ins.x0, ins.y1], [ins.x1, ins.y1]]) {
        T.cyl('twGirder', [ax, ay, s.h + 0.5], [cx, cy, hh], 0.12, 4, null, true);
      }
    }));
  });
}

/* ---- THE HOTEL SLAB ---- */

export const HOTEL = (() => {
  const b = plotBlock(0, 0);
  return {
    slab: R(b.x0 + 22, b.y1 - 32, b.x0 + 112, b.y1 - 8),
    wing: R(b.x0 + 22, b.y1 - 58, b.x0 + 72, b.y1 - 32),
    h: 178,
    wingH: 30,
  };
})();

function hotel(T) {
  const H = HOTEL;
  tower(T, 'ribbon', H.slab, 0, H.h, 71, 'hotel');
  roof(T, H.slab, H.h, 7);
  tower(T, 'ribbon', H.wing, 0, H.wingH, 73, 'hotel wing');
  roof(T, H.wing, H.wingH, 3);
  /* The porte cochere: a flat canopy on four columns over the drive. */
  const cx = (H.slab.x0 + H.slab.x1) / 2 + 18;
  T.box('twParapet', cx - 9, H.slab.y0 - 9, 5.2, cx + 9, H.slab.y0, 5.9, { name: 'porte cochere' });
  for (const [px, py] of [[cx - 8, H.slab.y0 - 8], [cx + 8, H.slab.y0 - 8]]) {
    T.post('twStone', px, py, 0, 5.2, 0.35, { name: 'canopy column' });
  }
}

/* ---- THE SLOT ---- */

export const SLOT = (() => {
  const b = plotBlock(2, 1);
  return {
    a: { r: R(b.x0 + 12, b.y0 + 12, b.x0 + 56, b.y0 + 78), h: 212, style: 'dark' },
    b: { r: R(b.x0 + 64, b.y0 + 8, b.x0 + 114, b.y0 + 72), h: 226, style: 'glass' },
    link: { h0: 150, h1: 155 },
  };
})();

function slot(T) {
  for (const [t, s] of [[SLOT.a, 81], [SLOT.b, 83]]) {
    tower(T, t.style, t.r, 0, t.h, s, 'slot tower');
    roof(T, t.r, t.h, s, { heli: t === SLOT.b });
  }
  /* A link bridge across the slot at 150 m, the only thing in it. */
  const a = SLOT.a.r;
  const b = SLOT.b.r;
  const ly0 = Math.max(a.y0, b.y0) + 26;
  T.box('twBridge', a.x1, ly0, SLOT.link.h0, b.x0, ly0 + 5, SLOT.link.h0 + 0.6, { name: 'slot link' });
  T.box('glassBlue', a.x1, ly0, SLOT.link.h0 + 0.6, b.x0, ly0 + 0.2, SLOT.link.h1, { name: 'slot link glass' });
  T.box('glassBlue', a.x1, ly0 + 4.8, SLOT.link.h0 + 0.6, b.x0, ly0 + 5, SLOT.link.h1, { name: 'slot link glass' });
  T.box('twBridge', a.x1, ly0, SLOT.link.h1, b.x0, ly0 + 5, SLOT.link.h1 + 0.5, { name: 'slot link roof' });
  SLOT.linkY = ly0 + 2.5;
}

export function towers(T) {
  hall(T);
  skyGarden(T);
  stepped(T);
  hotel(T);
  slot(T);
}
