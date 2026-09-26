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
import { namedGaps } from '../../game/gaps.js';
import { disposeSceneGraph } from '../../render/shell.js';
import { SESSION_TEXTURES } from '../../render/session-textures.js';
import { yieldToPaint } from '../../ui/loading.js';
import { qualityFor } from '../../render/quality.js';
import { readAutosave } from '../../trackbuilder/storage.js';
import { normalize } from '../../trackbuilder/model.js';
import { docModeOf } from '../../trackbuilder/elements.js';
import { PropKit, ownedPropMaterials } from '../../props/kit.js';
import { addSolids } from '../../props/solids.js';
import { poleWireAnchors } from '../../props/street.js';
import { sincos } from '../../props/trig.js';
import { makeStfMark } from '../../art/stf.js';
import { placeDocument, groundUnder, topUnder, PLATFORM_REACH } from './place.js';
import { starterMap } from './starter.js';
import { lookOf, kitLook, paintLights, paintSky, paintPost } from './looks.js';
import { chooseStfSpot } from './egg.js';
import { trafficOf, uploadTraffic, roadKeepOut } from './traffic.js';
import { buildRoadMesh, roadCover } from './roadmesh.js';
import { buildCars } from './cars.js';
import { buildGround } from './ground.js';

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
     *   restKeepOut         the roads a car drives, where a crash is not
     *                       set down (./traffic.js roadKeepOut, read by
     *                       src/game/collide.js findRestSpot)
     */
    traffic: carSet ? traffic : null,
    restKeepOut: carSet ? roadKeepOut(traffic) : null,
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
    /* The author's named gaps as world rectangles, for the counter
     * (src/game/gaps.js): placeDocument's zones, placed by the one
     * conversion everything on this map goes through. Nothing solid and
     * nothing drawn. */
    gaps: namedGaps(placed.zones),
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
