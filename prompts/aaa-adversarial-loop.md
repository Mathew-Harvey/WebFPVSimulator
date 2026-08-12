# Adversarial polish loop: take WebFPVSimulator to a finished product

You are running unattended on the repository at github.com/Mathew-Harvey/WebFPVSimulator.
There is no human to ask. Every question you want to ask, answer by
measuring, by screenshotting, or by writing it down as a blocker and
carrying on with something else.

Your job is to take this project from "works and looks decent" to
"a stranger would believe it is a commercial product", and to prove it
rather than assert it.

Read `CLAUDE.md` first. It is not advice, it is the constitution.

---

## THE PRIME DIRECTIVE

**You may not change a threshold, tolerance, rubric, reference asset, or
success criterion in order to make a check pass.**

This includes: widening a band, deleting a check, marking a check "not
applicable", lowering a target frame rate, reducing a resolution, cutting
scene content to make a budget, renaming a failure to a "known
limitation", moving a hard requirement into a "future work" section, or
softening any wording in the rubric below.

If a bar is hard, the answer is better code. Never a softer test.

If you become convinced a bar is genuinely wrong (internally
inconsistent, or physically impossible alongside another bar), you do
not get to change it. You write the derivation into
`.loop/threshold-disputes.md`, mark that item BLOCKED WITH ARGUMENT,
and keep every other bar intact. A human rules on it later.

**Do not fabricate evidence.** Not a benchmark number, not a log, not a
measurement, not a screenshot description of something you did not
render. If you cannot measure it in this container, say so and mark it
BLOCKED. A blocked item honestly reported is worth more than the entire
rest of the run; a faked one poisons all of it.

**Do not rewrite this document.**

---

## WHERE THE PROJECT IS RIGHT NOW

Branch `main` and branch `loop/perfection` are both at the same commit.
Work on `loop/perfection`, fast-forward `main` when a milestone is
genuinely finished and green.

**What exists and is good:**

- Real Betaflight 4.5.1 compiled to WASM (vendored submodule, zero
  patches, SITL target). Rates, PID, feedforward, filters, TPA, airmode
  are Betaflight's own code, not reimplementations.
- A physically derived plant: propeller pair from momentum theory with an
  enforced figure of merit of 0.50, real motor/pack/rotor constants,
  implicit battery solve, advance ratio. Hover 20.5 percent throttle at
  8595 RPM, bench TWR 9.2, motor t63 18 ms, terminal 31.4 m/s, sag 10.1
  percent. Stock Betaflight defaults fly it cleanly, which is the
  evidence the plant is right.
- Determinism: fixed 1 kHz accumulator, deterministic libm, bit-identical
  traces between Node and headless Chrome and across 30/60/144/240 Hz
  render rates.
- `npm run verify` holds **12 of 13**. The one red is `yaw-coupling`,
  which is structurally 0.00 for a symmetric X quad; the argument is in
  PROGRESS.md OPEN QUESTIONS and the threshold has never been touched.
  **12 of 13 is the floor. If you ever see 11, you broke something.**
- A cel shaded world: RGB toon ramp (warm light, cool shadow), depth and
  normal ink pass, bloom, colour grade, value noise terrain with baked
  AO, 46k blade wind grass with propwash, lake, four mountain rings with
  stepped aerial perspective, cloud shadows.
- Time trial racing: 8 gate figure eight, ring aperture scoring, swept
  crossing detection, sim clock lap timing, gate tap voids the lap,
  best lap keyed by config and cell voltage, throttle to launch hold.
- Input: Gamepad API for a radio in joystick mode with a calibration
  wizard, plus WASD and arrows.
- About 320 draw calls per frame, roughly 1.0M triangles.

**What is missing, in rough order of how much it costs the experience:**

1. There is no audio worth the name (a sawtooth per motor, no wind, no
   impacts, no doppler, no spatialisation).
2. There is no menu, no settings, no title, no results screen. The page
   loads straight into a flying quad with a monospace debug HUD in the
   corner. This alone reads as a tech demo rather than a product.
3. The HUD is developer output, not an FPV OSD.
4. No LOD, no frustum culling strategy, no instancing for anything
   dynamic; performance on a real GPU has never been measured.
5. No collision with terrain features (trees, rocks, cliffs) or water.
6. No replay, no ghost, no leaderboard beyond one localStorage number.
7. Input path is sampled per animation frame, not on an independent high
   rate path, and end to end latency has never been measured.

