# The track document

This is the track builder's output and the only thing it shares with the rest
of WebFPVSimulator. The builder does not import a line of the simulator.

**The game now reads it.** `src/game/trackdoc.js` turns a document into a
course, `src/render/scene.js` builds the race field around that course instead
of around its own figure eight, and `src/maps/custom.js` offers it as the
**Your track** map. The loop is: build a course, press **Fly this track**, and
the world you get is this one with your gates in it.

That reading goes **through this module's own code**. `trackdoc.js` imports
`model.js`, `elements.js`, `geometry.js` and `path.js`, which are pure data and
pure functions with no DOM and no Three.js, so the game and the builder cannot
disagree about what a document means. The dependency is one way and stays one
way: the game may read the builder's data modules, the builder may not import
anything from the game.

Everything below describes `schemaVersion: 3`.

The same document describes two things. A **race track** is what this builder
has always made: elements on a field and a flying order through them. A
**freestyle map** says `"mode": "freestyle"` and is a place made of assets,
buildings, cranes, a skate set, named gaps, with no flying order at all. Most
of this file is common to both; **Freestyle maps** below is what a map adds.

The worked example at the end is not hand written. It is emitted by

```
node src/trackbuilder/selftest.js --emit
```

and the same file checks that it round trips byte for byte, so the example and
the implementation cannot drift apart.

---

## Conventions

**Units are SI.** Metres, radians, seconds. There is not a single foot, inch or
degree anywhere in a track document. Degrees appear in the inspector's display
strings and nowhere else. This follows the repository's own rule in CLAUDE.md.

**The frame is right handed and Z up**, the same one the simulator's physics
uses, so a document can be handed to the simulator without a conversion nobody
would remember to do.

| axis | meaning |
| --- | --- |
| `+x` | across the field's **width** |
| `+y` | across the field's **depth** |
| `+z` | **up** |

The field's near left corner is the origin, so every point on the field has
`x` in `[0, width]` and `y` in `[0, depth]` and nothing is negative by default.
The 2D view draws `+x` to the right and `+y` **up the screen**, which is what
makes it a right handed frame seen from above and makes a left turn on the
field a left turn on the drawing.

**`yaw`** is a rotation about `+z` measured from `+x`, counter clockwise seen
from above, in radians, wrapped to `(-pi, pi]`.

**`pitch`** is the angle the aperture's normal is **raised above the
horizontal**, in radians, clamped to `[-pi/2, +pi/2]`.

* `0` is a vertical gate: the normal lies flat and the opening stands up.
* `+pi/2` lays the opening flat with its normal pointing at the sky. This is
  the dive gate default.
* `-pi/2` lays it flat with the normal pointing at the ground.
* Anything between is an angled dive gate.

**Numbers are rounded to six decimal places** on write. That is a micrometre on
a 60 m field and a third of a microradian on an angle, and it is what makes
export, import, export byte identical.

**Reading a document must not throw.** `model.normalize()` accepts any object
at all, repairs what it can, drops what it cannot, and reports what it did.
A consumer written against this schema should do the same rather than trust
the file.

---

## Top level

```jsonc
{
  "schemaVersion": 3,
  "id": "trk-1a2b3c4d",
  "name": "Ladder Loop, demo",
  "createdUtc": "2026-01-01T00:00:00Z",
  "modifiedUtc": "2026-01-01T00:00:00Z",
  "trackClass": "full",
  // "mode": "freestyle",       written only on a freestyle map
  // "scene": { ... },          a map's time of day and ground, when not the default
  "field":    { ... },
  "settings": { ... },
  "branding": { ... },
  "credit":   null,
  "elements": [ ... ],
  "sequence": [ ... ]
}
```

| field | type | meaning |
| --- | --- | --- |
| `schemaVersion` | integer | The version of THIS document. `3` today. A consumer seeing a HIGHER number reads on a best effort basis, drops what it does not recognise and says so, which is what `normalize()` does and what the Versioning section below states. |
| `id` | string | Stable identity of the track, `trk-` followed by eight hex digits. Used as the key in local storage. Two identical tracks are still two tracks, so this is not derived from the contents. |
| `name` | string | What the author calls it. Not unique, not an identifier. |
| `createdUtc` | string | ISO 8601 UTC, seconds resolution, when the track was first made. |
| `modifiedUtc` | string | Same format, last edit. The Load list sorts on this. |
| `trackClass` | `"full"` or `"micro"` | Which kind of track. `full` is the sixty metre field flown on a 5 inch through MultiGP sized gates; `micro` is a RaceGOW room flown on a 65 mm whoop. It decides the palette, the sizes a new element gets, the grid, the warnings and which autosave seat and board the track belongs to. Always written; read as `full` when absent, which is what every version 2 document is. A freestyle map is always `full`. |
| `mode` | `"freestyle"`, or absent | **Written only on a freestyle map.** Absent means a race track, which is every document written before maps existed, so no race track's bytes changed when maps arrived. Anything other than `"freestyle"` reads as a race track. See **Freestyle maps**. |
| `scene` | object, or absent | **A map's only, and written only when it is not the default.** Its time of day and its ground; see **The scene** under **Freestyle maps**. Absent reads as golden hour over concrete, which is what every map looked like before the block existed. Never read or written on a race track. |
| `field` | object | The ground the course stands on. |
| `settings` | object | Per track tuning for the derived racing line. |
| `branding` | object | The sponsors' logos the course is dressed in. Optional; see below. |
| `credit` | object or null | Who designed the layout and where it came from, for a track that came from somewhere else: `designer`, `series`, `sponsor`, `source`, `broughtOverBy`, `note`, all optional strings. `null` on anything a pilot builds. Written by `toPlain`, kept by `duplicateTrack`, drawn only as text. |
| `elements` | array | Everything standing on the field, in no particular order. |
| `sequence` | array | The flying order. THIS is the course. |

### `field`

| field | type | meaning |
| --- | --- | --- |
| `width` | number, metres | Extent along `+x`. At least 5. |
| `depth` | number, metres | Extent along `+y`. At least 5. |
| `gridSize` | number, metres | Placement snap and the drawn grid. At least 0.1. |

Nothing forbids an element from standing outside the field, and the builder
warns rather than refusing, because a spectator barrier behind the fence is a
real thing to draw.

### `settings`

| field | type | meaning |
| --- | --- | --- |
| `tangentScale` | number | How long a Hermite tangent is as a fraction of the distance to the next knot. See **Deriving the racing line**. |
| `minCurveRadius` | number, metres | Below this radius the results panel warns. Advisory only. |
| `samplesPerSegment` | integer | How finely the spline is sampled between two knots, 4 to 512. Arc length, curvature, the barrier test and the elevation profile all read the same polyline. |

### `branding`

Up to five sponsors' logos, shared out over the gates, the banners, the flags
and any paint on the grass.

| field | type | meaning |
| --- | --- | --- |
| `logos` | array | 0 to 5 logos, in the order they are dealt out. |

Each entry:

| field | type | meaning |
| --- | --- | --- |
| `id` | string | Stable identity of this logo within the document, `logo-` followed by a number. A `groundLogo` element names the logo it wears by this. |
| `image` | string | A `data:` URL of an image. Nothing else is accepted. |
| `name` | string | The file the author chose it from. Display only. |

**Which logo goes on which gate is derived, not stored.** The structures in
the flying order are numbered from zero, counting STRUCTURES rather than passes
(a ladder flown three times is one frame with one header board, so it counts
once) and skipping anything that carries no printed vinyl (a flag or a cone is
scored through a square in the air beside it). Structure *i* wears logo
*i* mod *n*. Fifteen gates and five logos is three gates each, spread down the
lap rather than bunched at the start. The rule is `dressOrder()` in
`model.js`, and both the race field and the builder's own 3D view read it
from there so they cannot disagree.

A gate's own header pennants wear THAT GATE'S logo in both accents. The run of
turn flags down a course cycles through the logos and through the navy and red
accents at the same time, so it repeats every `lcm(n, 2)` flags.

**The images travel inside the track.** A track is one file a person sends to
another person, and a branding that lived in a second file beside it would
arrive stripped every time. So the pictures are embedded, which means they have
to be small enough that a track is still a file rather than a payload:
`src/trackbuilder/logo.js` re-draws every upload onto a canvas of its OWN
aspect ratio, scaled to fit inside 1200 by 400 and never enlarged, re-encodes
it as a PNG, and steps down through smaller boxes until the data URL fits.

Two caps, and the second is the one an author meets. Any single logo is capped
at **256 kB** of data URL, which is what `isUsableLogo()` will accept whatever
else is in the document. All the logos together are capped at **384 kB**, which
is what keeps a published course inside the board's own document cap.
`model.normalize()` drops anything past either and says so.

**Only a `data:` URL is accepted, and that is a security property rather than a
validation one.** A document is untrusted input and these strings end up in a
texture loader, so an `http:` URL in there would turn opening somebody's track
into a request to their server. A logo that is not an embedded image is dropped
on read with a repair note.

This field is **optional**. `normalize()` fills in `{ "logos": [] }`.

**Reading a version 1 document.** Version 1 spelled this as a single
`branding.logo` string with a `branding.logoName` beside it. `normalize()`
promotes that pair into `logos[0]` and says nothing, because it is an upgrade
rather than damage. Nothing writes the old spelling any more: writing both
would mean carrying the first logo's bytes twice, which doubles the file for
the single logo case that is most of them. Dropping a field is what
`schemaVersion` 2 is for; see **Versioning**.

---

## `elements`

An element is a physical thing on the field. It is **not** a step in the
course; that is what `sequence` is for.

```jsonc
{
  "id": "el-5",
  "type": "ladder",
  "name": "The ladder",
  "position": { "x": 31, "y": 20, "z": 0 },
  "yaw": 0,
  "pitch": 0,
  "yawOverridden": true,
  "dims": { "levels": 3, "sillH": 0, "clearW": 1.524, "clearH": 1.524, "levelPitch": 1.557408 }
}
```

