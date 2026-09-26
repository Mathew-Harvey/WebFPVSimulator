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
 * ridge lines (closed into rings round the plot, see buildBackdrop), the
 * same post chain with the same shared renderer fixes. The assets are
 * src/props, drawn by src/props/kit.js in the town's cel materials. What
 * is this file's own is the ground (a plot, not a town), how far the fog
 * lets a pilot see (see fogFor), the wires between poles and pylons, the
 * lamps' glow at dusk, and the title camera's orbit.
 *
 * A MAP HAS A TIME OF DAY AND A GROUND (the document's scene, see
 * ./looks.js). Golden hour over concrete is the town's light on a concrete
 * yard, number for number what this map was before scenes existed; the
 * other times repaint the same lights, sky, fog and grade from ./looks.js,
 * and the other grounds are painted here, each in the yard's manner.
 *
 * THE SOLIDS COME FROM ONE PLACE. src/maps/built/place.js places the
 * document and says what is solid; this file puts exactly that into a
 * Colliders and hands it to the shell, which uploads it to the plant. The
 * builder's warnings read the same placement, so the map and the editor
 * cannot disagree about where a wall is. The paving is flat and at zero,
 * and `height` is the top of the box under a point, when there is one
 * within a step of the query (groundUnder in ./place.js), so the shell
 * seats, measures and sets a craft down on a roof as the plant already
 * stands it on one.
 *
 * EVERY MAP CARRIES THE STF MARK (FREESTYLE-MAPS-PLAN.md section 9), and
 * the author does not choose where: ./egg.js chooses from the placed map,
 * this file paints it there (paintStfMark) and hands the shell where it is
 * as `egg`. It is paint, so no solid comes of it. The builder imports
 * neither this file nor ./egg.js, so it never shows where the mark will be:
 * the person who built a map sees it from the pads when they fly it, like
 * everybody else.
 *
 * THE CARS MOVE, AND NOTHING ELSE DOES. A map's roads and vehicles
 * (./traffic.js) are drawn by ./roadmesh.js and ./cars.js, and the physics
 * module drives the cars: the shell uploads the traffic this file hands it,
 * reads every car's pose after it steps, and gives them back to poseCars to
 * draw. So updateAnim is still a no op, and the per frame work is that,
 * seating the lights, trailing the sky and switching chunks on and off by
 * distance.
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
import { buildSky } from '../city/vendored/core/sky.js';
import { setOutlineResolution } from '../city/vendored/core/outline.js';
import { cel, flat } from '../city/vendored/core/toon.js';
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
import { seededRandom, hashString } from '../../props/parts.js';
import { paintGroundLogo } from '../../art/banners.js';
import { makeStfMark } from '../../art/stf.js';
import { placeDocument, groundUnder, topUnder, PLATFORM_REACH } from './place.js';
import { starterMap } from './starter.js';
import { lookOf, kitLook, paintLights, paintSky, paintPost } from './looks.js';
import { chooseStfSpot } from './egg.js';
import { trafficOf, uploadTraffic } from './traffic.js';
import { buildRoadMesh, roadCover } from './roadmesh.js';
import { buildCars } from './cars.js';

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

/* The ridge lines' nearer ring stands this far out (buildBackdrop), and a
 * plot whose corner reaches it would put a painted hill in the yard. The
 * far ring stands where the town's far layer stands behind the camera. */
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

/* How far the STF mark stands off the surface it is sprayed on, in metres:
 * the town's own lift (STF_SPOT.off in src/maps/city/places/works.js), so
 * paint reads the same in both worlds. Enough that the depth buffer never
 * mixes the paint with the steel at the range a pilot finds it from, and
 * little enough that it reads as sprayed on, not hung in front. */
const STF_LIFT = 0.015;

/*
 * THE DRAWN SKIN IS NOT THE SOLID. ./egg.js chooses a face of a solid box,
 * and the kit draws detail proud of its boxes: a container's door leaves
 * stand 3.5 cm off the collider's face, their ribs 5 cm, the locking bars
 * 12 cm and the cam keepers 13, and its flutes and rails 3.5 to 5 cm. Paint
 * lifted off the collider's face sat behind the doors, and a pilot who was
 * told they had found it saw a container door. So the drawn surface under
 * the mark is probed: rays from STF_PROBE out along the normal back onto
 * the face, on a grid of STF_PROBE_U by STF_PROBE_V shares of the mark,
 * against the drawn batches of its chunk, and the paint goes STF_LIFT off
 * the depth STF_PROBE_SHARE of the way up those depths sorted: in front of
 * the door leaves, their ribs and the placard, 5.6 cm out on the starter's
 * container, and behind a locking bar across them, which then stands in
 * front of the paint the way a real one would. STF_PROBE is past the
 * proudest detail the kit puts on a box face and short of anything that is
 * not the asset's own skin.
 */
const STF_PROBE = 0.2;
const STF_PROBE_U = [-0.45, -0.225, 0, 0.225, 0.45];
const STF_PROBE_V = [-0.4, 0, 0.4];
const STF_PROBE_SHARE = 0.75;

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
 * Exported for src/props/gallery.js, so the asset gallery inks the way a
 * built map does.
 */
