/*
 * propview.js: the two front props at the edge of the FPV picture, and the
 * craft's own shadow on the ground under the sun.
 *
 * The owner's ask, 2026-10-27: "we want props in view of the camera, just a
 * little bit, this will help pilots judge distance to the ground easier,
 * casting a shadow as physics permits, there should also be an option to
 * turn off props in view". Both are pictures of things that are really
 * there, each one small mesh and one draw call, behind its own row in
 * Settings. How much prop shows is set (PROP_REACH, see bake); where it
 * shows, and the shadow, are the geometry's and the sun's.
 *
 * THE PROPS SIT INSIDE THE NEAR PLANE, SO THEY ARE DRAWN FURTHER AWAY AND
 * BIGGER BY THE SAME FACTOR.
 *
 * A five inch's front blades pass a few centimetres from the lens and the
 * camera's near plane is 0.2 m (fpvNear in src/main.js), so the craft's own
 * discs, even if the craft were drawn, would be clipped away whole. Moving
 * the near plane in is not free: the whole world's depth precision is
 * spread over near to far. But a picture through a pinhole cannot tell a
 * disc at d from a disc K times as large at K times d, along the same ray,
 * so the two front discs are baked into the CAMERA's frame, scaled by
 * PROP_K about the lens, and the mesh follows the camera with one matrix
 * copy a frame. They are drawn last and without a depth test, because
 * nothing the camera can see is nearer than its own props: a wall that
 * close is a crash.
 *
 * The bake is redone only when what it depends on moves: the aircraft, its
 * drawn scale, the camera tilt, the field of view and the window's shape. A spinning blur disc is round, so a
 * frame's spin changes nothing in it and nothing is rebuilt per frame.
 *
 * THE SHADOW IS THE SUN'S, NOT A DOT UNDER THE QUAD.
 *
 * A real quad's shadow lands where the line from the sun through the craft
 * meets the ground, so with the sun behind the pilot it is out in front and
 * with the sun ahead it is behind and never seen, and that is kept. It is
 * a soft ellipse, stretched along the ground by how low the sun is, and it
 * fades as the craft climbs because the sun is a disc and not a point: half
 * a degree across, so the penumbra grows by about 4.6 mm a side for every
 * metre between craft and ground and spreads the same darkness over a
 * bigger patch. A five inch's umbra is gone by about twenty metres, which
 * is about how high a real one stops showing a shadow worth reading. The
 * world's own shadow map cannot do this: it is not on Low, its texel is
 * 7 to 14 cm, the craft is hidden in FPV, and the map is redrawn every few
 * frames (src/render/shadowrate.js), so a moving caster steps.
 *
 * WHAT THEY COST. Two meshes, each one draw call when on screen and none
 * when off it or switched off, a few hundred triangles between them, and
 * the program the craft's own blur discs already linked at boot (the same
 * MeshBasicMaterial with vertex alpha and fog), so nothing compiles in
 * flight. The props' fill is two slivers at the sides, about a sixteenth of the
 * width each; the shadow is a patch of ground. Per frame on the CPU: a matrix copy, three
 * height queries, a handful of vector operations, no allocation.
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
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* How much further away, and bigger, the props are drawn than they are. The
 * nearest blade passes about a centimetre from the lens, so this puts it
 * past the 0.2 m near plane with room to spare; the far edge of the disc
 * lands a few metres out, where fog has not started. */
const PROP_K = 40;

/* "Just a little bit": how far in from each side of the picture the prop
 * tips reach, as a fraction of its width. See bake. */
const PROP_REACH = 0.06;
/* How much denser the props are drawn than the model's own discs. */
const PROP_DENSITY = 5;

/* How dark the shadow is at its darkest, as the cel world's own shadows sit
 * against lit ground. */
const SHADOW_ALPHA = 0.42;
/* Half the sun's angular diameter, in radians: the penumbra's growth per
 * metre of craft to ground. */
