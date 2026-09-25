# Freestyle maps: build your own, fly it, get scored for it

A plan for the owner, 24 September 2026. Nothing has been built yet: no source
file has moved. The plan is written to be argued with, and section 12 lists the
decisions it is waiting on.

## 0. What was asked

In the owner's words:

- "Within the editor, be able to add different assets, like buildings, towers,
  cranes, things like that, to make your own freestyle map."
- "Maybe a trick counter that detects you're flying close to something or
  doing a trick, like the skate games."
- "Maybe a map with vehicles to follow": dynamic elements (a car to chase and a
  car track) and static elements.
- "Then have that integrated into the sim."
- "This logo should be embedded on a freestyle map always, like an easter egg
  to find": the STF mark, white brush lettering with a green T, on black.
- "Generate assets that are cel shaded, manga style, better than
  flightdivision.com. Spare no effort to make this amazing."

## 1. What is already here

This plan builds on four things the repository already has. It does not build
beside them.

**The editor already writes a document the sim flies.** `src/trackbuilder/` is
a 2D plan editor with a 3D preview, undo, autosave and a library. Its document
is Z up, SI, schema version 3, with 16 element types. `src/game/trackdoc.js`
turns it into a course. `src/maps/custom.js` builds the race field around that
course. **A course with no gates in its flying order already loads as a
freestyle map** (`src/render/scene.js`, `mode` is decided by whether there are
stations). Adding an element type touches about eleven places, all of which
are listed in the editor survey. One sharp edge: a type with no branch in
`courseProps` is silently neither drawn nor solid, which has already happened
once (`pole`).

**Everything solid reaches the physics.** Since this morning every wall, roof,
gate and tree is solved inside the module at 1 kHz (`src/native/world.c`). A
course from the editor goes through the same upload (`src/game/plantworld.js`),
so a building placed in the editor will be solid the moment it becomes a
collider. There are three limits that shape this plan:

1. The world has two shapes: **axis aligned boxes and capsules**. A box cannot
   be turned, so a building at 30 degrees cannot be one box. A capsule has no
   heading to turn, so poles, lattice members and a crane jib can face any way.
2. **Only box tops are landable.** A roof you can land on has to be a box.
3. **Movers are up to 16 axis aligned boxes** that the shell writes before
   every 1 ms step from a closed form of the step count. The train works this
   way. A car turning a corner would need its box to turn, and it cannot.

**The trick scorer exists and is good.** `src/game/trickdetect.js` recognises
about 62 named tricks at 1 kHz from the gyro, the craft's path and its winding
round rails and poles. `src/game/score.js` runs a skate game combo: a 3 second
window, a multiplier up to 12, banked on expiry and lost on a crash. It runs
only on freestyle maps. It is **off by default** because naming is not yet
reliable ("a wrong name is worse than no name"), and the Trick list was
withdrawn on 21 September until scoring settles. What it does not have is any
scoring for flying close to things: no near miss, no gap, no threading.

**The town is already beautiful, and the race field is not.** The freestyle
town is built on a vendored MIT licensed kit (`src/maps/city/vendored/core`):
toon ramps whose shadow bands shift toward violet, a screen space ink pass
from the second difference of depth, inverted hull contours on hero props, an
anime sky and a considered palette. It reads like a background painting from a
Shinkai film. The race field that editor courses are built on today has
flat green grass, a grey sky and blobby trees. **A freestyle map built on the
race field would look like the race field. It must be built on the town's
kit.** That is the single biggest art decision in this plan, and it is free.

**Flight Division, looked at.** A screenshot of flightdivision.com was taken on
24 September 2026 with the container's Chromium. Their world is a sky
playground: clean low poly geometry in orange and white, soft realistic
lighting, raised roads with cars drifting and leaving grey smoke, a mascot
crash test dummy. It is polished and it is soft. It has **no ink, no cel
banding and no manga language**, and its landing page mentions **no map editor
and no trick scoring**. Beating it means the three things it does not do:
a drawn look, a scored game and a world you make yourself.

## 2. What we are building, in one paragraph

