/*
 * buildings.js: the building and the bando, for built freestyle maps.
 *
 * Two assets, both made of boxes and so both facing one of the four compass
 * headings (see turns in ./types.js). Each is a pure layout, which says
 * what is solid, and a draw, which adds everything a pilot sees and cannot
 * hit. The layout is the contract with the physics; the draw is paint.
 *
 * THE FRAME. Like every asset, +x is the heading: the front, the facade the
 * author points at the street. WIDTH RUNS ALONG THE FRONT (z) AND DEPTH RUNS
 * FRONT TO BACK (x), because that is what an author means by them: a shop is
 * "a narrow front", eight metres wide and eleven deep, and a block of flats
 * is long along its corridor and shallow behind it.
 *
 * THE LOOK IS THE TOWN'S. These are drawn out of the same palette and the
 * same cel materials as src/maps/city, with windows, doors, grilles and
 * rails built as real frames standing proud of the wall rather than painted
 * on, because the town's ink pass draws a line at every step in depth. A
 * frame 50 mm proud gets a line at ten metres and fades at forty, which is
 * the level of detail a background painter would give it; the value pattern
 * (dark panes on a pale wall, a pale parapet over a shadowed corridor) is
 * what carries at sixty.
 *
 * WHAT MAKES A BUILDING FLYABLE, and every choice below serves one of these:
 *
 *   a roof you can land on     the body is one box, so its top is ground to
 *                              the plant, with a parapet round it to skim
 *   a line along the front     a block of flats has an open corridor on
 *                              every floor, 1.48 m clear inside a solid
 *                              parapet and 1.62 m of air over it
 *   a line through it          `passage` punches an arcade through the
 *                              ground floor, front to back
 *   things to thread           an external stair, a tank on a tall stand,
 *                              a sign on legs, a comb of fins
 *
 * THE GAP RULE, as every asset keeps it: two solids either touch or leave
 * at least GAP_MIN between them. Roof furniture is placed at least that far
 * from the parapet or against it, a vending machine stands against the wall
 * rather than a hand's width off it, and the few pockets that are narrower
 * (the air between a balcony's air conditioner and its parapet) are closed
 * on every side but the one you look into, so nothing narrower is a line.
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
import { canvas } from './textures.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/* ------------------------------------------------------------------ *
 * THE FAMILY'S OWN COLOURS. Each is pulled into the town's range the way
 * kit.js pulls its own: a pale base, and a shadow tint on the violet side.
 * Prefixed so another family can never claim the same name by accident.
 * ------------------------------------------------------------------ */

const TD = 0x5c5680;

export const MATERIALS = {
  /* a coated flat roof, the green grey every mansion roof in the town is */
  bldRoof: { c: 0xb7bfb4, tint: 0x655d84 }, bldRoofSeam: { c: 0x9ea79c, tint: 0x5f5880 },
  /* anodised aluminium: window frames, copings, the handrail on a parapet */
  bldFrame: { c: 0xd3d4da, tint: 0x6a6288 }, bldGrille: { c: 0xa6abb6, tint: TD },
  bldRail: { c: 0x8f95a3, tint: TD },
  /* the panes of a home: darker than the town's shop glass, so a facade
   * reads as a rhythm of windows from across the plot */
  bldPane: { f: 0x6f7f98, noCast: true }, bldFrosted: { f: 0xd4dfe6, noCast: true },
  bldBlind: { f: 0xebe6d8, noCast: true }, bldSky: { f: 0xa9c4dc, noCast: true },
  bldGlint: { f: 0xe8f1f8, noCast: true },
  /* steel front doors, three colours a street of mansions wears */
  bldDoorTeal: { c: 0x6f8f98, tint: 0x4f5a78 }, bldDoorBrown: { c: 0x8f7462, tint: TD },
  bldDoorGrey: { c: 0x9ba2b0, tint: TD },
  /* the meter cupboard beside every door, and the gas water heater */
  bldCupboard: { c: 0xdcd8de, tint: 0x6a6288 }, bldHeater: { c: 0xefece4, tint: 0x6f6790 },
  /* parapet finishes: the brown tile of an eighties mansion, a pale tile */
  bldTile: { c: 0xa98a78, tint: 0x62527a }, bldTilePale: { c: 0xdcd0c0, tint: 0x6a6288 },
  bldDivider: { c: 0xefe9dc, tint: 0x6f6790 },
  /* painted steel of an outdoor stair */
  bldStair: { c: 0x7f8a99, tint: 0x565077 }, bldStairGreen: { c: 0x6f8f80, tint: 0x4f5a78 },
  /* washing on the line and a futon over the rail */
  bldClothPink: { c: 0xf4c3cf, tint: 0x8a6a90 }, bldClothBlue: { c: 0x9fc1e3, tint: 0x5f6a96 },
  bldClothYellow: { c: 0xf6dd8a, tint: 0x8a7a80 }, bldClothWhite: { c: 0xf7f4ee, tint: 0x7d74a0 },
  bldFuton: { c: 0xf0a8a0, tint: 0x8a5a78 },
  /* the office: its spandrels and its lobby */
  bldSpandrel: { c: 0xd9d7de, tint: 0x6a6288 }, bldSpandrelDark: { c: 0x8b91a3, tint: TD },
  /* the warehouse: a cream cladding and its rib, a block dado, dock rubber */
  bldSheetCream: { c: 0xe2dac6, tint: 0x64607f }, bldSheetCreamRib: { c: 0xc6bea9, tint: 0x5a5678 },
  bldDado: { c: 0xb4aebb, tint: 0x5f5880 }, bldRubber: { c: 0x3d3a45, tint: 0x3f3a50 },
  /* the shop: awnings and the box a roller shutter lives in */
  bldAwningGreen: { c: 0x4f8a6a, tint: 0x3f5a70 }, bldAwningBlue: { c: 0x4a78c4, tint: 0x4a4a7a },
  bldAwningOrange: { c: 0xe0823c, tint: 0x7a5068 }, bldShutterBox: { c: 0xcfcad6, tint: 0x6a6288 },
  bldPaving: { c: 0xd7cfc7, tint: 0x6a6288 },
  bldVendRed: { c: 0xd9463f, tint: 0x6a3a5a }, bldVendBlue: { c: 0x3f6fbf, tint: 0x4a4a7a },
  bldVendWhite: { c: 0xf1efea, tint: 0x6f6790 },
  /* the bando */
  bandoColumn: { c: 0xc6c0c4, tint: 0x655d84 }, bandoBeam: { c: 0xaea8b1, tint: 0x5f5880 },
  bandoRaw: { c: 0xb9b3ae, tint: 0x62597f },
  bandoPaintPink: { c: 0xe9c9c4, tint: 0x6f6790 }, bandoPaintBlue: { c: 0xbfd2de, tint: 0x6a6288 },
  bandoPaintGreen: { c: 0xc8d9bf, tint: 0x5f6a86 }, bandoPaintCream: { c: 0xebdcbc, tint: 0x6f6790 },
  bandoTile: { c: 0xb2d2ce, tint: 0x5f6a86 },
  bandoTarp: { c: 0x3f7cc4, tint: 0x3f4a78 }, bandoTarpDeep: { c: 0x2f62a4, tint: 0x363f70 },
  bandoMoss: { c: 0x7d9c67, tint: 0x4f6488, noReceive: true },
  bandoScorch: { c: 0x514a58, tint: 0x3a3548 }, bandoStain: { c: 0x9f98a3, tint: 0x57507a },
  /* the infill is a shade darker and cooler than the frame, so from across
   * the plot the frame reads as a pale grid and the walls as panels in it */
  bandoBlock: { c: 0xa9a2a8, tint: 0x5c5680 }, bandoBlockDark: { c: 0x938c95, tint: 0x544e76 },
  bandoSooty: { c: 0x8a8390, tint: 0x4f4a6a }, bandoBurnt: { c: 0x6c6572, tint: 0x433e5a },
  /* the render a lived in block wore on the outside, faded: what makes its
   * walls read as a skin in the grey frame rather than more frame */
  bandoRenderCream: { c: 0xdacdb2, tint: 0x6a6288 }, bandoRenderGreen: { c: 0xbfcdbf, tint: 0x5f6a86 },
  bandoRenderBlue: { c: 0xc2cad8, tint: 0x5f6088 }, bandoRenderPink: { c: 0xdbc5c1, tint: 0x6a6288 },
  bandoRebar: { c: 0x8a5a44, tint: 0x5a4668 },
};

/* ------------------------------------------------------------------ *
 * THE FAMILY'S OWN SIGNS. Canvas painters, called only in the browser.
 * Every name is invented.
 * ------------------------------------------------------------------ */

const JP = `'Yu Gothic', 'Yu Gothic UI', 'Meiryo', 'Hiragino Kaku Gothic ProN', 'Noto Sans CJK JP', sans-serif`;
const DISPLAY = `'Arial Black', 'Helvetica Neue', Impact, 'Noto Sans CJK JP', sans-serif`;
const INK = '#39324f';

function plate(w, h, draw) {
  const c = canvas(w, h);
  const g = c.getContext('2d');
  draw(g, w, h);
  return c;
}

function fitFont(g, text, maxW, size, font, weight = '900') {
  let s = size;
  do {
    g.font = `${weight} ${s}px ${font}`;
    if (g.measureText(text).width <= maxW) {
      break;
    }
    s -= 2;
  } while (s > 8);
  return s;
}

const TENANTS = [
  ['スナック 夢', '#e0453f'], ['ひばり歯科', '#3d6ec4'], ['カラオケ 星', '#8f6fb5'], ['英会話 SORA', '#2f9c9a'],
  ['居酒屋 まる', '#ef8a3c'], ['整体 かぜ', '#4a8f5c'], ['麻雀 東', '#2a4f97'], ['美容室 COCO', '#d86a9a'],
  ['司法書士', '#6a6480'], ['喫茶 灯', '#9a6a3c'], ['学習塾', '#22736f'], ['BAR 月', '#453f4f'],
];

export const PAINTERS = {
  /* The sign over an arcade's mouth: a navy plate, a way through. */
  bldThrough: {
    variants: 2,
    paint: (v) => plate(512, 128, (g, w, h) => {
      g.fillStyle = v ? '#22736f' : '#2a4f97';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = '#f4f2f6';
      g.lineWidth = 6;
      g.strokeRect(8, 8, w - 16, h - 16);
      g.fillStyle = '#f4f2f6';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `900 ${fitFont(g, '通り抜け', w * 0.6, 64, JP)}px ${JP}`;
      g.fillText('通り抜け', w * 0.42, h * 0.44);
      g.font = `900 22px ${DISPLAY}`;
      g.fillText('THROUGH', w * 0.42, h * 0.82);
      /* The arrow. */
      g.beginPath();
      g.moveTo(w * 0.8, h * 0.3);
      g.lineTo(w * 0.92, h * 0.5);
      g.lineTo(w * 0.8, h * 0.7);
      g.closePath();
      g.fill();
      g.fillRect(w * 0.72, h * 0.44, w * 0.09, h * 0.12);
    }),
  },
  /* Keep out, on a board at a bando's way in: yellow, a red heading. */
  bldKeepOut: {
    variants: 2,
    paint: (v) => plate(256, 320, (g, w, h) => {
      g.fillStyle = '#fbf7ee';
      g.fillRect(0, 0, w, h);
      g.fillStyle = v ? '#f4c033' : '#e0453f';
      g.fillRect(0, 0, w, h * 0.34);
      g.fillStyle = v ? INK : '#ffffff';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `900 ${fitFont(g, '立入禁止', w - 30, 60, JP)}px ${JP}`;
      g.fillText('立入禁止', w / 2, h * 0.17);
      g.fillStyle = INK;
      g.font = `900 38px ${DISPLAY}`;
      g.fillText('KEEP OUT', w / 2, h * 0.47);
      g.font = `700 24px ${JP}`;
      g.fillText('危険 ・ 倒壊のおそれ', w / 2, h * 0.64);
      g.font = `700 20px ${DISPLAY}`;
      g.fillText('DANGER  NO ENTRY', w / 2, h * 0.78);
      g.lineWidth = 10;
      g.strokeStyle = INK;
      g.strokeRect(5, 5, w - 10, h - 10);
    }),
  },
  /* The tenant board down the corner of an office: five tenants, each a
   * colour and a name, the way every mixed use block in Japan lists them. */
  bldTenant: {
    variants: 4,
    paint: (v) => plate(192, 960, (g, w, h) => {
      g.fillStyle = '#f4f2f6';
      g.fillRect(0, 0, w, h);
      const n = 5;
      for (let i = 0; i < n; i += 1) {
        const [name, colour] = TENANTS[(v * 5 + i * 3) % TENANTS.length];
        const y0 = 14 + i * ((h - 28) / n);
        const bh = (h - 28) / n - 12;
        g.fillStyle = colour;
        g.fillRect(12, y0, w - 24, bh);
        g.fillStyle = '#ffffff';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        const chars = [...name.replace(/\s+/g, '')].slice(0, 5);
        const size = Math.min(40, (bh - 16) / chars.length);
        g.font = `900 ${size}px ${JP}`;
        chars.forEach((ch, k) => g.fillText(ch, w / 2, y0 + 10 + size * (k + 0.55)));
      }
      g.lineWidth = 8;
      g.strokeStyle = INK;
      g.strokeRect(4, 4, w - 8, h - 8);
    }),
  },
  /* A floor number stencilled on a stair core, the one thing a derelict
   * frame still tells you. */
  bldFloor: {
    variants: 10,
    paint: (v) => plate(256, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.fillStyle = 'rgba(57,50,79,0.92)';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `900 150px ${DISPLAY}`;
      g.fillText(`${v + 1}F`, w / 2, h / 2 + 6);
      g.globalCompositeOperation = 'destination-out';
      g.fillRect(0, h * 0.47, w, 10);
      g.globalCompositeOperation = 'source-over';
    }),
  },
  /* The front of a drinks machine: a lit header, four shelves of cans
   * and bottles in the colours that make a row of machines the brightest
   * thing on a street, the buttons, the coin panel and the port. */
  bldVend: {
    variants: 3,
    paint: (v) => plate(256, 448, (g, w, h) => {
      const body = ['#f1efea', '#d9463f', '#3f6fbf'][v % 3];
      const trim = ['#e0453f', '#fdf6ec', '#fdf6ec'][v % 3];
      g.fillStyle = body;
      g.fillRect(0, 0, w, h);
      g.fillStyle = trim;
      g.fillRect(10, 10, w - 20, 62);
      g.fillStyle = v % 3 === 0 ? '#ffffff' : body;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `900 ${fitFont(g, ['そら茶', 'ハレ水', 'KAZE'][v % 3], w - 50, 44, JP)}px ${JP}`;
      g.fillStyle = ['#ffffff', '#d9463f', '#3f6fbf'][v % 3];
      g.fillText(['そら茶', 'ハレ水', 'KAZE'][v % 3], w / 2, 42);
      /* The display. */
      g.fillStyle = '#2d3140';
      g.fillRect(22, 84, w - 44, 232);
      const cols = ['#e0453f', '#f4c033', '#3d6ec4', '#2f9c9a', '#ef8a3c', '#8fbf4a', '#f6a2c0', '#ffffff'];
      for (let r = 0; r < 4; r += 1) {
        const y = 92 + r * 56;
        g.fillStyle = '#e8e4dc';
        g.fillRect(26, y + 44, w - 52, 6);
        for (let i = 0; i < 6; i += 1) {
          const x = 34 + i * ((w - 68) / 6);
          const tall = r % 2 === 0;
          g.fillStyle = cols[(r * 3 + i + v * 2) % cols.length];
          g.fillRect(x, y + (tall ? 4 : 16), 22, tall ? 40 : 28);
          g.fillStyle = 'rgba(255,255,255,0.55)';
          g.fillRect(x + 3, y + (tall ? 8 : 19), 4, tall ? 30 : 20);
        }
      }
      /* The glass's one highlight. */
      g.fillStyle = 'rgba(242,248,255,0.16)';
      g.beginPath();
      g.moveTo(40, 84);
      g.lineTo(90, 84);
      g.lineTo(60, 316);
      g.lineTo(22, 316);
      g.closePath();
      g.fill();
      /* Buttons, the coin panel, the port. */
      for (let i = 0; i < 6; i += 1) {
        g.fillStyle = i % 2 ? '#3fae9a' : '#e0453f';
        g.fillRect(34 + i * 32, 326, 18, 10);
      }
      g.fillStyle = 'rgba(57,50,79,0.85)';
      g.fillRect(w - 64, 346, 40, 44);
      g.fillStyle = '#c9c4d2';
      g.fillRect(w - 56, 354, 24, 8);
      g.fillStyle = '#1f1d27';
      g.fillRect(26, 396, w - 110, 36);
      g.lineWidth = 6;
      g.strokeStyle = INK;
      g.strokeRect(3, 3, w - 6, h - 6);
    }),
  },
  /*
   * IVY, for the bando: a stem wandering down a strip with leaves on it,
   * three greens and an ink edge, thick at one end and thinning out. Even
   * variants climb from the bottom, odd ones hang from the top. Painted
   * rather than modelled because a leaf is a shape and not a volume, and a
   * cut out plane of leaves reads as ivy where a string of green polyhedra
   * reads as beads.
   */
  bandoIvy: {
    variants: 6,
    paint: (v) => plate(128, 512, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      const r = seededRandom(0x1f7a + v * 977);
      const climbs = v % 2 === 0;
      const greens = ['#5f9470', '#4f8566', '#7fae78', '#8cb884'];
      const stems = 2 + (v % 3);
      for (let st = 0; st < stems; st += 1) {
        let x = w * r.range(0.25, 0.75);
        g.strokeStyle = '#4b5a48';
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(x, climbs ? h : 0);
        const pts = [];
        for (let y = 0; y <= h; y += 16) {
          x = Math.min(w - 12, Math.max(12, x + r.range(-9, 9)));
          const yy = climbs ? h - y : y;
          pts.push([x, yy]);
          g.lineTo(x, yy);
        }
        g.stroke();
        for (const [px, py] of pts) {
          /* Leaves thin out away from where the plant is rooted. */
          const along = climbs ? 1 - py / h : py / h;
          if (!r.chance(1 - along * 0.75)) {
            continue;
          }
          for (let q = 0; q < 2; q += 1) {
            const lx = px + r.range(-16, 16);
            const ly = py + r.range(-10, 10);
            const s = r.range(7, 13) * (1.1 - along * 0.4);
            g.save();
            g.translate(lx, ly);
            g.rotate(r.range(-1.2, 1.2));
            g.beginPath();
            g.moveTo(0, -s);
            g.quadraticCurveTo(s, -s * 0.2, 0, s);
            g.quadraticCurveTo(-s, -s * 0.2, 0, -s);
            g.fillStyle = r.pick(greens);
            g.fill();
            g.lineWidth = 2;
            g.strokeStyle = '#2f3f36';
            g.stroke();
            g.restore();
          }
        }
      }
    }),
  },
  /*
   * SOOT, the mark a fire leaves over a window: a black plume licking up
   * from the head in tongues, with a grey halo where the smoke thinned.
   * Cut out, so its ragged edge is the edge the ink sees.
   */
  bandoSoot: {
    variants: 4,
    paint: (v) => plate(256, 320, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      const r = seededRandom(0x5007 + v * 131);
      const tongue = (cx, base, width, height, lean) => {
        g.beginPath();
        g.moveTo(cx - width / 2, base);
        g.bezierCurveTo(cx - width * 0.6, base - height * 0.45, cx + lean - width * 0.2, base - height * 0.75, cx + lean, base - height);
        g.bezierCurveTo(cx + lean + width * 0.25, base - height * 0.7, cx + width * 0.6, base - height * 0.4, cx + width / 2, base);
        g.closePath();
        g.fill();
      };
      for (const [colour, grow] of [['#7a7382', 1.18], ['#3a3444', 1.0]]) {
        g.fillStyle = colour;
        g.fillRect(w * 0.12 - (grow - 1) * 30, h - 26 * grow, w * 0.76 + (grow - 1) * 60, 26 * grow);
        const n = 4 + (v % 3);
        for (let i = 0; i < n; i += 1) {
          const cx = w * (0.2 + (i / (n - 1)) * 0.6) + r.range(-10, 10);
          tongue(cx, h - 8, r.range(50, 90) * grow, r.range(0.45, 0.95) * (h - 20) * (grow > 1 ? 1.04 : 1), r.range(-30, 30));
        }
      }
    }),
  },
  /* The valance of a shop's awning: stripes and a word. */
  bldValance: {
    variants: 4,
    paint: (v) => plate(512, 64, (g, w, h) => {
      const base = ['#ef6a60', '#4f8a6a', '#4a78c4', '#e0823c'][v % 4];
      g.fillStyle = base;
      g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,255,255,0.9)';
      for (let x = 0; x < w; x += 64) {
        g.fillRect(x, 0, 28, h);
      }
      g.fillStyle = base;
      g.fillRect(w * 0.3, 8, w * 0.4, h - 16);
      g.fillStyle = '#ffffff';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `900 34px ${JP}`;
      g.fillText(['いらっしゃいませ', 'OPEN', '営業中', 'WELCOME'][v % 4], w / 2, h / 2 + 2);
    }),
  },
};

/* ------------------------------------------------------------------ *
 * Placing boxes on faces. `face` is the outward normal ('+x', '-x', '+z',
 * '-z'), `at` the plane of the face, u along it, n out of it. The layout
 * and the draw both place things this way, so a door and the wall it is in
 * cannot disagree about which side is out.
 * ------------------------------------------------------------------ */

function faceBox(face, at, u0, u1, y0, y1, n0, n1) {
  const s = face[0] === '-' ? -1 : 1;
  const a = at + s * n0;
  const b = at + s * n1;
  return face[1] === 'x' ? [a, y0, u0, b, y1, u1] : [u0, y0, a, u1, y1, b];
}

function fb(K, m, face, at, u0, u1, y0, y1, n0, n1) {
  K.box(m, ...faceBox(face, at, u0, u1, y0, y1, n0, n1));
}

/*
 * A PANE OF GLASS ON A FACE, which at dusk may be a lit room.
 *
 * By day this is fb and nothing else. At night the kit decides from where
 * the pane stands whether somebody is home (K.windowLight, never the draw's
 * own random stream, so the building rolled at dusk is the one rolled at
 * noon) and a lit pane goes into the kit's one glow batch in the colour of
 * the light left on. `share` is how many such panes are lit; a pane drawn
 * as glassLit was a lit room by day and is lit at night too. Returns the
 * tone, 0 for a dark pane, so what hangs behind the glass can follow it.
 */
function pane(K, m, face, at, u0, u1, y0, y1, n0, n1, share, tones) {
  const box = faceBox(face, at, u0, u1, y0, y1, n0, n1);
  const tone = K.windowLight((box[0] + box[3]) / 2, (box[1] + box[4]) / 2, (box[2] + box[5]) / 2,
    m === 'glassLit' ? 1 : share, tones);
  if (tone) {
    K.glow(tone, ...box);
  } else {
    K.box(m, ...box);
  }
  return tone;
}

/* A run of glass between mullions, one box by day. At night each of its
 * `n` panes is its own room, lit or not, since a whole floor lit or dark
 * as one ribbon is the pattern a lit town must not have. */
function paneRun(K, m, face, at, r0, r1, y0, y1, n0, n1, n, share, tones) {
  if (K.night !== true) {
    fb(K, m, face, at, r0, r1, y0, y1, n0, n1);
    return;
  }
  for (let k = 0; k < n; k += 1) {
    pane(K, m, face, at, r0 + (k / n) * (r1 - r0), r0 + ((k + 1) / n) * (r1 - r0), y0, y1, n0, n1, share, tones);
  }
}

