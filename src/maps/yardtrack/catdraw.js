/*
 * catdraw.js: the yard cat drawn. ./catmodel.js is its shape, ./catrig.js
 * moves its bones, ./cat.js is what it wants; this is the one part that
 * needs three.js and a page.
 *
 * FOR THE LATENCY RULE. The whole cat is ONE draw call and no texture:
 *
 *   one mesh     body, face, whiskers, claws, ground shadow and the comic
 *                marks over its head are one set of triangles in one
 *                material, so wherever the cat is in view the frame gains
 *                one draw call, and where it is not, none
 *   no download  the coat is arithmetic, the face is painted by the
 *                graphics card from where a corner is on the head, and the
 *                marks are a few flat shapes: zero bytes beyond this code
 *   no CPU skin  thirty eight bones go up as one small uniform a frame and
 *                the vertex shader does the rest, the way the goats' legs
 *                are swung (src/maps/goats/goatdraw.js)
 *   no pass      it casts nothing into the sun's shadow map, so the shadow
 *                pass is as it was. Its shadow on the lawn is drawn in the
 *                same call as the cat: see THE SHADOW
 *   one program  compiled with the rest of the map before the first frame
 *                (src/render/warm.js), because the mesh is in the scene by
 *                then. Nothing about the cat is ever compiled in flight
 *   no garbage   every frame writes into arrays made once; no object is
 *                made in one
 *
 * and while the cat is out of the picture and the craft is nowhere near
 * it its bones are not even worked out (./cat.js still thinks, which is a
 * few comparisons).
 *
 * THE COAT. A black cat on a page is one dark shape, so the fur is a very
 * dark cool grey, never true black (Xencelabs on drawing black cats: start
 * from dark grey and a cool grey, find the edges with a thin pale light,
 * keep the eyes the brightest thing). It is lit by the map's own lights:
 * the shader asks the toon what a WHITE thing would show at this spot,
 * bands, shade tint, sun's shadow and all, and takes a few percent of it.
 * So the cat is in step with noon and with dusk without knowing which it
 * is. On top go two flat shapes of pale light, the way a mangaka gives a
 * black animal its form: a band along the edges that are turned to the sky,
 * and a patch of gloss where the coat faces the sun square on.
 *
 * THE FACE. Painted per pixel from where the corner sits on the head
 * (./catmodel.js FACE): a gold iris darker under the lid, a pupil whose
 * width is a number (a slit in the sun, a full moon the moment before the
 * pounce, which is the owner's "big eyes"), two catchlights on the same
 * side in both eyes, an upper lid that can come down to a drawn curve for
 * a blink, and the nose. Nothing moves and nothing can flicker.
 *
 * THE SHADOW. The cat must not be in the sun's shadow pass (a second draw
 * call, and Low has no shadow pass at all), yet a cat with no shadow
 * floats. So the mesh carries a rough stand-in for each bone, and the
 * vertex shader slides those stand-ins down the sun's line onto the lawn
 * and the fragment shader blends them as a tint. Two things make that work
 * in one call. The material is blended with premultiplied alpha, so the
 * body writes itself whole (alpha one) and a shadow pixel darkens what is
 * under it. And each stand-in lies in a layer of its own, four tenths of a
 * millimetre apart, the highest drawn first, so where two overlap the
 * second fails the depth test and the lawn is darkened once and not twice.
 * On a preset with shadow maps the stand-ins ask the sun's map whether the
 * lawn there is already in shade, and stay out of it.
 *
 * NOT A SOLID. Nothing here is a collider or reaches the plant. The cat is
 * a picture, kept off the craft by ./cat.js.
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
import { CRAFT_WORLD_R } from '../../game/collide.js';
import { makeCatLife, makeFace, makeMarks } from './cat.js';
import { buildCat, FACE, MARK, SWIPE, PUFF } from './catmodel.js';
import { BONE, BONES, REST, makeControls, makeRig } from './catrig.js';

/* How far apart the shadow's layers lie, world metres. */
const LAYER = 0.0004;
/* The sun is never taken as lower than this for the shadow, radians: a
 * shadow six cats long at dusk is true and reads as a mistake. */
const SUN_LEAST = 0.4;

