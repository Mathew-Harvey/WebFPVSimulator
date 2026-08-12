# Adversarial loop: a AAA looking world on a five year old laptop

You are running unattended on the repository at
github.com/Mathew-Harvey/WebFPVSimulator, branch
`claude/webfpvsim-polish-loop-c5qec8`, which is where `main` currently
points.

Read `CLAUDE.md` first. It is the constitution, not advice. Then
`.loop/HANDOVER.md`, `.loop/state.json`, `.loop/tried-and-rejected.md`,
`.loop/blocked.md`.

Your job is the **graphics and the game world**: to make a stranger believe
this is a commercial product, and to make it run on a machine with **no
discrete GPU**. Those two goals pull against each other. That tension is
the whole point of this loop. Anything you build that only looks good on a
fast machine has failed, and anything cheap that looks like a tech demo has
also failed.

---

## THE PRIME DIRECTIVE

**You may not change a threshold, tolerance, budget, rubric item, reference
asset, or success criterion in order to make a check pass.**

This includes: widening a band, deleting a check, marking an item "not
applicable", raising a budget, lowering a resolution, cutting scene content
purely to fit a budget while claiming the budget was met, renaming a failure
to a "known limitation", moving a hard requirement into "future work", or
softening any wording below.

If a bar is hard, the answer is better code. Never a softer test.

If you become convinced a bar is genuinely wrong, internally inconsistent,
or physically impossible alongside another bar, you do not get to change it.
Write the derivation into `.loop/threshold-disputes.md`, mark the item
BLOCKED WITH ARGUMENT, keep every other bar intact, and continue. A human
rules on it later.

**Do not fabricate evidence.** Not a number, not a log, not a measurement,
not a description of a frame you did not render. Five rounds of the
previous loop produced three cases where a number was written into a comment
or a commit message without a measurement behind it, and a reviewer found
every one. Measure it or do not write it down.

**Do not rewrite this document.**

---

## THE HARDWARE CONTRACT

Minimum target machine, and it is not negotiable:

**A mid range laptop from five years ago**, which in 2026 means roughly:

- Graphics: Intel Iris Xe or AMD Vega 8 integrated, or an entry discrete
  part of the GeForce MX450 or GTX 1650 Mobile class. Take the integrated
  case as the floor: about 1.5 to 2 teraflops, and 50 to 60 GB/s of memory
  bandwidth shared with the CPU.
- CPU: a quad core mobile part of the i5-10300H or Ryzen 5 4600H class.
- Panel: **1920 by 1080 at 60 frames per second**, `devicePixelRatio`
  clamped to 1. That resolution is the minimum spec, not the stretch goal.
- A browser tab, not a kiosk. Other tabs exist, and the GPU is shared with
  the compositor.

A note on where these numbers came from, because it matters for the Prime
Directive: an earlier draft of this loop targeted an Intel UHD 620 class
machine with 15 to 25 GB/s of bandwidth, and the budgets below were about
three times tighter. **The human owning this project corrected the target to
a mid range five year old laptop**, and the budgets were re-derived from that
hardware. That is a specification change made by the human, and it is the
only way a budget in this document may ever move. You do not get to relax
one because your build does not fit. If you think a budget is wrong, it goes
in `.loop/threshold-disputes.md` and a human rules on it.

You cannot measure frames per second honestly in this container: it has
software rasterisation only. Saying otherwise is fabricating evidence, and
`.loop/blocked.md` already records that. So the contract is expressed in
**proxies you can measure here**, and they are the budget you are held to.

### Hard budgets, per rendered frame, measured in this container

