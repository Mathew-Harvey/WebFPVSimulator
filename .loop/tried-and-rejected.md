# Tried and rejected

## Configurator loop, round 2

**Showing ACTUAL `roll_rc_rate` / `roll_srate` as the CLI uint8 (7 / 67).**
Settings and Configurator 4.5.1 already speak deg/s (70 / 670). One click
with `stepFor` spanning 255 was 7 to 17, i.e. 70 to 170 deg/s. Display
ACTUAL rc_rate and srate as value times 10 with `deg/s`, step 10 deg/s
(one CLI unit). Expert P/I/D step is 1 so the keyboard can land 80.

**Leaving Presets, CLI, Setup, and Modes as live tabs with zero enabled
fields.** They looked like Configurator and saved nothing. Grey them with
a reason until those surfaces exist. Do not hide them.

**Exporting `rpm_filter_weights = a,b,c` without expanding it on load.**
A real Configurator wants that line. This sim's write table only has
`_1/_2/_3`. `composeConfig` now expands the array form so Export then
drop does not silently drop harmonic weights.

**Letting `pollPad` drive the title cursor onto Flight controller.** Title
and Settings keep the sticks for the airframe. That is existing shell
law, and blocked.md item 4. Keyboard opens FC from title (shots). A radio
opens it from pause. Do not steal the title pose.

**Inserting `simplified_tuning apply` after the last slider line.** A WASM
dump already contains expert P/I/D that apply wrote last init. Apply in
the middle leaves those expert lines below it, so moving a slider writes
the slider and changes nothing. Apply has to be last. Expert edits then
move below it.

**Stepping PID gains by 10 because the span is 250.** Configurator steps
one unit. `p_roll` 45 could not reach 80 from the keyboard. Always step 1.

## Configurator loop, round 1

**Writing patch 0002 with PowerShell `>`.** That produced UTF-16 LE + CRLF.
`git apply` said no valid patches. Rewrite patches with Node as UTF-8 LF.
After a failed apply, restore vendor with `git apply -R`, not
`git checkout -- vendor`.

**Hashing two `sim_init` calls on one WASM instance.** Function-statics
survive (`previousThrottle`, rc-smoothing `initialized`, feedforward
state). Any two inits hashed differently, so F4 LIVE tests were false
passes. Check 2 uses two `freshSim()` instances. fc-trace does the same.
Patch 0002 hoists rc/pid statics; leftover feedforward statics in
`calculateFeedforward` still mean same-instance Save is not bit-identical.
Do not treat a second init on one module as a power-on.

**Differing `gyro_lpf1_static_hz` while dyn LPF is on.** Default
`gyro_lpf1_dyn_min_hz = 250` means the static cutoff does not steer the
filter. The F4 pair turns dyn min off on both arms, then 250 vs 100.

**Leaving write-table keys LIVE because they parse.** QA review: 
`min_throttle`, `max_throttle`, `min_command`, `motor_poles`,
`crashflip_expo`, `crashflip_motor_percent`, `fpv_mix_degrees`,
`runaway_takeoff_prevention`, `gyro_filter_debug_axis` write PGs this
build compiles and nothing in the 1 ms loop reads them. That is the
`d_min_roll` class of lie. They are APPLIED_INERT. LIVE means the compiled
loop actually uses the field every millisecond.

**Trusting `sim_bf_key_status` as enablement.** Native 0 means "in
bf_settings.c", which includes GATED and APPLIED_INERT. The screen must
ask `catalog.js`.

**Moving `tests/thresholds.json` so map-isolation stays green after grass
blades stopped being drawn.** D7 forbids it. Restored to HEAD. map-isolation
is red against the committed snapshot, which the constitution already
names. Do not widen it in this loop.

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

## Low spec loop, round 4 (round 9 overall)

**Giving the ridge rings a light model as a luminance split.** Sun side and
shadow side at plus and minus 0.03 around each ring's rung. There is not
enough luminance range: between the fogged ground at 850 m and the sky
there is 0.353 for four layers, and a 0.06 wide band per ring puts the sun
side of one ring and the shadow side of the next within 0.035 of each
other, so a reviewer sampling those two patches measures a ladder that does
not climb. Replaced by equal luminance pairs that differ only in hue.