export class BuiltPipeline extends Pipeline {
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
 * is why it is only ever seen past a verge and a kerb here. A grass or dirt
 * plot stands in land of its own kind (the ground's `terrain` in
 * ./looks.js), since a lawn in a beige plain reads as a carpet.
 */
function terrainTexture(tone) {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = tone.base;
  g.fillRect(0, 0, S, S);
  const rng = seededRandom(0x7e4a11);
  for (let n = 0; n < 40; n += 1) {
    const x = rng.range(0, S);
    const y = rng.range(0, S);
    const r = rng.range(10, 42);
    const light = rng.chance(0.5);
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, light ? tone.light : tone.dark);
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
 * THE OTHER GROUNDS, each one tile of paint in the yard's manner: a flat
 * base, broad soft mottling a pilot reads distance off from the air, and
 * a little close detail, all of it low in contrast, because the cel ramp
 * bands the ground by the light already and anything louder than paving
 * reads as a pattern. Every mark is drawn at each wrap of the tile, so
 * tiles meet with no seam.
 */
const GROUND_TILE = { tarmac: 16, grass: 12, dirt: 14 };

function groundCanvas(S, base) {
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, S, S);
  /* Draw at every wrap, so a mark over the tile's edge comes back in on
   * the other side. */
  const wrapped = (draw) => {
    for (const ox of [-S, 0, S]) {
      for (const oy of [-S, 0, S]) {
        draw(ox, oy);
      }
    }
  };
  const blob = (x, y, r, inner, outer) => {
    wrapped((ox, oy) => {
      const grad = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      grad.addColorStop(0, inner);
      grad.addColorStop(1, outer);
      g.fillStyle = grad;
      g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    });
  };
  return { c, g, wrapped, blob };
}

/*
 * TARMAC: a car park's asphalt, dark and a little violet like the town's
 * road, with the fine grain of its stone, the lighter wear where wheels
 * have run, tar sealing wandering along old cracks, and oil. The markings
 * and the cut and filled repairs are laid over it in the world
 * (tarmacMarks, tarmacRepairs), not in the tile.
 */
function tarmacTexture() {
  const S = 512;
  const { c, g, wrapped, blob } = groundCanvas(S, '#6b6978');
  const rng = seededRandom(0x2a7c55);
  for (let n = 0; n < 30; n += 1) {
    const light = rng.chance(0.5);
    blob(rng.range(0, S), rng.range(0, S), rng.range(30, 110),
      light ? 'rgba(146, 142, 158, 0.18)' : 'rgba(76, 74, 90, 0.2)', 'rgba(107, 105, 120, 0)');
  }
  /* The stone in it: single texels, pale and dark, faint. */
  for (let n = 0; n < 2600; n += 1) {
    g.fillStyle = rng.chance(0.5) ? 'rgba(178, 172, 190, 0.3)' : 'rgba(58, 54, 72, 0.3)';
    g.fillRect(Math.floor(rng.range(0, S)), Math.floor(rng.range(0, S)), 1, 1);
  }
  /* Crack sealing: a wandering dark line, and oil where cars stood. Few
   * and faint, because a tile repeats every GROUND_TILE metres and
   * anything that catches the eye in one is a pattern across the plot.
   * The cut and filled repairs, which do catch it, are laid in the world
   * instead (tarmacRepairs), where they do not repeat. */
  for (let n = 0; n < 4; n += 1) {
    const pts = [[rng.range(0, S), rng.range(0, S)]];
    const steps = 8 + Math.floor(rng.range(0, 10));
    let a = rng.range(0, Math.PI * 2);
    for (let k = 0; k < steps; k += 1) {
      a += rng.range(-0.7, 0.7);
      const [px, py] = pts[pts.length - 1];
      pts.push([px + Math.cos(a) * rng.range(6, 16), py + Math.sin(a) * rng.range(6, 16)]);
    }
    const width = rng.range(1.2, 2);
    wrapped((ox, oy) => {
      g.strokeStyle = 'rgba(46, 42, 58, 0.34)';
      g.lineWidth = width;
      g.lineJoin = 'round';
      g.beginPath();
      pts.forEach(([px, py], k) => (k ? g.lineTo(px + ox, py + oy) : g.moveTo(px + ox, py + oy)));
      g.stroke();
    });
  }
  for (let n = 0; n < 8; n += 1) {
    blob(rng.range(0, S), rng.range(0, S), rng.range(8, 22), 'rgba(40, 36, 52, 0.2)', 'rgba(40, 36, 52, 0)');
  }
  return c;
}

/*
 * GRASS: the town's own lawn tone, PAL.grass, painted the way a background
 * painter does a field: broad patches a shade lighter and darker, clover
 * in darker clumps, short strokes of blade in both, and a very few white
 * and yellow flowers. No mowing stripes: from the air they are a second
 * grid.
 */
function grassTexture() {
  const S = 512;
  const { c, g, blob } = groundCanvas(S, '#86ab84');
  const rng = seededRandom(0x3b8d21);
  for (let n = 0; n < 46; n += 1) {
    const light = rng.chance(0.55);
    blob(rng.range(0, S), rng.range(0, S), rng.range(24, 90),
      light ? 'rgba(160, 196, 146, 0.34)' : 'rgba(104, 146, 110, 0.32)', 'rgba(134, 171, 132, 0)');
  }
  for (let n = 0; n < 70; n += 1) {
    const x = rng.range(0, S);
    const y = rng.range(0, S);
    for (let k = 0; k < 9; k += 1) {
      blob(x + rng.range(-9, 9), y + rng.range(-9, 9), rng.range(2, 4.5), 'rgba(92, 132, 98, 0.5)', 'rgba(92, 132, 98, 0)');
    }
  }
  g.lineWidth = 1;
  for (let n = 0; n < 4200; n += 1) {
    const x = rng.range(0, S);
    const y = rng.range(0, S);
    g.strokeStyle = rng.chance(0.5) ? 'rgba(176, 206, 158, 0.28)' : 'rgba(94, 132, 96, 0.28)';
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + rng.range(-1.2, 1.2), y - rng.range(2.5, 5));
    g.stroke();
  }
  for (let n = 0; n < 36; n += 1) {
    g.fillStyle = rng.chance(0.6) ? 'rgba(250, 248, 238, 0.85)' : 'rgba(246, 212, 96, 0.85)';
    g.fillRect(Math.floor(rng.range(1, S - 2)), Math.floor(rng.range(1, S - 2)), 2, 2);
  }
  return c;
}

/*
 * DIRT: a worked earth yard, warm and held back from ochre the way the
 * town's clay is, dry and pale where it is packed, darker where the damp
 * sits, gravel and a few stones through it. The ruts are laid over it as
 * their own paint (dirtRuts), because a rut runs across the whole plot and
 * a tile would repeat it.
 */