| # | Budget | Ceiling | Derivation | How to measure |
|---|---|---|---|---|
| P1 | Draw calls, **worst view, not best** | **400** | Draw calls are CPU bound through three.js. A 2020 quad core in Chrome holds a few thousand, but the frame also runs physics at 1 kHz on the same thread, so a third of the practical ceiling | `window.__renderStats().calls` in the title view, the start line view, and a mid course view |
| P2 | Triangles submitted, summed over every pass | **1,200,000** | Iris Xe pushes a few million simple triangles per frame at 60. This leaves room for the cel shader and the shadow pass while forcing real culling | `window.__renderStats().triangles`, same three views |
| P3 | Full resolution post passes at 1080p | **4** | One RGBA16F full res read plus write at 1080p is 33 MB, so 2 GB/s at 60 Hz. Four passes is 8 GB/s, about a sixth of the integrated floor's bandwidth | count passes in `src/render/post.js` that run at full width and height |
| P4 | Post chain texture taps per output pixel, summed over full res passes | **14** | The outline pass alone is 10, and it earns them; this leaves headroom for a grade and an antialiasing resolve and nothing else | read the shaders and count `texture2D` calls |
| P5 | Render target bytes at 1920 by 1080 | **120 MB** | Enough for two RGBA16F composer targets, the prepass with depth, a half res bloom chain and one shadow map. NOT enough for 4x multisampling on an RGBA16F target at 1080p, which alone is 132 MB, so that choice has to be argued against a post resolve | sum width x height x bytes per pixel x samples over every target |
| P6 | Time from navigation to the first interactive frame | **1800 ms** | A cold tab on a mechanical era laptop; anything past two seconds reads as broken | `performance.timing`, or `Date.now()` around `boot()`, in the harness |
| P7 | Longest synchronous main thread block after load | **50 ms** | Three dropped frames is the most a pilot will not feel. This one is hardware independent and does not move | instrument the frame loop and log the worst gap, or prove it from the code |
| P8 | Steady state allocation per frame | **zero new objects in the render loop** | Free to achieve, and garbage collection pauses are exactly what P7 forbids | read the loop; every `new`, object literal, array literal or spread in a per frame path is a finding |
| P9 | Shadow map resolution and count | **one map, 2048 or smaller** | 2048 costs 8.4 MB as depth and is affordable on this class. Two maps are not | `src/render/scene.js` |
| P10 | Vertex attribute bytes resident | **48 MB** | At 50 GB/s a fully resubmitted 48 MB of attributes is 2.9 GB/s at 60 Hz, which is the ceiling for something that should mostly be culled anyway | sum every geometry's attribute buffers |

Where the code stands as this loop opens: P1 is at 237 in the flight view
and **701 in the title view**, so 1.75x over in the worst view. P2 is at
**1.90M**, 1.6x over. P5 is unmeasured and probably over, because the
composer target currently carries `samples: 4` on an RGBA16F target. P6 was
measured once at **2195 ms**, over. P7 was **2195 ms of synchronous load**,
44x over, though that is load rather than steady state. The rest are
unmeasured. Measuring all ten and publishing the ledger is round one.

**Culling and level of detail must be proven, not asserted.** A build where
draw calls and triangles do not change when the camera turns has no culling.
Publish the three view numbers every round; that is the proof.

**The frame must be judged at 1920 by 1080, because that is the minimum
spec's panel**, and at 1600 by 900 for the faster capture loop. A world that
only reads at one resolution fails: capture both, look at both.

### The budgets are not permission to build a smaller world

Breath of the Wild renders a continent on a Nintendo Switch: roughly one
teraflop, 25 GB/s of shared bandwidth, 900p at 30 frames per second. The
minimum machine here has more compute than that and about twice the
bandwidth, and it has to draw one valley. If that console can hold a
continent together on that hardware, there is no excuse for this looking
thin, and the reason it can is technique, not headroom:

- One shading model for everything, so the whole world is a handful of
  materials and a handful of programs. Not a bespoke shader per prop.
- Instancing and merging by default. Static geometry has no business
  costing a draw call each. This repository already has a merger in
  `src/render/scene.js` and 276 of its 317 meshes do not use it.
- Levels of detail with real distance bands, and a far field that is flat
  shapes with baked colour rather than lit geometry.
- Light that is baked wherever it does not move. Vertex colour and baked
  occlusion are free at runtime; a shadow map is not.
- Detail concentrated where the eye is, which in an FPV racer is the ten
  metres either side of the racing line, and cheap silhouettes everywhere
  else.
- Alpha, overdraw and full screen passes treated as the scarce resources
  they are on shared memory bandwidth.

So when a budget bites, the answer is a better representation of the same
world, not less world. **Deleting content to make a number go down is
explicitly a Prime Directive violation if you then report the budget as
met.** Say what you removed and why, in the ledger, every time.

---

## WHAT "AAA WORLD" MEANS HERE, CONCRETELY

Falsifiable items. An item passes only when a hostile reviewer says it
passes, from artefacts.

### G. The frame

- G1. **Value structure.** Sky, ground, mid distance and near objects each
  occupy a distinct luminance band. For every object and background pair a
  reviewer samples, either the linear luminance difference is at least
  **0.06** or an unbroken ink line separates them. Nothing dissolves into
  its background at any distance.
- G2. **Aerial perspective is monotonic.** Measured luminance of successive
  distance layers must increase with distance toward the horizon value,
  with at least **0.05** between adjacent layers. Nothing beyond 300 m may
  be exempt from haze. All layers must actually appear in a rendered frame:
  a layer occluded in every view is dead code, not depth.
- G3. **The target owns the frame.** The next gate's peak luminance is the
  maximum in the frame, with at least **0.08** of headroom over the
  brightest pixel that is not the gate, in every captured view. The gate
  after next reads as the second loudest thing. A pilot never hunts.
