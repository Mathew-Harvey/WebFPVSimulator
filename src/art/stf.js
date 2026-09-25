/*
 * stf.js: the STF mark, the SubTwoFifty logo every freestyle map carries.
 *
 * WHAT IT IS. The STF logo, a white brush lettered S and F with a green T on
 * black, sprayed through a stencil onto something in the world, with the
 * town's ink treatment: a rough overspray edge, a dark ink line round the
 * letters, the odd drip. It is paint, so it is drawn and never solid, and it
 * takes the light like the surface it is sprayed on. FREESTYLE-MAPS-PLAN.md
 * section 9 is where it comes from and says what finding it means, and
 * section 12, decision 10, is why it is painted big and where the pilot
 * sees it from the pads.
 *
 * THE INTERFACE, which src/maps/city/places/index.js and
 * src/maps/built/index.js both call, exactly:
 *
 *   STF_LOGO_URL                     null, or the owner's logo file (below)
 *   stfCanvas() -> HTMLCanvasElement the painted mark, 1024 by 512, made
 *                                    once and cached. Transparent outside
 *                                    the sprayed black field and its
 *                                    overspray, opaque inside it.
 *   stfDataUrl() -> string           the same canvas as a PNG data URL, for
 *                                    the found panel in the HUD.
 *   makeStfMark(THREE, { width, height, look, shade }) -> THREE.Mesh
 *       A plane `width` by `height` metres in its own XY plane, facing its
 *       own +Z, centred on its origin, with +Y the way the lettering reads
 *       up. To paint it on a face whose outward unit normal is n, reading up
 *       along a unit `up` lying in the face:
 *         right = up x n
 *         mesh.quaternion.setFromRotationMatrix(
 *           new THREE.Matrix4().makeBasis(right, up, n))
 *         mesh.position = a point on the face + n * (0.01 to 0.02)
 *       polygonOffset does the rest, so it never fights the face it is on.
 *       The lettering keeps its own 2:1 aspect. A plane of another shape
 *       gets the mark letterboxed in it, never stretched, and the margin is
 *       transparent.
 *       THE PAINT TAKES THE LIGHT. The material is lit: the town's three
 *       band cel ramp and violet shadow tint, which is how src/props/kit.js
 *       draws a stencil that should go dark with the wall it is on (a family
 *       painter that sets `lit`), not the flat colour it gives a lit plate.
 *       So in a roof space or under a deck the mark sits in the same shade
 *       as the steel round it, and at dusk and overcast it goes down with the
 *       scene's own lights instead of shining. Measured in the town's roof
 *       space at golden hour, the same canvas on an unlit material read as a
 *       lightbox on the ceiling.
 *       `look` is a built map's time of day as kit.js takes it,
 *       { key, flats, night }, or null for the town's golden hour. A lit
 *       material follows the light by itself, and at dusk that was too far:
 *       the white lettering went the grey violet of the steel round it and
 *       the green T all but vanished (measured on the starter's container
 *       end, 3 m out). So at dusk and overcast the paint also gives back a
 *       little of its own colour, STF_GLOW of it, through the canvas as its
 *       emissive map: the letters lift and the T stays green, and the black
 *       field, which gives back nothing, stays black.
 *       `shade` says the face the paint is on is turned away from the sun,
 *       so no direct light reaches it at any time of day: a north wall at
 *       golden hour. Paint there sits in the violet of the shadow side, and
 *       on the town's corner shop the white lettering went the lavender grey
 *       of the render round it (measured from the spawn, 25 m out, and at
 *       4 m). A mark painted to be seen from the pads has to read there, so
 *       paint in shade gives back STF_SHADE_GLOW of its own colour, the way
 *       dusk does, whatever the time of day. Sunlit paint gives back
 *       nothing at golden hour and noon, as before.
 *       castShadow is false, receiveShadow is true, renderOrder is 1,
 *       userData.stf is true and userData.noOutline is true, and the name
 *       is 'stfMarkTrim': the town's collider fit, its cover pass and its
 *       audit all read a name ending in Trim as drawn and not solid (see
 *       src/maps/city/places/kit.js), which is exactly what paint is.
 *       The texture and material are the mark's own, so a map's dispose
 *       frees them with everything else it drew.
 *
 * THE LOGO FILE IS NOT HERE YET. It reached the conversation as a picture,
 * and the plan's section 12 is waiting on it as a file. Until it is
 * committed the mark is placeholder lettering painted below, and it is made
 * to be looked at, because it will be. When the file arrives, set
 * STF_LOGO_URL to it and the same spray treatment paints it instead: the
 * black field, the ink line, the overspray and the drips are all applied to
 * whatever lettering is on the layer, placeholder or file.
 *
 * The only file I/O is that one request, and it is not made while the
 * constant is null: a request for a file that does not exist is a 404 in
 * every pilot's console.
 *
 * Imports nothing, like everything in src/art: THREE is handed in, so the
 * found panel can take stfDataUrl() without pulling a map module with it.
 * The shell asks for this file only when a mark is found (findEgg in
 * src/main.js), by which time the map that painted the mark has loaded it,
 * so a pilot who never flies a freestyle map never fetches it.
 *
 * Render only. Nothing here reaches the physics, so the canvas work below is
 * free to use Math.sin and friends; the determinism rule is about the
 * integrator, and a mark that paints a pixel differently on another engine
 * changes nothing a craft can touch.
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
 * The owner's logo, when it is committed. A path relative to THIS file, so
 * it resolves wherever the shell is mounted: for assets/stf.svg at the
 * repository root that is '../../assets/stf.svg'. An SVG, or a PNG of at
 * least 1024 px across, with the lettering on a TRANSPARENT background: the
 * black field is sprayed here, round the lettering, so a file that brings
 * its own black gets its overspray round the rectangle instead of round the
 * letters. Null means the placeholder, and no request at all.
 */
