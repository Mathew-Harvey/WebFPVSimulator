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

import { ELEMENTS, KIND, FRAME_TUBE_OD, GATE_FLAG_H, GATE_FLAG_POLE_R, flagSideOf, flagSideSigns, virtualApertureDims } from './elements.js';
import {
  aperturesOf, elementById, kindOf, apertureCenter, logosOf, logoForDecal, dressOrder,
} from './model.js';
import { sequenceNumbers } from './sequence.js';
import { levelName } from './figures.js';
import { travelDirection, markerPassDir } from './faces.js';
import { apertureFrame, clamp, leftOf, normalize, scale } from './geometry.js';
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
  entry: 0x7dffb4,
  exit: 0xff7d7d,
  barrier: bannerHex('vinyl'),
  marker: 0xf7e8cd,
  cone: 0xff9a4d,
  start: 0x7dffb4,
  path: 0xffd45c,
  sky: 0x0e1720,
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
    this.bind();
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
    this.ensure();
    this.resize();
    this.dirty = true;
    this.host.requestDraw();
    return true;
  }

  resize() {
    if (!this.renderer) {
      return;
    }
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
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

  pick(e) {
    if (!this.camera || !THREE) {
      return null;
    }
    const ray = new THREE.Raycaster();
    ray.setFromCamera(this.ndc(e), this.camera);
    const hits = ray.intersectObjects(this.pickables, false);
    return hits.length ? hits[0].object.userData.elementId : null;
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
    const id = this.pick(e);
    if (id) {
      if (e.shiftKey) {
        this.host.toggleSelection(id);
      } else if (!this.host.selection.has(id)) {
        this.host.setSelection([id]);
      }
      const el = elementById(this.host.doc, id);
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
      return;
    }
    const dx = e.clientX - this.drag.last.x;
    const dy = e.clientY - this.drag.last.y;
    this.drag.last = { x: e.clientX, y: e.clientY };

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
    this.root.remove(this.content);
    this.content = null;
  }

  build() {
    this.disposeContent();
    const doc = this.host.doc;
    const g = new THREE.Group();
    this.pickables = [];

    /* Ground and grid, in document coordinates: the plane spans x and y. */
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(doc.field.width, doc.field.depth),
      new THREE.MeshLambertMaterial({ color: COL.ground }),
    );
    ground.position.set(doc.field.width / 2, doc.field.depth / 2, -0.01);
    g.add(ground);
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

  gridLines(doc) {
    const pts = [];
    const step = doc.field.gridSize;
    /* A metre grid over a 60 by 40 field is a hundred lines, which is
     * nothing, but a 1 m grid over a 500 m field would be a thousand, so it
     * coarsens the same way the 2D grid does. */
    let s = step;
    while ((doc.field.width / s) + (doc.field.depth / s) > 260) {
      s *= 5;
    }
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
    for (const n of numbers) {
      let label = String(n.number);
      let worldH = 1.1;
      const spritePos = { x: 0, y: 0, z: 1.6 };
      if (def.kind === KIND.APERTURE) {
        const levels = aperturesOf(el);
        const ap = levels[Math.min(n.apertureIndex ?? 0, levels.length - 1)];
        if (levels.length > 1) {
          const f = apertureFrame(el.yaw, el.pitch);
          const same = numbers.filter((x) => (x.apertureIndex ?? 0) === (n.apertureIndex ?? 0));
          const slot = Math.max(0, same.findIndex((x) => x.seq === n.seq));
          const along = 0.55 + slot * 0.4;
          spritePos.x = f.normal.x * along;
          spritePos.y = f.normal.y * along;
          spritePos.z = ap.centerH + f.normal.z * along;
          label = `${n.number}  ${levelName(el, n.apertureIndex)}`;
          worldH = 0.85;
        } else {
          spritePos.z = ap.centerH + ap.clearH / 2 + 0.7;
        }
      } else {
        spritePos.z = (def.kind === KIND.MARKER ? el.dims.height : 1.0) + 0.7;
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
    const tube = FRAME_TUBE_OD;
    const f = apertureFrame(el.yaw, el.pitch);
    const basis = new THREE.Matrix4().makeBasis(
      new THREE.Vector3(f.widthAxis.x, f.widthAxis.y, f.widthAxis.z),
      new THREE.Vector3(f.heightAxis.x, f.heightAxis.y, f.heightAxis.z),
      new THREE.Vector3(f.normal.x, f.normal.y, f.normal.z),
    );
    const quat = new THREE.Quaternion().setFromRotationMatrix(basis);

    for (const ap of levels) {
      const frame = new THREE.Group();
      frame.position.set(0, 0, ap.centerH);
      frame.quaternion.copy(quat);
      /* Four tubes around the opening, laid out in the aperture's own plane:
       * local x across the width, local y across the height. */
      const bars = [
        [ap.clearW + tube * 2, tube, 0, (ap.clearH + tube) / 2],
        [ap.clearW + tube * 2, tube, 0, -(ap.clearH + tube) / 2],
        [tube, ap.clearH, -(ap.clearW + tube) / 2, 0],
        [tube, ap.clearH, (ap.clearW + tube) / 2, 0],
      ];
      for (const [w, h, x, y] of bars) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, tube), mat);
        bar.position.set(x, y, 0);
        this.register(bar, el);
        frame.add(bar);
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
    if (Math.abs(el.pitch) < Math.PI / 6) {
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
      bannerFace(headerW, BANNER_H, kit.header, at);
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

    /* The legs, so a tower stands on something. */
    const bottom = levels[0];
    if (bottom.sillH > 0.02 && Math.abs(el.pitch) < Math.PI / 4) {
      const legMat = new THREE.MeshLambertMaterial({ color: selected ? COL.frameSel : COL.frame });
      for (const s of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(tube, tube, bottom.sillH), legMat);
        leg.position.set(
          -Math.sin(el.yaw) * s * (bottom.clearW + tube) / 2,
          Math.cos(el.yaw) * s * (bottom.clearW + tube) / 2,
          bottom.sillH / 2,
        );
        this.register(leg, el);
        group.add(leg);
      }
    } else if (bottom.sillH > 0.02) {
      /* A dive gate hangs off a single mast rather than two legs, because
       * two legs under a horizontal aperture would sit inside the opening. */
      const mast = new THREE.Mesh(
        new THREE.BoxGeometry(tube * 1.6, tube * 1.6, bottom.centerH),
        new THREE.MeshLambertMaterial({ color: selected ? COL.frameSel : COL.frame }),
      );
      mast.position.set(
        Math.cos(el.yaw) * (bottom.clearH / 2 + tube),
        Math.sin(el.yaw) * (bottom.clearH / 2 + tube),
        bottom.centerH / 2,
      );
      this.register(mast, el);
      group.add(mast);
    }

    this.buildHeaderFlags(group, el, selected);
  }

  /*
   * Pennants on the header corners of a flagged gate. Same teardrop as a
   * turn flag, stood on the board rather than spiked in the grass, sails
   * pointing outboard so they do not cover the opening.
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
    const h = GATE_FLAG_H;
    const poleR = GATE_FLAG_POLE_R;
    const poleMat = new THREE.MeshLambertMaterial({ color: selected ? COL.frameSel : COL.frame });
    const kit = this.dressFor(el);
    let i = 0;
    for (const sx of signs) {
      const x = f.widthAxis.x * sx * (headerW / 2);
      const y = f.widthAxis.y * sx * (headerW / 2);
      /* One transform for the mast and its cloth, so the bend and the sail
       * both lean outboard off the board's end. */
      const turn = -Math.atan2(f.widthAxis.y * sx, f.widthAxis.x * sx);
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
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.36, 0.46, 20), mat);
      ring.position.z = 0.02;
      group.add(ring);
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
      const dir = travelDirection(this.host.doc, seq.id);
      if (!dir) {
        continue;
      }
      const dims = virtualApertureDims(el, seq);
      const u = normalize({ x: dir.x, y: dir.y, z: 0 }, { x: 1, y: 0, z: 0 });
      /* Which way off the pole the pass is, shared with path.js so the
       * preview and the racing line agree, all the way round a turned
       * marker. */
      const side = markerPassDir(el, seq, u);
      /* Inner edge on the pole: half the square's width out along the pass
       * side, which is the clearance plus whatever elements.js padded the
       * width by. Reading `outward` rather than adding the pad again here
       * is what keeps the preview and the race field the same square. */
      const off = scale(side, seq.clearance + dims.outward);
      /* WHERE it sits follows the pass direction; WHICH WAY IT FACES is
       * always square to travel, because that is the frame race.js scores
       * in. A basis built from a turned pass direction would not even be
       * orthonormal, and it would draw a hole nothing scores. */
      const f = {
        widthAxis: leftOf(u),
        heightAxis: { x: 0, y: 0, z: 1 },
        normal: { x: u.x, y: u.y, z: 0 },
      };
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
    const tris = tessellateGuide(guideFromKnots(knotsFromPath(path)));
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

  /* ---------------- frame ---------------- */

  draw() {
    if (!this.enabled || !THREE) {
      return;
    }
    this.ensure();
    if (this.dirty) {
      this.build();
      this.dirty = false;
    }
    this.applyCamera();
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.disposeContent();
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
