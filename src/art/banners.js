/*
 * banners.js: the printed vinyl a race course is dressed in.
 *
 * WHAT THIS IS. Every gate on a drone racing course wears printed banner
 * sleeves, and every course is lined with printed teardrop flags. The gates
 * and walls are white vinyl, with the event's mark sitting on the header
 * board, and the flags keep the navy, red and chequer language that says
 * racing from further away than a wordmark can be read. This module paints
 * that onto canvases. It knows nothing about Three.js, nothing about the
 * physics, and nothing about the track document.
 *
 * WHY IT IS SHARED AND WHY IT LIVES HERE. Two consumers need identical
 * artwork: src/render/scene.js dresses the world with it, and
 * src/trackbuilder/view3d.js dresses the AUTHOR'S PREVIEW with it, so that
 * what somebody builds looks like what they fly. The builder is not allowed
 * to import the simulator (see src/trackbuilder/schema.md), so the artwork
 * cannot live in src/render. It is not the game and it is not the builder: it
 * is the art both of them draw from, so it is its own directory.
 *
 * NO TRADEMARKS. The reference for this look is a MultiGP course, and what is
 * reproduced is the FORM: a white header board, sleeve banners down the
 * uprights, a chequered flag band as a border, teardrop flags with a navy or
 * red sweep. The mark on the board is whatever the author uploads, and with
 * nothing uploaded it is a chequered flag device this file draws, not
 * anybody's logo.
 *
 * THE CALLER OWNS THE CANVAS. Each painter takes a 2D context and its size
 * and paints the whole of it. The caller decides how big, wraps it in
 * whatever texture object it uses, and repaints when the logo finishes
 * decoding. That is what lets one module serve two renderers.
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

/*
 * The palette.
 *
 * WHITE IS NOT WHITE, and that is a measurement rather than a preference.
 * The renderer's own note is that a pure white flag came out brighter than
 * the sky, which inverts the value structure the whole art direction rests
 * on and makes seventy two pieces of dressing louder than the gate the pilot
 * is trying to find. The horizon band is 0xf2e3cb, so the vinyl sits a clear
 * step under it at 0xdcd6ca: on screen it still reads as white banner
 * against grass, and it can never out value the sky.
 */
export const BANNER = {
  vinyl: '#dcd6ca',
  vinylShade: '#c7c0b3',
  navy: '#1e3566',
  navyDeep: '#152648',
  red: '#b8332c',
  ink: '#1a1f2b',
  chequerDark: '#23272f',
  chequerLight: '#eae6dd',
};

/* The same colours as 0xRRGGBB, for the two Three.js consumers that cannot
 * feed a CSS string into a MeshLambertMaterial. Named rather than parsed at
 * each call site so a typo in a colour name fails here, once. */
export function bannerHex(name) {
  const s = BANNER[name];
  if (typeof s !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(s)) {
    throw new Error(`banners: ${name} is not a six digit colour`);
  }
  return Number.parseInt(s.slice(1), 16);
}

/* A chequered flag band. `cells` counts the checks ACROSS the band, and the
 * band is always two checks deep, which is what a racing chequer is. */
export function chequer(ctx, x, y, w, h, cells, dark = BANNER.chequerDark, light = BANNER.chequerLight) {
  const cw = w / Math.max(1, cells);
  const ch = h / 2;
  for (let i = 0; i < cells; i += 1) {
    for (let j = 0; j < 2; j += 1) {
      ctx.fillStyle = (i + j) % 2 === 0 ? dark : light;
      ctx.fillRect(x + i * cw, y + j * ch, cw + 0.5, ch + 0.5);
    }
  }
}

/*
 * The default mark: a chequered flag on a staff, drawn rather than typed, so
 * a course with no logo still reads as a race course and not as a blank
 * board. Fits the box it is given, centred.
 */
