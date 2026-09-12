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

/*
 * THE CARD ANIMATION, written once because four callers have to agree on
 * it: the builder renders one the moment a room is published, the simulator
 * does the same through src/share/cardgif.js, scripts/boardgif.js renders
 * one for a room published before any of this existed, and
 * scripts/boardpresets.js renders one for each shipped track it places. The
 * board's own card grid is what all of them are for.
 *
 * 384 BY 240 is the card tile's 16 by 10. A square animation in that box
 * either letterboxes or loses the top of the track to a crop, and the tile
 * is 16 by 10 because the cards were that shape long before this existed.
 *
 * SIX CENTISECONDS A FRAME is about sixteen a second, which is as coarse as
 * a moving thumbnail can be without stepping. HOW MANY frames is not a
 * number here any more, and that is the one thing that changed: it was a
 * flat 60, three and a half seconds a lap whatever the lap, so a 41 m course
 * went round three times as fast as a 13 m one and a grid of cards had no
 * common pace to read. exportTrackGif asks the lap instead, at the one speed
 * LAP_SPEED holds, so a long course is a longer clip rather than a faster
 * one. The cap is what keeps that affordable: see LAP_FRAMES_MAX.
 *
 * A card stays small because of the delay and the frame size, which are the
 * two numbers still here. Measured at one pace on the two ends of what this
 * board carries: RaceGOW5 Track 1 is 14.4 m of lap, 64 frames and 148 kB,
 * and RaceGOW5 Track 8 is 43.9 m, 196 frames and 774 kB, against a board
 * that refuses anything over 1.8 MB. The longest clip the cap allows, 600
 * frames, is three times Track 8 and would still come in under it. What
 * costs is how much of the frame moves, so a busy track costs more than a
 * bare one, and dropping the nameplate let the track fill the frame.
 *
 * NO NAMEPLATE. The stage lays the track's name in the floor, because a GIF
 * pasted into a chat travels alone and has to say what it is of. A card does
 * not travel alone: the board prints the name as a heading directly under
 * the tile and puts the field size chip in the tile's bottom right corner,
 * where a long name came out reading "RaceGOW5 Tra". So the card gets the
 * track and the board gets to write the caption.
 */
export const CARD_GIF = {
  width: 384, height: 240, delayCs: 6, nameplate: false,
};

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
function flipRows(src, dst, width, height) {
  const stride = width * 4;
  for (let y = 0; y < height; y += 1) {
    const from = (height - 1 - y) * stride;
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
 *
 * size is the square edge and stays the default, because a file somebody
 * pastes into a group chat should be square. width and height override it
 * for the one caller that has a shape to fit: the public board's card grid
 * is 16 by 10, and a square animation in it either letterboxes or loses the
 * top of the track to a crop. Everything downstream of the two numbers is
 * the same code, so a 16 by 10 export and a square one differ only in how
 * much of the floor is in shot.
 */
export async function exportTrackGif(doc, {
  size = 512, width = size, height = size,
  frames = null, delayCs = 4, onProgress = null, camera = null, nameplate = true,
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
  canvas.width = width;
  canvas.height = height;

  let renderer = null;
  let target = null;
  let stage = null;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false });
    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);
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
    target = new THREE.WebGLRenderTarget(width, height, {
      samples: 4,
      depthBuffer: true,
      stencilBuffer: false,
    });
    target.texture.colorSpace = THREE.SRGBColorSpace;

    stage = buildStage(THREE, doc, path, {
      width, height, camera, nameplate,
    });

    const raw = new Uint8Array(width * height * 4);
    const rgba = new Uint8Array(width * height * 4);
    const total = shots + Math.ceil(shots / PALETTE_STRIDE);
    let done = 0;

    const shoot = (i) => {
      stage.setFrame(i, shots);
      renderer.setRenderTarget(target);
      renderer.render(stage.scene, stage.camera);
      renderer.readRenderTargetPixels(target, 0, 0, width, height, raw);
      renderer.setRenderTarget(null);
      flipRows(raw, rgba, width, height);
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
    const gif = new GifEncoder({ width, height, palette, loop: 0 });
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
