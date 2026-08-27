/*
 * index.js: Bardwell's yard. A 2.5 acre homestead, cel shaded, freestyle.
 *
 * The toon kit under ./cel is sakura-crossing's, MIT, retargeted at this
 * map's palette. Everything else in this folder is ours, GPLv3. The yard
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
import { qualityFor } from '../../render/quality.js';

const CAMERA_FAR = 520;
const SUN_OFFSET = new THREE.Vector3(-48, 28, 22);
const FILL_OFFSET = new THREE.Vector3(38, 16, -26);
const BOUNCE_OFFSET = new THREE.Vector3(8, -10, 18);
const LIGHT_ORIGIN = new THREE.Vector3(0, 4, 2);

class YardPipeline extends Pipeline {
  constructor(renderer, scene, camera, opts) {
    super(renderer, scene, camera, opts);
    this.shellPixelRatio = renderer.getPixelRatio();
    this.minScale = opts && opts.minScale != null ? opts.minScale : 1;
    this.preferScale = opts && opts.preferScale != null ? opts.preferScale : null;
  }

  setSize(w, h) {
    const dpr = window.devicePixelRatio || 1;
    let scale = this.forceScale
      || this.preferScale
      || (dpr < 1.5 ? 1.5 : Math.min(dpr, 2));
    if (w * h * scale * scale > this.pixelBudget) {
      scale = Math.max(this.minScale, Math.sqrt(this.pixelBudget / (w * h)));
    }
    this.scale = scale;
    const rw = Math.max(2, Math.floor(w * scale));
    const rh = Math.max(2, Math.floor(h * scale));
    this.size.set(rw, rh);

    this.rtScene.setSize(rw, rh);
    this.rtA.setSize(rw, rh);
    this.rtB.setSize(rw, rh);

    const texel = new THREE.Vector2(1 / rw, 1 / rh);
    this.ink.mat.uniforms.uTexel.value.copy(texel);
    this.fxaa.mat.uniforms.uTexel.value.copy(texel);
    this.ink.mat.uniforms.uNear.value = this.camera.near;
    this.ink.mat.uniforms.uFar.value = this.camera.far;
    this.ink.mat.uniforms.uThickness.value = 1.05 + 0.55 * scale;

    this.renderer.setPixelRatio(this.shellPixelRatio);
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '';
    this.renderer.domElement.style.height = '';
  }
}

export async function buildMap(shell, onProgress, options) {
  const renderer = shell.renderer;
  const camera = shell.camera;
  const progress = onProgress ?? (() => {});
  const q = qualityFor(options && options.quality);
  const bq = q.yard;

  renderer.shadowMap.enabled = q.shadows;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor(new THREE.Color(PAL.fog), 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(PAL.fog, bq.fogNear, bq.fogFar);
  camera.far = CAMERA_FAR;
  camera.updateProjectionMatrix();

  const sun = new THREE.DirectionalLight(PAL.sun, 2.05);
  sun.castShadow = q.shadows;
  const shadowMap = bq.shadowMap || 2048;
  sun.shadow.mapSize.set(shadowMap, shadowMap);
  const half = bq.shadowHalf;
  sun.shadow.camera.left = -half;
  sun.shadow.camera.right = half;
  sun.shadow.camera.top = half;
  sun.shadow.camera.bottom = -half;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 260;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun);
  scene.add(sun.target);

  const fill = new THREE.DirectionalLight(0xb8a898, 0.75);
  scene.add(fill);
  scene.add(fill.target);
  const bounce = new THREE.DirectionalLight(0xe8c4a0, 0.32);
  scene.add(bounce);
  scene.add(bounce.target);
  scene.add(new THREE.HemisphereLight(PAL.hemiSky, PAL.hemiGround, 1.0));

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

  const world = buildWorld(scene);
  addLamp(-1.5, 2.72, -6.7, 0xffe0b0, 0.75, 6);
  addLamp(-1.6, 2.42, 4.85, 0xffe8c0, 0.7, 5);
  addLamp(-26.5, 2.7, 17.3, 0xffc070, 0.9, 7);
  addLamp(8.7, 2.54, 1.4, 0xffe0b0, 0.65, 6);
  progress(0.88);
  await yieldToPaint();

  const pipeline = new YardPipeline(renderer, scene, camera, {
    pixelBudget: bq.pixelBudget,
    minScale: bq.minScale,
    preferScale: bq.preferScale,
  });
  pipeline.enabled.ink = bq.ink;
  pipeline.enabled.fxaa = bq.fxaa;
  pipeline.grade.mat.uniforms.uShadowTint.value.setHex(0xb8a8c8);
  pipeline.grade.mat.uniforms.uLightTint.value.setHex(0xffe8c8);
  pipeline.grade.mat.uniforms.uWarmth.value = 0.09;
  pipeline.grade.mat.uniforms.uSaturation.value = 1.12;
  pipeline.grade.mat.uniforms.uLift.value = 0.04;
  pipeline.ink.mat.uniforms.uFadeStart.value = 48;
  pipeline.ink.mat.uniforms.uFadeEnd.value = 160;
  pipeline.ink.mat.uniforms.uSkyDepth.value = 360;

  const d = shell.resize();
  pipeline.setSize(d.w, d.h);

  scene.add(shell.quad);
  progress(1);

  function seat(light, offset) {
    light.target.position.copy(LIGHT_ORIGIN);
    light.position.copy(LIGHT_ORIGIN).add(offset);
    light.target.updateMatrixWorld();
  }
  seat(sun, SUN_OFFSET);
  seat(fill, FILL_OFFSET);
  seat(bounce, BOUNCE_OFFSET);

  const YARD_AIM = { active: false, sceneIndex: -1, correct: true, distance: 0 };

  return {
    id: 'yard',
    name: "Bardwell's yard",
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
      speed: 12,
      lookAhead: 7,
      aimDrop: 0.6,
    },
    height: (x, z, fromY) => world.heightAt(x, z, fromY),
    setNextGate() {},
    targetAim: () => YARD_AIM,
    approachSide: () => null,
    hasRacingLine: false,
    setRacingLine() {},
    updateRacingLine() { return null; },
    updateShadowFocus(target) {
      sky.dome.position.copy(camera.position);
      sky.clouds.position.copy(camera.position);
      void target;
    },
    updateWind() {},
    updateAnim() {},
    references: world.references,
    world,
    stats: () => ({
      colliders: world.colliders.stats(),
      platforms: world.platforms.length,
      audit: world.audit(),
      ...world.merged,
      pipelineScale: pipeline.scale,
      pipelineSize: { x: pipeline.size.x, y: pipeline.size.y },
    }),
    dispose() {
      scene.remove(shell.quad);
      pipeline.dispose();
      disposeSceneGraph(scene, SESSION_TEXTURES);
      releaseMaterials();
    },
  };
}