/*
 * THE COLOURS A LIT ROOM IS, weighted by repeating them. A home is mostly
 * a warm bulb, some paper shade amber, some a cooler ceiling light, the odd
 * one a television's blue; an office is its fluorescent tubes. Values are
 * picked to stay warm against the dusk look's violet, since a lit window is
 * the one warm thing on a face in shade.
 */
const WINDOW_TONES = {
  home: [0xffc978, 0xffc978, 0xffc978, 0xffd494, 0xffd494, 0xffab62, 0xffab62, 0xfff0d2, 0xfff0d2, 0xbcd0ff],
  office: [0xfff3da, 0xfff3da, 0xfff3da, 0xf2f6ff, 0xf2f6ff, 0xffe2b0],
  frosted: [0xfff0d8, 0xffe6bf],
  blind: [0xffe7c2],
};

/* A curtain with the room lit behind it glows in its own colour, warmed. */
const CURTAIN_LIT = {
  curtainPink: 0xffbfb0, curtainBlue: 0xd9d5f0, curtainCream: 0xffe1a6, curtainGreen: 0xe5eab4,
};

/* How many of each kind of window are lit at dusk: a home at the hour
 * people come back to it, an office still working, a stair and a lobby
 * lit all night. */
const LIT = { home: 0.46, kitchen: 0.4, frosted: 0.3, office: 0.52, side: 0.45, stair: 0.85, lobby: 1, shed: 0.3 };

/* The plinth a building stands on, a few centimetres proud of its walls,
 * split round the arcade so no kerb is drawn across the way through. */
function plinthDraw(K, s, h) {
  for (const [a, b] of aroundMouth(s.z0 - 0.05, s.z1 + 0.05, s.pw, 0)) {
    K.box('concreteDark', s.xb - 0.05, 0, a, s.xf + 0.05, h, b);
  }
}

/* The runs of [u0, u1] either side of an arcade's mouth, so paint on the
 * front and the back of a building never crosses the way through. */
function aroundMouth(u0, u1, pw, pad = 0.3) {
  if (!pw) {
    return [[u0, u1]];
  }
  const out = [];
  if (-pw / 2 - pad > u0) {
    out.push([u0, Math.min(u1, -pw / 2 - pad)]);
  }
  if (pw / 2 + pad < u1) {
    out.push([Math.max(u0, pw / 2 + pad), u1]);
  }
  return out;
}

/* The same, with a rectangle left out: paint on a wall that has a hole in
 * it goes round the hole and never across it. */
function paintAround(K, m, face, at, u0, u1, y0, y1, hole, n0, n1) {
  if (!hole || hole.to <= u0 || hole.from >= u1 || hole.y1 <= y0 || hole.y0 >= y1) {
    fb(K, m, face, at, u0, u1, y0, y1, n0, n1);
    return;
  }
  const h0 = Math.max(u0, hole.from);
  const h1 = Math.min(u1, hole.to);
  if (h0 > u0) {
    fb(K, m, face, at, u0, h0, y0, y1, n0, n1);
  }
  if (h1 < u1) {
    fb(K, m, face, at, h1, u1, y0, y1, n0, n1);
  }
  if (hole.y0 > y0) {
    fb(K, m, face, at, h0, h1, y0, Math.min(y1, hole.y0), n0, n1);
  }
  if (hole.y1 < y1) {
    fb(K, m, face, at, h0, h1, Math.max(y0, hole.y1), y1, n0, n1);
  }
}

/*
 * A window: a frame, the pane standing just proud of it, a meeting rail
 * down the middle and a sill. What is behind the pane (a curtain, a lit
 * room, a blind) is a flat strip over part of it, because at twenty metres
 * the difference between a home and a hole in a wall is a pale shape in
 * the dark.
 */
function windowOn(K, face, at, u, y, w, h, o = {}) {
  const f = o.frame ?? 'bldFrame';
  fb(K, f, face, at, u - w / 2 - 0.07, u + w / 2 + 0.07, y - h / 2 - 0.07, y + h / 2 + 0.07, -0.01, 0.05);
  const glass = o.glass ?? 'bldPane';
  const frosted = glass === 'bldFrosted';
  const lit = pane(K, glass, face, at, u - w / 2, u + w / 2, y - h / 2, y + h / 2, 0.05, 0.06,
    o.lit ?? (frosted ? LIT.frosted : LIT.home), frosted ? WINDOW_TONES.frosted : WINDOW_TONES.home);
  if (o.inside) {
    const side = o.insideSide ?? -1;
    const cw = w * (o.insideFrac ?? 0.34);
    const c0 = side < 0 ? u - w / 2 : u + w / 2 - cw;
    /* A drawn curtain in front of a lit room glows in its own colour. */
    if (lit && CURTAIN_LIT[o.inside]) {
      K.glow(CURTAIN_LIT[o.inside], ...faceBox(face, at, c0, c0 + cw, y - h / 2 + 0.02, y + h / 2 - 0.02, 0.06, 0.065));
    } else {
      fb(K, o.inside, face, at, c0, c0 + cw, y - h / 2 + 0.02, y + h / 2 - 0.02, 0.06, 0.065);
    }
  }
  if (o.mullion !== false) {
    fb(K, f, face, at, u - 0.03, u + 0.03, y - h / 2, y + h / 2, 0.06, 0.09);
  }
  if (o.sill !== false) {
    fb(K, f, face, at, u - w / 2 - 0.12, u + w / 2 + 0.12, y - h / 2 - 0.13, y - h / 2 - 0.07, -0.01, 0.12);
  }
  if (o.grille) {
    /* 面格子: the aluminium grille over a corridor window. */
    const bars = Math.max(2, Math.round(w / 0.3));
    for (let i = 0; i <= bars; i += 1) {
      const bu = u - w / 2 + (i / bars) * w;
      fb(K, 'bldGrille', face, at, bu - 0.018, bu + 0.018, y - h / 2 - 0.05, y + h / 2 + 0.05, 0.1, 0.14);
    }
    fb(K, 'bldGrille', face, at, u - w / 2 - 0.05, u + w / 2 + 0.05, y + h / 2 + 0.02, y + h / 2 + 0.07, 0.08, 0.14);
    fb(K, 'bldGrille', face, at, u - w / 2 - 0.05, u + w / 2 + 0.05, y - h / 2 - 0.07, y - h / 2 - 0.02, 0.08, 0.14);
  }
}

/* What is behind a window, picked by the draw's own stream. */
const CURTAINS = ['curtainPink', 'curtainBlue', 'curtainCream', 'curtainGreen'];
function insideOf(rng, lit = 0.12) {
  if (rng.chance(lit)) {
    return { glass: 'glassLit', inside: null };
  }
  if (rng.chance(0.62)) {
    return { glass: 'bldPane', inside: rng.pick(CURTAINS), insideSide: rng.chance(0.5) ? -1 : 1, insideFrac: rng.range(0.25, 0.5) };
  }
  return { glass: rng.chance(0.3) ? 'glassDark' : 'bldPane', inside: null };
}

/* A downpipe on a corner, with its hopper at the top. */
function downpipe(K, x, z, y0, y1) {
  K.cyl('bldRail', [x, y0, z], [x, y1 - 0.2, z], 0.05, 6);
  K.box('bldRail', x - 0.1, y1 - 0.25, z - 0.1, x + 0.1, y1 - 0.05, z + 0.1);
}

/* ------------------------------------------------------------------ *
 * AN EXTERNAL STEEL STAIR, dog leg, against a side wall.
 *
 * Flights run along x. The landing on each floor is at the stair's `xa`
 * end, the flights leave it going `back`, and each storey is two flights:
 * the outer one up to a half landing at the far end, the inner one, against
 * the wall, back up to the next landing. Every tread is a solid box drawn
 * as itself, 0.2 m thick, so neighbouring treads overlap by a couple of
 * centimetres and the underside of a flight is a closed saw tooth: a quad
 * flying under a stair hits steel, not a gap between treads. The two
 * flights touch, with no well between them, so there is no slot down the
 * middle either.
 *
 * Pure, so the layout makes the solids from it and the draw adds the
 * stringers and handrails along the same lines.
 * ------------------------------------------------------------------ */

const RISE = 0.18;
const GOING = 0.26;
const TREAD = 0.2;

function stairGeom(o) {
  const { xa, back, zWall, sz, levels } = o;
  const fw = o.flightW ?? 1.2;
  const landD = o.landD ?? 1.6;
  const halfD = o.halfD ?? 1.2;
  const zMid = zWall + sz * fw;
  const zOut = zWall + sz * 2 * fw;
  const storeys = [];
  let runMax = 0;
  for (let j = 0; j + 1 < levels.length; j += 1) {
    const h = levels[j + 1] - levels[j];
    const n = Math.max(2, Math.round(h / 2 / RISE));
    storeys.push({ y0: levels[j], h, n, r: h / (2 * n) });
    runMax = Math.max(runMax, (n - 1) * GOING);
  }
  const X = (a) => xa + back * a;
  const span = (a0, a1) => [Math.min(X(a0), X(a1)), Math.max(X(a0), X(a1))];
  const zr = (za, zb) => [Math.min(za, zb), Math.max(za, zb)];
  const steps = [];
  const halves = [];
  const flights = [];
  for (const st of storeys) {
    const yMid = st.y0 + st.h / 2;
    for (let k = 1; k < st.n; k += 1) {
      const top = st.y0 + k * st.r;
      const [x0, x1] = span((k - 1) * GOING, k * GOING);
      const [z0, z1] = zr(zMid, zOut);
      steps.push({ lo: [x0, Math.max(0, top - TREAD), z0], hi: [x1, top, z1], nose: X((k - 1) * GOING) });
    }
    for (let k = 1; k < st.n; k += 1) {
      const top = yMid + k * st.r;
      const [x0, x1] = span((st.n - 1 - k) * GOING, (st.n - k) * GOING);
      const [z0, z1] = zr(zWall, zMid);
      steps.push({ lo: [x0, top - TREAD, z0], hi: [x1, top, z1], nose: X((st.n - k) * GOING) });
    }
    const [hx0, hx1] = span((st.n - 1) * GOING, runMax + halfD);
    const [hz0, hz1] = zr(zWall, zOut);
    halves.push({ lo: [hx0, yMid - TREAD, hz0], hi: [hx1, yMid, hz1], y: yMid });
    /* The pitch lines, nosing to nosing, for the stringers and rails. */
    flights.push({ a: [X(0), st.y0, (zMid + zOut) / 2], b: [X((st.n - 1) * GOING), yMid, (zMid + zOut) / 2], zs: [zMid, zOut] });
    flights.push({ a: [X((st.n - 1) * GOING), yMid, (zWall + zMid) / 2], b: [X(0), st.y0 + st.h, (zWall + zMid) / 2], zs: [zWall, zMid] });
  }
  const far = X(runMax + halfD);
  return { steps, halves, flights, zMid, zOut, far, near: X(-landD), runMax, landD, halfD, fw };
}

/* The solids of a stair: treads, half landings, the parapets round the
 * half landings, and two posts at its outer corners. */
function stairLayout(P, g, o) {
  const m = o.mat ?? 'bldStair';
  for (const s of g.steps) {
    P.box(m, s.lo[0], s.lo[1], s.lo[2], s.hi[0], s.hi[1], s.hi[2], { name: 'stairTread' });
  }
  const [zi, zo] = [Math.min(o.zWall, g.zOut), Math.max(o.zWall, g.zOut)];
  const outerAt = g.zOut;
  const t = 0.1;
  for (const hl of g.halves) {
    P.box(m, hl.lo[0], hl.lo[1], hl.lo[2], hl.hi[0], hl.hi[1], hl.hi[2], { name: 'stairLanding' });
    /* Solid sides round the half landing, 1.1 m, the same height as every
     * other parapet on the building, with 1.6 m of air over each. */
    const inward = g.far - Math.sign(g.far - g.near) * t;
    P.box(o.railMat ?? m, Math.min(g.far, inward), hl.y, zi, Math.max(g.far, inward), hl.y + 1.1, zo, { name: 'stairParapet' });
    P.box(o.railMat ?? m, hl.lo[0], hl.y, outerAt - Math.sign(outerAt - o.zWall) * t, hl.hi[0], hl.y + 1.1, outerAt, { name: 'stairParapet' });
  }
  /* Two posts carry the outside of the stair. */
  const top = o.top;
  const pz = outerAt - Math.sign(outerAt - o.zWall) * 0.07;
  for (const x of [g.near, g.far]) {
    const px = x - Math.sign(x - (g.near + g.far) / 2) * 0.07;
    P.post(m, px, pz, 0, top, 0.07, { name: 'stairPost' });
  }
}

/* Stringers and handrails, which are thin, so they are paint. */
function stairDraw(K, g, o) {
  const m = o.mat ?? 'bldStair';
  for (const f of g.flights) {
    for (const z of f.zs) {
      const zz = z + (z === o.zWall ? Math.sign(g.zOut - o.zWall) * 0.03 : 0);
      K.cyl(m, [f.a[0], f.a[1] - 0.12, zz], [f.b[0], f.b[1] - 0.12, zz], 0.07, 4);
    }
    /* The handrail on the open side, a metre over the nosings. */
    const zr = f.zs.includes(g.zOut) ? g.zOut - Math.sign(g.zOut - o.zWall) * 0.04 : o.zWall + Math.sign(g.zOut - o.zWall) * 0.08;
    K.cyl('bldRail', [f.a[0], f.a[1] + 1.0, zr], [f.b[0], f.b[1] + 1.0, zr], 0.025, 6);
    if (f.zs.includes(g.zOut)) {
      K.cyl('bldRail', [f.a[0], f.a[1] + 0.5, zr], [f.b[0], f.b[1] + 0.5, zr], 0.018, 5);
      const n = 3;
      for (let i = 0; i <= n; i += 1) {
        const t = i / n;
        const p = [f.a[0] + (f.b[0] - f.a[0]) * t, f.a[1] + (f.b[1] - f.a[1]) * t, zr];
        K.cyl('bldRail', [p[0], p[1], zr], [p[0], p[1] + 1.0, zr], 0.02, 5);
      }
    }
  }
}

/* ------------------------------------------------------------------ *
 * THE BUILDING.
 * ------------------------------------------------------------------ */

/* Storey heights: the ground storey and the ones above it. A block of
 * flats in this town is 2.9 m floor to floor; an office has a tall lobby
 * and a ceiling void; a warehouse bay is five metres; a shop is a tall
 * shop with a home over it. */
const STOREY = {
  flats: { g: 2.9, fh: 2.9, parapet: 0.9 },
  office: { g: 4.2, fh: 3.6, parapet: 1.1 },
  warehouse: { g: 5.0, fh: 5.0, parapet: 0.6 },
  shop: { g: 3.4, fh: 2.9, parapet: 0.6 },
};

/* The walls a style may wear, picked by the element's own seed so a street
 * of flats is not one colour. All of them are the town's. */
const WALLS = {
  flats: ['wallCream', 'wallBlue', 'wallPink', 'wallTea', 'wallSage', 'wallWhite'],
  office: ['concrete', 'wallGray', 'bldTilePale', 'wallWhite'],
  warehouse: ['sheet', 'sheetBlue', 'sheetGreen', 'bldSheetCream'],
  shop: ['wallWhite', 'wallCream', 'wallTea', 'wallPink', 'wallBlue'],
};

/* A second tone for parapets and the stair tower: what gives a block its
 * horizontal bands at a distance. */
const ACCENTS = {
  flats: ['wallWhite', 'bldTile', 'concreteMid', 'bldTilePale'],
  office: ['concreteMid', 'bldSpandrelDark', 'concreteDark'],
  warehouse: ['trim'],
  shop: ['bldTile', 'concreteMid', 'wallWhite'],
};

const DOORS = ['bldDoorTeal', 'bldDoorBrown', 'bldDoorGrey'];

const SHOP_KINDS = ['conbini', 'ramen', 'bakery', 'hana', 'kosho', 'record', 'denki', 'sozai', 'cleaning', 'bunbo', 'bento', 'zakka'];
const NOREN = { ramen: 'ramen', record: 'record', bento: 'bento' };
const AWNINGS = ['awning', 'bldAwningGreen', 'bldAwningBlue', 'bldAwningOrange'];

/* The open corridor of a block of flats and its balconies. */
const CORRIDOR = 1.6;
const BALCONY = 1.8;
const SLAB = 0.18;
const RAIL_H = 1.1;
const RAIL_T = 0.12;
const COPE = 0.2;

/* Everything the layout and the draw both need, worked out once. */
function buildingSpec(el) {
  const d = el.dims ?? {};
  const style = BUILDING_STYLES.includes(el.style) ? el.style : 'flats';
  const S = STOREY[style];
  const W = clamp(Number(d.width) || 16, 4, 120);
  const D = clamp(Number(d.depth) || 9, 4, 120);
  const N = clamp(Math.round(Number(d.floors) || 1), 1, 40);
  const level = (i) => (i <= 0 ? 0 : S.g + (i - 1) * S.fh);
  const H = level(N);
  const rng = seededRandom(seedOf(el));
  const wall = rng.pick(WALLS[style]);
  let accent = rng.pick(ACCENTS[style]);
  if (accent === wall) {
    accent = 'concreteMid';
  }
  const door = rng.pick(DOORS);
  const side = rng.chance(0.5) ? 1 : -1;
  const kind = rng.pick(SHOP_KINDS);
  const awning = rng.pick(AWNINGS);
  /*
   * The arcade through the ground floor, front to back, or nothing. Never
   * narrower than the gap rule plus room to breathe, and never so wide
   * that a pier either side of it is thinner than a metre.
   */
  let pw = Number(d.passage) || 0;
  let ph = 0;
  if (pw > 0) {
    pw = W - 2 < GAP_MIN + 0.8 ? 0 : clamp(pw, GAP_MIN + 0.8, W - 2);
  }
  if (pw > 0) {
    if (style === 'flats') {
      ph = Math.min(level(1) - SLAB, H - 0.9);
    } else if (style === 'office') {
      ph = N >= 4 ? level(2) - 0.6 : Math.min(level(1) - 0.4, H - 0.9);
    } else if (style === 'warehouse') {
      ph = Math.min(S.fh * 0.9, H - 0.9);
    } else {
      ph = Math.min(2.35, H - 0.9);
    }
    if (ph < GAP_MIN + 0.4) {
      pw = 0;
      ph = 0;
    }
  }
  return {
    el, style, S, W, D, N, level, H, wall, accent, door, side, kind, awning, pw, ph,
    xf: D / 2, xb: -D / 2, z0: -W / 2, z1: W / 2,
    units: Math.max(1, Math.round(W / 5.6)),
    bays: Math.max(1, Math.round(W / 3.0)),
  };
}

/* The body: one box, so the roof is one surface the plant lands on. With
 * an arcade it is three: a pier either side and the storeys over it, whose
 * underside is the arcade's ceiling. */
function bodyLayout(P, s) {
  const { xf, xb, z0, z1, H, pw, ph } = s;
  if (pw) {
    P.box(s.wall, xb, 0, z0, xf, ph, -pw / 2, { name: 'body' });
    P.box(s.wall, xb, 0, pw / 2, xf, ph, z1, { name: 'body' });
    P.box(s.wall, xb, ph, z0, xf, H, z1, { name: 'body' });
  } else {
    P.box(s.wall, xb, 0, z0, xf, H, z1, { name: 'body' });
  }
}

/* A parapet round a rectangle of roof, `t` thick and `h` tall. */
function parapetLayout(P, m, x0, x1, z0, z1, y, h, t, name = 'parapet') {
  P.box(m, x0, y, z0, x1, y + h, z0 + t, { name });
  P.box(m, x0, y, z1 - t, x1, y + h, z1, { name });
  P.box(m, x0, y, z0 + t, x0 + t, y + h, z1 - t, { name });
  P.box(m, x1 - t, y, z0 + t, x1, y + h, z1 - t, { name });
}

/*
 * A rooftop water tank on a stand tall enough to fly under: the FRP panel
 * tank every Japanese block has. 1.6 m of air under it and 1.8 m between
 * its legs, so the stand is a gap and never a slot. Returns false if the
 * roof has no room for it a gap rule's width from every edge.
 */
function tankLayout(P, rx0, rx1, rz0, rz1, H, prefer) {
  const tx = 2.0;
  const tz = 2.2;
  const lo = [rx0 + GAP_MIN, rz0 + GAP_MIN];
  const hi = [rx1 - GAP_MIN - tx, rz1 - GAP_MIN - tz];
  if (hi[0] < lo[0] || hi[1] < lo[1]) {
    return null;
  }
  const x = clamp(prefer[0] - tx / 2, lo[0], hi[0]);
  const z = clamp(prefer[1] - tz / 2, lo[1], hi[1]);
  const legH = 1.6;
  for (const [lx, lz] of [[0.1, 0.1], [tx - 0.1, 0.1], [0.1, tz - 0.1], [tx - 0.1, tz - 0.1]]) {
    P.post('metalDark', x + lx, z + lz, H, H + legH, 0.07, { name: 'tankLeg' });
  }
  P.box('tank', x, H + legH, z, x + tx, H + legH + 1.5, z + tz, { name: 'tank' });
  return { x0: x, x1: x + tx, z0: z, z1: z + tz, y0: H + legH, y1: H + legH + 1.5 };
}

