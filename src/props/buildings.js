/*
 * buildings.js: the building and the bando, for built freestyle maps.
 *
 * Two assets, both made of boxes and so both facing one of the four compass
 * headings (see turns in ./catalog.js). Each is a pure layout, which says
 * what is solid, and a draw, which adds everything a pilot sees and cannot
 * hit. The layout is the contract with the physics; the draw is paint.
 *
 * THE LOOK IS THE TOWN'S. These are drawn out of the same palette and the
 * same cel materials as src/maps/city, with windows built as real frames and
 * glass rather than painted on, because the town's ink pass draws a line at
 * every step in depth and a frame standing 60 mm proud of a wall is what
 * gives a facade its drawn, anime background read. A texture of a window
 * has no depth and gets no line.
 *
 * WHAT MAKES A BUILDING FLYABLE, and every choice below serves one of these:
 *
 *   a roof you can land on     the body is one box, so its top is ground to
 *                              the plant, with a parapet round it to skim
 *   a line along the front     a block of flats has an open corridor on
 *                              every floor, 1.7 m of air between the railing
 *                              and the slab above: a balcony run
 *   a line through it          `passage` punches an arcade through the
 *                              ground floor, front to back
 *   things to clip             rooftop tanks, stair houses, fins, signs
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

import { Parts, GAP_MIN, seededRandom, seedOf } from './parts.js';
import { BUILDING_STYLES } from './types.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/* Storey height by style. A block of flats in this town is 2.9 m floor to
 * floor, an office has a ceiling void and is 3.6, a warehouse bay is 5. */
const FLOOR_H = { flats: 2.9, office: 3.6, warehouse: 5.0, shop: 3.0 };

/* The walls a style may wear, picked by the element's own seed so a street
 * of flats is not one colour. All of them are the town's. */
const WALLS = {
  flats: ['wallCream', 'wallBlue', 'wallPink', 'wallTea', 'wallSage', 'wallWhite'],
  office: ['concrete', 'wallGray', 'concreteMid'],
  warehouse: ['sheet', 'sheetBlue', 'sheetGreen'],
  shop: ['wallWhite', 'wallCream', 'wallTea'],
};

const SHOP_KINDS = ['conbini', 'ramen', 'bakery', 'hana', 'kosho', 'record', 'denki', 'sozai', 'cleaning', 'bunbo'];


/* Everything the layout and the draw both need, worked out once. */
function buildingSpec(el) {
  const d = el.dims;
  const style = BUILDING_STYLES.includes(el.style) ? el.style : 'flats';
  const fh = FLOOR_H[style];
  const W = clamp(d.width, 4, 120);
  const D = clamp(d.depth, 4, 120);
  const floors = Math.max(1, Math.round(d.floors));
  const H = floors * fh;
  const rng = seededRandom(seedOf(el));
  const wall = rng.pick(WALLS[style]);
  /* The arcade through the ground floor, front to back, or nothing. Never
   * narrower than the gap rule plus room to breathe, and never so wide that
   * a wall is thinner than a metre. */
  let pw = Number(d.passage) || 0;
  if (pw > 0) {
    pw = clamp(pw, GAP_MIN + 0.8, Math.max(GAP_MIN + 0.8, D - 2));
    if (pw > D - 2) {
      pw = 0;
    }
  }
  const ph = pw ? Math.min(H - 0.9, style === 'warehouse' ? fh * 0.9 : (floors >= 4 ? 2 * fh : fh) - 0.4) : 0;
  const parapet = style === 'warehouse' ? 0.55 : 1.0;
  const bayW = style === 'office' ? 3.0 : style === 'warehouse' ? 6.0 : 3.4;
  const bays = Math.max(1, Math.floor(D / bayW));
  return { style, fh, W, D, floors, H, wall, pw: pw > 0 && ph > GAP_MIN ? pw : 0, ph, parapet, bays, rng };
}

/*
 * THE LAYOUT. Front is +x, so the facade a pilot is meant to see first, with
 * its balconies and its door, faces the way the author pointed it.
 */
