/*
 * orbit.js: the title camera, with no shell around it.
 *
 * Map cards and the public board need a moving picture of a world. The first
 * time a world is asked for, this page loads it, flies the same attract
 * camera the title screen flies (airframe on the line), records one full
 * cycle at 480p, and stores it. After that the page is a <video> element:
 * no second WebGL context, no second copy of the town, no physics and no
 * WASM.
 *
 * A ?share= id fetches that course from the board and injects the document
 * into the custom map without writing the player's share seat, so several
 * board cards can show several courses without colliding.
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

import { mapById } from '../maps/registry.js';
import { CAMERA_FOV_DEFAULT } from '../render/lens.js';
import { fetchTrackDocument } from './board.js';
import {
  CLIP_W,
  CLIP_H,
  clipKeyForMap,
  clipKeyForShare,
  clipDurationMs,
  getClip,
  putClip,
  makeClipElement,
  recordCanvasStream,
  withCaptureLock,
  whenVisible,
} from './orbitcache.js';

const canvas = document.getElementById('view');
const status = document.getElementById('status');
const params = new URLSearchParams(window.location.search);

function setStatus(text) {
  if (!status) {
    return;
  }
  if (!text) {
    status.classList.add('gone');
    status.textContent = '';
    return;
  }
  status.classList.remove('gone');
  status.textContent = text;
}

function periodMsOf(attract) {
  const n = attract && attract.periodMs;
  return n > 0 ? n : 0;
}

function bytesToBase64(bytes) {
  const chunk = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function clipKey() {
  const shareId = params.get('share') || '';
  if (shareId) {
    return clipKeyForShare(shareId);
  }
  return clipKeyForMap(params.get('map') || 'field');
}

function post(type, extra) {
  try {
    window.parent.postMessage({ type, ...extra }, '*');
  } catch (e) {
    /* Not in an iframe. */
  }
}

async function postClip(key, mapId, blob) {
  if (window.parent === window) {
    return;
  }
  const buffer = await blob.arrayBuffer();
  post('webfpv-orbit-clip', { key, map: mapId, mime: blob.type, buffer });
}

let clipUrl = null;

function showClip(blob) {
  setStatus('');
  if (canvas) {
    canvas.remove();
  }
  const host = document.body;
  const existing = host.querySelector('.orbit-clip');
  if (existing) {
    existing.remove();
  }
  if (clipUrl) {
    URL.revokeObjectURL(clipUrl);
    clipUrl = null;
  }
  const made = makeClipElement(blob, 'orbit-clip');
  clipUrl = made.url;
  made.node.removeAttribute('aria-hidden');
  host.append(made.node);
}

function pinThumb(shell, view, THREE) {
  shell.renderer.setPixelRatio(1);
  shell.renderer.setSize(CLIP_W, CLIP_H, false);
  if (canvas) {
    canvas.style.width = '100%';
    canvas.style.height = '100%';
  }
  shell.camera.aspect = CLIP_W / CLIP_H;
  shell.camera.updateProjectionMatrix();
  if (view.post && view.post.setSize) {
    view.post.setSize(CLIP_W, CLIP_H);
  }
  if (view.scene && THREE) {
    view.scene.traverse((obj) => {
      if (obj.isLight && obj.shadow && obj.shadow.mapSize) {
        obj.shadow.mapSize.set(512, 512);
      }
    });
  }
}

function loseRenderer(shell) {
  try {
    shell.renderer.dispose();
  } catch (e) {
    /* Already gone. */
  }
  try {
    const gl = shell.renderer.getContext();
    const ext = gl && gl.getExtension('WEBGL_lose_context');
    if (ext) {
      ext.loseContext();
    }
  } catch (e) {
    /* The context is already lost. */
  }
}