**Known blockers you must NOT try to fake:**

- Real Betaflight blackbox logs from a physical 6S 5 inch quad, for
  validating the plant against reality. There are none in the repo and
  you cannot generate them. Mark BLOCKED.
- GPU benchmarking on target hardware (a discrete desktop GPU at 1440p).
  This container has software rasterisation only, so any frame rate you
  measure here is meaningless as a product claim. You may measure
  *relative* cost (draw calls, triangles, shader complexity, frame time
  deltas between two builds on the same software rasteriser) and you
  should. You may not claim an absolute fps figure for real hardware.

---

## WHAT "AAA" MEANS HERE, CONCRETELY

"AAA" is not a feeling and you do not get to grade it yourself. It is
this list. Every item is a falsifiable observation a hostile critic can
check against a screenshot, a clip, a measurement, or thirty seconds of
use. An item passes only when the critic says it passes.

### A. First ninety seconds (the product test)

- A1. The page opens on a title state, not on a falling quad. There is a
  clear way to start, and a clear way to change settings, from the
  keyboard alone and from a gamepad alone.
- A2. A person who has never flown FPV can find out how to fly without
  reading a README. Controls are discoverable in the product.
- A3. Finishing a lap produces a result the player can read and react to,
  not a two second flash over the flight view.
- A4. Nothing on screen is developer output. No hash, no raw state array,
  no "fps 8" in a debug font, unless the player asked for it in a
  performance overlay.
- A5. Every user facing string is written prose. No snake_case, no
  identifiers, no units the player does not need.

### B. Image quality

- B1. Read the frame at a glance: sky, ground, and objects each occupy a
  distinct value band, and every silhouette separates from what is
  behind it. No object dissolves into its background at any distance.
- B2. No rendering artefact of any kind is visible in a still: no
  z fighting, no shimmering edges, no seams, no clipping through
  geometry, no ink line where a surface is continuous, no missing ink
  where two surfaces meet.
- B3. Motion reads correctly at racing speed: the sensation of speed
  comes from the ground and near geometry, not from camera shake. There
  is a clear sense of altitude at all times.
- B4. Colour is deliberate. Light is warm and shadow is cool everywhere,
  including grass, water, particles, and UI. Nothing is a grey copy of
  itself in shadow.
- B5. The world has a focal hierarchy: the next gate is the most
  attention grabbing thing on screen, followed by the track, followed by
  landmarks, followed by dressing. A pilot never hunts for where to go.
- B6. Scale reads: the quad feels like a 250 mm object in a valley
  hundreds of metres across, not a toy on a table or a plane over a
  continent.

### C. Feel

- C1. Stick to screen feels immediate. Any added latency over the
  physics is measured and reported in milliseconds, not asserted.
- C2. Propwash, ground effect, and the loss of authority in a hard
  descent are all present and distinguishable to a pilot.
- C3. Impacts have consequence and feedback: sound, camera, and visual
  response, proportionate to the impact.
- C4. Audio is a system, not a placeholder: motor tone tracks RPM per
  motor with load, wind rises with airspeed, impacts and gate passes are
  audible, and the mix does not fatigue over a five minute session.
- C5. The craft behaves identically whether flown on a radio or the
  keyboard, allowing for the input device's own resolution.

### D. Engineering integrity (non negotiable, checked every round)

- D1. `npm run verify` reports 12 of 13, run in the same turn as any
  claim about it, output pasted verbatim.
- D2. `git diff --stat vendor/betaflight` is empty.
- D3. Zero console errors and zero console warnings in the browser, on
  load and after two minutes of flight.
- D4. The physics path contains no `Math.sin`, `Math.cos`, `Math.pow`,
  and reads no frame time. A dropped frame changes nothing about the
  trajectory.
- D5. Every source file carries its GPLv3 header. No new dependency
  without a justification written in PROGRESS.md first.
- D6. No em dashes or en dashes anywhere in prose, comments, commit
  messages, or documentation.

---

## THE LOOP

Each round has three phases. Do them in order. Do not merge phases.

### Phase 1: BUILD (one item)

Pick exactly one failing rubric item. Priority order is A, then D
regressions, then B, then C. Within a letter, pick the item whose fix
most changes what a player experiences.

Build it. Keep it simple: this project's style is plain JavaScript, one
file doing an obvious thing, no framework, no bundler, no state library.
A clever architecture that delays the fix is worse than the fix.