- G4. **No artefact in a still.** No z fighting, no shimmer, no seam, no
  clipping through geometry, no ink on a continuous surface, no missing ink
  where two surfaces meet, no aliased silhouette without coverage pixels,
  no unresolved dark light dark fringe. A reviewer walking any edge must
  find a real coverage pixel.
- G5. **Deliberate colour on every surface class.** Light warm, shadow cool,
  everywhere: terrain, grass, water, foliage, rock, particles, interface.
  No surface class covering more than **2 percent** of frame area may be
  unlit or exempt from the light model. A shadowed surface is a different
  hue from its lit self, never a grey copy.
- G6. **Scale and middle distance.** Content exists at 20 to 200 m, not just
  under 20 and over 500. Terrain has relief inside the flight corridor, and
  at some point on a lap the terrain itself occludes part of the course. The
  quad reads as a 250 mm object in a valley hundreds of metres across.
- G7. **Motion reads.** Speed comes from the ground and near geometry, not
  camera shake. Prove it: two frames a known interval apart at speed, with
  the near field displacement measured against the sky's. Altitude is
  legible at all times. Propwash and dust exist where the craft is low.
- G8. **The world is a place.** At least six visually distinct landmark or
  biome elements, each readable at distance as its own silhouette, placed so
  a pilot can navigate by them. The track is readable ahead by cues that are
  not the gates themselves.
- G9. **Water and sky are surfaces, not decals.** Water has a light model, a
  real shoreline where it meets land, and depth cued by depth rather than by
  distance from its own centre. The sky has structure that does not read as
  a rendering artefact from any camera angle.
- G10. **It looks like this at 1080p on the lowest setting.** Every item
  above, judged again on a 1920 by 1080 capture with the cheapest settings
  the product offers, because 1080p is the minimum spec's panel and the
  lowest setting is what that machine will run.

### P. The potato contract

- P1 to P10 above, published as a ledger every round, for three views.
- P11. **A settings ladder that actually does something.** At least three
  quality levels, and each one must show a measured difference in the
  ledger, not just a different label. The lowest must hold every G item.

### D. Engineering integrity, non negotiable, checked every round

- D1. `npm run verify` reports **12 of 13**, run in the same turn as any
  claim about it, output pasted verbatim. `yaw-coupling` is the known red
  and its threshold has never been touched. If you ever see 11, you broke
  something.
- D2. `git diff --stat vendor/betaflight` is empty.
- D3. Zero console errors and zero console warnings, on load and after two
  minutes of flight.
- D4. The physics path contains no `Math.sin`, `Math.cos`, `Math.pow`, and
  reads no frame time. A dropped frame changes nothing about the trajectory.
- D5. Every source file carries its GPLv3 header. No new dependency without
  a justification written in PROGRESS.md first.
- D6. No em dashes or en dashes anywhere in prose, comments, commit
  messages or documentation.
- D7. `git diff HEAD -- tests/` is empty at the end of every round.

---

## THE LOOP

Three phases per round. Do not merge them.

### Phase 1: BUILD, one item

Pick one failing item. Priority: a D regression first, then whichever P
budget is furthest over its ceiling, then the G item whose fix most changes
what a player sees. Keep it simple: plain JavaScript, one file doing an
obvious thing, no framework, no bundler, no state library.

### Phase 2: EVIDENCE

Artefacts, not claims.

- Capture with `scripts/shots.js`, which drives the real page in headless
  Chromium. **Assert the state every capture claims** with `until:` and
  `expect:`; a fixed wait is not evidence, because a frame takes about
  120 ms here and a keypress followed by `wait:400` can capture the state
  before the key. Capture at 1600x900 **and** 1920x1080.
- **Look at the screenshots.** Every real rendering bug in this project's
  history was found by looking at a frame and not one by reading the code.
  A washed out world, a flat cream plane, ink drawn across a cloud, a dusty
  pink flag, grass like broken glass: all invisible in the source, all
  obvious in a frame.
- Measure with `scripts/pixels.js`, which prints Rec. 709 linear luminance
  per rectangle. Every G claim about value, contrast or hierarchy needs its
  numbers. Verify you sampled what you meant to: patch coordinates are
  frame specific.
- Publish the **cost ledger**: P1 to P10 for the title view, the start line
  view and a mid course view. State the view with every number. "310 draw
  calls" with no view named is not a measurement.
- Run `npm run verify` and paste the table.

### Phase 3: BREAK, adversarial review, binding