A pilot opens the track builder, chooses **New freestyle map**, and paints a
place with a palette of drawn assets: buildings, a bando shell, a tower crane,
a water tower, a lattice mast, containers, scaffolding, a bridge, billboards,
a skate set of rails, ledges and quarter pipes, trees and street furniture.
They draw a road and put cars on it. They mark named gaps the way a skate
game does. The 3D preview draws it with the same cel kit the sim does, so what
they place is what they fly, and the cars drive in the preview. They press
**Fly this map**. In the sim it is a freestyle map in the town's art style,
with a manga layer on the action: speed lines at speed, lettered callouts,
screentone. Every trick, gap, close call and chase feeds one combo. And
somewhere on it, in a place nobody was told about, is the STF mark.

## 3. Art direction: an anime world, manga action

### 3.1 The world, from the town's kit

Every new map and every new asset uses the town's pipeline and nothing else:
`core/toon.js` materials (hue shifted ramps), `core/post.js` (the depth ink,
the anime grade), `core/outline.js` (hull contours on hero assets such as the
crane and the water tower), `core/sky.js` and `core/palette.js`. New assets are
drawn in the town's palette so a crane placed beside a house looks as if one
artist drew both.

Hand painted detail comes from procedural canvas textures, the way the town's
signs are made: window grids with curtains and lit panes at dusk, rust
streaks, stencilled container numbers, warning chevrons, debris netting,
graffiti tags on the bando, and billboards carrying invented manga panel
adverts. No downloaded models and no image files: everything is generated,
so it costs no download, it cannot carry an incompatible licence, and every
asset is parametric, which is what lets an author size it.

A map has a **time of day** (golden hour, clear noon, dusk with lit windows,
overcast) and a **ground** (grass, tarmac, concrete yard, dirt), because those
two change the mood more than any single asset.

### 3.2 The manga layer

This is what the other simulators do not have. All of it is render only, all
of it is optional, and all of it is folded into passes that already exist
wherever possible, because the post chain has a budget (`src/render/budget.js`).

1. **Speed lines.** Radial ink strokes at the edges of the frame above about
   20 m/s, denser with speed, converging on where the craft is going rather
   than the screen centre. Confined to the outer third of the frame so they
   never cover what the pilot is looking at. Folded into the grade pass: no
   new full screen pass.
2. **Screentone.** A 45 degree dot tone in the darkest cel band only, the way
   a manga page tones its shadows. Screen space tone can shimmer in motion;
   it goes in at the high graphics tier only and is judged by flying it
   before it is kept.
3. **Lettered callouts.** Trick names, gaps and combos arrive as hand lettered
   manga text: heavy slanted capitals, a thick ink stroke, a burst balloon
   behind a big combo, a small katakana sound effect beside it (ズバッ, ドン).
   Drawn by our own canvas code, not a font file, so no dependency.
4. **Impact frame.** A crash holds one or two frames of high contrast ink with
   radial lines, then lets go. At most one every two seconds, never repeating,
   and it has its own off switch, because a flash is a photosensitivity
   question as well as a style one.
5. **Cel smoke.** Cars drifting through corners and prop wash on a low pass
   throw round, flat shaded puffs with an ink edge, the way anime draws dust,
   where Flight Division uses grey realistic smoke.
6. **The results page is a manga page.** Three to five panels: the best trick
   (the existing trick film already draws a cel shaded trick from its
   pattern), the best gap, the longest skim, the chase, and the STF panel if
   it was found. Exported as a share card through the existing card code.

### 3.3 Rules the art does not break

- **Flight feel is still the only goal.** Nothing in the manga layer touches
  the physics, and a Clean FPV setting turns all of it off in one row.
- **The periphery only.** Nothing drawn in flight may cover the centre third
  of the frame.
- **Budgets are measured, not assumed.** Each stage runs `lint:quality` and
  the budget capture, and a map with 200 assets is measured on the low tier.
- **No new dependencies.** Three.js from the import map, as now.

## 4. The asset library

One library, in a neutral place (`src/props/`), imported by both the editor's
3D preview and the sim. Each asset is one file with three functions of the
same parameters: a **plan footprint** for the 2D view, a **mesh** built from
the town's materials, and its **solids** as boxes and capsules. The editor and
the sim cannot disagree about an asset because there is one definition of it.

The town's own gap rule applies to every asset: a space between two solids is
either closed, or at least 1.4 m, because a slot a five inch aims at and
cannot fit through is a trap, not a line.

