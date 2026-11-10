/*
 * comic.js: the comic book layer, hatching and paint grit on every toon
 * surface in every map.
 *
 * The owner's ask of 2026-10-07: move the whole game toward Borderlands.
 * What makes that look is not the outline alone. It is that shadow is
 * DRAWN: a shaded face carries pen strokes, a deep shadow carries two
 * crossing sets of them, and a lit face carries the faint mottle of a
 * painted texture rather than a flat fill. This file adds both to the
 * lighting of MeshToonMaterial itself, so the race field (celmat.js), the
 * town and a built map (the vendored toon.js) all get the same hand with
 * one edit and no new pass and no new target. Its two textures, the
 * ground's detail map (pass 12) and the noise lattice (the low end pass,
 * src/render/lattice.js), are generated in code.
 *
 * WHY THE PROTOTYPE AND NOT EACH CALL SITE. The field builds its toon
 * materials through celMaterial and the freestyle maps through the
 * vendored cel(), and both install their own onBeforeCompile on every
 * material. The vendored file stays byte identical (CLAUDE.md, and the
 * PATCH-*.diff files beside it), so it cannot be edited to call this. So
 * MeshToonMaterial's prototype gets an accessor for onBeforeCompile: an
 * assignment stores the caller's hook, a read returns a hook that runs the
 * caller's and then adds the comic chunk. Every toon material in the game
 * therefore gets the chunk whoever built it, and every caller's own hook
 * still runs first and unchanged.
 *
 * THE PROGRAM CACHE KEY is wrapped the same way, and that is not optional.
 * three's default key is onBeforeCompile.toString(), and every read of the
 * accessor returns the same wrapper, so without this two materials whose
 * own hooks differ would hand each other a linked program: the bug
 * celmat.js's long comment on customProgramCacheKey describes. The wrapped
 * key is the caller's own key, or the caller's hook's source where it set
 * no key, with a suffix. The chunk is either compiled in or, on Low, not
 * (chunkOn below), and where it is, the brush marks, the grime and its
 * cracks are compiled in only where they draw (chunkVariant); every other
 * knob is a uniform. The suffix says all of that, so it is the whole truth
 * about the chunk a program carries.
 *
 * SHARED UNIFORMS. Each material's hook assigns the same uniform OBJECTS
 * from COMIC below, so one write here reaches every compiled toon program
 * at once, and the preset's level (setComicQuality) takes effect on the
 * next frame without a recompile. Between presets it takes a recompile,
 * because Low compiles none of it and only High the brush marks, and a
 * preset change builds the world again anyway.
 *
 * THE STROKES are world space, so they stay on the surface as the camera
 * moves rather than swimming across it, and they are kept a constant width
 * and spacing ON SCREEN: the stroke coordinate's screen derivative picks an
 * octave, two octaves are blended, and the width is measured in pixels. A
 * stroke a metre from the lens and one eighty metres away are the same pen.
 * Which way they run comes from the dominant axis of the world normal, the
 * cheap half of triplanar mapping, which is what a comic artist does too:
 * walls get one direction, floors another.
 *
 * WHERE IS SHADOW. The toon lighting has already worked out what the sun
 * gave this fragment (directDiffuse, after the ramp and the shadow map).
 * Divided by what the sun WOULD give this colour square on and unshadowed
 * (the first directional light's colour through the same Lambert term),
 * that is the ramp's own band times the shadow map: about one lit, about a
 * third on the dark side of either map's ramp, zero in a cast shadow,
 * whatever the map's sun strength or sky. The first version used the sun's
 * share of sun plus sky instead, and the field's strong sun put its dark
 * side at 0.79 of that, so the field's trees never got a stroke. That
 * fraction is the tone, and the strokes are its ink.
 *
 * Render only. Nothing here reads or writes the physics state. The one
 * texture (the ground's detail map, pass 12, further down) is generated
 * here from a fixed seed and sampled by scene materials, never by a full
 * screen pass, so the budget's P4 cannot move.
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

import * as THREE from 'three';
import { latticeMap, LATTICE_N } from './lattice.js';

/*
 * The knobs, as shared uniform objects. hatch and grit are 0 to 1 and are
 * what a preset sets; the rest are the look.
 *
 * litLo and litHi bracket the sun's share of the light over which strokes
 * come in: above litHi a face is lit and clean, below litLo it is in full
 * shadow and carries both sets.
 */
/*
 * THE EASED PEN (2026-10-09). Testers called the look busy: bubbly trees,
 * scribbled shadows. Every strength of the inking and pen work is one named
 * constant below, set to about half what graphics passes 1 to 25 left it, so
 * a further tweak is one line. The first number in each comment is what it
 * was. All are literals in the shader or values of an existing uniform, so
 * the arithmetic and the program are what they were: no frame time moves.
 */
/* How far a hatch stroke darkens what is under it. Was 0.78. */
export const HATCH_DEPTH = 0.39;
/* The brush marks on a lit wall, as a share of the colour taken away.
 * Was 0.11. High only. */
export const BRUSH_STRENGTH = 0.055;
/* The leaf clumps' light and shade on a canopy, as a factor on the swing
 * the detail map gives. Was 1. */
export const FOLIAGE_CLUMP = 0.5;
/* The paved ground's stains and their tide line, and the ink in a crack.
 * Were 0.08, 0.12 and 0.85. */
export const GRIME_STAIN = 0.04;
export const GRIME_TIDE = 0.06;
export const CRACK_INK = 0.42;
/* The outer line's opacity, as a factor on the line (post.js and the
 * freestyle ink). Was 1. */
export const SIL_STRENGTH = 0.5;

export const COMIC = {
  hatch: { value: 1 },
  grit: { value: 1 },
  brush: { value: 1 },
  ink: { value: new THREE.Color(0x0b0c12) },
  litLo: { value: 0.40 },
  litHi: { value: 0.62 },
  /* How far a stroke darkens what is under it, and its width in pixels. */
  depth: { value: HATCH_DEPTH },
  width: { value: 1.9 },
  /* Spacing between strokes on screen, in pixels. */
  period: { value: 11.0 },
  /* Where the strokes thin out with distance, in metres. */
  fadeNear: { value: 70 },
  fadeFar: { value: 160 },
  /* The ground's detail map (pass 12): 0 until a preset that keeps it has
   * built the texture, so a page that never sets a preset samples nothing. */
  detail: { value: 0 },
  detailMap: { value: null },
  /* The noise lattice (src/render/lattice.js), set when the first program
   * that reads it is compiled, so Low never builds it. */
  noise: { value: null },
  /* 1 where a map's ground cannot be marked material by material, and its
   * up facing surfaces are told apart by colour instead. See GROUND. */
  groundAuto: { value: 0 },
  /* 1 where the map's ink draws edge highlights and wants each surface's
   * light in the scene's alpha. See EDGE HIGHLIGHTS. */
  edge: { value: 0 },
  /* 1 where a built map's paved ground takes stains, 2 where it takes
   * cracks as well. See GRIME. */
  grime: { value: 0 },
};

/*
 * GROUND. The detail map and the field's patches go on ground, and what is
 * ground is said, not guessed: a material is ground when its
 * userData.comicGround is true. Read at every draw, so a mark set after the
 * first frame still counts, and a clone made by Material.copy carries it.
 *
 * Guessed from colour, which is what pass 12 did, green paint was turf: the
 * yard's green containers had a lawn on their roofs. Marked, a green roof is
 * a roof. Inside a marked material colour still decides between the two
 * kinds of ground, because the field's terrain is one material painted grass
 * and rock by its vertices.
 *
 * The town cannot be marked this way. Its bake folds colour into vertices
 * and merges every material that differs only in colour into one, so its
 * roads, its walls and its cars come out of the bake as the same material,
 * and keeping ground apart would split those merges into more draw calls,
 * which is the thing the town is shortest of. The town says so with
 * setComicQuality(q, { groundAuto: true }), and there every surface that
 * faces up is ground and colour decides which kind, as in pass 12.
 */
export function markGround(root) {
  root.traverse((o) => {
    if (!o.isMesh) {
      return;
    }
    const list = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of list) {
      if (m) {
        m.userData.comicGround = true;
      }
    }
  });
}

/* Per preset. Low is the phone and the machine with no usable GPU, which
 * have already given up shadows and ink for fill rate; it keeps none of
 * this, and compiles none of it (chunkOn, below). The occlusion, the outer
 * line, the brush marks and the ground's cracks are High's alone, and the
 * edge highlights and the ground's stains Medium's and High's
 * (setComicQuality). The brush marks, the grime and its cracks are
 * compiled in only where they draw (chunkVariant); the rest are guarded in
 * the shader by a uniform branch, which a GPU skips. */
const LEVELS = {
  low: { hatch: 0, grit: 0, brush: 0, detail: 0 },
  /* Medium is the integrated laptop: strokes and grit, not the brush
   * marks, which are the most arithmetic for the least picture. It keeps
   * the ground's detail map: two fetches of a small cached texture is
   * cheap, and it is what tells a pilot how fast the ground is going by. */
  medium: { hatch: 1, grit: 1, brush: 0, detail: 1 },
  high: { hatch: 1, grit: 1, brush: 1, detail: 1 },
};

/*
 * WHETHER THE CHUNK IS COMPILED IN AT ALL. Low draws none of it, and until
 * the sweep after graphics pass 25 it was compiled into every toon program
 * there anyway, with its knobs at zero, so the machines that boot on Low (a
 * phone, a laptop with no usable GPU) paid for strokes nobody drew. Measured
 * in headless Chromium, whose renderer is software, the whoop room on Low
 * drew a frame in 231 to 246 ms where main drew it in 112 to 117, with the
 * same draw calls and triangles, and with the chunk compiled out it draws
 * in 108 to 110, where main drew in 110 to 115 in the same run. So on Low
 * the hook adds nothing and the program is main's, and the program cache
 * key below says which of the two a material has. A material that outlives
 * a world (the craft) is compiled again in the next one: see
 * evictSessionRoots in src/render/shell.js.
 */
/*
 * THE LAYER'S PER PIXEL WORK IS OFF ON EVERY PRESET (owner, 2026-10-09:
 * latency is the most important thing, and "if it increases latency then we
 * need to bin it and rethink the art style"). Medium and High took 1.6 to 3.0
 * times main's frame in the sweep above, and an integrated laptop boots on
 * Medium. While this is false every preset behaves as Low does: no toon chunk
 * is compiled, no edge highlight, grime, occlusion or streak cloud, and the
 * ink is the pass main had. The code stays so the art can be rethought from
 * it; the geometry (models, clumps) is not behind this flag.
 */