export const STF_LOGO_URL = null;

/* The canvas, and the mark's own aspect, which the lettering is drawn to. */
const W = 1024;
const H = 512;
const ASPECT = W / H;

/* The town's ink (PAL.ink in src/maps/city/vendored/core/palette.js), for the
 * line round the letters. Written out rather than imported: see the header. */
const INK = '#39324f';
/* Black spray paint, a hair toward the town's violet so it sits in its
 * shadows rather than punching a hole in them. */
const FIELD = '#19171e';
const WHITE = '#f3f0e8';
const GREEN = '#3cc04f';

/*
 * A small seeded generator (mulberry32), so the mark is the same paint on
 * every load, in every map and in the found panel. The seed is arbitrary; a
 * different one is a different spray of the same stencil.
 */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/*
 * Every canvas here is painted once, read back, and never animated, so each
 * is asked for a CPU backed context the first time it is touched. Left to
 * the browser, a 1024 by 512 canvas goes to the GPU, where ten thousand
 * small fills and three readbacks cost seconds; measured on this project's
 * software rasteriser the whole mark took 2.6 s that way.
 */
function newCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.getContext('2d', { willReadFrequently: true });
  return c;
}

const smooth = (t) => {
  const x = t < 0 ? 0 : (t > 1 ? 1 : t);
  return x * x * (3 - 2 * x);
};

/* ------------------------------------------------------------------ *
 * The placeholder lettering: brush strokes on a transparent layer.
 * ------------------------------------------------------------------ */

/* A Catmull-Rom curve through the points, then resampled every `step`
 * pixels of arc, so a stroke's width profile is a function of how far along
 * the brush has travelled rather than of how the points were spaced. */
function strokePath(pts, step = 2) {
  const dense = [];
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let j = 0; j < 24; j += 1) {
      const t = j / 24;
      const t2 = t * t;
      const t3 = t2 * t;
      const at = (k) => 0.5 * ((2 * p1[k]) + (p2[k] - p0[k]) * t
        + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2
        + (3 * p1[k] - p0[k] - 3 * p2[k] + p3[k]) * t3);
      dense.push([at(0), at(1)]);
    }
  }
  dense.push(pts[pts.length - 1].slice());
  const out = [dense[0]];
  let carry = 0;
  for (let i = 1; i < dense.length; i += 1) {
    const [ax, ay] = dense[i - 1];
    const [bx, by] = dense[i];
    const seg = Math.hypot(bx - ax, by - ay);
    let d = step - carry;
    while (d <= seg) {
      out.push([ax + ((bx - ax) * d) / seg, ay + ((by - ay) * d) / seg]);
      d += step;
    }
    carry = seg - (d - step);
  }
  out.push(dense[dense.length - 1]);
  /* Unit normals from each sample's neighbours. */
  return out.map((p, i) => {
    const a = out[Math.max(0, i - 1)];
    const b = out[Math.min(out.length - 1, i + 1)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    return { x: p[0], y: p[1], nx: -dy / l, ny: dx / l, u: i / (out.length - 1) };
  });
}

