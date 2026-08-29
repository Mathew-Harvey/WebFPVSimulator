/*
 * clubhouse.js: the club's pavilion, and the ground it stands on.
 *
 * WHAT THIS IS. A country sports pavilion of the kind every flying club in
 * Australia meets at: one long low building on a levelled terrace beside the
 * oval, a folded pale roof over it, a solar array on the sunny plane, and a
 * verandah running the whole field side. The verandah is the point. That is
 * where the pit tables go and where the pilots stand, so it is modelled OPEN,
 * on posts, with the tables on it, rather than as the closed box that
 * photogrammetry makes of a roof with people under it.
 *
 * WHY IT LIVES HERE. src/render/scene.js dresses BOTH race maps, the built in
 * circuit and a course somebody drew, and both get the clubhouse: a race field
 * is a club's field. Putting the mesh in src/art keeps it beside the start
 * blocks and the printed banners, which is the other art the world and the
 * track builder both draw from, and it keeps a 600 line building out of a
 * file that is already the world.
 *
 * LOCAL FRAME, Y up, matching Three.js. +X runs along the building, +Z points
 * AT THE FIELD, and the origin is the middle of the front wall at the level of
 * the mown ground. So the building is at negative Z, the verandah, the steps
 * and the apron are at positive Z, and a caller places the whole complex by
 * putting the origin on the field's edge and yawing it to face in.
 *
 * ONE MESH, ONE MATERIAL, VERTEX COLOURS. Not one material per surface. The
 * scenery merger in scene.js buckets by material, so a building with a roof
 * material, a wall material, a brick material and a glass material is four
 * more merged meshes and eight more draw calls, because each bucket is
 * submitted again in the outline prepass. Every colour here is a vertex
 * colour on a single cel material instead, so the whole pavilion, its
 * terrace, its car park and its pit tables cost ONE bucket. The palette is
 * still authored per surface; it just travels in the geometry.
 *
 * FLAT SHADED ON PURPOSE. Every face carries its own normal, so each roof
 * plane, each wall and each fascia reads as one flat band under the cel ramp.
 * That is what the style wants from a building: a drawn shape with a crisp
 * edge, not a softly rounded mass.
 *
 * THREE.JS IS PASSED IN, the same rule startblock.js follows, so this file
 * has no imports at all and the track builder could draw the same pavilion
 * without pulling the simulator in behind it.
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
 * THE PALETTE, SOLVED AGAINST MEASURED VALUES RATHER THAN PICKED.
 *
 * The world's value structure, which scene.js states at the top: the sky is
 * the brightest thing, the ground a clear step below it, objects a step below
 * that. Sampled off a capture of this map at 1600 by 900, the anchors are
 *
 *   sky                       0.525
 *   mountain ring ladder      0.250, 0.310, 0.370, 0.430
 *   lit meadow                0.094
 *
 * The first palette authored the roof at 0xcfc9b8, on the reasoning that a
 * real Colorbond roof is nearly white and that authoring white here would
 * make the pavilion the brightest thing in the frame. That reasoning was
 * wrong and the capture said so: the roof rendered at 0.266, which is the
 * nearest mountain ring's 0.263 to within a thousandth. A building forty
 * metres away was the same value as a range at five hundred and sixty, so
 * aerial perspective ran backwards across it and the pavilion read as one
 * dark mass welded to the horizon.
 *
 * The reason the caution was wrong is also measured. A band 3 (sunlit)
 * surface renders at about 0.45 of its authored linear luminance once the
 * ramp, the light colour and the tone map have had it, so pure white comes
 * out near 0.48 and lands UNDER the sky rather than over it. There was never
 * a white roof to be afraid of.
 *
 * So the roof is authored bright, to sit above every ring in the ladder and
 * below the sky, which is exactly the slot a white roof belongs in. The
 * verandah roof and its fascia stay near black: they are the darkest things
 * on the building and they are what carries its silhouette, and the
 * reference's own strongest feature is that dark band under a pale roof.
 *
 * The verandah's INSIDE is a separate problem with a separate answer. The sun
 * here sits at 30 degrees and the verandah is 4.55 m deep, so the wall behind
 * it is in cast shadow at every hour this world has: traced, a ray over the
 * fascia reaches the wall 0.52 m BELOW the deck. Nothing about the geometry
 * changes that and nothing should, because that is what a verandah is. What
 * can change is the albedo, so the soffit is a pale painted lining rather
 * than the dark of the sheeting above it, which is both what these buildings
 * really are and the only lever that lifts a shadowed recess off the floor.
 */
export const CLUB = {
  roof: 0xf8f4e7,
  roofTrim: 0xdbd4c2,
  verRoof: 0x3d434c,
  verFascia: 0x2b3037,
  /* Verandah ceilings are painted pale for the same reason this one is: to
   * bounce what light gets under there back onto the wall. */
  verSoffit: 0xc3bcab,
  wall: 0xded3b8,
  wallShade: 0xc6bb9f,
  brick: 0xa35736,
  brickDark: 0x82442a,
  concrete: 0xc4c0b2,
  concreteDark: 0xaba79b,
  glass: 0x53718a,
  frame: 0x9aa0a6,
  steel: 0x4e545c,
  solar: 0x1f2c44,
  solarFrame: 0x878d95,
  bitumen: 0x4a4b4e,
  line: 0xdcded5,
  /* The same timber as a start block, because it is the same trestle. */
  timber: 0xb08958,
  trestle: 0x6d737a,
  caseBlack: 0x2c3138,
  door: 0x7b5636,
  sign: 0x1d3a5c,
  signMark: 0xd7a441,
  /* The plaque cast surround. Dark bronze, so the plate reads as the thing
   * that is polished and the frame as the thing that is not. */
  plaqueFrame: 0x5d4f2a,
};

/*
 * THE BUILDING, AT ONE FIXED REAL SIZE, and that is a decision rather than an
 * oversight.
 *
 * The obvious alternative is to scale the pavilion to whatever field an
 * author drew, so a 20 m practice square gets a 20 m clubhouse. That is the
 * same error this project already shipped once and had to measure its way out
 * of: a gate built at 2.3 times regulation made a 250 mm quad read as a toy,
 * because every judgement about how big the world is gets anchored to the
 * objects in it. A clubhouse is 44 m long. Standing it beside a small field
 * makes the field look small, which is what a small field IS.
 *
 * All heights are above the levelled ground the complex stands on, which is
 * the same datum as the mown field, so the terrace top at 0.45 m is genuinely
 * a step and a half up out of the grass.
 */
const D = {
  /* Plan, along X. Three masses, each a different depth, which is what makes
   * the back wall step the way the reference's does. */
  westX0: -22.0,
  westX1: -6.0,
  westBack: -11.2,
  midX0: -6.0,
  midX1: 5.0,
  midSplit: -0.25,
  midBack: -9.6,
  eastX0: 5.0,
  eastX1: 22.0,
  eastBack: -8.0,

  /* Roof. The west mass and the east wing run their ridges ALONG the building
   * and the two in the middle run theirs ACROSS it, which is the whole of why
   * the roofline folds: seen from the field, the middle pair present two
   * gable ends side by side and the eaves either side of them zigzag. */
  /*
   * The eaves step DOWN from west to east and every plane is between 25 and
   * 28 degrees except the two cross gables, which are steeper at 36 because
   * that is what makes the fold read as a fold from the air rather than as a
   * kink. Ridge heights are not free numbers: each one is its eave plus its
   * run times the tangent of the pitch, so a change to a depth here has to be
   * carried into its ridge or the roof stops being a roof.
   */
  westEave: 4.25,
  westRidge: 7.15,
  westRidgeZ: -5.60,
  westHipX: -19.0,
  midEave: 4.10,
  midRidge: 6.20,
  eastEave: 3.90,
  eastRidge: 6.00,
  eastRidgeZ: -4.00,
  overhang: 0.45,
  barge: 0.35,
  /* Roof thickness, which is what the soffit is offset by. A roof plane on a
   * FrontSide material is INVISIBLE FROM UNDERNEATH, so a roof drawn as bare
   * planes is a hole you can see the sky through from the verandah. Every
   * plane here gets an underside. */
  soffit: 0.2,

  /*
   * Verandah. It wraps THREE sides, which is what the owner described and
   * what the reference shows returning around the west end: a skillion off
   * the front wall plus one off each end wall, hipped at the two corners,
   * everything falling outward so it sheds water. On posts at 3.5 m centres.
   *
   * verHigh sits clear below the LOWEST main eave, 3.90 at the east wing, so
   * the verandah tucks under the building rather than poking through its
   * roof. That is the constraint on this number, not taste.
   */
  /* How far the ROOF reaches past the wall face, the same on all three sides
   * so the two hipped corners are true hips. The deck stops short of it, at
   * terraceZ1, and the roof oversails it, which is what a verandah does. */
  verOut: 4.55,
  verX0: -26.55,
  verX1: 26.55,
  verHigh: 3.60,
  verLow: 3.15,
  postR: 0.055,
  postStep: 3.5,
  postInset: 0.45,

  /* The ground the whole thing stands on. */
  terraceZ0: -12.4,
  /* The deck's outer edge, and therefore how deep the verandah you can stand
   * on is: 4.2 m, which holds a 0.75 m trestle and a pilot behind it. */
  terraceZ1: 4.2,
  terraceTop: 0.45,
  apronZ1: 10.6,
  apronX0: -28.5,
  apronX1: 28.5,
  apronTop: 0.12,
  /* How far down the slabs skirt. Nothing under here is ever seen; the skirt
   * exists so that a terrace standing on ground the height field has levelled
   * to a tolerance still has no daylight under its edge. */
  skirt: 1.4,
};