export function chequerDevice(ctx, x, y, w, h) {
  const staffW = Math.max(2, w * 0.045);
  ctx.fillStyle = BANNER.ink;
  ctx.fillRect(x, y, staffW, h);
  const fw = w - staffW * 2.2;
  const fh = h * 0.62;
  const fx = x + staffW * 2.2;
  const fy = y + h * 0.06;
  ctx.save();
  ctx.beginPath();
  /* A flag flying, not a rectangle: the fly edge waves and the bottom lifts,
   * which is the difference between a chequered flag and a chessboard. */
  ctx.moveTo(fx, fy);
  ctx.lineTo(fx + fw, fy - fh * 0.12);
  ctx.lineTo(fx + fw, fy + fh * 0.78);
  ctx.lineTo(fx, fy + fh);
  ctx.closePath();
  ctx.clip();
  const cells = 6;
  const cw = fw / cells;
  const chh = fh / 4;
  for (let i = 0; i < cells; i += 1) {
    for (let j = 0; j < 4; j += 1) {
      ctx.fillStyle = (i + j) % 2 === 0 ? BANNER.chequerDark : BANNER.chequerLight;
      ctx.fillRect(fx + i * cw, fy - fh * 0.14 + j * chh, cw + 0.5, chh + 0.5);
    }
  }
  ctx.restore();
}

/*
 * Draw an image to fit a box, keeping its own proportions, centred. Every
 * painter below takes the logo this way, so an upload is never stretched and
 * never cropped whatever shape it is.
 */
function fit(ctx, img, x, y, w, h) {
  const sw = img.naturalWidth || img.width;
  const sh = img.naturalHeight || img.height;
  if (!(sw > 0 && sh > 0)) {
    return;
  }
  const k = Math.min(w / sw, h / sh);
  ctx.drawImage(img, x + (w - sw * k) * 0.5, y + (h - sh * k) * 0.5, sw * k, sh * k);
}

/*
 * THE GATE HEADER, the banner sleeved over the top rail.
 *
 * White vinyl, with the sponsor's mark sitting on it. That is the whole of
 * the board a pilot reads at commit range: a pale sheet and a picture, not
 * a navy field with a mark squeezed between two red flashes.
 *
 * BOTH ENDS ARE LEFT CLEAR, and it has to be both. The gate number sits at
 * one end as real geometry, a pale roundel with the numeral raised on it,
 * because a number painted into this texture would mean one texture per gate
 * and fourteen gates would be fourteen draw calls where there is now one.
 * The banner is printed on both faces of the header and the reverse is
 * mirrored, so the end the roundel lands on is the LEFT end from one side
 * and the RIGHT end from the other. Clearing one end would put the roundel
 * on top of the mark for every pilot arriving the other way.
 *
 * `numberZone` is that clear fraction of the width at each end, so the two
 * halves of the design cannot disagree about where the roundel lands.
 */
/*
 * Fraction of a gate header's width kept clear at EACH end for the roundel.
 * The painter here and everyone who has to place a roundel ON a header have
 * to agree, and they did not: this number was written out again in
 * render/scene.js and a third time in trackbuilder/logo.js, each with a
 * comment claiming it was shared. Exported so the claim is true.
 */
export const HEADER_NUMBER_ZONE = 0.22;

export function paintGateHeader(ctx, w, h, opts = {}) {
  const numberZone = opts.numberZone ?? HEADER_NUMBER_ZONE;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = BANNER.vinyl;
  ctx.fillRect(0, 0, w, h);

  /* The hems: a shade darker bound edge top and bottom, which is what stops
   * a white sheet reading as a hole in the sky at any distance. */
  ctx.fillStyle = BANNER.vinylShade;
  ctx.fillRect(0, 0, w, h * 0.045);
  ctx.fillRect(0, h * 0.955, w, h * 0.045);

  /*
   * A chequer band along the foot, full width. On a white board this is the
   * one dark motif that still says racing from further away than the logo
   * can be read. A racing chequer is a border, not a stripe, so it stays
   * thin: most of the board is the white the mark sits on.
   */
  chequer(ctx, 0, h * 0.88, w, h * 0.075, Math.round(w / (h * 0.06)));

  const left = w * numberZone;
  const right = w * (1 - numberZone);
  /* The mark gets nearly the whole board between the hems and the chequer.
   * Fitted, never cropped: a logo with a piece cut off it is worse than a
   * small logo. */
  const boxY = h * 0.07;
  const boxH = h * 0.79;
  if (opts.logo) {
    fit(ctx, opts.logo, left, boxY, right - left, boxH);
  } else {
    chequerDevice(ctx, left + (right - left) * 0.30, boxY, (right - left) * 0.40, boxH);
  }
}

