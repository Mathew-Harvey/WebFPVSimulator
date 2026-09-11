# Exporting a looping animation of a built track

This is a plan, not a change. No source file moved. It is the implementation
spec for one feature: the track builder exports a looping animated GIF of a
track, in the style of the RaceGOW course animations, so a pilot can post the
track they built wherever the series is discussed.

Every claim about the codebase below was checked against the file it cites on
this branch on 11 September 2026. Where a number was measured, the section
says how.

## 1. What the animation is

The reference is `trackdemo.gif`, the RaceGOW 3 Track 8 animation, 1024 by
1024, 288 frames, 12 s, looping. Decoded and measured frame by frame:

- **The camera does not move.** The scaffolding's centroid wanders 3.7 px out
  of 256 across all 288 frames, which is the overlays occluding it, not
  motion. Static shot, static track.
- **Two things animate.** A glowing red ribbon segment travels the racing
  line through the course. A flat translucent green quad marks the gate
  being flown toward, jumping between gates and holding each for a run of
  frames. Fourteen discrete holds in the reference, several recurring, which
  is a course passing back through the same gates.
- **Everything else is fixed.** Grey PVC pipe-and-joint scaffolding: a
  moulded joint at every corner, a splayed four toe foot at every ground
  contact. A near black stage with one soft pool of light on the floor and a
  soft contact shadow. The track name lying in the ground plane in
  perspective, not billboarded.
- **The encoding.** One global 256 colour palette serves 287 of 288 frames.
  Disposal method 1 with 251 of 288 frames as partial rectangles. 73 percent
  of every frame is below luminance 40.

The lap closes on the first sequenced gate. That is a RaceGOW rule, not a
guess: the series is scored on consecutive laps that start and finish on one
designated gate (`src/trackbuilder/racegow.js`, header comment).

## 2. The budget, settled

The owner chose **512 by 512, under 4 MB**, so it posts anywhere.

Measured by re-encoding the reference at 512 with one global palette and
disposal 1:

| Variant | Size |
|---|---|
| 288 frames at 25 fps, no dither | **3.43 MB** |
| 144 frames at 12.5 fps, no dither | 2.16 MB |
| 288 frames at 25 fps, Floyd-Steinberg | 14.04 MB |

**No dithering, and this is a rule.** Dither noise changes every pixel every
frame and destroys the inter frame compression the format depends on: four
times the file, and it looked worse, stippling across the flat green and the
dark floor. Undithered, this flat shaded scene sits inside 256 colours at
39 dB PSNR against the source.

## 3. The decision the earlier plan got wrong, and why

The earlier plan ended on `buildFieldScene` in `src/render/scene.js` as the
renderer, because it already has the pipe-and-joint gates, a dark branch for
micro tracks, and `setNextGate()` driving a green target pane. All three are
true. It is still the wrong base, for reasons the plan did not check:

1. **The micro branch is a basement, not a stage.** `scene.js:163` `ROOM` is
   "the air of an unlit basement": pine board walls, an OSB ceiling with
   joists, a mat with a concrete border, two point lights, a skirting board.
   Built unconditionally at `scene.js:4266` when `trackClass === 'micro'`.
   There is no option to suppress any of it, and a three quarter view from
   above looks at the ceiling.
2. **The gates cannot be borrowed.** `scene.js` exports exactly four things,
   `makePitch`, `clubhouseSite`, `clubhousePad` and `buildFieldScene`.
   `cornerFittings` and every gate builder are module private, and structure
   groups carry no `name` or `userData`, so harvesting them out of a built
   world would be traversal by guesswork against a 5953 line file.
3. **It is heavy where it does not need to be.** Terrain, a post chain, and
   the world's colliders, rendered 300 times under SwiftShader in the
   headless harness, for a picture of a dozen pipes.
4. **The RaceGOW element set is tiny.** `racegow.js:213` `RACEGOW_ELEMENTS`
   is gates, side by side gates, double stacks, ladders, towers, dive gates,
   vertical poles and horizontal poles. Every one is a pipe frame or a single
   pipe. A pipe-and-joint builder for that set is small and exact, and it is
   literally what the pilot builds out of 3/4 inch PVC.

`view3d.js` is not the base either. It draws gates as boxes with square legs
(`view3d.js:880-938`, `:1029-1047`), no joints, no feet, no shadows.

