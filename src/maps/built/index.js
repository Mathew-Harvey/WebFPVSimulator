/*
 * built/index.js: a freestyle map somebody built in the track builder, as a
 * world to fly.
 *
 * WHICH MAP. One injected by the caller (options.document), otherwise the
 * one open on the builder's freestyle canvas, otherwise Hibari Yard, the
 * starter (./starter.js). A document that is not a freestyle map is never
 * built here: a race track in the freestyle seat is somebody else's mistake
 * and flying it as a map would put gates in a yard with no course through
 * them. An empty freestyle canvas is not flown either, because a paved
 * plot with nothing on it is a worse first flight than the starter, and the
 * builder is one row away on the Freestyle screen.
 *
 * WHAT IS OURS AND WHAT IS THE TOWN'S. The look is the town's, reproduced
 * from src/maps/city/index.js rather than imported from it: the same fog
 * colour, the same four lights at the same offsets, the same painted sky and
 * ridge lines, the same post chain with the same shared renderer fixes. The
 * assets are src/props, drawn by src/props/kit.js in the town's cel
 * materials. What is this file's own is the ground (a paved yard, not a
 * town), how far the fog lets a pilot see (see fogFor), the wires between
 * poles and pylons, and the title camera's orbit.
 *
 * THE SOLIDS COME FROM ONE PLACE. src/maps/built/place.js places the
 * document and says what is solid; this file puts exactly that into a
 * Colliders and hands it to the shell, which uploads it to the plant. The
 * builder's warnings read the same placement, so the map and the editor
 * cannot disagree about where a wall is. The ground is flat and at zero,
 * everywhere, so `height` is a constant.
 *
 * NOTHING MOVES. Stage A has no vehicles, so updateAnim is a no op and the
 * only per frame work is seating the lights, trailing the sky and switching
 * chunks on and off by distance.
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
import { PAL } from '../city/vendored/core/palette.js';
import { Pipeline } from '../city/vendored/core/post.js';
import { buildSky, buildDistantHills } from '../city/vendored/core/sky.js';
import { setOutlineResolution } from '../city/vendored/core/outline.js';
import { cel } from '../city/vendored/core/toon.js';
import { bake, sagCurve } from '../city/vendored/core/util.js';
import { Colliders } from '../../game/collide.js';
import { disposeSceneGraph } from '../../render/shell.js';
import { SESSION_TEXTURES } from '../../render/session-textures.js';
import { yieldToPaint } from '../../ui/loading.js';
import { qualityFor } from '../../render/quality.js';
import { readAutosave } from '../../trackbuilder/storage.js';
import { normalize, logoForDecal } from '../../trackbuilder/model.js';
import { docModeOf } from '../../trackbuilder/elements.js';
import { PropKit, ownedPropMaterials } from '../../props/kit.js';
import { addSolids } from '../../props/solids.js';
import { planBounds } from '../../props/catalog.js';
import { poleWireAnchors } from '../../props/street.js';
import { sincos } from '../../props/trig.js';
import { seededRandom } from '../../props/parts.js';
import { paintGroundLogo } from '../../art/banners.js';
import { placeDocument } from './place.js';
import { starterMap } from './starter.js';

/* The town's far plane, for the town's reason: the sky dome and the ridge
 * lines live out past the fog. See CAMERA_FAR in src/maps/city/index.js.
 * It is the least this map uses; a sky pushed out for a big plot takes the
 * far plane with it. */
const CAMERA_FAR = 900;

/*
 * THE BUILT MAP'S OWN FOG.
 *
 * The town's fog is the town's budget. It ends at 65 m on High and 46 on
 * Low because a street of about twelve hundred draw calls cannot afford to
 * be seen further, and it hides the chunks the cull switches off. A yard is
 * a place a pilot reads from one end, and under the town's fog the far half
 * of a 160 m plot was haze from the spawn and from the air. With the whole
 * of the starter's plot in view it costs 350 to 540 draw calls on High and
 * 120 to 400 on Low, shadow pass included (measured with __budget from the
 * spawn and three cameras over the plot).
 *
 * So the fog is sized to the plot. It starts at FOG_NEAR and on High ends
 * at 1.2 times the plot's diagonal, held between 180 m, so a small plot
 * still has a horizon rather than a hard edge, and 420 m, inside the sky
 * dome. three.js fades fog on a smoothstep, so on the starter's plot the
 * far end, 160 m from the spawn, is about half fogged and reads, and only
 * the far corner is lost in it. Medium and Low end it sooner: with the cull
 * radius tied to the fog, a big plot's far chunks switch off sooner, and
 * the triangles, the draw calls and the shadow casters go with them.
 */
const FOG_NEAR = { high: 50, medium: 45, low: 40 };
/* Low was 0.7 first, 190 m on the starter's plot, and from 45 m up over
 * one corner the far half of the yard was more fog than yard; 0.8 keeps it
 * readable and the draw calls barely move, since the whole plot is inside
 * the cull radius either way. */
const FOG_REACH = { high: 1, medium: 0.9, low: 0.8 };
const FOG_DIAGONALS = 1.2;
const FOG_FAR_MIN = 180;
const FOG_FAR_MAX = 420;

/* The fog for a preset and a plot, { near, far } in metres. */
function fogFor(qid, W, D) {
  const reach = Math.min(FOG_FAR_MAX, Math.max(FOG_FAR_MIN, FOG_DIAGONALS * Math.hypot(W, D)));
  return { near: FOG_NEAR[qid] ?? FOG_NEAR.high, far: reach * (FOG_REACH[qid] ?? 1) };
}

/*
 * THE SHADOW BOX, as a share of the view.
 *
 * The town keeps a tight box round the craft (22 m on High), because its
 * fog ends at 65 m and a shadow past that is never seen. Under a view of a
 * few hundred metres that left everything more than 22 m off with no shadow
 * at all, and a building with no shadow on a pale yard does not stand on
 * it. A quarter of the fog's reach, never less than the town's box and never
 * over 80 m, puts the shadows of what a pilot is flying at in the map: 68 m
 * on High is 6.6 cm a texel at 2048, which still holds a lamp post's.
 */