export function buildingLayout(el) {
  const s = buildingSpec(el);
  const { W, D, H, fh, floors, pw, ph, parapet, style } = s;
  const P = new Parts();
  const x0 = -W / 2;
  const x1 = W / 2;
  const z0 = -D / 2;
  const z1 = D / 2;

  /* The body. One box, so the roof is one surface the plant lands on. With
   * an arcade it is three: two piers either side of it and the storeys over
   * it, whose underside is the arcade's ceiling. */
  if (s.pw) {
    P.box(s.wall, x0, 0, z0, x1, ph, -s.pw / 2, { name: 'body' });
    P.box(s.wall, x0, 0, s.pw / 2, x1, ph, z1, { name: 'body' });
    P.box(s.wall, x0, ph, z0, x1, H, z1, { name: 'body' });
  } else {
    P.box(s.wall, x0, 0, z0, x1, H, z1, { name: 'body' });
  }

  /* The parapet, which is what turns a roof into a place: something to
   * skim, something to land inside, and an edge the ink draws. */
  const t = 0.22;
  const pm = style === 'warehouse' ? 'trim' : 'concreteMid';
  P.box(pm, x0, H, z0, x1, H + parapet, z0 + t, { name: 'parapet' });
  P.box(pm, x0, H, z1 - t, x1, H + parapet, z1, { name: 'parapet' });
  P.box(pm, x0, H, z0 + t, x0 + t, H + parapet, z1 - t, { name: 'parapet' });
  P.box(pm, x1 - t, H, z0 + t, x1, H + parapet, z1 - t, { name: 'parapet' });

  /* Rooftop furniture, placed by the seed, kept off the edges so a roof
   * still has somewhere flat to land. */
  const rng = seededRandom(seedOf(el) ^ 0x9e3779b9);
  if (style !== 'warehouse' && W >= 6 && D >= 6) {
    /* The stair house: the one tall thing on a flat roof. Landable. */
    const sx = rng.chance(0.5) ? x0 + t + 0.4 : x1 - t - 3.0;
    const sz = rng.chance(0.5) ? z0 + t + 0.4 : z1 - t - 2.8;
    P.box('concreteMid', sx, H, sz, sx + 2.6, H + 2.7, sz + 2.4, { name: 'stairHouse' });
    /* The water tank on its stand: an FRP panel tank, which is a box. */
    const tx = sx < 0 ? x1 - t - 2.8 : x0 + t + 0.6;
    const tz = -1.0;
    for (const [lx, lz] of [[0, 0], [2.2, 0], [0, 1.9], [2.2, 1.9]]) {
      P.post('metalDark', tx + lx, tz + lz, H, H + 0.8, 0.05, { name: 'tankLeg' });
    }
    P.box('tank', tx - 0.05, H + 0.8, tz - 0.05, tx + 2.25, H + 2.4, tz + 1.95, { name: 'tank' });
  }
  if (style === 'office' && W >= 8) {
    /* A plant room and a cooling tower. */
    P.box('concreteDark', -1.6, H, z0 + t + 0.6, 1.6, H + 2.2, z0 + t + 3.2, { name: 'plant' });
    P.box('metal', 1.9, H, z1 - t - 2.6, 3.8, H + 1.8, z1 - t - 0.7, { name: 'coolingTower' });
  }

  /* An aerial on the roof. Thin and solid: clipping it costs you. */
  if (style === 'flats' || style === 'shop') {
    const ax = clamp(rng.range(-W / 2 + 1, W / 2 - 1), x0 + 0.6, x1 - 0.6);
    P.post('metalDark', ax, z1 - t - 0.3, H + parapet, H + parapet + 2.4, 0.03, { name: 'aerial' });
    P.cap('metalDark', [ax - 0.6, H + parapet + 2.1, z1 - t - 0.3], [ax + 0.6, H + parapet + 2.1, z1 - t - 0.3], 0.02, { name: 'aerialBar' });
  }

  /* ---- the front ---- */
  if (style === 'flats') {
    /*
     * THE OPEN CORRIDOR. Every Japanese block of flats has one: a slab out
     * past the front wall on every floor, a solid parapet at its edge, and
     * the air between the parapet and the slab above. That air is 1.7 m at
     * 2.9 m a storey, over the gap rule, so a quad can fly the whole length
     * of every floor. The ends are open for the same reason.
     */
    const out = 1.25;
    for (let i = 1; i <= floors; i += 1) {
      const y = i * fh;
      P.box('concrete', x1, y - 0.16, z0 + 0.25, x1 + out, y, z1 - 0.25, { name: 'balconySlab' });
      if (i < floors) {
        P.box('balcony', x1 + out - 0.12, y, z0 + 0.25, x1 + out, y + 1.05, z1 - 0.25, { name: 'balconyWall' });
      }
    }
    /* The outdoor unit of every flat's air conditioner, on the corridor. A
     * quad running the corridor has to thread them. */
    for (let i = 1; i < floors; i += 1) {
      for (let b = 0; b < s.bays; b += 1) {
        if (!rng.chance(0.6)) {
          continue;
        }
        const zc = z0 + (b + 0.85) * (D / s.bays);
        if (zc > z1 - 1.0) {
          continue;
        }
        P.box('acUnit', x1 + 0.05, i * fh, zc - 0.4, x1 + 0.35, i * fh + 0.62, zc + 0.4, { name: 'acUnit' });
      }
    }
  } else if (style === 'office') {
    /* Fins at every bay, standing 0.45 m off the front: a rhythm of vertical
     * ink, and a comb a quad can weave. */
    for (let b = 0; b <= s.bays; b += 1) {
      const z = z0 + b * (D / s.bays);
      const za = clamp(z - 0.08, z0, z1);
      const zb = clamp(z + 0.08, z0, z1);
      P.box('concreteMid', x1, 0.6, za, x1 + 0.45, H, zb, { name: 'fin' });
    }
    /* The entrance canopy. */
    if (!s.pw) {
      P.box('concreteDark', x1, 3.0, -2.6, x1 + 2.6, 3.28, 2.6, { name: 'canopy' });
    }
  } else if (style === 'warehouse') {
    /* A loading canopy over the doors. */
    P.box('trim', x1, fh * 0.92, z0 + 0.8, x1 + 2.2, fh * 0.92 + 0.22, z1 - 0.8, { name: 'loadingCanopy' });
  } else if (style === 'shop') {
    /* The awning over the shopfront, and the fascia above it. */
    P.box('awning', x1, 2.55, z0 + 0.3, x1 + 1.3, 2.7, z1 - 0.3, { name: 'awning' });
    P.box('concreteMid', x1, 2.75, z0 + 0.1, x1 + 0.28, 3.55, z1 - 0.1, { name: 'fascia' });
    /* Small balconies on the flat over the shop. */
    for (let i = 1; i < floors; i += 1) {
      const y = i * fh;
      P.box('concrete', x1, y - 0.12, -1.6, x1 + 0.9, y, 1.6, { name: 'balconySlab' });
      P.box('balcony', x1 + 0.8, y, -1.6, x1 + 0.9, y + 1.0, 1.6, { name: 'balconyWall' });
    }
  }

  return P.list;
}