/* The levelled rectangle the complex needs under it, in the local frame. */
export const CLUBHOUSE_PAD = {
  /* The pavilion, its terrace and its apron, and nothing else. It used to
   * reach out to a car park that lived in this frame; the car park is the
   * ground's now, with its own levelled patch, so this stops 2 m past the
   * apron on both sides. */
  x0: -D.verX1 - 4.0,
  x1: D.apronX1 + 2.5,
  z0: D.terraceZ0 - 1.6,
  z1: D.apronZ1 + 2.4,
};

/*
 * How high the pavilion stands, for the title camera's clearance sum. The
 * ridge, not a bounding box, for the same reason the obstacles report their
 * own top: a box would include the apron and the car park and report the
 * centre of a 70 m rectangle as the thing to fly over.
 */
export const CLUBHOUSE_TOP = D.westRidge;

/*
 * THE PLAQUE.
 *
 * WHY IT IS BIG. A real memorial plaque is about 0.4 m across, and at 0.4 m
 * this one would be unreadable at any distance a quad can safely hold: a
 * 0.4 m board seen from 3 m subtends about 7.6 degrees, which is 100 px in a
 * 1600 px frame at this camera's field of view, and six lines of text do not
 * survive 100 px. So it is an honour board rather than a plaque, 2.3 m
 * across, which clubs do hang and which a pilot can read from 10 m without
 * having to park a prop against the wall.
 *
 * WHERE IT IS. On the front wall, under the verandah, which is where a club
 * hangs one and where the owner's pilots stand. It is on the east wing
 * because that is the only stretch of a 44 m glazed frontage with a clear
 * panel wide enough, and the openings either side of it were moved 0.4 m
 * apart to make sure of it.
 *
 * SILL AT 0.95 m ABOVE THE DECK, so the board runs from 0.95 to 2.10 m: the
 * height a person reads at, clear of the brick base course below it and of
 * the verandah beam above.
 */
export const PLAQUE = {
  cx: 12.36,
  w: 2.30,
  h: 1.15,
  /* Above the terrace, not above the datum: the deck is what you stand on. */
  sill: 0.95,
  frame: 0.055,
  /* How far the surround stands off the wall. The plate sits just proud of
   * it, which is what gives the board an edge to catch light on. */
  z: 0.07,
};

/*
 * The canvas the plate is painted on. 2:1, matching the board, at about
 * 445 pixels per metre, which leaves the quote crisp when a quad is close
 * enough to hover and read.
 */
export const PLAQUE_PX = { w: 1024, h: 512 };

/* What it says. Line broken here rather than wrapped at paint time, because
 * where a three line quote breaks is a typographic decision and not an
 * arithmetic one. */
const PLAQUE_QUOTE = [
  'ANY SUFFICIENTLY ADVANCED',
  'TECHNOLOGY IS INDISTINGUISHABLE',
  'FROM MAGIC',
];
const PLAQUE_BY = 'ARTHUR C. CLARKE';
const PLAQUE_SUB = "CLARKE'S THIRD LAW";
const PLAQUE_FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/*
 * Paint the plate. Takes a 2D context rather than making its own canvas, so
 * this file still touches no DOM and the caller owns the texture it is about
 * to build out of it.
 *
 * Engraved, not printed: every line is drawn twice, once in a highlight a
 * couple of pixels below and once in the dark on top, which is what reads as
 * a cut letter rather than a sticker. That trick is doing real work here,
 * because the plate is a flat quad with no geometry to catch light.
 */
export function paintPlaque(ctx, w, h) {
  const brass = ctx.createLinearGradient(0, 0, 0, h);
  brass.addColorStop(0, '#e2c169');
  brass.addColorStop(0.45, '#d3ac4c');
  brass.addColorStop(1, '#bd9339');
  ctx.fillStyle = brass;
  ctx.fillRect(0, 0, w, h);

  /* A brushed grain, so a 2.3 m plate is not one flat colour when a pilot is
   * a metre off it. */
  ctx.globalAlpha = 0.06;
  ctx.strokeStyle = '#6d5417';
  ctx.lineWidth = 1;
  for (let x = 0; x < w; x += 3) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, h);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  /* Bevel: light down the top and left, dark down the bottom and right. */
  const m = Math.round(w * 0.022);
  ctx.strokeStyle = '#f4e3a8';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(m, h - m);
  ctx.lineTo(m, m);
  ctx.lineTo(w - m, m);
  ctx.stroke();
  ctx.strokeStyle = '#8a6a1c';
  ctx.beginPath();
  ctx.moveTo(w - m, m);
  ctx.lineTo(w - m, h - m);
  ctx.lineTo(m, h - m);
  ctx.stroke();

  /* Four fixings, because a board this size is bolted and the bolts are what
   * say so. */
  const fix = [
    [m * 2, m * 2], [w - m * 2, m * 2],
    [m * 2, h - m * 2], [w - m * 2, h - m * 2],
  ];
  for (const [sx, sy] of fix) {
    ctx.fillStyle = '#9a7822';
    ctx.beginPath();
    ctx.arc(sx, sy, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e6d08a';
    ctx.beginPath();
    ctx.arc(sx - 1.5, sy - 1.5, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const inner = w - m * 4;

  /*
   * ONE TYPE SIZE FOR ALL THREE QUOTE LINES, chosen from the LONGEST of them
   * so the block is a block. Sizing each line to its own width would set the
   * short last line in giant type, which is a ransom note.
   */
  let px = Math.round(h * 0.125);
  ctx.font = '700 ' + px + 'px ' + PLAQUE_FONT;
  let widest = 0;
  for (const line of PLAQUE_QUOTE) {
    widest = Math.max(widest, ctx.measureText(line).width);
  }
  if (widest > inner) {
    px = Math.floor(px * (inner / widest));
  }

  const engrave = (text, cy, size, weight, track) => {
    ctx.font = weight + ' ' + size + 'px ' + PLAQUE_FONT;
    /* Letter spacing by inserting a HAIR SPACE, not a word space. A word
     * space between every letter is about four times too much and turns a
     * caption into a scatter of characters. Canvas2D has no letterSpacing
     * in every engine this has to run in, so it is done in the string. */
    const spaced = track ? text.split('').join(' ') : text;
    ctx.fillStyle = 'rgba(255, 238, 186, 0.55)';
    ctx.fillText(spaced, w / 2, cy + 2);
    ctx.fillStyle = '#38301a';
    ctx.fillText(spaced, w / 2, cy);
  };

  const lead = Math.round(px * 1.34);
  const top = Math.round(h * 0.265);
  PLAQUE_QUOTE.forEach((line, i) => {
    engrave(line, top + i * lead, px, 700, false);
  });

  /* The rule, and then who said it. */
  const ruleY = top + 2 * lead + Math.round(px * 0.92);
  ctx.strokeStyle = '#8a6a1c';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(w * 0.30, ruleY);
  ctx.lineTo(w * 0.70, ruleY);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255, 238, 186, 0.5)';
  ctx.beginPath();
  ctx.moveTo(w * 0.30, ruleY + 2);
  ctx.lineTo(w * 0.70, ruleY + 2);
  ctx.stroke();

  engrave(PLAQUE_BY, ruleY + Math.round(px * 0.90), Math.round(px * 0.84), 600, false);
  engrave(PLAQUE_SUB, ruleY + Math.round(px * 1.74), Math.round(px * 0.58), 500, true);
}

/*
 * The plate: one quad, carrying the only uv attribute in this building.
 *
 * A SEPARATE MESH, NOT PART OF THE SOUP, and that is forced rather than
 * chosen. The rest of the pavilion is one geometry in vertex colours with no
 * uv at all, and a textured material needs uv; merging the two would mean
 * giving five and a half thousand vertices a uv they never sample.
 */
export function plaqueMesh(THREE, mat) {
  const x0 = PLAQUE.cx - PLAQUE.w * 0.5;
  const x1 = PLAQUE.cx + PLAQUE.w * 0.5;
  const y0 = D.terraceTop + PLAQUE.sill;
  const y1 = y0 + PLAQUE.h;
  /* Just proud of its own surround, so the frame reads as a frame. */
  const z = PLAQUE.z + 0.004;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    x0, y0, z, x1, y0, z, x1, y1, z,
    x0, y0, z, x1, y1, z, x0, y1, z,
  ]), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([
    0, 0, 1, 0, 0, 1, 0, 0, 1,
    0, 0, 1, 0, 0, 1, 0, 0, 1,
  ]), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([
    0, 0, 1, 0, 1, 1,
    0, 0, 1, 1, 0, 1,
  ]), 2));
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = false;
  /*
   * AND IT DOES NOT RECEIVE SHADOW, which is the one deliberate lie in this
   * building and the whole reason the plaque is readable.
   *
   * Traced: the sun sits at 30 degrees and the verandah is 4.55 m deep, so a
   * ray over the fascia reaches this wall 0.52 m BELOW the deck. The wall
   * behind the plate measures 0.034 luminance in shadow against 0.287 out of
   * it, a factor of eight, and a plate at 0.483 albedo lands at 0.026 there.
   * That is not a readable plaque, it is a dark rectangle. Its own diffuse
   * term is already the sunlit band, the face points at +Z and the sun is at
   * +X +Z, so dropping the shadow map on this one quad lights it exactly as
   * the geometry already says it should be lit and nothing else changes. It
   * reads as polished brass catching the light on a shaded wall, which is
   * what brass on a shaded wall does.
   */
  mesh.receiveShadow = false;
  return mesh;
}