const SHADOW_SHARE = 0.25;
const SHADOW_HALF_MAX = 80;

/* The ridge lines' nearer layer stands this far out (buildDistantHills),
 * and a plot whose corner reaches it would put a painted hill in the yard. */
const HILLS_NEAR = 250;
const HILLS_FAR = 330 * 1.15;

/*
 * The chunk the props are grouped into for culling, in metres.
 *
 * The town settled on 40 m by sweeping it. A built map is a few dozen assets
 * on a plot rather than twenty thousand meshes, so a chunk here costs one
 * draw call per material it holds and the number wants to be coarser: 48 m
 * puts a 160 m plot in about sixteen chunks, which is few enough that the
 * per frame walk is nothing and fine enough that the far side of the plot
 * drops out past the cull radius.
 */
const CHUNK = 48;

/* The concrete paving's slab, and how many slabs one texture tile holds.
 * Six metres is a sawn joint spacing a yard slab of this kind really has;
 * four by four slabs per tile is what keeps the stains from repeating
 * inside one field of view. */
const SLAB = 6;
const TILE_SLABS = 4;

/* How far the verge and the kerb run round the plot, in metres. */
const KERB_W = 0.3;
const KERB_H = 0.12;
const VERGE_W = 5;

/* The yellow line painted round the plot, in from the kerb. */
const EDGE_LINE_INSET = 1.2;
const LINE_W = 0.14;

/* Wires: a pole is wired to a pole within this, a pylon to a pylon within
 * that. The numbers are the ones the palette's notes promise the author. */
const POLE_REACH = 45;
const PYLON_REACH = 150;

/*
 * The document to build.
 *
 * Never throws: a corrupt seat is the starter, the same rule custom.js
 * applies to the race seat, because a world that refuses to boot over a
 * bad local storage entry is a world nobody can reach to fix it.
 */
function chooseDocument(opts) {
  if (Object.prototype.hasOwnProperty.call(opts, 'document') && opts.document) {
    return { raw: opts.document, source: 'injected' };
  }
  try {
    const saved = readAutosave('full', 'freestyle');
    if (saved && saved.doc && docModeOf(saved.doc) === 'freestyle' && saved.doc.elements.length > 0) {
      return { raw: saved.doc, source: 'canvas' };
    }
  } catch (e) {
    /* Unreadable. The starter, below. */
  }
  return { raw: starterMap(), source: 'starter' };
}

/* ------------------------------------------------------------------ *
 * The pipeline, as the town's.
 * ------------------------------------------------------------------ */

/*
 * THE INK, WITH ONE CHANGE: THE SECOND DIFFERENCE IS TAKEN OF INVERSE DEPTH.
 *
 * The town's ink pass inks where the second difference of LINEAR depth,
 * over depth, passes a threshold. On a plane seen at a slant that quantity
 * is not zero: linear depth along the screen goes as one over the distance
 * from the horizon, so its second difference grows as the square of the
 * range. A town hides that behind its buildings. A yard is one flat plane
 * out to the kerb, and a pilot flying at two metres saw it as a band of ink
 * twenty pixels deep along the whole horizon, from about 20 m out to the
 * 98 m where the pass fades.
 *
 * Inverse depth is exactly linear across any plane in screen space, so its
 * second difference is zero on every flat surface at every angle, and to
 * first order it is the same number as the town's at a crease or an edge:
 * with dl = dc (1 + a) and dr = dc (1 + b) the town's term is a + b and this
 * one is a + b - a^2 - b^2 to second order. On a plane a is about -b and
 * the town's term comes to about 2 a^2, which is exactly what the squares
 * take away. Same sign, same thresholds, so every line the town draws on an
 * asset is drawn here, and the ground stops drawing one on itself.
 *
 * Done on this pipeline's own copy of the material, by replacing the two
 * lines, so ./vendored/core/post.js stays byte identical to upstream. If a
 * vendored update ever changes those lines the replacement finds nothing,
 * the town's ink runs unchanged, and `inkPlanar` in stats() says so.
 */
const INK_LINEAR = `      float sx = ( dl + dr - 2.0 * dc ) / dc;
      float sy = ( du + dd - 2.0 * dc ) / dc;`;
const INK_INVERSE = `      float sx = 2.0 - dc / dl - dc / dr;
      float sy = 2.0 - dc / du - dc / dd;`;

/*
 * The vendored pipeline with the two things it does to a shared renderer
 * undone, the scale floor a low tier needs, and the ink above. The first
 * two are CityPipeline from src/maps/city/index.js, restated rather than
 * exported from there, because importing the city's index would fetch the
 * whole town for a yard. The reasons for every line are in that file.
 */
class BuiltPipeline extends Pipeline {
  constructor(renderer, scene, camera, opts) {
    super(renderer, scene, camera, opts);
    this.shellPixelRatio = renderer.getPixelRatio();
    this.minScale = opts && opts.minScale != null ? opts.minScale : 1;
    this.preferScale = opts && opts.preferScale != null ? opts.preferScale : null;
    const frag = this.ink.mat.fragmentShader;
    this.inkPlanar = frag.includes(INK_LINEAR);
    if (this.inkPlanar) {
      this.ink.mat.fragmentShader = frag.replace(INK_LINEAR, INK_INVERSE);
      this.ink.mat.needsUpdate = true;
    }
  }

  setSize(w, h) {
    const dpr = window.devicePixelRatio || 1;
    let scale = this.forceScale
      || this.preferScale
      || (dpr < 1.5 ? 1.5 : Math.min(dpr, 2));
    if (w * h * scale * scale > this.pixelBudget) {
      scale = Math.max(this.minScale, Math.sqrt(this.pixelBudget / (w * h)));
    }
    this.scale = scale;
    const rw = Math.max(2, Math.floor(w * scale));
    const rh = Math.max(2, Math.floor(h * scale));
    this.size.set(rw, rh);

    this.rtScene.setSize(rw, rh);
    this.rtA.setSize(rw, rh);
    this.rtB.setSize(rw, rh);

    const texel = new THREE.Vector2(1 / rw, 1 / rh);
    this.ink.mat.uniforms.uTexel.value.copy(texel);
    this.fxaa.mat.uniforms.uTexel.value.copy(texel);
    this.ink.mat.uniforms.uNear.value = this.camera.near;
    this.ink.mat.uniforms.uFar.value = this.camera.far;
    this.ink.mat.uniforms.uThickness.value = 1.05 + 0.55 * scale;

    this.renderer.setPixelRatio(this.shellPixelRatio);
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '';
    this.renderer.domElement.style.height = '';
    setOutlineResolution(this.size.x, this.size.y);
  }
}

