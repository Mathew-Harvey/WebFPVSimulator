/*
 * index.js: Industrial bando. A compact cement works, cel shaded, freestyle.
 *
 * The toon kit under ./cel is sakura-crossing's, MIT, retargeted at this
 * map's palette. Everything else in this folder is ours, GPLv3. The plant
 * is authored as boxes with their colliders, so a gap in the drawing is a
 * gap in the solid world.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import * as THREE from 'three';
import { PAL } from './palette.js';
import { Pipeline } from './cel/post.js';
import { releaseMaterials } from './cel/toon.js';
import { buildSky } from './sky.js';
import { buildWorld, attractPath } from './world.js';
import { disposeSceneGraph } from '../../render/shell.js';
import { SESSION_TEXTURES } from '../../render/session-textures.js';
import { yieldToPaint } from '../../ui/loading.js';
import { qualityFor, internalScale } from '../../render/quality.js';

const CAMERA_FAR = 520;
const SUN_OFFSET = new THREE.Vector3(-72, 40, 18);
const FILL_OFFSET = new THREE.Vector3(48, 22, -36);
const BOUNCE_OFFSET = new THREE.Vector3(12, -14, 28);
const LIGHT_ORIGIN = new THREE.Vector3(-8, 8, 0);

class KilnPipeline extends Pipeline {
  constructor(renderer, scene, camera, opts) {
    super(renderer, scene, camera, opts);
    this.mapQ = opts && opts.mapQ ? opts.mapQ : null;
    this.userScale = opts && opts.userScale != null ? opts.userScale : 1;
    this.forceScale = null;
    this._cssW = 1;
    this._cssH = 1;
    this.minScale = opts && opts.minScale != null ? opts.minScale : 1;
    this.preferScale = opts && opts.preferScale != null ? opts.preferScale : null;
  }

  setSize(w, h) {
    this._cssW = w;
    this._cssH = h;
    const mapQ = this.mapQ || {
      pixelBudget: this.pixelBudget,
      minScale: this.minScale,
      preferScale: this.preferScale,
    };
    const scale = internalScale(w, h, mapQ, this.forceScale, this.userScale);
    this.scale = scale;
    const rw = Math.max(2, Math.floor(w * scale));
    const rh = Math.max(2, Math.floor(h * scale));
    this.size.set(rw, rh);

    this.rtScene.setSize(rw, rh);
    this.rtA.setSize(rw, rh);
    this.rtB.setSize(rw, rh);

    this.ink.mat.uniforms.uTexel.value.set(1 / rw, 1 / rh);
    this.fxaa.mat.uniforms.uTexel.value.set(1 / rw, 1 / rh);
    this.ink.mat.uniforms.uNear.value = this.camera.near;
    this.ink.mat.uniforms.uFar.value = this.camera.far;
    this.ink.mat.uniforms.uThickness.value = 1.05 + 0.55 * scale;

    /*
     * Backing store equals the internal buffer. CSS stretches it to the
     * panel. Restoring session devicePixelRatio made the last FXAA pass
     * write 2x or 4x the scene. That is the 4K hitch: the plant is cheap
     * and the blit is not.
     */
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(rw, rh, false);
    this.renderer.domElement.style.width = '';
    this.renderer.domElement.style.height = '';
  }

  applyPace(scale) {
    if (!(this._cssW > 0 && this._cssH > 0)) {
      return false;
    }
    const next = internalScale(
      this._cssW,
      this._cssH,
      this.mapQ,
      scale,
      this.userScale,
    );
    if (Math.abs(next - this.scale) < 0.02 && this.forceScale === scale) {
      return false;
    }
    this.forceScale = scale;
    this.setSize(this._cssW, this._cssH);
    return true;
  }
}