/* ------------------------------------------------------------------ *
 * The drawing. Everything here is paint: frames, glass, doors, signs,
 * pipes. Nothing a quad can hit is added here.
 * ------------------------------------------------------------------ */

/*
 * One window on a face, as a frame, a pane and a mullion. `face` names the
 * outward normal. `u` runs along the face, left to right seen from outside;
 * `y` is the centre height.
 */
function windowOn(K, face, planeAt, u, y, w, h, opts = {}) {
  const glass = opts.glass ?? 'glass';
  const frame = opts.frame ?? 'trim';
  const out = face[0] === '+' ? 1 : -1;
  const alongX = face[1] === 'z';
  const f = planeAt;
  /* frame proud of the wall, pane just behind the frame's face */
  const place = (du, dh, dn0, dn1, dy = 0, shift = 0) => {
    const c = u + shift;
    if (alongX) {
      return [c - du / 2, y + dy - dh / 2, f + out * dn0, c + du / 2, y + dy + dh / 2, f + out * dn1];
    }
    return [f + out * dn0, y + dy - dh / 2, c - du / 2, f + out * dn1, y + dy + dh / 2, c + du / 2];
  };
  K.box(frame, ...place(w + 0.16, h + 0.16, 0, 0.05));
  K.box(glass, ...place(w, h, 0.05, 0.07));
  if (opts.mullion !== false) {
    K.box(frame, ...place(0.06, h, 0.07, 0.1));
  }
  if (opts.sill !== false) {
    K.box(frame, ...place(w + 0.3, 0.07, 0, 0.14, -h / 2 - 0.1));
  }
  if (opts.curtain) {
    /* A curtain half drawn on one side: a flat pastel inside the pane. */
    K.box(opts.curtain, ...place(w * 0.3, h * 0.92, 0.071, 0.075, 0, -w * 0.33));
  }
}