| field | type | meaning |
| --- | --- | --- |
| `id` | string | `el-` and a number. Unique within the document. Referenced by `sequence[].elementId`. |
| `type` | string | One of the element types below. An unknown type means the whole element is dropped on read. |
| `name` | string | The author's label for it. May be empty, in which case the tool shows the type's name. |
| `position` | object | Where the element's **base** sits: `x` and `y` on the ground, `z` the height of the base above what it stands on. `0` for nearly everything: a bar, a waypoint, a named gap, an opening with no pipe and, on a map, something stood on a roof or on another asset are the only ones with any other. Anything else with a `z` over 5 cm and nothing under it is set down when it is read: see **Nothing floats**. A map's **asset** may have a negative `z`, down to -30 m: it is sunk into the ground to hide part of it, and what is under the ground is neither drawn nor solid (`SINK_MAX` and `lowestBase` in `elements.js`). Nothing else may go under the ground. |
| `yaw` | number, radians | Which way the element faces. See the conventions above. |
| `pitch` | number, radians | Tilt of the aperture plane. Meaningful only for aperture elements, and for the freestyle assets that stand on end (see **Standing on end**), where it is `0` upright and a quarter turn, plus or minus 90 degrees, on end; written as `0` for everything else. |
| `yawOverridden` | boolean | `true` when the AUTHOR set the heading, which stops the tool re-deriving it. See **Faces and pass sides**. |
| `dims` | object | Dimensions, in metres, whose keys depend on `type`. Always complete: a missing key is filled from the default on read. |
| `text` | string | **Labels only.** The text drawn on the field. |
| `style` | string | **Freestyle assets that have looks, and vehicles.** Which look: a building's `flats`, `office`, `warehouse` or `shop`, a container's `40ft`, a tree's `sakura`, a vehicle's `kei` or `boxtruck`. One of that type's styles in the table under **Freestyle maps**; an unknown style reads as the type's first. Not a dimension. |
| `nodes` | array | **Roads only.** The road's control points, `{ "x", "y" }` each, metres **relative to `position`**. See **Roads and vehicles**. |
| `closed` | boolean | **Roads only.** `true` joins the last node back to the first: a loop. |
| `road` | string | **Vehicles only.** The `id` of the road element it drives. |
| `reverse` | boolean | **Vehicles only.** `true` drives against the road's node order. |
| `drift` | boolean | **Vehicles only.** `true` makes it the drift car. |
| `points` | integer | **Named gaps only.** What flying through it is worth: one of 100, 250, 500, 1000 or 2500, and anything else snaps to the nearest. |
| `flagSide` | `"left"`, `"right"`, `"both"` or `"top"` | **Flagged gates and flagged doubles, and a barrier that has flags.** Where the pennant stands on the top header, as seen facing the gate. `top` is one mast on the CENTRE of the board, over the opening. Default `left` on a flagged gate. Not a dimension; the mast's height is, and it is `dims.flagH`. On a **barrier** the field is **optional**: it is written only when the barrier has flags (a hurdle), with `dims.flagH` beside it, and a barrier without it is the JSON it always was. There the masts stand at the two ends of the board, along the way it is turned, and `left` is the `-heading` end. |
| `style` | `"plain"`, or absent | **Apertures only.** The dress a gate wears besides the MultiGP one. A MultiGP gate in the world has a printed sleeve round each upright and a header board wider than the frame; `plain` has no sleeves and a header board exactly as wide as the frame, so a pennant on the header stands on the upright and the bays of a wall sit end to end. Written only when set, so every gate that exists serialises as it did. Only a vertical, square gate has a dress. A value this build does not know is dropped on read with a repair note. See `isPlain` in `elements.js`. |
| `letter` | `"A"` to `"Z"` | **Letters only.** Which capital the element is: one character, in capitals. A word that is not one of the twenty six reads as `"A"` and says so in the repairs; one in lower case is read as the capital without a word. Not a dimension. The shape of the pipe and of each gap is the capital's, kept in `src/props/letters.js` and not in the document, so there is no polygon in a track to get wrong. Written on every letter and on nothing else. See **A letter** below. |
| `logoId` | string | **Ground logos only.** The `id` of the entry in `branding.logos` this footprint is painted with. Empty means the course's first logo. Not a dimension. |
| `crop` | object, or absent | **Ground logos only.** A STICKER: the piece of the logo picture this decal wears, `{ x, y, w, h }`, as shares of the picture's width and height, `y` counted down from its top edge. The piece is fitted in the footprint as a whole logo is. A map carries at most five logos and the board holds each to 256 kB, so a sticker bomb is one sheet in one slot and each sticker names its piece of it; every sticker cut from one sheet is drawn as one mesh on one texture. Anything that is not a rectangle inside the picture is dropped on read and the decal wears the whole logo. Written only on a sticker. See `cropOf` in `model.js`. |
| `achievement` | string, or absent | **Ground logos only.** What finding this decal is called, at most 24 characters. A decal with one is found in flight the way a partner's mark is (fly up to it and look at it) and the callout letters this word; the finding is kept in this browser. Written only when not empty. See `achievementOf` in `model.js` and `stickers` in `src/maps/README.md`. |
| `unbuilt` | `true`, or absent | **Apertures only.** The opening is a GAP IN THE LATTICE rather than a gate with a frame of its own: it scores, it lights, it carries its number and it pins the racing line, and no pipe is built for it in the world, the export, the preview or the card. The pipe that bounds it belongs to the structures around it. Written only when true, so an ordinary gate's JSON is unchanged. RaceGOW builds this way wherever a leg is carried up past a bar: the opening over the bar has the bar below and a pole beside and nothing else, and drawing a square there puts PVC in mid air. A `gate` with it set and nothing else different is the builder's **invisible gate**, and a `letter` with it set is a letter that is its gaps alone: see **An invisible gate** below. See `isUnbuilt` in `elements.js` and `TRACK-FROM-GIF.md`. |
| `unbuiltSides` | array of strings, or absent | **Apertures only.** The sides of the frame that have no pipe, taken away one at a time: any of `"top"`, `"bottom"`, `"left"`, `"right"`, each once, written in that order. The opening still scores, lights, carries its number and pins the racing line; only the pipe is gone, along with what belongs to it (an upright's foot, fittings and printed sleeve, the top bar's header board). Four sides per STRUCTURE: `left` and `right` are the two uprights, the whole height of a stack, `top` is the bar over the top opening and `bottom` the bar under the lowest. A bar between two openings of a stack holds both up and is not one of the four. Left and right are as seen facing the gate, the same reading `flagSide` has: `left` is the `-widthAxis` upright and `top` the `+heightAxis` bar. Written only when at least one side is missing, so a gate with all four is the same JSON it was before this existed; a name that is not a side is dropped on read with a repair note. `unbuilt: true` means all four and more (no pipe at all), and wins when both are present. See `FRAME_SIDES` in `elements.js`, and `meshSidesFor` in `src/game/trackdoc.js` for how the race field, which builds each gate facing its first pass, turns these into its own frame. |
| `unbuiltPoles` | array of strings, or absent | **Stacks of square openings only** (`levels` 2 or more). One opening's stretch of an upright taken away on its own, as `"left:0"` or `"right:2"`: the side as in `unbuiltSides`, the opening counted from the bottom. It is the finer spelling of `unbuiltSides`, whose `left` and `right` still take the whole upright, and a stretch of an upright already gone that way is not written. When every stretch of one upright has gone it is written as that side in `unbuiltSides` instead, so a document says one thing one way. Added 2026-10-04 at the owner's request: deleting one gate's side of a double or triple stack took the pole of all of them. The printed sleeve is one board the height of the stack, so an upright missing a stretch has none. The 2D plan draws no mark for a stretch. Written only when not empty, so every gate that exists is the JSON it was; a stretch this piece does not have is dropped on read with a repair note. See `unbuiltPolesOf` in `elements.js` and `framePoles` in `src/game/trackdoc.js`. |
| `pvc` | `true`, or absent | **Poles and horizontal poles only.** A length of frame pipe rather than a race piece: drawn in the frame's white rather than a pole's red or a hurdle's bands, and a horizontal pole with it has no legs of its own, because it rests on the uprights of the frame it belongs to. Written by the TinyLaps import (`importtinylaps.js`), whose tracks are frames of PVC that hold invisible gates up. Written only when true, so every pole and hurdle that exists is the JSON it was; anything but `true`, or on any other type, is dropped on read. The collider is the same either way. See `isPvcPipe` in `elements.js`. |
| `group` | string, or absent | **Apertures only.** A name shared by the gates that are one object: today, the faces of a cube. A name and nothing else, at most 40 characters, made by the builder (`grp-1`, `grp-2`) and meaningful only to be the same on every member; anything that is not a non-empty string is dropped on read with a repair note, so the gate is on its own. The builder selects, moves, turns, copies and removes a group as one piece, and a group is not replaced with another part. Written only when there is one, so a gate on its own is the same JSON it was before this existed. A gate in a group is BUILT in the world whether or not the flying order goes through it, as solid pipe with nothing to score, which a gate on its own is not: see `loose` in `src/game/trackdoc.js` and **A cube** below. |

### Nothing floats

`position.z` is the height of an element's base over what it stands on, and
nothing built stands in the air. A gate, a flag, a cone, a pole, a barrier, the
start pads and a map's assets stand on the ground, or, on a map, on the top of
another element's solid box under their origin: a roof, a container, a deck, a
ledge. Only a box counts, because that is all the physics stands a craft on.
An element is where its origin is, the middle of its footprint, so one that is
half off the edge of what it stands on still stands on it, and one whose middle
is off it falls.

An element whose base is more than 5 cm over that is **set down** when the
document is read by anything that draws or flies it: the builder when it opens
a document and after every edit, and the simulator when it builds the course or
the map. A stack of assets comes down a storey at a time when the one under it
goes. The stored file is not rewritten, so a track on the board keeps the layout
its times were set on, and the builder says what it set down. Lifting a gate's
opening off the ground is what `sillH` is for: the legs stand on the ground and
the opening is up on them.

A negative `z` is not floating and is never set down: it is the opposite, an
asset sunk on purpose, and the rule above does not look at it. The part under the
ground is not drawn (the plot is drawn over it) and is never a surface (a box whose
top is under the paving is not one), and the part over it is as solid as it is drawn.
The builder warns, `fs-buried`, when an asset is sunk wholly out of sight.

Four kinds of thing are left alone, because nothing built is held up:

- a `waypoint` and a named gap (`zone`), which are a point and a window in the
  air and are drawn nowhere in the world;
- a `horizontalPole`, whose legs reach down to the ground from the bar, so its
  `z` is the bar's height;
- an opening with no pipe at all, `unbuilt` or with all four `unbuiltSides`,
  which is a hole in a lattice held by its neighbours;
- a label, a ground logo, a road and a vehicle, which have no height of their
  own.

The rule is `needsSeat` and `seatFloating` in `src/trackbuilder/seat.js`, and a
map's half, which needs the solids, is `seatDocument` in
`src/maps/built/place.js`. FAI Turkiye 2024, imported from Velocidrone, was
stored with four flags 20 m up and a gate 15 m up over a rooftop that the field
does not have, and a pilot could clear them neither where they hung nor where
they should have stood (29 September 2026).

### The element types

Each row's `kind` decides everything the tool does with it.

