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
 * renders a sixteenth of the frames and counts their colours into a histogram
 * without keeping them, and the second pass renders all of them and feeds
 * each straight to the encoder. Peak memory is one frame and the histogram,
 * rather than the animation, and rather than the sample, which was 19 MB at
 * 512 and would be 300 MB and more at 2048.
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
import { buildStage, detailOf, lapFrames } from './stage.js';
import { PaletteHistogram, GifEncoder } from './gif.js';

/*
 * THE LIMITS OF A PICTURE, in pixels along an edge. scripts/trackgif.js reads
 * these two numbers rather than keeping a copy. The builder's size choice
 * (ANIMATION_SIZES in app.js) cannot, because the builder does not load this
 * file until somebody asks for an animation, so it keeps its edges inside
 * them by hand and a size that went over would be refused below with a
 * sentence.
 *
 * 2048 is the top because it is the biggest that is safe to ask of an ordinary
 * card, not the biggest one can draw. A frame is drawn into a four sample
 * target, four colour and four depth values for every pixel, which is about
 * 150 MB at 2048 and four times that at 4096, with two readback buffers and
 * the textures on top. It is also the size WebGL 2 promises every card can
 * hold as a texture and as a render buffer, and the four sample target needs
 * WebGL 2 already, so it is the largest a sentence can stand behind without
 * asking the card first. The card is asked anyway, below, because a promise
 * about size says nothing about how much memory is free.
 */
export const MIN_EDGE = 16;
export const MAX_EDGE = 2048;

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
 * the yielding is not itself the cost. A frame bigger than a standard one is a
 * tenth of a second or more, so five of them is a status line frozen long
 * enough to look hung, and those yield after every frame instead, which costs
 * a few milliseconds against a hundred. */
const YIELD_EVERY = 5;
const STANDARD_PIXELS = 512 * 512;

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
 * THE DOCUMENT'S LOGOS AS DECODED IMAGES, keyed by the logo's id, for a race
 * field to paint on the grass. Loaded here because the stage is built
 * synchronously and a data URL is not an image until the browser has decoded
 * it. A logo that will not decode is left out of the map, and the field
 * leaves its decals out: see fieldGroup in stage.js.
 */
function loadLogos(doc) {
  const list = (doc && doc.branding && doc.branding.logos) || [];
  return Promise.all(list.map((logo) => new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve([logo.id, image]);
    image.onerror = () => resolve([logo.id, null]);
    image.src = logo.image;
  }))).then((pairs) => new Map(pairs.filter(([, image]) => image)));
}

/*
 * THE WALL ART A WHOOP ROOM IS HUNG WITH, decoded: the sim's poster atlas, its table of where each piece is, and the
 * function that lays them on the walls. Imported and fetched here, only when a whoop track is being drawn in its room,
 * so a five inch export and a page that never exports pay for none of it. A failure costs the posters and nothing
 * else: the room goes up bare, as the sim's does, and says so on the console.
 */
