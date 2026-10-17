/*
 * view3d.js: the 3D view, the room every canvas is built in. Three.js, orbit, and the scene edit3d.js's gestures work on.
 *
 * THE Y UP CONVERSION HAPPENS ONCE, HERE, ON LINE ONE OF build(): the scene
 * root is rotated -90 degrees about X, which maps the document's right
 * handed Z up world onto Three.js's Y up scene. Every mesh below is built in
 * DOCUMENT coordinates and nothing else in this module or anywhere else in
 * the track builder converts a single axis. This is the same discipline
 * CLAUDE.md sets for the simulator's own render boundary, applied to the
 * builder's separate one. If a gate ever appears lying on its side, this
 * rotation is the only line that can be responsible.
 *
 * EVERY CANVAS IS BUILT IN THE ROOM: the whoop's, the five inch's and, since
 * FREESTYLE-3D-BUILD-PLAN.md, the map's. Its gestures are edit3d.js's (place
 * with a click and a ghost, pull a piece across the floor, turn it by the ring at
 * its foot, box select; on a map also lay a road and drop a car), and this file
 * draws what they need: the ghost, the ring, a translucent pane in every opening
 * in RaceGOW's own colour, an arrow through it, and the flying order's numbers
 * as HTML bubbles over the canvas so they stay one size and can be clicked. Drag
 * on empty space orbits, middle or right drag pans, the wheel zooms. What a
 * piece stands on, and so where a click puts it, is surfaceAt's.
 *
 * The scene is rebuilt wholesale whenever the document changes. A track is
 * tens of objects, not thousands, and a rebuild that cannot get out of step
 * with the document is worth more here than an incremental update that can.
 *
 * THREE.JS IS LOADED LAZILY, ON THE FIRST PRESS OF THE 3D BUTTON, and that is
 * not an optimisation. A static `import * as THREE from 'three'` here puts
 * the CDN on the critical path of the WHOLE TOOL: the browser fetches the
 * entire static module graph before a line of app.js runs, so a slow CDN
 * makes the 2D authoring view slow to appear and an unreachable one makes it
 * never appear at all. Measured on a network that could not reach jsdelivr,
 * that is exactly what happened: a blank page with no palette and no canvas,
 * for a view the author had not even asked for. The 2D view is the tool; the
 * 3D view is a preview, and a preview must not be able to take the tool down
 * with it. This mirrors what src/boot.js does for the simulator, for the same
 * reason.
 *
 * A FREESTYLE MAP IS DRAWN IN THE GAME'S OWN ART, so what is built is what is
 * flown. Its assets are drawn by the same src/props/kit.js the built map
 * draws with, lit by the town's lights under the town's sky, and put through
 * the town's ink and grade (src/maps/city/vendored/core/post.js). All of that
 * is fetched the same lazy way as Three.js and later still: only when the 3D
 * view opens on a freestyle document. A race or whoop document never loads a
 * line of it, and its scene is the race scene described above, untouched. The
 * freestyle half has its own scene with its own root, rotated by the same
 * one conversion; the kit's assets are Y up in their own frame, and the one
 * extra frame change that brings them into the document is written down
 * where it happens, in buildAsset().
 *
 * A MAP'S ROADS AND CARS are drawn by the simulator's own
 * src/maps/built/roadmesh.js and cars.js, from trafficOf, fetched with the
 * cel kit, and the cars stand where they start. PLAY drives them: the
 * first press fetches the physics module (dist/sim.wasm, through the
 * loader the shell uses), hands it the map's traffic, and from then on
 * every car is drawn where the module says it is at the clock, the
 * milliseconds since Play was pressed. Stop puts them back. The frame
 * change they need and the clock are written down in buildTraffic() and
 * poseTraffic().
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

import { scaleOf } from './scale.js';
import { ELEMENTS, KIND, FRAME_TUBE_OD, LETTER_TUBE_OD, GATE_FLAG_POLE_R, apertureShapeOf, docModeOf, flagLeanSign, flagSideOf, flagSideSigns, frameSidesOf, unbuiltPolesOf, poleBuilt, uprightIntact, gateFlagHeight, isLetterPiece, isPlain, isUnbuilt, trackClassOf, virtualApertureDims } from './elements.js';
import { PIPE_OD as RACEGOW_PIPE_OD, GATE_OPENING_DEFAULT, envelopeFor } from './racegow.js';
import {
  aperturesOf, createElement, elementById, kindOf, apertureCenter, letterLayoutOf, logosOf, logoForDecal, cropOf, dressOrder, topOf,
} from './model.js';
import { sequenceNumbers } from './sequence.js';
import { aroundPass, arrowLanes, spreadTags, stretchOf, tagsOf } from './passes.js';
import { RoomEditor } from './edit3d.js';
import { planShapeOf } from './view2d.js';
import { absNodes, footprint, legMidpoints, vehiclePlace } from './roadtool.js';
import { frameRectFor } from './snap.js';
import { levelName } from './figures.js';
import { travelDirection, markerPassDir } from './faces.js';
import { knotForSeq, markerSquare } from './path.js';
import { apertureFrame, clamp, gateSupportFeet, leftOf, normalize, scale } from './geometry.js';
import { guideFromKnots, knotsFromPath, tessellateGuide } from '../game/guide.js';
import { isRoomType, roomBoxes, ROOM_COLOURS } from '../props/room.js';
/* What a hoop and a hex gate are: the outline of the hole and of the tubes round it, as bars and as a pane. */
import {
  barsAlong, frameOutline, outlineOf, paneFan, paneOfPolygon,
} from '../props/aperture.js';
import { placedYaw } from '../props/solids.js';
import { primaryOpening } from '../props/letters.js';
/* A map's traffic, as the physics is handed it, and where each car starts:
 * already on the 2D view's graph, so importing them here loads nothing. The
 * module that drives them, and the code that draws them, are fetched later
 * (loadFreestyle, loadPlay). */
import { trafficOf, uploadTraffic, vehicleStart } from '../maps/built/traffic.js';
import { docToWorld, supportsFor } from '../maps/built/place.js';
import { makeVehiclePoses, readVehicles, setVehicleClock } from '../game/plantworld.js';

/*
 * The printed vinyl the world dresses its gates and flags in, so what an
 * author builds here looks like what they fly. src/art/ is neither the game
 * nor the builder: it is the artwork both draw from, which is what lets the
 * builder use it without importing a line of the simulator.
 */
import {
  BANNER_SIZE, bannerCanvas, bannerHex, GATE_BANNER_H, GROUND_INK,
  paintGateHeader, paintGateSleeve, paintFlagSailPair, flagMast, flagSailProfile,
} from '../art/banners.js';
import {
  assembleStartBlock, START_BLOCK_WOOD, START_BLOCK_WOOD_DARK, START_BLOCK_FOAM, START_BLOCK_LIP,
} from '../art/startblock.js';

/* The header banner's height and the fraction of it left clear at each end
 * for the gate number, matching src/render/scene.js. */
/* The board's real height, from the module that paints it. */
const BANNER_H = GATE_BANNER_H;

const COL = {
  ground: 0x16232f,
  grid: 0x2b3d4d,
  gridMajor: 0x415a70,
  frame: 0xc7d8e6,
  frameSel: 0xffd45c,
  /* One side of a selected gate, picked to be taken away. Hot, so it
   * cannot be mistaken for the selection's amber. */
  sidePicked: 0xff5a36,
  /* RaceGOW's pole is red on every diagram and red in the world. */
  pole: 0xc0392b,
  entry: 0x7dffb4,
  exit: 0xff7d7d,
  barrier: bannerHex('vinyl'),
  marker: 0xf7e8cd,
  cone: 0xff9a4d,
  start: 0x7dffb4,
  path: 0xffd45c,
  sky: 0x0e1720,
  /* A named gap's window: a deeper amber than the selection's, so a
   * selected gap still reads as selected. */
  gap: 0xffa726,
  /* A balloon chase's marker: the plane's balloons' pink, which is in no
   * other piece the builder draws. */
  balloon: 0xff7aa8,
  /* The whoop room: the hall dimmed, the RaceGOW envelope lit inside it, the
   * arrow through an opening, and the ring at a selected gate's foot. */
  groundDim: 0x0f1a24,
  envelope: 0x1f3345,
  envelopeLine: 0x5f86a8,
  arrow: 0xf7e8cd,
  /* A field's gates are not coloured by what they are, as RaceGOW's are: the pane in an opening is pale, and
   * the gate the lap starts on is green on every canvas. */
  pane: 0xcfe3f5,
  measure: { legal: 0x7dffb4, close: 0xffb347, near: 0xffb347, plain: 0xdfe9f2 },
};

/*
 * RaceGOW'S OWN COLOURS, from the official diagrams (RACEGOW_ELEMENTS in
 * racegow.js), laid as a translucent pane in every opening so a RaceGOW pilot
 * reads a track already: start and finish green, a single gate yellow, stacks
 * purple, an elevated gate orange, a horizontal gate blue, poles red (a pole is
 * drawn red already). The gate the lap starts and stops on is the first one in
 * the flying order.
 */
const RACEGOW_HEX = {
  green: 0x35c47c, yellow: 0xf5c542, purple: 0x9b6bff, orange: 0xff8a3d, blue: 0x4aa8ff, red: 0xe5484d,
  /* Not RaceGOW's: a hoop and a hex gate are not in its diagrams, so they are two colours it does not
   * use, and a RaceGOW pilot does not read them as a kind of gate they know. */
  teal: 0x2ec4c4, pink: 0xf06292,
};
const RACEGOW_TYPE_COLOUR = {
  gate: 'yellow', doubleStack: 'purple', ladder: 'purple', tower: 'orange', diveGate: 'blue', hoop: 'teal', hexGate: 'pink',
};

/* Filled in by loadThree() on the first press of the 3D button. Until then
 * every method here is a no op and nothing in the module refers to it. */
let THREE = null;
let loading = null;

async function loadThree() {
  if (THREE) {
    return THREE;
  }
  if (!loading) {
    loading = import('three').then((m) => {
      THREE = m;
      return m;
    });
  }
  return loading;
}

/* Start the download now rather than at the first press of the 3D button.
 * The five inch and the whoop open IN 3D, so the first frame of the page is
 * waiting on Three.js, a megabyte from the CDN, and the builder (unlike the
 * simulator, see fresh.js PRELOAD) has no modulepreload for it: the fetch
 * began only once App had been built, behind the whole module graph, and the
 * track stayed an empty frame until it came. Kicked off here it runs beside
 * that graph instead of after it. A failure is not reported here: it is
 * cached in `loading`, and setEnabled awaits the same promise and says so. */
if (typeof document !== 'undefined') {
  loadThree().catch(() => {});
}

/*
 * THE FREESTYLE HALF, filled in by loadFreestyle() the first time the 3D
 * view opens on a map. It comes in two parts because they fail differently:
 *
 *   FS    src/props/catalog.js and solids.js: what each asset is, its parts,
 *         and the heading it is placed at. Pure data and arithmetic, no
 *         Three.js, so it loads wherever the builder itself loads.
 *   CEL   the props kit, the town's palette, toon materials, sky, outline
 *         and post pipeline. These reach three/addons through the page's
 *         import map, so a page or a CDN that cannot serve those must still
 *         leave a working preview: without CEL each asset is drawn as its
 *         plain solids in the race preview's scene, and the author is told.
 */
let FS = null;
let CEL = null;
let celError = null;
let fsLoading = null;
let TRAFFIC = null;
let trafficError = null;

/*
 * PLAY: the physics module, fetched the first time Play is pressed and
 * never before, so opening the builder, and opening the 3D view, cost what
 * they always did. tests/lib/simmod.js is the loader the simulator's shell
 * boots the module with; the bytes are dist/sim.wasm, resolved against this
 * file the way src/main.js resolves them against its own.
 */
const WASM_URL = new URL('../../dist/sim.wasm', import.meta.url).href;
let SIM = null;
let simLoading = null;

async function loadPlay() {
  if (SIM) {
    return SIM;
  }
  if (!simLoading) {
    simLoading = (async () => {
      const [{ loadSim }, res] = await Promise.all([
        import('../../tests/lib/simmod.js'),
        fetch(WASM_URL),
      ]);
      if (!res.ok) {
        throw new Error(`dist/sim.wasm: ${res.status}`);
      }
      SIM = await loadSim(await res.arrayBuffer());
      return SIM;
    })().catch((e) => {
      simLoading = null;
      throw e;
    });
  }
  return simLoading;
}

/* The smoke's feed, every this many steps of the clock (cars.js emit). */
const EMIT_EVERY = 8;
/* A tab that was hidden for minutes comes back to this much of the clock's
 * smoke and no more, ms: every puff older is long gone. */
const EMIT_BACKLOG = 5000;

async function loadFreestyle() {
  if (FS) {
    return FS;
  }
  if (!fsLoading) {
    fsLoading = (async () => {
      const [catalog, solids] = await Promise.all([
        import('../props/catalog.js'),
        import('../props/solids.js'),
      ]);
      try {
        const [kit, palette, post, sky, toon, outline, looks] = await Promise.all([
          import('../props/kit.js'),
          import('../maps/city/vendored/core/palette.js'),
          import('../maps/city/vendored/core/post.js'),
          import('../maps/city/vendored/core/sky.js'),
          import('../maps/city/vendored/core/toon.js'),
          import('../maps/city/vendored/core/outline.js'),
          import('../maps/built/looks.js'),
        ]);
        CEL = {
          PropKit: kit.PropKit,
          PAL: palette.PAL,
          Pipeline: post.Pipeline,
          buildSky: sky.buildSky,
          buildDistantHills: sky.buildDistantHills,
          cel: toon.cel,
          flat: toon.flat,
          setOutlineResolution: outline.setOutlineResolution,
          looks,
        };
      } catch (e) {
        celError = e.message ?? String(e);
      }
      /* The roads and the moving cars, drawn by the modules the simulator
       * draws them with, so the preview's road and car are the game's. In
       * the town's cel materials, so only once those have come, and on
       * their own, so a failure here leaves every asset drawn. */
      if (CEL) {
        try {
          const [roadmesh, cars] = await Promise.all([
            import('../maps/built/roadmesh.js'),
            import('../maps/built/cars.js'),
          ]);
          TRAFFIC = { buildRoadMesh: roadmesh.buildRoadMesh, buildCars: cars.buildCars };
        } catch (e) {
          trafficError = e.message ?? String(e);
        }
      }
      FS = {
        assetOf: catalog.assetOf, partsOf: catalog.partsOf, placedPartsOf: catalog.placedPartsOf, placedYaw: solids.placedYaw,
      };
      return FS;
    })().catch((e) => {
      /* Forgotten, so the next time the view opens on a map it asks again
       * rather than holding a failure from a network that has since come
       * back. */
      fsLoading = null;
      throw e;
    });
  }
  return fsLoading;
}

/*
 * The sky dome's radius, the town's. The preview scales it (and the ink's
 * idea of where the sky starts) with the orbit, because an author can pull
 * the camera out to 600 m and a dome that stayed at 500 would swallow the
 * far side of the plot.
 */
const SKY_R = 500;

/*
 * The ink, as the built map runs it. BuiltPipeline in src/maps/built/index.js
 * replaces the town's second difference of linear depth with one of inverse
 * depth, which is flat across a plane at any angle, so the paving stops
 * drawing a line on itself where the camera grazes it. The preview replaces
 * the same two lines on its own copy of the material, so the vendored file
 * stays byte identical, and if a vendored update ever changes them the
 * replace finds nothing and the town's ink runs unchanged.
 */
const INK_LINEAR = `      float sx = ( dl + dr - 2.0 * dc ) / dc;
      float sy = ( du + dd - 2.0 * dc ) / dc;`;
const INK_INVERSE = `      float sx = 2.0 - dc / dl - dc / dr;
      float sy = 2.0 - dc / du - dc / dd;`;

/*
 * The town's pipeline, with the two things it does to a shared renderer
 * undone. Its setSize drops the pixel ratio to one and writes the canvas's
 * CSS size in pixels, which on this page would pin the canvas at the size it
 * had when the map opened and leave the race preview at the wrong ratio
 * after it. Made on first use because the class it extends arrives with CEL.
 */
let PreviewPipeline = null;
function previewPipelineClass() {
  if (PreviewPipeline) {
    return PreviewPipeline;
  }
  PreviewPipeline = class extends CEL.Pipeline {
    constructor(renderer, scene, camera, opts) {
      super(renderer, scene, camera, opts);
      const frag = this.ink.mat.fragmentShader;
      if (frag.includes(INK_LINEAR)) {
        this.ink.mat.fragmentShader = frag.replace(INK_LINEAR, INK_INVERSE);
        this.ink.mat.needsUpdate = true;
      }
    }

    setSize(w, h) {
      const ratio = this.renderer.getPixelRatio();
      super.setSize(w, h);
      this.renderer.setPixelRatio(ratio);
      this.renderer.setSize(w, h, false);
      this.renderer.domElement.style.width = '';
      this.renderer.domElement.style.height = '';
      /* The town's cars carry inverted hull contours whose width is in
       * pixels of the buffer they are drawn into. */
      CEL.setOutlineResolution(this.size.x, this.size.y);
    }
  };
  return PreviewPipeline;
}

/*
 * The grid's spacing on the ground. A metre grid over a 60 by 40 field is a
 * hundred lines, which is nothing, but a 1 m grid over a 500 m field would
 * be a thousand, so it coarsens the same way the 2D grid does.
 */
function gridStep(field) {
  let s = field.gridSize;
  while ((field.width / s) + (field.depth / s) > 260) {
    s *= 5;
  }
  return s;
}

/*
 * Everything an asset's drawing depends on, and nothing it does not. Where
 * it stands and which way it faces belong to its holder, so dragging or
 * turning an element reuses its drawing and the rest of the map is not
 * rebuilt at all. The id is in the key so a drawing is never shared between
 * two elements, which is what lets its meshes carry one element's id for
 * picking. The height is in it for the one layout that reads it:
 * hpoleLayout in src/props/course.js reaches its legs from the bar down to
 * the ground.
 */
function assetKey(el) {
  return [
    el.id, el.type, el.style ?? '', JSON.stringify(el.dims), el.pitch ?? 0, el.flagSide ?? '',
    el.unbuilt ? 'unbuilt' : '', el.type === 'horizontalPole' ? el.position.z : '', el.letter ?? '',
  ].join('|');
}

/*
 * THE PICK PROXY. A crane's mast, a lattice tower and a gate are mostly
 * air, and each member is a few centimetres thick, which at the map's
 * opening orbit is under a pixel: clicked where it plainly is, the ray went
 * between the members and the drag orbited the camera instead. So every
 * thin capsule an asset's layout makes is also put, fattened to PICK_R, into
 * one mesh that is never drawn and is only there to be hit. Only thin
 * capsules: a wall or a slab is already as large as it looks, and a gate's
 * opening stays open, so the gate behind it can still be picked through it.
 */
const PICK_R = 0.3;
/* How close to the racing line, in screen pixels, a press grabs it, and how
 * far a press has to travel before it bends it rather than being a click. */
/* How much of the race field's label size a whoop's numbers get. They were
 * 0.30, which is a number 0.33 m tall over a gate 0.71 m across: nearly half
 * of it, so at the distance that shows a whole track the numbers covered the
 * gates they named. */
const MICRO_LABEL_K = 0.14;

/* The camera's vertical field of view, named once because framing a track needs it. */
const FOV_DEG = 52;

/* The camera Plan looks down from, as near straight down as applyCamera allows. The angle a room opens at is
 * scale.js's, because a hall and a field are not looked at the same way. */
const PLAN_PHI = Math.PI / 2 - 0.02;

const LINE_GRAB_PX = 9;

/* How far from a finger's contact point, in pixels, a press still takes a thing: the
 * pad of a finger is about a centimetre across. */
const FINGER_SLOP_PX = 18;
const BEND_START_PX = 4;
let pickUnit = null;
let pickMaterial = null;

function pickProxy(parts) {
  if (!pickUnit) {
    pickUnit = new THREE.CylinderGeometry(1, 1, 1, 6, 1).toNonIndexed();
    /* Never drawn, since the mesh is invisible; both sides, so a ray that
     * starts inside a fattened member still finds it. */
    pickMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  }
  const unit = pickUnit.getAttribute('position');
  const out = [];
  const up = new THREE.Vector3(0, 1, 0);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const mid = new THREE.Vector3();
  const size = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const m = new THREE.Matrix4();
  const v = new THREE.Vector3();
  for (const p of parts) {
    if (p.t !== 'cap' || !(p.draw || p.solid) || p.r >= PICK_R) {
      continue;
    }
    a.fromArray(p.a);
    b.fromArray(p.b);
    const len = a.distanceTo(b);
    if (len < 1e-6) {
      continue;
    }
    q.setFromUnitVectors(up, dir.subVectors(b, a).divideScalar(len));
    m.compose(mid.addVectors(a, b).multiplyScalar(0.5), q, size.set(PICK_R, len, PICK_R));
    for (let i = 0; i < unit.count; i += 1) {
      v.fromBufferAttribute(unit, i).applyMatrix4(m);
      out.push(v.x, v.y, v.z);
    }
  }
  if (!out.length) {
    return null;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, pickMaterial);
  mesh.visible = false;
  mesh.name = 'pickProxy';
  return mesh;
}

/*
 * THE SELECTION, round a whole asset: an amber box a little larger than
 * what it drew, tinted faintly, its edges drawn solid where they are seen
 * and faint where something stands in front of them. A tint on the asset
 * itself is not possible, because its materials are shared with every other
 * asset of the same colour, and a box also shows how much of the plot a
 * selected building takes. Nothing here writes depth, so the ink pass draws
 * no line round the box and the tint never hides what it is round.
 */
function selectionBox(box) {
  const b = box.isEmpty()
    ? new THREE.Box3(new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 1, 0.5))
    : box;
  const size = b.getSize(new THREE.Vector3()).addScalar(0.4);
  const geo = new THREE.BoxGeometry(size.x, size.y, size.z);
  const edges = new THREE.EdgesGeometry(geo);
  const g = new THREE.Group();
  b.getCenter(g.position);
  const tint = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color: COL.frameSel, transparent: true, opacity: 0.16, depthWrite: false, fog: false,
  }));
  const seen = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({
    color: COL.frameSel, depthWrite: false, fog: false,
  }));
  const hidden = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({
    color: COL.frameSel, transparent: true, opacity: 0.4, depthTest: false, depthWrite: false, fog: false,
  }));
  hidden.renderOrder = 9;
  g.add(tint, seen, hidden);
  return g;
}

/*
 * The feather sail's outline, as a plane grid in XY: x out from the mast,
 * y up, origin at the mast's butt.
 *
 * The same profile src/render/scene.js lofts, out of the same function in
 * src/art/banners.js, so a flag in the preview and a flag in the air are the
 * same shape. The world's version carries a second attribute for the wave in
 * its shader; the preview does not wave, so this is the outline and its uv
 * and nothing else.
 *
 * TWO SHEETS, NOT ONE DOUBLE SIDED ONE, for the same reason the gate boards
 * are two planes: a single sheet seen from behind shows its own texels in a
 * mirror, so the sponsor's mark read backwards from one side of every flag
 * on the course. The reverse sheet sits on the same vertices and reads the
 * other half of the printed sheet. paintFlagSailPair in src/art/banners.js
 * is where the whole of that is written down.
 */
