# Turning a supplied track animation into a track in the game

RaceGOW publishes each of its tracks as one looping animation of one lap.
This is how that animation becomes a playable track in this simulator, end
to end, with the traps named. It was written after Tracks 8 and 5 were built
this way, and both are in `src/trackbuilder/presets.js` now.

It replaces two earlier documents. `TRACK-FROM-ANIMATION.md` concluded the
job could not be done from a render, which was true of the method it tried
and false of the method below. `TRACKGIF-PLAN.md` was the build spec for the
exporter, which shipped, and a spec for finished code is an invitation to
build it twice.

**The one idea.** A RaceGOW track is built from one length of pipe, 27
inches, and right angle fittings. So the track is a lattice: every gate is a
27 inch square, standing square to one of two axes or lying flat, and every
distance is a whole number of 27 inch units. That turns reading the
animation from an inverse problem, which does not converge, into counting,
which does. Do not start until you know the pipe length for the series you
are reading. Everything below rests on it.

## What the animation is saying

Three things move and each means something exact.

- **The green panel is the opening being flown towards**, drawn filled, lit
  from the moment the quad sets off for it until it is through. It is not a
  highlight following a line.
- **The red shape is a trail of fixed duration behind the quad**, and the
  chevron on it is where the quad is now. The trail is the racing line for
  the last second or so, not the whole lap.
- **A pole is drawn as a panel the full height of the pole**, on the side the
  quad passes. That is the pole rule as a picture: past this, on this side,
  at any height. In this builder that is a `pole` marker and its scoring
  square.

Two panels in each of the two tracks read as wider than one square. That is
the illustrator saying "under this rail anywhere". Build the square the line
actually crosses.

## Step 1, decode every frame

GIF disposal method 1 means most frames are partial rectangles. Reading them
naively gives grey fragments on a background. Coalesce by seeking in order
and converting each frame whole:

```python
im = Image.open(path)
for i in range(im.n_frames):
    im.seek(i)
    yield i, im.convert('RGB')
```

Everything after this reads the coalesced frames. There are 288 of them on
Track 8 and 192 on Track 5, so hold bands of rows rather than every frame at
full size if memory is tight.

## Step 2, three composites

- **The median of every frame is a clean plate of the structure**, because
  the structure is the only thing that never moves. This is the image you
  measure the track from.
- **The maximum greenness over time is every scored opening in one image.**
- **The maximum redness over time is the whole flown path in one image.**

## Step 3, the flying order

Threshold the green channel per frame, cluster the lit region by position
and area, and order the runs by frame number. Merge runs that are
consecutive and the same cluster. What comes out is the lap as a list of
passes, and it is the most reliable thing the animation yields. Track 8 is
29 passes over 16 distinct openings. Openings recur: a RaceGOW course
doubles back through its own gates, so a naive count undercounts.

## Step 4, the camera, which is the step that makes it work

Erode the plate to leave only the mouldings, which are fatter than the pipe,
and take a fitting at each blob. Split blobs that merge by peak picking with
a minimum separation, because a cluster of fittings comes back as one blob
whose centroid is on nothing.

Now assign lattice coordinates to as many fittings as you can read by eye,
in whole units, and fit a pinhole camera to that correspondence: focal
length, position, rotation vector, least squares on reprojection error, with
the principal point pinned at the image centre.

```python
def project(params, P):
    f = params[0]
    C = params[1:4]
    R = Rotation.from_rotvec(params[4:7]).as_matrix()
    Pc = (P - C) @ R.T
    return np.stack([512 + f * Pc[:, 0] / Pc[:, 2], 512 + f * Pc[:, 1] / Pc[:, 2]], 1)
```

Seed it from several plausible eye positions and keep the best. **The
residual is the test of the whole reading.** Track 8 settled at 3.6 px rms
over 19 points and Track 5 at 5.5 px over 19. If the fit will not come below
about 10 px, the lattice assignment is wrong somewhere, not the fitter: go
back and recount. An earlier attempt that fitted the camera and the span
lengths together instead ran the focal length to ten million and reported 24
px, which is several inches of position error across a living room.

## Step 5, every pane to a square