/* ------------------------------------------------------------------ *
 * The ground.
 * ------------------------------------------------------------------ */

function canvasTexture(c, repeatX, repeatY) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

/*
 * THE YARD'S CONCRETE, one tile of four by four slabs.
 *
 * The town's concrete, lifted and dropped a shade slab by slab the way a
 * yard poured in bays weathers, a sawn joint between every slab, a few
 * hairline cracks and oil stains. Low contrast on purpose: this is the
 * ground under everything, and the cel ramp already bands it by the light,
 * so anything louder than this reads as a pattern rather than as paving.
 */
function yardTexture() {
  const S = 512;
  const px = S / TILE_SLABS;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d');
  const rng = seededRandom(0x1b4a7d);
  /* Round the town's concreteMid rather than its concrete: the paler tone
   * is a footway at ten metres, and under a fog that ends in the same
   * near white it took the ground with it, so the yard read as haze. */
  const tones = ['#cdc9d2', '#c8c4ce', '#d1cdd5', '#c5c1cb', '#cbc7d0', '#c3bfc9'];
  for (let i = 0; i < TILE_SLABS; i += 1) {
    for (let k = 0; k < TILE_SLABS; k += 1) {
      g.fillStyle = tones[Math.floor(rng.next() * tones.length)];
      g.fillRect(i * px, k * px, px, px);
    }
  }
  /* Oil and water stains: soft, dark, few. */
  for (let n = 0; n < 16; n += 1) {
    const x = rng.range(0, S);
    const y = rng.range(0, S);
    const r = rng.range(6, 30);
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(96, 90, 116, 0.16)');
    grad.addColorStop(1, 'rgba(96, 90, 116, 0)');
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  /* Hairline cracks, a random walk from a slab edge. */
  g.strokeStyle = 'rgba(112, 106, 132, 0.45)';
  g.lineWidth = 1;
  for (let n = 0; n < 7; n += 1) {
    let x = Math.floor(rng.range(0, TILE_SLABS)) * px;
    let y = rng.range(0, S);
    g.beginPath();
    g.moveTo(x, y);
    const steps = 6 + Math.floor(rng.range(0, 6));
    for (let s = 0; s < steps; s += 1) {
      x += rng.range(2, 9);
      y += rng.range(-6, 6);
      g.lineTo(x, y);
    }
    g.stroke();
  }
  /* The sawn joints, two pixels on every slab boundary. The tile's own
   * edge gets one pixel on each side, so two tiles meet in one joint. */
  g.fillStyle = '#9d98a8';
  for (let i = 0; i <= TILE_SLABS; i += 1) {
    const at = i * px;
    g.fillRect(Math.max(0, at - 1), 0, i === 0 || i === TILE_SLABS ? 1 : 2, S);
    g.fillRect(0, Math.max(0, at - 1), S, i === 0 || i === TILE_SLABS ? 1 : 2);
  }
  return c;
}

/*
 * The ground past the kerb: the town's own terrain colour, 0xc4c4b6 from
 * its street grid, mottled so a pilot high over the plot reads distance off
 * it rather than a flat sheet. The same colour the gallery sits on, which
 * is why it is only ever seen past a verge and a kerb here.
 */
function terrainTexture() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#c4c4b6';
  g.fillRect(0, 0, S, S);
  const rng = seededRandom(0x7e4a11);
  for (let n = 0; n < 40; n += 1) {
    const x = rng.range(0, S);
    const y = rng.range(0, S);
    const r = rng.range(10, 42);
    const light = rng.chance(0.5);
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, light ? 'rgba(212, 210, 196, 0.5)' : 'rgba(170, 176, 150, 0.45)');
    grad.addColorStop(1, 'rgba(196, 196, 182, 0)');
    g.fillStyle = grad;
    /* Drawn at every wrap so the tile has no seam. */
    for (const ox of [-S, 0, S]) {
      for (const oy of [-S, 0, S]) {
        g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      }
    }
  }
  return c;
}

/*
 * Flat paint on the ground, batched by material. Every mark is a level
 * rectangle: centre, size along its own x and z, a heading and a height a
 * few millimetres off the paving.
 */
class Paint {
  constructor() {
    this.byMat = new Map();
    this.unit = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  }

  rect(mat, cx, cz, w, d, yaw, y) {
    if (!(w > 1e-3 && d > 1e-3)) {
      return;
    }
    const m = new THREE.Matrix4().makeRotationY(yaw);
    m.multiply(new THREE.Matrix4().makeScale(w, 1, d));
    m.setPosition(cx, y, cz);
    let list = this.byMat.get(mat);
    if (!list) {
      list = [];
      this.byMat.set(mat, list);
    }
    list.push({ geometry: this.unit, matrix: m });
  }

  /* A rectangle's outline, `t` wide, in an element's frame. */
  outline(mat, cx, cz, yaw, x0, x1, z0, z1, t, y) {
    const S = { s: 0, c: 1 };
    sincos(yaw, S);
    const at = (lx, lz) => [cx + lx * S.c + lz * S.s, cz - lx * S.s + lz * S.c];
    const [ax, az] = at((x0 + x1) / 2, z0 + t / 2);
    this.rect(mat, ax, az, x1 - x0, t, yaw, y);
    const [bx, bz] = at((x0 + x1) / 2, z1 - t / 2);
    this.rect(mat, bx, bz, x1 - x0, t, yaw, y);
    const [lx, lz] = at(x0 + t / 2, (z0 + z1) / 2);
    this.rect(mat, lx, lz, t, z1 - z0 - 2 * t, yaw, y);
    const [rx, rz] = at(x1 - t / 2, (z0 + z1) / 2);
    this.rect(mat, rx, rz, t, z1 - z0 - 2 * t, yaw, y);
  }

