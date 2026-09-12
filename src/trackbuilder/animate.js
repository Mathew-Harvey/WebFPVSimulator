/*
 * animate.js: render a track's lap and hand back the bytes of a GIF.
 *
 * This is the only file that knows both halves. stage.js knows how to draw
 * frame i and nothing about files; gif.js knows how to write a file and
 * nothing about tracks. Here they meet, and the meeting is short on purpose.
 *
 * WHY A BROWSER AT ALL. The scene is Three.js and Three.js is WebGL, so the
 * pixels have to come out of a real GL context. There is no node_modules in
 * this project and the bare three specifier resolves only through a page's
 * import map, so there is no headless path that skips the browser. The
 * builder calls this directly; scripts/trackgif.js reaches it through
 * src/trackbuilder/animate.html in Chromium. Same code, same file.
 *
 * WHY TWO PASSES. A palette has to be chosen before the first frame can be
 * written, and choosing it well means looking at more than the first frame,
 * because the ribbon lights different parts of the track as it goes. Holding
 * every frame to do that would be 300 MB at 512 by 512. So the first pass
 * renders a sixteenth of the frames and keeps those, and the second pass
 * renders all of them and feeds each straight to the encoder. Peak memory is
 * the sample, about 19 MB, rather than the animation.
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
import { trackClassOf } from './elements.js';
import { buildStage, lapFrames } from './stage.js';
import { buildPalette, GifEncoder } from './gif.js';

/* One frame in sixteen is enough to see every colour the animation uses,
 * because the only things that move are the ribbon and the pane and both
 * keep their colours wherever they are. */
const PALETTE_STRIDE = 16;

/* How often to let the page breathe. Every fifth frame: often enough that a
 * status line repaints while a minute of rendering goes by, rare enough that
 * the yielding is not itself the cost. */
const YIELD_EVERY = 5;

const nextTick = () => new Promise((resolve) => { setTimeout(resolve, 0); });

/* WebGL hands back rows from the bottom up and every image format in the
 * world is top down, so somebody has to turn it over. */
function flipRows(src, dst, size) {
  const stride = size * 4;
  for (let y = 0; y < size; y += 1) {
    const from = (size - 1 - y) * stride;
    dst.set(src.subarray(from, from + stride), y * stride);
  }
}

/*
 * doc is a track document. The returned bytes are a complete .gif.
 *
 * onProgress(done, total) is called after every rendered frame of both
 * passes, so a caller showing a status line gets a number that only goes up.
 *
 * camera, when given, is a fixed viewpoint in document coordinates, an
 * { eye, aim, fovDeg } that stage.js uses instead of framing the track
 * itself. It is how an export is laid over a reference picture.
 */
export async function exportTrackGif(doc, {
  size = 512, frames = null, delayCs = 4, onProgress = null, camera = null,
} = {}) {
  const THREE = await import('three');

  /*
   * The lap closes on the first gate flown, whether or not the author placed
   * start pads, because that is what a lap is in this discipline. Without
   * this the line stops at the last gate and the animation cannot loop.
   */
  const path = buildPath(doc, { closeLoop: true });
  if (path.knots.length < 2 || path.length <= 0) {
    throw new Error(
      'This track has no lap to animate yet. Sequence at least two elements, then try again.',
    );
  }

  /*
   * HOW LONG THE LOOP IS, and it comes from the LAP rather than from a
   * constant. Every track used to take the same twelve seconds, so a long
   * course flew fast and a short one crawled. The quad now covers the same
   * ground per second whatever it is flying, which is what RaceGOW's own
   * animations do: see LAP_SPEED in stage.js. A caller that names `frames`
   * still gets exactly those, which is what --frames is for.
   */
  const shots = frames == null
    ? lapFrames(path.length, trackClassOf(doc), delayCs)
    : frames;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  let renderer = null;
  let target = null;
  let stage = null;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false });
    renderer.setPixelRatio(1);
    renderer.setSize(size, size, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    /*
     * Rendered into a target rather than onto the canvas, so the pixels can
     * be read back without asking for preserveDrawingBuffer, which forces
     * the browser to keep a second copy of every frame. Four samples of
     * multisampling because a pipe is a thin diagonal and the palette has
     * 256 entries to spend, so aliasing would be the first thing anybody
     * noticed.
     */
    target = new THREE.WebGLRenderTarget(size, size, {
      samples: 4,
      depthBuffer: true,
      stencilBuffer: false,
    });
    target.texture.colorSpace = THREE.SRGBColorSpace;

    stage = buildStage(THREE, doc, path, { size, camera });

    const raw = new Uint8Array(size * size * 4);
    const rgba = new Uint8Array(size * size * 4);
    const total = shots + Math.ceil(shots / PALETTE_STRIDE);
    let done = 0;

    const shoot = (i) => {
      stage.setFrame(i, shots);
      renderer.setRenderTarget(target);
      renderer.render(stage.scene, stage.camera);
      renderer.readRenderTargetPixels(target, 0, 0, size, size, raw);
      renderer.setRenderTarget(null);
      flipRows(raw, rgba, size);
    };

    /* Pass one: a sample of the animation, kept, to choose the palette. */
    const sample = [];
    for (let i = 0; i < shots; i += PALETTE_STRIDE) {
      shoot(i);
      sample.push(rgba.slice());
      done += 1;
      if (onProgress) { onProgress(done, total); }
      if (done % YIELD_EVERY === 0) {
        // eslint-disable-next-line no-await-in-loop
        await nextTick();
      }
    }

    const palette = buildPalette(sample, { colors: 256 });
    sample.length = 0;

    /* Pass two: every frame, straight into the encoder. */
    const gif = new GifEncoder({ width: size, height: size, palette, loop: 0 });
    for (let i = 0; i < shots; i += 1) {
      shoot(i);
      gif.addFrame(rgba, delayCs);
      done += 1;
      if (onProgress) { onProgress(done, total); }
      if (done % YIELD_EVERY === 0) {
        // eslint-disable-next-line no-await-in-loop
        await nextTick();
      }
    }
    return gif.finish();
  } finally {
    /* Whatever happened, the GL objects go back. A failed export that leaks
     * a context means the next attempt in the same page fails too. */
    if (stage) { stage.dispose(); }
    if (target) { target.dispose(); }
    if (renderer) {
      renderer.setRenderTarget(null);
      renderer.dispose();
      renderer.forceContextLoss();
    }
  }
}
