/*
 * icons.js: draw the WebFPV mark and write the icon files a browser asks for.
 *
 * WHY THIS IS A SCRIPT AND NOT FOUR CHECKED IN BINARIES. An .ico is opaque:
 * once it is committed nobody can tell what it draws, what it was drawn from
 * or how to change the colour without a paint program and a guess. The mark
 * is four propellers, an X frame and a centre plate, which is about twenty
 * lines of arithmetic, so the geometry lives here as the one source of truth
 * and every file is derived from it. Change the mark in one place and rerun.
 *
 * WHY NO DEPENDENCY. Rasterising this needs signed distance fields and a box
 * filter, and encoding it needs zlib, which node already has. A PNG is a
 * length, a four letter tag, the bytes and a CRC, repeated three times. An
 * ICO is a six byte header, one sixteen byte directory entry per size and
 * the PNGs end to end. That is the whole format surface used here, so an
 * image library would be a few megabytes bought to avoid a hundred lines.
 *
 * ONE MARK, FOUR TINTS, and the tints are not decoration. A pilot ends up
 * with the simulator, the builder and the board open in three tabs at once,
 * and at sixteen pixels a tab is the icon plus four letters of title. Each
 * page's icon takes the accent that page itself is built out of, because the
 * icon is seen next to that page's title and above that page's colours:
 *
 *   sakura  the simulator, whose wordmark's FPV is sakura, 32 uses to mint's
 *           19, and which is the family's chrome colour everywhere else too
 *   amber   the track builder, where every armed tool, every selected object
 *           and every readout is amber
 *   mint    the board. Its own chrome is sakura, like the simulator's, and
 *           two identical icons defeat the whole point, so it takes mint,
 *           which is the colour it paints a record in
 *   cream   the landing page, the front door, which owns no product's accent
 *           and gets the other half of the wordmark
 *
 * THIS IS NOT THE MAPPING THE LANDING PAGE'S CARDS USE. Those are mint for
 * the simulator, sakura for the builder and amber for the board, which is a
 * different thing: a card sits in a row of three on one page and only has to
 * differ from its two neighbours, while an icon has to survive being looked
 * at beside the page it belongs to. Taking the cards' mapping would have put
 * a sakura icon on the amber page. Written down because the two mappings
 * disagree on every row and the next person will notice and wonder which is
 * wrong. Neither is. DEPLOY.md tabulates the same four and is the copy a
 * deploy is read from.
 *
 * WHAT IT WRITES, into the directory it is pointed at, with the names a
 * browser looks for on its own:
 *
 *   icon.svg              what every current browser uses, scales anywhere
 *   favicon.ico           16, 32 and 48, for the automatic /favicon.ico
 *   apple-touch-icon.png  180, for an iOS home screen
 *
 * Usage:
 *   node scripts/icons.js <accent> <outdir>
 *   npm run gen:icons          both sets inside this repo
 *
 * The board and the landing page are separate repositories and separate
 * static sites, so their sets are written across a checkout beside this one.
 * DEPLOY.md lists the four commands.
 *
 * THE OUTPUT IS COMMITTED AND NOTHING CHECKS IT, which is worth knowing
 * before trusting it. Change a number in the mark below without rerunning
 * this, and the site ships an SVG and a raster that draw different pictures
 * with no check failing, because none of the sixteen Stage 1 checks looks at
 * an icon. The pixels are deterministic; the FILES are not quite, because
 * the IDAT payload is whatever the linked zlib emits, so a Node upgrade that
 * moves the bundled zlib rewrites all eight files for a mark that did not
 * change. Neither is a reason to generate at deploy time: there is no build
 * step on any of the three services to generate in.
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

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

/*
 * The palette, from the tokens every page in the family declares at :root.
 * Written once, as the hex a stylesheet would write, and unpacked to bytes
 * for the rasteriser, which blends in eight bit channels. Two tables would
 * be the obvious way to write this and it is the wrong one: the two would
 * drift, and the failure is a favicon.ico whose propellers are one colour
 * and an icon.svg whose propellers are another, on the same page, with the
 * SVG winning in a browser tab and the ICO winning on a pinned tab.
 */