**So: a bespoke stage.** One module turns a track document into a small
Three.js scene using only the builder's DOM free maths, which all runs in
Node today (`buildPath`, `apertureCorners`, `gateSupportFeet`,
`apertureFrame`, `apertureCenter`, `aperturesOf`, `elementById`). Nothing in
`scene.js` is touched or loaded. What the two abandoned bases still
contribute is the maths and the palette, not their scenes.

## 4. Where the data comes from, verified end to end

Run headlessly in Node against `tracks/json/micro-livingroom-1.json`, a real
whoop track in the builder's own schema (`schemaVersion: 3`):

- **The line.** `buildPath(doc)` (`src/trackbuilder/path.js:232`) returns
  `{knots, samples, segments, length, closed, tightest}`. Each sample is
  `{pos, s, radius, segment, t}` with `s` in metres from the start. Living
  room 1: 241 samples, 7.154 m, closed.
- **The gate schedule.** Each knot carries `role` (`aperture`, `marker`,
  `wrap`, `finish`), `seq` (the full sequence entry with `elementId` and
  `apertureIndex`) and `elementId`. Each segment carries `from` and `to` knot
  indices. So sample to segment to `segments[i].to` to knot to aperture is a
  direct index lookup. Walked at 288 frames it produced one hold per
  sequenced element, 37 to 81 frames each, the structure the reference has.
- **The green quad.** `apertureCorners(center, yaw, pitch, clearW, clearH)`
  (`src/trackbuilder/geometry.js:202`) returns four world space corners.
  Living room 1's gates come back exactly 0.711 m across, which is
  `GATE_OPENING_MAX` from `racegow.js`, so the geometry is self consistent
  with the spec the reference tracks are built to.
- **Coordinates.** The document is right handed, Z up. Three is Y up.
  `view3d.js:397` converts once with a root group at `rotation.x = -PI/2`
  and authors every mesh in document coordinates. The stage does the same,
  once, at the same place. Nowhere else.

## 5. Loop closure

`buildPath` closes the lap only when start pads exist (`path.js:177`,
`:289`). Without pads Living room 1 loses its whole return leg: 5 knots, not
6, 5.134 m instead of 7.154 m, and a 1.632 m gap between first and last knot.
An animation of that cannot loop.

**Change:** `buildKnots(doc, { closeLoop = false } = {})` and
`buildPath(doc, { closeLoop = false } = {})`. In both, `closeLoop` stands in
for the presence of pads in the closure test only, so the `finish` knot is
appended and `closed` reports true. Default behaviour is unchanged for every
existing caller (`trackdoc.js`, `view3d.js`, `selftest.js`). The implementer
must confirm `start` in `path.js` is only ever tested for truthiness (the
greps at lines 65, 177, 283 and 289 say so) before substituting.

**Flagged, not fixed:** by the RaceGOW rule a micro track without pads
currently gets a racing line short by its return leg and a `length` that is
not a lap, in the builder itself. That is the owner's call, since it changes
what every existing micro track without pads draws and warns about. It goes
in PROGRESS.md as an open question, not in this change.

## 6. Files

All new files carry the GPLv3 header. No dependency is added. No em dashes.

### `src/trackbuilder/gif.js`, the encoder

Pure. No DOM, no Three, no Node API. Runs in both. Precedent for hand
rolling an encoder with nothing behind it is `scripts/icons.js` (PNG on
`node:zlib` with a hand rolled CRC32) and `tracks/png.mjs`; a GIF needs its
own variable width LZW rather than deflate, so `zlib` does not help.

```js
export function buildPalette(rgbaFrames, { colors = 256 } = {})  // -> Uint8Array(768)
export class GifEncoder {
  constructor({ width, height, palette, loop = 0 })
  addFrame(rgba, delayCs)      // rgba: Uint8Array(width*height*4)
  finish()                     // -> Uint8Array, the .gif bytes
}
```

- **Palette.** Median cut over every pixel of the frames handed in. No
  dither, ever. Nearest entry lookup through a 32 by 32 by 32 cache
  (`Uint8Array(32768)`, filled lazily, index by the top five bits of each
  channel).