const CURTAINS = ['curtainPink', 'curtainBlue', 'curtainCream', 'curtainGreen'];

/* A grid of windows over one face of a storey band. */
function windowRow(K, face, planeAt, uFrom, uTo, y, count, w, h, rng, opts = {}) {
  const span = uTo - uFrom;
  for (let i = 0; i < count; i += 1) {
    const u = uFrom + (i + 0.5) * (span / count);
    const lit = opts.litChance && rng.chance(opts.litChance);
    windowOn(K, face, planeAt, u, y, w, h, {
      ...opts,
      glass: lit ? 'glassLit' : (opts.glass ?? 'glass'),
      curtain: opts.curtains && rng.chance(0.55) ? rng.pick(CURTAINS) : null,
    });
  }
}

export function buildingDraw(el, parts, K) {
  const s = buildingSpec(el);
  const { W, D, H, fh, floors, style } = s;
  const rng = seededRandom(seedOf(el) ^ 0x51ed270b);
  const x0 = -W / 2;
  const x1 = W / 2;
  const z0 = -D / 2;
  const z1 = D / 2;

  /* A plinth and a band at every floor: the horizontal lines a drawn
   * building has and a plain box does not. */
  K.box('concreteDark', x0 - 0.06, 0, z0 - 0.06, x1 + 0.06, 0.45, z1 + 0.06);
  if (style !== 'warehouse') {
    for (let i = 1; i < floors; i += 1) {
      K.box('band', x0 - 0.04, i * fh - 0.1, z0 - 0.04, x1 + 0.04, i * fh + 0.06, z1 + 0.04);
    }
  }
  /* The coping on the parapet. */
  K.box('trim', x0 - 0.04, H + s.parapet, z0 - 0.04, x1 + 0.04, H + s.parapet + 0.08, z1 + 0.04);

  const rows = Math.max(1, s.bays);
  if (style === 'flats') {
    /* The front: a pair of sliding doors per flat behind the corridor, with
     * curtains, some lit. */
    for (let i = 1; i < floors; i += 1) {
      windowRow(K, '+x', x1, z0 + 0.4, z1 - 0.4, i * fh + 1.05, rows, 1.7, 1.9, rng,
        { curtains: true, litChance: 0.12, sill: false });
      /* The front door of every flat is on the corridor: a steel door. */
      for (let b = 0; b < rows; b += 1) {
        const zc = z0 + (b + 0.12) * (D / rows);
        K.box('door', x1, i * fh + 0.02, zc - 0.45, x1 + 0.06, i * fh + 2.02, zc + 0.45);
      }
    }
    /* Ground floor: the entrance and the post boxes. */
    K.box('glassDark', x1, 0.45, -1.2, x1 + 0.06, 2.6, 1.2);
    K.box('trim', x1, 2.6, -1.4, x1 + 0.08, 2.75, 1.4);
    K.box('concreteMid', x1, 2.75, -1.6, x1 + 1.4, 2.95, 1.6);
    /* The name plate. */
    K.sign('flatsName', x1 + 0.07, 2.2, 1.9, 1.4, 0.36, '+x', rng.int(0, 7));
    /* The back: smaller windows, a water heater on the wall. */
    for (let i = 0; i < floors; i += 1) {
      windowRow(K, '-x', x0, z0 + 0.5, z1 - 0.5, i * fh + 1.55, rows, 1.0, 0.9, rng,
        { curtains: true, litChance: 0.1 });
    }
    /* Sides: one window a floor. */
    for (let i = 0; i < floors; i += 1) {
      windowOn(K, '+z', z1, 0, i * fh + 1.5, 0.8, 0.9, {});
      windowOn(K, '-z', z0, 0, i * fh + 1.5, 0.8, 0.9, {});
    }
    /* A downpipe at each front corner. */
    K.cyl('metalDark', [x1 + 0.12, 0, z0 + 0.14], [x1 + 0.12, H, z0 + 0.14], 0.05, 6);
    K.cyl('metalDark', [x1 + 0.12, 0, z1 - 0.14], [x1 + 0.12, H, z1 - 0.14], 0.05, 6);
  } else if (style === 'office') {
    /* Ribbon glazing on every face, between the fins at the front. */
    for (let i = 0; i < floors; i += 1) {
      const yb = i * fh + 0.95;
      const yt = (i + 1) * fh - 0.45;
      for (const [face, at] of [['+x', x1], ['-x', x0]]) {
        const o = face[0] === '+' ? 1 : -1;
        K.box(i === 0 ? 'glassDark' : 'glassBlue', at, yb, z0 + 0.3, at + o * 0.05, yt, z1 - 0.3);
        for (let b = 1; b < rows; b += 1) {
          const z = z0 + b * (D / rows);
          K.box('metalDark', at, yb, z - 0.04, at + o * 0.08, yt, z + 0.04);
        }
      }
      for (const [face, at] of [['+z', z1], ['-z', z0]]) {
        const o = face[0] === '+' ? 1 : -1;
        K.box('glassBlue', x0 + 0.3, yb, at, x1 - 0.3, yt, at + o * 0.05);
      }
    }
    /* A company name on the roof edge. */
    K.sign('officeName', x1 + 0.12, H + 0.5, 0, Math.min(D * 0.7, 9), 0.9, '+x', rng.int(0, 5));
  } else if (style === 'warehouse') {
    /* Profiled cladding: vertical ribs on the long faces. */
    /* A rib every 0.9 m in the wall's own darker tone. Denser than this and
     * the ink pass turns a long face into moire at thirty metres. */
    const rib = `${s.wall}Rib`;
    const ribs = (face, at, from, to) => {
      const o = face[0] === '+' ? 1 : -1;
      const n = Math.floor((to - from) / 0.9);
      for (let i = 0; i <= n; i += 1) {
        const u = from + (i / Math.max(1, n)) * (to - from);
        if (face[1] === 'x') {
          K.box(rib, at, 0.45, u - 0.05, at + o * 0.06, H, u + 0.05);
        } else {
          K.box(rib, u - 0.05, 0.45, at, u + 0.05, H, at + o * 0.06);
        }
      }
    };
    ribs('+z', z1, x0 + 0.2, x1 - 0.2);
    ribs('-z', z0, x0 + 0.2, x1 - 0.2);
    ribs('-x', x0, z0 + 0.2, z1 - 0.2);
    /* Roller doors on the front, one per bay. */
    for (let b = 0; b < rows; b += 1) {
      const zc = z0 + (b + 0.5) * (D / rows);
      const dw = Math.min(4.2, D / rows - 1.2);
      K.box('shutter', x1, 0.02, zc - dw / 2, x1 + 0.08, fh * 0.82, zc + dw / 2);
      for (let k = 1; k < 8; k += 1) {
        const y = (k / 8) * fh * 0.82;
        K.box('shutterLight', x1 + 0.08, y - 0.03, zc - dw / 2, x1 + 0.1, y + 0.03, zc + dw / 2);
      }
      K.box('yellow', x1 + 0.1, 0.02, zc - dw / 2 - 0.2, x1 + 0.3, 1.1, zc - dw / 2 - 0.05);
    }
    /* A strip of high windows under the eaves. */
    K.box('glass', x0 + 0.5, H - 1.3, z1, x1 - 0.5, H - 0.6, z1 + 0.05);
    K.box('glass', x0 + 0.5, H - 1.3, z0 - 0.05, x1 - 0.5, H - 0.6, z0);
    /* Skylights on the roof. */
    for (let i = 0; i < 3; i += 1) {
      const xc = x0 + (i + 0.5) * (W / 3);
      K.box('glassBlue', xc - 1.0, H, -D / 4, xc + 1.0, H + 0.18, D / 4);
    }
    K.sign('warehouseName', x1 + 0.1, H - 1.2, 0, Math.min(D * 0.6, 12), 1.4, '+x', rng.int(0, 5));
  } else if (style === 'shop') {
    /* The shopfront: glass, a door, the town's own fascia painted on the
     * board the layout made solid. */
    K.box('glassShop', x1, 0.45, z0 + 0.4, x1 + 0.05, 2.45, z1 - 0.4);
    for (let k = 1; k < 4; k += 1) {
      const z = z0 + 0.4 + (k / 4) * (D - 0.8);
      K.box('trim', x1, 0.45, z - 0.04, x1 + 0.08, 2.45, z + 0.04);
    }
    const kind = rng.pick(SHOP_KINDS);
    K.townSign('shopFascia', kind, x1 + 0.29, 3.15, 0, D - 0.4, 0.74, '+x');
    if (kind === 'ramen') {
      /* The cloth in the doorway, which says ramen before the fascia does. */
      K.townSign('norenTex', 'ramen', x1 + 0.4, 2.1, 0, 1.6, 0.8, '+x');
    }
    /* Upstairs: windows. */
    for (let i = 1; i < floors; i += 1) {
      windowRow(K, '+x', x1, z0 + 0.5, z1 - 0.5, i * fh + 1.5, Math.max(1, Math.floor(D / 3)), 1.2, 1.2, rng,
        { curtains: true, litChance: 0.15 });
      windowRow(K, '-x', x0, z0 + 0.5, z1 - 0.5, i * fh + 1.5, Math.max(1, Math.floor(D / 3)), 1.0, 1.0, rng,
        { curtains: true });
    }
  }

  /* The arcade: a lit strip down its ceiling, so it reads as a way through
   * rather than a dark hole, and a darker lining. */
  if (s.pw) {
    K.box('concreteDark', x0 - 0.01, s.ph - 0.06, -s.pw / 2, x1 + 0.01, s.ph, s.pw / 2);
    K.box('lampGlow', x0 + 0.5, s.ph - 0.1, -0.12, x1 - 0.5, s.ph - 0.06, 0.12);
  }

  /* The water tank's panel seams. */
  for (const p of parts) {
    if (p.name === 'tank') {
      const [ax, ay, az] = p.lo;
      const [bx, by, bz] = p.hi;
      for (let k = 1; k < 4; k += 1) {
        const x = ax + (k / 4) * (bx - ax);
        K.box('tankSeam', x - 0.02, ay, az - 0.02, x + 0.02, by, bz + 0.02);
      }
      K.box('tankSeam', ax - 0.02, (ay + by) / 2 - 0.02, az - 0.02, bx + 0.02, (ay + by) / 2 + 0.02, bz + 0.02);
    }
    if (p.name === 'stairHouse') {
      const [ax, ay, az] = p.lo;
      const [bx, by, bz] = p.hi;
      /* A steel door on whichever face looks at the roof's middle. */
      const face = (ax + bx) / 2 < 0 ? bx : ax;
      const o = face === bx ? 1 : -1;
      K.box('door', face, ay, (az + bz) / 2 - 0.45, face + o * 0.05, ay + 2.0, (az + bz) / 2 + 0.45);
      K.box('trim', ax - 0.05, by, az - 0.05, bx + 0.05, by + 0.12, bz + 0.05);
    }
  }
}

