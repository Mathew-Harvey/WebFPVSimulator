/*
 * dress.js: Shiroyama FMX, drawn. Every solid in ./arena.js is draw: false,
 * and this paints the place over them from the same constants, in the
 * town's look: the town's cel materials and its shadow tint, the comic
 * pass's hatching on every face, the ink pass round every edge, and the
 * canvases of ./paint.js for everything printed. Browser only.
 *
 * ONE KIT, A FEW CHUNKS. Everything goes through the built map's kit
 * (src/props/kit.js), which bakes one batch a material a chunk, and the
 * place is filed into three chunks (the castle, the arena, and the arena's
 * furniture that never culls apart from it), so a draw call is a colour,
 * not a thing. A crowd of thousands is a strip of paint a row: two
 * triangles a section of seats, one material for every row on the map.
 *
 * WHAT LOW DROPS. On Low the scaffold's diagonal braces, the lantern
 * strings, the clods and the castle's corner stones are left out: detail a
 * phone cannot see, and triangles it should not pay for. Everything a quad
 * can hit is drawn on every preset.
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

import * as THREE from 'three';
import { cel, flat } from '../city/vendored/core/toon.js';
import {
  w, FIELD_W, ARENA, LANE_N, LANE_S, KICKER, LANDING, SET, SET_X, kickerAt, STAND, STANDS, treadH, STAND_POST_X, ROOF,
  YAGURA, SCREEN, BOOTH, TOWER_H, TOWER_HALF, LIGHT_TOWERS, CASTLE, KEEP, PIT_TENTS, WALL, bridgeAt, batter, PATH,
  LANTERNS, NOBORI_POLES, STALLS,
} from './arena.js';
import * as PAINT from './paint.js';

/* The chunks the place is filed under. */
export const CHUNK_CASTLE = 'fx-castle';
export const CHUNK_ARENA = 'fx-arena';
export const CHUNK_TOWN = 'fx-town';

/* Which chunk a world point is in, for the document's assets too. */
export function chunkOf(x, z) {
  const px = x + FIELD_W / 2;
  if (px < 90) {
    return CHUNK_CASTLE;
  }
  const py = -z + 230 / 2;
  return py > 52 && py < 168 && px < 300 ? CHUNK_ARENA : CHUNK_TOWN;
}

/* The town's shadow tint, and a darker one. */
const T = 0x6f6790;
const TD = 0x5c5680;

/* The show's colours, as the town's cel materials: shared and cached by
 * the toon kit, so nothing here owns them. */
function palette() {
  const c = (color, tint = T, bands = 3) => cel({ color, tint, bands });
  return {
    dirtDark: c(0x9a6e48, 0x5a4256),
    dirtLight: c(0xe0bd8e, 0x8a6a74),
    steel: c(0x6e7682, 0x4a4766),
    steelLight: c(0xb3bbc6, 0x6a6888),
    deck: c(0x8e949e, 0x5a5878),
    timber: c(0x8a6040, 0x4f3c50),
    timberDark: c(0x5a3c2c, 0x3a2c3c),
    plaster: c(0xf4f0e6, 0x8f88a8),
    board: c(0x34303a, 0x26222e),
    gold: c(0xe2b04a, 0x8a6a48),
    vermilion: c(0xe4472c, 0x7a3a5a),
    stoneTop: c(0xbab2a6, 0x6a6480),
    gravel: c(0xd6cdbb, 0x847c9c),
    seatRed: c(0xd8453d, 0x6e2f52),
    seatBlue: c(0x3d6fb8, 0x2e4a7a),
    seatWhite: c(0xeeeae2, 0x8f88a8),
    canvasWhite: c(0xf7f3ea, 0x938aa4),
    black: c(0x2a2730, 0x201e28),
    yellow: c(0xf2c230, 0x8a7050),
    lamp: flat({ color: 0xfff4d8 }),
    glass: flat({ color: 0x86abc9 }),
    glassDark: flat({ color: 0x3a4458 }),
  };
}

/*
 * A TRIANGLE SOUP: positions (and UVs when a texture needs them) a triangle
 * at a time, unindexed, so computeVertexNormals gives every face its own
 * normal, which is how the cel ramp wants a flat face. `two` adds each
 * triangle's back face too, for a roof seen from under its eaves.
 */
class Soup {
  constructor(two = false) {
    this.p = [];
    this.uv = [];
    this.two = two;
  }

  tri(a, b, c, ua = [0, 0], ub = [0, 0], uc = [0, 0]) {
    this.p.push(...a, ...b, ...c);
    this.uv.push(...ua, ...ub, ...uc);
    if (this.two) {
      this.p.push(...a, ...c, ...b);
      this.uv.push(...ua, ...uc, ...ub);
    }
  }

  /* a b c d anticlockwise seen from the front. */
  quad(a, b, c, d, ua, ub, uc, ud) {
    this.tri(a, b, c, ua, ub, uc);
    this.tri(a, c, d, ua, uc, ud);
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeVertexNormals();
    return g;
  }

  get empty() {
    return this.p.length === 0;
  }
}

/* A vertical plane in the plan from (ax, ay) to (bx, by), h0 to h1, its
 * front the side to the left of a to b, UVs given. */
function wallQuad(s, ax, ay, bx, by, h0, h1, u0, u1, v0, v1) {
  s.quad(w(ax, ay, h0), w(bx, by, h0), w(bx, by, h1), w(ax, ay, h1), [u0, v0], [u1, v0], [u1, v1], [u0, v1]);
}

function texMat(owned, canvasEl, opts = {}) {
  const t = new THREE.CanvasTexture(canvasEl);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  const m = opts.flat
    ? flat({ color: 0xffffff, map: t, alphaTest: opts.alphaTest ?? 0, side: opts.side ?? THREE.FrontSide, cache: false })
    : cel({ color: 0xffffff, map: t, bands: 3, tint: opts.tint ?? T, alphaTest: opts.alphaTest ?? 0, side: opts.side ?? THREE.FrontSide, cache: false });
  owned.textures.push(t);
  owned.materials.push(m);
  return m;
}

/*
 * Every painted material this map owns, made once a build: see ./paint.js.
 * Disposed with the map (./index.js).
 */
export function paintedMaterials() {
  const owned = { textures: [], materials: [] };
  const m = {
    boards: texMat(owned, PAINT.boardAtlas()),
    crowd: texMat(owned, PAINT.crowdStrip(3), { alphaTest: 0.5 }),
    crowdB: texMat(owned, PAINT.crowdStrip(17), { alphaTest: 0.5 }),
    screen: texMat(owned, PAINT.screenPanel(), { flat: true }),
    stone: texMat(owned, PAINT.stoneWall(), { tint: 0x6a6286 }),
    kohaku: texMat(owned, PAINT.kohaku()),
    nobori: texMat(owned, PAINT.noboriAtlas(), { side: THREE.DoubleSide }),
    tiles: texMat(owned, PAINT.roofTiles(), { tint: 0x3f5a68 }),
    dirt: texMat(owned, PAINT.dirtTile(), { tint: 0x6f5068 }),
    water: texMat(owned, PAINT.moatWater(), { flat: true }),
    plate: texMat(owned, PAINT.deckPlate(), { tint: 0x5a5878 }),
  };
  /* The floor is ground to the comic pass, for its stones and patches. */
  m.dirt.userData.comicGround = true;
  return { mats: m, owned };
}

/* ------------------------------------------------------------------ */

export function dress(kit, opts) {
  const P = palette();
  const M = opts.mats;
  const low = opts.quality === 'low';
  const H = new Hand(kit, P, M, low);
  kit.begin(0, 0, 0, 0, CHUNK_ARENA);
  H.floor();
  H.sets();
  H.barrier();
  H.stands();
  H.yagura();
  H.screen();
  H.booth();
  H.towers();
  H.path();
  H.pits();
  kit.begin(0, 0, 0, 0, CHUNK_CASTLE);
  H.castle();
  kit.begin(0, 0, 0, 0, CHUNK_ARENA);
}

/* The hand that draws: the kit, the palette and the paint, and a few
 * words for drawing in the plan. */
class Hand {
  constructor(kit, P, M, low) {
    this.k = kit;
    this.P = P;
    this.M = M;
    this.low = low;
  }

  /* A box in the plan. */
  box(mat, x0, y0, h0, x1, y1, h1) {
    const a = w(x0, y0, h0);
    const b = w(x1, y1, h1);
    this.k.box(mat, a[0], a[1], a[2], b[0], b[1], b[2]);
  }

