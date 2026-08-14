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

import { ELEMENTS, KIND, FRAME_TUBE_OD, GATE_FLAG_H, GATE_FLAG_POLE_R, flagSideOf, flagSideSigns } from './elements.js';
import { aperturesOf, elementById, kindOf, apertureCenter } from './model.js';
import { sequenceNumbers } from './sequence.js';
import { levelName } from './figures.js';
import { apertureFrame, clamp } from './geometry.js';

/*
 * The printed vinyl the world dresses its gates and flags in, so what an
 * author builds here looks like what they fly. src/art/ is neither the game
 * nor the builder: it is the artwork both draw from, which is what lets the
 * builder use it without importing a line of the simulator.
 */
import {
  BANNER_SIZE, bannerCanvas, bannerHex, paintGateHeader, paintGateSleeve, paintFlagSail,
} from '../art/banners.js';

/* The header banner's height and the fraction of it left clear at each end
 * for the gate number, matching src/render/scene.js. */
const BANNER_H = 0.58;

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
 * The teardrop outline, as a plane grid in XY: x out from the mast, y up.
 *
 * The same profile src/render/scene.js cuts, so a flag in the preview and a
 * flag in the air are the same shape. The world's version carries a second
 * attribute for the wave in its shader; the preview does not wave, so this
 * is the outline and its uv and nothing else.
 */
function sailPlaneGeometry(poleR, h) {
  const rows = 12;
  const cols = 5;
  const y0 = h * 0.16;
  const y1 = h * 0.98;
  const maxW = h * 0.30;
  const pos = [];
  const uvs = [];
  const idx = [];
  const smooth = (x) => {
    const t = Math.max(0, Math.min(1, x));
    return t * t * (3 - 2 * t);
  };
  for (let r = 0; r < rows; r += 1) {
    const t = r / (rows - 1);
    const w = maxW * (0.42 + 0.58 * smooth(t / 0.45)) * (1 - smooth((t - 0.70) / 0.30) * 0.94);
    const y = y0 + (y1 - y0) * t;
    for (let c = 0; c < cols; c += 1) {
      const u = c / (cols - 1);
      pos.push(poleR + w * u, y, 0);
      uvs.push(u, t);
    }
  }
  for (let r = 0; r < rows - 1; r += 1) {
    for (let c = 0; c < cols - 1; c += 1) {
      const a = r * cols + c;
      idx.push(a, a + cols, a + 1, a + 1, a + cols, a + cols + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
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
    const logo = this.host.doc.branding?.logo ?? null;
    if (this.kit && this.kit.logo === logo) {
      return this.kit;
    }
    if (this.kit) {
      for (const m of [this.kit.header, this.kit.sleeve, this.kit.sleeveFlipped, ...this.kit.sails]) {
        m.map.dispose();
        m.dispose();
      }
    }
    const jobs = [];
    const paint = (size, painter, opts) => {
      const canvas = bannerCanvas(size[0], size[1]);
      const ctx = canvas.getContext('2d');
      painter(ctx, size[0], size[1], opts);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      jobs.push((img) => {
        painter(ctx, size[0], size[1], { ...opts, logo: img });
        tex.needsUpdate = true;
        this.host.requestDraw();
      });
      return new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide });
    };
    this.kit = {
      logo,
      header: paint(BANNER_SIZE.header, paintGateHeader, {}),
      sleeve: paint(BANNER_SIZE.sleeve, paintGateSleeve, {}),
      /* The far leg's sleeve, painted mirrored. A second canvas rather than
       * a negative scale on the mesh, because a negative scale inverts the
       * winding and a single sided plane turned inside out disappears. */
      sleeveFlipped: paint(BANNER_SIZE.sleeve, paintGateSleeve, { flip: true }),
      sails: [
        paint(BANNER_SIZE.sail, paintFlagSail, { accent: 'navy' }),
        paint(BANNER_SIZE.sail, paintFlagSail, { accent: 'red' }),
      ],
    };
    if (typeof logo === 'string' && logo.startsWith('data:image/')) {
      const img = new Image();
      img.onload = () => {
        for (const job of jobs) {
          job(img);
        }
      };
      img.src = logo;
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
    for (const el of doc.elements) {
      const node = this.buildElement(el, numbers.get(el.id) ?? []);
      if (node) {
        g.add(node);
      }
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
      this.buildMarker(group, el, selected);
    } else if (def.kind === KIND.START) {
      this.buildStart(group, el, selected);
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
      const kit = this.bannerKit();
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
    const kit = this.bannerKit();
    let i = 0;
    for (const sx of signs) {
      const x = f.widthAxis.x * sx * (headerW / 2);
      const y = f.widthAxis.y * sx * (headerW / 2);
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(poleR, poleR, h, 8),
        poleMat,
      );
      pole.rotation.x = Math.PI / 2;
      pole.position.set(x, y, headerTop + h / 2);
      this.register(pole, el);
      group.add(pole);
      const sail = new THREE.Mesh(
        sailPlaneGeometry(poleR, h),
        selected
          ? new THREE.MeshLambertMaterial({ color: COL.frameSel, side: THREE.DoubleSide })
          : kit.sails[i % kit.sails.length],
      );
      sail.rotation.x = Math.PI / 2;
      sail.rotation.y = -Math.atan2(f.widthAxis.y * sx, f.widthAxis.x * sx);
      sail.position.set(x, y, headerTop);
      group.add(sail);
      i += 1;
    }
  }

  buildMarker(group, el, selected) {
    const colour = selected ? COL.frameSel : (el.type === 'cone' ? COL.cone : COL.marker);
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
      return;
    }
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(el.dims.poleRadius, el.dims.poleRadius, el.dims.height, 8),
      new THREE.MeshLambertMaterial({ color: colour }),
    );
    pole.rotation.x = Math.PI / 2;
    pole.position.z = el.dims.height / 2;
    this.register(pole, el);
    group.add(pole);
    /*
     * The teardrop sail, with its LEADING EDGE ON THE MAST, and the same
     * print the world puts on it. The old preview drew a rectangle whose
     * inner edge happened to touch the pole; this is the outline a race flag
     * actually has, so an author placing markers sees what will stand there.
     */
    const h = el.dims.height;
    const sail = new THREE.Mesh(
      sailPlaneGeometry(el.dims.poleRadius, h),
      selected ? new THREE.MeshLambertMaterial({ color: COL.frameSel, side: THREE.DoubleSide })
        : this.bannerKit().sails[0],
    );
    /* Authored in XY with x out from the mast and y up, then stood upright
     * and turned to the marker's own heading in this Z up world. */
    sail.rotation.x = Math.PI / 2;
    sail.rotation.y = -el.yaw;
    group.add(sail);
  }

  buildStart(group, el, selected) {
    const mat = new THREE.MeshLambertMaterial({ color: selected ? COL.frameSel : COL.start });
    const n = Math.max(1, Math.round(el.dims.pads));
    for (let i = 0; i < n; i += 1) {
      const off = (i - (n - 1) / 2) * el.dims.spacing;
      const pad = new THREE.Mesh(new THREE.BoxGeometry(el.dims.padSize, el.dims.padSize, 0.04), mat);
      pad.position.set(-Math.sin(el.yaw) * off, Math.cos(el.yaw) * off, 0.02);
      pad.rotation.z = el.yaw;
      this.register(pad, el);
      group.add(pad);
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
