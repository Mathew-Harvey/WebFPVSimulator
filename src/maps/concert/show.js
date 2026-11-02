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
const SKIN = [new THREE.Color(0xebc6a2), new THREE.Color(0xd8a882), new THREE.Color(0xb98a68)];
const HAIR = new THREE.Color(0x2a2430);
const LEGS = new THREE.Color(0x2f3446);

/*
 * One person, facing +x, feet at the origin, as an indexed mesh with
 * smooth normals: a body lathed round an ellipse (legs, waist, shoulders,
 * neck), a head of two fans round one ring, the hair the top fan's colour,
 * and two arms raised in a V. aMask says what each vertex is: 0 legs, skin
 * or hair (kept), 1 shirt (tinted per person), 2 an arm (folded away for a
 * person whose arms are down).
 */
function personGeometry(sides, arms = true) {
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
  const shirt = new THREE.Color(1, 1, 1);
  const ring = (y, rx, rz, c, m) => {
    const out = [];
    for (let i = 0; i < sides; i += 1) {
      const a = (i / sides) * Math.PI * 2;
      out.push(add(Math.cos(a) * rx, y, Math.sin(a) * rz, c, m));
    }
    return out;
  };
  const band = (a, b) => {
    for (let i = 0; i < sides; i += 1) {
      const j = (i + 1) % sides;
      idx.push(a[i], b[i], b[j], a[i], b[j], a[j]);
    }
  };
  /* The legs, feet to hips; the shirt, hips to shoulders, on its own
   * vertices so the colour changes at the belt without a band for it; the
   * shoulders closed by a fan up to the neck. */
  band(ring(0.0, 0.1, 0.13, LEGS, 0), ring(0.88, 0.12, 0.17, LEGS, 0));
  const top = ring(1.38, 0.12, 0.22, shirt, 1);
  band(ring(0.88, 0.12, 0.17, shirt, 1), top);
  const neck = add(0, 1.5, 0, shirt, 1);
  for (let i = 0; i < sides; i += 1) {
    idx.push(neck, top[(i + 1) % sides], top[i]);
  }
  /* The head: a ring at the cheeks, the chin below, the crown above. */
  const hs = sides;
  const chin = add(0.01, 1.5, 0, SKIN[0], 0);
  const crown = add(-0.01, 1.78, 0, HAIR, 0);
  const cheeks = [];
  for (let i = 0; i < hs; i += 1) {
    const a = (i / hs) * Math.PI * 2;
    /* The face side is skin, the back of the head hair. */
    const c = Math.cos(a) > 0.2 ? SKIN[0] : HAIR;
    cheeks.push(add(Math.cos(a) * 0.105, 1.66, Math.sin(a) * 0.1, c, 0));
  }
  for (let i = 0; i < hs; i += 1) {
    const j = (i + 1) % hs;
    idx.push(chin, cheeks[i], cheeks[j]);
    idx.push(crown, cheeks[j], cheeks[i]);
  }
  /* The arms: each a three sided prism from the shoulder up and out. Low
   * leaves them off: a raised arm is two pixels from a drone. */
  for (const s of arms ? [-1, 1] : []) {
    const a0 = [0, 1.36, s * 0.2];
    const a1 = [0.08, 2.02, s * 0.36];
    const ring0 = [];
    const ring1 = [];
    for (let i = 0; i < 3; i += 1) {
      const t = (i / 3) * Math.PI * 2;
      const ox = Math.cos(t) * 0.045;
      const oz = Math.sin(t) * 0.045;
      ring0.push(add(a0[0] + ox, a0[1], a0[2] + oz, shirt, 2));
      ring1.push(add(a1[0] + ox, a1[1], a1[2] + oz, SKIN[0], 2));
    }
    for (let i = 0; i < 3; i += 1) {
      const j = (i + 1) % 3;
      idx.push(ring0[i], ring1[i], ring1[j], ring0[i], ring1[j], ring0[j]);
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

/* The crowd's material: the town's cel shading with the vertex colours,
 * the shirt tinted per person, the arms folded away where they are down,
 * and the jump on the beat, all in the vertex shader. Chained after the
 * cel material's own patch, which tints its shadow side. */
function crowdMaterial(clock) {
  const m = cel({ color: 0xffffff, vertexColors: true, tint: 0x6a5f8c, cache: false });
  const prev = m.onBeforeCompile;
  const prevKey = m.customProgramCacheKey ? m.customProgramCacheKey() : '';
  m.onBeforeCompile = (sh, r) => {
    if (prev) {
      prev.call(m, sh, r);
    }
    sh.uniforms.uClock = clock;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute float aMask;
attribute vec3 aShirt;
attribute vec2 aMove;
uniform float uClock;`)
      .replace('#include <color_vertex>', `#include <color_vertex>
#ifdef USE_COLOR
  vColor.rgb *= mix( vec3( 1.0 ), aShirt, step( 0.5, aMask ) * step( aMask, 1.5 ) );
  vColor.rgb *= mix( vec3( 1.0 ), aShirt, step( 1.5, aMask ) * step( position.y, 1.6 ) );
#endif`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
  float beat = uClock * ${BEAT_W.toFixed(6)} + aMove.y * 0.8;
  float hop = abs( sin( beat ) );
  if ( aMask > 1.5 ) {
    /* Arms down: fold the arm into the shoulder. Up: wave with the beat. */
    transformed = mix( vec3( 0.0, 1.36, transformed.z > 0.0 ? 0.2 : -0.2 ), transformed, aMove.x );
    transformed.z += sin( beat ) * 0.1 * max( 0.0, transformed.y - 1.4 );
  }
  transformed.y += hop * hop * ( 0.05 + 0.11 * aMove.x );`);
  };
  m.customProgramCacheKey = () => `${prevKey}|concertCrowd`;
  return m;
}

/* The crowd in three bands, front to back, each one instanced mesh. */
function crowdMeshes(people, clock, low) {
  const geo = personGeometry(low ? 4 : 5, !low);
  const mat = crowdMaterial(clock);
  const bands = [[0, 150], [150, 172], [172, 999]];
  const out = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  for (const [x0, x1] of bands) {
    const list = people.filter((f) => f.x >= x0 && f.x < x1);
    if (!list.length) {
      continue;
    }
    const g = geo.clone();
    const shirt = new Float32Array(list.length * 3);
    const move = new Float32Array(list.length * 2);
    const inst = new THREE.InstancedMesh(g, mat, list.length);
    list.forEach((f, i) => {
      const [x, , z] = w(f.x, f.y);
      p.set(x, 0, z);
      /* The person's +x is their face; the plan's heading turns it. */
      q.setFromAxisAngle(up, (f.face * Math.PI) / 180);
      s.set(f.s, f.s, f.s);
      m.compose(p, q, s);
      inst.setMatrixAt(i, m);
      const c = SHIRTS[f.shirt % SHIRTS.length];
      shirt[i * 3] = c.r;
      shirt[i * 3 + 1] = c.g;
      shirt[i * 3 + 2] = c.b;
      move[i * 2] = f.arms;
      move[i * 2 + 1] = f.phase;
    });
    g.setAttribute('aShirt', new THREE.InstancedBufferAttribute(shirt, 3));
    g.setAttribute('aMove', new THREE.InstancedBufferAttribute(move, 2));
    inst.instanceMatrix.needsUpdate = true;
    inst.computeBoundingSphere();
    /* The jump lifts a head 16 cm: the bounds take it in. */
    inst.boundingSphere.radius += 0.3;
    inst.castShadow = false;
    inst.receiveShadow = true;
    inst.name = `concert crowd ${x0}`;
    out.push(inst);
  }
  /* The skin tones, folded into the shared geometry's colour by person is
   * not possible without a third attribute; the three tones are spread
   * across the bands instead, which from a drone reads as a mixed crowd. */
  out.forEach((inst, i) => {
    const col = inst.geometry.attributes.color;
    const tone = SKIN[i % SKIN.length];
    const mk = inst.geometry.attributes.aMask;
    for (let v = 0; v < col.count; v += 1) {
      const isSkin = Math.abs(col.getX(v) - SKIN[0].r) < 1e-4 && Math.abs(col.getY(v) - SKIN[0].g) < 1e-4;
      if (isSkin && mk.getX(v) !== 1) {
        col.setXYZ(v, tone.r, tone.g, tone.b);
      }
    }
  });
  return out;
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
  for (const m of crowdMeshes(layout.crowd, clock, low)) {
    group.add(m);
  }
  group.add(fireworks(clock, viewH, low));
  group.add(lasers(clock, low));
  group.add(screens(clock));
  let people = 0;
  let tris = 0;
  group.traverse((o) => {
    if (o.isInstancedMesh) {
      people += o.count;
      tris += o.count * (o.geometry.index.count / 3);
    }
  });
  return {
    group,
    tick(seconds, height) {
      clock.value = seconds % WRAP;
      if (height > 0) {
        viewH.value = height;
      }
    },
    stats: () => ({ people, crowdTris: tris, draws: group.children.length }),
  };
}