/*
 * Colour cache. new THREE.Color(hex) is a colour space conversion, and this
 * file asks for one about two thousand times; the palette has twenty entries.
 */
function makePalette(THREE) {
  const cache = new Map();
  return (hex) => {
    let c = cache.get(hex);
    if (!c) {
      c = new THREE.Color(hex);
      cache.set(hex, c);
    }
    return c;
  };
}

/*
 * The soup: positions, normals and colours in three flat arrays, and every
 * primitive in the building written into them directly.
 *
 * Non indexed, because the scenery merger de-indexes everything it is handed
 * anyway, and flat shaded, because a shared vertex between two roof planes
 * would average their normals and put a soft gradient down the ridge of a tin
 * roof.
 *
 * EVERY FACE STATES THE DIRECTION IT SHOULD FACE and the winding is corrected
 * to match. Authoring a few hundred faces by hand and getting all of their
 * vertex orders right is not a thing worth being brave about: one backwards
 * quad on a FrontSide material is a hole in the building, and it would be a
 * hole nobody notices until a quad flies past that face.
 */
const UP = [0, 1, 0];
const DOWN = [0, -1, 0];

function makeSoup(THREE) {
  const colorOf = makePalette(THREE);
  const pos = [];
  const nrm = [];
  const col = [];

  function vertex(p, n, c) {
    pos.push(p[0], p[1], p[2]);
    nrm.push(n[0], n[1], n[2]);
    col.push(c.r, c.g, c.b);
  }

  /* One triangle, wound so its normal lies on the same side as `want`. */
  function tri(a, b, c, hex, want) {
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-12) {
      /* Degenerate. Dropping it is right: it draws nothing, and a zero normal
       * is a NaN waiting to happen in the lighting. */
      return;
    }
    nx /= len;
    ny /= len;
    nz /= len;
    let p1 = b;
    let p2 = c;
    if (want && nx * want[0] + ny * want[1] + nz * want[2] < 0) {
      nx = -nx;
      ny = -ny;
      nz = -nz;
      p1 = c;
      p2 = b;
    }
    const cc = colorOf(hex);
    const n = [nx, ny, nz];
    vertex(a, n, cc);
    vertex(p1, n, cc);
    vertex(p2, n, cc);
  }

  /* One planar quad, given in order around its edge. */
  function quad(a, b, c, d, hex, want) {
    tri(a, b, c, hex, want);
    tri(a, c, d, hex, want);
  }

  /* An axis aligned box, given as two opposite corners. */
  function box(x0, y0, z0, x1, y1, z1, hex) {
    const ax = Math.min(x0, x1);
    const bx = Math.max(x0, x1);
    const ay = Math.min(y0, y1);
    const by = Math.max(y0, y1);
    const az = Math.min(z0, z1);
    const bz = Math.max(z0, z1);
    quad([bx, ay, bz], [bx, ay, az], [bx, by, az], [bx, by, bz], hex, [1, 0, 0]);
    quad([ax, ay, az], [ax, ay, bz], [ax, by, bz], [ax, by, az], hex, [-1, 0, 0]);
    quad([ax, by, bz], [bx, by, bz], [bx, by, az], [ax, by, az], hex, [0, 1, 0]);
    quad([ax, ay, az], [bx, ay, az], [bx, ay, bz], [ax, ay, bz], hex, [0, -1, 0]);
    quad([ax, ay, bz], [bx, ay, bz], [bx, by, bz], [ax, by, bz], hex, [0, 0, 1]);
    quad([bx, ay, az], [ax, ay, az], [ax, by, az], [bx, by, az], hex, [0, 0, -1]);
  }

  /*
   * One sloping roof plane whose eave and ridge lines both run along X: the
   * plane spans x0 to x1 and falls from (zA, yA) to (zB, yB). Always faces
   * upward, because a roof does.
   */
  function slopeX(x0, x1, zA, yA, zB, yB, hex, want) {
    quad([x1, yA, zA], [x0, yA, zA], [x0, yB, zB], [x1, yB, zB], hex, want || UP);
  }

  /* The same, for a plane whose lines run along Z: it spans z0 to z1 and
   * falls from (xA, yA) to (xB, yB). */
  function slopeZ(z0, z1, xA, yA, xB, yB, hex, want) {
    quad([xA, yA, z1], [xA, yA, z0], [xB, yB, z0], [xB, yB, z1], hex, want || UP);
  }

  /* A horizontal rectangle, used for the eave soffits: the flat underside a
   * roof overhang shows when a pilot flies past it below the gutter line. */
  function flat(x0, z0, x1, z1, y, hex, want) {
    quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], hex, want || UP);
  }

  /* A thin board hanging off an edge, used for the fascias and barge boards
   * that give every roof edge a real thickness instead of a paper cut. */
  function edgeBoard(ax, ay, az, bx, by, bz, drop, hex, want) {
    quad(
      [ax, ay, az], [bx, by, bz], [bx, by - drop, bz], [ax, ay - drop, az],
      hex, want,
    );
  }

  function build() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nrm), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
    return geo;
  }

  return {
    tri, quad, box, slopeX, slopeZ, flat, edgeBoard, build,
    triangles: () => pos.length / 9,
  };
}

/*
 * The whole complex, as one mesh plus the lists a world needs to make it
 * real: what is solid, what can be landed on, and how high it stands.
 *
 *   mat   the cel material the mesh wears. Vertex colours are switched on by
 *         the caller, because the caller owns the material and therefore owns
 *         the merger's bucket key.
 *
 * Returns
 *   mesh        one THREE.Mesh, ready to be baked
 *   colliders   local frame solids, either { kind, box } or { kind, post }
 *   decks       local frame landable rectangles, { x0, x1, z0, z1, top }
 *   top         the ridge height
 *   triangles   what it cost, so a caller can report it
 */
