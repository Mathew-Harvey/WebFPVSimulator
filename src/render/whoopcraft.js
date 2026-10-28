/*
 * whoopcraft.js: the 65 mm ducted whoop's model, and nothing else.
 *
 * The subject is a Fractal65, which is the aircraft src/native/plant.c flies
 * as SIM_AIRFRAME_WHOOP65: 65 mm motor to motor across the diagonal, a 31 mm
 * three blade prop in each of four smoked ducts, a Crazybee style stack on
 * a carbon X plate and a Turbowing Mullet camera on a printed mount at the
 * front. Real dimensions throughout, in metres, and the model is not drawn
 * from code any more: it is baked from the 3D model the owner supplied by
 * scripts/bake-fractal65.py into assets/whoop/fractal65.bin, about 17 kB,
 * and this file only reads it back.
 *
 * WHAT THE BAKE DID TO IT, and why. The source is 1.09 million triangles and
 * 34 MB, nearly all of it screw threads, motor windings and fillets nobody
 * can see at 65 mm. It is about 3,100 triangles now, drawn in 16 meshes:
 *
 *   one body          the carbon plate, the board and the camera mount, with
 *                     per face colours folded into the vertices
 *   one duct mesh     the four ducts, a smoked bowl that is nearly clear in
 *                     its wall and solid on its lip, by vertex alpha
 *   one stator mesh   the four motor cans, the one the stator glow is on
 *   one camera        tilts with the pilot's camera angle
 *   four rotors       the three blade prop, front pair and rear pair tinted
 *   four discs, four lamps (as before)
 *
 * Every colour is the sim's flat palette and not the model's textures, so
 * the picture is the same flat cel look as everything else here, at no cost
 * per pixel beyond a vertex colour. The ducts, the motors and the standoffs
 * are stored once and placed four times when the file is read.
 *
 * LOADED WHEN A WHOOP IS DRAWN. Nothing here is fetched until the first
 * buildWhoopCraft call, so a visitor who never picks a whoop never downloads
 * it, and every later build reuses the one parse. The group comes back at
 * once with its rotors, discs and lamps in place and the model fills in a
 * moment later, so nothing that holds the craft has to wait. whoopModelReady
 * is for the few callers that must (a share card is taken once it resolves).
 *
 * The contract with the shell is herocraft.js's, field for field: group,
 * discs, blades, leds, cameraMount, stator, propSpin. src/render/shell.js
 * and src/main.js do not learn that there are two aircraft.
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
import { celMaterial } from './celmat.js';
import { WORLD_SCALE } from './frame.js';
import { PROP_SPIN, inkShell } from './herocraft.js';
import { HOUSE_LIVERY, tintMaterial } from './livery.js';
import { WHOOP_TRUE_DIMS, MICRO_SCALE } from '../../configs/airframes.js';

const WHOOP_DIMS = WHOOP_TRUE_DIMS;
const PROP_R = WHOOP_DIMS.propR; /* 31 mm Gemfan 1207 three blade */
const MODEL_URL = new URL('../../assets/whoop/fractal65.bin', import.meta.url).href;
/* The file's position unit, metres: int16 steps of two micrometres. */
const Q = 2e-6;
/* Where the blades turn, in the craft frame: the baked blade sits at this
 * height already, and the blur disc goes over it. */
const DISC_Y = 0.0118;

/*
 * The camera mount, in the Three.js craft frame, and it is NOT
 * lens.js's CAMERA_MOUNT_FORWARD / CAMERA_MOUNT_UP.
 *
 * Those two are the 5 inch's, 80 mm forward and 18 mm up, which on a machine
 * 72 mm long end to end would put the lens a body length in front of the
 * aircraft. The whoop carries its camera at the front of the stack, so
 * this is 24 mm forward and 12 mm up, which is the same pair
 * src/native/plant.c gives the whoop as camera_x and camera_z. The two are
 * the same point and they agree on purpose: the collision code projects that
 * point against the ground so a nose down arrival does not park the lens
 * under the floor. The mount group is what the shell parents the FPV view
 * to and main.js turns it by the pilot's camera angle.
 */
export const WHOOP_MOUNT_FORWARD = 0.024;
export const WHOOP_MOUNT_UP = 0.012;