/*
 * THE UPRIGHT SLEEVE, the banner wrapped round each leg.
 *
 * Painted the tall way: the canvas is narrow and tall and lands on the gate
 * the same way up. White vinyl, a chequer column down the outer edge so a
 * white wall still has a silhouette, and the mark turned on its side in the
 * middle, which is exactly what a printed sleeve does with a horizontal logo.
 *
 * THE FLIP DOES NOT FLIP THE MARK, and it used to. `flip` exists to put the
 * chequer column on the outside of the far leg, and mirroring the whole
 * design is how it does that; but a sponsor's mark reversed is the one thing
 * on a race course that must never happen, and on every gate the near leg
 * read forwards while the far one read backwards. So the mark is mirrored a
 * second time inside the flip, which leaves it the right way round while the
 * column stays where the flip put it. Same rule as the flag sails: mirror
 * the LAYOUT, never the ink.
 */
export function paintGateSleeve(ctx, w, h, opts = {}) {
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  /*
   * `flip` paints the whole design mirrored, for the far leg of a gate, so
   * the chequer column runs down the OUTSIDE on both sides. Done in the
   * paint rather than with a negative scale on the mesh, because a negative
   * scale inverts a mesh's winding and a single sided panel turned inside
   * out is a black slab or nothing at all, depending on which pass is
   * looking at it. Both have happened.
   */
  if (opts.flip) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }
  ctx.fillStyle = BANNER.vinyl;
  ctx.fillRect(0, 0, w, h);

  /* The chequer column, down one edge. Narrower than it was: the wall is
   * the white, and the chequer is the border that stops it vanishing. */
  const colW = w * 0.18;
  chequerColumn(ctx, 0, 0, colW, h, Math.round(h / (colW * 0.5)));

  ctx.save();
  /* Turned a quarter, reading up the banner. The quarter turn has put the
   * canvas's x along this frame's y, so undoing the flip for the ink alone
   * is a negative y here. */
  ctx.translate(colW + (w - colW) * 0.5, h * 0.48);
  ctx.rotate(-Math.PI / 2);
  if (opts.flip) {
    ctx.scale(1, -1);
  }
  if (opts.logo) {
    fit(ctx, opts.logo, -h * 0.34, -(w - colW) * 0.42, h * 0.68, (w - colW) * 0.84);
  } else {
    chequerDevice(ctx, -h * 0.16, -(w - colW) * 0.34, h * 0.32, (w - colW) * 0.68);
  }
  ctx.restore();
  ctx.restore();
}

function chequerColumn(ctx, x, y, w, h, cells) {
  const ch = h / Math.max(1, cells);
  const cw = w / 2;
  for (let j = 0; j < cells; j += 1) {
    for (let i = 0; i < 2; i += 1) {
      ctx.fillStyle = (i + j) % 2 === 0 ? BANNER.chequerDark : BANNER.chequerLight;
      ctx.fillRect(x + i * cw, y + j * ch, cw + 0.5, ch + 0.5);
    }
  }
}