function flatsLayout(P, s) {
  const { W, D, N, level, H, xf, xb, z0, z1, side, units } = s;
  const rng = seededRandom(seedOf(s.el) ^ 0x1b873593);
  bodyLayout(P, s);
  /*
   * The stair. Up to five storeys it is the open steel stair a walk up
   * has, at the corridor's end; taller, it is a concrete tower with the
   * lift in it, rising a storey over the roof. Either way the corridor
   * runs on past the building's side as the stair's landing, and ends in
   * a parapet like the rest of it, so a pilot running the corridor leaves
   * over the end the way they left over the front.
   */
  const tower = N >= 6;
  const zw = side > 0 ? z1 : z0;
  const stairFits = N >= 2 && W >= 6 && D >= 4.5;
  const ext = stairFits ? (tower ? 3.0 : 2.4) : 0;
  const zo = zw + side * ext;
  const levels = [];
  for (let i = 0; i < N; i += 1) {
    levels.push(level(i));
  }
  for (let i = 1; i <= N; i += 1) {
    const y = level(i);
    const withStair = ext > 0 && i < N;
    const za = withStair ? Math.min(z0, zo) : z0;
    const zb = withStair ? Math.max(z1, zo) : z1;
    P.box('concrete', xf, y - SLAB, za, xf + CORRIDOR, y, zb, { name: 'corridorSlab' });
    if (i < N) {
      P.box(s.accent, xf + CORRIDOR - RAIL_T, y, za, xf + CORRIDOR, y + RAIL_H, zb, { name: 'corridorParapet' });
      if (withStair) {
        const e0 = side > 0 ? zo - RAIL_T : zo;
        P.box(s.accent, xf, y, e0, xf + CORRIDOR - RAIL_T, y + RAIL_H, e0 + RAIL_T, { name: 'landingParapet' });
      }
    }
  }
  if (tower) {
    const td = Math.min(5.0, D);
    P.box(s.accent, xf - td, 0, Math.min(zw, zo), xf, H + 2.7, Math.max(zw, zo), { name: 'tower' });
  } else if (ext) {
    const g = stairGeom({ xa: xf, back: -1, zWall: zw, sz: side, levels, landD: CORRIDOR, halfD: 1.2, flightW: 1.2 });
    stairLayout(P, g, { zWall: zw, top: level(N - 1) + RAIL_H, mat: 'bldStair', railMat: s.accent });
  }

  /*
   * THE BALCONIES, round the back: a slab on every floor, a solid parapet,
   * and a divider between every flat. Each flat's balcony is a closed
   * cell open only over its parapet, 1.8 m deep, with the air conditioner
   * against the wall and 1.4 m between it and the parapet.
   */
  const uw = W / units;
  for (let i = 1; i <= N; i += 1) {
    const y = level(i);
    P.box('concrete', xb - BALCONY, y - SLAB, z0, xb, y, z1, { name: 'balconySlab' });
    if (i < N) {
      P.box(s.wall, xb - BALCONY, y, z0, xb - BALCONY + RAIL_T, y + RAIL_H, z1, { name: 'balconyParapet' });
      for (let k = 1; k < units; k += 1) {
        const z = z0 + k * uw;
        P.box('bldDivider', xb - BALCONY + RAIL_T, y, z - 0.03, xb, level(i + 1) - SLAB, z + 0.03, { name: 'divider' });
      }
      for (let k = 0; k < units; k += 1) {
        if (!rng.chance(0.8) || uw < 2.4) {
          continue;
        }
        const ze = k === units - 1 ? z0 + (k + 1) * uw : z0 + (k + 1) * uw - 0.03;
        P.box('acUnit', xb - 0.28, y, ze - 0.8, xb, y + 0.62, ze, { name: 'acUnit' });
      }
    }
  }

  /* The roof: the body and both eaves, one surface, a parapet round it. */
  const rx0 = xb - BALCONY;
  const rx1 = xf + CORRIDOR;
  parapetLayout(P, s.accent, rx0, rx1, z0, z1, H, s.S.parapet, COPE);
  if (!tower) {
    tankLayout(P, rx0 + COPE, rx1 - COPE, z0 + COPE, z1 - COPE, H, [xb + D * 0.3, -side * W * 0.25]);
  }
  /* An aerial, clamped into the front corner of the parapet away from
   * the stair, where nothing else on the roof comes near it. */
  const az = side > 0 ? z0 + COPE + 0.03 : z1 - COPE - 0.03;
  P.post('metalDark', rx1 - COPE - 0.03, az, H, H + s.S.parapet + 2.6, 0.035, { name: 'aerial' });
}

function officeLayout(P, s) {
  const { W, D, N, level, H, xf, xb, z0, z1, side, bays, pw, ph } = s;
  bodyLayout(P, s);
  const par = s.S.parapet;
  parapetLayout(P, s.accent, xb, xf, z0, z1, H, par, COPE);
  /*
   * FINS at every bay, 0.5 m off the front and 0.2 wide, from the ground
   * to the parapet's top: a rhythm of vertical ink, and a comb 2.8 m
   * between teeth for a quad to weave. Over the arcade they start at its
   * ceiling.
   */
  for (let b = 0; b <= bays; b += 1) {
    const z = z0 + b * (W / bays);
    const za = clamp(z - 0.1, z0, z1 - 0.2);
    const zb = za + 0.2;
    const inMouth = pw && zb > -pw / 2 && za < pw / 2;
    P.box(s.accent, xf, inMouth ? ph : 0, za, xf + 0.5, H + par, zb, { name: 'fin' });
  }
  /* The entrance canopy, on the fins' faces, from the middle of one fin
   * to the middle of another, so its ends are closed against them. */
  if (!pw && W >= 8) {
    const bL = Math.max(0, Math.ceil(bays / 2) - 1);
    const bR = Math.min(bays, Math.floor(bays / 2) + 1);
    P.box('concreteDark', xf, 3.3, z0 + bL * (W / bays), xf + 3.0, 3.55, z0 + bR * (W / bays), { name: 'canopy' });
  }
  /*
   * The tenant board, bolted to the corner fin: the tall stack of names a
   * mixed use block wears. Solid, because it is a thing a quad clips.
   */
  if (N >= 3) {
    const zc = side > 0 ? z1 - 0.1 : z0 + 0.1;
    const bh = Math.min(9, level(N) - level(1) - 0.6);
    if (bh > 2) {
      P.box('trim', xf + 0.5, level(1) + 0.4, zc - 0.13, xf + 1.35, level(1) + 0.4 + bh, zc + 0.13, { name: 'tenantBoard' });
    }
  }
  /*
   * THE EMERGENCY STAIR, the zigzag of steel on the back corner of every
   * office in Japan. It climbs to the top floor, and its landings are the
   * floor's fire doors.
   */
  const zw = side > 0 ? z1 : z0;
  if (N >= 2 && D >= 6 && W >= 6) {
    const levels = [];
    for (let i = 0; i < N; i += 1) {
      levels.push(level(i));
    }
    const g = stairGeom({ xa: xb + 1.6, back: 1, zWall: zw, sz: side, levels, landD: 1.6, halfD: 1.2, flightW: 1.2 });
    for (let i = 1; i < N; i += 1) {
      const y = level(i);
      const [za, zb] = [Math.min(zw, g.zOut), Math.max(zw, g.zOut)];
      P.box('bldStair', xb, y - TREAD, za, xb + 1.6, y, zb, { name: 'stairLanding' });
      P.box('bldStair', xb, y, za, xb + 0.1, y + RAIL_H, zb, { name: 'stairParapet' });
      const e0 = side > 0 ? g.zOut - 0.1 : g.zOut;
      P.box('bldStair', xb + 0.1, y, e0, xb + 1.6, y + RAIL_H, e0 + 0.1, { name: 'stairParapet' });
    }
    stairLayout(P, g, { zWall: zw, top: level(N - 1) + RAIL_H, mat: 'bldStair' });
  }
  /*
   * THE ROOF: a plant room, a cooling tower and a sign on legs, each a gap
   * rule's width from the parapet and from each other, or against it. The
   * sign stands 1.8 m clear of the roof, which is the line under it.
   */
  const ix0 = xb + COPE;
  const ix1 = xf - COPE;
  const iz0 = z0 + COPE;
  const iz1 = z1 - COPE;
  if (ix1 - ix0 >= 7 && iz1 - iz0 >= 7) {
    /* The plant room stands against the back parapet. */
    const pz0 = clamp(-side * W * 0.2 - 1.8, iz0 + GAP_MIN, iz1 - GAP_MIN - 3.6);
    P.box('concreteMid', ix0, H, pz0, ix0 + 3.0, H + 2.6, pz0 + 3.6, { name: 'plantRoom' });
    /* The cooling tower, a gap from the plant room. */
    const cx0 = ix0 + 3.0 + GAP_MIN + 0.2;
    if (cx0 + 2.2 <= ix1 - GAP_MIN) {
      P.box('metal', cx0, H, pz0, cx0 + 2.2, H + 2.0, pz0 + 2.2, { name: 'coolingTower' });
    }
  }
  if (ix1 - ix0 >= 6 && iz1 - iz0 >= 9) {
    /* The rooftop sign stands on the front parapet on three legs, its
     * underside the gap rule's 1.4 m over the parapet's top: a slot a
     * pilot can thread along the whole front of the roof. */
    const sw = Math.min(12, iz1 - iz0 - 2 * GAP_MIN);
    const y0 = H + par + GAP_MIN;
    const sz0 = -sw / 2;
    P.box('billboardSteel', xf - 0.3, y0, sz0, xf, y0 + Math.min(3.2, sw * 0.35), sz0 + sw, { name: 'roofSign' });
    for (const lz of [sz0 + 0.2, sz0 + sw / 2, sz0 + sw - 0.2]) {
      P.post('billboardSteel', xf - 0.1, lz, H + par, y0, 0.1, { name: 'roofSignLeg' });
    }
  }
}

function warehouseLayout(P, s) {
  const { W, D, H, xf, xb, z0, z1, side, pw } = s;
  bodyLayout(P, s);
  parapetLayout(P, 'trim', xb, xf, z0, z1, H, s.S.parapet, COPE);
  /*
   * THE OFFICE ANNEX: two storeys of prefab office on the front corner,
   * with the steel stair up to its first floor door. The dock and its
   * canopy run the rest of the front.
   */
  const annex = W >= 16 && H >= 7 && D >= 8;
  const aw = annex ? clamp(W * 0.28, 6, 9) : 0;
  const zEnd = side > 0 ? z1 : z0;
  const zIn = zEnd - side * aw;
  if (annex) {
    P.box(s.wall === 'sheet' ? 'bldSheetCream' : 'sheet', xf, 0, Math.min(zIn, zEnd), xf + 4.5, 6.8, Math.max(zIn, zEnd), { name: 'annex' });
    /* The straight stair up its face, rising toward the building's end. */
    const n = 19;
    const r = 3.4 / n;
    const g = 0.25;
    const zs = zIn + side * 0.3;
    if ((n - 1) * g + 1.3 <= aw - 0.3) {
      for (let k = 1; k < n; k += 1) {
        const top = k * r;
        const za = zs + side * (k - 1) * g;
        const zb = zs + side * k * g;
        P.box('bldStairGreen', xf + 4.5, Math.max(0, top - TREAD), Math.min(za, zb), xf + 5.5, top, Math.max(za, zb), { name: 'stairTread' });
      }
      const la = zs + side * (n - 1) * g;
      const lb = zEnd;
      P.box('bldStairGreen', xf + 4.5, 3.4 - TREAD, Math.min(la, lb), xf + 5.5, 3.4, Math.max(la, lb), { name: 'stairLanding' });
      P.box('bldFrame', xf + 5.4, 3.4, Math.min(la, lb), xf + 5.5, 4.5, Math.max(la, lb), { name: 'stairParapet' });
      P.box('bldFrame', xf + 4.5, 3.4, Math.min(lb, lb - side * 0.1), xf + 5.4, 4.5, Math.max(lb, lb - side * 0.1), { name: 'stairParapet' });
      P.post('bldStairGreen', xf + 5.43, lb - side * 0.07, 0, 4.5, 0.07, { name: 'stairPost' });
    }
  }
  /*
   * THE DOCK, a metre and a tenth high, three wide, and the canopy over
   * it at the height a truck backs under. 3.5 m of air between the two:
   * the covered skim along the front.
   */
  const dz0 = annex ? (side > 0 ? z0 + 0.6 : zIn) : z0 + 0.6;
  const dz1 = annex ? (side > 0 ? zIn : z1 - 0.6) : z1 - 0.6;
  const ch = Math.min(4.9, H - 0.4);
  const runs = pw ? [[dz0, -pw / 2], [pw / 2, dz1]] : [[dz0, dz1]];
  for (const [a, b] of runs) {
    if (b - a > 1.0) {
      P.box('concreteMid', xf, 0, a, xf + 2.4, 1.1, b, { name: 'dock' });
    }
  }
  if (dz1 - dz0 > 2 && ch - 0.3 > 1.1 + GAP_MIN) {
    P.box('trim', xf, ch - 0.3, dz0, xf + 3.4, ch, dz1, { name: 'loadingCanopy' });
  }
  /*
   * THE ROOF: raised skylight strips and a row of turbine ventilators down
   * the middle between them, all a gap rule's width apart.
   */
  const ix0 = xb + COPE;
  const ix1 = xf - COPE;
  const lx0 = ix0 + GAP_MIN + 0.4;
  const lx1 = ix1 - GAP_MIN - 0.4;
  if (lx1 - lx0 > 3) {
    const pitch = 5.0;
    const n = Math.floor((W - 2 * COPE - 2 * GAP_MIN) / pitch);
    for (let k = 0; k < n; k += 1) {
      const zc = (k - (n - 1) / 2) * pitch;
      P.box('glassBlue', lx0, H, zc - 0.6, lx1, H + 0.35, zc + 0.6, { name: 'skylight' });
      if (k < n - 1) {
        const vxs = lx1 - lx0 >= 4.4 ? [lx0 + (lx1 - lx0) * 0.25, lx0 + (lx1 - lx0) * 0.75] : [(lx0 + lx1) / 2];
        for (const vx of vxs) {
          P.post('metal', vx, zc + pitch / 2, H + 0.3, H + 0.75, 0.3, { name: 'ventilator', look: 'capsule', seg: 10 });
        }
      }
    }
  }
}

function shopLayout(P, s) {
  const { W, N, level, H, xf, xb, z0, z1, side } = s;
  bodyLayout(P, s);
  /*
   * 看板建築: the front parapet is raised into a false front a storey
   * tall over the roof, stepped up in the middle, which is the silhouette
   * a shop house on a Japanese street has and a block of flats does not.
   * The other three sides keep a low parapet.
   */
  const par = s.S.parapet;
  const ff = 1.7;
  P.box(s.accent, xf - 0.3, H, z0, xf, H + ff, z1, { name: 'falseFront' });
  if (W >= 6) {
    P.box(s.accent, xf - 0.3, H + ff, -W * 0.22, xf, H + ff + 0.7, W * 0.22, { name: 'falseFront' });
  }
  P.box(s.wall, xb, H, z0, xf - 0.3, H + par, z0 + COPE, { name: 'parapet' });
  P.box(s.wall, xb, H, z1 - COPE, xf - 0.3, H + par, z1, { name: 'parapet' });
  P.box(s.wall, xb, H, z0 + COPE, xb + COPE, H + par, z1 - COPE, { name: 'parapet' });
  /*
   * THE SHOPFRONT, stacked the way a real one is, every piece on the one
   * below it so there is no slot between them: the shutter box over the
   * glass, the awning on the shutter box with its valance hanging at its
   * front edge, the fascia board on the awning.
   */
  /* On the side the vending machines stand, the awning stops 0.8 m in,
   * which keeps its corner the gap rule from the machines' tops. */
  const sf0 = z0 + (side > 0 ? 0.8 : 0.3);
  const sf1 = z1 - (side > 0 ? 0.3 : 0.8);
  P.box('bldShutterBox', xf, 2.35, sf0, xf + 0.25, 2.6, sf1, { name: 'shutterBox' });
  P.box(s.awning, xf, 2.6, sf0, xf + 1.2, 2.75, sf1, { name: 'awning' });
  P.box(s.awning, xf + 1.12, 2.3, sf0, xf + 1.2, 2.6, sf1, { name: 'valance' });
  P.box(s.accent, xf, 2.75, z0 + 0.1, xf + 0.3, 3.35, z1 - 0.1, { name: 'fascia' });
  /* The blade sign on the corner, standing on the awning and the fascia,
   * so there is no gap between it and them. */
  const zc = side > 0 ? z1 - 0.45 : z0 + 0.45;
  const bh = Math.min(3.6, H - 2.75 - 0.3);
  if (bh >= 1.8) {
    P.box('trim', xf, 2.75, zc - 0.1, xf + 0.9, 2.75 + bh, zc + 0.1, { name: 'blade' });
  }
  /* Small balconies on the home over the shop, clear of the blade. */
  const bw = Math.min(3.2, W - 3.9);
  if (bw >= 1.6) {
    for (let i = 2; i < N; i += 1) {
      const y = level(i);
      const c = -side * 0.4;
      /* 1.5 deep, so the well behind the rail is the gap rule wide. */
      P.box('concrete', xf, y - 0.12, c - bw / 2, xf + 1.5, y, c + bw / 2, { name: 'balconySlab' });
      P.box(s.accent, xf + 1.4, y, c - bw / 2, xf + 1.5, y + 1.0, c + bw / 2, { name: 'balconyParapet' });
    }
  }
  /*
   * Two drinks machines against the side wall, flush with the front,
   * touching each other and the wall, where a shop puts them. Their size
   * is the town's machine's, 1.12 by 1.95 by 0.72.
   */
  const vs = -side;
  const vz = vs > 0 ? z1 : z0;
  const vr = seededRandom(seedOf(s.el) ^ 0x3c6ef372);
  for (let i = 0; i < 2; i += 1) {
    const a = vz + vs * i * 1.12;
    const b = a + vs * 1.12;
    P.box(vr.pick(['bldVendWhite', 'bldVendRed', 'bldVendBlue']), xf - 0.72, 0, Math.min(a, b), xf, 1.95, Math.max(a, b), { name: 'vending' });
  }
  /* The air conditioner of the flat upstairs, on a bracket on the plain
   * side wall, against it. */
  if (N >= 2 && s.D >= 5) {
    const zw = side > 0 ? z1 : z0;
    P.box('acUnit', xb + 1.2, level(1) + 0.3, Math.min(zw, zw + side * 0.3), xb + 2.0, level(1) + 0.9, Math.max(zw, zw + side * 0.3), { name: 'acUnit' });
  }
  /* An aerial clamped into a back corner of the parapet. */
  P.post('metalDark', xb + COPE + 0.03, side > 0 ? z1 - COPE - 0.03 : z0 + COPE + 0.03, H, H + par + 2.4, 0.035, { name: 'aerial' });
}

/*
 * THE LAYOUT. Front is +x, so the facade a pilot is meant to see first,
 * with its corridor and its doors, faces the way the author pointed it.
 */
export function buildingLayout(el) {
  const s = buildingSpec(el);
  const P = new Parts();
  if (s.style === 'flats') {
    flatsLayout(P, s);
  } else if (s.style === 'office') {
    officeLayout(P, s);
  } else if (s.style === 'warehouse') {
    warehouseLayout(P, s);
  } else {
    shopLayout(P, s);
  }
  return P.list;
}

/* ------------------------------------------------------------------ *
 * The drawing. Everything here is paint: frames, glass, doors, signs,
 * pipes, washing. Nothing a quad can hit is added here, and nothing here
 * stands more than a few centimetres off the solid it is painted on,
 * except where it is thin (a rail, a wire, a stringer).
 * ------------------------------------------------------------------ */

/* The roof: its membrane inside the parapet, and the coping on top of the
 * parapet as four strips, so the roof stays open to land on. */
function roofDraw(K, x0, x1, z0, z1, y, par, cope = 'bldFrame') {
  K.box('bldRoof', x0 + COPE, y - 0.02, z0 + COPE, x1 - COPE, y + 0.012, z1 - COPE);
  const t = COPE + 0.06;
  const yt = y + par;
  K.box(cope, x0 - 0.03, yt, z0 - 0.03, x1 + 0.03, yt + 0.07, z0 + t);
  K.box(cope, x0 - 0.03, yt, z1 - t, x1 + 0.03, yt + 0.07, z1 + 0.03);
  K.box(cope, x0 - 0.03, yt, z0 + t, x0 + t, yt + 0.07, z1 - t);
  K.box(cope, x1 - t, yt, z0 + t, x1 + 0.03, yt + 0.07, z1 - t);
  /* Seams in the membrane, a line every few metres. */
  const n = Math.floor((x1 - x0) / 3.5);
  for (let i = 1; i <= n; i += 1) {
    const x = x0 + (i / (n + 1)) * (x1 - x0);
    K.box('bldRoofSeam', x - 0.03, y + 0.012, z0 + COPE, x + 0.03, y + 0.022, z1 - COPE);
  }
}

/* The panel tank's seams, its lid, its ladder. The seams that run over
 * the top stand 1.2 cm proud of it, as a flange does: flush, their tops
 * lay in the tank's own top and the two paints fought along every seam. */
function tankDraw(K, p) {
  const [ax, ay, az] = p.lo;
  const [bx, by, bz] = p.hi;
  for (let k = 1; k < 2; k += 1) {
    const x = ax + (k / 2) * (bx - ax);
    K.box('tankSeam', x - 0.025, ay, az - 0.025, x + 0.025, by + 0.012, bz + 0.025);
  }
  for (let k = 1; k < 3; k += 1) {
    const z = az + (k / 3) * (bz - az);
    K.box('tankSeam', ax - 0.025, ay, z - 0.025, bx + 0.025, by + 0.012, z + 0.025);
  }
  K.box('tankSeam', ax - 0.025, (ay + by) / 2 - 0.025, az - 0.025, bx + 0.025, (ay + by) / 2 + 0.025, bz + 0.025);
  K.box('metalDark', ax - 0.04, ay - 0.1, az - 0.04, bx + 0.04, ay, bz + 0.04);
  K.box('tankSeam', (ax + bx) / 2 - 0.3, by, (az + bz) / 2 - 0.3, (ax + bx) / 2 + 0.3, by + 0.06, (az + bz) / 2 + 0.3);
  K.ladder('metalDark', [bx + 0.06, ay - 1.55, (az + bz) / 2], [bx + 0.06, by, (az + bz) / 2], 0.4);
}

/*
 * THE ARCADE, which has to look like a way through and not a dark hole: a
 * portal framed on both faces, a lit ceiling, a tiled lining you can see
 * the far end of, a paved floor, and a sign over the mouth.
 */
function passageDraw(K, s, lining) {
  const { xf, xb, pw, ph } = s;
  const hw = pw / 2;
  for (const [face, at] of [['+x', xf], ['-x', xb]]) {
    fb(K, 'bldFrame', face, at, -hw - 0.25, -hw, 0, ph + 0.25, -0.01, 0.1);
    fb(K, 'bldFrame', face, at, hw, hw + 0.25, 0, ph + 0.25, -0.01, 0.1);
    fb(K, 'bldFrame', face, at, -hw - 0.25, hw + 0.25, ph, ph + 0.25, -0.01, 0.1);
  }
  /* The lining, a centimetre off each pier, with a dado of tile. */
  K.box(lining, xb + 0.02, 0, -hw - 0.01, xf - 0.02, ph, -hw + 0.01);
  K.box(lining, xb + 0.02, 0, hw - 0.01, xf - 0.02, ph, hw + 0.01);
  K.box('bldTile', xb + 0.02, 0, -hw - 0.015, xf - 0.02, 1.0, -hw + 0.02);
  K.box('bldTile', xb + 0.02, 0, hw - 0.02, xf - 0.02, 1.0, hw + 0.015);
  /* The ceiling: a pale soffit and a light every three metres. */
  K.box('bldFrame', xb + 0.02, ph - 0.02, -hw, xf - 0.02, ph, hw);
  const n = Math.max(1, Math.round((xf - xb) / 3));
  for (let i = 0; i < n; i += 1) {
    const x = xb + ((i + 0.5) / n) * (xf - xb);
    K.box('lampGlow', x - 0.5, ph - 0.07, -0.12, x + 0.5, ph - 0.02, 0.12);
  }
  /* The floor, paved, a centimetre proud. */
  K.box('bldPaving', xb, 0, -hw, xf, 0.012, hw);
  /* Wall lamps down each side, and the sign over the front of the mouth. */
  for (let i = 0; i < n; i += 1) {
    const x = xb + ((i + 0.5) / n) * (xf - xb);
    K.box('lampGlow', x - 0.12, ph * 0.72, -hw, x + 0.12, ph * 0.72 + 0.2, -hw + 0.08);
    K.box('lampGlow', x - 0.12, ph * 0.72, hw - 0.08, x + 0.12, ph * 0.72 + 0.2, hw);
  }
  const sw = Math.min(pw * 0.8, 2.4);
  if (s.style === 'office' || s.style === 'warehouse') {
    K.sign('bldThrough', xf + 0.12, ph + 0.5, 0, sw, sw / 4, '+x', s.style === 'office' ? 0 : 1);
  } else if (s.style === 'shop') {
    /* Under the shop's shutter box there is no wall to sign, so the mouth
     * is lit instead: a strip along the underside of the box. */
    K.box('lampGlow', xf + 0.04, ph - 0.03, -hw + 0.1, xf + 0.2, ph, hw - 0.1);
  }
}

