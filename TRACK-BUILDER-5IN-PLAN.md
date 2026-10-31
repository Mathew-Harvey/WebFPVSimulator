# The 5 inch builder: build in 3D, and speak the track's language

A plan for the owner, 1 October 2026. It is written to be argued with. Section 8
lists the decisions it takes on the owner's behalf, and how to reverse each one.

The owner's catalogue of manoeuvres and elements of 2 October 2026, which this builder was
then taken further to build, is in TRACK-BUILDER-VARIANTS-PLAN.md.

Status is kept at the top and updated as stages land. As of 1 October 2026 every
stage in section 5 has landed and the acceptance run in section 7 passes: the
Nationals qualifying track is built from an empty canvas with the pointer and the
keys in 55 gestures and matches the one that ships. Section 10 says what was done
against this plan and where it differs.

## 0. What was asked

In the owner's words: "we need to overhaul the 5 inch track builder. I tried to
build the attached track and found issues. I couldn't get a gate with a flag on
top and define easily the flight path to spiral down, the gates beside each
other were hard to place. I gave up getting a spiral down with the flagged gate.
the wall with the flags on top I had to hack together a gate. I couldn't get a
gate with double top flags at all."

Four asks: a gap analysis of every element that cannot be made easily, with a
design for each fix; a UI and UX review ("the current building system is hard,
the grid isn't easily read and the top down building makes it hard to
understand"); a plan to improve the builder, and the work done; and, at the end,
the attached track buildable very easily.

The attached track is the 2026 Mission Foods Australian Drone Nationals Official
Qualifying Track, designed by the 2025 National Champion, Wilf. It is a plan of
a 40 by 29 m layout on a 5 m and 1 m grid, with a rules box (the hurdle at least
1 m high and its flags 4 m apart, the up gate at most 45 degrees with its lower
edge at least 1.5 m up, best three consecutive laps) and a materials list: 7
gates, 9 flags, 1 hurdle, 1 dive gate.

This is the same complaint the owner made of the whoop builder on 29 September
("i find the top down buidling of ours very hard to understand and build a
track"), and WHOOP-BUILDER-PLAN.md answered it for the whoop canvas: build in 3D,
keep the brain. The 5 inch canvas never got that. Most of this plan is bringing
it the same way, plus the parts the diagram needs that neither canvas has.

## 1. The diagram, decoded

The plan shows each piece drawn in oblique: its height runs along its own normal
on the page, so a gate looks like two long white bars with a red board across
them and the flags at the far ends. Read that way, the diagram's own
dimensions all land on whole metres, which is the check that the reading is
right: 13 + 10 + 15 = 38 down the left, and 13, 15, 20, 29 and 5 across the
bottom. The counts agree with the materials list (7 gates, 9 flags, 1 hurdle,
1 dive gate).

Positions are metres in the diagram's frame: x east from the left dashed line,
y north from the bottom one. The gates stand about 2 m between uprights on the
page.

| Piece | Where | What it is | Flags |
| --- | --- | --- | --- |
| Start and finish gate | 15, 14, faces east | A plain gate. The lap's first pass and its close. | 0 |
| Lower left gate | 0, 14, faces east | A gate flown twice: through, round the flag, through again. | 2, one on each upright |
| Left middle gate | 0, 24, faces east | A spiral down anticlockwise round the flag on its north upright, then one pass east. | 1 |
| Wall | posts at x 13, 15, 17, 19 on y 38 | Three gates side by side sharing four posts, entered round the flag on the east end post and flown as a weave: the east bay north, the middle bay south, the west bay north. | 1, on the east end post |
| Right gate | 25, 30, faces east | A spiral down clockwise round the flag on its south upright, then one pass east. | 2 |
| Up gate | legs at x 27 and 29 on y 38, leaning north | Flown north and up, then the line goes over the top and back west to the wall. The rules call it the up gate and the materials list the dive gate: one piece. | 0 |
| Hurdle | x 20 to 24 on y 23 | A board at least 1 m high, flown over, flags 4 m apart at its ends. Not a gate: nothing scores on it. | 2 |
| Turn flag | 0, 0 | A flag the line turns round. | 1 |

Lap order, from the start gate: start, over the hurdle, right gate (after its
spiral), up gate, round the wall's flag and the wall as a weave (east bay, middle
bay, west bay), left middle gate (after its spiral), lower left gate, the turn
flag, the lower left gate again, and back to the start. That is nine passes
through gates, one turn round a flag, two spirals down round a gate's flag and
one turn round the wall's, for 7 gates, 9 flags, 1 hurdle and 1 dive gate.

**Corrected on 2026-10-01.** The first reading of this table had the right gate
and the left middle gate as loops back through the gate, two passes each, the
left middle gate flown west, and the wall flown south, north, south. The owner:
"the spiral downs around the flag then through the gate are just 2 passes
through the gate, the triple side by side gate is not correct entry face." Read
again: every gate on the plan is drawn folded flat towards the side it is flown
out of, so all the single gates are flown east, and the line round a flag on top
of a gate is a spiral down round that flag that ends in the one pass; the wall's
flag is on the end the line comes round first, so its first bay is flown north.
The table above is the second reading, and section 10 says what changed.

The spirals are a metre or so from a flag, which is the diagram being brutal on
purpose. The builder's curvature warning would say so, so it knows the figure's
waypoints by their names (decision 13).

The track runs from about x minus 2.6 to 30 and y minus 1.3 to 42.4 once the
loops are counted, so it is placed 5 m in from the field's corner, in a field
about 45 by 55 m.

## 2. What the builder says today, piece by piece

"Can" means the document and the game can hold it. "Click" means a person can
make it by pointing. The first is the model, the second is the tool, and the
gap is almost always the second.

I checked this by building the track from a script with today's primitives
(`mission0` in the session scratchpad, not committed). It came out as 12 passes
and five warnings: two `unsequenced` (the hurdle's flags), two `reversal`, and a
0.13 m `tight-corner` where the right gate is flown twice in a row. So the
model holds most of the track. What it cannot do is let a person get there.

| What the track needs | Model | Click | The gap | The fix |
| --- | --- | --- | --- | --- |
| A gate with a flag on top | yes, `flaggedGate` | no | The Header flag chooser (left, right, both, on top) is nine blocks down a 1424 px inspector seen through a 291 px window, about 960 px below the top. | Flags are one row of chips on the gate's own card, and a gate can lose or gain its flags there. |
| Two flags, one on each upright | yes, `flagSide: both` | no | The same buried chooser. This is the "double top flags" that could not be found. Also the mast stands on the header board's end, 0.43 m outboard of the upright, because the board is wider than the gate. | The chips, plus a plain gate dress whose board ends at the uprights, so the flag is on the post. |
| Gates side by side sharing posts | yes, `unbuiltSides` | no | One gate per click on a 1 m grid, a 1.56 m pitch the grid cannot hit, and nothing that sets the shared posts. The whoop canvas has a Row tool, but it is whoop only, plain gates, 30 in, three at most. In the world every gate carries 0.42 m sleeves and a 2.67 m header board, so a row of today's gates overlaps itself. | A Wall tool: drag along the floor, get N bays at the pitch that makes the shared posts meet in the world, the flags where you choose, and the whole wall moves as one. Plain gate dress so the boards sit end to end. |
| Flying the wall as a weave | partly | no | The face rule reads a direction off the chord to the next gate, and along a wall the chord is square to every gate, so every pass is undecided or the same way. A weave needs each pass flipped by hand. | When consecutive passes go through gates side by side facing the same way, they alternate. The first takes the side the line arrives from. |
| A hurdle | as a barrier, plus two flags | no | A barrier has no flags, the two flags stand outside the order and raise two `unsequenced` warnings, and nothing pins the line over the bar. The 2022 GQ import modelled one as a bare barrier. | A Hurdle tool: a low board with masts at its ends, one piece, with the line pinned over it. No new document type. |
| An up gate | yes, `diveGate` with a tilt | awkward | The dive gate defaults to flat, 4.57 m up and 7 by 6 ft. An up gate is 45 degrees or less, 1.5 m up at the lowest edge. Both are in the inspector under Tilt and Sill height, and nothing says which numbers are the rule. | An Up gate on the palette with those numbers. |
| The same gate flown twice | yes | no | There is no Fly again on the 5 inch canvas: it is whoop only. "Add to the track" appears only for a gate that is not in the order. The lower left gate and the right gate cannot be made. | The Fly order tool and the lap strip, on the 5 inch canvas. |
| A loop or spiral round a post | yes, as waypoints | no | Only by dragging the line out into waypoints one at a time, and two passes of one opening in a row put two knots in one place (0.13 m radius). Spiral down exists only for a triple stack. | Round the flag on the card of a pass: left or right, a spiral down round the flag on that upright and then the pass, written as ordinary waypoints you can drag. (It was a loop after the pass until the owner's correction; section 10.) |
| A turn round a flag | yes, `flag` marker | yes | None. | None. |
| Dimensions as drawn | yes | awkward | X and Y are fields in the same buried inspector, the grid is a 1 m wash with a 10 m major, and there is nothing that measures. | A grid that reads (1 m, 5 m with numbers), live distances, a Ruler, and coordinates on the card. |
| A field the size of the track | yes | awkward | The default field is 60 by 40 m. This track needs about 47 m of depth. | A field control that says what the track needs, and Fit that frames the track. |

## 3. UI and UX review

Each finding was seen in the running page (headless Chromium, 1600 by 900) or
read in the code, and says which.

1. **The view that can build cannot be read.** A gate is a bar 25 px wide on a
   60 by 40 m plan, a flag is a 4 px dot, and the racing line is a sparse dash.
   The track is a few marks on a dark rectangle. (Seen.)
2. **The view that can be read cannot build.** The 3D view selects and drags
   height, but a press on the ground orbits, nothing is placed in it, and at its
   opening distance a gate is 40 px and its flags are not visible. (Seen, and
   `view3d.js` header.)
3. **The grid does not read.** The one metre lines are 10 percent white on navy
   and the ten metre lines 22 percent. The competition diagram's own grid is 1 m
   and 5 m, with the 5 m lines heavy. The ruler labels step by 5 and 10 and the
   field has no labels inside it. (`view2d.js` 1015 and 83.)
4. **The inspector is a 291 px window onto a 1424 px form.** Every control a
   flagged gate has is in one scrolling column: name, size presets, X, Y, yaw,
   tilt, five dimensions, four frame sides, the header flag, then its place in
   the order. There is no scroll cue. (Measured: scroll height 1424, client
   height 291.)
5. **A control the track needs is hidden.** The flag chooser, with the "both"
   that was asked for, exists and works. It is the single most important thing
   this report found, because it means the "double top flags at all" was not a
   missing part but a missing signpost.
6. **The model's words are on the buttons.** Yaw, Sill height, Flip face, and a
   flying order row with two buttons labelled `X` and `-`. (`ui.js` 536, 1708;
   the whoop plan, finding 4.)
7. **A gate cannot be flown twice.** Only the whoop canvas has Fly again, the
   strip, and the Fly order tool. The model allows it (`sequence.js` 46). One
   button was left off. (`ui.js` 1873, `app.js` 990.)
8. **The flight path has one control and it is the order.** Heading and face are
   derived from the chord to the neighbours. That is right for a flowing track and
   wrong for a wall, a slalom or a loop, where the chord is square to the gate or
   zero. There is no way to say "loop round this post".
9. **Gates turn by themselves.** A new gate takes the heading the line gives it
   and every edit re-derives it, so a layout that is square to the compass, like
   this one, drifts as it is built. (The whoop plan's finding 3, still true here.)
10. **The scale is not said.** The document holds the published sizes and the
    world builds every gate 15 percent larger (`GATE_SCALE`, `src/game/track.js`
    104). Nothing in the builder says that two gates which look 2 m apart will
    overlap in the world.
11. **It does not fit a tablet.** The same shared layout as the whoop: the
    drawing area is 0 px wide at 390 px and 320 px at 820 px. (The whoop plan,
    finding 8. Not re-measured here.)

What is good and stays: the document and the reader that never throws, the
derived racing line and its warnings, undo, autosave, branding, Publish, Fly this
track, the lap GIF and the board card.

## 4. The design

### 4.1 Principles

1. **A control the track needs is on the thing it controls.** Flags are on the
   gate, not in a form.
2. **What the diagram can say, the palette can say.** Wall, hurdle, up gate and
   flag gate are palette items.
3. **The flight path is clicked out, not derived and fought.** A person points at
   the gates in the order they are flown. The tool works out the rest, and the
   rest is changeable.
4. **Build where you can see it.** The 3D view builds, as the whoop's room does,
   and Plan is a camera angle.
5. **Compose from what exists.** No new document types. No new default `dims`
   keys on an existing type (the board's layout hash covers every `dims` key, so
   one would clear the times on every republished track that holds the type).
   Only optional fields that are written when set. No physics, module ABI or
   build change.

### 4.2 The parts

**Flags, as chips.** One row on the card of any gate, stack or hurdle: None,
Left, Right, Both, Top. Choosing one changes the piece's type where it must
(a gate and a flagged gate are two types, a stack and a flagged double likewise)
and keeps its place, heading, size and flying order. This replaces the buried
chooser, which stays in the inspector.

**A plain gate dress.** An optional `style: "plain"` on an aperture, written
only when set. It means: no printed sleeves, a header board exactly as wide as
the frame. The pennant mast then stands on the upright, because the board ends
there. Every existing gate is the MultiGP dress and is untouched. A new gate on
the 5 inch canvas is still the MultiGP dress unless it is made a wall bay or is
set plain.

**The Wall.** A tool, key `K`. Drag along the floor and the bays appear under the
pointer, two to six. It lays ordinary gates, plain, one `group`, the shared
uprights taken away with `unbuiltSides`, each facing across the wall. The pitch
is the world's: `GATE_SCALE` times one opening plus one tube, so that the posts
meet where the game builds them. The builder draws document sizes and the world
15 percent larger, so in the builder the bays show a gap of about a quarter of a
metre and in the world they meet. The Wall says so in its coach line. The flags
are a choice made while laying it (the same chips): none, either end, both ends.
The wall is one piece for select, move, turn, copy and remove, because a group
already is.

Publishing: the simulator refuses any `group` as a cube. A wall in which every
gate is in the flying order loses nothing when the board drops the grouping, so
the refusal is narrowed to a group with a gate that no pass goes through, which
is the cube. `partsTheBoardDoesNotKnow` in `src/share/board.js`, with its tests.

**The Hurdle.** A tool, key `U`. A barrier, low and thin (4 m by 0.1 m by 1 m by
default), with an optional `flagSide` and mast height on the barrier itself,
written only when the barrier has flags, so no existing barrier changes. The
flags are the same pennants a gate carries, at the ends of the board. One
element, one inspector, one colour on the plan. Not in the flying order, because
a hurdle is not a gate, but the Fly order tool pins the line over its middle with
a waypoint when it is clicked, which is how the lap goes over it.

**The Up gate.** A palette item, a `diveGate` with a 45 degree tilt, its lower
edge 1.5 m up and a 2 m wide opening, the rule in the diagram. A preset, not a
type.

### 4.3 The flight path

**Fly order.** A tool, key `N` (see 10: `O` is Ground logo on a field), on the 5
inch canvas as on the whoop. Click the
pieces in the order they are flown; click a piece again for another pass;
Backspace takes the last pass off. The lap strip along the foot shows the passes
and lights the gate when the pointer is on a chip.

**The weave rule.** In `faces.js`, where the chord to the neighbours is square to
a gate (or zero) the direction is no longer left undecided or set the same way:
when the previous pass is through a gate standing beside this one and facing the
same way, this pass goes the opposite way, and when it is the first of such a
run it goes away from the side the line arrives from. A wall then weaves when its
bays are clicked in order, and Reverse (X) still flips any pass.

**Round the flag.** On the card of a pass: None, Left, Right and Spiral down.
Left and right are as flown, and a side without a flag on it is offered and
refused with the reason. The line goes round the flag on that upright, clockwise
for the right and anticlockwise for the left, on a circle centred on the flag
where the world stands it and passing through the gate's middle, and the circle
ends in the pass. With Spiral down it is a whole turn more, coming down from over
the header to the opening; without it the line goes round the flag and straight
in. It is written as ordinary waypoints in the flying order before the pass,
each draggable, and the row shows the figure that is there, as Flags shows the
flags. Undo takes it away as one step, and pressing again makes it again.
Nothing is stored that the document does not already know. A wall's card has the
same row for its first bay, "Into it round the flag". (This replaced a Loop after
the pass, which came back through the gate a second time; section 10.)

### 4.4 Building in 3D

The room editor of the whoop canvas (`edit3d.js`, the card, the lap strip, the
coach line, the tags and arrows in `view3d.js`) becomes the 5 inch canvas's
editor too. The gate on `isWhoopRace()` splits in two: what is about building in
3D, which both classes get, and what is about RaceGOW, which stays. Of the 46
call sites most are scale safe. The ones that are not carry inch constants and
get metre ones:

| Whoop constant | 5 inch value |
| --- | --- |
| Row ghost 0.3556 m, pair slot 30 in | The wall's pitch |
| Magnet radius 3 in | About 0.5 m |
| Shift nudge 6 in, frame minimum 1.4 m | 5 m, 12 m |
| Turn step 90 degrees | 15 degrees, Alt for free |
| Card, coach and tags in inches | Metres, centimetres to hand |
| Camera radius 0.6 to 60 m | 8 to 140 m |
| Replace menu from the micro palette | From the 5 inch palette |

The canvas opens in 3D once Three.js has arrived and falls back to the plan if it
does not, as the whoop's does. The 2D plan stays, one key away (V), and is
improved (4.5). Freestyle maps and the whoop canvas are not changed.

### 4.5 A grid that reads, and a plan you can build in

Plan and room share one grid drawing: 1 m lines, 5 m lines heavier and numbered,
10 m lines heavier again, at a contrast that reads on the dark field. Gates are
drawn at their true width with a post at each upright and their flags as flags,
and hover shows the position of the pointer and the distance to the last gate.
The Ruler and live distances while placing come across from the whoop in metres.
X and Y are on the card. The field gets a Fit to track and a size row that
says what the track needs.

### 4.6 The Mission Foods track, as the acceptance test

It ships as a 5 inch preset, generated by a script from a short list (so the
numbers can be argued with), credited to its designer by name. No logos: they are
the sponsor's marks and not ours to ship. Then a browser check builds the same
track from an empty canvas with pointer and keyboard only, and compares the two.
See 7.

## 5. Stages, in build order

| Stage | What | Status |
| --- | --- | --- |
| 0 | Plan, baselines, this document | done (commit 5776370) |
| 1 | The parts: plain gate dress, barrier flags (hurdle), the wall layout, the loop (Round the flag since the correction), the weave rule, the narrowed publish refusal. Model, game, tests. | done (commit 70b89a5) |
| 2 | Flags as chips, Fly order and Fly again on the 5 inch canvas, the inspector put in order. | done |
| 3 | Build in 3D on the 5 inch canvas. | done |
| 4 | The grid and the plan. | done |
| 5 | The Mission track: preset, generator, the acceptance run, overlay. | done |
| 6 | Docs, schema, PROGRESS, preload, checks, push. | done |

Each stage ends green on `node src/trackbuilder/selftest.js` and is committed.

## 6. What does not change, and what could break

- `schemaVersion` stays 3. Every new field is optional and written only when set,
  so every existing document serialises to the bytes it did. The selftest checks
  that for the shipped presets and the ten saved 5 inch tracks.
- The physics, the module ABI and the build. Every solid added is a capsule or an
  axis aligned box through the existing calls. `git diff --stat vendor/betaflight`
  stays empty.
- The board service is not edited and does not need to be deployed first. The
  fields it does not know it keeps, serves and hashes, which is the right
  behaviour for new fields. A track with a hurdle shows it to the board as a
  barrier.
- The whoop and freestyle canvases. Their behaviour is the regression to watch:
  1773 checks and the whoop flow check are the net.
- What could break: the gate dress (a header board narrower on a plain gate);
  the weave rule (it changes the face of a pass nobody has pinned, in a layout
  with a gate flown beside another, so it is applied only where the old rule left
  the face undecided); and the room editor on a 60 m field (picking at a
  distance, camera ranges).

## 7. How it is checked

1. `node src/trackbuilder/selftest.js`, which runs in about three seconds, with
   a section for each new rule: the plain dress, barrier flags, the wall layout
   and its pitch in the world, the weave rule, the loop, the narrowed refusal, and
   round trips.
2. A differential on the existing tracks: every shipped preset and every saved
   5 inch track serialises to the same bytes and builds the same course
   (`courseFromDocument`) as before.
3. A browser check, `scripts/builder-flow-check.js`, with 5 inch cases: place by
   click, flags by chip, a wall by drag, Fly order by click, a loop, and the whole
   Mission track from empty with the number of actions counted.
4. The track against the diagram: every piece within 0.1 m of its diagram
   position and the right type, heading and flags; and the derived racing line
   laid over the diagram's yellow line, with the RMS distance printed.
5. Pictures with `scripts/shots.js` for the pilot to look at.

`npm run verify` is not needed: nothing in the plant, the module, the build or
the control loop changes. That is stated in PROGRESS.md with the run log.

## 8. Decisions taken on the owner's behalf

Each is the plan's answer, in force until the owner says otherwise.

1. **The 5 inch canvas builds in 3D**, as the whoop's does, with the plan one
   key away. Reverse: leave `buildsIn3D` false for the full class.
2. **Plain gate dress** is an option on a gate, not the new default. The MultiGP
   dress with its sleeves stays what a new gate is.
3. **A wall is a `group`**, and the publish refusal narrows to a group with a gate
   that no pass goes through.
4. **A hurdle is a barrier with flags**, not a new type, so the board needs
   nothing.
5. **A loop is waypoints**, not a new field, so it is the same in the board's copy
   as in ours.
6. **A row's pitch is the world's**, not the document's, so posts meet where the
   game builds them. The cost is a quarter metre of gap in the builder's own
   preview.
7. **Keys.** K wall, U hurdle, M ruler, N fly order. The plan said O, shadowing
   Ground logo as it does on the whoop canvas. It does not: the whoop palette has
   no ground logo and a field's has, and O has been its key for months, so N it
   is. Reverse: change `key` in `FIVE_INCH_TOOLS` (elements.js). Main's menus plan
   (1.20) reached the same letter for the whoop's Fly order on the same day,
   because Ground logo is on all three palettes, so it is N on both race canvases.
8. **No logos** on the Mission preset.
9. **Gate dimensions on the Mission preset** are chosen so the world builds a bay
   2 m between uprights, which is what the diagram draws.

10. **Square is a bar button, off by default.** New gates on a field face along
    the line at any angle, as they always did. With Square on, the first gate
    faces east and keeps it, and each next gate, wall, hurdle and up gate takes
    the quarter turn nearest the line and keeps it, which is how a plan is drawn.
    It is a way of working and is kept in the browser's storage, not in the
    track. Reverse: `readSquare` in app.js returns true.
11. **The card says which way a gate faces as a compass** (North, East, South,
    West), where the plan had a Turn button. One press is the heading. The Turn
    button squares a gate up first and then turns it a quarter.
12. **Round the flag comes before the pass, and the gate is flown once.** This was
    "a loop can come back through its gate or not", a loop after the pass with a
    chip for a second pass, and the shipped track used it twice. It was a misreading
    of the plan, and the owner said so on 2026-10-01: the figure is a spiral down
    round the flag and then through the gate. So the card's row is Round the flag,
    and Spiral down chooses between a whole turn down from over the header and just
    going round the flag and in, which is how the same plan enters its wall. A
    document made with the loop keeps its waypoints and its warning exemption.
13. **The line is not warned about where the design is tight.** The curvature
    warning skips the line between two bays of one wall, and the line round a flag
    (waypoints the figure made, found by their names: `Spiral left`, `Spiral
    right`, `Round the flag`, and the old `Loop left` and `Loop right`). A track's own limit is a
    setting already, and the warning now says where it is.
14. **A wall, a hurdle and an up gate are one at a time**: the tool is put away
    after the piece, which shows its card. A gate stays armed.
15. **The Nationals track ships as a five inch track,** through `shipTracks` in
    storage.js, from `presets5.js`, because `presets.js` is generated by the
    RaceGOW script. It lists under the five inch canvas in Load with its
    designer's credit, and no sponsor mark. Reverse: delete the `shipTracks` line
    in app.js.
16. **The five inch canvas's 3D is where it is built, so it is not a preview.**
    MENUS-PLAN.md 4.2 was written on 2026-10-01 for a five inch canvas that was
    built in 2D, and called its 3D a preview ("Build in 2D", a tool picked there
    opens 2D). This plan, from the owner's own report that top down building is
    hard, builds the five inch in the room as the whoop is, so after the merge the
    two race canvases share the views (3D first, 2D second, Top beside Fit, V
    between 3D and 2D) and a map keeps the preview. Everything the menus plan
    gated on the whoop for the sake of "3D is the tool" reads `buildsIn3D()` now.
    Reverse: make `buildsIn3D` false for the full class, which brings back the
    plan as the five inch's canvas and the preview note with it. (The map was
    brought across the next day, FREESTYLE-3D-BUILD-PLAN.md, and the preview note
    went with it, so the reverse there is that plan's.)
17. **The qualifier stays in Load after it is on the board.** It was shipped for
    the acceptance run and as a starter that works offline, and it was then put on
    the board (2026-10-01). MENUS-PLAN.md 4.2b would rather ship no second copy of
    a board track, and the whoop's Load ships RaceGOW5 beside the board's copies
    already, so it stays; the empty canvas offers the board's tracks first. Reverse:
    the same `shipTracks` line.

## 9. Not in this plan

A club profile with free gate sizes, hoops, tables and cubes on the 5 inch
canvas, a build sheet for a field, glb export, WebXR, and the
board's own copy of any of this. Each is a different ask.

## 10. What was done, against the plan

Everything in sections 4.1 to 4.6 was built. Where the build differs from what is
written above:

- **Keys.** Fly order is `N`, not `O` (decision 7).
- **Magnets and steps.** A field's magnet reaches 0.35 m (the plan said about
  0.5), the Shift nudge is 0.25 m (the plan said 5 m, which is not a nudge), and
  the camera may come within 2 m of the ground (the plan said 8 m). `scale.js`
  holds them, one block for the hall and one for the field, so each is one edit.
- **Turning.** Q and E turn fifteen degrees and Shift with either a quarter, a
  gate's ring steps fifteen degrees and Alt turns it freely, which is the
  plan's table with the modifier the other way round: Alt already meant "off the
  grid" everywhere else in the builder.
- **The room opens from the south,** a little to the west and steeper, so a
  plan's north is the far side of the room and a forty metre course fills more
  of the picture than it does from the angle a hall is looked at from.
- **Fit frames the track** and an empty canvas the field. The plan frames above
  the lap bar instead of under it.
- **Size** of a whole course is one press: Select all, then Standard, Wide or
  Championship on the card. A wall's bays have their own (Bay).
- **The turn flag** has its side of the flag as a compass row on the card ("Line
  passes on its"), and the width of its turn as a number (Turn clearance),
  because the plan's turn flag is the end of a long oval and had no way in.
- **The 2D plan** takes a wall dragged out, and shows it before it is laid.
- **The grid** is ruled at 1 m and 5 m, the fives brighter, in the room and on the
  plan of a five inch track, and the plan's lines are a little stronger. Not
  built: a third weight at 10 m and numbers on the lines in the room (the plan's
  edge ruler numbers every five metres already). A hall's plan and room and a
  map's plan keep what they had; the first full run of the flow check showed that
  my first version of this had changed them (PROGRESS.md, 2026-10-01).
- **The upper left gate.** Section 1 first read it as flown east with a hook in the
  line round its flag; a second look had it flown west and looping back through like
  the right hand gate, and the shipped track went out that way. Both loops were wrong,
  and so was the wall: see "The owner's correction" below. It is flown east after a
  spiral down round its north flag.

**The owner's correction (2026-10-01).** After the track was on main and on the
board: "the spiral downs around the flag then throught he gate are just 2 passes
through the gate, the triple side by side gate is not correct entry face." Both
were misreadings of the picture, and the builder had been shaped by the first:

- **The figure.** The card's Loop (a circle round a post after a pass, and a
  second pass back through) became Round the flag (a turn round the flag on an
  upright before the pass, a whole turn down from over the header with Spiral
  down, and the one pass), `addSpiral` in `parts.js`. The circle is centred on the
  flag where the world stands it, GATE_SCALE out from the document's, because that
  is the flag a pilot flies round.
- **The track.** The right hand gate and the upper left gate are each flown east
  once, after a spiral round the south flag and the north flag. The wall is entered
  round the flag on its east end and flown north, south, north. Three waypoints
  hold the line where the plan draws it and where the reversal warning said it
  otherwise left a gate backwards: over the top after the up gate, out of the
  wall, and the turn south after the upper left gate (the swing out was there
  already). Ten stations where there were twelve, and 169 m of lap where there
  were 149.
- **How it was read the second time.** Every gate on the plan is drawn folded flat
  towards the side it is flown out of (the start gate's bars point east, and its
  arrow says east), so the gates on the left are flown east; a curl drawn round a
  flag on a gate's upright is a spiral round that flag that ends in the gate; and
  the wall's flag is on the end the line comes round first, which only makes sense
  of the flag if the first bay is entered from the far side.

What was measured:

- **The acceptance run** (`scripts/builder-flow-check.js`, "five inch: the
  Nationals qualifier, built from an empty canvas"): 55 gestures from an empty
  canvas to the finished lap, a gesture being a click, a drag, a key or a typed
  number, and 68 after the correction, which added the wall's Reverse and its
  turn round the flag and three waypoints. Every piece is within 0.15 m of the
  one that ships (0.3 m for a waypoint), every heading is exact, the flags are
  the same, the passes are in the same order and flown the same way, the lap
  closes and nothing is warned about.
- **The line against the plan,** measured on the first version of the track and
  not again after the correction. The derived racing line was laid over the
  plan's yellow line. From ours to theirs the median distance is 0.43 m and nine
  tenths of the line is within 1.6 m; from theirs to ours the median is 1.3 m.
  The two places they part are the turn flag's oval, which ours draws wider, and
  the weave, which ours draws with less swing. The plan's line is a suggestion
  and ours is a derivation, and the track's own materials list (seven gates, nine
  flags, a hurdle, a dive gate) is checked piece by piece.
- **Nothing else moved.** The flow check is 507 pass and 0 fail on the finished
  tree: the 449 it had before this work, and 58 in the five new five inch cases.
  The self test is 1884 pass (1773 before the plan). The 19 documents of the
  differential (every whoop preset, the saved five inch tracks and the living
  room) are the same as after Stage 1, and the board needs nothing.

What is left, on purpose: the plan did not ask for a share link, a picture or a
build sheet for a field, club gate profiles, hoops and tables on a field,
A game export, or the board's own copy of any of this. Whoop 2D framing
above the lap bar, which is a bug there too, is left as it was so the whoop is
byte for byte what it was.
