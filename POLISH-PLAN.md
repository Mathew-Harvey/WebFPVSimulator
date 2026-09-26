# Polish: what to attend to, ranked

The owner asked on 2026-09-26 for "a list of the best things to attend to to
increase the polish". This is that list: one survey of main at 716562b, as a
pilot of ten years and as an anime art director, flown and photographed in
headless Chromium. The picture names below (for example `t-03-fly-00.png`)
were taken into that session's scratchpad and are not in the repository; they
say what was looked at, and the file and line references say where.

Items marked PHYSICS need the owner's approval under CLAUDE.md before work
starts. The cars were being rebuilt separately at the time (an R32 drift car
and every car upgraded) and are not planned here.

Survey for the owner, 2026-09-26, of origin/main at **716562b** ("PROGRESS: the lettering's last commit merged and rechecked"), held there in a detached read only worktree while the car rebuild moves main. Nothing in the repository was changed or committed.

**How it was looked at.** The real shell in headless Chromium through `tests/lib/page.js` (a rig in the style of `scripts/shots.js`, plus one plain `node scripts/shots.js` run), with `window.__ui`, `__counter`, `__chase`, `__vehicles`, `__lettering` and `__budget`. Covered: the gate, the title and every menu room at 1600x900; Flags and cones and 2022 AU Nationals (board documents, read through a local proxy of webfpv.org/board that refused every write) flown on the racing line; RaceGOW5 Track 1 in the whoop room; the town from the pads up the street and over the roofs; Hibari Yard's container tunnel line, a chase of the box truck, a Scored run to its results page, and the yard at dusk and overcast; the builder on both canvases, a road selected, the 3D preview and Play; phones at 844x390 and 390x844 with touch. Flights were flown by `scripts/lib/pilot.js` with its clock moved onto the shell's clamped frame clock; its crashes are the tracker's and none is counted as a finding. SwiftShader gives no real frame rate, so no item rests on one.

**Pictures:** `/tmp/claude-0/-home-user-WebFPVSimulator/6ddfd91b-7f5b-543b-a441-691d12014517/scratchpad/polish/shots/`. Board data read this session: `.../scratchpad/polish/board/`.

**Cars, in one line, not planned here** (another agent is rebuilding them): at chase distance they read as boxes (`y-02-line-04.png`, `y-04-chase-03.png`); the physics body is one box from road to roof; the drift car's yaw rate still steps 0.62 rad/s in the chicane, which is the module's speed profile and so a physics change.

Sizes: S is under half a day, M a day or two, L a week or more. **PHYSICS** marks anything that needs the owner's approval under CLAUDE.md; everything else is shell, render or UI.

---

## Quick wins a pilot sees in the first minute

### 1. Every gate is announced as "Split-S, level 1"
- **What.** The race OSD line reads "GATE n OF N, SPLIT-S, LEVEL 1" on plain gates, flags and cones. Built through `courseFromDocument` in Node: Flags and cones 12 of 12 stations carry that cue, 2022 AU Nationals 30 of 32, RaceGOW5 Track 1 6 of 6. Cause: `src/trackbuilder/figures.js:259` tries `splitS` before `single`; on a one opening element the Split-S plan is a single pass, so it matches first, and `figureCueOf` (line 303) only blanks the cue for `single`.
- **Evidence.** `r-05-on-pads.png`, `sp-02.png`, `wh-t1-pads.png`.
- **Why.** It is an instruction read at every gate of every lap, and on a flat course it names a manoeuvre that is not there. A racer reads that as the sim not knowing its own track.
- **Fix.** `figureCueOf` returns '' when the element has fewer than two openings (or try `single` first); a selftest line that a lone gate has no cue.
- **Size** S. No physics.

### 2. The first flight's Weight card sits over the bottom centre until clicked
- **What.** "WEIGHT, Drag this if the quad feels floaty..." appears on the first flight and stays over the lower middle of the picture until Got it or the slider is clicked or touched (`src/ui/ui.js:12090`; `dismissAirHint` is reached only from the two pointer handlers at 12015 and 12048). It is only remembered on dismissal, so it returns every session until clicked. It also shows through the pause menu.
- **Evidence.** `t-03-fly-00.png` to `-06`, `y-02-line-02.png` to `-06`, `sp-02.png`, `wh-02.png`, `phL-05-flight-air.png` (on a phone it covers the centre), `r-08-pause.png` (faint behind the pause rows).
- **Why.** A pilot on a radio has no pointer in hand; the card covers the ground ahead for the whole first session.
- **Fix.** Retire it on the first landing or crash, after about 8 s airborne, or on any radio or gamepad input; never draw it under a modal.
- **Size** S. No physics.