export function assembleClubhouse(THREE, mat, plaqueMat) {
  const S = makeSoup(THREE);

  groundworks(S);
  masses(S);
  roof(S);
  verandah(S);
  openings(S);
  pits(S);

  const mesh = new THREE.Mesh(S.build(), mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const colliders = clubhouseSolids();
  const decking = decks();
  /*
   * How much clear air a pilot standing on the verandah has over their head,
   * MEASURED off the two lists the world is about to consume rather than
   * restated from the dimension table: the underside of the roof a craft
   * would actually hit, less the top of the deck it would actually stand on.
   * Restating it would make the reference agree with the numbers instead of
   * with the building, which is the whole failure mode check 15 exists for.
   */
  const roofSolid = colliders.find((c) => c.tag === 'verandahRoof');
  const terrace = decking.find((d) => d.tag === 'terrace');

  return {
    mesh,
    /* The engraved plate, on its own because it is the one textured surface
     * on the building and the one that must not take the verandah's shadow.
     * The caller adds it to the scene rather than baking it: the merger sets
     * receiveShadow on every bucket it flushes, which is exactly what this
     * mesh needs not to have. */
    plaque: plaqueMesh(THREE, plaqueMat),
    colliders,
    decks: decking,
    top: CLUBHOUSE_TOP,
    verandahClear: roofSolid.box[1] - terrace.top,
    triangles: S.triangles(),
  };
}

/* ------------------------------------------------------------------ *
 * The terrace, the apron, the steps and the car park.
 *
 * Three levels, each a step down toward the field: the verandah terrace at
 * 0.45, the concrete apron at 0.12 and the mown ground at 0. The reference
 * holds those levels with terracotta brick and so does this, because a brick
 * retaining edge seen end on is the one detail that says the ground here was
 * cut and filled by somebody rather than being flat by accident.
 * ------------------------------------------------------------------ */
function groundworks(S) {
  /* Terrace slab. One box, with the building standing on it: the part of the
   * deck under the walls is never seen and is cheaper than a cut out. */
  S.box(D.verX0, -D.skirt, D.terraceZ0, D.verX1, D.terraceTop, D.terraceZ1, CLUB.concrete);
  /* Its retained face, brick, on the three sides anybody walks past. */
  S.box(D.verX0 - 0.12, -0.35, D.terraceZ1, D.verX1 + 0.12, D.terraceTop, D.terraceZ1 + 0.12, CLUB.brick);
  S.box(D.verX0 - 0.12, -0.35, D.terraceZ0, D.verX0, D.terraceTop, D.terraceZ1 + 0.12, CLUB.brick);
  S.box(D.verX1, -0.35, D.terraceZ0, D.verX1 + 0.12, D.terraceTop, D.terraceZ1 + 0.12, CLUB.brick);

  /* Apron. The hardstand the pilots walk out onto, and where a club puts its
   * trestle overflow on a race day. */
  S.box(D.apronX0, -D.skirt, D.terraceZ1, D.apronX1, D.apronTop, D.apronZ1, CLUB.concrete);
  /* Kerb along the field edge and returns at both ends, brick again. */
  S.box(D.apronX0, -0.3, D.apronZ1 - 0.26, D.apronX1, D.apronTop + 0.16, D.apronZ1, CLUB.brick);
  S.box(D.apronX0, -0.3, D.terraceZ1, D.apronX0 + 0.26, D.apronTop + 0.16, D.apronZ1, CLUB.brick);
  S.box(D.apronX1 - 0.26, -0.3, D.terraceZ1, D.apronX1, D.apronTop + 0.16, D.apronZ1, CLUB.brick);

  /* Three flights down off the terrace, where a real pavilion puts them: at
   * the middle and toward each end of the verandah. Two risers, because the
   * whole drop is 0.33 m. */
  for (const sx of [-15.0, 0.0, 15.0]) {
    const w = 1.3;
    S.box(sx - w, -0.2, D.terraceZ1, sx + w, D.terraceTop - 0.165, D.terraceZ1 + 0.62, CLUB.concreteDark);
    S.box(sx - w, -0.2, D.terraceZ1 + 0.31, sx + w, D.apronTop + 0.005, D.terraceZ1 + 0.62, CLUB.concrete);
    /* The nosing, which is the bit that catches the light. */
    S.box(sx - w, D.terraceTop - 0.05, D.terraceZ1 + 0.28, sx + w, D.terraceTop, D.terraceZ1 + 0.34, CLUB.brickDark);
  }

}

/* ------------------------------------------------------------------ *
 * The three wall masses. The front wall is one straight line at z = 0, which
 * is what the verandah runs along; the BACK wall steps, deepest at the west
 * end, which is the plan the reference has.
 * ------------------------------------------------------------------ */
function masses(S) {
  const y0 = D.terraceTop;
  const blocks = [
    [D.westX0, D.westX1, D.westBack, D.westEave],
    [D.midX0, D.midX1, D.midBack, D.midEave],
    [D.eastX0, D.eastX1, D.eastBack, D.eastEave],
  ];
  for (const [x0, x1, back, eave] of blocks) {
    S.box(x0, y0, back, x1, eave, 0, CLUB.wall);
    /* A brick base course, which is how these buildings are actually built
     * and, more usefully here, the thing that stops a 44 m wall being one
     * flat band of colour from end to end. */
    S.box(x0 - 0.06, y0, back - 0.06, x1 + 0.06, y0 + 0.62, 0.06, CLUB.brick);
  }
  /*
   * Gable infill: the triangle of WALL between an eave line and a ridge, which
   * belongs to the wall rather than to the roof and is drawn in the wall's
   * shade. The east wing has one, because its far end is a gable. THE WEST
   * MASS DOES NOT, because its far end is hipped: a triangle there would
   * stand inside the hip and poke out through it.
   */
  S.tri(
    [D.eastX1, D.eastEave, D.eastBack], [D.eastX1, D.eastEave, 0],
    [D.eastX1, D.eastRidge, D.eastRidgeZ], CLUB.wallShade, [1, 0, 0],
  );
}

/* ------------------------------------------------------------------ *
 * The roof, which is the thing that makes this building recognisable.
 *
 * West mass: a ridge along the building, HIPPED at the far end, so the west
 * elevation is a sloping plane rather than a gable. Middle: two cross gables
 * whose ends face the field, which is the fold. East wing: a lower ridge
 * along the building with a plain gable at the far end.
 * ------------------------------------------------------------------ */
function roof(S) {
  const oh = D.overhang;
  const bg = D.barge;

  /* --- West mass ------------------------------------------------- */
  {
    const zBack = D.westBack - oh;
    const zFront = 0 + oh;
    const zR = D.westRidgeZ;
    const yE = D.westEave;
    const yR = D.westRidge;
    const hx = D.westHipX;
    const xE = D.westX0 - oh;
    /* The two long planes, over the part of the mass that still has a ridge. */
    S.slopeX(hx, D.westX1, zR, yR, zBack, yE, CLUB.roof);
    S.slopeX(hx, D.westX1, zR, yR, zFront, yE, CLUB.roof);
    /* The hip: three faces closing the west end, a triangle off each long
     * plane and one sloping plane facing west. */
    S.tri([hx, yR, zR], [hx, yE, zBack], [xE, yE, zBack], CLUB.roof, UP);
    S.tri([hx, yR, zR], [hx, yE, zFront], [xE, yE, zFront], CLUB.roof, UP);
    S.tri([hx, yR, zR], [xE, yE, zBack], [xE, yE, zFront], CLUB.roof, UP);
    /* Ridge capping. */
    S.box(hx - 0.1, yR - 0.06, zR - 0.14, D.westX1, yR + 0.05, zR + 0.14, CLUB.roofTrim);
    /* Fascia and gutter along all three eaves. */
    S.edgeBoard(xE, yE, zBack, D.westX1, yE, zBack, 0.22, CLUB.roofTrim, [0, 0, -1]);
    S.edgeBoard(xE, yE, zFront, D.westX1, yE, zFront, 0.22, CLUB.roofTrim, [0, 0, 1]);
    S.edgeBoard(xE, yE, zBack, xE, yE, zFront, 0.22, CLUB.roofTrim, [-1, 0, 0]);
    S.flat(xE, zBack, D.westX1, zFront, yE - D.soffit, CLUB.wallShade, DOWN);
    solar(S, hx, zR, yR, zFront, yE);
  }

  /* --- Middle: the two cross gables ------------------------------ */
  {
    const zBack = D.midBack - oh;
    const zFront = 0 + oh;
    const yE = D.midEave;
    const yR = D.midRidge;
    /*
     * THE TWO GABLES SHARE THEIR VALLEY LINE, at midSplit, and that is not a
     * detail. Giving each one its own barge overhang there left a 0.35 m slot
     * straight through the roof to the wall below, which is what a real M
     * roof puts a box gutter in, not a hole. Only the OUTER edge of the pair
     * carries a barge: the west edge butts into the west mass and the east
     * oversails the lower east wing.
     */
    const spans = [[D.midX0, D.midSplit], [D.midSplit, D.midX1 + bg]];
    for (const [a, b] of spans) {
      const mid = (a + b) * 0.5;
      S.slopeZ(zBack, zFront, mid, yR, a, yE, CLUB.roof);
      S.slopeZ(zBack, zFront, mid, yR, b, yE, CLUB.roof);
      /* Gable ends, front and back. The front pair, side by side, IS the
       * chevron the reference shows from the air. */
      S.tri([a, yE, zFront], [b, yE, zFront], [mid, yR, zFront], CLUB.wallShade, [0, 0, 1]);
      S.tri([a, yE, zBack], [b, yE, zBack], [mid, yR, zBack], CLUB.wallShade, [0, 0, -1]);
      /* Ridge capping and the two barge boards down the gable edges. */
      S.box(mid - 0.14, yR - 0.06, zBack, mid + 0.14, yR + 0.05, zFront, CLUB.roofTrim);
      S.edgeBoard(a, yE, zFront, mid, yR, zFront, 0.2, CLUB.roofTrim, [0, 0, 1]);
      S.edgeBoard(mid, yR, zFront, b, yE, zFront, 0.2, CLUB.roofTrim, [0, 0, 1]);
    }
    S.flat(D.midX0, zBack, D.midX1 + bg, zFront, yE - D.soffit, CLUB.wallShade, DOWN);
  }

  /* --- East wing -------------------------------------------------- */
  {
    const zBack = D.eastBack - oh;
    const zFront = 0 + oh;
    const zR = D.eastRidgeZ;
    const yE = D.eastEave;
    const yR = D.eastRidge;
    const xE = D.eastX1 + bg;
    S.slopeX(D.eastX0, xE, zR, yR, zBack, yE, CLUB.roof);
    S.slopeX(D.eastX0, xE, zR, yR, zFront, yE, CLUB.roof);
    S.box(D.eastX0, yR - 0.06, zR - 0.14, xE, yR + 0.05, zR + 0.14, CLUB.roofTrim);
    S.edgeBoard(D.eastX0, yE, zBack, xE, yE, zBack, 0.22, CLUB.roofTrim, [0, 0, -1]);
    S.edgeBoard(D.eastX0, yE, zFront, xE, yE, zFront, 0.22, CLUB.roofTrim, [0, 0, 1]);
    S.flat(D.eastX0, zBack, xE, zFront, yE - D.soffit, CLUB.wallShade, DOWN);
    /* A name board on the gable end. This face is what a pilot sees on the
     * downwind leg and it is the one flat wall on the building big enough to
     * carry the club's colours. */
    S.box(D.eastX1 + 0.02, yE + 0.35, zR - 1.5, D.eastX1 + 0.1, yE + 1.25, zR + 1.5, CLUB.sign);
    S.box(D.eastX1 + 0.1, yE + 0.5, zR - 1.28, D.eastX1 + 0.15, yE + 0.72, zR + 1.28, CLUB.signMark);
  }

  /* Whirlybirds. Two on each long ridge, because a shed roof this size in
   * this country has them and because they break a 17 m straight line. */
  const vents = [
    [-16.5, D.westRidgeZ, D.westRidge], [-9.5, D.westRidgeZ, D.westRidge],
    [10.5, D.eastRidgeZ, D.eastRidge], [17.5, D.eastRidgeZ, D.eastRidge],
  ];
  for (const [vx, vz, vy] of vents) {
    S.box(vx - 0.16, vy + 0.05, vz - 0.16, vx + 0.16, vy + 0.36, vz + 0.16, CLUB.roofTrim);
    S.box(vx - 0.26, vy + 0.36, vz - 0.26, vx + 0.26, vy + 0.62, vz + 0.26, CLUB.roofTrim);
  }
}

/*
 * The array, lying on the west mass's field facing plane.
 *
 * On the FIELD side rather than behind the ridge, and that is a choice with a
 * reason on both sides of it. The sun in this world comes from +X and +Z, so
 * the field side plane is the lit one: panels behind the ridge would be
 * correct for the southern hemisphere and would then spend the whole game in
 * the ramp's shadow band, on the one face of the building a pilot never flies
 * over. Fourteen modules at 1.65 by 1.0 m, which is a real 400 W panel, in
 * two rows below the ridge.
 */
function solar(S, hx, zR, yR, zEave, yEave) {
  const cols = 7;
  const pw = 1.65;
  const gap = 0.04;
  const x0 = hx + 0.8;
  /* Along the slope: t is 0 at the ridge and 1 at the eave. */
  const at = (t) => ({ z: zR + (zEave - zR) * t, y: yR + (yEave - yR) * t });
  const run = Math.hypot(zEave - zR, yEave - yR);
  const rows = [0.09, 0.09 + 1.06 / run];
  for (const t0 of rows) {
    const t1 = t0 + 1.0 / run;
    const a = at(t0);
    const b = at(t1);
    for (let i = 0; i < cols; i += 1) {
      const px0 = x0 + i * (pw + gap);
      const px1 = px0 + pw;
      /* Lifted 6 cm clear of the sheeting on its rails, so a panel is a
       * separate plane with its own band rather than a decal on the roof. */
      S.quad(
        [px1, a.y + 0.06, a.z], [px0, a.y + 0.06, a.z],
        [px0, b.y + 0.06, b.z], [px1, b.y + 0.06, b.z],
        CLUB.solar, [0, 1, 0],
      );
      S.quad(
        [px1, a.y + 0.03, a.z - 0.05], [px0, a.y + 0.03, a.z - 0.05],
        [px0, b.y + 0.03, b.z + 0.05], [px1, b.y + 0.03, b.z + 0.05],
        CLUB.solarFrame, [0, 1, 0],
      );
    }
  }
}

/* ------------------------------------------------------------------ *
 * The verandah. Open, on posts, and wrapped around three sides, because it
 * is where the pilots stand.
 *
 * It is built off a level WALL PLATE that follows the front wall and both end
 * walls, with a plane falling outward from each of the three runs and a hip
 * triangle closing each of the two front corners. That is one more shape than
 * a straight skillion and it is the shape the owner described: a verandah
 * that returns around the outside rather than stopping at the corner.
 *
 * EVERY PLANE IS DRAWN TWICE, once facing up and once facing down a soffit
 * thickness below it. A pilot standing on this deck is looking at the
 * underside of the roof; drawn as bare planes it would be sky.
 * ------------------------------------------------------------------ */
function verandah(S) {
  const yW = D.verHigh;
  const yE = D.verLow;
  const t = 0.18;
  const zOut = D.verOut;
  const xW = D.verX0;
  const xE = D.verX1;
  /* The plate: level, along the front wall and both end walls. */
  const pw = D.westX0;
  const pe = D.eastX1;
  const backW = D.westBack;
  const backE = D.eastBack;

  /*
   * Three planes, hipped at the two front corners.
   *
   * The hip is what makes each plane a TRAPEZOID rather than a rectangle: the
   * front plane is 44 m wide at the plate and 53 m wide at the eave, and the
   * two hip lines run diagonally out from the plate corners to the eave
   * corners. The first version of this cut the corners off at 45 instead,
   * which is a chamfer rather than a hip, and it left a triangle of deck at
   * each end of the verandah with open sky above it. A ray cast straight up
   * off the deck at x = 26 found it.
   */
  const front = [[pe, yW, 0], [pw, yW, 0], [xW, yE, zOut], [xE, yE, zOut]];
  const west = [[pw, yW, backW], [pw, yW, 0], [xW, yE, zOut], [xW, yE, backW]];
  const east = [[pe, yW, 0], [pe, yW, backE], [xE, yE, backE], [xE, yE, zOut]];
  for (const [a, b, c, d] of [front, west, east]) {
    S.quad(a, b, c, d, CLUB.verRoof, UP);
    /* And the underside, a soffit thickness below. A plane on a FrontSide
     * material shows nothing from beneath, and beneath is exactly where the
     * pilots stand. */
    S.quad(
      [a[0], a[1] - t, a[2]], [b[0], b[1] - t, b[2]],
      [c[0], c[1] - t, c[2]], [d[0], d[1] - t, d[2]],
      CLUB.verSoffit, DOWN,
    );
  }

  /* The fascia, closing the outer edge on all three sides. This dark band is
   * what carries the building's silhouette against the grass. */
  S.edgeBoard(xW, yE, backW, xW, yE, zOut, 0.3, CLUB.verFascia, [-1, 0, 0]);
  S.edgeBoard(xW, yE, zOut, xE, yE, zOut, 0.3, CLUB.verFascia, [0, 0, 1]);
  S.edgeBoard(xE, yE, zOut, xE, yE, backE, 0.3, CLUB.verFascia, [1, 0, 0]);

  /* Posts, from the same ring the collider list is built from, so a post you
   * can see and a post you can hit are the same post. */
  for (const [px, pz] of postRing()) {
    S.box(px - D.postR, D.terraceTop, pz - D.postR, px + D.postR, yE - 0.2, pz + D.postR, CLUB.steel);
  }

  /* The sign along the fascia, centred, which is the only thing on this
   * building anybody reads from the air. */
  S.box(-5.5, yE - 0.3, zOut + 0.01, 5.5, yE - 0.06, zOut + 0.05, CLUB.sign);
  S.box(-4.2, yE - 0.25, zOut + 0.05, 4.2, yE - 0.11, zOut + 0.08, CLUB.signMark);
}

/*
 * The post positions, in the local frame. Walked round the verandah's outer
 * edge inset by postInset, at as near 3.5 m centres as each run allows, so a
 * run ends on a post rather than on a gap and the two corners get one post
 * rather than two in the same place.
 */
function postRing() {
  const i = D.postInset;
  const path = [
    [D.verX0 + i, D.westBack],
    [D.verX0 + i, D.verOut - i],
    [D.verX1 - i, D.verOut - i],
    [D.verX1 - i, D.eastBack],
  ];
  const out = [];
  for (let k = 0; k < path.length - 1; k += 1) {
    const [ax, az] = path[k];
    const [bx, bz] = path[k + 1];
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / D.postStep));
    for (let j = 0; j < n; j += 1) {
      const u = j / n;
      out.push([ax + (bx - ax) * u, az + (bz - az) * u]);
    }
  }
  out.push(path[path.length - 1]);
  return out;
}