| `type` | key | kind | in the course? | `dims` keys |
| --- | --- | --- | --- | --- |
| `gate` | G | aperture | yes, once per opening | `levels sillH clearW clearH levelPitch` |
| `flaggedGate` | A | aperture | yes, once per opening | `levels sillH clearW clearH levelPitch flagH`. A 5x5 with a pennant on the header. `flagSide` chooses left, right, both or top, and `flagH` is how tall the mast is above the board, default 1.45. The palette calls it Flagged gate. |
| `doubleStack` | 2 | aperture | yes, once per opening | same |
| `flaggedDoubleStack` | H | aperture | yes, once per opening | `levels sillH clearW clearH levelPitch flagH`. A two hole 5x5 with a pennant on the top header. `flagSide` chooses left, right, both or top, and `flagH` is the mast height. The palette calls it Flagged double. |
| `ladder` | R | aperture | yes, once per opening | same. Three stacked 5x5s. The palette calls it Triple stack. |
| `tower` | T | aperture | yes, once per opening | same |
| `diveGate` | D | aperture | yes, once per opening | same |
| `hoop` | none | aperture | yes, once | same, with `levels` always 1. A round gate: the opening is the ellipse that touches all four sides of the `clearW` by `clearH` box, a circle when the two are equal, which is what a new one is. The whoop palette's only. See **The shape of an opening**. |
| `hexGate` | none | aperture | yes, once | same, with `levels` always 1. A six sided gate: a point at each end of `clearW` and a flat above and below, so it is a regular hexagon when `clearH` is `clearW` times the square root of three over two, which is what a new one is. The whoop palette's only. See **The shape of an opening**. |
| `letter` | none | aperture | yes, once per gap that is flown | same, with `levels` always the number of gaps the `letter` has (one to three) and `sillH` always 0: a letter stands on the ground, and upright, so `pitch` is always 0. A capital of 2 inch pipe with gaps in it to fly through. `clearW` and `clearH` are the size of its PRIMARY gap, box axis to axis, and the whole letter follows them. A five inch track's only, on the palette after the dive gate, with no key. See **A letter**. |
| `barrier` | B | obstacle | **never** | `width depth height`. Optional `flagSide`, and then `flagH` in `dims`, make it a hurdle: see `flagSide`. The palette's Hurdle is a barrier 4 m by 0.1 m by 1 m with two flags and a waypoint over it in the flying order. |
| `flag` | F | marker | yes, with a pass side | `height poleRadius clearance` |
| `cone` | C | marker | yes, with a pass side | `height baseRadius clearance` |
| `waypoint` | W | marker | yes, at zero clearance | `height poleRadius clearance` |
| `pole` | U | marker | yes, with a pass side | `height poleRadius clearance`. A bare upright pipe, flown round on one side like a flag. On the whoop palette, and furniture on a map. |
| `horizontalPole` | Z | obstacle | **never** | `width depth height`. A single bar on two legs, placed 1.6 m up on a field and 0.95 m in a room; `position.z` is the underside of the bar. On the whoop palette, and furniture on a map. |
| `table` | none | obstacle | **never** | `width depth height`. A living room's table: a top on four legs, solid, with room to fly under it between the legs. The whoop palette's only, and it stands on the floor. It turns in quarter turns, and a `yaw` between two of them is built at the nearest. The boxes it is made of are worked out from those three sizes alone, in `src/props/room.js`. |
| `chair` | none | obstacle | **never** | `width depth height`. A seat on four legs and a solid back. `width` runs along the way it faces and its back is behind it, on the minus x side of its own frame. Otherwise as a `table`. |
| `banner` | none | obstacle | **never** | `width depth height`. A thin panel on two feet, down to the floor. `width` runs along the panel and `depth` is how far its feet reach across it. Otherwise as a `table`. |
| `startPads` | S | start | **never**, it is the line itself | `pads spacing padSize` |
| `label` | L | annotation | **never** | `textHeight` |
| `groundLogo` | O | decal | **never** | `width depth` |

The keys are the palette's, and each palette has its own: the five inch
palette, the whoop palette and a map's palette. `pole` and `horizontalPole`
are on the whoop's and a map's, not the five inch's, and a key that is not on
the palette in front of the author does nothing. `table`, `chair`, `banner`,
`hoop` and `hexGate` are on the whoop's alone and have no key at all: the
letters ran out. `letter` is on the five inch palette alone and has none
either, for the same reason: the free ones are a map's.

**The furniture is sized by three numbers and built of boxes.** A `table`, a
`chair` and a `banner` hold `width`, `depth` and `height` exactly as a
`barrier` does, so nothing that reads a track needs a new shape of number.
Every other proportion (how thick a top is, how far a leg is set in) is a
fraction of those three, so the piece is the same at the room's scale as it is
here. A reader clamps each of the three to 0.05 to 6 m and says so in its
repairs, since a table nothing wide has no top. They are made of axis aligned
boxes, so they turn in quarter turns and the heading is snapped to the nearest
one wherever they are drawn or flown: a document that says 40 degrees is a
table standing at 0. A track that holds one is not published to the board until
the board knows them.

**The shape of an opening.** Every opening that ever was is a rectangle, and
a `hoop` and a `hexGate` are not. Nothing is stored for it: the shape is a
property of the `type`, so a document has no word to get wrong, and `clearW`
and `clearH` stay what they were, the size of the box the opening is inscribed
in. That is why the envelope, the rules, the build sheet and the presets read a
hoop the way they read a gate. What scores is what is left of the box: a line
through the corner of the box that holds a hoop goes past the ring and does not
count. The frame is a run of straight tubes on the outline of the shape (24 for
a hoop, 6 for a hex gate), each tube's inner surface on the edge of the hole,
and where it stands and what it is made of is worked out in
`src/props/aperture.js` from the size alone, which is the one place the game,
the room and a flight check all read. The floor is the sill, as it is under an
upright gate: a tube wholly under the floor is not built, and a frame whose
lowest tube is more than two centimetres above the floor stands on a post under
each lowest corner. A reader repairs `levels` to 1, since there is no stack of
hoops. `frameSides` and `unbuiltSides` mean nothing for either, which has no
four sides; `unbuilt` still takes the frame away and leaves the opening. A
track that holds one is not published to the board until the board knows them.

**A cube.** RaceGOW's cube is twelve pipes and eight corners with a gate in
each face, flown in at one face and out at another. It is stored as what it
is made of: five ordinary `gate` elements, six when it is lifted a half
opening and a pipe off the floor, that share a `group`. The front and the back
keep all four sides. The left and the right have `unbuiltSides` of `left` and
`right`, because their uprights are the front's and the back's. The top, and
the bottom when there is one, are flat (`pitch` a quarter turn) and `unbuilt`,
because a flat face is a gap in the lattice: the twelve edges are all pipe
already. A new cube is flown straight through, in at the back and out at the
front, the way the front faces; the two passes are ordinary `sequence` entries
that name two of its faces and can be changed like any others, and only the
faces the order goes through score. The layout is worked out in
`src/trackbuilder/cube.js` from the opening, the pipe and the lift alone, so
the document holds no word for a cube of its own.

**A letter.** The WA State Champs have a W on the course, built of pipe, and the gate is the gap between its two Vs.
A `letter` is that in general: every capital from A to Z, each a run of straight tubes (the way a person builds a letter
of PVC, with a chamfer where a curve would be) and one to three gaps, each of which scores like a gate. It is one
element of the five inch palette, with the five numbers every opening has, and a word, `letter`, that says which
capital it is. Nothing about the shape is in the document: the design of each capital is `src/props/letters.js`, the
copy of record, and the builder, the game, the plan card and the board all ask it.

- **The size is the primary gap's.** `clearW` and `clearH` are the size of the letter's PRIMARY gap, measured box
  axis to axis, which is the one a new pass goes through and the one a letter is sized by, and the rest of the
  letter is drawn round it in the proportions of the design, so that every reader that reads those two numbers and
  nothing else (the envelope, the rules, the cards, the board) reads a letter as it reads a gate. A W is built with
  a gap 2.45 m wide on the ground and 3.15 m to the point, which makes the letter 4.9 m wide and 3.5 m tall, and
  every capital is 3.5 m tall at the size it starts at. Each axis scales on its own, so a letter can be made narrower
  or taller than the type draws it, and the builder offers a width and a height and works out the two numbers.
- **The pipe** is 2 inch, 2.375 in across the outside (`LETTER_TUBE_OD` in `src/units.js`), a size of its own and not
  the gate's one inch. It is solid, and a letter is built at the same obstacle scale a gate is, so what the pilot flies
  is a little bigger than the builder draws, as it is for a gate. A letter stands on the ground: a foot is lifted by
  one radius so the tube rests on the floor and is not half in it.
- **Where it stands.** `position` is the middle of the primary gap's width, on the ground. The letter's own frame has
  x across it, which is the pilot's RIGHT as they fly along the piece's normal, so a letter reads the right way round
  from the side it is flown in from when the pass's `entry` is 1; the document's `widthAxis` is the pilot's left from
  there, and the builder draws the letter mirrored to match. The game builds a letter facing its first pass, as it
  builds every gate, so a first pass the other way round is built turned about its axis.
- **Its gaps** are numbered from the ground up, and where two are at one height from left to right as the letter is read:
  an A has `under the bar` (0) and `counter` (1), a B `lower bowl` and `upper bowl`, a W one, `between the Vs`. A
  sequence entry's `apertureIndex` names one, and each gap that is flown is a gate of its own in the course, so
  flying both bowls of a B is two passes. The point a pass goes through is not on the middle of the piece: an N's two
  triangles stand to either side of it. A gap that is not a rectangle is scored for the shape it is, as a hoop is:
  the hole the pilot sees is the design's polygon pushed in by the pipe's radius from every side that is pipe and not
  from the ground or an open side (`insetPolygon` in `src/props/aperture.js`), and a line that stays in the pipe all
  the way through does not count, for a W's triangle or an M's notched box. The check that a pass is a pass is exact
  (`clipToPolygon`), and a gap that is not convex can be entered twice: the first stretch inside is what is credited.
- **Fixed by the type, so repaired on read:** `levels` is the capital's count of gaps whatever the document says, `sillH`
  is 0 and `pitch` is 0 with a note, and a size that is not a size is the size THAT capital starts at. A pass at a gap
  the capital has not is the last one it has. A letter on a whoop track or on a map is dropped with a note, because
  nothing on either palette builds it. `unbuiltSides`, `style` and the flags mean nothing to one and are not written.