function flatsDraw(K, s, parts, rng) {
  const { W, N, level, H, xf, xb, z0, z1, side, units, pw } = s;
  const uw = W / units;
  const rx0 = xb - BALCONY;
  const rx1 = xf + CORRIDOR;
  /* The plinth, and the band at every floor on the two plain sides. */
  plinthDraw(K, s, 0.4);
  for (let i = 1; i < N; i += 1) {
    for (const [face, at] of [['+z', z1], ['-z', z0]]) {
      fb(K, 'band', face, at, xb, xf, level(i) - 0.12, level(i) + 0.04, -0.01, 0.04);
    }
  }
  roofDraw(K, rx0, rx1, z0, z1, H, s.S.parapet);
  /* A handrail along the top of every corridor and balcony parapet. */
  for (const p of parts) {
    if (p.name === 'corridorParapet' || p.name === 'balconyParapet' || p.name === 'landingParapet') {
      K.box('bldRail', p.lo[0] - 0.02, p.hi[1], p.lo[2], p.hi[0] + 0.02, p.hi[1] + 0.06, p.hi[2]);
      /* A shadow line along the outside of the parapet, at the slab, and
       * on the balconies a groove under the rail, the joint of the precast
       * panel they are made of. */
      if (p.name === 'balconyParapet') {
        K.box('concreteDark', p.lo[0] - 0.02, p.hi[1] - 0.3, p.lo[2], p.lo[0], p.hi[1] - 0.26, p.hi[2]);
      }
      if (p.name !== 'landingParapet') {
        const out = p.name === 'corridorParapet' ? p.hi[0] : p.lo[0];
        const o = p.name === 'corridorParapet' ? 1 : -1;
        K.box('concreteDark', out, p.lo[1] - SLAB - 0.04, p.lo[2], out + o * 0.03, p.lo[1] - SLAB + 0.02, p.hi[2]);
      }
    }
    if (p.name === 'tank') {
      tankDraw(K, p);
    }
    if (p.name === 'acUnit') {
      /* The fan, a dark disc behind a grille, on the unit's open face. */
      const zc = (p.lo[2] + p.hi[2]) / 2;
      K.box('metalDark', p.lo[0] - 0.01, p.lo[1] + 0.1, zc - 0.28, p.lo[0], p.lo[1] + 0.52, zc + 0.14);
      K.box('bldFrame', p.lo[0] - 0.02, p.lo[1] + 0.29, zc - 0.28, p.lo[0] - 0.01, p.lo[1] + 0.33, zc + 0.14);
    }
    if (p.name === 'divider') {
      /* The frame round the fire break panel. */
      K.box('bldFrame', p.lo[0], p.lo[1], p.lo[2] - 0.01, p.hi[0], p.lo[1] + 0.06, p.hi[2] + 0.01);
      K.box('bldFrame', p.lo[0], p.lo[1], p.lo[2] - 0.01, p.lo[0] + 0.06, p.hi[1], p.hi[2] + 0.01);
    }
    if (p.name === 'aerial') {
      const [x, , z] = p.a;
      const top = p.b[1];
      for (let k = 0; k < 5; k += 1) {
        K.cyl('metalDark', [x, top - 0.9 + k * 0.17, z - 0.35 + k * 0.03], [x, top - 0.9 + k * 0.17, z + 0.35 - k * 0.03], 0.012, 4);
      }
      K.cyl('metalDark', [x - 0.02, top - 0.2, z], [x - 0.9, top - 0.2, z], 0.015, 4);
    }
  }

  /*
   * THE CORRIDOR SIDE: every flat's steel door in its frame, the meter
   * cupboard beside it, the kitchen window behind its grille, the gas
   * water heater, and a light on the soffit over the door. Ground floor
   * too, under the first slab. This is the face the brief means by "a
   * Japanese block of flats", and it is the one that faces the street.
   */
  const entrance = pw ? -1 : Math.floor(units / 2);
  /* A big block keeps its doors and windows and loses the small things
   * (heaters, cupboards, plates, soffit lights), which cannot be seen from
   * where a pilot sees a big block anyway and would cost it thousands of
   * triangles. */
  const rich = N * units <= 24;
  /* And a very big block (a tower of hundreds of flats) keeps only its
   * doors, its windows and its balconies' washing lines go too. */
  const sparse = N * units > 120;
  for (let i = 0; i < N; i += 1) {
    const y = level(i);
    const ceil = level(i + 1) - SLAB;
    for (let k = 0; k < units; k += 1) {
      const za = z0 + k * uw;
      const zb = za + uw;
      if (pw && zb > -pw / 2 - 0.2 && za < pw / 2 + 0.2 && i === 0) {
        continue;
      }
      if (i === 0 && k === entrance) {
        /* The entrance: glass doors, the name over them, post boxes. */
        const zc = (za + zb) / 2;
        fb(K, 'bldFrame', '+x', xf, zc - 1.25, zc + 1.25, 0.4, 2.12, -0.01, 0.05);
        pane(K, 'glassDark', '+x', xf, zc - 1.15, zc + 1.15, 0.45, 2.05, 0.05, 0.06, LIT.lobby, WINDOW_TONES.office);
        fb(K, 'bldFrame', '+x', xf, zc - 0.03, zc + 0.03, 0.45, 2.05, 0.06, 0.09);
        fb(K, 'lampGlow', '+x', xf, zc - 1.1, zc + 1.1, 1.75, 2.0, 0.06, 0.065);
        K.sign('flatsName', xf + 0.07, 2.4, zc, Math.min(1.7, uw - 0.6), 0.44, '+x', rng.int(0, 7));
        continue;
      }
      const dz = za + 0.35 + 0.45;
      if (zb - za < 2.8) {
        fb(K, 'trim', '+x', xf, dz - 0.52, dz + 0.52, y + 0.4, y + 2.52, -0.01, 0.05);
        fb(K, s.door, '+x', xf, dz - 0.45, dz + 0.45, y + 0.4, y + 2.45, 0.05, 0.08);
        continue;
      }
      const base = i === 0 ? 0.4 : 0;
      fb(K, 'trim', '+x', xf, dz - 0.52, dz + 0.52, y + base, y + base + 2.12, -0.01, 0.05);
      fb(K, s.door, '+x', xf, dz - 0.45, dz + 0.45, y + base + 0.02, y + base + 2.05, 0.05, 0.08);
      if (rich) {
        /* The number plate over the door. */
        fb(K, 'bldFrame', '+x', xf, dz - 0.18, dz + 0.18, y + base + 2.2, y + base + 2.34, 0.0, 0.03);
        /* The meter cupboard. */
        fb(K, 'bldCupboard', '+x', xf, dz + 0.65, dz + 1.2, y + base + 0.2, y + base + 2.0, -0.01, 0.04);
        /* The gas water heater on the wall. */
        fb(K, 'bldHeater', '+x', xf, dz + 0.72, dz + 1.12, y + base + 2.05, y + base + 2.5, 0.0, 0.16);
      }
      /* The kitchen window behind its grille. */
      const wz = Math.min(zb - 0.9, dz + 2.2);
      if (!sparse && wz - 0.5 > dz + 1.3) {
        windowOn(K, '+x', xf, wz, y + base + 1.6, 0.9, 0.9, {
          glass: rng.chance(0.2) ? 'glassLit' : 'bldFrosted', grille: rich, mullion: false, sill: false, lit: LIT.kitchen,
        });
      }
      /* The light on the soffit over the door. */
      if (rich && ceil > y + 2.4) {
        K.box('lampGlow', xf + 0.5, ceil - 0.07, dz - 0.15, xf + 0.7, ceil, dz + 0.15);
      }
    }
  }
  /* Downpipes at the corridor's ends. */
  downpipe(K, xf + CORRIDOR + 0.08, z0 + 0.12, 0, H);

  /*
   * THE BALCONY SIDE: a sliding door to every flat's balcony, with what is
   * behind it, and the washing out. On the ground floor, windows.
   */
  for (let i = 0; i < N; i += 1) {
    const y = level(i);
    for (let k = 0; k < units; k += 1) {
      const za = z0 + k * uw;
      const zb = za + uw;
      const zc = (za + zb) / 2 + 0.2;
      const ww = Math.min(2.6, uw - 1.4);
      if (ww < 0.8) {
        continue;
      }
      if (pw && i === 0 && zb > -pw / 2 && za < pw / 2) {
        continue;
      }
      const look = insideOf(rng, 0.1);
      windowOn(K, '-x', xb, zc, y + (i === 0 ? 1.45 : 1.1), ww, i === 0 ? 1.3 : 1.95,
        sparse ? { glass: look.glass, mullion: false, sill: false } : { ...look, sill: i === 0 });
      if (i === 0 || i >= N || sparse) {
        continue;
      }
      /* The washing: a pole across the balcony and what is on it. */
      const px = xb - BALCONY * 0.55;
      K.cyl('bldFrame', [px, y + 1.85, za + 0.25], [px, y + 1.85, zb - 0.25], 0.02, 5);
      const hang = rng.int(0, 3);
      for (let h = 0; h < hang; h += 1) {
        const cz = za + 0.5 + rng.range(0, uw - 1.0);
        const cw = rng.range(0.35, 0.7);
        const chh = rng.range(0.45, 0.8);
        K.box(rng.pick(['bldClothPink', 'bldClothBlue', 'bldClothYellow', 'bldClothWhite']),
          px - 0.015, y + 1.85 - chh, cz - cw / 2, px + 0.015, y + 1.85, cz + cw / 2);
      }
      /* Now and then a futon over the parapet, airing. */
      if (rng.chance(0.18)) {
        const fz = za + 0.4 + rng.range(0, uw - 2.2);
        const px0 = xb - BALCONY;
        K.box('bldFuton', px0 - 0.05, y + RAIL_H + 0.06, fz, px0 + RAIL_T + 0.05, y + RAIL_H + 0.14, fz + 1.4);
        K.box('bldFuton', px0 - 0.05, y + 0.35, fz, px0 - 0.01, y + RAIL_H + 0.14, fz + 1.4);
      }
    }
  }

  /* THE SIDES: a small window a floor near each end, and the name. */
  for (let i = 0; i < N; i += 1) {
    const y = level(i);
    for (const [face, at] of [['+z', z1], ['-z', z0]]) {
      windowOn(K, face, at, xb + 1.4, y + 1.5, 0.7, 0.9, { glass: 'bldFrosted', mullion: false });
    }
  }
  const nameFace = side > 0 ? '-z' : '+z';
  const nameAt = side > 0 ? z0 : z1;
  if (N >= 3) {
    const nw = Math.min(xf - xb - 1, 6);
    K.sign('flatsName', (xf + xb) / 2, H - 1.0, nameAt + (side > 0 ? -0.03 : 0.03), nw, nw * 0.26, nameFace, rng.int(0, 7));
  }
  downpipe(K, xb - 0.1, side > 0 ? z0 + 0.15 : z1 - 0.15, 0, H);

  /* THE STAIR or THE TOWER. */
  const zw = side > 0 ? z1 : z0;
  const levels = [];
  for (let i = 0; i < N; i += 1) {
    levels.push(level(i));
  }
  if (N >= 6) {
    const tw = parts.find((p) => p.name === 'tower');
    if (tw) {
      const [tx0, , tz0] = tw.lo;
      const [tx1, ty1, tz1] = tw.hi;
      const outFace = side > 0 ? '+z' : '-z';
      const outAt = side > 0 ? tz1 : tz0;
      /* A slit of stair window at every half landing, staggered, so the
       * stair inside draws itself on the outside. */
      for (let i = 0; i < N; i += 1) {
        const y = level(i);
        pane(K, 'bldPane', outFace, outAt, tx0 + 0.6, tx0 + 1.6, y + 1.9, y + 2.5, -0.01, 0.02, LIT.stair, WINDOW_TONES.office);
        pane(K, 'bldPane', outFace, outAt, tx1 - 1.6, tx1 - 0.6, y + 0.45, y + 1.05, -0.01, 0.02, LIT.stair, WINDOW_TONES.office);
        if (i > 0) {
          fb(K, 'trim', '+x', tx1, Math.min(tz0, tz1) + 0.8, Math.min(tz0, tz1) + 1.9, y, y + 2.15, -0.01, 0.05);
          fb(K, 'bldDoorGrey', '+x', tx1, Math.min(tz0, tz1) + 0.86, Math.min(tz0, tz1) + 1.84, y + 0.02, y + 2.1, 0.05, 0.08);
        }
      }
      /* The lift's machine room and a lettered R on the penthouse. */
      K.box('bldFrame', tx0 - 0.04, ty1, tz0 - 0.04, tx1 + 0.04, ty1 + 0.08, tz1 + 0.04);
      fb(K, 'lampRed', '+x', tx1, (tz0 + tz1) / 2 - 0.1, (tz0 + tz1) / 2 + 0.1, ty1 - 0.4, ty1 - 0.2, 0, 0.03);
    }
  } else if (parts.some((p) => p.name === 'stairTread')) {
    /* Drawn when the layout built one, read off its treads as the tower is
     * read off its part: a test of its own here drew the stringers and
     * rails of a stair the layout had refused, on a block too shallow for
     * it, hanging in the air with nothing solid under them. */
    const g = stairGeom({ xa: xf, back: -1, zWall: zw, sz: side, levels, landD: CORRIDOR, halfD: 1.2, flightW: 1.2 });
    stairDraw(K, g, { zWall: zw, mat: 'bldStair' });
  }
  if (pw) {
    passageDraw(K, s, 'bldTilePale');
  }
}

function officeDraw(K, s, parts, rng) {
  const { W, N, level, H, xf, xb, z0, z1, bays, pw, ph } = s;
  const par = s.S.parapet;
  plinthDraw(K, s, 0.3);
  roofDraw(K, xb, xf, z0, z1, H, par, 'bldFrame');
  const bw = W / bays;
  /* A very big office draws its glass in wider panes and drops the
   * glints and blinds, which nobody sees on a tower from where a pilot
   * sees a tower, and which would cost it tens of thousands of triangles. */
  const dense = N * W > 500;
  /*
   * THE FRONT, between the fins: a spandrel band at every floor and a
   * ribbon of glass over it, divided by mullions every 1.5 m. Some panes
   * have their blinds down; a few are lit; a diagonal glint crosses the
   * odd one, the way an anime background paints office glass.
   */
  for (let i = 0; i < N; i += 1) {
    const y = level(i);
    const top = level(i + 1);
    for (let b = 0; b < bays; b += 1) {
      const za = z0 + b * bw + 0.1;
      const zb = za + bw - 0.2;
      if (pw && zb > -pw / 2 && za < pw / 2 && y < ph) {
        continue;
      }
      if (i === 0) {
        /* The lobby: dark glass the height of the storey, a door pair. */
        fb(K, 'bldFrame', '+x', xf, za, zb, 0.3, top - 0.5, -0.01, 0.03);
        pane(K, 'glassDark', '+x', xf, za + 0.08, zb - 0.08, 0.35, top - 0.6, 0.03, 0.04, LIT.lobby, WINDOW_TONES.office);
        fb(K, 'bldFrame', '+x', xf, (za + zb) / 2 - 0.03, (za + zb) / 2 + 0.03, 0.35, top - 0.6, 0.04, 0.07);
        fb(K, 'bldFrame', '+x', xf, za + 0.08, zb - 0.08, 2.4, 2.46, 0.04, 0.07);
        continue;
      }
      fb(K, 'bldSpandrel', '+x', xf, za, zb, y - 0.15, y + 0.85, -0.01, 0.03);
      const g0 = y + 0.85;
      const g1 = top - 0.15;
      const n = dense ? 1 : Math.max(1, Math.round((zb - za) / 1.5));
      for (let k = 0; k < n; k += 1) {
        const u0 = za + (k / n) * (zb - za);
        const u1 = za + ((k + 1) / n) * (zb - za);
        const roll = rng.next();
        const glass = roll < 0.08 ? 'glassLit' : roll < 0.3 ? 'bldSky' : 'glassBlue';
        const lit = pane(K, glass, '+x', xf, u0, u1, g0, g1, -0.01, 0.01, LIT.office, WINDOW_TONES.office);
        if (!dense && roll > 0.55 && roll < 0.8) {
          const bb = faceBox('+x', xf, u0 + 0.04, u1 - 0.04, g1 - (g1 - g0) * rng.range(0.3, 0.8), g1 - 0.04, 0.01, 0.015);
          if (lit) {
            K.glow(WINDOW_TONES.blind[0], ...bb);
          } else {
            K.box('bldBlind', ...bb);
          }
        }
        fb(K, 'bldFrame', '+x', xf, u0 - 0.03, u0 + 0.03, g0, g1, 0.0, 0.06);
      }
      if (!dense && rng.chance(0.18)) {
        /* The glint: two pale bars at a slant across one pane. */
        const u = za + rng.range(0.2, 0.6) * (zb - za);
        for (let q = 0; q < 2; q += 1) {
          const off = q * 0.35;
          K.cyl('bldGlint', [xf + 0.02, g0 + 0.2, u + off], [xf + 0.02, g1 - 0.2, u + off + 0.9], q ? 0.04 : 0.09, 4);
        }
      }
    }
  }
  /* Company name on the parapet over the lobby, and the lobby's light. */
  K.sign('officeName', xf + 0.52, H + par * 0.5, 0, Math.min(W * 0.6, 10), Math.min(W * 0.6, 10) * 0.1, '+x', rng.int(0, 5));
  /*
   * THE SIDES AND THE BACK: punched windows in pairs, the stair side kept
   * blank near the back where the core is.
   */
  for (let i = 1; i < N; i += 1) {
    const y = level(i);
    for (const [face, at, u0, u1] of [['+z', z1, xb + 2.4, xf - 0.6], ['-z', z0, xb + 2.4, xf - 0.6], ['-x', xb, z0 + 0.6, z1 - 0.6]]) {
      /* A ribbon of glass, framed, with a mullion every 1.8 m: an office's
       * side is a band of window per floor, not a grid of holes. The stair
       * end is kept blank where the core is. */
      const g0 = y + 0.95;
      const g1 = y + 2.55;
      const runs = face === '-x' && pw && y - 0.1 < ph ? aroundMouth(u0, u1, pw) : [[u0, u1]];
      for (const [r0, r1] of runs) {
        if (r1 - r0 < 1.5) {
          continue;
        }
        const glassMat = rng.chance(0.25) ? 'bldSky' : 'glassBlue';
        const n = Math.max(1, Math.round((r1 - r0) / (dense ? 4.5 : 1.8)));
        if (!(face === '-x' && pw && g0 < ph && r1 > -pw / 2 && r0 < pw / 2)) {
          fb(K, 'bldFrame', face, at, r0 - 0.06, r1 + 0.06, g0 - 0.06, g1 + 0.06, -0.01, 0.04);
          paneRun(K, glassMat, face, at, r0, r1, g0, g1, 0.04, 0.05, n, LIT.side, WINDOW_TONES.office);
        }
        for (let k = 1; k < n; k += 1) {
          const u = r0 + (k / n) * (r1 - r0);
          fb(K, 'bldFrame', face, at, u - 0.035, u + 0.035, g0, g1, 0.05, 0.08);
        }
        const blinds = dense ? 0 : rng.int(0, 2);
        for (let q = 0; q < blinds; q += 1) {
          const k = rng.int(0, n - 1);
          fb(K, rng.chance(0.3) ? 'glassLit' : 'bldBlind', face, at, r0 + (k / n) * (r1 - r0) + 0.05, r0 + ((k + 1) / n) * (r1 - r0) - 0.05, g1 - (g1 - g0) * rng.range(0.3, 0.9), g1 - 0.03, 0.05, 0.055);
        }
      }
      const bands = face === '-x' && pw && y - 0.1 < ph ? aroundMouth(u0 - 0.6, u1 + 0.6, pw) : [[u0 - 0.6, u1 + 0.6]];
      for (const [r0, r1] of bands) {
        fb(K, 'bldSpandrel', face, at, r0, r1, y - 0.1, y + 0.05, -0.01, 0.03);
      }
    }
  }
  /* The fins get a cap and a darker return, so each reads as a blade. */
  for (const p of parts) {
    if (p.name === 'fin') {
      K.box('bldFrame', p.lo[0] - 0.02, p.hi[1], p.lo[2] - 0.02, p.hi[0] + 0.02, p.hi[1] + 0.06, p.hi[2] + 0.02);
    }
    if (p.name === 'canopy') {
      K.box('lampGlow', p.lo[0] + 0.4, p.lo[1] - 0.02, p.lo[2] + 0.6, p.hi[0] - 0.4, p.lo[1], p.hi[2] - 0.6);
      K.box('bldFrame', p.lo[0], p.hi[1] - 0.12, p.lo[2] - 0.02, p.hi[0] + 0.02, p.hi[1] + 0.02, p.hi[2] + 0.02);
    }
    if (p.name === 'tenantBoard') {
      const hgt = p.hi[1] - p.lo[1];
      const v = rng.int(0, 3);
      K.sign('bldTenant', p.hi[0] - 0.42, (p.lo[1] + p.hi[1]) / 2, p.hi[2] + 0.005, 0.8, hgt - 0.1, '+z', v);
      K.sign('bldTenant', p.hi[0] - 0.42, (p.lo[1] + p.hi[1]) / 2, p.lo[2] - 0.005, 0.8, hgt - 0.1, '-z', v);
    }
    if (p.name === 'plantRoom') {
      /* Louvres down one face and a steel door. */
      const [ax, ay, az] = p.lo;
      const [bx, by, bz] = p.hi;
      for (let k = 0; k < 6; k += 1) {
        const y = ay + 0.6 + k * 0.22;
        K.box('bldGrille', bx, y, az + 0.4, bx + 0.08, y + 0.07, bz - 1.6);
      }
      fb(K, 'bldDoorGrey', '+x', bx, bz - 1.3, bz - 0.4, ay, ay + 2.0, 0, 0.05);
      K.box('bldFrame', ax - 0.04, by, az - 0.04, bx + 0.04, by + 0.08, bz + 0.04);
    }
    if (p.name === 'coolingTower') {
      const [ax, , az] = p.lo;
      const [bx, by, bz] = p.hi;
      K.cyl('metalDark', [(ax + bx) / 2, by, (az + bz) / 2], [(ax + bx) / 2, by + 0.05, (az + bz) / 2], 0.8, 14);
      for (let k = 0; k < 5; k += 1) {
        const y = p.lo[1] + 0.3 + k * 0.3;
        K.box('bldGrille', ax - 0.03, y, az + 0.15, ax, y + 0.12, bz - 0.15);
      }
    }
    if (p.name === 'roofSign') {
      const [ax, ay, az] = p.lo;
      const [bx, by, bz] = p.hi;
      K.sign('mangaAd', bx + 0.012, (ay + by) / 2, (az + bz) / 2, bz - az - 0.2, by - ay - 0.2, '+x', rng.int(0, 11));
      /* The frame behind it: rails and a catwalk. */
      K.box('billboardSteelDark', ax - 0.5, ay - 0.08, az, ax, ay, bz);
      K.cyl('bldRail', [ax - 0.5, ay + 1.0, az], [ax - 0.5, ay + 1.0, bz], 0.025, 5);
    }
  }
  /* The emergency stair's drawing, and a fire door at every landing. */
  const zw = s.side > 0 ? z1 : z0;
  if (N >= 2 && s.D >= 6 && W >= 6) {
    const levels = [];
    for (let i = 0; i < N; i += 1) {
      levels.push(level(i));
    }
    const g = stairGeom({ xa: xb + 1.6, back: 1, zWall: zw, sz: s.side, levels, landD: 1.6, halfD: 1.2, flightW: 1.2 });
    stairDraw(K, g, { zWall: zw, mat: 'bldStair' });
    const face = s.side > 0 ? '+z' : '-z';
    for (let i = 1; i < N; i += 1) {
      const y = level(i);
      fb(K, 'trim', face, zw, xb + 0.3, xb + 1.3, y, y + 2.1, -0.01, 0.05);
      fb(K, 'bldDoorGrey', face, zw, xb + 0.36, xb + 1.24, y + 0.02, y + 2.04, 0.05, 0.08);
      fb(K, 'lampGlow', face, zw, xb + 0.7, xb + 0.9, y + 2.2, y + 2.35, 0, 0.06);
    }
  }
  if (pw) {
    passageDraw(K, s, 'bldTilePale');
  }
}