/* ------------------------------------------------------------------ *
 * Glazing and doors, all of it on the front wall under the verandah, which is
 * the only elevation this world ever shows anybody.
 * ------------------------------------------------------------------ */
function openings(S) {
  const y0 = D.terraceTop;
  const win = (cx, w, sill, h) => {
    S.box(cx - w * 0.5 - 0.07, y0 + sill - 0.07, 0.0, cx + w * 0.5 + 0.07, y0 + sill + h + 0.07, 0.06, CLUB.frame);
    S.box(cx - w * 0.5, y0 + sill, 0.055, cx + w * 0.5, y0 + sill + h, 0.075, CLUB.glass);
  };
  const dbl = (cx, w, h, hex) => {
    S.box(cx - w * 0.5 - 0.08, y0, 0.0, cx + w * 0.5 + 0.08, y0 + h + 0.08, 0.06, CLUB.frame);
    S.box(cx - w * 0.5, y0 + 0.02, 0.055, cx + w * 0.5, y0 + h, 0.085, hex);
    /* The meeting stile, so a 2 m opening reads as two leaves. */
    S.box(cx - 0.03, y0 + 0.02, 0.085, cx + 0.03, y0 + h, 0.1, CLUB.frame);
  };

  /* West mass: the social room, a run of windows and its own door. */
  for (const cx of [-19.4, -15.6, -11.8]) {
    win(cx, 2.6, 0.95, 1.55);
  }
  dbl(-7.6, 1.9, 2.15, CLUB.door);

  /* Middle: full height glazing between the two cross gables, which is where
   * a pavilion puts its bar and its view of the field. */
  win(-4.2, 2.9, 0.35, 2.55);
  dbl(-0.25, 2.4, 2.45, CLUB.glass);
  win(3.4, 2.9, 0.35, 2.55);

  /*
   * East wing: changerooms and the store, so smaller openings and a roller
   * shutter big enough to get a mower through.
   *
   * The second window and the shutter are set 0.4 m apart from where they
   * would naturally sit, to leave ONE clear panel 3.08 m wide between them.
   * That panel is the only stretch of this elevation with no opening in it
   * and it is what the plaque hangs on: a board 2.3 m across needs a wall,
   * and every other gap on a 44 m frontage of glazing is about a metre.
   */
  for (const cx of [7.2, 10.0]) {
    win(cx, 1.5, 1.35, 1.05);
  }
  S.box(13.9, y0, 0.0, 18.1, y0 + 2.55, 0.07, CLUB.frame);
  S.box(14.05, y0 + 0.02, 0.065, 17.95, y0 + 2.42, 0.095, CLUB.wallShade);
  for (let i = 0; i < 7; i += 1) {
    const ry = y0 + 0.28 + i * 0.31;
    S.box(14.05, ry, 0.095, 17.95, ry + 0.05, 0.11, CLUB.frame);
  }
  win(19.9, 1.5, 1.35, 1.05);

  /* The plaque's surround, in the main soup because a bronze frame is a
   * colour and not a texture. The engraved plate itself is a separate mesh:
   * see plaqueMesh. */
  S.box(
    PLAQUE.cx - PLAQUE.w * 0.5 - PLAQUE.frame, y0 + PLAQUE.sill - PLAQUE.frame, 0.0,
    PLAQUE.cx + PLAQUE.w * 0.5 + PLAQUE.frame, y0 + PLAQUE.sill + PLAQUE.h + PLAQUE.frame, PLAQUE.z,
    CLUB.plaqueFrame,
  );
}