/* ------------------------------------------------------------------ *
 * THE BANDO. A concrete frame somebody stopped building, or stopped
 * using: columns, floor slabs with whole bays missing, a stair core, walls
 * that are there in some bays and gone in others, and nothing in it. It is
 * the flagship of any freestyle map because every missing piece is a line:
 * in one side and out the other, up through a floor, down a stairwell.
 * ------------------------------------------------------------------ */

function bandoSpec(el) {
  const d = el.dims;
  const W = clamp(d.width, 8, 80);
  const D = clamp(d.depth, 8, 60);
  const floors = clamp(Math.round(d.floors), 1, 8);
  const fh = 3.4;
  const ruin = clamp(Number(d.ruin), 0, 1);
  /* Bays of about six metres, the span a flat slab of this age has. */
  const nx = Math.max(2, Math.round(W / 6));
  const nz = Math.max(2, Math.round(D / 6));
  return { W, D, floors, fh, ruin, nx, nz, bx: W / nx, bz: D / nz };
}

export function bandoLayout(el) {
  const s = bandoSpec(el);
  const { W, D, floors, fh, ruin, nx, nz, bx, bz } = s;
  const P = new Parts();
  const rng = seededRandom(seedOf(el));
  const x0 = -W / 2;
  const z0 = -D / 2;
  const col = 0.25;
  const slabT = 0.3;

  /* The stair core: one corner bay, solid, landable, and the one thing in
   * the frame that is always whole. */
  const coreI = rng.chance(0.5) ? 0 : nx - 1;
  const coreK = rng.chance(0.5) ? 0 : nz - 1;
  const cx0 = x0 + coreI * bx + 0.6;
  const cz0 = z0 + coreK * bz + 0.6;
  const coreH = floors * fh + 1.2;
  P.box('concreteWorn', cx0, 0, cz0, cx0 + Math.min(4.2, bx - 1.2), coreH, cz0 + Math.min(3.2, bz - 1.2), { name: 'core' });

  /* Columns on the grid. A few are gone above the first floor, which is
   * what a bando looks like, and never on the edge of the core. */
  for (let i = 0; i <= nx; i += 1) {
    for (let k = 0; k <= nz; k += 1) {
      const x = x0 + i * bx;
      const z = z0 + k * bz;
      const cxp = clamp(x, x0 + col, x0 + W - col);
      const czp = clamp(z, z0 + col, z0 + D - col);
      let top = floors * fh;
      if (floors > 1 && rng.chance(ruin * 0.25)) {
        top = fh * rng.int(1, floors - 1);
      }
      P.box('concreteWorn', cxp - col, 0, czp - col, cxp + col, top, czp + col, { name: 'column' });
    }
  }

  /*
   * THE FLOORS, bay by bay, with bays missing. The ground floor is the
   * ground. Every upper floor keeps at least half its bays so the building
   * still reads as a building, and a missing bay is a whole bay: six metres
   * of hole, far past the gap rule, so it is a dive and never a trap. The
   * roof loses more than the floors below it.
   */
  const holes = [];
  for (let f = 1; f <= floors; f += 1) {
    const y = f * fh;
    const loss = f === floors ? ruin * 0.8 : ruin * 0.45;
    for (let i = 0; i < nx; i += 1) {
      for (let k = 0; k < nz; k += 1) {
        const isCore = i === coreI && k === coreK;
        if (!isCore && rng.chance(loss)) {
          holes.push({ f, i, k });
          continue;
        }
        P.box('slab', x0 + i * bx, y - slabT, z0 + k * bz, x0 + (i + 1) * bx, y, z0 + (k + 1) * bz, { name: 'slab' });
      }
    }
  }

  /*
   * THE WALLS: block infill on the perimeter, bay by bay. Some bays are
   * open, some are walls with a window, and a window is at least 1.6 m by
   * 1.5 m so it is a way in. Never a wall on the ground floor of the bays
   * either side of the middle, so there is always a way into the frame at
   * ground level from the front and the back.
   */
  const wallT = 0.2;
  const faceBays = [
    { axis: 'x', at: z0 + wallT / 2, n: nx, span: bx, from: x0, name: 'wallS' },
    { axis: 'x', at: z0 + D - wallT / 2, n: nx, span: bx, from: x0, name: 'wallN' },
    { axis: 'z', at: x0 + wallT / 2, n: nz, span: bz, from: z0, name: 'wallW' },
    { axis: 'z', at: x0 + W - wallT / 2, n: nz, span: bz, from: z0, name: 'wallE' },
  ];
  for (let f = 0; f < floors; f += 1) {
    const y0 = f * fh;
    const y1 = (f + 1) * fh - slabT;
    for (const face of faceBays) {
      for (let b = 0; b < face.n; b += 1) {
        const mid = b === Math.floor(face.n / 2) || b === Math.floor((face.n - 1) / 2);
        if (f === 0 && mid) {
          continue;
        }
        const roll = rng.next();
        if (roll < 0.35 + ruin * 0.4) {
          continue;
        }
        const a0 = face.from + b * face.span + col;
        const a1 = face.from + (b + 1) * face.span - col;
        const holesIn = [];
        if (roll < 0.8) {
          const hw = Math.min(face.span - 2 * col - 1.2, rng.range(1.6, 2.6));
          const hc = (a0 + a1) / 2 + rng.range(-0.4, 0.4);
          holesIn.push({ from: hc - hw / 2, to: hc + hw / 2, y0: y0 + 0.9, y1: Math.min(y1 - 0.3, y0 + 0.9 + rng.range(1.5, 1.9)) });
        }
        /* A wall broken off partway up, on the top floor. */
        const top = f === floors - 1 && rng.chance(ruin) ? y0 + rng.range(1.0, 2.2) : y1;
        P.wall(rng.chance(0.3) ? 'blockDark' : 'block', {
          axis: face.axis, at: face.at, t: wallT, from: a0, to: a1, y0, y1: top, holes: holesIn,
        }, { name: face.name });
      }
    }
  }

  /* Rubble on the ground under the missing bays: low, solid, and a thing to
   * skim over. */
  for (const h of holes) {
    if (!rng.chance(0.5)) {
      continue;
    }
    const cx = x0 + (h.i + 0.5) * bx + rng.range(-1, 1);
    const cz = z0 + (h.k + 0.5) * bz + rng.range(-1, 1);
    const w = rng.range(1.2, 2.4);
    const d = rng.range(1.0, 2.0);
    P.box('rubble', cx - w / 2, 0, cz - d / 2, cx + w / 2, rng.range(0.3, 0.7), cz + d / 2, { name: 'rubble' });
  }
  return P.list;
}