function warehouseDraw(K, s, parts, rng) {
  const { W, D, H, xf, xb, z0, z1, pw, ph } = s;
  const par = s.S.parapet;
  roofDraw(K, xb, xf, z0, z1, H, par, 'trim');
  /*
   * THE CLADDING. A block dado to 1.2 m, profiled sheet over it, the
   * steel frame showing as a flat pilaster every bay and a rail at the
   * eaves. The ribs are 1.2 m apart and 0.12 wide: far enough apart that
   * the ink pass draws a line per rib and never a grey smear, even at
   * sixty metres, and there are six to a bay so the wall still reads as
   * corrugated rather than as stripes.
   */
  const rib = `${s.wall}Rib`;
  /* Where the arcade comes out of the back, the cladding starts over it. */
  const ribFoot = (face, u) => (face === '-x' && pw && Math.abs(u) < pw / 2 + 0.2 ? ph + 0.1 : 1.28);
  const clad = (face, at, u0, u1) => {
    for (const [r0, r1] of face === '-x' ? aroundMouth(u0, u1, pw, 0) : [[u0, u1]]) {
      fb(K, 'bldDado', face, at, r0, r1, 0, 1.2, -0.01, 0.05);
      fb(K, 'trim', face, at, r0, r1, 1.2, 1.28, -0.01, 0.07);
    }
    fb(K, 'trim', face, at, u0, u1, H - 0.35, H - 0.15, -0.01, 0.08);
    const len = u1 - u0;
    const bays = Math.max(1, Math.round(len / 6));
    for (let b = 0; b <= bays; b += 1) {
      const u = u0 + (b / bays) * len;
      fb(K, rib, face, at, clamp(u - 0.14, u0, u1), clamp(u + 0.14, u0, u1), ribFoot(face, u), H - 0.35, -0.01, 0.07);
      if (b === bays) {
        break;
      }
      const n = 5;
      for (let k = 1; k <= n; k += 1) {
        const r = u + (k / (n + 1)) * (len / bays);
        fb(K, rib, face, at, r - 0.06, r + 0.06, ribFoot(face, r), H - 0.35, -0.01, 0.045);
      }
    }
  };
  clad('+z', z1, xb, xf);
  clad('-z', z0, xb, xf);
  clad('-x', xb, z0, z1);
  /* The front is clad too, over the canopy: the face a pilot sees first. */
  {
    const cy = Math.min(H - 1.2, 5.3);
    fb(K, 'trim', '+x', xf, z0, z1, cy - 0.08, cy, -0.01, 0.07);
    const bays = Math.max(1, Math.round(W / 6));
    for (let b = 0; b <= bays; b += 1) {
      const u = z0 + (b / bays) * W;
      const foot = pw && Math.abs(u) < pw / 2 + 0.2 ? ph + 0.1 : 1.2;
      fb(K, rib, '+x', xf, clamp(u - 0.14, z0, z1), clamp(u + 0.14, z0, z1), foot, H - 0.35, -0.01, 0.07);
      if (b === bays) {
        break;
      }
      for (let k = 1; k <= 5; k += 1) {
        const r = u + (k / 6) * (W / bays);
        const rf = pw && Math.abs(r) < pw / 2 + 0.2 ? Math.max(cy, ph + 0.1) : cy;
        fb(K, rib, '+x', xf, r - 0.06, r + 0.06, rf, H - 0.35, -0.01, 0.045);
      }
    }
    fb(K, 'trim', '+x', xf, z0, z1, H - 0.35, H - 0.15, -0.01, 0.08);
  }
  /* A strip of high windows under the eaves on the long sides. */
  for (const [face, at] of [['+z', z1], ['-z', z0]]) {
    const n = Math.max(1, Math.round(D / 6));
    for (let b = 0; b < n; b += 1) {
      const u0 = xb + (b / n) * D + 0.5;
      const u1 = xb + ((b + 1) / n) * D - 0.5;
      fb(K, 'bldFrame', face, at, u0, u1, H - 1.45, H - 0.65, 0.0, 0.08);
      pane(K, 'bldPane', face, at, u0 + 0.06, u1 - 0.06, H - 1.39, H - 0.71, 0.08, 0.09, LIT.shed, WINDOW_TONES.office);
    }
  }
  /*
   * THE FRONT: roller shutters, one to a bay, onto the dock; the name in
   * big letters over the canopy; the dock's rubber buffers and its yellow
   * edge.
   */
  for (const [r0, r1] of aroundMouth(z0, z1, pw, 0)) {
    fb(K, 'bldDado', '+x', xf, r0, r1, 0, 1.2, -0.01, 0.03);
  }
  const dock = parts.filter((p) => p.name === 'dock');
  const canopy = parts.find((p) => p.name === 'loadingCanopy');
  const doorTop = Math.min(4.3, (canopy ? canopy.lo[1] : H) - 0.3);
  for (const dp of dock) {
    const za = dp.lo[2];
    const zb = dp.hi[2];
    const n = Math.max(1, Math.round((zb - za) / 5.5));
    for (let b = 0; b < n; b += 1) {
      const zc = za + ((b + 0.5) / n) * (zb - za);
      const dw = Math.min(3.6, (zb - za) / n - 1.2);
      if (dw < 1.5) {
        continue;
      }
      fb(K, 'trim', '+x', xf, zc - dw / 2 - 0.12, zc + dw / 2 + 0.12, 1.1, doorTop + 0.1, -0.01, 0.05);
      fb(K, 'shutter', '+x', xf, zc - dw / 2, zc + dw / 2, 1.1, doorTop, 0.05, 0.07);
      for (let k = 1; k < 6; k += 1) {
        const y = 1.1 + (k / 6) * (doorTop - 1.1);
        fb(K, 'shutterLight', '+x', xf, zc - dw / 2, zc + dw / 2, y - 0.025, y + 0.025, 0.07, 0.09);
      }
      /* Rubber buffers either side of the bay on the dock's face. */
      for (const bz of [zc - dw / 2 + 0.2, zc + dw / 2 - 0.2]) {
        K.box('bldRubber', dp.hi[0], 0.3, bz - 0.15, dp.hi[0] + 0.12, 0.95, bz + 0.15);
      }
    }
    K.box('hazard', dp.hi[0] - 0.02, 1.02, za, dp.hi[0] + 0.01, 1.1, zb);
  }
  if (canopy) {
    /* Tie rods from the wall to the canopy's front edge: thin, and above
     * it, so they are out of the way of anything under it. */
    const n = Math.max(2, Math.round((canopy.hi[2] - canopy.lo[2]) / 4.5));
    for (let k = 0; k <= n; k += 1) {
      const z = canopy.lo[2] + 0.3 + (k / n) * (canopy.hi[2] - canopy.lo[2] - 0.6);
      K.cyl('metalDark', [xf, canopy.hi[1] + 1.6, z], [canopy.hi[0] - 0.2, canopy.hi[1], z], 0.03, 5);
    }
    K.box('bldFrame', canopy.hi[0], canopy.lo[1], canopy.lo[2], canopy.hi[0] + 0.03, canopy.hi[1] + 0.05, canopy.hi[2]);
    const lights = Math.max(1, Math.round((canopy.hi[2] - canopy.lo[2]) / 5));
    for (let k = 0; k < lights; k += 1) {
      const z = canopy.lo[2] + ((k + 0.5) / lights) * (canopy.hi[2] - canopy.lo[2]);
      K.box('lampGlow', xf + 1.2, canopy.lo[1] - 0.05, z - 0.4, xf + 1.5, canopy.lo[1], z + 0.4);
    }
  }
  const nameY = canopy ? canopy.hi[1] + (H - canopy.hi[1]) / 2 : H - 1.2;
  const nameH = Math.min(1.6, Math.max(0.8, (H - (canopy ? canopy.hi[1] : 0)) * 0.45));
  K.sign('warehouseName', xf + 0.06, nameY, 0, Math.min(W * 0.62, nameH * 8), nameH, '+x', rng.int(0, 5));
  /* The same name, huge, down the long side the stair is not on. */
  const sideFace = s.side > 0 ? '-z' : '+z';
  const sideAt = s.side > 0 ? z0 - 0.08 : z1 + 0.08;
  K.sign('warehouseName', 0, H * 0.62, sideAt, Math.min(D * 0.8, 16), Math.min(D * 0.8, 16) / 8, sideFace, rng.int(0, 5));
  /* Downpipes at the corners. */
  for (const [x, z] of [[xf + 0.1, z0 + 0.1], [xf + 0.1, z1 - 0.1], [xb - 0.1, z0 + 0.1], [xb - 0.1, z1 - 0.1]]) {
    downpipe(K, x, z, 0, H);
  }
  /* The annex: windows, doors, a sign, an air conditioner. */
  for (const p of parts) {
    if (p.name === 'annex') {
      const [ax, , az] = p.lo;
      const [bx, by, bz] = p.hi;
      K.box('bldFrame', ax, by, az - 0.03, bx + 0.03, by + 0.12, bz + 0.03);
      for (const y of [1.55, 4.95]) {
        const n = Math.max(1, Math.floor((bz - az - 1.5) / 1.9));
        for (let k = 0; k < n; k += 1) {
          const u = az + 0.9 + (k + 0.5) * ((bz - az - 1.8) / n);
          windowOn(K, '+x', bx, u, y, 1.4, 1.0, { ...insideOf(rng, 0.25), sill: false });
        }
      }
      fb(K, 'bldFrame', '+x', bx, az + 0.1, bz - 0.1, 3.3, 3.4, -0.01, 0.06);
      const dz = s.side > 0 ? bz - 1.0 : az + 1.0;
      fb(K, 'bldDoorGrey', '+x', bx, dz - 0.45, dz + 0.45, 3.4, 5.45, 0.0, 0.05);
      K.box('acUnit', ax + 0.4, by, az + 0.6, ax + 1.2, by + 0.6, az + 1.5);
      const outFace = s.side > 0 ? '+z' : '-z';
      const outAt = s.side > 0 ? bz : az;
      windowOn(K, outFace, outAt, (ax + bx) / 2, 1.55, 1.4, 1.0, { glass: 'bldFrosted', sill: false });
    }
    if (p.name === 'skylight') {
      K.box('bldFrame', p.lo[0] - 0.05, p.lo[1], p.lo[2] - 0.05, p.hi[0] + 0.05, p.lo[1] + 0.12, p.hi[2] + 0.05);
      const n = Math.max(1, Math.round((p.hi[0] - p.lo[0]) / 2));
      for (let k = 1; k < n; k += 1) {
        const x = p.lo[0] + (k / n) * (p.hi[0] - p.lo[0]);
        K.box('bldFrame', x - 0.03, p.hi[1], p.lo[2], x + 0.03, p.hi[1] + 0.03, p.hi[2]);
      }
    }
    if (p.name === 'ventilator') {
      const [x, y0, z] = p.a;
      K.cyl('metalDark', [x, y0 - 0.3, z], [x, y0, z], 0.16, 8);
      for (let k = 0; k < 3; k += 1) {
        const y = y0 + 0.05 + k * 0.14;
        K.cyl('metalDark', [x, y - 0.018, z], [x, y + 0.018, z], 0.315, 10);
      }
    }
  }
  const gA = parts.filter((p) => p.name === 'stairTread');
  if (gA.length) {
    /* Stringers under the annex stair's treads, one each side. */
    const first = gA[0];
    const last = gA[gA.length - 1];
    for (const x of [first.lo[0] + 0.04, first.hi[0] - 0.04]) {
      const za = s.side > 0 ? first.lo[2] : first.hi[2];
      const zb = s.side > 0 ? last.hi[2] : last.lo[2];
      K.cyl('bldStairGreen', [x, 0, za], [x, last.hi[1] - 0.1, zb], 0.07, 4);
      K.cyl('bldRail', [x < first.lo[0] + 0.5 ? x : x + 0.02, 1.0, za], [x < first.lo[0] + 0.5 ? x : x + 0.02, last.hi[1] + 1.0, zb], 0.025, 5);
    }
  }
  if (pw) {
    passageDraw(K, s, 'bldDado');
  }
}

function shopDraw(K, s, parts, rng) {
  const { W, N, level, H, xf, xb, z0, z1, side, kind, pw } = s;
  plinthDraw(K, s, 0.35);
  roofDraw(K, xb, xf - 0.3, z0, z1, H, s.S.parapet, 'bldFrame');
  /*
   * THE SHOPFRONT: a frame, the interior painted behind the glass (the
   * town's own shop interiors), mullions, a sliding door with a push bar,
   * and the noren in the doorway for the shops that hang one.
   */
  const sf0 = z0 + 0.3;
  const sf1 = z1 - 0.3;
  for (const [a, b] of aroundMouth(sf0, sf1, pw, 0)) {
    fb(K, 'bldFrame', '+x', xf, a, b, 0.35, 2.35, -0.01, 0.03);
  }
  const interior = kind === 'conbini' ? 0 : kind === 'ramen' || kind === 'sozai' || kind === 'bento' ? 1 : 2;
  const spans = pw ? [[sf0, -pw / 2 - 0.3], [pw / 2 + 0.3, sf1]] : [[sf0, sf1]];
  for (const [a, b] of spans) {
    if (b - a < 0.8) {
      continue;
    }
    K.townSign('shopInterior', interior, xf + 0.035, 1.35, (a + b) / 2, b - a - 0.12, 1.9, '+x');
    const n = Math.max(1, Math.round((b - a) / 1.6));
    for (let k = 0; k <= n; k += 1) {
      const z = a + 0.06 + (k / n) * (b - a - 0.12);
      fb(K, 'bldFrame', '+x', xf, z - 0.04, z + 0.04, 0.4, 2.3, 0.03, 0.08);
    }
    fb(K, 'bldFrame', '+x', xf, a, b, 1.95, 2.0, 0.03, 0.08);
  }
  const doorZ = pw ? (pw / 2 + 0.3 + sf1) / 2 : (sf0 + sf1) / 2 + side * Math.min(1.2, (sf1 - sf0) / 4);
  fb(K, 'metalDark', '+x', xf, doorZ - 0.35, doorZ + 0.35, 1.05, 1.1, 0.08, 0.12);
  if (NOREN[kind]) {
    K.townSign('norenTex', NOREN[kind], xf + 0.1, 1.95, doorZ, 1.5, 0.75, '+x');
  }
  /* The fascia's painted board on the front of the fascia box. */
  const fascia = parts.find((p) => p.name === 'fascia');
  if (fascia) {
    K.townSign('shopFascia', kind, fascia.hi[0] + 0.006, (fascia.lo[1] + fascia.hi[1]) / 2, 0, fascia.hi[2] - fascia.lo[2] - 0.1, fascia.hi[1] - fascia.lo[1] - 0.08, '+x');
  }
  const valance = parts.find((p) => p.name === 'valance');
  if (valance) {
    K.sign('bldValance', valance.hi[0] + 0.006, (valance.lo[1] + valance.hi[1]) / 2, 0, valance.hi[2] - valance.lo[2], valance.hi[1] - valance.lo[1] - 0.02, '+x', AWNINGS.indexOf(s.awning));
  }
  const shutterBox = parts.find((p) => p.name === 'shutterBox');
  if (shutterBox) {
    K.box('metalDark', shutterBox.hi[0], shutterBox.lo[1] - 0.005, shutterBox.lo[2], shutterBox.hi[0] + 0.01, shutterBox.lo[1] + 0.04, shutterBox.hi[2]);
  }
  const blade = parts.find((p) => p.name === 'blade');
  if (blade) {
    const bh = blade.hi[1] - blade.lo[1];
    const bx = (blade.lo[0] + blade.hi[0]) / 2 + 0.05;
    K.townSign('shopBlade', kind, bx, blade.lo[1] + bh / 2, blade.hi[2] + 0.004, 0.72, bh - 0.12, '+z');
    K.townSign('shopBlade', kind, bx, blade.lo[1] + bh / 2, blade.lo[2] - 0.004, 0.72, bh - 0.12, '-z');
    K.cyl('metalDark', [xf, blade.hi[1] - 0.1, (blade.lo[2] + blade.hi[2]) / 2], [blade.hi[0], blade.hi[1] - 0.1, (blade.lo[2] + blade.hi[2]) / 2], 0.03, 5);
  }
  /*
   * UPSTAIRS, the home over the shop: aluminium windows with curtains,
   * a flower box under the first floor's, a balcony rail above, and the
   * same on the back.
   */
  for (let i = 1; i < N; i += 1) {
    const y = level(i);
    const n = Math.max(1, Math.floor((W - 1) / 2.6));
    for (let k = 0; k < n; k += 1) {
      const u = z0 + (k + 0.5) * (W / n);
      if (i === 1 && parts.some((p) => p.name === 'blade' && Math.abs((p.lo[2] + p.hi[2]) / 2 - u) < 1.0)) {
        continue;
      }
      windowOn(K, '+x', xf, u, y + 1.45, 1.5, 1.25, { ...insideOf(rng, 0.14), sill: i !== 1 });
      if (i === 1) {
        K.box('trim', xf, y + 0.62, u - 0.8, xf + 0.28, y + 0.78, u + 0.8);
        for (let f = 0; f < 5; f += 1) {
          const fz = u - 0.6 + f * 0.3;
          K.ball(rng.pick(['leaf0', 'leaf1', 'blossom1']), [xf + 0.16, y + 0.86, fz], 0.14);
        }
      }
      windowOn(K, '-x', xb, u, y + 1.45, 1.2, 1.1, { ...insideOf(rng, 0.1) });
    }
    for (const [face, at] of [['+z', z1], ['-z', z0]]) {
      fb(K, 'band', face, at, xb, xf, y - 0.08, y + 0.05, -0.01, 0.04);
    }
  }
  /* The false front's coping and a painted band across it. */
  for (const p of parts) {
    if (p.name === 'falseFront') {
      K.box('bldFrame', p.lo[0] - 0.03, p.hi[1], p.lo[2] - 0.03, p.hi[0] + 0.05, p.hi[1] + 0.08, p.hi[2] + 0.03);
      fb(K, 'trim', '+x', p.hi[0], p.lo[2], p.hi[2], p.lo[1] + 0.35, p.lo[1] + 0.45, 0, 0.03);
    }
    if (p.name === 'balconyParapet') {
      /* A solid guard, drawn as the balustrade it stands for: a rail on
       * top, a kick plate, and bars down its face. */
      K.box('bldRail', p.lo[0] - 0.02, p.hi[1], p.lo[2], p.hi[0] + 0.02, p.hi[1] + 0.05, p.hi[2]);
      K.box('bldRail', p.hi[0], p.lo[1], p.lo[2], p.hi[0] + 0.02, p.lo[1] + 0.15, p.hi[2]);
      const n = Math.max(3, Math.round((p.hi[2] - p.lo[2]) / 0.2));
      for (let k = 1; k < n; k += 1) {
        const z = p.lo[2] + (k / n) * (p.hi[2] - p.lo[2]);
        K.box('bldRail', p.hi[0], p.lo[1] + 0.15, z - 0.018, p.hi[0] + 0.03, p.hi[1], z + 0.018);
      }
    }
    if (p.name === 'aerial') {
      const [x, , z] = p.a;
      const top = p.b[1];
      for (let k = 0; k < 4; k += 1) {
        K.cyl('metalDark', [x, top - 0.7 + k * 0.17, z - 0.3], [x, top - 0.7 + k * 0.17, z + 0.3], 0.012, 4);
      }
    }
  }
  /* The vending machines: the painted front, a plinth, a hood. */
  const vend = parts.filter((p) => p.name === 'vending');
  for (const v of vend) {
    const zc = (v.lo[2] + v.hi[2]) / 2;
    const variant = ['bldVendWhite', 'bldVendRed', 'bldVendBlue'].indexOf(v.m);
    K.sign('bldVend', v.hi[0] + 0.006, 1.0, zc, v.hi[2] - v.lo[2] - 0.06, 1.86, '+x', variant);
    K.box('bldFrame', v.lo[0], v.hi[1], v.lo[2] - 0.01, v.hi[0] + 0.04, v.hi[1] + 0.05, v.hi[2] + 0.01);
  }
  /*
   * The side the machines are not on, which is the side a street sees
   * down its length: the kitchen window, a window a floor upstairs, the
   * air conditioner's fan, and a faded advert painted high on the wall
   * the way a Showa shop house wears one.
   */
  const plain = side > 0 ? '+z' : '-z';
  const plainAt = side > 0 ? z1 : z0;
  windowOn(K, plain, plainAt, xb + 1.6, 1.6, 0.8, 0.9, { glass: 'bldFrosted', grille: true, mullion: false });
  for (let i = 1; i < N; i += 1) {
    windowOn(K, plain, plainAt, xb + 3.2, level(i) + 1.45, 1.2, 1.1, { ...insideOf(rng, 0.12) });
  }
  const ac = parts.find((p) => p.name === 'acUnit');
  if (ac) {
    const o = side > 0 ? 1 : -1;
    const face = o > 0 ? ac.hi[2] : ac.lo[2];
    K.box('metalDark', ac.lo[0] + 0.1, ac.lo[1] + 0.1, Math.min(face, face + o * 0.01), ac.lo[0] + 0.55, ac.hi[1] - 0.1, Math.max(face, face + o * 0.01));
    K.box('metalDark', ac.lo[0], ac.lo[1] - 0.06, Math.min(plainAt, face), ac.hi[0], ac.lo[1], Math.max(plainAt, face));
  }
  /* Clear of the upstairs windows at the back of the wall. */
  const adW = Math.min(s.D - 4.6, 6.5);
  if (N >= 2 && adW > 2.4) {
    const adH = adW / 2.56;
    const adY = Math.min(H - adH / 2 - 0.4, level(1) + 1.2 + adH / 2);
    /* On a board standing just off the wall, over the floor band. */
    const ax = xf - 0.6 - adW / 2;
    fb(K, 'trim', plain, plainAt, ax - adW / 2 - 0.08, ax + adW / 2 + 0.08, adY - adH / 2 - 0.08, adY + adH / 2 + 0.08, 0, 0.06);
    K.sign('mangaAd', ax, adY, plainAt + (side > 0 ? 0.066 : -0.066), adW, adH, plain, rng.int(0, 11));
  }
  downpipe(K, xb - 0.1, plainAt - Math.sign(plainAt) * 0.15, 0, H);
  if (pw) {
    passageDraw(K, s, 'bldTilePale');
  }
}

export function buildingDraw(el, parts, K) {
  const s = buildingSpec(el);
  const rng = seededRandom(seedOf(el) ^ 0x51ed270b);
  if (s.style === 'flats') {
    flatsDraw(K, s, parts, rng);
  } else if (s.style === 'office') {
    officeDraw(K, s, parts, rng);
  } else if (s.style === 'warehouse') {
    warehouseDraw(K, s, parts, rng);
  } else {
    shopDraw(K, s, parts, rng);
  }
}