| Asset | The author sets | Solids | The lines it makes |
| --- | --- | --- | --- |
| Building | width, depth, floors, roof (flat, parapet, sawtooth), look (flats, office, warehouse, shopfront), punched through windows on or off | boxes, landable roof | roof gaps, through the building, dives off the parapet |
| Bando shell | width, depth, floors, how ruined | boxes with missing walls and floors | the flagship freestyle line: in one side, out the other, up through a floor |
| Tower crane | mast height, jib length, jib heading, hook drop | capsules (lattice mast, jib, counter jib, cable), box cab | orbits of the mast, under the jib, through the lattice, powerloops over the jib |
| Water tower | height, tank size | capsule legs, box tank | through the legs, orbit the tank |
| Lattice mast | height | capsules | orbits, knife edge through the braces |
| Chimney stack | height, radius | capsule | the one tall thing to fly round |
| Containers | stack of 1 to 4, colours, open ends | boxes | through open ends, gaps between stacks |
| Scaffold | width, height, lifts, netting | capsule tubes, box boards | threading between lifts |
| Bridge | span, deck height, piers | box deck (landable), box piers | under the deck, between the piers |
| Billboard | width, height on poles | box panel, capsule poles | the gap under the board |
| Power pylon | height | capsules | through the body, wires are visual only |
| Skate set | quarter pipe, ledge, rail, stair set, kicker | boxes and capsules | rail and ledge skims, the skate game feel at ground level |
| Trees | kind (street tree, sakura, pine), size | capsule trunk | gaps between canopies |
| Street furniture | lamp post, bench, cones, barrier, parked car | capsules and boxes | slalom |
| Gates as furniture | every existing gate type | as now | a gate to fly through for style, unscored |
| Named gap | a rectangle, a name, a points tier | none, it is a scoring zone | "CRANE GAP 500" |
| Spawn | where the pilot starts, and facing | none | |

**Headings.** Assets built from capsules turn to any heading from the first
stage. Assets with boxes (buildings, containers, the bridge, the skate set)
snap to quarter turns until the physics learns turned boxes (section 10). The
editor says so on the rotate handle rather than refusing silently.

## 5. The editor

### 5.1 The document

- A new optional top level field, `mode`: `"race"` (the default) or
  `"freestyle"`. Adding an optional field with a default is not a version bump
  under the schema's own rules.
- New element types for the assets in section 4, of a new kind, `structure`:
  solid, never in the flying order. Style choices (roof, look, colour) are a
  `style` field beside `dims`, the way `flagSide` is.
- A `road` element carrying a list of points, open or closed, and a width.
- A `vehicle` element naming the road it drives on, where on the road it
  starts, its speed and direction, and its kind (the town kit already draws
  kei trucks, a kei van, hatch, sedan, wagon, minivan, van, box truck and
  minibus).
- A `gap` element: a rectangle, a name, a points tier.
- An optional `scene` block: time of day and ground.
- A freestyle map gets its own autosave seat, so a race track and a freestyle
  map in progress do not overwrite each other.
- `schema.md` is brought up to date on the way (it still says version 1 in one
  place, and omits `pole`, `horizontalPole` and `trackClass`).

### 5.2 Making a map

- **New freestyle map** beside New track. The palette changes to the asset
  groups: Structures, Industrial, Skate, Street, Nature, Gates, Scoring,
  Roads and vehicles. The flying order panel and the racing line are hidden,
  because a freestyle map has neither.
- A default freestyle field of 160 by 160 m, which the author can resize. The
  ceiling is set by measuring a full map on the low graphics tier, not by
  guessing.
- Placing, dragging, rotating, raising, undo and snapping all work as they do
  for gates today.
- **The 3D preview draws the real assets with the real cel kit**, so the
  preview is the game. It gets a free camera and a **Play** button that runs
  the vehicles along their roads, driven by the same function of time the sim
  uses.
- **A road tool.** Click to lay points, the road draws as a smooth curve with
  kerbs and lane paint; click the first point to close it. Drag a point to
  reshape. Vehicles are placed onto a road and slide along it.
- **Warnings**, in the editor's existing warning panel: a gap under 1.4 m
  between two solids, a road that crosses a building, a vehicle with no road,
  more vehicles than the physics has room for, no spawn, a spawn inside a
  solid, a named gap nothing can fly through.
- **Fly this map** hands over exactly the way Fly this track does.

## 6. The map in the sim

- A new map module, `src/maps/built/`, registered as a freestyle map beside
  the town and loaded by dynamic import like every other map. The Freestyle
  screen offers **The town** and **Your map**. This reverses the owner's
  decision of 30 August 2026 that Freestyle offers the town and nothing else,
  because this request asks for exactly that; it is recorded as reversed
  rather than quietly overridden.