const f4 = (v) => v.toFixed(5);
const lin = (hex) => {
  const c = new THREE.Color(hex);
  return `vec3( ${f4(c.r)}, ${f4(c.g)}, ${f4(c.b)} )`;
};

const VERT_COMMON = `#include <common>
attribute vec4 aBone;
attribute vec4 aAux;
attribute vec4 aLook;
uniform vec4 uBones[ ${BONES * 3} ];
uniform vec4 uMorph;
uniform vec3 uGlyph;
uniform vec4 uSun;
varying vec4 vLook;
vec3 catAt( vec3 p, float b ) {
	int i = int( b + 0.5 ) * 3;
	vec4 q = vec4( p, 1.0 );
	return vec3( dot( uBones[ i ], q ), dot( uBones[ i + 1 ], q ), dot( uBones[ i + 2 ], q ) );
}
vec3 catTurn( vec3 n, float b ) {
	int i = int( b + 0.5 ) * 3;
	return vec3( dot( uBones[ i ].xyz, n ), dot( uBones[ i + 1 ].xyz, n ), dot( uBones[ i + 2 ].xyz, n ) );
}`;

const VERT_NORMAL = `vec3 objectNormal = aLook.x > 2.5
	? vec3( 0.0, 1.0, 0.0 )
	: normalize( mix( catTurn( normal, aBone.y ), catTurn( normal, aBone.x ), aBone.z ) );`;

/* A mark that is not the one being shown is folded to a point, which draws
 * nothing. A corner that moves when shown (a claw, a hackle) is moved
 * before its bone carries it. A shadow's corner is carried by its bone and
 * then slid down the sun's line to its layer on the ground. */
const VERT_BEGIN = `vec3 catRest = position;
if ( aBone.x > ${BONE.mark - 0.5} && aBone.x < ${BONE.puff + 0.5} ) {
	float catSel = aBone.x < ${BONE.mark + 0.5} ? uGlyph.x : ( aBone.x < ${BONE.swipe + 0.5} ? uGlyph.y : uGlyph.z );
	if ( abs( aAux.w - catSel ) > 0.5 ) catRest = vec3( ${f4(REST.mark[0])}, ${f4(REST.mark[1])}, ${f4(REST.mark[2])} );
} else if ( aAux.w > 0.5 ) {
	catRest += aAux.xyz * ( aAux.w < 1.5 ? uMorph.x : ( aAux.w < 2.5 ? uMorph.y : ( aAux.w < 3.5 ? uMorph.z : uMorph.w ) ) );
}
vec3 transformed = mix( catAt( catRest, aBone.y ), catAt( catRest, aBone.x ), aBone.z );
vLook = aLook;
if ( aLook.x > 2.5 ) {
	transformed.xz -= uSun.xz * ( ( transformed.y - uSun.w ) / uSun.y );
	transformed.y = uSun.w + aBone.w * ${f4(LAYER)};
}`;

const FRAG_COMMON = `#include <common>
varying vec4 vLook;
uniform vec4 uEye;
uniform vec4 uGaze;
uniform vec4 uShade;
uniform vec3 uFur;
uniform vec3 uSheen;
uniform vec2 uTone;
float catSun = 1.0;
#if __VERSION__ >= 300
	#define CAT_AA( v ) fwidth( v )
#else
	#define CAT_AA( v ) 0.07
#endif`;

/* The sun's own shadow line in three's light loop, with what it found kept
 * for the cat: its body is dimmer in shade and its drawn shadow stays out
 * of shade that is already there. If three ever words the line another
 * way this finds nothing and the cat is lit as if nothing shaded it. */
const SHADOW_LINE = /directLight\.color \*= \( directLight\.visible && receiveShadow \) \? (getShadow\( directionalShadowMap\[ i \][^;]*?\)) : 1\.0;/;
const SHADOW_KEPT = 'float catVis = ( directLight.visible && receiveShadow ) ? $1 : 1.0; directLight.color *= catVis; catSun = min( catSun, catVis );';

const EYE = {
  hi: lin(0xffd84a), lo: lin(0xd98a12), ring: lin(0x6e3d08), pupil: lin(0x07060b), line: lin(0x0b0a12),
  lid: lin(0x8f89b8), nose: lin(0x6a4a58), noseHi: lin(0x9c7384), mouth: lin(0x7c2436),
};