**Solving the ridge colours for the right luminances at the wrong hue.**
The first set used a sun side at hue 0.13, which is orange, and the whole
horizon rendered as sand dunes. Every number in the ledger was correct and
the world had become a desert. The numbers cannot tell you this and a frame
can, in one look.

## World, sound and track loop, round 10 (round 10 overall)

**Measuring P13 without waking the audio context.** The first version of the
ledger run reported `worstAudioMs` at 0.40 ms with `audio.ctx` still null.
`update()` returns on the first line when the context is null, so the number
was the cost of an early return, not the cost of scheduling. A headless run
supplies no user gesture, so the browser never starts audio and nothing in
the output says so. The run now clicks the page and asserts
`__audio.ctx.state === 'running'` before any capture. The number came out the
same, which is luck and not vindication: any instrument that can return a
plausible value for a subsystem that is switched off will eventually be
believed.

**Assuming the UTT diagram PDFs could not be read in this container.** The
previous loop recorded this as a likely blocker and the prompt for this loop
carried it forward. It is wrong. `WebFetch` cannot render a PDF, but `curl`
downloads one, and the layout page is a raster image sitting in the PDF's own
image XObjects behind a `FlateDecode` or `DCTDecode` filter. Twenty lines of
Node, reusing the PNG decoder already in `scripts/pixels.js`, extracts and
measures it. The whole of UTT 3 Bessel Run came out this way. Do not install
poppler or PIL or pdfminer to do this: none of the three works in this
container and the extraction does not need them.

**Trusting `String.fromCharCode.apply` over a whole channel.** The probe
transfers rendered samples from the page as base64 of the raw Float32 bytes.
Building that string a byte at a time over a 20 second stereo render is
7.7 MB of single character concatenation, and applying `fromCharCode` to the
whole buffer at once blows the argument limit. It is chunked at 8192 bytes
inside the page and at 1 MiB across the CDP boundary.

## World, sound and track loop, round 11 (round 11 overall)

**Sampling the collision sweep at fixed 0.1 m steps.** The obvious design, and
it needs a cap on the sample count or a stall turns into an unbounded loop.
Any cap is a tunnelling bug on any machine slower than the cap assumed, and
this container moves the craft fifteen metres between frames, so it would have
been wrong here before it was ever wrong on target hardware. Replaced by the
closed form segment to segment distance, which is exact, cheaper, and has no
parameter to get wrong. Verified with a 60 m single frame sweep through a tree.

**Hats on the offbeats only, with beat three of the bar empty.** Musically
defensible drum and bass, and it fails A5's tempo bar: the onset
autocorrelation locked onto the kick's own six and ten step intervals and
reported 117.61 BPM, two thirds of the real 174, with the true tempo only the
third strongest peak. A ghost kick on beat three plus hat accents on every beat
gave the autocorrelation a beat grid and moved 173.73 BPM to the top with r
fifteen times the shuffled null. A generated bed has to be measurable, and a
pattern whose strongest period is a dotted figure is not at the tempo it claims.

**A 9 ms timing wow.** Enough lofi character to hear, and it smeared onsets
over three and a half flux frames at 375 frames per second, broadening the
autocorrelation peak enough to hide the tempo underneath it. 5 ms still
breathes and still measures.

**Trusting the default mix level when testing headroom.** Every A3 figure
passed at the shell's default of 0.6 while a player on volume ten clipped at
+0.01 dBTP. With a saturating soft clip the render's true peak in dBTP equals
the master gain in dB, so the worst case the INTERFACE allows is the only one
worth measuring. A ceiling of 0.85 with 1.5 dB more on the stems holds both
ends.

**Assuming a regulation gate would just be a smaller gate.** It is a scale
change, and it broke three other things that had been tuned against the old
5 m gate: grass at 0.26 to 0.68 m became knee deep, the attract camera at 19 m
out aimed 2.5 m above a base whose aperture centre is now 0.762 m, and a
0.045 m lit bar became sub pixel at the distance a pilot first sees a gate.
Every ledger number stayed correct and the gates were invisible. Only the frame
said so.