- It builds the ground, the sky with distant hills, the assets, the roads and
  the vehicles, merges static geometry by material the way the town's bake
  does, and hands its solids to the plant through the existing upload.
- Five inch only. The owner's decision "hide freestyle on the whoop" stands,
  and a whoop freestyle room is a different map.

## 7. The counter: a skate game, for a quad

One combo, fed by five kinds of thing. The existing combo rules are kept (3
second window, multiplier up to 12, banked on expiry, lost on a crash), so
everything chains into everything, which is what makes skate games
addictive.

1. **Tricks.** The existing recogniser, unchanged.
2. **Named gaps.** The author's rectangles. Crossing one scores its name and
   its tier, exactly like a THPS gap. Detected per physics step as the
   craft's path segment crossing the rectangle, the same kind of swept test
   the race uses for gate openings, so it is deterministic and never
   guesses.
3. **Close calls.** Measured every 8 ms of simulation time from the craft's
   clearance to the nearest solid, using the existing distance query:
   - **Skim**: along a wall or a roof edge within about a metre, above a
     speed floor. It builds while held, like a skate game manual, and keeps
     the combo alive.
   - **Under**: something solid over the craft within a few metres while it
     moves: a bridge, a crane jib, a billboard.
   - **Thread**: solids close on both sides at once.
   - **Low pass**: the ground, worth less.
   Points grow with speed and with closeness. A hard contact during a skim
   ends it as a bail; a gentle one is a tap, which the recogniser already
   pays for.
4. **Chase.** Holding a moving vehicle's tail (behind it, inside a distance
   band, keeping its speed) builds a Tail meter. Passing under a moving box
   truck's clearance or threading between two moving cars are events.
5. **The STF mark**, found: a one off bonus and a stamp (section 9).

**Reliability.** Gaps, close calls, chases and the egg are geometry, so they
cannot misname anything. That is a real difference from trick naming, and it
is why section 12 asks whether they should show by default while trick names
stay behind the existing Scoring switch.

**The display.** The existing score HUD is restyled into the manga lettering
of 3.2, keeping its layout and its "in development" honesty tag while trick
naming is still being settled.

**The board.** A freestyle run on a built map has no map key the public board
knows. Posting those runs needs a change in the board's repository, which
this session cannot reach, so built map runs are scored and shown locally
until the board is taught. The town's board is unchanged.

## 8. Moving vehicles and the chase

- A vehicle's position is a **pure function of the step count**: distance
  along its road equals the start offset plus speed times time, wrapped on a
  closed road and turned round at the ends of an open one. That is the rule
  in `src/maps/README.md` for anything a craft can hit, and it is how the
  train already works. A dropped frame changes nothing.
- Cars slow for corners. The speed profile along the road is worked out once
  when the map loads, from the road's curvature, so a car looks driven rather
  than slid along a rail, and it is still a function of the step count.
- The drawn car and the solid car are the same car: render reads the pose
  the physics used, rather than computing its own.
- Cars are solid (subject to section 10). You cannot land on a moving car:
  the physics never uses a mover as ground. That is written down as a limit,
  not a bug.
- Drift smoke, headlights at dusk, and wheels that turn with the distance
  driven, all render only.

## 9. The STF easter egg

- **Every freestyle map carries it, always**: the town and every built map.
  The editor offers no way to remove it.
- **Easy to see, from the pads** (decision 10, 2026-09-25). It was first
  built hidden, and the owner could not find it: "the logo of SubTwoFIfty is
  too hard to find, make it easy to see on any map". So it is painted big,
  where the pilot sees it from the pads, in the first frame where the map
  allows, and finding it is flying up to it.
- **In the town**, a 4 by 2 m mural on the side of 米・酒 なかの, the corner
  shop that closes the street the pilot starts in, 25 m ahead of the pads
  and 11 degrees left of the nose. It was inside the derelict works shed,
  on the inside of the roof space, seen only by a pilot who came in through
  the broken clerestory glazing.
- **On a built map** the sim chooses the spot, not the author, and the editor
  never shows it. The spot is chosen from the map's own assets: a wall that
  faces the pads with nothing opaque between them and it and open air in
  front, 15 to 60 m out, painted up to 6 by 3 m, the wall whose mark looks
  biggest from the pads, weighed by how far the pilot has to turn to see it.
  A map with no such wall gets it flat on the paving ahead of the pads, 12
  by 6 m. It is a property of the layout, so it is the same spot every time
  that map is flown, whatever its id.