/* ------------------------------------------------------------------ *
 * THE BANDO. A concrete frame somebody stopped building, or stopped
 * using: columns, floor slabs with whole bays and odd cells missing, a
 * lift shaft open to the sky, a stair core, walls there in some bays and
 * gone in others, and a slab that came down and is leaning on the floor
 * below. It is the flagship of any freestyle map because every missing
 * piece is a line: in one side and out the other, up through a floor,
 * down the lift shaft and out of its door at the bottom, down the ramp a
 * fallen slab makes.
 *
 * THREE WRECKS, and the variant picks which, so rerolling a bando changes
 * what it is and not only where its holes are:
 *
 *   gutted     a block that was lived in: infill walls with windows, old
 *              paint on the inside walls, tags everywhere, a roof going
 *   skeleton   a frame that was never finished: few walls, the top storey
 *              columns standing bare with their starter bars, formwork
 *              still on the roof edge, a blue tarp
 *   burnt      a block a fire went through: scorched walls, a corner of
 *              the frame come down in slabs that lean on the floors below
 *
 * THE GRID. Columns at bays of about six metres; each bay is two cells a
 * side, three metres or so, and the slabs are laid cell by cell, so a hole
 * is never smaller than a cell and never narrower than the gap rule.
 * ------------------------------------------------------------------ */

const BANDO_FH = 3.4;
const BANDO_SLAB = 0.3;
const BANDO_BEAM = 0.5;
const BANDO_COL = 0.25;
const BANDO_WALL = 0.2;
const WRECKS = ['gutted', 'skeleton', 'burnt'];
const RENDERS = ['bandoRenderCream', 'bandoRenderGreen', 'bandoRenderBlue', 'bandoRenderPink'];

function bandoSpec(el) {
  const d = el.dims ?? {};
  const W = clamp(Number(d.width) || 24, 8, 80);
  const D = clamp(Number(d.depth) || 18, 8, 60);
  const N = clamp(Math.round(Number(d.floors) || 1), 1, 8);
  const ruin = clamp(Number(d.ruin) || 0, 0, 1);
  const v = Math.max(1, Math.round(Number(d.variant) || 1));
  const wreck = WRECKS[(v - 1) % WRECKS.length];
  const nx = Math.max(2, Math.round(D / 6));
  const nz = Math.max(2, Math.round(W / 6));
  const bx = D / nx;
  const bz = W / nz;
  return {
    W, D, N, ruin, wreck, nx, nz, bx, bz, cx: bx / 2, cz: bz / 2, ci: nx * 2, ck: nz * 2,
    x0: -D / 2, z0: -W / 2, fh: BANDO_FH, H: N * BANDO_FH,
  };
}

/*
 * Everything the bando's layout decides, as data: which cells of which
 * floor are gone, which columns are broken, where the ramps lean, where the
 * walls are. The layout turns it into solids; the draw reads it to put
 * rebar on the broken edges and paint on the walls that are left.
 */
function bandoPlan(el) {
  const s = bandoSpec(el);
  const { N, ruin, wreck, nx, nz, ci, ck } = s;
  const rng = seededRandom(seedOf(el));
  /* The core bay: a corner, with the lift shaft in its corner cell and the
   * stair core in the cell beside it along the face. */
  const coreI = rng.chance(0.5) ? 0 : nx - 1;
  const coreK = rng.chance(0.5) ? 0 : nz - 1;
  const shaft = { i: coreI === 0 ? 0 : ci - 1, k: coreK === 0 ? 0 : ck - 1 };
  const stair = { i: shaft.i, k: coreK === 0 ? 1 : ck - 2 };
  const isCore = (i, k) => (i === shaft.i && k === shaft.k) || (i === stair.i && k === stair.k);

  /*
   * THE FIRE, for the burnt wreck: it started in the corner across from the
   * core. Everything within a bay and a half of that corner is sooted, the
   * columns at the corner itself failed above the first floor, and the
   * slabs they held came down onto it: the collapsed corner is the burnt
   * wreck's signature, and the ramps lean into it.
   */
  const fire = { i: coreI === 0 ? nx : 0, k: coreK === 0 ? nz : 0 };
  const fireR = 1.6;
  /* Squared distances, in bays: which columns fail decides solids, so no
   * function here that an engine may round its own way. */
  const fireD2 = (gi, gk) => (gi - fire.i) * (gi - fire.i) + (gk - fire.k) * (gk - fire.k);
  const burntAt = (gi, gk) => wreck === 'burnt' && fireD2(gi, gk) <= fireR * fireR;

  /* COLUMNS: a few broken, never the core's. top is a height. */
  const cols = [];
  for (let i = 0; i <= nx; i += 1) {
    for (let k = 0; k <= nz; k += 1) {
      let top = N * s.fh;
      let stump = false;
      const nearCore = Math.abs(i * 2 - (shaft.i + 0.5)) < 2.6 && Math.abs(k * 2 - (shaft.k + 0.5)) < 2.6;
      if (wreck === 'burnt' && N > 1 && !nearCore && fireD2(i, k) <= 1.02) {
        top = s.fh + rng.range(0.6, 1.4);
        stump = true;
      } else if (!nearCore && N > 1 && rng.chance(wreck === 'burnt' ? 0.05 + ruin * 0.15 : ruin * 0.18)) {
        const f = rng.int(1, N - 1);
        top = f * s.fh + (rng.chance(0.5) ? rng.range(0.6, 1.5) : 0);
        stump = true;
      }
      if (wreck === 'skeleton' && top >= N * s.fh - 0.01) {
        /* Starter columns over the last slab, bars and all. */
        top = N * s.fh + 1.2;
      }
      cols.push({ i, k, top, stump });
    }
  }
  const colAt = (i, k) => cols[i * (nz + 1) + k];

  /* HOLES, from the roof down. The roof loses the most, in clusters; each
   * floor below keeps some of the holes over it (a light well down two
   * floors is a dive) and adds its own. */
  const holes = [];
  const lossTop = wreck === 'skeleton' ? 0.35 + ruin * 0.45 : 0.18 + ruin * 0.62;
  const lossMid = wreck === 'skeleton' ? 0.06 + ruin * 0.2 : 0.05 + ruin * 0.32;
  for (let f = N; f >= 1; f -= 1) {
    const cells = new Uint8Array(ci * ck);
    const target = Math.round(ci * ck * (f === N ? lossTop : lossMid));
    let count = 0;
    if (f < N) {
      const above = holes[holes.length - 1];
      for (let q = 0; q < ci * ck; q += 1) {
        if (above[q] && rng.chance(0.4)) {
          cells[q] = 1;
          count += 1;
        }
      }
    }
    let guard = 0;
    while (count < target && guard < 4000) {
      guard += 1;
      let i;
      let k;
      if (count > 0 && rng.chance(0.65)) {
        /* Grow a cluster from a hole already made. */
        const q = rng.int(0, ci * ck - 1);
        if (!cells[q]) {
          continue;
        }
        const dir = rng.int(0, 3);
        i = Math.floor(q / ck) + [1, -1, 0, 0][dir];
        k = (q % ck) + [0, 0, 1, -1][dir];
      } else {
        i = rng.int(0, ci - 1);
        k = rng.int(0, ck - 1);
      }
      if (i < 0 || k < 0 || i >= ci || k >= ck || isCore(i, k) || cells[i * ck + k]) {
        continue;
      }
      /* The gutted block's walls hold its edges up: it loses its floors
       * from the middle out. */
      if (wreck === 'gutted' && f < N && (i === 0 || k === 0 || i === ci - 1 || k === ck - 1) && rng.chance(0.7)) {
        continue;
      }
      cells[i * ck + k] = 1;
      count += 1;
    }
    /* A cell whose column is gone below it cannot keep a slab over the
     * column's head for long: the burnt wreck drops the four round it. */
    if (wreck === 'burnt') {
      for (const c of cols) {
        if (c.top < f * s.fh - 0.01) {
          for (const [di, dk] of [[-1, -1], [-1, 0], [0, -1], [0, 0]]) {
            const i = c.i * 2 + di;
            const k = c.k * 2 + dk;
            if (i >= 0 && k >= 0 && i < ci && k < ck && !isCore(i, k)) {
              cells[i * ck + k] = 1;
            }
          }
        }
      }
    }
    holes.push(cells);
  }
  holes.reverse();
  const hole = (f, i, k) => f >= 1 && f <= N && holes[f - 1][i * ck + k] === 1;
  /* The shaft's cell is open on every floor: it is the shaft. */
  for (let f = 1; f <= N; f += 1) {
    holes[f - 1][shaft.i * ck + shaft.k] = 2;
  }

  /*
   * RAMPS: a whole bay's slab come down at one edge and leaning on the
   * floor below. Only in a bay with a slab beside its hinge and a slab
   * (or the ground) under its foot, and only for the burnt wreck or a
   * ruin past a third. The ramp is narrower than the bay by the gap rule
   * and a column on each side, so it never makes a slot with a column.
   */
  const ramps = [];
  const wantRamps = wreck === 'burnt' ? 1 + Math.round(ruin * 2) : ruin > 0.35 ? 1 : 0;
  for (let tries = 0; tries < 60 && ramps.length < wantRamps; tries += 1) {
    const f = rng.int(1, N);
    const nearFire = wreck === 'burnt' && rng.chance(0.75);
    const bi = nearFire ? clamp(Math.round(fire.i - 0.5 + rng.range(-1.6, 1.6)), 0, nx - 1) : rng.int(0, nx - 1);
    const bk = nearFire ? clamp(Math.round(fire.k - 0.5 + rng.range(-1.6, 1.6)), 0, nz - 1) : rng.int(0, nz - 1);
    const alongX = rng.chance(0.5);
    const dir = rng.chance(0.5) ? 1 : -1;
    if ((bi === coreI && bk === coreK) || ramps.some((r) => r.f === f && r.bi === bi && r.bk === bk)) {
      continue;
    }
    /* The hinge is the bay's edge on the -dir side; the bay beyond it must
     * exist and keep its slab there. */
    const hi = alongX ? bi - dir : bi;
    const hk = alongX ? bk : bk - dir;
    if (hi < 0 || hk < 0 || hi >= nx || hk >= nz || (hi === coreI && hk === coreK)) {
      continue;
    }
    const len = alongX ? s.bx : s.bz;
    const wid = alongX ? s.bz : s.bx;
    const perim0 = alongX ? bk === 0 : bi === 0;
    const perim1 = alongX ? bk === nz - 1 : bi === nx - 1;
    const m0 = BANDO_COL + GAP_MIN + (perim0 ? 0.45 : 0);
    const m1 = BANDO_COL + GAP_MIN + (perim1 ? 0.45 : 0);
    const w = wid - m0 - m1;
    const Ls = Math.min(len - 0.3, Math.sqrt((len - 1.9) * (len - 1.9) + s.fh * s.fh));
    if (w < 1.2 || Ls < s.fh + 0.25) {
      continue;
    }
    const cellsOfBay = [];
    for (const [di, dk] of [[0, 0], [0, 1], [1, 0], [1, 1]]) {
      cellsOfBay.push([bi * 2 + di, bk * 2 + dk]);
    }
    const hingeCells = alongX
      ? [[bi * 2 + (dir > 0 ? -1 : 2), bk * 2], [bi * 2 + (dir > 0 ? -1 : 2), bk * 2 + 1]]
      : [[bi * 2, bk * 2 + (dir > 0 ? -1 : 2)], [bi * 2 + 1, bk * 2 + (dir > 0 ? -1 : 2)]];
    if (hingeCells.some(([i, k]) => hole(f, i, k) || isCore(i, k))) {
      continue;
    }
    if (f > 1 && cellsOfBay.some(([i, k]) => hole(f - 1, i, k) || isCore(i, k))) {
      continue;
    }
    for (const [i, k] of cellsOfBay) {
      holes[f - 1][i * ck + k] = 1;
    }
    ramps.push({ f, bi, bk, alongX, dir, m0, m1, Ls });
  }

  /*
   * WALLS: block infill on the perimeter, bay by bay and storey by storey.
   * Some bays are open, some walls have a window (at least 1.6 by 1.5), a
   * few have a breach down to the floor, some windows are boarded. Never a
   * wall on the ground floor of the middle bays of the front and the back,
   * so there is always a way in at ground level.
   */
  const wallChance = wreck === 'gutted' ? 0.9 - ruin * 0.45 : wreck === 'burnt' ? 0.75 - ruin * 0.4 : 0.1 + (1 - ruin) * 0.12;
  const walls = [];
  const faces = [
    { face: '+x', n: nz, fixedI: nx },
    { face: '-x', n: nz, fixedI: 0 },
    { face: '+z', n: nx, fixedK: nz },
    { face: '-z', n: nx, fixedK: 0 },
  ];
  for (let f = 0; f < N; f += 1) {
    for (const F of faces) {
      for (let b = 0; b < F.n; b += 1) {
        const mid = b === Math.floor(F.n / 2) || b === Math.floor((F.n - 1) / 2);
        const alongZ = F.face[1] === 'x';
        const bi = alongZ ? (F.fixedI === 0 ? 0 : nx - 1) : b;
        const bk = alongZ ? b : (F.fixedK === 0 ? 0 : nz - 1);
        /* The core bay's own faces are the shaft and the stair core. */
        if (bi === coreI && bk === coreK) {
          continue;
        }
        /* A wall needs its two columns to the top of its storey, which is
         * also what keeps the edge beam over it, so no wall ever stops
         * half a metre under a slab with nothing between. */
        const ends = alongZ ? [colAt(F.fixedI, b), colAt(F.fixedI, b + 1)] : [colAt(b, F.fixedK), colAt(b + 1, F.fixedK)];
        if (ends.some((c) => c.top < (f + 1) * s.fh - 0.01)) {
          continue;
        }
        /* And the floor under it: a wall never stands over a missing
         * cell, where it would hang a slab's thickness over the beam. */
        if (f > 0) {
          const under = alongZ
            ? [[F.fixedI === 0 ? 0 : ci - 1, b * 2], [F.fixedI === 0 ? 0 : ci - 1, b * 2 + 1]]
            : [[b * 2, F.fixedK === 0 ? 0 : ck - 1], [b * 2 + 1, F.fixedK === 0 ? 0 : ck - 1]];
          if (under.some(([i, k]) => holes[f - 1][i * ck + k])) {
            continue;
          }
        }
        if (f === 0 && mid && (F.face === '+x' || F.face === '-x')) {
          continue;
        }
        if (!rng.chance(wallChance)) {
          continue;
        }
        const roll = rng.next();
        const kind = roll < 0.55 ? 'window' : roll < 0.7 ? 'breach' : roll < 0.82 ? 'boarded' : 'blank';
        const broken = f === N - 1 ? rng.chance(0.25 + ruin * 0.5) : rng.chance(ruin * 0.12);
        walls.push({ f, face: F.face, b, kind, broken, dark: rng.chance(0.3), w: rng.range(1.6, 2.6), off: rng.range(-0.4, 0.4), seed: rng.int(0, 1e6) });
      }
    }
  }
  /* Interior partitions in the gutted block: a few, each with a breach. */
  const partitions = [];
  if (wreck === 'gutted') {
    const count = Math.round((nx + nz) * N * (0.5 - ruin * 0.3));
    for (let q = 0; q < count; q += 1) {
      const f = rng.int(0, N - 1);
      const alongZ = rng.chance(0.5);
      const line = alongZ ? rng.int(1, nx - 1) : rng.int(1, nz - 1);
      const b = alongZ ? rng.int(0, nz - 1) : rng.int(0, nx - 1);
      if ((alongZ ? line : line) <= 0) {
        continue;
      }
      partitions.push({ f, alongZ, line, b, off: rng.range(-0.5, 0.5) });
    }
  }
  /* Rubble heaps at bay centres under holes. */
  const rubble = [];
  for (let bi = 0; bi < nx; bi += 1) {
    for (let bk = 0; bk < nz; bk += 1) {
      if (bi === coreI && bk === coreK) {
        continue;
      }
      for (let f = 0; f < N; f += 1) {
        const above = f + 1;
        const holed = [[0, 0], [0, 1], [1, 0], [1, 1]].some(([di, dk]) => hole(above, bi * 2 + di, bk * 2 + dk));
        const floorOk = f === 0 || [[0, 0], [0, 1], [1, 0], [1, 1]].every(([di, dk]) => !hole(f, bi * 2 + di, bk * 2 + dk));
        const underRamp = ramps.some((r) => r.bi === bi && r.bk === bk && (r.f === above || r.f === f));
        if (holed && floorOk && !underRamp && rng.chance(0.55)) {
          rubble.push({ f, bi, bk, h: rng.range(0.4, 0.9), sx: rng.range(0.6, 1), sz: rng.range(0.6, 1), seed: rng.int(0, 1e6) });
        }
      }
    }
  }
  const render = RENDERS[seededRandom(seedOf(el) ^ 0x0badf00d).int(0, RENDERS.length - 1)];
  return { s, rng, coreI, coreK, shaft, stair, isCore, cols, colAt, holes, hole, ramps, walls, partitions, rubble, fire, burntAt, render };
}

/* Where a bay and a cell are. */
const bayX = (s, i) => s.x0 + i * s.bx;
const bayZ = (s, k) => s.z0 + k * s.bz;
const cellX = (s, i) => s.x0 + i * s.cx;
const cellZ = (s, k) => s.z0 + k * s.cz;
/* A column's centre, pulled in on the perimeter so it is flush. */
const colX = (s, i) => clamp(bayX(s, i), s.x0 + BANDO_COL, s.x0 + s.D - BANDO_COL);
const colZ = (s, k) => clamp(bayZ(s, k), s.z0 + BANDO_COL, s.z0 + s.W - BANDO_COL);

/* The capsules a fallen slab is made of. */
const RAMP_R = 0.14;

/*
 * The ramp's geometry: `h` and `f` are the two ends of its mid plane,
 * [along, y], at the hinge and at the foot, and [a0, a1] its extent
 * across. The hinge end is half a thickness under the slab it hangs from.
 * The foot end is set so the lowest point of the capsules that make it
 * solid is a centimetre into the floor it lies on: a steep slab's capsules
 * are inset up the fall line, so the foot is lowered to meet the floor
 * rather than left a hand's width over it.
 */
function rampGeom(s, r) {
  const yTop = r.f * s.fh;
  const yFoot = (r.f - 1) * s.fh;
  const drop = yTop - yFoot;
  const run = Math.sqrt(r.Ls * r.Ls - drop * drop);
  const hy = yTop - 0.15;
  const uy = (hy - (yFoot + 0.13)) / Math.sqrt(run * run + (hy - yFoot - 0.13) * (hy - yFoot - 0.13));
  const fy = yFoot - 0.01 + RAMP_R * (1 - uy);
  if (r.alongX) {
    const hx = r.dir > 0 ? bayX(s, r.bi) : bayX(s, r.bi + 1);
    const a0 = bayZ(s, r.bk) + r.m0;
    const a1 = bayZ(s, r.bk + 1) - r.m1;
    return { alongX: true, h: [hx, hy], f: [hx + r.dir * run, fy], a0, a1, yTop };
  }
  const hz = r.dir > 0 ? bayZ(s, r.bk) : bayZ(s, r.bk + 1);
  const a0 = bayX(s, r.bi) + r.m0;
  const a1 = bayX(s, r.bi + 1) - r.m1;
  return { alongX: false, h: [hz, hy], f: [hz + r.dir * run, fy], a0, a1, yTop };
}