/*
 * THE FEATHER SAIL'S PRINT.
 *
 * The canvas maps straight onto the sail's own parameters: u across, from the
 * seam on the mast at 0 to the free edge at 1, and v up the mast. So the
 * LEFT of this canvas is the leading edge, and the canvas's TOP is the head,
 * because a CanvasTexture flips v.
 *
 * WHAT THE SHAPE CHANGED. The panel this lands on is now a tall narrow
 * rectangle with its mast side corner swept away, about one across to three
 * and a half up where the teardrop was one to two and three quarters, so
 * every band here is re-proportioned rather than moved. Two things are new
 * and both are consequences of the outline rather than taste:
 *
 *   THE HEAD IS A SOLID BLOCK OF THE ACCENT. Above FLAG.bend the rows fan
 *   into the corner the mast's sweep cuts, so anything with structure in it,
 *   a chequer or a mark, would visibly bend there. One colour cannot. It is
 *   also what the flag reads as from further away than any print: a coloured
 *   head over a pale body.
 *
 *   THE LEADING BAND IS NARROWER, 0.26 of the width against 0.30 to 0.40.
 *   On a panel this narrow the old sweep left the mark a strip too thin to
 *   read at commit range, and the mark is what a sponsor bought.
 *
 * `accent` swaps the band and the head between navy and red so a run of
 * flags down a course alternates without needing two designs.
 *
 * `mirrorMark` flips the MARK inside its box and leaves the rest of the
 * design where it is. On its own that would be vandalism; it exists for the
 * reverse of the cloth, and paintFlagSailPair below is the only caller.
 */
/* Where the head block starts, in v. Below FLAG.bend's own share of the
 * panel, so the block covers the whole swept corner and a little of the
 * rectangle under it: a join exactly on the fold would show every facet. */
const SAIL_HEAD_V = 0.70;

export function paintFlagSail(ctx, w, h, opts = {}) {
  const accent = opts.accent === 'red' ? BANNER.red : BANNER.navy;
  const other = opts.accent === 'red' ? BANNER.navy : BANNER.red;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = BANNER.vinyl;
  ctx.fillRect(0, 0, w, h);

  /* v to canvas y. The head is at the top of the canvas and at v = 1. */
  const vy = (v) => h * (1 - v);

  /* The band down the leading edge, widening a little toward the head the
   * way a printed sleeve's does. */
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(w * 0.30, 0);
  ctx.quadraticCurveTo(w * 0.20, h * 0.55, w * 0.26, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();

  /* The head block, over the swept corner. */
  ctx.fillRect(0, 0, w, vy(SAIL_HEAD_V));

  /* A thin rule of the other colour along the band, and one under the head,
   * which is the seam a two piece printed flag actually carries. */
  ctx.strokeStyle = other;
  ctx.lineWidth = Math.max(2, w * 0.045);
  ctx.beginPath();
  ctx.moveTo(w * 0.30, vy(SAIL_HEAD_V));
  ctx.quadraticCurveTo(w * 0.20, h * 0.55, w * 0.26, h);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, vy(SAIL_HEAD_V));
  ctx.lineTo(w, vy(SAIL_HEAD_V));
  ctx.stroke();

  /*
   * Chequer across the free part, one band under the head and one above the
   * foot hem. THE CHECK COUNT IS DERIVED, not chosen: a band two checks deep
   * has square checks only when the count across is twice its width over its
   * height, and this canvas is narrower than the teardrop's was, so a count
   * that was square there is three to one here. A chequer whose checks are
   * not square is not a chequered flag, and the arithmetic is cheaper than
   * remembering to redo it the next time the panel changes shape.
   */
  const bandX = w * 0.28;
  const bandW = w * 0.72;
  const bandH = h * 0.06;
  const cells = Math.max(2, Math.round((2 * bandW) / bandH));
  chequer(ctx, bandX, vy(0.695), bandW, bandH, cells);
  chequer(ctx, bandX, vy(0.135), bandW, bandH, cells);

  /* The mark, turned a quarter so it reads up the flag, in the whole of the
   * panel the band and the two chequers leave: v 0.165 to 0.605, which
   * clears both bands rather than running under them. */
  const markW = h * 0.44;
  const markH = w * 0.60;
  ctx.save();
  ctx.translate(w * 0.63, vy(0.385));
  ctx.rotate(-Math.PI / 2);
  /* The quarter turn has already put the canvas's x along this frame's y, so
   * the flip that mirrors the mark ACROSS the flag is a negative y here. */
  if (opts.mirrorMark) {
    ctx.scale(1, -1);
  }
  if (opts.logo) {
    fit(ctx, opts.logo, -markW * 0.5, -markH * 0.5, markW, markH);
  } else {
    chequerDevice(ctx, -markW * 0.28, -markH * 0.5, markW * 0.56, markH);
  }
  ctx.restore();
}