  /* A tube in the plan. */
  tube(mat, ax, ay, ah, bx, by, bh, r, seg = 6) {
    this.k.cyl(mat, w(ax, ay, ah), w(bx, by, bh), r, seg);
  }

  add(mat, soup) {
    if (!soup.empty) {
      this.k.add(mat, soup.build());
    }
  }

  /* ---------------------------------------------------------------- */

  /* THE FLOOR: the dirt, stippled, with the riders' line worn darker into
   * it round the loop and a groomed edge along the barrier. */
  floor() {
    const { x0, x1, y0, y1 } = ARENA;
    const R = PAINT.DIRT_REPEAT_M;
    const s = new Soup();
    s.quad(w(x0, y0, 0.02), w(x1, y0, 0.02), w(x1, y1, 0.02), w(x0, y1, 0.02), [x0 / R, y0 / R], [x1 / R, y0 / R], [x1 / R, y1 / R], [x0 / R, y1 / R]);
    /* The riders' entry under the booth, the same dirt. */
    s.quad(w(BOOTH.x0 - 2, WALL.gateY0, 0.02), w(x0, WALL.gateY0, 0.02), w(x0, WALL.gateY1, 0.02), w(BOOTH.x0 - 2, WALL.gateY1, 0.02),
      [(BOOTH.x0 - 2) / R, WALL.gateY0 / R], [x0 / R, WALL.gateY0 / R], [x0 / R, WALL.gateY1 / R], [(BOOTH.x0 - 2) / R, WALL.gateY1 / R]);
    this.add(this.M.dirt, s);
    /* The worn line: two ruts round the loop, as a ribbon each. */
    const rut = new Soup();
    const { xw, xe, r } = { xw: 135, xe: 215, r: 12 };
    for (const off of [-0.55, 0.55]) {
      const pts = [];
      for (let i = 0; i <= 16; i += 1) {
        pts.push([xw + ((xe - xw) * i) / 16, LANE_N - off]);
      }
      for (let i = 1; i < 24; i += 1) {
        const a = Math.PI / 2 - (Math.PI * i) / 24;
        pts.push([xe + Math.cos(a) * (r - off), 110 + Math.sin(a) * (r - off)]);
      }
      for (let i = 0; i <= 16; i += 1) {
        pts.push([xe - ((xe - xw) * i) / 16, LANE_S + off]);
      }
      for (let i = 1; i < 24; i += 1) {
        const a = -Math.PI / 2 - (Math.PI * i) / 24;
        pts.push([xw + Math.cos(a) * (r - off), 110 + Math.sin(a) * (r - off)]);
      }
      for (let i = 0; i < pts.length; i += 1) {
        const [ax, ay] = pts[i];
        const [bx, by] = pts[(i + 1) % pts.length];
        const dx = bx - ax;
        const dy = by - ay;
        const l = Math.hypot(dx, dy) || 1;
        const nx = (-dy / l) * 0.22;
        const ny = (dx / l) * 0.22;
        rut.quad(w(ax - nx, ay - ny, 0.04), w(bx - nx, by - ny, 0.04), w(bx + nx, by + ny, 0.04), w(ax + nx, ay + ny, 0.04));
      }
    }
    /* Ensure the ribbons face up whichever way they were wound. */
    this.add(this.P.dirtDark, upward(rut));
    /* A groomed, lighter band inside the barrier, where nobody rides. */
    const band = new Soup();
    for (const [ax, ay, bx, by] of [[x0, y0, x1, y0 + 2.2], [x0, y1 - 2.2, x1, y1]]) {
      band.quad(w(ax, ay, 0.03), w(bx, ay, 0.03), w(bx, by, 0.03), w(ax, by, 0.03));
    }
    this.add(this.P.dirtLight, upward(band));
    if (!this.low) {
      /* Clods thrown off the turns. */
      let k = 0;
      for (const cx of [135, 215]) {
        for (let i = 0; i < 26; i += 1) {
          k += 1;
          const a = (i / 26) * Math.PI * 2;
          const rr = 14 + ((k * 37) % 50) / 10;
          const sx = cx < 175 ? -1 : 1;
          const px = cx + sx * Math.abs(Math.cos(a)) * rr;
          const py = 110 + Math.sin(a) * rr;
          const q = w(px, py, 0.06);
          this.k.blob(this.P.dirtDark, q, 0.12 + (k % 4) * 0.05, 0.08 + (k % 3) * 0.03, [0, k, 0]);
        }
      }
    }
  }

  /* THE SETS: each kicker's steel deck on its truss, the lip's hazard bar,
   * and each landing: the dirt deck and face over a timber cribbed wall. */
  sets() {
    const P = this.P;
    for (const [lane, x0, dir] of [[LANE_N, SET_X.n, 1], [LANE_S, SET_X.s, -1]]) {
      const at = (a) => x0 + dir * a;
      const kh = KICKER.half;
      /* The deck, a curved sheet across the kicker, in plate. */
      const deck = new Soup(true);
      const n = 14;
      for (let i = 0; i < n; i += 1) {
        const a0 = (KICKER.len * i) / n;
        const a1 = (KICKER.len * (i + 1)) / n;
        const h0 = kickerAt(a0) + 0.02;
        const h1 = kickerAt(a1) + 0.02;
        deck.quad(w(at(a0), lane - kh, h0), w(at(a1), lane - kh, h1), w(at(a1), lane + kh, h1), w(at(a0), lane + kh, h0),
          [0, a0 / 2], [0, a1 / 2], [2 * kh / 2, a1 / 2], [2 * kh / 2, a0 / 2]);
      }
      this.add(this.M.plate, deck);
      /* The side stringers following the curve, the posts and braces. */
      for (const side of [-1, 1]) {
        const y = lane + side * (kh - 0.06);
        for (let i = 0; i < n; i += 1) {
          const a0 = (KICKER.len * i) / n;
          const a1 = (KICKER.len * (i + 1)) / n;
          this.tube(P.steel, at(a0), y, kickerAt(a0) - 0.05, at(a1), y, kickerAt(a1) - 0.05, 0.07, 5);
        }
        this.tube(P.steel, at(0.3), y, 0.06, at(KICKER.len - 0.15), y, 0.06, 0.06, 5);
        for (let a = 1.6; a < KICKER.len; a += 1.35) {
          this.tube(P.steel, at(a), y, 0, at(a), y, kickerAt(a) - 0.05, 0.05, 5);
          if (!this.low && a + 1.35 < KICKER.len) {
            this.tube(P.steelLight, at(a), y, 0.1, at(a + 1.35), y, kickerAt(a + 1.35) - 0.12, 0.03, 4);
          }
        }
        this.tube(P.steel, at(KICKER.len - 0.15), y, 0, at(KICKER.len - 0.15), y, KICKER.lip - 0.05, 0.08, 6);
      }
      for (let a = 2.6; a < KICKER.len; a += 2.2) {
        this.tube(P.steel, at(a), lane - kh, kickerAt(a) - 0.12, at(a), lane + kh, kickerAt(a) - 0.12, 0.05, 5);
      }
      /* The lip: a yellow and black bar the rider aims at. */
      const lip = at(KICKER.len);
      this.box('hazard', lip - 0.09, lane - kh, KICKER.lip - 0.12, lip + 0.09, lane + kh, KICKER.lip + 0.04);
      /* The landing: deck and face, dirt over cribbing. */
      const lh = LANDING.half;
      const xs = at(SET.wall);
      const xk = at(SET.knuckle);
      const xe = at(SET.end);
      const top = new Soup();
      const R = PAINT.DIRT_REPEAT_M;
      const uvp = (x, y) => [x / R, y / R];
      const quadUp = (ax, bx, ha, hb) => {
        top.quad(w(ax, lane - lh, ha), w(bx, lane - lh, hb), w(bx, lane + lh, hb), w(ax, lane + lh, ha), uvp(ax, lane - lh), uvp(bx, lane - lh), uvp(bx, lane + lh), uvp(ax, lane + lh));
      };
      quadUp(xs, xk, LANDING.h + 0.02, LANDING.h + 0.02);
      quadUp(xk, xe, LANDING.h + 0.02, 0.03);
      this.add(this.M.dirt, upward(top));
      /* The knuckle's dark band and the groomed sweet spot. */
      const marks = new Soup();
      const band = (a0, a1, h0, h1) => marks.quad(w(at(a0), lane - lh + 0.3, h0), w(at(a1), lane - lh + 0.3, h1), w(at(a1), lane + lh - 0.3, h1), w(at(a0), lane + lh - 0.3, h0));
      band(SET.knuckle - 0.35, SET.knuckle + 0.35, LANDING.h + 0.05, LANDING.h + 0.05 - 0.6 * 0.35);
      this.add(P.dirtDark, upward(marks));
      /* The sides and the back: sleepers stacked, every one inked. */
      const sides = new Soup();
      for (const sy of [-1, 1]) {
        const y = lane + sy * lh;
        const prof = [[xs, 0], [xs, LANDING.h], [xk, LANDING.h], [xe, 0]];
        /* Two triangles fill the trapezoid under the face, one rect the
         * deck: drawn both ways, the side seen from either hand. */
        sides.quad(w(xs, y, 0), w(xk, y, 0), w(xk, y, LANDING.h), w(xs, y, LANDING.h), [0, 0], [1, 0], [1, 1], [0, 1]);
        sides.quad(w(xs, y, 0), w(xs, y, LANDING.h), w(xk, y, LANDING.h), w(xk, y, 0), [0, 0], [1, 0], [1, 1], [0, 1]);
        sides.tri(w(xk, y, 0), w(xe, y, 0), w(xk, y, LANDING.h));
        sides.tri(w(xk, y, 0), w(xk, y, LANDING.h), w(xe, y, 0));
        void prof;
      }
      sides.quad(w(xs, lane - lh, 0), w(xs, lane + lh, 0), w(xs, lane + lh, LANDING.h), w(xs, lane - lh, LANDING.h));
      sides.quad(w(xs, lane - lh, 0), w(xs, lane - lh, LANDING.h), w(xs, lane + lh, LANDING.h), w(xs, lane + lh, 0));
      this.add(P.timber, sides);
      /* The sleepers' lines on the back wall and the sides, darker. */
      for (let h = 0.5; h < LANDING.h; h += 0.5) {
        this.box(P.timberDark, xs - dir * 0.03, lane - lh - 0.02, h - 0.04, xs + dir * 0.0, lane + lh + 0.02, h + 0.02);
        for (const sy of [-1, 1]) {
          const y = lane + sy * (lh + 0.02);
          const xa = xs;
          const xb = h < LANDING.h ? xk + dir * ((LANDING.h - h) / LANDING.slope) : xk;
          this.box(P.timberDark, Math.min(xa, xb), y - 0.02, h - 0.04, Math.max(xa, xb), y + 0.02, h + 0.02);
        }
      }
      /* Posts holding the cribbing, every 1.5 m. */
      for (let yy = lane - lh; yy <= lane + lh + 1e-6; yy += (2 * lh) / 6) {
        this.box(P.timberDark, xs - dir * 0.18, yy - 0.09, 0, xs - dir * 0.02, yy + 0.09, LANDING.h + 0.15);
      }
    }
  }