- **Frame diffing.** Keep the previous indexed frame. Bounding box of the
  pixels that changed; emit only that rectangle with disposal 1. The first
  frame is full. A frame identical to the previous one emits nothing and adds
  its delay to the previous frame's delay, since a 300 frame file where the
  ribbon pauses should not carry 300 image blocks.
- **LZW.** Minimum code size 8, clear 256, end 257, codes grow to 12 bits,
  emit clear when the table reaches 4096. Sub blocks of at most 255 bytes.
- **Container.** `GIF89a`, logical screen descriptor with the global colour
  table flag and 256 entries, `NETSCAPE2.0` application extension with loop
  count 0, per frame a graphic control extension (disposal 1, delay in
  centiseconds, no transparency) and an image descriptor, trailer `0x3B`.
  25 fps is exactly 4 cs; anything under 2 cs is clamped by browsers.
- **Streaming on purpose.** 300 RGBA frames at 512 by 512 is 300 MB. The
  encoder holds one previous indexed frame (256 KB) and the output so far.

### `scripts/gif-selftest.js`, with `npm run gif:selftest`

Matches `ghost:selftest` and friends: `passed`/`failed` counters,
`process.exitCode = failed ? 1 : 0` (`src/trackbuilder/selftest.js:2818`).
Encodes a synthetic animation and decodes it with a fifty line LZW decoder
written in the selftest, asserting: header and screen size, the loop block,
frame count, each delay, pixel exact round trip of every indexed frame after
disposal, that an identical frame coalesces into the previous delay, and that
a frame changing only a 10 by 10 patch emits a 10 by 10 rectangle. It does
not compare rendered pixels to anything: rendering is GPU and font dependent
and the GIF bytes are not required to match across machines.

### `src/trackbuilder/stage.js`, the scene

```js
export function buildStage(THREE, doc, path, opts)
// -> { scene, camera, setFrame(i, n), bbox, dispose() }
```

Authored in document coordinates under one root group rotated `-PI/2`
about X, exactly as `view3d.js:397`. Constants live at the top of the file,
named, with the reason beside each.

- **Stage.** Background `0x000000`. Floor: one large plane, `MeshLambert`,
  `receiveShadow`, with a canvas radial gradient texture for the light pool,
  `0x303030` at the centre to `0x000000` by 70 percent of the radius. No fog.
- **Light.** One `DirectionalLight`, `castShadow`, shadow camera fitted to the
  bounding box, map 1024 (2048 is fine on a GPU and slow under SwiftShader;
  one constant), `PCFSoftShadowMap`, from 40 degrees off the camera azimuth
  at 60 degrees elevation. One `HemisphereLight` fill, dim, so unlit pipe
  faces read as grey rather than black.
- **Pipes.** Tube outside diameter from track class exactly as
  `view3d.js:888`: `PIPE_OD` from `racegow.js` for micro, `FRAME_TUBE_OD`
  from `elements.js` otherwise. `MeshStandardMaterial`, grey, roughness
  0.6, `castShadow`. For each aperture element, per level from
  `aperturesOf(el)`: four cylinders along the edges of
  `apertureCorners(centre, yaw, pitch, clearW + tube, clearH + tube)`, which
  is the bar centreline rectangle `view3d.js:900-938` lays its boxes on. A
  sphere joint of radius 1.4 times the tube radius at every corner. One
  continuous vertical pipe per side from the ground to the topmost level's
  upper corner, standing where `gateSupportFeet()` puts the feet, since a PVC
  stack shares its verticals. Every ground contact gets a foot: a sphere plus
  four short stubs along plus and minus X and Y lying on the floor, which is
  the reference's four toe foot.
- **Poles and the rest.** `pole`: a cylinder from `dims.height` and
  `dims.poleRadius`, footed. `horizontalPole`: a cylinder of length
  `dims.width` along its yaw, mirroring `view3d.js`'s obstacle branch for
  its elevation. `startPads`: `dims.pads` flat dark squares of
  `dims.padSize` at `dims.spacing`. Full class extras degrade gracefully and
  are not pixel matched: `flag` a mast and a small triangle, `cone` a cone,
  `barrier` a thin box. `label` and `groundLogo` are skipped, as
  `trackdoc.js` skips them. Figures (`figures.js`) compose elements, so
  they need nothing.