export async function buildMap(shell, onProgress, options) {
  const renderer = shell.renderer;
  const camera = shell.camera;
  const progress = onProgress ?? (() => {});
  const q = qualityFor(options && options.quality);
  const bq = q.bando;

  renderer.shadowMap.enabled = q.shadows;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor(new THREE.Color(PAL.fog), 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(PAL.fog, bq.fogNear, bq.fogFar);
  camera.far = CAMERA_FAR;
  camera.updateProjectionMatrix();

  const sun = new THREE.DirectionalLight(PAL.sun, 2.0);
  sun.castShadow = q.shadows;
  const shadowMap = bq.shadowMap || 2048;
  sun.shadow.mapSize.set(shadowMap, shadowMap);
  const half = bq.shadowHalf;
  sun.shadow.camera.left = -half;
  sun.shadow.camera.right = half;
  sun.shadow.camera.top = half;
  sun.shadow.camera.bottom = -half;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 220;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun);
  scene.add(sun.target);

  const fill = new THREE.DirectionalLight(PAL.fill, 1.22);
  scene.add(fill);
  scene.add(fill.target);
  const bounce = new THREE.DirectionalLight(0xd8c4a8, 0.42);
  scene.add(bounce);
  scene.add(bounce.target);
  scene.add(new THREE.HemisphereLight(PAL.hemiSky, PAL.hemiGround, 1.34));

  function addLamp(x, y, z, color, intensity, distance) {
    const lamp = new THREE.PointLight(color, intensity, distance, 1.35);
    lamp.position.set(x, y, z);
    lamp.castShadow = false;
    scene.add(lamp);
  }

  progress(0.06);
  const sky = buildSky(scene, 420);
  progress(0.12);
  await yieldToPaint();

  const world = buildWorld(scene, {
    mergeCell: bq.mergeCell,
    casterMin: bq.casterMin,
  });
  const lamps = [
    [0, 10.2, 0, 0xffe0b0, 2.6, 34],
    [-12, 10, 0, 0xffe8c0, 1.7, 22],
    [12, 10, 0, 0xffe8c0, 1.7, 22],
    [-24, 10.1, 0, 0xff7a40, 1.35, 16],
    [-46, 30, 0, 0xd4c4e8, 2.1, 42],
    [38, 8, 4.3, 0xffd0a0, 1.4, 18],
    [-13, 8.8, -27.8, 0xff8a48, 1.5, 16],
    [38, -4.2, 0, 0xc8a070, 1.1, 14],
  ];
  const lampN = bq.lamps || 0;
  for (let i = 0; i < lampN && i < lamps.length; i += 1) {
    addLamp(...lamps[i]);
  }
  progress(0.88);
  await yieldToPaint();

  const pipeline = new KilnPipeline(renderer, scene, camera, {
    pixelBudget: bq.pixelBudget,
    minScale: bq.minScale,
    preferScale: bq.preferScale,
    mapQ: bq,
    userScale: options && options.renderScale != null ? options.renderScale : 1,
  });
  pipeline.enabled.ink = bq.ink;
  pipeline.enabled.fxaa = bq.fxaa;
  pipeline.grade.mat.uniforms.uShadowTint.value.setHex(0xb8a8c8);
  pipeline.grade.mat.uniforms.uLightTint.value.setHex(0xffe8c8);
  pipeline.grade.mat.uniforms.uWarmth.value = 0.08;
  pipeline.grade.mat.uniforms.uSaturation.value = 1.10;
  pipeline.grade.mat.uniforms.uLift.value = 0.045;
  pipeline.ink.mat.uniforms.uFadeStart.value = 56;
  pipeline.ink.mat.uniforms.uFadeEnd.value = 170;
  pipeline.ink.mat.uniforms.uSkyDepth.value = 360;

  const d = shell.resize();
  pipeline.setSize(d.w, d.h);

  scene.add(shell.quad);
  progress(1);

  const shadowTarget = new THREE.Vector3();
  function seat(light, offset, origin) {
    const at = origin || LIGHT_ORIGIN;
    light.target.position.copy(at);
    light.position.copy(at).add(offset);
    light.target.updateMatrixWorld();
  }
  seat(sun, SUN_OFFSET, LIGHT_ORIGIN);
  seat(fill, FILL_OFFSET, LIGHT_ORIGIN);
  seat(bounce, BOUNCE_OFFSET, LIGHT_ORIGIN);

  const BANDO_AIM = { active: false, sceneIndex: -1, correct: true, distance: 0 };

  return {
    id: 'bando',
    name: 'Industrial bando',
    mode: 'freestyle',
    graphics: q.id,
    scene,
    post: pipeline,
    colliders: world.colliders,
    gates: [],
    curve: null,
    spawn: world.spawn,
    attract: {
      path: attractPath(world),
      speed: 11,
      /*
       * Twelve metres, not six. The look ahead is what the shot is POINTED
       * at, and six metres of it in a yard this size meant the camera was
       * always aimed at the nearest thing rather than at the works. Long
       * enough that the frame is the plant, short enough that the corners
       * still bank.
       */
      lookAhead: 12,
      aimDrop: 1.2,
    },
    height: (x, z, fromY) => world.heightAt(x, z, fromY),
    setNextGate() {},
    targetAim: () => BANDO_AIM,
    approachSide: () => null,
    hasRacingLine: false,
    setRacingLine() {},
    updateRacingLine() { return null; },
    updateShadowFocus(target) {
      sky.dome.position.copy(camera.position);
      sky.clouds.position.copy(camera.position);
      if (!sun.castShadow) {
        return;
      }
      shadowTarget.set(
        Math.round(target.x * 2) / 2,
        Math.round(target.y * 2) / 2,
        Math.round(target.z * 2) / 2,
      );
      seat(sun, SUN_OFFSET, shadowTarget);
      seat(fill, FILL_OFFSET, shadowTarget);
      seat(bounce, BOUNCE_OFFSET, shadowTarget);
    },
    updateWind() {},
    updateAnim() {},
    references: world.references,
    world,
    stats: () => {
      let pointLights = 0;
      let casters = 0;
      scene.traverse((o) => {
        if (o.isPointLight) {
          pointLights += 1;
        }
        if (o.isMesh && o.castShadow) {
          casters += 1;
        }
      });
      return {
        colliders: world.colliders.stats(),
        platforms: world.platforms.length,
        ...world.merged,
        leftoverDeath: world.leftover.death,
        leftoverOverlap: world.leftover.overlap,
        leftoverSamples: world.leftover.samples,
        pipelineScale: pipeline.scale,
        pipelineSize: { x: pipeline.size.x, y: pipeline.size.y },
        pipelineCss: { x: pipeline._cssW, y: pipeline._cssH },
        pointLights,
        casters,
      };
    },
    dispose() {
      scene.remove(shell.quad);
      pipeline.dispose();
      disposeSceneGraph(scene, SESSION_TEXTURES);
      releaseMaterials();
    },
  };
}