/*
 * BOTH FACES OF ONE SAIL, SIDE BY SIDE ON ONE SHEET.
 *
 * WHAT WAS WRONG. A sail is one piece of cloth, so it was drawn as one sheet
 * of triangles with one set of texture coordinates, and the reverse faces
 * shared them. Every mark on every flag on the course therefore read in a
 * mirror from behind, which is the one thing a sponsor's mark must never do.
 * The gate boards never had this: they are two planes back to back, the
 * reverse turned a half turn about the upright, which is what a real printed
 * banner is and what makes it read the right way round from either side.
 *
 * WHY THE CLOTH CANNOT JUST DO THAT. A board's design is symmetric enough to
 * turn round: the mark sits in the middle and both ends are left clear. A
 * feather flag's is not. The accent band is on the LEADING edge, and the
 * leading edge is the mast, which is a physical object in the same place for
 * a viewer on either side. Turn the print round and the band ends up on the
 * free edge from behind, which no printed flag has ever looked like. What a
 * double sided flag actually carries is the same layout on both faces with
 * the ink reversed, so the band stays on the mast and the mark still reads.
 *
 * SO THE SHEET IS TWICE AS WIDE and holds the design twice: the front in the
 * left half, and in the right half the same design mirrored, with the mark
 * mirrored a second time so it comes back the right way round. The reverse
 * faces read the right half BACKWARDS, u running from 1 at the mast to 0.5
 * at the free edge, which is what puts the band back on the mast.
 *
 * ONE MATERIAL, ONE DRAW CALL, and that is why it is one sheet rather than
 * two textures. The world bakes seventy two flags into merged meshes keyed
 * by material, and a mesh with two materials cannot be merged that way at
 * all. The seam is at the FREE edge of both halves, so the two sides of it
 * carry near enough the same texels and no mip level can show a join.
 */
export function paintFlagSailPair(ctx, w, h, opts = {}) {
  const half = w / 2;
  paintFlagSail(ctx, half, h, opts);
  ctx.save();
  ctx.translate(w, 0);
  ctx.scale(-1, 1);
  paintFlagSail(ctx, half, h, { ...opts, mirrorMark: true });
  ctx.restore();
}

/*
 * A MARK PAINTED ON THE GRASS.
 *
 * Athletics grounds, football pitches and race circuits all carry sponsors'
 * marks painted straight onto the turf, and that is what this is: the mark
 * fitted inside the footprint its author drew on the field, at an opacity
 * that lets the mower's stripes show faintly through it. Fully opaque it
 * reads as a sticker laid on the grass; at 0.93 it reads as paint, which is
 * a smaller difference on a still frame than it is at 80 km/h.
 *
 * FITTED, NEVER CROPPED, like every other surface here, so the footprint is
 * the space the mark is given and not a window cut into it. A mark whose
 * proportions do not match the footprint paints smaller with clear turf
 * either side, which is the author's cue to resize the footprint.
 *
 * `stripePx` paints a mown backdrop first and exists for the builder's
 * preview, which has no pitch under it. The world's pitch already has its
 * stripes, so it leaves this out and paints straight onto them.
 */
export const GROUND_INK = 0.93;
export const GROUND_TURF = { light: '#63a949', dark: '#4c8b38' };