export function bandoLayout(el) {
  const plan = bandoPlan(el);
  const { s, shaft, stair, cols, colAt, holes, ramps, walls, partitions, rubble } = plan;
  const { N, fh, nx, nz, ci, ck, x0, z0, W, D } = s;
  const P = new Parts();
  const col = BANDO_COL;

  /* COLUMNS, but not the one in the shaft's corner: the shaft's walls
   * are the structure there, and a column inside it would narrow it. */
  const shaftColI = plan.coreI === 0 ? 0 : nx;
  const shaftColK = plan.coreK === 0 ? 0 : nz;
  /* The stair core's cell. The column on the building's face at the
   * core's inner edge stands half inside the core, and its outer face lay
   * in the core's own face, two materials in one plane that fought for
   * every pixel of it. It stops at the core's face instead. */
  const kx0 = cellX(s, stair.i);
  const kx1 = cellX(s, stair.i + 1);
  const kz0 = cellZ(s, stair.k);
  const kz1 = cellZ(s, stair.k + 1);
  for (const c of cols) {
    if (c.i === shaftColI && c.k === shaftColK) {
      continue;
    }
    const x = colX(s, c.i);
    const z = colZ(s, c.k);
    let za = z - col;
    let zb = z + col;
    if (x - col < kx1 && x + col > kx0) {
      if (za < kz0 && zb > kz0) {
        zb = kz0;
      }
      if (za < kz1 && zb > kz1) {
        za = kz1;
      }
    }
    P.box(plan.burntAt(c.i, c.k) ? 'bandoSooty' : 'bandoColumn', x - col, 0, za, x + col, c.top, zb, { name: c.stump ? 'columnStump' : 'column' });
  }

  /* SLABS, cell by cell, merged into rectangles of one material. Never in
   * the stair core's cell, which the core fills solid from the ground up:
   * a slab run through it ended in the core's own faces, and every floor
   * drew a strip of slab fighting the core's paint across its outside. */
  const cellMat = (i, k) => (plan.burntAt((i + 0.5) / 2, (k + 0.5) / 2) ? 'bandoSooty' : 'slab');
  for (let f = 1; f <= N; f += 1) {
    const y = f * fh;
    const cells = holes[f - 1];
    const used = new Uint8Array(ci * ck);
    used[stair.i * ck + stair.k] = 1;
    for (let i = 0; i < ci; i += 1) {
      for (let k = 0; k < ck; k += 1) {
        if (cells[i * ck + k] || used[i * ck + k]) {
          continue;
        }
        const m = cellMat(i, k);
        let k1 = k;
        while (k1 + 1 < ck && !cells[i * ck + k1 + 1] && !used[i * ck + k1 + 1] && cellMat(i, k1 + 1) === m) {
          k1 += 1;
        }
        let i1 = i;
        for (;;) {
          const ni = i1 + 1;
          if (ni >= ci) {
            break;
          }
          let ok = true;
          for (let q = k; q <= k1; q += 1) {
            if (cells[ni * ck + q] || used[ni * ck + q] || cellMat(ni, q) !== m) {
              ok = false;
              break;
            }
          }
          if (!ok) {
            break;
          }
          i1 = ni;
        }
        for (let a = i; a <= i1; a += 1) {
          for (let q = k; q <= k1; q += 1) {
            used[a * ck + q] = 1;
          }
        }
        P.box(m, cellX(s, i), y - BANDO_SLAB, cellZ(s, k), cellX(s, i1 + 1), y, cellZ(s, k1 + 1), { name: 'slab' });
      }
    }
  }

  /*
   * EDGE BEAMS round the perimeter at every floor, between two columns
   * that both reach it: the band that makes the frame read as a frame
   * from across the plot, and a bar to fly under where the slab behind it
   * is gone.
   */
  const beamT = 0.35;
  for (let f = 1; f <= N; f += 1) {
    const y = f * fh;
    for (let i = 0; i < nx; i += 1) {
      for (const k of [0, nz]) {
        if (colAt(i, k).top < y - 0.01 || colAt(i + 1, k).top < y - 0.01) {
          continue;
        }
        if ((i === plan.coreI) && (k === 0 ? plan.coreK === 0 : plan.coreK === nz - 1)) {
          continue;
        }
        const zA = k === 0 ? z0 : z0 + W - beamT;
        P.box(plan.burntAt(i + 0.5, k) ? 'bandoSooty' : 'bandoBeam', colX(s, i) + col, y - BANDO_SLAB - BANDO_BEAM, zA, colX(s, i + 1) - col, y - BANDO_SLAB, zA + beamT, { name: 'beam' });
      }
    }
    for (let k = 0; k < nz; k += 1) {
      for (const i of [0, nx]) {
        if (colAt(i, k).top < y - 0.01 || colAt(i, k + 1).top < y - 0.01) {
          continue;
        }
        if ((k === plan.coreK) && (i === 0 ? plan.coreI === 0 : plan.coreI === nx - 1)) {
          continue;
        }
        const xA = i === 0 ? x0 : x0 + D - beamT;
        P.box(plan.burntAt(i, k + 0.5) ? 'bandoSooty' : 'bandoBeam', xA, y - BANDO_SLAB - BANDO_BEAM, colZ(s, k) + col, xA + beamT, y - BANDO_SLAB, colZ(s, k + 1) - col, { name: 'beam' });
      }
    }
  }

  /*
   * THE LIFT SHAFT: a concrete tube in the corner cell, open to the sky
   * a metre and a half over the roof, with a doorway 1.6 m wide and 2.4 m
   * tall onto the floor at every level, the ground included. Down the
   * shaft from the top and out of the ground floor door is the line.
   */
  const sx0 = cellX(s, shaft.i);
  const sx1 = cellX(s, shaft.i + 1);
  const sz0 = cellZ(s, shaft.k);
  const sz1 = cellZ(s, shaft.k + 1);
  const t = BANDO_WALL;
  const shaftTop = N * fh + 1.5;
  /* The door faces into the building along x. */
  const doorFace = shaft.i === 0 ? '+x' : '-x';
  const doors = [];
  for (let f = 0; f < N; f += 1) {
    const zc = (sz0 + sz1) / 2;
    const dw = Math.min(1.6, sz1 - sz0 - 2 * t);
    doors.push({ from: zc - dw / 2, to: zc + dw / 2, y0: f * fh, y1: f * fh + 2.4 });
  }
  const inX = doorFace === '+x' ? sx1 - t / 2 : sx0 + t / 2;
  const outX = doorFace === '+x' ? sx0 + t / 2 : sx1 - t / 2;
  P.wall('bandoRaw', { axis: 'z', at: inX, t, from: sz0, to: sz1, y0: 0, y1: shaftTop, holes: doors }, { name: 'shaft' });
  P.wall('bandoRaw', { axis: 'z', at: outX, t, from: sz0, to: sz1, y0: 0, y1: shaftTop }, { name: 'shaft' });
  P.box('bandoRaw', sx0 + t, 0, sz0, sx1 - t, shaftTop, sz0 + t, { name: 'shaft' });
  P.box('bandoRaw', sx0 + t, 0, sz1 - t, sx1 - t, shaftTop, sz1, { name: 'shaft' });

  /* THE STAIR CORE, beside it: solid, landable, a storey over the roof. */
  P.box('concreteWorn', cellX(s, stair.i), 0, cellZ(s, stair.k), cellX(s, stair.i + 1), N * fh + 2.6, cellZ(s, stair.k + 1), { name: 'core' });

  /* WALLS. */
  const wallTop = (f) => (f + 1) * fh - BANDO_SLAB - BANDO_BEAM;
  for (const w of walls) {
    const y0 = w.f * fh;
    let y1 = wallTop(w.f);
    const alongZ = w.face[1] === 'x';
    const a0 = (alongZ ? colZ(s, w.b) : colX(s, w.b)) + col;
    const a1 = (alongZ ? colZ(s, w.b + 1) : colX(s, w.b + 1)) - col;
    const at = w.face === '+x' ? x0 + D - t / 2 : w.face === '-x' ? x0 + t / 2 : w.face === '+z' ? z0 + W - t / 2 : z0 + t / 2;
    const holesIn = [];
    if (w.kind === 'window' || w.kind === 'breach') {
      const hw = Math.min(a1 - a0 - 1.0, w.w);
      if (hw >= GAP_MIN + 0.2) {
        const hc = clamp((a0 + a1) / 2 + w.off, a0 + 0.5 + hw / 2, a1 - 0.5 - hw / 2);
        const sill = w.kind === 'breach' ? y0 : y0 + 0.8;
        holesIn.push({ from: hc - hw / 2, to: hc + hw / 2, y0: sill, y1: Math.max(sill + 1.55, y1 - 0.25) });
      }
    }
    const gi = alongZ ? (w.face === '+x' ? s.nx : 0) : w.b + 0.5;
    const gk = alongZ ? w.b + 0.5 : (w.face === '+z' ? s.nz : 0);
    /* The gutted and the burnt block wear their old render outside, with
     * the odd bay down to bare block; the skeleton never got any. */
    let m;
    if (plan.burntAt(gi, gk)) {
      m = 'bandoBurnt';
    } else if (s.wreck === 'skeleton') {
      m = w.dark ? 'bandoBlockDark' : 'bandoBlock';
    } else if (s.wreck === 'burnt') {
      m = w.dark ? 'bandoSooty' : plan.render;
    } else {
      m = w.dark ? 'bandoBlock' : plan.render;
    }
    if (w.broken) {
      /* A wall broken off partway: stepped along its length, never higher
       * than 1.2 m, which leaves the gap rule's 1.4 under the beam. Every
       * step is at least the gap rule wide and the middle one is the
       * highest, so the notch over a low step is never a slot. */
      const len = a1 - a0;
      const pieces = len >= 3 * GAP_MIN ? 3 : len >= 2 * GAP_MIN ? 2 : 1;
      const r = seededRandom(w.seed);
      const peak = pieces === 3 ? 1 : r.int(0, pieces - 1);
      for (let q = 0; q < pieces; q += 1) {
        const b0 = a0 + (q / pieces) * len;
        const b1 = a0 + ((q + 1) / pieces) * len;
        const top = y0 + (q === peak ? r.range(0.95, 1.2) : r.range(0.45, 0.85));
        if (alongZ) {
          P.box(m, at - t / 2, y0, b0, at + t / 2, top, b1, { name: 'wall' });
        } else {
          P.box(m, b0, y0, at - t / 2, b1, top, at + t / 2, { name: 'wall' });
        }
      }
      continue;
    }
    if (y1 <= y0 + 0.5) {
      y1 = y0 + 0.5;
    }
    P.wall(m, { axis: alongZ ? 'z' : 'x', at, t, from: a0, to: a1, y0, y1, holes: holesIn }, { name: 'wall' });
  }
  /* Partitions, 0.15 thick, column to column, slab to slab, a breach in
   * each. */
  for (const p of partitions) {
    const y0 = p.f * fh;
    const y1 = (p.f + 1) * fh - BANDO_SLAB;
    const at = p.alongZ ? bayX(s, p.line) : bayZ(s, p.line);
    const a0 = (p.alongZ ? colZ(s, p.b) : colX(s, p.b)) + col;
    const a1 = (p.alongZ ? colZ(s, p.b + 1) : colX(s, p.b + 1)) - col;
    const hw = Math.min(a1 - a0 - 1.0, 2.0);
    if (hw < GAP_MIN + 0.2) {
      continue;
    }
    /* Stay out of the core bay and away from the shaft's door. */
    const bayI = p.alongZ ? p.line : p.b;
    const bayK = p.alongZ ? p.b : p.line;
    if (Math.abs(bayI - plan.coreI) <= 1 && Math.abs(bayK - plan.coreK) <= 1) {
      continue;
    }
    /* Only between two columns that reach the slab over it, on a floor
     * that is there on both sides, and never beside a bay whose slab came
     * down. */
    const endCols = p.alongZ ? [colAt(p.line, p.b), colAt(p.line, p.b + 1)] : [colAt(p.b, p.line), colAt(p.b + 1, p.line)];
    if (endCols.some((c) => c.top < (p.f + 1) * fh - 0.01)) {
      continue;
    }
    if (p.f > 0) {
      const cellsBeside = p.alongZ
        ? [[p.line * 2 - 1, p.b * 2], [p.line * 2 - 1, p.b * 2 + 1], [p.line * 2, p.b * 2], [p.line * 2, p.b * 2 + 1]]
        : [[p.b * 2, p.line * 2 - 1], [p.b * 2 + 1, p.line * 2 - 1], [p.b * 2, p.line * 2], [p.b * 2 + 1, p.line * 2]];
      if (cellsBeside.some(([i, k]) => plan.hole(p.f, i, k))) {
        continue;
      }
    }
    if (ramps.some((r) => (r.f === p.f + 1 || r.f === p.f) && (p.alongZ
      ? (r.bi === p.line || r.bi === p.line - 1) && r.bk === p.b
      : (r.bk === p.line || r.bk === p.line - 1) && r.bi === p.b))) {
      continue;
    }
    const hc = clamp((a0 + a1) / 2 + p.off, a0 + 0.5 + hw / 2, a1 - 0.5 - hw / 2);
    P.wall('bandoRaw', { axis: p.alongZ ? 'z' : 'x', at, t: 0.15, from: a0, to: a1, y0, y1, holes: [{ from: hc - hw / 2, to: hc + hw / 2, y0, y1: y0 + 2.3 }] }, { name: 'partition' });
  }

  /*
   * RAMPS. The fallen slab is drawn as one tilted slab; its solid is a row
   * of capsules along its fall line, each the slab's half thickness, laid
   * side by side touching, so the drawn slab holds them exactly and the
   * row is a closed surface.
   */
  for (const r of ramps) {
    const g = rampGeom(s, r);
    const rad = RAMP_R;
    const [hx, hy] = g.h;
    const [fx, fy] = g.f;
    const L = Math.sqrt((fx - hx) * (fx - hx) + (fy - hy) * (fy - hy));
    const ux = (fx - hx) / L;
    const uy = (fy - hy) / L;
    /* The top end runs a radius back into the slab it hangs from, and
     * the foot's lowest point is a centimetre into the floor it lies on:
     * no crack at either end. */
    const a = [hx - ux * rad, hy - uy * rad];
    const b = [fx - ux * rad, fy - uy * rad];
    const n = Math.max(2, Math.ceil((g.a1 - g.a0 - 2 * rad) / (2 * rad)) + 1);
    for (let q = 0; q < n; q += 1) {
      const c = g.a0 + rad + (q / (n - 1)) * (g.a1 - g.a0 - 2 * rad);
      if (g.alongX) {
        P.cap('slab', [a[0], a[1], c], [b[0], b[1], c], rad, { name: 'ramp', draw: false, kind: 'wall' });
      } else {
        P.cap('slab', [c, a[1], a[0]], [c, b[1], b[0]], rad, { name: 'ramp', draw: false, kind: 'wall' });
      }
    }
  }

  /* RUBBLE, at bay centres, small enough to leave the gap rule to every
   * column and wall round it. */
  for (const r of rubble) {
    const half = Math.min(s.bx, s.bz) / 2 - BANDO_COL - GAP_MIN - 0.1;
    if (half < 0.35) {
      continue;
    }
    const cx = bayX(s, r.bi) + s.bx / 2;
    const cz = bayZ(s, r.bk) + s.bz / 2;
    const hx = half * r.sx;
    const hz = half * r.sz;
    const y = r.f * fh;
    P.box('rubble', cx - hx, y, cz - hz, cx + hx, y + r.h, cz + hz, { name: 'rubble', draw: false });
  }

  /*
   * THE ROOF EDGE: a parapet over the edge beams where the roof slab is
   * still there, broken in places. The skeleton has formwork boards there
   * instead, the same height.
   */
  const yR = N * fh;
  const rp = seededRandom(seedOf(el) ^ 0x7f4a7c15);
  const edgeCells = [];
  for (let i = 0; i < ci; i += 1) {
    edgeCells.push({ i, k: 0, face: '-z' }, { i, k: ck - 1, face: '+z' });
  }
  for (let k = 0; k < ck; k += 1) {
    edgeCells.push({ i: 0, k, face: '-x' }, { i: ci - 1, k, face: '+x' });
  }
  for (const e of edgeCells) {
    if (plan.hole(N, e.i, e.k) || plan.isCore(e.i, e.k)) {
      continue;
    }
    if (!rp.chance(s.wreck === 'skeleton' ? 0.7 : 0.8 - s.ruin * 0.4)) {
      continue;
    }
    const h = s.wreck === 'skeleton' ? 0.9 : rp.chance(0.3) ? rp.range(0.3, 0.6) : 0.9;
    const m = s.wreck === 'skeleton' ? 'plywood' : 'concreteWorn';
    const xa = cellX(s, e.i);
    const xb = cellX(s, e.i + 1);
    const za = cellZ(s, e.k);
    const zb = cellZ(s, e.k + 1);
    const tt = 0.18;
    if (e.face === '-z') {
      P.box(m, xa, yR, za, xb, yR + h, za + tt, { name: 'roofEdge' });
    } else if (e.face === '+z') {
      P.box(m, xa, yR, zb - tt, xb, yR + h, zb, { name: 'roofEdge' });
    } else if (e.face === '-x') {
      P.box(m, xa, yR, za + (e.k === 0 ? tt : 0), xa + tt, yR + h, zb - (e.k === ck - 1 ? tt : 0), { name: 'roofEdge' });
    } else {
      P.box(m, xb - tt, yR, za + (e.k === 0 ? tt : 0), xb, yR + h, zb - (e.k === ck - 1 ? tt : 0), { name: 'roofEdge' });
    }
  }

  /*
   * THE ROOFTOP SIGN of the gutted block: an old hoarding on two legs,
   * 2 m clear of the roof, facing the front, over a bay that still has its
   * roof. Everything round it is either the gap rule away or touching.
   */
  if (s.wreck === 'gutted' && nz >= 3) {
    const bi = nx - 1;
    const bk = Math.floor(nz / 2);
    const ok = [[0, 0], [0, 1], [1, 0], [1, 1]].every(([di, dk]) => !plan.hole(N, bi * 2 + di, bk * 2 + dk));
    if (ok && !(bi === plan.coreI && bk === plan.coreK)) {
      const x = bayX(s, bi) + s.bx / 2;
      const zc = bayZ(s, bk) + s.bz / 2;
      const hw = s.bz / 2 - BANDO_COL - GAP_MIN;
      if (hw >= 1.2) {
        P.box('billboardSteel', x - 0.12, yR + 2.0, zc - hw, x + 0.12, yR + 4.4, zc + hw, { name: 'roofSign' });
        for (const lz of [zc - hw + 0.3, zc + hw - 0.3]) {
          P.post('billboardSteel', x, lz, yR, yR + 2.0, 0.1, { name: 'roofSignLeg' });
        }
      }
    }
  }
  return P.list;
}

/* A slab tilted about a horizontal line, drawn with the renderer's own
 * box: `a` and `b` are the mid plane's two ends, [along, y], `c0..c1` its
 * extent across. */
function tiltedSlab(K, mat, alongX, a, b, c0, c1, thick) {
  const T = K.THREE;
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (c0 + c1) / 2];
  const geo = new T.BoxGeometry(alongX ? L : c1 - c0, thick, alongX ? c1 - c0 : L);
  const m = new T.Matrix4();
  if (alongX) {
    m.makeRotationZ(Math.atan2(b[1] - a[1], b[0] - a[0]));
    m.setPosition(mid[0], mid[1], mid[2]);
  } else {
    m.makeRotationX(Math.atan2(-(b[1] - a[1]), b[0] - a[0]));
    m.setPosition(mid[2], mid[1], mid[0]);
  }
  K.add(mat, geo, m);
}

/* Rebar out of a broken edge: bars bent down under their own weight. */
function rebar(K, rng, p0, out, along, n, len) {
  for (let q = 0; q < n; q += 1) {
    const t = (q + 0.5) / n + rng.range(-0.15, 0.15) / n;
    const s = [p0[0] + along[0] * t, p0[1] + rng.range(-0.08, 0.04), p0[2] + along[2] * t];
    const l = len * rng.range(0.5, 1.1);
    const m = [s[0] + out[0] * l * 0.6, s[1] - l * 0.05, s[2] + out[2] * l * 0.6];
    const e = [s[0] + out[0] * l, s[1] - l * rng.range(0.2, 0.6), s[2] + out[2] * l];
    K.cyl('bandoRebar', s, m, 0.026, 3);
    K.cyl('bandoRebar', m, e, 0.026, 3);
  }
}

/* A rubble heap drawn round its solid: slabs of broken floor tipped at odd
 * angles, blocks, dust. The solid is inside all of it. */
function rubbleDraw(K, p, seed, full = true) {
  const r = seededRandom(seed);
  const T = K.THREE;
  const [ax, ay, az] = p.lo;
  const [bx, by, bz] = p.hi;
  const cx = (ax + bx) / 2;
  const cz = (az + bz) / 2;
  const hx = (bx - ax) / 2;
  const hz = (bz - az) / 2;
  const h = by - ay;
  K.box('rubble', ax, ay, az, bx, by, bz);
  K.blob('rubble', [cx, ay + h * 0.3, cz], Math.max(hx, hz) * 1.05, h * 0.9, [0, r.range(0, 3), 0]);
  if (!full) {
    return;
  }
  for (let q = 0; q < 4; q += 1) {
    const w = r.range(0.8, 1.6) * Math.min(hx, hz);
    const geo = new T.BoxGeometry(w * 1.3, 0.22, w);
    const m = new T.Matrix4().makeRotationFromEuler(new T.Euler(r.range(-0.5, 0.5), r.range(0, 3.1), r.range(-0.5, 0.5)));
    m.setPosition(cx + r.range(-hx, hx) * 0.6, ay + h * r.range(0.5, 0.95), cz + r.range(-hz, hz) * 0.6);
    K.add(q % 2 ? 'slab' : 'bandoRaw', geo, m);
  }
  for (let q = 0; q < 6; q += 1) {
    const x = cx + r.range(-hx, hx) * 1.3;
    const z = cz + r.range(-hz, hz) * 1.3;
    const sz = r.range(0.08, 0.14);
    K.box(r.chance(0.5) ? 'block' : 'rubble', x - sz * 1.4, ay, z - sz, x + sz * 1.4, ay + sz, z + sz);
  }
}

