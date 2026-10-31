# The whoop builder: build it in 3D, keep the brain

A plan for the owner, 29 September 2026. The plan is written to be argued with,
and section 8 lists the decisions it is waiting on.

Status, 30 September 2026: Stages 0 to 3 are built, on the owner's "build up to
stage 3" (the PROGRESS entries of 29 and 30 September say what each stage did, what
departed from the plan and why, and what was run). Stages 4 and 5, the club profile,
the new parts and the ways out to other tools, are not started: they wait on the
owner's answers to decisions 3 to 6 and 8. The text below is the plan as it was
written.

## 0. What was asked

In the owner's words: "i find the top down buidling of ours very hard to
understand and build a track, i find their super easy and intuative, make a
plan to overhaul our micro track builder to allow for all the best stuff
theirs has".

"Theirs" is FPV Track Designer at designer.fpv-events.com, a browser tool for
laying out indoor whoop tracks. Its source looks to be
github.com/TuxRich/Track-Designer, MIT licence, copyright 2026 TuxRich. That
match rests on the stack (a Go server, vendored Three.js, no build step), the
feature list and a saved track called "Rich 8x6m test". It was not confirmed
that the hosted site runs exactly that repository.

Read here as three things. Building has to make sense to somebody who has never
seen the tool, and the top down plan is where it does not. Take what is best in
theirs, which is more than the interface: the parts people really build with,
the tools for laying a track out in a real room, and the ways out to other
places. And the scope is the whoop canvas, `micro` in the code: the 5 inch and
freestyle canvases keep their behaviour until the owner says otherwise.

## 1. Why building is hard today

Each item was read in the code. Where it says so, it was reproduced in the
running page on 29 September (headless Chromium, 1600 by 900).

1. **The view that looks like the room cannot build.** The `view3d.js` header
   says "The preview is read only except for one thing", and the 2D view "is the
   tool". Press a gate in 3D and drag, and it does not move: `onDown`
   (`view3d.js:1131`) sends the drag of anything that stands on the ground to
   the orbit, and the first upward pull says "That stands on the ground, so it
   has no height to drag" (`view3d.js:1245`). The natural gesture does the
   opposite of what the pilot meant. There is no placement in 3D at all:
   `placeAt` is called from one place, `view2d.js:694`.
2. **The view that can build draws gates as bars.** Seen from above a vertical
   gate is a line. Its height, its stack and the room round it are not in the
   picture. What is in it is the model's vocabulary: the racing line, face
   arrows, clearance circles. A first time builder has to read a diagram before
   they can make one.
3. **Gates turn by themselves, and not to a right angle.** A new gate is turned
   along the line from the last one (`defaultYawFor`, `faces.js:447`), and every
   edit re-derives the heading of any gate the author has not turned
   (`applyAutoFaces`, `faces.js:203`). RaceGOW wants every gate on one of two
   axes (`rg-square-headings`), and `faces.js` does not know that. Converting a
   16 piece track without pinning its headings gave seven
   `rg-square-headings` warnings, all from the tool's own re-derivation.
4. **The words are the model's, not the pilot's.** Sill height, Level spacing,
   Opening width, Yaw, Flip face, Re-derive, "How it is flown", a `set` badge
   that means "face fixed by hand", and two unlabelled buttons on every flying
   order row, `X` and `-` (`ui.js:203`, `1138`, `1391`, `1393`, `1570`). The
   palette keys are not mnemonic: Triple stack is R, Pole is U, Horizontal pole
   is Z, Dive Gate is D.
5. **It opens on the wrong thing.** Fit and every document load frame the whole
   10 by 12 m hall (`view2d.js:505`, `view3d.js:882`, `app.js:1879`), so a track
   a metre or two across opens as a small cluster in a big empty rectangle.
6. **A gate is hard to click in 3D.** Only the four pipes and the legs can be
   picked, 26.7 mm of PVC (`buildAperture`). The invisible pane across an
   opening exists only for openings with no pipe. Theirs has one across every
   opening, so the middle of a gate selects it.
7. **The numbers are as big as the gates.** A whoop's order numbers are 0.33 m
   tall (`view3d.js:1569` and `1579`, 1.1 m times 0.30) over a 0.71 m gate.
8. **It does not fit a tablet or a phone.** The drawing area is 0 px wide at
   390 px, 320 px at 820 and 524 px at 1024 (measured). `device-check.js` looks
   at the builder's top bar on a laptop and nothing else.
9. **Four defects a drag in 3D would meet sooner.** All are finding 14 of the
   2026-09-29 sweep in PROGRESS.md, reported and not fixed, and all were
   reproduced today:
   - A click that only selects records an undo step called "move".
     `history.js:68` compares whole documents and `settle()` moves
     `modifiedUtc` (`app.js:744`).
   - A whoop field resized to 8 by 10 comes back as 10 by 12, every element 1 m
     along in each direction, after an export and an import. The micro block in
     `normalize()` (`model.js:1068`) forces the room size on every read.
   - A gate of zero width and height is accepted on import with no repair note.
   - Import replaces the canvas with no confirm and no undo (`app.js:2840`).
10. **It is the round 18 brief.** "Switch between a top down authoring view and a
    3D preview... It does not fly, score or simulate" is how the builder was
    asked for in August, when it was a JSON tool. It has since become the front
    door of the simulator (Fly this track, Publish, the whoop room), and the
    brief did not move with it.

## 2. What theirs does, and what we keep

Read end to end: 25 files, 187 KB of their own JavaScript, run in headless
Chromium against a local mirror. Why it feels easy, from the code:

- One surface, all of it 3D. No modes to learn.
- Placing is two clicks: a palette item, then the floor, with a ghost that
  follows the pointer and snaps. The tool stays armed.
- A click anywhere in a gate selects it, and a gizmo appears: arrows to move, a
  ring to turn.
- Order and direction are on the gates all the time: a number over each, an
  arrow through it.
