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
 * board cards can show several courses without colliding. A ?mapshare= id
 * does the same for a published freestyle map, into the built world.
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
import { fetchMapDocument, fetchTrackDocument } from './board.js';
import {
  CARD_W, CARD_H, base64Of, composeCard, encodeCard,
} from './card.js';
import {
  CLIP_W,
  CLIP_H,
  clipKeyForMap,
  clipKeyForMapShare,
  clipKeyForSeatedShare,
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
    return clipKeyForSeatedShare(shareId);
  }
  const mapShareId = params.get('mapshare') || '';
  if (mapShareId) {
    return clipKeyForMapShare(mapShareId, params.get('v') || '');
  }
  const mapId = params.get('map') === 'field' ? 'custom' : (params.get('map') || 'custom');
  return clipKeyForMap(mapId);
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

async function renderAndCapture(mapId, shareId, key, mapShareId = '') {
  const THREE = await import('three');
  const { buildShell } = await import('../render/shell.js');
  const { makeAttractCamera } = await import('../render/attract.js');

  const spec = mapById(mapId);
  /* What the status line calls the world. A published map is flown in the
   * built world, whose name is Your map, and on the board's sheet that is
   * somebody else's map, so it is called by its own name once it is here. */
  let called = mapShareId ? 'the map' : spec.name;
  setStatus(`Loading ${called}.`);

  let options;
  if (shareId) {
    const payload = await fetchTrackDocument(shareId);
    const trackDoc = payload.document || payload;
    options = { document: trackDoc };
    window.document.title = payload.name || trackDoc.name || 'WebFPV, orbit';
  } else if (mapShareId) {
    const payload = await fetchMapDocument(mapShareId);
    const mapDoc = payload.document || payload;
    options = { document: mapDoc };
    called = payload.name || mapDoc.name || called;
    window.document.title = payload.name || mapDoc.name || 'WebFPV, orbit';
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
    setStatus(`Building ${called}, ${Math.round(f * 100)} percent.`);
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
    /*
     * A FLOOR AS WELL AS A CEILING. prevWall is seeded from
     * performance.now() during setup, and the timestamp requestAnimationFrame
     * hands the first callback is the time that FRAME began, which the
     * browser may have started before the setup call that read the clock.
     * The first delta is then negative, tens of milliseconds of it, and the
     * camera clock started the recording behind zero.
     *
     * The ceiling was here for a backgrounded tab. The floor is for this:
     * time does not run backwards, so a negative delta is a lie about the
     * clock rather than a small step, and it belongs at zero.
     */
    const dt = Math.min(Math.max(nowWall - prevWall, 0), 100);
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

/*
 * CARD MODE, ?card=1: one frame of this same shot at 1200 by 630 with the
 * wordmark on it, which is the picture a shared link to the track or map
 * shows. ./card.js opens the page this way in the browser that has just
 * published, and scripts/boardcards.js opens it headless for everything
 * published before cards existed.
 *
 * NOTHING HERE WAITS ON A FRAME. ./card.js lays this page out off screen,
 * and a browser is free to stop animating what nobody can see; a still
 * needs no clock, so it never asks for one. The world is built, the camera
 * is put where the sheet's clip starts, and the frame is drawn and read in
 * one task, which is the one moment a WebGL canvas with no preserved buffer
 * still holds what was drawn into it.
 *
 * THE HIGH PRESET, WHATEVER MACHINE THIS IS. It is one frame, not sixty a
 * second, and a card should look the same whoever published the track:
 * scripts/og.js holds the site's own card to High for the same reason. No
 * clip cache either way. A card is made once, at publish, and kept by the
 * board, so there is nothing for this browser to remember.
 */
const CARD_QUALITY = 'high';

/* Where in the sheet's camera the card is taken: where its clip starts,
 * so the card and the first frame of the board's picture are one view. */
const CARD_AT_MS = 0;

/* Frames drawn and thrown away before the one that is kept. The shadow
 * focus follows the airframe and the post chain sizes itself on its first
 * pass; by the fourth frame neither is moving. */
const CARD_WARMUP = 3;

const nextTick = () => new Promise((resolve) => { setTimeout(resolve, 0); });

/*
 * THE CARD'S CAMERA, WHICH IS THE SHEET'S CAMERA LIFTED.
 *
 * The sheet flies the title screen's shot: low over the grass, framed for
 * movement and for a menu beside it. Held still at 1200 by 630 that is a
 * strip of course on the horizon over half a card of lawn, and on a map it
 * is one street. A card has one frame to say what somebody built, so it
 * keeps the sheet's centre and the side the sheet starts from and climbs:
 * the whole layout from above and to one side, the way a drone's first shot
 * of a field shows it, with the airframe in the near corner so the picture
 * still says what is flown there.
 *
 * Both of the shapes the sheet's camera comes in carry the scale this
 * needs. A course's orbit is a centre and a radius framed from its own
 * bounds (attractOrbit in src/render/scene.js); a map's is a closed line
 * round its plot (orbitPath in src/maps/built/index.js), whose centre and
 * mean radius are the same two numbers.
 *
 * A ROOM KEEPS THE SHEET'S OWN FRAME. Its orbit is already the most of the
 * room a camera inside four walls can see, and lifting it puts the lens in
 * the joists.
 */
const CARD_PITCH = 0.58;
const CARD_BACK = { orbit: 0.8, path: 1.25 };

function cardFraming(view) {
  const spec = view && view.attract;
  if (!spec) {
    return null;
  }
  if (Array.isArray(spec.path) && spec.path.length >= 4) {
    let cx = 0;
    let cz = 0;
    for (const p of spec.path) {
      cx += p.x;
      cz += p.z;
    }
    cx /= spec.path.length;
    cz /= spec.path.length;
    let r = 0;
    for (const p of spec.path) {
      r += Math.hypot(p.x - cx, p.z - cz);
    }
    r /= spec.path.length;
    /* The line starts on the side the sheet's clip starts on. */
    const first = spec.path[0];
    const az = Math.atan2(first.x - cx, first.z - cz);
    return {
      cx, cy: 0, cz, az, reach: r * CARD_BACK.path, aim: 0,
    };
  }
  if (Number.isFinite(spec.radius)) {
    return {
      cx: spec.x, cy: spec.y, cz: spec.z, az: 0, reach: spec.radius * CARD_BACK.orbit, aim: spec.aim || 0,
    };
  }
  return null;
}

function placeCardCamera(view, camera, craft, THREE) {
  const f = cardFraming(view);
  if (!f) {
    return false;
  }
  const target = new THREE.Vector3(f.cx, f.cy + f.aim, f.cz);
  const flat = f.reach * Math.cos(CARD_PITCH);
  camera.position.set(
    f.cx + Math.sin(f.az) * flat,
    f.cy + f.aim + f.reach * Math.sin(CARD_PITCH),
    f.cz + Math.cos(f.az) * flat,
  );
  camera.up.set(0, 1, 0);
  camera.lookAt(target);
  camera.updateMatrixWorld();

  if (craft) {
    /* A few metres out from the lens, low and to the right, nose on the
     * course and banked into it: in the frame, and off the layout. */
    const fwd = new THREE.Vector3();
    camera.getWorldDirection(fwd);
    const right = new THREE.Vector3().crossVectors(fwd, camera.up).normalize();
    const up = new THREE.Vector3().crossVectors(right, fwd).normalize();
    craft.visible = true;
    craft.up.set(0, 1, 0);
    craft.position.copy(camera.position)
      .addScaledVector(fwd, 3.2)
      .addScaledVector(right, 1.05)
      .addScaledVector(up, -0.62);
    craft.lookAt(target);
    craft.rotateZ(-0.35);
  }
  return true;
}

async function drawCard(mapId, shareId, mapShareId) {
  const THREE = await import('three');
  const { buildShell } = await import('../render/shell.js');
  const { makeAttractCamera } = await import('../render/attract.js');

  const spec = mapById(mapId);
  let called = mapShareId ? 'the map' : spec.name;
  setStatus(`Loading ${called}.`);
  let options = {};
  if (shareId) {
    const payload = await fetchTrackDocument(shareId);
    options = { document: payload.document || payload };
    called = payload.name || options.document.name || called;
  } else if (mapShareId) {
    const payload = await fetchMapDocument(mapShareId);
    options = { document: payload.document || payload };
    called = payload.name || options.document.name || called;
  }
  window.document.title = `${called}, share card`;

  const shell = buildShell(canvas, { pixelRatio: 1, powerPreference: 'low-power' });
  shell.camera.fov = CAMERA_FOV_DEFAULT;
  shell.resize = () => {
    shell.renderer.setPixelRatio(1);
    shell.renderer.setSize(CARD_W, CARD_H, false);
    shell.camera.aspect = CARD_W / CARD_H;
    shell.camera.updateProjectionMatrix();
    return { w: CARD_W, h: CARD_H };
  };
  shell.resize();

  let view = null;
  try {
    const mod = await spec.load();
    view = await mod.buildMap(shell, (f) => {
      setStatus(`Building ${called}, ${Math.round(f * 100)} percent.`);
    }, { ...options, quality: CARD_QUALITY });
    shell.resize();
    if (view.post) {
      view.post.setSize(CARD_W, CARD_H);
    }
    shell.quad.visible = true;
    const attract = makeAttractCamera(view);
    const room = view.trackClass === 'micro';
    const draw = () => {
      attract.update(CARD_AT_MS, shell.camera, { craft: shell.quad });
      if (!room) {
        placeCardCamera(view, shell.camera, shell.quad, THREE);
      }
      view.updateAnim(CARD_AT_MS);
      view.updateShadowFocus(shell.quad.position);
      view.updateWind(0, shell.quad.position, 0.85);
      view.post.render();
    };
    for (let i = 0; i < CARD_WARMUP; i += 1) {
      draw();
      await nextTick();
    }
    draw();
    /* No await between the draw above and this read. */
    const card = composeCard(canvas);
    const bytes = await encodeCard(card);
    return { card, bytes };
  } finally {
    try {
      if (view) {
        view.dispose();
      }
    } catch (e) {
      /* The graph may already be gone. */
    }
    loseRenderer(shell);
  }
}

/* The card, shown in place of the world, so a person who opens this page
 * with ?card=1 by hand sees what a crawler will be sent. */
function showCard(card) {
  setStatus('');
  if (canvas) {
    canvas.remove();
  }
  card.className = 'orbit-clip';
  card.style.objectFit = 'contain';
  document.body.append(card);
}

async function bootCard(mapId, shareId, mapShareId) {
  const { card, bytes } = await drawCard(mapId, shareId, mapShareId);
  showCard(card);
  window.__cardBytes = bytes.length;
  window.__cardBase64 = base64Of(bytes);
  window.__cardDone = true;
  post('webfpv-card', { buffer: bytes.buffer, bytes: bytes.length });
}

async function boot() {
  let mapId = params.get('map') || 'custom';
  const shareId = params.get('share') || '';
  const mapShareId = shareId ? '' : (params.get('mapshare') || '');
  if (shareId) {
    mapId = 'custom';
  } else if (mapShareId) {
    mapId = 'built';
  }
  if (mapId === 'field') {
    mapId = 'custom';
  }
  if (params.get('card') === '1') {
    await bootCard(mapId, shareId, mapShareId);
    return;
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
    await renderAndCapture(mapId, shareId, key, mapShareId);
  });
}

boot().catch((e) => {
  setStatus(e.message || 'The preview failed.');
  window.__orbitError = String(e.message || e);
  if (params.get('card') === '1') {
    /* The page that opened this is waiting on one of two messages, and a
     * failure has to be the other one or it waits out its whole timer. */
    window.__cardError = window.__orbitError;
    post('webfpv-card-error', { error: window.__orbitError });
  }
  console.error(e);
});