  finish(group) {
    for (const [mat, list] of this.byMat) {
      const geo = bake(list);
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      mesh.name = 'groundPaint';
      group.add(mesh);
    }
    this.unit.dispose();
    this.byMat.clear();
  }
}

/*
 * The plot, its kerb, the verge, the terrain, and the paint on the plot.
 * Returns the group, what it painted for stats(), and a way to stop a logo
 * still decoding from painting into a map that has gone.
 */
function buildGround(placed, doc) {
  const { W, D } = placed;
  const group = new THREE.Group();
  group.name = 'ground';

  /* The paving: a plane the size of the field, at exactly zero, which is
   * the height the plant flies over. */
  const yard = canvasTexture(yardTexture(), W / (SLAB * TILE_SLABS), D / (SLAB * TILE_SLABS));
  const plot = new THREE.Mesh(
    new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2),
    cel({ color: 0xffffff, map: yard, bands: 3, tint: 0x6f6790, cache: false }),
  );
  plot.receiveShadow = true;
  plot.name = 'plot';
  group.add(plot);

  /* The kerb, one box a side, so the ink draws the plot's edge. Paint, not
   * a solid: it is twelve centimetres high and the plant's ground is flat. */
  const kerbMat = cel({ color: PAL.curb, bands: 3, tint: 0x6f6790, cache: false });
  const kerbs = [];
  const kw = KERB_W;
  const addBox = (list, x0, z0, x1, z1, y0, y1) => {
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    list.push({ geometry: g });
  };
  addBox(kerbs, -W / 2 - kw, -D / 2 - kw, W / 2 + kw, -D / 2, -0.3, KERB_H);
  addBox(kerbs, -W / 2 - kw, D / 2, W / 2 + kw, D / 2 + kw, -0.3, KERB_H);
  addBox(kerbs, -W / 2 - kw, -D / 2, -W / 2, D / 2, -0.3, KERB_H);
  addBox(kerbs, W / 2, -D / 2, W / 2 + kw, D / 2, -0.3, KERB_H);
  const kerb = new THREE.Mesh(bake(kerbs), kerbMat);
  kerb.receiveShadow = true;
  kerb.castShadow = true;
  kerb.name = 'kerb';
  group.add(kerb);
  for (const k of kerbs) {
    k.geometry.dispose();
  }

  /* The verge: a band of the town's grass between the kerb and the
   * terrain, two centimetres under the paving. */
  const verges = [];
  const vw = VERGE_W + kw;
  addBox(verges, -W / 2 - vw, -D / 2 - vw, W / 2 + vw, -D / 2 - kw, -0.3, -0.02);
  addBox(verges, -W / 2 - vw, D / 2 + kw, W / 2 + vw, D / 2 + vw, -0.3, -0.02);
  addBox(verges, -W / 2 - vw, -D / 2 - kw, -W / 2 - kw, D / 2 + kw, -0.3, -0.02);
  addBox(verges, W / 2 + kw, -D / 2 - kw, W / 2 + vw, D / 2 + kw, -0.3, -0.02);
  const verge = new THREE.Mesh(bake(verges), cel({ color: PAL.grass, bands: 3, tint: 0x5b6f8c, cache: false }));
  verge.receiveShadow = true;
  verge.name = 'verge';
  group.add(verge);
  for (const v of verges) {
    v.geometry.dispose();
  }

  /*
   * The terrain, out past the fog.
   *
   * IN FORTY METRE CELLS, NOT ONE QUAD. Five centimetres under the paving,
   * a two kilometre quad came out IN FRONT of it: from 3 m up on High at
   * 1280 by 720 the whole yard, paint and all, was the terrain's beige
   * (headless Chromium's software rasteriser; it was there before the fog
   * moved, and the same frame at 960 by 540 was clean). Its two triangles
   * are clipped by a near plane 0.2 m from the eye, and the depth across
   * what is left of a triangle that size is the likely culprit: the same
   * frame with the terrain hidden, dropped to -0.3 m, or cut into these
   * cells shows the yard every time. Cells cost 5,000 triangles and no
   * draw call.
   */
  const TERRAIN = 2000;
  const TERRAIN_CELLS = 50;
  const terrainTex = canvasTexture(terrainTexture(), TERRAIN / 40, TERRAIN / 40);
  const terrain = new THREE.Mesh(
    new THREE.PlaneGeometry(TERRAIN, TERRAIN, TERRAIN_CELLS, TERRAIN_CELLS).rotateX(-Math.PI / 2),
    cel({ color: 0xffffff, map: terrainTex, bands: 3, tint: 0x7a7396, cache: false }),
  );
  terrain.position.y = -0.05;
  terrain.receiveShadow = true;
  terrain.name = 'terrain';
  group.add(terrain);

  /* ---- paint ---- */
  const white = cel({ color: PAL.lineWhite, bands: 2, tint: 0x8e86ad, cache: false });
  const yellow = cel({ color: PAL.lineYellow, bands: 2, tint: 0x8a7a70, cache: false });
  const asphalt = cel({ color: PAL.road, bands: 3, tint: 0x6a608f, cache: false });
  const paint = new Paint();
  const painted = { lanes: 0, bays: 0, startBox: 0, logos: 0 };

  /* The line round the plot. */
  const ex = W / 2 - EDGE_LINE_INSET;
  const ez = D / 2 - EDGE_LINE_INSET;
  paint.outline(yellow, 0, 0, 0, -ex, ex, -ez, ez, LINE_W, 0.008);

  for (const it of placed.items) {
    const type = it.el.type;
    /*
     * A BRIDGE MEANS A ROAD UNDER IT. The lane is painted square to the
     * span, through the middle of it, from kerb to kerb, so a footbridge is
     * a footbridge over something. A bridge only ever stands at a quarter
     * turn (it has boxes), so the lane is always along a world axis.
     */
    if (type === 'bridge') {
      const span = it.el.dims.span;
      const foot = it.el.style === 'footbridge';
      const col = foot ? 0.18 : 0.6;
      const laneW = Math.max(3, Math.min(7, span - 2 * (0.8 + col + 0.6)));
      const S = { s: 0, c: 1 };
      sincos(it.yaw, S);
      /* The lane runs along the bridge's local z. */
      const alongX = Math.abs(S.s) > 0.5;
      const len = alongX ? W : D;
      const cx = alongX ? 0 : it.x;
      const cz = alongX ? it.z : 0;
      const lw = alongX ? len : laneW;
      const ld = alongX ? laneW : len;
      paint.rect(asphalt, cx, cz, lw, ld, 0, 0.004);
      /* Edge lines, and a dashed centre line: three metres on, three off. */
      const off = laneW / 2 - 0.3;
      for (const s of [-1, 1]) {
        if (alongX) {
          paint.rect(white, 0, it.z + s * off, len, 0.12, 0, 0.01);
        } else {
          paint.rect(white, it.x + s * off, 0, 0.12, len, 0, 0.01);
        }
      }
      for (let a = -len / 2 + 1.5; a < len / 2 - 3; a += 6) {
        if (alongX) {
          paint.rect(white, a + 1.5, it.z, 3, 0.12, 0, 0.01);
        } else {
          paint.rect(white, it.x, a + 1.5, 0.12, 3, 0, 0.01);
        }
      }
      painted.lanes += 1;
    }
    /* A container stack gets its bay painted round it, half a metre out. */
    if (type === 'containers') {
      const b = planBounds(it.parts);
      paint.outline(yellow, it.x, it.z, it.yaw, b.x0 - 0.6, b.x1 + 0.6, b.z0 - 0.6, b.z1 + 0.6, LINE_W, 0.008);
      painted.bays += 1;
    }
    /* The launch box round the pads, and an arrow the way they face. */
    if (type === 'startPads') {
      const b = planBounds(it.parts);
      paint.outline(white, it.x, it.z, it.yaw, b.x0 - 1.0, b.x1 + 1.6, b.z0 - 0.8, b.z1 + 0.8, 0.12, 0.009);
      const S = { s: 0, c: 1 };
      sincos(it.yaw, S);
      const at = (lx, lz) => [it.x + lx * S.c + lz * S.s, it.z - lx * S.s + lz * S.c];
      /* A chevron ahead of the box, pointing the way the pads face: two
       * bars from 0.9 m either side up to a tip on the heading. */
      const tip = b.x1 + 3.6;
      for (const side of [-1, 1]) {
        const [mx, mz] = at(tip - 0.45, side * 0.45);
        paint.rect(white, mx, mz, 1.27, 0.16, it.yaw + side * (Math.PI / 4), 0.009);
      }
      painted.startBox += 1;
    }
  }
  paint.finish(group);

  /* ---- the sponsors' marks, from the document's own logos ---- */
  const logos = [];
  for (const it of placed.items) {
    if (it.el.type !== 'groundLogo') {
      continue;
    }
    const mark = logoForDecal(doc, it.el);
    if (!mark || typeof mark.image !== 'string' || !mark.image.startsWith('data:image/')) {
      continue;
    }
    logos.push(groundLogo(it, mark.image));
    painted.logos += 1;
  }
  for (const l of logos) {
    group.add(l.mesh);
  }
  return {
    group,
    painted,
    cancelLogos() {
      for (const l of logos) {
        l.cancel();
      }
    },
  };
}