- **The green pane.** For an aperture knot: a quad on
  `apertureCorners(apertureCenter(el, idx), el.yaw, el.pitch, clearW, clearH)`,
  `MeshBasicMaterial`, `0x7dffb4` (the simulator's `START_COLOUR` and the
  builder's entry pane, so the palette stays the simulator's), opacity 0.45,
  `DoubleSide`, `depthWrite: false`, nudged 0.02 m along the aperture normal
  toward the approach so it never z fights the bars. One pane, moved, not
  one per gate. Markers get no pane: the reference shows none on its pole.
- **The ribbon.** Two `TubeGeometry` meshes rebuilt each frame from a
  `CatmullRomCurve3` through the samples in the window, core and shell.
  Core: `MeshBasicMaterial 0xff6b5b`, radius `R`. Shell: `0xff3b2a`,
  radius `3R`, `AdditiveBlending`, opacity 0.22, `depthWrite: false`. The
  additive shell is the glow; there is no bloom pass. Taper by vertex
  colour, not radius: the shell's colour lerps from near black at the tail
  to full at the head, which on additive blending reads as a fade.
  `R = clamp(0.004 * r, 0.012, 0.12)` where `r` is the bounding radius, so a
  2.5 m whoop room and a 60 m field both read. Window length
  `TAIL = 0.30 * path.length`.
- **Ground text.** `doc.name` on a 1024 by 256 canvas, `600 132px system-ui,
  sans-serif`, in the palette's cream, on a plane lying on the floor in
  front of the track toward the camera, rotated to read from the camera.
  There is no 3D text anywhere in the repository, no `FontLoader`, no
  `TextGeometry`, and this does not add one. System fonts differ between
  machines, which is one reason GIF bytes are not required to match across
  machines.
- **Camera.** Static. Built after the text so the bounding box includes it.
  `bbox` from `Box3.setFromObject(root)` excluding the floor. Long axis of
  the track from the 2D covariance of element positions,
  `theta = 0.5 * atan2(2 * cov_xy, var_x - var_y)`. Azimuth `theta - 55
  degrees`, so the long axis runs lower left to upper right as in the
  reference. Elevation 40 degrees. Vertical FOV 30 degrees; a long lens is
  what makes the reference read as nearly orthographic. Aim at the box
  centre lowered to `min.y + 0.35 * height` so the text has room at the
  bottom. Distance `1.25 * boundingRadius / sin(FOV / 2)`. Six constants.
- **`setFrame(i, n)`.** `s = (i / n) * path.length`. Frames run 0 to n minus
  1 with no duplicated closing frame; the reference repeats frame 0 as frame
  287 and that is a 40 ms hitch. Head sample by binary search on `s`; window
  `[s - TAIL, s]` with wraparound through `s = 0`, which the closed path
  guarantees is the same point. Current gate: `knots[segments[head.segment].to]`;
  a `finish` knot maps to knot 0; a `wrap` knot looks ahead to the next knot
  that is not a wrap; a `marker` hides the pane. No `Date`, no
  `performance.now`, no `Math.random`: frame `i` is the only input.

### `src/trackbuilder/animate.js`, the orchestrator

```js
export async function exportTrackGif(doc, {
  size = 512, frames = 300, delayCs = 4, onProgress = null,
} = {})  // -> Uint8Array
```

- `await import('three')` lazily, the way `view3d.js:95` does, so the
  builder never pays for it until asked.
- Refuse, with a sentence the modal can show, when the sequence has fewer
  than two knots.
- `buildPath(doc, { closeLoop: true })`, then `buildStage`.
- An offscreen `document.createElement('canvas')`, `WebGLRenderer` with
  `setPixelRatio(1)`, and a `WebGLRenderTarget(size, size, { samples: 4,
  colorSpace: SRGBColorSpace })`. Read back with
  `renderer.readRenderTargetPixels`, which needs no
  `preserveDrawingBuffer`, and flip the rows, since WebGL reads bottom up.
- **Two passes, for memory.** Pass one renders every sixteenth frame and
  hands those to `buildPalette`. Pass two renders every frame and feeds
  `GifEncoder.addFrame` immediately. Peak memory is a few megabytes instead
  of 300.
- `onProgress(done, total)` after each frame; yield to the event loop every
  five frames so the modal can paint.
- Dispose the renderer, target and geometries on the way out, success or
  failure.