- **Warnings.** `letter-gap` says a flown gap is narrower than 0.9 m across at its widest (a standard gate is
  1.5 m; the smallest gap any capital has at its default size is an A's, under the bar, at 1.16 m), or has nothing
  left once the pipe is round it.
- **The board** holds it as a gate: it is an opening in the flying order, so it is one of the gates a card counts,
  one of the stations the lap floor is measured to and a mark the plan draws, as the bar its pipe is from above.
  **Deploy the board before the simulator** for this, or a letter published from a new builder is counted as
  nothing by an old board.

**An invisible gate.** An opening with nothing built round it: you fly through it, it scores and lights when it is the
next one, and there is no pipe, no flag and nothing to hit. It is not an element of its own and the document holds
nothing new: it is an aperture with `unbuilt: true`, which is what a gap in a lattice already was, so the game, the
board, the card and the lap GIF already read it. The builder lays one in a click (the Invisible gate piece on the
five inch palette, key I, is a `gate` with the flag set), and takes the frame from any gate, stack or letter, or puts it
back, with Frame on the card. A flag goes with the frame, since a pennant on a mast round nothing would hang in the air,
and a piece that shares its pipe with others, a bay of a wall or a face of a cube, is not offered it, because taking one
bay's frame would take the upright the next stands on. An invisible letter is its gaps alone. The sides taken away one
at a time (`unbuiltSides`) are the other spelling of a frame that is not all there, and an invisible gate is the one
that says all four.

The game builds a group whole. It builds a gate for every pass and for nothing
else, so a gate the order leaves out is on the field in the builder and not in
the world, and for a gate on its own that is the rule and stays. A face of a
group that no pass goes through is built as solid pipe with nothing to score,
nothing to light and no number (`course.loose` in `src/game/trackdoc.js`, put
up by `coursePlacements` in `src/render/scene.js`), so the sides of a cube are
there to be hit. A course whose document has no group has no such list, and
so is the object it was. A track that holds a cube is not published to the
board until the board knows a `group`: the board would keep the five gates,
lose what makes them one, and fly two faces of it.

**A wall.** Gates side by side that share their uprights, which the 5 inch palette's Wall tool
lays by dragging along the ground. It is stored as what it is made of: ordinary `gate` elements
(a `flaggedGate` where an end bay carries a pennant) that share a `group`, each in the `plain` dress,
each pinned to one heading, with `unbuiltSides` taking away, on every bay after the first, the upright
that faces the bay before it, so each post is built once. Every bay is its own opening and its own pass,
so a wall can be flown straight through or as a weave, the passes alternating. The bays stand
`GATE_SCALE * (clearW + FRAME_TUBE_OD)` apart (`wallPitchFor` in `elements.js`): the world builds a gate
that much larger than the document says and never scales a position, so that is the pitch at which the
uprights meet where the game builds them. The builder draws document sizes, so in it the bays show a gap
of about a quarter of a metre that the world does not have. The document holds no word for a wall of its
own. The board, which does not read `group`, keeps the gates and loses the grouping, which for a wall in
which every gate is flown is the same course, so the simulator publishes it. A group that has a gate no
pass goes through is a cube and is still refused.

**Round the flag.** A turn round the pennant on one of a gate's uprights that ends in the one pass through
that gate, a spiral down when it makes whole turns, is stored as what it is made of: ordinary `waypoint`
elements in the flying order straight before the pass, at most a quarter turn apart, which `addSpiral` in
`src/trackbuilder/parts.js` writes. The circle is centred on the flag where the world stands it, `GATE_SCALE`
times the document's distance out from the opening's middle (its pennant beside the sleeve, on a gate in the
full dress), with the radius that brings it back through that middle, and it turns clockwise round a flag on
the pilot's right and anticlockwise round one on the left. It starts where the line from the knot before
meets it on a tangent; a spiral's whole turns come down from 0.6 m over the header board as the world builds
it to the middle of the opening, and a turn without a spiral stays at the opening's height. The waypoints are
named `Spiral right`, `Spiral left` or `Round the flag`, which is how the builder finds the figure again (to
show it on the card, to make it again, to take it off) and how the curvature warning knows a circle a metre
from a flag is what the author asked for and does not call it a corner nothing flies; a waypoint renamed is an
ordinary waypoint again. Until 2026-10-01 the figure was a loop after the pass and a second pass back through
the gate (`addLoop`, waypoints named `Loop right` and `Loop left`), a misreading of the Nationals plan; a
document made with it reads as it did and keeps its exemption.

**A hurdle.** A `barrier`, 4 m long by 0.1 m by 1 m by default, with an optional `flagSide` (`left`, `right` or
`both`) and `dims.flagH` (the mast's height) written only when it has flags, so a barrier with none is the
bytes it was. A hurdle is not a gate and is not in the flying order; the lap goes over it by a `waypoint`
named `Over the hurdle` a metre above its top, which `placeHurdle` and the Fly order tool write.

**An up gate.** A `diveGate` with a 45 degree `pitch` and `dims.sillH` of 1.5 m, flown up through (its pass is
set, so the face rule does not make a dive gate of it).

**The shipped five inch tracks** are plain documents in `src/trackbuilder/presets5.js`, written by
`scripts/mission-preset.js`, and are handed to the library by the builder (`shipTracks` in `storage.js`) so the
simulator's own boot graph does not carry them. They list under the five inch canvas, open as a copy under a
fresh id, and carry their designer's credit.

A map also holds the freestyle assets, of two more kinds, `structure` and
`zone`, and roads and vehicles, of two more, `road` and `vehicle`; they are
listed under **Freestyle maps**.

A `groundLogo` is **paint**, which is what the `decal` kind means: it has a
footprint and a heading and nothing else. No height, so `position.z` is ignored
and the builder does not offer it; no collider, so a quad flies through where
it is; never in `sequence`, and the barrier warning pass does not test the line
against it. `dims.width` runs along the element's own heading and `dims.depth`
across it, the same reading a `barrier` gets, and the logo named by `logoId` is
FITTED inside that rectangle without cropping. A logo whose proportions do not
match the footprint paints smaller with clear turf either side, which is the
author's cue to resize the footprint rather than a reason to crop somebody's
artwork.

It is drawn on the pitch's own painted surface rather than as geometry, so it
costs no draw call and takes the cloud shadows and the cel ramp the grass
takes. It follows that a course with no pitch has nowhere to paint: the field's
own built in circuit carries no logos and none of this applies to it.

**A ground logo is dressing, not layout.** It is filtered out of the layout
fingerprint in `src/share/listing.js` and out of the matching `layoutHash` on
the board, so selling a sponsor a place on a course people have already flown
does not clear the times on it.

A `waypoint` is the one element that is **not a thing standing on the field**.
It says only that the lap passes through this point, at this height, and it is
a marker so that the rule above gives it what it needs: the knot lands at
`position + clearance * side`, and its clearance is zero, so the knot is the
point itself and the tangent comes from the run of the course. It is drawn in
the builder so an author can grab it, and nothing is built for it on the race
field. It exists because imported courses need it: Velocidrone lets an author
drop an invisible trigger volume in open air to pin the racing line where there
is no gate, and a course that reads one of those as a gate puts obstacles on
the field that are not on the real track.

**A waypoint can point.** When its `yawOverridden` is true the racing line takes its tangent from
its `yaw` and its `pitch` together, `(cos pitch * cos yaw, cos pitch * sin yaw, sin pitch)`, where it
used to take it level, so a run of waypoints follows a vertical loop up, over and down. A waypoint
that never set its pitch has pitch 0 and is the level tangent it always was. `pitch` has always been a
field of every element and is clamped to a quarter turn either way.

**A figure between two pieces.** The manoeuvres of the owner's catalogue of 2026-10-02 (straight with
a leaning exit, hop and dip, turn, climbing turn, descending turn, split-S, reverse split-S, power
loop, corkscrew, dive, launch, slalom, figure 8, Matty flip) are not elements and are not in the
document under their own name. A figure is a run of ordinary `waypoint` elements in the flying order,
each pointing the way the line goes through it, named by a closed grammar the builder reads back to
find the figure again: `Turn left 180`, `Climbing turn right 360, wide`, `Corkscrew left up`,
`Slalom right x4`, `Exit left`, `Hop`, `Dip`, `Power loop`, with `, tight` or `, wide` for a size and
`, back through` or `, back through reversed` where the piece it belongs to is flown a second time
as its own entry in the sequence (an orbit round a flagged leg, a turnaround, a power loop gate). A
figure after a pass, before it, or round a flag stands in the slot of waypoints between two passes;
`src/trackbuilder/manoeuvres.js` is the geometry and `src/trackbuilder/flightpaths.js` lays and reads
them. A waypoint renamed is an ordinary waypoint again, and the board, which keeps names, keeps the
figures. Their curvature is exempt from `tight-corner`, and `figure-exit` and `figure-entry` warn
when a figure ends facing away from the next piece or starts facing back at the last.

**A section.** The Section tool (`src/trackbuilder/runs.js`) lays a straight, a sweeper, a hairpin, a
chicane, esses, a step sequence, a flag slalom or a Dutch 8 as ordinary gates or flags in the flying
order in one step, and leaves nothing in the document that says it did.

**The hurdle family.** A `barrier` is the board of a hurdle (the plan's 4 m by 1 m, MultiGP's 10 by 5
ft, an h-hurdle, which is a flag mast 10 ft tall on one end, or a super hurdle twice the standard
one), and a `horizontalPole` at 5 ft, 10 ft wide, is a bar hurdle. The lap goes over (or, for a bar,
under) by a `waypoint` named `Over the hurdle`, `Skim the hurdle`, `Under the bar` and so on, put at the
height the name says; a gate the lap hops over is the same, named `Over the gate`.

**A launch gate** is a `diveGate` at its default horizontal pitch with its pass set upward, and two
waypoints named `Pull up` before it and `Push over` after it, which are quarter circles and are exempt
from `tight-corner` like a figure.

Exactly one `startPads` element may exist. A second one is dropped on read.

The defaults for every one of these live in exactly one place,
`src/trackbuilder/elements.js`, and they are approximations of the MultiGP
obstacle standards, each carrying a comment naming what still has to be
verified against multigp.com. A document stores the dimensions it was authored
with, so changing a default never resizes a track somebody already built.

### How an aperture element becomes openings

An aperture element describes a stack of identical openings with five numbers.
Opening `i`, counting from zero at the bottom:

```
sill_i    = sillH + i * levelPitch          bottom of the opening
centre_i  = sill_i + clearH / 2             height of its centre above the base
```

so the opening's **world centre** is

```
{ x: position.x,  y: position.y,  z: position.z + centre_i }
```

and the tilt rotates the opening about that centre. The opening's plane has an
orthonormal frame, for every yaw and every pitch including a flat one:

```
normal      = ( cos(pitch)cos(yaw),  cos(pitch)sin(yaw),  sin(pitch) )
widthAxis   = ( -sin(yaw),           cos(yaw),            0          )
heightAxis  = normal x widthAxis
```

`clearW` runs along `widthAxis` and `clearH` along `heightAxis`. For a vertical
gate `heightAxis` is straight up, which is why a gate's projection onto the
ground is a bar and a flat dive gate's is a rectangle.

---

## Freestyle maps

A document with `"mode": "freestyle"` is a **map**: a place to fly, built
from the drawn assets in `src/props/`, with no flying order through it. The
simulator flies it as a freestyle map in the town's art style
(`src/maps/built/`), and every solid part of every asset is solid in the air.

* A map is always `trackClass: "full"`, flown on the five inch. Freestyle is
  not offered on the whoop.
* A new map's field is a **160 by 160 m plot** with a one metre grid, and the
  author can resize it.
* It has **its own autosave seat**, `webfpv.trackbuilder.autosave.freestyle.v1`,
  so a map in progress and a race track in progress never overwrite each
  other. The builder remembers which of its three canvases (5 inch, Whoop,
  Freestyle) was last open in `webfpv.trackbuilder.canvas.v1`.
  `?mode=freestyle` in the builder's address opens the map and `?mode=race`
  the race canvas, and the builder takes `?mode=` out of the address once it
  has read it, so a reload opens whatever the author switched to since.
* It has **a scene**, a time of day and a ground, below.
* **Nothing on a map is in `sequence`.** The builder never adds to it, and a
  gate placed on a map is furniture: solid, drawn in the town's palette, and
  flown through for style. `settings` is written and means nothing on a map.
* The race warnings do not apply to a map. It has its own, below.

### The scene

A map's time of day and its ground, the two things that change its mood
more than any single asset does. Chosen on the builder's Map panel and
drawn by the simulator (`src/maps/built/looks.js`); the builder's 3D view
follows both.

```jsonc
"scene": { "time": "dusk", "ground": "tarmac" }
```

| field | values | meaning |
| --- | --- | --- |
| `time` | `"golden"`, `"noon"`, `"dusk"`, `"overcast"` | The light. `golden` is golden hour, the town's own. `noon` is a high clear sun. `dusk` is the sun on the horizon, a violet sky, and the town lit: a share of the building windows glow, and the street lamps, billboards and vending machines light the ground round them. `overcast` is a flat grey violet day with soft shadows. |
| `ground` | `"concrete"`, `"tarmac"`, `"grass"`, `"dirt"` | What the plot is paved with. `concrete` is a yard of sawn slabs, `tarmac` a dark car park with painted bays and arrows, `grass` a lawn inside the kerb, `dirt` a worked earth yard with tyre ruts. |

**Defaults, and when it is written.** `golden` and `concrete`, which is what
every map looked like before the block existed. `toPlain` writes the block
only when a map has chosen something else, so a map saved before scenes
existed, and the starter, keep their bytes. An unknown value reads as its
default, one key at a time, with a repair note; a block that is not an
object reads as the default with a note. Only a map carries it: `normalize`
drops it from a race track, so no race track's bytes changed.

**It changes no physics.** Time and ground are paint and light. The ground
is flat at zero whatever it is drawn as, and no solid moves.

### The kinds a map adds

| kind | what it is |
| --- | --- |
| `structure` | A freestyle asset: a building, a crane, a tree. Solid, never in `sequence`, drawn and made solid from one list of parts. Only a map's palette offers them. |
| `zone` | A **named gap**: a scoring window in the air, like a skate game's. Not solid, not drawn in the world, never in `sequence`. |
| `road` | A **road**: control nodes eased into a curve a car can drive, painted on the ground. Not solid, never in `sequence`. See **Roads and vehicles**. |
| `vehicle` | A **vehicle** driving a road, moved by the physics itself. Solid, but a mover: never one of the map's static solids, never in `sequence`. See **Roads and vehicles**. |

An element of either kind is an ordinary element: `id`, `type`, `name`,
`position`, `yaw`, `pitch` (written `0`), `yawOverridden` and `dims`, plus
`style` for an asset that has looks and `points` for a named gap.

```jsonc
{
  "id": "el-4",
  "type": "building",
  "name": "Office",
  "position": { "x": 44, "y": 20, "z": 0 },
  "yaw": 1.570796,
  "pitch": 0,
  "yawOverridden": true,
  "dims": { "width": 16, "depth": 14, "floors": 6, "passage": 0, "variant": 1 },
  "style": "office"
}
```

### The assets

Generated from `src/props/types.js`, which is the only place any of these is
written down; `node src/trackbuilder/selftest.js` checks every row against
it. Each dimension is shown as its default and its limits. A length is in
metres, a count is a whole number, a fraction runs from 0 to 1 and a scale
multiplies the asset's natural size. Every dimension is **clamped into its
limits** on read and on write, which is what keeps a hand edited ninety storey
warehouse out of the physics. `variant` is a seed, not a quantity: it rolls a
different wreck, advert or colour.

| `type` | key | palette group | turns | `style` | `dims`: default [min, max] |
| --- | --- | --- | --- | --- | --- |
| `building` | 1 | Buildings | quarter | `flats` `office` `warehouse` `shop` | `width` 16 m [4, 80], `depth` 9 m [4, 60], `floors` 4 [1, 30] count, `passage` 0 m [0, 20], `variant` 1 [1, 99] count |
| `bando` | 3 | Buildings | quarter |  | `width` 24 m [8, 80], `depth` 18 m [8, 60], `floors` 3 [1, 8] count, `ruin` 0.5 [0, 1] fraction, `variant` 1 [1, 99] count |
| `crane` | 4 | Industrial | any |  | `height` 30 m [10, 80], `jib` 36 m [12, 70], `counterJib` 11 m [6, 24], `hook` 12 m [2, 70], `trolley` 0.6 [0.15, 0.95] fraction |
| `waterTower` | 5 | Industrial | any |  | `height` 16 m [6, 40], `radius` 3.6 m [1.5, 7], `tank` 0.8 m [0, 10] |
| `mast` | 6 | Industrial | any |  | `height` 32 m [8, 90], `width` 1.8 m [1, 4] |
| `chimney` | 7 | Industrial | any |  | `height` 24 m [6, 80], `radius` 1.3 m [0.5, 5] |
| `hollowChimney` | none | Industrial | any |  | `height` 30 m [8, 80], `radius` 3 m [2.4, 7], `door` 2.8 m [1.6, 8] |
| `pylon` | Y | Industrial | any |  | `height` 28 m [12, 60] |
| `turbine` | none | Industrial | any |  | `height` 48 m [15, 100], `blade` 28 m [6, 60], `spin` 0 [0, 1] fraction |
| `windmill` | none | Industrial | quarter |  | `height` 14 m [8, 30], `sail` 10 m [4, 16], `speed` 12 [0, 30] count, `spin` 0 [0, 1] fraction |
| `containers` | 8 | Industrial | quarter | `40ft` `20ft` `40ft open` | `stack` 2 [1, 5] count, `variant` 1 [1, 99] count |
| `scaffold` | K | Industrial | quarter | `open` `netted` | `width` 10 m [2.5, 40], `height` 10 m [2, 40], `depth` 1.55 m [1.55, 2.5] |
| `bridge` | 9 | Street | quarter | `road` `footbridge` | `span` 24 m [6, 80], `width` 8 m [2, 20], `height` 6 m [3, 20], `piers` 1 [0, 6] count |
| `billboard` | 0 | Street | any |  | `width` 8 m [2, 20], `height` 3.2 m [1.2, 8], `lift` 5 m [1.5, 30], `variant` 1 [1, 99] count |
| `utilityPole` | none | Street | any |  | `height` 10 m [5, 16] |
| `lamp` | W | Street | any |  | `height` 7 m [3, 12] |
| `vending` | none | Street | quarter |  | `count` 2 [1, 4] count, `variant` 1 [1, 99] count |
| `car` | none | Street | quarter | `kei` `keivan` `hatch` `sedan` `wagon` `minivan` `van` `boxtruck` `minibus` `r32` `e82` | `variant` 1 [1, 99] count |
| `rail` | N | Skate | any |  | `length` 6 m [1.5, 30], `height` 0.7 m [0.3, 3] |
| `ledge` | M | Skate | quarter |  | `length` 6 m [1, 30], `height` 0.5 m [0.2, 2], `depth` 0.9 m [0.3, 4] |
| `stairs` | H | Skate | quarter |  | `steps` 7 [2, 24] count, `width` 4 m [1.2, 12], `landing` 3 m [0.8, 12] |
| `quarterPipe` | I | Skate | quarter |  | `height` 2.4 m [0.8, 5], `width` 6 m [2, 20], `deck` 1.4 m [0.6, 6] |
| `tree` | T | Nature | any | `sakura` `street` `pine` | `size` 1x [0.5, 3] scale, `variant` 1 [1, 99] count |
| `gap` | J | Scoring | any |  | `width` 4 m [1, 40], `height` 3 m [1, 40] |
| `balloonChase` | none | Scoring | any |  | `radius` 80 m [30, 200], `height` 14 m [8, 40], `speed` 1x [0.5, 1.5] scale |

The furniture a map may also hold is the builder's own: `gate`,
`flaggedGate`, `doubleStack`, `ladder`, `diveGate`, `barrier`,
`horizontalPole`, `flag`, `cone` and `pole`, with the keys and dims in the
element table above, and the extras `startPads`, `label` and `groundLogo`.

**A style has a starting size.** A warehouse is low and wide and a shop is a
narrow front, so choosing a building's style also sets its size: `flats` 16
by 9 m and 4 floors, `office` 16 by 14 m and 6, `warehouse` 26 by 18 m and
2, `shop` 8 by 11 m and 3 (`STYLE_DIMS` in `src/props/types.js`). A new
building starts at its first style's size.

### Headings

`turns` in the table is the heading rule, and it comes from the physics.
The world holds two shapes, boxes that cannot turn and capsules that can
(`FREESTYLE-MAPS-PLAN.md`, section 1).

* `any`: built of capsules only, so it faces any heading. The builder's
  rotate handle snaps to 15 degrees and Alt turns it freely.
* `quarter`: it has boxes, so it keeps to the four compass headings until
  the physics learns turned boxes. The builder snaps its `yaw` to a quarter
  turn on the handle, on Q and E and in the inspector, and the simulator
  places it at the nearest quarter turn whatever the file says
  (`placedYaw` in `src/props/solids.js`), so the drawing and the solids
  always agree.

### Standing on end

The containers and the ledge can stand on one end, so a container is as tall as
it is long: a shaft to dive down when it is the open style. It is the
element's `pitch`, read to the **nearest quarter turn** (`tiltOf` in
`src/props/types.js`): `0` is upright, `1.570796` (90 degrees) and `-1.570796`
are on end, the two ways round, and what is between is read as the nearer, so
the document holds the pitch that is built and the builder writes `0` or a
quarter. Any other asset ignores its `pitch`, as it always did.