/*
 * ONE GROUND LOGO: a plane the size of the decal's footprint, carrying a
 * canvas the mark is fitted into once it has decoded.
 *
 * The canvas is the footprint's own shape, and it is laid on the plane the
 * way src/render/scene.js lays its pitch: a PlaneGeometry turned down about
 * X puts canvas right along the decal's local x and canvas down along its
 * local z, and the element's heading then turns the plane exactly as it
 * turns the element. Painted with paintGroundLogo at the same ink the race
 * field uses, so a sponsor's mark on a yard reads as paint, not a sticker.
 */
function groundLogo(it, dataUrl) {
  const w = Math.max(0.1, it.el.dims.width);
  const d = Math.max(0.1, it.el.dims.depth);
  const long = 512;
  const cw = w >= d ? long : Math.max(8, Math.round((long * w) / d));
  const ch = w >= d ? Math.max(8, Math.round((long * d) / w)) : long;
  const cv = document.createElement('canvas');
  cv.width = cw;
  cv.height = ch;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const mat = cel({ color: 0xffffff, map: tex, bands: 3, tint: 0x6f6790, transparent: true, depthWrite: false, cache: false });
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -2;
  mat.polygonOffsetUnits = -2;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), mat);
  mesh.position.set(it.x, 0.014, it.z);
  mesh.rotation.y = it.yaw;
  mesh.receiveShadow = true;
  mesh.name = 'groundLogo';
  let live = true;
  const img = new Image();
  img.onload = () => {
    if (!live) {
      return;
    }
    const g = cv.getContext('2d');
    g.imageSmoothingQuality = 'high';
    paintGroundLogo(g, cw, ch, { logo: img });
    tex.needsUpdate = true;
  };
  img.src = dataUrl;
  return {
    mesh,
    cancel() {
      live = false;
      img.onload = null;
    },
  };
}

/* ------------------------------------------------------------------ *
 * Wires.
 * ------------------------------------------------------------------ */

/* Where each wire leaves an element, in its own frame, grouped by the
 * wire it belongs to. The pole's insulator tops come from its own layout
 * (poleWireAnchors in src/props/street.js), so moving an arm moves its
 * wires with it. The pylon's are read off src/props/industrial.js: the
 * bottom of each insulator string, and the peak. */
function wireAnchors(el) {
  if (el.type === 'utilityPole') {
    return poleWireAnchors(el);
  }
  if (el.type === 'pylon') {
    const H = Math.min(60, Math.max(12, el.dims.height));
    const arms = [0.62, 0.76, 0.9];
    const out = arms.map((f, k) => {
      const reach = k === 1 ? 5.2 : 4.2;
      const y = H * f - 1.9 - 0.09;
      return [[-(reach - 0.1), y, 0], [reach - 0.1, y, 0]];
    });
    out.push([[0, H, 0]]);
    return out;
  }
  return null;
}