/* ------------------------------------------------------------------ *
 * The pits.
 *
 * Six trestles on the verandah with a case on three of them. This is the
 * detail the owner asked for by name and it is the one that makes the
 * building a club's rather than a council's: without it the verandah is an
 * empty covered slab and there is nothing to say what the place is for.
 * ------------------------------------------------------------------ */
const TABLE_X = [-18.5, -11.5, -4.5, 3.5, 10.5, 17.5];
const TABLE_Z = 2.1;
const TABLE_HALF_W = 0.9;
const TABLE_HALF_D = 0.375;
const TABLE_H = 0.74;

function pits(S) {
  const deck = D.terraceTop;
  const topY = deck + TABLE_H;
  for (let i = 0; i < TABLE_X.length; i += 1) {
    const cx = TABLE_X[i];
    S.box(
      cx - TABLE_HALF_W, topY - 0.035, TABLE_Z - TABLE_HALF_D,
      cx + TABLE_HALF_W, topY, TABLE_Z + TABLE_HALF_D, CLUB.timber,
    );
    /* Two folding trestle frames rather than four legs: it is the shape of a
     * trestle table that reads at this size, not the leg count. */
    for (const lx of [cx - 0.62, cx + 0.62]) {
      S.box(lx - 0.035, deck, TABLE_Z - 0.3, lx + 0.035, topY - 0.035, TABLE_Z - 0.24, CLUB.trestle);
      S.box(lx - 0.035, deck, TABLE_Z + 0.24, lx + 0.035, topY - 0.035, TABLE_Z + 0.3, CLUB.trestle);
      S.box(lx - 0.035, topY - 0.2, TABLE_Z - 0.3, lx + 0.035, topY - 0.16, TABLE_Z + 0.3, CLUB.trestle);
    }
    if (i % 2 === 0) {
      S.box(cx - 0.34, topY, TABLE_Z - 0.17, cx + 0.16, topY + 0.2, TABLE_Z + 0.19, CLUB.caseBlack);
    }
  }
}