const HEX = {
  deep: '#141c16',
  cream: '#f3ead4',
  sakura: '#e8a8b8',
  amber: '#ffd45c',
  mint: '#7dffb4',
};

const PALETTE = Object.fromEntries(
  Object.entries(HEX).map(([name, hex]) => [
    name,
    [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)),
  ])
);

/* The four a page may ask for. --deep is the ground under all of them and is
 * not an accent, so it is not in here. */
const ACCENTS = new Set(['cream', 'sakura', 'amber', 'mint']);

/*
 * THE MARK, in a 32 unit square, which is the size the SVG declares and the
 * size every raster is sampled from. A quad seen from above: four propeller
 * discs on the diagonals, the X frame under them, the flight stack and
 * camera as a plate in the middle.
 *
 * The numbers are the ones that survived being looked at at sixteen pixels.
 * Discs at radius 4.25 leave a clear gap to the plate's rounded corner;
 * pushed out to the corners they touch it and the mark reads as a ring.
 * The arms are drawn at just over half opacity: solid, they compete with
 * the propellers and the whole thing turns into a filled square, and much
 * fainter than this they vanish below thirty two pixels and leave four
 * unexplained dots.
 */
const PLATE_RADIUS = 7;
const MOTOR_NEAR = 10.4;
const MOTOR_FAR = 21.6;
const MOTOR_RADIUS = 4.25;
const ARM_RADIUS = 1.8;
const ARM_ALPHA = 0.52;
const HUB = 5.4;
const HUB_RADIUS = 1.5;