/*
 * One stroke of a loaded brush.
 *
 * The body is a filled ribbon whose width follows the hand: it lands at
 * about two thirds, swells to full in the first tenth, wanders a little as
 * the pressure does, and lifts off over the last quarter. Then the dry
 * brush, which is what makes it read as a brush and not a marker: where
 * the paint runs out the bristles part, so thin streaks are cut out of the
 * body along its length, more of them toward the tail and toward the
 * edges, and a few hairs of paint carry on past the end. Painted on its
 * own scratch canvas, because the streaks are cut with destination-out and
 * must not cut a stroke already on the layer.
 */
function brush(layer, scratch, pts, o, R) {
  const P = strokePath(pts);
  const g = scratch.getContext('2d');
  g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, scratch.width, scratch.height);
  const phase = R() * 6.283;
  const width = P.map(({ u }) => {
    const land = 0.64 + 0.36 * smooth(u / o.attack);
    const lift = 1 - (1 - o.tail) * smooth((u - (1 - o.release)) / o.release);
    const hand = 1 + 0.07 * Math.sin(u * 13 + phase) + 0.035 * Math.sin(u * 37 + 2.1 * phase);
    return o.w * land * lift * hand;
  });
  const side = (k, f) => [P[k].x + P[k].nx * f * width[k], P[k].y + P[k].ny * f * width[k]];

  g.fillStyle = o.color;
  g.beginPath();
  for (let k = 0; k < P.length; k += 1) {
    const [x, y] = side(k, 0.5 + (R() - 0.5) * 0.035);
    if (k === 0) {
      g.moveTo(x, y);
    } else {
      g.lineTo(x, y);
    }
  }
  for (let k = P.length - 1; k >= 0; k -= 1) {
    const [x, y] = side(k, -0.5 + (R() - 0.5) * 0.035);
    g.lineTo(x, y);
  }
  g.closePath();
  g.fill();
  /* The landing: a brush put down is rounder and a touch fatter than the
   * ribbon it starts. */
  g.beginPath();
  g.ellipse(P[0].x, P[0].y, width[0] * 0.56, width[0] * 0.5, Math.atan2(P[1].y - P[0].y, P[1].x - P[0].x), 0, 6.2832);
  g.fill();

  /* Tone inside the stroke: the few bristles that carried more paint and
   * the few that carried less. source-atop keeps it on the stroke. */
  g.globalCompositeOperation = 'source-atop';
  for (let s = 0; s < 9; s += 1) {
    const f = (R() - 0.5) * 0.9;
    g.strokeStyle = s < 5 ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.14)';
    g.lineWidth = 1 + R() * 2.5;
    g.beginPath();
    const k0 = Math.floor(R() * P.length * 0.5);
    for (let k = k0; k < P.length; k += 1) {
      const [x, y] = side(k, f);
      if (k === k0) {
        g.moveTo(x, y);
      } else {
        g.lineTo(x, y);
      }
    }
    g.stroke();
  }

  /* The dry brush. Each streak starts where its bristle ran dry and widens
   * toward the tail; streaks near the edge run dry sooner. */
  g.globalCompositeOperation = 'destination-out';
  g.lineCap = 'round';
  for (let s = 0; s < o.streaks; s += 1) {
    const f = (R() - 0.5) * 0.96;
    const edge = Math.abs(f) * 2;
    const u0 = 1 - o.dry * (0.2 + 0.8 * R()) * (0.45 + 0.55 * edge);
    const k0 = Math.max(1, Math.floor(u0 * (P.length - 1)));
    const span = P.length - k0;
    for (let part = 0; part < 3; part += 1) {
      const a = k0 + Math.floor((span * part) / 3);
      const b = Math.min(P.length - 1, k0 + Math.floor((span * (part + 1)) / 3) + 1);
      g.lineWidth = (1.1 + part * 1.5) * (1 + R() * 1.2);
      g.beginPath();
      for (let k = a; k <= b; k += 1) {
        const [x, y] = side(k, f + (R() - 0.5) * 0.01);
        if (k === a) {
          g.moveTo(x, y);
        } else {
          g.lineTo(x, y);
        }
      }
      g.stroke();
    }
  }
  /* Nicks along both edges, where a bristle skipped on the grain. */
  g.beginPath();
  for (let s = 0; s < o.streaks * 3; s += 1) {
    const k = Math.floor(R() * P.length);
    const f = (R() < 0.5 ? -1 : 1) * (0.47 + R() * 0.05);
    const [x, y] = side(k, f);
    const r = 0.8 + R() * 2.2;
    g.moveTo(x + r, y);
    g.arc(x, y, r, 0, 6.2832);
  }
  g.fill();

  /* Hairs of paint past the lift, the last of the load dragged out. */
  g.globalCompositeOperation = 'source-over';
  g.strokeStyle = o.color;
  const end = P[P.length - 1];
  const prev = P[Math.max(0, P.length - 6)];
  const dx = end.x - prev.x;
  const dy = end.y - prev.y;
  const dl = Math.hypot(dx, dy) || 1;
  for (let s = 0; s < 6; s += 1) {
    const f = (R() - 0.5) * o.tail * o.w * 0.9;
    const len = 6 + R() * 20;
    g.lineWidth = 0.8 + R() * 1.4;
    g.beginPath();
    g.moveTo(end.x + end.nx * f - (dx / dl) * 4, end.y + end.ny * f - (dy / dl) * 4);
    g.lineTo(end.x + end.nx * f + (dx / dl) * len, end.y + end.ny * f + (dy / dl) * len + (R() - 0.5) * 3);
    g.stroke();
  }

  layer.getContext('2d').drawImage(scratch, 0, 0);
}