export function bandoDraw(el, parts, K) {
  const s = bandoSpec(el);
  const rng = seededRandom(seedOf(el) ^ 0x2545f491);
  /*
   * REBAR, where a slab or a column ends in the air: thin rusty rods
   * standing out of broken edges. Paint, not solid, because a 12 mm bar is
   * below anything the contact model could fairly resolve, and a pilot
   * reading the picture will keep off it anyway.
   */
  for (const p of parts) {
    if (p.name === 'column' && p.hi[1] < s.floors * s.fh - 0.01) {
      const [ax, , az] = p.lo;
      const [bx, by, bz] = p.hi;
      for (const [x, z] of [[ax + 0.08, az + 0.08], [bx - 0.08, az + 0.08], [ax + 0.08, bz - 0.08], [bx - 0.08, bz - 0.08]]) {
        K.cyl('rust', [x, by, z], [x + rng.range(-0.15, 0.15), by + rng.range(0.4, 0.9), z + rng.range(-0.15, 0.15)], 0.012, 4);
      }
    }
    if (p.name === 'slab') {
      /* The slab's edge is darker than its top: a drawn slab has a line
       * and a shadow under its lip. */
      const [ax, ay, az] = p.lo;
      const [bx, , bz] = p.hi;
      K.box('concreteDark', ax, ay - 0.02, az, bx, ay, bz);
    }
    if ((p.name === 'wallS' || p.name === 'wallN' || p.name === 'wallW' || p.name === 'wallE') && rng.chance(0.28)) {
      /* Graffiti on the outside of a wall. */
      const [ax, ay, az] = p.lo;
      const [bx, by, bz] = p.hi;
      const h = Math.min(1.6, by - ay - 0.2);
      if (h < 0.6) {
        continue;
      }
      const alongX = p.name === 'wallS' || p.name === 'wallN';
      const out = p.name === 'wallS' || p.name === 'wallW' ? -1 : 1;
      const w = Math.min(alongX ? bx - ax : bz - az, 3.2);
      if (w < 1.2) {
        continue;
      }
      const cx = (ax + bx) / 2;
      const cz = (az + bz) / 2;
      const face = alongX ? (out > 0 ? '+z' : '-z') : (out > 0 ? '+x' : '-x');
      const at = alongX ? (out > 0 ? bz : az) : (out > 0 ? bx : ax);
      K.graffiti(face, alongX ? cx : at, ay + 0.2 + h / 2, alongX ? at : cz, w, h, rng.int(0, 999));
    }
  }
  /* Weeds on the ground floor and round the core: flat dark green patches. */
  for (let i = 0; i < 10; i += 1) {
    const x = rng.range(-s.W / 2, s.W / 2);
    const z = rng.range(-s.D / 2, s.D / 2);
    K.patch('weeds', x, 0.02, z, rng.range(0.6, 1.8), rng.int(0, 1000));
  }
}