Enumerate every lattice rectangle the track could plausibly contain, one
unit or more on a side, on all three axis planes. Project each into the
image, rasterise it, and score it against that pane's union mask by
intersection over union. Take the best.

Do not trust the top score blindly. Perspective makes a square one unit away
look much like a taller square further back, and on these two tracks three
panes had an alias within a few percent. Draw the best two or three on the
plate with the pane mask underneath and pick by eye. That overlay is five
minutes and it settled every one.

## Step 6, which way through

For each pass, take the last frame of its run, find the red pixel nearest
the pane's centre, and walk back along the trail to get the direction of
travel at that point. Sign it against the pane's outward normal projected
into the image.

Where the arrow is short or nearly edge on, crop the frames either side at
full size and look. Roughly one pass in six needed the look on these two
tracks, and one of them was read the wrong way from a contact sheet that was
too small to show the chevron.

## Step 7, write the spec

The result goes in `scripts/racegow-lattice.js` as one object. Lattice units
throughout, `origin` in inches from the room's near left corner:

- `squares`, keyed by a letter: `axis` is which axis the opening faces, `x`
  and `y` stand up and `z` lies flat, `at` is the centre in plan, `sill` is
  the height of the bottom pipe.
- `poles`: `at` is the lattice line it stands on, `side` is the way its pass
  panel faces, `beside` names the square whose centre the 14 inch pole rule
  is measured from, `height` in units.
- `rails`: a bare pipe between two lattice points that no square accounts
  for. The picture has it, so the track has it.
- `waypoints`: see step 9.
- `lap`: one token per pass, in order. A square's letter carries the sign of
  travel along its axis, `A+` or `C-`. A pole or a waypoint is its letter
  alone.

Then `node scripts/racegow-lattice.js` rewrites `src/trackbuilder/presets.js`.
That file is generated. Do not edit it, and `micro:check` fails if you do.

## Step 8, read the crossings, not the picture

The check that matters is not whether the plan view looks right. Walk the
built racing line and print every crossing of every lattice plane, with the
height and the direction:

Every scored pass should appear at its own square, at the height of that
square's centre, going the way the lap says. Anything else crossing a
lattice plane where a gate stands is the line going through the PVC. This
catches what a plan view cannot: a pass at the right place and the wrong
height reads as correct from above.

## Step 9, waypoints, and the hairpin trap

A cubic between two openings does not know about the loop the quad flies
beyond a pole, or the climb over a tower. Where the animation's line does
something the openings do not imply, pin it with a `waypoint`: a step in the
flying order that pins the line through a point, at a height, headed the way
its arrow points, and scores nothing and is drawn nowhere. Track 8 needed
six, Track 5 eight.

**Do not put both legs of a hairpin on the same line.** The first placement
on both tracks ran out and back along one axis at the same offset, and a
cubic through two knots that face opposite ways at the same place is a
needle: the tightest radius came out in millimetres. Separating the legs by
half a unit fixed it. Check the tightest radius after every waypoint move.

## Step 10, export and compare

`node scripts/trackgif.js <track.json>` writes the same kind of animation
back out, and `--camera ex,ey,ez,ax,ay,az,fov` shoots it from a fixed
viewpoint in document metres so it can be laid over the reference. The
camera fitted in step 4 converts straight into those seven numbers: the eye
is its position in lattice units times 27 inches plus the origin, and the
field of view is `2 * atan(512 / f)` in degrees.

Render at `--frames 24` first. A full 300 frame render is minutes on a
software rasteriser and a smoke render catches a broken scene in seconds.

## What this does not answer

The animation cannot tell you the pipe length, so the series rulebook or the
track owner has to. It cannot tell a 27 inch lattice from a 30 inch one,
which is why the owner's instruction beats `racegow.js`'s published nominal
spacing. Where a lit panel spans two squares it does not say which one is
the gate, and the line crossing it is the only evidence. Everything else on
these two tracks came out of the frames.

## Tooling

The analysis is ad hoc Python with Pillow, NumPy and SciPy, run outside the
repository in a scratch directory. It is deliberately not vendored: this
repository is dependency free JavaScript, and a Python toolchain carried
along for a job done twice a season would cost more than it saves. The
method above is the part worth keeping, and it is all here.