/*
 * THE PLACEHOLDER LETTERING, as brush strokes.
 *
 * Each letter is laid out in its own unit box and mapped into the band the
 * black field leaves, with a forward slant, the way brush lettering leans
 * when it is written fast. Strokes are in the order a hand would make them.
 * The widths are a fifth of the cap height, bold enough to read as three
 * letters from four metres, where the whole mark is about 25 degrees of a
 * pilot's view.
 */
const BAND = { y0: 104, y1: 404, slant: 0.2 };
const LETTERS = [
  {
    color: WHITE,
    box: [114, 356],
    strokes: [
      /* S: one stroke, from the hook at top right round and down. */
      {
        pts: [[0.9, 0.2], [0.78, 0.06], [0.52, 0.0], [0.22, 0.06], [0.06, 0.24], [0.16, 0.42],
          [0.5, 0.54], [0.82, 0.66], [0.9, 0.84], [0.72, 0.98], [0.4, 1.02], [0.08, 0.9]],
        w: 0.215, attack: 0.08, release: 0.22, tail: 0.42, dry: 0.42, streaks: 16,
      },
    ],
  },
  {
    color: GREEN,
    box: [384, 648],
    strokes: [
      /* T: the bar, rising a little to the right, then the stem with a flick. */
      {
        pts: [[0.0, 0.16], [0.28, 0.08], [0.62, 0.04], [1.0, 0.0]],
        w: 0.19, attack: 0.1, release: 0.3, tail: 0.38, dry: 0.5, streaks: 14,
      },
      {
        pts: [[0.54, 0.06], [0.53, 0.36], [0.5, 0.66], [0.45, 0.92], [0.36, 1.02]],
        w: 0.225, attack: 0.1, release: 0.26, tail: 0.36, dry: 0.45, streaks: 14,
      },
    ],
  },
  {
    color: WHITE,
    box: [668, 912],
    strokes: [
      /* F: the stem, the top arm, the middle arm. */
      {
        pts: [[0.16, 0.03], [0.14, 0.36], [0.11, 0.68], [0.07, 1.0]],
        w: 0.225, attack: 0.1, release: 0.24, tail: 0.4, dry: 0.4, streaks: 12,
      },
      {
        pts: [[0.1, 0.1], [0.42, 0.06], [0.74, 0.03], [1.0, 0.0]],
        w: 0.185, attack: 0.08, release: 0.32, tail: 0.36, dry: 0.55, streaks: 14,
      },
      {
        pts: [[0.12, 0.53], [0.38, 0.5], [0.62, 0.48], [0.82, 0.47]],
        w: 0.165, attack: 0.08, release: 0.34, tail: 0.36, dry: 0.55, streaks: 12,
      },
    ],
  },
];