/* What a pixel of the cat is, after the toon has lit it as it would light
 * anything: see THE COAT, THE FACE and THE SHADOW above. */
const FRAG_PAINT = `{
	float catKind = vLook.x;
	float catA = 1.0;
	if ( catKind > 2.5 ) {
		outgoingLight = uShade.rgb;
		catA = uShade.a * catSun;
		if ( catA < 0.03 ) discard;
	} else if ( catKind > 1.5 ) {
		outgoingLight = vColor;
	} else if ( catKind < 0.5 ) {
		vec3 catLight = outgoingLight;
		vec3 catN = normalize( normal );
		vec3 catV = normalize( vViewPosition );
		#if NUM_DIR_LIGHTS > 0
			vec3 catL = directionalLights[ 0 ].direction;
		#else
			vec3 catL = vec3( 0.0, 1.0, 0.0 );
		#endif
		float catF = 1.0 - max( dot( catN, catV ), 0.0 );
		float catUp = dot( catN, catL );
		float catRim = smoothstep( 0.68, 0.74, catF ) * smoothstep( 0.0, 0.3, catUp ) * catSun;
		float catTop = smoothstep( 0.8, 0.84, catUp ) * catSun;
		outgoingLight = catLight * ( uFur + uSheen * ( uTone.x * catRim + uTone.y * catTop ) );
		vec3 f = vLook.yzw;
		float bright = mix( 0.72, 1.0, clamp( dot( catLight, vec3( 0.3333 ) ), 0.0, 1.0 ) );
		if ( f.x > 0.012 ) {
			float sg = f.z < 0.0 ? -1.0 : 1.0;
			vec2 e = vec2( abs( f.z ) - ${f4(FACE.eyeZ)}, f.y - ${f4(FACE.eyeY)} );
			e = vec2( e.x * ${f4(Math.cos(FACE.eyeTilt))} + e.y * ${f4(Math.sin(FACE.eyeTilt))}, e.y * ${f4(Math.cos(FACE.eyeTilt))} - e.x * ${f4(Math.sin(FACE.eyeTilt))} );
			e /= vec2( ${f4(FACE.eyeW)}, ${f4(FACE.eyeH)} );
			float shape = pow( abs( e.x ), 2.3 ) + pow( abs( e.y ), 2.0 );
			if ( shape < 1.25 ) {
				float aa = CAT_AA( e.y ) * 1.2;
				float lid = 1.03 - 2.06 * uEye.y + uEye.w * 0.45 * e.x;
				float low = -1.03 + 0.95 * uEye.z;
				vec2 pc = vec2( uGaze.x * sg, uGaze.y ) * 0.3;
				vec2 pd = ( e - pc ) / vec2( mix( 0.1, 0.76, uEye.x ), mix( 0.88, 0.8, uEye.x ) );
				float pupil = dot( pd, pd );
				vec3 eye = mix( ${EYE.hi}, ${EYE.lo}, smoothstep( -0.75, 0.6, e.y ) );
				eye = mix( eye, ${EYE.ring}, smoothstep( 0.6, 1.0, shape ) * 0.85 );
				eye = mix( ${EYE.pupil}, eye, smoothstep( 1.0 - aa * 3.0, 1.0 + aa * 3.0, pupil ) );
				eye *= 1.0 - 0.42 * smoothstep( lid - 0.5, lid - 0.08, e.y );
				vec2 h1 = ( e - vec2( 0.3 * sg, 0.34 ) ) / ( vec2( 0.21, 0.23 ) * ( 1.0 + 0.45 * uGaze.z ) );
				vec2 h2 = ( e - vec2( -0.36 * sg, -0.4 ) ) / ( 0.11 * ( 1.0 + 0.6 * uGaze.z ) );
				float hl = max( 1.0 - smoothstep( 1.0 - aa * 5.0, 1.0, dot( h1, h1 ) ), 0.92 * ( 1.0 - smoothstep( 1.0 - aa * 9.0, 1.0, dot( h2, h2 ) ) ) );
				eye = mix( eye, vec3( 1.0 ), hl );
				eye = mix( eye, ${EYE.line}, smoothstep( 0.84, 0.97, shape ) );
				float open = ( 1.0 - smoothstep( 1.0 - aa, 1.0 + aa, shape ) ) * smoothstep( low - aa, low + aa, e.y ) * ( 1.0 - smoothstep( lid - aa, lid + aa, e.y ) );
				outgoingLight = mix( outgoingLight, eye * bright, open );
				float shut = smoothstep( 0.04, 0.3, uEye.y );
				float lidLine = ( 1.0 - smoothstep( 0.05, 0.05 + aa * 2.0 + 0.04, abs( e.y - lid ) ) ) * ( 1.0 - smoothstep( 0.98, 1.1, shape ) ) * shut;
				outgoingLight = mix( outgoingLight, ${EYE.lid} * bright, lidLine * 0.8 );
			}
			vec2 n = vec2( f.z / ${f4(FACE.noseW)}, ( f.y - ${f4(FACE.noseY)} ) / ${f4(FACE.noseH)} );
			if ( f.x > 0.04 && abs( n.y ) < 1.4 ) {
				float aan = CAT_AA( n.y ) * 1.2;
				float nd = max( abs( n.x ) - ( 0.52 + 0.48 * n.y ), abs( n.y ) - 1.0 );
				float nose = 1.0 - smoothstep( -aan, aan, nd );
				vec3 nc = mix( ${EYE.nose}, ${EYE.noseHi}, smoothstep( 0.2, 0.9, n.y ) );
				outgoingLight = mix( outgoingLight, nc * clamp( catLight, 0.35, 1.2 ), nose );
			}
			float mz = abs( f.z ) / 0.0125;
			if ( f.x > 0.03 && mz < 1.15 && f.y < -0.015 && f.y > -0.0295 ) {
				float my = -0.0232 - 0.003 * sin( 3.1416 * min( mz, 1.0 ) ) + 0.0022 * mz * mz;
				float aam = CAT_AA( f.y ) * 1.5 + 0.0002;
				float lip = ( 1.0 - smoothstep( 0.0006, 0.0006 + aam, abs( f.y - my ) ) ) * ( 1.0 - smoothstep( 1.0, 1.1, mz ) );
				float phil = ( 1.0 - smoothstep( 0.0005, 0.0005 + aam, abs( f.z ) ) ) * step( -0.0232, f.y ) * step( f.y, -0.0165 );
				outgoingLight = mix( outgoingLight, ${EYE.lid} * bright, max( lip, phil ) * 0.7 );
			}
			if ( uGaze.w > 0.01 && f.y < -0.029 && f.x < 0.047 && abs( f.z ) < 0.0155 ) {
				outgoingLight = mix( outgoingLight, ${EYE.mouth} * clamp( catLight, 0.4, 1.0 ), uGaze.w );
			}
		}
	}
	diffuseColor.a = catA;
}
#include <opaque_fragment>`;