The world holds axis aligned boxes, and a box turned a quarter about a
horizontal axis is one, with two of its extents swapped, so this needs nothing
of the physics. The turn is about the asset's own right axis (`+z`), so a
positive quarter raises the end it faces (a container's door end), and the
asset is **set back on its base** and **centred along its heading**: its lowest
point is on `position.z`, and the middle of what it covers is its origin, not
the end of a stack that used to be up. `tiltMeasure` and `tiltParts` in
`src/props/solids.js` are the one answer, read by the solids (`placedPartsOf`
in `src/props/catalog.js`) and by the drawing (the kit turns everything an
asset paints with the same turn and offsets), so they cannot disagree. A stack
of containers lies beside itself on end, and the offset of each along its
length, up to 0.35 m, is now up and down.

The `pitch` rule for a heading is the one for `yaw`: an asset with boxes keeps
to the compass, and `turns` above still says so. Standing on end composes with
it, and with a negative `z`: a container stood on end and sunk 2 m has its
foot 2 m under the ground.

### A chimney to fly down, and a turbine that stands still

Two assets a map builder asked for (bug-e605ff6a), both built of capsules, so
both face any heading.

**`hollowChimney`** is a brick stack with its bore open from the rim to the
ground and a doorway in its foot on the side it faces (its heading, `+x`), so
a pilot dives in over the rim and out through the door. `radius` is the
OUTER radius at the base, from 2.4 m up, so the bore at the rim is never under
2.4 m across; the wall is 45 cm thick on the smallest stack and 80 cm on the
biggest. `door` is the clear width of the doorway at the top of the door,
where the wall has leaned in furthest, and the door is half as high again as
it is wide, within 3.2 m and half the stack. A doorway is never wider than one
and a quarter base radii, so `door` is held to `1.25 * radius` wherever
dimensions are held to their limits (the file's reader and writer and the
builder's field), and a larger one is read as that; the layout would stop it at
75 degrees either side of the heading in any case. The wall is a ring of
leaning capsules, 54 to 120 of them, with the groove between two never over
4 cm.

**`turbine`** is a tapering tower, a nacelle and hub, and three blades,
parked: the rotor faces the heading and does not turn, because the physics
holds a world that does not move. `spin` sets where the blades stand, as a
fraction of the third of a turn the rotor has (0 has one blade straight up, 0.5
has one straight down, 1 is 0 again). `height` is the hub's, and `blade` is
held to what that leaves it: the lowest blade tip hangs at least 2.5 m over the
ground. The rotor stands ahead of the tower far enough that a blade hanging
straight down clears the tower by the gap rule's 1.4 m.

### A windmill whose sails turn

The owner's ask of 16 October 2026, "windmill with rotating blades".
**`windmill`** is a white tower mill with a dark cap and four sails on two
stocks, a canvas sail on a red lattice behind each stock and a narrow board
ahead of it, turning anticlockwise as you face them. The sails face the
heading. `height` is the hub's; `sail` is a sail's length from the hub, held
to what the height leaves it so the lowest sail tip hangs at least 2 m over
the windmill's foot; `speed` is turns a minute, 0 for sails that stand still;
`spin` is where they stand at the start of the lap clock, as a fraction of
the quarter turn four sails have. The sails stand off the tower so the lowest
clears it by more than the gap rule's 1.4 m.

The tower, cap, windshaft and hub are solids like any asset's. The sails are
NOT parts, because a part does not move: they are drawn as a group the map
turns (`PropKit.turning` in `src/props/kit.js`, `mountTurning` in
`src/maps/built/index.js`), and made solid by the shell every step of the
physics, as the town's train is, from the same angle the drawing reads, a
pure function of the step count (`src/props/windmill.js`). Clipping a sail is
a hit like clipping a wall. The layout lists the disc they turn through as a
part that is neither solid nor drawn (`sweep`), so the plan shows it and the
`fs-sails` warning sees anything standing in it. A windmill takes the top 32
of the physics' 64 moving box slots for its sails, so a map with one drives at
most 32 cars. Its heading is a quarter turn, because the sails' boxes keep to
the compass.

### A balloon chase

The owner's ask of 17 October 2026, "the balloon chase should be an element i
can add into a map that i'm building rather than a menu option".
**`balloonChase`** puts a light plane over the map that flies clean lines and
streams balloons behind it to pop: ninety second rounds that start at the
first moment flown, every ninth balloon gold and worth three, and the best
score kept in the browser per map. The plane flies round the piece's
`position` out to `radius`, never lower than `height` over the ground and
higher wherever something stands in its way: it reads the map's solids once
when the map is flown and keeps 7 m over them. `speed` scales its 11 to 25 m/s.

Nothing of it is solid and nothing of it reaches the physics: the plane, the
balloons and their pops are drawn and judged by the shell
(`src/game/balloons.js`, `src/render/balloons.js`). The layout is one part
that is neither solid nor drawn (`sweep`), a 6 m square, so the plan shows
where it stands and the pick box holds it. A map flies the first
`balloonChase` it holds; a second one is not flown and `fs-balloons` says so.
A map without one loads no part of the game.

### An asset's own frame

Every asset is laid out in its own frame (`src/props/parts.js`): `+x` is its
heading, the way it faces and the way a crane's jib points; `+y` is up; `+z`
is its right, seen facing `+x`. On the plan a local point `(x, z)` lands at

```
position + x * ( cos yaw, sin yaw ) + z * ( sin yaw, -cos yaw )
```

which is `x` along the heading and `z` to the right of it. In the simulator
the document is placed once, by `placeDocument` in
`src/maps/built/place.js`, as Three.js world metres with the origin in the
middle of the plot:

```
worldX =  x - width / 2
worldZ = -(y - depth / 2)
worldY =  z
```

### Named gaps

A `gap` element is a window in the air. It stands at `position`, its
`dims.width` runs **across its heading** and its `dims.height` runs **up from
`position.z`**, so a pilot flies through it along its heading, and its
`name` is what it is called when it is flown, "UNDER THE BRIDGE". A new gap
is named `GAP` and worth 250. It has no parts: nothing is solid and nothing
is drawn in the world.

### Roads and vehicles

Cars drive on maps and nowhere else (`FREESTYLE-MAPS-PLAN.md`, decision 9):
`normalize` drops a road or a vehicle from a race track with a repair note,
and `toPlain` never writes one there, so no race track's bytes changed when
they arrived. A map's palette offers both under **Roads and vehicles**, with
no hotkey: the Road tool lays a road a node a click (on its first node to
close it, on its last or with Enter to leave it open), and a Vehicle clicked
on or beside a road goes on it at the nearest point of its centre line,
which sets its `road` and `dims.offset`. The builder keeps a road's first
node at its `position` (moving or deleting that node moves the position),
but reads any road as it is.

A **road**:

```jsonc
{
  "id": "el-53",
  "type": "road",
  "name": "Yard loop",
  "position": { "x": 140, "y": 139, "z": 0 },
  "yaw": 0,
  "pitch": 0,
  "yawOverridden": false,
  "dims": { "width": 6, "lanes": 2, "radius": 12 },
  "nodes": [
    { "x": 0, "y": 0 }, { "x": 0, "y": -121 }, { "x": -20, "y": -121 },
    { "x": -20, "y": -67 }, { "x": -38.5, "y": -67 }, { "x": -38.5, "y": 0 }
  ],
  "closed": true
}
```

| field | meaning |
| --- | --- |
| `position` | Where the road is: its `nodes` are measured from here, so dragging a road moves `position` and nothing else, and no field is worked out from another. `z` is written `0`: a road lies on the ground, which is flat at zero on a map. Raised roads are not in the plan. |
| `yaw`, `pitch`, `yawOverridden` | Written `0`, `0` and `false`, never read. A road is turned by moving its nodes. |
| `nodes` | The control points, `{ "x", "y" }` metres from `position`, in the order the road runs. At most 512; a node that is not two finite numbers within 100 km of `position` is dropped on read with a note. |
| `closed` | `true` joins the last node back to the first, which is not repeated. Default `false`. |
| `dims.width` | The road's width, 3 to 20 m, default 6. |
| `dims.lanes` | 1 or 2, default 2. On a closed road of two lanes a car keeps to its own left, a quarter of the width off the centre line: the built maps are Japanese, and Japan drives on the left. On a road of one lane, and on any open road, cars drive the centre line (below). |
| `dims.radius` | The radius the road's bends are eased to where its nodes leave room, 2 to 60 m, default 12. Where two nodes are close the bend is tighter; `src/maps/built/road.js` reports the tightest. |

**What a car drives is worked out from the nodes, never stored.**
`src/maps/built/road.js` turns the nodes into a centre line: straight along
each leg, and at each node where the road turns, a bend whose curvature
rises from zero where it leaves the straight, holds, and falls back to zero
where it meets the next straight, as a road engineer's transition curve
does, sampled a point every half metre or closer. The physics module turns
a car's velocity by the road's turn at every point it is handed, and
refuses a point that turns more than 30 degrees, so a corner drawn as one
node is never handed over as one point. A node where the road folds back
on itself, or turns too sharply for its legs to hold a bend of a metre's
radius (plus the lane's offset, on a two lane loop), is left out of the
line and named in a problem; so are nodes on top of each other.

**An open road's cars drive its centre line.** The physics turns a car
round at each end of an open road on the line it came along, so a car kept
to its left lane on the way out would come back on the wrong side. Until
the road tool has turning circles, the centre is the honest line.

A **vehicle**:

```jsonc
{
  "id": "el-54",
  "type": "vehicle",
  "name": "Drift car",
  "position": { "x": 0, "y": 0, "z": 0 },
  "yaw": 0,
  "pitch": 0,
  "yawOverridden": false,
  "dims": { "offset": 25, "speed": 20, "variant": 4 },
  "style": "hatch",
  "road": "el-53",
  "reverse": false,
  "drift": true
}
```

| field | meaning |
| --- | --- |
| `position`, `yaw`, `pitch`, `yawOverridden` | Written `0` and `false`, never read. **Where a vehicle is comes from its road and its offset and nothing else**: a second copy of where a car is would be a field worked out from another, and could disagree with it. |
| `road` | The `id` of the road it drives. A vehicle whose road is not in the document is kept: the builder says so, and the simulator leaves it parked with a problem. |
| `dims.offset` | Where it is at step 0 of the clock: metres along the road's centre line from its first node, 0 to 10,000 (round a loop, and held to an open road's end). A closed road's centre line starts at the middle of its first node's bend. |
| `dims.speed` | Its top speed on a straight, m/s, 1 to 50. A new vehicle starts at its style's: 10 to 14 m/s, a yard's traffic. It slows for bends by itself (below). |
| `dims.variant` | Its colour, as a parked car's: a seed, 1 to 99. |
| `style` | Which car: the town's `kei`, `keivan`, `hatch`, `sedan`, `wagon`, `minivan`, `van`, `boxtruck` or `minibus`, or `r32`, the drift coupe, or `e82`, the blue coupe, whose `variant` picks its livery. |
| `reverse` | `true` drives against the node order. On a two lane loop that is the other lane. Default `false`. |
| `drift` | `true` makes it the drift car: it corners twice as hard as traffic does and slides, its nose turned into each bend by up to about 44 degrees at the bend's height and straight again on the straights. Default `false`. The builder offers 20 m/s when drift is switched on. |

**How it moves is the physics' own.** A vehicle's pose is a pure function
of the simulator's step clock, worked out inside the physics module
(`src/native/world.c`, section 5) from its road, its offset, its top speed
and how hard its style corners: the speed each bend allows is worked out
once from the road's curvature, and the car brakes into it and pulls away
out of it. So a dropped frame changes nothing, the car drawn is the car
hit, and the builder's Play and the simulator drive it identically.
`src/maps/built/traffic.js` `trafficOf` is the one function that turns a
document into what the physics is handed, and says in its problems what it
left out: a vehicle with no road, more than 64 vehicles, more than 16 lanes
of road, more road than the physics' tables hold. A vehicle is solid from
the road to its roof, the drawn car's own length and width, with nothing
open under it. It is never ground: a craft cannot land on a moving car.
Nothing stops one car driving through another, so a faster car should not
share a lane with a slower one.

### Map warnings

A map is checked against the solids it will actually be built from, placed
exactly as the simulator places them. The **gap rule** is the town's: a space
between two solids is either closed or at least **1.4 m** (`GAP_MIN` in
`src/props/parts.js`), because a slot a five inch aims at and cannot fit
through is a trap, not a line.

| code | level | meaning |
| --- | --- | --- |
| `fs-no-start` | info | no start pads, so the pilot starts in the open: 8 m in from the plot's left edge, halfway up it, facing right, when that is open, and otherwise the nearest spot that is, which the note gives. Open is 1 m clear of every solid at any height, so nothing is overhead, a car's reach and 1 m off every road, and on the plot; a plot with none starts the craft at its edge, facing into it (`openSpawn` in `src/maps/built/place.js`) |
| `fs-spawn` | warn | the start is inside a solid, or within 1 m of one (what it stands on, and anything wholly under that, left out). With no start pads only when nowhere within 32 m of the plot is open |
| `fs-pads-seat` | warn | the pads' Base is more than 5 cm from what the craft's mat stands on, or the row stands across two heights |
| `fs-overlap` | warn | two elements' solids run into each other by more than a centimetre |
| `fs-slot` | warn | a space between two elements' solids wider than 5 cm and narrower than 1.4 m |
| `fs-sails` | warn | an element's solids stand in the disc a windmill's sails turn through, which `fs-overlap` cannot see because the sails are not solids |
| `fs-balloons` | warn | a second `balloonChase` on the map, which is not flown: a map flies the first one it holds |
| `fs-gap-blocked` | warn | a named gap has a solid across its window |
| `fs-outside` | warn | an element stands outside the plot, or its solids reach more than half a metre past its edge |
| `fs-buried` | warn | an asset is sunk wholly under the ground (its highest solid top is within 2 cm of the paving or under it), so nothing of it is drawn or solid |
| `fs-solids` | warn | the map has more than 20000 solids |
| `fs-crowded` | warn | two by two cells of the physics' 8 m grid hold more than the 1024 shapes it checks round a craft, so some would be left out |

A map's roads and vehicles add these, and only a map that has any
(`roadWarnings` in `src/trackbuilder/warnings.js`, the tests in
`src/trackbuilder/roadtool.js`). A road is measured by its eased centre line,
the line cars drive, and a car's reach from it is the lane's offset plus half
the widest car on the road (half its diagonal for a drift car, which slides),
or half the widest of the town's cars on a road with none.

| code | level | meaning |
| --- | --- | --- |
| `rd-solid` | warn | a road passes within a car's reach of a solid that stands lower than the tallest of its cars: a car would drive into it. A deck higher than every car is not in the way. |
| `rd-start` | warn | a road passes over the start pads, or within a car's reach and a metre of where the craft starts |
| `fs-outside` | warn | also a road whose line runs past the edge of the plot |
| `rd-tight`, `rd-fold` | warn | `src/maps/built/road.js` left a node out: it turns too sharply for its legs, or folds back |
| `rd-kink`, `rd-merged` | info | road.js ran straight past a node, or read it as the one before it |
| `rd-too-few`, `rd-crossing` | warn | a road with no line to drive, or one that crosses itself |
| `tr-no-road` | warn | a vehicle whose road is not on the map (deleted, or never given): it stays parked, drawn in a row along the south edge of the plot |
| `tr-slots`, `tr-lane`, `tr-tables`, `tr-road-unusable` | warn | a vehicle `trafficOf` left parked because the physics has no room for it, in trafficOf's own words, so the builder never quotes a different limit |
| `tr-lane-clash` | warn | two cars in one lane that will drive through each other: two on one open road, two going opposite ways round a one lane loop, or two in one lane of a loop whose laps differ and which meet within ten minutes of the clock. The lap is the physics' own, restated from `src/native/world.c`, so two cars at different top speeds whose laps match (the starter yard's box truck and kei van) are not warned about. |
| `tr-overlap` | warn | two cars that start on top of each other |

---

## `sequence`

The flying order, in order. **One entry is one opening, not one element.**

```jsonc
{
  "id": "sq-9",
  "elementId": "el-5",
  "apertureIndex": 1,
  "entry": -1,
  "passSide": null,
  "clearance": null,
  "overridden": false
}
```

| field | type | meaning |
| --- | --- | --- |
| `id` | string | `sq-` and a number. Unique within the document. |
| `elementId` | string | Which element. An entry pointing at a missing element is dropped on read. |
| `apertureIndex` | integer or null | **Aperture elements only.** Which opening of the structure, zero at the bottom. Clamped to the structure's opening count on read. `null` for a marker. |
| `entry` | +1, -1, 0 or null | **Aperture elements only.** The sign that turns the opening's normal into the direction of travel. `0` means undecided and raises a warning. `null` for a marker. |
| `passSide` | `"left"`, `"right"` or null | **Markers only.** Which side of the marker the QUAD passes on, in the frame of the direction of travel. `null` for an aperture. |
| `clearance` | number, metres, or null | **Markers only.** How far off the marker the racing line is drawn. |
| `overridden` | boolean | `true` when the AUTHOR set the face or the side by hand, which stops the tool re-deriving it. |
| `wrap` | `"left"`, `"right"`, `"over"`, or absent | **Aperture entries only, and optional.** How the line gets here from the pass before it when that was another opening of the same stack: round the pilot's left of the structure, round the right, or looping out over the front. Written only when it was said, so an entry that never said keeps its bytes and the line's default: neighbouring levels round the left, a leap between levels over the front. See **Stacked figures**. |

A structure may appear more than once. That is the point:

```jsonc
{ "id": "sq-4", "elementId": "el-5", "apertureIndex": 0, "entry":  1, ... }   // position 4, bottom opening, eastbound
{ "id": "sq-9", "elementId": "el-5", "apertureIndex": 1, "entry": -1, ... }   // position 9, middle opening, westbound
```

One ladder on the field. Two entries in the flying order. Two levels, two
opposite faces. A consumer must not assume one element is one gate.

### Stacked figures

A double stack or a triple stack is one structure and several openings. Each
opening is a pass of its own. The inspector offers named figures that write
those passes in one click:

| figure | openings, in order | faces | wrap |
| --- | --- | --- | --- |
| One opening | the chosen hole | derived, or as set | |
| Spiral up | bottom to top | the same face on every hole | round the left, or the right when it says so |
| Spiral down | top to bottom, triples only | alternating | round the left, or the right when it says so |
| Split-S | top, then bottom | opposite. On a triple the middle opening is skipped. | out over the front |
| Reverse Split-S | bottom, then top | opposite. On a triple the middle opening is skipped. | `over`, said, because two neighbouring levels would otherwise be a spiral |

The figure is not a stored field. It is detected from the consecutive sequence
entries on that element, so a track from before figures existed still loads,
and a hand edit that leaves the plan still lights the matching button. The way a
spiral turns is read the same way, off the `wrap` of the second pass: `right` or, when
there is none, left.

Placing a double stack or a triple stack writes a spiral up, so each hole is
already a gate. The inspector's How it is flown cards change that.

Between two stacked passes the racing line inserts a wrap knot off the
structure, so the spline goes around the frame instead of climbing through it.
Wrap knots are not stations. The game scores only aperture knots, and each
named opening is scored on its own: flying through one hole of a stack does
not count the others.

Barriers, labels and the start pads never appear in `sequence`. An entry that
points at one is dropped on read.

### What `entry` means, precisely

```
direction of travel through the opening = entry * normal
```

So `entry: +1` means the quad flies **along** the normal, and therefore enters
the opening from the face the normal points **away** from. `entry: -1` is the
mirror. The 3D view colours the arriving face green and the leaving face red
from exactly this.

For a flat dive gate, `pitch: +pi/2` puts the normal straight up, so
`entry: -1` is flown downward and `entry: +1` upward. The inspector says
"enter from above" and "enter from below" rather than showing the sign.

### What `passSide` means, precisely

`"left"` means the **quad** passes to the **left of the marker**, so the racing
line's knot is

```
markerPosition + clearance * left(directionOfTravel)
```

where `left(d)` is the horizontal left hand perpendicular, `z x d`. `"right"`
subtracts instead.

---

## Faces and pass sides: what the tool derives

An author should almost never have to set either. After every edit the builder
re-derives each entry from the straight line between the previous and the next
sequenced element, and writes the result into `entry`, `passSide` and the
element's `yaw`. The two `overridden` flags are the brakes.

| situation | what happens |
| --- | --- |
| aperture element referenced **once**, `yawOverridden: false` | the element is rotated so its opening lines up with the course, and `entry` is chosen with it |
| aperture element referenced **more than once** | never rotated, because rotating it for one pass would break the other. Only `entry` is chosen, from which way through the line goes |
| `yawOverridden: true` | never rotated |
| `overridden: true` on the entry | `entry` and `passSide` are left exactly as the author set them |
| a marker | put on the **outside** of the turn, which is the side a pilot flies |

A **tilted** aperture is a special case worth stating, because the obvious
implementation gets it backwards. The tilt fixes the vertical part of the
normal and nothing can change it, so the sign is decided first, from whether
the line is descending through the element, and the heading is decided second,
to make the horizontal part agree. Choosing the heading first and the sign from
a dot product turns every angled dive gate into a launch gate.

---

## Deriving the racing line

The line is **not stored in the document.** It is a pure function of it, so it
cannot go stale, and any consumer can rebuild it with the rules below.

1. Walk `sequence`. Each **aperture** contributes a knot at the opening's world
   centre with tangent `entry * normal`.
2. Each **marker** contributes a knot offset from the marker by `clearance`,
   perpendicular to the local direction of travel, on the `passSide` side. Its
   tangent is the local direction of travel, taken from the straight line
   between its neighbours, because a marker has no plane to take one from.
3. If `startPads` is placed, the lap is a circuit: a closing knot is
   appended at the first sequenced element, same position and tangent, so
   the lap joins up smoothly. The pads are where the quad sits. They are
   not a hole and they do not appear on the racing line.
4. Fit a cubic Hermite between each consecutive pair. **Both** tangents on a
   segment are scaled by `settings.tangentScale` multiplied by the straight
   line distance between that pair.
5. Sample it `settings.samplesPerSegment` times per segment. Arc length is the
   sum of the sampled polyline; curvature comes from the analytic first and
   second derivatives, not from differencing the polyline, so the reported
   radius does not move when the sample count does.

### On `tangentScale`

The exact tangent length that draws a circular arc through a turn of `theta`
is

```
m / chord = 2 tan(theta/4) / sin(theta/2)
```

which is `1.000` for a straight, `1.072` at 60 degrees, `1.172` at 90 and
`1.333` at 120. No single constant is right everywhere, and `1.1` is the middle
of the range a racing line actually turns through.

It is emphatically **not** `0.5523`. That well known figure is the offset of a
**Bezier control point**, and a Hermite tangent is three times a Bezier control
point offset. Using one for the other makes every tangent a third of its proper
length, which does not gently straighten the line: it puts a near cusp at every
knot whose tangent is not already along the chord. `selftest.js` lays five
gates on a 12 m circle and checks the line's radius comes back as 12 m, which
is the check that catches it.

---

## Warnings

Warnings are **advisory and never block a save or an export.** A course
designer laying out a deliberately brutal split-S knows more than a threshold
does. Codes, so a consumer can filter:

| code | level | meaning |
| --- | --- | --- |
| `no-face` | warn | a sequenced aperture with `entry: 0` |
| `reversal` | warn | an element's face sends the line backwards along the course |
| `tight-corner` | warn | the radius of curvature drops below `settings.minCurveRadius`, except on a five inch track between two bays of one wall and round a loop (see **A loop**) |
| `barrier` | warn | the line passes through a `barrier` element, or through the boxes a `table`, `chair` or `banner` is made of (under a table between its legs is not through it) |
| `out-of-field` | warn | the line leaves the field boundary |
| `underground` | warn | the line goes below `z = 0` |
| `unsequenced` | warn | an element that could be in the course is not |
| `element-out-of-field` | warn | an element stands outside the field |
| `coincident` | warn | two consecutive knots are in the same place |
| `figure-exit` | warn | a figure ends facing away from the next piece, so the line has to turn back on itself to reach it |
| `figure-entry` | warn | a figure is entered from a piece facing the other way, or starts heading back at the one before it |
| `over-flag` | warn | the line goes over a flag: a flag's line goes up for ever, so it is flown round and never over |
| `empty` | info | nothing in the flying order yet |
| `no-start` | info | no start pads, so the lap does not close |

These are a race track's. A freestyle map has no flying order and no line,
so none of them apply to it, and it is checked against its solids instead:
see **Map warnings** under **Freestyle maps**. A whoop track adds RaceGOW's
own rules, each with an `rg-` code, from `src/trackbuilder/racegow.js`.

The reversal test is **horizontal**. A flat dive gate is flown straight down,
so its tangent has no horizontal part and cannot point backwards along the
plan; the quad climbs past the gate and drops back through it, which is what
the obstacle is for. Testing that in three dimensions would fire on every
correctly built dive gate on every track. What catches a vertical approach
nothing could fly is `tight-corner`.

---

## Versioning

`schemaVersion` goes up when a change cannot be read by a consumer written
against the previous number: a field removed, or a field whose meaning changed.

Adding an **optional** field with a documented default is not a version bump,
and `normalize()` fills it in on read. Consumers should therefore ignore
fields they do not recognise rather than reject the document.

A document whose `schemaVersion` is **higher** than the reader understands is
read on a best effort basis with the unknown parts dropped, and the reader says
so. A document whose version is lower is migrated on read.

### 1 to 2

Version 2 replaced `branding.logo` and `branding.logoName` with
`branding.logos`, a list of up to five logos, and added the `groundLogo`
element type.

The element type alone would not have been a bump: an unknown type is dropped
on read with a repair note, which is the best effort behaviour above. Removing
the two old branding fields is the bump. The alternative was to keep writing
them as a copy of the first logo, and a `data:` URL written twice doubles the
file for the single logo case that is most of them.

A version 1 document reads without loss: `normalize()` promotes its
`branding.logo` into `logos[0]`, silently, because it is an upgrade rather than
damage. A version 1 reader handed a version 2 document reads the course
correctly and shows no branding, since `field`, `elements` and `sequence` are
untouched by this change. The two hashes that decide whether a republished
course keeps its times read only those three keys, so republishing an old
course from a new builder keeps every time on it.

The public board accepts both versions. **Deploy the board before the
simulator**, or a course published from a new builder is refused by an old
board for a version it does not know.

### 2 to 3

Version 3 added `trackClass`, when the RaceGOW micro class landed. A version 2
document has none and reads as `full`, which is what every one of them is, so
nothing that exists changed meaning. The bump is for the other direction: a
version 2 reader handed a micro document would drop the field it does not know
and draw a RaceGOW room as a sixty metre field, which is a document whose
meaning changed, and that is what a version is for.

### Frame sides are not a bump

`unbuiltSides` is an optional field on an aperture, written only when a side
is missing, with a default, all four built, that is what every gate before it
was. A reader that does not know it builds the whole frame, which is a
picture with pipe the author took away rather than a document whose meaning
changed: the openings, the flying order and the scoring are untouched.

### A letter is not a bump

`letter` is a new element type with one optional field of its own, and an invisible gate is a flag that was already
there. A reader that does not know the type drops the element on read with a repair note, which is the best effort
behaviour above, and the passes that named it with it: an older simulator flies a track with a W on it as a track with
no W, and says so, and the openings, the faces and the scoring of everything else are untouched. The layout fingerprint
hashes the elements as they stand, so adding a letter to a published track is a change of layout and clears its times,
as moving a gate would.

### A stack's wrap is not a bump

`wrap` is an optional field on a sequence entry for an aperture, written only when it was said. A
reader that does not know it flies the default wrap, left for neighbouring levels and over the front
for a leap, which is a line that goes round the other side of a stack rather than a track whose
meaning changed: the openings, the faces, the order and the scoring are untouched. The layout
fingerprint hashes the sequence as it stands, so a track with a spiral turned to the right is a
different layout from the same track turned to the left, as it should be, and every track that never
said keeps the hash it had.

### Freestyle maps are not a bump

`mode` is an optional field with a default, `race`, and it is written only on
a map, so every race track serialises to exactly the bytes it did before maps
existed and the version stays 3. A reader that does not know `mode` sees a
map as a race track with no flying order and assets of types it does not
know, which it drops with a repair note: the best effort reading above.

`scene` is the same kind of change: optional, a map's only, with a default
that is what a map without it always looked like. A reader that does not
know it draws the map at golden hour on concrete, which is a picture that
differs from the author's rather than a map whose meaning changed.

So are **roads and vehicles**: two new element types, a map's only, whose
fields are all new and all have defaults, and every existing element and
field means what it did. A reader that does not know them drops them with
a repair note, the best effort reading above, and flies the map without
its traffic, which is a map with less in it rather than one whose meaning
changed.

---

## Worked example

A ten entry course on the default 60 by 40 field. It contains everything
awkward the schema has to express:

* a **ladder flown twice**, `el-5` at sequence positions 4 and 9, on openings 0
  and 1, with opposite `entry` signs;
* an **angled dive gate**, `el-9`, tilted 55 degrees off vertical and flown
  downward through;
* a **flag turn**, `el-7`, and a **cone**, `el-2`, each with a derived pass side
  and a clearance radius;
* a **barrier** and a **label**, neither of which appears in `sequence`;
* **start pads** that mark the grid (the lap closes at the first sequenced
  element, not at the pads);
* one `yawOverridden: true`, on the ladder, because the auto rule will not
  rotate a structure that is flown twice and the author chose the heading that
  splits the difference between the two passes.

It is written at version 2, which is how it was first emitted, and it is kept
that way on purpose: it is also the check that a version 2 document still
reads. `normalize()` reads it with no repairs, fills in `trackClass: "full"`,
and writes it back at version 3 as exactly the track `--emit` prints.

Create Path on this document reports a lap of **139.79 m**, a tightest radius of
**2.59 m**, and no warnings.

Both figures moved when the cone's default clearance went from 1.0 m to the
flag's 1.5 m, because the knot a marker contributes sits at that radius and
the whole lap is measured through it. They moved again when the pads left
the racing line: the lap closes at the first sequenced element, so the
Hermite no longer detours through the grid. The document above is the
emitted default track, so it follows the defaults.

```json
{
  "schemaVersion": 2,
  "id": "trk-demo0001",
  "name": "Ladder Loop, demo",
  "createdUtc": "2026-01-01T00:00:00Z",
  "modifiedUtc": "2026-01-01T00:00:00Z",
  "field": {
    "width": 60,
    "depth": 40,
    "gridSize": 1
  },
  "settings": {
    "tangentScale": 1.1,
    "minCurveRadius": 2.5,
    "samplesPerSegment": 48
  },
  "branding": {
    "logos": []
  },
  "elements": [
    {
      "id": "el-1",
      "type": "startPads",
      "name": "Grid",
      "position": {
        "x": 16.5,
        "y": 13.5,
        "z": 0
      },
      "yaw": 3.141593,
      "pitch": 0,
      "yawOverridden": false,
      "dims": {
        "pads": 4,
        "spacing": 1.5,
        "padSize": 0.6
      }
    },
    {
      "id": "el-2",
      "type": "cone",
      "name": "West marker",
      "position": {
        "x": 7.5,
        "y": 14,
        "z": 0
      },
      "yaw": 0,
      "pitch": 0,
      "yawOverridden": false,
      "dims": {
        "height": 0.7112,
        "baseRadius": 0.1778,
        "clearance": 1.5
      }
    },
    {
      "id": "el-3",
      "type": "gate",
      "name": "",
      "position": {
        "x": 7.5,
        "y": 26,
        "z": 0
      },
      "yaw": 0.728855,
      "pitch": 0,
      "yawOverridden": false,
      "dims": {
        "levels": 1,
        "sillH": 0,
        "clearW": 1.524,
        "clearH": 1.524,
        "levelPitch": 1.557401
      }
    },
    {
      "id": "el-4",
      "type": "gate",
      "name": "",
      "position": {
        "x": 21.5,
        "y": 26.5,
        "z": 0
      },
      "yaw": -0.249979,
      "pitch": 0,
      "yawOverridden": false,
      "dims": {
        "levels": 1,
        "sillH": 0,
        "clearW": 1.524,
        "clearH": 1.524,
        "levelPitch": 1.557401
      }
    },
    {
      "id": "el-5",
      "type": "ladder",
      "name": "The ladder",
      "position": {
        "x": 31,
        "y": 20,
        "z": 0
      },
      "yaw": 0,
      "pitch": 0,
      "yawOverridden": true,
      "dims": {
        "levels": 3,
        "sillH": 0,
        "clearW": 1.524,
        "clearH": 1.524,
        "levelPitch": 1.557401
      }
    },
    {
      "id": "el-6",
      "type": "gate",
      "name": "",
      "position": {
        "x": 40.5,
        "y": 13.5,
        "z": 0
      },
      "yaw": -0.249979,
      "pitch": 0,
      "yawOverridden": false,
      "dims": {
        "levels": 1,
        "sillH": 0,
        "clearW": 1.524,
        "clearH": 1.524,
        "levelPitch": 1.557401
      }
    },
    {
      "id": "el-7",
      "type": "flag",
      "name": "Turn flag",
      "position": {
        "x": 54.5,
        "y": 14,
        "z": 0
      },
      "yaw": 0,
      "pitch": 0,
      "yawOverridden": false,
      "dims": {
        "height": 2.5,
        "poleRadius": 0.025,
        "clearance": 1.5
      }
    },
    {
      "id": "el-8",
      "type": "tower",
      "name": "",
      "position": {
        "x": 54.5,
        "y": 26,
        "z": 0
      },
      "yaw": 2.412738,
      "pitch": 0,
      "yawOverridden": false,
      "dims": {
        "levels": 2,
        "sillH": 1.524,
        "clearW": 1.524,
        "clearH": 1.524,
        "levelPitch": 1.557401
      }
    },
    {
      "id": "el-9",
      "type": "diveGate",
      "name": "",
      "position": {
        "x": 40.5,
        "y": 26.5,
        "z": 0
      },
      "yaw": 0.249979,
      "pitch": 0.959931,
      "yawOverridden": false,
      "dims": {
        "levels": 1,
        "sillH": 4.572,
        "clearW": 2.1336,
        "clearH": 1.8288,
        "levelPitch": 1.862201
      }
    },
    {
      "id": "el-10",
      "type": "gate",
      "name": "Finish approach",
      "position": {
        "x": 21.5,
        "y": 13.5,
        "z": 0
      },
      "yaw": -2.720173,
      "pitch": 0,
      "yawOverridden": false,
      "dims": {
        "levels": 1,
        "sillH": 0,
        "clearW": 1.524,
        "clearH": 1.524,
        "levelPitch": 1.557401
      }
    },
    {
      "id": "el-11",
      "type": "barrier",
      "name": "Pit fence",
      "position": {
        "x": 31,
        "y": 33,
        "z": 0
      },
      "yaw": 0,
      "pitch": 0,
      "yawOverridden": false,
      "dims": {
        "width": 8,
        "depth": 1,
        "height": 2
      }
    },
    {
      "id": "el-12",
      "type": "label",
      "name": "",
      "position": {
        "x": 31,
        "y": 30,
        "z": 0
      },
      "yaw": 0,
      "pitch": 0,
      "yawOverridden": false,
      "dims": {
        "textHeight": 0.9
      },
      "text": "Ladder low, then high"
    }
  ],
  "sequence": [
    {
      "id": "sq-1",
      "elementId": "el-2",
      "apertureIndex": null,
      "entry": null,
      "passSide": "left",
      "clearance": 1.5,
      "overridden": false
    },
    {
      "id": "sq-2",
      "elementId": "el-3",
      "apertureIndex": 0,
      "entry": 1,
      "passSide": null,
      "clearance": null,
      "overridden": false
    },
    {
      "id": "sq-3",
      "elementId": "el-4",
      "apertureIndex": 0,
      "entry": 1,
      "passSide": null,
      "clearance": null,
      "overridden": false
    },
    {
      "id": "sq-4",
      "elementId": "el-5",
      "apertureIndex": 0,
      "entry": 1,
      "passSide": null,
      "clearance": null,
      "overridden": false
    },
    {
      "id": "sq-5",
      "elementId": "el-6",
      "apertureIndex": 0,
      "entry": 1,
      "passSide": null,
      "clearance": null,
      "overridden": false
    },
    {
      "id": "sq-6",
      "elementId": "el-7",
      "apertureIndex": null,
      "entry": null,
      "passSide": "right",
      "clearance": 1.5,
      "overridden": false
    },
    {
      "id": "sq-7",
      "elementId": "el-8",
      "apertureIndex": 0,
      "entry": 1,
      "passSide": null,
      "clearance": null,
      "overridden": false
    },
    {
      "id": "sq-8",
      "elementId": "el-9",
      "apertureIndex": 0,
      "entry": -1,
      "passSide": null,
      "clearance": null,
      "overridden": false
    },
    {
      "id": "sq-9",
      "elementId": "el-5",
      "apertureIndex": 1,
      "entry": -1,
      "passSide": null,
      "clearance": null,
      "overridden": false
    },
    {
      "id": "sq-10",
      "elementId": "el-10",
      "apertureIndex": 0,
      "entry": 1,
      "passSide": null,
      "clearance": null,
      "overridden": false
    }
  ]
}
```

### Reading that example

* `el-1` is the start pads at `(16.5, 13.5)` facing due west, `yaw` = pi. They
  are the grid. The racing line starts at the cone and closes there; the pads
  do not appear on it.
* `sq-1` is the cone. No `apertureIndex`, no `entry`; it has a `passSide` of
  `"left"` and a metre of clearance, so the line is drawn a metre to the left
  of the cone in the direction of travel.
* `sq-4` and `sq-9` are the same element, `el-5`, on openings 0 and 1, with
  `entry` `+1` and `-1`. The lap crosses the ladder eastbound low and westbound
  higher. `el-5` carries `yawOverridden: true` because the tool refuses to
  rotate a structure flown more than once and the author picked the heading.
* `el-9` has `pitch: 0.959931`, which is 55 degrees, and `sq-8` has
  `entry: -1`. Tangent equals `-normal`, which points forward and down: a dive.
* `el-11` and `el-12` are in `elements` and absent from `sequence`. The barrier
  is tested against the racing line; the label is not part of the course at all.