### Phase 2: EVIDENCE

Produce artefacts, not claims. Before you may say anything works:

- Run the shell in headless Chromium over the DevTools protocol and
  capture screenshots of the actual thing you changed. There is a working
  harness pattern in `tests/lib/browser.js` and the scratch scripts;
  Chromium is at `/opt/pw-browsers/chromium`, needs
  `--use-angle=swiftshader`, and does not inherit the proxy, so the CDN
  import map has to be served through DevTools `Fetch` interception.
- **Look at the screenshots.** Every single real rendering bug in this
  project's history was found by looking at a frame and not one was found
  by reading the code. Trees rendering as crumpled wire, a green band
  across the top of the screen, the camera inside its own outline hull,
  flowers floating half a metre above the grass, grass a different green
  from the ground it grows in: all of them invisible in the source, all
  of them obvious in a frame.
- Run `npm run verify` and paste the table.
- Measure anything you are about to describe with a number.

### Phase 3: BREAK (adversarial review, binding)

Spawn a fresh reviewer with the Agent tool, in its own context. Give it
the artefacts and the file paths. Do **not** give it your summary of
what you did, and do not tell it what you believe you fixed.

Note: workflow-tool subagents have been unreliable on this project
(arguments stripped from tool calls); direct Agent tool calls work. If a
reviewer returns without having actually read files, that is a harness
failure, not a pass. Re-run it.

Brief the reviewer roughly like this:

> You are reviewing a browser FPV racing simulator against a fixed
> rubric. You are hostile. Your default verdict is REJECT. The author's
> description of their own work is not evidence; only the screenshots,
> the measured numbers, and the code are evidence. For each rubric item
> you are given, return PASS or FAIL, and for every FAIL give the single
> most specific fix you can name, in one sentence, pointing at a file.
> If you cannot tell from the artefacts, return CANNOT VERIFY and say
> exactly what artefact you would need. Do not be encouraging. Do not
> praise. Do not soften. Rank your FAILs by how much each one costs the
> player.

Run at least two reviewers per round with different lenses. Useful
lenses, pick two that fit what you changed:

- An FPV racing pilot with ten years on real quads and every major sim,
  judging feel and race legitimacy.
- An art director shipping stylised titles, judging the frame.
- A player who has never flown FPV, opening the page cold, judging the
  first ninety seconds.
- A performance engineer, judging cost per pixel and per draw.
- A QA tester whose job is to find one thing that looks broken.

**Reviewer verdicts are binding.** You may not overrule a FAIL by
arguing with it. You may only:
1. Fix it, or
2. Show with a new artefact that the reviewer was factually wrong about
   what is on screen, or
3. Record it in `.loop/blocked.md` with the reason it cannot be done in
   this container.

### Round bookkeeping

After every round, update `.loop/state.json` with: round number, rubric
item attempted, reviewer verdicts, and the running pass/fail state of
every rubric item. Append to `.loop/tried-and-rejected.md` anything you
tried that did not work **and why**, so a later round does not retry it.
Append the round to `PROGRESS.md`, including what went wrong. Commit
with a message that says what changed and what the evidence was.

If two consecutive rounds oscillate (fix A breaks B, fix B breaks A),
stop fixing and write the conflict into `.loop/conflicts.md` with both
mechanisms, then design a third approach that satisfies both.

---

## DEFINITION OF DONE

Done is: **two consecutive rounds in which every rubric item is PASS by
adversarial review, no reviewer raises a new FAIL, `npm run verify`
reports 12 of 13, and the browser console is clean.**

Blocked items with a written argument do not prevent done, but they must
be listed at the top of the final handover, in plain language, as the
things a human still has to resolve.

When done: fast-forward `main`, push, and write `.loop/FINAL.md`
containing what a new person needs in order to pick this up: what is
built, what is blocked, what was tried and rejected, and where the
sharp edges are.

## IF YOU RUN OUT OF ROOM

Context exhaustion is not failure and it is not a reason to stop early
or to wrap up prematurely. Write `.loop/HANDOVER.md` with the current
round state, the exact next item you were going to build, and anything
you learned that is not yet written down. Commit and push everything.
The next instance continues from there. A handover is a baton pass, not
an ending.

Do not stop because the task is large. Stop when the rubric is green,
or when every remaining item is blocked for a reason you have written
down and a human has to break the tie.
