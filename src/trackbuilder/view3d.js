/*
 * view3d.js: the 3D preview. Three.js, orbit, and one editing gesture.
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
 * The preview is read only except for one thing the task allows: dragging an
 * element's height. Drag on empty space orbits, drag on an element raises or
 * lowers it, middle or right drag pans, the wheel zooms.
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
 * A FREESTYLE MAP IS PREVIEWED IN THE GAME'S OWN ART, so the preview is the
 * game. Its assets are drawn by the same src/props/kit.js the built map
 * draws with, lit by the town's lights under the town's sky, and put through
 * the town's ink and grade (src/maps/city/vendored/core/post.js). All of that
 * is fetched the same lazy way as Three.js and later still: only when the 3D
 * view opens on a freestyle document. A race or whoop document never loads a
 * line of it, and its preview is the one described above, untouched. The
 * freestyle half has its own scene with its own root, rotated by the same
 * one conversion; the kit's assets are Y up in their own frame, and the one
 * extra frame change that brings them into the document is written down
 * where it happens, in buildAsset().
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

import { ELEMENTS, KIND, FRAME_TUBE_OD, GATE_FLAG_POLE_R, docModeOf, flagLeanSign, flagSideOf, flagSideSigns, frameSidesOf, gateFlagHeight, isUnbuilt, trackClassOf, virtualApertureDims } from './elements.js';
import { PIPE_OD as RACEGOW_PIPE_OD } from './racegow.js';
import {
  aperturesOf, elementById, kindOf, apertureCenter, logosOf, logoForDecal, dressOrder,
} from './model.js';
import { sequenceNumbers } from './sequence.js';
import { levelName } from './figures.js';
import { travelDirection, markerPassDir } from './faces.js';
import { knotForSeq, markerSquare } from './path.js';
import { apertureFrame, clamp, gateSupportFeet, leftOf, normalize, scale } from './geometry.js';
import { guideFromKnots, knotsFromPath, tessellateGuide } from '../game/guide.js';

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
      FS = { assetOf: catalog.assetOf, partsOf: catalog.partsOf, placedYaw: solids.placedYaw };
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
    el.unbuilt ? 'unbuilt' : '', el.type === 'horizontalPole' ? el.position.z : '',
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
const LINE_GRAB_PX = 9;
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
     * set by frameField() before the library has necessarily arrived. */
    this.orbit = { target: { x: 0, y: 0, z: 0 }, radius: 60, theta: -Math.PI / 2.4, phi: 1.05 };
    this.drag = null;
    this.dirty = true;
    /* The freestyle half: its scene, once CEL has arrived, and each asset's
     * drawing, kept across rebuilds by assetKey(). */
    this.fs = null;
    this.assets = new Map();
    this.builtFreestyle = false;
    this.fsPending = null;
    this.fsFailed = null;
    this.viewW = 1;
    this.viewH = 1;
    this.bind();
  }

  isFreestyle() {
    return docModeOf(this.host.doc) === 'freestyle';
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
    this.camera = new THREE.PerspectiveCamera(52, 1, 0.1, 2000);

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
          this.host.toast?.(`The cel kit did not load (${celError}), so the 3D preview draws each asset as its plain solids. The map is unaffected.`);
        }
      }, (e) => {
        this.fsFailed = e.message ?? String(e);
        this.host.toast?.(`The 3D preview could not load the freestyle assets (${this.fsFailed}), so it shows the plot without them. The 2D view is unaffected.`);
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
    o.radius = clamp(o.radius, 2, 600);
    const x = o.target.x + o.radius * Math.cos(o.phi) * Math.cos(o.theta);
    const z = o.target.z + o.radius * Math.cos(o.phi) * Math.sin(o.theta);
    const y = o.target.y + o.radius * Math.sin(o.phi);
    this.camera.position.set(x, y, z);
    this.camera.lookAt(o.target.x, o.target.y, o.target.z);
  }

  /* Look at a point given in DOCUMENT coordinates. */
  focusDoc(point, radius) {
    this.ensure();
    this.orbit.target = { x: point.x, y: point.z, z: -point.y };
    if (radius != null) {
      this.orbit.radius = clamp(radius, 4, 600);
    }
    this.dirty = true;
  }

  frameField() {
    const f = this.host.doc.field;
    this.focusDoc({ x: f.width / 2, y: f.depth / 2, z: 0 }, Math.max(f.width, f.depth) * 1.15);
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
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.orbit.radius *= Math.exp(e.deltaY * 0.0012);
      this.dirty = true;
      this.host.requestDraw();
    }, { passive: false });
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
  pickHit(e) {
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
    return {
      id: o.userData.elementId,
      side: o.userData.side ?? null,
      weak: o.userData.weak === true,
      distance: hits[0].distance,
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

  onDown(e) {
    if (!this.enabled || !this.renderer) {
      return;
    }
    this.canvas.setPointerCapture(e.pointerId);
    const at = { x: e.clientX, y: e.clientY };
    if (e.button === 1 || e.button === 2) {
      this.drag = { kind: 'pan', last: at };
      return;
    }
    if (e.button !== 0) {
      return;
    }
    const hit = this.pickHit(e);
    /*
     * THE LINE WINS WHERE IT IS NEARER THAN WHAT IS HIT, or where what is
     * hit is only the invisible pane across an opening with no pipe, which
     * the line runs through the middle of. A gate standing in front of the
     * line still takes the click.
     */
    const line = this.pathHit(e);
    if (line && (!hit || hit.weak || line.distance < hit.distance)) {
      this.drag = { kind: 'bend-pending', start: at, last: at, line };
      return;
    }
    const id = hit ? hit.id : null;
    if (id) {
      if (e.shiftKey) {
        this.host.toggleSelection(id);
      } else if (!this.host.selection.has(id)) {
        this.host.setSelection([id]);
      } else if (hit.side && this.host.selection.size === 1) {
        /* A second click on a gate, on one of its four sides: pick that
         * pipe, and Delete takes just it away. See pickSide in app.js. */
        this.host.pickSide(id, hit.side);
      }
      const el = elementById(this.host.doc, id);
      /*
       * A WAYPOINT IS A HANDLE ON THE LINE, so a drag on one moves it across
       * the level it is at, the same gesture as pulling the line itself, and
       * Alt moves it up and down. Every other element keeps the height drag.
       */
      if (el && el.type === 'waypoint' && !e.shiftKey && docModeOf(this.host.doc) !== 'freestyle') {
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
        return;
      }
      this.host.beginEdit('height');
      this.drag = {
        kind: 'height',
        id,
        last: at,
        startZ: el.position.z,
        origin: new Map([...this.host.selection].map((sid) => [sid, elementById(this.host.doc, sid).position.z])),
      };
      return;
    }
    this.drag = { kind: 'orbit', last: at };
  }

  onMove(e) {
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

    if (this.drag.kind === 'orbit') {
      this.orbit.theta += dx * 0.006;
      this.orbit.phi += dy * 0.006;
      this.dirty = true;
      this.host.requestDraw();
      return;
    }
    if (this.drag.kind === 'pan') {
      /* Pan in the camera's own screen plane, scaled by distance so the
       * ground appears to follow the pointer at any zoom. */
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
      this.dirty = true;
      this.host.requestDraw();
      return;
    }
    if (this.drag.kind === 'height') {
      /* Screen up is height up. The scale follows the zoom so the gesture
       * feels the same close in and far out. */
      const k = this.orbit.radius * 0.0022;
      this.host.raiseSelected(this.drag.origin, -dy * k, e.altKey);
    }
  }

  onCancel(e) {
    if (this.drag && this.drag.kind === 'height') {
      this.host.cancelEdit();
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
      return;
    }
    if (this.drag.kind === 'height') {
      this.host.endEdit();
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
    this.builtFreestyle = this.isFreestyle();
    if (this.builtFreestyle) {
      this.buildFreestyle();
      return;
    }
    /* A race document holds no assets, so any a map left behind go now. */
    this.sweepAssets(null);
    const doc = this.host.doc;
    const g = new THREE.Group();
    this.pickables = [];

    g.add(this.fieldGround(doc));
    g.add(this.gridLines(doc));

    const numbers = sequenceNumbers(doc);
    /* Which of the course's marks each dressed structure wears, by the same
     * rule the race field deals them out with. Computed once per rebuild
     * rather than per element, because it is a walk of the whole sequence. */
    this.dressSlots = dressOrder(doc);
    for (const el of doc.elements) {
      const node = this.buildElement(el, numbers.get(el.id) ?? []);
      if (node) {
        g.add(node);
      }
    }

    if (this.host.path && this.host.path.samples.length > 1) {
      /* Ground marks always, not only when the Hermite is toggled. The
       * taut string is what the race field paints, and the preview has
       * to show the same line or an author is editing a different course
       * from the one they fly. */
      g.add(this.buildGuideMarks(this.host.path));
    }
    if (this.host.pathVisible && this.host.path && this.host.path.samples.length > 1) {
      g.add(this.buildPath(this.host.path));
    }

    this.content = g;
    this.root.add(g);
  }

  /* The race preview's ground, in document coordinates: the plane spans x
   * and y. */
  fieldGround(doc) {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(doc.field.width, doc.field.depth),
      new THREE.MeshLambertMaterial({ color: COL.ground }),
    );
    ground.position.set(doc.field.width / 2, doc.field.depth / 2, -0.01);
    return ground;
  }

  gridLines(doc) {
    const pts = [];
    const s = gridStep(doc.field);
    for (let x = 0; x <= doc.field.width + 1e-6; x += s) {
      pts.push(x, 0, 0, x, doc.field.depth, 0);
    }
    for (let y = 0; y <= doc.field.depth + 1e-6; y += s) {
      pts.push(0, y, 0, doc.field.width, y, 0);
    }
    /* The field boundary, brighter than the grid, so the edge of the legal
     * ground is visible in the preview as well as on the plan. */
    const w = doc.field.width;
    const d = doc.field.depth;
    pts.push(0, 0, 0.01, w, 0, 0.01, w, 0, 0.01, w, d, 0.01,
      w, d, 0.01, 0, d, 0.01, 0, d, 0.01, 0, 0, 0.01);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: COL.grid }));
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
    const k = Math.min(w / img.naturalWidth, d / img.naturalHeight);
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(img.naturalWidth * k, img.naturalHeight * k),
      mat,
    );
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
    } else if (def.kind === KIND.OBSTACLE) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(el.dims.width, el.dims.depth, el.dims.height),
        new THREE.MeshLambertMaterial({ color: selected ? COL.frameSel : COL.barrier }),
      );
      mesh.position.z = el.dims.height / 2;
      mesh.rotation.z = el.yaw;
      this.register(mesh, el);
      group.add(mesh);
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
    const k = trackClassOf(this.host.doc) === 'micro' ? 0.30 : 1;
    for (const n of numbers) {
      /* A waypoint has no number: see gateNumbers in sequence.js. */
      if (n.number == null) {
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
          spritePos.x = f.normal.x * along;
          spritePos.y = f.normal.y * along;
          spritePos.z = ap.centerH + f.normal.z * along;
          label = `${n.number}  ${levelName(el, n.apertureIndex)}`;
          worldH = 0.85 * k;
        } else {
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

  buildAperture(group, el, numbers, selected) {
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
    const picked = this.host.pickedSide && this.host.pickedSide.id === el.id
      ? this.host.pickedSide.side : null;
    const pickedMat = picked ? new THREE.MeshLambertMaterial({ color: COL.sidePicked }) : null;
    const last = levels.length - 1;

    for (const ap of levels) {
      const frame = new THREE.Group();
      frame.position.set(0, 0, ap.centerH);
      frame.quaternion.copy(quat);
      /* Four tubes around the opening, laid out in the aperture's own plane:
       * local x across the width, local y across the height. Each carries
       * the side it is, so a click on it can say which one it hit. */
      const bars = [
        [ap.clearW + tube * 2, tube, 0, (ap.clearH + tube) / 2, ap.index === last ? 'top' : null],
        [ap.clearW + tube * 2, tube, 0, -(ap.clearH + tube) / 2, ap.index === 0 ? 'bottom' : null],
        [tube, ap.clearH, -(ap.clearW + tube) / 2, 0, 'left'],
        [tube, ap.clearH, (ap.clearW + tube) / 2, 0, 'right'],
      ];
      let drawn = 0;
      for (const [w, h, x, y, side] of (unbuilt ? [] : bars)) {
        if (side && !sides[side]) {
          continue;
        }
        const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, tube), side && side === picked ? pickedMat : mat);
        bar.position.set(x, y, 0);
        bar.userData.side = side;
        this.register(bar, el);
        frame.add(bar);
        drawn += 1;
      }
      /*
       * A gap in the lattice has no pipe to click on, and an author still
       * has to be able to pick it up. So it gets an invisible pane across
       * the opening, registered for the raycast and drawn by nothing: the
       * line loop below is what the eye sees. An opening whose sides have
       * all been taken away one at a time is the same thing and gets the
       * same pane. It is WEAK: the racing line runs through the middle of
       * it, and a grab on the line there is a grab on the line.
       */
      if (!drawn) {
        const pick = new THREE.Mesh(
          new THREE.PlaneGeometry(ap.clearW, ap.clearH),
          new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
        );
        pick.userData.weak = true;
        this.register(pick, el);
        frame.add(pick);
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
      const c = [
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
      const sleeveW = 0.42;
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
      for (const sx of [-1, 1]) {
        /* A sleeve is sleeved over its upright and goes with it. */
        if (!sides[sx < 0 ? 'left' : 'right']) {
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
     */
    for (const n of numbers) {
      const ap = levels[Math.min(n.apertureIndex ?? 0, levels.length - 1)];
      const seq = n.seq;
      if (!seq || seq.entry === 0) {
        continue;
      }
      for (const [side, colour] of [[-seq.entry, COL.entry], [seq.entry, COL.exit]]) {
        const pane = new THREE.Mesh(
          new THREE.PlaneGeometry(ap.clearW, ap.clearH),
          new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
        );
        pane.quaternion.copy(quat);
        pane.position.set(
          f.normal.x * side * 0.12,
          f.normal.y * side * 0.12,
          ap.centerH + f.normal.z * side * 0.12,
        );
        group.add(pane);
      }
    }

    /* The legs, so a tower stands on something. Two vertical posts at
     * the sides for every pitch, from the grass to the lower outer
     * corners of the frame. A centre mast through the hole was what a
     * custom tilt used to grow. */
    const bottom = levels[0];
    const feet = gateSupportFeet(
      el.yaw, el.pitch, bottom.clearW, bottom.clearH, bottom.centerH, tube,
    );
    const legMat = new THREE.MeshLambertMaterial({ color: selected ? COL.frameSel : COL.frame });
    for (const [i, foot] of feet.entries()) {
      const h = foot.z;
      /* gateSupportFeet gives the -widthAxis leg first. A leg is the foot of
       * its upright, so it goes when the upright does, as it does in the
       * world. */
      if (h < 0.02 || unbuilt || !sides[i === 0 ? 'left' : 'right']) {
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
   * Pennants on a flagged gate's header: the ends, or the centre for a mast
   * set on top. Same teardrop as a turn flag, stood on the board rather than
   * spiked in the grass, sails pointing outboard so they do not cover the
   * opening, and to the right from a centre mast which has no outboard.
   */
  buildHeaderFlags(group, el, selected) {
    const signs = flagSideSigns(flagSideOf(el));
    if (!signs.length || Math.abs(el.pitch) >= Math.PI / 6) {
      return;
    }
    const levels = aperturesOf(el);
    const top = levels[levels.length - 1];
    const tube = FRAME_TUBE_OD;
    const sleeveW = 0.42;
    const headerW = 2 * (top.clearW / 2 + tube + sleeveW);
    const headerTop = top.sillH + top.clearH + tube * 2 + BANNER_H + 0.03;
    const f = apertureFrame(el.yaw, el.pitch);
    const h = gateFlagHeight(el.dims);
    const poleR = GATE_FLAG_POLE_R;
    const poleMat = new THREE.MeshLambertMaterial({ color: selected ? COL.frameSel : COL.frame });
    const kit = this.dressFor(el);
    let i = 0;
    for (const sx of signs) {
      const x = f.widthAxis.x * sx * (headerW / 2);
      const y = f.widthAxis.y * sx * (headerW / 2);
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
      const k = trackClassOf(this.host.doc) === 'micro' ? 0.30 : 1;
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
      const holder = new THREE.Group();
      holder.position.set(cx, cy, cz);
      holder.quaternion.copy(quat);
      const loopGeo = new THREE.BufferGeometry();
      loopGeo.setAttribute('position', new THREE.Float32BufferAttribute(loop, 3));
      holder.add(new THREE.LineLoop(loopGeo, new THREE.LineBasicMaterial({
        color: selected ? COL.frameSel : COL.entry,
      })));
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
    return new THREE.Line(geo, new THREE.LineBasicMaterial({ color: COL.path }));
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
    if (fs) {
      this.seatScene(doc);
      this.seatFreestyleGround(doc);
    } else {
      g.add(this.fieldGround(doc));
      g.add(this.gridLines(doc));
    }
    const used = new Set();
    for (const el of doc.elements) {
      const node = this.buildFreestyleElement(el, used);
      if (node) {
        g.add(node);
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
    this.sweepAssets(used);
    this.content = g;
    (fs ? fs.root : this.root).add(g);
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
  plainAsset(el, selected) {
    const g = new THREE.Group();
    let parts;
    try {
      parts = FS.partsOf(el);
    } catch (e) {
      console.error(`3D preview: the ${el.type} asset has no layout`, e);
      return g;
    }
    const mat = new THREE.MeshLambertMaterial({ color: selected ? COL.frameSel : COL.frame });
    const up = new THREE.Vector3(0, 1, 0);
    for (const p of parts) {
      if (!p.draw && !p.solid) {
        continue;
      }
      let mesh;
      if (p.t === 'box') {
        mesh = new THREE.Mesh(new THREE.BoxGeometry(
          Math.max(0.01, p.hi[0] - p.lo[0]),
          Math.max(0.01, p.hi[1] - p.lo[1]),
          Math.max(0.01, p.hi[2] - p.lo[2]),
        ), mat);
        mesh.position.set((p.lo[0] + p.hi[0]) / 2, (p.lo[1] + p.hi[1]) / 2, (p.lo[2] + p.hi[2]) / 2);
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
  buildGap(el, selected) {
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
     * The name and the points, the same size on screen at any distance: a
     * gap is a note to the author rather than a thing in the world, and at
     * the map's opening orbit, 180 m out, a label a metre tall is three
     * pixels. Anchored by its bottom edge, so it sits on the window's top
     * however large it draws.
     */
    const label = textSprite(`${el.name || 'GAP'}  ${el.points ?? ''}`.trim(), 1, '#1d1406', selected ? '#ffd45c' : '#ffb347');
    label.material.sizeAttenuation = false;
    label.scale.multiplyScalar(0.042);
    label.center.set(0.5, 0);
    label.position.z = h + 0.25;
    this.register(label, el);
    holder.add(label);
    return holder;
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
    if (freestyle && this.fs) {
      this.renderFreestyle();
      return;
    }
    this.seatCamera(0.1);
    this.renderer.shadowMap.enabled = false;
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.disposeContent();
    this.sweepAssets(null);
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