  /* THE BARRIER: concrete blocks with a painted board on top, the board's
   * face to the floor from the atlas, a design a board. */
  barrier() {
    const { x0, x1, y0, y1 } = ARENA;
    const t = WALL.t;
    const P = this.P;
    const boards = new Soup();
    const N = PAINT.BOARD_ROWS;
    let k = 0;
    const run = (ax, ay, bx, by, inside) => {
      /* Concrete, and the board's back in canvas white. */
      this.box('concrete', Math.min(ax, bx) - (ay === by ? 0 : (inside > 0 ? t : 0)), Math.min(ay, by) - (ax === bx ? 0 : 0), 0, Math.max(ax, bx), Math.max(ay, by), 0.82);
      const len = Math.hypot(bx - ax, by - ay);
      const n = Math.max(1, Math.round(len / 6));
      for (let i = 0; i < n; i += 1) {
        const fa = i / n;
        const fb = (i + 1) / n;
        const pa = [ax + (bx - ax) * fa, ay + (by - ay) * fa];
        const pb = [ax + (bx - ax) * fb, ay + (by - ay) * fb];
        const row = (k * 3 + (k >> 2)) % N;
        k += 1;
        const v0 = 1 - (row + 1) / N;
        const v1 = 1 - row / N;
        wallQuad(boards, pa[0], pa[1], pb[0], pb[1], 0.86, WALL.h, 0, 1, v0, v1);
        /* A dark joint between the blocks. */
        this.box(P.black, pb[0] - 0.03, pb[1] - 0.03, 0, pb[0] + 0.03, pb[1] + 0.03, 0.82);
      }
    };
    /* Each run is wound so its painted side faces the floor. */
    run(x1, y0, x0, y0, 0);
    run(x0, y1, x1, y1, 0);
    run(x1, y1, x1, y0, 0);
    run(x0, y0, x0, WALL.gateY0, 0);
    run(x0, WALL.gateY1, x0, y1, 0);
    this.add(this.M.boards, boards);
    /* The concrete under the boards, the full thickness, and the boards'
     * white backs. */
    this.box('concrete', x0, y0 - t, 0, x1, y0, 0.82);
    this.box('concrete', x0, y1, 0, x1, y1 + t, 0.82);
    this.box('concrete', x1, y0 - t, 0, x1 + t, y1 + t, 0.82);
    this.box('concrete', x0 - t, y0 - t, 0, x0, WALL.gateY0, 0.82);
    this.box('concrete', x0 - t, WALL.gateY1, 0, x0, y1 + t, 0.82);
    this.box(P.canvasWhite, x0, y0 - t + 0.1, 0.82, x1, y0 - 0.02, WALL.h);
    this.box(P.canvasWhite, x0, y1 + 0.02, 0.82, x1, y1 + t - 0.1, WALL.h);
    this.box(P.canvasWhite, x1 + 0.02, y0 - t, 0.82, x1 + t - 0.1, y1 + t, WALL.h);
    this.box(P.canvasWhite, x0 - t + 0.1, y0 - t, 0.82, x0 - 0.02, WALL.gateY0, WALL.h);
    this.box(P.canvasWhite, x0 - t + 0.1, WALL.gateY1, 0.82, x0 - 0.02, y1 + t, WALL.h);
  }

  /* THE GRANDSTANDS: treads, risers and benches, a painted crowd standing
   * on every row, the scaffold under them, and on the north stand the
   * roof on its trusses. */
  stands() {
    const P = this.P;
    const { x0, x1, rows, rowD, slab } = STAND;
    const crowd = [new Soup(), new Soup()];
    const boards = new Soup();
    const CR = PAINT.CROWD_REPEAT_M;
    const N = PAINT.BOARD_ROWS;
    for (const S of STANDS) {
      const yAt = (k) => S.front + S.dir * k;
      /* The kickboard, painted. */
      this.box(P.board, x0, yAt(0), 0, x1, yAt(0.12), treadH(0));
      const fy = yAt(-0.01);
      for (let i = 0; i < 20; i += 1) {
        const xa = x0 + ((x1 - x0) * i) / 20;
        const xb = x0 + ((x1 - x0) * (i + 1)) / 20;
        const row = (i * 5 + (S.dir > 0 ? 1 : 4)) % N;
        const v0 = 1 - (row + 1) / N;
        const v1 = 1 - row / N;
        if (S.dir > 0) {
          wallQuad(boards, xa, fy, xb, fy, 0.15, treadH(0) - 0.1, 0, 1, v0, v1);
        } else {
          wallQuad(boards, xb, fy, xa, fy, 0.15, treadH(0) - 0.1, 0, 1, v0, v1);
        }
      }
      for (let i = 0; i < rows; i += 1) {
        const h = treadH(i);
        this.box(P.deck, x0, yAt(i * rowD), h - slab, x1, yAt((i + 1) * rowD), h);
        if (i > 0) {
          this.box(P.deck, x0, yAt(i * rowD), treadH(i - 1), x1, yAt(i * rowD + 0.06), h);
        }
        /* Benches in sections, an aisle every 30 m, the sections in the
         * show's colours, and the crowd standing at them. */
        for (let sec = 0; sec < 4; sec += 1) {
          const sa = x0 + sec * 30 + 0.8;
          const sb = sa + 28.4;
          const seat = (sec + (S.dir > 0 ? 0 : 1)) % 3 === 0 ? P.seatRed : ((sec % 3 === 1) ? P.seatBlue : P.seatWhite);
          this.box(seat, sa, yAt(i * rowD + 0.62), h, sb, yAt(i * rowD + 0.98), h + 0.42);
          /* The aisle's yellow nosing. */
          this.box(P.yellow, sb + 0.1, yAt(i * rowD), h, sb + 1.5, yAt(i * rowD + 0.08), h + 0.02);
          /* The crowd: a strip standing at the bench's front edge, its
           * face to the floor, each row starting at a different place on
           * the strip so no two rows match. */
          const y = yAt(i * rowD + 0.55);
          const u0 = ((i * 7 + sec * 3) % 10) / 10;
          const u1 = u0 + (sb - sa) / CR;
          const soup = crowd[(i + sec) % 2];
          if (S.dir > 0) {
            wallQuad(soup, sa, y, sb, y, h, h + 1.32, u0, u1, 0, 1);
          } else {
            wallQuad(soup, sb, y, sa, y, h, h + 1.32, u0, u1, 0, 1);
          }
        }
      }
      /* The back rail. */
      const back = yAt(rows * rowD);
      const top = treadH(rows - 1);
      this.box('scaffold', x0, back, top + 1.0, x1, yAt(rows * rowD + 0.08), top + 1.1);
      for (const x of STAND_POST_X) {
        this.tube('scaffold', x, back, top, x, back, top + 1.1, 0.03, 4);
      }
      /* The scaffold: posts where the solids are, ledgers along, transoms
       * across, and on the back face a brace every other bay. */
      const postRows = [1, 4, 7, 10].map((kk) => ({ y: yAt(Math.min(kk, rows) * rowD - 0.1), h: treadH(Math.min(kk, rows) - 1) - slab }));
      for (const pr of postRows) {
        for (const x of STAND_POST_X) {
          this.tube('scaffold', x, pr.y, 0, x, pr.y, pr.h, 0.05, 5);
        }
        for (const hh of [0.3, pr.h * 0.55]) {
          if (hh < pr.h - 0.2) {
            this.tube('scaffold', STAND_POST_X[0], pr.y, hh, STAND_POST_X[STAND_POST_X.length - 1], pr.y, hh, 0.035, 4);
          }
        }
      }
      for (const x of STAND_POST_X) {
        for (let r = 0; r < postRows.length - 1; r += 1) {
          const a = postRows[r];
          const b = postRows[r + 1];
          this.tube('scaffold', x, a.y, a.h * 0.55, x, b.y, a.h * 0.55, 0.03, 4);
        }
      }
      if (!this.low) {
        const pb = postRows[postRows.length - 1];
        for (let i = 0; i + 1 < STAND_POST_X.length; i += 2) {
          this.tube('scaffold', STAND_POST_X[i], pb.y, 0.3, STAND_POST_X[i + 1], pb.y, pb.h - 0.2, 0.03, 4);
        }
      }
      if (S.roof) {
        this.roof();
      }
    }
    this.add(this.M.crowd, crowd[0]);
    this.add(this.M.crowdB, crowd[1]);
    this.add(this.M.boards, boards);
  }

