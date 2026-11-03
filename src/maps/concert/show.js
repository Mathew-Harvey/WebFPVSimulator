/*
 * show.js: what moves at Hanabi Sound, and all of it on the GPU. The crowd
 * jumping on the beat, the fireworks over the stage, the lasers sweeping
 * the crowd, the LED wall and the side screens. Each is a fixed buffer
 * built once at load and a vertex or fragment shader that reads one shared
 * clock, so a frame of the show costs one uniform write and a handful of
 * draws, and nothing is allocated, sorted or uploaded after the build.
 *
 * FOR THE LATENCY RULE, the draws and what each costs:
 *
 *   the crowd       three instanced meshes, the crowd cut in three bands
 *                   front to back so a view away from the stage culls them;
 *                   a person is about forty triangles, thirty on Low, and
 *                   casts no shadow (the shadow pass never sees it)
 *   the fireworks   one point cloud, a few thousand points, additive, no
 *                   depth write, nothing drawn for a spark that is out
 *   the lasers      one mesh of crossed quads, additive, a few dozen
 *                   triangles in all
 *   the screens     one mesh of three quads and a short fragment shader of
 *                   halftone dots and rings, the comic's screen tone
 *
 * None of it is solid and none of it is read by the physics: the crowd's
 * collider is ./venue.js's blocks, and the fireworks and lasers are light.
 * The clock is the page's wall clock, which the render already has; it
 * never reaches the integrator, and a dropped frame changes only what the
 * next drawn frame shows.
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
import { cel } from '../city/vendored/core/toon.js';
import { w, LED, IMAG, IMAG_T, hash, fireworkShells, laserBeams } from './venue.js';

/* The tempo the whole field moves to: 128 beats a minute. The clock is
 * wrapped at ten minutes, a whole number of beats, so the shaders' sines
 * never see a large argument. */
const BPM = 128;
const BEAT_W = (Math.PI * BPM) / 60;
const WRAP = 600;

/* ------------------------------------------------------------------ */
/* The crowd                                                           */
/* ------------------------------------------------------------------ */

/* What the crowd wears, in linear light: black, white, the festival's pink
 * and teal and gold, denim, red, violet, grey. */
const SHIRTS = [0x24222c, 0xf2efe8, 0xf0508c, 0x2ec4c0, 0xf2b632, 0x3f5f9a, 0xe0483c, 0x7a4cc8, 0x9a98a4]
  .map((c) => new THREE.Color(c));
/* The skin, the lightest and the darkest of the crowd's: every person is
 * somewhere between, by their own number, so the mix is per person and not
 * per band. */
const SKIN_LIGHT = new THREE.Color(0xf0cfae);
const SKIN_DARK = new THREE.Color(0x9a6a4c);
const HAIR = new THREE.Color(0x2a2430);
const HAIR_BROWN = new THREE.Color(0x5e3c2c);
const HAIR_FAIR = new THREE.Color(0xd9b46a);
const HAIR_PINK = new THREE.Color(0xf27ab0);
const HAIR_TEAL = new THREE.Color(0x3cc8c0);
const LEGS = new THREE.Color(0x2f3446);
const EYES = new THREE.Color(0x1a1620);
const WHITE = new THREE.Color(1, 1, 1);

/* How close a person is drawn in their near build, in metres from the
 * camera to their feet. Inside it the crowd is the round one with faces
 * and fists; outside it the far one, which from there is a few pixels and
 * reads the same. */
const NEAR_R = 16;

/*
 * The three builds of one person, facing +x, feet at the origin, each an
 * indexed mesh with smooth normals, in the manga's own proportions: short
 * legs, a round body, a big round head, so a crowd of them reads as a page
 * of a comic and not as a field of posts.
 *
 *   near  six sided, a head of three rings with hair over the crown and
 *         two eyes, arms with fists. 100 triangles.
 *   far   four sided, a head of two rings, flat arms. 40 triangles.
 *   low   four sided, a head of one ring, no arms. 24 triangles.
 *
 * aMask says what each vertex is: 0 kept as drawn (legs, hair, eyes), 1 the
 * shirt (tinted per person), 2 an arm (a sleeve below the elbow's height and
 * skin above it, swung down to the side for a person whose arms are down),
 * 3 skin (toned per person), 4 hair (black, brown, fair or dyed, per
 * person).
 */