/* ------------------------------------------------------------------ */
/* The file                                                           */
/* ------------------------------------------------------------------ */

/*
 * Layout, little endian: 'FR65', a colour count and that many RGB triples,
 * the camera's pivot as three floats, a section count, then per section its
 * instance count and that many int16 x y z offsets, a vertex and triangle
 * count, int16 positions, uint16 indices and one uint8 colour index a
 * triangle. Sections in order: body, duct, motor, post, camera, blade.
 */
function parseModel(buf) {
  const dv = new DataView(buf);
  if (dv.getUint32(0, false) !== 0x46523635) {
    throw new Error('whoopcraft: not a Fractal65 file');
  }
  let o = 4;
  const nCol = dv.getUint8(o);
  o += 1;
  const palette = [];
  for (let i = 0; i < nCol; i += 1) {
    palette.push(new THREE.Color().setRGB(
      dv.getUint8(o) / 255, dv.getUint8(o + 1) / 255, dv.getUint8(o + 2) / 255,
      THREE.SRGBColorSpace,
    ));
    o += 3;
  }
  const pivot = new THREE.Vector3(
    dv.getFloat32(o, true), dv.getFloat32(o + 4, true), dv.getFloat32(o + 8, true),
  );
  o += 12;
  const nSec = dv.getUint8(o);
  o += 1;
  const sections = [];
  for (let s = 0; s < nSec; s += 1) {
    const nInst = dv.getUint8(o);
    o += 1;
    const inst = [];
    for (let i = 0; i < nInst; i += 1) {
      inst.push([
        dv.getInt16(o, true) * Q, dv.getInt16(o + 2, true) * Q, dv.getInt16(o + 4, true) * Q,
      ]);
      o += 6;
    }
    const nv = dv.getUint16(o, true);
    const nt = dv.getUint16(o + 2, true);
    o += 4;
    const pos = new Float32Array(nv * 3);
    for (let i = 0; i < nv * 3; i += 1) {
      pos[i] = dv.getInt16(o + i * 2, true) * Q;
    }
    o += nv * 6;
    const idx = new Uint16Array(nt * 3);
    for (let i = 0; i < nt * 3; i += 1) {
      idx[i] = dv.getUint16(o + i * 2, true);
    }
    o += nt * 6;
    const col = new Uint8Array(buf, o, nt);
    o += nt;
    sections.push({ inst, pos, idx, col });
  }
  return { palette, pivot, sections };
}

let modelPromise = null;

/*
 * The model, fetched once, on the first call. A failed fetch is not cached,
 * so the next whoop gets another try, and the build that asked draws a plain
 * plate in the meantime (see fallbackBody).
 */
export function whoopModelReady() {
  if (!modelPromise) {
    modelPromise = fetch(MODEL_URL)
      .then((r) => {
        if (!r.ok) {
          throw new Error(`whoopcraft: ${MODEL_URL} answered ${r.status}`);
        }
        return r.arrayBuffer();
      })
      .then(parseModel)
      .catch((e) => {
        modelPromise = null;
        throw e;
      });
  }
  return modelPromise;
}

/*
 * One section as a flat shaded, unindexed geometry: each instance copied
 * out, each triangle its own three vertices with its face normal and its
 * palette colour. `flipX` mirrors it (the counter clockwise prop is the
 * clockwise one's mirror image) and reverses the winding to match. `alpha`
 * adds a fourth colour channel from a function of the vertex's height.
 */