/* ------------------------------------------------------------------ *
 * What is solid.
 *
 * A HOLLOW SHELL, not a filled mass. The first version of this list was
 * one AABB per wing from the back wall through to 0.45 m PAST the front
 * wall, terrace to eave. That volume included the rooms, the doorways and
 * a strip of the verandah in front of the glass. Flying through a door,
 * which the mesh paints as open, put the hull inside a solid with no
 * exit: every direction was a wall. That is the clubhouse trap the board
 * reported as "can't fly out of the building" / "wall collision even in
 * a clear path."
 *
 * Walls are now thin, the front is punched with the same openings the
 * mesh draws (windows and doors; the roller shutter stays shut), and
 * there are no party walls, so an entry on the west can leave on the
 * east. Roofs, posts, kerbs and tables are unchanged. The verandah roof
 * is still tagged so verandahClear is measured off the collider a craft
 * would actually hit.
 *
 * Local frame. The caller rotates and translates, and because the yaw is
 * always a quarter turn the boxes stay axis aligned in the world.
 * ------------------------------------------------------------------ */
const WALL_T = 0.28;

export function clubhouseSolids() {
  return solids();
}

function uniqSorted(arr) {
  const s = arr.slice().sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < s.length; i += 1) {
    if (i === 0 || s[i] - s[i - 1] > 0.001) {
      out.push(s[i]);
    }
  }
  return out;
}

function punchWallXY(out, x0, y0, x1, y1, z0, z1, holes) {
  const xs = [x0, x1];
  const ys = [y0, y1];
  const local = [];
  for (const h of holes) {
    const hx0 = Math.max(x0, Math.min(h.x0, h.x1));
    const hx1 = Math.min(x1, Math.max(h.x0, h.x1));
    const hy0 = Math.max(y0, Math.min(h.y0, h.y1));
    const hy1 = Math.min(y1, Math.max(h.y0, h.y1));
    if (hx1 - hx0 < 0.05 || hy1 - hy0 < 0.05) {
      continue;
    }
    local.push({ x0: hx0, x1: hx1, y0: hy0, y1: hy1 });
    xs.push(hx0, hx1);
    ys.push(hy0, hy1);
  }
  const ux = uniqSorted(xs);
  const uy = uniqSorted(ys);
  const zA = Math.min(z0, z1);
  const zB = Math.max(z0, z1);
  for (let i = 0; i < ux.length - 1; i += 1) {
    for (let j = 0; j < uy.length - 1; j += 1) {
      const xa = ux[i];
      const xb = ux[i + 1];
      const ya = uy[j];
      const yb = uy[j + 1];
      if (xb - xa < 0.05 || yb - ya < 0.05) {
        continue;
      }
      const mx = (xa + xb) * 0.5;
      const my = (ya + yb) * 0.5;
      if (local.some((h) => mx > h.x0 && mx < h.x1 && my > h.y0 && my < h.y1)) {
        continue;
      }
      out.push({ kind: 'wall', box: [xa, ya, zA, xb, yb, zB] });
    }
  }
}

/*
 * NOTHING IS PUNCHED, and this function is here to say so in the one place
 * a reader will look for it rather than to be deleted.
 *
 * The rebuild that hollowed the pavilion punched all ten openings on the
 * front elevation. openings() above draws every one of them SHUT: each
 * window is a solid pane of CLUB.glass, each door is two leaves and a
 * meeting stile, and the shutter is a shutter. So the fix for an invisible
 * wall in clear air shipped ten sheets of glass a quad flew straight
 * through, which is the same defect pointing the other way and the one
 * this file's rule forbids: a gap you see is a gap you fly.
 *
 * The reported bug was never the rooms. It was that the old mass ran from
 * the back wall to 0.45 m PAST the front face, so the strip of verandah in
 * front of the glass, which is drawn as clear air and is the line a pilot
 * takes through the pits, was solid. Thin walls fix that, and they fix it
 * whether or not anything is punched. So the building is shut, its walls
 * hug what is drawn, and its shell has a lid.
 *
 * A pavilion a quad can fly through would be a good thing to have, and
 * this is where its openings would go. It needs the elevation drawn open
 * and the rooms given inward faces, which is art rather than a bug fix:
 * DoubleSide on the existing single boxes puts every dado and sill into z
 * fighting with the wall it is painted on, measured on this map. Worth
 * doing on its own, not on the way past.
 */
function flyableFrontHoles() {
  return [];
}

function solids() {
  const out = [];
  const wall = (x0, y0, z0, x1, y1, z1) => out.push({
    kind: 'wall',
    box: [
      Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1),
      Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1),
    ],
  });
  const y0 = D.terraceTop;
  const holes = flyableFrontHoles();

  punchWallXY(out, D.westX0, y0, D.westX1, D.westEave, -WALL_T, 0, holes);
  punchWallXY(out, D.midX0, y0, D.midX1, D.midEave, -WALL_T, 0, holes);
  punchWallXY(out, D.eastX0, y0, D.eastX1, D.eastEave, -WALL_T, 0, holes);

  wall(D.westX0, y0, D.westBack, D.westX1, D.westEave, D.westBack + WALL_T);
  wall(D.midX0, y0, D.midBack, D.midX1, D.midEave, D.midBack + WALL_T);
  wall(D.eastX0, y0, D.eastBack, D.eastX1, D.eastEave, D.eastBack + WALL_T);

  wall(D.westX0, y0, D.westBack, D.westX0 + WALL_T, D.westEave, 0);
  wall(D.eastX1 - WALL_T, y0, D.eastBack, D.eastX1, D.eastEave, 0);

  /* The stepped backs, so the extra depth of a wing is a wall, not a hole
   * into the next room from behind. */
  wall(D.westX1 - WALL_T, y0, D.westBack, D.westX1, D.westEave, D.midBack);
  wall(D.eastX0, y0, D.midBack, D.eastX0 + WALL_T, D.eastEave, D.eastBack);

  /*
   * THE CEILING, one slab per wing at its own eave.
   *
   * The mass this rebuild replaced was one filled box per wing from the
   * terrace to the eave, and that box was the ceiling as well as the mass.
   * Hollowing the wings deleted it and put nothing back, so between the two
   * ridge boxes each room was open straight to the sky: measured on
   * clubhouseSolids, a vertical ray from inside found nothing solid over 60
   * percent of the west wing, 44 of the middle and 41 of the east. A quad
   * that flew in a door left through the drawn roof. These three close it,
   * and the ridge boxes sit on top of them.
   */
  wall(D.westX0, D.westEave - 0.24, D.westBack, D.westX1, D.westEave, 0);
  wall(D.midX0, D.midEave - 0.24, D.midBack, D.midX1, D.midEave, 0);
  wall(D.eastX0, D.eastEave - 0.24, D.eastBack, D.eastX1, D.eastEave, 0);

  wall(D.westX0, D.westEave, D.westRidgeZ - 2.0, D.westX1, D.westRidge, D.westRidgeZ + 2.0);
  wall(D.eastX0, D.eastEave, D.eastRidgeZ - 2.0, D.eastX1, D.eastRidge, D.eastRidgeZ + 2.0);
  /* The two cross gables. Their ridges run ACROSS the building, so the upper
   * box follows the depth and is narrow in x, twice. */
  for (const m of [(D.midX0 + D.midSplit) * 0.5, (D.midSplit + D.midX1) * 0.5]) {
    wall(m - 1.4, D.midEave, D.midBack - D.overhang, m + 1.4, D.midRidge, D.overhang);
  }

  /*
   * The verandah roof, as THREE boxes rather than one that covers the whole
   * terrace. One box is a line shorter and it puts a slab of solid air at
   * three metres over the strip of terrace behind the east wing, where there
   * is no roof at all and nothing to see: an invisible solid is the worst
   * kind of collider, because the first anybody knows about it is a wreck
   * with nothing on the screen to explain it.
   *
   * Solid from just under the low edge upward, so the clear air beneath stays
   * clear. That gap is the doorway a pilot uses to fly through the pits and
   * it must not be quietly filled in.
   */
  wall(D.verX0, D.verLow - 0.28, 0, D.verX1, D.verHigh + 0.06, D.verOut);
  out[out.length - 1].tag = 'verandahRoof';
  wall(D.verX0, D.verLow - 0.28, D.westBack, D.westX0, D.verHigh + 0.06, 0);
  wall(D.eastX1, D.verLow - 0.28, D.eastBack, D.verX1, D.verHigh + 0.06, 0);

  /* Posts. A capsule each, over their whole visible length, from the same
   * ring the mesh is built from. */
  for (const [px, pz] of postRing()) {
    out.push({
      kind: 'pole',
      post: [px, pz, D.terraceTop, D.verLow - 0.2, D.postR * 1.35],
    });
  }

  /* The terrace and apron edges, which are the two kerbs a low pass meets. */
  wall(D.verX0 - 0.12, 0, D.terraceZ1, D.verX1 + 0.12, D.terraceTop, D.terraceZ1 + 0.12);
  wall(D.apronX0, 0, D.apronZ1 - 0.26, D.apronX1, D.apronTop + 0.16, D.apronZ1);

  /* The tables. A quad that clips one is finished, and a pilot who parks on
   * one has landed on it, so they are both solid and standable. */
  for (const cx of TABLE_X) {
    wall(
      cx - TABLE_HALF_W, D.terraceTop + 0.5, TABLE_Z - TABLE_HALF_D,
      cx + TABLE_HALF_W, D.terraceTop + TABLE_H, TABLE_Z + TABLE_HALF_D,
    );
  }
  return out;
}