- It is painted as a sprayed stencil with the town's ink treatment, so it
  looks like it belongs to the world rather than floating on it. On a wall
  the sun never reaches it gives back some of its own colour, as it does at
  dusk, so the lettering reads in shade.
- **Found** means the craft within about 4 m of it, further in proportion
  for a bigger mark so it is found at the same size in the picture (13.5 m
  at most), looking at it, with a clear line to it. The pilot gets a
  lettered STF callout and a manga panel, a bonus into the combo when
  scoring is on, and a stamp on that map's card that stays in this browser.
- **The file is needed.** The logo reached this conversation as a picture,
  and a picture in a chat cannot be saved into the repository from here. It
  needs committing as a file, ideally an SVG, or a PNG of at least 1024 px
  with a transparent background, into `assets/`.

## 10. Physics changes, for the owner's approval

CLAUDE.md requires any change to the physics model's shape, the module ABI or
the build to be put to the owner first, and requires the tests that pin the
core to be in place and green before it starts. These are the two changes
this plan wants, and they are the only physics changes in it. The craft, the
controller, the rates and the plant are not touched.

**P1. Boxes that can be turned.** A static box gains a heading about the
vertical. The module tests the craft's hull in the box's own frame, reusing
the existing box test unchanged, and turns the contacts back. Landing on a
turned roof works the same way. The heading is turned into a rotation by the
module's own fixed libm, so no JS trigonometry reaches the physics.
*Why:* buildings, containers, bridges and skate sets at any heading.
*What it could break:* the solve for today's maps. Guarded by a box at heading
zero having to give a bit identical result to today's box, and today's worlds
(all unturned) staying bit identical.

**P2. Movers that turn, and follow a road inside the module.** A mover gains a
heading. The road's points are uploaded once, and the module computes every
vehicle's pose from the step count by itself, with WebAssembly's own square
root, which the WebAssembly specification defines exactly, so the pose is the
same in Node and in every browser. The shell reads the pose back for drawing.
The mover limit goes from 16 to 64.
*Why:* cars that turn corners with the right shaped solid, bit for bit
deterministic, and a drawn car that cannot drift from the solid one.
*What it could break:* the train, which must stay bit identical (it is a
mover at heading zero), and the cost per step, which is measured.

**The alternatives, if the answer is no.** Buildings snap to quarter turns
forever; a turning car is an axis aligned box around its turned footprint,
which on a diagonal is a square about 4.5 m on a side around a car 1.8 m
wide, so an invisible wall; or cars are not solid at all and you can fly
through them.

**Coverage first, before either lands.** Re-run `check:plant`,
`check:world`, `check:crash` and `verify` and have them green; add a world
golden (the world scenarios and the town's crash runs hashed per step in
Node, so any change to the world solve shows as a named failure); and add the
Node against Chrome comparison of a world run, which was left open on
24 September.

## 11. Stages, in build order

Each stage lands on its own, is checked, and is handed to the owner to fly
before the next starts.

**Stage A. The yard: freestyle maps exist.** The `mode` field, New freestyle
map, the asset library with the capsule built assets at any heading and the
box built ones at quarter turns, named gaps as elements, spawn, time of day
and ground, the real cel kit in the 3D preview, the new map module, the
Freestyle screen offering Your map. No physics change.
*Checks:* the builder self test (`check:clip`) extended with a round trip and
the solids of every asset; a new check that every asset type is both drawn
and solid (the `pole` lesson); `lint:quality`, `lint:boot`, `lint:memory`;
`shots` of the editor and a built map. *Fly:* a built map with every asset.

**Stage B. The STF mark.** In the town and on every built map. Needs the file.
Small, and can ride with Stage A. *Checks:* the spot chooser in Node (same
map, same spot; never inside a solid; never visible from spawn); `shots`.
*Fly:* find it.

**Stage C. The counter.** Named gaps, skims, under, thread, low pass, the egg
bonus, the manga callouts, the manga results page. *Checks:*
`score:selftest` extended with synthetic runs past a wall, under a deck,
between two posts and through a gap, each asserting exactly what scores and
what does not (a wall crash must not pay); `trick:sweep` unchanged and
green. *Fly:* a skim line on a built map and in the town.