export function bandoDraw(el, parts, K) {
  const plan = bandoPlan(el);
  const { s, walls, ramps, shaft, stair, cols } = plan;
  const { N, fh, x0, z0, W, D, ci, ck } = s;
  const rng = seededRandom(seedOf(el) ^ 0x2545f491);
  const burnt = s.wreck === 'burnt';
  const skeleton = s.wreck === 'skeleton';

  /* The ground floor pad: a slab of old concrete a hand's width proud of
   * the ground, cracked into cells, so the frame stands on something. */
  K.box('bandoRaw', x0 - 0.3, 0, z0 - 0.3, x0 + D + 0.3, 0.02, z0 + W + 0.3);

  /* Ramps: the fallen slab itself, with rebar out of its torn hinge. */
  for (const r of ramps) {
    const g = rampGeom(s, r);
    tiltedSlab(K, burnt ? 'bandoScorch' : 'slab', g.alongX, g.h, g.f, g.a0, g.a1, 0.3);
    const out = g.alongX ? [-r.dir, 0, 0] : [0, 0, -r.dir];
    const along = g.alongX ? [0, 0, g.a1 - g.a0] : [g.a1 - g.a0, 0, 0];
    const p0 = g.alongX ? [g.h[0], g.yTop - 0.12, g.a0] : [g.a0, g.yTop - 0.12, g.h[0]];
    rebar(K, rng, p0, [-out[0], 0, -out[2]], along, 6, 0.5);
  }

  /* Stumps and starter columns get their bars. */
  for (const p of parts) {
    if (p.name === 'columnStump' || (skeleton && p.name === 'column' && p.hi[1] > N * fh + 0.5)) {
      const [ax, , az] = p.lo;
      const [bx, by, bz] = p.hi;
      for (const [x, z] of [[ax + 0.07, az + 0.07], [bx - 0.07, az + 0.07], [ax + 0.07, bz - 0.07], [bx - 0.07, bz - 0.07]]) {
        K.cyl('bandoRebar', [x, by, z], [x + rng.range(-0.2, 0.2), by + rng.range(0.6, 1.2), z + rng.range(-0.2, 0.2)], 0.02, 4);
      }
      /* A broken top is not flat: a chunk off one corner. */
      if (p.name === 'columnStump') {
        K.box('bandoRaw', ax, by - 0.02, az, (ax + bx) / 2, by + 0.14, (az + bz) / 2);
      }
    }
  }

  /*
   * BROKEN SLAB EDGES: wherever a cell is gone and its neighbour is not,
   * the neighbour's edge gets a fringe of rebar and a darker, chipped lip.
   * Every such edge is found first and then a fixed number of them are
   * dressed, picked by the seed, so a big wreck with hundreds of broken
   * edges costs what a small one does rather than ten times as much.
   */
  const edges = [];
  for (let f = 1; f <= N; f += 1) {
    const y = f * fh;
    for (let i = 0; i < ci; i += 1) {
      for (let k = 0; k < ck; k += 1) {
        if (!plan.hole(f, i, k)) {
          continue;
        }
        for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ni = i + di;
          const nk = k + dk;
          if (ni < 0 || nk < 0 || ni >= ci || nk >= ck || plan.hole(f, ni, nk) || plan.isCore(ni, nk)) {
            continue;
          }
          if (di !== 0) {
            const ex = di > 0 ? cellX(s, i + 1) : cellX(s, i);
            edges.push({ y, di, dk, p0: [ex, y - 0.1, cellZ(s, k)], along: [0, 0, s.cz], out: [-di, 0, 0] });
          } else {
            const ez = dk > 0 ? cellZ(s, k + 1) : cellZ(s, k);
            edges.push({ y, di, dk, p0: [cellX(s, i), y - 0.1, ez], along: [s.cx, 0, 0], out: [0, 0, -dk] });
          }
        }
      }
    }
  }
  for (let q = edges.length - 1; q > 0; q -= 1) {
    const r = rng.int(0, q);
    [edges[q], edges[r]] = [edges[r], edges[q]];
  }
  const bars = Math.max(2, Math.round((s.cx + s.cz) * 0.4));
  edges.slice(0, 70).forEach((e, q) => {
    if (q < 34) {
      rebar(K, rng, e.p0, e.out, e.along, bars, 0.55);
    }
    /* The lip: a chipped darker band on the broken edge. */
    const { p0, along, out, y, di, dk } = e;
    const lo = [p0[0], y - 0.3, p0[2]];
    const hi = [p0[0] + along[0] + out[0] * 0.02, y - 0.05, p0[2] + along[2] + out[2] * 0.02];
    K.box('bandoStain', Math.min(lo[0], hi[0]) - (di ? 0.005 : 0), lo[1], Math.min(lo[2], hi[2]) - (dk ? 0.005 : 0),
      Math.max(lo[0], hi[0]) + (di ? 0.005 : 0), hi[1], Math.max(lo[2], hi[2]) + (dk ? 0.005 : 0));
  });

  /*
   * THE WALLS' PAINT. Outside: stains running down from every window and
   * slab edge, tags, scorch over the burnt windows. Inside, the gutted
   * block keeps the colours its rooms were painted, a pastel strip a
   * centimetre off the inner face with a wainscot under it, which is what
   * makes the inside of a ruin read as somebody's home.
   */
  const paintFor = (seed) => ['bandoPaintPink', 'bandoPaintBlue', 'bandoPaintGreen', 'bandoPaintCream', 'bandoTile'][seed % 5];
  for (const w of walls) {
    const alongZ = w.face[1] === 'x';
    const y0 = w.f * fh;
    const wallTopY = (w.f + 1) * fh - BANDO_SLAB - BANDO_BEAM;
    const a0 = (alongZ ? colZ(s, w.b) : colX(s, w.b)) + BANDO_COL;
    const a1 = (alongZ ? colZ(s, w.b + 1) : colX(s, w.b + 1)) - BANDO_COL;
    const outAt = w.face === '+x' ? x0 + D : w.face === '-x' ? x0 : w.face === '+z' ? z0 + W : z0;
    const inFace = { '+x': '-x', '-x': '+x', '+z': '-z', '-z': '+z' }[w.face];
    const inAt = outAt + (w.face[0] === '+' ? -BANDO_WALL : BANDO_WALL);
    const r = seededRandom(w.seed ^ 0x3c6ef372);
    const top = w.broken ? y0 + 0.45 : wallTopY;
    const holeHw = Math.min(a1 - a0 - 1.0, w.w);
    const hasHole = (w.kind === 'window' || w.kind === 'breach') && holeHw >= GAP_MIN + 0.2 && !w.broken;
    const hc = clamp((a0 + a1) / 2 + w.off, a0 + 0.5 + holeHw / 2, a1 - 0.5 - holeHw / 2);
    const hole = hasHole ? {
      from: hc - holeHw / 2,
      to: hc + holeHw / 2,
      y0: w.kind === 'breach' ? y0 : y0 + 0.8,
      y1: Math.max((w.kind === 'breach' ? y0 : y0 + 0.8) + 1.55, wallTopY - 0.25),
    } : null;
    if (!skeleton && s.wreck === 'gutted' && !w.broken && r.chance(0.7)) {
      const paint = paintFor(w.seed);
      const dado = paint === 'bandoTile' ? 'bandoTile' : 'bldTilePale';
      paintAround(K, paint, inFace, inAt, a0 + 0.02, a1 - 0.02, y0 + 0.9, top - 0.02, hole, 0.0, 0.012);
      paintAround(K, dado, inFace, inAt, a0 + 0.02, a1 - 0.02, y0 + 0.02, y0 + 0.9, hole, 0.0, 0.016);
      paintAround(K, 'trim', inFace, inAt, a0 + 0.02, a1 - 0.02, y0 + 0.88, y0 + 0.93, hole, 0.0, 0.03);
    }
    if (hasHole && w.kind === 'window') {
      const sill = y0 + 0.8;
      const head = Math.max(sill + 1.55, wallTopY - 0.25);
      /* What is left of the window frame: the sill and one jamb. */
      fb(K, 'bldFrame', w.face, outAt, hc - holeHw / 2 - 0.05, hc + holeHw / 2 + 0.05, sill - 0.06, sill, -0.01, 0.06);
      if (r.chance(0.5)) {
        fb(K, 'bldFrame', w.face, outAt, hc - holeHw / 2, hc - holeHw / 2 + 0.05, sill, head, -0.01, 0.04);
      }
      /* The stain out of the sill's ends, and a scorch over the head:
       * near the fire a flame shaped plume, narrowing as it climbs, up
       * over the beam. */
      if (burnt && r.chance(0.8)) {
        const gi = alongZ ? (w.face === '+x' ? s.nx : 0) : w.b + 0.5;
        const gk = alongZ ? w.b + 0.5 : (w.face === '+z' ? s.nz : 0);
        const hot = plan.burntAt(gi, gk);
        const reach = hot ? wallTopY + BANDO_BEAM + BANDO_SLAB - 0.03 : wallTopY + 0.35;
        const pw2 = holeHw * (hot ? 1.15 : 0.85);
        const ph2 = reach - head + 0.12;
        const o = w.face[0] === '+' ? 0.008 : -0.008;
        K.sign('bandoSoot', alongZ ? outAt + o : hc, head - 0.12 + ph2 / 2, alongZ ? hc : outAt + o, pw2, ph2, w.face, r.int(0, 3));
      } else {
        for (const u of [hc - holeHw / 2 + 0.08, hc + holeHw / 2 - 0.08]) {
          fb(K, 'bandoStain', w.face, outAt, u - 0.06, u + 0.06, Math.max(y0 + 0.05, sill - r.range(0.5, 0.8)), sill, -0.005, 0.006);
        }
      }
    }
    const board = w.kind === 'boarded' && !w.broken
      ? { from: hc - Math.min(a1 - a0 - 1.0, 1.8) / 2, to: hc + Math.min(a1 - a0 - 1.0, 1.8) / 2, y0: y0 + 0.8, y1: y0 + 2.3 }
      : null;
    if (board) {
      /* Plywood over a window that was never cut in the solid wall. */
      fb(K, 'plywood', w.face, outAt, board.from, board.to, board.y0, board.y1, -0.01, 0.035);
      fb(K, 'rustDeep', w.face, outAt, board.from + 0.1, board.to - 0.1, y0 + 1.5, y0 + 1.56, 0.035, 0.05);
    }
    /* Tags. The gutted block and the skeleton carry the most. */
    const tagChance = s.wreck === 'gutted' ? 0.4 : skeleton ? 0.3 : 0.22;
    if (!w.broken && r.chance(tagChance)) {
      /* On the whole wall, or on the wider pier beside its hole, or in
       * the band under a window's sill. */
      let u0 = a0 + 0.1;
      let u1 = a1 - 0.1;
      let v0 = y0 + 0.25;
      let v1 = top - 0.2;
      /* A tag keeps off a hole and off a boarded window alike. */
      const keepOff = hole ?? board;
      if (keepOff) {
        const left = keepOff.from - a0;
        const right = a1 - keepOff.to;
        if (Math.max(left, right) >= 1.3) {
          [u0, u1] = left > right ? [a0 + 0.1, keepOff.from - 0.1] : [keepOff.to + 0.1, a1 - 0.1];
        } else if (keepOff.y0 - y0 > 0.6) {
          v1 = keepOff.y0 - 0.05;
        } else {
          u1 = u0;
        }
      }
      const gw = Math.min(u1 - u0, 3.6, (v1 - v0) * 2);
      if (gw > 1.0) {
        const gu = (u0 + u1) / 2;
        const gy = v0 + gw / 4;
        K.graffiti(w.face, alongZ ? outAt : gu, gy, alongZ ? gu : outAt, gw, gw / 2, w.seed);
      }
    }
    /* Rain stains down from the beam over it, on the wall itself. */
    if (!w.broken) {
      const n = r.int(0, 2);
      for (let q = 0; q < n; q += 1) {
        const u = a0 + r.range(0.1, 0.9) * (a1 - a0);
        if (hole && u > hole.from - 0.2 && u < hole.to + 0.2) {
          continue;
        }
        const wv = r.range(0.06, 0.2);
        fb(K, burnt ? 'bandoScorch' : 'bandoStain', w.face, outAt, u - wv, u + wv, top - r.range(0.6, 1.6), top, -0.005, 0.006);
      }
    }
  }

  /* Stains down the facade from every edge beam, where the rain runs. */
  for (const p of parts) {
    if (p.name !== 'beam') {
      continue;
    }
    const alongZ = p.hi[0] - p.lo[0] < p.hi[2] - p.lo[2];
    const face = alongZ ? (p.lo[0] < 0 ? '-x' : '+x') : (p.lo[2] < 0 ? '-z' : '+z');
    const at = face === '+x' ? p.hi[0] : face === '-x' ? p.lo[0] : face === '+z' ? p.hi[2] : p.lo[2];
    const a0 = alongZ ? p.lo[2] : p.lo[0];
    const a1 = alongZ ? p.hi[2] : p.hi[0];
    const n = rng.int(0, 2);
    for (let q = 0; q < n; q += 1) {
      const u = a0 + rng.range(0.1, 0.9) * (a1 - a0);
      fb(K, burnt ? 'bandoScorch' : 'bandoStain', face, at, u - rng.range(0.05, 0.2), u + rng.range(0.05, 0.2), p.lo[1] + 0.02, p.hi[1] - rng.range(0.05, 0.3), -0.005, 0.006);
    }
  }

  /*
   * THE LIFT SHAFT: its door frames, the rails inside, a cable hanging
   * down it, and the floor numbers on the stair core, which is what tells
   * a pilot at the top how far down the shaft goes.
   */
  const sx0 = cellX(s, shaft.i);
  const sx1 = cellX(s, shaft.i + 1);
  const sz0 = cellZ(s, shaft.k);
  const sz1 = cellZ(s, shaft.k + 1);
  const doorFace = shaft.i === 0 ? '+x' : '-x';
  const doorAt = doorFace === '+x' ? sx1 : sx0;
  const zc = (sz0 + sz1) / 2;
  const dw = Math.min(1.6, sz1 - sz0 - 2 * BANDO_WALL);
  /* Every doorway framed in hazard stripes, which is what a site does to
   * an open shaft and what makes the way in read from forty metres. */
  for (let f = 0; f < N; f += 1) {
    const y = f * fh;
    fb(K, 'hazard', doorFace, doorAt, zc - dw / 2 - 0.16, zc - dw / 2, y, y + 2.56, -0.01, 0.04);
    fb(K, 'hazard', doorFace, doorAt, zc + dw / 2, zc + dw / 2 + 0.16, y, y + 2.56, -0.01, 0.04);
    fb(K, 'hazard', doorFace, doorAt, zc - dw / 2 - 0.16, zc + dw / 2 + 0.16, y + 2.4, y + 2.56, -0.01, 0.04);
    fb(K, 'lampRed', doorFace, doorAt, zc - 0.1, zc + 0.1, y + 2.64, y + 2.76, -0.01, 0.02);
  }
  /* Tags on the shaft's two outside faces, at the ground, big. */
  const outFaceX = shaft.i === 0 ? '-x' : '+x';
  const outAtX = shaft.i === 0 ? sx0 : sx1;
  const outFaceZ = shaft.k === 0 ? '-z' : '+z';
  const outAtZ = shaft.k === 0 ? sz0 : sz1;
  const tw = Math.min(sz1 - sz0, sx1 - sx0) - 0.3;
  if (tw > 1.2) {
    /* Three different pieces, never the same word twice on one shaft. */
    const tag = rng.int(0, 11);
    K.graffiti(outFaceX, outAtX, 0.35 + tw / 4, zc, tw, tw / 2, tag);
    K.graffiti(outFaceZ, (sx0 + sx1) / 2, 0.35 + tw / 4, outAtZ, tw, tw / 2, tag + 4);
    if (N >= 2) {
      K.graffiti(outFaceX, outAtX, fh * 1.3, zc, tw, tw / 2, tag + 8);
    }
  }
  const railX = doorFace === '+x' ? sx0 + BANDO_WALL + 0.06 : sx1 - BANDO_WALL - 0.06;
  for (const rz of [sz0 + BANDO_WALL + 0.3, sz1 - BANDO_WALL - 0.3]) {
    K.box('metalDark', railX - 0.04, 0, rz - 0.04, railX + 0.04, N * fh + 1.3, rz + 0.04);
  }
  K.cyl('rope', [railX + 0.4 * Math.sign((sx0 + sx1) / 2 - railX), N * fh + 1.5, zc], [railX + 0.4 * Math.sign((sx0 + sx1) / 2 - railX), N * fh * 0.35, zc + 0.2], 0.02, 4);
  /* The shaft's rim at the top in hazard stripes, all four sides, so a
   * pilot on the roof sees the hole before they see into it. */
  const rimY = N * fh + 1.5;
  K.box('hazard', sx0 - 0.03, rimY - 0.35, sz0 - 0.03, sx1 + 0.03, rimY + 0.02, sz0 + BANDO_WALL + 0.03);
  K.box('hazard', sx0 - 0.03, rimY - 0.35, sz1 - BANDO_WALL - 0.03, sx1 + 0.03, rimY + 0.02, sz1 + 0.03);
  K.box('hazard', sx0 - 0.03, rimY - 0.35, sz0 + BANDO_WALL, sx0 + BANDO_WALL + 0.03, rimY + 0.02, sz1 - BANDO_WALL);
  K.box('hazard', sx1 - BANDO_WALL - 0.03, rimY - 0.35, sz0 + BANDO_WALL, sx1 + 0.03, rimY + 0.02, sz1 - BANDO_WALL);
  const cx0 = cellX(s, stair.i);
  const cx1 = cellX(s, stair.i + 1);
  const cz0 = cellZ(s, stair.k);
  const cz1 = cellZ(s, stair.k + 1);
  const coreInFace = shaft.i === 0 ? '+x' : '-x';
  const coreInAt = shaft.i === 0 ? cx1 : cx0;
  for (let f = 0; f < N; f += 1) {
    const y = f * fh;
    K.sign('bldFloor', coreInAt + (coreInFace === '+x' ? 0.012 : -0.012), y + 1.9, (cz0 + cz1) / 2, 0.9, 0.9, coreInFace, f);
    /* A doorway painted dark: the stair door, long gone. */
    fb(K, 'glassDark', coreInFace, coreInAt, (cz0 + cz1) / 2 - 0.45, (cz0 + cz1) / 2 + 0.45, y, y + 1.5, -0.01, 0.01);
  }
  K.box('bandoColumn', cx0 - 0.03, N * fh + 2.6, cz0 - 0.03, cx1 + 0.03, N * fh + 2.7, cz1 + 0.03);
  /* The stair window slits on the core's outer face, zig zagging. */
  const coreOut = stair.i === 0 ? '-x' : '+x';
  const coreOutAt = stair.i === 0 ? cx0 : cx1;
  for (let f = 0; f < N; f += 1) {
    const y = f * fh;
    fb(K, 'glassDark', coreOut, coreOutAt, cz0 + 0.4, cz0 + 0.9, y + 0.9, y + 1.9, -0.01, 0.01);
    fb(K, 'glassDark', coreOut, coreOutAt, cz1 - 0.9, cz1 - 0.4, y + 2.4, y + 3.2, -0.01, 0.01);
  }

  /* RUBBLE: the first two dozen heaps in full, the rest as a mound. */
  let heaps = 0;
  for (const p of parts) {
    if (p.name === 'rubble') {
      heaps += 1;
      rubbleDraw(K, p, Math.round((p.lo[0] * 31 + p.lo[2] * 17) * 100), heaps <= 24);
    }
  }

  /* Debris on every floor that is still there: flat chunks, a few blocks,
   * never more than a hand high. */
  for (let f = 0; f < N; f += 1) {
    const y = f * fh;
    for (let q = 0; q < Math.min(30, Math.round(ci * ck * 0.35)); q += 1) {
      const i = rng.int(0, ci - 1);
      const k = rng.int(0, ck - 1);
      if (f > 0 && plan.hole(f, i, k)) {
        continue;
      }
      if (plan.isCore(i, k)) {
        continue;
      }
      const x = cellX(s, i) + rng.range(0.3, s.cx - 0.3);
      const z = cellZ(s, k) + rng.range(0.3, s.cz - 0.3);
      const a = rng.range(0.1, 0.35);
      K.box(rng.pick(['rubble', 'bandoRaw', 'block']), x - a, y, z - a * 0.7, x + a, y + rng.range(0.04, 0.1), z + a * 0.7);
    }
  }

  /*
   * WHAT HANGS FROM THE CEILINGS: cut cables in loose loops and the odd
   * fluorescent fitting swinging on one wire. Thin, so they are paint, and
   * they are what makes the air inside a ruin feel like the inside of a
   * ruin rather than a car park.
   */
  for (let f = 1; f <= N; f += 1) {
    const y = f * fh - BANDO_SLAB;
    const n = Math.min(16, Math.round(ci * ck * (skeleton ? 0.08 : 0.2)));
    for (let q = 0; q < n; q += 1) {
      const i = rng.int(0, ci - 1);
      const k = rng.int(0, ck - 1);
      if (plan.hole(f, i, k) || plan.isCore(i, k) || plan.holes[f - 1][i * ck + k] === 2) {
        continue;
      }
      const x = cellX(s, i) + rng.range(0.4, s.cx - 0.4);
      const z = cellZ(s, k) + rng.range(0.4, s.cz - 0.4);
      if (rng.chance(0.3)) {
        /* A tube light on one wire, its other end fallen. */
        const len = rng.range(0.3, 0.8);
        const a = [x, y - len, z];
        const dx = rng.range(-0.5, 0.5);
        const b = [x + dx, y - len - rng.range(0.4, 0.9), z + Math.sqrt(Math.max(0, 1.1 - dx * dx)) * (rng.chance(0.5) ? 1 : -1)];
        K.cyl('rope', [x, y, z], a, 0.008, 3);
        K.cyl('bldFrame', a, b, 0.045, 5);
        K.cyl('bldBlind', [a[0] + (b[0] - a[0]) * 0.1, a[1] + (b[1] - a[1]) * 0.1 - 0.03, a[2] + (b[2] - a[2]) * 0.1], [a[0] + (b[0] - a[0]) * 0.9, a[1] + (b[1] - a[1]) * 0.9 - 0.03, a[2] + (b[2] - a[2]) * 0.9], 0.022, 4);
      } else {
        /* A cable: down, a loop, and back up to the soffit. */
        const drop = rng.range(0.5, 1.4);
        const dx = rng.range(-0.8, 0.8);
        const dz = rng.range(-0.8, 0.8);
        const mid = [x + dx * 0.5, y - drop, z + dz * 0.5];
        K.cyl('rope', [x, y, z], mid, 0.012, 3);
        K.cyl('rope', mid, [x + dx, y - drop * rng.range(0.2, 0.7), z + dz], 0.012, 3);
      }
    }
  }

  /* Weeds on the ground and moss where the water sits. */
  for (let q = 0; q < 12; q += 1) {
    const x = x0 + rng.range(-1, D + 1);
    const z = z0 + rng.range(-1, W + 1);
    K.patch('weeds', x, 0.03, z, rng.range(0.6, 1.8), rng.int(0, 1000));
  }
  /*
   * IVY: climbing the outside of some perimeter columns from the ground,
   * and hanging from the roof edge over the walls where the roof is still
   * there. A plane a centimetre off the face, painted.
   */
  for (const c of cols) {
    const onEdge = c.i === 0 || c.k === 0 || c.i === s.nx || c.k === s.nz;
    if (!onEdge || !rng.chance(skeleton ? 0.15 : 0.3)) {
      continue;
    }
    const x = colX(s, c.i);
    const z = colZ(s, c.k);
    const face = c.i === 0 ? '-x' : c.i === s.nx ? '+x' : c.k === 0 ? '-z' : '+z';
    const hgt = Math.min(c.top, rng.range(2.4, Math.max(2.6, N * fh * 0.8)));
    const off = BANDO_COL + 0.012;
    const px = face === '+x' ? x + off : face === '-x' ? x - off : x;
    const pz = face === '+z' ? z + off : face === '-z' ? z - off : z;
    K.sign('bandoIvy', px, hgt / 2, pz, 0.75, hgt, face, rng.int(0, 2) * 2);
  }
  if (!skeleton) {
    for (const w of walls) {
      if (w.f !== N - 1 || w.broken || !rng.chance(0.35)) {
        continue;
      }
      const alongZ = w.face[1] === 'x';
      const a0 = (alongZ ? colZ(s, w.b) : colX(s, w.b)) + BANDO_COL;
      const a1 = (alongZ ? colZ(s, w.b + 1) : colX(s, w.b + 1)) - BANDO_COL;
      const outAt = w.face === '+x' ? x0 + D : w.face === '-x' ? x0 : w.face === '+z' ? z0 + W : z0;
      const o = w.face[0] === '+' ? 0.012 : -0.012;
      const u = a0 + rng.range(0.2, 0.8) * (a1 - a0);
      const hh = rng.range(1.5, Math.min(3.2, fh * 1.2));
      const top = N * fh - BANDO_SLAB;
      K.sign('bandoIvy', alongZ ? outAt + o : u, top - hh / 2, alongZ ? u : outAt + o, 1.1, hh, w.face, rng.int(0, 2) * 2 + 1);
    }
  }

  /*
   * THE SKELETON'S KIT: a blue tarp over part of the roof edge, hanging
   * down the face, and the formwork's battens on the roof edge boards.
   */
  if (skeleton) {
    for (const p of parts) {
      if (p.name === 'roofEdge') {
        const alongX = p.hi[0] - p.lo[0] > p.hi[2] - p.lo[2];
        const len = alongX ? p.hi[0] - p.lo[0] : p.hi[2] - p.lo[2];
        const n = Math.max(1, Math.round(len / 0.6));
        for (let q = 0; q <= n; q += 1) {
          const u = (alongX ? p.lo[0] : p.lo[2]) + (q / n) * len;
          if (alongX) {
            K.box('toeBoard', u - 0.03, p.lo[1], p.lo[2] - 0.04, u + 0.03, p.hi[1], p.hi[2] + 0.04);
          } else {
            K.box('toeBoard', p.lo[0] - 0.04, p.lo[1], u - 0.03, p.hi[0] + 0.04, p.hi[1], u + 0.03);
          }
        }
      }
    }
    /* The tarp: tied at the top, hanging in folds, a ragged bottom edge.
     * Strips alternate between the lit and the fold colour and stand at
     * slightly different depths, so every fold gets its own ink line. */
    const tz = z0 + W * rng.range(0.2, 0.5);
    const tw = Math.min(6, W * 0.3);
    const strips = Math.max(3, Math.round(tw / 0.7));
    const top = N * fh + 0.05;
    for (let q = 0; q < strips; q += 1) {
      const za = tz + (q / strips) * tw;
      const zb = tz + ((q + 1) / strips) * tw;
      const deep = q % 2 === 1;
      const drop = rng.range(2.1, 2.9);
      const n0 = deep ? 0.02 : 0.05;
      K.box(deep ? 'bandoTarpDeep' : 'bandoTarp', x0 + D + n0 - 0.02, top - drop, za, x0 + D + n0, top, zb);
    }
    for (let q = 0; q <= 3; q += 1) {
      const z = tz + (q / 3) * tw;
      K.cyl('rope', [x0 + D + 0.06, top, z], [x0 + D - 0.3, top + 0.02, z], 0.012, 3);
    }
  }

  /* The keep out board on a ground floor column of the front. */
  const front = cols.filter((c) => c.i === s.nx && c.k > 0 && c.k < s.nz);
  if (front.length) {
    const c = front[Math.floor(front.length / 2)];
    K.sign('bldKeepOut', x0 + D + 0.015, 1.6, colZ(s, c.k), 0.46, 0.58, '+x', burnt ? 1 : 0);
  }

  /* The old hoarding on the roof: a torn manga advert, half of it gone. */
  for (const p of parts) {
    if (p.name === 'roofSign') {
      const [ax, ay, az] = p.lo;
      const [bx, by, bz] = p.hi;
      const w = bz - az;
      K.sign('mangaAd', bx + 0.012, (ay + by) / 2, az + w * 0.36, w * 0.68, by - ay - 0.3, '+x', rng.int(0, 11));
      K.box('rustDeep', bx, ay + 0.1, az + w * 0.72, bx + 0.01, by - 0.1, bz - 0.1);
      for (let q = 0; q < 4; q += 1) {
        const y = ay + 0.3 + q * ((by - ay - 0.6) / 3);
        K.box('billboardSteelDark', ax - 0.12, y - 0.04, az, ax, y + 0.04, bz);
      }
    }
  }
}