/* Signed distance to a rounded rectangle, negative inside. */
function sdRoundRect(x, y, cx, cy, w, h, r) {
  const qx = Math.abs(x - cx) - (w / 2 - r);
  const qy = Math.abs(y - cy) - (h / 2 - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

/* Signed distance to a disc. */
function sdDisc(x, y, cx, cy, r) {
  return Math.hypot(x - cx, y - cy) - r;
}

/* Signed distance to a capsule, which is a line segment with a radius. */
function sdSegment(x, y, ax, ay, bx, by, r) {
  const pax = x - ax;
  const pay = y - ay;
  const bax = bx - ax;
  const bay = by - ay;
  const t = Math.max(0, Math.min(1, (pax * bax + pay * bay) / (bax * bax + bay * bay)));
  return Math.hypot(pax - bax * t, pay - bay * t) - r;
}

const MOTORS = [
  [MOTOR_NEAR, MOTOR_NEAR],
  [MOTOR_FAR, MOTOR_NEAR],
  [MOTOR_NEAR, MOTOR_FAR],
  [MOTOR_FAR, MOTOR_FAR],
];

/*
 * The mark as a painter's list, back to front. Each entry is a field, a
 * colour and an opacity, and the rasteriser composites them in order.
 */
function layers(accent) {
  const a = PALETTE[accent];
  return [
    { d: (x, y) => sdRoundRect(x, y, 16, 16, 32, 32, PLATE_RADIUS), c: PALETTE.deep, a: 1 },
    { d: (x, y) => sdSegment(x, y, MOTOR_NEAR, MOTOR_NEAR, MOTOR_FAR, MOTOR_FAR, ARM_RADIUS), c: a, a: ARM_ALPHA },
    { d: (x, y) => sdSegment(x, y, MOTOR_FAR, MOTOR_NEAR, MOTOR_NEAR, MOTOR_FAR, ARM_RADIUS), c: a, a: ARM_ALPHA },
    ...MOTORS.map(([cx, cy]) => ({ d: (x, y) => sdDisc(x, y, cx, cy, MOTOR_RADIUS), c: a, a: 1 })),
    { d: (x, y) => sdRoundRect(x, y, 16, 16, HUB, HUB, HUB_RADIUS), c: PALETTE.cream, a: 1 },
  ];
}

/*
 * Rasterise to straight RGBA at the given size.
 *
 * SUPERSAMPLED RATHER THAN ANTIALIASED FROM THE DISTANCE. A distance field
 * gives a clean edge for one shape, but this mark has six overlapping ones
 * and blending their coverages pairwise leaves seams where an arm meets a
 * propeller. Sampling the finished picture sixteen times per pixel has no
 * seams by construction and costs nothing at these sizes.
 *
 * The colour is accumulated weighted by alpha and divided back out at the
 * end, so a transparent corner sample contributes no colour rather than
 * dragging the edge towards black.
 */
function raster(size, accent) {
  const SUB = 4;
  const px = new Uint8Array(size * size * 4);
  const list = layers(accent);
  const plate = (x, y) => sdRoundRect(x, y, 16, 16, 32, 32, PLATE_RADIUS);

  for (let py = 0; py < size; py++) {
    for (let pxi = 0; pxi < size; pxi++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let cover = 0;

      for (let sy = 0; sy < SUB; sy++) {
        for (let sx = 0; sx < SUB; sx++) {
          const ux = ((pxi + (sx + 0.5) / SUB) / size) * 32;
          const uy = ((py + (sy + 0.5) / SUB) / size) * 32;
          if (plate(ux, uy) > 0) {
            continue;
          }
          let cr = 0;
          let cg = 0;
          let cb = 0;
          for (const layer of list) {
            if (layer.d(ux, uy) <= 0) {
              cr = layer.c[0] * layer.a + cr * (1 - layer.a);
              cg = layer.c[1] * layer.a + cg * (1 - layer.a);
              cb = layer.c[2] * layer.a + cb * (1 - layer.a);
            }
          }
          r += cr;
          g += cg;
          b += cb;
          cover += 1;
        }
      }

      const i = (py * size + pxi) * 4;
      px[i] = cover > 0 ? Math.round(r / cover) : 0;
      px[i + 1] = cover > 0 ? Math.round(g / cover) : 0;
      px[i + 2] = cover > 0 ? Math.round(b / cover) : 0;
      px[i + 3] = Math.round((cover / (SUB * SUB)) * 255);
    }
  }
  return px;
}

/* ------------------------------------------------------------------ */
/* PNG                                                                */
/* ------------------------------------------------------------------ */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (const byte of buf) {
    c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  }
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/*
 * Filter type 0 on every row. The mark is flat colour over flat colour, so
 * deflate finds the runs on its own and a paeth filter buys nothing but a
 * longer function.
 */
function png(size, px) {
  const stride = size * 4;
  const raw = Buffer.alloc(size * (stride + 1));
  /* Through the view, not the buffer under it. Buffer.from(px.buffer, ...)
     addresses the ArrayBuffer and ignores px.byteOffset, which is zero for
     what raster() returns today and is not zero for a subarray or for any
     Node Buffer, which are pooled. Getting that wrong reads every scanline
     from the wrong place and still produces a structurally valid PNG with
     correct CRCs, so nothing downstream complains. */
  const view = Buffer.from(px.buffer, px.byteOffset, px.byteLength);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    view.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; /* eight bits a channel */
  ihdr[9] = 6; /* truecolour with alpha */
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ------------------------------------------------------------------ */
/* ICO                                                                */
/* ------------------------------------------------------------------ */

/*
 * PNG payloads rather than the old DIB ones. Every browser that is still
 * shipping reads a PNG inside an ICO, and a DIB needs a bottom up bitmap
 * and an AND mask nothing has consulted in twenty years.
 */
function ico(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); /* 1 means icon */
  header.writeUInt16LE(entries.length, 4);

  const dir = Buffer.alloc(16 * entries.length);
  let offset = header.length + dir.length;
  entries.forEach((e, i) => {
    const at = i * 16;
    /* Zero in the size byte means 256, which is why 256 is the cap. */
    dir[at] = e.size >= 256 ? 0 : e.size;
    dir[at + 1] = e.size >= 256 ? 0 : e.size;
    dir[at + 2] = 0; /* palette entries */
    dir[at + 3] = 0;
    dir.writeUInt16LE(1, at + 4); /* colour planes */
    dir.writeUInt16LE(32, at + 6); /* bits a pixel */
    dir.writeUInt32LE(e.data.length, at + 8);
    dir.writeUInt32LE(offset, at + 12);
    offset += e.data.length;
  });

  return Buffer.concat([header, dir, ...entries.map((e) => e.data)]);
}

/* ------------------------------------------------------------------ */
/* SVG                                                                */
/* ------------------------------------------------------------------ */

/*
 * The same geometry again, declaratively. This is the file a browser
 * actually uses, and the one a person can open and read, so it is written
 * out rather than being a raster in disguise.
 *
 * IT CARRIES THE LICENCE, because it is a text file this project authored
 * and the rule here is that every one of them does. The .ico and the .png
 * cannot: neither format has anywhere to put a comment that a browser will
 * reliably ignore. This one does, so it has no excuse. The notice sits after
 * the root element rather than before it so that nothing has to parse an XML
 * prolog to find the drawing.
 */
const NOTICE = `<!--
    The WebFPV mark. Generated by scripts/icons.js in WebFPVSimulator; edit
    the geometry there and regenerate, not here.

    This file is part of WebFPVSimulator.

    WebFPVSimulator is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by the
    Free Software Foundation, either version 3 of the License, or (at your
    option) any later version. It is distributed WITHOUT ANY WARRANTY, see
    <https://www.gnu.org/licenses/> for the full text.
  -->`;

function svg(accent) {
  const a = HEX[accent];
  const arms = [
    `M${MOTOR_NEAR} ${MOTOR_NEAR}L${MOTOR_FAR} ${MOTOR_FAR}`,
    `M${MOTOR_FAR} ${MOTOR_NEAR}L${MOTOR_NEAR} ${MOTOR_FAR}`,
  ].join('');
  const discs = MOTORS.map(([cx, cy]) => `<circle cx="${cx}" cy="${cy}" r="${MOTOR_RADIUS}"/>`).join('');
  const hub = 16 - HUB / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" role="img" aria-label="WebFPV">
  ${NOTICE}
  <rect width="32" height="32" rx="${PLATE_RADIUS}" fill="${HEX.deep}"/>
  <path d="${arms}" stroke="${a}" stroke-width="${ARM_RADIUS * 2}" stroke-linecap="round" opacity="${ARM_ALPHA}"/>
  <g fill="${a}">${discs}</g>
  <rect x="${hub}" y="${hub}" width="${HUB}" height="${HUB}" rx="${HUB_RADIUS}" fill="${HEX.cream}"/>
</svg>
`;
}

/* ------------------------------------------------------------------ */

function main() {
  const [accent, outArg] = process.argv.slice(2);
  /*
   * A Set, not a lookup on the palette object. `PALETTE[accent]` finds
   * everything on Object.prototype too, so `icons.js constructor out/`
   * passed validation, bound a function as the accent, multiplied
   * undefined into every channel and wrote three files that are valid,
   * openable and entirely wrong, reporting success. NaN stored into a
   * Uint8Array is zero, so the failure is silent all the way to the tab.
   */
  if (!accent || !ACCENTS.has(accent) || !outArg) {
    console.error(`usage: node scripts/icons.js <${[...ACCENTS].join('|')}> <outdir>`);
    process.exit(2);
  }
  const out = resolve(outArg);
  mkdirSync(out, { recursive: true });

  writeFileSync(join(out, 'icon.svg'), svg(accent));
  writeFileSync(
    join(out, 'favicon.ico'),
    ico([16, 32, 48].map((size) => ({ size, data: png(size, raster(size, accent)) })))
  );
  writeFileSync(join(out, 'apple-touch-icon.png'), png(180, raster(180, accent)));

  console.log(`${accent} mark written to ${out}: icon.svg, favicon.ico, apple-touch-icon.png`);
}

main();