function toWorld(it, p) {
  const S = { s: 0, c: 1 };
  sincos(it.yaw, S);
  return new THREE.Vector3(
    it.x + p[0] * S.c + p[2] * S.s,
    it.y + p[1],
    it.z - p[0] * S.s + p[2] * S.c,
  );
}

/*
 * WHICH POLES ARE WIRED TOGETHER: a minimum spanning forest over the
 * poles, with nothing longer than the reach.
 *
 * Every pole's nearest neighbour inside the reach is an edge of that
 * forest (the nearest neighbour graph is part of any minimum spanning
 * tree), so this does what the palette's note promises, and it also joins
 * a line of poles end to end the way a street is wired, which wiring each
 * pole to its nearest alone does not: two pairs 30 m apart would stay two
 * pairs. It never closes a loop, so no two poles carry two runs.
 */
function wirePairs(items, reach) {
  const edges = [];
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      const d = Math.hypot(items[i].x - items[j].x, items[i].z - items[j].z);
      if (d > 0.5 && d <= reach) {
        edges.push({ i, j, d });
      }
    }
  }
  edges.sort((a, b) => a.d - b.d || a.i - b.i || a.j - b.j);
  const parent = items.map((_, i) => i);
  const find = (i) => {
    let r = i;
    while (parent[r] !== r) {
      r = parent[r];
    }
    parent[i] = r;
    return r;
  };
  const out = [];
  for (const e of edges) {
    const a = find(e.i);
    const b = find(e.j);
    if (a !== b) {
      parent[a] = b;
      out.push([items[e.i], items[e.j]]);
    }
  }
  return out;
}

/*
 * The wires, as one merged mesh of sagging tubes in the town's wire
 * material. Render only: nothing here reaches the colliders. Each run's
 * anchors are matched across by their offset to the side of the run, so
 * two poles facing opposite ways still wire left to left.
 */
function buildWires(placed) {
  const poles = placed.items.filter((it) => it.el.type === 'utilityPole');
  const pylons = placed.items.filter((it) => it.el.type === 'pylon');
  const tubes = [];
  let runs = 0;
  const wireRun = (A, B, sagOf, r) => {
    const ga = wireAnchors(A.el);
    const gb = wireAnchors(B.el);
    const dx = B.x - A.x;
    const dz = B.z - A.z;
    const n = Math.hypot(dx, dz) || 1;
    const side = (v) => (v.x * -dz + v.z * dx) / n;
    for (let g = 0; g < Math.min(ga.length, gb.length); g += 1) {
      const pa = ga[g].map((p) => toWorld(A, p)).sort((a, b) => side(a) - side(b));
      const pb = gb[g].map((p) => toWorld(B, p)).sort((a, b) => side(a) - side(b));
      for (let k = 0; k < Math.min(pa.length, pb.length); k += 1) {
        const dist = pa[k].distanceTo(pb[k]);
        const curve = sagCurve(pa[k], pb[k], sagOf(dist), 12);
        tubes.push({ geometry: new THREE.TubeGeometry(curve, 16, r, 4, false) });
      }
    }
    runs += 1;
  };
  /* The town's own sag for a street span; a transmission line hangs about
   * three and a half percent of its span. */
  for (const [a, b] of wirePairs(poles, POLE_REACH)) {
    wireRun(a, b, (dist) => 0.5 * Math.min(1.6, dist / 14), 0.022);
  }
  for (const [a, b] of wirePairs(pylons, PYLON_REACH)) {
    wireRun(a, b, (dist) => 0.035 * dist, 0.04);
  }
  if (!tubes.length) {
    return { mesh: null, runs: 0, triangles: 0 };
  }
  const geo = bake(tubes);
  for (const t of tubes) {
    t.geometry.dispose();
  }
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, cel({ color: 0x4c4658, bands: 2, tint: 0x413c58 }));
  mesh.name = 'wires';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  const tris = geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3;
  return { mesh, runs, triangles: tris };
}

/* ------------------------------------------------------------------ *
 * The title camera.
 * ------------------------------------------------------------------ */

/* The plan distance from (x, z) to a solid, and its top. */
function planReach(o, x, z) {
  if (o.box) {
    const b = o.box;
    const dx = Math.max(b[0] - x, 0, x - b[3]);
    const dz = Math.max(b[2] - z, 0, z - b[5]);
    return { d: Math.hypot(dx, dz), top: b[4] };
  }
  const c = o.cap;
  const ex = c[3] - c[0];
  const ez = c[5] - c[2];
  const L = ex * ex + ez * ez;
  const t = L > 1e-9 ? Math.max(0, Math.min(1, ((x - c[0]) * ex + (z - c[2]) * ez) / L)) : 0;
  const d = Math.hypot(c[0] + ex * t - x, c[2] + ez * t - z) - c[6];
  return { d: Math.max(0, d), top: Math.max(c[1], c[4]) + c[6] };
}

/*
 * A slow orbit round the plot, inside its edge, and lifted over whatever
 * stands near the line.
 *
 * The path is a circle rather than anything the author drew, because a
 * built map has no road the camera can know is empty. So the clearance is
 * taken from the solids themselves: each sample rises to four metres over
 * the tallest solid within ten metres of it in plan, and a smoothing pass
 * that never goes BELOW that requirement spreads each rise over its
 * neighbours so the camera climbs over a crane rather than hopping it. The
 * direction is the one that keeps the plot on the camera's right, which is
 * the side of the frame the title menu leaves open.
 */