  /* The north stand's roof: a column at the back of each truss, the truss
   * cantilevered out over the rows, the sheet, and a painted fascia. */
  roof() {
    const P = this.P;
    const { x0, x1 } = STAND;
    for (const x of ROOF.colX) {
      this.box(P.steel, x - 0.25, ROOF.back - 0.25, 0, x + 0.25, ROOF.back + 0.25, ROOF.sheet);
      /* The truss: two chords and the web between them. */
      this.tube(P.steel, x, ROOF.front, ROOF.chordHi - 0.1, x, ROOF.back, ROOF.chordHi - 0.1, 0.14, 6);
      this.tube(P.steel, x, ROOF.front + 1, ROOF.chordLo + 0.1, x, ROOF.back, ROOF.chordLo + 0.1, 0.12, 6);
      const n = 8;
      for (let i = 0; i < n; i += 1) {
        const ya = ROOF.front + 1 + ((ROOF.back - ROOF.front - 1) * i) / n;
        const yb = ROOF.front + 1 + ((ROOF.back - ROOF.front - 1) * (i + 1)) / n;
        this.tube(P.steelLight, x, ya, ROOF.chordLo + 0.1, x, yb, ROOF.chordHi - 0.1, 0.05, 4);
        this.tube(P.steelLight, x, yb, ROOF.chordLo + 0.1, x, yb, ROOF.chordHi - 0.1, 0.05, 4);
      }
      this.tube(P.steel, x, ROOF.front, ROOF.chordHi - 0.1, x, ROOF.front + 1, ROOF.chordLo + 0.1, 0.1, 5);
    }
    /* Purlins along. */
    for (let y = ROOF.front + 1.5; y < ROOF.back; y += 3) {
      this.tube(P.steel, x0, y, ROOF.chordHi + 0.05, x1, y, ROOF.chordHi + 0.05, 0.06, 4);
    }
    this.box('sheetBlue', x0 - 1, ROOF.front - 0.5, ROOF.sheet, x1 + 1, ROOF.back + 0.6, ROOF.sheet + ROOF.sheetT);
    for (let x = x0; x < x1; x += 1.2) {
      this.box('sheetBlueRib', x, ROOF.front - 0.5, ROOF.sheet + ROOF.sheetT, x + 0.12, ROOF.back + 0.6, ROOF.sheet + ROOF.sheetT + 0.05);
    }
    /* The fascia along the front, painted. */
    const f = new Soup();
    const N = PAINT.BOARD_ROWS;
    const fy = ROOF.front - 0.52;
    for (let i = 0; i < 16; i += 1) {
      const xa = x0 - 1 + ((x1 - x0 + 2) * i) / 16;
      const xb = x0 - 1 + ((x1 - x0 + 2) * (i + 1)) / 16;
      const row = [0, 2, 4, 6][i % 4];
      wallQuad(f, xa, fy, xb, fy, ROOF.sheet - 1.1, ROOF.sheet + ROOF.sheetT, 0, 1, 1 - (row + 1) / N, 1 - row / N);
    }
    this.box(P.board, x0 - 1, fy, ROOF.sheet - 1.15, x1 + 1, fy + 0.08, ROOF.sheet + ROOF.sheetT);
    this.add(this.M.boards, f);
  }