const SUN_HALF_ANGLE = 0.00465;
/* What fraction of the craft's whole span throws a solid shadow. The props
 * are spinning blurs and pass most of the light, so it is the frame and the
 * pack, about half the motor to motor span. */
const SHADOW_CORE = 0.5;
/* A shadow fainter than this is not drawn at all: not a draw call. */
const SHADOW_MIN_ALPHA = 0.015;
/* Lifted off the ground, plus polygon offset, so it never fights the dirt. */
const SHADOW_LIFT = 0.012;

/* A soft disc of radius 1 in its own xz plane: solid to 0.55, then a ramp
 * of vertex alpha to clear at the rim. Vertex RGBA so the program is the
 * one the craft's blur discs use. */
function shadowDisc() {
  const SEG = 20;
  const pos = [0, 0, 0];
  const col = [1, 1, 1, 1];
  for (const [r, a] of [[0.55, 1], [1, 0]]) {
    for (let i = 0; i < SEG; i += 1) {
      const t = (i / SEG) * Math.PI * 2;
      pos.push(Math.cos(t) * r, 0, Math.sin(t) * r);
      col.push(1, 1, 1, a);
    }
  }
  const index = [];
  for (let i = 0; i < SEG; i += 1) {
    const j = (i + 1) % SEG;
    index.push(0, 1 + j, 1 + i);
    const a = 1 + i;
    const b = 1 + j;
    const c = 1 + SEG + i;
    const d = 1 + SEG + j;
    index.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  g.setIndex(index);
  g.computeBoundingSphere();
  return g;
}

/*
 * A spinning prop as the lens sees it from a few centimetres: clear at the
 * hub, densest in the band the tips draw, and a soft rim rather than the
 * model's hard one, because forty times the size (PROP_K) a 24 sided disc
 * shows its corners and a hard edge reads as a pink card, not a blur. Its
 * own ring of vertices, radius r, in its own xz plane, vertex RGBA as the
 * model's disc so the program is the same one. Faces down when `fromBelow`,
 * which is where this lens sees it from, and up otherwise: one side, not
 * DoubleSide, because a double sided material is another program.
 */
const PROP_RINGS = [[0.30, 0], [0.55, 0.30], [0.80, 0.75], [0.93, 1], [1.0, 0]];
function propDisc(r, fromBelow) {
  const SEG = 64;
  const pos = [];
  const col = [];
  for (const [f, a] of PROP_RINGS) {
    for (let i = 0; i < SEG; i += 1) {
      const t = (i / SEG) * Math.PI * 2;
      pos.push(Math.cos(t) * r * f, 0, Math.sin(t) * r * f);
      col.push(1, 1, 1, a);
    }
  }
  const index = [];
  for (let k = 0; k + 1 < PROP_RINGS.length; k += 1) {
    for (let i = 0; i < SEG; i += 1) {
      const j = (i + 1) % SEG;
      const a = k * SEG + i;
      const b = k * SEG + j;
      const c = (k + 1) * SEG + i;
      const d = (k + 1) * SEG + j;
      if (fromBelow) {
        index.push(a, c, b, b, c, d);
      } else {
        index.push(a, b, c, b, d, c);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  g.setIndex(index);
  return g;
}

export function buildPropView() {
  const group = new THREE.Group();
  group.name = 'prop-view';

  const propMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.2,
    depthWrite: false,
    depthTest: false,
    vertexColors: true,
    fog: true,
  });
  const props = new THREE.Mesh(new THREE.BufferGeometry(), propMat);
  props.name = 'prop-view-props';
  props.matrixAutoUpdate = false;
  props.renderOrder = 20;
  /* Layer 1 only: drawn in the colour pass, kept out of the outline
   * prepass, which reads layer 0 (src/render/post.js). */
  props.layers.set(1);
  props.visible = false;
  group.add(props);

  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x1a1420,
    transparent: true,
    opacity: SHADOW_ALPHA,
    depthWrite: false,
    vertexColors: true,
    fog: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const shadow = new THREE.Mesh(shadowDisc(), shadowMat);
  shadow.name = 'prop-view-shadow';
  shadow.matrixAutoUpdate = false;
  shadow.renderOrder = 2;
  shadow.layers.set(1);
  shadow.visible = false;
  group.add(shadow);

  /* What the props bake was made from. */
  let bakedDiscs = null;
  /* The front blur's material the colour was read from: a career livery
   * repaints it (src/render/herocraft.js paint), and the colour is copied
   * again every frame so a repaint shows without a bake. */
  let colorFrom = null;
  let bakedScale = NaN;
  let bakedTilt = NaN;
  let bakedFwd = NaN;
  let bakedUp = NaN;
  let bakedFov = NaN;
  let bakedAspect = NaN;
  /* Where the solve put the glass, for a check. */
  let bakedGlass = NaN;
  /* The craft's span in world metres, for the shadow. */
  let span = 0.2;

  const mCam = new THREE.Matrix4();
  const mDisc = new THREE.Matrix4();
  const mScale = new THREE.Matrix4();
  const qTilt = new THREE.Quaternion();
  const vA = new THREE.Vector3();
  const vB = new THREE.Vector3();
  const qId = new THREE.Quaternion();
  const AXIS_X = new THREE.Vector3(1, 0, 0);

  /*
   * How far in from the side of the picture the props reach, as a fraction
   * of its width, with the lens `fwd` metres ahead of the craft's centre:
   * the visible band of each front disc (alpha runs from half radius to the
   * rim, see herocraft.js) projected through this camera. Cheap enough to
   * run a few dozen times on a bake and never per frame.
   */
  function reachAt(front, fwd, up, tilt, tanV, aspect) {
    const ct = Math.cos(tilt);
    const st = Math.sin(tilt);
    let reach = 0;
    for (const f of front) {
      for (let i = 0; i < 48; i += 1) {
        const a = (i / 48) * Math.PI * 2;
        for (const rr of [0.5, 0.75, 1]) {
          const x = f.x + Math.cos(a) * f.r * rr;
          const y = f.y - up;
          const z = f.z + Math.sin(a) * f.r * rr + fwd;
          const yc = y * ct + z * st;
          const zc = -y * st + z * ct;
          if (zc > -1e-4) {
            continue;
          }
          const nx = x / -zc / (tanV * aspect);
          const ny = yc / -zc / tanV;
          if (nx >= -1 && nx <= 1 && ny >= -1 && ny <= 1) {
            const inward = (1 - Math.abs(nx)) * 0.5;
            if (inward > reach) {
              reach = inward;
            }
          }
        }
      }
    }
    return reach;
  }

  /*
   * Bake the front discs into the camera's frame. `discs` are the craft's
   * own (src/render/herocraft.js and whoopcraft.js, direct children of the
   * craft group, front ones at negative z); `scale` is the group's drawn
   * scale; o.fwd and o.up are where the glass is, in world metres along the
   * craft's own axes; o.tilt is the uptilt in radians.
   *
   * WHERE THE GLASS SITS IS SOLVED FOR, so the props show "just a little
   * bit" whatever the lens. At the glass's own place on this model the
   * tips reach 1 percent of the way in at 85 degrees and 24 percent at
   * 115, and nothing at 75: a centimetre of prop that close to the lens is
   * the whole difference, and a rectilinear lens stretches its edges where
   * a real fisheye squeezes them (src/render/lens.js), so the wide stops
   * would be mostly prop. Real frames put the glass anywhere from behind
   * the tips to clear of them; this one slides it fore or aft of the glass
   * until the tips come PROP_REACH of the width in. Where they show, high
   * at the sides with the camera flat and lower as it tilts up, is still
   * the geometry's.
   */
  function bake(discs, scale, o, fov, aspect) {
    bakedDiscs = discs;
    bakedScale = scale;
    bakedTilt = o.tilt;
    bakedFwd = o.fwd;
    bakedUp = o.up;
    bakedFov = fov;
    bakedAspect = aspect;
    const front = [];
    span = 0;
    for (const d of discs) {
      const p = d.geometry && d.geometry.parameters;
      const r = p && p.radiusTop ? p.radiusTop * scale * d.scale.x : 0;
      span = Math.max(span, Math.hypot(d.position.x, d.position.z) * scale + r);
      if (d.position.z < 0 && r > 0 && d.geometry.getAttribute('position')) {
        front.push({ d, r, x: d.position.x * scale, y: d.position.y * scale, z: d.position.z * scale });
      }
    }
    if (!(span > 0)) {
      span = 0.2;
    }
    const tanV = Math.tan((fov * Math.PI) / 360);
    /* Bisection on the glass's distance forward: the further forward, the
     * less prop. Bounded to the tips' own reach either side of the glass. */
    let fwd = o.fwd;
    if (front.length) {
      let tip = 0;
      for (const f of front) {
        tip = Math.max(tip, -f.z + f.r);
      }
      let lo = Math.max(0, o.fwd - tip);
      let hi = o.fwd + tip;
      if (reachAt(front, hi, o.up, o.tilt, tanV, aspect) >= PROP_REACH) {
        fwd = hi;
      } else if (reachAt(front, lo, o.up, o.tilt, tanV, aspect) <= PROP_REACH) {
        fwd = lo;
      } else {
        for (let i = 0; i < 24; i += 1) {
          const mid = (lo + hi) * 0.5;
          if (reachAt(front, mid, o.up, o.tilt, tanV, aspect) > PROP_REACH) {
            lo = mid;
          } else {
            hi = mid;
          }
        }
        fwd = (lo + hi) * 0.5;
      }
    }
    bakedGlass = fwd;
    qTilt.setFromAxisAngle(AXIS_X, o.tilt);
    mCam.compose(vA.set(0, o.up, -fwd), qTilt, vB.set(1, 1, 1)).invert();
    mScale.makeScale(PROP_K, PROP_K, PROP_K);
    const parts = [];
    let color = null;
    let opacity = 0.12;
    for (const f of front) {
      if (!color) {
        color = f.d.material.color;
        opacity = f.d.material.opacity;
        colorFrom = f.d.material;
      }
      /* Spin is left out: the disc is round. */
      mDisc.makeTranslation(f.x, f.y, f.z);
      mDisc.premultiply(mCam).premultiply(mScale);
      const g = propDisc(f.r, f.y > o.up);
      g.applyMatrix4(mDisc);
      parts.push(g);
    }
    props.geometry.dispose();
    if (parts.length) {
      props.geometry = mergeGeometries(parts);
      props.geometry.computeBoundingSphere();
      propMat.color.copy(color);
      /* Denser than on the model: the lens looks along the disc almost
       * edge on, through the band the tips draw, which is what a real feed
       * shows as a dark smear rather than a tint. */
      propMat.opacity = Math.min(0.6, opacity * PROP_DENSITY);
    } else {
      props.geometry = new THREE.BufferGeometry();
    }
    for (const g of parts) {
      g.dispose();
    }
  }

  const sun = new THREE.Vector3(0, 1, 0);
  let sunScene = null;
  const n = new THREE.Vector3();
  const u = new THREE.Vector3();
  const w = new THREE.Vector3();
  const hit = new THREE.Vector3();

  /* The scene's key light, read once per scene: the brightest directional
   * light, pointing from the ground to the sun. */
  function readSun(scene) {
    sunScene = scene;
    let best = -1;
    sun.set(0, 1, 0);
    scene.traverse((o) => {
      if (o.isDirectionalLight && o.intensity > best) {
        best = o.intensity;
        o.updateMatrixWorld();
        o.target.updateMatrixWorld();
        vA.setFromMatrixPosition(o.matrixWorld);
        vB.setFromMatrixPosition(o.target.matrixWorld);
        sun.subVectors(vA, vB);
      }
    });
    if (sun.lengthSq() < 1e-9 || sun.y <= 0.05) {
      sun.set(0, 1, 0);
    }
    sun.normalize();
  }

  return {
    group,
    props,
    shadow,

    /*
     * Once a frame, just before the draw, with the camera where it will be
     * drawn from. `o.props` and `o.shadow` say whether each is wanted this
     * frame (the setting and the FPV view, decided by the caller); `craft`
     * is the craft group, `discs` its discs, `height(x, z, fromY)` the
     * world's ground.
     */
    update(o) {
      const { camera, craft } = o;
      props.visible = false;
      shadow.visible = false;
      if (o.props && o.discs) {
        const scale = craft.scale.x;
        if (o.discs !== bakedDiscs || scale !== bakedScale || o.tilt !== bakedTilt
          || o.fwd !== bakedFwd || o.up !== bakedUp
          || camera.fov !== bakedFov || camera.aspect !== bakedAspect) {
          bake(o.discs, scale, o, camera.fov, camera.aspect);
        }
        if (colorFrom) {
          propMat.color.copy(colorFrom.color);
        }
        camera.updateMatrixWorld();
        props.matrix.copy(camera.matrixWorld);
        props.matrixWorldNeedsUpdate = true;
        props.visible = props.geometry.getAttribute('position') !== undefined;
      }
      if (o.shadow && o.height) {
        const scene = group.parent;
        if (scene && scene !== sunScene) {
          readSun(scene);
        }
        if (o.discs && o.discs !== bakedDiscs && !o.props) {
          bake(o.discs, craft.scale.x, o, camera.fov, camera.aspect);
        }
        /* Down the sun's ray from the craft to the ground: two passes, the
         * second from where the first one landed, so a slope is met where
         * it is rather than where it is under the craft. */
        const c = craft.position;
        let gy = o.height(c.x, c.z, c.y);
        for (let i = 0; i < 2; i += 1) {
          const t = (c.y - gy) / sun.y;
          hit.copy(c).addScaledVector(sun, -t);
          gy = o.height(hit.x, hit.z, c.y);
        }
        const dist = (c.y - gy) / sun.y;
        const core = span * SHADOW_CORE;
        const r = core + (dist > 0 ? dist : 0) * SUN_HALF_ANGLE;
        const alpha = SHADOW_ALPHA * (core / r) * (core / r);
        if (dist > -0.05 && alpha > SHADOW_MIN_ALPHA) {
          hit.y = gy;
          /* The ground's normal from two more samples, so the patch lies
           * on a bank rather than cutting into it. */
          const e = Math.max(0.25, r);
          n.set(
            gy - o.height(hit.x + e, hit.z, c.y),
            e,
            gy - o.height(hit.x, hit.z + e, c.y),
          ).normalize();
          /* u: the sun's direction laid along the ground, which is the way
           * the shadow stretches; w across it. */
          const sn = sun.dot(n);
          u.copy(sun).addScaledVector(n, -sn);
          if (u.lengthSq() < 1e-8) {
            u.set(1, 0, 0).addScaledVector(n, -n.x);
          }
          u.normalize();
          w.crossVectors(u, n);
          const stretch = r / Math.max(0.25, sn);
          shadow.matrix.set(
            u.x * stretch, n.x, w.x * r, hit.x + n.x * SHADOW_LIFT,
            u.y * stretch, n.y, w.y * r, hit.y + n.y * SHADOW_LIFT,
            u.z * stretch, n.z, w.z * r, hit.z + n.z * SHADOW_LIFT,
            0, 0, 0, 1,
          );
          shadow.matrixWorldNeedsUpdate = true;
          shadowMat.opacity = alpha;
          shadow.visible = true;
        }
      }
    },

    /* Where the last update left things, for a check. */
    state() {
      return {
        props: props.visible,
        shadow: shadow.visible,
        shadowAlpha: shadow.visible ? shadowMat.opacity : 0,
        sun: [sun.x, sun.y, sun.z],
        span,
        glass: bakedGlass,
      };
    },
  };
}