export function paintGroundLogo(ctx, w, h, opts = {}) {
  if (opts.stripePx > 0) {
    ctx.fillStyle = GROUND_TURF.dark;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = GROUND_TURF.light;
    for (let i = 0; i * opts.stripePx < h; i += 2) {
      ctx.fillRect(0, i * opts.stripePx, w, opts.stripePx);
    }
  }
  if (!opts.logo) {
    return;
  }
  ctx.save();
  ctx.globalAlpha = opts.ink ?? GROUND_INK;
  fit(ctx, opts.logo, 0, 0, w, h);
  ctx.restore();
}

/*
 * THE FLAG ITSELF: a feather flag, not a teardrop.
 *
 * WHAT CHANGED AND WHY. What stood on the course was a teardrop: narrow at
 * the foot, widest through the middle, drawn to a point at the head, on a
 * straight mast. That is a real product and it is not the one a race course
 * is lined with. The reference the owner supplied is a FEATHER flag, and the
 * difference is structural rather than decorative:
 *
 *   THE MAST BENDS. The bottom four fifths is a straight pole and the top
 *   fifth is a fibreglass whip that sweeps forward through about a hundred
 *   degrees. That sweep is the whole silhouette. A straight mast cannot make
 *   this shape whatever outline you cut the cloth to.
 *
 *   THE SAIL IS A TALL NARROW PANEL, not a leaf. Its trailing edge is a
 *   straight vertical line hanging from the mast's TIP, its foot is a
 *   horizontal hem, and its leading edge is the mast, so the top corner on
 *   the mast side is swept away by the bend. Width is about 0.23 of the
 *   flag's height where the teardrop's widest point was 0.30, and it is that
 *   width for four fifths of its length instead of at one station.
 *
 *   THE MAST'S TIP IS NOT ITS HIGHEST POINT. The arc turns past horizontal,
 *   so it apexes and comes back down a little. The apex is what a pilot's
 *   eye and the collider both have to treat as the top, which is why the
 *   numbers below put the APEX at exactly the flag's stated height.
 *
 * WHY IT LIVES HERE. Four consumers have to agree about this shape: the
 * world's mast mesh, the world's sail mesh, the builder preview's two, and
 * the print, whose canvas has to be the panel's own aspect or a chequer
 * comes out of square. This module is already the one both renderers draw
 * from, and this is geometry rather than artwork only in the sense that the
 * outline and the print are the same decision. It is plain numbers: no
 * Three.js, no canvas.
 */
export const FLAG = {
  /* Where the straight mast ends, as a fraction of the flag's height. */
  bend: 0.80,
  /* How far the whip turns from vertical. A hundred degrees, so it passes
   * the apex and the tip hangs a little below it, which is what the
   * reference shows and what puts the trailing edge under the highest
   * point rather than beyond it. */
  sweep: (100 * Math.PI) / 180,
  /* Where the sail's foot hem sits, as a fraction of the height. The mast
   * below that is bare, which is what holds the cloth clear of the grass. */
  foot: 0.16,
  /* Mast radius at the bend and at the tip, as fractions of the butt's. A
   * feather flag's whip is visibly thinner than its pole. */
  bendRadius: 0.80,
  tipRadius: 0.52,
};

/*
 * The mast's centreline, from the butt at (0, 0) to the tip, in the sail's
 * own plane: x forward, y up. `r` on each point is the mast's radius there
 * as a fraction of the butt's, so one polyline describes the taper too.
 *
 * The arc's radius is chosen so the APEX lands at exactly `h`. Everything
 * that asks how tall a flag is, the collider, the attract camera's clearance
 * and the builder's elementHeight, keeps the answer it had.
 */