- Six plain fields: Order, X, Y, Height, Rotation, Direction.
- A tape measure, because that is how a real track gets laid.
- Parts that look like what people build: hoops, hex gates, cubes, tables,
  banners.
- 921 KB in 21 requests to load, against 2.1 MB in 59 for ours (uncompressed on
  localhost, ours without the Three.js it takes from the CDN).

Where it is thin, and the plan does not copy it: no undo, no autosave, no
validation, no lap length, no racing line. It has a shared gate catalogue anyone
can add to (it already holds "cube wop" and a table called "start gate"), and
tracks saved without a password can be overwritten by anyone with the id.

**What we keep, whole:** the document and the reader that never throws, the
derived racing line, the RaceGOW rules and warnings, the eight RaceGOW5
presets, undo, redo and autosave, multiple passes and the stack figures, sponsor
logos, Publish, Fly this track, the lap GIF and the board card, and the 5 inch
and freestyle canvases. The plan replaces the hands and keeps the brain.

| Their feature | Verdict | Stage |
| --- | --- | --- |
| 3D placement with a ghost that follows the pointer | Take | 1 |
| Click anywhere in a gate to select it | Take | 0 |
| Drag to move, a gizmo to turn | Adapt: the gate is the handle and a ring at its foot turns it, because a gate never leaves the floor | 1 |
| Multi select, group move and turn; duplicate; delete | Take | 1 |
| Replace with: swap the type in place, keeping position, turn and place in the order | Take | 2 |
| Order number with plus and minus | Adapt: click the number bubble on the gate | 1 |
| Direction arrow on every gate | Take | 1 |
| A piece that is not in the flying order | Have it ("Not in the track"), surface it better | 1 |
| Tape measure | Adapt: live distances while placing, plus a ruler | 2 |
| Arena size to match the room | Adapt: room size as data, snap-back fixed first | 0, 4 |
| Snap to 0.1 m and 15 degrees | Adapt: keep the one inch grid, add magnets | 2 |
| PNG screenshot | Take | 3 |
| View only share link | Adapt: a link that carries the track in its fragment, no server | 3 |
| Passwords and private tracks on their server | Skip: needs accounts or a key scheme, and "no account" is a project rule | none |
| Anyone can define a gate type, saved on the server | Skip as designed; adapt: sizes and colours saved inside the document | 4 |
| Hoop, hex and six face cube gates; tables, chairs, image banners | Take, at a cost (section 4) | 4 |
| Import their track JSON | Take | 3, 4 |
| glb export; USDZ export for AR in Quick Look | Take | 5 |
| WebXR walk-through | Later | 5, if wanted |
| Export to other simulators | Later, not recommended now (5.4) | 5, if wanted |
| Server side versions and history | Skip: undo and autosave cover it | none |

## 3. The design: build in 3D

The room view becomes the tool on the whoop canvas. The plan becomes a camera
angle and a toggle, not a second editor to learn. What you see is what you
build, the model's vocabulary stays in the model, and RaceGOW's rules show while
you drag, not in a list afterwards.

### 3.1 Mouse and keyboard, in the room

| Gesture | What it does |
| --- | --- |
| A palette item, then the pointer over the floor | A ghost follows the pointer, snapped, with its arrow and its distance to the last gate |
| Click the floor | Places it. The tool stays armed, so ten gates are ten clicks, as today |
| Right click, Escape | Puts the tool away |
| Click anywhere in a gate, or on its pipes | Selects it. Shift adds or removes |
| Press and drag a gate | Moves it across the floor, selected or not. Snaps to the one inch grid, then to its neighbours (3.5). Alt is free |
| Drag the ring at its foot | Turns it: 90 degree steps under RaceGOW, 15 in the club profile, Alt is free |
| Drag empty floor | Orbits, as today. Shift drag: box select. Right or middle drag: pan. Wheel: zoom toward the pointer |
| Click the number on a gate | Type a new place in the flying order |
| Arrow keys | Nudge the selection one grid step. Shift: six inches |
| Q, E, X | Turn a step, flip the direction, as today |
| Ctrl D | Duplicate, offset one gate width so the copy sits side by side |
| Delete, Ctrl Z, Ctrl Shift Z, Ctrl S, Ctrl A | As today |
| Home, F, V | Fit the track, frame the selection, toggle Plan (straight down) and Room |
| Bend line (a toggle, off by default) | The gesture that drags the racing line into a waypoint today |

Why Bend line moves behind a toggle: the racing line runs through the middle of
every gate, so with the line shown a click in a gate's opening is a click on the
line, and `onDown` gives the line the click and starts a bend (`pathHit`). Under
the new rule the gate takes the click.

### 3.2 Touch

One finger on empty floor orbits. Two fingers pan, pinch to zoom and twist to
orbit. Tapping with a tool armed places, and tapping a gate selects it and shows
a small bar at the gate (Turn, Reverse, Copy, Delete), because a touch screen has
no keyboard. Dragging a selected gate moves it. The palette runs along the
bottom and the inspector is a sheet. This is new work: the 3D view handles one
pointer today, and a second finger's `pointerdown` replaces the first drag. It
uses Pointer Events with a small map of the pointers down, and `touch-action:
none` on the canvas.

### 3.3 What is on the canvas

- **A gate you can see from across the hall.** The frame keeps its true 26.7 mm
  pipe and gains an outline of constant pixel width and a translucent pane in the
  opening. `buildAperture` already draws a one pixel line round the true opening
  for the same reason.
- **RaceGOW's own colours** on the pane: start and finish green, single gate
  yellow, stacks purple, elevated gate orange, horizontal gate blue, poles red
  (`RACEGOW_ELEMENTS`, from the official diagrams, so a RaceGOW pilot already
  reads them). Decision 7.
- **A direction arrow through every opening,** in place of the green and red
  panes, which stay for the selected gate only.
- **A number bubble over every gate,** constant size on screen (about 22 px),
  click to renumber. Bubbles stack where several passes share a structure.