  /* THE YAGURA: timber legs and their braces, the deck and its rail, the
   * kohaku skirt, the drum, the roof, and lanterns round the eaves and
   * strung out to the towers. */
  yagura() {
    const P = this.P;
    const { x, y, half, deckY, deckT, skirt, roofEave, roofPeak } = YAGURA;
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const lx = x + dx * (half - 0.15);
      const ly = y + dy * (half - 0.15);
      this.box(P.timber, lx - 0.15, ly - 0.15, 0, lx + 0.15, ly + 0.15, roofEave);
    }
    /* X braces on the four faces, under the skirt. */
    const top = deckY - skirt - 0.1;
    for (const [ax, ay, bx, by] of [[-1, -1, 1, -1], [-1, 1, 1, 1], [-1, -1, -1, 1], [1, -1, 1, 1]]) {
      const pa = [x + ax * (half - 0.15), y + ay * (half - 0.15)];
      const pb = [x + bx * (half - 0.15), y + by * (half - 0.15)];
      this.tube(P.timberDark, pa[0], pa[1], 0.4, pb[0], pb[1], top, 0.06, 4);
      this.tube(P.timberDark, pb[0], pb[1], 0.4, pa[0], pa[1], top, 0.06, 4);
    }
    this.box(P.timber, x - half, y - half, deckY, x + half, y + half, deckY + deckT);
    /* The skirt: the stripe outside and in. */
    const sk = new Soup();
    const s0 = deckY - skirt;
    const h = half;
    const t = 0.06;
    const U = (2 * h) / 2;
    /* Outside faces, anticlockwise from the south. */
    wallQuad(sk, x - h, y - h, x + h, y - h, s0, deckY, 0, U, 0, 1);
    wallQuad(sk, x + h, y - h, x + h, y + h, s0, deckY, 0, U, 0, 1);
    wallQuad(sk, x + h, y + h, x - h, y + h, s0, deckY, 0, U, 0, 1);
    wallQuad(sk, x - h, y + h, x - h, y - h, s0, deckY, 0, U, 0, 1);
    /* Inside faces. */
    const g = h - t;
    wallQuad(sk, x + g, y - g, x - g, y - g, s0, deckY, 0, U, 0, 1);
    wallQuad(sk, x + g, y + g, x + g, y - g, s0, deckY, 0, U, 0, 1);
    wallQuad(sk, x - g, y + g, x + g, y + g, s0, deckY, 0, U, 0, 1);
    wallQuad(sk, x - g, y - g, x - g, y + g, s0, deckY, 0, U, 0, 1);
    this.add(this.M.kohaku, sk);
    this.box(P.timberDark, x - h, y - h, s0 - 0.06, x + h, y + h, s0);
    /* The rail round the deck, and the roof's posts. */
    const ry = deckY + deckT;
    for (const [ax, ay, bx, by] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]]) {
      this.tube(P.vermilion, x + ax * (h - 0.1), y + ay * (h - 0.1), ry + 0.9, x + bx * (h - 0.1), y + by * (h - 0.1), ry + 0.9, 0.05, 5);
    }
    /* The drum on its stand, the drummer's two heads. */
    const dc = w(x, y, ry + 0.7);
    this.k.cyl(P.timber, [dc[0] - 0.6, dc[1], dc[2]], [dc[0] + 0.6, dc[1], dc[2]], 0.75, 12);
    this.k.cyl(P.canvasWhite, [dc[0] - 0.62, dc[1], dc[2]], [dc[0] - 0.6, dc[1], dc[2]], 0.68, 12);
    this.k.cyl(P.canvasWhite, [dc[0] + 0.6, dc[1], dc[2]], [dc[0] + 0.62, dc[1], dc[2]], 0.68, 12);
    this.box(P.timberDark, x - 0.5, y - 0.4, ry, x + 0.5, y + 0.4, ry - 0.0 + 0.1);
    /* The roof: a hipped cap on its eave slab. */
    const eo = h + 0.8;
    this.box(P.board, x - eo, y - eo, roofEave, x + eo, y + eo, roofEave + 0.18);
    const rf = new Soup(true);
    hip(rf, x, y, eo, eo, roofEave + 0.18, 0.6, roofPeak, PAINT.TILE_REPEAT_M);
    this.add(this.M.tiles, rf);
    this.k.blob(P.gold, w(x, y, roofPeak + 0.15), 0.3, 0.35, [0, 0, 0]);
    /* Lanterns round the eaves, and the strings out to the towers. */
    const lanterns = [];
    for (let i = 0; i < 12; i += 1) {
      const a = (i / 12) * Math.PI * 2;
      lanterns.push([x + Math.cos(a) * (eo - 0.2), y + Math.sin(a) * (eo - 0.2), roofEave - 0.5]);
    }
    if (!this.low) {
      for (const T of [[ARENA.x0 + 6, ARENA.y1 + 4], [ARENA.x1 - 6, ARENA.y1 + 4], [ARENA.x0 + 6, ARENA.y0 - 4], [ARENA.x1 - 6, ARENA.y0 - 4]]) {
        const ax = x + Math.sign(T[0] - x) * eo;
        const ay = y + Math.sign(T[1] - y) * eo;
        const ah = roofEave;
        const bh = 9;
        const n = 16;
        let prev = [ax, ay, ah];
        for (let i = 1; i <= n; i += 1) {
          const f = i / n;
          const sag = -2.2 * 4 * f * (1 - f);
          const q = [ax + (T[0] - ax) * f, ay + (T[1] - ay) * f, ah + (bh - ah) * f + sag];
          this.tube(P.black, prev[0], prev[1], prev[2], q[0], q[1], q[2], 0.015, 3);
          if (i < n && i % 2 === 0) {
            lanterns.push([q[0], q[1], q[2] - 0.4]);
          }
          prev = q;
        }
      }
    }
    for (const [lx, ly, lh] of lanterns) {
      this.box('drNoboriRed', lx - 0.2, ly - 0.2, lh - 0.32, lx + 0.2, ly + 0.2, lh + 0.32);
      this.box('drToriiBlack', lx - 0.14, ly - 0.14, lh + 0.32, lx + 0.14, ly + 0.14, lh + 0.42);
      this.box('drToriiBlack', lx - 0.14, ly - 0.14, lh - 0.42, lx + 0.14, ly + 0.14, lh - 0.32);
    }
    /* The stands' fronts strung with bunting in the show's colours. */
    const flags = ['mxOrange', 'white', 'drIndigo', 'drNoboriRed'];
    for (const S of STANDS) {
      const fy = S.front - S.dir * 0.2;
      for (let x0 = STAND.x0; x0 < STAND.x1; x0 += 10) {
        for (let i = 1; i < 10; i += 1) {
          const f = i / 10;
          const px = x0 + 10 * f;
          const ph = treadH(0) + 1.0 - 0.3 * 4 * f * (1 - f);
          const q = w(px, fy, ph);
          this.k.box(flags[i % flags.length], q[0] - 0.14, q[1] - 0.36, q[2] - 0.02, q[0] + 0.14, q[1], q[2] + 0.02);
        }
      }
    }
  }

  /* THE BIG SCREEN over the stage: the panel, its frame, the scaffold
   * behind it where the solids are, speaker stacks either side. */
  screen() {
    const P = this.P;
    const { x, y0, y1, z0, z1, t, stage } = SCREEN;
    this.box(P.board, x - t / 2, y0, z0, x + t / 2, y1, z1);
    const s = new Soup();
    const fx = x - t / 2 - 0.02;
    wallQuad(s, fx, y1 - 0.3, fx, y0 + 0.3, z0 + 0.3, z1 - 0.3, 0, 1, 0, 1);
    this.add(this.M.screen, s);
    for (const yy of [y0 + 0.4, y1 - 0.4]) {
      for (const xx of [x + 0.5, x + 3.2]) {
        this.tube('scaffold', xx, yy, stage.h, xx, yy, z1 + 0.5, 0.07, 5);
      }
      for (let hh = stage.h + 1.5; hh < z1; hh += 2) {
        this.tube('scaffold', x + 0.5, yy, hh, x + 3.2, yy, hh, 0.04, 4);
      }
      this.tube('scaffold', x + 0.5, yy, stage.h + 0.2, x + 3.2, yy, z1, 0.035, 4);
    }
    for (let hh = z0 + 1; hh < z1; hh += 3) {
      this.tube('scaffold', x + 3.2, y0 + 0.4, hh, x + 3.2, y1 - 0.4, hh, 0.04, 4);
    }
    /* The stage and its skirt. */
    this.box(P.deck, stage.x0, stage.y0, 0, stage.x1, stage.y1, stage.h);
    this.box(P.board, stage.x0 - 0.02, stage.y0, 0.05, stage.x0, stage.y1, stage.h - 0.05);
    /* Speaker stacks. */
    for (const yy of [stage.y0 + 1, stage.y1 - 3]) {
      this.box(P.black, stage.x0 + 1, yy, stage.h, stage.x0 + 3, yy + 2, stage.h + 3.2);
      for (let k = 0; k < 3; k += 1) {
        const c = w(stage.x0 + 0.98, yy + 1, stage.h + 0.6 + k * 1.0);
        this.k.cyl(P.steel, [c[0] - 0.02, c[1], c[2]], [c[0] + 0.02, c[1], c[2]], 0.38, 10);
      }
    }
  }

  /* THE COMMENTARY BOX over the riders' gate. */
  booth() {
    const P = this.P;
    const { x0, x1, y0, y1, legH, cabH } = BOOTH;
    for (const yy of [y0 + 0.3, WALL.gateY0 + 0.3, WALL.gateY1 - 0.3, y1 - 0.3]) {
      for (const xx of [x0 + 0.3, x1 - 0.3]) {
        this.tube('scaffold', xx, yy, 0, xx, yy, legH, 0.07, 5);
      }
    }
    this.box(P.deck, x0, y0, legH, x1, y1, legH + 0.25);
    this.box('wallWhite', x0, y0, legH + 0.25, x1 - 0.3, y1, legH + cabH);
    this.box(P.roofEdge ?? P.board, x0 - 0.5, y0 - 0.5, legH + cabH, x1 + 0.8, y1 + 0.5, legH + cabH + 0.3);
    /* Glass to the floor, its mullions. */
    const gs = new Soup();
    wallQuad(gs, x1 - 0.28, y0 + 0.5, x1 - 0.28, y1 - 0.5, legH + 1.1, legH + cabH - 0.3, 0, 1, 0, 1);
    this.add(P.glass, gs);
    for (let yy = y0 + 0.5; yy <= y1 - 0.5 + 1e-6; yy += 2.5) {
      this.box(P.board, x1 - 0.3, yy - 0.05, legH + 1.1, x1 - 0.24, yy + 0.05, legH + cabH - 0.3);
    }
    /* Its board on the roof's edge, painted. */
    const b = new Soup();
    const N = PAINT.BOARD_ROWS;
    wallQuad(b, x1 + 0.82, y0 + 3, x1 + 0.82, y1 - 3, legH + cabH + 0.3, legH + cabH + 1.6, 0, 1, 1 - 8 / N, 1 - 7 / N);
    this.add(this.M.boards, b);
    this.box(P.board, x1 + 0.7, y0 + 3, legH + cabH + 0.3, x1 + 0.8, y1 - 3, legH + cabH + 1.6);
  }

  /* THE FLOODLIGHT TOWERS: the lattice, a ladder up one face, the head and
   * its grid of lamps toward the floor. */
  towers() {
    const P = this.P;
    const h = TOWER_HALF;
    for (const T of LIGHT_TOWERS) {
      const c = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      for (const [dx, dy] of c) {
        this.tube(P.steel, T.x + dx * h, T.y + dy * h, 0, T.x + dx * h, T.y + dy * h, TOWER_H, 0.09, 6);
      }
      for (let z = 2.5; z < TOWER_H - 1; z += 2.5) {
        for (let i = 0; i < 4; i += 1) {
          const [ax, ay] = c[i];
          const [bx, by] = c[(i + 1) % 4];
          this.tube(P.steel, T.x + ax * h, T.y + ay * h, z, T.x + bx * h, T.y + by * h, z, 0.04, 4);
          if (!this.low) {
            this.tube(P.steelLight, T.x + ax * h, T.y + ay * h, z, T.x + bx * h, T.y + by * h, z + 2.5, 0.025, 3);
          }
        }
      }
      const sy = T.y > 110 ? -1 : 1;
      this.box(P.steel, T.x - 3.5, T.y + sy * 0.2, TOWER_H, T.x + 3.5, T.y + sy * 0.9, TOWER_H + 3.6);
      /* Lamps, a grid on the face to the floor. */
      const face = T.y + sy * 0.92;
      for (let i = 0; i < 6; i += 1) {
        for (let j = 0; j < 3; j += 1) {
          const lx = T.x - 3 + i * 1.2;
          const lh = TOWER_H + 0.5 + j * 1.15;
          this.box(P.lamp, lx - 0.42, face - 0.02, lh, lx + 0.42, face + 0.02 * sy, lh + 0.85);
        }
      }
      this.box(P.steelLight, T.x - 3.6, T.y - sy * 0.2, TOWER_H - 0.15, T.x + 3.6, T.y + sy * 1.4, TOWER_H);
    }
  }

  /* THE PATH from the bridge: gravel, stone lanterns, nobori, the stalls. */
  path() {
    const P = this.P;
    const g = new Soup();
    g.quad(w(PATH.x0, PATH.y0, 0.025), w(PATH.x1, PATH.y0, 0.025), w(PATH.x1, PATH.y1, 0.025), w(PATH.x0, PATH.y1, 0.025));
    this.add(P.gravel, upward(g));
    for (const yy of [PATH.y0, PATH.y1]) {
      this.box(P.stoneTop, PATH.x0, yy - 0.12, 0, BOOTH.x0 - 1, yy + 0.12, 0.14);
    }
    for (const l of LANTERNS) {
      const c = w(l.x, l.y, 0);
      this.k.box(P.stoneTop, c[0] - 0.4, 0, c[2] - 0.4, c[0] + 0.4, 0.3, c[2] + 0.4);
      this.k.cyl(P.stoneTop, [c[0], 0.3, c[2]], [c[0], 1.1, c[2]], 0.16, 6);
      this.k.box(P.stoneTop, c[0] - 0.36, 1.1, c[2] - 0.36, c[0] + 0.36, 1.2, c[2] + 0.36);
      this.k.box(P.stoneTop, c[0] - 0.28, 1.2, c[2] - 0.28, c[0] + 0.28, 1.62, c[2] + 0.28);
      this.k.box(P.lamp, c[0] - 0.29, 1.3, c[2] - 0.14, c[0] + 0.29, 1.52, c[2] + 0.14);
      this.k.cone(P.stoneTop, [c[0], 1.62, c[2]], 0.55, 0.42, 4);
      this.k.blob(P.stoneTop, [c[0], 2.1, c[2]], 0.11, 0.13, [0, 0, 0]);
    }
    /* The nobori: a pole, a cross arm and the banner on both. */
    const nb = new Soup(true);
    const NC = PAINT.NOBORI_COLS;
    for (const n of NOBORI_POLES) {
      this.tube(P.black, n.x, n.y, 0, n.x, n.y, 4.6, 0.04, 4);
      const across = n.y < 110 ? 1 : -1;
      void across;
      const u0 = n.k / NC;
      const u1 = (n.k + 1) / NC;
      wallQuad(nb, n.x + 0.06, n.y, n.x + 0.66, n.y, 1.4, 4.4, u0, u1, 0, 1);
      this.tube(P.black, n.x, n.y, 4.42, n.x + 0.7, n.y, 4.42, 0.02, 3);
    }
    this.add(this.M.nobori, nb);
    /* The stalls: a counter, posts, a striped canopy, lanterns. */
    for (const [x, y] of STALLS) {
      this.box(P.timber, x - 2.5, y - 1.5, 0, x + 2.5, y + 1.5, 1.0);
      this.box(P.canvasWhite, x - 2.5, y - 1.52, 1.0, x + 2.5, y + 1.52, 1.06);
      for (const [dx, dy] of [[-2.4, -1.4], [2.4, -1.4], [-2.4, 1.4], [2.4, 1.4]]) {
        this.tube(P.timberDark, x + dx, y + dy, 1, x + dx, y + dy, 2.4, 0.05, 4);
      }
      for (let i = 0; i < 8; i += 1) {
        this.box(i % 2 ? P.canvasWhite : P.vermilion, x - 2.9 + i * 0.725, y - 1.9, 2.4, x - 2.9 + (i + 1) * 0.725, y + 1.9, 2.6);
      }
      for (const dx of [-1.6, 0, 1.6]) {
        const yy = y > 110 ? y - 1.95 : y + 1.95;
        this.box('drNoboriRed', x + dx - 0.18, yy - 0.18, 1.8, x + dx + 0.18, yy + 0.18, 2.3);
      }
    }
  }

  /* THE PITS: tents in stripes, the riders' bikes on their stands. */
  pits() {
    const P = this.P;
    let k = 0;
    for (const [x0, y0] of PIT_TENTS) {
      for (const [xx, yy] of [[x0 + 0.15, y0 + 0.15], [x0 + 11.85, y0 + 0.15], [x0 + 0.15, y0 + 5.85], [x0 + 11.85, y0 + 5.85]]) {
        this.tube(P.steel, xx, yy, 0, xx, yy, 2.5, 0.05, 4);
      }
      for (let i = 0; i < 12; i += 1) {
        this.box(i % 2 ? P.canvasWhite : (k % 2 ? 'drIndigo' : P.vermilion), x0 + i, y0, 2.5, x0 + i + 1, y0 + 6, 2.75);
      }
      for (let b = 0; b < 3; b += 1) {
        const bx = x0 + 2.5 + b * 3.5;
        const by = y0 + 3;
        this.box(P.black, bx - 0.15, by - 0.3, 0, bx + 0.15, by + 0.3, 0.3);
        this.box(['mxOrange', P.canvasWhite, 'qbMint'][(b + k) % 3], bx - 0.12, by - 0.6, 0.55, bx + 0.12, by + 0.3, 0.9);
        for (const wy of [-0.75, 0.75]) {
          const c = w(bx, by + wy, 0.32);
          this.k.cyl('drTyre', [c[0] - 0.05, c[1], c[2]], [c[0] + 0.05, c[1], c[2]], 0.32, 10);
        }
      }
      k += 1;
    }
  }

  /* ---------------------------------------------------------------- */

  /* THE CASTLE: the ishigaki to its fan curve in coursed stone, the keep's
   * five tiers in white plaster over black boards, a skirt roof between
   * each, gables on the faces, the hipped top with its golden fish, the
   * moat, its wall, the red bridge and the gate. */
  castle() {
    const P = this.P;
    const { x, y, base, eaveOut, moat, bridge } = CASTLE;
    const SR = PAINT.STONE_REPEAT_M;
    /* The base: seven bands up each face, to the batter. */
    const st = new Soup();
    const bands = 7;
    const rectAt = (t) => {
      const u = batter(t);
      return [(base.w0 + (base.w1 - base.w0) * u) / 2, (base.d0 + (base.d1 - base.d0) * u) / 2, base.h * t];
    };
    for (let i = 0; i < bands; i += 1) {
      const [aw, ad, ah] = rectAt(i / bands);
      const [bw, bd, bh] = rectAt((i + 1) / bands);
      /* Four faces: south, east, north, west, each wound outward. */
      const faces = [
        [[x - aw, y - ad], [x + aw, y - ad], [x + bw, y - bd], [x - bw, y - bd]],
        [[x + aw, y - ad], [x + aw, y + ad], [x + bw, y + bd], [x + bw, y - bd]],
        [[x + aw, y + ad], [x - aw, y + ad], [x - bw, y + bd], [x + bw, y + bd]],
        [[x - aw, y + ad], [x - aw, y - ad], [x - bw, y - bd], [x - bw, y + bd]],
      ];
      for (const [p0, p1, p2, p3] of faces) {
        const along = (p) => (p[0] + p[1]) / SR;
        st.quad(w(p0[0], p0[1], ah), w(p1[0], p1[1], ah), w(p2[0], p2[1], bh), w(p3[0], p3[1], bh),
          [along(p0), ah / SR], [along(p1), ah / SR], [along(p2), bh / SR], [along(p3), bh / SR]);
      }
    }
    this.add(this.M.stone, st);
    /* The top of the base: the keep's court in gravel. */
    const [tw, td] = rectAt(1);
    const court = new Soup();
    court.quad(w(x - tw, y - td, base.h + 0.02), w(x + tw, y - td, base.h + 0.02), w(x + tw, y + td, base.h + 0.02), w(x - tw, y + td, base.h + 0.02));
    this.add(P.gravel, upward(court));
    /* A coping of capstones round the top edge. */
    this.box(P.stoneTop, x - tw, y - td, base.h - 0.2, x + tw, y - td + 0.5, base.h + 0.25);
    this.box(P.stoneTop, x - tw, y + td - 0.5, base.h - 0.2, x + tw, y + td, base.h + 0.25);
    this.box(P.stoneTop, x - tw, y - td, base.h - 0.2, x - tw + 0.5, y + td, base.h + 0.25);
    this.box(P.stoneTop, x + tw - 0.5, y - td, base.h - 0.2, x + tw, y + td, base.h + 0.25);
    if (!this.low) {
      /* The corner stones, long and short, up each corner's curve. */
      for (let i = 0; i < 11; i += 1) {
        const [cw, cd, ch] = rectAt((i + 0.5) / 11);
        const long = i % 2 === 0;
        for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
          const ax = x + sx * cw;
          const ay = y + sy * cd;
          const lx = long ? 1.6 : 0.8;
          const ly = long ? 0.8 : 1.6;
          this.box(P.stoneTop, ax - sx * lx, ay - sy * ly, ch - 0.5, ax + sx * 0.06, ay + sy * 0.06, ch + 0.5);
        }
      }
    }
    /* The keep. */
    KEEP.forEach((T, i) => {
      const hw = T.w / 2;
      const hd = T.d / 2;
      this.box(P.plaster, x - hw, y - hd, T.y0, x + hw, y + hd, T.y1);
      /* Black boards on the lower two tiers' lower half, battened. */
      if (i < 2) {
        const bt = T.y0 + (T.y1 - T.y0) * 0.5;
        this.box(P.board, x - hw - 0.05, y - hd - 0.05, T.y0, x + hw + 0.05, y + hd + 0.05, bt);
        this.box(P.plaster, x - hw - 0.08, y - hd - 0.08, bt - 0.12, x + hw + 0.08, y + hd + 0.08, bt);
      }
      /* Windows: a row a face, dark lattice in a white frame. */
      const wy = T.y0 + (T.y1 - T.y0) * (i < 2 ? 0.7 : 0.55);
      const along = (len) => Math.max(1, Math.floor(len / 3));
      for (const [axis, len, at, sgn] of [['x', T.w, y - hd, -1], ['x', T.w, y + hd, 1], ['y', T.d, x - hw, -1], ['y', T.d, x + hw, 1]]) {
        const n = along(len);
        for (let k = 0; k < n; k += 1) {
          const c = -len / 2 + (len * (k + 0.5)) / n;
          if (axis === 'x') {
            this.box(P.board, x + c - 0.5, at + sgn * 0.0, wy - 0.55, x + c + 0.5, at + sgn * 0.08, wy + 0.55);
            this.box(P.plaster, x + c - 0.62, at, wy - 0.68, x + c + 0.62, at + sgn * 0.05, wy - 0.55);
          } else {
            this.box(P.board, at, y + c - 0.5, wy - 0.55, at + sgn * 0.08, y + c + 0.5, wy + 0.55);
            this.box(P.plaster, at, y + c - 0.62, wy - 0.68, at + sgn * 0.05, y + c + 0.62, wy - 0.55);
          }
        }
      }
      const next = KEEP[i + 1];
      const ow = hw + eaveOut;
      const od = hd + eaveOut;
      const rf = new Soup(true);
      if (next) {
        skirt(rf, x, y, ow, od, T.y1 - 0.75, next.w / 2, next.d / 2, T.y1 + 1.1, PAINT.TILE_REPEAT_M);
        /* The eave's white plaster edge, and the corners turned up. */
        this.box(P.plaster, x - ow, y - od, T.y1 - 0.95, x + ow, y + od, T.y1 - 0.75);
        for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
          this.tube(P.board, x + sx * ow, y + sy * od, T.y1 - 0.75, x + sx * (ow + 0.5), y + sy * (od + 0.5), T.y1 - 0.25, 0.12, 5);
          this.tube(P.plaster, x + sx * ow, y + sy * od, T.y1 - 0.72, x + sx * next.w / 2, y + sy * next.d / 2, T.y1 + 1.1, 0.1, 4);
        }
        /* Gables: east and west on the first and third tiers, north and
         * south on the second. */
        const gableFaces = i === 1 ? ['n', 's'] : (i === 0 || i === 2 ? ['e', 'w'] : []);
        for (const f of gableFaces) {
          gable(rf, this, P, x, y, f, ow, od, T.y1, next, i === 0 ? 7 : 5);
        }
      } else {
        /* The top roof: hipped to a ridge, a white gable at each end. */
        const yE = T.y1 - 0.6;
        const yR = yE + CASTLE.topRise;
        hip(rf, x, y, ow, od, yE, ow - od + 0.4, yR, PAINT.TILE_REPEAT_M);
        this.box(P.plaster, x - ow, y - od, yE - 0.2, x + ow, y + od, yE);
        const rl = ow - od + 0.4;
        this.tube(P.board, x - rl - 0.3, y, yR + 0.05, x + rl + 0.3, y, yR + 0.05, 0.22, 6);
        for (const sx of [-1, 1]) {
          /* The gable's white triangle and its gold trim. */
          const gx = x + sx * (rl + 0.9);
          const g = new Soup(true);
          g.tri(w(gx, y - od * 0.5, yR - 1.9), w(gx, y + od * 0.5, yR - 1.9), w(gx, y, yR));
          this.add(P.plaster, g);
          this.box(P.gold, gx - 0.08, y - 0.25, yR - 0.9, gx + 0.08, y + 0.25, yR - 0.4);
          /* The shachihoko: a golden fish on each end of the ridge, its
           * tail up. */
          const fc = w(x + sx * (rl + 0.1), y, yR + 0.75);
          this.k.blob(P.gold, fc, 0.45, 0.65, [0, 0, sx * 0.3]);
          this.k.cone(P.gold, [fc[0] - sx * 0.3, fc[1] + 0.4, fc[2]], 0.32, 0.9, 6);
          this.k.blob(P.gold, [fc[0] + sx * 0.32, fc[1] - 0.25, fc[2]], 0.22, 0.25, [0, 0, 0]);
        }
        for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
          this.tube(P.board, x + sx * ow, y + sy * od, yE, x + sx * (ow + 0.6), y + sy * (od + 0.6), yE + 0.55, 0.13, 5);
        }
      }
      this.add(this.M.tiles, rf);
    });
    /* The moat and its wall. */
    const water = new Soup();
    const R = PAINT.WATER_REPEAT_M;
    const [fw, fd] = rectAt(0);
    const ring = [
      [moat.x0, moat.y0, moat.x1, y - fd], [moat.x0, y + fd, moat.x1, moat.y1],
      [moat.x0, y - fd, x - fw, y + fd], [x + fw, y - fd, moat.x1, y + fd],
    ];
    for (const [ax, ay, bx, by] of ring) {
      water.quad(w(ax, ay, 0.04), w(bx, ay, 0.04), w(bx, by, 0.04), w(ax, by, 0.04), [ax / R, ay / R], [bx / R, ay / R], [bx / R, by / R], [ax / R, by / R]);
    }
    this.add(this.M.water, upward(water));
    const { coping, copingT } = moat;
    const cw = [
      [moat.x0 - copingT, moat.y0 - copingT, moat.x1 + copingT, moat.y0],
      [moat.x0 - copingT, moat.y1, moat.x1 + copingT, moat.y1 + copingT],
      [moat.x0 - copingT, moat.y0, moat.x0, moat.y1],
      [moat.x1, moat.y0, moat.x1 + copingT, bridge.y - bridge.half],
      [moat.x1, bridge.y + bridge.half, moat.x1 + copingT, moat.y1],
    ];
    for (const [ax, ay, bx, by] of cw) {
      this.box(P.stoneTop, ax, ay, 0, bx, by, coping);
    }
    /* The moat wall's inner face in coursed stone. */
    const mw = new Soup();
    wallQuad(mw, moat.x1, moat.y0, moat.x0, moat.y0, 0, coping, moat.x1 / SR, moat.x0 / SR, 0, coping / SR);
    wallQuad(mw, moat.x0, moat.y1, moat.x1, moat.y1, 0, coping, moat.x0 / SR, moat.x1 / SR, 0, coping / SR);
    this.add(this.M.stone, mw);
    /* The bridge: the arched deck, its sides, the rails and their posts
     * with gilt caps. */
    const bd = new Soup(true);
    const n = 20;
    for (let i = 0; i < n; i += 1) {
      const xa = bridge.x0 + ((bridge.x1 - bridge.x0) * i) / n;
      const xb = bridge.x0 + ((bridge.x1 - bridge.x0) * (i + 1)) / n;
      const ha = bridgeAt(xa);
      const hb = bridgeAt(xb);
      const y0 = bridge.y - bridge.half;
      const y1 = bridge.y + bridge.half;
      bd.quad(w(xa, y0, ha), w(xb, y0, hb), w(xb, y1, hb), w(xa, y1, ha));
      bd.quad(w(xa, y0, ha - bridge.deckT), w(xb, y0, hb - bridge.deckT), w(xb, y0, hb), w(xa, y0, ha));
      bd.quad(w(xa, y1, ha - bridge.deckT), w(xb, y1, hb - bridge.deckT), w(xb, y1, hb), w(xa, y1, ha));
      bd.quad(w(xa, y0, ha - bridge.deckT), w(xb, y0, hb - bridge.deckT), w(xb, y1, hb - bridge.deckT), w(xa, y1, ha - bridge.deckT));
      for (const side of [-1, 1]) {
        const yy = bridge.y + side * (bridge.half - 0.1);
        this.tube(P.vermilion, xa, yy, ha + 1.0, xb, yy, hb + 1.0, 0.06, 5);
        this.tube(P.vermilion, xa, yy, ha + 0.5, xb, yy, hb + 0.5, 0.04, 4);
      }
    }
    this.add(P.vermilion, bd);
    for (const side of [-1, 1]) {
      for (let i = 0; i <= 6; i += 1) {
        const xx = bridge.x0 + 0.4 + ((bridge.x1 - bridge.x0 - 0.8) * i) / 6;
        const yy = bridge.y + side * (bridge.half - 0.1);
        this.tube(P.vermilion, xx, yy, bridgeAt(xx), xx, yy, bridgeAt(xx) + 1.1, 0.07, 6);
        this.k.blob(P.gold, w(xx, yy, bridgeAt(xx) + 1.22), 0.1, 0.14, [0, 0, 0]);
      }
    }
    /* The gate in the base where the bridge lands. */
    const gx = x + fw - 0.05;
    this.box(P.timberDark, gx - 0.4, bridge.y - 2.2, 0, gx + 0.15, bridge.y + 2.2, 3.6);
    this.box(P.board, gx + 0.15, bridge.y - 1.8, 0.1, gx + 0.2, bridge.y + 1.8, 3.2);
    for (let i = 0; i < 4; i += 1) {
      for (let j = 0; j < 3; j += 1) {
        this.k.blob(P.gold, w(gx + 0.24, bridge.y - 1.3 + i * 0.85, 0.8 + j * 0.9), 0.06, 0.06, [0, 0, 0]);
      }
    }
    this.box(P.board, gx - 0.6, bridge.y - 2.8, 3.6, gx + 0.8, bridge.y + 2.8, 3.9);
    const gr = new Soup(true);
    skirt(gr, gx + 0.1, bridge.y, 1.2, 3.2, 3.9, 0.1, 2.0, 4.8, PAINT.TILE_REPEAT_M);
    this.add(this.M.tiles, gr);
  }
}