### 3. "Air" counts while the quad sits on the pads
- **What.** With scoring at its default the freestyle clock slot is Air, and it is sim time since the run began (`src/main.js:7352`, `airtimeMs = simTimeMs`; label at `ui.js:11242`). On the pads it already reads 0.93 to 3.72 s at 0 km/h and 0.0 m.
- **Evidence.** `shotsjs/yard-pads.png` (0.93), `t-02-pads.png` (3.72), `y-01-pads.png`.
- **Why.** Every pilot reads "air" as airtime. It is the one number in the middle of the screen.
- **Fix.** Start at takeoff and hold while landed (Betaflight's OSD keeps on time and fly time apart for this reason), or call the slot Time.
- **Size** S. Display only, no physics.

### 4. HUD small print disappears over bright scenes
- **What.** OSD labels and sub lines (SCORE, AIR, PACK, "12.3 m above the ground", ACRO, THROTTLE, the stick captions) are 11 to 13 px slate `#9db3c8` with a soft blurred shadow (`index.html:173-190`). Over the yard's concrete, the town's sky and the overcast palette they vanish.
- **Evidence.** `shotsjs/yard-pads.png`, `over-01-view-0.png` (altitude, mode and throttle lines gone), `y-02-line-06.png` (SCORE), `t-03-fly-03.png`.
- **Why.** Pack and height are the glance a pilot makes every few seconds, and the art direction is ink while the HUD is the one thing not inked.
- **Fix.** A hard 1 to 2 px ink outline on all OSD text (paint-order stroke or four offset shadows in the ink colour, as the lettering does), and one step lighter labels.
- **Size** S. No physics.

### 5. The public board shows impossible records
- **What.** Flags and cones' record is 0.20 s (Oliver, 2026-08-27) on a 120 m lap, 600 m/s, and the Race room card prints "record 0.20". Orbit (Anticlockwise) holds 10 ms and 15 ms laps (AsylumFPV, 2026-08-31): its two stations are flags at the same point, (30, 24), turned 90 degrees apart, so a craft beside the pole crosses both pass lines in two steps.
- **Evidence.** `board/tracks.json`, `board/orbit.json`, `board/flags.json` (the live API, read this session); the Tracks room card in `dusk-00-title.png`.
- **Why.** The first record a racer sees cannot be beaten, and that discredits every time next to it.
- **Fix.** The board refuses a lap under the course's path length over a generous top speed (50 m/s) and flags the ones it holds; the builder warns on two stations at one point and `src/game/race.js` asks for some distance flown between stations. Purging is the owner's call.
- **Size** S for the board floor (the board's own repository), M for the station rule. No physics.

### 6. Values cut off with ellipses across the menus
- **What.** "30 d..." (Camera angle, Quad), "Actual, 670 roll and pitc..." (Quad, Settings, pause), "Your best ..." (Ghost, on the launch card and pause), "Hypnotic Acid L..." (music chip). On pause the Settings row repeats the rates string the Rates row above it already shows.
- **Evidence.** `d-02-quad.png`, `d-02-pilot.png`, `r-08-pause.png`, `wh-t0-launch.png`, `phL-06-pause.png`.
- **Why.** Cut text reads as unfinished, and camera angle is a number a pilot wants to read.
- **Fix.** Short values ("30°", "Actual 670/670", "Your best lap"), room for the spinner, and a Settings summary that is not the rates.
- **Size** S. No physics.

### 7. Builder top bar controls hide under each other on the race canvas
- **What.** On the race canvas the view group (Undo, Redo, 2D, 3D, Fit, Show line, Labels, Sponsor logos) overlaps the file and publish groups. At 1440 and 1600 wide, 2D, Labels, Sponsor logos, Undo and Redo are covered (DOM rects at 1600: Undo 705 under More at 813; Labels 1067 to 1140 under "Not on the board" at 1092; Sponsor logos under Publish). At 1920 More still covers Undo and Sponsor logos is cut.
- **Evidence.** `b-race-1600.png`, `b-00-open.png` (1440), `crop-tb1920.png`.
- **Why.** On a common laptop the author loses the 2D button and the labels switch with no sign they exist.
- **Fix.** Let the bar wrap, or fold the view group into a menu below a width; check the race canvas at 1440 in a layout check.
- **Size** S. No physics.

### 8. The results menu covers the run's own rows
- **What.** At 1280x720 a run with three or more trick rows loses its third row and the best line ("Your best on this map in this browser: 15,100.") under the Fly again row; the kicker sits tight under the RUN COMPLETE crumb.
- **Evidence.** `sc-04-results-fixture.png` (the lettering's fixture), `sc-03-results.png` (a real run).
- **Why.** The results are the reward, and the best line is the sentence the pilot was waiting for.
- **Fix.** Cap the rows (top three and "N more") or let the copy column scroll above the menu; add 1280x720 to the devices check for this screen.
- **Size** S. No physics.

### 9. The title column is crowded and its menu is clipped
- **What.** Above the menu the title stacks the strapline, the BETA sentence, Patreon, the lap chip, a three line "Tracks you build stay in this browser" note (also shown with a freestyle map seated, where it says track) and "Simulating FPV, for nerds". The menu then loses its last row: `lint:shell` has failed on main with "title: overflow grew from 0 to 67 px" through every entry since before Stage E.
- **Evidence.** `r-01-title-menu.png` (Credits cut, a scroll sliver through the chevrons), `dusk-00-title.png`, `phP-01-title.png`.
- **Why.** The first screen after the gate is heavy and clipped, and a check left red teaches everyone to read past red.
- **Fix.** Move the keep note to the Race room and the builder, make BETA a chip; the 67 px goes with it and `lint:shell` is green again.
- **Size** S. No physics.

### 10. A crash set down can put the craft in the traffic
- **What.** `setDownNearby` (`src/main.js:3622`) looks for flat ground near the crash and knows nothing of roads, so a crash beside the yard loop sets the craft on a lane; a landed craft is not stepped, and the cars drive through it. Recorded in the Stage E entry ("the camera under the box truck's chassis") and still true at 716562b.
- **Evidence.** PROGRESS 2026-09-26, Stage E sim entry, "For the owner, when flying"; the code.
- **Why.** After a crash the pilot is looking at the underside of a lorry.
- **Fix.** `findRestSpot` rejects points within a lane's half width plus half a car of any road centre line (`road.js` `nearestOn`) and takes the nearest verge.
- **Size** S. Shell only: no change to the physics model, ABI or build.

### 11. One lens: the barrel distortion is on the race field only
- **What.** The race field's grade applies mild barrel distortion (`src/render/post.js:262`, `uDistort` 0.055). The town and built maps use the vendored `Pipeline` (`src/maps/city/index.js:48`, `src/maps/built/index.js:74`), which has none, so the camera changes character between a race and freestyle.
- **Evidence.** The code; compare `sp-00.png` with `t-03-fly-03.png`.
- **Why.** The lens is half of what reads as FPV, and a pilot switching maps feels it change.
- **Fix.** Put the same uv remap in the vendored grade. Then decide whether a true equidistant fisheye becomes a setting (`src/render/lens.js` already argues the numbers).
- **Size** S to match, M for a fisheye setting. Render only.

### 12. Flight chrome stays in the goggles
- **What.** In flight the music chip (top left), Report bug and Pause (top right) and the Weight slider with Floaty and Sinky (bottom centre, shown to radio pilots too, `src/main.js:8056`) are always up.
- **Evidence.** Every flight picture, e.g. `t-03-fly-06.png`, `sp-00.png`, `shotsjs/yard-pads.png`.
- **Why.** A real feed carries the OSD and nothing else, and the slider sits over the ground ahead.
- **Fix.** Fade the chips after three seconds of flight, back on pointer movement or pause; the slider in flight on first flights only, otherwise on the pause screen. Where the slider lives is the owner's call; matter of taste in degree.
- **Size** S. No physics.

### 13. Builder: named gap labels collide, and the 3D labels bury the map
- **What.** In 2D, CONTAINER TUNNEL 500 and BILLBOARD GAP 250 print over each other; in 3D the gap labels are metre high amber banners over the containers and footbridge they name. The freestyle canvas has no Labels switch; the race canvas does.
- **Evidence.** `bm-04-road-selected.png`, `bm-06-map-3d.png`, `bm-07-map-3d-play.png`.
- **Why.** The preview is sold as the game; the labels make it a diagram.
- **Fix.** Screen space label size with a cap and a distance fade, offset colliding labels in both views, and the Labels switch on maps.
- **Size** S. No physics.

## Flight, fairness and the phone

### 14. On a phone held sideways the OSD stacks over the middle of the picture
- **What.** With the thumb sticks up, `index.html:1254-1272` stacks pack, speed, height, throttle and the Weight slider in one centre column up to about 270 px of a 390 px screen, and the launch banner lands on the lap clock.
- **Evidence.** `phL-04-flight-pads.png` (volts and km/h over the start gate), `phL-05-flight-air.png`.
- **Why.** The centre is where the gate is, and on a phone it is all the picture there is.
- **Fix.** Phone OSD in the two top corners, one line each (the chips there move to pause); no Weight slider in flight on touch; the banner below the clock.
- **Size** M. No physics.

### 15. The geometry buys too much multiplier (prices are the owner's)
- **What.** Every close call worth anything buys a point of multiplier, low passes included (`src/game/score.js`, the geometry path into the combo). One straight line through the container tunnel at 10 m/s with no trick banked **15,273 at x9**: low pass 22, low pass 20, thread 339, CONTAINER TUNNEL 500, under 227, roof skim 185, thread 224, low pass 24, under 156. The same run's two tricks paid 75 and 50. The tier badge reaches PERFECT in the first ten seconds of the first line.
- **Evidence.** The Scored run (`sc-02-line-*.png`, `sc-03-results.png`, and `window.__counter()` logged beside them); `y-02-line-06.png` (1,584 x 6 PERFECT).
- **Why.** A skate game lives on the multiplier being earned. When hugging the ground buys multiplier, the optimal line is a low pass and the top tier means nothing.
- **Fix.** Low passes pay points and buy no multiplier; each kind buys multiplier once per combo; a tier table for the counter separate from the trick one.
- **Size** M. No physics.

### 16. The crash verdict still depends on the frame rate
- **What.** Two findings of 2026-09-25 hold at 716562b. At the edge of the belly cone the wall tap verdict reads the attitude at the frame's end: 7 of 7 phases reset at 144 Hz, 8 of 33 at 30 Hz. And the ground judgement is gated on wall time (`src/main.js:6986`, `nowWall - groundBounceAtWall > BOUNCE_COOLDOWN_MS`; also 7223 and 7234).
- **Evidence.** PROGRESS 2026-09-25, "A belly first wall tap is not a crash", Found on the way items 2 and 4; the code.
- **Why.** CLAUDE.md: a dropped frame must change nothing. A pilot on a 60 Hz laptop and one on a 144 Hz monitor get different crashes from the same tap.
- **Fix.** Judge each physics step at its own attitude from the per step world report, and put the cooldowns on `simTimeMs`. The entry found no ABI change is needed.
- **Size** M. **PHYSICS PATH:** no ABI or build change, but it changes the core's crash outcomes. Put it to the owner, and land `check:crash` coverage of the edge case first (the coverage rule).

### 17. The Freestyle room never pictures the world you are flying
- **What.** Map thumbnails are painted only on the `courses` screen (`src/main.js:7804`), so the loaded world's card in the Freestyle room records twelve seconds of grey and caches it in IndexedDB. Found and not fixed on 2026-09-26; still true.
- **Evidence.** `gf-02-room-later.png` (Your map still "loading" after 15 s), `d-02-freestyle.png`, `phL-02-freestyle-room.png`.
- **Why.** The pilot's own map is the card that looks broken.
- **Fix.** Render the loaded world under the room while a clip records, or film it through the orbit frame like the rest, and raise `CLIP_VERSION` to drop the cached grey clips.
- **Size** M. No physics; a render path and memory choice for the owner.

## Look and consistency

### 18. Speed lines are CSS stripes, and the rest of Stage F is not built
- **What.** The only speed lines are two strips of vertical cream stripes down the edges, switched on by the combo tier and not by speed (`index.html:526-541`). Screentone and the impact frame do not exist, though the Clean FPV note promises them.
- **Evidence.** `y-03-after-line.png`, `y-02-line-06.png` (stripes on both edges at a hover).
- **Why.** At a hover after a combo they look like a rendering fault, and at 25 m/s with no combo there are none.
- **Fix.** Stage F as planned: radial ink strokes in the grade pass above about 20 m/s converging on the velocity vector, outer third only; drop the CSS strips. Then screentone in the darkest band at High, judged in flight, and the impact frame on its own switch.
- **Size** M. Render only.

### 19. Menus, wordmark and HUD numbers are not in the manga hand
- **What.** The lettering (`src/ui/lettering.js`) lives in freestyle callouts and the results page only. The WEBFPV wordmark, room titles, rows and OSD numerals are the system sans. The combo tier kana (いいね, すごい, やばい, 最高) are font glyphs, which a machine without a Japanese font draws as boxes, though the sound effects were drawn as strokes to avoid exactly that. The results panels draw the quad as four circles and a box.
- **Evidence.** `d-01-title.png`, `d-02-quad.png`, `y-02-line-04.png`, `sc-04-results-fixture.png`.
- **Why.** The manga layer reads as an overlay on a developer UI rather than the game's own voice.
- **Fix.** Letter the wordmark and room titles with `paintCall`, give menu panels an ink frame, draw the tier kana with the stroke kana, and ink the quad in the panels. How far is a matter of taste.
- **Size** M. No physics.

### 20. The race field does not look like the rest of the game
- **What.** The race field, which is behind the gate, the Five inch card and every race, is flat green turf, blobby trees and a pale sky. The town and the yard have the toon ramps, violet shadow bands, depth ink and anime sky. FREESTYLE-MAPS-PLAN section 1 says so, and nothing since has changed it. Race tracks also have no time of day.
- **Evidence.** `d-01-title.png`, `r-05-on-pads.png` against `t-02-pads.png` and `dusk-01-view-2.png`.
- **Why.** The first screen and every race are in the weaker style; an art director sees two games.
- **Fix.** Build the race field from the town's kit (`toon.js` ramps, `core/post.js` ink and grade, `sky.js`) and give race documents the `scene` block maps have. Measure on Low first. Taste as to how far.
- **Size** L. Render only; the field's solids must not move (the world golden would see it).

### 21. The town is still over its draw call and attribute budgets
- **What.** Measured this session with `window.__budget` at the spawn, High, 1600x900: the town 519 draw calls against the 400 ceiling, 1.14 M triangles against 1.2 M, 63.2 MB of vertex attributes against 48 MB. Hibari Yard: 346 calls, 0.09 M triangles, 6.9 MB. Down from 2049 calls in CITY-PERF-PLAN.md, whose steps 2 to 7 are not marked done.
- **Evidence.** The budget run in the scratchpad; CITY-PERF-PLAN.md.
- **Why.** The town is the showpiece and the place a pilot on a mid laptop feels a stutter first.
- **Fix.** CITY-PERF-PLAN steps 2 (atlas), 3 (spatial chunks and fog), 5 (instance rig furniture) and 6 (drop unused attributes).
- **Size** L. Render only, except step 4, which removes solids and so changes the world the plant flies and the world golden: **PHYSICS** approval for that step.

### 22. Overcast and faceted canopies (taste)
- **What.** Overcast is a flat lavender with clouds drawn as dark smudges; the vendored kit's tree and sakura canopies are detail 0 icosahedra whose facets show as a mosaic.
- **Evidence.** `over-01-view-2.png`, `over-00-title.png`; `y-04-chase-06.png`, `t-02-pads.png`.
- **Why.** Both read as low poly more than anime.
- **Fix.** Overcast clouds a step lighter with an ink edge and a touch more ramp contrast; canopy normals from the clump's sphere, as the kit already does for its planet (`planet.js:557`), so the ramp gives two or three clean bands.
- **Size** S and M. Render only. Taste.

## Lower on the list

### 23. The chase camera is frozen in a real time replay
- **What.** `src/main.js:7669` takes the chase spring's dt from `frameSteps`, which is 0 in a replay, so `?replay=` with `cam=chase` never moves. Found and not changed on 2026-09-26; still true.
- **Fix.** dt from the frame's own dt or the replay clock; which clock is the owner's call.
- **Size** S. No physics.

### 24. The radio "parked" help row is sometimes five times late (unconfirmed)
- **What.** `lint:input`'s "parked and left, the row arrives by itself, and not before four seconds" failed at 20.5 s in several runs on main and passed in others (three PROGRESS entries of 2026-09-26). If it is the shell and not the harness, a pilot with a radio in the wrong mode waits 20 s for the help.
- **Fix.** Find whether it is the harness or the shell's timer before anything else.
- **Size** M. Input path, no physics.

---

## Open decisions only the owner can make

1. Scoring prices, and whether a low pass buys multiplier (item 15).
2. Whether a set down crash under 18 m/s bails the trick score the board is sent (one line in `counterCrash`; it changes what the town's board means).
3. A floor for implausible laps on the board, and whether to purge the 0.20 s and 0.010 s records (item 5).
4. Where a crash on a road sets the craft down: the nearest verge, or the start (item 10).
5. The Weight slider: in flight for everyone, first flights only, or pause only (items 2, 12).
6. **PHYSICS PATH:** judge crashes per physics step, which removes the frame rate dependence and changes crash outcomes (item 16).
7. Restyle the race field in the town's kit, and give race tracks a time of day (item 20).
8. The same barrel distortion in freestyle as on the race field, and a true fisheye as a setting (item 11).
9. The Freestyle room's loaded map card: render under the room, or a second copy through the orbit frame (item 17).
10. Which clock the replay chase camera follows (item 23).
11. **PHYSICS:** is 1.62 g on the five inch, and 2.025 g on the whoop that flies the five inch plant, the end state for "indistinguishable from a real quad", or a stand in until the plant's thrust and drag are refitted?
12. Trick names stay behind the Scoring switch; and `score:selftest`'s "the same lap without the flip is a Maverick Loop", red on main through every recent entry (and again this session): fix it, or argue a new expectation in PROGRESS.
13. Whether a skim over a container's floor is a "Roof skim".

## Run log for this survey

- `git fetch origin main`, detached at 716562b; resumed after the stop on a fresh detached worktree at 716562b.
- `npm run score:selftest`: 1 FAILED, the known Maverick Loop line.
- `node scripts/shots.js` once (gate, the yard's title, the yard's pads), exit clean, harness faults 0; everything else through `tests/lib/page.js` rigs kept in `.../scratchpad/polish/`.
- Node: gate cues tallied through `courseFromDocument` (item 1).
- The board read through a local proxy that refused every non GET; it refused 65 stats pings and nothing else.
- Not run: `npm run verify` (nothing changed, and the brief said not to), `lint:shell` and `lint:input` (their failures are quoted from PROGRESS, not rerun).
- Browser profiles went to a private temp folder, removed at the end; no `/tmp/sim-page-*` was created by this survey.

---

## The owner's answers, 2026-09-26

Given in the conversation, answering the open decisions above, with the
order of work: "do the bigger items also starting with map card and stage f
then manga menus".

1. **Scoring prices: agreed.** A low pass pays points and buys no
   multiplier (item 15).
2. **Remove the impossible records** from the public board (item 5): the
   board refuses a lap that cannot have been flown, and the ones it holds are
   removed. Done in the board's own repository,
   Mathew-Harvey/WebFPVSimulator-LeaderBoard; the exact rows are listed to
   the owner before the purge is deployed.
3. **A crash on a road sets the craft down on the verge** (item 10).
4. **The Weight slider fades out once in flight**, and shows when landed or
   on the pause screen (items 2 and 12).
5. **PHYSICS PATH, approved: judge crashes per physics step** (item 16),
   removing the frame rate dependence. Under CLAUDE.md the check:crash
   coverage of the edge case lands first, and the change goes through the
   verify-flight-model procedure.
6. **The lens: leave it** (item 11). No barrel distortion in freestyle, no
   fisheye setting.
7. **The race field restyle: leave it** (item 20).
8. **Thrust (1.62 g): leave it for now.**
9. **Maverick Loop: the cheap fix, remove the trick.** The recogniser stops
   naming it and score:selftest's red line goes with it.

The bigger items, in the owner's order: the Freestyle room's map card (17),
Stage F (18), the manga menus (19), then the rest (14 the phone OSD, 21 the
town's budget in its render only steps, 22 to 24).