function letteringLayer(R) {
  const layer = newCanvas(W, H);
  const scratch = newCanvas(W, H);
  const capH = BAND.y1 - BAND.y0;
  const mid = (BAND.y0 + BAND.y1) / 2;
  for (const L of LETTERS) {
    const [x0, x1] = L.box;
    for (const s of L.strokes) {
      const pts = s.pts.map(([u, v]) => {
        const y = BAND.y0 + v * capH;
        return [x0 + u * (x1 - x0) + (mid - y) * BAND.slant, y];
      });
      brush(layer, scratch, pts, { ...s, w: s.w * capH, color: L.color }, R);
    }
  }
  return layer;
}

/* The owner's file on the same transparent layer, fitted into the band the
 * placeholder occupies so the field and the drips land where they would. */
function logoLayer(img) {
  const layer = newCanvas(W, H);
  const bw = 820;
  const bh = BAND.y1 - BAND.y0;
  /* An SVG with no width and height of its own reports zero here; it is
   * given the band's shape rather than a division by zero. */
  const iw = img.naturalWidth || img.width || bw;
  const ih = img.naturalHeight || img.height || bh;
  const s = Math.min(bw / iw, bh / ih);
  const dw = iw * s;
  const dh = ih * s;
  layer.getContext('2d').drawImage(img, (W - dw) / 2, (BAND.y0 + BAND.y1 - dh) / 2, dw, dh);
  return layer;
}

/* ------------------------------------------------------------------ *
 * The spray treatment, applied to whatever lettering is on the layer.
 * ------------------------------------------------------------------ */

/* The black field's outline: a rectangle gone freehand, each side wandering
 * by a few pixels at two scales, the corners rounded off the way a can
 * turns a corner. */
function fieldOutline(R) {
  const box = { x0: 46, y0: 56, x1: W - 46, y1: H - 62, r: 34 };
  const pts = [];
  const sides = [
    [box.x0 + box.r, box.y0, box.x1 - box.r, box.y0],
    [box.x1, box.y0 + box.r, box.x1, box.y1 - box.r],
    [box.x1 - box.r, box.y1, box.x0 + box.r, box.y1],
    [box.x0, box.y1 - box.r, box.x0, box.y0 + box.r],
  ];
  const corners = [[box.x1 - box.r, box.y0 + box.r], [box.x1 - box.r, box.y1 - box.r],
    [box.x0 + box.r, box.y1 - box.r], [box.x0 + box.r, box.y0 + box.r]];
  for (let s = 0; s < 4; s += 1) {
    const [ax, ay, bx, by] = sides[s];
    const len = Math.hypot(bx - ax, by - ay);
    const n = Math.max(8, Math.round(len / 6));
    const nx = (by - ay) / len;
    const ny = -(bx - ax) / len;
    const p1 = R() * 6.283;
    const p2 = R() * 6.283;
    for (let i = 0; i < n; i += 1) {
      const t = i / n;
      const wob = 5.5 * Math.sin(t * 5.1 + p1) + 2.6 * Math.sin(t * 17.3 + p2) + (R() - 0.5) * 2.4;
      pts.push([ax + (bx - ax) * t + nx * wob, ay + (by - ay) * t + ny * wob]);
    }
    const [cx, cy] = corners[s];
    const a0 = [-Math.PI / 2, 0, Math.PI / 2, Math.PI][s];
    for (let i = 0; i < 6; i += 1) {
      const a = a0 + (Math.PI / 2) * (i / 6);
      const rr = box.r * (0.92 + R() * 0.16);
      pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
    }
  }
  return pts;
}

function tracePath(g, pts) {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i += 1) {
    g.lineTo(pts[i][0], pts[i][1]);
  }
  g.closePath();
}

/* Overspray: specks thrown outward from an edge, thinning with distance.
 * Every speck is fully opaque, because the texture is alpha tested: a soft
 * haze would be cut away whole, and a speckle survives as a speckle, which
 * is what overspray actually is. */