export const COMIC_SHADING = false;
let chunkOn = COMIC_SHADING;
export function comicChunkOn() {
  return chunkOn;
}

export function setComicQuality(q, { groundAuto = false, edges = false, grime = false } = {}) {
  const id = COMIC_SHADING && q && q.id ? q.id : (COMIC_SHADING ? 'high' : 'low');
  chunkOn = id !== 'low';
  /* Every map sets these when it builds, so leaving the town clears them. */
  COMIC.groundAuto.value = groundAuto ? 1 : 0;
  COMIC.edge.value = edges && id !== 'low' ? 1 : 0;
  COMIC.grime.value = grime && id !== 'low' ? (id === 'high' ? 2 : 1) : 0;
  const lv = LEVELS[id] || LEVELS.high;
  COMIC.hatch.value = lv.hatch;
  COMIC.grit.value = lv.grit;
  COMIC.brush.value = lv.brush;
  /* Built on the first preset that keeps it and never on Low, which
   * neither allocates nor uploads it. */
  if (lv.detail > 0 && !COMIC.detailMap.value) {
    COMIC.detailMap.value = buildDetailMap();
  }
  COMIC.detail.value = COMIC.detailMap.value ? lv.detail : 0;
  aoOn = id === 'high';
  /* The outer line is the one piece of the layer High draws again (owner,
   * 2026-11-10: "can increase system demand at high"): four depth fetches
   * in the freestyle ink pass, asked for by the preset's own `outerLine`
   * (src/render/quality.js) and by nothing else, so Low and Medium, whose
   * presets say false, still get the ink pass main had. */
  silOn = id === 'high' || Boolean(q && q.city && q.city.outerLine === true);
  edgesOn = id !== 'low';
}

/*
 * THE GROUND'S DETAIL MAP (pass 12).
 *
 * Seen from a quad a metre or two up, the ground is most of the frame, and
 * a flat fill there is the plainest thing on screen: it is also what tells
 * a pilot how fast the world is going by. The grit and the patches above
 * vary it over metres; what was missing is the texture of the stuff itself,
 * a turf's blades and a road's stones, at centimetres.
 *
 * Three tries at painting grass in the shader alone failed (pass 9, in
 * PROGRESS.md), all for the same reason: a pattern finer than a pixel has
 * to be faded by hand where the ground is foreshortened, which is
 * everywhere a pilot looks, and the fade ate it. A texture with mipmaps and
 * anisotropic filtering does that fade properly, so this is one: 512 square,
 * generated here at the first preset that wants it, from a fixed seed of
 * its own (never the world's rng, which plants the colliders), with no
 * trigonometry so every engine paints the same pixels. Each channel is
 * settled to a mean of exactly one half, so the coarsest mip is neutral and
 * the far field keeps the colour it had.
 *
 *   r  turf: short tapered strokes in every direction, light and dark,
 *      over a soft clumping. Painted blades, not photographed ones.
 *   g  aggregate: small light and dark stones in a mottle, for asphalt,
 *      concrete, dirt and sand.
 *   b  the turf strokes' hue, warm (dry) or cool (lush), so a lawn up close
 *      is several greens, which is how a painter does one.
 *   a  leaf clumps (pass 13): overlapping discs, each lighter at its top and
 *      inked along its lower edge, each laid over the ones before it, which
 *      is the scalloped canopy a comic draws for a tree. Up is +v, so a
 *      clump hangs the right way up on a canopy's side.
 */
const DETAIL_N = 512;