function patch(shader, uniforms) {
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', VERT_COMMON)
    .replace('#include <beginnormal_vertex>', VERT_NORMAL)
    .replace('#include <begin_vertex>', VERT_BEGIN);
  const lights = THREE.ShaderChunk.lights_fragment_begin.replace(SHADOW_LINE, SHADOW_KEPT);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', FRAG_COMMON)
    .replace('#include <lights_fragment_begin>', lights)
    .replace('#include <opaque_fragment>', FRAG_PAINT);
}

const backOut = (t) => {
  const u = t - 1;
  return 1 + u * u * (2.6 * u + 1.6);
};

/*
 * The cat's body in the scene. `scale` is world metres to one of the
 * cat's; `ground` the lawn's height; `lite` the Low preset's model; `sun`
 * the map's sun (a DirectionalLight), for the shadow's line.
 *
 *   mesh       add it to the scene before the map's programs are warmed
 *   rig        ./catrig.js's, which ./cat.js drives
 *   controls   what is asked of the rig
 *   face       pupil, lids, gaze, claws and hackles, 0 to 1
 *   marks      which comic mark is up, for how long, and where
 *   pose(dt)   work the bones out (skip it while the cat is out of view)
 *   show(camera)   hand the frame to the graphics card
 */
export function makeCatBody({
  scale, ground = 0, lite = false, sun = null, shadowLift = 0.03, rig = null, controls = null, face = makeFace(), marks = makeMarks(),
}) {
  const model = buildCat({ lite });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(model.position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(model.normal, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(model.color, 3));
  geometry.setAttribute('aBone', new THREE.BufferAttribute(model.bone, 4));
  geometry.setAttribute('aAux', new THREE.BufferAttribute(model.aux, 4));
  geometry.setAttribute('aLook', new THREE.BufferAttribute(model.look, 4));
  geometry.setIndex(new THREE.BufferAttribute(model.index, 1));
  /* Wide enough for a leap, a mark over its head and a long shadow, and
   * never worked out again: the bones move inside it. */
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.3 * scale, 0), 1.5 * scale);

  const body = rig || makeRig(scale);
  const ask = controls || makeControls();
  const uniforms = {
    uBones: { value: body.bones },
    uMorph: { value: new THREE.Vector4(0, 0, 0, 0) },
    uGlyph: { value: new THREE.Vector3(0, 0, 0) },
    uSun: { value: new THREE.Vector4(-0.4, 0.75, 0.5, shadowLift) },
    uEye: { value: new THREE.Vector4(0.35, 0, 0, 0) },
    uGaze: { value: new THREE.Vector4(0, 0, 0, 0) },
    uShade: { value: new THREE.Vector4(0.01, 0.028, 0.09, 0.62) },
    uFur: { value: new THREE.Color(0x24242e) },
    uSheen: { value: new THREE.Color(0x8e93c4) },
    uTone: { value: new THREE.Vector2(0.3, 0.11) },
  };
  const material = cel({ color: 0xffffff, vertexColors: true, bands: 3, tint: 0x6c5f8c, cache: false });
  material.transparent = true;
  material.premultipliedAlpha = true;
  material.depthWrite = true;
  material.depthFunc = THREE.LessDepth;
  const toon = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    toon(shader, renderer);
    patch(shader, uniforms);
  };
  material.customProgramCacheKey = () => 'yard-cat';

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'yard cat';
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = true;
  mesh.position.set(0, ground, 0);

  const crown = [0, 0, 0];
  const sunDir = new THREE.Vector3(-0.4, 0.75, 0.5).normalize();
  let sunPower = 1;

  /* A mark's bone: turned to the camera, sized, and put at a spot. */
  function place(b, wx, wy, wz, size, roll, e) {
    const c = Math.cos(roll) * size;
    const s = Math.sin(roll) * size;
    const o = b * 12;
    const m = REST.mark;
    for (let r = 0; r < 3; r += 1) {
      const X = e[r] * c + e[4 + r] * s;
      const Y = e[4 + r] * c - e[r] * s;
      const Z = e[8 + r] * size;
      const at = r === 0 ? wx - mesh.position.x : r === 1 ? wy - mesh.position.y : wz - mesh.position.z;
      body.bones[o + r * 4] = X;
      body.bones[o + r * 4 + 1] = Y;
      body.bones[o + r * 4 + 2] = Z;
      body.bones[o + r * 4 + 3] = at - (X * m[0] + Y * m[1] + Z * m[2]);
    }
  }

  function pose(dt) {
    body.step(dt, ask);
  }

  function show(camera) {
    mesh.position.set(ask.x, ground, ask.z);
    /* The sun's line, from where the map's sun stands to what it looks at. */
    if (sun) {
      sunDir.copy(sun.position).sub(sun.target.position);
      const flat = Math.hypot(sunDir.x, sunDir.z);
      const up = Math.max(Math.atan2(sunDir.y, flat), SUN_LEAST);
      const k = flat > 1e-6 ? Math.cos(up) / flat : 0;
      sunDir.set(sunDir.x * k, Math.sin(up), sunDir.z * k);
      sunPower = sun.visible === false ? 0 : Math.min(1, sun.intensity / 1.6);
    }
    uniforms.uSun.value.set(sunDir.x, sunDir.y, sunDir.z, shadowLift);
    /* Fainter under a weak sun, and as the cat leaves the ground. */
    uniforms.uShade.value.w = 0.62 * sunPower * (1 - 0.45 * Math.min(1, ask.lift / 0.5));
    uniforms.uEye.value.set(face.pupil, face.lid, face.squint, face.brow);
    uniforms.uGaze.value.set(face.gazeX, face.gazeY, face.sparkle, Math.min(1, Math.max(0, ask.jaw / 0.08)));

    const e = camera.matrixWorld.elements;
    const far = Math.hypot(e[12] - ask.x, e[13] - ground, e[14] - ask.z);
    /* Whiskers are a pixel wide a few metres off and a shimmer beyond, so
     * past that they are drawn in. */
    const near = Math.min(1, Math.max(0, 2 - far / (1.3 * scale)));
    uniforms.uMorph.value.set(face.clawL, face.clawR, face.hackle, near * near * (3 - 2 * near));
    /* A mark is as big as it needs to be to be read from where the pilot is. */
    const size = scale * 1.25 * Math.min(2.6, Math.max(1, far / (1.6 * scale)));
    let g0 = MARK.none;
    if (marks.mark !== MARK.none && marks.markT < marks.markDur) {
      const t = marks.markT;
      const left = marks.markDur - t;
      const pop = backOut(Math.min(1, t / 0.16)) * Math.min(1, left / 0.12);
      body.at('crown', crown);
      const bob = marks.mark === MARK.zzz ? 0.05 * Math.sin(t * 1.7) : 0;
      const roll = marks.mark === MARK.zzz ? 0.08 * Math.sin(t * 1.3) : 0.16 * Math.sin(t * 11) * Math.exp(-t * 3);
      const lift = (0.02 + bob) * scale;
      place(BONE.mark, crown[0] + e[0] * 0.07 * scale, crown[1] + lift, crown[2] + e[2] * 0.07 * scale, size * Math.max(0.001, pop), roll, e);
      g0 = marks.mark;
    }
    let g1 = SWIPE.none;
    if (marks.swipe !== SWIPE.none && marks.swipeT < marks.swipeDur) {
      const u = marks.swipeT / marks.swipeDur;
      const s = marks.swipe === SWIPE.star ? backOut(Math.min(1, u * 2.2)) * (1 - u * u) : (0.6 + 0.6 * u) * (1 - u * u * u);
      place(BONE.swipe, marks.swipeX, marks.swipeY, marks.swipeZ, size * 0.9 * Math.max(0.001, s), marks.swipeRoll, e);
      g1 = marks.swipe;
    }
    let g2 = PUFF.none;
    if (marks.puff !== PUFF.none && marks.puffT < marks.puffDur) {
      const u = marks.puffT / marks.puffDur;
      place(BONE.puff, marks.puffX, marks.puffY + 0.1 * scale * u, marks.puffZ, size * (0.45 + 0.9 * u) * (1 - u * u), 0.4 * u, e);
      g2 = marks.puff;
    }
    uniforms.uGlyph.value.set(g0, g1, g2);
  }

  return {
    mesh,
    rig: body,
    controls: ask,
    face,
    marks,
    model,
    uniforms,
    pose,
    show,
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

/* What the cat's vertex shader needs in uniform vectors: three to a bone,
 * and three's own matrices, lights and shadow with room to spare. WebGL 2
 * promises 256; an old WebGL 1 card may have 128, and a program that asks
 * for more does not link. */
const NEED_UNIFORMS = BONES * 3 + 64;
/* World metres to a cat's: how near the camera is before the cat is posed
 * whether or not it is in the picture, for a turn faster than the
 * camera's matrix. */
const NEAR_POSE = 4;

/* A number for a name, so each yard's cat has whims of its own. */
function seedOf(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return (h >>> 0) || 7;
}

/*
 * THE CAT FOR A MAP: lawn, body, mind and drawing as the one thing a map
 * adds to its scene and steps from its updateAnim, the way Heads is added
 * to his garage (../heads/mandraw.js).
 *
 *   track      the map's yard track (./yardtrack.js)
 *   colliders  the map's built collider set, every solid there is
 *   parts      the map's own structure, for what is drawn and not lawn
 *   starts     where else a run is set down: the map's own start
 *   camera     the shell's
 *   craftAt    answers where the drawn craft is in the world, or null
 *   lite       the Low preset's model
 *   sun        the map's sun
 *   renderer   the shell's, asked how many uniforms a vertex shader may have
 *
 * Returns null where the graphics card cannot hold the bones: such a map
 * has no cat and loses nothing else.
 *
 * ITS CLOCK is the one the map's updateAnim is handed, the title's, the
 * run's or the finish's: forward steps are lived, and a step back or a leap
 * of more than a second goes by as nothing, so a new run or a pause never
 * moves the cat by itself. THE CRAFT'S SIZE is read every frame from
 * src/game/collide.js, so the air the cat keeps is the air round the craft
 * being flown, whoop or five inch.
 *
 * A harness (scripts/ only) can stand in for the craft with
 * `mesh.userData.craftAt`, a world { x, y, z }, and for its size with
 * `mesh.userData.craftR`, and can switch the cat off, undrawn and
 * unthinking, with `mesh.userData.off`.
 */
export function makeCat({
  track, colliders = null, parts = null, starts = null, camera, craftAt = () => null, lite = false, sun = null, renderer = null, seed = null,
}) {
  if (renderer && renderer.capabilities && renderer.capabilities.maxVertexUniforms < NEED_UNIFORMS) {
    return null;
  }
  const S = track.scale;
  const ground = track.y || 0;
  const light = sun ? Math.min(1, Math.max(0.15, (sun.visible === false ? 0 : sun.intensity) / 2.25)) : 0.6;
  const life = makeCatLife({
    track, solids: colliders, parts, starts, seed: seed == null ? seedOf(String(track.id || 'yard')) : seed, light,
  });
  const body = makeCatBody({
    scale: S, ground, lite, sun, rig: life.rig, controls: life.controls, face: life.face, marks: life.marks,
  });
  const mesh = body.mesh;
  const c = life.controls;
  const eye = { x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: -1 };
  const frustum = new THREE.Frustum();
  const pm = new THREE.Matrix4();
  const sphere = new THREE.Sphere();
  let last = null;
  let frames = 0;

  function update(step) {
    const ud = mesh.userData;
    if (ud.off) {
      mesh.visible = false;
      last = step;
      return;
    }
    mesh.visible = true;
    let d = 0;
    if (last !== null) {
      const dd = step - last;
      if (dd > 0 && dd <= 1000) {
        d = dd;
      }
    }
    last = step;
    frames += 1;
    /* The pilot's eye as it is this frame: where the camera is and which
     * way it looks, from its own place and turn and not its matrix, which
     * is last frame's until the picture is drawn. */
    const p = camera.position;
    const q = camera.quaternion;
    eye.x = p.x;
    eye.y = p.y;
    eye.z = p.z;
    eye.fx = -2 * (q.x * q.z + q.w * q.y);
    eye.fy = -2 * (q.y * q.z - q.w * q.x);
    eye.fz = -(1 - 2 * (q.x * q.x + q.y * q.y));
    const dx = p.x - c.x;
    const dz = p.z - c.z;
    let seen = dx * dx + dz * dz < NEAR_POSE * S * NEAR_POSE * S;
    if (!seen) {
      pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(pm);
      sphere.center.set(c.x, ground + 0.3 * S, c.z);
      sphere.radius = 1.5 * S;
      seen = frustum.intersectsSphere(sphere);
    }
    life.frame(d / 1000, ud.craftAt || craftAt(), ud.craftR || CRAFT_WORLD_R, eye, seen);
    body.show(camera);
  }
  /* Shown once whether or not it is in view, so its first sight is a cat. */
  body.show(camera);

  return {
    mesh,
    life,
    body,
    update,
    stats: () => ({
      ...life.stats(),
      frames,
      lite: Boolean(lite),
      vertices: body.model.position.length / 3,
      triangles: body.model.index.length / 3,
    }),
  };
}

/*
 * The cat added to a built map that has a yard track, in the map's scene
 * (whose dispose frees it) and so before the map's programs are warmed.
 * `shell` is the page's, `parts` the map's own structure. Returns the cat,
 * or null on a map with no yard track or a card that cannot draw it; the
 * map steps it from its updateAnim and adds its stats to its own.
 */
export function addYardCat(map, shell, parts) {
  if (!map.yardTrack) {
    return null;
  }
  const cat = makeCat({
    track: map.yardTrack,
    colliders: map.colliders,
    parts,
    starts: map.spawn ? [map.spawn] : null,
    camera: shell.camera,
    craftAt: () => (shell.quad ? shell.quad.position : null),
    lite: map.graphics === 'low',
    /* The sun is the first of the map's two lights: src/maps/built/index.js. */
    sun: map.scene.children.find((o) => o.isDirectionalLight) || null,
    renderer: shell.renderer,
  });
  if (cat) {
    map.scene.add(cat.mesh);
  }
  return cat;
}