- **The racing line, on** by default. The toggle stays.
- **Live distance while placing or dragging,** from the previous gate and to the
  next, in inches with millimetres beside them (as `inches()` already prints),
  green inside RaceGOW's 27 to 33 in and amber outside.
- **Warnings on the piece.** Every warning already names an element. A badge sits
  on it, the sentence is one hover away, a click focuses it (`focusWarning`
  exists), and the results list stays. Nothing new to compute: the line and its
  warnings are under 2 ms on a room (`rebuildPathForDrag`).
- **The envelope.** RaceGOW's 4 by 6 ft rectangle scaled by gate size (1.42 by
  2.13 m at 28 in, `envelopeFor`), drawn on the floor with the rest of the hall
  dimmed. It is what an empty canvas frames.

### 3.4 Panels and words

| Now | On the whoop canvas |
| --- | --- |
| Sill height | Height off floor |
| Level spacing | Gap between gates |
| Opening width, Opening height | Gate size, the RaceGOW 28 in chip first |
| Yaw | Turn |
| Flip face | Reverse direction |
| Re-derive | Let the tool decide again |
| How it is flown | Path through the stack |
| the `set` badge | Turned by hand |
| `X` and `-` on a flying order row | Reverse and Remove, with the words |
| Dive Gate | Horizontal gate, RaceGOW's own name for it |
| 2D, 3D | Plan, Room |

The inspector becomes a card that floats by the selected piece with six fields:
Place in order, X, Y, Height off floor, Turn, Direction, shown in inches with
millimetres beside them. Everything else (faces, sides taken away, the stack
figure, flag side, pass side) goes under a More fold. On a narrow screen the card
docks at the bottom. The flying order becomes a drawer, closed by default. A lap
bar along the bottom shows Length, Gates, Lap closes and the warning count, and
opens the elevation profile and the list.

### 3.5 Help while placing

1. **Gates keep the heading they are placed with.** On the whoop canvas a new
   gate takes the nearest of the four axes to the line from the last gate and
   keeps it (`yawOverridden`), so gates turn only when the author turns them, as
   in theirs. The direction through the gate stays derived from the flying order.
   This changes `defaultYawFor` for micro only. Existing documents are not
   touched, because the rule applies when a gate is placed and not when a
   document is read.
2. **Magnets.** Near a legal position a piece snaps to it and shows a guide: 30
   in centre to centre from a neighbour along its width, the stack pitch, 14 in
   off a pole (`POLE_FROM_GATE_MIN`), the same x or y as another piece. Alt turns
   them off. One pure function in `snap.js`, used by both views, so the plan and
   the room cannot disagree.
3. **A Row tool.** RaceGOW's vocabulary lists Side by Side Gates, two or three in
   a row sharing their verticals, 30 in apart. `RACEGOW_ELEMENTS` names a
   `sideBySide` type that exists nowhere else in the code, so today a row is
   placed one gate at a time with doubled pipes. The tool would drag out a row.
   How it is stored is a small modelling question for Stage 2: a group of
   ordinary gates with the shared sides taken away (`unbuiltSides` exists for
   this), or a new element. Recommended: the group.
4. **Replace with,** as in the table in section 2.

### 3.6 The camera, and the first minute

- **The camera** opens on the envelope for an empty canvas and on the track's own
  extent for a loaded one, from the front left at three quarters. Fit frames the
  track with a margin, F frames the selection, in both views. `frameField` stays
  for the other canvases. Plan looks straight down for precision. The 2D canvas
  stays exactly as it is, one press away.
- **The empty canvas** shows the envelope and one line in the scene: "Pick a gate
  on the left, then click the floor." Beside it, a Start from a RaceGOW track
  button that opens the eight shipped rows in Load (`storage.js` already lists
  them for the class). A blank canvas is the hardest thing to start from, and a
  finished track with a gate to move is the easiest.
- **A one line coach** at the bottom while there are fewer than three gates,
  saying what the pointer does now.
- The "What are you building?" chooser stays, and the whoop choice lands here.

### 3.7 How it is built

1. **The same door.** Every change goes through `app.edit`, `beginEdit` and
   `endEdit`, so undo, autosave and the derived line come free. The gestures call
   the host methods the plan view calls (`placeAt`, `moveSelected`,
   `rotateSelected`, `deleteSelection`), all of which take points on the document
   plane. 3D has only to supply the floor point under the pointer, and it has
   that already (`levelPoint`).
2. **The gestures live in a new module,** `src/trackbuilder/edit3d.js`, loaded
   with Three.js. `view3d.js` is 3,192 lines and its header promises a read only
   preview; the header changes with this work.
3. **A drag has a fast path.** Measured on this container (software rasteriser,
   CPU time of `build()` alone), a whole rebuild of the scene is 7.8 ms at the
   median and 20 ms at the 95th percentile on Track 1 (17 elements), and 10.8 ms
   and 53 ms on Track 6 (34 elements), against a 16.7 ms frame. The model side of
   a drag is cheap (`moveSelected`, 1.3 ms median). So a drag moves the pieces'
   own groups and redraws the line, and the scene is rebuilt once on release. A
   test asserts that a fast drag and a rebuild give the same scene.
4. **Three.js starts loading when the whoop canvas opens,** not on the first
   press of 3D. The reason for the lazy load, a slow CDN taking the tool down, is
   kept by the fall back that exists: if Three.js does not arrive, `setMode`
   says so and returns to the plan. The canvas opens on the plan and switches
   when the room is ready.
5. **Bigger targets.** A pane across every opening, marked weak as the ones on
   unbuilt openings are, and an invisible fatter tube round each pipe.
