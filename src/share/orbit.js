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
import { MICRO_SCALE } from '../game/track.js';
import { ROOM_WIDTH, ROOM_DEPTH, ROOM_HEIGHT } from '../trackbuilder/racegow.js';
import { fetchGhost, fetchMapDocument, fetchTrackDocument } from './board.js';
import { decodeGhost, ghostFromBase64 } from './ghostdata.js';
import { GhostLap } from '../game/ghost.js';
import {
  CARD_W, CARD_H, THUMB_W, THUMB_H, base64Of, composeCard, composeThumb, encodeCard, encodeThumb,
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

/* ?ghost= is a time on the board whose recorded lap the sheet flies, so a
 * track's clip is kept per lap as well as per track. */
const ghostId = params.get('ghost') || '';

function clipKey() {
  const shareId = params.get('share') || '';
  if (shareId) {
    const base = clipKeyForSeatedShare(shareId);
    return ghostId ? `${base}:ghost:${ghostId}` : base;
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

/*
 * A GHOST LAP, the owner's pick of 2026-10-19 for the board's track sheet:
 * "a fly a ghoast lap here?". With ?ghost= the sheet's clip is not the
 * title camera going round the layout but one recorded lap off the board,
 * the airframe flown along it and a camera chasing it, so a reader sees
 * the line the track is raced on before they fly it.
 *
 * THE CAMERA RIDES THE LINE ITSELF, a moment behind the airframe and a
 * little above it: where the craft was GHOST_LAG_MS ago, lifted by a share
 * of the distance it has flown since. The flown line is the one path
 * through the course known to miss every gate, so a camera on it misses
 * them too, and both the lag and the lift scale with speed, so a whoop in
 * a room and a five inch on a field are framed alike with no per class
 * numbers. A floor keeps it off the airframe when the lap hovers and a
 * reach of GHOST_REACH floors keeps a fast lap from leaving it a speck, and
 * it is eased so a twitch on the sticks is not a jolt on the screen.
 *
 * The clip is the lap at the speed it was flown, up to GHOST_CLIP_MAX_MS;
 * a longer lap is played faster to fit, as the orbit is.
 */
const GHOST_LAG_MS = 340;
const GHOST_LIFT = 0.42;
const GHOST_EASE_MS = 90;
const GHOST_CLIP_MAX_MS = 40000;
const GHOST_REACH = 1.8;

function makeGhostChase(lap, THREE, floor) {
  const pose = {};
  const at = new THREE.Vector3();
  const from = new THREE.Vector3();
  const cam = new THREE.Vector3(); // the camera's offset from the airframe
  const dir = new THREE.Vector3();
  let primed = false;
  const lapMs = lap.durationMs;
  const sampleInto = (t, v) => {
    const wrapped = ((t % lapMs) + lapMs) % lapMs;
    lap.sample(wrapped, pose);
    v.set(pose.px, pose.py, pose.pz);
    return pose;
  };
  return {
    lapMs,
    reset() {
      primed = false;
    },
    update(tMs, dtMs, camera, craft) {
      const p = sampleInto(tMs, at);
      if (craft) {
        craft.position.copy(at);
        craft.quaternion.set(p.qx, p.qy, p.qz, p.qw);
      }
      sampleInto(tMs - GHOST_LAG_MS, from);
      dir.subVectors(at, from);
      let dist = dir.length();
      if (dist < 1e-4) {
        dir.set(0, 0, 1);
      } else {
        dir.divideScalar(dist);
      }
      if (dist < floor || dist > floor * GHOST_REACH) {
        dist = Math.min(Math.max(dist, floor), floor * GHOST_REACH);
        from.copy(at).addScaledVector(dir, -dist);
      }
      from.y += dist * GHOST_LIFT;
      /* The OFFSET is eased, not the position: an eased position trails a
       * fast lap by its speed times the ease, metres on a five inch, and
       * the airframe shrinks to a speck however close the reach is. */
      from.sub(at);
      if (!primed) {
        cam.copy(from);
        primed = true;
      } else {
        cam.lerp(from, 1 - Math.exp(-Math.max(0, dtMs) / GHOST_EASE_MS));
      }
      camera.up.set(0, 1, 0);
      camera.position.copy(at).add(cam);
      camera.lookAt(at);
    },
  };
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

  /* The recorded lap, when the sheet asked for one. A ghost that cannot be
   * had is not an error worth an empty box: the orbit flies instead. */
  let chase = null;
  if (shareId && ghostId) {
    try {
      setStatus('Loading the lap.');
      const payload = await fetchGhost(shareId, ghostId);
      const lap = new GhostLap(decodeGhost(ghostFromBase64(payload.ghost)), {
        name: payload.name || '', source: 'board',
      });
      const room = view.trackClass === 'micro';
      if (room && typeof shell.swapCraft === 'function') {
        /* A room is flown on the whoop, so the lap is drawn on one. */
        shell.swapCraft('whoop65');
      }
      /* The same floor for both: the whoop is drawn MICRO_SCALE times life
       * size, which is the five inch's sweep exactly (src/render/craft.js). */
      chase = makeGhostChase(lap, THREE, 0.6);
      setStatus('');
    } catch (e) {
      console.warn('The recorded lap could not be loaded, so the sheet shows the orbit.', e);
    }
  }

  let alive = true;
  const onResize = () => {
    if (!alive) {
      return;
    }
    pinThumb(shell, view, THREE);
  };
  window.addEventListener('resize', onResize);

  const periodMs = chase ? chase.lapMs : periodMsOf(attract);
  const loopMs = chase ? Math.min(chase.lapMs, GHOST_CLIP_MAX_MS) : clipDurationMs(periodMs);
  /* One full camera cycle in the clip, sped up if the natural period is
   * longer than CLIP_MS_MAX. Recording a slice of a 57 s orbit and looping
   * it is a jump, which is what the board thumbnails were doing. A lap is
   * one cycle too, start line to start line. */
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
    if (chase) {
      chase.update(camMs, dt * captureScale, shell.camera, shell.quad);
    } else {
      attract.update(camMs, shell.camera, { craft: shell.quad });
    }
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
    if (chase) {
      chase.reset();
      chase.update(0, 0, shell.camera, shell.quad);
    } else {
      attract.update(0, shell.camera, { craft: shell.quad });
    }
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

/* Where in the sheet's camera a room's card is taken: where its clip
 * starts, so the card and the first frame of the board's picture are one
 * view. Everything else is lifted off the same start (placeCardCamera). */
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
const CARD_SHOT = { pitch: 0.58, orbit: 0.8, path: 1.25 };

/*
 * THE PICKER'S THUMBNAIL, the card's twin. A picker shows a track at a
 * quarter of a laptop's width and a map in a strip of five, so the picture
 * has to be the layout and nothing else: no wordmark, no shading laid over
 * it for type to sit on, and no airframe in the near corner, which at that
 * size is a smudge over somebody's gates. The camera comes a little closer
 * and a little lower than the card's, because a thumbnail is cropped to
 * 16:9 rather than the card's wider frame and loses its edges first.
 *
 * DRAWN AT TWICE ITS SIZE AND BROUGHT DOWN, which is the cheapest
 * antialiasing there is and the difference between a gate and a stair of
 * pixels at 960 wide. One frame, at publish, in the publisher's browser:
 * nobody flying pays for it.
 */
const THUMB_SHOT = { pitch: 0.5, orbit: 0.7, path: 1.3 };

/* A map is a plot of buildings rather than a field of gates, so its camera
 * climbs higher to see over them (measured on Chimney Dive Training, Sakura
 * Desert and Infinity Loops, 19 October 2026). */
const THUMB_MAP_PITCH = 0.68;

/*
 * THE CLEAR SIDE. The card's rule takes one side, the side the sheet's clip
 * starts from, and on a map with a tower near the middle that side can be a
 * wall of windows (Chimney Dive Training's was). So the thumbnail tries
 * eight sides and keeps the one whose view of the middle is least blocked:
 * five rays from the lens, at the middle and a little way out towards each
 * corner of the frame, each scored by how far it gets before it hits
 * something, as a share of the way to the ground. Eight positions and forty
 * rays, once, at publish.
 */
const THUMB_SIDES = 8;
const THUMB_PROBES = [[0, 0], [0.35, 0.3], [-0.35, 0.3], [0.35, -0.3], [-0.35, -0.3]];

/* A shipped world's thumbnail may want its own shot, because a fixed world
 * has one good side that no rule finds. scripts/boardcards.js --worlds
 * passes it as tp (pitch), tr (reach, times the rule's) and ta (a turn off
 * the rule's side, radians). Nothing a pilot opens names these. */
function thumbShot() {
  const num = (k, d) => {
    const v = Number(params.get(k));
    return params.has(k) && Number.isFinite(v) ? v : d;
  };
  const reach = num('tr', 1);
  return {
    pitch: num('tp', THUMB_SHOT.pitch),
    orbit: THUMB_SHOT.orbit * reach,
    path: THUMB_SHOT.path * reach,
    turn: num('ta', 0),
  };
}
const THUMB_SCALE = 2;

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
      cx, cy: 0, cz, az, reach: r, aim: 0, path: true,
    };
  }
  if (Number.isFinite(spec.radius)) {
    return {
      cx: spec.x, cy: spec.y, cz: spec.z, az: 0, reach: spec.radius, aim: spec.aim || 0, path: false,
    };
  }
  return null;
}

/* Returns the point the camera looks at, which is where the card wants its
 * shadows, or null when the world gave nothing to frame by. */
function placeCardCamera(view, camera, craft, THREE, shot = CARD_SHOT) {
  const f = cardFraming(view);
  if (!f) {
    return null;
  }
  const target = new THREE.Vector3(f.cx, f.cy + f.aim, f.cz);
  const reach = f.reach * (f.path ? shot.path : shot.orbit);
  const flat = reach * Math.cos(shot.pitch);
  const az = f.az + (shot.turn || 0);
  camera.position.set(
    f.cx + Math.sin(az) * flat,
    f.cy + f.aim + reach * Math.sin(shot.pitch),
    f.cz + Math.cos(az) * flat,
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
  return target;
}

/*
 * A ROOM'S THUMBNAIL IS TAKEN FROM A TOP CORNER, the way a photograph of a
 * hall is: the lens up under the joists and in off both walls, looking down
 * across the floor at the middle of the layout, a little wider than the
 * goggles. The sheet's own frame, which the card keeps, is the title
 * screen's orbit at gate height, and in a picture the size of a stamp that
 * is one gate and a wall. The corner is whichever of the four sees the
 * layout least blocked, on THUMB_PROBES' terms. The room is centred on the
 * origin, as src/render/scene.js builds it, in the flown metres
 * (MICRO_SCALE times the rulebook's).
 */
const ROOM_THUMB_FOV = 68;
function placeRoomCamera(view, camera, THREE, corner) {
  const spec = (view && view.attract) || {};
  const w = ROOM_WIDTH * MICRO_SCALE;
  const d = ROOM_DEPTH * MICRO_SCALE;
  const h = ROOM_HEIGHT * MICRO_SCALE;
  const inset = 0.7 * MICRO_SCALE;
  const sx = corner & 1 ? 1 : -1;
  const sz = corner & 2 ? 1 : -1;
  const target = new THREE.Vector3(
    Number.isFinite(spec.x) ? spec.x : 0,
    (Number.isFinite(spec.y) ? spec.y : 0) + 0.45 * MICRO_SCALE,
    Number.isFinite(spec.z) ? spec.z : 0,
  );
  camera.fov = ROOM_THUMB_FOV;
  camera.updateProjectionMatrix();
  camera.position.set(sx * (w / 2 - inset), h * 0.82, sz * (d / 2 - inset));
  camera.up.set(0, 1, 0);
  camera.lookAt(target);
  camera.updateMatrixWorld();
  return target;
}

/* How much of a view from `cam` towards `target` gets there unblocked. */
function clearance(scene, cam, target, THREE) {
  const ray = new THREE.Raycaster();
  const whole = cam.position.distanceTo(target);
  let score = 0;
  for (const [x, y] of THUMB_PROBES) {
    ray.setFromCamera(new THREE.Vector2(x, y), cam);
    ray.far = whole * 0.97;
    const hit = ray.intersectObjects(scene.children, true).find((h) => h.object.visible !== false);
    score += hit ? hit.distance / whole : 1;
  }
  return score;
}

function clearestCorner(view, shell, THREE) {
  const scene = view.scene || shell.scene;
  if (!scene) {
    return 0;
  }
  scene.updateMatrixWorld(true);
  const cam = shell.camera.clone();
  let best = 0;
  let bestScore = -1;
  for (let corner = 0; corner < 4; corner += 1) {
    const target = placeRoomCamera(view, cam, THREE, corner);
    const score = clearance(scene, cam, target, THREE);
    if (score > bestScore + 1e-3) {
      bestScore = score;
      best = corner;
    }
  }
  return best;
}

/* The turn off the rule's side whose view is least blocked. See THUMB_SIDES. */
function clearestTurn(view, shell, THREE, shot) {
  const scene = view.scene || shell.scene;
  if (!scene) {
    return 0;
  }
  scene.updateMatrixWorld(true);
  const cam = shell.camera.clone();
  let best = 0;
  let bestScore = -1;
  for (let i = 0; i < THUMB_SIDES; i += 1) {
    const turn = (i / THUMB_SIDES) * Math.PI * 2;
    const target = placeCardCamera(view, cam, null, THREE, { ...shot, turn });
    if (!target) {
      return 0;
    }
    const score = clearance(scene, cam, target, THREE);
    /* Ties keep the rule's own side, and the sides near it. */
    if (score > bestScore + 1e-3) {
      bestScore = score;
      best = turn;
    }
  }
  return best;
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
    /*
     * NOTHING CULLED FOR DISTANCE. A world that hides what is past its fog
     * does it for the frame rate of a pilot flying through it, and a card is
     * one frame from further back than any pilot flies, so a map's far
     * corner would otherwise be missing from the one picture of it.
     */
    if (view.setCullRadius) {
      view.setCullRadius(1e6);
    }
    const attract = makeAttractCamera(view);
    const room = view.trackClass === 'micro';
    const draw = () => {
      attract.update(CARD_AT_MS, shell.camera, { craft: shell.quad });
      /* The shadows go where the card looks, the middle of the layout; the
       * sheet puts them on the airframe, which here is a few metres from a
       * lens high over the field, and nowhere near a shadow. */
      const aim = room ? null : placeCardCamera(view, shell.camera, shell.quad, THREE);
      view.updateAnim(CARD_AT_MS);
      view.updateShadowFocus(aim || shell.quad.position);
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

    /*
     * The thumbnail, out of the same built world: the second frame costs a
     * resize and a few draws, where a second page would cost the whole
     * world again. A thumbnail that fails leaves the card as it was, and
     * the picker falls back to the card's picture, so nothing here throws.
     */
    let thumb = null;
    let thumbBytes = null;
    try {
      const tw = THUMB_W * THUMB_SCALE;
      const th = THUMB_H * THUMB_SCALE;
      shell.renderer.setSize(tw, th, false);
      shell.camera.aspect = tw / th;
      shell.camera.updateProjectionMatrix();
      if (view.post) {
        view.post.setSize(tw, th);
      }
      const shot = thumbShot();
      const framing = cardFraming(view);
      if (framing && framing.path && !params.has('tp')) {
        shot.pitch = THUMB_MAP_PITCH;
      }
      if (!room && framing && !params.has('ta')) {
        shot.turn = clearestTurn(view, shell, THREE, shot);
      }
      const corner = room ? clearestCorner(view, shell, THREE) : 0;
      const drawThumb = () => {
        attract.update(CARD_AT_MS, shell.camera, { craft: shell.quad });
        const aim = room
          ? placeRoomCamera(view, shell.camera, THREE, corner)
          : placeCardCamera(view, shell.camera, null, THREE, shot);
        shell.quad.visible = false;
        view.updateAnim(CARD_AT_MS);
        view.updateShadowFocus(aim || shell.quad.position);
        view.updateWind(0, shell.quad.position, 0.85);
        view.post.render();
      };
      for (let i = 0; i < CARD_WARMUP; i += 1) {
        drawThumb();
        await nextTick();
      }
      drawThumb();
      thumb = composeThumb(canvas);
      thumbBytes = await encodeThumb(thumb);
    } catch (e) {
      console.warn('The thumbnail could not be drawn.', e);
    }
    return {
      card, bytes, thumb, thumbBytes,
    };
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
  const {
    card, bytes, thumb, thumbBytes,
  } = await drawCard(mapId, shareId, mapShareId);
  /* ?show=thumb puts the thumbnail up instead, for a person checking it. */
  showCard(params.get('show') === 'thumb' && thumb ? thumb : card);
  window.__cardBytes = bytes.length;
  window.__cardBase64 = base64Of(bytes);
  window.__thumbBase64 = thumbBytes ? base64Of(thumbBytes) : '';
  window.__cardDone = true;
  post('webfpv-card', {
    buffer: bytes.buffer,
    bytes: bytes.length,
    thumb: thumbBytes ? thumbBytes.buffer : null,
  });
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
