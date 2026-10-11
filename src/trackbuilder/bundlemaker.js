/*
 * bundlemaker.js: the half of the export bundle that needs a browser.
 *
 * bundle.js makes the data, the map and the page, and needs nothing but a
 * language. The stills of the room and the lap animation need a GL context, so
 * they live here and are imported only when somebody asks for a bundle, the
 * same way animate.js is, so a pilot who never exports pays for none of it.
 *
 * WHAT IT COSTS A WEAK MACHINE, because that is the standing priority.
 * - The stills are six draws of one scene at 800 by 500 from one renderer,
 *   which is a fraction of a second on an integrated card. One renderer, one
 *   stage, the camera moved between shots: nothing is rebuilt per picture.
 * - The lap animation is the expensive part and it is the existing exporter,
 *   unchanged: a two pass render that yields to the page every few frames,
 *   holds one frame and a histogram rather than the animation, and stops at
 *   the next frame when the box is closed. The bundle asks it for the card
 *   size (384 by 240) by default, which is a few seconds, and the pilot can
 *   switch the animation off and still get everything else at once.
 * - The zip is stored, not deflated (zip.js), so packing costs one pass of a
 *   CRC and a copy.
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

import { buildPath } from './path.js';
import { buildStage, detailOf } from './stage.js';
import { bundleEntries, VIEWS, VIEW_SIZE, viewPath } from './bundle.js';
import { zipStore } from './zip.js';

/* The animation choices the dialog offers. Null is none. */
export const BUNDLE_GIFS = {
  none: null,
  card: { width: 384, height: 240, delayCs: 6, nameplate: false },
  large: { width: 640, height: 400, delayCs: 5, nameplate: false },
};

const stopped = () => {
  const e = new Error('Stopped.');
  e.name = 'AbortError';
  return e;
};

/* Let the page repaint between pictures, so a status line moves. */
const nextTick = () => new Promise((resolve) => { setTimeout(resolve, 0); });

/*
 * THE STILLS, as { path: bytes }, each view with the line and without it. The
 * line is the whole lap in one even ribbon (stage.setRoute), and without it
 * the ribbon and the pane are hidden and what is left is the pipe. Returns an
 * empty object, not an error, when the card cannot draw: the bundle is still
 * whole without them and the dialog says so.
 */
export async function renderStills(doc, { signal = null, onProgress = null } = {}) {
  const { width, height } = VIEW_SIZE;
  const THREE = await import('three');
  const path = buildPath(doc, { closeLoop: true });
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  let renderer = null;
  let stage = null;
  const images = {};
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    stage = buildStage(THREE, doc, path, {
      width, height, nameplate: false, detail: detailOf(width, height, renderer.capabilities.maxTextureSize),
    });
    let done = 0;
    for (const view of VIEWS) {
      stage.look((view.azimuthDeg * Math.PI) / 180, (view.elevationDeg * Math.PI) / 180);
      for (const route of [true, false]) {
        if (signal && signal.aborted) {
          throw stopped();
        }
        stage.setRoute(route);
        renderer.render(stage.scene, stage.camera);
        /* toBlob is asked in the same turn as the draw, because the drawing
         * buffer is only promised until the page next paints. */
        // eslint-disable-next-line no-await-in-loop
        const blob = await new Promise((resolve) => { canvas.toBlob(resolve, 'image/png'); });
        if (!blob) {
          return {};
        }
        // eslint-disable-next-line no-await-in-loop
        images[viewPath(view, route)] = new Uint8Array(await blob.arrayBuffer());
        done += 1;
        if (onProgress) { onProgress(done, VIEWS.length * 2); }
        // eslint-disable-next-line no-await-in-loop
        await nextTick();
      }
    }
    return images;
  } finally {
    if (stage) { stage.dispose(); }
    if (renderer) {
      renderer.dispose();
      renderer.forceContextLoss();
    }
  }
}

/*
 * THE BUNDLE, as the bytes of a zip. `gif` is a key of BUNDLE_GIFS, `stills`
 * whether to draw the six pictures. onStatus(text) says which part is running,
 * and `signal` stops it at the next picture or frame. A part that cannot be
 * drawn on this machine is left out and named in `skipped`, so one weak card
 * costs the bundle a picture and not the bundle.
 */
export async function makeBundle(doc, {
  gif = 'card', stills = true, signal = null, onStatus = () => {}, now = new Date().toISOString(),
} = {}) {
  const skipped = [];
  let images = {};
  if (stills) {
    onStatus('Drawing the views of the room.');
    try {
      images = await renderStills(doc, {
        signal,
        onProgress: (d, n) => onStatus(`Drawing the views of the room, ${d} of ${n}.`),
      });
      if (!Object.keys(images).length) {
        skipped.push('the views of the room');
      }
    } catch (e) {
      if (e && e.name === 'AbortError') { throw e; }
      skipped.push(`the views of the room (${e && e.message ? e.message : e})`);
      images = {};
    }
  }
  let lap = null;
  const choice = BUNDLE_GIFS[gif] || null;
  if (choice) {
    onStatus('Loading the animation renderer.');
    try {
      const { exportTrackGif } = await import('./animate.js');
      lap = await exportTrackGif(doc, {
        ...choice,
        signal,
        onProgress: (d, n) => onStatus(`Rendering the lap animation, frame ${d} of ${n}.`),
      });
    } catch (e) {
      if (e && e.name === 'AbortError') { throw e; }
      skipped.push(`the lap animation (${e && e.message ? e.message : e})`);
      lap = null;
    }
  }
  onStatus('Packing the files.');
  await nextTick();
  const { entries, data } = bundleEntries(doc, { images, lap, now });
  const bytes = zipStore(entries, { date: new Date(now) });
  return { bytes, data, skipped, files: entries.length };
}