**Stage D. The physics: P1 and P2.** Only with the owner's approval, and only
after the coverage above. *Checks:* `verify`, `check:plant` bit identical,
`check:world` with new turned box and turned mover scenarios, including
heading invariance (the same hit on a box turned by any angle gives the same
outcome); `check:crash`; the new world golden; `git diff --stat
vendor/betaflight` empty. *Fly:* hit a turned building, land on a turned
roof, clip a car.

**Stage E. Roads, vehicles and the chase.** The road tool, vehicles, the
corner speed profile, Play in the preview, the Tail meter and chase events,
cel smoke. *Checks:* a vehicle pose trace hashed in Node and Chrome; `shots`.
*Fly:* chase a car round a map.

**Stage F. The manga layer.** Speed lines, screentone, the impact frame, the
settings and Clean FPV. Render only, so it can move earlier if the owner
wants the look first. *Checks:* the budget capture on every tier; `shots` at
rest and at speed. *Fly:* judge whether the tone shimmers and whether the
lines ever get in the way.

## 12. Decisions

Decided by the owner on 24 September 2026, in the conversation:

1. **The physics changes P1 and P2: approved, as Stage D.** The editor, the
   egg and the counter come first with no physics change. Then the coverage
   of section 10 lands and goes green, then turned boxes and road following
   movers.
2. **The counter's default: geometry on, tricks opt in.** Gaps, close calls,
   the chase and the egg show by default on freestyle maps. Trick names stay
   behind the existing Scoring switch until naming is settled.
3. **The egg on built maps: the sim hides it.** The editor never shows it,
   and the spot is the same every time a given map is flown. The hiding is
   replaced by decision 10; the rest stands.
4. **The manga layer: freestyle maps, on by default**, with a Clean FPV
   switch in Settings. Race stays clean.

Still open:

5. **Katakana sound effects** beside the English callouts: yes or no. Needed
   by Stage C.
6. **The town's egg spot**: inside the works shed roof space, or elsewhere.
   Needed by Stage B. Answered by decision 10: the corner shop at the end of
   the spawn's street.
7. **The STF file**, committed to `assets/`. Needed by Stage B.

Answered 2026-09-25, when the owner asked for "the drift car that is driving
on the track, so we can practice chasing":

8. **The chase comes right after Stage B.** The order is now A, B, D, E, C,
   F: Stage D (the coverage first, then the physics) and Stage E (roads,
   vehicles, the chase) move ahead of the counter. Decision 1's "not before
   Stages A to C" is replaced by this; its other condition stands, and so
   does CLAUDE.md's: the coverage lands and goes green before the physics
   changes.
9. **Cars drive on built freestyle maps only**, as section 8 has it. Not on
   race tracks.

Answered 2026-09-25, when the owner, having flown Stage B, wrote "the logo
of SubTwoFIfty is too hard to find, make it easy to see on any map":

10. **The STF mark is painted to be seen, not hidden.** Big, where the pilot
    sees it from the pads, in the first frame where the map allows (section
    9). This replaces decision 3's "the sim hides it"; the sim still chooses
    the spot and the editor still never shows it. It answers decision 6: the
    town's mark leaves the works shed for the corner shop at the end of the
    street the pilot starts in. Finding it is unchanged in kind, flying up
    to it and looking at it, with the range grown in proportion to the
    mark. Race tracks do not carry it: asked whether "any map" took them
    in too, the owner answered "just freestyle" (2026-09-25).

## 13. Not in this plan

- Publishing freestyle maps to the public board, and a board per built map:
  the board is a separate repository.
- Landing on a moving vehicle: the physics never uses a mover as ground, and
  changing that is a larger change than P2.
- A crane whose jib slews: a turning capsule mover is a further ABI change.
  Written down as a stretch, not promised.
- Freestyle on the whoop, multiplayer, and raised roads for vehicles.

## 14. Risks, stated early

- **Performance.** The town's post chain is heavier than the race field's. A
  built map is far smaller than the town, but the manga layer adds work in
  the grade pass. Every stage measures on the low tier.
- **The editor's 3D preview becomes a real renderer.** It loads Three.js only
  when first opened today; it will also load the cel kit then, and not
  before, so the 2D editor stays as fast to open as it is.
- **Screentone shimmer** is a known failure of screen space tone and may not
  survive being flown.
- **Scoring close calls must never pay for crashing.** Every close call test
  includes a crash that must score nothing.
- **Size of the work.** This is the biggest feature since the city. Staging it
  is what keeps each piece flyable and each check meaningful.