async function loadRoomArt() {
  try {
    const [{ WALLART }, { wallArtGeometry }] = await Promise.all([
      import('../art/wallart-atlas.js'),
      import('../art/wallart-hang.js'),
    ]);
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('the atlas did not decode'));
      img.src = new URL(`../../${WALLART.url}?v=${WALLART.rev}`, import.meta.url).href;
    });
    return { table: WALLART, image, geometry: wallArtGeometry };
  } catch (e) {
    console.warn(`animate: the whoop room goes up without its posters: ${e && e.message}`);
    return null;
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
 *
 * A BIGGER PICTURE IS THE SAME PICTURE WITH MORE PIXELS IN IT. The builder
 * offers 512, 1024 and 2048 for a file that is going to be looked at closely
 * rather than pasted into a chat, up to MAX_EDGE. What that asks of the stage
 * is in stage.js (detailOf and REFERENCE_EDGE); what it asks of the machine is
 * time, which goes with the pixels, and memory, which is a frame and the
 * encoder's tables rather than anything that grows with the length of the lap.
 *
 * field, when true, sets the track on a race field with its sponsors' logos on
 * the grass in place of the black stage, and leaves the name off it. It is for a five inch track.
 *
 * room is for a whoop track, which is flown in a room: it is on by default and draws the room, with the sim's
 * posters on the walls and the course's ground logos on the mat, as a cutaway looked down into. room: false is the
 * black stage a whoop export used to be shot on. A five inch track has no room, so it does nothing there.
 *
 * signal is an AbortSignal. Aborting it stops the render at the next frame,
 * frees the card, and rejects with an error named AbortError, which a caller
 * that asked for the stop should treat as an answer and not as a failure. It
 * is there because a 2048 picture is minutes of work, and a dialog that
 * cannot be walked away from for minutes is a dialog people close the tab on.
 */
export async function exportTrackGif(doc, {
  size = 512, width = size, height = size,
  frames = null, delayCs = 4, onProgress = null, camera = null, nameplate = true,
  signal = null, field = false, room = true,
} = {}) {
  if (!Number.isInteger(width) || !Number.isInteger(height)
    || Math.min(width, height) < MIN_EDGE || Math.max(width, height) > MAX_EDGE) {
    throw new Error(
      `A picture can be from ${MIN_EDGE} to ${MAX_EDGE} pixels on a side, and ${width} by ${height} is outside that.`,
    );
  }
  /* Checked between frames, which is as often as there is anything to stop. */
  const stopIfAsked = () => {
    if (signal && signal.aborted) {
      const stopped = new Error('Stopped.');
      stopped.name = 'AbortError';
      throw stopped;
    }
  };
  stopIfAsked();
  const THREE = await import('three');
  const inRoom = room && !field && trackClassOf(doc) === 'micro';
  const logos = field || inRoom ? await loadLogos(doc) : null;
  const roomArt = inRoom ? await loadRoomArt() : null;
  stopIfAsked();

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
     * ASK THE CARD BEFORE ALLOCATING ANYTHING BIG. Every limit that bounds the
     * frame, because a card can be generous on one and stingy on another, and
     * an allocation past any of them does not throw: it leaves a target that
     * is not complete and a readback of zeros, which is minutes of work that
     * ends in a black file. Said as a sentence the dialog can show.
     */
    const gl = renderer.getContext();
    const drawable = Math.min(
      gl.getParameter(gl.MAX_TEXTURE_SIZE),
      gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
      ...gl.getParameter(gl.MAX_VIEWPORT_DIMS),
    );
    if (Math.max(width, height) > drawable) {
      throw new Error(
        `This graphics card can draw a picture up to ${drawable} pixels on a side, `
        + `and this one is ${Math.max(width, height)}. Choose a smaller size.`,
      );
    }

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

    /* The sizes of the textures and the shadow map, with this card's own
     * texture limit in them. Standard and smaller get what they always had. */
    stage = buildStage(THREE, doc, path, {
      width, height, camera,
      /* The race field has no name on it: the owner's ask, 2026-10-04. The
       * camera then frames the track alone, so it is bigger in the picture. */
      nameplate: nameplate && !field,
      detail: detailOf(width, height, renderer.capabilities.maxTextureSize),
      field, logos, room: inRoom, roomArt,
    });

    const raw = new Uint8Array(width * height * 4);
    const rgba = new Uint8Array(width * height * 4);
    const total = shots + Math.ceil(shots / PALETTE_STRIDE);
    const yieldEvery = width * height > STANDARD_PIXELS ? 1 : YIELD_EVERY;
    let done = 0;

    /* A frame with nothing in it at all, which is what a card that ran out of
     * memory hands back instead of an error. A real frame has a floor, so it
     * is never all zeros, alpha included, and the first word settles it. */
    const blank = () => {
      const words = new Uint32Array(rgba.buffer, rgba.byteOffset, rgba.length >> 2);
      for (let i = 0; i < words.length; i += 1) {
        if (words[i] !== 0) {
          return false;
        }
      }
      return true;
    };
    let first = true;

    const shoot = (i) => {
      stopIfAsked();
      stage.setFrame(i, shots);
      renderer.setRenderTarget(target);
      renderer.render(stage.scene, stage.camera);
      renderer.readRenderTargetPixels(target, 0, 0, width, height, raw);
      renderer.setRenderTarget(null);
      if (gl.isContextLost()) {
        throw new Error(
          'The browser took the graphics card away while it was drawing, which is nearly '
          + 'always memory. Choose a smaller size.',
        );
      }
      flipRows(raw, rgba, width, height);
      if (first) {
        first = false;
        if (blank()) {
          throw new Error(
            'The graphics card drew nothing at this size, which usually means it ran out '
            + 'of memory. Choose a smaller size.',
          );
        }
      }
    };

    /* Pass one: a sample of the animation, counted into the palette's
     * histogram and let go, to choose the palette. */
    const histogram = new PaletteHistogram();
    for (let i = 0; i < shots; i += PALETTE_STRIDE) {
      shoot(i);
      histogram.add(rgba);
      done += 1;
      if (onProgress) { onProgress(done, total); }
      if (done % yieldEvery === 0) {
        // eslint-disable-next-line no-await-in-loop
        await nextTick();
      }
    }

    const palette = histogram.palette({ colors: 256 });

    /* Pass two: every frame, straight into the encoder. */
    const gif = new GifEncoder({ width, height, palette, loop: 0 });
    for (let i = 0; i < shots; i += 1) {
      shoot(i);
      gif.addFrame(rgba, delayCs);
      done += 1;
      if (onProgress) { onProgress(done, total); }
      if (done % yieldEvery === 0) {
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