function specks(g, from, count, reach, R, colourAt) {
  /* One path per colour and one fill each, not a fill per speck. */
  const paths = new Map();
  for (let i = 0; i < count; i += 1) {
    const e = from[Math.floor(R() * from.length)];
    const d = e.inset + reach * (e.soft ?? 1) * R() * R();
    const x = e.x + e.nx * d + (R() - 0.5) * 2;
    const y = e.y + e.ny * d + (R() - 0.5) * 2;
    const r = R() < 0.012 ? 1.6 + R() * 1.4 : 0.45 + R() * 0.8;
    const c = colourAt(e);
    let path = paths.get(c);
    if (!path) {
      path = new Path2D();
      paths.set(c, path);
    }
    path.moveTo(x + r, y);
    path.arc(x, y, r, 0, 6.2832);
  }
  for (const [c, path] of paths) {
    g.fillStyle = c;
    g.fill(path);
  }
}

/* A run of paint: a line down from `y` that narrows, with the bead that
 * gathers at its end. The ink goes round it first, as it does round the
 * letter it ran from. */
function drip(g, x, y, len, w, colour, ink) {
  for (const [c, grow] of ink ? [[ink, 3.5], [colour, 0]] : [[colour, 0]]) {
    g.fillStyle = c;
    g.beginPath();
    g.moveTo(x - w / 2 - grow, y);
    g.quadraticCurveTo(x - w * 0.3 - grow, y + len * 0.5, x - w * 0.36 - grow, y + len);
    g.lineTo(x + w * 0.36 + grow, y + len);
    g.quadraticCurveTo(x + w * 0.3 + grow, y + len * 0.5, x + w / 2 + grow, y);
    g.closePath();
    g.fill();
    g.beginPath();
    g.ellipse(x, y + len + w * 0.12, w * 0.5 + grow, w * 0.58 + grow, 0, 0, 6.2832);
    g.fill();
  }
}

