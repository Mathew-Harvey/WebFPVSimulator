/*
 * index.js: Municipal baths. A 50 m hall and lido, cel shaded, freestyle.
 *
 * The toon kit under ./cel is sakura-crossing's, MIT, retargeted at this
 * map's palette. Everything else in this folder is ours, GPLv3. The hall is authored as boxes with their colliders, so a gap in the drawing is a gap in the solid world.
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
const SUN_OFFSET = new THREE.Vector3(-58, 24, 26);
const FILL_OFFSET = new THREE.Vector3(42, 18, -28);
const BOUNCE_OFFSET = new THREE.Vector3(10, -12, 22);
const LIGHT_ORIGIN = new THREE.Vector3(0, 8, 0);

class BathsPipeline extends Pipeline {
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
  const bq = q.baths;

  renderer.shadowMap.enabled = q.shadows;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor(new THREE.Color(PAL.fog), 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(PAL.fog, bq.fogNear, bq.fogFar);
  camera.far = CAMERA_FAR;
  camera.updateProjectionMatrix();

  const sun = new THREE.DirectionalLight(PAL.sun, 2.28);
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

  const fill = new THREE.DirectionalLight(PAL.fill, 1.15);
  scene.add(fill);
  scene.add(fill.target);
  const bounce = new THREE.DirectionalLight(0xd0d8dc, 0.38);
  scene.add(bounce);
  scene.add(bounce.target);
  scene.add(new THREE.HemisphereLight(PAL.hemiSky, PAL.hemiGround, 1.05));

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
    [0, 12.2, 0, 0xf0f4f8, 2.1, 36],
    [-16, 11.5, 0, 0xe4eef2, 1.25, 22],
    [16, 11.5, 0, 0xe4eef2, 1.25, 22],
    [24, 11, 0, 0xe4eef2, 1.35, 16],
    [-39, 6.2, 0, 0xf0f4f8, 1.4, 14],
    [0, 4.2, 0, 0x7ec8e0, 0.85, 18],
  ];
  const lampN = bq.lamps || 0;
  for (let i = 0; i < lampN && i < lamps.length; i += 1) {
    addLamp(...lamps[i]);
  }
  progress(0.88);
  await yieldToPaint();

  const pipeline = new BathsPipeline(renderer, scene, camera, {
    pixelBudget: bq.pixelBudget,
    minScale: bq.minScale,
    preferScale: bq.preferScale,
  });
  pipeline.enabled.ink = bq.ink;
  pipeline.enabled.fxaa = bq.fxaa;
  pipeline.grade.mat.uniforms.uShadowTint.value.setHex(0x7a8c98);
  pipeline.grade.mat.uniforms.uLightTint.value.setHex(0xf2f4f8);
  pipeline.grade.mat.uniforms.uWarmth.value = 0.0;
  pipeline.grade.mat.uniforms.uSaturation.value = 1.06;
  pipeline.grade.mat.uniforms.uLift.value = 0.03;
  pipeline.ink.mat.uniforms.uFadeStart.value = 50;
  pipeline.ink.mat.uniforms.uFadeEnd.value = 140;
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

  const BATHS_AIM = { active: false, sceneIndex: -1, correct: true, distance: 0 };

  return {
    id: 'baths',
    name: 'Municipal baths',
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
      /*
       * Six metres of look ahead with two metres of drop on the end of it
       * is eighteen degrees of nose down held for the whole loop, on top of
       * whatever the path itself is doing. Measured at 35 percent of the
       * loop pitched more than 25 degrees below the horizon, which is a
       * shot of the floor of a swimming pool. Twelve and 1.2 is seven.
       */
      lookAhead: 12,
      aimDrop: 1.2,
    },
    height: (x, z, fromY) => world.heightAt(x, z, fromY),
    setNextGate() {},
    targetAim: () => BATHS_AIM,
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
      const audit = world.audit();
      return {
        colliders: world.colliders.stats(),
        platforms: world.platforms.length,
        audit,
        leftoverDeath: audit.leftoverDeath,
        leftoverOverlap: audit.leftoverOverlap,
        leftoverSamples: audit.leftoverSamples,
        ...world.merged,
        pipelineScale: pipeline.scale,
        pipelineSize: { x: pipeline.size.x, y: pipeline.size.y },
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