function sailPlaneGeometry(poleR, h) {
  const { rows: profile } = flagSailProfile(h);
  const rows = profile.length;
  const cols = 5;
  const pos = [];
  const uvMinusZ = [];
  const uvPlusZ = [];
  const idx = [];
  for (let r = 0; r < rows; r += 1) {
    const row = profile[r];
    for (let c = 0; c < cols; c += 1) {
      const u = c / (cols - 1);
      pos.push(poleR + row.lx + (row.tx - row.lx) * u, row.ly + (row.ty - row.ly) * u, 0);
      /* The right half BACKWARDS on the sheet that faces -z, the left half
       * straight on the one that faces +z. src/render/scene.js carries the
       * long version of why that pairing and not the other. */
      uvMinusZ.push(1 - u * 0.5, row.t);
      uvPlusZ.push(u * 0.5, row.t);
    }
  }
  const n = rows * cols;
  const back = [];
  for (let r = 0; r < rows - 1; r += 1) {
    for (let c = 0; c < cols - 1; c += 1) {
      const a = r * cols + c;
      idx.push(a, a + cols, a + 1, a + 1, a + cols, a + cols + 1);
      back.push(
        n + a + 1, n + a + cols, n + a,
        n + a + cols + 1, n + a + cols, n + a + 1,
      );
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos.concat(pos), 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvMinusZ.concat(uvPlusZ), 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  /* The reverse block was not in that index, so it has no normal yet. The
   * front's, copied: computing over both sheets averages each opposed pair
   * of faces to nothing and the cloth goes black. */
  const nrm = geo.getAttribute('normal');
  for (let i = 0; i < n; i += 1) {
    nrm.setXYZ(n + i, nrm.getX(i), nrm.getY(i), nrm.getZ(i));
  }
  nrm.needsUpdate = true;
  geo.setIndex(idx.concat(back));
  geo.computeBoundingSphere();
  return geo;
}

/*
 * The mast that carries it, in the same plane and with the same origin, so
 * the two take one transform between them and cannot come apart.
 *
 * Six sided rather than the world's five, and no cloth: this is a preview,
 * and a mast a metre from the camera on an orbit control is one of the few
 * things in it somebody looks at closely.
 */
function mastPlaneGeometry(poleR, h) {
  const { points } = flagMast(h);
  const radial = 6;
  const pos = [];
  const uvs = [];
  const idx = [];
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    let tx = next.x - prev.x;
    let ty = next.y - prev.y;
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl;
    ty /= tl;
    const r = poleR * p.r;
    for (let a = 0; a < radial; a += 1) {
      const th = (a / radial) * Math.PI * 2;
      pos.push(p.x + -ty * Math.cos(th) * r, p.y + tx * Math.cos(th) * r, Math.sin(th) * r);
      /* Nothing samples it. It is here so this mesh carries the same
       * attributes as every other mesh a merger might fold it in with. */
      uvs.push(a / radial, i / (points.length - 1));
    }
  }
  for (let i = 0; i < points.length - 1; i += 1) {
    for (let a = 0; a < radial; a += 1) {
      const a0 = i * radial + a;
      const a1 = i * radial + ((a + 1) % radial);
      idx.push(a0, a0 + radial, a1, a1, a0 + radial, a1 + radial);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

export class View3D {
  constructor(canvas, host) {
    this.canvas = canvas;
    this.host = host;
    this.enabled = false;
    this.loadError = null;
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.root = null;         /* everything in DOCUMENT coordinates lives here */
    this.content = null;      /* rebuilt group */
    this.pickables = [];
    /* Plain numbers rather than a THREE.Vector3, because the orbit target is
     * set by frameTrack() before the library has necessarily arrived. */
    this.orbit = { target: { x: 0, y: 0, z: 0 }, radius: 60, theta: -Math.PI / 2.4, phi: 1.05 };
    this.drag = null;
    this.dirty = true;
    /* A frame asked for while the canvas had no size: see frameTrack. */
    this.needsFrame = false;
    /* The freestyle half: its scene, once CEL has arrived, and each asset's
     * drawing, kept across rebuilds by assetKey(). */
    this.fs = null;
    this.supports = null;
    this.handles = null;
    this.draftGroup = null;
    this.draftKey = '';
    this.draftPointer = null;
    this.draftPointerKey = '';
    this.carGhostGroup = null;
    this.carGhostKey = '';
    this.assets = new Map();
    this.builtFreestyle = false;
    this.fsPending = null;
    this.fsFailed = null;
    this.viewW = 1;
    this.viewH = 1;
    /* A map's roads and cars, drawn, kept across rebuilds until the traffic
     * changes (buildTraffic); and Play's state while it runs. */
    this.traffic = null;
    this.play = null;
    this.playUi = null;
    /* The whoop room. Each element's drawing by id, so a drag can move it
     * without a rebuild; the racing line, so it can be redrawn alone; what
     * the pointer is over; the ghost of the piece about to be placed and the
     * distances shown beside it; the box being dragged; and the HTML laid over
     * the canvas. */
    this.groups = new Map();
    this.pathLine = null;
    this.faceSig = '';
    this.hoverId = null;
    this.ghost = null;
    this.ghostGroup = null;
    this.measures = [];
    this.ruler = null;
    this.rulerGroup = null;
    this.rulerNode = null;
    this.overlay = null;
    this.bubbles = [];
    /* What the tags were last built from, so a rebuild for a hover or a
     * selection does not take a tag out from under the pointer. */
    this.tagSig = '';
    this.badges = [];
    this.badgeSource = null;
    this.badgeTip = null;
    this.measureNodes = [];
    this.boxNode = null;
    this.angled = false;
    this.roomAngle = null;
    this.editor = new RoomEditor(this, host);
    this.ensureOverlay();
    this.bind();
  }

  /* Whether the whoop room's gestures are the ones answering the pointer. */
  roomEditing() {
    return this.editor.active();
  }

  isFreestyle() {
    return docModeOf(this.host.doc) === 'freestyle';
  }

  /*
   * THE ROOT THE ROOM'S EXTRAS GO IN: the ghost, the guides, the distances, the ruler and the ring. A map
   * is drawn in a scene of its own (ensureFreestyle), and anything put in the race scene's root is never
   * rendered, so these follow the content. Both roots take the one conversion, so a document point is the
   * same point in either.
   */
  stage() {
    return this.isFreestyle() && this.fs ? this.fs.root : this.root;
  }

  /*
   * The course's printed dress, as materials, cached until the logo changes.
   *
   * Same artwork as the world's, painted by the same module, so an author
   * looking at this preview is looking at the gates they will fly. Cached on
   * the view because the content group is rebuilt on every edit and painting
   * three canvases per keystroke is the one thing here that would be slow.
   */
  bannerKit() {
    const logos = logosOf(this.host.doc);
    /*
     * A cheap signature rather than the images themselves. This runs on
     * every rebuild, which is every keystroke in the inspector, and
     * comparing five 256 kB strings that came out of a fresh JSON.parse is
     * a megabyte of memcmp per keypress. The id says which mark, the length
     * and the tail of the base64 say which artwork, and two different PNGs
     * agreeing on both is not a case worth a millisecond a keystroke.
     */
    const sig = logos.map((l) => `${l.id}|${l.image.length}|${l.image.slice(-32)}`).join(',');
    if (this.kit && this.kit.sig === sig) {
      return this.kit;
    }
    if (this.kit) {
      for (const m of this.kit.owned) {
        if (m.map) {
          m.map.dispose();
        }
        m.dispose();
      }
    }
    const owned = [];
    const jobs = [];
    const paint = (slot, size, painter, opts, side = THREE.DoubleSide) => {
      const canvas = bannerCanvas(size[0], size[1]);
      const ctx = canvas.getContext('2d');
      painter(ctx, size[0], size[1], opts);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      jobs.push({
        slot,
        run: (img) => {
          painter(ctx, size[0], size[1], { ...opts, logo: img });
          tex.needsUpdate = true;
          this.host.requestDraw();
        },
      });
      const mat = new THREE.MeshLambertMaterial({ map: tex, side });
      /* Owned by the kit, not by the scene graph it gets attached to. See
       * disposeContent, which walks the content and frees what it finds. */
      mat.userData.sharedKit = true;
      owned.push(mat);
      return mat;
    };
    /* One material per mark and accent, shared between the run of turn
     * flags and the gates' own header pennants. Same arrangement as
     * src/render/scene.js, and the comment there is the long version. */
    const sailCache = new Map();
    const sailOf = (slot, accent) => {
      const id = `${slot}:${accent}`;
      let mat = sailCache.get(id);
      if (!mat) {
        /* FrontSide, because the sail now carries its own reverse faces.
         * DoubleSide would draw both sheets from both sides, and two sheets
         * on the same vertices fighting for the depth buffer is a speckled
         * flag. */
        mat = paint(slot, BANNER_SIZE.sailSheet, paintFlagSailPair, { accent }, THREE.FrontSide);
        sailCache.set(id, mat);
      }
      return mat;
    };
    const n = Math.max(1, logos.length);
    const dress = [];
    for (let i = 0; i < n; i += 1) {
      dress.push({
        header: paint(i, BANNER_SIZE.header, paintGateHeader, {}),
        sleeve: paint(i, BANNER_SIZE.sleeve, paintGateSleeve, {}),
        /* The far leg's sleeve, painted mirrored. A second canvas rather
         * than a negative scale on the mesh, because a negative scale
         * inverts the winding and a single sided plane turned inside out
         * disappears. */
        sleeveFlipped: paint(i, BANNER_SIZE.sleeve, paintGateSleeve, { flip: true }),
        sails: [sailOf(i, 'navy'), sailOf(i, 'red')],
      });
    }
    const runLength = n % 2 === 0 ? n : n * 2;
    const sails = [];
    for (let i = 0; i < runLength; i += 1) {
      sails.push(sailOf(i % n, i % 2 === 1 ? 'red' : 'navy'));
    }
    /*
     * The ground paint's material, one per mark, made only once its image
     * has decoded. Until then a decal draws its footprint and nothing else,
     * which is honest: a plane with an empty texture on it is a white slab
     * where the author expects their logo.
     */
    const groundMats = logos.map(() => null);
    const groundImages = logos.map(() => null);
    this.kit = {
      sig, marks: n, dress, sails, owned, groundMats, groundImages,
      forGate: (i) => dress[((Math.round(i) % n) + n) % n],
    };
    const kit = this.kit;
    for (let i = 0; i < logos.length; i += 1) {
      const slot = i;
      const img = new Image();
      img.onload = () => {
        if (this.kit !== kit) {
          return;
        }
        kit.groundImages[slot] = img;
        const tex = new THREE.Texture(img);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        tex.needsUpdate = true;
        const mat = new THREE.MeshBasicMaterial({
          map: tex, transparent: true, opacity: GROUND_INK, depthWrite: false,
        });
        mat.userData.sharedKit = true;
        owned.push(mat);
        kit.groundMats[slot] = mat;
        for (const job of jobs) {
          if (job.slot === slot) {
            job.run(img);
          }
        }
        /* A rebuild rather than a redraw: the ground paint is geometry that
         * did not exist a moment ago, and only build() makes geometry. */
        this.markDirty();
        this.host.requestDraw();
      };
      img.src = logos[slot].image;
    }
    return this.kit;
  }

  /* Created lazily so a session that never opens the 3D tab never pays for a
   * WebGL context. */
  ensure() {
    if (this.renderer || !THREE) {
      return;
    }
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(COL.sky);
    this.scene.fog = new THREE.Fog(COL.sky, 90, 320);
    this.camera = new THREE.PerspectiveCamera(FOV_DEG, 1, 0.1, 2000);

    /* THE ONE CONVERSION. Document space is Z up; Three.js is Y up. */
    this.root = new THREE.Group();
    this.root.rotation.x = -Math.PI / 2;
    this.scene.add(this.root);

    this.scene.add(new THREE.HemisphereLight(0xdfe9f2, 0x1a2733, 1.5));
    const sun = new THREE.DirectionalLight(0xfff0d0, 1.1);
    sun.position.set(40, 80, 30);
    this.scene.add(sun);
  }

  /*
   * Turn the preview on or off. Returns a promise that settles once the
   * library has arrived, so the caller can report a failure; it is safe to
   * ignore, because draw() does nothing until then.
   */
  async setEnabled(on) {
    this.enabled = on;
    if (!on) {
      /* Play is a preview of the 3D view's; leaving the view stops it. */
      this.stopPlay();
      this.updatePlayUi();
      this.overlay.hidden = true;
      return true;
    }
    if (!THREE) {
      try {
        await loadThree();
      } catch (e) {
        this.loadError = e.message ?? String(e);
        return false;
      }
    }
    /* A map's kit is fetched before the first frame so that frame is the
     * finished one. A failure is reported by fetchFreestyle and does not
     * close the view, and it is tried again each time the view is opened;
     * a map that arrives while the view is already open is fetched from
     * draw(). */
    if (this.isFreestyle()) {
      this.fsFailed = null;
      await this.fetchFreestyle();
    }
    this.ensure();
    this.resize();
    if (this.needsFrame) {
      this.frameTrack();
    }
    this.dirty = true;
    this.host.requestDraw();
    return true;
  }

  /*
   * Fetch the freestyle half once, and say so if it could not all come. The
   * promise never rejects: the preview carries on with what arrived.
   */
  fetchFreestyle() {
    if (FS || this.fsFailed) {
      return Promise.resolve();
    }
    if (!this.fsPending) {
      this.fsPending = loadFreestyle().then(() => {
        if (celError) {
          this.host.toast?.(`The cel kit did not load (${celError}), so the 3D view draws each asset as its plain solids. The map is unaffected.`);
        }
      }, (e) => {
        this.fsFailed = e.message ?? String(e);
        this.host.toast?.(`The 3D view could not load the freestyle assets (${this.fsFailed}), so it shows the plot without them. The 2D view is unaffected.`);
      }).then(() => {
        this.fsPending = null;
        this.dirty = true;
        this.host.requestDraw();
      });
    }
    return this.fsPending;
  }

  resize() {
    if (!this.renderer) {
      return;
    }
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    /* Kept for the freestyle pipeline, which sizes its targets on the next
     * frame it draws rather than here, so a race preview never touches it. */
    this.viewW = w;
    this.viewH = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /* ---------------- camera ---------------- */

  applyCamera() {
    if (!this.camera) {
      return;
    }
    const o = this.orbit;
    o.phi = clamp(o.phi, 0.06, Math.PI / 2 - 0.02);
    o.radius = clamp(o.radius, this.nearestRadius(2), 600);
    const x = o.target.x + o.radius * Math.cos(o.phi) * Math.cos(o.theta);
    const z = o.target.z + o.radius * Math.cos(o.phi) * Math.sin(o.theta);
    const y = o.target.y + o.radius * Math.sin(o.phi);
    this.camera.position.set(x, y, z);
    this.camera.lookAt(o.target.x, o.target.y, o.target.z);
  }

  /* How close the camera may come. A gate is 0.71 m across, so the floor that
   * suits a sixty metre course, 2 m, or 4 when framing something, would not let
   * a whoop canvas look at one. */
  nearestRadius(fieldFloor) {
    return trackClassOf(this.host.doc) === 'micro' ? 0.6 : fieldFloor;
  }

  /* Look at a point given in DOCUMENT coordinates. */
  focusDoc(point, radius) {
    this.ensure();
    this.orbit.target = { x: point.x, y: point.z, z: -point.y };
    if (radius != null) {
      this.orbit.radius = clamp(radius, this.nearestRadius(4), 600);
    }
    this.dirty = true;
  }

  /*
   * What Fit and every load show. The whole field on every canvas but the
   * whoop, as it always was; on a whoop canvas the track, from the rectangle
   * frameRectFor gives both views.
   *
   * A SPHERE ROUND THAT RECTANGLE, not the rectangle itself, because the
   * camera turns: a rectangle fits from one bearing and not from another,
   * and the author is about to orbit it. The radius is the sphere's over the
   * sine of half the narrower field of view, which is the distance at which
   * the sphere just fits whichever way the window is shaped.
   *
   * The window is not always the shape it will be. A load that arrives while
   * the plan is showing frames a canvas that has no size, so that is said
   * and done again when the room gets its size, in setEnabled.
   */
  frameTrack() {
    const doc = this.host.doc;
    const f = doc.field;
    if (docModeOf(doc) === 'freestyle') {
      this.focusDoc({ x: f.width / 2, y: f.depth / 2, z: 0 }, Math.max(f.width, f.depth) * 1.15);
      return;
    }
    if (!this.angled) {
      const angle = scaleOf(this.host.doc).angle;
      this.orbit.theta = angle.theta;
      this.orbit.phi = angle.phi;
      this.angled = true;
    }
    const rect = this.canvas.getBoundingClientRect();
    const sized = rect.width > 0 && rect.height > 0;
    const r = frameRectFor(doc);
    const top = Math.max(0.9, ...doc.elements.map((e) => topOf(e)));
    const target = { x: (r.minX + r.maxX) / 2, y: (r.minY + r.maxY) / 2, z: top * 0.4 };
    /* Before Three.js has arrived there is no camera to measure with: a rough
     * distance stands in, and the frame is done again when the room is made. */
    if (!THREE || !this.camera || !this.root) {
      this.needsFrame = true;
      const half = Math.hypot(r.maxX - r.minX, r.maxY - r.minY) / 2;
      this.focusDoc(target, (half * 1.1) / Math.sin((FOV_DEG * Math.PI) / 360));
      return;
    }
    this.needsFrame = !sized;
    this.focusDoc(target, this.fitRadius(r, top, target, sized ? rect.width / rect.height : 1.6));
  }

  /*
   * HOW FAR THE CAMERA HAS TO BE FOR A BOX TO FIT, AT THE ANGLE IT IS AT. The
   * box is the floor rectangle and the height of the tallest piece; the answer
   * is the nearest distance at which all eight corners are inside the picture
   * with a margin, found by halving, because the camera turns and a rectangle
   * fits from one bearing and not from another, and the picture is not always
   * the shape of the window it was framed in (a load that arrives while the
   * plan is showing frames a canvas that has no size: see setEnabled).
   */
  fitRadius(r, top, target, aspect) {
    const o = this.orbit;
    const saved = { target: { ...o.target }, radius: o.radius, aspect: this.camera.aspect };
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    const corners = [];
    for (const z of [0, top]) {
      for (const x of [r.minX, r.maxX]) {
        for (const y of [r.minY, r.maxY]) {
          corners.push(new THREE.Vector3(x, y, z));
        }
      }
    }
    o.target = { x: target.x, y: target.z, z: -target.y };
    const v = new THREE.Vector3();
    const fits = (radius) => {
      o.radius = radius;
      this.applyCamera();
      this.camera.updateMatrixWorld(true);
      this.root.updateMatrixWorld(true);
      return corners.every((c) => {
        v.copy(c);
        this.root.localToWorld(v);
        v.project(this.camera);
        return v.z > -1 && v.z < 1 && Math.abs(v.x) <= 0.86 && Math.abs(v.y) <= 0.86;
      });
    };
    let lo = this.nearestRadius(0.6);
    /* Sixty metres is further than a hall's camera ever needs to be; a field's track is as big as it is. */
    let hi = scaleOf(this.host.doc).metric ? 600 : 60;
    for (let i = 0; i < 28; i += 1) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) {
        hi = mid;
      } else {
        lo = mid;
      }
    }
    o.target = saved.target;
    o.radius = saved.radius;
    this.camera.aspect = saved.aspect;
    this.camera.updateProjectionMatrix();
    return hi;
  }

  /*
   * A DOCUMENT POINT ON THE SCREEN, in pixels from the canvas's top left, or
   * null when it is behind the camera. The root's own rotation is what turns
   * a document point into a scene one, so it is asked to, rather than the
   * conversion being written out here a second time.
   */
  toScreen(p) {
    if (!this.camera || !this.root) {
      return null;
    }
    this.applyCamera();
    this.camera.updateMatrixWorld(true);
    this.root.updateMatrixWorld(true);
    const v = new THREE.Vector3(p.x, p.y, p.z ?? 0);
    this.root.localToWorld(v);
    v.project(this.camera);
    if (v.z < -1 || v.z > 1) {
      return null;
    }
    const rect = this.canvas.getBoundingClientRect();
    return { x: ((v.x + 1) / 2) * rect.width, y: ((1 - v.y) / 2) * rect.height };
  }

  /* ---------------- interaction ---------------- */

  bind() {
    const cv = this.canvas;
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('pointerdown', (e) => this.onDown(e));
    cv.addEventListener('pointermove', (e) => this.onMove(e));
    cv.addEventListener('pointerup', (e) => this.onUp(e));
    /* A pointercancel is a drag the browser took away: a touch turned into
     * a system gesture, or the window lost the pointer. Without this the
     * height edit stayed open and the element went on following the cursor
     * on plain hover, with no button held. View2D has had this for a
     * while. */
    cv.addEventListener('pointercancel', (e) => this.onCancel(e));
    cv.addEventListener('pointerleave', () => this.editor.onLeave());
    /*
     * A SECOND FINGER THAT LANDS ON SOMETHING LAID OVER THE ROOM (the card, a
     * number, a mark, the bar along the foot) is still the second finger of the
     * hand that is on the room: it joins the gesture, and the canvas is given its
     * moves and its lift, so the pair is not lost because one of them came down
     * on a piece of HTML. A finger that is the first on the screen is an ordinary
     * press on whatever it touched.
     */
    cv.parentElement?.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch' || e.target === cv || !this.enabled || !this.roomEditing() || this.editor.touches.size < 1) {
        return;
      }
      cv.setPointerCapture(e.pointerId);
      this.editor.onDown(e);
    }, true);
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (this.roomEditing()) {
        this.editor.onWheel(e);
        return;
      }
      this.orbit.radius *= Math.exp(e.deltaY * 0.0012);
      this.dirty = true;
      this.host.requestDraw();
    }, { passive: false });
  }

  /* ---------------- camera moves the room's gestures share ---------------- */

  /* Turn the camera round what it looks at. Screen right is round to the
   * left, screen down is up, which is what the drag on empty space always did. */
  orbitBy(dx, dy) {
    this.orbit.theta += dx * 0.006;
    this.orbit.phi += dy * 0.006;
    this.angled = true;
    this.cameraMoved();
  }

  /* A camera move redraws. The other canvases have always rebuilt the scene
   * with it, and go on doing so; the whoop room does not, because its HTML
   * (numbers, distances) is rebuilt with the scene and a rebuild on every frame
   * of an orbit would take a number that is being typed into out from under
   * the typing. */
  cameraMoved() {
    if (!this.host.buildsIn3D()) {
      this.dirty = true;
    }
    this.host.requestDraw();
  }

  /* Slide the camera in its own screen plane, scaled by distance so the ground
   * appears to follow the pointer at any zoom. */
  panBy(dx, dy) {
    const right = new THREE.Vector3();
    const up = new THREE.Vector3();
    this.camera.matrixWorld.extractBasis(right, up, new THREE.Vector3());
    const k = this.orbit.radius * 0.0016;
    const t = this.orbit.target;
    this.orbit.target = {
      x: t.x + (-dx * k) * right.x + (dy * k) * up.x,
      y: t.y + (-dx * k) * right.y + (dy * k) * up.y,
      z: t.z + (-dx * k) * right.z + (dy * k) * up.z,
    };
    this.cameraMoved();
  }

  /* Zoom so that what is under the pointer stays under it, which is what
   * "toward the pointer" means: the floor point there is found before and after
   * and the camera is slid by the difference. */
  zoomToward(clientX, clientY, factor) {
    this.gripFloor({ x: clientX, y: clientY }, { x: clientX, y: clientY }, factor, 0);
  }

  /*
   * A GRIP ON THE FLOOR: whatever floor point is under `from` on the screen is put
   * under `to`, after the room has been zoomed by `factor` and turned by `twist`
   * radians. The wheel is a grip that stays where it is; two fingers are a grip
   * that moves, spreads and twists, so sliding, pinching and twisting are one
   * motion and the floor stays under the fingers whichever of them the hand is
   * doing. The camera is brought up to date before the floor point is read and
   * after it is moved: several moves can arrive between two frames, and a point
   * read off the last frame's camera would be off by every move since.
   */
  gripFloor(from, to, factor, twist) {
    this.applyCamera();
    this.camera.updateMatrixWorld(true);
    const anchor = this.levelPoint(from.x, from.y, 0);
    this.orbit.radius = clamp(this.orbit.radius * factor, this.nearestRadius(2), 600);
    this.orbit.theta += twist;
    this.applyCamera();
    this.camera.updateMatrixWorld(true);
    const now = this.levelPoint(to.x, to.y, 0);
    if (anchor && now) {
      const t = this.orbit.target;
      this.orbit.target = { x: t.x + (anchor.x - now.x), y: t.y, z: t.z - (anchor.y - now.y) };
      this.applyCamera();
    }
    this.angled = true;
    this.cameraMoved();
  }

  /* Fetch Three.js without turning the room on: what a canvas does the
   * moment it opens, so the room is ready when its turn comes. A map's room
   * is not ready until its kit is, so that is fetched too, and a kit that
   * cannot come is told by fetchFreestyle and does not stop the room opening
   * (it draws each asset as its plain solids). Resolves true when the library
   * is there and never rejects. */
  async preload() {
    if (!THREE) {
      try {
        await loadThree();
      } catch (e) {
        this.loadError = e.message ?? String(e);
        return false;
      }
    }
    if (this.isFreestyle()) {
      await this.fetchFreestyle();
    }
    return true;
  }

  /* Straight down with north up, for measuring, and back to the angle the room
   * had. Plan is a camera and not a second editor: every gesture is the same. */
  setPlanCamera(on) {
    const o = this.orbit;
    if (on) {
      if (!this.isPlan()) {
        this.roomAngle = { theta: o.theta, phi: o.phi };
      }
      o.theta = Math.PI / 2;
      o.phi = PLAN_PHI;
    } else if (this.isPlan()) {
      const back = this.roomAngle ?? scaleOf(this.host.doc).angle;
      o.theta = back.theta;
      o.phi = back.phi;
    }
    this.angled = true;
    this.cameraMoved();
  }

  isPlan() {
    return this.orbit.phi >= PLAN_PHI - 0.02;
  }

  /* Which way the camera looks along the floor, in DOCUMENT coordinates: what
   * the arrow keys are measured against. */
  floorForward() {
    return { x: -Math.cos(this.orbit.theta), y: Math.sin(this.orbit.theta) };
  }

  ndc(e) {
    const rect = this.canvas.getBoundingClientRect();
    return new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
  }

  /*
   * The nearest thing under the pointer, and which side of its frame the
   * hit landed on when it was a gate's pipe: { id, side, weak, distance },
   * or null. `side` is null for anything that is not one of the four sides
   * (a bar between two openings, a leg, a pole). `weak` marks the invisible
   * pane across an opening with no pipe, which the racing line beats.
   */
  /*
   * WHAT IS UNDER THE POINTER, and for a finger, what is under it or within a
   * fingertip of it. A mouse points at a pixel; a finger covers about a
   * centimetre, so a pipe 27 mm thick or the ring at a gate's foot would be
   * missed by a press that was on it. What is hit dead centre still wins, as it
   * does for the mouse; when that is only the pane across an opening the ring
   * within reach is taken over it, and when it is nothing at all, whatever is
   * nearest within reach. Only a press asks (a finger does not hover).
   */
  pickHit(e) {
    const centre = this.pickAt(e);
    if (e.pointerType !== 'touch' || (centre && !centre.weak)) {
      return centre;
    }
    const r = FINGER_SLOP_PX;
    let ring = null;
    let near = null;
    for (let k = 0; k < 8; k += 1) {
      const a = (k * Math.PI) / 4;
      const hit = this.pickAt({ clientX: e.clientX + Math.cos(a) * r, clientY: e.clientY + Math.sin(a) * r });
      if (!hit) {
        continue;
      }
      if (hit.ring && !ring) {
        ring = hit;
      } else if (!hit.weak && (!near || hit.distance < near.distance)) {
        near = hit;
      }
    }
    return ring ?? (centre ?? near);
  }

  pickAt(e) {
    if (!this.camera || !THREE) {
      return null;
    }
    const ray = new THREE.Raycaster();
    ray.setFromCamera(this.ndc(e), this.camera);
    const hits = ray.intersectObjects(this.pickables, false);
    if (!hits.length) {
      return null;
    }
    const o = hits[0].object;
    /* Where it was hit, in document coordinates: the root is the one place a
     * scene point becomes one. */
    const local = this.root.worldToLocal(hits[0].point.clone());
    return {
      id: o.userData.elementId,
      side: o.userData.side ?? null,
      /* Which opening of a stack an upright's stretch belongs to, from the bottom; null on anything else. */
      level: o.userData.level ?? null,
      weak: o.userData.weak === true,
      ring: o.userData.ring === true,
      /* A selected road's handles: the node a press is on, or the knob between two nodes, by index. */
      node: o.userData.node ?? null,
      leg: o.userData.leg ?? null,
      distance: hits[0].distance,
      point: { x: local.x, y: local.y, z: local.z },
    };
  }

  pick(e) {
    return this.pickHit(e)?.id ?? null;
  }

  /*
   * WHERE ON THE RACING LINE THE POINTER IS, measured on the screen.
   *
   * The line is a one pixel THREE.Line, and a raycast against one needs a
   * threshold in metres, which is a different number of pixels at every zoom
   * and at every depth down a course. So the samples are projected and the
   * nearest point on the drawn polyline is found in pixels, which is what an
   * author aiming at a line is actually doing. Only while the line is shown
   * (P), because a line that is not drawn is not there to be grabbed.
   *
   * Returns { segment, pos, tangent, distance } in document coordinates:
   * `segment` is the path segment the point is on, `distance` how far it is
   * from the camera so a gate in front of it can win.
   */
  pathHit(e) {
    const path = this.host.path;
    if (!this.host.pathVisible || !path || path.samples.length < 2 || !this.camera || this.builtFreestyle) {
      return null;
    }
    const rect = this.canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const v = new THREE.Vector3();
    const onScreen = (p) => {
      v.set(p.x, p.z, -p.y).project(this.camera);
      if (v.z < -1 || v.z > 1) {
        return null;
      }
      return { x: (v.x + 1) * 0.5 * rect.width, y: (1 - v.y) * 0.5 * rect.height };
    };
    let best = null;
    let a = onScreen(path.samples[0].pos);
    for (let i = 1; i < path.samples.length; i += 1) {
      const b = onScreen(path.samples[i].pos);
      if (a && b) {
        const ex = b.x - a.x;
        const ey = b.y - a.y;
        const len2 = ex * ex + ey * ey;
        const t = len2 > 1e-9 ? clamp(((px - a.x) * ex + (py - a.y) * ey) / len2, 0, 1) : 0;
        const d = Math.hypot(a.x + ex * t - px, a.y + ey * t - py);
        if (!best || d < best.d) {
          best = { d, i: i - 1, t };
        }
      }
      a = b;
    }
    if (!best || best.d > LINE_GRAB_PX) {
      return null;
    }
    const s0 = path.samples[best.i].pos;
    const s1 = path.samples[best.i + 1].pos;
    const pos = {
      x: s0.x + (s1.x - s0.x) * best.t,
      y: s0.y + (s1.y - s0.y) * best.t,
      z: s0.z + (s1.z - s0.z) * best.t,
    };
    const tangent = normalize({ x: s1.x - s0.x, y: s1.y - s0.y, z: s1.z - s0.z }, { x: 1, y: 0, z: 0 });
    const cam = this.camera.position;
    return {
      segment: path.samples[best.i].segment,
      pos,
      tangent,
      distance: Math.hypot(pos.x - cam.x, pos.z - cam.y, -pos.y - cam.z),
    };
  }

  /*
   * Where the pointer meets the level plane at document height z, in
   * document coordinates, or null when the ray runs away from it. The one
   * conversion is the root's, (x, y, z) to Three's (x, z, -y).
   */
  levelPoint(clientX, clientY, z) {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const o = ray.ray.origin;
    const d = ray.ray.direction;
    if (Math.abs(d.y) < 1e-6) {
      return null;
    }
    const t = (z - o.y) / d.y;
    if (!(t > 0)) {
      return null;
    }
    return { x: o.x + d.x * t, y: -(o.z + d.z * t), z };
  }

  /*
   * WHERE THE POINTER IS ON WHAT STANDS HERE: { x, y, z, on } for the ground under it, which is all a track has
   * to stand on. A map's answer is the highest surface the pointer is looking at (see the landing rule in
   * FREESTYLE-3D-BUILD-PLAN.md, 2.2). `type` is what is about to be put down, since paint has no height to take.
   */
  surfaceAt(e, { type = null, ignore = null } = {}) {
    const ground = this.levelPoint(e.clientX, e.clientY, 0);
    if (!ground) {
      return null;
    }
    const flat = { x: ground.x, y: ground.y, z: 0, look: 0, on: null };
    /* A track has the floor, and paint and notes have no height to take. */
    const kind = type ? ELEMENTS[type]?.kind : null;
    if (!this.isFreestyle() || !this.camera || kind === KIND.DECAL || kind === KIND.ANNOTATION) {
      return flat;
    }
    const ray = new THREE.Raycaster();
    ray.setFromCamera(this.ndc(e), this.camera);
    const o = ray.ray.origin;
    const d = ray.ray.direction;
    /* How far along the ray the ground is, and the first solid thing nearer than that. */
    let t = Math.abs(d.y) < 1e-6 ? Infinity : -o.y / d.y;
    if (!(t > 0)) {
      return flat;
    }
    const doc = this.host.doc;
    for (const h of ray.intersectObjects(this.pickables, false)) {
      if (h.distance >= t) {
        break;
      }
      const id = h.object.userData.elementId;
      const el = id && !h.object.userData.ring && !(ignore && ignore.has(id)) ? elementById(doc, id) : null;
      const k = el ? ELEMENTS[el.type]?.kind : null;
      /* A window, a car, a label, a ring and a balloon chase's mast are not
       * things to stand on. */
      if (el && el.type !== 'balloonChase' && ![KIND.ZONE, KIND.VEHICLE, KIND.ANNOTATION, KIND.DECAL, KIND.ROAD].includes(k)) {
        t = h.distance;
        break;
      }
    }
    /* The scene's Y is the document's Z, and its Z is the document's minus Y: the one conversion, read back. */
    const x = o.x + d.x * t;
    const y = -(o.z + d.z * t);
    const look = Math.max(0, o.y + d.y * t);
    const top = this.landings().under(x, y, look, ignore);
    return { x, y, z: top ? top.top : 0, look, on: top ? top.on : null };
  }

  /*
   * WHAT STANDS BY THE PLACED MAP: the box tops a raised piece can stand on, as place.js answers for a document
   * (`under(x, y, z, ignore)` and `seatFor(el, z)`). Made when first asked after an edit and dropped by the next
   * one (markDirty), so a pointer moving over the plot places the map once and not once for each pixel. A map the
   * kit cannot place is a map with nothing to stand on but the ground.
   */
  landings() {
    if (!this.supports) {
      try {
        this.supports = supportsFor(this.host.doc);
      } catch (e) {
        console.error('3D room: the map could not be placed to find what stands on what', e);
        this.supports = { under: () => null, seatFor: () => null };
      }
    }
    return this.supports;
  }

  /* The height of what a piece would stand on at (x, y), no higher than `look`, with `ignore` left out. */
  standAt(x, y, look, ignore = null) {
    const top = this.isFreestyle() ? this.landings().under(x, y, look, ignore) : null;
    return top ? top.top : 0;
  }

  /* Held within half a field of the field's edge, so a ray skimming the
   * plane cannot throw a waypoint a kilometre away. */
  keepNearField(p) {
    const f = this.host.doc.field;
    return {
      x: clamp(p.x, -f.width * 0.5, f.width * 1.5),
      y: clamp(p.y, -f.depth * 0.5, f.depth * 1.5),
      z: Math.max(0, p.z),
    };
  }

  /*
   * The knob that says "this is the line, and you can grab it": a dot where
   * the pointer is nearest it, a constant size on the screen. It lives on
   * the root rather than in the rebuilt content, so moving it is a redraw
   * and not a rebuild.
   */
  showLineKnob(pos) {
    if (!this.root) {
      return;
    }
    if (!this.lineKnob) {
      this.lineKnob = new THREE.Mesh(
        new THREE.SphereGeometry(1, 14, 10),
        new THREE.MeshBasicMaterial({ color: COL.path, depthTest: false, transparent: true, opacity: 0.95 }),
      );
      this.lineKnob.renderOrder = 10;
      this.root.add(this.lineKnob);
    }
    const shown = Boolean(pos);
    if (shown) {
      this.lineKnob.position.set(pos.x, pos.y, pos.z);
      this.lineKnob.scale.setScalar(this.orbit.radius * 0.006);
    }
    if (shown !== this.lineKnob.visible || shown) {
      this.lineKnob.visible = shown;
      this.host.requestDraw();
    }
    this.canvas.style.cursor = shown ? 'grab' : '';
  }

  /*
   * EVERY CANVAS IS BUILT IN THE ROOM, so every press, move and lift is edit3d.js's. What is left of the 3D view's
   * own handlers is the racing line's bend, which the room's editor hands over once a press is on the line (it
   * sets `drag`), and it is only that gesture that onMove, onUp and onCancel carry on.
   */
  onDown(e) {
    if (!this.enabled || !this.renderer) {
      return;
    }
    this.editor.onDown(e);
  }

  /* A press on a waypoint: a drag on one moves it across its own level, and Alt
   * moves it up and down. One undo step, and the gates either side are pinned
   * on the first move (moveWaypoint). */
  beginWaypointGrab(e, id, at) {
    const el = elementById(this.host.doc, id);
    if (!el) {
      return;
    }
    const g = this.levelPoint(e.clientX, e.clientY, el.position.z);
    this.host.beginWaypointDrag();
    this.drag = {
      kind: 'bend',
      id,
      last: at,
      z: el.position.z,
      offset: g ? { x: el.position.x - g.x, y: el.position.y - g.y } : { x: 0, y: 0 },
      moved: false,
      reanchor: false,
    };
  }

  onMove(e) {
    if (!this.drag && this.roomEditing()) {
      this.editor.onMove(e);
      return;
    }
    if (!this.drag) {
      /* Hovering: say so when the pointer is on the line. */
      if (this.enabled && this.renderer) {
        const line = this.pathHit(e);
        this.showLineKnob(line ? line.pos : null);
      }
      return;
    }
    const dx = e.clientX - this.drag.last.x;
    const dy = e.clientY - this.drag.last.y;
    this.drag.last = { x: e.clientX, y: e.clientY };

    if (this.drag.kind === 'bend-pending') {
      /* A press on the line becomes a bend once it moves, so a click on the
       * line that goes nowhere drops nothing on it. */
      const start = this.drag.start;
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < BEND_START_PX) {
        return;
      }
      const line = this.drag.line;
      const id = this.host.beginBend(line);
      if (!id) {
        this.drag = { kind: 'orbit', last: this.drag.last };
        return;
      }
      /* Held where it was grabbed: the offset is between the level point
       * under the press and the point on the line, so the waypoint does not
       * jump the pixel or two the line was missed by. */
      const g = this.levelPoint(start.x, start.y, line.pos.z);
      this.drag = {
        kind: 'bend',
        id,
        last: this.drag.last,
        z: line.pos.z,
        offset: g ? { x: line.pos.x - g.x, y: line.pos.y - g.y } : { x: 0, y: 0 },
        moved: true,
        reanchor: false,
      };
      this.showLineKnob(null);
      this.canvas.style.cursor = 'grabbing';
    }
    if (this.drag.kind === 'bend') {
      const el = elementById(this.host.doc, this.drag.id);
      if (!el) {
        return;
      }
      let pos;
      if (e.altKey) {
        /* Up and down, screen up is up, scaled with the zoom exactly as the
         * height drag is. The level is re-found when Alt comes off. */
        this.drag.z = Math.max(0, this.drag.z - dy * this.orbit.radius * 0.0022);
        this.drag.reanchor = true;
        pos = { x: el.position.x, y: el.position.y, z: this.drag.z };
      } else {
        const g = this.levelPoint(e.clientX, e.clientY, this.drag.z);
        if (!g) {
          return;
        }
        if (this.drag.reanchor) {
          this.drag.offset = { x: el.position.x - g.x, y: el.position.y - g.y };
          this.drag.reanchor = false;
        }
        pos = { x: g.x + this.drag.offset.x, y: g.y + this.drag.offset.y, z: this.drag.z };
      }
      this.host.moveWaypoint(this.drag.id, this.keepNearField(pos), !this.drag.moved);
      this.drag.moved = true;
      return;
    }

    /* A press on the line that could not drop a waypoint there looks round instead. */
    if (this.drag.kind === 'orbit') {
      this.orbitBy(dx, dy);
    }
  }

  onCancel(e) {
    if (!this.drag && this.roomEditing()) {
      this.editor.onCancel(e);
      return;
    }
    /* A bend the browser took away is put back, waypoint and all. */
    if (this.drag && this.drag.kind === 'bend') {
      this.host.revertEdit();
    }
    this.canvas.style.cursor = '';
    this.drag = null;
    if (e && this.canvas.hasPointerCapture?.(e.pointerId)) {
      this.canvas.releasePointerCapture(e.pointerId);
    }
  }

  onUp(e) {
    if (!this.drag) {
      if (this.roomEditing()) {
        this.editor.onUp(e);
      }
      return;
    }
    if (this.drag.kind === 'bend') {
      if (this.drag.moved) {
        this.host.endEdit();
      } else {
        this.host.cancelEdit();
      }
    }
    this.canvas.style.cursor = '';
    this.drag = null;
    if (e && this.canvas.hasPointerCapture?.(e.pointerId)) {
      this.canvas.releasePointerCapture(e.pointerId);
    }
  }

  /* ---------------- building ---------------- */

  markDirty() {
    this.dirty = true;
    /* What a piece can stand on is read off the placed map, which an edit has changed. */
    this.supports = null;
  }

  disposeContent() {
    if (!this.content) {
      return;
    }
    /* A map's asset drawings outlive the rebuild: they are taken out before
     * the walk below frees everything it finds, and sweepAssets frees them
     * when they are no longer wanted. */
    for (const art of this.assets.values()) {
      art.group?.removeFromParent();
    }
    this.content.traverse((o) => {
      if (o.geometry) {
        o.geometry.dispose();
      }
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          /* Skip the banner kit. Its materials are CACHED across rebuilds
           * and freed by bannerKit itself when the logo changes: disposing
           * them here undid the cache on every rebuild, so every edit
           * repainted four canvases and uploaded four textures, and the
           * meshes of the rebuild after that were handed materials whose
           * GPU resources had already been released. */
          if (m.userData && m.userData.sharedKit) {
            continue;
          }
          if (m.map) {
            m.map.dispose();
          }
          m.dispose();
        }
      }
    });
    /* From whichever root holds it: a map's content hangs in the freestyle
     * scene. */
    this.content.removeFromParent();
    this.content = null;
  }

  build() {
    this.disposeContent();
    this.gapLabels = [];
    this.builtFreestyle = this.isFreestyle();
    if (this.builtFreestyle) {
      this.buildFreestyle();
      return;
    }
    /* A race document holds no assets, so any a map left behind go now,
     * and no traffic. */
    this.sweepAssets(null);
    this.stopPlay();
    this.disposeTraffic();
    this.updatePlayUi();
    const doc = this.host.doc;
    const g = new THREE.Group();
    this.pickables = [];
    /* What the room's gestures need to find again: each piece's drawing, the
     * panes that light up under the pointer, and the numbers to hang over the
     * canvas. */
    this.groups = new Map();
    this.panes = new Map();
    this.bubbleSpecs = [];
    /* A track, of either class, is built in the room; RaceGOW's envelope is the whoop's own. */
    const room = this.host.buildsIn3D();
    this.startGateId = room ? this.startGateOf(doc) : null;
    /* The one pass in focus (passes.js), which is what the arrows, the
     * squares round a pole, the racing line and the tags are quiet about. */
    this.focusSeq = room ? (this.host.focusedPass?.() ?? null) : null;
    this.drawnSquares = new Set();

    g.add(this.fieldGround(doc));
    g.add(this.gridLines(doc));
    if (this.host.isWhoopRace()) {
      g.add(this.buildEnvelope(doc));
    }

    const numbers = sequenceNumbers(doc);
    /* Which of the course's marks each dressed structure wears, by the same
     * rule the race field deals them out with. Computed once per rebuild
     * rather than per element, because it is a walk of the whole sequence. */
    this.dressSlots = dressOrder(doc);
    for (const el of doc.elements) {
      const node = this.buildElement(el, numbers.get(el.id) ?? []);
      if (node) {
        g.add(node);
        this.groups.set(el.id, node);
      }
    }
    if (room) {
      this.buildTagSpecs(doc);
    }
    /* The ring at the foot of the one piece that is selected, or of a whole group that is: a cube has it at
     * its middle, where its flat face is, and turning it turns every face. */
    const picked = [...this.host.selection];
    const ringFor = picked.length === 1
      ? elementById(doc, picked[0])
      : (picked.length > 1 ? this.wholeGroupAnchor(doc, picked) : null);
    if (room && ringFor && kindOf(ringFor) === KIND.APERTURE) {
      this.buildRing(this.groups.get(ringFor.id), ringFor);
    }

    if (this.host.path && this.host.path.samples.length > 1) {
      /* Ground marks always, not only when the Hermite is toggled. The
       * taut string is what the race field paints, and the preview has
       * to show the same line or an author is editing a different course
       * from the one they fly. */
      g.add(this.buildGuideMarks(this.host.path));
    }
    this.pathLine = null;
    if (this.host.pathVisible && this.host.path && this.host.path.samples.length > 1) {
      this.pathLine = this.buildPath(this.host.path);
      g.add(this.pathLine);
    }

    this.content = g;
    this.root.add(g);
    this.faceSig = this.signature();
    this.applyHover();
    if (room) {
      this.syncBubbles();
    }
  }

  /* The race preview's ground, in document coordinates: the plane spans x
   * and y. */
  fieldGround(doc) {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(doc.field.width, doc.field.depth),
      new THREE.MeshLambertMaterial({ color: this.host.isWhoopRace() ? COL.groundDim : COL.ground }),
    );
    ground.position.set(doc.field.width / 2, doc.field.depth / 2, -0.01);
    return ground;
  }

  gridLines(doc) {
    const pts = [];
    const major = [];
    const s = gridStep(doc.field);
    /* A field's major lines are every five metres, as a plan is ruled, and are the brighter ones: a metre grid is
     * a wash from the height that shows a whole track, and the fives are what a pilot counts off. */
    const every = scaleOf(doc).metric && s === doc.field.gridSize ? 5 : 0;
    const isMajor = (i) => every > 0 && i % every === 0;
    for (let i = 0, x = 0; x <= doc.field.width + 1e-6; i += 1, x = i * s) {
      (isMajor(i) ? major : pts).push(x, 0, 0, x, doc.field.depth, 0);
    }
    for (let i = 0, y = 0; y <= doc.field.depth + 1e-6; i += 1, y = i * s) {
      (isMajor(i) ? major : pts).push(0, y, 0, doc.field.width, y, 0);
    }
    /* The field boundary, brighter than the grid, so the edge of the legal
     * ground is visible in the preview as well as on the plan. */
    const w = doc.field.width;
    const d = doc.field.depth;
    const edge = [0, 0, 0.01, w, 0, 0.01, w, 0, 0.01, w, d, 0.01,
      w, d, 0.01, 0, d, 0.01, 0, d, 0.01, 0, 0, 0.01];
    const lines = (list, color) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(list, 3));
      return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color }));
    };
    /* With no fives to pick out, which is a hall, the grid and its edge are one set of lines, as they have always
     * been. */
    if (!major.length) {
      return lines([...pts, ...edge], COL.grid);
    }
    const group = new THREE.Group();
    group.add(lines(pts, COL.grid));
    group.add(lines(major, COL.gridMajor));
    group.add(lines(edge, COL.frame));
    return group;
  }

  /*
   * The printed dress this structure wears: its slot in the round robin,
   * looked up in the map build() read off the document.
   *
   * An element that is not in the flying order gets the first mark. It does
   * not stand on the race field at all, so there is no world behaviour to
   * agree with, and showing it undressed would read as a bug rather than as
   * "this gate is not in the course yet", which the plan already says.
   */
  dressFor(el) {
    return this.bannerKit().forGate(this.dressSlots?.get(el.id) ?? 0);
  }

  /*
   * The sail a turn flag wears. The world hands its markers out in document
   * order, one sail after the next round the run, so the preview counts the
   * same way rather than putting the first sail on every flag: with five
   * sponsors a line of flags carries all five, and an author has to be able
   * to see that before they publish.
   */
  sailForMarker(el) {
    const kit = this.bannerKit();
    let i = 0;
    for (const other of this.host.doc.elements) {
      if (other.id === el.id) {
        break;
      }
      if (other.type === 'flag') {
        i += 1;
      }
    }
    return kit.sails[i % kit.sails.length];
  }

  /*
   * A sponsor's mark painted on the grass.
   *
   * The footprint is drawn as a faint panel with a cream outline, the way
   * the plan draws it, so an author can find it and grab it even before the
   * artwork has decoded and even where the mark itself is transparent. The
   * mark is a separate plane FITTED inside that footprint, by the same rule
   * the world fits it by, so a mark that paints small here paints small on
   * the field and the cue to resize the footprint is the same cue.
   */
  buildGroundLogo(group, el, selected) {
    const w = Math.max(0.2, el.dims.width);
    const d = Math.max(0.2, el.dims.depth);
    const fill = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshBasicMaterial({
        color: selected ? COL.frameSel : 0xf7e8cd,
        transparent: true,
        opacity: selected ? 0.16 : 0.07,
        depthWrite: false,
      }),
    );
    fill.rotation.z = el.yaw;
    fill.position.z = 0.004;
    this.register(fill, el);
    group.add(fill);

    const edge = new THREE.LineLoop(
      new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([
        -w / 2, -d / 2, 0, w / 2, -d / 2, 0, w / 2, d / 2, 0, -w / 2, d / 2, 0,
      ], 3)),
      new THREE.LineBasicMaterial({ color: selected ? COL.frameSel : 0xf7e8cd }),
    );
    edge.rotation.z = el.yaw;
    edge.position.z = 0.006;
    group.add(edge);

    const mark = logoForDecal(this.host.doc, el);
    const slot = mark ? logosOf(this.host.doc).indexOf(mark) : -1;
    const mat = slot >= 0 ? this.bannerKit().groundMats[slot] : null;
    const img = slot >= 0 ? this.bannerKit().groundImages[slot] : null;
    if (!mat || !img) {
      return;
    }
    /* A sticker wears its piece of the sheet (cropOf), not the sheet. */
    const crop = cropOf(el);
    const iw = img.naturalWidth * (crop ? crop.w : 1);
    const ih = img.naturalHeight * (crop ? crop.h : 1);
    const k = Math.min(w / iw, d / ih);
    const geo = new THREE.PlaneGeometry(iw * k, ih * k);
    if (crop) {
      const u0 = crop.x;
      const u1 = crop.x + crop.w;
      const v1 = 1 - crop.y;
      const v0 = 1 - crop.y - crop.h;
      geo.setAttribute('uv', new THREE.Float32BufferAttribute([u0, v1, u1, v1, u0, v0, u1, v0], 2));
    }
    const face = new THREE.Mesh(geo, mat);
    face.rotation.z = el.yaw;
    face.position.z = 0.008;
    group.add(face);
  }

  buildElement(el, numbers) {
    const def = ELEMENTS[el.type];
    const selected = this.host.selection.has(el.id);
    const group = new THREE.Group();
    group.position.set(el.position.x, el.position.y, el.position.z);

    if (def.kind === KIND.APERTURE) {
      this.buildAperture(group, el, numbers, selected);
    } else if (def.kind === KIND.OBSTACLE && isRoomType(el.type)) {
      this.buildRoomPiece(group, el, selected);
    } else if (def.kind === KIND.OBSTACLE) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(el.dims.width, el.dims.depth, el.dims.height),
        new THREE.MeshLambertMaterial({ color: selected ? COL.frameSel : COL.barrier }),
      );
      mesh.position.z = el.dims.height / 2;
      mesh.rotation.z = el.yaw;
      this.register(mesh, el);
      group.add(mesh);
      /* A hurdle: a barrier with flags at its ends. Nothing for one that has none. */
      this.buildHeaderFlags(group, el, selected);
    } else if (def.kind === KIND.MARKER) {
      this.buildMarker(group, el, selected, numbers);
    } else if (def.kind === KIND.START) {
      this.buildStart(group, el, selected);
    } else if (def.kind === KIND.DECAL) {
      this.buildGroundLogo(group, el, selected);
    } else {
      const sprite = textSprite(el.text || 'Label', el.dims.textHeight, selected ? '#ffd45c' : '#9db3c8');
      sprite.position.z = el.dims.textHeight;
      this.register(sprite, el);
      group.add(sprite);
    }

    /* The sequence number sits on the opening it belongs to. It used to
     * float above the opening, which on a stack put the bottom pass's
     * number in the top hole: centre plus half a 5 ft opening is the
     * middle of the level above. A stack flown low then high has to show
     * 2 in the bottom and 7 in the top, not both in the top. */
    /*
     * The flying-order numbers are drawn at a WORLD size, so on a RaceGOW
     * room they were 1.1 m tall over a 0.71 m gate: the whole course
     * disappeared behind its own labels. One scale, applied to the height
     * and to every standoff, because a number that shrinks but keeps a 0.7 m
     * gap is a number floating in the air away from what it names.
     */
    const k = trackClassOf(this.host.doc) === 'micro' ? MICRO_LABEL_K : 1;
    /* Same switch as the plan. Off, the opening is bare and the line
     * through it can be read. The sequence list still has the numbers. */
    const showLabels = this.host.labelsVisible !== false;
    const room = this.host.buildsIn3D();
    for (const n of showLabels ? numbers : []) {
      /* A waypoint has no number: see gateNumbers in sequence.js. */
      if (n.number == null) {
        continue;
      }
      /* On a whoop canvas the numbers are HTML over the canvas, one tag for each
       * opening that is flown and not one for each pass: see buildTagSpecs. A
       * ghost, which has no numbers, and a map keep the sprite. */
      if (room && el.id !== '__ghost') {
        continue;
      }
      let label = String(n.number);
      let worldH = 1.1 * k;
      const spritePos = { x: 0, y: 0, z: 1.6 * k };
      if (def.kind === KIND.APERTURE) {
        const levels = aperturesOf(el);
        const ap = levels[Math.min(n.apertureIndex ?? 0, levels.length - 1)];
        if (levels.length > 1) {
          const f = apertureFrame(el.yaw, el.pitch);
          const same = numbers.filter((x) => (x.apertureIndex ?? 0) === (n.apertureIndex ?? 0));
          const slot = Math.max(0, same.findIndex((x) => x.seq === n.seq));
          const along = (0.55 + slot * 0.4) * k;
          spritePos.x = f.normal.x * along + f.widthAxis.x * (ap.centerX ?? 0);
          spritePos.y = f.normal.y * along + f.widthAxis.y * (ap.centerX ?? 0);
          spritePos.z = ap.centerH + f.normal.z * along;
          label = `${n.number}  ${levelName(el, n.apertureIndex)}`;
          worldH = 0.85 * k;
        } else {
          const wa = apertureFrame(el.yaw, el.pitch).widthAxis;
          spritePos.x = wa.x * (ap.centerX ?? 0);
          spritePos.y = wa.y * (ap.centerX ?? 0);
          spritePos.z = ap.centerH + ap.clearH / 2 + 0.7 * k;
        }
      } else {
        spritePos.z = (def.kind === KIND.MARKER ? el.dims.height : 1.0 * k) + 0.7 * k;
      }
      const sprite = textSprite(label, worldH, '#101a26', selected ? '#ffd45c' : '#f7e8cd');
      sprite.position.set(spritePos.x, spritePos.y, spritePos.z);
      group.add(sprite);
    }
    return group;
  }

  /*
   * A TABLE, A CHAIR OR A BANNER: one box for each of the boxes it is made of
   * (src/props/room.js), in its own frame, under a node turned to the quarter
   * turn it is built at. They are the boxes the game makes solid, so the room
   * shows a leg where a leg is and nothing where a whoop can fly. Any of them
   * picks the piece.
   */
  buildRoomPiece(group, el, selected) {
    const node = new THREE.Group();
    node.rotation.z = placedYaw('quarter', el.yaw);
    for (const b of roomBoxes(el.type, el.dims)) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(b.hi[0] - b.lo[0], b.hi[1] - b.lo[1], b.hi[2] - b.lo[2]),
        new THREE.MeshLambertMaterial({ color: selected ? COL.frameSel : ROOM_COLOURS[b.m] }),
      );
      mesh.position.set((b.lo[0] + b.hi[0]) / 2, (b.lo[1] + b.hi[1]) / 2, (b.lo[2] + b.hi[2]) / 2);
      this.register(mesh, el);
      node.add(mesh);
    }
    group.add(node);
  }

  buildAperture(group, el, numbers, selected) {
    /* A letter is a run of tubes in the shape of a capital and not four sides round a hole. */
    if (isLetterPiece(el)) {
      this.buildLetter(group, el, numbers, selected);
      return;
    }
    const mat = new THREE.MeshLambertMaterial({ color: selected ? COL.frameSel : COL.frame });
    const levels = aperturesOf(el);
    /*
     * The pipe. 1 inch schedule 40 on a MultiGP field, 3/4 inch on a
     * RaceGOW one, which is what RaceGOW's rules name twice and what every
     * one of their build videos is filmed around.
     */
    const micro = trackClassOf(this.host.doc) === 'micro';
    const tube = micro ? RACEGOW_PIPE_OD : FRAME_TUBE_OD;
    /* A gap in the lattice: the opening is real and the frame is not.
     * See isUnbuilt in elements.js. */
    const unbuilt = isUnbuilt(el);
    const f = apertureFrame(el.yaw, el.pitch);
    const basis = new THREE.Matrix4().makeBasis(
      new THREE.Vector3(f.widthAxis.x, f.widthAxis.y, f.widthAxis.z),
      new THREE.Vector3(f.heightAxis.x, f.heightAxis.y, f.heightAxis.z),
      new THREE.Vector3(f.normal.x, f.normal.y, f.normal.z),
    );
    const quat = new THREE.Quaternion().setFromRotationMatrix(basis);
    /*
     * The four sides, and the one the author has picked to take away. See
     * FRAME_SIDES in elements.js: the uprights are the whole height of a
     * stack, the top is over the top opening and the bottom under the
     * lowest, and a bar between two openings is none of them.
     */
    const sides = frameSidesOf(el);
    /* A stack's uprights are one stretch per opening, and a stretch goes on its own: see unbuiltPolesOf in elements.js. */
    const gonePoles = new Set(unbuiltPolesOf(el));
    const picked = this.host.pickedSide && this.host.pickedSide.id === el.id
      ? this.host.pickedSide.side : null;
    /* The opening the picked upright's stretch belongs to; null picks the side wherever it is (a bar, or a single gate). */
    const pickedLevel = this.host.pickedSide && this.host.pickedSide.id === el.id
      ? (this.host.pickedSide.index ?? null) : null;
    const pickedMat = picked ? new THREE.MeshLambertMaterial({ color: COL.sidePicked }) : null;
    const last = levels.length - 1;
    /* A hoop or a hex gate: one opening, in a run of tubes that is not four sides. */
    const shape = apertureShapeOf(el);
    const shaped = shape !== 'square';

    for (const ap of levels) {
      const frame = new THREE.Group();
      frame.position.set(0, 0, ap.centerH);
      frame.quaternion.copy(quat);
      /* Four tubes around the opening, laid out in the aperture's own plane:
       * local x across the width, local y across the height. Each carries
       * the side it is, so a click on it can say which one it hit. A hoop or a hex gate has
       * a tube for each side of its shape instead, and none of them is one of the four sides:
       * a click on it picks the piece. */
      const bars = shaped ? this.shapedBars(ap, shape, tube, f) : [
        [ap.clearW + tube * 2, tube, 0, (ap.clearH + tube) / 2, ap.index === last ? 'top' : null],
        [ap.clearW + tube * 2, tube, 0, -(ap.clearH + tube) / 2, ap.index === 0 ? 'bottom' : null],
        [tube, ap.clearH, -(ap.clearW + tube) / 2, 0, 'left'],
        [tube, ap.clearH, (ap.clearW + tube) / 2, 0, 'right'],
      ];
      let drawn = 0;
      for (const [w, h, x, y, side, angle] of (unbuilt ? [] : bars)) {
        if (side && !sides[side]) {
          continue;
        }
        if ((side === 'left' || side === 'right') && gonePoles.has(`${side}:${ap.index}`)) {
          continue;
        }
        const lit = side && side === picked && (pickedLevel === null || pickedLevel === ap.index);
        const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, tube), lit ? pickedMat : mat);
        bar.position.set(x, y, 0);
        bar.rotation.z = angle ?? 0;
        bar.userData.side = side;
        bar.userData.level = ap.index;
        this.register(bar, el);
        frame.add(bar);
        drawn += 1;
        /*
         * A FATTER PIPE, NEVER DRAWN, on a track. 26.7 mm of PVC is two or
         * three pixels from any distance that shows a whole track, and from the
         * plan camera a standing gate is nothing but that top pipe: without a
         * stand-in a gate can hardly be hit there at all. It answers for the same
         * side, and is not weak, so it beats the racing line.
         */
        if (this.host.buildsIn3D()) {
          const fat = scaleOf(this.host.doc).pickPipe;
          const grab = new THREE.Mesh(new THREE.BoxGeometry(w + fat, h + fat, tube + fat), this.grabMaterial());
          grab.position.set(x, y, 0);
          grab.rotation.z = angle ?? 0;
          grab.visible = false;
          grab.userData.side = side;
          grab.userData.level = ap.index;
          this.register(grab, el);
          frame.add(grab);
        }
      }
      /*
       * A gap in the lattice has no pipe to click on, and an author still
       * has to be able to pick it up. So it gets an invisible pane across
       * the opening, registered for the raycast and drawn by nothing: the
       * line loop below is what the eye sees. An opening whose sides have
       * all been taken away one at a time is the same thing and gets the
       * same pane. It is WEAK: the racing line runs through the middle of
       * it, and a grab on the line there is a grab on the line.
       *
       * ON A TRACK EVERY OPENING GETS ONE, not only the gaps. The pipe of a
       * RaceGOW gate is 26.7 mm and of a MultiGP one 33, which from any distance
       * that shows a whole track is three or four pixels to hit, so a gate could
       * hardly be picked in the room; with a pane, the middle of a gate picks it.
       * It is weak, so a flag or a pole seen through a gate takes the click, as the
       * line does.
       */
      if (!drawn || this.host.buildsIn3D()) {
        /*
         * And that pane is SEEN: a translucent one, in RaceGOW's own colour
         * for the kind of gate it is in a hall, and in a pale one on a field,
         * where the gates are not coloured by what they are. A gate reads from
         * across the course and its middle is something to hit. Lit a little
         * more under the pointer and more again when selected. A field's is
         * fainter, because its gates are bigger and the pane is more of the
         * picture.
         */
        const seen = this.host.buildsIn3D();
        const field = !this.host.isWhoopRace();
        const base = selected ? (field ? 0.2 : 0.42) : (field ? 0.09 : 0.28);
        const pane = new THREE.MeshBasicMaterial(seen
          ? {
            color: this.paneColour(el), transparent: true, opacity: base, side: THREE.DoubleSide, depthWrite: false,
          }
          : { transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
        const pick = new THREE.Mesh(shaped ? this.paneGeometry(shape, ap.clearW, ap.clearH) : new THREE.PlaneGeometry(ap.clearW, ap.clearH), pane);
        pick.userData.weak = true;
        this.register(pick, el);
        frame.add(pick);
        if (seen && el.id !== '__ghost') {
          const list = this.panes.get(el.id) ?? [];
          list.push({ mat: pane, base });
          this.panes.set(el.id, list);
        }
      }
      /*
       * A line loop around the TRUE clear opening, on top of the tubes.
       *
       * The tubes are 1 inch PVC because that is what MultiGP gates are made
       * of, and 33 mm of pipe is well under a pixel from any camera distance
       * that shows a whole 60 m course, so a preview drawn from the tubes
       * alone is a field of floating translucent panes with no gates in it.
       * A line is one pixel wide however far away it is, and this one traces
       * the opening a pilot actually flies rather than a thickened stand-in,
       * so the preview stays readable without any dimension being fattened
       * to make it so.
       */
      const c = shaped
        ? outlineOf(shape, ap.clearW / 2, ap.clearH / 2).flatMap(([x, y]) => [x, y, 0])
        : [
          -ap.clearW / 2, -ap.clearH / 2, 0, ap.clearW / 2, -ap.clearH / 2, 0,
          ap.clearW / 2, ap.clearH / 2, 0, -ap.clearW / 2, ap.clearH / 2, 0,
        ];
      const loopGeo = new THREE.BufferGeometry();
      loopGeo.setAttribute('position', new THREE.Float32BufferAttribute(c, 3));
      frame.add(new THREE.LineLoop(loopGeo, new THREE.LineBasicMaterial({
        color: selected ? COL.frameSel : COL.frame,
      })));
      group.add(frame);
    }

    /*
     * The printed dress: a sleeve down each upright and a header banner over
     * the top rail, the same artwork the world uses. Only on a VERTICAL
     * aperture: a gate laid flat is carried on a mast and has no uprights to
     * sleeve and no top rail to hang a header from, which is what
     * src/render/scene.js builds too.
     */
    /*
     * NO PRINTED DRESS ON A RACEGOW GATE, and it is not a scale problem, it
     * is a fact about the object.
     *
     * A MultiGP gate is a printed sleeve down each upright and a header
     * banner over the top rail, and that is what a sponsor's mark goes on.
     * A RaceGOW gate is four lengths of bare white PVC and four fittings;
     * there is nothing to print on. Sponsors in that world are banners on
     * the wall of the room, which is not part of the track.
     *
     * The scale is the other half of it: the sleeve is 0.42 m wide, which on
     * a 0.711 m opening would cover three fifths of the hole.
     */
    if (Math.abs(el.pitch) < Math.PI / 6 && !micro && !unbuilt) {
      const kit = this.dressFor(el);
      const top = levels[levels.length - 1];
      const bottom = levels[0];
      const across = new THREE.Vector3(f.widthAxis.x, f.widthAxis.y, f.widthAxis.z);
      /* The plain dress has no sleeves and a header exactly as wide as the frame (isPlain in
       * elements.js), which is what makes a wall of them read as one row of bays. */
      const plain = isPlain(el);
      const sleeveW = plain ? 0 : 0.42;
      const sleeveBottom = bottom.sillH;
      const sleeveH = top.sillH + top.clearH + tube * 2 - sleeveBottom;
      /*
       * TWO PLANES PER BANNER, NOT ONE DOUBLE SIDED PLANE, and that is the
       * fix for the logo reading backwards from behind. A single double
       * sided plane shows the same texels from either face, so from the
       * reverse the print is mirrored and the mark reads in a mirror. A real
       * banner is printed on both sides, the reverse mirrored so it reads
       * the right way round, and two planes back to back is that.
       */
      const facing = new THREE.Vector3(f.normal.x, f.normal.y, f.normal.z);
      const bannerFace = (w, h, mat, at) => {
        for (const sn of [-1, 1]) {
          const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
          face.quaternion.copy(quat);
          if (sn < 0) {
            face.rotateY(Math.PI);
          }
          face.position.copy(at).addScaledVector(facing, sn * 0.012);
          group.add(face);
        }
      };
      const at = new THREE.Vector3();
      /* A sleeve is one board down an upright, so it hangs only on a stack whose openings are all one width. */
      const evenWidth = levels.every((ap) => Math.abs(ap.clearW - top.clearW) < 1e-9);
      for (const sx of plain || !evenWidth ? [] : [-1, 1]) {
        /* A sleeve is sleeved over its upright and goes with it. */
        if (!uprightIntact(el, sx < 0 ? 'left' : 'right')) {
          continue;
        }
        const off = sx * (top.clearW / 2 + tube + sleeveW / 2);
        /* Mirrored on the far leg so the chequer column runs down the
         * outside of the gate on both sides, the same way the world does it,
         * and on the PRINT rather than on the mesh. */
        const mat = sx < 0 ? kit.sleeveFlipped : kit.sleeve;
        at.set(across.x * off, across.y * off, sleeveBottom + sleeveH / 2);
        bannerFace(sleeveW, sleeveH, mat, at);
      }
      const headerW = 2 * (top.clearW / 2 + tube + sleeveW);
      at.set(0, 0, top.sillH + top.clearH + tube * 2 + BANNER_H / 2 + 0.03);
      /* The header hangs on the top rail, and goes with it. */
      if (sides.top) {
        bannerFace(headerW, BANNER_H, kit.header, at);
      }
    }

    /*
     * Entry face green, exit face red. One translucent pane a hand's breadth
     * either side of the opening, so which way the gate is flown is legible
     * from any angle without reading a number.
     *
     * ON A TRACK a piece flown more than once is drawn once for each way
     * it is flown, not once for each pass (buildLanes), and the panes belong to
     * the one pass in focus. A map's furniture draws the panes of every pass,
     * exactly as it always did.
     */
    if (this.host.buildsIn3D()) {
      this.buildLanes(group, el, levels, numbers, f, quat, selected);
    } else {
      for (const n of numbers) {
        const ap = levels[Math.min(n.apertureIndex ?? 0, levels.length - 1)];
        const seq = n.seq;
        if (!seq || seq.entry === 0) {
          continue;
        }
        this.panePair(group, ap, seq, f, quat);
      }
    }

    /* The legs, so a tower stands on something. Two vertical posts at
     * the sides for every pitch, from the grass to the lower outer
     * corners of the frame. A centre mast through the hole was what a
     * custom tilt used to grow. */
    const bottom = levels[0];
    const feet = shaped
      ? this.shapedFeet(bottom, shape, tube, f)
      : gateSupportFeet(
        el.yaw, el.pitch, bottom.clearW, bottom.clearH, bottom.centerH, tube,
      );
    const legMat = new THREE.MeshLambertMaterial({ color: selected ? COL.frameSel : COL.frame });
    for (const [i, foot] of feet.entries()) {
      const h = foot.z;
      /* gateSupportFeet gives the -widthAxis leg first. A leg is the foot of
       * its upright, so it goes when the upright does, as it does in the
       * world. */
      if (h < 0.02 || unbuilt || (!shaped && !poleBuilt(el, i === 0 ? 'left' : 'right', 0))) {
        continue;
      }
      const leg = new THREE.Mesh(new THREE.BoxGeometry(tube * 1.4, tube * 1.4, h), legMat);
      leg.position.set(foot.x, foot.y, h / 2);
      this.register(leg, el);
      group.add(leg);
    }

    this.buildHeaderFlags(group, el, selected);
  }

  /*
   * A LETTER: its pipe, and its holes.
   *
   * The layout is src/props/letters.js's, in the document's frame (letterLayoutOf in model.js): every tube is a bar
   * in the plane of the letter, turned to the side it runs, and every joint a ball at the corner, which is what the
   * world builds from the same numbers at the world's scale. A letter is drawn in ONE frame, the plane of the piece,
   * because its holes are not one above another: each hole is a pane and a line round it, at its own place in that
   * plane. An invisible letter (unbuilt) has no pipe, and is its holes alone: still found by its panes, still
   * numbered, still lit when it is the target.
   *
   * Like a gate's pipe, a letter's is drawn with a fatter stand-in that is never seen, so a pipe 60 mm across can be
   * picked from the plan camera, and with a line down each tube's middle, so the letter reads from across a field
   * where the pipe itself is less than a pixel.
   */
  buildLetter(group, el, numbers, selected) {
    const laid = letterLayoutOf(el);
    const levels = aperturesOf(el);
    const unbuilt = isUnbuilt(el);
    const f = apertureFrame(el.yaw, el.pitch);
    const basis = new THREE.Matrix4().makeBasis(
      new THREE.Vector3(f.widthAxis.x, f.widthAxis.y, f.widthAxis.z),
      new THREE.Vector3(f.heightAxis.x, f.heightAxis.y, f.heightAxis.z),
      new THREE.Vector3(f.normal.x, f.normal.y, f.normal.z),
    );
    const quat = new THREE.Quaternion().setFromRotationMatrix(basis);
    const tube = LETTER_TUBE_OD;
    const colour = selected ? COL.frameSel : COL.frame;
    const mat = new THREE.MeshLambertMaterial({ color: colour });
    const frame = new THREE.Group();
    frame.quaternion.copy(quat);
    group.add(frame);

    if (!unbuilt) {
      const fat = this.host.buildsIn3D() ? scaleOf(this.host.doc).pickPipe : 0;
      const centres = [];
      for (const [a, b] of laid.tubes) {
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
        const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const bar = new THREE.Mesh(new THREE.BoxGeometry(len, tube, tube), mat);
        bar.position.set(mid[0], mid[1], 0);
        bar.rotation.z = angle;
        this.register(bar, el);
        frame.add(bar);
        if (fat) {
          const grab = new THREE.Mesh(new THREE.BoxGeometry(len + fat, tube + fat, tube + fat), this.grabMaterial());
          grab.position.set(mid[0], mid[1], 0);
          grab.rotation.z = angle;
          grab.visible = false;
          this.register(grab, el);
          frame.add(grab);
        }
        centres.push(a[0], a[1], 0, b[0], b[1], 0);
      }
      for (const p of laid.joints) {
        const ball = new THREE.Mesh(new THREE.SphereGeometry(tube * 0.62, 10, 8), mat);
        ball.position.set(p[0], p[1], 0);
        this.register(ball, el);
        frame.add(ball);
      }
      const spine = new THREE.BufferGeometry();
      spine.setAttribute('position', new THREE.Float32BufferAttribute(centres, 3));
      frame.add(new THREE.LineSegments(spine, new THREE.LineBasicMaterial({ color: colour })));
    }

    for (const ap of levels) {
      if (ap.poly.length < 3) {
        continue;
      }
      const at = new THREE.Group();
      at.position.set(ap.centerX, ap.centerH, 0);
      frame.add(at);
      /* The pane in the hole is what is clicked and what is seen: as a gate's is. Weak, so a flag or a pole seen
       * through the hole takes the click, as the racing line does. */
      const seen = this.host.buildsIn3D();
      const field = !this.host.isWhoopRace();
      const base = selected ? (field ? 0.2 : 0.42) : (field ? 0.09 : 0.28);
      const pane = new THREE.MeshBasicMaterial(seen
        ? {
          color: this.paneColour(el), transparent: true, opacity: base, side: THREE.DoubleSide, depthWrite: false,
        }
        : { transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
      const pick = new THREE.Mesh(this.polygonPaneGeometry(ap.poly), pane);
      pick.userData.weak = true;
      this.register(pick, el);
      at.add(pick);
      if (seen && el.id !== '__ghost') {
        const list = this.panes.get(el.id) ?? [];
        list.push({ mat: pane, base });
        this.panes.set(el.id, list);
      }
      /* The line round the hole the pilot flies: the corners of the polygon, and the same one the world scores. */
      const loop = new THREE.BufferGeometry();
      loop.setAttribute('position', new THREE.Float32BufferAttribute(ap.poly.flatMap(([x, y]) => [x, y, 0]), 3));
      at.add(new THREE.LineLoop(loop, new THREE.LineBasicMaterial({ color: colour })));
    }

    this.buildLanes(group, el, levels, numbers, f, quat, selected);
  }

  /* A pane in the shape of a letter's hole: its corners cut into triangles, about the hole's own point. */
  polygonPaneGeometry(poly) {
    const fan = paneOfPolygon(poly, 1, 1);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(fan.position, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(fan.uv, 2));
    geo.setIndex(fan.index);
    return geo;
  }

  /*
   * THE TUBES OF A HOOP OR A HEX GATE, in the opening's own plane, in the same shape the four bars of
   * a gate are given: one for each side of the shape's frame (src/props/aperture.js), lengthened
   * so the corners are filled, and turned to the side. A tube wholly under the floor is not drawn,
   * as the world does not build it: the floor is the sill.
   */
  shapedBars(ap, shape, tube, f) {
    const run = frameOutline(shape, ap.clearW / 2, ap.clearH / 2, tube / 2);
    const out = [];
    for (const [i, bar] of barsAlong(run, tube).entries()) {
      const a = run[i];
      const b = run[(i + 1) % run.length];
      const high = Math.max(ap.centerH + a[1] * f.heightAxis.z, ap.centerH + b[1] * f.heightAxis.z);
      if (high <= 1e-6) {
        continue;
      }
      out.push([bar.len, tube, bar.x, bar.y, null, bar.angle]);
    }
    return out;
  }

  /*
   * THE POSTS OF A HOOP OR A HEX GATE THAT HANGS IN THE AIR: one under each of the lowest corners of
   * the frame, the same rule the world builds by. Returned as gateSupportFeet returns a foot: where it
   * stands on the ground and how tall it is.
   */
  shapedFeet(ap, shape, tube, f) {
    const run = frameOutline(shape, ap.clearW / 2, ap.clearH / 2, tube / 2);
    const heights = run.map(([, y]) => ap.centerH + y * f.heightAxis.z);
    const lowest = Math.min(...heights);
    if (lowest - tube / 2 <= 0.02) {
      return [];
    }
    return run
      .filter((_, i) => Math.abs(heights[i] - lowest) <= 1e-6)
      .map(([x, y]) => ({
        x: f.widthAxis.x * x + f.heightAxis.x * y,
        y: f.widthAxis.y * x + f.heightAxis.y * y,
        z: lowest,
      }));
  }

  /* A pane in the shape of an opening: the fan of triangles src/props/aperture.js describes. */
  paneGeometry(shape, w, h) {
    const fan = paneFan(shape, w, h);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(fan.position, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(fan.uv, 2));
    geo.setIndex(fan.index);
    return geo;
  }

  /* The green entry pane and the red exit pane of one pass, a hand's breadth
   * either side of its opening. */
  panePair(group, ap, seq, f, quat) {
    /* A letter's hole is not on the middle of its piece, and is a polygon of its own. */
    const across = ap.centerX ?? 0;
    for (const [side, colour] of [[-seq.entry, COL.entry], [seq.entry, COL.exit]]) {
      const pane = new THREE.Mesh(
        ap.shape === 'poly'
          ? this.polygonPaneGeometry(ap.poly)
          : (ap.shape ? this.paneGeometry(ap.shape, ap.clearW, ap.clearH) : new THREE.PlaneGeometry(ap.clearW, ap.clearH)),
        new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
      );
      pane.quaternion.copy(quat);
      pane.position.set(
        f.widthAxis.x * across + f.normal.x * side * 0.12,
        f.widthAxis.y * across + f.normal.y * side * 0.12,
        ap.centerH + f.widthAxis.z * across + f.normal.z * side * 0.12,
      );
      group.add(pane);
    }
  }

  /*
   * ONE ARROW FOR EACH WAY AN OPENING IS FLOWN, and no more. Every pass used to
   * draw its own, 0.85 of the opening wide and all on the same spot, so a gate
   * flown three times was three arrows over one another and the gate under them.
   * Now an opening flown one way has one arrow at half its width, an opening flown
   * both ways has two side by side (a lane each), and where a pass is in focus its
   * lane is bright and a little longer, its panes are drawn, and every other lane is
   * drawn back to a third.
   */
  buildLanes(group, el, levels, numbers, f, quat, selected) {
    const focus = this.focusSeq;
    for (const lane of arrowLanes(numbers, levels.length)) {
      const ap = levels[lane.apertureIndex];
      const inFocus = focus != null && lane.seqIds.includes(focus);
      const quiet = focus != null && !inFocus;
      /* A lane's offset across its hole, and the hole's own across offset when it is not on the piece's middle. */
      const across = (ap.centerX ?? 0) + (lane.lanes === 1 ? 0 : (lane.lane === 0 ? -1 : 1) * ap.clearW * 0.22);
      const length = Math.max(0.22, ap.clearW * (inFocus ? 0.6 : 0.46));
      const along = { x: f.normal.x * lane.entry, y: f.normal.y * lane.entry, z: f.normal.z * lane.entry };
      const arrow = arrowMesh(along, length, inFocus || (selected && focus == null) ? COL.frameSel : COL.arrow, quiet ? 0.3 : (inFocus ? 1 : 0.85));
      arrow.position.set(f.widthAxis.x * across, f.widthAxis.y * across, ap.centerH + f.widthAxis.z * across);
      group.add(arrow);
    }
    /* The panes are the focused pass's, when it is one of this piece's. */
    if (focus != null) {
      const n = numbers.find((x) => x.seq && x.seq.id === focus);
      if (n && n.seq.entry !== 0) {
        this.panePair(group, levels[Math.min(n.apertureIndex ?? 0, levels.length - 1)], n.seq, f, quat);
      }
    }
  }

  /*
   * Pennants on a flagged gate's header: the ends, or the centre for a mast
   * set on top. Same teardrop as a turn flag, stood on the board rather than
   * spiked in the grass, sails pointing outboard so they do not cover the
   * opening, and to the right from a centre mast which has no outboard.
   */
  buildHeaderFlags(group, el, selected) {
    const signs = flagSideSigns(flagSideOf(el));
    /* A hurdle is a barrier with flags: its masts stand at the ends of the board, along the way
     * it is turned, on the top of it. A gate's stand on its header, along its width. */
    const board = ELEMENTS[el.type]?.kind === KIND.OBSTACLE;
    if (!signs.length || (!board && Math.abs(el.pitch) >= Math.PI / 6)) {
      return;
    }
    let along;
    let half;
    let headerTop;
    if (board) {
      along = { x: Math.cos(el.yaw), y: Math.sin(el.yaw) };
      half = el.dims.width / 2;
      headerTop = el.dims.height;
    } else {
      const levels = aperturesOf(el);
      const top = levels[levels.length - 1];
      const tube = FRAME_TUBE_OD;
      const sleeveW = isPlain(el) ? 0 : 0.42;
      const headerW = 2 * (top.clearW / 2 + tube + sleeveW);
      headerTop = top.sillH + top.clearH + tube * 2 + BANNER_H + 0.03;
      const wa = apertureFrame(el.yaw, el.pitch).widthAxis;
      along = { x: wa.x, y: wa.y };
      half = headerW / 2;
    }
    const f = { widthAxis: along };
    const h = gateFlagHeight(el.dims);
    const poleR = GATE_FLAG_POLE_R;
    const poleMat = new THREE.MeshLambertMaterial({ color: selected ? COL.frameSel : COL.frame });
    const kit = this.dressFor(el);
    let i = 0;
    for (const sx of signs) {
      const x = f.widthAxis.x * sx * half;
      const y = f.widthAxis.y * sx * half;
      /* One transform for the mast and its cloth, so the bend and the sail
       * both lean outboard off the board's end. A CENTRE mast has sx zero,
       * which is a position and not a direction, so the lean is read
       * separately and the atan2 is fed a real vector rather than (0, 0). */
      const lean = flagLeanSign(sx);
      const turn = -Math.atan2(f.widthAxis.y * lean, f.widthAxis.x * lean);
      const pole = new THREE.Mesh(mastPlaneGeometry(poleR, h), poleMat);
      pole.rotation.x = Math.PI / 2;
      pole.rotation.y = turn;
      pole.position.set(x, y, headerTop);
      this.register(pole, el);
      group.add(pole);
      const sail = new THREE.Mesh(
        sailPlaneGeometry(poleR, h),
        selected
          ? new THREE.MeshLambertMaterial({ color: COL.frameSel, side: THREE.DoubleSide })
          : kit.sails[i % kit.sails.length],
      );
      sail.rotation.x = Math.PI / 2;
      sail.rotation.y = turn;
      sail.position.set(x, y, headerTop);
      group.add(sail);
      i += 1;
    }
  }

  buildMarker(group, el, selected, numbers = []) {
    const colour = selected ? COL.frameSel : (el.type === 'cone' ? COL.cone : COL.marker);
    /*
     * A waypoint is a ghost. Nothing stands there on the race field, so the
     * preview shows a see through post and a ring on the ground: enough to
     * find and grab, not enough to be mistaken for an obstacle.
     */
    if (el.type === 'waypoint') {
      const mat = new THREE.MeshBasicMaterial({
        color: selected ? COL.frameSel : COL.entry,
        transparent: true,
        opacity: 0.34,
      });
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(el.dims.poleRadius * 2, el.dims.poleRadius * 2, el.dims.height, 6),
        mat,
      );
      post.rotation.x = Math.PI / 2;
      post.position.z = el.dims.height / 2;
      this.register(post, el);
      group.add(post);
      /*
       * The ring is a room's size in a room. It was a field's 0.9 m on every
       * class, which in a RaceGOW room is wider than the gate beside it, and
       * a waypoint is now what a bent line is made of, so there can be
       * several in a space the width of a sofa.
       */
      const k = trackClassOf(this.host.doc) === 'micro' ? MICRO_LABEL_K : 1;
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.36 * k, 0.46 * k, 20), mat);
      ring.position.z = 0.02;
      group.add(ring);
      /*
       * THE HANDLE. A waypoint pins the racing line at its own base, so the
       * point the line passes through gets a knob: that is where the line is
       * held and what a drag in this view moves. Solid, so it reads as the
       * thing to grab rather than as more of the ghost.
       */
      const knob = new THREE.Mesh(
        new THREE.SphereGeometry(0.09 * k, 14, 10),
        new THREE.MeshLambertMaterial({ color: selected ? COL.frameSel : COL.path }),
      );
      this.register(knob, el);
      group.add(knob);
      return;
    }
    if (el.type === 'cone') {
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(el.dims.baseRadius, el.dims.height, 12),
        new THREE.MeshLambertMaterial({ color: colour }),
      );
      /* ConeGeometry points along +Y in Three's own frame; the document
       * wants it pointing along +Z, so it is tipped once here. */
      cone.rotation.x = Math.PI / 2;
      cone.position.z = el.dims.height / 2;
      this.register(cone, el);
      group.add(cone);
      this.buildVirtualGates(group, el, numbers, selected);
      return;
    }
    /*
     * A POLE IS A POLE. RaceGOW's vertical pole is a bare length of pipe
     * stood on end, and it fell through to the flag below, so every pole on
     * a whoop track was previewed as a five inch race flag: a bent mast with
     * a printed sail on it. The owner's words: "poles or flags are not flags
     * like in 5 inch, they are just a pole".
     *
     * Drawn as the world draws it (courseProps in src/render/scene.js): a red
     * pipe the author's radius and height, with the same floors that
     * markerBuild gives it there, on a stub foot four pipes across. The
     * builder does not import the game, so the numbers are repeated here and
     * name where they come from.
     */
    if (el.type === 'pole') {
      const r = Math.max(0.004, el.dims.poleRadius ?? 0.02);
      const h = Math.max(0.1, el.dims.height ?? 1.5);
      const poleMat = new THREE.MeshLambertMaterial({ color: selected ? COL.frameSel : COL.pole });
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 12), poleMat);
      pipe.rotation.x = Math.PI / 2;
      pipe.position.z = h / 2;
      this.register(pipe, el);
      group.add(pipe);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(r * 4, r * 4, r * 1.6), poleMat);
      foot.position.z = r * 0.8;
      this.register(foot, el);
      group.add(foot);
      /* A 27 mm pipe is two pixels across from where a room is viewed, and
       * the sail that used to hang off it was what got clicked. So it gets
       * the same kind of fattened, never drawn stand in a map's thin members
       * get (pickProxy), sized to a room rather than to a field. */
      const grab = new THREE.Mesh(
        new THREE.CylinderGeometry(1, 1, 1, 8),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
      );
      const grabR = Math.max(r * 2.5, trackClassOf(this.host.doc) === 'micro' ? 0.04 : 0.15);
      grab.scale.set(grabR, h, grabR);
      grab.rotation.x = Math.PI / 2;
      grab.position.z = h / 2;
      grab.visible = false;
      this.register(grab, el);
      group.add(grab);
      this.buildVirtualGates(group, el, numbers, selected);
      return;
    }
    /*
     * The mast BENDS, so it and the sail take one transform between them:
     * same origin at the butt, same stand up, same heading. A cylinder at
     * its own half height could not, and a mast whose top leans one way
     * while the cloth hangs the other is not a flag.
     *
     * Authored in XY with x out from the mast and y up, then turned to the
     * marker's heading about its own axis and stood upright in this Z up
     * world. Three applies an XYZ euler in that order, so the heading spins
     * the flag about its mast before the mast is stood up, which is what
     * keeps the bend pointing where the cloth hangs.
     */
    const h = el.dims.height;
    const pole = new THREE.Mesh(
      mastPlaneGeometry(el.dims.poleRadius, h),
      new THREE.MeshLambertMaterial({ color: colour }),
    );
    pole.rotation.x = Math.PI / 2;
    pole.rotation.y = -el.yaw;
    this.register(pole, el);
    group.add(pole);
    /*
     * The feather sail, with its LEADING EDGE ON THE MAST, and the same
     * print the world puts on it. The old preview drew a rectangle whose
     * inner edge happened to touch the pole; this is the outline a race flag
     * actually has, so an author placing markers sees what will stand there.
     */
    const sail = new THREE.Mesh(
      sailPlaneGeometry(el.dims.poleRadius, h),
      selected ? new THREE.MeshLambertMaterial({ color: COL.frameSel, side: THREE.DoubleSide })
        : this.sailForMarker(el),
    );
    sail.rotation.x = Math.PI / 2;
    sail.rotation.y = -el.yaw;
    group.add(sail);
    this.buildVirtualGates(group, el, numbers, selected);
  }

  /*
   * The pass-side scoring square. One per sequence entry, so a flag flown
   * twice gets two holes. Green on the face the quad comes from, red on
   * the other, matching a real gate. Inner edge on the pole.
   */
  buildVirtualGates(group, el, numbers, selected) {
    if (!this.host?.doc) {
      return;
    }
    for (const n of numbers) {
      const seq = n.seq;
      if (!seq || (seq.clearance ?? 0) < 0.05) {
        continue;
      }
      /*
       * THE SQUARE THE RACE FIELD SCORES, off the racing line's own knot
       * (markerSquare in path.js). It faces the knot's tangent, which swings
       * with a marker the author has turned, so the square pivots round the
       * pole like a door on a hinge. The chain direction this used to read
       * does not swing, so a turned pole's square slid round the pole
       * keeping its heading, and the preview showed a hole nothing scores.
       * The old reading stays as the fallback for a line not derived yet.
       */
      const square = markerSquare(this.host.doc, knotForSeq(this.host.path, seq.id));
      let dims;
      let off;
      let f;
      if (square) {
        dims = square.dims;
        off = { x: square.centre.x - el.position.x, y: square.centre.y - el.position.y };
        f = {
          widthAxis: square.widthAxis,
          heightAxis: { x: 0, y: 0, z: 1 },
          normal: square.normal,
        };
      } else {
        const dir = travelDirection(this.host.doc, seq.id);
        if (!dir) {
          continue;
        }
        dims = virtualApertureDims(el, seq, trackClassOf(this.host.doc));
        const u = normalize({ x: dir.x, y: dir.y, z: 0 }, { x: 1, y: 0, z: 0 });
        /* Inner edge on the pole: half the square's width out along the
         * pass side, which is the clearance plus whatever elements.js padded
         * the width by. */
        off = scale(markerPassDir(el, seq, u), seq.clearance + dims.outward);
        f = {
          widthAxis: leftOf(u),
          heightAxis: { x: 0, y: 0, z: 1 },
          normal: { x: u.x, y: u.y, z: 0 },
        };
      }
      const basis = new THREE.Matrix4().makeBasis(
        new THREE.Vector3(f.widthAxis.x, f.widthAxis.y, f.widthAxis.z),
        new THREE.Vector3(f.heightAxis.x, f.heightAxis.y, f.heightAxis.z),
        new THREE.Vector3(f.normal.x, f.normal.y, f.normal.z),
      );
      const quat = new THREE.Quaternion().setFromRotationMatrix(basis);
      const cx = off.x;
      const cy = off.y;
      const cz = dims.centerH;
      const loop = [
        -dims.clearW / 2, -dims.clearH / 2, 0, dims.clearW / 2, -dims.clearH / 2, 0,
        dims.clearW / 2, dims.clearH / 2, 0, -dims.clearW / 2, dims.clearH / 2, 0,
      ];
      /*
       * ON A TRACK a pole flown six times was six squares of coloured glass
       * round one pipe. A square is an outline, drawn once where two passes share
       * one, and the glass (green in, red out) belongs to the pass in focus. Every
       * other canvas draws the glass of every pass, as it always did.
       */
      const whoop = this.host.buildsIn3D();
      const inFocus = whoop && this.focusSeq === seq.id;
      if (whoop) {
        const at = `${Math.round((el.position.x + cx) * 100)},${Math.round((el.position.y + cy) * 100)},${Math.round(f.normal.x * 10)},${Math.round(f.normal.y * 10)}`;
        this.drawnSquares ??= new Set();
        if (!inFocus && this.drawnSquares.has(`${el.id}|${at}`)) {
          continue;
        }
        this.drawnSquares.add(`${el.id}|${at}`);
      }
      const holder = new THREE.Group();
      holder.position.set(cx, cy, cz);
      holder.quaternion.copy(quat);
      const loopGeo = new THREE.BufferGeometry();
      loopGeo.setAttribute('position', new THREE.Float32BufferAttribute(loop, 3));
      const quiet = whoop && this.focusSeq != null && !inFocus;
      holder.add(new THREE.LineLoop(loopGeo, new THREE.LineBasicMaterial({
        color: inFocus || (selected && !whoop) ? COL.frameSel : COL.entry,
        transparent: quiet,
        opacity: quiet ? 0.3 : 1,
      })));
      if (!whoop || inFocus) {
        for (const [side, colour] of [[-1, COL.entry], [1, COL.exit]]) {
          const pane = new THREE.Mesh(
            new THREE.PlaneGeometry(dims.clearW, dims.clearH),
            new THREE.MeshBasicMaterial({
              color: colour, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false,
            }),
          );
          pane.position.z = side * 0.12;
          holder.add(pane);
        }
      }
      group.add(holder);
    }
  }

  buildStart(group, el, selected) {
    const tint = selected ? COL.frameSel : null;
    const mats = {
      wood: new THREE.MeshLambertMaterial({ color: tint ?? START_BLOCK_WOOD }),
      base: new THREE.MeshLambertMaterial({ color: tint ?? START_BLOCK_WOOD_DARK }),
      foam: new THREE.MeshLambertMaterial({ color: tint ?? START_BLOCK_FOAM }),
      lip: new THREE.MeshLambertMaterial({ color: tint ?? START_BLOCK_LIP }),
    };
    const n = Math.max(1, Math.round(el.dims.pads));
    for (let i = 0; i < n; i += 1) {
      const off = (i - (n - 1) / 2) * el.dims.spacing;
      const holder = new THREE.Group();
      holder.position.set(-Math.sin(el.yaw) * off, Math.cos(el.yaw) * off, 0);
      holder.rotation.z = el.yaw;
      const stand = assembleStartBlock(THREE, el.dims.padSize, mats);
      /*
       * assembleStartBlock is Y up (X across, Y up, Z toward spawn). This
       * preview is Z up with +X along the heading, so one Euler takes the
       * stand into the document frame without rebuilding it.
       */
      stand.rotation.set(Math.PI / 2, 0, -Math.PI / 2);
      holder.add(stand);
      stand.traverse((o) => {
        if (o.isMesh) {
          this.register(o, el);
        }
      });
      group.add(holder);
    }
    const pts = [0, 0, 0.05, Math.cos(el.yaw) * 3, Math.sin(el.yaw) * 3, 0.05];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    group.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: COL.start })));
  }

  buildPath(path) {
    const pts = [];
    for (const s of path.samples) {
      pts.push(s.pos.x, s.pos.y, s.pos.z);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    /*
     * WHILE A PASS IS IN FOCUS (whoop canvas) the line is drawn back to a quarter
     * and the stretch that belongs to that pass, from the pass before it to the
     * pass after, is drawn over it as a tube. A hairline is one pixel wide at any
     * distance and six turns round one pole are six hairlines on the same spot;
     * a thick bright stretch is the one that is being looked at.
     */
    const stretch = this.focusSeq != null && this.host.buildsIn3D() ? stretchOf(path, this.focusSeq) : null;
    if (!stretch) {
      return new THREE.Line(geo, new THREE.LineBasicMaterial({ color: COL.path }));
    }
    const group = new THREE.Group();
    group.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: COL.path, transparent: true, opacity: 0.25 })));
    const bright = this.brightStretch(path, stretch);
    if (bright) {
      group.add(bright);
    }
    return group;
  }

  /* The samples of a stretch as a tube a centimetre and a half across, or null
   * where fewer than two of them are apart. */
  brightStretch(path, stretch) {
    const points = [];
    for (let i = stretch.from; i <= stretch.to; i += 1) {
      const p = path.samples[i].pos;
      const v = new THREE.Vector3(p.x, p.y, p.z);
      if (!points.length || v.distanceTo(points[points.length - 1]) > 1e-4) {
        points.push(v);
      }
    }
    if (points.length < 2) {
      return null;
    }
    const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(curve, Math.max(12, points.length * 2), scaleOf(this.host.doc).metric ? 0.06 : 0.015, 6, false),
      new THREE.MeshBasicMaterial({ color: 0xfff1b8 }),
    );
    tube.renderOrder = 10;
    return tube;
  }

  buildGuideMarks(path) {
    /* The class sizes every length in the paint, and the preview has to
     * paint what the race field will paint or an author is editing a
     * different track from the one they fly. */
    const cls = trackClassOf(this.host.doc);
    /*
     * And a room gets no paint at all, which is that same contract: the
     * race field stopped painting a micro course in
     * src/game/trackdoc.js, so a preview that still painted one would be
     * showing the author marks nobody flying it will ever see.
     */
    if (cls === 'micro') {
      return new THREE.Group();
    }
    const tris = tessellateGuide(guideFromKnots(knotsFromPath(path, cls), cls));
    if (tris.length < 3) {
      return new THREE.Group();
    }
    const pos = new Float32Array(tris.length * 3);
    for (let i = 0; i < tris.length; i += 1) {
      pos[i * 3] = tris[i].x;
      pos[i * 3 + 1] = tris[i].z;
      pos[i * 3 + 2] = 0.04;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffef9a,
      side: THREE.DoubleSide,
      depthWrite: false,
      transparent: true,
      opacity: 0.96,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 2;
    return mesh;
  }

  /* ---------------- the whoop room: what building needs drawn ---------------- */

  /* The gate the lap starts and stops on: the first opening in the flying
   * order. RaceGOW draws it green on every diagram. */
  startGateOf(doc) {
    for (const s of doc.sequence) {
      const el = elementById(doc, s.elementId);
      if (el && kindOf(el) === KIND.APERTURE) {
        return el.id;
      }
    }
    return null;
  }

  /* The one material every never-drawn stand-in shares, so a rebuild does not make
   * (and disposeContent does not free) one for each of a hundred pipes. */
  grabMaterial() {
    if (!this.grabMat) {
      this.grabMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
      this.grabMat.userData.sharedKit = true;
    }
    return this.grabMat;
  }

  /* The colour of the pane in a gate's opening: see RACEGOW_HEX. The ghost of
   * the very first gate is the start gate it is about to be. */
  paneColour(el) {
    if (el.id === this.startGateId || (el.id === '__ghost' && !this.startGateOf(this.host.doc))) {
      return RACEGOW_HEX.green;
    }
    return this.host.isWhoopRace() ? RACEGOW_HEX[RACEGOW_TYPE_COLOUR[el.type] ?? 'yellow'] : COL.pane;
  }

  /*
   * THE ENVELOPE: RaceGOW's 4 by 6 ft rectangle scaled by the gate size (1.42
   * by 2.13 m at 28 in), drawn lit on the floor of a hall that is dimmed
   * round it. It is what a track has to fit in and what an empty canvas
   * frames, and it sits where the game puts a track, on the middle of the room.
   */
  buildEnvelope(doc) {
    const g = new THREE.Group();
    const first = doc.elements.find((e) => kindOf(e) === KIND.APERTURE);
    const env = envelopeFor(first ? first.dims.clearW : GATE_OPENING_DEFAULT);
    const cx = doc.field.width / 2;
    const cy = doc.field.depth / 2;
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(env.width, env.depth),
      new THREE.MeshLambertMaterial({ color: COL.envelope }),
    );
    plane.position.set(cx, cy, -0.004);
    g.add(plane);
    const hw = env.width / 2;
    const hd = env.depth / 2;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([
      cx - hw, cy - hd, 0.005, cx + hw, cy - hd, 0.005, cx + hw, cy + hd, 0.005, cx - hw, cy + hd, 0.005,
    ], 3));
    g.add(new THREE.LineLoop(geo, new THREE.LineBasicMaterial({ color: COL.envelopeLine })));
    return g;
  }

  /* When what is selected is every piece of one group, the piece the ring is drawn at: the flat one, which is over
   * the middle of a cube, or the first. Null for anything else. */
  wholeGroupAnchor(doc, ids) {
    const first = elementById(doc, ids[0]);
    if (!first || !first.group) {
      return null;
    }
    const members = doc.elements.filter((e) => e.group === first.group);
    if (members.length !== ids.length || !members.every((m) => ids.includes(m.id))) {
      return null;
    }
    return members.find((m) => Math.abs(m.pitch || 0) > 1) ?? members[0];
  }

  /*
   * THE RING AT A SELECTED GATE'S FOOT, and the knob on it where the gate
   * faces: drag it and the gate turns (edit3d.js), in quarter turns unless Alt
   * is held. A gate never leaves the floor, so a ring on the floor is the
   * handle rather than a gizmo in the air. The visible ring is a thin line; the
   * thing that is hit is a band five times as wide, never drawn.
   */
  buildRing(group, el) {
    if (!group) {
      return;
    }
    const ring = scaleOf(this.host.doc).ring;
    const r = aperturesOf(el)[0].clearW / 2 + ring.pad;
    const line = new THREE.Mesh(
      new THREE.RingGeometry(r - ring.line, r + ring.line, 64),
      new THREE.MeshBasicMaterial({ color: COL.frameSel, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }),
    );
    line.position.z = 0.006;
    group.add(line);
    const grab = new THREE.Mesh(
      new THREE.RingGeometry(r - ring.grab, r + ring.grab, 64),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }),
    );
    grab.position.z = 0.008;
    grab.userData.ring = true;
    this.register(grab, el);
    group.add(grab);
    const knob = new THREE.Mesh(
      new THREE.SphereGeometry(ring.knob, 14, 10),
      new THREE.MeshBasicMaterial({ color: COL.frameSel }),
    );
    knob.position.set(Math.cos(el.yaw) * r, Math.sin(el.yaw) * r, ring.knob);
    knob.userData.ring = true;
    this.register(knob, el);
    group.add(knob);
  }

  /* ---------------- a drag that does not rebuild ---------------- */

  /*
   * WHAT A PIECE'S DRAWING DEPENDS ON THAT A MOVE CAN CHANGE BESIDES WHERE IT
   * IS: which way every piece faces and which way every pass is flown, because
   * the auto rule re-derives both after every edit. A drag that leaves all of
   * it as it was can slide the pieces' own groups and redraw the line, which
   * is a fraction of a rebuild; one that does not, a gate that turns as it is
   * carried across an old auto faced track, rebuilds.
   */
  signature() {
    const doc = this.host.doc;
    return `${doc.elements.map((e) => `${e.yaw}|${e.pitch}`).join(';')}#${doc.sequence.map((q) => `${q.entry}|${q.passSide}|${q.apertureIndex}`).join(';')}`;
  }

  /* The pieces have moved in the document: move their drawings to match. */
  movePieces(ids) {
    const doc = this.host.doc;
    if (!this.groups.size || this.signature() !== this.faceSig) {
      this.dirty = true;
      this.host.requestDraw();
      return;
    }
    for (const id of ids) {
      const group = this.groups.get(id);
      const el = elementById(doc, id);
      if (!group || !el) {
        this.dirty = true;
        this.host.requestDraw();
        return;
      }
      group.position.set(el.position.x, el.position.y, el.position.z);
    }
    this.redrawLine();
    this.host.requestDraw();
  }

  /* The racing line alone, from the path as it stands. */
  redrawLine() {
    if (this.pathLine) {
      this.freeGroup(this.pathLine);
      this.pathLine = null;
    }
    const path = this.host.path;
    if (this.content && this.host.pathVisible && path && path.samples.length > 1) {
      this.pathLine = this.buildPath(path);
      this.content.add(this.pathLine);
    }
  }

  /* ---------------- the pointer, the ghost and the distances ---------------- */

  /* Light the panes of what the pointer is over. */
  setHover(id) {
    if (id === this.hoverId) {
      return;
    }
    this.hoverId = id;
    this.applyHover();
    this.host.requestDraw();
  }

  applyHover() {
    for (const [id, list] of this.panes) {
      for (const p of list) {
        p.mat.opacity = p.base + (id === this.hoverId ? 0.12 : 0);
      }
    }
    if (this.isFreestyle()) {
      this.hoverOutline();
    }
  }

  /*
   * WHAT THE POINTER IS OVER, on a map: the box round the asset, in faint cream, where a track lights the
   * panes in its openings. One line box moved from piece to piece, never a rebuild, and not for what is
   * selected, which has its own.
   */
  hoverOutline() {
    if (this.hoverBox) {
      this.hoverBox.removeFromParent();
      this.hoverBox.traverse((o) => {
        o.geometry?.dispose();
        o.material?.dispose();
      });
      this.hoverBox = null;
    }
    const id = this.hoverId;
    const el = id && !this.host.selection.has(id) ? elementById(this.host.doc, id) : null;
    const holder = el ? this.groups.get(el.id) : null;
    const art = el ? this.assets.get(assetKey(el)) : null;
    if (!holder || !art || !art.group || art.box.isEmpty()) {
      return;
    }
    /* The asset's own frame is the holder's first child (buildAsset). */
    const local = holder.children[0];
    if (!local || local.rotation.x !== Math.PI / 2) {
      return;
    }
    const size = art.box.getSize(new THREE.Vector3()).addScalar(0.3);
    const lines = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(size.x, size.y, size.z)),
      new THREE.LineBasicMaterial({ color: 0xf7e8cd, transparent: true, opacity: 0.7, depthWrite: false, fog: false }),
    );
    art.box.getCenter(lines.position);
    this.hoverBox = lines;
    local.add(lines);
  }

  /* Free what a group holds, and take it out of the scene. */
  freeGroup(group) {
    group.traverse((o) => {
      if (o.geometry) {
        o.geometry.dispose();
      }
      if (o.material) {
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          if (!(m.userData && m.userData.sharedKit)) {
            m.dispose();
          }
        }
      }
    });
    group.removeFromParent();
  }

  /*
   * THE GHOST: the piece a click would place, drawn faint where it would go,
   * facing the way it would face, with an arrow through it. Rebuilt only when
   * the snapped spot or the heading changes. It is never picked, and a piece
   * that cannot be drawn is not drawn rather than taking the room down.
   */
  setGhost(g) {
    this.setGhosts([g]);
  }

  /* The ghost is a list of pieces, because a row of gates is several. */
  setGhosts(list) {
    const key = list.map((g) => `${g.type}|${g.position.x.toFixed(4)}|${g.position.y.toFixed(4)}|${(g.position.z ?? 0).toFixed(4)}|${g.yaw.toFixed(4)}|${g.props ? `${g.props.pitch}|${g.props.dims.sillH}|${g.props.letter ?? ''}|${g.props.unbuilt ? 'u' : ''}` : ''}`).join(';');
    if (this.ghost && this.ghost.key === key) {
      return;
    }
    this.ghost = { items: list, key };
    this.rebuildGhost();
    this.host.requestDraw();
  }

  clearGhost() {
    this.setDraftPointer(null);
    this.setCarGhost(null);
    if (!this.ghost && !this.ghostGroup) {
      return;
    }
    this.ghost = null;
    this.rebuildGhost();
    this.host.requestDraw();
  }

  rebuildGhost() {
    if (this.ghostGroup) {
      this.freeGroup(this.ghostGroup);
      this.ghostGroup = null;
    }
    const ghost = this.ghost;
    if (!ghost || !this.root) {
      return;
    }
    const all = new THREE.Group();
    const saved = this.pickables;
    this.pickables = [];
    try {
      for (const g of ghost.items) {
        const def = ELEMENTS[g.type];
        /* A map's pieces are drawn by the kit and have their own: see mapGhost. */
        if (this.isFreestyle()) {
          const node = def ? this.mapGhost(g, def) : null;
          if (node) {
            all.add(node);
          }
          continue;
        }
        if (!def || ![KIND.APERTURE, KIND.MARKER, KIND.OBSTACLE].includes(def.kind)) {
          continue;
        }
        const el = createElement(this.host.doc, g.type, g.position, g.yaw);
        el.id = '__ghost';
        /* A face of a cube is a gate with a tilt, sizes and sides of its own. */
        if (g.props) {
          const { dims, ...rest } = g.props;
          Object.assign(el, rest);
          Object.assign(el.dims, dims);
        }
        const node = this.buildElement(el, []);
        node.traverse((o) => {
          if (!o.material) {
            return;
          }
          for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
            if (!(m.userData && m.userData.sharedKit)) {
              m.transparent = true;
              m.opacity = Math.min(m.opacity ?? 1, 0.55);
            }
          }
        });
        if (def.kind === KIND.APERTURE && (!g.props || g.props.letter)) {
          /* A letter's arrow goes through the hole a new pass would, which is across the piece as well as up it. */
          const ap = aperturesOf(el)[g.props?.letter ? primaryOpening(el.letter) : 0];
          const arrow = arrowMesh({ x: Math.cos(g.yaw), y: Math.sin(g.yaw), z: 0 }, Math.max(0.3, ap.clearW * 0.85), COL.arrow, 0.7);
          const across = ap.centerX ?? 0;
          arrow.position.set(-Math.sin(g.yaw) * across, Math.cos(g.yaw) * across, ap.centerH);
          node.add(arrow);
        }
        all.add(node);
      }
      this.ghostGroup = all;
      this.stage().add(all);
    } catch (e) {
      this.ghost = null;
    } finally {
      this.pickables = saved;
    }
  }

  /*
   * THE GHOST OF A MAP'S PIECE, where a click would put it: the piece as it
   * would be made (createElement, so the style and size it would start at),
   * standing at the height of what is under the pointer.
   *
   * An asset is drawn as its solids in translucent mint, with the edges of
   * the boxes: it is what the physics will hold, it needs no kit pass so it is
   * there on the first frame of a hover, and it writes no depth, so the town's
   * ink draws no line round it. A gap is its amber window, paint and a label
   * are as the plan draws them, and the pads and the furniture gates are
   * solids like the rest. `g.position.z` is the base.
   */
  mapGhost(g, def) {
    const el = createElement(this.host.doc, g.type, g.position, g.yaw);
    el.id = '__ghost';
    if (def.kind === KIND.ZONE) {
      return this.buildGap(el, false, true);
    }
    if (el.type === 'balloonChase') {
      return this.buildBalloonChase(el, false, true);
    }
    const asset = FS && def.kind !== KIND.DECAL && def.kind !== KIND.ANNOTATION ? FS.assetOf(el) : null;
    if (!asset) {
      const node = this.buildElement(el, []);
      node.traverse((o) => {
        if (o.material && !(o.material.userData && o.material.userData.sharedKit)) {
          o.material.transparent = true;
          o.material.opacity = Math.min(o.material.opacity ?? 1, 0.55);
        }
      });
      return node;
    }
    const holder = new THREE.Group();
    holder.position.set(el.position.x, el.position.y, el.position.z);
    holder.rotation.z = FS.placedYaw(def.turns ?? asset.turns ?? 'any', el.yaw);
    const local = new THREE.Group();
    local.rotation.x = Math.PI / 2;
    local.add(this.plainAsset(el, false, true));
    holder.add(local);
    return holder;
  }

  /*
   * THE DISTANCES: a line between two openings' middles and, laid over the
   * canvas, the number on it in both units, green where the pair is a legal
   * side by side pair and amber where it is too close or nearly one (spacingTone
   * in snap.js). Redrawn only when they change.
   */
  setMeasures(list) {
    const key = list.map((m) => [m.from, m.to].map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)}`).join('>')).join('|');
    if (key === this.measureKey) {
      return;
    }
    this.measureKey = key;
    this.measures = list;
    if (this.measureGroup) {
      this.freeGroup(this.measureGroup);
      this.measureGroup = null;
    }
    if (list.length && this.root) {
      const g = new THREE.Group();
      for (const m of list) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute([m.from.x, m.from.y, m.from.z, m.to.x, m.to.y, m.to.z], 3));
        const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
          color: COL.measure[m.tone] ?? COL.measure.plain, transparent: true, opacity: 0.9, depthTest: false,
        }));
        line.renderOrder = 12;
        g.add(line);
      }
      this.measureGroup = g;
      this.stage().add(g);
    }
    for (const n of this.measureNodes) {
      n.remove();
    }
    this.measureNodes = [];
    for (const m of list) {
      const n = document.createElement('div');
      n.className = `tb-measure tone-${m.tone}`;
      n.textContent = m.text;
      this.overlay.append(n);
      this.measureNodes.push(n);
    }
    this.host.requestDraw();
  }

  clearMeasures() {
    if (this.measures.length) {
      this.setMeasures([]);
    }
  }

  /*
   * THE RULER: a line on the floor between two points and, laid over the canvas,
   * the distance in inches and millimetres. Held until the next one is started or
   * the tool is put away; it is never part of the track. `r` is
   * { a, b, text, fixed } or null.
   */
  setRuler(r) {
    this.ruler = r;
    if (this.rulerGroup) {
      this.freeGroup(this.rulerGroup);
      this.rulerGroup = null;
    }
    if (this.rulerNode) {
      this.rulerNode.remove();
      this.rulerNode = null;
    }
    if (r && this.root) {
      const group = new THREE.Group();
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute([r.a.x, r.a.y, 0.014, r.b.x, r.b.y, 0.014], 3));
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: COL.frameSel, depthTest: false }));
      line.renderOrder = 12;
      group.add(line);
      /* A dot is a hall's size in a hall and a field's on a field: three times as big. */
      const dotR = scaleOf(this.host.doc).metric ? 0.12 : 0.035;
      for (const end of [r.a, r.b]) {
        const dot = new THREE.Mesh(new THREE.SphereGeometry(dotR, 10, 8), new THREE.MeshBasicMaterial({ color: COL.frameSel, depthTest: false }));
        dot.position.set(end.x, end.y, dotR);
        dot.renderOrder = 12;
        group.add(dot);
      }
      this.rulerGroup = group;
      this.stage().add(group);
      if (r.text && (r.a.x !== r.b.x || r.a.y !== r.b.y)) {
        const n = document.createElement('div');
        n.className = 'tb-measure tone-ruler';
        n.textContent = r.text;
        this.overlay.append(n);
        this.rulerNode = n;
      }
    }
    this.host.requestDraw();
  }

  /*
   * THE GUIDES the magnets found (magnetFor in snap.js): a line on the floor from
   * the piece a spot is measured from to the spot, so a piece that has jumped
   * shows what it jumped to. Redrawn only when they change.
   */
  setGuides(list) {
    const key = list.map((g) => `${g.kind}:${g.a.x.toFixed(3)},${g.a.y.toFixed(3)}>${g.b.x.toFixed(3)},${g.b.y.toFixed(3)}`).join('|');
    if (key === this.guideKey) {
      return;
    }
    this.guideKey = key;
    if (this.guideGroup) {
      this.freeGroup(this.guideGroup);
      this.guideGroup = null;
    }
    if (list.length && this.root) {
      const group = new THREE.Group();
      const guideR = scaleOf(this.host.doc).metric ? 0.1 : 0.03;
      for (const g of list) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute([g.a.x, g.a.y, 0.012, g.b.x, g.b.y, 0.012], 3));
        const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: COL.measure.legal, transparent: true, opacity: 0.85, depthTest: false }));
        line.renderOrder = 12;
        group.add(line);
        const dot = new THREE.Mesh(new THREE.SphereGeometry(guideR, 10, 8), new THREE.MeshBasicMaterial({ color: COL.measure.legal, depthTest: false }));
        dot.position.set(g.b.x, g.b.y, guideR);
        dot.renderOrder = 12;
        group.add(dot);
      }
      this.guideGroup = group;
      this.stage().add(group);
    }
    this.host.requestDraw();
  }

  /* The box a Shift drag is drawing, in screen pixels of the page; null puts it away. */
  showBox(r) {
    if (!r) {
      if (this.boxNode) {
        this.boxNode.hidden = true;
      }
      return;
    }
    if (!this.boxNode) {
      this.boxNode = document.createElement('div');
      this.boxNode.className = 'tb-box';
      this.overlay.append(this.boxNode);
    }
    const o = this.overlay.getBoundingClientRect();
    Object.assign(this.boxNode.style, {
      left: `${Math.min(r.x0, r.x1) - o.left}px`,
      top: `${Math.min(r.y0, r.y1) - o.top}px`,
      width: `${Math.abs(r.x1 - r.x0)}px`,
      height: `${Math.abs(r.y1 - r.y0)}px`,
    });
    this.boxNode.hidden = false;
  }

  /* ---------------- the HTML laid over the canvas ---------------- */

  /* Made once, beside the canvas, above it and below the status bar. Nothing
   * in it takes the pointer except the numbers, which are buttons. */
  ensureOverlay() {
    if (this.overlay) {
      return;
    }
    const ov = document.createElement('div');
    ov.className = 'tb-overlay';
    ov.hidden = true;
    this.canvas.after(ov);
    this.overlay = ov;
  }

  /*
   * ONE TAG FOR EACH OPENING THAT IS FLOWN, not one for each pass (passes.js):
   * its first number and, when it is flown more than once, a count ("2 x6").
   * Pointed at, or selected, or holding the pass in focus, it opens into a chip
   * for every pass, each a button: a click looks at that pass (pins it and selects
   * the piece), a double click turns it into a box to type the place that pass
   * should have. Enter moves it there (renumber in app.js), Escape leaves it.
   *
   * The tags are rebuilt only when what they say changes. A hover is a reason to
   * redraw the scene and to dim what is not in focus, and rebuilding a button the
   * pointer is on would lose the click it was about to make.
   */
  buildTagSpecs(doc) {
    this.bubbleSpecs = [];
    if (this.host.labelsVisible === false) {
      return;
    }
    for (const tag of tagsOf(doc)) {
      const el = elementById(doc, tag.elementId);
      if (!el) {
        continue;
      }
      const def = ELEMENTS[el.type];
      let dz = def.kind === KIND.MARKER ? el.dims.height + 0.12 : 1.0;
      /* Where the tag stands across the piece: a letter's hole is not on its middle. */
      let dx = 0;
      let dy = 0;
      if (def.kind === KIND.APERTURE) {
        const levels = aperturesOf(el);
        const ap = levels[Math.min(tag.apertureIndex, levels.length - 1)];
        dz = ap.centerH + ap.clearH / 2 + 0.1;
        if (ap.centerX) {
          const wa = apertureFrame(el.yaw, el.pitch).widthAxis;
          dx = wa.x * ap.centerX;
          dy = wa.y * ap.centerX;
        }
      }
      this.bubbleSpecs.push({
        id: el.id,
        key: tag.key,
        apertureIndex: tag.apertureIndex,
        dx,
        dy,
        dz,
        passes: tag.passes.map((p) => ({ seqId: p.seq.id, number: p.number })),
      });
    }
  }

  syncBubbles() {
    const sig = this.bubbleSpecs
      .map((sp) => `${sp.key}@${sp.dz.toFixed(3)},${(sp.dx ?? 0).toFixed(3)},${(sp.dy ?? 0).toFixed(3)}:${sp.passes.map((p) => `${p.seqId}=${p.number}`).join(',')}`)
      .join('|');
    if (sig !== this.tagSig || this.bubbles.length !== this.bubbleSpecs.length) {
      this.tagSig = sig;
      for (const b of this.bubbles) {
        b.node.remove();
      }
      this.bubbles = this.bubbleSpecs.map((spec) => this.makeTag(spec));
    }
    this.applyTagFocus();
  }

  makeTag(spec) {
    const node = document.createElement('div');
    node.className = 'tb-numtag';
    node.dataset.key = spec.key;
    const count = spec.passes.length;
    const chipFor = (pass) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'tb-bubble';
      chip.dataset.seq = pass.seqId;
      chip.textContent = String(pass.number);
      chip.title = count > 1
        ? `Number ${pass.number}, one of ${count} passes through this piece. Click to look at it, double click to give it another place.`
        : `Number ${pass.number} in the flying order. Click to look at it, double click to give it another place.`;
      chip.addEventListener('click', () => this.host.setPassPinned(pass.seqId));
      chip.addEventListener('dblclick', () => this.renumberInline(chip, pass));
      chip.addEventListener('pointerenter', () => this.host.setPassHover(pass.seqId));
      return chip;
    };
    const main = chipFor(spec.passes[0]);
    if (count > 1) {
      main.classList.add('multi');
      const more = document.createElement('span');
      more.className = 'tb-bubble-more';
      more.textContent = `\u00d7${count}`;
      main.append(more);
    }
    node.append(main);
    const tag = { node, spec, main, chips: [main], open: false, hovered: false, chipFor };
    node.addEventListener('pointerenter', () => {
      tag.hovered = true;
      this.applyTagFocus();
    });
    node.addEventListener('pointerleave', () => {
      tag.hovered = false;
      this.host.setPassHover(null);
      this.applyTagFocus();
    });
    this.overlay.append(node);
    return tag;
  }

  /* Open a tag into a chip for every pass, or close it back to its first. */
  setTagOpen(tag, open) {
    if (open === tag.open) {
      return;
    }
    tag.open = open;
    tag.w = null;
    tag.node.classList.toggle('open', open);
    if (open) {
      for (const pass of tag.spec.passes.slice(1)) {
        const chip = tag.chipFor(pass);
        tag.node.append(chip);
        tag.chips.push(chip);
      }
    } else {
      for (const chip of tag.chips.slice(1)) {
        chip.remove();
      }
      tag.chips = [tag.main];
    }
  }

  /*
   * What the tags say about the pass in focus: the tag that holds it is open with
   * its chip lit, the tags of the pieces before and after it keep their place in
   * the picture, the selected piece is marked, and every other tag is drawn back.
   */
  applyTagFocus() {
    const focus = this.focusSeq ?? null;
    const near = new Set();
    if (focus != null) {
      const around = aroundPass(this.host.doc, focus);
      for (const q of [around?.prev, around?.next]) {
        if (q) {
          near.add(q.elementId);
        }
      }
    }
    const picked = this.host.selection;
    for (const tag of this.bubbles) {
      const holds = focus != null && tag.spec.passes.some((p) => p.seqId === focus);
      const selected = picked.has(tag.spec.id);
      tag.priority = (tag.hovered ? 4 : 0) + (holds ? 2 : 0) + (selected ? 1 : 0);
      /* Pointing at a tag puts its pass in focus (the chip's pointerenter), so a tag
       * under the pointer already holds the focus; `hovered` is for where it is placed. */
      this.setTagOpen(tag, holds || (selected && tag.spec.passes.length > 1));
      tag.node.classList.toggle('sel', selected);
      tag.node.classList.toggle('dim', focus != null && !holds && !near.has(tag.spec.id) && !selected);
      for (const chip of tag.chips) {
        chip.classList.toggle('on', chip.dataset.seq === focus || (focus == null && selected && chip === tag.main));
      }
    }
  }

  /*
   * WARNINGS ON THE PIECE. Every rule a track breaks names a piece (warnings.js
   * gives each one an elementId or a seqId), so a small mark sits by it and the
   * sentence is one hover away. A click selects the piece, and its card says it
   * again in words, which is also how a screen with no hover reads it. Only real
   * warnings are marked: the notes the lap bar does not count are not. It is
   * rebuilt when the host's list of warnings is a new list (every edit and every
   * step of a drag makes one), never per frame.
   */
  syncBadges() {
    for (const b of this.badges) {
      b.node.remove();
    }
    this.badges = [];
    this.badgeSource = this.host.warnings;
    this.hideBadgeTip();
    const doc = this.host.doc;
    const by = new Map();
    for (const w of this.host.warnings ?? []) {
      if (w.level !== 'warn') {
        continue;
      }
      const own = w.elementId ?? (w.seqId ? doc.sequence.find((q) => q.id === w.seqId)?.elementId : null);
      for (const id of new Set([own, ...(w.also ?? [])])) {
        if (id && elementById(doc, id)) {
          by.set(id, [...(by.get(id) ?? []), w.message]);
        }
      }
    }
    const numbered = new Set(this.bubbleSpecs.map((b) => b.id));
    for (const [id, messages] of by) {
      const node = document.createElement('button');
      node.type = 'button';
      node.className = 'tb-warnbadge';
      node.textContent = '!';
      node.setAttribute('aria-label', messages.join(' '));
      node.addEventListener('pointerenter', () => this.showBadgeTip(node, messages));
      node.addEventListener('pointerleave', () => this.hideBadgeTip());
      node.addEventListener('focus', () => this.showBadgeTip(node, messages));
      node.addEventListener('blur', () => this.hideBadgeTip());
      node.addEventListener('click', () => this.host.setSelection([id]));
      this.overlay.append(node);
      /* A numbered piece has its number over the top of it, so the mark goes
       * beside the number; a pole has nothing there. */
      /* A tag grows to the right of its anchor, so the mark beside it is the same
       * distance to the left whatever the tag says. */
      const beside = -(11 + node.offsetWidth / 2 + 4);
      this.badges.push({ node, id, dx: numbered.has(id) ? beside : 0 });
    }
  }

  showBadgeTip(node, messages) {
    if (!this.badgeTip) {
      this.badgeTip = document.createElement('div');
      this.badgeTip.className = 'tb-warn-tip';
      this.badgeTip.setAttribute('role', 'tooltip');
      this.overlay.append(this.badgeTip);
    }
    const tip = this.badgeTip;
    tip.replaceChildren(...messages.map((m) => {
      const p = document.createElement('p');
      p.textContent = m;
      return p;
    }));
    tip.hidden = false;
    const over = this.overlay.getBoundingClientRect();
    const at = node.getBoundingClientRect();
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    const x = Math.max(6, Math.min(over.width - w - 6, at.left - over.left + at.width / 2 - w / 2));
    const above = at.top - over.top - h - 8;
    const y = above >= 6 ? above : at.bottom - over.top + 8;
    tip.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px)`;
  }

  hideBadgeTip() {
    if (this.badgeTip) {
      this.badgeTip.hidden = true;
    }
  }

  renumberInline(node, pass) {
    const saved = [...node.childNodes];
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '1';
    input.value = String(pass.number);
    input.className = 'tb-bubble-input';
    input.setAttribute('aria-label', 'Place in the flying order');
    node.classList.add('editing');
    node.replaceChildren(input);
    input.focus();
    input.select();
    let done = false;
    const finish = (commit) => {
      if (done) {
        return;
      }
      done = true;
      if (commit && input.value !== '' && Number(input.value) !== pass.number) {
        this.host.renumber(pass.seqId, input.value);
      } else {
        node.classList.remove('editing');
        node.replaceChildren(...saved);
      }
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        finish(true);
      } else if (e.key === 'Escape') {
        finish(false);
      }
    });
    input.addEventListener('blur', () => finish(true));
  }

  /* Put every piece of HTML where the frame just drawn says it goes. One
   * projection set up once, then one point at a time. */
  placeOverlay() {
    const room = this.host.buildsIn3D();
    this.overlay.hidden = !room || !this.enabled;
    if (this.overlay.hidden) {
      return;
    }
    /* With a tool in the hand a press is for the tool: the numbers and marks let it
     * through, so a click meant for a piece is not taken by the tag on top of it, and
     * a finger is not moved on to the nearest button (index.html, .tb-overlay.armed). */
    this.overlay.classList.toggle('armed', Boolean(this.host.armed));
    const rect = this.canvas.getBoundingClientRect();
    this.camera.updateMatrixWorld(true);
    this.root.updateMatrixWorld(true);
    const v = new THREE.Vector3();
    const project = (p) => {
      v.set(p.x, p.y, p.z ?? 0);
      this.root.localToWorld(v);
      v.project(this.camera);
      if (v.z < -1 || v.z > 1) {
        return null;
      }
      return { x: ((v.x + 1) / 2) * rect.width, y: ((1 - v.y) / 2) * rect.height };
    };
    const doc = this.host.doc;
    if (this.badgeSource !== this.host.warnings) {
      this.syncBadges();
    }
    /*
     * The tags first, spread apart where two would lie on one another (spreadTags in
     * passes.js), and then the marks beside them, which go with the tag of their
     * piece. Every width is read before anything is written, so the frame costs one
     * layout and not one for each tag.
     */
    for (const b of this.bubbles) {
      if (b.w == null) {
        b.w = b.node.offsetWidth || 22;
        b.h = b.node.offsetHeight || 22;
        b.half = (b.main.offsetHeight || 22) / 2;
      }
    }
    const boxes = [];
    for (const b of this.bubbles) {
      const el = elementById(doc, b.spec.id);
      b.at = el ? project({ x: el.position.x + (b.spec.dx ?? 0), y: el.position.y + (b.spec.dy ?? 0), z: el.position.z + b.spec.dz }) : null;
      if (b.at) {
        boxes.push({ key: b.spec.key, x: b.at.x - b.half, y: b.at.y - b.half, w: b.w, h: b.h, priority: b.priority ?? 0, prev: b.off });
      }
    }
    const spread = spreadTags(boxes, 3);
    const moved = new Map();
    for (const b of this.bubbles) {
      b.node.style.display = b.at ? '' : 'none';
      if (b.at) {
        b.off = spread.get(b.spec.key) ?? { dx: 0, dy: 0 };
        b.node.style.transform = `translate(${(b.at.x + b.off.dx).toFixed(1)}px, ${(b.at.y + b.off.dy).toFixed(1)}px)`;
        if (!moved.has(b.spec.id)) {
          moved.set(b.spec.id, b.off);
        }
      }
    }
    for (const b of this.badges) {
      const el = elementById(doc, b.id);
      const at = el ? project({ x: el.position.x, y: el.position.y, z: topOf(el) + 0.1 }) : null;
      b.node.style.display = at ? '' : 'none';
      if (at) {
        const off = moved.get(b.id) ?? { dx: 0, dy: 0 };
        b.node.style.transform = `translate(${(at.x + b.dx + off.dx).toFixed(1)}px, ${(at.y - 2 + off.dy).toFixed(1)}px)`;
      }
    }
    this.host.placeCard?.(project, rect);
    if (this.ruler && this.rulerNode) {
      const mid = project({ x: (this.ruler.a.x + this.ruler.b.x) / 2, y: (this.ruler.a.y + this.ruler.b.y) / 2, z: 0.02 });
      this.rulerNode.style.display = mid ? '' : 'none';
      if (mid) {
        this.rulerNode.style.transform = `translate(${mid.x.toFixed(1)}px, ${mid.y.toFixed(1)}px)`;
      }
    }
    this.measures.forEach((m, i) => {
      const n = this.measureNodes[i];
      const at = n ? project({ x: (m.from.x + m.to.x) / 2, y: (m.from.y + m.to.y) / 2, z: (m.from.z + m.to.z) / 2 }) : null;
      if (n) {
        n.style.display = at ? '' : 'none';
        if (at) {
          n.style.transform = `translate(${at.x.toFixed(1)}px, ${at.y.toFixed(1)}px)`;
        }
      }
    });
  }

  register(mesh, el) {
    mesh.userData.elementId = el.id;
    this.pickables.push(mesh);
  }

  /* ---------------- freestyle ---------------- */

  /*
   * The freestyle scene, made once CEL has arrived: the town's four lights,
   * its sky and distant hills, its fog, and its post pipeline, set up the
   * way src/props/gallery.js and the built map set them up. Its root takes
   * the same one conversion as the race scene's, so everything under it is
   * in document coordinates like everything else in this file.
   */
  ensureFreestyle() {
    if (this.fs || !CEL || !this.renderer) {
      return this.fs;
    }
    const { PAL } = CEL;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(PAL.fog);
    scene.fog = new THREE.Fog(PAL.fog, 60, 420);
    /* THE ONE CONVERSION, again. Document space is Z up; Three.js is Y up. */
    const root = new THREE.Group();
    root.rotation.x = -Math.PI / 2;
    scene.add(root);

    const sun = new THREE.DirectionalLight(PAL.sun, 2.25);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.035;
    const fill = new THREE.DirectionalLight(PAL.fill, 1.08);
    const bounce = new THREE.DirectionalLight(0xd8cbe8, 0.34);
    scene.add(sun, sun.target, fill, fill.target, bounce, bounce.target);
    const hemi = new THREE.HemisphereLight(PAL.hemiSky, PAL.hemiGround, 1.12);
    scene.add(hemi);
    const sky = CEL.buildSky(scene, SKY_R);
    const hills = CEL.buildDistantHills(scene);
    /* Which ridge each flat is, from the colour the town built it in, so a
     * time of day can repaint it (seatScene). */
    hills.traverse((o) => {
      if (o.isMesh) {
        o.userData.tone = o.material.color.getHex() === PAL.hillFar ? 'far' : 'near';
      }
    });

    const Pipeline = previewPipelineClass();
    this.fs = {
      scene,
      root,
      sun,
      fill,
      bounce,
      hemi,
      sky,
      hills,
      pipeline: new Pipeline(this.renderer, scene, this.camera, { pixelBudget: 2.6e6 }),
      /* One kit for every asset: finish() hands its batches over and
       * starts empty again. Made again with the time's look when the
       * map's time of day changes (seatScene). */
      kit: new CEL.PropKit(),
      /* The time of day the scene is lit for, '' until the first seat. */
      time: '',
      ground: null,
      groundKey: '',
      sizedFor: '',
      halfDiag: 1,
    };
    return this.fs;
  }

  /*
   * THE MAP'S SCENE: its time of day, lit and painted from the same table
   * the simulator paints from (src/maps/built/looks.js), so the preview's
   * dusk is the game's. The lights' colours, the sky, the fog, the ridges
   * and the grade follow at once. The assets are drawn again in the time's
   * look, since at dusk the kit dims their glass and lights their windows,
   * so the kept drawings are all let go and the kit made anew. Where the
   * lights stand is seatFreestyleGround's, which follows the time too.
   */
  seatScene(doc) {
    const fs = this.fs;
    const L = CEL.looks;
    const { time: T, timeId } = L.lookOf(doc);
    if (fs.time === timeId) {
      return;
    }
    L.paintLights(fs, T);
    L.paintSky(fs.sky, T);
    L.paintPost(fs.pipeline, T);
    fs.scene.background.set(T.fog.color);
    fs.scene.fog.color.set(T.fog.color);
    /* The ridges' materials are the toon kit's cached flats, shared by
     * colour, so each is swapped for the flat of its new colour rather
     * than repainted. */
    fs.hills.traverse((o) => {
      if (o.isMesh) {
        o.material = CEL.flat({ color: T.hills[o.userData.tone], fog: false });
      }
    });
    this.sweepAssets(null);
    fs.kit = new CEL.PropKit(L.kitLook(timeId));
    fs.time = timeId;
  }

  /*
   * The plot, the land round it, the grid, and the lights seated on the
   * plot. Rebuilt only when the field, the ground or the time of day
   * changes, since none of it depends on anything else in the document.
   *
   * The plot is the map's ground in its one flat colour (the town's paving
   * colour, concreteMid, for concrete, which is what the built map's yard
   * is painted round) and the land past it is the ground's terrain colour,
   * for concrete the one the gallery stands on. Flat colour rather than
   * the map's painted slabs or bays: the grid is what gives the preview
   * its scale, and a second pattern under it would fight it.
   */
  seatFreestyleGround(doc) {
    const fs = this.fs;
    const f = doc.field;
    const step = gridStep(f);
    const { time: T, ground: G, timeId, groundId } = CEL.looks.lookOf(doc);
    const key = `${f.width}|${f.depth}|${step}|${timeId}|${groundId}`;
    if (fs.groundKey === key) {
      return;
    }
    if (fs.ground) {
      fs.ground.traverse((o) => {
        o.geometry?.dispose();
        /* The cel materials are the toon kit's cache, shared with the
         * assets; only the line materials are this view's own. */
        if (o.isLine) {
          o.material.dispose();
        }
      });
      fs.ground.removeFromParent();
    }
    const W = f.width;
    const D = f.depth;
    const g = new THREE.Group();

    const plot = new THREE.Mesh(
      new THREE.PlaneGeometry(W, D),
      CEL.cel({ color: G.plot, bands: 3, tint: G.tint }),
    );
    /* A centimetre down, where the race preview's ground is, because the
     * ground paint buildGroundLogo draws for both sits 4 to 8 mm up on the
     * assumption that the ground is there. */
    plot.position.set(W / 2, D / 2, -0.01);
    plot.receiveShadow = true;
    g.add(plot);

    /* Twelve centimetres under the plot, where the built map's kerb would
     * be, so the two planes cannot fight for the depth buffer at 300 m. Six
     * kilometres across, so its edge is always past the fog's. */
    const LAND = 6000;
    const land = new THREE.Mesh(
      new THREE.PlaneGeometry(LAND, LAND),
      CEL.cel({ color: new THREE.Color(G.terrain.base).getHex(), bands: 3, tint: 0x7a7396 }),
    );
    land.position.set(W / 2, D / 2, -0.12);
    land.receiveShadow = true;
    g.add(land);

    /* The grid, faint, in the town's ink, and the plot's edge stronger.
     * Neither writes depth, so the ink pass draws no line along them. */
    const pts = [];
    for (let x = 0; x <= W + 1e-6; x += step) {
      pts.push(x, 0, 0.03, x, D, 0.03);
    }
    for (let y = 0; y <= D + 1e-6; y += step) {
      pts.push(0, y, 0.03, W, y, 0.03);
    }
    const gridGeo = new THREE.BufferGeometry();
    gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    g.add(new THREE.LineSegments(gridGeo, new THREE.LineBasicMaterial({
      color: CEL.PAL.ink, transparent: true, opacity: 0.14, depthWrite: false,
    })));
    const edgeGeo = new THREE.BufferGeometry();
    edgeGeo.setAttribute('position', new THREE.Float32BufferAttribute([
      0, 0, 0.04, W, 0, 0.04, W, D, 0.04, 0, D, 0.04,
    ], 3));
    g.add(new THREE.LineLoop(edgeGeo, new THREE.LineBasicMaterial({
      color: CEL.PAL.ink, transparent: true, opacity: 0.55, depthWrite: false,
    })));
    fs.root.add(g);
    fs.ground = g;
    fs.groundKey = key;

    /*
     * The lights, seated on the plot's middle in the scene's own Y up
     * frame (document (W/2, D/2, 0) is scene (W/2, 0, -D/2)), from the
     * town's directions. The sun is pushed back along its own direction and
     * its shadow box sized to the plot, because the town's box is sized for
     * a walker who sees 23 m of ground and this one has to hold a 160 m
     * plot from above.
     */
    const centre = new THREE.Vector3(W / 2, 0, -D / 2);
    const halfDiag = 0.5 * Math.hypot(W, D);
    fs.halfDiag = halfDiag;
    const seat = (light, offset) => {
      light.target.position.copy(centre);
      light.position.copy(centre).add(offset);
      light.target.updateMatrixWorld();
    };
    const SUN_BACK = 260;
    seat(fs.sun, new THREE.Vector3(...T.sun.at).normalize().multiplyScalar(SUN_BACK));
    seat(fs.fill, new THREE.Vector3(...T.fill.at));
    seat(fs.bounce, new THREE.Vector3(...T.bounce.at));
    const half = halfDiag + 12;
    Object.assign(fs.sun.shadow.camera, {
      left: -half, right: half, top: half, bottom: -half, near: 1, far: SUN_BACK + halfDiag + 120,
    });
    fs.sun.shadow.camera.updateProjectionMatrix();
    fs.hills.position.copy(centre);
  }

  /*
   * Build a freestyle map. The race preview's banner kit, flying order
   * numbers, racing line and guide paint are not drawn: a map has none of
   * them. Without CEL the map is drawn into the race preview's scene, on its
   * ground, with each asset as its plain solids.
   */
  buildFreestyle() {
    const doc = this.host.doc;
    const fs = this.ensureFreestyle();
    const g = new THREE.Group();
    this.pickables = [];
    this.gapLabels = [];
    /* What the room's gestures find again: each piece's drawing by id, so a drag slides it without a rebuild
     * (movePieces), and none of a track's panes or numbers, which a map has not. */
    this.groups = new Map();
    this.panes = new Map();
    this.bubbleSpecs = [];
    this.drawnSquares = new Set();
    this.ring = null;
    this.hoverBox = null;
    if (fs) {
      this.seatScene(doc);
      this.seatFreestyleGround(doc);
    } else {
      g.add(this.fieldGround(doc));
      g.add(this.gridLines(doc));
    }
    const used = new Set();
    /* The ring at the foot of the one piece that is selected. */
    const picked = [...this.host.selection];
    const ringFor = picked.length === 1 ? elementById(doc, picked[0]) : null;
    for (const el of doc.elements) {
      let node = this.buildFreestyleElement(el, used);
      if (node && ringFor && ringFor.id === el.id && this.ringed(el)) {
        node = this.withRing(node, el);
      }
      if (node) {
        g.add(node);
        this.groups.set(el.id, node);
      }
    }
    if (fs) {
      /* Labels sit over the drawing and are not part of it: no depth, so
       * the ink does not box them, and no fog, so a far one still reads. */
      g.traverse((o) => {
        if (o.isSprite) {
          o.material.depthWrite = false;
          o.material.fog = false;
          o.renderOrder = 10;
        }
      });
    }
    /* A road has no drawing of its own to mark (the traffic is drawn all together), so a selected road has its
     * line and its handles, and a selected car its box. */
    this.handles = null;
    const roadKind = ringFor ? ELEMENTS[ringFor.type]?.kind : null;
    if (roadKind === KIND.ROAD) {
      g.add(this.buildRoadHandles(ringFor));
    } else if (roadKind === KIND.VEHICLE) {
      g.add(this.buildCarOutline(ringFor));
    }
    this.sweepAssets(used);
    this.content = g;
    (fs ? fs.root : this.root).add(g);
    this.buildTraffic(doc);
    this.faceSig = this.signature();
    this.applyHover();
    /* A track's numbers are HTML over the canvas and a map has none, so any a track left are taken away. */
    this.syncBubbles();
  }

  /* ---------------- roads and cars, in the room ---------------- */

  /*
   * A SELECTED ROAD: the line it is laid along in amber, a handle on each node and a knob between each pair, on
   * the ground (z a hand above it, drawn without a depth test so a handle is never lost in the kerb). A node is
   * pulled, a knob is pulled to put a new node in, as on the plan. The handles are unit spheres whose size is
   * set a frame at a time to a few pixels (fitHandles), so they are as big on the screen at six hundred metres
   * as at ten. The picked node is lit.
   */
  buildRoadHandles(road) {
    const group = new THREE.Group();
    const nodes = absNodes(road);
    const active = this.host.activeNode;
    const line = new THREE.Line(
      new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(
        [...nodes, ...(road.closed === true ? [nodes[0]] : [])].flatMap((p) => (p ? [p.x, p.y, 0.15] : [])), 3)),
      new THREE.LineBasicMaterial({ color: COL.frameSel, transparent: true, opacity: 0.7, depthTest: false, fog: false }),
    );
    line.renderOrder = 11;
    group.add(line);
    const sphere = new THREE.SphereGeometry(1, 14, 10);
    const handles = [];
    const make = (x, y, px, colour, userData) => {
      const m = new THREE.Mesh(sphere, new THREE.MeshBasicMaterial({ color: colour, depthTest: false, fog: false }));
      m.position.set(x, y, 0.2);
      m.renderOrder = 12;
      m.userData = { ...userData, elementId: road.id, px };
      this.pickables.push(m);
      group.add(m);
      handles.push(m);
    };
    for (const k of legMidpoints(road)) {
      make(k.x, k.y, 5, 0xffe9a8, { leg: k.leg });
    }
    nodes.forEach((p, i) => {
      const on = active && active.id === road.id && active.index === i;
      make(p.x, p.y, i === 0 ? 8.5 : 7, on ? COL.frameSel : 0xffffff, { node: i });
    });
    this.handles = { group, handles, centre: nodes[0] ?? { x: 0, y: 0 } };
    return group;
  }

  /* The handles' size: so many pixels, at wherever they are. Called on every frame the room draws. */
  fitHandles() {
    const hs = this.handles;
    if (!hs || !hs.group.parent) {
      return;
    }
    for (const m of hs.handles) {
      m.scale.setScalar(m.userData.px * this.metresPerPixel({ x: m.position.x, y: m.position.y, z: 0 }));
    }
  }

  /* A SELECTED CAR: a box of amber lines round where it starts, the length and width it is drawn. */
  buildCarOutline(car) {
    const group = new THREE.Group();
    const at = vehiclePlace(this.host.doc, car);
    const c = footprint(at);
    const pts = [];
    const top = 1.7;
    for (let i = 0; i < 4; i += 1) {
      const a = c[i];
      const b = c[(i + 1) % 4];
      pts.push(a.x, a.y, 0.05, b.x, b.y, 0.05, a.x, a.y, top, b.x, b.y, top, a.x, a.y, 0.05, a.x, a.y, top);
    }
    const lines = new THREE.LineSegments(
      new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)),
      new THREE.LineBasicMaterial({ color: COL.frameSel, depthTest: false, fog: false }),
    );
    lines.renderOrder = 11;
    group.add(lines);
    return group;
  }

  /*
   * THE ROAD BEING LAID: the nodes so far as dots, the line through them, and a rubber band to where the next
   * would go, which is the snapped point under the pointer (setDraftPointer). The nodes are the host's
   * (roadDraft), so it follows the draft however the draft changes; only the pointer is the view's.
   */
  setDraftPointer(p) {
    const key = p ? `${p.x.toFixed(3)},${p.y.toFixed(3)}` : '';
    if (key !== this.draftPointerKey) {
      this.draftPointerKey = key;
      this.draftPointer = p ? { x: p.x, y: p.y } : null;
      this.host.requestDraw();
    }
  }

  syncDraft() {
    const nodes = this.host.roadDraft ?? [];
    const at = this.host.armed === 'road' ? this.draftPointer : null;
    const mpp = nodes.length || at ? this.metresPerPixel(nodes[0] ?? at) : 0;
    const key = `${nodes.map((n) => `${n.x},${n.y}`).join(';')}|${at ? `${at.x},${at.y}` : ''}|${mpp.toFixed(2)}`;
    if (key === this.draftKey) {
      return;
    }
    this.draftKey = key;
    if (this.draftGroup) {
      this.freeGroup(this.draftGroup);
      this.draftGroup = null;
    }
    if (!nodes.length && !at) {
      return;
    }
    const group = new THREE.Group();
    nodes.forEach((p, i) => {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(mpp * (i === 0 ? 8.5 : 6.5), 12, 8),
        new THREE.MeshBasicMaterial({ color: i === 0 ? 0xffffff : COL.frameSel, depthTest: false, fog: false }),
      );
      m.position.set(p.x, p.y, 0.2);
      m.renderOrder = 12;
      group.add(m);
    });
    const path = [...nodes, ...(at ? [at] : [])];
    if (path.length > 1) {
      const line = new THREE.Line(
        new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(path.flatMap((p) => [p.x, p.y, 0.15]), 3)),
        new THREE.LineBasicMaterial({ color: COL.frameSel, transparent: true, opacity: 0.85, depthTest: false, fog: false }),
      );
      line.renderOrder = 11;
      group.add(line);
    }
    if (at) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(mpp * 5, mpp * 7, 24),
        new THREE.MeshBasicMaterial({ color: COL.entry, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthTest: false, fog: false }),
      );
      ring.position.set(at.x, at.y, 0.2);
      ring.renderOrder = 12;
      group.add(ring);
    }
    this.draftGroup = group;
    this.stage().add(group);
  }

  /*
   * THE CAR ABOUT TO BE DROPPED: its footprint on the road nearest the pointer, in mint, with its nose marked,
   * `ghost` being { place } from the host (carGhostAt), or null for no road near enough.
   */
  setCarGhost(ghost) {
    const key = ghost ? `${ghost.x.toFixed(3)},${ghost.y.toFixed(3)},${ghost.tx.toFixed(3)},${ghost.ty.toFixed(3)}` : '';
    if (key === this.carGhostKey) {
      return;
    }
    this.carGhostKey = key;
    if (this.carGhostGroup) {
      this.freeGroup(this.carGhostGroup);
      this.carGhostGroup = null;
    }
    if (ghost) {
      const c = footprint(ghost);
      const group = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.ShapeGeometry(new THREE.Shape(c.map((p) => new THREE.Vector2(p.x, p.y)))),
        new THREE.MeshBasicMaterial({ color: COL.entry, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthTest: false, fog: false }),
      );
      body.position.z = 0.25;
      body.renderOrder = 12;
      group.add(body);
      const nose = [ghost.x, ghost.y, ghost.x + ghost.tx * ghost.length, ghost.y + ghost.ty * ghost.length];
      const arrow = new THREE.Line(
        new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([nose[0], nose[1], 0.3, nose[2], nose[3], 0.3], 3)),
        new THREE.LineBasicMaterial({ color: COL.entry, depthTest: false, fog: false }),
      );
      arrow.renderOrder = 12;
      group.add(arrow);
      this.carGhostGroup = group;
      this.stage().add(group);
    }
    this.host.requestDraw();
  }

  /* ---------------- the ring, on a map ---------------- */

  /* Whether a piece has a heading to turn by the ring: all but a road (turned by its nodes), a car (by its
   * road) and a label. */
  ringed(el) {
    const kind = ELEMENTS[el.type]?.kind;
    return kind != null && ![KIND.ROAD, KIND.VEHICLE, KIND.ANNOTATION].includes(kind);
  }

  /*
   * A PIECE WITH ITS RING: the drawing and the ring at its foot in one node, at the piece's place, so a drag
   * that slides the node (movePieces) takes the ring along. The drawing is turned by the heading it is
   * placed at, and the ring is not, because its knob is where the heading points.
   */
  withRing(node, el) {
    const wrap = new THREE.Group();
    wrap.position.copy(node.position);
    node.position.set(0, 0, 0);
    wrap.add(node);
    /* Its parts are made when the camera is known, on the frame that draws it: see fitRing. */
    this.ring = { id: el.id, wrap, parts: null, mpp: 0 };
    return wrap;
  }

  /* Metres of the ground one pixel of the screen covers at a document point: how big a thing has to be to
   * be seen, and how wide to be taken, at the distance the camera is. */
  metresPerPixel(p) {
    const v = new THREE.Vector3(p.x, p.y, p.z ?? 0);
    this.root.updateMatrixWorld(true);
    this.root.localToWorld(v);
    const d = v.distanceTo(this.camera.position);
    return (2 * d * Math.tan((FOV_DEG * Math.PI) / 360)) / Math.max(1, this.viewH);
  }

  /*
   * THE RING AT A SELECTED PIECE'S FOOT, the size of the ground it stands on and never smaller than a
   * fingertip. A gate is a metre across and a building twenty six, and both are looked at from anywhere
   * between two metres and six hundred, so a ring drawn at world sizes is a hairline on one and a hoop
   * on another. Its line, its knob and the band that is taken are a few pixels wide, and its radius is the
   * piece's reach (planShapeOf, the plan's own footprint) or a hand's span, whichever is more; they are
   * made again when the camera has come in or out by a fifth, never every frame.
   */
  fitRing(force = false) {
    const ring = this.ring;
    if (!ring || !ring.wrap.parent) {
      return;
    }
    const doc = this.host.doc;
    const el = elementById(doc, ring.id);
    if (!el) {
      return;
    }
    const mpp = this.metresPerPixel({ x: el.position.x, y: el.position.y, z: el.position.z });
    if (!force && ring.mpp && Math.abs(mpp / ring.mpp - 1) < 0.2) {
      return;
    }
    ring.mpp = mpp;
    if (ring.parts) {
      for (const m of ring.parts.userData.meshes) {
        const at = this.pickables.indexOf(m);
        if (at >= 0) {
          this.pickables.splice(at, 1);
        }
      }
      this.freeGroup(ring.parts);
    }
    let reach = 0;
    for (const q of planShapeOf(el, doc)) {
      reach = Math.max(reach, Math.hypot(q.x - el.position.x, q.y - el.position.y));
    }
    const r = Math.max(reach + scaleOf(doc).ring.pad, 26 * mpp);
    const line = Math.max(1.5 * mpp, 0.01);
    const parts = new THREE.Group();
    parts.userData.meshes = [];
    const band = new THREE.Mesh(
      new THREE.RingGeometry(r - line, r + line, 96),
      new THREE.MeshBasicMaterial({ color: COL.frameSel, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthTest: false, depthWrite: false, fog: false }),
    );
    band.position.z = 0.006;
    band.renderOrder = 12;
    parts.add(band);
    const grab = new THREE.Mesh(
      new THREE.RingGeometry(r - 9 * mpp, r + 9 * mpp, 96),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, fog: false }),
    );
    grab.position.z = 0.008;
    grab.userData.ring = true;
    this.register(grab, el);
    parts.userData.meshes.push(grab);
    parts.add(grab);
    const def = ELEMENTS[el.type];
    const yaw = FS ? FS.placedYaw(def?.turns ?? FS.assetOf(el)?.turns ?? 'any', el.yaw) : el.yaw;
    const knob = new THREE.Mesh(
      new THREE.SphereGeometry(6 * mpp, 14, 10),
      new THREE.MeshBasicMaterial({ color: COL.frameSel, depthTest: false, fog: false }),
    );
    knob.position.set(Math.cos(yaw) * r, Math.sin(yaw) * r, 6 * mpp);
    knob.userData.ring = true;
    knob.renderOrder = 12;
    this.register(knob, el);
    parts.userData.meshes.push(knob);
    parts.add(knob);
    ring.wrap.add(parts);
    ring.parts = parts;
  }

  buildFreestyleElement(el, used) {
    const def = ELEMENTS[el.type];
    if (!def) {
      return null;
    }
    const selected = this.host.selection.has(el.id);
    if (def.kind === KIND.ZONE) {
      return this.buildGap(el, selected);
    }
    if (el.type === 'balloonChase') {
      return this.buildBalloonChase(el, selected);
    }
    if (def.kind === KIND.ROAD || def.kind === KIND.VEHICLE) {
      /* Drawn all together by buildTraffic, the way the simulator draws
       * them, not one element at a time. */
      return null;
    }
    const asset = FS ? FS.assetOf(el) : null;
    if (!asset && def.kind === KIND.STRUCTURE) {
      /* The asset library did not load, and there is nothing honest to
       * draw a building as without it. */
      return null;
    }
    if (!asset || def.kind === KIND.DECAL) {
      /* Paint on the ground, a label, a waypoint: drawn as the race preview
       * draws them, with no flying order to number them by. */
      return this.buildElement(el, []);
    }
    return this.buildAsset(el, def, asset, selected, used);
  }

  /*
   * One asset, drawn by the props kit, in a holder at the element's place.
   *
   * THE ONE EXTRA FRAME CHANGE IN THE BUILDER. The kit draws every asset in
   * its own Y up frame (src/props: +x its heading, +y up, +z its right),
   * and this file is in the document's Z up frame. So the holder stands at
   * the element's document position, turned about document z by the
   * heading the asset is placed at, and inside it a child turned +90
   * degrees about x takes local up onto document z and local +z onto
   * document -y. Composed with the root's -90 about x the two cancel, and
   * the asset reaches the scene exactly as src/maps/built/place.js puts it
   * in the world: turned about +y by the same heading, from the same
   * placedYaw, so a building the document holds at 40 degrees is drawn
   * here at the quarter turn it will be flown at.
   */
  buildAsset(el, def, asset, selected, used) {
    const holder = new THREE.Group();
    holder.position.set(el.position.x, el.position.y, el.position.z);
    holder.rotation.z = FS.placedYaw(def.turns ?? asset.turns ?? 'any', el.yaw);
    const local = new THREE.Group();
    local.rotation.x = Math.PI / 2;
    holder.add(local);
    const art = this.fs ? this.assetArt(el, used) : null;
    if (art) {
      local.add(art.group);
      for (const m of art.meshes) {
        this.register(m, el);
      }
      if (selected) {
        local.add(selectionBox(art.box));
      }
    } else {
      local.add(this.plainAsset(el, selected));
    }
    if (def.kind === KIND.START) {
      /* Which way the pilot will face, along the holder's heading. */
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.05, 3, 0, 0.05], 3));
      holder.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: COL.start })));
    }
    return holder;
  }

  /*
   * An asset's drawing, from the cache or made now. Each element gets a kit
   * pass of its own, kit.begin(0, 0, 0, 0) at the local origin, so its
   * batches hold nothing but it: that is what lets the drawing be kept while
   * its neighbours change, and what lets every mesh in it carry its id.
   */
  assetArt(el, used) {
    const key = assetKey(el);
    used.add(key);
    const cached = this.assets.get(key);
    if (cached) {
      return cached.group ? cached : null;
    }
    const kit = this.fs.kit;
    let group;
    let parts;
    try {
      kit.begin(0, 0, 0, 0);
      parts = kit.element(el);
      group = kit.finish();
    } catch (e) {
      /* One asset whose paint throws must not take the preview down. It is
       * drawn as its solids, and remembered as broken so an edit elsewhere
       * does not throw it again. A kit that threw part way through may hold
       * half an element's batches, so it is replaced. */
      console.error(`3D preview: the ${el.type} asset could not be drawn`, e);
      this.fs.kit = new CEL.PropKit(CEL.looks.kitLook(this.fs.time));
      this.assets.set(key, { group: null });
      return null;
    }
    const meshes = [];
    const box = new THREE.Box3();
    group.traverse((o) => {
      if (o.isMesh) {
        meshes.push(o);
        if (!o.geometry.boundingBox) {
          o.geometry.computeBoundingBox();
        }
        box.union(o.geometry.boundingBox);
      }
    });
    /* After the bounds, so the selection box is round what is drawn. */
    const proxy = pickProxy(parts);
    if (proxy) {
      group.add(proxy);
      meshes.push(proxy);
    }
    const art = { group, meshes, box };
    this.assets.set(key, art);
    return art;
  }

  /*
   * Free every kept drawing not in `used` (all of them for null). The kit
   * baked each batch into a geometry of its own, so the geometry is this
   * view's to free; the materials are the kit's and the toon kit's, shared
   * by every asset, and are never freed here.
   */
  sweepAssets(used) {
    for (const [key, art] of this.assets) {
      if (used && used.has(key)) {
        continue;
      }
      if (art.group) {
        art.group.removeFromParent();
        for (const m of art.meshes) {
          m.geometry.dispose();
        }
      }
      this.assets.delete(key);
    }
  }

  /*
   * An asset as its plain parts, in the kit's Y up local frame: every box
   * and capsule its layout makes, drawn or solid, in the race preview's
   * frame colour. What the preview shows when the cel kit could not load,
   * or when one asset's paint threw.
   */
  plainAsset(el, selected, ghost = false) {
    const g = new THREE.Group();
    let parts;
    try {
      /* As it stands, stood on end if it is: this is what is drawn when the
       * kit is not, so it has to be where the solids are. */
      parts = FS.placedPartsOf(el);
    } catch (e) {
      console.error(`3D preview: the ${el.type} asset has no layout`, e);
      return g;
    }
    /* A ghost is what the physics will hold and nothing it only draws, in mint, see-through, writing no depth. */
    if (ghost && parts.some((p) => p.solid)) {
      parts = parts.filter((p) => p.solid);
    }
    const mat = ghost
      ? new THREE.MeshBasicMaterial({ color: COL.entry, transparent: true, opacity: 0.2, depthWrite: false, fog: false })
      : new THREE.MeshLambertMaterial({ color: selected ? COL.frameSel : COL.frame });
    const edgeMat = ghost
      ? new THREE.LineBasicMaterial({ color: COL.entry, transparent: true, opacity: 0.85, depthWrite: false, fog: false })
      : null;
    const up = new THREE.Vector3(0, 1, 0);
    for (const p of parts) {
      if (!p.draw && !p.solid) {
        continue;
      }
      let mesh;
      if (p.t === 'box') {
        const geo = new THREE.BoxGeometry(
          Math.max(0.01, p.hi[0] - p.lo[0]),
          Math.max(0.01, p.hi[1] - p.lo[1]),
          Math.max(0.01, p.hi[2] - p.lo[2]),
        );
        mesh = new THREE.Mesh(geo, mat);
        mesh.position.set((p.lo[0] + p.hi[0]) / 2, (p.lo[1] + p.hi[1]) / 2, (p.lo[2] + p.hi[2]) / 2);
        if (edgeMat) {
          mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat));
        }
      } else {
        const a = new THREE.Vector3(p.a[0], p.a[1], p.a[2]);
        const b = new THREE.Vector3(p.b[0], p.b[1], p.b[2]);
        const len = a.distanceTo(b);
        mesh = new THREE.Mesh(new THREE.CylinderGeometry(p.r, p.r, Math.max(0.01, len), 8), mat);
        mesh.position.copy(a).add(b).multiplyScalar(0.5);
        if (len > 1e-6) {
          mesh.quaternion.setFromUnitVectors(up, b.sub(a).divideScalar(len));
        }
      }
      this.register(mesh, el);
      g.add(mesh);
    }
    return g;
  }

  /*
   * A named gap: a translucent amber window with its name and its points on
   * a label over it. In the holder's frame x is the gap's heading, the way
   * through it, and the window spans y across that and z up from the
   * element's base, which is how schema.md defines it and how
   * src/maps/built/place.js hands it to the scorer. Nothing here is drawn in
   * the sim: this is the author's view of a scoring zone.
   */
  buildGap(el, selected, ghost = false) {
    const w = Math.max(0.2, el.dims.width);
    const h = Math.max(0.2, el.dims.height);
    const holder = new THREE.Group();
    holder.position.set(el.position.x, el.position.y, el.position.z);
    holder.rotation.z = FS ? FS.placedYaw('any', el.yaw) : (el.yaw || 0);

    const pane = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h).rotateY(Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: COL.gap, transparent: true, opacity: selected ? 0.24 : 0.12,
        side: THREE.DoubleSide, depthWrite: false,
      }),
    );
    pane.position.z = h / 2;
    this.register(pane, el);
    holder.add(pane);

    /* The frame lies inside the window's edge, so its outside is the edge
     * the scorer uses and nothing drawn claims air the gap does not. */
    const t = clamp(Math.min(w, h) * 0.03, 0.05, 0.14);
    const frameMat = new THREE.MeshBasicMaterial({
      color: selected ? COL.frameSel : COL.gap, transparent: true, opacity: selected ? 0.95 : 0.62, depthWrite: false,
    });
    const bars = [
      [t, w, t, 0, t / 2],
      [t, w, t, 0, h - t / 2],
      [t, t, h - 2 * t, -(w - t) / 2, h / 2],
      [t, t, h - 2 * t, (w - t) / 2, h / 2],
    ];
    for (const [bx, by, bz, y, z] of bars) {
      if (bz <= 0) {
        continue;
      }
      const bar = new THREE.Mesh(new THREE.BoxGeometry(bx, by, bz), frameMat);
      bar.position.set(0, y, z);
      this.register(bar, el);
      holder.add(bar);
    }
    if (selected) {
      const loop = new THREE.BufferGeometry();
      loop.setAttribute('position', new THREE.Float32BufferAttribute([
        0, -w / 2, 0, 0, w / 2, 0, 0, w / 2, h, 0, -w / 2, h,
      ], 3));
      holder.add(new THREE.LineLoop(loop, new THREE.LineBasicMaterial({ color: COL.frameSel, depthWrite: false })));
    }

    /*
     * The name and the points, sized on screen: a gap is a note to the
     * author rather than a thing in the world, and at the map's opening
     * orbit, 180 m out, a label a metre tall is three pixels. Anchored by
     * its bottom edge, so it sits on the window's top however large it
     * draws. How large, and how faint, is fitGapLabels's, on every frame
     * the view draws. Under the Labels switch, as the race canvas's numbers
     * are; the selected gap keeps its name.
     */
    if ((this.host.labelsVisible === false && !selected) || ghost) {
      return holder;
    }
    const label = textSprite(`${el.name || 'GAP'}  ${el.points ?? ''}`.trim(), 1, '#1d1406', selected ? '#ffd45c' : '#ffb347');
    label.material.sizeAttenuation = false;
    label.userData.aspect = label.scale.x;
    label.userData.selected = selected;
    label.scale.multiplyScalar(GAP_LABEL.cap);
    label.center.set(0.5, 0);
    label.position.z = h + 0.25;
    this.register(label, el);
    holder.add(label);
    if (this.gapLabels) {
      this.gapLabels.push(label);
    }
    return holder;
  }

  /*
   * A balloon chase. Nothing of it stands in the world: the simulator flies
   * a plane round it (src/game/balloons.js), so this, like a named gap's
   * window, is the author's view and is never drawn in the sim. A pad on the
   * ground and a mast to its Height with a balloon on top, which are what a
   * click picks, and a dashed ring at its Radius, the sky the plane flies
   * round. In the document's Z up frame, as the holder is.
   */
  buildBalloonChase(el, selected, ghost = false) {
    const radius = Math.max(1, el.dims.radius || 80);
    const height = Math.max(1, el.dims.height || 14);
    const holder = new THREE.Group();
    holder.position.set(el.position.x, el.position.y, el.position.z);
    const tone = selected ? COL.frameSel : COL.balloon;
    const mat = new THREE.MeshBasicMaterial({
      color: tone, transparent: ghost, opacity: ghost ? 0.55 : 1, depthWrite: !ghost,
    });
    const pad = new THREE.Mesh(new THREE.CircleGeometry(3, 24), new THREE.MeshBasicMaterial({
      color: tone, transparent: true, opacity: selected ? 0.4 : 0.22, depthWrite: false,
    }));
    pad.position.z = 0.06;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, height, 6).rotateX(Math.PI / 2), mat);
    mast.position.z = height / 2;
    const balloon = new THREE.Mesh(new THREE.SphereGeometry(1.1, 14, 10), mat);
    balloon.position.z = height + 1.1;
    for (const m of [pad, mast, balloon]) {
      if (!ghost) {
        this.register(m, el);
      }
      holder.add(m);
    }
    const N = 120;
    const ring = [];
    for (let i = 0; i <= N; i += 1) {
      const a = (i / N) * Math.PI * 2;
      ring.push(Math.cos(a) * radius, Math.sin(a) * radius, 0.1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(ring, 3));
    const line = new THREE.Line(geo, new THREE.LineDashedMaterial({
      color: tone, dashSize: 4, gapSize: 3, transparent: true, opacity: selected ? 0.95 : 0.6, depthWrite: false,
    }));
    line.computeLineDistances();
    holder.add(line);
    return holder;
  }

  /*
   * THE GAP LABELS, FITTED TO THE CAMERA.
   *
   * They were a constant 4.2 percent of the view's height at any range, so
   * close in, on Play or orbiting the yard, each one was a banner wider than
   * the containers and the footbridge it named, and two neighbours printed
   * over each other. Now a label is the size a sign REF_M metres off would
   * be, never larger than CAP of the view and never smaller than MIN of it,
   * and it fades from NEAR_M out to FAR_M, so the far ones step back and
   * the map reads through them. The selected gap is always full size and
   * solid. A handful of sprites, a scale and an opacity each.
   */
  fitGapLabels() {
    const labels = this.gapLabels;
    if (!labels || !labels.length || !this.camera) {
      return;
    }
    const cam = this.camera.position;
    const at = new THREE.Vector3();
    for (const s of labels) {
      s.getWorldPosition(at);
      const d = at.distanceTo(cam);
      const sel = s.userData.selected;
      const k = sel ? GAP_LABEL.cap : GAP_LABEL.cap * clamp(GAP_LABEL.refM / Math.max(d, 1), GAP_LABEL.min, 1);
      s.scale.set(k * s.userData.aspect, k, 1);
      const fade = clamp((d - GAP_LABEL.nearM) / (GAP_LABEL.farM - GAP_LABEL.nearM), 0, 1);
      s.material.opacity = sel ? 1 : 1 - fade * (1 - GAP_LABEL.faintest);
    }
  }

  /* ---------------- roads, cars and Play ---------------- */

  /*
   * A MAP'S ROADS AND CARS, DRAWN BY THE SIMULATOR'S OWN CODE. trafficOf is
   * the one function the physics is handed a map's traffic by, and
   * src/maps/built/roadmesh.js and cars.js draw what it says in the town's
   * cel look, exactly as the built map does in the air, so the preview's
   * road is the flown road and its car the flown car.
   *
   * THE SECOND FRAME CHANGE IN THE BUILDER. Those two draw in the simulator's
   * world frame, Three.js metres with the plot's middle at the origin (the
   * one conversion, src/maps/built/place.js docToWorld: x = docX - W/2, y up,
   * z = -(docY - D/2)), and this file draws in the document's frame under a
   * root turned -90 degrees about x. So they hang in a holder at the plot's
   * middle, (W/2, D/2, 0) in the document, turned +90 degrees about x: the
   * two turns cancel, and a world point (x, y, z) lands on document (x + W/2,
   * D/2 - z, y), which is docToWorld undone. Nothing else is converted.
   *
   * Kept across rebuilds by what it is drawn from (the roads, the vehicles,
   * the plot, the time and the ground), so moving a building rebuilds no
   * car, and freed when that changes. While Play runs, a change is handed to
   * the module too (uploadPlay) and the clock carries on.
   */
  buildTraffic(doc) {
    if (!this.fs || !TRAFFIC) {
      this.disposeTraffic();
      return;
    }
    const look = CEL.looks.lookOf(doc);
    const key = JSON.stringify([
      doc.field.width, doc.field.depth, look.timeId, look.groundId,
      doc.elements.filter((e) => ELEMENTS[e.type]?.kind === KIND.ROAD || ELEMENTS[e.type]?.kind === KIND.VEHICLE),
    ]);
    if (this.traffic && this.traffic.key === key) {
      this.registerCars();
      return;
    }
    this.disposeTraffic();
    const traffic = trafficOf(doc);
    const holder = new THREE.Group();
    holder.name = 'traffic';
    holder.position.set(doc.field.width / 2, doc.field.depth / 2, 0);
    holder.rotation.x = Math.PI / 2;
    let roads = null;
    let cars = null;
    try {
      roads = TRAFFIC.buildRoadMesh(THREE, look, traffic, { y: 0 });
      holder.add(roads.group);
      cars = TRAFFIC.buildCars(THREE, look, traffic, {});
      holder.add(cars.group);
    } catch (e) {
      /* A road or a car that cannot be drawn must not take the preview
       * down: the map is drawn without its traffic, and the author told. */
      console.error('3D preview: the roads and cars could not be drawn', e);
      roads?.dispose();
      cars?.dispose();
      this.host.toast?.(`The 3D preview could not draw the roads and cars (${e.message ?? e}). The map is unaffected.`);
      this.traffic = { key, traffic, holder: null, roads: null, cars: null, starts: null };
      return;
    }
    this.fs.root.add(holder);
    this.traffic = { key, traffic, holder, roads, cars, starts: this.startPoses(doc, traffic) };
    this.registerCars();
    if (this.play && this.play.running) {
      if (cars.cars.length) {
        this.uploadPlay();
      } else {
        /* The last car went: nothing left to play. */
        this.stopPlay();
      }
    }
  }

  /* Every car's meshes, pickable as its element, so a click selects it. */
  registerCars() {
    const cars = this.traffic?.cars;
    if (!cars) {
      return;
    }
    for (const car of cars.cars) {
      car.root.traverse((o) => {
        if (o.isMesh) {
          o.userData.elementId = car.element;
          this.pickables.push(o);
        }
      });
    }
  }

  disposeTraffic() {
    const t = this.traffic;
    this.traffic = null;
    if (!t) {
      return;
    }
    t.holder?.removeFromParent();
    t.roads?.dispose();
    t.cars?.dispose();
  }

  /*
   * Every car where it starts, as the pose objects cars.js places from:
   * traffic.js vehicleStart, the line and the offset trafficOf hands the
   * module, taken to the world by place.js docToWorld, standing still. What
   * cars.js asks of a caller with no module; once Play runs, every pose is
   * the module's.
   */
  startPoses(doc, traffic) {
    const poses = makeVehiclePoses();
    const W = doc.field.width;
    const D = doc.field.depth;
    const a = { x: 0, y: 0, z: 0 };
    const b = { x: 0, y: 0, z: 0 };
    for (const v of traffic.vehicles) {
      const el = elementById(doc, v.element);
      const at = el ? vehicleStart(doc, el) : null;
      if (!at) {
        continue;
      }
      docToWorld(W, D, at.x, at.y, 0, a);
      docToWorld(W, D, at.x + at.tx, at.y + at.ty, 0, b);
      const o = poses[v.slot];
      o.on = true;
      o.x = a.x;
      o.y = a.y;
      o.z = a.z;
      o.hx = b.x - a.x;
      o.hz = b.z - a.z;
      o.speed = 0;
      o.distance = 0;
      o.curvature = 0;
      o.slip = 0;
    }
    return poses;
  }

  /*
   * Pose the cars for this frame: at their start, or, while Play runs, as
   * the module has them at the clock. THE CLOCK is the milliseconds since
   * Play was pressed, in whole steps as the simulator's lap clock is; each
   * frame the module is set to that step and to the next and read at both
   * (setVehicleClock, readVehicles), and every car is drawn between the two
   * at the fraction of a step the frame falls at, the way the simulator
   * draws the craft between two physics states. Nothing here works out
   * where a car is. The drift smoke is fed the module's poses every eighth
   * step the clock passed, as the shell feeds it.
   */
  poseTraffic() {
    const t = this.traffic;
    if (!t || !t.cars) {
      return;
    }
    const p = this.play;
    if (!p || !p.running || !SIM) {
      t.cars.place(t.starts, t.starts, 1, 0);
      return;
    }
    const elapsed = Math.max(0, performance.now() - p.t0);
    const step = Math.floor(elapsed);
    const first = Math.max(p.lastEmit + EMIT_EVERY, step - EMIT_BACKLOG);
    for (let k = Math.ceil(first / EMIT_EVERY) * EMIT_EVERY; k <= step; k += EMIT_EVERY) {
      setVehicleClock(SIM, k);
      readVehicles(SIM, p.feed);
      t.cars.emit(k, p.feed);
      p.lastEmit = k;
    }
    setVehicleClock(SIM, step);
    readVehicles(SIM, p.prev);
    setVehicleClock(SIM, step + 1);
    readVehicles(SIM, p.curr);
    t.cars.place(p.prev, p.curr, elapsed - step, elapsed);
    p.clock = elapsed;
    /* The next frame, for as long as it runs. */
    this.host.requestDraw();
  }

  /* Hand the map's traffic to the module: every road and every car, on a
   * world with nothing else in it. Carries on from the clock it is at. */
  uploadPlay() {
    if (!SIM || !this.traffic) {
      return;
    }
    SIM.e.sim_world_clear();
    SIM.e.sim_world_build();
    const up = uploadTraffic(SIM, this.traffic.traffic);
    if (up.problems.length) {
      this.host.toast?.(`The physics did not take everything: ${up.problems[0].message}.`);
    }
    if (this.play) {
      /* A new set of cars has no smoke to carry on. */
      this.play.lastEmit = Math.floor(this.play.clock ?? 0);
    }
  }

  async togglePlay() {
    if (this.play && (this.play.running || this.play.loading)) {
      this.stopPlay();
      this.updatePlayUi();
      this.host.requestDraw();
      return;
    }
    this.play = {
      running: false, loading: true, t0: 0, clock: 0, lastEmit: -EMIT_EVERY,
      prev: makeVehiclePoses(), curr: makeVehiclePoses(), feed: makeVehiclePoses(),
    };
    this.updatePlayUi();
    try {
      await loadPlay();
    } catch (e) {
      this.play = null;
      this.updatePlayUi();
      this.host.toast?.(`Play could not load the physics (${e.message ?? e}). The map is unaffected.`);
      return;
    }
    /* Stopped, or the view put away, while the module came. */
    if (!this.play || !this.play.loading || !this.enabled) {
      return;
    }
    this.play.loading = false;
    this.play.running = true;
    this.uploadPlay();
    this.play.t0 = performance.now();
    this.play.lastEmit = -EMIT_EVERY;
    this.updatePlayUi();
    this.host.requestDraw();
  }

  /* Stop: every car back where it starts, the smoke gone. */
  stopPlay() {
    if (!this.play) {
      return;
    }
    this.play = null;
    const t = this.traffic;
    if (t && t.cars) {
      t.cars.clearSmoke();
      t.cars.place(t.starts, t.starts, 1, 0);
    }
  }

  /*
   * THE PLAY BUTTON, over the preview's corner: on a map with a car to
   * drive, while the 3D view is open. Its clock says how far Play has run,
   * the clock the cars are at.
   */
  updatePlayUi() {
    const cars = this.traffic?.cars ? this.traffic.cars.cars.length : 0;
    const show = this.enabled && this.isFreestyle() && cars > 0;
    if (!show && !this.playUi) {
      return;
    }
    if (!this.playUi) {
      const box = document.createElement('div');
      box.className = 'tb-play';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tb-btn tb-primary tb-play-btn';
      btn.addEventListener('click', () => this.togglePlay());
      const clock = document.createElement('span');
      clock.className = 'tb-play-clock';
      box.append(btn, clock);
      this.canvas.parentElement.append(box);
      this.playUi = { box, btn, clock, text: '' };
    }
    const ui = this.playUi;
    ui.box.hidden = !show;
    if (!show) {
      return;
    }
    const p = this.play;
    const label = p ? (p.loading ? 'Loading the physics' : 'Stop') : 'Play';
    const secs = p && p.running ? p.clock / 1000 : 0;
    const clock = p && p.running
      ? `${Math.floor(secs / 60)}:${(secs % 60).toFixed(1).padStart(4, '0')}`
      : `${cars} car${cars === 1 ? '' : 's'}, where they start`;
    const text = `${label}|${clock}`;
    if (text !== ui.text) {
      ui.text = text;
      ui.btn.textContent = label;
      ui.btn.disabled = Boolean(p && p.loading);
      ui.btn.title = p ? 'Stop the cars and put them back where they start' : 'Drive the cars round their roads, as the simulator will';
      ui.clock.textContent = clock;
    }
  }

  /*
   * The freestyle frame. The sky and the hills follow the orbit out, and so
   * do the fog and the distance the ink fades over, because the town sets
   * them for a pilot among the buildings and the preview's camera is 180 m
   * off a 160 m plot: at the town's distances the whole map is past the
   * fade, so it would be drawn with no ink at all, which is not the game.
   */
  renderFreestyle() {
    const fs = this.fs;
    const sized = `${this.viewW}x${this.viewH}`;
    if (fs.sizedFor !== sized) {
      fs.pipeline.setSize(this.viewW, this.viewH);
      fs.sizedFor = sized;
    }
    this.seatCamera(0.25);
    const r = this.orbit.radius;
    const reach = r + fs.halfDiag;
    /*
     * The fog has to be complete before the dome, because the dome writes
     * depth and hides whatever land lies past it: with the fog still thin
     * there, the land stopped at a hard curve 500 m out. So the dome is
     * sized to hold both the plot and the fog's far edge, and stays inside
     * the camera's 2000 m far plane.
     */
    const fogFar = 2.4 * r + 300;
    const k = clamp(Math.max(reach + 60, fogFar / 0.95) / SKY_R, 1, 3.5);
    const eye = this.camera.position;
    fs.sky.dome.position.copy(eye);
    fs.sky.dome.scale.setScalar(k);
    fs.sky.clouds.position.copy(eye);
    fs.sky.clouds.scale.setScalar(k);
    fs.hills.scale.setScalar(clamp((reach + 40) / 250, 1, 6));
    fs.scene.fog.near = 0.6 * r + 40;
    fs.scene.fog.far = Math.min(fogFar, 0.95 * SKY_R * k);
    const ink = fs.pipeline.ink.mat.uniforms;
    ink.uNear.value = this.camera.near;
    ink.uFar.value = this.camera.far;
    ink.uFadeStart.value = Math.max(40, r + 0.5 * fs.halfDiag);
    ink.uFadeEnd.value = Math.max(98, 2 * reach);
    ink.uSkyDepth.value = 0.75 * SKY_R * k;
    this.renderer.shadowMap.enabled = true;
    fs.pipeline.render();
  }

  /* The near plane each scene is drawn with: the race preview's own 0.1 m,
   * and the town's 0.25 m for a map, whose ink reads the depth buffer. */
  seatCamera(near) {
    if (this.camera.near !== near) {
      this.camera.near = near;
      this.camera.updateProjectionMatrix();
    }
  }

  /* ---------------- frame ---------------- */

  draw() {
    if (!this.enabled || !THREE) {
      return;
    }
    this.ensure();
    const freestyle = this.isFreestyle();
    if (freestyle && !FS && !this.fsFailed) {
      /* A map opened while the view was open. The first frame is drawn
       * when its kit has arrived. */
      this.fetchFreestyle();
      return;
    }
    if (freestyle !== this.builtFreestyle) {
      this.dirty = true;
    }
    if (this.dirty) {
      this.build();
      this.dirty = false;
    }
    this.applyCamera();
    this.fitGapLabels();
    if (freestyle) {
      this.fitRing();
      this.fitHandles();
      this.syncDraft();
    }
    if (freestyle && this.fs) {
      this.poseTraffic();
      this.renderFreestyle();
      this.updatePlayUi();
      this.placeOverlay();
      return;
    }
    this.seatCamera(0.1);
    this.renderer.shadowMap.enabled = false;
    this.renderer.render(this.scene, this.camera);
    this.placeOverlay();
  }

  /*
   * A PICTURE OF THE ROOM AS IT IS ON THE SCREEN, as a PNG blob: the drawing and,
   * laid over it the way they are over the canvas, the numbers on the gates, the
   * marks on the pieces that break a rule and the distances. The canvas alone
   * would be a room with no numbers, because those are HTML. A fresh frame is
   * drawn first, in this task, since a WebGL canvas that has not kept its buffer
   * can only be copied before the browser next composites. Resolves to null when
   * there is no room to take (Three.js has not arrived, or a map is showing).
   */
  async snapshot() {
    if (!this.enabled || !this.renderer || this.isFreestyle() || !this.overlay) {
      return null;
    }
    this.draw();
    const w = this.canvas.width;
    const h = this.canvas.height;
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const ctx = out.getContext('2d');
    ctx.drawImage(this.canvas, 0, 0);
    const rect = this.canvas.getBoundingClientRect();
    const k = w / Math.max(1, rect.width);
    const family = getComputedStyle(this.overlay).fontFamily || 'system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const n of this.overlay.querySelectorAll('.tb-bubble, .tb-warnbadge, .tb-measure')) {
      if (n.style.display === 'none' || !n.textContent) {
        continue;
      }
      const b = n.getBoundingClientRect();
      const x = (b.left - rect.left + b.width / 2) * k;
      const y = (b.top - rect.top + b.height / 2) * k;
      if (x < 0 || y < 0 || x > w || y > h) {
        continue;
      }
      if (n.classList.contains('tb-measure')) {
        const text = n.textContent;
        ctx.font = `500 ${12 * k}px ${family}`;
        const tw = ctx.measureText(text).width + 12 * k;
        ctx.fillStyle = 'rgba(8, 13, 20, 0.82)';
        ctx.fillRect(x - tw / 2, y - 10 * k, tw, 20 * k);
        ctx.fillStyle = getComputedStyle(n).color;
        ctx.fillText(text, x, y);
        continue;
      }
      const bad = n.classList.contains('tb-warnbadge');
      ctx.beginPath();
      ctx.arc(x, y, (b.width / 2) * k, 0, Math.PI * 2);
      ctx.fillStyle = getComputedStyle(n).backgroundColor;
      ctx.fill();
      ctx.lineWidth = Math.max(1, k);
      ctx.strokeStyle = 'rgba(15, 21, 15, 0.7)';
      ctx.stroke();
      ctx.fillStyle = getComputedStyle(n).color;
      ctx.font = `${bad ? 700 : 600} ${(b.width * 0.5) * k}px ${family}`;
      ctx.fillText(n.textContent, x, y + k);
    }
    return new Promise((resolve) => out.toBlob((blob) => resolve(blob), 'image/png'));
  }

  dispose() {
    this.stopPlay();
    this.disposeTraffic();
    this.playUi?.box.remove();
    this.playUi = null;
    this.disposeContent();
    this.sweepAssets(null);
    this.overlay?.remove();
    this.overlay = null;
    if (this.fs) {
      this.fs.pipeline.dispose();
      this.fs = null;
    }
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = null;
    }
  }
}