/* A soup turned so its faces point up: each triangle whose normal points
 * down is rewound. For flat paint laid on the ground. */
function upward(s) {
  const p = s.p;
  const uv = s.uv;
  for (let i = 0; i < p.length; i += 9) {
    const ax = p[i + 3] - p[i];
    const az = p[i + 5] - p[i + 2];
    const bx = p[i + 6] - p[i];
    const bz = p[i + 8] - p[i + 2];
    const ny = az * bx - ax * bz;
    if (ny < 0) {
      for (let k = 0; k < 3; k += 1) {
        const t = p[i + 3 + k];
        p[i + 3 + k] = p[i + 6 + k];
        p[i + 6 + k] = t;
      }
      const j = (i / 9) * 6;
      for (let k = 0; k < 2; k += 1) {
        const t = uv[j + 2 + k];
        uv[j + 2 + k] = uv[j + 4 + k];
        uv[j + 4 + k] = t;
      }
    }
  }
  return s;
}

/*
 * A skirt roof: four sloped faces from an outer rectangle (half sizes ow,
 * od) at height y0 up to an inner one (iw, id) at y1, round (x, y) in the
 * plan. UVs run along the eave in tile repeats and up the slope.
 */
function skirt(s, x, y, ow, od, y0, iw, id, y1, R) {
  const o = [[x - ow, y - od], [x + ow, y - od], [x + ow, y + od], [x - ow, y + od]];
  const i = [[x - iw, y - id], [x + iw, y - id], [x + iw, y + id], [x - iw, y + id]];
  for (let k = 0; k < 4; k += 1) {
    const a = o[k];
    const b = o[(k + 1) % 4];
    const c = i[(k + 1) % 4];
    const d = i[k];
    const la = Math.hypot(b[0] - a[0], b[1] - a[1]) / R;
    s.quad(w(a[0], a[1], y0), w(b[0], b[1], y0), w(c[0], c[1], y1), w(d[0], d[1], y1), [0, 0], [la, 0], [la, 1], [0, 1]);
  }
}

