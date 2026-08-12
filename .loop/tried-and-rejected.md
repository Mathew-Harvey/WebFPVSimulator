# Tried and rejected

Approaches that were attempted and abandoned, with the reason, so a later
round does not spend itself rediscovering them. Earlier entries from the
first loop are in .loop/state.json under tried_and_rejected and in
PROGRESS.md; this file is the polish loop's own list.

## Round 3

**Pushing the gate ring's colour above 1.0 so the bloom high pass catches
it.** The renderer runs with THREE.NoToneMapping, so any channel over 1.0
clamps at the output pass. Mint 0x7dffb4 scaled by 2.4 clamps to white and
the ring loses the hue that tells the pilot which gate is next. Rejected in
favour of an additive glow annulus plus a lower bloom threshold.

**Switching the renderer to ACES or Reinhard tone mapping so values over
1.0 roll off instead of clipping.** That would let emissive geometry carry
real highlights, but it changes every colour in the game at once and the
grade pass in post.js was authored against no tone mapping. Too large a
change to make as a side effect of one gate glow. Worth doing deliberately,
with its own round and its own review.

**Making the sky bluer to separate it from the ground's value band.** Blue
carries 7 percent of luminance in Rec. 709, so saturating the sky moves its
value almost not at all: measured, the ground and sky were 0.257 and 0.248
and a deeper blue would have kept them within a hundredth. Only a paler
zenith moves the number.

**Letting the flag poles cast shadows.** 72 poles in the shadow map cost 72
draw calls for a shadow a few centimetres wide. Only the cloths cast, and
the poles were merged into one static mesh instead, which paid for the
cloths.

**Rim light on the flag cloth.** The rim term is one minus dot(normal,
view), so a flat plane is edge on across its entire surface at almost any
viewing angle, and the cool rim colour covered the whole flag rather than
its edge. A dark red cloth measured rgb 151 93 113. Rim is off for flat
cloth; the same trap is waiting for any other plane that uses celMaterial
with a rim.

## Round 2

**Wiring menu row hover to mouseenter.** The menu is rebuilt on every
cursor change, and Chromium fires enter when a fresh element appears under
a stationary pointer, so the cursor snapped to wherever the mouse happened
to rest and the arrow keys looked broken. mousemove does not fire without
actual motion, so it is the correct event here.

**Treating any pressed gamepad button as select.** A radio in joystick mode
reports its switches as buttons and a latched arming switch reads as
pressed forever, so the first menu item fired before the player saw the
title. Buttons 0, 2 and 3 select, button 1 goes back, and nothing counts
until the pad has been seen with all of them released.

**Suppressing the flight banner on the shell's mode.** The banner is a
flight message and the screens are what own the frame, so a launch prompt
printed across the results table. It is suppressed on whether a screen is
up, not on the mode.

## Round 1

**Trusting a fixed wait after a keypress in the capture harness.** On this
container's software rasteriser a frame takes about 120 ms, so tap:Enter
followed by wait:400 can capture the state the player was in before the
key. Two of the seven round 1 screenshots were mislabelled this way and two
independent reviewers caught it. Captures now assert the state they claim
with until: and expect:.

**An attract camera 13 m out and 4 m up.** Two thirds of the frame was near
grass. The title needs the valley, so 19 m out and 7 m up, looking at the
ring.

**A radial scrim at up to 0.93 alpha behind the interface.** It turned a
warm afternoon valley into night behind every screen.

## Harness note, round 3

A reviewer subagent edited `src/main.js` while it was reviewing it, adding
`window.__dbg = { view, post, THREE }` so it could walk the scene graph and
count draw calls per object. Reverted: a reviewer must not change the code
under review, or the verdict no longer refers to the artefacts it was given.
If a future round wants that handle, it should be added deliberately,
committed, and the review re-run against it. Worth knowing that reviewers
have write access to the tree, so `git status` after a review round is part
of the round.

## Low spec loop, round 2 (round 7 overall)

**Antialiasing by blending two colour taps ACROSS the silhouette, along
the depth gradient.** The reasoning was that mixing the two sides of an
edge softens the step. It does, and softening a step is not removing a
staircase: measured with `scripts/pixels.js stair:`, the sub pixel crossing
of a near vertical edge held still for three rows and then jumped 1.87 px,
against 4x multisampling's 1.17 px, and the second difference RMS went from
0.289 to 0.478. It also softened the whole frame for nothing. Replaced in
round 8 by two taps ALONG the edge, `vec2(-dir.y, dir.x)`, which measures
0.288 and 0.83 px. A staircase is a discontinuity along the edge, so that
is where it has to be filtered.

**Trusting the render target walker's own total.** It deduplicated on
`rt.uuid` and `WebGLRenderTarget` has no `uuid`, so it reported one target
where there were fifteen. Then, once that was fixed, it still missed the
default framebuffer, 16.6 MB, because the canvas is bound by passing `null`
and the walker only recorded non null binds. Any instrument that collects
by watching an API has to be asked what the API does when the answer is
"nothing": that is where the largest single object in the ledger was
hiding.

**Reporting mebibytes under a megabyte heading.** 4.9 percent lenient at
this scale, which is the difference between passing and failing a 120 MB
ceiling at 115 MB. Both units are printed now.