function paintMark(g, layer, R) {
  g.clearRect(0, 0, W, H);

  /* The field, and its own overspray and runs. */
  const outline = fieldOutline(R);
  const edges = outline.map((p, i) => {
    const a = outline[(i + outline.length - 1) % outline.length];
    const b = outline[(i + 1) % outline.length];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    return { x: p[0], y: p[1], nx: dy / l, ny: -dx / l, inset: -1.5 };
  });
  /* The can is not held at one distance all the way round, so the overspray
   * is not one width all the way round: a slow wander of softness along the
   * edge, crisp where the nozzle was close and misted where it was not. */
  const q1 = R() * 6.283;
  const q2 = R() * 6.283;
  edges.forEach((e, i) => {
    const t = (i / edges.length) * 6.283;
    e.soft = 0.35 + 0.65 * (0.5 + 0.3 * Math.sin(t * 3 + q1) + 0.2 * Math.sin(t * 7 + q2));
  });
  g.fillStyle = FIELD;
  tracePath(g, outline);
  g.fill();
  specks(g, edges, 5200, 28, R, () => FIELD);
  /* Where the coat went on thin or twice: soft patches inside the field, so
   * it reads as sprayed black and not as a printed sticker. source-atop, so
   * the field's alpha is left exactly as it was: laid over with source-over,
   * two dozen soft layers wore it down to 252 by rounding. */
  g.save();
  g.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < 26; i += 1) {
    const x = 60 + R() * (W - 120);
    const y = 60 + R() * (H - 120);
    const r = 40 + R() * 120;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, R() < 0.55 ? 'rgba(74, 68, 88, 0.26)' : 'rgba(0, 0, 0, 0.34)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  g.restore();
  const bottom = edges.filter((e) => e.ny > 0.7 && e.x > 120 && e.x < W - 120);
  for (let i = 0; i < 2; i += 1) {
    const e = bottom[Math.floor(R() * bottom.length)];
    drip(g, e.x, e.y - 4, 20 + R() * 24, 8 + R() * 4, FIELD, null);
  }

  /* Where the lettering is, and which way is out of it, from the layer's own
   * alpha: the same for the placeholder and for the owner's file. */
  const lg = layer.getContext('2d');
  const img = lg.getImageData(0, 0, W, H).data;
  const alpha = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : img[(y * W + x) * 4 + 3]);
  const rim = [];
  for (let y = 3; y < H - 3; y += 2) {
    for (let x = 3; x < W - 3; x += 2) {
      if (alpha(x, y) < 160) {
        continue;
      }
      const gx = alpha(x + 3, y) - alpha(x - 3, y);
      const gy = alpha(x, y + 3) - alpha(x, y - 3);
      const gl = Math.hypot(gx, gy);
      if (gl < 90) {
        continue;
      }
      const i = (y * W + x) * 4;
      rim.push({ x, y, nx: -gx / gl, ny: -gy / gl, inset: 3, c: `rgb(${img[i]}, ${img[i + 1]}, ${img[i + 2]})` });
    }
  }

  /* The ink line: the lettering's silhouette in ink, stamped round a small
   * circle, which dilates it into an outline once the paint goes on top. */
  const ink = newCanvas(W, H);
  const ig = ink.getContext('2d');
  ig.drawImage(layer, 0, 0);
  ig.globalCompositeOperation = 'source-in';
  ig.fillStyle = INK;
  ig.fillRect(0, 0, W, H);
  for (let i = 0; i < 24; i += 1) {
    const a = (i / 24) * 6.2832;
    /* Heavier down and to the right, the side a manga inker weights a line
     * on to stand a shape off its ground. */
    const r = 6 + 3.5 * Math.max(0, Math.cos(a - 0.785));
    g.drawImage(ink, Math.cos(a) * r, Math.sin(a) * r);
  }

  /* The paint, through the stencil: the lettering with a spray's grain in
   * it, a scatter of pinholes where the black shows through. */
  const coat = newCanvas(W, H);
  const cg = coat.getContext('2d');
  cg.drawImage(layer, 0, 0);
  cg.globalCompositeOperation = 'destination-out';
  cg.beginPath();
  for (let i = 0; i < 1600; i += 1) {
    const x = R() * W;
    const y = R() * H;
    const r = 0.4 + R() * 0.7;
    cg.moveTo(x + r, y);
    cg.arc(x, y, r, 0, 6.2832);
  }
  cg.fill();
  g.drawImage(coat, 0, 0);

  /* The letters' own overspray, in their own colour, past the ink. */
  if (rim.length) {
    specks(g, rim, 1500, 9, R, (e) => e.c);
  }

  /* And the odd drip: from the lowest points of the lettering, a few
   * columns apart, so each run comes off the bottom of a stroke. */
  const low = [];
  for (let x = 8; x < W - 8; x += 6) {
    for (let y = H - 8; y > 8; y -= 1) {
      if (alpha(x, y) > 200) {
        low.push({ x, y });
        break;
      }
    }
  }
  low.sort((a, b) => b.y - a.y);
  const runs = [];
  for (const p of low) {
    if (runs.length >= 3) {
      break;
    }
    if (runs.some((q) => Math.abs(q.x - p.x) < 180)) {
      continue;
    }
    runs.push(p);
  }
  for (const p of runs) {
    const i = ((p.y - 3) * W + p.x) * 4;
    drip(g, p.x, p.y - 7, 18 + R() * 30, 9 + R() * 4,
      `rgb(${img[i]}, ${img[i + 1]}, ${img[i + 2]})`, INK);
  }

  /* The alpha test is the only thing that ever reads this alpha, so settle
   * it here, where it can be looked at: a pixel is paint or it is not. The
   * canvas's own compositing leaves the field at 252 to 254 in places, which
   * is harmless under a 0.5 test and is still not what was meant. */
  const px = g.getImageData(0, 0, W, H);
  for (let i = 3; i < px.data.length; i += 4) {
    px.data[i] = px.data[i] >= 128 ? 255 : 0;
  }
  g.putImageData(px, 0, 0);
}

/* ------------------------------------------------------------------ *
 * The cache, and the file when there is one.
 * ------------------------------------------------------------------ */

let CANVAS = null;
let DATA_URL = null;
/* Every texture made from the canvas, so a logo that arrives after a map was
 * built repaints what that map already shows. A texture leaves the set when
 * its map disposes it. */
const LIVE = new Set();

function repaint(layer) {
  paintMark(CANVAS.getContext('2d'), layer, seeded(0x57f0));
  DATA_URL = null;
  for (const t of LIVE) {
    t.needsUpdate = true;
  }
}

export function stfCanvas() {
  if (CANVAS) {
    return CANVAS;
  }
  CANVAS = newCanvas(W, H);
  repaint(letteringLayer(seeded(0x5754)));
  if (STF_LOGO_URL) {
    const img = new Image();
    img.onload = () => repaint(logoLayer(img));
    /* A failed load keeps the placeholder, which is a mark rather than a
     * hole, and says so once. */
    img.onerror = () => console.warn(`stf: ${STF_LOGO_URL} did not load; the placeholder stands`);
    img.src = new URL(STF_LOGO_URL, import.meta.url).href;
  }
  return CANVAS;
}