### `src/trackbuilder/animate.html`, for the headless harness only

The builder page's import map verbatim (`index.html:1231`, `three` pinned
to `0.160.0`), one module script that imports `animate.js` and sets
`window.__exportTrackGif = async (doc, opts) => base64(await exportTrackGif(doc, opts))`.
Nothing else. The builder itself never loads this page.

### `scripts/trackgif.js`, with `npm run gen:trackgif`

```
node scripts/trackgif.js <track.json> [--out <file.gif>] [--size 512] [--frames 300]
```

Follows the direct `openPage` scripts (`scripts/shell-check.js:1305`), not
`shots.js`, which only knows `Page.captureScreenshot` and would mean 300
PNG round trips. `openPage({ root, url: '/src/trackbuilder/animate.html' })`,
`until('!!window.__exportTrackGif')`, one `evaluate` returning the base64
(`evaluate` uses `returnByValue` and `awaitPromise`, `tests/lib/page.js:287`),
decode, write `<slug>.gif` using `exportFilename()`'s slug rule from
`storage.js` with the extension swapped. Print frames, bytes and seconds.
Warn above 4 MB and say `--frames 150` is the lever; never degrade
silently. Exit 1 on any page error. `--frames 24` is the smoke setting.

Two facts about the harness the implementer needs: Chromium runs on
SwiftShader (`--use-angle=swiftshader`), so 300 frames with shadows is
minutes, not seconds; and the CDN cache at `$SIM_CDN_CACHE` or
`/tmp/webfpv-cdn` is empty in a fresh container and fills itself through
Node's `fetch`, which does have the proxy (`page.js:132`).

### The builder button

- `storage.js`: add `downloadBlob(bytes, filename, type)` beside
  `downloadTrack`, same Blob, object URL, anchor, revoke pattern
  (`storage.js`, `downloadTrack`). `downloadTrack` may call it.
- `app.js:1552`: one more row in the More menu,
  `['Export animation', () => this.exportAnimation(), 'Write a looping .gif of the racing line', '']`,
  after Export.
- `exportAnimation()`: a small modal in the style of `openPublish`
  (`app.js:1040`): a `<p class="tb-help">` status line, one primary button
  that disables itself while running, `Frame 120 of 300` from `onProgress`,
  then `downloadBlob`, then the size in the status line. There is no
  progress bar anywhere in the builder and this does not add one.
- `package.json`: `"gif:selftest"` and `"gen:trackgif"`.

## 7. Not in scope, deliberately

No orbit or camera move. No quad in shot. No dither. No bloom pass. No Web
Worker. No `MediaRecorder` or WebM. No new dependency. No change to
`src/render/scene.js`. No change to the builder's own racing line or
warnings (section 5). No RaceGOW series branding in the text, only
`doc.name`, because the document does not know which series it is for.

## 8. Order of work, and what to verify at each step

1. `gif.js` and `gif-selftest.js`. Verify: `npm run gif:selftest`. Cheap.
2. `path.js` option. Verify: `npm run check:clip` still passes, since the
   default is unchanged, plus a Node probe that `buildPath(doc, { closeLoop:
   true })` on Living room 1 without its pads returns 6 knots and a
   0.0000 m gap.
3. `stage.js`, `animate.js`, `animate.html`, `scripts/trackgif.js`. Verify
   at the **shots** scale: `node scripts/trackgif.js
   tracks/json/micro-livingroom-1.json --frames 24` for the smoke, then the
   full 300. Split the result into a contact sheet and look at it. What
   counts as wrong: the green pane on a gate the ribbon is not heading to, a
   ribbon that jumps at the seam, text unreadable from the camera, a hole in
   the floor gradient, more than 4 MB.
4. The button. Verify: **fly it**. Open the builder, export Living room 1,
   open the file. Then a full class track from `tracks/json/` to see the
   graceful degradation.

`npm run verify` is not run for any of this. It says nothing here: no
physics, no plant, no module ABI and no build is touched. Say so in the
PROGRESS.md entry rather than implying otherwise.

## 9. What goes in PROGRESS.md

The entry for the change, in the file's own voice: what was built, what was
measured, which checks were run and which were not and why, the size of the
Living room 1 export, and the open question from section 5 about closing the
lap for every micro track.