function orbitPath(placed) {
  const R = 0.36 * Math.min(placed.W, placed.D);
  const N = 48;
  const EYE = 7;
  const req = [];
  const pts = [];
  const S = { s: 0, c: 1 };
  for (let i = 0; i < N; i += 1) {
    sincos((i / N) * Math.PI * 2, S);
    const x = R * S.c;
    const z = R * S.s;
    let need = EYE;
    for (const o of placed.solids) {
      const r = planReach(o, x, z);
      if (r.d < 10) {
        need = Math.max(need, r.top + 4);
      }
    }
    req.push(need);
    pts.push({ x, y: need, z });
  }
  for (let pass = 0; pass < 6; pass += 1) {
    const prev = pts.map((p) => p.y);
    for (let i = 0; i < N; i += 1) {
      const avg = (prev[(i + N - 1) % N] + prev[i] + prev[(i + 1) % N]) / 3;
      pts[i].y = Math.max(req[i], avg, prev[i] * 0.5 + avg * 0.5);
    }
  }
  return pts;
}

/* ------------------------------------------------------------------ *
 * The map.
 * ------------------------------------------------------------------ */

function chunkKeyOf(item) {
  return `${Math.floor(item.x / CHUNK)},${Math.floor(item.z / CHUNK)}`;
}

function trianglesOf(root) {
  let n = 0;
  root.traverse((o) => {
    if (o.isMesh && o.geometry) {
      const g = o.geometry;
      n += g.index ? g.index.count / 3 : g.attributes.position.count / 3;
    }
  });
  return Math.round(n);
}