export function stfDataUrl() {
  if (!DATA_URL) {
    DATA_URL = stfCanvas().toDataURL('image/png');
  }
  return DATA_URL;
}

/* ------------------------------------------------------------------ *
 * The mesh.
 * ------------------------------------------------------------------ */

/*
 * The town's three band cel ramp and its violet shadow tint, the same
 * numbers src/maps/city/vendored/core/toon.js gives `cel({ bands: 3, tint })`,
 * restated because this file imports nothing. The tint is the standard one
 * src/props/kit.js calls T.
 */
const RAMP = [92, 178, 255];
const TINT = 0x6f6790;
const TOON_CHUNK = 'lights_toon_pars_fragment';
const TOON_LINE = 'vec3 irradiance = getGradientIrradiance( geometryNormal, directLight.direction ) * directLight.color;';
const TOON_PATCH = `
	vec3 celBand = getGradientIrradiance( geometryNormal, directLight.direction );
	vec3 irradiance = celBand * mix( uShadowTint, vec3( 1.0 ), celBand ) * directLight.color;`;

function paintMaterial(THREE, map) {
  const data = new Uint8Array(RAMP.length * 4);
  RAMP.forEach((v, i) => data.set([v, v, v, 255], i * 4));
  const ramp = new THREE.DataTexture(data, RAMP.length, 1, THREE.RGBAFormat);
  ramp.minFilter = THREE.NearestFilter;
  ramp.magFilter = THREE.NearestFilter;
  ramp.generateMipmaps = false;
  ramp.needsUpdate = true;
  const mat = new THREE.MeshToonMaterial({
    color: 0xffffff,
    map,
    gradientMap: ramp,
    alphaTest: 0.5,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const src = THREE.ShaderChunk[TOON_CHUNK];
  if (src && src.includes(TOON_LINE)) {
    const tint = { value: new THREE.Color(TINT) };
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uShadowTint = tint;
      shader.fragmentShader = shader.fragmentShader.replace(
        `#include <${TOON_CHUNK}>`,
        `uniform vec3 uShadowTint;\n${src.replace(TOON_LINE, TOON_PATCH)}`,
      );
    };
    /* Its own key rather than toon.js's: the two patches are the same text
     * today, and a program shared on the strength of that would be a bug the
     * day one of them changes. */
    mat.customProgramCacheKey = () => `stfCelTint_${TINT.toString(16)}`;
  }
  mat.name = 'stfMark';
  return mat;
}

/*
 * The share of its own colour the paint gives back when the light is low,
 * by the look's key: enough to read the lettering and see the green T at 3
 * to 4 m, not enough to read as a lit sign. Any other look gives none.
 * STF_SHADE_GLOW is the same for paint on a face the sun never reaches,
 * dusk's share, and the paint takes whichever of the two is more.
 */
const STF_GLOW = { dusk: 0.3, overcast: 0.12 };
const STF_SHADE_GLOW = 0.3;

export function makeStfMark(THREE, { width, height, look = null, shade = false } = {}) {
  const map = new THREE.CanvasTexture(stfCanvas());
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  map.wrapS = THREE.ClampToEdgeWrapping;
  map.wrapT = THREE.ClampToEdgeWrapping;
  /* Letterboxed, never stretched: the canvas's own border is transparent,
   * and clamping repeats it across the margin. */
  const a = width / height;
  if (a > ASPECT * 1.001) {
    map.repeat.x = a / ASPECT;
    map.offset.x = (1 - map.repeat.x) / 2;
  } else if (a < ASPECT / 1.001) {
    map.repeat.y = ASPECT / a;
    map.offset.y = (1 - map.repeat.y) / 2;
  }
  LIVE.add(map);
  map.addEventListener('dispose', () => LIVE.delete(map));

  const mat = paintMaterial(THREE, map);
  const byLook = (look && STF_GLOW[look.key]) || 0;
  const glow = shade && STF_SHADE_GLOW > byLook ? STF_SHADE_GLOW : byLook;
  if (glow) {
    mat.emissive.set(0xffffff);
    mat.emissiveMap = map;
    mat.emissiveIntensity = glow;
  }
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.renderOrder = 1;
  mesh.name = 'stfMarkTrim';
  mesh.userData.stf = true;
  mesh.userData.noOutline = true;
  return mesh;
}