function dirtTexture() {
  const S = 512;
  const { c, g, blob } = groundCanvas(S, '#c2ad95');
  const rng = seededRandom(0x5d19e3);
  for (let n = 0; n < 40; n += 1) {
    const light = rng.chance(0.55);
    blob(rng.range(0, S), rng.range(0, S), rng.range(26, 100),
      light ? 'rgba(214, 198, 172, 0.26)' : 'rgba(164, 142, 118, 0.22)', 'rgba(194, 173, 149, 0)');
  }
  for (let n = 0; n < 2200; n += 1) {
    g.fillStyle = rng.chance(0.5) ? 'rgba(150, 140, 150, 0.45)' : 'rgba(120, 100, 86, 0.4)';
    const r = rng.chance(0.8) ? 1 : 2;
    g.fillRect(Math.floor(rng.range(0, S)), Math.floor(rng.range(0, S)), r, r);
  }
  /* Stones: a pale top and a dark lower edge, so the light reads on them. */
  for (let n = 0; n < 70; n += 1) {
    const x = rng.range(4, S - 4);
    const y = rng.range(4, S - 4);
    const r = rng.range(1.5, 3.5);
    g.fillStyle = 'rgba(112, 96, 88, 0.6)';
    g.beginPath();
    g.ellipse(x, y + 0.8, r * 1.3, r, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(214, 204, 198, 0.8)';
    g.beginPath();
    g.ellipse(x, y, r * 1.2, r * 0.85, 0, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

/*
 * A PLOT THAT DOES NOT REPEAT. A tile of tarmac, grass or dirt is a dozen
 * metres, and over a 160 m plot its broad patches line up into a grid a
 * pilot sees from the air at once. So the plot's own vertices carry a
 * second, slower variation, laid in world space and never repeating: two
 * octaves of smoothed value noise, one on a lattice of LATTICE metres and
 * one at a third of that, multiplying the texture by a few percent. A
 * lawn's also leans its hue, yellower where it is drier and bluer where it
 * is lush, because that is what a real one does. Concrete keeps the one
 * flat plane it always had.
 */
const LATTICE = 30;
const PLOT_VARY = { tarmac: [0.07, 0, 0], grass: [0.08, 0.05, 0.06], dirt: [0.09, 0.03, 0] };

function plotGeometry(W, D, groundId, seed) {
  const vary = PLOT_VARY[groundId];
  /* Four metre cells, well inside the noise's lattice, and no more than a
   * hundred a side, so a plot of a kilometre is 20,000 triangles and not
   * half a million. */
  const nx = Math.min(100, Math.max(1, Math.round(W / 4)));
  const nz = Math.min(100, Math.max(1, Math.round(D / 4)));
  const geo = new THREE.PlaneGeometry(W, D, nx, nz).rotateX(-Math.PI / 2);
  if (!vary) {
    return geo;
  }
  const lattice = (i, j, k) => seededRandom((Math.imul(i, 73856093) ^ Math.imul(j, 19349663) ^ Math.imul(k, 83492791) ^ seed) >>> 0).next() * 2 - 1;
  const smooth = (t) => t * t * (3 - 2 * t);
  const noise = (x, z, cell, k) => {
    const fx = x / cell;
    const fz = z / cell;
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const u = smooth(fx - i);
    const v = smooth(fz - j);
    const a = lattice(i, j, k) + (lattice(i + 1, j, k) - lattice(i, j, k)) * u;
    const b = lattice(i, j + 1, k) + (lattice(i + 1, j + 1, k) - lattice(i, j + 1, k)) * u;
    return a + (b - a) * v;
  };
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let n = 0; n < pos.count; n += 1) {
    const x = pos.getX(n);
    const z = pos.getZ(n);
    const value = 0.7 * noise(x, z, LATTICE, 1) + 0.3 * noise(x, z, LATTICE / 3, 2);
    const hue = noise(x, z, LATTICE * 1.4, 3);
    const k = 1 + vary[0] * value;
    col[n * 3] = k * (1 + vary[1] * hue);
    col[n * 3 + 1] = k;
    col[n * 3 + 2] = k * (1 - vary[2] * hue);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

/* The lanes buildGround paints under bridges, as world rectangles at their
 * widest, for paint that must not lie on a road. A bridge with one of the
 * map's roads under it paints no lane (see roadUnder), so it has none here
 * either: the road's own cover keeps the paint off. */
function lanesOf(placed, cover) {
  const { W, D } = placed;
  const out = [];
  const S = { s: 0, c: 1 };
  for (const it of placed.items) {
    if (it.el.type === 'bridge' && !roadUnder(it, cover)) {
      sincos(it.yaw, S);
      const hw = 4;
      out.push(Math.abs(S.s) > 0.5
        ? { x0: -W / 2, x1: W / 2, z0: it.z - hw, z1: it.z + hw }
        : { x0: it.x - hw, x1: it.x + hw, z0: -D / 2, z1: D / 2 });
    }
  }
  return out;
}

/*
 * WHETHER A ROAD RUNS UNDER A BRIDGE: one of the map's roads (./roadmesh.js
 * roadCover) within a metre of the middle of its span. The bridge's own
 * lane is painted through that middle, so a road there is running along
 * where the lane would be, and the lane is left out rather than drawn under
 * the road.
 */
function roadUnder(it, cover) {
  return Boolean(cover) && cover(it.x - 1, it.x + 1, it.z - 1, it.z + 1);
}

/*
 * TARMAC REPAIRS, cut and filled: a few rectangles a shade fresher or
 * older than the rest, laid in the world where the plot's tile cannot
 * repeat them, at quarter turns the way a crew cuts them, seeded by the
 * document so each car park has its own.
 */
function tarmacRepairs(paint, placed, doc, cover) {
  const rng = seededRandom(hashString(doc.id) ^ 0x7ea1c0);
  const fresh = cel({ color: 0x625e72, bands: 3, tint: 0x5a5480, cache: false });
  const old = cel({ color: 0x7a768a, bands: 3, tint: 0x5a5480, cache: false });
  const lanes = lanesOf(placed, cover);
  const n = Math.max(4, Math.round((placed.W * placed.D) / 1400));
  let laid = 0;
  for (let i = 0; i < n; i += 1) {
    const w = rng.range(1.6, 7);
    const d = rng.range(1.2, 4.5);
    const x = rng.range(-0.46, 0.46) * placed.W;
    const z = rng.range(-0.46, 0.46) * placed.D;
    const turn = rng.chance(0.5);
    const fromFresh = rng.chance(0.6);
    const hx = (turn ? d : w) / 2 + 0.5;
    const hz = (turn ? w : d) / 2 + 0.5;
    if (!clearOf(lanes, x - hx, x + hx, z - hz, z + hz) || cover(x - hx, x + hx, z - hz, z + hz)) {
      continue;
    }
    paint.rect(fromFresh ? fresh : old, x, z, w, d, turn ? Math.PI / 2 : 0, 0.003);
    laid += 1;
  }
  return laid;
}

/*
 * One tyre rut, across a strip of texture: the width of a tyre's track,
 * soft at both edges, packed darker in the middle, with the tread's
 * chevrons pressed into it every few texels along the length.
 */
function rutTexture() {
  const W = 32;
  const H = 128;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const across = g.createLinearGradient(0, 0, W, 0);
  across.addColorStop(0, 'rgba(120, 96, 76, 0)');
  across.addColorStop(0.25, 'rgba(120, 96, 76, 0.42)');
  across.addColorStop(0.5, 'rgba(110, 88, 70, 0.5)');
  across.addColorStop(0.75, 'rgba(120, 96, 76, 0.42)');
  across.addColorStop(1, 'rgba(120, 96, 76, 0)');
  g.fillStyle = across;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(86, 66, 54, 0.4)';
  g.lineWidth = 2;
  for (let y = 0; y < H; y += 8) {
    g.beginPath();
    g.moveTo(8, y + 4);
    g.lineTo(W / 2, y);
    g.lineTo(W - 8, y + 4);
    g.stroke();
  }
  return c;
}

/* A soft round glow, bright in the middle and gone at the edge, for the
 * light a lamp throws on the ground and the halo round its head. */
function glowTexture(size, falloff) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  const r = size / 2;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
  grad.addColorStop(falloff, 'rgba(255, 255, 255, 0.35)');
  grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
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
 * Where the author's things stand, as world rectangles grown by `pad`, for
 * paint that should go round them. A car is left out, since a car may
 * stand in a painted bay, and so is anything with no footprint.
 */
function footprints(placed, pad) {
  const out = [];
  const S = { s: 0, c: 1 };
  for (const it of placed.items) {
    const type = it.el.type;
    if (type === 'car' || !it.parts || !it.parts.length) {
      continue;
    }
    const b = planBounds(it.parts);
    sincos(it.yaw, S);
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (const lx of [b.x0, b.x1]) {
      for (const lz of [b.z0, b.z1]) {
        const wx = it.x + lx * S.c + lz * S.s;
        const wz = it.z - lx * S.s + lz * S.c;
        x0 = Math.min(x0, wx);
        x1 = Math.max(x1, wx);
        z0 = Math.min(z0, wz);
        z1 = Math.max(z1, wz);
      }
    }
    /* The pads' launch box is painted out past their mats. */
    const p = type === 'startPads' ? pad + 1.6 : pad;
    out.push({ x0: x0 - p, x1: x1 + p, z0: z0 - p, z1: z1 + p });
  }
  return out;
}

function clearOf(rects, x0, x1, z0, z1) {
  return !rects.some((r) => r.x0 < x1 && r.x1 > x0 && r.z0 < z1 && r.z1 > z0);
}

/*
 * A CAR PARK'S MARKINGS, on a tarmac plot: a row of bays along each side,
 * in from the yard's edge line, open onto an aisle that runs round the plot
 * one way, with an arrow painted in the aisle every so often. A bay is left
 * out wherever something stands on it (a car is allowed to), so the lines
 * go round the author's map rather than under it, and an arrow the same.
 * Bays 2.5 by 5 m and a 6 m aisle, the proportions of a real one.
 */
const BAY_W = 2.5;
const BAY_D = 5;
const BAY_GAP = 0.4;
const AISLE = 6;
const BAY_LINE = 0.1;
const ARROW_EVERY = 24;

function tarmacMarks(paint, mat, placed, painted, cover) {
  const ex = placed.W / 2 - EDGE_LINE_INSET;
  const ez = placed.D / 2 - EDGE_LINE_INSET;
  /* A bridge's road runs the plot's whole depth under it, and a bay or an
   * arrow painted across it is a car park laid over a road. The map's own
   * roads are the same, through `cover`. */
  const lanes = [
    ...footprints(placed, 0.3),
    ...lanesOf(placed, cover).map((l) => ({ x0: l.x0 - 0.3, x1: l.x1 + 0.3, z0: l.z0 - 0.3, z1: l.z1 + 0.3 })),
  ];
  const clearOfBusy = (x0, x1, z0, z1) => clearOf(lanes, x0, x1, z0, z1) && !cover(x0, x1, z0, z1);
  /* Each side as a frame: `along` runs the way the aisle's traffic goes
   * (anticlockwise seen from above), `inward` points into the plot, and
   * `e` is how far the edge line is from the middle. */
  const sides = [
    { along: [1, 0], inward: [0, -1], e: ez, len: ex },
    { along: [0, -1], inward: [-1, 0], e: ex, len: ez },
    { along: [-1, 0], inward: [0, 1], e: ez, len: ex },
    { along: [0, 1], inward: [1, 0], e: ex, len: ez },
  ];
  const corner = BAY_GAP + BAY_D + AISLE + 1;
  const y = 0.008;
  for (const s of sides) {
    const [ax, az] = s.along;
    const [nx, nz] = s.inward;
    const alongX = Math.abs(ax) > 0.5;
    /* A point `t` along the side and `u` in from its edge line. */
    const at = (t, u) => [-nx * s.e + ax * t + nx * u, -nz * s.e + az * t + nz * u];
    const rect = (t0, t1, u0, u1) => {
      const [px, pz] = at(t0, u0);
      const [qx, qz] = at(t1, u1);
      return [Math.min(px, qx), Math.max(px, qx), Math.min(pz, qz), Math.max(pz, qz)];
    };
    const n = Math.floor((2 * (s.len - corner)) / BAY_W);
    const t0 = -(n * BAY_W) / 2;
    const free = [];
    for (let i = 0; i < n; i += 1) {
      free.push(clearOfBusy(...rect(t0 + i * BAY_W, t0 + (i + 1) * BAY_W, BAY_GAP, BAY_GAP + BAY_D)));
    }
    for (let i = 0; i <= n; i += 1) {
      if (!free[i - 1] && !free[i]) {
        continue;
      }
      const [cx, cz] = at(t0 + i * BAY_W, BAY_GAP + BAY_D / 2);
      paint.rect(mat, cx, cz, alongX ? BAY_LINE : BAY_D, alongX ? BAY_D : BAY_LINE, 0, y);
    }
    painted.parking += free.filter(Boolean).length;
    /* The arrows, down the middle of the aisle: a shaft, and a head of two
     * bars folded back from its tip. Headings from atan2, which is render
     * only: nothing here is solid. */
    const u = BAY_GAP + BAY_D + AISLE / 2;
    for (let t = -s.len + corner + ARROW_EVERY / 2; t < s.len - corner; t += ARROW_EVERY) {
      if (!clearOfBusy(...rect(t - 2, t + 2, u - 1.2, u + 1.2))) {
        continue;
      }
      const [cx, cz] = at(t, u);
      const yaw = Math.atan2(-az, ax);
      paint.rect(mat, cx, cz, 2.6, 0.2, yaw, y);
      const [tx, tz] = at(t + 1.25, u);
      for (const side of [-1, 1]) {
        const a = yaw + Math.PI + side * 0.62;
        const dx = Math.cos(a);
        const dz = -Math.sin(a);
        paint.rect(mat, tx + dx * 0.5, tz + dz * 0.5, 1.1, 0.2, a, y);
      }
      painted.arrows += 1;
    }
  }
}

/*
 * TYRE RUTS over a dirt plot: the tracks of whatever worked the yard, a
 * few long sweeps from one side of the plot to another, each a pair of
 * ruts a truck's track apart. Seeded by the document's id, so every map
 * has its own and keeps them. They run under whatever stands on them, as
 * ruts in a yard do, but not across a painted lane, which is paved.
 */
const RUT_TRACK = 1.8;
const RUT_W = 0.42;
const RUT_REPEAT = 1.6;

function dirtRuts(placed, doc, cover) {
  const { W, D } = placed;
  const rng = seededRandom(hashString(doc.id) ^ 0x5eed17);
  const lanes = lanesOf(placed, cover);
  const onEdge = (side) => {
    const t = rng.range(-0.4, 0.4);
    return [
      [t * W, -D / 2 + 2], [W / 2 - 2, t * D], [t * W, D / 2 - 2], [-W / 2 + 2, t * D],
    ][side];
  };
  /* The start's paint on the paving, the launch box and the chevron ahead
   * of it (buildGround), in each pads' own frame and grown by half a rut:
   * a rut is transparent and drawn after the paint, so it printed over the
   * START text, the chequer and the box line. It breaks there as it does
   * at a lane. */
  const starts = placed.items.filter((it) => it.el.type === 'startPads' && it.y === 0).map((it) => {
    const b = planBounds(it.parts);
    const S = { s: 0, c: 1 };
    sincos(it.yaw, S);
    const g = RUT_W / 2;
    return { x: it.x, z: it.z, s: S.s, c: S.c, x0: b.x0 - 1.0 - g, x1: b.x1 + 4.2 + g, z0: b.z0 - 0.8 - g, z1: b.z1 + 0.8 + g };
  });
  const inStart = (x, z) => starts.some((r) => {
    const dx = x - r.x;
    const dz = z - r.z;
    const lx = dx * r.c - dz * r.s;
    const lz = dx * r.s + dz * r.c;
    return lx > r.x0 && lx < r.x1 && lz > r.z0 && lz < r.z1;
  });
  const pos = [];
  const uv = [];
  const index = [];
  const paths = Math.max(3, Math.min(9, Math.round((W * D) / 5000)));
  for (let p = 0; p < paths; p += 1) {
    const a = rng.int(0, 3);
    const b = (a + rng.int(1, 3)) % 4;
    const pts = [onEdge(a), [rng.range(-0.3, 0.3) * W, rng.range(-0.3, 0.3) * D],
      [rng.range(-0.3, 0.3) * W, rng.range(-0.3, 0.3) * D], onEdge(b)]
      .map(([x, z]) => new THREE.Vector3(x, 0, z));
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const len = curve.getLength();
    const steps = Math.max(8, Math.ceil(len / 0.8));
    for (const off of [-RUT_TRACK / 2, RUT_TRACK / 2]) {
      let prev = -1;
      for (let i = 0; i <= steps; i += 1) {
        const f = i / steps;
        const c = curve.getPointAt(f);
        const tg = curve.getTangentAt(f);
        const nx = -tg.z;
        const nz = tg.x;
        const mx = c.x + nx * off;
        const mz = c.z + nz * off;
        const inLane = lanes.some((l) => mx > l.x0 && mx < l.x1 && mz > l.z0 && mz < l.z1)
          || cover(mx - RUT_W / 2, mx + RUT_W / 2, mz - RUT_W / 2, mz + RUT_W / 2);
        if (inLane || inStart(mx, mz) || Math.abs(mx) > W / 2 - 0.4 || Math.abs(mz) > D / 2 - 0.4) {
          prev = -1;
          continue;
        }
        const v = (f * len) / RUT_REPEAT;
        const base = pos.length / 3;
        pos.push(mx - nx * (RUT_W / 2), 0.003, mz - nz * (RUT_W / 2), mx + nx * (RUT_W / 2), 0.003, mz + nz * (RUT_W / 2));
        uv.push(0, v, 1, v);
        if (prev >= 0) {
          index.push(prev, prev + 1, base, prev + 1, base + 1, base);
        }
        prev = base;
      }
    }
  }
  if (!index.length) {
    return null;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(index);
  geo.computeBoundingSphere();
  const tex = canvasTexture(rutTexture(), 1, 1);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  const mat = cel({ color: 0xffffff, map: tex, bands: 3, tint: 0x6f5f86, transparent: true, depthWrite: false, cache: false });
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -1;
  mat.polygonOffsetUnits = -1;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'ruts';
  return { mesh, count: paths };
}

/*
 * The plot, its kerb, the verge, the terrain, and the paint on the plot.
 * `cover` is ./roadmesh.js roadCover for the map's roads: no paint of the
 * yard's goes on a road, and a bridge with a road under it paints no lane
 * of its own. Returns the group, what it painted for stats(), and a way to
 * stop a logo still decoding from painting into a map that has gone.
 */
function buildGround(placed, doc, look, cover) {
  const { W, D } = placed;
  const G = look.ground;
  const groundId = look.groundId;
  const group = new THREE.Group();
  group.name = 'ground';

  /* The plot: a plane the size of the field, at exactly zero, which is the
   * height the plant flies over, painted with the map's ground. Whatever
   * it is painted as, it is the same flat plane: a ground is paint. */
  const painter = { tarmac: tarmacTexture, grass: grassTexture, dirt: dirtTexture }[groundId];
  const tile = painter ? GROUND_TILE[groundId] : SLAB * TILE_SLABS;
  const yard = canvasTexture(painter ? painter() : yardTexture(), W / tile, D / tile);
  const plot = new THREE.Mesh(
    painter ? plotGeometry(W, D, groundId, hashString(doc.id)) : new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2),
    cel({ color: 0xffffff, map: yard, bands: 3, tint: G.tint, vertexColors: Boolean(painter), cache: false }),
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
  const terrainTex = canvasTexture(terrainTexture(G.terrain), TERRAIN / 40, TERRAIN / 40);
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
  const painted = { lanes: 0, bays: 0, startBox: 0, logos: 0, parking: 0, arrows: 0, ruts: 0 };

  /* The line round the plot, on a ground anybody would paint one on. */
  const ex = W / 2 - EDGE_LINE_INSET;
  const ez = D / 2 - EDGE_LINE_INSET;
  if (G.edgeLine) {
    paint.outline(yellow, 0, 0, 0, -ex, ex, -ez, ez, LINE_W, 0.008);
  }
  if (groundId === 'tarmac') {
    painted.repairs = tarmacRepairs(paint, placed, doc, cover);
    tarmacMarks(paint, white, placed, painted, cover);
  }

  for (const it of placed.items) {
    const type = it.el.type;
    /*
     * A BRIDGE MEANS A ROAD UNDER IT. The lane is painted square to the
     * span, through the middle of it, from kerb to kerb, so a footbridge is
     * a footbridge over something. A bridge only ever stands at a quarter
     * turn (it has boxes), so the lane is always along a world axis. Where
     * one of the map's own roads runs under it, that road is the something,
     * and a second lane painted beneath it would be two roads in one place.
     */
    if (type === 'bridge' && roadUnder(it, cover)) {
      painted.lanesUnderRoads = (painted.lanesUnderRoads || 0) + 1;
    } else if (type === 'bridge') {
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
    if (type === 'containers' && G.bays) {
      const b = planBounds(it.parts);
      paint.outline(yellow, it.x, it.z, it.yaw, b.x0 - 0.6, b.x1 + 0.6, b.z0 - 0.6, b.z1 + 0.6, LINE_W, 0.008);
      painted.bays += 1;
    }
    /* The launch box round the pads, and an arrow the way they face, when
     * the pads stand on the paving. Pads raised onto a roof are seated on
     * it (it.y, see placeDocument), and this paint is the paving's, so it
     * would lie at 0 inside the building under them. */
    if (type === 'startPads' && it.y === 0) {
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
  if (groundId === 'dirt') {
    const ruts = dirtRuts(placed, doc, cover);
    if (ruts) {
      group.add(ruts.mesh);
      painted.ruts = ruts.count;
    }
  }

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
 * The horizon.
 * ------------------------------------------------------------------ */

/*
 * THE BACKDROP: the town's two layers of painted ridge, closed into rings
 * round the plot.
 *
 * The town's buildDistantHills paints four straight flats, one ahead and
 * one behind for each layer, cut off square at their ends. In the town the
 * streets hide the ends. On an open yard they stood on the horizon to the
 * north east and the north west as pale slabs with vertical sides. So the
 * same silhouettes, the town's sum of falling sines at the town's heights
 * and colours, unlit and out of the fog, go all the way round instead: a
 * whole number of each bump per turn, so each ring meets itself with no
 * seam. The rings stand out past the plot's corner, as the flats were
 * pushed (`scale`), and keep their height.
 */
const BACKDROP = [
  /* far first, so the near ring draws over it where they cross */
  { r: HILLS_FAR, h: 46, tone: 'far', y: -6, bumps: [2, 5, 7, 9, 11, 14, 16, 18, 20], phase: 0.7 },
  { r: HILLS_NEAR, h: 34, tone: 'near', y: -4, bumps: [2, 4, 5, 7, 9, 11, 12], phase: 0 },
];
const BACKDROP_STEPS = 360;

/* Exported for src/props/gallery.js, whose open ground showed the town's
 * cut ends the same way. `hills` is a time of day's ridge colours
 * (./looks.js), the town's own by default. */
export function buildBackdrop(scene, scale, hills = { far: PAL.hillFar, near: PAL.hill }) {
  const group = new THREE.Group();
  group.name = 'backdrop';
  for (const L of BACKDROP) {
    const r = L.r * scale;
    const pos = new Float32Array((BACKDROP_STEPS + 1) * 2 * 3);
    const index = [];
    for (let i = 0; i <= BACKDROP_STEPS; i += 1) {
      const a = (i / BACKDROP_STEPS) * Math.PI * 2;
      let y = 0;
      L.bumps.forEach((m, k) => {
        const b = k + 1;
        y += Math.sin(a * m + b * 2.1 + L.phase) * (L.h / (b * 1.25));
      });
      const top = L.y + Math.max(2, y * 0.55 + L.h * 0.55);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      pos.set([x, top, z, x, -60, z], i * 6);
      if (i < BACKDROP_STEPS) {
        const v = i * 2;
        index.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(index);
    /* Its own material, not the toon kit's cached flat of that colour,
     * because fadeBackdrop changes its colour. */
    const mesh = new THREE.Mesh(geo, flat({ color: hills[L.tone], fog: false, side: THREE.DoubleSide, cache: false }));
    mesh.userData.base = mesh.material.color.clone();
    mesh.renderOrder = -8;
    mesh.frustumCulled = false;
    group.add(mesh);
  }
  scene.add(group);
  return group;
}

/*
 * FROM ALTITUDE THE RINGS ARE NOT A HORIZON. They are unlit and out of the
 * fog, and the fog is complete short of them, so from about 40 m up the
 * near ring showed as a ribbon lying on the fogged land in front of it and
 * behind it, and the far ring as a pale wall, in every heading and on every
 * setting. They fade into the fog's colour as the camera climbs, starting at
 * BACKDROP_FADE[0] and gone at BACKDROP_FADE[1], where both rings' tops are
 * under the true horizon, and the fogged land and the dome under the
 * horizon (paintSky in ./looks.js) meet the sky instead. Render only:
 * `y` is the camera's height, and nothing here reaches the physics.
 */
const BACKDROP_FADE = [25, 60];

export function fadeBackdrop(group, y, fogColor) {
  const u = (y - BACKDROP_FADE[0]) / (BACKDROP_FADE[1] - BACKDROP_FADE[0]);
  const k = u <= 0 ? 0 : (u >= 1 ? 1 : u * u * (3 - 2 * u));
  if (group.userData.fade === k) {
    return;
  }
  group.userData.fade = k;
  for (const mesh of group.children) {
    mesh.material.color.copy(mesh.userData.base).lerp(fogColor, k);
    mesh.visible = k < 1;
  }
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
 *
 * AND THE SAME WIRES AGAIN AS LINES, for the far spans. A tube 4 to 8 cm
 * across is under a pixel from 20 to 40 m out, and a triangle under a
 * pixel is drawn or not by where its centre falls, so under the built
 * map's 270 m of fog a span across the sky came apart into dashes that
 * crawled as the camera moved. A GL line is a pixel wide at any range and
 * never breaks. It runs down each tube's own centre line, so wherever the
 * tube is wider than a pixel its near face hides the line, and there is
 * nothing to switch over with range: near, the tube; far, the line.
 */
const WIRE_SEGMENTS = 16;
const WIRE_COLOR = 0x4c4658;

function buildWires(placed, lineColor = WIRE_COLOR) {
  const poles = placed.items.filter((it) => it.el.type === 'utilityPole');
  const pylons = placed.items.filter((it) => it.el.type === 'pylon');
  const tubes = [];
  const line = [];
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
        tubes.push({ geometry: new THREE.TubeGeometry(curve, WIRE_SEGMENTS, r, 4, false) });
        /* TubeGeometry puts its rings at getPointAt(i / segments), which
         * is what getSpacedPoints returns: the line is the tube's axis. */
        const pts = curve.getSpacedPoints(WIRE_SEGMENTS);
        for (let i = 0; i < WIRE_SEGMENTS; i += 1) {
          line.push(pts[i].x, pts[i].y, pts[i].z, pts[i + 1].x, pts[i + 1].y, pts[i + 1].z);
        }
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
    return { mesh: null, lines: null, runs: 0, triangles: 0 };
  }
  const geo = bake(tubes);
  for (const t of tubes) {
    t.geometry.dispose();
  }
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, cel({ color: WIRE_COLOR, bands: 2, tint: 0x413c58 }));
  mesh.name = 'wires';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(line, 3));
  lineGeo.computeBoundingSphere();
  const lines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: lineColor }));
  lines.name = 'wireLines';
  const tris = geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3;
  return { mesh, lines, runs, triangles: tris };
}

/* ------------------------------------------------------------------ *
 * Lamps at night.
 * ------------------------------------------------------------------ */

/*
 * THE LIGHT THE LAMPS THROW, at dusk: a warm pool on whatever is under each
 * lamp, and a soft halo round its head. The kit remembers where every lamp
 * it drew is (K.lamps in src/props/kit.js), so this needs no family to say
 * where its lamps are, and a lamp on a billboard, a canopy or a pole all
 * light the ground the same way.
 *
 * No lights. Every pool is one quad in one additive batch, every halo one
 * point in one more, so a map of fifty lamps costs two draw calls and no
 * shading anywhere else. Neither writes depth, so the ink draws no line
 * round a glow. A pool lands on the surface under the lamp (topUnder in
 * ./place.js, the query the shell's height makes), so a lamp over a roof
 * lights the roof; it widens and fades with the lamp's height, and a lamp
 * too high to light anything gets only its halo.
 *
 * Asked from below the lamp's mount (POOL_FROM), so that the slab a lamp
 * hangs under, a canopy or a soffit, is never taken for its floor: asked
 * from 0.2 m under the lamp any top up to 0.35 m over it counted, and every
 * canopy and soffit lamp lit nothing. And a pool on a box top is cut to
 * that box, a landing or a bridge deck, rather than hanging past its edge
 * as light in the air; its texture stays centred on the lamp, so the cut is
 * a clean edge and not a smaller pool.
 */
const POOL_FROM = 0.25 + PLATFORM_REACH;
const POOL_COLOR = 0xffc58a;
const VENDING_COLOR = 0xe2eaff;
const HALO_COLOR = 0xffdcae;

/*
 * Cut a pool quad (the unit quad, scaled by 2r about the lamp) to the box
 * whose top is `top` and whose footprint holds the lamp, strictly, as the
 * query found it. Each corner is moved to the box's edge where the pool
 * passes it and its UV follows, (p - lamp) / (2r) + 0.5, so the glow stays
 * centred on the lamp. False when nothing of the pool is left.
 */
function cutPool(g, l, r, solids, top) {
  const s = solids.find((o) => o.box && o.box[4] === top
    && l.x > o.box[0] && l.x < o.box[3] && l.z > o.box[2] && l.z < o.box[5]);
  if (!s) {
    return true;
  }
  const b = s.box;
  const d = 2 * r;
  const x0 = Math.max(-0.5, (b[0] - l.x) / d);
  const x1 = Math.min(0.5, (b[3] - l.x) / d);
  const z0 = Math.max(-0.5, (b[2] - l.z) / d);
  const z1 = Math.min(0.5, (b[5] - l.z) / d);
  if (!(x0 < x1 && z0 < z1)) {
    return false;
  }
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i) < 0 ? x0 : x1;
    const z = pos.getZ(i) < 0 ? z0 : z1;
    pos.setXYZ(i, x, 0, z);
    uv.setXY(i, x + 0.5, 0.5 - z);
  }
  return true;
}

function buildLampGlow(lamps, placed) {
  /* One per lamp: a lamp drawn as a lens and a housing is logged twice.
   * Vending machines stand closer than that, a pool each. */
  const kept = [];
  for (const l of lamps) {
    const near = l.halo ? 1.0 : 0.3;
    if (!kept.some((k) => k.halo === l.halo && Math.hypot(k.x - l.x, k.y - l.y, k.z - l.z) < near)) {
      kept.push(l);
    }
  }
  if (!kept.length) {
    return null;
  }
  const quad = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const parts = [];
  const tint = new THREE.Color();
  for (const l of kept) {
    const top = topUnder(placed.tops, l.x, l.z, l.y - POOL_FROM);
    const floor = groundUnder(placed.tops, l.x, l.z, l.y - POOL_FROM);
    const h = l.y - floor;
    if (!(h > 0.3 && h < 16)) {
      continue;
    }
    /* A vending machine's light is whiter and lies close in front of it. */
    const r = l.halo ? Math.min(6.5, Math.max(1.8, 1.1 + 0.5 * h)) : 1.9;
    const k = l.halo ? Math.min(0.85, Math.max(0.28, 1.05 - h / 14)) : 0.42;
    const g = quad.clone();
    if (top > 0 && !cutPool(g, l, r, placed.solids, top)) {
      g.dispose();
      continue;
    }
    tint.set(l.halo ? POOL_COLOR : VENDING_COLOR).multiplyScalar(k);
    const col = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < col.length; i += 3) {
      col[i] = tint.r;
      col[i + 1] = tint.g;
      col[i + 2] = tint.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    parts.push({ geometry: g, matrix: new THREE.Matrix4().makeScale(2 * r, 1, 2 * r).setPosition(l.x, floor + 0.03, l.z) });
  }
  const group = new THREE.Group();
  group.name = 'lampGlow';
  if (parts.length) {
    const geo = bake(parts);
    for (const p of parts) {
      p.geometry.dispose();
    }
    geo.computeBoundingSphere();
    const pools = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      map: glowTexture(128, 0.35), vertexColors: true, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }));
    pools.name = 'lampPools';
    pools.renderOrder = 2;
    group.add(pools);
  }
  quad.dispose();
  const pts = new THREE.BufferGeometry();
  pts.setAttribute('position', new THREE.Float32BufferAttribute(kept.filter((l) => l.halo).flatMap((l) => [l.x, l.y, l.z]), 3));
  pts.computeBoundingSphere();
  const halos = new THREE.Points(pts, new THREE.PointsMaterial({
    color: HALO_COLOR, map: glowTexture(64, 0.22), size: 2.2, sizeAttenuation: true,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  halos.name = 'lampHalos';
  halos.renderOrder = 3;
  group.add(halos);
  return { group, lamps: kept.length, pools: parts.length };
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

/*
 * THE STF MARK, painted where ./egg.js chose, and where it is.
 *
 * The spot's `p` is ON the solid's face; the paint stands STF_LIFT off the
 * drawn surface over it (drawnRelief, and STF_PROBE for why the two are not
 * the same), and polygonOffset does the rest (src/art/stf.js). The
 * plane's pose is baked into its geometry, the way the kit bakes every
 * batch, so the mesh sits at an identity transform in the cull chunk of the
 * element it is sprayed on, and the chunk's bounds, measured below from
 * each batch's geometry, take it in like any other batch: it switches off
 * with the wall it is on and never on its own. On the ground fallback there
 * is no element, so it goes in the chunk the paving under it belongs to,
 * a chunk of its own when nothing else was filed there.
 *
 * `look` is handed on as the kit gets it, and the face is tested against
 * the look's sun: the paint is lit, and on a face the sun never reaches, or
 * at dusk and overcast, it gives back some of its own colour so the
 * lettering still reads from the pads (see makeStfMark).
 *
 * Returns the MapInstance's `egg` (src/maps/README.md): the painted plane's
 * centre, the way it faces, its up and its size, world metres, the same
 * shape the town hands the shell.
 */
function paintStfMark(props, placed, spot, look) {
  const n = new THREE.Vector3(...spot.n);
  const up = new THREE.Vector3(...spot.up);
  const right = new THREE.Vector3().crossVectors(up, n);
  const item = spot.elementId ? placed.items.find((it) => it.el.id === spot.elementId) : null;
  const name = `props:${chunkKeyOf(item || { x: spot.p[0], z: spot.p[2] })}`;
  let chunk = props.children.find((g) => g.name === name);
  const lift = drawnRelief(chunk, spot, right) + STF_LIFT;
  const p = spot.p.map((v, k) => v + spot.n[k] * lift);
  /* In shade when the face is turned away from the look's sun: no direct
   * light reaches it at this time of day (see makeStfMark). */
  const sun = look.time && look.time.sun ? look.time.sun.at : null;
  const shade = Boolean(sun) && spot.n[0] * sun[0] + spot.n[1] * sun[1] + spot.n[2] * sun[2] <= 0;
  const mark = makeStfMark(THREE, {
    width: spot.w, height: spot.h, look: kitLook(look.timeId), shade,
  });
  mark.geometry.applyMatrix4(new THREE.Matrix4().makeBasis(right, up, n).setPosition(p[0], p[1], p[2]));
  mark.geometry.computeBoundingBox();
  mark.geometry.computeBoundingSphere();
  if (!chunk) {
    chunk = new THREE.Group();
    chunk.name = name;
    props.add(chunk);
  }
  chunk.add(mark);
  return { key: spot.key, p, n: [...spot.n], up: [...spot.up], w: spot.w, h: spot.h };
}

/* How far the drawn surface under the mark stands off the solid face the
 * spot is on, in metres: see STF_PROBE. 0 where nothing is drawn proud of
 * it, which is the ground and a plain slab. */
function drawnRelief(chunk, spot, right) {
  if (!chunk) {
    return 0;
  }
  const ray = new THREE.Raycaster();
  ray.far = STF_PROBE + 0.01;
  const back = new THREE.Vector3(-spot.n[0], -spot.n[1], -spot.n[2]);
  const from = new THREE.Vector3();
  const depths = [];
  for (const u of STF_PROBE_U) {
    for (const v of STF_PROBE_V) {
      from.set(
        spot.p[0] + right.x * u * spot.w + spot.up[0] * v * spot.h + spot.n[0] * STF_PROBE,
        spot.p[1] + right.y * u * spot.w + spot.up[1] * v * spot.h + spot.n[1] * STF_PROBE,
        spot.p[2] + right.z * u * spot.w + spot.up[2] * v * spot.h + spot.n[2] * STF_PROBE,
      );
      ray.set(from, back);
      const hit = ray.intersectObjects(chunk.children, false)[0];
      depths.push(hit ? Math.max(0, STF_PROBE - hit.distance) : 0);
    }
  }
  depths.sort((a, b) => a - b);
  return depths[Math.floor((depths.length - 1) * STF_PROBE_SHARE)];
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
  /* Its roads and the cars on them (./traffic.js), worked out once: the
   * same lanes, offsets and bodies go to the plant (the shell uploads them,
   * see uploadTraffic below) and to the drawing, so the car drawn is the
   * car driven. */
  const traffic = trafficOf(doc);
  const cover = roadCover(traffic, 0.3);
  /* Where the STF mark goes (./egg.js), chosen once, from what was just
   * placed: the same spot every time this document is flown. Read only;
   * it changes nothing placed. The mark is an easter egg and the map is
   * what the pilot came to fly, so a document the chooser cannot read
   * flies with no mark on it, and the console says why, rather than not
   * flying at all. */
  let stfSpot = null;
  try {
    stfSpot = chooseStfSpot(placed, doc, chosen.source);
  } catch (e) {
    console.error('stf: no spot for the mark on this map', e);
  }
  /* Its time of day and its ground (./looks.js): golden over concrete for
   * a map that never chose, which is this map as it always was. */
  const look = lookOf(doc);
  const T = look.time;
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
  const fogPlot = fogFor(q.id, placed.W, placed.D);
  /* A time's air is clearer or thicker than golden hour's, and everything
   * sized off the fog below (the cull, the shadow box, the dome) follows. */
  const fogNear = fogPlot.near * T.fog.near;
  const fogFar = fogPlot.far * T.fog.far;
  const cullDefault = fogFar + 4;
  const half = Math.min(SHADOW_HALF_MAX, Math.max(q.city.shadowHalf, SHADOW_SHARE * fogFar));
  const hillScale = Math.max(1, (Math.hypot(placed.W, placed.D) / 2 + 60) / HILLS_NEAR);
  const skyRadius = Math.max(500, fogFar + 80, HILLS_FAR * hillScale + 60);
  const cameraFar = Math.max(CAMERA_FAR, skyRadius * 1.8);

  /* Renderer state is the map's: the town's filtering and clear colour. */
  renderer.shadowMap.enabled = q.shadows;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor(new THREE.Color(T.fog.color), 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(T.fog.color, fogNear, fogFar);
  camera.far = cameraFar;
  camera.updateProjectionMatrix();

  /* The town's four lights, at the town's offsets from the shadow target,
   * in the colours and at the offsets the map's time of day gives them
   * (golden's are the town's). See src/maps/city/index.js for the shadow
   * box and its numbers. */
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
  const sunBack = Math.max(Math.hypot(...T.sun.at), 1.5 * half + 40);
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
  const hemi = new THREE.HemisphereLight(PAL.hemiSky, PAL.hemiGround, 1.12);
  scene.add(hemi);
  paintLights({ sun, fill, bounce, hemi }, T);
  const SUN_OFFSET = new THREE.Vector3(...T.sun.at).setLength(sunBack);
  const FILL_OFFSET = new THREE.Vector3(...T.fill.at);
  const BOUNCE_OFFSET = new THREE.Vector3(...T.bounce.at);

  const sky = buildSky(scene, skyRadius);
  paintSky(sky, T);
  const backdrop = buildBackdrop(scene, hillScale, T.hills);
  progress(0.1);
  await yieldToPaint();

  /* The ground and its paint, then the roads over it (./roadmesh.js): flat
   * paint, three batches for every road, and nothing solid. */
  const ground = buildGround(placed, doc, look, cover);
  scene.add(ground.group);
  const roads = buildRoadMesh(THREE, look, traffic);
  if (roads.batches) {
    scene.add(roads.group);
  }
  progress(0.2);
  await yieldToPaint();

  /*
   * THE ASSETS, one kit for the whole map, grouped into chunks by where
   * each element stands. The kit bakes each element's parts and paint into
   * one batch per material per chunk, so a map of fifty assets is a few
   * hundred draw calls at most and a chunk switched off takes all of its
   * batches with it.
   */
  const kit = new PropKit(kitLook(look.timeId));
  for (const it of placed.items) {
    kit.begin(it.x, it.y, it.z, it.yaw, chunkKeyOf(it));
    kit.element(it.el);
  }
  progress(0.7);
  await yieldToPaint();
  const props = kit.finish();
  /* Before the cull cells are measured, so the mark is in its chunk's. And
   * for the chooser's reason, a mark that cannot be painted leaves the map
   * without one. */
  let egg = null;
  if (stfSpot) {
    try {
      egg = paintStfMark(props, placed, stfSpot, look);
    } catch (e) {
      console.error('stf: the mark could not be painted on this map', e);
    }
  }
  scene.add(props);
  progress(0.8);

  const wires = buildWires(placed, T.wire);
  if (wires.mesh) {
    scene.add(wires.mesh, wires.lines);
  }
  /* At dusk, the light the lamps throw. */
  const lampGlow = kit.night ? buildLampGlow(kit.lamps, placed) : null;
  if (lampGlow) {
    scene.add(lampGlow.group);
  }

  /*
   * THE MOVING CARS (./cars.js), one Object3D each, outside the chunks and
   * the static batches because they are posed every frame. Where each one
   * is comes from the physics module: the shell reads the poses after it
   * steps and hands them to poseCars. A map with no vehicle has none of
   * this, and hands the shell no traffic.
   */
  const carSet = traffic.vehicles.length ? buildCars(THREE, look, traffic) : null;
  if (carSet) {
    scene.add(carSet.group);
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
  paintPost(pipeline, T);
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
    fadeBackdrop(backdrop, camera.position.y, scene.fog.color);
    cullTo(camera.position);
  }
  /* Seated once now, so the first frame, and the title behind the menu,
   * are lit before anything calls in. At the seat, which is a roof when
   * the pads were raised onto one. */
  updateShadowFocus(new THREE.Vector3(placed.spawn.x, placed.spawn.y, placed.spawn.z));

  /* One frozen answer: a map with no gates has no target, ever. */
  const AIM = Object.freeze({ active: false, sceneIndex: -1, correct: true, distance: 0 });

  const buildMs = Math.round(performance.now() - t0);
  const propTriangles = trianglesOf(props);
  const groundTriangles = trianglesOf(ground.group);
  let propBatches = 0;
  props.traverse((o) => {
    if (o.isMesh) {
      propBatches += 1;
    }
  });
  const carStats = carSet ? carSet.stats() : { cars: 0, meshes: 0, triangles: 0, puffs: 0 };

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
    /*
     * The paving at zero, or a box top within a step of fromY. The plant
     * lands on box tops itself; this is the same ground for the shell,
     * which asks it for the plane it hands the plant every step, the spawn
     * seat, the OSD altitude, the obstacles' clearance and the set down.
     * Without it a craft parked on a roof was 15 m up as far as the shell
     * knew. See groundUnder in ./place.js for why it answers a millimetre
     * under the top rather than at it, and for cgY, the craft's own
     * height, which the shell passes wherever it asks for a craft so a
     * thin board over the craft is never its ground. The town's height
     * takes no cgY and needs none: its decks are thick.
     */
    height: (x, z, fromY, cgY) => groundUnder(placed.tops, x, z, fromY, cgY),
    setNextGate() {},
    targetAim: () => AIM,
    approachSide: () => null,
    hasRacingLine: false,
    setRacingLine() {},
    updateRacingLine() { return null; },
    updateShadowFocus,
    updateWind() {},
    /* Nothing on a built map is posed from the step count here. Its cars
     * move, but the physics module drives them (src/native/world.c section
     * 5) and the shell hands their poses to poseCars below, so render reads
     * the pose the physics used and never works out its own. */
    updateAnim() {},
    /*
     * THE TRAFFIC, for the shell. Null on a map with no vehicle, and then
     * none of the calls below does anything: a map with no traffic makes no
     * vehicle call on the plant at all.
     *
     *   traffic             trafficOf(doc)'s answer
     *   uploadTraffic(sim)  hand it to the plant, after uploadWorld: every
     *                       lane, then every car (./traffic.js)
     *   chaseCars()         the cars as src/game/chase.js setCars takes them
     *   poseCars(prev, curr, alpha, now)   every car between two
     *                       readVehicles arrays one step apart, at the
     *                       craft's alpha, and the smoke at `now`, ms
     *   carTick(step, poses)   the smoke's feed, at every 8 steps of the
     *                       clock, from readVehicles at that step
     *   clearSmoke()        a new run
     *   carGap(x, y, z, reach)   the nearest drawn car, for the near plane
     */
    traffic: carSet ? traffic : null,
    uploadTraffic: (sim) => (carSet ? uploadTraffic(sim, traffic) : { roads: 0, vehicles: 0, problems: [] }),
    chaseCars: () => (carSet ? carSet.chaseCars() : []),
    poseCars(prev, curr, alpha, now) {
      if (carSet) {
        carSet.place(prev, curr, alpha, now);
      }
    },
    carTick(step, poses) {
      if (carSet) {
        carSet.emit(step, poses);
      }
    },
    clearSmoke() {
      if (carSet) {
        carSet.clearSmoke();
      }
    },
    carGap: (x, y, z, reach) => (carSet ? carSet.gapAt(x, y, z, reach) : reach),
    setCullRadius,
    /* Where the STF mark is painted, for the shell to tell when a pilot has
     * found it: see paintStfMark and `egg` in src/maps/README.md. Paint
     * only; nothing about it is solid. */
    egg,
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
      /* Every mesh this map draws of its own: the kit's batches, the roads'
       * and the cars' (each car's body, wheels and, after dark, its glow,
       * and the one smoke batch). */
      batches: propBatches + roads.batches + carStats.meshes,
      propBatches,
      propTriangles,
      triangles: propTriangles + groundTriangles + wires.triangles + roads.triangles + carStats.triangles,
      roads: { roads: roads.roads, lanes: traffic.roads.length, batches: roads.batches, triangles: roads.triangles },
      cars: carSet ? carSet.stats() : carStats,
      trafficProblems: traffic.problems.length,
      wireRuns: wires.runs,
      painted: ground.painted,
      kit: { ...kit.counts },
      scene: { time: look.timeId, ground: look.groundId },
      /* Which rule of ./egg.js found the mark's spot and what it is on,
       * for the harness. Never shown: the pilot has to find it. */
      egg: stfSpot ? {
        key: stfSpot.key,
        step: stfSpot.step,
        kind: stfSpot.kind,
        inside: stfSpot.inside,
        elementId: stfSpot.elementId,
        type: stfSpot.type,
        part: stfSpot.part,
        painted: Boolean(egg),
      } : null,
      lamps: lampGlow ? { lamps: lampGlow.lamps, pools: lampGlow.pools } : null,
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
      roads.dispose();
      if (carSet) {
        carSet.dispose();
      }
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