const BUILDS = {
  near: {
    sides: 6,
    legs: [[0.0, 0.09, 0.12], [0.74, 0.13, 0.17]],
    shirt: [[0.74, 0.14, 0.18], [1.08, 0.16, 0.22], [1.26, 0.1, 0.15]],
    chin: 1.3,
    head: [[1.36, 0.12, 0.11, 'jaw'], [1.5, 0.17, 0.16, 'face'], [1.65, 0.145, 0.135, 'hair']],
    crown: 1.75,
    arm: { sides: 4, r: 0.05, fist: true },
    eyes: true,
  },
  far: {
    sides: 4,
    legs: [[0.0, 0.1, 0.13], [0.74, 0.14, 0.18]],
    shirt: [[0.74, 0.15, 0.19], [1.26, 0.12, 0.18]],
    chin: 1.3,
    head: [[1.44, 0.16, 0.15, 'face'], [1.62, 0.14, 0.13, 'hair']],
    crown: 1.74,
    arm: { sides: 2, r: 0.06, fist: false },
    eyes: false,
  },
  low: {
    sides: 4,
    legs: [[0.0, 0.1, 0.13], [0.74, 0.14, 0.18]],
    shirt: [[0.74, 0.15, 0.19], [1.26, 0.12, 0.18]],
    chin: 1.3,
    head: [[1.52, 0.16, 0.15, 'face']],
    crown: 1.74,
    arm: null,
    eyes: false,
  },
};

/* Where an arm starts and, raised, where its hand is. */
const SHOULDER = [0, 1.22, 0.19];
const HAND = [0.08, 1.9, 0.36];