export function flagMast(h, steps = 10) {
  const bendY = h * FLAG.bend;
  /* Apex at h: the arc rises by R before its tangent turns horizontal. */
  const R = h * (1 - FLAG.bend);
  const arcAt = (a) => {
    const phi = a * FLAG.sweep;
    return { x: R * (1 - Math.cos(phi)), y: bendY + R * Math.sin(phi) };
  };
  const tip = arcAt(1);
  const points = [
    { x: 0, y: 0, r: 1 },
    { x: 0, y: bendY, r: FLAG.bendRadius },
  ];
  for (let i = 1; i <= steps; i += 1) {
    const a = i / steps;
    const p = arcAt(a);
    points.push({ x: p.x, y: p.y, r: FLAG.bendRadius + (FLAG.tipRadius - FLAG.bendRadius) * a });
  }
  const foot = h * FLAG.foot;
  return {
    points,
    arcAt,
    bendY,
    tip,
    /* The sail's width is the mast's forward reach: the trailing edge hangs
     * from the tip, so the two are the same number by construction. */
    width: tip.x,
    foot,
    sailH: tip.y - foot,
  };
}

/*
 * The sail's outline, as one leading point and one trailing point per row,
 * in the same plane and measured from the mast's CENTRELINE. A renderer adds
 * the mast's radius to both and lofts columns between them.
 *
 * TWO BANDS, and the split is what keeps the print square. Below the bend
 * the rows are horizontal and the panel is a rectangle. Above it the rows
 * fan from the last horizontal row up to the tip, filling the corner the
 * mast's sweep cuts out of it. `t` runs 0 to 1 with the SAME metres per
 * step in both bands, so the artwork is not stretched at the join.
 */
export function flagSailProfile(h, bodyRows = 8, headRows = 6) {
  const m = flagMast(h);
  const tBend = m.sailH > 1e-6 ? (m.bendY - m.foot) / m.sailH : 1;
  const rows = [];
  for (let i = 0; i <= bodyRows; i += 1) {
    const t = tBend * (i / bodyRows);
    const y = m.foot + (m.bendY - m.foot) * (i / bodyRows);
    rows.push({ t, lx: 0, ly: y, tx: m.width, ty: y });
  }
  for (let j = 1; j <= headRows; j += 1) {
    const a = j / headRows;
    const p = m.arcAt(a);
    rows.push({
      t: tBend + (1 - tBend) * a,
      lx: p.x,
      ly: p.y,
      tx: m.width,
      ty: m.bendY + (m.tip.y - m.bendY) * a,
    });
  }
  return { rows, tBend, mast: m };
}

/*
 * A canvas, made the same way by both consumers. Kept here so the two cannot
 * disagree about the size of anything.
 */
export function bannerCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/*
 * The sizes. Chosen from how much of the screen each surface ever fills: a
 * gate header is 2.74 m of vinyl a pilot passes within a metre of, and a
 * sleeve and a sail are read from further out and mostly in silhouette.
 */
/*
 * The printed header board's height in METRES. The canvas aspects below are
 * derived from it, and so are the mesh in render/scene.js and the preview in
 * trackbuilder/view3d.js, which each held their own 0.58.
 */
export const GATE_BANNER_H = 0.58;

export const BANNER_SIZE = {
  /*
   * Each one's ASPECT is the aspect of the surface it lands on, because a
   * chequer whose checks are not square is not a chequered flag. The header
   * is 2.74 by 0.58 m of banner, a sleeve is 0.42 by 1.83, and a sail is
   * 0.68 across by 2.43 up.
   *
   * The sail was 192 by 512 when it was a teardrop 0.87 m across. The
   * feather panel is narrower and taller, and `flagMast` is where those two
   * numbers come from: 512 times width over sailH is 144, so a check on the
   * cloth is still square. Change FLAG above and this has to follow.
   */
  header: [512, 112],
  sleeve: [112, 512],
  sail: [144, 512],
  /*
   * The sail's SHEET, which is the panel twice over: front in the left half,
   * reverse in the right. See paintFlagSailPair. Derived rather than typed,
   * so the panel above stays the one place the sail's aspect is decided and
   * a change to it cannot leave this behind at the old width.
   */
  sailSheet: [144 * 2, 512],
};