Spawn fresh reviewers with the Agent tool, in their own context. Give them
the artefacts and the file paths. Do **not** give them your summary of what
you did or what you believe you fixed. Tell them explicitly **not to edit
any file**: a reviewer that changes the code under review has invalidated
its own verdict, and that has already happened once here.

Brief them roughly like this:

> You are reviewing a browser FPV racing simulator against a fixed rubric.
> You are hostile. Your default verdict is REJECT. The author's description
> of their own work is not evidence; only the screenshots, the measured
> numbers, and the code are evidence. For each rubric item return PASS,
> FAIL, or CANNOT VERIFY, and for every FAIL give the single most specific
> fix you can name, in one sentence, pointing at a file. If you cannot tell
> from the artefacts, say exactly what artefact you would need. Do not be
> encouraging. Do not praise. Do not soften. Rank your FAILs by how much
> each one costs the player. Do not edit any file.

Run at least two per round with different lenses. Pick two that fit what
you changed:

- An art director shipping stylised titles, judging the frame.
- A graphics engineer on integrated GPUs, judging the ledger and the
  shaders, who will refuse any number without a view attached.
- An FPV racing pilot of ten years, judging speed, legibility and race
  legitimacy.
- A player on a five year old laptop, opening the page cold.
- A QA tester paid per defect.

**Verdicts are binding.** You may only fix it, show with a new artefact
that the reviewer was factually wrong about what is on screen, or record it
in `.loop/blocked.md` with the reason it cannot be done in this container.

### Bookkeeping, every round

Update `.loop/state.json` with the round number, the item attempted, the
cost ledger, reviewer verdicts, and the running pass or fail state of every
item. Append what did not work **and why** to
`.loop/tried-and-rejected.md`. Append the round to `PROGRESS.md`, including
what went wrong. Commit with a message that says what changed and what the
evidence was. Keep `.loop/HANDOVER.md` current at the end of every round.

If two consecutive rounds oscillate, write the conflict into
`.loop/conflicts.md` with both mechanisms, then design a third approach
that satisfies both.

---

## KNOWN BLOCKERS, DO NOT FAKE THEM

Already argued in `.loop/blocked.md`:

- Absolute frame rate on the target hardware. This container is a software
  rasteriser. The proxy budgets P1 to P10 are the contract precisely
  because the real number is unmeasurable here. A human must confirm 1080p
  at 60 frames per second on an actual five year old mid range laptop.
  Never claim it yourself.
- Real Betaflight blackbox logs from a physical 6S five inch quad.
- Stick to photon latency.
- Real radio hardware for the Gamepad path.

---

## THE STATE THIS LOOP INHERITS

Five rounds of the previous loop are in `PROGRESS.md`. A1, A2, A3 pass by
review. B1, B2, B4, B5, B6 all failed their last review, and round 5 is
unreviewed. `.loop/state.json` lists 22 named open findings with mechanisms,
most of them graphics. Start there rather than rediscovering them. Three
worth knowing immediately:

- The frame had no antialiasing at all until round 5, because the
  renderer's `antialias` flag is inert when EffectComposer allocates its own
  targets. The composer target now carries `samples: 4`, which on a potato
  is a cost you must re-examine: multisampling an RGBA16F target at 1080p is
  expensive, and a cheap post AA pass may be the better trade. Measure both.
- A lit material on geometry with no normal attribute washed the entire
  world to flat cream with a **completely clean console**. Check for normals
  before putting a lit material on anything.
- The renderer runs with `NoToneMapping`, so no colour can exceed 1.0. Any
  plan that wants a real highlight either works below that ceiling or
  changes tone mapping deliberately, in its own round, with its own review.

---

## DEFINITION OF DONE

**Two consecutive rounds in which every G item, every P budget and every D
item is PASS by adversarial review, no reviewer raises a new FAIL,
`npm run verify` reports 12 of 13, and the console is clean at both
resolutions.** The minimum spec is a mid range five year old laptop at 1080p
and 60 frames per second, and P1 to P11 are how that is held to account here.

Blocked items with a written argument do not prevent done, but they must be
listed at the top of the final handover, in plain language, as the things a
human still has to resolve.

When done: fast forward `main`, push, and write `.loop/FINAL.md` with what
is built, what is blocked, what was tried and rejected, the final cost
ledger, and where the sharp edges are.

## IF YOU RUN OUT OF ROOM

Context exhaustion is not failure and not a reason to stop early or wrap up
prematurely. Update `.loop/HANDOVER.md` with the round state, the exact next
item you were going to build, the current cost ledger, and anything you
learned that is not yet written down. Commit and push everything. The next
instance continues from there. A handover is a baton pass, not an ending.

Do not stop because the task is large. Stop when the rubric is green, or
when every remaining item is blocked for a reason you have written down and
a human has to break the tie.