function personGeometry(B) {
  const pos = [];
  const col = [];
  const mask = [];
  const idx = [];
  const add = (x, y, z, c, m) => {
    pos.push(x, y, z);
    col.push(c.r, c.g, c.b);
    mask.push(m);
    return pos.length / 3 - 1;
  };
  const n = B.sides;
  /* Turned half a side, so a four sided body shows a corner to the stage
   * and not a flat board. */
  const turn = Math.PI / n;
  const ring = (y, rx, rz, pick) => {
    const out = [];
    for (let i = 0; i < n; i += 1) {
      const a = turn + (i / n) * Math.PI * 2;
      const [c, m] = pick(Math.cos(a));
      out.push(add(Math.cos(a) * rx, y, Math.sin(a) * rz, c, m));
    }
    return out;
  };
  const band = (a, b) => {
    for (let i = 0; i < n; i += 1) {
      const j = (i + 1) % n;
      idx.push(a[i], b[i], b[j], a[i], b[j], a[j]);
    }
  };
  const fan = (tip, r, up) => {
    for (let i = 0; i < n; i += 1) {
      const j = (i + 1) % n;
      if (up) {
        idx.push(tip, r[j], r[i]);
      } else {
        idx.push(tip, r[i], r[j]);
      }
    }
  };
  const legs = () => [LEGS, 0];
  const shirt = () => [WHITE, 1];
  /* The legs, feet to hips; the shirt on its own vertices from the hips,
   * so the colour changes at the belt without a band for it. The head
   * covers the shoulders' opening. */
  let prev = null;
  for (const [y, rx, rz] of B.legs) {
    const r = ring(y, rx, rz, legs);
    if (prev) {
      band(prev, r);
    }
    prev = r;
  }
  prev = null;
  for (const [y, rx, rz] of B.shirt) {
    const r = ring(y, rx, rz, shirt);
    if (prev) {
      band(prev, r);
    }
    prev = r;
  }
  /* The head: the chin, the rings, the crown. The face is the front of it,
   * skin; the back and the top are hair. */
  const skinOr = (lim) => (c) => (c > lim ? [WHITE, 3] : [WHITE, 4]);
  const pickOf = { jaw: skinOr(-0.6), face: skinOr(0.05), hair: skinOr(0.85) };
  const chin = add(0.02, B.chin, 0, WHITE, 3);
  const rings = B.head.map(([y, rx, rz, k]) => ring(y, rx, rz, pickOf[k]));
  fan(chin, rings[0], false);
  for (let i = 1; i < rings.length; i += 1) {
    band(rings[i - 1], rings[i]);
  }
  const crown = add(-0.02, B.crown, 0, WHITE, 4);
  fan(crown, rings[rings.length - 1], true);
  /* The eyes: two dark drops on the face, proud of it by a centimetre. */
  if (B.eyes) {
    for (const s of [-1, 1]) {
      const z = s * 0.07;
      const a = add(0.168, 1.51, z - 0.016, EYES, 0);
      const b = add(0.168, 1.51, z + 0.016, EYES, 0);
      const c = add(0.158, 1.58, z, EYES, 0);
      idx.push(a, c, b);
    }
  }
  /* The arms, shoulder to hand, raised: the shader swings an arm that is
   * down to the person's side. A fist closes a near arm; a far arm is a
   * flat strip, which from behind, where a drone mostly sees the crowd,
   * is the same shape. */
  if (B.arm) {
    const A = B.arm;
    for (const s of [-1, 1]) {
      const a0 = [SHOULDER[0], SHOULDER[1], s * SHOULDER[2]];
      const a1 = [HAND[0], HAND[1], s * HAND[2]];
      const rs = [];
      const steps = A.fist ? [0, 0.86] : [0, 1];
      for (const t of steps) {
        const r = [];
        const grow = t > 0.5 && A.fist ? 1.35 : 1;
        for (let i = 0; i < A.sides; i += 1) {
          const u = (i / A.sides) * Math.PI * 2;
          const ox = Math.cos(u) * A.r * grow;
          const oz = Math.sin(u) * A.r * grow;
          r.push(add(a0[0] + (a1[0] - a0[0]) * t + ox, a0[1] + (a1[1] - a0[1]) * t, a0[2] + (a1[2] - a0[2]) * t + oz, WHITE, 2));
        }
        rs.push(r);
      }
      for (let i = 0; i < A.sides; i += 1) {
        const j = (i + 1) % A.sides;
        idx.push(rs[0][i], rs[1][i], rs[1][j], rs[0][i], rs[1][j], rs[0][j]);
      }
      if (A.fist) {
        const tip = add(a1[0] + 0.01, a1[1] + 0.04, a1[2], WHITE, 2);
        for (let i = 0; i < A.sides; i += 1) {
          idx.push(tip, rs[1][(i + 1) % A.sides], rs[1][i]);
        }
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aMask', new THREE.Float32BufferAttribute(mask, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const glslColour = (c) => `vec3( ${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)} )`;

/*
 * The crowd's material: the town's cel shading with the vertex colours,
 * the shirt and the skin toned per person, the arms swung down where they
 * are down and waved where they are up, the jump on the beat, all in the
 * vertex shader. Chained after the cel material's own patch, which tints
 * its shadow side.
 *
 * `cut` splits the crowd between its near and far builds by the distance
 * from the camera to a person's feet, measured here on the GPU, so the
 * frame never sorts five thousand people: 'far' draws only those at
 * NEAR_R or more, 'near' only those closer, 'none' everybody (Low, which
 * has one build). A person cut away is folded to a point, which draws
 * nothing.
 */
function crowdMaterial(clock, cut) {
  const m = cel({ color: 0xffffff, vertexColors: true, tint: 0x6a5f8c, cache: false });
  const prev = m.onBeforeCompile;
  const prevKey = m.customProgramCacheKey ? m.customProgramCacheKey() : '';
  const test = { far: 'dc < NEAR_R', near: 'dc >= NEAR_R', none: 'false' }[cut];
  m.onBeforeCompile = (sh, r) => {
    if (prev) {
      prev.call(m, sh, r);
    }
    sh.uniforms.uClock = clock;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute float aMask;
attribute vec3 aShirt;
attribute vec3 aMove;
uniform float uClock;
#define NEAR_R ${NEAR_R.toFixed(1)}`)
      .replace('#include <color_vertex>', `#include <color_vertex>
#ifdef USE_COLOR
  {
    vec3 skin = mix( ${glslColour(SKIN_LIGHT)}, ${glslColour(SKIN_DARK)}, aMove.z );
    float isShirt = step( 0.5, aMask ) * step( aMask, 1.5 );
    float isArm = step( 1.5, aMask ) * step( aMask, 2.5 );
    float isSkin = step( 2.5, aMask ) * step( aMask, 3.5 );
    float isHair = step( 3.5, aMask );
    float hk = fract( aMove.y * 3.7 + aMove.z * 5.3 );
    vec3 hair = hk < 0.45 ? ${glslColour(HAIR)} : hk < 0.7 ? ${glslColour(HAIR_BROWN)} : hk < 0.86 ? ${glslColour(HAIR_FAIR)} : hk < 0.94 ? ${glslColour(HAIR_PINK)} : ${glslColour(HAIR_TEAL)};
    vec3 arm = mix( skin, aShirt, step( position.y, 1.48 ) );
    vec3 tone = isShirt * aShirt + isArm * arm + isSkin * skin + isHair * hair + ( 1.0 - isShirt - isArm - isSkin - isHair ) * vec3( 1.0 );
    vColor.rgb *= tone;
  }
#endif`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
  float beat = uClock * ${BEAT_W.toFixed(6)} + aMove.y * 0.8;
  float hop = abs( sin( beat ) );
  if ( aMask > 1.5 && aMask < 2.5 ) {
    /* Down: the arm turned about the shoulder, out and down to the side.
     * Up: it waves with the beat. */
    float sd = transformed.z > 0.0 ? 1.0 : -1.0;
    vec3 sh0 = vec3( 0.0, ${SHOULDER[1].toFixed(3)}, sd * ${SHOULDER[2].toFixed(3)} );
    vec3 d = transformed - sh0;
    float dz = d.z * sd;
    vec3 down = sh0 + vec3( d.x, d.y * -0.94 - dz * 0.342, sd * ( d.y * 0.342 - dz * 0.94 ) + sd * 0.06 );
    transformed = mix( down, transformed, aMove.x );
    transformed.z += sin( beat ) * 0.1 * max( 0.0, transformed.y - 1.4 ) * aMove.x;
  }
  transformed.y += hop * hop * ( 0.05 + 0.11 * aMove.x );
#ifdef USE_INSTANCING
  {
    vec3 org = ( modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
    float dc = distance( org, cameraPosition );
    if ( ${test} ) {
      transformed = vec3( 0.0 );
    }
  }
#endif`);
  };
  m.customProgramCacheKey = () => `${prevKey}|concertCrowd|${cut}`;
  return m;
}

/* Every person's matrix and colours, set once. */
function personMatrix(f, m) {
  const [x, , z] = w(f.x, f.y);
  _p.set(x, 0, z);
  /* The person's +x is their face; the plan's heading turns it. */
  _q.setFromAxisAngle(_up, (f.face * Math.PI) / 180);
  _s.set(f.s, f.s, f.s);
  return m.compose(_p, _q, _s);
}
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4();

function personColours(f, shirt, move, i) {
  const c = SHIRTS[f.shirt % SHIRTS.length];
  shirt[i * 3] = c.r;
  shirt[i * 3 + 1] = c.g;
  shirt[i * 3 + 2] = c.b;
  move[i * 3] = f.arms;
  move[i * 3 + 1] = f.phase;
  /* The skin by a hash of where they stand: anything from light to dark. */
  move[i * 3 + 2] = hash(Math.round(f.x * 100), Math.round(f.y * 100));
}

/*
 * The crowd. Everybody is in the far build, in three bands front to back,
 * each one instanced mesh, set once. On Medium and High the people near the
 * camera are drawn again in the near build by one more instanced mesh,
 * whose list is refilled only when the camera has moved a few metres: it
 * holds everybody within NEAR_R plus that slack, and the GPU's cut makes
 * the two builds meet exactly at NEAR_R.
 */
function crowdMeshes(people, clock, low) {
  const far = personGeometry(low ? BUILDS.low : BUILDS.far);
  const farMat = crowdMaterial(clock, low ? 'none' : 'far');
  const bands = [[0, 150], [150, 172], [172, 999]];
  const out = [];
  for (const [x0, x1] of bands) {
    const list = people.filter((f) => f.x >= x0 && f.x < x1);
    if (!list.length) {
      continue;
    }
    const g = far.clone();
    const shirt = new Float32Array(list.length * 3);
    const move = new Float32Array(list.length * 3);
    const inst = new THREE.InstancedMesh(g, farMat, list.length);
    list.forEach((f, i) => {
      inst.setMatrixAt(i, personMatrix(f, _m));
      personColours(f, shirt, move, i);
    });
    g.setAttribute('aShirt', new THREE.InstancedBufferAttribute(shirt, 3));
    g.setAttribute('aMove', new THREE.InstancedBufferAttribute(move, 3));
    inst.instanceMatrix.needsUpdate = true;
    inst.computeBoundingSphere();
    /* The jump lifts a head 16 cm: the bounds take it in. */
    inst.boundingSphere.radius += 0.3;
    inst.castShadow = false;
    inst.receiveShadow = true;
    inst.name = `concert crowd ${x0}`;
    out.push(inst);
  }
  far.dispose();
  if (low) {
    return { meshes: out, near: null };
  }
  return { meshes: out, near: nearCrowd(people, clock) };
}

/* The slack the near list is filled with, and how far the camera may move
 * before it is filled again: SLACK > MOVE, so the list always holds
 * everybody the GPU's cut will draw. */
const SLACK = 4;
const MOVE = 3;

function nearCrowd(people, clock) {
  const cap = Math.min(people.length, Math.ceil(Math.PI * (NEAR_R + SLACK) ** 2 * 1.5));
  const g = personGeometry(BUILDS.near);
  const shirt = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
  const move = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
  g.setAttribute('aShirt', shirt);
  g.setAttribute('aMove', move);
  const inst = new THREE.InstancedMesh(g, crowdMaterial(clock, 'near'), cap);
  inst.count = 0;
  inst.castShadow = false;
  inst.receiveShadow = true;
  inst.name = 'concert crowd near';
  /* Its bounds are wherever its list is: the whole crowd, which is never
   * wrong, and the list is small enough that culling it buys nothing. */
  inst.frustumCulled = false;
  /* Every person's feet in the world, and their own colours, once. */
  const fx = new Float32Array(people.length);
  const fz = new Float32Array(people.length);
  const mats = new Float32Array(people.length * 16);
  const sh = new Float32Array(people.length * 3);
  const mv = new Float32Array(people.length * 3);
  people.forEach((f, i) => {
    const [x, , z] = w(f.x, f.y);
    fx[i] = x;
    fz[i] = z;
    personMatrix(f, _m).toArray(mats, i * 16);
    personColours(f, sh, mv, i);
  });
  let cx = 1e9;
  let cy = 1e9;
  let cz = 1e9;
  const reach = (NEAR_R + SLACK) ** 2;
  return {
    mesh: inst,
    /* The camera's world position: refill the list if it has moved. */
    update(cam) {
      const dx = cam.x - cx;
      const dy = cam.y - cy;
      const dz = cam.z - cz;
      if (dx * dx + dy * dy + dz * dz < MOVE * MOVE) {
        return;
      }
      cx = cam.x;
      cy = cam.y;
      cz = cam.z;
      let k = 0;
      /* High over the crowd nobody is near: the list stays empty. */
      if (cy < NEAR_R + SLACK) {
        const flat = reach - cy * cy;
        const im = inst.instanceMatrix.array;
        for (let i = 0; i < fx.length && k < cap; i += 1) {
          const ex = fx[i] - cx;
          const ez = fz[i] - cz;
          if (ex * ex + ez * ez > flat) {
            continue;
          }
          im.set(mats.subarray(i * 16, i * 16 + 16), k * 16);
          shirt.array[k * 3] = sh[i * 3];
          shirt.array[k * 3 + 1] = sh[i * 3 + 1];
          shirt.array[k * 3 + 2] = sh[i * 3 + 2];
          move.array[k * 3] = mv[i * 3];
          move.array[k * 3 + 1] = mv[i * 3 + 1];
          move.array[k * 3 + 2] = mv[i * 3 + 2];
          k += 1;
        }
      }
      inst.count = k;
      if (k > 0) {
        for (const a of [inst.instanceMatrix, shirt, move]) {
          a.clearUpdateRanges();
          a.addUpdateRange(0, k * a.itemSize);
          a.needsUpdate = true;
        }
      }
    },
    stats: () => ({ cap, count: inst.count }),
  };
}

/* ------------------------------------------------------------------ */
/* The fireworks                                                       */
/* ------------------------------------------------------------------ */

const FW_COLOURS = [0xff4a5a, 0xffc24a, 0x5ae8ff, 0xff7ad0, 0x7aff8a, 0xfff4e0, 0xb48aff].map((c) => new THREE.Color(c));

const FW_VERT = /* glsl */ `
attribute vec3 aFrom;
attribute vec3 aVel;
attribute vec4 aShell;
attribute vec3 aCol;
attribute vec2 aSpark;
uniform float uClock;
uniform float uViewH;
varying vec3 vCol;
varying float vA;
const float RISE = 1.7;
void main() {
  float period = aShell.x;
  float t = mod( uClock + aShell.y, period ) - aSpark.y;
  float grav = aShell.z;
  float life = aShell.w;
  vec3 p;
  float a;
  float size;
  vCol = vec3( 0.0 );
  if ( t < 0.0 ) {
    a = 0.0;
    p = position;
    size = 0.0;
  } else if ( t < RISE ) {
    /* The shell going up: only the lead spark and its tail show. */
    float k = t / RISE;
    p = mix( aFrom, position, 1.0 - ( 1.0 - k ) * ( 1.0 - k ) );
    a = aSpark.x * 0.9 * ( 1.0 - aSpark.y * 5.0 );
    size = 0.9;
    vCol = vec3( 1.0, 0.82, 0.55 );
  } else {
    float tb = t - RISE;
    float drag = 1.1;
    p = position + aVel * ( 1.0 - exp( -drag * tb ) ) / drag;
    p.y -= 0.5 * grav * tb * tb;
    float f = clamp( 1.0 - tb / life, 0.0, 1.0 );
    a = f * f * ( 1.0 - aSpark.y * 4.0 ) * smoothstep( 0.0, 0.3, tb );
    /* The last third twinkles. */
    a *= f < 0.35 ? 0.55 + 0.45 * sin( uClock * 40.0 + aVel.x * 7.0 ) : 1.0;
    /* The burst's first instant is white hot. */
    vCol = mix( aCol, vec3( 1.2 ), clamp( 1.0 - tb * 2.5, 0.0, 1.0 ) * 0.35 );
    size = 2.4;
  }
  vA = a;
  vec4 mv = modelViewMatrix * vec4( p, 1.0 );
  gl_Position = projectionMatrix * mv;
  gl_PointSize = a > 0.003 ? clamp( size * projectionMatrix[1][1] * uViewH * 0.5 / max( 1.0, -mv.z ), 1.5, 28.0 ) : 0.0;
}`;

const FW_FRAG = /* glsl */ `
varying vec3 vCol;
varying float vA;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = 1.0 - dot( c, c ) * 4.0;
  if ( d <= 0.0 || vA <= 0.003 ) {
    discard;
  }
  gl_FragColor = vec4( vCol * d * d * 1.6, vA );
}`;

/* A direction on the unit sphere, the k-th of n, spread evenly. */
function sphereDir(k, n) {
  const y = 1 - (2 * (k + 0.5)) / n;
  const r = Math.sqrt(1 - y * y);
  const a = k * 2.399963229728653;
  return [Math.cos(a) * r, y, Math.sin(a) * r];
}

function fireworks(clock, viewH, low) {
  const shells = fireworkShells(low ? 14 : 24);
  const sparks = low ? 56 : 90;
  const tails = low ? 2 : 3;
  const N = shells.length * sparks * tails;
  const pos = new Float32Array(N * 3);
  const from = new Float32Array(N * 3);
  const vel = new Float32Array(N * 3);
  const shell = new Float32Array(N * 4);
  const colour = new Float32Array(N * 3);
  const spark = new Float32Array(N * 2);
  let n = 0;
  shells.forEach((sh, si) => {
    const at = w(...sh.at);
    const fr = w(...sh.from);
    const willow = sh.kind === 'willow';
    const ring = sh.kind === 'ring';
    const speed = willow ? 22 : ring ? 34 : 30;
    const c0 = willow ? new THREE.Color(0xffb84a) : FW_COLOURS[sh.colour];
    const c1 = FW_COLOURS[(sh.colour + 3) % FW_COLOURS.length];
    /* A ring's plane, tilted by the shell's own hash. */
    const tilt = hash(si, 71) * 1.2;
    for (let k = 0; k < sparks; k += 1) {
      let d;
      if (ring) {
        const a = (k / sparks) * Math.PI * 2;
        d = [Math.cos(a), Math.sin(a) * Math.sin(tilt), Math.sin(a) * Math.cos(tilt)];
      } else {
        d = sphereDir(k, sparks);
      }
      const v = speed * (0.88 + hash(si * 997 + k, 72) * 0.24);
      const c = !willow && k % 2 ? c1 : c0;
      for (let tl = 0; tl < tails; tl += 1) {
        pos.set(at, n * 3);
        from.set(fr, n * 3);
        vel.set([d[0] * v, d[1] * v, d[2] * v], n * 3);
        shell.set([sh.period, sh.offset, willow ? 7.5 : 4.0, willow ? 3.8 : 2.4], n * 4);
        colour.set([c.r, c.g, c.b], n * 3);
        spark.set([k === 0 ? 1 : 0, tl * 0.06], n * 2);
        n += 1;
      }
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aFrom', new THREE.BufferAttribute(from, 3));
  g.setAttribute('aVel', new THREE.BufferAttribute(vel, 3));
  g.setAttribute('aShell', new THREE.BufferAttribute(shell, 4));
  g.setAttribute('aCol', new THREE.BufferAttribute(colour, 3));
  g.setAttribute('aSpark', new THREE.BufferAttribute(spark, 2));
  /* The bounds the bursts can reach, so the cloud is culled with the rest
   * when the camera looks away from the stage. */
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(...w(244, 110, 80)), 130);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uClock: clock, uViewH: viewH },
    vertexShader: FW_VERT,
    fragmentShader: FW_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  const pts = new THREE.Points(g, mat);
  pts.name = 'concert fireworks';
  pts.renderOrder = 6;
  pts.userData.noOutline = true;
  return pts;
}

/* ------------------------------------------------------------------ */
/* The lasers                                                          */
/* ------------------------------------------------------------------ */

const LASER_COLOURS = [new THREE.Color(0x3affd8), new THREE.Color(0xff3aa8), new THREE.Color(0x7affff)];

const LASER_VERT = /* glsl */ `
attribute vec4 aBeam;
attribute vec3 aEnd;
attribute vec3 aCol;
uniform float uClock;
varying vec3 vCol;
varying float vT;
varying float vS;
void main() {
  float yaw = radians( aBeam.x ) + radians( aBeam.z ) * sin( uClock * 0.7 + aBeam.w );
  float pitch = radians( aBeam.y ) + 0.08 * sin( uClock * 0.45 + aBeam.w * 1.7 );
  /* A plan heading (east 0, north 90) in the world: x east, z south. */
  vec3 dir = vec3( cos( yaw ) * cos( pitch ), sin( pitch ), -sin( yaw ) * cos( pitch ) );
  vec3 side = normalize( cross( dir, vec3( 0.0, 1.0, 0.0 ) ) );
  vec3 up2 = cross( side, dir );
  float t = aEnd.x;
  vec3 off = ( aEnd.z < 0.5 ? side : up2 ) * aEnd.y * ( 0.1 + 0.9 * t );
  vec3 p = position + dir * 170.0 * t + off;
  vCol = aCol;
  vT = t;
  vS = aEnd.y;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( p, 1.0 );
}`;

const LASER_FRAG = /* glsl */ `
uniform float uClock;
varying vec3 vCol;
varying float vT;
varying float vS;
void main() {
  /* On for the drop, off for the break: twelve beats of sixteen. */
  float bar = fract( uClock * ${(BPM / 60 / 16).toFixed(6)} );
  float on = step( 0.25, bar );
  float edge = 1.0 - abs( vS );
  float a = edge * ( 1.0 - vT * 0.8 ) * on * 0.85;
  gl_FragColor = vec4( vCol * a, a );
}`;

function lasers(clock, low) {
  const beams = laserBeams(low ? 4 : 8);
  const pos = [];
  const beam = [];
  const end = [];
  const col = [];
  const idx = [];
  for (const b of beams) {
    const p = w(...b.from);
    const c = LASER_COLOURS[b.colour];
    for (let axis = 0; axis < 2; axis += 1) {
      const base = pos.length / 3;
      for (const [t, s] of [[0, -1], [0, 1], [1, 1], [1, -1]]) {
        pos.push(...p);
        beam.push(b.yaw, b.pitch, b.sweep, b.phase);
        end.push(t, s, axis);
        col.push(c.r, c.g, c.b);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aBeam', new THREE.Float32BufferAttribute(beam, 4));
  g.setAttribute('aEnd', new THREE.Float32BufferAttribute(end, 3));
  g.setAttribute('aCol', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(...w(120, 110, 30)), 180);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uClock: clock },
    vertexShader: LASER_VERT,
    fragmentShader: LASER_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = 'concert lasers';
  mesh.renderOrder = 5;
  mesh.userData.noOutline = true;
  return mesh;
}

/* ------------------------------------------------------------------ */
/* The screens                                                         */
/* ------------------------------------------------------------------ */

const SCREEN_VERT = /* glsl */ `
attribute float aAspect;
attribute float aSeed;
varying vec2 vUv;
varying float vAspect;
varying float vSeed;
void main() {
  vUv = uv;
  vAspect = aAspect;
  vSeed = aSeed;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`;

const SCREEN_FRAG = /* glsl */ `
uniform float uClock;
uniform vec3 uA;
uniform vec3 uB;
uniform vec3 uC;
uniform vec3 uNight;
varying vec2 vUv;
varying float vAspect;
varying float vSeed;
void main() {
  float beats = uClock * ${(BPM / 60).toFixed(6)} + vSeed;
  float b = fract( beats );
  float bar = mod( floor( beats / 8.0 ), 3.0 );
  vec3 ink = bar < 0.5 ? uA : ( bar < 1.5 ? uB : uC );
  vec3 ink2 = bar < 0.5 ? uB : ( bar < 1.5 ? uC : uA );
  vec2 p = ( vUv - 0.5 ) * vec2( vAspect, 1.0 );
  float r = length( p );
  /* The comic's screen tone: a grid of dots whose size rides a wave out
   * from the middle, pumped on the beat. */
  vec2 cells = vec2( 22.0 * vAspect, 22.0 );
  vec2 f = fract( vUv * cells ) - 0.5;
  float wave = 0.5 + 0.5 * sin( r * 9.0 - uClock * 3.2 );
  float dotR = 0.12 + 0.3 * wave * ( 1.0 - 0.5 * b );
  float dots = step( length( f ), dotR );
  /* Rings out from the middle on every beat. */
  float ring = 1.0 - smoothstep( 0.0, 0.03, abs( r - b * 0.9 * max( 1.0, vAspect * 0.5 ) ) );
  /* The equaliser along the bottom. */
  float col = floor( vUv.x * 32.0 );
  float lvl = 0.12 + 0.3 * fract( sin( col * 12.9898 + floor( beats * 2.0 ) * 78.233 ) * 43758.5453 );
  float eq = step( vUv.y, lvl ) * step( 0.15, fract( vUv.x * 32.0 ) );
  vec3 c = mix( uNight, ink * 0.9, dots );
  c = mix( c, ink2 * 1.2, ring * 0.9 );
  c = mix( c, ink2, eq * 0.85 );
  /* The flash on the beat, and a frame of ink round the picture. */
  c *= 1.0 + 0.7 * pow( 1.0 - b, 8.0 );
  float frame = step( 0.012, vUv.x ) * step( vUv.x, 0.988 ) * step( 0.02, vUv.y ) * step( vUv.y, 0.98 );
  gl_FragColor = vec4( c * frame, 1.0 );
}`;

function screens(clock) {
  const quads = [];
  /* The LED wall, facing west, and the side screens. */
  quads.push({ x: LED.x0 - 0.03, y0: LED.y0 + 0.2, y1: LED.y1 - 0.2, h0: LED.h0, h1: LED.h1 - 0.2, seed: 0 });
  IMAG.forEach((g, i) => {
    quads.push({ x: IMAG_T.x0 - 0.53, y0: g.y0, y1: g.y1, h0: IMAG_T.scr0 + 0.15, h1: IMAG_T.scr1 - 0.15, seed: 0.5 + i * 0.25 });
  });
  const pos = [];
  const uv = [];
  const aspect = [];
  const seed = [];
  const idx = [];
  for (const q of quads) {
    const base = pos.length / 3;
    const asp = (q.y1 - q.y0) / (q.h1 - q.h0);
    /* Facing west: seen from the crowd the plan's south is on the left. */
    for (const [y, h, u, v] of [[q.y0, q.h0, 0, 0], [q.y1, q.h0, 1, 0], [q.y1, q.h1, 1, 1], [q.y0, q.h1, 0, 1]]) {
      pos.push(...w(q.x, y, h));
      uv.push(u, v);
      aspect.push(asp);
      seed.push(q.seed);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aAspect', new THREE.Float32BufferAttribute(aspect, 1));
  g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uClock: clock,
      uA: { value: new THREE.Color(0xf0508c) },
      uB: { value: new THREE.Color(0x2ec4c0) },
      uC: { value: new THREE.Color(0xf2b632) },
      uNight: { value: new THREE.Color(0x14121e) },
    },
    vertexShader: SCREEN_VERT,
    fragmentShader: SCREEN_FRAG,
    side: THREE.DoubleSide,
    fog: false,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = 'concert screens';
  return mesh;
}

/* ------------------------------------------------------------------ */
/* The show                                                            */
/* ------------------------------------------------------------------ */

/*
 * Everything that moves, as one group, and the one call a frame that moves
 * it: tick(seconds) with the page's wall clock in seconds, and the height
 * of the picture the scene is drawn into, which sizes the sparks.
 */
export function buildShow(layout, low) {
  const clock = { value: 0 };
  const viewH = { value: 720 };
  const group = new THREE.Group();
  group.name = 'concert show';
  const crowd = crowdMeshes(layout.crowd, clock, low);
  for (const m of crowd.meshes) {
    group.add(m);
  }
  if (crowd.near) {
    group.add(crowd.near.mesh);
  }
  group.add(fireworks(clock, viewH, low));
  group.add(lasers(clock, low));
  group.add(screens(clock));
  let people = 0;
  let tris = 0;
  for (const o of crowd.meshes) {
    people += o.count;
    tris += o.count * (o.geometry.index.count / 3);
  }
  const nearTris = crowd.near ? crowd.near.mesh.geometry.index.count / 3 : 0;
  return {
    group,
    /* `cam` is the camera's world position, which picks the near crowd. */
    tick(seconds, height, cam) {
      clock.value = seconds % WRAP;
      if (height > 0) {
        viewH.value = height;
      }
      if (crowd.near && cam) {
        crowd.near.update(cam);
      }
    },
    stats: () => ({
      people,
      farTris: tris,
      near: crowd.near ? { ...crowd.near.stats(), tris: crowd.near.stats().count * nearTris } : null,
      draws: group.children.length,
    }),
  };
}