/*
 * What can be landed on. Rectangles in the local frame; the caller takes the
 * highest one within a step of the query, the same rule the launch stands
 * and the city's decks already use.
 */
function decks() {
  const out = [
    { x0: D.verX0, x1: D.verX1, z0: D.terraceZ0, z1: D.terraceZ1, top: D.terraceTop, tag: 'terrace' },
    { x0: D.apronX0, x1: D.apronX1, z0: D.terraceZ1, z1: D.apronZ1, top: D.apronTop },
  ];
  for (const cx of TABLE_X) {
    out.push({
      x0: cx - TABLE_HALF_W,
      x1: cx + TABLE_HALF_W,
      z0: TABLE_Z - TABLE_HALF_D,
      z1: TABLE_Z + TABLE_HALF_D,
      top: D.terraceTop + TABLE_H,
    });
  }
  return out;
}

/*
 * THE CAR PARK, AND WHY IT IS NOT PART OF THE PAVILION.
 *
 * It used to be a strip on the clubhouse's western end, bolted into the same
 * local frame as the building, which put it in the wrong place twice over.
 * The aerial has it off the EASTERN corner of the paddock, a long run going
 * north from the pavilion with a road looping down to it, and it belongs to
 * the ground rather than to the building: the paddock's outline decides where
 * it sits, so it is placed against the paddock like the fence and the
 * treeline are.
 *
 * IT KEEPS ITS OWN REAL SIZE, 60 by 16 m for some twenty five bays. Scaling
 * it the way the paddock's outline is scaled would have drawn a 190 m car
 * park, which is a retail centre. Structures are built at life size and only
 * the ground is drawn large; see the note on SITE in src/render/scene.js.
 *
 * LOCAL FRAME, Y up. +X is across the bays, +Z runs the length of it, and
 * the origin is the middle of the slab at the level of the ground it stands
 * on. The bays are perpendicular, on the paddock side, which is the side the
 * aerial marks.
 */
export const CAR_PARK = {
  w: 16,
  len: 60,
  top: 0.06,
  /* One bay per 2.5 m, the Australian standard, and 5.4 m deep. */
  bayStep: 2.5,
  bayDepth: 5.4,
  kerb: 0.3,
};

/*
 * The car park, as one mesh wearing the SAME material the pavilion wears.
 *
 * That is the whole performance story and it is why this returns a mesh
 * rather than adding one: the scenery merger buckets by material, so a
 * second object in the clubhouse's vertex coloured material merges into the
 * clubhouse's bucket and costs no extra draw call and no extra mesh at all.
 */
export function assembleCarPark(THREE, mat) {
  const S = makeSoup(THREE);
  const hw = CAR_PARK.w * 0.5;
  const hl = CAR_PARK.len * 0.5;
  const t = CAR_PARK.top;

  /* The slab, skirted so no daylight shows under its edge on ground the
   * height field has levelled only to a tolerance. */
  S.box(-hw, -1.2, -hl, hw, t, hl, CLUB.bitumen);

  /* Terracotta kerb round it, which is what both photographs edge every
   * paved thing on this site with. */
  S.box(-hw - CAR_PARK.kerb, -0.3, -hl - CAR_PARK.kerb, hw + CAR_PARK.kerb, t + 0.12, -hl, CLUB.brick);
  S.box(-hw - CAR_PARK.kerb, -0.3, hl, hw + CAR_PARK.kerb, t + 0.12, hl + CAR_PARK.kerb, CLUB.brick);
  S.box(-hw - CAR_PARK.kerb, -0.3, -hl, -hw, t + 0.12, hl, CLUB.brick);
  S.box(hw, -0.3, -hl, hw + CAR_PARK.kerb, t + 0.12, hl, CLUB.brick);

  /*
   * Bays down the paddock side, and an aisle beside them. Perpendicular
   * rather than angled, because that is what the aerial shows and because a
   * 16 m width is exactly a 5.4 m bay, a 5.2 m aisle and a 5.4 m bay.
   */
  const n = Math.floor((CAR_PARK.len - 1) / CAR_PARK.bayStep);
  for (let i = 0; i <= n; i += 1) {
    const z = -hl + 0.5 + i * CAR_PARK.bayStep;
    /* West side, the bays facing the field. */
    S.box(-hw + 0.1, t, z - 0.06, -hw + CAR_PARK.bayDepth, t + 0.006, z + 0.06, CLUB.line);
    /* East side, backing onto the bush. */
    S.box(hw - CAR_PARK.bayDepth, t, z - 0.06, hw - 0.1, t + 0.006, z + 0.06, CLUB.line);
  }

  const mesh = new THREE.Mesh(S.build(), mat);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return {
    mesh,
    /* Landable, because a quad that parks on the bitumen has landed on it. */
    deck: { x0: -hw, x1: hw, z0: -hl, z1: hl, top: t },
    /* The kerb is the only solid part: a quad clips a 0.18 m lip, not a
     * car park. */
    kerbs: [
      { x0: -hw - CAR_PARK.kerb, z0: -hl - CAR_PARK.kerb, x1: hw + CAR_PARK.kerb, z1: -hl, y: t + 0.12 },
      { x0: -hw - CAR_PARK.kerb, z0: hl, x1: hw + CAR_PARK.kerb, z1: hl + CAR_PARK.kerb, y: t + 0.12 },
      { x0: -hw - CAR_PARK.kerb, z0: -hl, x1: -hw, z1: hl, y: t + 0.12 },
      { x0: hw, z0: -hl, x1: hw + CAR_PARK.kerb, z1: hl, y: t + 0.12 },
    ],
    triangles: S.triangles(),
  };
}

/*
 * The road from the pavilion to the car park.
 *
 * The aerial has one, looping round a roundabout at the pavilion's eastern
 * end and running out to the parking. In here the pavilion is 53 m of a 260 m
 * paddock rather than the 61 percent the photograph gives it, so the two are
 * a hundred metres apart and a road between them is not decoration, it is the
 * thing that stops the car park reading as a slab dropped in the trees.
 *
 * Built in the same frame and material as the car park, as a plain sealed
 * strip: no markings, because a one lane access road in the bush has none.
 */
export function assembleDriveway(THREE, mat, length) {
  const S = makeSoup(THREE);
  const HALF = 3.0;
  /* Built along +X from the origin, so the caller places it at the car park
   * end and it runs back toward the pavilion. */
  S.box(0, -1.0, -HALF, length, CAR_PARK.top, HALF, CLUB.bitumen);
  S.box(0, -0.25, -HALF - 0.25, length, CAR_PARK.top + 0.1, -HALF, CLUB.brick);
  S.box(0, -0.25, HALF, length, CAR_PARK.top + 0.1, HALF + 0.25, CLUB.brick);
  const mesh = new THREE.Mesh(S.build(), mat);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return { mesh, halfWidth: HALF, triangles: S.triangles() };
}