function buildDetailMap() {
  const N = DETAIL_N;
  let seed = 0x2f6b9d13;
  const rnd = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const turf = new Float32Array(N * N).fill(0.5);
  const stone = new Float32Array(N * N).fill(0.5);
  const hue = new Float32Array(N * N).fill(0.5);

  /* Value noise on a lattice that wraps, so the tile repeats seamlessly. */
  const mottle = (buf, cells, amp) => {
    const g = new Float32Array(cells * cells);
    for (let i = 0; i < g.length; i += 1) {
      g[i] = rnd() - 0.5;
    }
    for (let y = 0; y < N; y += 1) {
      const fy = (y / N) * cells;
      const iy = Math.floor(fy);
      let ty = fy - iy;
      ty = ty * ty * (3 - 2 * ty);
      const y0 = iy % cells;
      const y1 = (iy + 1) % cells;
      for (let x = 0; x < N; x += 1) {
        const fx = (x / N) * cells;
        const ix = Math.floor(fx);
        let tx = fx - ix;
        tx = tx * tx * (3 - 2 * tx);
        const x0 = ix % cells;
        const x1 = (ix + 1) % cells;
        const a = g[y0 * cells + x0] + (g[y0 * cells + x1] - g[y0 * cells + x0]) * tx;
        const b = g[y1 * cells + x0] + (g[y1 * cells + x1] - g[y1 * cells + x0]) * tx;
        buf[y * N + x] += (a + (b - a) * ty) * amp;
      }
    }
  };

  /* One tapered stroke from its centre along a unit direction, wrapped at
   * the tile's edges; `tint` writes the same coverage into the hue. */
  const stroke = (buf, cx, cy, ux, uy, len, hw, val, alpha, tint) => {
    const ax = cx - ux * len * 0.5;
    const ay = cy - uy * len * 0.5;
    const r = Math.ceil(len * 0.5 + hw + 1);
    const bx = Math.floor(cx);
    const by = Math.floor(cy);
    for (let oy = -r; oy <= r; oy += 1) {
      for (let ox = -r; ox <= r; ox += 1) {
        const px = bx + ox + 0.5;
        const py = by + oy + 0.5;
        let t = ((px - ax) * ux + (py - ay) * uy) / len;
        t = t < 0 ? 0 : (t > 1 ? 1 : t);
        const qx = ax + ux * len * t - px;
        const qy = ay + uy * len * t - py;
        const d = Math.sqrt(qx * qx + qy * qy);
        const taper = 1 - (2 * t - 1) * (2 * t - 1);
        const w = hw * (0.3 + 0.7 * taper);
        const cov = Math.min(1, Math.max(0, w + 0.5 - d)) * alpha;
        if (cov <= 0) {
          continue;
        }
        const k = (((by + oy) % N + N) % N) * N + (((bx + ox) % N + N) % N);
        buf[k] += (val - buf[k]) * cov;
        if (tint !== null) {
          hue[k] += (tint - hue[k]) * cov;
        }
      }
    }
  };

  /* A unit direction without trigonometry: a point in the unit disc,
   * rejected until it is not near the centre, then normalised. */
  const dir = () => {
    for (;;) {
      const x = rnd() * 2 - 1;
      const y = rnd() * 2 - 1;
      const m = x * x + y * y;
      if (m > 0.04 && m <= 1) {
        const s = 1 / Math.sqrt(m);
        return [x * s, y * s];
      }
    }
  };

  /* Dense and layered, three tones laid over each other until no flat
   * ground shows between them: sparse strokes on a flat grey read as hay
   * or pine needles, not as a lawn. */
  mottle(turf, 8, 0.10);
  mottle(turf, 32, 0.08);
  for (let i = 0; i < 26000; i += 1) {
    const [ux, uy] = dir();
    const tone = rnd();
    const val = tone < 0.35 ? 0.24 + rnd() * 0.16 : (tone < 0.7 ? 0.55 + rnd() * 0.15 : 0.75 + rnd() * 0.13);
    const tint = tone < 0.35 ? rnd() * 0.45 : 0.4 + rnd() * 0.6;
    stroke(turf, rnd() * N, rnd() * N, ux, uy, 4 + rnd() * 6, 0.5 + rnd() * 0.5, val, 0.75, tint);
  }

  mottle(stone, 16, 0.12);
  mottle(stone, 64, 0.06);
  for (let i = 0; i < 26000; i += 1) {
    const [ux, uy] = dir();
    const light = rnd() < 0.4;
    const val = light ? 0.66 + rnd() * 0.2 : 0.14 + rnd() * 0.2;
    /* A stone is a stroke as long as it is wide. */
    const r = 0.5 + rnd() * 1.2;
    stroke(stone, rnd() * N, rnd() * N, ux, uy, r * (1 + rnd()), r, val, 0.8, null);
  }

  /* Clumps of two sizes, big ones first so the small ones sit on them:
   * a canopy reads as masses with smaller masses on their edges. Each
   * clump's rim is lobed by value noise read round it (a 32 square
   * lattice, wrapping), so it is a bunch of leaves and not a coin. */
  const leaf = new Float32Array(N * N).fill(0.5);
  const LOBE = 32;
  const lobes = new Float32Array(LOBE * LOBE);
  for (let i = 0; i < lobes.length; i += 1) {
    lobes[i] = rnd();
  }
  const lobe = (x, y) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    let tx = x - ix;
    let ty = y - iy;
    tx = tx * tx * (3 - 2 * tx);
    ty = ty * ty * (3 - 2 * ty);
    const at = (a, b) => lobes[(((b % LOBE) + LOBE) % LOBE) * LOBE + (((a % LOBE) + LOBE) % LOBE)];
    const a = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * tx;
    const b = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * tx;
    return a + (b - a) * ty;
  };
  for (let i = 0; i < 900; i += 1) {
    const cx = rnd() * N;
    const cy = rnd() * N;
    const R = i < 300 ? 22 + rnd() * 14 : 11 + rnd() * 10;
    const base = 0.44 + rnd() * 0.14;
    /* Not every clump is inked, and not with the same pen: a line round
     * every one reads as fish scales. */
    const pen = rnd() < 0.62 ? 1.5 + rnd() * 1.3 : 0;
    const ink = 0.7 + rnd() * 0.3;
    const lx = rnd() * LOBE;
    const ly = rnd() * LOBE;
    const reach = Math.ceil(R * 1.2 + 1);
    const bx = Math.floor(cx);
    const by = Math.floor(cy);
    for (let oy = -reach; oy <= reach; oy += 1) {
      for (let ox = -reach; ox <= reach; ox += 1) {
        const dx = bx + ox + 0.5 - cx;
        const dy = by + oy + 0.5 - cy;
        const d = Math.sqrt(dx * dx + dy * dy);
        /* The rim's radius in this pixel's direction: the noise is read at
         * the unit direction scaled up, so a round trip crosses a few
         * lattice cells and the rim has four to six lobes. */
        const inv = d > 1e-6 ? 1 / d : 0;
        const Rl = R * (0.84 + 0.3 * lobe(lx + dx * inv * 2.6, ly + dy * inv * 2.6));
        const cov = Math.min(1, Math.max(0, Rl + 0.5 - d));
        if (cov <= 0) {
          continue;
        }
        /* -1 at the clump's foot, 1 at its crown. */
        const up = dy / R;
        let v = base + up * 0.19;
        /* The pen along the foot: the lower half of the rim, heaviest
         * straight underneath and lifting off towards the sides. */
        if (pen > 0) {
          const edge = Math.min(1, Math.max(0, (d - (Rl - pen)) / 1.2));
          const foot = Math.min(1, Math.max(0, (0.1 - up) / 0.5));
          v += (0.06 - v) * edge * foot * ink;
        }
        const k = (((by + oy) % N + N) % N) * N + (((bx + ox) % N + N) % N);
        leaf[k] += (v - leaf[k]) * cov;
      }
    }
  }

  /* Settle each channel to a mean of one half at a set spread, so the
   * coarsest mip is neutral whatever the strokes added up to. */
  const settle = (buf, spread) => {
    let m = 0;
    for (let i = 0; i < buf.length; i += 1) {
      m += buf[i];
    }
    m /= buf.length;
    let v = 0;
    for (let i = 0; i < buf.length; i += 1) {
      v += (buf[i] - m) * (buf[i] - m);
    }
    const k = v > 0 ? spread / Math.sqrt(v / buf.length) : 0;
    for (let i = 0; i < buf.length; i += 1) {
      buf[i] = 0.5 + (buf[i] - m) * k;
    }
  };
  settle(turf, 0.15);
  settle(stone, 0.13);
  settle(hue, 0.16);
  settle(leaf, 0.17);

  const data = new Uint8Array(N * N * 4);
  const byte = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));
  for (let i = 0; i < N * N; i += 1) {
    data[i * 4] = byte(turf[i]);
    data[i * 4 + 1] = byte(stone[i]);
    data[i * 4 + 2] = byte(hue[i]);
    data[i * 4 + 3] = byte(leaf[i]);
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  /* Clamped to what the GPU offers. Anisotropy is what keeps the strokes
   * sharp along a road seen at a grazing angle instead of a blur. */
  tex.anisotropy = 8;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/* The heavier pen for the ink passes, as a factor on each pipeline's own
 * line width. 1 is the line before this file. Was 1.55 until the eased pen
 * (HATCH_DEPTH, above). */
export const INK_WEIGHT = 1.25;
/* The ink itself: near black with a breath of blue, so it reads as ink on
 * paper rather than as a hole in the frame. */
export const INK_COLOR = 0x0d0f16;

/*
 * THE OUTER LINE (pass 16): an object's outline drawn with a heavier pen
 * than the lines inside it, which is the most recognisable thing about the
 * look the owner named. Both ink passes found a silhouette and a crease
 * with one pen at one reach, so every line in the frame was one weight.
 *
 * Four more depth taps, each SIL_REACH times as far out as one of the
 * pass's own four, ask one question per direction: is the centre the near
 * side of a silhouette within that wider reach? Through the centre and its
 * near tap goes a plane, in inverse depth, which is what a plane is linear
 * in across the screen. On any plane at any angle the wide tap lies where
 * that plane predicts and the residual is zero, so a road at a grazing
 * angle stays clean, where a plain difference of depth would ink it. Across
 * a ridge, where depth is continuous, the residual is a few hundredths.
 * Across a silhouette it is about half the share by which the centre is
 * nearer than what stands behind it, and against the sky that share is
 * all of it. The second test, that the wide tap lies well behind the
 * centre, keeps the line on the object's own side of its silhouette: the
 * background beside an object is never the near side of anything.
 *
 * So a silhouette is inked SIL_REACH reaches deep and a crease one reach,
 * and the heaviest lines are where an object stands against the sky or
 * against something far behind it, which is how a comic artist weights
 * them. Each pass fades it with distance in its own way (the field's much
 * nearer, see src/render/post.js). High only, as the occlusion is: four
 * taps. The including shader defines COMIC_SIL_DEPTH(uv) as the linear
 * view depth in metres at uv.
 */
export const SIL_REACH = 1.8;
export const SIL_GLSL = /* glsl */ `
  /* dc the centre's depth, dn its near tap's, uvw the wide tap one
   * SIL_REACH further out the same way. */
  float comicSilDir( float dc, float dn, vec2 uvw ) {
    float dw = COMIC_SIL_DEPTH( uvw );
    float res = abs( ( dc / dn - 1.0 ) - ( dc / dw - 1.0 ) * ${(1 / SIL_REACH).toFixed(6)} );
    return min( res, 1.0 - dc / dw );
  }
  /* The four directions' answers, s1 opposite s2 and s3 opposite s4, less
   * an allowance q for the depth's own precision. Most of a line by a
   * background a third again as far as the object, all of one against the
   * sky. None where BOTH ends of a pair are past a silhouette, because then
   * the object is thinner than the wider reach either side: a tube, a pole,
   * a sign seen from far off. The line one reach deep already draws its
   * edges, and the outer line would fill it in, which took a gate's pale
   * frame to a black bar at fifty metres. */
  float comicSilEdge( float s1, float s2, float s3, float s4, float q ) {
    float s = max( max( s1, s2 ), max( s3, s4 ) );
    float thin = max( min( s1, s2 ), min( s3, s4 ) );
    return smoothstep( 0.10, 0.18, s - q ) * ( 1.0 - smoothstep( 0.10, 0.18, thin - q ) );
  }
`;

const MARK = '/* COMIC_V1 */';
const KEY = '|comic1';

/*
 * ONE PROGRAM FOR EVERY SHADOW TINT.
 *
 * The town's cel factory (maps/city/vendored/core/toon.js) keys its program
 * on the tint's hex, 'celTint_6a5a78', although the tint reaches the shader
 * as a uniform on each material (uShadowTint, from onBeforeCompile) and the
 * GLSL it compiles is the same text for every tint. Keyed that way three
 * compiled and linked the same program again for each tint a building, a
 * roof or a prop happened to carry: 102 programs for 27 distinct shader
 * sources in the yard, 128 for about 44 in the town, counted by hashing the
 * source of every program at link. Each is a compile that blocks the main
 * thread the first time something wearing that tint is drawn, which is why
 * the first seconds of a flight and the first turn toward a new street
 * stalled: the tint a prop wore decided whether its program existed yet.
 *
 * The program is the same, the uniform is not. Every material keeps its own
 * tint (it lives in the uniform object its own hook assigned, and three
 * uploads a material's uniforms whenever the material changes), so a
 * shared program draws every tint exactly as its own did. What does tell
 * two materials apart is a look, not a program, and the town's bake keeps
 * asking the unfolded key for that (see lookKey in maps/city/bake.js).
 *
 * The file cannot be changed at the source: it is vendored and stays
 * byte identical to its patched self, and this wrapper is where every toon
 * key already passes.
 */
const TINT_KEY = /^celTint_[0-9a-f]{6}$/;
function programKey(own) {
  return TINT_KEY.test(own) ? 'celTint' : own;
}

const VERT_HEAD = /* glsl */ `
varying vec3 vComicWorld;
flat varying float vComicBlob;
#ifdef COMIC_BLOB_BAKED
  /* A baked blob's code, the same value on every vertex of one blob (the
   * kit's leaf, graphics pass 23). */
  attribute float comicBlob;
#endif
/* The blob code below: where the object's origin stands, on an eighth of a
 * metre grid, hashed. Every vertex of one instance computes it from the
 * same matrices, so it is the same bits on all of them. */
float comicBlobCode( vec3 c ) {
  vec3 p3 = fract( floor( c * 8.0 ) * vec3( 0.1031, 0.1030, 0.0973 ) );
  p3 += dot( p3, p3.yzx + 33.33 );
  return fract( ( p3.x + p3.y ) * p3.z );
}
`;

const VERT_BODY = /* glsl */ `
  {
    vec4 comicW = vec4( transformed, 1.0 );
    vec4 comicO = vec4( 0.0, 0.0, 0.0, 1.0 );
    #ifdef USE_BATCHING
      comicW = batchingMatrix * comicW;
      comicO = batchingMatrix * comicO;
    #endif
    #ifdef USE_INSTANCING
      comicW = instanceMatrix * comicW;
      comicO = instanceMatrix * comicO;
    #endif
    vComicWorld = ( modelMatrix * comicW ).xyz;
    #ifdef COMIC_BLOB_BAKED
      vComicBlob = comicBlob;
    #else
      vComicBlob = comicBlobCode( ( modelMatrix * comicO ).xyz );
    #endif
  }
`;

const FRAG_HEAD = /* glsl */ `
${MARK}
varying vec3 vComicWorld;
flat varying float vComicBlob;
uniform float uComicBlob;
uniform float uComicHatch;
uniform float uComicGrit;
uniform float uComicBrush;
uniform vec3 uComicInk;
uniform float uComicLitLo;
uniform float uComicLitHi;
uniform float uComicDepth;
uniform float uComicWidth;
uniform float uComicPeriod;
uniform float uComicFadeNear;
uniform float uComicFadeFar;
uniform float uComicDetail;
uniform sampler2D uComicDetailMap;
uniform sampler2D uComicNoise;
uniform float uComicGround;
uniform float uComicGroundAuto;
uniform float uComicFoliage;
uniform float uComicEdge;
uniform float uComicGrime;
/* How much sun this surface has, for the ink's edge highlights: written
 * by comicShade, read by FRAG_TAIL. */
float comicLit = 0.0;

/* No sine: a sine's precision is the driver's, and a stroke should land in
 * the same place on every GPU. */
float comicHash( vec2 p ) {
  vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
  p3 += dot( p3, p3.yzx + 33.33 );
  return fract( ( p3.x + p3.y ) * p3.z );
}
/* Value noise, its four corners in one fetch of the lattice
 * (src/render/lattice.js), where it was four hashes until the low end pass.
 * A texelFetch takes no derivative, so it is safe in the per pixel branches
 * below. */
float comicNoise( vec2 p ) {
  vec2 i = floor( p );
  vec2 f = fract( p );
  f = f * f * ( 3.0 - 2.0 * f );
  vec4 c = texelFetch( uComicNoise, ivec2( mod( i, ${LATTICE_N.toFixed(1)} ) ), 0 );
  return mix( mix( c.x, c.y, f.x ), mix( c.z, c.w, f.x ), f.y );
}

#ifdef COMIC_CRACKS
/* comicNoise with its slope: the value (x) and its gradient (yz), so the
 * grime can carry a pixel's footprint through a wander it computes only
 * where a crack can be (GRIME, in comicShade). */
vec3 comicNoiseD( vec2 p ) {
  vec2 i = floor( p );
  vec2 f = fract( p );
  vec2 u = f * f * ( 3.0 - 2.0 * f );
  vec4 c = texelFetch( uComicNoise, ivec2( mod( i, ${LATTICE_N.toFixed(1)} ) ), 0 );
  float k = c.x - c.y - c.z + c.w;
  return vec3( c.x + ( c.y - c.x ) * u.x + ( c.z - c.x ) * u.y + k * u.x * u.y,
               6.0 * f * ( 1.0 - f ) * vec2( c.y - c.x + k * u.y, c.z - c.x + k * u.x ) );
}

/* Two hashes from one, for the grime's cells (GRIME, in comicShade). */
vec2 comicHash2( vec2 p ) {
  vec3 p3 = fract( vec3( p.xyx ) * vec3( 0.1031, 0.1030, 0.0973 ) );
  p3 += dot( p3, p3.yzx + 33.33 );
  return fract( ( p3.xx + p3.yz ) * p3.zy );
}

/* Cracks: the edges of a jittered grid of cells. Returns how far a point
 * is from the edge between its nearest two cells, in cells (x), whether
 * that edge is kept (y), and the edge's normal (zw), which is what turns
 * the distance into pixels: the distance itself folds at the edge, so its
 * own screen derivative vanishes on the line and drew it as dashes. An edge
 * is kept or dropped by a hash of the two cells it parts, the same from
 * either side, so what is left is not a net but broken runs of joined
 * segments that fork and stop at a corner, which is how a slab cracks. */
vec4 comicCrack( vec2 x ) {
  vec2 n = floor( x );
  vec2 f = x - n;
  float d1 = 8.0;
  float d2 = 8.0;
  vec2 r1 = vec2( 0.0 );
  vec2 r2 = vec2( 0.0 );
  vec2 c1 = n;
  vec2 c2 = n;
  for ( int j = -1; j <= 1; j++ ) {
    for ( int i = -1; i <= 1; i++ ) {
      vec2 g = vec2( float( i ), float( j ) );
      vec2 r = g + 0.08 + comicHash2( n + g ) * 0.84 - f;
      float d = dot( r, r );
      if ( d < d1 ) {
        d2 = d1;
        r2 = r1;
        c2 = c1;
        d1 = d;
        r1 = r;
        c1 = n + g;
      } else if ( d < d2 ) {
        d2 = d;
        r2 = r;
        c2 = n + g;
      }
    }
  }
  vec2 e = normalize( r2 - r1 );
  return vec4( dot( ( r1 + r2 ) * 0.5, e ), step( comicHash( c1 + c2 + 0.37 ), 0.3 ), e );
}
#endif

/* Coverage of one set of parallel strokes at one octave: x is the stroke
 * coordinate (one stroke per unit), fw its screen derivative, w the pen in
 * pixels. */
float comicLine( float x, float y, float fw, float w ) {
  float px = abs( fract( x ) - 0.5 ) / fw;
  float cov = 1.0 - smoothstep( w * 0.5 - 0.5, w * 0.5 + 0.5, px );
  /* Broken into dashes along the stroke, each stroke its own: a pen lifts,
   * a ruler does not, and unbroken lines read as a printed mesh. */
  float sx = floor( x );
  float sy = floor( y * 0.42 + comicHash( vec2( sx, 3.7 ) ) );
  return cov * step( 0.3, comicHash( vec2( sx, sy ) ) );
}

/*
 * One set of strokes, held at uComicPeriod pixels apart at any range. x0 is
 * the stroke coordinate at one stroke per metre; the octave that puts the
 * spacing nearest the period is drawn, blended into the next one up as the
 * range grows, so strokes neither pop nor crowd. The pen's weight wanders
 * with a world noise, which is the difference between a pen and a ruler.
 */
float comicSet( float x0, float y0, float fw0, float wobble, float weight, float period ) {
  float lod = clamp( log2( period * fw0 ), -3.0, 10.0 );
  float lf = floor( lod );
  float t = lod - lf;
  float sA = exp2( -lf );
  float a = comicLine( ( x0 + wobble ) * sA, y0 * sA, fw0 * sA, uComicWidth * weight );
  float b = comicLine( ( x0 + wobble ) * sA * 0.5, y0 * sA * 0.5, fw0 * sA * 0.5, uComicWidth * weight );
  return mix( a, b, t );
}

vec3 comicShade( vec3 col, vec3 direct, vec3 sunFull, vec3 nView, vec3 viewPos ) {
  vec3 p = vComicWorld;
  vec3 wn = abs( inverseTransformDirection( nView, viewMatrix ) );
  /* The plane the strokes are drawn in: the one the surface faces most. */
  vec2 q = wn.y > max( wn.x, wn.z ) ? p.xz : ( wn.x > wn.z ? p.zy : p.xy );
  float dist = length( viewPos );
  float fade = 1.0 - smoothstep( uComicFadeNear, uComicFadeFar, dist );
  /*
   * How square on the surface is to the eye. Strokes laid in the world on
   * a wall or a road seen nearly edge on are foreshortened into lines
   * running to the vanishing point, packed tight, and the crossing set
   * then reads as a net stretched over the street (pass 11, the town's
   * alleys). An artist does not hatch a plane seen edge on, so the
   * strokes thin out below about twenty degrees of facing.
   */
  float facing = abs( dot( normalize( nView ), normalize( viewPos ) ) );
  float square = smoothstep( 0.12, 0.38, facing );
  /* Ground, marked or, in the town, everything (GROUND, above). */
  float ground = max( uComicGround, uComicGroundAuto );

  /* The sun on this surface, for the ink's edge highlights (EDGE
   * HIGHLIGHTS, below): its share of the light, as the hatching reads it,
   * so a face in a cast shadow has none. */
  if ( uComicEdge > 0.0 ) {
    float el = dot( direct, vec3( 0.2126, 0.7152, 0.0722 ) );
    float es = dot( sunFull, vec3( 0.2126, 0.7152, 0.0722 ) );
    comicLit = clamp( es > 1e-5 ? el / es : 1.0, 0.0, 1.0 );
  }

  if ( uComicGrit > 0.0 ) {
    /* Paint grit: two octaves of mottle in the base colour, the hand
     * painted texture under a comic world's ink. Faded where its own
     * octave is finer than a couple of pixels, so it never shimmers. */
    vec2 gq = q * 1.9;
    float gfw = length( fwidth( gq ) );
    float g = comicNoise( gq ) * 0.55 + comicNoise( q * 0.37 + 17.0 ) * 0.45;
    float gAmt = ( 1.0 - smoothstep( 0.35, 0.9, gfw ) ) * 0.16 + 0.05;
    col *= 1.0 + ( g - 0.5 ) * gAmt * uComicGrit;
    /*
     * Landscape scale patches on green ground that faces up: a field is
     * never one green. Dry, worn and clover patches tens of metres
     * across, the variation a painted backdrop has and a flat fill does
     * not. Two octaves at 14 m and 4 m, on the up facing plane only.
     *
     * Faded out by 160 m. Past that the patches shrink to a few pixels,
     * and air takes the contrast out of distant ground anyway (pass 10).
     */
    if ( ground > 0.0 && wn.y > max( wn.x, wn.z ) ) {
      float near = 1.0 - smoothstep( 50.0, 160.0, dist );
      /* On green ground only, and in hue more than in value: dry, yellowed
       * turf against lush. Dark patches read as cloud shadow on a field
       * that has real ones, and on pale concrete, dirt or sand any patch
       * read as camouflage (pass 10), so those keep the grit alone. The
       * noise is read only where it can show: until pass 22 every paved
       * pixel read it and multiplied it by zero, two noises a pixel, which
       * is what the paved ground's stains read (GRIME). The colour is the
       * same either way, because a zero weight leaves it exactly as it was. */
      float green = smoothstep( 0.01, 0.06, col.g - max( col.r, col.b ) );
      if ( near * green > 0.0 ) {
        float m = comicNoise( p.xz * 0.07 + 41.0 ) * 0.6 + comicNoise( p.xz * 0.23 + 7.0 ) * 0.4;
        m = smoothstep( 0.22, 0.78, m );
        vec3 tint = mix( vec3( 0.9, 0.99, 0.96 ), vec3( 1.08, 1.04, 0.8 ), m );
        col *= mix( vec3( 1.0 ), tint, uComicGrit * near * green );
      }
    }
  }

  /*
   * The ground's detail map (pass 12, buildDetailMap): turf on green ground,
   * stones on the rest of the ground that faces up. Two fetches at scales
   * that do not divide each other (a 2.7 m tile and a 7.9 m one turned 37
   * degrees), so neither tile's repeat lines up into a grid seen from
   * height. Fetched whatever the surface faces, inside this branch only,
   * which is uniform: a fetch with implicit derivatives in a branch that
   * neighbouring pixels did not take is undefined, and walls are cheap to
   * sample and multiply by zero. What is not ground skips both fetches.
   */
  if ( uComicDetail * ground > 0.0 ) {
    vec2 du = p.xz * 0.37;
    vec2 dv = vec2( p.x * 0.799 - p.z * 0.602, p.x * 0.602 + p.z * 0.799 ) * 0.127 + vec2( 0.31, 0.77 );
    vec4 d1 = texture2D( uComicDetailMap, du );
    vec4 d2 = texture2D( uComicDetailMap, dv );
    float up = smoothstep( 0.05, 0.25, wn.y - max( wn.x, wn.z ) );
    float turf = smoothstep( 0.01, 0.06, col.g - max( col.r, col.b ) );
    float blades = ( d1.r - 0.5 ) * 0.75 + ( d2.r - 0.5 ) * 0.55;
    float stones = ( d1.g - 0.5 ) * 0.7 + ( d2.g - 0.5 ) * 0.4;
    float warm = ( d1.b - 0.5 ) * 1.2 + ( d2.b - 0.5 ) * 0.8;
    vec3 grass = ( 1.0 + blades ) * ( vec3( 1.0 ) + vec3( 0.07, 0.03, -0.12 ) * warm );
    vec3 detail = mix( vec3( 1.0 + stones * 0.65 ), grass, turf );
    col *= mix( vec3( 1.0 ), detail, up * uComicDetail );
  }

  /*
   * GRIME (pass 22): a built map's paved ground, cracked and stained in the
   * world. The yard's concrete is a tile of sixteen slabs whose stains and
   * hairlines repeat every 24 m, kept faint on purpose because anything a
   * tile shows twice is a pattern (built/ground.js); in the frame it was a
   * pale plain. A comic yard's ground is drawn: inked cracks that run, fork
   * and stop, and stains with a darker tide line at their edge, and here
   * both are laid in the world, so nothing repeats.
   *
   * The cracks are a jittered cell network's edges, three in ten of them
   * kept (comicCrack), in patches on a lattice 18 m apart, so a slab here
   * and there is cracked and most are sound. Each is as wide as a real one
   * near the eye and never thinner than a pixel and three quarters,
   * measured in pixels across its own edge, and faded out from 18 m to
   * 50 m, where it would be a hair laid over every slab. The stains are two
   * octaves of noise cut at a crisp level, with a darker band inside the
   * cut. Soft dark patches on pale ground read as camouflage (pass 10); a
   * stain with an edge reads as a stain.
   *
   * On marked ground that faces up and is not turf, on built maps: the
   * stains on Medium and High, the cracks on High alone, because the cells
   * are nine hashes and a search a pixel and the most arithmetic in this
   * shader (setComicQuality's grime: 1 stains, 2 both). The derivatives are
   * taken in branches on uniforms alone, and the rest of a crack, its
   * wander, cells and width, only on a pixel that could draw one: most of
   * the ground is outside a patch. All of it is compiled in only on a map
   * that draws it (chunkVariant): on the field and in the town it was a
   * tenth of the toon program for nothing.
   */
  #ifdef COMIC_GRIME
  if ( uComicGrime * uComicGround > 0.0 ) {
    vec2 gp = p.xz;
    float upG = smoothstep( 0.05, 0.25, wn.y - max( wn.x, wn.z ) );
    float paved = 1.0 - smoothstep( 0.01, 0.06, col.g - max( col.r, col.b ) );
    float gm = upG * paved;
    float sn = comicNoise( gp * 0.4 + 5.3 ) * 0.62 + comicNoise( gp * 1.31 + 1.7 ) * 0.38;
    float sfw = max( fwidth( sn ), 1e-5 );
    float stain = smoothstep( 0.71 - sfw, 0.71 + sfw, sn );
    float tide = stain * ( 1.0 - smoothstep( 0.71 + sfw, 0.71 + 3.0 * sfw + 0.01, sn ) );
    col *= 1.0 - ( stain * ${GRIME_STAIN.toFixed(3)} + tide * ${GRIME_TIDE.toFixed(3)} ) * gm * ( 1.0 - smoothstep( 60.0, 140.0, dist ) );
    /* Compiled in only where it draws (chunkVariant). */
    #ifdef COMIC_CRACKS
    if ( uComicGrime > 1.5 ) {
      /* How far the ground moves across a pixel, taken here, where every
       * pixel of the draw takes it: the rest branches pixel by pixel. */
      vec2 gx = dFdx( gp );
      vec2 gy = dFdy( gp );
      /* Only where a crack can be drawn: turf, ground past 50 m and ground
       * outside a patch, which is most of it, skip the rest. */
      float zone = gm * ( 1.0 - smoothstep( 18.0, 50.0, dist ) );
      if ( zone > 0.0 ) {
        zone *= smoothstep( 0.54, 0.64, comicNoise( gp * 0.055 + 13.1 ) );
      }
      if ( zone > 0.0 ) {
        /* A little wander, so a crack is a ragged line and not a ruled
         * one, with its slope, which carries the pixel's footprint through
         * the wander to the cells (cdx, cdy) as dFdx of the wandered
         * coordinate would, without taking a derivative in a branch. */
        vec3 wx = comicNoiseD( gp * 1.9 );
        vec3 wy = comicNoiseD( gp * 1.9 + 7.3 );
        vec2 cw = gp * 0.42 + ( vec2( wx.x, wy.x ) - 0.5 ) * 0.22;
        vec2 jx = vec2( 0.42, 0.0 ) + wx.yz * 0.418;
        vec2 jy = vec2( 0.0, 0.42 ) + wy.yz * 0.418;
        vec2 cdx = vec2( dot( jx, gx ), dot( jy, gx ) );
        vec2 cdy = vec2( dot( jx, gy ), dot( jy, gy ) );
        vec4 ck = comicCrack( cw );
        float cpix = max( length( vec2( dot( cdx, ck.zw ), dot( cdy, ck.zw ) ) ), 1e-6 );
        /* Half a crack's width in pixels: about 7 mm, swelling and thinning
         * along it as an inked stroke does, and never under a pixel and
         * three quarters across, so a crack at forty metres is still a line. */
        float chalf = max( 0.85, 0.0028 * mix( 0.35, 1.5, comicNoise( gp * 0.8 + 3.9 ) ) / cpix );
        float crack = ( 1.0 - smoothstep( chalf - 0.5, chalf + 0.5, ck.x / cpix ) ) * ck.y * zone;
        col = mix( col, col * 0.22 + uComicInk * 0.4, crack * ${CRACK_INK.toFixed(3)} );
      }
    }
    #endif
  }
  #endif

  /*
   * FOLIAGE (pass 13): the detail map's leaf clumps on a material marked
   * userData.comicFoliage: the race field's canopies (scene.js), the
   * town's (city/index.js, markCanopies) and the props kit's (kit.js). A
   * canopy is a round mass, so the clumps are fetched in all three world
   * planes and blended by how much the surface faces each (triplanar), an
   * 11 m tile, which puts clumps half a metre to a metre and a half across
   * and four to eight of them across a tree. Each clump's crown is lighter
   * and its inked foot darker, a painted canopy's light and shade. What is
   * not foliage skips the three fetches; past a few tens of metres the
   * mipmaps settle the tile to its neutral mean, so the tree line far off
   * keeps the colour it had.
   */
  if ( uComicDetail * uComicFoliage > 0.0 ) {
    vec3 fq = p * 0.09;
    vec3 tw = wn * wn;
    tw *= tw;
    tw /= tw.x + tw.y + tw.z;
    float lx = texture2D( uComicDetailMap, fq.zy ).a;
    float lz = texture2D( uComicDetailMap, fq.xy + vec2( 0.43, 0.17 ) ).a;
    float ly = texture2D( uComicDetailMap, fq.xz + vec2( 0.71, 0.59 ) ).a;
    float clump = lx * tw.x + lz * tw.z + ly * tw.y - 0.5;
    /* Half as strong in the shade, where the hatching is the texture. */
    float fl = dot( direct, vec3( 0.2126, 0.7152, 0.0722 ) );
    float fs = dot( sunFull, vec3( 0.2126, 0.7152, 0.0722 ) );
    float flit = fs > 1e-5 ? fl / fs : 1.0;
    clump *= mix( 0.5, 1.0, smoothstep( uComicLitLo, uComicLitHi, flit ) );
    /* On green leaves the crown goes warm and the foot cool. On blossom,
     * which is pale and pink, that turned the feet lavender and the canopy
     * read as marble, so anything not green takes the value alone. */
    float leafy = smoothstep( 0.01, 0.06, col.g - max( col.r, col.b ) );
    col *= vec3( 1.0 ) + clump * ${FOLIAGE_CLUMP.toFixed(3)} * mix( vec3( 0.75 ), vec3( 1.3, 1.05, 0.7 ), leafy );
  }

  if ( uComicHatch > 0.0 ) {
    /* The screen derivatives first, in uniform control flow: a derivative
     * taken inside a branch that neighbouring pixels did not take is
     * undefined in GLSL, and the branch below is per pixel. */
    float xa = ( q.x + q.y ) * 4.2;
    float xb = ( q.x - q.y ) * 4.2;
    float fwa = max( fwidth( xa ), 1e-6 );
    float fwb = max( fwidth( xb ), 1e-6 );
    float dl = dot( direct, vec3( 0.2126, 0.7152, 0.0722 ) );
    float sl = dot( sunFull, vec3( 0.2126, 0.7152, 0.0722 ) );
    float lit = sl > 1e-5 ? dl / sl : 1.0;
    float shade = 1.0 - smoothstep( uComicLitLo, uComicLitHi, lit );
    if ( shade > 0.0 && fade > 0.0 ) {
      float wob = ( comicNoise( q * 0.9 ) - 0.5 ) * 0.7;
      float wt = mix( 0.7, 1.35, comicNoise( q * 2.3 + 5.0 ) );
      /* First set at 45 degrees, from the first hint of shade. */
      float h1 = comicSet( xa, xb, fwa, wob, wt, uComicPeriod ) * smoothstep( 0.0, 0.35, shade );
      /* The crossing set only in deep shadow: a cast shadow, not the dark
       * side of the ramp, or every shaded face reads as a net. Drawn only
       * where it shows. Until the low end pass it was drawn on every shaded
       * pixel and multiplied by nothing on the dark side of the ramp, which
       * is a third lit, so most shaded faces paid for a set they never
       * showed. comicSet takes no derivative, so the branch is safe. */
      float h2w = 1.0 - smoothstep( 0.12, 0.24, lit );
      float h2 = 0.0;
      if ( h2w > 0.0 ) {
        h2 = comicSet( xb, xa, fwb, -wob, wt, uComicPeriod ) * h2w;
      }
      float cov = max( h1, h2 ) * fade * square * uComicHatch;
      col = mix( col, col * 0.18 + uComicInk * 0.5, cov * uComicDepth );
    }
    /*
     * Brush marks on the lit side too, sparse and faint, running across the
     * hatching: a painted surface shows the brush everywhere, and a lit
     * face that is one flat fill is the plastic look this replaces. Twice
     * the hatching's spacing, a tenth of its weight. High only.
     *
     * Not on what faces up. Ground seen at a flier's grazing angle draws
     * parallel world strokes as lines running to the vanishing point, and
     * a field of them read as a ruled floor or a ploughed one, not as
     * paint (pass 9). The ground keeps its hatching in shadow and its
     * grit and patches in the light. Compiled in only on High
     * (chunkVariant).
     */
    #ifdef COMIC_BRUSH
    float wall = 1.0 - step( max( wn.x, wn.z ), wn.y );
    if ( uComicBrush > 0.0 && fade * wall > 0.0 ) {
      float bm = comicSet( xb * 0.83 + 3.1, xa * 0.61, fwb * 0.83, 0.0, 1.1, uComicPeriod * 2.2 );
      col *= 1.0 - bm * ${BRUSH_STRENGTH.toFixed(3)} * fade * square * uComicBrush * ( 1.0 - shade );
    }
    #endif
  }
  return col;
}
`;

const FRAG_BODY = /* glsl */ `
	#if NUM_DIR_LIGHTS > 0
		outgoingLight = comicShade( outgoingLight, reflectedLight.directDiffuse,
			directionalLights[ 0 ].color * BRDF_Lambert( diffuseColor.rgb ), normal, vViewPosition );
	#else
		outgoingLight = comicShade( outgoingLight, vec3( 1.0 ), vec3( 1.0 ), normal, vViewPosition );
	#endif
`;

/* The alpha an opaque surface writes for the ink's edge highlights (EDGE
 * HIGHLIGHTS, pass 21): LIT_BASE in shade, up to LIT_BASE + LIT_SPAN in
 * full sun. Above every blob code below and under the one that every other
 * surface writes, which the ink reads as no code at all. */
const LIT_BASE = 0.84;
const LIT_SPAN = 0.14;

/*
 * A CANOPY BLOB'S CODE, for the town's ink (graphics pass 19).
 *
 * The town's cherry and grove canopies are blobs of twenty or eighty flat
 * faces, shaded round, and its ink pass finds creases in depth alone: the
 * turn between two faces is a crease, so every blob was inked as a cut gem
 * or a geodesic dome, worst toward its rim, where a small turn is a large
 * change of depth. Finer blobs only move the lines toward the rim (pass 15
 * went from twenty faces to eighty, near the eye). What the ink needs to
 * know is the thing depth cannot tell it: whether both sides of a crease
 * are the same blob.
 *
 * So a blob writes that into the one channel nothing else reads. The town
 * draws into a half float target whose alpha every opaque surface sets to
 * one and nothing downstream uses (the ink writes one over it), and a
 * material marked comicBlob writes a code there instead: 0.25 to 0.75, one
 * of 128 values, hashed from where its instance stands, so two blobs side
 * by side almost never share one (and where they do, the concave line where
 * they meet and the far side's line still draw). The ink pass reads the
 * code at its centre and its four taps, and a convex crease whose taps are
 * all the centre's own blob is a facet, not a line. The outline, the line
 * between two blobs, and the line where a blob meets a branch or a wall are
 * all two codes, so they ink as before.
 *
 * Blended surfaces drawn over a blob mix its code away and get their lines
 * back, which is the right answer for them. The code is written only where
 * the material is opaque, and only after three's last chunk, so nothing
 * else in the frame changes. The ink half is in comicPipeline's blobs
 * option; a map that marks nothing pays one fetch on a crease's pixels.
 *
 * Since pass 21, on a map that draws edge highlights, every other opaque
 * toon surface writes its sun there too (LIT_BASE above), and the ink is
 * still the only thing that reads it.
 *
 * A built map's trees (pass 23) are blobs too, round on Low and clumps on
 * Medium and High, but the prop kit bakes every blob of a tone into one
 * mesh, so they have one origin between them and the hash above would give
 * a whole canopy one code. Their codes come from the geometry instead: the kit's leaf() hands
 * each blob a float attribute, one value on all of its vertices, and a
 * material marked comicBlobBaked reads that (COMIC_BLOB_BAKED). That is a
 * define, so those materials compile a program of their own, one for the
 * map; it keeps the attribute out of every other toon program, where a
 * missing attribute would read whatever the context last left there.
 */
const FRAG_TAIL = /* glsl */ `
	#ifdef OPAQUE
		if ( uComicBlob > 0.0 ) {
			gl_FragColor.a = 0.25 + floor( vComicBlob * 128.0 ) / 256.0;
		} else if ( uComicEdge > 0.0 ) {
			gl_FragColor.a = ${LIT_BASE.toFixed(2)} + ${LIT_SPAN.toFixed(2)} * comicLit;
		}
	#endif
`;

/*
 * What the chunk compiles in beyond its core, from the knobs as they stand:
 * the brush marks on High, the grime where a built map asks for it, and its
 * cracks where a built map on High does. Until the low end pass all three
 * were in every program and skipped by a uniform branch where they did not
 * draw. A GPU skips the arithmetic, but not the registers it reserves for
 * code it might take, which is what an integrated GPU runs out of first,
 * and the cracks are the most arithmetic in the shader. The source and the
 * program cache key are both made from this, in the same call (three's
 * getProgram reads the key and then, on a miss, calls the hook), so
 * materials that share a key share a source. Each map sets its grime before
 * it draws, so a map's programs are all one variant.
 */
function chunkVariant() {
  const brush = COMIC.brush.value > 0;
  const grime = COMIC.grime.value > 0;
  const cracks = COMIC.grime.value > 1.5;
  return {
    defines: (brush ? '#define COMIC_BRUSH\n' : '') + (grime ? '#define COMIC_GRIME\n' : '')
      + (cracks ? '#define COMIC_CRACKS\n' : ''),
    key: (brush ? '|brush' : '') + (grime ? '|grime' : '') + (cracks ? '|cracks' : ''),
  };
}

/*
 * The layer's uniforms go on every program the hook builds, the chunk's or
 * not. three keeps the uniforms a material had when it last COMPILED, and
 * goes back to a program it already holds for a key without compiling
 * (getProgram in three's WebGLRenderer). So a craft compiled on High, then
 * on Low, then on High again would draw High's program with Low's uniforms,
 * and if Low's had none of these, its strokes and its ground mark would
 * read whatever another material last gave the shared program. A uniform
 * the program does not use is never uploaded, so on Low they cost nothing.
 */
function bindUniforms(shader, material) {
  shader.uniforms.uComicHatch = COMIC.hatch;
  shader.uniforms.uComicGrit = COMIC.grit;
  shader.uniforms.uComicBrush = COMIC.brush;
  shader.uniforms.uComicInk = COMIC.ink;
  shader.uniforms.uComicLitLo = COMIC.litLo;
  shader.uniforms.uComicLitHi = COMIC.litHi;
  shader.uniforms.uComicDepth = COMIC.depth;
  shader.uniforms.uComicWidth = COMIC.width;
  shader.uniforms.uComicPeriod = COMIC.period;
  shader.uniforms.uComicFadeNear = COMIC.fadeNear;
  shader.uniforms.uComicFadeFar = COMIC.fadeFar;
  shader.uniforms.uComicDetail = COMIC.detail;
  shader.uniforms.uComicDetailMap = COMIC.detailMap;
  shader.uniforms.uComicNoise = COMIC.noise;
  /* The material's own, and the only one here that is not shared: three
   * keeps a material's uniforms per material while the program is shared,
   * so every material reads its own mark through one program. */
  shader.uniforms.uComicGround = {
    get value() {
      return material.userData.comicGround ? 1 : 0;
    },
  };
  shader.uniforms.uComicGroundAuto = COMIC.groundAuto;
  shader.uniforms.uComicEdge = COMIC.edge;
  shader.uniforms.uComicGrime = COMIC.grime;
  shader.uniforms.uComicFoliage = {
    get value() {
      return material.userData.comicFoliage ? 1 : 0;
    },
  };
  shader.uniforms.uComicBlob = {
    get value() {
      return material.userData.comicBlob ? 1 : 0;
    },
  };
}

function inject(shader, material) {
  if (shader.fragmentShader.includes(MARK)) {
    return;
  }
  const vs = shader.vertexShader;
  const fs = shader.fragmentShader;
  if (!vs.includes('#include <project_vertex>') || !vs.includes('#include <common>')
      || !fs.includes('#include <opaque_fragment>') || !fs.includes('#include <common>')
      || !fs.includes('vec3 outgoingLight')) {
    /* Not the toon shader this was written against. Draw it as it was. */
    return;
  }
  /* Built by the first program that reads it, here rather than in
   * setComicQuality, for a page that compiles the chunk without ever
   * setting a preset. */
  COMIC.noise.value = latticeMap();
  const baked = material.userData.comicBlobBaked ? '#define COMIC_BLOB_BAKED\n' : '';
  shader.vertexShader = vs
    .replace('#include <common>', `#include <common>\n${baked}${VERT_HEAD}`)
    .replace('#include <project_vertex>', `#include <project_vertex>\n${VERT_BODY}`);
  shader.fragmentShader = fs
    .replace('#include <common>', `#include <common>\n${chunkVariant().defines}${FRAG_HEAD}`)
    .replace('#include <opaque_fragment>', `${FRAG_BODY}\n\t#include <opaque_fragment>`)
    .replace('#include <dithering_fragment>', `#include <dithering_fragment>\n${FRAG_TAIL}`);
}

/*
 * WEBGL 1. The shell asks for a WebGL 2 context, and three.js r160 falls
 * back to WebGL 1 when a browser will not give one, as an old phone or a
 * blocklisted driver will not. Main draws there: the title, the field, the
 * town and the share page's orbit all render on WebGL 1 with no shader
 * error, which was checked by refusing webgl2 in headless Chromium. This
 * layer is WebGL 2 GLSL throughout (fwidth and dFdx with no derivatives
 * extension, a flat varying, texelFetch), and on WebGL 1 every toon
 * material failed to compile and drew nothing. So on a WebGL 1 renderer
 * none of it is compiled in and the world draws the way main draws it. A
 * renderer this cannot read is taken as WebGL 2, which is what it asked
 * for.
 */
export function comicGL2(renderer) {
  return !(renderer && renderer.capabilities && renderer.capabilities.isWebGL2 === false);
}

/*
 * Install the accessors, once. Guarded on a symbol so a second import of
 * this module (a share page, the gallery) cannot wrap the wrapper.
 */
const INSTALLED = Symbol.for('webfpv.comic.installed');
const P = THREE.MeshToonMaterial.prototype;
if (!P[INSTALLED]) {
  P[INSTALLED] = true;
  Object.defineProperty(P, 'onBeforeCompile', {
    configurable: true,
    get() {
      /* The caller's hook as it is at the moment of the read, so code that
       * reads this to wrap it and assigns the wrapper back ends up calling
       * the old hook once, not this wrapper in a loop. */
      const user = this._comicUserHook || null;
      const self = this;
      const hook = function comicHook(shader, renderer) {
        if (user) {
          user.call(self, shader, renderer);
        }
        bindUniforms(shader, self);
        if (chunkOn && comicGL2(renderer)) {
          inject(shader, self);
        }
      };
      hook.comicUser = user;
      return hook;
    },
    /* The town's bake and the kit copy one material's hook onto a clone
     * (bake.js, kit.js: Material.copy does not carry it). What they read is
     * this wrapper, so the setter unwraps it and the clone holds the same
     * caller's hook the original does, not a wrapper round a wrapper. */
    set(fn) {
      if (typeof fn === 'function' && 'comicUser' in fn) {
        this._comicUserHook = fn.comicUser;
      } else {
        this._comicUserHook = typeof fn === 'function' ? fn : null;
      }
    },
  });
  Object.defineProperty(P, 'customProgramCacheKey', {
    configurable: true,
    get() {
      const self = this;
      const key = function comicKey() {
        let k = '';
        if (self._comicUserKey) {
          k = programKey(String(self._comicUserKey.call(self)));
        } else if (self._comicUserHook) {
          k = self._comicUserHook.toString();
        }
        /* Off on Low (chunkOn above), where the program is the caller's
         * alone. What the chunk compiles in (chunkVariant) is in its key,
         * and a baked canopy's material compiles its own program (see
         * FRAG_TAIL's note on pass 23), so its key says so. */
        if (!chunkOn) {
          return `${k}|comic0`;
        }
        return k + KEY + chunkVariant().key + (self.userData.comicBlobBaked ? '|baked' : '');
      };
      key.comicUserKey = this._comicUserKey || null;
      return key;
    },
    /* Unwrapped for the same reason as the hook: a key copied from another
     * material is that material's own key, so the two still share one
     * program, as they did before this file. */
    set(fn) {
      if (typeof fn === 'function' && 'comicUserKey' in fn) {
        this._comicUserKey = fn.comicUserKey;
      } else {
        this._comicUserKey = typeof fn === 'function' ? fn : null;
      }
    },
  });
}

/*
 * The freestyle maps' vendored pipeline: the heavier, darker pen and a
 * harder grade, on the pipeline's own copies of its materials, the way
 * manga.js edits them. Nothing under vendored/ changes. The pipelines'
 * setSize multiplies its own line width by pipeline.inkWeight.
 */
export function comicPipeline(pipeline, { blobs = false } = {}) {
  /* The pen and the grade below are uniforms and draw on WebGL 1 as they
   * do on 2. The three shader edits are WebGL 2 GLSL, so see comicGL2. */
  const gl2 = comicGL2(pipeline.renderer);
  pipeline.inkWeight = INK_WEIGHT;
  pipeline.comicAo = gl2 && comicAoOn() && addPipelineAo(pipeline);
  pipeline.comicSil = gl2 && comicSilOn() && addPipelineSil(pipeline);
  /* Not on Low, where the chunk that writes the codes is not compiled in
   * (chunkOn), so the ink would fetch them for nothing. */
  pipeline.comicBlobs = gl2 && blobs && chunkOn && addPipelineBlobs(pipeline);
  pipeline.comicEdges = gl2 && comicEdgesOn() && addPipelineEdges(pipeline);
  const ink = pipeline.ink && pipeline.ink.mat && pipeline.ink.mat.uniforms;
  if (ink) {
    if (ink.uInk) {
      ink.uInk.value.setHex(INK_COLOR);
    }
    /*
     * The crease thresholds scale with the pen. The ink pass reads a crease
     * as the second difference of depth across the pen's reach, which grows
     * in proportion to the reach, so a pen 1.55 times wider found every
     * crease 1.55 times stronger, and pass 1 then lowered the threshold
     * too: the town's twenty sided blossom blobs came out as wireframe
     * gems, every facet edge inked. Multiplying the reach back into the
     * thresholds keeps the kit's creases where main has them and makes only
     * the lines heavier; the last tenth is a slightly keener pen.
     */
    if (ink.uSens) {
      ink.uSens.value *= INK_WEIGHT * 0.9;
    }
    if (ink.uConcave) {
      ink.uConcave.value *= INK_WEIGHT * 0.9;
    }
    if (ink.uConcaveAmount) {
      ink.uConcaveAmount.value = Math.min(1, ink.uConcaveAmount.value * 1.3);
    }
  }
  const g = pipeline.grade && pipeline.grade.mat && pipeline.grade.mat.uniforms;
  if (g) {
    /* More colour and deeper darks: the pastel town moves toward the
     * saturated, high contrast palette the ask names, keeping its hues. */
    if (g.uSaturation) {
      g.uSaturation.value = 1.26;
    }
    if (g.uLift) {
      g.uLift.value = 0.014;
    }
  }
}

/*
 * AMBIENT OCCLUSION, folded into each pipeline's ink pass on High only.
 *
 * What the ink and hatching cannot give the world is weight: a container
 * sits ON the concrete, a gate leg stands IN the grass, an underpass is
 * dark because the sky cannot see into it. That is occlusion, and it is the
 * single largest difference between a stylised world that reads as a
 * diorama and one that reads as finished.
 *
 * No new pass and no new target: the ink pass already holds the frame's
 * depth (the field's packed prepass, the town's depth texture), so eight
 * more fetches of it in a disc about the pixel give a hemisphere estimate.
 * The disc's radius is a fixed distance in the world, so a contact shadow
 * is the same size on a near box and a far one, clamped in pixels so a
 * distant pixel never scatters fetches across the frame. The disc is
 * turned per pixel by interleaved gradient noise, which trades banding for
 * a fine dither the ink pass's own antialiasing and the town's fxaa soften.
 *
 * Eight fetches is the whole cost, at full resolution, on High only. Low
 * and Medium compile without COMIC_AO and pay nothing, not even the branch.
 *
 * The including shader defines COMIC_AO_DEPTH(uv) as the linear view depth
 * in metres at uv, and provides the uniforms below.
 */
/* Unrolled, so the budget's tap counter (src/render/budget.js) counts the
 * eight fetches rather than flagging a loop it cannot see into. */
const AO_TAPS = Array.from({ length: 8 }, (_, i) => {
  const r = Math.sqrt((i + 0.5) / 8).toFixed(6);
  const a = (i * 2.3999632).toFixed(6);
  return `    {
      float a = ang + ${a};
      vec2 suv = clamp( uv + vec2( cos( a ), sin( a ) ) * ( ${r} * px ) / uAoRes, vec2( 0.0 ), vec2( 1.0 ) );
      vec3 v = comicAoPos( suv, COMIC_AO_DEPTH( suv ) ) - P;
      float len = length( v ) + 1e-4;
      occ += max( 0.0, ( dot( N, v ) - COMIC_AO_QUANT ) / len - 0.12 ) * ( 1.0 - smoothstep( uAoRadius * 0.6, uAoRadius * 1.6, len ) );
    }`;
}).join('\n');

export const AO_GLSL = /* glsl */ `
  /*
   * How far a depth read can be off, in metres, as a height above the
   * surface a tap may stand and still count as the surface itself. The
   * field's prepass packs depth into 16 bits over its whole range, a code
   * every 4 cm (post.js), and a quad on the start pads looking down at
   * turf a metre away reads that staircase as occlusion: bands across the
   * lawn along every depth code (pass 12). The including shader defines it
   * from its own packing; the town's depth texture is fine enough for 0.
   */
  #ifndef COMIC_AO_QUANT
  #define COMIC_AO_QUANT 0.0
  #endif
  uniform vec2 uAoTanHalf;
  uniform vec2 uAoRes;
  uniform float uAoRadius;
  uniform float uAoStrength;
  uniform float uAoFar;

  vec3 comicAoPos( vec2 uv, float d ) {
    return vec3( ( uv * 2.0 - 1.0 ) * uAoTanHalf * d, -d );
  }

  /* 1 is open, 0 is fully occluded. N is the view space normal, facing the
   * camera. */
  float comicAo( vec2 uv, vec3 P, vec3 N ) {
    float d = -P.z;
    if ( d > uAoFar ) {
      return 1.0;
    }
    float px = uAoRadius / ( d * uAoTanHalf.y ) * 0.5 * uAoRes.y;
    px = clamp( px, 3.0, 48.0 );
    float ign = fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) );
    float ang = ign * 6.2831853;
    float occ = 0.0;
${AO_TAPS}
    occ /= 8.0;
    float fade = 1.0 - smoothstep( uAoFar * 0.6, uAoFar, d );
    return 1.0 - clamp( occ * uAoStrength * 1.6, 0.0, 0.85 ) * fade;
  }
`;

/* The colour occlusion darkens toward: a cool, deep violet rather than
 * black, so occluded corners stay in the same warm light, cool shadow
 * logic as the ramps. */
export const AO_TINT_GLSL = 'vec3( 0.32, 0.30, 0.46 )';

export function aoUniforms() {
  return {
    uAoTanHalf: { value: new THREE.Vector2(1, 1) },
    uAoRes: { value: new THREE.Vector2(1, 1) },
    uAoRadius: { value: 1.2 },
    uAoStrength: { value: 2.6 },
    uAoFar: { value: 90 },
  };
}

/* Called per frame by each pipeline: the camera's frustum, which a
 * pilot's FOV setting or a resize can change at any moment. */
export function updateAoCamera(u, camera, w, h) {
  const t = Math.tan((camera.fov * Math.PI) / 360);
  u.uAoTanHalf.value.set(t * camera.aspect, t);
  u.uAoRes.value.set(w, h);
}

/* Whether the preset in force wants the occlusion. Read at pipeline build;
 * a preset change rebuilds the world, and so the pipeline. */
let aoOn = true;
export function comicAoOn() {
  return aoOn;
}
let silOn = true;
export function comicSilOn() {
  return silOn;
}

/* The vendored ink pass's lines the occlusion is inserted at, exactly as
 * src/maps/city/vendored/core/post.js has them. If an update changes
 * either, nothing is inserted and the pipeline draws as before. */
const INK_MAIN_AT = `    void main() {
      vec3 col = texture2D( tDiffuse, vUv ).rgb;`;
const INK_LINE_AT = '      vec3 line = mix( uInk, col * 0.42, 0.22 );';

function addPipelineAo(pipeline) {
  const mat = pipeline.ink && pipeline.ink.mat;
  if (!mat) {
    return false;
  }
  const fs = mat.fragmentShader;
  if (!fs.includes(INK_MAIN_AT) || !fs.includes(INK_LINE_AT)) {
    return false;
  }
  mat.fragmentShader = fs
    .replace(INK_MAIN_AT, `    #define COMIC_AO_DEPTH(uv) linearDepth(uv)
${AO_GLSL}
${INK_MAIN_AT}`)
    .replace(INK_LINE_AT, `      /* The comic layer's occlusion: src/render/comic.js. No normal
       * buffer here, so the depth's own derivative. */
      {
        vec3 aoP = comicAoPos( vUv, dc );
        vec3 aoN = normalize( cross( dFdx( aoP ), dFdy( aoP ) ) );
        aoN *= sign( dot( aoN, -aoP ) + 1e-6 );
        col *= mix( ${AO_TINT_GLSL}, vec3( 1.0 ), comicAo( vUv, aoP, aoN ) );
      }
${INK_LINE_AT}`);
  Object.assign(mat.uniforms, aoUniforms());
  mat.needsUpdate = true;
  /* The frustum, per frame, before the pipeline's own render. */
  const render = pipeline.render;
  pipeline.render = function comicRender(...args) {
    updateAoCamera(mat.uniforms, this.camera, this.size.x, this.size.y);
    return render.apply(this, args);
  };
  return true;
}

/* Where the outer line goes in the vendored ink pass: after its own two
 * terms, before its haze fade, so the outer line fades with the rest. */
const INK_FADE_AT = '      // let the background dissolve into the haze instead of getting busy';

/* The outer line (SIL_GLSL) in the vendored ink pass, on its own four taps
 * along the axes, each with a wide tap beyond it. */
function addPipelineSil(pipeline) {
  const mat = pipeline.ink && pipeline.ink.mat;
  if (!mat) {
    return false;
  }
  const fs = mat.fragmentShader;
  if (!fs.includes(INK_MAIN_AT) || !fs.includes(INK_FADE_AT)) {
    return false;
  }
  mat.fragmentShader = fs
    .replace(INK_MAIN_AT, `    #define COMIC_SIL_DEPTH(uv) linearDepth(uv)
${SIL_GLSL}
${INK_MAIN_AT}`)
    .replace(INK_FADE_AT, `      /* The comic layer's outer line: src/render/comic.js. */
      {
        vec2 tw = t * ${SIL_REACH.toFixed(2)};
        edge = max( edge, comicSilEdge(
          comicSilDir( dc, dl, vUv - vec2( tw.x, 0.0 ) ), comicSilDir( dc, dr, vUv + vec2( tw.x, 0.0 ) ),
          comicSilDir( dc, du, vUv + vec2( 0.0, tw.y ) ), comicSilDir( dc, dd, vUv - vec2( 0.0, tw.y ) ), 0.0 ) * ${SIL_STRENGTH.toFixed(3)} );
      }
${INK_FADE_AT}`);
  mat.needsUpdate = true;
  return true;
}

/* Where the vendored ink pass sums its convex creases, exactly as
 * src/maps/city/vendored/core/post.js has it. */
const INK_CONVEX_AT = '      float convex  = max( 0.0,  sx ) + max( 0.0,  sy );';

/*
 * The ink half of a canopy blob's code (FRAG_TAIL above), on every preset
 * that inks: one exact fetch of the scene's alpha on a pixel whose convex
 * creases are strong enough to draw anything, and four more only where that
 * pixel is a blob, a branch whole canopies take together. texelFetch, so no
 * filtering mixes two codes at a tap and the branch needs no derivatives.
 */
const BLOB_GLSL = /* glsl */ `
  float comicBlobAt( vec2 uv ) {
    ivec2 s = textureSize( tDiffuse, 0 );
    return texelFetch( tDiffuse, clamp( ivec2( uv * vec2( s ) ), ivec2( 0 ), s - 1 ), 0 ).a;
  }
  float comicBlobSame( float c, vec2 uvA, vec2 uvB ) {
    return step( abs( comicBlobAt( uvA ) - c ), 0.001 ) * step( abs( comicBlobAt( uvB ) - c ), 0.001 );
  }
  /* The convex creases along each axis, less any whose centre and both taps
   * are one blob. */
  float comicBlobConvex( vec2 uv, vec2 t, float cx, float cy ) {
    if ( cx + cy > uSens * 0.32 ) {
      float c = comicBlobAt( uv );
      if ( c < 0.8 ) {
        cx *= 1.0 - comicBlobSame( c, uv - vec2( t.x, 0.0 ), uv + vec2( t.x, 0.0 ) );
        cy *= 1.0 - comicBlobSame( c, uv + vec2( 0.0, t.y ), uv - vec2( 0.0, t.y ) );
      }
    }
    return cx + cy;
  }
`;

function addPipelineBlobs(pipeline) {
  const mat = pipeline.ink && pipeline.ink.mat;
  if (!mat) {
    return false;
  }
  const fs = mat.fragmentShader;
  if (!fs.includes(INK_MAIN_AT) || !fs.includes(INK_CONVEX_AT)) {
    return false;
  }
  mat.fragmentShader = fs
    .replace(INK_MAIN_AT, `${BLOB_GLSL}
${INK_MAIN_AT}`)
    .replace(INK_CONVEX_AT, `      /* The comic layer's canopy blobs: src/render/comic.js. */
      float convex  = comicBlobConvex( vUv, t, max( 0.0,  sx ), max( 0.0,  sy ) );`);
  mat.needsUpdate = true;
  return true;
}

/*
 * EDGE HIGHLIGHTS (pass 21): the fifth of the plan's five, and the one the
 * first twenty passes left. A painter picks out the top edge of a crate, a
 * parapet, a step or a car's roof in a light colour where the sun catches
 * it, which is most of what makes a surface read as a made thing with a
 * worn edge rather than a fold in a sheet. The ink already finds every
 * convex crease, so the highlight costs one fetch on a crease's pixels
 * and nothing elsewhere: on the half of a crease's line that lies on the
 * face in more sun, the ink gives way to a pale, warm stroke, and the half
 * on the face in less stays ink. A crease between two faces in the same
 * light, a silhouette and an inside corner are ink as before.
 *
 * Which half is sunlit is the one thing depth cannot say, and a normal
 * rebuilt from the depth's derivative cannot either: at the crease itself
 * the derivative straddles both faces, and the first try drew every
 * highlight as a dotted line. The surface knows exactly, so it says: an
 * opaque toon surface writes its sun into the scene's alpha (FRAG_TAIL,
 * LIT_BASE), the channel the canopy blobs already use and nothing else
 * reads. The ink reads the centre's from the fetch it already makes, and
 * the far face's with one exact fetch at the tap across the crease, only
 * on a pixel that is a convex crease in the sun. Medium and High, in the
 * town and the yard; Low compiles none of it.
 *
 * Not on the race field. Its chain blooms from the scene's alpha, so it
 * cannot carry the code, and the same rule on its prepass normals (the
 * brighter of the two faces, by the sun in view space) was tried: the
 * normals are one aliased sample a pixel, the brighter face flips from
 * pixel to pixel along an edge, and the start blocks came out speckled
 * with white. The field's few hard edges keep their ink.
 */
let edgesOn = true;
export function comicEdgesOn() {
  return edgesOn;
}

/* The stroke: the surface's own colour carried this far toward a warm
 * paper white, so a red container's edge is a pale red and not a white
 * wire. */
export const EDGE_TINT_GLSL = 'vec3( 1.0, 0.95, 0.84 )';
export const EDGE_MIX = 0.6;

/* Where the highlights fade, in metres: well inside the ink's own fade
 * (40 to 98 m), because past a few tens of metres a lip is a pixel wide
 * and a crease's line breaks up along a roof edge into a row of dashes. */
const EDGE_NEAR = 18;
const EDGE_FAR = 45;

/* Where the vendored ink pass writes its colour, exactly as
 * src/maps/city/vendored/core/post.js has it. */
const INK_OUT_AT = '      gl_FragColor = vec4( mix( col, line, clamp( edge, 0.0, 1.0 ) ), 1.0 );';

/* The centre's fetch, kept whole so its alpha is read with its colour. */
const INK_CENTRE = `    void main() {
      vec4 comicCentre = texture2D( tDiffuse, vUv );
      vec3 col = comicCentre.rgb;`;

function addPipelineEdges(pipeline) {
  const mat = pipeline.ink && pipeline.ink.mat;
  if (!mat) {
    return false;
  }
  const fs = mat.fragmentShader;
  if (!fs.includes(INK_MAIN_AT) || !fs.includes(INK_LINE_AT) || !fs.includes(INK_OUT_AT)) {
    return false;
  }
  const lo = (LIT_BASE - 0.005).toFixed(3);
  mat.fragmentShader = fs
    .replace(INK_MAIN_AT, `    /* The sun a surface wrote into the scene's alpha (FRAG_TAIL), 0 to 1,
     * and -1 where nothing wrote one. */
    float comicEdgeSun( float a ) {
      return a > ${lo} && a < 0.995 ? ( a - ${LIT_BASE.toFixed(2)} ) * ${(1 / LIT_SPAN).toFixed(4)} : -1.0;
    }
${INK_CENTRE}`)
    .replace(INK_LINE_AT, `      /* The comic layer's edge highlights: src/render/comic.js. A convex
       * crease on a sunlit surface, whose far side is a surface in less sun,
       * continuous with it in depth: the top of a box meeting its side, or a
       * lit wall turning a corner into shade. The brighter face's half of
       * the line is the highlight and the darker face's half stays ink. A
       * silhouette stays ink, since its nearer tap is its own surface. */
      float comicHl = 0.0;
      {
        float sunC = comicEdgeSun( comicCentre.a );
        float cand = smoothstep( uSens * 0.32, uSens, convex ) * smoothstep( 0.35, 0.6, sunC );
        if ( cand > 0.0 ) {
          /* Across the crease: on the axis that bends more, the tap nearer
           * the centre's depth, since the far one may be past a silhouette. */
          bool across = sx > sy;
          bool first = across ? abs( dl - dc ) < abs( dr - dc ) : abs( du - dc ) < abs( dd - dc );
          vec2 o = across ? vec2( first ? -t.x : t.x, 0.0 ) : vec2( 0.0, first ? t.y : -t.y );
          float d = across ? ( first ? dl : dr ) : ( first ? du : dd );
          ivec2 s = textureSize( tDiffuse, 0 );
          float b = comicEdgeSun( texelFetch( tDiffuse, clamp( ivec2( ( vUv + o ) * vec2( s ) ), ivec2( 0 ), s - 1 ), 0 ).a );
          comicHl = cand * step( -0.5, b ) * smoothstep( 0.1, 0.3, sunC - b )
            * ( 1.0 - smoothstep( 0.02, 0.06, abs( d - dc ) / dc ) )
            * ( 1.0 - smoothstep( ${EDGE_NEAR.toFixed(1)}, ${EDGE_FAR.toFixed(1)}, dc ) );
        }
      }
${INK_LINE_AT}`)
    .replace(INK_OUT_AT, `      gl_FragColor = vec4( mix( mix( col, line, clamp( edge * ( 1.0 - comicHl ), 0.0, 1.0 ) ),
        mix( col, ${EDGE_TINT_GLSL}, ${EDGE_MIX.toFixed(2)} ), clamp( comicHl, 0.0, 1.0 ) ), 1.0 );`);
  mat.needsUpdate = true;
  return true;
}