export async function buildMap(shell, onProgress, options) {
  const t0 = performance.now();
  const renderer = shell.renderer;
  const camera = shell.camera;
  const progress = onProgress ?? (() => {});
  const opts = options || {};
  const q = qualityFor(opts.quality);

  /* The document, repaired the way every read of one is, then placed. */
  const chosen = chooseDocument(opts);
  const { doc, repairs } = normalize(chosen.raw);
  const placed = placeDocument(doc);
  progress(0.05);

  /*
   * How far the pilot sees, and everything that has to agree with it. The
   * cull radius is the fog's end plus the town's 4 m, measured to the
   * nearest point of a chunk, so nothing is switched off while it can still
   * be seen. The shadow box is a share of the view (SHADOW_SHARE). The
   * ridge lines are pushed out past the plot's corner if the plot reaches
   * them, the sky dome past the ridge lines and the fog, and the far plane
   * past the dome.
   */
  const { near: fogNear, far: fogFar } = fogFor(q.id, placed.W, placed.D);
  const cullDefault = fogFar + 4;
  const half = Math.min(SHADOW_HALF_MAX, Math.max(q.city.shadowHalf, SHADOW_SHARE * fogFar));
  const hillScale = Math.max(1, (Math.hypot(placed.W, placed.D) / 2 + 60) / HILLS_NEAR);
  const skyRadius = Math.max(500, fogFar + 80, HILLS_FAR * hillScale + 60);
  const cameraFar = Math.max(CAMERA_FAR, skyRadius * 1.8);

  /* Renderer state is the map's: the town's filtering and clear colour. */
  renderer.shadowMap.enabled = q.shadows;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor(new THREE.Color(PAL.fog), 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(PAL.fog, fogNear, fogFar);
  camera.far = cameraFar;
  camera.updateProjectionMatrix();

  /* The town's four lights, at the town's offsets from the shadow target.
   * See src/maps/city/index.js for the shadow box and its numbers. */
  const sun = new THREE.DirectionalLight(PAL.sun, 2.25);
  sun.castShadow = q.shadows;
  const shadowMap = q.city.shadowMap || 2048;
  sun.shadow.mapSize.set(shadowMap, shadowMap);
  sun.shadow.camera.left = -half;
  sun.shadow.camera.right = half;
  sun.shadow.camera.top = half;
  sun.shadow.camera.bottom = -half;
  /* The shadow camera stands on the sun's line back from the target, far
   * enough that a tall thing at the edge of a box this wide is in front of
   * it, and sees on past the far side. With the town's 22 m box this is
   * the town's own offset and about its 200 m. */
  const sunBack = Math.max(Math.hypot(-52, 62, 56), 1.5 * half + 40);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = sunBack + 1.5 * half + 60;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.035;
  scene.add(sun);
  scene.add(sun.target);
  const fill = new THREE.DirectionalLight(PAL.fill, 1.08);
  scene.add(fill);
  scene.add(fill.target);
  const bounce = new THREE.DirectionalLight(0xd8cbe8, 0.34);
  scene.add(bounce);
  scene.add(bounce.target);
  scene.add(new THREE.HemisphereLight(PAL.hemiSky, PAL.hemiGround, 1.12));
  const SUN_OFFSET = new THREE.Vector3(-52, 62, 56).setLength(sunBack);
  const FILL_OFFSET = new THREE.Vector3(48, 26, -44);
  const BOUNCE_OFFSET = new THREE.Vector3(10, -18, 40);

  const sky = buildSky(scene, skyRadius);
  const hills = buildDistantHills(scene);
  /* Out, not up: the ridges keep their height and move past the plot. */
  hills.scale.set(hillScale, 1, hillScale);
  progress(0.1);
  await yieldToPaint();

  /* The ground and its paint. */
  const ground = buildGround(placed, doc);
  scene.add(ground.group);
  progress(0.2);
  await yieldToPaint();

  /*
   * THE ASSETS, one kit for the whole map, grouped into chunks by where
   * each element stands. The kit bakes each element's parts and paint into
   * one batch per material per chunk, so a map of fifty assets is a few
   * hundred draw calls at most and a chunk switched off takes all of its
   * batches with it.
   */
  const kit = new PropKit();
  for (const it of placed.items) {
    kit.begin(it.x, it.y, it.z, it.yaw, chunkKeyOf(it));
    kit.element(it.el);
  }
  progress(0.7);
  await yieldToPaint();
  const props = kit.finish();
  scene.add(props);
  progress(0.8);

  const wires = buildWires(placed);
  if (wires.mesh) {
    scene.add(wires.mesh);
  }

  /*
   * THE CULL CELLS, one per chunk group, and each one's bounds are the
   * bounds of what it actually drew rather than the 48 m cell it was filed
   * under: a crane filed in one cell reaches thirty metres into the next,
   * and measuring to the cell would switch its jib off while the jib was
   * still inside the radius. The test is the town's, to the nearest point
   * of the bounds, so nothing inside the radius is ever switched off.
   */
  const cells = [];
  const bb = new THREE.Box3();
  for (const g of props.children) {
    bb.makeEmpty();
    for (const m of g.children) {
      if (!m.geometry.boundingBox) {
        m.geometry.computeBoundingBox();
      }
      bb.union(m.geometry.boundingBox);
    }
    if (bb.isEmpty()) {
      continue;
    }
    cells.push({
      group: g,
      x0: bb.min.x,
      x1: bb.max.x,
      z0: bb.min.z,
      z1: bb.max.z,
      on: true,
    });
  }

  /* THE SOLIDS: exactly what place.js said, into the collider set the
   * shell uploads to the plant. */
  const colliders = new Colliders();
  const solidCount = addSolids(colliders, placed.solids);
  colliders.build();
  progress(0.9);

  const pipeline = new BuiltPipeline(renderer, scene, camera, {
    pixelBudget: q.city.pixelBudget,
    minScale: q.city.minScale,
    preferScale: q.city.preferScale,
  });
  pipeline.enabled.ink = q.city.ink;
  pipeline.enabled.fxaa = q.city.fxaa;
  const dims = shell.resize();
  pipeline.setSize(dims.w, dims.h);

  scene.add(shell.quad);
  progress(1);

  const shadowTarget = new THREE.Vector3();
  function seat(light, offset, origin) {
    light.target.position.copy(origin);
    light.position.copy(origin).add(offset);
    light.target.updateMatrixWorld();
  }

  let cullRadius = cullDefault;
  let cullR2 = cullRadius * cullRadius;
  function setCullRadius(r) {
    cullRadius = r == null ? cullDefault : r;
    cullR2 = cullRadius * cullRadius;
  }
  function cullTo(eye) {
    for (let i = 0; i < cells.length; i += 1) {
      const c = cells[i];
      const dx = Math.max(0, c.x0 - eye.x, eye.x - c.x1);
      const dz = Math.max(0, c.z0 - eye.z, eye.z - c.z1);
      const on = dx * dx + dz * dz <= cullR2;
      if (c.on !== on) {
        c.on = on;
        c.group.visible = on;
      }
    }
  }

  function updateShadowFocus(target) {
    /* Snapped to half a metre, for the town's reason: a shadow camera that
     * follows the craft exactly crawls every texel edge. */
    shadowTarget.set(
      Math.round(target.x * 2) / 2,
      Math.round(target.y * 2) / 2,
      Math.round(target.z * 2) / 2,
    );
    seat(sun, SUN_OFFSET, shadowTarget);
    seat(fill, FILL_OFFSET, shadowTarget);
    seat(bounce, BOUNCE_OFFSET, shadowTarget);
    sky.dome.position.copy(camera.position);
    sky.clouds.position.copy(camera.position);
    cullTo(camera.position);
  }
  /* Seated once now, so the first frame, and the title behind the menu,
   * are lit before anything calls in. */
  updateShadowFocus(new THREE.Vector3(placed.spawn.x, 0, placed.spawn.z));

  /* One frozen answer: a map with no gates has no target, ever. */
  const AIM = Object.freeze({ active: false, sceneIndex: -1, correct: true, distance: 0 });

  const buildMs = Math.round(performance.now() - t0);
  const propTriangles = trianglesOf(props);
  const groundTriangles = trianglesOf(ground.group);
  let batches = 0;
  props.traverse((o) => {
    if (o.isMesh) {
      batches += 1;
    }
  });

  return {
    id: 'built',
    name: doc.name,
    mode: 'freestyle',
    graphics: q.id,
    scene,
    post: pipeline,
    colliders,
    /* A freestyle map: no gates, no line, no lap. */
    gates: [],
    curve: null,
    spawn: placed.spawn,
    /* Only path, speed, lookAhead and aimDrop are read: see
     * src/render/attract.js. */
    attract: {
      path: orbitPath(placed),
      speed: 8,
      lookAhead: 16,
      aimDrop: 3,
    },
    references: {},
    /* Flat, at zero, everywhere: the paving and the ground past it. Every
     * roof and deck is a box, and the plant lands on box tops itself. */
    height: () => 0,
    setNextGate() {},
    targetAim: () => AIM,
    approachSide: () => null,
    hasRacingLine: false,
    setRacingLine() {},
    updateRacingLine() { return null; },
    updateShadowFocus,
    updateWind() {},
    /* Nothing on a built map moves yet. When vehicles arrive (the plan's
     * Stage E) this is where they are posed, from the step count. */
    updateAnim() {},
    setCullRadius,
    /* Which document this is and where it came from, for the harness and
     * for the shell to say so. */
    documentId: doc.id,
    source: chosen.source,
    stats: () => ({
      source: chosen.source,
      documentId: doc.id,
      repairs: repairs.length,
      elements: doc.elements.length,
      items: placed.items.length,
      zones: placed.zones.length,
      solids: solidCount,
      inflatedBoxes: placed.stats.inflated || 0,
      colliders: colliders.stats(),
      chunks: cells.length,
      chunksOn: cells.filter((c) => c.on).length,
      batches,
      propTriangles,
      triangles: propTriangles + groundTriangles + wires.triangles,
      wireRuns: wires.runs,
      painted: ground.painted,
      kit: { ...kit.counts },
      cullRadius,
      fog: { near: fogNear, far: fogFar },
      shadowExtent: half,
      skyRadius,
      cameraFar,
      pipelineScale: pipeline.scale,
      pipelineSize: { x: pipeline.size.x, y: pipeline.size.y },
      inkPlanar: pipeline.inkPlanar,
      buildMs,
    }),
    dispose() {
      ground.cancelLogos();
      shell.evictSessionRoots(scene);
      pipeline.dispose();
      disposeSceneGraph(scene, SESSION_TEXTURES);
      /* The kit's own textured materials (signs, graffiti, adverts) live in
       * a module cache so a second element reuses them; the scene walk has
       * already freed the ones this map drew, and this frees any the kit
       * made that never reached the scene. */
      for (const m of ownedPropMaterials()) {
        if (m.map) {
          m.map.dispose();
        }
        m.dispose();
      }
    },
  };
}