/*
 * The gap labels' screen sizing, in fractions of the view's height (a
 * sprite with sizeAttenuation off) and metres. CAP is the size a label
 * reaches at REF_M and closer, two thirds of the 0.042 it was at every
 * range. MIN is the floor of the shrink, so a label at the opening orbit
 * is still a word: 0.55 of the cap was measured there as too small to read
 * in the first picture. FAINTEST is the opacity at FAR_M and beyond.
 */
const GAP_LABEL = {
  cap: 0.028, min: 0.7, refM: 60, nearM: 90, farM: 260, faintest: 0.6,
};

/*
 * AN ARROW, centred on the origin and pointing along `dir` (a unit vector in
 * document coordinates, since it goes into a group that is one): what is drawn
 * through an opening to say which way it is flown. Never picked, and drawn
 * without a depth test so it reads through the pane and the pipes.
 */
function arrowMesh(dir, length, hex, opacity = 0.95) {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity, depthTest: false });
  const head = length * 0.34;
  const shaft = length - head;
  const shaftR = length * 0.03;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(shaftR, shaftR, shaft, 8), mat);
  body.position.y = -length / 2 + shaft / 2;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(length * 0.1, head, 14), mat);
  tip.position.y = length / 2 - head / 2;
  body.renderOrder = 11;
  tip.renderOrder = 11;
  g.add(body, tip);
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dir.x, dir.y, dir.z).normalize());
  return g;
}

/*
 * A text label as a camera facing sprite. Canvas2D into a texture is the
 * cheapest text Three.js has that does not need a font loader, and the
 * builder needs exactly two kinds of text: a sequence number and a label.
 */
function textSprite(text, worldHeight, colour, background = null) {
  const pad = 10;
  const px = 64;
  const measure = document.createElement('canvas').getContext('2d');
  measure.font = `bold ${px}px system-ui, -apple-system, sans-serif`;
  const w = Math.ceil(measure.measureText(text).width) + pad * 2;
  const h = px + pad * 2;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d');
  if (background) {
    ctx.fillStyle = background;
    if (typeof ctx.roundRect === 'function') {
      ctx.beginPath();
      ctx.roundRect(0, 0, w, h, h / 2);
      ctx.fill();
    } else {
      ctx.fillRect(0, 0, w, h);
    }
  }
  ctx.font = `bold ${px}px system-ui, -apple-system, sans-serif`;
  ctx.fillStyle = colour;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + 2);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sprite.scale.set(worldHeight * (w / h), worldHeight, 1);
  return sprite;
}