6. **Four small files,** each doing one obvious thing: `edit3d.js` (gestures),
   `snap.js` (magnets, quarter turns, distances: pure, no DOM, no Three.js, like
   the builder's other data modules), `buildsheet.js` and `importfpv.js`
   (section 5). Everything else changes in place. No framework, no bundler, no
   build step, and a GPLv3 header on each new file.

### 3.8 A piece flown more than once (added 2026-09-30, the owner's ask)

The owner: "design and fix the super cluttered experience of building a tiny track where
gates are used more than once on a lap", and "don't touch the existing tracks". The
RaceGOW5 tracks do this all the time: Track 8 flies 14 pieces 29 times, one tall pole six
times and two of its gates three times each; Track 6 flies 11 pieces 20 times; Track 5,
13 pieces 20 times. Tracks 1 and 2 never do, which is why they read cleanly.

**What is wrong, measured on the builder as it stands after Stage 3.**

1. Every pass draws its own arrow, 0.85 of the opening wide, on the same opening, so a
   piece flown three times is three arrows on top of each other and a gate under them.
2. Every pass of a pole or cone draws its own green and red scoring square with a
   translucent pane each. Track 8's tall pole is six squares of coloured glass round one
   pipe.
3. Every pass has its own number chip, 29 on Track 8, each a button.
4. The card is about the first pass only. Track 8's pole says "number 2" and the other
   five passes are nowhere on it; Place in order and Other side act on pass 2 whichever
   pass the pilot meant.
5. The flying order list cuts names to "Tall ..." in its narrow column, so six rows read
   the same, and nothing links a row to its piece except selecting it.
6. There is no way to fly a single gate again. "Fly another level" exists for stacks only
   and "Add to the track" for a piece that is not in the order at all.
7. The racing line is one hairline whatever it is doing, so six turns round a pole are
   not readable as six.
8. The lap bar says "Gates 29" for 14 gates and 29 passes.

**The idea: pieces stand in the room, passes are moments in the lap.** The room shows
pieces, a strip along the foot shows passes in flying order, and pointing at either lights
the other. At most one pass is in focus at a time, and everything about a pass that is not
in focus is quiet.

**The room at rest** (nothing selected, nothing under the pointer):

- One number tag for each opening that is flown, not for each pass: its first number, and
  a count when there is more than one ("2 x6"). A pole flown six times is one tag.
- One arrow for each direction an opening is flown in, at the size of the opening and not
  wider than it, and side by side when it is flown both ways, so an arrow is never under
  another.
- A pole or cone's scoring squares are outlines only, with no panes.
- The racing line is as it is.

**In focus.** The pass whose number is under the pointer (a tag, a chip on the strip), or
the one the card is showing. Its arrow is bright and its two panes (green in, red out) are
drawn; the stretch of racing line from the pass before it to the pass after it is drawn
thick and bright; every other arrow, outline and line is drawn back to a third; the
neighbouring pieces keep their tags and the others fade. Selecting a piece puts its first
pass in focus, and the card's pass chips move the focus.

**The lap strip,** a row along the foot of the room above the lap bar: one chip per pass
in flying order, the number and a small mark for what kind of piece it is, waypoints as
small dots between. Hover a chip and the pass lights in the room; click it to pin the
focus and select the piece; drag it to move the pass in the order; Delete takes that pass
out, and only that pass. When a chip is in focus the other chips of the same piece are
ringed, which is how a reused piece is found on a strip without a colour to remember, and a
chip with a warning has a red dot. It scrolls on a narrow screen and keeps the focused chip
in view. The last chip is Fly order, the tool below. For a keyboard it is one tab stop, the
arrow keys, Home and End walk it, and Delete takes the pass out; on a touched screen every
chip is 44 px, and a waypoint's dot has a 44 px box of its own with the dot drawn in it. An empty room has no strip, because a lone plus is a tool for a lap with nothing in it.

**Fly order, a tool (O).** Armed, a click on a piece adds a pass through it at the end of
the lap, and clicking the same piece again is the second pass. That is the whole way to
fly a gate again. The pass is in focus at once, so its arrow, its stretch of line and its
chip show what the click did. On a stack the opening is the one under the pointer.
Backspace takes the last pass off and Escape puts the tool away (on a touched screen the
plus chip, tapped again). The direction is worked out from the line, as it is for every
pass (faces.js), and Reverse on the card changes it. The coach line says so in words only,
because a button floating over the room takes the tap meant for the piece beside it (found
when a tap wiped a lap); the lap bar has a Start over while the tool is in the hand and
there is an order, which empties it in one undo step, so a lap can be clicked out from
nothing. With a tool armed the numbers and marks let a press through to the piece under
them, and the card is not shown.

**The card,** for a piece flown more than once: "Tall pole, flown 6 times", a row of its
pass chips with the focused one filled, and under it what is about the focused pass alone
(Place in order, Other side or Reverse, Remove this pass), then Fly again, then what is
about the piece (position, height, Replace with, Copy, Remove piece). Remove says how many
passes it takes with it. The card is about the pass that was chosen: passing over another
pass, on the strip or in the room, lights it in the room and changes nothing on the card.

**Words.** The lap bar says "Passes 29 on 14 pieces" when a piece is flown more than once
and "Gates 6" when none is. The order list wraps a name onto two lines on a whoop canvas.

**What does not change.** No document field is added and the schema stays 3. Nothing in
`tracks/json`, the presets, the maps or the reader is edited, and the differential run
against the pre-work reader, the GIF exporter and the game course are the proof that no
existing track has moved. It is the whoop canvas only: the 5 inch and freestyle canvases
stay pixel identical. The plan view says the same thing as the room (a tag for each
opening with its count, an arrow for each way an opening is flown, the pass in focus lit and
its stretch of line bright), built in the same slice.

**Not in this design.** A colour per piece (a hue to remember is what the ring is for,
and it fails for a colour blind pilot), animating the lap, and any change to how a pass
is stored.

## 4. Parts, and a club profile

### 4.1 Why a profile, and the switch

I loaded their public track "Cream First #1" (6 by 6 by 3 m, 16 pieces) into our
modules in a scratch script. Thirteen of the 16 pieces map directly: nine 750 mm
gates, one 600 mm gate and three poles. The two cube gates map only as
waypoints, and the banner not at all. Our engine then flags what RaceGOW
forbids: nine gates over the 28 in maximum (750 mm is 29.5 in), one under the
24 in minimum, mixed sizes, and a 5.55 by 5.25 m footprint against RaceGOW's
1.5 by 2.25 m envelope. It is a different spec. Whoop tracks in clubs and
events come in more than one, and our canvas holds only RaceGOW's, by design:
the palette is RaceGOW's vocabulary (`MICRO_PALETTE_ORDER`) and the one gate
preset is 28 in (`MICRO_GATE_PRESETS`).

So a track gets a `spec` field: `racegow` (the default, and what every document
without the field is) or `club`. It is additive and needs no schema version
(4.5). Under `racegow` nothing changes for anyone. Under `club` the gate size is
free in millimetres with the RaceGOW chips as presets, the room size is data, and
the `rg-` checks become notes the author can turn on. The general checks
(reversal, tight corner, coincident, underground, element out of the field)
stay. Room size as data needs the snap-back in section 1 item 9 fixed first: the
micro migration must run once, on a document that still carries the old 5 by 6
room, and not on every read. The board's `layoutHash` covers field, elements and
sequence, so a different room is a different layout, which is right.

### 4.2 The parts

| Part | Stored as | Sim and scoring | Size |
| --- | --- | --- | --- |
| Free gate size | `clearW` and `clearH` in the document already; `builtDims` passes them through | none | S |
| Table, chair | New obstacle types, quarter turns by the existing `turnsOf` rule | Boxes and capsules, axis aligned | S each |
| Banner | Obstacle: a thin panel with artwork from the course's own logo slots (`branding.logos`, five slots, no new image path) | One axis aligned box, at quarter turns | S |
| Hoop | Aperture with `shape: circle`, one plane like every other gate | A ring of 16 to 24 capsules in `obstacle()` (`scene.js`), a circle test in the pass check | M |
| Hex gate | `shape: hex` | Six capsules, a hexagon test | M |
| Cube gate | Six ordinary face gates in a group (4.3) | Twelve edges as capsules, each used face scored as a station | L |

The pass test is rectangular today: `openingHits` (`race.js:547`) clips a swept
segment against `halfW` and `halfH`. A circle and a hexagon need their own tests
inside the same swept segment. The plan drawers (`share/plan.js` here,
`planFromDocument` on the board) draw each new shape.

### 4.3 The cube decision

A cube is flown in through one face and out through another, so it has openings
in three planes. There are two ways to store one.

- **Per opening frames.** `aperturesOf` returns openings that each carry their
  own plane. Every consumer assumes today that all the openings on a structure
  share one ("Every opening on one structure shares it," `model.js:694`).
  Counted: `aperturesOf` has 34 call sites in 10 files, `apertureFrame` 11 in 7,
  `elementNormal` 8 in 5, across the builder and the sim.
- **A group of ordinary face gates.** Six elements share a group id. Each is a
  square aperture with its own yaw and pitch (the top face is a dive gate, pitch
  90 degrees), headings pinned, and `unbuiltSides` used so each of the twelve
  edges is built once: each face's four sides land on four edges, and each edge
  belongs to exactly two faces. One palette item makes the group, and it selects,
  moves, turns and deletes as one. A pass "in through the top, out through the
  right" is two sequence entries on two faces, with the entry signs the existing
  derivation already produces.

Recommended: the group, after a spike in Stage 4 that flies one cube, top then
right, in Node through the real `Race`. Its costs are six elements in the
document for one cube, a group concept the builder does not have, and an auto
rule that has to leave all six faces alone (they are all pinned).

*Built as recommended, 2026-09-30 (PROGRESS.md, "the cube").* The spike flew top then right through
the real `Race` and it credited the order and refused the reverse and a flight beside it. Two things
differ from the paragraph above. A cube on the floor is five faces, not six: the sixth would be under
the floor, and a cube lifted by half an opening and a pipe has it. And the game needed one small
addition the plan did not see: the world builds a gate for every pass and for nothing else, so the
faces of a cube that no pass goes through were missing from it. The course now lists the faces of a
group that no pass goes through (`loose`, in `src/game/trackdoc.js`) and the scene builds them as
solid pipe with nothing to score. A track with no group has no such list, and the census of the real
game's colliders on the eight shipped whoop tracks and ten saved five inch tracks is identical to the
code before this work.

### 4.4 Physics: none planned

The plant takes any static solid as `sim_world_box` (axis aligned) or
`sim_world_capsule`, and the world holds 49,152 shapes (`world.c`). Gates are
capsules there today: "Capsules (gates, trees, the race field) are solved segment
to box." Every part above is built from those two, so no plant change, no module
ABI change and no build change is planned.

Two things would bring a physics question back to the owner. A table or banner at
any heading needs a turned box, which the ABI does not have (`sim_world_box` takes
two corners). FREESTYLE-MAPS-PLAN section 10 proposed one as P1, this plan does
not depend on it, and I did not check whether P1 is still planned. And a collider
count that costs frame time on the low tier would be measured first.

### 4.5 The document and the other repositories

**Additive, no version bump.** Freestyle maps (`mode`) and `unbuiltSides` were
added without one (`schema.md`, Versioning). An old tab reading a document with a
part it does not know drops that element and lists it in its repairs
(`normalize()`), so a shared track can lose its cubes in a tab that has not
reloaded. `fresh.js` already makes a reload fetch the deploy's own scripts.

**The board** (`WebFPVSimulator-LeaderBoard/src/validate.js`) needs a change
before the simulator lets anyone publish these parts:

- `PLAN_APERTURE` (line 338) lists the gate types, and `stationsOf` and
  `gateCount` read it. A hoop or a cube face would not count as a gate or a
  station, so `trackLengthOf` would come up short and the lap floor `lapFloorOf`
  would soften on those tracks. The board's own comments call a shorter length
  "the safe direction", but it weakens the check.
- `planFromDocument` (line 607) draws the card's plan and needs the new shapes.
- The board's `src/selftest.js` pins `stationsOf` and `trackLengthOf` and gets the
  new cases.
- `schemaVersion` stays 3 and line 795 accepts 1 to 3, so nothing is refused.

The board deploys first, then the simulator. The board's thumbnails are the
simulator's own `orbit.html`, so they draw the new parts as soon as the simulator
does. The simulator's `share/plan.js` has its own per type table and gets the
same change. The landing page reads presets through `courseFromDocument` when
`scripts/bake-room.js` runs, so nothing there changes unless the demo preset
does, and `npm run lint:page` says so.

## 5. Tools for a real room, and ways out

### 5.1 Distances and the build sheet

The live readouts in 3.3 cover the common case, and a ruler (two clicks, a label
in inches and millimetres) covers the rest. It is not stored in the track,
because a layout fact belongs in the build sheet and not in a drawing.

The build sheet is a page for the print dialog, made from the document: the plan
with every gate's centre measured from a chosen corner in inches and millimetres,
with its height and heading, and a parts list of pipe by length (RaceGOW's one
section length, 26.5 to 27.25 in, builds every element: `PIPE_LEN_MIN`,
`PIPE_LEN_MAX`) and fittings by kind. It reads the same geometry the room draws,
including `unbuiltSides` and the bars shared between stacked levels.
`buildsheet.js`, pure. It answers what their tape measure is for, and "what do I
buy".

### 5.2 Screenshot and share link

A PNG of the room view, one button. The share link carries the track in its
fragment, `#track=`: the document deflated and base64url encoded, which never
reaches a server. Measured on the shipped whoop presets it comes to 1,594
characters for Track 1 and 2,488 for Track 6, so it fits a chat message. It opens
as a copy ("A shared track. Editing makes your copy."), which is what their view
only link is for. It reads with `DecompressionStream` where the browser has it.
The existing `?track=` link (JSON in the query, decoded twice in
`docFromLocation`, finding 26 of the sweep) keeps working and is fixed in
Stage 0.

### 5.3 Import

Their track JSON, by file or paste: `{ arena, gates: [{ typeId, x, z, height,
rotY, dir, prop }], measurements }`. The mapping worked in the scratch script:

- **Floor position:** x is kept and y is the arena depth minus their z. Their plan
  has z down the screen and ours has y up it, so getting this sign wrong turns a
  converted course the wrong way.
- **Heading:** their `rotY` minus 90 degrees, pinned.
- **Height** becomes sill height. Gates at one spot with different heights become
  a stack, flown in their order.
- **Poles** become poles. Cube passes became waypoints until the cube existed; a cube is now a
  cube of gates, flown in at the face the file names first and out at the second (Stage 4).
  Tables, chairs and banners were dropped and listed until Stage 4, and are ours now.

It reports what it kept, approximated and dropped, as our other importers do. Their
API sends no CORS headers, so a page on webfpv.org cannot fetch a link; importing
by link would go through the board and is not in this plan. The test fixture is a
synthetic track with the same shapes. The real "Cream First #1" belongs to whoever
made it and is not committed.

### 5.4 Ways out

- **glb** from three's `GLTFExporter`, and **USDZ** from its `USDZExporter`, both
  from the same pinned three@0.160.0 on the same CDN as lazy imports, like the
  addons the simulator already loads (`fresh.js`). CLAUDE.md wants a dependency
  justified in PROGRESS.md first, and these would be. USDZ opens in Quick Look on
  an iPhone or iPad in AR at 1:1, so a pilot laying out a real track can stand in
  it before cutting a pipe. That is the reason to do it.
- **VR walk-through.** Theirs is about 250 lines. Later.
- **Other simulators' formats.** Theirs writes two. Neither is worth it now. The
  formats are reverse engineered from the games, as their comments say (one prop
  catalogue "is not readable from the game files" and was mined from
  3,369 workshop tracks), a game update can break them, and they send a pilot to
  another simulator. We already read `.trk` files
  (`tracks/convert.mjs`), so the format knowledge exists in house. Decision 8.

### 5.5 Licence

Their code is MIT, which is GPLv3 compatible, so porting is allowed if the MIT
notice stays with what is ported. This plan ports nothing: the gestures, panels
and model are ours and differ in kind. If exports are chosen, what is worth
porting is data and format code (the prop catalogue,
`js/export`), and it would carry the notice. Their banner artwork (Devon and
Cornwall flags, Menace, DRD) is not covered by the licence and is not ours to use.

## 6. Stages, in build order

Sizes are by what a stage touches, not by calendar. S is one module and its tests,
M is several builder modules, L reaches the simulator or the board as well.
Calendar estimates would be guesses. Each stage leaves a whole tool, so the owner
can stop after any of them.

**Stage 0. Coverage first, and the repairs (S).** Each item gets a test written
first and shown failing, then the fix, proved by a mutation check as earlier
sessions did: disable the fix and watch the named test fail.
1. Undo records only real changes (`History.commit` ignores `modifiedUtc`, or
   `settle` touches only on a change).
2. The micro migration runs once, on a document whose field is still the old 5 by
   6, not on every read.
3. A gate dimension of zero or less is repaired on read, with a note.
4. Import and a `?track=` link ask before replacing a canvas that has work on it,
   and the `?track=` link is decoded once.
5. Fit and every load frame the track (the envelope when empty), in both views.
6. A pane across every opening, and labels that do not cover the gate.

Checks: additions to `src/trackbuilder/selftest.js` (`check:clip`). Exit: green
with the new assertions. The owner has nothing to fly but the framing.

**Stage 1. Build in 3D (L).** 3.1, 3.3, 3.4, 3.6 and 3.7 on the whoop canvas, mouse
only, with the Bend line toggle.
Checks: a new `scripts/builder-flow-check.js` (`npm run check:builder`), driving
the builder in headless Chromium through `tests/lib/page.js` as `device-check.js`
does. It builds RaceGOW5 Track 1's layout from an empty canvas with pointer events
only, at projected screen positions, and asserts that the document matches the
preset's gate positions within one inch, that the undo count equals the gesture
count, and that there is no toast and no console error. A second run drags a gate
in a 34 element track and asserts the fast path scene equals a rebuilt one. A third
runs with Three.js blocked and asserts the plan still builds. `shots.js` captures
before and after on the same seeded document.
Exit: the checks green, and the first track test below.

**Stage 2. Help while placing, and touch (M).** 3.5 (quarter turn at placement,
magnets, the Row tool, Replace with), warnings on the piece, the ruler, touch
gestures, the tablet layout.
Checks: selftest for `snap.js` (magnets never snap to an illegal spot, Alt turns
them off, snapping twice changes nothing more), the flow check with touch events,
and `device-check.js` extended with the whoop canvas at 820 by 1180 and 1024 by
768. Exit: green, and a hand test in a tablet sized window.

**Stage 3. Tools for a real room (M).** The build sheet, screenshot, share link,
and import of their JSON for the parts that map today.
Checks: the build sheet for a preset against a hand count, the share link round
trip byte identical through `normalize`, importer mapping tests on a synthetic
fixture, and `micro:check` unchanged.
Exit: green, and the owner prints Track 1's sheet and builds from it, or says why
not.

**Stage R. A piece flown more than once (M),** 3.8, on the owner's ask after Stage 3.
A pure module first (`passes.js`: tags, directions, focus, the stretch of line, adding a
pass), then the room, the strip, the card and the tool, then the plan view.
Checks: selftest for `passes.js` on the shipped tracks and on hostile documents; the flow
check drives the strip, the tag, the card chips and the tool with real events on Track 8
and on a track laid from nothing by clicking a piece twice; `device-check.js` for the strip
and card at finger size; the differential run against the pre-work reader on every shipped
document (identical), the eight GIFs (byte identical), and the 5 inch and freestyle
canvases (pixel identical). Exit: green, and the owner clicks a lap out on Track 8's
pieces.

**Stage 4. The parts (L),** the club profile dropped (decision 3, 2026-09-30). The order is
table, chair and banner (S each); hoop and hex (M); the cube spike; the cube (L). Every part
lands as one vertical slice: element definition, plan and room drawing, `trackdoc.js`, the
mesh and colliders in `scene.js`, the pass test in `race.js`, `schema.md` and the checks. The
board's `validate.js` is the one piece left out until decision 6 is answered, and the
simulator refuses to publish a part the board does not know.
Checks: `micro:check` already places every element the micro palette offers,
writes it, reads it, warns, builds a course and draws a plan, so a part added to
the palette is exercised end to end by it. It gains a flown lap through each new
gate shape in Node. `check:clip` gains a hostile input round for each new type
(`normalize` never throws). The board's own `npm test`. `micro:check` and
`whoop:gates` prove the RaceGOW field did not move.
Exit: green, and the owner flies a cube, a hoop and a table.

*Progress, 2026-09-30.* Table, chair and banner are in (PROGRESS.md, "Stage 4 begins"): one
list of boxes for each, in `src/props/room.js`, drawn and solid and warned about from that list; the
physics needed nothing, and `npm run check:room` flies the real module through each to say so. The
board's refusal is in `publishTrack`. Hoop and hex are in too (PROGRESS.md, "a hoop and a hex gate"): an
opening's shape inscribed in its rectangle, `src/props/aperture.js` for the arithmetic, the pass test clipped
exactly against the shape, the frame a run of capsules from one function that the game, the room and a
flight check all read; `check:room` flies them. The cube is in too (PROGRESS.md, "the cube"): five
gates that share a `group`, a tool that lays them in one click, selected, moved, turned, copied and removed as one
piece, flown in at the back and out at the front unless the Fly order tool says two other faces, and built whole in
the game (counted in the real game's collider set). Decision 6, the board, is still open, so publishing refuses
all six parts. Left of Stage 4: nothing but the owner flying it.

**Stage 5. Ways out (optional),** in the order of 5.4.

**Through every stage:** `check:clip` (990 checks today), `micro:check`,
`whoop:gates`, `lint:responsive` and `lint:preload` stay green. New modules go
through `npm run gen:preload`. Pictures from `shots.js` stay out of git.
`npm run verify` is not needed unless something changes the physics, the plant, the
module ABI or the build; if Stage 4 finds that it does, it stops and comes back to
the owner.

**The first track test.** Give a person who has used neither tool a picture of a
finished layout: six gates and two poles on a floor plan with distances. Ask them
to build it in each tool, in a random order. Record the time to the first placed
gate, the time to the last, every undo, every time they stop, and what they say.
Targets, to be argued with: the first gate placed in under 15 seconds without
instruction, the whole layout in under 5 minutes, and no undo that comes from a
mistake about what a control does. Their tool is the control, and the difference
is the number that matters. The owner running it on themselves counts, and is the
acceptance for Stage 1.

## 7. Approvals, and risks stated early

CLAUDE.md asks that a change to the physics model's shape, the module ABI or the
build be put to the owner first.

- **Physics model, module ABI, build:** none planned (4.4).
- **Reversing the round 18 brief.** The plan view stops being the tool on the
  whoop canvas. It is not a CLAUDE.md rule, but it is the biggest change to what
  the builder is, so it is decision 1.
- **The board.** Changes in the LeaderBoard repository and a deploy order.
  Cross repo work is the owner's to allow (decision 6).
- **Three.js addons** from the same pinned CDN: justified in PROGRESS.md before
  anything is added.
- **Unchanged:** the 5 inch and freestyle canvases. Each stage gets its entry in
  PROGRESS.md, and `schema.md` records every stored field.

Risks:

1. **Small things are hard to click in 3D.** The panes and fat tubes, and a flow
   check that clicks at the edge of an opening.
2. **Touch.** Two finger gestures are where pointer handling goes wrong: the
   smallest state machine that works, and a test.
3. **The room carrying the whole tool.** A slow or blocked CDN falls back to the
   plan, and the flow check runs with Three.js blocked to prove it. Keeping two
   surfaces true is covered the same way: both call the same host methods and the
   same `snap.js`, and the flow check drives both.
4. **Line bending moves behind a toggle,** which changes a habit for anyone who
   drags the line into a waypoint. It stays one toggle away on the whoop canvas
   and as it is on the 5 inch.
5. **The premise.** "Theirs is easier" comes from the owner's report and from
   reading their code, not from a timed comparison. The first track test is the
   check.
6. **Old tabs, and the board window in Stage 4** (4.5).

## 8. Decisions for the owner

1. **Build in 3D on the whoop canvas, with the plan as a camera and a toggle**
   (recommended). Or keep the plan as the tool and fix only its words, framing
   and picture: cheaper, and it does not answer "understand", because the plan
   still shows a gate as a bar.
2. **Whoop first, the other canvases unchanged** (recommended). The 5 inch could
   follow once the whoop result has been flown.
3. **Add the club profile (`spec`), default RaceGOW** (recommended). Or stay
   RaceGOW only, and drop Stage 4 and the import of their parts.
   **Answered 2026-09-30, "no profiles":** RaceGOW only. There is no `spec` field, no free
   gate size and no room size as data, and Stage 4 is trimmed to the parts (decision 4).
4. **Which parts, and how a cube is stored.** Table, chair, banner, hoop, hex,
   cube in that order, the cube as a group of face gates after a spike
   (recommended). Or per opening frames, about 60 call sites.
   **Answered 2026-09-30, "add these elements":** the six parts, in that order, the cube as a
   group of face gates after a spike. With no profile they follow RaceGOW's own rules where a
   rule applies to them (a gate of a new shape is a gate of RaceGOW's sizes), and the furniture
   is held to the general checks only.
5. **No plant, ABI or build change.** Parts from axis aligned boxes and capsules,
   tables and banners at quarter turns (recommended). Or a turned box, which is P1
   of FREESTYLE-MAPS-PLAN section 10 and a physics decision.
   **The owner asked on 2026-09-30, "what changes do you want to make?"** None to the plant,
   the module ABI or the build, and the evidence is in the entry of that date in PROGRESS.md:
   every part is a list of boxes and capsules (`src/props/parts.js`), placed by
   `placeSolids` and uploaded through the `sim_world_box` and `sim_world_capsule` a barrier
   already uses. What would bring the question back is in 4.4, and is not needed.
6. **The board.** Approve the LeaderBoard change, deploy it first, and add the
   types without a schema bump (recommended). Or bump to 4, which makes an old
   board refuse instead of miscount, at the cost of touching every reader of the
   version.
   **Not answered as of 2026-09-30.** The board repository is not touched, and the simulator
   refuses to publish a track that holds one of the new parts until it is.
7. **Keep the palette letters, and put RaceGOW's diagram colours on the openings**
   (recommended). The pictograms carry the meaning and existing habits keep
   working. Or re-key by number, or keep the current cream for everything.
8. **Ways out.** glb and USDZ in Stage 5 (recommended), VR later, exports to
   other simulators not now (recommended). Or all of them.
   **Answered 2026-09-30, "7 no need for that other stuff for now".** Read as: no exports and
   no other work beyond the parts. Stage 5 is not started, and the palette keeps the letters
   and the colours it has. If the owner meant the board (6) and not the exports (8), only the
   board line above changes.
9. **Sharing.** The fragment link in Stage 3 (recommended). Private drafts on the
   board need accounts or a key scheme, and the board's own rules say nothing is
   ambiently authenticated, so they are not proposed.
10. **Three.js loads at once on the whoop canvas, with the plan as the fall back**
    (recommended).
11. **Nothing ported from their code** (recommended). Or port the exporters with
    the MIT notice.
12. **The test.** The first track test as Stage 1's acceptance (recommended), and
    who else runs it.

13. **A piece flown more than once (3.8).** The tag shows the first number and a count,
    the rest on hover (recommended). Or every number always, as now, or only a count.
14. **Fly order appends at the end of the lap** and the strip and the card move a pass
    (recommended). Or a click inserts after the pass in focus.
15. **Fly order's key is O, and Start over empties the order** in one undo step
    (recommended).
16. **The lap strip stays beside the Flying order drawer** (recommended). Or it replaces
    the list on a whoop canvas.

## 9. Not in this plan, and what it is built from

Not in this plan: the 5 inch and freestyle canvases; accounts, cloud drafts or a
shared server catalogue of gate types; the whoop's flight model or any physics;
live collaboration; retiring the 2D view (that waits until the owner has flown the
result); private or unlisted tracks on the board.

**Read.** Their served app end to end (25 files) and their public API responses.
The builder's input handling, host operations, panels, `faces.js`, `elements.js`,
`model.js`, `schema.md` and `racegow.js`. The simulator's `trackdoc.js`, gate
builder, collider and world ABI, and `race.js`. The board's `validate.js`.

**Run.** Both tools rendered in headless Chromium at four window sizes, with the
first load counted. The four defects in section 1 item 9, reproduced with real
pointer events or a real import. The builder's selftest: 990 passed, 0 failed. A
scratch conversion of their public track into ours, not in the repository. The
cost of the 3D rebuild, and the size of a share link for each whoop preset.

**Not checked.** Which tool is faster to build with: no timed build was done in
either, and that is what the first track test is for. Whether the hosted site is
the MIT repository. Whether P1, the turned box, is still planned. Touch behaviour
on a real device. Their server: it was read, not written to.