function sectionGeometry(sec, palette, { flipX = false, alpha = null } = {}) {
  const nT = sec.idx.length / 3;
  const total = nT * sec.inst.length;
  const pos = new Float32Array(total * 9);
  const nor = new Float32Array(total * 9);
  const stride = alpha ? 4 : 3;
  const col = new Float32Array(total * 3 * stride);
  const sx = flipX ? -1 : 1;
  const order = flipX ? [0, 2, 1] : [0, 1, 2];
  let w = 0;
  let c = 0;
  for (const [ix, iy, iz] of sec.inst) {
    for (let t = 0; t < nT; t += 1) {
      const p = [];
      for (let k = 0; k < 3; k += 1) {
        const v = sec.idx[t * 3 + order[k]] * 3;
        p.push(sec.pos[v] * sx + ix, sec.pos[v + 1] + iy, sec.pos[v + 2] + iz);
      }
      const ux = p[3] - p[0];
      const uy = p[4] - p[1];
      const uz = p[5] - p[2];
      const vx = p[6] - p[0];
      const vy = p[7] - p[1];
      const vz = p[8] - p[2];
      let nx = uy * vz - uz * vy;
      let ny = uz * vx - ux * vz;
      let nz = ux * vy - uy * vx;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      nz /= len;
      const rgb = palette[sec.col[t]];
      for (let k = 0; k < 3; k += 1) {
        pos[w] = p[k * 3];
        pos[w + 1] = p[k * 3 + 1];
        pos[w + 2] = p[k * 3 + 2];
        nor[w] = nx;
        nor[w + 1] = ny;
        nor[w + 2] = nz;
        w += 3;
        col[c] = rgb.r;
        col[c + 1] = rgb.g;
        col[c + 2] = rgb.b;
        if (alpha) {
          col[c + 3] = alpha(p[k * 3 + 1] - iy);
        }
        c += stride;
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, stride));
  return g;
}

export function buildWhoopCraft(opts = {}) {
  const fog = opts.fog !== false;
  const lite = Boolean(opts.lite);
  const inkOn = !lite;
  const shade = !lite;
  const cel = (o) => celMaterial({ fog, cloudShadow: 0, ...o });
  /* A cel material that takes its colour from the vertices. vertexColors is
   * set after construction because celMaterial's options do not carry it. */
  const finish = (o) => {
    const m = cel({ color: 0xffffff, ...o });
    m.vertexColors = true;
    return m;
  };
  const group = new THREE.Group();
  group.name = opts.name ?? 'whoop-craft';
  /*
   * MICRO_SCALE ALWAYS, WORLD_SCALE ONLY IN THE WORLD.
   *
   * The model is a real 65 mm whoop. Every room this aircraft is ever drawn
   * in is built MICRO_SCALE times life size, so the model has to be too or it
   * is a speck under a 2.4 m gate. It is unconditional because the aircraft
   * is the same size on a share card and in an orbit as it is in the world.
   */
  group.scale.setScalar(MICRO_SCALE / (opts.worldScale ? WORLD_SCALE : 1));

  const bodyMat = finish({ rim: 0.34, spec: 0.30, specWidth: 0.016 });
  const ductMat = finish({ rim: 0.40, spec: 0.50, specWidth: 0.020, transparent: true });
  ductMat.depthWrite = false;
  const stator = finish({ rim: 0.24, spec: 0.40, specWidth: 0.020 });
  const camMat = finish({ rim: 0.28, spec: 0.50, specWidth: 0.020, specColor: 0xf3ead4 });
  /*
   * THE BLADES ARE CLEAR, not coloured, because a Gemfan 1207 is moulded in
   * unpigmented polycarbonate and on the real aircraft you look straight
   * through the disc at the duct wall behind it. Front and rear still differ,
   * because a pilot has to be able to tell which way the thing is facing when
   * it is 15 m away and 65 mm across, so the difference is a tint in the
   * clear rather than two solid colours.
   */
  const propFront = finish({
    rim: 0.34, spec: 0.72, specWidth: 0.022, transparent: true, opacity: 0.88,
  });
  propFront.color.setHex(0xf4e2e8);
  const propRear = finish({
    rim: 0.32, spec: 0.68, specWidth: 0.022, transparent: true, opacity: 0.84,
  });
  propRear.color.setHex(0xe8f0f2);
  const ink = 0x0c120e;

  /* Meshes with nothing in them yet: the model lands in fill(). */
  const empty = () => new THREE.BufferGeometry();
  const body = new THREE.Mesh(empty(), bodyMat);
  const ducts = new THREE.Mesh(empty(), ductMat);
  const statorMesh = new THREE.Mesh(empty(), stator);
  const camMesh = new THREE.Mesh(empty(), camMat);
  body.castShadow = shade;
  ducts.renderOrder = -1;
  for (const m of [body, ducts, statorMesh, camMesh]) {
    m.visible = false;
    m.frustumCulled = false;
  }
  group.add(body, ducts, statorMesh);

  /*
   * The measurement box, hidden, on the same contract herocraft.js has with
   * check 15: a direct child BoxGeometry whose depth is the published body
   * length. A whoop is as wide as it is long because the ducts define both.
   */
  if (opts.measure) {
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(WHOOP_DIMS.bodyWidth, WHOOP_DIMS.bodyHeight, WHOOP_DIMS.bodyLength),
      bodyMat,
    );
    box.visible = false;
    box.castShadow = false;
    group.add(box);
  }

  /* The mount group is what the shell parents the FPV view to; the drawn
   * camera hangs off it at its own offset once the model is in. */
  const cameraMount = new THREE.Group();
  cameraMount.position.set(0, WHOOP_MOUNT_UP, -WHOOP_MOUNT_FORWARD);
  cameraMount.name = 'whoop-camera-mount';
  group.add(cameraMount);
  cameraMount.add(camMesh);

  const blades = [];
  const discs = [];
  const leds = [];
  /* The motors sit where the model puts them, filled in from the file; the
   * order and the signs are the five inch's, so PROP_SPIN and the pose code
   * address the same corner. */
  const signs = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  const rotors = [];
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 4; i += 1) {
    const [sx, sz] = signs[i];
    const front = sz < 0;
    const motor = new THREE.Group();
    group.add(motor);
    const rotor = new THREE.Group();
    motor.add(rotor);
    const blade = new THREE.Mesh(empty(), front ? propFront : propRear);
    blade.castShadow = shade;
    blade.visible = false;
    blade.frustumCulled = false;
    rotor.add(blade);
    blades.push(rotor);
    rotors.push({ motor, blade, sx, sz });

    /*
     * The blur disc, a direct child of the group on herocraft.js's own
     * contract so a scale check that walks g.children can see it. It is
     * fainter than the 5 inch's because a whoop's disc is inside a duct and
     * you are looking down a bore at it.
     */
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(PROP_R, PROP_R, 0.0006, lite ? 12 : 22),
      new THREE.MeshBasicMaterial({
        color: front ? 0xf0d8e0 : 0xdde6e8,
        transparent: true,
        opacity: 0.09,
        depthWrite: false,
        fog,
      }),
    );
    disc.renderOrder = 1;
    disc.visible = false;
    group.add(disc);
    discs.push(disc);

    /* One lamp a corner, under the plate and inside the board's footprint,
     * so from above the aircraft's outline is the ducts' alone and from
     * below the four of them show beside the pack. */
    const ledMat = new THREE.MeshBasicMaterial({ color: front ? 0xe8a8b8 : 0x7dffb4, fog });
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.0022, 0.0008, 0.0030), ledMat);
    led.visible = false;
    group.add(led);
    leds.push({ mesh: led, mat: ledMat, front, base: front ? 0xe8a8b8 : 0x7dffb4 });
  }

  /*
   * A career livery (src/render/livery.js): its chrome on the ducts, which
   * are what a whoop is seen by, retinted through their material's colour.
   * The model may still be on its way, so the livery is kept and painted
   * once fill() knows what colour the ducts are. The house paint is the
   * whoop as it was moulded: its ducts keep their own grey, which is not
   * the five inch's sakura, or every whoop pilot's quad would turn pink
   * at boot without ever opening the career.
   */
  let ductBase = null;
  let wanted = null;
  const paint = (livery) => {
    wanted = livery || null;
    if (ductBase != null && wanted && !lite) {
      tintMaterial(ductMat, ductBase, wanted.id === HOUSE_LIVERY ? ductBase : wanted.chrome);
    }
  };

  /* What a failed fetch leaves: a plain plate, so the quad is still there. */
  const fallbackBody = () => {
    body.geometry.dispose();
    body.geometry = new THREE.BoxGeometry(0.060, 0.003, 0.056);
    body.material = cel({ color: 0x2a3236 });
    body.visible = true;
  };

  const fill = (model) => {
    if (group.userData.disposed) {
      return;
    }
    const [bodySec, ductSec, motorSec, postSec, camSec, bladeSec] = model.sections;
    body.geometry = sectionGeometry(bodySec, model.palette);
    if (inkOn) {
      inkShell(body, 0.00020, ink, fog);
    }
    body.visible = true;
    /* Vertex alpha: a nearly clear wall, a solid lip and a firmer skirt. */
    let top = -Infinity;
    let bottom = Infinity;
    for (let i = 1; i < ductSec.pos.length; i += 3) {
      top = Math.max(top, ductSec.pos[i]);
      bottom = Math.min(bottom, ductSec.pos[i]);
    }
    ducts.geometry = sectionGeometry(ductSec, model.palette, {
      alpha: (y) => {
        if (y > top - 0.0021) {
          return 0.85;
        }
        return y < bottom + 0.0012 ? 0.6 : 0.20;
      },
    });
    ducts.visible = true;
    /* The ducts' own colour, the one most of their triangles wear, which a
     * livery's chrome is painted over (paint below). */
    const used = new Map();
    for (const c of ductSec.col) {
      used.set(c, (used.get(c) || 0) + 1);
    }
    const most = [...used.entries()].sort((a, b) => b[1] - a[1])[0];
    ductBase = most ? model.palette[most[0]].getHex() : null;
    paint(wanted);
    /* The motors and standoffs share one mesh: the stator glow lights both. */
    statorMesh.geometry = mergeSections([
      sectionGeometry(motorSec, model.palette),
      sectionGeometry(postSec, model.palette),
    ]);
    statorMesh.visible = true;
    camMesh.geometry = sectionGeometry(camSec, model.palette);
    camMesh.position.copy(model.pivot).sub(cameraMount.position);
    camMesh.visible = true;

    const bladeGeo = [
      sectionGeometry(bladeSec, model.palette),
      sectionGeometry(bladeSec, model.palette, { flipX: true }),
    ];
    let mx = 0;
    let mz = 0;
    for (const [x, , z] of motorSec.inst) {
      mx = Math.max(mx, Math.abs(x));
      mz = Math.max(mz, Math.abs(z));
    }
    for (let i = 0; i < 4; i += 1) {
      const { motor, blade, sx, sz } = rotors[i];
      motor.position.set(sx * mx, 0, sz * mz);
      blade.geometry = bladeGeo[PROP_SPIN[i] < 0 ? 0 : 1];
      blade.visible = true;
      discs[i].position.set(sx * mx, DISC_Y, sz * mz);
      discs[i].visible = true;
      /* 38 percent of the way to the motor, under the plate. */
      const led = leds[i].mesh;
      led.position.set(sx * mx * 0.38, -0.0030, sz * mz * 0.38);
      dummy.position.copy(led.position);
      dummy.lookAt(sx * mx, led.position.y, sz * mz);
      dummy.updateMatrix();
      led.quaternion.copy(dummy.quaternion);
      led.visible = true;
    }
  };
  /*
   * NOT ON 'removed'. This listened for the group leaving its parent and
   * gave up on the model then, which is right for a craft swapped out and
   * wrong for the session's craft, which leaves one map's scene for the
   * next on every map load (keepAcrossMaps in src/render/shell.js). A first
   * visit that seats the whoop between maps starts the fetch, the map
   * changes before it lands, and the whoop stayed an empty group for the
   * whole session: the owner's empty start pad of 2026-10-23, seen in a
   * private window because only a cold cache is slow enough. The shell's
   * disposeTree marks a craft it has released, and that is what is read.
   */
  const ready = whoopModelReady().then(fill, (e) => {
    console.warn(`whoopcraft: the model did not load: ${e && e.message}`);
    fallbackBody();
  });

  return {
    group,
    discs,
    blades,
    leds,
    cameraMount,
    stator,
    /* Resolves once the model is on the craft. */
    ready,
    /* Props in, same as the 5 inch and same as PLANT_SPIN in plant.c. */
    propSpin: PROP_SPIN,
    paint,
  };
}

/* Two geometries of the same attributes as one. */
function mergeSections(list) {
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color']) {
    const size = list[0].getAttribute(name).itemSize;
    const arr = new Float32Array(list.reduce((n, g) => n + g.getAttribute(name).array.length, 0));
    let o = 0;
    for (const g of list) {
      arr.set(g.getAttribute(name).array, o);
      o += g.getAttribute(name).array.length;
      g.dispose();
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  return out;
}
