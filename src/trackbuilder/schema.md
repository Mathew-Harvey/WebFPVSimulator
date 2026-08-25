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

Everything below describes `schemaVersion: 1`.

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
  "schemaVersion": 2,
  "id": "trk-1a2b3c4d",
  "name": "Ladder Loop, demo",
  "createdUtc": "2026-01-01T00:00:00Z",
  "modifiedUtc": "2026-01-01T00:00:00Z",
  "field":    { ... },
  "settings": { ... },
  "branding": { ... },
  "elements": [ ... ],
  "sequence": [ ... ]
}
```

| field | type | meaning |
| --- | --- | --- |
| `schemaVersion` | integer | The version of THIS document. `2` today. A consumer seeing a HIGHER number reads on a best effort basis, drops what it does not recognise and says so, which is what `normalize()` does and what the Versioning section below states. |
| `id` | string | Stable identity of the track, `trk-` followed by eight hex digits. Used as the key in local storage. Two identical tracks are still two tracks, so this is not derived from the contents. |
| `name` | string | What the author calls it. Not unique, not an identifier. |
| `createdUtc` | string | ISO 8601 UTC, seconds resolution, when the track was first made. |
| `modifiedUtc` | string | Same format, last edit. The Load list sorts on this. |
| `field` | object | The ground the course stands on. |
| `settings` | object | Per track tuning for the derived racing line. |
| `branding` | object | The sponsors' logos the course is dressed in. Optional; see below. |
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
`model.js`, and both the race field and the builder's own 3D preview read it
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
| `position` | object | Where the element's **base** sits: `x` and `y` on the ground, `z` the height of the base above the ground. Almost always `z: 0`; the 3D view's one editing gesture raises it. |
| `yaw` | number, radians | Which way the element faces. See the conventions above. |
| `pitch` | number, radians | Tilt of the aperture plane. Meaningful only for aperture elements; written as `0` for everything else. |
| `yawOverridden` | boolean | `true` when the AUTHOR set the heading, which stops the tool re-deriving it. See **Faces and pass sides**. |
| `dims` | object | Dimensions, in metres, whose keys depend on `type`. Always complete: a missing key is filled from the default on read. |
| `text` | string | **Labels only.** The text drawn on the field. |
| `flagSide` | `"left"`, `"right"` or `"both"` | **Flagged gates and flagged doubles only.** Which end of the top header the pennant sits on, as seen facing the gate. Default `left`. Not a dimension. |
| `logoId` | string | **Ground logos only.** The `id` of the entry in `branding.logos` this footprint is painted with. Empty means the course's first logo. Not a dimension. |

### The element types

Each row's `kind` decides everything the tool does with it.

| `type` | key | kind | in the course? | `dims` keys |
| --- | --- | --- | --- | --- |
| `gate` | G | aperture | yes, once per opening | `levels sillH clearW clearH levelPitch` |
| `flaggedGate` | A | aperture | yes, once per opening | same. A 5x5 with a pennant on the header. `flagSide` chooses left, right or both. The palette calls it Flagged gate. |
| `doubleStack` | 2 | aperture | yes, once per opening | same |
| `flaggedDoubleStack` | H | aperture | yes, once per opening | same. A two hole 5x5 with a pennant on the top header. `flagSide` chooses left, right or both. The palette calls it Flagged double. |
| `ladder` | R | aperture | yes, once per opening | same. Three stacked 5x5s. The palette calls it Triple stack. |
| `tower` | T | aperture | yes, once per opening | same |
| `diveGate` | D | aperture | yes, once per opening | same |
| `barrier` | B | obstacle | **never** | `width depth height` |
| `flag` | F | marker | yes, with a pass side | `height poleRadius clearance` |
| `cone` | C | marker | yes, with a pass side | `height baseRadius clearance` |
| `waypoint` | W | marker | yes, at zero clearance | `height poleRadius clearance` |
| `startPads` | S | start | **never**, it is the line itself | `pads spacing padSize` |
| `label` | L | annotation | **never** | `textHeight` |
| `groundLogo` | O | decal | **never** | `width depth` |

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

| figure | openings, in order | faces |
| --- | --- | --- |
| One opening | the chosen hole | derived, or as set |
| Spiral up | bottom to top | the same face on every hole, wrapping around the stack |
| Spiral down | top to bottom, triples only | alternating, wrapping around the stack |
| Split-S | top, then bottom | opposite. On a triple the middle opening is skipped. |

The figure is not a stored field. It is detected from the consecutive sequence
entries on that element, so a track from before figures existed still loads,
and a hand edit that leaves the plan still lights the matching button.

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
3. If `startPads` is placed, a knot goes first at the pads with tangent along
   the pads' `yaw`, and a closing knot goes last at the same position with the
   same tangent, so the lap joins up smoothly instead of arriving sideways.
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
| `tight-corner` | warn | the radius of curvature drops below `settings.minCurveRadius` |
| `barrier` | warn | the line passes through a `barrier` element |
| `out-of-field` | warn | the line leaves the field boundary |
| `underground` | warn | the line goes below `z = 0` |
| `unsequenced` | warn | an element that could be in the course is not |
| `element-out-of-field` | warn | an element stands outside the field |
| `coincident` | warn | two consecutive knots are in the same place |
| `empty` | info | nothing in the flying order yet |
| `no-start` | info | no start pads, so the lap does not close |

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
* **start pads** that close the lap;
* one `yawOverridden: true`, on the ladder, because the auto rule will not
  rotate a structure that is flown twice and the author chose the heading that
  splits the difference between the two passes.

Create Path on this document reports a lap of **139.7 m**, a tightest radius of
**2.68 m**, and no warnings.

Both figures moved when the cone's default clearance went from 1.0 m to the
flag's 1.5 m, because the knot a marker contributes sits at that radius and
the whole lap is measured through it. The document above is the emitted
default track, so it follows the defaults.

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

* `el-1` is the start pads at `(16.5, 13.5)` facing due west, `yaw` = pi. The
  lap leaves along that heading and comes back to it, which is why the finish
  is smooth rather than a hook.
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