async function renderAndCapture(mapId, shareId, key) {
  const THREE = await import('three');
  const { buildShell } = await import('../render/shell.js');
  const { makeAttractCamera } = await import('../render/attract.js');

  const spec = mapById(mapId);
  setStatus(`Loading ${spec.name}.`);

  let options;
  if (shareId) {
    const payload = await fetchTrackDocument(shareId);
    const trackDoc = payload.document || payload;
    options = { document: trackDoc };
    window.document.title = payload.name || trackDoc.name || 'WebFPV, orbit';
  }

  const shell = buildShell(canvas, { pixelRatio: 1, powerPreference: 'low-power' });
  /* The same lens the race is flown on, so a course does not look like a
   * different course in the clip somebody shares of it. */
  shell.camera.fov = CAMERA_FOV_DEFAULT;
  shell.resize = () => {
    shell.renderer.setPixelRatio(1);
    shell.renderer.setSize(CLIP_W, CLIP_H, false);
    if (canvas) {
      canvas.style.width = '100%';
      canvas.style.height = '100%';
    }
    shell.camera.aspect = CLIP_W / CLIP_H;
    shell.camera.updateProjectionMatrix();
    return { w: CLIP_W, h: CLIP_H };
  };
  shell.resize();
  shell.camera.updateProjectionMatrix();

  const mod = await spec.load();
  const view = await mod.buildMap(shell, (f) => {
    setStatus(`Building ${spec.name}, ${Math.round(f * 100)} percent.`);
  }, { ...(options || {}), quality: 'low' });
  pinThumb(shell, view, THREE);
  if (view.post) {
    view.post.setSize(CLIP_W, CLIP_H);
  }
  shell.quad.visible = true;

  const attract = makeAttractCamera(view);

  let alive = true;
  const onResize = () => {
    if (!alive) {
      return;
    }
    pinThumb(shell, view, THREE);
  };
  window.addEventListener('resize', onResize);

  const periodMs = periodMsOf(attract);
  const loopMs = clipDurationMs(periodMs);
  /* One full camera cycle in the clip, sped up if the natural period is
   * longer than CLIP_MS_MAX. Recording a slice of a 57 s orbit and looping
   * it is a jump, which is what the board thumbnails were doing. */
  const captureScale = (periodMs > 0 ? periodMs : loopMs) / loopMs;

  let prevWall = performance.now();
  let titleAcc = 0;
  let titleStepMs = 0;
  let camMs = 0;
  let windT0 = 0;
  let frames = 0;
  let raf = 0;

  function frame(nowWall) {
    if (!alive) {
      return;
    }
    raf = requestAnimationFrame(frame);
    const dt = Math.min(nowWall - prevWall, 100);
    prevWall = nowWall;
    camMs += dt * captureScale;
    attract.update(camMs, shell.camera, { craft: shell.quad });
    if (shell.blades) {
      for (let m = 0; m < 4; m += 1) {
        const dir = shell.propSpin ? shell.propSpin[m] : 1;
        shell.blades[m].rotation.y += 0.40 * dir;
        shell.discs[m].rotation.y += 0.40;
      }
    }
    titleAcc += dt;
    const ts = Math.floor(titleAcc);
    titleAcc -= ts;
    titleStepMs += ts > 100 ? 100 : ts;
    view.updateAnim(titleStepMs);
    view.updateShadowFocus(shell.quad.position);
    const windT = windT0 ? (nowWall - windT0) * 0.001 : nowWall * 0.001;
    view.updateWind(windT, shell.quad.position, 0.85);
    view.post.render();
    frames += 1;
    window.__orbitFrames = frames;
  }
  raf = requestAnimationFrame(frame);

  window.__orbitReady = true;
  window.__orbitMap = mapId;
  window.__orbitLoopMs = loopMs;
  post('webfpv-orbit-ready', { map: mapId, cached: false, key });

  let blob;
  try {
    await whenVisible();
    await new Promise((resolve) => {
      const tick = () => {
        if (frames > 8) {
          resolve();
        } else {
          requestAnimationFrame(tick);
        }
      };
      tick();
    });

    camMs = 0;
    titleAcc = 0;
    titleStepMs = 0;
    windT0 = performance.now();
    attract.update(0, shell.camera, { craft: shell.quad });
    view.updateAnim(0);
    view.updateWind(0, shell.quad.position, 0.85);
    view.post.render();

    blob = await recordCanvasStream(canvas, loopMs);
  } catch (e) {
    window.__orbitError = String(e.message || e);
    throw e;
  } finally {
    alive = false;
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', onResize);
    try {
      view.dispose();
    } catch (e) {
      /* The graph may already be gone. */
    }
    loseRenderer(shell);
  }

  await putClip(key, blob);
  if (params.get('capture') === '1') {
    const buf = new Uint8Array(await blob.arrayBuffer());
    window.__orbitCapture = bytesToBase64(buf);
    window.__orbitCaptureDone = true;
  }
  showClip(blob);
  await postClip(key, mapId, blob);
}

async function boot() {
  let mapId = params.get('map') || 'field';
  const shareId = params.get('share') || '';
  if (shareId) {
    mapId = 'custom';
  }
  const key = clipKey();

  const forceCapture = params.get('capture') === '1';
  if (!forceCapture) {
    const cached = await getClip(key);
    if (cached) {
      showClip(cached);
      window.__orbitReady = true;
      window.__orbitMap = mapId;
      window.__orbitCached = true;
      post('webfpv-orbit-ready', { map: mapId, cached: true, key });
      await postClip(key, mapId, cached);
      return;
    }
  }

  await withCaptureLock(async () => {
    if (!forceCapture) {
      const again = await getClip(key);
      if (again) {
        showClip(again);
        window.__orbitReady = true;
        window.__orbitMap = mapId;
        window.__orbitCached = true;
        post('webfpv-orbit-ready', { map: mapId, cached: true, key });
        await postClip(key, mapId, again);
        return;
      }
    }
    await renderAndCapture(mapId, shareId, key);
  });
}

boot().catch((e) => {
  setStatus(e.message || 'The preview failed.');
  window.__orbitError = String(e.message || e);
  console.error(e);
});