/* A hipped roof from an eave rectangle (ow, od) at yE to a ridge along x
 * of half length rl at yR. */
function hip(s, x, y, ow, od, yE, rl, yR, R) {
  const r = Math.max(0, Math.min(rl, ow));
  skirt(s, x, y, ow, od, yE, r, 0.001, yR, R);
}

/* A gable (chidori-hafu) on a skirt face: a white triangle standing on
 * the eave and the two roof slopes behind it running back to the tier
 * above. `f` is the face, 'e', 'w', 'n' or 's'. */
function gable(rf, H, P, x, y, f, ow, od, base, next, span) {
  const half = span / 2;
  const rise = 2.4;
  const yE = base - 0.75;
  let tri;
  let back;
  if (f === 'e' || f === 'w') {
    const sx = f === 'e' ? 1 : -1;
    const fx = x + sx * ow;
    const bx = x + sx * next.w / 2;
    tri = [[fx, y - half, yE], [fx, y + half, yE], [fx, y, yE + rise]];
    back = [[bx, y - half, yE + 1.2], [bx, y + half, yE + 1.2], [bx, y, yE + rise]];
  } else {
    const sy = f === 'n' ? 1 : -1;
    const fy = y + sy * od;
    const by = y + sy * next.d / 2;
    tri = [[x - half, fy, yE], [x + half, fy, yE], [x, fy, yE + rise]];
    back = [[x - half, by, yE + 1.2], [x + half, by, yE + 1.2], [x, by, yE + rise]];
  }
  const g = new Soup(true);
  g.tri(w(...tri[0]), w(...tri[1]), w(...tri[2]));
  H.add(P.plaster, g);
  /* The two slopes back to the tier, tiled. */
  rf.quad(w(...tri[0]), w(...tri[2]), w(...back[2]), w(...back[0]), [0, 0], [1, 0], [1, 1], [0, 1]);
  rf.quad(w(...tri[2]), w(...tri[1]), w(...back[1]), w(...back[2]), [0, 0], [1, 0], [1, 1], [0, 1]);
  /* The gable's dark bargeboards and its gold ornament. */
  H.tube(P.board, tri[0][0], tri[0][1], tri[0][2], tri[2][0], tri[2][1], tri[2][2], 0.14, 5);
  H.tube(P.board, tri[1][0], tri[1][1], tri[1][2], tri[2][0], tri[2][1], tri[2][2], 0.14, 5);
  H.box(P.gold, tri[2][0] - 0.25, tri[2][1] - 0.25, tri[2][2] - 0.75, tri[2][0] + 0.25, tri[2][1] + 0.25, tri[2][2] - 0.3);
}
